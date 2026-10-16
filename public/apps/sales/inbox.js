// Reply inbox and AI reply agent (Instantly Unibox / Smartlead categories), gap-analysis item 8.
// Research: docs/research/tools/deep/d03-sequencers-ai-sdr.md. No vendor publishes classification accuracy, so all
// accuracy figures here are [design]: 85-92% on clear replies, 60-70% on sarcasm and ambiguity. Instantly charges
// 5 credits per generated reply whether or not it is sent (vendor blog [unverified]); credit packs $47 / 1,500 and
// $197 / 5,000 (Instantly pricing page, 2026-10-14).
//
// What separates operators (operator-tiers `cold_outreach` + gap item 8):
//  stellar: 4-5 categories with written prompts, tested on old replies, autopilot only for FAQ-type questions,
//           answers positives personally within hours → 25-40% of positive replies become meetings;
//  good: categories on, reviews every draft; average: default categories, autopilot for everything but "interested";
//  mediocre: autopilot on everything, never audits → 10-15% of positives mishandled, more opt-outs.
import { uid, hash, clamp, chance, words } from '../../core/util.js';
import { post } from '../../core/bank.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { SALES } from './params.js';
import { recordNegative } from './market-burn.js';
import { createMeeting, nextSlot, contactById, companyById, openMeetingFor } from './model.js';

const DEFAULT_DEPS = { createMeeting, nextSlot, contactById, companyById, openMeetingFor };

export const CATEGORIES = {
  interested: 'Interested',
  meeting_request: 'Meeting request',
  question: 'Question (pricing, how it works)',
  objection: 'Objection (price, competitor, security)',
  not_now: 'Not now',
  wrong_person: 'Wrong person',
  ooo: 'Out of office',
  unsubscribe: 'Unsubscribe',
};
export const POSITIVE_CATS = ['interested', 'meeting_request', 'question'];
export const FAQ_CATS = ['question', 'ooo'];
export const INBOX = {
  creditsPerReply: 5,
  packs: { small: { credits: 1500, usd: 47 }, large: { credits: 5000, usd: 197 } },
  accuracy: { clear: 0.85, ambiguous: 0.62, prompts: 0.04, tested: 0.03 }, // [design]
  ambiguousShare: 0.25, // sarcasm, mixed signals, one-word replies [design]
  reviewCatch: 0.9, // founder reviewing a draft catches a wrong label [design]
  // Meeting odds by who answered (× SALES.meetingFromReply of the true reply kind) [design]:
  handler: { founderFast: 1.1, founderSlow: 0.6, reviewed: 0.85, agentFaq: 0.9, agentNuanced: 0.6, agentWrongLabel: 0.1 },
  pushyUnsub: { agent: 0.2, founder: 0.05 },
  ignoreAfterDays: 7,
  hours: { setup: 1, testSamples: 0.25, audit: 0.25, approve: 0.035, triageManual: 0.03, triageLabeled: 0.01 },
};

const u = (s) => (parseInt(hash(s), 36) % 100000) / 100000;

export function ensureInbox(state) {
  const o = (state.apps.outreach ??= {});
  const ib = (o.inbox ??= {});
  ib.items ??= [];
  ib.settings ??= { aiCategorize: false, prompts: {}, promptsKey: '', tested: null, agent: { mode: 'off', scope: [], criteria: '', templates: '', escalation: '' } };
  ib.credits ??= 0;
  ib.ledger ??= [];
  ib.audits ??= [];
  ib.stats ??= { creditsUsed: 0, drafts: 0, sent: 0, caught: 0, mishandled: 0 };
  return ib;
}

/** True category of a reply (hidden). */
export function trueCategory(kind, contact, seed) {
  const r = u(`${seed}|cat`);
  switch (kind) {
    case 'interested': case 'inbound': return r < 0.4 ? 'meeting_request' : 'interested';
    case 'curious': return 'question';
    case 'objection': return 'objection';
    case 'not_now': return 'not_now';
    case 'ooo': return 'ooo';
    case 'unsubscribe': return contact?.prospect?.wrongPersona || contact?.prospect?.wrongPerson || r < 0.25 ? 'wrong_person' : 'unsubscribe';
    case 'hallucination': return 'unsubscribe';
    default: return 'question';
  }
}

export const promptsKey = (prompts) => hash(JSON.stringify(prompts ?? {}));

