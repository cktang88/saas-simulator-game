// Who the company sells to (startups, local SMBs, e-commerce, mid-market, enterprise): the profile every business
// function reads. Pure helpers over data/customer-types.js; imports no apps and no other core simulation module so
// market.js, stripe.js, truth.js and churn.js can all use it without cycles.
//
// state.company.customerType is the current type (null on old saves or "mixed / not sure": every helper then returns
// the neutral model baseline). Each subscription is stamped with the type it was sold under (sub.customerType), so a
// company that moved upmarket keeps its old SMB customers' churn and payment behaviour.
// Daily simulation, upmarket moves, mistakes and the operator reader live in apps/segment/engine.js.

import { CUSTOMER_TYPES, SOURCE_CHANNEL, TYPES_BY_MODEL } from '../data/customer-types.js';
import { clamp } from './util.js';

export { CUSTOMER_TYPES, TYPES_BY_MODEL };

export const customerTypeOf = (state) => {
  const t = state?.company?.customerType;
  return t && CUSTOMER_TYPES[t] ? t : null;
};
export const profileOf = (state, type = customerTypeOf(state)) => (type && CUSTOMER_TYPES[type] ? CUSTOMER_TYPES[type] : null);
export const isSmbType = (type) => ['startups', 'local_smb', 'ecommerce'].includes(type);

/** Set the type at setup (validated against the business model). Returns the stored id or null. */
export function setCustomerType(state, type) {
  const ok = type && CUSTOMER_TYPES[type] && (TYPES_BY_MODEL[state.company.model] ?? []).includes(type);
  state.company.customerType = ok ? type : null;
  return state.company.customerType;
}

// ---- Market baseline -------------------------------------------------------------------------------------------

const CFG_CACHE = new Map();

/**
 * MARKET[model] with the customer type's overrides applied (price level, trial starts and conversion, churn curve,
 * renewal, annual share, elasticity). `type` defaults to the company's; a type whose model differs from `model`
 * is ignored (neutral), so callers never mix an SMB curve into an enterprise baseline by accident.
 */
export function customerMarketCfg(base, model, type) {
  const p = type ? CUSTOMER_TYPES[type] : null;
  if (!base || !p || p.model !== model || !Object.keys(p.market ?? {}).length) return base;
  const key = `${model}|${type}`;
  let c = CFG_CACHE.get(key);
  if (c && c.__base === base) return c;
  const m = p.market;
  const early = m.earlyChurnMult ?? 1;
  c = {
    ...base,
    refPrice: +(base.refPrice * (m.refPriceMult ?? 1)).toFixed(2),
    trialStartRate: base.trialStartRate * (m.trialStartMult ?? 1),
    trialToPaid: Object.fromEntries(Object.entries(base.trialToPaid).map(([k, v]) => [k, Math.min(1, v * (m.trialToPaidMult ?? 1))])),
    monthlyChurn: base.monthlyChurn.map((v, i) => clamp(v * (m.churnMult ?? 1) * (i < 2 ? early : 1), 0.002, 0.9)),
    annualRenewal: m.annualRenewal ?? base.annualRenewal,
    annualShare: m.annualShare ?? base.annualShare,
    elasticity: m.elasticity ?? base.elasticity,
  };
  Object.defineProperty(c, '__base', { value: base, enumerable: false });
  CFG_CACHE.set(key, c);
  return c;
}

/** Which model a subscription's churn curve comes from: the type it was sold under, else the company's model. */
export const subModel = (state, sub) => (sub?.customerType && CUSTOMER_TYPES[sub.customerType] ? CUSTOMER_TYPES[sub.customerType].model : state.company.model);

// ---- Channels --------------------------------------------------------------------------------------------------

export function channelOf(source) {
  const s = String(source ?? '');
  for (const [rx, id] of SOURCE_CHANNEL) if (rx.test(s)) return id;
  return null;
}

/** Seasonal signup multiplier for the current month (e-commerce Q4 freeze, January install wave). */
export function seasonalSignupMult(state, month) {
  const p = profileOf(state);
  return p?.seasonality?.signups?.[month + 1] ?? 1;
}

/**
 * How well a channel reaches this customer type (0..2, 1 = model baseline): the research multiplier for the channel
 * the source maps to. Neutral when no type is set or the source is not a marketing channel (network, inbound).
 */
export function channelFit(state, source) {
  const p = profileOf(state);
  if (!p) return 1;
  const c = channelOf(source);
  return c ? p.channels[c] ?? 1 : 1;
}

