// Insights "lab" (PostHog-style): Sean Ellis PMF and NPS surveys, experiments with a pre-registered metric,
// sample size and stop rule, and feature flags. Pure + deterministic (rng(state)), no DOM.
//
// Sources: docs/research/tools/deep/d06-posthog-linear.md (W4 flags, W5 experiments, W6 surveys; no sample-size
// calculator on the free path [unverified], peeking inflates false positives); docs/research/operators/o3 §4 and
// public/data/operator-tiers.js analytics_pmf (Sean Ellis 40% "very disappointed" threshold [secondary]; experiment
// win rates Kohavi ~8%, Optimizely ~12% [secondary]); review/operator-tiers-audit items 6 and 17.

import { clamp, rng, gaussian, poisson, uid, round2 } from '../../core/util.js';
import { logMistake } from '../../core/operator.js';
import { notify } from '../../core/state.js';
import { wilson, hasIdea, surveyPool, answerRow, falsePmfFlags, callTruth, MIN_CUT_N } from './pmf.js';
export { wilson };

export const PMF_THRESHOLD = 0.4; // Sean Ellis: >= 40% "very disappointed" (o3 §4, secondary)
export const PMF_MIN_RESPONSES = 40; // [secondary] Ellis guidance: ~40+ responses before reading the number
export const SURVEY_DAYS = 7;
export const SURVEY_RESPONSE_RATE = 0.2; // [design] in-app / email survey response rate 10-30%
export const SURVEY_FATIGUE = 0.6; // [design] response-rate multiplier if the same people were surveyed in the last 30 days
export const NPS_BENCHMARK = { b2b: [30, 40] }; // B2B SaaS median NPS ~30-40 [secondary, unverified]
export const EXP_PRIOR = { winBase: 0.08, winSkill: 0.1, lose: 0.25, win: [0.05, 0.25], loss: [-0.15, -0.03], neutral: 0.02 }; // win 8-18% (Kohavi ~8%, Optimizely 12-20%); [design] split
export const EXP_HOURS = { setup: 1.5, decide: 0.25, ship: 0.5, removeFlag: 0.5, staleFlagMonthly: 0.25 }; // [design] d06: 1-2 h to set up a test
export const SURFACES = {
  landing: { label: 'Landing page → signup', metric: 'Visitor → trial signup', build: 2 },
  onboarding: { label: 'Onboarding → activation', metric: 'Signup → activation event', build: 4 },
  checkout: { label: 'Trial → paid (paywall / checkout)', metric: 'Trial → paid', build: 2 },
};
export const TARGETS = {
  activated: 'Users who reached the core action (activated)',
  all: 'Everyone (all users incl. trials)',
  paying: 'Paying customers',
  recent: 'Signed up in the last 14 days',
};

export function ensureLab(state) {
  state.apps ??= {};
  const ins = (state.apps.insights ??= {});
  const p = (ins.pmf ??= {});
  if (typeof p.responses !== 'number') p.responses = 0; // read by outcomes/engine.js pmf_measurement (activated-only responses)
  p.surveys ??= []; p.calls ??= [];
  ins.nps ??= { surveys: [] };
  ins.experiments ??= [];
  ins.featureFlags ??= [];
  ins.labMistakes ??= {};
  return ins;
}

// ---- Hidden satisfaction model ----
// Share of truly activated users who'd be "very disappointed" without the product, from (hidden) product fit.
export const vdActivated = (fit) => clamp(0.06 + 0.6 * (fit ?? 0.3), 0.03, 0.8); // [design] fit 0.57 ≈ the 40% line
export const pmfTruth = (state) => vdActivated(state.market?.fit?.product?.score) >= PMF_THRESHOLD;

function populations(state, a) {
  const subs = state.stripe?.subscriptions ?? [];
  const paying = subs.filter((s) => s.status === 'active' || s.status === 'past_due').length;
  const trials = subs.filter((s) => s.status === 'trialing').length;
  const recent = subs.filter((s) => s.startDay > (state.day ?? 0) - 14).length;
  const expired = subs.filter((s) => s.status === 'canceled' && s.cancelReason === 'trial_not_converted' && (s.canceledDay ?? -1e9) > (state.day ?? 0) - 30).length;
  return {
    activated: { n: Math.round(paying * 0.8 + trials * a), act: 1 },
    all: { n: paying + trials + expired, act: (paying * 0.8 + trials * a + expired * a * 0.4) / Math.max(1, paying + trials + expired) },
    paying: { n: paying, act: 0.8 },
    recent: { n: recent, act: a, honeymoon: true },
  };
}

