// Reference calls (docs/research/verification/market-people.md §1.3): a buyer at the shortlist / final stage calls
// 1-3 of your customers (20-30 min each). What the reference says comes from that account's real state: health,
// usage, open support tickets, whether it is about to churn, and whether it agreed to be a reference (logo /
// reference rights from the contract negotiation, negotiate/consequences.js company.referenceable). Customers answer
// more candidly than founders expect: a churn-risk account leaks a lukewarm answer ~40% of the time; an ex-customer
// put forward as a reference is exposed ~50%. The calls also check what this buyer was told about your customer count
// (reference strength) and what your website claims (backchannel). Prep costs 1 h per reference, and asking the same
// customer too often wears out the favour. All outcome odds and multipliers below are [design].

import { activeSubs } from '../../core/stripe.js';
import { ensureMarket } from '../../core/market.js';
import { chance, clamp, hash } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { verify, penalize } from '../../core/integrity.js';
import { usageProxy } from '../success/model.js';
import { addActivity, companyById } from './model.js';

export const REF = {
  askByAcv: [[5000, 0.05], [15000, 0.25], [50000, 0.55], [Infinity, 0.85]], // share of deals whose buyer asks for references
  need: [[15000, 1], [50000, 2], [Infinity, 3]],
  prepHours: 1, // per reference: brief the customer, send context
  waitDays: 14, // buyer waits this long for references before deciding without them
  fatigueWindow: 90, fatigueCalls: 2,
  mult: { glowing: 1.12, positive: 1.04, lukewarm: 0.75, negative: 0.45, declined: 0.92, exposed: 0.4, none: 0.7, noCustomers: 1 }, // noCustomers: "you would be our first"; the calibrated base win rates already price in an early vendor
  rfpPoints: { glowing: 2, positive: 1, lukewarm: -5, negative: -10, declined: -2, exposed: -12 },
};
const band = (rows, x) => rows.find(([cap]) => x < cap)[1];
const LABEL = { glowing: 'glowing', positive: 'positive', lukewarm: 'lukewarm ("it\'s fine, we have issues")', negative: 'negative (they told the buyer not to sign)', declined: 'declined the call', exposed: 'no longer a customer: the buyer found out' };

/** What a reference would really say, from the account's state. Pure read except for the cached success health. */
export function referenceProfile(state, customerId) {
  const c = (state.stripe?.customers ?? []).find((x) => x.id === customerId);
  if (!c) return null;
  const subs = (state.stripe?.subscriptions ?? []).filter((s) => s.customerId === customerId);
  const live = subs.find((s) => ['active', 'past_due', 'trialing'].includes(s.status)) ?? null;
  const acct = live ? state.apps.success?.accounts?.[live.id] : null;
  const fit = ensureMarket(state).fit.product.score ?? 0.3;
  const usage = acct?.usage ?? usageProxy({ productFit: fit, seed: live?.id ?? customerId, drift: 0 });
  const tickets = (state.apps.support?.tickets ?? []).filter((t) => t.customerId === customerId && t.status === 'open').length;
  const health = acct?.health ?? Math.round(clamp(30 + 60 * usage - 8 * tickets, 0, 100));
  const co = c.crmCompanyId ? companyById(state, c.crmCompanyId) : null;
  const atRisk = Boolean(!live || live.cancelAtPeriodEnd || live.churnEval?.intent || (live.soldGap ?? 0) > 0 || health < 45 || tickets >= 2);
  const recent = (c.refCalls ?? []).filter((d) => state.day - d <= REF.fatigueWindow).length;
  return { customerId, name: c.company || c.name, companyId: c.crmCompanyId ?? null, subId: live?.id ?? null, active: Boolean(live), health, usage: +usage.toFixed(2), tickets, atRisk, oversold: (live?.soldGap ?? 0) > 0, referenceable: Boolean(co?.referenceable && co.referenceable !== 'no'), recent, segmentId: co?.segmentId ?? null };
}

