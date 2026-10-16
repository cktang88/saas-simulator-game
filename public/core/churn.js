// Why customers churn, what warns you first, and what saves them (ARCHITECTURE principle 7).
//
// The LEVEL of voluntary churn stays the calibrated hazard in core/market.js churnBeforeRenewal (curve x fit x
// price x the named modifiers apps set). This module never adds a second copy of those effects. It adds:
//  1. A true REASON for every cancellation, drawn from the customer's segment mix (public/data/churn-reasons.js;
//     B2B: the CRM company's buyer segment, B2C: the company's app category) and re-weighted by what the player
//     did: poor onboarding / low fit -> never_activated & not_using, slow support -> poor_support, open bugs and
//     incidents -> bugs_reliability, price above WTP -> price_too_high, competitive pressure ->
//     switched_competitor, a departed champion -> champion_left. Closures, budget cuts, funding ends and
//     acquisitions stay segment base rates the player cannot move.
//  2. Timing: mean-preserving seasonal / fiscal-year-end shaping and a segment early-life shape, plus one new
//     player lever (an onboarding call that actually happened lowers early-life churn) [design].
//  3. Intent and leading signals: a renewal's fate is decided ahead of time (30 days for monthly plans, 120 for
//     annual) so SIGNALS can fire with their lead days. If the player improves things in between, the intent
//     fades in proportion (keep with p_now / p_then); if things get worse, the extra hazard is added at renewal.
//     Without saves the overall churn level equals the calibrated hazard.
//  4. Save tactics (SAVE_TACTICS) that work only on matching reasons, cost real hours and money, and log a
//     traceable mistake when they were wasted.
//  5. A Churnkey-style cancel flow (survey + pause / downgrade / discount offers) for self-serve customers with
//     reason-specific acceptance (CHURN_REASONS.saveable), and the over-discounting trap.
// Every [design] number below is a game estimate, not a statistic.

import { CHURN_REASONS, SEGMENT_CHURN, B2C_CHURN, SIGNALS, SAVE_TACTICS, CROSS, reasonMixFor, surveyAnswer, reasonForGameCancel } from '../data/churn-reasons.js';
import { segmentFor } from '../data/buyer-segments.js';
import { rng, chance, uid, clamp, round2, monthIndex } from './util.js';
import { churnBeforeRenewal, ensureMarket, priceFactor, mainPlan } from './market.js';
import { changePrice, monthlyAmount, customerById } from './stripe.js';
import { post } from './bank.js';
import { logMistake } from './operator.js';

// ---------------------------------------------------------------------------------------------
// Parameters ([design] unless noted)
// ---------------------------------------------------------------------------------------------
export const CHURN = {
  oversoldHazard: 1.5, // renewal hazard x(1 + 1.5 x sold-vs-delivered gap) [design]
  leadWindowDays: { month: 30, year: 120 }, // when the renewal's fate is decided (signals need lead time)
  noiseSignalsPerEval: { month: 0.07, year: 0.22 }, // false-positive signals on accounts that are NOT leaving [design]
  onboardingEarly: { held: 0.8, no_show: 1.2 }, // early-life (paid months 1-3) churn after a held / missed onboarding call [design]
  smbCurveEarlyRatio: 1.9, // MARKET.smb.monthlyChurn months 1-3 average vs mature month (0.057 / 0.03)
  seasonAmp: { month: 0.6, year: 0.5 }, // churn in a segment's peak months vs others (mean-preserving) [design]
  flow: {
    setupHours: 6, // build the cancel flow (survey + offers) once (SAVE_TACTICS.cancel_flow_offer: 6-10 h)
    acceptScale: 0.8, // CHURN_REASONS.saveable assumes the right offer; a self-serve page lands a bit lower [design]
    surveyResponse: 0.6, // share of cancellers who answer the in-flow survey (vs ~30% by email) [design]
    pauseDays: 60,
    resume: { seasonal_pause: 0.8, project_completed_no_renewal: 0.7, budget_cut: 0.6, funding_ended: 0.55, subscription_fatigue: 0.5, not_using: 0.45 }, // share who resume after a pause [design]
    resumeDefault: 0.45,
    downgradeCut: 0.4, // a downgrade cuts the bill ~40% [design]
    discountRelapse: 1.5, // churn hazard after a discount save expires (least durable save) [design]
    threatBase: 0.004, // monthly share of happy self-serve customers who "start to cancel" for a 25% discount once it is known [design]
    threatRampMonths: 6,
  },
  reengagement: { setupHours: 3, rate: SAVE_TACTICS.b2c_streak_reengagement.rate }, // B2C lapse push
  missedSignalMinLead: 14, // a signal at least this many days before churn that nobody acted on is a missed signal
  founderHourUsd: 75, // [design] value of a founder hour in the mistakes ledger
};

const ORDER_KEYS = ['pause', 'discount', 'downgrade'];
const live = (sub) => sub.status === 'active' || sub.status === 'past_due';

export function ensureChurn(state) {
  state.churn ??= {};
  const c = state.churn;
  c.signals ??= [];
  c.attempts ??= [];
  c.flow ??= { enabled: false, setup: false, survey: true, offers: { pause: true, downgrade: true, discount: false }, discountPct: 25, discountMonths: 3, sinceDay: null };
  c.flowStats ??= { started: 0, saved: 0, byOffer: { pause: 0, downgrade: 0, discount: 0 }, resumed: 0, pauseLost: 0, threatDiscounts: 0, marginGiven: 0 };
  c.reengagement ??= { enabled: false, saved: 0 };
  c.reasons ??= {}; // true reason id -> churned count
  c.saves ??= { attempts: 0, matched: 0, saved: 0, wasted: 0, usd: 0, hours: 0 };
  c.missed ??= 0;
  return c;
}

