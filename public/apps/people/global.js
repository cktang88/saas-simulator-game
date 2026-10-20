// Global and part-time hiring: time-zone overlap, English level, part-time economics, fraud and moonlighting,
// foreign-contractor classification and IP, FX fees and infrastructure risk. Region data and every [design] number:
// public/data/regions.js; research: docs/research/hiring-global/international-part-time.md.
//
// One place applies all of it to a member's output: applyOutputMods(m, key, v), called by performance.js outputFor,
// which every reader (capacity.js, Product, Helpdesk, Sales) already goes through. Members hired before this module
// existed have no `tz` and are untouched.
//
// Randomness: candidate attributes come from a per-candidate stream (streamFor) so adding them did not move the
// main rng(state) sequence that the older hiring calibration tests depend on. Same seed, same candidate, same values.

import { rng, gaussian, chance, clamp, round2 } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { REGION_DATA, SENIORITY, ENGLISH_LEVELS, ENGLISH_WEIGHT, OVERLAP_NEED, PART_TIME_FIT, NIGHT_PREMIUM, partTimePremium } from '../../data/regions.js';
import { JOB_ROLES, EOR_LOAD } from './catalog.js';
import { poolMult as officePool_ } from './workplace.js';

export { ENGLISH_LEVELS, ENGLISH_WEIGHT, OVERLAP_NEED, PART_TIME_FIT, partTimePremium, NIGHT_PREMIUM };
export const FN = 'global_hiring';
export const regionData = (r) => REGION_DATA[r] ?? REGION_DATA.us;

// A deterministic stream per (state seed, salt): same API as rng(state) (any object with a `seed`).
export function streamFor(state, salt) {
  let h = 0x811c9dc5;
  const str = `${salt}|${state.seed}`;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return { seed: h | 0 };
}

// ---------------------------------------------------------------------------
// Company core hours and overlap
// ---------------------------------------------------------------------------

export const CORE_PRESETS = {
  et: { label: 'US Eastern', tz: -5, start: 9, end: 17 },
  ct: { label: 'US Central', tz: -6, start: 9, end: 17 },
  pt: { label: 'US Pacific', tz: -8, start: 9, end: 17 },
  utc: { label: 'UTC', tz: 0, start: 9, end: 17 },
  cet: { label: 'Central Europe', tz: 1, start: 9, end: 17 },
};
export const DEFAULT_CORE = { ...CORE_PRESETS.et };

export function ensureGlobal(p) {
  p.global ??= { core: { ...DEFAULT_CORE }, handoffPlanned: false, ipReviewed: {} };
  return p.global;
}
export const coreOf = (state) => state.apps.people?.global?.core ?? DEFAULT_CORE;

const mod24 = (x) => ((x % 24) + 24) % 24;
// Hours per day two working windows share. core = { tz, start, end } (company local), window = a person's local day.
export function overlapHours(core, tz, start = 9, len = 8) {
  const coreLen = core.end - core.start;
  let n = 0;
  for (let i = 0; i < 48; i++) {
    const t = i * 0.5; // UTC hour
    if (mod24(t + core.tz - core.start) < coreLen && mod24(t + tz - start) < len) n++;
  }
  return n * 0.5;
}
// Local-time share of a window that falls between 22:00 and 06:00 (night work).
function nightShare(start, len) {
  let n = 0, total = 0;
  for (let i = 0; i < len * 2; i++) { const h = mod24(start + i * 0.5); total++; if (h >= 22 || h < 6) n++; }
  return total ? n / total : 0;
}

export function setCoreHours(state, { tz, start, end, label } = {}) {
  const p = state.apps.people;
  const g = ensureGlobal(p);
  const c = { tz: Number(tz), start: Number(start), end: Number(end), label: label ?? 'Custom' };
  if (![c.tz, c.start, c.end].every(Number.isFinite) || c.tz < -12 || c.tz > 14) throw new Error('Pick a UTC offset between -12 and +14.');
  if (c.end - c.start < 4 || c.end - c.start > 12 || c.start < 0 || c.end > 24) throw new Error('Core hours must span 4 to 12 hours within one day.');
  g.core = c;
  for (const m of p.members) if (m.tz != null) refreshOverlap(state, m);
  return c;
}

export function refreshOverlap(state, m) {
  const len = m.windowLen ?? 8;
  m.overlapHours = overlapHours(coreOf(state), m.tz, m.workStart ?? 9, len);
  return m.overlapHours;
}

