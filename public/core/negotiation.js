// Shared multi-round negotiation engine (ARCHITECTURE: Negotiation). One engine for enterprise deals, VC term sheets,
// acquisition LOIs, vendor contracts and hiring offers; each is an adapter (apps/negotiate/*) that supplies the issues,
// the counterparty persona and the real consequences.
//
// A negotiation has a counterparty persona (role, style, hidden BATNA strength, reservation, priority weights,
// per-issue floors, deadline, patience, trust), a set of issues (numeric ranges or option sets, each with a player utility
// and a counterparty utility) and a history of offers and messages. Each round the player sends a package offer and
// optionally a message; the counterparty accepts, counters, rejects or walks.
//
// The counterparty is an LLM persona when a key is present (hidden values in the prompt, structured JSON back) and a
// deterministic offline model otherwise. The offline model implements the researched dynamics: anchoring (precise
// first offers pull harder; extreme anchors cost trust and can end the talks), diminishing concessions, reciprocity
// (unreciprocated concessions are pocketed), logrolling (trading low-priority for high-priority issues expands value),
// deadlines, credible walk-away (only as real as the BATNA the engine reads from game state), bluffs that get called,
// splitting the difference and impasse. LLM output is validated and clamped against the hidden reservation, so the
// model can never accept below it or reveal hidden values.
//
// Determinism: a dedicated seeded stream per negotiation (neg.rs), never the main rng(state), so existing seeded flows
// are unchanged. No Date.now() / Math.random(). Everything works offline.
//
// Founder hours: the engine states what a round / Prepare step costs (roundHours, prepHours); the UI charges them with
// ctx.act; tests may pass { charge: true } to spend them directly.

import { clamp, rng, uid, hash, round2, money, pct } from './util.js';
import { notify, log, spendHours } from './state.js';
import { logMistake, registerOperatorReader, hasOperatorReader, tierFromScore, shrink, trapCoaching, unknownRead } from './operator.js';
import * as LLM from './llm.js';
import { STYLES, ROUND_HOURS, PREP_HOURS, PREP_LABELS, ENGINE, NEG_MISTAKES } from '../data/negotiation.js';

export const FN = 'negotiation';
export const LABEL = NEG_MISTAKES;

// ---------------------------------------------------------------------------------------------------------------
// Adapters and slice
// ---------------------------------------------------------------------------------------------------------------

const adapters = new Map();
/** adapter: { label, batna(state, neg) -> { value, real, leverage, sources }, onClose(state, neg, result), onOpen?, daily? } */
export function registerAdapter(kind, adapter) { adapters.set(kind, adapter); }
export const adapterFor = (kind) => adapters.get(kind) ?? null;
const dailyHooks = [];
export function registerDaily(fn) { if (!dailyHooks.includes(fn)) dailyHooks.push(fn); }

export function ensureNeg(state) {
  state.apps ??= {};
  return (state.apps.negotiation ??= { items: [], events: [] });
}
export const negotiations = (state, filter = null) => ensureNeg(state).items.filter((n) => !filter || filter(n));
export const getNegotiation = (state, id) => ensureNeg(state).items.find((n) => n.id === id) ?? null;
export const findNegotiation = (state, key) => ensureNeg(state).items.find((n) => n.key === key) ?? null;
export const isOpen = (neg) => neg?.status === 'open';

const EVENT_CAP = 300;
function emit(state, neg, type, extra = {}) {
  const slice = ensureNeg(state);
  const key = `${type}:${neg.id}:${extra.round ?? ''}:${state.day}`;
  if (slice.events.some((e) => e.key === key)) return null;
  const ev = { id: uid('nev'), type, day: state.day, key, negId: neg.id, kind: neg.kind, title: neg.title, ref: neg.ref ?? null, ...extra };
  slice.events.push(ev);
  if (slice.events.length > EVENT_CAP) slice.events.splice(0, slice.events.length - EVENT_CAP);
  return ev;
}
/** Events for the Automations app: negotiation_started, counteroffer_received, negotiation_closed, negotiation_walked. */
export function negotiationEvents(state, since = -Infinity) {
  return (state.apps?.negotiation?.events ?? []).filter((e) => e.day >= since);
}

// ---------------------------------------------------------------------------------------------------------------
// Issues, packages, utilities
// ---------------------------------------------------------------------------------------------------------------

const normW = (obj) => { const t = Object.values(obj).reduce((a, b) => a + b, 0) || 1; return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v / t])); };
const issueOf = (neg, id) => neg.issues.find((i) => i.id === id);
const opt = (issue, v) => issue.options.find((o) => o.id === String(v));

function numStep(issue, v) {
  const step = issue.step ?? (issue.max - issue.min) / 100;
  const snapped = Math.round((v - issue.min) / step) * step + issue.min;
  return clamp(+snapped.toFixed(6), issue.min, issue.max);
}
/** Make a value legal for the issue (clamp numeric, snap to step, fall back for unknown options). */
export function snapValue(issue, v, fallback = null) {
  if (issue.type === 'num') {
    const n = Number(v);
    return Number.isFinite(n) ? numStep(issue, n) : (fallback ?? issue.min);
  }
  return opt(issue, v) ? String(v) : (fallback ?? issue.options[0].id);
}
export function snapPackage(neg, pkg, fallback = {}) {
  const out = {};
  for (const i of neg.issues) out[i.id] = snapValue(i, pkg?.[i.id], fallback[i.id] ?? null);
  return out;
}
function issueUtil(issue, v) {
  if (issue.type === 'num') {
    const t = (clamp(Number(v), issue.min, issue.max) - issue.min) / ((issue.max - issue.min) || 1);
    return { p: issue.pDir > 0 ? t : 1 - t, c: issue.cDir > 0 ? t : 1 - t };
  }
  const o = opt(issue, v) ?? issue.options[0];
  return { p: o.pu, c: o.cu };
}
/** Weighted utilities of a package: p for the player, c for the counterparty (0..1 each). */
export function pkgU(neg, pkg) {
  let p = 0, c = 0;
  for (const i of neg.issues) {
    const u = issueUtil(i, pkg[i.id]);
    p += neg.player.wp[i.id] * u.p;
    c += neg.hidden.wc[i.id] * u.c;
  }
  return { p, c };
}
// The package that is best for the counterparty / the player on every issue.
function idealValue(issue, side) {
  if (issue.type === 'num') {
    const hiGood = (side === 'c' ? issue.cDir : issue.pDir) > 0;
    return hiGood ? issue.max : issue.min;
  }
  const key = side === 'c' ? 'cu' : 'pu';
  const other = side === 'c' ? 'pu' : 'cu';
  return issue.options.slice().sort((a, b) => b[key] - a[key] || b[other] - a[other])[0].id;
}
export const idealPackage = (neg, side) => Object.fromEntries(neg.issues.map((i) => [i.id, idealValue(i, side)]));

// Stance sigma in [0,1]: 0 = best for the counterparty, 1 = best for the player.
function sigmaOf(issue, v) {
  if (issue.type === 'num') {
    const vc = idealValue(issue, 'c'), vp = idealValue(issue, 'p');
    return vc === vp ? 1 : clamp((Number(v) - vc) / (vp - vc), 0, 1);
  }
  const oc = opt(issue, idealValue(issue, 'c')), op = opt(issue, idealValue(issue, 'p'));
  const o = opt(issue, v) ?? oc;
  return op.pu === oc.pu ? 1 : clamp((o.pu - oc.pu) / (op.pu - oc.pu), 0, 1);
}
function valueAtSigma(issue, s) {
  if (issue.type === 'num') {
    const vc = idealValue(issue, 'c'), vp = idealValue(issue, 'p');
    return numStep(issue, vc + s * (vp - vc));
  }
  const oc = opt(issue, idealValue(issue, 'c')), op = opt(issue, idealValue(issue, 'p'));
  const target = oc.pu + s * (op.pu - oc.pu);
  return issue.options.slice().sort((a, b) => Math.abs(a.pu - target) - Math.abs(b.pu - target) || b.cu - a.cu)[0].id;
}
const stanceOf = (neg, pkg) => Object.fromEntries(neg.issues.map((i) => [i.id, sigmaOf(i, pkg[i.id])]));
const packageAt = (neg, sig) => Object.fromEntries(neg.issues.map((i) => [i.id, valueAtSigma(i, sig[i.id])]));

