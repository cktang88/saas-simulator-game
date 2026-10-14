// Judges for things the founder writes in the money apps: dispute evidence and price-change notices.
// LLM panel (core/llm.js) with deterministic heuristic fallbacks of the same shape. Heuristics are pure.

import { clamp, words } from '../../core/util.js';

export const MIN_EVIDENCE_WORDS = 40;

export const EVIDENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['quality', 'likelyOutcome', 'strengths', 'weaknesses'],
  properties: {
    quality: { type: 'number', description: '0-1: how compelling this evidence is for this reason code, given the facts on record.' },
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
  if (n < MIN_EVIDENCE_WORDS) return { quality: 0.05, likelyOutcome: 'lose', strengths: [], weaknesses: [`Only ${n} words: issuers deny thin responses.`] };
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
  return { quality: +q.toFixed(2), likelyOutcome: q > 0.6 ? 'win' : q < 0.35 ? 'lose' : 'toss-up', strengths: s.slice(0, 5), weaknesses: w.slice(0, 4) };
}

export function evidencePrompt(text, facts) {
  return `Dispute reason code: ${facts.reason}.
Facts on the merchant's records (true; the merchant may contradict them):
- Charge: $${facts.amount} on ${facts.chargeDate}
- Customer: ${facts.customerName}, signed up ${facts.signupDate}, ${facts.successfulCharges} successful charge(s) so far
- Cancellation requested before this charge: ${facts.cancelRequested ? 'YES' : 'no'}
- Product: ${facts.product}

=== MERCHANT'S EVIDENCE TEXT ===
${String(text).slice(0, 6000)}
=== END ===
Judge how likely the issuer reverses the chargeback. Penalize claims contradicted by the facts and anything vague.`;
}
export const EVIDENCE_SYSTEM = 'You are a chargeback analyst at a card-issuing bank in 2026 reviewing a SaaS merchant\'s compelling evidence. You have seen thousands of responses; most merchants lose. You reward specific, verifiable proof matched to the reason code (usage logs after purchase, disclosed cancellation/refund policy the customer accepted, AVS/CVC/3DS results, prior undisputed payments, reminder emails) and penalize vague, emotional or contradictory claims. Be strict.';

// ---- Price-change notice to existing subscribers ----

export const NOTICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['clarity', 'fairness', 'churnRisk', 'reaction'],
  properties: {
    clarity: { type: 'number', description: '1-10: do I understand what changes, by how much, and when?' },
    fairness: { type: 'number', description: '1-10: does it explain why and treat me fairly (notice, options, lock-in offer)?' },
    churnRisk: { type: 'number', description: '0-1: probability I cancel because of this email.' },
    reaction: { type: 'string', description: 'One or two blunt sentences, in character.' },
  },
};
export function noticeHeuristic(text, { oldPrice, newPrice, noticeDays }) {
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
  return { clarity, fairness, churnRisk: +churnRisk.toFixed(3), reaction: fairness >= 7 ? 'Annoying, but they explained it and gave me time. I\'ll probably stay.' : 'A price hike with no real reason. I\'m going to look at alternatives.' };
}

// Churn multiplier applied for 60 days after a migration takes effect. [design]
// A 20% increase with an average notice ≈ 1.6×; a great notice ≈ 1.25×; a bad one up to ~2.5×.
export function migrationChurnMultiplier(increasePct, avgChurnRisk) {
  if (increasePct <= 0) return 1;
  return +clamp(1 + increasePct * 1.5 + avgChurnRisk * 3, 1, 3).toFixed(2);
}
