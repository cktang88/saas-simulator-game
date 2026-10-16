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
  const reasons = (n.match(/because|so that|insur|standard|market|cap|subprocessor|scc|dpf|region|notice|reminder|common paper|bonterms/gi) ?? []).length;
  deal += clamp(reasons * 0.02, 0, 0.08) + (n.length < 40 ? -0.05 : 0);
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
  const reasons = (n.match(/because|so that|insur|standard|market|cap|subprocessor|scc|dpf|region|notice|reminder|common paper|bonterms/gi) ?? []).length;
  const rubric = cleanRubric({
    market_standard: 5 - sc.risk * 1.6 - (opts.some((o) => o && o.deal < -0.1) ? 1 : 0),
    reasoned: n.length < 40 ? 1 : 2 + Math.min(3, reasons * 0.7),
    trade_offs: 1 + (answered.length ? 4 * answered.filter((o) => o.deal >= -0.05 && o.risk <= 0.8).length / clauses.length : 0),
    honorable: 5 - sc.risk * 1.3,
    responsiveness: 1 + (answered.length ? 4 * answered.length / clauses.length : 0) - (opts.some((o) => o && o.deal <= -0.15) ? 1 : 0),
  }, REDLINE_RUBRIC);
  return {
    rubric,
    verdict: sc.dealProbability > 0.65 ? 'These positions are reasonable. We can work with this.' : sc.dealProbability > 0.4 ? 'Some of this will need another round with our security and legal teams.' : 'We are far apart. I am not sure we can sign this quarter.',
    dealProbability: sc.dealProbability,
    clauseFeedback: clauses.map((k) => ({ clause: CLAUSES[k].title, feedback: CLAUSES[k].options[choices[k]]?.note ?? 'No response on this clause.' })),
    coaching: sc.risk >= 2 ? 'Our counsel flagged that you gave away protections that could sink a company in one incident; we would have wanted a capped compromise.' : 'Our counsel read each position; where there was no reason given, we treated it as a bare no.',
  };
}
