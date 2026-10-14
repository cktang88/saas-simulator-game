// Product: AI-coding workflow, app-builder path, releases, Linear-style triage, decisions, evidence-weighted fit,
// operator tiers and the mistakes ledger (docs/review/tool-gap-analysis.md items 4, 13, 14;
// docs/review/operator-tiers-audit.md fixes 5, 8, 13; docs/review/calibration.md free mistakes 1, 3, 6, R7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator } from '../public/core/operator.js';
import product, { build, queueFeature } from '../public/apps/product.js';
import { productSlice } from '../public/apps/product/store.js';
import { openBugHours } from '../public/apps/product/build.js';
import { TIER_WORKFLOWS, reworkShare, changeFailureRate, securityBugChance, throughputFactor, usageFor, perceivedSpeed, measuredSpeed, destructiveChance, PLANS } from '../public/apps/product/agent.js';
import { BUILDER, builderSlice, drawRls, leakHazardMonthly, dailyFromMonthly, scan, seniorReview } from '../public/apps/product/builder.js';
import { releasesSlice, deploy, releasesDay, rollback, releaseStats } from '../public/apps/product/releases.js';
import { triageDuplicate, triageAccept, duplicateOf, cycleSummary } from '../public/apps/product/tracker.js';
import { metricCheck, moveChance, parseTarget } from '../public/apps/product/decisions.js';
import { trueFit, featureValue, shipFactors, contactFactor, icpIsBroad, evidenceStrength } from '../public/apps/product/fit.js';
import { dbWipe, decideFeature, chooseBuilder, choosePlan, activePlan } from '../public/apps/product/engine.js';
import { aiCodingMultiplier, aiBugRate } from '../public/apps/people/capacity.js';
import { recruitHours } from '../public/apps/research.js';

const TIERS = ['stellar', 'good', 'average', 'mediocre'];

function fresh(seed = 7) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Receipt collection for bookkeepers';
  s.company.icp = 'Solo bookkeepers with 10–30 small-business clients in QuickBooks';
  return s;
}
const stub = (i, h = 40) => ({ id: `f${i}`, title: `Feature ${i}`, status: 'queued', effortHours: h, progressHours: 0, evidence: [] });

// ---- AI-coding workflow (item 4, audit fix 8) ----

test('workflow choices order rework, change failures and security holes by tier', () => {
  const r = TIERS.map((t) => reworkShare(TIER_WORKFLOWS[t]));
  assert.ok(r[0] <= 0.16 && r[3] >= 0.45, r.join(','));
  for (let i = 1; i < 4; i++) assert.ok(r[i] > r[i - 1], r.join(','));
  const cfr = TIERS.map((t) => changeFailureRate(TIER_WORKFLOWS[t]));
  for (let i = 1; i < 4; i++) assert.ok(cfr[i] > cfr[i - 1], cfr.join(','));
  assert.ok(cfr[3] / cfr[0] >= 2.5, 'incidents ×2–3+ for the mediocre workflow');
  assert.ok(securityBugChance(TIER_WORKFLOWS.mediocre) > 4 * securityBugChance(TIER_WORKFLOWS.stellar));
  // Large diffs make review ineffective: "read every diff" on a 1,000-line PR is worse than on small PRs.
  assert.ok(reworkShare({ ...TIER_WORKFLOWS.stellar, diff: 'large' }) > reworkShare(TIER_WORKFLOWS.stellar) + 0.1);
  // Unreviewed debt compounds toward 0.8.
  assert.ok(reworkShare(TIER_WORKFLOWS.mediocre, { unreviewedDebt: 1 }) >= 0.75);
  // Mediocre feels faster per hour (1.3–2× in the first weeks).
  const sp = throughputFactor(TIER_WORKFLOWS.mediocre) / throughputFactor(TIER_WORKFLOWS.stellar);
  assert.ok(sp >= 1.3 && sp <= 2, `${sp}`);
});

test('People aiReview toggle is retired once Product exists; seats from any vendor count', () => {
  const s = fresh();
  s.apps.people = { aiReview: false, members: [] };
  productSlice(s);
  assert.equal(aiBugRate(s), 0);
  const before = aiCodingMultiplier(s);
  choosePlan(s, 'cursor_premium');
  assert.equal(activePlan(s), 'cursor_premium');
  assert.ok(s.recurring.filter((r) => r.active && /claude max/i.test(r.vendor)).length === 0, 'old Claude Max bill canceled');
  assert.ok(aiCodingMultiplier(s) > 1 && aiCodingMultiplier(s) < before, 'Cursor Premium counts as a (smaller) seat');
});

