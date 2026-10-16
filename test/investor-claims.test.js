// Investors-people LLM cluster fixes (docs/review/llm-e2e/investors-people.md): inflated traction is caught
// game-side, investor personas weigh deals by type and stage, candidates know market pay and stage risk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as llm from '../public/core/llm.js';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { inflatedClaims } from '../public/apps/fundraising/judge-fallbacks.js';
import { personaSystem, weightsLine, fromArchetype, archetypeById, archetypesReady } from '../public/apps/fundraising/investors.js';
import { ensureFr } from '../public/apps/fundraising/sim.js';
import { judgeOutreach } from '../public/apps/fundraising/view-crm.js';
import { candidateMarketBlock } from '../public/apps/people/hiring.js';
import { REALISM } from '../public/core/llm.js';

function co() {
  const s = newState({ companyName: 'ClauseGuard', model: 'ent', path: 'vc', founderName: 'Priya', seed: 3 });
  ensureStripe(s); ensureMarket(s);
  s.company.oneLiner = 'SOC 2 evidence agent for mid-market fintech';
  const plan = { id: 'p', price: 1500, interval: 'month', trialDays: 0 };
  for (let i = 0; i < 9; i++) { const c = createCustomer(s, { name: `c${i}`, email: `c${i}@x.com`, country: 'US' }); subscribe(s, c.id, plan, { trial: false }); }
  return s;
}

test('inflatedClaims flags traction above the real metrics, not goals, past jobs or honest rounding', () => {
  const m = { mrr: 13500, customers: 9 };
  assert.equal(inflatedClaims('We are at $95K MRR with 64 enterprise customers', m).length, 2);
  assert.equal(inflatedClaims('MRR $40,000 (+45% MoM) · 30 customers', m).length, 2);
  assert.deepEqual(inflatedClaims('$13.5K MRR, 9 paying fintechs, MRR $14K', m), []);
  assert.deepEqual(inflatedClaims('Raising $3M to reach $1.2M ARR in 18 months', m), []);
  assert.deepEqual(inflatedClaims('At my previous company I grew ARR to $5M with 300 customers', m), []);
});

test('outreach: an email inflating traction is capped and logged even when it is well written (offline judge)', async () => {
  await archetypesReady;
  const s = co();
  ensureFr(s).raise = { id: 'r', stage: 'seed', instrument: 'priced', target: 3e6, status: 'active' };
  const inv = { id: 'i1', name: 'Jonas', firm: 'Kestrel Capital', status: 'researching', log: [], ...fromArchetype(archetypeById('seed_fund')) };
  ensureFr(s).investors.push(inv);
  const ctx = { state: s, llm };
  const honest = await judgeOutreach(ctx, inv, 'ClauseGuard collects SOC 2 evidence for fintech security teams: 9 paying fintechs, $13.5K MRR, 12% MoM. I ran SOC 2 at Stripe Capital. Raising a $3M seed closing in December; open to a 20-minute call next week?', false);
  const liar = await judgeOutreach(ctx, inv, 'ClauseGuard collects SOC 2 evidence for fintech security teams: 64 paying fintechs, $95K MRR, 12% MoM. I ran SOC 2 at Stripe Capital. Raising a $3M seed closing in December; open to a 20-minute call next week?', false);
  assert.ok(liar.quality <= 1.5 && honest.quality > liar.quality + 1, `${honest.quality} vs ${liar.quality}`);
  assert.match(liar.issues[0], /contradicts your real numbers/);
  assert.ok(s.mistakes.some((x) => x.id === 'inflated_outreach'));
});

test('investor personas weigh deals by type and hold a stage bar', () => {
  const angel = fromArchetype(archetypeById('operator_angel'));
  const seed = fromArchetype(archetypeById('seed_fund'));
  assert.match(weightsLine(angel), /founder/);
  assert.match(weightsLine(seed), /\$10K-\$50K\+ MRR/);
  assert.notEqual(weightsLine(angel), weightsLine(seed));
  assert.match(personaSystem({ ...seed, name: 'J', firm: 'K', source: 'generated' }, { company: 'X', stage: 'seed', REALISM }), /How you weigh a deal/);
});

test('job candidates know market pay, the posted range, stage risk and the written offer, not internal metrics', () => {
  const s = co();
  const cand = { role: 'engineer', region: 'us', engagement: 'employee', expectation: 185000, stage: 'offer', offer: { salary: 120000, equityPct: 0.5 } };
  const b = candidateMarketBlock(s, cand, { payLo: 165000, payHi: 195000, region: 'us' });
  assert.match(b, /Market rate/);
  assert.match(b, /\$165K-\$195K/);
  assert.match(b, /\$120,000 base/);
  assert.match(b, /do not know its revenue or runway/);
  assert.doesNotMatch(b, /MRR/);
});
