// Operator reads and the mistakes ledger (ARCHITECTURE principle 7).
//
// Two shared services every business function uses:
//  1. Operator readers. Each function registers registerOperatorReader(functionId, fn) where
//     fn(state) -> { tier, evidence: [string], coaching: [string], score?, n? }.
//     tier is 'stellar' | 'good' | 'average' | 'mediocre' | 'unknown'. A reader must return 'unknown' until the
//     player has actually acted in that function (no tier for doing nothing). The read must come from what the
//     player DID (judged quality, consistency, outcomes reconciled with hidden state), never from volume.
//  2. The mistakes ledger. logMistake(state, {...}) records a consequential mistake with its realistic cost so the
//     player can trace it afterwards (Scorecard "What your mistakes cost"). Totals are kept separately so the
//     capped list never loses money or hours from the sums.
//
// Core module: imports nothing from apps (only the pure data table). functionId values match the keys of
// public/data/operator-tiers.js.

import { uid } from './util.js';
import { OPERATOR_TIERS } from '../data/operator-tiers.js';

export const TIERS = ['stellar', 'good', 'average', 'mediocre'];
export const TIER_RANK = { stellar: 3, good: 2, average: 1, mediocre: 0, unknown: -1 };
export const MISTAKES_CAP = 300;

const readers = new Map();

/** Register (or replace) the operator reader for a function id from data/operator-tiers.js. */
export function registerOperatorReader(functionId, fn) {
  if (!functionId || typeof fn !== 'function') throw new Error('registerOperatorReader(functionId, fn)');
  readers.set(functionId, fn);
}

export const operatorReaderIds = () => [...readers.keys()];
export const hasOperatorReader = (id) => readers.has(id);

/** A read for a function nobody has acted in yet. */
export const unknownRead = (coaching = []) => ({ tier: 'unknown', evidence: [], coaching: [].concat(coaching).filter(Boolean) });

function normalize(functionId, r) {
  if (!r || typeof r !== 'object') return { functionId, ...unknownRead() };
  const tier = TIER_RANK[r.tier] != null ? r.tier : 'unknown';
  const out = {
    ...r,
    functionId,
    tier,
    evidence: (Array.isArray(r.evidence) ? r.evidence : []).filter(Boolean).map(String),
  };
  // The true coaching lines are INTERNAL evidence for the advice gate (core/advice.js adviceFor). They are
  // non-enumerable so a spread, JSON or a template that iterates the read cannot leak them; UI code must never render
  // read.coaching: show adviceFor(state, functionId, read.coaching) instead (advice comes from people, not the dashboard).
  Object.defineProperty(out, 'coaching', { value: (Array.isArray(r.coaching) ? r.coaching : []).filter(Boolean).map(String), enumerable: false, writable: true, configurable: true });
  return out;
}

/** Run one reader. Never throws: a broken reader reads as 'unknown'. */
export function readOperator(state, functionId) {
  const fn = readers.get(functionId);
  if (!fn) return { functionId, ...unknownRead(), noReader: true };
  try { return normalize(functionId, fn(state)); } catch (e) { return { functionId, ...unknownRead(), error: String(e?.message || e) }; }
}

/** All registered reads: { [functionId]: read }. */
export function readOperators(state) {
  const out = {};
  for (const id of readers.keys()) out[id] = readOperator(state, id);
  return out;
}

/**
 * Map a 0..1 quality score to a tier. Default cuts: stellar >= 0.8, good >= 0.6, average >= 0.4, else mediocre
 * [design]. Pass n (sample size) with minN to return 'unknown' below the minimum evidence.
 */
export function tierFromScore(score, { cuts = { stellar: 0.8, good: 0.6, average: 0.4 }, n = Infinity, minN = 1 } = {}) {
  if (score == null || !Number.isFinite(score) || n < minN) return 'unknown';
  if (score >= cuts.stellar) return 'stellar';
  if (score >= cuts.good) return 'good';
  if (score >= cuts.average) return 'average';
  return 'mediocre';
}

/**
 * Pull a small-sample or offline-judged score toward the prior (the median, 0.5 by default). With n judged
 * items and a pseudo-count k, the result is (score*n + prior*k) / (n + k). Offline judges should also pass a
 * larger k than an LLM judge would need, because a keyword heuristic is weak evidence [design].
 */
