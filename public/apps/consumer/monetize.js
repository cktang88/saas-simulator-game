// Mobile monetization: paywall configuration (hard / hard + trial / soft / freemium), plan mix (weekly / monthly / annual),
// the onboarding quiz, paywall honesty (checked by App Review and the FTC), store commission and payout delays, vendor
// tooling fees, refunds, paywall A/B tests, and the install -> paywall -> purchase conversion every channel shares.
// Research: docs/research/consumer-apps/paywall-mobile-playbook.md. [design] numbers are in ./params.js.

import { PAYWALL, ECON, INTENT, MISTAKE_FN } from './params.js';
import { MOBILE, commissionRate, storeFee, baseHazard } from '../../core/mobile.js';
import { ensureConsumer, binomial, crand, cchance, pushEvent, usd } from './state.js';
import { setStoreFeeHook, createCustomer, subscribe } from '../../core/stripe.js';
import { productFactor, hasProduct, syntheticPerson } from '../../core/market.js';
import { post } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { notify } from '../../core/state.js';
import { clamp, round2, dateOf, monthKey } from '../../core/util.js';
import { zScore } from '../growth/asoModel.js';

const FN = MISTAKE_FN;
const PLAN_NAMES = ['weekly', 'monthly', 'annual'];
const INTERVAL = { weekly: 'week', monthly: 'month', annual: 'year' };
const monthlyEq = (name, price) => (name === 'weekly' ? (price * 52) / 12 : name === 'annual' ? price / 12 : price);

// ---------------- judges (deterministic, offline) ----------------

/**
 * Is the paywall's disclosure clear and conspicuous (Apple 3.1.2, ROSCA)? Checks what the player wrote against what the paywall
 * really charges: every enabled plan's price and period, auto-renewal, what happens when a trial ends, how to cancel, legal links.
 * Returns { score 0..1, issues: [..], parts }.
 */
export function judgeDisclosure(pw) {
  const c = pw.copy ?? {};
  const all = `${c.headline ?? ''} ${c.price ?? ''} ${c.renewal ?? ''} ${c.trial ?? ''} ${c.cancel ?? ''} ${c.legal ?? ''}`.toLowerCase();
  const issues = [];
  const on = PLAN_NAMES.filter((n) => pw.plans?.[n]?.on);
  const dark = Object.keys(pw.dark ?? {}).filter((k) => pw.dark[k]);
  // price + period for each enabled plan
  let priced = 0;
  for (const n of on) {
    const p = String(pw.plans[n].price);
    const period = { weekly: /week|wk|7 days/, monthly: /month|mo\b|30 days/, annual: /year|annual|yr/ }[n];
    const ok = all.includes(p.replace(/\.0+$/, '')) && period.test(all);
    if (ok) priced++; else issues.push(`The ${n} price ($${p}) and its billing period are not stated together.`);
  }
  const priceScore = on.length ? priced / on.length : 0;
  const renewal = /auto[- ]?renew|renews? (automatically|every|each)|billed (every|each|weekly|monthly|annually|yearly)|recurring|until you cancel|subscription renews/.test(all);
  if (!renewal) issues.push('Auto-renewal is not stated: say the subscription renews until cancelled.');
  const hasTrial = pw.type === 'hard_trial';
  let trialScore = 1;
  if (hasTrial) {
    const len = new RegExp(`${pw.trialDays}[- ]?(day|d\\b)|${['one', 'two', 'three', 'four', 'five', 'six', 'seven'][pw.trialDays - 1] ?? 'zzz'}[- ]day`).test(all);
    const then = /(then|after|once the trial|when the trial|trial ends)[^.]{0,60}\$?\d/.test(all) || /\$\d[^.]{0,40}(after|then)/.test(all);
    trialScore = (len ? 0.4 : 0) + (then ? 0.6 : 0);
    if (!len || !then) issues.push('Trial: state the length and what is charged when it ends ("3-day free trial, then $x per year").');
  }
  const cancel = /cancel/.test(all) && /(settings|apple id|app store|google play|anytime|any time)/.test(all);
  if (!cancel) issues.push('How to cancel is missing: say where (Settings > Apple ID > Subscriptions) and that it can be done anytime.');
  const legal = /terms/.test(all) && /privacy/.test(all);
  if (!legal) issues.push('Terms and privacy links are missing from the paywall.');
  let score = 0.28 * priceScore + 0.2 * (renewal ? 1 : 0) + 0.18 * trialScore + 0.2 * (cancel ? 1 : 0) + 0.14 * (legal ? 1 : 0);
  if (dark.includes('smallPrint')) { score *= 0.55; issues.push('The price is in small print under a "free" headline: not conspicuous.'); }
  if (dark.includes('toggleTrial')) { score *= 0.6; issues.push('A trial on/off toggle is reported to be rejected (3.1.2) [unverified].'); }
  if (dark.includes('countdown')) { score *= 0.85; issues.push('A fake countdown is a deceptive urgency pattern.'); }
  if (/100% free|totally free|no payment due|nothing to pay/.test(all) && !/(then|after)[^.]{0,60}\$?\d/.test(all)) { score *= 0.7; issues.push('"Free" is promoted without the later price next to it.'); }
  // A price shown on the paywall that the plans do not charge is misleading, whatever else is clear.
  const charged = new Set(on.map((n) => String(pw.plans[n].price)));
  const shown = [...all.matchAll(/\$\s?(\d+(?:\.\d+)?)/g)].map((m) => m[1]);
  const stray = shown.filter((v) => ![...charged].some((c) => Number(c) === Number(v)));
  if (stray.length) { score *= 0.7; issues.push(`The paywall shows $${stray[0]} but no plan charges that.`); }
  if (!all.trim()) issues.unshift('No paywall copy written: the review and the buyer see a bare price button.');
  return { score: round2(clamp(score, 0, 1)), issues, parts: { priceScore, renewal, trialScore, cancel, legal, dark } };
}

