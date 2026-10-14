import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post, balance } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, mrr, activeSubs, feeFor } from '../public/core/stripe.js';
import { ensureMarket, landingConversion, trialConversion } from '../public/core/market.js';
import { parseCsv, toCsv } from '../public/core/util.js';
import { spendHours, OutOfHoursError, hoursLeft } from '../public/core/state.js';
import { APPS } from '../public/apps/registry.js';
import { extractPage, isPrivateIp } from '../server.js';

function fresh(model = 'smb') {
  const s = newState({ companyName: 'Test Co', model, path: 'indie', founderName: 'Pat', seed: 42 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 30000, counterparty: 'Pat', category: 'owner_contribution' });
  return s;
}
const shipFeature = (s) => { s.apps.product = { features: [{ id: 'f1', status: 'shipped' }] }; };

test('recurring tools are charged monthly from the bank', () => {
  const s = fresh();
  advance(s, 31, APPS);
  const tools = s.bank.txns.filter((t) => t.category === 'software' || t.category === 'hosting');
  assert.ok(tools.length >= 5, `${tools.length} tool charges`);
  assert.ok(balance(s) < 30000);
});

test('a paid subscription charges, pays out to the bank after the new-account hold, and counts in MRR', () => {
  const s = fresh();
  shipFeature(s);
  const c = createCustomer(s, { name: 'Ada', email: 'ada@x.com', country: 'US' });
  subscribe(s, c.id, { id: 'p', price: 100, interval: 'month', trialDays: 0 });
  assert.equal(mrr(s), 100);
  const ch = s.stripe.charges[0];
  if (ch.status === 'succeeded') {
    assert.equal(ch.fee, +(100 * 0.036 + 0.3).toFixed(2)); // 2.9% + 0.7% Billing + 30¢
    advance(s, 20, APPS);
    assert.ok(s.bank.txns.some((t) => t.category === 'stripe_payout'));
  }
});

test('international cards cost more; merchant of record costs 5% + 50¢', () => {
  const s = fresh();
  assert.ok(feeFor(s, 100, { country: 'INTL' }) > feeFor(s, 100, { country: 'US' }));
  s.stripe.settings.merchantOfRecord = true;
  assert.equal(feeFor(s, 100, { country: 'US' }), 5.5);
});

test('trials convert or cancel at trial end; churn happens at renewals', () => {
  const s = fresh('b2c');
  shipFeature(s);
  s.company.website = { text: 'x' };
  for (let i = 0; i < 400; i++) {
    const c = createCustomer(s, { name: `U${i}`, email: `u${i}@x.com` });
    subscribe(s, c.id, { id: 'p', price: 9.99, interval: 'month', trialDays: 7 });
  }
  advance(s, 8, APPS);
  const converted = activeSubs(s).length + s.stripe.subscriptions.filter((x) => x.status === 'past_due').length;
  const p = trialConversion(s);
  assert.ok(Math.abs(converted / 400 - p) < 0.08, `converted ${converted}/400 vs p=${p.toFixed(2)}`);
  advance(s, 120, APPS);
  assert.ok(activeSubs(s).length < converted * 0.7, 'B2C subscribers churn heavily in the first months');
});

test('no product or no website means traffic does not convert', () => {
  const s = fresh();
  assert.equal(landingConversion(s), 0);
  shipFeature(s);
  const noSite = landingConversion(s);
  s.company.website = { text: 'site' };
  assert.ok(landingConversion(s) > noSite);
});

test('founder hours are a weekly budget', () => {
  const s = fresh();
  spendHours(s, 50, 'x');
  assert.throws(() => spendHours(s, 10, 'y'), OutOfHoursError);
  advance(s, 7, APPS);
  assert.equal(hoursLeft(s), s.founder.hoursPerWeek);
});

test('company dies after two weeks overdrawn', () => {
  const s = fresh();
  post(s, { amount: -40000, counterparty: 'Oops', category: 'other' });
  advance(s, 20, APPS);
  assert.equal(s.status, 'dead');
});

test('CSV round trip handles quotes and commas', () => {
  const rows = [{ name: 'Acme, Inc', email: 'a@acme.com', note: 'says "hi"' }];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

test('server: page extraction and SSRF guard', () => {
  const p = extractPage('<html><head><title>Acme &amp; Co</title><meta name="description" content="Books for shops"></head><body><h1>Close books in 1 day</h1><script>x</script><a href="mailto:ceo@acme.com">mail</a></body></html>');
  assert.equal(p.title, 'Acme & Co');
  assert.deepEqual(p.emails, ['ceo@acme.com']);
  assert.ok(!p.text.includes('x\n'));
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '169.254.169.254', '::1', '172.20.0.1']) assert.ok(isPrivateIp(ip), ip);
  assert.ok(!isPrivateIp('93.184.216.34'));
});
