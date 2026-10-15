// GEO engine: AI-answer visibility as share of voice across prompts and engines (ChatGPT, Claude, Gemini, Perplexity,
// Google AI Overviews), driven by third-party mentions, reviews, comparison pages, community presence, brand, AI-crawler
// gates and training-data lag. Replaces the single never-decaying O.citations scalar: every increment other code adds
// to O.citations is absorbed here as a decaying mention, and O.citations is rewritten each day as the live (decayed)
// mention count so existing readers keep a compatible number. Traffic for the Organic engine: aiDailyVisits().
// Research: docs/research/seo/llm-visibility.md. Parameters and [design] marks: ./params.js.
// No DOM. Passive daily work consumes no shared randomness unless the player acted (trackers, fake threads, paid
// placements) or the brand is visible enough for wrong facts to appear.

import { ensure, notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { logMistake, tierFromScore, unknownRead } from '../../core/operator.js';
import { rng, uid, hash, round2, clamp } from '../../core/util.js';
import { mainPlan } from '../../core/market.js';
import { seoRamp } from '../growth/organicModel.js';
import { ENGINES, ENGINE_ORDER, SIGNAL, BUYER_MIX, RUN_NOISE, AI_TRAFFIC, HOURS, RISK, CDN_BLOCK_CHANCE, BOTS, TOOLS } from './params.js';

export const h01 = (s) => parseInt(hash(s), 36) / 4294967296; // deterministic 0..1 from a string
const sat = (S) => 1 - Math.exp(-Math.max(0, S) / SIGNAL.saturation);

export function ensureSearch(state) {
  const T = ensure(state, 'searchtools', () => ({}));
  T.subs ??= {}; // toolId -> { recurringId, day }
  T.gscHist ??= []; // [{ d, rows: [[articleId, clicks, impressions, position]] }]
  T.lastVisits ??= {}; // articleId -> cumulative visits at the last snapshot
  if (!T.robots) {
    // Some CDN/template defaults block AI bots silently [design CDN_BLOCK_CHANCE]; deterministic per company seed.
    const blocked = h01(`${state.seed}|robots`) < CDN_BLOCK_CHANCE;
    T.robots = { blocked: Object.fromEntries(BOTS.map((b) => [b, blocked])), cdnDefault: blocked, checked: false, edited: false };
  }
  T.llmsTxt ??= false;
  T.prompts ??= { list: [], quality: null, judgedDay: null, mock: true, feedback: '' };
  T.mentions ??= []; // [{ id, kind: 'own'|'listicle', day, w }]
  T.seen ??= { citations: 0, channel: 0, listicles: 0, reviews: 0 }; // everything already counted elsewhere is absorbed on the first sync
  T.community ??= { weeks: [], fakes: [], neg: 0, bannedDay: null };
  T.paid ??= [];
  T.facts ??= { wrong: [], lastPrice: null };
  T.hist ??= []; // weekly [{ d, base, comm }]
  T.track ??= { cells: {}, since: null };
  T.samples ??= [];
  T.pasted ??= [];
  T.audits ??= [];
  T.grader ??= [];
  T.briefs ??= {};
  T.seenArticles ??= null;
  T.acted ??= {}; // what the player has done (operator read)
  return T;
}

// ---------------- Inputs from other apps (read-only) ----------------

const organic = (state) => state.apps.organic ?? null;
const reviewsCount = (state) => state.apps.channels?.reviews?.count ?? 0;
const COMPARE = /\b(vs\.?|versus|alternative|alternatives|compare|comparison)\b/i;

/** Comparison / "alternatives" pages: Organic articles and Market pages, weighted by judged quality and freshness. */
export function comparisonPages(state) {
  const out = [];
  for (const a of organic(state)?.articles ?? []) {
    if (!COMPARE.test(`${a.title} ${a.query}`)) continue;
    const last = a.refreshedDay ?? a.updatedDay ?? a.day;
    out.push({ title: a.title, q: clamp(a.quality ?? 0.5, 0, 1), stale: state.day - last > SIGNAL.staleDays, samey: Boolean(a.samey), slop: (a.slop ?? 0) > 0.5 });
  }
  for (const p of state.apps.world?.pages ?? []) if (p.kind !== 'battlecard') out.push({ title: p.title, q: clamp(p.score ?? 0.5, 0, 1), stale: state.day - p.day > SIGNAL.staleDays });
  return out;
}

// Rivals named in answers: real competitors from the Market app when known, else fictional stand-ins.
const FICTIONAL = ['Northpeak', 'Flowbase', 'Stackwise', 'Brightdesk', 'Tallyhub'];
export function rivalNames(state) {
  const r = (state.apps.world?.rivals ?? []).filter((x) => x.status !== 'exited' && x.name).sort((a, b) => (b.threat ?? 0) - (a.threat ?? 0)).map((x) => x.name);
  return [...new Set([...r, ...FICTIONAL])].slice(0, 5);
}
const RIVAL_P = [0.66, 0.55, 0.42, 0.3, 0.2]; // [design] leaders named in ~64-73% of runs (SparkToro), tail lower

// ---------------- Absorb legacy citation increments ----------------

export function syncMentions(state) {
  const T = ensureSearch(state);
  const O = organic(state);
  const C = state.apps.channels;
  const ch = C?.aiSearch?.mentions ?? 0;
  const dCh = Math.max(0, ch - (T.seen.channel ?? 0));
  // Channels adds 2 per live listicle, 0.2 per review (reviews are counted directly) and 1-3 per press piece.
  const lists = (C?.aiSearch?.pitches ?? []).filter((p) => p.accepted && p.liveDay != null && p.liveDay <= state.day).length;
  const newL = Math.max(0, lists - (T.seen.listicles ?? 0));
  const newR = Math.max(0, reviewsCount(state) - (T.seen.reviews ?? 0));
  if (newL > 0) T.mentions.push({ id: uid('mn'), kind: 'listicle', day: state.day, w: newL });
  const press = dCh - 2 * newL - 0.2 * newR;
  if (press > 0.01) T.mentions.push({ id: uid('mn'), kind: 'own', day: state.day, w: round2(press) });
  T.seen.channel = ch; T.seen.listicles = lists; T.seen.reviews = reviewsCount(state);
  if (O) {
    const dO = Math.max(0, (O.citations ?? 0) - (T.seen.citations ?? 0) - dCh);
    if (dO > 0.001) T.mentions.push({ id: uid('mn'), kind: 'own', day: state.day, w: round2(dO) });
    T.seen.citations = O.citations ?? 0;
  }
  if (T.mentions.length > 400) T.mentions.splice(0, T.mentions.length - 400);
  return T;
}
// Live (decayed) mention count, written back as O.citations so older readers keep a compatible scalar.
export function liveMentionCount(state) {
  const T = ensureSearch(state);
  let n = 0;
  for (const m of T.mentions) n += m.kind === 'listicle' ? m.w * 2 : m.w * Math.pow(0.5, (state.day - m.day) / SIGNAL.ownHalfLifeDays);
  return round2(n);
}

// ---------------- Signal ----------------

/** Current signal parts in mention equivalents (engine-independent base + community, which engines weight differently). */
export function signalParts(state) {
  const T = ensureSearch(state);
  let listicle = 0, own = 0;
  for (const m of T.mentions) {
    if (m.kind === 'listicle') listicle += SIGNAL.listicle * m.w;
    else own += SIGNAL.ownMention * m.w * Math.pow(0.5, (state.day - m.day) / SIGNAL.ownHalfLifeDays);
  }
  const reviews = SIGNAL.review * Math.min(SIGNAL.reviewCap, reviewsCount(state));
  const comparison = comparisonPages(state).reduce((a, p) => a + SIGNAL.comparisonPage * (0.3 + 0.7 * p.q) * (p.stale ? SIGNAL.staleMult : 1) * (p.samey || p.slop ? 0.4 : 1), 0);
  const brand = SIGNAL.brandPer10 * ((state.market?.brand ?? 0) / 10);
  const paid = T.paid.filter((p) => p.live).reduce((a, p) => a + (p.disclosed ? SIGNAL.paidDisclosed : SIGNAL.paidUndisclosed), 0);
  const community = communitySignal(state);
  const neg = T.community.neg + T.paid.filter((p) => p.detected).length * 2;
  const base = listicle + own + reviews + comparison + brand + paid;
  return { listicle, own, reviews, comparison, brand, paid, community, neg, base };
}
export function communitySignal(state) {
  const T = ensureSearch(state);
  const recent = T.community.weeks.filter((d) => state.day - d <= 180);
  const n = recent.length + 0.5 * (T.community.weeks.length - recent.length);
  // Authentic presence pays only after months of showing up; generic answers count less (judged posts in Organic).
  const ramp = clamp((n - 3) / SIGNAL.communityRampWeeks, 0, 1);
  const judged = (organic(state)?.community?.posts ?? []).filter((p) => state.day - p.day <= 60 && !p.removed);
  const quality = judged.length ? clamp(judged.reduce((a, p) => a + (p.judge?.helpfulness ?? p.helpfulness ?? 0.5), 0) / judged.length, 0, 1) : 0.4;
  const authentic = SIGNAL.communityWeek * n * ramp * (0.4 + 0.6 * quality);
  const fakes = T.community.fakes.filter((f) => f.live).length * SIGNAL.astroturfPost;
  return authentic + fakes;
}
const engineSignal = (base, comm, neg, e) => Math.max(0, base + comm * SIGNAL.redditWeight[e] - neg);

// What the engine's training data knew about you lagDays ago (0 before the brand existed).
function parametricSignal(state, e) {
  const T = ensureSearch(state);
  const lag = ENGINES[e].lagDays;
  if (!lag) return null;
  const target = state.day - lag;
  let h = null;
  for (const x of T.hist) { if (x.d <= target) h = x; else break; }
  return h ? engineSignal(h.base, h.comm, h.neg ?? 0, e) : 0;
}

/** Retrieval gate per engine: blocked search bots → 0; AI Overviews lean on Google top-10 rankings. */
export function retrievalGate(state, e) {
  const T = ensureSearch(state);
  const E = ENGINES[e];
  let g = 1;
  if (E.bot && T.robots.blocked[E.bot]) g = E.botMult ?? 0;
  if (E.needsRanking) {
    const top = (organic(state)?.articles ?? []).filter((a) => a.commercial || COMPARE.test(`${a.title} ${a.query}`)).filter((a) => seoRamp(state.day - a.day, a.tier ?? 'mid') > 0.5 && (a.position ?? 99) <= 10).length;
    g *= 0.25 + 0.75 * Math.min(1, top / 3); // Ahrefs Mar 2026: 37% of AI-cited URLs rank top-10 for the query
  }
  return g;
}

/** Probability you are named in one run of a buyer prompt of this type on engine e (before run noise). */
export function mentionProb(state, e, type = 'generic', parts = signalParts(state)) {
  const E = ENGINES[e];
  const cur = engineSignal(parts.base, parts.community, parts.neg, e);
  const par = parametricSignal(state, e);
  const r = E.retrieve[type === 'comparison' ? 'comparison' : 'generic'];
  const cap = type === 'comparison' ? Math.min(0.9, E.cap * 1.15) : E.cap;
  const pRet = cap * sat(cur) * retrievalGate(state, e);
  const pPar = cap * sat(par ?? cur);
  return clamp(r * pRet + (1 - r) * pPar, 0, 0.95);
}

/** TRUE buyer visibility: share of real buyer AI answers that name you, weighted by engine referral share. */
export function trueVisibility(state) {
  const parts = signalParts(state);
  const byEngine = {};
  let v = 0;
  for (const e of ENGINE_ORDER) {
    byEngine[e] = BUYER_MIX.generic * mentionProb(state, e, 'generic', parts) + BUYER_MIX.comparison * mentionProb(state, e, 'comparison', parts);
    v += ENGINES[e].share * byEngine[e];
  }
  const negShare = parts.neg > 0 ? parts.neg / (parts.neg + Math.max(1, parts.base + parts.community)) : 0;
  return { v, byEngine, negShare, parts };
}

// ---------------- Wrong facts ----------------

const FACT_KINDS = {
  stale_pricing: 'AI answers quote your old price',
  free_plan: 'AI answers say you have a free plan you do not offer',
};
export const FIX_SOURCES = { pricing_page: 'Pricing page as plain HTML text, dated', listings: 'G2 / Capterra / directory listings updated', old_posts: 'Old blog posts and launch pages corrected', facts_page: 'Publish a dated "facts about us" page' };

function wrongWeight(state, f) {
  if (!f.fixedDay) return 1;
  let w = 0;
  for (const e of ENGINE_ORDER) {
    const E = ENGINES[e];
    const r = BUYER_MIX.generic * E.retrieve.generic + BUYER_MIX.comparison * E.retrieve.comparison;
    const retWrong = state.day < f.retrievalFixDay ? 1 : 0;
    const parWrong = state.day < f.fixedDay + E.lagDays ? 1 : 0;
    w += E.share * (r * retWrong + (1 - r) * parWrong);
  }
  return w;
}
export const activeWrongFacts = (state) => ensureSearch(state).facts.wrong.filter((f) => wrongWeight(state, f) > 0.01);
/** Share of AI answers (engine-weighted) that still carry a wrong fact about you. */
export function wrongFactShare(state) {
  return Math.min(1, ensureSearch(state).facts.wrong.reduce((a, f) => a + wrongWeight(state, f), 0));
}
export function addWrongFact(state, kind, detail = '') {
  const T = ensureSearch(state);
  const sources = ['pricing_page'];
  if (reviewsCount(state) > 0 || T.mentions.some((m) => m.kind === 'listicle')) sources.push('listings');
  if ((organic(state)?.articles ?? []).length) sources.push('old_posts');
  const f = { id: uid('wf'), kind, label: FACT_KINDS[kind], detail, since: state.day, open: sources, fixed: [], fixedDay: null, retrievalFixDay: null, noticed: false };
  T.facts.wrong.push(f);
  return f;
}
/** Fix one source of a wrong fact. When every source is fixed, retrieval engines correct in weeks, training engines months later. */
export function fixFactSource(state, factId, source) {
  const T = ensureSearch(state);
  const f = T.facts.wrong.find((x) => x.id === factId);
  if (!f) return { ok: false, error: 'No such issue.' };
  if (source === 'facts_page') { f.factsPage = true; T.acted.factsPage = true; }
  else if (f.open.includes(source)) { f.open = f.open.filter((s) => s !== source); f.fixed.push(source); }
  else return { ok: false, error: 'Already fixed.' };
  T.acted.fixes = (T.acted.fixes ?? 0) + 1;
  if (!f.open.length && !f.fixedDay) {
    f.fixedDay = state.day;
    const [lo, hi] = RISK.retrievalFixDays;
    f.retrievalFixDay = state.day + (f.factsPage ? lo : Math.round(lo + (hi - lo) * rng(state)));
  } else if (f.fixedDay && source === 'facts_page') f.retrievalFixDay = Math.min(f.retrievalFixDay, state.day + RISK.retrievalFixDays[0]);
  return { ok: true, hoursCost: HOURS.factFix[source], fact: f };
}

// ---------------- Daily ----------------

export function geoDay(state) {
  const T = syncMentions(state);
  const O = organic(state);
  // Listicles quietly drop or replace you (Seer: ~30% monthly swing in cited listicles).
  if (state.day % 30 === 0) {
    for (const m of T.mentions) if (m.kind === 'listicle' && m.w > 0 && rng(state) < SIGNAL.listicleMonthlyDrop) m.w = 0;
    T.mentions = T.mentions.filter((m) => m.w > 0);
  }
  if (O) { O.citations = liveMentionCount(state); T.seen.citations = O.citations; }

  const parts = signalParts(state);
  if (state.day % 7 === 0 || !T.hist.length) {
    T.hist.push({ d: state.day, base: round2(parts.base), comm: round2(parts.community), neg: round2(parts.neg) });
    if (T.hist.length > 160) T.hist.shift();
  }
  // Negative threads fade slowly (half-life ~180 days) [design].
  if (T.community.neg > 0) T.community.neg = Math.max(0, T.community.neg * Math.pow(0.5, 1 / 180) - 0.0005);

  fakeThreadsDay(state, T);
  paidPlacementsDay(state, T);
  wrongFactsDay(state, T, parts);
  trackerDay(state, T);
}

function fakeThreadsDay(state, T) {
  const live = T.community.fakes.filter((f) => f.live);
  if (!live.length || state.day % 7 !== 0) return;
  const p = 1 - Math.pow(1 - RISK.astroturfDetectPerPostWeekly * (1 + 0.15 * (live.length - 1)), live.length);
  if (rng(state) >= p) return;
  for (const f of live) { f.live = false; f.detected = state.day; }
  T.community.neg += SIGNAL.backlashNeg;
  T.community.bannedDay = state.day;
  if (state.apps.organic?.community?.banned) state.apps.organic.community.banned.reddit = state.day;
  if (state.market) state.market.brand = Math.max(0, (state.market.brand ?? 0) - RISK.astroturfBrand);
  const hours = live.reduce((a, f) => a + (f.hours ?? HOURS.astroturf), 0);
  logMistake(state, { functionId: 'content_seo_geo', id: 'reddit_astroturf', label: 'Seeded Reddit threads from fake accounts', cost: { hours: round2(hours), reputation: RISK.astroturfBrand }, delayed: true, circles: true, detail: `Moderators traced ${live.length} thread(s) to your company: accounts banned, the threads deleted, and a "this brand astroturfs" thread now gets cited by AI answers instead.`, app: 'searchtools' });
  notify(state, 'Reddit mods caught your seeded threads. Your accounts are banned and a callout thread about your brand is getting upvoted.', { type: 'bad', app: 'searchtools' });
}

function paidPlacementsDay(state, T) {
  if (state.day % 30 !== 0) return;
  for (const p of T.paid) {
    if (!p.live || p.disclosed) continue;
    if (rng(state) >= RISK.paidUndisclosedDetectMonthly) continue;
    p.live = false; p.detected = state.day;
    const [lo, hi] = RISK.ftcLegalUsd;
    const usd = Math.round(lo + (hi - lo) * rng(state));
    post(state, { amount: -usd, counterparty: 'Outside counsel', description: 'Response to complaint about undisclosed paid "best tools" placement', category: 'legal', method: 'ach' });
    if (state.market) state.market.brand = Math.max(0, (state.market.brand ?? 0) - 3);
    logMistake(state, { functionId: 'content_seo_geo', id: 'paid_listicle_undisclosed', label: 'Paid for an undisclosed "best tools" placement', cost: { usd: usd + p.usd, reputation: 3 }, delayed: true, detail: `A competitor flagged the list as paid placement without disclosure (FTC Act s.5 / endorsement guides; statutory penalties reach ~$51,744 per violation). Legal response cost $${usd.toLocaleString()} on top of the $${p.usd.toLocaleString()} placement, and the list was pulled.`, app: 'searchtools' });
    notify(state, `Your paid placement on "${p.site}" was exposed as undisclosed advertising. Legal bill: $${usd.toLocaleString()}.`, { type: 'bad', app: 'searchtools' });
  }
}

function wrongFactsDay(state, T, parts) {
  const plan = mainPlan(state);
  const price = plan?.price ?? null;
  const visible = parts.base + parts.community > 3;
  if (T.facts.lastPrice != null && price != null && price !== T.facts.lastPrice && visible && rng(state) < RISK.wrongFactOnPriceChange) {
    addWrongFact(state, 'stale_pricing', `Answers still say $${T.facts.lastPrice}/mo; you now charge $${price}.`);
  }
  if (price != null) T.facts.lastPrice = price;
  if (state.day % 30 === 15 && visible && !T.facts.wrong.some((f) => f.kind === 'free_plan' && !f.fixedDay) && rng(state) < RISK.wrongFactMonthly) {
    addWrongFact(state, 'free_plan', 'Some answers describe a free plan you never offered; trial users arrive expecting it.');
  }
  for (const f of T.facts.wrong) {
    if (f.fixedDay || state.day - f.since < RISK.wrongFactCostDays) continue;
    logMistake(state, { functionId: 'content_seo_geo', id: 'ai_wrong_facts', label: f.noticed ? 'Left a wrong fact in AI answers unfixed' : 'Never checked what AI answers say about you', cost: { hours: 1.5 }, delayed: true, charge: true, detail: `${f.label} for ${state.day - f.since} days: confused trials, refund requests and support replies (AI visitors convert ~${Math.round((1 - AI_TRAFFIC.wrongFactConv) * 100)}% worse while it lasts).`, app: 'searchtools', key: `wrongfact:${f.id}` });
  }
}

// ---------------- Sampling (manual tests, trackers, grader) ----------------

const PROMPT_FIT = (state, text) => 0.6 + 0.8 * h01(`${state.seed}|pf|${String(text).toLowerCase()}`);

/** One simulated answer run. → { you, rivals: [idx], neg, wrong } */
export function runPrompt(state, e, prompt, ctx = {}) {
  const parts = ctx.parts ?? signalParts(state);
  const names = ctx.names ?? rivalNames(state);
  const kind = prompt.kind ?? 'generic';
  const noise = Math.exp(RUN_NOISE * gaussianFrom(state));
  let p;
  if (kind === 'vanity') {
    // The brand is in the prompt: engines search for it or say they don't know it. Measures nothing about buyers.
    const known = Math.max(retrievalGate(state, e) * (ENGINES[e].retrieve.comparison), sat(parametricSignal(state, e) ?? 0) * 3);
    p = clamp(0.92 * Math.min(1, known), 0, 0.97);
  } else if (kind === 'off_target') p = 0.03;
  else p = clamp(mentionProb(state, e, kind === 'comparison' ? 'comparison' : 'generic', parts) * PROMPT_FIT(state, prompt.text) * noise, 0, 0.97);
  const you = rng(state) < p;
  const rivals = [];
  for (let i = 0; i < names.length; i++) {
    const named = new RegExp(`\\b${names[i].replace(/[^\w ]/g, '')}\\b`, 'i').test(prompt.text);
    const pr = named ? 0.95 : kind === 'vanity' ? 0.15 : kind === 'off_target' ? 0.05 : RIVAL_P[i] * ENGINES[e].cap / 0.68 * noise;
    if (rng(state) < clamp(pr, 0, 0.97)) rivals.push(i);
  }
  const neg = you && parts.neg > 0 && rng(state) < parts.neg / (parts.neg + Math.max(1, parts.base));
  const wrong = you && rng(state) < 0.6 * wrongFactShare(state);
  return { you, rivals, neg, wrong };
}
function gaussianFrom(state) { const u = Math.max(1e-9, rng(state)); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng(state)); }

