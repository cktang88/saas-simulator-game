// How a specific investor sees this company: fund-returner math, minimum ownership, venture scale (the idea's
// ceiling), founder pedigree, thesis fit and herding. Pure: no state, no randomness. Constants come from
// public/data/vc-universe.js (docs/research/vc-decisions-2026.md); every field has a local fallback so a missing
// field degrades to a sensible default instead of throwing. Numbers here are [design] unless a URL is cited.
//
// Operator tiers (ARCHITECTURE.md principle 7) show up as WHO the founder pitches:
//   stellar  pitches the investors whose math works for their ceiling (angels/indie/nano for a micro-SaaS,
//            top-tier only with a moonshot story or pedigree), so meetings come ~3-6x more often per pitch;
//   good     mostly right list, a few fund-size mismatches that burn weeks;
//   average  stage-matched but size-blind list: partner-stage "can't return the fund" passes after 4-8 weeks;
//   mediocre sprays top/established funds with a capped idea: near-zero meetings, burned list, months lost.

import * as U from '../../data/vc-universe.js';
import { clamp } from '../../core/util.js';

// ---- constants (vc-universe.js, with local fallbacks) ----
const STAGES = ['pre-seed', 'seed', 'series-a'];
const CLASSES = ['micro', 'lifestyle', 'mid', 'venture', 'moonshot'];
const SCALE_CLASSES = U.SCALE_CLASSES ?? {
  micro: { label: 'micro-SaaS / niche tool', ceilingArr: [0.3e6, 3e6] },
  lifestyle: { label: 'small vertical / SMB niche', ceilingArr: [3e6, 15e6] },
  mid: { label: 'mid-market category', ceilingArr: [15e6, 80e6] },
  venture: { label: 'venture-scale category', ceilingArr: [80e6, 400e6] },
  moonshot: { label: 'platform / moonshot', ceilingArr: [400e6, 3e9] },
};
// Exit EV / ARR at exit; small capped businesses sell at 3-6x (docs/research/fundraising.md exit section).
const EXIT_MULTIPLE_ARR = U.EXIT_MULTIPLE_ARR ?? { capped: [3, 6], mid: [5, 10], venture: [8, 15], ai: [10, 25] };
// Share of entry ownership lost by exit: ~15-20% per later round + pool refreshes (r1 §2: 0.82^4 ≈ 0.45 retained).
const DILUTION_TO_EXIT = U.DILUTION_TO_EXIT ?? { 'pre-seed': 0.6, seed: 0.5, 'series-a': 0.4 };
const SCALE_SIGNALS = Array.isArray(U.SCALE_SIGNALS) ? U.SCALE_SIGNALS : [
  { re: /chrome extension|browser extension|shopify app|wordpress plugin|notion template|figma plugin|slack bot|airtable/i, cap: 'micro', why: 'a plugin on someone else\'s platform tops out as a micro-SaaS' },
  { re: /\b(hobby|hobbyist|knitting|crochet|fishing|aquarium|board ?games?|scrapbook|genealogy|bird ?watch)/i, cap: 'micro', why: 'a hobby niche has a small paying audience' },
  { re: /\bfor (dentists|plumbers|salons|barbers|florists|churches|gyms|yoga studios|tattoo|landscapers|hvac|roofers|daycares|food trucks|wedding)/i, cap: 'lifestyle', why: 'a single small vertical caps the market' },
];
const FUND_TIERS = U.FUND_TIERS ?? {};
const ANGEL_TIERS = U.ANGEL_TIERS ?? {};
const SECTORS = Array.isArray(U.SECTORS) ? U.SECTORS : [];
const PEDIGREE = U.PEDIGREE ?? {};
const PED_SIGNALS = Array.isArray(PEDIGREE.signals) ? PEDIGREE.signals : [
  { id: 'exit', re: /(acquired by|sold (my|our|the) (company|startup)|\bexit(ed)?\b|\bipo\b)/i, points: 2, label: 'Prior exit' },
  { id: 'repeat', re: /\b(co-?founded|founded|second-time founder|serial (entrepreneur|founder)|repeat founder)\b/i, points: 1, label: 'Repeat founder' },
  { id: 'elite_school', re: /\b(stanford|harvard|mit|berkeley|carnegie mellon|cmu|princeton|caltech|oxford|cambridge|wharton|iit)\b/i, points: 1, label: 'Top school' },
  { id: 'ai_lab', re: /\b(openai|anthropic|deepmind|google brain|meta ai|fair)\b/i, points: 1.5, label: 'Ex-frontier AI lab' },
  { id: 'bigtech', re: /\b(google|meta|facebook|apple|amazon|microsoft|netflix|stripe|nvidia)\b/i, points: 0.5, label: 'Big-tech engineer/operator' },
  { id: 'yc', re: /\b(y ?combinator|yc [swfx]\d\d)\b/i, points: 1, label: 'YC alum' },
  { id: 'unicorn_early', re: /\b(early (employee|engineer)|employee #?\d{1,2}\b|first \d{1,2} (employees|engineers))/i, points: 1, label: 'Early at a breakout company' },
  { id: 'phd', re: /\bph\.? ?d\b/i, points: 0.5, label: 'PhD' },
  { id: 'domain', re: /\b(\d{1,2})\+? years\b/i, points: 0.5, minYears: 8, label: 'Deep domain experience' },
];
const PED_TIERS = Array.isArray(PEDIGREE.tiers) ? PEDIGREE.tiers : [{ min: 0, id: 'none' }, { min: 1, id: 'some' }, { min: 2.5, id: 'strong' }, { min: 4, id: 'elite' }];
// Repeat founders get >50% of seed+A dollars in ~40% of rounds; top-3 schools ~25% of seed $ (Carta 2025,
// Crunchbase 2023: research r3 §2). Multipliers are [design] effect sizes on top of base rates.
const PED_MEET = PEDIGREE.meetingMult ?? { none: 1, some: 1.2, strong: 1.8, elite: 3 };
const PED_ROUND = PEDIGREE.roundMult ?? { none: 1, some: 1.1, strong: 1.4, elite: 2 };
const PED_VAL = PEDIGREE.valuationMult ?? { none: 1, some: 1.1, strong: 1.3, elite: 1.8 };
const AI_ERA = U.AI_ERA ?? {};
const HARD_RATIO = U.DECISION_RULES?.returnerRatioHard ?? 0.3; // below this a TAM-driven partnership won't approve
const MEGA = { minPedigree: 'elite', minScale: 'moonshot', round: [8e6, 30e6], post: [40e6, 150e6], ...(AI_ERA.megaSeed ?? {}) };
const AI_VAL_PREMIUM = AI_ERA.aiValuationPremium ?? 1.4; // AI vs non-AI seed pre ~+40% (Carta 2025 via r2 §2)
// Median round/post the multipliers are relative to (outcomes.js STAGE_MEDIAN_ROUND / MEDIAN_POST / SAFE table).
const MEDIAN_ROUND = { 'pre-seed': 750e3, seed: 3e6, 'series-a': 14.4e6 };
const MEDIAN_POST = { 'pre-seed': 10e6, seed: 21e6, 'series-a': 78e6 };

// Tier defaults when vc-universe.js lacks a tier/field [design, r1 §1 and r2 §3-4].
const TIER_DEFAULTS = {
  top: { label: 'Top-tier firm', fundSize: [800e6, 3e9], firstCheck: { seed: [2e6, 12e6], 'series-a': [10e6, 30e6] }, ownership: { seed: [0.1, 0.15], 'series-a': [0.15, 0.2] }, pedigreeWeight: 0.9, tamWeight: 0.95, tractionWeight: 0.5, priceSensitivity: 0.2, valuationPremium: 1.25, signal: 2 },
  established: { label: 'Established fund', fundSize: [150e6, 800e6], firstCheck: { seed: [1e6, 4e6], 'series-a': [5e6, 15e6] }, ownership: { seed: [0.1, 0.15], 'series-a': [0.15, 0.2] }, pedigreeWeight: 0.5, tamWeight: 0.75, tractionWeight: 0.8, priceSensitivity: 0.5, valuationPremium: 1.05, signal: 1.3 },
  emerging: { label: 'Emerging manager', fundSize: [50e6, 150e6], firstCheck: { 'pre-seed': [250e3, 1e6], seed: [500e3, 2e6] }, ownership: { 'pre-seed': [0.05, 0.1], seed: [0.07, 0.12] }, pedigreeWeight: 0.5, tamWeight: 0.6, tractionWeight: 0.6, priceSensitivity: 0.7, valuationPremium: 1, signal: 1.1 },
  micro: { label: 'Micro VC', fundSize: [15e6, 60e6], firstCheck: { 'pre-seed': [150e3, 750e3], seed: [250e3, 1e6] }, ownership: { 'pre-seed': [0.04, 0.08], seed: [0.05, 0.1] }, pedigreeWeight: 0.4, tamWeight: 0.5, tractionWeight: 0.5, priceSensitivity: 0.8, valuationPremium: 1, signal: 1.05 },
  nano: { label: 'Nano fund / solo GP', fundSize: [2e6, 15e6], firstCheck: { 'pre-seed': [25e3, 250e3], seed: [50e3, 300e3] }, ownership: { 'pre-seed': [0.005, 0.03], seed: [0.005, 0.03] }, pedigreeWeight: 0.4, tamWeight: 0.3, tractionWeight: 0.4, priceSensitivity: 0.6, valuationPremium: 1, signal: 1 },
  cvc: { label: 'Corporate VC', fundSize: [100e6, 1e9], firstCheck: { seed: [500e3, 3e6], 'series-a': [2e6, 10e6] }, ownership: { seed: [0.02, 0.05], 'series-a': [0.03, 0.08] }, pedigreeWeight: 0.3, tamWeight: 0.4, tractionWeight: 0.7, priceSensitivity: 0.2, valuationPremium: 1.1, signal: 1 },
  family_office: { label: 'Family office', fundSize: [50e6, 1e9], firstCheck: { 'pre-seed': [100e3, 500e3], seed: [100e3, 1e6], 'series-a': [500e3, 3e6] }, ownership: { 'pre-seed': [0, 0.03], seed: [0, 0.03], 'series-a': [0, 0.03] }, pedigreeWeight: 0.3, tamWeight: 0.2, tractionWeight: 0.7, priceSensitivity: 0.6, valuationPremium: 1, signal: 1 },
  crossover: { label: 'Crossover / growth fund', fundSize: [1e9, 10e9], firstCheck: { seed: [3e6, 20e6], 'series-a': [15e6, 60e6] }, ownership: { seed: [0.05, 0.1], 'series-a': [0.08, 0.15] }, pedigreeWeight: 0.7, tamWeight: 0.9, tractionWeight: 0.6, priceSensitivity: 0.1, valuationPremium: 1.3, signal: 1.3 },
  indie: { label: 'Indie / bootstrapper fund', fundSize: [5e6, 50e6], firstCheck: { 'pre-seed': [100e3, 250e3], seed: [100e3, 500e3] }, ownership: { 'pre-seed': [0.05, 0.1], seed: [0.05, 0.1] }, pedigreeWeight: 0.1, tamWeight: 0, tractionWeight: 0.9, priceSensitivity: 0.9, valuationPremium: 0.8, signal: 1 },
};
const ANGEL_DEFAULTS = { pedigreeWeight: 0.6, fomoWeight: 0.6, tamWeight: 0.15, check: [10e3, 100e3] };
const KIND_TIER = { multistage: 'established', seed_fund: 'established', micro_vc: 'micro', cvc: 'cvc', family_office: 'family_office' };
const ANGEL_KINDS = new Set(['angel', 'syndicate', 'angel_group', 'scout']);

const tierId = (inv) => inv?.fund?.tier ?? inv?.tier ?? (ANGEL_KINDS.has(inv?.kind) ? null : KIND_TIER[inv?.kind] ?? null);
const isAngel = (inv) => !inv?.fund && (ANGEL_KINDS.has(inv?.kind) || !tierId(inv)) || Boolean(ANGEL_TIERS[inv?.fund?.tier] || ANGEL_TIERS[inv?.tier]);
const isIndie = (inv) => tierId(inv) === 'indie';
function tierOf(inv) {
  const id = tierId(inv);
  if (isAngel(inv)) return { ...ANGEL_DEFAULTS, ...(ANGEL_TIERS[inv?.fund?.tier ?? inv?.tier ?? inv?.angelTier] ?? {}) };
  return { ...(TIER_DEFAULTS[id] ?? TIER_DEFAULTS.micro), ...(FUND_TIERS[id] ?? {}) };
}
const mid = (r) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : r);
const fundSize = (inv) => inv?.fund?.size ?? mid(tierOf(inv).fundSize) ?? 50e6;
const ownershipBand = (inv, stage) => inv?.fund?.ownership?.[stage] ?? tierOf(inv).ownership?.[stage] ?? null;
const money = (n) => (n >= 1e9 ? `$${+(n / 1e9).toFixed(n >= 10e9 ? 0 : 1)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(n >= 10e6 ? 0 : 1)}M` : `$${Math.round(n / 1e3)}K`);
const pct = (x) => `${+(x * 100).toFixed(1)}%`;
const clsIdx = (c) => Math.max(0, CLASSES.indexOf(c));

// ---- venture scale: the idea's ceiling ----
// Structure (platform plugins, hobby niches, single small verticals, ACV) sets the MAX class. The deck's market
// score moves the class ±1 inside that cap; real traction at scale can lift one class above it.
export function ventureScale({ oneLiner = '', icp = '', model = 'smb', price = null, isAI = false, marketScore = 3, arr = 0, yoyGrowth = 0 } = {}) {
  const text = `${oneLiner} ${icp}`;
  const reasons = [];
  let cap = CLASSES.length - 1;
  for (const s of SCALE_SIGNALS) {
    const re = s.re instanceof RegExp ? s.re : new RegExp(s.re, 'i');
    if (s.cap && re.test(text) && clsIdx(s.cap) < cap) { cap = clsIdx(s.cap); reasons.push(`Capped at ${SCALE_CLASSES[s.cap]?.label ?? s.cap}: ${s.why ?? 'structural signal'}.`); }
  }
  const acv = (price ?? { b2c: 8, smb: 49, mid: 400, 'mid-market': 400, enterprise: 5000 }[model] ?? 49) * 12;
  // Base class from buyer and ACV: $5/mo consumer niche ≈ micro; $29/mo SMB ≈ mid; $50k+ ACV enterprise ≈ venture.
  let base;
  if (model === 'b2c') base = acv < 60 ? 'lifestyle' : 'mid';
  else if (acv >= 50e3) base = 'venture';
  else if (acv >= 1200) base = 'venture';
  else base = 'mid';
  if (model === 'b2c' && acv < 120 && /\b(niche|hobby|hobbyist|enthusiast)/i.test(text)) { cap = Math.min(cap, clsIdx('micro')); reasons.push('Capped at micro: a low-priced consumer app for a niche hobby has a small paying audience.'); }
  if (acv >= 50e3 && !/\bfor\b/i.test(oneLiner)) reasons.push(`Enterprise ACV ~${money(acv)} with a horizontal buyer: venture-scale structure.`);
  let i = clsIdx(base);
  // Floor signals (infrastructure, systems of record, labor-replacing agents...) raise the base, still under the cap.
  for (const s of SCALE_SIGNALS) {
    if (!s.floor || clsIdx(s.floor) <= i) continue;
    const re = s.re instanceof RegExp ? s.re : new RegExp(s.re, 'i');
    if (re.test(text)) { i = clsIdx(s.floor); reasons.push(`${SCALE_CLASSES[s.floor]?.label ?? s.floor} or bigger: ${s.why ?? 'structural signal'}.`); }
  }
  if (isAI && model !== 'b2c' && acv >= 50e3) { i += 1; reasons.push('AI-native with an enterprise buyer: the category can reach platform scale if it wins.'); }
  const ms = Number.isFinite(marketScore) ? marketScore : 3;
  if (ms >= 4.3) { i += 1; reasons.push(`Deck makes a strong market case (${ms.toFixed(1)}/5): one class up.`); }
  else if (ms <= 2.2) { i -= 1; reasons.push(`Deck's market case is weak (${ms.toFixed(1)}/5): one class down.`); }
  i = clamp(i, 0, cap);
  if (i === cap && cap < clsIdx(base) + (ms >= 4.3 ? 1 : 0)) reasons.push('The deck can\'t argue past the structural cap.');
  // Data beats slides: $2M+ ARR growing 2x+ YoY lifts one class above the structural cap; ARR already above a
  // class's ceiling proves the ceiling is higher.
  if ((arr ?? 0) >= 2e6 && (yoyGrowth ?? 0) >= 1) { const j = Math.min(i + 1, cap + 1, CLASSES.length - 1); if (j > i) { i = j; reasons.push(`Real traction (${money(arr)} ARR, ${(1 + yoyGrowth).toFixed(1)}x YoY) lifts the ceiling one class.`); } }
  while (i < CLASSES.length - 1 && (arr ?? 0) > SCALE_CLASSES[CLASSES[i]].ceilingArr[1]) i += 1;
  const cls = CLASSES[i];
  const ceilingArr = mid(SCALE_CLASSES[cls].ceilingArr);
  const multKey = cls === 'micro' || cls === 'lifestyle' ? 'capped' : isAI ? 'ai' : cls === 'mid' ? 'mid' : 'venture';
  const exitMultiple = mid(EXIT_MULTIPLE_ARR[multKey] ?? EXIT_MULTIPLE_ARR.mid);
  if (!reasons.length) reasons.push(`${SCALE_CLASSES[cls].label}: no structural cap, market case is middling.`);
  return { cls, label: SCALE_CLASSES[cls].label, ceilingArr, exitMultiple, exitValue: ceilingArr * exitMultiple, reasons };
}

// ---- founder pedigree from LinkedIn/bio text ----
// Signals in negated or aspirational phrasing ("want to go to Stanford", "never worked at Google") don't count.
const NOT_REAL = /\b(want(ed|s)? to|hope|hoping|plan(ning|s)? to|would (love|like) to|dream(ing|s)? (of|to)|aspir\w*|aim(ing)? to|someday|one day|applying|applied to|apply to|will apply|rejected|not|never|didn'?t|did not|wasn'?t|haven'?t|no)\b/i;
export function pedigree(text = '') {
  const t = String(text ?? '');
  const clauses = t.split(/[.;!?\n]+|,\s*(?:but|though)\b/);
  const found = [];
  let points = 0;
  for (const s of PED_SIGNALS) {
    const re = s.re instanceof RegExp ? new RegExp(s.re.source, s.re.flags.replace('g', '')) : new RegExp(s.re, 'i');
    let hit = false;
    for (const c of clauses) {
      const m = c.match(re);
      if (!m) continue;
      if (NOT_REAL.test(c.slice(0, m.index))) continue;
      if (s.id === 'domain' && m[1] && +m[1] < (s.minYears ?? 8)) continue;
      hit = true; break;
    }
    if (!hit) continue;
    // Frontier-lab names also match the big-tech regex (e.g. 'Google Brain'): count the stronger signal only.
    if (s.id === 'bigtech' && found.some((f) => f.id === 'ai_lab')) continue;
    found.push({ id: s.id, label: s.label ?? s.id, points: s.points ?? 1 });
    points += s.points ?? 1;
  }
  const tier = [...PED_TIERS].sort((a, b) => b.min - a.min).find((x) => points >= x.min)?.id ?? 'none';
  return { points: +points.toFixed(2), tier, signals: found.map(({ id, label }) => ({ id, label })) };
}

// ---- can this company return the fund? ----
// proceeds = entry ownership × (1 − dilution to exit) × plausible exit; ratio = proceeds / fund size (r1 §2).
export function fundReturner(inv, scale, stage = 'seed') {
  const exitValue = scale?.exitValue ?? 0;
  if (isAngel(inv) || isIndie(inv)) {
    return { ok: true, ratio: null, needExit: 0, why: isIndie(inv) ? 'Indie funds underwrite cash returns from profitable capped businesses, not fund-returners.' : 'Angels write personal checks; no fund-returner math.' };
  }
  const size = fundSize(inv);
  const own = ownershipBand(inv, stage)?.[1] ?? 0.1;
  const keep = 1 - (DILUTION_TO_EXIT[stage] ?? 0.5);
  const proceeds = own * keep * exitValue;
  const ratio = size > 0 ? proceeds / size : 1;
  const needExit = own * keep > 0 ? size / (own * keep) : Infinity;
  const ok = ratio >= 1;
  const why = ok
    ? `${money(size)} fund at ${pct(own)} entry: a ${money(exitValue)} outcome returns ${ratio.toFixed(1)}x the fund.`
    : `${money(size)} fund at ${pct(own)} entry (~${pct(own * keep)} at exit) needs a ${money(needExit)}+ outcome to return the fund; a plausible exit here is ~${money(exitValue)} (${ratio < 0.01 ? '<1' : Math.round(ratio * 100)}% of the fund).`;
  return { ok, ratio: +ratio.toFixed(4), needExit, proceeds, why };
}

// ---- minimum ownership ----
export function ownershipCheck(inv, { stage = 'seed', postMoney, roundSize = null, hot = false } = {}) {
  const band = ownershipBand(inv, stage);
  const t = tierOf(inv);
  let maxCheck = t.firstCheck?.[stage]?.[1] ?? inv?.checkMax ?? (Array.isArray(t.check) ? t.check[1] : 100e3);
  if (hot && tierId(inv) === 'top' && inv?.leads !== false) maxCheck *= 1.5; // top firms stretch to win a hot round [design]
  if (isAngel(inv) || !band || !(band[0] > 0)) {
    const own = postMoney ? Math.min(maxCheck, roundSize ?? maxCheck) / postMoney : 0;
    return { ok: true, maxCheck, ownership: own, minOwnership: 0, impliedPost: Infinity, why: 'No ownership minimum: they buy what the round offers.' };
  }
  const check = Math.min(maxCheck, roundSize ?? maxCheck);
  const ownership = postMoney > 0 ? check / postMoney : 1;
  const [minOwnership, target] = band;
  const impliedPost = check / target;
  const ok = ownership >= minOwnership;
  const why = ok
    ? `Their ${money(check)} check buys ${pct(ownership)} at ${money(postMoney)} post (min ${pct(minOwnership)}).`
    : roundSize != null && roundSize < maxCheck && roundSize / postMoney < minOwnership
      ? `The round (${money(roundSize)} at ${money(postMoney)} post) is too small to give them ${pct(minOwnership)}; they'd need ~${money(impliedPost)} post or a bigger round.`
      : `Their max check ${money(maxCheck)} buys only ${pct(ownership)} at ${money(postMoney)} post; they need ${pct(minOwnership)}+ (target ${pct(target)}), i.e. ~${money(impliedPost)} post.`;
  return { ok, maxCheck, ownership: +ownership.toFixed(4), minOwnership, targetOwnership: target, impliedPost, why };
}

// ---- the lens ----
// How much this investor's process moves vs. the base rates the sim already applies (cold/warm rates, S score).
// Appetite by idea ceiling for institutional VCs (moonshots preferred) and for indie funds (the reverse). [design]
const VC_APPETITE = { micro: 0.2, lifestyle: 0.4, mid: 0.75, venture: 1, moonshot: 1.35 };
const INDIE_APPETITE = { micro: 1.5, lifestyle: 1.6, mid: 1, venture: 0.55, moonshot: 0.3 };
const REGION = (g) => String(g ?? '').split('_')[0];

function thesisCheck(inv, ctx, t) {
  const miss = [];
  const sectors = inv.sectors ?? inv.fund?.sectors ?? [];
  const generalist = !sectors.length || sectors.includes('generalist') || /generalist/i.test(inv.thesisTags?.join?.(' ') ?? '');
  if (!generalist && ctx.sector && !sectors.includes(ctx.sector)) miss.push(`we invest in ${sectors.slice(0, 3).map(sectorLabel).join(', ')}, not ${sectorLabel(ctx.sector)}`);
  const stages = inv.stages ?? (t.firstCheck ? Object.keys(t.firstCheck) : null);
  if (ctx.stage && stages && stages.length && !stages.includes(ctx.stage) && !isAngel(inv)) miss.push(`we don't do ${ctx.stage} (we write ${stages.join('/')} checks)`);
  const geos = inv.geos ?? null;
  if (ctx.geo && geos?.length && !geos.includes(ctx.geo) && !geos.includes('global')) miss.push(`we only invest in ${geos.join(', ')}`);
  else if (ctx.geo && !geos && inv.geo && REGION(inv.geo) !== REGION(ctx.geo) && !['top', 'crossover'].includes(tierId(inv)) && !isAngel(inv) && inv.geo !== 'global') miss.push(`we invest locally (${inv.geo}), not ${ctx.geo}`);
  const tags = (inv.thesisTags ?? []).map((x) => String(x).toLowerCase());
  const models = inv.models ?? null;
  if (ctx.model && models?.length && !models.includes(ctx.model) && !(ctx.model !== 'b2c' && models.includes('b2b'))) miss.push(`we back ${models.join('/')} companies`);
  else if (ctx.model === 'b2c' && tags.some((x) => ['b2b', 'enterprise', 'b2b_only'].includes(x)) && !tags.includes('b2c') && !tags.includes('consumer')) miss.push('we only back B2B');
  else if (ctx.model && ctx.model !== 'b2c' && tags.some((x) => ['b2c', 'consumer'].includes(x)) && !tags.includes('b2b')) miss.push('we only back consumer');
  if (tags.some((x) => ['ai_native', 'ai-native', 'ai_only'].includes(x)) && ctx.isAI === false) miss.push('we only back AI-native companies');
  if (tags.some((x) => ['technical', 'technical_founder'].includes(x)) && ctx.technical === false) miss.push('we require a technical founder');
  return miss;
}
const sectorLabel = (id) => SECTORS.find((s) => s.id === id)?.label ?? String(id).replace(/_/g, ' ');

export function lensFor(inv, ctx = {}) {
  const stage = ctx.stage ?? 'seed';
  const t = tierOf(inv);
  const tid = tierId(inv);
  const angel = isAngel(inv), indie = isIndie(inv);
  const scale = ctx.scale ?? ventureScale({});
  const ped = typeof ctx.pedigree === 'string' ? { tier: ctx.pedigree } : ctx.pedigree ?? { tier: 'none' };
  const parts = [];
  const m = { meeting: 1, partner: 1, close: 1, round: 1, valuation: 1 };
  const add = (label, mults) => {
    for (const [k, v] of Object.entries(mults)) if (Number.isFinite(v) && v !== 1) { m[k] *= v; parts.push({ label, on: k, mult: +v.toFixed(3) }); }
  };
  let passReason = null, passAt = null, stellar = null;

  // 1) Thesis fit: a mismatch is a fast pass (sector, stage, geography, model, AI-native, technical founder).
  const miss = thesisCheck(inv, ctx, t);
  if (miss.length) {
    add('thesis mismatch', { meeting: 0.25, partner: 0.3 });
    passReason = `not our thesis: ${miss[0]}`;
    passAt = 'reply';
    stellar = `Filter by thesis before pitching: ${inv.name ?? 'this investor'} says "${miss[0]}". A stellar founder pitches ${ctx.sector ? `${sectorLabel(ctx.sector)} specialists and ` : ''}generalists who write ${stage} checks${ctx.geo ? ` in ${ctx.geo}` : ''}; every off-thesis pitch is a wasted hour and a "no" that circulates.`;
  }

  // 2) Fund-returner math and idea-ceiling appetite (institutional only). Associates still take some meetings;
  // partners kill it. Weighted by how much this tier cares about TAM.
  const fr = fundReturner(inv, scale, stage);
  const tw = t.tamWeight ?? 0.5;
  if (indie) {
    add(`indie fund likes capped, profitable businesses (${scale.cls})`, { meeting: INDIE_APPETITE[scale.cls], partner: INDIE_APPETITE[scale.cls] });
    if (ctx.profitable || (ctx.traction ?? 0) >= 3.5) add('profitable / cash-efficient', { meeting: 1.2, close: 1.2 });
    if (scale.cls === 'moonshot' || scale.cls === 'venture') stellar ??= `Indie funds back profitable capped businesses and dislike venture burn; with a ${scale.label} story, pitch venture funds whose size matches a ${money(scale.exitValue)} outcome.`;
  } else if (angel) {
    add(`angel appetite for a ${scale.cls} idea`, { meeting: Math.pow(VC_APPETITE[scale.cls], t.tamWeight ?? 0.15) });
  } else {
    add(`appetite for a ${scale.cls} idea`, { meeting: Math.pow(VC_APPETITE[scale.cls], tw), partner: Math.pow(VC_APPETITE[scale.cls], tw) });
    const r = fr.ratio;
    let fm;
    if (r >= 1) fm = 1;
    else if (r >= HARD_RATIO) fm = 0.3 + 0.7 * Math.log(r / HARD_RATIO) / Math.log(1 / HARD_RATIO); // smooth 0.3→1
    else fm = clamp(0.3 * Math.sqrt(r / HARD_RATIO), 0.05, 0.3);
    const eff = 1 - tw * (1 - fm);
    if (eff < 0.999) add(`fund-returner math (${r < 0.01 ? '<1' : Math.round(r * 100)}% of fund)`, { meeting: Math.sqrt(eff), partner: eff, close: Math.sqrt(eff) });
    if (r < HARD_RATIO && tw >= 0.5) {
      add('cannot return the fund', { partner: 0.15 });
      passReason ??= `can't return the fund: ${fr.why}`;
      passAt ??= 'partner';
    }
    // Largest fund this exit could return at a 10% entry / 50% kept stake [design arithmetic, r1 §2].
    const fits = scale.exitValue * 0.05;
    const alt = fits < 10e6 ? 'pitch angels, indie funds (TinySeed-style) or a nano fund instead, or raise on revenue-based financing'
      : clsIdx(scale.cls) <= clsIdx('mid') ? `pitch angels, indie funds or a fund under ~${money(fits)} instead, or raise on revenue-based financing`
        : `pitch funds under ~${money(fits)} whose math works at a ~${money(scale.exitValue)} exit, or come back once traction proves a bigger ceiling`;
    if (!fr.ok) stellar ??= `A ${money(fundSize(inv))} fund needs a ${money(fr.needExit)}+ outcome; with a ~${money(scale.ceilingArr)} ARR ceiling, ${alt}.`;
  }

  // 3) Ownership: a cap too high for their max check → pass, or push price down toward their implied post.
  if (ctx.postMoney && !angel) {
    const oc = ownershipCheck(inv, { stage, postMoney: ctx.postMoney, roundSize: ctx.roundSize ?? null, hot: ctx.hot });
    if (!oc.ok) {
      const push = clamp(oc.impliedPost / ctx.postMoney, 0.5, 1);
      add('ownership below their minimum', { partner: 0.6, close: 0.6, valuation: push });
      stellar ??= `They need ${pct(oc.minOwnership)}+ and can write ~${money(oc.maxCheck)}: either price near ${money(oc.impliedPost)} post with them leading, or bring them in as a follower and find a lead whose check fits your ${money(ctx.postMoney)} post.`;
    }
  }

  // 4) Pedigree (weighted by how founder-driven the tier is). Repeat founders/elite schools: research r3 §2.
  const pw = t.pedigreeWeight ?? 0.5;
  const pmult = (tbl) => 1 + pw * ((tbl[ped.tier] ?? 1) - 1);
  add(`founder pedigree (${ped.tier})`, { meeting: pmult(PED_MEET), partner: Math.sqrt(pmult(PED_MEET)), round: pmult(PED_ROUND), valuation: pmult(PED_VAL) });
  if (tid === 'top' && ped.tier === 'none' && (ctx.traction ?? 3) < 3.5) add('top firms rarely engage without pedigree or traction', { meeting: 0.6 });

  // 5) Traction (data matters more to metric-driven tiers; experienced early investors weigh team over traction, r3 §1-2).
  const tr = (ctx.traction ?? 3) - 3;
  const trw = t.tractionWeight ?? 0.5;
  if (tr) add(`traction ${(ctx.traction ?? 3).toFixed(1)}/5`, { meeting: Math.exp(0.12 * trw * tr), partner: Math.exp(0.25 * trw * tr), valuation: Math.exp(0.08 * trw * tr) });

  // 6) Sector heat and the AI premium (concentrated in venture-scale AI; AI seed pre ~+40%, r2 §2).
  const heat = SECTORS.find((s) => s.id === ctx.sector)?.heat;
  if (Number.isFinite(heat) && !angel && !indie) add(`sector heat (${sectorLabel(ctx.sector)})`, { meeting: Math.pow(heat, tw * 0.6), valuation: Math.pow(heat, tw * 0.4) });
  if (ctx.isAI && clsIdx(scale.cls) >= clsIdx('venture') && !indie) add('AI premium (venture-scale AI)', { valuation: Math.pow(AI_VAL_PREMIUM, angel ? 0.3 : tw * 0.6) });
  // Scale on price: a bigger ceiling lets the lead pay more (TAM-weighted).
  if (!angel && !indie) add(`price for a ${scale.cls} ceiling`, { valuation: Math.pow({ micro: 0.7, lifestyle: 0.8, mid: 0.9, venture: 1, moonshot: 1.3 }[scale.cls], tw) });

  // 7) Mega-seed: elite pedigree × moonshot × a founder-driven, TAM-driven firm (top/crossover) → $8-15M at $40-80M
  // post pre-revenue (2026 barbell, r3 §5). Non-AI gets the square root.
  let megaSeed = null;
  const megaFirm = ['top', 'crossover'].includes(tid) || (tw >= 0.85 && pw >= 0.8);
  if (megaFirm && clsIdx(scale.cls) >= clsIdx(MEGA.minScale) && (PED_TIERS.find((x) => x.id === ped.tier)?.min ?? 0) >= (PED_TIERS.find((x) => x.id === MEGA.minPedigree)?.min ?? 4) && stage !== 'series-a') {
    const round = clamp(MEGA.round[0] * 1.4, 8e6, 15e6), post = clamp(MEGA.post[0] * 1.4, 40e6, 80e6);
    const k = ctx.isAI ? 1 : 0.5;
    const rm = Math.pow(round / MEDIAN_ROUND.seed / m.round, k), vm = Math.pow(post / MEDIAN_POST.seed / m.valuation, k);
    add('mega-seed: elite founder × moonshot × top firm', { round: Math.max(1, rm), valuation: Math.max(1, vm), meeting: 1.3, close: 1.3 });
    megaSeed = { round: Math.round(round * (ctx.isAI ? 1 : 0.6)), post: Math.round(post * (ctx.isAI ? 1 : 0.6)) };
  }

  // 8) Herding: once a top-tier (or other signalling) lead is in, followers move fast; angels are FOMO-driven.
  if (ctx.leadTier && ctx.leadTier !== 'none') {
    const sig = (FUND_TIERS[ctx.leadTier]?.signal ?? TIER_DEFAULTS[ctx.leadTier]?.signal ?? 1);
    const s = angel ? 1 + (t.fomoWeight ?? 0.6) * (sig - 1) : sig;
    if (s !== 1 && !(inv.leads && tid === ctx.leadTier)) add(`${ctx.leadTier}-tier lead is in`, { meeting: s, close: s });
  }

  const out = {
    meetingMult: +clamp(m.meeting, 0.05, 4).toFixed(3),
    partnerMult: +clamp(m.partner, 0.05, 4).toFixed(3),
    closeMult: +clamp(m.close, 0.05, 4).toFixed(3),
    roundMult: +clamp(m.round, 0.5, 4).toFixed(3),
    valuationMult: +clamp(m.valuation, 0.5, 3).toFixed(3),
    passReason, passAt, megaSeed, fundReturner: fr, scale: scale.cls, parts,
  };
  if (passAt === 'reply') out.meetingMult = Math.min(out.meetingMult, 0.3);
  out.stellar = stellar ?? stellarFit(inv, ctx, scale, ped, tid, angel, indie, megaSeed);
  return out;
}

function stellarFit(inv, ctx, scale, ped, tid, angel, indie, megaSeed) {
  if (megaSeed) return `This is the 2026 mega-seed profile: run a tight 2-3 week process with 3-5 top firms in parallel, lead with your track record and the ${money(scale.ceilingArr)} ARR vision, and let competing term sheets set a ~${money(megaSeed.round)} round at ~${money(megaSeed.post)} post.`;
  if (ctx.leadTier === 'top' && !inv.leads) return 'Use the top-tier lead as social proof: send a short note naming the lead, the allocation left and a close date; followers decide in days, not weeks.';
  if (indie) return 'Good fit for indie capital: show profit, retention and owner hours, and ask for a cash-flow-friendly structure (shared earnings / capped return) rather than a venture SAFE.';
  if (angel) return ped.tier === 'none' ? 'Angels back the founder: get a warm intro from someone they trust, show what you shipped in the last 30 days and name who else is in.' : 'Lead with your background in the first line of the intro; angels decide on the founder and on who else is in.';
  if (tid === 'top') return 'Top firms take meetings through warm intros (portfolio founders, scouts); pitch the path to a $1B+ outcome and why you are the team to get there.';
  return `Good fit on paper: get a warm intro, open with the evidence their tier screens for (${tid === 'established' ? 'metrics and NRR' : 'founder insight and early pull'}), and size the ask to their ${money(tierOf(inv).firstCheck?.[ctx.stage ?? 'seed']?.[1] ?? inv.checkMax ?? 1e6)} max check.`;
}

// ---- CRM one-liner ----
export function matchSummary(inv, ctx = {}) {
  const lens = lensFor(inv, ctx);
  const scale = ctx.scale ?? ventureScale({});
  const fit = lens.passReason ? 'poor fit' : lens.meetingMult * lens.partnerMult >= 1.4 ? 'strong fit' : lens.meetingMult * lens.partnerMult >= 0.7 ? 'good fit' : lens.meetingMult * lens.partnerMult >= 0.3 ? 'weak fit' : 'poor fit';
  const why = lens.passReason?.startsWith('not our thesis') ? ' (off thesis)' : '';
  if (isAngel(inv) || isIndie(inv)) {
    const t = tierOf(inv);
    const ck = inv.checkMin != null && inv.checkMax != null ? [inv.checkMin, inv.checkMax] : t.check ?? t.firstCheck?.[ctx.stage ?? 'seed'];
    return `${inv.archetypeLabel ?? t.label ?? (isIndie(inv) ? 'Indie fund' : 'Angel')}${ck ? ` · checks ${money(ck[0])}-${money(ck[1])}` : ''} · ${isIndie(inv) ? 'likes capped, profitable SaaS' : 'backs founders, no fund math'}: ${fit}${why}`;
  }
  const num = inv.fund?.number;
  const name = num ? `Fund ${num}` : tierOf(inv).label ?? 'Fund';
  const fr = lens.fundReturner;
  return `${name}, ${money(fundSize(inv))} · needs ~${money(fr.needExit)} outcomes · your ceiling ~${money(scale.ceilingArr)} ARR: ${fit}${why}`;
}

export const _internals = { tierOf, isAngel, isIndie, CLASSES };
