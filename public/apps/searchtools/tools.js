// Search tools: subscriptions (real recurring bank charges), Google Search Console (true first-party numbers with a
// lag), Ahrefs/Semrush estimates (deterministic per seed with the measured error band), Keyword Planner ranges,
// content-optimizer briefs, and the site audit. Tools REVEAL information; none of them changes rankings by itself.
// Research: docs/research/seo/effects-and-risks.md §8, indie.md, seed-series-a.md. No DOM.

import { post, addRecurring } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { hash, round2, clamp, dayOfMonth, words } from '../../core/util.js';
import { keywordMetrics, seoRamp } from '../growth/organicModel.js';
import * as OE from '../growth/organicEngine.js';
import { technicalIssues, ensureSeo } from '../growth/seoDynamics.js';
import { TOOLS, ESTIMATE, GSC, OPTIMIZER } from './params.js';
import { ensureSearch, h01 } from './geo.js';

// ---------------- Subscriptions ----------------

export const hasTool = (state, id) => Boolean(state.apps.searchtools?.subs?.[id]);
export const hasKind = (state, kind) => Object.keys(state.apps.searchtools?.subs ?? {}).some((id) => TOOLS[id]?.kind === kind);
export const keywordTools = (state) => Object.keys(state.apps.searchtools?.subs ?? {}).filter((id) => TOOLS[id]?.kind === 'keyword');

/** Subscribe: first month charged now on the card, then a recurring bill on the same day of the month. */
export function subscribe(state, id) {
  const T = ensureSearch(state);
  const t = TOOLS[id];
  if (!t) return { ok: false, error: 'Unknown tool.' };
  if (T.subs[id]) return { ok: false, error: 'Already set up.' };
  if (t.needs === 'gsc' && !T.subs.gsc) return { ok: false, error: 'Verify your site in Search Console first.' };
  if (t.needs === 'ahrefs' && !keywordTools(state).some((k) => TOOLS[k].engine === 'ahrefs')) return { ok: false, error: 'Brand Radar is an add-on to an Ahrefs plan.' };
  const sub = { day: state.day, recurringId: null };
  if (id === 'gsc') { OE.ensureOrganic(state); ensureSeo(state).tech.gsc = true; } // the core SEO model (indexing speed, noindex alerts) sees it too
  if (t.price > 0) {
    const first = t.annual ?? t.price;
    post(state, { amount: -first, counterparty: t.vendor, description: `${t.label}${t.annual ? ' (annual licence)' : ' (first month)'}`, category: 'software', method: 'card' });
    if (!t.annual) sub.recurringId = addRecurring(state, { vendor: t.vendor, amount: t.price, category: 'software', dayOfMonth: dayOfMonth(state), note: `${t.label} subscription` }).id;
    else sub.renewDay = state.day + 365;
  }
  T.subs[id] = sub;
  if (id === 'gsc') T.gscVerifiedDay = state.day;
  // Paying for a big suite before there is any traffic to analyse is a classic waste (indie.md).
  const organicVisits = (state.apps.organic?.articles ?? []).reduce((a, x) => a + (x.visits ?? 0), 0);
  if (t.kind === 'keyword' && t.price >= 249 && organicVisits < 300 && state.company?.path !== 'vc') {
    logMistake(state, { functionId: 'content_seo_geo', id: 'tool_before_traffic', label: `Bought ${t.label} with no organic traffic yet`, cost: { usd: t.price * 3 }, delayed: true, detail: `$${t.price}/mo for a suite whose extra features need traffic to analyse. Free Search Console + Ahrefs Webmaster Tools, or Lite/Pro for a month of keyword research, covers this stage.`, app: 'searchtools', key: `toolearly:${id}` });
  }
  if (id === 'sfrog' && siteUrls(state) <= 500) {
    logMistake(state, { functionId: 'content_seo_geo', id: 'paid_crawler_small_site', label: 'Paid Screaming Frog licence for a site under 500 URLs', cost: { usd: t.annual }, detail: `The free version crawls up to 500 URLs; your site has ~${siteUrls(state)}.`, app: 'searchtools', key: `sfrog:${state.day}` });
  }
  return { ok: true, hoursCost: t.setup, usdCost: t.price > 0 ? (t.annual ?? t.price) : 0 };
}
export function unsubscribe(state, id) {
  const T = ensureSearch(state);
  const sub = T.subs[id];
  if (!sub) return { ok: false, error: 'Not subscribed.' };
  if (sub.recurringId) { const r = state.recurring.find((x) => x.id === sub.recurringId); if (r) r.active = false; }
  delete T.subs[id];
  // Removing the Search Console property: the core SEO model loses it too, or syncSearchConsole would re-add it.
  if (id === 'gsc') {
    OE.ensureOrganic(state); const S = ensureSeo(state);
    S.tech.gsc = false; S.tech.setup = false;
    T.gscVerifiedDay = null; // a re-verified property starts collecting data again from that day
  }
  return { ok: true };
}
/** Annual licences renew once a year (the monthly ones bill through core/bank recurring). */
export function renewAnnual(state) {
  const T = ensureSearch(state);
  for (const [id, sub] of Object.entries(T.subs)) {
    const t = TOOLS[id];
    if (!t?.annual || state.day < (sub.renewDay ?? Infinity)) continue;
    post(state, { amount: -t.annual, counterparty: t.vendor, description: `${t.label} (annual renewal)`, category: 'software', method: 'card' });
    sub.renewDay = state.day + 365;
  }
}
export const monthlyToolSpend = (state) => round2(Object.keys(ensureSearch(state).subs).reduce((a, id) => a + (TOOLS[id]?.price ?? 0), 0));

