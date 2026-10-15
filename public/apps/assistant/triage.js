// AI inbox triage for Mail and Messages (Superhuman Split Inbox + AI / Lindy Email Triager style), follow-up
// reminders, snooze and send-later, plus pay-to-play / scam fee decisions on inbound.
// Sources: docs/research/tools/deep/d12-ai-assistants-ops.md §3 (Lindy: audit on your last 10 emails before going
// live; misfiled investor/customer mail is the top risk; check the archive weekly), §4 (Superhuman: splits by
// sender list, reminders, AI drafts that can contain a date, price or commitment you never agreed), cross-cutting
// table (inbox triage saves 2-4 h/week [design]); docs/review/tool-gap-analysis.md item 12. No vendor publishes
// triage accuracy: the rates below are [design] (92-96% on clear mail, 5-8% misfiled on ambiguous mail, 6-10% of
// drafts carry an unsupported claim).
//
// Operator tiers (principle 7):
// - stellar: VIP list set, audit on 10 before going live, weekly review of Other/Archived, edits every draft, never
//   auto-sends, follow-up reminders on what matters. Nothing valuable lost; VIP replies same/next day.
// - good: audits once, reviews the archive monthly. Rare loss.
// - average: turns on auto-label/auto-archive, skips the audit. A valuable message lost every month or two.
// - mediocre: auto-archive + auto-decline + auto-send from day one. 1-2 valuable messages lost a month, an
//   unsupported commitment sent every few months, investor replies that read like a bot.
// Separation metric: valuable messages missed per month; VIP response time.

import { ensure, notify } from '../../core/state.js';
import { uid, chance, rng, round2, fmtDate, dayOfWeek } from '../../core/util.js';
import { post, addRecurring } from '../../core/bank.js';
import { mainPlan } from '../../core/market.js';
import { ensureMail, addMessage, replyDay } from '../../core/mail.js';
import { ensureNetwork, inboundFee, RESPONSIVE_SPAM, resolveInbound } from '../../core/network.js';
import { enqueue, hasJob } from '../../core/jobs.js';
import { logMistake } from '../../core/operator.js';
import { UNSUPPORTED_CLAIMS } from './model.js';

export const AGENT_PLANS = {
  superhuman_starter: { vendor: 'Superhuman', name: 'Superhuman Starter', price: 30, note: '~$30/mo monthly, $25 annual (d12 §4, secondary [unverified]). Preset auto labels only.' },
  superhuman_business: { vendor: 'Superhuman', name: 'Superhuman Business', price: 40, note: '~$40/mo monthly (d12 §4 [unverified]). Custom auto labels, AI drafts.' },
  lindy_team: { vendor: 'Lindy', name: 'Lindy Email Triager', price: 49.99, note: '$49.99/mo per seat, 5,000 credits (lindy.ai/pricing, fetched 2026-10-14, d12 §3). Judgment-first, not deterministic.' },
};
export const TRIAGE = {
  misfileClear: 0.05, misfileAmbiguous: 0.065, auditFactor: 0.45, // [design] audit fixes instructions: misfiles roughly halve
  rescueWindow: 7, // days an auto-archived message stays recoverable before the opportunity moves on [design]
  draftUnsupported: 0.08, // d12 §4 hallucinated details; gap item 12: 6-10% [design]
  skimHours: 0.03, // ~2 min to open and skim a thread [design]
  setupHours: 1, auditHours: 0.25, reviewHours: 0.25, // gap item 12
};
export const SPLITS = {
  vip: 'Important',
  other: 'Other',
  candidates: 'Candidates',
  cold: 'Vendors & cold',
  admin: 'Receipts & admin',
};
export const AI_LABELS = { investor: 'Investor', customer: 'Customer', action: 'Action needed', candidate: 'Candidate', cold: 'Cold pitch / promo', admin: 'Receipt / admin', other: 'Other' };
const VALUE_OUTCOMES = new Set(['intro_customer', 'intro_investor', 'intro_partner', 'customer_lead', 'investor_meeting', 'press', 'hire', 'advice']);
const INB_LOOK = { spam: 'cold', vendor: 'cold', event: 'cold', recruiter: 'cold', advisor: 'cold', press: 'other', customer: 'customer', competitor: 'customer', investor: 'investor', partner: 'other', candidate: 'candidate', friend: 'other', founder_peer: 'other', acquirer: 'other' };