// ---------------------------------------------------------------------------------------------
// Segment / category of a subscription
// ---------------------------------------------------------------------------------------------
const B2C_KEYWORDS = [
  ['meditation_wellness', /meditat|sleep|mindful|wellness|calm\b|anxiety|stress|therap|mental health|breath/],
  ['dating_social', /dating|\bdates?\b|match(es|making)?\b|singles|social network|friends|meet people/],
  ['education_language', /learn|language|course|study|exam|tutor|lesson|spanish|french|vocab|flashcard|school/],
  ['finance', /budget|money|personal finance|expense|invest|saving|\btax|bank|spending|net worth/],
  ['health_fitness', /fitness|workout|gym|running|\brun\b|diet|nutrition|meal|calorie|health|yoga|weight|steps/],
  ['photo_video', /photo|video|edit(or|ing)|camera|film|reels?\b|image|selfie/],
  ['games_entertainment', /game|gaming|puzzle|play|entertain|stream|music|podcast|comic|trivia/],
  ['ai_tools', /\bai\b|gpt|chatbot|assistant|generat|\bllm|copilot|agent/],
  ['productivity', /todo|to-do|task|notes?\b|calendar|productiv|focus|habit|planner|journal|email|reminder/],
];
export const B2C_CATEGORY_IDS = Object.keys(B2C_CHURN);

/** Best-guess B2C category from free text (the one-liner and ICP); null when nothing matches. */
export function inferB2cCategory(text) {
  const t = ` ${String(text ?? '').toLowerCase()} `;
  let best = null;
  for (const [id, rx] of B2C_KEYWORDS) {
    const n = (t.match(new RegExp(rx.source, 'g')) ?? []).length;
    if (n > 0 && (!best || n > best.n)) best = { id, n };
  }
  return best?.id ?? null;
}

/** The company's B2C category: the player's setting, else inferred from the one-liner/ICP, else null (generic B2C mix). */
export function b2cCategoryOf(state) {
  const set = state.company?.b2cCategory;
  if (set && B2C_CHURN[set]) return set;
  // Inferred ONCE from the one-liner and then kept (re-wording the ICP must not silently change who churns).
  const oneLiner = state.company?.oneLiner ?? '';
  if (!oneLiner.trim()) return null;
  const guess = inferB2cCategory(oneLiner);
  if (guess && state.company) state.company.b2cCategory = guess;
  return guess;
}

function icpSegment(state) {
  const key = `${state.company.oneLiner ?? ''}|${state.company.icp ?? ''}|${state.company.model}`;
  const c = ensureChurn(state);
  if (c.icpKey !== key) {
    c.icpKey = key;
    const text = `${state.company.icp ?? ''} ${state.company.oneLiner ?? ''}`.trim();
    c.icpSegment = text ? segmentFor({ industry: text, model: state.company.model === 'ent' ? 'ent' : 'smb' }) : null;
  }
  return c.icpSegment;
}

/** { kind: 'b2b'|'b2c', id, data } for a subscription. data is the SEGMENT_CHURN / B2C_CHURN entry or null. */
export function churnSegment(state, sub) {
  if (state.company.model === 'b2c') {
    const id = b2cCategoryOf(state);
    return { kind: 'b2c', id, data: id ? B2C_CHURN[id] : null };
  }
  const cus = sub ? customerById(state, sub.customerId) : null;
  let id = null;
  if (cus?.crmCompanyId) {
    const co = (state.apps.crm?.companies ?? []).find((x) => x.id === cus.crmCompanyId);
    if (co) id = co.segmentId ?? (co.churnSegmentId ??= segmentFor({ industry: [co.industry, co.research?.industry].filter(Boolean).join(' '), name: co.name, model: state.company.model === 'ent' ? 'ent' : 'smb' }));
  }
  if (!id && cus && !cus.archived) { cus.meta ??= {}; id = cus.meta.segmentId ?? icpSegment(state); }
  if (!id) id = icpSegment(state);
  return { kind: 'b2b', id, data: id ? SEGMENT_CHURN[id] ?? null : null, crm: Boolean(cus?.crmCompanyId) };
}

// ---------------------------------------------------------------------------------------------
// What the player did -> which reasons get likelier (mix weights; average operator ~ 1)
// ---------------------------------------------------------------------------------------------
const modProd = (mods, test) => Object.entries(mods).filter(([k]) => test(k)).reduce((a, [, v]) => a * v, 1);

export function successAccount(state, sub) {
  return state.apps.success?.accounts?.[sub?.id] ?? null;
}

