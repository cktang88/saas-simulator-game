// Offer negotiation. After an offer, candidates may counter (salary, equity, sign-on, start date, remote); some hold a
// competing offer or get a counteroffer from their employer. The founder can accept the counter, counter back, offer a
// cash/equity menu, add a sign-on, set an exploding deadline or walk away. Every step is a player action that costs hours
// (NEG.hours, charged by the UI through ctx.act).
//
// Consequences: lowballing gets a yes but a higher-attrition, lower-morale hire; overpaying opens a pay-equity problem with
// the team and burns cash; an exploding offer against a candidate with a competing offer loses them; a counter nobody answers
// expires; an accepted candidate can renege before the start date. Posting no pay range where the law requires one logs a
// mistake and may draw a fine.
//
// Randomness: only per-candidate streams (streamFor), never the main rng(state), so existing seeded flows are unchanged.

import { rangeQuality, RANGE } from './integrity.js';
import { notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { clamp, round2, dateOf, fmtDate, rng } from '../../core/util.js';
import { newThread, addMessage, findThread } from '../../core/mail.js';
import { streamFor } from './global.js';
import { NEG, PAY_LAWS, EU_PAY, packageScore, CITIES } from './ops-data.js';
import { ensureOps, emitOps, employeesOf, humansOf } from './ops-state.js';
import { entityOf } from '../legal/api.js';
import { getNegotiation } from '../../core/negotiation.js';
import { BASE_ATTRITION_MONTHLY, JOB_ROLES } from './catalog.js';
import { poolUsed } from './pool.js'; // pool in use counts departed members' vested options, as makeOffer does

const U = rng; // a stream from streamFor(state, salt) has the same shape as the state rng uses
export const streamU = U;

/** Hidden household: about 40% of candidates weigh family coverage [design]. */
export const householdOf = (state, c) => c.household ?? (rng(streamFor(state, `hh|${c.id}`)) < 0.4 ? 'family' : 'single');
export const seniorityOf = (c) => c.seniority ?? ((c.years ?? 4) >= 7 ? 'senior' : (c.years ?? 4) <= 3 ? 'junior' : 'mid');
const isTech = (c) => ['engineer', 'ai_engineer', 'designer'].includes(c.role);
const unit = (c) => (c.engagement === 'contractor' ? 'hourlyRate' : 'salary');
const pay = (o, c) => (c.engagement === 'contractor' ? o.hourlyRate : o.salary);

/** Chance a candidate counters this offer (pure). */
export function counterProbability(c, o) {
  const ask = o.expectation ?? c.expectation;
  const ratio = pay(o, c) / Math.max(1, ask);
  const k = NEG.counter;
  const p = k.base + k.perGapBelowAsk * Math.max(0, 0.98 - ratio) + (seniorityOf(c) === 'senior' ? k.senior : 0) + (c.persona?.otherOffers ? k.inDemand : 0) + (isTech(c) ? k.technical : 0) - (ratio > 1.08 ? k.aboveAskDamp : 0);
  return round2(clamp(p, 0.04, 0.85));
}

// Value to the candidate of a package, in annual dollars (base + half the sign-on + counted share of paper equity).
export const equityUsd = (state, pct) => pct * NEG.equityPerPctUsd;
export function packageValue(state, c, t) {
  const disc = c.persona?.concern === 'equity upside' ? NEG.equityDiscount.upsidePersona : NEG.equityDiscount.default;
  return (t.salary ?? 0) + (t.signOn ?? 0) * NEG.signOnValue + equityUsd(state, t.equityPct ?? 0) * disc;
}
/** Sign-on as base-equivalent for acceptProbability. */
export const signOnBoost = (o) => (o.signOn ?? 0) * NEG.signOnValue;

function hasWorkplaceTension(state, c) {
  const wp = state.apps.people?.ops?.workplace;
  const job = state.apps.people?.jobs?.find((j) => j.id === c.jobId);
  return Boolean(job && job.remote === false && wp?.mode);
}

/** Called when an offer is sent: set up the negotiation context (competing offer, employer counteroffer). */
export function negotiationOnOffer(state, c, o) {
  const n = (c.negotiation ??= { status: 'none', round: 0, history: [] });
  n.status = 'none';
  n.round = 0;
  n.history = [];
  const S = streamFor(state, `neg|${c.id}|ctx`);
  if (!n.competing && c.persona?.otherOffers) {
    n.competing = { respondIn: 3 + Math.floor(U(S) * 6), ratio: round2(1 + 0.02 + U(S) * 0.1) };
  } else U(S);
  const ec = NEG.employerCounter;
  if (!n.employerCounter && c.engagement !== 'contractor' && U(S) < (seniorityOf(c) === 'senior' ? ec.seniorChance : ec.chance)) {
    n.employerCounter = { raise: round2(ec.raise[0] + U(S) * (ec.raise[1] - ec.raise[0])) };
  }
  if (o.deadlineDays != null) setDeadlineInternal(state, c, o.deadlineDays);
  return n;
}

function setDeadlineInternal(state, c, days) {
  const o = c.offer;
  const d = clamp(Math.round(days), 1, 14);
  o.deadlineDays = d;
  o.deadlineDay = state.day + d;
  o.decideDay = Math.min(o.decideDay, state.day + d);
}

const threadFor = (state, c) => findThread(state, c.id) ?? newThread(state, { subject: `Offer: ${c.name}`, with: { name: c.name, email: c.email }, kind: 'candidate', app: 'people', refId: c.id });
const say = (state, c, from, body) => addMessage(state, threadFor(state, c).id, { from, body });

function logNeg(state, c, kind, data = {}) {
  const log = ensureOps(state).neg.log;
  log.push({ day: state.day, candidateId: c.id, kind, ...data });
  if (log.length > 300) log.splice(0, log.length - 300);
  (c.negotiation.history ??= []).push({ day: state.day, kind, ...data });
}

function buildCounter(state, c, o) {
  const S = streamFor(state, `neg|${c.id}|ask|${c.negotiation.round}`);
  const contractor = c.engagement === 'contractor';
  const sen = seniorityOf(c);
  const ask = o.expectation ?? c.expectation;
  const offered = pay(o, c);
  const spread = NEG.askSpread * (U(S) - 0.5) * 2;
  const g = NEG.gain[sen] * 0.8 + spread;
  const base = Math.max(ask * 1.0, offered * (1 + g));
  const want = {};
  want[unit(c)] = contractor ? Math.round(Math.min(base, ask * 1.15)) : Math.round(Math.min(base, ask * 1.15) / 500) * 500;
  const items = [];
  // Near their number: they ask for something other than base more often.
  const near = offered / Math.max(1, ask) >= 0.98;
  if (!contractor) {
    const bench = (JOB_ROLES[c.role]?.equityBench ?? 0.3);
    if ((o.equityPct ?? 0) < bench * 0.7 && U(S) < (c.persona?.concern === 'equity upside' ? 0.7 : 0.3)) { want.equityPct = round2(Math.min(bench, (o.equityPct ?? 0) + bench * 0.3)); items.push('equity'); } else U(S);
    if (U(S) < (near ? 0.4 : 0.25)) { want.signOn = Math.round((offered * 0.06) / 500) * 500; items.push('sign-on'); }
  } else { U(S); U(S); }
  if (U(S) < 0.22) { want.startDay = o.startDay + 14 + Math.floor(U(S) * 14); items.push('start date'); } else U(S);
  if (hasWorkplaceTension(state, c) && U(S) < (c.persona?.concern === 'remote flexibility' ? 0.55 : 0.2)) { want.remote = true; items.push('remote flexibility'); }
  if (near && !items.length && !contractor) { want.signOn = Math.round((offered * 0.05) / 500) * 500; items.push('sign-on'); }
  return { want, items: ['base', ...items] };
}

/**
 * Called by decideOffer before the accept/decline roll. Returns { action: 'decide' } to continue, { action: 'wait' } while a
 * counter is open, or { action: 'decline', reason } when the candidate leaves (expired counter, exploding offer).
 */
export function negotiationGate(state, p, c) {
  const o = c.offer;
  const n = (c.negotiation ??= { status: 'none', round: 0, history: [] });
  if (n.skip) return { action: 'decide' };
  // A multi-round negotiation (apps/negotiate/hiring.js) is open: the engine owns the clock (it expires and declines on its own).
  if (n.engineId && getNegotiation(state, n.engineId)?.status === 'open') return { action: 'wait' };
  if (n.status === 'countered') {
    if (state.day - n.counterDay > NEG.expireDays) {
      logNeg(state, c, 'expired');
      logMistake(state, { functionId: 'people_ops', id: 'negotiation_stalled', label: 'Left a candidate\'s counter unanswered', app: 'people', cost: { hours: 6, days: 21 }, delayed: true, key: `neg-stall:${c.id}`, detail: `${c.name} countered and heard nothing for ${NEG.expireDays}+ days, so they ${c.negotiation.competing ? 'took the other offer' : 'lost interest'}. Answer a counter within a day or two; a strong candidate has a deadline of their own.` });
      return { action: 'decline', reason: c.negotiation.competing ? 'I took another offer while waiting to hear back.' : 'I\'ve lost momentum waiting for a reply and am staying where I am.', cause: 'stalled' };
    }
    return { action: 'wait' };
  }
  if (n.status === 'none' && n.round === 0 && !n.rolled) {
    n.rolled = true;
    const S = streamFor(state, `neg|${c.id}|counter`);
    // An exploding deadline shorter than the time they need to hear back from others: they decline rather than accept blind.
    if (o.deadlineDays != null && n.competing && o.deadlineDays < Math.min(NEG.explode.minDays, n.competing.respondIn) + (n.competing.respondIn > 5 ? 2 : 0) && U(S) < NEG.explode.lostIfCompeting) {
      logNeg(state, c, 'exploded');
      logMistake(state, { functionId: 'people_ops', id: 'exploding_offer_lost_candidate', label: 'Exploding offer lost the candidate', app: 'people', cost: { hours: 8, days: 28 }, delayed: true, key: `explode:${c.id}`, detail: `${c.name} had another offer to hear back on (about ${n.competing.respondIn} days) and your ${o.deadlineDays}-day deadline gave no time to compare. A short deadline works when they have no alternatives; against a competing offer it just ends the conversation. The search restarts.` });
      return { action: 'decline', reason: `A ${o.deadlineDays}-day deadline doesn't give me time to decide properly, so I'll have to pass.`, cause: 'exploded' };
    }
    if (U(S) < counterProbability(c, o)) {
      n.round = 1;
      n.status = 'countered';
      n.counterDay = state.day;
      n.counter = buildCounter(state, c, o);
      logNeg(state, c, 'countered', { want: n.counter.want });
      emitOps(state, 'offer_countered', c.id, { candidateId: c.id, name: c.name, role: c.role, label: `${c.name} countered your offer` });
      const w = n.counter.want;
      const asks = n.counter.items.join(', ');
      say(state, c, 'them', `Thanks for the offer, I'm excited about this. To get to a yes I'd need: ${w.salary ? `base at $${w.salary.toLocaleString('en-US')}` : `$${w.hourlyRate}/hour`}${w.equityPct ? `, ${w.equityPct}% equity` : ''}${w.signOn ? `, a $${w.signOn.toLocaleString('en-US')} sign-on` : ''}${w.startDay ? `, a start on ${fmtDate(state, w.startDay)}` : ''}${w.remote ? ', and flexibility to work remotely' : ''}. ${n.competing ? 'I have another conversation in progress, so I would like to decide soon.' : ''}`);
      notify(state, `${c.name} countered your offer (${asks}). Answer in People → their page; they will not wait more than ${NEG.expireDays} days.`, { type: 'warn', app: 'people' });
      return { action: 'wait' };
    }
  }
  return { action: 'decide' };
}

/** Adjust the standard acceptance probability for what happened in the negotiation, the benefits package and the workplace. */
export function adjustAcceptProb(state, c, prob) {
  const n = c.negotiation;
  const o = c.offer;
  let p = prob;
  const ask = o.expectation ?? c.expectation;
  const eff = (pay(o, c) + (c.engagement === 'contractor' ? 0 : signOnBoost(o))) / Math.max(1, ask);
  if (n) {
    if (n.competing && eff < n.competing.ratio) p -= clamp(((n.competing.ratio - eff) / 0.1) * 0.2, 0, 0.3);
    if (n.employerCounter && eff < 1 + n.employerCounter.raise * 0.5 && !(n.satisfaction >= 0.8)) p -= 0.15;
    if (o.deadlineDays != null) {
      if (o.deadlineDays <= 2) p -= NEG.explode.trustHit;
      if (o.deadlineDays <= NEG.explode.minDays && !n.competing && !c.persona?.otherOffers) p += NEG.explode.scarcityBoost;
    }
    if (n.menuChosen) p += NEG.menuLift;
    if (n.satisfaction >= 0.85) p = Math.max(p, 0.9);
  }
  if (c.engagement !== 'contractor') {
    const family = householdOf(state, c) === 'family';
    const pkg = packageScore(state, ensureOps(state).benefits, { family });
    if (ensureOps(state).benefits.configured) p += (pkg.score - 0.8) * 0.25;
  }
  if (c.persona?.concern === 'remote flexibility' && hasWorkplaceTension(state, c)) p -= 0.05;
  return clamp(p, 0.03, 0.95);
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

function open(state, candId, { needCounter = false } = {}) {
  const p = state.apps.people;
  const c = p.candidates.find((x) => x.id === candId);
  if (!c || c.stage !== 'offer') throw new Error('There is no open offer for this candidate.');
  if (needCounter && c.negotiation?.status !== 'countered') throw new Error('They have not countered, or you already answered.');
  return { p, c, n: (c.negotiation ??= { status: 'none', round: 0, history: [] }) };
}

/** Option-pool room left (percent points) and whether options can be granted at all. */
export function equityRoom(state) {
  const p = state.apps.people;
  if (entityOf(state) !== 'ccorp' || !p.equity?.poolPct) return 0;
  return Math.max(0, round2(p.equity.poolPct - poolUsed(p)));
}

function checkEquity(state, p, c, pct) {
  if (!(pct > 0)) return;
  if (entityOf(state) !== 'ccorp') throw new Error('Stock options need a C-corp.');
  if (!p.equity.poolPct) throw new Error('Create an option pool first (Equity tab).');
  const used = poolUsed(p);
  if (used + pct > p.equity.poolPct + 1e-9) throw new Error(`Only ${(p.equity.poolPct - used).toFixed(2)}% left in the pool.`);
}

function satisfaction(n, o, c, t) {
  const w = n.counter?.want ?? {};
  const parts = [];
  const key = unit(c);
  if (w[key] != null) parts.push([0.5, w[key] <= pay(o, c) ? 1 : clamp(((t[key] ?? pay(o, c)) - pay(o, c)) / (w[key] - pay(o, c)), 0, 1)]);
  if (w.equityPct != null) parts.push([0.2, w.equityPct <= (o.equityPct ?? 0) ? 1 : clamp(((t.equityPct ?? 0) - (o.equityPct ?? 0)) / (w.equityPct - (o.equityPct ?? 0)), 0, 1)]);
  if (w.signOn != null) parts.push([0.15, clamp((t.signOn ?? 0) / w.signOn, 0, 1)]);
  if (w.startDay != null) parts.push([0.1, Math.abs((t.startDay ?? o.startDay) - w.startDay) <= 3 ? 1 : 0]);
  if (w.remote != null) parts.push([0.1, t.remote ? 1 : 0]);
  if (!parts.length) return 1;
  const tw = parts.reduce((a, [x]) => a + x, 0);
  return round2(parts.reduce((a, [x, v]) => a + x * v, 0) / tw);
}

function applyTerms(state, c, t) {
  const o = c.offer;
  const k = unit(c);
  if (t[k] != null) o[k] = Math.round(t[k]);
  if (t.equityPct != null && c.engagement !== 'contractor') o.equityPct = Math.max(0, t.equityPct);
  if (t.signOn != null && c.engagement !== 'contractor') o.signOn = Math.max(0, Math.round(t.signOn));
  if (t.startDay != null) o.startDay = Math.max(t.startDay, state.day + (c.noticeDays ?? (c.engagement === 'contractor' ? 3 : 14)));
  if (t.remote) o.remoteOk = true;
}

function resolve(state, c, n, sat, label, { allowRecounter = true } = {}) {
  const o = c.offer;
  const S = streamFor(state, `neg|${c.id}|resolve|${n.round}`);
  n.satisfaction = sat;
  n.status = 'responded';
  o.decideDay = state.day + 1 + (U(S) < 0.5 ? 0 : 1);
  if (sat < 0.85 && allowRecounter && n.round < NEG.maxRounds && U(S) < 0.5 + 0.2 * (1 - sat) && sat >= 0.3) {
    // They move toward you once, then it is final.
    n.round += 1;
    n.status = 'countered';
    n.counterDay = state.day;
    const w = n.counter.want;
    const mid = (a, b) => (a == null ? b : b == null ? a : (a + b) / 2);
    const k = unit(c);
    n.counter = { items: n.counter.items, want: { ...w, [k]: Math.round(mid(w[k], pay(o, c)) / (k === 'salary' ? 500 : 1)) * (k === 'salary' ? 500 : 1) } };
    logNeg(state, c, 'recounter', { want: n.counter.want });
    say(state, c, 'them', `Thanks, that gets us closer. My number would be ${k === 'salary' ? `$${n.counter.want.salary.toLocaleString('en-US')}` : `$${n.counter.want.hourlyRate}/hour`} with the rest as discussed, and that's my final answer.`);
    notify(state, `${c.name} came back once more (final). Accept, or walk.`, { type: 'warn', app: 'people' });
    emitOps(state, 'offer_countered', `${c.id}:${n.round}`, { candidateId: c.id, name: c.name, role: c.role, label: `${c.name} countered again` });
    return 'recounter';
  }
  if (n.round >= NEG.maxRounds && sat < 0.5) { logNeg(state, c, 'final-gap'); }
  logNeg(state, c, label, { sat });
  return 'responded';
}

/** Accept the candidate's counter as asked. */
export function acceptCounter(state, candId) {
  const { p, c, n } = open(state, candId, { needCounter: true });
  const w = n.counter.want;
  applyAgreedPackage(state, candId, { ...w, remote: w.remote });
  n.satisfaction = 1;
  logNeg(state, c, 'accepted-counter');
  say(state, c, 'me', 'Happy to make that work. Updated offer attached.');
  return c.offer;
}

/** Counter back with your own terms: { salary|hourlyRate, equityPct, signOn, startDay, remote }. */
export function counterBack(state, candId, terms) {
  const { p, c, n } = open(state, candId, { needCounter: true });
  checkEquity(state, p, c, terms.equityPct ?? c.offer.equityPct ?? 0);
  const before = { ...c.offer };
  const sat = satisfaction(n, before, c, { ...terms });
  applyTerms(state, c, terms);
  say(state, c, 'me', 'Thanks for being direct about what matters. Here is what we can do: ' + describeTerms(c.offer, c) + '.');
  return { satisfaction: sat, result: resolve(state, c, n, sat, 'counter-back') };
}

/** Present 2-3 packages ({ label, salary, equityPct, signOn }); the candidate takes the one worth most to them. */
export function presentMenu(state, candId, options) {
  const { p, c, n } = open(state, candId, { needCounter: true });
  const opts = options.filter((x) => x && (x.salary > 0 || x.hourlyRate > 0));
  if (opts.length < 2) throw new Error('Offer at least two packages.');
  opts.forEach((x) => checkEquity(state, p, c, x.equityPct ?? 0));
  let best = null;
  for (const x of opts) {
    const v = packageValue(state, c, { salary: x.salary ?? x.hourlyRate, signOn: x.signOn ?? 0, equityPct: x.equityPct ?? 0 });
    if (!best || v > best.v) best = { x, v };
  }
  n.menuChosen = best.x.label ?? 'package';
  const sat = satisfaction(n, c.offer, c, { ...best.x, startDay: undefined });
  applyTerms(state, c, best.x);
  say(state, c, 'me', `We can do any of these, whichever fits you best: ${opts.map((x) => `${x.label}: ${describeTerms({ ...c.offer, salary: x.salary, hourlyRate: x.hourlyRate, equityPct: x.equityPct ?? 0, signOn: x.signOn ?? 0 }, c)}`).join(' | ')}.`);
  say(state, c, 'them', `I'd like the "${n.menuChosen}" option.`);
  return { chosen: best.x, satisfaction: sat, result: resolve(state, c, n, Math.max(sat, 0.55), 'menu') };
}

/** Add a sign-on bonus to the open offer (also usable without a counter). */
export function addSignOn(state, candId, amount) {
  const { p, c, n } = open(state, candId);
  if (c.engagement === 'contractor') throw new Error('Sign-on bonuses are for employees.');
  const a = Math.max(0, Math.round(amount));
  c.offer.signOn = a;
  logNeg(state, c, 'sign-on', { amount: a });
  if (n.status === 'countered') {
    const sat = satisfaction(n, c.offer, c, { [unit(c)]: pay(c.offer, c), equityPct: c.offer.equityPct, signOn: a, startDay: c.offer.startDay, remote: c.offer.remoteOk });
    return { satisfaction: sat, result: resolve(state, c, n, sat, 'sign-on') };
  }
  c.offer.decideDay = Math.max(c.offer.decideDay, state.day + 1);
  return { satisfaction: null, result: 'added' };
}

/** Make the offer expire in `days` (1-14). */
export function setDeadline(state, candId, days) {
  const { c } = open(state, candId);
  setDeadlineInternal(state, c, days);
  logNeg(state, c, 'deadline', { days: c.offer.deadlineDays });
  return c.offer.deadlineDay;
}

/** Withdraw the offer. */
export function walkAway(state, candId) {
  const { c } = open(state, candId);
  logNeg(state, c, 'walked');
  c.stage = 'rejected';
  say(state, c, 'me', 'After thinking it over we are going to withdraw the offer. Thank you for your time and all the best.');
  return c;
}

function describeTerms(o, c) {
  const contractor = c.engagement === 'contractor';
  return `${contractor ? `$${o.hourlyRate}/hour` : `$${(o.salary ?? 0).toLocaleString('en-US')} base`}${o.equityPct ? ` + ${o.equityPct}% equity` : ''}${o.signOn ? ` + $${o.signOn.toLocaleString('en-US')} sign-on` : ''}`;
}

// ---------------------------------------------------------------------------
// After the decision: hire-time consequences
// ---------------------------------------------------------------------------

/** Lowball and overpay checks when someone accepts. Sets hidden member flags; returns the flags. */
export function hireTermsCheck(state, p, m, c) {
  const o = c.offer;
  if (m.engagement === 'contractor') { m.ops = { ...(m.ops ?? {}) }; return m.ops; }
  const ask = o.expectation ?? c.expectation;
  const eff = ((o.salary ?? 0) + signOnBoost(o)) / Math.max(1, ask);
  m.ops = { ...(m.ops ?? {}), askRatio: round2(eff) };
  m.signOn = o.signOn ?? 0;
  if (eff < NEG.lowball.ratio) {
    const gap = NEG.lowball.ratio - eff;
    const attr = round2(Math.min(NEG.lowball.maxAttr, 1 + NEG.lowball.attrPerPoint * gap));
    const morale = round2(Math.min(NEG.lowball.moraleDrag, (gap / 0.12) * NEG.lowball.moraleDrag));
    m.ops.lowball = { ratio: round2(eff), attr, morale, day: state.day };
    const replace = (m.salary ?? 0) / 12 * 2 + 3000;
    const expected = round2((attr - 1) * BASE_ATTRITION_MONTHLY * 2 * NEG.lowball.window * replace);
    logMistake(state, { functionId: 'people_ops', id: 'lowball_offer_attrition', label: 'Lowballed a hire who said yes anyway', app: 'people', delayed: true, key: `lowball:${m.id}`, cost: { usd: expected, hours: 4 }, detail: `${m.name} accepted ${Math.round(eff * 100)}% of their ask (${Math.round((1 - eff) * 100)}% under). Expect ~${Math.round((attr - 1) * 100)}% more quits for a year and a half and lower morale; the saving of ~$${Math.round((1 - eff) * ask)}/yr is the price of a ~$${Math.round(replace)} replacement later.` });
    notify(state, `${m.name} accepted a low offer (${Math.round(eff * 100)}% of their ask). They may stay, but the quit risk is up. Revisit pay at their first review.`, { type: 'warn', app: 'people' });
  }
  // The renege draw: people can accept and then back out before the start date.
  const S = streamFor(state, `neg|${c.id}|renege`);
  const n = c.negotiation ?? {};
  const days = Math.max(0, m.startDay - state.day);
  const r = NEG.renege;
  const pr = clamp(r.base + (n.employerCounter ? r.employerCounter : 0) + (n.competing ? r.competing : 0) + (m.ops.lowball ? r.lowball : 0) + Math.max(0, days - 14) * r.perDayOver14, 0, 0.5);
  if (days >= 3 && U(S) < pr) m.ops.renegeDay = state.day + 1 + Math.floor(U(S) * (days - 1));
  m.ops.renegeP = round2(pr);
  return m.ops;
}

/** Day of the renege draw (called daily for members with status 'offer'). Returns true if they backed out. */
export function renegeCheck(state, m) {
  const d = m.ops?.renegeDay;
  if (d == null || state.day < d || m.status !== 'offer') return false;
  const welcomed = Boolean(m.onboarding?.items?.welcome?.done);
  const S = streamFor(state, `neg|${m.id}|renege-save`);
  m.ops.renegeDay = null;
  if (welcomed && U(S) < NEG.renege.welcomeSaves) {
    notify(state, `${m.name} was wobbling about the offer, but your welcome call kept them on board.`, { type: 'good', app: 'people' });
    return false;
  }
  m.status = 'gone';
  m.endDay = state.day;
  m.exitReason = 'offer rescinded';
  m.reneged = true;
  const c = state.apps.people.candidates.find((x) => x.id === m.candidateId);
  if (c) c.stage = 'declined';
  notify(state, `${m.name} backed out before the start date (took another job or accepted a counteroffer). The search starts again.`, { type: 'bad', app: 'people' });
  emitOps(state, 'offer_declined', `${m.id}:reneged`, { memberId: m.id, name: m.name, reason: 'reneged', label: `${m.name} reneged after accepting` });
  logMistake(state, { functionId: 'people_ops', id: 'offer_reneged', label: 'Accepted candidate backed out before day 1', app: 'people', cost: { hours: 8, days: 28 }, delayed: true, key: `renege:${m.id}`, detail: `${m.name} accepted and then reneged${m.ops?.lowball ? ' (a low offer makes second thoughts likelier)' : ''}${c?.negotiation?.employerCounter ? ' after their employer countered' : ''}${m.onboarding?.items?.welcome?.done ? '' : '. No one stayed in touch between the yes and day one; a welcome call and early access keep people committed'}.` });
  return true;
}

/** Overpay and pay equity: when a hire starts, compare with peers in the same role (employees only). */
export function payEquityCheck(state, p, m) {
  if (m.engagement === 'contractor' || m.kind === 'ai_agent' || !m.salary) return null;
  const norm = (x) => (x.salary ?? 0) / Math.max(0.25, (x.hoursPerWeek ?? 40) / 40);
  const rank = { junior: 0, mid: 1, senior: 2 };
  const peers = humansOf(p).filter((x) => x !== m && x.status === 'active' && x.role === m.role && (x.engagement === 'employee' || x.engagement === 'eor') && x.region === m.region && x.salary && state.day - x.startDay > 30
    && (rank[m.seniority ?? 'mid'] ?? 1) <= (rank[x.seniority ?? 'mid'] ?? 1) && norm(x) < norm(m) * (1 - NEG.overpay.peerGap));
  if (!peers.length) return null;
  const gap = peers.reduce((a, x) => a + (norm(m) * 0.95 - norm(x)), 0);
  for (const x of peers) {
    x.morale = clamp((x.morale ?? 70) - NEG.overpay.peerMorale, 0, 100);
    x.ops = { ...(x.ops ?? {}), peerGap: round2(norm(m) / norm(x) - 1), peerAttr: NEG.overpay.peerAttr, peerUnder: m.id };
  }
  m.ops = { ...(m.ops ?? {}), overpaid: true };
  logMistake(state, { functionId: 'people_ops', id: 'pay_inequity_team', label: 'New hire paid well above the existing team', app: 'people', delayed: true, key: `equity:${m.id}`, cost: { usd: Math.round(gap), hours: 5 }, detail: `${m.name} was offered more than ${peers.length} teammate(s) in the same role who have more or equal seniority (gaps ${peers.map((x) => Math.round((norm(m) / norm(x) - 1) * 100) + '%').join(', ')}). Pay leaks (and in many places must be defensible); morale drops and they look elsewhere. Raising them to parity costs ~$${Math.round(gap).toLocaleString('en-US')} a year.` });
  notify(state, `${peers.map((x) => x.name).join(', ')} learned ${m.name} is paid more for the same work. Morale is down and they may leave.`, { type: 'bad', app: 'people' });
  return { peers: peers.map((x) => x.id), gap };
}

/** Give someone a raise (fixes pay inequity and lowball flags once at or near parity). */
export function raiseSalary(state, memberId, newSalary) {
  const p = state.apps.people;
  const m = p.members.find((x) => x.id === memberId);
  if (!m || m.status !== 'active' || !m.salary) throw new Error('Only active salaried employees can get a raise.');
  const s = Math.round(newSalary);
  if (s <= m.salary) throw new Error('A raise has to be above current pay.');
  const old = m.salary;
  m.salary = s;
  m.ops ??= {};
  const peer = m.ops.peerUnder ? p.members.find((x) => x.id === m.ops.peerUnder) : null;
  if (peer && s >= peer.salary * 0.95) { delete m.ops.peerGap; delete m.ops.peerAttr; delete m.ops.peerUnder; m.morale = clamp((m.morale ?? 70) + 4, 0, 100); }
  const ask = m.ops.askRatio != null ? (old + 0) / m.ops.askRatio : null;
  if (m.ops.lowball && ask && s >= ask * 0.95) { delete m.ops.lowball; m.morale = clamp((m.morale ?? 70) + 3, 0, 100); }
  return { old, new: s, annualDelta: s - old };
}

// ---------------------------------------------------------------------------
// Pay transparency at posting time (and at offer time: an offer below the posted range raises the complaint odds)
// ---------------------------------------------------------------------------

/** Which pay-transparency laws apply to a job post (pure). */
export function payLawExposure(state, job, headcount = employeesOf(state.apps.people).length) {
  const out = [];
  if (job.region === 'us') {
    const wp = state.apps.people?.ops?.workplace;
    const states = job.remote !== false ? ['CO', 'WA', 'CA', 'NY'] : [wp?.state ?? CITIES[wp?.city]?.state].filter(Boolean);
    for (const st of states) {
      const law = PAY_LAWS[st];
      if (law && headcount + 1 >= law.minEmployees) out.push({ id: st, ...law });
    }
  } else if (job.region === 'weu' && dateOf(state).toISOString().slice(0, 10) >= EU_PAY.since) {
    out.push({ id: 'EU', ...EU_PAY, minEmployees: 1 });
  }
  return out;
}
export const hasPayRange = (job) => (job.payLo > 0 && job.payHi >= job.payLo) || Boolean(job.payTransparency);
/** A range the employer could plausibly mean (not $60k-$250k): see people/integrity.js RANGE. */
export const hasGoodFaithRange = (job) => (job.payLo > 0 && job.payHi >= job.payLo ? rangeQuality(job) !== 'not_good_faith' : Boolean(job.payTransparency));

/** Called when a job opens: log the mistake and schedule a possible fine. A meaningless range counts as no range. */
export function payTransparencyCheck(state, job) {
  if (hasGoodFaithRange(job)) return null;
  const exp = payLawExposure(state, job);
  if (!exp.length) return null;
  const o = ensureOps(state);
  const worst = exp.reduce((a, x) => (x.pFine > a.pFine ? x : a), exp[0]);
  const fake = hasPayRange(job);
  logMistake(state, { functionId: 'people_ops', id: fake ? 'bad_faith_salary_range' : 'no_salary_range_posted', label: fake ? `Posted a salary range nobody could mean (${job.payLo.toLocaleString('en-US')}-${job.payHi.toLocaleString('en-US')})` : 'Job posted without a salary range', app: 'people', key: `payrange:${job.id}`, cost: { hours: 1 }, charge: true, delayed: true, detail: `"${job.title}" is open where a posted range is required (${exp.map((x) => x.label).join(', ')}). ${fake ? `The laws require the range you reasonably expect to pay; a ${(job.payHi / job.payLo).toFixed(1)}x spread is treated as no range when someone complains. ` : ''}Complaints bring fines of roughly $${worst.fine[0].toLocaleString('en-US')}-$${worst.fine[1].toLocaleString('en-US')} per violation${exp.some((x) => x.id === 'WA') ? ', and Washington has seen hundreds of class actions' : ''}. Post a good-faith range in the ad itself.` });
  // Adding a channel re-opens the job: the same stream would draw the same fine again, so a job gets at most one.
  if ((o.fines ??= []).some((f) => f.id === `fine:${job.id}`)) return exp;
  const S = streamFor(state, `payfine|${job.id}`);
  if (U(S) < Math.min(0.4, 1 - exp.reduce((a, x) => a * (1 - x.pFine), 1))) {
    o.fines.push({ id: `fine:${job.id}`, jobId: job.id, law: worst.label, dueDay: state.day + 14 + Math.floor(U(S) * 70), amount: Math.round(worst.fine[0] + U(S) * (worst.fine[1] - worst.fine[0])), status: 'pending' });
  }
  return exp;
}

/** An offer below the posted range: the candidate (or a rejected applicant comparing notes) can complain. */
export function belowRangeComplaint(state, c, job) {
  const exp = payLawExposure(state, job);
  if (!exp.length) return null;
  const S = streamFor(state, `payrange-offer|${c.id}`);
  if (U(S) >= RANGE.complaintIfOutside) return null;
  const worst = exp.reduce((a, x) => (x.pFine > a.pFine ? x : a), exp[0]);
  const o = ensureOps(state);
  const f = { id: `fine:${job.id}:${c.id}`, jobId: job.id, law: worst.label, dueDay: state.day + 30 + Math.floor(U(S) * 90), amount: Math.round(worst.fine[0] + U(S) * (worst.fine[1] - worst.fine[0])), status: 'pending', reason: 'offer below the posted range' };
  o.fines.push(f);
  return f;
}

/** Daily: pay-transparency fines land. */
export function finesDay(state) {
  const o = ensureOps(state);
  for (const f of o.fines) {
    if (f.status !== 'pending' || state.day < f.dueDay) continue;
    f.status = 'paid';
    post(state, { amount: -f.amount, counterparty: 'State labor agency', description: `Pay transparency violation: ${f.reason ?? 'job post without a salary range'} (${f.law})`, category: 'taxes', method: 'ach', meta: { app: 'people' } });
    notify(state, `A pay-transparency complaint (${f.reason ?? 'job post without a salary range'}) cost $${f.amount.toLocaleString('en-US')} (${f.law}).`, { type: 'bad', app: 'people' });
    // Keyed per fine (not per job): a below-range offer fine on a job that was also fined for its post is a separate cost.
    logMistake(state, { functionId: 'people_ops', id: 'no_salary_range_posted', label: 'Pay transparency fine paid', app: 'people', key: f.id === `fine:${f.jobId}` ? `payfine:${f.jobId}` : `payfine:${f.id}`, cost: { usd: f.amount, hours: 3 }, charge: true, detail: `Fine for ${f.reason ?? 'the post without a range'} (${f.law}).` });
  }
}

// ---------------------------------------------------------------------------
// Engine interface (a shared multi-round negotiation engine can drive the rounds through these two functions)
// ---------------------------------------------------------------------------

/**
 * The candidate's hidden reservation values and priorities: the lowest base they would accept (below ~92% of the ask the
 * acceptance odds fall under half), equity appetite, competing-offer strength and when they need an answer by.
 */
export function candidateReservation(state, c) {
  const o = c.offer ?? {};
  const ask = o.expectation ?? c.expectation;
  const n = c.negotiation ?? {};
  const bench = JOB_ROLES[c.role]?.equityBench ?? 0.3;
  const upside = c.persona?.concern === 'equity upside';
  return {
    unit: unit(c),
    minBase: Math.round(ask * NEG.lowball.ratio),
    target: Math.round(ask * (1 + NEG.gain[seniorityOf(c)] * 0.5)),
    equityAppetite: c.engagement === 'contractor' ? 0 : round2(bench * (upside ? 1 : 0.6)),
    equityDiscount: upside ? NEG.equityDiscount.upsidePersona : NEG.equityDiscount.default,
    competing: n.competing ? { ratio: n.competing.ratio, respondIn: n.competing.respondIn } : null,
    employerCounter: n.employerCounter ? n.employerCounter.raise : null,
    decideByDay: n.competing ? (o.sentDay ?? state.day) + n.competing.respondIn : (o.decideDay ?? null),
    priorities: n.counter?.items ?? ['base'],
    maxRounds: NEG.maxRounds, round: n.round ?? 0,
  };
}

/** Apply an agreed package { salary|hourlyRate, equityPct, signOn, startDay, remote } to the open offer and queue the decision. */
export function applyAgreedPackage(state, candId, pkg) {
  const { p, c, n } = open(state, candId);
  checkEquity(state, p, c, pkg.equityPct ?? c.offer.equityPct ?? 0);
  applyTerms(state, c, pkg);
  n.satisfaction = Math.max(n.satisfaction ?? 0, n.counter ? satisfaction(n, c.offer, c, pkg) : 1);
  n.status = 'responded';
  c.offer.decideDay = state.day + 1;
  logNeg(state, c, 'agreed', { sat: n.satisfaction });
  return c.offer;
}
