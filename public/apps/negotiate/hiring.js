// Hiring-offer negotiation wired into People (candidate page, offer stage). The candidate is the counterparty; their hidden
// values come from people/negotiation.js candidateReservation (lowest base they would take, equity appetite, competing-offer
// strength, when they need an answer by). The agreed package is applied with applyAgreedPackage, so every existing consequence
// keeps working: lowball attrition and morale drag, pay inequity on the team, the renege draw before day one, and the usual
// acceptance roll. A candidate who walks (or lets the clock run out) declines; the founder walking withdraws the offer.
// The quick path (accept / counter back / menu / sign-on in views-ops.js) is unchanged. Numbers marked [design] are assumptions.

import { clamp, round2 } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { newThread, addMessage, findThread } from '../../core/mail.js';
import { registerAdapter, startNegotiation, findNegotiation, pkgU } from '../../core/negotiation.js';
import { currentRunway } from '../fundraising/process.js';
import { candidateReservation, applyAgreedPackage, walkAway as withdrawOffer, equityRoom, seniorityOf } from '../people/negotiation.js';
import { opsOnDecline } from '../people/ops.js';
import { NEG } from '../people/ops-data.js';
import { hiringSpec, registerClose, runClosers } from './others.js';
import { bizBlock } from '../context.js';
import { PATHS } from '../../core/state.js';

const START_DAYS = { now: 14, d30: 30, d60: 60 };
const unitOf = (c) => (c.engagement === 'contractor' ? 'hourlyRate' : 'salary');
const startOpt = (state, day) => { const d = day - state.day; return d <= 20 ? 'now' : d <= 45 ? 'd30' : 'd60'; };
const runwayOf = (state) => { try { const r = currentRunway(state); return Number.isFinite(r) ? r : Infinity; } catch { return Infinity; } };

export const hiringKey = (c) => `hire:${c.id}`;
export const negotiationForCandidate = (state, c) => findNegotiation(state, hiringKey(c));

/** The spec for a candidate with an outstanding offer (hidden values from candidateReservation). */
export function candidateSpec(state, c) {
  const o = c.offer, n = c.negotiation ?? {};
  const res = candidateReservation(state, c);
  const contractor = c.engagement === 'contractor';
  const ask = o.expectation ?? c.expectation;
  const offered = (contractor ? o.hourlyRate : o.salary) ?? ask;
  const base = hiringSpec(state, { candidate: c, role: c.role, expectation: ask, offer: { salary: offered }, competing: Boolean(res.competing), key: hiringKey(c) });
  const lo = Math.round(ask * 0.85), hi = Math.round(ask * 1.25);
  const room = contractor ? 0 : equityRoom(state);
  const eqMax = Math.min(0.02, round2(room) / 100);
  let issues = base.issues.map((i) => {
    if (i.id === 'salary') return { ...i, label: contractor ? 'Hourly rate' : 'Base salary', min: lo, max: hi, step: contractor ? 1 : 500 };
    if (i.id === 'equity') return { ...i, max: eqMax };
    return i;
  });
  if (contractor) issues = issues.filter((i) => i.id !== 'equity' && i.id !== 'signOn');
  else if (eqMax < 0.0005) issues = issues.filter((i) => i.id !== 'equity'); // no C-corp or no pool room: nothing to trade
  // Hidden floor on base: the lowest they would take. A candidate with a competing offer holds the line; one without a rival can be
  // pushed a few points under the number at which acceptance falls under half (which is how lowballing happens).
  const baseFloor = res.minBase * (res.competing || n.counter ? 1 : 0.97);
  const floors = { salary: clamp((baseFloor - lo) / (hi - lo), 0, 0.6) };
  // Hidden priorities: equity appetite and the sign-on / start / remote items the candidate named when they countered.
  const wc = {};
  const items = new Set(res.priorities);
  if (!contractor) wc.equity = 0.2 * clamp(res.equityAppetite / 0.18, 0.4, 2.2) * (items.has('equity') ? 1.5 : 1);
  if (items.has('sign-on')) wc.signOn = 0.15 * 2;
  if (items.has('start date')) wc.start = 0.1 * 2.5;
  if (items.has('remote flexibility')) wc.remote = 0.15 * 2.5;
  // Opening: what they asked for in the counter, else what a candidate at this ask and seniority would open with [design].
  const want = n.counter?.want ?? {};
  const target = res.target;
  const salaryOpen = want[unitOf(c)] ?? Math.round(clamp(Math.max(target, offered), lo, hi) / (contractor ? 1 : 500)) * (contractor ? 1 : 500);
  const opening = { salary: clamp(salaryOpen, lo, hi), start: startOpt(state, want.startDay ?? o.startDay), remote: want.remote ? 'remote' : o.remoteOk ? 'hybrid' : 'office' };
  if (!contractor) {
    opening.signOn = clamp(want.signOn ?? o.signOn ?? 0, 0, 20000);
    if (eqMax >= 0.0005) opening.equity = clamp(round2((want.equityPct ?? o.equityPct ?? 0)) / 100, 0, eqMax);
  }
  const batnaStrength = clamp((res.competing ? 0.62 + Math.max(0, (res.competing.ratio ?? 1.05) - 1) * 1.5 : 0.35) + (res.employerCounter ? 0.08 : 0) + (seniorityOf(c) === 'senior' ? 0.05 : 0), 0.2, 0.85);
  const deadline = Math.max(state.day + 2, Math.min(res.decideByDay ?? Infinity, o.deadlineDay ?? Infinity, (n.counterDay ?? state.day) + NEG.expireDays));
  return {
    ...base, issues, floors, weights: { wc }, opening, cpOpens: false, batnaStrength, leverageRoom: { salary: 0.08 },
    openingMessage: n.counter ? 'Thanks for the offer. This is what I need to get to a yes.' : 'Thanks for the offer, I am excited about it. Here is what I would need to say yes.',
    expiresDay: Number.isFinite(deadline) ? deadline : null,
    cpDeadlineDays: res.competing ? Math.max(10, deadline - state.day + 4) : null, cpKnowsDeadline: false, // only a rival offer puts a clock on their side; the window itself is expiresDay
    mistakes: { bluff: 'bluffed_alternative', overplayed: 'overplayed_hand' },
    context: { candidateId: c.id, expectation: ask, offered, contractor, competing: Boolean(res.competing), employerCounter: Boolean(res.employerCounter), minBase: res.minBase, jobId: c.jobId ?? null },
  };
}

