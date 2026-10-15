// Helpdesk ticket-type flows: generation, handling, consequences and the ops that change how they play
// (macros, tags, VIP, tiers and SLAs, live chat, after-hours coverage, languages, AI scope).
// Types and their real handling: flow-types.js. Research: docs/research/support/*. Audit: docs/review/support-flows-audit.md.
//
// A "case" is a ticket whose handling matters: a refund, a dispute, an ownership transfer, a data request. The player
// chooses an action and the checks to run (a stellar operator verifies; a mediocre one answers from memory), writes
// the reply, tags it and sets the priority. The score comes from what was done: the decision vs the hidden truth,
// checks run vs checks required, a reply grounded in the ticket, and record discipline. Consequences are real:
// refunds and disputes go through core/stripe.js, bugs into Product's triage inbox, requests into Legal's DSR list,
// breaches into Insights. Every mistake is logged with logMistake (via logSupportMistake) with a traceable cost.

import { rng, chance, pick, poisson, uid, round2, money, clamp, words, isWeekend } from '../../core/util.js';
import { ensureStripe, monthlyAmount, refund, cancel, changePrice } from '../../core/stripe.js';
import { tierFromScore } from '../../core/operator.js';
import { notify } from '../../core/state.js';
import { shippedFeatures } from '../../core/market.js';
import { productSlice } from '../product/store.js';
import { CSAT_RESPONSE_RATE, replyQuality, MINUTES_PER_TICKET } from './model.js';
import { raiseBreachTask } from '../insights/raise.js';
import { TYPES, TYPE_IDS, viral, bugById, reqKey } from './flow-types.js';
import {
  ensureFlows, custOf, subOf, isLiveSub, schedule, mistake, scheduleDispute, scheduleCancel, angryReview, maybePublic, fine, supportTier, TIER_SLA, isVip, langOf, nameOf, first,
} from './flow-lib.js';
import { flowSignals } from './flowstats.js';

export { TYPES, TYPE_IDS, ensureFlows, supportTier, TIER_SLA, isVip, flowSignals, reqKey };
const R = (s) => rng(s);
const has = (h, id) => (h.checks ?? []).includes(id);
// Security reports per year for a small SaaS with a public domain: real 0-2, beg bounties and scanner dumps several [design] (S2 flow 5).
const SECURITY_REAL_PER_YEAR = 1.5, SECURITY_BEG_PER_YEAR = 8, SECURITY_SCANNER_PER_YEAR = 4;
const MAX_NEW_PER_DAY = 4; // typed cases per day (the rest of the volume stays in the routine queue) [design]
const CHAT_SHARE = { b2c: 0.25, smb: 0.15, ent: 0.05 }; // S4 §1 channel table [design]
const CHAT_TYPES = new Set(['invoice_vat', 'refund_request', 'charged_after_cancel', 'plan_change', 'payment_failed', 'lockout_2fa', 'bug_report', 'integration_issue', 'abusive_customer']);
export const CHAT = { coverageHoursPerDay: 1, minutesMult: 1.25, volumeMult: 0.15 }; // chat raises expectations and costs more time [design]
export const MT_ERROR = { machine: 0.06, machineMoney: 0.12, reviewed: 0.015, native: 0.01, glossaryMult: 0.7 }; // S4 §4: unreviewed MT mangles money/legal terms [design]
export const LANG_POLICIES = { english_only: 'English only', machine: 'Machine translation, sent as is', reviewed: 'Machine translation, reviewed before sending', native: 'Native-speaker contractor (about $12 a case)' };
export const AFTER_HOURS = { none: 'No coverage: next business morning', autoreply: 'Auto-reply with hours and a P1 keyword', pager: 'Page me for P1 only', ai_first: 'AI first reply (needs the AI agent live)' };
const MONEY_TYPES = new Set(['invoice_vat', 'refund_request', 'charged_after_cancel', 'plan_change', 'payment_failed', 'dsr', 'sla_credit']);

// ---------------------------------------------------------------- macros
const ROBOTIC = /(we value your feedback|as per our policy|valued customer|dear customer|we apologize for any inconvenience|please be advised)/i;
const FIELDS = ['first_name', 'plan', 'amount', 'date'];
export function macroQuality(m) {
  const body = String(m?.body ?? '');
  const n = words(body);
  let q = 0;
  if (n >= 25 && n <= 120) q += 0.3; else if (n >= 12) q += 0.12;
  const fields = FIELDS.filter((f) => body.includes(`{{${f}}}`));
  if (fields.length >= 1) q += 0.25;
  if (fields.length >= 2) q += 0.1;
  if (body.includes('{{first_name}}')) q += 0.1;
  if (/\b(click|go to|reply|within|by (mon|tues|wednes|thurs|fri)|settings|link)\b/i.test(body)) q += 0.2;
  if (ROBOTIC.test(body)) q -= 0.4;
  if (n < 12) q -= 0.3;
  return round2(clamp(q, 0, 1));
}
export function macroText(m, c, state) {
  const sub = subOf(state, c.subId);
  const vals = { first_name: first(c.name), plan: sub ? `${money(monthlyAmount(sub))}/mo` : '', amount: c.facts?.amount != null ? money(c.facts.amount) : '', date: `day ${state.day}` };
  const text = String(m.body).replace(/\{\{(\w+)\}\}/g, (all, k) => (k in vals && vals[k] ? vals[k] : all));
  return { text, unresolved: /\{\{\w+\}\}/.test(text) };
}
const macroUse = (state, c, T, h) => {
  const sup = state.apps.support;
  const m = (sup.macros ?? []).find((x) => x.id === h.macroId);
  if (!m) return null;
  const q = m.quality ?? macroQuality(m);
  const wrong = Boolean(m.for) && m.for !== c.type && m.for !== T.family;
  const { text, unresolved } = macroText(m, c, state);
  return { id: m.id, quality: q, wrong, unresolved, text, robotic: ROBOTIC.test(m.body) };
};

// ---------------------------------------------------------------- cases
function chosenChannel(state, sub, typeId, fl) {
  if (typeId === 'public_complaint') return 'social';
  const sup = state.apps.support;
  if (sub && sup.channels?.[sub.customerId]) return 'slack';
  if (fl.ops.chat && CHAT_TYPES.has(typeId) && chance(state, CHAT_SHARE[state.company.model])) return 'chat';
  return 'email';
}

