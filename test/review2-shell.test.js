// Regression tests from the second shell review (progressive disclosure, planner, help catalogue).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPS } from '../public/apps/registry.js';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { advance } from '../public/core/clock.js';
import { NODE_BY_ID, ensureProgress, stepDone, requestNode, isNodeDone, isTabUnlocked } from '../public/core/unlocks.js';
import { ensurePlanner, addCriterion, decideCriterion, chooseScheduler, SCHEDULER_PLANS } from '../public/apps/assistant/planner.js';
import { HELP } from '../public/data/help-catalog.js';

function mk(model = 'smb') {
  const s = newState({ companyName: 'X', model, path: 'indie', founderName: 'P', seed: 7 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  return s;
}

test('a hire who has left (status gone) does not tick "Hire someone"', () => {
  const s = mk();
  ensureProgress(s);
  s.apps.people = { members: [{ id: 'm1', kind: 'employee', status: 'gone' }], jobs: [] };
  const node = NODE_BY_ID.first_hire;
  assert.equal(stepDone(s, node, node.steps.find((x) => x.id === 'hire')), false);
  s.apps.people.members.push({ id: 'm2', kind: 'employee', status: 'active' });
  assert.equal(stepDone(s, node, node.steps.find((x) => x.id === 'hire')), true);
});

test('a dispute answered with evidence counts even after it is lost', () => {
  const s = mk();
  ensureProgress(s);
  s.stripe.disputes = [{ id: 'dp', status: 'lost', evidenceQuality: 0.6 }];
  const node = NODE_BY_ID.dispute;
  assert.equal(stepDone(s, node, node.steps[0]), true);
  s.stripe.disputes = [{ id: 'dp', status: 'lost' }]; // never answered
  assert.equal(stepDone(s, node, node.steps[0]), false);
});

test('asking for a function ("Set it up") is not the same as finishing it', () => {
  const s = mk();
  ensureProgress(s);
  requestNode(s, 'ads');
  assert.equal(isNodeDone(s, 'ads'), false, 'ads completes on the first campaign, not on the request');
});

test('old saves keep gated tabs of always-visible apps they already use (bank treasury)', () => {
  const s = mk();
  advance(s, 3, APPS);
  delete s.progress;
  s.day = 120;
  s.apps.bank = { ...(s.apps.bank ?? {}), treasury: { enabled: true, target: 20000 } };
  ensureProgress(s);
  assert.ok(isTabUnlocked(s, 'bank/treasury'));
  assert.equal(isTabUnlocked(s, 'bank/stack'), false, 'unused tabs stay hidden');
});

test('a rejected "persist" leaves the missed kill criterion open', () => {
  const s = mk();
  const c = addCriterion(s, { metric: 'mrr', threshold: 1000, byDay: s.day + 30 });
  c.status = 'missed'; c.missedDay = s.day;
  assert.throws(() => decideCriterion(s, c.id, 'persist', { byDay: s.day + 5 }), /30 days/);
  assert.equal(c.status, 'missed');
  assert.equal(ensurePlanner(s).criteria.length, 1);
});

test('choosing the AI scheduler you already have does not charge again', () => {
  const s = mk();
  post(s, { amount: 5000, counterparty: 'P', category: 'owner_contribution' });
  chooseScheduler(s, 'reclaim_starter');
  const txns = s.bank.txns.length, bills = s.recurring.filter((r) => r.active).length;
  chooseScheduler(s, 'reclaim_starter');
  assert.equal(s.bank.txns.length, txns);
  assert.equal(s.recurring.filter((r) => r.active).length, bills);
  assert.ok(SCHEDULER_PLANS[ensurePlanner(s).scheduler.plan]);
});

test('help links to URL-routed tabs of organic, ads, market and launch, and to-dos deep-link there', () => {
  for (const e of HELP.filter((x) => ['organic', 'ads', 'market', 'launch'].includes(x.app))) {
    for (const f of e.features) if (f.tab) assert.equal(f.route, f.tab, `${e.app}/${f.tab}`);
  }
  assert.equal(NODE_BY_ID.community.go, 'organic/community');
  assert.equal(NODE_BY_ID.ugc.go, 'ads/creators');
});
