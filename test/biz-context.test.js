import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { seedDefaultStack } from '../public/core/bank.js';
import { bizBlock } from '../public/apps/context.js';

test('LLM business context respects who could know what', () => {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed: 5 });
  ensureStripe(s); seedDefaultStack(s);
  s.company.oneLiner = 'Scheduling for dental offices'; s.company.icp = 'Owner-run US dental practices';
  const pub = bizBlock(s, 'public'), cust = bizBlock(s, 'customer'), ins = bizBlock(s, 'insider');
  for (const b of [pub, cust, ins]) { assert.match(b, /Scheduling for dental offices/); assert.match(b, /\$49\/mo/); }
  for (const b of [pub, cust]) { assert.doesNotMatch(b, /MRR|runway|cash|ICP/); }
  assert.match(ins, /ICP/); assert.match(ins, /MRR \$0/); assert.match(ins, /cash \$/);
});

test('insider context summarizes recent support themes and stated churn reasons', () => {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed: 5 });
  ensureStripe(s); seedDefaultStack(s);
  s.day = 100;
  s.apps.support = { tickets: [{ category: 'billing', createdDay: 95 }, { category: 'billing', createdDay: 90 }, { category: 'bug', createdDay: 99 }, { category: 'bug', createdDay: 20 }] };
  s.apps.customers = { surveys: [{ day: 80, category: 'too_expensive' }, { day: 70, category: 'too_expensive' }, { day: 60, category: 'no_answer' }, { day: 90, category: 'bugs', trial: true }] };
  const ins = bizBlock(s, 'insider');
  assert.match(ins, /Support \(30d\): 3 tickets; most common: billing \(2\), bug \(1\)/);
  assert.match(ins, /Too expensive for the value \(2\)/);
  assert.doesNotMatch(bizBlock(s, 'customer'), /Support|Cancellation/);
});