/** Per-reason multipliers on the segment mix, plus the evidence behind them. Pure read of state. */
export function reasonDrivers(state, sub) {
  const m = ensureMarket(state);
  const mods = m.modifiers.churn ?? {};
  const fit = m.fit.product.score ?? 0.3;
  const fitW = clamp(1 + 1.6 * (0.45 - fit), 0.45, 2.2); // unjudged 0.3 -> 1.24; 0.8 -> 0.44 floor
  const ob = m.onboarding ?? 'self';
  const obW = ({ self: 1.25, call: 0.9, concierge: 0.7 }[ob] ?? 1) * (sub?.onboarded === 'held' ? 0.55 : sub?.onboarded === 'no_show' ? 1.5 : 1);
  const support = Math.pow(modProd(mods, (k) => k === 'support-frt' || k === 'support-backlog') * (sub?.churnMult ?? 1), 2.5);
  const bugs = Math.pow(modProd(mods, (k) => ['product-bugs', 'incidents', 'breach', 'hosting-suspended'].includes(k)), 2.5);
  let pf = 1;
  try { pf = priceFactor(state, mainPlan(state)); } catch { pf = 1; }
  const priceMods = modProd(mods, (k) => k.startsWith('price-migration') || k === 'pricing-model');
  const price = clamp(Math.pow(1 / Math.max(0.1, pf), 0.9) * Math.pow(priceMods, 2.5), 0.4, 4);
  const acct = successAccount(state, sub);
  const comp = Math.pow(modProd(mods, (k) => k.startsWith('world:') || k.startsWith('commoditized-')), 2.5) * (acct?.renewal?.competitorOffer ? 1.8 : 1);
  const champ = !acct ? 1 : acct.champion === 'left' ? 4 : acct.champion === 'weak' ? 1.5 : acct.champion === 'none' ? 1.3 : (acct.contacts ?? 1) >= 2 ? 0.7 : 1;
  const missing = clamp(0.6 + 1.0 * (1 - fit) * 1.1, 0.5, 1.8);
  const w = {
    never_activated: clamp(fitW * obW, 0.25, 3.5),
    not_using: clamp(Math.sqrt(fitW * obW) * (acct ? (acct.usage != null ? clamp(1.6 - acct.usage, 0.6, 1.6) : 1) : 1), 0.4, 2.5),
    missing_feature: missing,
    outgrew_product: 1,
    poor_support: clamp(support, 0.3, 6),
    bugs_reliability: clamp(bugs, 0.4, 6),
    price_too_high: price,
    switched_competitor: clamp(comp, 0.5, 4),
    found_free_alternative: clamp(Math.sqrt(comp), 0.6, 2.5),
    platform_built_in: clamp(Math.sqrt(comp), 0.7, 2),
    champion_left: champ,
  };
  const evidence = [];
  if (w.never_activated > 1.3) evidence.push(`weak activation (fit ${Math.round(fit * 100)}/100, ${ob} onboarding)`);
  if (w.poor_support > 1.3) evidence.push('slow support');
  if (w.bugs_reliability > 1.3) evidence.push('open bugs / incidents');
  if (w.price_too_high > 1.3) evidence.push('price above willingness to pay');
  if (w.switched_competitor > 1.3) evidence.push('competitive pressure');
  if (w.champion_left > 1.3) evidence.push('champion gone or weak');
  return { weights: w, evidence };
}

/** Months of the year (0-11) where this segment's churn clusters, plus whether that is a fiscal/renewal pattern. */
function peakMonths(seg) {
  const months = seg?.data?.timing?.seasonalMonths ?? [];
  return months.map((x) => ((x - 1) % 12 + 12) % 12);
}

/** Reason mix (voluntary only by default), conditioned on the player's actions and the season. Sums to 1. */
export function conditionedMix(state, sub, { voluntaryOnly = true, day = state.day } = {}) {
  const seg = churnSegment(state, sub);
  const base = seg.id ? reasonMixFor(seg.id, { model: state.company.model }) : { ...(CROSS.defaultMix[state.company.model] ?? CROSS.defaultMix.smb) };
  const { weights } = reasonDrivers(state, sub);
  const peak = peakMonths(seg).includes(monthIndex(state, day));
  const out = {};
  for (const [id, share] of Object.entries(base)) {
    if (voluntaryOnly && id === 'payment_failed') continue;
    let w = share * (weights[id] ?? 1);
    if (id === 'seasonal_pause' || id === 'project_completed_no_renewal') w *= peak ? 3 : 0.5;
    if (['budget_cut', 'funding_ended', 'contract_term_end_rfp', 'consolidated_vendors'].includes(id) && seg.data?.timing?.fiscalYearEnd) w *= peak ? 1.6 : 0.8;
    out[id] = w;
  }
  // Sold vs delivered (apps/sales/claims.js): an account told about capabilities it never got leaves for that reason.
  // gap 1 -> ~55% of its cancellations [design].
  if ((sub?.soldGap ?? 0) > 0) out.oversold = 1.2 * sub.soldGap * (Object.values(out).reduce((a, v) => a + v, 0) || 1);
  const tot = Object.values(out).reduce((a, v) => a + v, 0) || 1;
  for (const k of Object.keys(out)) out[k] /= tot;
  return out;
}

function drawFrom(state, mix) {
  const entries = Object.entries(mix);
  let r = rng(state);
  for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
  return entries.at(-1)?.[0] ?? 'other';
}

/** Draw the true reason for a voluntary cancellation. */
export const sampleTrueReason = (state, sub) => drawFrom(state, conditionedMix(state, sub));

