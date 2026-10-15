// In-app upgrade prompt rubric (docs/research/judging/lifecycle-billing.md §3). Pure.
import { rubricText, weighted } from '../../core/rubric.js';

export const UPGRADE_CRITERIA = [
  { key: 'names_unlock', label: 'Names what the next tier unlocks', weight: 3, anchors: { 1: '"Upgrade to Pro" and nothing else', 3: 'names the tier or a vague benefit ("more power")', 5: 'names exactly what unlocks, with a number or the feature name' } },
  { key: 'shows_position', label: 'Shows where the user stands', weight: 2, anchors: { 1: 'no mention of the limit or usage', 3: 'says they hit a limit', 5: 'gives their numbers ("You have used 9 of 10 projects") and what happens next' } },
  { key: 'value_moment', label: 'Shown at a value moment', weight: 2, anchors: { 1: 'interrupts before value or blocks the task in progress', 3: 'appears at the limit but is unrelated to what they were doing', 5: 'tied to what the user just did and lets them finish or keep their data' } },
  { key: 'no_pressure', label: 'No pressure', weight: 2, anchors: { 1: 'countdown, stacked promos, guilt, hard-to-find close', 3: 'urgency language ("don\'t miss")', 5: 'calm and honest; dismissing is obvious' } },
  { key: 'one_action_alt', label: 'One action plus a lower-commitment option', weight: 1, anchors: { 1: 'several buttons or offers competing', 3: 'one upgrade button only', 5: 'one primary action plus a smaller step (remind me later, buy a one-off pack)' } },
  { key: 'benefit_led', label: 'Leads with the user\'s outcome', weight: 1, anchors: { 1: 'leads with price or brand', 3: 'mixed benefit and price', 5: 'leads with what the user gets done; price secondary and honest' } },
];
export const UPGRADE_KEYS = UPGRADE_CRITERIA.map((c) => c.key);
export const upgradeRubric = () => rubricText(UPGRADE_CRITERIA);

export const UPGRADE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: [...UPGRADE_KEYS, 'evidence', 'score', 'fix'],
  properties: {
    ...Object.fromEntries(UPGRADE_CRITERIA.map((c) => [c.key, { type: 'integer', description: `1-5 against the anchors for ${c.label}` }])),
    evidence: { type: 'string', description: 'Exact quotes behind every criterion scored 1 or 2' },
    score: { type: 'number', description: '0-1 gut check; the game uses the weighted criteria when present' },
    fix: { type: 'string', description: 'One change a stellar growth operator would make' },
  },
};

/** 0-1 quality: weighted criteria when present, else the free score. */
export function upgradeScore(data) {
  const w = weighted(data, UPGRADE_CRITERIA);
  const v = w != null ? (w - 1) / 4 : Number(data?.score);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
}

/** Offline criteria from the lint issues of lintUpgradeCopy (plg/model.js). */
export function upgradeFallback(text, lint) {
  const issues = lint.issues.join(' ');
  const t = String(text ?? '');
  const empty = !t.trim();
  return {
    names_unlock: empty ? 1 : /unlocks/.test(issues) ? 2 : 4,
    shows_position: empty ? 1 : /against the limit/.test(issues) ? 2 : 4,
    value_moment: empty ? 1 : 3,
    no_pressure: /Countdown/.test(issues) ? 1 : 4,
    one_action_alt: (t.match(/upgrade/gi) ?? []).length > 3 ? 1 : 3,
    benefit_led: /\$\s?\d/.test(t.slice(0, 30)) ? 2 : 3,
    evidence: issues.slice(0, 200),
    score: lint.score,
    fix: lint.issues[0] ?? 'Clear enough.',
  };
}
