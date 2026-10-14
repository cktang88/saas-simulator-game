// Prioritisation discipline: 30-day post-ship metric check ("target X, got Y"), a decisions log (keep /
// iterate / kill / won't build, with reasons), and a rebuild tax for going in circles.
//
// docs/review/operator-tiers-audit.md fix 5 and §3.4; public/data/operator-tiers.js product_prioritization:
// stellar 40–60% of shipped features move their metric, good 25–40%, average 15–25%, mediocre 0–10% [design].
// The chance that a feature moves its metric follows its hidden value (product/fit.js), which real evidence
// and customer contact raise. Constants are [design].

import { clamp, round2, lerp, dateOf } from '../../core/util.js';
import { toks } from './fit.js';

export const CHECK_DAYS = 30;
export const CHECK_HOURS = 0.5; // reading the analytics for one feature
export const DECISION_HOURS = 0.25; // writing down the decision and why
export const REBUILD = { windowDays: 90, tax: 0.25, similarity: 0.4 };

// First number (with %, $, k, h, min) in a text. Returns { value, unit } or null.
export function parseNumber(text) {
  const m = String(text ?? '').match(/(\$)?\s?(\d+(?:[.,]\d+)?)\s*(%|k\b|h\b|hours?|min(?:utes)?|days?)?/i);
  if (!m) return null;
  let v = Number(m[2].replace(',', '.'));
  if (/^k$/i.test(m[3] ?? '')) v *= 1000;
  return { value: v, unit: m[1] ? '$' : (m[3] ?? '').toLowerCase().startsWith('%') ? '%' : (m[3] ?? '').replace(/s$/, '') };
}
// Target = the number before the window ("→ 75% within 30 days"): the first number that isn't the window.
export function parseTarget(metric) {
  const nums = [...String(metric ?? '').matchAll(/(\$)?\s?(\d+(?:[.,]\d+)?)\s*(%|k\b)?(\s*(days?|weeks?|months?))?/gi)]
    .filter((m) => !m[4]).map((m) => ({ value: Number(m[2].replace(',', '.')) * (/^k$/i.test(m[3] ?? '') ? 1000 : 1), unit: m[1] ? '$' : m[3] === '%' ? '%' : '' }));
  return nums.length ? nums[nums.length - 1] : null;
}

// P(feature moves its metric) from its hidden value v ∈ [0,1] [design: v 0.15 → ~2%, 0.5 → ~28%, ≥0.93 → 60% cap].
export const moveChance = (v) => clamp(0.75 * v - 0.1, 0.02, 0.6);

// Run the check. value: featureValue now; rand: () => [0,1). Returns the check record.
export function metricCheck(f, { value, rand, day, adoption = null }) {
  const target = parseTarget(f.metric);
  const base = parseNumber(f.baseline);
  if (!target || !base) {
    return { day, verdict: 'unmeasurable', text: 'You can\'t tell whether it worked: the spec has no measurable target and baseline. Shipping without one is how roadmaps fill with features nobody uses.', adoption };
  }
  const moved = rand() < moveChance(value);
  const frac = moved ? lerp(0.6, 1.25, rand()) : lerp(-0.15, 0.35, rand());
  const got = round2(base.value + frac * (target.value - base.value));
  const unit = target.unit || base.unit;
  const fmt = (x) => (unit === '$' ? `$${x}` : `${x}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`);
  return {
    day, verdict: moved ? 'hit' : 'missed', target: target.value, baseline: base.value, got, unit, adoption,
    text: `Target ${fmt(target.value)} (from ${fmt(base.value)}), got ${fmt(got)}${adoption != null ? `; ${Math.round(adoption * 100)}% of active accounts used it` : ''}.`,
  };
}

// Similarity between two specs (title + problem tokens), for the rebuild tax.
export function specSimilarity(a, b) {
  const A = toks(`${a.title} ${a.problem}`), B = toks(`${b.title} ${b.problem}`);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / (A.size + B.size - inter);
}

