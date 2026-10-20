// Person names: one shared bank (data/names.js) and one rule, no two generated people in a game share a full name.
//
// personName(state, { region, country, key, rand, oneDraw, taken, register })
//   Draws a coherent first + last name (both from the same cultural pool) and guarantees it is unique in this game:
//   used names live in state.names.used (lower-case full name → owner key or 1). On a collision it re-draws from a
//   private hash stream (never from the caller's stream, so a collision does not shift anyone's seeded sequence),
//   then falls back to a middle initial.
//   - rand: the caller's own random source (a dedicated stream, a hash prng, or () => rng(state)). It is called
//     exactly twice (once with oneDraw: true), whatever happens, so swapping an old `pick(FIRST)`/`pick(LAST)` pair
//     for personName keeps every later draw where seeded calibration expects it. Defaults to rng(state).
//   - key: a stable id for the person (a universe key, a database row id). The same key always gets the same name
//     back, so regenerated lists (search pages, cached databases) stay stable and never count as collisions.
//   - taken: an optional Set of names to avoid when there is no state (pure generators); drawn names are added to it.
//   - register: false checks uniqueness without claiming the name (the caller claims it later with claimName).
// claimName(state, name, { key }) registers a name that came from elsewhere (an LLM, a stored record); if another
//   person already has it, it returns the same first and last name with a middle initial.
// Names are flavour only: nothing about a person is ever derived from their name.

import { rng, hash } from './util.js';
import { POOLS, REGIONS, COUNTRIES, BLOCKED } from '../data/names.js';

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const INITIALS = 'ABCDEFGHJKLMNPRSTVW';

// Mulberry32 seeded from an integer: private streams for re-draws and derived uniforms.
function prng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (str) => parseInt(hash(String(str)), 36) | 0;
/** A deterministic [0,1) stream from any string (for pure generators that have no seeded stream of their own). */
export const nameRand = (str) => prng(seedOf(str));

// ---- Regions → weighted pools ----

const mixCache = new Map();
function flatten(id, w, out, depth) {
  if (POOLS[id]) { out.set(id, (out.get(id) ?? 0) + w); return; }
  const mix = REGIONS[id];
  if (!mix || depth > 5) return;
  const tot = mix.reduce((x, [, v]) => x + v, 0) || 1;
  for (const [k, v] of mix) flatten(k, (w * v) / tot, out, depth + 1);
}
/** [[poolId, weight]] for a region id, pool id or country name (unknown → the global mix). */
export function regionMix(region, country) {
  const id = [country, region].map((x) => (x == null ? null : POOLS[x] || REGIONS[x] ? x : COUNTRIES[x] ?? null)).find(Boolean) ?? 'global';
  let mix = mixCache.get(id);
  if (!mix) {
    const m = new Map();
    flatten(id, 1, m, 0);
    const tot = [...m.values()].reduce((x, y) => x + y, 0) || 1;
    mix = [...m.entries()].map(([k, v]) => [k, v / tot]);
    mixCache.set(id, mix);
  }
  return mix;
}

const at = (arr, u) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(u * arr.length)))];
// One uniform picks the pool (by weight) and the first name within it; the second picks the surname from that pool.
function fromUniforms(u1, u2, mix) {
  let acc = 0;
  for (let i = 0; i < mix.length; i++) {
    const [id, w] = mix[i];
    if (u1 < acc + w || i === mix.length - 1) {
      const pool = POOLS[id];
      const first = at(pool.first, w > 0 ? (u1 - acc) / w : 0), last = at(pool.last, u2);
      return { first, last, middle: null, name: `${first} ${last}`, pool: id };
    }
    acc += w;
  }
  return null;
}

/** A pure draw from the bank (no uniqueness): rand is called twice (once with oneDraw). */
export function drawName(rand, { region, country, oneDraw = false } = {}) {
  const u1 = rand(), u2 = oneDraw ? prng(Math.floor(u1 * 4294967296) ^ 0x5bd1e995)() : rand();
  return fromUniforms(u1, u2, regionMix(region, country));
}

// ---- Uniqueness ----

export function ensureNames(state) {
  const n = (state.names ??= { used: {} });
  n.used ??= {};
  // The founder's own name is never handed to anyone else.
  if (!n.founder && state.founder?.name) { n.used[norm(state.founder.name)] ??= 'founder'; n.founder = 1; }
  return n;
}

function makeFree(state, key, taken) {
  const n = state ? ensureNames(state) : null;
  return (name) => {
    const k = norm(name);
    if (BLOCKED.has(k)) return false;
    if (taken && (taken.has(k) || taken.has(name))) return false;
    if (!n) return true;
    const v = n.used[k];
    return v === undefined || (key != null && v === key);
  };
}