/** The onboarding quiz before the paywall: steps are the questions the player wrote. Returns { score, completion, issues }. */
export function judgeQuiz(steps) {
  const q = (steps ?? []).map((s) => String(s).trim()).filter(Boolean);
  const n = q.length;
  const Q = PAYWALL.quiz;
  const text = q.join(' ').toLowerCase();
  const issues = [];
  let s = 0;
  const lenOk = n >= Q.goodSteps[0] && n <= Q.goodSteps[1];
  s += lenOk ? 0.3 : n >= Q.minSteps && n <= Q.maxSteps ? 0.18 : 0.04;
  if (!lenOk) issues.push(n < Q.minSteps ? 'Too short to feel personalised (5+ steps).' : n > Q.maxSteps ? 'Too long: people quit before the paywall.' : 'Aim for 7-12 steps.');
  const goal = /goal|want to|hoping|achieve|biggest|struggl|challenge|why/.test(text);
  s += goal ? 0.2 : 0; if (!goal) issues.push('Ask what they want and what is in the way: the answers personalise the paywall.');
  const personal = /age|level|experience|how often|how many|schedule|weekly|daily|per day|time of day/.test(text);
  s += personal ? 0.15 : 0; if (!personal) issues.push('No questions that change the plan (level, frequency, schedule).');
  const commit = /ready|commit|promise|plan|ready to start|we.?ve built|your (plan|results)/.test(text);
  s += commit ? 0.15 : 0; if (!commit) issues.push('End with a "your plan is ready" step that leads into the paywall.');
  const social = /join|people like you|thousand|million|rated|review/.test(text);
  s += social ? 0.1 : 0;
  const distinct = new Set(q.map((x) => x.toLowerCase())).size === n && n > 0;
  s += distinct ? 0.1 : 0; if (n && !distinct) issues.push('Repeated questions.');
  const filler = q.filter((x) => x.split(/\s+/).length < 3).length;
  if (filler > n / 3) { s -= 0.1; issues.push('Many one-word steps feel like filler.'); }
  const completion = n > Q.maxSteps ? clamp(1 - (n - Q.goodSteps[1]) * Q.completionCost * 2, 0.55, 1) : clamp(1 - Math.max(0, n - Q.goodSteps[1]) * Q.completionCost, 0.6, 1);
  return { score: round2(clamp(s, 0, 1)), completion: round2(completion), steps: n, issues };
}