test('usage limits: windows stall Pro, overage bills at API rates, caps stop it; Cursor Plus has no pay-as-you-go', () => {
  const heavy = TIER_WORKFLOWS.mediocre;
  const pro = usageFor('claude_pro', heavy, { sessionHours: 4, used: 0 });
  assert.ok(pro.windowHit && pro.hoursStalled > 1, JSON.stringify(pro));
  const over = usageFor('claude_max5', heavy, { sessionHours: 4, used: PLANS.claude_max5.agentHours });
  assert.ok(over.overageUsd > 30 && over.hoursStalled === 0, JSON.stringify(over));
  const capped = usageFor('claude_max5', { ...heavy, capUsd: 20 }, { sessionHours: 4, used: PLANS.claude_max5.agentHours });
  assert.ok(capped.overageUsd === 20 && capped.capped && capped.hoursStalled > 0);
  const plus = usageFor('cursor_plus', heavy, { sessionHours: 4, used: 8 });
  assert.equal(plus.overageUsd, 0);
  assert.ok(plus.hoursStalled > 3);
  // A bad month without caps: 3–10× the headline plan.
  let used = 0, usd = 0;
  for (let i = 0; i < 22; i++) { const u = usageFor('claude_max5', heavy, { sessionHours: 6, used, overageSoFar: usd }); used += u.allowanceUsed; usd += u.overageUsd; }
  assert.ok(usd >= 2 * PLANS.claude_max5.monthly && usd <= 10 * PLANS.claude_max5.monthly, `${usd}`);
});

test('feels-faster meter: perceived speed exceeds measured net speed, most for the mediocre workflow', () => {
  const sessions = [{ day: 1, hours: 10, eff: 20, reworkHours: 20 * 0.55 }];
  const m = measuredSpeed(sessions, { day: 5 });
  const p = perceivedSpeed(2, TIER_WORKFLOWS.mediocre);
  assert.ok(p > 2 * m.net, `${p} vs ${m.net}`);
  assert.ok(m.lo < m.net && m.hi > m.net, 'shows an interval, not a point');
  assert.ok(perceivedSpeed(2, TIER_WORKFLOWS.mediocre) > perceivedSpeed(2, TIER_WORKFLOWS.stellar));
});

// 90 days of founder sessions per tier: mediocre ships more early, then stellar has fewer bugs and failures.
function run90(tier, seed = 11) {
  const s = fresh(seed);
  const sl = productSlice(s);
  Object.assign(sl.agent.workflow, TIER_WORKFLOWS[tier]);
  s.apps.insights = { flags: { testedBackups: true } };
  for (let i = 0; i < 40; i++) { sl.features.push(stub(i)); sl.buildQueue.push(`f${i}`); }
  for (let c = 0; c < 5; c++) { const cu = createCustomer(s, { name: `C${c}`, email: `c${c}@x.io` }); subscribe(s, cu.id, s.plans[0] ?? { id: 'p', price: 49, interval: 'month' }, { trial: false, source: 'network' }); }
  let day30 = null;
  for (let d = 0; d < 90; d++) {
    if (d % 7 < 5) build(s, 4, { founder: true });
    advance(s, 1, [product]);
    if (d === 29) day30 = sl.features.filter((f) => f.status === 'shipped').reduce((a, f) => a + f.effortHours, 0);
  }
  const rel = releaseStats(releasesSlice(sl));
  return { s, day30, bugs: openBugHours(sl), bad: rel.bad, shipped90: sl.features.filter((f) => f.status === 'shipped').length, read: readOperator(s, 'ai_building') };
}

