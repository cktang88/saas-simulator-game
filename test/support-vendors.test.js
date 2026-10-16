// Support platform paradigms (support/vendors.js, support/platform.js): the vendor changes channel fit, hours,
// churn, AI billing and the failure modes; operator tiers separate on the choice and its configuration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import helpdesk, { ensureSupport, goLive } from '../public/apps/helpdesk.js';
import * as V from '../public/apps/support/vendors.js';
import { chooseVendor, requestDemo, signEnterprise, spendCredit, vendorMonthEnd, agentAvailable, ensureVendor } from '../public/apps/support/platform.js';

function world({ model = 'ent', n = 30, price = 900, seed = 7 } = {}) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Receipt collection for bookkeepers';
  s.apps.product = { features: [{ id: 'f1', title: 'Receipt requests by SMS', user: 'bookkeepers', problem: 'x', solution: 'y', acceptance: ['Given x when y then z'], status: 'shipped', shippedDay: -30, effortHours: 40 }], buildQueue: [], bugs: [], changelog: [] };
  for (let i = 0; i < n; i++) { const c = createCustomer(s, { name: `C ${i}`, email: `c${i}@x.com`, company: `Co ${i}` }); subscribe(s, c.id, { id: 'p', price, interval: 'month', trialDays: 0 }); }
  const sup = ensureSupport(s);
  sup.active = true; sup.autoHoursPerDay = 2;
  return s;
}
const bills = (s, who) => s.bank.txns.filter((t) => t.counterparty === who);

// Realistic profiles: a B2B company selling ~$900/mo accounts that live in Slack, and a consumer app.
const B2B = { mix: V.channelMix(Array.from({ length: 40 }, () => ({ big: true }))), convos: 60, aiShare: 0.6, trueRate: 0.45, supportHours: 60, supportHumans: 1, otherHumans: 3, mrr: 36000, arr: 432000, b2b: true };
const B2C = { mix: V.channelMix(Array.from({ length: 40 }, () => ({ consumer: true }))), convos: 1200, aiShare: 0.6, trueRate: 0.45, supportHours: 120, supportHumans: 1, otherHumans: 1, mrr: 24000, arr: 288000, b2b: false };

test('operator tiers separate on the platform choice: fit > right paradigm sloppily > wrong paradigm > enterprise overbuy', () => {
  // stellar: the platform that fits the channels; good: a near fit with its own drag; average: the wrong paradigm;
  // mediocre: a six-figure enterprise agent the company is far too small for.
  const plans = {
    B2B: { p: B2B, stellar: ['pylon', 'support_only'], good: ['pylon', 'everyone'], average: ['intercom', 'support_only'], mediocre: ['decagon', 'support_only'] },
    B2C: { p: B2C, stellar: ['intercom', 'support_only'], good: ['zendesk', 'support_only'], average: ['pylon', 'support_only'], mediocre: ['sierra', 'support_only'] },
  };
  for (const [name, plan] of Object.entries(plans)) {
    const total = {}, score = {};
    for (const tier of ['stellar', 'good', 'average', 'mediocre']) {
      const [id, seatPolicy] = plan[tier];
      total[tier] = V.estimateMonth(id, { ...plan.p, seatPolicy }).total;
      score[tier] = V.vendorFit({ id, p: plan.p, seatPolicy, overbuy: V.VENDORS[id].status === 'enterprise' && !V.qualifiesEnterprise(plan.p) }).score;
    }
    assert.equal(V.bestOption(plan.p).id, plan.stellar[0], `${name}: the stellar pick is the best option`);
    assert.ok(total.stellar < total.good && total.good < total.average && total.average < total.mediocre, `${name} totals ${JSON.stringify(total)}`);
    assert.ok(score.stellar >= 0.95 && score.stellar > score.good && score.good > score.average && score.average > score.mediocre, `${name} scores ${JSON.stringify(score)}`);
    // Gaps are material, not rounding: the wrong paradigm costs 10%+ all-in, the enterprise overbuy 2x+.
    assert.ok(total.average > total.stellar * 1.1 && total.mediocre > total.stellar * 2, `${name} gaps ${JSON.stringify(total)}`);
    // Feedback names what a stellar operator would have done.
    const fb = V.vendorFit({ id: plan.average[0], p: plan.p });
    assert.ok(fb.advice.some((a) => a.includes('A stellar operator would run') && a.includes(V.VENDORS[plan.stellar[0]].label)), `${name}: ${fb.advice.join(' | ')}`);
  }
});