// ---------------- config ----------------

export const darkOf = (pw) => {
  const on = Object.keys(pw.dark ?? {}).filter((k) => pw.dark[k] && PAYWALL.dark[k]);
  return { on, conv: on.reduce((a, k) => a + PAYWALL.dark[k].conv, 0), refund: on.reduce((a, k) => a + PAYWALL.dark[k].refund, 0), r312: on.reduce((a, k) => a + PAYWALL.dark[k].r312, 0) };
};

/** Merge a patch into the paywall config (type, trialDays, plans, default, dark, copy, quiz). Returns { ok, hours }. */
export function setPaywall(state, patch = {}) {
  const C = ensureConsumer(state);
  const pw = C.monet.paywall;
  if (patch.type) {
    if (!PAYWALL.types[patch.type]) return { ok: false, error: 'Unknown paywall type.' };
    pw.type = patch.type;
  }
  if (patch.trialDays != null) pw.trialDays = clamp(Math.round(patch.trialDays), 1, 14);
  if (patch.plans) for (const n of PLAN_NAMES) if (patch.plans[n]) pw.plans[n] = { ...pw.plans[n], ...patch.plans[n], price: patch.plans[n].price != null ? round2(clamp(+patch.plans[n].price, 0.99, 299)) : pw.plans[n].price };
  if (!PLAN_NAMES.some((n) => pw.plans[n].on)) pw.plans.annual.on = true;
  if (patch.default && pw.plans[patch.default]?.on) pw.default = patch.default;
  if (!pw.plans[pw.default]?.on) pw.default = PLAN_NAMES.find((n) => pw.plans[n].on);
  if (patch.dark) pw.dark = { ...patch.dark };
  if (patch.copy) pw.copy = { ...pw.copy, ...patch.copy };
  pw.disclosure = judgeDisclosure(pw);
  return { ok: true, hours: patch.copy ? 0.75 : 0.25, disclosure: pw.disclosure };
}

export function setQuiz(state, steps) {
  const C = ensureConsumer(state);
  const j = judgeQuiz(steps);
  C.monet.paywall.quiz = { steps: steps.filter((s) => String(s).trim()), ...j, day: state.day };
  return { ok: true, hours: 0.4 + 0.12 * j.steps, quiz: C.monet.paywall.quiz };
}

/** Choose how the app takes money: 'iap' (Apple/Google, commission) or 'web' (Stripe checkout, US link-out rules, uncertain). */
export function setMode(state, mode) {
  const C = ensureConsumer(state);
  if (!['iap', 'web'].includes(mode)) return { ok: false, error: 'Mode is iap or web.' };
  C.monet.mode = mode;
  return { ok: true, hours: 2, note: mode === 'web' ? 'Web checkout avoids the store commission but loses buyers to the browser hop and risks a 3.1.1 rejection; the US link-out commission is unsettled [unverified].' : '' };
}

export function setTooling(state, id) {
  const C = ensureConsumer(state);
  const t = MOBILE.tooling[id];
  if (!t) return { ok: false, error: 'Unknown tool.' };
  if (C.monet.tooling === id) return { ok: true, hours: 0 };
  C.monet.tooling = id;
  return { ok: true, hours: t.setupHours };
}

export function enrollSmallBusiness(state) {
  const C = ensureConsumer(state);
  C.app.apple.sbp = true;
  return { ok: true, hours: 0.5, note: 'Apple Small Business Program: 15% while prior-year proceeds are at or under $1M.' };
}

// ---------------- plans ----------------

