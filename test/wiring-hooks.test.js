import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { scheduleEvent, writingHours, DEEP_WORK } from '../public/core/calendar.js';
import { ensureAssistant } from '../public/apps/assistant/engine.js';
import { weeklyReviewHours } from '../public/apps/analytics.js';
import { meetingPrepHours } from '../public/apps/calls.js';
import { raiseProductIncident } from '../public/apps/insights/raise.js';
import { recoveryStats } from '../public/apps/money/metrics.js';
import { statusUpdateQuality } from '../public/apps/support/agent.js';
import { supportAiErrorRate, supportWeek } from '../public/apps/people/support.js';
import { builderLeak } from '../public/apps/product/engine.js';
import { productSlice } from '../public/apps/product/store.js';
import { builderSlice } from '../public/apps/product/builder.js';

const world = () => { const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed: 5 }); ensureStripe(s); ensureMarket(s); seedDefaultStack(s); return s; };
const approvedRun = (s, templateId) => { const A = ensureAssistant(s); A.runs.unshift({ id: `r_${templateId}`, templateId, used: true, status: 'ok', day: s.day, facts: [] }); };

test('writing inside a long focus block costs fewer hours than a bare day', () => {
  const s = world(); s.day = 1;
  const bare = writingHours(s, 1, { commit: false });
  scheduleEvent(s, { title: 'Focus', kind: 'focus', day: 1, start: 540, duration: 180 });
  const focused = writingHours(s, 1, { commit: false });
  assert.ok(focused < bare, `${focused} < ${bare}`);
  assert.ok(Math.abs(focused - 1 / DEEP_WORK.longMult) < 0.02);
});

test('approved assistant outputs cut weekly review and meeting prep hours, once per output', () => {
  const s = world();
  assert.equal(weeklyReviewHours(s), 0.5);
  approvedRun(s, 'weekly_metrics');
  assert.ok(weeklyReviewHours(s) < 0.5);
  assert.equal(weeklyReviewHours(s), 0.5, 'claimed once');
  const m = { id: 'm1' };
  approvedRun(s, 'meeting_prep');
  assert.ok(meetingPrepHours(s, m) < 0.25);
  assert.equal(meetingPrepHours(s, m), 0, 'prep charged once per meeting');
});

test('a data leak opens an Insights incident that the status page duty and Helpdesk follow', () => {
  const s = world(); s.day = 40;
  const slice = productSlice(s);
  const b = builderSlice(slice);
  b.tables = [{ name: 'users', rls: 'off' }];
  builderLeak(s, slice, b, 20);
  const ins = s.apps.insights;
  assert.equal(ins.incidents[0].source, 'data_leak');
  assert.equal(ins.today.day, 40);
  assert.equal(ins.today.statusPosted, false);
  assert.ok(statusUpdateQuality('We are investigating the data exposure, rolled back access; next update in 30 minutes.', ins.today.cause) > 0.5);
  const inc = raiseProductIncident(s, { cause: 'bad release', severity: 0.25 });
  assert.equal(s.apps.insights.incidents[0].id, inc.id);
});

test('recoveryStats reads the dunning model', () => {
  const s = world();
  assert.equal(recoveryStats(s).rate, null);
  ensureStripe(s).dunningStats = { failed: 10, recovered: 6, lost: 2, byCode: {} };
  const r = recoveryStats(s);
  assert.equal(r.rate, 0.75);
  assert.equal(r.open, 2);
});

test('hired support AI on an untested default setup answers worse and logs ai_live_untested', () => {
  const s = world(); s.apps.people = { members: [] };
  const rate = supportAiErrorRate(s);
  assert.ok(rate > 0.08);
  assert.ok(s.mistakes.some((m) => m.id === 'ai_live_untested'));
  const base = supportWeek({ model: 'smb', newTickets: 100, ai: { active: true, docsQuality: 0.5, monthsLive: 3 } });
  const worse = supportWeek({ model: 'smb', newTickets: 100, ai: { active: true, docsQuality: 0.5, monthsLive: 3, errorRate: rate } });
  assert.ok(worse.aiErrors > base.aiErrors);
});
