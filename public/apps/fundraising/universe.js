// Procedural investor universe: where the founder points the search (tier, fund size, stage, sector, geo) decides
// which fictional firms and angels turn up. Same filters + same game → same firms (seeded by the game's universe
// seed + filter hash + page + index), so a search is reproducible and re-adding a page never duplicates.
// "Fractal": a broad search mostly surfaces the populous tiers (micro/nano funds, angels); top-tier firms are rare
// in broad results and show up reliably only when the founder filters for them. Counts come from UNIVERSE_COUNTS ×
// tier/sector/geo shares, so each filter shrinks "~N investors match" the way a real database query would.
// Pure apart from universeSeed() (stores a fixed seed on the fundraising slice on first use, because state.seed
// advances with every rng() call and would make the same search return different firms tomorrow).

import { clamp, hash, money } from '../../core/util.js';
import { ensure } from '../../core/state.js';
import { fromArchetype, getArchetypes, FALLBACK_ARCHETYPES } from './investors.js';
import * as U from '../../data/vc-universe.js';

// ---- Data with local defaults (only used if a field is missing in data/vc-universe.js) ----
const FUND_TIERS = U.FUND_TIERS ?? {};
const ANGEL_TIERS = U.ANGEL_TIERS ?? {};
// 'generalist' is not a sector you can search for a thesis in; it is what non-specialists are.
const SECTORS = (U.SECTORS ?? []).filter((s) => s.id !== 'generalist');
const GEOS = U.GEOS ?? [];
const NAME_PARTS = U.NAME_PARTS ?? {};
const COUNTS = U.UNIVERSE_COUNTS ?? {};
const THESIS_TEMPLATES = U.THESIS_TEMPLATES ?? {};
const DILUTION = U.DILUTION_TO_EXIT ?? { 'pre-seed': 0.6, seed: 0.5, 'series-a': 0.4 };

const STAGE_IDS = ['pre-seed', 'seed', 'series-a'];
const STAGE_LABEL = { 'pre-seed': 'pre-seed', seed: 'seed', 'series-a': 'Series A' };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const firstNum = (...keys) => { for (const k of keys) if (num(COUNTS[k]) != null) return COUNTS[k]; return null; };

// Searchable population. NVCA 2026 Yearbook: 2,984 active US VC firms (docs/research, r4). ~400k active US angels
// (UNH CVR via r4) of whom only a fraction are findable/active in a given year; the data file decides.
const usShare = GEOS.filter((g) => /^us/.test(g.id)).reduce((a, g) => a + (g.share ?? 0), 0) || 1;
const VC_POP = firstNum('global_vc_firms_est', 'global_vc_firms', 'vc_firms_global')
  ?? Math.round((firstNum('us_vc_firms') ?? 2984) / usShare);
const ANGEL_POP = firstNum('angels_searchable', 'angels_active_global', 'angels_active', 'active_angels', 'angels') ?? 400000;
const ANGEL_MAX_MIX = 0.7; // [design] in an 'any' search angels are the majority but firms still surface

// Fund-size bands the founder can filter on (same breakpoints as r1's tier table).
export const FUND_SIZE_BANDS = {
  any: { label: 'Any fund size', range: [0, Infinity] },
  nano: { label: '< $25M', range: [0, 25e6] },
  micro: { label: '$25–100M', range: [25e6, 100e6] },
  small: { label: '$100–300M', range: [100e6, 300e6] },
  mid: { label: '$300M–1B', range: [300e6, 1e9] },
  large: { label: '$1–5B', range: [1e9, 5e9] },
  mega: { label: '$5B+', range: [5e9, Infinity] },
};

export const FILTERS = {
  kind: ['any', 'vc', 'angel'],
  tier: ['any', ...Object.keys(FUND_TIERS), ...Object.keys(ANGEL_TIERS)],
  fundSize: Object.keys(FUND_SIZE_BANDS),
  stage: ['any', ...STAGE_IDS],
  sector: ['any', ...SECTORS.map((s) => s.id)],
  geo: ['any', ...GEOS.map((g) => g.id)],
};
export const tierLabel = (id) => FUND_TIERS[id]?.label ?? ANGEL_TIERS[id]?.label ?? id;