/** Written category prompts: how many categories have a specific prompt (≥ 8 words, with an example or a rule). */
export function promptQuality(prompts = {}) {
  const good = Object.entries(prompts).filter(([k, v]) => CATEGORIES[k] && words(v) >= 8).length;
  return { good, ok: good >= 4 };
}

/** Classifier accuracy given settings and the reply's ambiguity. */
export function classifierAccuracy(settings, ambiguous) {
  const A = INBOX.accuracy;
  let acc = ambiguous ? A.ambiguous : A.clear;
  if (promptQuality(settings.prompts).ok) acc += A.prompts;
  if (settings.tested && settings.tested.key === promptsKey(settings.prompts)) acc += A.tested;
  return clamp(acc, 0.3, 0.97);
}

// Typical confusions: positives filed as OOO / not now / question; negatives as not now.
const CONFUSE = {
  interested: ['ooo', 'not_now', 'question'], meeting_request: ['interested', 'ooo', 'question'], question: ['objection', 'interested', 'not_now'],
  objection: ['not_now', 'question', 'unsubscribe'], not_now: ['objection', 'ooo', 'interested'], wrong_person: ['unsubscribe', 'not_now', 'interested'],
  ooo: ['not_now', 'interested'], unsubscribe: ['not_now', 'wrong_person', 'objection'],
};

export function classify(settings, item) {
  if (!settings.aiCategorize) return null;
  const acc = classifierAccuracy(settings, item.ambiguous);
  if (u(`${item.id}|cls|${settings.promptsKey}`) < acc) return item.trueCat;
  const opts = CONFUSE[item.trueCat] ?? ['question'];
  return opts[Math.floor(u(`${item.id}|wrong`) * opts.length)];
}

/** Called when a reply is recorded (sequences, LinkedIn, AI SDR). Returns the inbox item. */
export function inboxOnReply(state, { contact, company, kind, source, channel, day }) {
  if (source === 'ai_sdr') return null; // the managed AI SDR answers in its own inbox
  const ib = ensureInbox(state);
  const id = uid('rpl');
  const item = { id, contactId: contact.id, companyId: company?.id ?? null, kind, day, channel, trueCat: trueCategory(kind, contact, id), ambiguous: u(`${id}|amb`) < INBOX.ambiguousShare, label: null, status: 'new', handledBy: null, outcome: null };
  item.label = classify({ ...ib.settings, promptsKey: ib.settings.promptsKey }, item);
  ib.items.push(item);
  if (ib.items.length > 1500) ib.items.splice(0, ib.items.length - 1500);
  return item;
}

export const isPositiveCat = (c) => POSITIVE_CATS.includes(c);

function spend(state, ib, n, what) {
  if (ib.credits < n) return false;
  ib.credits -= n;
  ib.stats.creditsUsed += n;
  ib.ledger.unshift({ day: state.day, delta: -n, what });
  if (ib.ledger.length > 200) ib.ledger.length = 200;
  return true;
}

export function buyCredits(state, pack = 'small') {
  const ib = ensureInbox(state);
  const P = INBOX.packs[pack];
  post(state, { amount: -P.usd, counterparty: 'Sequencer AI credits', description: `${P.credits} AI credits`, category: 'software', method: 'card' });
  ib.credits += P.credits;
  ib.ledger.unshift({ day: state.day, delta: P.credits, what: `Bought ${P.credits} credits` });
}

/** Does the agent handle this label? */
const inScope = (ib, label) => ib.settings.agent.mode !== 'off' && label && ib.settings.agent.scope.includes(label);
const agentSetupGood = (agent) => words(agent.criteria) >= 12 && words(agent.templates) >= 20;

/**
 * Resolve an answered reply: did it turn into a meeting, an opt-out, a complaint? `by`: 'founder' | 'agent'.
 * deps: { createMeeting, nextSlot, contactById } from model.js (passed in to avoid an import cycle).
 */
