// "Customer sent redlines" scenario: procurement/legal at a B2B customer marks up your MSA.
// The player picks a position per clause and writes a cover note; a counsel persona reacts.
// Deal and risk deltas are game assumptions [A] reflecting common market positions.

import { clamp, round2 } from '../../core/util.js';
import { rubricSchema, cleanRubric } from '../../core/rubric-schema.js';
import { REDLINE_RUBRIC } from './rubric.js';

export const CLAUSES = {
  liability: {
    title: 'Limitation of liability',
    ask: 'Delete the liability cap entirely ("unlimited liability for any breach").',
    options: {
      standard: { label: 'Keep a mutual cap at 12 months of fees paid; exclude indirect/consequential damages', deal: -0.05, risk: 0, note: 'Market standard for SaaS. Most buyers accept it with a reason.' },
      supercap: { label: 'Offer a higher "super-cap" (2–3× fees) for data-breach and confidentiality claims only', deal: 0.08, risk: 0.5, note: 'Common compromise; still bounded and insurable with cyber cover.' },
      accept: { label: 'Accept unlimited liability', deal: 0.12, risk: 3, note: 'One incident could exceed the value of your company. Rarely acceptable.' },
      reject: { label: 'Refuse any change, no explanation', deal: -0.2, risk: 0, note: 'Procurement escalates or walks.' },
    },
  },
  indemnity: {
    title: 'Indemnification',
    ask: 'You indemnify us for any and all claims arising from the services, uncapped.',
    options: {
      ip_only: { label: 'You indemnify for third-party IP infringement claims; they indemnify for their data/content and misuse', deal: 0, risk: 0.2, note: 'The standard mutual structure (Common Paper / Bonterms style).' },
      mutual_capped: { label: 'Mutual indemnity incl. data breach, subject to the (super-)cap', deal: 0.06, risk: 0.6, note: 'Reasonable for larger deals.' },
      accept_broad: { label: 'Accept broad, uncapped indemnity for "any claims"', deal: 0.1, risk: 2.5, note: 'You become their insurer.' },
      reject: { label: 'Strike indemnity entirely', deal: -0.18, risk: 0, note: 'Buyers expect at least IP indemnity from a vendor.' },
    },
  },
  autorenew: {
    title: 'Auto-renewal',
    ask: 'Remove auto-renewal; renewals only by new signed order form. Add termination for convenience on 30 days notice.',
    options: {
      keep_notice: { label: 'Keep auto-renewal with 60-day notice and a renewal reminder email; price increase capped at 5–7%', deal: 0.02, risk: 0.1, note: 'Addresses the real fear (surprise renewals) and keeps your NRR.' },
      accept_strike: { label: 'Remove auto-renewal and allow termination for convenience', deal: 0.1, risk: 0.8, note: 'Revenue becomes cancellable at any time; hurts ARR quality in diligence.' },
      keep_30: { label: 'Keep auto-renewal with 30-day notice, no changes', deal: -0.04, risk: 0, note: 'Acceptable to many SMBs; enterprises push back.' },
      reject: { label: 'Refuse, no explanation', deal: -0.15, risk: 0, note: 'Signals inflexibility.' },
    },
  },
  residency: {
    title: 'Data residency',
    ask: 'All customer data, including backups and AI processing, must stay in the EU.',
    options: {
      scc_dpf: { label: 'Explain transfers under SCCs / EU-US Data Privacy Framework, share subprocessor list incl. LLM provider and its region', deal: 0.02, risk: 0.2, note: 'Usually enough for mid-market GDPR buyers.' },
      eu_region: { label: 'Offer an EU hosting region (+~$150/mo infra) and EU-region model endpoints', deal: 0.1, risk: 0.1, note: 'Real cost, but credible and checkable.' },
      accept_eu_only: { label: 'Commit to EU-only processing for everything, today', deal: 0.12, risk: 1.5, note: 'Breach of contract if any subprocessor (email, LLM API, logs) touches the US.' },
      reject: { label: 'Refuse: data stays in the US', deal: -0.25, risk: 0, note: 'EU buyers often cannot sign this.' },
    },
  },
};