export function ensureInbox(state) {
  const x = ensure(state, 'inbox', () => ({}));
  x.vips ??= [];
  x.agent ??= { plan: null, on: false, autoArchive: false, drafts: false, autoSend: false, autoDecline: false, audited: false, auditDay: null, onSince: null, recurringId: null };
  x.labels ??= {}; // threadId → { ai, truth, valuable, day, autoArchived, rescued, lost }
  x.reminders ??= [];
  x.sendLater ??= [];
  x.reviews ??= [];
  x.audits ??= [];
  x.stats ??= { autoArchived: 0, misfiled: 0, rescued: 0, lostValuable: 0, autoDeclined: 0, draftsSent: 0, draftErrorsSent: 0, draftErrorsCaught: 0, opened: 0, remindersFired: 0, falseReminders: 0 };
  x.processed ??= {}; // threadId → last message id seen by the agent
  return x;
}

const nameKey = (w) => String(w?.email || w?.name || '').trim().toLowerCase();
export const isVipSender = (state, t) => { const k = nameKey(t.with); return !!k && ensureInbox(state).vips.includes(k); };
const inboundOf = (state, t) => (t.kind === 'network' && t.refId ? ensureNetwork(state).inbound.find((i) => i.id === t.refId) : null);

/** Deterministic rule-based split (Superhuman Split Inbox is rules, not AI). */
export function splitOf(state, t) {
  if (isVipSender(state, t)) return 'vip';
  if (['investor', 'customer', 'prospect'].includes(t.kind)) return 'vip';
  if (t.kind === 'candidate') return 'candidates';
  if (t.kind === 'vendor') return 'cold';
  if (['legal', 'system'].includes(t.kind)) return 'admin';
  return 'other';
}

/** What the message really is (hidden), used to judge the AI label. */
function truthOf(state, t) {
  const inb = inboundOf(state, t);
  if (inb) return { cls: INB_LOOK[inb.category] ?? 'other', valuable: VALUE_OUTCOMES.has(inb.outcome), ambiguous: true, inb };
  const cls = { investor: 'investor', customer: 'customer', prospect: 'action', candidate: 'candidate', vendor: 'cold', legal: 'admin', system: 'admin' }[t.kind] ?? 'other';
  return { cls, valuable: ['investor', 'customer', 'prospect'].includes(t.kind), ambiguous: false, inb: null };
}

// ---------------------------------------------------------------------------
// Agent setup
// ---------------------------------------------------------------------------
export function chooseAgentPlan(state, planId) {
  const X = ensureInbox(state);
  const p = AGENT_PLANS[planId];
  if (planId && !p) throw new Error('Unknown plan');
  if (X.agent.recurringId) { const r = state.recurring.find((y) => y.id === X.agent.recurringId); if (r) r.active = false; X.agent.recurringId = null; }
  X.agent.plan = planId || null;
  if (!p) { X.agent.on = false; return null; }
  post(state, { amount: -p.price, counterparty: p.vendor, description: `${p.name} subscription`, category: 'software', method: 'card' });
  X.agent.recurringId = addRecurring(state, { vendor: p.vendor, amount: p.price, category: 'software', dayOfMonth: 1, note: `${p.name} (inbox triage)` }).id;
  X.agent.planSince = state.day;
  return p;
}
export function setAgent(state, patch) {
  const X = ensureInbox(state);
  if (patch.on && !X.agent.plan) throw new Error('Pick a triage plan first.');
  for (const k of ['on', 'autoArchive', 'drafts', 'autoSend', 'autoDecline']) if (patch[k] != null) {
    if (k === 'on' && patch.on && !X.agent.on) X.agent.onSince = state.day;
    if (patch[k] && !X.agent[k]) X.agent[`${k}Since`] = state.day;
    X.agent[k] = !!patch[k];
  }
  return X.agent;
}
export function toggleVip(state, who) {
  const X = ensureInbox(state);
  const k = nameKey(who);
  if (!k) return false;
  const i = X.vips.indexOf(k);
  if (i >= 0) X.vips.splice(i, 1); else X.vips.push(k);
  return i < 0;
}