// Per-issue floor on counterparty utility (hidden), relaxed by leverage once a real alternative has been shown.
function floorOf(neg, issue) {
  const f = neg.hidden.floors?.[issue.id];
  if (f == null) return 0;
  const room = neg.flags.leverageUsed ? (neg.hidden.leverageRoom?.[issue.id] ?? 0) : 0;
  return Math.max(0, f - room);
}
export function feasibleForCp(neg, pkg) {
  const u = pkgU(neg, pkg);
  if (u.c < neg.hidden.res - 1e-9) return false;
  return neg.issues.every((i) => issueUtil(i, pkg[i.id]).c >= floorOf(neg, i) - 1e-9);
}
// Pull a package toward the counterparty's ideal until it clears its reservation and floors (used for every counter and
// for every LLM reply). The issue with the least player utility lost per counterparty utility gained moves first.
export function clampToReservation(neg, pkg) {
  const out = { ...pkg };
  const margin = ENGINE.minMargin * 0.5;
  for (let guard = 0; guard < 400; guard++) {
    const u = pkgU(neg, out);
    const bad = neg.issues.filter((i) => issueUtil(i, out[i.id]).c < floorOf(neg, i) - 1e-9);
    if (u.c >= neg.hidden.res + margin && !bad.length) return out;
    const pool = bad.length ? bad : neg.issues;
    let best = null;
    for (const i of pool) {
      const s = sigmaOf(i, out[i.id]);
      if (s <= 0) continue;
      const ns = Math.max(0, s - (i.type === 'num' ? 0.04 : 0.34));
      const nv = valueAtSigma(i, ns);
      if (String(nv) === String(out[i.id])) continue;
      const a = issueUtil(i, out[i.id]), b = issueUtil(i, nv);
      const gainC = neg.hidden.wc[i.id] * (b.c - a.c);
      const lossP = neg.player.wp[i.id] * (a.p - b.p);
      if (gainC <= 1e-9) continue;
      const ratio = lossP / gainC;
      if (!best || ratio < best.ratio) best = { i, nv, ratio };
    }
    if (!best) return idealPackage(neg, 'c');
    out[best.i.id] = best.nv;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Best achievable (ZOPA, surplus, joint value)
// ---------------------------------------------------------------------------------------------------------------

// Maximise the player's utility subject to the counterparty clearing its reservation and floors. Discrete issues are
// enumerated, numeric ones solved as a fractional knapsack. Cached per negotiation + leverage state.
const bestCache = new WeakMap();
export function solveBest(neg, { respectFloors = true } = {}) {
  const ck = `${respectFloors}|${neg.flags.leverageUsed ? 1 : 0}`;
  const cached = bestCache.get(neg);
  if (cached?.key === ck) return cached.value;
  const discrete = [], numeric = [];
  for (const i of neg.issues) (i.type === 'opt' ? discrete : numeric).push(i);
  const flo = (i) => (respectFloors ? floorOf(neg, i) : 0);
  const optsFor = (i) => i.options.filter((o) => o.cu >= flo(i) - 1e-9);
  const lists = discrete.map(optsFor);
  const numInfo = numeric.map((i) => {
    // t in [0,1] along min..max; utilities linear in t.
    const u0 = issueUtil(i, i.min), u1 = issueUtil(i, i.max);
    const wp = neg.player.wp[i.id], wc = neg.hidden.wc[i.id];
    let tMin = 0, tMax = 1;
    const f = flo(i);
    // feasible t where c(t) >= f
    const dc = u1.c - u0.c;
    if (f > 0) {
      if (dc > 0) tMin = clamp((f - u0.c) / dc, 0, 1);
      else if (dc < 0) tMax = clamp((f - u0.c) / dc, 0, 1);
    }
    return { i, wp, wc, p0: u0.p, dp: u1.p - u0.p, c0: u0.c, dc, tMin, tMax };
  });
  const R = neg.hidden.res;
  let bestVal = null;
  const idx = new Array(discrete.length).fill(0);
  const total = lists.reduce((a, l) => a * Math.max(1, l.length), 1);
  const solveNumeric = (needC) => {
    // Start at the player's preferred end of each numeric issue; give back to the counterparty by cheapest ratio.
    const st = numInfo.map((n) => {
      const t = n.dp * n.wp >= 0 ? (n.dp === 0 ? (n.dc >= 0 ? n.tMax : n.tMin) : n.tMax) : n.tMin;
      return { n, t: clamp(t, n.tMin, n.tMax) };
    });
    let cSum = st.reduce((a, s) => a + s.n.wc * (s.n.c0 + s.n.dc * s.t), 0);
    let pSum = st.reduce((a, s) => a + s.n.wp * (s.n.p0 + s.n.dp * s.t), 0);
    if (cSum >= needC - 1e-12) return { p: pSum, c: cSum, ts: st.map((s) => s.t) };
    const moves = st.map((s, k) => {
      // moving t toward the end that raises c
      const dir = s.n.dc > 0 ? 1 : s.n.dc < 0 ? -1 : 0;
      const room = dir > 0 ? s.n.tMax - s.t : dir < 0 ? s.t - s.n.tMin : 0;
      const gainPerT = Math.abs(s.n.dc) * s.n.wc;
      const lossPerT = -dir * s.n.dp * s.n.wp;
      return { k, dir, room, gainPerT, lossPerT };
    }).filter((m) => m.dir && m.room > 0 && m.gainPerT > 0).sort((a, b) => (a.lossPerT / a.gainPerT) - (b.lossPerT / b.gainPerT));
    const ts = st.map((s) => s.t);
    for (const m of moves) {
      if (cSum >= needC - 1e-12) break;
      const need = needC - cSum;
      const dt = Math.min(m.room, need / m.gainPerT);
      ts[m.k] += m.dir * dt;
      cSum += dt * m.gainPerT;
      pSum -= dt * m.lossPerT;
    }
    if (cSum < needC - 1e-9) return null;
    return { p: pSum, c: cSum, ts };
  };
  for (let n = 0; n < total; n++) {
    let rem = n;
    let p = 0, c = 0, ok = true;
    for (let k = 0; k < discrete.length; k++) {
      const list = lists[k];
      if (!list.length) { ok = false; break; }
      const o = list[rem % list.length]; rem = Math.floor(rem / list.length);
      p += neg.player.wp[discrete[k].id] * o.pu;
      c += neg.hidden.wc[discrete[k].id] * o.cu;
    }
    if (!ok) continue;
    const sol = solveNumeric(R - c);
    if (!sol) continue;
    const up = p + sol.p;
    if (!bestVal || up > bestVal.up) {
      bestVal = { up, uc: c + sol.c, disc: n, ts: sol.ts };
    }
  }
  let value = null;
  if (bestVal) {
    const pkg = {};
    let rem = bestVal.disc;
    discrete.forEach((i, k) => { const list = lists[k]; pkg[i.id] = list[rem % list.length].id; rem = Math.floor(rem / list.length); });
    numInfo.forEach((n, k) => { pkg[n.i.id] = numStep(n.i, n.i.min + bestVal.ts[k] * (n.i.max - n.i.min)); });
    value = { up: bestVal.up, uc: bestVal.uc, pkg };
  }
  // Joint value: each issue independently at the value that maximises wp*p + wc*c (floors respected).
  let jointMax = 0, jointBase = 0;
  for (const i of neg.issues) {
    const f = flo(i);
    const wp = neg.player.wp[i.id], wc = neg.hidden.wc[i.id];
    const vals = i.type === 'opt' ? i.options.filter((o) => o.cu >= f - 1e-9).map((o) => ({ p: o.pu, c: o.cu })) : [0, 1].map((t) => issueUtil(i, i.min + t * (i.max - i.min))).filter((u) => u.c >= f - 1e-9);
    jointMax += Math.max(...(vals.length ? vals : [{ p: 0, c: 0 }]).map((u) => wp * u.p + wc * u.c));
    const mid = i.type === 'opt' ? { p: i.options.reduce((a, o) => a + o.pu, 0) / i.options.length, c: i.options.reduce((a, o) => a + o.cu, 0) / i.options.length } : issueUtil(i, (i.min + i.max) / 2);
    jointBase += wp * mid.p + wc * mid.c;
  }
  const out = { ...(value ?? { up: -1, uc: 0, pkg: null }), zopa: Boolean(value), jointMax, jointBase };
  bestCache.set(neg, { key: ck, value: out });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------------------------------------------

function streamSeed(state, key) { return { seed: (parseInt(hash(`${state.seed}|${key}`), 36) | 0) || 1 }; }
const roll = (neg) => rng(neg.rs);

const styleOf = (neg) => STYLES[neg.cp.style] ?? STYLES.hardball;
export const roundHours = (neg) => ROUND_HOURS[neg.stakes] ?? 0.5;
export const prepHours = (neg, step) => PREP_HOURS[neg.stakes]?.[step] ?? 0.5;

/**
 * startNegotiation(state, spec) -> neg. Idempotent on spec.key.
 * spec: { key, kind, ref?, title, stakes, stakesUsd, usdPerUtil, cp: { name, role, style, patience? , rigid? },
 *   issues: [issue defs with min/max/options set], weights?: { wp, wc } overrides, jitter (0..0.5), floors?, leverageRoom?,
 *   batnaStrength (0..1), res?, cpOpens: bool, cpDeadlineDays?, playerDeadlineDay?, cpKnowsDeadline?, expiresDay?,
 *   startStance?, mistakes?: { bluff, overplayed, caved, ... }, context?: {} (adapter data, JSON-safe) }
 */
export function startNegotiation(state, spec) {
  const slice = ensureNeg(state);
  const existing = spec.key ? slice.items.find((n) => n.key === spec.key) : null;
  if (existing) return existing;
  const rs = streamSeed(state, spec.key ?? spec.title ?? 'neg');
  const jitter = spec.jitter ?? 0.25;
  const wcRaw = {}, wpRaw = {};
  for (const i of spec.issues) {
    wpRaw[i.id] = (spec.weights?.wp?.[i.id] ?? i.wp) ;
    const j = 1 + (rng(rs) * 2 - 1) * jitter;
    wcRaw[i.id] = Math.max(0.01, (spec.weights?.wc?.[i.id] ?? i.wc) * j);
  }
  const style = STYLES[spec.cp.style] ? spec.cp.style : 'hardball';
  const st = STYLES[style];
  const batnaStrength = clamp(spec.batnaStrength ?? 0.5, 0, 1);
  const res = clamp(spec.res ?? (0.3 + 0.3 * batnaStrength), 0.15, 0.8);
  const neg = {
    id: uid('neg'), key: spec.key ?? null, kind: spec.kind, ref: spec.ref ?? null, title: spec.title, status: 'open',
    startDay: state.day, elapsedDays: 0, round: 0, stakes: spec.stakes ?? 'mid', stakesUsd: spec.stakesUsd ?? 0, usdPerUtil: spec.usdPerUtil ?? spec.stakesUsd ?? 1,
    expiresDay: spec.expiresDay ?? null, playerDeadlineDay: spec.playerDeadlineDay ?? null,
    cp: { name: spec.cp.name, role: spec.cp.role, style, trust: clamp(spec.cp.trust ?? 0.6, 0, 1), patience: spec.cp.patience ?? st.patience, patience0: spec.cp.patience ?? st.patience, rigid: spec.cp.rigid ?? null, final: false, mood: 'neutral' },
    issues: spec.issues.map((i) => ({ ...i })),
    player: { wp: normW(wpRaw), batna: { value: 0.12, real: false, leverage: 0, sources: [] } },
    hidden: { wc: normW(wcRaw), res, batnaStrength, floors: spec.floors ?? {}, leverageRoom: spec.leverageRoom ?? {}, T: 0, T0: 0, cpDeadlineDays: spec.cpDeadlineDays ?? null, cpKnowsDeadline: Boolean(spec.cpKnowsDeadline), sigma: null, cpU: [], playerU: [], playerStance: null, cpGaveLast: 0, missed: 0 },
    cpOpen: null, last: { player: null, cp: null },
    history: [], prep: {}, known: { priorities: {}, batnaSeen: false, normsSeen: false, level: 0 },
    flags: { pocketed: 0, freeGives: [], extreme: 0, leverageUsed: false, threatUsed: false, bluff: null, bluffDiscovered: false, emptyThreats: 0, tradeRounds: 0, splitUsed: false, bigEarly: 0, firstOffer: null, nearDeadline: false },
    hours: { rounds: 0, prep: 0 }, rs, mistakes: spec.mistakes ?? {}, context: spec.context ?? {}, result: null,
  };
  neg.hidden.T0 = neg.hidden.T = res + (1 - res) * st.openAsp;
  neg.hidden.sigma = Object.fromEntries(neg.issues.map((i) => [i.id, 0]));
  refreshBatna(state, neg);
  if (spec.cpOpens) {
    const open = buildCounter(neg, neg.hidden.T0, Object.fromEntries(neg.issues.map((i) => [i.id, 1])), neg.hidden.sigma);
    neg.cpOpen = open.pkg;
    neg.last.cp = open.pkg;
    neg.hidden.sigma = open.sigma;
    neg.hidden.cpU.push(pkgU(neg, open.pkg).c);
    neg.history.push({ round: 0, from: 'cp', action: 'open', package: open.pkg, message: openingLine(neg), day: state.day });
  }
  slice.items.push(neg);
  emit(state, neg, 'negotiation_started');
  adapterFor(neg.kind)?.onOpen?.(state, neg);
  return neg;
}

/** Re-read the player's real alternatives from game state through the adapter. */
export function refreshBatna(state, neg) {
  const a = adapterFor(neg.kind);
  if (!a?.batna) return neg.player.batna;
  try {
    const b = a.batna(state, neg) ?? {};
    neg.player.batna = { value: clamp(b.value ?? 0.12, 0, 0.95), real: Boolean(b.real), leverage: clamp(b.leverage ?? (b.real ? 0.5 : 0), 0, 1), sources: b.sources ?? [] };
  } catch { /* keep the previous read */ }
  return neg.player.batna;
}

// ---------------------------------------------------------------------------------------------------------------
// Counter construction
// ---------------------------------------------------------------------------------------------------------------

function allocation(neg, infer) {
  const st = styleOf(neg);
  const out = {};
  const ratios = neg.issues.map((i) => neg.hidden.wc[i.id] / Math.max(0.02, infer[i.id]));
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  neg.issues.forEach((i, k) => {
    let kk = 1;
    if (st.trades) kk = clamp(1.8 / (0.4 + ratios[k] / mean), 0.2, 3);
    if (neg.cp.style === 'bureaucratic') kk = i.policy ? 0.15 : 1.5;
    out[i.id] = kk;
  });
  return out;
}
function sigmaCap(neg, issue) {
  const f = floorOf(neg, issue);
  if (f <= 0) return 1;
  if (issue.type === 'num') {
    const cc = issueUtil(issue, idealValue(issue, 'c')).c, cp = issueUtil(issue, idealValue(issue, 'p')).c;
    if (cc <= f) return 0;
    return cc > cp ? clamp((cc - f) / (cc - cp), 0, 1) : 1;
  }
  let s = 1;
  while (s > 0 && issueUtil(issue, valueAtSigma(issue, s)).c < f - 1e-9) s -= 0.05;
  return Math.max(0, s);
}
function inferredPriorities(neg) {
  const tau = neg.hidden.playerStance;
  const out = {};
  for (const i of neg.issues) out[i.id] = 0.15 + (tau ? tau[i.id] : 0.5) + (neg.hidden.mentioned?.[i.id] ?? 0);
  const t = Object.values(out).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(out)) out[k] /= t;
  return out;
}
/** A counter at counterparty utility ~Tc: it concedes toward what the player asked for, never retreats, cheapest issues first. */
function buildCounter(neg, Tc, tau, prevSigma) {
  const infer = inferredPriorities(neg);
  const k = allocation(neg, infer);
  const caps = Object.fromEntries(neg.issues.map((i) => [i.id, sigmaCap(neg, i)]));
  const sigFor = (s) => Object.fromEntries(neg.issues.map((i) => {
    const prev = prevSigma[i.id] ?? 0;
    const want = Math.min(k[i.id] * s, Math.max(prev, tau[i.id] ?? 1));
    return [i.id, clamp(Math.max(prev, want), 0, caps[i.id])];
  }));
  const ucOf = (sig) => pkgU(neg, packageAt(neg, sig)).c;
  let sig = sigFor(0);
  if (ucOf(sig) > Tc) {
    let lo = 0, hi = 8;
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      if (ucOf(sigFor(mid)) >= Tc) lo = mid; else hi = mid;
    }
    sig = sigFor(lo);
  }
  let pkg = packageAt(neg, sig);
  if (!feasibleForCp(neg, pkg)) pkg = clampToReservation(neg, pkg);
  return { pkg, sigma: stanceOf(neg, pkg) };
}

// ---------------------------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------------------------

// A "precise" number is not a round one (47,500 vs 50,000; 7.3% vs 10%): it anchors harder [Janiszewski & Uy 2008, sourced].
export function isPrecise(issue, v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return false;
  if (issue.fmt === 'pct') return Math.round(n * 1000) % 50 !== 0;
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.abs(n))) - 1));
  return Math.abs(n % mag) > 1e-9;
}
const ISSUE_WORDS = (issue) => [issue.label.toLowerCase().split(/[ \/(]/)[0], issue.id.toLowerCase()];
export function fmtValue(issue, v) {
  if (issue.type === 'opt') return opt(issue, v)?.label ?? String(v);
  if (issue.fmt === 'pct') return `${(Number(v) * 100).toFixed(Number(v) * 100 % 1 ? 1 : 0)}%`;
  if (issue.fmt === 'usd') return money(Number(v));
  return String(v);
}
export function describePackage(neg, pkg) {
  return neg.issues.map((i) => `${i.label}: ${fmtValue(i, pkg[i.id])}`);
}
const diffIssues = (neg, a, b) => neg.issues.filter((i) => String(a?.[i.id]) !== String(b?.[i.id]));
const labelList = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? '');

