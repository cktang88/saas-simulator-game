// Global and part-time hiring: regions, time-zone overlap, English, fraud and moonlighting, part-time economics,
// classification and IP, FX fees, and the global_hiring operator tiers. Short, targeted tests: one mechanic each,
// a few seeds, no long simulations. Research: docs/research/hiring-global/international-part-time.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator, mistakesSummary } from '../public/core/operator.js';
import { uid } from '../public/core/util.js';
import { ensureLegal, legalIssues } from '../public/apps/legal/sim.js';
import { REGION_DATA, REGION_IDS, partTimePremium } from '../public/data/regions.js';
import { JOB_ROLES, midSalary, midHourly, employerAnnual, benefitsEligible, EOR_LOAD } from '../public/apps/people/catalog.js';
import { makeCandidate, sampleTraits } from '../public/apps/people/candidates.js';
import {
  ensurePeople, createJob, applyJudge, screenCandidate, scheduleInterview, startInterview, askQuestion, finishInterview, hireFromCandidate,
  makeOffer, openJob, peopleMonthEnd, attritionProbability,
} from '../public/apps/people/sim.js';
import { overlapHours, poolShare, regionFlow, setCoreHours, coreOf, workMods, partTimeEfficiency, supportCoverage, coverageFrtMult, planCoverage, globalStart, globalWeekly, globalMonthly, englishEstimate, outageFactor, attritionFactor, moraleDrag, loadRatio, CORE_PRESETS } from '../public/apps/people/global.js';
import { outputFor, productivityFor, managementHours } from '../public/apps/people/performance.js';
import { devHoursPerWeek, supportQuality, monthlyPeopleCost } from '../public/apps/people/capacity.js';
import { monthlyCostOf, payrollLines, contractorInvoice } from '../public/apps/people/payroll.js';
import { runAssessment } from '../public/apps/people/assess.js';
import { orderBackgroundCheck, backgroundDay } from '../public/apps/people/screening.js';
import { QUESTIONS } from './helpers/hiring-loops.js';
import { draft, hiringView, candidateView, engagementsFor } from '../public/apps/people/views-hiring.js';
import { teamGlobalCell, memberGlobalCard } from '../public/apps/people/views-global.js';
import { estimate } from '../public/apps/people/interview.js';

function fresh(seed = 21) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 800000, counterparty: 'Pat', category: 'owner_contribution' });
  s.founder.hoursPerWeek = 80;
  s.day = 100;
  ensurePeople(s);
  return s;
}
const JUDGE = { firstImpression: '', clarity: 8, specificity: 8, payTransparency: true, issues: [], rewriteHint: '' };
const job = (s, o) => { const j = createJob(s, { text: 'x', ...o }); applyJudge(j, JUDGE); return j; };
const cands = (s, j, n, agency = null) => Array.from({ length: n }, () => makeCandidate(s, j, agency, uid));
const flat = (v = 50) => Object.fromEntries(Object.keys(sampleTraits(fresh(), 'engineer').traits).map((k) => [k, v]));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
let seq = 0;
// A member with the new global fields, as hireFromCandidate would set them.
const member = (o = {}) => {
  const m = { id: `mem_g${seq++}`, name: `Person ${seq}`, role: 'engineer', jobRole: 'engineer', kind: 'employee', engagement: 'employee', region: 'us', status: 'active', startDay: 0, hoursPerWeek: 40, salary: 150000, equityPct: 0, morale: 70, rampWeeks: 8, traits: flat(50), tz: -5, workStart: 9, windowLen: 8, overlapHours: 8, english: 5, buyerFit: 0.85, city: 'Brooklyn, NY', ...o };
  m.productivity = productivityFor(m);
  return m;
};

test('regional pay: every role costs less outside the US, ordered by what the research supports', () => {
  assert.deepEqual(REGION_IDS.sort(), ['africa', 'canada', 'eeu', 'india', 'latam', 'pakistan', 'ph', 'us', 'weu']);
  for (const [id, r] of Object.entries(JOB_ROLES)) {
    for (const region of REGION_IDS.filter((x) => x !== 'us')) {
      assert.ok(midSalary(id, region) < midSalary(id, 'us'), `${id} ${region} salary below US`);
      assert.ok(midHourly(id, region) < midHourly(id, 'us'), `${id} ${region} rate below US`);
    }
    assert.ok(r.salary.us && r.hourly.us);
  }
  const eng = (r) => midSalary('engineer', r) / midSalary('engineer', 'us');
  assert.ok(Math.abs(eng('canada') - 0.63) < 0.03, 'Canada engineer ~63% of US (Terminal 2026)');
  assert.ok(eng('canada') > eng('latam') && eng('latam') > eng('india') && eng('canada') > eng('weu') - 0.05);
  assert.ok(midSalary('support', 'ph') / midSalary('support', 'us') < 0.3, 'Philippines support ~25-35% of US loaded cost');
  for (const r of REGION_IDS) { const d = REGION_DATA[r]; assert.ok(d.english.reduce((a, b) => a + b, 0) > 0.99 && d.english.length === 5 && d.places.length && d.noticeDays.length === 2 && d.currency); }
  assert.ok(EOR_LOAD.weu > EOR_LOAD.pakistan && EOR_LOAD.latam > EOR_LOAD.canada);
});

test('English level is drawn per candidate from the region distribution, never from the name', () => {
  const s = fresh();
  const j = job(s, { role: 'support', region: 'india', engagement: 'contractor', hoursPerWeek: 40 });
  const pool = cands(s, j, 300);
  // Full names are unique per game (core/names.js), so group by first name: the same name still shows different levels.
  const byName = {};
  for (const c of pool) (byName[c.name.split(' ')[0]] ??= []).push(c.englishLevel);
  const repeated = Object.values(byName).filter((lv) => lv.length >= 3).map((lv) => new Set(lv));
  assert.ok(repeated.length >= 3 && repeated.filter((set) => set.size >= 2).length >= repeated.length * 0.6, 'the same name shows different levels');
  const us = cands(s, job(s, { role: 'support', region: 'us', engagement: 'employee' }), 150);
  const pk = cands(s, job(s, { role: 'support', region: 'pakistan', engagement: 'contractor' }), 150);
  assert.ok(mean(us.map((c) => c.englishLevel)) > mean(pk.map((c) => c.englishLevel)) + 1, 'US pool speaks better English than Pakistan\'s on average');
  assert.ok(new Set(pool.map((c) => c.englishLevel)).size >= 4, 'a spread of levels inside one region');
  // The resume only claims a level; some round up.
  assert.ok(pool.some((c) => c.englishClaim > c.englishLevel) && pool.every((c) => c.englishClaim >= c.englishLevel));
});

