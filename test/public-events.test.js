// Public events (core/network.js recordPublicEvent) drive inbound-archetype trigger boosts
// (data/inbound-archetypes.js `triggers`). A trigger nobody records is a dead boost: this file checks that the real
// actions record their event exactly once, and that every trigger type is either recorded somewhere or explicitly
// listed as not modelled in the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket, mainPlan } from '../public/core/market.js';
import { isWeekend, uid } from '../public/core/util.js';
import { recordPublicEvent, ensureNetwork, archetypeDailyRate } from '../public/core/network.js';
import { INBOUND_ARCHETYPES } from '../public/data/inbound-archetypes.js';
import { launchProductHunt, publishPost } from '../public/apps/growth/organicEngine.js';
import { setWebsite } from '../public/apps/website.js';
import { scheduleIncrease } from '../public/apps/channels/pricing-sim.js';
import { ensureOutreach, addContact } from '../public/apps/sales/model.js';
import { outreachDay } from '../public/apps/sales/engine.js';
import { openRound } from '../public/apps/fundraising/sim.js';

function fresh(model = 'smb', seed = 7) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] };
  s.company.oneLiner = 'Automated bookkeeping reconciliation for dental clinics';
  s.company.icp = 'Owners of independent dental clinics with 2-10 dentists';
  s.market.flags = { fixedDemand: 1 };
  return s;
}
const events = (s, type) => (s.network?.publicEvents ?? []).filter((e) => e.type === type);

test('Product Hunt launch records product_hunt_launch once and boosts the upvote sellers', () => {
  const s = fresh();
  const a = INBOUND_ARCHETYPES.find((x) => x.id === 'launch_upvote_seller');
  const before = archetypeDailyRate(s, a);
  launchProductHunt(s, { tagline: 't', description: 'd', firstComment: 'c', weekend: false, skill: 0.5, judge: {} });
  assert.equal(events(s, 'product_hunt_launch').length, 1);
  assert.ok(archetypeDailyRate(s, a) > before * 10, 'the trigger boost is live');
});

test('website goes live once: the first page records website_live, later versions do not', () => {
  const s = fresh();
  setWebsite(s, { source: 'paste', title: 'Ledgerly', text: 'Reconcile deposits in minutes.' });
  s.day += 3;
  setWebsite(s, { source: 'paste', title: 'Ledgerly v2', text: 'Reconcile deposits in minutes. Book a demo.' });
  assert.equal(events(s, 'website_live').length, 1);
  assert.equal(s.company.website.title, 'Ledgerly v2');
});

test('a price increase records price_change once (and a botched one a controversy)', () => {
  const s = fresh();
  const plan = mainPlan(s);
  scheduleIncrease(s, { planId: plan.id, newPrice: plan.price * 1.3, noticeDays: 45, grandfatherMonths: 6, lockIn: true, valueAdded: true, comms: { quality: 0.8 }, alsoNewCustomers: false });
  assert.equal(events(s, 'price_change').length, 1);
  assert.equal(events(s, 'controversy').length, 0, 'a well-run increase is not a controversy');
  const t = fresh('smb', 8);
  const p2 = mainPlan(t);
  scheduleIncrease(t, { planId: p2.id, newPrice: p2.price * 1.5, noticeDays: 0, grandfatherMonths: 0, lockIn: false, valueAdded: false, comms: { quality: 0.1 }, alsoNewCustomers: true });
  assert.equal(events(t, 'controversy').length, 1);
});

test('cold sequence first touches record outbound_sent once per day, not per email', () => {
  const s = fresh();
  while (isWeekend(s)) s.day++;
  const o = ensureOutreach(s);
  o.sequencer = true;
  o.domains.push({ id: 'dom1', name: 'getledgerly.com', auth: { spf: true, dkim: true, dmarc: true }, reputation: 70, log: [] });
  o.inboxes.push({ id: 'ib1', domainId: 'dom1', address: 'pat@getledgerly.com', warmupStartDay: s.day - 60, dailyLimit: 'auto', paused: false, sentTotal: 0 });
  const q = { id: uid('seq'), name: 'Test', steps: [{ id: 'st1', subject: 'hi', body: 'Hi {{firstName}}, worth a look?', delayDays: 0 }], status: 'active', trackOpens: false, inboxIds: [], judge: {}, stats: { sent: 0, bounced: 0, inboxed: 0, opens: 0, complaints: 0, replies: 0, positive: 0 } };
  o.sequences.push(q);
  for (let i = 0; i < 5; i++) {
    const { contact } = addContact(s, { firstName: `A${i}`, lastName: 'Lee', email: `a${i}@clinic${i}.com`, company: `Clinic ${i}`, domain: `clinic${i}.com` });
    o.enrollments.push({ id: `enr${i}`, sequenceId: q.id, contactId: contact.id, step: 0, nextDay: s.day, status: 'active', sent: [], inboxId: null });
  }
  outreachDay(s);
  assert.ok(q.stats.sent >= 2, `sent ${q.stats.sent}`);
  const ev = events(s, 'outbound_sent');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].meta.firstTouches, q.stats.sent);
});

