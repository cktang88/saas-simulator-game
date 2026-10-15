// Rubrics for dunning copy, price-increase notices and dispute evidence (docs/research/judging/lifecycle-billing.md
// §4-6). Pure. The model scores observable criteria 1-5; the game applies the weights and the calibration.
import { rubricText, weighted } from '../../core/rubric.js';
import { clamp } from '../../core/util.js';

const intProps = (criteria) => Object.fromEntries(criteria.map((c) => [c.key, { type: 'integer', description: `1-5 against the anchors for ${c.label}` }]));

// ---- Dunning: the customer reading a failed-payment message ----
export const DUNNING_CRITERIA = [
  { key: 'clear_what_happened', label: 'I understand what failed', weight: 2, anchors: { 1: '"payment failed" with no plan, amount or card', 3: 'says what failed', 5: 'plan, amount, last 4 digits or date, and that it is a card problem, not my fault' } },
  { key: 'one_click_fix', label: 'I can fix it in one click', weight: 3, anchors: { 1: 'no way to fix it, or "contact billing"', 3: 'an update link buried in the text', 5: 'one prominent update link to a hosted page' } },
  { key: 'tone_sender', label: 'Tone and sender', weight: 2, anchors: { 1: 'threats ("final warning", "collections"), blame or a no-reply sender', 3: 'neutral corporate', 5: 'a named person who takes replies, friendly, assumes an honest accident' } },
  { key: 'consequence_dates', label: 'I know what happens and when', weight: 2, anchors: { 1: 'no consequence, or vague', 3: 'says access may stop', 5: 'exactly what happens and on what date (access pauses, data kept)' } },
  { key: 'alternative', label: 'A way out if I cannot pay now', weight: 1, anchors: { 1: 'none', 3: '"reply if you have questions"', 5: 'pause or downgrade offered where it fits (not for an expired card)' } },
  { key: 'sequence_fit', label: 'Fits its place in the sequence', weight: 1, anchors: { 1: 'same text at every step, or tone that mismatches the day', 3: 'slightly escalating', 5: 'day 0 gentle and practical, the middle step names the consequence, the last gives the exact date and a human fallback' } },
];
export const DUNNING_KEYS = DUNNING_CRITERIA.map((c) => c.key);
export const dunningRubric = () => rubricText(DUNNING_CRITERIA);
export const DUNNING_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['messages'],
  properties: {
    messages: {
      type: 'array', description: 'One entry per message, in order',
      items: { type: 'object', additionalProperties: false, required: [...DUNNING_KEYS, 'evidence'], properties: { ...intProps(DUNNING_CRITERIA), evidence: { type: 'string', description: 'Exact quotes behind each criterion scored 1 or 2' } } },
    },
  },
};
/** 0-1 per message from the weighted criteria (the consumer blends this with the heuristic). */
export const dunningScores = (data) => (data?.messages ?? []).map((m) => { const w = weighted(m, DUNNING_CRITERIA); return w == null ? null : (w - 1) / 4; });
/** Offline fallback: same shape, criteria read off the text with the same cues the heuristic uses. */
export function dunningFallback(steps) {
  return {
    messages: steps.map((x, i) => {
      const t = `${x.subject ?? ''}\n${x.body ?? ''}`.toLowerCase();
      const link = /\{\{\s*(update_link|card_link|link)\s*\}\}|https?:\/\//.test(t);
      const threat = /\b(failure to|terminat|legal|collections|immediately suspend|final warning|you failed)\b/.test(t);
      const facts = ['{{amount}}', '{{plan}}', '$'].filter((k) => t.includes(k)).length;
      return {
        clear_what_happened: facts >= 2 ? 5 : facts === 1 ? 3 : 1,
        one_click_fix: link ? 4 : 1,
        tone_sender: threat ? 1 : /\b(i'm|i am|thanks,\s*\w+|cheers|founder)\b/.test(t) ? 5 : 3,
        consequence_dates: /\b(on|by) (\{\{date\}\}|[a-z]+ \d{1,2})|access (will )?(pause|stop|end)|until/.test(t) ? 4 : 2,
        alternative: /\b(pause|downgrade)\b/.test(t) ? 5 : /\b(reply|help)\b/.test(t) ? 3 : 1,
        sequence_fit: i > 0 && /\b(still|reminder|again|last)\b/.test(t) ? 4 : 3,
        evidence: threat ? 'Threatening wording.' : link ? '' : 'No update link.',
      };
    }),
  };
}

// ---- Price-increase notice: the customer deciding to stay or leave ----
export const NOTICE_CRITERIA = [
  { key: 'what_changes', label: 'What changes is unmistakable', weight: 3, anchors: { 1: 'vague ("a pricing update")', 3: 'the new price, but no old price or no date', 5: 'old price, new price, effective date and billing cadence in the first lines' } },
  { key: 'notice_runway', label: 'Enough notice', weight: 2, anchors: { 1: 'under 14 days', 3: 'about 30 days', 5: '45-60 days or more' } },
  { key: 'why_and_value', label: 'A reason that is about me', weight: 3, anchors: { 1: 'no reason, or "excited to announce"', 3: 'generic cost reasons', 5: 'names the specific things shipped since I signed up and what is coming next' } },
  { key: 'options', label: 'Options', weight: 3, anchors: { 1: 'none', 3: 'says I can cancel', 5: 'a way to lock the old price (annual or a grandfather window), a downgrade path and an easy cancel' } },
  { key: 'tone_honesty', label: 'Direct and honest', weight: 2, anchors: { 1: 'spin, "thrilled", hides the number', 3: 'corporate', 5: 'direct, from a named person who takes replies' } },
];
export const NOTICE_KEYS = NOTICE_CRITERIA.map((c) => c.key);
export const noticeRubric = (noticeDays) => `${rubricText(NOTICE_CRITERIA)}\nThe notice period for notice_runway is the number of days stated in the prompt (${noticeDays}), not something the email must repeat.`;
export const NOTICE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: [...NOTICE_KEYS, 'evidence', 'clarity', 'fairness', 'churnRisk', 'reaction'],
  properties: {
    ...intProps(NOTICE_CRITERIA),
    evidence: { type: 'string', description: 'Exact quotes behind every criterion scored 1 or 2' },
    clarity: { type: 'number', description: '1-10: do I understand what changes, by how much, and when?' },
    fairness: { type: 'number', description: '1-10: does it explain why and treat me fairly (notice, options, lock-in offer)?' },
    churnRisk: { type: 'number', description: '0-1: probability I cancel because of this email. About 0.02-0.05 for a clear, fair notice with a lock-in offer, 0.1-0.2 for average, 0.3+ for vague or short notice.' },
    reaction: { type: 'string', description: 'One or two blunt sentences, in character.' },
  },
};
/** Criteria-derived churn risk (mirrors noticeHeuristic's shape) [design]. */
export function criteriaChurnRisk(data, { increasePct, noticeDays }) {
  const w = weighted(data, NOTICE_CRITERIA);
  if (w == null) return null;
  const q = (w - 1) / 4;
  return clamp(increasePct * (1.3 - 0.9 * q) + (noticeDays < 30 ? 0.08 : 0), 0.01, 0.6);
}
/** Final risk: the persona's own estimate blended 50/50 with the criteria-derived one when criteria were scored. */
export function noticeRisk(data, ctx) {
  const c = criteriaChurnRisk(data, ctx);
  const m = Number(data?.churnRisk);
  if (c == null) return Number.isFinite(m) ? m : null;
  return Number.isFinite(m) ? 0.5 * m + 0.5 * c : c;
}
/** Offline criteria from a notice text. */
export function noticeCriteriaFallback(text, { oldPrice, newPrice, noticeDays }) {
  const t = String(text ?? '').toLowerCase();
  const has = (price) => t.includes(String(Math.round(price))) || t.includes(price.toFixed(2));
  const date = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d|\d{1,2}\/\d{1,2}|in \d+ days/.test(t);
  return {
    what_changes: has(newPrice) && has(oldPrice) && date ? 5 : has(newPrice) && (date || has(oldPrice)) ? 3 : 1,
    notice_runway: noticeDays >= 45 ? 5 : noticeDays >= 30 ? 3 : noticeDays >= 14 ? 2 : 1,
    why_and_value: /(we (added|shipped|built|launched)|since you (joined|signed)|new feature|you asked for)/.test(t) ? 5 : /because|cost|invest|improv/.test(t) ? 3 : 1,
    options: /(annual|lock|grandfather|keep (your|the) (current|old))/.test(t) && /(cancel|downgrade)/.test(t) ? 5 : /(annual|lock|grandfather|downgrade)/.test(t) ? 4 : /cancel/.test(t) ? 3 : 1,
    tone_honesty: /excited to announce|thrilled|delighted/.test(t) ? 1 : /reply|questions/.test(t) ? 5 : 3,
    evidence: '',
  };
}

