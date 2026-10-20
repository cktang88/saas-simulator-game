// Web content tools as paradigms (docs/research/tools/2026q4/web-content.md): building the marketing site with LLMs
// (coding agent on your repo vs Lovable / v0 / Bolt / Replit), video and demo tools (Loom, Screen Studio, Tella,
// Descript, Capsule, Arcade), no-code app-builder billing and failure modes, and Keysearch's noisier estimates.
// Short, targeted checks: one function at a time, a few seeds, no long sims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { SITE_PATHS, SITE_NOTES, buildSite, iterateSite, siteBuildMult, siteBuildScore, briefScore, siteCoaching } from '../public/apps/website/sitebuild.js';
import { VIDEO_TOOLS, recordDemo, heuristicDemo, demoLift, bestToolFor, videoKit, launchVideoMult } from '../public/apps/website/demo.js';
import { BUILDERS, builderSlice, builderUsage, unitsPerHourNow, ceilingReason, builderScore } from '../public/apps/product/builder.js';
import { ensureSeo, technicalIssues } from '../public/apps/growth/seoDynamics.js';
import { ensureOrganic, publishArticle } from '../public/apps/growth/organicEngine.js';
import { estimateKeyword } from '../public/apps/searchtools/tools.js';
import { TOOLS, ESTIMATE } from '../public/apps/searchtools/params.js';
import { keywordMetrics } from '../public/apps/growth/organicModel.js';

