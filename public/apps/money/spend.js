// Cards & spend (Ramp / Brex style) on top of the Mercury account. Pure engine, no DOM.
//
// What it simulates (docs/research/tools/deep/d11-banking-spend-bookkeeping.md §1-3, gap-analysis item 6):
//  - A spend program (Free $0 / Plus $15 per user) with unlimited virtual cards: per-card monthly limits and
//    merchant or category locks. Without it the company has one shared Mercury debit card and no reminders.
//  - Receipt capture: every card charge needs a receipt. With the program and an email inbox connected,
//    vendors that email receipts are matched automatically (some, not all). The rest are requested by SMS/email:
//    first reminder 2-7 days after the charge, then every Monday until resolved (Brex documented cadence).
//    Overdue receipts lock the card (Ramp auto-lock); a locked card declines its recurring vendors, the vendor
//    retries and suspends after repeated declines (core/bank.js semantics).
//  - Missing receipts make the books worse (money/ledger.js guessCategory reads receiptFactor) and the CPA bills
//    for every one at year end (money/compliance.js cpaQuote).
//  - Spend policy + AI policy agent for teammates' purchases: hard rules at authorization, an agent that
//    auto-approves or flags with an error rate that depends on how complete the written policy is.
//  - SaaS-stack audit: seats bought vs active users, last used, renewal dates, overlaps; tool creep from trials
//    that convert on the card; zombie seats after people leave; move to annual, downgrade, remove seats.
//
// Determinism: per-event randomness comes from frac(salt|key) (stable hashes), not rng(state), so the spend
// simulation never shifts the shared random stream that every other app draws from.

import { notify } from '../../core/state.js';
import { round2, dayOfMonth, dayOfWeek, fmtDate, hash, money } from '../../core/util.js';
import { post, addRecurring, balance, suspendPersonalOffset } from '../../core/bank.js';
import { BANK } from '../../core/params.js';
import { setModifier } from '../../core/market.js';
import { newThread, addMessage, findThread } from '../../core/mail.js';
import { frac, monthOf, monthEndDay, sumBy } from './common.js';
import { TOOL_CATALOG } from './catalog.js';
import { mistake } from './operator.js';
import { VENDOR_NEG, NEG_MISTAKES } from '../../data/negotiation.js';
import { SPEND_VENDORS, AGENT_MISCLASS_MULT } from './vendors.js';

// ---------------------------------------------------------------------------------------------------------
// Parameters. Sourced values cite D11 / T5 / T10; everything marked [design] is a game estimate.
// ---------------------------------------------------------------------------------------------------------

export const SPEND = {
  plans: {
    none: { label: 'Mercury debit card only', perUser: 0, program: false, agent: false, source: 'mercury.com/pricing (D11 §1): card with receipt attachments, no reminders or auto-lock' },
    free: { label: 'Spend program, Free plan', perUser: 0, program: true, agent: false, source: 'Ramp Free $0/user, Brex Essentials $0 (D11 §2-3, vendor pages 2026-10-14)' },
    plus: { label: 'Spend program, Plus plan', perUser: 15, program: true, agent: true, source: 'Ramp Plus $15/user/mo (AI expense reviews, auto-lock); Brex Premium $12 (D11 §2-3)' },
  },
  setupHours: 1.5, // gap analysis item 6: setup 1.5 h
  inboxHours: 0.25, // connect Gmail/Outlook for receipt forwarding (Ramp "dynamic email setting") [design]
  issueCardHours: 0.1,
  // Share of charges with an automatic receipt once the inbox is connected [design; D11: matching "occasional
  // errors", Brex virtual receipts only for vendors that supply data].
  autoMatch: { saas: 0.85, ads: 0.6, other: 0.25 },
  firstReminder: [2, 7], // days after the charge (Brex: reminders 2-7 days after, then every Monday) D11 §3
  lockAfterDays: 30, // default overdue age before the card locks [design; Ramp locks when required items are unmet]
  // Founder minutes to find and attach a receipt by age of the charge [design: digging old email].
  attachHours: (age) => (age <= 7 ? 0.04 : age <= 30 ? 0.08 : 0.17),
  // Chance an old receipt can no longer be found (affidavit needed) [design].
  lostChance: (age) => (age <= 7 ? 0 : age <= 30 ? 0.1 : age <= 90 ? 0.3 : 0.5),
  affidavitHours: 0.1, // IRS-style "no receipt" affidavit (Brex offers one) D11 §3
  memberSubmit: { program: 0.7, none: 0.25 }, // chance a teammate submits per reminder / per week [design]
  // Categorization error multipliers in the books (money/ledger.js) [design]: a memo tells the bookkeeper
  // what the charge was for; no receipt at all makes the guess worse.
  misclassMult: { memo: 0.3, receipt: 0.7, missing: 1.6 },
  cpaPerMissingReceipt: 12, // CPA time per unsubstantiated card charge at year end [design]
  closeDay: 10, // receipts are measured 10 days after month-end (a 5-10 business-day close, o4 s2)
  // Tool creep: trials started on the card (by you or teammates) that convert unless cancelled [design;
  // T5 §5 over-tooling, T10 §4 ~$8,000 software per employee per year (Cledara, unverified)].
  creep: { solo: 0.06, perMember: 0.05, trialDays: 14 },
  teamSpend: { perMemberWeekly: 0.35, badShare: 0.12 }, // [design]
  // AI policy agent. Ramp states "99% accuracy in expense approvals" (vendor, no method; D11 §2). In the game the
  // agent lets bad spend through at base + gap x (1 - policy coverage), and flags some legit spend [design].
  agent: { falseApproveBase: 0.03, gapWeight: 0.3, falseFlag: 0.08, reviewHours: 0.05 },
  annualDiscount: 0.17, // annual billing discount, typical 15-20% (Mercury 15%, Ramp 20%; D11, T5) [design midpoint]
  auditHours: { first: 1, again: 0.5 }, // gap analysis: monthly seat audit; 15 min/week ongoing
  unusedDays: 30,
};

// Real 2026 tools that founders and teammates start trials of. Monthly list prices [unverified: vendor pricing
// pages, verify live]. cls groups overlapping tools for the stack audit.
export const CREEP_TOOLS = [
  { vendor: 'Otter.ai', plan: 'Pro', amount: 16.99, cls: 'notetaker', category: 'software' },
  { vendor: 'Fireflies.ai', plan: 'Pro', amount: 18, cls: 'notetaker', category: 'software' },
  { vendor: 'Granola', plan: 'Business', amount: 14, cls: 'notetaker', category: 'software' },
  { vendor: 'Motion', plan: 'Pro AI', amount: 29, cls: 'planner', category: 'software' },
  { vendor: 'Reclaim.ai', plan: 'Starter', amount: 10, cls: 'planner', category: 'software' },
  { vendor: 'Sunsama', plan: 'Monthly', amount: 20, cls: 'planner', category: 'software' },
  { vendor: 'Loom', plan: 'Business (1 creator)', amount: 15, cls: 'video', category: 'software', team: true },
  { vendor: 'Grammarly', plan: 'Pro', amount: 12, cls: 'writing', category: 'software' },
  { vendor: 'Superhuman', plan: 'Starter', amount: 30, cls: 'email_client', category: 'software' },
  { vendor: 'Perplexity', plan: 'Pro', amount: 20, cls: 'ai_assistant', category: 'software' },
  { vendor: 'Jasper', plan: 'Creator', amount: 49, cls: 'ai_writing', category: 'marketing' },
  { vendor: 'Midjourney', plan: 'Standard', amount: 30, cls: 'image_gen', category: 'software' },
  { vendor: '1Password', plan: 'Teams Starter Pack', amount: 19.95, cls: 'password', category: 'software' },
  { vendor: 'Bitwarden', plan: 'Teams (1 user)', amount: 4, cls: 'password', category: 'software', team: true },
  { vendor: 'Typefully', plan: 'Creator', amount: 12.5, cls: 'social', category: 'marketing' },
  { vendor: 'Buffer', plan: 'Essentials (1 channel)', amount: 6, cls: 'social', category: 'marketing' },
  { vendor: 'Descript', plan: 'Creator', amount: 24, cls: 'video', category: 'software' },
  { vendor: 'Cal.com', plan: 'Teams (1 seat)', amount: 15, cls: 'scheduling', category: 'software', team: true },
  { vendor: 'Zoom', plan: 'Pro', amount: 15.99, cls: 'meetings', category: 'software' },
  { vendor: 'Tally', plan: 'Pro', amount: 29, cls: 'forms', category: 'software' },
];