/** Manual testing: run prompts × runs × engines now. Returns a sample record (also stored). */
export function manualTest(state, { promptIds = null, runs = 3, engines = ['chatgpt', 'claude', 'perplexity'] } = {}) {
  const T = ensureSearch(state);
  const prompts = (promptIds ? T.prompts.list.filter((p) => promptIds.includes(p.id)) : T.prompts.list).slice(0, 30);
  if (!prompts.length) return { ok: false, error: 'Build a prompt set first.' };
  runs = clamp(runs | 0, 1, 10);
  const names = rivalNames(state);
  const parts = signalParts(state);
  const rows = [];
  for (const pr of prompts) for (const e of engines) {
    const row = { promptId: pr.id, prompt: pr.text, kind: pr.kind, engine: e, runs, you: 0, neg: 0, wrong: 0, rivals: names.map(() => 0) };
    for (let r = 0; r < runs; r++) { const x = runPrompt(state, e, pr, { parts, names }); row.you += x.you; row.neg += x.neg; row.wrong += x.wrong; for (const i of x.rivals) row.rivals[i]++; }
    rows.push(row);
  }
  const answers = prompts.length * engines.length * runs;
  const s = { id: uid('smp'), day: state.day, by: 'manual', names, rows, answers };
  T.samples.unshift(s); if (T.samples.length > 30) T.samples.length = 30;
  T.acted.manualRuns = (T.acted.manualRuns ?? 0) + answers;
  T.acted.maxRuns = Math.max(T.acted.maxRuns ?? 0, runs);
  noticeFacts(state, rows);
  return { ok: true, sample: s, hoursCost: round2(answers * HOURS.manualPerAnswer) };
}
function noticeFacts(state, rows) {
  if (!rows.some((r) => r.wrong > 0)) return;
  for (const f of activeWrongFacts(state)) f.noticed = true;
}

