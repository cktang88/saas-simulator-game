// Hidden market truth for the early stage (design contract: docs/design/early-stage-truth.md).
//
// Each idea has a hidden market made of segments. Pain is concentrated (one "hair on fire" niche for a decent
// idea, none for a weak one), true WTP is below stated WTP, and the player's ICP text is NOT the truth: the
// ICP only chooses which of the segments you actually sell to (icpFocus). Everything is derived
// deterministically from the market seed + idea key with its OWN stream (never rng(state), so existing seeded
// sims are untouched) and cached in state.market.truth.
//
// Numbers are [design] unless the research docs (docs/research/early-stage/) source them.

import { clamp, hash } from './util.js';
import { MARKET } from './params.js';
import { customerMarketCfg, customerTypeOf, profileOf } from './customer-type.js';
import { ensureMarket, marketDemand } from './market.js';
import { b2cCategoryOf } from './churn.js';
import { BUYER_SEGMENTS, getSegment } from '../data/buyer-segments.js';
import {
  STATED_WTP, POLITENESS, CHANNEL_RELATIONSHIP, REACH_BASE, segmentJobs, DECOYS, SIZE_SUBSEGMENTS, B2C_PERSONAS, B2C_JOBS,
  FREQUENCIES, INCIDENT_MEAN_DAYS, CUSTOM_ASKS, STOPWORDS,
} from '../data/market-truth.js';

// ---------------------------------------------------------------- seeded stream (independent of state.seed)

function stream(state, key) {
  const m = ensureMarket(state);
  let a = parseInt(hash(`${m.demandSeed ?? 0}:${key}`), 36) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = (r) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
const logn = (r, median, sigma) => median * Math.exp(sigma * normal(r));
const between = (r, lo, hi) => lo + (hi - lo) * r();
const choose = (r, arr) => arr[Math.floor(r() * arr.length)];
function shuffle(r, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a; }
const rd = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Hooks registered by core/niche.js (fractal niches) so the truth stays unaware of the tree. With no niche nodes every
 * hook is a no-op and behaviour is identical to before: statsFor(state, nicheId) → stats of that node or null,
 * focusNode(state, icp, weights) → { segmentId, stats, shareOfSegment } | null, flavor(state, nicheId, r) → narrative overrides,
 * version(state) → string that changes when the tree changes (part of the icpFocus cache key).
 */
export const nicheHooks = { statsFor: null, focusNode: null, flavor: null, version: null };

export const ideaKeyOf = (state) => `idea#${state.company.pivots ?? 0}`;
const keysOf = (state) => (ensureMarket(state).truthKeys ??= { restart: 0, pain: 0, biz: 0, zoom: 0 });

const words = (t) => String(t ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w));
const stem = (w) => w.replace(/(ing|ers|er|es|s)$/, '');

// ---------------------------------------------------------------- keyword matching

const RX = new Map();
function kwRx(kw) {
  let rx = RX.get(kw);
  if (!rx) {
    const esc = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Longer keywords are stems (prefix match: reconcil -> reconciliation); short ones must be whole words.
    rx = new RegExp(kw.length >= 6 ? `(?:^|[^a-z0-9])${esc}` : `(?:^|[^a-z0-9])${esc}(?:s|es|ed|ing)?(?![a-z0-9])`);
    RX.set(kw, rx);
  }
  return rx;
}
const kwWeight = (kw) => 1 + 0.5 * (kw.split(/[\s-]+/).length - 1);
function hitSum(text, kws) { let s = 0; for (const k of kws) if (kwRx(k).test(text)) s += kwWeight(k); return s; }

// ---------------------------------------------------------------- segment selection (cached in market.truthSel)

function segmentDescriptor(base, sub) {
  const label = sub ? `${base.label}: ${sub.label}` : base.label;
  return { id: sub ? `${base.id}:${sub.suffix}` : base.id, baseId: base.id, sub: sub?.suffix ?? null, label, kind: 'b2b', group: base.group, keywords: base.keywords, subKeywords: sub?.keywords ?? [], model: base.models };
}
function personaDescriptor(p, cat) {
  return { id: `p:${p.id}`, baseId: p.id, sub: null, label: `${p.label} (${cat.replace(/_/g, ' ')})`, kind: 'b2c', group: cat, keywords: p.keywords, subKeywords: [], model: ['b2c'] };
}