export function launchSurvey(state, { kind = 'pmf', target = 'activated', activation = 0.375 } = {}) {
  const ins = ensureLab(state);
  // With an idea the survey is answered by the actual customers (true segment, activation, source); without one, the old pooled model.
  const pool = hasIdea(state) ? surveyPool(state, target) : null;
  const pop = pool ? { n: pool.length, act: pool.length ? pool.filter((x) => x.pmf?.act).length / pool.length : 0, honeymoon: target === 'recent' } : (populations(state, activation)[target] ?? populations(state, activation).activated);
  const list = kind === 'nps' ? ins.nps.surveys : ins.pmf.surveys;
  const fatigued = [...ins.pmf.surveys, ...ins.nps.surveys].some((s) => s.startDay > state.day - 30 && (s.target === target || s.target === 'all' || target === 'all'));
  const s = { id: uid('srv'), kind, target, startDay: state.day, endDay: state.day + SURVEY_DAYS, population: pop.n, act: round2(pop.act), honeymoon: !!pop.honeymoon, fatigued, status: 'running', result: null, ...(pool ? { pool: pool.map((x) => x.id) } : {}) };
  list.unshift(s);
  return s;
}

function binom(state, n, p) {
  if (n <= 0) return 0;
  if (n < 60) { let k = 0; for (let i = 0; i < n; i++) if (rng(state) < p) k++; return k; }
  return clamp(Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gaussian(state)), 0, n);
}

function closeSegmentedPmf(state, s) {
  const rr = SURVEY_RESPONSE_RATE * (s.fatigued ? SURVEY_FATIGUE : 1);
  const byId = new Map((state.stripe?.subscriptions ?? []).map((x) => [x.id, x]));
  const r = () => rng(state);
  const rows = [];
  for (const id of s.pool) { const sub = byId.get(id); if (sub && r() < rr) rows.push(answerRow(state, sub, r)); }
  const n = rows.length, very = rows.filter((x) => x.a === 'v').length, somewhat = rows.filter((x) => x.a === 's').length;
  s.rows = rows;
  s.result = { n, very, somewhat, not: n - very - somewhat, share: n ? very / n : null, ci: wilson(very, n), friendShare: n ? round2(rows.filter((x) => x.fr).length / n) : 0, notActivatedShare: n ? round2(rows.filter((x) => !x.act).length / n) : 0 };
  s.status = 'closed';
  delete s.pool;
  return s;
}

export function closeSurvey(state, s) {
  if (s.kind === 'pmf' && s.pool) return closeSegmentedPmf(state, s);
  if (s.pool) delete s.pool;
  const fit = state.market?.fit?.product?.score;
  const vdA = vdActivated(fit) * (s.honeymoon ? 1.3 : 1); // [design] novelty inflates recent signups' answers
  const vdN = vdActivated(fit) * 0.3; // [design] people who never got value rarely miss it
  const rr = SURVEY_RESPONSE_RATE * (s.fatigued ? SURVEY_FATIGUE : 1);
  const n = binom(state, s.population, rr);
  const nAct = binom(state, n, s.act);
  if (s.kind === 'pmf') {
    const veryA = binom(state, nAct, clamp(vdA, 0, 0.9)), veryN = binom(state, n - nAct, vdN);
    const very = veryA + veryN;
    const somewhat = binom(state, n - very, 0.55);
    s.result = { n, very, somewhat, not: n - very - somewhat, share: n ? very / n : null, ci: wilson(very, n) };
  } else {
    const fA = clamp(fit ?? 0.3, 0, 1);
    const pA = clamp(0.15 + 0.55 * fA, 0, 0.85), dA = clamp(0.45 - 0.45 * fA, 0.03, 0.6);
    const pN = pA * 0.4, dN = clamp(dA * 1.8, 0, 0.8);
    const proA = binom(state, nAct, pA), detA = binom(state, nAct - proA, dA / Math.max(0.01, 1 - pA));
    const proN = binom(state, n - nAct, pN), detN = binom(state, n - nAct - proN, dN / Math.max(0.01, 1 - pN));
    const pro = proA + proN, det = detA + detN;
    s.result = { n, promoters: pro, passives: n - pro - det, detractors: det, nps: n ? Math.round(((pro - det) / n) * 100) : null };
  }
  s.status = 'closed';
  return s;
}

