// Advice comes from people, not the dashboard (docs/design/advice-sources.md).
//
// The simulator always KNOWS what a stellar operator would have done (core/operator.js reads, data/operator-tiers.js).
// That knowledge is hidden truth: the player only hears it from a source they recruited and whose quality is hidden:
// an advisor, a paid consultant, a fractional exec, a mentor, a board member, peer founders or the AI Assistant.
// adviceFor() is the one gate: it takes the true lines and returns only what the recruited sources would actually say.
//
//   great     the correct, specific line (plus a hidden-truth hint, only with data access)
//   good      correct, less specific (first sentence, no detail)
//   average   a generic playbook line (tier behaviours), not about this player's actual problem
//   mediocre  generic filler or an off-target line from the same field, delivered with confidence
//   bad       confidently wrong advice from a per-function bias library; following it costs something (followAdvice)
// Biases (investor: raise and grow; consultant: more consulting; peers: what worked for us; outdated: old playbook)
// add a slanted line on top of any quality. No data access caps a source at "good". Two sources can disagree: both are returned.
//
// Learning mode (state.advice.learning, Settings "Built-in coaching", default OFF) is the training-wheels switch:
// adviceFor then returns every true line, tagged 'Coach (learning mode)'.
//
// Core module: imports only other core modules and the pure data table. Recruiting flows that touch apps
// (cap table, agencies roster, People) live in public/apps/advisors/recruit.js and call addSource().
// Deterministic: rng(state), uid() and hash() only. Numbers tagged [design] are game assumptions.

import { rng, hash, monthKey, uid } from './util.js';
import { readOperator, tierBehaviours, functionLabel, logMistake } from './operator.js';
import { OPERATOR_TIERS } from '../data/operator-tiers.js';
import { spendHours } from './state.js';
import { post, balance } from './bank.js';
import { ask as llmAsk, REALISM } from './llm.js';

export const COACH = { id: 'coach', name: 'Coach (learning mode)' };
export const QUALITIES = ['great', 'good', 'average', 'mediocre', 'bad'];
const QRANK = { great: 4, good: 3, average: 2, mediocre: 1, bad: 0 };
export const ACCESS = ['none', 'metrics', 'full'];
const ARANK = { none: 0, metrics: 1, full: 2 };
export const INBOX_CAP = 150;

// ---------------- Source kinds ----------------
// hoursPerMonth: how much of the source's time you can use (mentors are scarce); responseDays: delay before an answer
// lands; access: what they see by default; qualityMix: share of the market by hidden quality [design]; biases: default slant.
export const SOURCE_KINDS = {
  advisor:    { label: 'Startup advisor',      hoursPerMonth: 2,  responseDays: 3, access: 'metrics', qualityMix: { great: 0.1, good: 0.2, average: 0.3, mediocre: 0.3, bad: 0.1 }, askHours: 0.5, biases: [] },
  consultant: { label: 'Paid consultant',      hoursPerMonth: 10, responseDays: 2, access: 'metrics', qualityMix: { great: 0.1, good: 0.15, average: 0.25, mediocre: 0.38, bad: 0.12 }, askHours: 0.5, biases: ['consulting'] },
  fractional: { label: 'Fractional executive', hoursPerMonth: 16, responseDays: 1, access: 'full',    qualityMix: { great: 0.12, good: 0.28, average: 0.35, mediocre: 0.2, bad: 0.05 }, askHours: 0.5, biases: [] },
  mentor:     { label: 'Mentor / office hours', hoursPerMonth: 1, responseDays: 5, access: 'metrics', qualityMix: { great: 0.12, good: 0.28, average: 0.35, mediocre: 0.2, bad: 0.05 }, askHours: 1, biases: [] },
  board:      { label: 'Board member / lead investor', hoursPerMonth: 3, responseDays: 2, access: 'full', qualityMix: { great: 0.1, good: 0.3, average: 0.35, mediocre: 0.2, bad: 0.05 }, askHours: 0.5, biases: ['raise'] },
  peers:      { label: 'Peer founders',        hoursPerMonth: 6,  responseDays: 1, access: 'none',    qualityMix: { great: 0.05, good: 0.2, average: 0.35, mediocre: 0.3, bad: 0.1 }, askHours: 0.5, biases: ['peers'] },
  ai:         { label: 'AI Assistant',         hoursPerMonth: 999, responseDays: 0, access: 'none',   qualityMix: { mediocre: 1 }, askHours: 0.1, biases: [] },
};