export function normalizeFilters(f = {}) {
  const ok = (k) => (FILTERS[k].includes(f[k]) ? f[k] : 'any');
  const out = { kind: ok('kind'), tier: ok('tier'), fundSize: ok('fundSize'), stage: ok('stage'), sector: ok('sector'), geo: ok('geo') };
  // A tier implies its kind; if the founder explicitly picked the other kind, the kind wins and the tier resets.
  const tierKind = FUND_TIERS[out.tier] ? 'vc' : ANGEL_TIERS[out.tier] ? 'angel' : null;
  if (tierKind && out.kind !== 'any' && out.kind !== tierKind) out.tier = 'any';
  else if (tierKind) out.kind = tierKind;
  if (out.kind === 'angel') out.fundSize = 'any'; // angels have no fund
  return out;
}
const filterKey = (n) => `${n.kind}|${n.tier}|${n.fundSize}|${n.stage}|${n.sector}|${n.geo}`;

/** Fixed per-game seed for the universe (state.seed moves on every rng() call). */
export function universeSeed(state) {
  const fr = state.apps ? ensure(state, 'fundraising', () => ({})) : state;
  fr.universeSeed ??= (state.seed | 0) || 1;
  return fr.universeSeed;
}

// Mulberry32 over an FNV-1a hash of the key: a local stream per record, independent of the game's rng.
function prng(key) {
  let a = parseInt(hash(key), 36) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];
function weighted(r, items, w) {
  const tot = items.reduce((a, x) => a + Math.max(0, w(x)), 0);
  if (!(tot > 0)) return items[0];
  let u = r() * tot;
  for (const x of items) { u -= Math.max(0, w(x)); if (u < 0) return x; }
  return items.at(-1);
}
const logU = (r, a, b) => Math.exp(Math.log(a) + r() * (Math.log(b) - Math.log(a)));
const nice = (x) => { if (!(x > 0)) return 0; const p = 10 ** Math.floor(Math.log10(x) - 1); return Math.round(x / p) * p; };
// "$420M", "$2.4B", "$27B": fund and outcome sizes read like a partner would say them.
export const big = (x) => (x >= 1e10 ? `$${Math.round(x / 1e9)}B` : x >= 1e9 ? `$${(x / 1e9).toFixed(1).replace(/\.0$/, '')}B` : x >= 1e8 ? `$${Math.round(x / 1e6)}M` : `$${(x / 1e6).toFixed(1).replace(/\.0$/, '')}M`);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// ---- Shares ----
const tierBand = (t) => [Math.max(1e6, t.fundSize?.[0] ?? 1e6), Math.max(2e6, t.fundSize?.[1] ?? 50e6)];
// Share of a tier's funds (log-uniform over its size band) inside the filtered size band.
function sizeFrac(t, band) {
  const [a, b] = tierBand(t), [lo, hi] = FUND_SIZE_BANDS[band].range;
  const x = Math.max(a, lo), y = Math.min(b, hi);
  return y <= x ? 0 : (Math.log(y) - Math.log(x)) / (Math.log(b) - Math.log(a));
}
const tierStages = (t) => STAGE_IDS.filter((s) => t.firstCheck?.[s]);
// [design] most firms in a multi-stage tier concentrate on one or two of its stages.
const stageFrac = (t, stage) => (stage === 'any' ? 1 : !tierStages(t).includes(stage) ? 0 : tierStages(t).length === 1 ? 1 : 0.7);
const angelStages = (t) => t.stages ?? ['pre-seed', 'seed'];
const angelStageFrac = (t, stage) => (stage === 'any' ? 1 : angelStages(t).includes(stage) ? 1 : 0);
// [design] investors with an active thesis in a sector: specialists (sector.share of specialist funds) plus the part
// of generalists actively doing that sector this year (scaled by 2026 heat).
const GENERALIST = 0.6; // [design] share of funds that are generalists
function sectorFrac(sectorId) {
  if (sectorId === 'any') return 1;
  const s = SECTORS.find((x) => x.id === sectorId);
  if (!s) return 1;
  return (1 - GENERALIST) * (s.share ?? 1 / Math.max(1, SECTORS.length)) + GENERALIST * clamp(0.22 * (s.heat ?? 1), 0.05, 0.4);
}
const geoFrac = (geoId) => (geoId === 'any' ? 1 : GEOS.find((g) => g.id === geoId)?.share ?? 0.1);
const vcShareSum = () => Object.values(FUND_TIERS).reduce((a, t) => a + (t.shareOfUniverse ?? 0), 0) || 1;
const angelShareSum = () => Object.values(ANGEL_TIERS).reduce((a, t) => a + (t.shareOfUniverse ?? 0), 0) || 1;