/** The store/web plan record for an interval, price and trial; created on demand so subscriptions keep a real plan id. */
export function planFor(state, name, price, trialDays = 0) {
  const id = `app_${name}_${String(price).replace('.', '_')}_${trialDays}`;
  let p = state.plans.find((x) => x.id === id);
  if (!p) {
    p = { id, name: `${name[0].toUpperCase()}${name.slice(1)} (app)`, price, interval: INTERVAL[name], trialDays, active: false, mobile: true };
    state.plans.push(p);
  }
  return p;
}

/** Share of buyers choosing each enabled plan: base mix x paywall-type modifier x the highlighted default x price perception. */
export function planMix(state, pw = ensureConsumer(state).monet.paywall) {
  const T = PAYWALL.types[pw.type];
  const wtp = state.market?.fit?.price?.wtp ?? 9.99;
  const w = {};
  for (const n of PLAN_NAMES) {
    if (!pw.plans[n].on) continue;
    const perceived = monthlyEq(n, pw.plans[n].price) * (n === 'weekly' ? PAYWALL.weeklyPerceived : 1);
    const price = clamp(Math.pow(wtp / Math.max(0.5, perceived), 0.5), 0.5, 1.6);
    w[n] = PAYWALL.mixBase[n] * T.mixMods[n] * (pw.default === n ? PAYWALL.defaultBoost : 1) * price;
  }
  const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(w).map(([n, v]) => [n, v / sum]));
}

const fitOf = (state) => clamp(productFactor(state) / PAYWALL.fitRef, 0.25, 2.2);

/** Paywall rates for a config and source: { pView, pStart, pTrialToPaid, installToPaid, mix }. Median product at neutral fit gives the RevenueCat anchors. */
export function funnelRates(state, source = 'ads:meta', pw = ensureConsumer(state).monet.paywall, { intent = null } = {}) {
  const C = ensureConsumer(state);
  const T = PAYWALL.types[pw.type];
  const fit = fitOf(state);
  const dark = darkOf(pw);
  const quiz = pw.quiz;
  const Q = PAYWALL.quiz;
  const quizMult = quiz ? Q.lift[0] + (Q.lift[1] - Q.lift[0]) * quiz.score : 0.92;
  const completion = quiz ? quiz.completion : 1;
  const mix = planMix(state, pw);
  const blend = Object.entries(mix).reduce((a, [n, sh]) => a + sh * monthlyEq(n, pw.plans[n].price) * (n === 'weekly' ? PAYWALL.weeklyPerceived : 1), 0);
  const wtp = state.market?.fit?.price?.wtp ?? 9.99;
  const priceEff = clamp(Math.pow(wtp / Math.max(0.5, blend), 0.35), 0.7, 1.2);
  const web = C.monet.mode === 'web' ? PAYWALL.webFriction : 1;
  const inten = intent ?? INTENT[source] ?? INTENT.default;
  const pView = clamp(T.view * completion, 0, 1);
  const pStart = clamp(T.start * Math.pow(fit, 0.9) * inten * quizMult * (1 + dark.conv) * priceEff * web, 0, 0.6);
  const pTrialToPaid = pw.type === 'hard_trial' ? clamp(T.trialToPaid * Math.pow(fit, 0.5) * (dark.on.length ? 0.9 : 1), 0, 0.8) : 1;
  return { pView, pStart, pTrialToPaid, installToPaid: pView * pStart * pTrialToPaid, mix, fit, dark };
}

/** Expected paid-subscriber cumulative revenue per payer by `days` (gross), from the retention curves, fit-scaled like core churn. */
export function revenuePerPayer(state, pw, mix, days = 60) {
  const fit = fitOf(state);
  const trialRetain = pw.type === 'hard_trial' ? 1 / PAYWALL.types.hard_trial.ltvBoost : 1; // trial starters retain better (vendor claim [unverified])
  const hz = (interval, k) => clamp(baseHazard(interval, k) * Math.pow(1 / Math.max(0.2, fit * PAYWALL.fitRef), 0.7) * trialRetain, 0.01, 0.95);
  let total = 0;
  for (const [n, sh] of Object.entries(mix)) {
    const price = pw.plans[n].price;
    const iv = INTERVAL[n];
    const period = iv === 'week' ? 7 : iv === 'month' ? 30 : 365;
    let surv = 1, rev = 0;
    for (let k = 0, d = pw.type === 'hard_trial' ? pw.trialDays : 0; d < days; k++, d += period) {
      rev += price * surv;
      surv *= 1 - hz(iv, k + 1);
    }
    const refund = ECON.refundBase[iv] * (1 + darkOf(pw).refund);
    total += sh * rev * (1 - refund);
  }
  return total;
}

