import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack } from '../public/core/bank.js';
import { scheduleEvent, moveEvent, findSlots } from '../public/core/calendar.js';
import { deadlines } from '../public/apps/calendar/deadlines.js';
import { addTask } from '../public/apps/sales/model.js';

function fresh() {
  const s = newState({ companyName: 'Cal Co', model: 'smb', path: 'vc', founderName: 'Pat', seed: 7 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  return s;
}

test('a meeting booked or moved onto today is charged right away, not free', () => {
  const s = fresh();
  const used = s.founder.hoursUsed;
  scheduleEvent(s, { title: 'Call', kind: 'call', day: s.day, start: 15 * 60, duration: 60 });
  assert.equal(s.founder.hoursUsed, used + 1);
  const slot = findSlots(s, { duration: 30, count: 1 })[0];
  const later = scheduleEvent(s, { title: 'Later', kind: 'meeting', day: slot.day, start: slot.start, duration: 30 });
  assert.equal(s.founder.hoursUsed, used + 1, 'future meetings are charged on their day');
  moveEvent(s, later.id, s.day, 17 * 60);
  assert.equal(s.founder.hoursUsed, used + 1.5);
  scheduleEvent(s, { title: 'Gym', kind: 'personal', day: s.day, start: 7 * 60, duration: 60 });
  assert.equal(s.founder.hoursUsed, used + 1.5, 'personal blocks cost no work hours');
  s.founder.hoursUsed = s.founder.hoursPerWeek + 8;
  assert.throws(() => scheduleEvent(s, { title: 'Overbooked', kind: 'call', day: s.day, start: 19 * 60, duration: 60 }), /far over/);
});

test('deadlines from other apps show on the calendar, deduplicated, with links to the owning app', () => {
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp';
  const t = addTask(s, { title: 'Send proposal to Acme', dueDay: s.day + 3 });
  ensureStripe(s).disputes.push({ id: 'dp_1', amount: 49, status: 'needs_response', dueDay: s.day + 5 });
  const list = deadlines(s, { toDay: s.day + 400 });
  const task = list.find((d) => d.key === `task-${t.id}`);
  assert.ok(task && task.app === 'crm' && task.href === '#/crm');
  assert.ok(list.some((d) => d.app === 'stripe' && d.href === '#/stripe/disputes/dp_1'));
  assert.equal(new Set(list.map((d) => d.key)).size, list.length, 'no duplicate deadlines');
  // A one-week window only shows that week's items; done tasks drop off.
  assert.ok(deadlines(s, { fromDay: s.day + 4, toDay: s.day + 11 }).every((d) => d.day >= s.day + 4 && d.day < s.day + 11));
  t.done = true;
  assert.ok(!deadlines(s).some((d) => d.key === `task-${t.id}`));
});