/** Open the multi-round negotiation for a candidate whose offer is out. */
export function startHiringCandidateNegotiation(state, candId) {
  const p = state.apps.people;
  const c = p.candidates.find((x) => x.id === candId);
  if (!c || c.stage !== 'offer') throw new Error('There is no outstanding offer for this candidate.');
  const existing = negotiationForCandidate(state, c);
  if (existing) return existing;
  const neg = startNegotiation(state, candidateSpec(state, c));
  (c.negotiation ??= { status: 'none', round: 0, history: [] }).engineId = neg.id;
  return neg;
}

// The player's real alternatives: other candidates in the pipeline for the same role, and a budget ceiling only if cash really limits it.
function batna(state, neg) {
  const p = state.apps.people;
  const c = p?.candidates?.find((x) => x.id === neg.context.candidateId);
  const sources = [];
  let none = 1;
  for (const o of p?.candidates ?? []) {
    if (o.id === c?.id || o.jobId !== c?.jobId) continue;
    const w = o.stage === 'offer' ? 0.35 : o.stage === 'interviewed' ? 0.25 : o.stage === 'interview_scheduled' ? 0.1 : 0;
    if (!w) continue;
    sources.push({ kind: 'pipeline', label: `${o.name} (${o.stage.replace('_', ' ')}) for the same role`, strength: w });
    none *= 1 - w;
  }
  const pipeline = 1 - none;
  let value = 0.1 + 0.35 * pipeline;
  const runway = runwayOf(state);
  let ceiling = false;
  if (Number.isFinite(runway) && runway < 9) {
    ceiling = true;
    sources.push({ kind: 'budget', label: `Real budget ceiling: runway is ${runway.toFixed(1)} months`, strength: clamp((9 - runway) / 9, 0.15, 0.6) });
    value += 0.05;
  }
  const real = sources.some((s) => s.strength >= 0.25);
  return { value: clamp(value, 0.1, 0.55), real, leverage: clamp(Math.max(pipeline, ceiling ? 0.3 : 0), 0, 1), sources };
}
// A candidate's counter is what they would like to land on, not their walk-away number: put the reservation below their opening
// package by a margin that depends on how good their alternatives are (a rival offer holds the line; nothing else means flexibility).
function onOpen(state, neg) {
  if (!neg.cpOpen) return;
  const u = pkgU(neg, neg.cpOpen).c;
  neg.hidden.res = clamp(u * (0.78 + 0.2 * neg.hidden.batnaStrength), 0.15, 0.6);
  neg.hidden.T0 = neg.hidden.T = u;
}
// What the candidate knows: the role, the written offer, the founder, and what is public about the company (site, pricing,
// bootstrapped or venture-backed). Not its revenue, runway or other candidates.
function brief(state, neg) {
  const c = state.apps.people?.candidates?.find((x) => x.id === neg.context.candidateId);
  const o = c?.offer ?? {};
  const pay = neg.context.contractor ? `$${o.hourlyRate ?? neg.context.offered}/hour` : `$${Math.round(o.salary ?? neg.context.offered).toLocaleString('en-US')} base${o.equityPct ? `, ${o.equityPct}% equity` : ''}${o.signOn ? `, $${o.signOn.toLocaleString('en-US')} sign-on` : ''}`;
  return [
    `You: ${c?.name ?? neg.cp.name}, ${c?.seniority ?? ''} ${c?.role ?? neg.cp.role} candidate${neg.context.competing ? ' with another offer in hand' : ''}.`.replace(/\s+/g, ' '),
    `The written offer from ${state.company?.name}: ${pay}.`,
    `Hiring manager: the founder, ${state.founder?.name ?? 'the founder'}. The company is ${PATHS[state.company?.path]?.label?.toLowerCase() ?? 'a startup'}.`,
  ].join('\n') + bizBlock(state, 'public');
}
registerAdapter('hiring', { label: 'Hiring offer', batna, onOpen, onClose: runClosers('hiring'), brief });

