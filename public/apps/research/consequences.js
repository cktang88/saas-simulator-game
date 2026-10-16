// Consequence tracing for customer-discovery decisions. Nothing here fires on a label ("that was a leading question",
// "that answer was a compliment"). A discovery mistake is logged only when the decision built on it meets the market
// and the market does not behave like the evidence said: a feature built on polite agreement ships and is not adopted,
// a price set from hypothetical answers converts below what it would at the price people really pay, a lead counted
// as demand never commits, a hypothesis called validated on thin evidence turns out to describe a segment without the
// problem after you built for it. The cost is what was actually spent (build hours, hours on the deal, customers
// lost), measured at that moment, and it is NOT charged again (it was already paid).
//
// Bets live in state.apps.research.bets: { id, kind, day, status: 'open'|'confirmed'|'failed'|'dropped', ...refs }.
// settleBets(state) runs daily (research onDay). traceFeatureOutcome(state, f) runs at a feature's 30-day check.
// Windows are [design] assumptions.

import { uid } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { mainPlan, monthlyPrice, priceFactor, hasProduct } from '../../core/market.js';
import { truthOf, painStrength, segmentMatch } from '../../core/truth.js';
import { disc } from './store.js';

export const FN = 'customer_discovery';
export const BET = {
  priceDays: 30, priceMaxDays: 180, // measure a price after 30 days live, give up after ~6 months without a product
  demandDays: 45, // a lead counted as demand: 45 days to commit or it was a compliment
  validatedDays: 45, validatedMaxDays: 180,
  signupDays: 45, signupMaxDays: 180,
  strongPain: 0.2, // segment pain strength (prevalence x intensity) that counts as "the problem is real there"
  // Founder hours per CRM activity type, to measure time spent chasing a lead [design, ARCHITECTURE.md time costs].
  activityHours: { call: 0.75, meeting: 0.75, email: 0.15, linkedin: 0.1, note: 0.05, proposal: 1.5, task: 0.1 },
};

const bets = (state) => (disc(state).bets ??= []);

/** Record a decision taken on evidence that may not be true. Idempotent by key. */
export function recordBet(state, bet) {
  const list = bets(state);
  if (bet.key && list.some((b) => b.key === bet.key)) return null;
  const b = { id: uid('bet'), day: state.day ?? 0, status: 'open', ...bet };
  list.push(b);
  return b;
}

function fail(state, b, mistake) {
  b.status = 'failed'; b.settledDay = state.day;
  const m = logMistake(state, { functionId: FN, app: 'research', delayed: true, charge: false, key: `bet:${b.id}`, ...mistake });
  if (m) { b.mistakeUid = m.uid; notify(state, `${m.label}. ${m.detail}`, { type: 'bad', app: mistake.app ?? 'research' }); }
  return m;
}
const confirm = (state, b, note = '') => { b.status = 'confirmed'; b.settledDay = state.day; b.note = note; return null; };
const drop = (state, b, note = '') => { b.status = 'dropped'; b.settledDay = state.day; b.note = note; return null; };

const productFeatures = (state) => state.apps?.product?.features ?? [];
/** Effective build hours that went into features started on or after `day` (what the decision led you to build). */
export function buildHoursSince(state, day) {
  return Math.round(productFeatures(state).filter((f) => (f.createdDay ?? 0) >= day && !f.system).reduce((a, f) => a + (f.status === 'shipped' ? f.effortHours ?? f.progressHours ?? 0 : f.progressHours ?? 0), 0) * 10) / 10;
}
const subsSince = (state, day) => (state.stripe?.subscriptions ?? []).filter((s) => (s.startDay ?? 0) >= day);

// ------------------------------------------------------------------------------------------------ features

/**
 * At a shipped feature's 30-day check: if it missed and its case rested on discovery evidence that was not true (polite
 * agreement, an opinion, one account's own ask, an outsider's wish), log the matching mistake with the build hours and
 * days it really took. A feature that hit is fine, however thin its evidence was.
 */