export function surveyCaveats(s) {
  const out = [];
  if (s.kind === 'pmf' && s.target !== 'activated') out.push(s.target === 'recent' ? 'Recent signups: launch-week enthusiasm and people who have not used it yet. Reads high and noisy.' : 'Includes people who never reached the core action: their "not disappointed" dilutes the answer.');
  if (s.result && s.result.n < PMF_MIN_RESPONSES) out.push(`Only ${s.result.n} responses: below ~${PMF_MIN_RESPONSES} the ±range is too wide to call it.`);
  if (s.rows?.length) {
    if ((s.result.friendShare ?? 0) >= 0.25) out.push(`${Math.round(s.result.friendShare * 100)}% of respondents came from your own network: friends say "very disappointed" to be kind. Cut by signup source before you trust the number.`);
    const bySeg = {}; for (const r of s.rows) bySeg[r.seg] = (bySeg[r.seg] ?? 0) + 1;
    if (Object.values(bySeg).every((c) => c < MIN_CUT_N)) out.push(`No segment has ${MIN_CUT_N}+ answers: a segment cut would be noise.`);
  }
  if (s.fatigued) out.push('Same people surveyed in the last 30 days: response rate down.');
  if (s.kind === 'nps') out.push('NPS measures willingness to recommend, not product-market fit.');
  return out;
}

// Spend that scaling decisions show up in (ads + people), per month over the last `days`.
export function scaleSpend(state, fromDay, toDay) {
  const cats = new Set(['advertising', 'payroll', 'payroll_tax', 'contractors', 'marketing']);
  const t = (state.bank?.txns ?? []).filter((x) => x.day > fromDay && x.day <= toDay && cats.has(x.category)).reduce((a, x) => a - x.amount, 0);
  return Math.max(0, t) / Math.max(1, (toDay - fromDay) / 30);
}

export const SCALE_MIN = 150; // [design] extra monthly ad + people spend (dollars) that counts as "scaling on the call"

/** Log that the player looked at a cut (segment, role, source, activation) or at retention: evidence they did not read one number. */
export function recordCut(state, by, { surveyId = null } = {}) {
  const ins = ensureLab(state);
  (ins.pmf.cuts ??= []).unshift({ day: state.day, by, surveyId });
  ins.pmf.cuts.length = Math.min(ins.pmf.cuts.length, 40);
}
export function recordRetentionView(state, by = 'segment') {
  const ins = ensureLab(state);
  (ins.pmf.retViews ??= []).unshift({ day: state.day, by });
  ins.pmf.retViews.length = Math.min(ins.pmf.retViews.length, 40);
}

export function callPmf(state, { claim, surveyId = null, segmentId = null } = {}) {
  const ins = ensureLab(state);
  const s = [...ins.pmf.surveys, ...ins.nps.surveys].find((x) => x.id === surveyId) ?? null;
  const basis = !s ? 'none' : s.kind === 'nps' ? 'nps' : s.target !== 'activated' ? `pmf_${s.target}` : (s.result?.n ?? 0) < PMF_MIN_RESPONSES ? 'pmf_small' : 'pmf_activated';
  const real = callTruth(state, segmentId); // segment or customer-mix truth when the market has an idea, else the fit scalar
  const flags = hasIdea(state) ? falsePmfFlags(state).map((f) => f.id) : [];
  const day30 = (a) => a.filter((v) => v.day > state.day - 30).length;
  const c = {
    id: uid('pmfcall'), day: state.day, claim: !!claim, surveyId, basis, segmentId, truth: real ?? pmfTruth(state),
    falseFlags: flags, segmented: !!segmentId, sawCut: day30(ins.pmf.cuts ?? []) > 0, sawRetention: day30(ins.pmf.retViews ?? []) > 0,
    spendBefore: round2(scaleSpend(state, state.day - 60, state.day)), checkDay: state.day + 90, checked: false,
  };
  ins.pmf.calls.unshift(c);
  return c;
}

