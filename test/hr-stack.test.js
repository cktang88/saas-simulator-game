// HR / payroll / EOR / ATS / AI-sourcing paradigms (people/stack.js). Short targeted tests: one mechanic each, a few
// seeds, horizons of weeks. Research: docs/research/tools/2026q4/support-people-compliance.md §2-3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { html } from '../public/core/ui.js';
import peopleApp from '../public/apps/people.js';
import legalApp from '../public/apps/legal.js';
import { ensureLegal } from '../public/apps/legal/sim.js';
import { makeCandidate } from '../public/apps/people/candidates.js';
import { ensurePeople, createJob, applyJudge, openJob, makeOffer, createPool, hireFromCandidate, createScorecard } from '../public/apps/people/sim.js';
import { revokeAccess } from '../public/apps/people/onboarding.js';
import { ensureOps } from '../public/apps/people/ops-state.js';
import { monthlyCostOf, vendorBills } from '../public/apps/people/payroll.js';
import {
  ensureStack, choosePayroll, designRipplingWorkflows, chooseEor, hrBills, ripplingPerUser, RIPPLING_BUNDLE, usPayrollVendor, eorFee,
  chooseAts, setAtsAddOn, atsScheduleGate, postInterviewHours, coldMult, sendNurture, reviveFromCrm, enableJuicebox, juiceboxSearch,
  juiceboxSend, briefSpecificity, hrStackScore, atsScore, stackMonthEnd, reviewPipeline, payrollGate, PAYROLL_VENDORS,
} from '../public/apps/people/stack.js';
import { stackView } from '../public/apps/people/views-stack.js';

const APPS = [peopleApp, legalApp];
const JUDGE = { firstImpression: '', clarity: 8, specificity: 8, payTransparency: true, issues: [], rewriteHint: '' };

function world(seed = 7) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 2000000, counterparty: 'Pat', category: 'owner_contribution' });
  s.founder.hoursPerWeek = 80;
  s.day = 20;
  s.company.incorporated = true; s.company.entity = 'ccorp';
  ensurePeople(s);
  ensureLegal(s); s.apps.legal.ein = { status: 'done' };
  createPool(s, 10);
  ensureOps(s);
  return s;
}
const job = (s, o = {}) => { const j = createJob(s, { text: 'x', role: 'engineer', region: 'us', engagement: 'employee', ...o }); applyJudge(j, JUDGE); return j; };
let n = 0;
function hire(s, { role = 'engineer', region = 'us', engagement = 'employee', startIn = 10, pay = 120000 } = {}) {
  const p = ensurePeople(s);
  const j = job(s, { role, region, engagement });
  const c = makeCandidate(s, j, null, (x) => `${x}_hr${n++}`);
  Object.assign(c, { expectation: pay, stage: 'hired', interest: 0.7, noticeDays: 14, role });
  p.candidates.push(c);
  c.offer = { salary: engagement === 'contractor' ? null : pay, hourlyRate: engagement === 'contractor' ? 60 : null, equityPct: 0, startDay: s.day + startIn, hoursPerWeek: 40, expectation: pay, sentDay: s.day, decideDay: s.day + 3, ciiaa: true, signOn: 0 };
  c.negotiation = { status: 'none', round: 0, history: [] };
  const m = hireFromCandidate(s, p, c);
  if (m.ops) delete m.ops.renegeDay;
  return m;
}
const mistakes = (s, id) => (s.mistakes ?? []).filter((x) => x.id === id);

test('legacy saves read as Gusto + Deel; the default bill is unchanged', () => {
  const s = world();
  const p = ensurePeople(s);
  p.payrollSetup.gusto = true;
  hire(s);
  assert.equal(usPayrollVendor(s), 'gusto');
  assert.equal(vendorBills(p.members, s).gusto, 55); // $49 + $6
  assert.equal(vendorBills(p.members).gusto, 55); // the members-only call still works
});