/** HubSpot-style one-off grade: a few single runs on three engines of generic category prompts. Noisy by design. */
export function runGrader(state) {
  const T = ensureSearch(state);
  const last = T.grader[0];
  if (last && state.day - last.day < 30) return { ok: false, error: 'The free grader is a one-off look; run it again next month.' };
  const engines = ['chatgpt', 'perplexity', 'gemini'];
  const parts = signalParts(state);
  let hits = 0, n = 0, neg = 0;
  for (const e of engines) for (let i = 0; i < 5; i++) { const x = runPrompt(state, e, { text: `category prompt ${i}`, kind: i < 3 ? 'generic' : 'comparison' }, { parts }); hits += x.you; neg += x.neg; n++; }
  const score = Math.round(clamp(100 * (hits / n) * 0.8 + 20 * (1 - neg / Math.max(1, hits)) * (hits ? 1 : 0), 0, 100));
  const label = score >= 70 ? 'Leader' : score >= 40 ? 'Challenger' : 'Niche';
  const g = { day: state.day, score, label, hits, n };
  T.grader.unshift(g);
  T.acted.grader = true;
  return { ok: true, grade: g };
}

// Trackers: one run per tracked prompt per covered engine per day, kept as ~30-day moving counts.
export function trackerCapacity(state) {
  const T = ensureSearch(state);
  let prompts = 0; const engines = new Set();
  for (const id of Object.keys(T.subs)) {
    const t = TOOLS[id];
    if (t?.kind === 'tracker') { prompts = Math.max(prompts, t.prompts); t.engines.forEach((e) => engines.add(e)); }
    if (t?.kind === 'keyword' && t.brandRadarPrompts) { prompts = Math.max(prompts, t.brandRadarPrompts); ['chatgpt', 'perplexity', 'aio', 'gemini'].forEach((e) => engines.add(e)); }
  }
  return { prompts, engines: [...engines] };
}
function trackerDay(state, T) {
  const cap = trackerCapacity(state);
  if (!cap.prompts || !T.prompts.list.length) return;
  T.track.since ??= state.day;
  const names = rivalNames(state);
  const parts = signalParts(state);
  const k = 29 / 30;
  for (const pr of T.prompts.list.slice(0, cap.prompts)) for (const e of cap.engines) {
    const key = `${pr.id}|${e}`;
    const c = (T.track.cells[key] ??= { n: 0, you: 0, neg: 0, wrong: 0, rivals: names.map(() => 0) });
    const x = runPrompt(state, e, pr, { parts, names });
    c.n = c.n * k + 1; c.you = c.you * k + x.you; c.neg = c.neg * k + x.neg; c.wrong = c.wrong * k + x.wrong;
    c.rivals = names.map((_, i) => (c.rivals[i] ?? 0) * k + (x.rivals.includes(i) ? 1 : 0));
    if (x.wrong) for (const f of activeWrongFacts(state)) f.noticed = true;
  }
  T.acted.tracked = true;
}

