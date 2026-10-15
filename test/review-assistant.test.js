// Regression tests from the assistant / mail / automations bug review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { newThread, addMessage, ensureMail } from '../public/core/mail.js';
import { enqueue, registerJob, hasJob } from '../public/core/jobs.js';
import { ensureInbox, setReminder, triageDay } from '../public/apps/assistant/triage.js';
import { ensureAssistant, choosePlan, grantConnector, createTask, runTask, approveAction } from '../public/apps/assistant/engine.js';
import { ensureAutomations, choosePlatform, createAutomation, setStatus, automationsDay } from '../public/apps/automations/engine.js';

function world(seed = 11) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 80000, counterparty: 'Pat', category: 'owner_contribution' });
  for (let i = 0; i < 5; i++) { const c = createCustomer(s, { name: `Customer ${i}`, email: `o${i}@f${i}.com` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 }); }
  return s;
}

function threadAwaitingReply(s) {
  const t = newThread(s, { subject: 'Pilot', with: { name: 'Dana Prospect', email: 'dana@acme.com' }, kind: 'prospect' });
  addMessage(s, t.id, { from: 'them', body: 'Interested.' });
  addMessage(s, t.id, { from: 'me', body: 'Great, here are the details.' });
  return t;
}

test('reminder does not fire "no reply" while a reply that is already due is still being processed', () => {
  const s = world();
  ensureInbox(s);
  const t = threadAwaitingReply(s);
  setReminder(s, t.id, 2);
  // Reply due tomorrow; the job queue only runs after a multi-day advance, so it is still pending on the due day.
  enqueue(s, 'reply:prospect', { threadId: t.id }, { notBefore: s.day + 1 });
  s.day += 2;
  triageDay(s);
  const r = ensureInbox(s).reminders[0];
  assert.equal(r.status, 'pending', 'reminder waits for the reply that has already arrived in the world');
  assert.equal(ensureInbox(s).stats.remindersFired, 0);
  // The reply lands; next check marks the reminder replied.
  s.jobs = [];
  addMessage(s, t.id, { from: 'them', body: 'Thanks!' });
  s.day += 1;
  triageDay(s);
  assert.equal(r.status, 'replied');
});

test('reminder still fires when the reply is only scheduled for a later day', () => {
  const s = world();
  ensureInbox(s);
  const t = threadAwaitingReply(s);
  setReminder(s, t.id, 2);
  enqueue(s, 'reply:prospect', { threadId: t.id }, { notBefore: s.day + 5 });
  s.day += 2;
  triageDay(s);
  assert.equal(ensureInbox(s).reminders[0].status, 'fired');
});

test('reminder on a nameless sender is not flagged as answered elsewhere by other nameless threads', () => {
  const s = world();
  ensureInbox(s);
  const t = newThread(s, { subject: 'A', with: null, kind: 'network' });
  addMessage(s, t.id, { from: 'me', body: 'hello' });
  setReminder(s, t.id, 1);
  const o = newThread(s, { subject: 'B', with: null, kind: 'system' });
  addMessage(s, o.id, { from: 'them', body: 'receipt' });
  s.day += 1;
  triageDay(s);
  const r = ensureInbox(s).reminders[0];
  assert.equal(r.status, 'fired');
  assert.ok(!r.falsePositive);
});

test('an approved assistant reply to a customer gets a (delayed) reply job like a reply sent from Mail', () => {
  const s = world();
  if (!hasJob('reply:customer')) registerJob('reply:customer', async () => {});
  ensureAssistant(s);
  choosePlan(s, 'claude_max');
  grantConnector(s, 'mail', 'write');
  const t = newThread(s, { subject: 'Export question', with: { name: 'Sam Customer' }, kind: 'customer' });
  addMessage(s, t.id, { from: 'them', body: 'How do I export?' });
  const task = createTask(s, { name: 'Replies', templateId: 'customer_digest', mode: 'ask', schedule: 'once' });
  const run = runTask(s, task, { manual: true });
  const a = run.actions.find((x) => x.type === 'reply' && x.threadId === t.id);
  assert.ok(a, 'a reply action was proposed');
  s.jobs = [];
  approveAction(s, run.id, a.id);
  const j = s.jobs.find((x) => x.type === 'reply:customer' && x.payload.threadId === t.id);
  assert.ok(j, 'customer reply job enqueued');
});

test('automations: runs held by a 429 with "retry tomorrow" are retried the next day; plan-limit holds wait for replay', () => {
  const s = world();
  s.apps.automations = {};
  const A = ensureAutomations(s);
  choosePlatform(s, 'zapier_pro');
  const { auto } = createAutomation(s, { name: 'Digest', trigger: 'weekly_schedule', actions: [{ type: 'slack_post' }], retry: true });
  auto.latent = { filterBroken: false, mappingBroken: false };
  setStatus(s, auto, true);
  A.held.push({ autoId: auto.id, ev: { ref: 'r1', key: 'k1', label: 'Retry me' }, day: s.day, retry: true });
  A.held.push({ autoId: auto.id, ev: { ref: 'r2', key: 'k2', label: 'Over limit' }, day: s.day });
  s.day += 1;
  automationsDay(s);
  assert.equal(A.held.length, 1, 'only the plan-limit hold remains');
  assert.equal(A.held[0].ev.ref, 'r2');
  assert.ok(A.runs.some((r) => r.ref === 'r1' && r.status === 'success'), 'the rate-limited run was retried');
});
