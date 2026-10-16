// PLG levers, staged access, transactional email and the owned audience: one short test per lever family plus tier separation.
// Short horizons, a few seeds, no long sims (CLAUDE.md iteration-velocity rule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe, activeSubs } from '../public/core/stripe.js';
import { ensureMarket, mainPlan } from '../public/core/market.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { TIER_RANK, readOperator, mistakesSummary } from '../public/core/operator.js';
import { productSlice } from '../public/apps/product/store.js';
import { applyBuildHours } from '../public/apps/product/build.js';
import { addVisitors } from '../public/apps/growth/acquire.js';
import { h01, ensureLifecycle, sendBroadcastNow, lifecycleDay } from '../public/apps/lifecycle/model.js';
import * as PLG from '../public/apps/plg/model.js';
import * as ACC from '../public/apps/plg/access.js';
import * as TX from '../public/apps/emailops/model.js';
import * as AU from '../public/apps/audience/model.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';
import { collectExternal, callExternal } from '../public/apps/automations/integrations.js';
import { APPS } from '../public/apps/registry.js';

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const RANK = ['mediocre', 'average', 'good', 'stellar'];

function world({ seed = 1, model = 'smb', customers = 0, oneLiner = 'Shared boards where teams approve client work' } = {}) {
  const s = newState({ companyName: 'Boardly', model, path: 'indie', founderName: 'Pat', seed });
  s.company.oneLiner = oneLiner; s.company.icp = 'Agency owners running client approvals';
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 80000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Client approvals', status: 'shipped', shippedDay: -30 }], buildQueue: [], bugs: [], changelog: [] };
  s.day = 100;
  for (let i = 0; i < customers; i++) { const c = createCustomer(s, { name: `U${i}`, email: `u${i}@firm${i}.com` }); subscribe(s, c.id, { ...mainPlan(s), trialDays: 0 }, { trial: false, source: 'direct' }); }
  return s;
}
const ship = (s, id) => {
  assert.ok(PLG.queueBuild(s, id).ok, `queue ${id}`);
  const slice = productSlice(s);
  const r = applyBuildHours(slice, 500, { day: s.day });
  assert.ok(r.shipped.length >= 1, 'build ships through the Product queue');
  PLG.syncBuilds(s);
  assert.equal(PLG.getLever(s, id).status, 'built');
};
const tick = (s, apps, days = 1) => { for (let i = 0; i < days; i++) { s.day++; for (const a of apps) a.onDay?.(s); } };

// ---------------- PLG ----------------

test('a lever is a Product feature: queued, shipped by build hours, then configured; system features are not product fit', () => {
  const s = world();
  assert.equal(PLG.queueBuild(s, 'pql').ok, false, 'PQL needs instrumentation first');
  ship(s, 'instrument');
  const f = productSlice(s).features.find((x) => x.plgLever === 'instrument');
  assert.ok(f.system && f.effortHours === 15);
  const fit = ensureMarket(s).fit;
  assert.equal(PLG.configureLever(s, 'instrument', {}).ok, true);
  assert.equal(PLG.getLever(s, 'instrument').status, 'live');
  assert.equal(productSlice(s).features.filter((x) => x.status === 'shipped' && !x.system).length, 1);
  assert.ok((s.apps.insights.featureFlags ?? []).some((x) => x.key === 'plg-instrument'), 'registered as a kill-switch flag');
  assert.ok(fit);
});