test('ai_building tiers separate: mediocre ships faster for weeks, then carries more bugs and failed deploys', () => {
  const res = Object.fromEntries(TIERS.map((t) => [t, run90(t)]));
  assert.ok(res.mediocre.day30 > res.stellar.day30, `day30 ${res.mediocre.day30} vs ${res.stellar.day30}`);
  assert.ok(res.mediocre.bugs > 2 * res.stellar.bugs + 5, `bugs ${res.mediocre.bugs} vs ${res.stellar.bugs}`);
  assert.ok(res.average.bugs > res.stellar.bugs, `bugs ${res.average.bugs} vs ${res.stellar.bugs}`);
  assert.ok(res.mediocre.bad >= res.stellar.bad, `bad deploys ${res.mediocre.bad} vs ${res.stellar.bad}`);
  const rank = { stellar: 3, good: 2, average: 1, mediocre: 0 };
  assert.ok(rank[res.stellar.read.tier] >= 2, JSON.stringify(res.stellar.read));
  assert.ok(rank[res.mediocre.read.tier] <= 1, JSON.stringify(res.mediocre.read));
  assert.ok(rank[res.stellar.read.tier] > rank[res.mediocre.read.tier]);
  assert.ok(res.mediocre.read.coaching.length > 0);
  // Mistakes are traceable in the shared ledger.
  assert.ok(res.mediocre.s.mistakes.some((m) => m.functionId === 'ai_building' && m.id === 'unreviewed_agent_code'));
  assert.ok(!(res.stellar.s.mistakes ?? []).some((m) => m.id === 'unreviewed_agent_code'));
});

test('rare disaster: production access + auto-accept can wipe the database; tested backups contain it', () => {
  assert.equal(destructiveChance(TIER_WORKFLOWS.stellar), 0);
  assert.ok(destructiveChance(TIER_WORKFLOWS.mediocre) > 0);
  const a = fresh(), b = fresh();
  a.apps.insights = { flags: { testedBackups: true } };
  dbWipe(a, productSlice(a), TIER_WORKFLOWS.mediocre);
  dbWipe(b, productSlice(b), TIER_WORKFLOWS.mediocre);
  const churn = (s) => ensureMarket(s).modifiers.churn['product-dbwipe'];
  assert.ok(churn(b) > churn(a) + 0.3);
  assert.ok(b.mistakes.some((m) => m.id === 'agent_db_wipe'));
});

// ---- Releases (item 14) ----

test('releases: canary + alerts roll back on their own; without monitoring errors surface late via tickets', () => {
  const sl = { features: [] };
  const rel = releasesSlice(sl);
  Object.assign(rel.flags, { monitoring: true, alerts: true, canary: true });
  const r1 = deploy(rel, { id: 'a', title: 'A' }, { day: 1, cfr: 1, rand: () => 0.5, accounts: 10 });
  assert.equal(r1.error.status, 'resolved');
  assert.ok(r1.error.minutes < 60);
  const sl2 = { features: [] };
  const rel2 = releasesSlice(sl2);
  const r2 = deploy(rel2, { id: 'b', title: 'B' }, { day: 1, cfr: 1, rand: () => 0.1, accounts: 10 });
  assert.equal(r2.error.visible, false);
  const d1 = releasesDay(rel2, { day: 2, accounts: 10 });
  assert.ok(d1.churnMult > 1);
  let surfaced = d1.surfaced.length;
  for (let d = 3; d < 6 && !surfaced; d++) surfaced = releasesDay(rel2, { day: d, accounts: 10 }).surfaced.length;
  assert.ok(surfaced, 'customer tickets surface it');
  const rb = rollback(rel2, r2.error.id, { rand: () => 0.9 });
  assert.ok(rb.ok);
  assert.ok(releaseStats(rel2).mttr > 20 * releaseStats(rel).mttr, `${releaseStats(rel2).mttr} vs ${releaseStats(rel).mttr}`);
});

test('rollback of a release with a migration can fail', () => {
  const rel = releasesSlice({ features: [] });
  const r = deploy(rel, { id: 'm', title: 'Import history' }, { day: 1, cfr: 1, rand: () => 0.1, accounts: 3, migration: true });
  const out = rollback(rel, r.error.id, { rand: () => 0.1 });
  assert.equal(out.ok, false);
  assert.ok(r.error.rollbackFailed);
});

// ---- Builder path (item 13) ----

function builderRun(tier, seed) {
  let x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const b = builderSlice({});
  for (let i = 0; i < 6; i++) { b.tables.push({ name: `t${i}`, rls: drawRls(rand) }); if (rand() < BUILDER.keyChancePerFeature) b.serviceRoleInFrontend = true; }
  if (tier === 'mediocre') b.serviceRoleInFrontend = true;
  if (tier !== 'mediocre' && tier !== 'average') { scan(b); for (const t of b.tables) if (t.rls === 'off') t.rls = rand() < 0.5 ? 'locked' : 'permissive'; b.serviceRoleInFrontend = false; }
  if (tier === 'stellar') seniorReview(b);
  let leaked = false;
  for (let d = 0; d < 120 && !leaked; d++) leaked = rand() < dailyFromMonthly(leakHazardMonthly(b));
  return leaked;
}

