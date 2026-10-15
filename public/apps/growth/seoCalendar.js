// One Google update calendar for the whole game, read by Organic SEO (growth/seoDynamics.js) and PLG programmatic
// pages (plg/model.js). Exogenous: a hash schedule from a fixed per-game seed, so every player of a seed meets the
// same updates and no rng(state) draw is shifted. Rates: 2–4 core updates a year, each rolling out ~2–3 weeks, plus
// 1–2 spam updates a year (Search Status Dashboard 2024–2026 via ppc.land / Search Engine Land; docs/research/seo/
// effects-and-risks.md §3). 3.3 core updates/yr matches SEJ 2022–2025 (data/world.js S.coreUpdates).

export const GOOGLE_CAL = { corePerYear: 3.3, rolloutDays: [14, 21], spamPerYear: 1.5 };

// Same hash as lifecycle/model.js h01 (kept local so this module imports nothing).
export function h01(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// The calendar seed is fixed the first time anyone reads it (state.seed advances with every rng draw; a schedule must
// not). PLG keeps its own copy in apps.plg.seed and adopts this one when it is created later.
export function seoSeed(state) {
  const O = state.apps?.organic;
  if (O?.seo?.seed != null) return O.seo.seed;
  const P = state.apps?.plg;
  const seed = P?.seed != null ? P.seed : state.seed | 0;
  state.apps ??= {};
  const org = (state.apps.organic ??= {});
  (org.seo ??= {}).seed = seed;
  return seed;
}

export const coreUpdateStartsOn = (state, day = state.day ?? 0) => h01(`gcore|${seoSeed(state)}|${day}`) < GOOGLE_CAL.corePerYear / 365;
export const coreRolloutDays = (state, day = state.day ?? 0) => GOOGLE_CAL.rolloutDays[0] + Math.floor(h01(`groll|${seoSeed(state)}|${day}`) * (GOOGLE_CAL.rolloutDays[1] - GOOGLE_CAL.rolloutDays[0] + 1));
export const spamUpdateOn = (state, day = state.day ?? 0) => h01(`gspam|${seoSeed(state)}|${day}`) < GOOGLE_CAL.spamPerYear / 365;