const LIMITS = {
  stellar: { meter: 'records', weeksToLimit: 3, placement: 'after_success', warn: true, smallerStep: true, holdout: true, exportBlocked: false, countdown: false, copy: 'You have used 9 of 10 client boards. Unlock unlimited boards and approval reminders with Team: $49 a month, cancel anytime.' },
  good: { meter: 'records', weeksToLimit: 3, placement: 'on_limit_hit', warn: true, smallerStep: false, holdout: false, exportBlocked: false, countdown: false, copy: 'You have reached your limit of 10 boards. Unlock more boards with Team.' },
  average: { meter: 'storage_gb', weeksToLimit: 6, placement: 'every_login', warn: false, smallerStep: false, holdout: false, exportBlocked: false, countdown: false, copy: '' },
  mediocre: { meter: 'storage_gb', weeksToLimit: 1, placement: 'every_login', warn: false, smallerStep: false, holdout: false, exportBlocked: true, countdown: true, copy: 'Hurry! Only 2 hours left to upgrade now! Last chance, limited time offer, upgrade upgrade upgrade upgrade.' },
};
test('usage limits: tiers separate on conversion lift; export blocks and countdowns add churn and cost', () => {
  const out = {};
  for (const tier of RANK) {
    const s = world();
    ship(s, 'limits'); PLG.configureLever(s, 'limits', LIMITS[tier]);
    out[tier] = { e: PLG.limitsEffects(s), q: PLG.getLever(s, 'limits').q, m: mistakesSummary(s) };
  }
  assert.ok(out.stellar.e.lift > out.good.e.lift && out.good.e.lift > out.average.e.lift && out.average.e.lift > out.mediocre.e.lift, JSON.stringify(RANK.map((t) => out[t].e.lift)));
  assert.ok(out.stellar.e.lift >= 0.15 && out.stellar.e.lift <= 0.22, `stellar ${out.stellar.e.lift}`);
  assert.ok(out.good.e.lift >= 0.08 && out.good.e.lift <= 0.14, `good ${out.good.e.lift}`);
  assert.ok(out.average.e.lift < 0.06 && out.mediocre.e.lift <= 0, `avg/med ${out.average.e.lift} ${out.mediocre.e.lift}`);
  assert.ok(out.mediocre.e.churn >= 1.09 && out.stellar.e.churn === 1, 'hard blocks and countdowns cost churn');
  assert.ok(out.mediocre.m.count >= 2 && out.stellar.m.count === 0, 'bad choices are logged, traceable mistakes');
  // the modifier reaches core conversion
  const s = world(); ship(s, 'limits'); PLG.configureLever(s, 'limits', LIMITS.stellar);
  tick(s, APPS.filter((a) => a.id === 'plg'));
  assert.ok(s.market.modifiers.conversion['plg-limits'] > 1.1);
});

test('PQLs: a rule from intent signals hands better-fit leads to the CRM than "any company domain"; instant-all emailing costs', () => {
  const run = (cfg, seed) => {
    const s = world({ seed });
    ship(s, 'instrument'); PLG.configureLever(s, 'instrument', {});
    ship(s, 'pql'); PLG.configureLever(s, 'pql', cfg);
    for (let i = 0; i < 80; i++) { const c = createCustomer(s, { name: `T${i}`, email: `t${i}@co${i}.com` }); subscribe(s, c.id, { ...mainPlan(s), trialDays: 14 }, { source: 'organic:seo' }); }
    tick(s, APPS.filter((a) => a.id === 'plg'), 6);
    const P = s.apps.plg;
    return { fit: P.pqls.length ? mean(P.pqls.map((p) => p.intent)) : 0, n: P.pqls.length, s };
  };
  const good = [1, 2, 3].map((seed) => run({ signals: ['invited_teammates', 'activated_core'], minSignals: 2, sla: 'same_day', firstTouch: 'offer', noticeDisclosed: true }, seed));
  const bad = [1, 2, 3].map((seed) => run({ signals: ['company_domain'], minSignals: 1, sla: 'weekly', firstTouch: 'pitch', noticeDisclosed: false }, seed));
  assert.ok(mean(good.map((x) => x.fit)) > mean(bad.map((x) => x.fit)) + 0.15, `${mean(good.map((x) => x.fit))} vs ${mean(bad.map((x) => x.fit))}`);
  assert.ok(good[0].s.state === undefined && good[0].s.apps.crm.inboundQueue.some((q) => q.source === 'plg:pql'), 'PQLs land in the CRM inbound queue');
  assert.ok(mean(bad.map((x) => x.n)) > mean(good.map((x) => x.n)) * 2, 'a company-domain rule floods the queue');
  const all = run({ signals: ['any_signup'], minSignals: 1, sla: 'same_day', firstTouch: 'instant_all', noticeDisclosed: false }, 1);
  assert.ok(all.s.market.modifiers.conversion['plg-pql-surveillance'] < 1 && mistakesSummary(all.s).byMistake.some((m) => m.id === 'pql_blanket_email'));
});

