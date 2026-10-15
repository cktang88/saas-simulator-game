// Companion to core/rubric.js: builds the strict JSON schema for a rubric judge (one integer field per
// criterion, plus a quoted-evidence list) and maps the weighted score onto the 0..1 / 0..100 scales that
// consumers already read. Pure.
import { rubricText, weighted } from './rubric.js';

/** Strict-schema properties: one integer per criterion + evidence quotes + any extra fields. */
export function criteriaSchema(criteria, { extra = {}, min = 1, max = 5, evidence = true } = {}) {
  const properties = {};
  for (const c of criteria) properties[c.key] = { type: 'integer', description: `${min}-${max}: ${c.label}` };
  if (evidence) properties.evidence = { type: 'array', items: { type: 'string' }, description: 'One short exact quote (or "missing: <element>") for every criterion scored below 4' };
  Object.assign(properties, extra);
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

/** Weighted 1-5 score mapped to 0..1 (1 -> 0, 5 -> 1). Null when no criterion was scored. */
export function unit(scores, criteria) {
  const w = weighted(scores, criteria);
  return w == null ? null : Math.round(((w - 1) / 4) * 100) / 100;
}
/** Same, on 0..100. */
export function percent(scores, criteria) {
  const u = unit(scores, criteria);
  return u == null ? null : Math.round(u * 100);
}
export const hasScores = (d, criteria) => criteria.some((c) => Number.isFinite(Number(d?.[c.key])));
/** Clamp helper for deterministic fallbacks: integer 1-5. */
export const s15 = (v) => Math.max(1, Math.min(5, Math.round(v)));

/** Rubric block for a 0-4 scale (anchors keyed 0/2/4). */
export const rubricText04 = (criteria) => rubricText(criteria, { scale: '0-4' }).replace('2 and 4 fall between', '1 and 3 fall between');