export function openCase(state, typeId, sub, o = {}) {
  const T = TYPES[typeId];
  if (!T) throw new Error(`Unknown case type ${typeId}`);
  const fl = ensureFlows(state);
  const facts = o.facts ?? (T.gen ? T.gen(state, sub, {}) : {});
  if (facts == null) return null;
  const cust = sub ? custOf(state, sub.customerId) : null;
  const channel = o.channel ?? chosenChannel(state, sub, typeId, fl);
  const c = {
    id: uid('case'), type: typeId, family: T.family, createdDay: o.day ?? state.day, status: 'open',
    customerId: sub?.customerId ?? o.customerId ?? null, subId: sub?.id ?? null,
    name: o.name ?? cust?.name ?? 'Customer', company: cust?.company ?? o.company ?? null, email: cust?.email ?? null,
    channel, lang: o.lang ?? (sub ? langOf(state, sub.customerId) : 'en'), priority: o.priority ?? T.priority,
    tier: supportTier(sub), vip: isVip(state, sub), afterHours: o.afterHours ?? (isWeekend(state) || chance(state, 0.4)), // [design] ~40% of contacts arrive outside a solo founder's hours
    annualValue: sub ? monthlyAmount(sub) * 12 : 0, facts, tags: [], rounds: [],
    dueDay: o.dueDay ?? (channel === 'chat' ? state.day : T.expire ? state.day + T.expire : null),
    ...(o.extra ?? {}),
  };
  const txt = T.text(state, c);
  c.subject = txt.subject; c.body = txt.body;
  fl.cases.unshift(c);
  if (fl.cases.length > 260) fl.cases = fl.cases.filter((x, i) => i < 200 || ['open', 'waiting', 'linked', 'notify'].includes(x.status));
  return c;
}

const caseById = (state, id) => ensureFlows(state).cases.find((c) => c.id === id);
export { caseById };

export function rankActions(state, c) {
  const T = TYPES[c.type];
  return T.actions.map(([a]) => ({ action: a, d: T.decide(state, c, { action: a, checks: T.required(c) }).d })).sort((x, y) => y.d - x.d);
}

// Hours a handling costs. Stellar handling is not faster: verification takes minutes, which mediocre operators skip.
export function caseHours(state, c, h = {}) {
  const T = TYPES[c.type], fl = ensureFlows(state), ops = fl.ops;
  let min = T.minutes;
  const mac = h.macroId ? macroUse(state, c, T, h) : null;
  if (mac && !mac.wrong && !mac.unresolved && mac.quality >= 0.6) min *= 0.7; // good macros save ~30% (S4 §3)
  for (const [id, , m] of T.checks) if (has(h, id)) min += m;
  if (!mac) min += Math.min(8, words(String(h.text ?? '')) / 40); // writing a real reply
  if (c.channel === 'chat') min *= CHAT.minutesMult;
  if (c.lang !== 'en') min *= { english_only: 1, machine: 1.1, reviewed: 1.4, native: 0.9 }[ops.langPolicy] ?? 1;
  if (h.aiDraft) min *= 0.5;
  return round2(min / 60);
}

function hoursWaited(state, c) {
  const ops = ensureFlows(state).ops, days = state.day - c.createdDay;
  if (c.channel === 'chat') return days <= 0 ? 0.1 : days * 24;
  let base = 2.5;
  if (c.afterHours) {
    base = isWeekend(state, c.createdDay) ? 30 : 14;
    if (ops.afterHours === 'pager' && TYPES[c.type].p1) base = 1;
    if (ops.afterHours === 'ai_first' && state.apps.support?.ai?.status === 'live' && TYPES[c.type].ai.level !== 'never') base = 0.2;
  }
  return days <= 0 ? base : days * 24 + base - 2.5;
}
export const slaLimit = (c) => (TIER_SLA[c.tier]?.[c.priority] ?? 24) * (c.vip ? 0.5 : 1);

