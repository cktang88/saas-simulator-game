// Founder time per day: each day gets its share of the week; overflow carries past midnight; the week stays the cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, dayCap, dayUsed, hoursLeftToday, spendHours, hoursLeft } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';

const mk = () => newState({ companyName: 'D', model: 'smb', path: 'indie', founderName: 'P', seed: 2 });

test('a 55 h week is about 8 h a day, and today fills before the week', () => {
  const s = mk();
  assert.ok(Math.abs(dayCap(s) - 55 / 7) < 0.01);
  spendHours(s, 6, 'build');
  assert.ok(Math.abs(hoursLeftToday(s) - (55 / 7 - 6)) < 0.01);
  assert.equal(hoursLeft(s), 49);
});

test('work that runs past midnight carries into the next day and into a new week', () => {
  const s = mk();
  spendHours(s, 10, 'long build'); // more than today's share
  s.founder.carryHours = dayUsed(s) - dayCap(s);
  advance(s, 1, []);
  assert.ok(Math.abs(dayUsed(s) - (10 - 55 / 7)) < 0.01, 'tomorrow starts with the overflow');
  // Carry across Sunday -> Monday lands in the new week's ledger.
  advance(s, 5, []); // Sunday
  s.founder.carryHours = 2;
  const before = s.founder.hoursUsed;
  advance(s, 1, []); // Monday
  assert.ok(s.founder.hoursUsed >= 2 && s.founder.hoursUsed < before, 'new week starts with the carried hours (plus weekly overhead)');
  assert.ok(dayUsed(s) >= 2);
});

test('the daily share spreads what is left of the week over the days left', () => {
  const s = mk(), calm = mk();
  advance(s, 1, []); advance(calm, 1, []); // Tuesday
  spendHours(s, 20, 'crunch');
  spendHours(calm, 5, 'normal day');
  advance(s, 1, []); advance(calm, 1, []); // Wednesday
  assert.ok(dayCap(s) > 0 && dayCap(s) < dayCap(calm) - 2, `crunch ${dayCap(s)} vs calm ${dayCap(calm)}`);
});
