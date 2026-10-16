// Launch mode and staged access: open signup vs waitlist vs invite-only cohorts. Hooks into growth/acquire.js through
// setAcquireGate (self-serve signups only). Pure and deterministic; no rng draws except through acquire().
//
// Trade-off modelled [design; docs/research/plg-email/p1-plg-levers.md §1 and p3 §1 give waitlist ranges, the
// staged-access mechanics are game estimates]:
//  - open: full reach, but unqualified users, an onboarding/support surge when signups outrun capacity
//  - waitlist / invite-only: signups wait; only released cohorts are admitted. Less reach and slower growth, better fit
//    (qualified cohorts convert better), focused onboarding, per-cohort learning (debrief), FOMO word of mouth for B2C.
//  - a waitlist that is never released goes cold; releasing far above onboarding capacity floods support and activation.

import { clamp, round2 } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { ensureMarket, setModifier } from '../../core/market.js';
import { acquire, setAcquireGate } from '../growth/acquire.js';
import { addSubscribers } from '../audience/model.js';

export const ACCESS = {
  review: 0.05,            // founder hours per signup reviewed in the qualification queue (3 minutes) [design]
  releaseBase: 0.1,        // hours to run a release (email, flags, onboarding invite) [design]
  capacity: { self: 60, call: 20, concierge: 8 }, // signups one cohort can be onboarded well per release [design]
  baseQuality: { referral: 0.7, network: 0.65, 'organic:viral': 0.65, organic: 0.5, ads: 0.4, default: 0.5 },
  qualifyBoost: 0.2, codeQuality: 0.15, codeRedeem: 0.6, codeDelay: 4, // invite codes: friends of customers, 60% redeemed [design]
  decay: { base: 0.004, coldAfter: 14, perDay: 0.001, max: 0.03 }, // share of waiting people who forget you per day [design]
  openQuality: 0.45, overloadMult: 0.85, surgeTickets: 0.1, // open signups that exceed daily capacity open this many tickets each [design]
  fomo: { b2c: 0.05, other: 0.015 }, // K bonus from "I got in" word of mouth, B2C mostly [design]
  learnPerDebrief: 0.01, learnCap: 6, debriefHours: 1.5,
};
export const admitMult = (q) => 0.73 + 0.6 * q; // open (q .45) is the neutral baseline; a qualified cohort (q .8) converts ~1.2x [design]

export function ensureAccess(state) {
  state.apps ??= {};
  const P = (state.apps.plg ??= {});
  const A = (P.access ??= {});
  A.mode ??= 'open'; A.configured ??= false; A.qualify ??= false; A.batch ??= 25; A.everyDays ??= 14;
  A.waiting ??= { n: 0, quality: 0.5, bySource: {} };
  A.cohorts ??= []; A.scheduled ??= []; A.codes ??= { issued: 0, redeemed: 0 };
  A.lastRelease ??= null; A.modeSince ??= state.day ?? 0; A.learned ??= 0; A.surge ??= 0;
  A.stats ??= { held: 0, admitted: 0, lost: 0, reviewHours: 0, openSignups: 0 };
  A.events ??= [];
  return A;
}
const cap = (state) => ACCESS.capacity[ensureMarket(state).onboarding] ?? ACCESS.capacity.self;
const srcQuality = (src) => { const s = String(src); const k = Object.keys(ACCESS.baseQuality).find((x) => s.startsWith(x)); return ACCESS.baseQuality[k ?? 'default']; };
const ev = (A, e) => { A.events.push(e); if (A.events.length > 100) A.events.shift(); };

/** Hours setLaunchMode would charge, without changing anything (the UI charges these up front). */
export function launchModeHours(state, mode) {
  const A = state.apps?.plg?.access;
  return (A?.mode ?? 'open') !== mode ? (mode === 'open' ? 0.5 : 2) : 0.25;
}

/** Choose the launch mode. Costs setup hours (landing page, form, review view). */
export function setLaunchMode(state, mode, { qualify = false, batch = 25, everyDays = 14 } = {}) {
  const A = ensureAccess(state);
  if (!['open', 'waitlist', 'invite'].includes(mode)) return { ok: false, error: 'unknown mode', hoursCost: 0, usdCost: 0 };
  const changed = A.mode !== mode;
  const wasStaged = A.configured && A.mode !== 'open';
  Object.assign(A, { mode, qualify: Boolean(qualify), batch: Math.max(1, Math.round(batch)), everyDays: Math.max(1, Math.round(everyDays)), configured: true });
  if (changed) A.modeSince = state.day;
  // Opening the doors: everyone still waiting gets the "we're open" email and signs up. accessDay already decayed the
  // queue for the time they waited (people who forgot are gone); the rest arrive at once, so a queue bigger than a
  // cohort's onboarding capacity converts worse (overload), like any unstaged flood.
  if (changed && wasStaged && mode === 'open') {
    const take = Math.floor(A.waiting.n);
    if (take > 0) {
      const mult = admitMult(A.waiting.quality) * (take > cap(state) ? ACCESS.overloadMult : 1);
      const srcs = Object.entries(A.waiting.bySource).filter(([, v]) => v > 0);
      const total = srcs.reduce((a, [, v]) => a + v, 0) || 1;
      let left = take;
      srcs.forEach(([src, v], i) => {
        const k = i === srcs.length - 1 ? left : Math.min(left, Math.round((take * v) / total));
        if (k <= 0) return;
        left -= k;
        acquire(state, { source: src, n: k, convMult: mult, skipGate: true });
      });
      A.stats.admitted += take;
      A.lastRelease = state.day;
      ev(A, { id: `opened_doors:${state.day}`, type: 'cohort_released', day: state.day, cohortId: null, size: take });
    }
    A.waiting = { n: 0, quality: 0.5, bySource: {} };
  }
  return { ok: true, hoursCost: changed ? (mode === 'open' ? 0.5 : 2) : 0.25, usdCost: 0 };
}

