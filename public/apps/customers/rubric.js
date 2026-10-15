// Customer-persona rubrics (docs/research/judging/lifecycle-billing.md §7-10): what makes a customer write a real
// email, feel helped by a reply, open up in an exit interview, or activate and pay in a trial. Pure.
// Personas stay in character; criteria are phrased as "what makes me act / tell the truth".
import { rubricText, weighted } from '../../core/rubric.js';
import { clamp } from '../../core/util.js';

const intProps = (criteria) => Object.fromEntries(criteria.map((c) => [c.key, { type: 'integer', description: `1-5 against the anchors for ${c.label}` }]));

// ---- customer_feedback_email: a generator, so the criteria are writing instructions ----
export const FEEDBACK_WRITING = [
  { key: 'specific_symptom', label: 'One specific symptom', anchors: { 1: '"it does not work", "please improve"', 3: 'names the area', 5: 'says exactly what happened, once, with a detail only a real user would know' } },
  { key: 'stakes_workaround', label: 'Stakes and workaround', anchors: { 1: 'no consequence', 3: 'a vague inconvenience', 5: 'what I do by hand instead and what it costs me (time, a client, a spreadsheet)' } },
  { key: 'plain_voice', label: 'Busy plain voice', anchors: { 1: 'polished, pleasantries, marketing words', 3: 'polite and neutral', 5: 'short, a little annoyed if something broke, no padding' } },
  { key: 'grounded', label: 'Grounded in the product', anchors: { 1: 'mentions features that do not exist', 3: 'generic', 5: 'only refers to shipped features and the stated topic' } },
];
export const feedbackWritingRubric = () => `${rubricText(FEEDBACK_WRITING, { evidence: false })}\nWrite the email so a strict reviewer would score 5 on each. 2-5 sentences. A canceling customer states the reason they are willing to say out loud, which is not always the whole truth.`;

// ---- customer_reply: how helped the customer feels ----
export const REPLY_CRITERIA = [
  { key: 'answers_my_issue', label: 'Answers my exact problem', weight: 3, anchors: { 1: 'ignores or merely restates what I wrote', 3: 'relevant but partial', 5: 'answers the exact problem I raised' } },
  { key: 'concrete_next', label: 'Gives me something concrete', weight: 3, anchors: { 1: '"we value your feedback", "it is on the roadmap", "stay tuned"', 3: 'a vague promise', 5: 'a fix already shipped, a date, or a workaround I can use now' } },
  { key: 'ownership_tone', label: 'Owns it like a person', weight: 2, anchors: { 1: 'defensive, blames me or canned', 3: 'polite template', 5: 'plainly owns the problem, sounds human' } },
  { key: 'understands_me', label: 'Asks about my situation', weight: 1, anchors: { 1: 'no question at all', 3: 'a generic question', 5: 'one real question about my situation' } },
  { key: 'cancel_handling', label: 'Handles my cancellation well (cancel threads only; otherwise 3)', weight: 2, anchors: { 1: 'begs, or leads with a discount', 3: 'offers to help', 5: 'accepts my decision, asks what would have changed it, leaves the door open' } },
];
export const REPLY_KEYS = REPLY_CRITERIA.map((c) => c.key);
export const replyRubric = () => rubricText(REPLY_CRITERIA);
export const REPLY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['reply', ...REPLY_KEYS, 'evidence', 'satisfied', 'comeBack'],
  properties: {
    reply: { type: 'string' },
    ...intProps(REPLY_CRITERIA),
    evidence: { type: 'string', description: 'Exact words from the founder behind every criterion scored 1 or 2' },
    satisfied: { type: 'number', description: '0-1 gut check; the game computes satisfaction from the weighted criteria' },
    comeBack: { type: 'boolean', description: 'Only for cancellations: would you really resubscribe/stay now?' },
  },
};
/** satisfied 0-1 from the weighted criteria, else the stated number. */
export function replySatisfaction(data) {
  const w = weighted(data, REPLY_CRITERIA);
  const v = w != null ? (w - 1) / 4 : Number(data?.satisfied);
  return Number.isFinite(v) ? clamp(v, 0, 1) : 0;
}
/** Offline criteria mapped from the heuristic reply quality q (0-1). */
export function replyFallbackCriteria(q) {
  const s = Math.round(1 + 4 * clamp(q, 0, 1));
  return { answers_my_issue: s, concrete_next: s, ownership_tone: s, understands_me: s, cancel_handling: s, evidence: '' };
}