// Natural overlap for a region/place with an ordinary 9-17 day (the candidate's own start varies 8-10).
export const placeOverlap = (state, place, start = 9, len = 8) => overlapHours(coreOf(state), place.tz, start, len);

// Share of a region's pool (places x start times) with at least `required` natural overlap hours.
export function poolShare(state, region, required, len = 8) {
  if (!(required > 0)) return 1;
  const need = Math.min(required, len, coreOf(state).end - coreOf(state).start);
  let ok = 0, total = 0;
  for (const pl of regionData(region).places) for (const st of [8, 9, 9, 9, 10]) { total++; if (overlapHours(coreOf(state), pl.tz, st, len) >= need - 1e-9) ok++; }
  return total ? ok / total : 1;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const englishWeight = (role) => ENGLISH_WEIGHT[role] ?? 0.3;
export const customerFacing = (role) => englishWeight(role) >= 0.6;
export const overlapNeed = (role) => OVERLAP_NEED[role] ?? 3;
export const isFractionalRole = (role) => Boolean(JOB_ROLES[role]?.fractional);
export const partTimeFit = (role) => PART_TIME_FIT[role] ?? { fit: 0.5, load: [30, 40], note: '' };
export const englishLabel = (level) => ENGLISH_LEVELS[clamp(Math.round(level), 1, 5)] ?? '—';

// ---------------------------------------------------------------------------
// Candidate attributes (drawn once, from the region's distributions)
// ---------------------------------------------------------------------------

function drawIndex(S, probs) {
  const u = rng(S);
  let acc = 0;
  for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (u < acc) return i; }
  return probs.length - 1;
}
export function drawEnglish(S, region, place, role) {
  const probs = place.english ?? regionData(region).english;
  let level = drawIndex(S, probs) + 1;
  // People self-select into customer-facing work: a weak speaker abroad is less likely to apply [design].
  if (region !== 'us' && customerFacing(role) && level < 3 && rng(S) < 0.5) level = drawIndex(S, probs) + 1;
  return level;
}

// The resume line: what they claim. Confident presenters round up [design].
export function englishClaim(S, level, polishZ) {
  const up = rng(S) < clamp(0.15 + 0.12 * polishZ, 0.03, 0.4) ? 1 : 0;
  return clamp(level + up, 1, 5);
}

/**
 * Everything region-driven about one candidate. job: the posting (hoursPerWeek, partTime, fractional, senior,
 * requiredOverlap, allowShift). Returns plain fields to merge onto the candidate.
 */
export function candidateGlobal(state, job, id, role, region, polishZ = 0) {
  const rd = regionData(region);
  const S = streamFor(state, `cand|${id}`);
  const r = () => rng(S);
  const core = coreOf(state);
  const hours = job.hoursPerWeek ?? 40;
  const len = job.fractional ? Math.min(4, Math.max(2, hours / 5)) : clamp(hours / 5, 2, 8);
  const required = job.requiredOverlap ?? 0;

  // Seniority: the senior share of the pool thins in smaller or junior-heavy markets.
  const sSen = rd.seniorShare, sJun = (1 - sSen) * 0.45;
  const u = r();
  const seniority = job.senior ? 'senior' : u < sSen ? 'senior' : u < sSen + (1 - sSen - sJun) ? 'mid' : 'junior';

  // Place and working window. Conditional on the requirement when the job does not accept shifted hours.
  let place = rd.places[Math.floor(r() * rd.places.length)];
  let workStart = [8, 9, 9, 9, 10][Math.floor(r() * 5)];
  if (required > 0 && !job.allowShift) {
    const need = Math.min(required, len, core.end - core.start);
    for (let i = 0; i < 12 && overlapHours(core, place.tz, workStart, len) < need - 1e-9; i++) { place = rd.places[Math.floor(r() * rd.places.length)]; workStart = [8, 9, 9, 9, 10][Math.floor(r() * 5)]; }
  }
  const natural = overlapHours(core, place.tz, workStart, len);
  let overlap = natural, shiftHours = 0, premium = 0, shifted = false;
  if (required > natural && job.allowShift) {
    // They move their day toward yours: smallest shift that reaches the requirement (or the most possible).
    const target = Math.min(required, len, core.end - core.start);
    let hit = null, most = { s: 0, o: natural };
    for (let k = 1; k <= 24 && !hit; k++) for (const sh of [k * 0.5, -k * 0.5]) {
      const o = overlapHours(core, place.tz, mod24(workStart + sh), len);
      if (o > most.o + 1e-9) most = { s: sh, o };
      if (o >= target - 1e-9 && !hit) hit = { s: sh, o };
    }
    const best = hit ?? most;
    if (best.s !== 0) {
      shifted = true; shiftHours = Math.abs(best.s); workStart = mod24(workStart + best.s); overlap = best.o;
      const ns = nightShare(workStart, len);
      premium = ns >= 0.25 ? NIGHT_PREMIUM : shiftHours >= 2 ? 0.05 : 0;
    }
  }
  const english = drawEnglish(S, region, place, role);
  const buyerFit = round2(clamp(rd.buyerFit + 0.15 * gaussian(S) + 0.03 * (english - 3), 0.1, 1));
  const [nlo, nhi] = rd.noticeDays;
  const emp = nlo + Math.floor(r() * (nhi - nlo + 1));
  return {
    seniority, country: place.country, city: place.city, tz: place.tz, workStart, windowLen: len,
    naturalOverlap: round2(natural), overlapHours: round2(overlap), nightShift: shifted && premium >= NIGHT_PREMIUM, shiftHours, shiftPremium: premium,
    englishLevel: english, englishClaim: englishClaim(S, english, polishZ), buyerFit,
    noticeDays: { employee: emp, contractor: clamp(Math.round(emp / 5), 3, 14) },
    moonRoll: r(), fraudRoll: r(), noiseRoll: r(),
  };
}