// ---- The gate acquire() calls for every self-serve signup batch ----
function gate(state, { source, n }) {
  const A = state.apps?.plg?.access;
  if (!A?.configured) return null;
  if (A.mode === 'open') {
    A.stats.openSignups += n;
    // onboarding load: signups above a day's share of cohort capacity create tickets and dilute activation
    const perDay = cap(state) / 7;
    if (n > perDay && state.apps.support?.active && Array.isArray(state.apps.support.queue)) {
      A.surge += (n - perDay) * ACCESS.surgeTickets;
      const t = Math.floor(A.surge);
      if (t > 0) { A.surge -= t; state.apps.support.queue.push({ day: state.day, n: t, source: 'open_access_surge' }); }
    }
    return { admit: n, convMult: 1 };
  }
  const w = A.waiting;
  const q = srcQuality(source);
  w.quality = (w.quality * w.n + q * n) / Math.max(1, w.n + n);
  w.n += n;
  w.bySource[source] = (w.bySource[source] ?? 0) + n;
  A.stats.held += n;
  if (state.apps.audience?.platform) addSubscribers(state, n, { key: 'waitlist', source: 'waitlist', engaged: 0.8, fit: 0.6, consent: state.apps.audience.compliance?.consent === 'logged' ? 'express+log' : 'express', label: 'Product waitlist' });
  return { admit: 0, convMult: 1 };
}
setAcquireGate(gate);

function admit(state, A, take, quality, { label, qualified, codes = false }) {
  const w = A.waiting;
  take = Math.min(Math.floor(w.n), take);
  if (take <= 0) return 0;
  const over = take > cap(state);
  const mult = admitMult(quality) * (over ? ACCESS.overloadMult : 1);
  const srcs = Object.entries(w.bySource).filter(([, v]) => v > 0);
  const total = srcs.reduce((a, [, v]) => a + v, 0) || 1;
  let left = take, got = 0;
  srcs.forEach(([src, v], i) => {
    const k = i === srcs.length - 1 ? left : Math.min(left, Math.round((take * v) / total));
    if (k <= 0) return;
    left -= k; w.bySource[src] = Math.max(0, v - k);
    const g = acquire(state, { source: src, n: k, convMult: mult, skipGate: true });
    got += g.subs.length;
  });
  w.n = Math.max(0, w.n - take);
  A.stats.admitted += take;
  A.lastRelease = state.day;
  const c = { id: `coh_${A.cohorts.length + 1}`, day: state.day, size: take, quality: round2(quality), qualified, codes, overload: over, debriefed: false, label };
  A.cohorts.push(c);
  ev(A, { id: `cohort_released:${c.id}`, type: 'cohort_released', day: state.day, cohortId: c.id, size: take });
  if (over) logMistake(state, { functionId: 'plg', id: 'release_flood', label: `Released ${take} people at once (capacity ${cap(state)})`, app: 'plg', cost: { customers: take * 0.08, hours: 2, reputation: 0.5 }, delayed: true, charge: true, detail: 'Onboarding capacity was exceeded: activation and conversion for that cohort dropped, support tickets piled up, and nobody learned anything from a 100-person wave.', key: `flood:${c.id}` });
  if (!qualified && !codes && take >= 20) logMistake(state, { functionId: 'plg', id: 'no_qualification', label: `Released ${take} signups without qualifying them`, app: 'plg', cost: { customers: take * 0.05 }, delayed: true, detail: 'A waitlist you release first-come-first-served is open signup with a delay. Review who you let in: the ICP, the use case, the company.', key: `noqual:${c.id}` });
  return take;
}

/** Release a cohort from the waitlist. Qualification (founder review) picks the best-fit people. Returns { ok, released, hoursCost }.
 *  dryRun: validate and price the release without admitting anyone (the UI charges hours from it before the real call). */