// Specific game reasons pin the true reason; generic ones (customer_request, renewal_declined, ...) get a draw.
const PINNED = new Set(['poor_support', 'price_too_high', 'payment_failed', 'never_activated']);
/** The hidden true reason behind a cancellation that an app (or core) triggered with `gameReason`. */
export function trueReasonFor(state, sub, gameReason) {
  if (!gameReason) return sampleTrueReason(state, sub);
  if (CHURN_REASONS[gameReason]) return gameReason;
  if (gameReason === 'refund_requested') return state.company.model === 'b2c' ? 'forgot_or_surprised_renewal' : 'never_activated';
  if (gameReason === 'pity_purchase') return 'not_using';
  if (gameReason === 'disputed') return state.company.model === 'b2c' ? 'forgot_or_surprised_renewal' : 'other';
  if (gameReason === 'trial_not_converted' || gameReason === 'incomplete_expired') return gameReason === 'incomplete_expired' ? 'payment_failed' : 'never_activated';
  const alias = reasonForGameCancel(gameReason);
  if (alias && PINNED.has(alias)) return alias;
  return sampleTrueReason(state, sub);
}

// ---------------------------------------------------------------------------------------------
// Hazard: calibrated level x mean-preserving timing x the onboarding lever
// ---------------------------------------------------------------------------------------------
export function timingMult(state, sub, day = sub.currentPeriodEnd ?? state.day) {
  const seg = churnSegment(state, sub);
  const months = peakMonths(seg);
  let f = 1;
  if (months.length && months.length < 12) {
    const yearly = sub.interval === 'year';
    // Annual plans only cluster where the segment renews on a fiscal / contract calendar.
    const clustered = !yearly || seg.data?.timing?.renewalClustered || seg.data?.timing?.fiscalYearEnd;
    if (clustered) {
      const a = CHURN.seasonAmp[yearly ? 'year' : 'month'];
      const k = months.length;
      f = months.includes(monthIndex(state, day)) ? 1 + a : 1 - (a * k) / (12 - k);
    }
  }
  return Math.max(0.2, f);
}

export function earlyLifeMult(state, sub, paidMonths) {
  if (sub.interval === 'year' || paidMonths > 3) return 1;
  let f = CHURN.onboardingEarly[sub.onboarded] ?? 1;
  if (state.company.model === 'smb') {
    const seg = churnSegment(state, sub);
    const e = seg.data?.timing?.earlyLifeMult;
    if (e) f *= clamp(Math.sqrt(e / CHURN.smbCurveEarlyRatio), 0.75, 1.35);
  }
  return f;
}

/** Probability this subscription cancels at its next (ahead) or current renewal. */
export function hazard(state, sub, { ahead = false } = {}) {
  const paidMonths = (sub.paidMonths ?? 0) + (ahead ? (sub.interval === 'year' ? 12 : 1) : 0);
  const s2 = ahead ? { ...sub, paidMonths } : sub;
  let p = churnBeforeRenewal(state, s2) * timingMult(state, sub) * earlyLifeMult(state, sub, paidMonths);
  if (sub.discountSaved && state.day <= sub.discountSaved.untilDay && state.day >= sub.discountSaved.fromDay) p *= CHURN.flow.discountRelapse;
  if ((sub.soldGap ?? 0) > 0) p *= 1 + CHURN.oversoldHazard * sub.soldGap; // oversold accounts churn early (market-people.md §1.7) [design]
  return clamp(p, 0, 0.95);
}

// ---------------------------------------------------------------------------------------------
// Intent + leading signals
// ---------------------------------------------------------------------------------------------
const leadOf = (seg, sigId) => seg.data?.signals?.find((x) => x.id === sigId)?.leadDays ?? SIGNALS[sigId]?.leadDays ?? [0, 30];
const B2C_ONLY = new Set(['b2c_engagement_drop', 'streak_broken', 'goal_milestone_hit', 'annual_renewal_approaching', 'refund_request', 'new_model_release']);
const B2B_ONLY = new Set(['champion_departure', 'exec_sponsor_change', 'seat_decline', 'rfp_posted', 'term_end_approaching', 'budget_review', 'funding_cliff', 'brand_mandate', 'security_review_stall', 'acquisition_news', 'owner_succession']);

function signalAllowed(state, seg, id, sub) {
  if (!SIGNALS[id]) return false;
  if (seg.kind === 'b2c') return !B2B_ONLY.has(id);
  if (B2C_ONLY.has(id)) return false;
  if (id === 'term_end_approaching' && sub.interval !== 'year') return false;
  return true;
}

function emitSignal(state, sub, sigId, { day, renewalDay, reason, fp }) {
  const c = ensureChurn(state);
  const seg = churnSegment(state, sub);
  c.signals.push({ id: uid('sig'), subId: sub.id, customerId: sub.customerId, signal: sigId, day, renewalDay, strength: SIGNALS[sigId].strength, leadDays: leadOf(seg, sigId), crm: Boolean(seg.crm), _r: reason ?? null, fp: Boolean(fp), shown: false });
  if (c.signals.length > 600) c.signals.splice(0, c.signals.length - 600);
}

/** A signal observed directly by billing (e.g. a declined renewal). Not tied to a voluntary intent. */
export function noteSignal(state, sub, sigId) {
  if (!SIGNALS[sigId] || !sub) return;
  emitSignal(state, sub, sigId, { day: state.day, renewalDay: sub.currentPeriodEnd ?? state.day, reason: sigId === 'failed_payment' ? 'payment_failed' : null });
}