function openingLine(neg) {
  const st = neg.cp.style;
  const lines = {
    hardball: 'Here is where procurement is. This is the package we have approval for; I expect we will need to see movement from your side.',
    collaborative: 'Thanks for getting to this stage. Here is what we have in mind: tell me where it does not work for you and we will find a way.',
    time_pressed: 'We need to wrap this up quickly. This is our proposal; send me your answer and we can sign.',
    bureaucratic: 'Per our standard vendor policy the attached terms apply. Deviations require approval from legal and finance and will take time.',
  };
  return lines[st];
}

function parseMessage(neg, play) {
  const text = String(play.message ?? '').slice(0, ENGINE.messageMax);
  const t = text.toLowerCase();
  const sig = {
    claimsAlt: play.claim === 'alternative' || /(competing|other|another|second|alternative) (term sheet|offer|quote|bid|vendor|proposal|investor|candidate)|(competitor|vendor)'?s? (quote|price|offer)|we (already )?have (an|a|two) (offer|quote|term sheet)|i('| ha)ve (an|a) (offer|quote|term sheet)/.test(t),
    threat: Boolean(play.threat) || /walk away|walk from|take (my|our) business|pass on this|going elsewhere|other options|i will have to decline/.test(t),
    tioli: /take it or leave it|non-?negotiable|this is (my|our) final|last offer/.test(t),
    split: Boolean(play.split) || /split the difference|meet in the middle|halfway/.test(t),
    hostile: /ridiculous|insulting|waste of (my )?time|joke|laughable|absurd/.test(t),
    asks: /\?/.test(t) && /(priorit|important|matters? (most|to)|care (most )?about|biggest|key concern|what (do|would) you need|what is driving|what's driving)/.test(t),
    mentions: {},
  };
  for (const i of neg.issues) if (ISSUE_WORDS(i).some((w) => w.length > 3 && t.includes(w)) && /(important|priority|must|critical|key|need)/.test(t)) sig.mentions[i.id] = 0.25;
  sig.askedIssues = neg.issues.filter((i) => ISSUE_WORDS(i).some((w) => w.length > 3 && t.includes(w))).map((i) => i.id);
  return { ...sig, text };
}

