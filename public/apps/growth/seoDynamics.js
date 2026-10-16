// SEO dynamics on top of the article model (state.apps.organic.articles): content decay and refresh, monthly rank
// drift and competitor pushes, Google core updates that re-judge each page on ITS helpfulness (one calendar shared
// with PLG: ./seoCalendar.js), spam updates (scaled content abuse, link spam, manual actions and reconsideration),
// cannibalization and topic clusters, link building as real work and money, technical SEO (indexation lag, stuck
// pages, noindex accidents, migrations, audits) and writers / agencies / in-house writers that actually produce
// content. Research: docs/research/seo/effects-and-risks.md (game-ready table), indie.md, seed-series-a.md.
// Numbers tagged [design] are game assumptions bounded by that research, never shown to players as statistics.
// Background processes draw from hashes of a fixed seed (no rng shift for players who never do SEO); player actions
// draw from rng(state).

import { notify } from '../../core/state.js';
import { post, addRecurring, balance } from '../../core/bank.js';
import { logMistake, registerOperatorReader, hasOperatorReader, tierFromScore, shrink, trapCoaching } from '../../core/operator.js';
import { rng, uid, round2, clamp, words, dayOfMonth } from '../../core/util.js';
import { drCap, drFactor, keywordMetrics, seoRamp, seoDailyVisits, positionFromDraws } from './organicModel.js';
import { h01, seoSeed, coreUpdateStartsOn, coreRolloutDays, spamUpdateOn } from './seoCalendar.js';
import { fireEvent, eventById } from '../marketworld/engine.js';
import { outputFor } from '../people/performance.js';
import { rampFactor } from '../people/hiring.js';
import { jobRoleOf } from '../people/catalog.js';
import { marketingQuality } from '../people/capacity.js';
import { recordPublicEvent } from '../../core/network.js';

export const SEO_DYN = {
  // Content decay: measurable at 6–12 months, accelerating after 18; 67% of pages aged 18–24 months decaying
  // (Visionary Marketing 2026, 18,400 refreshes, L-M). Loss sizes and the quality shield are [design].
  decay: { onsetDays: 270, steepDays: 540, lossAtSteep: 0.25, lossPerYearAfter: 0.3, floor: 0.35, qualityShield: 0.5, flagBelow: 0.95 },
  // Refresh: Raptive (103k refreshes) +19 pp vs matched controls, substantive (>10% word change) ~9 pp better than
  // light edits; Visionary: median +47%, 47% >+30%, 14% flat, ~10% declined (median −21%); date-only ≈ 0.
  refresh: { substantive: 0.1, dateOnly: 0.03, backfire: 0.1, backfireWorse: 0.35, backfireBetter: 0.06, flat: 0.14,
    backfireMult: [0.65, 0.92], flatMult: [0.97, 1.03], lift: [1.2, 2.0], liftSkew: 1.6, lightScale: 0.4, youngDays: 180, youngScale: 0.35 /* [design] little to recover on young pages */ },
  // Monthly drift and competitors: new pages bounce, no clean primary source (research §1) → all [design].
  drift: { pull: 0.4, noise: 1, noiseLowQ: 2, compChance: { informational: 0.08, commercial: 0.12 }, compPush: [1, 4], compCap: 20 },
  // Core updates: affected low-quality pages −30–70%, winners +20–50% (trackers, L) → bands by helpfulness [design].
  coreBands: [[0.7, [0.95, 1.4]], [0.5, [0.85, 1.15]], [0.3, [0.6, 1.0]], [0, [0.3, 0.7]]],
  coreSite: { unhelpfulShare: 0.4, minPages: 5, mult: 0.75 }, // site-wide helpfulness signal (HCU folded into core, Mar 2024) [design size]
  // Scaled content abuse (spam policies, Mar 2024): ~1.7% of sites deindexed, ~2% manual actions in that wave,
  // half of them 90–100% AI content (Nuttall; Originality.ai, M). Thresholds and demotion sizes [design].
  scaled: { minLow: 10, share: 0.5, mult: [0.3, 0.5], manualChance: 0.15, liftShare: 0.25 },
  // Link spam: SpamBrain ignores most paid links; obvious patterns get a manual action (Google; Ahrefs, M) [design rates].
  linkSpam: { neutralizeChance: 0.7, manualPerRiskyLink: 0.04, manualCap: 0.45, manualMult: 0.4 },
  manualDeindexMult: 0.02,
  reconsideration: { hours: 6, reviewDays: [14, 42], recoverDays: 60 }, // manual-action reviews take weeks (Google)
  disavowHit: { mult: 0.93, days: 60 }, // Ahrefs disavow test: −7.1% in 20 days (tiny N, M)
  // Technical: indexation lag days [design]; JS rendering median ~10 s but fragile, p99 ~18 h (Vercel/MERJ) → CSR
  // marketing sites index slower and drop pages [design]; noindex/robots accident rate [design, no case data].
  index: { lagSetup: [2, 10], lagNoSetup: [7, 30], csrExtra: [7, 21], stuckSetup: 0.03, stuckNoSetup: 0.1, stuckSlop: 0.15, stuckCsr: 0.1, fixMinQuality: 0.35 },
  noindex: { perYear: 0.3, deployChecksMult: 0.25, dropDays: 14, reindexDays: 21, gscNoticeDays: 5 },
  // Migrations: SEJ 892 domains: ~523 days mean to recover, 17% never in 1,000 days; SALT 1,052: 59.5% at 1 year,
  // 13.9% never; 30–40% loss without a redirect map vs 5–10% with one (unattributed); well run 10–25% early dip (L).
  migration: { mapLoss: [0.05, 0.15], mapRecovery: [60, 180], noMapLoss: [0.3, 0.5], noMapRecovery: [300, 700], neverChance: 0.17, neverResidual: 0.4, mapHours: 12, noMapHours: 3 },
  // Cannibalization: no controlled data (Ahrefs: a problem only when it hurts) → group keeps 80% of its best page [design].
  cannibal: { similarity: 0.6, groupKeeps: 0.8, mistakeAfterDays: 60, mergeHours: 1.5, mergeBonus: 1.1, mergeLossChance: 0.15 },
  // Topic clusters: no effect size found (research §1) → keep it small [design].
  cluster: { min: 3, perArticle: 0.02, perPillar: 0.03, cap: 5, pillarMinQuality: 0.5, hoursPerLink: 0.25 },
  // Link building. Gains are DR points before the log-scale cap (drCap) [design]. Costs: Ahrefs/BuzzStream (M).
  links: {
    guestAccept: [0.12, 0.6], guestGain: 1.5, guestDays: [14, 35], pitchHours: 1.5,
    haroHours: 3, haroChance: 0.3, haroGain: 1.5, haroDays: [7, 30], // 1–3 links/month at 2–4 h/week (indie.md §5) [design]
    prCostPerLink: 597, prNoAssetFactor: 0.3, prGain: 2.5, prDays: [30, 60], prHours: 4, prMin: 1500, // BuzzStream 2025 avg cost per earned link
    toolPerMonth: [0.5, 1.5], toolGain: 1.2, // free tools: best indie link earner (indie.md §1, unverified) [design]
    packs: {
      cheap: { label: 'Link package (10 links on a marketplace)', n: 10, usdEach: 112, risk: 1, gain: 0.8 }, // marketplace median $112 (22k placements)
      insertion: { label: 'Link insertions in existing posts (5)', n: 5, usdEach: 361, risk: 0.7, gain: 1.2 }, // Ahrefs outreach test avg ~$361
      vendor_guest: { label: 'Paid guest posts via a vendor (3)', n: 3, usdEach: 1459, risk: 0.4, gain: 2 }, // BuzzStream 2025 via vendor ~$1,459
    },
    removeHours: 4,
  },
  // Page-type conversion vs the landing baseline (~3.8% median). Vendor claims haircut (indie.md §4 sim recommendation):
  // blog 0.3–1%, comparison 2–5%, alternatives 2–6%, pricing / use-case 5–10% [design multipliers].
  pageConv: { informational: 0.2, comparison: 0.9, alternatives: 1.0, bofu: 1.1 },
  impressionShare: [[10, 1], [20, 0.3], [50, 0.04], [Infinity, 0.005]], // [design] share of searches that see the URL
};

// Freelance writers by tier (seed-series-a.md §2: WalletGrower Apr 2026 n=47; GTM 80/20 citing SoloPricing 2026):
// junior $150–300, mid $300–600, specialist $1,000–2,500 per post. Quality ranges, slop and error odds are [design];
// founder edit time 3–6 h for writers without product knowledge (§2 failure modes).
export const WRITERS = {
  junior: { label: 'Junior freelancer', usd: 225, q: [0.18, 0.5], slopP: 0.35, errP: 0.15, leadDays: 7, editHours: 3 },
  mid: { label: 'Skilled B2B freelancer', usd: 450, q: [0.38, 0.68], slopP: 0.12, errP: 0.06, leadDays: 10, editHours: 2 },
  specialist: { label: 'Specialist SaaS writer', usd: 1500, q: [0.6, 0.88], slopP: 0.02, errP: 0.02, leadDays: 14, editHours: 1 },
};
// Agency retainers (Ahrefs survey of 439 providers: avg $3,209/mo agency; credible B2B SaaS content-led $2.5–10k/mo;
// cheap AI-spun $100–200/post). Output per month, quality and link practices are [design] from the failure modes.
export const AGENCIES = {
  content_mill: { label: 'Cheap content agency (AI-spun, no interviews)', monthly: 1200, perMonth: 8, q: [0.12, 0.4], slopP: 0.6, errP: 0.2, earned: 0, bought: 0, picks: 'generic', editHours: 3 },
  seo_agency: { label: 'Typical SEO agency retainer', monthly: 3200, perMonth: 4, q: [0.35, 0.65], slopP: 0.15, errP: 0.08, earned: 0, bought: 2, picks: 'mixed', editHours: 1.5 },
  specialist: { label: 'B2B SaaS content-led agency', monthly: 7500, perMonth: 4, q: [0.6, 0.86], slopP: 0.03, errP: 0.03, earned: 1, bought: 0, picks: 'bofu', editHours: 1 },
};
const AUTO_PUBLISH_DAYS = 7; // agencies and in-house writers publish to your CMS if you don't review [design]