test('viral loops: K scales with product type and placement; contact-import invites spam the sending domain', () => {
  const k = (oneLiner, cfg) => { const s = world({ customers: 40, oneLiner }); s.company.icp = ''; ship(s, 'invites'); PLG.configureLever(s, 'invites', cfg); return { s, k: PLG.plgK(s) }; };
  const stellar = { placement: 'collab_moment', inviteeValue: true, optIn: true };
  const settings = { placement: 'settings', inviteeValue: false, optIn: true };
  const collab = k('Shared boards where teams approve work', stellar), solo = k('A habit tracker for one person', stellar);
  assert.equal(PLG.plgK(collab.s).type, 'collab');
  assert.ok(collab.k.total > solo.k.total * 2, `${collab.k.total} vs ${solo.k.total}`);
  assert.ok(collab.k.total > k('Shared boards where teams approve work', settings).k.total * 1.5);
  assert.ok(collab.k.cycleDays < k('Shared boards where teams approve work', settings).k.cycleDays);
  assert.ok(collab.k.capped <= 0.85);
  const spam = k('Shared boards where teams approve work', { placement: 'contacts_import', inviteeValue: false, optIn: false });
  assert.ok(mistakesSummary(spam.s).byMistake.some((m) => m.id === 'contact_import_invites'));
  // viral signups arrive through acquire()
  const before = collab.s.stripe.subscriptions.length;
  tick(collab.s, APPS.filter((a) => a.id === 'plg'), 60);
  assert.ok(collab.s.stripe.subscriptions.length > before && collab.s.stripe.subscriptions.some((x) => x.source === 'organic:viral'));
});

test('content: thin programmatic pages are demoted at a core update; unique pages are not; pruning shortens recovery', () => {
  const day = (() => { const sd = PLG.ensurePlg(world()).seed; for (let d = 100; d < 3000; d++) if (h01(`gcore|${sd}|${d}`) < 3.3 / 365 && h01(`gpen|${sd}|${d}`) < 0.7) return d; })();
  const build = (dataSource, anonymised) => { const s = world(); ship(s, 'pseo'); PLG.configureLever(s, 'pseo', { pages: 500, dataSource, anonymised, review: true }); s.day = day - 1; PLG.plgDay(s); s.day = day; PLG.plgDay(s); return s; };
  const thin = build('swapped_names', false), good = build('product_data', true);
  assert.ok(thin.apps.plg.seo.until > thin.day, 'thin pages demoted');
  assert.ok(good.apps.plg.seo.until == null || good.apps.plg.seo.until <= good.day, 'unique pages held');
  assert.ok(mistakesSummary(thin).byMistake.some((m) => m.id === 'thin_pseo_demoted') && mistakesSummary(thin).circles >= 1);
  assert.ok(good.apps.plg.pages.filter((p) => p.top10).length > thin.apps.plg.pages.filter((p) => p.top10).length * 1.5, 'unique pages rank more often');
  const left = thin.apps.plg.seo.until - thin.day;
  PLG.prunePages(thin);
  assert.ok(thin.apps.plg.seo.until - thin.day < left);
});

test('expansion: a good setup adds MRR; bill shock costs; free tool without tested maths becomes a public correction', () => {
  const run = (cfg) => { const s = world({ customers: 60 }); ship(s, 'expansion'); PLG.configureLever(s, 'expansion', cfg); for (let m = 0; m < 6; m++) { s.day += 30; PLG.plgMonthEnd(s); } return s; };
  const good = run({ triggers: ['seat_limit', 'teammate_invited', 'usage_threshold', 'feature_gate'], showROI: true, alertsToSales: true, oneClickDowngrade: true, prorateAnnual: true, surpriseOverage: false });
  const bad = run({ triggers: ['seat_limit'], showROI: false, alertsToSales: false, oneClickDowngrade: false, prorateAnnual: false, surpriseOverage: true });
  assert.ok(good.apps.plg.stats.expansionMrr > bad.apps.plg.stats.expansionMrr, `${good.apps.plg.stats.expansionMrr} vs ${bad.apps.plg.stats.expansionMrr}`);
  assert.ok(mistakesSummary(bad).byMistake.some((m) => m.id === 'bill_shock') && bad.market.modifiers.churn['plg-expansion'] > 1);
  const t = world(); ship(t, 'free_tool');
  assert.ok(PLG.scoreLever(t, 'free_tool', { kind: 'calculator', gate: 'detail_report', mathReviewed: true, disclaimer: true, methodShown: true, proprietaryData: true }).q > PLG.scoreLever(t, 'free_tool', { kind: 'calculator', gate: 'result', mathReviewed: false }).q + 0.6);
});