/** Share of voice from a set of sample rows or tracker cells: { you, rivals: [{name, share}], visibility, n }. */
export function shareOfVoice(names, cells) {
  let you = 0, n = 0, neg = 0;
  const r = names.map(() => 0);
  for (const c of cells) { you += c.you; n += c.n ?? c.runs; neg += c.neg ?? 0; c.rivals.forEach((v, i) => { r[i] += v; }); }
  const tot = you + r.reduce((a, b) => a + b, 0);
  return { visibility: n ? you / n : 0, sov: tot ? you / tot : 0, n, negShare: you ? neg / you : 0, rivals: names.map((name, i) => ({ name, visibility: n ? r[i] / n : 0, sov: tot ? r[i] / tot : 0 })) };
}
export function trackerReport(state) {
  const T = ensureSearch(state);
  const names = rivalNames(state);
  const cap = trackerCapacity(state);
  const cells = Object.entries(T.track.cells).map(([key, c]) => { const [pid, e] = key.split('|'); return { pid, e, ...c }; });
  const byEngine = Object.fromEntries(cap.engines.map((e) => [e, shareOfVoice(names, cells.filter((c) => c.e === e))]));
  const byPrompt = T.prompts.list.slice(0, cap.prompts).map((p) => ({ prompt: p, ...shareOfVoice(names, cells.filter((c) => c.pid === p.id)) }));
  return { names, cap, all: shareOfVoice(names, cells), byEngine, byPrompt };
}

