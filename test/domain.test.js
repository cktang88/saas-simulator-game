// Website -> Domain (apps/website/domain.js): registrar search, prices, buying, name-quality tiers, effects and the
// trademark consequence. Short, targeted: no long sims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack, balance, post } from '../public/core/bank.js';
import { ensureProgress, evaluate, nodeStatus, NODE_BY_ID } from '../public/core/unlocks.js';
import {
  checkDomain, searchDomains, gradeDomain, buyDomain, domainOf, founderEmail, siteHost, applyDomainEffects, domainOnDay,
  purchaseHours, parseDomain, DOMAIN_LANDING, TLDS,
} from '../public/apps/website/domain.js';

function mk(name = 'Ledgerly') {
  const s = newState({ companyName: name, model: 'smb', path: 'indie', founderName: 'Maya Chen', seed: 11 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 30000, counterparty: 'Maya', category: 'owner_contribution' });
  return s;
}

test('prices are realistic 2026 registrar prices', () => {
  for (const reg of ['cloudflare', 'porkbun', 'namecheap']) {
    const [, renew] = TLDS.com.prices[reg];
    assert.ok(renew >= 10 && renew <= 20, `.com renewal at ${reg}: ${renew}`);
  }
  assert.ok(TLDS.io.prices.cloudflare[1] >= 35 && TLDS.io.prices.cloudflare[1] <= 60);
  assert.ok(TLDS.ai.prices.cloudflare[1] >= 70 && TLDS.ai.prices.cloudflare[1] <= 100);
  assert.equal(TLDS.ai.minYears, 2, '.ai needs a 2-year registration');
});

test('availability is deterministic per name; short and dictionary .coms are taken or priced in the thousands', () => {
  assert.deepEqual(checkDomain('ledgerly', 'com'), checkDomain('ledgerly', 'com'));
  for (const w of ['ledger', 'pay', 'flow', 'team', 'book', 'cash', 'shop', 'desk']) {
    const r = checkDomain(w, 'com');
    assert.ok(r.status === 'taken' || (r.status === 'aftermarket' && r.price >= 1000), `${w}.com: ${r.status} ${r.price ?? ''}`);
  }
  assert.equal(checkDomain('stripe', 'com').status, 'taken');
  assert.equal(checkDomain('bad_name', 'com').status, 'invalid');
  // A long brandable with a prefix is usually free at the normal price.
  const free = ['getledgerly', 'tryledgerly', 'useledgerly'].map((n) => checkDomain(n, 'com')).filter((r) => r.status === 'available');
  assert.ok(free.length >= 1);
  assert.ok(free.every((r) => r.dueNow > 5 && r.dueNow < 20));
  assert.deepEqual(parseDomain('https://www.Ledgerly.com/pricing'), { sld: 'ledgerly', tld: 'com' });
  const res = searchDomains(mk(), 'ledgerly');
  assert.ok(res.some((r) => r.domain === 'ledgerly.ai') && res.some((r) => r.idea));
});

// Scripted choices for the same company, one per operator tier.
const CHOICES = {
  stellar: ['ledgerly.com', 'getledgerly.com', 'ledgerlyhq.com'],
  good: ['lgrly.com', 'ledgerlyinvoices.com', 'ledgerly.co', 'ledgerly.io'],
  average: ['invoicehelperpro.com', 'ledgerlyinvoicingsoftware.com'],
  mediocre: ['ledgerly-invoices-app.co', 'best-ledger-4u.xyz', 'stripeledger.com', 'quickbooksledger.com'],
};

test('name-quality tiers separate (stellar > good > average > mediocre) with feedback on what stellar looks like', () => {
  const mean = {};
  for (const [tier, names] of Object.entries(CHOICES)) {
    const gs = names.map((d) => gradeDomain(d, 'Ledgerly'));
    for (const g of gs) assert.equal(g.tier, tier, `${g.domain} graded ${g.tier} (${g.score})`);
    mean[tier] = gs.reduce((a, g) => a + g.score, 0) / gs.length;
  }
  assert.ok(mean.stellar > mean.good && mean.good > mean.average && mean.average > mean.mediocre, JSON.stringify(mean));
  assert.ok(mean.stellar - mean.mediocre >= 50, 'the gap is large, not cosmetic');
  // A fitting TLD can be stellar: .ai for an AI product, not for invoice reminders.
  assert.equal(gradeDomain('ledgerly.ai', 'Ledgerly', { oneLiner: 'AI agent that chases unpaid invoices' }).tier, 'stellar');
  assert.notEqual(gradeDomain('ledgerly.ai', 'Ledgerly', { oneLiner: 'Invoice reminders for plumbers' }).tier, 'stellar');
  assert.equal(gradeDomain('ledgerly.xyz', 'Ledgerly').tier, 'average', '.xyz spam reputation caps it');
  const bad = gradeDomain('stripeledger.com', 'Ledgerly');
  assert.ok(bad.collision && bad.weak[0].includes('trademark'));
  assert.ok(bad.tips.some((t) => t.includes('ledgerly.com')), 'feedback names what a stellar founder would pick');
});