// Overlap classes for tools already in the catalog (money/catalog.js) or added by other apps.
const CLASS_RULES = [
  [/cursor|copilot|claude max|codex|windsurf/i, 'ai_coding'], [/claude pro|chatgpt|openai|perplexity|gemini/i, 'ai_assistant'],
  [/hubspot|attio|pipedrive|folk/i, 'crm'], [/plausible|fathom analytics|posthog|mixpanel|amplitude/i, 'web_analytics'],
  [/resend|postmark|sendgrid|mailgun/i, 'email_api'], [/calendly|cal\.com|savvycal/i, 'scheduling'], [/notion|coda|confluence/i, 'docs'],
  [/otter|fireflies|granola|fathom notetaker|tl;dv/i, 'notetaker'], [/motion|reclaim|sunsama|akiflow/i, 'planner'],
  [/1password|bitwarden|dashlane/i, 'password'], [/typefully|buffer|hypefury|taplio/i, 'social'], [/zoom/i, 'meetings'],
  [/loom|descript/i, 'video'], [/canva|figma|midjourney/i, 'design'], [/apollo|clay|instantly|smartlead|lemlist/i, 'outbound'],
];
export const toolClass = (vendor) => CLASS_RULES.find(([re]) => re.test(String(vendor ?? '')))?.[1] ?? null;
// Classes where two tools are complementary, not overlapping.
const NO_OVERLAP = new Set(['design', 'outbound', 'video']);
// Per-seat tools every teammate gets when they join (the admin invites them) [design].
const TEAM_SEAT = /google workspace|slack|notion|linear|1password|bitwarden|loom|cal\.com|github/i;
// Always-in-use infrastructure and compliance: never flagged as unused.
const ESSENTIAL_CATS = new Set(['hosting', 'legal', 'accounting', 'payroll', 'payroll_tax']);

const POLICY_CLAUSES = [
  { id: 'receipts', label: 'Receipt and memo deadline', re: /receipt/i, need: /\d+\s*(business\s*)?(day|hour|week)s?|within|same day/i },
  { id: 'approval', label: 'Approval threshold in dollars', re: /approv/i, need: /\$\s?\d/ },
  { id: 'software', label: 'New software needs an owner and approval', re: /software|saas|subscription|tool|trial/i, need: /approv|owner|cancel|review/i },
  { id: 'travel', label: 'Travel and meals limits', re: /travel|flight|hotel|meal|per diem|lodging/i, need: /\$\s?\d|economy|per (night|day|person)/i },
  { id: 'prohibited', label: 'Prohibited spend (gift cards, personal)', re: /gift card|personal|alcohol|cash advance|prohibit|not allowed|never/i, need: /gift card|personal|cash/i },
  { id: 'split', label: 'No split purchases', re: /split/i, need: /purchase|transaction|charge|limit/i },
];

// ---------------------------------------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------------------------------------

export function ensureSpend(state) {
  const b = (state.apps.bank ??= { payees: [], notes: {}, canceled: [], inTransit: [] });
  const s = (b.spend ??= {});
  // Stable per company (not state.seed, which moves with every rng draw: the salt would depend on when the
  // slice was first touched, i.e. on player behaviour).
  s.salt ??= hash(`${state.company?.name}|${state.founder?.name}|${state.startDate}|${state.company?.model}`);
  s.plan ??= 'none';
  s.vendor ??= 'ramp'; // 'ramp' | 'brex' (money/vendors.js SPEND_VENDORS): what the program runs on
  s.setupDay ??= null;
  s.inbox ??= false;
  s.cards ??= [];
  if (!s.cards.some((c) => c.id === 'card_1')) {
    const base = state.bank.cards?.[0] ?? { id: 'card_1', name: 'Founder card ••7702', limit: 5000 };
    s.cards.unshift({ id: base.id ?? 'card_1', name: base.name, limit: base.limit ?? 5000, shared: true, holder: 'founder', last4: '7702', issuedDay: 0 });
  }
  s.receipts ??= {}; // txnId -> { day, amount, vendor, cardId, status, memo, firstReminder, reminders, by, attachedDay }
  s.scan ??= 0; // index into state.bank.txns already processed
  s.policy ??= { text: '', coverage: 0, clauses: {}, gaps: [], judged: null, approvalOver: 500, blocked: ['gift_cards', 'personal'], autoLock: true, lockAfterDays: SPEND.lockAfterDays, softwareNeedsApproval: false, agent: false };
  s.requests ??= [];
  s.trials ??= [];
  s.tools ??= {}; // recurring key -> { addedDay, lastUsedDay, creep, cls }
  s.audits ??= [];
  s.closeStats ??= {};
  s.stats ??= { leak: 0, leakN: 0, blockedBad: 0, falseFlags: 0, approvalsByFounder: 0, rubberStamped: 0, creepConverted: 0, creepCancelled: 0, receiptsAttached: 0, affidavits: 0, lockEvents: 0, seatsRemoved: 0, savedMonthly: 0 };
  s.headcount ??= 1;
  return s;
}
const H = (s, key) => frac(`${s.salt}|${key}`);
export const programOn = (state) => SPEND.plans[ensureSpend(state).plan]?.program ?? false;
const humans = (state) => 1 + (state.apps.people?.members ?? []).filter((m) => m.status === 'active' && m.kind !== 'ai_agent').length;
const activeMembers = (state) => (state.apps.people?.members ?? []).filter((m) => m.status === 'active' && m.kind !== 'ai_agent');
const toolKey = (r) => `${r.vendor}|${r.catalogId ?? r.note ?? ''}`;

// ---------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------

const lockMatches = (card, vendor, category) => {
  if (card.shared) return false;
  if (card.merchant && String(vendor ?? '').toLowerCase().includes(card.merchant.toLowerCase())) return true;
  if (card.category && card.category === category) return true;
  return false;
};
/** The card a charge runs on: a vendor- or category-locked card when one matches, else the shared card. */
export function cardFor(state, vendor, category) {
  const s = ensureSpend(state);
  return s.cards.find((c) => !c.closed && lockMatches(c, vendor, category)) ?? s.cards.find((c) => c.shared) ?? s.cards[0];
}
export function cardSpentThisMonth(state, cardId) {
  const s = ensureSpend(state);
  const m = monthOf(state);
  return sumBy(Object.values(s.receipts).filter((r) => r.cardId === cardId && monthOf(state, r.day) === m), (r) => r.amount);
}
/** Would this card charge go through now? { ok, card, reason }. Limits apply to issued cards only. */
export function authorizeCard(state, { vendor, category, amount }) {
  const card = cardFor(state, vendor, category);
  if (card.locked) return { ok: false, card, reason: `${card.name} is locked: ${card.lockReason}` };
  if (!card.shared && card.limit && cardSpentThisMonth(state, card.id) + amount > card.limit) return { ok: false, card, reason: `${card.name} would exceed its ${card.limit.toLocaleString()} monthly limit` };
  return { ok: true, card };
}

export function issueCard(state, { name, limit, merchant = '', category = '', holder = 'founder' }) {
  const s = ensureSpend(state);
  if (!programOn(state)) throw new Error('Virtual cards with limits and merchant locks need the spend program (Cards & spend → Set up).');
  if (!name?.trim()) throw new Error('Name the card (e.g. "AWS + Vercel" or "Ads").');
  if (!(limit > 0)) throw new Error('Set a monthly limit.');
  const card = { id: `card_${s.cards.length + 1}_${Math.floor(H(s, `card${s.cards.length}`) * 1e4)}`, name: name.trim().slice(0, 40), limit: round2(limit), merchant: merchant.trim().slice(0, 40), category: category || '', holder, shared: false, last4: String(1000 + Math.floor(H(s, `l4${s.cards.length}`) * 9000)), issuedDay: state.day, locked: false };
  s.cards.push(card);
  return card;
}
export function updateCard(state, id, patch) {
  const c = ensureSpend(state).cards.find((x) => x.id === id);
  if (!c) throw new Error('Card not found.');
  if (patch.limit != null) c.limit = round2(Math.max(0, patch.limit));
  if (patch.closed) { if (c.shared) throw new Error('The shared card stays open.'); c.closed = true; }
  return c;
}

// ---------------------------------------------------------------------------------------------------------
// Program setup and policy
// ---------------------------------------------------------------------------------------------------------

export function setPlan(state, plan, vendor = null) {
  const s = ensureSpend(state);
  if (!SPEND.plans[plan]) throw new Error('Unknown plan.');
  if (vendor != null && !SPEND_VENDORS[vendor]) throw new Error('Unknown spend vendor.');
  if (vendor) s.vendor = vendor;
  if (state.bank.accounts[0]?.personal && plan !== 'none') throw new Error('Corporate cards need an incorporated company with a business bank account (Legal → incorporate).');
  s.plan = plan;
  if (plan !== 'none' && s.setupDay == null) s.setupDay = state.day;
  if (plan !== 'plus') s.policy.agent = false;
  syncPlanBill(state);
}
function syncPlanBill(state) {
  const s = ensureSpend(state);
  const p = SPEND.plans[s.plan];
  const v = SPEND_VENDORS[s.vendor ?? 'ramp'];
  let r = state.recurring.find((x) => x.spendPlan);
  const perUser = p.perUser ? (v?.plusPerUser ?? p.perUser) : 0;
  const amount = round2(perUser * humans(state));
  if (!amount) { if (r) state.recurring.splice(state.recurring.indexOf(r), 1); return; }
  if (!r) { r = addRecurring(state, { vendor: v?.label ?? 'Spend management', amount, category: 'software', dayOfMonth: Math.min(28, dayOfMonth(state)), note: `Plus plan, $${perUser}/user` }); r.spendPlan = true; }
  r.amount = amount;
  r.vendor = v?.label ?? r.vendor;
  r.note = `${s.vendor === 'brex' ? 'Premium' : 'Plus'} plan, $${perUser}/user`;
}
export function connectInbox(state) { ensureSpend(state).inbox = true; }