test('interviews and written work reveal English; a screen call alone is a wide read', () => {
  const s = fresh();
  const j = job(s, { role: 'account_executive', region: 'latam', engagement: 'contractor', hoursPerWeek: 40 });
  const pool = cands(s, j, 40);
  const errScreen = [], errFull = [];
  const p = ensurePeople(s);
  for (const c of pool) p.candidates.push(c);
  for (const c of pool) {
    c.stage = 'new';
    screenCandidate(s, c.id, true);
    errScreen.push(Math.abs(englishEstimate(c).level - c.englishLevel));
    // A structured interview that probes (the same questions a stellar operator asks) plus a written sample.
    c.interview = { eventId: 'none', day: s.day, messages: QUESTIONS.stellar.map((q) => ({ from: 'me', text: q, grade: { type: 'behavioral', quality: 0.9, traits: ['communication'] } })), started: true, done: false };
    finishInterview(s, c.id);
    runAssessment(s, c, 'workSample', { scorecard: true });
    errFull.push(Math.abs(englishEstimate(c).level - c.englishLevel));
  }
  assert.ok(mean(errFull) < mean(errScreen) - 0.1, `screen ${mean(errScreen).toFixed(2)} vs interview + written sample ${mean(errFull).toFixed(2)}`);
  assert.ok(pool.every((c) => englishEstimate(c).n >= 2));
});

test('time-zone overlap is computed from offsets and your core hours; changing core hours updates the team', () => {
  const et = CORE_PRESETS.et;
  assert.equal(overlapHours(et, -5, 9, 8), 8, 'same zone');
  assert.equal(overlapHours(et, -3, 9, 8), 6, 'Buenos Aires');
  assert.equal(overlapHours(et, 1, 9, 8), 2, 'Kraków: 9-17 CET is 3-11 ET');
  assert.equal(overlapHours(et, 5.5, 9, 8), 0, 'Bengaluru');
  assert.equal(overlapHours(et, 8, 9, 8), 0, 'Manila works your night');
  assert.equal(overlapHours(et, 8, 22, 8), 8, 'Manila on a 22:00-06:00 night shift covers your day');
  assert.equal(overlapHours(CORE_PRESETS.utc, 8, 9, 8), 0, 'Manila 9-17 is 01-09 UTC: no overlap with a 09-17 UTC core');
  assert.equal(overlapHours(CORE_PRESETS.utc, 0, 9, 8), 8);
  const s = fresh();
  const p = ensurePeople(s);
  const m = member({ region: 'eeu', tz: 1, overlapHours: 2 });
  p.members.push(m);
  setCoreHours(s, { tz: 1, start: 9, end: 17, label: 'Central Europe' });
  assert.equal(m.overlapHours, 8);
  assert.equal(coreOf(s).label, 'Central Europe');
  assert.throws(() => setCoreHours(s, { tz: 1, start: 9, end: 11 }), /4 to 12/);
});

test('requiring more overlap than a region gives shrinks the pool, or costs a night-shift premium', () => {
  const s = fresh();
  assert.equal(poolShare(s, 'india', 0), 1);
  assert.ok(poolShare(s, 'india', 4) < 0.05, 'nobody in India overlaps 4h with US Eastern naturally');
  assert.ok(poolShare(s, 'latam', 4) > 0.9 && poolShare(s, 'weu', 4) < 0.2 && poolShare(s, 'canada', 4) > 0.9);
  const open = job(s, { role: 'support', region: 'ph', engagement: 'contractor', hoursPerWeek: 40 });
  const strict = job(s, { role: 'support', region: 'ph', engagement: 'contractor', hoursPerWeek: 40, requiredOverlap: 4 });
  const night = job(s, { role: 'support', region: 'ph', engagement: 'contractor', hoursPerWeek: 40, requiredOverlap: 4, allowShift: true });
  assert.ok(regionFlow(s, strict).profiles < regionFlow(s, open).profiles * 0.05, 'the requirement removes most of the pool (open flow is 1.2x US depth)');
  assert.equal(regionFlow(s, night).profiles, regionFlow(s, open).profiles, 'accepting shifted hours keeps the pool');
  const a = cands(s, open, 40), b = cands(s, night, 40);
  assert.ok(a.every((c) => c.naturalOverlap === 0));
  assert.ok(b.every((c) => c.nightShift && c.shiftPremium === 0.1 && c.naturalOverlap === 0));
  const ratio = mean(b.map((c) => c.expectation)) / mean(a.map((c) => c.expectation));
  assert.ok(ratio > 1.04 && ratio < 1.18, `night-shift premium ~+10%, got ${ratio.toFixed(3)}`);
  const strictCands = cands(s, strict, 20);
  assert.ok(strictCands.every((c) => c.naturalOverlap < 4), 'asked for 4h but nobody can: the closest few apply');
});