// Which operator functions an expertise covers. '*' = everything (generalists, the AI Assistant).
export const EXPERTISE = {
  gtm: ['customer_fit', 'warm_intros', 'prospecting', 'cold_outreach', 'discovery_demo', 'deal_management', 'customer_success', 'account_expansion', 'rfp_bids', 'negotiation', 'gtm_comp_design', 'partnerships_channels', 'event_led_growth', 'linkedin_prospecting', 'account_based_marketing', 'signal_outreach'],
  growth: ['customer_fit', 'positioning_landing', 'paid_ads', 'content_seo_geo', 'launch_community_referral', 'lifecycle_activation', 'plg', 'owned_audience', 'app_store_optimization', 'consumer_app_growth', 'transactional_email'],
  product: ['product_prioritization', 'ai_building', 'customer_discovery', 'mvp_experiments', 'analytics_pmf', 'ai_cost_management'],
  pricing: ['pricing_packaging', 'payments_dunning', 'negotiation'],
  fundraising: ['fundraising', 'investor_relations', 'negotiation', 'cash_runway', 'startup_perks'],
  finance: ['cash_runway', 'bookkeeping_close_tax', 'payments_dunning', 'ai_cost_management', 'startup_perks'],
  legal: ['legal_hygiene', 'rfp_bids', 'negotiation'],
  people: ['hiring', 'global_hiring', 'people_management', 'people_ops', 'gtm_comp_design'],
  ops: ['founder_time', 'founder_sustainability', 'automation_ai', 'support'],
  technical: ['ai_building', 'ai_cost_management', 'automation_ai', 'transactional_email'],
  domain: ['customer_discovery', 'prospecting', 'positioning_landing', 'discovery_demo'],
  board: ['fundraising', 'investor_relations', 'cash_runway', 'analytics_pmf', 'negotiation', 'hiring', 'founder_sustainability', 'pricing_packaging', 'general'],
  general: ['*'],
};
// People fractional roles → expertise.
export const FRACTIONAL_EXPERTISE = { fractional_cfo: 'finance', fractional_cmo: 'growth', fractional_vp_sales: 'gtm', fractional_head_cs: 'gtm' };
// 'general' is the pseudo-function for cross-cutting items (warnings, the whole-company review).
const GENERALIST_KINDS = new Set(['board', 'advisor', 'mentor']);

// ---------------- Bias library: confidently wrong advice, per function ----------------
export const BAD_ADVICE = {
  fundraising: 'Raise now while the market is hot. A higher valuation matters more than who ends up on the cap table.',
  investor_relations: 'Keep updates to good news. Investors do not want to hear about problems until you have fixed them.',
  cash_runway: 'Spend ahead of revenue. You can always raise more once the numbers look good.',
  pricing_packaging: 'Cut price to win volume. You can raise it later once you have customers.',
  product_prioritization: 'Add more features. Customers who ask for one will buy, and a longer feature list closes more deals.',
  prospecting: 'Go enterprise. One big logo is worth a hundred small customers and solves your runway.',
  deal_management: 'Discount early to get it signed this quarter. You can recover the margin at renewal.',
  cold_outreach: 'It is a numbers game. Triple the send volume and add merge fields; the replies will follow.',
  customer_discovery: 'Skip the interviews and build it. Customers cannot tell you what they want until they see it.',
  hiring: 'Hire fast and for culture fit. You will sort out the skills once they are in.',
  paid_ads: 'Scale the budget as soon as one ad gets clicks. The platform will optimise it for you.',
  content_seo_geo: 'Publish daily with AI. Volume is how you win search.',
  support: 'Automate all of support with the AI agent and stop reading tickets. Customers prefer speed over accuracy.',
  legal_hygiene: 'Skip the legal setup until you have revenue. Lawyers are an expense for later.',
  bookkeeping_close_tax: 'Keep it in a spreadsheet and reconcile at year end. Your accountant can sort it out.',
  founder_sustainability: 'Push harder. The founders who win outwork everyone for the first two years.',
  analytics_pmf: 'Your NPS is great, so you have product-market fit. Scale.',
  mvp_experiments: 'Build the full product first. A landing page test proves nothing.',
  negotiation: 'Take the first good offer. Haggling signals that you are difficult.',
  customer_success: 'Wait for customers to ask for help. Reaching out just reminds them to cancel.',
  legal: 'Sign what the counterparty sends. Their paper is standard.',
  account_based_marketing: 'Put your 50 biggest logos in tier 1 and send each the same great email. Big accounts are where the money is.',
  signal_outreach: 'Buy an intent platform and message every account that surges. Tell them you saw they are researching; buyers like relevance.',
};
const BAD_DEFAULT = 'Move faster and do more of it. Volume solves most problems; process can come later.';
// Realistic cost when a wrong or off-target line is followed (traceable in the mistakes ledger) [design].
const FOLLOW_COST = {
  fundraising: { hours: 20, days: 30, reputation: 0.5 }, investor_relations: { hours: 4, reputation: 0.5 }, cash_runway: { usd: 4000, days: 14 },
  pricing_packaging: { customers: 1, hours: 4, usd: 800 }, product_prioritization: { hours: 40, days: 21 }, prospecting: { hours: 25, days: 28, usd: 1500 },
  deal_management: { usd: 2500, hours: 4 }, cold_outreach: { reputation: 1, hours: 8, usd: 300 }, customer_discovery: { hours: 60, days: 35 },
  hiring: { usd: 8000, hours: 20, days: 21 }, paid_ads: { usd: 3000, hours: 6 }, content_seo_geo: { hours: 20, reputation: 0.5 },
  support: { customers: 1, reputation: 1, hours: 6 }, legal_hygiene: { usd: 3000, hours: 8, days: 14 }, bookkeeping_close_tax: { usd: 1200, hours: 10 },
  founder_sustainability: { hours: 10, days: 7 }, analytics_pmf: { hours: 30, days: 28 }, mvp_experiments: { hours: 40, days: 28 },
  negotiation: { usd: 3000, hours: 3 }, customer_success: { customers: 1, hours: 6 },
  account_based_marketing: { hours: 20, days: 30, reputation: 0.3 }, signal_outreach: { usd: 1500, hours: 10, reputation: 0.3 },
};
const FOLLOW_DEFAULT = { hours: 6, days: 10 };
// Where the wasted money shows up in the books (bank.js CATEGORIES); anything else is 'other'.
const FOLLOW_CATEGORY = { paid_ads: 'advertising', hiring: 'recruiting', legal_hygiene: 'legal', bookkeeping_close_tax: 'accounting', cold_outreach: 'software', prospecting: 'software', signal_outreach: 'software', deal_management: 'other', negotiation: 'other', pricing_packaging: 'other', cash_runway: 'other' };

