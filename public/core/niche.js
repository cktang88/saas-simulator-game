// Fractal niches: the hidden market lazily spawns deeper sub-niches as the player narrows a search (ICP text, prospect
// filters, recruit target, ad interests, community names, agency searches), and each node gets a "dossier" of realistic
// detail, first generated offline and then progressively researched in the background (web-grounded, disguised, cached).
// Design and API: docs/design/fractal-niches.md.
//
// Layering: this module sits ON TOP of core/truth.js. It never changes truthOf's signature or segment ids. The tree lives in
// state.market.niches (ids, qualifier keys, multipliers, research status: small). Dossier bodies live in the niche cache
// (core/niche-cache.js), never in the save.

import { clamp } from './util.js';
import { ensureMarket } from './market.js';
import { truthOf, segmentMatch, nicheHooks } from './truth.js';
import { getSegment } from '../data/buyer-segments.js';
import { segmentJobs, B2C_PERSONAS, B2C_JOBS, REACH_BASE } from '../data/market-truth.js';
import { US_STATES, OTHER_PLACES, SIZE_BANDS, REVENUE_PER_EMPLOYEE, NATIONAL_COUNT, TOOLS_BY_SEGMENT, TOOLS_BY_GROUP, VOCAB_BY_GROUP, AGENCY_KINDS, GROUP_AGENCY_MULT, TRIGGER_TEMPLATES, INCIDENT_TEMPLATES } from '../data/niche-seeds.js';
import { nicheHash, seeded, fakeName, KEEP_VENDORS, FUDGE_NOTE } from './niche-disguise.js';
import { normalizeDossier } from './niche-research.js';
import { nicheCache } from './niche-cache.js';
import { registerJob, enqueue } from './jobs.js';
import { isLive, getSettings, authHeaders } from './llm.js';
import { isStatic, apiUrl } from './transport.js';
import { browserResearch } from './niche-client.js';
import { b2cCategoryOf } from './churn.js';

const rd = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** Tunables (tests and integrators may override). */
export const nicheConfig = {
  maxLevel: 7, // deepest node (segment = level 1)
  maxNodes: 200, // per save; least-recently-used leaves without research are pruned
  jitter: { pain: 0.25, intensity: 0.25, wtp: 0.25, retention: 0.15, idio: 0.2, reach: 0.25 }, // max relative deviation of a child from its parent
  pocketChance: 0.35, // chance a split has one clearly better ("hair on fire") and one clearly worse cell
  research: { maxLevel: 4, minHits: [1, 1, 2, 2], maxPerDay: 3, maxInFlight: 2, retryAfterDays: 5, maxAttempts: 3, pollTries: 0, pollMs: 1500, maxRunningDays: 7 }, // maxRunningDays [design]: then give up (offline dossier stays)
  live: () => isLive(), // research runs only when this is true (offline: never)
  fetch: null, // injectable fetch for /api/research
  cache: nicheCache, // injectable cache (tests)
  keyModel: null, // model name that goes into nicheKey (default: first configured chat model)
};

// ---------------------------------------------------------------- deterministic stream (same construction as truth.js stream)

