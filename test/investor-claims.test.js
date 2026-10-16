// Investors-people LLM cluster fixes (docs/review/llm-e2e/investors-people.md): inflated traction is recorded
// per investor and verified later (fundraising/claims.js), investor personas weigh deals by type and stage, candidates know market pay and stage risk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as llm from '../public/core/llm.js';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { claimGaps } from '../public/apps/fundraising/claims.js';
import { openLies } from '../public/core/integrity.js';
import { personaSystem, weightsLine, fromArchetype, archetypeById, archetypesReady } from '../public/apps/fundraising/investors.js';
import { ensureFr, beginOutreach } from '../public/apps/fundraising/sim.js';
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

test('claimGaps (deck panel advisory) flags traction above the real metrics, not goals, past jobs or honest rounding', () => {
  const m = { mrr: 13500, customers: 9 };
  assert.equal(claimGaps('We are at $95K MRR with 64 enterprise customers', m).length, 2);
  assert.equal(claimGaps('MRR $40,000 (+45% MoM) · 30 customers', m).filter((x) => /MRR|customers/.test(x)).length, 2);
  assert.deepEqual(claimGaps('$13.5K MRR, 9 paying customers, MRR $14K', m), []);
  assert.deepEqual(claimGaps('Raising $3M to reach $1.2M ARR in 18 months', m), []);
  assert.deepEqual(claimGaps('At my previous company I grew ARR to $5M with 300 customers', m), []);
});

test('outreach: an inflated email is judged as written (no instant cap) and its claims are recorded for that investor', async () => {
  await archetypesReady;
  const s = co();
  ensureFr(s).raise = { id: 'r', stage: 'seed', instrument: 'priced', target: 3e6, status: 'active' };
  const inv = { id: 'i1', name: 'Jonas', firm: 'Kestrel Capital', status: 'researching', log: [], ...fromArchetype(archetypeById('seed_fund')) };
  ensureFr(s).investors.push(inv);
  const ctx = { state: s, llm };
  const body = (n, mrr) => `ClauseGuard collects SOC 2 evidence for fintech security teams: ${n} paying customers, $${mrr} MRR. I ran SOC 2 at Stripe Capital. Raising a $3M seed closing in December; open to a 20-minute call next week?`;
  const honest = await judgeOutreach(ctx, inv, body(9, '13.5K'), false);
  const liar = await judgeOutreach(ctx, inv, body(64, '95K'), false);
  assert.ok(liar.quality >= honest.quality - 0.5, `no cap: ${honest.quality} vs ${liar.quality}`);
  assert.ok(!(s.mistakes ?? []).some((x) => /inflated_outreach/.test(x.id)), 'nothing is punished at send time');
  beginOutreach(s, inv, { warm: false, text: body(64, '95K'), judge: liar });
  const lies = openLies(s, { audience: 'investor', recipientId: 'i1' });
  assert.deepEqual(lies.map((c) => c.metric).sort(), ['customers', 'mrr']);
  assert.ok(lies.every((c) => c.gap > 0.5));
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