test('a customer-facing hire with weak English and no overlap converts, replies and satisfies less; engineers barely notice', () => {
  const good = (role, extra) => member({ role: role === 'support' ? 'support' : role, jobRole: role, ...extra });
  const near = { english: 5, overlapHours: 8, buyerFit: 0.85 };
  const far = { english: 3, overlapHours: 0, buyerFit: 0.5, tz: 5.5, region: 'india', city: 'Pune' };
  const ae = (o) => member({ role: 'ae', jobRole: 'account_executive', ...o });
  const sdr = (o) => member({ role: 'sdr', jobRole: 'sdr', ...o });
  const sup = (o) => member({ role: 'support', jobRole: 'support', ...o });
  const A = ae(near), B = ae(far);
  assert.ok(outputFor(B, 'winRateMult') < outputFor(A, 'winRateMult') * 0.82, 'win rate');
  assert.ok(outputFor(B, 'quotaAttainment') < outputFor(A, 'quotaAttainment') * 0.82);
  assert.ok(outputFor(sdr(far), 'replyRateMult') < outputFor(sdr(near), 'replyRateMult') * 0.82, 'reply rate');
  assert.ok(outputFor(sdr(far), 'meetingsPerMonth') < outputFor(sdr(near), 'meetingsPerMonth') * 0.82);
  assert.ok(outputFor(sup(far), 'csat') < outputFor(sup(near), 'csat') - 0.04, 'CSAT');
  // Isolate each cause: English alone, overlap alone.
  assert.ok(outputFor(ae({ ...near, english: 2 }), 'winRateMult') < outputFor(A, 'winRateMult') * 0.85, 'weak English alone');
  assert.ok(outputFor(ae({ ...near, overlapHours: 0 }), 'winRateMult') < outputFor(A, 'winRateMult') * 0.88, 'no overlap alone');
  // Engineers: a small English effect (spec misunderstandings -> rework), a larger overlap effect (cycle time, bugs found later).
  const E = member(near), Ew = member({ ...near, english: 2 }), Eo = member({ ...near, overlapHours: 0 });
  assert.ok(outputFor(Ew, 'velocityMult') > outputFor(E, 'velocityMult') * 0.85 && outputFor(Ew, 'velocityMult') < outputFor(E, 'velocityMult'), 'English: small');
  assert.ok(outputFor(Eo, 'velocityMult') < outputFor(E, 'velocityMult') * 0.85, 'overlap: slower cycle time');
  assert.ok(outputFor(Eo, 'bugRateMult') > outputFor(E, 'bugRateMult') * 1.2, 'bugs found later');
  // Coordination costs the founder hours; a member from before the module has none of this.
  assert.ok(managementHours(Eo) > managementHours(E) + 1.5);
  const legacy = { ...ae({}), tz: null, english: undefined, overlapHours: undefined };
  assert.equal(outputFor(legacy, 'winRateMult'), outputFor(A, 'winRateMult'), 'members from before the module are untouched');
});

test('support across time zones: unplanned handoffs slow first response in your hours; a runbook and a second shift fix it', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const us = member({ role: 'support', jobRole: 'support', startDay: 0 });
  p.members.push(us);
  assert.equal(coverageFrtMult(s), 1, 'a US agent covers your business hours');
  p.members.length = 0;
  const manila = member({ role: 'support', jobRole: 'support', region: 'ph', tz: 8, workStart: 9, overlapHours: 0, city: 'Manila, Philippines', startDay: 0 });
  p.members.push(manila);
  assert.ok(supportCoverage(s).biz === 0);
  const unplanned = coverageFrtMult(s);
  assert.ok(unplanned > 1.8, `unplanned ${unplanned}`);
  planCoverage(s);
  const planned = coverageFrtMult(s);
  assert.ok(planned < unplanned * 0.8 && planned > 1, `planned ${planned}`);
  // Add a US shift: planned follow-the-sun covers 16 hours and beats a single local shift.
  p.members.push(us);
  const sun = supportCoverage(s);
  assert.ok(sun.followTheSun && sun.hours24 >= 16);
  assert.ok(coverageFrtMult(s) < 1, 'follow-the-sun answers faster around the clock');
  assert.equal(supportQuality(s).coverageMult, coverageFrtMult(s));
});

test('part-time: output is pro-rated by hours and loses efficiency to context switching; fractional execs lose less', () => {
  assert.equal(partTimeEfficiency(40), 1);
  assert.ok(Math.abs(partTimeEfficiency(20) - 0.68) < 0.01, 'a 20 h person is ~68% as productive per paid hour (research range 60-75%)');
  assert.ok(partTimeEfficiency(10) < partTimeEfficiency(20) && partTimeEfficiency(20) < partTimeEfficiency(30));
  assert.ok(partTimeEfficiency(10, true) > partTimeEfficiency(10));
  const s = fresh();
  const p = ensurePeople(s);
  const full = member({ startDay: 0, hoursPerWeek: 40 }), half = member({ startDay: 0, hoursPerWeek: 20 });
  assert.ok(outputFor(half, 'velocityMult') < outputFor(full, 'velocityMult') * 0.72, 'per-hour output');
  p.members.push(half);
  const halfHours = devHoursPerWeek(s);
  p.members.length = 0; p.members.push(full);
  const fullHours = devHoursPerWeek(s);
  const ratio = halfHours / fullHours;
  assert.ok(ratio < 0.5 * 0.72 && ratio > 0.5 * 0.6, `20h delivers ${ratio.toFixed(2)} of 40h (0.5 x 0.68 = 0.34)`);
  assert.ok(partTimePremium(20) > 0.1 && partTimePremium(40) === 0, 'pay premium per hour for part-time');
  // Responsiveness: a part-timer answers slower and is on fewer hours a day (fewer overlap hours).
  const j = job(s, { role: 'designer', region: 'us', engagement: 'part_time_employee', hoursPerWeek: 20 });
  assert.equal(j.engagement, 'employee'); assert.equal(j.hoursPerWeek, 20); assert.ok(j.partTime);
  const c = cands(s, j, 1)[0];
  assert.equal(c.windowLen, 4, 'a 20 h week is four hours a day');
  assert.ok(c.expectation < midSalary('designer', 'us') * 0.6 && c.expectation > midSalary('designer', 'us') * 0.35 * 0.6, `pro-rated ask ${c.expectation}`);
  assert.equal(createJob(s, { role: 'designer', region: 'us', engagement: 'part_time_employee', hoursPerWeek: 38, text: 'x' }).hoursPerWeek, 30, 'part-time employees are 10-30 h');
  assert.equal(createJob(s, { role: 'designer', region: 'latam', engagement: 'part_time_employee', hoursPerWeek: 5, text: 'x' }).engagement, 'eor');
});

