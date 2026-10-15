// Regression tests for the growth / channels / lifecycle / research bug review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ensureCalendar } from '../public/core/calendar.js';
import { dayOfMonth } from '../public/core/util.js';
import { APPS } from '../public/apps/registry.js';
import { createAccount, createCampaign, createAdSet, createAd, addCreative } from '../public/apps/growth/adsEngine.js';
import { ensureChannels, hirePrFirm, PR_FIRMS, channelsDay } from '../public/apps/channels/sim.js';
import { bookReal } from '../public/apps/research.js';
import { researchSlice } from '../public/apps/product/store.js';

function fresh(model = 'b2c', seed = 7) {
  const s = newState({ companyName: 'Growth Co', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] };
  s.company.website = { source: 'paste', title: 'x', text: 'x' };
  s.market.flags = { fixedDemand: 1 };
  return s;
}

test('ads: a no-trial B2C purchase is reported once (reported revenue = reported purchases × price)', () => {
  for (const seed of [3, 11]) {
    const s = fresh('b2c', seed);
    s.plans[0].trialDays = 0;
    const acct = createAccount(s, 'meta');
    acct.payment = 'card_1'; acct.pixel = true; acct.capi = true; acct.dailyLimit = null;
    const c = createCampaign(s, { p: 'meta', objective: 'sales' });
    const set = createAdSet(s, { campaignId: c.id, budget: 300, optimization: 'purchase' });
    const cr = addCreative(s, { format: 'static', hook: 'h', skill: 0.7 }); cr.status = 'approved';
    createAd(s, { adsetId: set.id, creativeId: cr.id });
    advance(s, 15, APPS);
    const rows = s.apps.ads.rows;
    const rv = rows.reduce((a, r) => a + r.rv, 0);
    const rpp = rows.reduce((a, r) => a + r.rpp, 0);
    assert.ok(rpp > 0, `seed ${seed}: some purchases reported`);
    assert.ok(Math.abs(rv - rpp * s.plans[0].price) < 0.05, `seed ${seed}: rv ${rv} vs ${rpp} purchases × ${s.plans[0].price}`);
  }
});

test('channels: a monthly retainer signed late in the month is prorated on the first monthly bill, then billed in full', () => {
  const s = fresh('smb');
  ensureChannels(s);
  while (dayOfMonth(s) < 26) advance(s, 1, APPS);
  const F = PR_FIRMS.boutique;
  hirePrFirm(s, 'boutique');
  const paid = () => -s.bank.txns.filter((t) => t.counterparty === F.label).reduce((a, t) => a + t.amount, 0);
  assert.equal(paid(), F.monthly);
  const signed = s.day;
  while (dayOfMonth(s) !== 1) advance(s, 1, APPS);
  const firstBill = paid() - F.monthly;
  assert.ok(Math.abs(firstBill - F.monthly * ((s.day - signed) / 30)) < 1, `first bill ${firstBill} after ${s.day - signed} days`);
  advance(s, 1, APPS);
  while (dayOfMonth(s) !== 1) advance(s, 1, APPS);
  assert.ok(Math.abs(paid() - F.monthly - firstBill - F.monthly) < 0.01, 'second monthly bill is the full retainer');
});

test('channels: a scheduled co-marketing swap with no partner record does not crash the daily tick', () => {
  const s = fresh('smb');
  const C = ensureChannels(s);
  C.comarketing.push({ id: 'cm_x', partnerId: 'gone', partnerName: 'Gone Inc', type: 'swap', day: s.day, quality: 0.6, accept: true, status: 'scheduled', eventDay: s.day, prep: 1, promo: false });
  assert.doesNotThrow(() => channelsDay(s));
  assert.equal(C.comarketing[0].status, 'done');
});

test('research: a booking that finds no free calendar slot gives back the intro credit it was about to spend', () => {
  let threw = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = fresh('smb', seed);
    const cal = ensureCalendar(s);
    cal.workHours.end = cal.workHours.start; // no free slot anywhere
    const slice = researchSlice(s);
    slice.introCredits = 1;
    try {
      bookReal(s, { name: 'Dana Reyes', role: 'Owner', company: 'Reyes & Co', channel: 'intro' });
      assert.equal(slice.introCredits, 0); // no reply: the intro is spent
    } catch (e) {
      threw++;
      assert.match(e.message, /No free 45-minute slot/);
      assert.equal(slice.introCredits, 1, `seed ${seed}: intro credit restored`);
    }
  }
  assert.ok(threw > 0, 'the no-slot path ran');
});