/** Heuristic policy coverage: a clause counts only when a sentence states it with a specific (a number, a rule). */
export function policyHeuristic(text) {
  const t = String(text ?? '').slice(0, 4000);
  const sentences = t.split(/[.\n;]+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 4);
  const clauses = {};
  for (const c of POLICY_CLAUSES) clauses[c.id] = false;
  for (const sn of sentences) {
    // Anti-stuffing: one sentence can establish at most two clauses.
    let used = 0;
    for (const c of POLICY_CLAUSES) {
      if (used >= 2 || clauses[c.id]) continue;
      if (c.re.test(sn) && c.need.test(sn)) { clauses[c.id] = true; used++; }
    }
  }
  const coverage = Object.values(clauses).filter(Boolean).length / POLICY_CLAUSES.length;
  return { clauses, coverage, gaps: POLICY_CLAUSES.filter((c) => !clauses[c.id]).map((c) => c.label) };
}
export const POLICY_CLAUSE_LIST = POLICY_CLAUSES.map(({ id, label }) => ({ id, label }));

export function savePolicy(state, { text, approvalOver, blocked, autoLock, lockAfterDays, softwareNeedsApproval, agent }, judged = null) {
  const s = ensureSpend(state);
  const p = s.policy;
  p.text = String(text ?? '').slice(0, 4000);
  const h = policyHeuristic(p.text);
  // An LLM read (online) decides each clause, but only where the text is at least about that topic; offline we
  // use the stricter sentence heuristic.
  if (judged && !judged.mock) {
    const both = {};
    for (const c of POLICY_CLAUSES) both[c.id] = Boolean(judged.clauses?.[c.id]) && c.re.test(p.text);
    p.clauses = both;
    p.coverage = Object.values(both).filter(Boolean).length / POLICY_CLAUSES.length;
    p.gaps = POLICY_CLAUSES.filter((c) => !both[c.id]).map((c) => c.label);
    p.judged = 'llm';
  } else {
    p.clauses = h.clauses; p.coverage = h.coverage; p.gaps = h.gaps; p.judged = 'heuristic';
  }
  if (approvalOver != null) p.approvalOver = Math.max(0, approvalOver);
  if (Array.isArray(blocked)) p.blocked = blocked;
  if (autoLock != null) p.autoLock = Boolean(autoLock);
  if (lockAfterDays != null) p.lockAfterDays = Math.max(7, Math.min(90, lockAfterDays));
  if (softwareNeedsApproval != null) p.softwareNeedsApproval = Boolean(softwareNeedsApproval);
  if (agent != null) p.agent = Boolean(agent) && s.plan === 'plus';
  p.savedDay = state.day;
  return p;
}

// ---------------------------------------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------------------------------------

const vendorKind = (state, t) => (state.recurring.some((r) => r.vendor === t.counterparty) || /subscr|\bpro\b|plan|software/i.test(t.description ?? '') || ['software', 'hosting', 'ai_inference'].includes(t.category) ? 'saas' : t.category === 'advertising' ? 'ads' : 'other');
const needsReceipt = (t) => t.method === 'card' && t.amount < 0 && t.accountId !== 'treasury';

/** Book a new card charge into the receipts queue. */
function track(state, s, t) {
  const card = cardFor(state, t.counterparty, t.category);
  const rec = { day: t.day, amount: round2(-t.amount), vendor: t.counterparty, cardId: card.id, status: 'needed', memo: '', reminders: 0, by: t.meta?.memberName ?? null };
  if (programOn(state) && s.inbox && H(s, `auto|${t.day}|${t.counterparty}|${t.amount}|${t.balanceAfter}`) < SPEND.autoMatch[vendorKind(state, t)]) { rec.status = 'auto'; rec.attachedDay = t.day; }
  else rec.firstReminder = t.day + SPEND.firstReminder[0] + Math.floor(H(s, `rem|${t.day}|${t.counterparty}|${t.balanceAfter}`) * (SPEND.firstReminder[1] - SPEND.firstReminder[0] + 1));
  s.receipts[t.id] = rec;
}
const hasReceipt = (r) => r && ['auto', 'attached', 'affidavit'].includes(r.status);
export const receiptOf = (state, txnId) => state.apps.bank?.spend?.receipts?.[txnId] ?? null;

/** Multiplier on the books' categorization error for a transaction (1 when not a tracked card charge). */
export function receiptFactor(state, txn) {
  const r = state.apps?.bank?.spend?.receipts?.[txn.id];
  // Ramp Plus's Accounting Agent codes card charges at the swipe (vendor docs, Feb 2026): the books guess better.
  const sp = state.apps?.bank?.spend;
  const agent = txn.method === 'card' && sp?.plan === 'plus' && SPEND_VENDORS[sp.vendor ?? 'ramp']?.agent ? AGENT_MISCLASS_MULT : 1;
  if (!r) return agent;
  if (hasReceipt(r)) return agent * (r.memo && r.memo.trim().split(/\s+/).length >= 3 ? SPEND.misclassMult.memo : SPEND.misclassMult.receipt);
  return agent * (state.day - r.day > 14 ? SPEND.misclassMult.missing : 1);
}

export const missingReceipts = (state, filter = () => true) => Object.entries(ensureSpend(state).receipts).filter(([, r]) => r.status === 'needed' && filter(r)).map(([id, r]) => ({ id, ...r }));

/** Founder attaches a receipt (found in email). Old receipts are sometimes gone: then an affidavit is needed. */
export function attachReceipt(state, txnId, memo = '') {
  const s = ensureSpend(state);
  const r = s.receipts[txnId];
  if (!r) throw new Error('No receipt request for that transaction.');
  if (hasReceipt(r)) { if (memo) r.memo = memo.slice(0, 140); return { ok: true, hours: 0 }; }
  const age = state.day - r.day;
  const hours = SPEND.attachHours(age);
  if (H(s, `lost|${txnId}`) < SPEND.lostChance(age)) { r.lost = true; return { ok: false, hours, lost: true }; }
  Object.assign(r, { status: 'attached', memo: memo.slice(0, 140), attachedDay: state.day });
  s.stats.receiptsAttached++;
  unlockIfClear(state);
  return { ok: true, hours };
}
export function fileAffidavit(state, txnId, memo = '') {
  const s = ensureSpend(state);
  const r = s.receipts[txnId];
  if (!r || hasReceipt(r)) throw new Error('Nothing to file.');
  if ((memo ?? '').trim().split(/\s+/).length < 3) throw new Error('An affidavit needs the business purpose (who, what, why).');
  Object.assign(r, { status: 'affidavit', memo: memo.slice(0, 140), attachedDay: state.day });
  s.stats.affidavits++;
  unlockIfClear(state);
  return { ok: true, hours: SPEND.affidavitHours };
}
/** Hours to clear the whole queue from the inbox (bulk, no memos). */
export const bulkAttachHours = (state) => round2(sumBy(missingReceipts(state), (r) => SPEND.attachHours(state.day - r.day)));
export function attachAll(state) {
  let hours = 0, lost = 0, ok = 0;
  for (const r of missingReceipts(state)) {
    if (r.lost) { lost++; continue; }
    const res = attachReceipt(state, r.id, '');
    hours += res.hours;
    if (res.ok) ok++; else lost++;
  }
  return { hours: round2(hours), ok, lost };
}

// Card locks ---------------------------------------------------------------------------------------------

function overdueOn(state, s, cardId) {
  return Object.values(s.receipts).filter((r) => r.cardId === cardId && r.status === 'needed' && state.day - r.day > s.policy.lockAfterDays);
}
function unlockIfClear(state) {
  const s = ensureSpend(state);
  for (const c of s.cards) if (c.locked && c.lockReason?.startsWith('missing receipts') && !overdueOn(state, s, c.id).length) { c.locked = false; c.lockReason = null; releaseHolds(state, c.id); }
}
function lockCards(state, s) {
  if (!programOn(state) || !s.policy.autoLock) return;
  for (const c of s.cards) {
    if (c.locked || c.closed) continue;
    const od = overdueOn(state, s, c.id);
    if (!od.length) continue;
    c.locked = true;
    c.lockReason = `missing receipts (${od.length} older than ${s.policy.lockAfterDays} days)`;
    c.lockedDay = state.day;
    s.stats.lockEvents++;
    const bills = state.recurring.filter((r) => r.active && !r.variable && cardFor(state, r.vendor, r.category).id === c.id);
    notify(state, `${c.name} locked: ${od.length} receipt${od.length === 1 ? '' : 's'} overdue. ${bills.length ? `${bills.length} recurring bill${bills.length === 1 ? '' : 's'} on this card will decline until you attach them${bills.some((r) => r.category === 'hosting') ? ', including hosting' : ''}.` : ''}`, { type: 'bad', app: 'bank' });
    mistake(state, { functionId: 'bookkeeping_close_tax', id: 'ignored_receipts', label: 'Ignored receipt requests until the card locked', cost: { hours: round2(sumBy(od, (r) => SPEND.attachHours(state.day - r.day))) }, detail: `${od.length} receipts on ${c.name} went unanswered for ${s.policy.lockAfterDays}+ days; the card locked and its vendors decline until they are attached.`, app: 'bank', key: `lock:${c.id}:${state.day}` });
  }
}

