// Bug sweep (consumer apps, market, outcomes and shell apps): one short regression test per fix. Offline, no long sims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/apps/registry.js';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureNetwork } from '../public/core/network.js';
import { chargeFounder } from '../public/apps/assistant/engine.js';
import { payInboundFee, sentDraftConsequences } from '../public/apps/assistant/triage.js';
import { ensureAutomations, automationsDay } from '../public/apps/automations/engine.js';
import { ensureConsumer } from '../public/apps/consumer/state.js';
import * as Store from '../public/apps/consumer/store.js';
import { monetDay } from '../public/apps/consumer/monetize.js';
import { ensureWorld, exitBurstSize } from '../public/apps/marketworld/engine.js';
import { competitorsFor, normalizeDiscovery } from '../public/apps/marketworld/competitors.js';
import { firstUsersSteps } from '../public/apps/home/first-users.js';
import { connectionWarnings } from '../public/apps/settings.js';

function fresh(model = 'smb', seed = 11) {
  const s = newState({ companyName: 'Acme', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Reconciliation for Shopify stores';
  s.company.icp = 'Finance leads at Shopify brands';
  return s;
}
const overPlan = (s) => { s.founder.hoursUsed = s.founder.hoursPerWeek + 5; return s.founder.hoursUsed; };

test('assistant: consequence hours are charged in full even past the weekly plan (no free mistakes)', () => {
  const s = fresh();
  const before = overPlan(s);
  assert.equal(chargeFounder(s, 3, 'Data incident response'), 3);
  assert.equal(s.founder.hoursUsed, before + 3);
});

test('automations: catch-up on call notes the automation lost is charged even when the founder is past the plan', () => {
  const s = fresh();
  const A = ensureAutomations(s);
  A.platform = 'zapier_pro';
  A.claims.push({ id: 'c1', key: 'crm_log_meeting', ref: 'm1', day: s.day - 6, saved: 1, status: 'pending' });
  const before = overPlan(s);
  automationsDay(s);
  assert.equal(A.claims[0].status, 'lost');
  assert.ok(Math.abs(s.founder.hoursUsed - before - 1.05) < 1e-9, `charged ${s.founder.hoursUsed - before}h`);
});

test('triage: paying a pay-to-play fee and sending an AI draft with a false promise cost the logged hours', () => {
  const s = fresh();
  const n = ensureNetwork(s);
  n.inbound.push({ id: 'inb1', category: 'event', outcome: 'waste', status: 'delivered', resolved: true, feeAsk: { amount: 400, what: 'speaker slot' } });
  let h0 = s.founder.hoursUsed;
  payInboundFee(s, 'inb1');
  assert.equal(s.founder.hoursUsed - h0, 4, 'prep for the worthless slot is real time');
  h0 = s.founder.hoursUsed;
  const t = { id: 't1', kind: 'customer', with: { name: 'Sam' } };
  const bad = 'Annual plans are 40% off if you sign this week.';
  sentDraftConsequences(s, t, { text: `Hi. ${bad}`, badClaim: bad }, { body: `Hi. ${bad}` });
  assert.equal(s.founder.hoursUsed - h0, 0.5);
});

test('launch playbook: switching stack after building drops the submission of the thrown-away build', () => {
  const s = fresh('b2c');
  const C = ensureConsumer(s);
  Store.chooseStack(s, 'expo');
  Store.buildApp(s);
  C.app.google.enrolled = true;
  assert.equal(Store.submitForReview(s, 'play').ok, true);
  assert.ok(C.app.pending);
  Store.chooseStack(s, 'native_both');
  assert.equal(C.app.pending, null);
  s.day += 10;
  Store.storeDay(s);
  assert.equal(C.app.live.play, false, 'an old build in review cannot go live after the rebuild');
});

test('launch playbook: the US link-out ruling day is drawn once, not re-derived from the moving stream', () => {
  const s = fresh('b2c');
  const C = ensureConsumer(s);
  C.monet.mode = 'web';
  monetDay(s);
  const day = C.monet.rulingDay;
  assert.ok(day >= 150 && day < 350);
  for (let i = 0; i < 50; i++) { C.rs = (C.rs + 0x6d2b79f5) | 0; monetDay(s); }
  assert.equal(C.monet.rulingDay, day);
  assert.equal(C.monet.ruling, null);
  s.day = day;
  monetDay(s);
  assert.ok(C.monet.ruling, 'fires on the scheduled day');
});

test('market: a real competitor the simulation shut down leaves the landscape, and its exit burst still uses its share', () => {
  const s = fresh();
  const W = ensureWorld(s);
  const n = normalizeDiscovery({ statusQuoShare: 0.3, competitors: [
    { name: 'BigCo', fundingStage: 'public', marketShare: 0.3, awareness: 0.8 },
    { name: 'Small', fundingStage: 'bootstrapped', marketShare: 0.02, awareness: 0.05 },
  ] });
  W.competitors = { offline: false, mock: false, ...n };
  const big = n.list.find((c) => c.name === 'BigCo');
  const rival = { id: 'r1', real: true, realId: big.id, name: 'BigCo', status: 'shut_down', funding: 'public_incumbent', moves: [] };
  W.rivals = [rival];
  assert.deepEqual(competitorsFor(s).map((c) => c.name), ['Small']);
  assert.ok(competitorsFor(s, { includeGone: true }).some((c) => c.name === 'BigCo'));
  const withShare = exitBurstSize(s, rival, 10);
  const generic = exitBurstSize(s, { ...rival, realId: null }, 10);
  assert.ok(withShare > generic, 'a big real rival displaces more customers than the generic fallback');
});

test('first users: a pilot / LOI / pre-order earned in a real interview ticks the commitment step', () => {
  const s = fresh();
  const step = () => firstUsersSteps(s).find((x) => x.id === 'commit');
  assert.equal(step().done, false);
  s.apps.research = { interviews: [{ real: true, status: 'done', grade: { commitments: ['loi'] } }] };
  assert.equal(step().done, true);
});

test('settings: the AI connection form says what it could not keep or use', () => {
  const saved = { decisionModel: 'vendor/jev-x', models: ['vendor/chat-a'] };
  assert.deepEqual(connectionWarnings({ connection: 'proxy', apiKey: '', decisionModel: 'vendor/jev-x', models: 'vendor/chat-a' }, saved), []);
  const w = connectionWarnings({ connection: 'byok', apiKey: ' ', decisionModel: 'vendor/chat-b', models: 'vendor/chat-a\nvendor/jev-y' }, saved);
  assert.equal(w.length, 3);
  assert.match(w[0], /no key/);
  assert.match(w[1], /chat-b" was not kept/);
  assert.match(w[2], /jev-y/);
});
