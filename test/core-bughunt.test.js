import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { scheduleEvent, moveEvent, findSlots, calendarDay } from '../public/core/calendar.js';
import { registerChange, snapshotOf, pivotChurnMult } from '../public/core/pivots.js';

function fresh() {
  const s = newState({ companyName: 'Bug Co', model: 'smb', path: 'indie', founderName: 'Pat', seed: 11 });
  ensureStripe(s); ensureMarket(s);
  return s;
}

test('a meeting charged today and moved to another day is charged on its new day, not free', () => {
  const s = fresh();
  const used = s.founder.hoursUsed;
  const ev = scheduleEvent(s, { title: 'Call', kind: 'call', day: s.day, start: 15 * 60, duration: 60 });
  assert.equal(s.founder.hoursUsed, used + 1);
  const slot = findSlots(s, { duration: 60, count: 1 })[0];
  moveEvent(s, ev.id, slot.day, slot.start);
  assert.equal(s.founder.hoursUsed, used, "today's charge is given back when the meeting leaves today");
  assert.ok(!s.founder.timeLog.some((x) => x.day === s.day && x.label === 'Meetings (call)'));
  s.day = slot.day;
  const before = s.founder.hoursUsed;
  calendarDay(s);
  assert.equal(s.founder.hoursUsed, before + 1, 'charged on the day it actually happens');
});

test('a pricing tweak between pivots neither resets the evidence count nor counts as a pivot "again"', () => {
  const s = fresh();
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = 'Invoice reminders for plumbers and HVAC contractors';
  s.company.icp = 'plumbers';
  s.apps.research = { interviews: Array.from({ length: 20 }, (_, i) => ({ real: true, status: 'done', day: 1 + i })) };
  s.day = 100;
  const p0 = snapshotOf(s.company);
  s.company.icp = 'dental practice managers';
  registerChange(s, p0, snapshotOf(s.company), { type: 'segment' });
  // 20 more conversations, then a pricing tweak, then a second pivot 120 days after the first.
  for (let i = 0; i < 20; i++) s.apps.research.interviews.push({ real: true, status: 'done', day: 110 + i });
  s.day = 200;
  registerChange(s, { ...snapshotOf(s.company), pricing: 'flat' }, { ...snapshotOf(s.company), pricing: 'seat' }, { type: 'pricing' });
  s.day = 220;
  const p1 = snapshotOf(s.company);
  s.company.icp = 'property managers';
  const e = registerChange(s, p1, snapshotOf(s.company), { type: 'segment' });
  assert.equal(e.evidence, 20, 'evidence counts from the last real pivot, not the pricing tweak');
  assert.ok(!s.mistakes?.some((m) => m.id === 'pivot_every_90'));
  assert.ok(!s.mistakes?.some((m) => m.id === 'pivot_without_evidence'));
});

test('a channel pivot right after a full restart does not wipe the restart\'s extra churn', () => {
  const s = fresh();
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = 'Invoice reminders for plumbers'; s.company.icp = 'plumbers';
  s.day = 50;
  const p0 = snapshotOf(s.company);
  s.company.oneLiner = 'Clinic intake forms for dentists'; s.company.icp = 'dental practice managers';
  registerChange(s, p0, snapshotOf(s.company), { type: 'full_restart' });
  const after = pivotChurnMult(s);
  assert.ok(after > 1.2);
  s.day = 51;
  registerChange(s, { ...snapshotOf(s.company), channel: 'ads' }, { ...snapshotOf(s.company), channel: 'seo' }, { type: 'channel' });
  assert.ok(pivotChurnMult(s) > 1.2, 'the fading churn of the restart is still there');
});

test('a focus block broken by a forced meeting does not shield a fragmented day from the context-switch hour', () => {
  const s = fresh();
  const slot = findSlots(s, { duration: 30, count: 1 })[0];
  const d = slot.day;
  scheduleEvent(s, { title: 'Deep work', kind: 'focus', day: d, start: 9 * 60, duration: 120 });
  scheduleEvent(s, { title: 'A', kind: 'call', day: d, start: 9 * 60, duration: 30, allowConflict: true });
  scheduleEvent(s, { title: 'B', kind: 'call', day: d, start: 13 * 60, duration: 30 });
  scheduleEvent(s, { title: 'C', kind: 'call', day: d, start: 15 * 60, duration: 30 });
  s.day = d;
  const before = s.founder.hoursUsed;
  calendarDay(s);
  assert.equal(s.founder.hoursUsed, before + 1.5 + 1, '3 x 30 min calls + 1h context switching');
});
