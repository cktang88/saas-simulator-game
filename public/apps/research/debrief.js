// Truth-aware, delayed feedback. The game knows who each interviewee really was; the player does not. Every few
// completed conversations a debrief sets "what you think you learned" (what the board shows) beside "what you actually
// learned" (who they were, whether they had the problem, whether the commitments cost them anything), and the
// mistakes that follow from a wrong reading land a few days later, traceable to the decision that caused them.
//
// Mistakes (function customer_discovery): panel_fraud_unscreened and no_screener_wrong_people land here, priced at what
// those calls really cost. Decisions taken on the evidence (adopting a request, pricing from stated WTP) are recorded as
// bets (consequences.js) and logged only when the market fails to behave like the evidence said:
// adopted_outsider_request, overfit_single_customer, hypothetical_wtp_as_pricing, validated_with_friends, moved_goalposts.

import { logMistake } from '../../core/operator.js';
import { notify } from '../../core/state.js';
import { recordStatedWtp } from '../../core/market.js';
import { truthOf, featureValue, icpFocus } from '../../core/truth.js';
import { productSlice, newFeature } from '../product/store.js';
import { uid } from '../../core/util.js';
import { disc, median } from './store.js';
import { mvpSlice, presellCommitments } from '../mvp/model.js';
import { activeSubs } from '../../core/stripe.js';
import { COMMIT_RANK, CLOSE, personRows, enrichInsights } from './synthesis.js';
import { recordBet } from './consequences.js';
import { INTERVIEW_HOURS } from './recruit.js';

export const FN = 'customer_discovery';
export const DEBRIEF_EVERY = 5; // completed simulated conversations per debrief [design]
export const DEBRIEF_DELAY_DAYS = 2;

/** Queue a mistake to land `afterDays` from now (the consequence arrives later than the decision). */
export function queueMistake(state, afterDays, mistake) {
  const r = disc(state);
  if (mistake.key && (r.pending.some((p) => p.mistake.key === mistake.key) || state.mistakeKeys?.[mistake.key] != null)) return null;
  const p = { id: uid('pm'), dueDay: state.day + afterDays, mistake: { ...mistake, delayed: true } };
  r.pending.push(p);
  return p;
}

/** Land every queued mistake that is due. Called daily by the app and by tests. */
export function flushPending(state) {
  const r = disc(state);
  const due = r.pending.filter((p) => p.dueDay <= state.day);
  r.pending = r.pending.filter((p) => p.dueDay > state.day);
  return due.map((p) => {
    const m = logMistake(state, { ...p.mistake, day: state.day });
    if (m) notify(state, `${m.label}. ${m.detail}`, { type: 'bad', app: 'research' });
    return m;
  }).filter(Boolean);
}

const normAsk = (a) => String(a ?? '').toLowerCase().replace(/\W+/g, ' ').trim();

/**
 * Turn a customer's feature request into a draft feature. If you build one account's custom ask, or something an outsider
 * wanted, the market value comes from truth.featureValue (about 0 for the rest of the segment) and the mistake lands later.
 */
export function adoptRequest(state, insightId) {
  const r = disc(state);
  const ins = r.insights.find((i) => i.id === insightId);
  if (!ins || ins.evidenceType !== 'feature_wish') throw new Error('Pick an insight that is a feature request.');
  if (ins.adoptedFeatureId && productSlice(state).features.some((x) => x.id === ins.adoptedFeatureId)) throw new Error('You already drafted a feature from this request. Open it in Product.');
  const iv = r.interviews.find((x) => x.id === ins.interviewId);
  const ask = String(ins.ask ?? ins.text).slice(0, 200);
  const f = newFeature(state);
  Object.assign(f, { title: ask.slice(0, 80), user: iv?.persona?.role ?? '', problem: ask, solution: '', requestedBy: ins.interviewId, evidence: [ins.id], adoptedFromInsight: ins.id });
  productSlice(state).features.push(f);
  ins.adoptedFeatureId = f.id;
  const h = iv?.hidden;
  const accounts = new Set(r.insights.filter((i) => i.evidenceType === 'feature_wish' && !i.excluded && normAsk(i.ask ?? i.text) === normAsk(ask)).map((i) => i.interviewId));
  const fv = featureValue(state, f);
  const outsiderLike = h && (h.segmentId === 'outsider' || !h.isBuyer || ['investor', 'founder', 'friend'].includes(h.relationship) || h.fraud);
  let verdict = 'pattern';
  if (outsiderLike) verdict = 'outsider';
  else if (h?.idiosyncraticAsk && normAsk(h.idiosyncraticAsk) === normAsk(ask) && accounts.size < 3) verdict = 'single';
  // No mistake yet: the market decides. The truth is kept on the feature; if it ships and is not adopted, the 30-day
  // check logs adopted_outsider_request / overfit_single_customer with the build hours it actually took (consequences.js).
  if (verdict !== 'pattern') f.discoveryBasis = { kind: verdict, who: iv?.persona?.name ?? 'someone', accounts: accounts.size, why: verdict === 'outsider' ? (h.relationship === 'friend' ? 'was a friend' : 'was not a buyer or user in the segment that has the problem') : 'asked for their own setup' };
  return { feature: f, verdict, value: fv.value, idiosyncratic: fv.idiosyncratic, accounts: accounts.size };
}