test('PLG operator read: unknown until a lever is live, then tiers and coaching', () => {
  assert.equal(readOperator(world(), 'plg').tier, 'unknown');
  const reads = RANK.map((tier) => { const s = world(); ship(s, 'instrument'); if (tier !== 'mediocre') PLG.configureLever(s, 'instrument', {}); else { PLG.getLever(s, 'instrument').status = 'live'; PLG.getLever(s, 'instrument').q = 1; } ship(s, 'limits'); PLG.configureLever(s, 'limits', LIMITS[tier]); return readOperator(s, 'plg'); });
  assert.ok(TIER_RANK[reads[3].tier] > TIER_RANK[reads[0].tier], reads.map((r) => `${r.tier}:${r.score}`).join(' '));
  assert.ok(reads[0].coaching.some((c) => /stellar operator/.test(c)));
  assert.ok(OPERATOR_TIERS.plg && OPERATOR_TIERS.transactional_email && OPERATOR_TIERS.owned_audience);
});

// ---------------- Staged access ----------------

test('launch mode: waitlist holds signups, decays, floods and qualifies; invite-only needs codes', async () => {
  const { acquire } = await import('../public/apps/growth/acquire.js');
  const mk = (mode, opts = {}) => { const s = world(); ACC.setLaunchMode(s, mode, opts); acquire(s, { source: 'organic:seo', n: 100 }); return s; };
  const w = mk('waitlist', { qualify: true, batch: 20 });
  assert.equal(w.stripe.subscriptions.length, 0, 'nobody admitted without a release');
  assert.equal(Math.floor(w.apps.plg.access.waiting.n), 100);
  const open = mk('open'); assert.equal(open.stripe.subscriptions.length, 100, 'open signup admits everyone');
  // never releasing: the list goes cold and the mistake is logged
  for (let d = 0; d < 40; d++) { w.day++; ACC.accessDay(w); }
  assert.ok(w.apps.plg.access.waiting.n < 80 && mistakesSummary(w).byMistake.some((m) => m.id === 'waitlist_never_released'));
  // qualified small cohort vs flood
  const a = mk('waitlist', { qualify: true }), b = mk('waitlist', { qualify: false });
  const ra = ACC.releaseBatch(a, { n: 30 }), rb = ACC.releaseBatch(b, { n: 100 });
  assert.ok(ra.hoursCost > rb.hoursCost - 5 && ra.hoursCost >= 30 * ACC.ACCESS.review, 'qualifying costs founder review time');
  assert.ok(b.apps.plg.access.cohorts[0].overload && mistakesSummary(b).byMistake.some((m) => m.id === 'release_flood'));
  assert.ok(a.apps.plg.access.cohorts[0].quality > b.apps.plg.access.cohorts[0].quality);
  a.day += 20; assert.ok(ACC.debriefCohort(a, 'coh_1').ok); ACC.accessDay(a);
  assert.ok(a.market.modifiers.conversion['plg-cohort-learning'] > 1);
  const inv = mk('invite'); assert.equal(ACC.releaseBatch(inv).ok, false);
  ACC.issueCodes(inv, 20); inv.day += 5; ACC.accessDay(inv);
  assert.ok(inv.stripe.subscriptions.length >= 10 && inv.stripe.subscriptions.length <= 14);
});

// ---------------- Transactional email ----------------

function txWorld(seed = 1) {
  const s = world({ seed, model: 'b2c' });
  s.apps.support = { active: true, queue: [], tickets: [] };
  return s;
}
const txApps = () => APPS.filter((a) => ['transactional', 'lifecycle'].includes(a.id));
function signups(s, n) { for (let i = 0; i < n; i++) { const c = createCustomer(s, { name: 'x', email: `x${s.day}_${i}@gmail.com` }); subscribe(s, c.id, { ...mainPlan(s), trialDays: 14 }, { source: 'organic:seo' }); } }

test('transactional: a marketing blast on a shared domain pushes login mail to spam; a separate subdomain protects it', () => {
  const run = (separate) => {
    const s = txWorld(3);
    const L = ensureLifecycle(s); L.vendor = 'customerio'; L.domain = { spf: true, dkim: true, dmarc: true, reputation: 70 };
    TX.setProvider(s, 'postmark');
    if (separate) { TX.separateStreams(s); for (const r of ['spf', 'dkim', 'dmarc']) TX.addRecord(s, r); }
    else for (const r of ['spf', 'dkim', 'dmarc']) TX.addRecord(s, r);
    for (let d = 0; d < 20; d++) { s.day++; signups(s, 30); for (const a of txApps()) a.onDay?.(s); }
    const d0 = TX.ensureTxn(s).delivery;
    // an everyone-blast of discount mail to the list: complaints pull the domain reputation down
    for (let i = 0; i < 4; i++) { s.day++; sendBroadcastNow(s, { subject: 'LIMITED TIME 40% OFF!!!', body: 'Upgrade now and save 40% off with promo code SAVE. Limited time offer, act now! https://x.co', segment: 'all' }); }
    for (let d = 0; d < 25; d++) { s.day++; signups(s, 30); for (const a of txApps()) a.onDay?.(s); }
    return { d0, d1: TX.ensureTxn(s).delivery, tickets: s.apps.support.queue.reduce((a, q) => a + (q.source === 'txn_lockout' ? q.n : 0), 0), s };
  };
  const shared = run(false), sep = run(true);
  assert.ok(shared.d1 < shared.d0 - 0.05, `shared delivery fell ${shared.d0} -> ${shared.d1}`);
  assert.ok(sep.d1 > shared.d1 + 0.05, `separate ${sep.d1} vs shared ${shared.d1}`);
  assert.ok(shared.tickets > sep.tickets, `lockout tickets ${shared.tickets} vs ${sep.tickets}`);
});