function selectSegments(state, oneLiner) {
  const m = ensureMarket(state);
  const k = keysOf(state);
  const model = state.company.model;
  const r = stream(state, `sel:${k.restart}:${model}:${hash(oneLiner)}`);
  const text = ` ${oneLiner.toLowerCase()} `;
  let segs;
  if (model === 'b2c') {
    const cat = b2cCategoryOf(state) ?? 'generic';
    const pool = B2C_PERSONAS.map((p) => ({ p, aff: hitSum(text, p.keywords) }));
    const n = 4 + Math.floor(r() * 2); // 4-5 personas
    const ordered = [...pool.filter((x) => x.aff > 0), ...shuffle(r, pool.filter((x) => !x.aff))];
    segs = ordered.slice(0, n).map((x) => ({ ...personaDescriptor(x.p, cat), aff: x.aff }));
  } else {
    // A chosen customer type (startups, local SMBs, e-commerce, mid-market, enterprise) decides which buyer segments
    // the hidden market is made of; the one-liner then ranks within them. No type: every segment of the model.
    const allowed = new Set(profileOf(state)?.segmentIds ?? []);
    const scored = BUYER_SEGMENTS.map((s) => ({ s, kw: hitSum(text, s.keywords), fits: allowed.size ? allowed.has(s.id) : s.models.includes(model) }));
    const compat = scored.filter((x) => x.fits);
    // The type's home segment is always in the market (a startup tool's market contains startups).
    const home = profileOf(state)?.defaultSegment;
    if (home) { const h = compat.find((x) => x.s.id === home); if (h && !h.kw) h.kw = 0.5; }
    const hit = compat.filter((x) => x.kw > 0).sort((a, b) => b.kw - a.kw);
    const base = hit.slice(0, 2);
    const have = () => new Set(base.map((x) => x.s.id));
    // Adjacent segments in the same group as the best match (or anywhere if nothing matched) and one wildcard from elsewhere.
    const anchorGroup = base[0]?.s.group;
    const adjacent = shuffle(r, compat.filter((x) => !have().has(x.s.id) && (!anchorGroup || x.s.group === anchorGroup)));
    const target = 3 + Math.floor(r() * 2); // 3-4 base segments
    while (base.length < target - 1 && adjacent.length) base.push(adjacent.shift());
    const wild = shuffle(r, compat.filter((x) => !have().has(x.s.id)));
    if (wild.length) base.push(wild[0]);
    while (base.length < 3 && wild.length > base.length) base.push(wild[base.length]);
    segs = [];
    base.forEach((x, i) => {
      if (i === 0) SIZE_SUBSEGMENTS.forEach((sub) => segs.push({ ...segmentDescriptor(x.s, sub), aff: x.kw, shareFrac: sub.shareFrac }));
      else segs.push({ ...segmentDescriptor(x.s, null), aff: x.kw, shareFrac: 1 });
    });
    if (segs.length < 7 && base.length > 1 && r() < 0.4) { // one more size split on the second segment
      const i = segs.findIndex((s) => s.baseId === base[1].s.id);
      const b = base[1];
      segs.splice(i, 1, ...SIZE_SUBSEGMENTS.map((sub) => ({ ...segmentDescriptor(b.s, sub), aff: b.kw, shareFrac: sub.shareFrac })));
    }
  }
  // Shares: random weights per base segment, split between its sub-segments.
  const baseW = new Map();
  for (const s of segs) if (!baseW.has(s.baseId)) baseW.set(s.baseId, between(r, 0.5, 2));
  const tot = [...baseW.values()].reduce((a, v) => a + v, 0);
  for (const s of segs) s.share = rd((baseW.get(s.baseId) / tot) * (s.shareFrac ?? 1), 4);
  const sum = segs.reduce((a, s) => a + s.share, 0);
  for (const s of segs) { s.share = rd(s.share / sum, 4); delete s.shareFrac; }
  return { restart: k.restart, model, ctype: customerTypeOf(state), hasIdea: !!oneLiner.trim(), oneLiner, segs };
}

// ---------------------------------------------------------------- jobs

function jobTemplates(seg, state) {
  if (seg.kind === 'b2c') return B2C_JOBS[seg.group] ?? B2C_JOBS.generic;
  return segmentJobs(seg.baseId, seg.group); // segments whose buyers do different work than their group have their own
}

