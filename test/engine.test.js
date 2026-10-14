import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/engine.js';
import { DECISIONS } from '../public/decisions.js';
import { coach } from '../public/coach.js';
import { PLAYBOOK } from '../public/playbook.js';

// Resolve every decision with the given choice index (default: first option).
const answer = (s, pick = () => 0) => { const d = E.currentDecision(s); if (d) E.decide(s, d.id, pick(d)); };

function play(model, seed, months, strategy = () => {}, pick) {
  const s = E.newGame({ name: 'Test', model, seed });
  for (let i = 0; i < months && s.status === 'playing'; i++) {
    answer(s, pick);
    if (s.status !== 'playing') break;
    strategy(s);
    E.step(s);
  }
  return s;
}

test('a new game starts pre-launch with an incorporation decision', () => {
  const s = E.newGame({ model: 'b2c', seed: 1 });
  assert.equal(s.phase, 'idea');
  assert.equal(E.currentDecision(s).id, 'incorporate');
  E.step(s);
  assert.equal(s.month, 0, 'cannot advance with a pending decision');
});

test('same seed produces the same game', () => {
  assert.deepEqual(play('smb', 42, 36).history, play('smb', 42, 36).history);
});

for (const model of ['b2c', 'smb', 'ent']) {
  test(`${model}: founders build an MVP, launch and get paying customers`, () => {
    const s = play(model, 7, 30);
    assert.equal(s.phase, 'launched');
    assert.ok(s.customers > 0 && E.mrr(s) > 0, `customers=${s.customers}`);
    assert.equal(s.status, 'playing');
  });

  test(`${model}: blowing the budget on ads before product-market fit goes bankrupt`, () => {
    const s = play(model, 3, 60, (g) => { if (g.phase === 'launched') g.paidBudget = 60000; });
    assert.equal(s.status, 'bankrupt');
  });
}

test('customer discovery improves product-market fit', () => {
  const research = play('smb', 5, 36, (g) => (g.time = { build: 50, sell: 25, research: 25, fundraise: 0 }));
  const noResearch = play('smb', 5, 36, (g) => (g.time = { build: 70, sell: 30, research: 0, fundraise: 0 }));
  assert.ok(E.pmf(research) > E.pmf(noResearch) + 10, `${E.pmf(research)} vs ${E.pmf(noResearch)}`);
});

test('hires arrive after a month, cost salary, and ramp', () => {
  const s = play('smb', 1, 0);
  answer(s);
  E.hire(s, 'eng');
  assert.equal(E.productive(s, 'eng'), 0);
  E.step(s);
  answer(s);
  assert.ok(E.productive(s, 'eng') > 0 && E.productive(s, 'eng') < 1);
  assert.ok(E.monthlyCosts(s).payroll >= E.ROLES.eng.salary);
});

test('annual plans bring 12 months of cash upfront', () => {
  const s = play('smb', 9, 24, (g) => (g.annualPlans = true));
  const h = s.history.at(-1);
  assert.ok(s.annualSlots.some((x) => x > 0));
  assert.ok(h.mrr > 0);
});

test('price migration raises MRR and triggers a churn bump', () => {
  const s = play('smb', 4, 24);
  assert.ok(s.customers > 0);
  const before = E.mrr(s);
  s.price = Math.round(E.arpa(s) * 1.5);
  E.migratePrice(s);
  assert.ok(E.mrr(s) > before * 1.3);
  assert.ok(s.effects.some((e) => e.label === 'Price-increase churn'));
});

test('raising: a term sheet dilutes founders and adds cash', () => {
  const s = E.newGame({ model: 'ent', seed: 2 });
  answer(s);
  s.insight = 90;
  s.time = { build: 30, sell: 10, research: 10, fundraise: 50 };
  E.startRaise(s);
  let guard = 0;
  while (!s.pendingDecision && guard++ < 10) E.step(s);
  const d = E.currentDecision(s);
  assert.match(d.id, /^termsheet/);
  const cash = s.cash;
  E.decide(s, d.id, 0);
  assert.equal(s.roundsRaised, 1);
  assert.ok(s.cash > cash + 700_000);
  assert.ok(s.founderEquity < 1 && s.founderEquity > 0.85);
});

test('liquidation preferences come out before founders', () => {
  const s = E.newGame({ model: 'smb', seed: 1 });
  s.founderEquity = 0.6;
  s.investors = [{ name: 'Seed', invested: 10e6, ownership: 0.4, prefMult: 2, participating: true }];
  // $30M exit: investor takes $20M pref, then 40% of the remaining $10M.
  assert.equal(Math.round(E.exitPayout(s, 30e6)), 6e6);
  s.investors[0] = { ...s.investors[0], prefMult: 1, participating: false };
  // 1x non-participating converts: 40% of $30M = $12M > $10M pref.
  assert.equal(Math.round(E.exitPayout(s, 30e6)), 18e6);
});

test('reaching $10M ARR wins', () => {
  const s = E.newGame({ model: 'smb', seed: 1 });
  answer(s);
  s.phase = 'launched';
  s.customers = 9000;
  s.monthlyMrr = 1_200_000;
  s.cash = 1e9;
  E.step(s);
  assert.equal(s.status, 'won');
});

test('every decision card is well-formed and its effects run', () => {
  for (const d of DECISIONS) {
    assert.ok(d.id && d.title && d.choices.length >= 2, d.id);
    for (let i = 0; i < d.choices.length; i++) {
      const s = play(d.models?.[0] ?? 'smb', 11, 30);
      s.pendingDecision = null;
      E.queueDecision(s, d.id);
      assert.ok(E.currentDecision(s).text.length > 10);
      const res = E.decide(s, d.id, i);
      assert.equal(typeof res.text, 'string');
      assert.ok(d.choices[i].lesson, `${d.id}#${i} has a lesson`);
      assert.ok(Number.isFinite(s.cash) && Number.isFinite(E.mrr(s)), `${d.id}#${i} keeps numbers finite`);
    }
  }
});

test('coach always gives at least one tip', () => {
  for (const model of ['b2c', 'smb', 'ent']) for (const m of [0, 3, 20]) {
    assert.ok(coach(play(model, 2, m)).length > 0);
  }
});

test('playbook has stages with unique step ids', () => {
  const ids = PLAYBOOK.flatMap((s) => s.steps.map((x) => x.id));
  assert.ok(PLAYBOOK.length >= 8);
  assert.equal(new Set(ids).size, ids.length);
});
