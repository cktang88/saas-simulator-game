// Judges for things the founder writes in the money apps: dispute evidence and price-change notices.
// LLM panel (core/llm.js) with deterministic heuristic fallbacks of the same shape. Heuristics are pure.

import { clamp, words } from '../../core/util.js';
import { EVIDENCE_CRITERIA, EVIDENCE_KEYS, evidenceRubric, NOTICE_SCHEMA as RUBRIC_NOTICE_SCHEMA, noticeCriteriaFallback } from './rubric.js';

export const MIN_EVIDENCE_WORDS = 40;

export const EVIDENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...EVIDENCE_KEYS, 'evidenceQuotes', 'quality', 'likelyOutcome', 'strengths', 'weaknesses'],
  properties: {
    ...Object.fromEntries(EVIDENCE_CRITERIA.map((c) => [c.key, { type: 'integer', description: `1-5 against the anchors for ${c.label}` }])),
    evidenceQuotes: { type: 'string', description: 'Exact quotes from the letter behind every criterion scored 1 or 2, or the missing element' },
    quality: { type: 'number', description: '0-1 gut check; the game computes the real quality from the weighted criteria.' },
    likelyOutcome: { type: 'string', enum: ['win', 'lose', 'toss-up'] },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
  },
};

// facts: { reason, amount, customerName, chargeDate, signupDate, successfulCharges, cancelRequested, usageNote }
export function evidenceHeuristic(text, facts) {
  const t = String(text ?? '').toLowerCase();
  const n = words(text);
  const has = (re) => re.test(t);
  const s = [], w = [];
  let q = 0.1;
  const thin = n < MIN_EVIDENCE_WORDS;
  const hits = (res) => res.filter((re) => re.test(t)).length;
  const criteria = {
    reason_match: thin ? 1 : facts?.reason === 'fraudulent' ? (/avs|cvc|cvv|3d ?secure|authori[sz]/.test(t) ? 4 : 2) : (/never (requested|asked)|did not (cancel|request)|no cancell?ation|not cancel/.test(t) ? 4 : 2),
    proof_of_use: /log ?in|logged in|session|usage|activity|api call|ip address/.test(t) ? (/\d/.test(t) ? 5 : 3) : 1,
    authorization_history: hits([/avs|billing address|zip/, /cvc|cvv/, /3d ?secure|3ds/, /ip address/, /prior|previous|earlier|undisputed/]) >= 3 ? 5 : hits([/avs|billing address|zip/, /cvc|cvv/, /3d ?secure|3ds/, /ip address/, /prior|previous|earlier|undisputed/]) >= 1 ? 3 : 1,
    policy_disclosure: /terms|refund policy|cancell?ation policy/.test(t) ? (/checkbox|accepted|agreed/.test(t) ? 5 : 3) : 1,
    timeline_receipts: hits([/receipt|invoice/, /reminder/, /\b(19|20)\d\d\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/, /\$\s?\d/]) >= 3 ? 5 : hits([/receipt|invoice/, /reminder/, /\b(19|20)\d\d\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/, /\$\s?\d/]) >= 1 ? 3 : 1,
    consistent_concise: (facts?.cancelRequested && /never (requested|asked)|did not (cancel|request)|no cancell?ation/.test(t)) || /scam|liar|fraudster|thief|!!/.test(t) ? 1 : n > 400 ? 3 : 4,
    evidenceQuotes: '',
  };
  if (thin) return { ...criteria, quality: 0.05, likelyOutcome: 'lose', strengths: [], weaknesses: [`Only ${n} words: issuers deny thin responses.`] };
  const pts = [
    [/log ?in|logged in|session|usage|used the|activity|active user|api call|ip address/, 0.15, 'Shows the customer used the service after the charge'],
    [/terms|refund policy|cancell?ation policy|agreed|checkbox|accepted/, 0.12, 'Cites the policy the customer agreed to'],
    [/receipt|invoice|email(ed)? (receipt|confirmation)|reminder/, 0.1, 'Mentions receipts / reminder emails sent'],
    [/\b(19|20)\d\d\b|\b\d{1,2}\/\d{1,2}\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/, 0.08, 'Includes specific dates'],
    [/\$\s?\d|\d+\.\d\d/, 0.06, 'States the amount'],
    [/descriptor|statement/, 0.05, 'Explains the statement descriptor'],
  ];
  for (const [re, v, label] of pts) if (has(re)) { q += v; s.push(label); }
  if (facts?.customerName && t.includes(String(facts.customerName).toLowerCase().split(' ')[0])) { q += 0.05; s.push('Identifies the customer'); }
  if (facts?.reason === 'fraudulent') {
    if (has(/avs|cvc|cvv|3d ?secure|3ds|billing address|zip/)) { q += 0.12; s.push('Card verification results (AVS/CVC/3DS)'); } else w.push('Fraud disputes need AVS/CVC/3DS results and proof the cardholder used the account.');
    if (has(/prior|previous|earlier|undisputed|paid (before|previously)/)) { q += 0.08; s.push('Prior undisputed payments'); }
  } else {
    if (has(/never (requested|asked)|did not (cancel|request)|no cancell?ation|not cancel/)) { q += 0.12; s.push('Shows no cancellation was requested before renewal'); } else w.push('For "subscription canceled" you must show they did not cancel before the charge, or that the cancellation policy was disclosed.');
  }
  const angry = (t.match(/scam|liar|fraudster|thief|ridiculous|!!/g) ?? []).length + (String(text).match(/\b[A-Z]{5,}\b/g) ?? []).length;
  if (angry) { q -= 0.1 * angry; w.push('Emotional language reads as unprofessional to the issuer.'); }
  if (facts?.cancelRequested && has(/never (requested|asked)|did not (cancel|request)|no cancell?ation/)) { q -= 0.3; w.push('Records show the customer did request cancellation: the claim contradicts your own data.'); }
  if (n > 400) { q -= 0.05; w.push('Very long: issuers skim; lead with the strongest proof.'); }
  q = clamp(q, 0.02, 0.95);
  return { ...criteria, quality: +q.toFixed(2), likelyOutcome: q > 0.6 ? 'win' : q < 0.35 ? 'lose' : 'toss-up', strengths: s.slice(0, 5), weaknesses: w.slice(0, 4) };
}