function buildJobs(state, seg, strengthClass, ideaTokens, r, zoom) {
  const tmpl = jobTemplates(seg, state);
  const top = (strengthClass === 'strong');
  // Templates whose keywords overlap the idea come first; the rest are shuffled in behind.
  const ideaText = ideaTokens.join(' ');
  const rel = tmpl.map((t) => ({ t, o: hitSum(` ${ideaText} `, t.keywords) }));
  const ordered = [...rel.filter((x) => x.o > 0).sort((a, b) => b.o - a.o), ...shuffle(r, rel.filter((x) => !x.o))].map((x) => x.t);
  const picks = ordered.slice(0, 3);
  const jobs = [];
  const coreKw = ideaTokens;
  // The idea's own job. In a strong segment the real pain is sometimes an ADJACENT job, not the one pitched (~40%).
  const adjacentIsTop = top && picks.length > 1 && r() < 0.4;
  const base = { strong: [0.88, 0.97], moderate: [0.5, 0.7], weak: [0.25, 0.45] }[strengthClass];
  const coreImp = adjacentIsTop ? between(r, 0.45, 0.65) : between(r, base[0], base[1]);
  jobs.push({ id: 'core', label: 'The job this idea is built around', keywords: coreKw, need: Math.min(2, Math.max(1, Math.ceil(coreKw.length / 3))), importance: rd(coreImp) });
  picks.forEach((t, i) => {
    const imp = adjacentIsTop && i === 0 ? between(r, 0.85, 0.97) : between(r, base[0] * 0.55, base[1] * (i === 0 ? 0.9 : 0.7));
    jobs.push({ ...t, importance: rd(clamp(imp, 0.05, 0.99)) });
  });
  for (const d of shuffle(r, DECOYS).slice(0, 2)) jobs.push({ ...d, importance: rd(between(r, 0.08, 0.25)), decoy: true });
  // Zoom pivots re-weight: zoom-in concentrates importance on the top job, zoom-out flattens it.
  if (zoom) {
    const sorted = jobs.filter((j) => !j.decoy).sort((a, b) => b.importance - a.importance);
    sorted.forEach((j, i) => { j.importance = rd(clamp(j.importance * (i === 0 ? 1 + 0.12 * zoom : 1 - 0.1 * zoom), 0.05, 0.99)); });
  }
  return jobs;
}

// ---------------------------------------------------------------- truth generation

const SIZE_BY = Object.fromEntries(SIZE_SUBSEGMENTS.map((s) => [s.suffix, s]));

