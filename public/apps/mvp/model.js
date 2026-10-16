// MVP lab model: pre-product and MVP experiments the player designs and runs. Each samples the hidden market truth
// (core/truth.js) through the audience the experiment actually reaches, and returns noisy, biased results with
// confidence ranges. No mistake is free: every one lands in the mistakes ledger under 'mvp_experiments'.
//
//   smoke            landing page + CTA (email vs deposit) with traffic from network / community / a paid test
//   concierge        deliver the outcome by hand to N customers; reveals retention and WTP; does not scale
//   wizard           a real-looking UI with a manual backend; also reveals activation; costs build hours
//   design_partners  3-10 partners, weekly sessions, feedback that mixes segment jobs with idiosyncratic asks
//   (pre-sale and single-feature MVP live in Sales presell and the Product build queue; this module reads them)
//
// Hypothesis and pass/fail threshold are set BEFORE running (research hypotheses API does not exist yet: small local one).

import { ensure } from '../../core/state.js';
import { rng, gaussian, clamp, uid, round2, pct } from '../../core/util.js';
import { post } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { MARKET } from '../../core/params.js';
import { truthOf, segmentMatch, drawPerson, featureValue, painStrength } from '../../core/truth.js';
import { scheduleEvent, completeEvent, findSlots, ensureCalendar } from '../../core/calendar.js';
import { researchSlice, productSlice, newFeature } from '../product/store.js';
import { ensureCrm, contactName, companyOf } from '../sales/model.js';
import { isCommitment } from '../sales/presell.js';
import { MVP, METRICS, TYPE_LABEL } from './params.js';

export const FN = 'mvp_experiments';
export { MVP, METRICS, TYPE_LABEL };

export function mvpSlice(state) {
  const s = ensure(state, 'mvp', () => ({}));
  s.experiments ??= []; s.learning ??= []; s.reputation ??= 100; s.adoptions ??= [];
  return s;
}
export const expById = (state, id) => mvpSlice(state).experiments.find((e) => e.id === id);
const mistake = (state, o) => logMistake(state, { functionId: FN, app: 'mvp', ...o });

// ---------------------------------------------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------------------------------------------

/** Wilson score interval (90%) for k of n. */
export function wilson(k, n, z = MVP.z) {
  if (!n) return { rate: null, lo: 0, hi: 1, k, n };
  const p = k / n, z2 = z * z;
  const c = (p + z2 / (2 * n)) / (1 + z2 / n);
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { rate: p, lo: clamp(c - h, 0, 1), hi: clamp(c + h, 0, 1), k, n };
}
export const fmtRange = (w) => (w.rate == null ? 'n/a' : `${pct(w.rate)} (${pct(w.lo, 0)} to ${pct(w.hi, 0)}, n=${w.n})`);
const quantile = (xs, q) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); const i = (a.length - 1) * q; const lo = Math.floor(i); return a[lo] + (a[Math.min(a.length - 1, lo + 1)] - a[lo]) * (i - lo); };

// ---------------------------------------------------------------------------------------------------------------
// Hypothesis and thresholds
// ---------------------------------------------------------------------------------------------------------------

/** Normalise a hypothesis; returns null when there is no usable pass/fail threshold. */
export function normalizeHypothesis(type, h) {
  if (!h) return null;
  const statement = String(h.statement ?? '').trim();
  const metric = METRICS[type]?.[h.metric] ? h.metric : null;
  const threshold = Number(h.threshold);
  if (!statement || !metric || !Number.isFinite(threshold) || threshold <= 0 || threshold >= 1 || h.threshold === '' || h.threshold == null) return null;
  return { statement, metric, threshold };
}

