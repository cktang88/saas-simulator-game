// AI support agent (Intercom Fin-style) model. Pure functions: the Helpdesk owns state and calls these.
//
// The real workflow (docs/research/tools/deep/d09-support-ai-cancelflows.md §1): choose the help-center
// content the agent may use, scope it to the intents it should answer, write Procedures for multi-step jobs
// (a refund that calls a Payments data connector), confirm escalation (handoff) rules, batch-test up to 50
// sample questions rated Good / Acceptable / Poor, simulate Procedures (250 runs/month under 1K conversations),
// set live, then review conversations every week and fix the knowledge base it trips on.
//
// What the numbers are:
//  - Pricing $0.99 per resolution (Intercom pricing page, fetched 2026-10) [sourced]; 50/month minimum is the
//    game's existing assumption (hr-legal research §1.1).
//  - Resolution rates: vendors claim 66–76% (Intercom/AI Agent Index, vendor-reported), practitioners report
//    ~41% median tier-1 and ~59% top quartile, an independent 60-day SMB test measured 38% (t4 §4, d09 §1).
//    The game targets ~40–60% honest resolution with good docs and scoping, far lower with thin docs. Every
//    per-intent probability below is a [design] tuning estimate, never shown as a statistic.
//  - "Resolved" in vendor dashboards counts customers who go quiet; HubSpot counts a conversation resolved if
//    the customer does not come back within 72h (gap analysis item 9, d05). The honest metric is repeat contact.

import { clamp, lerp, round2, words, hash } from '../../core/util.js';

export const AI_PRICING = { perResolution: 0.99, monthlyMin: 50 }; // d09 §1 pricing page [sourced]; minimum [A]
export const BATCH_SIZE = 50; // Fin batch tests: up to 50 questions per group, free (d09 §1)
export const SIM_CAP = 250; // simulation runs per month under 1K conversations (Intercom, updated 2026-02)
export const SIM_RUNS = 10; // one "Run all" click on a Procedure [design]
export const REPEAT_HOURS = 72;
// Founder hours per action [design]: reading 50 answers at ~2 min each, a procedure ≈ an SOP page.
export const AI_HOURS = { configure: 0.5, procedure: 0.75, batchTest: 1.5, simulate: 0.25, goLive: 0.25, review: 1, correct: 1 / 6, articleUpdate: 0.5 };

// Intents a small SaaS sees, grouped under the Helpdesk ticket categories. share = share within the category.
// kind: docs (answerable from articles), procedure (needs a Procedure + data connector to actually resolve),
// human (should be handed off), status (answerable only from a posted status update). solvable = best-case
// share the agent truly resolves with perfect content [design].
export const INTENTS = {
  setup: { label: 'Getting started / setup', cat: 'howto', share: 0.3, kind: 'docs', solvable: 0.85, featureLinked: true, q: 'I signed up, what do I do first?' },
  integration: { label: 'Connect an integration', cat: 'howto', share: 0.2, kind: 'docs', solvable: 0.8, featureLinked: true, q: 'How do I connect my accounting tool?' },
  feature_howto: { label: 'How to use a feature', cat: 'howto', share: 0.3, kind: 'docs', solvable: 0.85, featureLinked: true, q: 'Where do I change who gets the reminder?' },
  import_export: { label: 'Import / export data', cat: 'howto', share: 0.1, kind: 'docs', solvable: 0.8, q: 'Can I export everything to CSV?' },
  limits: { label: 'Plan limits and pricing', cat: 'howto', share: 0.1, kind: 'docs', solvable: 0.85, q: 'What happens when I go over my plan limit?' },
  login: { label: 'Login / password reset', cat: 'account', share: 0.5, kind: 'docs', solvable: 0.9, q: "I can't log in, the reset email never comes." },
  invite: { label: 'Invite a teammate', cat: 'account', share: 0.4, kind: 'docs', solvable: 0.85, q: 'How do I add my colleague?' },
  sso: { label: 'Security, SSO, data deletion', cat: 'account', share: 0.1, kind: 'human', solvable: 0.3, q: 'Do you support SAML and can you delete our data?' },
  invoice: { label: 'Invoices and billing details', cat: 'billing', share: 0.45, kind: 'docs', solvable: 0.85, q: 'I need an invoice with our VAT number.' },
  refund: { label: 'Refund request', cat: 'billing', share: 0.25, kind: 'procedure', solvable: 0.8, q: 'I forgot to cancel, can I get a refund for this month?' },
  billing_dispute: { label: 'Charged twice / dispute', cat: 'billing', share: 0.2, kind: 'human', solvable: 0.1, q: 'You charged my card twice!' },
  cancel: { label: 'Cancel or downgrade', cat: 'billing', share: 0.1, kind: 'procedure', solvable: 0.7, q: 'How do I cancel?' },
  bug_report: { label: 'Something is broken', cat: 'bug', share: 1, kind: 'human', solvable: 0.1, q: 'The sync stopped working this morning.' },
  feature_request: { label: 'Feature request', cat: 'feature', share: 1, kind: 'docs', solvable: 0.55, q: 'Can you add a Slack integration?' },
  outage: { label: 'Is it down?', cat: 'outage', share: 1, kind: 'status', solvable: 0.75, q: 'Nothing loads, is it down?' },
  human: { label: 'Asks for a human / frustrated', cat: 'angry', share: 1, kind: 'human', solvable: 0, q: 'Your bot is useless, get me a person.' },
};
export const INTENT_IDS = Object.keys(INTENTS);

