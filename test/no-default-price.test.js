// A new game has no price: the founder sets every price in the Pricing lab, and until then nobody can buy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket, mainPlan, planOrReference, landingConversion, trialConversion } from '../public/core/market.js';
import { seedDefaultStack } from '../public/core/bank.js';
import { acquire } from '../public/apps/growth/acquire.js';
import { ensureDeal, startProposal } from '../public/apps/sales/model.js';
import { bizContext } from '../public/apps/context.js';
import pricing from '../public/apps/pricing.js';

function fresh(model) {
  const s = newState({ companyName: 'NoPrice', model, path: 'indie', founderName: 'P', seed: 4, plans: [] });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  s.company.oneLiner = 'Scheduling for plumbing contractors';
  s.company.website = { text: 'x' };
  s.apps.product = { features: [{ id: 'f1', title: 'Scheduling', status: 'shipped', shippedDay: 0 }] };
  return s;
}
const stubRoot = () => ({ innerHTML: '', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } });

test('no plan is created for the founder, and nothing says $49 Pro', () => {
  const s = fresh('smb');
  assert.equal(s.plans.length, 0);
  assert.equal(mainPlan(s), null);
  assert.doesNotMatch(bizContext(s, 'public'), /\$49|Pro /);
  assert.ok(planOrReference(s).reference, 'estimates use a flagged reference, never a sellable plan');
});

test('without a price consumers cannot buy and B2B visitors only ask for pricing', () => {
  const c = fresh('b2c');
  assert.equal(landingConversion(c), 0);
  assert.equal(acquire(c, { source: 'ads:meta', n: 20 }).subs.length, 0);
  const b = fresh('smb');
  assert.equal(trialConversion(b), 0);
  const r = acquire(b, { source: 'organic:seo', n: 5 });
  assert.equal(r.subs.length, 0);
  assert.equal(r.leads, 5);
});

test('a proposal needs a real price', () => {
  const s = fresh('smb');
  s.apps.crm = { companies: [{ id: 'co1', name: 'Pipes Inc', industry: 'plumbing' }], contacts: [], deals: [], activities: [] };
  const deal = ensureDeal(s, { companyId: 'co1', stage: 'qualified' });
  assert.match(deal.name, /no price yet/);
  assert.throws(() => startProposal(s, deal, {}), /Set a price/);
});

test('the Pricing lab opens on Your prices with no suggested amount', () => {
  const s = fresh('smb');
  const root = stubRoot();
  pricing.render(root, { state: s, params: '', save() {}, act() {}, render() {}, navigate() {}, enqueue() {}, toast() {}, llm: null });
  assert.match(root.innerHTML, /Your prices/);
  assert.match(root.innerHTML, /You have not set a price/);
  assert.doesNotMatch(root.innerHTML, /\$49/);
});