test('ACA 30-hour line: US employees under 30 h get no health plan; payroll taxes still apply', () => {
  const s = fresh();
  assert.ok(!benefitsEligible(29) && benefitsEligible(30));
  const a = employerAnnual(s, 60000, { hours: 29 }), b = employerAnnual(s, 60000, { hours: 30 });
  assert.ok(Math.abs(b - a - 8500) < 1, `health premium ($8.5k indie default) only from 30 h: ${b - a}`);
  assert.ok(a > 60000 * 0.0765, 'FICA still applies');
  const m29 = member({ hoursPerWeek: 29, salary: 60000, role: 'ops', jobRole: 'ops_generalist' }), m30 = { ...m29, hoursPerWeek: 30 };
  assert.ok(monthlyCostOf(s, m30) - monthlyCostOf(s, m29) > 8500 / 12 - 1);
  const line = (m) => payrollLines(s, [m], { start: 80, end: 94 })[0].employer;
  assert.ok(line(m30) > line(m29));
  assert.equal(monthlyCostOf(s, member({ salary: 150000 })), monthlyCostOf(s, member({ salary: 150000, hoursPerWeek: 40 })), 'full-time unchanged');
});

test('fractional executives: engaged as fractional contractors at researched rates; fractional only for exec roles', () => {
  const s = fresh();
  const j = createJob(s, { role: 'fractional_cfo', region: 'us', engagement: 'fractional', hoursPerWeek: 40, text: 'x' });
  assert.equal(j.engagement, 'contractor'); assert.ok(j.fractional); assert.equal(j.hoursPerWeek, 20, 'capped at 20 h');
  assert.throws(() => createJob(s, { role: 'engineer', region: 'us', engagement: 'fractional', text: 'x' }), /executive roles/);
  assert.throws(() => createJob(s, { role: 'fractional_cmo', region: 'us', engagement: 'employee', text: 'x' }), /Fractional executives/);
  const cfo = cands(s, createJob(s, { role: 'fractional_cfo', region: 'us', engagement: 'fractional', hoursPerWeek: 8, text: 'x' }), 20);
  const monthly = (c) => c.expectation * 8 * 52 / 12;
  const med = [...cfo.map(monthly)].sort((x, y) => x - y)[10];
  assert.ok(med > 4000 && med < 12000, `fractional CFO ~$4-8k/mo retainers in the research, got $${Math.round(med)}`);
  assert.ok(partTimeEfficiency(8, true) > partTimeEfficiency(8) + 0.2);
});

test('fraud: camera-on interviews, a paid trial and a background check catch a stand-in; missed, it costs money and is logged', () => {
  let camCaught = 0, camOffCaught = 0, trialCaught = 0, bgCaught = 0;
  const N = 40;
  for (let seed = 1; seed <= N; seed++) {
    const s = fresh(seed);
    const p = ensurePeople(s);
    const j = job(s, { role: 'engineer', region: 'pakistan', engagement: 'contractor', hoursPerWeek: 40 });
    const mk = () => { const c = cands(s, j, 1)[0]; c.fraud = 'stand_in'; c.moonlight = false; c.stage = 'screened'; p.candidates.push(c); return c; };
    const interview = (c, camera) => { scheduleInterview(s, c.id, { day: s.day, start: 600 }); startInterview(s, c.id, { camera }); return c; };
    const a = interview(mk(), true);
    if (a.stage === 'withdrawn' || a.redFlags?.length) camCaught++;
    s.day += 1;
    const b = interview(mk(), false);
    if (b.stage === 'withdrawn' || b.redFlags?.length) camOffCaught++;
    const c = mk(); c.stage = 'interviewed';
    const tr = runAssessment(s, c, 'paidTrial');
    if (!tr.ok || tr.redFlags.length) trialCaught++; // flagged, or dropped out rather than do real work
    const d = mk(); d.stage = 'interviewed';
    orderBackgroundCheck(s, p, d, 'pro'); s.day += 10; backgroundDay(s, p);
    if (d.backgroundCheck.status !== 'clear') bgCaught++;
  }
  assert.ok(camCaught >= N * 0.4, `camera on caught ${camCaught}/${N}`);
  assert.equal(camOffCaught, 0, 'audio-only catches nothing');
  assert.equal(trialCaught, N, 'a paid trial exposes a stand-in (or they drop out)');
  assert.ok(bgCaught >= N * 0.75, `pro background check (identity + employment) caught ${bgCaught}/${N}`);

  // Missed: the stand-in is hired, delivers a third of the output, and eventually costs money, hours and data.
  const s = fresh(9);
  const p = ensurePeople(s);
  const j = job(s, { role: 'engineer', region: 'pakistan', engagement: 'contractor', hoursPerWeek: 40 });
  const c = cands(s, j, 1)[0];
  c.fraud = 'stand_in'; c.stage = 'interviewed';
  c.offer = { hourlyRate: 30, salary: null, equityPct: 0, startDay: s.day - 60, hoursPerWeek: 40, ciiaa: true, cor: true, localIp: true, sentDay: s.day - 70, expectation: c.expectation };
  const m = hireFromCandidate(s, p, c);
  m.status = 'active'; m.startDay = s.day - 60;
  const honest = member({ region: 'pakistan', tz: 5, jobRole: 'engineer' });
  assert.ok(outputFor(m, 'velocityMult') < outputFor(honest, 'velocityMult') * 0.4, 'a third of the output');
  const before = mistakesSummary(s);
  for (let i = 0; i < 12 && !m.fraudLogged; i++) { s.day += 30; peopleMonthEnd(s); }
  assert.ok(m.fraudLogged, 'found or turned into an incident within a year');
  const after = mistakesSummary(s);
  const entry = s.mistakes.find((x) => x.id === 'hired_fraudulent_candidate');
  assert.ok(entry && entry.functionId === 'global_hiring' && entry.cost.usd > 4000 && entry.cost.hours >= 10, JSON.stringify(entry));
  assert.ok(after.usd > before.usd && /camera-on|verified/.test(entry.detail));
});