// Escalation rules. Fin ships with "asks for a human", "frustration" and "loops" on (d09 §1: default
// escalations are free); the others are the player's to write.
export const HANDOFF_RULES = {
  human_request: { label: 'Customer asks for a human', default: true, covers: ['human'] },
  frustration: { label: 'Customer is frustrated or angry', default: true, covers: ['human'] },
  loop: { label: 'No answer after two tries (loop)', default: true, covers: [] },
  billing_dispute: { label: 'Billing disputes and double charges', default: false, covers: ['billing_dispute'] },
  bug: { label: 'Bug reports: collect details, hand to a human', default: false, covers: ['bug_report'] },
  security: { label: 'Security, SSO and data-deletion questions', default: false, covers: ['sso'] },
};

export function defaultAgent() {
  return {
    status: 'off', // off | draft | live | paused
    scope: Object.fromEntries(INTENT_IDS.map((k) => [k, true])), // Fin default: answer anything from content
    handoff: Object.fromEntries(Object.entries(HANDOFF_RULES).map(([k, r]) => [k, r.default])),
    sourceIds: null, // null = all published articles
    procedures: [], tests: [], testedHash: null, sims: { month: null, runs: 0 },
    sinceDay: null, liveDay: null, lastReviewDay: null, usageCap: null,
    monthResolutions: 0, log: [], convos: [], fallout: [], flags: {},
  };
}

// Bring old saves (and the old on/off toggle) onto the new config. Mutates and returns ai.
export function migrateAgent(ai) {
  const d = defaultAgent();
  for (const [k, v] of Object.entries(d)) ai[k] ??= v;
  if (ai.enabled === true && ai.status === 'off') { ai.status = 'live'; ai.liveDay ??= ai.sinceDay ?? null; }
  delete ai.enabled;
  for (const k of INTENT_IDS) ai.scope[k] ??= true;
  for (const [k, r] of Object.entries(HANDOFF_RULES)) ai.handoff[k] ??= r.default;
  return ai;
}

// ---- Knowledge base ----