function generate(state, prev) {
  const m = ensureMarket(state);
  const demand = marketDemand(state);
  const k = keysOf(state);
  const ideaKey = ideaKeyOf(state);
  const model = state.company.model;
  const cur = (state.company.oneLiner ?? '').trim();
  let sel = m.truthSel;
  if (!sel || sel.restart !== k.restart || sel.model !== model || (sel.ctype ?? null) !== customerTypeOf(state) || sel.hasIdea !== !!cur) sel = m.truthSel = selectSegments(state, cur);
  const painSig = `${ideaKey}|${k.pain}`;
  const idea = prev && prev.painSig === painSig ? prev.generatedFor.oneLiner : cur;
  const ideaTokens = [...new Set(words(idea).map(stem))].slice(0, 8);
  const rP = stream(state, `${painSig}:pain`);
  const n = sel.segs.length;

  // Who is the hair-on-fire segment? Mostly the best keyword match, but 30% of the time a segment the
  // one-liner does not hint at (the real niche is often narrower or different than the stated ICP).
  const weights = sel.segs.map((s) => 0.4 + s.aff);
  let bestIdx;
  if (rP() < 0.3) bestIdx = Math.floor(rP() * n);
  else { let x = rP() * weights.reduce((a, v) => a + v, 0); bestIdx = 0; for (let i = 0; i < n; i++) { x -= weights[i]; if (x <= 0) { bestIdx = i; break; } } }
  const others = shuffle(rP, sel.segs.map((_, i) => i).filter((i) => i !== bestIdx));
  const moderate = new Set(others.slice(0, rP() < 0.5 ? 2 : 1));
  const hasStrong = demand >= 0.3; // weak ideas (low demandScale) have no strong segment [design]
  const k1 = clamp((demand - 0.3) / 0.9, 0, 1);
  const kw = clamp(demand / 0.3, 0, 1);

  const refPrice = customerMarketCfg(MARKET[model], model, customerTypeOf(state))?.refPrice ?? 50;
  const reach0 = REACH_BASE[model] ?? REACH_BASE.smb;
  const segments = sel.segs.map((s, i) => {
    const r = stream(state, `${painSig}:${s.id}`);
    const rW = stream(state, `${ideaKey}|${k.biz}:wtp:${s.id}`);
    let cls = i === bestIdx ? (hasStrong ? 'strong' : 'moderate') : moderate.has(i) ? 'moderate' : 'weak';
    let prevalence, intensity;
    if (cls === 'strong') { prevalence = 0.5 + 0.3 * k1 + between(r, -0.04, 0.04); intensity = 0.7 + 0.25 * k1 + between(r, -0.03, 0.03); }
    else if (i === bestIdx) { prevalence = 0.12 + 0.18 * kw + between(r, -0.02, 0.04); intensity = 0.3 + 0.2 * kw + between(r, -0.03, 0.03); } // weak idea's best
    else if (cls === 'moderate') { prevalence = between(r, 0.2, 0.4) * (0.5 + 0.5 * kw); intensity = hasStrong ? between(r, 0.4, 0.65) : between(r, 0.3, 0.55); }
    else { prevalence = between(r, 0.03, 0.15); intensity = between(r, 0.15, 0.4); }
    prevalence = clamp(prevalence, 0.01, 0.9); intensity = clamp(intensity, 0.05, 0.98);
    const jobClass = hasStrong || i !== bestIdx ? cls : 'moderate';
    const jobs = buildJobs(state, s, jobClass, ideaTokens, r, k.zoom);
    const frequency = intensity > 0.8 ? choose(r, ['daily', 'daily', 'weekly']) : intensity > 0.55 ? choose(r, ['daily', 'weekly', 'weekly', 'monthly']) : choose(r, ['weekly', 'monthly', 'monthly', 'rare']);
    const sizeAdj = s.sub ? SIZE_BY[s.sub] : null;
    const persona = s.kind === 'b2c' ? B2C_PERSONAS.find((p) => p.id === s.baseId) : null;
    const wtpMedian = logn(rW, refPrice * (0.55 + 0.9 * intensity) * (sizeAdj?.wtpMult ?? persona?.wtpMult ?? 1), 0.18);
    const base = s.kind === 'b2b' ? getSegment(s.baseId) : null;
    const entish = model === 'ent';
    const budgetOwner = sizeAdj?.budgetOwner ?? persona?.budgetOwner ?? (entish ? choose(rW, ['exec', 'procurement', 'manager']) : choose(rW, ['user', 'user', 'manager']));
    const buyerIsUser = sizeAdj ? sizeAdj.buyerIsUser : rW() < (s.kind === 'b2c' ? 0.97 : entish ? 0.35 : 0.7);
    const idio = clamp((entish ? 0.45 : 0.25) + (['public', 'regulated', 'education'].includes(s.group) ? 0.15 : 0) + between(r, -0.15, 0.25), 0.05, 0.95);
    const reach = {};
    for (const ch of Object.keys(reach0)) reach[ch] = rd(reach0[ch] * between(r, 0.75, 1.3) * (ch === 'cold' && (base?.group === 'owner_smb') ? 0.8 : 1), 2);
    return {
      id: s.id, baseId: s.baseId, label: s.label, kind: s.kind, group: s.group, keywords: [...s.keywords, ...(s.subKeywords ?? [])], subKeywords: s.subKeywords ?? [],
      share: s.share, painClass: cls,
      painPrevalence: rd(prevalence), intensity: rd(intensity), frequency,
      wtpMonthly: { median: rd(wtpMedian, 2), sd: rd(wtpMedian * 0.35, 2) },
      budgetOwner, buyerIsUser, jobs, reach,
      retentionMult: rd(clamp((0.6 + 0.9 * intensity * (0.6 + 0.6 * prevalence)) * (persona?.retention ?? 1), 0.5, 1.5), 3),
      idiosyncrasy: rd(idio, 2),
    };
  });
  const bestSegmentId = segments.reduce((b, s) => (s.painPrevalence * s.intensity > b.v ? { v: s.painPrevalence * s.intensity, id: s.id } : b), { v: -1, id: null }).id;
  const sig = `${ideaKey}|${k.restart}|${k.pain}|${k.biz}|${k.zoom}|${model}|${customerTypeOf(state) ?? ''}|${sel.hasIdea ? 1 : 0}|${rd(demand, 4)}`;
  return { sig, painSig, ideaKey, generatedFor: { oneLiner: idea, model }, demandScale: demand, segments, bestSegmentId, segSel: sel.segs.map((s) => s.id) };
}

/** The hidden market for the current idea (lazy, deterministic, cached in state.market.truth). */
export function truthOf(state) {
  const m = ensureMarket(state);
  const demand = marketDemand(state); // also fixes m.demandSeed
  const k = keysOf(state);
  const cur = !!(state.company.oneLiner ?? '').trim();
  const sig = `${ideaKeyOf(state)}|${k.restart}|${k.pain}|${k.biz}|${k.zoom}|${state.company.model}|${customerTypeOf(state) ?? ''}|${cur ? 1 : 0}|${rd(demand, 4)}`;
  if (m.truth && m.truth.sig === sig) return m.truth;
  m.truth = generate(state, m.truth);
  m.truthFocus = null;
  return m.truth;
}

const segOf = (t, id) => t.segments.find((s) => s.id === id) ?? null;
export const painStrength = (s) => s.painPrevalence * s.intensity;

// ---------------------------------------------------------------- matching a text to segments