function planSignals(state, sub, ev) {
  const seg = churnSegment(state, sub);
  const renewalDay = sub.currentPeriodEnd;
  const span = Math.max(1, renewalDay - state.day);
  if (ev.intent) {
    const r = ev.intent.reason;
    const cands = [...new Set([...(CHURN_REASONS[r]?.signals ?? []), ...(seg.data?.signals?.map((x) => x.id) ?? []).filter((id) => (CHURN_REASONS[r]?.signals ?? []).includes(id))])].filter((id) => signalAllowed(state, seg, id, sub));
    for (const id of cands) {
      if (!chance(state, SIGNALS[id].strength * 0.8)) continue;
      const [lo, hi] = leadOf(seg, id);
      const lead = lo + rng(state) * Math.max(0, hi - lo);
      const day = Math.round(clamp(renewalDay - lead, state.day + 1, renewalDay - 1));
      emitSignal(state, sub, id, { day, renewalDay, reason: r });
    }
  } else if (chance(state, CHURN.noiseSignalsPerEval[sub.interval === 'year' ? 'year' : 'month'])) {
    // A false positive: weak signals misfire most (login decay, NPS, silence) [design].
    const pool = Object.keys(SIGNALS).filter((id) => signalAllowed(state, seg, id, sub) && !['closure_news', 'data_export_request', 'brand_mandate', 'rfp_posted', 'acquisition_news'].includes(id));
    const ws = pool.map((id) => 1 - SIGNALS[id].strength);
    let x = rng(state) * ws.reduce((a, b) => a + b, 0);
    let id = pool.at(-1);
    for (let i = 0; i < pool.length; i++) { x -= ws[i]; if (x <= 0) { id = pool[i]; break; } }
    if (id) emitSignal(state, sub, id, { day: state.day + 1 + Math.floor(rng(state) * Math.max(1, span - 1)), renewalDay, fp: true });
  }
}

function evaluate(state, sub) {
  const p = hazard(state, sub, { ahead: true });
  const intent = chance(state, p) ? { reason: sampleTrueReason(state, sub), decidedDay: state.day, maxRate: 0, tried: [], saved: false } : null;
  sub.churnEval = { periodEnd: sub.currentPeriodEnd, p: round2(p * 10000) / 10000, day: state.day, intent };
  planSignals(state, sub, sub.churnEval);
  // Consistency with Customer success: a champion who is about to be the reason leaves visibly.
  if (intent?.reason === 'champion_left') {
    const acct = successAccount(state, sub);
    if (acct && (acct.champion === 'active' || acct.champion === 'weak')) acct.pendingChampionExit = state.day + Math.round(rng(state) * 30);
  }
}

/** Daily: decide upcoming renewals ahead of time, surface due signals, pauses, cancel-flow side effects. */
export function churnDay(state) {
  const c = ensureChurn(state);
  const st = state.stripe;
  if (!st) return;
  for (const sub of st.subscriptions) {
    if (sub.status !== 'active' || sub.currentPeriodEnd == null || sub.cancelAtPeriodEnd || sub.pause) continue;
    const lead = CHURN.leadWindowDays[sub.interval === 'year' ? 'year' : 'month'];
    if (sub.currentPeriodEnd - state.day <= lead && sub.churnEval?.periodEnd !== sub.currentPeriodEnd) evaluate(state, sub);
    const acct = sub.churnEval?.intent && successAccount(state, sub);
    if (acct?.pendingChampionExit != null && state.day >= acct.pendingChampionExit) {
      acct.pendingChampionExit = null;
      if (acct.champion === 'active' || acct.champion === 'weak') { acct.champion = 'left'; acct.championLeftDay = state.day; }
    }
  }
  for (const s of c.signals) if (!s.shown && s.day <= state.day) s.shown = true;
  // Expire cancel-flow discounts (core keeps its own coupon so it works without the Stripe app).
  for (const sub of st.subscriptions) {
    if (sub.coupon?.source === 'churn' && sub.coupon.endDay != null && state.day >= sub.coupon.endDay) {
      if (sub.status !== 'canceled') changePrice(state, sub.id, { price: sub.coupon.originalPrice });
      sub.coupon = null;
    }
  }
  threatShopping(state, c);
}

/** Signals visible to the founder now (fired, renewal still ahead or the account still live). */
export function visibleSignals(state, { crm = null, days = 120 } = {}) {
  const c = ensureChurn(state);
  return c.signals.filter((s) => s.shown && s.day > state.day - days && (crm == null || s.crm === crm)).map((s) => ({ ...s, label: SIGNALS[s.signal]?.label ?? s.signal, how: SIGNALS[s.signal]?.howDetected ?? '' }));
}

// ---------------------------------------------------------------------------------------------
// Save tactics
// ---------------------------------------------------------------------------------------------
const PRICE_TACTICS = { discount_offer: { pct: 0.2, months: 3 }, multi_year_price_lock: { pct: 0.15, months: 24 }, early_renewal_extension: { pct: 0.08, months: 12 }, annual_prepay_switch: { pct: 0.15, months: 12 }, fix_and_credit: { pct: 0.5, months: 1 } };
const CASH_COST = { compliance_package: 6000, cooperative_contract_listing: 1500, integration_switching_cost: 0, approved_vendor_listing: 500 }; // [design]
const GENERIC_SMB = ['discount_offer', 'downgrade_offer', 'pause_plan', 'onboarding_rescue', 'fix_and_credit', 'exec_outreach'];