test('paradigms: B2B Slack accounts fit Pylon, consumers fit the Fin widget; billing rules differ', () => {
  assert.ok(V.channelFit('pylon', B2B.mix) >= 0.85 && V.channelFit('intercom', B2B.mix) < 0.65);
  assert.ok(V.channelFit('intercom', B2C.mix) >= 0.9 && V.channelFit('pylon', B2C.mix) < 0.65);
  assert.ok(V.handlingMult('intercom', B2B.mix) > V.handlingMult('pylon', B2B.mix, { b2b: true }));
  assert.ok(V.churnMult('intercom', B2B.mix) > 1.05 && V.churnMult('pylon', B2B.mix) === 1);
  assert.equal(V.handlingMult('inbox', B2B.mix), 1); // the calibrated baseline
  // Fin bills what it counts (silent customers too); Zendesk only verified resolutions; Pylon every AI touch with a minimum.
  const usage = { claimed: 100, involved: 120, resolved: 50, wrong: 8 };
  assert.equal(V.aiBill('intercom', usage, { live: true }).usd, 99);
  assert.equal(V.aiBill('zendesk', usage, { live: true, unit: 1.5 }).usd, 78); // (50 + 8 × 25%) × $1.50
  assert.equal(V.aiBill('pylon', { involved: 10 }, { live: true }).usd, 150); // 5,000-credit minimum
  // Seat-cost explosion: Pylon bills a 3-seat minimum for a solo founder and per-seat for everyone you add.
  assert.equal(V.seatsFor('pylon', { supportHumans: 1 }).billed, 3);
  assert.equal(V.seatsFor('pylon', { supportHumans: 1, otherHumans: 5, seatPolicy: 'everyone' }).billed, 6);
  assert.equal(V.seatsFor('intercom', { supportHumans: 1 }).billed, 1);
});

test('in the sim: Intercom on a Slack-first B2B book costs hours and churn, Pylon bills seats; mistakes are logged', () => {
  const run = (id) => {
    const s = world();
    const sup = ensureSupport(s);
    chooseVendor(s, sup, id);
    for (const c of ensureStripe(s).subscriptions.slice(0, 4)) sup.channels[c.customerId] = { day: 0, tier: 'enterprise' };
    advance(s, 35, [helpdesk]);
    return { s, sup };
  };
  const a = run('intercom'), b = run('pylon');
  assert.ok(a.sup.vendor.today.handlingMult > b.sup.vendor.today.handlingMult);
  assert.ok(ensureMarket(a.s).modifiers.churn['support-vendor'] > 1.05, JSON.stringify(ensureMarket(a.s).modifiers.churn));
  assert.equal(ensureMarket(b.s).modifiers.churn['support-vendor'], undefined);
  assert.ok(a.sup.mistakeLog.some((m) => m.trap === 'vendor_channel_mismatch'));
  assert.ok(!b.sup.mistakeLog.some((m) => m.trap === 'vendor_channel_mismatch'));
  // Unsynced Slack channels take ~3x the weekly minutes on Intercom.
  const slackH = (s) => s.founder.timeLog.filter((t) => t.label === 'Support: Slack Connect channels').reduce((x, t) => x + t.hours, 0);
  assert.ok(slackH(a.s) > 2.5 * slackH(b.s) && slackH(b.s) > 0, `${slackH(a.s)} vs ${slackH(b.s)}`);
  const seat = bills(b.s, 'Pylon').find((t) => /seats/.test(t.description));
  assert.equal(seat.amount, -267); // 3-seat minimum × $89
});