// ---- Dispute evidence: the issuer analyst ----
export const EVIDENCE_CRITERIA = [
  { key: 'reason_match', label: 'Answers the reason code', weight: 3, anchors: { 1: 'generic "we are a legitimate business"', 3: 'addresses the claim but not the specific reason code', 5: 'opens by refuting the exact claim for this reason code in one or two sentences' } },
  { key: 'proof_of_use', label: 'Proof the service was used', weight: 3, anchors: { 1: 'none', 3: 'says the customer used the product', 5: 'dated logins or usage after the charge, with IP or session detail' } },
  { key: 'authorization_history', label: 'Proof the cardholder authorized it', weight: 2, anchors: { 1: 'none', 3: 'one of AVS/CVC/3DS/IP match/prior payments', 5: 'several, including prior undisputed payments from the same card' } },
  { key: 'policy_disclosure', label: 'Disclosed policy, accepted', weight: 2, anchors: { 1: 'none', 3: 'names the policy', 5: 'quotes the relevant clause and shows it was accepted at checkout, with the date' } },
  { key: 'timeline_receipts', label: 'Dated timeline and receipts', weight: 2, anchors: { 1: 'no dates or amounts', 3: 'some dates', 5: 'chronological: signup, acceptance, reminder and receipt emails, charge, usage, with amounts' } },
  { key: 'consistent_concise', label: 'Consistent and concise', weight: 2, anchors: { 1: 'contradicts the merchant\'s own records, emotional, or padded', 3: 'factual but long', 5: 'factual, neutral, strongest proof first' } },
];
export const EVIDENCE_KEYS = EVIDENCE_CRITERIA.map((c) => c.key);
export const evidenceRubric = () => rubricText(EVIDENCE_CRITERIA);
export const EVIDENCE_QUALITY = { floor: 0.05, span: 0.8, contradictedCap: 0.2 }; // [design] Stripe's win table tops out near 60% even with strong evidence
/** quality 0-1 from the criteria; a letter that contradicts the merchant's own records is capped. */
export function evidenceQuality(data) {
  const w = weighted(data, EVIDENCE_CRITERIA);
  if (w == null) return Number.isFinite(Number(data?.quality)) ? clamp(Number(data.quality), 0, 1) : null;
  let q = EVIDENCE_QUALITY.floor + EVIDENCE_QUALITY.span * ((w - 1) / 4);
  if (Number(data.consistent_concise) <= 1) q = Math.min(q, EVIDENCE_QUALITY.contradictedCap);
  return +clamp(q, 0, 1).toFixed(3);
}