// Slanted lines a biased source adds on top of its quality.
const BIAS_LINES = {
  raise: {
    fundraising: 'You should be raising now. Growth beats efficiency at this stage, and the next round fixes the rest.',
    cash_runway: 'Do not shrink to extend runway. Raise, hire and grow into the next round.',
    investor_relations: 'Send the update with the growth story up front; investors fund momentum.',
    '*': 'Whatever the question, the answer is growth. Show momentum and raise on it.',
  },
  consulting: { '*': 'This is bigger than a founder should do alone. A dedicated engagement with outside specialists would pay for itself.' },
  peers: { '*': 'What worked for us was copying what the founders who made it did. Do what we did.' },
  growth: { '*': 'Push growth first; fix the retention and margin problems after you have scale.' },
  outdated: {
    cold_outreach: 'Buy a big list and blast it. That is how we built pipeline ten years ago.',
    paid_ads: 'Go broad on interest targeting and run a hundred small ad sets, like we did in my last company.',
    content_seo_geo: 'Write for keywords and build backlinks. That is still the whole game.',
    '*': 'The playbook that worked for me a decade ago still applies: hire a team, build a sales process, scale spend.',
  },
};
const FILLER = [
  'Stay focused, talk to customers and keep the basics tight. Most of this comes down to execution.',
  'Trust your instincts here and keep moving. Founders who keep shipping tend to figure it out.',
  'Make sure you are tracking the right numbers and review them every week.',
];

// ---------------- State ----------------
export function ensureAdvice(state) {
  state.advice ??= { v: 1, learning: false, sources: [], inbox: [], followed: [] };
  return state.advice;
}
export const learningMode = (state) => Boolean(state?.advice?.learning);
export function setLearningMode(state, on) { ensureAdvice(state).learning = Boolean(on); return learningMode(state); }

const A = (state) => ensureAdvice(state);
export const sources = (state, { all = false } = {}) => A(state).sources.filter((s) => all || s.status === 'active');
export const sourceById = (state, id) => A(state).sources.find((s) => s.id === id) ?? null;

/** Draw a hidden quality for a kind from its market mix, using the game's seeded stream. */
/** Deterministic draw keyed by a string (does not touch the main rng stream). */
export function drawQualityKeyed(state, kind, key) {
  const mix = SOURCE_KINDS[kind]?.qualityMix ?? SOURCE_KINDS.advisor.qualityMix;
  let r = (hn(`${state.seed ?? 0}|advice|${key}`) % 10000) / 10000;
  for (const q of QUALITIES) { const p = mix[q] ?? 0; if (r < p) return q; r -= p; }
  return 'average';
}
export function drawQuality(state, kind, bias = null) {
  const mix = SOURCE_KINDS[kind]?.qualityMix ?? SOURCE_KINDS.advisor.qualityMix;
  let r = rng(state);
  for (const q of QUALITIES) { const p = mix[q] ?? 0; if (r < p) return q; r -= p; }
  return bias ?? 'average';
}

