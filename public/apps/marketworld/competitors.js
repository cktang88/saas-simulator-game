// REAL competitors: whenever the business idea (one-liner / ICP / website) changes, Claude Haiku 5.5 with web search
// finds the actual competitive set (direct rivals, adjacent tools, incumbents, status-quo substitutes, AI-native
// newcomers) with evidence-based awareness and market-share estimates. Those competitors then shape what
// prospects, customers, consumers and investors mention (knownCompetitors) and the competitive pressure on
// conversion. Offline (no key) we never invent real-sounding companies: the fictional template landscape stays,
// flagged offline.

import { hash } from '../../core/util.js';
import { ensureWorld } from './engine.js';
import { threatOf } from './model.js';

export const DISCOVERY_MODEL = 'anthropic/claude-haiku-5.5';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------- Idea hash & trigger ----------------

export function ideaText(state) {
  const c = state.company;
  const w = c.website;
  return [c.oneLiner, c.icp, w?.url, w?.title, w?.description].map((x) => String(x ?? '').trim()).join(' | ');
}
export const ideaHash = (state) => hash(ideaText(state).toLowerCase().replace(/\s+/g, ' '));
const hasIdea = (state) => Boolean(String(state.company.oneLiner ?? '').trim() || String(state.company.icp ?? '').trim());