const STOP = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'and', 'or', 'with', 'how', 'what', 'is', 'are', 'your', 'my', 'do', 'does', 'i', 'you', 'can', 'it', 'at', 'by', 'from', 'guide', 'ultimate', '2026', '2025']);
const tokens = (q) => String(q ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };
const lerp = ([lo, hi], u) => lo + (hi - lo) * u;
const live = (a) => (a.status ?? 'live') === 'live' && a.tier != null; // malformed stubs (tests, old saves) never rank
export const liveArticles = (state) => (state.apps?.organic?.articles ?? []).filter(live);

export function pageTypeOf(query) {
  const q = String(query ?? '').toLowerCase();
  if (/\b(vs\.?|versus|compared?|comparison)\b/.test(q)) return 'comparison';
  if (/\balternatives?\b/.test(q)) return 'alternatives';
  if (/\b(best|pricing|price|cost|software|tool|tools|app for|platform|template|for (small|teams|agencies|startups))\b/.test(q)) return 'bofu';
  return 'informational';
}
// How helpful a page reads to Google's helpfulness systems: quality, discounted by AI slop.
export const helpfulness = (a) => clamp((a.quality ?? 0.5) * (1 - 0.7 * (a.slop ?? 0)), 0, 1);
export { drFactor };

// ---------------- slice ----------------

export function ensureSeo(state) {
  const O = (state.apps.organic ??= {}); // ensureOrganic() fills the rest with ??= later
  const S = (O.seo ??= {});
  S.seed ??= seoSeed(state);
  S.tech ??= { setup: false, gsc: false, sitemap: false, deployChecks: false, rendering: 'static', setupDay: null, lastAudit: null, found: [] };
  S.noindex ??= null; // { since, kind, noticed, fixedDay, lost }
  S.migration ??= null; // { day, loss, recoveryDays, residual, redirectMap }
  S.penalty ??= null; // { kind 'scaled'|'links', manual, since, mult, liftDay, reconsider }
  S.disavow ??= null;
  S.links ??= { earned: 0, bought: 0, boughtRisk: 0, boughtDr: 0, boughtUsd: 0, neutralized: 0, pending: [] };
  S.updates ??= []; // { day, kind, rollout, change, lowShare }
  S.drafts ??= [];
  S.agency ??= null;
  S.plan ??= [];
  S.planUsed ??= 0;
  S.groups ??= {}; // groupKey -> { ids, since }
  S.groupsDirty ??= true;
  S.history ??= [];
  S.counts ??= { refreshSubstantive: 0, refreshLight: 0, refreshDateOnly: 0, refreshDecaying: 0, merged: 0, pruned: 0, audits: 0, commissioned: 0, publishedUnedited: 0, edited: 0, guestPitches: 0, haro: 0, prCampaigns: 0, packsBought: 0 };
  for (const a of O.articles ?? []) ensureArticle(a);
  return S;
}
function ensureArticle(a) {
  a.status ??= 'live';
  a.pageType ??= pageTypeOf(a.query);
  a.luck ??= [h01(`${a.id}|u1`), h01(`${a.id}|u2`)];
  a.freshDay ??= a.day;
  a.coreMult ??= 1; a.corePrev ??= 1; a.coreStart ??= null; a.coreEnd ??= null;
  a.compPush ??= 0;
  a.refreshMult ??= 1;
  a.indexLag ??= 0;
  a.stuck ??= false;
  a.source ??= 'founder';
  a.wk ??= [];
  a.impr ??= 0; a.clicks ??= 0;
  a.refreshes ??= [];
  a.cannibalMult ??= 1;
  return a;
}

// ---------------- article creation (founder, writers, agencies, team) ----------------

// Target ranking given the page's quality and today's domain rating: the article's fixed luck draws decide whether it
// is one of the few pages that make the top 10 (Ahrefs: ~5.7% of new pages in a year; far fewer on low-DR sites).
// briefOffset: lasting effect of a content-optimizer brief (searchtools/tools.js applyBriefs), so drift keeps it.
export function targetPosition(a, dr) {
  const p = positionFromDraws({ tier: a.tier, quality: a.quality, slop: a.slop, dr }, a.luck[0], a.luck[1]);
  return a.briefOffset ? Math.min(100, Math.max(1, p + a.briefOffset)) : p;
}

export function createArticle(state, { title, query, body = '', judge, source = 'founder' }) {
  const O = state.apps.organic;
  const S = ensureSeo(state);
  const km = keywordMetrics(query, state.company.model, { brand: state.company.name });
  const id = uid('art');
  const luck = [rng(state), rng(state)]; // same two draws drawPosition used: the shared stream is unchanged
  const a = ensureArticle({ id, day: state.day, title, query, words: words(body) || judge.words || 0, body: String(body).slice(0, 8000), ...km,
    informational: judge.informational ?? !km.commercial, quality: judge.quality, slop: judge.slop ?? 0, luck, source,
    visits: 0, signups: 0, judge: { results: judge.results ?? [], mock: judge.mock ?? true } });
  a.position = targetPosition(a, O.dr);
  a.cited = rng(state) < (judge.citable ?? 0) * (a.slop > 0.5 ? 0.3 : 1);
  if (a.cited) O.citations += 1;
  // Indexation: crawl discovery takes days to weeks; Search Console + sitemap shortens it; client-side rendering adds
  // a render queue and drops some pages; low-value pages often sit in "Discovered – currently not indexed".
  const I = SEO_DYN.index, T = S.tech;
  const u = h01(`idx|${id}`), v = h01(`stk|${id}`);
  a.indexLag = Math.round(lerp(T.setup ? I.lagSetup : I.lagNoSetup, u) + (T.rendering === 'csr' ? lerp(I.csrExtra, u) : 0));
  a.stuck = v < (T.setup ? I.stuckSetup : I.stuckNoSetup) + (a.slop > 0.5 ? I.stuckSlop : 0) + (T.rendering === 'csr' ? I.stuckCsr : 0);
  O.articles.unshift(a);
  S.groupsDirty = true;
  recordPublicEvent(state, 'blog_post_published', { articleId: id, title, source });
  return a;
}

// ---------------- traffic ----------------

export function decayMult(a, day) {
  const D = SEO_DYN.decay;
  const t = day - (a.freshDay ?? a.day);
  if (t <= D.onsetDays) return 1;
  const loss = t <= D.steepDays ? D.lossAtSteep * (t - D.onsetDays) / (D.steepDays - D.onsetDays)
    : D.lossAtSteep + (1 - D.lossAtSteep) * (1 - Math.exp(-D.lossPerYearAfter * (t - D.steepDays) / 365));
  return Math.max(D.floor, 1 - loss * (1 - D.qualityShield * clamp(a.quality ?? 0.5, 0, 1)));
}
export function coreMultNow(a, day) {
  if (a.coreEnd == null || day >= a.coreEnd) return a.coreMult ?? 1;
  const f = clamp((day - a.coreStart) / Math.max(1, a.coreEnd - a.coreStart), 0, 1);
  return a.corePrev + (a.coreMult - a.corePrev) * f;
}
export function clusterMult(state, a) {
  const C = SEO_DYN.cluster;
  const arts = state.apps.organic.articles;
  if (a.isPillar) {
    const n = arts.filter((x) => live(x) && x.pillarId === a.id).length;
    return n >= C.min && a.quality >= C.pillarMinQuality ? 1 + C.perPillar * Math.min(n, C.cap) : 1;
  }
  if (!a.pillarId) return 1;
  const p = arts.find((x) => x.id === a.pillarId);
  if (!p || !live(p) || p.quality < C.pillarMinQuality) return 1;
  const n = arts.filter((x) => live(x) && x.pillarId === p.id).length;
  return n >= C.min ? 1 + C.perArticle * Math.min(n, C.cap) : 1;
}
export const isIndexed = (state, a) => live(a) && !a.stuck && state.day - a.day >= (a.indexLag ?? 0);

// Site-wide multiplier from penalties, manual actions, migrations, noindex accidents and needless disavows.
export function seoSiteMult(state) {
  const S = state.apps?.organic?.seo;
  if (!S) return 1;
  const day = state.day;
  let m = 1;
  const P = S.penalty;
  if (P) m *= P.liftDay != null ? P.mult + (1 - P.mult) * clamp((day - P.liftDay) / SEO_DYN.reconsideration.recoverDays, 0, 1) : P.mult;
  const M = S.migration;
  if (M) m *= 1 - M.loss * Math.max(M.residual, 1 - (day - M.day) / M.recoveryDays);
  const N = S.noindex;
  if (N) {
    const X = SEO_DYN.noindex;
    const dropped = N.fixedDay == null ? clamp((day - N.since) / X.dropDays, 0, 1) : N.droppedAtFix * (1 - clamp((day - N.fixedDay) / X.reindexDays, 0, 1));
    m *= 1 - dropped;
  }
  if (S.disavow && day < S.disavow.until) m *= S.disavow.mult;
  return m;
}
const imprShare = (pos) => SEO_DYN.impressionShare.find(([p]) => pos <= p)[1];
export function shownPosition(a, day) {
  const age = day - a.day;
  const ramp = seoRamp(age, a.tier);
  if (ramp < 0.2) return null;
  return Math.round(a.position + (1 - ramp) * 40);
}