/** Prices you could set from the interviews: what people SAY they would pay vs what they PAY today. */
export function wtpEvidence(state) {
  enrichInsights(state);
  const ins = disc(state).insights.filter((i) => !i.excluded && !i.rehearsal && Number.isFinite(i.amount) && i.amount > 0);
  const stated = ins.filter((i) => i.stated || i.evidenceType === 'hypothetical').map((i) => i.amount);
  const spend = ins.filter((i) => i.evidenceType === 'workaround_cost' && !CLOSE.has(i.relationship)).map((i) => i.amount);
  return { stated: median(stated), statedN: stated.length, spend: median(spend), spendN: spend.length };
}

/**
 * Set the price expectation from interviews. basis 'spend' prices below what the workaround already costs (behaviour);
 * basis 'stated' uses hypothetical answers, which run ~1.35x too high [design] and arrive with a delayed mistake.
 */
export function priceFromWtp(state, basis) {
  const e = wtpEvidence(state);
  if (basis === 'stated') {
    if (e.stated == null) throw new Error('Nobody named a price in your interviews.');
    recordStatedWtp(state, Math.round(e.stated), { notes: `Median of ${e.statedN} hypothetical answers from interviews`, source: 'interviews' });
    // The market answers this: if the published price sits above what buyers really pay, conversion comes in low and the
    // measured cost is logged then (consequences.js settlePrice). If it happens to be right, nothing is logged.
    recordBet(state, { kind: 'price', price: Math.round(e.stated), n: e.statedN, basis: 'stated', key: `price:stated:${Math.floor(state.day / 30)}` });
    return { price: Math.round(e.stated), basis, n: e.statedN };
  }
  if (e.spend == null) throw new Error('No one has told you what they pay today. Ask what the workaround costs them.');
  return { price: Math.round(e.spend * 0.8), basis: 'spend', n: e.spendN };
}

/** Revealed willingness to pay exists: someone paid, deposited, pre-ordered, or paid for concierge/design-partner delivery. */
export function hasRevealedWtp(state) {
  if (presellCommitments(state) > 0) return true;
  if (activeSubs(state).length > 0) return true;
  return mvpSlice(state).experiments.some((e) => e.results && ((e.results.paid ?? 0) > 0 || (e.results.payRate?.k ?? 0) > 0 || e.results.wtp));
}

/**
 * Called when the player publishes prices in Pricing. If a price lands on what people SAID they would pay (panel or
 * interview stated WTP) and nothing revealed backs it, log hypothetical_wtp_as_pricing, same as the Synthesis tab does.
 */
export function checkStatedPricing(state, prices = []) {
  const fp = state.market?.fit?.price;
  const anchors = [fp?.stated, wtpEvidence(state).stated].filter((x) => Number.isFinite(x) && x > 0);
  if (!anchors.length || hasRevealedWtp(state)) return null;
  const hit = anchors.find((a) => prices.some((p) => p >= 0.75 * a && p <= 1.3 * a));
  if (hit == null) return null;
  return recordBet(state, { kind: 'price', price: Math.round(hit), n: wtpEvidence(state).statedN || null, basis: 'stated', key: `price:stated:${Math.floor(state.day / 30)}` });
}

// ---------------------------------------------------------------- debrief

const earning = (iv) => iv.hs?.questionTypes?.filter((t) => ['past_specific', 'open_followup', 'price_current'].includes(t)).length ?? 0;