/** Save tactics a founder can use on this account: the segment's playbook first, then generic ones. */
export function tacticsFor(state, sub) {
  const seg = churnSegment(state, sub);
  const ids = [...(seg.data?.saveTactics ?? []).map((t) => t.id), ...GENERIC_SMB, ...(seg.crm ? ['champion_handoff', 'multi_thread_second_contact', 'renewal_survey_and_usage_report'] : [])];
  return [...new Set(ids)].filter((id) => SAVE_TACTICS[id] && !id.startsWith('b2c_') && !['dunning_retries', 'card_updater', 'cancel_flow_offer'].includes(id)).map((id) => {
    const t = SAVE_TACTICS[id];
    const o = seg.data?.saveTactics?.find((x) => x.id === id);
    return { id, label: t.label, rate: o?.rate ?? t.rate, hours: Math.max(0.25, o?.hours ?? t.hours), appliesTo: t.appliesTo, costNote: t.costNote, cash: CASH_COST[id] ?? 0, price: PRICE_TACTICS[id] ?? null, evidence: t.evidence };
  });
}

function applyCoupon(state, sub, pct, months, code) {
  if (sub.coupon || pct <= 0) return 0;
  const original = sub.price;
  const before = monthlyAmount(sub);
  changePrice(state, sub.id, { price: round2(original * (1 - pct)) });
  const period = sub.interval === 'year' ? 365 : 30;
  const n = sub.interval === 'year' ? Math.max(1, Math.round(months / 12)) : months;
  sub.coupon = { id: `co_${code}`, code, pctOff: Math.round(pct * 100), originalPrice: original, endDay: state.day + n * period, source: 'churn' };
  return round2(before * pct * (sub.interval === 'year' ? n * 12 : months)); // an annual plan's coupon runs whole years
}

/**
 * Use a save tactic on an account. Costs are applied here (cash, price concessions); founder hours are charged by
 * the caller (ctx.act with tactic.hours). Works only when the account really is leaving for a reason the tactic
 * fits; several tactics combine as the max of their rates, not the sum. Returns { saved, matched, marginUsd, cash }.
 */
export function applySaveTactic(state, subId, tacticId) {
  const c = ensureChurn(state);
  const sub = state.stripe.subscriptions.find((x) => x.id === subId);
  if (!sub || !live(sub)) throw new Error('That account is no longer active.');
  const t = tacticsFor(state, sub).find((x) => x.id === tacticId);
  if (!t) throw new Error('That tactic does not fit this account.');
  const ev = sub.churnEval?.periodEnd === sub.currentPeriodEnd ? sub.churnEval : null;
  const intent = ev?.intent && !ev.intent.saved ? ev.intent : null;
  let marginUsd = 0;
  if (t.cash) post(state, { amount: -t.cash, counterparty: t.label.split(':')[0], description: `Retention: ${t.label}`, category: 'contractors', method: 'card' });
  if (t.price) marginUsd = applyCoupon(state, sub, t.price.pct, t.price.months, tacticId.toUpperCase());
  if (tacticId === 'downgrade_offer' && !sub.coupon) { const before = monthlyAmount(sub); changePrice(state, sub.id, { price: round2(sub.price * (1 - CHURN.flow.downgradeCut)) }); marginUsd = round2(before * CHURN.flow.downgradeCut * 12); }
  if (tacticId === 'pause_plan') pauseSub(state, sub, intent?.reason ?? null);
  if (tacticId === 'exec_outreach' || tacticId === 'champion_handoff' || tacticId === 'multi_thread_second_contact') {
    const acct = successAccount(state, sub);
    if (acct) { acct.lastTouchDay = state.day; if (tacticId !== 'exec_outreach' && acct.champion === 'left') acct.champion = 'weak'; if (tacticId === 'multi_thread_second_contact') acct.contacts = Math.max(2, acct.contacts ?? 1); }
  }
  const matched = Boolean(intent && t.appliesTo.includes(intent.reason));
  let saved = false;
  if (matched) {
    const late = sub.currentPeriodEnd - state.day <= 7 ? 0.6 : 1; // a save attempted in the last week works less often [design]
    const rate = clamp(t.rate * late, 0, 0.95);
    if (rate > intent.maxRate) {
      saved = rng(state) < (rate - intent.maxRate) / (1 - intent.maxRate);
      intent.maxRate = rate;
    }
    if (saved || tacticId === 'pause_plan') intent.saved = saved || intent.saved;
  }
  if (intent) intent.tried.push({ id: tacticId, matched, day: state.day, hours: t.hours, cash: t.cash, marginUsd });
  else if (ev) (ev.falseAlarm ??= []).push({ id: tacticId, day: state.day, hours: t.hours, cash: t.cash, marginUsd });
  c.attempts.push({ id: uid('sv'), day: state.day, subId, tactic: tacticId, hours: t.hours, cash: t.cash, marginUsd, outcome: 'pending' });
  if (c.attempts.length > 400) c.attempts.splice(0, c.attempts.length - 400);
  c.saves.attempts++;
  c.saves.hours += t.hours;
  c.saves.usd += t.cash + marginUsd;
  if (matched) c.saves.matched++;
  if (saved) c.saves.saved++;
  return { saved, matched, marginUsd, cash: t.cash, hours: t.hours };
}

// ---------------------------------------------------------------------------------------------
// Pauses
// ---------------------------------------------------------------------------------------------
export function pauseSub(state, sub, reason) {
  if (sub.pause) return;
  const amt = monthlyAmount(sub);
  sub.pause = { fromDay: state.day, untilDay: state.day + CHURN.flow.pauseDays, reason, amount: amt };
  state.stripe.events.push({ day: state.day, type: 'contraction', amount: -round2(amt), subId: sub.id, customerId: sub.customerId, source: sub.source, pause: true });
}