/**
 * Add a source the player recruited. spec: { kind, name, role?, expertise | functions[], quality (hidden), biases?,
 * access?, hoursPerMonth?, responseDays?, cost?: { perHourUsd, perMonthUsd, equityPct, feeUsd }, refs?: {...}, quietAfterDays?, id? }.
 * Returns the stored source. Never charges anything: callers (recruit.js) post fees and equity.
 */
export function addSource(state, spec) {
  const K = SOURCE_KINDS[spec.kind];
  if (!K) throw new Error(`Unknown advice source kind: ${spec.kind}`);
  const functions = spec.functions ?? EXPERTISE[spec.expertise] ?? EXPERTISE.general;
  const src = {
    id: spec.id ?? uid('src'),
    kind: spec.kind,
    name: spec.name || K.label,
    role: spec.role || K.label,
    expertise: spec.expertise ?? null,
    functions: [...functions],
    quality: QRANK[spec.quality] != null ? spec.quality : 'average', // HIDDEN: never render
    biases: [...new Set([...(K.biases ?? []), ...(spec.biases ?? [])])],
    access: ARANK[spec.access] != null ? spec.access : K.access,
    hoursPerMonth: spec.hoursPerMonth ?? K.hoursPerMonth,
    responseDays: spec.responseDays ?? K.responseDays,
    cost: { perHourUsd: 0, perMonthUsd: 0, equityPct: 0, feeUsd: 0, ...(spec.cost ?? {}) },
    refs: spec.refs ?? {},
    quietAfterDays: spec.quietAfterDays ?? null,
    startDay: state.day ?? 0,
    status: 'active',
    used: { month: null, hours: 0 },
    asks: 0,
  };
  A(state).sources.push(src);
  return src;
}
export function endSource(state, id, reason = 'ended') {
  const s = sourceById(state, id);
  if (s) { s.status = reason === 'paused' ? 'paused' : 'ended'; s.endDay = state.day; }
  return s;
}
export function setAccess(state, id, access) {
  const s = sourceById(state, id);
  if (!s || ARANK[access] == null) return null;
  s.access = access;
  return s;
}
const isQuiet = (state, s) => s.quietAfterDays != null && state.day - s.startDay >= s.quietAfterDays;

/** True when this source's expertise covers the function. */
export function covers(source, functionId) {
  if (source.functions.includes('*')) return true;
  if (functionId === 'general') return GENERALIST_KINDS.has(source.kind) || source.functions.includes('general');
  return source.functions.includes(functionId);
}
/** Active sources that cover a function (not quiet, not ended). */
export const sourcesFor = (state, functionId) => sources(state).filter((s) => covers(s, functionId) && !isQuiet(state, s));

/** What a source's public profile can say (never the hidden quality). */
export function publicProfile(s) {
  return { id: s.id, kind: s.kind, kindLabel: SOURCE_KINDS[s.kind]?.label, name: s.name, role: s.role, functions: s.functions, access: s.access, hoursPerMonth: s.hoursPerMonth, responseDays: s.responseDays, cost: s.cost, status: s.status, startDay: s.startDay };
}

// ---------------- The gate ----------------
const sentences = (t) => String(t ?? '').trim().split(/(?<=[.!?])\s+(?=[A-Z])/);
const firstSentence = (t) => sentences(t)[0].replace(/\s*\([^)]*\)/g, '').trim();
const isStellarNag = (l) => /^What a stellar operator does:|^Stellar:|^A stellar operator:/i.test(l);
const hn = (s) => parseInt(hash(String(s)), 36) || 0; // numeric hash
const pickBy = (arr, key) => (arr.length ? arr[hn(key) % arr.length] : null);
const confidenceOf = (s, q) => {
  if (s.kind === 'ai') return 'low';
  if (q === 'bad' || q === 'mediocre') return hn(`${s.id}|c`) % 10 < 7 ? 'high' : 'medium'; // the least informed sound the surest
  if (q === 'great') return 'high';
  return q === 'good' ? (hn(`${s.id}|c`) % 2 ? 'high' : 'medium') : 'medium';
};

function item(state, s, functionId, kind, text, truth, extra = {}) {
  return {
    id: `adv_${hash(`${s.id}|${functionId}|${text}`)}`,
    text, from: s.name, sourceId: s.id, sourceKind: s.kind, functionId, kind, day: state.day,
    quality: s.quality, // internal: UI must never render this
    confidence: confidenceOf(s, s.quality), biased: truth === 'wrong' || Boolean(extra.biased), truth, ...extra,
  };
}