function vcTierWeights(n) {
  const ids = n.tier !== 'any' ? (FUND_TIERS[n.tier] ? [n.tier] : []) : Object.keys(FUND_TIERS);
  return ids.map((id) => { const t = FUND_TIERS[id]; return [id, ((t.shareOfUniverse ?? 0) / vcShareSum()) * sizeFrac(t, n.fundSize) * stageFrac(t, n.stage)]; }).filter(([, w]) => w > 0);
}
function angelTierWeights(n) {
  if (n.fundSize !== 'any') return [];
  const ids = n.tier !== 'any' ? (ANGEL_TIERS[n.tier] ? [n.tier] : []) : Object.keys(ANGEL_TIERS);
  return ids.map((id) => { const t = ANGEL_TIERS[id]; return [id, ((t.shareOfUniverse ?? 0) / angelShareSum()) * angelStageFrac(t, n.stage)]; }).filter(([, w]) => w > 0);
}
function populations(n) {
  const common = sectorFrac(n.sector) * geoFrac(n.geo);
  const vc = n.kind === 'angel' ? 0 : VC_POP * vcTierWeights(n).reduce((a, [, w]) => a + w, 0) * common;
  const angel = n.kind === 'vc' ? 0 : ANGEL_POP * angelTierWeights(n).reduce((a, [, w]) => a + w, 0) * common;
  return { vc, angel };
}

/** Estimated real-world population matching the filters (shrinks with every filter). */
export function universeCount(state, filters) {
  const { vc, angel } = populations(normalizeFilters(filters));
  return Math.round(vc + angel);
}

/** Founder hours to research one page of results: narrower searches mean more reading per result. [design] */
export function searchHours(filters) {
  const n = normalizeFilters(filters);
  const narrow = ['tier', 'fundSize', 'stage', 'sector', 'geo'].filter((k) => n[k] !== 'any').length;
  return Math.round((1.5 + 0.25 * narrow) * 4) / 4; // ~9 min/result skim at 1.5h; ~15 min fully filtered
}

// ---- Record generation ----
const KIND_LABEL = { angel: 'Angel', syndicate: 'Angel syndicate lead', angel_group: 'Angel group', scout: 'VC scout', micro_vc: 'Micro VC', seed_fund: 'Seed fund partner', multistage: 'Multistage fund', cvc: 'Corporate VC', family_office: 'Family office' };
function vcKind(tierId, stage) {
  if (tierId === 'top' || tierId === 'established') return stage === 'series-a' ? 'multistage' : 'seed_fund';
  if (tierId === 'crossover') return 'multistage';
  if (tierId === 'cvc') return 'cvc';
  if (tierId === 'family_office') return 'family_office';
  return 'micro_vc'; // emerging, micro, nano, indie
}
const ANGEL_KIND = { super_angel: 'angel', operator: 'angel', first_time: 'angel', syndicate: 'syndicate', angel_group: 'angel_group', scout: 'scout' };
function baseArchetype(r, kind) {
  const pool = getArchetypes().filter((a) => a.kind === kind);
  const fb = FALLBACK_ARCHETYPES.filter((a) => a.kind === kind);
  const a = pickR(r, pool.length ? pool : fb.length ? fb : FALLBACK_ARCHETYPES.filter((x) => x.kind === 'micro_vc'));
  return { ...a, kind, label: a.kind === kind ? a.label : KIND_LABEL[kind] ?? kind };
}

// [design] warm paths: a bigger network reaches more investors, but top-tier and crossover partners are gated
// behind warm intros from people they already trust, which a first-time founder's network rarely includes.
const WARM_MULT = { top: 0.2, established: 0.5, crossover: 0.3, cvc: 0.6, family_office: 0.8, super_angel: 0.5, operator: 1.2, first_time: 1.3, syndicate: 0.8, angel_group: 0.9, scout: 1 };
const CONNECTORS = ['a former colleague', 'a founder you met at a meetup', 'your old manager', 'a customer who invests on the side', 'a friend from university', 'an advisor'];
function warmPathFor(state, r, tierId) {
  const base = clamp(0.1 + (state.founder?.network?.linkedin ?? 0) / 5000, 0.1, 0.5); // same as generateInvestors
  return r() < clamp(base * (WARM_MULT[tierId] ?? 1), 0, 0.5) ? `${pickR(r, CONNECTORS)} (2nd-degree connection)` : '';
}