test('transactional: a broken login-mail setup loses signups even without a lifecycle email tool', () => {
  const run = (good) => {
    const s = txWorld(4);
    TX.setProvider(s, good ? 'postmark' : 'ses'); // SES with no DNS records and no bounce wiring
    if (good) { TX.separateStreams(s); for (const r of ['spf', 'dkim', 'dmarc']) TX.addRecord(s, r); }
    for (let d = 0; d < 15; d++) { s.day++; signups(s, 20); for (const a of txApps()) a.onDay?.(s); }
    assert.equal(ensureLifecycle(s).vendor, null);
    return ensureLifecycle(s).stats.transactionalLost ?? 0;
  };
  const bad = run(false), good = run(true);
  assert.ok(bad > 5, `lost activations from login mail in spam: ${bad}`);
  assert.ok(good < bad / 3, `good ${good} vs bad ${bad}`);
});

test('transactional: templates need the required fields; missing trial notices become refunds, disputes and legal exposure', () => {
  assert.ok(TX.lintTemplate('receipt', TX.TEMPLATES.receipt.starter).q > 0.9);
  assert.ok(TX.lintTemplate('receipt', { subject: 'Thanks!', body: 'Thanks for your payment. 20% off your next upgrade!' }).q < 0.2);
  assert.ok(TX.lintTemplate('trial_ending', { ...TX.TEMPLATES.trial_ending.starter, sendDays: [1] }).q < TX.lintTemplate('trial_ending', { ...TX.TEMPLATES.trial_ending.starter, sendDays: [7, 1] }).q);
  assert.ok(TX.lintTemplate('magic_link', { subject: 'x', body: 'Sign in: {{magicUrl}}. Valid for 24 hours, once.' }).issues.length);
  const run = (publish) => {
    const s = txWorld(5); ensureMarket(s).cardRequired = true;
    TX.setProvider(s, 'postmark'); s.recurring = s.recurring ?? [];
    for (const r of ['spf', 'dkim', 'dmarc']) TX.addRecord(s, r);
    TX.separateStreams(s); for (const r of ['spf', 'dkim', 'dmarc']) TX.addRecord(s, r);
    if (publish) { TX.saveTemplate(s, 'trial_ending', { ...TX.TEMPLATES.trial_ending.starter, sendDays: [7, 1] }); assert.ok(TX.publishTemplate(s, 'trial_ending', { approved: true }).ok); }
    s.apps.lifecycle = ensureLifecycle(s);
    for (let d = 0; d < 60; d++) { s.day++; signups(s, 3); for (const sub of s.stripe.subscriptions) if (sub.status === 'trialing' && s.day >= sub.trialEndDay) { sub.status = 'active'; sub.firstPaidDay = s.day; sub.paidMonths = 1; s.stripe.charges.push({ id: `ch${sub.id}`, subId: sub.id, customerId: sub.customerId, day: s.day, status: 'succeeded', amount: sub.price }); } for (const a of txApps()) a.onDay?.(s); }
    return TX.ensureTxn(s).stats;
  };
  const without = run(false), withN = run(true);
  assert.ok(without.noticeMisses > 20 && withN.noticeMisses === 0, `${without.noticeMisses} vs ${withN.noticeMisses}`);
  assert.ok(without.refunds + without.disputes > 0);
});

