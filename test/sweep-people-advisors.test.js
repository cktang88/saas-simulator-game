// Bug-sweep regressions for People, Co-founder, Advisors and Calendar (short, offline, no long sims).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { addSource } from '../public/core/advice.js';
import { ensurePeople, terminate, convertToEmployee } from '../public/apps/people/sim.js';
import { monthlyCostOf } from '../public/apps/people/payroll.js';
import { interestOf } from '../public/apps/people/llm.js';
import { ensureComp, compDay, compMonthEnd } from '../public/apps/people/comp.js';
import { winAccount } from './helpers/gtm-cohort.js';
import { resolvePip, startPip } from '../public/apps/people/performance.js';
import { bookOfficeHours } from '../public/apps/advisors/recruit.js';
import { REGION_DATA } from '../public/data/regions.js';

function fresh(seed = 11) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 300000, counterparty: 'Pat', category: 'owner_contribution' });
  s.day = 40;
  return s;
}
const member = (over) => ({ id: `mem_${over.region}_${over.engagement}`, name: 'Alex Kim', role: 'engineer', kind: 'employee', region: 'us', status: 'active', startDay: 0, salary: 120000, hoursPerWeek: 40, morale: 70, ...over });

test('letting an EOR employee go pays at least the statutory notice; a US at-will exit with no severance pays nothing', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const eor = member({ engagement: 'eor', region: 'eeu' });
  const us = member({ engagement: 'employee', region: 'us' });
  p.members.push(eor, us);
  const before = s.bank.txns.length;
  const sev = terminate(s, eor.id, { severanceWeeks: 0 });
  const weeks = Math.ceil(REGION_DATA.eeu.noticeDays[0] / 7);
  assert.ok(sev >= Math.round((120000 / 52) * weeks) - 1, `statutory notice pay: ${sev}`);
  assert.ok(s.bank.txns.slice(before).some((t) => /statutory notice/.test(t.description)));
  assert.equal(terminate(s, us.id, { severanceWeeks: 0 }), 0, 'US W-2: no statutory severance');
  // A resignation abroad owes no employer notice pay.
  const quit = member({ id: 'mem_q', engagement: 'eor', region: 'eeu' });
  p.members.push(quit);
  assert.equal(terminate(s, quit.id, { severanceWeeks: 0, reason: 'resigned' }), 0);
});

test('a PIP on someone who already left closes silently instead of announcing a verdict', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const m = member({ engagement: 'employee' });
  p.members.push(m);
  startPip(s, m);
  terminate(s, m.id, { severanceWeeks: 2 });
  s.day += 60;
  const notes = (s.notifications ?? []).length;
  assert.equal(resolvePip(s, m), null);
  assert.equal(m.pip.status, 'closed');
  assert.equal((s.notifications ?? []).length, notes, 'no "met their plan" notice for a leaver');
});

test('office hours use the source\'s monthly time: a 1 h/month mentor cannot be booked for unlimited free sessions', () => {
  const s = fresh();
  const src = addSource(s, { kind: 'mentor', name: 'YC mentors', expertise: 'general', quality: 'good' });
  bookOfficeHours(s, src.id);
  bookOfficeHours(s, src.id);
  assert.throws(() => bookOfficeHours(s, src.id), /no time left/);
  const quiet = addSource(s, { kind: 'advisor', name: 'Quiet Q', expertise: 'general', quality: 'good', quietAfterDays: 10 });
  s.day += 30;
  assert.throws(() => bookOfficeHours(s, quiet.id), /gone quiet/);
});

test('an interview answer with interest 0 stays 0 (only a missing value falls back to 5)', () => {
  assert.equal(interestOf(0), 0);
  assert.equal(interestOf('0'), 0);
  assert.equal(interestOf(7), 7);
  assert.equal(interestOf(14), 10);
  assert.equal(interestOf(undefined), 5);
  assert.equal(interestOf('n/a'), 5);
});

test('an AE who leaves mid-quarter is still paid the commission earned before the exit (not forfeited for free)', () => {
  const s = fresh();
  s.apps.product = { features: [{ id: 'f1', title: 'Reconciliation', status: 'shipped' }], bugs: [] };
  s.day = 600;
  const p = ensurePeople(s);
  const ae = member({ id: 'mem_ae', role: 'ae', jobRole: 'account_executive', engagement: 'employee', salary: 100000, startDay: -400, rampWeeks: 4, traits: {} });
  p.members.push(ae);
  for (let i = 0; i < 2; i++) { const { deal } = winAccount(s, i, { band: 'mid' }); deal.ownerAeId = ae.id; deal.amount = 150000; deal.source = 'outbound'; }
  compDay(s);
  const comp = ensureComp(s);
  while (![2, 5, 8, 11].includes(new Date(Date.parse(s.startDate) + s.day * 86400000).getUTCMonth())) s.day++;
  for (const c of comp.credits) c.day = s.day - 10;
  ae.status = 'gone'; ae.endDay = s.day - 5; ae.exitReason = 'resigned';
  compMonthEnd(s);
  assert.ok(ae.commissionDue > 0, 'earned commission is wages owed at exit');
  const due = ae.commissionDue;
  compMonthEnd(s);
  assert.equal(ae.commissionDue, due, 'settled once');
});

test('a contractor converted to an employee carries the employee cost, not the old invoice', () => {
  const s = fresh();
  const p = ensurePeople(s);
  p.payrollSetup.gusto = true;
  const m = member({ id: 'mem_c2h', engagement: 'contractor', kind: 'contractor', salary: null, hourlyRate: 60, hoursPerWeek: 40, startDay: 10 });
  m.monthlyCost = monthlyCostOf(s, m);
  p.members.push(m);
  convertToEmployee(s, m.id, 150000);
  assert.equal(m.engagement, 'employee');
  assert.equal(m.monthlyCost, monthlyCostOf(s, m));
  assert.ok(m.monthlyCost > 150000 / 12, `fully loaded: ${m.monthlyCost}`);
});