// ---------------- Player actions ----------------

export function setRobots(state, bot, allowed) {
  const T = ensureSearch(state);
  if (!BOTS.includes(bot)) return { ok: false, error: 'Unknown bot.' };
  T.robots.blocked[bot] = !allowed;
  T.robots.edited = true; T.robots.checked = true;
  T.acted.robots = true;
  return { ok: true, hoursCost: HOURS.robots };
}
export function addLlmsTxt(state) {
  const T = ensureSearch(state);
  T.llmsTxt = true; T.acted.llmsTxt = true;
  return { ok: true, hoursCost: HOURS.llmsTxt, note: 'Published /llms.txt. Large studies (SE Ranking, 300k domains) find no relationship between llms.txt and AI citations: expect no change.' };
}

/** A week of disclosed, genuinely useful answers in communities. */
export function communityWeek(state) {
  const T = ensureSearch(state);
  const lastWeek = T.community.weeks.at(-1);
  if (lastWeek != null && state.day - lastWeek < 7) return { ok: false, error: 'Already logged this week.' };
  T.community.weeks.push(state.day);
  T.acted.community = true;
  return { ok: true, hoursCost: HOURS.communityWeek, weeks: T.community.weeks.length };
}
/** Seed a thread from an alt account ("anyone tried X?"). Cheap and quick until it is caught. */
export function astroturf(state) {
  const T = ensureSearch(state);
  if (T.community.bannedDay != null && state.day - T.community.bannedDay < 365) return { ok: false, error: 'Your accounts were banned; new ones get caught by the spam filters immediately.' };
  T.community.fakes.push({ id: uid('fake'), day: state.day, live: true, hours: HOURS.astroturf });
  T.acted.astroturf = (T.acted.astroturf ?? 0) + 1;
  return { ok: true, hoursCost: HOURS.astroturf };
}
/** Pay a "best X tools" site for placement. Disclosed placements count less; undisclosed ones carry FTC/backlash risk. */
export function buyPlacement(state, { site = 'a "best tools" roundup', disclosed = true } = {}) {
  const T = ensureSearch(state);
  const [lo, hi] = RISK.paidPlacementUsd;
  const usd = Math.round((lo + (hi - lo) * rng(state)) / 50) * 50;
  post(state, { amount: -usd, counterparty: String(site).slice(0, 60), description: `Paid listicle placement${disclosed ? ' (marked sponsored)' : ''}`, category: 'marketing', method: 'card' });
  const p = { id: uid('paid'), day: state.day, site: String(site).slice(0, 80), usd, disclosed: Boolean(disclosed), live: true };
  T.paid.push(p);
  if (!disclosed) T.acted.paidUndisclosed = (T.acted.paidUndisclosed ?? 0) + 1; else T.acted.paidDisclosed = (T.acted.paidDisclosed ?? 0) + 1;
  return { ok: true, hoursCost: HOURS.paidPlacement, placement: p, usdCost: usd };
}

