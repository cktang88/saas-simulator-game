// Strict-JSON-schema helpers that pair with core/rubric.js: one integer 1-5 per criterion, plus conversions between
// a 1-5 rubric and the legacy 1-10 fields some consumers still read.

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
