// Regression tests for leftovers from the second code review (one per fix).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post, addRecurring, chargeRecurring, reactivateRecurring, balance } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, cancel } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { dayOfMonth } from '../public/core/util.js';
import { ensurePersonal } from '../public/core/personal.js';
import { ensureFake, fakeReviewsDay } from '../public/core/fakereviews.js';
import { ensureOutreach, ensureCrm, addContact, removeSequenceStep, soc2ReportOnHand } from '../public/apps/sales/model.js';
import { SALES_ACTIONS } from '../public/apps/sales/automation.js';
import { ensureSdr, approveDraft, bulkApprove } from '../public/apps/sales/sdr.js';
import { cancelBill } from '../public/apps/bank.js';
import { ensureLegal } from '../public/apps/legal/sim.js';
import { ensureCompliance, startSoc2 } from '../public/apps/legal/compliance.js';

const src = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url), 'utf8');
function fresh(seed = 7, model = 'smb') {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  return s;
}

test('1. a cancelled AI SDR cannot approve queued drafts into a dead outbox (and the UI hides the button)', () => {
  const s = fresh();
  const a = ensureSdr(s);
  a.active = false; a.mode = 'review';
  a.queue.push({ id: 'd1', person: { name: 'A' } }, { id: 'd2', person: { name: 'B' } });
  assert.throws(() => approveDraft(s, 'd1'), /cancelled/);
  assert.equal(bulkApprove(s, ['d1', 'd2']), 0);
  assert.equal(a.outbox.length, 0);
  assert.equal(a.queue.length, 2);
  assert.match(src('apps/sales/sdr-view.js'), /ensureSdr\(s\)\.active \? html`<button class="sm primary" data-sdrapprove/);
});

test('2. removing a sequence step keeps each enrollment on the step it was due to send next', () => {
  const s = fresh();
  const o = ensureOutreach(s);
  const seq = { id: 'q1', name: 'Q', steps: [{ id: 's0' }, { id: 's1' }, { id: 's2' }], status: 'active' };
  o.sequences.push(seq);
  const mk = (id, step) => ({ id, sequenceId: 'q1', contactId: id, step, status: 'active', sent: [] });
  o.enrollments.push(mk('e0', 0), mk('e1', 1), mk('e2', 2), { ...mk('ex', 2), sequenceId: 'other' });
  removeSequenceStep(s, seq, 's1');
  const by = Object.fromEntries(o.enrollments.map((e) => [e.id, e]));
  assert.equal(by.e0.step, 0, 'before the removed step: unchanged');
  assert.equal(by.e1.step, 1, 'was due s1 (removed): now due s2, which moved to index 1');
  assert.equal(by.e2.step, 1, 'was due s2: still due s2 (index 1), not skipped');
  assert.equal(by.ex.step, 2, 'other sequences untouched');
  removeSequenceStep(s, seq, 's2');
  assert.equal(by.e2.status, 'finished', 'its next step no longer exists');
  assert.equal(by.e0.status, 'active');
  assert.match(src('apps/outreach.js'), /\[data-delstep\]'.*removeSequenceStep\(st, seq/);
});

test('3. placement test refuses inside the action when there are no inboxes (no NaN placement)', () => {
  const t = src('apps/outreach.js');
  const i = t.indexOf("'#placementTest', () => ctx.act");
  const body = t.slice(i, t.indexOf('}, {', i));
  assert.ok(/if \(!oo\.inboxes\.length\) throw/.test(body));
  assert.ok(body.indexOf('inboxes.length) throw') < body.indexOf('post(st'), 'guard runs before the $10 charge');
});

test('4. automation enroll_in_sequence marks the contact enrolled and opens a deal, like the Outreach button', () => {
  const s = fresh();
  const o = ensureOutreach(s);
  const q = { id: 'q1', name: 'Q', steps: [{ id: 's0', subject: 'x', body: 'y', delayDays: 0 }], status: 'active' };
  o.sequences.push(q);
  const { contact } = addContact(s, { firstName: 'Bo', lastName: 'Ng', email: 'bo@brightdental.com', company: 'Bright Dental', domain: 'brightdental.com' });
  const r = SALES_ACTIONS.enroll_in_sequence.run(s, { contactId: contact.id, sequenceId: q.id }, { approved: true });
  assert.ok(r.ok);
  assert.equal(contact.status, 'enrolled');
  assert.ok(ensureCrm(s).deals.some((d) => d.contactId === contact.id && d.stage === 'lead'));
  assert.equal(o.enrollments.at(-1).by, 'automation');
  assert.match(src('apps/outreach.js'), /enrollContact\(st, seq, c\)/, 'both paths share the helper');
});

test('5. a non-numeric calendar week offset falls back to this week', () => {
  const line = src('apps/calendar.js').split('\n').find((l) => l.includes('const offset ='));
  const offset = new Function('ctx', `${line.split('//')[0].trim()}\nreturn offset;`);
  assert.equal(offset({ params: 'abc' }), 0);
  assert.equal(offset({ params: '' }), 0);
  assert.equal(offset({ params: '-2' }), -2);
});

test('6. a resolved FTC inquiry does not block a new one over new schemes (history kept)', () => {
  const s = fresh(2, 'b2c');
  const F = ensureFake(s);
  F.batches.push({ id: 'old', n: 30, day: s.day, status: 'live', source: 'helpdesk' });
  F.ftc = { openedDay: s.day, resolveDay: s.day, n: 30, batchIds: ['old'], systematic: false, status: 'resolved' };
  // Only the already-covered scheme: no second inquiry over the same reviews.
  for (let d = 0; d < 1000; d++) { s.day++; F.batches[0].day = s.day; fakeReviewsDay(s); }
  assert.equal(F.ftc.batchIds[0], 'old');
  F.batches.push({ id: 'new', n: 60, day: s.day, status: 'live', source: 'helpdesk', detectedDay: s.day });
  for (let d = 0; d < 3000 && F.ftc.batchIds[0] === 'old'; d++) { s.day++; F.batches[1].day = s.day; fakeReviewsDay(s); }
  assert.deepEqual(F.ftc.batchIds, ['new']);
  assert.equal(F.ftcHistory.length, 1);
  assert.equal(F.ftcHistory[0].status, 'resolved');
});

test('7. cancelling a past_due subscription voids its open card invoice', () => {
  const s = fresh();
  const c = createCustomer(s, { name: 'Ada', email: 'ada@x.com', country: 'US' });
  const sub = subscribe(s, c.id, { id: 'p', price: 100, interval: 'month', trialDays: 0 });
  sub.status = 'past_due';
  const inv = { id: 'in_test', subId: sub.id, customerId: c.id, amount: 100, status: 'open', method: 'card', day: s.day };
  const ach = { id: 'in_ach', subId: sub.id, customerId: c.id, amount: 100, status: 'open', method: 'ach_invoice', day: s.day };
  s.stripe.invoices.push(inv, ach);
  cancel(s, sub.id);
  assert.equal(sub.status, 'canceled');
  assert.equal(inv.status, 'void');
  assert.equal(ach.status, 'open', 'enterprise invoices for delivered service stay collectible');
});

test('8. a vendor-suspended health plan stops lowering personal living costs; reactivation re-applies it', () => {
  const s = fresh();
  const p = ensurePersonal(s);
  p.monthlyLivingCosts = 2900; // 3,500 minus the company-paid 600 premium
  const r = addRecurring(s, { vendor: 'Health insurance', amount: 600, category: 'other', dayOfMonth: dayOfMonth(s) });
  r.personalOffset = 600; r.declines = 2;
  post(s, { amount: -balance(s), counterparty: 'drain', category: 'other' });
  chargeRecurring(s);
  assert.ok(r.suspended);
  assert.equal(p.monthlyLivingCosts, 3500, 'nobody pays the plan: the premium is back on the founder');
  reactivateRecurring(s, r.id);
  assert.equal(p.monthlyLivingCosts, 2900);
  // Suspend again, then cancel: cancelling must not add the premium a second time.
  r.active = true; r.declines = 2; r.dayOfMonth = dayOfMonth(s);
  chargeRecurring(s);
  assert.equal(p.monthlyLivingCosts, 3500);
  cancelBill(s, r.id);
  assert.equal(p.monthlyLivingCosts, 3500);
  assert.match(src('apps/money/spend.js'), /r\.suspended = true; r\.retryDay = null; r\.cardHold = null;\n\s+suspendPersonalOffset\(state, r\)/);
});

test('9. SOC 2 Type II can be renewed, and the last Type II report stays on hand during the renewal', () => {
  const s = fresh(3, 'ent');
  const L = ensureLegal(s);
  const c = ensureCompliance(s);
  const report = { id: 'r1', type: 'type2', day: s.day, auditor: 'boutique', exceptions: [], opinion: 'clean' };
  c.reports.push(report);
  L.soc2 = 'type2'; L.soc2Report = report; L.soc2Plan = { type: 'type2', doneDay: s.day, findings: [] };
  s.day += 350;
  startSoc2(s, 'type2');
  assert.equal(L.soc2, 'type2_in_progress');
  assert.equal(L.soc2Plan.findings, undefined, 'the renewal gets its own fieldwork snapshot');
  assert.equal(soc2ReportOnHand(s)?.type, 'type2');
  assert.throws(() => startSoc2(s, 'type2'), /underway/);
});

test('10. ctx.act in-flight dedupe identifies the action, not just label|hours', () => {
  const t = src('main.js');
  assert.ok(!/const key = `\$\{label\}\|\$\{hours\}`;/.test(t), 'old label|hours key is gone');
  assert.match(t, /const key = actKey\(fn, label, hours\);/);
  assert.match(t, /function actKey\(fn, label, hours\)[\s\S]*String\(fn\)/);
});