/** Audit mode: run the agent on the last 10 emails and show every decision before it goes live (d12 §3). */
export function runAudit(state) {
  const X = ensureInbox(state);
  const threads = ensureMail(state).threads.slice(0, 10);
  const rows = threads.map((t) => {
    const tr = truthOf(state, t);
    const ai = classify(state, tr, { audit: true });
    return { threadId: t.id, subject: t.subject, from: t.with?.name ?? '', ai, truth: tr.cls, wrong: ai !== tr.cls };
  });
  X.agent.audited = true;
  X.agent.auditDay = state.day;
  X.audits.unshift({ day: state.day, n: rows.length, wrong: rows.filter((r) => r.wrong).length });
  return rows;
}

function classify(state, tr, { audit = false } = {}) {
  const X = ensureInbox(state);
  let p = tr.ambiguous ? TRIAGE.misfileAmbiguous : TRIAGE.misfileClear;
  if (X.agent.audited && !audit) p *= TRIAGE.auditFactor;
  if (!chance(state, p)) return tr.cls;
  const wrongs = Object.keys(AI_LABELS).filter((k) => k !== tr.cls);
  return chance(state, 0.5) ? (tr.cls === 'cold' ? 'other' : 'cold') : wrongs[Math.floor(rng(state) * wrongs.length)];
}