export function traceFeatureOutcome(state, f) {
  if (!f?.check || f.check.verdict === 'hit' || f.discoveryTraced) return null;
  const ins = (state.apps?.research?.insights ?? []).filter((i) => (f.evidence ?? []).includes(i.id) && !i.excluded);
  const falseBeliefs = ins.filter((i) => i._truth && !i._truth.holds && (i.belief || i.evidenceType === 'compliment' || i.evidenceType === 'hypothetical' || i.evidenceType === 'opinion'));
  const opinions = ins.filter((i) => i.opinionSignalId);
  const basis = f.discoveryBasis ?? null;
  if (!basis && !opinions.length && !(falseBeliefs.length && falseBeliefs.length * 2 >= ins.length)) return null;
  f.discoveryTraced = true;
  const hours = Math.round((f.effortHours ?? f.progressHours ?? 0) * 10) / 10;
  const days = Math.max(0, (f.shippedDay ?? state.day) - (f.createdDay ?? f.shippedDay ?? state.day));
  const got = f.check.text ? ` 30 days live: ${f.check.text}` : '';
  const b = recordBet(state, { kind: 'feature', featureId: f.id, key: `feature:${f.id}`, day: f.createdDay ?? state.day });
  if (!b) return null;
  const cost = { hours, days };
  if (basis?.kind === 'outsider') return fail(state, b, { id: 'adopted_outsider_request', label: 'Built what an outsider asked for', app: 'product', cost, detail: `"${f.title}" came from ${basis.who ?? 'someone'}'s request and took ${hours} build hours over ${days} days.${got}`, lesson: `${basis.who ?? 'They'} ${basis.why ?? 'was not a buyer in the segment that has the problem'}. People outside the customer can sound keen and never pay; build what strangers in your target segment describe doing.` });
  if (basis?.kind === 'single') return fail(state, b, { id: 'overfit_single_customer', label: 'Overfit to one customer\'s ask', app: 'product', cost, detail: `"${f.title}" was one account's custom request (${basis.accounts ?? 1} account${(basis.accounts ?? 1) === 1 ? '' : 's'} asked). It took ${hours} build hours and the rest of the market does not use it.${got}`, lesson: 'A loud single customer\'s custom request is worth little to everyone else. Wait for the same ask from several target customers.' });
  if (basis?.kind === 'partner') return fail(state, b, { id: 'overfit_to_design_partner', label: `Built ${basis.who ?? 'one partner'}'s request for everyone`, app: 'mvp', circles: true, cost, detail: `"${f.title}" came from one design partner and took ${hours} build hours.${got}`, lesson: 'A request fewer than two partners share, matching no job of the segment, is a custom project for one account.' });
  if (opinions.length) return fail(state, b, { id: 'opinion_as_validation', label: 'Treated an opinion as validation', app: 'product', cost, detail: `"${f.title}" cited ${opinions.length} opinion${opinions.length === 1 ? '' : 's'} (${opinions.map((i) => i.who).slice(0, 2).join(', ')}) as evidence and took ${hours} build hours.${got}`, lesson: 'Investors, advisors, founders and friends give opinions about the idea; they do not have the problem. Count people with the problem who described a recent incident or paid.' });
  const quote = falseBeliefs[0]?.text ? `"${String(falseBeliefs[0].text).slice(0, 90)}"` : 'polite agreement';
  return fail(state, b, { id: 'compliments', label: 'Built on compliments', app: 'product', cost, detail: `"${f.title}" rested on ${falseBeliefs.length} answer${falseBeliefs.length === 1 ? '' : 's'} like ${quote} from people who, it turns out, do not have the need. ${hours} build hours over ${days} days.${got}`, lesson: 'Agreement with a hypothetical, leading or pitching question is what people say to be nice. Ask about the last time it happened; build on what they did and paid.' });
}

// ------------------------------------------------------------------------------------------------ settle daily

function settlePrice(state, b) {
  const age = state.day - b.day;
  const plan = mainPlan(state);
  const live = plan ? monthlyPrice(plan) : null;
  if (!plan || !hasProduct(state)) return age > BET.priceMaxDays ? drop(state, b, 'no product or price went live') : null;
  if (live < 0.7 * b.price || live > 1.4 * b.price) return b.liveSince != null || age > BET.priceMaxDays ? drop(state, b, 'price changed before it was measured') : null;
  b.liveSince ??= state.day;
  if (state.day - b.liveSince < BET.priceDays) return null; // measure 30 days of the price actually live
  const pf = priceFactor(state, plan);
  if (pf >= 0.85) return confirm(state, b, 'price at or under what buyers really pay');
  // Trial starts scale with sqrt(priceFactor) (core/market.js landingConversion): the share of sign-ups this price cost.
  const kept = Math.sqrt(Math.max(0.05, pf));
  const n = subsSince(state, b.liveSince).length;
  const lost = Math.max(1, Math.round(n * (1 / kept - 1)));
  return fail(state, b, { id: 'hypothetical_wtp_as_pricing', label: 'Priced from what people said they would pay', app: 'pricing', cost: { customers: lost, days: state.day - b.liveSince }, detail: `You priced at about $${Math.round(live)}/mo from ${b.n ?? 'a few'} "would pay" answers. In ${state.day - b.liveSince} days live, ${n} customer${n === 1 ? '' : 's'} signed up; at what buyers actually pay, about ${Math.round(100 * (1 - kept))}% more visitors would have started (~${lost} customer${lost === 1 ? '' : 's'} lost).`, lesson: 'Stated willingness to pay runs well above what people pay. Price from what they already spend on the workaround, or from a deposit or paid pilot.' });
}