// Expected visits and impressions of one article today; also books them into the article's weekly buckets.
export function articleDay(state, a, { shock = 1, demand = 1, site = seoSiteMult(state) } = {}) {
  if (!live(a) || !isIndexed(state, a)) return { visits: 0, impressions: 0 };
  const day = state.day, age = day - a.day;
  const base = seoDailyVisits({ volume: a.volume, position: a.position, informational: a.informational, ageDays: age, tier: a.tier });
  const m = shock * demand * site * decayMult(a, day) * a.refreshMult * coreMultNow(a, day) * a.cannibalMult * clusterMult(state, a);
  const visits = base * m;
  const pos = shownPosition(a, day) ?? 90;
  const impressions = (a.volume / 30) * imprShare(pos) * shock * demand * site * coreMultNow(a, day);
  const w = Math.floor(day / 7);
  let b = a.wk.at(-1);
  if (!b || b.w !== w) { b = { w, c: 0, i: 0 }; a.wk.push(b); if (a.wk.length > 16) a.wk.shift(); }
  b.c += visits; b.i += impressions;
  a.clicks += visits; a.impr += impressions;
  return { visits, impressions };
}
export const pageConversion = (a) => SEO_DYN.pageConv[a.pageType ?? pageTypeOf(a.query)] ?? SEO_DYN.pageConv.informational;

export function isDecaying(state, a) {
  if (!live(a) || !isIndexed(state, a)) return false;
  const D = SEO_DYN.decay;
  if (state.day - (a.freshDay ?? a.day) <= D.onsetDays) return false;
  if (decayMult(a, state.day) < D.flagBelow) return true;
  // Search Console style flag: clicks down 20%+ over ~90 days (seed-series-a.md §6 [design]).
  const wk = a.wk ?? [];
  if (wk.length < 13) return false;
  const sum = (xs) => xs.reduce((s, x) => s + x.c, 0);
  const now = sum(wk.slice(-5, -1)), then = sum(wk.slice(-13, -9));
  return then > 1 && now < 0.8 * then;
}

// ---------------- daily ----------------

export function seoDay(state) {
  const O = state.apps.organic;
  const S = ensureSeo(state);
  const day = state.day;
  const arts = O.articles.filter(live);
  if (coreUpdateStartsOn(state, day)) startCoreUpdate(state);
  if (spamUpdateOn(state, day)) runSpamUpdate(state);
  if (!arts.length && !S.drafts.length && !S.agency && !S.links.pending.length && !teamWriters(state).length) return;
  worldResponse(state);
  technicalDay(state);
  draftsDay(state);
  linksDay(state);
  if (S.groupsDirty || day % 7 === 0) computeGroups(state);
  for (const a of arts) { const age = day - a.day; if (age > 0 && age % 30 === 0) monthlyDrift(state, a); }
  // Reconsideration requests are decided after a few weeks.
  const R = S.penalty?.reconsider;
  if (R && day >= R.decideDay) decideReconsideration(state);
  if (S.migration && S.migration.residual === 0 && day - S.migration.day >= S.migration.recoveryDays) { S.history.unshift({ kind: 'migration', ...S.migration, endDay: day }); S.migration = null; }
  if (S.noindex?.fixedDay != null && day - S.noindex.fixedDay >= SEO_DYN.noindex.reindexDays) S.noindex = null;
  if (S.penalty?.liftDay != null && day - S.penalty.liftDay >= SEO_DYN.reconsideration.recoverDays) { S.history.unshift({ ...S.penalty, endDay: day }); S.penalty = null; }
}

function monthlyDrift(state, a) {
  const O = state.apps.organic, D = SEO_DYN.drift, age = state.day - a.day;
  const target = targetPosition(a, O.dr);
  // A competitor publishes a better page for this query; strong pages and authoritative domains hold their spot.
  const pC = a.pageType === 'informational' ? D.compChance.informational : D.compChance.commercial;
  if (h01(`comp|${a.id}|${age}`) < pC) {
    const strength = 0.65 * helpfulness(a) + 0.35 * clamp(O.dr / 60, 0, 1);
    if (h01(`compS|${a.id}|${age}`) > strength) a.compPush = Math.min(D.compCap, a.compPush + Math.round(lerp(D.compPush, h01(`compN|${a.id}|${age}`))));
  }
  const noise = (h01(`drift|${a.id}|${age}`) - 0.5) * 2 * (D.noise + D.noiseLowQ * (1 - clamp(a.quality, 0, 1)));
  a.position = clamp(Math.round(a.position + (target + a.compPush - a.position) * D.pull + noise), 1, 100);
}

// Rough value of a visit for mistake costs: landing ~3% × trial→paid ~15% [design].
const VISIT_CUSTOMERS = 0.004;
function expectedDaily(state, a) {
  return seoDailyVisits({ volume: a.volume, position: a.position, informational: a.informational, ageDays: state.day - a.day, tier: a.tier }) * decayMult(a, state.day) * a.refreshMult * a.cannibalMult;
}

// ---- Google core update: every page re-judged on its own helpfulness; recovery waits for the next update ----
export function startCoreUpdate(state) {
  const O = state.apps.organic, S = ensureSeo(state), day = state.day;
  const rollout = coreRolloutDays(state, day);
  const arts = O.articles.filter(live);
  const low = arts.filter((a) => helpfulness(a) < 0.3).length;
  const lowShare = arts.length ? low / arts.length : 0;
  const C = SEO_DYN.coreSite;
  const siteF = arts.length >= C.minPages && lowShare >= C.unhelpfulShare ? C.mult : 1;
  let before = 0, after = 0;
  for (const a of arts) {
    const band = SEO_DYN.coreBands.find(([lo]) => helpfulness(a) >= lo)[1];
    const now = coreMultNow(a, day);
    a.corePrev = now;
    a.coreMult = round2(lerp(band, h01(`gcore|${a.id}|${day}`)) * siteF);
    a.coreStart = day; a.coreEnd = day + rollout;
    const w = expectedDaily(state, a);
    before += w * now; after += w * a.coreMult;
  }
  const change = before > 0 ? after / before - 1 : 0;
  S.updates.unshift({ day, kind: 'core', rollout, endDay: day + rollout, pages: arts.length, lowShare: round2(lowShare), siteWide: siteF < 1, change: round2(change) });
  if (S.updates.length > 40) S.updates.length = 40;
  if (!arts.length) return S.updates[0];
  notify(state, `Google confirmed a core update (rolling out over ~${rollout} days). Each page is re-assessed on its own helpfulness${S.tech.gsc ? `; Search Console will show the change. Estimated effect on your SEO traffic: ${change >= 0 ? '+' : ''}${Math.round(change * 100)}%` : ''}.`, { type: change < -0.1 ? 'bad' : 'info', app: 'organic' });
  if (change < -0.15 && low > 0) {
    const lost = (before - after) * 120;
    logMistake(state, { functionId: 'content_seo_geo', id: 'core_update_unhelpful', label: 'Core update demoted thin / AI-written pages', app: 'organic', delayed: true, circles: true,
      cost: { customers: Math.round(lost * VISIT_CUSTOMERS), days: 120 },
      detail: `${low} of ${arts.length} live pages read as unhelpful (low quality or AI slop)${siteF < 1 ? ', enough to drag the whole site down' : ''}. SEO traffic ${Math.round(change * 100)}%. Recovery waits for the next core update, after you rewrite, merge or remove those pages.`,
      key: `core_unhelpful:${day}` });
  }
  const ev = eventById('google_core_update');
  if (ev && state.apps.world) { try { fireEvent(state, ev); } catch { /* world app absent */ } }
  return S.updates[0];
}
// World "core update" responses that do SEO work: "prune/merge thin pages" really removes the weakest pages.
function worldResponse(state) {
  const W = state.apps.world;
  if (!W?.active) return;
  for (const inst of W.active) {
    if (inst.eventId !== 'google_core_update' || inst.seoDone || inst.response !== 'prune') continue;
    inst.seoDone = true;
    let n = 0;
    for (const a of state.apps.organic.articles) if (live(a) && helpfulness(a) < 0.3) { a.status = 'pruned'; a.prunedDay = state.day; n++; }
    ensureSeo(state).counts.pruned += n;
    ensureSeo(state).groupsDirty = true;
    inst.note = `${inst.note ?? ''} ${n} thin page(s) removed; the next core update re-judges the site.`.trim();
  }
}