// ---------------------------------------------------------------------------
// Daily triage
// ---------------------------------------------------------------------------
export function triageDay(state) {
  const X = state.apps.inbox;
  const box = ensureMail(state);
  if (X) {
    ensureInbox(state);
    if (X.agent.on && X.agent.plan) {
      for (const t of box.threads) {
        const last = t.messages.at(-1);
        if (!last || last.from !== 'them' || X.processed[t.id] === last.id) continue;
        X.processed[t.id] = last.id;
        const tr = truthOf(state, t);
        const ai = classify(state, tr);
        const lab = (X.labels[t.id] ??= { day: state.day });
        lab.ai = ai; lab.truth = tr.cls; lab.valuable = tr.valuable; lab.day = state.day;
        if (ai !== tr.cls) X.stats.misfiled++;
        if (X.agent.autoArchive && ai === 'cold' && !t.archived && !isVipSender(state, t)) {
          t.archived = true; lab.autoArchived = state.day; X.stats.autoArchived++;
        }
        if (X.agent.drafts && ['investor', 'customer', 'action'].includes(ai) && !t.aiDraft) makeDraft(state, t);
      }
      // Messages inbound (LinkedIn / iMessage / email) get the same labels; auto-decline acts on "cold".
      for (const inb of ensureNetwork(state).inbound) {
        if (inb.status !== 'delivered' || inb.aiLabel) continue;
        const tr = { cls: INB_LOOK[inb.category] ?? 'other', ambiguous: true };
        inb.aiLabel = classify(state, tr);
        if (X.agent.autoDecline && inb.aiLabel === 'cold' && !inb.resolved && !inb.declined && !inb.engaged) {
          inb.declined = true; inb.autoDeclined = state.day; X.stats.autoDeclined++;
          if (VALUE_OUTCOMES.has(inb.outcome)) {
            X.stats.lostValuable++;
            logMistake(state, { functionId: 'automation_ai', id: 'auto_declined_valuable', label: 'AI auto-declined a valuable contact', cost: { reputation: 0.25 }, delayed: true, detail: `The triage agent filed a ${String(inb.outcome).replace(/_/g, ' ')} contact as a cold pitch and declined it. You never saw it.`, app: 'messages', key: `autodecl:${inb.id}` });
          }
        }
      }
      if (X.agent.autoSend) autoSendDrafts(state);
      // The tools' own weekly nudge (d12 §3-4: "check the archived label weekly").
      if (dayOfWeek(state) === 1 && X.agent.autoArchive) {
        const n = Object.values(X.labels).filter((l) => l.autoArchived != null && l.autoArchived > state.day - 7).length;
        if (n) notify(state, `${n} email${n === 1 ? ' was' : 's were'} auto-archived last week. Review Archived & Other.`, { type: 'info', app: 'mail' });
      }
    }
    // Auto-archived valuable mail nobody rescued within the window is lost.
    for (const [tid, lab] of Object.entries(X.labels)) {
      if (lab.autoArchived == null || lab.rescued || lab.lost || !lab.valuable) continue;
      if (state.day - lab.autoArchived < TRIAGE.rescueWindow) continue;
      const t = box.threads.find((x) => x.id === tid);
      if (!t || !t.archived || t.messages.at(-1)?.from === 'me') continue;
      lab.lost = state.day;
      X.stats.lostValuable++;
      const inb = inboundOf(state, t);
      if (inb && !inb.resolved) { inb.resolved = true; inb.result = 'missed_by_triage'; }
      logMistake(state, { functionId: 'automation_ai', id: 'auto_archived_valuable', label: 'Valuable email auto-archived and never seen', cost: { reputation: t.kind === 'network' ? 0 : 0.5 }, delayed: true, detail: `"${t.subject}" from ${t.with?.name ?? 'someone'} was filed as a cold pitch and archived on ${fmtDate(state, lab.autoArchived)}. Nobody reviewed the archive within a week.`, app: 'mail', key: `lost:${tid}` });
    }
    // Reminders
    for (const r of X.reminders) {
      if (r.status !== 'pending' || state.day < r.dueDay) continue;
      const t = box.threads.find((x) => x.id === r.threadId);
      if (!t) { r.status = 'gone'; continue; }
      const replied = t.messages.slice(r.at ?? 0).some((m) => m.from === 'them');
      if (replied) { r.status = 'replied'; continue; }
      const elsewhere = box.threads.some((o) => o.id !== t.id && nameKey(o.with) === nameKey(t.with) && o.messages.some((m) => m.from === 'them' && m.day >= r.setDay));
      r.status = 'fired';
      X.stats.remindersFired++;
      if (elsewhere) { r.falsePositive = true; X.stats.falseReminders++; }
      t.unread = true;
      notify(state, `No reply from ${t.with?.name ?? 'them'} on "${t.subject}" after ${r.dueDay - r.setDay} days.${elsewhere ? ' (They may have answered in another thread: reminders track one thread.)' : ' Follow up?'}`, { type: 'info', app: 'mail' });
    }
  }
  // Snoozes and send-later (work without an agent)
  for (const t of box.threads) if (t.snoozeUntil != null && state.day >= t.snoozeUntil) { t.snoozeUntil = null; t.unread = true; t.archived = false; }
  if (X) {
    const due = X.sendLater.filter((q) => q.day <= state.day);
    X.sendLater = X.sendLater.filter((q) => q.day > state.day);
    for (const q of due) {
      const t = box.threads.find((x) => x.id === q.threadId);
      if (!t) continue;
      addMessage(state, t.id, { from: 'me', body: q.body });
      if (hasJob(`reply:${t.kind}`)) enqueue(state, `reply:${t.kind}`, { threadId: t.id, refId: t.refId }, { label: `Reply from ${t.with?.name ?? ''}`, notBefore: replyDay(state, t.kind) });
    }
  }
}

function makeDraft(state, t) {
  const bad = chance(state, TRIAGE.draftUnsupported) ? UNSUPPORTED_CLAIMS[Math.floor(rng(state) * UNSUPPORTED_CLAIMS.length)] : null;
  const first = String(t.with?.name ?? '').split(' ')[0] || 'there';
  const text = `Hi ${first}, thanks for your note on "${String(t.subject ?? '').slice(0, 60)}". ${bad ? `${bad} ` : ''}Happy to go deeper: what would be most useful to cover?`;
  t.aiDraft = { text, badClaim: bad, by: 'triage', day: state.day };
  if (hasJob('inbox:draft')) enqueue(state, 'inbox:draft', { threadId: t.id }, { label: `AI draft: ${t.with?.name ?? ''}` });
}