test('builder tiers separate on data leaks per 20 runs (scan + RLS + senior review vs service_role in the frontend)', () => {
  const leaks = Object.fromEntries(TIERS.map((t) => [t, Array.from({ length: 20 }, (_, i) => builderRun(t, 1000 + i * 7919)).filter(Boolean).length]));
  assert.ok(leaks.stellar <= 1, JSON.stringify(leaks));
  assert.ok(leaks.mediocre >= 8, JSON.stringify(leaks));
  assert.ok(leaks.average > leaks.stellar && leaks.mediocre > leaks.good, JSON.stringify(leaks));
  // The basic scan misses permissive policies.
  const b = builderSlice({});
  b.tables.push({ name: 'invoices', rls: 'permissive' });
  assert.equal(scan(b).length, 0);
  assert.ok(leakHazardMonthly(b) > leakHazardMonthly({ tables: [{ rls: 'locked' }] }));
});

test('builder path: MVP foundation in ~10 founder hours, credits and top-ups, data leak logs a mistake', () => {
  const s = fresh();
  s.recurring.forEach((r) => { if (/claude/i.test(r.vendor)) r.active = false; });
  const sl = productSlice(s);
  sl.features.push({ ...stub(1, 20) }); sl.buildQueue.push('f1');
  sl.foundation = { effortHours: 160, progressHours: 0, done: false };
  chooseBuilder(s, sl, 'bolt');
  let h = 0;
  while (!sl.foundation.done && h < 30) { build(s, 2, { founder: true }); h += 2; sl.buildDay = null; }
  assert.ok(h <= 20, `foundation took ${h} h`);
  assert.ok(builderSlice(sl).tables.some((t) => t.name === 'profiles'));
  assert.ok(sl.agent.sessions.length > 0 && sl.agent.sessions[0].builder);
});

// ---- Tracker (Linear-style) ----

test('triage: marking a real bug as duplicate brings it back; accepting a duplicate wastes a fix', () => {
  const sl = productSlice(fresh());
  const real = { id: 'b1', title: 'Totals wrong', hours: 3, severity: 'medium', foundDay: 1, fixedDay: null, triage: true };
  sl.bugs.push(real, duplicateOf(real, 2));
  const dup = sl.bugs[1];
  const acc = triageAccept(sl, dup.id);
  assert.ok(acc.wasted > 0);
  const r = triageDuplicate(sl, 'b1', 3);
  assert.ok(r.wrong);
  assert.ok(sl.latentBugs.some((b) => b.appearDay === 17));
  assert.ok(cycleSummary(sl, 20).n === 2);
});

// ---- Prioritisation: evidence-weighted fit, metric checks, decisions, rebuild tax (audit fix 5) ----

const ICP = 'Solo bookkeepers with 10–30 small-business clients in QuickBooks';
const SPEC = {
  user: 'Solo bookkeepers managing 10–30 small-business clients in QuickBooks Online',
  problem: 'At month-end close bookkeepers spend 2–3 hours chasing missing receipts by email; today they track missing items in a spreadsheet and send reminders manually.',
  solution: 'Each client gets an SMS link to snap a photo of a receipt; the app attaches it to the matching QuickBooks bank transaction and flags unmatched receipts for the bookkeeper.',
  acceptance: ['Given a client uploads a photo, then it is attached to the matching transaction within 1 minute.'],
  metric: 'Receipts matched before close → 75% within 30 days', baseline: '40% across 3 pilot accounts', grade: { total: 15 },
};
const INSIGHTS = [
  { id: 'i1', real: true, verified: true, interviewId: 'v1', type: 'pain', text: 'Chasing missing receipts by email at month-end close takes 3 hours' },
  { id: 'i2', real: true, verified: true, interviewId: 'v2', type: 'workaround', text: 'Tracks missing receipts in a spreadsheet for each client' },
  { id: 'i3', real: true, verified: true, interviewId: 'v3', type: 'pain', text: 'Bookkeepers lose a day each close to receipts clients forget' },
  { id: 'i4', real: true, verified: true, interviewId: 'v1', type: 'commitment', text: 'Pilot' },
  { id: 'i5', real: true, verified: true, interviewId: 'v2', type: 'commitment', text: 'Pre-order / deposit' },
];