/** 90 days after a call: was it real, and did the player scale on it? Logs the delayed consequence. */
export function checkPmfCalls(state) {
  const ins = ensureLab(state);
  for (const c of ins.pmf.calls) {
    if (c.checked || state.day < c.checkDay) continue;
    c.checked = true;
    const extra = Math.max(0, scaleSpend(state, c.day, state.day) - c.spendBefore);
    c.scaledAfter = extra >= SCALE_MIN;
    const falseSignal = !c.truth || (c.falseFlags?.length ?? 0) >= 2;
    if (!c.claim || !falseSignal) continue;
    const scope = c.segmentId ? 'in that segment ' : '';
    const specific = c.basis === 'nps' ? 'nps_as_pmf' : c.basis === 'pmf_recent' ? 'spike_as_pmf' : null; // the basis itself was the error
    if (c.scaledAfter && !(specific && !c.falseFlags?.length)) {
      const names = (c.falseFlags ?? []).map((f) => f.replace(/_/g, ' ')).join(', ');
      logMistake(state, { functionId: 'analytics_pmf', id: 'premature_scaling_false_pmf', label: 'Scaled spend on a false PMF signal', app: 'insights', delayed: true, cost: { usd: round2(extra * 4), days: 90, hours: 6 },
        detail: `PMF called ${scope}on day ${c.day} (basis: ${c.basis.replace(/_/g, ' ')}${names ? `; false-PMF signals at the time: ${names}` : ''}). ${c.truth ? 'The base was too thin and lopsided to scale on.' : 'The retention curve has not flattened.'} Spend then rose by about ${Math.round(extra)} dollars a month, now buying customers who leave.` });
      notify(state, 'You called PMF and then scaled, but the signal was false: the spend is buying churn. See the PMF scorecard for what it was.', { type: 'bad', app: 'insights' });
    } else if (!c.truth) {
      const id = specific ?? 'premature_pmf';
      logMistake(state, { functionId: 'analytics_pmf', id, label: id === 'nps_as_pmf' ? 'Called PMF from NPS' : id === 'spike_as_pmf' ? 'Launch spike read as PMF' : 'Called PMF that retention did not confirm', app: 'insights', delayed: true, cost: { usd: round2(extra * 3), days: 90 }, detail: `PMF called on day ${c.day} (basis: ${c.basis.replace(/_/g, ' ')}); 90 days on, the customers you have are not "very disappointed" at 40%. Scaling spend since the call: +${Math.round(extra)} dollars a month.` });
      notify(state, 'Your PMF call 90 days ago did not hold up: the retention curve has not flattened. See the Scorecard for what it cost.', { type: 'bad', app: 'insights' });
    }
  }
}

// ---- Experiments ----
export function requiredSample(p, mde) {
  const d = Math.max(1e-4, p * mde);
  return Math.ceil((16 * p * (1 - p)) / (d * d)); // Lehr's rule: 80% power, alpha 0.05, per variant
}

const EVIDENCE_RE = /(replay|recording|funnel|drop[- ]?off|interview|ticket|survey|support|churn reason|heatmap|data|\d+\s*%|\d+ of \d+|users? (said|told|asked)|we saw|observed)/i;
export function hypothesisQuality(text) {
  const t = String(text ?? '');
  let q = 0;
  if (/\bbecause\b|\bsince\b|\bas\b .* (show|saw)/i.test(t)) q += 0.3;
  if (EVIDENCE_RE.test(t)) q += 0.4;
  if (/(increase|decrease|raise|lift|reduce|improve).{0,40}(rate|conversion|activation|signup|%)/i.test(t)) q += 0.2;
  if (t.split(/\s+/).length >= 12) q += 0.1;
  return clamp(q, 0, 1);
}

export function drawTrueEffect(state, hq) {
  const u = rng(state);
  const win = EXP_PRIOR.winBase + EXP_PRIOR.winSkill * hq;
  const lerp = (a, b) => a + (b - a) * rng(state);
  if (u < win) return round2(lerp(...EXP_PRIOR.win));
  if (u < win + EXP_PRIOR.lose) return round2(lerp(...EXP_PRIOR.loss));
  return round2(lerp(-EXP_PRIOR.neutral, EXP_PRIOR.neutral));
}