test('transactional: tiers separate on delivery and the operator read', () => {
  const setup = (tier) => {
    const s = txWorld(2); const L = ensureLifecycle(s); L.vendor = 'loops'; L.domain = { spf: true, dkim: tier !== 'mediocre', dmarc: tier === 'stellar' || tier === 'good', reputation: tier === 'mediocre' ? 30 : 70 };
    TX.setProvider(s, tier === 'mediocre' ? 'sendgrid' : 'postmark');
    if (tier === 'stellar' || tier === 'good') { TX.separateStreams(s); for (const r of ['spf', 'dkim', 'dmarc']) TX.addRecord(s, r); }
    if (tier === 'average') for (const r of ['spf', 'dkim']) TX.addRecord(s, r);
    if (tier === 'stellar') { TX.setFallback(s, true); TX.setMonitoring(s, true); TX.seedTest(s); for (const id of TX.TEMPLATE_IDS) { TX.saveTemplate(s, id, { ...TX.TEMPLATES[id].starter, sendDays: id === 'trial_ending' ? [7, 1] : id === 'renewal_notice' ? [30, 14] : undefined }); TX.publishTemplate(s, id); } TX.legalReview(s, 'receipt'); }
    if (tier === 'good') { for (const id of ['receipt', 'failed_payment', 'trial_ending']) { TX.saveTemplate(s, id, { ...TX.TEMPLATES[id].starter, sendDays: [7, 1] }); TX.publishTemplate(s, id); } }
    TX.txnDay(s);
    return s;
  };
  const out = RANK.map((t) => { const s = setup(t); return { d: TX.ensureTxn(s).delivery, r: readOperator(s, 'transactional_email') }; });
  for (let i = 1; i < 4; i++) { assert.ok(out[i].d >= out[i - 1].d - 1e-9, `delivery ${out.map((o) => o.d.toFixed(2))}`); assert.ok(out[i].r.score > out[i - 1].r.score, `read ${out.map((o) => o.r.score)}`); }
  assert.equal(out[3].r.tier, 'stellar'); assert.equal(out[0].r.tier, 'mediocre');
  assert.ok(out[3].d >= 0.9 && out[0].d < 0.7, `${out[3].d} ${out[0].d}`);
  assert.equal(readOperator(txWorld(), 'transactional_email').tier, 'unknown');
});

// ---------------- Owned audience ----------------

const ISSUE_GOOD = { subject: 'What 40 client approvals taught us', body: Array.from({ length: 24 }, (_, i) => `Week ${i + 1}: we tracked 3 approvals, 12 comments and 5 reminders across 40 client boards; the median approval took 2.5 days and the fastest took 6 hours.`).join(' ') + ' If you want the template we use, reply and ask.' };
const ISSUE_GENERIC = { subject: 'NEWSLETTER!!!', body: 'Hello everyone. Here is some news. We are great. Buy now, upgrade today, start your free trial, book a demo, 20% off discount limited. Sign up for the best product, upgrade now.' };
const MAGNET = { title: 'Client approval checklist for agency owners', kind: 'checklist', body: 'A 12-step approvals checklist for agency owners running client boards with approval reminders.' };