// ---- Onboarding, support, payments -----------------------------------------------------------------------------

/** Trial-conversion multiplier of the onboarding mode for this type (owners need setup; engineers want self-serve). */
export const onboardingFit = (state, mode) => profileOf(state)?.onboarding?.[mode] ?? 1;

/**
 * Factor applied to the median first-response time before the churn bands (support/model.js frtChurnMult), which are
 * calibrated for a generic B2B tolerance of ~4 hours: a type that expects 1-2 hour answers feels a 4-hour reply like
 * an 8-16 hour one. E-commerce is stricter still in its peak months.
 */
export function supportStrictness(state, month = null) {
  const p = profileOf(state);
  if (!p) return 1;
  const tol = p.support?.frtToleranceHours ?? 4;
  const peak = month != null && (p.support?.peakMonths ?? []).includes(month + 1) ? 1.5 : 1;
  return clamp((4 / tol) * peak, 0.5, 4);
}
/** Seat / usage expansion multiplier for a subscription's customer type (startups hire, owners rarely add seats). */
export const expansionFit = (state, sub) => profileOf(state, sub?.customerType ?? customerTypeOf(state))?.expansion?.mult ?? 1;
export const ticketsMult = (state) => profileOf(state)?.support?.ticketsMult ?? 1;

/** Renewal payment-failure multiplier for the type the subscription was sold under (debit cards fail, invoices do not). */
export const paymentFailMult = (state, sub) => profileOf(state, sub?.customerType ?? customerTypeOf(state))?.payments?.failMult ?? 1;

// ---- Segments --------------------------------------------------------------------------------------------------

// Buyer-segment group -> the customer type a prospect of that segment behaves like.
const GROUP_TYPE = { owner_smb: 'local_smb', professional: 'local_smb', health: 'local_smb', nonprofit: 'local_smb', company: 'mid_market', regulated: 'enterprise', public: 'enterprise', education: 'mid_market' };
const SEGMENT_TYPE = { startup_smb: 'startups', ecommerce: 'ecommerce', agencies: 'startups', mid_market: 'mid_market', enterprise: 'enterprise', hospitals: 'enterprise', pharma: 'enterprise', federal: 'enterprise', state_gov: 'enterprise', utilities: 'enterprise' };

/** The customer type a buyer segment behaves like (data/buyer-segments.js id + group). */
export const typeOfSegment = (segmentId, group = null) => SEGMENT_TYPE[segmentId] ?? GROUP_TYPE[group] ?? null;

/**
 * Cold-email reply multiplier for a prospect of this segment, relative to the generic SMB baseline. Only applies when
 * the company has a customer type (old saves keep the generic model). Startups already carry the SaaS-buyer penalty in
 * sales/replies.js, so their multiplier is divided by it to avoid counting it twice.
 */
export function outboundEmailFit(state, segmentId, group, { saasPenalty = 1 } = {}) {
  if (!customerTypeOf(state)) return 1;
  const t = typeOfSegment(segmentId, group) ?? customerTypeOf(state);
  const v = CUSTOMER_TYPES[t]?.channels?.outbound_email ?? 1;
  return t === 'startups' ? v / Math.max(0.3, saasPenalty) : v;
}

// ---- Acquisition thinning --------------------------------------------------------------------------------------

/**
 * Signups a channel really delivers for this customer type: n scaled by channelFit x the seasonal signup multiplier.
 * Below 1 each signup survives with that probability (the visitors were not your buyers); above 1 the count is drawn
 * around n x fit. `rand` is the caller's seeded stream (rng(state) bound). Neutral (returns n, no draws) without a type.
 * Records per-channel totals in state.apps.segment.acq for the operator read and the wrong-channel mistake.
 */
export function fitCount(state, source, n, rand, month) {
  if (!(n > 0) || !customerTypeOf(state)) return n;
  const f = channelFit(state, source) * seasonalSignupMult(state, month);
  if (f === 1) return n;
  let k;
  if (f < 1) { k = 0; for (let i = 0; i < n; i++) if (rand() < f) k++; }
  else { const extra = n * (f - 1); k = n + Math.floor(extra) + (rand() < extra - Math.floor(extra) ? 1 : 0); }
  const c = channelOf(source) ?? 'other';
  const S = (state.apps.segment ??= {});
  const a = ((S.acq ??= {})[c] ??= { n: 0, kept: 0, since: state.day });
  a.n += n; a.kept += k;
  return k;
}