// Expected pay multiplier from seniority (applies outside the US pool the older calibration is built on, and to senior jobs).
export const seniorityAsk = (region, job, seniority) => (region !== 'us' || job.senior ? SENIORITY[seniority].ask : 1);
// Quality shift of an applicant's seniority outside the US [design]: juniors -3, seniors +3 on role-weighted traits.
export const seniorityQuality = (region, seniority) => (region === 'us' ? 0 : { junior: -3, mid: 0, senior: 3 }[seniority]);

// Applicant flow multipliers for an open job: pool depth, seniority and time-zone requirement.
export function regionFlow(state, job) {
  const rd = regionData(job.region);
  const len = job.fractional ? 4 : clamp((job.hoursPerWeek ?? 40) / 5, 2, 8);
  const sen = job.senior ? clamp(rd.seniorShare / 0.32, 0.12, 1.2) : 1;
  const zone = job.allowShift ? 1 : poolShare(state, job.region, job.requiredOverlap ?? 0, len);
  // Office-required roles draw from the commute radius only (remote openings drew 44-46% of applications, LinkedIn): people/workplace.js
  const office = job.remote === false ? officePool_(state, job).mult : 1;
  const profiles = rd.poolDepth * sen * Math.max(zone, 0.02) * office;
  const apps = profiles * (job.region === 'us' ? 1 : 1 + 3 * (rd.noise - 0.08));
  return { profiles, apps, zone, sen, office };
}

// Fake and overemployed candidates. Base fraud share comes from the role pool (data/roles.js fraudShareRemote); region
// raises it (DOJ remote IT worker schemes, Gartner 2025 [sourced, reported counts conflict]); overemployment [design].
export const MOONLIGHT_BASE = 0.05; // share of remote applicants working a second full-time job undisclosed [design; surveys are self-selected upper bounds]
export function fraudKinds(state, role, region, remote, baseShare, technical, g, baseFraud) {
  const rd = regionData(region);
  let fraud = baseFraud;
  if (!fraud && remote) {
    const extra = baseShare * (technical ? Math.max(0, rd.fraudMult - 1) : 0.3 * rd.fraudMult);
    if (g.fraudRoll < extra) fraud = 'stand_in';
  }
  const moonlight = !fraud && remote && g.moonRoll < MOONLIGHT_BASE * (technical ? 1.3 : 1) * (0.4 + 0.6 * rd.fraudMult);
  return { fraud, moonlight };
}

// ---------------------------------------------------------------------------
// English evidence (interviews and written work reveal it; the resume only claims it)
// ---------------------------------------------------------------------------

export function recordEnglish(state, c, method, sd, bias = 0) {
  if (c.englishLevel == null) return null;
  c.english ??= { reads: [] };
  const noise = gaussian(streamFor(state, `${c.id}|eng|${method}|${c.english.reads.length}`)); // own stream: no effect on the main rng sequence
  c.english.reads.push({ method, obs: round2(clamp(c.englishLevel + bias + noise * sd, 1, 5)), sd });
  return englishEstimate(c);
}
export function englishEstimate(c) {
  const reads = c.english?.reads ?? [];
  if (!reads.length) return null;
  let num = 0, den = 0;
  for (const r of reads) { const w = 1 / (r.sd * r.sd); num += r.obs * w; den += w; }
  return { level: round2(num / den), sd: round2(1 / Math.sqrt(den)), n: reads.length, methods: [...new Set(reads.map((r) => r.method))] };
}

