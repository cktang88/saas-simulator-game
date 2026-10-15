// Free mistakes now cost something traceable: missed filings, missed 83(b), unvetted hires, premature price-test
// winners, failed interview recruiting and unconfirmed-interview no-shows. Short targeted tests, a few seeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket, mainPlan } from '../public/core/market.js';
import { complianceDay } from '../public/apps/money/compliance.js';
import { ensureLegal, signFounderDocs, legalDay } from '../public/apps/legal/sim.js';
import { ensurePeople, hireFromCandidate } from '../public/apps/people/sim.js';
import { exitPostMortem } from '../public/apps/people/provenance.js';
import * as PS from '../public/apps/channels/pricing-sim.js';
import { pricingSlice } from '../public/apps/channels/pricing-model.js';
import research, { bookReal, confirmInterview } from '../public/apps/research.js';
import { researchSlice } from '../public/apps/product/store.js';
import { mistakesSummary } from '../public/core/operator.js';

const fresh = (seed = 7) => {
  const s = newState({ companyName: 'Test Co', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', description: 'seed', category: 'owner_contribution' });
  return s;
};
const byId = (s, id) => (s.mistakes ?? []).filter((m) => m.id === id);

test('money: a missed Form 1120 deadline is logged once with catch-up hours', () => {
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp'; s.company.incorporatedDay = 1;
  s.apps.legal = { paidFilings: {} };
  for (let d = 0; d < 520; d++) { s.day++; complianceDay(s); }
  const m = byId(s, 'missed_1120');
  assert.ok(m.length >= 1 && m[0].cost.hours >= 8 && m[0].functionId === 'bookkeeping_close_tax');
  assert.equal(new Set(m.map((x) => x.detail)).size, m.length, 'one entry per missed filing (dedupe key)');
});

test('legal: vesting tax from a missed 83(b) is logged in dollars with the vesting date', () => {
  const s = fresh();
  s.company.incorporated = true; s.company.entity = 'ccorp';
  const fs = signFounderDocs(s, { authorized: 10_000_000, issued: 8_000_000 });
  s.apps.people = { ...(s.apps.people ?? {}), equity: { valuation: { fmv: 0.5, validUntil: 9999 } } };
  for (let d = 0; d < 460; d++) { s.day++; legalDay(s); }
  assert.ok(fs.missed);
  const m = byId(s, 'miss_83b');
  assert.ok(m.length >= 1 && m[0].cost.usd > 0 && m[0].functionId === 'legal_hygiene' && /Vesting /.test(m[0].detail));
});

test('people: an unvetted hire is logged once at hire, and the mis-hire post-mortem names the skipped steps', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const c = { id: 'cand1', name: 'Sam Lee', role: 'support', engagement: 'employee', region: 'us', traits: { skill: 0 }, channel: 'direct', jobId: null, assessments: {}, offer: { salary: 60000, startDay: 20, hoursPerWeek: 40, equityPct: 0, sentDay: 1 } };
  const m = hireFromCandidate(s, p, c);
  assert.equal(byId(s, 'hire_unvetted').length, 1);
  assert.ok(m.provenance.skipped.some((x) => /no work sample/.test(x)));
  m.status = 'gone'; m.endDay = m.startDay + 100; m.fraud = 'stand_in';
  const pm = exitPostMortem(s, m, { reason: 'let go' });
  assert.ok(pm.misHire && /no work sample/.test(pm.text));
  assert.ok(byId(s, 'hire_unvetted').length === 1 && (mistakesSummary(s).hours ?? 0) >= 36);
});

test('pricing: adopting an A/B winner before the planned sample is logged', () => {
  const s = fresh(111);
  pricingSlice(s);
  const t = PS.startAbTest(s, { variantMult: 1.5 });
  for (let i = 0; i < 40; i++) { const c = createCustomer(s, { name: `T${i}`, email: `t${i}@x.com`, source: 'direct' }); subscribe(s, c.id, mainPlan(s), { trial: true, source: 'direct' }); }
  PS.pricingDay(s);
  advance(s, 10, []);
  PS.stopAbTest(s, t.id, { adopt: true });
  const m = byId(s, 'ab_premature_winner');
  assert.equal(m.length, 1);
  assert.equal(m[0].functionId, 'pricing_packaging');
  assert.equal(mainPlan(s).price, t.variantPrice, 'the new price is live; the market applies its true effect');
});

test('research: recruiting rolls a response by channel; cold fails far more often than warm', () => {
  const rate = (channel) => {
    let ok = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = fresh(seed);
      s.founder.network = { friends: 2000, linkedin: 5000 };
      const iv = bookReal(s, { name: 'Ann Lee', channel });
      if (iv.status === 'scheduled') ok++;
      else assert.equal(iv.status, 'no-reply');
    }
    return ok / 60;
  };
  const warm = rate('warm'), cold = rate('cold');
  assert.ok(warm > 0.3 && cold < 0.25 && warm > cold * 2, `warm ${warm} cold ${cold}`);
});

test('research: an unconfirmed interview that flakes logs a mistake; a confirmed one flakes less', () => {
  const run = (confirm) => {
    let flakes = 0, mistakes = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const s = fresh(seed);
      s.founder.network = { friends: 2000, linkedin: 5000 };
      let iv = bookReal(s, { name: 'Ann Lee', channel: 'warm' });
      for (let i = 0; i < 20 && iv.status !== 'scheduled'; i++) iv = bookReal(s, { name: 'Ann Lee', channel: 'warm' });
      if (iv.status !== 'scheduled') continue;
      s.day = iv.day - 1;
      if (confirm) confirmInterview(s, iv.id);
      s.day = iv.day;
      research.onDay(s);
      if (researchSlice(s).interviews.find((x) => x.id === iv.id).status === 'no-show') flakes++;
      mistakes += byId(s, 'interview_no_confirm').length;
    }
    return { flakes, mistakes };
  };
  const a = run(false), b = run(true);
  assert.ok(a.flakes > 0 && a.mistakes === a.flakes, JSON.stringify(a));
  assert.ok(b.flakes < a.flakes && b.mistakes === 0, JSON.stringify([a, b]));
});