test('Rippling: the real bill per employee lands in the $20-35 band for the core modules; the rep bundle is creep', () => {
  const s = world();
  choosePayroll(s, 'rippling', { modules: ['hris', 'payroll', 'it', 'devices'] });
  for (let i = 0; i < 10; i++) hire(s);
  const per = hrBills(s).us.amount / 10;
  assert.ok(per >= 20 && per <= 35, `core modules: $${per}/employee`);
  const t = world(8);
  choosePayroll(t, 'rippling', { modules: RIPPLING_BUNDLE });
  for (let i = 0; i < 10; i++) hire(t);
  assert.ok(ripplingPerUser(t) > ripplingPerUser(s) + 8, 'the bundle costs ~$10/user more');
  assert.ok(t.bank.txns.some((x) => /implementation fee/.test(x.description)), 'implementation fee posted');
});

test('Rippling for a 2-person team is logged as overkill with its cost; Gusto is not', () => {
  const s = world();
  hire(s); hire(s);
  choosePayroll(s, 'rippling');
  const m = mistakes(s, 'hr_overkill');
  assert.equal(m.length, 1);
  assert.ok(m[0].cost.usd >= PAYROLL_VENDORS.rippling.implFee);
  const g = world(9);
  hire(g); hire(g);
  choosePayroll(g, 'gusto');
  assert.equal(mistakes(g, 'hr_overkill').length, 0);
});

test('Gusto is US-only: an EOR offer is refused (Remote referral), contractors abroad can be paid from Gusto', () => {
  const s = world();
  choosePayroll(s, 'gusto');
  assert.match(payrollGate(s, { engagement: 'eor', region: 'latam' }), /Remote/);
  assert.equal(payrollGate(s, { engagement: 'contractor', region: 'latam' }), null);
  const c = hire(s, { engagement: 'contractor', region: 'latam' });
  assert.equal(c.payVendor, 'gusto');
  assert.ok(monthlyCostOf(s, c) < 60 * 40 * 52 / 12 + 10, 'Gusto contractor fee is $6, not Deel $49');
  chooseEor(s, 'remote');
  const e = hire(s, { engagement: 'eor', region: 'latam', pay: 60000 });
  assert.equal(e.eorVendor, 'remote');
  assert.equal(eorFee(s, e), 599);
  ensureStack(s).remotePlan = 'monthly';
  assert.equal(eorFee(s, e), 699, 'Remote month-to-month costs more');
  assert.throws(() => chooseEor(s, 'rippling'), /Rippling customers/);
});

test('EOR payroll posts under the provider that employs each person', () => {
  const s = world();
  choosePayroll(s, 'gusto');
  chooseEor(s, 'oyster');
  const e = hire(s, { engagement: 'eor', region: 'eeu', pay: 60000, startIn: 16 });
  advance(s, 45, APPS);
  assert.equal(e.status, 'active');
  assert.ok(s.bank.txns.some((t) => t.counterparty === 'Oyster' && /EOR PAYROLL/.test(t.description)));
  assert.ok(!s.bank.txns.some((t) => t.counterparty === 'Deel' && /EOR PAYROLL/.test(t.description)));
});

test('Justworks PEO: no state registrations; leaving it mid-year restarts wage bases and is traceable', () => {
  const s = world();
  choosePayroll(s, 'justworks');
  for (let i = 0; i < 3; i++) hire(s);
  advance(s, 15, APPS);
  assert.equal((s.founder.timeLog ?? []).filter((x) => /State payroll registration/.test(x.label)).length, 0);
  while (new Date(Date.parse(s.startDate) + s.day * 864e5).getUTCMonth() === 0) s.day++;
  const r = choosePayroll(s, 'gusto');
  assert.ok(r.usd > 0 && r.hours >= 10, 'wage-base restart + PEO migration');
  assert.ok(mistakes(s, 'hr_vendor_switch').length === 1);
  const g = world(11);
  choosePayroll(g, 'gusto');
  hire(g);
  advance(g, 15, APPS);
  assert.ok((g.founder.timeLog ?? []).some((x) => /State payroll registration/.test(x.label)), 'Gusto: you register the new state yourself');
});