/** Everything the Playbook and the tests need about the paywall's expected funnel for a source. */
export function expectedFunnel(state, source = 'ads:meta', pw = ensureConsumer(state).monet.paywall, opts = {}) {
  const r = funnelRates(state, source, pw, opts);
  const arppu60 = revenuePerPayer(state, pw, r.mix, 60);
  return { ...r, arppu60, revPerInstall60: r.installToPaid * arppu60 };
}

// ---------------- store fee hook ----------------

function rollProceeds(state, C) {
  const y = dateOf(state).getUTCFullYear();
  const P = C.monet.proceeds;
  if (P.year == null) P.year = y;
  if (P.year !== y) { P.prior = P.ytd; P.ytd = 0; P.year = y; }
  return P;
}
export function currentCommission(state, store = 'ios') {
  const C = ensureConsumer(state);
  const P = rollProceeds(state, C);
  return commissionRate({ store, enrolled: C.app.apple.sbp, priorProceeds: P.prior, ytdProceeds: P.ytd });
}

setStoreFeeHook((state, sub, amount) => {
  const C = ensureConsumer(state);
  const P = rollProceeds(state, C);
  const rate = commissionRate({ store: sub.store, enrolled: C.app.apple.sbp, priorProceeds: P.prior, ytdProceeds: P.ytd });
  const T = MOBILE.tooling[C.monet.tooling] ?? MOBILE.tooling.none;
  const M = (C.monet.monthRev ??= { key: null, amount: 0 });
  const key = monthKey(state);
  if (M.key !== key) { M.key = key; M.amount = 0; }
  const over = Math.max(0, M.amount + amount - Math.max(T.free, M.amount));
  M.amount += amount;
  const tooling = T.pct ? round2(over * T.pct) : 0;
  const commission = round2(amount * rate);
  P.ytd = round2(P.ytd + amount - commission);
  C.monet.stats.revenue = round2(C.monet.stats.revenue + amount);
  C.monet.stats.fees = round2(C.monet.stats.fees + commission + tooling);
  return { fee: round2(commission + tooling), commission, tooling };
});

// ---------------- converting installs ----------------

function pickStore(state, C) {
  if (C.monet.mode === 'web') return null;
  const { ios, play } = C.app.live;
  if (ios && play) return crand(state) < 0.62 ? 'ios' : 'play';
  return ios ? 'ios' : play ? 'play' : 'ios';
}
function pickPlanName(state, mix) {
  let r = crand(state);
  for (const [n, sh] of Object.entries(mix)) { r -= sh; if (r <= 0) return n; }
  return Object.keys(mix).at(-1);
}

const armPaywall = (pw, patch) => (patch ? { ...pw, ...patch, plans: { ...pw.plans, ...(patch.plans ?? {}) }, dark: patch.dark ?? pw.dark, copy: { ...pw.copy, ...(patch.copy ?? {}) } } : pw);

function ledgerSource(C, source) {
  return (C.funnel.sources[source] ??= { views: 0, installs: 0, pwViews: 0, starts: 0, paid: 0, spend: 0, extraSpend: 0 });
}

/**
 * The one place installs become customers. Every channel (Meta ads, creators, clipping, ASO, founder content, referrals) calls this
 * through growth/acquire.js, so the same paywall and plan mix apply to all of them.
 * opts: { source, n installs, intent, geoArppu (price multiplier, default 1), note }.
 */