// ---------------------------------------------------------------------------
// Part-time economics
// ---------------------------------------------------------------------------

// Output per paid hour for fewer hours (context switching, ramp overhead): a 20 h person is ~68% as productive per
// paid hour as a full-timer [design; research §4: 60-75%]. Fractional execs are used to it: milder.
export function partTimeEfficiency(hours, fractional = false) {
  if (!(hours < 40)) return 1;
  const gap = 1 - hours / 40;
  return round2(fractional ? 1 - 0.3 * gap : 1 - 0.64 * gap);
}
// How overloaded a part-timer is: hours the role really demands / hours paid. > 1.25 burns people out.
export function loadRatio(m) {
  if (!m.loadHours) return 1;
  return round2(Math.max(1, m.loadHours / Math.max(1, m.hoursPerWeek ?? 40)));
}
export const drawLoadHours = (state, role) => {
  const [lo, hi] = partTimeFit(role).load;
  return round2(lo + rng(state) * (hi - lo));
};

// ---------------------------------------------------------------------------
// The one place output modifiers are computed
// ---------------------------------------------------------------------------

const NEUTRAL = Object.freeze({ neutral: true, cust: 1, speed: 1, bugs: 1, volume: 1, short: 0, need: 0, ptEff: 1, gap: 0 });

export function workMods(m) {
  if (m.tz == null || m.kind === 'ai_agent') return NEUTRAL;
  const role = m.jobRole ?? m.role;
  const rd = regionData(m.region);
  const hrs = m.hoursPerWeek ?? 40;
  const w = englishWeight(role);
  const cust = w >= 0.6;
  const level = m.english ?? 5;
  const gap = Math.max(0, (cust ? 4 : 3) - level);
  const fit = m.buyerFit ?? 0.8;
  const perDay = clamp(hrs / 5, 1, 8);
  const need = Math.min(overlapNeed(role), Math.max(1, 0.75 * perDay));
  const short = Math.max(0, need - Math.min(m.overlapHours ?? 8, perDay));
  const ptEff = partTimeEfficiency(hrs, m.fractional);
  const holiday = (260 - rd.holidays) / (260 - REGION_DATA.us.holidays);
  const moon = m.moonlight ? 0.62 : 1;
  const language = 1 - w * (0.11 * gap + 0.35 * Math.max(0, 0.6 - fit));
  const custF = clamp(language - (cust ? 0.045 * short * w : 0), 0.45, 1);
  return {
    neutral: false, cust: round2(custF), gap, short: round2(short), need: round2(need), ptEff,
    // engineering and other delivery work: slower cycles when feedback arrives a day later; spec misunderstandings add rework
    speed: round2(ptEff * (1 - 0.06 * short) * clamp(language, 0.6, 1) * holiday * moon),
    bugs: round2(1 + 0.07 * short + 0.5 * (1 - clamp(language, 0.6, 1))),
    volume: round2((hrs / 40) * ptEff * moon),
    moon,
  };
}

const SPEED_KEYS = new Set(['velocityMult', 'throughputMult', 'ticketsPerDayMult', 'piecesPerWeekMult']);
const VOLUME_KEYS = new Set(['quotaAttainment', 'meetingsPerMonth']);
const CUSTOMER_KEYS = new Set(['winRateMult', 'replyRateMult', 'technicalWinMult', 'expansionMult', 'renewalMult', 'healthAccuracy', 'contentQuality', 'designQuality']);

export function applyOutputMods(m, key, v) {
  const x = workMods(m);
  if (x.neutral || v == null) return v;
  if (SPEED_KEYS.has(key)) return round2(v * x.speed * (key === 'ticketsPerDayMult' ? x.cust ** 0.3 : 1));
  if (key === 'bugRateMult') return round2(v * x.bugs);
  if (VOLUME_KEYS.has(key)) return round2(v * x.cust * x.volume);
  if (CUSTOMER_KEYS.has(key)) return round2(key === 'contentQuality' || key === 'designQuality' ? v * (0.5 + 0.5 * x.cust) : v * x.cust);
  if (key === 'csat') return round2(Math.min(0.99, 1 - (1 - v) * (1 + 2.2 * (1 - x.cust))));
  if (key === 'churnMult') return round2(v / x.cust);
  if (key === 'firstResponseMult') return round2(v * (1 + 0.5 * (1 - (m.hoursPerWeek ?? 40) / 40)));
  return v;
}

