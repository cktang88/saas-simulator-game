// LLM feedback for the redlines scenario (customer's counsel persona) with a deterministic fallback.

import { REALISM } from '../../core/llm.js';
import { clamp } from '../../core/util.js';
import { CLAUSES, REDLINE_SCHEMA, heuristicRedlineFeedback } from './redlines.js';
import { redlineCtx } from './sim.js';
import { bizBlock } from '../context.js';
import { rubricText, weighted } from '../../core/rubric.js';
import { cleanRubric } from '../../core/rubric-schema.js';
import { REDLINE_RUBRIC } from './rubric.js';

export async function redlineFeedback(ctx, r, choices, note) {
  const s = ctx.state;
  const rc = redlineCtx(s);
  const positions = r.clauses.map((k) => `- ${CLAUSES[k].title}. We asked: "${CLAUSES[k].ask}" Vendor's position: ${CLAUSES[k].options[choices[k]]?.label ?? '(no response)'}`).join('\n');
  const res = await ctx.llm.ask({
    task: 'contract_redlines', rubric: REDLINE_RUBRIC, context: bizBlock(ctx.state, 'public'),
    system: `${REALISM}\nYou are in-house counsel at ${r.customer}, reviewing a small SaaS vendor's response to your redlines in 2026. You protect your company but you know market-standard SaaS terms (Common Paper/Bonterms). You accept reasonable, explained positions and push back on bare refusals. You are glad to take concessions in your company's favour (your job is to protect your company, not the vendor); when a concession is obviously undeliverable (EU-only processing today while their LLM provider runs in the US) you flag it and want it fixed in the paper before signature, which delays but rarely kills the deal. Vendor context: ${rc.hasMsa ? 'uses its own MSA' : 'has no MSA, you sent your paper'}; DPA ${rc.dpaReady ? 'available' : 'not available'}; SOC 2: ${rc.soc2}.
${rubricText(REDLINE_RUBRIC)}
Score the vendor's positions and cover note in "rubric"; quote the clause or sentence behind any score of 2 or lower in the clause feedback. Citing a standard by name without a matching position earns nothing; conceding everything is not market standard.
The rubric grades the vendor's craft. "dealProbability" is different: how likely YOUR company signs on these terms. Concessions in your favour make signing more likely (you are happy to take uncapped liability from a vendor), unless a commitment is obviously undeliverable and you would have to re-paper it later. Bare refusals and unexplained positions make it less likely. In "coaching", tell the vendor founder (neutrally) what each risky concession could cost them.`,
    prompt: `Vendor's positions:\n${positions}\n\nVendor's cover note:\n"""${String(note).slice(0, 3000)}"""\n\nRespond in character, give clause-by-clause feedback, and estimate the probability you sign.`,
    schema: REDLINE_SCHEMA,
    temperature: 0.6, maxTokens: 3200,
    fallback: () => heuristicRedlineFeedback(r.clauses, choices, note, rc),
  });
  return withRubric(res, r, choices, note, rc);
}

/**
 * Deal probability = the counsel's estimate, half-weighted with the customer-facing rubric criteria (did the vendor
 * answer every ask, with reasons, and only commit to what it can deliver). The vendor-protective criteria
 * (market_standard, trade_offs) grade craft and coaching, not the customer's willingness to sign: a vendor that
 * concedes everything gets signed more often, and pays through legal exposure instead (resolveRedline, sim.js).
 */
const ACCEPT_CRITERIA = REDLINE_RUBRIC.filter((c) => ['reasoned', 'honorable', 'responsiveness'].includes(c.key));
export function withRubric(res, r, choices, note, rc) {
  const d = res.data;
  const rubric = cleanRubric(d.rubric ?? heuristicRedlineFeedback(r.clauses, choices, note, rc).rubric, REDLINE_RUBRIC);
  const w = weighted(rubric, ACCEPT_CRITERIA);
  // A counsel who says 0% must not read as a coin flip (`|| 0.5` turned a flat no into 50%); only a missing value defaults.
  const dp = Number(d.dealProbability);
  const llm = clamp(d.dealProbability != null && Number.isFinite(dp) ? dp : 0.5, 0, 1);
  const p = res.mock ? llm : 0.6 * llm + 0.4 * clamp((w - 1) / 4, 0.05, 0.95);
  return { ...d, rubric, dealProbability: clamp(p, 0.05, 0.95), mock: res.mock, model: res.model };
}
