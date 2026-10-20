// Glue between the fractal niche engine (core/niche.js) and the apps that act on a written niche: recruiting, ad
// audiences and community posting. Pure helpers (reads) plus resolveNiche, which may create nodes (deterministic).
// Numbers tagged [design] are game assumptions, not statistics. Design: docs/design/fractal-niches.md.

import { nicheFor, deepestExisting, statsFor, dossierOf, getNode, pathOf, childrenOf } from '../../core/niche.js';
import { clamp } from '../../core/util.js';
import { safeHttpUrl } from '../../core/niche-research.js';

/** How hard a niche is to reach: 0 (broad) .. 1 (a sliver of a segment). log10 of the share of its segment, scaled. */
export const hardness = (shareOfSegment) => clamp(-Math.log10(Math.max(1e-4, shareOfSegment ?? 1)) / 4, 0, 1);

/**
 * Resolve free text to a niche. create:true grows the tree (the player really narrowed); create:false only reads nodes
 * that exist. Returns null when the text is broad (segment level only) or points at no segment.
 */
export function resolveNiche(state, text, { source = null, create = true, rootIds = null } = {}) {
  const t = String(text ?? '').trim();
  if (t.split(/\s+/).filter(Boolean).length < 2) return null;
  let node = null;
  try { node = create ? nicheFor(state, t, { source }) : deepestExisting(state, t, rootIds); } catch { node = null; }
  if (!node || node.level < 2) return null;
  if (rootIds && !rootIds.includes(node.rootId)) return null;
  const st = statsFor(state, node.id);
  if (!st) return null;
  return { node, id: node.id, rootId: node.rootId, level: node.level, label: nicheLabel(state, node.id), share: st.share, shareOfSegment: st.shareOfSegment, stats: st.stats, hard: hardness(st.shareOfSegment) };
}

/** "Texas, Dentrix, multi-location": the qualifier labels below the segment. */
export const nicheLabel = (state, id) => pathOf(state, id).slice(1).map((n) => n.label).filter(Boolean).join(', ');

const mid = (r) => (r ? (Number(r.lo) + Number(r.hi)) / 2 : 0);

/** Companies (B2B) or interviewable consumers (B2C) in the niche. Dossier archetype counts, else share of an assumed pool [design]. */
export function nichePopulation(state, id) {
  // A role or trigger cuts the PEOPLE you can reach inside each company, not the number of companies: multiply only the
  // company-level splits (sub-industry, size, place, tool) onto the segment's national archetype counts.
  const chain = pathOf(state, id);
  const root = chain[0];
  const d = root && dossierOf(state, root.id);
  const national = (d?.archetypes ?? []).reduce((a, x) => a + mid(x.countInRegion), 0);
  if (national > 0) {
    const f = chain.slice(1).filter((n) => !['role', 'trigger'].includes(n.dim)).reduce((a, n) => a * (n.share ?? 1), 1);
    return Math.max(1, Math.round(national * f));
  }
  const st = statsFor(state, id);
  return Math.round((st?.shareOfSegment ?? 1) * 2_000_000); // [design] B2C: reachable consumers in a segment
}

/** Share-weighted pick of a node or one of its existing children (finer nodes the player already opened). */
export function pickInNiche(state, r, id) {
  const kids = childrenOf(state, id);
  if (!kids.length) return id;
  const sum = kids.reduce((a, k) => a + (k.share ?? 0), 0);
  const entries = [[id, Math.max(0.05, 1 - sum)], ...kids.map((k) => [k.id, k.share ?? 0])];
  const tot = entries.reduce((a, [, w]) => a + w, 0);
  let x = r() * tot;
  for (const [k, w] of entries) { x -= w; if (x <= 0) return k; }
  return id;
}

/** A short brief of the niche's world for an interviewee: tools, vocabulary, what colleagues are called. */
export function nicheBrief(state, id) {
  const d = dossierOf(state, id);
  if (!d) return '';
  const tools = d.tools.filter((t) => !/payment|identity|chat/.test(t.category)).slice(0, 3).map((t) => t.name);
  const words = (d.vocabulary ?? []).slice(0, 4);
  const parts = [];
  if (tools.length) parts.push(`day to day you use ${tools.join(', ')}`);
  if (words.length) parts.push(`you talk in your trade's words (${words.join(', ')})`);
  return parts.length ? `${nicheLabel(state, id)}: ${parts.join('; ')}.` : '';
}

// ------------------------------------------------------------------ ads

const AD_TYPES = new Set(['interests', 'jobtitles']);
/** Niche an ad set's targeting text points at (interests / job-title audiences only; Advantage+ broad ignores the text). */
export function adsNiche(state, audience, { create = false } = {}) {
  if (!audience || !AD_TYPES.has(audience.type)) return null;
  if (audience.nicheId) return resolveById(state, audience.nicheId);
  if (!create || !String(audience.interests ?? '').trim()) return null;
  const n = resolveNiche(state, `${audience.interests}`, { source: 'ads', create: true });
  return n;
}
function resolveById(state, id) {
  const node = getNode(state, id); const st = node && statsFor(state, id);
  return st ? { node, id, rootId: node.rootId, level: node.level, label: nicheLabel(state, id), share: st.share, shareOfSegment: st.shareOfSegment, stats: st.stats, hard: hardness(st.shareOfSegment) } : null;
}