const INTENT_WORDS = [
  ['refund', /refund|money back/], ['cancel', /cancel|downgrade|close (my|the) account/], ['billing_dispute', /charged twice|double charge|dispute/],
  ['invoice', /invoice|receipt for|vat|billing (details|address)/], ['login', /log ?in|password|reset|2fa|locked out/], ['invite', /invite|teammate|colleague|add (a )?user|seat/],
  ['sso', /sso|saml|security|gdpr|delete (my|our) data/], ['integration', /connect|integrat|sync|zapier|quickbooks|xero|slack|api key/],
  ['import_export', /import|export|csv|download (my|all)/], ['limits', /limit|plan|pricing|upgrade|quota/], ['setup', /get(ting)? started|set ?up|first steps|onboard/],
  ['outage', /status|outage|down\b/], ['bug_report', /bug|error|broken|not working/], ['feature_request', /roadmap|request a feature|feature request/],
];
export function inferIntent(text) {
  const t = String(text ?? '').toLowerCase();
  return INTENT_WORDS.find(([, re]) => re.test(t))?.[0] ?? 'feature_howto';
}

// An article is stale for the agent when a feature shipped after it was last updated and the intent depends on
// the product surface (setup, integrations, feature how-tos). The agent then answers from the old UI.
export function articleStale(article, feats = []) {
  const intent = INTENTS[article.intent ?? inferIntent(article.title)];
  if (!intent?.featureLinked) return false;
  const at = article.updatedDay ?? article.day ?? 0;
  return feats.some((f) => (f.shippedDay ?? -1e9) > at);
}

export const sourceArticles = (ai, articles = []) => (ai.sourceIds == null ? articles : articles.filter((a) => ai.sourceIds.includes(a.id)));

// Coverage 0..1 of one intent by what the agent may use: best article (halved when stale), a Procedure for
// procedure intents (an article alone lets it explain the policy, not act on it), a status update for outages.
export function coverage(ai, intentId, { articles = [], feats = [], statusQ = 0 } = {}) {
  const it = INTENTS[intentId];
  if (it.kind === 'human') return 0;
  if (it.kind === 'status') return clamp(statusQ, 0, 1);
  const best = sourceArticles(ai, articles).filter((a) => (a.intent ?? inferIntent(a.title)) === intentId)
    .reduce((m, a) => Math.max(m, (a.quality ?? 0) * (articleStale(a, feats) ? 0.5 : 1)), 0);
  if (it.kind === 'procedure') {
    const p = ai.procedures.find((x) => x.intent === intentId && x.live !== false);
    return p ? clamp(p.quality * (p.simPassed ? 1 : 0.75), 0, 1) : best * 0.3;
  }
  return best;
}

export function configHash(ai) {
  const on = (o) => Object.entries(o).filter(([, v]) => v).map(([k]) => k).sort().join(',');
  return String(hash(`${on(ai.scope)}|${on(ai.handoff)}|${ai.sourceIds == null ? '*' : ai.sourceIds.slice().sort().join(',')}|${ai.procedures.map((p) => `${p.id}:${p.version ?? 0}`).join(',')}`));
}
export const isTested = (ai) => ai.testedHash != null && ai.testedHash === configHash(ai);
export const handedOffBy = (ai, intentId) => Object.entries(HANDOFF_RULES).some(([k, r]) => ai.handoff[k] && r.covers.includes(intentId));
export const hasHumanHandoff = (ai) => Boolean(ai.handoff.human_request || ai.handoff.frustration);

// Unreviewed agents drift: new failure patterns nobody catches, guidance that no longer matches the product
// [design]: +1.2 points of wrong answers per unreviewed week after the first, up to +8.
export function reviewDrift(ai, day) {
  if (ai.liveDay == null) return 0;
  const weeks = (day - Math.max(ai.lastReviewDay ?? -1e9, ai.liveDay)) / 7;
  return clamp(0.012 * (weeks - 1), 0, 0.08);
}

