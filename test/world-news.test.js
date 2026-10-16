// World news items (marketworld/llm.js writeNews): the prompt carries the game-state facts the item must match, and an item
// that names a real AI lab is labelled as a simulated scenario. Short and targeted; the model is injected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack } from '../public/core/bank.js';
import { ensureWorld, seedLandscape, fireEvent, eventById } from '../public/apps/marketworld/engine.js';
import { writeNews, newsFacts } from '../public/apps/marketworld/llm.js';

function world() {
  const s = newState({ companyName: 'Shelfbooks', model: 'smb', path: 'indie', founderName: 'Maya', seed: 11 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  s.company.oneLiner = 'Automatic bookkeeping for Shopify sellers';
  for (let i = 0; i < 3; i++) { const c = createCustomer(s, { name: `Owner ${i}`, email: `o${i}@shop${i}.com`, company: `Shop ${i}` }); subscribe(s, c.id, s.plans[0], { trial: false }); }
  seedLandscape(s);
  return s;
}

test('news facts: price-cut direction, drawn round size and the real customer list reach the prompt', async () => {
  const s = world();
  const W = ensureWorld(s);
  const rival = W.rivals[0];
  const cut = newsFacts(s, eventById('competitor_price_cut'), rival);
  assert.match(cut, new RegExp(`LOWER than that`));
  assert.match(cut, new RegExp(`\\$${rival.priceMonthly}/mo`));
  rival.lastRound = 4.2e6;
  assert.match(newsFacts(s, eventById('competitor_raise'), rival), /\$4\.2M/);
  assert.match(newsFacts(s, eventById('negative_public_review'), null), /Shop 0/);
  let prompt = '';
  const inst = fireEvent(s, eventById('negative_public_review'));
  const n = W.news.find((x) => x.instId === inst.id);
  await writeNews({ state: s, llm: { ask: async (o) => { prompt = o.prompt; return { mock: false, data: { headline: 'Two stars', source: 'Capterra', body: 'x' } }; } } }, n.id);
  assert.match(prompt, /Paying customers in the game/);
});

test('an AI-lab item that names a real lab is labelled simulated', async () => {
  const s = world();
  const inst = fireEvent(s, eventById('ai_lab_feature_overlap'));
  const n = ensureWorld(s).news.find((x) => x.instId === inst.id);
  await writeNews({ state: s, llm: { ask: async () => ({ mock: false, data: { headline: 'Anthropic launches bookkeeping agents', source: 'Anthropic blog', body: 'x' } }) } }, n.id);
  assert.match(n.headline, /^Simulated: /);
});