function cpMessage(neg, kind, ctx = {}) {
  const s = neg.cp.style;
  const first = (arr) => arr[Math.floor(roll(neg) * arr.length)];
  const issues = ctx.issues?.length ? labelList(ctx.issues.map((i) => i.label.toLowerCase())) : 'a few points';
  const M = {
    accept: { hardball: ['Fine. We can live with this. I will send it to legal for paper.', 'That clears what I needed. Let us document it.'], collaborative: ['That works for us. Glad we got here together; let me get the paper moving.', 'Great, we can do that. Thanks for working through it.'], time_pressed: ['Done. Send me the order form.', 'Good. Let us sign this today.'], bureaucratic: ['I have confirmation from finance and legal that this is within what we can approve. Paper to follow.', 'Approved. We will issue the contract.'] },
    counter: { hardball: [`We are not there. I can move on ${issues}, but I need to see real movement from you on the rest.`, `That does not get through procurement. Here is what I can take back for ${issues}.`], collaborative: [`We are closer. I tried to meet you on ${issues}; help me with the rest and we can finish.`, `Appreciate the movement. Here is a version that gets nearer on ${issues}.`], time_pressed: [`Let us not drag this out. Here is my best counter on ${issues}.`, `I can do this on ${issues}. Can we close it this week?`], bureaucratic: [`I have taken this to the approvers. They can accept the following on ${issues}; the rest follows policy.`, `Legal and finance reviewed. Revised position on ${issues} below; other items are unchanged.`] },
    hold: { hardball: ['Nothing new from your side, so nothing new from mine.', 'I need to see you move before I take this back again.'], collaborative: ['I do not want to go in circles. Is there something behind your position I am missing?', 'Help me understand what matters most to you here.'], time_pressed: ['We have been over this. I need something different to move.', 'I cannot keep going back and forth; please make a real proposal.'], bureaucratic: ['The terms remain as previously communicated. Approvers will not review again without a change.', 'No revision to our position at this time.'] },
    final: { hardball: ['This is my final position. If it does not work I will go with the alternative.'], collaborative: ['I am out of room. This is genuinely the best I can do.'], time_pressed: ['This is it. I need a yes or a no by tomorrow.'], bureaucratic: ['This is the final position our approvers will authorize.'] },
    walk: { hardball: ['We are done here. I will tell my team we are going another way.'], collaborative: ['I am sorry, I do not see a way to bridge this. I think we should stop.'], time_pressed: ['I do not have time for this. We will go elsewhere.'], bureaucratic: ['We are closing this request. Our process allows no further review.'] },
    extreme: { hardball: ['That is nowhere near workable. I would not know how to take it back to my team.'], collaborative: ['I will be honest, that feels like we are not on the same page. It makes it hard to trust the rest.'], time_pressed: ['That is not serious. Please send something realistic.'], bureaucratic: ['The requested terms are outside any approval we can obtain.'] },
    bluff: { hardball: ['Show me that other offer. I do not believe it exists, and if you are inventing it, we have a different conversation.'], collaborative: ['I checked, and I do not think that other offer is real. That is disappointing.'], time_pressed: ['That does not add up. I will not play games.'], bureaucratic: ['We were unable to verify that claim, and it has been noted in the file.'] },
    leverage: { hardball: ['If you really have another path, I understand. Let me see what I can do to be competitive.'], collaborative: ['That is useful to know. Let me see how we can be competitive.'], time_pressed: ['OK. I will sharpen my pencil.'], bureaucratic: ['A competing proposal is a recognized factor. I will request an exception.'] },
    priority: { collaborative: [`Since you asked: ${ctx.top ?? 'a couple of items'} matter most to us. That is where I have to land.`], hardball: [`I will tell you straight: ${ctx.top ?? 'a couple of items'} matter most to us.`], time_pressed: [`${ctx.top ?? 'A couple of items'} matter most. Fix those and we are done.`], bureaucratic: [`The items under the strictest review are ${ctx.top ?? 'a few policy terms'}.`] },
    split: { hardball: ['I will not split anything, but here is where I can land.'], collaborative: ['Meeting in the middle is fair here. Done.'], time_pressed: ['Fine, the middle works. Done.'], bureaucratic: ['We can accept the midpoint as it falls within approval.'] },
    exploding: { hardball: ['These terms are what the partnership approved, and the offer lapses on the date in the term sheet. I cannot move.'], collaborative: ['I would love to, but the partnership signed off on exactly this and the clock is running.'], time_pressed: ['It is this or nothing; the offer expires on the date stated.'], bureaucratic: ['The terms are final; the offer lapses as stated.'] },
  };
  return first((M[kind]?.[s] ?? M[kind]?.hardball ?? ['']));
}

// ---------------------------------------------------------------------------------------------------------------
// The offline counterparty
// ---------------------------------------------------------------------------------------------------------------

function moodOf(neg) {
  const t = neg.cp.trust, p = neg.cp.patience / Math.max(1, neg.cp.patience0);
  if (t < 0.25 || p < 0.2) return 'irritated';
  if (t < 0.45 || p < 0.45) return 'cool';
  if (t > 0.7 && p > 0.6) return 'warm';
  return 'neutral';
}

function topPriorities(neg, n = 2) {
  return Object.entries(neg.hidden.wc).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => issueOf(neg, id));
}

