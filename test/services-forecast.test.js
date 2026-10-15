// Contracted services fees count in the line-item runway forecast; uncontracted offers never do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { runwayForecast } from '../public/apps/money/forecast.js';
import { servicesSlice, makeOffer, acceptOffer } from '../public/apps/services.js';

function mk(withProject) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'bootstrap', founderName: 'Pat', seed: 7 });
  seedDefaultStack(s);
  s.founder.salary = 5000;
  post(s, { amount: 6000, counterparty: 'Founder', description: 'Founder loan', category: 'founder_loan' });
  const o = makeOffer(s);
  o.fixed = true;
  servicesSlice(s).offers.push(o);
  if (withProject) acceptOffer(s, o.id, { deposit: false });
  return s;
}

test('an active services project extends forecast runway; an open offer does not', () => {
  const base = runwayForecast(mk(false)).months;
  const withJob = runwayForecast(mk(true)).months;
  assert.ok(withJob > base, `${withJob} > ${base}`);
});