// Called from onDay: enqueue a discovery when the idea text changed (debounced to once per in-game day).
export function shouldDiscover(state) {
  const W = ensureWorld(state);
  if (!hasIdea(state)) return false;
  const C = W.competitors;
  if (C?.ideaHash === ideaHash(state)) return false;
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

List the REAL competitive set the founder faces: direct competitors (tools built for this exact job and customer), adjacent tools customers use for the same job, incumbents/suites, status-quo substitutes (spreadsheets, agencies, bookkeepers, freelancers, manual work) and AI-native newcomers. Put the direct competitors a buyer would compare first. Return 8 to 15 real companies or products, most relevant first. Use null when a number is not in a source.

Estimate for each, conservatively and from evidence (G2/Capterra/App Store review counts, web traffic, funding, press, years in market):
- awareness: share of THIS founder's ICP who have heard of it (most niche tools are 0.01-0.15; only category leaders exceed 0.5).
- marketShare: share of buyers of this exact job-to-be-done who use it. The sum over all listed plus statusQuoShare must be <= 1 (the rest is "other / nothing").
Also give the status quo, crowdedness, market maturity, and a short reasoning. Cite source URLs per company.`;

function discoveryPrompt(state) {
  const c = state.company;
  const kind = c.model === 'b2c' ? 'consumer app' : c.model === 'smb' ? 'small-business software' : 'B2B software';
  const site = c.website ? [c.website.url, c.website.title, c.website.description].filter(Boolean).join(' - ') : '';
  return `Best alternatives and competitors to ${kind} that ${String(c.oneLiner || '(no one-liner)').trim().replace(/\.$/, '').replace(/^\w/, (x) => x.toLowerCase())}${c.icp ? `, for ${c.icp}` : ''}. Which tools do these customers compare and use today, with pricing and review counts?${site ? `\nOur website: ${site}` : ''}\n(Late 2026. Our business model: ${c.model === 'b2c' ? 'B2C subscription app' : c.model === 'smb' ? 'B2B SaaS for small businesses' : 'B2B mid-market/enterprise SaaS'}.)`;
}

// Normalize LLM output: clamp numbers, enforce Σ shares + status quo ≤ 1, dedupe by name.
export function normalizeDiscovery(data) {
  const seen = new Set();
  const list = [];
  for (const c of data.competitors ?? []) {
    const key = String(c.name ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push({
      ...c,
      id: `rc_${hash(key)}`,
      awareness: clamp(Number(c.awareness) || 0, 0, 1),
      marketShare: clamp(Number(c.marketShare) || 0, 0, 1),
      strengths: (c.strengths ?? []).slice(0, 3), weaknesses: (c.weaknesses ?? []).slice(0, 3), sources: (c.sources ?? []).slice(0, 5),
    });
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

// Mirror real competitors into the engine's rival list so simulated world events can pin to them.
function syncRivals(state, list) {
  const W = ensureWorld(state);
  const byName = new Map(W.rivals.map((r) => [r.name.toLowerCase(), r]));
  const keepFictional = W.rivals.filter((r) => r.newEntrant && !r.real); // simulated new entrants stay
  W.rivals = [...list.map((c) => {
    const old = byName.get(c.name.toLowerCase());
    return {
      id: old?.id ?? c.id, real: true, realId: c.id, name: c.name, domain: c.url.replace(/^https?:\/\//, '').replace(/\/.*$/, ''), url: c.url,
      funding: FUND_MAP[c.fundingStage] ?? 'bootstrapped', raisedUsd: c.fundingTotalUSD ?? 0, priceMonthly: c.priceMonthlyUSD ?? 0,
      freeTier: Boolean(c.freeTier), positioning: c.positioning, strengths: c.strengths, weaknesses: c.weaknesses, founded: c.founded,
      status: old?.status ?? 'active', researched: old?.researched ?? false, mentioned: true, moves: old?.moves ?? [], momentum: 0,
      threat: realThreat(c), addedDay: old?.addedDay ?? state.day,
    };
  }), ...keepFictional];
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
  const res = await ctx.llm.ask({
    task: 'competitor_discovery', model: DISCOVERY_MODEL,
    system: DISCOVERY_SYSTEM,
    prompt: discoveryPrompt(s), schema: DISCOVERY_SCHEMA, temperature: 0.2, maxTokens: 14000, web: true, webResults: 10,
    fallback: () => ({ category: '', marketMaturity: 'growing', crowdedness: 'medium', statusQuo: '', statusQuoShare: 0, reasoning: '', competitors: [] }),
  });
  W.discovery = { pending: false, day: s.day, reason, hash: h };
  if (res.mock || !(res.data?.competitors?.length)) {
    W.competitors = { offline: true, mock: true, ideaHash: h, discoveredDay: s.day, list: [], citations: [], error: res.error ?? (res.mock ? null : 'No competitors found'), reason };
    return W.competitors;
  }
  const n = normalizeDiscovery(res.data);
  W.competitors = { offline: false, mock: false, ideaHash: h, discoveredDay: s.day, reason, model: res.model, usd: res.usd, citations: res.citations ?? [], ...n };
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
  const act = W.rivals.filter((r) => r.status === 'active');
  return act.map((r) => {
    const t = threatOf(r, state.company.model);
    return {
      id: r.id, name: r.name, url: `https://${r.domain}`, description: r.positioning, positioning: r.positioning, segment: '', pricingText: r.priceMonthly ? `$${r.priceMonthly}/mo` : 'unknown',
      priceMonthlyUSD: r.priceMonthly ?? null, freeTier: r.freeTier, fundingStage: r.funding === 'public_incumbent' ? 'public' : r.funding, fundingTotalUSD: r.raisedUsd || null,
      founded: r.founded, employeesEstimate: null, customersEstimate: null, awareness: +(0.03 + 0.25 * t * t).toFixed(3), marketShare: +(0.08 * t / Math.max(1, act.length / 4)).toFixed(3),
      momentum: 'flat', kind: 'direct', strengths: r.strengths, weaknesses: r.weaknesses, sources: [], confidence: 'low', fictional: true,
    };
  });
}

export function competitorsFor(state) {
  return isReal(state) ? state.apps.world.competitors.list : fictionalAsCompetitors(state);
}
export function marketOverview(state) {
  const C = state.apps.world?.competitors;
  if (isReal(state)) return { real: true, category: C.category, marketMaturity: C.marketMaturity, crowdedness: C.crowdedness, statusQuo: C.statusQuo, statusQuoShare: C.statusQuoShare };
  return { real: false, offline: Boolean(C?.offline), category: state.apps.world?.landscape?.category ?? '', marketMaturity: 'growing', crowdedness: 'medium', statusQuo: '', statusQuoShare: 0 };
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
  const strong = C.list.filter((c) => (c.fundingTotalUSD ?? 0) >= 10e6 && c.awareness >= 0.3).length;
  m -= Math.min(0.06, 0.015 * strong);
  const top = Math.max(0, ...C.list.map((c) => c.marketShare));
  if (top > 0.4) m -= 0.03; // a dominant default makes switching harder
  if (C.marketMaturity === 'emerging') m += 0.02;
  return clamp(m, 0.85, 1.08);
}
