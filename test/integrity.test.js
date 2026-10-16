import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { extractClaims, claimGap, detectP, recordClaims, verify, penalize, openLies, reputationMult, ensureIntegrity } from '../public/core/integrity.js';

test('claim extraction covers ARR, monthly revenue, bare k, customer synonyms, KPIs; skips goals and past jobs', () => {
  const v = (t) => extractClaims(t).map((c) => [c.metric, Math.round(c.value * 1000) / 1000]);
  for (const t of ['ARR: $600K', 'annual run rate of $600K', 'we make $50k a month', '50k MRR', '$50K/mo recurring']) assert.deepEqual(v(t), [['mrr', 50000]], t);
  for (const t of ['40+ customers', '40 paying accounts', '40 teams pay us', 'a customer base of 40']) assert.deepEqual(v(t), [['customers', 40]], t);
  for (const t of ['$50K MRR (goal)', 'our MRR will hit $50K', 'we hope to reach $1.2M ARR in 18 months', 'At my previous company we hit $5M ARR']) assert.deepEqual(v(t), [], t);
  assert.deepEqual(v('We grow 15% MoM with 120% NRR and 2% churn, 18 months of runway'), [['growth', 0.15], ['nrr', 1.2], ['churn', 0.02], ['runway', 18]]);
});

test('gaps are in the flattering direction, rounding is not lying, and detection rises with gap and check strength', () => {
  assert.equal(claimGap('mrr', 2050, 2000), 0);
  assert.ok(claimGap('mrr', 3000, 2000) > 0.4);
  assert.equal(claimGap('mrr', 1500, 2000), 0, 'understating revenue is not the lie investors care about');
  assert.ok(claimGap('churn', 0.02, 0.06) > 0.5, 'understating churn is');
  assert.ok(detectP(0.075, 'confirmatory') > 0.25 && detectP(0.075, 'confirmatory') < 0.35);
  assert.ok(detectP(0.375, 'confirmatory') > 0.75 && detectP(1, 'confirmatory') > 0.95);
  assert.ok(detectP(0.375, 'pitch') < 0.25 && detectP(0.375, 'angel') < detectP(0.375, 'pitch'));
  assert.ok(detectP(0.1, 'audit') > detectP(0.1, 'confirmatory'));
});

test('a lie is recorded when told, can pass a weak check, is caught by a strong one, and stains the network', () => {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed: 9 });
  const truth = { mrr: 2000, customers: 20 };
  const lies = recordClaims(s, { audience: 'investor', recipientId: 'inv1', channel: 'email', text: 'We are at $8K MRR with 20 customers.', truth });
  assert.equal(lies.length, 1, 'only the MRR claim is a lie; 20 customers is true');
  assert.equal(openLies(s, { recipientId: 'inv1' }).length, 1);
  const weak = verify(s, { recipientId: 'inv1', check: 'pitch', roll: () => 0.9 });
  assert.equal(weak.caught.length, 0, 'a 4x lie usually survives a pitch smell test (p≈0.4)');
  const strong = verify(s, { recipientId: 'inv1', check: 'confirmatory', roll: () => 0.9 });
  assert.equal(strong.caught.length, 1, 'confirmatory diligence catches it (p≈0.97)');
  const before = reputationMult(s, 'investor');
  penalize(s, strong.caught, { audience: 'investor', functionId: 'fundraising', id: 'inflated_traction_caught', label: 'Diligence found inflated MRR' });
  assert.ok(reputationMult(s, 'investor') < before && ensureIntegrity(s).score < 1);
  assert.ok(s.mistakes.some((m) => m.id === 'inflated_traction_caught' && m.delayed));
});