// ---------------------------------------------------------------- handling
// h: { action, checks: [ids], text, tags: [ids], priority, note, macroId }
export function handleCase(state, id, h = {}, { by = 'founder' } = {}) {
  const fl = ensureFlows(state), sup = state.apps.support;
  const c = caseById(state, id);
  if (!c) return { ok: false, error: 'No such case.' };
  if (c.status !== 'open') return { ok: false, error: `Case is ${c.status}.` };
  const T = TYPES[c.type];
  if (!T.actions.some(([a]) => a === h.action)) return { ok: false, error: 'Choose an action.' };
  c.waitedDays = state.day - c.createdDay;
  const ops = fl.ops;
  const scope = fl.aiScope[c.type];
  h = { ...h, checks: [...new Set(h.checks ?? [])].filter((x) => T.checks.some(([k]) => k === x)) };
  if (by === 'founder' && scope === 'draft') h.aiDraft = true;

  // Decision vs the hidden truth.
  const dec = T.decide(state, c, h);
  let d = dec.d, effect = dec.effect;
  const notes = [];
  // Language: English-only replies to a non-English customer; machine translation errors on money and legal text.
  let langPenalty = 0, mtError = false;
  if (c.lang !== 'en' && by === 'founder') {
    if (ops.langPolicy === 'english_only') { langPenalty = 0.15; d = Math.max(0, d - 0.1); notes.push(`Replied in English to a ${c.lang.toUpperCase()}-speaking customer: it reads, but it does not land (CSAT in that language runs lower).`); }
    else {
      const base = ops.langPolicy === 'machine' ? (MONEY_TYPES.has(c.type) ? MT_ERROR.machineMoney : MT_ERROR.machine) : ops.langPolicy === 'reviewed' ? MT_ERROR.reviewed : MT_ERROR.native;
      if (chance(state, base * (ops.glossary ? MT_ERROR.glossaryMult : 1))) { mtError = true; langPenalty = 0.3; d = Math.max(0, d - 0.3); }
    }
    if (ops.langPolicy === 'native') fine(state, 12, 'Translator (native speaker, per case)', 'contractors');
  }
  if (h.aiDraft && chance(state, T.ai.wrongP(state, c) * 0.2)) { d = Math.min(d, 0.4); notes.push('The AI draft contained an error that went out unreviewed.'); }

  // Checks.
  const req = T.required(c);
  const done = req.filter((x) => has(h, x));
  const k = req.length ? done.length / req.length : 1;
  // Reply.
  const mac = h.macroId ? macroUse(state, c, T, h) : null;
  let r;
  if (mac) {
    r = mac.wrong ? 0.1 : mac.unresolved ? 0.25 : clamp(0.45 + 0.4 * mac.quality, 0, 0.85);
    if (mac.wrong) notes.push('The macro answered a different question than the one asked.');
    if (mac.unresolved) notes.push('Unfilled merge fields ({{...}}) went out to the customer.');
    if (mac.robotic) r = Math.min(r, 0.3);
  } else {
    r = words(String(h.text ?? '')) < 8 ? 0.2 : replyQuality(h.text, T.cat, { ticketText: `${c.subject} ${c.body}`, facts: [first(c.name), c.company, ...Object.values(c.facts).filter((v) => typeof v === 'string' && v.length > 3)].filter(Boolean) });
    if (c.type === 'abusive_customer') r = clamp(r + deescalation(h.text), 0, 1);
  }
  if (c.type === 'abusive_customer' && c.facts.severity === 'heated' && h.action === 'deescalate' && !mac) r = Math.min(r, deescalation(h.text) < 0 ? 0.3 : 1);
  if (c.lang !== 'en' && ops.langPolicy === 'english_only') r *= 0.6;
  // Record discipline: tag, priority, note that survives hand-off.
  const tagOk = (h.tags ?? []).includes(T.tag);
  const prioOk = !h.priority || h.priority === c.priority;
  const a = (tagOk ? 0.4 : 0) + (prioOk && h.priority ? 0.2 : 0) + (words(String(h.note ?? '')) >= 4 ? 0.4 : 0);

  // Response time vs the SLA of the plan.
  const waited = hoursWaited(state, c), limit = slaLimit(c);
  const breached = by === 'founder' && waited > limit;
  let score = clamp(0.4 * d + 0.3 * k + 0.15 * r + 0.15 * a - (breached ? 0.05 : 0) - (c.chatMissed ? 0.05 : 0), 0, 1);
  if (by === 'ai') score = clamp(0.4 * d + 0.3 * k + 0.15 * 0.6, 0, 1);
  const tier = tierFromScore(score);

  // Hours: page cost for an after-hours P1, then the handling itself.
  let hours = by === 'ai' ? 0 : caseHours(state, c, h);
  if (by === 'founder' && c.afterHours && T.p1 && ops.afterHours === 'pager') {
    hours += 0.25; fl.stats.pages = (fl.stats.pages ?? 0) + 1;
    if (state.founder) state.founder.energy = Math.max(0, (state.founder.energy ?? 100) - 0.6); // [design] night pages wear a solo founder down
    if (fl.stats.pages % 6 === 0) mistake(state, c, 'pager_burnout', `${fl.stats.pages} after-hours pages so far. A solo founder who answers every night page spends the energy the next build week needs.`, { key: `pager:${fl.stats.pages}`, hours: 0, reputation: 0 });
  }

  const result = { score: round2(score), tier, d: round2(d), k: round2(k), r: round2(r), a: round2(a), tagOk, prioOk, effect, hours: round2(hours), waited: round2(waited), limit, breached, lang: c.lang, by, mtError, macro: mac ? { id: mac.id, quality: mac.quality, wrong: mac.wrong } : null, action: h.action, checks: h.checks, notes: [] };
  c.result = result; c.rounds.push(result);
  c.tags = h.tags ?? []; if (h.priority) c.priority = h.priority;
  c.status = 'resolved'; c.resolvedDay = state.day; c.handledBy = by;

  // Consequences.
  const out = T.apply(state, c, h, { ...result, effect });
  if (out === 'keep_open') { c.status = 'open'; c.resolvedDay = null; }
  else if (out === 'waiting') c.status = 'waiting';
  else if (c.status === 'resolved' && h.action === 'ask_info') c.status = 'waiting';
  if (mac?.wrong || (mac?.unresolved)) mistake(state, c, 'wrong_macro', `A ${mac.wrong ? 'macro for a different question' : 'macro with unfilled merge fields'} went to ${nameOf(c)}. Macro misuse is the biggest tone failure: the customer feels unheard and the ticket reopens.`, { estCost: 0, reputation: 0.2 });
  if (mtError) {
    mistake(state, c, 'mistranslation', `The machine-translated ${c.lang.toUpperCase()} reply to ${nameOf(c)} garbled ${MONEY_TYPES.has(c.type) ? 'money or date terms' : 'a key step'}. Mistranslated money terms cause chargebacks and regulator complaints; review the top macros per language with a native speaker.`, { estCost: MONEY_TYPES.has(c.type) ? 30 : 0 });
    if (MONEY_TYPES.has(c.type)) scheduleDispute(state, c, 0.2, 'misunderstood');
  }
  // SLA, CSAT, first response, reopen.
  if (by === 'founder') {
    sup.frtLog ??= []; sup.csatLog ??= [];
    sup.frtLog.push({ day: state.day, frt: waited, n: 1 });
    if (breached && c.tier === 'enterprise') slaBreach(state, c);
  }
  const pPos = clamp(0.3 + 0.6 * score - (breached ? 0.1 : 0) - langPenalty * 0.5 - (c.chatMissed ? 0.15 : 0) - (c.channel === 'chat' && waited > 1 ? 0.1 : 0) - (c.afterHours && ops.afterHours === 'none' && T.p1 ? 0.1 : 0) + (c.afterHours && ops.afterHours === 'autoreply' ? 0.04 : 0), 0.05, 0.97);
  const lt = (fl.stats.langCsat[c.lang] ??= { n: 0, pos: 0 });
  if (chance(state, clamp(CSAT_RESPONSE_RATE * 2, 0, 1))) {
    const pos = chance(state, pPos) ? 1 : 0;
    sup.csatLog.push({ day: state.day, responses: 1, positive: pos });
    lt.n++; lt.pos += pos;
    c.csat = pos ? 5 : 2;
  }
  fl.stats.resolved++;
  // Reopen: a poor reply or wrong macro brings the customer back (going in circles).
  const pRe = clamp((0.72 - score) * 0.8, 0, 0.5) + (mac?.wrong ? 0.25 : 0) + (mtError ? 0.2 : 0);
  if (c.status === 'resolved' && (c.reopenDepth ?? 0) < 2 && chance(state, pRe)) { c.pendingReopen = true; schedule(state, 2 + Math.floor(R(state) * 3), 'reopen', { caseId: c.id }); }

  result.notes = notes;
  result.feedback = feedbackFor(state, c, T, result, h);
  return { ok: true, hours, hoursCost: hours, score: result.score, tier, effect, result, status: c.status };
}

function slaBreach(state, c) {
  const fl = ensureFlows(state);
  fl.slaBreaches.push({ customerId: c.customerId, day: state.day });
  const n = fl.slaBreaches.filter((b) => b.customerId === c.customerId && state.day - b.day <= 90).length;
  if (n >= 2 && !fl.slaEscalated?.[c.customerId]) {
    (fl.slaEscalated ??= {})[c.customerId] = state.day;
    const ch = ensureStripe(state).charges.filter((x) => x.customerId === c.customerId && x.status === 'succeeded').at(-1);
    if (ch) { try { refund(state, ch.id, { amount: round2(ch.amount * 0.05) }); } catch { /* none */ } }
    mistake(state, c, 'sla_missed', `${nameOf(c)} (enterprise plan) missed its first-response SLA twice in 90 days: an escalation call (1.5 h) and a 5% credit clause. Publish tier targets you can meet every week.`, { key: `sla:${c.customerId}:${Math.floor(state.day / 90)}`, hours: 1.5, charge: true, estCost: ch ? ch.amount * 0.05 : 0, customers: 1 });
  }
}

