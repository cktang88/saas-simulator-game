// Waits on the timeline engine: support back-and-forth, vendor support, invoice payment by buyer (core/timing.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe, sendInvoiceReminder } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { TIMELINES } from '../public/core/timing.js';
import { ensureSupport, awaitCustomer, customerWaitDay, CUSTOMER_WAIT } from '../public/apps/helpdesk.js';
import { ensureInsights, openVendorCase, buyCloudSupport } from '../public/apps/insights.js';
import { metaAppeal } from '../public/apps/marketworld/engine.js';

const mk = (model = 'smb', seed = 3) => { const s = newState({ companyName: 'T', model, path: 'indie', founderName: 'P', seed }); ensureStripe(s); ensureMarket(s); return s; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

test('new timeline keys exist with sources', () => {
  for (const k of ['support.customerReply.b2b', 'support.customerReply.consumer', 'vendor.cloud.billing', 'vendor.stripe.support', 'vendor.meta.appeal', 'invoice.pay']) {
    assert.ok(TIMELINES[k]?.median > 0 && TIMELINES[k].p90 > TIMELINES[k].median && /\[(S|V|design)/.test(TIMELINES[k].src), k);
  }
});

const ticket = (s, i, priority = 'normal') => ({ id: `t${i}`, name: 'Dana Reyes', company: 'Acme', subject: 'Export fails', category: 'bug', priority, feature: 'CSV export', status: 'open', createdDay: s.day, firstResponseDay: s.day, messages: [{ from: 'them', text: 'CSV export fails with an error since Monday for our Acme workspace.', day: s.day }], channel: 'email' });
const CLEAR = 'Hi Dana, sorry about the CSV export at Acme. I fixed the bug today and it is live now. Here is how to re-run it: 1. Go to Settings 2. click Export. Can you check and tell me if the file arrives?';
const VAGUE = 'Thanks for reaching out, we will look into it.';

test('support: a clear reply gets answered sooner and goes quiet less than a vague one', () => {
  const run = (body) => {
    const s = mk('smb', 7);
    const days = []; let quiet = 0;
    for (let i = 0; i < 300; i++) { const t = ticket(s, i); awaitCustomer(s, t, body); if (t.awaiting.quiet) quiet++; else days.push(t.awaiting.day - s.day); }
    return { days: mean(days), quiet: quiet / 300 };
  };
  const clear = run(CLEAR), vague = run(VAGUE);
  assert.ok(clear.days < vague.days, `clear ${clear.days} vs vague ${vague.days}`);
  assert.ok(clear.quiet < vague.quiet - 0.1, `quiet ${clear.quiet} vs ${vague.quiet}`);
  // Enterprise customers and low-priority asks are slower; consumers answer on calendar days.
  const s = mk('ent', 9);
  const ent = mean(Array.from({ length: 200 }, (_, i) => { const t = ticket(s, i); return awaitCustomer(s, t, CLEAR).days; }));
  const s2 = mk('smb', 9);
  const smb = mean(Array.from({ length: 200 }, (_, i) => { const t = ticket(s2, i); return awaitCustomer(s2, t, CLEAR).days; }));
  assert.ok(ent > smb, `ent ${ent} vs smb ${smb}`);
});

test('support: a customer who goes quiet after a vague reply is auto-closed unresolved with a logged cost', () => {
  const s = mk('smb', 11);
  const sup = ensureSupport(s);
  const t = ticket(s, 1);
  sup.tickets.push(t);
  awaitCustomer(s, t, VAGUE);
  t.awaiting.quiet = true;
  s.day += CUSTOMER_WAIT.autoCloseDays;
  customerWaitDay(s, sup);
  assert.equal(t.status, 'closed');
  assert.ok(t.unresolved && t.autoClosed);
  assert.ok(sup.mistakeLog.some((m) => m.trap === 'customer_went_quiet'));
  // After a clear reply, silence counts as solved and costs nothing.
  const t2 = ticket(s, 2); sup.tickets.push(t2);
  awaitCustomer(s, t2, CLEAR); t2.awaiting.quiet = true;
  s.day += CUSTOMER_WAIT.autoCloseDays;
  customerWaitDay(s, sup);
  assert.equal(t2.status, 'solved');
});

test('vendor support: a paid cloud support plan answers a billing case faster; Stripe chat beats email', () => {
  const cloud = (paid) => {
    const s = mk('smb', 13);
    const ins = ensureInsights(s);
    if (paid) buyCloudSupport(s);
    return mean(Array.from({ length: 150 }, (_, i) => {
      ins.tasks.push({ id: `c${i}`, type: 'forgiveness', day: s.day, amount: 800, status: 'open' });
      const tl = openVendorCase(s, `c${i}`);
      assert.ok(ins.tasks.find((x) => x.id === `c${i}`).why, 'explanation stored');
      return tl.days;
    }));
  };
  const basic = cloud(false), business = cloud(true);
  assert.ok(business < basic * 0.6, `business ${business} vs basic ${basic}`);
  const stripe = (channel) => {
    const s = mk('smb', 17);
    const ins = ensureInsights(s);
    return mean(Array.from({ length: 150 }, (_, i) => { ins.tasks.push({ id: `s${i}`, type: 'stripe_fees', day: s.day, amount: 300, status: 'open' }); return openVendorCase(s, `s${i}`, { channel }).days; }));
  };
  assert.ok(stripe('chat') < stripe('email'));
});

test('vendor support: Meta reviews a verified, seasoned account appeal faster than a new unverified one', () => {
  const appeal = (verified, ageDays) => {
    const s = mk('b2c', 19);
    s.day = 400;
    s.apps.world = { verifiedBusiness: verified };
    s.apps.ads = { accounts: { meta: { createdDay: s.day - ageDays } }, rows: [] };
    return mean(Array.from({ length: 150 }, () => metaAppeal(s, { startDay: s.day, effects: {} }).days));
  };
  assert.ok(appeal(true, 400) < appeal(false, 20));
});

function invoiceWorld(segmentId, { terms = 30, setup = 'done', seed = 23 } = {}) {
  const s = mk('ent', seed);
  s.apps.crm = { companies: [{ id: 'co', name: 'Buyer', segmentId }], deals: [] };
  const days = [];
  for (let i = 0; i < 120; i++) {
    s.apps.crm.deals.push({ id: `d${i}`, companyId: 'co', proc: { termsDays: terms }, paperwork: setup ? [{ id: 'w9', status: setup === 'done' ? 'done' : 'open' }] : [] });
    const c = createCustomer(s, { name: `B${i}`, email: `b${i}@x.com`, country: 'US', crmCompanyId: 'co', meta: { dealId: `d${i}` } });
    subscribe(s, c.id, { id: 'p', price: 24000, interval: 'year', trialDays: 0 }, { invoiceManually: true });
  }
  return s;
}
const payDays = (s) => s.stripe.invoices.filter((i) => i.payDay != null).map((i) => i.payDay - i.issuedDay);

test('invoices: days-to-pay depend on the buyer, the terms and vendor setup; the reason is recorded', () => {
  const fed = mean(payDays(invoiceWorld('federal'))), hosp = mean(payDays(invoiceWorld('hospitals', { terms: 45 }))), ent = mean(payDays(invoiceWorld('enterprise', { terms: 60 })));
  assert.ok(fed < 40 && hosp > fed + 15 && ent > fed + 20, `fed ${fed} hosp ${hosp} ent ${ent}`);
  const missing = mean(payDays(invoiceWorld('mid_market', { setup: 'missing' }))), done = mean(payDays(invoiceWorld('mid_market')));
  assert.ok(missing > done, `missing setup ${missing} vs done ${done}`);
  const inv = invoiceWorld('hospitals', { terms: 45 }).stripe.invoices[0];
  assert.ok(inv.pay.factors.some((f) => /hospital/.test(f.label)) && inv.pay.typical > 40);
});

test('invoices: sending a reminder pulls payment earlier on average; a second nudge the same week does nothing', () => {
  const a = invoiceWorld('enterprise', { terms: 60, seed: 29 }), b = invoiceWorld('enterprise', { terms: 60, seed: 29 });
  const before = mean(payDays(b));
  b.day += 61;
  for (const inv of b.stripe.invoices) if (inv.payDay != null && inv.payDay > b.day) sendInvoiceReminder(b, inv.id);
  assert.ok(mean(payDays(b)) < before - 3, `${mean(payDays(b))} vs ${before}`);
  assert.equal(mean(payDays(a)), before, 'same seed without reminders');
  const inv = b.stripe.invoices.find((i) => i.payDay != null && i.payDay > b.day + 3);
  if (inv) { const pd = inv.payDay; sendInvoiceReminder(b, inv.id); assert.equal(inv.payDay, pd); }
});