test('overemployed (J2) hires: referee, backchannel, background and trial checks catch them; missed, output runs 40% under and it is logged', () => {
  const N = 60;
  const hits = { backchannel: 0, references: 0, bg: 0, trial: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const s = fresh(seed);
    const p = ensurePeople(s);
    const j = job(s, { role: 'engineer', region: 'eeu', engagement: 'contractor', hoursPerWeek: 40 });
    s.founder.network = { linkedin: 2000 };
    const mk = () => { const c = cands(s, j, 1)[0]; c.moonlight = true; c.fraud = null; c.stage = 'interviewed'; c.traits = flat(60); p.candidates.push(c); return c; };
    const bc = mk(); if (runAssessment(s, bc, 'backchannel').redFlags.some((f) => /two jobs/.test(f))) hits.backchannel++;
    if (runAssessment(s, mk(), 'references').redFlags.some((f) => /slammed/.test(f))) hits.references++;
    const t = mk(); if (runAssessment(s, t, 'paidTrial').redFlags.some((f) => /second|elsewhere|spoken/.test(f))) hits.trial++;
    const b = mk(); orderBackgroundCheck(s, p, b, 'pro'); s.day += 10; backgroundDay(s, p);
    if (b.backgroundCheck.finding?.includes('overlapping')) hits.bg++;
  }
  assert.ok(hits.backchannel > N * 0.25 && hits.bg > N * 0.3 && hits.trial > N * 0.15, JSON.stringify(hits));
  assert.ok(hits.backchannel > hits.references, 'backchannel beats candidate-supplied references');
  // Missed: ~38% less output, found within months, logged with wasted pay.
  const s = fresh(5);
  const m = member({ region: 'eeu', tz: 1, overlapHours: 2, moonlight: true, startDay: 0, jobRole: 'engineer' });
  const honest = { ...m, moonlight: false };
  assert.ok(outputFor(m, 'velocityMult') < outputFor(honest, 'velocityMult') * 0.7);
  ensurePeople(s).members.push(m);
  s.day = 400;
  for (let i = 0; i < 24 && !m.moonFound; i++) { s.day += 30; globalMonthly(s, m); }
  assert.ok(m.moonFound);
  const e = s.mistakes.find((x) => x.id === 'overemployed_hire');
  assert.ok(e && e.cost.usd > 0 && e.cost.hours > 0);
});

test('classification and IP: a full-time foreign contractor without an EOR or CoR, and a contractor without IP paper, are logged and show up in diligence', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const bad = member({ engagement: 'contractor', kind: 'contractor', region: 'latam', tz: -3, hourlyRate: 50, salary: null, hoursPerWeek: 40, ciiaa: false, ipLocal: false, cor: false, startDay: 90 });
  p.members.push(bad);
  globalStart(s, bad);
  const ids = s.mistakes.map((x) => x.id);
  assert.ok(ids.includes('misclassified_foreign_contractor') && ids.includes('no_ip_assignment_contractor'), ids.join());
  assert.ok(s.mistakes.every((x) => x.functionId === 'global_hiring' && x.cost.hours > 0 && x.detail.length > 40));
  assert.ok(s.founder.hoursUsed > 0, 'charged founder hours');
  // Right: Contractor of Record, signed CIIAA and a local-law IP assignment, or an EOR employee: no mistakes.
  const s2 = fresh();
  const okc = member({ engagement: 'contractor', kind: 'contractor', region: 'latam', tz: -3, hourlyRate: 50, salary: null, hoursPerWeek: 40, ciiaa: true, ipLocal: true, cor: true });
  const eor = member({ engagement: 'eor', region: 'eeu', tz: 1, ciiaa: true, ipLocal: true });
  globalStart(s2, okc); globalStart(s2, eor);
  assert.equal((s2.mistakes ?? []).length, 0);
  // Diligence: Legal's issue list names the gap, and the CIIAA blocker regexp in Fundraising matches it.
  const gapOnly = member({ engagement: 'contractor', kind: 'contractor', region: 'latam', tz: -3, hourlyRate: 50, salary: null, hoursPerWeek: 20, ciiaa: true, ipLocal: false, cor: false });
  const s3 = fresh(); ensurePeople(s3).members.push(gapOnly); s3.company.incorporated = true; ensureLegal(s3);
  const issue = legalIssues(s3).find((x) => /locally enforceable IP assignment/.test(x));
  assert.ok(issue && /IP assignment/.test(issue));
  // Later claim: staff-like foreign contractors get reclassified at a few percent a month, with back contributions and legal fees.
  let claims = 0;
  for (let i = 0; i < 60; i++) {
    const t = fresh(100 + i);
    const x = member({ engagement: 'contractor', kind: 'contractor', region: 'latam', tz: -3, hourlyRate: 50, salary: null, hoursPerWeek: 40, cor: false, startDay: 0, role: 'engineer' });
    ensurePeople(t).members.push(x);
    t.day = 400;
    for (let mth = 0; mth < 12; mth++) { t.day += 30; globalMonthly(t, x); }
    if (x.misclassified) { claims++; assert.ok(t.mistakes.some((e) => e.id === 'misclassified_foreign_contractor' && e.cost.usd > 5000)); assert.ok(t.bank.txns.some((tx) => tx.category === 'legal' && /Misclassification/.test(tx.description))); }
  }
  assert.ok(claims >= 3 && claims <= 40, `claims ${claims}/60`);
});

test('FX and payout fees hit the bank ledger for contractors and EOR employees abroad, not for US contractors', () => {
  const s = fresh();
  const p = ensurePeople(s);
  s.day = 31; // month of 31 days from the clock origin: invoice the days worked
  const abroad = member({ engagement: 'contractor', kind: 'contractor', region: 'africa', tz: 1, hourlyRate: 30, salary: null, hoursPerWeek: 40, startDay: 0, city: 'Lagos, Nigeria' });
  const home = member({ engagement: 'contractor', kind: 'contractor', region: 'us', hourlyRate: 30, salary: null, hoursPerWeek: 40, startDay: 0 });
  p.members.push(abroad, home);
  const r = contractorInvoice(s, abroad, 1, 30);
  contractorInvoice(s, home, 1, 30);
  const fx = s.bank.txns.filter((t) => t.meta?.fx);
  assert.equal(fx.length, 1);
  assert.ok(Math.abs(-fx[0].amount - r.amount * REGION_DATA.africa.fxFeePct) < 0.02 && /FX & PAYOUT/.test(fx[0].description));
  assert.ok(REGION_DATA.africa.fxFeePct >= 0.01 && REGION_DATA.africa.fxFeePct <= 0.03);
  assert.ok(monthlyPeopleCost(s) >= monthlyCostOf(s, abroad) + monthlyCostOf(s, home), 'runway forecasts include FX');
});