function fresh(seed = 11) {
  const s = newState({ companyName: 'Ledgerbird', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Payout reconciliation', status: 'shipped' }] };
  s.company.oneLiner = 'Bookkeeping automation that reconciles Shopify payouts into QuickBooks';
  s.company.icp = 'Shopify store owners doing their own books';
  return s;
}
const mistakes = (s, id) => (s.mistakes ?? []).filter((m) => m.id === id);

const STRONG_BRIEF = `Shopify payouts reconciled into QuickBooks for store owners who do their own books.
Tired of spending 6 hours every month matching payouts to orders in a spreadsheet?
Instead of exporting CSVs, Ledgerbird matches every payout, fee and refund automatically.
"We closed March in 20 minutes" - a customer running 3 Shopify stores.
Start a free trial: connect Shopify in 2 minutes.`;
const GENERIC_BRIEF = `The AI-powered all-in-one platform for modern businesses.
Seamless, effortless and robust. Supercharge your finance workflow and unlock growth with next-gen automation today.`;

// ---------------- Site builds: tiers ----------------

function tierBuild(tier, seed) {
  const s = fresh(seed);
  const plan = {
    stellar: { path: 'agent_repo', brief: STRONG_BRIEF, spec: true, review: 'every', checks: { ssr: true, meta: true, speed: true }, framework: 'astro' },
    good: { path: 'v0', brief: STRONG_BRIEF, spec: false, review: 'every', checks: { meta: true } },
    average: { path: 'lovable', brief: STRONG_BRIEF.split('\n').slice(0, 2).join('\n'), review: 'skim', checks: { meta: true } },
    mediocre: { path: 'lovable', brief: GENERIC_BRIEF, review: 'none', checks: {} },
  }[tier];
  const r = buildSite(s, plan);
  s.company.website = { ...r.site, fetchedDay: s.day };
  if (tier === 'stellar') { s.company.website.eval = { day: s.day, score: 0.6, results: [] }; iterateSite(s); }
  if (tier === 'mediocre') { iterateSite(s); iterateSite(s); } // redesigns with no data in between
  return { s, r, b: s.company.siteBuild };
}

test('site build: stellar > good > average > mediocre on landing multiplier and operator read, across seeds', () => {
  for (const seed of [3, 11, 29]) {
    const t = Object.fromEntries(['stellar', 'good', 'average', 'mediocre'].map((k) => [k, tierBuild(k, seed)]));
    const mult = (k) => siteBuildMult(t[k].b), score = (k) => siteBuildScore(t[k].b);
    assert.ok(mult('stellar') > mult('good') && mult('good') > mult('average') && mult('average') > mult('mediocre'), `mult seed ${seed}: ${['stellar', 'good', 'average', 'mediocre'].map(mult)}`);
    assert.ok(score('stellar') > score('good') && score('good') > score('average') && score('average') > score('mediocre'), `score seed ${seed}`);
    // Spread calibrated to be visible, not absurd: stellar ~1.0, mediocre ~0.9 on landing [design].
    assert.ok(mult('stellar') - mult('mediocre') > 0.06 && mult('stellar') - mult('mediocre') < 0.25);
    assert.ok(t.stellar.b.copyQuality > t.mediocre.b.copyQuality + 0.3);
  }
});

test('site build: the mediocre one-shot is an SPA with no meta, generic copy, and every mistake is logged and traceable', () => {
  const { s, b, r } = tierBuild('mediocre', 5);
  assert.equal(b.rendering, 'csr');
  assert.equal(ensureSeo(s).tech.rendering, 'csr');
  ensureOrganic(s);
  assert.ok(technicalIssues(s).some((i) => i.id === 'csr_rendering'), 'the SEO engine sees the client-rendered marketing pages');
  for (const id of ['generic_ai_site', 'spa_marketing_site', 'site_missing_meta', 'redesign_without_data']) assert.equal(mistakes(s, id).length, 1, id);
  assert.match(r.site.text, /AI-powered|Supercharge|Seamless/, 'generic filler lands on the page the panel reads');
  assert.ok(siteCoaching(b).length >= 4, 'feedback says what a stellar operator would have done');
  const st = tierBuild('stellar', 5);
  assert.equal(st.b.rendering, 'static');
  assert.equal(ensureSeo(st.s).tech.sitemap, true);
  for (const id of ['generic_ai_site', 'spa_marketing_site', 'site_missing_meta']) assert.equal(mistakes(st.s, id).length, 0, id);
});

test('site build: paths differ in hours, rendering, billing and lock-in', () => {
  const s = fresh();
  const a = buildSite(s, { path: 'agent_repo', brief: STRONG_BRIEF, review: 'every', checks: { meta: true } });
  assert.equal(a.build.rendering, 'static');
  const lov = buildSite(fresh(), { path: 'lovable', brief: STRONG_BRIEF, review: 'every', checks: { ssr: true } });
  assert.equal(lov.build.rendering, 'csr', 'Lovable cannot server-render; the SSR check only warns');
  assert.ok(lov.warnings.some((w) => /SPA/.test(w)));
  assert.ok(lov.hours < a.hours, 'builders take fewer founder hours than the coding agent');
  assert.equal(buildSite(fresh(), { path: 'v0', brief: STRONG_BRIEF }).build.rendering, 'static');
  assert.equal(buildSite(fresh(), { path: 'bolt', brief: STRONG_BRIEF }).build.rendering, 'csr');
  assert.equal(buildSite(fresh(), { path: 'bolt', brief: STRONG_BRIEF, framework: 'astro' }).build.rendering, 'static');
  // Moving off Replit to your own repo costs its lock-in, and with ranking pages it is an SEO migration.
  const m = fresh();
  ensureOrganic(m);
  publishArticle(m, { title: 'How to reconcile Shopify payouts', query: 'reconcile shopify payouts', body: 'x', judge: { quality: 0.8, slop: 0, citable: 0, informational: true } });
  buildSite(m, { path: 'replit', brief: STRONG_BRIEF });
  const mv = buildSite(m, { path: 'agent_repo', brief: STRONG_BRIEF, checks: { ssr: true }, redirectMap: true });
  assert.ok(mv.hours >= SITE_PATHS.replit.lockInHours + SITE_PATHS.agent_repo.buildHours);
  assert.ok(ensureSeo(m).migration, 'the rebuild went through the SEO migration model');
  assert.equal(m.company.siteBuild.migrations.length, 1);
});

test('site build: the coding-agent path draws on the same plan allowance as product work', () => {
  const s = fresh();
  s.apps.product.agent = { usage: { month: null, hours: 0, overageUsd: 0 } };
  buildSite(s, { path: 'agent_repo', brief: STRONG_BRIEF, spec: true, review: 'every' });
  assert.ok(s.apps.product.agent.usage.hours > 0);
});

test('brief score rewards positioning, not length or buzzwords', () => {
  const s = fresh();
  assert.ok(briefScore(s, STRONG_BRIEF).score >= 0.8);
  assert.ok(briefScore(s, GENERIC_BRIEF).score <= 0.2);
  assert.ok(briefScore(s, `${GENERIC_BRIEF}\n`.repeat(6)).score <= 0.2);
});

test('Framer/Webflow are notes only; tips.io, Reweb and the AngelList stack page are marked outdated', () => {
  assert.ok(!('framer' in SITE_PATHS) && !('webflow' in SITE_PATHS));
  for (const id of ['tips_io', 'reweb', 'angellist_stack']) assert.ok(SITE_NOTES.find((n) => n.id === id)?.outdated, id);
});

// ---------------- Video and demo tools ----------------

const DEMO_SCRIPT = `Shopify store owners doing their own books spend 6 hours every month matching payouts in a spreadsheet.
Here you connect Shopify and QuickBooks with two clicks. Then I click a payout and see every order, fee and refund matched.
Next I select the three flagged refunds and approve them in one screen. Watch the reconciliation report update instantly.
The result: March closed in 20 minutes instead of 6 hours. Start a free trial today.`;
const RAMBLE = `${'Hi, I am Pat, and this is our seamless AI-powered all-in-one platform that we built to revolutionize everything. '.repeat(30)}`;

test('video: each tool has its own best use; Loom wins sales follow-ups, Arcade the landing page', () => {
  const s = fresh();
  assert.equal(bestToolFor(s, 'sales'), 'loom');
  assert.equal(bestToolFor(s, 'landing'), 'arcade');
  assert.notEqual(bestToolFor(s, 'launch'), 'capsule', 'no Capsule before a marketing team');
  videoKit(s).os = 'windows';
  assert.throws(() => recordDemo(s, { script: DEMO_SCRIPT, tool: 'screen_studio', use: 'launch', judge: heuristicDemo(s, DEMO_SCRIPT) }), /macOS/);
});

test('video tiers: right tool + good script > right tool + weak script > wrong tool + rambling script', () => {
  const run = (tool, use, script) => { const s = fresh(); recordDemo(s, { script, tool, use, judge: heuristicDemo(s, script) }); return { s, l: demoLift(s) }; };
  const stellar = run('arcade', 'landing', DEMO_SCRIPT);
  const average = run('tella', 'landing', DEMO_SCRIPT);
  const mediocre = run('descript', 'landing', RAMBLE);
  assert.ok(stellar.l.landing > average.l.landing && average.l.landing > 1 && mediocre.l.landing < 1, `${stellar.l.landing} ${average.l.landing} ${mediocre.l.landing}`);
  assert.equal(mistakes(mediocre.s, 'video_tool_mismatch').length, 1, 'the wrong tool is named with the better pick');
  // Sales follow-up via Loom lifts sales conversion more than the landing demo does.
  const sales = run('loom', 'sales', DEMO_SCRIPT);
  assert.ok(sales.l.sales > average.l.sales && sales.l.sales > stellar.l.sales, 'a follow-up made for the deal beats the landing demo on sales');
  const launch = run('screen_studio', 'launch', DEMO_SCRIPT);
  assert.ok(launchVideoMult(launch.s) > 1.1);
});

test('video: Loom free cuts at 5 minutes and deletes the oldest after 25; Capsule pre-funding is overkill', () => {
  const s = fresh();
  const long = `${DEMO_SCRIPT}\n`.repeat(12); // ~10 minutes read aloud
  const d = recordDemo(s, { script: long, tool: 'loom', use: 'sales', judge: heuristicDemo(s, long) });
  assert.equal(d.seconds, VIDEO_TOOLS.loom.freeMaxSeconds);
  assert.equal(mistakes(s, 'loom_free_cutoff').length, 1);
  for (let i = 0; i < 25; i++) recordDemo(s, { script: DEMO_SCRIPT, tool: 'loom', use: 'sales', judge: heuristicDemo(s, DEMO_SCRIPT) });
  assert.ok(mistakes(s, 'loom_cap_deleted').length >= 1);
  const c = fresh();
  const cash = c.bank.txns.length;
  recordDemo(c, { script: DEMO_SCRIPT, tool: 'capsule', use: 'landing', judge: heuristicDemo(c, DEMO_SCRIPT) });
  assert.equal(mistakes(c, 'video_tool_overkill').length, 1);
  assert.ok(c.bank.txns.length > cash, 'Capsule bills');
});

test('video: old saves without a tool keep their lift', () => {
  const s = fresh();
  recordDemo(s, { script: DEMO_SCRIPT, style: 'standard', judge: heuristicDemo(s, DEMO_SCRIPT) });
  assert.ok(demoLift(s).landing > 1);
});

// ---------------- No-code app builders ----------------

const slice = (tool) => { const b = builderSlice({}); b.tool = tool; b.active = true; return b; };

test('builders: each bills in its own unit with its own failure mode', () => {
  // Lovable: a fix loop is a paid task, never refunded; three loops in a month log the credit-burn mistake.
  const s = fresh();
  const lov = slice('lovable');
  for (let i = 0; i < 3; i++) builderUsage(lov, 'lovable', 4, { loop: true, month: '2026-11', state: s });
  assert.ok(lov.usage.burned >= 3 * BUILDERS.lovable.loopUnits);
  assert.equal(mistakes(s, 'credit_burn_loop').length, 1);
  // Lovable credits roll over once, then expire.
  builderUsage(lov, 'lovable', 0, { month: '2026-12' });
  assert.ok(lov.usage.carry > 0 || lov.expiredUnits >= 0);
  // Bolt: tokens per hour grow with the app.
  assert.ok(unitsPerHourNow('bolt', 10) > 2 * unitsPerHourNow('bolt', 0));
  assert.equal(unitsPerHourNow('lovable', 10), unitsPerHourNow('lovable', 0));
  // v0: backend tasks run at half speed and hit the ceiling first.
  const v0 = slice('v0');
  assert.equal(builderUsage(v0, 'v0', 2, { task: { title: 'Login and database sync' }, month: '2026-11' }).factorMult, 0.5);
  assert.equal(builderUsage(v0, 'v0', 2, { task: { title: 'Pricing page hero' }, month: '2026-11' }).factorMult, 1);
  assert.match(ceilingReason(v0, { accounts: 1, queued: [{ title: 'Email notifications', solution: '' }] }), /backend/);
  assert.equal(ceilingReason(slice('lovable'), { accounts: 1, queued: [{ title: 'Email notifications', solution: '' }] }), null);
  // Replit: no stop, the overage accrues and comes due next month (a surprise bill), unless a budget is set.
  const rep = slice('replit');
  const u1 = builderUsage(rep, 'replit', 20, { month: '2026-11' });
  assert.equal(u1.topupUsd, 0);
  assert.ok(rep.usage.arrears > 0);
  const u2 = builderUsage(rep, 'replit', 1, { month: '2026-12' });
  assert.ok(u2.arrearsDue > 0);
  const capped = slice('replit'); capped.budgetCap = true;
  assert.ok(builderUsage(capped, 'replit', 20, { month: '2026-11' }).stalledShare > 0);
});

test('builders: Replit without a dev/prod split risks the production database; tiers separate on the builder read', () => {
  let wipes = 0, split = 0;
  for (const seed of [1, 2, 3]) {
    let x = seed * 7919;
    const rand = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
    const a = slice('replit'), b = slice('replit'); b.devProdSplit = true;
    for (let i = 0; i < 400; i++) { if (builderUsage(a, 'replit', 4, { rand, month: 'm' }).destructive) wipes++; if (builderUsage(b, 'replit', 4, { rand, month: 'm' }).destructive) split++; }
  }
  assert.ok(wipes > 0 && split === 0);
  const stellar = slice('replit'); Object.assign(stellar, { devProdSplit: true, budgetCap: true, scannedDay: 1, reviewed: true, exported: true });
  stellar.tables = [{ name: 'profiles', rls: 'locked' }];
  const mediocre = slice('replit'); mediocre.tables = [{ name: 'profiles', rls: 'off' }]; mediocre.burnedTotalUsd = 50;
  assert.ok(builderScore(stellar) > 0.8 && builderScore(mediocre) < 0.3);
});

// ---------------- Keysearch ----------------

test('Keysearch: cheap keyword tool with wider estimate error than Ahrefs', () => {
  assert.equal(TOOLS.keysearch.kind, 'keyword');
  assert.ok(TOOLS.keysearch.price < TOOLS.ahrefs_lite.price / 4);
  assert.ok(ESTIMATE.keysearch.sigma > ESTIMATE.semrush.sigma && ESTIMATE.keysearch.kdSd > ESTIMATE.ahrefs.kdSd);
  const s = fresh(17);
  const qs = ['accounting', 'invoicing', 'crm', 'bookkeeping', 'payroll', 'inventory'].flatMap((a) => ['software', 'app', 'tool', 'alternative', 'for small business', 'pricing'].map((b) => `${a} ${b}`));
  const med = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const kdErr = (engine) => med(qs.map((q) => Math.abs(estimateKeyword(s, engine, q).kd - keywordMetrics(q, 'smb', {}).kd)));
  const volErr = (engine) => med(qs.map((q) => { const t = Math.max(1, keywordMetrics(q, 'smb', {}).volume); return Math.abs(Math.log(Math.max(1, estimateKeyword(s, engine, q).volume) / t)); }));
  assert.ok(kdErr('keysearch') > kdErr('ahrefs'), `KD ${kdErr('keysearch')} vs ${kdErr('ahrefs')}`);
  assert.ok(volErr('keysearch') > volErr('ahrefs'), `volume ${volErr('keysearch')} vs ${volErr('ahrefs')}`);
});