const A_WORDS = NAME_PARTS.a?.length ? NAME_PARTS.a : ['Northlake', 'Kestrel', 'Tidewater', 'Halcyon', 'Ironbark', 'Copperline', 'Bluegate', 'Wildflower'];
const FIRST = NAME_PARTS.first?.length ? NAME_PARTS.first : ['Maya', 'Daniel', 'Priya', 'Jonas', 'Elena', 'Marcus', 'Aisha', 'Kenji'];
const LAST = NAME_PARTS.last?.length ? NAME_PARTS.last : ['Okafor', 'Lindqvist', 'Raman', 'Becker', 'Moreau', 'Chen', 'Haddad', 'Novak'];
const B = NAME_PARTS.b ?? {};
const suffix = (k, d) => (Array.isArray(B[k]) && B[k].length ? B[k] : d);

function firmName(r, tierId) {
  const a = pickR(r, A_WORDS);
  if (tierId === 'cvc') return `${a} ${pickR(r, suffix('cvc', ['Ventures (CVC)', 'Strategic Investments']))}`;
  if (tierId === 'family_office') return `${a} ${pickR(r, suffix('fo', ['Family Office', 'Family Capital']))}`;
  return `${a} ${pickR(r, suffix('fund', ['Ventures', 'Capital', 'Partners', 'VC', 'Fund']))}`;
}

function fillTemplate(tpl, v) { return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m)); }
function thesisFor(r, { cat, sectorLabels, stageLabel, geoLabel, check }) {
  const list = THESIS_TEMPLATES[cat]?.length ? THESIS_TEMPLATES[cat] : THESIS_TEMPLATES.generalist?.length ? THESIS_TEMPLATES.generalist : ['Invests {check} at {stage} in {sector} companies in {geo}.'];
  return fillTemplate(pickR(r, list), { sector: sectorLabels.join(', '), stage: stageLabel, geo: geoLabel, check });
}

function pickSectors(r, n, specialist) {
  const forced = n.sector !== 'any' ? SECTORS.find((s) => s.id === n.sector) : null;
  if (!SECTORS.length) return [];
  if (specialist) return [forced ?? weighted(r, SECTORS, (s) => (s.share ?? 0.05) * (s.heat ?? 1))];
  const out = forced ? [forced] : [];
  while (out.length < 3) { const s = weighted(r, SECTORS, (x) => (x.heat ?? 1)); if (!out.includes(s)) out.push(s); else if (out.length >= SECTORS.length) break; }
  return out;
}

// [design] what each tier says about itself in the persona (style only; numbers come from the fund).
const TIER_STYLE = {
  top: 'You rarely answer cold email: most of your deals come through portfolio founders, scouts and people you trust. Founder pedigree and market size weigh more than early revenue; when you lead, others follow.',
  established: 'You hold a clear metrics bar for your stage and run a partner-meeting process over several weeks.',
  emerging: 'You read cold email, write smaller checks, often need someone else to lead, and are sensitive to price.',
  micro: 'You read cold email, write smaller checks, often co-invest behind a lead, and are sensitive to price.',
  nano: 'You are a solo GP: fast yes/no, small checks, you follow a lead and rely on founder judgment.',
  cvc: 'You are a corporate venture arm: strategic fit with the parent matters as much as returns; approvals are slow and you rarely lead.',
  family_office: 'You invest a family\'s money: patient, opportunistic, focused on downside and capital efficiency; you rarely lead.',
  crossover: 'You are a growth/crossover fund coming down-stage, mostly into AI, at high prices; you want category leaders.',
  indie: 'You back capital-efficient, profitable software businesses that do not need $1B outcomes; you dislike burn-heavy moonshots.',
};