test('notice periods, time-to-fill and pool depth differ by region', () => {
  const s = fresh();
  const us = cands(s, job(s, { role: 'engineer', region: 'us', engagement: 'employee' }), 40);
  const uk = cands(s, job(s, { role: 'engineer', region: 'weu', engagement: 'eor' }), 60);
  const ng = cands(s, job(s, { role: 'engineer', region: 'africa', engagement: 'contractor' }), 60);
  assert.ok(us.every((c) => c.noticeDays === 14));
  assert.ok(mean(uk.map((c) => c.noticeDays)) > 40 && Math.min(...uk.map((c) => c.noticeDays)) >= 30, 'UK and Western Europe: 1-3 months');
  assert.ok(ng.every((c) => c.noticeDays >= 3 && c.noticeDays <= 14), 'contractors start within two weeks');
  // makeOffer enforces the notice period.
  const p = ensurePeople(s);
  s.apps.people.payrollSetup.deel = true;
  const j = job(s, { role: 'engineer', region: 'weu', engagement: 'eor' });
  const c = cands(s, j, 1)[0]; c.stage = 'interviewed'; p.candidates.push(c);
  assert.throws(() => makeOffer(s, c.id, { salary: c.expectation, startDay: s.day + 14 }), /days' notice/);
  assert.ok(makeOffer(s, c.id, { salary: c.expectation, startDay: s.day + c.noticeDays }));
  // Time to the first candidate and applicant flow: slower in thin markets, thinner for senior roles, noisier boards.
  const sA = fresh(3), sB = fresh(3);
  const j1 = job(sA, { role: 'engineer', region: 'us', engagement: 'contractor' }); openJob(sA, j1.id, ['employee_referral']);
  const j2 = job(sB, { role: 'engineer', region: 'africa', engagement: 'contractor' }); openJob(sB, j2.id, ['employee_referral']);
  assert.ok(j2.channelStart.employee_referral - sB.day >= Math.round((j1.channelStart.employee_referral - sA.day) * 1.4));
  const base = job(s, { role: 'engineer', region: 'pakistan', engagement: 'contractor' }), senior = job(s, { role: 'engineer', region: 'pakistan', engagement: 'contractor', senior: true });
  assert.ok(regionFlow(s, senior).profiles < regionFlow(s, base).profiles * 0.5, 'senior hires are scarce in a junior-heavy market');
  assert.ok(regionFlow(s, base).apps > regionFlow(s, base).profiles, 'more applicant noise than usable profiles');
  assert.equal(regionFlow(s, job(s, { role: 'engineer', region: 'us', engagement: 'employee' })).profiles, 1);
});

test('infrastructure risk: outages cost output in thin-grid places, a backup stipend halves them; odd-hour calls drain founder energy', () => {
  const run = (stipend) => {
    let n = 0;
    for (let i = 0; i < 80; i++) {
      const s = fresh(300 + i);
      const m = member({ region: 'africa', tz: 1, city: 'Lagos, Nigeria', stipend, startDay: 0, status: 'active' });
      ensurePeople(s).members.push(m);
      s.day = 400;
      for (let k = 0; k < 6; k++) { s.day += 30; globalMonthly(s, m); }
      n += (m.outageLog ?? []).reduce((a, o) => a + o.days, 0);
    }
    return n;
  };
  const plain = run(false), backed = run(true);
  assert.ok(plain > 0 && backed < plain * 0.6, `lost days ${plain} vs ${backed} with a stipend`);
  const m = member({ outageLog: [{ day: 395, days: 3 }] });
  assert.ok(outageFactor(m, 400) < 0.9 && outageFactor(m, 430) === 1);
  const s = fresh();
  s.founder.energy = 80;
  const night = member({ region: 'ph', tz: 8, overlapHours: 0 });
  globalWeekly(s, night);
  assert.ok(s.founder.energy < 80 && night.oddHours === 1.5);
  const day = member({ overlapHours: 6 });
  s.founder.energy = 80; globalWeekly(s, day);
  assert.equal(s.founder.energy, 80);
});

test('part-time fit: bookkeeping and fractional execs suit it; a 15-hour support or SDR job burns people out', () => {
  const s = fresh();
  const ok = member({ role: 'ops', jobRole: 'ops_generalist', hoursPerWeek: 12, loadHours: 12 });
  const bad = member({ role: 'support', jobRole: 'support', hoursPerWeek: 15, loadHours: 40, engagement: 'employee' });
  ensurePeople(s).members.push(ok, bad);
  globalStart(s, ok); globalStart(s, bad);
  assert.deepEqual(s.mistakes.map((x) => x.id), ['part_time_full_time_job']);
  assert.ok(loadRatio(bad) > 2.5 && loadRatio(ok) === 1);
  assert.ok(attritionFactor(bad) > 1.9 && attritionFactor(ok) === 1);
  assert.ok(moraleDrag(bad) > 10 && moraleDrag(ok) === 0);
  assert.ok(attritionProbability(bad) > attritionProbability(ok) * 1.8);
  const night = member({ nightShift: true });
  assert.ok(attritionFactor(night) > 1.25, 'working through your own night raises quit risk');
});

test('low-overlap customer role and weak English are logged at start with traceable costs', () => {
  const s = fresh();
  const ae = member({ role: 'ae', jobRole: 'account_executive', region: 'india', tz: 5.5, overlapHours: 0, english: 3, buyerFit: 0.5, city: 'Pune', startDay: 90 });
  const eng = member({ region: 'india', tz: 5.5, overlapHours: 0, english: 3, city: 'Pune' });
  ensurePeople(s).members.push(ae, eng);
  globalStart(s, ae); globalStart(s, eng);
  const forAe = s.mistakes.map((x) => x.id);
  assert.ok(forAe.includes('low_overlap_customer_role') && forAe.includes('english_mismatch_customer_facing'), forAe.join());
  assert.equal(s.mistakes.length, 2, 'the engineer with working English and no overlap is not a customer-facing mistake');
  const sum = mistakesSummary(s);
  assert.ok(sum.hours >= 10 && sum.byFunction.some((f) => f.functionId === 'global_hiring'));
  assert.ok(s.mistakes.every((x) => x.detail.length > 60), 'each mistake says what happened and what a stellar operator does');
  // Support with a planned handoff is fine overnight.
  const s2 = fresh(); planCoverage(s2);
  globalStart(s2, member({ role: 'support', jobRole: 'support', region: 'ph', tz: 8, overlapHours: 0, english: 4, city: 'Manila, Philippines' }));
  assert.equal((s2.mistakes ?? []).length, 0);
});

// ---------------------------------------------------------------------------------------------
// Tier separation: scripted hiring behaviours through the real pipeline functions
// ---------------------------------------------------------------------------------------------

const TIER_ORDER = ['stellar', 'good', 'average', 'mediocre'];
// What each operator does before the offer (inputs only; the hidden candidate quality and fraud are the same lottery).
const PLAN = {
  stellar: { camera: true, trial: 'paidTrial', refs: ['backchannel', 'references'], bg: 'pro', questions: 'stellar', written: true, pick: 'verified', overlap: true, handoff: true, ciiaa: true },
  good: { camera: true, trial: 'workSample', refs: ['references'], bg: 'standard', questions: 'good', written: false, pick: 'interviewed', overlap: true, handoff: false, ciiaa: true },
  average: { camera: false, trial: 'takeHome', refs: [], bg: null, questions: 'average', written: false, pick: 'best_read', overlap: false, handoff: false, ciiaa: true },
  mediocre: { camera: false, trial: null, refs: [], bg: null, questions: null, written: false, pick: 'cheapest', overlap: false, handoff: false, ciiaa: false },
};
// Where each operator hires, and on what paper. Stellar matches role to region (sales in buyers' hours, support in the
// Philippines with a handoff plan, engineers with 3 h of overlap); the others chase the lowest price.
const SETUP = {
  stellar: {
    account_executive: { region: 'canada', eng: 'eor', hours: 40 }, support: { region: 'ph', eng: 'contractor', hours: 40, cor: true, localIp: true },
    engineer: { region: 'eeu', eng: 'contractor', hours: 40, cor: true, localIp: true }, ops_generalist: { region: 'us', eng: 'part_time_employee', hours: 14 },
  },
  good: {
    account_executive: { region: 'latam', eng: 'eor', hours: 40 }, support: { region: 'ph', eng: 'eor', hours: 40 },
    engineer: { region: 'latam', eng: 'contractor', hours: 25 }, ops_generalist: { region: 'us', eng: 'part_time_employee', hours: 14 },
  },
  average: {
    account_executive: { region: 'latam', eng: 'contractor', hours: 40 }, support: { region: 'india', eng: 'contractor', hours: 40 },
    engineer: { region: 'latam', eng: 'contractor', hours: 40 }, ops_generalist: { region: 'us', eng: 'part_time_employee', hours: 10 },
  },
  mediocre: {
    account_executive: { region: 'india', eng: 'contractor', hours: 40 }, support: { region: 'africa', eng: 'contractor', hours: 15 },
    engineer: { region: 'pakistan', eng: 'contractor', hours: 40 }, ops_generalist: { region: 'us', eng: 'part_time_employee', hours: 10 },
  },
};

function runOperator(tier, seed) {
  const plan = PLAN[tier];
  const s = fresh(seed);
  s.founder.hoursPerWeek = 1e6; // a scripted run is not about the founder's week
  const p = ensurePeople(s);
  ensureLegal(s).docs.ciiaa = plan.ciiaa;
  if (plan.handoff) planCoverage(s);
  for (const role of ['account_executive', 'support', 'engineer', 'ops_generalist']) {
    const cfg = SETUP[tier][role];
    const abroad = cfg.region !== 'us';
    const required = plan.overlap ? { account_executive: 5, engineer: 3 }[role] ?? 0 : 0;
    const j = job(s, { role, region: cfg.region, engagement: cfg.eng, hoursPerWeek: cfg.hours, requiredOverlap: required });
    const pool = cands(s, j, 12);
    for (const c of pool) {
      p.candidates.push(c);
      screenCandidate(s, c.id, true);
      if (!plan.questions) continue; // hires on a 20-minute screen call
      s.day += 1;
      scheduleInterview(s, c.id, { day: s.day, start: 600 });
      startInterview(s, c.id, { camera: plan.camera });
      if (c.stage === 'withdrawn') continue;
      for (const q of QUESTIONS[plan.questions]) askQuestion(s, c.id, q);
      finishInterview(s, c.id);
      if (plan.trial) runAssessment(s, c, plan.trial, { scorecard: true });
      if (plan.written && ['account_executive', 'support'].includes(role) && c.stage !== 'withdrawn') runAssessment(s, c, 'takeHome');
      for (const r of plan.refs) if (c.stage !== 'withdrawn') runAssessment(s, c, r, { scorecard: true });
    }
    const cust = ['account_executive', 'support'].includes(role);
    const live = pool.filter((c) => !['withdrawn', 'rejected'].includes(c.stage) && !(c.redFlags?.length && (plan.camera || plan.trial)));
    const eng = (c) => englishEstimate(c)?.level ?? 0;
    const read = (c) => estimate(c.evidence, 'composite')?.z ?? 0;
    let ranked;
    if (plan.pick === 'cheapest') ranked = pool.filter((c) => c.stage !== 'withdrawn').sort((a, b) => a.expectation - b.expectation);
    else if (plan.pick === 'verified') ranked = live.filter((c) => !cust || eng(c) >= 3.8).sort((a, b) => read(b) - read(a));
    else if (plan.pick === 'interviewed') ranked = live.filter((c) => !cust || eng(c) >= 3.2).sort((a, b) => read(b) - read(a));
    else ranked = [...live].sort((a, b) => read(b) - read(a));
    if (!ranked.length) ranked = live.length ? live : pool.filter((c) => c.stage !== 'withdrawn');
    // The background check runs after a conditional offer (fair-chance laws); a relevant "consider" moves on to the next name.
    let chosen = ranked[0];
    if (plan.bg && abroad) {
      for (const c of ranked.slice(0, 4)) {
        c.stage = 'offer';
        orderBackgroundCheck(s, p, c, plan.bg);
        s.day += 9; backgroundDay(s, p);
        if (c.stage !== 'withdrawn' && !(c.backgroundCheck?.status === 'consider' && c.backgroundCheck.relevant)) { chosen = c; break; }
        chosen = null;
      }
      chosen ??= ranked[0];
    }
    chosen ??= pool[0];
    const contractor = j.engagement === 'contractor';
    chosen.stage = 'interviewed';
    chosen.offer = { salary: contractor ? null : chosen.expectation, hourlyRate: contractor ? chosen.expectation : null, equityPct: 0, startDay: s.day - 40, hoursPerWeek: cfg.hours, ciiaa: plan.ciiaa, cor: Boolean(cfg.cor), localIp: Boolean(cfg.localIp), sentDay: s.day - 50, expectation: chosen.expectation };
    const m = hireFromCandidate(s, p, chosen);
    m.status = 'active'; m.startDay = s.day - 40;
    globalStart(s, m);
  }
  return { s, read: readOperator(s, 'global_hiring') };
}

test('global_hiring reads unknown until the first hire abroad or part-time', () => {
  const s = fresh();
  assert.equal(readOperator(s, 'global_hiring').tier, 'unknown');
  ensurePeople(s).members.push(member());
  assert.equal(readOperator(s, 'global_hiring').tier, 'unknown', 'a US full-time hire is not a global hire');
});

test('operator tiers separate on scripted global-hiring behaviour: stellar > good > average > mediocre', () => {
  const N = 6;
  const sum = Object.fromEntries(TIER_ORDER.map((t) => [t, { score: 0, usd: 0, hours: 0, mistakes: 0, tier: {} }]));
  for (let seed = 1; seed <= N; seed++) {
    for (const t of TIER_ORDER) {
      const { s, read } = runOperator(t, seed * 17);
      sum[t].score += read.score / N;
      const ms = mistakesSummary(s);
      sum[t].mistakes += ms.count / N; sum[t].hours += ms.hours / N;
      sum[t].tier[read.tier] = (sum[t].tier[read.tier] ?? 0) + 1;
      assert.ok(read.evidence.length > 0);
    }
  }
  const sc = TIER_ORDER.map((t) => sum[t].score);
  assert.ok(sc[0] > sc[1] + 0.04 && sc[1] > sc[2] + 0.04 && sc[2] > sc[3] + 0.04, `scores ${sc.map((x) => x.toFixed(2)).join(' > ')}`);
  const mi = TIER_ORDER.map((t) => sum[t].mistakes);
  assert.ok(mi[0] < mi[1] + 0.01 && mi[1] < mi[2] && mi[2] < mi[3], `mistakes ${mi.map((x) => x.toFixed(1)).join(' < ')}`);
  assert.ok(sum.stellar.hours < sum.mediocre.hours / 2, 'mediocre play burns founder hours fixing mistakes');
  const top = (t) => Object.entries(sum[t].tier).sort((a, b) => b[1] - a[1])[0][0];
  for (const t of TIER_ORDER) assert.equal(top(t), t, `${t} archetype mostly reads ${top(t)}: ${JSON.stringify(sum[t].tier)}`);
  const med = runOperator('mediocre', 17).read;
  assert.ok(med.coaching.length >= 2, med.coaching.join('|'));
});

test('hiring UI renders every region and engagement, candidate overlap and English, and the Team view overlap and hours', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const d = draft.job;
  for (const region of REGION_IDS) for (const engagement of engagementsFor(region, 'engineer')) {
    Object.assign(d, { role: 'engineer', region, engagement, hoursPerWeek: engagement === 'part_time_employee' ? 20 : 40, requiredOverlap: 4, allowShift: false });
    const out = String(hiringView(s, p));
    assert.ok(out.includes(REGION_DATA[region].label) && /Required overlap/.test(out) && /Company core hours/.test(out), `${region}/${engagement}`);
    assert.ok(/Overlap with your core hours/.test(out) && /notice/.test(out) && /FX and payout fees/.test(out) || region === 'us');
  }
  Object.assign(d, { role: 'fractional_cmo', region: 'us', engagement: 'fractional', hoursPerWeek: 8 });
  assert.ok(/Fractional executive/.test(String(hiringView(s, p))));
  assert.deepEqual(engagementsFor('us', 'engineer'), ['employee', 'part_time_employee', 'contractor']);
  assert.deepEqual(engagementsFor('ph', 'engineer'), ['eor', 'part_time_employee', 'contractor']);
  assert.deepEqual(engagementsFor('us', 'fractional_cfo'), ['fractional', 'contractor']);
  // Candidate page: location, time zone, overlap, English only once assessed, notice, pay in USD.
  const j = job(s, { role: 'account_executive', region: 'ph', engagement: 'contractor', hoursPerWeek: 40 });
  const c = cands(s, j, 1)[0]; p.candidates.push(c); c.stage = 'screened';
  let out = String(candidateView(s, p, c));
  assert.ok(out.includes(c.location) && /UTC\+8/.test(out) && /0h<\/b> a day/.test(out) && /not assessed/.test(out) && /notice/.test(out) && /in USD/.test(out));
  assert.ok(/resume says/.test(out));
  c.stage = 'new'; screenCandidate(s, c.id, true);
  out = String(candidateView(s, p, c));
  assert.ok(/\/5 ±/.test(out), 'English shows once the screen call has read it');
  // Team view: overlap and part-time hours per member.
  const m = member({ role: 'support', jobRole: 'support', region: 'ph', tz: 8, overlapHours: 0, hoursPerWeek: 20, city: 'Manila, Philippines' });
  const cell = String(teamGlobalCell(s, m));
  assert.ok(/Manila/.test(cell) && /overlap 0h/.test(cell) && /20h\/wk/.test(cell) && /efficiency/.test(cell));
  assert.ok(/short by/.test(String(memberGlobalCard(s, member({ role: 'ae', jobRole: 'account_executive', overlapHours: 0, tz: 5.5, region: 'india' })))));
});

test('a weak speaker sounds weak in the interview itself (the interview reveals the level, not the resume)', async () => {
  const { englishStyle } = await import('../public/apps/people/interview.js');
  const answer = "I'm confident about this. I owned the migration end to end, and I'd do it the same way. We cut errors by 40% in three weeks.";
  assert.equal(englishStyle(answer, 5, 1), answer);
  assert.equal(englishStyle(answer, 4, 1), answer);
  const l2 = englishStyle(answer, 2, 0), l3 = englishStyle(answer, 3, 1);
  assert.ok(/English|slower|sorry/i.test(l2) && l2.length < answer.length + 40 && !/I'm/.test(l2));
  assert.ok(/How do you say/.test(l3));
});