/** GEO audit (4-8 h): crawler gates, wrong facts, a baseline sample on hidden buyer prompts, and what to do next. */
export function geoAudit(state) {
  const T = ensureSearch(state);
  T.robots.checked = true;
  const blocked = BOTS.filter((b) => T.robots.blocked[b]);
  const names = rivalNames(state);
  const parts = signalParts(state);
  const buyer = [0, 1, 2, 3, 4, 5].map((i) => ({ text: `audit buyer prompt ${i}`, kind: i < 3 ? 'generic' : 'comparison' }));
  const rows = [];
  for (const e of ['chatgpt', 'perplexity', 'gemini']) for (const pr of buyer) {
    const row = { promptId: null, prompt: pr.text, kind: pr.kind, engine: e, runs: 3, you: 0, neg: 0, wrong: 0, rivals: names.map(() => 0) };
    for (let r = 0; r < 3; r++) { const x = runPrompt(state, e, pr, { parts, names }); row.you += x.you; row.neg += x.neg; row.wrong += x.wrong; for (const i of x.rivals) row.rivals[i]++; }
    rows.push(row);
  }
  const facts = activeWrongFacts(state);
  for (const f of facts) f.noticed = true;
  const findings = [];
  if (blocked.length) findings.push({ tone: 'bad', text: `robots.txt / CDN blocks ${blocked.join(', ')}${T.robots.cdnDefault ? ' (your CDN default, never chosen by you)' : ''}. Blocking OAI-SearchBot removes you from ChatGPT search answers; GPTBot is training only.` });
  else findings.push({ tone: 'good', text: 'AI search crawlers are allowed.' });
  for (const f of facts) findings.push({ tone: 'bad', text: `${f.label}. ${f.detail}` });
  if (parts.listicle < 6) findings.push({ tone: 'warn', text: 'Few third-party "best X" lists name you. These and review sites are the biggest lever for "best tool for…" prompts.' });
  if (reviewsCount(state) < 10) findings.push({ tone: 'warn', text: `${reviewsCount(state)} reviews on G2/Capterra. ~10-20 recent reviews is where they start to count.` });
  if (!comparisonPages(state).length) findings.push({ tone: 'warn', text: 'No comparison or "alternatives" page with real numbers. Retrieval-based answers for "X vs Y" prompts pull from these.' });
  if (T.llmsTxt) findings.push({ tone: 'info', text: 'llms.txt is published. It is harmless but has shown no effect on citations; do not count it as progress.' });
  if (!T.prompts.list.length) findings.push({ tone: 'warn', text: 'No prompt set yet: write the 20-50 questions your buyers actually ask (from sales calls, support, Search Console).' });
  const a = { id: uid('aud'), day: state.day, findings, sample: { names, rows } };
  T.audits.unshift(a); if (T.audits.length > 8) T.audits.length = 8;
  T.acted.audit = (T.acted.audit ?? 0) + 1;
  return { ok: true, audit: a, hoursCost: HOURS.audit };
}