test('a post sharing real revenue records revenue_milestone_posted; a plain post only build_in_public_post', () => {
  const s = fresh();
  const c = createCustomer(s, { name: 'Smile Dental', email: 'ops@smile.example' });
  subscribe(s, c.id, mainPlan(s), { trial: false });
  publishPost(s, { platform: 'x', text: 'Shipped bank-feed matching for dental clinics today.', skill: 0.6, judge: {} });
  assert.equal(events(s, 'build_in_public_post').length, 1);
  assert.equal(events(s, 'revenue_milestone_posted').length, 0);
  s.day += 1;
  publishPost(s, { platform: 'x', text: 'Month 4 update: we just crossed $1.2k MRR from 25 clinics.', skill: 0.6, judge: {} });
  assert.equal(events(s, 'revenue_milestone_posted').length, 1);
  assert.ok(events(s, 'revenue_milestone_posted')[0].meta.mrr > 0);
  // No revenue yet: the same words are not a revenue milestone.
  const t = fresh('smb', 9);
  publishPost(t, { platform: 'x', text: 'Goal: $10k MRR by summer.', skill: 0.6, judge: {} });
  assert.equal(events(t, 'revenue_milestone_posted').length, 0);
});

test('opening a round records fundraise_started once', () => {
  const s = fresh();
  openRound(s, { stage: 'pre-seed', instrument: 'safe', target: 500000, cap: 8e6, discount: 0, mfn: false, months: 4 });
  assert.equal(events(s, 'fundraise_started').length, 1);
  assert.throws(() => openRound(s, { stage: 'pre-seed', instrument: 'safe', target: 500000 }), /already/);
  assert.equal(events(s, 'fundraise_started').length, 1);
});

test('recordPublicEvent: same type the same day coalesces; frequent events never push out a rare one', () => {
  const s = fresh();
  recordPublicEvent(s, 'funding_announced', { amount: 1e6 });
  recordPublicEvent(s, 'blog_post_published', {});
  recordPublicEvent(s, 'blog_post_published', {});
  assert.equal(events(s, 'blog_post_published').length, 1);
  assert.equal(events(s, 'blog_post_published')[0].count, 2);
  for (let d = 1; d <= 100; d++) { s.day++; for (const t of ['blog_post_published', 'build_in_public_post', 'outbound_sent', 'event_attended']) recordPublicEvent(s, t, {}); }
  assert.ok(ensureNetwork(s).publicEvents.length <= 300);
  assert.equal(events(s, 'funding_announced').length, 1, 'the funding round is still inside its trigger window');
});

// ---------------- every trigger is either recorded or explicitly not modelled ----------------

// Trigger types with no corresponding action in the game (yet). Recording them would mean inventing a feature.
const NOT_MODELLED = new Set([
  'stripe_connected', // Stripe exists from day one; there is no "connect Stripe to a third-party tool" action
  'product_hunt_scheduled', // Product Hunt launches happen immediately; there is no scheduled/"coming soon" page
  'pitch_deck_shared_publicly', // decks go to investors as attachments or tracked links, never posted publicly
  'customer_case_study', // no action publishes a customer case study
  'api_launched', // no public API / developer platform launch
  'data_report_published', // no original data report / survey publishing action
]);

function jsFiles(dir) {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : []; });
}

test('every inbound trigger type is recorded somewhere in public/ or on the not-modelled allowlist', () => {
  const recorded = new Set();
  for (const f of jsFiles('public')) {
    for (const m of readFileSync(f, 'utf8').matchAll(/recordPublicEvent\(\s*\w+\s*,\s*'([a-z_]+)'/g)) recorded.add(m[1]);
  }
  const triggers = new Set(INBOUND_ARCHETYPES.flatMap((a) => a.triggers ?? []));
  const dead = [...triggers].filter((t) => !recorded.has(t) && !NOT_MODELLED.has(t));
  assert.deepEqual(dead, [], `trigger types never recorded: ${dead.join(', ')}`);
  const stale = [...NOT_MODELLED].filter((t) => recorded.has(t) || !triggers.has(t));
  assert.deepEqual(stale, [], `allowlist entries that are now recorded or no longer used: ${stale.join(', ')}`);
});

test('deal scenarios tied to a deal size only roll inside their band (no $25k security questionnaire on a $588 deal)', async () => {
  const { rollScenarios } = await import('../public/apps/sales/segments.js');
  const { getSegment } = await import('../public/data/buyer-segments.js');
  const seg = getSegment('startup_smb');
  const always = () => 0; // every scenario's probability check passes
  const small = rollScenarios(seg, always, 588).map((x) => x.id);
  const big = rollScenarios(seg, always, 60000).map((x) => x.id);
  assert.ok(!small.includes('security_q_25k') && !small.includes('champion_leaves'), small.join());
  assert.ok(big.includes('security_q_25k') && big.includes('champion_leaves'), big.join());
  const gov = getSegment('federal_gov') ?? null;
  if (gov) {
    const ids = (acv) => rollScenarios(gov, always, acv).map((x) => x.id);
    if (gov.scenarios.some((x) => x.id === 'micro_purchase')) assert.ok(ids(5000).includes('micro_purchase') && !ids(50000).includes('micro_purchase'));
  }
});
