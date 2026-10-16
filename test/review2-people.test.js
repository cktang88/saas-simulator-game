// Regression tests for the second People bug review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ensurePeople, makeOffer, finishInterview } from '../public/apps/people/sim.js';
import { payrollLines } from '../public/apps/people/payroll.js';
import { equityRoom, payTransparencyCheck, finesDay } from '../public/apps/people/negotiation.js';
import { ensureOps } from '../public/apps/people/ops-state.js';

function fresh(seed = 7) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 300000, counterparty: 'Pat', category: 'owner_contribution' });
  s.founder.hoursPerWeek = 70;
  return s;
}

const contractorCand = (s) => ({ id: 'cand_x', name: 'Robin Doe', email: 'r@x.dev', role: 'engineer', jobId: 'job_none', engagement: 'contractor', region: 'us', stage: 'interviewed', expectation: 100, hoursPerWeek: 40, noticeDays: 3, persona: {}, traits: {}, lastTouchDay: s.day });

test('an offer with a cleared start date or pay field is refused instead of creating a NaN start day', () => {
  const s = fresh();
  const p = ensurePeople(s);
  p.payrollSetup.gusto = true;
  const c = contractorCand(s);
  p.candidates.push(c);
  assert.throws(() => makeOffer(s, c.id, { hourlyRate: 100, startDay: NaN, hoursPerWeek: 40 }), /start date/);
  assert.throws(() => makeOffer(s, c.id, { hourlyRate: null, startDay: s.day + 7, hoursPerWeek: 40 }), /hourly rate/);
  assert.equal(c.stage, 'interviewed');
  assert.equal(c.offer, undefined);
});

test('ending an interview twice does not add the same evidence twice', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const c = { ...contractorCand(s), stage: 'interviewed', evidence: [{ method: 'interview', target: 'composite', v: 0.4, obs: 0.2 }], interview: { started: true, done: true, messages: [] } };
  p.candidates.push(c);
  assert.throws(() => finishInterview(s, c.id), /already over/);
  assert.equal(c.evidence.length, 1);
});

test('negotiation equity room counts options a leaver had vested, like makeOffer', () => {
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp';
  const p = ensurePeople(s);
  p.equity.poolPct = 2;
  // Left after two years: ~half of a 2% grant vested and stays out of the pool.
  p.members.push({ id: 'mem_l', name: 'Lee', kind: 'employee', status: 'gone', equityPct: 2, endDay: 730, grant: { pct: 2, vestStart: 0, cliffDay: 365, vestYears: 4, status: 'granted' } });
  const room = equityRoom(s);
  assert.ok(room > 0.9 && room < 1.1, `room ${room} (was 2 before the fix)`);
});

test('re-opening a job (adding a channel) does not queue the same pay-transparency fine twice', () => {
  let s, fined = null;
  for (let seed = 1; seed < 80 && !fined; seed++) {
    s = fresh(seed);
    ensurePeople(s);
    const job = { id: 'job_a', title: 'Engineer', role: 'engineer', region: 'us', remote: true, payLo: 0, payHi: 0, payTransparency: false };
    payTransparencyCheck(s, job);
    if (ensureOps(s).fines.length) fined = job;
  }
  assert.ok(fined, 'some seed draws a fine');
  payTransparencyCheck(s, fined);
  const o = ensureOps(s);
  assert.equal(o.fines.length, 1);
  // A separate below-range fine on the same job is still logged as its own cost when it lands.
  o.fines.push({ id: `fine:${fined.id}:cand_1`, jobId: fined.id, law: 'X', dueDay: s.day, amount: 5000, status: 'pending', reason: 'offer below the posted range' });
  o.fines[0].dueDay = s.day;
  const before = s.mistakes?.length ?? 0;
  finesDay(s);
  assert.equal(s.mistakes.length - before, 2);
  assert.ok(s.bank.txns.some((t) => /offer below the posted range/.test(t.description)));
});

test('commission settled before a rep left is paid with the next payroll run', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const m = { id: 'mem_r', name: 'Rae', role: 'ae', jobRole: 'ae', kind: 'employee', engagement: 'employee', region: 'us', status: 'gone', startDay: 0, endDay: 40, salary: 90000, hoursPerWeek: 40, commissionDue: 4200 };
  p.members.push(m);
  const lines = payrollLines(s, p.members, { start: 46, end: 60 });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].gross, 4200);
  assert.ok(lines[0].employer > 0 && lines[0].employer < 4200 * 0.08);
});