// Recurring bills on a locked or maxed-out card are held (inactive) and decline on their billing day, exactly as
// core/bank.js chargeRecurring would for an empty account: retry after a few days, suspend after repeated declines.
function holdReason(state, r) {
  const a = authorizeCard(state, { vendor: r.vendor, category: r.category, amount: r.amount });
  return a.ok ? null : a.reason;
}
function manageHolds(state) {
  const dom = dayOfMonth(state);
  const tomorrow = dayOfMonth(state, state.day + 1);
  for (const r of state.recurring) {
    if (r.variable || r.suspended) continue;
    if (r.cardHold) {
      const still = holdReason(state, r);
      if (!still) { releaseOne(state, r); continue; }
      const due = r.dayOfMonth === dom || (r.retryDay != null && state.day >= r.retryDay);
      if (!due) continue;
      r.declines = (r.declines ?? 0) + 1;
      (state.bank.declines ??= []).push({ day: state.day, vendor: r.vendor, amount: r.amount, recurringId: r.id, reason: 'card' });
      if (r.declines >= BANK.recurringMaxDeclines) {
        r.suspended = true; r.retryDay = null; r.cardHold = null;
        suspendPersonalOffset(state, r);
        if (r.category === 'hosting') setModifier(state, 'churn', 'hosting-suspended', 1.5);
        notify(state, `${r.vendor} suspended your account after ${r.declines} declined card payments (${still}).${r.category === 'hosting' ? ' Your product is down for customers.' : ''}`, { type: 'bad', app: 'bank' });
        mistake(state, { functionId: 'bookkeeping_close_tax', id: 'locked_card_suspension', label: 'A locked card took a vendor down', cost: { usd: r.amount, hours: 1, customers: r.category === 'hosting' ? 1 : 0 }, delayed: true, detail: `${r.vendor} declined ${r.declines} times on a locked or maxed-out card and suspended the account.`, app: 'bank', key: `susp:${r.id}:${state.day}` });
      } else r.retryDay = state.day + BANK.recurringRetryDays;
      continue;
    }
    if (!r.active) continue;
    const dueSoon = r.dayOfMonth === tomorrow || (r.retryDay != null && state.day + 1 >= r.retryDay);
    if (!dueSoon) continue;
    const why = holdReason(state, r);
    if (why) { r.cardHold = why; r.active = false; }
  }
}
function releaseOne(state, r) {
  r.cardHold = null;
  r.active = true;
  if ((r.declines ?? 0) > 0 && balance(state) >= r.amount) {
    // The vendor collects the declined bill as soon as the card works again.
    post(state, { amount: -r.amount, counterparty: r.vendor, description: `${r.vendor} past-due payment`, category: r.category, method: 'card' });
    r.declines = 0; r.retryDay = null;
  }
}
function releaseHolds(state, cardId) {
  for (const r of state.recurring) if (r.cardHold && cardFor(state, r.vendor, r.category).id === cardId && !holdReason(state, r)) releaseOne(state, r);
}

// ---------------------------------------------------------------------------------------------------------
// Team spend requests, policy rules and the AI policy agent
// ---------------------------------------------------------------------------------------------------------

const SPEND_KINDS = [
  { kind: 'meals', vendor: 'DoorDash for Work', category: 'travel', lo: 40, hi: 180, w: 3 },
  { kind: 'travel', vendor: 'United Airlines', category: 'travel', lo: 250, hi: 900, w: 2 },
  { kind: 'hotel', vendor: 'Marriott', category: 'travel', lo: 180, hi: 650, w: 1.5 },
  { kind: 'conference', vendor: 'SaaStr Annual', category: 'marketing', lo: 300, hi: 1500, w: 0.6 },
  { kind: 'equipment', vendor: 'Apple Store', category: 'other', lo: 120, hi: 2600, w: 0.8 },
  { kind: 'books', vendor: 'Amazon', category: 'other', lo: 20, hi: 120, w: 1 },
  // out of policy (bad) spend [design mix]
  { kind: 'gift_cards', vendor: 'Amazon gift card', category: 'other', lo: 100, hi: 500, w: 1, bad: 'Gift cards (untraceable, a classic fraud and policy violation)' },
  { kind: 'personal', vendor: 'Netflix', category: 'other', lo: 15, hi: 25, w: 1, bad: 'Personal subscription on the company card' },
  { kind: 'split', vendor: 'Best Buy', category: 'other', lo: 400, hi: 499, w: 0.8, bad: 'Split purchase to stay under the approval threshold' },
  { kind: 'luxury', vendor: 'Delta One upgrade', category: 'travel', lo: 900, hi: 2400, w: 0.6, bad: 'Business-class upgrade outside travel policy' },
  { kind: 'duplicate', vendor: 'Uber', category: 'travel', lo: 25, hi: 80, w: 0.6, bad: 'Duplicate expense (already reimbursed)' },
];
const pickKind = (u, bad) => {
  const list = SPEND_KINDS.filter((k) => Boolean(k.bad) === bad);
  const tot = sumBy(list, (k) => k.w);
  let acc = 0;
  for (const k of list) { acc += k.w / tot; if (u < acc) return k; }
  return list.at(-1);
};
const blockedBy = (policy, k) => policy.blocked?.includes(k.kind) || (policy.blocked?.includes('personal') && k.kind === 'personal');

function newRequest(state, s, member, n) {
  const u = H(s, `req|${state.day}|${member.id}|${n}`);
  const bad = u < SPEND.teamSpend.badShare;
  const k = pickKind(H(s, `kind|${state.day}|${member.id}|${n}`), bad);
  const amount = round2(k.lo + (k.hi - k.lo) * H(s, `amt|${state.day}|${member.id}|${n}`));
  const req = { id: `req_${state.day}_${s.requests.length}`, day: state.day, memberId: member.id, memberName: member.name ?? 'Teammate', vendor: k.vendor, kind: k.kind, category: k.category, amount, bad: Boolean(k.bad), badReason: k.bad ?? null, status: 'pending', decidedBy: null, note: '' };
  s.requests.push(req);
  if (s.requests.length > 400) s.requests.splice(0, 100);
  routeRequest(state, s, req, k);
}

function routeRequest(state, s, req, k) {
  const p = s.policy;
  if (!programOn(state)) return settle(state, s, req, 'approved', 'no policy (shared card)');
  if (blockedBy(p, k)) return settle(state, s, req, 'blocked', 'blocked merchant category');
  const over = req.amount > (p.approvalOver ?? Infinity);
  if (p.agent) {
    const falseApprove = SPEND.agent.falseApproveBase + SPEND.agent.gapWeight * (1 - (p.coverage ?? 0));
    const u = H(s, `agent|${req.id}`);
    if (req.bad) {
      if (u < falseApprove) return settle(state, s, req, 'approved', `AI agent approved: "looks within policy"${p.coverage < 0.5 ? ' (your policy does not cover this case)' : ''}`);
      req.status = 'pending'; req.note = `AI agent flags: ${req.badReason}`; req.agentFlag = 'decline';
      return;
    }
    if (u < SPEND.agent.falseFlag) { req.status = 'pending'; req.note = 'AI agent flags: unusual for this merchant (false alarm)'; req.agentFlag = 'review'; s.stats.falseFlags++; return; }
    return settle(state, s, req, 'approved', over ? 'AI agent approved with rationale' : 'auto-approved (in policy)');
  }
  if (over) { req.status = 'pending'; req.note = `Above your $${p.approvalOver} approval threshold`; return; }
  return settle(state, s, req, 'approved', 'auto-approved (under threshold, rules only)');
}

function settle(state, s, req, status, why) {
  req.status = status; req.note = why; req.decidedDay = state.day;
  if (status === 'blocked' || status === 'declined') { if (req.bad) s.stats.blockedBad++; return; }
  if (req.bad) {
    s.stats.leak = round2(s.stats.leak + req.amount); s.stats.leakN++;
    mistake(state, { functionId: 'cash_runway', id: 'bad_spend_through', label: 'Out-of-policy spend went through', cost: { usd: req.amount }, detail: `${req.memberName}: ${req.badReason} (${req.vendor}, $${req.amount}). ${why}.`, app: 'bank', key: `leak:${req.id}` });
  }
  const t = post(state, { amount: -req.amount, counterparty: req.vendor, description: `${req.vendor.toUpperCase()}`.slice(0, 40), category: req.category, method: 'card', meta: { spendRequestId: req.id, memberName: req.memberName } });
  req.txnId = t.id;
}

/** Founder decides a pending request. bulk = rubber-stamp (cheaper per item, approves the bad ones too). */
export function decideRequest(state, id, approve, { bulk = false } = {}) {
  const s = ensureSpend(state);
  const req = s.requests.find((r) => r.id === id);
  if (!req || req.status !== 'pending') throw new Error('Nothing to decide.');
  s.stats.approvalsByFounder++;
  if (bulk) s.stats.rubberStamped++;
  return settle(state, s, req, approve ? 'approved' : 'declined', approve ? (bulk ? 'approved in bulk' : 'approved by you') : 'declined by you');
}
export const pendingRequests = (state) => ensureSpend(state).requests.filter((r) => r.status === 'pending');