function noCriteria(state, exp) {
  exp.noCriteria = true;
  mistake(state, {
    id: 'no_success_criteria', label: 'Ran an experiment with no pass/fail threshold', cost: { hours: 2, days: 4 }, delayed: true, charge: true,
    detail: `"${exp.name}" had no hypothesis and threshold set before it ran, so any result can be argued either way. You will spend the next days deciding what it "means" instead of acting.`, key: `nocrit:${exp.id}`,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Who the experiment reaches
// ---------------------------------------------------------------------------------------------------------------

const BROAD_WORDS = /\b(everyone|anyone|everybody|all (businesses|people|companies)|businesses of all sizes|general public)\b/i;
const srcParams = (key) => MVP.smoke.sources[key === 'outreach' ? 'paid' : key] ?? MVP.smoke.sources.community;

/** Weights over truth segments (+ 'outsider') for the people an audience text and a channel actually reach. */
export function audienceMix(state, text, sourceKey) {
  const t = truthOf(state);
  const S = srcParams(sourceKey);
  const matches = segmentMatch(state, text).filter((x) => x.score >= 0.2);
  const trimmed = String(text ?? '').trim();
  const broad = !trimmed || BROAD_WORDS.test(trimmed) || trimmed.split(/\s+/).length < 2;
  let p = 0, o = S.outsiderRest;
  const w = new Map();
  if (matches.length) {
    p = S.targeted;
    const keep = matches.filter((x) => x.score >= 0.5 * matches[0].score);
    const tot = keep.reduce((a, x) => a + x.score, 0);
    for (const x of keep) w.set(x.segmentId, (w.get(x.segmentId) ?? 0) + p * (x.score / tot));
  } else if (!broad) o = Math.min(0.9, o + 0.3); // a specific audience that is not in this market
  const rest = 1 - p;
  for (const s of t.segments) w.set(s.id, (w.get(s.id) ?? 0) + rest * (1 - o) * s.share);
  w.set('outsider', (w.get('outsider') ?? 0) + rest * o);
  const tot = [...w.values()].reduce((a, b) => a + b, 0) || 1;
  return { weights: [...w].map(([segmentId, x]) => ({ segmentId, w: x / tot })), matches, broad };
}
function pickSeg(state, weights) {
  let r = rng(state);
  for (const x of weights) { r -= x.w; if (r <= 0) return x.segmentId; }
  return weights.at(-1).segmentId;
}
/** How well the audience text targets the pain: used by the reader and stored on the experiment. */
export function audienceQuality(state, text) {
  const t = truthOf(state);
  const m = segmentMatch(state, text).filter((x) => x.score >= 0.2);
  if (!m.length) return { score: 0, ok: false };
  const keep = m.filter((x) => x.score >= 0.5 * m[0].score);
  const str = (id) => painStrength(t.segments.find((s) => s.id === id));
  const tot = keep.reduce((a, x) => a + x.score, 0);
  const weighted = keep.reduce((a, x) => a + x.score * str(x.segmentId), 0) / tot;
  const maxStrength = Math.max(...t.segments.map(painStrength));
  const bestHit = keep.some((x) => x.segmentId === t.bestSegmentId);
  return { score: m[0].score, ok: m[0].score >= 0.35 && (bestHit || weighted >= 0.35 * maxStrength), bestHit };
}

// ---------------------------------------------------------------------------------------------------------------
// Smoke test / fake door
// ---------------------------------------------------------------------------------------------------------------

const BUZZ = ['revolutioniz', 'seamless', 'all-in-one', 'next-gen', 'cutting-edge', 'unlock', 'supercharge', 'game-chang', 'leverage', 'synerg', 'world-class', 'empower', 'ai-powered', 'effortless'];
/** 0..1 quality of the page copy: specific, outcome-led, speaks to the audience, no buzzwords. */
export function copyScore({ headline = '', offer = '', audience = '', price = 0, cta = 'email' }) {
  const h = headline.toLowerCase(), all = `${headline} ${offer}`.toLowerCase();
  const hw = headline.trim().split(/\s+/).filter(Boolean).length, ow = offer.trim().split(/\s+/).filter(Boolean).length;
  let s = 0.15;
  if (hw >= 4 && hw <= 14) s += 0.25;
  if (ow >= 12 && ow <= 70) s += 0.15;
  if (/\d/.test(all)) s += 0.1;
  if (/\b(stop|save|cut|no more|without|instead of|never|minutes|hours|per week|fewer|faster)\b/.test(all)) s += 0.2;
  const aw = audience.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  if (aw.some((w) => h.includes(w))) s += 0.15;
  if (cta === 'deposit' && price > 0) s += 0.1;
  s -= Math.min(0.3, BUZZ.filter((b) => all.includes(b)).length * 0.12);
  return clamp(s, 0.05, 1);
}

export function smokeCost(spec) {
  const S = srcParams(spec.source);
  const usd = spec.source === 'paid' ? Math.max(S.minBudget, Number(spec.budget) || 0) : 0;
  return { hours: MVP.smoke.pageHours + S.hours, usd };
}

export function runSmoke(state, spec) {
  const sl = mvpSlice(state);
  if (!(state.company.oneLiner ?? '').trim()) throw new Error('State your idea in Settings first: the test needs something to sell.');
  const source = MVP.smoke.sources[spec.source] ? spec.source : 'community';
  const S = MVP.smoke.sources[source];
  const cta = spec.cta === 'deposit' ? 'deposit' : 'email';
  const price = cta === 'deposit' ? Math.max(1, Number(spec.price) || MARKET[state.company.model]?.refPrice || 30) : 0;
  const audience = String(spec.audience ?? '');
  const headline = String(spec.headline ?? '').trim();
  if (!headline) throw new Error('Write the headline visitors will read first.');
  const hyp = normalizeHypothesis('smoke', spec.hypothesis);
  const { usd } = smokeCost({ source, budget: spec.budget });
  const copy = copyScore({ headline, offer: spec.offer, audience, price, cta });
  const cmult = 0.55 + 0.9 * copy;
  // Traffic
  let visits;
  if (source === 'network') visits = Math.round(S.visits[0] + rng(state) * (S.visits[1] - S.visits[0]));
  else if (source === 'community') visits = Math.round((S.visits[0] + rng(state) * (S.visits[1] - S.visits[0])) * (0.6 + 0.8 * copy) * Math.exp(0.6 * gaussian(state))); // heavy-tailed [design]
  else visits = Math.round((usd / (S.cpc[state.company.model] ?? 3)) * (0.75 + 0.5 * copy) * (0.9 + 0.2 * rng(state)));
  visits = clamp(visits, 0, MVP.smoke.maxVisits);
  if (usd > 0) post(state, { amount: -usd, counterparty: 'Ad platform', description: 'Smoke test traffic', category: 'advertising', method: 'card' });
  const exp = {
    id: uid('exp'), type: 'smoke', name: spec.name?.trim() || `Smoke test: ${headline.slice(0, 40)}`, startDay: state.day, endDay: state.day + MVP.smoke.days, status: 'running',
    audience, hypothesis: hyp, noCriteria: false, calledAs: null, order: sl.experiments.length, aud: audienceQuality(state, audience),
    inputs: { headline, offer: String(spec.offer ?? ''), source, budget: usd, cta, price, copy: round2(copy) }, hidden: {}, results: null,
  };
  if (!hyp) noCriteria(state, exp);
  // Sample every visitor from the truth through who this channel reaches.
  const mix = audienceMix(state, audience, source).weights;
  let signups = 0, paid = 0, politeSignups = 0, painSignups = 0, paidReal = 0;
  const payBase = S.base * S.pay;
  for (let i = 0; i < visits; i++) {
    const segmentId = pickSeg(state, mix);
    const channel = source === 'network' ? (rng(state) < MVP.smoke.friendShareOfNetwork ? 'friends' : 'warm') : source === 'community' ? 'community' : 'cold';
    const per = drawPerson(state, { segmentId, channel, seedKey: `${exp.id}:v${i}` });
    const pain = per.hasPain ? 0.7 + 1.1 * per.painIntensity : 0.3;
    const kind = per.relationship === 'friend' || per.relationship === 'warm';
    const polite = S.politeness && kind ? per.politeness * S.politeness : 0;
    let pSign = clamp(S.base * cmult * pain + polite, 0, 0.95);
    if (cta === 'deposit') pSign *= MVP.smoke.depositEmailDrag;
    let pPay = 0;
    if (cta === 'deposit' && per.isBuyer && per.hasPain) {
      const ratio = clamp(per.wtpTrue / price, 0, 1.5);
      pPay = clamp(payBase * cmult * (0.5 + per.painIntensity) * ratio * ratio * (per.budgetAuthority ? 1 : 0.5), 0, 0.5);
    }
    if (rng(state) < pPay) { paid++; paidReal++; }
    else if (rng(state) < pSign) { signups++; if (!per.hasPain) politeSignups++; else painSignups++; }
  }
  exp.hidden = { politeSignups, painSignups, paidReal };
  exp.sealed = { visits, signups, paid: cta === 'deposit' ? paid : null };
  sl.experiments.push(exp);
  return exp;
}

function settleSmoke(state, exp) {
  const r = exp.sealed; exp.sealed = null;
  const caveats = [];
  const tiny = r.visits < MVP.tinyN.smoke;
  if (tiny) caveats.push(`Only ${r.visits} visits: the ranges are wide. Treat this as a direction, not a result.`);
  if (exp.inputs.source === 'network') caveats.push('Your network is polite: friends and warm contacts sign up to be kind and most are not your market. Their signups are inflated; their payments are not.');
  if (exp.inputs.cta === 'email') caveats.push('An email signup costs nothing and is not payment intent. The next test should put a price and a deposit or pre-order button in front of the same audience.');
  else caveats.push('Paid-intent clicks are a fake door: nobody was charged. They beat email signups as evidence, but a real pre-sale (Sales, pre-sell) beats them.');
  if (exp.inputs.source === 'paid') caveats.push('Paid traffic shows whether strangers respond to the message, not whether they would stay.');
  if (!exp.aud.ok) caveats.push('Your audience description is broad or off the segment with the sharpest pain: a low rate can mean a diluted audience rather than a weak idea.');
  exp.results = { visits: r.visits, signups: r.signups, paid: r.paid, signupRate: wilson(r.signups, r.visits), paidRate: r.paid == null ? null : wilson(r.paid, r.visits), caveats };
  exp.owesApology = exp.inputs.cta === 'deposit' && (r.paid ?? 0) > 0;
  exp.n = r.visits;
}

/** Tell the people who clicked pay that it was a test (fake-door ethics). */
export function sendApology(state, id) {
  const exp = expById(state, id);
  if (!exp || !exp.owesApology) throw new Error('Nobody needs an apology for this experiment.');
  if (exp.status === 'running') throw new Error('Wait until the test has finished.');
  exp.apologized = true; exp.owesApology = false; exp.apologyDay = state.day;
  return { hours: MVP.smoke.apologyHours };
}

// ---------------------------------------------------------------------------------------------------------------
// Concierge and Wizard of Oz
// ---------------------------------------------------------------------------------------------------------------

const wkHours = (spec, n) => n * (Number(spec.hoursPerCustomer) || 1);
export function cohortCost(spec) {
  const C = MVP.cohort;
  const n = clamp(Math.round(Number(spec.n) || 5), C.minCustomers, C.maxCustomers);
  const per = C.recruitHoursPerAsk[spec.recruit] ?? 0.18;
  const ui = spec.type === 'wizard' ? clamp(Number(spec.uiHours) || C.wizardUiHours[0], C.wizardUiHours[0], C.wizardUiHours[1]) : 0;
  return { hours: round2(n * per * 3 + ui), uiHours: ui, weeklyHours: round2(wkHours(spec, n)), n };
}

export function startCohort(state, spec) {
  const C = MVP.cohort, sl = mvpSlice(state);
  const type = spec.type === 'wizard' ? 'wizard' : 'concierge';
  const cost = cohortCost({ ...spec, type });
  if (cost.weeklyHours > C.maxWeeklyHours) throw new Error(`${cost.weeklyHours}h a week is more than a founder can deliver by hand. Fewer customers or fewer hours each: concierge does not scale, that is the point.`);
  const recruit = ['network', 'outreach', 'community'].includes(spec.recruit) ? spec.recruit : 'network';
  const hyp = normalizeHypothesis(type, spec.hypothesis);
  const audience = String(spec.audience ?? '');
  const exp = {
    id: uid('exp'), type, name: spec.name?.trim() || `${TYPE_LABEL[type]}: ${audience.slice(0, 30) || 'first customers'}`, startDay: state.day, endDay: null, status: 'running',
    audience, hypothesis: hyp, noCriteria: false, calledAs: null, order: sl.experiments.length, aud: audienceQuality(state, audience),
    inputs: { recruit, n: cost.n, hoursPerCustomer: Number(spec.hoursPerCustomer) || 1, price: Math.max(0, Number(spec.price) || 0), uiHours: cost.uiHours, backend: type === 'wizard' ? clamp(Number(spec.hoursPerCustomer) || 0.5, C.wizardBackendHours[0], C.wizardBackendHours[1]) : null },
    hidden: {}, results: null, weeks: [], cohort: { members: [], asked: 0 },
  };
  if (!hyp) noCriteria(state, exp);
  const mix = audienceMix(state, audience, recruit).weights;
  const members = exp.cohort.members;
  for (let a = 0; a < cost.n * C.attempts && members.length < cost.n; a++) {
    const segmentId = pickSeg(state, mix);
    const channel = recruit === 'network' ? (rng(state) < MVP.smoke.friendShareOfNetwork ? 'friends' : 'warm') : recruit === 'community' ? 'community' : 'cold';
    const per = drawPerson(state, { segmentId, channel, seedKey: `${exp.id}:c${a}` });
    exp.cohort.asked++;
    const kind = per.relationship === 'friend' || per.relationship === 'warm';
    const pYes = per.hasPain ? 0.65 : 0.12 + (kind ? per.politeness * 0.5 : 0);
    if (rng(state) < pYes) members.push({ id: uid('cm'), person: per, active: true, activated: null, paid: null, counter: null, leftWeek: null });
  }
  sl.experiments.push(exp);
  return exp;
}

export const activeMembers = (exp) => exp.cohort.members.filter((m) => m.active);
export function weekCost(exp) {
  const per = exp.type === 'wizard' ? exp.inputs.backend : exp.inputs.hoursPerCustomer;
  return round2(activeMembers(exp).length * per);
}

/** Deliver one week to every active customer; returns the week's summary. */
export function deliverWeek(state, id) {
  const exp = expById(state, id);
  const C = MVP.cohort;
  if (!exp || !['concierge', 'wizard'].includes(exp.type) || exp.status !== 'running') throw new Error('That experiment is not running.');
  if (!activeMembers(exp).length) throw new Error('Nobody is left active. Finish the experiment and read what happened.');
  const truth = truthOf(state);
  const wk = exp.weeks.length + 1;
  const wizard = exp.type === 'wizard';
  const uiq = wizard ? 0.75 + 0.35 * clamp((exp.inputs.uiHours - C.wizardUiHours[0]) / (C.wizardUiHours[1] - C.wizardUiHours[0]), 0, 1) : 1;
  const per = wizard ? exp.inputs.backend : exp.inputs.hoursPerCustomer;
  let left = 0;
  for (const m of activeMembers(exp)) {
    const p = m.person;
    const seg = truth.segments.find((s) => s.id === p.segmentId);
    if (wizard && wk === 1) {
      m.activated = rng(state) < (p.hasPain ? 0.45 + 0.4 * p.painIntensity : 0.1) * uiq;
    }
    let h = p.hasPain ? 0.03 + 0.1 * (1 - p.painIntensity) : 0.3;
    h /= Math.max(0.5, seg?.retentionMult ?? 0.8);
    if (wizard && m.activated === false) h = Math.max(h, 0.5);
    if (!wizard) {
      h *= C.charm; // the founder's own presence keeps people around: it does not scale
      h *= per < 1 ? 1.3 : per >= 2 ? 0.85 : 1;
    } else h *= 0.95;
    if (wk <= 3 && (p.relationship === 'friend' || p.relationship === 'warm')) h *= 1 - p.politeness * 0.6; // being polite early
    if (rng(state) < clamp(h, 0, 0.95)) { m.active = false; m.leftWeek = wk; }
    else left++;
  }
  // Ask for money once they have used it a few weeks.
  if (wk === C.askWeek && exp.inputs.price > 0) {
    for (const m of activeMembers(exp)) {
      const p = m.person;
      exp.cohort.asked_pay = (exp.cohort.asked_pay ?? 0) + 1;
      const ratio = p.wtpTrue / exp.inputs.price;
      const pPay = p.hasPain && p.isBuyer ? (ratio >= 0.85 ? 0.85 : ratio >= 0.6 ? 0.15 : 0) : 0;
      m.paid = rng(state) < pPay;
      if (p.hasPain) m.counter = round2(p.wtpTrue * (0.85 + 0.3 * rng(state)));
    }
  }
  if (wk === C.askWeek && exp.inputs.price === 0) for (const m of activeMembers(exp)) if (m.person.hasPain) m.counter = round2(m.person.wtpTrue * (0.85 + 0.3 * rng(state)));
  exp.weeks.push({ week: wk, day: state.day, active: left, hours: weekCost(exp) });
  if (wk > C.tooLongWeeks) tooLong(state, exp, wk);
  return exp.weeks.at(-1);
}

function tooLong(state, exp, wk) {
  if (exp.status !== 'running') return;
  mistake(state, {
    id: 'stayed_concierge_too_long', label: `Still doing it by hand after ${wk} weeks`, cost: { hours: MVP.cohort.tooLongHours, days: MVP.cohort.tooLongDays }, circles: true, delayed: true, charge: true,
    detail: `"${exp.name}" kept running manually past ${MVP.cohort.tooLongWeeks} weeks. It taught you what it could in the first month; after that the hours buy comfort, not learning, and nothing you build waits on a decision.`, key: `cclong:${exp.id}`,
  });
}

export function cohortResults(exp) {
  const C = MVP.cohort;
  const members = exp.cohort.members, wk = exp.weeks.length;
  const n = members.length;
  const out = { n, weeks: wk, asked: exp.cohort.asked, retention: null, payRate: null, activation: null, wtp: null, caveats: [] };
  if (wk >= 3) out.retention = wilson(activeMembers(exp).length, n);
  if (exp.type === 'wizard' && wk >= 1) out.activation = wilson(members.filter((m) => m.activated).length, n);
  if (wk >= C.askWeek && exp.inputs.price > 0) {
    const elig = members.filter((m) => m.paid != null);
    out.payRate = wilson(elig.filter((m) => m.paid).length, elig.length);
  }
  if (wk >= C.askWeek) {
    const cs = members.filter((m) => m.counter != null && m.active).map((m) => m.counter);
    if (cs.length) out.wtp = { median: round2(quantile(cs, 0.5)), p25: round2(quantile(cs, 0.25)), p75: round2(quantile(cs, 0.75)), n: cs.length };
  }
  const c = out.caveats;
  if (n < MVP.tinyN[exp.type]) c.push(`Only ${n} customers: one or two people moving changes every percentage. Treat as a direction.`);
  if (n < exp.inputs.n) c.push(`You asked ${exp.cohort.asked} people and only ${n} said yes: a thin yes-rate is itself a signal about the audience or the offer.`);
  if (exp.type === 'concierge') c.push('Concierge retention is flattered: you are the product, and people stay for you. It does not scale and real-product retention will be lower.');
  if (exp.inputs.recruit === 'network') c.push('Customers from your network are polite and often not your market; weight what they paid over what they said.');
  if (exp.inputs.price === 0) c.push('A free pilot says nothing about willingness to pay. Charge from the third week, even a small amount.');
  if (wk < 3) c.push('Fewer than three weeks: retention and the price test are not available yet.');
  if (exp.type === 'wizard') c.push('Wizard of Oz measures activation and use of the interface; the manual backend hides cost, speed and accuracy problems the real product will have.');
  return out;
}

export function finishCohort(state, id, { graduateTo = 'stop' } = {}) {
  const exp = expById(state, id);
  if (!exp || exp.status !== 'running' || !exp.cohort) throw new Error('That experiment is not running.');
  if (exp.weeks.length < 1) throw new Error('Deliver at least one week first.');
  exp.status = 'done'; exp.endDay = state.day; exp.graduated = graduateTo;
  exp.results = cohortResults(exp);
  exp.n = exp.results.n;
  return exp;
}

// ---------------------------------------------------------------------------------------------------------------
// Design partners
// ---------------------------------------------------------------------------------------------------------------

const REAL_INTERVIEW = (iv) => iv.real && iv.status === 'done';
export const realInterviews = (state) => (researchSlice(state).interviews ?? []).filter(REAL_INTERVIEW).length;

/** People you could ask: CRM contacts and real interviewees (their hidden facts are drawn only when they join). */
export function partnerCandidates(state) {
  const out = [], seen = new Set();
  for (const c of ensureCrm(state).contacts) {
    const co = companyOf(state, c);
    if (c.status === 'customer') continue;
    out.push({ ref: `crm:${c.id}`, name: contactName(c), company: co?.name ?? '', kind: 'crm', text: `${c.title ?? ''} ${co?.industry ?? ''} ${co?.name ?? ''} ${co?.notes ?? ''}`, relationship: c.warm ? 'warm' : 'stranger' });
    seen.add(contactName(c));
  }
  for (const iv of researchSlice(state).interviews ?? []) {
    if (!REAL_INTERVIEW(iv) || seen.has(iv.persona?.name)) continue;
    out.push({ ref: `iv:${iv.id}`, name: iv.persona?.name ?? 'Interviewee', company: iv.persona?.company ?? '', kind: 'research', text: `${iv.persona?.role ?? ''} ${iv.persona?.company ?? ''}`, relationship: 'warm' });
  }
  return out;
}
/** A made-up but reproducible candidate of a given kind: a friend, or someone outside your market. */
export function syntheticCandidate(state, kind) {
  const n = (mvpSlice(state).synth = (mvpSlice(state).synth ?? 0) + 1);
  return kind === 'friend'
    ? { ref: `friend:${n}`, name: `Friend ${n}`, company: '', kind: 'friend', text: '', relationship: 'friend' }
    : { ref: `outsider:${n}`, name: `Contact ${n} (another industry)`, company: '', kind: 'outsider', text: '', relationship: 'warm' };
}

export function startPartners(state, spec) {
  const P = MVP.partners, sl = mvpSlice(state);
  const cands = spec.candidates ?? [];
  if (cands.length < P.min || cands.length > P.max) throw new Error(`Recruit between ${P.min} and ${P.max} design partners.`);
  const hyp = normalizeHypothesis('design_partners', spec.hypothesis);
  const audience = String(spec.audience ?? '');
  const exp = {
    id: uid('exp'), type: 'design_partners', name: spec.name?.trim() || 'Design partner program', startDay: state.day, endDay: null, status: 'running', audience,
    hypothesis: hyp, noCriteria: false, calledAs: null, order: sl.experiments.length, aud: audienceQuality(state, audience),
    inputs: { price: Math.max(0, Number(spec.price) || 0), asked: cands.length }, hidden: {}, results: null,
    partners: [], declined: [], sessions: 0, feedback: [], eventIds: [],
  };
  if (!hyp) noCriteria(state, exp);
  const mix = audienceMix(state, audience, 'paid').weights;
  for (const c of cands) {
    let segmentId;
    if (c.kind === 'outsider') segmentId = 'outsider';
    else if (c.kind === 'friend') segmentId = pickSeg(state, audienceMix(state, audience, 'network').weights);
    else { const m = segmentMatch(state, c.text).filter((x) => x.score >= 0.2); segmentId = m.length ? m[0].segmentId : pickSeg(state, mix); }
    const channel = c.kind === 'friend' ? 'friends' : c.relationship === 'warm' ? 'warm' : 'cold';
    const per = drawPerson(state, { segmentId, channel, seedKey: `${exp.id}:${c.ref}`, ...(c.kind === 'friend' ? { relationship: 'friend' } : {}) });
    const kind = per.relationship === 'friend' || per.relationship === 'warm';
    const yes = rng(state) < (per.hasPain ? 0.8 : kind ? per.politeness * 0.7 : 0.05);
    const entry = { id: uid('dp'), ref: c.ref, name: c.name, company: c.company, kind: c.kind, person: per, active: true, paid: null, attended: 0 };
    (yes ? exp.partners : exp.declined).push(entry);
  }
  sl.experiments.push(exp);
  return exp;
}
export const partnerRecruitCost = (n) => round2(n * 0.4);

function feedbackFor(state, exp, p) {
  const per = p.person;
  const items = [];
  const push = (o) => { const it = { id: uid('fb'), partnerId: p.id, day: state.day, ...o }; exp.feedback.push(it); items.push(it); };
  if (per.hasPain) {
    for (const j of per.jobsRanked.filter((x) => !x.decoy).slice(0, 2)) push({ kind: 'job', jobId: j.id, text: `"${j.label}" is where my week goes. ${per.workaround ? `Right now I ${per.workaround}.` : ''}`, idio: false });
  } else {
    const lead = per.jobsRanked[0];
    if (lead?.decoy) push({ kind: 'job', jobId: lead.id, text: `It would be nice to have: ${lead.label}.`, idio: false, decoy: true });
    push({ kind: 'compliment', text: 'Love the direction. I can see a lot of people needing this.', idio: false });
  }
  if (per.idiosyncraticAsk && rng(state) < 0.55) push({ kind: 'ask', text: per.idiosyncraticAsk, idio: true });
  return items;
}

function attend(state, exp, p) {
  const per = p.person;
  const kind = per.relationship === 'friend' || per.relationship === 'warm';
  const ok = rng(state) < (per.hasPain ? 0.9 : kind ? 0.5 + per.politeness * 0.3 : 0.3);
  p.sessions = (p.sessions ?? 0) + 1;
  if (ok) { p.attended++; feedbackFor(state, exp, p); }
  return ok;
}

export const sessionCost = (exp) => round2(exp.partners.filter((p) => p.active).length * MVP.partners.sessionHours);
/** Hold one weekly session round with every active partner (manual alternative to calendar meetings). */
export function holdSession(state, id) {
  const exp = expById(state, id);
  if (!exp || exp.type !== 'design_partners' || exp.status !== 'running') throw new Error('That program is not running.');
  exp.sessions++;
  let attended = 0;
  for (const p of exp.partners.filter((x) => x.active)) if (attend(state, exp, p)) attended++;
  return { attended, of: exp.partners.length };
}

/** Book next week's sessions on the calendar (one per partner); the calendar charges the meetings. */
export function scheduleSessions(state, id) {
  const exp = expById(state, id);
  if (!exp || exp.type !== 'design_partners' || exp.status !== 'running') throw new Error('That program is not running.');
  const act = exp.partners.filter((p) => p.active);
  const slots = findSlots(state, { fromDay: state.day + 1, duration: MVP.partners.sessionMinutes, count: act.length });
  if (slots.length < act.length) throw new Error('Not enough free 45-minute slots in the next month. Clear some calendar time.');
  act.forEach((p, i) => {
    const ev = scheduleEvent(state, { title: `Design partner session: ${p.name}`, kind: 'meeting', app: 'mvp', refId: exp.id, with: p.name, day: slots[i].day, start: slots[i].start, duration: MVP.partners.sessionMinutes });
    exp.eventIds.push({ eventId: ev.id, partnerId: p.id });
  });
  return act.length;
}

/** Build a partner's request. A single partner's ask that nobody else shares is overfitting. */
export function adoptRequest(state, id, feedbackId) {
  const exp = expById(state, id), sl = mvpSlice(state);
  const fb = exp?.feedback.find((f) => f.id === feedbackId);
  if (!fb) throw new Error('Unknown request.');
  if (fb.kind === 'compliment') throw new Error('A compliment is not a request.');
  const partner = exp.partners.find((p) => p.id === fb.partnerId);
  const supporters = new Set(exp.feedback.filter((f) => f.kind === 'job' && fb.kind === 'job' && f.jobId === fb.jobId).map((f) => f.partnerId)).size;
  const fv = featureValue(state, { title: fb.text, problem: fb.text, requestedBy: fb.partnerId, custom: fb.kind === 'ask' });
  const overfit = fb.kind === 'ask' || supporters < 2 || fv.idiosyncratic;
  const f = Object.assign(newFeature(state), { title: fb.text.replace(/^"|"$/g, '').slice(0, 80), problem: fb.text, requestedBy: fb.partnerId, status: 'draft' });
  productSlice(state).features.push(f);
  sl.adoptions.push({ expId: exp.id, partnerId: fb.partnerId, feedbackId, day: state.day, overfit });
  fb.adopted = true;
  if (overfit) {
    mistake(state, {
      id: 'overfit_to_design_partner', label: `Built ${partner?.name ?? 'one partner'}'s request for everyone`, cost: { hours: MVP.partners.overfitHours, days: MVP.partners.overfitDays }, delayed: true, circles: true, charge: true,
      detail: `You queued "${f.title}" because one design partner asked. Fewer than two partners share it and it matches no job of the segment, so it is worth little to the rest of your market: you built a custom project for one account.`, key: `overfit:${feedbackId}`,
    });
  }
  return { feature: f, overfit };
}

export function convertPartners(state, id, { price = null } = {}) {
  const exp = expById(state, id);
  if (!exp || exp.type !== 'design_partners' || exp.status !== 'running') throw new Error('That program is not running.');
  if (exp.sessions < 1) throw new Error('Hold at least one session before asking for money.');
  const px = Math.max(1, Number(price ?? exp.inputs.price) || 0);
  exp.inputs.price = px;
  let verbal = 0, paid = 0;
  for (const p of exp.partners) {
    const per = p.person;
    const ratio = per.wtpTrue / px;
    const pPay = per.hasPain && per.isBuyer ? (ratio >= 0.85 ? 0.8 : ratio >= 0.6 ? 0.15 : 0) : 0;
    p.paid = rng(state) < pPay;
    if (p.paid) paid++;
    const kind = per.relationship === 'friend' || per.relationship === 'warm';
    if (p.paid || (kind && rng(state) < per.politeness * 0.8) || (per.hasPain && rng(state) < 0.6)) verbal++;
  }
  exp.status = 'done'; exp.endDay = state.day; exp.n = exp.partners.length;
  const n = exp.partners.length, att = exp.partners.reduce((a, p) => a + p.attended, 0), possible = exp.partners.length * Math.max(1, exp.sessions);
  const c = [];
  if (n < MVP.tinyN.design_partners) c.push(`Only ${n} partners: a single yes or no moves the rate by ${Math.round(100 / Math.max(1, n))} points.`);
  if (exp.partners.some((p) => p.kind === 'friend')) c.push('Friends join to help you and say yes to be kind. Their enthusiasm is not evidence.');
  if (exp.partners.some((p) => p.kind === 'outsider')) c.push('Contacts outside your market give opinions, not pain. Discount their feedback.');
  c.push(`${verbal} of ${n} said they would buy; ${paid} paid. Only the payments count.`);
  c.push('Partners shape what you build: a request only one of them makes is a custom project, not a feature.');
  exp.results = { n, paid, verbal, payRate: wilson(paid, n), attendRate: wilson(att, possible), sessions: exp.sessions, caveats: c };
  return exp.results;
}

// ---------------------------------------------------------------------------------------------------------------
// Verdicts, the learning log and calling it
// ---------------------------------------------------------------------------------------------------------------

export function metricOf(exp, metric = exp.hypothesis?.metric) {
  const r = exp.results;
  if (!r || !metric) return null;
  return r[metric] ?? null;
}
/** pass when the whole range clears the threshold, fail when the whole range misses it, else inconclusive. */
export function verdictOf(exp) {
  if (!exp.hypothesis) return 'unjudged';
  const w = metricOf(exp);
  if (!w || w.rate == null || !w.n) return 'inconclusive';
  if (w.lo >= exp.hypothesis.threshold) return 'pass';
  if (w.hi < exp.hypothesis.threshold) return 'fail';
  return 'inconclusive';
}

const STELLAR_HINT = {
  smoke: 'A stellar operator tests the cheapest thing first, writes the threshold before the page goes live, reaches the pain segment directly, and reads the deposit clicks, not the email list.',
  concierge: 'A stellar operator keeps it to a month, charges from week three, and reads payments and week-4 retention instead of how nice the sessions felt.',
  wizard: 'A stellar operator builds the thinnest UI that can show activation, charges, and moves on once the manual backend has answered the question.',
  design_partners: 'A stellar operator picks partners from the segment with the sharpest pain, builds only what two or more of them share, and converts them to paid at the end.',
};

function evidenceQuality(exp) {
  const r = exp.results;
  if (exp.type === 'smoke') return exp.inputs.cta === 'deposit' && exp.n >= MVP.tinyN.smoke ? 'medium' : 'low';
  if (exp.type === 'design_partners') return r.paid > 0 && exp.n >= MVP.tinyN.design_partners && !exp.partners.some((p) => p.kind !== 'crm' && p.kind !== 'research') ? 'high' : r.paid > 0 ? 'medium' : 'low';
  return exp.inputs.price > 0 && r.weeks >= 4 && r.n >= MVP.tinyN[exp.type] && exp.inputs.recruit !== 'network' ? 'high' : r.weeks >= 3 && exp.inputs.price > 0 ? 'medium' : 'low';
}
function headline(exp) {
  const r = exp.results;
  if (exp.type === 'smoke') return `${r.visits} visits: ${r.signups} email signups ${fmtRange(r.signupRate)}${r.paid != null ? `; ${r.paid} paid-intent clicks ${fmtRange(r.paidRate)}` : ''}.`;
  if (exp.type === 'design_partners') return `${r.n} partners, ${r.sessions} session round(s): ${r.verbal} said yes, ${r.paid} paid ${fmtRange(r.payRate)}.`;
  return `${r.n} customers over ${r.weeks} week(s): ${r.retention ? `retention ${fmtRange(r.retention)}` : 'retention not measurable yet'}${r.payRate ? `; paid ${fmtRange(r.payRate)}` : ''}${r.wtp ? `; revealed willingness to pay about $${r.wtp.median}/mo ($${r.wtp.p25}-$${r.wtp.p75})` : ''}.`;
}

export function logLearning(state, exp) {
  const sl = mvpSlice(state);
  const old = sl.learning.find((l) => l.expId === exp.id);
  const entry = { id: old?.id ?? uid('lrn'), day: state.day, expId: exp.id, type: exp.type, name: exp.name, text: headline(exp), n: exp.n, quality: evidenceQuality(exp), verdict: verdictOf(exp), called: exp.calledAs, caveats: exp.results.caveats, stellar: STELLAR_HINT[exp.type] };
  if (old) Object.assign(old, entry); else sl.learning.unshift(entry);
  return entry;
}

/** The founder's decision on a finished experiment: go (build on it), kill, or iterate (change and re-test). */
export function callVerdict(state, id, decision) {
  const exp = expById(state, id), sl = mvpSlice(state);
  if (!exp || exp.status !== 'done') throw new Error('Finish the experiment before calling it.');
  if (!['go', 'kill', 'iterate'].includes(decision)) throw new Error('Choose go, kill or iterate.');
  const v = verdictOf(exp);
  exp.calledAs = decision; exp.status = 'called';
  const definitive = decision !== 'iterate';
  if (definitive && exp.n < MVP.tinyN[exp.type]) {
    mistake(state, {
      id: 'called_on_tiny_n', label: `Called "${decision}" on ${exp.n} ${exp.type === 'smoke' ? 'visits' : 'people'}`, cost: { hours: 3, days: 7 }, delayed: true, circles: true, charge: true,
      detail: `"${exp.name}" had ${exp.n} ${exp.type === 'smoke' ? 'visits' : 'people'} (under ${MVP.tinyN[exp.type]}), so the range was too wide to separate a good idea from luck. Acting on it costs a wrong build or a good idea killed; you will run more tests anyway.`, key: `tiny:${exp.id}`,
    });
  }
  if (decision === 'go' && v === 'fail') {
    mistake(state, {
      id: 'ignored_failed_test', label: 'Went ahead after your own test failed', cost: { hours: 6, days: 14 }, delayed: true, circles: true, charge: true,
      detail: `"${exp.name}" missed the threshold you set (${pct(exp.hypothesis.threshold, 0)}), and you went ahead anyway. A threshold you will not honour was decoration.`, key: `ignfail:${exp.id}`,
    });
  }
  if (decision === 'go' && exp.type === 'smoke' && exp.inputs.cta === 'email' && !hasPaymentEvidence(state, exp)) {
    mistake(state, {
      id: 'email_signup_as_demand', label: 'Took email signups as demand', cost: { hours: 6, usd: 0, days: 14 }, delayed: true, charge: true,
      detail: `You went ahead on an email list${exp.inputs.source === 'network' ? ' mostly from your own network' : ''}. Signing up is free and polite; nobody has yet been asked for money. Expect the launch to convert a fraction of the list.`, key: `emaildemand:${exp.id}`,
    });
  }
  logLearning(state, exp);
  return exp;
}
function hasPaymentEvidence(state, except) {
  return mvpSlice(state).experiments.some((e) => e !== except && e.results && ((e.results.paid ?? 0) > 0 || (e.results.payRate?.k ?? 0) > 0)) || presellCommitments(state) > 0;
}

/** Commitments from Sales pre-sell (deposits, pre-orders, LOIs) counted as evidence, not duplicated here. */
export function presellCommitments(state) {
  return (state.apps?.crm?.presell?.asks ?? []).filter(isCommitment).length;
}

export function abandonExperiment(state, id) {
  const exp = expById(state, id);
  if (!exp || exp.status !== 'running') throw new Error('That experiment is not running.');
  exp.status = 'abandoned';
  return exp;
}

// ---------------------------------------------------------------------------------------------------------------
// Build hours before validation
// ---------------------------------------------------------------------------------------------------------------

export function buildHours(state) {
  const p = state.apps?.product;
  if (!p) return 0;
  return (p.features ?? []).filter((f) => f.status !== 'draft' && f.status !== 'killed').reduce((a, f) => a + (f.progressHours ?? 0), 0) + (p.foundation?.progressHours ?? 0);
}
export function hasAnyValidation(state) {
  return mvpSlice(state).experiments.length > 0 || realInterviews(state) > 0 || (state.apps?.crm?.presell?.asks?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Daily simulation
// ---------------------------------------------------------------------------------------------------------------

export function mvpDay(state) {
  const sl = mvpSlice(state);
  for (const exp of sl.experiments) {
    if (exp.type === 'smoke' && exp.status === 'running' && state.day >= exp.endDay) {
      settleSmoke(state, exp);
      exp.status = 'done';
      logLearning(state, exp);
    }
    if (exp.type === 'smoke' && exp.owesApology && state.day >= exp.endDay + MVP.smoke.apologyDays) {
      exp.owesApology = false; exp.apologized = false;
      sl.reputation = Math.max(0, sl.reputation - MVP.smoke.apologyRep);
      mistake(state, {
        id: 'fake_door_no_apology', label: 'Clicked "pay" on a fake door and never heard back', cost: { reputation: 0.5, hours: 0.5 }, delayed: true,
        detail: `${exp.results.paid} people clicked to pay on "${exp.name}" and got no word that it was a test. Some said so in the community you posted in; your name is attached to it.`, key: `fakedoor:${exp.id}`,
      });
    }
    if ((exp.type === 'concierge' || exp.type === 'wizard') && exp.status === 'running' && state.day - exp.startDay >= 7 * (MVP.cohort.tooLongWeeks + 3)) tooLong(state, exp, Math.round((state.day - exp.startDay) / 7));
    if (exp.type === 'design_partners' && exp.status === 'running') {
      for (const rec of exp.eventIds) {
        if (rec.done) continue;
        const ev = ensureCalendar(state).events.find((e) => e.id === rec.eventId);
        if (!ev) { rec.done = true; continue; }
        if (ev.status === 'canceled') { rec.done = true; continue; }
        if (ev.day <= state.day && ev.status === 'scheduled') {
          rec.done = true;
          completeEvent(state, ev.id, 'done', 'design partner session');
          const p = exp.partners.find((x) => x.id === rec.partnerId);
          if (p?.active) { attend(state, exp, p); exp.sessions = Math.max(exp.sessions, Math.max(...exp.partners.map((q) => q.sessions ?? 0))); }
        }
      }
    }
  }
  // Overbuilt before any validation.
  if (buildHours(state) >= MVP.overbuilt.agentHours && !hasAnyValidation(state)) {
    mistake(state, {
      id: 'overbuilt_before_validation', label: 'Built before testing anything', cost: { hours: 10, days: 14 }, delayed: true,
      detail: `${Math.round(buildHours(state))} build hours went into the product before a single experiment, real interview or pre-sale ask. AI agents make it fast to build the wrong thing; a smoke test costs a day.`, key: 'overbuilt_before_validation',
    });
  }
}
