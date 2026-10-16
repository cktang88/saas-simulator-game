// What VCs read off the company: the lens context (stage, ceiling, pedigree, sector, traction, who leads) built
// from state, a company-level "how VCs will size you" summary, and one investor's read. Reads state, writes
// nothing, no randomness. Imports no sim.js (sim.js imports this) so there is no cycle.

import { ventureScale, pedigree as parsePedigree, fundReturner, lensFor, matchSummary } from './vclens.js';
import { computeMetrics } from './metrics.js';
import { FUND_TIERS, SECTORS, SCALE_CLASSES, AI_ERA } from '../../data/vc-universe.js';

const KIND_TIER = { multistage: 'established', seed_fund: 'established', micro_vc: 'micro', cvc: 'cvc', family_office: 'family_office' };
const ANGEL_KINDS = new Set(['angel', 'syndicate', 'angel_group', 'scout']);
// Game business models → the lens's buyer classes.
const MODEL = { b2c: 'b2c', smb: 'smb', ent: 'enterprise', enterprise: 'enterprise', mid: 'mid' };
const MONTHLY = (p) => (p ? (p.interval === 'year' ? p.price / 12 : p.price) : null);
const money = (n) => (n >= 1e9 ? `$${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(n >= 10e6 ? 0 : 1)}M` : `$${Math.round(n / 1e3)}K`);
const TECH = /\b(engineer(ing)?|developer|software dev|programmer|cto|computer science|\bcs\b|ph\.?d|machine learning|ml researcher|built (the|our|my) (product|platform|app))\b/i;

// Profile text an investor reads: LinkedIn plus bio (only what was pasted; nothing is inferred).
export const founderText = (state) => `${state.founder?.linkedinText ?? ''}\n${state.founder?.bio ?? ''}`;
export const founderPedigree = (state) => parsePedigree(founderText(state));