// ---------------------------------------------------------------------------------------------------------
// Stack: tool usage, seats, trials, annual renewals, audit
// ---------------------------------------------------------------------------------------------------------

const auditable = (r) => !r.usage && !r.personalOffset && !r.spendPlan && !r.bookkeeping;
const isEssential = (r) => ESSENTIAL_CATS.has(r.category) || /gusto|deel|registered agent|mercury|stripe/i.test(r.vendor);

function toolMeta(state, s, r) {
  const k = toolKey(r);
  return (s.tools[k] ??= { addedDay: state.day, lastUsedDay: state.day, creep: Boolean(r.creep), cls: toolClass(r.vendor) });
}
// The primary tool in each overlap class is the one added first that is still active.
function primaries(state, s) {
  const out = {};
  for (const r of state.recurring) {
    if (!auditable(r) || !(r.active || r.cardHold)) continue;
    const m = toolMeta(state, s, r);
    if (!m.cls || NO_OVERLAP.has(m.cls)) continue;
    if (!out[m.cls] || m.addedDay < toolMeta(state, s, out[m.cls]).addedDay) out[m.cls] = r;
  }
  return out;
}
function usageWeek(state, s) {
  const week = Math.floor(state.day / 7);
  const prim = primaries(state, s);
  for (const r of state.recurring) {
    if (!auditable(r) || !(r.active || r.cardHold)) continue;
    const m = toolMeta(state, s, r);
    if (isEssential(r)) { m.lastUsedDay = state.day; continue; }
    const dup = m.cls && !NO_OVERLAP.has(m.cls) && prim[m.cls] && prim[m.cls] !== r;
    const age = state.day - m.addedDay;
    const p = dup ? 0.12 : m.creep ? (age < 21 ? 0.5 : 0.08) : 0.85; // [design]
    if (H(s, `use|${toolKey(r)}|${week}`) < p) m.lastUsedDay = state.day;
  }
}

// Teammates get seats on team-wide tools when they join; nobody removes them when they leave.
function syncSeats(state, s) {
  const n = humans(state);
  if (n > s.headcount) {
    for (const r of state.recurring) {
      if (!(r.active || r.cardHold) || !TEAM_SEAT.test(r.vendor) || r.variable) continue;
      r.seats ??= 1;
      r.seatPrice ??= round2(r.amount / r.seats);
      if (r.seats < n) { r.seats = n; r.amount = round2(r.seatPrice * r.seats); }
    }
    if (s.plan === 'plus') syncPlanBill(state);
  }
  s.headcount = Math.max(s.headcount, n);
  if (n < s.headcount) s.headcount = n; // seats stay; headcount tracks people
}

function creepWeek(state, s) {
  const p = SPEND.creep.solo + SPEND.creep.perMember * activeMembers(state).length;
  if (H(s, `creep|${state.day}`) >= p) return;
  const have = new Set(state.recurring.filter((r) => r.active).map((r) => r.vendor));
  const options = CREEP_TOOLS.filter((t) => !have.has(t.vendor) && !s.trials.some((x) => x.vendor === t.vendor && x.status === 'trial'));
  if (!options.length) return;
  const tool = options[Math.floor(H(s, `creepTool|${state.day}`) * options.length)];
  const member = activeMembers(state)[Math.floor(H(s, `creepWho|${state.day}`) * (activeMembers(state).length + 1)) - 1];
  const trial = { id: `trial_${state.day}`, ...tool, startDay: state.day, convertDay: state.day + SPEND.creep.trialDays, by: member?.name ?? 'you', status: 'trial' };
  if (programOn(state) && s.policy.softwareNeedsApproval) {
    trial.status = 'request';
    s.requests.push({ id: `req_${trial.id}`, day: state.day, memberId: member?.id ?? 'founder', memberName: trial.by, vendor: tool.vendor, kind: 'software', category: tool.category, amount: tool.amount, bad: false, status: 'pending', note: `New software: ${tool.vendor} ${tool.plan} ($${tool.amount}/mo after a ${SPEND.creep.trialDays}-day trial). Policy: new tools need an owner and approval.`, trialId: trial.id });
  }
  s.trials.push(trial);
  if (s.trials.length > 120) s.trials.splice(0, 30);
  if (trial.status === 'trial' && programOn(state)) notify(state, `New vendor on the card: ${tool.vendor} free trial (${trial.by === 'you' ? 'you signed up' : `started by ${trial.by}`}). It converts to $${tool.amount}/mo on ${fmtDate(state, trial.convertDay)} unless cancelled.`, { type: 'info', app: 'bank' });
}

function convertTrials(state, s) {
  for (const tr of s.trials) {
    if (tr.status !== 'trial' || state.day < tr.convertDay) continue;
    const a = authorizeCard(state, { vendor: tr.vendor, category: tr.category, amount: tr.amount });
    if (!a.ok) { tr.status = 'declined'; continue; }
    tr.status = 'converted';
    const r = addRecurring(state, { vendor: tr.vendor, amount: tr.amount, category: tr.category, dayOfMonth: Math.min(28, dayOfMonth(state)), note: `${tr.plan} (converted from a free trial started by ${tr.by})` });
    r.creep = true;
    s.tools[toolKey(r)] = { addedDay: state.day, lastUsedDay: tr.startDay + 3, creep: true, cls: tr.cls };
    post(state, { amount: -tr.amount, counterparty: tr.vendor, description: `${tr.vendor} ${tr.plan}`, category: tr.category, method: 'card' });
    s.stats.creepConverted++;
  }
}
export function cancelTrial(state, id) {
  const s = ensureSpend(state);
  const tr = s.trials.find((x) => x.id === id);
  if (!tr || !['trial', 'request'].includes(tr.status)) throw new Error('Nothing to cancel.');
  tr.status = 'cancelled';
  s.stats.creepCancelled++;
  const req = s.requests.find((r) => r.trialId === id && r.status === 'pending');
  if (req) { req.status = 'declined'; req.note = 'declined by you'; }
}
export const openTrials = (state) => ensureSpend(state).trials.filter((t) => t.status === 'trial');

// Approving a software request starts the trial; declining cancels it.
function syncSoftwareRequests(state, s) {
  for (const req of s.requests) {
    if (!req.trialId || req.synced || req.status === 'pending') continue;
    const tr = s.trials.find((x) => x.id === req.trialId);
    req.synced = true;
    if (!tr) continue;
    if (req.status === 'approved') { tr.status = 'trial'; tr.convertDay = state.day + SPEND.creep.trialDays; }
    else tr.status = 'cancelled';
  }
}

// What an annual plan will charge at its next renewal if nobody negotiates: list uplift (a per-vendor draw in
// VENDOR_NEG.listUplift), limited by an uplift cap won in a past negotiation; a price agreed for this renewal or a
// multi-year price lock is charged as is.
const upliftOf = (s, r, a) => (a.uplift ??= round2(VENDOR_NEG.listUplift[0] + (VENDOR_NEG.listUplift[1] - VENDOR_NEG.listUplift[0]) * H(s, `uplift|${toolKey(r)}`)));
export function renewalQuote(state, r) {
  const a = r.annual;
  if (!a) return null;
  if (a.priced) return a.nextAmount;
  if (a.termLeft > 0) return a.amount;
  const up = upliftOf(ensureSpend(state), r, a);
  return round2(a.amount * (1 + (a.cap == null ? up : Math.min(up, a.cap))));
}

function logNegMistake(state, id, { cost, detail, key, delayed = true }) {
  return mistake(state, { functionId: 'negotiation', id, label: NEG_MISTAKES[id] ?? id, cost, delayed, detail, app: 'bank', key });
}
// A year prepaid and the tool is gone: the unused part of the term is the cost (annual plans are not refunded).
function prepaidChurn(state, r, a, why) {
  const remaining = Math.max(0, a.renewDay - state.day);
  if (a.churnLogged || remaining < 45) return;
  a.churnLogged = true;
  logNegMistake(state, 'prepaid_annual_then_churned_tool', { cost: { usd: round2(a.amount * remaining / 365) }, delayed: false, key: `prepaid_churn:${r.id}:${a.startDay}`,
    detail: `You prepaid ${r.vendor} for a year ($${Math.round(a.amount).toLocaleString()}) and ${why} with ${remaining} days of the term left. The unused ${Math.round(remaining / 30.4)} months are not refunded. Prepay discounts only pay off for tools you will still use at the end of the term; ask for a monthly or quarterly option on anything you have not run for a quarter.` });
}