// ---- Spam update: scaled content abuse and link spam ----
export function runSpamUpdate(state) {
  const O = state.apps.organic, S = ensureSeo(state), day = state.day, L = SEO_DYN.scaled;
  const arts = O.articles.filter(live);
  const recentLow = arts.filter((a) => day - a.day <= 365 && helpfulness(a) < 0.3).length;
  const lowAll = arts.filter((a) => helpfulness(a) < 0.3).length;
  const share = arts.length ? lowAll / arts.length : 0;
  const rec = { day, kind: 'spam', low: recentLow, share: round2(share), outcome: 'no effect' };
  S.updates.unshift(rec);
  if (S.updates.length > 40) S.updates.length = 40;
  // An algorithmic scaled-content demotion lifts only at a later spam update, after the cleanup.
  if (S.penalty && !S.penalty.manual && S.penalty.liftDay == null && S.penalty.kind === 'scaled' && share < L.liftShare) { S.penalty.liftDay = day; rec.outcome = 'demotion lifted'; notify(state, 'A Google spam update re-assessed your site: the scaled-content demotion is lifting.', { type: 'good', app: 'organic' }); }
  if (!S.penalty && recentLow >= L.minLow && share >= L.share) {
    const manual = h01(`gspamman|${S.seed}|${day}`) < L.manualChance;
    const mult = manual ? SEO_DYN.manualDeindexMult : round2(lerp(L.mult, h01(`gspamm|${S.seed}|${day}`)));
    S.penalty = { kind: 'scaled', manual, since: day, mult, liftDay: null, reconsider: null };
    rec.outcome = manual ? 'manual action: pure spam (deindexed)' : 'scaled content abuse demotion';
    const lostDaily = arts.reduce((s, a) => s + expectedDaily(state, a), 0) * (1 - mult);
    notify(state, manual ? 'Search Console: manual action "Scaled content abuse". Your pages were removed from Google. Clean up, then file a reconsideration request.' : 'A Google spam update demoted your whole site for scaled low-value content. Rewrite, merge or remove the thin pages; the demotion lifts only at a later spam update.', { type: 'bad', app: 'organic' });
    logMistake(state, { functionId: 'content_seo_geo', id: 'scaled_content_abuse', label: manual ? 'Manual action for scaled content abuse' : 'Site demoted for scaled low-value content', app: 'organic', delayed: true, circles: true,
      cost: { customers: Math.round(lostDaily * 180 * VISIT_CUSTOMERS), days: 180, hours: Math.round(lowAll * 0.5), reputation: 1 },
      detail: `${lowAll} of ${arts.length} live pages are thin or AI slop (${recentLow} published in the last year). Google's spam policy targets mass-produced pages with no added value, AI or human.`, key: `scaled:${day}` });
  }
  // Link spam: paid links are mostly ignored; obvious patterns get a manual action.
  const X = SEO_DYN.linkSpam, Lk = S.links;
  if (Lk.boughtRisk > 0) {
    if (!S.penalty && h01(`glink|${S.seed}|${day}`) < Math.min(X.manualCap, X.manualPerRiskyLink * Lk.boughtRisk)) {
      S.penalty = { kind: 'links', manual: true, since: day, mult: X.manualMult, liftDay: null, reconsider: null };
      rec.outcome = 'manual action: unnatural links';
      const lostDaily = arts.reduce((s, a) => s + expectedDaily(state, a), 0) * (1 - X.manualMult);
      notify(state, 'Search Console: manual action "Unnatural links to your site". Rankings dropped site-wide. Remove or disavow the paid links, then file a reconsideration request.', { type: 'bad', app: 'organic' });
      logMistake(state, { functionId: 'content_seo_geo', id: 'link_spam_manual_action', label: 'Manual action for bought links', app: 'organic', delayed: true, circles: true,
        cost: { usd: Math.round(Lk.boughtUsd), customers: Math.round(lostDaily * 120 * VISIT_CUSTOMERS), hours: SEO_DYN.links.removeHours + SEO_DYN.reconsideration.hours, days: 120, reputation: 1 },
        detail: `${Lk.bought} paid links ($${Math.round(Lk.boughtUsd).toLocaleString()}) violate Google's link spam policy. Recovery needs removal/disavow, a reconsideration request (weeks) and time.`, key: `linkspam:${day}` });
    } else if (h01(`glinkn|${S.seed}|${day}`) < X.neutralizeChance) {
      O.dr = Math.max(2, O.dr - Lk.boughtDr);
      O.linkEvents = Math.max(0, (O.linkEvents ?? 0) - Lk.bought);
      rec.outcome = `${Lk.bought} paid links ignored`;
      logMistake(state, { functionId: 'content_seo_geo', id: 'bought_links_ignored', label: 'Paid links neutralized by Google', app: 'organic', delayed: true,
        cost: { usd: Math.round(Lk.boughtUsd) }, detail: `Google's SpamBrain discounted ${Lk.bought} paid links: the $${Math.round(Lk.boughtUsd).toLocaleString()} bought nothing lasting and your domain rating fell back.`, key: `linkign:${day}` });
      Lk.neutralized += Lk.bought; Lk.bought = 0; Lk.boughtRisk = 0; Lk.boughtDr = 0; Lk.boughtUsd = 0;
    }
  }
  return rec;
}

/** Remove or disavow the paid links (4 h). With no paid links this is a needless disavow that costs traffic. */
export function removeBoughtLinks(state, { dryRun = false } = {}) {
  const O = state.apps.organic, S = ensureSeo(state), Lk = S.links;
  const hoursCost = SEO_DYN.links.removeHours;
  if (dryRun) return { ok: true, hoursCost, usdCost: 0 };
  if (Lk.bought > 0) {
    O.dr = Math.max(2, O.dr - Lk.boughtDr);
    O.linkEvents = Math.max(0, (O.linkEvents ?? 0) - Lk.bought);
    const n = Lk.bought;
    Lk.bought = 0; Lk.boughtRisk = 0; Lk.boughtDr = 0;
    if (S.penalty?.kind === 'links') S.penalty.fixed = true;
    return { ok: true, removed: n, hoursCost, usdCost: 0 };
  }
  S.disavow = { day: state.day, until: state.day + SEO_DYN.disavowHit.days, mult: SEO_DYN.disavowHit.mult };
  logMistake(state, { functionId: 'content_seo_geo', id: 'needless_disavow', label: 'Disavowed "toxic" links without a manual action', app: 'organic', cost: { hours: hoursCost }, detail: 'Google already ignores most junk links; disavowing real ones cost traffic (Ahrefs test: about −7% in 20 days).', key: `disavow:${Math.floor(state.day / 30)}` });
  return { ok: true, removed: 0, hoursCost, usdCost: 0, needless: true };
}

/** File a reconsideration request after a manual action (6 h). Accepted in 2–6 weeks only if the cause is fixed. */
export function requestReconsideration(state) {
  const S = ensureSeo(state), P = S.penalty;
  if (!P?.manual) return { ok: false, error: 'There is no manual action to reconsider.', hoursCost: 0 };
  if (P.reconsider) return { ok: false, error: 'A reconsideration request is already under review.', hoursCost: 0 };
  P.reconsider = { day: state.day, decideDay: state.day + Math.round(lerp(SEO_DYN.reconsideration.reviewDays, rng(state))) };
  return { ok: true, decideDay: P.reconsider.decideDay, hoursCost: SEO_DYN.reconsideration.hours };
}
function causeFixed(state) {
  const S = state.apps.organic.seo, P = S.penalty;
  if (P.kind === 'links') return S.links.bought === 0;
  const arts = state.apps.organic.articles.filter(live);
  return !arts.length || arts.filter((a) => helpfulness(a) < 0.3).length / arts.length < SEO_DYN.scaled.liftShare;
}
function decideReconsideration(state) {
  const S = state.apps.organic.seo, P = S.penalty;
  const ok = causeFixed(state);
  if (ok) { P.liftDay = state.day; P.reconsider = null; notify(state, 'Search Console: reconsideration request approved. The manual action is revoked; rankings return over the next weeks.', { type: 'good', app: 'organic' }); return; }
  P.reconsider = null;
  notify(state, 'Search Console: reconsideration request rejected. The violation is still there.', { type: 'bad', app: 'organic' });
  logMistake(state, { functionId: 'content_seo_geo', id: 'reconsideration_rejected', label: 'Reconsideration request rejected (cause not fixed)', app: 'organic', circles: true, cost: { hours: SEO_DYN.reconsideration.hours, days: 30 }, detail: P.kind === 'links' ? 'The paid links are still live: remove or disavow them first.' : 'Most pages are still thin: rewrite, merge or remove them first.', key: `recon:${state.day}` });
}

// ---- Technical SEO ----
function technicalDay(state) {
  const S = state.apps.organic.seo, day = state.day, X = SEO_DYN.noindex;
  if (!S.noindex && h01(`gnoidx|${S.seed}|${day}`) < X.perYear * (S.tech.deployChecks ? X.deployChecksMult : 1) / 365) {
    S.noindex = { since: day, kind: h01(`gnoidxk|${S.seed}|${day}`) < 0.5 ? 'noindex' : 'robots', noticed: false, fixedDay: null };
  }
  const N = S.noindex;
  if (N && !N.noticed && N.fixedDay == null && S.tech.gsc && day - N.since >= X.gscNoticeDays) {
    N.noticed = true; N.noticedBy = 'gsc';
    notify(state, `Search Console: "${N.kind === 'noindex' ? "Excluded by 'noindex' tag" : 'Blocked by robots.txt'}" is rising fast on your site since a recent deploy. Fix it in Organic → Content, SEO & GEO.`, { type: 'bad', app: 'organic' });
  }
}

/** Technical setup: Search Console + Bing, sitemap, indexable templates, internal links; optional SEO checks in deploys. */
export function technicalSetup(state, { gsc = true, sitemap = true, deployChecks = false, dryRun = false } = {}) {
  const S = ensureSeo(state), T = S.tech;
  const hoursCost = (gsc && !T.gsc ? 1 : 0) + (sitemap && !T.sitemap ? 1.5 : 0) + (!T.setup ? 2 : 0) + (deployChecks && !T.deployChecks ? 2 : 0); // research table: 4 h average, 6–10 h stellar incl. audit [design]
  if (dryRun) return { ok: true, hoursCost, usdCost: 0 };
  T.gsc = T.gsc || gsc; T.sitemap = T.sitemap || sitemap; T.deployChecks = T.deployChecks || deployChecks;
  T.setup = T.gsc && T.sitemap; T.setupDay ??= state.day;
  return { ok: true, hoursCost, usdCost: 0 };
}

