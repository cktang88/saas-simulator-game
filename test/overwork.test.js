// Planned hours are a plan, not a wall: the founder can work past it, on weekends and on the day off, but days past
// 12 h and weeks past 80 h cost sleep, energy, speed and health (core/overwork.js, core/wellbeing.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, spendHours, dayCap, dayUsed, hoursLeft, OutOfHoursError, refundHours } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { OVERWORK, fatigueTax, workEfficiency, overworkPreview, weekWorked } from '../public/core/overwork.js';
import { ensureWellbeing } from '../public/core/wellbeing.js';
import { clockNow, fmtTime } from '../public/core/calendar.js';
import { dayOfWeek } from '../public/core/util.js';

const mk = (seed = 3) => {
  const s = newState({ companyName: 'O', model: 'smb', path: 'indie', founderName: 'P', seed });
  ensureWellbeing(s);
  s.founder.energy = 70;
  return s;
};
const toDow = (s, dow) => { while (dayOfWeek(s) !== dow) advance(s, 1, []); };
const fatigueHours = (s) => (s.founder.timeLog ?? []).filter((t) => t.label.startsWith('Fatigue')).reduce((a, t) => a + t.hours, 0);
// Work `h` hours a day for `days` days (in 3 h chunks, as a player would), ending each day.
function work(s, h, days) {
  for (let d = 0; d < days; d++) {
    let left = h;
    while (left > 1e-9) { const c = Math.min(3, left); spendHours(s, c, 'Build'); left -= c; }
    advance(s, 1, []);
  }
}

test('you can keep working past today\'s plan, on Saturday and on the protected day off', () => {
  const s = mk();
  const plan = dayCap(s);
  spendHours(s, plan + 3, 'Late build'); // no wall at the plan
  assert.ok(dayUsed(s) >= plan + 3);
  toDow(s, 6);
  spendHours(s, 4, 'Saturday work');
  toDow(s, 0);
  assert.equal(dayCap(s), 0, 'the day off has no planned hours');
  spendHours(s, 3, 'Sunday work'); // allowed now, but it costs the day off
  assert.equal(s.founder.dayOffWorked, s.day);
  // Past the week's plan you can still work; hoursLeft (the plan) just reads 0.
  s.founder.hoursUsed = s.founder.hoursPerWeek + 5;
  assert.equal(hoursLeft(s), 0);
  assert.doesNotThrow(() => spendHours(s, 1, 'Overtime'));
});

test('working the day off forfeits its recovery', () => {
  const rest = mk(), worked = mk();
  for (const s of [rest, worked]) { toDow(s, 0); s.founder.hoursUsed = 30; }
  spendHours(worked, 3, 'Sunday catch-up');
  worked.founder.hoursUsed = 30; // same weekly load, only the day off differs
  advance(rest, 1, []); advance(worked, 1, []); // Monday: weekly energy update
  assert.ok(rest.founder.energy > worked.founder.energy + 3, `rested ${rest.founder.energy} vs worked ${worked.founder.energy}`);
  assert.ok(worked.mistakes.some((m) => m.functionId === 'founder_time' && m.id === 'worked_day_off'));
});

test('a normal week costs nothing extra', () => {
  const s = mk();
  work(s, 8, 6); // Mon–Sat, 8 h days: 48 h
  advance(s, 1, []); // rest Sunday → Monday review
  assert.equal(fatigueHours(s), 0);
  assert.equal(s.founder.sleepDebt, 0);
  assert.ok(!(s.mistakes ?? []).some((m) => m.functionId === 'founder_time'));
  assert.ok(s.founder.energy >= 70, `energy ${s.founder.energy}`);
});

test('days past 12 h are slower, build sleep debt and drain energy', () => {
  const calm = mk(), late = mk();
  work(calm, 9, 1);
  work(late, 15, 1);
  assert.equal(fatigueHours(calm), 0);
  assert.ok(fatigueHours(late) > 1.5, `fatigue ${fatigueHours(late)}`);
  const lateDay = late.founder.dayLog.at(-1);
  assert.ok(lateDay.hours > 16 && lateDay.sleep < 4, JSON.stringify(lateDay));
  assert.ok(late.founder.sleepDebt > 4);
  assert.ok(late.founder.energy < calm.founder.energy - 4, `${late.founder.energy} vs ${calm.founder.energy}`);
  assert.ok(late.notifications.some((n) => n.app === 'you' && /slept about/.test(n.text)));
  // Sleep debt slows the next normal day too, and only repays slowly.
  assert.ok(workEfficiency(late) < 0.97);
  assert.ok(fatigueTax(late, 2) > 0 && fatigueTax(calm, 2) === 0);
  work(late, 8, 1);
  assert.ok(late.founder.sleepDebt > 2, 'one normal night does not repay it');
});