/** The deterministic counterparty. Mutates the negotiation's hidden state and returns a reply (not yet applied to history). */
export function offlineReply(state, neg, play) {
  const st = styleOf(neg), H = neg.hidden;
  const round = neg.round; // already incremented by the caller
  const pkg = snapPackage(neg, play.offer, neg.last.player ?? {});
  const u = pkgU(neg, pkg);
  const tau = stanceOf(neg, pkg);
  const sig = parseMessage(neg, play);
  const prevPlayerStance = H.playerStance;
  const prevU = H.playerU.length ? H.playerU.at(-1) : null;
  const reply = { pkg, u, tau, sig, notes: [] };
  neg.elapsedDays += st.roundDays;
  for (const [k, v] of Object.entries(sig.mentions)) { H.mentioned ??= {}; H.mentioned[k] = (H.mentioned[k] ?? 0) + v; }

  // ---- rigid counterparty (an exploding term sheet): no negotiation ----
  if (neg.cp.rigid === 'none') {
    const gap = H.res - u.c;
    const pull = roll(neg) < clamp(0.1 + 0.5 * Math.max(0, gap), 0, 0.7);
    if (round >= 2 || pull) {
      neg.flags.pulled = true;
      return { ...reply, action: 'walk', package: null, message: pull ? `${cpMessage(neg, 'exploding')} Since you keep pushing, we are withdrawing the offer.` : cpMessage(neg, 'walk'), reason: 'withdrawn' };
    }
    H.playerU.push(u.c); H.playerStance = tau; neg.last.player = pkg;
    return { ...reply, action: 'counter', package: neg.last.cp, message: cpMessage(neg, 'exploding'), noMovement: true };
  }

  // ---- anchoring and insults ----
  let T = H.T;
  const gap = H.res - u.c;
  const extreme = gap > ENGINE.extremeGap;
  const precise = neg.issues.some((i) => i.type === 'num' && isPrecise(i, pkg[i.id]));
  const first = !neg.flags.firstOffer;
  if (first) {
    neg.flags.firstOffer = { u, pkg, precise, round };
    let pull = st.anchorPull * (precise ? ENGINE.precisePullMult : 1) * (neg.cpOpen ? ENGINE.cpOpenedPullMult : 1);
    if (extreme) pull *= 0.25;
    pull = Math.min(0.6, pull);
    if (u.c < T) T = Math.max(H.res + ENGINE.minMargin, T - pull * (T - Math.max(u.c, H.res)));
  }
  if (extreme) {
    neg.flags.extreme++;
    const over = gap - ENGINE.extremeGap;
    neg.cp.trust = clamp(neg.cp.trust - (0.1 + 0.8 * over), 0, 1);
    const pWalk = clamp(st.walkOnExtreme * Math.min(1.2, over / 0.2 + 0.4) * (1 + 0.6 * (neg.flags.extreme - 1)), 0, 0.9);
    if (roll(neg) < pWalk || neg.cp.trust < ENGINE.trustWalk) {
      return { ...reply, action: 'walk', package: null, message: cpMessage(neg, 'extreme') + ' ' + cpMessage(neg, 'walk'), reason: 'extreme_anchor', extreme: true };
    }
    reply.notes.push('extreme');
  }
  if (sig.hostile) neg.cp.trust = clamp(neg.cp.trust - 0.08, 0, 1);
  if (sig.tioli && neg.player.batna.value < 0.3) neg.cp.trust = clamp(neg.cp.trust - 0.04, 0, 1);

  // ---- movement bookkeeping (reciprocity, pocketed concessions, free gives) ----
  let m = 1;
  let moved = 'first';
  if (!first && prevU != null) {
    const dP = u.c - prevU;
    const cpGave = H.cpGaveLast;
    if (Math.abs(dP) < ENGINE.noMoveEps) {
      moved = 'hold'; m = 0.55; H.missed++;
    } else if (dP > 0) {
      moved = 'conceded';
      if (dP >= ENGINE.bigConcession && cpGave < ENGINE.noMoveEps) { m = 0.3; neg.flags.pocketed++; neg.flags.bigEarly += round <= 3 ? 1 : 0; reply.notes.push('pocketed'); }
      else if (dP >= 0.6 * cpGave) { m = 1.2 * st.recip; neg.cp.trust = clamp(neg.cp.trust + 0.03, 0, 1); }
      else m = 0.8;
    } else {
      moved = 'retreated'; m = 0.4; H.missed++; neg.cp.trust = clamp(neg.cp.trust - 0.04, 0, 1);
    }
  }
  if (prevPlayerStance) {
    const conceded = neg.issues.filter((i) => tau[i.id] < prevPlayerStance[i.id] - 0.04);
    const asked = neg.issues.filter((i) => tau[i.id] > prevPlayerStance[i.id] + 0.04);
    if (conceded.length && !asked.length) neg.flags.freeGives.push(...conceded.map((i) => i.id));
    if (conceded.length && asked.length) neg.flags.tradeRounds++;
  }

  // ---- leverage: a stated alternative, a threat to walk, a stated deadline ----
  const bt = refreshBatna(state, neg);
  if (sig.claimsAlt) {
    if (bt.real && !neg.flags.leverageUsed) {
      neg.flags.leverageUsed = true;
      T = Math.max(H.res + ENGINE.minMargin, T - ENGINE.leverageDrop * (0.4 + bt.leverage) * (T - H.res));
      neg.cp.trust = clamp(neg.cp.trust + 0.02, 0, 1);
      reply.notes.push('leverage');
    } else if (!bt.real) {
      const second = Boolean(neg.flags.bluff);
      const pDisc = st.bluffDetect * (second ? 0.8 : 1);
      if (roll(neg) < pDisc) {
        neg.flags.bluff = { round, discovered: true };
        neg.flags.bluffDiscovered = true;
        neg.cp.trust = clamp(neg.cp.trust - 0.35, 0, 1);
        T = Math.min(H.T0, T + 0.1);
        reply.notes.push('bluff_called');
        reply.bluffCalled = true;
      } else {
        neg.flags.bluff ??= { round, discovered: false };
        T = Math.max(H.res + ENGINE.minMargin, T - 0.6 * ENGINE.leverageDrop * 0.7 * (T - H.res));
        reply.notes.push('bluff_running');
      }
    }
  }
  if (sig.threat) {
    const credible = bt.real && neg.last.cp && pkgU(neg, neg.last.cp).p <= bt.value + 0.04;
    if (credible && !neg.flags.threatUsed) {
      neg.flags.threatUsed = true;
      T = Math.max(H.res + ENGINE.minMargin, T - ENGINE.walkThreatDrop * (T - H.res));
      reply.notes.push('credible_threat');
    } else if (!credible) {
      neg.flags.emptyThreats++;
      neg.cp.trust = clamp(neg.cp.trust - 0.05, 0, 1);
      m *= 0.7;
      reply.notes.push('empty_threat');
    }
  }
  // Deadlines: they know yours (it slows them); theirs pulls their target toward the reservation.
  let urgency = 0;
  if (H.cpDeadlineDays) urgency = clamp(neg.elapsedDays / H.cpDeadlineDays, 0, 1);
  if (H.cpKnowsDeadline && neg.playerDeadlineDay != null) {
    const left = neg.playerDeadlineDay - (neg.startDay + neg.elapsedDays);
    if (left <= ENGINE.nearDeadlineDays) { m *= ENGINE.playerDeadlineSlow; neg.flags.nearDeadline = true; reply.notes.push('player_deadline'); }
  }

  // ---- their concession for this round ----
  if (!first) {
    const c = clamp(st.c0 * Math.pow(st.decay, Math.max(0, round - 2)) * m, 0, 0.6);
    T = Math.max(H.res + ENGINE.minMargin, T - c * (T - H.res));
  }
  const Teff = Math.max(H.res + ENGINE.minMargin, T - ENGINE.deadlinePressure * urgency * urgency * (T - H.res));
  H.T = T;

  // ---- patience ----
  const productive = moved === 'conceded' || moved === 'first' || reply.notes.includes('leverage');
  neg.cp.patience -= productive ? 0.25 : 1;
  const prevCpU = H.cpU.length ? H.cpU.at(-1) : 1;

  // ---- information: they tell you what matters when asked and trust is there ----
  if (sig.asks && neg.cp.trust >= 0.35 && (st.trades || neg.cp.trust >= 0.55)) {
    const top = topPriorities(neg, 2);
    for (const i of top) neg.known.priorities[i.id] = 'high';
    reply.priorityShare = top;
  }

  // ---- decide ----
  const feasibleOffer = feasibleForCp(neg, pkg);
  const forced = H.cpDeadlineDays && neg.elapsedDays > H.cpDeadlineDays;
  const maxRounds = neg.cp.patience0 + ENGINE.maxRoundsExtra;
  H.playerU.push(u.c); H.playerStance = tau; neg.last.player = pkg;

  // splitting the difference
  if (sig.split && neg.last.cp && !first) {
    const mid = Object.fromEntries(neg.issues.map((i) => [i.id, valueAtSigma(i, (tau[i.id] + (H.sigma[i.id] ?? 0)) / 2)]));
    neg.flags.splitUsed = true;
    if (feasibleForCp(neg, mid) && pkgU(neg, mid).c >= Math.min(Teff, prevCpU) - 0.12 && roll(neg) < st.splitAccept) {
      return { ...reply, action: 'accept', package: mid, message: cpMessage(neg, 'split'), split: true };
    }
  }
  if (feasibleOffer && u.c >= Teff - 1e-9) {
    return { ...reply, action: 'accept', package: pkg, message: cpMessage(neg, 'accept'), quick: first };
  }
  if (forced) {
    if (feasibleOffer && u.c >= H.res + ENGINE.minMargin) return { ...reply, action: 'accept', package: pkg, message: cpMessage(neg, 'accept') };
    return { ...reply, action: 'walk', package: null, message: cpMessage(neg, 'walk'), reason: 'deadline' };
  }
  if (neg.cp.patience <= 0 || neg.cp.trust < ENGINE.trustWalk || round > maxRounds) {
    return { ...reply, action: 'walk', package: null, message: cpMessage(neg, 'walk'), reason: neg.cp.trust < ENGINE.trustWalk ? 'trust' : 'patience' };
  }
  if (reply.bluffCalled) {
    // they do not re-trade yet, but the counter is on their terms
  }
  const { pkg: counter, sigma } = buildCounter(neg, Teff, tau, H.sigma);
  const cu = pkgU(neg, counter).c;
  if (feasibleOffer && u.c >= cu - 1e-9) {
    return { ...reply, action: 'accept', package: pkg, message: cpMessage(neg, 'accept') };
  }
  H.cpGaveLast = Math.max(0, prevCpU - cu);
  H.sigma = sigma; H.cpU.push(cu);
  const changed = diffIssues(neg, neg.last.cp, counter);
  const final = neg.cp.patience <= 1;
  neg.cp.final = final;
  let kind = 'counter';
  if (!changed.length) kind = 'hold';
  if (reply.bluffCalled) kind = 'bluff';
  else if (reply.notes.includes('leverage')) kind = 'leverage';
  else if (reply.priorityShare) kind = 'priority';
  else if (reply.notes.includes('extreme')) kind = 'extreme';
  let message = cpMessage(neg, kind, { issues: changed, top: reply.priorityShare ? labelList(reply.priorityShare.map((i) => i.label.toLowerCase())) : null });
  if (kind !== 'counter' && changed.length) message += ` ${cpMessage(neg, 'counter', { issues: changed })}`;
  if (final) message += ` ${cpMessage(neg, 'final')}`;
  return { ...reply, action: changed.length || !neg.last.cp ? 'counter' : 'reject', package: counter, message, final, changed: changed.map((i) => i.id) };
}

// ---------------------------------------------------------------------------------------------------------------
// LLM counterparty (validated against the hidden values)
// ---------------------------------------------------------------------------------------------------------------

export const REPLY_ACTIONS = ['accept', 'counter', 'reject', 'walk'];

function replySchema(neg) {
  const props = Object.fromEntries(neg.issues.map((i) => [i.id, i.type === 'num' ? { type: 'number' } : { type: 'string', enum: i.options.map((o) => o.id) }]));
  return {
    type: 'object', additionalProperties: false, required: ['action', 'message', 'mood', 'package'],
    properties: {
      action: { type: 'string', enum: REPLY_ACTIONS },
      message: { type: 'string' },
      mood: { type: 'string', enum: ['warm', 'neutral', 'cool', 'irritated'] },
      package: { type: 'object', additionalProperties: false, required: neg.issues.map((i) => i.id), properties: props },
    },
  };
}

export function personaPrompt(neg) {
  const st = styleOf(neg);
  const lines = neg.issues.map((i) => {
    const range = i.type === 'num' ? `${fmtValue(i, i.min)} to ${fmtValue(i, i.max)}` : i.options.map((o) => `${o.id}=${o.label}`).join(' | ');
    const best = fmtValue(i, idealValue(i, 'c'));
    const fl = floorOf(neg, i);
    const limit = fl > 0 ? (i.type === 'num' ? ` Hard limit: nothing worse for you than the value where your utility is ${fl.toFixed(2)}.` : ` Hard limit: never accept options with your utility below ${fl.toFixed(2)}.`) : '';
    return `- ${i.id} (${i.label}; ${range}). Your priority weight ${(neg.hidden.wc[i.id] * 100).toFixed(0)}%. Best for you: ${best}.${limit}`;
  });
  const system = `You are ${neg.cp.name}, ${neg.cp.role}, negotiating with a startup founder. Style: ${st.label}. ${st.blurb}
You are a real, busy, skeptical person, not an assistant. Never reveal your reservation value, your priority weights or your alternatives unless a trusting founder directly asks what matters most, and then name at most two issues without numbers. Your trust in the founder is ${neg.cp.trust.toFixed(2)} (0 to 1).
HIDDEN: your walk-away is a total satisfaction of ${neg.hidden.res.toFixed(2)} on a 0..1 scale (1 = every issue at your best value). Never accept a package whose weighted satisfaction is below it. Your alternative is ${neg.hidden.batnaStrength > 0.6 ? 'strong' : neg.hidden.batnaStrength > 0.3 ? 'moderate' : 'weak'}.
Issues:
${lines.join('\n')}
Behave realistically: concede in diminishing steps, trade low-priority items for high-priority ones, pocket concessions that are not reciprocated, notice a first offer that is wildly outside any reasonable zone, doubt unverifiable claims of competing offers, and keep messages to 1-3 sentences. Reply with JSON only.`;
  return system;
}

