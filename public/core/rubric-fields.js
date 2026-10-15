// Helpers that tie a rubric (core/rubric.js) to strict JSON-schema fields: one integer per criterion.
import { weighted } from './rubric.js';

/** Schema properties: one integer field per criterion (strict schemas need every key in `required`). */
export const scoreProps = (criteria) => Object.fromEntries(criteria.map((c) => [c.key, { type: 'integer', description: `1-5 against the anchors for ${c.label}` }]));
export const scoreKeys = (criteria) => criteria.map((c) => c.key);

/** Build a strict object schema from criteria plus extra properties (all required). */
export function rubricSchema(criteria, extra = {}) {
  const properties = { ...scoreProps(criteria), ...extra };
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

/** Average several judge outputs (a panel) criterion by criterion; returns { scores, score } where score is weighted(). */
export function averageScores(results, criteria) {
  const scores = {};
  for (const c of criteria) {
    const v = results.map((r) => Number(r?.[c.key])).filter(Number.isFinite);
    if (v.length) scores[c.key] = Math.round((v.reduce((a, b) => a + Math.min(5, Math.max(1, b)), 0) / v.length) * 100) / 100;
  }
  return { scores, score: weighted(scores, criteria) };
}