/** Niche-driven audience multipliers: CPM up for narrow B2B niches and tiny pools; CTR/CVR follow the niche's pain and intensity. */
export function audienceMods(state, audience, size) {
  const n = audience?.nicheId ? resolveById(state, audience.nicheId) : null;
  if (!n) return { cpm: 1, ctr: 1, cvr: 1 };
  const root = statsFor(state, n.rootId)?.stats;
  const painRatio = root ? (n.stats.painPrevalence * n.stats.intensity) / Math.max(0.01, root.painPrevalence * root.intensity) : 1;
  const wtpRatio = root ? n.stats.wtpMonthly.median / Math.max(1, root.wtpMonthly.median) : 1;
  const b2b = state.company.model !== 'b2c';
  const depth = n.level - 1;
  let cpm = 1 + (b2b ? 0.15 : 0.06) * depth; // narrow B2B targeting is bid up by everyone selling to it [design]
  if (size < 10_000) cpm *= 1 + 0.2 * Math.log10(10_000 / Math.max(300, size)); // tiny pools
  return {
    cpm: Math.round(clamp(cpm, 1, 2.2) * 1000) / 1000,
    ctr: Math.round(clamp(Math.sqrt(painRatio), 0.75, 1.5) * 1000) / 1000,
    cvr: Math.round(clamp(Math.pow(painRatio, 0.7) * Math.pow(wtpRatio, 0.3), 0.6, 1.8) * 1000) / 1000,
  };
}

/** Audience size for a niche: the platform's pool for that audience type times the niche's share of its segment, floored at the platform minimum. */
export const nicheAudienceSize = (baseSize, shareOfSegment, floor = 300) => Math.max(floor, Math.round(baseSize * shareOfSegment));

const tokens = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9+#. ]+/g, ' ');
/** 0..1 how specifically ad copy speaks to the niche: distinct niche terms (vocabulary, tools, titles, qualifiers) it uses, capped at 3. */
export function messageRelevance(state, id, text) {
  const d = dossierOf(state, id);
  if (!d) return 0;
  const hay = ` ${tokens(text)} `;
  const terms = new Set([...(d.vocabulary ?? []), ...d.tools.map((t) => t.name), ...d.roles.map((r) => r.title), ...pathOf(state, id).slice(1).map((n) => n.label)]
    .map((t) => tokens(t).trim()).filter((t) => t.length >= 4));
  let hits = 0;
  for (const t of terms) if (hay.includes(` ${t} `) || hay.includes(` ${t}s `)) hits++;
  return clamp(Math.min(3, hits) / 4, 0, 1);
}

// ------------------------------------------------------------------ communities

const SIZE_BY_KIND = [[/subreddit|reddit/i, 'medium'], [/slack|discord/i, 'small'], [/association|society|chamber|guild|union/i, 'medium'], [/event|conference|summit|expo|meetup/i, 'small'], [/newsletter|podcast|blog/i, 'medium'], [/facebook|group|forum|community/i, 'small']];
const GENERIC = /r\/(smallbusiness|entrepreneur|startups|saas)|indie hackers|hacker news|product hunt|linkedin|twitter|\bx\b|facebook|quora/i;
const words = (s) => tokens(s).split(/\s+/).filter((w) => w.length >= 4);
const overlap = (a, b) => { const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.min(A.size, B.size); };

/** Where the player's niche lives: real communities, associations, events and newsletters from the dossiers of the ICP niche and its parents. */
export function communitySuggestions(state, icpText) {
  const n = resolveNiche(state, icpText || state.company.icp || state.company.oneLiner, { source: 'community', create: true });
  if (!n) return [];
  const out = []; const seen = new Set();
  const chain = pathOf(state, n.id).filter((x) => x.level >= 2).reverse(); // deepest first
  for (const node of chain) {
    const d = dossierOf(state, node.id);
    for (const c of d?.communities ?? []) {
      const k = String(c.name).toLowerCase();
      if (seen.has(k)) continue; seen.add(k);
      out.push({ name: c.name, kind: c.kind, url: safeHttpUrl(c.url), nicheId: node.id, nicheLabel: nicheLabel(state, node.id), level: node.level, size: communitySize(c.kind, node.level), researched: d.source === 'research' });
    }
  }
  return out;
}
const communitySize = (kind, level) => {
  const base = (SIZE_BY_KIND.find(([re]) => re.test(kind ?? '')) ?? [0, 'small'])[1];
  return level >= 4 && base === 'medium' ? 'small' : base; // a niche inside a niche is a smaller room
};

/**
 * How well a community the player names fits their niche: { fit 0..1, size, entry, why }. A community in the dossier of the
 * ICP niche (or a parent) is a real room for that crowd; the biggest generic communities are mostly the wrong crowd.
 */
export function communityFit(state, name, icpText) {
  const n = resolveNiche(state, icpText || state.company.icp || state.company.oneLiner, { source: 'community', create: true });
  const nm = String(name ?? '').trim();
  if (!n || !nm) return { fit: 0.5, size: null, entry: null, why: 'no niche to compare against', nicheId: n?.id ?? null };
  const sug = communitySuggestions(state, icpText);
  const hit = sug.find((c) => c.name.toLowerCase() === nm.toLowerCase()) ?? sug.find((c) => overlap(c.name, nm) >= 0.6 && words(c.name).length >= 1);
  if (hit) {
    const frac = hit.level / n.level;
    return { fit: Math.round((0.72 + 0.28 * frac) * 100) / 100, size: hit.size, entry: hit, why: `listed for ${hit.nicheLabel}`, nicheId: n.id };
  }
  // A name that itself describes another corner of the market (resolves to a different segment) is the wrong crowd.
  const other = resolveNiche(state, nm.length < 14 ? `${nm} community` : nm, { source: 'community', create: false });
  if (other && other.rootId !== n.rootId) return { fit: 0.2, size: null, entry: null, why: 'a different customer segment', nicheId: n.id };
  if (GENERIC.test(nm)) return { fit: 0.35, size: null, entry: null, why: 'a broad community: your niche is a small slice of it', nicheId: n.id };
  return { fit: 0.4, size: null, entry: null, why: 'not tied to your niche', nicheId: n.id };
}
