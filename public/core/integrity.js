// Integrity: the real-world checks that stop people getting away with lying (docs/research/verification/*).
// A misstatement is not punished when it is told. It is RECORDED with the truth at that moment, can pass early
// (people mostly take numbers at face value), and is caught later by a verification event whose odds depend on how
// big the lie is and how strong the check is (pitch smell test < angel < confirmatory diligence < audit / QoE /
// lender data feeds). Getting caught costs the deal, reputation that spreads through that audience's network, and
// a traceable mistake; a lie that survives keeps a latent liability that later checks can still find.
//
// Pure-ish core module: no app imports. Callers pass the ground-truth metrics object (e.g. computeMetrics(state)).

import { rng, uid } from './util.js';
import { logMistake } from './operator.js';
import { notify } from './state.js';

// ---- Detection odds ----
// p(caught) = pMax · (1 − e^(−gap/k)), gap = relative overstatement (0.25 = 25% above the truth; booleans = 1).
// Anchors (money-deals.md §1–4, all [design] — nobody publishes "share of lies caught"): confirmatory diligence
// ≈30% at a 5–10% inflation, ≈80% at 25–50%, 95%+ at 2× or invented customers; pitch stage 3–35% by size; angels
// lower; audits, QoE and lender bank/Plaid feeds near-certain for material gaps.
export const CHECKS = {
  pitch: { pMax: 0.4, k: 0.5, label: 'pitch smell test' },
  angel: { pMax: 0.25, k: 0.6, label: 'angel check' },
  reference: { pMax: 0.7, k: 0.35, label: 'reference calls' },
  confirmatory: { pMax: 0.97, k: 0.2, label: 'confirmatory diligence (Stripe, bank and books access)' },
  audit: { pMax: 0.995, k: 0.08, label: 'audit / quality of earnings / lender data feed' },
  // Forged supporting documents (edited bank statements, fake pay stubs) put through a bank's process: fraud units,
  // IRS 4506-C transcript mismatches and Plaid cross-checks catch 60-80% (money-deals.md §3.1, [design]).
  forensic: { pMax: 0.75, k: 0.15, label: 'document forensics (4506-C transcript match, statement verification)' },
};
// Rounding is not lying: within 5% (or a trivial absolute amount) of the truth counts as accurate [design].
export const TOLERANCE = { rel: 0.05, abs: { mrr: 500, customers: 2, growth: 0.02, nrr: 0.03, churn: 0.01, runway: 1, rating: 0.15, reviews: 3 } };

/**
 * A deterministic draw in [0,1) that does NOT consume the main rng stream: adding a verification hazard to a daily
 * tick then never reshuffles unrelated luck (customers, candidates) in the same run. Same state + salt + day → same draw.
 */
export function sideRoll(state, salt) {
  let h = 0x811c9dc5;
  const str = `${salt}|${state.seed}|${state.day ?? 0}`;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return rng({ seed: h | 0 });
}
/** A roll function for verify(): one side draw per claim checked. */
export const sideRoller = (state, salt) => { let i = 0; return () => sideRoll(state, `${salt}|${i++}`); };

export function detectP(gap, check) {
  const c = CHECKS[check] ?? CHECKS.pitch;
  if (!(gap > 0)) return 0;
  return c.pMax * (1 - Math.exp(-gap / c.k));
}

// ---- Claim extraction from free text ----
const NUM = '(\\d+(?:[.,]\\d+)?)\\s?(k|m|thousand|million)?';
const scale = (v, u) => parseFloat(String(v).replace(/,/g, '')) * (/^(k|thousand)$/i.test(u ?? '') ? 1e3 : /^(m|million)$/i.test(u ?? '') ? 1e6 : 1);
const GOAL_BEFORE = /\b(reach|reaches|reaching|will|would|could|target(ing)?|goal|plan(ning)?|forecast|projected|projecting|aim(ing)?|expect(ing)?|get(ting)? (us )?to|grow(ing)? to|path to|toward|towards|hit|by|next year|in \d+ months)\b[^.\n]{0,25}$/i;
const GOAL_AFTER = /^[^.\n]{0,12}\b(in|within|by)\s+(\d+\s+(months?|years?|quarters?)|q[1-4]|the next|next|20\d\d|end of)|^[^.\n]{0,6}\((goal|target|plan|projected)\)/i;
const PAST = /\b(previous|prior|former|last (company|startup|job|role)|at my|ex-|before (this|that|founding)|when i (was|led|ran))\b/i;

