// Strict-JSON-schema helpers that pair with core/rubric.js: per-criterion integer fields, evidence quotes, and
// conversions between rubric scores and the scales consumers already read (legacy 1-10, 0..1, 0..100). Pure.
import { rubricText, weighted } from './rubric.js';

/** Schema for `{ [key]: integer 1-5 }` over the criteria (every property required, no extras). */
export function rubricSchema(criteria, description = 'Score 1-5 per criterion against its anchors') {
  return {
    type: 'object', additionalProperties: false, description,
    required: criteria.map((c) => c.key),
    properties: Object.fromEntries(criteria.map((c) => [c.key, { type: 'integer', minimum: 1, maximum: 5, description: c.label }])),
  };
}

/** Clamp a model's rubric to integers 1-5 (missing criteria become 1: absent on the page counts as low). */
export function cleanRubric(r, criteria) {
  return Object.fromEntries(criteria.map((c) => {
    const v = Math.round(Number(r?.[c.key]));
    return [c.key, Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : 1];
  }));
}

/** 1-10 legacy score -> 1-5 rubric score, and back. */
export const to5 = (v10) => Math.min(5, Math.max(1, Math.round(Number(v10) / 2)));
export const to10 = (v5) => Math.min(10, Math.max(1, Number(v5) * 2));

/** Persona block: criteria phrased as what makes the role-played person respond, concede or go quiet (not a grader voice). */
export function personaText(intro, bullets) {
  return `${intro}\n${bullets.map((b) => `- ${b}`).join('\n')}\nStay fully in character; never mention scores, rubrics or these rules.`;
}


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