export function createExperiment(state, { name, hypothesis, surface, baseline, mde = 0.2, stopRule = 'sample', days = 28, traffic = 10 }) {
  const ins = ensureLab(state);
  const hq = hypothesisQuality(hypothesis);
  const nReq = requiredSample(baseline, mde);
  const e = {
    id: uid('exp'), name: name || 'Experiment', hypothesis, hq: round2(hq), surface, metric: SURFACES[surface]?.metric, baseline: round2(baseline), mde, nReq,
    stopRule, stopDay: stopRule === 'days' ? state.day + days : null, startDay: state.day, trafficPerDay: round2(traffic),
    estDays: Math.ceil((2 * nReq) / Math.max(0.1, traffic)), status: 'running',
    c: { n: 0, x: 0 }, v: { n: 0, x: 0 }, trueEffect: drawTrueEffect(state, hq), decision: null, decidedDay: null, early: false, learning: '', flagKey: `exp-${String(name || 'test').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`,
  };
  ins.experiments.unshift(e);
  ins.featureFlags.unshift({ id: uid('flag'), key: e.flagKey, rollout: 50, status: 'experiment', experimentId: e.id, createdDay: state.day, releasedDay: null, removed: false });
  return e;
}

export const stopRuleMet = (state, e) => (e.stopRule === 'days' ? state.day >= e.stopDay : e.c.n >= e.nReq && e.v.n >= e.nReq);

// Bayesian probability the variant beats control (normal approximation to the Beta posteriors).
export function winProbability(e) {
  const post = (g) => { const m = (g.x + 1) / (g.n + 2); return { m, v: (m * (1 - m)) / (g.n + 3) }; };
  const a = post(e.c), b = post(e.v);
  const z = (b.m - a.m) / Math.sqrt(a.v + b.v || 1e-9);
  return round2(0.5 * (1 + erf(z / Math.SQRT2)));
}
function erf(x) { // Abramowitz-Stegun 7.1.26
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}

export function experimentDay(state, e, traffic) {
  if (e.status !== 'running') return false;
  const n = poisson(state, traffic);
  const nc = Math.round(n / 2), nv = n - nc;
  const pv = clamp(e.baseline * (1 + e.trueEffect), 0, 1);
  e.c.n += nc; e.c.x += binom(state, nc, e.baseline);
  e.v.n += nv; e.v.x += binom(state, nv, pv);
  if (stopRuleMet(state, e)) { e.status = 'complete'; e.completeDay = state.day; return true; }
  return false;
}

// Decide: 'ship' (variant to 100%) or 'keep' (control). Early = before the pre-registered stop rule.
export function decideExperiment(state, e, decision, { learning = '' } = {}) {
  e.early = e.status === 'running';
  e.status = e.early ? 'stopped' : 'concluded';
  e.decision = decision;
  e.decidedDay = state.day;
  e.learning = String(learning || '').slice(0, 400);
  e.winProbAtDecision = winProbability(e);
  e.falseWinner = decision === 'ship' && e.trueEffect <= 0.005;
  const ins = ensureLab(state);
  const flag = ins.featureFlags.find((f) => f.experimentId === e.id);
  if (flag) { flag.rollout = decision === 'ship' ? 100 : 0; flag.status = decision === 'ship' ? 'released' : 'off'; flag.releasedDay = state.day; }
  return e;
}

// New MRR per month (last 30 days of Stripe 'new' events): the base a conversion change compounds on.
export const newMrrMonth = (state) => (state.stripe?.events ?? []).filter((x) => x.type === 'new' && x.day > state.day - 30).reduce((a, x) => a + x.amount, 0);
const SURFACE_WEIGHT = { landing: 1, checkout: 1, onboarding: 0.5 }; // [design] how much of new MRR a relative change moves

