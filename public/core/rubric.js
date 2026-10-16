// Shared format for LLM judging rubrics, so no judge is handwavy. Pattern (see apps/fundraising/rubric.js):
// research names observable criteria with 1/3/5 anchors and sources (docs/research/judging/), the model scores
// each criterion against the anchors and quotes its evidence, and the GAME (not the model) turns scores into
// outcomes with fixed weights, so calibration stays deterministic and testable.
//
// criteria: [{ key, label, anchors: { 1: '...', 3: '...', 5: '...' } | '1: … 3: … 5: …', weight? }]

export function rubricText(criteria, { scale = '1-5', evidence = true } = {}) {
  const rows = criteria.map((c) => {
    const a = typeof c.anchors === 'string' ? c.anchors : Object.entries(c.anchors).map(([k, v]) => `${k} = ${v}`).join(' | ');
    return `- ${c.key} (${c.label}): ${a}`;
  });
  return [
    `SCORING RUBRIC. Score each criterion ${scale} against its anchors (2 and 4 fall between the anchors). Score only what is actually on the page; missing counts as low, never assume.`,
    ...rows,
    evidence ? 'For every low score, quote the exact words (or name the missing element) that caused it. Generic praise or criticism without a quote is not allowed.' : '',
  ].filter(Boolean).join('\n');
}

/** Weighted 1-5 average over the criteria that have a finite score. */
export function weighted(scores, criteria) {
  let tot = 0, w = 0;
  for (const c of criteria) {
    const raw = scores?.[c.key];
    if (raw == null || raw === '') continue; // unscored (Number(null) is 0, which would count as a 1)
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    const wt = c.weight ?? 1;
    tot += Math.min(5, Math.max(1, v)) * wt;
    w += wt;
  }
  return w ? Math.round((tot / w) * 100) / 100 : null;
}