// Per-conversation probabilities for one intent under the current setup.
export function intentOdds(ai, intentId, cov, { tested = isTested(ai), drift = 0, monthsLive = 0, worldErr = 0 } = {}) {
  const it = INTENTS[intentId];
  if (!ai.scope[intentId]) return { inScope: false };
  if (handedOffBy(ai, intentId)) return { inScope: true, handoff: true };
  const mature = 1 + 0.1 * clamp(monthsLive / 12, 0, 1) * cov; // content tuning over months [design]
  // Generic content (product pages, general guidance) lets it answer some questions with no specific article.
  const pSolve = clamp(it.solvable * (0.3 + 0.7 * cov) * mature, 0, 0.95);
  // Of the rest, how often it answers confidently anyway (Fin answers from whatever is closest) instead of
  // saying it does not know.
  let pWrong = 0.03 + 0.2 * (1 - cov) + (it.kind === 'human' ? 0.25 : 0);
  pWrong = pWrong * (tested ? 1 : 1.35) + drift + worldErr;
  return { inScope: true, handoff: false, pSolve, pWrong: clamp(pWrong, 0, 0.95), loop: Boolean(ai.handoff.loop) };
}

// One conversation. rand: () => [0,1). Returns 'out_of_scope' | 'handoff' | 'resolved' | 'wrong' |
// 'stuck_handoff' | 'unresolved' (customer said it did not help; not billed, emails you instead) | 'silent'
// (went quiet: billed as resolved).
export const SAID_NOT_HELPFUL = 0.35; // [design] share of stuck customers who say so instead of going quiet
export function resolveConversation(rand, odds) {
  if (!odds.inScope) return 'out_of_scope';
  if (odds.handoff) return 'handoff';
  if (rand() < odds.pSolve) return 'resolved';
  if (rand() < odds.pWrong) return 'wrong';
  if (odds.loop) return 'stuck_handoff';
  return rand() < SAID_NOT_HELPFUL ? 'unresolved' : 'silent';
}

// What happens next [design]. Wrong answers mostly come back angry within 72h; silent customers half the time
// come back with the same question (repeat contact), the rest give up.
export const AFTERMATH = {
  wrongReturnsAngry: 0.55, wrongChurn: 0.03, silentRepeat: 0.5, silentChurn: 0.01, resolvedRepeat: 0.05,
  overRefundPerQualityGap: 0.25, // refund Procedure with quality q over-refunds (1-q)×25% of the time
};
// Vendor dashboards count wrong and silent conversations as resolved (and bill them).
export const claimedOutcome = (o) => o === 'resolved' || o === 'wrong' || o === 'silent';

export function drawIntent(rand, cat) {
  const list = INTENT_IDS.filter((k) => INTENTS[k].cat === cat);
  if (!list.length) return 'feature_howto';
  let r = rand() * list.reduce((a, k) => a + INTENTS[k].share, 0);
  for (const k of list) { r -= INTENTS[k].share; if (r <= 0) return k; }
  return list.at(-1);
}

// ---- Metrics ----

// log rows: { day, involved, claimed, resolved, wrong, silent, handoff, outOfScope, repeat, cost }
export function agentMetrics(log = [], day, days = 30) {
  const rows = log.filter((r) => r.day > day - days);
  const t = rows.reduce((a, r) => { for (const k of ['seen', 'involved', 'claimed', 'resolved', 'wrong', 'silent', 'handoff', 'outOfScope', 'repeat']) a[k] += r[k] ?? 0; return a; }, { seen: 0, involved: 0, claimed: 0, resolved: 0, wrong: 0, silent: 0, handoff: 0, outOfScope: 0, repeat: 0 });
  const div = (a, b) => (b > 0 ? a / b : null);
  return {
    ...t,
    claimedRate: div(t.claimed, t.involved), // what the vendor dashboard shows
    repeatRate: div(t.repeat, t.claimed), // came back within 72h after a "resolution"
    honestRate: div(Math.max(0, t.claimed - t.repeat), t.involved), // resolved and did not come back within 72h
    trueRate: div(t.resolved, t.involved), // hidden ground truth (shown only as "verified in reviewed sample")
    shareOfAll: div(t.resolved, t.seen),
    handoffRate: div(t.handoff, t.involved),
  };
}

// ---- Batch test (Good / Acceptable / Poor) ----