// Extra founder hours a week this person costs in coordination: async handoffs, odd-hour calls, part-time catch-up.
export function coordHours(m) {
  if (m.tz == null) return 0;
  const x = workMods(m);
  const hrs = m.hoursPerWeek ?? 40;
  return round2(0.45 * x.short + (m.region === 'us' ? 0 : 0.4) + 0.3 * (1 - hrs / 40) + (m.moonlight ? 0.5 : 0));
}

// Founder calls outside your own day: when the overlap with your core hours is under 2 h, 1:1s and handoffs land
// before 8 or after 18 your time. Hours a week of that.
export function oddHours(m) {
  if (m.tz == null || m.kind === 'ai_agent' || m.status !== 'active') return 0;
  const o = m.overlapHours ?? 8;
  return o < 1 ? 1.5 : o < 2 ? 0.75 : 0;
}

// Output lost to power and internet outages over the last 30 days.
export function outageFactor(m, day) {
  const lost = (m.outageLog ?? []).filter((o) => day - o.day < 30).reduce((a, o) => a + o.days, 0);
  return lost ? round2(clamp(1 - lost / 22, 0.3, 1)) : 1;
}

export function attritionFactor(m) {
  let f = 1;
  if (m.nightShift) f *= 1.3; // working through your own night is hard to keep up [design]
  const over = loadRatio(m);
  if (over > 1.25) f *= clamp(1 + 0.6 * (over - 1), 1, 2.2);
  return f;
}
export const moraleDrag = (m) => { const over = loadRatio(m); return over > 1.25 ? Math.min(15, 10 * (over - 1)) : 0; };

// ---------------------------------------------------------------------------
// Support coverage across time zones
// ---------------------------------------------------------------------------

export function supportCoverage(state) {
  const staff = (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.role === 'support' && m.status === 'active' && m.tz != null && state.day >= m.startDay);
  if (!staff.length) return null;
  const core = coreOf(state);
  const covered = new Array(48).fill(false);
  for (const m of staff) {
    const len = m.windowLen ?? 8;
    for (let i = 0; i < 48; i++) if (mod24(i * 0.5 + m.tz - (m.workStart ?? 9)) < len) covered[i] = true;
  }
  let bizTotal = 0, biz = 0;
  for (let i = 0; i < 48; i++) if (mod24(i * 0.5 + core.tz - core.start) < core.end - core.start) { bizTotal++; if (covered[i]) biz++; }
  const hours24 = covered.filter(Boolean).length * 0.5;
  const planned = Boolean(state.apps.people?.global?.handoffPlanned);
  return { n: staff.length, biz: bizTotal ? biz / bizTotal : 1, hours24, planned, followTheSun: hours24 >= 16 };
}
// First-response time multiplier from coverage: unplanned handoffs make your business hours slower; a runbook halves
// the damage; planned follow-the-sun coverage beats a single local shift [design].
export function coverageFrtMult(state) {
  const c = supportCoverage(state);
  if (!c) return 1;
  const gapMult = 1 + 0.9 * (1 - c.biz) * (c.planned ? 0.45 : 1);
  return round2(gapMult * (c.followTheSun && c.planned ? 0.85 : 1));
}
// Backup power and internet for someone on an unreliable grid: about $60/month, halves outage risk and length [design].
export function setStipend(state, memberId, on) {
  const m = (state.apps.people?.members ?? []).find((x) => x.id === memberId);
  if (!m || m.kind === 'ai_agent' || m.status === 'gone') throw new Error('Not on the team.');
  m.stipend = Boolean(on);
  return m;
}
export function planCoverage(state) {
  const g = ensureGlobal(state.apps.people);
  g.handoffPlanned = true;
  g.plannedDay = state.day;
  return g;
}

// ---------------------------------------------------------------------------
// Money: FX and payment fees
// ---------------------------------------------------------------------------

export const fxFeePct = (region) => regionData(region).fxFeePct ?? 0;
export function postFxFee(state, m, base, label, vendor = 'Deel') {
  const fee = round2(base * fxFeePct(m.region));
  if (fee <= 0) return 0;
  post(state, { amount: -fee, counterparty: vendor, description: `${vendor.toUpperCase()} FX & PAYOUT FEES ${label}: ${m.name} (${regionData(m.region).currency})`, category: 'other', method: 'ach', meta: { app: 'people', memberId: m.id, fx: true, fees: true } });
  return fee;
}

