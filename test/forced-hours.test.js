// Forced work (incidents, upkeep, compliance chores, investor and co-founder obligations, mistake rework) is charged
// in full past the weekly plan, on today's hours and in the time log, up to the physical weekly ceiling. A founder
// whose week is already full must still pay for it: no mistake is free (CLAUDE.md asymmetry rule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState, forceHours, dayUsed } from '../public/core/state.js';
import { OVERWORK, weekWorked } from '../public/core/overwork.js';
import { logMistake } from '../public/core/operator.js';
import { registerChange } from '../public/core/pivots.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { productSlice } from '../public/apps/product/store.js';
import { chooseHost, hostingSlice, hostingDay } from '../public/apps/product/hosting.js';
import { chooseObs, obsDay } from '../public/apps/product/observability.js';
import { chargeHours as peopleOpsHours } from '../public/apps/people/ops-state.js';

const fullWeek = (seed = 4) => {
  const s = newState({ companyName: 'F', model: 'smb', path: 'indie', founderName: 'P', seed });
  s.founder.hoursUsed = s.founder.hoursPerWeek; // the plan is used up
  return s;
};
const snap = (s) => ({ used: s.founder.hoursUsed, day: dayUsed(s), log: (s.founder.timeLog ?? []).length });
function assertCharged(s, before, min, what) {
  assert.ok(s.founder.hoursUsed - before.used >= min - 1e-9, `${what}: week hours +${s.founder.hoursUsed - before.used}`);
  assert.ok(dayUsed(s) - before.day >= min - 1e-9, `${what}: today's hours +${dayUsed(s) - before.day}`);
  assert.ok(s.founder.timeLog.length > before.log, `${what}: time log entry`);
}

test('forceHours charges in full past the plan, on today and in the time log, up to the weekly ceiling', () => {
  const s = fullWeek();
  const b = snap(s);
  assert.equal(forceHours(s, 3, 'Incident: key rotation', { functionId: 'infra_ops' }), 3);
  assertCharged(s, b, 3, 'core helper');
  assert.deepEqual(s.founder.timeLog.at(-1), { day: s.day, hours: 3, label: 'Incident: key rotation', forced: true, functionId: 'infra_ops' });
  // Only the physical ceiling stops it, and then it charges what is left (never throws).
  s.founder.hoursUsed = OVERWORK.weekMax - 1;
  assert.equal(forceHours(s, 5, 'More fire-fighting'), 1);
  assert.equal(forceHours(s, 2, 'Even more'), 0);
  assert.ok(weekWorked(s) <= OVERWORK.weekMax + 1e-9);
});

test('a charged mistake costs hours on today even when the week is full', () => {
  const s = fullWeek();
  const b = snap(s);
  logMistake(s, { functionId: 'support', id: 'case_reopened', label: 'Reopened case', cost: { hours: 1.5 }, charge: true });
  assertCharged(s, b, 1.5, 'logMistake');
  assert.match(s.founder.timeLog.at(-1).label, /^Fixing: /);
});

test('a pivot costs its rework hours on a full week', () => {
  const s = fullWeek();
  const prev = { oneLiner: 'a', icp: 'x', model: 'smb', pricing: 'flat', channel: 'seo' };
  const b = snap(s);
  const e = registerChange(s, prev, { ...prev, pricing: 'usage' }, { type: 'pricing' });
  assert.ok(e && e.hours > 0);
  assertCharged(s, b, e.hours, 'pivot');
});

test('hosting and observability upkeep still cost hours on a full week (no free ops debt)', () => {
  const s = fullWeek();
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'P', category: 'owner_contribution' });
  chooseHost(s, 'aws'); chooseObs(s, 'sentry');
  s.founder.hoursUsed = s.founder.hoursPerWeek;
  s.day = 7;
  const b = snap(s);
  hostingDay(s);
  assertCharged(s, b, 0.5, 'hosting ops');
  assert.equal(hostingSlice(productSlice(s)).opsDebt, 0, 'paid in overtime, so no debt');
  const b2 = snap(s);
  obsDay(s);
  assertCharged(s, b2, 0.25, 'observability upkeep');
});

test('people-ops chores (payroll runs, EOR errors) are charged past the plan', () => {
  const s = fullWeek();
  const b = snap(s);
  assert.equal(peopleOpsHours(s, 2, 'Payroll run'), 2);
  assertCharged(s, b, 2, 'people ops');
});

// Helpers that are private to their module: they must route through core forceHours (no capped or ledger-less bumps).
test('forced-work helpers route through core forceHours', () => {
  const files = ['apps/support/flows.js', 'apps/insights/stack.js', 'apps/legal/compliance.js', 'apps/fundraising/sim.js',
    'apps/cofounder/sim.js', 'apps/product/hosting.js', 'apps/product/observability.js', 'core/network.js', 'core/pivots.js',
    'core/operator.js', 'apps/money/backoffice.js', 'apps/consumer/clipping.js', 'apps/services.js', 'apps/channels/sim.js',
    'apps/people/ops-state.js'];
  for (const f of files) {
    const src = readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
    assert.match(src, /forceHours/, `${f} uses forceHours`);
    assert.doesNotMatch(src, /hoursUsed\s*(\+=|=\s*\(?\s*[\w.]*hoursUsed)/, `${f} bumps hoursUsed directly`);
  }
});
