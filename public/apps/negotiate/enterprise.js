// Enterprise-deal negotiation adapter (Sales -> CRM deal in the contract stage): the "negotiation window" before signature.
// The counterparty is the buyer's procurement; its style comes from the buyer segment (data/buyer-segments.js). Issues,
// researched discount bands and give-gets: data/negotiation.js. The agreed terms flow into the deal, the Stripe subscription
// (consequences.js), Legal exposure, renewals (uplift cap, discount anchoring through sub.discountPct), and cash (net terms).
// Walking away or a buyer walk-away loses the deal.

import { clamp, dateOf, round2, money } from '../../core/util.js';
import { logMistake } from '../../core/operator.js';
import { notify } from '../../core/state.js';
import { ENTERPRISE_ISSUES, SEGMENT_STYLE, discountBand, GIVE_GETS } from '../../data/negotiation.js';
import { registerAdapter, startNegotiation, findNegotiation, getNegotiation } from '../../core/negotiation.js';
import { companyById, contactById, loseDeal, addActivity } from '../sales/model.js';
import { getSegment } from '../sales/segments.js';
import { ensureLegal } from '../legal/sim.js';
import { currentRunway } from '../fundraising/process.js';
import { LIABILITY_EXPOSURE, START_DAYS } from './consequences.js';
import { bizBlock } from '../context.js';

export const KIND = 'enterprise';
const FN = 'negotiation';

/** Days until the end of the calendar quarter (the seller's quota deadline, which procurement knows). */
export function daysToQuarterEnd(state, day = state.day) {
  const d = dateOf(state, day);
  const qEndMonth = Math.floor(d.getUTCMonth() / 3) * 3 + 2;
  const end = Date.UTC(d.getUTCFullYear(), qEndMonth + 1, 0, 12);
  return Math.max(0, Math.round((end - d.getTime()) / 86400000));
}

const listAcvOf = (deal) => Math.round((deal.amount ?? 0) / Math.max(0.05, 1 - (deal.discountPct ?? 0)));

function styleFor(state, deal, seg) {
  const acv = deal.amount ?? 0;
  let style = SEGMENT_STYLE[seg?.group] ?? 'hardball';
  if (seg?.id === 'enterprise' || acv >= 100000) style = seg?.group === 'regulated' || seg?.group === 'public' || seg?.group === 'health' || seg?.group === 'education' ? 'bureaucratic' : 'hardball';
  else if (seg?.id === 'startup_smb') style = 'time_pressed';
  else if (acv < 8000 && style === 'hardball') style = 'time_pressed';
  return style;
}

function weightsFor(style, group) {
  const wc = {};
  for (const i of ENTERPRISE_ISSUES) wc[i.id] = i.wc;
  const mul = (id, k) => { wc[id] *= k; };
  if (style === 'bureaucratic') { mul('liability', 2.2); mul('mfn', 1.8); mul('tfc', 1.8); mul('payment', 1.6); mul('discount', 0.8); }
  if (style === 'hardball') { mul('discount', 1.25); mul('payment', 1.5); mul('uplift', 1.4); mul('logo', 0.6); }
  if (style === 'time_pressed') { mul('start', 3); mul('discount', 1.1); mul('liability', 0.4); mul('mfn', 0.3); mul('tfc', 0.6); }
  if (style === 'collaborative') { mul('term', 1.4); mul('sla', 1.5); mul('logo', 1.4); }
  if (group === 'regulated' || group === 'health') mul('liability', 1.3);
  return { wc };
}