/** Which truth segments does a text (ICP, a title, a company or industry) point at? [{segmentId, score 0..1}] best first. */
export function segmentMatch(state, text) {
  const t = truthOf(state);
  const low = ` ${String(text ?? '').toLowerCase()} `;
  const out = [];
  for (const s of t.segments) {
    const base = hitSum(low, s.keywords.filter((k) => !s.subKeywords.includes(k)));
    const sub = s.subKeywords.length ? hitSum(low, s.subKeywords) : 0;
    let x;
    if (s.subKeywords.length) x = sub > 0 ? base + 1.5 * sub : base * 0.6; // the matching size band wins, the other is a faint match
    else x = base;
    if (!base && sub) x = 0.5 * sub;
    if (x > 0) out.push({ segmentId: s.id, score: rd(1 - Math.exp(-x), 3) });
  }
  return out.sort((a, b) => b.score - a.score);
}

const BROAD = /\b(everyone|everybody|anyone|anybody|all (businesses|companies|people|teams|users)|any (business|company|team)|businesses of all sizes|the general public|the mass market|people who|smbs?\b(?! (with|in|that)))/i;
const isBroadText = (t) => !String(t ?? '').trim() || BROAD.test(String(t)) || words(t).length < 3;

function outsiderHit(state, text) {
  const t = truthOf(state);
  const inSet = new Set(t.segments.map((s) => s.baseId));
  const low = ` ${String(text ?? '').toLowerCase()} `;
  if (t.segments[0]?.kind === 'b2c') return B2C_PERSONAS.some((p) => !inSet.has(p.id) && hitSum(low, p.keywords) > 0);
  return BUYER_SEGMENTS.some((s) => !inSet.has(s.id) && hitSum(low, s.keywords) > 0);
}

/**
 * How well the current ICP targets the truth: which segments you actually sell to and how narrowly.
 * { segmentIds, weights {id: w, sums to 1}, breadth (share of the market targeted), bestScore, outsider, diffuse,
 *   strength (weighted pain x intensity), relative (vs the whole market average), retention, wtp, demandMult, churnMult }
 * With no idea or no ICP text the focus is neutral (multipliers 1).
 */
export function icpFocus(state) {
  const m = ensureMarket(state);
  const t = truthOf(state);
  const icp = String(state.company.icp ?? '');
  const key = `${t.sig}|${icp}${nicheHooks.version ? `|${nicheHooks.version(state)}` : ''}`;
  if (m.truthFocus?.key === key) return m.truthFocus.val;
  const all = t.segments;
  const meanStrength = all.reduce((a, s) => a + s.share * painStrength(s), 0) || 1e-6;
  const meanRet = all.reduce((a, s) => a + s.share * s.retentionMult, 0) || 1;
  const meanWtp = all.reduce((a, s) => a + s.share * s.wtpMonthly.median, 0) || 1;
  const hasIdea = !!(state.company.oneLiner ?? '').trim();
  let weights = {}, outsider = false, diffuse = false, bestScore = 0, segmentIds = [];
  if (!hasIdea || !icp.trim()) { diffuse = true; for (const s of all) weights[s.id] = s.share; }
  else {
    const matches = segmentMatch(state, icp).filter((x) => x.score >= 0.2);
    if (matches.length) {
      bestScore = matches[0].score;
      const keep = matches.filter((x) => x.score >= 0.5 * bestScore);
      let tot = 0; for (const x of keep) tot += x.score;
      for (const x of keep) weights[x.segmentId] = x.score / tot;
      segmentIds = keep.map((x) => x.segmentId);
    } else if (!isBroadText(icp) && outsiderHit(state, icp)) outsider = true;
    else { diffuse = true; for (const s of all) weights[s.id] = s.share; }
  }
  if (diffuse) segmentIds = all.map((s) => s.id);
  // A broad ICP sells to whoever shows up, and people with the problem self-select: value weights lean toward pain.
  const valueWeights = {};
  if (diffuse) { let tot = 0; for (const sg of all) tot += sg.share * (0.25 + painStrength(sg)); for (const sg of all) valueWeights[sg.id] = (sg.share * (0.25 + painStrength(sg))) / tot; }
  let strength, retention, wtp;
  if (outsider) { strength = meanStrength * 0.15; retention = meanRet * 0.8; wtp = meanWtp * 0.5; }
  else {
    strength = 0; retention = 0; wtp = 0;
    // A narrower niche the player has resolved (core/niche.js) replaces its parent segment's stats for that segment.
    const fn = hasIdea && icp.trim() && nicheHooks.focusNode ? nicheHooks.focusNode(state, icp, weights) : null;
    for (const [id, w] of Object.entries(weights)) { const s = fn && fn.segmentId === id ? { ...segOf(t, id), ...fn.stats } : segOf(t, id); strength += w * painStrength(s); retention += w * s.retentionMult; wtp += w * s.wtpMonthly.median; }
  }
  const nicheNode = !outsider && !diffuse && icp.trim() && nicheHooks.focusNode ? nicheHooks.focusNode(state, icp, weights) : null;
  const breadth = outsider ? 0 : segmentIds.reduce((a, id) => a + (segOf(t, id)?.share ?? 0) * (nicheNode && nicheNode.segmentId === id ? nicheNode.shareOfSegment : 1), 0);
  const relative = strength / meanStrength;
  // Conversion and churn follow the segment you actually reach, relative to the market average (a broad ICP = 1).
  const demandMult = !hasIdea || !icp.trim() ? 1 : Math.pow(clamp(relative, 0.25, 1.8), 0.8);
  const churnMult = !hasIdea || !icp.trim() ? 1 : clamp(Math.pow(1 / clamp(relative, 0.25, 3), 0.35) * (meanRet / Math.max(0.3, retention)), 0.55, 2);
  const val = { segmentIds, weights, valueWeights: diffuse ? valueWeights : weights, breadth: rd(breadth), bestScore, outsider, diffuse, strength: rd(strength), relative: rd(relative), retention: rd(retention), wtp: rd(wtp, 2), demandMult: rd(demandMult), churnMult: rd(churnMult) };
  m.truthFocus = { key, val };
  return val;
}