/** Every technical issue on the site right now (the truth; the UI shows it after an audit). Stable read for tools. */
export function technicalIssues(state) {
  const O = state.apps?.organic;
  if (!O) return [];
  const S = ensureSeo(state), out = [], day = state.day;
  const arts = O.articles.filter(live);
  if (!S.tech.gsc) out.push({ id: 'no_search_console', severity: 'warn', label: 'Search Console not verified', detail: 'You cannot see indexing errors, queries or manual actions.', articleIds: [] });
  if (S.noindex && S.noindex.fixedDay == null) out.push({ id: 'noindex', severity: 'bad', label: S.noindex.kind === 'noindex' ? "Site-wide 'noindex' tag after a deploy" : 'robots.txt blocks the site after a deploy', detail: `Since ${day - S.noindex.since} days ago; pages are dropping out of Google.`, articleIds: arts.map((a) => a.id) });
  const stuck = arts.filter((a) => a.stuck);
  if (stuck.length) out.push({ id: 'not_indexed', severity: 'warn', label: `${stuck.length} page(s) "Discovered – currently not indexed"`, detail: 'Improve them and request indexing; low-value pages stay out.', articleIds: stuck.map((a) => a.id) });
  if (S.tech.rendering === 'csr') out.push({ id: 'csr_rendering', severity: 'warn', label: 'Marketing pages render client-side', detail: 'Google renders JS, but slower and less reliably; SSR/static is safer.', articleIds: [] });
  for (const [k, g] of Object.entries(S.groups)) out.push({ id: `cannibalization:${k}`, severity: 'warn', label: `${g.ids.length} pages compete for the same query`, detail: 'Merge into the strongest page and 301 the others.', articleIds: g.ids });
  const dec = arts.filter((a) => isDecaying(state, a));
  if (dec.length) out.push({ id: 'decaying', severity: 'info', label: `${dec.length} page(s) decaying`, detail: 'Clicks are sliding with age. Refresh substantively (facts, structure, intent), not just the date.', articleIds: dec.map((a) => a.id) });
  const thin = arts.filter((a) => helpfulness(a) < 0.3);
  if (thin.length >= 3) out.push({ id: 'thin_content', severity: thin.length / Math.max(1, arts.length) >= 0.4 ? 'bad' : 'warn', label: `${thin.length} thin or AI-slop page(s)`, detail: 'Scaled low-value content risks a site-wide demotion at the next spam or core update.', articleIds: thin.map((a) => a.id) });
  if (S.penalty?.manual) out.push({ id: 'manual_action', severity: 'bad', label: `Manual action: ${S.penalty.kind === 'links' ? 'unnatural links' : 'scaled content abuse'}`, detail: S.penalty.reconsider ? 'Reconsideration under review.' : 'Fix the cause, then request reconsideration.', articleIds: [] });
  if (S.migration && !S.migration.redirectMap) out.push({ id: 'migration_redirects', severity: 'bad', label: 'Migration without a full redirect map', detail: 'Old URLs 404 or redirect to the home page; their rankings are lost until rebuilt.', articleIds: [] });
  return out;
}

/** Technical audit with Search Console + a free crawler (2 h): finds the issues and marks accidents as noticed. */
export function runAudit(state, { dryRun = false } = {}) {
  const S = ensureSeo(state);
  if (dryRun) return { ok: true, hoursCost: 2, usdCost: 0 };
  const found = technicalIssues(state);
  if (S.noindex && S.noindex.fixedDay == null && !S.noindex.noticed) { S.noindex.noticed = true; S.noindex.noticedBy = 'audit'; }
  S.tech.lastAudit = state.day;
  S.tech.found = found.map((i) => ({ ...i, day: state.day }));
  S.counts.audits++;
  return { ok: true, issues: found, hoursCost: 2, usdCost: 0 };
}

/** Fix a found issue: 'noindex' (1 h), 'not_indexed' (request indexing, 0.25 h per page). */
export function fixIssue(state, issueId) {
  const O = state.apps.organic, S = ensureSeo(state);
  if (issueId === 'noindex') {
    const N = S.noindex;
    if (!N || N.fixedDay != null) return { ok: false, error: 'Nothing to fix.', hoursCost: 0 };
    if (!N.noticed) return { ok: false, error: 'You have not found this yet: run an audit.', hoursCost: 0 };
    N.droppedAtFix = clamp((state.day - N.since) / SEO_DYN.noindex.dropDays, 0, 1);
    N.fixedDay = state.day;
    const days = state.day - N.since;
    const daily = O.articles.filter(live).reduce((s, a) => s + expectedDaily(state, a), 0);
    logMistake(state, { functionId: 'content_seo_geo', id: 'noindex_after_deploy', label: `Site ${N.kind === 'noindex' ? 'noindexed' : 'blocked in robots.txt'} by a deploy for ${days} days`, app: 'organic', delayed: true,
      cost: { customers: Math.round(daily * (days + SEO_DYN.noindex.reindexDays) * 0.6 * VISIT_CUSTOMERS), days: days + SEO_DYN.noindex.reindexDays, hours: 1 },
      detail: `${N.noticedBy === 'gsc' ? 'Search Console flagged it' : S.tech.gsc ? 'Found by audit' : 'Without Search Console nobody was alerted; an audit found it'}. Reindexing takes weeks. Stellar operators add an SEO check (robots/noindex) to every deploy.`, key: `noindex:${N.since}` });
    return { ok: true, hoursCost: 1 };
  }
  if (issueId === 'not_indexed') {
    const stuck = O.articles.filter((a) => live(a) && a.stuck);
    let fixed = 0;
    for (const a of stuck) if (helpfulness(a) >= SEO_DYN.index.fixMinQuality) { a.stuck = false; a.indexLag = state.day - a.day + 3; fixed++; }
    return { ok: true, fixed, stillStuck: stuck.length - fixed, hoursCost: round2(0.25 * stuck.length) };
  }
  return { ok: false, error: 'Unknown issue.', hoursCost: 0 };
}

/** Domain / CMS / framework migration. A full redirect map costs ~12 h but keeps most rankings. */
export function migrateSite(state, { redirectMap = true, rendering = null, dryRun = false } = {}) {
  const S = ensureSeo(state), M = SEO_DYN.migration;
  const hoursCost = redirectMap ? M.mapHours : M.noMapHours;
  if (dryRun) return { ok: true, hoursCost, usdCost: 0 };
  const never = !redirectMap && rng(state) < M.neverChance;
  S.migration = { day: state.day, redirectMap, loss: round2(lerp(redirectMap ? M.mapLoss : M.noMapLoss, rng(state))), recoveryDays: Math.round(lerp(redirectMap ? M.mapRecovery : M.noMapRecovery, rng(state))), residual: never ? M.neverResidual : 0 };
  if (rendering) S.tech.rendering = rendering;
  if (!redirectMap) logMistake(state, { functionId: 'content_seo_geo', id: 'migration_no_redirects', label: 'Site migration without a redirect map', app: 'organic', delayed: true, circles: true,
    cost: { days: S.migration.recoveryDays, hours: M.mapHours }, detail: `About ${Math.round(S.migration.loss * 100)}% of SEO traffic lost, recovering over ~${Math.round(S.migration.recoveryDays / 30)} months${never ? ', and part of it never comes back' : ''} (migration studies: mean ~500 days, 14–17% never recover).`, key: `migr:${state.day}` });
  return { ok: true, hoursCost, usdCost: 0, migration: S.migration };
}

// ---- Cannibalization, merging, pruning, clusters ----
export function computeGroups(state) {
  const O = state.apps.organic, S = ensureSeo(state), C = SEO_DYN.cannibal;
  const arts = O.articles.filter(live);
  const toks = new Map(arts.map((a) => [a.id, tokens(a.query)]));
  const parent = new Map(arts.map((a) => [a.id, a.id]));
  const find = (x) => { while (parent.get(x) !== x) x = parent.get(x); return x; };
  for (let i = 0; i < arts.length; i++) for (let j = i + 1; j < arts.length; j++) {
    const a = arts[i], b = arts[j];
    if ((a.pageType === 'informational') !== (b.pageType === 'informational')) continue; // different intent
    if (jaccard(toks.get(a.id), toks.get(b.id)) >= C.similarity) parent.set(find(a.id), find(b.id));
  }
  const groups = {};
  for (const a of arts) (groups[find(a.id)] ??= []).push(a);
  const old = S.groups;
  S.groups = {};
  for (const a of arts) a.cannibalMult = 1;
  for (const list of Object.values(groups)) {
    if (list.length < 2) continue;
    const key = list.map((a) => a.id).sort()[0];
    const since = old[key]?.since ?? state.day;
    S.groups[key] = { ids: list.map((a) => a.id), since };
    // Google flips between the pages: the group keeps ~80% of its best page, split by strength.
    const strength = list.map((a) => Math.max(1e-6, expectedDaily(state, { ...a, cannibalMult: 1 })));
    const total = strength.reduce((x, y) => x + y, 0), best = Math.max(...strength);
    list.forEach((a) => { a.cannibalMult = round2(Math.max(0.05, C.groupKeeps * best / total)); });
    if (state.day - since >= C.mistakeAfterDays) {
      const lost = (total - C.groupKeeps * best) * 90;
      logMistake(state, { functionId: 'content_seo_geo', id: 'keyword_cannibalization', label: `${list.length} pages cannibalize "${list[0].query}"`, app: 'organic', delayed: true,
        cost: { customers: Math.round(lost * VISIT_CUSTOMERS), hours: Math.round(list.length * 3) }, detail: 'Overlapping pages split clicks and rankings. Merge them into the strongest page with a 301, or re-target one.', key: `cannibal:${key}` });
    }
  }
  S.groupsDirty = false;
  return S.groups;
}

/** Merge a cannibalizing group into its strongest page and 301 the rest (1.5 h per merged page). */
export function mergeGroup(state, key, { dryRun = false } = {}) {
  const O = state.apps.organic, S = ensureSeo(state), C = SEO_DYN.cannibal;
  if (S.groupsDirty) computeGroups(state);
  const g = S.groups[key];
  if (!g) return { ok: false, error: 'No such overlap group.', hoursCost: 0 };
  const list = g.ids.map((id) => O.articles.find((a) => a.id === id)).filter(Boolean);
  const keep = list.reduce((b, a) => (expectedDaily(state, { ...a, cannibalMult: 1 }) > expectedDaily(state, { ...b, cannibalMult: 1 }) ? a : b));
  const hoursCost = C.mergeHours * (list.length - 1);
  if (dryRun) return { ok: true, keep: keep.id, hoursCost, usdCost: 0 };
  for (const a of list) if (a !== keep) { a.status = 'merged'; a.mergedInto = keep.id; a.mergedDay = state.day; }
  keep.quality = round2(Math.max(...list.map((a) => a.quality)));
  keep.slop = round2(Math.min(...list.map((a) => a.slop)));
  keep.words = list.reduce((s, a) => s + (a.words ?? 0), 0);
  keep.refreshMult = round2(keep.refreshMult * (rng(state) < C.mergeLossChance ? 0.9 : C.mergeBonus)); // pooled links and signals; sometimes other keywords are lost (Ahrefs)
  keep.compPush = Math.round(keep.compPush * 0.7);
  S.counts.merged += list.length - 1;
  S.groupsDirty = true;
  computeGroups(state);
  return { ok: true, keep: keep.id, merged: list.length - 1, hoursCost, usdCost: 0 };
}