/** What one source says about a function. lines: the true lines. opts.truth: hidden-truth hints (great + data access only). */
export function sayFrom(state, s, functionId, lines, { kind = 'coaching', truth = [], share = null } = {}) {
  const access = share ?? s.access;
  const open = ARANK[access] > 0;
  let q = s.quality;
  if (!open && q === 'great') q = 'good'; // nobody can be specific about numbers they have not seen
  const real = lines.filter(Boolean);
  const specific = real.filter((l) => !isStellarNag(l));
  const out = [];
  const add = (text, t, extra) => { if (text) out.push(item(state, s, functionId, kind, s.kind === 'ai' ? `Generic best practice (I have no experience with your segment): ${text}` : text, t, extra)); };
  const playbook = () => pickBy([...tierBehaviours(functionId, 'stellar'), ...tierBehaviours(functionId, 'good')], `${s.id}|${functionId}|pb`);
  if (q === 'great') {
    for (const l of real.slice(0, 4)) add(l, 'true');
    if (open) for (const t of truth.slice(0, 2)) add(t, 'true', { hint: true });
  } else if (q === 'good') {
    for (const l of (specific.length ? specific : real).slice(0, 2)) add(firstSentence(l).slice(0, 160), 'true');
  } else if (q === 'average') {
    const b = playbook();
    if (b) add(`The usual playbook: ${b}${/[.!?]$/.test(b) ? '' : '.'}`, 'generic');
  } else if (q === 'mediocre') {
    const off = (OPERATOR_TIERS[functionId]?.traps ?? []).map((t) => t.coaching).filter((c) => c && !real.includes(c));
    if (s.kind === 'ai') { const b = playbook(); if (b) add(`${b}${/[.!?]$/.test(b) ? '' : '.'}`, 'generic'); }
    else if (off.length && hn(`${s.id}|${functionId}|o`) % 2) add(pickBy(off, `${s.id}|${functionId}|off`), 'offtarget');
    else add(pickBy(FILLER, `${s.id}|${functionId}|f`), 'generic');
  } else { // bad
    add(BAD_ADVICE[functionId] ?? BAD_DEFAULT, 'wrong');
  }
  for (const b of s.biases) {
    const lib = BIAS_LINES[b];
    const line = lib?.[functionId] ?? lib?.['*'];
    if (line && (q !== 'bad' || !out.some((o) => o.truth === 'wrong'))) out.push(item(state, s, functionId, kind, line, 'wrong', { biased: true, bias: b }));
  }
  return out;
}

export function recordAdvice(state, items) {
  const inbox = A(state).inbox;
  for (const it of items) {
    if (inbox.some((x) => x.id === it.id)) continue;
    inbox.push({ ...it, followed: null, readyDay: state.day });
  }
  while (inbox.length > INBOX_CAP) { const i = inbox.findIndex((x) => x.followed == null); inbox.splice(i < 0 ? 0 : i, 1); }
}

/**
 * THE GATE. Given the true lines a function would produce, return only what the recruited sources covering it would say.
 * lines: string[] (or a single string); opts: { kind: 'coaching'|'lesson'|'warning'|'habit'|'odds', truth: string[] hidden hints,
 * record: true (add new items to the Advisors inbox) }.
 * Returns [{ id, text, from, sourceId, sourceKind, functionId, kind, quality*, confidence, biased, truth, day }].
 * (*quality and truth classify the line internally; the UI shows `from` and `confidence`, never those.)
 * Learning mode: every true line, from 'Coach (learning mode)'. No source: [].
 */
export function adviceFor(state, functionId, lines = [], opts = {}) {
  const { kind = 'coaching', truth = [], record: rec = true } = opts;
  const list = [].concat(lines).filter(Boolean).map(String);
  if (learningMode(state)) {
    return list.map((text) => ({ id: `adv_${hash(`coach|${functionId}|${text}`)}`, text, from: COACH.name, sourceId: COACH.id, sourceKind: 'coach', functionId, kind, day: state.day, quality: 'great', confidence: 'high', biased: false, truth: 'true' }));
  }
  const items = [];
  for (const s of sourcesFor(state, functionId)) items.push(...sayFrom(state, s, functionId, list, { kind, truth }));
  if (rec) recordAdvice(state, items);
  return items;
}

/** The function's coaching through the gate: reads the function (internal truth) and gates its lines. */
export function adviceForFunction(state, functionId, opts = {}) {
  const r = readOperator(state, functionId);
  return adviceFor(state, functionId, r.coaching, opts);
}

