// SEO dynamics (public/apps/growth/seoDynamics.js): decay + refresh, cannibalization, core updates by page quality,
// link spam, writer tiers, technical accidents, tool reads, and stellar vs mediocre operator separation.
// Short horizons, organic app only, a few seeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post, balance } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { mistakesSummary, readOperator } from '../public/core/operator.js';
import { APPS } from '../public/apps/registry.js';
import { publishArticle, ensureOrganic } from '../public/apps/growth/organicEngine.js';
import { h01, coreUpdateStartsOn, GOOGLE_CAL } from '../public/apps/growth/seoCalendar.js';
import {
  ensureSeo, articleDay, decayMult, isDecaying, refreshArticle, computeGroups, mergeGroup, startCoreUpdate, runSpamUpdate,
  buyLinks, removeBoughtLinks, requestReconsideration, seoSiteMult, commissionArticle, reviewDraft, startAgency, technicalSetup,
  runAudit, fixIssue, migrateSite, technicalIssues, seoArticleStats, answerJournalists, readSeo, pageTypeOf, pageConversion, setPillar, clusterMult,
} from '../public/apps/growth/seoDynamics.js';

const ORG = APPS.filter((a) => a.id === 'organic');
function fresh(seed = 7, cash = 100000) {
  const s = newState({ companyName: 'Habitly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: cash, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] };
  s.company.website = { source: 'paste', title: 'x', text: 'x' };
  s.company.oneLiner = 'Habit tracker for busy parents who want to read more books';
  s.company.icp = 'busy parents';
  s.market.flags = { fixedDemand: 1 };
  ensureOrganic(s); ensureSeo(s);
  return s;
}
const J = (quality, slop = 0.05, extra = {}) => ({ quality, slop, informational: false, citable: 0, results: [], mock: true, ...extra });
const text = (n, salt = 0) => Array.from({ length: n }, (_, i) => `w${(i * 7 + salt) % 9973}`).join(' ');
const mature = (s, a, { age = 400, position = 3 } = {}) => { a.day = s.day - age; a.freshDay = a.day; a.indexLag = 0; a.stuck = false; a.position = position; return a; };
const today = (s, a) => articleDay(s, a, { shock: 1, demand: 1 }).visits;

test('pages decay with age; a substantive refresh lifts traffic per the research distribution; a date bump does nothing', () => {
  const lifts = [];
  for (let seed = 1; seed <= 30; seed++) {
    const s = fresh(seed);
    const body = text(600, seed);
    const a = mature(s, publishArticle(s, { title: 'Habit tracker for parents', query: 'habit tracker app for busy parents', body, judge: J(0.6) }), { age: 600 });
    if (seed === 1) {
      assert.equal(decayMult(a, s.day - 600 + 200), 1, 'no decay in the first months');
      assert.ok(decayMult(a, s.day) < 0.85 && decayMult(a, s.day) > 0.6, `decay ${decayMult(a, s.day)}`);
      assert.ok(isDecaying(s, a), 'flagged as decaying');
      // Date-only: nothing changes, and the wasted time is logged.
      const before = today(s, a);
      const r = refreshArticle(s, a.id, { title: a.title, body, judge: null });
      assert.equal(r.kind, 'date_only');
      assert.ok(Math.abs(today(s, a) - before) < 1e-9, 'date bump: same traffic');
      assert.ok(mistakesSummary(s).byMistake.some((m) => m.id === 'date_only_refresh'));
    }
    const before = today(s, a);
    const changed = body.split(' ').map((w, i) => (i % 2 ? `n${i}` : w)).join(' ');
    const r = refreshArticle(s, a.id, { title: a.title, body: changed, judge: J(0.65) });
    assert.equal(r.kind, 'substantive');
    lifts.push(today(s, a) / before);
  }
  lifts.sort((x, y) => x - y);
  const median = lifts[15];
  const down = lifts.filter((x) => x < 0.97).length / lifts.length;
  // Research: median ~+30–47%, ~10% decline, 14% flat.
  assert.ok(median > 1.2 && median < 1.6, `median ${median}`);
  assert.ok(down >= 0.03 && down <= 0.25, `backfire share ${down}`);
});

test('cannibalization: overlapping pages split traffic; merging into the strongest page restores it', () => {
  const s = fresh(3);
  const a = mature(s, publishArticle(s, { title: 'A', query: 'habit tracker for busy parents', body: text(400), judge: J(0.7) }));
  const b = mature(s, publishArticle(s, { title: 'B', query: 'habit trackers for busy parents', body: text(400, 3), judge: J(0.7) }));
  const alone = [today(s, a), today(s, b)];
  const g = computeGroups(s);
  assert.equal(Object.keys(g).length, 1);
  const split = today(s, a) + today(s, b);
  assert.ok(a.cannibalMult < 1 && a.cannibalMult === b.cannibalMult);
  assert.ok(Math.abs(split / (0.8 * Math.max(...alone)) - 1) < 0.02 && split < 0.85 * (alone[0] + alone[1]), `${split} vs ${alone}`);
  // Different intent is not cannibalization.
  const c = mature(s, publishArticle(s, { title: 'C', query: 'best habit tracker software for busy parents', body: text(400, 5), judge: J(0.7) }));
  computeGroups(s);
  assert.equal(c.cannibalMult, 1);
  const r = mergeGroup(s, Object.keys(s.apps.organic.seo.groups)[0]);
  assert.ok(r.ok && r.hoursCost === 1.5);
  const kept = s.apps.organic.articles.find((x) => x.id === r.keep);
  assert.equal(kept.cannibalMult, 1);
  assert.ok(today(s, kept) > split, 'merged page beats the split pair');
  // Unresolved overlaps become a traceable mistake.
  const t = fresh(4);
  mature(t, publishArticle(t, { title: 'A', query: 'reading habit for parents', body: text(300), judge: J(0.6) }));
  mature(t, publishArticle(t, { title: 'B', query: 'reading habits for parents', body: text(300, 1), judge: J(0.6) }));
  computeGroups(t);
  advance(t, 63, ORG);
  assert.ok(mistakesSummary(t).byMistake.some((m) => m.id === 'keyword_cannibalization'));
});

test('core updates re-judge each page on its own helpfulness: slop loses, quality holds or gains; slop-heavy sites drag good pages', () => {
  const run = (slopPages, seed) => {
    const s = fresh(seed);
    const good = mature(s, publishArticle(s, { title: 'G', query: 'how we read 40 books with toddlers', body: text(900), judge: J(0.85, 0.05) }));
    const bad = [];
    for (let i = 0; i < slopPages; i++) bad.push(mature(s, publishArticle(s, { title: `S${i}`, query: `reading tips number ${i} kids`, body: text(300, i), judge: J(0.2, 0.8) })));
    startCoreUpdate(s);
    s.day += 30;
    return { good: good.coreMult, bad: bad.length ? bad.reduce((x, a) => x + a.coreMult, 0) / bad.length : null, s };
  };
  let g = 0, b = 0, gHeavy = 0;
  for (let seed = 1; seed <= 6; seed++) { const r = run(1, seed); g += r.good; b += r.bad; gHeavy += run(8, seed).good; }
  g /= 6; b /= 6; gHeavy /= 6;
  assert.ok(g > 1.0 && b < 0.75, `good ${g} slop ${b}`);
  assert.ok(gHeavy < g * 0.85, `site-wide drag ${gHeavy} vs ${g}`);
  // A heavy loss on a site with unhelpful pages is a traceable, delayed mistake; the effect rolls out over 2–3 weeks.
  const r = run(8, 2);
  assert.ok(mistakesSummary(r.s).byMistake.some((m) => m.id === 'core_update_unhelpful'));
  // One calendar: the same schedule PLG used before (gcore hash), 2–4 updates a year.
  let n = 0;
  for (const sd of [9, 10, 11, 12, 13]) {
    const s = fresh(sd); const seed = ensureSeo(s).seed;
    for (let d = 0; d < 3650; d++) { const on = coreUpdateStartsOn(s, d); if (on) n++; assert.equal(on, h01(`gcore|${seed}|${d}`) < GOOGLE_CAL.corePerYear / 365); }
  }
  assert.ok(n / 50 >= 2.5 && n / 50 <= 4.2, `${n / 50}/yr`);
});

test('scaled AI content triggers a site-wide spam demotion that lifts only after cleanup at a later spam update', () => {
  const s = fresh(11);
  for (let i = 0; i < 14; i++) mature(s, publishArticle(s, { title: `S${i}`, query: `habit tips ${i} for parents`, body: text(300, i), judge: J(0.15, 0.85) }), { age: 100 });
  const rec = runSpamUpdate(s);
  assert.ok(/demotion|manual/.test(rec.outcome), rec.outcome);
  assert.ok(seoSiteMult(s) <= 0.5);
  assert.ok(mistakesSummary(s).byMistake.some((m) => m.id === 'scaled_content_abuse'));
  const P = s.apps.organic.seo.penalty;
  if (!P.manual) {
    s.day += 120; runSpamUpdate(s);
    assert.equal(P.liftDay, null, 'no cleanup: no lift');
    for (const a of s.apps.organic.articles.slice(0, 12)) a.status = 'pruned';
    for (let i = 0; i < 10; i++) mature(s, publishArticle(s, { title: `G${i}`, query: `reading routine ${i} with toddlers`, body: text(900, i), judge: J(0.8) }));
    s.day += 120; runSpamUpdate(s);
    assert.equal(P.liftDay, s.day, 'cleanup + next spam update: lifting');
  }
});

test('bought links: immediate DR, then ignored (money wasted) or a manual action; reconsideration needs the links gone', () => {
  let manual = 0, ignored = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const s = fresh(seed);
    mature(s, publishArticle(s, { title: 'G', query: 'habit tracker for busy parents', body: text(500), judge: J(0.7) }));
    const dr0 = s.apps.organic.dr;
    const cash0 = balance(s);
    buyLinks(s, { pack: 'cheap' }); buyLinks(s, { pack: 'cheap' });
    assert.ok(s.apps.organic.dr > dr0 + 5 && cash0 - balance(s) === 2240);
    runSpamUpdate(s);
    const P = s.apps.organic.seo.penalty;
    if (P?.kind === 'links') {
      manual++;
      assert.ok(seoSiteMult(s) < 0.5);
      // Asking before fixing gets rejected (going in circles).
      requestReconsideration(s); s.day += 45; advance(s, 1, ORG);
      assert.ok(mistakesSummary(s).byMistake.some((m) => m.id === 'reconsideration_rejected'));
      removeBoughtLinks(s); requestReconsideration(s); s.day += 45; advance(s, 1, ORG);
      assert.ok(P.liftDay != null, 'approved after removal');
    } else if (s.apps.organic.seo.links.neutralized) {
      ignored++;
      assert.ok(s.apps.organic.dr < dr0 + 1 && mistakesSummary(s).byMistake.some((m) => m.id === 'bought_links_ignored'));
    }
  }
  assert.ok(manual >= 3 && ignored >= 3, `manual ${manual} ignored ${ignored}`);
  // No paid links: no link penalty, and disavowing "toxic" links is a costly needless move.
  const c = fresh(5);
  mature(c, publishArticle(c, { title: 'G', query: 'habit tracker for busy parents', body: text(500), judge: J(0.7) }));
  runSpamUpdate(c);
  assert.equal(c.apps.organic.seo.penalty, null);
  assert.ok(removeBoughtLinks(c).needless && seoSiteMult(c) < 1);
});

test('writer tiers: cheap writers cost less and deliver generic or slop drafts; specialists are better but pricey; editing helps', () => {
  const s = fresh(21, 200000);
  const brief = 'For busy parents who switched from paper charts: customers told us on 12 calls that they read 3 books a month with Habitly streaks; include our $4 plan.';
  const tiers = {};
  for (const tier of ['junior', 'specialist']) {
    const cash0 = balance(s);
    const ds = Array.from({ length: 12 }, (_, i) => commissionArticle(s, { tier, query: `reading routine ${tier} ${i} for parents`, brief }));
    tiers[tier] = { usd: cash0 - balance(s), q: ds.reduce((x, d) => x + d.quality, 0) / 12, slop: ds.filter((d) => d.slop > 0.5).length, ds };
  }
  assert.equal(tiers.junior.usd, 12 * 225);
  assert.equal(tiers.specialist.usd, 12 * 1500);
  assert.ok(tiers.specialist.q > tiers.junior.q + 0.25, `${tiers.specialist.q} vs ${tiers.junior.q}`);
  assert.ok(tiers.junior.slop >= 2 && tiers.specialist.slop <= 1, `${tiers.junior.slop} ${tiers.specialist.slop}`);
  advance(s, 15, ORG);
  const d0 = tiers.junior.ds[0], d1 = tiers.junior.ds[1];
  assert.equal(d0.status, 'review');
  assert.equal(reviewDraft(s, d0.id, 'edit', { dryRun: true }).hoursCost, 3);
  reviewDraft(s, d0.id, 'edit'); reviewDraft(s, d1.id, 'publish');
  const a0 = s.apps.organic.articles.find((a) => a.id === d0.articleId), a1 = s.apps.organic.articles.find((a) => a.id === d1.articleId);
  assert.ok(a0.quality > d0.quality && a0.source === 'writer:junior' && a1);
  // A vaguer brief yields worse drafts from the same writer.
  const vague = commissionArticle(s, { tier: 'mid', query: 'x for parents', brief: 'write about habits' });
  const sharp = commissionArticle(s, { tier: 'mid', query: 'y for parents', brief });
  assert.ok(sharp.briefScore > vague.briefScore + 0.3);
  // Agencies need cash for the retainer (stage realism comes from the bank balance, not a difficulty setting).
  const poor = fresh(22, 0);
  post(poor, { amount: -balance(poor) + 500, counterparty: 'x', category: 'other' });
  assert.throws(() => startAgency(poor, { tier: 'specialist' }), /Not enough cash/);
  // A content mill ships volume that auto-publishes unreviewed; in-house writers draft every week.
  const m = fresh(23);
  startAgency(m, { tier: 'content_mill', brief: '' });
  advance(m, 40, ORG);
  const mill = m.apps.organic.articles.filter((a) => a.source === 'agency:content_mill');
  assert.ok(mill.length >= 6, `${mill.length}`);
  assert.ok(mill.reduce((x, a) => x + a.quality, 0) / mill.length < 0.45);
  const t = fresh(24);
  t.apps.people = { members: [{ id: 'w1', name: 'Wren', role: 'marketer', jobRole: 'content_writer', kind: 'employee', status: 'active', startDay: 0, hoursPerWeek: 40, rampWeeks: 4 }] };
  advance(t, 60, ORG);
  assert.ok(t.apps.organic.articles.filter((a) => a.source === 'team:w1').length >= 4);
});

test('technical SEO: indexation lag, a noindex accident Search Console catches, migrations with and without a redirect map', () => {
  const s = fresh(31);
  const a = publishArticle(s, { title: 'G', query: 'habit tracker for busy parents', body: text(500), judge: J(0.7) });
  assert.equal(seoArticleStats(s)[0].indexed, false, 'new pages wait to be indexed');
  technicalSetup(s, { gsc: true, sitemap: true });
  mature(s, a);
  const S = s.apps.organic.seo;
  S.noindex = { since: s.day, kind: 'noindex', noticed: false, fixedDay: null };
  advance(s, 6, ORG);
  assert.ok(S.noindex.noticed && S.noindex.noticedBy === 'gsc');
  advance(s, 10, ORG);
  assert.ok(seoSiteMult(s) < 0.05, 'site dropped out of the index');
  assert.ok(technicalIssues(s).some((i) => i.id === 'noindex'));
  assert.ok(fixIssue(s, 'noindex').ok);
  assert.ok(mistakesSummary(s).byMistake.some((m) => m.id === 'noindex_after_deploy'));
  advance(s, 25, ORG);
  assert.ok(seoSiteMult(s) > 0.99, 'reindexed after a few weeks');
  // Without Search Console nobody notices until an audit.
  const q = fresh(32);
  mature(q, publishArticle(q, { title: 'G', query: 'habit tracker for busy parents', body: text(500), judge: J(0.7) }));
  q.apps.organic.seo.noindex = { since: q.day, kind: 'robots', noticed: false, fixedDay: null };
  advance(q, 20, ORG);
  assert.equal(q.apps.organic.seo.noindex.noticed, false);
  assert.equal(fixIssue(q, 'noindex').ok, false);
  runAudit(q);
  assert.ok(fixIssue(q, 'noindex').ok);
  // Migration: the redirect map is the difference between a dip and a year of lost traffic.
  const loss = (map) => { let x = 0; for (let seed = 1; seed <= 5; seed++) { const m = fresh(40 + seed); migrateSite(m, { redirectMap: map }); m.day += 90; x += 1 - seoSiteMult(m); } return x / 5; };
  assert.ok(loss(false) > loss(true) * 3, `${loss(false)} vs ${loss(true)}`);
});

test('tool read: per-article stats for Search Console style UIs; page types convert differently', () => {
  const s = fresh(51);
  const a = mature(s, publishArticle(s, { title: 'Habitly vs Streaks', query: 'habitly vs streaks', body: text(500), judge: J(0.8) }));
  advance(s, 10, ORG);
  const st = seoArticleStats(s).find((x) => x.id === a.id);
  for (const k of ['query', 'position', 'impressions', 'clicks', 'visits', 'ageDays', 'decaying', 'indexed', 'issues']) assert.ok(k in st, k);
  assert.ok(st.indexed && st.impressions > st.clicks && st.clicks > 0);
  assert.equal(pageTypeOf('habitly vs streaks'), 'comparison');
  assert.ok(pageConversion({ pageType: 'alternatives' }) > 3 * pageConversion({ pageType: 'informational' }));
  // Topic clusters: small bonus only for related pages around a decent pillar.
  const p = mature(s, publishArticle(s, { title: 'Reading habits: the complete parent playbook', query: 'reading habits for parents', body: text(900), judge: J(0.8) }));
  for (const q of ['reading habits toddlers bedtime', 'reading habits screen time rules', 'reading habits audiobooks commute']) mature(s, publishArticle(s, { title: q, query: q, body: text(400), judge: J(0.7) }));
  const r = setPillar(s, p.id);
  assert.ok(r.linked === 3 && r.bonus);
  const m = clusterMult(s, s.apps.organic.articles.find((x) => x.pillarId === p.id));
  assert.ok(m > 1 && m <= 1.1, `${m}`);
});

test('operator tiers separate: stellar vs mediocre SEO over ~14 months (few seeds, organic only)', () => {
  const play = (tier, seed) => {
    const s = fresh(seed, 50000);
    if (tier === 'stellar') technicalSetup(s, { gsc: true, sitemap: true, deployChecks: true });
    // Stellar (indie.md): 2–4 pieces a month sustained, mostly bottom/mid-funnel, first-hand, distinct intents.
    const stellarQ = ['habitly vs streaks', 'best habit tracker', 'habit tracker for parents', 'reading tracker template', 'streaks alternative for parents who read', 'how we read 40 books with two toddlers', 'habitly pricing for families', 'kids bedtime reading routine with data', 'reading log app for families', 'audiobook tracker for commuting parents', 'goodreads alternative for busy moms', 'book challenge printable for kids', 'shared reading goals app for couples', 'storygraph vs habitly', 'reading streak app for dads', 'library book tracker for kids', 'homeschool reading tracker software', 'reading habit app for night shift parents', 'parent book club organizer tool', 'family screen time vs reading time'];
    const mediocreQ = (i) => ['habit tracker', 'habit tracker tips', 'habit tracker guide', 'best habit tracker', 'reading tips', 'reading tips guide', 'what is a habit tracker', 'habit tracking'][i % 8];
    for (let w = 0; w < 60; w++) {
      if (tier === 'stellar' && w < 40 && w % 2 === 0) publishArticle(s, { title: stellarQ[w / 2], query: stellarQ[w / 2], body: text(1400, w), judge: J(0.82, 0.05, { informational: [5, 7].includes(w / 2) }) });
      if (tier === 'stellar' && w === 50) for (const a of s.apps.organic.articles.filter((x) => s.day - x.freshDay > 270)) refreshArticle(s, a.id, { title: a.title, body: text(1500, w + 999), judge: J(0.85) });
      if (tier === 'stellar' && w % 4 === 1) answerJournalists(s);
      if (tier === 'mediocre' && w < 8) for (let k = 0; k < 4; k++) publishArticle(s, { title: mediocreQ(w * 4 + k), query: mediocreQ(w * 4 + k), body: text(500, w * 4 + k), judge: J(0.22, 0.8, { informational: true }) });
      if (tier === 'mediocre' && w === 4) { buyLinks(s, { pack: 'cheap' }); buyLinks(s, { pack: 'cheap' }); }
      if (tier === 'mediocre' && w === 30) { const a = s.apps.organic.articles.at(-1); refreshArticle(s, a.id, { title: a.title, body: a.body, judge: null }); }
      advance(s, 7, ORG);
    }
    const arts = s.apps.organic.articles;
    return { visits: arts.reduce((x, a) => x + (a.visits ?? 0), 0), read: readSeo(s), mistakes: mistakesSummary(s).byMistake.filter((m) => m.functionId === 'content_seo_geo').length, op: readOperator(s, 'content_seo_geo') };
  };
  const seeds = [1, 2, 3];
  const st = seeds.map((x) => play('stellar', x)), me = seeds.map((x) => play('mediocre', x));
  const mean = (xs, f) => xs.reduce((a, x) => a + f(x), 0) / xs.length;
  const sv = mean(st, (x) => x.visits), mv = mean(me, (x) => x.visits);
  assert.ok(sv > 3 * mv, `stellar ${sv.toFixed(0)} vs mediocre ${mv.toFixed(0)} visits`);
  assert.ok(mean(st, (x) => x.read.score) > mean(me, (x) => x.read.score) + 0.2);
  assert.ok(st.every((x) => ['stellar', 'good'].includes(x.read.tier)) && me.every((x) => ['mediocre', 'average'].includes(x.read.tier)), `${st.map((x) => x.read.tier)} / ${me.map((x) => x.read.tier)}`);
  assert.ok(mean(me, (x) => x.mistakes) > mean(st, (x) => x.mistakes) + 1);
  assert.ok(me[0].read.coaching.length >= 2 && st[0].op.tier === st[0].read.tier);
});

test('Organic renders the content, SEO health and writers tabs without errors', async () => {
  const organic = APPS.find((a) => a.id === 'organic');
  const s = fresh(61);
  const a = mature(s, publishArticle(s, { title: 'G', query: 'habit tracker for busy parents', body: text(500), judge: J(0.7) }));
  commissionArticle(s, { tier: 'mid', query: 'q for parents', brief: 'b' });
  runAudit(s);
  const el = () => { const kids = {}; return { innerHTML: '', addEventListener() {}, querySelector(sel) { return (kids[sel] ??= el()); }, kids }; };
  const ctx = { state: s, save() {}, act() {}, render() {}, navigate() {}, llm: null, toast() {} };
  for (const params of ['content', 'seo', 'writers']) {
    const root = el();
    organic.render(root, { ...ctx, params });
    const body = root.kids['#orgBody'];
    const all = body.innerHTML + (body.kids['#pubBox']?.innerHTML ?? '');
    assert.ok(all.length > 800, params);
    if (params === 'content') assert.ok(/data-refresh="/.test(all) && all.includes(a.title));
    if (params === 'seo') assert.ok(/Technical setup/.test(all) && /Buy links/.test(all));
    if (params === 'writers') assert.ok(/Review queue/.test(all));
  }
});