function annualRenewals(state, s) {
  for (const r of state.recurring) {
    if (!r.annual || !r.active) continue;
    const a = r.annual;
    const m = s.tools[toolKey(r)];
    if (m && !a.churnLogged && !isEssential(r) && a.startDay != null) {
      const age = state.day - a.startDay;
      if (age >= VENDOR_NEG.churnWindowDays[0] && age <= VENDOR_NEG.churnWindowDays[1] && state.day - m.lastUsedDay > VENDOR_NEG.idleDays) prepaidChurn(state, r, a, `nobody has used it for ${state.day - m.lastUsedDay} days`);
    }
    if (!a.noticed && state.day >= a.renewDay - 30) {
      a.noticed = true;
      // Many vendors do not send renewal notices; the audit is where you see the date [design: ~half do].
      if (H(s, `notice|${toolKey(r)}|${a.renewDay}`) < 0.5) notify(state, `${r.vendor} renews on ${fmtDate(state, a.renewDay)} for $${renewalQuote(state, r).toLocaleString()} (annual plan${a.priced || a.termLeft > 0 ? ', price agreed' : ', list price with the vendor\'s uplift unless you negotiate'}).`, { type: 'info', app: 'bank' });
    }
    if (state.day >= a.renewDay) {
      const old = a.amount;
      const quote = renewalQuote(state, r);
      const agreed = a.priced || a.termLeft > 0;
      if (a.priced) { a.amount = a.nextAmount; a.priced = false; a.nextAmount = null; }
      else if (a.termLeft > 0) a.termLeft--;
      else a.amount = quote;
      post(state, { amount: -a.amount, counterparty: r.vendor, description: `${r.vendor} annual renewal`, category: r.category, method: 'card' });
      a.renewDay += 365; a.noticed = false; a.churnLogged = false; a.startDay = state.day;
      if (!agreed && a.amount > old + 0.004 && a.cap == null && a.amount >= VENDOR_NEG.autoRenewAnnualUsd) {
        const up = round2(a.amount - old);
        logNegMistake(state, 'auto_renewed_without_negotiating', { cost: { usd: round2(up + a.amount * VENDOR_NEG.typicalSaving) }, key: `autorenew:${r.id}:${state.day}`,
          detail: `${r.vendor} renewed at list with a ${Math.round((a.amount / old - 1) * 100)}% uplift ($${old.toLocaleString()} to $${a.amount.toLocaleString()}) and nobody asked for the discount, a price cap or a different term. Reps expect renewal pushback; Vendr reports ~11% average savings on negotiated deals (vendor data). Start renewal talks ~90 days out.` });
      }
      if (m && state.day - m.lastUsedDay > 60) mistake(state, { functionId: 'automation_ai', id: 'tool_stacking', label: 'An unused tool auto-renewed for a year', cost: { usd: a.amount }, delayed: true, detail: `${r.vendor} renewed for $${a.amount.toLocaleString()} although nobody had used it for ${state.day - m.lastUsedDay} days.`, app: 'bank', key: `renew:${toolKey(r)}:${state.day}` });
    }
  }
}

// A monthly contract whose term ended rolls to list plus the vendor's uplift (limited by a cap won in the negotiation).
function contractExpiry(state, s) {
  for (const r of state.recurring) {
    const c = r.contract;
    if (!c || r.annual || !r.active || c.termEndDay == null || state.day < c.termEndDay) continue;
    const up = round2(VENDOR_NEG.listUplift[0] + (VENDOR_NEG.listUplift[1] - VENDOR_NEG.listUplift[0]) * H(s, `uplift|${toolKey(r)}|${c.termEndDay}`));
    const eff = c.cap == null ? up : Math.min(up, c.cap);
    const old = r.amount;
    if (eff > 0) { r.amount = round2(old * (1 + eff)); if (r.seats) r.seatPrice = round2(r.amount / r.seats); }
    c.termEndDay = state.day + 365; c.seatCommit = null;
    if (eff > 0) notify(state, `${r.vendor}'s contract term ended: the bill rolls to $${r.amount.toLocaleString()}/mo (+${Math.round(eff * 100)}%).`, { type: 'warn', app: 'bank' });
    if (c.cap == null && eff > 0 && r.amount * 12 >= VENDOR_NEG.autoRenewAnnualUsd) {
      logNegMistake(state, 'auto_renewed_without_negotiating', { cost: { usd: round2((r.amount - old) * 12 + r.amount * 12 * VENDOR_NEG.typicalSaving) }, key: `autorenew:${r.id}:${state.day}`,
        detail: `${r.vendor} rolled to list plus ${Math.round(eff * 100)}% when the term ended ($${old.toLocaleString()} to $${r.amount.toLocaleString()} a month); the contract had no price cap and nobody reopened the price.` });
    }
  }
}

/** Stack rows: the truth (what an audit would find today). */
export function stackRows(state) {
  const s = ensureSpend(state);
  const prim = primaries(state, s);
  const n = humans(state);
  return state.recurring.filter((r) => auditable(r) && (r.active || r.cardHold || r.suspended)).map((r) => {
    const m = toolMeta(state, s, r);
    const seats = r.seats ?? 1;
    const seatPrice = r.seatPrice ?? round2(r.amount / seats);
    const activeUsers = TEAM_SEAT.test(r.vendor) ? Math.min(seats, n) : (state.day - m.lastUsedDay <= SPEND.unusedDays ? 1 : 0);
    const live = r.active || r.cardHold || r.annual;
    const unused = live && !isEssential(r) && state.day - m.lastUsedDay > SPEND.unusedDays && state.day - m.addedDay > SPEND.unusedDays;
    const overlap = m.cls && !NO_OVERLAP.has(m.cls) && prim[m.cls] && prim[m.cls] !== r ? prim[m.cls].vendor : null;
    const zombie = Math.max(0, seats - Math.max(activeUsers, TEAM_SEAT.test(r.vendor) ? n : 1));
    const monthly = r.annual ? round2(r.annual.amount / 12) : r.amount;
    const waste = live ? round2(unused ? monthly : zombie * seatPrice) : 0;
    const renewal = r.annual ? r.annual.renewDay : nextBillDay(state, r);
    const cheaper = downgradeOption(r);
    return { id: r.id, suspended: Boolean(r.suspended), vendor: r.vendor, note: r.note, category: r.category, monthly, seats, seatPrice, activeUsers, lastUsedDay: m.lastUsedDay, addedDay: m.addedDay, unused, overlap, zombie, waste, renewal, annual: Boolean(r.annual), creep: m.creep, cls: m.cls, cheaper, essential: isEssential(r), team: TEAM_SEAT.test(r.vendor) };
  });
}
function nextBillDay(state, r) {
  for (let d = state.day + 1; d <= state.day + 31; d++) if (dayOfMonth(state, d) === r.dayOfMonth) return d;
  return null;
}
function downgradeOption(r) {
  const prefix = r.catalogId?.split('_')[0];
  if (!prefix) return null;
  const opts = TOOL_CATALOG.filter((t) => t.id.split('_')[0] === prefix && t.amount < (r.seatPrice ?? r.amount) && t.id !== r.catalogId).sort((a, b) => b.amount - a.amount);
  return opts[0] ? { id: opts[0].id, vendor: opts[0].vendor, plan: opts[0].plan, amount: opts[0].amount } : null;
}
/** Monthly $ paid for unused tools and zombie seats (the truth, whether or not the player looked). */
export const stackWaste = (state) => round2(sumBy(stackRows(state), (x) => x.waste));
export const unusedToolsPaidFor = (state) => stackRows(state).filter((x) => x.unused).length;
export const softwarePerHead = (state) => round2(sumBy(stackRows(state).filter((x) => !x.essential || x.category === 'software'), (x) => x.monthly) / humans(state));

/** Run the audit: snapshot what is unused, overlapping or over-seated. Costs founder hours (see SPEND.auditHours). */
export function runAudit(state) {
  const s = ensureSpend(state);
  const rows = stackRows(state);
  const audit = { day: state.day, rows: rows.map((r) => ({ id: r.id, vendor: r.vendor, activeUsers: r.activeUsers, lastUsedDay: r.lastUsedDay, unused: r.unused, overlap: r.overlap, zombie: r.zombie, waste: r.waste, renewal: r.renewal })), waste: round2(sumBy(rows, (r) => r.waste)), monthly: round2(sumBy(rows, (r) => r.monthly)) };
  s.audits.push(audit);
  if (s.audits.length > 40) s.audits.splice(0, 10);
  return audit;
}
export const lastAudit = (state) => ensureSpend(state).audits.at(-1) ?? null;