/** Pairs of items from different sources that point opposite ways (one true, one wrong). */
export function conflicts(items) {
  const out = [];
  for (const a of items) for (const b of items) if (a.truth === 'true' && b.truth === 'wrong' && a.sourceId !== b.sourceId) out.push({ true: a, wrong: b });
  return out;
}

/**
 * A per-function review for the Scorecard. { learning, covered, reviewer: 'Board review'|'Advisor review'|'Coach (learning mode)',
 * tier, evidence, items, by: [names], needsData: [names] }. The tier and evidence are revealed only by learning mode or a source
 * with good-or-better judgement AND data access; weaker sources give only their lines. Nothing is revealed with no source.
 */
export function reviewFor(state, functionId, read = null) {
  const r = read ?? readOperator(state, functionId);
  if (learningMode(state)) return { learning: true, covered: true, reviewer: COACH.name, tier: r.tier, evidence: r.evidence, items: adviceFor(state, functionId, r.coaching), by: [COACH.name], needsData: [] };
  const cov = sourcesFor(state, functionId);
  if (!cov.length) return { learning: false, covered: false, reviewer: null, tier: null, evidence: [], items: [], by: [], needsData: [] };
  const sees = cov.filter((s) => ARANK[s.access] > 0);
  const judges = sees.filter((s) => QRANK[s.quality] >= QRANK.good);
  const board = cov.some((s) => s.kind === 'board');
  return {
    learning: false, covered: true, reviewer: board ? 'Board review' : 'Advisor review',
    tier: judges.length ? r.tier : null, evidence: judges.length ? r.evidence : [],
    items: adviceFor(state, functionId, r.coaching), by: cov.map((s) => s.name), needsData: cov.filter((s) => s.access === 'none').map((s) => s.name),
  };
}

/** Whether a source of this kind is recruited (Scorecard: luck odds appear with a board or in learning mode). */
export const hasSource = (state, kind) => sources(state).some((s) => s.kind === kind);

// ---------------- Lessons (logMistake) ----------------
/** The lesson of a mistake entry through the gate (empty when no source/learning covers it). */
export function lessonFor(state, entry) {
  if (!entry?.lesson) return [];
  return adviceFor(state, entry.functionId, [entry.lesson], { kind: 'lesson' });
}

// ---------------- Following advice ----------------
/**
 * The player acts on an inbox item. Records it ({ adviceId, sourceId, functionId, text, day, truth }) so later systems can trace
 * outcomes. Wrong advice costs something real, logged as a delayed mistake that names the source; off-target filler wastes a little time.
 * Good, generic and learning-mode lines cost nothing here (their effect is whatever the player then does).
 */
export function followAdvice(state, adviceId) {
  const a = A(state);
  const it = a.inbox.find((x) => x.id === adviceId);
  if (!it) throw new Error('That advice is not in your inbox.');
  if (it.followed != null) return { followed: it, mistake: null };
  it.followed = state.day;
  const rec = { adviceId, sourceId: it.sourceId, from: it.from, functionId: it.functionId, text: it.text, day: state.day, truth: it.truth };
  a.followed.push(rec);
  if (a.followed.length > 200) a.followed.splice(0, a.followed.length - 200);
  let mistake = null;
  if (it.truth === 'wrong' || it.truth === 'offtarget') {
    const base = it.truth === 'wrong' ? (FOLLOW_COST[it.functionId] ?? FOLLOW_DEFAULT) : { hours: 3 };
    mistake = logMistake(state, {
      functionId: it.functionId, id: `followed_bad_advice`, label: it.truth === 'wrong' ? 'Followed confident but wrong advice' : 'Followed advice that did not fit',
      cost: base, delayed: true, circles: it.truth === 'offtarget', app: 'advisors', key: `advice:${adviceId}`, charge: true,
      detail: `You acted on advice from ${it.from} (${functionLabel(it.functionId)}): "${it.text}" It did not hold up against your own numbers, and the time and money went into it anyway.`,
    });
    rec.mistakeUid = mistake?.uid ?? null;
    // The money the ledger says went into it really leaves the bank (hours are charged by logMistake above).
    const usd = Math.round((base.usd ?? 0) * 100) / 100;
    if (mistake && usd > 0) post(state, { amount: -usd, counterparty: functionLabel(it.functionId), description: `Spent acting on advice from ${it.from}`, category: FOLLOW_CATEGORY[it.functionId] ?? 'other', method: 'card', meta: { app: 'advisors', adviceId } });
  }
  return { followed: it, mistake };
}