/** Called by core billing at a paused subscription's period end. Returns 'paused' | 'resumed' | 'cancel'. */
export function pauseAtRenewal(state, sub) {
  const p = sub.pause;
  if (state.day < p.untilDay) return 'paused';
  const c = ensureChurn(state);
  const resume = p.reason == null ? 0.92 : CHURN.flow.resume[p.reason] ?? CHURN.flow.resumeDefault; // a pause nobody needed mostly resumes [design]
  sub.pause = null;
  state.stripe.events.push({ day: state.day, type: 'expansion', amount: round2(p.amount), subId: sub.id, customerId: sub.customerId, source: sub.source, pause: true });
  if (chance(state, resume)) { c.flowStats.resumed++; return 'resumed'; }
  c.flowStats.pauseLost++;
  sub.churnReason = p.reason ?? sub.churnReason;
  return 'cancel';
}

// ---------------------------------------------------------------------------------------------
// Cancel flow (self-serve): survey + offers, and the over-discounting trap
// ---------------------------------------------------------------------------------------------
export function flowEligible(state, sub) {
  const c = ensureChurn(state);
  if (!c.flow.enabled || !c.flow.setup || state.company.model === 'ent') return false;
  const cus = customerById(state, sub.customerId);
  return state.company.model === 'b2c' || !cus?.crmCompanyId;
}

const OFFER_FOR_CATEGORY = { too_expensive: ['discount', 'downgrade'], not_using: ['pause', 'downgrade'], no_longer_needed: ['pause'], missing_feature: ['downgrade'], switched: ['discount'], bugs: [], felt_ignored: [] };

function runCancelFlow(state, sub, reason) {
  const c = ensureChurn(state);
  const f = c.flow;
  c.flowStats.started++;
  let shown = ORDER_KEYS.filter((k) => f.offers[k]);
  if (f.survey && chance(state, CHURN.flow.surveyResponse)) {
    const ans = surveyAnswer(reason, () => rng(state));
    sub.flowSurvey = { text: ans.text, category: ans.category };
    if (ans.category) {
      const tailored = shown.filter((k) => (OFFER_FOR_CATEGORY[ans.category] ?? []).includes(k));
      shown = tailored.length ? tailored : shown.slice(0, 1);
    }
  }
  if (!shown.length) return null;
  const sv = CHURN_REASONS[reason]?.saveable ?? {};
  let best = null;
  for (const k of shown) {
    let p = (sv[k] ?? 0) * CHURN.flow.acceptScale;
    if (k === 'discount') p *= clamp(f.discountPct / 25, 0.5, 1.4);
    if (!best || p > best.p) best = { k, p };
  }
  if (!best || !(rng(state) < best.p)) return null;
  c.flowStats.saved++;
  c.flowStats.byOffer[best.k]++;
  if (best.k === 'pause') pauseSub(state, sub, reason);
  else if (best.k === 'downgrade') changePrice(state, sub.id, { price: round2(sub.price * (1 - CHURN.flow.downgradeCut)) });
  else {
    const given = applyCoupon(state, sub, f.discountPct / 100, f.discountMonths, `STAY${f.discountPct}`);
    c.flowStats.marginGiven += given;
    sub.discountSaved = { reason, fromDay: sub.coupon?.endDay ?? state.day, untilDay: (sub.coupon?.endDay ?? state.day) + 60 };
  }
  return best.k;
}

// Customers learn that "cancel" gets a discount: each month some happy self-serve customers start the flow just to
// get it. Grows with the discount depth and with how long the offer has been public; an untargeted (no survey)
// offer is found faster [design]. Costs margin with no retention benefit.
function threatShopping(state, c) {
  const f = c.flow;
  if (!f.enabled || !f.setup || !f.offers.discount || state.day % 30 !== 0 || state.company.model === 'ent') return;
  const monthsOn = Math.max(0, (state.day - (f.sinceDay ?? state.day)) / 30);
  const rate = CHURN.flow.threatBase * Math.pow(f.discountPct / 25, 1.6) * Math.min(1, monthsOn / CHURN.flow.threatRampMonths) * (f.survey ? 1 : 1.5);
  if (rate <= 0) return;
  let n = 0, margin = 0;
  for (const sub of state.stripe.subscriptions) {
    if (sub.status !== 'active' || sub.coupon || sub.pause || sub.churnEval?.intent || !flowEligible(state, sub)) continue;
    if (!chance(state, rate)) continue;
    margin += applyCoupon(state, sub, f.discountPct / 100, f.discountMonths, `STAY${f.discountPct}`);
    n++;
  }
  if (!n) return;
  c.flowStats.threatDiscounts += n;
  c.flowStats.marginGiven += margin;
  logMistake(state, { functionId: 'customer_success', id: 'renewal_discount', label: 'Customers trained to threaten cancellation', cost: { usd: round2(margin) }, delayed: true, detail: `${n} customers who were not leaving opened the cancel flow to collect the ${f.discountPct}% discount this month.`, app: 'stripe' });
}

// ---------------------------------------------------------------------------------------------
// The renewal decision (called by core/stripe.js at a live subscription's period end)
// ---------------------------------------------------------------------------------------------
/**
 * Returns { churn: boolean, reason, saved: 'pause'|'downgrade'|'discount'|'tactic'|null }.
 * Overall level: with an intent the keep probability is min(1, pNow/pThen); without one the extra hazard
 * (pNow - pThen)/(1 - pThen) applies; with no evaluation the hazard applies directly, so P(churn) = pNow.
 */
