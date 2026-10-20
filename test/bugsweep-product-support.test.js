// Bug sweep (product, support, success, AI costs): regression tests for mistakes that were accidentally free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { releasesSlice, deploy, releasesDay, ignoreError, resolveWithFix } from '../public/apps/product/releases.js';
import { askForReviews, ensureSupport } from '../public/apps/helpdesk.js';
import { triageDecline } from '../public/apps/product/tracker.js';
import { aiSlice } from '../public/apps/aicost/model.js';
import { codingMonthEnd, setCodingPolicy } from '../public/apps/aicost/coding.js';
import { inferenceMonthEnd } from '../public/apps/aicost/inference.js';
import { CODING } from '../public/data/ai-costs.js';
import { chargeFounder } from '../public/apps/insights.js';
import { monthKey } from '../public/core/util.js';

function world(model = 'smb', n = 20, seed = 5) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  for (let i = 0; i < n; i++) { const c = createCustomer(s, { name: `C ${i}`, email: `c${i}@x.com` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 }); }
  return s;
}

test('an ignored release error keeps hurting (churn and incident minutes) and can still be fixed later', () => {
  const rel = releasesSlice({});
  rel.flags.monitoring = true;
  const { error } = deploy(rel, { id: 'f1', title: 'Export' }, { day: 0, cfr: 1, rand: () => 0.1, accounts: 50 });
  assert.equal(error.status, 'unresolved');
  ignoreError(rel, error.id);
  assert.equal(error.status, 'ignored');
  const before = rel.incidentMinutes;
  const r = releasesDay(rel, { day: 1, accounts: 50 });
  assert.ok(r.churnMult > 1, `ignoring a live crash must not be free (churn ×${r.churnMult})`);
  assert.ok(rel.incidentMinutes > before);
  // A fixed error stops hurting.
  assert.ok(resolveWithFix(rel, error.id).ok);
  assert.equal(releasesDay(rel, { day: 2, accounts: 50 }).churnMult, 1);
});

test('review asks skip customers asked recently or who already reviewed: re-asking is not more reviews', () => {
  const s = world('smb', 30);
  const sup = ensureSupport(s);
  const first = askForReviews(s, { channel: 'email', who: 'all' });
  assert.equal(first.asked, 30);
  assert.throws(() => askForReviews(s, { channel: 'email', who: 'all' }), /asked recently/);
  // After the cooldown, people who already posted a review this year are still skipped.
  s.day += 61;
  sup.reviews.push({ id: 'r1', customerId: ensureStripe(s).customers[0].id, rating: 5, day: s.day - 5, removed: false });
  const again = askForReviews(s, { channel: 'email', who: 'all' });
  assert.equal(again.asked, 29);
  assert.equal(again.skipped, 1);
});

test('a runaway coding loop cannot push an engineer past the per-seat overage cap', () => {
  const s = world('smb', 0);
  s.apps.people = { members: [{ id: 'e1', name: 'Eng', role: 'engineer', status: 'active', kind: 'human', hoursPerWeek: 40 }] };
  const c = aiSlice(s).coding;
  setCodingPolicy(s, { policy: 'individual', overage: 'api', capUsd: 50, keyMode: 'scoped' });
  const saved = { run: CODING.runawayMonthly, leak: CODING.leakMonthlyScoped };
  CODING.runawayMonthly = 1; CODING.leakMonthlyScoped = 0; // every month loops; no key leaks
  let worst = 0;
  try {
    for (let m = 0; m < 12; m++) {
      s.day = m * 30 + 29;
      const out = codingMonthEnd(s);
      worst = Math.max(worst, out.api);
    }
  } finally { CODING.runawayMonthly = saved.run; CODING.leakMonthlyScoped = saved.leak; }
  assert.ok(worst <= 50 + 1e-6, `API overage ${worst} exceeded the $50 per-seat cap`);
  assert.ok(c.incidents.length >= 12);
});

test('killing the last AI feature mid-month still bills the tokens it used', () => {
  const s = world('smb', 10);
  const inf = aiSlice(s).inf;
  inf.mtd = { month: monthKey(s), usd: 42.5, byFeature: {}, byModel: {}, extra: 0, free: 0, bots: 0, spikes: 0 };
  s.apps.product = { features: [{ id: 'f1', title: 'Summaries', status: 'killed', ai: { enabled: true, level: 'moderate' } }], buildQueue: [], bugs: [] };
  const spent = () => -s.bank.txns.filter((t) => t.category === 'ai_inference').reduce((a, t) => a + t.amount, 0);
  inferenceMonthEnd(s);
  assert.equal(Math.round(spent() * 100) / 100, 42.5);
  inferenceMonthEnd(s); // and only once
  assert.equal(Math.round(spent() * 100) / 100, 42.5);
});

test('forced incident work in an already-full week is still charged (the plan is not a wall)', () => {
  const s = world('smb', 0);
  s.founder.hoursUsed = s.founder.hoursPerWeek + 5; // the week's plan is used up
  const before = s.founder.hoursUsed;
  const h = chargeFounder(s, 3, 'Incident response');
  assert.equal(h, 3);
  assert.equal(s.founder.hoursUsed, before + 3);
  assert.ok((s.founder.dayUsed ?? 0) >= 3, 'counts toward today\'s hours');
});

test('declining a real bug in triage does not make it disappear: it resurfaces; a duplicate or a low bug does not', () => {
  const slice = { bugs: [
    { id: 'b1', title: 'Wrong totals', hours: 4, severity: 'high', triage: true, fixedDay: null },
    { id: 'b2', title: 'Dup', hours: 4, severity: 'high', triage: true, fixedDay: null, dupOf: 'b1' },
    { id: 'b3', title: 'Cosmetic', hours: 1, severity: 'low', triage: true, fixedDay: null },
  ] };
  assert.equal(triageDecline(slice, 'b1', 10).real, true);
  triageDecline(slice, 'b2', 10); triageDecline(slice, 'b3', 10);
  assert.equal(slice.latentBugs.length, 1);
  assert.equal(slice.latentBugs[0].appearDay, 24);
  assert.equal(slice.latentBugs[0].fixedDay, null);
});