function audWorld(tier, seed = 1) {
  const s = world({ seed, model: 'b2c' });
  s.founder.hoursPerWeek = 400;
  AU.setupList(s, tier === 'mediocre' ? 'substack' : 'kit');
  const A = AU.ensureAudience(s);
  if (tier === 'stellar') { AU.setCompliance(s, { consent: 'logged', address: true, oneClick: true, honor: 'auto', preference: true, fromProductDomain: false }); const m = AU.createMagnet(s, MAGNET).magnet; AU.addForm(s, { type: 'landing', fields: 1, optin: 'double', magnetId: m.id }); }
  else if (tier === 'good') { AU.setCompliance(s, { consent: 'checkbox', address: true, oneClick: true, honor: 'auto' }); const m = AU.createMagnet(s, MAGNET).magnet; AU.addForm(s, { type: 'popup', fields: 2, optin: 'single', magnetId: m.id }); }
  else if (tier === 'average') { AU.setCompliance(s, { consent: 'none', address: false, honor: 'auto' }); AU.addForm(s, { type: 'footer', fields: 3, optin: 'single', magnetId: null }); }
  else { AU.setCompliance(s, { consent: 'none', address: false, honor: 'manual' }); AU.addForm(s, { type: 'footer', fields: 1, optin: 'single' }); AU.purchaseList(s, { n: 3000 }); }
  return { s, A };
}
function audRun(tier, seed) {
  const { s } = audWorld(tier, seed);
  for (let d = 0; d < 84; d++) {
    s.day++; addVisitors(s, 400);
    if (s.day % 7 === 0 && d < 80) {
      const every = { stellar: 1, good: 1, average: 3, mediocre: 1 }[tier];
      if (tier === 'mediocre') for (let k = 0; k < 3; k++) AU.sendIssue(s, { ...ISSUE_GENERIC, kind: 'launch', segment: 'all' });
      else if (Math.floor(d / 7) % every === 0) AU.sendIssue(s, { ...(tier === 'average' ? ISSUE_GENERIC : ISSUE_GOOD), kind: 'value', segment: tier === 'stellar' ? 'engaged' : 'all' });
    }
    if (tier === 'stellar' && d === 50) AU.sunset(s);
    AU.audienceDay(s);
  }
  return s;
}
test('audience: purchased list, no consent and manual opt-outs cost; the list size feeds founder.network.newsletter', () => {
  const s = world(); s.founder.network.newsletter = 500;
  AU.setupList(s, 'kit'); AU.audienceDay(s);
  assert.equal(s.founder.network.newsletter, 500, 'the list you brought is the starting list');
  const c0 = AU.ensureAudience(s).cohorts[0];
  assert.equal(c0.consent, 'unknown'); assert.ok(c0.engaged < 0.4);
  AU.purchaseList(s, { n: 4000 });
  AU.audienceDay(s);
  assert.equal(s.founder.network.newsletter, Math.round(AU.totalActive(AU.ensureAudience(s))));
  assert.ok(s.founder.network.newsletter > 4000);
  assert.ok(mistakesSummary(s).byMistake.some((m) => m.id === 'purchased_list'));
  s.founder.network.newsletter = 800; AU.audienceDay(s);
  assert.equal(s.founder.network.newsletter, Math.round(AU.totalActive(AU.ensureAudience(s))), 'a Settings edit is absorbed into the list');
});
test('audience: forms and double opt-in follow the researched trade-offs; sponsors need engaged readers and disclosure', () => {
  const s = world({ model: 'b2c' }); AU.setupList(s, 'kit');
  const m = AU.createMagnet(s, MAGNET).magnet;
  const g = AU.createMagnet(s, { title: 'The ultimate guide to everything', kind: 'checklist', body: 'Everything you need to know, top 10 secrets.' }).magnet;
  assert.ok(m.q > g.q + 0.2);
  const rate = (f) => { const A = AU.ensureAudience(s); A.forms.push({ id: 'ft', fields: 1, optin: 'single', n: 0, ...f }); return AU.audienceMetrics && (f.magnetId ? A.magnets.find((x) => x.id === f.magnetId).q : 0); };
  AU.addForm(s, { type: 'landing', fields: 1, optin: 'single', magnetId: m.id }); AU.addForm(s, { type: 'landing', fields: 3, optin: 'double', magnetId: m.id });
  const [a, b] = AU.ensureAudience(s).forms;
  const sub = (f) => { const t = world({ model: 'b2c' }); AU.setupList(t, 'kit'); const mm = AU.createMagnet(t, MAGNET).magnet; AU.addForm(t, { ...f, magnetId: mm.id }); addVisitors(t, 20000); t.day++; AU.audienceDay(t); return AU.totalActive(AU.ensureAudience(t)); };
  assert.ok(sub({ type: 'landing', fields: 1, optin: 'single' }) > sub({ type: 'landing', fields: 3, optin: 'double' }) * 3, 'single opt-in with one field gets many more signups');
  assert.ok(a && b && rate({}) === 0);
  assert.equal(AU.queueSponsor(s, {}).ok, false, 'too small for sponsors');
});
test('audience: tiers separate on engagement, complaints, trials from the list, mistakes and the operator read', () => {
  const out = {};
  for (const tier of RANK) {
    const runs = [1, 2].map((seed) => audRun(tier, seed));
    out[tier] = { eng: mean(runs.map((s) => AU.audienceMetrics(s).engagedShare)), comp: mean(runs.map((s) => AU.audienceMetrics(s).complaintRate ?? 0)), trials: mean(runs.map((s) => s.stripe.subscriptions.filter((x) => x.source === 'organic:list').length / Math.max(1, s.apps.audience.stats.subs) * 1000)), mis: mean(runs.map((s) => mistakesSummary(s).count)), read: runs.map((s) => readOperator(s, 'owned_audience')) };
  }
  assert.ok(out.stellar.eng > out.good.eng && out.good.eng > out.average.eng && out.average.eng > out.mediocre.eng, JSON.stringify(RANK.map((t) => +out[t].eng.toFixed(2))));
  assert.ok(out.mediocre.comp > 3 * out.stellar.comp && out.mediocre.comp >= 0.003, `${out.mediocre.comp} vs ${out.stellar.comp}`);
  assert.ok(out.stellar.trials > out.average.trials && out.stellar.trials > out.mediocre.trials, JSON.stringify(RANK.map((t) => out[t].trials)));
  assert.ok(out.mediocre.mis > out.stellar.mis + 2);
  if (process.env.DBG) for (const t of RANK) console.log(t, out[t].read.map((r) => `${r.tier} ${r.score} ${r.raw}`), out[t].eng.toFixed(2), out[t].comp, out[t].trials);
  const rank = (t) => mean(out[t].read.map((r) => TIER_RANK[r.tier]));
  assert.ok(rank('stellar') > rank('good') && rank('good') > rank('average') && rank('average') > rank('mediocre') && rank('stellar') > rank('mediocre'), RANK.map((t) => rank(t)).join(','));
  assert.ok(out.mediocre.read.every((r) => r.coaching.length));
  assert.equal(readOperator(world(), 'owned_audience').tier, 'unknown');
});

