// Regression tests for the second support/success review pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import helpdesk, { ensureSupport, awaitCustomer, nudgeCustomer, customerWaitDay, correctFallout, CUSTOMER_WAIT } from '../public/apps/helpdesk.js';
import { ensureFlows, openCase, handleCase, flowsDay } from '../public/apps/support/flows.js';
import { ensureSuccess, addAsk, workOnAsk } from '../public/apps/success/engine.js';
import { CS } from '../public/apps/success/model.js';

const mk = (model = 'smb', seed = 3) => { const s = newState({ companyName: 'T', model, path: 'indie', founderName: 'P', seed }); ensureStripe(s); ensureMarket(s); return s; };
const ticket = (s, i) => ({ id: `t${i}`, name: 'Dana Reyes', company: 'Acme', subject: 'Export fails', category: 'bug', priority: 'normal', feature: 'CSV export', status: 'open', createdDay: s.day, firstResponseDay: s.day, messages: [{ from: 'them', text: 'CSV export fails with an error since Monday for our Acme workspace.', day: s.day }], channel: 'email' });
const CLEAR = 'Hi Dana, sorry about the CSV export at Acme. I fixed the bug today and it is live now. Here is how to re-run it: 1. Go to Settings 2. click Export. Can you check and tell me if the file arrives?';
const offlineCtx = (s) => ({ state: s, llm: { ask: async (o) => ({ data: o.fallback(), mock: true }) } });

test('helpdesk: the customer reacts to your answer, not to the follow-up ping', async () => {
  const run = async (nudge) => {
    const s = mk('smb', 5);
    const sup = ensureSupport(s);
    const t = ticket(s, 1); sup.tickets.push(t);
    t.messages.push({ from: 'me', text: CLEAR, day: s.day });
    awaitCustomer(s, t, CLEAR);
    if (nudge) { t.awaiting.quiet = false; nudgeCustomer(s, t); }
    await helpdesk.jobs['support:reply'](offlineCtx(s), { ticketId: t.id });
    return t;
  };
  const plain = await run(false), nudged = await run(true);
  assert.ok(nudged.messages.some((m) => m.nudge), 'the follow-up is in the thread');
  assert.equal(nudged.status, plain.status);
  assert.equal(nudged.satisfaction, plain.satisfaction, 'a polite follow-up must not downgrade a clear answer');
  assert.equal(nudged.status, 'solved');
});

test('helpdesk: a slow customer who will answer is not auto-closed as "went quiet"', () => {
  const s = mk('smb', 11);
  const sup = ensureSupport(s);
  const t = ticket(s, 2); sup.tickets.push(t);
  awaitCustomer(s, t, 'Thanks for reaching out, we will look into it.');
  t.awaiting.quiet = false;
  t.awaiting.day = s.day + CUSTOMER_WAIT.autoCloseDays + 3; // their reply lands after the auto-close date
  s.day += CUSTOMER_WAIT.autoCloseDays;
  customerWaitDay(s, sup);
  assert.equal(t.status, 'pending');
  assert.ok(!t.autoClosed && !sup.mistakeLog.some((m) => m.trap === 'customer_went_quiet'));
  s.day += 3;
  customerWaitDay(s, sup);
  assert.ok(s.jobs.some((j) => j.type === 'support:reply' && j.payload.ticketId === t.id), 'their reply is delivered');
});

test('helpdesk: correcting an AI answer twice does not log the goodwill twice', () => {
  const s = mk('smb', 4);
  const sup = ensureSupport(s);
  sup.ai.fallout.push({ id: 'fo1', day: s.day, due: s.day + 2, intent: 'refund', caught: true, corrected: false });
  correctFallout(s, 'fo1');
  const n = sup.csatLog.length;
  correctFallout(s, 'fo1');
  assert.equal(sup.csatLog.length, n);
});

test('support cases: a bug report waiting on the customer\'s info does not lapse as unanswered', () => {
  const s = mk('smb', 21);
  seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'P', category: 'owner_contribution' });
  s.apps.product = { features: [], bugs: [] };
  const c0 = createCustomer(s, { name: 'Ann Lee', email: 'a@x.com', company: 'Co' });
  const sub = subscribe(s, c0.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 });
  const sup = ensureSupport(s); sup.active = true;
  const c = openCase(s, 'bug_report', sub, { facts: { issueId: null, title: 'CSV export times out', haveInfo: false, severity: 'medium' } });
  s.day = c.dueDay; // ask on the last day of the clock
  const r = handleCase(s, c.id, { action: 'ask_info', checks: ['search_issues', 'collect_env'], text: 'Hi Ann, can you send the steps, browser and a screenshot of the CSV export at Co so I can reproduce it today?' });
  assert.ok(r.ok);
  assert.equal(c.status, 'waiting');
  s.day += 1;
  flowsDay(s, sup, { accounts: [] });
  assert.equal(c.status, 'waiting', 'still waiting for the customer, not lapsed');
  assert.ok(!(s.mistakes ?? []).some((m) => m.id === 'ticket_abandoned'));
  s.day += 1;
  flowsDay(s, sup, { accounts: [] });
  assert.equal(c.status, 'open', 'their info arrived; the ball is back with you');
  assert.ok(ensureFlows(s).cases.includes(c));
});

test('success: two VPAT asks open at once buy the accessibility audit once', () => {
  const s = mk('ent', 8);
  seedDefaultStack(s);
  const cs = ensureSuccess(s);
  const a1 = addAsk(s, { kind: 'vpat', target: 'deal', refId: 'd1', companyId: null });
  const a2 = addAsk(s, { kind: 'vpat', target: 'deal', refId: 'd2', companyId: null });
  const audits = () => s.bank.txns.filter((x) => /ACR \(VPAT\)/.test(x.description)).length;
  workOnAsk(s, a1, 0.5);
  workOnAsk(s, a2, 0.5);
  assert.equal(audits(), 1, `charged ${audits()} audits`);
  workOnAsk(s, a1, a1.hours);
  assert.equal(a1.status, 'done');
  const p = a1.progress;
  assert.equal(workOnAsk(s, a1, 2), false, 'a delivered ask takes no more work');
  assert.equal(a1.progress, p);
  assert.ok(cs.vpat && CS.vpatAuditCost > 0);
});