function vcRecord(state, r, n, tierId, ukey) {
  const t = FUND_TIERS[tierId];
  const stages = tierStages(t).length ? tierStages(t) : ['seed'];
  const stage = n.stage !== 'any' && stages.includes(n.stage) ? n.stage : pickR(r, stages);
  // Fund size: log-uniform within the tier band ∩ the filtered band.
  const [ta, tb] = tierBand(t), [lo, hi] = FUND_SIZE_BANDS[n.fundSize].range;
  const a = Math.max(ta, lo), b = Math.max(a * 1.01, Math.min(tb, hi));
  const size = nice(logU(r, a, b));
  const pos = clamp((Math.log(size) - Math.log(ta)) / (Math.log(tb) - Math.log(ta) || 1), 0, 1);
  // First check: bigger fund in the band → bigger check (check ≈ portfolio math), inside the tier's stage range.
  const [ca, cb] = t.firstCheck?.[stage] ?? [250e3, 1e6];
  const center = ca * (cb / ca) ** pos;
  const checkMin = nice(Math.max(ca, center / 1.5)), checkMax = nice(Math.max(Math.min(cb, center * 1.5), checkMin * 1.2));
  const own = t.ownership?.[stage] ?? t.ownership?.seed ?? [0.05, 0.1];
  const [ownMin, ownTarget] = [Math.min(own[0], own[1]), Math.max(own[0], own[1])];
  // Ownership math: the highest post-money at which their largest check still reaches the minimum stake, the lowest
  // at which their smallest check already hits target. Sanity-clamped to the stage's plausible range [design].
  const SANE = { 'pre-seed': [3e6, 40e6], seed: [8e6, 150e6], 'series-a': [25e6, 800e6] }[stage];
  const capMax = nice(clamp(checkMax / Math.max(0.005, ownMin), SANE[0] * 1.5, SANE[1]));
  const capMin = nice(clamp(checkMin / Math.max(0.01, ownTarget), SANE[0], capMax / 1.5));
  const leads = r() < (t.leads ?? 0.3);
  const nFund = clamp(Math.round(({ top: 4, established: 3, crossover: 4, cvc: 2, family_office: 1, indie: 2 }[tierId] ?? 1) + r() * ({ top: 6, established: 3, crossover: 4 }[tierId] ?? 2)), 1, ROMAN.length);
  const vintage = 2026 - Math.floor(r() * 4); // [design] a fund deploys new checks for ~3-4 years
  const pp = t.portfolioPerFund ?? [20, 40];
  // fund.ownership always has the stage drawn (some tiers omit one, e.g. family offices at pre-seed).
  const fund = { tier: tierId, size, vintage, number: ROMAN[nFund - 1], ownership: { ...(t.ownership ?? {}), [stage]: [ownMin, ownTarget] }, reserveRatio: t.reserveRatio ?? 0.5, portfolioSize: Math.round(pp[0] + r() * (pp[1] - pp[0])) };

  const specialist = n.sector !== 'any' ? r() < 0.7 : r() < 1 - GENERALIST;
  const secs = pickSectors(r, n, specialist);
  const geo = n.geo !== 'any' ? GEOS.find((g) => g.id === n.geo) : GEOS.length ? weighted(r, GEOS, (g) => g.share ?? 0.1) : null;
  const cat = tierId === 'indie' ? 'bootstrapper' : specialist ? 'sector' : tierId === 'top' ? pickR(r, ['founder_first', 'ai_native', 'generalist']) : tierId === 'crossover' ? 'ai_native' : pickR(r, ['generalist', 'generalist', 'contrarian', 'ai_native', 'founder_first']);
  const checkS = `${money(checkMin)}–${money(checkMax)}`;
  let thesis = thesisFor(r, { cat, sectorLabels: secs.map((s) => s.label), stageLabel: STAGE_LABEL[stage], geoLabel: geo?.label ?? 'the US', check: checkS });
  const focus = n.sector !== 'any' ? secs[0] : null;
  if (focus && !thesis.toLowerCase().includes(String(focus.label).toLowerCase())) thesis += ` Active in ${focus.label}.`;
  const tags = [specialist ? 'specialist' : 'generalist', cat];
  // "AI-native only" is a thesis choice, not implied by covering an AI sector (the sector filter already applies). [design]
  if (cat === 'ai_native') tags.push('ai_native');
  tags.push(secs.some((s) => /consumer/.test(s.id)) ? 'b2c' : 'b2b');
  // A hard technical-founder requirement is a minority stance (most funds weigh it, few gate on it) [design].
  if (r() < (tierId === 'top' ? 0.3 : 0.12)) tags.push('technical_founder');
  if (leads) tags.push('leads');

  const kind = vcKind(tierId, stage);
  const arch = baseArchetype(r, kind);
  const firm = firmName(r, tierId);
  const first = pickR(r, FIRST), last = pickR(r, LAST);
  const slug = firm.toLowerCase().replace(/\(.*\)/, '').replace(/[^a-z]/g, '') || 'fund';
  const dil = DILUTION[stage] ?? 0.5;
  const needExit = size / (ownTarget * (1 - dil));
  const pctS = (x) => `${Math.round(x * 100)}%`;
  const fundLine = tierId === 'indie'
    ? `Fund ${fund.number} is ${big(size)}: you can return it with many $20–100M outcomes, so a profitable capped market is fine; you want ${pctS(ownMin)}–${pctS(ownTarget)} and a path to cash flow.`
    : `Fund ${fund.number} is ${big(size)} (${vintage} vintage); you need each core bet to plausibly return the fund, so at ${pctS(ownTarget)} entry ownership and ~${pctS(dil)} dilution by exit you look for ${big(nice(needExit))}+ outcomes and ${pctS(ownMin)}–${pctS(ownTarget)} ownership at ${STAGE_LABEL[stage]}.`;
  const role = tierId === 'family_office' ? 'investment director' : tierId === 'cvc' ? 'investment manager' : tierId === 'nano' ? 'solo GP' : pickR(r, ['partner', 'partner', 'principal']);
  const persona = `A ${role} at ${firm} (${t.label ?? tierId}). ${fundLine} ${TIER_STYLE[tierId] ?? ''} Typical first check ${checkS}${leads ? ', and you lead' : ', usually following a lead'}.`.replace(/\s+/g, ' ').trim();
  const w = { founder: Math.round(15 + 30 * (t.pedigreeWeight ?? 0.4)), market: Math.round(10 + 25 * (t.tamWeight ?? 0.4)), traction: Math.round(10 + 35 * (t.tractionWeight ?? 0.5)), defensibility: 15, efficiency: Math.round(5 + 20 * (t.priceSensitivity ?? 0.4)), deck: 10 }; // [design]
  const dd = t.decisionDays ?? [arch.decisionDaysMin ?? 14, arch.decisionDaysMax ?? 35];
  return {
    name: `${first} ${last}`, firm, email: `${first.toLowerCase()}@${slug}.example`,
    stage: [stage, ...stages.filter((s) => s !== stage)].join(', '), source: 'generated',
    warmPath: warmPathFor(state, r, tierId),
    ...fromArchetype(arch),
    archetypeLabel: `${t.label ?? tierId} · ${KIND_LABEL[kind]}`,
    checkMin, checkMax, capMin, capMax, leads,
    decisionDaysMin: dd[0], decisionDaysMax: dd[1],
    coldReplyRate: t.coldReplyRate ?? arch.coldReplyRate ?? 0.02, warmMeetingRate: t.warmMeetingRate ?? arch.warmMeetingRate ?? 0.3,
    weights: w, thesis, persona,
    fund, sectors: secs.map((s) => s.id), geo: geo?.id ?? null, thesisTags: tags, universeKey: ukey,
  };
}