/** True monthly WTP of the segments you target (null with no idea stated). */
export function trueWtp(state) {
  if (!(state.company.oneLiner ?? '').trim()) return null;
  return icpFocus(state).wtp;
}

/** Judge-cache key: LLM feature judgments are only valid for the ICP and idea they were made against. */
export const judgeKey = (state) => hash(`${state.company.icp ?? ''}|${state.company.oneLiner ?? ''}|${ideaKeyOf(state)}`);

// ---------------------------------------------------------------- people

const ROLE_FALLBACK = [{ role: 'user', titles: ['Team member'], presentProb: 0.6 }, { role: 'economic_buyer', titles: ['Owner'], presentProb: 0.4 }];
const OUTSIDER_ROLES = ['Analyst at an unrelated company', 'Consultant', 'Student researching the space', 'Product manager elsewhere', 'Friend of a friend'];

/**
 * A hidden person. segmentId: a truth segment id or 'outsider'. channel: friends|family|warm|community|cold|panel|investor|founder.
 * relationship / idiosyncratic force those traits (otherwise derived from channel / the segment). screened: the recruiter asked a pain screener (filters ~65% of people without the problem). seedKey: any string that keeps
 * the draw reproducible (defaults to a per-market counter, deterministic in call order).
 */
export function drawPerson(state, { segmentId = 'outsider', nicheId = null, channel = 'cold', screened = false, seedKey = null, relationship = null, idiosyncratic = null } = {}) {
  const m = ensureMarket(state);
  const t = truthOf(state);
  const key = seedKey ?? `n${m.personN = (m.personN ?? 0) + 1}`;
  const nstats = nicheId && nicheHooks.statsFor ? nicheHooks.statsFor(state, nicheId) : null; // a niche node: narrower stats than its segment
  if (nstats) segmentId = nstats.rootId;
  const r = stream(state, `${t.ideaKey}:person:${key}:${segmentId}:${channel}${nstats ? `:${nicheId}` : ''}`);
  const rel = relationship ?? CHANNEL_RELATIONSHIP[channel] ?? 'stranger';
  const baseSeg = segmentId === 'outsider' ? null : segOf(t, segmentId);
  const seg = baseSeg && nstats ? { ...baseSeg, ...nstats.stats } : baseSeg;
  const outsider = !seg;
  const opinionOnly = rel === 'investor' || rel === 'founder';
  const politeness = clamp((POLITENESS[rel] ?? 0.25) + between(r, -0.05, 0.05), 0, 0.95);
  const statedWtpMult = clamp(logn(r, STATED_WTP.median, STATED_WTP.sigma), 0.6, STATED_WTP.cap);
  const refPrice = MARKET[state.company.model]?.refPrice ?? 50;
  // Pain: only real segment members have it, never because they are warm; a screener raises the share who do.
  let pPain = outsider ? 0.04 : seg.painPrevalence;
  if (screened && !outsider) pPain = pPain / (pPain + (1 - pPain) * 0.35);
  const hasPain = !opinionOnly && r() < pPain;
  const roles = (seg?.kind === 'b2b' ? getSegment(seg.baseId)?.committee : null) ?? ROLE_FALLBACK;
  let roleDef = roles.find((x) => r() < (x.presentProb ?? 0.5)) ?? roles[0];
  if (seg?.kind === 'b2c') roleDef = { role: 'consumer', titles: ['Consumer'] };
  const role = outsider ? 'outsider' : roleDef.role;
  const isBuyer = outsider ? false : seg.kind === 'b2c' ? true : role === 'economic_buyer' || (seg.buyerIsUser && role === 'user');
  const budgetAuthority = !outsider && isBuyer && (seg.budgetOwner === 'user' || role === 'economic_buyer');
  // Outsiders rarely have the problem; when they do it is mild and they would pay little [design].
  const pseg = seg ?? { intensity: 0.3, frequency: 'monthly', wtpMonthly: { median: refPrice * 0.3 } };
  const painIntensity = hasPain ? clamp(pseg.intensity + 0.12 * normal(r), 0.1, 1) : 0;
  const frequency = hasPain ? pseg.frequency : choose(r, ['rare', 'monthly']);
  const lastIncidentDays = hasPain ? Math.max(0, Math.round(-INCIDENT_MEAN_DAYS[frequency] * Math.log(Math.max(1e-6, r())))) : null;
  const realJobs = seg ? seg.jobs.filter((j) => !j.decoy) : [];
  const jobsRanked = (seg ? seg.jobs : DECOYS.map((d) => ({ ...d, importance: 0.15, decoy: true })))
    .map((j) => ({ id: j.id, label: j.label, importance: rd(clamp(j.importance + (hasPain ? 0.1 : -0.1) * normal(r), 0, 1)), decoy: !!j.decoy }))
    .sort((a, b) => (hasPain ? b.importance - a.importance : (b.decoy ? 1 : 0) - (a.decoy ? 1 : 0) || b.importance - a.importance));
  const wtpTrue = hasPain && isBuyer ? Math.max(0, logn(r, pseg.wtpMonthly.median, 0.35)) : hasPain ? 0.3 * Math.max(0, logn(r, pseg.wtpMonthly.median, 0.35)) : 0; // non-buyers and people without pain never pay
  const topJob = realJobs.slice().sort((a, b) => b.importance - a.importance)[0];
  // The last incident is a sentence the person can say (persona-prompts.js speaks it); the day count stays numeric for callers.
  const ago = lastIncidentDays == null ? '' : lastIncidentDays <= 1 ? 'yesterday' : lastIncidentDays < 14 ? `${lastIncidentDays} days ago` : lastIncidentDays < 60 ? `about ${Math.round(lastIncidentDays / 7)} weeks ago` : `about ${Math.round(lastIncidentDays / 30)} months ago`;
  const jobPhrase = topJob && topJob.id !== 'core' ? topJob.label.toLowerCase().replace(/^to /, '') : 'get the main job done';
  const lastIncident = hasPain ? `${ago}, trying to ${jobPhrase} went wrong and somebody had to fix it by hand` : null;
  const wantsAsk = !outsider && !opinionOnly && r() < seg.idiosyncrasy * 0.6;
  const askText = choose(r, CUSTOM_ASKS);
  const idiosyncraticAsk = (idiosyncratic ?? wantsAsk) ? askText : null; // plain text; worth ~0 to the rest of the segment
  const nPriorities = 1 + Math.floor(r() * (state.company.model === 'ent' ? 4 : 3));
  const competingPriorities = shuffle(r, ['hiring', 'a deadline this quarter', 'a bigger fire at work', 'budget freeze', 'a tool migration', 'seasonal rush', 'a family matter']).slice(0, nPriorities);
  const fl = nstats && nicheHooks.flavor && !outsider ? nicheHooks.flavor(state, nicheId, stream(state, `${t.ideaKey}:flavor:${key}:${nicheId}`), { hasPain, topJob, ago, role }) : null;
  return {
    ...(nstats ? { nicheId } : {}),
    segmentId: outsider ? 'outsider' : seg.id, role, title: outsider ? choose(r, OUTSIDER_ROLES) : (fl?.title ?? choose(r, roleDef.titles ?? ['Team member'])),
    isBuyer, budgetAuthority, hasPain, painIntensity: rd(painIntensity), frequency, lastIncident: fl?.lastIncident && hasPain ? fl.lastIncident : lastIncident, lastIncidentDays,
    workaround: hasPain && topJob ? (fl?.workaround ?? `a spreadsheet plus manual checks to ${jobPhrase}`) : null,
    workaroundCostMonthly: hasPain ? rd(Math.max(0, logn(r, (pseg.wtpMonthly.median || refPrice) * 1.2, 0.5)), 2) : 0,
    wtpTrue: rd(wtpTrue, 2), statedWtpMult: rd(statedWtpMult, 2), statedWtp: rd(wtpTrue * statedWtpMult, 2),
    politeness: rd(politeness), idiosyncraticAsk, jobsRanked, competingPriorities, relationship: rel,
    opinion: opinionOnly ? { aboutIdea: true, confidence: rd(between(r, 0.7, 0.9)) } : null,
    reachMult: seg ? seg.reach[channel] ?? 1 : 0.5,
  };
}