/** Remove (noindex / 410) a page. 0.25 h. */
export function pruneArticle(state, id) {
  const S = ensureSeo(state);
  const a = state.apps.organic.articles.find((x) => x.id === id);
  if (!a || !live(a)) return { ok: false, error: 'Not a live page.', hoursCost: 0 };
  a.status = 'pruned'; a.prunedDay = state.day;
  S.counts.pruned++;
  S.groupsDirty = true;
  return { ok: true, hoursCost: 0.25 };
}

/** Make a page the pillar of a topic cluster and interlink the related live pages (0.25 h per link). */
export function setPillar(state, id, { dryRun = false } = {}) {
  const O = state.apps.organic, S = ensureSeo(state), C = SEO_DYN.cluster;
  const p = O.articles.find((a) => a.id === id);
  if (!p || !live(p)) return { ok: false, error: 'Not a live page.', hoursCost: 0 };
  const pt = tokens(p.query);
  // Related = shares a topic word with the pillar but is not a duplicate of it (anti-gaming: unrelated pages get no bonus).
  const related = O.articles.filter((a) => a !== p && live(a) && tokens(a.query).some((w) => w.length >= 4 && pt.includes(w)) && jaccard(tokens(a.query), pt) < SEO_DYN.cannibal.similarity).slice(0, 15);
  const hoursCost = round2(0.5 + C.hoursPerLink * related.length);
  if (dryRun) return { ok: true, related: related.map((a) => a.id), hoursCost, usdCost: 0 };
  for (const a of O.articles) if (a.pillarId === p.id) a.pillarId = null;
  for (const a of related) { a.pillarId = p.id; a.isPillar = false; }
  p.isPillar = true; p.pillarId = null;
  return { ok: true, linked: related.length, hoursCost, usdCost: 0, bonus: related.length >= C.min && p.quality >= C.pillarMinQuality };
}

// ---- Refresh ----

// Share of words changed between two versions (multiset overlap).
export function textChange(oldText, newText) {
  const A = String(oldText ?? '').toLowerCase().split(/\s+/).filter(Boolean), B = String(newText ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!A.length) return B.length >= 150 ? 1 : 0;
  const m = new Map();
  for (const w of A) m.set(w, (m.get(w) ?? 0) + 1);
  let same = 0;
  for (const w of B) { const n = m.get(w); if (n) { same++; m.set(w, n - 1); } }
  return clamp(1 - same / Math.max(A.length, B.length), 0, 1);
}
export const refreshHours = (oldText, newText) => {
  const ch = textChange(oldText, newText);
  if (ch < SEO_DYN.refresh.dateOnly) return 0.25;
  return round2(clamp(0.5 + (ch * Math.max(words(newText), words(oldText))) / 500, 1, 6)); // [design]
};

/** Refresh a page with edited text re-judged by the seo_article_review judge. Lift drawn from the research. */
export function refreshArticle(state, id, { title, body, judge }) {
  const O = state.apps.organic, S = ensureSeo(state), R = SEO_DYN.refresh, day = state.day;
  const a = O.articles.find((x) => x.id === id);
  if (!a || !live(a)) throw new Error('Not a live page.');
  const change = textChange(a.body ?? '', body);
  const freshAge = day - a.freshDay;
  const wasDecaying = isDecaying(state, a);
  const qBefore = a.quality;
  let kind = change < R.dateOnly ? 'date_only' : change < R.substantive ? 'light' : 'substantive';
  let lift = 1;
  if (kind === 'date_only') {
    S.counts.refreshDateOnly++;
    logMistake(state, { functionId: 'content_seo_geo', id: 'date_only_refresh', label: 'Republished with a new date and no real changes', app: 'organic', cost: { hours: 0.25 }, detail: 'Date bumps do nothing measurable (refresh studies: ~0%). Update facts, structure and intent match instead.', key: `dateonly:${a.id}:${day}` });
  } else {
    const q = judge?.quality ?? a.quality;
    const pBack = q < a.quality - 0.1 ? R.backfireWorse : q > a.quality + 0.1 ? R.backfireBetter : R.backfire;
    const u = rng(state), v = rng(state);
    if (u < pBack) lift = lerp(R.backfireMult, v);
    else if (u < pBack + R.flat) lift = lerp(R.flatMult, v);
    else lift = R.lift[0] + (R.lift[1] - R.lift[0]) * Math.pow(v, R.liftSkew);
    if (lift > 1) lift = 1 + (lift - 1) * (kind === 'light' ? R.lightScale : 1) * (freshAge < R.youngDays ? R.youngScale : 1);
    a.refreshMult = round2(clamp(a.refreshMult * decayMult(a, day) * lift, 0.2, 3));
    a.freshDay = day;
    a.quality = round2(q);
    a.slop = round2(judge?.slop ?? a.slop);
    if (kind === 'substantive') a.compPush = Math.round(a.compPush * 0.5);
    if (a.stuck && helpfulness(a) >= SEO_DYN.index.fixMinQuality) { a.stuck = false; a.indexLag = day - a.day + 5; }
    S.counts[kind === 'light' ? 'refreshLight' : 'refreshSubstantive']++;
    if (wasDecaying) S.counts.refreshDecaying++;
    if (q < qBefore - 0.1) logMistake(state, { functionId: 'content_seo_geo', id: 'refresh_made_worse', label: 'Refresh made the page worse', app: 'organic', cost: { hours: refreshHours(a.body, body) }, detail: `Editor score fell from ${Math.round(qBefore * 100)} to ${Math.round(q * 100)}. Rewrites that strip first-hand detail lose rankings.`, key: `worse:${a.id}:${day}` });
  }
  if (title) a.title = title;
  a.body = String(body).slice(0, 8000);
  a.words = words(body);
  a.refreshes.push({ day, kind, lift: round2(lift), change: round2(change), qBefore, qAfter: a.quality, decaying: wasDecaying });
  if (a.refreshes.length > 12) a.refreshes.shift();
  S.groupsDirty = true;
  return { kind, lift: round2(lift), change: round2(change), wasDecaying };
}

// ---- Link building ----
function addLinks(O, n, gain) {
  let gained = 0;
  for (let i = 0; i < n; i++) {
    O.linkEvents = (O.linkEvents ?? 0) + 1;
    const before = O.dr;
    O.dr = Math.min(drCap(O.linkEvents), O.dr + gain * (1 - O.dr / 100)); // higher DR is harder to move
    gained += O.dr - before;
  }
  return gained;
}
export function hasLinkableAsset(state) {
  const tool = state.apps?.plg?.levers?.free_tool;
  if (tool?.status === 'live' && (tool.q ?? 0) >= 0.4) return true;
  return (state.apps.organic.articles ?? []).some((a) => live(a) && a.quality >= 0.7 && (a.cited || a.judge?.results?.some?.((r) => (r.citable ?? 0) >= 0.5)));
}
const cash = (state) => balance(state);
function pay(state, usd, counterparty, description, category = 'marketing') {
  if (cash(state) < usd) throw new Error(`Not enough cash in checking for ${counterparty} ($${Math.round(usd).toLocaleString()}).`);
  post(state, { amount: -usd, counterparty, description, category, method: 'card' });
}

/** Pitch a guest post you wrote (judged with the article judge). Acceptance and the link arrive weeks later. */
export function pitchGuestPost(state, { site = 'an industry blog', judge }) {
  const S = ensureSeo(state), L = SEO_DYN.links;
  const p = lerp(L.guestAccept, helpfulness({ quality: judge.quality, slop: judge.slop }));
  const ok = rng(state) < p;
  S.links.pending.push({ day: state.day + Math.round(lerp(L.guestDays, rng(state))), kind: 'guest_post', n: ok ? 1 : 0, gain: L.guestGain, site, note: ok ? `${site} published your guest post` : `${site} passed on your guest post` });
  S.counts.guestPitches++;
  return { accepted: ok };
}
/** Answer journalist requests (Featured / Qwoted / Source of Sources), 3 h. */
export function answerJournalists(state) {
  const S = ensureSeo(state), L = SEO_DYN.links;
  const ok = rng(state) < L.haroChance;
  S.links.pending.push({ day: state.day + Math.round(lerp(L.haroDays, rng(state))), kind: 'haro', n: ok ? 1 : 0, gain: L.haroGain, note: ok ? 'A journalist quoted you with a link' : 'None of your journalist pitches were used this round' });
  S.counts.haro++;
  return { hoursCost: L.haroHours, landed: ok };
}
/** Digital PR campaign (~$597 per earned link, BuzzStream 2025); without a linkable asset it earns few links. */
export function runDigitalPR(state, { budget }) {
  const S = ensureSeo(state), L = SEO_DYN.links;
  budget = Math.max(L.prMin, Math.round(budget || 0));
  pay(state, budget, 'Digital PR agency', `Digital PR campaign ($${budget.toLocaleString()})`);
  const asset = hasLinkableAsset(state);
  const mean = (budget / L.prCostPerLink) * (asset ? 1 : L.prNoAssetFactor);
  let n = 0;
  for (let i = 0; i < Math.ceil(mean * 2); i++) if (rng(state) < mean / Math.ceil(mean * 2)) n++;
  for (let i = 0; i < n; i++) S.links.pending.push({ day: state.day + Math.round(lerp(L.prDays, rng(state))), kind: 'pr', n: 1, gain: L.prGain, note: 'Press coverage linked to you' });
  S.links.pending.push({ day: state.day + L.prDays[1], kind: 'pr_report', n: 0, note: `Digital PR report: ${n} earned link(s) for $${budget.toLocaleString()}` });
  S.counts.prCampaigns++;
  if (!asset) logMistake(state, { functionId: 'content_seo_geo', id: 'pr_without_asset', label: 'Digital PR with nothing linkable to pitch', app: 'organic', delayed: true, cost: { usd: Math.round(budget * (1 - L.prNoAssetFactor)) }, detail: 'Journalists link to data, tools and stories. Build a free tool or an original data study first; the BuzzStream benchmark is ~$597 per earned link with an asset.', key: `pr:${state.day}` });
  return { links: n, asset, usdCost: budget, hoursCost: L.prHours };
}
/** Buy links. Cheap and immediate DR, but a link-spam violation: ignored at best, a manual action at worst. */
export function buyLinks(state, { pack = 'cheap' } = {}) {
  const O = state.apps.organic, S = ensureSeo(state), P = SEO_DYN.links.packs[pack];
  if (!P) throw new Error('Unknown link package.');
  const usd = P.n * P.usdEach;
  pay(state, usd, pack === 'vendor_guest' ? 'Guest post vendor' : 'Link marketplace', P.label);
  const gained = addLinks(O, P.n, P.gain);
  Object.assign(S.links, { bought: S.links.bought + P.n, boughtRisk: S.links.boughtRisk + P.n * P.risk, boughtDr: S.links.boughtDr + gained, boughtUsd: S.links.boughtUsd + usd });
  S.counts.packsBought++;
  return { usdCost: usd, hoursCost: 1, drGain: round2(gained) };
}
function linksDay(state) {
  const O = state.apps.organic, S = state.apps.organic.seo, day = state.day;
  const due = S.links.pending.filter((p) => p.day <= day);
  if (due.length) {
    S.links.pending = S.links.pending.filter((p) => p.day > day);
    for (const p of due) {
      if (p.n > 0) { addLinks(O, p.n, p.gain); S.links.earned += p.n; }
      if (p.note) notify(state, p.note + (p.n ? ` (domain rating now ${Math.round(O.dr)}).` : '.'), { type: p.n ? 'good' : 'info', app: 'organic' });
    }
  }
  // A live free tool keeps earning links (PLG lever).
  const tool = state.apps?.plg?.levers?.free_tool;
  if (tool?.status === 'live' && day % 30 === 0) {
    const L = SEO_DYN.links;
    const mean = lerp(L.toolPerMonth, clamp(tool.q ?? 0, 0, 1));
    const n = Math.floor(mean + h01(`tool|${S.seed}|${day}`));
    if (n > 0) { addLinks(O, n, L.toolGain); S.links.earned += n; }
  }
}