// ---------------------------------------------------------------------------
// Events: at start, weekly and monthly
// ---------------------------------------------------------------------------

const payMonthly = (m) => (m.engagement === 'contractor' ? (m.hourlyRate ?? 0) * (m.hoursPerWeek ?? 40) * 52 / 12 : (m.salary ?? 0) / 12);
const mk = (state, m, id, label, cost, detail, extra = {}) => logMistake(state, { functionId: FN, id, label, app: 'people', key: `${id}:${m.id}`, cost, detail, ...extra });

/** The first day a hire works: mistakes that are already baked in. Each is traceable and keeps costing afterwards. */
export function globalStart(state, m) {
  if (m.kind === 'ai_agent' || m.kind === 'cofounder') return;
  const p = state.apps.people;
  const role = m.jobRole ?? m.role;
  const x = workMods(m);
  const planned = Boolean(p?.global?.handoffPlanned);
  if (m.tz != null) {
    if (customerFacing(role) && role !== 'support' && x.short >= 2) {
      mk(state, m, 'low_overlap_customer_role', 'Customer-facing hire with little overlap with buyer hours', { hours: 4 },
        `${m.name} (${m.city ?? m.region}) overlaps ${m.overlapHours}h a day with your core hours; a ${role.replace(/_/g, ' ')} needs about ${x.need}h. Replies, demos and renewals wait a day: conversion and retention carry a ~${Math.round((1 - x.cust) * 100)}% penalty, and you spend ~${coordHours(m).toFixed(1)}h a week on handoffs.`, { charge: true });
    } else if (role === 'support' && x.short >= 1 && !planned) {
      mk(state, m, 'low_overlap_customer_role', 'Support hire with no handoff plan across time zones', { hours: 3 },
        `${m.name} works while your customers are asleep (overlap ${m.overlapHours}h). With no handoff runbook and shift schedule, first response in your business hours gets worse. Plan coverage in People, or add a second shift for follow-the-sun.`, { charge: true });
    }
    if (customerFacing(role) && (m.english ?? 5) <= 3) {
      mk(state, m, 'english_mismatch_customer_facing', 'English level below what a customer-facing role needs', { hours: 6, reputation: 0.2 },
        `${m.name}'s English is ${englishLabel(m.english).toLowerCase()} (level ${m.english}/5); selling or supporting US and UK buyers needs 4. Expect lower reply, conversion and CSAT (~${Math.round((1 - x.cust) * 100)}% penalty). An interview that makes the candidate talk through a case, plus a written sample, shows this before the offer.`, { charge: true, delayed: true });
    }
  }
  if (m.engagement === 'contractor') {
    const foreign = m.region !== 'us';
    if (foreign && (m.hoursPerWeek ?? 40) >= 30 && !m.cor) {
      mk(state, m, 'misclassified_foreign_contractor', 'Full-time foreign contractor without an EOR or Contractor of Record', { hours: 3 },
        `${m.name} works ${m.hoursPerWeek}h a week for you in ${regionData(m.region).label}. Regulators look at control, tools and integration, not the label; permanent-establishment and local labour-law liability can reach back across the whole relationship. Use an EOR or Contractor of Record for staff-like work, or keep a contractor to a defined project.`, { charge: true, delayed: true });
      m.classificationFlag = true;
    }
    if (!m.ciiaa || (foreign && !m.ipLocal)) {
      mk(state, m, 'no_ip_assignment_contractor', foreign && m.ciiaa ? 'Foreign contractor without a locally enforceable IP assignment' : 'Contractor without an IP assignment', { hours: 2 },
        `${m.name} creates code, designs or copy for you ${foreign ? 'under local law, where a US form may not transfer ownership' : 'with no signed invention assignment'}: the IP may not belong to the company, and investors' counsel flags it in diligence. Add an IP assignment clause (and a local-law review for ${foreign ? regionData(m.region).label : 'each new country'}) before work starts.`, { charge: true, delayed: true });
      m.ipGap = true;
    }
  }
  const fit = partTimeFit(role);
  if ((m.hoursPerWeek ?? 40) < 35 && m.loadHours && loadRatio(m) > 1.25) {
    mk(state, m, 'part_time_full_time_job', 'Part-time contract for a full-time job', { hours: 2 },
      `${role.replace(/_/g, ' ')} work at a startup runs about ${Math.round(m.loadHours)}h a week (${fit.note}); ${m.name} is contracted for ${m.hoursPerWeek}h. The gap shows up as overwork, slipping morale and attrition (${Math.round((attritionFactor(m) - 1) * 100)}% higher quit risk), and the output you paid for does not stretch to fill it.`, { charge: true, delayed: true });
  }
}

