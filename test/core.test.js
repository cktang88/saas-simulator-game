import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post, balance } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, mrr, activeSubs, feeFor } from '../public/core/stripe.js';
import { ensureMarket, landingConversion, trialConversion } from '../public/core/market.js';
import { parseCsv, toCsv } from '../public/core/util.js';
import { spendHours, OutOfHoursError, hoursLeft, refundHours } from '../public/core/state.js';
import { APPS } from '../public/apps/registry.js';
import { browse, browsedThisWeek } from '../public/apps/cofounder/sim.js';
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
  const cohort = new Set(s.stripe.subscriptions.map((x) => x.id)); // other apps add new signups (word of mouth etc.)
  const live = () => s.stripe.subscriptions.filter((x) => cohort.has(x.id) && (x.status === 'active' || x.status === 'past_due')).length;
  advance(s, 8, APPS);
  const converted = live();
  const p = trialConversion(s);
  assert.ok(Math.abs(converted / 400 - p) < 0.08, `converted ${converted}/400 vs p=${p.toFixed(2)}`);
  advance(s, 120, APPS);
  assert.ok(live() < converted * 0.7, 'B2C subscribers churn heavily in the first months');
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
  // Last week's 50h are gone; only this week's (Monday) charges from apps remain.
  const worked = s.founder.hoursUsed - (s.founder.lostHoursThisWeek ?? 0); // excluding time lost to illness etc.
  assert.ok(worked < 10, `hoursUsed ${s.founder.hoursUsed}`);
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

import { scheduleEvent, findSlots, eventsOn } from '../public/core/calendar.js';

test('calendar: conflicts are rejected, meetings charge hours on their day, booked calls run into overtime, badly overbooked weeks miss them', () => {
  const s = fresh();
  const e = scheduleEvent(s, { title: 'Demo', kind: 'call', day: 2, start: 600, duration: 60 });
  assert.throws(() => scheduleEvent(s, { title: 'Clash', kind: 'call', day: 2, start: 630, duration: 30 }), /Conflicts/);
  const slot = findSlots(s, { fromDay: 2, duration: 60, count: 1 })[0];
  assert.ok(!(slot.day === 2 && slot.start < 660 && slot.start + 60 > 600), 'free slot avoids the demo');
  advance(s, 2, APPS); // day 2 (Wednesday)
  assert.equal(s.founder.hoursUsed, 1);
  // A booked call is attended in overtime; only a badly overbooked week misses it.
  s.founder.hoursUsed = s.founder.hoursPerWeek;
  scheduleEvent(s, { title: 'Late call', kind: 'call', day: 3, start: 600, duration: 30 });
  scheduleEvent(s, { title: 'Way late call', kind: 'call', day: 3, start: 720, duration: 30 });
  advance(s, 1, APPS);
  assert.equal(eventsOn(s, 3).find((x) => x.title === 'Late call').status, 'scheduled');
  assert.ok(eventsOn(s, 3)[0].charged);
  s.founder.hoursUsed = s.founder.hoursPerWeek + 9;
  scheduleEvent(s, { title: 'Overbooked', kind: 'call', day: 4, start: 600, duration: 60 });
  advance(s, 1, APPS);
  assert.equal(eventsOn(s, 4).find((x) => x.title === 'Overbooked').status, 'missed');
  advance(s, 1, APPS);
  assert.equal(e.status, 'unattended');
});

test('calendar: three meetings without a focus block cost an extra context-switch hour', () => {
  const s = fresh();
  for (const start of [540, 660, 840]) scheduleEvent(s, { title: 'Call', kind: 'call', day: 1, start, duration: 30 });
  advance(s, 1, APPS);
  assert.equal(s.founder.hoursUsed, 2.5);
});

import { wellbeingReady, ensureWellbeing, respondLife } from '../public/core/wellbeing.js';