// De-escalation text (S4 §5): short, names the problem, gives a next step with a time, does not argue policy.
export function deescalation(text) {
  const t = String(text ?? '').toLowerCase(), n = words(t);
  let s = 0;
  if (n && n <= 90) s += 0.25; else if (n > 160) s -= 0.2;
  if (/\b(by|before|within|tomorrow|today|at \d)\b/.test(t)) s += 0.25;
  if (/\b(i can see|i understand that|you are right|you're right|that is on us|our mistake|sorry that)\b/.test(t)) s += 0.2;
  if (/\b(policy|terms|as stated|calm down|unacceptable behaviou?r)\b/.test(t)) s -= 0.3;
  if (/\bcall\b/.test(t) && /\b(threat|kill|house)\b/.test(t)) s -= 0.3;
  return clamp(s, -0.5, 0.7);
}

function feedbackFor(state, c, T, r, h) {
  const out = [];
  out.push(`${T.label}: ${r.tier} handling (${Math.round(r.score * 100)}).`);
  if (r.d < 0.6) out.push(`The decision did not fit the facts. ${T.coach(c)}`);
  const req = T.required(c).filter((x) => !(h.checks ?? []).includes(x));
  if (req.length) out.push(`Checks skipped: ${req.map((x) => T.checks.find(([k]) => k === x)?.[1] ?? x).join('; ')}.`);
  if (r.breached) out.push(`Replied after ${Math.round(r.waited)} h; the ${c.tier} plan target for ${c.priority.toUpperCase()} is ${slaLimit(c)} h.`);
  if (!r.tagOk) out.push(`Tag it ${T.tag} so it reaches the weekly review.`);
  if (r.d >= 0.9 && r.k >= 0.9 && r.tier !== 'stellar') out.push('Right call; the reply, tags or notes held it back.');
  out.push(...(r.notes ?? []));
  return out;
}

// ---------------------------------------------------------------- loop closing
export function closeLoop(state, id, { text = '' } = {}) {
  const c = caseById(state, id);
  if (!c || c.status !== 'notify') return { ok: false, error: 'Nothing to close.' };
  const fl = ensureFlows(state), sup = state.apps.support;
  c.status = 'resolved'; c.loopClosedDay = state.day;
  fl.stats.loopsClosed++;
  sup.csatLog.push({ day: state.day, responses: 1, positive: chance(state, 0.85) ? 1 : 0 });
  if (c.type === 'security_report') notify(state, 'You credited the researcher and told them it is fixed.', { type: 'good', app: 'helpdesk' });
  return { ok: true, hoursCost: round2(words(text) > 0 ? 0.1 : 0.05) };
}

export function notifyRequesters(state, reqId) {
  const fl = ensureFlows(state), req = fl.requests.find((x) => x.id === reqId);
  if (!req || req.status !== 'shipped' || req.notified) return { ok: false, error: 'Not shipped or already notified.' };
  req.notified = state.day; fl.stats.loopsClosed += req.accountIds.length ? 1 : 0;
  for (const cid of req.accountIds) { const s = ensureStripe(state).subscriptions.find((x) => x.customerId === cid && isLiveSub(x)); if (s) s.requestShipped = state.day; }
  return { ok: true, hoursCost: round2(0.05 + 0.02 * req.accountIds.length), notified: req.accountIds.length };
}

// The feature-request log Product reads: most-wanted first, with the MRR behind each ask.
export function featureRequestLog(state) {
  const fl = state.apps.support?.flows;
  return (fl?.requests ?? []).filter((r) => !r.dupOf).map((r) => ({ id: r.id, text: r.text, votes: r.votes, accounts: r.accountIds.length, mrr: r.mrr, status: r.status, promised: r.promised?.length ?? 0, firstDay: r.firstDay, lastDay: r.lastDay }))
    .sort((a, b) => b.mrr - a.mrr || b.votes - a.votes);
}

// ---------------------------------------------------------------- ops settings (each costs real time)
export function setOps(state, patch) {
  const fl = ensureFlows(state), o = fl.ops;
  let hours = 0;
  if ('chat' in patch && Boolean(patch.chat) !== o.chat) { o.chat = Boolean(patch.chat); hours += o.chat ? 0.5 : 0; }
  if ('afterHours' in patch && AFTER_HOURS[patch.afterHours]) o.afterHours = patch.afterHours;
  if ('langPolicy' in patch && LANG_POLICIES[patch.langPolicy]) o.langPolicy = patch.langPolicy;
  if ('glossary' in patch && Boolean(patch.glossary) !== o.glossary) { o.glossary = Boolean(patch.glossary); hours += o.glossary ? 1 : 0; }
  if ('refundWindowDays' in patch) o.refundWindowDays = clamp(Math.round(Number(patch.refundWindowDays) || 0), 0, 90);
  if ('securityTxt' in patch && Boolean(patch.securityTxt) !== o.securityTxt) { o.securityTxt = Boolean(patch.securityTxt); hours += o.securityTxt ? 1 : 0; } // security.txt + a disclosure policy with safe harbour (RFC 9116)
  return { ok: true, hoursCost: hours };
}
export const setAiScope = (state, typeId, level) => { const fl = ensureFlows(state); if (TYPES[typeId] && ['off', 'draft', 'auto'].includes(level)) { fl.aiScope[typeId] = level; fl.aiScopeSet = true; } return fl.aiScope[typeId]; };
export const aiScopeOf = (state, typeId) => ensureFlows(state).aiScope[typeId] ?? 'auto'; // vendor default: answer everything it can
export const RECOMMENDED_SCOPE = (typeId) => ({ safe: 'auto', assist: 'draft', never: 'off' })[TYPES[typeId].ai.level];

// ---------------------------------------------------------------- AI agent on flows
const aiLive = (state) => state.apps.support?.ai?.status === 'live' || (state.apps.people?.members ?? []).some((m) => m.agentType === 'support_ai' && m.status === 'active' && state.day >= (m.readyDay ?? m.startDay));
function aiHandle(state, c) {
  const fl = ensureFlows(state), T = TYPES[c.type];
  const wrong = chance(state, T.ai.wrongP(state, c));
  const worst = rankActions(state, c).at(-1).action;
  const h = wrong ? { action: worst, checks: [] } : { action: T.best(c), checks: T.required(c) };
  const res = handleCase(state, c.id, h, { by: 'ai' });
  c.ai = { wrong };
  fl.aiLog.unshift({ day: state.day, caseId: c.id, type: c.type, wrong, action: h.action });
  if (fl.aiLog.length > 100) fl.aiLog.length = 100;
  if (wrong) {
    fl.stats.aiWrong++;
    mistake(state, c, 'ai_flow_wrong', `The AI agent handled a ${T.label.toLowerCase()} from ${nameOf(c)} on its own and got it wrong (${h.action.replace(/_/g, ' ')}). ${T.ai.note}`, { key: `aiwrong:${c.id}`, estCost: 0, customers: 1, reputation: T.ai.level === 'never' ? 1 : 0.3 });
  } else fl.stats.aiResolved++;
  if (T.ai.level === 'never' && !fl.aiScopeSet) mistake(state, c, 'ai_flow_scope', `The AI agent is allowed to decide ${T.label.toLowerCase()} cases (vendor default: answer everything). Refunds, ownership transfers and data requests need a human: set them to Off or Draft in Ops.`, { key: 'aiscope', estCost: 0 });
  return res;
}

// ---------------------------------------------------------------- daily: generation
const mapCat = { billing: 'billing', account: 'account', privacy: 'account', security: 'bug', product: 'bug', ops: 'angry', public: 'angry' };
function decCount(counts, cat) {
  if (counts[cat] > 0) { counts[cat]--; return; }
  const k = Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (k) counts[k]--;
}

function pickSub(state, subs, vipBias = false) { return pick(state, subs); }

// Creates today's typed cases from the ticket volume (n tickets, counts by category) and the rare-event rates.
// Returns extra aggregated tickets (live chat makes it easier to write in).
export function flowsGenerate(state, sup, { subs, n = 0, counts = {} }) {
  const fl = ensureFlows(state), model = state.company.model;
  if (!subs.length || fl.off) return 0; // fl.off: sandbox switch for tests that study one other system
  let made = 0;
  const habit = 1 + 0.1 * (fl.refundHabit ?? 0);
  // Share-of-tickets types.
  const shareTypes = TYPE_IDS.filter((id) => TYPES[id].share);
  for (let i = 0; i < n && made < MAX_NEW_PER_DAY; i++) {
    let r = R(state);
    for (const id of shareTypes) {
      const T = TYPES[id];
      const p = T.share[model] * (id === 'refund_request' ? habit : 1);
      if (r < p) {
        const c = openCase(state, id, pickSub(state, subs));
        if (c) { decCount(counts, mapCat[T.family] ?? 'howto'); made++; if (aiLive(state) && (fl.aiScope[id] ?? 'auto') === 'auto') aiHandle(state, c); }
        break;
      }
      r -= p;
    }
  }
  // Rate types (per 100 customers per month).
  for (const id of TYPE_IDS) {
    const T = TYPES[id];
    if (!T.rate || id === 'public_complaint') continue;
    const lam = (T.rate[model] * subs.length) / 100 / 30;
    for (let i = poisson(state, lam); i > 0; i--) { const c = openCase(state, id, pickSub(state, subs)); if (c && aiLive(state) && (fl.aiScope[id] ?? 'auto') === 'auto') aiHandle(state, c); }
  }
  // Public complaints appear on their own and from mishandled cases.
  const lamPub = (TYPES.public_complaint.rate[model] * subs.length) / 100 / 30;
  for (let i = poisson(state, lamPub); i > 0; i--) {
    const sub = pickSub(state, subs);
    const topic = pick(state, ['other', 'other', 'charge', 'cancel', 'lockout']);
    spawnPublic(state, sub, { topic, venue: pick(state, ['x', 'reddit', 'review']), valid: chance(state, 0.7), origin: 'organic' });
  }
  return fl.ops.chat ? stochRoundLite(state, n * CHAT.volumeMult) : 0;
}
const stochRoundLite = (state, x) => Math.floor(x) + (R(state) < x - Math.floor(x) ? 1 : 0);

function spawnPublic(state, sub, f) {
  const c = openCase(state, 'public_complaint', sub, { facts: { venue: f.venue ?? 'x', topic: f.topic ?? 'other', valid: f.valid ?? true, reach: 'mid', origin: f.origin ?? 'case' }, extra: { fromCase: f.fromCase } });
  return c;
}

// ---------------------------------------------------------------- daily: everything else
export function flowsDay(state, sup, { accounts = [], out = null } = {}) {
  const fl = ensureFlows(state), subs = accounts.map((a) => a.sub);
  if (fl.off) return;
  processPending(state, fl);
  scanDisputes(state, fl, subs);
  dsrBridge(state, fl, subs);
  incidentDay(state, fl, subs, out);
  securityDay(state, fl, subs);
  requestsDay(state, fl);
  linkedDay(state, fl);
  networkDay(state, fl);
  drainDay(state, fl);
  // Chat: coverage costs time every weekday; an unanswered chat falls back to email with a worse mood.
  if (fl.ops.chat && !isWeekend(state)) chargeHours(state, CHAT.coverageHoursPerDay, 'Support: live chat coverage');
  for (const c of fl.cases) if (c.channel === 'chat' && c.status === 'open' && state.day > c.createdDay) { c.channel = 'email'; c.chatMissed = true; c.dueDay = state.day + (TYPES[c.type].expire ?? 3); fl.stats.chatMissed = (fl.stats.chatMissed ?? 0) + 1; }
  // Lapses.
  for (const c of fl.cases) {
    if (!['open', 'waiting'].includes(c.status) || c.dueDay == null || state.day <= c.dueDay) continue;
    const T = TYPES[c.type];
    if (c.type === 'dispute') continue; // closed by scanDisputes
    c.status = 'lapsed'; c.lapsedDay = state.day;
    fl.stats.lapsed = (fl.stats.lapsed ?? 0) + 1;
    sup.frtLog?.push({ day: state.day, frt: Math.max(48, (state.day - c.createdDay) * 24), n: 1, abandoned: true });
    mistake(state, c, 'ticket_abandoned', `${T.label} from ${nameOf(c)} sat for ${state.day - c.createdDay} days with no reply.`, { estCost: 0, customers: 0 });
    T.lapse?.(state, c);
  }
  // Expire very old closed cases from the pending-reopen guard.
}

function chargeHours(state, hours, label) {
  const f = state.founder;
  const h = round2(Math.min(hours, Math.max(0, (f.hoursPerWeek ?? 40) - (f.hoursUsed ?? 0))));
  if (h <= 0) return 0;
  f.hoursUsed += h;
  (f.timeLog ??= []).push({ day: state.day, hours: h, label });
  return h;
}

// ---- pending consequences
function processPending(state, fl) {
  const due = fl.pending.filter((p) => p.due <= state.day);
  if (!due.length) return;
  fl.pending = fl.pending.filter((p) => p.due > state.day);
  for (const p of due) {
    const d = p.data, c = d.caseId ? caseById(state, d.caseId) : null;
    switch (p.kind) {
      case 'cancel': {
        const sub = subOf(state, d.subId);
        if (isLiveSub(sub) && !sub.cancelAtPeriodEnd) {
          cancel(state, sub.id, { atPeriodEnd: true, reason: d.reason });
          mistake(state, { id: d.caseId }, d.trap, d.text, { estCost: monthlyAmount(sub) * 12, customers: 1, delayed: true });
        }
        break;
      }
      case 'dispute': scheduleDispute(state, { id: d.caseId, customerId: d.customerId }, d.p ?? 1, d.cause); break;
      case 'public': { const sub = subOf(state, d.subId); if (sub) spawnPublic(state, sub, { topic: d.topic, venue: d.venue ?? pick(state, ['x', 'reddit', 'review']), valid: true, origin: 'mishandled', fromCase: d.fromCase }); break; }
      case 'fine': {
        const usd = fine(state, d.usd, d.desc, d.category);
        mistake(state, { id: d.caseId }, d.trap, d.text, { estCost: usd, hours: d.hours ?? 0, charge: Boolean(d.hours), delayed: true });
        break;
      }
      case 'price': { const sub = subOf(state, d.subId); if (isLiveSub(sub)) changePrice(state, sub.id, { price: d.price }); break; }
      case 'reopen': if (c) reopen(state, fl, c); break;
      case 'info_reply': if (c && c.status === 'waiting') { c.status = 'open'; c.dueDay = state.day + (TYPES[c.type].expire ?? 4); } break;
      case 'dpa_complaint':
        if (chance(state, d.chance)) {
          const usd = fine(state, 1500 + Math.round(R(state) * 4500), 'Counsel: data-protection authority inquiry');
          chargeHours(state, 6, 'Data-protection authority inquiry');
          if (state.apps.legal) state.apps.legal.exposure = round2((state.apps.legal.exposure ?? 0) + 0.5);
          mistake(state, { id: d.caseId }, d.missed ? 'dsr_missed' : d.trap, `${d.name} complained to the data-protection authority${d.missed ? ' after the deadline passed with no answer' : ' about incomplete handling of their request'}: counsel time, 6 hours of your own, and an inquiry on file.`, { key: `dpa:${d.caseId}`, estCost: usd, hours: 6, reputation: 1, delayed: true });
        }
        break;
      case 'disclosure': {
        const bug = d.issueId ? bugById(state, d.issueId) : null;
        if (bug?.fixedDay != null) { if (c) c.disclosureAvoided = true; break; }
        if (c) viral(state, c, { reason: 'viral_complaint', text: `The researcher published the vulnerability ${d.issueId ? 'before your fix shipped' : 'after hearing nothing from you'}. Prospects and customers read it, and the press picks up the cause, not just the bug.` });
        break;
      }
      case 'exploit': if (c && chance(state, d.p)) { const bug = c.issueId ? bugById(state, c.issueId) : null; if (!bug?.fixedDay) { raiseBreachTask(state, { text: 'The unfixed vulnerability a researcher reported to you was exploited by someone else.' }); fine(state, 4000 + Math.round(R(state) * 4000), 'Breach response: exploited vulnerability'); } } break;
      case 'viral': if (c) viral(state, c, { reason: d.reason, text: d.text }); break;
      default: break;
    }
  }
}

function reopen(state, fl, c) {
  if (c.status !== 'resolved' || c.reopenedAs) return;
  const sub = subOf(state, c.subId);
  const T = TYPES[c.type];
  const n = openCase(state, c.type, sub, { facts: { ...c.facts }, name: c.name, customerId: c.customerId, extra: { reopenOf: c.id, reopenDepth: (c.reopenDepth ?? 0) + 1 } });
  if (!n) return;
  n.subject = `Re: ${c.subject}`; n.body = `${first(c.name)} writes again: "That did not solve it." ${c.result?.macro?.wrong ? 'The reply answered a different question.' : ''}`;
  c.reopenedAs = n.id; fl.stats.reopened++;
  mistake(state, c, 'case_reopened', `The reply to ${nameOf(c)} did not solve the ${T.label.toLowerCase()}: they wrote back and you are doing it again.`, { circles: true, hours: round2(T.minutes / 60 * 0.6), charge: true, estCost: 0 });
}

// ---- disputes (core/stripe.js) become cases; ratio monitoring
function scanDisputes(state, fl, subs) {
  const st = ensureStripe(state);
  for (const d of st.disputes) {
    if (d.status === 'needs_response' && !fl.seenDisputes[d.id]) {
      fl.seenDisputes[d.id] = state.day;
      const sub = st.subscriptions.find((s) => s.customerId === d.customerId) ?? null;
      let cause = d.reason === 'fraudulent' ? (chance(state, 0.35) ? 'fraud' : 'friendly') : (chance(state, 0.35) ? 'our_error' : 'friendly');
      if (['charged_after_cancel', 'refund_denied', 'unanswered', 'cancel_blocked', 'data_wrong', 'deleted_still_billed', 'misunderstood'].includes(d.cause)) cause = 'our_error';
      else if (['fraud', 'takeover'].includes(d.cause)) cause = 'fraud';
      const ch = st.charges.find((x) => x.id === d.chargeId);
      const c = openCase(state, 'dispute', sub, { customerId: d.customerId, facts: { disputeId: d.id, amount: d.amount, reason: d.reason, cause, deviceAvailable: (sub?.paidMonths ?? 0) >= 2 && cause !== 'fraud', origin: d.cause ?? null, chargeDay: ch?.day }, dueDay: d.dueDay, channel: 'email' });
      if (c) {
        if (fl.network.level === 'excessive') { fine(state, 25, 'Card-network monitoring program fee (per dispute)', 'payment_fees'); } // [design] network monitoring programmes add per-dispute fees
        if (aiLive(state) && (fl.aiScope.dispute ?? 'auto') === 'auto') aiHandle(state, c);
      }
    }
  }
  for (const c of fl.cases) {
    if (c.type !== 'dispute' || !['open', 'waiting'].includes(c.status)) continue;
    const d = st.disputes.find((x) => x.id === c.facts.disputeId);
    if (!d) continue;
    if (c.status === 'open' && !d.casePlan && d.evidenceQuality != null && d.status !== 'needs_response') {
      // The player wrote the evidence in Payments -> Disputes (LLM-judged packet): the case adopts that response.
      c.status = d.status === 'under_review' ? 'waiting' : 'resolved'; c.resolvedDay = state.day; c.handledBy = 'stripe_app';
      c.result = { score: round2(clamp(0.45 + 0.5 * d.evidenceQuality, 0, 1)), tier: tierFromScore(0.45 + 0.5 * d.evidenceQuality), d: c.facts.cause === 'our_error' ? 0.1 : 0.5 + 0.5 * d.evidenceQuality, k: d.evidenceQuality, r: d.evidenceQuality, a: 0, tagOk: false, effect: c.facts.cause === 'our_error' ? 'wrong_fight' : 'ok', hours: 0, notes: [], feedback: ['Responded in Payments with a written packet.'] };
      if (c.facts.cause === 'our_error') mistake(state, c, 'dispute_wrong_fight', `Contested a ${money(d.amount)} dispute on a charge that was your own error (${nameOf(c)}). The $15 counter fee is lost with the dispute.`, { estCost: 15 });
      d.casePlan = 'contest';
    }
    if (c.status === 'open' && d.status === 'lost' && d.evidenceQuality == null && !d.accepted) {
      c.status = 'lapsed'; fl.stats.disputesMissed++;
      mistake(state, c, 'dispute_missed', `A ${money(d.amount)} dispute from ${nameOf(c)} lapsed with no response: the cardholder wins by default, and you also paid the $15 dispute fee.`, { estCost: d.amount + 15, reputation: 0.3 });
    } else if (c.status === 'waiting' && (d.status === 'won' || d.status === 'lost')) {
      c.status = 'resolved'; c.outcome = d.status;
      if (d.status === 'won') fl.stats.disputesWon++; else fl.stats.disputesLost++;
    }
  }
}

// Weekly dispute ratio vs the card-network lines (S1 flow 4): Stripe's own 0.5% healthy line, then the network programmes.
// The minimum-volume rules (about 1,500 transactions for Visa's programme) are scaled to a small SaaS with a count floor [design].
export const NETWORK = { watch: 0.005, warning: 0.0075, excessive: 0.015, minExcessive: 5, holdDays: 14, programFee: 25 };
export function disputeRatio(state, days = 30) {
  const st = ensureStripe(state);
  const ds = st.disputes.filter((d) => d.status !== 'scheduled' && (d.dueDay ?? d.day + 7) - 7 > state.day - days);
  const tx = st.charges.filter((c) => c.day > state.day - days && c.status !== 'failed').length;
  return { disputes: ds.length, tx, ratio: tx ? ds.length / tx : 0 };
}
function networkDay(state, fl) {
  if (state.day % 7 !== 1) return;
  const { disputes, tx, ratio } = disputeRatio(state, 30);
  const n = fl.network;
  const prev = n.level;
  const level = disputes >= NETWORK.minExcessive && ratio >= NETWORK.excessive ? 'excessive' : disputes >= 2 && ratio >= NETWORK.warning ? 'warning' : disputes >= 2 && ratio >= NETWORK.watch ? 'watch' : 'ok';
  Object.assign(n, { ratio: round2(ratio * 10000) / 10000, disputes30: disputes, tx30: tx, level });
  if (level !== prev && level !== 'ok') {
    notify(state, `Dispute ratio ${(ratio * 100).toFixed(2)}% (${disputes} of ${tx} payments in 30 days). ${level === 'watch' ? 'Healthy is well under 0.5%.' : level === 'warning' ? 'Stripe will warn you before the card networks do.' : 'Over the card-network line: monitoring-program fees now apply to each new dispute.'}`, { type: level === 'watch' ? 'warn' : 'bad', app: 'helpdesk' });
    mistake(state, { id: `net${state.day}` }, 'dispute_ratio', `Dispute ratio reached ${(ratio * 100).toFixed(2)}% (${level}). Each dispute costs the charge plus $15 and counts toward the network programmes (Visa excessive line about 1.5%, Mastercard 1.5% with 100+ chargebacks; Stripe can suspend an account with a high ratio).`, { key: `net:${level}:${Math.floor(state.day / 60)}`, estCost: 0, reputation: level === 'excessive' ? 1 : 0.2 });
  }
  n.weeksExcessive = level === 'excessive' ? n.weeksExcessive + 1 : 0;
  if (n.weeksExcessive >= 8 && state.day - n.holdDay > 90) {
    n.holdDay = state.day;
    const st = ensureStripe(state);
    for (const p of st.pending) p.availableDay += NETWORK.holdDays;
    notify(state, `Stripe is reviewing your account over the dispute ratio: pending funds are held ${NETWORK.holdDays} more days.`, { type: 'bad', app: 'helpdesk' });
    mistake(state, { id: `hold${state.day}` }, 'dispute_ratio', `Two months over the excessive line: Stripe held payouts for ${NETWORK.holdDays} days while it reviewed the account. Refund real errors before they become disputes, and fix the cause (clearer descriptor, a visible cancel button).`, { key: `nethold:${state.day}`, days: NETWORK.holdDays, reputation: 1 });
  }
}

// ---- Legal's DSR tracker bridged into cases
function dsrBridge(state, fl, subs) {
  const L = state.apps.legal;
  if (!L?.dsrs?.length || !subs.length) return;
  for (const d of L.dsrs) {
    if (d.status === 'open' && !d.caseId) {
      const sub = pick(state, subs);
      const f = d.facts ?? {};
      const facts = { dsrId: d.id, kind: d.type === 'deletion' ? 'deletion' : f.kind ?? 'access', regime: d.regime ?? 'gdpr', dueDay: d.dueDay, complex: Boolean(f.complex), impostor: Boolean(f.impostor), route: Boolean(f.route), billingActive: d.type === 'deletion' && isLiveSub(sub) && (f.billingActive ?? true), name: d.name };
      const c = openCase(state, 'dsr', sub, { facts, name: d.name, dueDay: d.dueDay, channel: 'email', extra: { dsrId: d.id } });
      if (c) { d.caseId = c.id; if (aiLive(state) && (fl.aiScope.dsr ?? 'auto') === 'auto') aiHandle(state, c); }
    }
  }
  for (const c of fl.cases) {
    if (c.type !== 'dsr' || !['open', 'waiting'].includes(c.status)) continue;
    const d = L.dsrs.find((x) => x.id === c.facts.dsrId);
    if (!d) continue;
    c.dueDay = d.dueDay;
    if (d.status === 'answered' && !d.worked) { // the Legal "answered" button without doing the work
      c.status = 'resolved'; c.result = { score: 0.2, tier: 'mediocre', k: 0, d: 0.3, tagOk: false, effect: 'token', hours: 0, notes: [] }; c.resolvedDay = state.day;
      mistake(state, c, 'dsr_token', `The request from ${d.name} was closed in Legal without verifying identity, exporting or deleting anything. Closing it is not answering it.`, { estCost: 0, delayed: true });
      schedule(state, 25 + Math.round(R(state) * 30), 'dpa_complaint', { chance: 0.25, caseId: c.id, name: d.name, trap: 'dsr_token' });
    } else if (d.status === 'missed') { c.dueDay = state.day - 1; }
  }
}

// ---- incidents: SLA credits and VIP check-ins; data-loss incidents spawn data tickets
function incidentDay(state, fl, subs, out) {
  const ins = state.apps.insights;
  if (!ins) return;
  fl.seenIncidents ??= {};
  const inc = out ? (ins.incidents ?? []).find((i) => i.id === out.id) : null;
  if (inc && !fl.seenIncidents[inc.id]) {
    fl.seenIncidents[inc.id] = state.day;
    if ((inc.minutes ?? 0) >= 43 && ['own', 'upstream', 'llm'].includes(inc.kind ?? 'own')) { // 99.9% monthly = 43 minutes
      const ent = subs.filter((s) => supportTier(s) === 'enterprise').slice(0, 3);
      for (const sub of ent) openCase(state, 'sla_credit', sub, { facts: { cause: inc.cause, minutes: inc.minutes, creditPct: inc.minutes >= 432 ? 0.25 : 0.1, excluded: inc.kind !== 'own' && chance(state, 0.5) }, channel: 'email' }); // 99.0% = 432 min [design credit tiers]
    }
    if ((inc.severity ?? 0) >= 0.5) {
      const vips = subs.filter((s) => isVip(state, s)).slice(0, 3);
      for (const sub of vips) openCase(state, 'vip_checkin', sub, { facts: { cause: inc.cause }, channel: 'email' });
    }
  }
  for (const s of ins.security ?? []) if (s.type === 'data_loss' && s.day === state.day && !fl.seenIncidents[s.id]) {
    fl.seenIncidents[s.id] = state.day;
    for (const sub of subs.slice(0, 3)) openCase(state, 'data_wrong', sub, { facts: { cause: 'data_loss', backups: false } });
  }
}

// ---- researchers
function securityDay(state, fl, subs) {
  if (!subs.length || state.day < 20) return;
  const scale = Math.min(1, subs.length / 50), begScale = Math.min(1, subs.length / 20);
  const txt = fl.ops.securityTxt ? 1 : 0;
  const magnet = fl.ops.begMagnetUntil > state.day ? 2 : 1;
  const mk = (kind) => {
    const sev = wp(state, [['critical', 0.1], ['high', 0.3], ['medium', 0.4], ['low', 0.2]]);
    const c = openCase(state, 'security_report', null, { name: pick(state, ['Ravi K.', 'Mina Okafor', 'sec_researcher_77', 'Leon B.']), customerId: null, facts: { kind, severity: kind === 'real' ? sev : null, endpoint: pick(state, ['invoices', 'projects', 'exports', 'members']), demand: 100 + Math.round(R(state) * 4) * 100 }, channel: 'email', afterHours: false });
    if (c && aiLive(state) && (fl.aiScope.security_report ?? 'auto') === 'auto') aiHandle(state, c);
  };
  if (chance(state, (SECURITY_REAL_PER_YEAR / 365) * scale * (txt ? 1.3 : 1))) mk('real');
  if (chance(state, (SECURITY_BEG_PER_YEAR / 365) * begScale * magnet * (txt ? 1.2 : 1))) mk('beg');
  if (chance(state, (SECURITY_SCANNER_PER_YEAR / 365) * begScale * magnet)) mk('scanner');
}
const wp = (state, pairs) => { let r = R(state) * pairs.reduce((a, [, w]) => a + w, 0); for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; } return pairs.at(-1)[0]; };

// ---- feature requests: shipped features, broken promises
function requestsDay(state, fl) {
  const feats = shippedFeatures(state);
  for (const rq of fl.requests) {
    if (rq.status === 'open' || rq.status === 'declined') {
      const keyWords = rq.key.split(' ').filter((w) => w.length > 3);
      const hit = feats.find((f) => (f.shippedDay ?? -1) >= rq.firstDay && keyWords.some((w) => String(f.title).toLowerCase().includes(w)));
      if (hit) { rq.status = 'shipped'; rq.shippedDay = state.day; rq.featureId = hit.id; }
    }
    for (const p of rq.promised ?? []) {
      if (!p.broken && rq.status !== 'shipped' && state.day > p.byDay) {
        p.broken = true;
        const sub = subOf(state, p.subId);
        scheduleCancel(state, { id: p.caseId, subId: p.subId, customerId: p.customerId }, 0.35, 'missing_feature', 'broken_promise', `You promised a date for "${rq.text}" and missed it. The promised account${sub ? '' : ''} cancelled: promises that are not kept are a churn driver and a credibility problem.`, 7);
      }
    }
    if (rq.status === 'shipped' && !rq.notified && !rq.loopMissed && state.day - rq.shippedDay > 14) {
      rq.loopMissed = true; fl.stats.loopsMissed++;
      mistake(state, { id: rq.id }, 'loop_not_closed', `"${rq.text}" shipped and the ${rq.accountIds.length} account(s) who asked were never told. Only about a quarter of teams close the loop on feedback (Forrester 2025, via a secondary source), so doing it is an edge.`, { estCost: 0 });
    }
  }
}

// ---- linked bug cases: fixed -> tell the customer
function linkedDay(state, fl) {
  for (const c of fl.cases) {
    if (c.status === 'linked' && c.issueId) {
      const bug = bugById(state, c.issueId);
      if (bug && bug.fixedDay != null && !bug.wontFix && !bug.duplicate) { c.status = 'notify'; c.fixedDay = state.day; c.notifyBy = state.day + 3; }
    } else if (c.status === 'notify' && state.day > c.notifyBy) {
      c.status = 'resolved'; fl.stats.loopsMissed++;
      mistake(state, c, 'loop_not_closed', `The bug ${nameOf(c)} reported was fixed and nobody told them. They find out from the changelog, if at all: no win, and a customer who thinks you ignored them.`, { estCost: 0 });
      scheduleCancel(state, c, 0.03, 'felt_ignored', 'loop_not_closed', `${nameOf(c)} never heard that the bug they reported was fixed.`, 20);
    }
  }
}

// ---- abusive customers who were not dealt with keep costing hours
function drainDay(state, fl) {
  if (state.day % 30 !== 0 || !fl.drain.length) return;
  for (const x of fl.drain) {
    chargeHours(state, x.hoursPerMonth, `Support: ${x.name} (abusive customer)`);
    if (state.founder) state.founder.energy = Math.max(0, (state.founder.energy ?? 100) - 1);
    if (state.day - x.sinceDay >= 60) mistake(state, { id: x.caseId }, 'kept_toxic_customer', `${x.name} has been abusive for ${state.day - x.sinceDay} days and is still a customer. ${x.hoursPerMonth} h a month and your energy go to one account; ending the relationship properly costs less.`, { key: `toxic:${x.caseId}`, hours: x.hoursPerMonth * 2, charge: false, estCost: 0 });
  }
}

// ---------------------------------------------------------------- Automations events
export function flowEvents(state, sinceDay) {
  const fl = state.apps.support?.flows;
  if (!fl) return [];
  const ev = [];
  for (const c of fl.cases) {
    if (c.createdDay >= sinceDay) ev.push({ id: `case_created:${c.id}`, type: 'case_created', day: c.createdDay, caseId: c.id, caseType: c.type, family: c.family, priority: c.priority, customerId: c.customerId, vip: c.vip, tier: c.tier });
    if (c.type === 'dsr' && c.createdDay >= sinceDay) ev.push({ id: `dsr_clock:${c.id}`, type: 'dsr_clock', day: c.createdDay, caseId: c.id, dueDay: c.dueDay, regime: c.facts.regime });
    if (c.type === 'dsr' && ['open', 'waiting'].includes(c.status) && c.dueDay != null && c.dueDay - state.day <= 7 && c.dueDay >= state.day) ev.push({ id: `dsr_due_soon:${c.id}`, type: 'dsr_due_soon', day: state.day, caseId: c.id, dueDay: c.dueDay });
    if (c.type === 'dispute' && c.status === 'open' && c.dueDay != null && c.dueDay - state.day <= 3 && c.dueDay >= state.day) ev.push({ id: `dispute_due:${c.id}`, type: 'dispute_due', day: state.day, caseId: c.id, dueDay: c.dueDay, amount: c.facts.amount });
    if (c.type === 'security_report' && c.createdDay >= sinceDay) ev.push({ id: `security_report:${c.id}`, type: 'security_report', day: c.createdDay, caseId: c.id });
    if (c.type === 'public_complaint' && c.createdDay >= sinceDay) ev.push({ id: `public_complaint:${c.id}`, type: 'public_complaint', day: c.createdDay, caseId: c.id, venue: c.facts.venue });
    if (c.status === 'notify' && (c.fixedDay ?? 0) >= sinceDay) ev.push({ id: `issue_fixed:${c.id}`, type: 'issue_fixed', day: c.fixedDay, caseId: c.id, issueId: c.issueId, customerId: c.customerId });
    if (c.vip && c.status === 'open' && c.createdDay >= sinceDay) ev.push({ id: `vip_case:${c.id}`, type: 'vip_case', day: c.createdDay, caseId: c.id, customerId: c.customerId });
  }
  if (fl.network.level !== 'ok') ev.push({ id: `dispute_ratio:${fl.network.level}:${Math.floor(state.day / 30)}`, type: 'dispute_ratio', day: state.day, level: fl.network.level, ratio: fl.network.ratio });
  return ev;
}

export const FLOW_EVENT_TYPES = ['case_created', 'dsr_clock', 'dsr_due_soon', 'dispute_due', 'security_report', 'public_complaint', 'issue_fixed', 'vip_case', 'dispute_ratio'];
export { MINUTES_PER_TICKET, aiHandle as aiHandleCase, networkDay, processPending };