export function convertInstalls(state, { source, n, intent = null, geoArppu = 1 } = {}) {
  const C = ensureConsumer(state);
  const out = { subs: [], leads: 0, held: 0, installs: n, pwViews: 0, starts: 0 };
  if (!(n > 0)) return out;
  const L = ledgerSource(C, source);
  L.installs += n;
  if (!hasProduct(state)) return out;
  const base = C.monet.paywall;
  const tests = C.monet.tests.filter((t) => t.status === 'running');
  const test = tests[0] ?? null;
  const split = test ? [['a', binomial(state, n, 0.5), base], ['b', 0, armPaywall(base, test.patch)]] : [['a', n, base]];
  if (test) split[1][1] = n - split[0][1];
  for (const [arm, m, pw] of split) {
    if (!(m > 0)) continue;
    const r = funnelRates(state, source, pw, { intent });
    const views = binomial(state, m, r.pView);
    const starts = binomial(state, views, r.pStart);
    out.pwViews += views; out.starts += starts;
    L.pwViews += views; L.starts += starts;
    if (test) { test.arms[arm].views += views; test.arms[arm].starts += starts; test.arms[arm].installs += m; }
    const T = PAYWALL.types[pw.type];
    const dark = r.dark;
    const disc = pw === base ? (base.disclosure ?? judgeDisclosure(base)) : judgeDisclosure(pw);
    for (let i = 0; i < starts; i++) {
      const name = pickPlanName(state, r.mix);
      const trialDays = pw.type === 'hard_trial' ? pw.trialDays : 0;
      const plan = planFor(state, name, pw.plans[name].price, trialDays);
      const p = syntheticPerson(state);
      const c = createCustomer(state, { name: p.name, email: p.email, source });
      const iv = INTERVAL[name];
      const refund = ECON.refundBase[iv] * (1 + dark.refund) * (disc.score < 0.6 ? 1.6 : 1) * (T.trialDays === 0 && pw.type.startsWith('hard') ? 1.15 : 1) + (C.monet.tooling === 'none' ? 0.01 : 0);
      const refundCapped = Math.min(0.22, refund);
      const sub = subscribe(state, c.id, plan, {
        trial: trialDays > 0, source, discountPct: geoArppu < 1 ? round2(1 - geoArppu) : 0,
        forceConvert: trialDays > 0 ? r.pTrialToPaid : null,
        fields: { mobile: true, store: pickStore(state, C), refundRate: round2(refundCapped * 1000) / 1000, mobileChurnMult: round2((1 + 0.18 * dark.on.length + (disc.score < 0.5 ? 0.1 : 0)) * (trialDays > 0 ? 1 / T.ltvBoost : 1)), paywallArm: test ? `${test.id}:${arm}` : null },
      });
      out.subs.push(sub);
    }
  }
  return out;
}

// ---------------- paywall A/B tests ----------------

/**
 * Start a paywall test: your current paywall (A) against a variant patch (B). Needs the Superwall-style tool for remote tests;
 * without it a variant ships with an app release (a day of review). Hidden truth: both arms convert at their real funnel rate.
 */