export function evidencePrompt(text, facts) {
  return `Dispute reason code: ${facts.reason}.
Facts on the merchant's records (true; the merchant may contradict them):
- Charge: $${facts.amount} on ${facts.chargeDate}
- Customer: ${facts.customerName}, signed up ${facts.signupDate}, ${facts.successfulCharges} successful charge(s) so far
- Cancellation requested before this charge: ${facts.cancelRequested ? 'YES (the request is in the merchant\'s own log; a letter that denies it is contradicted and scores 1 on consistent_concise)' : 'no'}
- Product: ${facts.product}

=== MERCHANT'S EVIDENCE TEXT ===
${String(text).slice(0, 6000)}
=== END ===
Score each rubric criterion 1-5 and quote the letter for every low score. A claim contradicted by the facts above scores 1 on consistent_concise.`;
}
export const EVIDENCE_SYSTEM = 'You are a chargeback analyst at a card-issuing bank in 2026 reviewing a SaaS merchant\'s compelling evidence. You have seen thousands of responses; most merchants lose. You reward specific, verifiable proof matched to the reason code (usage logs after purchase, disclosed cancellation/refund policy the customer accepted, AVS/CVC/3DS results, prior undisputed payments, reminder emails) and penalize vague, emotional or contradictory claims. Be strict. Most merchants lose: even strong, well-matched evidence wins well under two thirds of the time.\n' + evidenceRubric();

// ---- Price-change notice to existing subscribers ----