// ---- Writers, agencies and in-house writers ----

// How much a brief gives the writer to work with: real product facts, customer language and numbers [design].
export function briefQuality(state, brief) {
  const t = String(brief ?? '');
  const n = words(t);
  const nums = Math.min(3, (t.match(/\b\d[\d,.]*%?|\$\d/g) ?? []).length);
  const firstHand = /\b(customer|interview|call|ticket|we tested|our data|we found|screenshot|switch(ed)? from|asked us)\b/i.test(t);
  const prod = tokens(`${state.company.name} ${state.company.oneLiner}`).filter((w) => w.length >= 4);
  const mentions = prod.some((w) => t.toLowerCase().includes(w));
  return round2(clamp((n >= 60 ? 0.3 : n >= 25 ? 0.15 : 0) + nums * 0.1 + (firstHand ? 0.2 : 0) + (mentions ? 0.2 : 0), 0, 1));
}
function topicOf(state) {
  const t = tokens(state.company.oneLiner).filter((w) => w.length > 2).slice(0, 2).join(' ');
  return t || 'small business software';
}
function rivalName(state, i) {
  const rs = (state.apps.world?.rivals ?? []).filter((r) => r.status === 'active');
  return rs.length ? rs[i % rs.length].name : ['the market leader', 'spreadsheets'][i % 2];
}
function pickQuery(state, picks, i) {
  const S = state.apps.organic.seo;
  if (S.plan.length && S.planUsed < S.plan.length) return S.plan[S.planUsed++];
  const t = topicOf(state), icp = tokens(state.company.icp).slice(0, 2).join(' ') || 'small teams';
  const generic = [`what is ${t}`, `${t} tips`, `${t} guide`, `${t} best practices`, `benefits of ${t}`, `how to use ${t}`, `${t} ideas`, `ultimate guide to ${t}`];
  const bofu = [`best ${t} software`, `${rivalName(state, i)} alternatives`, `${t} pricing`, `${rivalName(state, i + 1)} vs ${state.company.name}`, `${t} for ${icp}`, `${t} template`, `${t} tool for ${icp}`, `${rivalName(state, i + 2)} alternative for ${icp}`];
  const list = picks === 'bofu' ? bofu : picks === 'generic' ? generic : (i % 2 ? bofu : generic);
  return list[i % list.length];
}
const titleFor = (q) => q.charAt(0).toUpperCase() + q.slice(1);

/** Set the content plan (target queries) writers, agencies and in-house writers work from. */
export function setContentPlan(state, queries) {
  const S = ensureSeo(state);
  S.plan = queries.map((q) => String(q).trim()).filter(Boolean).slice(0, 60);
  S.planUsed = 0;
  return S.plan;
}

function makeDraft(state, { source, tier, query, title, q, slopP, errP, briefScore, dueDay, autoPublish, editHours, u }) {
  const S = state.apps.organic.seo;
  const [a, b, c] = u;
  const quality = round2(clamp(lerp(q, a) + 0.15 * (briefScore - 0.5), 0.05, 0.95));
  const slop = b < slopP ? round2(0.6 + 0.3 * c) : round2(0.05 + 0.15 * c);
  const d = { id: uid('drf'), source, tier, query, title: title || titleFor(query), quality, slop, error: c < errP, briefScore, dueDay, status: 'writing', autoPublish, editHours };
  S.drafts.unshift(d);
  if (S.drafts.length > 80) S.drafts.length = 80;
  return d;
}

/** Commission a freelance article (paid now, delivered in 1–2 weeks into the review queue). */
export function commissionArticle(state, { tier = 'mid', query, title = '', brief = '' }) {
  const S = ensureSeo(state), W = WRITERS[tier];
  if (!W) throw new Error('Unknown writer tier.');
  if (!String(query ?? '').trim()) throw new Error('Give the writer a target query.');
  pay(state, W.usd, `Freelance writer (${W.label})`, `Article: "${query}"`, 'contractors');
  S.counts.commissioned++;
  return makeDraft(state, { source: `writer:${tier}`, tier, query: query.trim(), title, q: W.q, slopP: W.slopP, errP: W.errP, briefScore: briefQuality(state, brief), dueDay: state.day + W.leadDays, autoPublish: false, editHours: W.editHours, u: [rng(state), rng(state), rng(state)] });
}

/** Start an agency retainer: first month paid now, then a monthly bill. Needs cash for at least one month. */
export function startAgency(state, { tier, brief = '' }) {
  const S = ensureSeo(state), A = AGENCIES[tier];
  if (!A) throw new Error('Unknown agency.');
  if (S.agency?.status === 'active') throw new Error('You already have an agency on retainer. Cancel it first.');
  pay(state, A.monthly, A.label, 'SEO / content retainer (first month)');
  const r = addRecurring(state, { vendor: A.label, amount: A.monthly, category: 'marketing', dayOfMonth: Math.min(28, dayOfMonth(state)), note: 'SEO / content retainer' });
  r.seoAgency = true;
  S.agency = { tier, recurringId: r.id, startDay: state.day, brief, briefScore: briefQuality(state, brief), produced: 0, status: 'active' };
  return S.agency;
}
export function cancelAgency(state) {
  const S = ensureSeo(state);
  if (!S.agency) return null;
  const r = state.recurring.find((x) => x.id === S.agency.recurringId);
  if (r) r.active = false;
  S.agency.status = 'cancelled';
  S.agency.endDay = state.day;
  return S.agency;
}

const teamWriters = (state) => (state.apps.people?.members ?? []).filter((m) => m.status === 'active' && m.startDay <= state.day && m.kind !== 'ai_agent' && (jobRoleOf(m) === 'content_writer' || jobRoleOf(m) === 'marketer'));
function draftsDay(state) {
  const O = state.apps.organic, S = O.seo, day = state.day;
  // Agency: output spread over the month while the retainer is paid.
  const G = S.agency;
  if (G?.status === 'active') {
    const r = state.recurring.find((x) => x.id === G.recurringId);
    if (!r?.active) { G.status = 'lapsed'; G.endDay = day; notify(state, 'Your SEO agency stopped work: the retainer is no longer being paid.', { type: 'warn', app: 'organic' }); }
    else {
      const A = AGENCIES[G.tier];
      const every = 30 / A.perMonth;
      while (G.produced < Math.floor((day - G.startDay) / every)) {
        const i = G.produced++;
        makeDraft(state, { source: `agency:${G.tier}`, tier: G.tier, query: pickQuery(state, A.picks, i), q: A.q, slopP: A.slopP, errP: A.errP, briefScore: G.briefScore, dueDay: day, autoPublish: true, editHours: A.editHours, u: [h01(`ag|${S.seed}|${i}|a`), h01(`ag|${S.seed}|${i}|b`), h01(`ag|${S.seed}|${i}|c`)] });
      }
      if ((day - G.startDay) % 30 === 15) {
        if (A.bought) { const P = SEO_DYN.links.packs.vendor_guest; const g = addLinks(O, A.bought, P.gain); Object.assign(S.links, { bought: S.links.bought + A.bought, boughtRisk: S.links.boughtRisk + A.bought * P.risk, boughtDr: S.links.boughtDr + g }); }
        if (A.earned) { addLinks(O, A.earned, SEO_DYN.links.prGain); S.links.earned += A.earned; }
      }
    }
  }
  // In-house writers: ~1 piece a week each at full ramp (a hire ships 4–10 pieces a month, seed-series-a.md §2).
  if (day % 7 === 0) {
    const team = teamWriters(state);
    const mq = team.length ? marketingQuality(state) : null;
    for (const m of team) {
      const writer = jobRoleOf(m) === 'content_writer';
      const pieces = (writer ? 1 : 0.25) * (outputFor(m, 'piecesPerWeekMult') ?? 1) * rampFactor(m, day);
      const n = Math.floor(pieces + h01(`tw|${m.id}|${day}`));
      const cq = (outputFor(m, 'contentQuality') ?? mq?.contentQuality ?? 60) / 100;
      const err = outputFor(m, 'factualErrorRate') ?? 0.05;
      for (let i = 0; i < n; i++) {
        const j = (S.teamProduced = (S.teamProduced ?? 0) + 1);
        makeDraft(state, { source: `team:${m.id}`, tier: 'team', query: pickQuery(state, 'mixed', j), q: [cq - 0.1, cq + 0.1], slopP: 0.05, errP: err, briefScore: 0.5 + (S.plan.length ? 0.2 : 0), dueDay: day, autoPublish: true, editHours: 0.75, u: [h01(`tw|${m.id}|${day}|${i}|a`), h01(`tw|${m.id}|${day}|${i}|b`), h01(`tw|${m.id}|${day}|${i}|c`)] });
      }
    }
  }
  for (const d of S.drafts) {
    if (d.status === 'writing' && day >= d.dueDay) {
      d.status = 'review'; d.deliveredDay = day;
      if (d.autoPublishDay == null && d.autoPublish) d.autoPublishDay = day + AUTO_PUBLISH_DAYS;
      if (!d.autoPublish) notify(state, `Draft delivered for review: "${d.title}".`, { type: 'info', app: 'organic' });
    }
    if (d.status === 'review' && d.autoPublishDay != null && day >= d.autoPublishDay) publishDraft(state, d, false, true);
  }
}