export function startPaywallTest(state, { name = 'Paywall test', patch = {} } = {}) {
  const C = ensureConsumer(state);
  if (C.monet.tests.some((t) => t.status === 'running')) return { ok: false, error: 'One paywall test at a time.' };
  if (!Object.keys(patch).length) return { ok: false, error: 'Describe what arm B changes.' };
  const t = { id: `pwt_${C.monet.tests.length + 1}`, name, patch, status: 'running', startDay: state.day, arms: { a: { views: 0, starts: 0, installs: 0 }, b: { views: 0, starts: 0, installs: 0 } }, verdict: null };
  C.monet.tests.push(t);
  const T = MOBILE.tooling[C.monet.tooling];
  return { ok: true, hours: PAYWALL.testHours, test: t, note: T?.paywallTests ? 'Remote paywall test live.' : 'Shipped with your next app version, so it only starts after review.' };
}
export function paywallTestVerdict(t) {
  const { a, b } = t.arms;
  const min = PAYWALL.tests.minViewsPerArm;
  if (a.views < min || b.views < min) return { verdict: 'underpowered', z: 0, need: min };
  const z = zScore({ views: a.views, installs: a.starts }, { views: b.views, installs: b.starts });
  return { verdict: Math.abs(z) < 1.64 ? 'inconclusive' : z > 0 ? 'b_wins' : 'a_wins', z: round2(z), need: min };
}
/** Stop a test. decision 'ship_b' | 'keep_a'. Shipping an underpowered or inconclusive variant is logged as a mistake. */
export function concludePaywallTest(state, id, decision = 'keep_a') {
  const C = ensureConsumer(state);
  const t = C.monet.tests.find((x) => x.id === id);
  if (!t || t.status !== 'running') return { ok: false, error: 'No running test.' };
  const v = paywallTestVerdict(t);
  t.status = 'done'; t.verdict = v.verdict; t.decision = decision; t.doneDay = state.day;
  if (decision === 'ship_b') {
    const stats = `A ${t.arms.a.starts}/${t.arms.a.views}, B ${t.arms.b.starts}/${t.arms.b.views}`;
    if (v.verdict !== 'b_wins') logMistake(state, { functionId: FN, id: 'paywall_test_called_early', label: 'Shipped a paywall variant the test had not proved', cost: { days: 14, usd: 0, hours: 1 }, circles: true, app: 'launch', detail: `${v.verdict} (${stats}; ${v.need} paywall views per arm needed).`, key: `pwt_early:${t.id}` });
    setPaywall(state, t.patch);
  }
  pushEvent(state, 'paywall_test_result', { testId: t.id, verdict: v.verdict, decision, label: `Paywall test "${t.name}": ${v.verdict}` });
  return { ok: true, hours: 0.25, verdict: v };
}

// ---------------- daily / monthly ----------------

export function monetDay(state) {
  const C = ensureConsumer(state);
  // A running test that has enough data announces its result once.
  for (const t of C.monet.tests) {
    if (t.status !== 'running' || t.announced) continue;
    const v = paywallTestVerdict(t);
    if (v.verdict !== 'underpowered') { t.announced = true; pushEvent(state, 'paywall_test_result', { testId: t.id, verdict: v.verdict, label: `Paywall test "${t.name}" has enough data: ${v.verdict.replace('_', ' ')}` }); }
  }
  // Uncertain court ruling on US link-outs: scheduled once, deterministic (affects web checkout only).
  if (C.monet.mode === 'web' && !C.monet.ruling) {
    const when = 150 + (parseInt(String(C.rs).slice(-3), 10) || 0) % 200;
    if (state.day >= when) { C.monet.ruling = { day: state.day, commission: MOBILE.linkOutCommission }; notify(state, `A court set Apple's commission on US link-out purchases (${Math.round(MOBILE.linkOutCommission * 100)}% in this simulation) [unverified: the real ruling is unsettled]. Web checkout now pays it.`, { type: 'warn', app: 'launch' }); }
  }
}

export function monetMonthEnd(state) {
  const C = ensureConsumer(state);
  const subs = (state.stripe?.subscriptions ?? []).filter((s) => s.mobile);
  const mk = monthKey(state);
  // Court-set link-out commission on web purchases this month.
  if (C.monet.ruling && C.monet.mode === 'web') {
    const web = (state.stripe?.charges ?? []).filter((c) => c.status !== 'failed' && c.day > state.day - 30 && subs.some((s) => s.id === c.subId && !s.store)).reduce((a, c) => a + c.amount, 0);
    const fee = round2(web * C.monet.ruling.commission);
    if (fee > 1) post(state, { amount: -fee, counterparty: 'Apple (link-out commission)', description: `Court-set commission on web purchases ${mk}`, category: 'software', method: 'ach' });
  }
  refundWatch(state, C, subs, mk);
  roscaWatch(state, C, mk);
}