/** decideExperiment + the consequence ledger: adopting a winner before the stop rule when it isn't real is a mistake. */
export function concludeExperiment(state, e, decision, { learning = '' } = {}) {
  decideExperiment(state, e, decision, { learning });
  if (e.early && e.falseWinner) {
    const monthly = Math.max(0, -e.trueEffect) * newMrrMonth(state) * (SURFACE_WEIGHT[e.surface] ?? 1);
    logMistake(state, {
      functionId: 'analytics_pmf', id: 'peeking', label: 'Stopped a test early and shipped a false winner', app: 'insights', delayed: true,
      cost: { hours: (SURFACES[e.surface]?.build ?? 2) + EXP_HOURS.ship, usd: round2(monthly * 3) },
      detail: `"${e.name}" was shipped at ${Math.round(e.winProbAtDecision * 100)}% win probability with ${e.c.n + e.v.n} of ${2 * e.nReq} planned exposures. Its real effect on ${e.metric} is ${e.trueEffect >= 0 ? '+' : ''}${Math.round(e.trueEffect * 100)}%${monthly > 0 ? `, about ${Math.round(monthly)} dollars of new MRR a month` : ''}.`,
    });
  }
  return e;
}

// Shipped experiment effects, by surface: { landing: mult, checkout: mult, onboarding: relative mult }.
// Running tests expose half the traffic to the variant.
export function experimentEffects(state) {
  const ins = state.apps?.insights;
  const out = { landing: 1, checkout: 1, onboarding: 1 };
  const flags = ins?.featureFlags ?? [];
  for (const e of ins?.experiments ?? []) {
    // A killed flag (toggleFlag kill switch) turns the variant off for everyone until it is switched back on.
    if (flags.some((f) => f.experimentId === e.id && !f.removed && f.killed)) continue;
    const eff = e.decision === 'ship' ? e.trueEffect : e.status === 'running' ? e.trueEffect / 2 : 0;
    if (eff && out[e.surface] != null) out[e.surface] *= 1 + eff;
  }
  return out;
}

export const staleFlags = (state) => (state.apps?.insights?.featureFlags ?? []).filter((f) => !f.removed && (f.status === 'released' || f.status === 'off') && f.releasedDay != null && state.day - f.releasedDay > 30);

// ---- Automations exposure ----
/** Action: toggle a feature flag (kill switch). Returns { ok, error?, hoursCost, usdCost }. */
export function toggleFlag(state, key, on, { dryRun = false } = {}) {
  const f = ensureLab(state).featureFlags.find((x) => x.key === key && !x.removed);
  if (!f) return { ok: false, error: 'flag not found', hoursCost: 0, usdCost: 0 };
  if (!dryRun) { f.rollout = on ? (f.status === 'experiment' ? 50 : 100) : 0; f.killed = !on; }
  return { ok: true, hoursCost: 0, usdCost: 0 };
}