/** HR archetypes on the same 10-person company: what they choose and do, nothing else. */
function hrRun(tier, seed) {
  const s = world(seed);
  const team = [];
  for (let i = 0; i < 10; i++) team.push(hire(s)); // ten accepted offers, starting in 10 days
  if (tier === 'stellar') { choosePayroll(s, 'rippling', { modules: ['hris', 'payroll', 'it', 'devices'] }); designRipplingWorkflows(s); }
  if (tier === 'good') choosePayroll(s, 'gusto');
  if (tier === 'average') choosePayroll(s, 'rippling', { modules: RIPPLING_BUNDLE }); // the rep's bundle, workflows never designed
  if (tier === 'mediocre') { choosePayroll(s, 'gusto'); choosePayroll(s, 'rippling', { modules: RIPPLING_BUNDLE }); choosePayroll(s, 'gusto'); } // going in circles
  advance(s, 15, APPS);
  const leaver = team[0];
  leaver.leavingDay = s.day + 1; leaver.exitReason = 'resigned';
  advance(s, 1, APPS);
  if (tier === 'good' || tier === 'average') revokeAccess(s, leaver.id); // by hand, on the last day
  advance(s, 2, APPS); // the day after the exit: access left on is flagged
  s.day += 60; // two months later (no tick: attrition and onboarding are tested elsewhere)
  stackMonthEnd(s);
  return { s, team, leaver, score: hrStackScore(s).score };
}

test('operator tiers separate on the HR stack: fit, configuration and the traps', () => {
  for (const seed of [3, 4]) {
    const r = Object.fromEntries(['stellar', 'good', 'average', 'mediocre'].map((t) => [t, hrRun(t, seed)]));
    assert.ok(r.stellar.score > r.good.score && r.good.score > r.average.score && r.average.score > r.mediocre.score,
      `seed ${seed}: ${Object.entries(r).map(([k, v]) => `${k} ${v.score}`).join(', ')}`);
    // Stellar: Rippling's graph did the work (accounts before day 1, same-day revoke).
    const st = r.stellar;
    assert.ok(st.team.every((m) => m.onboarding.items.accounts.byRippling), 'accounts provisioned by the workflow');
    assert.ok(ensureOps(st.s).offboard.find((x) => x.memberId === st.leaver.id).byRippling);
    assert.equal(mistakes(st.s, 'access_not_revoked').length, 0);
    // Average: paid for modules nobody uses; the cost is on the scorecard.
    const creep = mistakes(r.average.s, 'hr_module_creep');
    assert.ok(creep.length >= 2 && creep.every((x) => x.cost.usd > 0), `creep: ${creep.map((x) => x.label).join('; ')}`);
    // Mediocre: two migrations in a year and access left on.
    assert.ok(mistakes(r.mediocre.s, 'hr_vendor_churn').length >= 1);
    assert.ok(mistakes(r.mediocre.s, 'access_not_revoked').length >= 1);
    assert.ok(hrStackScore(r.mediocre.s).coaching.some((c) => /stellar operator/.test(c)), 'feedback names what stellar would do');
  }
});

test('Greenhouse enforces the kit before interviews, adds scorecard time, and is overkill for a small team', () => {
  const s = world();
  hire(s); hire(s);
  const r = chooseAts(s, 'greenhouse');
  assert.ok(r.usd >= 6000 && r.usd <= 7000, `small-team annual ${r.usd}`);
  const m = mistakes(s, 'ats_overkill');
  assert.equal(m.length, 1);
  assert.ok(m[0].cost.usd > 0);
  const j = job(s);
  assert.match(atsScheduleGate(s, j), /kit and scorecard/);
  createScorecard(s, j.id, { mission: 'Own billing', outcomes: ['Ship invoicing v2 by month 4', 'Cut failed payments 30% by month 8'], competencies: ['craft', 'agency', 'communication'] });
  assert.equal(atsScheduleGate(s, j), null);
  assert.equal(postInterviewHours(s), 0.25);
  const a = world(12);
  job(a).status = 'open';
  chooseAts(a, 'ashby');
  assert.equal(mistakes(a, 'ats_overkill').length + mistakes(a, 'ats_too_early').length, 0);
  assert.ok(coldMult(a) < coldMult(world(13)), 'self-scheduling keeps candidates warmer than email');
});

test('Ashby add-ons nobody needs show up as creep after 60 days', () => {
  const s = world();
  job(s).status = 'open';
  chooseAts(s, 'ashby');
  setAtsAddOn(s, 'notetaker', true);
  setAtsAddOn(s, 'sso', true);
  s.day += 65;
  stackMonthEnd(s);
  const m = mistakes(s, 'ats_addon_creep');
  assert.equal(m.length, 2);
  assert.ok(m.every((x) => x.cost.usd >= 100));
});