export function resolveItem(state, item, by, deps = DEFAULT_DEPS) {
  const ib = ensureInbox(state);
  const ct = deps.contactById(state, item.contactId);
  if (!ct || item.status === 'handled') return item;
  item.status = 'handled';
  item.handledBy = by;
  item.handledDay = state.day;
  const delay = state.day - item.day;
  const truePos = isPositiveCat(item.trueCat);
  const wrongLabel = item.label != null && item.label !== item.trueCat;
  let mult;
  if (by === 'reviewed') mult = FAQ_CATS.includes(item.trueCat) ? INBOX.handler.agentFaq : INBOX.handler.reviewed;
  else if (by === 'founder') mult = delay <= 1 ? INBOX.handler.founderFast : delay <= 3 ? 1 : INBOX.handler.founderSlow;
  else if (wrongLabel) mult = INBOX.handler.agentWrongLabel;
  else mult = FAQ_CATS.includes(item.trueCat) ? INBOX.handler.agentFaq : INBOX.handler.agentNuanced;
  if (by === 'agent' && agentSetupGood(ib.settings.agent)) mult *= 1.1;
  const kindForOdds = item.trueCat === 'question' ? 'curious' : item.trueCat === 'meeting_request' ? 'interested' : item.trueCat;
  const base = SALES.meetingFromReply[kindForOdds] ?? 0;
  if (truePos || item.trueCat === 'objection' || item.trueCat === 'not_now') {
    const pushy = by === 'agent' && (item.trueCat === 'not_now' || (wrongLabel && isPositiveCat(item.label)));
    if (pushy && chance(state, INBOX.pushyUnsub.agent)) {
      item.outcome = 'unsubscribed';
      ct.status = 'unsubscribed'; ct.replyKind = 'unsubscribe';
      recordNegative(state, deps.companyById(state, item.companyId), 'unsub');
      return item;
    }
    if (truePos && chance(state, clamp(base * mult, 0, 0.9)) && !deps.openMeetingFor(state, ct.id)) {
      const slot = deps.nextSlot(state, { minLead: 1 + (delay > 3 ? 2 : 0), duration: state.company.model === 'ent' ? 45 : 30, seed: ct.id });
      if (slot) { deps.createMeeting(state, { contactId: ct.id, slot, source: 'outbound', duration: state.company.model === 'ent' ? 45 : 30 }); item.outcome = 'meeting'; return item; }
    }
    item.outcome = truePos ? (by === 'agent' && wrongLabel ? 'mishandled' : 'no_meeting') : 'answered';
    if (item.outcome === 'mishandled') {
      ib.stats.mishandled++;
      logMistake(state, { functionId: 'cold_outreach', id: 'autopilot_mislabel', label: 'AI reply agent mishandled a positive reply', app: 'outreach', cost: { customers: 0.05 }, key: `mishandled:${item.id}`, detail: `A reply that was really "${CATEGORIES[item.trueCat]}" was labelled "${CATEGORIES[item.label]}" and answered on autopilot.` });
    }
    return item;
  }
  if (['unsubscribe', 'wrong_person'].includes(item.trueCat)) {
    if (by === 'agent' && wrongLabel && isPositiveCat(item.label)) {
      // The agent pitched someone who asked to be removed: complaint.
      item.outcome = 'complaint';
      recordNegative(state, deps.companyById(state, item.companyId), 'complaint');
      ib.stats.mishandled++;
      logMistake(state, { functionId: 'cold_outreach', id: 'autopilot_mislabel', label: 'AI agent pitched someone who opted out', app: 'outreach', cost: { reputation: 1 }, key: `complaint:${item.id}`, detail: 'An opt-out was labelled positive and the agent replied with a meeting ask. They reported it as spam.' });
      return item;
    }
    item.outcome = 'removed';
    return item;
  }
  item.outcome = 'answered';
  return item;
}

/** Daily: the agent drafts or sends for in-scope labels; unanswered positives go cold. deps from model.js. */
export function inboxDay(state, deps = DEFAULT_DEPS) {
  const ib = state.apps.outreach?.inbox;
  if (!ib || !deps) return;
  for (const item of ib.items) {
    if (item.status === 'handled' || item.status === 'ignored') continue;
    // A founder reply in Mail handles it (jobs.js marks it); here: agent work and decay.
    // Out of AI credits: the agent drafts nothing and the reply ages like any unanswered one (no free parking).
    if (item.status === 'new' && inScope(ib, item.label) && spend(state, ib, INBOX.creditsPerReply, `AI reply draft (${CATEGORIES[item.label]})`)) {
      ib.stats.drafts++;
      if (ib.settings.agent.mode === 'autopilot') { ib.stats.sent++; resolveItem(state, item, 'agent', deps); }
      else item.status = 'drafted';
      continue;
    }
    if (state.day - item.day > INBOX.ignoreAfterDays && item.status !== 'handled') {
      item.status = 'ignored';
      if (isPositiveCat(item.trueCat)) {
        item.outcome = 'ignored';
        logMistake(state, { functionId: 'cold_outreach', id: 'slow_reply', label: 'Positive reply left unanswered for a week', app: 'outreach', cost: { customers: 0.1 }, key: `ignored:${item.id}`, detail: 'Replies answered within 24 hours win more; after a week most positives have gone cold.' });
      }
    }
  }
}