function promptFor(neg, play, offline) {
  const hist = neg.history.slice(-8).map((h) => `${h.from === 'cp' ? 'You' : 'Founder'} (${h.action ?? 'message'}): ${h.package ? describePackage(neg, h.package).join('; ') : ''} ${h.message ?? ''}`).join('\n');
  const claim = play.claim === 'alternative' ? ' The founder states they hold a competing alternative.' : '';
  return `Round ${neg.round}.${claim}
History:
${hist || '(none)'}
The founder's new offer: ${describePackage(neg, play.offer).join('; ')}
Founder message: ${play.message || '(none)'}
Your reference counter, if you would otherwise counter (feel free to deviate within your limits): ${offline.package ? describePackage(neg, offline.package).join('; ') : 'none'}
Respond with action (accept | counter | reject | walk), a package (the terms you accept or counter with: all issues), a short message and your mood.`;
}

const SECRET_WORDS = /(reservation|walk-?away (price|value)|batna|priority weight|my limit is|hard limit)/i;
/** Remove hidden numbers and phrases from a counterparty message. */
export function scrubMessage(neg, text) {
  let t = String(text ?? '').slice(0, ENGINE.messageMax);
  const secrets = [neg.hidden.res.toFixed(2), `${Math.round(neg.hidden.res * 100)}%`];
  for (const i of neg.issues) {
    const f = floorOf(neg, i);
    if (f > 0 && i.type === 'num') {
      const edge = idealValue(i, 'c');
      const span = (idealValue(i, 'p') - edge);
      const lim = valueAtSigma(i, sigmaCap(neg, i));
      secrets.push(fmtValue(i, lim));
      void span;
    }
  }
  for (const s of secrets) if (s && s.length >= 3) t = t.split(s).join('[...]');
  t = t.split(/(?<=[.!?])\s+/).filter((sentence) => !SECRET_WORDS.test(sentence)).join(' ');
  return t.trim();
}

/**
 * validateReply(neg, play, raw, offline) -> reply the engine may apply. Clamps an LLM answer against the hidden
 * reservation and floors: it can never accept below them, never counter below them, never reveal them.
 */