// Best keyword match against SECTORS on the one-liner + ICP (null when nothing matches).
export function sectorOf(state) {
  const text = ` ${state.company?.oneLiner ?? ''} ${state.company?.icp ?? ''} `.toLowerCase();
  let best = null, hits = 0;
  for (const s of SECTORS) {
    const h = (s.keywords ?? []).filter((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\b`, 'i').test(text)).length;
    if (h > hits) { best = s; hits = h; }
  }
  return best;
}

// Tier of a committed/term-sheet lead in the current raise (signal for followers), or null.
function leadTierOf(fr) {
  const r = fr?.raise;
  if (!r) return null;
  const leads = (fr.investors ?? []).filter((i) => i.raiseId === r.id && i.leads && ['term_sheet', 'committed'].includes(i.status));
  const rank = ['top', 'crossover', 'established', 'emerging', 'micro', 'cvc', 'family_office', 'nano', 'indie'];
  const tiers = leads.map((i) => i.fund?.tier ?? i.angelTier ?? KIND_TIER[i.kind] ?? null).filter(Boolean);
  const idx = (t) => (rank.includes(t) ? rank.indexOf(t) : 99);
  return tiers.sort((a, b) => idx(a) - idx(b))[0] ?? null;
}

export function companyScale(state, m = computeMetrics(state)) {
  const fr = state.apps?.fundraising ?? {};
  const ev = fr.evaluations?.at?.(-1) ?? null;
  const plan = (state.plans ?? []).find((p) => p.active) ?? state.plans?.[0];
  return ventureScale({
    oneLiner: state.company?.oneLiner ?? '', icp: state.company?.icp ?? '', model: (state.company?.customerType === 'mid_market' ? 'mid' : MODEL[state.company?.model]) ?? 'smb',
    // Investors read ACV from what customers actually pay (ARPA), not only the list price.
    price: Math.max(MONTHLY(plan) ?? 0, m.customers > 0 ? (m.mrr ?? 0) / m.customers : 0) || null, isAI: Boolean(m.isAI), marketScore: ev?.criteria?.market_why_now?.avg ?? 3, arr: m.arr ?? 0, yoyGrowth: m.yoyGrowth ?? 0,
  });
}

// The ctx vclens.lensFor needs. With inv: the investor judges the founder profile they saw at outreach
// (inv.pedigreeAtOutreach), so a profile edited mid-raise changes nothing for them.
// opts.m: metrics already computed by the caller (the sim's raiseContext), to avoid recomputing.
export function vcContext(state, inv = null, opts = {}) {
  const fr = state.apps?.fundraising ?? {};
  const m = opts.m ?? computeMetrics(state);
  const ev = fr.evaluations?.at?.(-1) ?? null;
  const raise = fr.raise ?? null;
  const stage = raise?.stage ?? ev?.stage ?? 'pre-seed';
  const text = founderText(state);
  const ped = inv?.pedigreeAtOutreach ?? parsePedigree(text);
  const leadTier = leadTierOf(fr);
  const paper = raise ? (fr.investors ?? []).filter((i) => i.raiseId === raise.id && ['term_sheet', 'committed', 'diligence'].includes(i.status)).length : 0;
  return {
    stage, scale: companyScale(state, m), pedigree: ped, sector: sectorOf(state)?.id ?? null, geo: state.company?.geo ?? null,
    model: (state.company?.customerType === 'mid_market' ? 'mid' : MODEL[state.company?.model]) ?? 'smb', isAI: Boolean(m.isAI), technical: TECH.test(text) ? true : text.trim() ? false : null,
    solo: Boolean(m.solo), traction: ev?.criteria?.traction?.avg ?? 1, leadTier, profitable: (m.mrr ?? 0) > 0 && (m.burn ?? 1) <= 0,
    postMoney: raise?.instrument === 'safe' ? raise.cap ?? null : null, roundSize: raise?.target ?? null, hot: paper >= 2,
  };
}

// Fund tiers that run fund-returner math, in the order a founder reads them.
const FIT_TIERS = ['top', 'crossover', 'established', 'emerging', 'micro', 'nano'];
const gmid = ([a, b]) => Math.sqrt(a * b);

export function companyVcRead(state) {
  const ctx = vcContext(state);
  const scale = ctx.scale, ped = ctx.pedigree;
  const sec = SECTORS.find((s) => s.id === ctx.sector);
  const stage = ctx.stage === 'series-a' ? 'series-a' : ctx.stage === 'seed' ? 'seed' : 'pre-seed';
  const fundFit = FIT_TIERS.filter((t) => FUND_TIERS[t]).map((tier) => {
    const T = FUND_TIERS[tier];
    const st = T.ownership?.[stage] ? stage : 'seed';
    const fr = fundReturner({ kind: 'micro_vc', fund: { tier, size: gmid(T.fundSize) } }, scale, st);
    const ratio = fr.ratio ?? 0;
    return { tier, label: T.label ?? tier, fundSize: [...T.fundSize], ratio, verdict: ratio >= 1 ? 'returnable' : ratio >= 0.3 ? 'stretch' : 'cannot return', why: fr.why };
  });
  const megaSeedEligible = ped.tier === (AI_ERA.megaSeed?.minPedigree ?? 'elite') && scale.cls === (AI_ERA.megaSeed?.minScale ?? 'moonshot') && stage !== 'series-a';
  const ok = fundFit.filter((f) => f.verdict === 'returnable');
  const advice = [];
  if (megaSeedEligible) advice.push(`Mega-seed profile (elite pedigree × ${scale.label}): run a tight 2-3 week process with 3-5 top-tier firms via warm intros and let competing term sheets set price (2026: $8-15M at $40-80M post is possible pre-revenue, rare).`);
  if (!ok.length) advice.push(`No institutional fund tier can return its fund on a ~${money(scale.exitValue)} outcome. A stellar founder raises from angels and indie funds (TinySeed-style), uses revenue-based financing, or stays bootstrapped, and does not spend months pitching VCs.`);
  else {
    const biggest = ok[0];
    const stretch = fundFit.filter((f) => f.verdict === 'stretch'), no = fundFit.filter((f) => f.verdict === 'cannot return');
    advice.push(`Target ${ok.map((f) => f.label).join(', ')}${stretch.length ? `; ${stretch.map((f) => f.label).join(', ')} are a stretch (they will probe how this gets bigger, and need a credible bottom-up path)` : ''}${no.length ? `; ${no.map((f) => f.label).join(', ')} cannot return their fund on it` : ''}. The largest tier your ~${money(scale.exitValue)} plausible exit fully returns is ${biggest.label} (${money(biggest.fundSize[0])}-${money(biggest.fundSize[1])}).`);
  }
  if (['micro', 'lifestyle'].includes(scale.cls)) advice.push('Capped ceilings are good businesses: angels, indie funds and buyers on Acquire.com value profit and retention; venture funds pass at partner stage on fund math.');
  if (ped.tier === 'none' || ped.tier === 'some') advice.push('Pedigree-driven tiers (top firms, scouts, super angels) weight background heavily; without it, lead with evidence: revenue, retention, shipping speed. Never inflate the profile: investors keep what they saw and verify.');
  else advice.push(`Your ${ped.tier} pedigree (${ped.signals.map((s) => s.label).join(', ')}) opens warm doors: put it in the first line of every intro.`);
  if (scale.reasons?.some((r) => /Capped/.test(r)) && !['micro', 'lifestyle'].includes(scale.cls)) advice.push('A structural cap is limiting your class: widening the market (payments layer, adjacent buyers) moves the ceiling more than a better deck.');
  return {
    scale: { cls: scale.cls, label: scale.label ?? SCALE_CLASSES[scale.cls]?.label, ceilingArr: scale.ceilingArr, exitValue: scale.exitValue, reasons: scale.reasons },
    pedigree: { tier: ped.tier, points: ped.points ?? 0, signals: ped.signals ?? [] },
    sector: sec ? { id: sec.id, label: sec.label } : null,
    fundFit, advice, megaSeedEligible,
  };
}

export function investorVcRead(state, inv) {
  const ctx = vcContext(state, inv);
  return { ...lensFor(inv, ctx), summary: matchSummary(inv, ctx) };
}

export const _internals = { leadTierOf, MODEL, ANGEL_KINDS };