/** Build a negotiation spec for a deal in the contract stage. */
export function enterpriseSpec(state, deal) {
  const co = companyById(state, deal.companyId) ?? {};
  const ct = contactById(state, deal.contactId);
  const seg = deal.segmentId ? getSegment(deal.segmentId) : null;
  const group = seg?.group ?? 'company';
  const style = styleFor(state, deal, seg);
  const listAcv = listAcvOf(deal);
  const acv = deal.amount ?? listAcv;
  const d0 = clamp(deal.discountPct ?? 0, 0, 0.3);
  const band = discountBand(listAcv);
  const issues = ENTERPRISE_ISSUES.map((i) => (i.id === 'discount' ? { ...i, min: d0, max: Math.max(band.ask, d0 + 0.1) } : { ...i }));
  const parts = deal.closeParts ?? {};
  let batnaStrength = 0.45 + (parts.competitor != null && parts.competitor < 0.95 ? 0.1 : 0) + (deal.hasPain === false ? 0.15 : 0) - ((deal.callQuality ?? 0.4) > 0.6 ? 0.08 : 0) + ((parts.budgetRatio ?? 1) < 1 ? 0.06 : 0);
  batnaStrength = clamp(batnaStrength, 0.2, 0.8);
  const floors = {};
  const dRange = Math.max(0.01, issues[0].max - issues[0].min);
  floors.discount = clamp((band.lo * 0.5 - issues[0].min) / dRange, 0, 0.6);
  if (['regulated', 'health', 'public'].includes(group)) floors.liability = 0.45;
  if (['public', 'education'].includes(group)) floors.payment = 0.25;
  const leverageRoom = { discount: clamp(0.04 / dRange, 0, 0.5), liability: 0.1, payment: 0.15 };
  const name = ct ? `${ct.firstName ?? ''} ${ct.lastName ?? ''}`.trim() || ct.fullName || 'Buyer' : 'Buyer';
  const role = style === 'bureaucratic' ? 'procurement and legal review' : style === 'hardball' ? 'procurement manager' : style === 'time_pressed' ? 'decision maker' : 'buying champion and finance';
  const stakes = acv >= 60000 ? 'high' : acv >= 12000 ? 'mid' : 'low';
  const qLeft = daysToQuarterEnd(state);
  return {
    key: `deal:${deal.id}`, kind: KIND, ref: deal.id, title: `${co.name ?? 'Buyer'}: contract terms`, stakes, stakesUsd: acv,
    usdPerUtil: Math.round(1.25 * listAcv * (Number(deal.termYears) || 1.5)),
    cp: { name: name || 'Procurement', role, style },
    issues, weights: weightsFor(style, group), jitter: 0.35, floors, leverageRoom, batnaStrength,
    cpOpens: true, cpDeadlineDays: style === 'time_pressed' ? 21 : style === 'bureaucratic' ? 80 : 45,
    playerDeadlineDay: state.day + qLeft, cpKnowsDeadline: style === 'hardball' || style === 'bureaucratic',
    expiresDay: (deal.contract?.signDay ?? state.day) + (style === 'bureaucratic' ? 30 : 14),
    mistakes: { bluff: 'bluffed_alternative', overplayed: 'overplayed_hand' },
    context: { dealId: deal.id, listAcv, acv, d0, band, group, style, qLeft },
  };
}

/** Is a negotiation window open on this deal? */
export const canNegotiate = (deal) => deal?.stage === 'contract' && deal.contract && !deal.contract.negotiationId;

export function startEnterpriseNegotiation(state, deal) {
  if (!deal || deal.stage !== 'contract' || !deal.contract) throw new Error('The negotiation window opens when the order form is sent (contract stage).');
  const neg = startNegotiation(state, enterpriseSpec(state, deal));
  deal.contract.negotiationId = neg.id;
  addActivity(state, { type: 'note', text: 'Contract negotiation opened with the buyer\'s procurement', dealId: deal.id, companyId: deal.companyId });
  return neg;
}

// ---- The player's real alternatives ----
function batna(state, neg) {
  const crm = state.apps?.crm;
  const sources = [];
  let none = 1;
  for (const d of crm?.deals ?? []) {
    if (d.id === neg.ref || !['qualified', 'proposal', 'contract'].includes(d.stage)) continue;
    const w = d.stage === 'contract' ? 0.5 : d.stage === 'proposal' ? 0.3 : 0.12;
    const co = companyById(state, d.companyId);
    sources.push({ kind: 'pipeline', label: `${co?.name ?? 'Another deal'} (${d.stage})`, strength: w });
    none *= 1 - w;
  }
  const pipeline = 1 - none;
  let value = 0.08 + 0.4 * pipeline;
  let runway = Infinity;
  try { runway = currentRunway(state); } catch { runway = Infinity; }
  if (Number.isFinite(runway)) {
    if (runway < 3) { value *= 0.5; sources.push({ kind: 'runway', label: `Runway ${runway.toFixed(1)} months: you cannot afford to walk`, strength: -0.5 }); }
    else if (runway < 6) { value *= 0.8; sources.push({ kind: 'runway', label: `Runway ${runway.toFixed(1)} months`, strength: -0.2 }); }
  }
  const real = sources.some((s) => s.kind === 'pipeline' && s.strength >= 0.3);
  return { value: clamp(value, 0.05, 0.6), real, leverage: clamp(pipeline, 0, 1), sources };
}

// ---- Parse a package into contract terms ----
export function termsFrom(pkg) {
  return { discount: Number(pkg.discount), term: pkg.term, payment: pkg.payment, uplift: pkg.uplift, mfn: pkg.mfn, liability: pkg.liability, tfc: pkg.tfc, sla: pkg.sla, logo: pkg.logo, start: pkg.start };
}