// ---- exit_interview: what makes the churned customer tell the truth ----
export const INTERVIEW_CRITERIA = [
  { key: 'open_questions', label: 'Open questions', weight: 2, anchors: { 1: 'yes/no questions', 3: 'a mix', 5: 'what / how / "walk me through"' } },
  { key: 'past_event', label: 'About what actually happened', weight: 3, anchors: { 1: 'hypotheticals ("would you...")', 3: 'general reasons', 5: 'the specific week or moment, who else was involved, what I use now' } },
  { key: 'non_leading', label: 'Does not put words in my mouth', weight: 3, anchors: { 1: 'proposes the answer ("was it the price?")', 3: 'a neutral list of options', 5: 'no answer implied' } },
  { key: 'no_pitch', label: 'Listens instead of selling', weight: 3, anchors: { 1: 'pitches, offers a discount or argues with me', 3: 'a little defending', 5: 'purely listening' } },
  { key: 'scope_depth', label: 'Right size, with follow-ups', weight: 1, anchors: { 1: 'one question, or an interrogation of 10 or more', 3: '3-8 questions with no follow-up', 5: '3-8 questions including a follow-up probe' } },
];
export const INTERVIEW_KEYS = INTERVIEW_CRITERIA.map((c) => c.key);
export const interviewRubric = () => rubricText(INTERVIEW_CRITERIA);
export const interviewCriteriaProps = () => intProps(INTERVIEW_CRITERIA);
/** questionQuality 0-1 from the weighted criteria, else the stated number. */
export function interviewQuality(data) {
  const w = weighted(data, INTERVIEW_CRITERIA);
  const v = w != null ? (w - 1) / 4 : Number(data?.questionQuality);
  return Number.isFinite(v) ? clamp(v, 0, 1) : null;
}
export function interviewFallbackCriteria(q) {
  const s = Math.round(1 + 4 * clamp(q, 0, 1));
  return Object.fromEntries([...INTERVIEW_KEYS.map((k) => [k, s]), ['evidence', '']]);
}

// ---- product_trial_panel: what makes a trial user activate and pay (decision rules, no new output fields) ----
export const TRIAL_CRITERIA = [
  { key: 'time_to_value', label: 'Time to value', anchors: { 1: 'no useful result in my first session', 3: 'a useful result after some digging', 5: 'a real result of my own in the first session' } },
  { key: 'replaces_workaround', label: 'Replaces my workaround', anchors: { 1: 'only displays data I already have', 3: 'helps with one step I do by hand', 5: 'removes a whole manual process I do today' } },
  { key: 'fits_my_stack', label: 'Fits my tools and team', anchors: { 1: 'no import, no integration, nothing to share', 3: 'a CSV or one integration', 5: 'connects to the tools I use and my team can use it' } },
  { key: 'trust_match', label: 'Site promises match the product', anchors: { 1: 'the website claims things the product does not do', 3: 'mostly matches', 5: 'exactly what the site said, and it is stable' } },
  { key: 'price_vs_value', label: 'Price against the pain removed', anchors: { 1: 'costs more than the problem or a free alternative', 3: 'about fair', 5: 'clearly cheaper than the time or money it saves' } },
  { key: 'switching_cost', label: 'Switching cost (5 = low)', anchors: { 1: 'data, habits and team all tie me to what I use', 3: 'some migration work', 5: 'nothing to lose by moving' } },
];
export const trialRubric = () => `${rubricText(TRIAL_CRITERIA)}\nHow to use it: privately score each criterion 1-5 for this product, then set the output fields from the scores. activated is true only if time_to_value >= 3 AND replaces_workaround >= 3. wouldPay is true only if price_vs_value >= 3 after weighing switching_cost (a low switching_cost score means strong inertia). A trust_match of 1-2 lowers everything else by a point. Quote the exact feature title or website line behind a low score in your quote or ahaMoment. Most trials do not activate (the B2B SaaS average is about 37.5%) and many who activate still do not pay.`;