// ---- Operator read (functionId analytics_pmf) ----
export function analyticsOperatorRead(state) {
  const ins = state.apps?.insights;
  const surveys = [...(ins?.pmf?.surveys ?? []), ...(ins?.nps?.surveys ?? [])].filter((s) => s.status === 'closed');
  const exps = (ins?.experiments ?? []).filter((e) => e.decision);
  const calls = ins?.pmf?.calls ?? [];
  const cuts = ins?.pmf?.cuts ?? [];
  if (!surveys.length && !exps.length && !calls.length && !cuts.length) return { tier: 'unknown', evidence: [], coaching: ['Run the PMF survey on people who used the core feature.'] };
  const evidence = [], coaching = [];
  let s = 0.6;
  const pmfS = surveys.filter((x) => x.kind === 'pmf');
  if (pmfS.length) {
    const actOnly = pmfS.filter((x) => x.target === 'activated').length / pmfS.length;
    s += 0.15 * actOnly - 0.15 * (1 - actOnly);
    evidence.push(`${pmfS.length} PMF surveys, ${Math.round(actOnly * 100)}% sent to activated users only`);
    if (actOnly < 1) coaching.push('Run the PMF survey on people who used the core feature.');
  }
  if (exps.length) {
    const early = exps.filter((e) => e.early).length, fw = exps.filter((e) => e.falseWinner).length, shipped = exps.filter((e) => e.decision === 'ship').length;
    const learned = exps.filter((e) => e.learning.trim().length >= 15).length;
    s -= 0.35 * (early / exps.length) + 0.25 * (shipped ? fw / shipped : 0);
    s += 0.1 * (learned / exps.length);
    evidence.push(`${exps.length} experiments decided: ${early} before the stop rule, ${shipped} shipped (${fw} of them noise or worse), ${learned} with a written learning`);
    if (early) coaching.push('Write the stop rule before you launch the test, then wait for it.');
    if (learned < exps.length) coaching.push('Report the losing tests: write what you learned when you conclude.');
  }
  const judged = calls.filter((c) => c.checked || c.claim);
  if (judged.length) {
    const wrong = judged.filter((c) => c.claim !== c.truth).length;
    s += wrong ? -0.25 : 0.1;
    evidence.push(`${judged.length} PMF call(s), ${wrong} contradicted by retention`);
    if (calls.some((c) => c.basis === 'nps')) coaching.push('NPS is not PMF. Run the PMF survey on people who used the core feature.');
    if (calls.some((c) => c.claim && c.basis === 'pmf_recent')) coaching.push('A flat retention curve matters more than one good week.');
  }
  // PMF process: segmenting, retention not vanity, spotting false PMF (docs/research/early-stage/pmf-process.md).
  const segSurveys = pmfS.filter((x) => x.rows?.length);
  const segmented = cuts.some((c) => c.by === 'segment' || c.by === 'source') || calls.some((c) => c.segmentId);
  if (segmented) { s += 0.08; evidence.push('cut PMF results by segment or source'); }
  else if (segSurveys.length) { s -= 0.08; evidence.push(`${segSurveys.length} PMF survey(s) read as one number, never cut by segment or source`); coaching.push('Cut the Sean Ellis result by segment and by signup source: PMF often exists in one niche before it exists overall.'); }
  const claims = calls.filter((c) => c.claim && c.sawRetention !== undefined);
  if (claims.length) {
    const withRet = claims.filter((c) => c.sawRetention).length / claims.length;
    s += 0.08 * withRet - 0.1 * (1 - withRet);
    evidence.push(`${Math.round(withRet * 100)}% of PMF claims came after looking at retention by segment`);
    if (withRet < 1) coaching.push('Check that the retention curve flattens (by segment) before you say "we have PMF".');
  }
  const fooled = calls.filter((c) => c.claim && (c.falseFlags?.length ?? 0) > 0);
  const careful = calls.filter((c) => !c.claim && (c.falseFlags?.length ?? 0) > 0);
  if (fooled.length) { s -= Math.min(0.3, 0.15 * fooled.length); evidence.push(`${fooled.length} PMF claim(s) made while a false-PMF signal was showing (${[...new Set(fooled.flatMap((c) => c.falseFlags))].join(', ')})`); coaching.push('Before calling PMF, clear the false-PMF checks: concentration, friends, paid-only growth, launch spike, discounts, design partners.'); }
  if (careful.length) { s += 0.08; evidence.push('held off calling PMF while false-PMF signals were showing'); }
  const segRight = calls.filter((c) => c.segmentId && c.claim === c.truth).length;
  if (segRight) { s += 0.08; evidence.push(`${segRight} PMF call(s) made for one segment and confirmed`); }
  const scaled = (state.mistakes ?? []).filter((m) => m.id === 'premature_scaling_false_pmf').length;
  if (scaled) { s -= Math.min(0.3, 0.15 * scaled); evidence.push(`${scaled} time(s) scaled spend on a false PMF call`); coaching.push('Scale per segment, after the curve flattens: not on a spike, a survey of friends, or one big customer.'); }
  const stale = staleFlags(state).length;
  if (stale) { s -= 0.05; evidence.push(`${stale} stale feature flags left in code`); }
  const tier = s >= 0.8 ? 'stellar' : s >= 0.6 ? 'good' : s >= 0.4 ? 'average' : 'mediocre';
  if (tier !== 'stellar') coaching.push('What a stellar operator does: Sean Ellis survey only on users who reached the core action; pre-registers hypothesis, sample size and stop rule; reports losses.');
  if (!coaching.length) coaching.push('Keep pre-registering hypothesis, sample and stop rule; report losses.');
  return { tier, score: clamp(s, 0, 1), evidence, coaching };
}