const withMiddle = (first, last, m) => ({ first, last, middle: m, name: `${first} ${m}. ${last}` });

// Same first + last with a middle initial; then two initials; then a number (never reached in practice).
function middleVariant(first, last, free, r) {
  const off = Math.floor(r() * INITIALS.length);
  for (let i = 0; i < INITIALS.length; i++) { const c = withMiddle(first, last, INITIALS[(off + i) % INITIALS.length]); if (free(c.name)) return c; }
  for (let i = 0; i < INITIALS.length * INITIALS.length; i++) {
    const m = `${INITIALS[(off + i) % INITIALS.length]}. ${INITIALS[Math.floor(i / INITIALS.length)]}`;
    const c = withMiddle(first, last, m); if (free(c.name)) return c;
  }
  for (let k = 2; ; k++) { const c = { first, last, middle: null, name: `${first} ${last} ${k}` }; if (free(c.name)) return c; }
}

function claim(state, name, key, taken) {
  if (taken) taken.add(norm(name));
  if (state) ensureNames(state).used[norm(name)] = key ?? 1;
}

/**
 * A unique person name for this game: { first, last, middle, name, pool }. See the header for the options.
 * `first`/`last` never include the middle initial, so emails built from them keep working.
 */
export function personName(state, { region = null, country = null, key = null, rand = null, oneDraw = false, taken = null, register = true } = {}) {
  const r = rand ?? (state ? () => rng(state) : null);
  if (!r) throw new Error('personName needs a state or a rand function');
  const mix = regionMix(region, country);
  const u1 = r(), u2 = oneDraw ? prng(Math.floor(u1 * 4294967296) ^ 0x5bd1e995)() : r();
  const free = makeFree(state, key, taken);
  let c = fromUniforms(u1, u2, mix);
  if (!free(c.name)) {
    const alt = prng(seedOf(`${c.name}|${u1}|${u2}|${key ?? ''}`));
    let found = null;
    const pool = POOLS[c.pool];
    for (let i = 0; i < 12 && !found; i++) { // same cultural pool first, then anywhere in the region
      const d = i < 6 ? { ...c, first: at(pool.first, alt()), last: at(pool.last, alt()) } : fromUniforms(alt(), alt(), mix);
      d.name = `${d.first} ${d.last}`;
      if (free(d.name)) found = d;
    }
    c = found ?? { ...middleVariant(c.first, c.last, free, alt), pool: c.pool };
  }
  if (register) claim(state, c.name, key, taken);
  else if (taken) taken.add(norm(c.name));
  return c;
}

/**
 * Register a name from outside the generator (an LLM-written sender, a stored record). Free (or already this key's):
 * claimed and returned unchanged. Taken by someone else: the same first and last name with a middle initial.
 * keep: true registers the name as-is even if taken (the player's own real contacts are never renamed).
 * One-word names (handles, "Procurement Office") are returned untouched.
 */
export function claimName(state, name, { key = null, keep = false } = {}) {
  const s = String(name ?? '').trim();
  if (!state || !s) return name;
  const parts = s.split(/\s+/);
  if (parts.length < 2) return name;
  const free = makeFree(state, key, null);
  if (keep || free(s)) { const n = ensureNames(state); if (keep) n.used[norm(s)] ??= key ?? 1; else claim(state, s, key, null); return s; }
  const c = middleVariant(parts[0], parts.slice(1).join(' '), free, prng(seedOf(`${s}|${key ?? ''}`)));
  claim(state, c.name, key, null);
  return c.name;
}

export const isNameTaken = (state, name) => Boolean(state?.names?.used?.[norm(name)] !== undefined || BLOCKED.has(norm(name)));

/** A stable per-game stream for rosters generated once (reporters, a fallback contact list). Never touches state.seed's sequence. */
export function nameStream(state, label) {
  const n = ensureNames(state);
  n.seed ??= state.seed | 0;
  return prng(seedOf(`${n.seed}|${label}`));
}

const FOLD = { ł: 'l', Ł: 'l', ø: 'o', Ø: 'o', đ: 'd', Đ: 'd', ı: 'i', ß: 'ss', æ: 'ae', Æ: 'ae', œ: 'oe' };
/** ASCII email-safe form of a name part: "Müller" → "muller", "O'Brien" → "obrien", "Łukasz" → "lukasz". */
export const emailSlug = (s) => String(s ?? '').replace(/[łŁøØđĐıßæÆœ]/g, (ch) => FOLD[ch]).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
