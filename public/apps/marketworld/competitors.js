// REAL competitors: whenever the business idea (one-liner / ICP / website) changes, the default chat model with web search
// finds the actual competitive set (direct rivals, adjacent tools, incumbents, status-quo substitutes, AI-native
// newcomers) with evidence-based awareness and market-share estimates. Those competitors then shape what
// prospects, customers, consumers and investors mention (knownCompetitors) and the competitive pressure on
// conversion. Offline (no key) we never invent real-sounding companies: the fictional template landscape stays,
// flagged offline ("fictional stand-ins until web search runs").
//
// The player can also add competitors by hand (source: 'player'; URL optional, fetched through /api/site). They get
// the same shape as web-found ones and feed every consumer: knownCompetitors / competitionFor (what prospects use
// today), world events (via the engine's rival list), battlecards, investor briefs, pricing comparisons and LLM context.
// Awareness / share / momentum are anchored on the signals found (big player > well-funded startup > small tool) [design].

import { hash } from '../../core/util.js';
import { LLM } from '../../core/params.js';
import { fetchSite } from '../../core/site.js';
import { apiUrl } from '../../core/transport.js';
import { profileOf } from '../../core/customer-type.js';
import { ensureWorld } from './engine.js';
import { threatOf } from './model.js';

export const DISCOVERY_MODEL = LLM.defaultModels[0]; // the game's configured default chat model (core/params.js)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const numOrNull = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };

// ---------------- Idea hash & trigger ----------------

export function ideaText(state) {
  const c = state.company;
  const w = c.website;
  return [c.oneLiner, c.icp, w?.url, w?.title, w?.description].map((x) => String(x ?? '').trim()).join(' | ');
}
export const ideaHash = (state) => hash(ideaText(state).toLowerCase().replace(/\s+/g, ' '));
const hasIdea = (state) => Boolean(String(state.company.oneLiner ?? '').trim() || String(state.company.icp ?? '').trim());

const customerTypeOf = (state) => state.company.customerType ?? null;
// Called from onDay: enqueue a discovery when the idea text or who you sell to changed (debounced to once per in-game day).
// Old saves (no customerType stored on the discovery) only rediscover on an idea change.
export function shouldDiscover(state) {
  const W = ensureWorld(state);
  if (!hasIdea(state)) return false;
  const C = W.competitors;
  const sameType = !C || C.customerType === undefined || C.customerType === customerTypeOf(state);
  if (C?.ideaHash === ideaHash(state) && sameType) return false;
  if (W.discovery?.pending && state.day - W.discovery.day < 3) return false; // a job is in flight
  if (W.discovery?.day === state.day) return false;
  return true;
}
export function markPending(state, reason) {
  ensureWorld(state).discovery = { pending: true, day: state.day, reason, hash: ideaHash(state) };
}

// ---------------- Discovery ----------------