function publishDraft(state, d, edited, auto = false) {
  const S = state.apps.organic.seo;
  let { quality, slop } = d;
  if (edited) { quality = round2(clamp(quality + 0.12 * (1 - quality) + 0.05, 0, 0.95)); slop = round2(slop * 0.4); S.counts.edited++; }
  else S.counts.publishedUnedited++;
  if (d.error && !edited) {
    quality = round2(Math.max(0.05, quality - 0.1));
    logMistake(state, { functionId: 'content_seo_geo', id: 'unreviewed_factual_error', label: `Published "${d.title}" unreviewed with a factual error`, app: 'organic', cost: { reputation: 1 }, detail: `${auto ? 'The writer published it to your CMS before anyone reviewed it.' : 'You published it without an edit pass.'} Wrong product claims get cited by AI answers and erode trust.`, key: `err:${d.id}` });
  }
  const a = createArticle(state, { title: d.title, query: d.query, body: '', judge: { quality, slop, informational: pageTypeOf(d.query) === 'informational', citable: quality * 0.4, words: 1500, results: [], mock: true }, source: d.source });
  d.status = 'published'; d.articleId = a.id; d.publishedDay = state.day; d.edited = edited;
  return a;
}

/** Review a delivered draft: 'publish' as is (0.25 h), 'edit' then publish (tier edit hours), or 'reject'. */
export function reviewDraft(state, draftId, action, { dryRun = false } = {}) {
  const S = ensureSeo(state);
  const d = S.drafts.find((x) => x.id === draftId);
  if (!d || d.status !== 'review') return { ok: false, error: 'This draft is not waiting for review.', hoursCost: 0 };
  const hoursCost = action === 'edit' ? d.editHours : action === 'publish' ? 0.25 : 0.1;
  if (dryRun) return { ok: true, hoursCost, usdCost: 0 };
  if (action === 'reject') { d.status = 'rejected'; return { ok: true, hoursCost }; }
  const a = publishDraft(state, d, action === 'edit');
  return { ok: true, hoursCost, articleId: a.id };
}

// ---------------- reads for tools (Search Console / SEO tool UIs) ----------------

/** Per-article stats: { id, title, query, pageType, position, impressions, clicks (last 28 days), visits (lifetime),
 *  ageDays, decaying, indexed, issues[] }. position is null until the page ranks. */
export function seoArticleStats(state) {
  const O = state.apps?.organic;
  if (!O?.articles) return [];
  const S = ensureSeo(state), day = state.day;
  const inGroup = new Set(Object.values(S.groups).flatMap((g) => g.ids));
  const w = Math.floor(day / 7);
  return O.articles.filter(live).map((a) => {
    const recent = (a.wk ?? []).filter((b) => b.w > w - 4);
    const indexed = isIndexed(state, a) && !(S.noindex && S.noindex.fixedDay == null && day - S.noindex.since >= SEO_DYN.noindex.dropDays);
    const issues = [];
    if (a.stuck) issues.push('not_indexed');
    else if (!isIndexed(state, a)) issues.push('awaiting_index');
    if (S.noindex && S.noindex.fixedDay == null) issues.push(S.noindex.kind === 'noindex' ? 'noindex' : 'robots_blocked');
    if (inGroup.has(a.id)) issues.push('cannibalization');
    if (helpfulness(a) < 0.3) issues.push('thin_content');
    if (a.coreMult < 0.8) issues.push('core_update_demoted');
    const decaying = isDecaying(state, a);
    if (decaying) issues.push('decaying');
    return { id: a.id, title: a.title, query: a.query, pageType: a.pageType, position: indexed ? shownPosition(a, day) : null,
      impressions: Math.round(recent.reduce((s, b) => s + b.i, 0)), clicks: Math.round(recent.reduce((s, b) => s + b.c, 0)), visits: Math.round(a.visits ?? 0),
      ageDays: day - a.day, decaying, indexed, issues, source: a.source };
  });
}

// ---------------- operator read (ARCHITECTURE principle 7) ----------------

// Stellar: BOFU-first, original quality, refreshes decaying pages substantively, merges overlaps, earns links, has
// Search Console + deploy checks, reviews writer drafts. Mediocre: AI slop at volume, overlapping posts, bought links,
// date-bump refreshes, unreviewed agency output, no tracking. Expected gap: research §indie/seed operator tables
// (stellar 2k–30k visits/month at 12 months vs mediocre <100 and possible demotion) [design].
export function readSeo(state) {
  const O = state.apps?.organic;
  const arts = (O?.articles ?? []).filter(live);
  if (!arts.length) return { tier: 'unknown', evidence: [], coaching: ['Start with the three or four bottom-of-funnel pages a buyer reads before paying (comparisons, alternatives, use cases).'] };
  const S = ensureSeo(state);
  const n = arts.length;
  const quality = arts.reduce((s, a) => s + helpfulness(a), 0) / n;
  const bofu = arts.filter((a) => a.pageType !== 'informational').length / n;
  const slop = arts.filter((a) => (a.slop ?? 0) > 0.5).length / n;
  const old = arts.filter((a) => state.day - a.freshDay > SEO_DYN.decay.onsetDays);
  const decaying = arts.filter((a) => isDecaying(state, a)).length;
  const c = S.counts;
  const refreshes = c.refreshSubstantive + c.refreshLight * 0.5;
  const maintenance = old.length ? clamp((refreshes - c.refreshDateOnly) / Math.max(1, old.length * 0.5), 0, 1) : 0.6;
  const groups = Object.keys(S.groups).length;
  const tech = (S.tech.gsc ? 0.4 : 0) + (S.tech.sitemap ? 0.2 : 0) + (S.tech.deployChecks ? 0.2 : 0) + (c.audits ? 0.2 : 0);
  const linksClean = S.links.bought + S.links.neutralized > 0 || c.packsBought ? 0 : S.links.earned > 0 ? 1 : 0.6;
  const reviewed = c.edited + c.publishedUnedited ? c.edited / (c.edited + c.publishedUnedited) : 0.6;
  const raw = 0.28 * quality + 0.14 * Math.min(1, bofu / 0.4) + 0.12 * maintenance + 0.12 * tech + 0.12 * linksClean + 0.08 * reviewed + 0.14 * (1 - slop) - Math.min(0.15, 0.05 * groups) - (S.penalty ? 0.15 : 0);
  const score = shrink(clamp(raw, 0, 1), n, 0.5, 4);
  const coaching = [];
  if (slop > 0.2) coaching.push(trapCoaching('content_seo_geo', 'ai_slop', 'Add a number, a customer quote or an opinion to every post or do not publish it.'));
  if (bofu < 0.3) coaching.push(trapCoaching('content_seo_geo', 'volume_without_intent', 'Write for the questions a buyer asks before they pay.'));
  if (decaying) coaching.push(`${decaying} page(s) are decaying: a stellar operator refreshes them substantively (facts, structure, intent) before they fall off page 1; a date bump does nothing.`);
  if (groups) coaching.push(`${groups} keyword overlap(s): merge into the strongest page and 301 the rest.`);
  if (!S.tech.gsc) coaching.push('Verify Search Console: without it you find out about noindex accidents, unindexed pages and manual actions months late.');
  if (S.links.bought || S.links.neutralized || c.packsBought) coaching.push('Bought links are ignored at best and a manual action at worst. Stellar operators earn links with a free tool, original data and journalist requests.');
  if (c.publishedUnedited > c.edited) coaching.push('Most writer drafts went out unedited. Edit for product accuracy and first-hand detail before publishing.');
  return { tier: tierFromScore(score), score: round2(score), n,
    evidence: [`${n} live pages, ${Math.round(bofu * 100)}% bottom-of-funnel, mean helpfulness ${Math.round(quality * 100)}, ${Math.round(slop * 100)}% AI slop`,
      `${c.refreshSubstantive} substantive refreshes, ${c.refreshDateOnly} date-only; ${decaying} decaying now; ${groups} overlap group(s)`,
      `links: ${S.links.earned} earned, ${S.links.bought + S.links.neutralized} bought; Search Console ${S.tech.gsc ? 'on' : 'off'}; ${c.audits} audit(s)${S.penalty ? `; penalty: ${S.penalty.kind}` : ''}`],
    coaching };
}
if (!hasOperatorReader('content_seo_geo')) registerOperatorReader('content_seo_geo', readSeo);