export function removeSeats(state, recurringId) {
  const s = ensureSpend(state);
  const r = state.recurring.find((x) => x.id === recurringId);
  if (!r) throw new Error('Bill not found.');
  const n = humans(state);
  const seats = r.seats ?? 1;
  const commitEnd = r.contract?.seatCommit ? (r.annual ? r.annual.renewDay : r.contract.termEndDay) : null;
  if (commitEnd != null && state.day < commitEnd) throw new Error(`Seats are committed in your contract until ${fmtDate(state, commitEnd)}.`);
  if (seats <= n) throw new Error('No unused seats.');
  r.seatPrice ??= round2(r.amount / seats);
  const saved = round2((seats - n) * r.seatPrice);
  r.seats = n; r.amount = round2(r.seatPrice * n);
  s.stats.seatsRemoved += seats - n; s.stats.savedMonthly = round2(s.stats.savedMonthly + saved);
  return saved;
}
export function downgrade(state, recurringId) {
  const s = ensureSpend(state);
  const r = state.recurring.find((x) => x.id === recurringId);
  const opt = r && downgradeOption(r);
  if (!opt) throw new Error('No cheaper plan for this tool.');
  const before = r.amount;
  const seats = r.seats ?? 1;
  Object.assign(r, { amount: round2(opt.amount * seats), seatPrice: opt.amount, catalogId: opt.id, note: opt.plan, vendor: opt.vendor });
  s.stats.savedMonthly = round2(s.stats.savedMonthly + before - r.amount);
  return round2(before - r.amount);
}
/** Prepay a year at the annual discount. The card is charged now; the bill renews in 365 days. */
export function moveToAnnual(state, recurringId) {
  const r = state.recurring.find((x) => x.id === recurringId);
  if (!r || r.annual || r.variable) throw new Error('This bill cannot move to annual.');
  const amount = round2(r.amount * 12 * (1 - SPEND.annualDiscount));
  const a = authorizeCard(state, { vendor: r.vendor, category: r.category, amount });
  if (!a.ok) throw new Error(`Card declined: ${a.reason}.`);
  if (balance(state) < amount) throw new Error('Not enough in checking for the annual prepayment.');
  post(state, { amount: -amount, counterparty: r.vendor, description: `${r.vendor} annual plan (prepaid)`, category: r.category, method: 'card', meta: { annualPrepay: true } });
  r.annual = { amount, renewDay: state.day + 365, startDay: state.day };
  r.variable = true; // core/bank.js no longer bills it monthly; spendDay renews it
  return amount;
}
/** Cancel a tool bill (annual plans are not refunded). */
export function cancelTool(state, recurringId) {
  const s = ensureSpend(state);
  const i = state.recurring.findIndex((x) => x.id === recurringId);
  if (i < 0) throw new Error('Bill not found.');
  const [r] = state.recurring.splice(i, 1);
  if (r.annual && !isEssential(r)) prepaidChurn(state, r, r.annual, 'cancelled it');
  s.stats.savedMonthly = round2(s.stats.savedMonthly + (r.annual ? 0 : r.amount));
  return r;
}

// ---------------------------------------------------------------------------------------------------------
// Vendor contracts: what the negotiation adapter (apps/negotiate/vendor.js) reads and writes
// ---------------------------------------------------------------------------------------------------------

export const UPLIFT_CAPS = { none: null, cap7: 0.07, cap5: 0.05, lock: 0 };
const MONTHS_FOR_TERM = (t) => 12 * (Number(t) || 1);

/** Other vendors in the same tool class (a switch is a real alternative); a tool with no class has none the game knows of. */
export function vendorAlternatives(state, r) {
  const cls = toolClass(r.vendor);
  if (!cls) return 0;
  const names = new Set([...TOOL_CATALOG.map((t) => t.vendor), ...CREEP_TOOLS.map((t) => t.vendor)]);
  names.delete(r.vendor);
  return Math.min(2, [...names].filter((v) => toolClass(v) === cls).length);
}

/** Can this bill be negotiated now, and why not. */
export function vendorEligibility(state, recurringId) {
  const row = stackRows(state).find((x) => x.id === recurringId);
  const r = state.recurring.find((x) => x.id === recurringId);
  if (!row || !r) return { ok: false, reason: 'Bill not found.' };
  if (row.suspended || !(r.active || r.annual)) return { ok: false, reason: 'This vendor has suspended the account.' };
  if (row.monthly < VENDOR_NEG.minMonthly) return { ok: false, reason: `Below ${money(VENDOR_NEG.minMonthly)}/mo is not worth a sales rep's time; use the vendor's own annual toggle (Move to annual).` };
  const last = r.contract?.day;
  if (last != null && state.day - last < VENDOR_NEG.cooldownDays) return { ok: false, reason: `You agreed this contract ${state.day - last} days ago; the rep will not reopen it before renewal.` };
  if (r.annual) {
    const left = r.annual.renewDay - state.day;
    if (r.annual.priced) return { ok: false, reason: 'You already agreed the price for the next renewal.' };
    if (left > VENDOR_NEG.renewalWindowDays) return { ok: false, reason: `Renewal talks open about ${VENDOR_NEG.renewalWindowDays} days before the renewal (${fmtDate(state, r.annual.renewDay)}).` };
  } else if (r.variable) return { ok: false, reason: 'Usage-based bills have no contract to negotiate.' };
  if (r.noTalkUntil > state.day) return { ok: false, reason: `The rep went cold; try again after ${fmtDate(state, r.noTalkUntil)}.` };
  return { ok: true, row, r };
}

/** The facts a negotiation starts from (all readable by the player in the admin panel / invoice). */
export function vendorFacts(state, recurringId) {
  const e = vendorEligibility(state, recurringId);
  if (!e.ok) throw new Error(e.reason);
  const { row, r } = e;
  const s = ensureSpend(state);
  const annual = Boolean(r.annual);
  const listAnnual = annual ? renewalQuote(state, r) : round2(r.amount * 12);
  const seats = r.seats ?? 1;
  return { id: r.id, vendor: r.vendor, annual, listAnnual, currentAnnual: annual ? r.annual.amount : round2(r.amount * 12), seats, usage: Math.max(1, row.team ? row.activeUsers : 1), team: row.team && seats > 1,
    renewDay: annual ? r.annual.renewDay : null, daysToRenewal: annual ? r.annual.renewDay - state.day : null, alternatives: vendorAlternatives(state, r), unused: row.unused, uplift: annual ? upliftOf(s, r, r.annual) : null, category: r.category };
}

/**
 * Apply an agreed vendor package { price (annual), prepay, seats, renewCap, term, payment } to the bill. Returns a summary.
 * Prepaying posts the cash now (or falls back to monthly at the un-prepaid price when checking cannot fund it).
 */
