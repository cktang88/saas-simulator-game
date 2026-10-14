// Prioritisation discipline: 30-day post-ship metric check ("target X, got Y"), a decisions log (keep /
// iterate / kill / won't build, with reasons), and a rebuild tax for going in circles.
//
// docs/review/operator-tiers-audit.md fix 5 and §3.4; public/data/operator-tiers.js product_prioritization:
// stellar 40–60% of shipped features move their metric, good 25–40%, average 15–25%, mediocre 0–10% [design].
// The chance that a feature moves its metric follows its hidden value (product/fit.js), which real evidence
// and customer contact raise. Constants are [design].

import { clamp, round2, lerp } from '../../core/util.js';
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