/** Monday: founder energy from calls at odd hours. */
export function globalWeekly(state, m) {
  const odd = oddHours(m);
  m.oddHours = odd;
  if (odd > 0 && state.founder) state.founder.energy = clamp((state.founder.energy ?? 70) - 0.7 * odd, 0, 100);
  return odd;
}

/** Month end: fraud and moonlighting surface, security incidents, outages, classification claims, overload. */
export function globalMonthly(state, m) {
  if (m.kind === 'ai_agent' || m.kind === 'cofounder' || m.status !== 'active') return;
  const rd = regionData(m.region);
  const S = streamFor(state, `${m.id}|month|${state.day}`); // own stream: these events never move the main rng sequence
  const tenureMonths = Math.max(1, (state.day - m.startDay) / 30.4);

  // Identity fraud that was missed at hire: found (existing monthlyIncidents) or turns into a security incident.
  if (m.fraud === 'stand_in') {
    if (m.fraudFound && !m.fraudLogged) {
      m.fraudLogged = true;
      const wasted = Math.round(payMonthly(m) * tenureMonths);
      mk(state, m, 'hired_fraudulent_candidate', 'Hired a fake candidate (identity fraud)', { usd: wasted + 4000, hours: 10, days: 30 },
        `${m.name} was not the person you interviewed. You paid about $${wasted.toLocaleString('en-US')} for work that did not match, spent hours on forensics and re-hiring, and rotated every credential they touched. A camera-on interview, a paid trial, backchannel calls and a background check with identity verification catch this before the offer.`, { charge: true, circles: true, delayed: true });
    } else if (!m.fraudFound && ['engineer', 'ai_engineer', 'ops', 'support', 'designer'].includes(m.role) && chance(S, 0.06)) {
      m.fraudFound = true; m.fraudLogged = true;
      const usd = Math.round(12000 + rng(S) * 33000);
      post(state, { amount: -usd, counterparty: 'Incident response firm', description: `Security incident: access abused by ${m.name} (identity fraud); forensics, credential rotation, customer notice`, category: 'legal', method: 'ach', meta: { app: 'people', memberId: m.id } });
      notify(state, `Security incident: ${m.name}, hired under a false identity, exfiltrated repository and customer data. Response cost ${'$' + usd.toLocaleString('en-US')}. Cut their access today.`, { type: 'bad', app: 'people' });
      mk(state, m, 'hired_fraudulent_candidate', 'Fake hire exfiltrated code and data', { usd: usd + Math.round(payMonthly(m) * tenureMonths), hours: 16, reputation: 1, days: 30 },
        `${m.name} used the access you gave a remote hire you never verified (DOJ remote IT-worker cases follow this pattern). Data and IP left the company; you paid for incident response and pay while it happened.`, { charge: true, circles: true });
    }
  }

  // Overemployed (J2): quietly working another full-time job.
  if (m.moonlight && !m.moonFound && tenureMonths >= 0.7 && chance(S, 0.12)) {
    m.moonFound = true;
    const wasted = Math.round(payMonthly(m) * 0.4 * tenureMonths);
    notify(state, `${m.name} is working a second full-time job: missed standups, calendar clashes and a LinkedIn update gave it away. About ${'$' + wasted.toLocaleString('en-US')} of pay bought little output.`, { type: 'bad', app: 'people' });
    mk(state, m, 'overemployed_hire', 'Hired someone working two full-time jobs', { usd: wasted, hours: 6, days: 14 },
      `${m.name} split their week with another employer: output ran ~40% under what you paid for and responsiveness was poor. Reference and backchannel calls, an employment-verification background check and a paid trial surface this.`, { charge: true, delayed: true });
  }

  // Outages (power and internet): lost days, halved by a backup stipend.
  const place = rd.places.find((pl) => pl.city === m.city);
  const pOut = (place?.outage ?? rd.outage) * (m.stipend ? 0.5 : 1);
  if (pOut > 0 && chance(S, pOut)) {
    const days = m.stipend ? 1 : 1 + Math.floor(rng(S) * 3);
    (m.outageLog ??= []).push({ day: state.day, days });
    if (m.outageLog.length > 12) m.outageLog.shift();
    notify(state, `${m.name} lost power or internet for ${days} day${days > 1 ? 's' : ''} (${m.city}).${m.stipend ? '' : ' No backup power or internet stipend.'}`, { type: 'warn', app: 'people' });
  }
  if (m.stipend) post(state, { amount: -60, counterparty: m.name, description: `Backup power and internet stipend: ${m.name}`, category: 'other', method: 'ach', meta: { app: 'people', memberId: m.id } });

  // Foreign contractor reclassified: back contributions, legal fees, permanent-establishment risk.
  if (m.engagement === 'contractor' && m.region !== 'us' && !m.cor && !m.misclassified) {
    const factors = ((m.hoursPerWeek ?? 40) >= 30 ? 1 : 0) + (state.day - m.startDay > 180 ? 1 : 0) + (['engineer', 'support', 'sdr', 'ae'].includes(m.role) ? 1 : 0);
    if (factors >= 2 && chance(S, rd.misclassP * factors)) {
      m.misclassified = true;
      const back = Math.round(payMonthly(m) * Math.min(24, tenureMonths) * (EOR_LOAD[m.region] ?? 0.2));
      const legal = Math.round(6000 + rng(S) * 14000);
      post(state, { amount: -back, counterparty: 'Local labour authority', description: `Contractor reclassified as employee (${rd.label}): back contributions, ${m.name}`, category: 'taxes', method: 'wire', meta: { app: 'people', memberId: m.id } });
      post(state, { amount: -legal, counterparty: 'Local counsel', description: `Misclassification defence (${rd.label}): ${m.name}`, category: 'legal', method: 'ach', meta: { app: 'people', memberId: m.id } });
      notify(state, `${m.name}, engaged as a contractor in ${rd.label}, was reclassified as an employee: ${'$' + (back + legal).toLocaleString('en-US')} in back contributions and legal fees.`, { type: 'bad', app: 'people' });
      logMistake(state, { functionId: FN, id: 'misclassified_foreign_contractor', label: 'Foreign contractor reclassified as an employee', app: 'people', key: `claim:${m.id}`, delayed: true, cost: { usd: back + legal, hours: 12 }, charge: true,
        detail: `Staff-like work (${m.hoursPerWeek}h/week, ${Math.round(tenureMonths)} months) under a contractor label. An EOR or Contractor of Record would have carried this risk.` });
    }
  }

  // Part-timer asked to do a full-time job: morale and quit risk climb (attritionFactor, moraleDrag); say so once.
  if (loadRatio(m) > 1.25 && !m.overloadNoted) {
    m.overloadNoted = true;
    notify(state, `${m.name} is stretched: the role needs ~${Math.round(m.loadHours)}h a week and they are paid for ${m.hoursPerWeek}. Cut scope, add hours or add a second person before they leave.`, { type: 'warn', app: 'people' });
  }
}