/**
 * Compare what the board says with the truth for a set of simulated conversations. Returns the debrief record
 * (also stored) and queues the delayed mistakes that the pattern deserves.
 */
export function runDebrief(state, ivs) {
  const r = disc(state);
  const t = truthOf(state);
  const focus = icpFocus(state);
  const target = new Set(focus.segmentIds?.length && !focus.diffuse ? focus.segmentIds : [t.bestSegmentId]);
  const rows = personRows(state);
  const rowOf = Object.fromEntries(rows.map((p) => [p.id, p]));
  const facts = ivs.map((iv) => {
    const h = iv.hidden; const row = rowOf[iv.id];
    return {
      iv, h, row, excluded: !!iv.excluded, close: CLOSE.has(h.relationship) || h.relationship === 'friend', inSegment: target.has(h.segmentId), best: h.segmentId === t.bestSegmentId,
      outsider: h.segmentId === 'outsider', fraud: !!h.fraud && !iv.unmasked, unmasked: !!iv.unmasked, pain: !!h.hasPain && !h.fraud,
      positive: row ? row.positive >= 0.5 : false, commit: COMMIT_RANK[iv.grade?.commitments?.[0] ?? 'none'] ?? 0,
    };
  });
  const counted = facts.filter((f) => !f.excluded && !f.unmasked);
  const thought = counted.filter((f) => f.positive || f.commit >= 1 || f.row?.behaviour);
  const real = counted.filter((f) => f.pain && !f.close && f.inSegment && (f.row?.behaviour ?? false));
  const friendsPos = counted.filter((f) => f.close && f.positive);
  const outsiders = counted.filter((f) => f.outsider || !f.inSegment);
  const fraud = counted.filter((f) => f.fraud);
  const realCommits = counted.filter((f) => f.commit >= COMMIT_RANK.intro && f.pain && !f.close && f.inSegment && !f.fraud);
  const fluffCommits = counted.filter((f) => f.commit >= COMMIT_RANK.intro && !(f.pain && !f.close && f.inSegment) );
  const lines = [];
  lines.push(`You thought: ${thought.length} of ${counted.length} conversations looked like interest.`);
  lines.push(`Actually: ${real.length} were in-segment strangers who really had the problem and described it.`);
  if (friendsPos.length) lines.push(`${friendsPos.length} enthusiastic ${friendsPos.length === 1 ? 'person was a' : 'people were'} friend${friendsPos.length === 1 ? '' : 's'}, family or warm contact${friendsPos.length === 1 ? '' : 's'}: politeness, not demand (their pain rate was no higher than strangers').`);
  if (outsiders.length) lines.push(`${outsiders.length} ${outsiders.length === 1 ? 'was' : 'were'} outside the segment that actually feels this (${outsiders.filter((f) => f.outsider).length} outside the market entirely).`);
  if (fraud.length) lines.push(`${fraud.length} ${fraud.length === 1 ? 'was a' : 'were'} professional respondent${fraud.length === 1 ? '' : 's'} from the panel; their fluent answers were not real experience.`);
  if (fluffCommits.length) lines.push(`${fluffCommits.length} commitment${fluffCommits.length === 1 ? '' : 's'} came from people who could not become customers: they cost nothing and mean nothing.`);
  if (realCommits.length) lines.push(`${realCommits.length} real commitment${realCommits.length === 1 ? '' : 's'} from the right people: this is what to count.`);
  const lowQuality = counted.filter((f) => earning(f.iv) < 2).length;
  const coaching = [];
  if (friendsPos.length >= 2) coaching.push('A stellar operator interviews strangers who match the target and counts friends separately, or not at all.');
  if (outsiders.length >= Math.ceil(counted.length / 3)) coaching.push('Write a narrower target (role, kind of company, size) and a screener that asks about a specific recent event, so outsiders never get on the calendar.');
  if (fraud.length) coaching.push('On a panel, screen on what they did last month and verify role and numbers early in the call.');
  if (lowQuality >= 2) coaching.push('Several calls had fewer than two past-behaviour questions; hypotheticals and pitches earn politeness, not facts.');
  const mistakes = [];
  // Already paid for (the calls happened): logged at their measured cost, not charged again.
  const mk = (m) => { const q = queueMistake(state, DEBRIEF_DELAY_DAYS + 2, { functionId: FN, app: 'research', charge: false, ...m }); if (q) mistakes.push(m.id); };
  const callHours = (list) => Math.round(list.length * (INTERVIEW_HOURS.call + INTERVIEW_HOURS.notes + INTERVIEW_HOURS.scheduling) * 10) / 10;
  const batchKey = ivs.map((i) => i.id).sort().join('|');
  if (fraud.length && counted.filter((f) => f.fraud && (f.iv.recruit?.screenerQuality ?? 0) < 0.5).length) mk({ id: 'panel_fraud_unscreened', label: 'Panel respondents were never screened', cost: { hours: callHours(fraud), usd: Math.round(fraud.reduce((a, f) => a + (f.iv.recruit?.incentive ?? 0) + (f.iv.recruit?.fee ?? 0), 0)) }, key: `fraud:${batchKey}`, detail: `${fraud.length} of ${counted.length} panel interviews were professional respondents (fluent, confident, never a buyer). With no real screener you paid for and analysed their answers.`, lesson: 'A screener asking for a specific recent event, and a role check early in the call, catches most of them.' });
  const unscreened = counted.filter((f) => (f.iv.recruit?.screenerQuality ?? 0) < 0.3);
  const wrongPpl = unscreened.filter((f) => f.outsider || !f.inSegment);
  if (unscreened.length >= 3 && wrongPpl.length / unscreened.length >= 0.4) mk({ id: 'no_screener_wrong_people', label: 'No screener: you talked to the wrong people', cost: { hours: callHours(wrongPpl), usd: Math.round(wrongPpl.reduce((a, f) => a + (f.iv.recruit?.incentive ?? 0) + (f.iv.recruit?.fee ?? 0), 0)) }, key: `wrongppl:${batchKey}`, detail: `${unscreened.filter((f) => f.outsider || !f.inSegment).length} of ${unscreened.length} people recruited without a real screener were outside the segment that feels this problem. Their answers may already be in your notes.`, lesson: 'Write a screener that asks about a specific recent event so outsiders never get on the calendar.' });
  // Friends' enthusiasm is coaching here; it costs you when a decision is built on it (a hypothesis called validated,
  // a feature built on their praise), and that is where it is logged (consequences.js).
  if (friendsPos.length >= 3 && friendsPos.length >= Math.ceil(thought.length / 2) && real.length <= 1) coaching.push(`${friendsPos.length} of the ${thought.length} conversations that looked like interest were friends or warm contacts, and only ${real.length} stranger in your target described a real, recent problem. Set the friends' calls aside before you decide anything.`);
  const verdict = real.length >= Math.ceil(counted.length / 2) && !mistakes.length ? 'sound' : mistakes.length || real.length <= 1 ? 'misled' : 'mixed';
  const committed = counted.filter((f) => f.commit >= COMMIT_RANK.intro).length;
  const mine = [lines[0], ...(committed ? [`${committed} conversation${committed === 1 ? '' : 's'} ended with a commitment of some kind.`] : [])]; // what the founder could observe
  const d = { id: uid('dbf'), day: state.day, ivIds: ivs.map((i) => i.id), n: counted.length, mine, thought: thought.length, real: real.length, friends: friendsPos.length, outsiders: outsiders.length, fraud: fraud.length, realCommits: realCommits.length, fluffCommits: fluffCommits.length, lines, coaching, mistakes, verdict };
  r.debriefs.unshift(d);
  for (const iv of ivs) iv.debriefed = d.id;
  notify(state, `Interview debrief (${counted.length} calls): ${thought.length} looked like interest to you. Open Interviews for the debrief.`, { type: verdict === 'sound' ? 'good' : 'warn', app: 'research' });
  return d;
}

/** Called daily: after DEBRIEF_EVERY new completed simulated calls (and a short delay) the game tells the truth. */
export function maybeDebrief(state, { force = false } = {}) {
  const r = disc(state);
  const fresh = r.interviews.filter((i) => i.sim && i.status === 'done' && !i.debriefed);
  if (fresh.length < DEBRIEF_EVERY && !(force && fresh.length)) return null;
  const last = Math.max(...fresh.map((i) => i.doneDay ?? 0));
  if (!force && state.day < last + DEBRIEF_DELAY_DAYS) return null;
  return runDebrief(state, fresh);
}