function angelRecord(state, r, n, tierId, ukey) {
  const t = ANGEL_TIERS[tierId];
  const kind = ANGEL_KIND[tierId] ?? 'angel';
  const arch = baseArchetype(r, kind);
  const stages = angelStages(t);
  const stage = n.stage !== 'any' && stages.includes(n.stage) ? n.stage : pickR(r, stages);
  const ck = t.check ?? t.checkSize ?? [arch.checkMin ?? 10e3, arch.checkMax ?? 50e3];
  const c1 = nice(logU(r, ck[0], Math.max(ck[0] * 1.01, ck[1]))), checkMin = nice(Math.max(ck[0], c1 / 1.6)), checkMax = nice(Math.max(checkMin * 1.3, Math.min(ck[1], c1 * 1.6)));
  // Angels price by feel and by who else is in, not ownership targets [design]: SAFE caps around the stage norm.
  const [capMin, capMax] = stage === 'seed' ? [10e6, 30e6] : [arch.capMin ?? 6e6, arch.capMax ?? 15e6];
  const first = pickR(r, FIRST), last = pickR(r, LAST), a = pickR(r, A_WORDS);
  const firm = kind === 'syndicate' ? `${first} ${last} Syndicate` : kind === 'angel_group' ? `${a} Angel Network` : kind === 'scout' ? `${first} ${last} (scout, ${a} Ventures)` : `${first} ${last} (individual)`;
  const slug = kind === 'angel_group' ? `${a.toLowerCase().replace(/[^a-z]/g, '')}angels` : `${first}${last}`.toLowerCase().replace(/[^a-z]/g, '');
  const specialist = n.sector !== 'any' || r() < 0.5; // angels mostly back what they know [design]
  const secs = pickSectors(r, n, specialist);
  const geo = n.geo !== 'any' ? GEOS.find((g) => g.id === n.geo) : GEOS.length ? weighted(r, GEOS, (g) => g.share ?? 0.1) : null;
  const checkS = `${money(checkMin)}–${money(checkMax)}`;
  const secS = secs.map((s) => s.label).join(', ') || 'software';
  const thesis = `${t.label ?? 'Angel'} writing ${checkS} checks at ${STAGE_LABEL[stage]} into ${secS}${geo ? ` founders in ${geo.label}` : ''}.`;
  const persona = `${first} ${last}, ${(t.label ?? 'an angel').toLowerCase()} investing ${kind === 'syndicate' ? 'LP money through SPVs' : kind === 'angel_group' ? 'alongside a member group' : 'personal money'}: ${checkS} per deal. No fund-returner math: you back founders you believe in, care a lot about who else is in, and move faster when the round has momentum.`;
  return {
    name: kind === 'angel_group' ? `${first} ${last} (screening chair)` : `${first} ${last}`, firm, email: `${first.toLowerCase()}@${slug || 'angel'}.example`,
    stage: [stage, ...stages.filter((s) => s !== stage)].join(', '), source: 'generated',
    warmPath: warmPathFor(state, r, tierId),
    ...fromArchetype(arch),
    archetypeLabel: t.label ?? arch.label,
    checkMin, checkMax, capMin, capMax, leads: false,
    coldReplyRate: t.coldReplyRate ?? arch.coldReplyRate ?? 0.05, warmMeetingRate: t.warmMeetingRate ?? arch.warmMeetingRate ?? 0.4,
    thesis, persona,
    fund: null, angelTier: tierId, followRate: t.followRate ?? null, fomoWeight: t.fomoWeight ?? null, pedigreeWeight: t.pedigreeWeight ?? null,
    sectors: secs.map((s) => s.id), geo: geo?.id ?? null, thesisTags: [specialist ? 'specialist' : 'generalist', 'angel'], universeKey: ukey,
  };
}