export const siteUrls = (state) => 20 + (state.apps.organic?.articles?.length ?? 0) + (state.apps.plg?.pages?.length ?? 0) + (state.apps.world?.pages?.length ?? 0);

// ---------------- Search Console (the truth, lagged) ----------------

// Impression share by position [design]: page 1 is seen on most searches, page 2 sometimes, deeper rarely.
const impAt = (pos) => (pos <= 10 ? 1 : pos <= 20 ? 0.4 : 0.05);
const DEEP = 50;
/** Daily snapshot of every article's true clicks (the Organic engine's own visit counter), impressions and position. */
export function gscSnapshot(state) {
  const T = ensureSearch(state);
  const arts = state.apps.organic?.articles ?? [];
  if (!arts.length) return;
  const rows = [];
  for (const a of arts) {
    const prev = T.lastVisits[a.id] ?? 0;
    const clicks = Math.max(0, (a.visits ?? 0) - prev);
    T.lastVisits[a.id] = a.visits ?? 0;
    // Same blend as the ranking model: before the ramp completes the page mostly sits deep in the results.
    const r = seoRamp(state.day - a.day, a.tier ?? 'mid');
    const pos = clamp(a.position ?? DEEP, 1, 100);
    const wTop = r * impAt(pos), wDeep = (1 - r) * impAt(DEEP);
    const impressions = ((a.volume ?? 0) / 30) * (wTop + wDeep);
    const avgPos = wTop + wDeep > 0 ? (wTop * pos + wDeep * DEEP) / (wTop + wDeep) : DEEP;
    rows.push([a.id, round2(clicks), round2(Math.max(impressions, clicks)), round2(avgPos)]);
  }
  T.gscHist.push({ d: state.day, rows });
  if (T.gscHist.length > GSC.historyDays) T.gscHist.shift();
}
/**
 * Search Console performance for your site: per page/query totals over the last `days` days that Google has
 * processed (data ends GSC.lagDays ago, and starts on the day you verified). → { rows, through, lag, verified }.
 */
export function gscReport(state, { days = 28 } = {}) {
  const T = ensureSearch(state);
  if (!T.subs.gsc) return { verified: false, rows: [] };
  const through = state.day - GSC.lagDays;
  const from = Math.max(T.gscVerifiedDay ?? 0, through - days + 1);
  const agg = new Map();
  for (const h of T.gscHist) {
    if (h.d < from || h.d > through) continue;
    for (const [id, c, i, p] of h.rows) {
      const x = agg.get(id) ?? { clicks: 0, impressions: 0, posW: 0 };
      x.clicks += c; x.impressions += i; x.posW += p * i;
      agg.set(id, x);
    }
  }
  const arts = new Map((state.apps.organic?.articles ?? []).map((a) => [a.id, a]));
  const rows = [...agg.entries()].filter(([, x]) => x.impressions >= 1).map(([id, x]) => ({ id, query: arts.get(id)?.query ?? '?', title: arts.get(id)?.title ?? '', clicks: round2(x.clicks), impressions: Math.round(x.impressions), ctr: x.impressions ? x.clicks / x.impressions : 0, position: x.impressions ? round2(x.posW / x.impressions) : null }));
  rows.sort((a, b) => b.impressions - a.impressions);
  return { verified: true, rows, from, through, lag: GSC.lagDays };
}
/** Your site's true organic clicks over the last 30 days (Google), for comparing third-party estimates. */
export function trueMonthlyClicks(state) {
  const T = ensureSearch(state);
  return round2(T.gscHist.filter((h) => h.d > state.day - 30).reduce((a, h) => a + h.rows.reduce((b, r) => b + r[1], 0), 0));
}