// ---------------- Automations ----------------

test('automations: stable event ids, dry runs, and approval for customer-facing actions', () => {
  const s = world(); ship(s, 'instrument'); PLG.configureLever(s, 'instrument', {});
  const ev = collectExternal(s, 'plg_lever_live', 0);
  assert.equal(ev.length, 1); assert.match(ev[0].ref, /^lever_live:instrument:/);
  assert.equal(collectExternal(s, 'plg_lever_live', 0)[0].ref, ev[0].ref, 'stable id');
  const t = txWorld(); TX.setProvider(t, 'postmark'); TX.saveTemplate(t, 'receipt', TX.TEMPLATES.receipt.starter);
  const step = { type: 'transactional_publish_template', params: { templateId: 'receipt' } };
  assert.equal(callExternal(t, step, { raw: {} }, { approved: false }).ok, false, 'needs approval');
  assert.equal(callExternal(t, step, { raw: {} }, { approved: true, dryRun: true }).ok, true);
  assert.equal(TX.ensureTxn(t).templates.receipt.status, 'draft', 'dry run changes nothing');
  assert.equal(callExternal(t, step, { raw: {} }, { approved: true }).ok, true);
  const a = world({ model: 'b2c' }); AU.setupList(a, 'kit');
  const send = { type: 'audience_send_issue', params: { subject: 'Hi', body: ISSUE_GOOD.body } };
  assert.equal(callExternal(a, send, { raw: {}, label: 'x' }, { approved: false }).ok, false);
  assert.equal(callExternal(a, send, { raw: {}, label: 'x' }, { approved: true }).ok, true);
});

test('launch to the list: buyers come from the research bands once, the launch email does not convert them a second time', () => {
  const s = world({ model: 'b2c' });
  AU.setupList(s, 'kit');
  AU.addSubscribers(s, 4000, { key: 'form:x', source: 'form', engaged: 0.8, fit: 0.8, consent: 'express' });
  const before = s.stripe.subscriptions.filter((x) => x.source === 'organic:list').length;
  const r = AU.launchToList(s, { subject: 'We are live', body: ISSUE_GOOD.body, waves: 1 });
  assert.ok(r.ok && r.signups > 0, `signups ${r.signups}`);
  const after = s.stripe.subscriptions.filter((x) => x.source === 'organic:list').length;
  assert.equal(after - before, r.signups);
  assert.equal(r.issue.stats.conv, 0);
});

test('switching a waitlist to open signup admits the people still waiting instead of dropping them', async () => {
  const { acquire } = await import('../public/apps/growth/acquire.js');
  const s = world();
  ACC.setLaunchMode(s, 'waitlist', { qualify: true });
  acquire(s, { source: 'organic:seo', n: 40 });
  for (let d = 0; d < 10; d++) { s.day++; ACC.accessDay(s); }
  const waiting = Math.floor(s.apps.plg.access.waiting.n);
  assert.ok(waiting > 30 && waiting < 40, `decayed while waiting: ${waiting}`);
  ACC.setLaunchMode(s, 'open');
  assert.equal(s.stripe.subscriptions.filter((x) => x.source === 'organic:seo').length, waiting);
  assert.equal(s.apps.plg.access.waiting.n, 0);
});

test('switching newsletter platform bills under the new vendor', () => {
  const s = world();
  AU.setupList(s, 'kit');
  AU.addSubscribers(s, 3000, { key: 'form:x', source: 'form' });
  AU.setupList(s, 'beehiiv');
  const r = s.recurring.find((x) => x.id === s.apps.audience.billId);
  assert.equal(r.vendor, 'beehiiv');
});