/** Founder approves the agent's draft (review mode): catches a wrong label most of the time. */
export function approveDraft(state, item, deps = DEFAULT_DEPS) {
  const ib = ensureInbox(state);
  const wrong = item.label !== item.trueCat;
  if (wrong && chance(state, INBOX.reviewCatch)) {
    ib.stats.caught++;
    item.label = item.trueCat; // corrected; the founder rewrites the answer
    return resolveItem(state, item, 'founder', deps);
  }
  ib.stats.sent++;
  return resolveItem(state, item, wrong ? 'agent' : 'reviewed', deps); // an approved, correctly labelled draft
}

/** Test categorization on 10 sample replies (Smartlead flow). → { accuracy, rows } */
export function testOnSamples(state) {
  const ib = ensureInbox(state);
  const s = ib.settings;
  s.promptsKey = promptsKey(s.prompts);
  const pool = ib.items.slice(-60);
  const samples = [];
  const kinds = ['interested', 'curious', 'objection', 'not_now', 'unsubscribe', 'ooo', 'interested', 'curious', 'not_now', 'unsubscribe'];
  for (let i = 0; i < 10; i++) {
    const it = pool[pool.length - 1 - i] ?? { id: `sample_${i}`, trueCat: trueCategory(kinds[i], null, `sample_${i}`), ambiguous: i % 4 === 3 };
    samples.push({ id: it.id, trueCat: it.trueCat, ambiguous: it.ambiguous, label: classify({ ...s, aiCategorize: true }, { ...it, id: `${it.id}|test|${s.promptsKey}` }) });
  }
  const accuracy = samples.filter((x) => x.label === x.trueCat).length / samples.length;
  s.tested = { day: state.day, key: s.promptsKey, accuracy };
  return { accuracy, rows: samples };
}

/** Audit the last 20 labels against the actual replies (founder reads them). */
export function auditLabels(state) {
  const ib = ensureInbox(state);
  const rows = ib.items.filter((x) => x.label).slice(-20);
  const ok = rows.filter((x) => x.label === x.trueCat).length;
  const a = { day: state.day, n: rows.length, accuracy: rows.length ? ok / rows.length : null, misses: rows.filter((x) => x.label !== x.trueCat).map((x) => ({ id: x.id, label: x.label, truth: x.trueCat })) };
  for (const x of rows) x.audited = true;
  ib.audits.push(a);
  return a;
}

/** Confusion matrix over audited items (only what the founder actually checked is known). */
export function confusion(state) {
  const ib = ensureInbox(state);
  const m = {};
  for (const x of ib.items) if (x.audited && x.label) { (m[x.trueCat] ??= {})[x.label] = (m[x.trueCat][x.label] ?? 0) + 1; }
  return m;
}

/** Inbox metrics: meetings per 100 positive replies, opt-out share, mishandled positives. */
export function inboxMetrics(state, sinceDay = -Infinity) {
  const ib = state.apps.outreach?.inbox;
  const items = (ib?.items ?? []).filter((x) => x.day >= sinceDay);
  const pos = items.filter((x) => isPositiveCat(x.trueCat));
  const meetings = pos.filter((x) => x.outcome === 'meeting').length;
  const unsub = items.filter((x) => x.outcome === 'unsubscribed' || x.outcome === 'complaint').length;
  const mishandled = pos.filter((x) => x.outcome === 'mishandled' || x.outcome === 'ignored').length;
  const fast = pos.filter((x) => x.handledBy === 'founder' && x.handledDay - x.day <= 1).length;
  return { n: items.length, positives: pos.length, meetingsPer100: pos.length ? (100 * meetings) / pos.length : null, unsubRate: items.length ? unsub / items.length : 0, mishandledShare: pos.length ? mishandled / pos.length : 0, fastShare: pos.length ? fast / pos.length : 0 };
}

/** Mark an inbox item answered by the founder in Mail (called from the prospect reply job). */
export function markFounderAnswered(state, contactId) {
  const ib = state.apps.outreach?.inbox;
  if (!ib) return null;
  const item = [...ib.items].reverse().find((x) => x.contactId === contactId && x.status !== 'handled');
  if (!item) return null;
  item.status = 'handled'; item.handledBy = 'founder'; item.handledDay = state.day; item.outcome = item.outcome ?? 'answered_in_mail';
  return item;
}