test('buying: bank, renewal line, hours, landing effect by tier; a free subdomain costs a little', () => {
  const s = mk();
  s.company.website = { source: 'paste', text: 'hi' };
  assert.equal(applyDomainEffects(s), DOMAIN_LANDING.none, 'live page on a builder subdomain');
  assert.match(siteHost(s), /\.carrd\.co$/);
  const cash = balance(s);
  const info = buyDomain(s, 'getledgerly.com', { registrar: 'cloudflare', searches: 4 });
  assert.equal(s.company.domain, 'getledgerly.com');
  assert.equal(info.grade.tier, 'stellar');
  assert.ok(Math.abs(cash - balance(s) - TLDS.com.prices.cloudflare[0]) < 0.01, 'charged the registration');
  const rec = s.recurring.filter((r) => r.domain === 'getledgerly.com' && r.active);
  assert.equal(rec.length, 1, 'renewal is on the recurring bills');
  assert.ok(!s.recurring.some((r) => r.active && r.vendor === 'Namecheap' && !r.domain), 'replaces the placeholder domains line');
  assert.ok(s.market.modifiers.landing.domain > 1);
  assert.equal(founderEmail(s), 'maya@getledgerly.com');
  assert.equal(siteHost(s), 'getledgerly.com');
  assert.ok(purchaseHours(4) > 0.1 && purchaseHours(4) < 0.5, 'a few minutes of founder time');
  assert.ok(purchaseHours(0, 'aftermarket') > purchaseHours(0));
  assert.throws(() => buyDomain(s, 'ledger.com'), /taken|cash/);

  const mult = (d) => { const x = mk(); buyDomain(x, d); return x.market.modifiers.landing.domain ?? 1; };
  const m = { stellar: mult('getledgerly.com'), average: mult('invoicehelperpro.com'), mediocre: mult('ledgerly-invoices-app.co'), collision: mult('stripeledger.com') };
  assert.ok(m.stellar > m.average && m.average > m.mediocre && m.mediocre > m.collision, JSON.stringify(m));
});

test('mistakes cost something: a trademark domain is lost to a cease-and-desist with a legal bill', () => {
  const s = mk();
  const info = buyDomain(s, 'stripeledger.com');
  assert.ok(s.mistakes.some((x) => x.id === 'trademark_domain'));
  assert.ok(info.cdDay > s.day);
  s.day = info.cdDay;
  const cash = balance(s);
  domainOnDay(s);
  assert.equal(s.company.domain, '');
  assert.ok(s.company.domainInfo.lost);
  assert.ok(cash - balance(s) >= 500, 'legal review billed');
  assert.ok(s.mistakes.some((x) => x.id === 'lost_domain_trademark'));
  assert.equal(s.market.modifiers.landing.domain, DOMAIN_LANDING.lost);
  assert.ok(!s.recurring.some((r) => r.domain === 'stripeledger.com' && r.active), 'renewal stops');
  buyDomain(s, 'getledgerly.com');
  assert.ok(s.company.domainInfo.history.some((h) => h.name === 'stripeledger.com'));
});

test('old saves keep their domain as owned; the to-do completes when a domain is registered', () => {
  const s = mk();
  s.company.domain = 'ledgerly.io';
  const d = domainOf(s);
  assert.equal(d.name, 'ledgerly.io');
  assert.equal(d.kind, 'legacy');
  assert.ok(d.grade.tier);

  const t = mk();
  ensureProgress(t); t.company.oneLiner = 'Invoice reminders for plumbers'; t.company.icp = 'Plumbing firms';
  evaluate(t);
  assert.equal(nodeStatus(t, NODE_BY_ID.domain), 'available');
  buyDomain(t, 'getledgerly.com');
  evaluate(t);
  assert.equal(nodeStatus(t, NODE_BY_ID.domain), 'done');
});