export function shrink(score, n, prior = 0.5, k = 5) {
  if (score == null || !Number.isFinite(score)) return prior;
  const m = Math.max(0, Number(n) || 0);
  if (m + k <= 0) return score;
  return (score * m + prior * k) / (m + k);
}

/** The trap's coaching line from data/operator-tiers.js (fallback: the given text). */
export function trapCoaching(functionId, trapId, fallback = '') {
  return OPERATOR_TIERS[functionId]?.traps?.find((t) => t.id === trapId)?.coaching ?? fallback;
}
/** The function's tier behaviours (what a stellar / good / ... operator does), for "what stellar looks like". */
export const tierBehaviours = (functionId, tier = 'stellar') => OPERATOR_TIERS[functionId]?.tiers?.[tier]?.behaviours ?? [];
export const functionLabel = (functionId) => OPERATOR_TIERS[functionId]?.label ?? functionId;

// Split a trailing prescriptive lesson off a mistake's detail: the facts stay in `detail`, the advice moves to `lesson`.
// Prescriptive = "A stellar ...", "Stellar operators ...", "Next time ...", "You should ...", "It is better to ...", or a sentence
// that starts with an imperative verb. Only the trailing run of such sentences is moved; a mid-sentence "; a stellar operator ..."
// clause on the last sentence is split off too. Returns { fact, lesson } (lesson '' when none).
const IMPERATIVE = /^(ask|check|call|run|send|write|use|set|make|pick|stop|start|never|always|don't|do not|keep|give|hire|pay|get|review|book|cut|test|verify|negotiate|offer|time-box|consider|try|have|put|spec|ship|decide|charge|track|read|build|talk|insist|counter|separate|reconcile|file|tell|show|move|plan|treat|replace|document|require)\b/i;
const PRESCRIPTIVE = /^((a|the|an)\s+(stellar|good|strong|careful|best)\s+(operator|founder|team|buyer|seller)s?\b|stellar\s+(operator|founder)s?\b|next time\b|you should\b|you need to\b|it is better to\b|it's better to\b|better to\b|the fix\b|to avoid\b)/i;
const isPrescriptive = (s) => PRESCRIPTIVE.test(s.trim()) || IMPERATIVE.test(s.trim());
export function splitLesson(detail) {
  const text = String(detail ?? '').trim();
  if (!text) return { fact: '', lesson: '' };
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z"])/);
  let i = parts.length;
  while (i > 1 && isPrescriptive(parts[i - 1])) i--; // keep at least the first sentence as the fact
  let fact = parts.slice(0, i).join(' ');
  let lesson = parts.slice(i).join(' ');
  if (!lesson) { // "..., a stellar operator ..." clause inside the last sentence
    const m = fact.match(/^(.*?)(?:[;:]|\s[-\u2013\u2014]\s|,)\s*((?:a|the)\s+stellar\s+operator\b.*|stellar\s+operators?\b.*|next time\b.*|you should\b.*)$/i);
    if (m && m[1].trim().length > 10) { fact = m[1].trim(); lesson = m[2].trim(); if (!/[.!?]$/.test(fact)) fact += '.'; lesson = lesson[0].toUpperCase() + lesson.slice(1); }
  }
  return { fact: fact.trim(), lesson: lesson.trim() };
}

const COST_KEYS = ['hours', 'usd', 'customers', 'reputation', 'days'];
const cleanCost = (c = {}) => Object.fromEntries(COST_KEYS.map((k) => [k, Number.isFinite(Number(c[k])) ? Number(c[k]) : 0]));

/**
 * Record a consequential mistake.
 *  functionId: operator-tiers key; id: mistake/trap id (e.g. 'bought_list'); label: player-facing name;
 *  cost: { hours, usd, customers, reputation, days } (days = calendar time lost, e.g. going in circles);
 *  delayed: true when the cost lands later than the action; circles: true for "going in circles" events
 *  (rework, repeated failed attempts); detail: one sentence of what happened; day defaults to state.day;
 *  key: optional idempotency key (a second call with the same key is ignored and returns null);
 *  app: the app id to link from the Scorecard;
 *  lesson: the prescriptive sentence(s) ("A stellar operator..."), shown only through a source or learning mode (core/advice.js
 *  lessonFor). When omitted it is split off the end of `detail` with splitLesson, so `detail` stays factual: what happened and what it cost.
 * Returns the entry. The list is capped at MISTAKES_CAP (oldest dropped); totals stay complete.
 */
// charge: true also takes cost.hours out of the founder's week (time really spent fixing it). Leave it false when
// the calling app already charged those hours elsewhere, so they aren't counted twice.
export function logMistake(state, { functionId, id, label, cost, day, detail = '', lesson = null, delayed = false, circles = false, app = null, key = null, charge = false } = {}) {
  if (!state) return null;
  if (!Array.isArray(state.mistakes)) state.mistakes = [];
  // Optional idempotency key: the same consequence (e.g. 'miss_83b:grant_1') is only ever logged once.
  if (key) { state.mistakeKeys ||= {}; if (state.mistakeKeys[key] != null) return null; state.mistakeKeys[key] = state.day ?? 0; }
  const split = lesson != null ? { fact: String(detail || ''), lesson: String(lesson) } : splitLesson(detail);
  const entry = {
    uid: uid('mis'),
    functionId: functionId || 'general',
    id: id || 'mistake',
    label: label || id || 'Mistake',
    cost: cleanCost(cost),
    day: Number.isFinite(day) ? day : (state.day ?? 0),
    detail: split.fact,
    lesson: split.lesson,
    delayed: !!delayed,
    circles: !!circles,
    app,
  };
  state.mistakes.push(entry);
  if (charge && entry.cost.hours > 0 && state.founder) {
    state.founder.hoursUsed = (state.founder.hoursUsed ?? 0) + entry.cost.hours;
    (state.founder.timeLog ??= []).push({ day: state.day ?? 0, hours: entry.cost.hours, label: `Fixing: ${entry.label}` });
  }
  if (state.mistakes.length > MISTAKES_CAP) state.mistakes.splice(0, state.mistakes.length - MISTAKES_CAP);
  const t = state.mistakeTotals ||= { count: 0, circles: 0, delayed: 0, ...cleanCost(), byFunction: {} };
  t.count++;
  if (entry.circles) t.circles++;
  if (entry.delayed) t.delayed++;
  for (const k of COST_KEYS) t[k] = (t[k] || 0) + entry.cost[k];
  const f = (t.byFunction[entry.functionId] ||= { count: 0, ...cleanCost() });
  f.count++;
  for (const k of COST_KEYS) f[k] += entry.cost[k];
  return entry;
}

/**
 * Totals and breakdowns for the Scorecard. Uses the running totals (complete) and the capped list for the
 * per-mistake rows: { count, circles, delayed, hours, usd, customers, reputation, days, byFunction: [..],
 * byMistake: [..], circleEvents: [..], recent: [..] }.
 */
export function mistakesSummary(state) {
  const list = Array.isArray(state?.mistakes) ? state.mistakes : [];
  let t = state?.mistakeTotals;
  if (!t) { // ledger written without logMistake (e.g. a hand-built test state): rebuild from the list
    t = { count: 0, circles: 0, delayed: 0, ...cleanCost(), byFunction: {} };
    for (const m of list) {
      const c = cleanCost(m.cost);
      t.count++; if (m.circles) t.circles++; if (m.delayed) t.delayed++;
      const f = (t.byFunction[m.functionId || 'general'] ||= { count: 0, ...cleanCost() });
      f.count++;
      for (const k of COST_KEYS) { t[k] += c[k]; f[k] += c[k]; }
    }
  }
  const byMistakeMap = {};
  for (const m of list) {
    const key = `${m.functionId}:${m.id}`;
    const b = (byMistakeMap[key] ||= { functionId: m.functionId, id: m.id, label: m.label, count: 0, ...cleanCost(), lastDay: m.day });
    b.count++;
    b.lastDay = Math.max(b.lastDay, m.day);
    for (const k of COST_KEYS) b[k] += Number(m.cost?.[k]) || 0;
  }
  const weight = (x) => (x.usd || 0) + (x.hours || 0) * 50 + (x.customers || 0) * 500 + (x.reputation || 0) * 200 + (x.days || 0) * 100; // [design] sort key only
  return {
    count: t.count, circles: t.circles, delayed: t.delayed,
    hours: t.hours, usd: t.usd, customers: t.customers, reputation: t.reputation, days: t.days,
    byFunction: Object.entries(t.byFunction).map(([functionId, v]) => ({ functionId, ...v })).sort((a, b) => weight(b) - weight(a)),
    byMistake: Object.values(byMistakeMap).sort((a, b) => weight(b) - weight(a)),
    circleEvents: list.filter((m) => m.circles).slice(-20).reverse(),
    recent: list.slice(-20).reverse(),
  };
}
