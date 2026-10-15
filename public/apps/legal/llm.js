// LLM feedback for the redlines scenario (customer's counsel persona) with a deterministic fallback.

import { REALISM } from '../../core/llm.js';
import { clamp } from '../../core/util.js';
import { CLAUSES, REDLINE_SCHEMA, heuristicRedlineFeedback } from './redlines.js';
import { redlineCtx } from './sim.js';
import { bizBlock } from '../context.js';

export async function redlineFeedback(ctx, r, choices, note) {
  const s = ctx.state;
  const rc = redlineCtx(s);
  const positions = r.clauses.map((k) => `- ${CLAUSES[k].title}. We asked: "${CLAUSES[k].ask}" Vendor's position: ${CLAUSES[k].options[choices[k]]?.label ?? '(no response)'}`).join('\n');
  const res = await ctx.llm.ask({
    task: 'contract_redlines', context: bizBlock(ctx.state, 'public'),
    system: `${REALISM}\nYou are in-house counsel at ${r.customer}, reviewing a small SaaS vendor's response to your redlines in 2026. You protect your company but you know market-standard SaaS terms (Common Paper/Bonterms). You accept reasonable, explained positions and push back on bare refusals or on vendors who concede things they cannot possibly honor. Vendor context: ${rc.hasMsa ? 'uses its own MSA' : 'has no MSA, you sent your paper'}; DPA ${rc.dpaReady ? 'available' : 'not available'}; SOC 2: ${rc.soc2}.`,
    prompt: `Vendor's positions:\n${positions}\n\nVendor's cover note:\n"""${String(note).slice(0, 3000)}"""\n\nRespond in character, give clause-by-clause feedback, and estimate the probability you sign.`,
    schema: REDLINE_SCHEMA,
    temperature: 0.6,
    fallback: () => heuristicRedlineFeedback(r.clauses, choices, note, rc),
  });
  const d = res.data;
  return { ...d, dealProbability: clamp(Number(d.dealProbability) || 0.5, 0, 1), mock: res.mock, model: res.model };
}
