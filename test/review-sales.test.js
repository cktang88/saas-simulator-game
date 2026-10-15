// Regression tests for bugs found in the sales apps review (outreach, CRM, calls, sales/*).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { isWeekend, dayOfMonth, uid } from '../public/core/util.js';
import { ensureOutreach, ensureCrm, addContact } from '../public/apps/sales/model.js';
import { outreachDay } from '../public/apps/sales/engine.js';
import { generateNotes, ensureNotetaker, setNotetakerPlan } from '../public/apps/sales/notetaker.js';
import { SALES_ACTIONS } from '../public/apps/sales/automation.js';
import { researchCompany } from '../public/apps/sales/jobs.js';

function fresh(seed = 7) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Automated bookkeeping reconciliation for dental clinics';
  s.company.icp = 'Owners of independent dental clinics with 2-10 dentists';
  return s;
}
const weekday = (s) => { while (isWeekend(s)) s.day++; };

function sendingSetup(s) {
  const o = ensureOutreach(s);
  o.sequencer = true;
  o.domains.push({ id: 'dom1', name: 'getledgerly.com', auth: { spf: true, dkim: true, dmarc: true }, reputation: 70, log: [] });
  o.inboxes.push({ id: 'ib1', domainId: 'dom1', address: 'pat@getledgerly.com', warmupStartDay: s.day - 60, dailyLimit: 'auto', paused: false, sentTotal: 0 });
  return o;
}
const seqOf = (steps) => ({ id: uid('seq'), name: 'Test', steps, status: 'active', trackOpens: false, inboxIds: [], judge: {}, stats: { sent: 0, bounced: 0, inboxed: 0, opens: 0, complaints: 0, replies: 0, positive: 0 } });

test('LinkedIn: a connection request is rolled once, so acceptance matches pAccept (not ~75% from weekly re-rolls)', () => {
  const s = fresh();
  const o = ensureOutreach(s);
  const N = 400;
  for (let i = 0; i < N; i++) o.linkedin.requests.push({ id: `li${i}`, contactId: null, day: s.day, note: '', status: 'pending', pAccept: 0.3, decideDay: s.day + 1 + (i % 6) });
  const d0 = s.day;
  for (s.day = d0 + 1; s.day <= d0 + 30; s.day++) outreachDay(s);
  const acc = o.linkedin.requests.filter((r) => r.status === 'accepted').length / N;
  assert.ok(acc > 0.22 && acc < 0.38, `acceptance ${acc}`);
  assert.equal(o.linkedin.requests.filter((r) => r.status === 'pending').length, 0, 'all decided within ~3 weeks');
});

test('Auto-paused sequence can be resumed: the bounce check uses sends since the last pause', () => {
  const s = fresh();
  weekday(s);
  const o = sendingSetup(s);
  const q = seqOf([{ id: 'st1', subject: 'hi', body: 'Hi {{firstName}}, worth a look?', delayDays: 0 }]);
  q.stats.sent = 300; q.stats.bounced = 30; // 10% lifetime bounce
  o.sequences.push(q);
  outreachDay(s);
  assert.equal(q.status, 'paused');
  q.status = 'active'; // the player verified the list and resumed
  s.day++; weekday(s);
  outreachDay(s);
  assert.equal(q.status, 'active', 'not re-paused by the old lifetime bounce rate');
});

test('Enrollments past the last step (steps deleted after enrolling) finish instead of staying active forever', () => {
  const s = fresh();
  weekday(s);
  const o = sendingSetup(s);
  const q = seqOf([{ id: 'st1', subject: 'hi', body: 'Hi, worth a look?', delayDays: 0 }]);
  o.sequences.push(q);
  const { contact } = addContact(s, { firstName: 'Ann', lastName: 'Lee', email: 'ann@smiledental.com', company: 'Smile Dental', domain: 'smiledental.com' });
  o.enrollments.push({ id: 'enr1', sequenceId: q.id, contactId: contact.id, step: 2, nextDay: s.day, status: 'active', sent: [s.day - 6, s.day - 3], inboxId: null });
  outreachDay(s);
  assert.equal(o.enrollments[0].status, 'finished');
  assert.equal(o.enrollments[0].finishedDay, s.day);
});

test('Notetaker: a current tool with regex characters ("C++ (legacy)") does not crash note generation', () => {
  const s = fresh();
  ensureNotetaker(s).mode = 'local';
  const m = { id: 'mtg1', dealId: null, contactId: null, transcript: [{ from: 'me', text: 'What do you use today?' }, { from: 'them', text: 'We use C++ scripts our intern wrote.' }] };
  const persona = { name: 'Ann', title: 'Owner', hasPain: true, pain: 'x', currentTools: '(C++ scripts', timeline: 'next quarter', authority: 'economic buyer', decisionProcess: 'decides alone', budgetMonthly: 100 };
  assert.doesNotThrow(() => generateNotes(s, m, persona, { nextStepSecured: false }));
  assert.ok(m.notes.fields.some((f) => f.key === 'competitor'));
});

test('Automation enroll_in_sequence refuses a contact already active in a sequence (no double sends)', () => {
  const s = fresh();
  const o = ensureOutreach(s);
  const q = seqOf([{ id: 'st1', subject: 'hi', body: 'Hi', delayDays: 0 }]);
  o.sequences.push(q);
  const { contact } = addContact(s, { firstName: 'Bo', lastName: 'Ng', email: 'bo@brightdental.com', company: 'Bright Dental', domain: 'brightdental.com' });
  const a = SALES_ACTIONS.enroll_in_sequence.run(s, { contactId: contact.id, sequenceId: q.id }, { approved: true });
  const b = SALES_ACTIONS.enroll_in_sequence.run(s, { contactId: contact.id, sequenceId: q.id }, { approved: true });
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  assert.equal(o.enrollments.filter((e) => e.contactId === contact.id).length, 1);
});

test('Company research keeps a judged fit of 0 (it used to become 40%)', async () => {
  const s = fresh();
  ensureCrm(s);
  const { company } = addContact(s, { firstName: 'Cy', lastName: 'Po', email: 'cy@gmail.com', company: 'Cy Bakery' });
  const ctx = { state: s, llm: { ask: async () => ({ mock: false, data: { summary: 'A bakery', industry: 'Food', size: '2-10', pains: [], hook: '', fit: 0, fitReason: 'not a dental clinic' } }) } };
  await researchCompany(ctx, company);
  assert.equal(company.research.fit, 0);
});

test('Monthly tools paid up front bill again on the purchase anniversary, not days later', () => {
  const s = fresh();
  s.day += 3;
  setNotetakerPlan(s, 'paid');
  assert.equal(s.recurring.find((r) => r.id === ensureNotetaker(s).recurringId).dayOfMonth, Math.min(28, dayOfMonth(s)));
  const src = readFileSync(new URL('../public/apps/outreach.js', import.meta.url), 'utf8');
  assert.ok(!/Sequencer \(cold email\)'[^\n]*dayOfMonth: 15/.test(src) && !/Sales Navigator'[^\n]*dayOfMonth: 20/.test(src));
});

test('Outreach placement test checks for a written sequence before charging the $10', () => {
  const src = readFileSync(new URL('../public/apps/outreach.js', import.meta.url), 'utf8');
  const i = src.indexOf("'#placementTest'");
  const block = src.slice(i, src.indexOf('}, { hours', i));
  assert.ok(block.indexOf('throw new Error') < block.indexOf('post(st'), 'throw must come before the charge (ctx.act does not refund money)');
});