/** Package -> People terms. */
export function termsFromPackage(state, c, pkg) {
  const t = { [unitOf(c)]: Math.round(Number(pkg.salary)) };
  if (c.engagement !== 'contractor') {
    if (pkg.equity != null) t.equityPct = round2(Number(pkg.equity) * 100);
    if (pkg.signOn != null) t.signOn = Math.round(Number(pkg.signOn));
  }
  if (pkg.start) t.startDay = state.day + (START_DAYS[pkg.start] ?? 14);
  if (pkg.remote && pkg.remote !== 'office') t.remote = true;
  return t;
}

function say(state, c, from, body) {
  const t = findThread(state, c.id) ?? newThread(state, { subject: `Offer: ${c.name}`, with: { name: c.name, email: c.email }, kind: 'candidate', app: 'people', refId: c.id });
  addMessage(state, t.id, { from, body });
}

function closeHiring(state, neg) {
  const c = state.apps.people?.candidates?.find((x) => x.id === neg.context.candidateId);
  if (!c || c.stage !== 'offer') return;
  const n = (c.negotiation ??= { status: 'none', round: 0, history: [] });
  n.engine = { negId: neg.id, status: neg.status, day: state.day };
  if (neg.status === 'agreed') {
    const t = termsFromPackage(state, c, neg.final);
    try { applyAgreedPackage(state, c.id, t); } catch (e) {
      // No pool room any more: the equity part falls away, the rest stands.
      delete t.equityPct;
      applyAgreedPackage(state, c.id, t);
      notify(state, `${c.name}: the equity grant could not be issued (${e.message}). The rest of the package stands.`, { type: 'warn', app: 'people' });
    }
    n.satisfaction = 1; // they agreed to exactly this package
    say(state, c, 'me', 'Great, we are agreed on the package. Updated offer attached.');
    return;
  }
  if (neg.status === 'walked_player') { withdrawOffer(state, c.id); return; }
  // They walked, the talks hit an impasse or the clock ran out: the candidate declines.
  const expired = neg.status === 'expired';
  c.stage = 'declined';
  const why = expired ? 'I have lost momentum waiting to hear back and am staying where I am.' : 'We could not get to a package that works for me, so I am going to pass.';
  say(state, c, 'them', `Thanks for the conversations. ${why} Best of luck with ${state.company.name}.`);
  notify(state, `${c.name} declined your offer after the negotiation (${expired ? 'it ran out of time' : 'no agreement'}).`, { type: 'bad', app: 'people' });
  if (expired) logMistake(state, { functionId: 'people_ops', id: 'negotiation_stalled', label: 'Left a candidate\'s counter unanswered', app: 'people', cost: { hours: 6, days: 21 }, delayed: true, key: `neg-stall:${c.id}`, detail: `${c.name} was still negotiating when the window closed; they took the time as a no.` });
  opsOnDecline(state, c, why, expired ? 'stalled' : 'negotiation');
}
registerClose('hiring', closeHiring);