export function applyVendorContract(state, recurringId, pkg, { negId = null, currentRunway = null } = {}) {
  const r = state.recurring.find((x) => x.id === recurringId);
  if (!r) throw new Error('Bill not found.');
  const s = ensureSpend(state);
  const row = stackRows(state).find((x) => x.id === recurringId);
  const facts = { seats: r.seats ?? 1, usage: Math.max(1, row?.team ? row.activeUsers : 1) };
  const before = r.annual ? round2(r.annual.amount / 12) : r.amount;
  const term = Number(pkg.term) || 1;
  const cap = UPLIFT_CAPS[pkg.renewCap] ?? null;
  const base = facts.seats;
  let newSeats = base;
  if (pkg.seats === 'right' && base > 1) newSeats = Math.max(1, facts.usage);
  else if (pkg.seats === 'over' && base > 1) newSeats = Math.ceil(Math.max(base, facts.usage) * VENDOR_NEG.overSeatPad);
  const total = round2(Number(pkg.price) * (newSeats / base));
  const out = { vendor: r.vendor, price: total, prepay: pkg.prepay, term, cap, seats: newSeats, cashNow: 0, prepayFailed: false };
  const contract = { negId, day: state.day, term, cap, seatCommit: pkg.seats === 'flex' || base <= 1 ? null : newSeats, seatsMode: pkg.seats ?? null, payment: pkg.payment ?? 'upfront', price: total };
  if (newSeats !== base) { r.seats = newSeats; }
  if (r.annual) {
    const a = r.annual;
    a.nextAmount = total; a.priced = true; a.cap = cap; a.termLeft = term - 1; a.negotiated = { negId, day: state.day };
    r.contract = contract;
    out.billing = 'annual';
  } else if (pkg.prepay === 'annual') {
    const a = authorizeCard(state, { vendor: r.vendor, category: r.category, amount: total });
    const cashBefore = balance(state);
    if (a.ok && cashBefore >= total) {
      post(state, { amount: -total, counterparty: r.vendor, description: `${r.vendor} annual contract (prepaid, negotiated)`, category: r.category, method: pkg.payment === 'upfront' || !pkg.payment ? 'card' : 'ach', meta: { annualPrepay: true, negotiated: true } });
      r.annual = { amount: total, renewDay: state.day + 365, startDay: state.day, cap, termLeft: term - 1, priced: false, negotiated: { negId, day: state.day } };
      r.variable = true;
      r.amount = round2(total / 12);
      out.cashNow = total; out.billing = 'annual';
      r.contract = contract;
      // runway after the prepay: the same burn on the cash that is left (currentRunway is the pre-payment figure)
      const runwayAfter = currentRunway != null && Number.isFinite(currentRunway) && cashBefore > 0 ? currentRunway * Math.max(0, cashBefore - total) / cashBefore : null;
      if (runwayAfter != null && runwayAfter < VENDOR_NEG.prepayShortRunwayMonths) {
        logNegMistake(state, 'prepay_squeezed_runway', { delayed: false, cost: { usd: round2(total * 0.06) }, key: `prepay_squeeze:${r.id}:${state.day}`,
          detail: `You paid ${r.vendor} $${Math.round(total).toLocaleString()} up front with about ${runwayAfter.toFixed(1)} months of runway left after it. The prepay discount is cash you no longer have when you need it (monthly billing keeps it as runway); with a short runway the saving rarely beats the optionality [design: ~6% carrying cost].` });
      }
    } else {
      // Cannot fund the prepay: the vendor keeps billing monthly, at the price without the prepay discount.
      const monthly = round2(Math.min(r.amount, total / (1 - SPEND.annualDiscount) / 12) );
      r.amount = monthly; r.contract = { ...contract, price: round2(monthly * 12), termEndDay: state.day + 365 * term };
      out.prepayFailed = true; out.billing = 'monthly'; out.price = round2(monthly * 12);
      notify(state, `${r.vendor}: your checking account could not fund the annual prepayment, so the contract stays monthly at $${monthly.toLocaleString()}/mo (no prepay discount).`, { type: 'warn', app: 'bank' });
    }
  } else {
    r.amount = round2(total / 12);
    r.contract = { ...contract, termEndDay: state.day + 365 * term };
    out.billing = 'monthly';
  }
  const after = r.annual ? round2((r.annual.priced ? r.annual.nextAmount : r.annual.amount) / 12) : r.amount;
  if (r.seats && r.seats > 0) r.seatPrice = round2(after / r.seats);
  if (after < before) s.stats.savedMonthly = round2(s.stats.savedMonthly + before - after);
  if (pkg.seats === 'over' && newSeats > facts.usage) {
    const extra = newSeats - Math.max(facts.usage, 1);
    const per = r.seatPrice ?? round2(total / 12 / newSeats);
    logNegMistake(state, 'overcommitted_seats', { cost: { usd: round2(extra * per * MONTHS_FOR_TERM(term)) }, key: `overseat:${r.id}:${state.day}`,
      detail: `You committed ${r.vendor} to ${newSeats} seats for ${term} year${term > 1 ? 's' : ''} with ${facts.usage} in use; the ${extra} extra seats cannot be removed until ${fmtDate(state, r.annual ? r.annual.renewDay : r.contract.termEndDay)}. A deeper per-seat price only pays if you grow into the seats.` });
  }
  out.monthlyBefore = before; out.monthlyAfter = after;
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Daily tick (called from the Bank app's onDay)
// ---------------------------------------------------------------------------------------------------------

export function spendDay(state) {
  const s = ensureSpend(state);
  const txns = state.bank.txns;
  if (s.scan > txns.length) s.scan = 0;
  for (let i = s.scan; i < txns.length; i++) {
    const t = txns[i];
    if (needsReceipt(t) && !s.receipts[t.id]) track(state, s, t);
  }
  s.scan = txns.length;
  syncSeats(state, s);
  syncSoftwareRequests(state, s);
  convertTrials(state, s);
  annualRenewals(state, s);
  contractExpiry(state, s);
  const monday = dayOfWeek(state) === 1;
  if (monday) {
    usageWeek(state, s);
    creepWeek(state, s);
    if (programOn(state) || activeMembers(state).length) for (const [i, m] of activeMembers(state).entries()) if (H(s, `team|${state.day}|${m.id}`) < SPEND.teamSpend.perMemberWeekly) newRequest(state, s, m, i);
  }
  remind(state, s, monday);
  lockCards(state, s);
  manageHolds(state);
  closeStatsDay(state, s);
  wasteWatch(state, s, monday);
}

function remind(state, s, monday) {
  const prog = programOn(state);
  const due = [];
  for (const [id, r] of Object.entries(s.receipts)) {
    if (r.status !== 'needed') continue;
    // Teammates answer reminders themselves (more often when the tool nags them).
    if (r.by) {
      const remindedToday = prog ? (state.day === r.firstReminder || (monday && state.day > r.firstReminder)) : monday;
      if (remindedToday && H(s, `member|${id}|${state.day}`) < (prog ? SPEND.memberSubmit.program : SPEND.memberSubmit.none)) { r.status = 'attached'; r.attachedDay = state.day; r.memo = 'Submitted by teammate'; continue; }
    }
    if (!prog || r.by) continue;
    if (state.day === r.firstReminder || (monday && state.day > r.firstReminder)) { r.reminders++; due.push(r); }
  }
  // A week before a lock, say so once (Ramp/Brex both warn before restricting a card).
  if (monday && prog && s.policy.autoLock) {
    const soon = Object.values(s.receipts).filter((r) => r.status === 'needed' && !r.by && state.day - r.day > s.policy.lockAfterDays - 7 && state.day - r.day <= s.policy.lockAfterDays);
    if (soon.length) notify(state, `${soon.length} receipt${soon.length === 1 ? '' : 's'} will lock your card within a week (policy: ${s.policy.lockAfterDays} days). Recurring bills on a locked card decline.`, { type: 'warn', app: 'bank' });
  }
  if (!due.length || !monday) return;
  const ref = `receipts-${Math.floor(state.day / 7)}`;
  const th = findThread(state, ref) ?? newThread(state, { subject: `Receipts needed: ${due.length} card transaction${due.length === 1 ? '' : 's'}`, with: { name: 'Spend management', email: 'receipts@spend.example' }, kind: 'vendor', app: 'bank', refId: ref });
  addMessage(state, th.id, { from: 'them', body: `You have ${due.length} card transaction${due.length === 1 ? '' : 's'} without a receipt:\n${due.slice(0, 8).map((r) => `• ${r.vendor} $${r.amount.toFixed(2)} on ${fmtDate(state, r.day)}`).join('\n')}${due.length > 8 ? `\n…and ${due.length - 8} more` : ''}\n\nReply with a photo or forward the email receipt. ${s.policy.autoLock ? `Cards lock when a receipt is more than ${s.policy.lockAfterDays} days overdue.` : ''}` });
}

// Receipts at close: share of the month's card charges still without a receipt 10 days after month-end.
function closeStatsDay(state, s) {
  const m = monthOf(state, state.day - SPEND.closeDay);
  const end = monthEndDay(state, m);
  if (state.day !== end + SPEND.closeDay || s.closeStats[m]) return;
  const recs = Object.values(s.receipts).filter((r) => monthOf(state, r.day) === m);
  if (!recs.length) return;
  const missing = recs.filter((r) => r.status === 'needed').length;
  const share = missing / recs.length;
  s.closeStats[m] = { n: recs.length, missing, share: round2(share), day: state.day };
  if (share > 0.25 && missing >= 3) {
    mistake(state, { functionId: 'bookkeeping_close_tax', id: 'missing_receipts_at_close', label: 'Closed the month with receipts missing', cost: { usd: missing * SPEND.cpaPerMissingReceipt, hours: round2(missing * 0.1) }, delayed: true, detail: `${missing} of ${recs.length} card charges in ${m} had no receipt at close (${Math.round(share * 100)}%). The books guess their categories worse and the CPA bills ~$${SPEND.cpaPerMissingReceipt} for each at year end.`, app: 'bank', key: `close:${m}` });
  }
}

// Paying for tools nobody uses: logged once per tool after 90 days unused.
function wasteWatch(state, s, monday) {
  if (!monday) return;
  for (const row of stackRows(state)) {
    if (!row.unused || state.day - row.lastUsedDay < 90) continue;
    mistake(state, { functionId: 'automation_ai', id: 'tool_stacking', label: 'Paying for a tool nobody uses', cost: { usd: round2(row.monthly * 3) }, delayed: true, detail: `${row.vendor} ($${row.monthly}/mo) has not been used for ${state.day - row.lastUsedDay} days${row.overlap ? `; it overlaps ${row.overlap}` : ''}${row.creep ? '; it started as a free trial nobody cancelled' : ''}.`, app: 'bank', key: `unused:${row.vendor}:${row.addedDay}` });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Read-outs for the operator reader, Books and the Automations app
// ---------------------------------------------------------------------------------------------------------

export function receiptStats(state, months = 3) {
  const s = ensureSpend(state);
  const keys = Object.keys(s.closeStats).sort().slice(-months);
  const rows = keys.map((k) => s.closeStats[k]);
  const n = sumBy(rows, (r) => r.n);
  return { months: keys.length, n, missing: sumBy(rows, (r) => r.missing), share: n ? sumBy(rows, (r) => r.missing) / n : null, open: missingReceipts(state).length };
}
/** Card charges in a year still without a receipt (the CPA bills each one). */
export const missingReceiptsInYear = (state, year) => Object.values(state.apps.bank?.spend?.receipts ?? {}).filter((r) => r.status === 'needed' && Number(monthOf(state, r.day).slice(0, 4)) === year).length;

/** Events for the Automations app: stable ids, a day, and the ids to fetch records. */
export function spendEvents(state, sinceDay = state.day) {
  const s = ensureSpend(state);
  const ev = [];
  for (const [id, r] of Object.entries(s.receipts)) if (r.status === 'needed' && r.firstReminder >= sinceDay && r.firstReminder <= state.day) ev.push({ id: `receipt_missing:${id}`, type: 'receipt_missing', day: r.firstReminder, txnId: id, amount: r.amount, vendor: r.vendor });
  for (const c of s.cards) if (c.locked && c.lockedDay >= sinceDay) ev.push({ id: `card_locked:${c.id}:${c.lockedDay}`, type: 'card_locked', day: c.lockedDay, cardId: c.id });
  for (const q of s.requests) if (q.status === 'pending' && q.day >= sinceDay) ev.push({ id: `spend_request:${q.id}`, type: 'spend_request', day: q.day, requestId: q.id, amount: q.amount });
  for (const t of s.trials) if (t.status === 'trial' && t.convertDay - 3 >= sinceDay && t.convertDay - 3 <= state.day) ev.push({ id: `trial_converting:${t.id}`, type: 'trial_converting', day: t.convertDay - 3, trialId: t.id });
  return ev;
}