export function renewalDecision(state, sub) {
  const ev = sub.churnEval?.periodEnd === sub.currentPeriodEnd ? sub.churnEval : null;
  // A renewal signed in Customer success (or a multi-year term still running) is a contract: no voluntary churn.
  const acct = successAccount(state, sub);
  if (acct && ((acct.renewal?.status === 'committed' && acct.renewal.periodEnd === sub.currentPeriodEnd) || (acct.multiYearUntil != null && sub.currentPeriodEnd <= acct.multiYearUntil))) {
    if (ev?.intent && !ev.intent.saved) ev.intent.saved = true;
    settleEval(state, sub, ev, false);
    return { churn: false, reason: null, saved: 'contract' };
  }
  const pNow = hazard(state, sub);
  let churn = false, reason = null;
  if (ev?.intent) {
    if (ev.intent.saved) { settleEval(state, sub, ev, false); return { churn: false, reason: null, saved: 'tactic' }; }
    churn = rng(state) < Math.min(1, pNow / Math.max(1e-6, ev.p));
    reason = ev.intent.reason;
  } else if (ev) {
    churn = pNow > ev.p && rng(state) < (pNow - ev.p) / Math.max(1e-6, 1 - ev.p);
  } else churn = rng(state) < pNow;
  if (churn && !reason) reason = sampleTrueReason(state, sub);
  if (churn && flowEligible(state, sub)) {
    const offer = runCancelFlow(state, sub, reason);
    if (offer) { settleEval(state, sub, ev, false); return { churn: false, reason, saved: offer }; }
  }
  // B2C lapse re-engagement push: brings back some not_using / achieved_goal lapsers before the charge.
  if (churn && state.company.model === 'b2c' && ensureChurn(state).reengagement.enabled && ['not_using', 'achieved_goal'].includes(reason) && chance(state, CHURN.reengagement.rate)) {
    ensureChurn(state).reengagement.saved++;
    settleEval(state, sub, ev, false);
    return { churn: false, reason, saved: 'reengagement' };
  }
  settleEval(state, sub, ev, churn);
  return { churn, reason: churn ? reason : null, saved: null };
}

// Close the books on an evaluated renewal: wasted tactics and missed signals become traceable mistakes.
function settleEval(state, sub, ev, churned) {
  if (!ev || ev.settled) return;
  ev.settled = true;
  const c = ensureChurn(state);
  const mrr = monthlyAmount(sub);
  const tried = ev.intent?.tried ?? [];
  const wasted = tried.filter((t) => !t.matched);
  for (const t of wasted) {
    c.saves.wasted++;
    logMistake(state, { functionId: 'customer_success', id: 'wrong_save_tactic', label: 'Save tactic that did not fit the reason', cost: { hours: t.hours, usd: round2(t.cash + t.marginUsd) }, delayed: true, detail: `${SAVE_TACTICS[t.id]?.label ?? t.id} on an account that was leaving because: ${CHURN_REASONS[ev.intent.reason]?.label ?? ev.intent.reason}.`, app: 'success' });
  }
  for (const t of ev.falseAlarm ?? []) {
    if (!(t.cash + t.marginUsd > 0)) continue;
    c.saves.wasted++;
    logMistake(state, { functionId: 'customer_success', id: 'renewal_discount', label: 'Concession to an account that was not leaving', cost: { hours: t.hours, usd: round2(t.cash + t.marginUsd) }, delayed: true, detail: `${SAVE_TACTICS[t.id]?.label ?? t.id} given on a false alarm.`, app: 'success' });
  }
  for (const a of c.attempts) if (a.subId === sub.id && a.outcome === 'pending') a.outcome = churned ? 'lost' : ev.intent ? (tried.some((t) => t.matched) ? 'saved' : 'stayed') : 'not_at_risk';
  if (churned && state.company.model !== 'b2c' && !tried.length) {
    const early = c.signals.filter((s) => s.subId === sub.id && !s.fp && s.renewalDay === ev.periodEnd && s.day <= state.day - CHURN.missedSignalMinLead);
    if (early.length) {
      c.missed++;
      logMistake(state, { functionId: 'customer_success', id: 'missed_signal', label: 'Churn signal nobody acted on', cost: { customers: 1, usd: round2(mrr * 12) }, delayed: true, detail: `${SIGNALS[early[0].signal]?.label ?? early[0].signal} showed ${state.day - early[0].day} days before they left; no save was attempted.`, app: 'success' });
    }
  }
}

/** Record the true reason on a subscription that just ended (core/stripe.js endSub). */
export function recordChurn(state, sub, gameReason) {
  const c = ensureChurn(state);
  if (gameReason === 'trial_not_converted' || gameReason === 'incomplete_expired') return;
  sub.churnReason ??= trueReasonFor(state, sub, gameReason);
  c.reasons[sub.churnReason] = (c.reasons[sub.churnReason] ?? 0) + 1;
  const ev = sub.churnEval;
  if (ev && !ev.settled && ev.periodEnd === sub.currentPeriodEnd) settleEval(state, sub, ev, true);
}

/** Exit-survey answer for a churned subscription (null category = no usable answer). */
export function statedReason(state, sub) {
  if (sub.flowSurvey) return { ...sub.flowSurvey, viaFlow: true };
  const a = surveyAnswer(sub.churnReason ?? 'other', () => rng(state));
  return { text: a.text, category: a.category };
}

export { CHURN_REASONS, SIGNALS, SAVE_TACTICS };