/** [{ metric, value, text }] — present-tense claims about this company. value units: mrr $/mo, customers count,
 *  growth/nrr/churn as fractions (0.15 = 15%), runway months. */
export function extractClaims(text) {
  const t = String(text ?? '');
  const out = [];
  const keep = (x) => {
    const before = t.slice(Math.max(0, x.index - 70), x.index), after = t.slice(x.index + x[0].length, x.index + x[0].length + 40);
    return !GOAL_BEFORE.test(before) && !GOAL_AFTER.test(after) && !PAST.test(before + x[0] + after);
  };
  const add = (metric, re, fn) => { for (const x of t.matchAll(re)) if (keep(x)) { const v = fn(x); if (Number.isFinite(v) && v >= 0) out.push({ metric, value: v, text: x[0].trim() }); } };
  // MRR / monthly revenue
  add('mrr', new RegExp(`\\$?\\s?${NUM}\\s*(?:in\\s+)?(?:mrr|monthly recurring revenue)\\b`, 'gi'), (x) => scale(x[1], x[2]));
  add('mrr', new RegExp(`\\bmrr\\b\\s*(?:of|is|at|:|=|—|-)?\\s*\\$?\\s?${NUM}`, 'gi'), (x) => scale(x[1], x[2]));
  add('mrr', new RegExp(`\\$\\s?${NUM}\\s*(?:/\\s?mo(?:nth)?\\b|per month|a month|monthly)(?:\\s+(?:in\\s+)?(?:recurring\\s+)?(?:revenue|rev))?`, 'gi'), (x) => scale(x[1], x[2]));
  add('mrr', new RegExp(`\\b(?:revenue|making|make|bring(?:ing)? in)\\s+(?:of\\s+)?\\$\\s?${NUM}\\s*(?:/\\s?mo|per month|a month|monthly)`, 'gi'), (x) => scale(x[1], x[2]));
  // ARR / annual run rate (→ monthly)
  add('mrr', new RegExp(`\\$?\\s?${NUM}\\s*(?:in\\s+)?(?:arr|annual(?:ized)? recurring revenue|(?:annual )?run[- ]rate)\\b`, 'gi'), (x) => scale(x[1], x[2]) / 12);
  add('mrr', new RegExp(`\\b(?:arr|annual run[- ]rate|run[- ]rate)\\b\\s*(?:of|is|at|:|=|—|-)?\\s*\\$?\\s?${NUM}`, 'gi'), (x) => scale(x[1], x[2]) / 12);
  // Customers
  add('customers', /(\d[\d,]*)\+?\s+(?:paying\s+|enterprise\s+|active\s+|b2b\s+)?(?:customers|clients|logos|accounts|teams|companies|businesses)\b(?!\s+(?:in|on) (?:our|the) (?:waitlist|pipeline))/gi, (x) => +x[1].replace(/,/g, ''));
  add('customers', /\b(?:customer base|customers?)\s+(?:of|:|=)\s*(\d[\d,]*)\+?/gi, (x) => +x[1].replace(/,/g, ''));
  // Growth (MoM), NRR, churn, runway
  add('growth', /(\d+(?:\.\d+)?)\s?%\s*(?:mom|m\/m|month[- ]over[- ]month|monthly growth|growth (?:per|a|each) month)/gi, (x) => +x[1] / 100);
  add('growth', /\bgrowing\s+(\d+(?:\.\d+)?)\s?%\s*(?:a|per|each|every)\s+month/gi, (x) => +x[1] / 100);
  add('nrr', /(\d+(?:\.\d+)?)\s?%\s*(?:nrr|ndr|net (?:revenue|dollar) retention)/gi, (x) => +x[1] / 100);
  add('nrr', /\b(?:nrr|ndr|net (?:revenue|dollar) retention)\b\s*(?:of|is|at|:)?\s*(\d+(?:\.\d+)?)\s?%/gi, (x) => +x[1] / 100);
  add('churn', /(\d+(?:\.\d+)?)\s?%\s*(?:monthly\s+)?(?:logo\s+|revenue\s+)?churn/gi, (x) => +x[1] / 100);
  add('churn', /\bchurn\b\s*(?:of|is|at|:|under|below)?\s*(\d+(?:\.\d+)?)\s?%/gi, (x) => +x[1] / 100);
  add('runway', /(\d+(?:\.\d+)?)\s*months?\s+(?:of\s+)?runway/gi, (x) => +x[1]);
  add('runway', /\brunway\b\s*(?:of|is|:)?\s*(\d+(?:\.\d+)?)\s*months?/gi, (x) => +x[1]);
  // Dedupe identical metric/value pairs
  const seen = new Set();
  return out.filter((c) => { const k = `${c.metric}:${Math.round(c.value * 1000)}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// Lies are in the flattering direction: more revenue, customers, growth, retention or runway; less churn.
const LOWER_IS_BETTER = new Set(['churn', 'burn']);
export function truthOf(m, metric) {
  if (!m) return null;
  switch (metric) {
    case 'mrr': return m.mrr ?? 0;
    case 'customers': return m.customers ?? 0;
    case 'growth': return m.momGrowth ?? 0;
    case 'nrr': return m.nrr ?? null; // claims like "120% NRR" are annual, as is computeMetrics().nrr
    case 'churn': return m.revenueChurn ?? null;
    case 'runway': return Number.isFinite(m.runwayMonths) ? m.runwayMonths : null;
    default: return null;
  }
}

/** Relative overstatement in the flattering direction; 0 when accurate within tolerance. */
export function claimGap(metric, claimed, truth) {
  if (typeof claimed === 'boolean') return claimed && !truth ? 1 : 0; // before the numeric guard: Number.isFinite(true) is false
  if (truth == null || !Number.isFinite(claimed)) return 0;
  if (metric === 'uptime') return uptimeGap(claimed, truth);
  const abs = TOLERANCE.abs[metric] ?? 0;
  const diff = LOWER_IS_BETTER.has(metric) ? truth - claimed : claimed - truth;
  if (diff <= Math.max(abs, Math.abs(truth) * TOLERANCE.rel)) return 0;
  if (metric === 'nrr' || metric === 'growth' || metric === 'churn') return Math.min(3, diff / Math.max(0.05, Math.abs(truth) || 0.05));
  return Math.min(3, diff / Math.max(LOWER_IS_BETTER.has(metric) ? 0.01 : 1, Math.abs(truth) || (metric === 'mrr' ? 1000 : 1)));
}

// ---- Ledger ----
export function ensureIntegrity(state) {
  state.integrity ??= {};
  const I = state.integrity;
  I.claims ??= []; // { id, day, audience, recipientId, channel, metric, claimed, truth, gap, status: 'open'|'caught'|'survived', checks: [] }
  I.score ??= 1; // 1 = clean record; falls when lies are caught
  I.reputation ??= {}; // audience → 0..1 penalty spreading through that network (investors talk; buyers talk)
  I.incidents ??= [];
  return I;
}

/**
 * Record what a party was told. Returns the material misstatements (gap > 0). Accurate claims are recorded too,
 * so later checks can confirm them (and so a stale-but-true number is never treated as a lie).
 * audience: 'investor' | 'angel' | 'board' | 'lender' | 'acquirer' | 'customer' | 'candidate' | 'cofounder' | 'accelerator' | ...
 */
export function recordClaims(state, { audience, recipientId = null, channel = '', text = '', claims = null, truth }) {
  const I = ensureIntegrity(state);
  const list = claims ?? extractClaims(text);
  const out = [];
  for (const c of list) {
    // Explicit truths (booleans, or numeric claims about things computeMetrics() does not know, like a FICO score or
    // a brokerage balance) are taken as given; otherwise the truth is read from the metrics object.
    const tv = typeof c.claimed === 'boolean' || c.truth !== undefined ? c.truth : truthOf(truth, c.metric);
    const claimed = c.claimed ?? c.value;
    const gap = c.gap ?? claimGap(c.metric, claimed, tv);
    // Ids come from a per-game sequence: recording a claim must not shift the global id stream other draws hash on.
    const rec = { id: `clm_${(I.seq = (I.seq ?? 0) + 1).toString(36)}`, day: state.day ?? 0, audience, recipientId, channel, metric: c.metric, claimed, truth: tv, gap: Math.round(gap * 1000) / 1000, text: c.text ?? '', status: gap > 0 ? 'open' : 'accurate', checks: [], ...(c.kind ? { kind: c.kind } : {}) }; // kind 'hygiene' = an undisclosed gap (legal/compliance), not a lie told
    I.claims.push(rec);
    if (gap > 0) out.push(rec);
  }
  if (I.claims.length > 600) I.claims.splice(0, I.claims.length - 600);
  return out;
}

// metrics: optional list to restrict to (e.g. reference calls only test customer claims).
export const openLies = (state, { audience = null, recipientId = null, metrics = null } = {}) =>
  ensureIntegrity(state).claims.filter((c) => c.status === 'open' && (audience == null || c.audience === audience) && (recipientId == null || c.recipientId === recipientId) && (metrics == null || metrics.includes(c.metric)));

/**
 * A verification event. Rolls each open lie told to this audience/recipient against the check's strength.
 * Returns { caught: [...claims], survived: [...claims], maxGap }. Caught claims are marked; survivors stay open
 * (a later, stronger check can still find them) unless `final` (the last chance this party gets).
 */
export function verify(state, { audience = null, recipientId = null, metrics = null, check = 'confirmatory', final = false, roll = () => rng(state), filter = null, pMult = 1, checkFor = null } = {}) {
  // metrics: only these claim metrics; filter: only the claims this check can see (a security review reads controls,
  // not revenue); pMult: rigor of this particular check (a scoped, paid PoC vs a loose design partnership);
  // checkFor(claim): a per-claim check strength when one event checks different kinds of claims differently.
  const lies = openLies(state, { audience, recipientId, metrics }).filter((c) => !filter || filter(c));
  const caught = [], survived = [];
  for (const c of lies) {
    const ck = checkFor ? checkFor(c) : check;
    if (!ck) continue;
    c.checks.push({ day: state.day ?? 0, check: ck });
    if (roll() < Math.min(1, detectP(c.gap, ck) * pMult)) { c.status = 'caught'; c.caughtDay = state.day ?? 0; c.caughtBy = ck; caught.push(c); }
    else { if (final) c.status = 'survived'; survived.push(c); }
  }
  return { caught, survived, maxGap: caught.reduce((a, c) => Math.max(a, c.gap), 0) };
}

/**
 * Consequences of being caught: integrity score, reputation in that audience's network (other investors hear
 * about it), and a delayed, traceable mistake. Returns the severity 0..1.
 * weight (0..1, default 1) scales the score and reputation hit: a suspicion at a smell test (weight ~0.4) or an
 * honest definitional gap found and cured in diligence (~0.25) spreads less than proof of a lie [design].
 */
export function penalize(state, caught, { audience, functionId = 'general', id = 'misrepresentation', label = 'Misrepresented numbers', usd = 0, hours = 0, customers = 0, app = null, detail = '', weight = 1 } = {}) {
  if (!caught?.length) return 0;
  const I = ensureIntegrity(state);
  const sev = Math.min(1, caught.reduce((a, c) => Math.max(a, c.gap), 0) / 0.5); // a 50%+ overstatement is a full credibility failure [design]
  const w = Math.max(0, Math.min(1, weight));
  I.score = Math.max(0, I.score - (0.15 + 0.35 * sev) * w);
  I.reputation[audience] = Math.min(1, (I.reputation[audience] ?? 0) + (0.2 + 0.4 * sev) * w); // networks talk [design]
  I.incidents.push({ day: state.day ?? 0, audience, sev: Math.round(sev * 100) / 100, claims: caught.map((c) => c.id), id });
  const what = caught.map((c) => `${c.metric} ${fmtClaim(c.metric, c.claimed)} vs real ${fmtClaim(c.metric, c.truth)}`).join('; ');
  logMistake(state, { functionId, id, label, delayed: true, app, cost: { usd, hours, customers, reputation: Math.round((1 + 2 * sev) * w * 10) / 10 }, detail: `${detail ? `${detail} ` : ''}Caught: ${what}.` });
  notify(state, `${label}: ${what}.`, { type: 'bad', app });
  return sev;
}

/** 0..1 multiplier on how a fresh party in this audience treats you (1 = no stain). */
export const reputationMult = (state, audience) => 1 - 0.6 * (ensureIntegrity(state).reputation[audience] ?? 0);

export function fmtClaim(metric, v) {
  if (v == null) return 'unknown';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (metric === 'mrr') return `$${Math.round(v).toLocaleString('en-US')}/mo`;
  if (metric === 'growth' || metric === 'nrr' || metric === 'churn') return `${Math.round(v * 1000) / 10}%`;
  if (metric === 'uptime') return `${Math.round(v * 100000) / 1000}%`;
  if (metric === 'rating') return `${Math.round(v * 10) / 10}★`;
  if (metric === 'runway') return `${Math.round(v * 10) / 10} months`;
  return String(Math.round(v * 100) / 100);
}

// ---- Product, compliance and reliability claims (sales calls, cold email, proposals, negotiation, websites) ----
// Research: docs/research/verification/market-people.md §1.1-1.8. A buyer who hears "we have SSO", "we're SOC 2
// Type II" or "99.99% uptime" mostly takes it at face value on the call; the security review (they ask for the actual
// report or pen test), the pilot / PoC (the gap is observed directly), procurement (document checks) and, after
// signing, real usage (delivered vs sold) are where it is checked. All odds [design], anchored on that brief.
Object.assign(CHECKS, {
  questionnaire: { pMax: 0.26, k: 0.2, label: 'security questionnaire review (no evidence asked)' }, // overstated control ~25%; SOC 2 claim at an SMB buyer ~25%
  security_evidence: { pMax: 0.97, k: 0.3, label: 'security review asking for the SOC 2 report, pen test and evidence' }, // false SOC 2 claim ~90-95%
  poc: { pMax: 0.85, k: 0.35, label: 'pilot / proof of concept' }, // 0.8 x gap x rigor; large gap, rigorous PoC ~80%
  document: { pMax: 0.99, k: 0.15, label: 'procurement document check' }, // missing prerequisites ~100%; product truth not checked here
  delivered: { pMax: 0.98, k: 0.15, label: 'real usage after go-live (delivered vs sold)' }, // ~100% eventual
  backchannel: { pMax: 0.4, k: 0.4, label: 'buyer backchannel (LinkedIn, peers, review sites)' }, // outright customer-count lies ~35%
});

const NAMED_INTEGRATIONS = ['salesforce', 'hubspot', 'quickbooks', 'xero', 'netsuite', 'slack', 'microsoft teams', 'zapier', 'shopify', 'google sheets', 'epic', 'workday', 'servicenow', 'jira'];
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Capabilities a seller claims, and how a shipped feature proves each one (the RFP requirement patterns reused). */
export const CAPABILITIES = [
  { id: 'feature:sso', label: 'single sign-on', say: /\b(sso|saml|single sign[- ]on|okta|entra id|azure ad)\b/, feat: /\b(sso|saml|oidc|single sign)/ },
  { id: 'feature:rbac', label: 'role-based permissions', say: /\b(role[- ]based (access|permissions)|rbac|permission levels|granular permissions)\b/, feat: /\b(role|permission|rbac|access control)/ },
  { id: 'feature:audit_log', label: 'audit log', say: /\baudit (log|trail)s?\b/, feat: /\b(audit|activity log|history log|change log)/ },
  { id: 'feature:api', label: 'API / webhooks', say: /\b(open|public|rest|full|documented) api\b|\bwebhooks?\b|\bapi access\b/, feat: /\b(api|webhook)/ },
  { id: 'feature:export', label: 'bulk data export', say: /\b(csv|bulk|one[- ]click) export\b|\bexport (all )?your data\b/, feat: /\b(export|csv)/ },
  { id: 'feature:mobile', label: 'mobile app', say: /\b(mobile|ios|android|native) apps?\b/, feat: /\b(mobile|ios|android)/ },
  { id: 'feature:a11y', label: 'WCAG accessibility', say: /\b(wcag( 2\.\d)?( aa)?|section 508|fully accessible)\b/, feat: /\b(wcag|accessib|a11y|screen reader)/ },
  { id: 'feature:multi_site', label: 'multi-site hierarchy', say: /\bmulti[- ](site|location|entity|tenant)\b/, feat: /\b(multi[- ]?(site|tenant|location|org)|workspace|department|hierarch)/ },
  { id: 'feature:workflow', label: 'configurable workflows', say: /\b(custom|configurable) (workflows?|approvals?)\b|\bapproval workflows?\b/, feat: /\b(workflow|approval|automation|rule)/ },
  { id: 'feature:ai', label: 'AI features', say: /\b(ai[- ]powered|uses ai|our ai|machine learning|llm[- ]powered|ai agents?)\b/, feat: /\b(ai|llm|gpt|machine learning|classif|predict|agent)\b/, ai: true },
  ...NAMED_INTEGRATIONS.map((n) => ({ id: `int:${n.replace(/\s+/g, '_')}`, label: `${n} integration`, say: new RegExp(`\\b(integrat\\w*|connects?|syncs?|plugs?|works)\\s+(natively\\s+)?(with|to|into)\\b[^.?!\\n]{0,30}\\b${reEsc(n)}\\b|\\b${reEsc(n)}\\s+(integration|sync|connector|app)\\b|\\bnative\\s+${reEsc(n)}\\b`), feat: new RegExp(`\\b${reEsc(n)}\\b`) })),
  { id: 'soc2_type2', label: 'SOC 2 Type II report', say: /\bsoc ?2,? type ?(ii|2)\b/, compliance: true },
  { id: 'soc2', label: 'SOC 2 report', say: /\bsoc ?2\b(?!,? type ?(ii|2)\b)/, compliance: true },
  { id: 'iso27001', label: 'ISO 27001 certificate', say: /\biso ?27001\b/, compliance: true },
  { id: 'hipaa', label: 'HIPAA readiness (BAA)', say: /\bhipaa[- ](compliant|ready|certified|compliance)\b|\bsign (a|your) baa\b/, compliance: true },
  { id: 'pentest', label: 'third-party penetration test', say: /\b(pen(etration)?[- ]?test(ed|s|ing)?)\b/, compliance: true },
];
export const CAPABILITY_LABEL = Object.fromEntries(CAPABILITIES.map((c) => [c.id, c.label]));
export const COMPLIANCE_METRICS = new Set(['soc2', 'soc2_type2', 'iso27001', 'hipaa', 'pentest', 'soc2_audit']);
/** Claims about the product, its compliance or its reliability (as opposed to traction metrics). */
export const isCapabilityMetric = (m) => /^(feature:|int:|control:)/.test(String(m)) || COMPLIANCE_METRICS.has(m) || m === 'uptime';
/** Claims a security / procurement team checks with documents (reports, certificates, letters, control evidence). */
export const isDocumentMetric = (m) => COMPLIANCE_METRICS.has(m) || /^control:/.test(String(m));

const NOT_YET_BEFORE = /\b(roadmap|coming|soon|planned|planning|will|would|working (on|toward|towards)|next (quarter|month|year)|in progress|underway|under way|plan to|building|beta|by q[1-4]|target(ing)?|kick(ed|ing) off|scheduled|later this|aim(ing)? (for|to)|hope|could|can build|if you need|once we)\b[^.?!\n]{0,45}$/i;
const NOT_YET_AFTER = /^[^.?!\n]{0,30}\b(is |are )?(coming|on (our|the) roadmap|in progress|underway|planned|scheduled|next (quarter|month|year)|by q[1-4]|later this year|soon|in beta)\b/i;
const NEGATED = /\b(no|not|don'?t|do not|doesn'?t|does not|without|lack|isn'?t|aren'?t|haven'?t|have not|yet to|never)\b[^.?!\n]{0,25}$/i;
function sentenceOf(t, i) {
  const start = Math.max(t.lastIndexOf('.', i - 1), t.lastIndexOf('!', i - 1), t.lastIndexOf('?', i - 1), t.lastIndexOf('\n', i - 1)) + 1;
  const ends = ['!', '?', '\n'].map((ch) => t.indexOf(ch, i)).concat([...t.slice(i).matchAll(/\.(\s|$)/g)].slice(0, 1).map((x) => i + x.index)).filter((x) => x >= 0);
  const end = ends.length ? Math.min(...ends) : t.length;
  return { before: t.slice(start, i), question: t[end] === '?' };
}

/**
 * Present-tense capability / compliance / uptime claims in free text, judged against `truth` at that moment:
 * { features: [{ text, status, ai }] (status 'shipped' = true), soc2: { report, type2 }, iso27001, hipaa, pentest,
 * uptime (0..1) }. A truth field that is undefined means "unknown here" and the claim is skipped. Roadmap talk,
 * negations and questions are not claims. Returns recordClaims-ready claims: { metric, claimed, truth, text }.
 */
export function capabilityClaims(text, truth = {}) {
  const t = String(text ?? '');
  const low = t.toLowerCase();
  const out = [];
  const seen = new Set();
  const present = (x) => { const s = sentenceOf(low, x.index); const after = low.slice(x.index + x[0].length, x.index + x[0].length + 40); return !s.question && !NOT_YET_BEFORE.test(s.before) && !NEGATED.test(s.before) && !NOT_YET_AFTER.test(after); };
  const shipped = (cap) => (truth.features ?? []).some((f) => f.status === 'shipped' && (cap.feat.test(String(f.text ?? '').toLowerCase()) || Boolean(cap.ai && f.ai)));
  for (const cap of CAPABILITIES) {
    const re = new RegExp(cap.say.source, 'gi');
    for (const x of low.matchAll(re)) {
      if (seen.has(cap.id) || !present(x)) continue;
      let tv;
      if (cap.compliance) tv = cap.id === 'soc2' ? truth.soc2?.report : cap.id === 'soc2_type2' ? truth.soc2?.type2 : truth[cap.id];
      else tv = truth.features ? shipped(cap) : undefined;
      if (tv === undefined || tv === null) continue;
      seen.add(cap.id);
      out.push({ metric: cap.id, claimed: true, truth: Boolean(tv), text: t.slice(x.index, x.index + x[0].length).trim() });
    }
  }
  // Uptime / SLA percentages ("99.99% uptime", "an SLA of 99.9%").
  if (Number.isFinite(truth.uptime)) {
    for (const x of low.matchAll(/(\d{2}(?:\.\d{1,3})?)\s?%\s*(?:uptime|availability|sla)\b|\b(?:uptime|availability|sla)\b\s*(?:of|is|at|:)?\s*(\d{2}(?:\.\d{1,3})?)\s?%/g)) {
      const v = Number(x[1] ?? x[2]) / 100;
      if (!(v >= 0.9 && v < 1) || seen.has('uptime') || !present(x)) continue;
      seen.add('uptime');
      out.push({ metric: 'uptime', claimed: v, truth: truth.uptime, text: x[0].trim() });
    }
  }
  return out;
}

/** Website / marketing social proof: star ratings and review counts (customer counts come from extractClaims). */
export function socialProofClaims(text, truth = {}) {
  const t = String(text ?? '');
  const out = [];
  if (truth.rating !== undefined) {
    const x = t.match(/(\d(?:\.\d)?)\s?(?:\/\s?5\b|out of 5\b|★|stars?\b)|★{4,5}/i);
    if (x) {
      const v = x[1] != null ? Number(x[1]) : (x[0].match(/★/g) ?? []).length;
      if (v >= 1 && v <= 5) out.push({ metric: 'rating', claimed: v, truth: truth.rating ?? 0, text: x[0].trim() });
    }
  }
  if (truth.customers !== undefined) { // "trusted by 5,000 teams" (extractClaims reads "by N" as a goal)
    const x = t.match(/\b(?:trusted|used|loved|chosen|relied on) by (?:over |more than |)(\d[\d,]*)(k)?\+?\s*(?:\w+\s+)?(?:customers|clients|teams|companies|businesses|brands|users|organi[sz]ations)\b/i);
    if (x) out.push({ metric: 'customers', claimed: Number(x[1].replace(/,/g, '')) * (x[2] ? 1000 : 1), truth: truth.customers ?? 0, text: x[0].trim() });
  }
  if (truth.reviews !== undefined) {
    const x = t.match(/(\d[\d,]*)\+?\s*(?:verified\s+|5-star\s+|five-star\s+)?(?:reviews|ratings)\b/i);
    if (x) out.push({ metric: 'reviews', claimed: Number(x[1].replace(/,/g, '')), truth: truth.reviews ?? 0, text: x[0].trim() });
  }
  return out;
}

/** Relative overstatement of an uptime claim, measured on downtime (99.99% claimed vs 99.5% real is a big lie). */
export function uptimeGap(claimed, truth) {
  const diff = (1 - truth) - (1 - claimed);
  if (diff <= 0.0005) return 0; // within 0.05 points is rounding [design]
  return Math.min(1.5, diff / Math.max(0.001, 1 - truth));
}
