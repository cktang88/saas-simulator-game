// Regression tests for sales-system bugs: paid pilots billing lost buyers, a converted pilot stuck with no price,
// meetings joined but never ended, and a second AI SDR cancel re-billing an annual contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack, post, balance } from '../public/core/bank.js';
import { ensureNetwork } from '../public/core/network.js';
import { ensureCalendar } from '../public/core/calendar.js';
import { addContact, ensureDeal, proposePilot, loseDeal } from '../public/apps/sales/model.js';
import { dealsDay, startAiSdr, stopAiSdr } from '../public/apps/sales/engine.js';
import { joinMeeting, meetingsDay, ensureMeetings } from '../public/apps/meetings/model.js';

function fresh(model = 'ent', seed = 11) {
  const s = newState({ companyName: 'Pilotly', model, path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 500000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Bank feed reconciliation', status: 'shipped' }] };
  return s;
}

// A deal that said yes to a pilot (retry seeds: the ask is a dice roll).
function pilotDeal(type) {
  for (let seed = 1; seed < 400; seed++) {
    const s = fresh('ent', seed);
    const { contact } = addContact(s, { firstName: 'Cam', email: `cfo${seed}@buyer.com`, title: 'CFO', company: 'Buyer Inc', domain: 'buyer.com' }, { source: 'network' });
    const deal = ensureDeal(s, { companyId: contact.companyId, contactId: contact.id, stage: 'meeting_held' });
    deal.hasPain = true; deal.callQuality = 0.9;
    if (proposePilot(s, deal, { type }).ok) return { s, deal };
  }
  throw new Error('no pilot accepted');
}

test('a paid pilot on a lost deal stops billing (it used to charge the lost buyer forever)', () => {
  const { s, deal } = pilotDeal('paid_pilot');
  const sub = s.stripe.subscriptions.find((x) => x.id === deal.pilot.subId);
  assert.ok(sub && sub.status === 'active');
  loseDeal(s, deal, 'Marked lost by you');
  assert.equal(deal.pilot.status, 'ended');
  assert.ok(sub.cancelAtPeriodEnd || sub.status === 'canceled', 'the pilot subscription is cancelled');
});

test('a pilot that converts while there is no price goes back to Qualified instead of sticking in Proposal', () => {
  const { s, deal } = pilotDeal('design_partner');
  s.plans = []; // no price set
  deal.pilot.endDay = s.day;
  s.apps.crm.deals = [deal];
  let converted = false;
  for (let i = 0; i < 40 && !converted; i++) {
    // re-run the end-of-pilot roll until it converts (a fresh pilot each time)
    deal.stage = 'proposal'; deal.pilot.status = 'active'; deal.pilotConverted = false; deal.lostReason = null;
    dealsDay(s);
    converted = deal.pilot.status === 'converted';
  }
  assert.ok(converted, 'pilot converted at least once');
  assert.equal(deal.stage, 'qualified', 'the proposal form is reachable again');
  assert.equal(deal.pilotConverted, true, 'the buyer\'s yes is kept for when the proposal goes out');
});

test('a meeting joined but never ended is scored the next day and its opportunity resolves', () => {
  const s = fresh('smb');
  const n = ensureNetwork(s);
  n.people.push({ id: 'per_1', name: 'Dana Fox', role: 'Ops lead', company: 'Fox Co' });
  const inb = { id: 'inb_1', category: 'customer', channel: 'email', day: s.day, outcome: 'customer_lead', status: 'pending', personId: 'per_1', threadId: null, engaged: 0, resolved: false };
  n.inbound.push(inb);
  const ev = { id: 'ev_1', day: s.day, start: 600, duration: 30, kind: 'call', app: 'meetings', status: 'scheduled', inboundId: inb.id, title: 'Call with Dana', with: { name: 'Dana Fox' } };
  ensureCalendar(s).events.push(ev);
  inb.eventId = ev.id;
  const note = joinMeeting(s, ev.id);
  note.transcript.push({ from: 'me', body: 'Hi Dana, thanks for making time today.' });
  s.day += 1;
  meetingsDay(s);
  assert.equal(note.status, 'done', 'no longer stuck "live"');
  assert.equal(inb.resolved, true, 'the opportunity realised or went cold');
  assert.equal(ensureMeetings(s).notes.length, 1);
});

test('a network call missed by overbooking loses its opportunity', () => {
  const s = fresh('smb');
  const n = ensureNetwork(s);
  const inb = { id: 'inb_2', category: 'customer', channel: 'email', day: s.day, outcome: 'customer_lead', status: 'pending', personId: null, resolved: false };
  n.inbound.push(inb);
  ensureCalendar(s).events.push({ id: 'ev_2', day: s.day, start: 600, duration: 30, kind: 'call', app: 'meetings', status: 'missed', inboundId: inb.id, title: 'Call' });
  meetingsDay(s);
  assert.equal(inb.resolved, true);
  assert.equal(inb.result, 'no_show_by_founder');
});

test('cancelling the AI SDR twice bills the rest of an annual contract only once', () => {
  const s = fresh('smb');
  startAiSdr(s, { vendor: 'alice_11x', mode: 'autopilot' });
  s.day += 40;
  stopAiSdr(s);
  const after = balance(s);
  stopAiSdr(s);
  assert.equal(balance(s), after);
});
