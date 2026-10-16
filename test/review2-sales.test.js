// Regression tests for the second sales review (calls, CRM, outreach, sales/*).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { completeEvent } from '../public/core/calendar.js';
import { ensureCrm, ensureCalls, addContact, ensureDeal, startProposal, createMeeting, nextSlot, calendarEvent } from '../public/apps/sales/model.js';
import { callsDay } from '../public/apps/sales/engine.js';
import { SALES_ACTIONS } from '../public/apps/sales/automation.js';
import { endCall } from '../public/apps/calls.js';

function fresh(seed = 7) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Automated bookkeeping reconciliation for dental clinics';
  s.company.icp = 'Owners of independent dental clinics with 2-10 dentists';
  ensureCrm(s); ensureCalls(s);
  return s;
}
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

function proposalDealWithFollowUp(s, n = 0) {
  const { contact } = addContact(s, { firstName: 'Dana', lastName: `Smile${n}`, email: `dana${n}@brightsmile${n}.com`, title: 'Owner', company: `Bright Smile ${n}` });
  const deal = ensureDeal(s, { companyId: contact.companyId, contactId: contact.id, stage: 'qualified' });
  startProposal(s, deal, { planId: s.plans[0].id });
  assert.equal(deal.stage, 'proposal');
  const m = createMeeting(s, { contactId: contact.id, slot: nextSlot(s, { minLead: 1 }), kind: 'follow_up' });
  return { deal, m, contact };
}

test('A missed follow-up call never drags a proposal-stage deal back to "replied"', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const s = fresh(seed);
    const { deal, m } = proposalDealWithFollowUp(s, seed);
    assert.equal(deal.stage, 'proposal', 'booking a follow-up keeps the later stage');
    Object.assign(m, { noShowP: 0, prospectMoveRolled: true, cancelRolled: true });
    s.day = m.day;
    completeEvent(s, calendarEvent(s, m).id, 'missed');
    callsDay(s);
    assert.equal(m.status, 'missed');
    assert.ok(['proposal', 'lost'].includes(deal.stage), `seed ${seed}: deal went to ${deal.stage}`);
  }
});

test('A missed first discovery call still moves a meeting-booked deal back to "replied"', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const s = fresh(seed);
    const { contact } = addContact(s, { firstName: 'Lee', lastName: 'Tooth', email: `lee${seed}@toothco${seed}.com`, title: 'Owner', company: `Tooth Co ${seed}` });
    const m = createMeeting(s, { contactId: contact.id, slot: nextSlot(s, { minLead: 1 }) });
    const deal = ensureCrm(s).deals.find((d) => d.id === m.dealId);
    Object.assign(m, { noShowP: 0, prospectMoveRolled: true, cancelRolled: true });
    s.day = m.day;
    completeEvent(s, calendarEvent(s, m).id, 'missed');
    callsDay(s);
    assert.ok(['replied', 'lost'].includes(deal.stage), deal.stage);
  }
});

test('Canceling a meeting in Calls only reverts a deal that was waiting on it (meeting booked)', () => {
  assert.match(src('../public/apps/calls.js'), /d\.stage === 'meeting_booked'\) moveDeal\(st, d, 'replied', 'meeting canceled'\)/);
});

test('endCall does not score a call twice when the day rolled over while the coach was scoring', async () => {
  const s = fresh(3);
  const { m } = proposalDealWithFollowUp(s, 3);
  m.status = 'in_call';
  m.transcript = [{ from: 'me', text: 'Walk me through the last time reconciliation went wrong?' }, { from: 'them', text: 'Last month we lost two days on it.' }];
  let calls = 0;
  const ctx = { state: s, llm: { ask: async (o) => { calls++; m.status = 'held'; m.scorecard = { fromCallsDay: true }; return { data: o.fallback(), mock: true }; } } };
  const acts = () => ensureCrm(s).activities.filter((a) => /^Call held/.test(a.text)).length;
  const before = acts();
  await endCall(ctx, m);
  assert.equal(calls, 1);
  assert.deepEqual(m.scorecard, { fromCallsDay: true }, 'the outcome callsDay applied is kept, not overwritten');
  assert.equal(acts(), before, 'no second "Call held" outcome');
  await endCall(ctx, m);
  assert.equal(calls, 1, 'a held call is not sent to the coach again');
});

test('Joining a call refunds the prep flag when the join is rejected (no free prep on retry)', () => {
  const s = src('../public/apps/calls.js');
  assert.match(s, /if \(!ok && prep > 0\) m\.prepCharged = false;/);
});

test('Automation book_call refuses a second booking for a contact who already has a call, and opted-out contacts', () => {
  const s = fresh(5);
  const { contact } = addContact(s, { firstName: 'Kim', lastName: 'Molar', email: 'kim@molarworks.com', title: 'Owner', company: 'Molar Works' });
  const r1 = SALES_ACTIONS.book_call.run(s, { contactId: contact.id }, { approved: true });
  assert.equal(r1.ok, true);
  const r2 = SALES_ACTIONS.book_call.run(s, { contactId: contact.id }, { approved: true });
  assert.equal(r2.ok, false);
  assert.equal(ensureCalls(s).meetings.filter((m) => m.contactId === contact.id).length, 1);
  const { contact: c2 } = addContact(s, { firstName: 'Ray', lastName: 'Gum', email: 'ray@gumcare.com', title: 'Owner', company: 'Gum Care' });
  c2.status = 'unsubscribed';
  assert.equal(SALES_ACTIONS.book_call.run(s, { contactId: c2.id }, { approved: true }).ok, false);
});