/** Customers the player could put forward (paying today). Shows what a careful operator would check first. */
export function referencePool(state) {
  const ids = new Set(activeSubs(state).map((s) => s.customerId));
  return (state.stripe?.customers ?? []).filter((c) => ids.has(c.id) && !c.meta?.pilot).map((c) => referenceProfile(state, c.id)).filter(Boolean);
}

/** One reference call. → { outcome, note } */
export function referenceCall(state, prof) {
  const c = (state.stripe?.customers ?? []).find((x) => x.id === prof.customerId);
  if (c) (c.refCalls ??= []).push(state.day);
  if (!prof.active) return { outcome: chance(state, 0.5) ? 'exposed' : 'declined' };
  const fatigue = prof.recent >= REF.fatigueCalls ? 0.25 : 0;
  if (fatigue && prof.subId) { const a = state.apps.success?.accounts?.[prof.subId]; if (a) a.drift = (a.drift ?? 0) - 0.01; }
  const decline = (prof.referenceable ? 0.03 : prof.atRisk ? 0.35 : 0.12) + fatigue;
  if (chance(state, decline)) return { outcome: 'declined' };
  if (prof.atRisk) {
    // ~40% of calls with a churn-risk account leak a lukewarm answer; an oversold or very unhealthy account is worse.
    const leak = clamp(0.4 + (prof.health < 35 ? 0.2 : 0) + (prof.oversold ? 0.25 : 0), 0, 0.9);
    if (chance(state, leak)) return { outcome: prof.health < 35 || prof.oversold ? 'negative' : 'lukewarm' };
    return { outcome: 'positive' };
  }
  if (prof.health >= 70) return { outcome: chance(state, 0.55) ? 'glowing' : 'positive' };
  return { outcome: chance(state, 0.15) ? 'lukewarm' : 'positive' };
}

/** Called when a proposal goes out: does this buyer want references? */
export function requestReferences(state, deal) {
  if (deal.references) return deal.references;
  const acv = deal.amount ?? 0;
  // Keyed on the deal (not the shared stream): whether this buyer wants references is a fact about the buyer.
  if ((parseInt(hash(`ref|${deal.id}|${deal.companyId}`), 36) % 10007) / 10007 >= band(REF.askByAcv, acv)) return null;
  deal.references = { status: 'requested', day: state.day, need: band(REF.need, acv), ids: [], calls: null, mult: null };
  // Shown on the deal (sales/learning-view.js referencesPanel); no activity row, so the request itself does not shift ids.
  return deal.references;
}

/** Put customers forward as references. Returns the founder hours it costs (prep per reference). */
export function provideReferences(state, deal, customerIds) {
  const R = deal?.references;
  if (!R || R.status !== 'requested') throw new Error('This buyer has not asked for references.');
  const pool = new Set(referencePool(state).map((p) => p.customerId));
  const ids = [...new Set(customerIds)].filter((id) => pool.has(id) && !(deal.customerId && id === deal.customerId)).slice(0, 3);
  if (!ids.length) throw new Error('Pick paying customers who agreed to take the call.');
  R.ids = ids; R.status = 'provided'; R.providedDay = state.day;
  addActivity(state, { type: 'note', text: `References sent: ${ids.length}`, dealId: deal.id, companyId: deal.companyId });
  return REF.prepHours * ids.length;
}