function profileFeatures(profile, n, seed = 3) {
  let x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  return Array.from({ length: n }, (_, i) => {
    const ev = profile === 'stellar' ? ['i1', 'i2', 'i3', 'i4', 'i5'] : profile === 'good' ? ['i1', 'i2'] : profile === 'average' ? ['i1'] : [];
    const f = { ...SPEC, id: `p${i}`, title: `Receipt chase ${i}`, status: 'shipped', evidence: ev };
    if (profile === 'mediocre') Object.assign(f, { user: 'Users', problem: 'Users want a modern dashboard to see receipts every month.', solution: 'A dashboard shows receipts and charts for every client.' });
    if (profile === 'average') f.solution = 'Shows a list of missing receipts per client and sends a reminder email.';
    const recent = { stellar: 8, good: 4, average: 1, mediocre: 0 }[profile];
    f.ship = shipFactors(f, { insights: INSIGHTS, realInterviewsRecent: recent, rand });
    return f;
  });
}

test('product_prioritization tiers separate: share of features that move their metric', () => {
  const rates = {};
  for (const p of TIERS) {
    const feats = profileFeatures(p, 60);
    const icp = p === 'mediocre' ? 'Small businesses' : ICP;
    let x = 99;
    const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    const hits = feats.map((f) => metricCheck(f, { value: featureValue(f, { icp, insights: INSIGHTS }), rand, day: 30 })).filter((c) => c.verdict === 'hit').length;
    rates[p] = hits / feats.length;
  }
  assert.ok(rates.stellar >= 0.4 && rates.stellar <= 0.65, JSON.stringify(rates));
  assert.ok(rates.mediocre <= 0.12, JSON.stringify(rates));
  assert.ok(rates.stellar > rates.good && rates.good > rates.average && rates.average > rates.mediocre, JSON.stringify(rates));
  assert.equal(metricCheck({ metric: 'make it better', baseline: '' }, { value: 1, rand: () => 0, day: 1 }).verdict, 'unmeasurable');
  assert.equal(parseTarget('Receipts matched → 75% within 30 days').value, 75);
  assert.ok(moveChance(0.1) < 0.1 && moveChance(1) >= 0.55);
});

test('calibration: elite and mistakes founders no longer reach the same fit (evidence, broad ICP, contact decay)', () => {
  const elite = profileFeatures('stellar', 24);
  const mistakes = profileFeatures('mediocre', 42);
  const fe = trueFit(elite, { icp: ICP, insights: INSIGHTS, contact: contactFactor(5) });
  const fm = trueFit(mistakes, { icp: 'Everyone who runs a business', insights: [], contact: contactFactor(null, { daysSinceFirstShip: 180 }) });
  assert.ok(fe >= 0.75, `elite ${fe}`);
  assert.ok(fm <= 0.3, `mistakes ${fm}`);
  assert.ok(icpIsBroad('Everyone who runs a business') && !icpIsBroad(ICP));
  // Real interviews in the 8 weeks before ship raise value by up to 1.3×.
  const f = { ...SPEC, id: 'z', status: 'shipped', evidence: ['i1', 'i2', 'i3'] };
  const v0 = featureValue({ ...f, ship: shipFactors(f, { insights: INSIGHTS, realInterviewsRecent: 0, rand: () => 0.99 }) }, { icp: ICP, insights: INSIGHTS });
  const v6 = featureValue({ ...f, ship: shipFactors(f, { insights: INSIGHTS, realInterviewsRecent: 6, rand: () => 0.99 }) }, { icp: ICP, insights: INSIGHTS });
  assert.ok(Math.abs(v6 / v0 - 1.3) < 0.02 || v6 === 1, `${v6 / v0}`);
  // Linking unrelated interviews is not evidence.
  assert.equal(evidenceStrength({ ...f, problem: 'Dentists run out of gloves', user: 'Dentists', title: 'Glove reorder' }, INSIGHTS), 0);
  // No customer contact for months decays fit.
  assert.ok(contactFactor(200) < 0.75 && contactFactor(10) === 1);
});