// Which contested clauses the cover note actually explains. The offline judge used to count keyword hits anywhere in
// the note ("standard standard cap cap market" earned the full bonus). Now a clause counts only when a real sentence
// (6+ words, not a repeated-word list) names that clause's subject AND gives a reason; one sentence can explain at most
// one clause per 6 words, so a single line of stacked topic words explains one clause, not four. [design]
const CLAUSE_TOPIC = {
  liability: /liabilit|\bcap(ped|s)?\b|super-?cap|damages/i,
  indemnity: /indemn|infring|third[- ]party (ip|claim)/i,
  autorenew: /renew|terminat|notice period|for convenience|reminder/i,
  residency: /residen|\beu\b|europe|region|\bscc|dpf|privacy framework|subprocessor|transfer|gdpr/i,
};
const REASON = /\bbecause\b|\bso (that|you|we|nobody|neither|both|your)\b|\bsince\b|\binsur|\bstandard\b|common paper|bonterms|\bwhich (means|covers|keeps)\b|\bthat way\b|\bin exchange\b|\binstead\b|\bwe can(not|'t)?\b|\bwe (do|don't|run|use|keep|offer|already)\b|\btoday\b|\bcovers?\b|\bprotects?\b/i;
const GLUE = new Set('the a an we our us you your it its is are be to of and for that this with on in at by as so from what which if or can will'.split(' '));
export function noteReasons(note, clauses = []) {
  const sentences = String(note ?? '').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const covered = new Set();
  for (const sen of sentences) {
    const ws = sen.toLowerCase().match(/[a-z0-9']+/g) ?? [];
    const glue = ws.filter((w) => GLUE.has(w)).length; // a sentence has articles, pronouns and prepositions; a keyword list does not
    if (ws.length < 6 || new Set(ws).size / ws.length < 0.6 || glue < Math.max(2, ws.length * 0.15) || !REASON.test(sen)) continue;
    let budget = Math.floor(ws.length / 6);
    for (const k of clauses) {
      if (budget <= 0) break;
      if (!covered.has(k) && CLAUSE_TOPIC[k]?.test(sen)) { covered.add(k); budget--; }
    }
  }
  return { covered: [...covered], share: clauses.length ? covered.size / clauses.length : 0 };
}

// The positions lawyer-in-the-loop counsel returns (Crosby or a law firm): market-standard, capped compromises with one
// reasoned sentence per clause, so each position reads as a reason and not a bare no. [design: the stellar response]
const COUNSEL_PICK = { liability: 'supercap', indemnity: 'ip_only', autorenew: 'keep_notice', residency: 'scc_dpf' };
const COUNSEL_LINE = {
  liability: 'We keep a mutual cap at twelve months of fees because a higher super-cap for data breach claims is insurable under our cyber policy.',
  indemnity: 'We indemnify you for third-party IP infringement claims, which is the standard Common Paper structure, and you cover your own data and content.',
  autorenew: 'Renewal stays automatic with a sixty-day notice period and a reminder email, so nobody on your team is surprised by an invoice.',
  residency: 'Transfers run under the SCCs and the EU-US Data Privacy Framework, and we share our subprocessor list with you today.',
};
export function counselPositions(clauses = []) {
  const choices = {};
  for (const k of clauses) if (COUNSEL_PICK[k]) choices[k] = COUNSEL_PICK[k];
  const note = clauses.filter((k) => COUNSEL_LINE[k]).map((k) => COUNSEL_LINE[k]).join(' ');
  return { choices, note };
}

// Score a response. choices: { clauseKey: optionKey }, note: cover note text, ctx: { model, hasMsa, dpaReady, soc2 }
export function scoreRedlines(clauses, choices, note = '', ctx = {}) {
  let deal = ctx.model === 'ent' ? 0.6 : 0.7;
  let risk = 0;
  for (const k of clauses) {
    const o = CLAUSES[k]?.options[choices[k]];
    if (!o) { deal -= 0.12; continue; } // unanswered clause
    deal += o.deal;
    risk += o.risk;
  }
  const n = String(note).trim();
  const { share } = noteReasons(note, clauses);
  deal += 0.08 * share + (n.length < 40 ? -0.05 : 0);
  if (ctx.dpaReady) deal += 0.04;
  if (ctx.soc2 && ctx.soc2 !== 'none') deal += 0.04;
  if (ctx.hasMsa) deal += 0.03;
  return { dealProbability: round2(clamp(deal, 0.05, 0.95)), risk: round2(risk) };
}

export const REDLINE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['rubric', 'verdict', 'dealProbability', 'clauseFeedback', 'coaching'],
  properties: {
    rubric: rubricSchema(REDLINE_RUBRIC),
    verdict: { type: 'string', description: 'Your reply as the customer\'s counsel, 1-3 sentences.' },
    dealProbability: { type: 'number', description: '0-1: probability your company signs on these terms.' },
    clauseFeedback: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['clause', 'feedback'], properties: { clause: { type: 'string' }, feedback: { type: 'string', description: 'Max 35 words: your reaction to their position and what you need instead' } } }, description: 'One entry per clause in the redline, in order' },
    coaching: { type: 'string', description: 'One sentence in your voice as the customer counsel: the concern that decided your answer. React, do not coach.' },
  },
};

export function heuristicRedlineFeedback(clauses, choices, note, ctx) {
  const sc = scoreRedlines(clauses, choices, note, ctx);
  const opts = clauses.map((k) => CLAUSES[k]?.options[choices[k]]);
  const answered = opts.filter(Boolean);
  const n = String(note).trim();
  const { share, covered } = noteReasons(note, clauses);
  const unexplained = clauses.filter((k) => CLAUSES[k] && !covered.includes(k));
  const rubric = cleanRubric({
    market_standard: 5 - sc.risk * 1.6 - (opts.some((o) => o && o.deal < -0.1) ? 1 : 0),
    reasoned: n.length < 40 ? 1 : 1.5 + 3.5 * share,
    trade_offs: 1 + (answered.length ? 4 * answered.filter((o) => o.deal >= -0.05 && o.risk <= 0.8).length / clauses.length : 0),
    honorable: 5 - sc.risk * 1.3,
    responsiveness: 1 + (answered.length ? 4 * answered.length / clauses.length : 0) - (opts.some((o) => o && o.deal <= -0.15) ? 1 : 0),
  }, REDLINE_RUBRIC);
  return {
    rubric,
    verdict: sc.dealProbability > 0.65 ? 'These positions are reasonable. We can work with this.' : sc.dealProbability > 0.4 ? 'Some of this will need another round with our security and legal teams.' : 'We are far apart. I am not sure we can sign this quarter.',
    dealProbability: sc.dealProbability,
    clauseFeedback: clauses.map((k) => ({ clause: CLAUSES[k].title, feedback: CLAUSES[k].options[choices[k]]?.note ?? 'No response on this clause.' })),
    coaching: sc.risk >= 2 ? 'Our counsel flagged that you gave away protections that could sink a company in one incident; we would have wanted a capped compromise.'
      : unexplained.length ? `Your note gives no reason on ${unexplained.map((k) => CLAUSES[k].title.toLowerCase()).join(', ')}; we read ${unexplained.length === 1 ? 'that position' : 'those positions'} as a bare no.`
        : 'Each position came with a reason we can take back to our team.',
  };
}