/** Run the calls and the checks behind them. → combined multiplier on the close odds. */
function runCalls(state, deal) {
  const R = deal.references;
  const profs = R.ids.map((id) => referenceProfile(state, id)).filter(Boolean);
  const calls = profs.map((p) => ({ customerId: p.customerId, name: p.name, health: p.health, ...referenceCall(state, p) }));
  let m = calls.reduce((a, x) => a * (REF.mult[x.outcome] ?? 1), 1);
  if (calls.length < R.need) m *= Math.pow(0.9, R.need - calls.length); // fewer than they asked for [design]
  const seg = deal.segmentId;
  if (seg && calls.some((x, i) => ['glowing', 'positive'].includes(x.outcome) && profs[i].segmentId === seg)) m *= 1.04; // a peer in their own segment
  // What the buyer was told about your customer base, checked with real customers; the website's claims via backchannel.
  const told = verify(state, { audience: 'customer', recipientId: deal.companyId, check: 'reference', filter: (c) => c.metric === 'customers' || c.metric === 'mrr' });
  const site = verify(state, { audience: 'customer', recipientId: 'website', check: 'backchannel', filter: (c) => ['customers', 'rating', 'reviews'].includes(c.metric) });
  const caught = [...told.caught, ...site.caught];
  if (caught.length) {
    m *= 0.5;
    penalize(state, caught, { audience: 'customer', functionId: 'deal_management', id: 'customer_claims_caught', label: 'Reference checks contradicted your customer claims', app: 'crm', detail: `${companyById(state, deal.companyId)?.name ?? 'The buyer'} spoke to your customers and looked you up.` });
  }
  R.calls = calls; R.mult = +clamp(m, 0.25, 1.3).toFixed(2); R.status = 'done'; R.doneDay = state.day;
  const bad = calls.filter((x) => ['lukewarm', 'negative', 'exposed'].includes(x.outcome));
  addActivity(state, { type: 'note', text: `Reference calls: ${calls.map((x) => `${x.name} ${LABEL[x.outcome]}`).join('; ')}`, dealId: deal.id, companyId: deal.companyId });
  if (bad.length) {
    logMistake(state, { functionId: 'deal_management', id: 'weak_reference', label: 'Put forward a reference who was not happy', app: 'crm', key: `ref:${deal.id}`, delayed: true, cost: { reputation: 0.3 * bad.length }, detail: `${bad.map((x) => `${x.name} (health ${x.health}/100) was ${LABEL[x.outcome]}`).join('; ')}. A stellar operator checks health, usage and open tickets first, briefs the reference, and offers 3-5 happy customers with measurable outcomes.` });
    notify(state, `Reference call went badly: ${bad.map((x) => x.name).join(', ')}.`, { type: 'bad', app: 'crm' });
  }
  return R.mult;
}

/**
 * At the buyer's decision. Returns { wait: true } while they wait for references, else { mult }.
 * Not answering a reference request is itself a signal (×0.7 after the wait).
 */
export function dealReferences(state, deal) {
  const R = deal.references;
  if (!R) return { mult: 1 };
  if (R.status === 'done') return { mult: R.mult ?? 1 };
  if (R.status === 'provided') return { mult: runCalls(state, deal) };
  if (R.status === 'requested') {
    if (!referencePool(state).length) { R.status = 'done'; R.mult = REF.mult.noCustomers; R.calls = []; return { mult: R.mult }; }
    if (!R.waited) { R.waited = true; deal.decisionDay = state.day + REF.waitDays; notify(state, `${companyById(state, deal.companyId)?.name ?? 'A buyer'} is waiting for customer references before deciding.`, { type: 'warn', app: 'crm' }); return { wait: true }; }
    R.status = 'done'; R.mult = REF.mult.none; R.calls = [];
    return { mult: R.mult };
  }
  return { mult: 1 };
}

/** RFP: the evaluation team calls the listed references before the award. → points added to the final score. */
export function rfpReferencePoints(state, bid) {
  if (bid.refCalls) return bid.refCalls.points;
  const calls = (bid.response?.refs ?? []).map((id) => referenceProfile(state, id)).filter(Boolean).map((p) => ({ customerId: p.customerId, name: p.name, health: p.health, ...referenceCall(state, p) }));
  const points = calls.reduce((a, x) => a + (REF.rfpPoints[x.outcome] ?? 0), 0);
  bid.refCalls = { day: state.day, calls, points };
  const bad = calls.filter((x) => ['lukewarm', 'negative', 'exposed'].includes(x.outcome));
  if (bad.length) logMistake(state, { functionId: 'rfp_bids', id: 'weak_reference', label: 'RFP reference was not happy', app: 'crm', key: `rfpref:${bid.id}`, delayed: true, cost: { reputation: 0.3 * bad.length }, detail: `${bid.buyer} called ${bad.map((x) => `${x.name} (health ${x.health}/100): ${LABEL[x.outcome]}`).join('; ')}. List references you have checked: healthy usage, no open escalations, briefed before the call.` });
  return points;
}

export const referenceLabel = (o) => LABEL[o] ?? o;