test('wellbeing: 70h weeks drain energy until burnout cuts capacity; rest restores it', async () => {
  await wellbeingReady;
  const s = fresh();
  s.personal.liquidSavings = 1e6; // isolate from personal-finance pressure (no forced day job)
  s.founder.hoursPerWeek = 75;
  for (let w = 0; w < 14; w++) {
    s.founder.hoursUsed = 72; // grind
    advance(s, 7, APPS);
  }
  const wb = ensureWellbeing(s);
  assert.ok(wb.events.some((e) => e.type === 'burnout_episode'), `energy ${s.founder.energy}`);
  const burnDay = wb.events.find((e) => e.type === 'burnout_episode').day;
  const lost = s.founder.timeLog.filter((t) => t.day >= burnDay && /Life & health|Low energy/.test(t.label)).reduce((a, t) => a + t.hours, 0);
  assert.ok(lost > 40, `burnout shows up as lost hours at the start of each week (${lost.toFixed(0)} h since the episode)`);
  const ev = wb.events.find((e) => e.type === 'burnout_episode');
  respondLife(s, ev.id, 'real_break');
  assert.equal(s.founder.hoursPerWeek, 50);
  const before = s.founder.energy;
  for (let w = 0; w < 6; w++) { s.founder.hoursUsed = Math.min(s.founder.hoursUsed, 40); advance(s, 7, APPS); }
  assert.ok(s.founder.energy > before, 'lighter weeks restore energy');
});

import { marketDemand, isPivot } from '../public/core/market.js';
test('hidden market demand: log-normal across ideas, stable per idea, re-drawn on pivot, drives conversion', () => {
  const ds = [];
  for (let i = 0; i < 400; i++) {
    const s = fresh(); s.seed = 1000 + i; s.company.oneLiner = `Idea number ${i} for dentists`;
    ds.push(marketDemand(s));
  }
  ds.sort((a, b) => a - b);
  const med = ds[200];
  assert.ok(med > 0.35 && med < 0.7, `median ${med}`);
  assert.ok(ds[380] > 2.5 * med, 'right tail exists');
  const s = fresh(); s.company.oneLiner = 'Scheduling for plumbers';
  const d1 = marketDemand(s); assert.equal(marketDemand(s), d1);
  s.company.oneLiner = 'Scheduling software for plumbing businesses'; // re-wording: no free re-roll
  assert.equal(marketDemand(s), d1);
  s.company.pivots = 1; // a recorded pivot re-draws the market
  assert.notEqual(marketDemand(s), d1);
  assert.ok(isPivot('Scheduling for plumbers', 'Invoicing for dental clinics'));
  assert.ok(!isPivot('Scheduling software for plumbers', 'Scheduling app for plumbers and HVAC'));
});

test('requiring a card costs trial starts; deep underpricing raises churn', () => {
  const s = fresh(); s.apps.product = { features: [{ id: 'f', status: 'shipped' }] }; s.company.website = { text: 'x' };
  ensureMarket(s).cardRequired = true; const withCard = landingConversion(s);
  s.market.cardRequired = false; const noCard = landingConversion(s);
  assert.ok(withCard < noCard * 0.6);
});

test('mail: people reply on their own schedule (vendors fast, investors a business day or more)', async () => {
  const { newState } = await import('../public/core/state.js');
  const { replyDay } = await import('../public/core/mail.js');
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed: 3 });
  const avg = (kind) => { let t = 0; for (let i = 0; i < 400; i++) t += replyDay(s, kind) - s.day; return t / 400; };
  const vendor = avg('vendor'), investor = avg('investor'), candidate = avg('candidate');
  assert.ok(vendor < 0.3, `vendor ${vendor}`);
  assert.ok(investor > 1, `investor ${investor}`);
  assert.ok(candidate < investor);
  const { enqueue, pendingCount } = await import('../public/core/jobs.js');
  s.jobs = [];
  enqueue(s, 'reply:investor', {}, { notBefore: s.day + 2 });
  assert.equal(pendingCount(s), 0); // waits for its day
  s.day += 2;
  assert.equal(pendingCount(s), 1);
});

test('a rejected action refunds its hours, and once-a-week actions report that they are used up', () => {
  const s = fresh();
  const left = hoursLeft(s);
  spendHours(s, 2, 'Co-founder search');
  const entry = s.founder.timeLog.at(-1);
  assert.equal(refundHours(s, entry), true);
  assert.equal(hoursLeft(s), left);
  assert.equal(refundHours(s, entry), false, 'refunds only once');
  assert.equal(browsedThisWeek(s), false);
  browse(s);
  assert.equal(browsedThisWeek(s), true);
  assert.throws(() => browse(s), /already worked the matching platform/);
});
