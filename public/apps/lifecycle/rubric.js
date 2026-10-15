// Lifecycle email rubric (docs/research/judging/lifecycle-billing.md §1-2). Pure. The judge scores each criterion
// 1-5 against observable anchors; the game applies the fixed weights. The draft generator is told the same criteria.
import { rubricText } from '../../core/rubric.js';

export const EMAIL_CRITERIA = [
  { key: 'one_action', label: 'One action', weight: 3, anchors: { 1: 'three or more links, a list of things to try, or several asks', 3: 'one main button but extra secondary links or asks', 5: 'exactly one link and one ask' } },
  { key: 'activation_target', label: 'Points at the activation action', weight: 3, anchors: { 1: '"get started" / "explore" or no ask at all', 3: 'names a feature area but not the activation action in the brief', 5: 'names the exact activation action from the brief in the reader\'s words and says why it matters to them' } },
  { key: 'value_before_ask', label: 'Value before the ask', weight: 2, anchors: { 1: 'discount, upgrade pitch or "we miss you" before the first useful result (or win-back to someone who never activated)', 3: 'no pitch, but nothing concrete either', 5: 'hands over a concrete shortcut, example or result toward first value; a trial-ending email states the date, the price charged and what they keep or lose' } },
  { key: 'relevance', label: 'Relevant to this reader and moment', weight: 2, anchors: { 1: 'could be sent to anyone on any day', 3: 'acknowledges the stage (new signup, day 3, trial ending) generically', 5: 'refers to what this reader did or did not do and to the facts of this email type (trial end date, what they used before canceling)' } },
  { key: 'human_voice', label: 'Plain human voice', weight: 2, anchors: { 1: 'stock filler ("excited to have you on board", "unlock the power"), buzzwords', 3: 'plain but template-like', 5: 'sounds like one named person, has one concrete detail, invites a reply' } },
  { key: 'brevity_subject', label: 'Brevity and subject', weight: 1, anchors: { 1: 'over 200 words, or a shouting or vague subject', 3: '60-200 words, or a subject over 9 words', 5: '60-150 words and a 3-7 word plain subject' } },
];
export const EMAIL_KEYS = EMAIL_CRITERIA.map((c) => c.key);
export const emailRubric = () => rubricText(EMAIL_CRITERIA);

/** Instructions for the draft generator: write toward the same criteria the judge scores. */
export const draftGuidance = () => `Write toward this rubric, which a strict reviewer will use to score the email: ${EMAIL_CRITERIA.map((c) => `${c.label} (best: ${c.anchors[5]})`).join('; ')}. Keep it to 60-150 words with a 3-7 word subject, a single {{ctaUrl}} link, no filler openers, no discount.`;

/** Offline: criteria from the lint of lifecycle/model.js (same 1-5 scale). */
export function criteriaFromLint(lint, { kind = 'custom' } = {}) {
  const w = lint.words ?? 0;
  const pre = ['welcome', 'nudge'].includes(kind);
  return {
    one_action: lint.links === 1 ? 5 : lint.links === 2 ? 3 : 1,
    activation_target: lint.namesAction ? 4 : 2,
    value_before_ask: lint.discount && pre ? 1 : lint.discount ? 2 : 3,
    relevance: 3,
    human_voice: lint.issues.some((i) => /AI filler|Buzzwords|Spam/.test(i)) ? 1 : 3,
    brevity_subject: w >= 60 && w <= 150 && !lint.issues.some((i) => /subject/i.test(i)) ? 5 : w >= 25 && w <= 200 ? 3 : 1,
  };
}