// ---------------- Third-party estimates ----------------

function normalFrom(key) { const u = Math.max(1e-9, h01(`${key}|u`)); const v = h01(`${key}|v`); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
/** Deterministic estimate multiplier for a tool engine (ahrefs|semrush) and a key, fixed per company seed. */
export function estimateMult(state, engine, key, { smallSite = false } = {}) {
  const E = ESTIMATE[engine];
  return Math.exp(E.bias + (smallSite ? ESTIMATE.smallSiteBias : 0) + E.sigma * normalFrom(`${state.seed}|${engine}|${key}`));
}
export function estimateKeyword(state, engine, query) {
  const km = keywordMetrics(query, state.company?.model, { brand: state.company?.name });
  const q = String(query).trim().toLowerCase();
  let volume = Math.max(0, Math.round(km.volume * estimateMult(state, engine, `vol|${q}`) / 10) * 10);
  let zero = false;
  if (km.volume < ESTIMATE.zeroVolumeBelow && h01(`${state.seed}|${engine}|zero|${q}`) < ESTIMATE.zeroVolumeChance) { volume = 0; zero = true; }
  const kd = Math.round(clamp(km.kd + ESTIMATE[engine].kdSd * normalFrom(`${state.seed}|${engine}|kd|${q}`), 0, 100));
  return { volume, kd, zero, tier: kd < 20 ? 'long' : kd < 50 ? 'mid' : 'hard', commercial: km.commercial };
}
/** A tool's estimate of a site's monthly organic traffic; small sites are overestimated several-fold. */
export function estimateTraffic(state, engine, siteKey, trueMonthly) {
  return Math.round(trueMonthly * estimateMult(state, engine, `traffic|${siteKey}`, { smallSite: trueMonthly < ESTIMATE.smallSiteMonthly }));
}
// Rivals' hidden organic traffic (truth the player never sees directly) [design: 2k-200k/mo by rank].
export const rivalTrueTraffic = (state, name, i) => Math.round(2000 * Math.pow(100, 1 - i / 5) * (0.5 + h01(`${state.seed}|rt|${name}`)));

const BUCKETS = [[0, 10], [10, 100], [100, 1000], [1000, 10000], [10000, 100000], [100000, Infinity]];
const bucketLabel = ([lo, hi]) => (hi === Infinity ? `${(lo / 1000).toLocaleString()}K+` : `${lo >= 1000 ? `${lo / 1000}K` : lo}-${hi >= 1000 ? `${hi / 1000}K` : hi}`);

/**
 * What the player can know about a query's demand. Organic's keyword box calls this instead of the hidden truth.
 * → { source: 'ahrefs'|'semrush'|'gsc'|'planner'|null, volume?, kd?, tier?, range?, impressions?, clicks?, position?, commercial, others: [...], note }
 */
export function keywordInsight(state, query) {
  const q = String(query ?? '').trim();
  const commercial = keywordMetrics(q, state.company?.model, { brand: state.company?.name }).commercial;
  if (!q) return { source: null, commercial, note: '' };
  const tools = keywordTools(state);
  if (tools.length) {
    const ests = tools.map((id) => ({ id, label: TOOLS[id].vendor, ...estimateKeyword(state, TOOLS[id].engine, q) }));
    const [first, ...rest] = ests;
    return { source: TOOLS[first.id].engine, label: first.label, volume: first.volume, kd: first.kd, tier: first.tier, zero: first.zero, commercial, others: rest, note: `${first.label} estimate. Third-party volumes miss by ~50-68% at the median vs Google's own data; long-tail terms often show 0.` };
  }
  const T = ensureSearch(state);
  if (T.subs.gsc) {
    const art = (state.apps.organic?.articles ?? []).find((a) => a.query?.trim().toLowerCase() === q.toLowerCase());
    const row = art ? gscReport(state).rows.find((r) => r.id === art.id) : null;
    if (row) return { source: 'gsc', impressions: row.impressions, clicks: row.clicks, position: row.position, commercial, note: `Search Console (last 28 days to ${GSC.lagDays} days ago): real impressions for your page, not total demand.` };
  }
  if (T.subs.planner) {
    const v = keywordMetrics(q, state.company?.model, { brand: state.company?.name }).volume;
    const b = BUCKETS.find(([lo, hi]) => v >= lo && v < hi);
    return { source: 'planner', range: bucketLabel(b), commercial, note: 'Google Keyword Planner range (no ad spend = ranges only, no difficulty).' };
  }
  return { source: null, commercial, note: T.subs.gsc ? 'No data yet: Search Console shows only queries your pages already get impressions for. Add Keyword Planner (free, ranges) or a keyword tool for volume and difficulty.' : 'No keyword data. Verify Search Console (free), add Keyword Planner for ranges, or subscribe to Ahrefs/Semrush in Search & AI visibility.' };
}
/** Short label for a published article's demand, through the same lens. */
export function keywordLabel(state, query) {
  const k = keywordInsight(state, query);
  if (k.source === 'ahrefs' || k.source === 'semrush' || k.source === 'keysearch') return `~${k.volume.toLocaleString()}/mo · KD ${k.kd} (${k.label})`;
  if (k.source === 'gsc') return `${k.impressions.toLocaleString()} impressions / 28d (GSC)`;
  if (k.source === 'planner') return `${k.range}/mo (Planner)`;
  return 'volume unknown';
}

// ---------------- Content optimizer (Surfer / Clearscope) ----------------

const GENERIC_TERMS = ['pricing', 'free trial', 'integrations', 'templates', 'step by step', 'examples', 'best practices', 'checklist', 'comparison', 'pros and cons', 'how to', 'small business', 'automation', 'dashboard', 'reports', 'alternatives', 'features', 'setup', 'faq', 'tips'];
export function makeBrief(state, query) {
  if (!hasKind(state, 'optimizer')) return { ok: false, error: 'Needs Surfer or Clearscope.' };
  const T = ensureSearch(state);
  const q = String(query).trim().toLowerCase();
  if (!q) return { ok: false, error: 'Enter a target query.' };
  const qTerms = q.split(/\s+/).filter((w) => w.length > 3);
  const topic = String(state.company?.oneLiner ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 4).slice(0, 6);
  const gen = GENERIC_TERMS.filter((t, i) => h01(`${state.seed}|brief|${q}|${i}`) < 0.5).slice(0, 8);
  const terms = [...new Set([...qTerms, ...topic, ...gen])].slice(0, 16);
  const targetWords = Math.round((1200 + 1400 * h01(`${state.seed}|bw|${q}`)) / 50) * 50;
  const headings = ['What it is', 'How it works', `Best ${qTerms.slice(-1)[0] ?? 'options'}`, 'Pricing', 'FAQ'];
  const b = { query: q, day: state.day, terms, targetWords, headings, last: null };
  T.briefs[q] = b;
  T.acted.brief = true;
  return { ok: true, brief: b, hoursCost: OPTIMIZER.briefHours };
}
/** Score a draft against the brief like Surfer/Clearscope do: term coverage, length, and stuffing. */
export function scoreDraft(state, query, text) {
  const T = ensureSearch(state);
  const b = T.briefs[String(query).trim().toLowerCase()];
  if (!b) return { ok: false, error: 'Make a brief for this query first.' };
  const body = String(text).toLowerCase();
  const n = words(text);
  const hits = b.terms.filter((t) => body.includes(t));
  const occurrences = b.terms.reduce((a, t) => a + (body.split(t).length - 1), 0);
  const coverage = b.terms.length ? hits.length / b.terms.length : 0;
  const density = n ? occurrences / n : 0;
  const lengthMatch = n ? Math.abs(n - b.targetWords) / b.targetWords < 0.12 : false;
  // Following every term and the competitors' word count reads like the other ten pages [design].
  const samey = coverage >= OPTIMIZER.sameyAbove && (density > 0.035 || lengthMatch);
  const score = Math.round(clamp(coverage * 85 + (lengthMatch ? 10 : n >= b.targetWords * 0.6 ? 5 : 0) + (density > 0.05 ? -10 : 0), 0, 100));
  b.last = { day: state.day, score, coverage: round2(coverage), density: round2(density), samey, words: n, missing: b.terms.filter((t) => !hits.includes(t)) };
  return { ok: true, ...b.last, hoursCost: OPTIMIZER.scoreHours };
}
/** Applied once to each newly published article: a sensibly used brief nudges it up; a blindly followed one reads samey. */
export function applyBriefs(state) {
  const T = ensureSearch(state);
  const arts = state.apps.organic?.articles ?? [];
  if (T.seenArticles == null) { T.seenArticles = arts.map((a) => a.id); return; }
  const seen = new Set(T.seenArticles);
  for (const a of arts) {
    if (seen.has(a.id)) continue;
    T.seenArticles.push(a.id);
    const b = T.briefs[String(a.query ?? '').trim().toLowerCase()];
    if (!b?.last || a.day - b.last.day > 14 || typeof a.position !== 'number') continue;
    if (b.last.samey) {
      a.samey = true;
      a.briefOffset = OPTIMIZER.sameyPositions; // kept by the monthly drift (growth/seoDynamics.js targetPosition)
      a.position = Math.min(60, a.position + OPTIMIZER.sameyPositions);
      logMistake(state, { functionId: 'content_seo_geo', id: 'over_optimized_brief', label: 'Followed the content-optimizer checklist blindly', cost: { hours: 2 }, delayed: true, detail: `"${a.title}" hit ${Math.round(b.last.coverage * 100)}% of the suggested terms at the competitors' length: it reads like the ten pages already ranking, so it ranks ~${OPTIMIZER.sameyPositions} positions lower and is cited less.`, app: 'searchtools' });
    } else if (b.last.coverage >= 0.5) { a.briefOffset = -OPTIMIZER.helpPositions; a.position = Math.max(1, a.position - OPTIMIZER.helpPositions); }
  }
  if (T.seenArticles.length > 500) T.seenArticles.splice(0, T.seenArticles.length - 500);
}

// ---------------- Site audit (Screaming Frog / Ahrefs Webmaster Tools site audit) ----------------

/** Technical issues: the core-SEO engine's own list when it provides one, plus AI-crawler and pricing-render findings. */
export function siteAudit(state) {
  const T = ensureSearch(state);
  const crawler = Object.keys(T.subs).find((id) => TOOLS[id]?.kind === 'crawler') ?? (T.subs.awt ? 'awt' : null);
  if (!crawler) return { ok: false, error: 'Needs Screaming Frog (free up to 500 URLs) or Ahrefs Webmaster Tools.' };
  const urls = siteUrls(state);
  const cap = TOOLS[crawler].urlCap ?? 5000;
  const issues = [];
  let core = null;
  try { core = technicalIssues(state); } catch { core = null; }
  for (const i of [].concat(core?.issues ?? core ?? [])) issues.push({ tone: ['high', 'bad'].includes(i.severity) || i.tone === 'bad' ? 'bad' : 'warn', text: i.label ?? i.text ?? String(i.id ?? i) });
  const blocked = Object.entries(T.robots.blocked).filter(([, b]) => b).map(([k]) => k);
  if (blocked.length) issues.push({ tone: 'bad', text: `robots.txt / CDN rules block ${blocked.join(', ')}.` });
  for (const f of T.facts.wrong) if (f.open.includes('pricing_page')) issues.push({ tone: 'warn', text: 'Pricing page renders prices with JavaScript only: crawlers and AI answers see no price (or an old cached one).' });
  if (T.llmsTxt) issues.push({ tone: 'info', text: '/llms.txt found (no known effect on rankings or AI citations).' });
  T.robots.checked = true;
  T.acted.siteAudit = true;
  return { ok: true, crawler: TOOLS[crawler].label, urls, crawled: Math.min(urls, cap), truncated: urls > cap, issues, coreAvailable: core != null, hoursCost: 1 };
}

// Search Console verified from the Organic app's technical setup counts as the free GSC subscription here, and the
// reverse (subscribe() sets the core flag), so both apps agree on whether you have it.
export function syncSearchConsole(state) {
  OE.ensureOrganic(state);
  const T = ensureSearch(state), S = ensureSeo(state);
  if (S.tech.gsc && !T.subs.gsc) { T.subs.gsc = { day: state.day, recurringId: null }; T.gscVerifiedDay ??= state.day; } // data starts the day the property is added
  if (T.subs.gsc && !S.tech.gsc) { S.tech.gsc = true; S.tech.setup = S.tech.gsc && S.tech.sitemap; }
}