const COMPETITOR = {
  type: 'object', additionalProperties: false,
  required: ['name', 'url', 'description', 'positioning', 'segment', 'pricingText', 'priceMonthlyUSD', 'freeTier', 'fundingStage', 'fundingTotalUSD', 'founded', 'employeesEstimate', 'customersEstimate', 'awareness', 'marketShare', 'momentum', 'kind', 'strengths', 'weaknesses', 'sources', 'confidence'],
  properties: {
    name: { type: 'string' }, url: { type: 'string', description: 'Homepage URL exactly as it appears in a search result; never guess a domain.' },
    description: { type: 'string', description: 'What it is, under 20 words.' },
    positioning: { type: 'string', description: 'Who it is for and its angle, under 20 words.' },
    segment: { type: 'string', description: 'e.g. SMB, mid-market, enterprise, consumer, prosumer' },
    pricingText: { type: 'string', description: 'Pricing as published, short. "unknown" if not found.' },
    priceMonthlyUSD: { type: ['number', 'null'], description: 'Typical entry paid plan per month in USD, null if unknown.' },
    freeTier: { type: ['boolean', 'null'] },
    fundingStage: { type: 'string', enum: ['bootstrapped', 'seed', 'series_a', 'series_b_plus', 'public', 'acquired', 'unknown'] },
    fundingTotalUSD: { type: ['number', 'null'], description: 'Only if found in a source; else null.' },
    founded: { type: ['number', 'null'] },
    employeesEstimate: { type: ['number', 'null'] },
    customersEstimate: { type: ['number', 'null'] },
    awareness: { type: 'number', description: '0..1 share of the player\'s ICP who have heard of it. Conservative; evidence-based (review counts, traffic, funding, press, years in market).' },
    marketShare: { type: 'number', description: '0..1 share of the player\'s specific niche (buyers of this job-to-be-done) using it.' },
    momentum: { type: 'string', enum: ['rising', 'flat', 'declining'] },
    kind: { type: 'string', enum: ['direct', 'adjacent', 'incumbent', 'substitute', 'ai_native'] },
    strengths: { type: 'array', items: { type: 'string' }, description: 'At most 2, under 8 words each.' },
    weaknesses: { type: 'array', items: { type: 'string' }, description: 'At most 2, under 8 words each.' },
    sources: { type: 'array', items: { type: 'string' }, description: '1-3 URLs that support the facts above.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
};
export const DISCOVERY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['category', 'marketMaturity', 'crowdedness', 'statusQuo', 'statusQuoShare', 'reasoning', 'competitors'],
  properties: {
    category: { type: 'string' },
    marketMaturity: { type: 'string', enum: ['emerging', 'growing', 'mature', 'declining'] },
    crowdedness: { type: 'string', enum: ['low', 'medium', 'high', 'very_high'] },
    statusQuo: { type: 'string', description: 'What most of the ICP use today instead (e.g. spreadsheets, an agency, doing nothing).' },
    statusQuoShare: { type: 'number', description: '0..1 share of the niche on the status quo.' },
    reasoning: { type: 'string', description: '2-4 sentences: how you searched and how you estimated awareness and share.' },
    competitors: { type: 'array', items: COMPETITOR },
  },
};

// The web plugin searches with the user message, so the message reads like a buyer's search ("alternatives to a tool
// that ... for ...") and the method lives in the system prompt. A long instruction block as the message returned
// generic "month-end close software" results and missed the category leaders (live e2e, Oct 2026).
export const DISCOVERY_SYSTEM = `You are a meticulous market researcher with web search. You only report companies you found evidence for, with source URLs; never invent a company or guess a domain. You are conservative with awareness and market-share estimates: most tools are obscure to most buyers.

List the REAL competitive set the founder faces: direct competitors (tools built for this exact job and customer), adjacent tools customers use for the same job, incumbents/suites and big players (large public or late-stage companies that cover this job, even partly), well-funded startups (report the funding stage and total raised ONLY when a source states it), status-quo substitutes (spreadsheets, agencies, bookkeepers, freelancers, manual work, doing nothing) and AI-native newcomers. Put the direct competitors a buyer would compare first. Return 8 to 15 real companies or products, most relevant first. Use null when a number is not in a source and "unknown" for an unknown funding stage; never guess funding.

Estimate for each, conservatively and from evidence (G2/Capterra/App Store review counts, web traffic, funding, press, years in market):
- awareness: share of THIS founder's ICP who have heard of it (most niche tools are 0.01-0.15; only category leaders exceed 0.5).
- marketShare: share of buyers of this exact job-to-be-done who use it. The sum over all listed plus statusQuoShare must be <= 1 (the rest is "other / nothing").
Also give the status quo, crowdedness, market maturity, and a short reasoning. Cite source URLs per company.`;

function discoveryPrompt(state) {
  const c = state.company;
  const kind = c.model === 'b2c' ? 'consumer app' : c.model === 'smb' ? 'small-business software' : 'B2B software';
  const site = c.website ? [c.website.url, c.website.title, c.website.description].filter(Boolean).join(' - ') : '';
  const who = profileOf(state)?.label;
  return `Best alternatives and competitors to ${kind} that ${String(c.oneLiner || '(no one-liner)').trim().replace(/\.$/, '').replace(/^\w/, (x) => x.toLowerCase())}${c.icp ? `, for ${c.icp}` : ''}${who ? ` (customers: ${who.toLowerCase()})` : ''}. Which tools do these customers compare and use today (including big players and well-funded startups), with pricing, funding and review counts?${site ? `\nOur website: ${site}` : ''}\n(Late 2026. Our business model: ${c.model === 'b2c' ? 'B2C subscription app' : c.model === 'smb' ? 'B2B SaaS for small businesses' : 'B2B mid-market/enterprise SaaS'}.)`;
}

// ---------------- Signal tiers [design] ----------------
// Size/funding signals set a band for awareness and niche share: a big player (public, acquired, $100M+ raised, 500+
// staff or 50k+ customers) is known by many buyers; a well-funded startup (Series A+, $10M+, 50+ staff, 5k+ customers)
// by some; a small tool by few. The web model's evidence-based estimate is kept when it falls inside the band and
// clamped to it otherwise; with no estimate (player-added) the band default is used. Bands are game assumptions.
export const TIER_BANDS = {
  big_player: { label: 'big player', awareness: [0.25, 0.95], share: [0.02, 0.7], dflt: { awareness: 0.45, marketShare: 0.1 } },
  well_funded: { label: 'well-funded startup', awareness: [0.05, 0.6], share: [0.004, 0.3], dflt: { awareness: 0.15, marketShare: 0.035 } },
  small_tool: { label: 'small tool', awareness: [0, 0.25], share: [0, 0.08], dflt: { awareness: 0.03, marketShare: 0.008 } },
};
export function signalTier(c) {
  const f = c.fundingTotalUSD ?? 0, emp = c.employeesEstimate ?? 0, cust = c.customersEstimate ?? 0;
  if (['public', 'acquired', 'public_incumbent'].includes(c.fundingStage) || c.kind === 'incumbent' || f >= 100e6 || emp >= 500 || cust >= 50000) return 'big_player';
  if (['series_a', 'series_b_plus'].includes(c.fundingStage) || f >= 10e6 || emp >= 50 || cust >= 5000) return 'well_funded';
  return 'small_tool';
}
const MOMENTA = ['rising', 'flat', 'declining'];
const numOrMissing = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
/** Deterministic awareness / share / momentum from the signals (and the web model's estimate, if any). */
export function deriveSignals(c, year = 2026) {
  const tier = signalTier(c);
  const B = TIER_BANDS[tier];
  const a = numOrMissing(c.awareness), m = numOrMissing(c.marketShare);
  const founded = c.founded ?? null;
  const momentum = MOMENTA.includes(c.momentum) ? c.momentum
    : founded && founded >= year - 3 && (tier !== 'small_tool' || ['seed', 'series_a'].includes(c.fundingStage)) ? 'rising'
      : founded && founded < year - 14 && tier !== 'big_player' ? 'declining' : 'flat';
  return {
    tier,
    awareness: +clamp(a ?? B.dflt.awareness, ...B.awareness).toFixed(3),
    marketShare: +clamp(m ?? B.dflt.marketShare, ...B.share).toFixed(4),
    momentum,
    estimate: a == null && m == null ? 'signals' : 'web+signals',
  };
}

// Normalize LLM output: clamp numbers, enforce Σ shares + status quo ≤ 1, dedupe by name.
export function normalizeDiscovery(data) {
  const seen = new Set();
  const list = [];
  for (const c of data.competitors ?? []) {
    const key = String(c.name ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // Web-search output is not schema-validated: give the fields other code calls string/array methods on a safe default.
    list.push({
      ...c,
      name: String(c.name).trim(), url: String(c.url ?? ''), kind: String(c.kind || 'direct'), segment: String(c.segment ?? ''),
      fundingStage: String(c.fundingStage || 'unknown'), pricingText: String(c.pricingText || 'unknown'), positioning: String(c.positioning ?? ''),
      momentum: ['rising', 'flat', 'declining'].includes(c.momentum) ? c.momentum : 'flat', confidence: String(c.confidence || 'low'),
      id: `rc_${hash(key)}`,
      // Numbers too: a string ("29", "$12M") would concatenate in raisedUsd += lastRound or print as NaN.
      priceMonthlyUSD: numOrNull(c.priceMonthlyUSD), fundingTotalUSD: numOrNull(c.fundingTotalUSD), founded: numOrNull(c.founded),
      employeesEstimate: numOrNull(c.employeesEstimate), customersEstimate: numOrNull(c.customersEstimate),
      awareness: c.awareness == null ? null : clamp(Number(c.awareness) || 0, 0, 1),
      marketShare: c.marketShare == null ? null : clamp(Number(c.marketShare) || 0, 0, 1),
      source: 'web',
      strengths: (Array.isArray(c.strengths) ? c.strengths : []).slice(0, 3), weaknesses: (Array.isArray(c.weaknesses) ? c.weaknesses : []).slice(0, 3), sources: (Array.isArray(c.sources) ? c.sources : []).slice(0, 5),
    });
    Object.assign(list.at(-1), deriveSignals(list.at(-1)));
  }
  let sq = clamp(Number(data.statusQuoShare) || 0, 0, 1);
  const total = list.reduce((a, c) => a + c.marketShare, 0) + sq;
  if (total > 1) { const f = 1 / total; for (const c of list) c.marketShare = +(c.marketShare * f).toFixed(4); sq = +(sq * f).toFixed(4); }
  return {
    category: data.category ?? '', marketMaturity: data.marketMaturity ?? 'growing', crowdedness: data.crowdedness ?? 'medium',
    statusQuo: data.statusQuo ?? '', statusQuoShare: sq, reasoning: data.reasoning ?? '', list: list.slice(0, 25),
  };
}

const FUND_MAP = { bootstrapped: 'bootstrapped', seed: 'seed', series_a: 'series_a', series_b_plus: 'series_b_plus', public: 'public_incumbent', acquired: 'series_b_plus', unknown: 'bootstrapped' };

// One engine rival for a real (web-found or player-added) competitor, keeping its simulated history.
function toRival(state, c, old) {
  return {
    id: old?.id ?? c.id, real: true, player: c.source === 'player', realId: c.id, name: c.name, domain: String(c.url ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, ''), url: c.url,
    funding: FUND_MAP[c.fundingStage] ?? 'bootstrapped', raisedUsd: c.fundingTotalUSD ?? 0, priceMonthly: c.priceMonthlyUSD ?? 0,
    freeTier: Boolean(c.freeTier), positioning: c.positioning, strengths: c.strengths, weaknesses: c.weaknesses, founded: c.founded,
    status: old?.status ?? 'active', researched: old?.researched ?? false, mentioned: true, moves: old?.moves ?? [], momentum: 0,
    threat: realThreat(c), addedDay: old?.addedDay ?? state.day,
  };
}
// Mirror real competitors into the engine's rival list so simulated world events can pin to them. Player-added
// competitors and simulated new entrants stay; a web result with the same name as a player-added one is skipped.
function syncRivals(state, list) {
  const W = ensureWorld(state);
  const byName = new Map(W.rivals.map((r) => [r.name.toLowerCase(), r]));
  const mine = new Set(W.custom.map((c) => c.name.toLowerCase()));
  const keep = W.rivals.filter((r) => r.player || (r.newEntrant && !r.real));
  W.rivals = [...list.filter((c) => !mine.has(c.name.toLowerCase())).map((c) => toRival(state, c, byName.get(c.name.toLowerCase()))), ...keep];
}
// Threat 0..1 from real awareness, share, funding and momentum.
export function realThreat(c) {
  const f = c.fundingTotalUSD ?? 0;
  return clamp(0.1 + 0.4 * c.awareness + 1.2 * c.marketShare + (f >= 50e6 ? 0.15 : f >= 10e6 ? 0.1 : f >= 2e6 ? 0.04 : 0) + (c.momentum === 'rising' ? 0.08 : c.momentum === 'declining' ? -0.05 : 0), 0.03, 1);
}

export async function discoverCompetitors(ctx, { reason = 'manual' } = {}) {
  const s = ctx.state;
  const W = ensureWorld(s);
  const h = ideaHash(s);
  const manual = reason === 'manual';
  const res = await ctx.llm.ask({
    task: 'competitor_discovery', model: DISCOVERY_MODEL,
    system: DISCOVERY_SYSTEM,
    prompt: discoveryPrompt(s), schema: DISCOVERY_SCHEMA, temperature: 0.2, maxTokens: 14000, web: true, webResults: 10, webDepth: 'research',
    // Automatic runs reuse a cached result for the same idea (save cache + the server's disk cache); a manual
    // "search again" always goes to the web. The result itself lives in W.competitors, keyed by the idea hash.
    cache: manual ? null : s.cache, diskCache: !manual,
    fallback: () => ({ category: '', marketMaturity: 'growing', crowdedness: 'medium', statusQuo: '', statusQuoShare: 0, reasoning: '', competitors: [] }),
  });
  W.discovery = { pending: false, day: s.day, reason, hash: h };
  const customerType = customerTypeOf(s);
  if (res.mock || !(res.data?.competitors?.length)) {
    const error = res.error ?? (res.mock ? null : 'No competitors found');
    // A failed re-run keeps the last real landscape (marked stale) instead of falling back to fictional rivals.
    if (isReal(s)) { Object.assign(W.competitors, { stale: true, staleError: error, ideaHash: h, customerType }); return W.competitors; }
    W.competitors = { offline: true, mock: true, ideaHash: h, customerType, discoveredDay: s.day, list: [], citations: [], error, reason };
    return W.competitors;
  }
  const n = normalizeDiscovery(res.data);
  W.competitors = { offline: false, mock: false, ideaHash: h, customerType, discoveredDay: s.day, reason, model: res.model, usd: res.usd, cached: Boolean(res.cached), citations: res.citations ?? [], ...n };
  syncRivals(s, n.list);
  W.lastPressure = competitivePressure(s) ?? W.lastPressure; // shown immediately; applied on the next day tick
  if (W.landscape) { W.landscape.category = n.category || W.landscape.category; W.landscape.total = n.list.length; W.landscape.source = 'web'; }
  return W.competitors;
}

// ---------------- Read API for other apps ----------------

export const isReal = (state) => Boolean(state.apps.world?.competitors && !state.apps.world.competitors.offline && state.apps.world.competitors.list?.length);

// Fictional rivals in the same shape (offline). Values are modest: invented rivals are rarely "known".
function fictionalAsCompetitors(state) {
  const W = ensureWorld(state);
  const act = W.rivals.filter((r) => r.status === 'active' && !r.player);
  return act.map((r) => {
    const t = threatOf(r, state.company.model);
    return {
      id: r.id, name: r.name, url: `https://${r.domain}`, description: r.positioning, positioning: r.positioning, segment: '', pricingText: r.priceMonthly ? `$${r.priceMonthly}/mo` : 'unknown',
      priceMonthlyUSD: r.priceMonthly ?? null, freeTier: r.freeTier, fundingStage: r.funding === 'public_incumbent' ? 'public' : r.funding, fundingTotalUSD: r.raisedUsd || null,
      founded: r.founded, employeesEstimate: null, customersEstimate: null, awareness: +(0.03 + 0.25 * t * t).toFixed(3), marketShare: +(0.08 * t / Math.max(1, act.length / 4)).toFixed(3),
      momentum: 'flat', kind: 'direct', strengths: r.strengths, weaknesses: r.weaknesses, sources: [], confidence: 'low', fictional: true, source: 'placeholder',
    };
  });
}

/** Every competitor in the game: web-found (or offline placeholders) plus the player's own additions. */
export function competitorsFor(state, { includeGone = false } = {}) {
  // A real competitor the simulation shut down (competitor_exit) is gone from the game's market too, like a fictional
  // one: prospects stop "using" it, its share stops weighing on pressure, and its customers come looking for you.
  const gone = new Set(includeGone ? [] : (state.apps.world?.rivals ?? []).filter((r) => r.real && r.status === 'shut_down').map((r) => r.realId));
  const base = (isReal(state) ? state.apps.world.competitors.list : fictionalAsCompetitors(state)).filter((c) => !gone.has(c.id));
  const mine = (state.apps.world?.custom ?? []).filter((c) => !gone.has(c.id));
  if (!mine.length) return base;
  const names = new Set(mine.map((c) => c.name.toLowerCase()));
  const list = [...base.filter((c) => !names.has(c.name.toLowerCase())), ...mine];
  // Keep Σ shares + status quo ≤ 1: scale the competitors (not the status quo) when an addition overfills the niche.
  const sq = isReal(state) ? state.apps.world.competitors.statusQuoShare ?? 0 : 0;
  const tot = list.reduce((a, c) => a + (c.marketShare ?? 0), 0);
  if (tot + sq <= 1 || tot <= 0) return list;
  const f = Math.max(0, 1 - sq) / tot;
  return list.map((c) => ({ ...c, marketShare: +((c.marketShare ?? 0) * f).toFixed(4) }));
}
export const playerCompetitors = (state) => state.apps.world?.custom ?? [];
export function marketOverview(state) {
  const C = state.apps.world?.competitors;
  const playerAdded = playerCompetitors(state).length;
  if (isReal(state)) return { real: true, playerAdded, category: C.category, marketMaturity: C.marketMaturity, crowdedness: C.crowdedness, statusQuo: C.statusQuo, statusQuoShare: C.statusQuoShare };
  return { real: false, playerAdded, offline: Boolean(C?.offline), placeholder: true, category: state.apps.world?.landscape?.category ?? '', marketMaturity: 'growing', crowdedness: 'medium', statusQuo: '', statusQuoShare: 0 };
}

// Deterministic PRNG from a string seed (never touches state.seed, so sampling doesn't shift the simulation).
function seeded(str) {
  let x = parseInt(hash(str), 36) | 0;
  return () => { x = (x + 0x6d2b79f5) | 0; let t = Math.imul(x ^ (x >>> 15), x | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const fundingVisibility = (c) => {
  const f = c.fundingTotalUSD ?? 0;
  const stage = c.fundingStage;
  let v = stage === 'public' ? 0.9 : f >= 100e6 ? 0.9 : f >= 30e6 ? 0.75 : f >= 10e6 ? 0.55 : f >= 3e6 ? 0.2 : stage === 'seed' ? 0.03 : stage === 'series_a' ? 0.4 : stage === 'series_b_plus' ? 0.65 : 0.03;
  if (c.momentum === 'rising') v += 0.08;
  return clamp(v, 0, 0.95);
};

/**
 * Which competitors a given person knows.
 * audience: 'prospect' | 'customer' | 'consumer' | 'investor'; seed: a stable id (persona, contact, investor).
 * → [{ competitor, relation: 'uses' | 'evaluated' | 'heard_of' }], strongest relation first, at most `max`.
 * The status quo appears as { competitor: { name, statusQuo: true }, relation: 'uses' }.
 */
export function knownCompetitors(state, { audience = 'prospect', seed = 'x', max = 4 } = {}) {
  const list = competitorsFor(state);
  const ov = marketOverview(state);
  const r = seeded(`${seed}|${audience}|${ideaHash(state)}`);
  const out = [];
  if (audience === 'investor') {
    for (const c of list) {
      const p = Math.max(c.awareness, fundingVisibility(c));
      if (r() < p) out.push({ competitor: c, relation: 'heard_of', p });
    }
    return out.sort((a, b) => b.p - a.p).slice(0, max).map(({ competitor, relation }) => ({ competitor, relation }));
  }
  // What do they use today? Draw once over market shares (+ status quo; the rest uses nothing / something else).
  let u = r();
  let usesId = null;
  for (const c of list) { if (u < c.marketShare) { usesId = c.id; break; } u -= c.marketShare; }
  if (!usesId && ov.statusQuo && u < ov.statusQuoShare) out.push({ competitor: { name: ov.statusQuo, statusQuo: true }, relation: 'uses' });
  const awareMult = audience === 'customer' ? 0.9 : 1; // your customers know the alternatives a bit less often (they chose you)
  for (const c of list) {
    if (c.id === usesId) { out.push({ competitor: c, relation: audience === 'customer' ? 'evaluated' : 'uses' }); continue; }
    const v = r();
    if (v < c.awareness * awareMult) out.push({ competitor: c, relation: v < c.awareness * 0.25 && audience !== 'consumer' ? 'evaluated' : 'heard_of' });
  }
  const rank = { uses: 0, evaluated: 1, heard_of: 2 };
  return out.sort((a, b) => rank[a.relation] - rank[b.relation] || (b.competitor.awareness ?? 0) - (a.competitor.awareness ?? 0)).slice(0, max);
}

// Short text for persona prompts. Empty string when they know nobody (realistic for obscure markets).
export function competitionBrief(state, known) {
  if (!known?.length) return '';
  const fmt = (c) => {
    if (c.statusQuo) return c.name;
    const bits = [c.pricingText && c.pricingText !== 'unknown' ? c.pricingText : null, c.strengths?.length ? `strengths: ${c.strengths.slice(0, 2).join(', ')}` : null, c.weaknesses?.length ? `weaknesses: ${c.weaknesses.slice(0, 2).join(', ')}` : null].filter(Boolean);
    return `${c.name}${bits.length ? ` (${bits.join('; ')})` : ''}`;
  };
  const uses = known.filter((k) => k.relation === 'uses').map((k) => fmt(k.competitor));
  const ev = known.filter((k) => k.relation === 'evaluated').map((k) => fmt(k.competitor));
  const heard = known.filter((k) => k.relation === 'heard_of').map((k) => k.competitor.name);
  return [uses.length && `Currently uses ${uses.join(' and ')}.`, ev.length && `Has evaluated ${ev.join('; ')}.`, heard.length && `Has heard of ${heard.join(', ')}.`].filter(Boolean).join(' ');
}

// Visitor→signup multiplier from the competitive set relative to a typical niche [design].
export function competitivePressure(state) {
  if (!isReal(state)) return null;
  const C = state.apps.world.competitors;
  let m = { low: 1.04, medium: 1, high: 0.96, very_high: 0.93 }[C.crowdedness] ?? 1;
  const all = competitorsFor(state);
  const strong = all.filter((c) => (c.fundingTotalUSD ?? 0) >= 10e6 && c.awareness >= 0.3).length;
  m -= Math.min(0.06, 0.015 * strong);
  const top = Math.max(0, ...all.map((c) => c.marketShare));
  if (top > 0.4) m -= 0.03; // a dominant default makes switching harder
  if (C.marketMaturity === 'emerging') m += 0.02;
  return clamp(m, 0.85, 1.08);
}

// ---------------- Player-added competitors ----------------

export const FUNDING_STAGES = ['unknown', 'bootstrapped', 'seed', 'series_a', 'series_b_plus', 'public', 'acquired'];
export const ADD_HOURS = { base: 0.25, withSite: 0.5 }; // writing it down vs also reading their site and pricing page
const KINDS = ['direct', 'adjacent', 'incumbent', 'substitute', 'ai_native'];

/** "$49/mo", "49", "29 per user per month" → 49; yearly prices → monthly. null when there is no number. */
export function parsePriceMonthly(text) {
  const t = String(text ?? '').replace(/,/g, '');
  const m = t.match(/(\d+(?:\.\d+)?)\s*(k)?/i);
  if (!m) return null;
  let v = Number(m[1]) * (m[2] ? 1000 : 1);
  if (/\/\s*(yr|year)|per\s+year|annual|yearly|\/y\b/i.test(t)) v /= 12;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}
/** "$12M", "12000000", "1.5b" → USD. null when not given (never guessed). */
export function parseUsd(text) {
  const t = String(text ?? '').replace(/[, $]/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)([kmb])?/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[String(m[2] ?? '').toLowerCase()] ?? 1;
  const v = Number(m[1]) * mult;
  return v > 0 ? v : null;
}
const cleanUrl = (u) => { const x = String(u ?? '').trim(); return !x ? '' : /^https?:\/\//i.test(x) ? x : `https://${x.replace(/^[a-z]+:\/*/i, '')}`; };
const list3 = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 3);

/** Build a player competitor in the same shape as a web-found one. `site` = what /api/site returned (optional). */
export function makePlayerCompetitor(state, input = {}, site = null) {
  const name = String(input.name ?? '').trim().slice(0, 80);
  if (!name) throw new Error('Give the competitor a name.');
  const url = cleanUrl(input.url || site?.url);
  const typed = String(input.price ?? '').trim();
  const priceText = typed || site?.pricingText || '';
  const price = typed ? parsePriceMonthly(typed) : site?.priceMonthlyUSD ?? null;
  const fundingStage = FUNDING_STAGES.includes(input.fundingStage) ? input.fundingStage : 'unknown';
  const c = {
    id: `pc_${hash(name.toLowerCase())}`, source: 'player', name, url,
    description: String(input.description ?? '').trim().slice(0, 240) || site?.description || '',
    positioning: '', segment: String(input.segment ?? '').trim().slice(0, 120),
    pricingText: !priceText ? 'unknown' : /^\$?\d+(\.\d+)?$/.test(priceText.replace(/\s/g, '')) ? `$${price}/mo` : priceText.slice(0, 80),
    priceMonthlyUSD: price, freeTier: /free/i.test(priceText) || Boolean(input.freeTier) || null,
    fundingStage, fundingTotalUSD: parseUsd(input.raised), founded: numOrNull(input.founded),
    employeesEstimate: numOrNull(input.employees), customersEstimate: numOrNull(input.customers),
    awareness: null, marketShare: null, momentum: null,
    kind: KINDS.includes(input.kind) ? input.kind : 'direct',
    strengths: list3(input.strengths), weaknesses: list3(input.weaknesses),
    sources: url ? [url] : [], confidence: site ? 'medium' : 'low', addedDay: state.day, siteFetched: Boolean(site),
  };
  c.positioning = String(input.positioning ?? '').trim() || [c.description, c.segment && `for ${c.segment}`].filter(Boolean).join(' ').slice(0, 160);
  return Object.assign(c, deriveSignals(c));
}

/** Add (or replace, by name) a player competitor; it becomes an engine rival right away. */
export function addPlayerCompetitor(state, input, site = null) {
  const W = ensureWorld(state);
  const c = makePlayerCompetitor(state, input, site);
  W.custom = W.custom.filter((x) => x.id !== c.id);
  W.custom.push(c);
  // Same name as an existing rival (a web-found one or a placeholder): the player's entry takes over its history.
  const old = W.rivals.find((r) => r.name.toLowerCase() === c.name.toLowerCase());
  W.rivals = W.rivals.filter((r) => r !== old);
  W.rivals.push(toRival(state, c, old)); // keeps its id so open events and pages still point at it
  W.lastPressure = competitivePressure(state) ?? W.lastPressure;
  return c;
}

/** Remove a player-added competitor (web-found ones can't be deleted: the market doesn't shrink because you look away). */
export function removePlayerCompetitor(state, id) {
  const W = ensureWorld(state);
  const c = W.custom.find((x) => x.id === id);
  if (!c) return false;
  W.custom = W.custom.filter((x) => x.id !== id);
  W.rivals = W.rivals.filter((r) => !(r.player && r.realId === id));
  W.lastPressure = competitivePressure(state) ?? W.lastPressure;
  return true;
}

// Pricing from page text: "$29/mo", "$290 per year", "Free plan".
export function priceFromText(text) {
  const t = String(text ?? '');
  const m = t.match(/\$\s?(\d{1,5}(?:\.\d{1,2})?)\s*(?:\/|per\s+)\s*(?:user\s*\/?\s*)?(mo(?:nth)?|yr|year|seat|user)/i);
  const free = /\bfree (plan|tier|forever)\b/i.test(t);
  if (!m) return { pricingText: free ? 'free plan; paid pricing not on page' : '', priceMonthlyUSD: null, freeTier: free || null };
  const yearly = /yr|year/i.test(m[2]);
  const v = Number(m[1]) / (yearly ? 12 : 1);
  return { pricingText: `$${m[1]}/${yearly ? 'yr' : m[2].toLowerCase().startsWith('mo') ? 'mo' : m[2]}${free ? ', free plan' : ''}`, priceMonthlyUSD: Math.round(v * 100) / 100, freeTier: free || null };
}

/** Fetch a competitor page via core/site.js (server /api/site, or the static-mode reader; offline: null).
 * fetchImpl (tests) stubs the /api/site call. → { url, title, description, pricingText, priceMonthlyUSD, freeTier } */
export async function fetchCompetitorSite(url, { fetchImpl = null, cache = null } = {}) {
  if (!url) return null;
  try {
    const r = fetchImpl
      ? await fetchImpl(apiUrl('api/site'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: cleanUrl(url) }) })
      : await fetchSite(cleanUrl(url), { cache });
    if (!r?.ok) return null;
    const p = await r.json();
    const pr = priceFromText(`${p.description ?? ''}\n${(p.headings ?? []).join('\n')}\n${p.text ?? ''}`);
    return { url: p.url ?? cleanUrl(url), title: p.title ?? '', description: String(p.description || p.title || '').slice(0, 240), ...pr };
  } catch { return null; }
}