const POOR_WHY = {
  docs: (cov, stale) => (cov <= 0.05 ? 'No article covers this; it stitched together a plausible but invented answer.' : stale ? 'Answered from an article written before your latest release: the steps no longer match the product.' : 'The article is thin; the answer missed the actual step the customer needs.'),
  procedure: (cov) => (cov <= 0.3 ? 'No Procedure: it explained a refund policy you never wrote and could not issue anything.' : 'The Procedure skipped a condition (plan, date) and gave the wrong outcome.'),
  human: () => 'This should go to a person: the agent argued with the customer instead of handing off.',
  status: () => 'No status update posted: it guessed "everything is operational".',
};

// Runs BATCH_SIZE sample questions across intents (in proportion to traffic, at least one per in-scope intent).
export function batchTest(rand, ai, ctx = {}) {
  const { catWeights = { howto: 0.4, bug: 0.12, billing: 0.12, feature: 0.15, account: 0.08, outage: 0.02, angry: 0.03 }, day = 0 } = ctx;
  const weights = INTENT_IDS.map((k) => [k, (catWeights[INTENTS[k].cat] ?? 0) * INTENTS[k].share]);
  const tot = weights.reduce((a, [, w]) => a + w, 0) || 1;
  const byIntent = {}, examples = [];
  let good = 0, acceptable = 0, poor = 0;
  const tested = true; // a batch test measures the config as it would behave once tuned on these answers
  const plan = [];
  for (const [k, w] of weights) plan.push(...Array(Math.max(ai.scope[k] ? 1 : 0, Math.round((w / tot) * BATCH_SIZE))).fill(k));
  while (plan.length > BATCH_SIZE) plan.splice(Math.floor(rand() * plan.length), 1);
  for (const k of plan) {
    const cov = coverage(ai, k, ctx);
    const odds = intentOdds(ai, k, cov, { tested, drift: 0 });
    const o = resolveConversation(rand, odds);
    const it = INTENTS[k];
    let rating, why;
    if (o === 'out_of_scope') { rating = 'acceptable'; why = 'Out of scope: routed to your inbox.'; }
    else if (o === 'handoff') { rating = it.kind === 'human' ? 'good' : 'acceptable'; why = it.kind === 'human' ? 'Handed off with the details collected.' : 'Handed off: a human will answer.'; }
    else if (o === 'resolved') { rating = rand() < 0.15 + 0.4 * (1 - cov) ? 'acceptable' : 'good'; why = 'Correct answer from your content.'; }
    else if (o === 'stuck_handoff') { rating = 'acceptable'; why = 'Could not answer; handed off after two tries.'; }
    else { rating = 'poor'; why = o === 'silent' ? 'Could not answer and kept rephrasing; no handoff, the customer would give up.' : POOR_WHY[it.kind](cov, ctx.articles?.some((a) => (a.intent ?? inferIntent(a.title)) === k && articleStale(a, ctx.feats ?? []))); }
    const b = (byIntent[k] ??= { n: 0, good: 0, acceptable: 0, poor: 0, why: null });
    b.n++; b[rating]++;
    if (rating === 'poor') { b.why = why; poor++; if (examples.length < 12) examples.push({ intent: k, q: it.q, rating, why }); }
    else if (rating === 'good') good++; else acceptable++;
  }
  return { day, n: plan.length, good, acceptable, poor, byIntent, examples, hash: configHash(ai) };
}

// ---- Procedures ----