// ---------------- Asking a source ----------------
const KEYWORDS = [
  [/raise|investor|valuation|safe\b|term sheet|round/i, 'fundraising'], [/runway|cash|burn/i, 'cash_runway'], [/price|pricing|tier|discount/i, 'pricing_packaging'],
  [/hire|hiring|candidate|recruit/i, 'hiring'], [/outbound|cold email|outreach/i, 'cold_outreach'], [/prospect|icp|list/i, 'prospecting'],
  [/deal|close|proposal|negotiat/i, 'deal_management'], [/churn|renew|retention|customer success/i, 'customer_success'], [/support|ticket/i, 'support'],
  [/seo|content|blog|geo\b/i, 'content_seo_geo'], [/ads?\b|paid|cac|meta|google ads/i, 'paid_ads'], [/interview|discovery|mom test/i, 'customer_discovery'],
  [/feature|roadmap|prioriti|spec/i, 'product_prioritization'], [/pmf|product-market|retention curve|survey/i, 'analytics_pmf'], [/legal|contract|gdpr|83\(b\)|incorporat/i, 'legal_hygiene'],
  [/tax|books|bookkeep|close/i, 'bookkeeping_close_tax'], [/burnout|burn out|hours|quit|sustain/i, 'founder_sustainability'], [/launch|community|referral/i, 'launch_community_referral'],
  [/landing|positioning|website/i, 'positioning_landing'], [/board|update/i, 'investor_relations'], [/mvp|smoke test|concierge/i, 'mvp_experiments'],
];
export function inferFunction(question, source = null) {
  for (const [re, fn] of KEYWORDS) if (re.test(question) && (!source || covers(source, fn))) return fn;
  for (const [re, fn] of KEYWORDS) if (re.test(question)) return fn;
  return source?.functions.find((f) => f !== '*') ?? 'general';
}

const money0 = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
/** A plain summary of the numbers the player chose to share (nothing hidden). */
export function sharedFacts(state, share) {
  if (ARANK[share] === 0) return [];
  const d = state.metrics?.daily?.at?.(-1);
  const out = [];
  if (d) out.push(`MRR ${money0(d.mrr ?? 0)}`, `${d.customers ?? 0} paying customers`, `cash ${money0(d.cash ?? 0)}`);
  if (share === 'full') {
    const one = state.company?.oneLiner, icp = state.company?.icp;
    if (one) out.push(`one-liner: ${one}`);
    if (icp) out.push(`ideal customer: ${icp}`);
  }
  return out;
}

function personaPrompt(s, fn, share, points, facts) {
  const q = s.quality;
  const style = q === 'great' ? 'You have deep, directly relevant operating experience and you are specific and candid.'
    : q === 'good' ? 'You have solid experience and give sound but fairly high-level advice.'
    : q === 'average' ? 'You give standard textbook advice and do not tailor it much.'
    : q === 'bad' ? 'You are confident and opinionated but your experience is from a different context, so your advice is often wrong for this founder.'
    : 'Your experience is thin here. You answer in generalities with great confidence and cannot be specific.';
  const bias = s.biases.length ? `You lean toward: ${s.biases.map((b) => ({ raise: 'raising money and growing fast', consulting: 'recommending more outside help', peers: 'what worked for you and your friends', growth: 'growth over everything', outdated: 'an older playbook' }[b] ?? b)).join('; ')}.` : '';
  const ai = s.kind === 'ai' ? 'You are a generic AI assistant: you have no first-hand experience in this founder\'s segment and you say so honestly.' : '';
  return `${REALISM}\nYou are ${s.name}, ${s.role}. Area of expertise: ${functionLabel(fn)}. ${style} ${bias} ${ai}\nThe founder shared this with you: ${share === 'none' ? 'nothing about their company' : facts.join('; ') || 'nothing yet'}. Never state facts about their company that are not in that list; if you lack data, say what you would want to see. Make exactly these points in your own voice in 2-4 sentences: ${points.map((p) => `"${p}"`).join(' ')} Do not add other specific recommendations.`;
}

/**
 * Ask a source a question. Costs founder hours (and the source's hourly fee, if any), uses up some of its monthly time.
 * opts: { share: 'none'|'metrics'|'full' (default: the source's standing access), functionId, truth: string[] hidden hints,
 * hours, llm: injectable ask fn (tests) }. Returns Promise<{ id, sourceId, from, functionId, text, items, confidence, mock, readyDay,
 * costUsd, hours, shared }>. LLM persona when live, deterministic fallback built from the gate otherwise. The prompt
 * contains only the points the gate lets this source make and the data shared; hidden truth reaches it only for a great source
 * with data shared. Throws if the source is quiet, out of time this month, or unaffordable.
 */
