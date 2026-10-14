// Ads Manager reporting: aggregate daily per-ad rows by campaign / ad set / ad / day / week / format,
// derive reach, frequency, CPM, CTR, CPC, cost per result and reported ROAS, and the per-entity rule hint.

import { reachOf, ruleHint } from './delivery.js';
import { ensureAds, audienceSize, resultsField, creativeFor } from './adsEngine.js';

export const EMPTY = () => ({ sp: 0, im: 0, cl: 0, lp: 0, tr: 0, pu: 0, rt: 0, rpp: 0, rv: 0, res: 0 });

export function rowsInRange(state, { p = null, from, to = state.day }) {
  const A = ensureAds(state);
  const out = [];
  for (let i = A.rows.length - 1; i >= 0; i--) {
    const r = A.rows[i];
    if (r.d < from) break;
    if (r.d <= to && (!p || r.p === p)) out.push(r);
  }
  return out.reverse();
}

// key(row) → group key; opt lookup gives results per row according to its ad set's optimization event.
export function aggregate(state, rows, key) {
  const A = ensureAds(state);
  const opt = Object.fromEntries(A.adsets.map((s) => [s.id, resultsField(s.optimization)]));
  const groups = new Map();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    const g = groups.get(k) ?? EMPTY();
    for (const f of ['sp', 'im', 'cl', 'lp', 'tr', 'pu', 'rt', 'rpp', 'rv']) g[f] += r[f];
    g.res += r[opt[r.s] ?? 'rt'];
    groups.set(k, g);
  }
  return groups;
}

export function derive(g, reach = null) {
  return {
    ...g,
    reach,
    freq: reach ? g.im / reach : null,
    cpm: g.im ? (g.sp / g.im) * 1000 : null,
    ctr: g.im ? g.cl / g.im : null,
    cpc: g.cl ? g.sp / g.cl : null,
    cpr: g.res ? g.sp / g.res : null,
    roas: g.sp ? g.rv / g.sp : null,
  };
}

// Reach for a set of rows belonging to one ad set (pool-based approximation), summed across ad sets.
export function reachFor(state, rows) {
  const A = ensureAds(state);
  const bySet = new Map();
  for (const r of rows) bySet.set(r.s, (bySet.get(r.s) ?? 0) + r.im);
  let reach = 0;
  for (const [sid, im] of bySet) {
    const s = A.adsets.find((x) => x.id === sid);
    reach += s ? reachOf(im, Math.max(1, audienceSize(state, s) || 1000)) : im;
  }
  return Math.round(reach);
}

// Rule hint for an ad set or ad (kill/scale rules of thumb).
export function hintFor(state, { kind, entity, rows, targetCpa }) {
  const A = ensureAds(state);
  const g = derive(aggregate(state, rows, () => 1).get(1) ?? EMPTY());
  const s = kind === 'adset' ? entity : A.adsets.find((x) => x.id === entity.adsetId);
  const first = kind === 'ad' && entity.first?.im > 1000 ? entity.first.cl / entity.first.im : null;
  const recentRows = rows.filter((r) => r.d >= state.day - 3);
  const rc = recentRows.reduce((a, r) => [a[0] + r.cl, a[1] + r.im], [0, 0]);
  return ruleHint({
    spend: g.sp, results: g.res, imps: g.im, ctr: g.ctr ?? 0, cpa: g.cpr, targetCpa,
    ctrBaseline: first, ctrRecent: rc[1] > 500 ? rc[0] / rc[1] : null, freq7: s?.lastFreq7 ?? 0,
    status: s?.learn?.status, days: state.day - entity.createdDay,
  });
}

export const formatOf = (state, adId) => {
  const ad = ensureAds(state).ads.find((a) => a.id === adId);
  return ad ? (creativeFor(state, ad)?.format ?? 'store') : '—';
};
