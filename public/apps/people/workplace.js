// Workplace: fully remote (home-office stipends), coworking (day pass / hot desk / dedicated desk / private office, month to
// month or 12 months), a conventional lease (per sq ft by city, 3-5 years, deposit, personal guarantee, build-out) or hybrid.
// Effects: hiring pool size (remote roles draw far more applicants; office-required roles shrink the pool to the commute),
// salary expectations by city, attrition by mode (hybrid cut quits about a third, Trip.com, Nature 2024), a small in-person edge
// for juniors, founder isolation for solo remote founders, offsites. Rent posts monthly through addRecurring.
//
// Mistakes (functionId people_ops): long_lease_too_early, personal_guarantee_called, office_required_shrinks_pool.
// Research: docs/research/ops-2026/office-remote.md; numbers in ops-data.js (CITIES, COWORK, LEASE, POOL, MODE_ATTR).

import { notify } from '../../core/state.js';
import { post, addRecurring } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { personalTxn } from '../../core/personal.js';
import { clamp, round2, fmtDate, rng } from '../../core/util.js';
import { streamFor } from './global.js';
import { CITIES, COWORK, LEASE, POOL, MODE_ATTR, JUNIOR_IN_PERSON, ISOLATION, OFFSITE } from './ops-data.js';
import { ensureOps, emitOps, humansOf } from './ops-state.js';

const wp = (state) => ensureOps(state).workplace;
const MONTH = 30.4;

/** People who need a seat: the founder, active staff and contractors, and starters within 30 days. */
export function headsFor(state) {
  const p = state.apps.people;
  const staff = humansOf(p).filter((m) => (m.status === 'active' || (m.status === 'offer' && m.startDay - state.day <= 30)) && m.region != null).length;
  const co = (p.members ?? []).filter((m) => m.kind === 'cofounder' && m.status === 'active').length;
  return 1 + staff + co;
}
const teamHeads = (state) => headsFor(state) - 1; // everyone but the founder