test('an 80 h+ crunch week is logged with its cost and wrecks energy; a 50 h week does not', () => {
  const crunch = mk(), steady = mk();
  work(crunch, 12, 7); // 84 h of work, no day off (more once fatigue is counted)
  work(steady, 50 / 6, 6); advance(steady, 1, []);
  const m = crunch.mistakes.find((x) => x.functionId === 'founder_time' && x.id === 'crunch_week');
  assert.ok(m && m.cost.hours > 5 && /lost to fatigue/.test(m.detail), JSON.stringify(m));
  assert.ok(!(steady.mistakes ?? []).some((x) => x.functionId === 'founder_time'));
  assert.ok(crunch.founder.energy < steady.founder.energy - 15, `${crunch.founder.energy} vs ${steady.founder.energy}`);
  assert.ok(crunch.founder.sleepDebt > 10);
});

test('the shell is warned before crossing 12 h/day or 80 h/week; the week has a physical ceiling', () => {
  const s = mk();
  spendHours(s, 10, 'Build');
  assert.ok(overworkPreview(s, 3).crossesDay);
  assert.ok(!overworkPreview(s, 1).crossesDay);
  s.founder.hoursUsed = 78;
  assert.ok(overworkPreview(s, 3).crossesWeek);
  s.founder.hoursUsed = OVERWORK.weekMax - 1;
  assert.throws(() => spendHours(s, 3, 'Too much'), OutOfHoursError);
});

test('a refund returns the action and its fatigue hours', () => {
  const s = mk();
  spendHours(s, 12, 'Build');
  const before = s.founder.hoursUsed, day = dayUsed(s);
  const e = spendHours(s, 3, 'Late work');
  assert.ok(e.fatigue > 0);
  refundHours(s, e);
  assert.ok(Math.abs(s.founder.hoursUsed - before) < 1e-9);
  assert.ok(Math.abs(dayUsed(s) - day) < 1e-9);
});

test('the clock runs into the night', () => {
  const s = mk();
  spendHours(s, 15, 'All-nighter-ish'); // 9am start + 15 h + fatigue
  assert.ok(clockNow(s) > 24 * 60 && Math.abs(clockNow(s) - (9 * 60 + dayUsed(s) * 60)) <= 1, `${clockNow(s)}`);
  assert.match(fmtTime(clockNow(s)), /^[1-3](:\d\d)?am$/);
  assert.equal(fmtTime(23 * 60), '11pm');
  assert.equal(fmtTime(24 * 60), '12am');
});

test('operator tiers separate: sustainable vs grinding vs crunching over two weeks', () => {
  // Same 2 weeks; output = the work you meant to do (action hours); cost = all hours incl. fatigue.
  const run = (h, days) => {
    const s = mk(11);
    let done = 0, worked = 0;
    for (let w = 0; w < 2; w++) {
      for (let d = 0; d < 7; d++) {
        const target = d < days ? h : 0;
        let left = target;
        const before = s.founder.hoursUsed;
        while (left > 1e-9) { const c = Math.min(3, left); spendHours(s, c, 'Build'); left -= c; done += c; }
        worked += s.founder.hoursUsed - before;
        advance(s, 1, []);
      }
    }
    return { eff: done / Math.max(1, worked), energy: s.founder.energy, debt: s.founder.sleepDebt, mistakes: (s.mistakes ?? []).filter((m) => m.functionId === 'founder_time').length };
  };
  const stellar = run(8.5, 6), average = run(10.5, 6), mediocre = run(11, 7);
  assert.equal(stellar.eff, 1);
  assert.ok(average.eff <= stellar.eff && mediocre.eff < average.eff - 0.08, JSON.stringify({ stellar, average, mediocre }));
  assert.ok(stellar.energy > average.energy && average.energy > mediocre.energy + 10, JSON.stringify({ stellar, average, mediocre }));
  assert.ok(mediocre.debt > 10 && stellar.debt === 0 && mediocre.mistakes >= 2 && stellar.mistakes === 0);
  assert.ok(weekWorked(mk()) === 0);
});