export function releaseBatch(state, { n = null, qualify = null, dryRun = false } = {}) {
  const A = ensureAccess(state);
  if (!A.configured || A.mode === 'open') return { ok: false, error: 'Launch mode is open signup: nothing is waiting.', hoursCost: 0, usdCost: 0 };
  if (A.mode === 'invite') return { ok: false, error: 'Invite-only releases go through invite codes.', hoursCost: 0, usdCost: 0 };
  const take = Math.min(Math.floor(A.waiting.n), Math.round(n ?? A.batch));
  if (take <= 0) return { ok: false, error: 'Nobody is waiting.', hoursCost: 0, usdCost: 0 };
  const qual = qualify ?? A.qualify;
  const q = clamp(A.waiting.quality + (qual ? ACCESS.qualifyBoost : 0), 0.1, 0.9);
  const hours = ACCESS.releaseBase + (qual ? take * ACCESS.review : 0);
  if (dryRun) return { ok: true, released: take, hoursCost: round2(hours), usdCost: 0 };
  A.stats.reviewHours += qual ? take * ACCESS.review : 0;
  const released = admit(state, A, take, q, { label: 'Waitlist release', qualified: qual });
  return { ok: true, released, hoursCost: round2(hours), usdCost: 0 };
}

/** Invite-only: issue n invite codes to customers. About 60% are redeemed over the next days by friends of customers. */
export function issueCodes(state, n = 10) {
  const A = ensureAccess(state);
  if (!A.configured || A.mode !== 'invite') return { ok: false, error: 'Switch launch mode to invite-only first.', hoursCost: 0, usdCost: 0 };
  n = Math.max(1, Math.round(n));
  A.codes.issued += n;
  A.scheduled.push({ day: state.day + ACCESS.codeDelay, n: Math.max(0, Math.round(n * ACCESS.codeRedeem)) });
  return { ok: true, hoursCost: round2(0.1 + 0.02 * n), usdCost: 0 };
}

/** Debrief a released cohort (interviews, feedback read-out). Teaches you something, so it lifts conversion a little. */
export function debriefCohort(state, cohortId) {
  const A = ensureAccess(state);
  const c = A.cohorts.find((x) => x.id === cohortId);
  if (!c || c.debriefed || state.day - c.day < 14) return { ok: false, error: c?.debriefed ? 'Already debriefed.' : 'Give the cohort two weeks of real use first.', hoursCost: 0, usdCost: 0 };
  c.debriefed = true;
  const weight = c.overload ? 0.4 : 1;
  A.learned = Math.min(ACCESS.learnCap, A.learned + weight * (c.size >= 5 ? 1 : 0.5));
  return { ok: true, hoursCost: ACCESS.debriefHours, usdCost: 0, learned: A.learned };
}

/** FOMO word of mouth from staged access (added to K in plgK). */
export function accessK(state) {
  const A = state.apps?.plg?.access;
  if (!A?.configured || A.mode === 'open') return 0;
  if (A.lastRelease == null || state.day - A.lastRelease > 45) return 0;
  return state.company?.model === 'b2c' ? ACCESS.fomo.b2c : ACCESS.fomo.other;
}

export function accessDay(state) {
  const A = state.apps?.plg?.access;
  if (!A?.configured) return;
  const w = A.waiting;
  if (A.mode !== 'open' && w.n > 0) {
    const gap = state.day - (A.lastRelease ?? A.modeSince);
    const rate = ACCESS.decay.base + (gap > ACCESS.decay.coldAfter ? Math.min(ACCESS.decay.max, (gap - ACCESS.decay.coldAfter) * ACCESS.decay.perDay) : 0);
    const lost = w.n * rate;
    w.n -= lost; A.stats.lost += lost;
    for (const k of Object.keys(w.bySource)) w.bySource[k] *= 1 - rate;
    if (w.n >= 20 && gap >= 30) logMistake(state, { functionId: 'plg', id: 'waitlist_never_released', label: `${Math.floor(w.n)} people waiting ${gap} days with no release`, app: 'plg', cost: { customers: Math.round(w.n * 0.05), reputation: 0.5 }, delayed: true, detail: 'A waitlist you never release goes cold: people forget they signed up, and the ones who remember assume the product is dead.', key: `never:${Math.floor(state.day / 45)}` });
  }
  const due = A.scheduled.filter((s) => s.day <= state.day);
  if (due.length) {
    A.scheduled = A.scheduled.filter((s) => s.day > state.day);
    for (const s of due) { const got = admit(state, A, s.n, clamp(w.quality + ACCESS.codeQuality, 0.1, 0.9), { label: 'Invite codes', qualified: true, codes: true }); A.codes.redeemed += got; }
  }
  setModifier(state, 'conversion', 'plg-cohort-learning', A.learned > 0 ? round2(1 + ACCESS.learnPerDebrief * A.learned) : null);
  const stale = A.cohorts.find((c) => !c.debriefed && state.day - c.day === 21);
  if (stale) notify(state, `Cohort ${stale.id} (${stale.size} people) has used the product for three weeks. Debrief it in Growth loops: that is what staged access is for.`, { type: 'info', app: 'plg' });
}

export function accessSummary(state) {
  const A = ensureAccess(state);
  return { mode: A.mode, configured: A.configured, waiting: Math.floor(A.waiting.n), capacity: cap(state), cohorts: A.cohorts.length, learned: A.learned, daysSinceRelease: A.lastRelease == null ? null : state.day - A.lastRelease, stats: A.stats };
}