export function runwayMonths(state) {
  try {
    const burn = state.recurring.filter((r) => r.active).reduce((a, r) => a + r.amount, 0) + (state.apps.people?.members ?? []).filter((m) => m.status === 'active' && m.kind !== 'ai_agent').reduce((a, m) => a + (m.salary ?? (m.hourlyRate ?? 0) * (m.hoursPerWeek ?? 40) * 4.33 * 12) / 12 * 1.2, 0);
    const bal = state.bank.accounts.reduce((a, x) => a + x.balance, 0);
    return burn > 0 ? bal / burn : 99;
  } catch { return 99; }
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------
export function coworkPrice(cityId, tier, term = 'month') {
  const c = CITIES[cityId] ?? CITIES.austin;
  const t = COWORK.tiers[tier];
  if (!t || tier === 'day_pass') return 0;
  return round2(c.dedicated * t.mult * (COWORK.term[term] ?? 1));
}
export function leaseTerms(cityId, sqft) {
  const c = CITIES[cityId] ?? CITIES.austin;
  const base = (sqft * c.leaseSf) / 12;
  const monthly = round2(base * (1 + LEASE.opexShare));
  return { monthly, base: round2(base), perSf: c.leaseSf };
}
export const sqftFor = (heads) => Math.max(LEASE.minSf, Math.round((heads * LEASE.sfPerPerson) / 50) * 50);

// ---------------------------------------------------------------------------
// Setting the workplace
// ---------------------------------------------------------------------------
function setBill(state, key, vendor, amount, category, note, day = 1) {
  const o = ensureOps(state);
  let r = state.recurring.find((x) => x.id === o.rec[key]);
  if (amount > 0 && !r) { r = addRecurring(state, { vendor, amount, category, dayOfMonth: day, note }); o.rec[key] = r.id; }
  if (r && !r.suspended) { r.amount = round2(amount); r.active = amount > 0; }
  return r;
}

/** Monthly workplace cost today (rent or coworking + day passes), from the live state. */
export function workplaceCost(state) {
  const w = wp(state);
  let rent = 0, cowork = 0, passes = 0;
  if (w.lease && !w.lease.ended) rent = w.lease.monthly * (w.lease.holdover ? 1.25 : 1);
  if (w.cowork && !w.cowork.ended) cowork = coworkMonthly(state);
  passes = (w.dayPasses ?? 0) * 4.33 * COWORK.tiers.day_pass.dayPass;
  return { rent: round2(rent), cowork: round2(cowork), passes: round2(passes), total: round2(rent + cowork + passes) };
}

function coworkMonthly(state) {
  const w = wp(state);
  const c = w.cowork;
  const seats = c.tier === 'hot_desk' ? Math.ceil(headsFor(state) * COWORK.seatRatioHot) : headsFor(state);
  const hybridRatio = w.mode === 'hybrid' ? 0.6 : 1; // in office only some days: fewer desks needed
  return round2(coworkPrice(w.city, c.tier, c.term) * Math.max(1, Math.ceil(seats * hybridRatio)));
}

export function syncWorkplaceBills(state) {
  const w = wp(state);
  const cost = workplaceCost(state);
  setBill(state, 'rent', 'Landlord (office lease)', cost.rent, 'other', 'Office rent + operating costs', 1);
  setBill(state, 'cowork', 'Coworking membership', cost.cowork, 'other', 'Coworking desks', 1);
  setBill(state, 'passes', 'Coworking day passes', cost.passes, 'other', 'Day passes for the founder', 2);
  return cost;
}

/**
 * Choose how the company works. mode: 'remote' | 'cowork' | 'lease' | 'hybrid'. Leaving a 12-month coworking commitment early
 * costs 75% of the remaining months; leaving a lease is exitLease().
 */
export function setWorkplace(state, { mode, city, hybridDays, dayPasses, cowork, hybridBase } = {}) {
  const w = wp(state);
  if (!['remote', 'cowork', 'lease', 'hybrid'].includes(mode)) throw new Error('Pick remote, coworking, a lease or hybrid.');
  if (city && !CITIES[city]) throw new Error('Pick a city.');
  if (mode === 'lease' && !(w.lease && !w.lease.ended)) throw new Error('Sign a lease first (Workplace → Sign a lease), or choose another mode.');
  if (w.lease && !w.lease.ended && mode !== 'lease' && !(mode === 'hybrid' && (hybridBase ?? w.hybridBase) === 'lease')) throw new Error('You have a lease. Exit it first (sublease, buyout or let it run) before switching away from the office.');
  if (city) { w.city = city; w.state = CITIES[city].state ?? null; }
  if (hybridDays != null) w.hybridDays = clamp(Math.round(hybridDays), 1, 4);
  if (dayPasses != null) w.dayPasses = clamp(Math.round(dayPasses), 0, 5);
  if (hybridBase) w.hybridBase = hybridBase;
  const wantsCowork = mode === 'cowork' || (mode === 'hybrid' && (hybridBase ?? w.hybridBase ?? 'cowork') === 'cowork');
  if (wantsCowork) {
    const tier = cowork?.tier ?? w.cowork?.tier ?? 'hot_desk';
    const term = cowork?.term ?? w.cowork?.term ?? 'month';
    if (!COWORK.tiers[tier] || tier === 'day_pass') throw new Error('Pick a desk type.');
    if (w.cowork && !w.cowork.ended && w.cowork.term === 'year' && w.cowork.endDay > state.day && (w.cowork.tier !== tier || term !== 'year')) {
      const months = Math.ceil((w.cowork.endDay - state.day) / MONTH);
      const fee = round2(0.75 * months * coworkMonthly(state));
      post(state, { amount: -fee, counterparty: 'Coworking operator', description: `Early exit from 12-month commitment (${months} months left x 75%)`, category: 'other', method: 'ach', meta: { app: 'people' } });
    }
    const keep = w.cowork && !w.cowork.ended && w.cowork.tier === tier && w.cowork.term === term;
    w.cowork = keep ? w.cowork : { tier, term, startDay: state.day, endDay: term === 'year' ? state.day + 365 : null, ended: false };
  } else if (w.cowork && !w.cowork.ended) {
    if (w.cowork.term === 'year' && w.cowork.endDay > state.day) {
      const months = Math.ceil((w.cowork.endDay - state.day) / MONTH);
      const fee = round2(0.75 * months * coworkMonthly(state));
      post(state, { amount: -fee, counterparty: 'Coworking operator', description: `Early exit from 12-month commitment (${months} months left x 75%)`, category: 'other', method: 'ach', meta: { app: 'people' } });
    }
    w.cowork.ended = true;
  }
  w.mode = mode;
  w.setDay ??= state.day;
  syncWorkplaceBills(state);
  return w;
}

// ---------------------------------------------------------------------------
// Lease
// ---------------------------------------------------------------------------
/**
 * Sign a conventional lease. guarantee: 'personal' (cheap deposit, you are on the hook) or 'deposit' (6 months' rent up front,
 * no personal guarantee). buildOut: 'light' | 'standard' | 'premium'. Posts the deposit, build-out and lawyer; starts the rent.
 */
export function signLease(state, { city, sqft, termYears = 3, buildOut = 'light', guarantee = 'personal' } = {}) {
  const w = wp(state);
  if (w.lease && !w.lease.ended) throw new Error('You already have a lease.');
  if (!CITIES[city]) throw new Error('Pick a city.');
  if (!(sqft >= 200)) throw new Error('Pick a size (at least 200 sq ft).');
  if (termYears < 3 || termYears > 5) throw new Error('Commercial leases for small companies run 3-5 years.');
  if (!LEASE.buildOutPerSf[buildOut]) throw new Error('Pick a build-out level.');
  const t = leaseTerms(city, sqft);
  const months = guarantee === 'deposit' ? LEASE.largeDepositMonths : LEASE.depositMonths;
  const deposit = round2(t.monthly * months);
  const build = round2(sqft * LEASE.buildOutPerSf[buildOut]);
  post(state, { amount: -deposit, counterparty: 'Landlord', description: `Lease security deposit (${months} months)`, category: 'other', method: 'wire', meta: { app: 'people', deposit: true } });
  if (build > 0) post(state, { amount: -build, counterparty: 'Contractor', description: `Office build-out (${buildOut}, ${sqft} sq ft)`, category: 'other', method: 'ach', meta: { app: 'people' } });
  post(state, { amount: -LEASE.lawyer, counterparty: 'Real-estate counsel', description: 'Commercial lease review', category: 'legal', method: 'ach', meta: { app: 'people' } });
  const heads = headsFor(state);
  w.city = city; w.state = CITIES[city].state ?? null;
  w.lease = { city, sqft, termYears, buildOut, buildCost: build, deposit, monthly: t.monthly, perSf: t.perSf, pg: guarantee === 'personal', startDay: state.day, endDay: state.day + Math.round(termYears * 365), ended: false, headsAtSigning: heads, total: round2(t.monthly * termYears * 12) };
  if (w.cowork && !w.cowork.ended && w.mode === 'cowork') { w.cowork.ended = true; }
  w.mode = w.mode === 'hybrid' ? 'hybrid' : 'lease';
  w.hybridBase = w.mode === 'hybrid' ? 'lease' : w.hybridBase;
  syncWorkplaceBills(state);
  const runway = runwayMonths(state);
  if (heads - 1 < LEASE.minHeadcount || runway < 18) {
    logMistake(state, { functionId: 'people_ops', id: 'long_lease_too_early', label: `Signed a ${termYears}-year lease with ${heads - 1} people on the team`, app: 'people', key: `lease:${w.lease.startDay}`, delayed: true, cost: { hours: 6, usd: LEASE.lawyer }, detail: `$${Math.round(t.monthly).toLocaleString('en-US')}/month for ${termYears} years is $${Math.round(w.lease.total).toLocaleString('en-US')} of fixed cost, signed with ${heads - 1} people${runway < 18 ? ` and ${runway.toFixed(0)} months of runway` : ''}. Under about ${LEASE.minHeadcount} people a flexible coworking desk is the usual answer. If you shrink, you either sublet at a loss or pay to leave.${w.lease.pg ? ' You also signed a personal guarantee.' : ''}` });
  }
  return w.lease;
}

export function remainingMonths(state, lease = wp(state).lease) {
  return lease ? Math.max(0, Math.ceil((lease.endDay - state.day) / MONTH)) : 0;
}

/**
 * Leave the lease. how: 'sublease' (sublet at a discount after a gap; needs landlord consent), 'buyout' (landlord takes ~80% of
 * what is left, less your deposit), 'default' (stop paying: a personal guarantee gets called), 'expire' (only at or after the end).
 */
export function exitLease(state, how) {
  const w = wp(state);
  const l = w.lease;
  if (!l || l.ended) throw new Error('No lease to exit.');
  const left = remainingMonths(state, l);
  const rent = l.monthly * (l.holdover ? 1.25 : 1);
  const remaining = round2(rent * left);
  let paid = 0, kind = how;
  const S = streamFor(state, `lease|exit|${l.startDay}|${how}`);
  if (how === 'expire') {
    if (left > 0) throw new Error('The term is not over. Choose sublease, buyout or default.');
    post(state, { amount: l.deposit, counterparty: 'Landlord', description: 'Lease security deposit returned', category: 'refund_in', method: 'wire', meta: { app: 'people' } });
  } else if (how === 'sublease') {
    if (left <= 0) throw new Error('Nothing left to sublet.');
    const rec = LEASE.sublease.recovery[0] + rng(S) * (LEASE.sublease.recovery[1] - LEASE.sublease.recovery[0]);
    const gap = Math.min(left, Math.round(LEASE.sublease.months[0] + rng(S) * (LEASE.sublease.months[1] - LEASE.sublease.months[0])));
    paid = round2(rent * gap + rent * Math.max(0, left - gap) * (1 - rec));
    post(state, { amount: -paid, counterparty: 'Landlord', description: `Sublease shortfall: ${gap} months vacant, then ~${Math.round(rec * 100)}% recovered`, category: 'other', method: 'ach', meta: { app: 'people' } });
  } else if (how === 'buyout') {
    paid = Math.max(0, round2(remaining * LEASE.buyout - l.deposit));
    if (paid > 0) post(state, { amount: -paid, counterparty: 'Landlord', description: `Lease buyout (80% of ${left} months left, less deposit)`, category: 'other', method: 'wire', meta: { app: 'people' } });
  } else if (how === 'default') {
    const owed = round2(remaining * LEASE.pgCallShare);
    if (l.pg) {
      personalTxn(state, -owed, 'Landlord called your personal guarantee', 'debt');
      paid = owed;
      notify(state, `The landlord called your personal guarantee: $${Math.round(owed).toLocaleString('en-US')} came out of your personal savings.`, { type: 'bad', app: 'people' });
      logMistake(state, { functionId: 'people_ops', id: 'personal_guarantee_called', label: 'Landlord called the personal guarantee', app: 'people', key: `pg:${l.startDay}`, cost: { usd: owed, hours: 15 }, detail: `The company stopped paying with ${left} months left; because you guaranteed the lease personally, the landlord collects ~${Math.round(LEASE.pgCallShare * 100)}% of the remaining rent from you, not from the company. A larger cash deposit instead of a guarantee, or a shorter term, keeps the company's debts the company's.` });
    } else {
      notify(state, 'The landlord kept your deposit and sent the rest to collections against the company.', { type: 'bad', app: 'people' });
      logMistake(state, { functionId: 'people_ops', id: 'long_lease_too_early', label: 'Defaulted on a lease', app: 'people', key: `leasedef:${l.startDay}`, cost: { usd: l.deposit, hours: 10 }, detail: 'The deposit was forfeited and the landlord is owed the rest.' });
    }
  } else throw new Error('Pick sublease, buyout, default or expire.');
  l.ended = true; l.exitDay = state.day; l.exit = kind; l.exitCost = paid;
  if (how !== 'expire' && how !== 'default' && paid > 0 || (how === 'sublease')) {
    logMistake(state, { functionId: 'people_ops', id: 'long_lease_too_early', label: `Left a lease early (${how})`, app: 'people', key: `leaseexit:${l.startDay}`, delayed: true, cost: { usd: paid, hours: 8, days: how === 'sublease' ? 30 : 7 }, detail: `${left} months were left on the ${l.termYears}-year lease. ${how === 'sublease' ? 'Subleases go for a discount and take months to find a taker, with landlord consent.' : 'The landlord charges most of what is left to let you out.'} Build-out of $${Math.round(l.buildCost).toLocaleString('en-US')} is gone either way.` });
  }
  if (w.mode === 'lease' || (w.mode === 'hybrid' && w.hybridBase === 'lease')) w.mode = 'remote';
  syncWorkplaceBills(state);
  return { how, paid, left };
}

export function renewLease(state, termYears = 3) {
  const w = wp(state);
  const l = w.lease;
  if (!l || l.ended) throw new Error('No lease to renew.');
  if (termYears < 1 || termYears > 5) throw new Error('Renew for 1-5 years.');
  l.endDay = Math.max(l.endDay, state.day) + Math.round(termYears * 365);
  l.holdover = false;
  l.monthly = round2(l.monthly * 1.03 ** (l.termYears)); // market step [design]
  l.renewed = (l.renewed ?? 0) + 1;
  syncWorkplaceBills(state);
  return l;
}

// ---------------------------------------------------------------------------
// Effects on hiring, quits and productivity
// ---------------------------------------------------------------------------
export function jobMode(state, job) {
  if (job.remote !== false) return 'remote';
  return wp(state).mode === 'hybrid' ? 'hybrid' : 'office';
}

/** Applicant-pool multiplier for a job: 1 for remote-friendly roles (the baseline), a fraction when the role needs the office. */
export function poolMult(state, job, forceMode = null) {
  const mode = forceMode ?? jobMode(state, job);
  if (mode === 'remote') return { mult: 1, mode };
  const big = CITIES[wp(state).city]?.big ?? false;
  return { mult: (mode === 'hybrid' ? POOL.hybrid : POOL.office)[big ? 'big' : 'small'], mode };
}

/** Salary ask multiplier for an office-based role in an expensive city. */
export function locationAskMult(state, job) {
  if (job.remote !== false) return 1;
  return CITIES[wp(state).city]?.ask ?? 1;
}

/** Called when a job opens: an office-required post is a smaller pool. */
export function workplaceOnOpenJob(state, job) {
  const { mult, mode } = poolMult(state, job);
  job.workMode = mode;
  if (mode === 'remote') return null;
  const extra = Math.round(Math.min(90, 30 * (1 / mult - 1)));
  return logMistake(state, { functionId: 'people_ops', id: 'office_required_shrinks_pool', label: `${mode === 'hybrid' ? 'Hybrid' : 'In-office'} role posted: the applicant pool is ${Math.round(mult * 100)}% of a remote one`, app: 'people', key: `pool:${job.id}`, delayed: true, cost: { days: extra, hours: 3 }, detail: `"${job.title}" needs people in the room, so only the commute radius applies. Remote openings were ~10-16% of postings but drew 44-46% of applications (LinkedIn). Expect roughly ${extra} extra days to fill and a thinner shortlist. Require the office only where the work truly does.` });
}

export function workplaceAttrMult(state, m) {
  const w = wp(state);
  if (!w.mode) return 1;
  return MODE_ATTR[w.mode] ?? 1;
}

/** Small productivity edge for juniors when they are in the room. */
export function juniorEdge(state, m) {
  const w = wp(state);
  if (!w.mode || m.seniority !== 'junior') return 1;
  const share = { remote: 0, cowork: 0.3, hybrid: 0.5, lease: 1 }[w.mode] ?? 0;
  return 1 + JUNIOR_IN_PERSON * share;
}

export function inPersonShare(state) {
  const w = wp(state);
  return { remote: 0, cowork: 0.3, hybrid: 0.5, lease: 1 }[w.mode ?? 'remote'] ?? 0;
}

// ---------------------------------------------------------------------------
// Founder isolation and offsites
// ---------------------------------------------------------------------------
export function isolationDrain(state) {
  const w = wp(state);
  const team = (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && (m.status === 'active')).length;
  if (team > 0) return 0;
  if (w.mode === 'lease' || w.mode === 'hybrid') return 0;
  if (w.mode === 'cowork') return ISOLATION.coworkDesk;
  const passes = clamp(w.dayPasses ?? 0, 0, 2);
  return round2(ISOLATION.weeklyEnergy * ISOLATION.withPasses[passes]);
}

/** Hold a team offsite: local (a day, ~$600 a head) or retreat (3 days, ~$1,800 a head). */
export function holdOffsite(state, kind = 'local') {
  const p = state.apps.people;
  if (!OFFSITE.perPerson[kind]) throw new Error('Pick local or retreat.');
  const team = humansOf(p).filter((m) => m.status === 'active');
  if (team.length < 2) throw new Error('An offsite needs a team of at least two people besides you.');
  const w = wp(state);
  if (w.offsites.some((o) => state.day - o.day < 120)) throw new Error('You held one in the last four months; once or twice a year is the usual rhythm.');
  const people = team.length + 1;
  const cost = round2(OFFSITE.perPerson[kind] * people);
  post(state, { amount: -cost, counterparty: kind === 'retreat' ? 'Venue and travel' : 'Venue and catering', description: `Team offsite (${kind}, ${people} people)`, category: 'travel', method: 'card', meta: { app: 'people' } });
  const remoteBoost = w.mode === 'lease' ? 1 : 1.4; // distributed teams gain more from meeting in person [design]
  const boost = OFFSITE.morale * remoteBoost * (kind === 'retreat' ? 1.3 : 0.75);
  for (const m of team) m.morale = clamp((m.morale ?? 70) + boost, 0, 100);
  w.offsites.push({ day: state.day, kind, people, cost });
  w.offsiteUntil = state.day + OFFSITE.attrDays;
  return { cost, people, boost: round2(boost), hours: OFFSITE.planHours + OFFSITE.travelDays[kind] * 8 };
}
export const offsiteHours = (kind) => OFFSITE.planHours + OFFSITE.travelDays[kind] * 8;

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------
export function workplaceDay(state) {
  const w = wp(state);
  const l = w.lease;
  if (l && !l.ended) {
    // a lease whose rent bill is being declined three times is a default
    const rec = state.recurring.find((r) => r.id === ensureOps(state).rec.rent);
    if (rec && (rec.suspended || (rec.declines ?? 0) >= 3) && !l.defaultFlag) { l.defaultFlag = true; try { exitLease(state, 'default'); } catch { /* ended */ } return; }
    const left = l.endDay - state.day;
    if (left <= 180 && left > 150 && !l.renewalNotified) {
      l.renewalNotified = true;
      emitOps(state, 'lease_renewal_due', `${l.startDay}:${l.endDay}`, { endDay: l.endDay, label: `Lease ends ${fmtDate(state, l.endDay)}: renew, move or let it run` });
      notify(state, `Your lease ends ${fmtDate(state, l.endDay)} (~6 months). Decide now: landlords expect notice, and a holdover costs ~25% more per month.`, { type: 'warn', app: 'people' });
    }
    if (left <= 0 && !l.holdover) {
      l.holdover = true;
      notify(state, 'Your lease term ended. You are in holdover at 125% of rent, month to month. Renew or exit (Workplace).', { type: 'bad', app: 'people' });
      syncWorkplaceBills(state);
    }
  }
}

export function workplaceMonthEnd(state) {
  const w = wp(state);
  if (w.cowork && !w.cowork.ended || w.dayPasses) syncWorkplaceBills(state);
  if (w.cowork && w.cowork.term === 'year' && !w.cowork.ended && w.cowork.endDay != null && state.day >= w.cowork.endDay) { w.cowork.term = 'month'; w.cowork.endDay = null; syncWorkplaceBills(state); }
}
