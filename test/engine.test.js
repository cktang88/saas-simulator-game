import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/engine.js';

const play = (seed, months, strategy = () => {}) => {
  const s = E.newGame('Test', seed);
  for (let i = 0; i < months && s.status === 'playing'; i++) {
    strategy(s);
    E.step(s);
  }
  return s;
};

test('same seed produces the same game', () => {
  assert.deepEqual(play(42, 24).history, play(42, 24).history);
});

test('founders alone survive and grow slowly', () => {
  const s = play(1, 36);
  assert.equal(s.status, 'playing');
  assert.ok(E.mrr(s) > 490);
});

test('overspending goes bankrupt', () => {
  const s = play(1, 60, (g) => { g.marketingBudget = 100_000; });
  assert.equal(s.status, 'bankrupt');
});

test('raising requires the MRR threshold and dilutes founders', () => {
  const s = E.newGame('Test', 1);
  E.raise(s);
  assert.equal(s.roundsRaised, 0);
  s.customers = 200;
  const cash = s.cash;
  E.raise(s);
  assert.equal(s.roundsRaised, 1);
  assert.equal(s.cash, cash + E.ROUNDS[0].amount);
  assert.ok(s.founderEquity < 1 && s.founderEquity >= 0.8);
});

test('hiring and firing adjust team and cash', () => {
  const s = E.newGame('Test', 1);
  E.hire(s, 'eng');
  assert.equal(s.team.eng, 1);
  E.fire(s, 'eng');
  assert.equal(s.team.eng, 0);
  E.fire(s, 'eng');
  assert.equal(s.team.eng, 0);
});

test('reaching $10M ARR wins', () => {
  const s = E.newGame('Test', 1);
  s.customers = 20_000;
  s.cash = 1e9;
  E.step(s);
  assert.equal(s.status, 'won');
});

test('brand never exceeds 100', () => {
  const s = play(3, 120, (g) => { g.team.marketing = 20; g.marketingBudget = 50_000; g.cash = 1e9; });
  assert.ok(s.brand <= 100);
});