function settleDemand(state, b) {
  const crm = state.apps?.crm;
  const asks = crm?.presell?.asks ?? [];
  const committed = asks.some((a) => a.contactId === b.contactId && a.day >= b.day && a.outcome === 'committed' && a.level !== 'verbal');
  const deal = (crm?.deals ?? []).find((d) => d.id === b.dealId);
  if (committed || deal?.stage === 'won') return confirm(state, b, 'they committed after all');
  const lost = deal?.stage === 'lost';
  if (!lost && state.day - b.day < BET.demandDays) return null;
  const acts = (crm?.activities ?? []).filter((a) => a.day >= b.day && ((b.dealId && a.dealId === b.dealId) || (b.contactId && a.contactId === b.contactId)));
  const hours = Math.round(acts.reduce((x, a) => x + (BET.activityHours[a.type] ?? 0.1), 0) * 10) / 10;
  return fail(state, b, { id: 'compliments', label: 'Counted a compliment as demand', app: 'crm', cost: { hours, days: state.day - b.day }, detail: `${b.who ?? 'The prospect'} said "${String(b.response ?? '').slice(0, 100)}" and you counted it as demand. ${state.day - b.day} days later: ${lost ? 'the deal is lost' : 'no commitment'}, after ${acts.length} touch${acts.length === 1 ? '' : 'es'} (~${hours} h) chasing it.`, lesson: 'A compliment costs nothing to give. Count commitments (money, a signature, an intro), not compliments.' });
}

/** Is the problem real in the segments a hypothesis names (hidden truth)? */
function hypothesisTrue(state, customer) {
  const t = truthOf(state);
  const m = segmentMatch(state, customer);
  const top = m[0]?.score ?? 0;
  const segs = m.filter((x) => x.score >= Math.max(0.2, top - 0.02)).map((x) => t.segments.find((s) => s.id === x.segmentId)).filter(Boolean); // the segment(s) it names
  if (!segs.length) return false;
  return Math.max(...segs.map(painStrength)) >= BET.strongPain;
}

function settleValidated(state, b) {
  const age = state.day - b.day;
  if (age < BET.validatedDays) return null;
  if (hypothesisTrue(state, b.customer)) return confirm(state, b, 'the segment really has the problem');
  const hours = buildHoursSince(state, b.day);
  if (hours <= 0) return age > BET.validatedMaxDays ? drop(state, b, 'nothing was built on it') : null;
  const moved = b.loosened;
  return fail(state, b, { id: moved ? 'moved_goalposts' : 'validated_with_friends', label: moved ? 'Moved the goalposts, then built on it' : 'Called it validated without the evidence', circles: true, cost: { hours, days: age }, detail: `You declared "${b.customer}" validated${moved ? ' after loosening the pass criteria' : ' though your own criteria were not met'} (${b.summary ?? 'evidence short of the bar'}). In the ${age} days since, ${hours} build hours went into a segment where the problem turns out not to be strong enough to pay for.`, lesson: 'Criteria set before the data are a test; bent or skipped, they are a story. Count screened strangers who described a recent incident or committed.' });
}

function settleSignups(state, b) {
  const age = state.day - b.day;
  if (age < BET.signupDays) return null;
  const hours = buildHoursSince(state, b.day);
  const paid = subsSince(state, b.day).length;
  if (paid >= Math.max(1, Math.round(0.1 * (b.signups ?? 0)))) return confirm(state, b, 'the list converted');
  if (hours <= 0 || !hasProduct(state)) return age > BET.signupMaxDays ? drop(state, b, 'nothing launched') : null;
  return fail(state, b, { id: 'email_signup_as_demand', label: 'Took email signups as demand', app: 'mvp', cost: { hours, days: age }, detail: `You went ahead on "${b.name}" with ${b.signups ?? 0} email signups${b.network ? ', mostly from your own network' : ''}. ${age} days and ${hours} build hours later, ${paid} paying customer${paid === 1 ? '' : 's'}.`, lesson: 'Signing up is free and polite. Ask for money (a deposit, a pre-order) before you build on a list.' });
}

const SETTLE = { price: settlePrice, demand: settleDemand, validated: settleValidated, signups: settleSignups };

/** Daily: settle every open bet whose consequence has arrived. Returns the mistakes logged today. */
export function settleBets(state) {
  const list = state.apps?.research?.bets;
  if (!list?.length) return [];
  const out = [];
  for (const b of list) {
    if (b.status !== 'open' || !SETTLE[b.kind]) continue;
    const m = SETTLE[b.kind](state, b);
    if (m) out.push(m);
  }
  return out;
}