export async function ask(state, sourceId, question, opts = {}) {
  const s = sourceById(state, sourceId);
  if (!s || s.status !== 'active') throw new Error('You are not working with that source.');
  if (isQuiet(state, s)) throw new Error(`${s.name} has gone quiet. Advisors who are not kept engaged stop answering.`);
  const K = SOURCE_KINDS[s.kind];
  const hours = opts.hours ?? K.askHours;
  const mk = monthKey(state);
  if (s.used.month !== mk) s.used = { month: mk, hours: 0 };
  if (s.used.hours + hours > s.hoursPerMonth + 1e-9) throw new Error(`${s.name} has no time left this month (${s.hoursPerMonth} h a month).`);
  const fee = Math.round((s.cost.perHourUsd || 0) * hours * 100) / 100;
  if (fee > 0 && balance(state) < fee) throw new Error(`Not enough cash: ${s.name} bills ${money0(fee)} for this conversation.`);
  const share = ARANK[opts.share] != null ? opts.share : s.access;
  const fn = opts.functionId ?? inferFunction(String(question ?? ''), s);
  spendHours(state, hours, `Asking ${s.name}`);
  if (fee > 0) post(state, { amount: -fee, counterparty: s.name, description: `${s.name}: advice session`, category: 'contractors', method: 'ach', meta: { app: 'advisors', sourceId: s.id } });
  s.used.hours += hours;
  s.asks++;

  const lines = readOperator(state, fn).coaching;
  const items = sayFrom(state, s, fn, lines, { kind: 'answer', truth: opts.truth ?? [], share });
  const facts = sharedFacts(state, share);
  const points = items.map((i) => i.text);
  const fallbackText = () => {
    const lead = share === 'none' ? `Without seeing your numbers I can only speak generally. ` : facts.length ? `From what you shared (${facts.slice(0, 3).join(', ')}): ` : '';
    const body = points.length ? points.join(' ') : (ARANK[share] ? 'Nothing stands out to me from what I can see.' : 'I would need to see your numbers before saying anything specific.');
    return `${lead}${body}`;
  };
  const schema = { type: 'object', additionalProperties: false, required: ['answer'], properties: { answer: { type: 'string' } } };
  const call = opts.llm ?? llmAsk;
  const res = await call({
    task: 'advice_answer', system: personaPrompt(s, fn, share, points.length ? points : ['Say you would need more detail.'], facts), prompt: String(question ?? '').slice(0, 1500),
    schema, maxTokens: 400, temperature: 0.6, cache: state.cache, fallback: () => ({ answer: fallbackText() }),
  });
  const text = String(res?.data?.answer || fallbackText()).slice(0, 1500);
  const truth = items.some((i) => i.truth === 'wrong') ? 'wrong' : items.some((i) => i.truth === 'offtarget') ? 'offtarget' : items.length && items.every((i) => i.truth === 'true') ? 'true' : 'generic';
  const ans = {
    id: `ans_${hash(`${s.id}|${fn}|${question}|${state.day}|${s.asks}`)}`, sourceId: s.id, from: s.name, sourceKind: s.kind, functionId: fn, kind: 'answer',
    text, items, confidence: confidenceOf(s, s.quality), mock: Boolean(res?.mock), readyDay: state.day + s.responseDays, costUsd: fee, hours, shared: share,
    question: String(question ?? '').slice(0, 300), day: state.day, quality: s.quality, truth, biased: items.some((i) => i.biased),
  };
  const inbox = A(state).inbox;
  inbox.push({ ...ans, items: undefined, followed: null });
  recordAdvice(state, items.map((i) => ({ ...i, readyDay: ans.readyDay })));
  while (inbox.length > INBOX_CAP) { const i = inbox.findIndex((x) => x.followed == null); inbox.splice(i < 0 ? 0 : i, 1); }
  return ans;
}

/** Inbox items that have arrived (response delay passed), newest first. */
export const inbox = (state) => A(state).inbox.filter((x) => (x.readyDay ?? 0) <= state.day).slice().reverse();

// ---------------- Daily upkeep ----------------
/** Monthly fees for sources billed here (peer groups, retainers); a source you cannot pay is paused. Call from an app's onDay. */
export function adviceDay(state) {
  const a = A(state);
  const mk = monthKey(state);
  for (const s of a.sources) {
    if (s.status !== 'active' || !(s.cost.perMonthUsd > 0) || s.refs.billedElsewhere) continue;
    if (s.billedMonth === mk) continue;
    s.billedMonth = mk;
    if (balance(state) < s.cost.perMonthUsd) { s.status = 'paused'; continue; }
    post(state, { amount: -s.cost.perMonthUsd, counterparty: s.name, description: `${s.name}: monthly fee`, category: 'contractors', method: 'ach', meta: { app: 'advisors', sourceId: s.id } });
  }
}