test('Forethought is retired; Decagon below its gate wastes sales hours and overpays; nothing answers during implementation', () => {
  const s = world({ n: 20 });
  const sup = ensureSupport(s);
  assert.throws(() => chooseVendor(s, sup, 'forethought'), /Zendesk/);
  assert.throws(() => chooseVendor(s, sup, 'decagon'), /demo/);
  assert.throws(() => signEnterprise(s, sup, 'decagon'), /demo/);
  const d = requestDemo(s, sup, 'decagon');
  assert.equal(d.qualified, false);
  assert.ok(sup.mistakeLog.some((m) => m.trap === 'enterprise_demo_unqualified'));
  const cash = s.bank.txns.length;
  const e = signEnterprise(s, sup, 'decagon');
  assert.equal(bills(s, 'Decagon').slice(-1)[0].amount, -25000);
  assert.ok(s.bank.txns.length > cash);
  const over = sup.mistakeLog.find((m) => m.trap === 'enterprise_overbuy');
  assert.ok(over && over.estCost > 80000, `${over?.estCost}`);
  assert.equal(agentAvailable(s, sup), false);
  assert.throws(() => goLive(s), /implemented/);
  s.day = e.liveDay;
  assert.equal(agentAvailable(s, sup), true);
  assert.ok(V.vendorFit({ id: 'decagon', p: B2B, overbuy: true }).score <= 0.15);
});

test('annual lock-in: leaving Pylon after a month still bills the term; procedures and tests must be redone', () => {
  const s = world();
  const sup = ensureSupport(s);
  chooseVendor(s, sup, 'pylon');
  sup.ai.testedHash = 'x'; sup.ai.status = 'live'; sup.ai.procedures = [{ id: 'p1', intent: 'refund', quality: 0.8, simPassed: true }];
  s.day += 30;
  const r = chooseVendor(s, sup, 'intercom');
  assert.ok(r.fee >= 11 * 267 && r.fee <= 12 * 267, `${r.fee}`);
  assert.ok(sup.mistakeLog.some((m) => m.trap === 'vendor_lockin_fee' && m.estCost === r.fee));
  assert.equal(sup.ai.status, 'paused');
  assert.equal(sup.ai.testedHash, null);
  assert.equal(sup.ai.procedures[0].simPassed, false);
  assert.ok(r.hours > V.VENDORS.intercom.setupHours, 'migration hours on top of setup');
});

test('Plain: the AI credit allowance runs out mid-month and the overflow lands on you (logged)', () => {
  const s = world();
  const sup = ensureSupport(s);
  chooseVendor(s, sup, 'plain');
  const per = V.VENDORS.plain.ai.creditsPerConvo;
  let ok = 0;
  for (let i = 0; i < 250; i++) if (spendCredit(sup)) ok++;
  assert.equal(ok, Math.floor(V.VENDORS.plain.ai.allowance / per));
  vendorMonthEnd(s, sup, { usage: { claimed: 0, involved: ok }, live: true });
  assert.ok(sup.mistakeLog.some((m) => m.trap === 'ai_credits_exhausted'));
  assert.equal(sup.vendor.month.credits, 0);
});

test('old saves: an agent set up before platforms existed is Intercom Fin, billed as before (no seats)', () => {
  const s = world({ model: 'smb', price: 49 });
  const sup = ensureSupport(s);
  delete sup.vendor;
  sup.ai.status = 'live';
  ensureVendor(sup);
  assert.equal(sup.vendor.id, 'intercom');
  assert.equal(sup.vendor.legacy, true);
  vendorMonthEnd(s, sup, { usage: { claimed: 10 }, live: true });
  const b = bills(s, 'Intercom');
  assert.equal(b.length, 1);
  assert.equal(b[0].amount, -49.5);
  // A fresh game starts on a shared inbox: no bill, no AI.
  const f = world({ model: 'smb', price: 49, seed: 9 });
  assert.equal(ensureSupport(f).vendor.id, 'inbox');
  assert.equal(agentAvailable(f, ensureSupport(f)), false);
});

test('Platform tab renders the comparison, the retired note and stellar feedback', () => {
  const s = world();
  advance(s, 20, [helpdesk]);
  chooseVendor(s, ensureSupport(s), 'intercom');
  const root = { innerHTML: '', addEventListener() {} };
  helpdesk.render(root, { state: s, params: 'platform', save() {}, act() {}, render() {}, navigate() {} });
  assert.ok(/Compare platforms/.test(root.innerHTML) && /Pylon/.test(root.innerHTML) && /Acquired by Zendesk/.test(root.innerHTML), root.innerHTML.slice(0, 300));
  assert.ok(/A stellar operator would run/.test(root.innerHTML));
  const ai = { innerHTML: '', addEventListener() {} };
  helpdesk.render(ai, { state: s, params: 'ai', save() {}, act() {}, render() {}, navigate() {} });
  assert.ok(/per resolution the vendor counts/.test(ai.innerHTML));
});