// ---------------------------------------------------------------- feature value

const featureText = (f) => ` ${f.title ?? ''} ${f.user ?? ''} ${f.problem ?? ''} ${f.solution ?? ''} `.toLowerCase();
function jobScoreOf(text, seg) {
  const s = seg.jobs.map((j) => ({ j, m: Math.min(1, hitSum(text, j.keywords) / (j.need ?? 2)) * j.importance })).sort((a, b) => b.m - a.m);
  return clamp((s[0]?.m ?? 0) + 0.25 * (s[1]?.m ?? 0), 0, 1);
}

/**
 * Market value 0..1 of one feature for the segments you actually target (icpFocus), from the segments' real jobs
 * and pain. segmentValues covers every segment so callers can see where it would sell. idiosyncratic: a request from
 * a single account that matches no segment job (worth ~nothing to the rest of the market).
 */
export function featureValue(state, feature) {
  const t = truthOf(state);
  const focus = icpFocus(state);
  const text = featureText(feature);
  const segmentValues = {};
  for (const s of t.segments) {
    const painNorm = clamp(painStrength(s) / 0.55, 0.05, 1);
    segmentValues[s.id] = rd(painNorm * (0.2 + 0.8 * jobScoreOf(text, s)));
  }
  const idiosyncratic = (feature.requestedBy != null || feature.custom === true) && Math.max(...t.segments.map((s) => jobScoreOf(text, s))) < 0.25;
  let value = 0;
  if (focus.outsider) value = 0.1 * Math.max(...Object.values(segmentValues));
  else for (const [id, w] of Object.entries(focus.valueWeights)) value += w * (segmentValues[id] ?? 0);
  if (idiosyncratic) value *= 0.15;
  return { value: rd(clamp(value, 0, 1)), segmentValues, idiosyncratic };
}