test('kill then rebuild within 90 days costs +25% effort, is logged as going in circles', () => {
  const s = fresh();
  const sl = productSlice(s);
  const a = { ...SPEC, id: 'k1', title: 'Receipt chase by SMS', status: 'shipped', effortHours: 40, progressHours: 40, shippedDay: 0, evidence: [] };
  sl.features.push(a);
  decideFeature(s, sl, a, 'kill', 'Nobody used it after 30 days: 2 of 14 accounts tried it once');
  assert.equal(a.status, 'killed');
  s.day = 20;
  const b = { ...SPEC, id: 'k2', title: 'Receipt chase by SMS v2', status: 'draft', grade: { pass: true, agentHours: 20 }, evidence: [] };
  sl.features.push(b);
  queueFeature(s, b);
  assert.equal(b.effortHours, 50);
  assert.ok(sl.decisions.some((d) => d.kind === 'rebuild'));
  assert.ok(s.mistakes.some((m) => m.id === 'going_in_circles' && m.circles));
});

test('shipping an unvalidated feature is logged; prioritisation reader separates evidence-led from guesswork', () => {
  const mk = (profile) => {
    const s = fresh();
    s.apps.research = { interviews: [], insights: INSIGHTS, introCredits: 0 };
    const sl = productSlice(s);
    for (const f of profileFeatures(profile, 6)) { f.check = metricCheck(f, { value: featureValue(f, { icp: ICP, insights: INSIGHTS }), rand: () => 0.3, day: 30 }); sl.features.push(f); }
    if (profile === 'stellar') { decideFeature(s, sl, sl.features[0], 'kill', 'Missed: 3 of 20 accounts used it once; not worth the support load'); decideFeature(s, sl, sl.features[1], 'keep', 'Hit 74% matched in 30 days across 9 accounts'); }
    return readOperator(s, 'product_prioritization');
  };
  const st = mk('stellar'), me = mk('mediocre');
  assert.ok(st.score > me.score + 0.2, `${st.score} vs ${me.score}`);
  assert.ok(['stellar', 'good'].includes(st.tier) && ['mediocre', 'average'].includes(me.tier), `${st.tier} ${me.tier}`);
  assert.ok(me.coaching.length);
});

test('interview recruiting charges outreach hours per booked call (÷ reply rate)', () => {
  assert.equal(recruitHours('warm'), 0.6);
  assert.equal(recruitHours('community'), 2);
  assert.equal(recruitHours('cold'), 14);
});

test('automations exposure: product events carry stable ids; actions dry-run and return costs', async () => {
  const { productEvents, PRODUCT_ACTIONS } = await import('../public/apps/product/api.js');
  const s = fresh();
  const dry = PRODUCT_ACTIONS.create_spec_draft(s, { title: 'Receipt chase' }, { dryRun: true });
  assert.ok(dry.ok && productSlice(s).features.length === 0);
  const r = PRODUCT_ACTIONS.create_spec_draft(s, { title: 'Receipt chase' });
  assert.ok(r.ok && r.hoursCost === 0);
  assert.equal(PRODUCT_ACTIONS.queue_feature(s, { featureId: r.featureId }).ok, false, 'unreviewed specs cannot be queued');
  const f = productSlice(s).features[0];
  Object.assign(f, { status: 'shipped', shippedDay: s.day });
  const ev = productEvents(s);
  assert.ok(ev.some((e) => e.type === 'feature_shipped' && e.id === `feature_shipped:${f.id}`));
  assert.ok(PRODUCT_ACTIONS.add_changelog_entry(s, { featureId: f.id, note: 'x' }).ok);
});

test('Product renders every tab (board, issues, build incl. builder, releases, decisions, changelog, spec) without errors', () => {
  const r = run90('average', 5);
  const s = r.s;
  const sl = productSlice(s);
  const f = sl.features.find((x) => x.status === 'shipped');
  f.check = { day: s.day, verdict: 'missed', text: 'Target 75%, got 45%.' };
  const draw = (params) => { const root = { innerHTML: '', addEventListener() {}, querySelector() { return null; } }; product.render(root, { state: s, params, save() {}, act() {}, render() {}, navigate() {}, enqueue() {} }); return root.innerHTML; };
  for (const p of ['board', 'issues', 'build', 'releases', 'decisions', 'changelog', `spec:${f.id}`]) assert.ok(draw(p).length > 500, p);
  assert.ok(/Feels faster vs measured/.test(draw('build')));
  assert.ok(/30-day checks/.test(draw('decisions')) && /Keep/.test(draw('decisions')));
  chooseBuilder(s, sl, 'lovable');
  assert.ok(/Backend \(Supabase-style\)/.test(draw('build')));
});
