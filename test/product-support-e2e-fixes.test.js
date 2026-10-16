import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { planLine, issueTruth } from '../public/apps/helpdesk.js';
import { replySystem } from '../public/apps/support/rubrics.js';
import { classifyRecord } from '../public/apps/automations/engine.js';
import { QUESTION_TAG_QUESTIONS } from '../public/apps/product/interview.js';

function world() {
  const s = newState({ companyName: 'Ledgerline', model: 'smb', path: 'indie', founderName: 'Pat', seed: 3 });
  ensureStripe(s);
  s.plans = [{ id: 'plan_pro', name: 'Pro', price: 39, interval: 'month', trialDays: 0, active: true }];
  const c = createCustomer(s, { name: 'Dana Ng', email: 'd@x.com' });
  const sub = subscribe(s, c.id, s.plans[0], { trial: false });
  s.apps.product = { features: [], bugs: [{ id: 'b1', title: 'Fees post in USD', fixedDay: null }], buildQueue: [] };
  return { s, sub };
}

test('support customers know their own plan; replies see whether the bug is really fixed', () => {
  const { s, sub } = world();
  assert.match(planLine(s, sub.id), /\$39\/month for the Pro plan/);
  const t = { category: 'bug', topic: 'Fees post in USD' };
  assert.match(issueTruth(s, t), /still in the product/);
  s.apps.product.bugs[0].fixedDay = s.day;
  assert.match(issueTruth(s, t), /works now/);
  assert.equal(issueTruth(s, { category: 'billing', topic: null }), '');
  assert.match(replySystem({ name: 'Dana', label: 'Bug', company: 'Ledgerline', waited: 0, facts: planLine(s, sub.id) }), /\$39\/month/);
});

test('automation classify sends route descriptions, not bare labels', async () => {
  const { s } = world();
  let seen = null;
  const llm = { decide: async (o) => { seen = o.questions.route.criteria; return { answers: { route: { choice: 'bug', confidence: 0.9 } }, mock: false }; } };
  const r = await classifyRecord({ state: s, llm }, 'support_ticket', 'Sync throws error 500');
  assert.equal(r.label, 'bug');
  assert.match(seen.outage, /whole app/i);
  assert.match(seen.bug, /while the app itself is up/);
});

test('Mom Test tag questions stay independent yes/no labels with explicit exclusions', () => {
  for (const q of Object.values(QUESTION_TAG_QUESTIONS)) assert.equal(q.type, 'noul');
  assert.match(QUESTION_TAG_QUESTIONS.generic.criteria.false, /hypothetical/);
  assert.match(QUESTION_TAG_QUESTIONS.pitch.criteria.false, /imagined generic tool/);
});