function stream(state, key) {
  const m = ensureMarket(state);
  let a = parseInt(nicheHash(`${m.demandSeed ?? 0}:${key}`).slice(0, 8), 16) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'x';

// ---------------------------------------------------------------- state

export function ensureNiches(state) {
  const m = ensureMarket(state);
  m.niches ??= { v: 1, rev: 0, nodes: {}, budget: { day: -1, calls: 0 } };
  return m.niches;
}
const nodesOf = (state) => state.market?.niches?.nodes ?? {};
export const getNode = (state, id) => nodesOf(state)[id] ?? null;
/** Nodes from the segment root down to `id`. */
export function pathOf(state, id) {
  const out = [];
  for (let n = getNode(state, id); n; n = n.parentId ? getNode(state, n.parentId) : null) out.unshift(n);
  return out;
}
export const childrenOf = (state, id) => Object.values(nodesOf(state)).filter((n) => n.parentId === id);

// ---------------------------------------------------------------- qualifier extraction

export const DIM_ORDER = ['sub', 'size', 'geo', 'place', 'role', 'tool', 'trigger'];
const GENERIC_SUB = new Set(['shop', 'shops', 'company', 'companies', 'business', 'businesses', 'clinic', 'office', 'firm', 'store', 'team', 'agency', 'small business']);
const STATES_BY_LEN = US_STATES.map(([n]) => n).sort((a, b) => b.length - a.length);
const PLACES_BY_LEN = OTHER_PLACES.slice().sort((a, b) => b.length - a.length);
const ROLE_RX = /\b((?:vp|head|director|chief|manager)s? of [a-z]+|owners?(?![-\w])|(?:office|practice|operations|general|clinic|store|billing) managers?|controllers?|bookkeepers?|dispatchers?|cfos?|ctos?|coos?|ceos?|founders?|administrators?|principals?)\b/i;
const TRIGGER_RX = /\b(just (?:raised|hired|opened|launched|switched|acquired|moved|lost|failed)(?: [a-z]+){0,2}|recently [a-z]+(?: [a-z]+){0,2}|after (?:an?|the) [a-z]+(?: [a-z]+)?|(?:switching|migrating) (?:from|to) [a-z0-9]+(?: [a-z0-9]+)?|failed an? [a-z]+|(?:getting|got) audited|expanding|opening (?:an? )?new [a-z]+|hiring(?: [a-z]+){0,2}|growing fast)\b/i;
const VENDORS_BY_LEN = [...KEEP_VENDORS].sort((a, b) => b.length - a.length);
const COMMON_CAPS = new Set(['the', 'a', 'an', 'our', 'their', 'my', 'it', 'this', 'that', 'all']);

function sizeBandOf(low) {
  const num = low.match(/(\d[\d,]*)\s*(?:-|–|to)\s*(\d[\d,]*)\s*(employees|people|staff|seats|providers|locations|stores|sites|clinics|chairs|trucks|agents|users)?/);
  if (num) {
    let hi = Number(num[2].replace(/,/g, ''));
    if (/locations|stores|sites|clinics/.test(num[3] ?? '')) hi *= 10;
    return hi <= 10 ? 'micro' : hi <= 50 ? 'small' : hi <= 250 ? 'mid' : 'large';
  }
  const plus = low.match(/(\d[\d,]*)\s*\+\s*(employees|people|staff|seats|locations)?/);
  if (plus) { const n = Number(plus[1].replace(/,/g, '')) * (/locations/.test(plus[2] ?? '') ? 10 : 1); return n <= 10 ? 'micro' : n <= 50 ? 'small' : n <= 250 ? 'mid' : 'large'; }
  if (/\b(multi[- ]?(location|site|clinic|store|unit)|multiple locations|chains?|group practices?|dsos?|mid[- ]?(size|market|sized))\b/.test(low)) return 'mid';
  if (/\b(solo|one[- ]person|sole proprietor|owner[- ]operat\w*|independent|freelanc\w*|micro|mom[- ]and[- ]pop|1[- ]person)\b/.test(low)) return 'micro';
  if (/\b(enterprise|large|fortune \d+)\b/.test(low)) return 'large';
  if (/\b(small|smb|small team)\b/.test(low)) return 'small';
  return null;
}

/**
 * Qualifiers found in a free text, in canonical order: [{ dim, value, label }]. dim: sub (sub-industry word), size, geo (a US state),
 * place (any other place), role, tool, trigger. rootSeg is the truth segment (its keywords give the sub-industry).
 */
export function extractQualifiers(text, rootSeg = null) {
  const orig = String(text ?? '');
  const low = ` ${orig.toLowerCase()} `;
  const out = [];
  // sub-industry: the most specific segment keyword in the text that is not a generic noun
  if (rootSeg) {
    const kws = (rootSeg.keywords ?? []).filter((k) => !(rootSeg.subKeywords ?? []).includes(k) && !GENERIC_SUB.has(k) && k.length >= 4);
    const hits = kws.filter((k) => new RegExp(`(?:^|[^a-z0-9])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(low)).sort((a, b) => b.length - a.length);
    if (hits.length && kws.length >= 3) out.push({ dim: 'sub', value: hits[0], label: hits[0] });
  }
  const size = sizeBandOf(low);
  if (size) out.push({ dim: 'size', value: size, label: SIZE_BANDS.find((b) => b.id === size).label });
  let masked = low;
  for (const st of STATES_BY_LEN) if (new RegExp(`(?:^|[^a-z])${st}(?![a-z])`).test(masked)) { out.push({ dim: 'geo', value: st, label: st.replace(/\b\w/g, (c) => c.toUpperCase()) }); masked = masked.replace(st, ' '); break; }
  if (!out.some((q) => q.dim === 'geo')) {
    const pl = PLACES_BY_LEN.find((p) => new RegExp(`(?:^|[^a-z])${p}(?![a-z])`).test(low));
    if (pl) out.push({ dim: 'place', value: pl, label: pl.length <= 3 ? pl.toUpperCase() : pl.replace(/\b\w/g, (c) => c.toUpperCase()) });
    else {
      const m = orig.match(/\b(?:in|across|around|near|throughout)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
      if (m && !COMMON_CAPS.has(m[1].toLowerCase()) && !KEEP_VENDORS.has(m[1].toLowerCase())) out.push({ dim: 'place', value: m[1].toLowerCase(), label: m[1] });
    }
  }
  const role = low.match(ROLE_RX);
  if (role) { const v = role[1].toLowerCase().replace(/s$/, '').replace(/s of /, ' of '); out.push({ dim: 'role', value: v, label: v }); }
  const tool = VENDORS_BY_LEN.find((v) => new RegExp(`(?:^|[^a-z0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(low));
  if (tool) out.push({ dim: 'tool', value: tool, label: tool.replace(/\b\w/g, (c) => c.toUpperCase()) });
  else {
    const m = orig.match(/\b(?:using|uses?|running|runs)\s+([A-Z][A-Za-z0-9.]+(?:\s[A-Z][A-Za-z0-9.]+)?)/);
    if (m && !COMMON_CAPS.has(m[1].toLowerCase()) && !STATES_BY_LEN.includes(m[1].toLowerCase())) out.push({ dim: 'tool', value: m[1].toLowerCase(), label: m[1] });
  }
  const trig = low.match(TRIGGER_RX);
  if (trig) { const v = trig[1].trim().split(/\s+/).slice(0, 4).join(' '); out.push({ dim: 'trigger', value: v, label: v }); }
  return out.sort((a, b) => DIM_ORDER.indexOf(a.dim) - DIM_ORDER.indexOf(b.dim));
}

// ---------------------------------------------------------------- partitions: how a node splits into cells with consistent stats

const SLOTS = 6;
function cellList(state, parentId, dim) {
  const r = stream(state, `niche:${parentId}:${dim}:shares`);
  if (dim === 'geo') { const tot = US_STATES.reduce((a, [, p]) => a + p, 0); return US_STATES.map(([id, p]) => ({ id, share: p / tot })); }
  if (dim === 'size') return SIZE_BANDS.map((b) => ({ id: b.id, share: b.share, wtpTilt: b.wtp }));
  const w = Array.from({ length: SLOTS }, () => 0.5 + 1.5 * r());
  const tot = w.reduce((a, x) => a + x, 0);
  return w.map((x, i) => ({ id: `s${i}`, share: x / tot }));
}

// u in [-1,1] per cell with weighted mean exactly 0 (so 1 + spread*u averages to exactly 1) and max |u| <= 1.
function centred(r, shares, { base = null, rho = 0, pocket = -1, anti = -1 } = {}) {
  let u = shares.map((_, i) => (i === pocket ? 1 : i === anti ? -1 : rho * (base?.[i] ?? 0) + (1 - rho) * (r() * 2 - 1)));
  const mu = u.reduce((a, x, i) => a + x * shares[i], 0);
  u = u.map((x) => x - mu);
  const mx = Math.max(...u.map(Math.abs), 1e-9);
  return mx > 1 ? u.map((x) => x / mx) : u;
}

/**
 * The full split of a parent node along one dimension: cells [{ id, share, m }] whose share-weighted mean of every multiplier is 1
 * (so child stats average back to the parent). Deterministic in (market seed, parentId, dim). Exposed for tests and UI.
 */
export function partition(state, parentId, dim) {
  const kind = dim === 'place' ? 'place' : dim;
  const cells = cellList(state, parentId, kind);
  const shares = cells.map((c) => c.share);
  const r = stream(state, `niche:${parentId}:${kind}:m`);
  const J = nicheConfig.jitter;
  let pocket = -1, anti = -1;
  if (r() < nicheConfig.pocketChance) { pocket = Math.floor(r() * cells.length); anti = Math.floor(r() * cells.length); if (anti === pocket) anti = -1; }
  const A = centred(r, shares, { pocket, anti });
  const I = centred(r, shares, { base: A, rho: 0.7 });
  const W = centred(r, shares, { base: A, rho: 0.4 });
  const T = centred(r, shares, { base: A, rho: 0.5 });
  const D = centred(r, shares, {});
  const chans = Object.keys(REACH_BASE.smb);
  const R = chans.map(() => centred(r, shares, {}));
  // willingness to pay also follows the size band (bigger buys more): renormalised multiplicatively so the mean stays 1.
  const wRaw = cells.map((c, i) => (1 + J.wtp * W[i]) * (c.wtpTilt ?? 1));
  const wNorm = wRaw.reduce((a, x, i) => a + x * shares[i], 0);
  return cells.map((c, i) => ({
    id: c.id, share: rd(c.share, 6),
    m: {
      pain: rd(1 + J.pain * A[i], 4), intensity: rd(1 + J.intensity * I[i], 4), wtp: rd(wRaw[i] / wNorm, 4), retention: rd(1 + J.retention * T[i], 4), idio: rd(1 + J.idio * D[i], 4),
      reach: Object.fromEntries(chans.map((ch, k) => [ch, rd(1 + J.reach * (R[k][i] * 0.5 + A[i] * 0.2), 4)])),
    },
  }));
}

function cellFor(cells, dim, value) {
  if (dim === 'geo' || dim === 'size') return cells.find((c) => c.id === value) ?? cells[0];
  return cells[parseInt(nicheHash(`cell|${dim}|${value}`).slice(0, 6), 16) % cells.length];
}

// ---------------------------------------------------------------- stats

const memo = new WeakMap();
const rootStats = (seg) => ({ painPrevalence: seg.painPrevalence, intensity: seg.intensity, wtpMonthly: { ...seg.wtpMonthly }, reach: { ...seg.reach }, retentionMult: seg.retentionMult, idiosyncrasy: seg.idiosyncrasy });

function applyM(p, m) {
  const median = p.wtpMonthly.median * m.wtp;
  return {
    painPrevalence: rd(clamp(p.painPrevalence * m.pain, 0.01, 0.95)),
    intensity: rd(clamp(p.intensity * m.intensity, 0.05, 0.98)),
    wtpMonthly: { median: rd(median, 2), sd: rd(median * 0.35, 2) },
    reach: Object.fromEntries(Object.entries(p.reach).map(([ch, v]) => [ch, rd(v * (m.reach[ch] ?? 1), 2)])),
    retentionMult: rd(clamp(p.retentionMult * m.retention, 0.5, 1.5), 3),
    idiosyncrasy: rd(clamp(p.idiosyncrasy * m.idio, 0.05, 0.95), 2),
  };
}

/**
 * { rootId, level, share (of the whole market), shareOfSegment, stats { painPrevalence, intensity, wtpMonthly, reach, retentionMult,
 * idiosyncrasy } } for a niche node (or a plain truth segment id). Derived from the CURRENT truth, so pivots and re-draws flow
 * through; null for an unknown or orphaned node.
 */
export function statsFor(state, id) {
  const t = truthOf(state);
  const rev = state.market?.niches?.rev ?? 0;
  let memoS = memo.get(state);
  if (!memoS || memoS.sig !== t.sig || memoS.rev !== rev) memo.set(state, memoS = { sig: t.sig, rev, map: new Map() });
  if (memoS.map.has(id)) return memoS.map.get(id);
  const seg = t.segments.find((s) => s.id === id);
  let out = null;
  if (seg) out = { rootId: seg.id, level: 1, share: seg.share, shareOfSegment: 1, stats: rootStats(seg) };
  else {
    const n = getNode(state, id);
    const parent = n && statsFor(state, n.parentId);
    if (parent) out = { rootId: parent.rootId, level: n.level, share: parent.share * n.share, shareOfSegment: parent.shareOfSegment * n.share, stats: applyM(parent.stats, n.m) };
  }
  memoS.map.set(id, out);
  return out;
}

/** The stat multipliers of every cell of a split with the resulting child stats and the weighted average (test/inspection helper). */
export function splitStats(state, parentId, dim) {
  const p = statsFor(state, parentId);
  if (!p) return null;
  const cells = partition(state, parentId, dim).map((c) => ({ ...c, stats: applyM(p.stats, c.m) }));
  const avg = (f) => rd(cells.reduce((a, c) => a + c.share * f(c.stats), 0), 4);
  return { parent: p.stats, cells, average: { painPrevalence: avg((s) => s.painPrevalence), intensity: avg((s) => s.intensity), wtp: avg((s) => s.wtpMonthly.median), retentionMult: avg((s) => s.retentionMult), idiosyncrasy: avg((s) => s.idiosyncrasy) } };
}

// ---------------------------------------------------------------- tree

function rootNode(state, segId) {
  const N = ensureNiches(state);
  const t = truthOf(state);
  const seg = t.segments.find((s) => s.id === segId);
  if (!seg) return null;
  return (N.nodes[segId] ??= { id: segId, parentId: null, rootId: segId, level: 1, dim: null, value: null, label: seg.label, share: 1, m: null, hits: 0, firstDay: state.day, lastDay: state.day, source: null, research: null });
}

function childNode(state, parent, q, source) {
  const N = ensureNiches(state);
  const id = `${parent.id}:${q.dim}-${slug(q.value)}`;
  if (N.nodes[id]) return N.nodes[id];
  const cell = cellFor(partition(state, parent.id, q.dim), q.dim, q.value);
  N.rev++;
  const node = N.nodes[id] = { id, parentId: parent.id, rootId: parent.rootId, level: parent.level + 1, dim: q.dim, value: q.value, label: q.label, cell: cell.id, share: cell.share, m: cell.m, hits: 0, firstDay: state.day, lastDay: state.day, source: source ?? null, research: null };
  pruneNodes(state, id); // never prune the node just created (it would come back orphaned, with no stats)
  return node;
}

function pruneNodes(state, keepId = null) {
  const N = state.market.niches;
  const ids = Object.keys(N.nodes);
  if (ids.length <= nicheConfig.maxNodes) return;
  const parents = new Set(Object.values(N.nodes).map((n) => n.parentId));
  const leaves = Object.values(N.nodes).filter((n) => n.level > 1 && n.id !== keepId && !parents.has(n.id) && !n.research).sort((a, b) => a.lastDay - b.lastDay || a.hits - b.hits);
  for (const n of leaves.slice(0, ids.length - nicheConfig.maxNodes)) delete N.nodes[n.id];
  N.rev++;
}

/**
 * Resolve free text to a niche node, creating the nested nodes the text implies (sub-industry, size band, geography,
 * role, tool, trigger, in that fixed order, so word order never matters). Returns the DEEPEST node, or null when the text
 * points at no segment of this market (use pathOf(state, node.id) for the chain).
 *   parentId: continue below an existing node instead of re-matching the segment (qualifiers already on the chain are skipped).
 *   source: who asked ('icp' | 'prospector' | 'interview' | 'ads' | 'community' | 'recruit' | 'agency' ...), kept on new nodes.
 * Deterministic (own streams; never touches rng(state)). Also bumps hit counts and may queue background research (live only).
 */
export function nicheFor(state, text, { parentId = null, source = null } = {}) {
  let cur = parentId && getNode(state, parentId);
  if (!cur) {
    const best = segmentMatch(state, text)[0];
    if (!best || best.score < 0.2) return null;
    cur = rootNode(state, best.segmentId);
    if (!cur) return null;
  }
  const seg = truthOf(state).segments.find((s) => s.id === cur.rootId);
  const used = new Set(pathOf(state, cur.id).map((n) => n.dim));
  const chain = pathOf(state, cur.id);
  for (const q of extractQualifiers(text, seg)) {
    if (cur.level >= nicheConfig.maxLevel) break;
    if (used.has(q.dim)) continue;
    cur = childNode(state, cur, q, source);
    used.add(q.dim);
    chain.push(cur);
  }
  for (const n of chain) { n.hits++; n.lastDay = state.day; if (!n.source && source) n.source = source; }
  pumpResearch(state);
  return cur;
}

/** Deepest EXISTING node that a text resolves to (never creates anything). Null when no node below the segment exists. */
export function deepestExisting(state, text, rootIds = null) {
  const nodes = nodesOf(state);
  if (!Object.keys(nodes).length) return null;
  const t = truthOf(state);
  let best = null;
  for (const root of Object.values(nodes).filter((n) => n.level === 1 && (!rootIds || rootIds.includes(n.id)))) {
    const seg = t.segments.find((s) => s.id === root.id);
    if (!seg) continue;
    let cur = root;
    for (const q of extractQualifiers(text, seg)) {
      const next = nodes[`${cur.id}:${q.dim}-${slug(q.value)}`];
      if (next) cur = next;
    }
    if (cur.level > 1 && (!best || cur.level > best.level)) best = cur;
  }
  return best;
}

// ---------------------------------------------------------------- hooks into truth.js

nicheHooks.version = (state) => { const n = state.market?.niches; return n ? `${n.rev}:${Object.keys(n.nodes).length}` : ''; };
nicheHooks.statsFor = (state, id) => statsFor(state, id);
nicheHooks.focusNode = (state, icp, weights) => {
  const node = deepestExisting(state, icp, Object.keys(weights));
  const s = node && statsFor(state, node.id);
  return s ? { segmentId: node.rootId, stats: s.stats, shareOfSegment: s.shareOfSegment } : null;
};
nicheHooks.flavor = (state, nicheId, r, { hasPain, topJob, ago, role }) => {
  const d = dossierOf(state, nicheId);
  if (!d) return null;
  const pick = (a) => (a.length ? a[Math.floor(r() * a.length)] : null);
  const titles = d.roles.filter((x) => x.role === role).map((x) => x.title);
  const incident = hasPain ? pick(d.incidents) : null;
  const tool = pick(d.tools.filter((x) => !/payment|identity|chat/.test(x.category)));
  return {
    title: titles.length ? pick(titles) : null,
    lastIncident: incident ? `${ago}: ${incident}` : null,
    workaround: hasPain && tool && topJob ? `a spreadsheet next to ${tool.name}, plus manual checks to ${topJob.label.toLowerCase().replace(/^to /, '')}` : null,
  };
};

// ---------------------------------------------------------------- keys

const categoryOf = (state) => `${state.company.model}${state.company.model === 'b2c' ? `:${b2cCategoryOf(state) ?? 'generic'}` : ''}`;
/** The shared cache key of a node's dossier: hex hash of (niche path + researcher model + idea category). Independent of the save. */
export function nicheKey(state, id) {
  const chain = pathOf(state, id);
  if (!chain.length) return null;
  const model = nicheConfig.keyModel ?? getSettings().models?.[0] ?? 'default';
  return nicheHash(`niche|v1|${chain[0].id}|${chain.slice(1).map((n) => `${n.dim}-${slug(n.value)}`).join('/')}|${model}|${categoryOf(state)}`);
}

// ---------------------------------------------------------------- offline dossier

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const lc = (s) => String(s).replace(/^To /, 'to ').replace(/^./, (c) => c.toLowerCase());

/** Deterministic dossier from the seed data (buyer-segments + market-truth + niche-seeds); available instantly for any node. */
export function offlineDossier(state, id) {
  const chain = pathOf(state, id);
  const t = truthOf(state);
  const rootSeg = t.segments.find((s) => s.id === (chain[0]?.id ?? id));
  if (!rootSeg) return null;
  const node = chain[chain.length - 1] ?? { id, level: 1, label: rootSeg.label };
  const st = statsFor(state, id);
  const key = nicheKey(state, id) ?? nicheHash(id);
  const r = seeded(`offline|${key}`);
  const labels = chain.length ? chain.map((n) => n.label) : [rootSeg.label];
  const dims = Object.fromEntries(chain.filter((n) => n.dim).map((n) => [n.dim, n]));
  const base = rootSeg.kind === 'b2b' ? getSegment(rootSeg.baseId) : null;
  const persona = rootSeg.kind === 'b2c' ? B2C_PERSONAS.find((p) => p.id === rootSeg.baseId) : null;
  const jobs = (rootSeg.jobs ?? []).filter((j) => !j.decoy && j.id !== 'core');
  const jobLabel = lc(jobs[0]?.label ?? 'the main job');
  const where = dims.geo ? ` in ${dims.geo.label}` : dims.place ? ` in ${dims.place.label}` : '';
  const d = { description: '', archetypes: [], exampleCompanies: [], roles: [], workflows: [], tools: [], vocabulary: [], painTriggers: [], incidents: [], spend: {}, buying: {}, communities: [], objections: [], seasonality: '', agencies: [], citations: [] };

  if (base) {
    const [elo, ehi] = base.employees;
    const band = dims.size ? SIZE_BANDS.find((b) => b.id === dims.size.value) : null;
    const lo = Math.max(elo, band?.employees[0] ?? elo), hi = Math.max(lo, Math.min(ehi, band?.employees[1] ?? ehi));
    const geoMean = (a, b) => Math.exp((Math.log(Math.max(1, a)) + Math.log(Math.max(1, b))) / 2);
    const cuts = [lo, geoMean(lo, hi) * 0.7 + lo * 0.3, geoMean(lo, hi) * 1.4, hi];
    const rpe = REVENUE_PER_EMPLOYEE[base.group] ?? 150000;
    const [nlo, nhi] = NATIONAL_COUNT[base.group] ?? [10000, 80000];
    const national = Math.exp(Math.log(nlo) + (Math.log(nhi) - Math.log(nlo)) * seeded(`count|${base.id}`)());
    const fracRoot = (st?.shareOfSegment ?? 1) * (rootSeg.sub ? 0.5 : 1);
    const regional = national * fracRoot;
    ['smaller operations', 'typical operations', 'larger or multi-site groups'].forEach((nm, i) => {
      const a = Math.round(cuts[i]), b = Math.max(a, Math.round(cuts[i + 1]));
      const frac = [0.55, 0.33, 0.12][i];
      d.archetypes.push({ name: `${labels[labels.length - 1]}: ${nm}`, sizeBand: `${a}-${b} employees`, employees: { lo: a, hi: b }, revenueUsd: { lo: Math.round(a * rpe * 0.8), hi: Math.round(b * rpe * 1.2) }, countInRegion: { lo: Math.round(regional * frac * 0.8), hi: Math.round(regional * frac * 1.2) }, note: `${where ? `Counts${where}. ` : 'Counts are national. '}Estimates are [design], not statistics.` });
    });
    d.roles = base.committee.map((c) => ({ role: c.role, title: c.titles[0], cares: c.concerns.slice(0, 4) }));
    d.workflows = segmentJobs(base.id, base.group).slice(0, 5).map((j) => `${j.label}: done by hand or in a spreadsheet for most teams`);
    const tools = [...(TOOLS_BY_SEGMENT[base.id] ?? TOOLS_BY_GROUP[base.group] ?? [])];
    if (dims.tool) tools.unshift([dims.tool.label, 'the tool this niche runs on']);
    d.tools = tools.map(([name, category]) => ({ name, category }));
    d.vocabulary = [...(VOCAB_BY_GROUP[base.group] ?? []), ...labels.slice(1).map((l) => l.toLowerCase())];
    d.communities = (base.channels?.works ?? []).slice(0, 5).map((w) => ({ name: w, kind: 'channel', url: '' }));
    d.objections = base.objections ?? [];
    d.seasonality = base.seasonality?.note ?? '';
    const [alo, ahi] = base.acvRange ?? [500, 5000];
    const acvMid = Math.sqrt(alo * ahi);
    d.spend = { problemUsdPerMonth: { lo: Math.round((st?.stats.wtpMonthly.median ?? 50) * 0.6), hi: Math.round((st?.stats.wtpMonthly.median ?? 50) * 2.5) }, softwareUsdPerMonth: { lo: Math.round(alo / 12), hi: Math.round(ahi / 12) }, budgetNorm: base.procurement?.cardLimit > 0 ? `Purchases under ${money(base.procurement.cardLimit)} go on a card without formal approval.` : base.procurement?.quoteThreshold < 1e8 ? `Quotes are needed above ${money(base.procurement.quoteThreshold)}.` : 'Budgets are set once a year and spend above the routine needs a sponsor.' };
    const band2 = acvMid < 5000 ? 'lt5k' : acvMid < 25000 ? 'k5to25' : acvMid < 100000 ? 'k25to100' : 'gt100';
    const cd = base.cycleDays?.[band2] ?? [14, 60];
    d.buying = { process: base.methodology?.why ?? 'A champion trials the tool, then the person who owns the budget approves.', signers: base.committee.filter((c) => c.role === 'economic_buyer' || c.canBlock).map((c) => c.titles[0]).slice(0, 3), cycleDays: { lo: cd[0], hi: cd[1] } };
    d.citations = (base.sourced ?? []).map((s) => ({ url: (s.match(/\((https?:\/\/[^\s,)]+)/) ?? [])[1] ?? '', title: s.slice(0, 100) })).filter((c) => c.url);
    d.agencies = AGENCY_KINDS.map((a) => {
      const mult = a.kind === 'recruiting' ? 1 : (GROUP_AGENCY_MULT[base.group] ?? 1);
      return { name: fakeName(r, a.kind), kind: a.kind, pricing: a.pricing, priceUsd: { lo: Math.round(a.priceUsd[0] * mult), hi: Math.round(a.priceUsd[1] * mult) }, unit: a.unit };
    });
    d.description = `${labels[labels.length - 1]}: ${base.label.toLowerCase()}. The buyer is usually the ${d.roles[0]?.title.toLowerCase() ?? 'owner'}; contracts run about ${money(alo)}-${money(ahi)} a year.${dims.trigger ? ` Typically reached right when they are ${dims.trigger.label}.` : ''}`;
  } else {
    const jobsB = B2C_JOBS[rootSeg.group] ?? B2C_JOBS.generic ?? [];
    d.description = `${labels[labels.length - 1]}: consumers who ${jobLabel}.`;
    d.roles = [{ role: 'consumer', title: 'Consumer', cares: jobsB.slice(0, 3).map((j) => j.label) }];
    d.workflows = jobsB.map((j) => j.label);
    d.tools = [{ name: 'a mix of free apps and notes', category: 'status quo' }];
    d.communities = [{ name: 'Reddit communities for the topic', kind: 'forum', url: '' }, { name: 'Product Hunt', kind: 'launch site', url: 'https://www.producthunt.com' }];
    d.objections = ['Is there a free version?', 'I already do this with an app I have.', 'I do not want another subscription.'];
    d.vocabulary = labels.slice(1).map((l) => l.toLowerCase());
    d.spend = { problemUsdPerMonth: { lo: 0, hi: Math.round((st?.stats.wtpMonthly.median ?? 8) * 2) }, softwareUsdPerMonth: { lo: 0, hi: 15 }, budgetNorm: 'Personal subscriptions are weighed against what a coffee costs.' };
    d.buying = { process: 'Self-serve: they see it, try it, and keep or cancel within a billing cycle.', signers: ['The consumer'], cycleDays: { lo: 0, hi: 7 } };
  }
  const triggers = TRIGGER_TEMPLATES.map((s) => s.replace('{job}', jobLabel));
  d.painTriggers = [...(dims.trigger ? [`They are ${dims.trigger.label}, which exposes how ${jobLabel} is handled.`] : []), ...triggers].slice(0, 6);
  d.incidents = INCIDENT_TEMPLATES.map((s) => s.replace('{job}', jobLabel));
  const out = normalizeDossier(d);
  out.roles.forEach((x, i) => { x.role = d.roles[i]?.role ?? ''; });
  return { ...out, source: 'offline', level: node.level, researchedLevel: 0, disguised: true, fudge: `Offline estimate [design]. ${FUDGE_NOTE}`, key, nodeId: id };
}

/** Researched fields win where non-empty; everything else comes from the offline dossier. */
export function mergeDossier(offline, researched) {
  if (!researched) return offline;
  const out = { ...offline };
  for (const [k, v] of Object.entries(researched)) {
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (!empty && k !== 'nodeId') out[k] = v;
  }
  out.roles = (researched.roles?.length ? researched.roles : offline.roles);
  return out;
}

const offlineMemo = new Map();
/** Sync dossier for a node: the researched one if it is in the memory cache (see warmNiches / loadDossier), else the offline one. Null for unknown ids. */
export function dossierOf(state, id) {
  const key = nicheKey(state, id) ?? null;
  const researched = key ? nicheConfig.cache.peek(key) : null;
  const sig = `${id}|${truthOf(state).sig}|${state.market?.niches?.rev ?? 0}`;
  let off = offlineMemo.get(sig);
  if (!off) { off = offlineDossier(state, id); if (!off) return null; offlineMemo.set(sig, off); if (offlineMemo.size > 120) offlineMemo.delete(offlineMemo.keys().next().value); }
  return mergeDossier(off, researched);
}

/** Async: memory -> IndexedDB -> server cache, merged over the offline dossier (never triggers research). */
export async function loadDossier(state, id) {
  const key = nicheKey(state, id);
  if (key) await nicheConfig.cache.get(key);
  return dossierOf(state, id);
}
/** Load every researched node's dossier into memory (call once after loading a save so dossierOf is complete). */
export async function warmNiches(state) {
  await Promise.all(Object.values(nodesOf(state)).filter((n) => n.research?.status === 'done').map((n) => nicheKey(state, n.id)).filter(Boolean).map((k) => nicheConfig.cache.get(k)));
}

// ---------------------------------------------------------------- background research (client side)

const R = () => nicheConfig.research;
function budget(state) {
  const N = ensureNiches(state);
  if (N.budget.day !== state.day) N.budget = { day: state.day, calls: 0 };
  return N.budget;
}
const inFlight = (state) => Object.values(nodesOf(state)).filter((n) => n.research && (n.research.status === 'pending' || n.research.status === 'running')).length;

/** Nodes that could be researched now (live, depth-gated, parent done, hit-gated, not failed too recently), most-used first. */
export function researchCandidates(state) {
  const nodes = nodesOf(state);
  return Object.values(nodes).filter((n) => {
    if (n.level > R().maxLevel) return false;
    if (n.hits < (R().minHits[n.level - 1] ?? 2)) return false;
    if (n.research && !(n.research.status === 'failed' && state.day - n.research.day >= R().retryAfterDays && (n.research.attempts ?? 1) < R().maxAttempts)) return false;
    const parent = n.parentId ? nodes[n.parentId] : null;
    return !parent || parent.research?.status === 'done';
  }).sort((a, b) => b.hits - a.hits || a.level - b.level);
}

/** Queue research jobs for eligible nodes within the daily and in-flight budgets. No-op offline. Returns the node ids queued. */
export function pumpResearch(state) {
  if (!state.market?.niches || !nicheConfig.live()) return [];
  const b = budget(state);
  const queued = [];
  for (const n of researchCandidates(state)) {
    if (b.calls >= R().maxPerDay || inFlight(state) >= R().maxInFlight) break;
    b.calls++;
    n.research = { status: 'pending', day: state.day, attempts: (n.research?.attempts ?? 0) + 1 };
    enqueue(state, 'niche:research', { nodeId: n.id }, { label: `Researching ${n.label}` });
    queued.push(n.id);
  }
  return queued;
}

const http = (path, init = {}) => (nicheConfig.fetch ?? globalThis.fetch)(apiUrl(path.replace(/^\//, '')), { ...init, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init.headers ?? {}) } });
// Research backend: the server worker (POST /api/research, GET /api/research/:key), or in static mode the in-browser
// queue (core/niche-client.js, persisted in IndexedDB). An injected nicheConfig.fetch (tests) always means the HTTP path.
const localResearch = () => isStatic() && !nicheConfig.fetch;
async function researchRequest(body) {
  if (localResearch()) return browserResearch().request(body);
  return (await http('/api/research', { method: 'POST', body: JSON.stringify(body) })).json();
}
async function researchStatus(key) {
  if (localResearch()) return browserResearch().status(key);
  return (await http(`/api/research/${key}`)).json();
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function seedFactsOf(state, node) {
  const parent = node.parentId ? dossierOf(state, node.parentId) : null;
  const d = parent ?? dossierOf(state, node.id);
  if (!d) return null;
  return { description: d.description, sizes: d.archetypes.map((a) => a.sizeBand), roles: d.roles.map((x) => x.title), tools: d.tools.map((x) => x.name), buying: d.buying?.process };
}

async function markDone(state, node, dossier, key) {
  node.research = { status: 'done', day: state.day, level: node.level, attempts: node.research?.attempts ?? 1 };
  await nicheConfig.cache.put(key, dossier, { server: false }); // the server already holds it
}

const failResearch = (state, node, error) => { node.research = { status: 'failed', day: state.day, error, attempts: node.research?.attempts ?? 1 }; };
// A node stuck 'running' (the server item waits for an API key nobody sends, or the server is unreachable) would count
// against maxInFlight forever and block all other research: give up after maxRunningDays (the offline dossier stays).
const stuck = (state, node) => state.day - (node.research?.day ?? state.day) >= R().maxRunningDays;

async function checkStatus(state, node) {
  const key = nicheKey(state, node.id);
  const hit = await nicheConfig.cache.get(key);
  if (hit) return markDone(state, node, hit.dossier, key);
  let res;
  try { res = await researchStatus(key); } catch { // transient: keep running, try again tomorrow
    if (stuck(state, node)) failResearch(state, node, 'timeout: research server unreachable');
    return;
  }
  if (res.status === 'done' && res.dossier) return markDone(state, node, res.dossier, key);
  if (res.status === 'failed') failResearch(state, node, res.error ?? 'failed');
  else if (res.status === 'unknown') node.research = null; // the server lost it: eligible again
  else if (res.waiting === 'no-key') failResearch(state, node, 'no-key');
  else if (stuck(state, node)) failResearch(state, node, 'timeout');
  else node.research = { ...node.research, status: 'running' };
}

async function researchJob(ctx, { nodeId }) {
  const state = ctx.state;
  const node = getNode(state, nodeId);
  if (!node || node.research?.status === 'done') return;
  const key = nicheKey(state, nodeId);
  node.research = { ...(node.research ?? {}), status: 'pending', day: node.research?.day ?? state.day };
  const hit = await nicheConfig.cache.get(key); // client cache, then server cache, before any research
  if (hit) return markDone(state, node, hit.dossier, key);
  let res;
  try {
    res = await researchRequest({ key, nodePath: pathOf(state, nodeId).map((n) => n.label), depth: node.level, seedFacts: seedFactsOf(state, node), model: getSettings().models?.[0] });
  } catch (e) { res = { status: 'failed', error: `network: ${e.message}` }; }
  if (res.status === 'failed') return failResearch(state, node, res.error ?? 'failed');
  if (res.waiting === 'no-key') return failResearch(state, node, 'no-key'); // queued server-side, but nothing will ever run it
  node.research = { ...node.research, status: 'running' };
  if (res.status === 'done') await checkStatus(state, node);
  for (let i = 0; i < R().pollTries && node.research?.status === 'running'; i++) { await sleep(R().pollMs); await checkStatus(state, node); }
  if (node.research?.status === 'running') schedulePoll(state);
}

function schedulePoll(state) {
  // Only a live poll counts: failed jobs stay in state.jobs for 30 days and must not block polling forever.
  if (state.jobs.some((j) => j.type === 'niche:poll' && (j.status === 'pending' || j.status === 'running'))) return;
  enqueue(state, 'niche:poll', {}, { label: 'Checking niche research', notBefore: state.day + 1 });
}

async function pollJob(ctx) {
  const state = ctx.state;
  for (const n of Object.values(nodesOf(state)).filter((x) => x.research?.status === 'running')) await checkStatus(state, n);
  if (Object.values(nodesOf(state)).some((n) => n.research?.status === 'running')) {
    if (!state.jobs.some((j) => j.type === 'niche:poll' && j.status === 'pending')) enqueue(state, 'niche:poll', {}, { label: 'Checking niche research', notBefore: state.day + 1 });
  }
  pumpResearch(state);
}

registerJob('niche:research', researchJob);
registerJob('niche:poll', pollJob);
export const nicheJobs = { 'niche:research': researchJob, 'niche:poll': pollJob };

/** Summary for the UI / debugging: [{ id, label, level, hits, share, research }] sorted by depth. */
export function nicheSummary(state) {
  return Object.values(nodesOf(state)).map((n) => ({ id: n.id, label: n.label, level: n.level, hits: n.hits, share: statsFor(state, n.id)?.share ?? null, research: n.research?.status ?? null })).sort((a, b) => a.level - b.level || b.hits - a.hits);
}