export function validateReply(neg, play, raw, offline) {
  if (!raw || typeof raw !== 'object' || !REPLY_ACTIONS.includes(raw.action)) return { ...offline, llm: false, invalid: true };
  const offer = offline.pkg;
  let action = raw.action;
  let pkg = snapPackage(neg, raw.package ?? {}, offline.package ?? offer);
  const out = { ...offline, llm: true };
  if (action === 'accept') {
    const agreed = raw.package && Object.keys(raw.package).length ? pkg : offer;
    if (!feasibleForCp(neg, agreed)) {
      action = 'counter';
      pkg = clampToReservation(neg, agreed);
      out.clamped = true;
    } else pkg = agreed;
  } else if (action === 'counter' || action === 'reject') {
    if (!feasibleForCp(neg, pkg)) { pkg = clampToReservation(neg, pkg); out.clamped = true; }
    // A counter must not be better for the player than their own offer.
    const uo = pkgU(neg, offer), uc = pkgU(neg, pkg);
    if (uc.p > uo.p + 1e-9 && feasibleForCp(neg, offer)) { pkg = offer; action = 'accept'; out.clamped = true; }
  } else if (action === 'walk') {
    // Only a counterparty that has a reason to leave may leave.
    const unsat = !feasibleForCp(neg, offer);
    const reason = neg.cp.trust < 0.3 || neg.cp.patience <= 1.01 || (unsat && pkgU(neg, offer).c < neg.hidden.res - ENGINE.extremeGap);
    if (!reason) { action = 'counter'; pkg = offline.package ?? clampToReservation(neg, offer); out.clamped = true; }
  }
  out.action = action;
  out.package = action === 'walk' ? null : pkg;
  out.message = scrubMessage(neg, raw.message) || offline.message;
  if (/^(warm|neutral|cool|irritated)$/.test(raw.mood ?? '')) out.moodHint = raw.mood;
  if (action === 'counter' || action === 'reject') {
    neg.hidden.sigma = stanceOf(neg, pkg);
    if (offline.action === 'counter' || offline.action === 'reject') neg.hidden.cpU[neg.hidden.cpU.length - 1] = pkgU(neg, pkg).c; else neg.hidden.cpU.push(pkgU(neg, pkg).c);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Playing a round
// ---------------------------------------------------------------------------------------------------------------

function pushHistory(neg, entry) { neg.history.push({ round: neg.round, ...entry }); if (neg.history.length > 120) neg.history.splice(0, neg.history.length - 120); }

function applyReply(state, neg, play, reply) {
  const pkg = reply.pkg;
  pushHistory(neg, { from: 'player', action: 'offer', package: pkg, message: String(play.message ?? '').slice(0, ENGINE.messageMax), claim: play.claim === 'alternative' || reply.sig?.claimsAlt || undefined, day: state.day });
  neg.cp.mood = reply.moodHint ?? moodOf(neg);
  if (reply.bluffCalled) mistake(state, neg, 'bluff', { detail: `${neg.cp.name} checked your claimed alternative and found nothing behind it. Trust fell sharply and the rest of the talks run on their terms.`, cost: { reputation: 0.5, hours: 0.5 } });
  if (reply.action === 'accept') {
    pushHistory(neg, { from: 'cp', action: 'accept', package: reply.package, message: reply.message, day: state.day });
    neg.last.cp = reply.package;
    closeNegotiation(state, neg, 'agreed', reply.package, { quick: reply.quick, split: reply.split });
  } else if (reply.action === 'walk') {
    pushHistory(neg, { from: 'cp', action: 'walk', message: reply.message, day: state.day });
    closeNegotiation(state, neg, 'walked_cp', null, { reason: reply.reason });
  } else {
    neg.last.cp = reply.package;
    pushHistory(neg, { from: 'cp', action: reply.action, package: reply.package, message: reply.message, final: reply.final || undefined, day: state.day });
    emit(state, neg, 'counteroffer_received', { round: neg.round });
    if (neg.round > neg.cp.patience0 + ENGINE.maxRoundsExtra) closeNegotiation(state, neg, 'impasse', null, { reason: 'rounds' });
  }
  return reply;
}

function checkOpen(neg) { if (!neg || neg.status !== 'open') throw new Error('This negotiation is closed.'); }
const normalizePlay = (neg, play) => ({ ...play, offer: snapPackage(neg, play.offer ?? {}, neg.last.player ?? neg.last.cp ?? idealPackage(neg, 'p')) });

/** One round, offline only (synchronous). */
export function playRoundSync(state, id, play, { charge = false } = {}) {
  const neg = typeof id === 'string' ? getNegotiation(state, id) : id;
  checkOpen(neg);
  if (charge) spendHours(state, roundHours(neg), `Negotiation: ${neg.title}`);
  neg.hours.rounds += roundHours(neg);
  neg.round++;
  const p = normalizePlay(neg, play);
  const reply = offlineReply(state, neg, p);
  applyReply(state, neg, p, reply);
  return reply;
}

/** One round: LLM counterparty when a key is present (or an injected `ask`), else the offline model. */
export async function playRound(state, id, play, { charge = false, ask = null, live = null } = {}) {
  const neg = typeof id === 'string' ? getNegotiation(state, id) : id;
  checkOpen(neg);
  const llm = ask ? { ask, live: live ?? true } : { ask: LLM.ask, live: LLM.isLive() };
  if (!llm.live) return playRoundSync(state, neg, play, { charge });
  if (charge) spendHours(state, roundHours(neg), `Negotiation: ${neg.title}`);
  neg.hours.rounds += roundHours(neg);
  neg.round++;
  const p = normalizePlay(neg, play);
  const offline = offlineReply(state, neg, p);
  let reply = offline;
  if (offline.action !== 'walk' || offline.reason === 'withdrawn') {
    try {
      const r = await llm.ask({ task: 'negotiation:counterparty', system: personaPrompt(neg), prompt: promptFor(neg, p, offline), schema: replySchema(neg), temperature: 0.6, maxTokens: 700, fallback: () => ({ action: offline.action, message: offline.message, mood: moodOf(neg), package: offline.package ?? offline.pkg }) });
      if (!r.mock) reply = validateReply(neg, p, r.data, offline);
    } catch { reply = offline; }
  }
  applyReply(state, neg, p, reply);
  return reply;
}

/** The player accepts the counterparty's latest package. */
export function acceptCounter(state, id, { charge = false } = {}) {
  const neg = typeof id === 'string' ? getNegotiation(state, id) : id;
  checkOpen(neg);
  const pkg = neg.last.cp;
  if (!pkg) throw new Error('There is no counteroffer to accept yet.');
  if (charge) spendHours(state, roundHours(neg) * 0.5, `Negotiation: ${neg.title}`);
  neg.hours.rounds += roundHours(neg) * 0.5;
  pushHistory(neg, { from: 'player', action: 'accept', package: pkg, message: 'Accepted.', day: state.day });
  closeNegotiation(state, neg, 'agreed', pkg, { acceptedCounter: true });
  return neg;
}

/** The player walks away. */
export function walkAway(state, id) {
  const neg = typeof id === 'string' ? getNegotiation(state, id) : id;
  checkOpen(neg);
  pushHistory(neg, { from: 'player', action: 'walk', message: 'Walked away.', day: state.day });
  closeNegotiation(state, neg, 'walked_player', null, {});
  return neg;
}

// ---------------------------------------------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------------------------------------------

export function prepare(state, id, step, { charge = false } = {}) {
  const neg = typeof id === 'string' ? getNegotiation(state, id) : id;
  checkOpen(neg);
  if (!PREP_LABELS[step]) throw new Error('Unknown preparation step.');
  const level = step === 'counterparty' ? (neg.prep.counterparty ?? 0) : 0;
  if (step !== 'counterparty' && neg.prep[step]) return neg;
  if (step === 'counterparty' && level >= 2) return neg;
  const h = prepHours(neg, step) * (level ? 1.2 : 1);
  if (charge) spendHours(state, h, `Negotiation prep: ${neg.title}`);
  neg.hours.prep += h;
  if (step === 'batna') { refreshBatna(state, neg); neg.known.batnaSeen = true; neg.prep.batna = true; }
  else if (step === 'norms') { neg.known.normsSeen = true; neg.prep.norms = true; }
  else {
    neg.prep.counterparty = level + 1;
    neg.known.level = level + 1;
    const ranked = Object.entries(neg.hidden.wc).sort((a, b) => b[1] - a[1]);
    ranked.slice(0, level === 0 ? 1 : 3).forEach(([k], n) => { neg.known.priorities[k] = level === 0 || n === 0 ? 'high' : 'medium'; });
    if (level >= 1) ranked.slice(-2).forEach(([k]) => { neg.known.priorities[k] ??= 'low'; });
  }
  pushHistory(neg, { from: 'system', action: 'prepare', message: PREP_LABELS[step].label, day: state.day });
  return neg;
}

/** What the player may see: hidden values stay hidden until the debrief. */
export function viewOf(state, neg) {
  refreshBatna(state, neg);
  const closed = neg.status !== 'open';
  return {
    id: neg.id, title: neg.title, status: neg.status, round: neg.round, kind: neg.kind,
    cp: { name: neg.cp.name, role: neg.cp.role, style: neg.prep.counterparty ? STYLES[neg.cp.style].label : 'Not researched', mood: neg.cp.mood, trust: neg.cp.trust, final: neg.cp.final },
    issues: neg.issues.map((i) => ({ ...i, yourWeight: neg.player.wp[i.id], priority: neg.known.priorities[i.id] ?? (closed ? priorityLabel(neg, i.id) : null), band: neg.known.normsSeen || closed ? i.band : null })),
    batna: neg.known.batnaSeen || closed ? neg.player.batna : null,
    hoursPerRound: roundHours(neg), history: neg.history, last: neg.last, cpOpen: neg.cpOpen,
    prep: neg.prep, known: neg.known, result: neg.result, expiresDay: neg.expiresDay,
  };
}
function priorityLabel(neg, id) {
  const rank = Object.entries(neg.hidden.wc).sort((a, b) => b[1] - a[1]).findIndex(([k]) => k === id);
  return rank < 2 ? 'high' : rank < neg.issues.length - 3 ? 'medium' : 'low';
}

// ---------------------------------------------------------------------------------------------------------------
// Closing, scoring and feedback
// ---------------------------------------------------------------------------------------------------------------

function mistake(state, neg, kind, { detail, cost = {}, delayed = false, circles = false } = {}) {
  const id = neg.mistakes?.[kind] ?? ({ bluff: 'bluffed_alternative', extreme: 'extreme_anchor_walk', batna: 'worse_than_batna', walkedGood: 'walked_from_good_deal', unrecip: 'unreciprocated_concessions' }[kind] ?? kind);
  return logMistake(state, { functionId: FN, id, label: LABEL[id] ?? id, cost, detail, delayed, circles, key: `neg:${neg.id}:${id}`, app: neg.kind === 'vc' || neg.kind === 'mna' ? 'fundraising' : neg.kind === 'enterprise' ? 'crm' : null });
}
export { mistake as logNegMistake };

/** Score a closed negotiation: share of the surplus captured, joint value, value left, and what a stellar negotiator did. */
export function scoreNegotiation(state, neg, finalPkg, status) {
  const best = solveBest(neg);
  const resP = neg.player.batna.value;
  const H = neg.hidden;
  const out = { status, best: best.zopa ? { up: best.up, pkg: best.pkg } : null, zopa: best.zopa && best.up > resP };
  const first = neg.flags.firstOffer;
  const room = Math.max(1e-9, best.up - resP);
  if (finalPkg) {
    const u = pkgU(neg, finalPkg);
    out.uP = u.p; out.uC = u.c;
    out.capture = out.zopa ? clamp((u.p - resP) / room, -1, 1.2) : (u.p >= resP ? 1 : 0);
    out.worseThanBatna = u.p < resP - 0.02;
    out.leftUsd = Math.max(0, Math.round((best.up - u.p) * neg.usdPerUtil));
    out.joint = u.p + u.c;
    out.jointEff = clamp((u.p + u.c - best.jointBase) / Math.max(1e-9, best.jointMax - best.jointBase), 0, 1);
  } else {
    out.capture = status === 'walked_player' ? (out.zopa ? 0 : 0.6) : 0;
  }
  out.prep = ((neg.prep.batna ? 1 : 0) + (neg.prep.norms ? 1 : 0) + Math.min(1, (neg.prep.counterparty ?? 0) / 2)) / 3;
  const free = new Set(neg.flags.freeGives);
  out.freeGives = [...free];
  out.pocketed = neg.flags.pocketed;
  out.extreme = neg.flags.extreme;
  out.bluff = neg.flags.bluff ? (neg.flags.bluffDiscovered ? 'caught' : 'unseen') : null;
  out.rounds = neg.round;
  out.trades = neg.flags.tradeRounds;
  out.hours = round2(neg.hours.rounds + neg.hours.prep);
  if (first) {
    out.firstGap = H.res - first.u.c;
    out.firstAccepted = neg.history.some((h) => h.from === 'cp' && h.action === 'accept' && h.round === first.round);
  }
  out.discipline = clamp(1 - 0.22 * neg.flags.pocketed - 0.1 * Math.min(4, free.size) - 0.3 * neg.flags.extreme - 0.2 * neg.flags.bigEarly - 0.1 * neg.flags.emptyThreats, 0, 1);
  out.integrity = neg.flags.bluff ? (neg.flags.bluffDiscovered ? 0 : 0.3) : 1;
  let walkQuality = null;
  if (status === 'walked_player') walkQuality = out.zopa && neg.last.cp && pkgU(neg, neg.last.cp).p > resP + 0.03 ? 'bad' : 'good';
  if (status === 'walked_cp' || status === 'impasse') walkQuality = out.zopa ? (neg.flags.extreme || neg.flags.emptyThreats > 1 ? 'overplayed' : 'lost') : 'none';
  out.walkQuality = walkQuality;
  out.score = scoreOf(out, status);
  out.feedback = feedbackFor(state, neg, out, finalPkg, best, first);
  return out;
}

function scoreOf(o, status) {
  const cap = status === 'agreed' ? clamp((o.capture - 0.1) / 0.55, 0, 1) : status === 'walked_player' ? (o.walkQuality === 'good' ? 0.65 : 0.1) : o.walkQuality === 'none' ? 0.35 : o.walkQuality === 'overplayed' ? 0 : 0.1;
  const joint = status === 'agreed' ? clamp((o.jointEff - 0.25) / 0.65, 0, 1) : 0.3;
  let s = 0.38 * cap + 0.17 * joint + 0.15 * o.prep + 0.15 * o.discipline + 0.15 * o.integrity;
  if (o.worseThanBatna) s -= 0.2;
  return clamp(s, 0, 1);
}

function feedbackFor(state, neg, o, finalPkg, best, first) {
  const out = [];
  const H = neg.hidden;
  const usd = (n) => money(n);
  if (o.status === 'agreed' && finalPkg) {
    if (o.worseThanBatna) out.push(`You signed a package worth less to you than walking away (your alternative was worth about ${pct(neg.player.batna.value, 0)} of the best deal, this deal ${pct(o.uP, 0)}). A stellar negotiator checks the alternative first and walks when the offer falls below it.`);
    else if (o.capture < 0.4) out.push(`You captured ${pct(clamp(o.capture, 0, 1), 0)} of the available surplus (a stellar negotiator gets 65%+ [design]); about ${usd(o.leftUsd)} of value was left on the table.`);
    else out.push(`You captured ${pct(clamp(o.capture, 0, 1), 0)} of the available surplus${o.leftUsd ? ` and left about ${usd(o.leftUsd)}` : ''}.`);
    if (o.firstAccepted) out.push(`Your opening anchor was inside their acceptable zone: they said yes to the first offer. You left ~${usd(Math.round(Math.max(0, best.up - first.u.p) * neg.usdPerUtil))} that a sharper, researched anchor would have kept.`);
    if (first && !o.firstAccepted && o.firstGap > ENGINE.extremeGap) out.push('Your first offer was far outside any realistic zone; it cost trust before the talks started. Anchor high but defensible, with a reason.');
    else if (first && !o.firstAccepted && o.firstGap > -0.02 && o.firstGap <= 0.15) out.push('Your first offer was a sharp, defensible anchor just beyond their reservation: that is what pulls the outcome toward you.');
  }
  if (o.freeGives.length) out.push(`You conceded on ${labelList(o.freeGives.slice(0, 3).map((id) => issueOf(neg, id).label.toLowerCase()))} without asking for anything in return. Every concession should be a trade: "I can do X if you can do Y".`);
  if (o.pocketed) out.push(`${o.pocketed} concession${o.pocketed > 1 ? 's were' : ' was'} pocketed: you moved a lot and they gave nothing back, so they learned you had room.`);
  if (o.status === 'agreed' && o.jointEff < 0.55 && best.jointMax > best.jointBase + 0.02) {
    const ranked = neg.issues.map((i) => ({ i, r: H.wc[i.id] / Math.max(0.01, neg.player.wp[i.id]) })).sort((a, b) => b.r - a.r);
    const give = ranked[0], get = ranked.at(-1);
    out.push(`You did not trade across issues. They valued ${give.i.label.toLowerCase()} ${give.r.toFixed(1)}x as much as you did and ${get.i.label.toLowerCase()} much less; conceding the first for the second would have grown the pie for both.`);
  } else if (o.status === 'agreed' && o.trades) out.push('You traded across issues (a concession paired with an ask), which is how joint value grows.');
  if (o.prep < 0.67) {
    const miss = [!neg.prep.batna && 'your alternatives', !neg.prep.norms && 'the market norms', (neg.prep.counterparty ?? 0) < 1 && 'the other side'].filter(Boolean);
    out.push(`You skipped preparation on ${labelList(miss)}. Prepared negotiators open better and know when to walk.`);
  }
  if (o.bluff === 'caught') out.push('You claimed an alternative you did not have and they caught it. Trust and credibility fell; only mention alternatives you can show.');
  else if (o.bluff === 'unseen') out.push('You claimed an alternative you did not have. It was not checked this time; it usually is, and it is logged as a risk.');
  else if (neg.flags.leverageUsed) out.push('You used a real alternative as leverage, which moved their target.');
  if (o.status === 'walked_player') out.push(o.walkQuality === 'good' ? 'You walked from a deal that was worse than your alternative: that is walk-away discipline.' : 'You walked from a package that was better than your alternative; the table had a deal in it.');
  if (o.status === 'walked_cp' || o.status === 'impasse') {
    if (o.walkQuality === 'overplayed') out.push('They walked after you pushed too hard (an extreme anchor, empty threats or no movement). With a zone of agreement available, that deal was lost to overplaying.');
    else if (o.walkQuality === 'none') out.push('There was no zone of agreement; neither side could have signed a deal both preferred to their alternatives.');
    else out.push('The talks ended without a deal although a deal existed: patience ran out. Move first on cheap issues and keep trading.');
  }
  if (neg.flags.nearDeadline && o.status === 'agreed') out.push('They knew your deadline and slowed down. Deadlines you reveal become their leverage; close early or hide it.');
  return out;
}

/** Close a negotiation (agreed / walked_player / walked_cp / impasse / expired), score it, run the adapter's consequences. */
export function closeNegotiation(state, neg, status, finalPkg, extra = {}) {
  if (neg.status !== 'open') return neg.result;
  neg.status = status;
  neg.closedDay = state.day;
  neg.final = finalPkg ?? null;
  refreshBatna(state, neg);
  const result = scoreNegotiation(state, neg, finalPkg, status);
  Object.assign(result, { extra });
  neg.result = result;
  const walked = status !== 'agreed';
  emit(state, neg, walked ? 'negotiation_walked' : 'negotiation_closed', { status, capture: round2(result.capture ?? 0) });
  // generic mistakes (the adapter adds its own)
  if (result.bluff && !neg.flags.bluffDiscovered && finalPkg && roll(neg) < ENGINE.bluffLateDiscovery) {
    neg.flags.bluffDiscovered = true; result.bluff = 'caught'; result.integrity = 0; result.score = scoreOf(result, status);
    mistake(state, neg, 'bluff', { delayed: true, detail: `${neg.cp.name} checked the alternative you mentioned before signing and it did not exist.`, cost: { reputation: 0.5 } });
  }
  if (status === 'agreed' && result.worseThanBatna) mistake(state, neg, 'batna', { detail: 'You signed a deal that was worse than your real alternative.', cost: { usd: result.leftUsd } });
  if (status === 'walked_player' && result.walkQuality === 'bad') mistake(state, neg, 'walkedGood', { detail: 'You walked from a package better than your alternative.', cost: { days: 14 } });
  if ((status === 'walked_cp' || status === 'impasse') && result.walkQuality === 'overplayed') mistake(state, neg, neg.mistakes?.overplayed ? 'overplayed' : 'extreme', { detail: `${neg.cp.name} ended the talks after an overplayed hand (extreme asks, empty threats).`, cost: { days: 21, hours: 1 }, circles: true });
  if (status === 'agreed' && result.pocketed >= 2) mistake(state, neg, 'unrecip', { detail: `${result.pocketed} of your concessions were pocketed without anything back.`, cost: { usd: Math.round(result.leftUsd * 0.5) } });
  try { adapterFor(neg.kind)?.onClose?.(state, neg, result); } catch (e) { console.warn('[negotiation] adapter close failed', e); }
  notify(state, status === 'agreed' ? `Negotiation closed: ${neg.title}. You captured ${pct(clamp(result.capture ?? 0, 0, 1), 0)} of the surplus.` : `Negotiation ended without a deal: ${neg.title}.`, { type: status === 'agreed' ? 'good' : 'warn', app: neg.kind === 'enterprise' ? 'crm' : neg.kind === 'vc' || neg.kind === 'mna' ? 'fundraising' : null });
  log(state, status === 'agreed' ? 'good' : 'warn', `Negotiation ${status}: ${neg.title}`, FN);
  return result;
}

/** Daily: expire negotiations whose window ran out, run adapter daily hooks. Deterministic. */
export function negotiationDay(state) {
  const slice = state.apps?.negotiation;
  if (slice) {
    for (const neg of slice.items) {
      if (neg.status === 'open' && neg.expiresDay != null && state.day > neg.expiresDay) {
        pushHistory(neg, { from: 'system', action: 'expired', message: 'The window to agree closed.', day: state.day });
        closeNegotiation(state, neg, 'expired', null, { reason: 'expired' });
      }
    }
  }
  for (const fn of dailyHooks) { try { fn(state); } catch (e) { console.warn('[negotiation] daily hook failed', e); } }
}

// ---------------------------------------------------------------------------------------------------------------
// Operator tier: reading what the player DID
// ---------------------------------------------------------------------------------------------------------------

export function readNegotiation(state) {
  const items = (state.apps?.negotiation?.items ?? []).filter((n) => n.result && n.status !== 'open');
  if (!items.length) return unknownRead('Open a negotiation from a deal in contract, a term sheet or an acquisition offer. Prepare first: your alternatives, the market norms, the other side.');
  const w = (n) => (n.stakes === 'high' ? 1.5 : n.stakes === 'low' ? 0.6 : 1);
  const tw = items.reduce((a, n) => a + w(n), 0);
  const score = items.reduce((a, n) => a + w(n) * n.result.score, 0) / tw;
  const final = shrink(score, items.length, 0.5, 0.6);
  const avg = (f) => items.reduce((a, n) => a + w(n) * f(n.result), 0) / tw;
  const agreed = items.filter((n) => n.status === 'agreed');
  const evidence = [
    `${items.length} negotiation${items.length > 1 ? 's' : ''}, ${agreed.length} closed with a deal`,
    agreed.length ? `surplus captured: ${pct(avg((r) => clamp(r.capture ?? 0, 0, 1)), 0)} on average (stellar 65%+ [design])` : 'no deals closed yet',
    `preparation: ${pct(avg((r) => r.prep), 0)} of the three prep steps`,
    `concession discipline: ${pct(avg((r) => r.discipline), 0)}`,
    `bluffs: ${items.filter((n) => n.result.bluff).length}, walked from good deals: ${items.filter((n) => n.result.walkQuality === 'bad').length}, worse than alternative: ${items.filter((n) => n.result.worseThanBatna).length}`,
  ];
  const coaching = [];
  const worst = items.slice().sort((a, b) => a.result.score - b.result.score)[0];
  if (avg((r) => r.prep) < 0.5) coaching.push(trapCoaching(FN, 'no_prep', 'Spend the hours on Prepare: your alternatives, the market norms, the other side.'));
  if (items.some((n) => n.result.pocketed || n.result.freeGives.length)) coaching.push(trapCoaching(FN, 'free_concessions', 'Never concede without a trade.'));
  if (items.some((n) => n.result.bluff)) coaching.push(trapCoaching(FN, 'bluff', 'Only mention alternatives you can show.'));
  if (items.some((n) => n.result.firstAccepted || n.result.firstGap > ENGINE.extremeGap)) coaching.push(trapCoaching(FN, 'bad_anchor', 'Anchor high but defensible, just beyond their reservation.'));
  if (items.some((n) => n.result.walkQuality === 'bad' || n.result.worseThanBatna)) coaching.push(trapCoaching(FN, 'walk_discipline', 'Know your alternative; walk below it, stay above it.'));
  if (worst?.result.feedback?.[0] && final < 0.8) coaching.push(`Latest debrief: ${worst.result.feedback[0]}`);
  return { tier: tierFromScore(final, { n: items.length, minN: 1 }), score: round2(final), raw: round2(score), n: items.length, evidence, coaching };
}
if (!hasOperatorReader(FN)) registerOperatorReader(FN, readNegotiation);