test('Lever-style CRM: a nurtured past finalist comes back when the role reopens', () => {
  let revived = 0, cold = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const nurture of [true, false]) {
      const s = world(seed);
      chooseAts(s, 'lever');
      const p = ensurePeople(s);
      const j1 = job(s);
      for (let i = 0; i < 4; i++) { const c = makeCandidate(s, j1, null, (x) => `${x}_lv${n++}`); Object.assign(c, { stage: 'declined', fraud: null }); for (const k of Object.keys(c.traits)) c.traits[k] = 80; p.candidates.push(c); }
      if (nurture) sendNurture(s);
      const j2 = job(s);
      const out = reviveFromCrm(s, j2, () => 1);
      if (nurture) revived += out.length; else cold += out.length;
    }
  }
  assert.ok(revived > cold, `nurtured ${revived} vs cold ${cold}`);
});

test('Juicebox: a specific brief with personalised outreach beats a vague templated blast, which burns the pool', () => {
  const vague = 'engineer';
  const specific = 'Senior backend engineer, 6+ years TypeScript, Postgres, AWS; shipped billing at a Series A startup, US time zones, not agency backgrounds';
  assert.ok(briefSpecificity(specific).score >= 0.8 && briefSpecificity(vague).score <= 0.2);
  let good = 0, bad = 0;
  const matchedReplies = (st) => ensurePeople(st).candidates.filter((c) => c.channel === 'juicebox' && c.sourcedMatch).length;
  for (const seed of [1, 2, 3]) {
    const s = world(seed);
    const j = job(s); j.status = 'open';
    enableJuicebox(s);
    juiceboxSearch(s, j, specific);
    const a = juiceboxSend(s, j, { count: 25, mode: 'personalized' });
    good += matchedReplies(s);
    assert.ok(a.hours > 2, 'personalised messages take founder time (~6 min each)');
    const t = world(seed + 10);
    const k = job(t); k.status = 'open';
    enableJuicebox(t);
    juiceboxSearch(t, k, vague);
    juiceboxSend(t, k, { count: 50, mode: 'template' });
    bad += matchedReplies(t);
    assert.equal(mistakes(t, 'sourcing_spray').length, 1, 'vague template blast is a traceable mistake');
    assert.ok(ensurePeople(t).sourcing.burned.engineer > t.day, 'the pool is burned for ~90 days');
  }
  assert.ok(good > bad, `matched replies: specific+personalised ${good} vs vague blast ${bad}`);
});

test('operator tiers separate on hiring tools (ATS fit, analytics, sourcing briefs)', () => {
  const run = (tier, seed) => {
    const s = world(seed);
    if (tier === 'mediocre') { hire(s); }
    const j = job(s); j.status = 'open';
    if (tier === 'stellar' || tier === 'good') chooseAts(s, 'ashby');
    if (tier === 'average') chooseAts(s, 'lever');
    if (tier === 'mediocre') chooseAts(s, 'greenhouse');
    if (tier === 'stellar') reviewPipeline(s);
    enableJuicebox(s);
    const brief = { stellar: 'Senior backend engineer, 6+ years TypeScript, Postgres, AWS; shipped billing at a Series A startup, US time zones, not agency backgrounds', good: 'Senior engineer with TypeScript, remote', average: 'engineer for our startup', mediocre: 'engineer' }[tier];
    juiceboxSearch(s, j, brief);
    juiceboxSend(s, j, { count: tier === 'mediocre' ? 50 : 25, mode: tier === 'stellar' ? 'personalized' : tier === 'mediocre' ? 'template' : 'sequence' });
    return atsScore(s).score;
  };
  for (const seed of [5, 6]) {
    const r = Object.fromEntries(['stellar', 'good', 'average', 'mediocre'].map((t) => [t, run(t, seed)]));
    assert.ok(r.stellar > r.good && r.good > r.average && r.average > r.mediocre, JSON.stringify(r));
  }
});

test('HR stack view renders for every payroll platform without throwing', () => {
  for (const v of ['gusto', 'rippling', 'justworks']) {
    const s = world();
    choosePayroll(s, v);
    hire(s);
    const out = stackView(s, ensurePeople(s));
    assert.ok(String(out?.toString?.() ?? out).length > 100);
  }
  assert.ok(html`x`);
});