export const NOTICE_SCHEMA = RUBRIC_NOTICE_SCHEMA;
export function noticeHeuristic(text, { oldPrice, newPrice, noticeDays, usage = null, months = null }) {
  const t = String(text ?? '').toLowerCase();
  const n = words(text);
  const inc = newPrice > oldPrice ? (newPrice - oldPrice) / oldPrice : 0;
  let clarity = 3, fairness = 3;
  if (t.includes(String(Math.round(newPrice))) || t.includes(newPrice.toFixed(2))) clarity += 2;
  if (t.includes(String(Math.round(oldPrice)))) clarity += 1;
  if (/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\d{1,2}\/\d{1,2}|days/.test(t)) clarity += 2;
  if (n >= 60 && n <= 300) clarity += 1;
  if (/because|why|cost|invest|new feature|improv|shipped|added/.test(t)) fairness += 2;
  if (/annual|lock|grandfather|current price|discount|until/.test(t)) fairness += 2;
  if (/cancel|reply|questions|downgrade/.test(t)) fairness += 1.5;
  if (/thank/.test(t)) fairness += 0.5;
  if (/excited to announce|thrilled/.test(t)) fairness -= 1;
  clarity = clamp(clarity, 1, 10); fairness = clamp(fairness, 1, 10);
  const churnRisk = clamp(inc * (1.3 - fairness / 10 - clarity / 20) + (noticeDays < 30 ? 0.08 : 0), 0.01, 0.6);
  const crit = noticeCriteriaFallback(text, { oldPrice, newPrice, noticeDays });
  return { ...crit, clarity, fairness, churnRisk: +churnRisk.toFixed(3), reaction: noticeReaction(crit, { oldPrice, newPrice, noticeDays, usage, months, fairness }) };
}

// Offline reaction in the reader's own situation: what they pay, how long they have paid and how much they use it,
// reacting to what the email actually left out. Readers used to share two canned lines whatever their usage or tenure.
export function noticeReaction(crit, { oldPrice, newPrice, noticeDays, usage = null, months = null, fairness = 5 }) {
  const inc = oldPrice > 0 ? Math.round(((newPrice - oldPrice) / oldPrice) * 100) : 0;
  const missing = [];
  if (crit.what_changes < 3) missing.push('it never says plainly what I will pay and from when');
  if (crit.why_and_value < 3) missing.push('there is no reason beyond "prices are going up"');
  if (crit.options < 3) missing.push('no way to keep my current price, like switching to annual');
  if (crit.notice_runway <= 2) missing.push(`${noticeDays} days is not enough time to get it approved or find something else`);
  if (crit.tone_honesty <= 1) missing.push('the "excited to announce" tone for a price rise reads as spin');
  const who = !Number.isFinite(usage) ? null : usage >= 0.65 ? 'heavy' : usage >= 0.4 ? 'casual' : 'idle';
  const tenure = Number.isFinite(months) ? (months < 1 ? 'I only just signed up' : `I have paid for ${months} month${months === 1 ? '' : 's'}`) : null;
  const lead = [tenure, `and now it goes up ${inc}%`].filter(Boolean).join(' ');
  const gap = missing.length ? ` What bothers me: ${missing.slice(0, 2).join('; ')}.` : ' At least they told me what changes, when and why, and gave me a way out.';
  const verdict = who === 'idle'
    ? (missing.length ? ' I barely use it anyway; this is my reminder to cancel.' : ' Honestly I barely use it, so I may cancel regardless.')
    : who === 'heavy'
      ? (fairness >= 7 ? ' We use it every day, so I will grumble and stay.' : ' We rely on it, but I will start looking at alternatives before renewal.')
      : (fairness >= 7 ? ' Probably fine, I will keep it for now.' : ' I use it now and then; at the new price I will compare options.');
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)}.${gap}${verdict}`;
}

// Churn multiplier applied for 60 days after a migration takes effect. [design]
// A 20% increase with a great notice (risk ~0.03) ≈ 1.4×, an average one (~0.13) ≈ 1.7×, a bad one (0.3+) 2.2-2.5×.
export function migrationChurnMultiplier(increasePct, avgChurnRisk) {
  if (increasePct <= 0) return 1;
  return +clamp(1 + increasePct * 1.5 + avgChurnRisk * 3, 1, 3).toFixed(2);
}