// ---------------------------------------------------------------- PMF truth

/**
 * Sean Ellis "very disappointed" share and the long-run retention plateau of a segment (default: the targeted mix)
 * given the product you have now (market.fit.product.score).
 */
export function pmfTruth(state, segmentId = null) {
  const t = truthOf(state);
  const fit = ensureMarket(state).fit.product.score ?? 0;
  const fitTerm = clamp(fit / 0.7, 0, 1.2);
  const one = (s) => {
    const vd = 0.8 * s.painPrevalence * (0.35 + 0.65 * s.intensity) * fitTerm;
    return { veryDisappointed: clamp(vd, 0, 0.9), retentionFloor: clamp((0.08 + 0.6 * vd) * Math.min(1.25, s.retentionMult), 0, 0.85) };
  };
  if (segmentId) { const s = segOf(t, segmentId); return s ? { segmentId, ...rdObj(one(s)) } : { segmentId, veryDisappointed: 0, retentionFloor: 0 }; }
  const f = icpFocus(state);
  let vd = 0, rf = 0;
  if (f.outsider) return { segmentId: null, veryDisappointed: 0.03, retentionFloor: 0.03 };
  for (const [id, w] of Object.entries(f.weights)) { const x = one(segOf(t, id)); vd += w * x.veryDisappointed; rf += w * x.retentionFloor; }
  return { segmentId: null, veryDisappointed: rd(vd), retentionFloor: rd(rf) };
}
const rdObj = (o) => ({ veryDisappointed: rd(o.veryDisappointed), retentionFloor: rd(o.retentionFloor) });

// ---------------------------------------------------------------- pivots

/**
 * Apply the truth side of a pivot (core/pivots.js registerChange calls this after the company fields changed):
 *   segment: truth retained (only the ICP focus changes); problem: pain and jobs re-drawn, segment list kept;
 *   zoom_in / zoom_out: job importances re-weighted; business_model: wtp and budget owners re-drawn (segment list
 *   re-picked if B2B<->B2C); full_restart: everything re-drawn; channel / pricing: truth untouched.
 * Stale LLM feature judgments are always invalidated.
 */
export function onPivot(state, { type } = {}) {
  const k = keysOf(state);
  const m = ensureMarket(state);
  switch (type) {
    case 'problem': k.pain++; break;
    case 'zoom_in': k.zoom = clamp(k.zoom + 1, -3, 3); break;
    case 'zoom_out': k.zoom = clamp(k.zoom - 1, -3, 3); break;
    case 'business_model': k.biz++; m.fit.price.wtp = null; break;
    case 'full_restart': k.restart++; k.pain++; k.biz++; k.zoom = 0; m.fit.price.wtp = null; m.fit.website.score = null; break;
    default: break;
  }
  for (const f of state.apps?.product?.features ?? []) { delete f.valueLLM; delete f.valueReason; delete f.valueKey; }
}