function refundWatch(state, C, subs, mk) {
  const first = subs.filter((s) => s.startDay > state.day - 30 && s.firstPaidDay != null);
  const ids = new Set(first.map((s) => s.id));
  const charges = (state.stripe?.charges ?? []).filter((c) => ids.has(c.subId) && c.day > state.day - 30);
  const chargeSub = new Map(charges.map((c) => [c.id, c]));
  const refunds = (state.stripe?.refunds ?? []).filter((r) => chargeSub.has(r.chargeId));
  const amount = refunds.reduce((a, r) => a + r.amount, 0);
  const n = first.length;
  C.monet.refundWatch = { month: mk, charges: n, refunds: refunds.length };
  if (n < ECON.refundSpike.minCharges || refunds.length / n < ECON.refundSpike.share) return;
  const weekly = first.filter((s) => s.interval === 'week').length / n;
  const dark = darkOf(C.monet.paywall).on.length;
  const id = weekly >= 0.4 ? 'weekly_plan_refund_spike' : 'aggressive_paywall_refunds';
  logMistake(state, { functionId: FN, id, label: id === 'weekly_plan_refund_spike' ? 'Refund spike on weekly plans' : 'Refund spike from an aggressive paywall', cost: { usd: round2(amount), reputation: 2, hours: 2 }, delayed: true, charge: true, app: 'launch', detail: `${refunds.length} of ${n} new paying subscribers (${Math.round(100 * refunds.length / n)}%) were refunded in ${mk}${dark ? ` with ${dark} dark pattern(s) on` : ''}${weekly ? `; ${Math.round(weekly * 100)}% were on the weekly plan` : ''}.`, key: `refund_spike:${mk}` });
  const S = state.apps.organic?.appstore;
  if (S) { const k = Math.round(refunds.length * ECON.reviewHit); S.reviews = (S.reviews ?? 0) + k; S.starSum = (S.starSum ?? 0) + k; } // refunded buyers leave 1-star reviews
}

function roscaWatch(state, C, mk) {
  const pw = C.monet.paywall;
  const paying = (state.stripe?.subscriptions ?? []).filter((s) => s.mobile && s.firstPaidDay != null && s.startDay > state.day - 60).length;
  if (paying < 10) return;
  const dark = darkOf(pw);
  const d = pw.disclosure ?? judgeDisclosure(pw);
  const R = PAYWALL.rosca;
  const p = R.monthlyBase + R.perDark * dark.on.length + (d.score < 0.5 ? R.noCancelCopy * 4 : 0) + (!d.parts?.cancel ? R.noCancelCopy : 0);
  if (!(d.score < 0.7 || dark.on.length)) return; // a clear disclosure with no dark patterns is not a ROSCA target
  if (!cchance(state, p * 4)) return; // scaled so one bad month is not certain; repeated months compound
  const bill = Math.round(R.bill[0] + crand(state) * (R.bill[1] - R.bill[0]));
  post(state, { amount: -bill, counterparty: 'Law firm (consumer protection inquiry)', description: 'Response to a consumer-protection inquiry about auto-renewal disclosures', category: 'legal', method: 'ach' });
  logMistake(state, { functionId: FN, id: 'misleading_auto_renew', label: 'Consumer-protection inquiry about auto-renewal disclosure', cost: { usd: bill, reputation: 3, hours: 12 }, delayed: true, charge: true, app: 'launch', detail: `The paywall disclosure scored ${Math.round(d.score * 100)}%${dark.on.length ? ` and used ${dark.on.map((k) => PAYWALL.dark[k].label).join(', ')}` : ''}. ROSCA still applies after the click-to-cancel rule was vacated in July 2025.`, key: `rosca:${mk}` });
  pushEvent(state, 'platform_policy_strike', { kind: 'ftc_rosca', label: 'Consumer-protection inquiry about your subscription disclosure' });
}

/** Pricing sanity for the "store fee not in the model" trap: net revenue per $1 of gross after commission and tooling. */
export const netShare = (state, store = 'ios') => 1 - currentCommission(state, store);
export { usd };