/** searchInvestors(state, filters, { page, pageSize }) → a deterministic page of fictional investor records. */
export function searchInvestors(state, filters, { page = 0, pageSize = 10 } = {}) {
  const n = normalizeFilters(filters);
  const key = filterKey(n);
  const seed = universeSeed(state);
  const pop = populations(n);
  const total = Math.round(pop.vc + pop.angel);
  const angelMix = pop.angel + pop.vc > 0 ? (pop.vc > 0 ? Math.min(ANGEL_MAX_MIX, pop.angel / (pop.angel + pop.vc)) : 1) : 0;
  const vcW = vcTierWeights(n), anW = angelTierWeights(n);
  const out = [];
  for (let i = 0; i < pageSize; i++) {
    const idx = page * pageSize + i;
    if (idx >= total) break; // small sub-universes run out: there are only so many dental-software funds in LatAm
    const ukey = `u_${hash(`${seed}|${key}|${idx}`)}`;
    const r = prng(`${seed}|${key}|${idx}`);
    const angel = anW.length && (r() < angelMix || !vcW.length);
    if (angel) out.push(angelRecord(state, r, n, weighted(r, anW, ([, w]) => w)[0], ukey));
    else if (vcW.length) out.push(vcRecord(state, r, n, weighted(r, vcW, ([, w]) => w)[0], ukey));
  }
  return out;
}
