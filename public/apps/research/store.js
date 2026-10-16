// Discovery state (extends state.apps.research from product/store.js) and the seeded stream every discovery draw uses.
// Never rng(state): recruiting, chats and debriefs use their own streams so existing seeded flows are unchanged.

import { hash } from '../../core/util.js';
import { researchSlice } from '../product/store.js';

export function disc(state) {
  const r = researchSlice(state);
  r.recruit ??= { target: '', screener: '', incentive: 0, batches: [], warmUsed: 0, friendsUsed: 0, spentUsd: 0, referrals: [] };
  r.recruit.batches ??= []; r.recruit.referrals ??= [];
  r.hyps ??= [];
  r.claims ??= [];
  r.debriefs ??= [];
  r.pending ??= [];
  r.sim ??= { n: 0 };
  return r;
}

/** Deterministic 0..1 stream for `key` (independent of rng(state) and of call order elsewhere). */
export function dstream(state, key) {
  let a = parseInt(hash(`disc:${state.seed ?? 0}:${key}`), 36) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Next stable id for a simulated interview (counter lives in the save, so ids never collide across reloads). */
export const nextSimId = (state) => `siv${(disc(state).sim.n += 1).toString(36)}`;

export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