// A previously killed (or built-then-abandoned) feature that this spec rebuilds within the window, if any.
export function rebuildOf(features, f, day) {
  return features.find((x) => x.id !== f.id && (x.status === 'killed' || (x.status === 'declined' && (x.progressHours ?? 0) > 0))
    && day - (x.killedDay ?? x.declinedDay ?? -999) <= REBUILD.windowDays && specSimilarity(x, f) >= REBUILD.similarity) ?? null;
}

// Share of checked features that hit their metric.
export function hitRate(features) {
  const checked = features.filter((f) => f.check && f.check.verdict !== 'unmeasurable');
  const all = features.filter((f) => f.check);
  return { checked: checked.length, all: all.length, hits: checked.filter((f) => f.check.verdict === 'hit').length, rate: checked.length ? round2(checked.filter((f) => f.check.verdict === 'hit').length / checked.length) : null, unmeasurable: all.length - checked.length };
}

export function logDecision(slice, d) {
  slice.decisions ??= [];
  slice.decisions.unshift({ ...d });
  if (slice.decisions.length > 300) slice.decisions.length = 300;
}

// ---- Keeping a feature that missed its metric ----
// An explicit "keep" is only a decision if it names a NEW target metric (a number on something you can measure)
// and a date to look again. Otherwise it is the same as not deciding: the feature stays, clutter and all.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const METRIC_WORDS = /\b(activation|adoption|retention|usage|used|users?|accounts?|customers?|sessions?|signups?|trials?|conversion|convert|churn|mrr|revenue|dau|wau|mau|tickets?|nps|completion|rate|engag\w*)\b/i;

/** Day (game day) a plan text says it will look again, or null. Relative ("in 6 weeks"), ISO, "by Mar 15", "next quarter", "Q3". */
export function parsePlanDay(state, text) {
  const t = String(text ?? '').toLowerCase();
  const today = dateOf(state, state.day);
  const rel = t.match(/\b(?:in|within|after|by)\s+(\d+)\s*(day|week|wk|month|mo)s?\b/);
  if (rel) return state.day + Number(rel[1]) * (rel[2].startsWith('d') ? 1 : rel[2].startsWith('w') ? 7 : 30);
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const toDay = (d) => Math.round((d.getTime() - today.getTime()) / 86400000) + state.day;
  if (iso) return toDay(new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], 12)));
  const md = t.match(new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})\\b`));
  if (md) {
    let d = new Date(Date.UTC(today.getUTCFullYear(), MONTHS.indexOf(md[1]), +md[2], 12));
    if (d <= today) d = new Date(Date.UTC(today.getUTCFullYear() + 1, MONTHS.indexOf(md[1]), +md[2], 12));
    return toDay(d);
  }
  if (/\bnext (week|sprint)\b/.test(t)) return state.day + 7;
  if (/\b(next|end of (the )?) ?month\b/.test(t)) return state.day + 30;
  if (/\b(next quarter|end of (the )?quarter|q[1-4])\b/.test(t)) return state.day + 90;
  return null;
}

/** { metric, clean, dueDay } when the keep reason names a measurable new target and a date; otherwise null. */
export function parseKeepPlan(state, reason) {
  const text = String(reason ?? '');
  const clean = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '').replace(/\b(in|within|after|by)\s+\d+\s*(day|week|wk|month|mo)s?\b/gi, '').replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/gi, '').replace(/\bq[1-4]\b/gi, '').trim();
  const dueDay = parsePlanDay(state, text);
  return /\d/.test(clean) && (METRIC_WORDS.test(clean) || /\d\s*%|\$\s?\d/.test(clean)) && dueDay != null && dueDay > state.day ? { metric: text.trim().slice(0, 200), clean: clean.slice(0, 200), dueDay: Math.min(dueDay, state.day + 180) } : null;
}