function autoSendDrafts(state) {
  const X = ensureInbox(state);
  for (const t of ensureMail(state).threads) {
    if (!t.aiDraft || t.archived || t.messages.at(-1)?.from !== 'them') continue;
    const d = t.aiDraft;
    delete t.aiDraft;
    addMessage(state, t.id, { from: 'me', body: d.text, meta: { ai: true, autoSent: true } });
    X.stats.draftsSent++;
    if (hasJob(`reply:${t.kind}`)) enqueue(state, `reply:${t.kind}`, { threadId: t.id, refId: t.refId }, { label: `Reply from ${t.with?.name ?? ''}`, notBefore: replyDay(state, t.kind) });
    sentDraftConsequences(state, t, d, { auto: true });
  }
}

/** A reply that went out with an AI draft's text: an unsupported claim left in costs money and trust. */
export function sentDraftConsequences(state, t, draft, { auto = false, body = null } = {}) {
  const X = ensureInbox(state);
  const kept = draft?.badClaim && (body == null || norm(body).includes(norm(draft.badClaim)));
  if (draft?.badClaim && !kept) { X.stats.draftErrorsCaught++; return null; }
  if (auto && t.kind === 'investor') {
    const fr = state.apps.fundraising;
    if (fr && typeof fr.reputation === 'number') fr.reputation -= 0.25;
    logMistake(state, { functionId: 'automation_ai', id: 'replace_human_loop', label: 'Auto-sent AI reply to an investor', cost: { reputation: 0.5 }, detail: `${t.with?.name ?? 'An investor'} got a templated AI reply. Investors notice.`, app: 'mail', key: `autoinv:${t.id}` });
  }
  if (!kept) return null;
  X.stats.draftErrorsSent++;
  const usd = Math.round(mainPlan(state)?.price ?? 49);
  post(state, { amount: -usd, counterparty: t.with?.name ?? 'Contact', description: 'Credit honouring an AI-drafted commitment', category: 'other', method: 'ach' });
  logMistake(state, { functionId: 'automation_ai', id: 'unreviewed_ai_output', label: 'AI draft sent with a commitment nobody agreed', cost: { hours: 0.5, usd, reputation: 0.5 }, detail: `"${draft.badClaim}" went to ${t.with?.name ?? 'a contact'}${auto ? ' by auto-send' : ' because the draft was sent without reading it'}.`, app: 'mail' });
  notify(state, `Your reply to ${t.with?.name ?? 'a contact'} promised "${draft.badClaim}". Honouring it cost ${usd > 0 ? `$${usd}` : 'a credit'} and an awkward follow-up.`, { type: 'bad', app: 'mail' });
  return draft.badClaim;
}
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------
export function reviewArchive(state) {
  const X = ensureInbox(state);
  let rescued = 0;
  for (const [tid, lab] of Object.entries(X.labels)) {
    if (lab.autoArchived == null || lab.rescued || lab.lost || state.day - lab.autoArchived > 14) continue;
    const t = ensureMail(state).threads.find((x) => x.id === tid);
    if (!t) continue;
    if (lab.valuable || lab.ai !== lab.truth) { t.archived = false; t.unread = true; lab.rescued = state.day; rescued++; }
  }
  X.stats.rescued += rescued;
  X.reviews.unshift(state.day);
  if (X.reviews.length > 60) X.reviews.length = 60;
  return rescued;
}
export function setReminder(state, threadId, days) {
  const X = ensureInbox(state);
  X.reminders = X.reminders.filter((r) => !(r.threadId === threadId && r.status === 'pending'));
  const t = ensureMail(state).threads.find((x) => x.id === threadId);
  const r = { id: uid('rem'), threadId, setDay: state.day, at: t?.messages.length ?? 0, dueDay: state.day + Math.max(1, days | 0), status: 'pending' };
  X.reminders.push(r);
  if (X.reminders.length > 300) X.reminders.splice(0, 100);
  return r;
}
export function snooze(state, threadId, days) {
  const t = ensureMail(state).threads.find((x) => x.id === threadId);
  if (!t) return null;
  t.snoozeUntil = state.day + Math.max(1, days | 0);
  t.unread = false;
  return t;
}
export function queueSendLater(state, threadId, body) {
  const X = ensureInbox(state);
  X.sendLater.push({ id: uid('sl'), threadId, body, day: state.day + 1 });
}
/** Unarchive or open a thread the agent archived (counts as a rescue while the window is open). */
export function touchThread(state, threadId) {
  const X = state.apps.inbox;
  const lab = X?.labels?.[threadId];
  if (lab && lab.autoArchived != null && !lab.lost && !lab.rescued) { lab.rescued = state.day; X.stats.rescued++; }
}