// Offline grader for a Procedure (the LLM grader is primary). Conservative: tops out at 0.8 so it cannot be
// keyword-stuffed to stellar. Needs real structure: several steps, an IF/ELSE on a policy number, the data
// connector, an explicit handoff for exceptions and a "when NOT to use".
export function procedureHeuristic(p) {
  const steps = String(p.steps ?? '').split(/\n+/).map((s) => s.trim()).filter((s) => words(s) >= 3);
  const t = String(p.steps ?? '').toLowerCase();
  const issues = [];
  let q = 0.1;
  if (steps.length >= 3) q += 0.15; else issues.push('Write at least three concrete steps.');
  const cond = /\bif\b/.test(t) && /\b(otherwise|else|if not)\b/.test(t);
  if (cond) q += 0.15; else issues.push('Add a condition with both branches (IF … otherwise …).');
  if (/\b\d+\s*(days?|%|\$|usd|months?)|\$\s*\d+/.test(t)) q += 0.1; else issues.push('Put the actual policy number in the condition (e.g. within 14 days, up to one month).');
  const needsConn = INTENTS[p.intent]?.kind === 'procedure';
  if (!needsConn || p.connector === 'payments') q += 0.15; else issues.push('Connect Payments so it can look up the subscription and act; otherwise it can only talk about refunds.');
  if (/hand ?off|escalat|human|teammate|founder/.test(t)) q += 0.1; else issues.push('Add a handoff step for exceptions.');
  if (words(p.whenNot) >= 4) q += 0.05; else issues.push('Say when NOT to use it (e.g. disputes, annual plans).');
  // Stuffing guard: steps that are just the keywords, or the same line repeated.
  const uniq = new Set(steps.map((s) => s.toLowerCase()));
  if (steps.length && uniq.size / steps.length < 0.7) { q -= 0.2; issues.push('Steps repeat themselves.'); }
  if (steps.some((s) => words(s) > 60)) issues.push('Keep each step to one action.');
  return { quality: round2(clamp(q, 0, 0.8)), issues };
}

export function simulateProcedure(rand, proc, runs = SIM_RUNS) {
  let passed = 0;
  for (let i = 0; i < runs; i++) if (rand() < clamp(proc.quality * 1.05, 0, 0.98)) passed++;
  return { runs, passed, ok: passed / runs >= 0.8 };
}

// ---- Reply quality support: ticket facts ----

const STOP = new Set('about after again also because been before being could does doing from have here into just like more need only other over same should some than that their them then there these they this those very want what when where which while with would your yours thanks thank hello please still really today'.split(' '));
export const MAGIC = /\b(fixed|shipped|deployed|live|patched|resolved|refunded|credited|step|steps|click|settings|sorry|apologi[sz]e|thanks|tomorrow|today|week|hours|days)\b/g;
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
export const contentTokens = (text) => new Set(String(text ?? '').toLowerCase().match(/[a-z][a-z0-9'-]{3,}/g)?.filter((w) => !STOP.has(w) && !w.match(MAGIC)).map(stem) ?? []);

// How many distinct facts from the ticket (its words, the customer's name, the account's plan/features/amounts)
// the reply actually uses.
export function factHits(reply, { ticketText = '', facts = [] } = {}) {
  const r = contentTokens(reply);
  const rl = String(reply ?? '').toLowerCase();
  let hits = 0;
  for (const w of contentTokens(ticketText)) if (r.has(w)) hits++;
  for (const f of facts) {
    const s = String(f ?? '').toLowerCase().trim();
    if (s.length >= 3 && rl.includes(s)) hits++;
  }
  return hits;
}

// Status-page update quality (Statuspage/Instatus practice): what is affected, what you are doing, when the next
// update comes, no vague reassurance. [design] 0.3..1.
export function statusUpdateQuality(text, cause = '') {
  const t = String(text ?? '').toLowerCase();
  let q = 0.3;
  if (factHits(t, { ticketText: cause }) >= 1 || /\b(api|login|dashboard|sync|emails?|payments?|uploads?|database|reports?)\b/.test(t)) q += 0.2;
  if (/\b(investigat|identified|rolled? back|rollback|deploy|restor|mitigat|fix)/.test(t)) q += 0.2;
  if (/next update|update (you )?(in|by|within)|within \d+|in \d+ (min|minutes|hours?)|by \d/.test(t)) q += 0.2;
  if (/\b(data|nothing) (is |was )?(safe|lost)|no data (was )?lost|workaround/.test(t)) q += 0.1;
  if (words(t) < 12) q -= 0.15;
  if (/minor (hiccup|glitch)|everything is fine|should be fine|apologi[sz]e for any inconvenience/.test(t)) q -= 0.1;
  return round2(clamp(q, 0.3, 1));
}