// ---------------- Prompt set ----------------

const BUYER_RE = /\b(best|top|recommend|which|what(?:'s| is) the best|tool|tools|software|app|apps|platform|for (?:small|teams?|agencies|startups|freelancers|shopify|my)|how (?:do|can|should) i|cheapest|affordable|pricing|worth it|easiest)\b/i;
/** Heuristic prompt classification (the offline fallback for the Jev classifier). */
export function classifyPrompt(state, text) {
  const t = String(text).toLowerCase();
  const brand = String(state.company?.name ?? '').toLowerCase().trim();
  const brandTokens = brand.split(/\s+/).filter((w) => w.length > 2 && !['inc', 'llc', 'the', 'app', 'co'].includes(w));
  if ((brand && t.includes(brand)) || brandTokens.some((w) => new RegExp(`\\b${w.replace(/[^\w]/g, '')}\\b`).test(t)) || /\b(my company|our product|who (?:is|makes)|tell me about)\b/.test(t)) return 'vanity';
  const rivals = rivalNames(state).map((n) => n.toLowerCase());
  if (COMPARE.test(t) || rivals.some((r) => t.includes(r))) return 'comparison';
  const words = t.split(/\W+/).filter(Boolean);
  const topic = new Set(`${state.company?.oneLiner ?? ''} ${state.company?.icp ?? ''}`.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const onTopic = words.some((w) => topic.has(w));
  if (BUYER_RE.test(t) && words.length >= 4 && (onTopic || !topic.size)) return 'generic';
  return 'off_target';
}
/** Structural quality of a prompt set 0..1 (buyer share, size, funnel mix, duplicates). */
export function promptSetStructure(list) {
  const n = list.length;
  if (!n) return { score: 0, buyerShare: 0, vanityShare: 0, n };
  const c = (k) => list.filter((p) => p.kind === k).length;
  const buyerShare = (c('generic') + c('comparison')) / n;
  const vanityShare = c('vanity') / n;
  const mix = c('generic') && c('comparison') ? 1 : 0.6;
  const size = n >= 20 ? 1 : n >= 10 ? 0.75 : n >= 5 ? 0.5 : 0.3;
  const uniq = new Set(list.map((p) => p.text.toLowerCase().replace(/\W+/g, ' ').trim())).size / n;
  return { score: clamp(buyerShare * mix * size * uniq - 0.3 * vanityShare, 0, 1), buyerShare, vanityShare, n };
}
export function savePromptSet(state, { texts, kinds = null, rubric = null, feedback = '', mock = true }) {
  const T = ensureSearch(state);
  const list = texts.map((t, i) => ({ id: `p${hash(t.toLowerCase())}`, text: t.slice(0, 200), kind: kinds?.[i] ?? classifyPrompt(state, t) }));
  const st = promptSetStructure(list);
  const quality = rubric == null ? st.score : clamp(0.55 * st.score + 0.45 * rubric, 0, 1);
  // Changing the set resets tracker history for removed prompts.
  const keep = new Set(list.map((p) => p.id));
  for (const k of Object.keys(T.track.cells)) if (!keep.has(k.split('|')[0])) delete T.track.cells[k];
  T.prompts = { list, quality: round2(quality), structure: st, rubric, judgedDay: state.day, mock, feedback };
  T.acted.promptSet = true;
  return { ok: true, quality, structure: st, hoursCost: promptSetHours(texts.length) };
}
export const promptSetHours = (n) => round2(Math.min(HOURS.promptSetMax, HOURS.promptSetBase + HOURS.promptSetPer * n));

// ---------------- Traffic for the Organic engine ----------------

export const aiGrowth = (day) => Math.min(AI_TRAFFIC.growthCap, Math.pow(AI_TRAFFIC.growthPerYear, Math.max(0, day) / 365));
/** Expected AI-referral visits per day (before world effects and hidden demand, which the Organic engine applies). */
export function aiDailyVisits(state) {
  syncMentions(state);
  const { v } = trueVisibility(state);
  return (AI_TRAFFIC.buyerSessions[state.company?.model] ?? AI_TRAFFIC.buyerSessions.smb) * v * aiGrowth(state.day);
}
/** Conversion multiple of an AI-referred visit vs a commercial-intent organic visit (2-5x research range). */
export function aiConvMult(state) {
  const wrong = wrongFactShare(state);
  const { negShare } = trueVisibility(state);
  return AI_TRAFFIC.convVsOrganic * (1 - (1 - AI_TRAFFIC.wrongFactConv) * wrong) * (1 - (1 - AI_TRAFFIC.negConv) * negShare);
}

// ---------------- Operator read (GEO) ----------------
// Stellar: real buyer prompt set measured over many runs, crawlers checked, earned third-party mentions and fresh
// comparison pages, authentic community, wrong facts fixed fast. Mediocre: vanity prompts or one screenshot, blocked
// crawlers or llms.txt as "the GEO work", fake threads or undisclosed paid lists. Expected 12-month visibility on core
// buyer prompts (llm-visibility tiers table): stellar 40-70%, good 20-40%, average 5-15%, mediocre 0-5%.
export function geoOperatorRead(state) {
  const T = state.apps.searchtools;
  if (!T || !Object.keys(T.acted ?? {}).length) return unknownRead('Check what AI answers say about you: build a buyer prompt set and test it over several runs.');
  const A = T.acted;
  const ev = [], coaching = [];
  const pq = T.prompts.list.length ? T.prompts.quality ?? 0 : 0;
  const runs = A.tracked ? 1 : clamp((A.maxRuns ?? 0) / 5, 0, 1) * (A.manualRuns ? 1 : 0);
  const measure = 0.6 * pq + 0.4 * runs;
  ev.push(`Prompt set quality ${Math.round(pq * 100)}%${T.prompts.structure ? ` (${Math.round(T.prompts.structure.buyerShare * 100)}% buyer prompts, ${Math.round(T.prompts.structure.vanityShare * 100)}% vanity)` : ''}; ${A.tracked ? 'tracked daily' : A.manualRuns ? `manual tests up to ${A.maxRuns} runs per prompt` : 'never measured'}.`);
  const blockedSearch = ['OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot'].filter((b) => T.robots.blocked[b]);
  const gates = blockedSearch.length ? 0 : T.robots.checked ? 1 : 0.5;
  if (blockedSearch.length) { ev.push(`AI search bots blocked: ${blockedSearch.join(', ')}.`); coaching.push('Allow OAI-SearchBot, PerplexityBot and Claude-SearchBot in robots.txt and your CDN; blocking them silently removes you from those answers.'); }
  const p = signalParts(state);
  const earnedS = p.listicle + p.reviews + p.comparison + Math.max(0, p.community - T.community.fakes.filter((f) => f.live).length * SIGNAL.astroturfPost);
  const earned = clamp(earnedS / 30, 0, 1);
  ev.push(`Earned signal ${earnedS.toFixed(1)} (listicles ${p.listicle.toFixed(1)}, reviews ${p.reviews.toFixed(1)}, comparison pages ${p.comparison.toFixed(1)}).`);
  let integrity = 1;
  if (A.astroturf) { integrity = 0; ev.push(`${A.astroturf} fake community thread(s).`); coaching.push('Disclose your affiliation and answer real questions; seeded threads get traced, banned and screenshotted, and the callout thread is what AI answers cite next.'); }
  if (A.paidUndisclosed) { integrity = Math.min(integrity, 0.2); ev.push('Paid for an undisclosed list placement.'); coaching.push('If you pay for placement, it must be marked sponsored; better, earn inclusion with a real pitch, data and a free account for the author.'); }
  const wrong = T.facts.wrong;
  const facts = !wrong.length ? 0.7 : wrong.every((f) => f.fixedDay && f.fixedDay - f.since <= 30) ? 1 : wrong.some((f) => !f.fixedDay && state.day - f.since > RISK.wrongFactCostDays) ? 0 : 0.5;
  if (wrong.length) ev.push(`${wrong.filter((f) => f.fixedDay).length}/${wrong.length} wrong-fact issues fixed at the source.`);
  let score = 0.25 * measure + 0.15 * gates + 0.3 * earned + 0.15 * integrity + 0.15 * facts;
  if (A.llmsTxt && earnedS < 3 && !A.promptSet) { score = Math.min(score, 0.35); coaching.push('llms.txt and schema are not GEO work: they have shown ~no effect on citations. Spend the hours on lists, reviews and comparison pages.'); }
  if (integrity === 0) score = Math.min(score, 0.38);
  if (pq < 0.4 && T.prompts.list.length) coaching.push('Your prompt set measures vanity ("what is <brand>") prompts that always name you. Track what buyers ask: "best X for Y", "X alternatives", "X vs Y".');
  const tier = tierFromScore(score);
  if (tier !== 'stellar') coaching.push('What a stellar operator does: 20-50 real buyer prompts tracked over 5+ runs per engine, crawlers checked, 10+ earned list inclusions and 20+ fresh reviews, honest comparison pages with real numbers, disclosed community answers, wrong facts fixed at the source within weeks.');
  return { tier, score: round2(score), evidence: ev, coaching, visibility: round2(trueVisibility(state).v) };
}