// ---------------------------------------------------------------------------
// Pay-to-play and scam inbound: the fee decision (operator-tiers audit fix 14)
// ---------------------------------------------------------------------------
/** Called when the founder engages an inbound: replying to spam/scam marks the address as live; fee asks appear. */
export function onInboundEngaged(state, inb) {
  const n = ensureNetwork(state);
  if (inb.category === 'spam' || inb.outcome === 'scam') {
    const fresh = (n.responsiveUntil ?? -1) < state.day;
    n.responsiveUntil = state.day + RESPONSIVE_SPAM.days;
    if (fresh) logMistake(state, { functionId: 'founder_time', id: 'every_intro_call', label: 'Replied to a spam / scam sender', cost: { hours: 0.5 }, delayed: true, detail: 'Replying confirms your address is live; it is resold and spam rises ~50% for two months (more to skim).', app: 'messages', key: `resp:${inb.id}` });
  }
  if (!inb.feeAsk) { const fee = inboundFee(inb); if (fee) inb.feeAsk = { ...fee, day: state.day }; }
  return inb.feeAsk ?? null;
}

/** Pay the fee a pay-to-play / scam contact asked for. Money leaves the bank either way. */
export function payInboundFee(state, inboundId) {
  const n = ensureNetwork(state);
  const inb = n.inbound.find((x) => x.id === inboundId);
  if (!inb?.feeAsk || inb.paid) throw new Error('No fee to pay');
  const person = n.people.find((p) => p.id === inb.personId);
  const amt = inb.feeAsk.amount;
  post(state, { amount: -amt, counterparty: person?.company || person?.name || 'Vendor', description: inb.feeAsk.what, category: inb.outcome === 'scam' ? 'other' : 'marketing', method: 'card' });
  inb.paid = { amount: amt, day: state.day };
  const scam = inb.outcome === 'scam';
  const hours = scam ? 1 : 4; // scam: chasing a refund that never comes; waste: prepping and attending a worthless slot [design]
  if (!inb.resolved) resolveInbound(state, inb);
  logMistake(state, { functionId: 'founder_time', id: 'pay_to_play', label: scam ? 'Paid a scam fee' : 'Paid for a pay-to-play slot', cost: { usd: amt, hours }, detail: scam ? `${person?.name ?? 'The sender'} took the ${inb.feeAsk.what} ($${amt.toLocaleString()}) and disappeared. Legitimate investors, podcasts and conferences do not charge founders.` : `The ${inb.feeAsk.what} ($${amt.toLocaleString()}) bought a slot nobody in your market watches, plus ${hours}h of prep. No leads came of it.`, app: 'messages', key: `paid:${inb.id}` });
  notify(state, scam ? `You paid $${amt.toLocaleString()} to ${person?.name ?? 'a sender'}: it was a scam and the money is gone.` : `You paid $${amt.toLocaleString()} for a pay-to-play slot. It came and went with no leads.`, { type: 'bad', app: 'messages' });
  return inb;
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------
/** VIP response: average days to first reply and same-day share over the window. */
export function vipResponse(state, days = 60) {
  const out = [];
  for (const t of ensureMail(state).threads) {
    if (splitOf(state, t) !== 'vip') continue;
    for (let i = 0; i < t.messages.length; i++) {
      const m = t.messages[i];
      if (m.from !== 'them' || m.day < state.day - days) continue;
      const r = t.messages.slice(i + 1).find((x) => x.from === 'me');
      out.push(r ? r.day - m.day : Math.max(state.day - m.day, 3));
      while (i + 1 < t.messages.length && t.messages[i + 1].from === 'them') i++;
    }
  }
  if (!out.length) return null;
  return { n: out.length, avgDays: round2(out.reduce((a, b) => a + b, 0) / out.length), sameDay: out.filter((d) => d === 0).length / out.length };
}
/** Valuable inbound missed in the window: declined, auto-declined, lost by triage, or ignored for 14+ days. */
export function valuableMissed(state, days = 30) {
  return ensureNetwork(state).inbound.filter((i) => i.day > state.day - days - 14 && i.day <= state.day && VALUE_OUTCOMES.has(i.outcome)
    && (i.declined || i.result === 'missed_by_triage' || (!i.resolved && !i.engaged && !i.eventId && state.day - i.day >= 14))).length;
}
export function inboxSignals(state) {
  const X = state.apps.inbox;
  const n = ensureNetwork(state);
  const recent = n.inbound.filter((i) => i.day > state.day - 90 && i.status === 'delivered');
  const declined = recent.filter((i) => i.declined).length;
  const engaged = recent.filter((i) => i.engaged > 0 || i.eventId).length;
  return {
    agentOn: !!X?.agent?.on, audited: !!X?.agent?.audited, autoArchive: !!X?.agent?.autoArchive, autoSend: !!X?.agent?.autoSend, autoDecline: !!X?.agent?.autoDecline,
    reviews30: (X?.reviews ?? []).filter((d) => d > state.day - 30).length, vips: X?.vips?.length ?? 0,
    lostValuable: X?.stats?.lostValuable ?? 0, draftErrorsSent: X?.stats?.draftErrorsSent ?? 0, draftErrorsCaught: X?.stats?.draftErrorsCaught ?? 0,
    vip: vipResponse(state), missed30: valuableMissed(state), declinedShare: declined + engaged ? declined / (declined + engaged) : null,
    paidScams: n.inbound.filter((i) => i.paid).length,
  };
}
export function inboxCoaching(state) {
  const s = inboxSignals(state);
  const notes = [];
  if (s.agentOn && !s.audited) notes.push({ tone: 'warn', text: 'The triage agent went live without an audit. Run it on your last 10 emails and check every decision first.' });
  if (s.autoArchive && !s.reviews30) notes.push({ tone: 'warn', text: 'Auto-archive is on and nobody reviewed Archived this month. Misfiled investor and customer mail is the top risk.' });
  if (s.autoSend) notes.push({ tone: 'bad', text: 'Auto-send is on. Drafts can carry a date, price or commitment you never agreed. Edit every draft and send it yourself.' });
  if (s.autoDecline) notes.push({ tone: 'warn', text: 'Auto-decline acts on the AI label. A customer or investor that looks like a cold pitch gets a polite no you never saw.' });
  if (s.lostValuable) notes.push({ tone: 'bad', text: `${s.lostValuable} valuable message${s.lostValuable === 1 ? '' : 's'} lost to triage.` });
  if (s.missed30 >= 2) notes.push({ tone: 'bad', text: `${s.missed30} valuable contacts in the last month went nowhere because nobody engaged.` });
  if (s.paidScams) notes.push({ tone: 'bad', text: `You paid ${s.paidScams} pay-to-play or scam fee${s.paidScams === 1 ? '' : 's'}. Real investors, podcasts and conferences do not charge founders.` });
  if (s.vip && s.vip.avgDays > 2) notes.push({ tone: 'warn', text: `VIP mail waits ${s.vip.avgDays} days for a reply on average. Put the Important split on top and answer it first.` });
  return notes;
}