// What the founder did before the offer, kept on the member so the operator reader can judge the process.
export function hireVetting(state, c, job) {
  const A = c.assessments ?? {};
  const ok = (k) => Boolean(A[k] && !A[k].dropped && A[k].found !== false);
  const bg = c.backgroundCheck;
  const est = englishEstimate(c);
  return {
    camera: Boolean(c.interview?.camera),
    trial: ok('paidTrial') ? 'paidTrial' : ok('workSample') ? 'workSample' : ok('walkthrough') ? 'walkthrough' : ok('takeHome') ? 'takeHome' : null,
    refs: ok('backchannel') ? 'backchannel' : ok('references') ? 'references' : null,
    bg: bg && bg.status !== 'no_consent' ? bg.pkg : null,
    englishRead: est ? { level: est.level, sd: est.sd, methods: est.methods, assessed: est.methods.some((x) => !/screen/.test(x)), written: est.methods.some((x) => /written|work sample|trial/.test(x)), spoken: est.methods.some((x) => /interview|screen|walkthrough/.test(x)) } : null,
    overlapPlanned: Boolean((job?.requiredOverlap ?? 0) > 0 || job?.allowShift || state.apps.people?.global?.handoffPlanned),
  };
}

// IP and classification gaps for diligence (Legal.legalIssues reads this).
export function foreignIpGaps(state) {
  return (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.status !== 'gone' && m.engagement === 'contractor' && m.region !== 'us' && m.ciiaa && !m.ipLocal);
}

// Buyer-facing summary of the board for the Team view.
export function memberGlobalLine(state, m) {
  if (m.tz == null) return null;
  const hrs = m.hoursPerWeek ?? 40;
  return { where: m.city ?? regionData(m.region).label, tz: `UTC${m.tz >= 0 ? '+' : ''}${m.tz}`, overlap: m.overlapHours, hours: hrs, partTime: hrs < 35, english: m.english, nightShift: Boolean(m.nightShift) };
}