function onClose(state, neg, result) {
  const deal = state.apps?.crm?.deals?.find((d) => d.id === neg.ref);
  if (!deal) return;
  const ctx = neg.context;
  const co = companyById(state, deal.companyId);
  if (neg.status !== 'agreed') {
    const why = neg.status === 'walked_player' ? 'You walked away from the contract terms' : neg.status === 'expired' ? 'The buyer\'s window to sign closed' : 'The buyer walked away over contract terms';
    if (deal.stage === 'contract') loseDeal(state, deal, why);
    return;
  }
  const t = termsFrom(neg.final);
  const band = ctx.band;
  const mid = (band.lo + band.hi) / 2;
  deal.discountPct = round2(t.discount);
  deal.amount = Math.round(ctx.listAcv * (1 - deal.discountPct));
  deal.termYears = Number(t.term);
  deal.negotiated = { negId: neg.id, terms: t, day: state.day, listAcv: ctx.listAcv };
  if (deal.contract) {
    deal.contract.negotiated = true;
    deal.contract.signDay = Math.max(deal.contract.signDay ?? state.day, neg.startDay + neg.elapsedDays) + (START_DAYS[t.start] ?? 5);
  }
  addActivity(state, { type: 'note', text: `Terms agreed: ${Math.round(t.discount * 100)}% off, ${t.term}-year, ${t.payment}, liability ${t.liability}`, dealId: deal.id, companyId: deal.companyId });
  const L = ensureLegal(state);
  L.exposure = round2((L.exposure ?? 0) + (LIABILITY_EXPOSURE[t.liability] ?? 0) + (t.mfn === 'full' ? 0.5 : t.mfn === 'similar' ? 0.25 : 0) + (t.tfc === 'any' ? 0.5 : 0));
  const gets = (Number(t.term) > 1 ? 1 : 0) + (t.logo !== 'no' ? 1 : 0) + (t.payment === 'upfront' ? 1 : 0) + (t.start === 'now' ? 0 : 0);
  const years = Number(t.term) || 1;
  const m = (id, label, cost, detail, delayed = false) => logMistake(state, { functionId: FN, id, label, app: 'crm', key: `neg:${neg.id}:${id}`, delayed, cost, detail });
  if (t.discount > band.hi + 0.005 || (result.capture < 0.3 && t.discount > mid)) {
    m('caved_on_discount', 'Caved on discount', { usd: Math.round((t.discount - mid) * ctx.listAcv * years) }, `${co?.name ?? 'The buyer'} got ${Math.round(t.discount * 100)}% off against a researched ${Math.round(band.lo * 100)}-${Math.round(band.hi * 100)}% band for ${band.label} deals [design]. The deep discount is also what their renewal will be anchored to.`);
  }
  if (t.discount > band.lo + 0.02 && gets === 0) {
    m('no_give_get', 'Gave concessions without asking for anything', { usd: Math.round((t.discount - band.lo) * ctx.listAcv) }, `You gave ${Math.round(t.discount * 100)}% off without getting a multi-year term (worth ~${Math.round(GIVE_GETS.multiYear * 100)}%), logo/case-study rights (~${Math.round(GIVE_GETS.caseStudy * 100)}%) or annual prepayment in return.`);
  }
  if (neg.flags.nearDeadline && t.discount > mid + 0.01) {
    m('quarter_end_desperation_discount', 'Quarter-end desperation discount', { usd: Math.round((t.discount - mid) * ctx.listAcv * years) }, `Procurement knew your quarter ended in ${Math.max(0, ctx.qLeft - neg.elapsedDays)} days and held out. Quarter-end discounts run 60-110% deeper than mid-quarter (vendor marketing data, directional).`);
  }
  if (t.liability === 'uncapped') {
    m('uncapped_liability_signed', 'Signed uncapped liability', { reputation: 0 }, `${co?.name ?? 'The buyer'} contract has no liability cap: one incident can cost more than the deal. Legal exposure rose; the cost lands when an incident happens.`, true);
    notify(state, 'You signed uncapped liability. It is logged as a risk in Legal; an incident would be paid in full.', { type: 'warn', app: 'legal' });
  }
  if (t.mfn !== 'none') notify(state, `${co?.name ?? 'The buyer'} has an MFN clause (${t.mfn === 'full' ? 'full' : 'similar customers'}): deeper discounts to other customers will reprice this account.`, { type: 'warn', app: 'crm' });
}

// What the buyer's procurement knows: its own organisation, the proposal it received, the vendor's public face. Not the
// vendor's revenue, runway or pipeline.
function brief(state, neg) {
  const deal = state.apps?.crm?.deals?.find((d) => d.id === neg.ref);
  const co = companyById(state, deal?.companyId) ?? {};
  const plan = (state.plans ?? []).find((p) => p.id === deal?.planId);
  return [
    `Your organisation: ${co.name ?? 'the buyer'}${co.employees ? `, about ${co.employees} employees` : ''}.`,
    `The vendor's proposal: ${plan?.name ?? 'their plan'} for ${deal?.quantity ?? 1} seat${(deal?.quantity ?? 1) > 1 ? 's' : ''}, list price ${money(neg.context.listAcv)} a year.`,
    `You are negotiating with the vendor's founder, ${state.founder?.name ?? 'the founder'}.`,
  ].join('\n') + bizBlock(state, 'public');
}

registerAdapter(KIND, { label: 'Enterprise deal', batna, onClose, brief });

export { batna as enterpriseBatna };
export const negotiationForDeal = (state, deal) => (deal?.contract?.negotiationId ? getNegotiation(state, deal.contract.negotiationId) : findNegotiation(state, `deal:${deal?.id}`));
export const fmtMoney = money;
