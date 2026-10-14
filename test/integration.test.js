// Runs the whole simulation (every registered app's onDay/onMonthEnd) for each business model and fails
// on any error an app throws. The clock catches app errors so the game keeps running; tests must not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { archetypesReady } from '../public/core/network.js';
import { wellbeingReady } from '../public/core/wellbeing.js';
import { APPS } from '../public/apps/registry.js';

for (const model of ['b2c', 'smb', 'ent']) {
  for (const path of ['indie', 'vc']) {
    test(`full simulation runs 400 days without app errors (${model}, ${path})`, async () => {
      await archetypesReady;
      await wellbeingReady;
      const errors = [];
      const orig = console.error;
      console.error = (...a) => errors.push(a.map(String).join(' ').slice(0, 300));
      try {
        const s = newState({ companyName: 'Int Co', model, path, founderName: 'Alex Test', seed: 7 });
        ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
        post(s, { amount: 60000, counterparty: 'Alex', category: 'owner_contribution' });
        s.personal.liquidSavings = 500000;
        s.company.oneLiner = 'Automated month-end close for Shopify stores';
        s.company.icp = 'Shopify store owners doing $1-10M/yr who close books by hand';
        s.company.website = { source: 'paste', title: 'Int Co', text: 'Close your books in 1 day. $99/mo. Start free trial.', headings: [] };
        s.apps.product = { features: [{ id: 'f1', title: 'Auto-reconcile payouts', status: 'shipped', shippedDay: 0, spec: 'x' }] };
        for (let i = 0; i < 30; i++) {
          const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com` });
          subscribe(s, c.id, { id: 'p', price: model === 'ent' ? 1500 : 49, interval: model === 'ent' ? 'year' : 'month', trialDays: 0 }, { source: 'network' });
        }
        advance(s, 400, APPS);
        assert.ok(Number.isFinite(s.bank.accounts[0].balance), 'bank balance is finite');
        assert.ok(s.metrics.daily.length > 300);
        JSON.stringify(s); // state must stay serializable
      } finally {
        console.error = orig;
      }
      assert.deepEqual(errors, [], errors.slice(0, 5).join('\n'));
    });
  }
}
