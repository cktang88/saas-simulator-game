// LLM judge for lifecycle emails (live) with the deterministic heuristic as fallback. Offline results are NOT stored
// as a judge score: the engine then uses the heuristic shrunk toward the median (model.js nodeQuality), so keyword
// stuffing cannot reach stellar offline (operator-tiers-audit §5.4).
import { REALISM } from '../../core/llm.js';
import { lintEmail } from './model.js';
import { weighted } from '../../core/rubric.js';
import { EMAIL_CRITERIA, EMAIL_KEYS, emailRubric, criteriaFromLint } from './rubric.js';

const CRIT_PROPS = Object.fromEntries(EMAIL_CRITERIA.map((c) => [c.key, { type: 'integer', description: `1-5 against the rubric anchors for ${c.label}` }]));
export const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: [...EMAIL_KEYS, 'evidence', 'score', 'oneClearAction', 'pointsToActivation', 'readsAsAI', 'upsellsBeforeValue', 'feedback'],
  properties: {
    ...CRIT_PROPS,
    evidence: { type: 'string', description: 'Exact quotes from the email behind every criterion scored 1 or 2' },
    score: { type: 'number', description: '0-10 overall gut check; the game uses the weighted rubric scores when present' },
    oneClearAction: { type: 'boolean' },
    pointsToActivation: { type: 'boolean', description: 'Does it ask for the specific activation action named in the brief?' },
    readsAsAI: { type: 'boolean' },
    upsellsBeforeValue: { type: 'boolean' },
    feedback: { type: 'string', description: 'One or two sentences: what a stellar lifecycle marketer would change.' },
  },
};

const KIND_BRIEF = {
  welcome: 'a welcome / onboarding email sent right after signup',
  nudge: 'an activation nudge to a user who has NOT done the activation action yet',
  trial_ending: 'a trial-ending email a few days before the card is charged',
  winback: 'a win-back email to a customer who canceled',
  custom: 'a lifecycle email',
  broadcast: 'a one-off broadcast',
};

export function judgePrompt(state, { subject, body }, { kind, event }) {
  return `Product: ${state.company.name}: ${state.company.oneLiner || 'a SaaS product'}. Ideal customer: ${state.company.icp || 'small businesses'}.
This is ${KIND_BRIEF[kind] ?? KIND_BRIEF.custom}. The activation action (the one step that predicts a user staying) is: ${event ? event.label : 'NOT DEFINED by the founder'}.

Subject: ${subject}
---
${String(body).slice(0, 2500)}
---
You just signed up for this product and get this email. Judge it as the recipient and as a strict lifecycle-email reviewer, using the rubric in the system prompt. Most onboarding mail is ignored.`;
}

export async function judgeEmail(ctx, email, { kind = 'custom', event = null, featureTitles = [] } = {}) {
  const lint = lintEmail(email, { kind, event, featureTitles });
  const res = await ctx.llm.panel({
    task: 'lifecycle_email_judge', rubric: EMAIL_CRITERIA,
    system: `${REALISM}\nYou are a busy ${ctx.state.company.model === 'b2c' ? 'consumer' : 'small-business owner'} who signed up for a tool last week, and also a sharp lifecycle-email reviewer.\n${emailRubric()}`,
    prompt: judgePrompt(ctx.state, email, { kind, event }),
    schema: SCHEMA,
    fallback: () => ({ ...criteriaFromLint(lint, { kind }), evidence: lint.issues.slice(0, 2).join(' '), score: Math.round(lint.score * 100) / 10, oneClearAction: lint.links >= 1 && lint.links <= 2, pointsToActivation: lint.namesAction, readsAsAI: false, upsellsBeforeValue: lint.discount && ['welcome', 'nudge'].includes(kind), feedback: lint.issues[0] ?? 'Looks fine offline. A live judge can say more.' }),
    cache: ctx.state.cache,
  });
  const live = res.filter((r) => !r.mock);
  if (!live.length) return { lint, judge: null, feedback: res[0]?.data?.feedback ?? '', mock: true };
  const avg = (k) => live.reduce((a, r) => a + Number(r.data[k] ?? 0), 0) / live.length;
  const vote = (k) => live.filter((r) => r.data[k]).length > live.length / 2;
  // Weighted rubric scores (1-5) when the model returned them; the free 0-10 score is only the fallback.
  const rubric = live.map((r) => weighted(r.data, EMAIL_CRITERIA)).filter((v) => v != null);
  const base = rubric.length ? ((rubric.reduce((a, b) => a + b, 0) / rubric.length) - 1) / 4 : avg('score') / 10;
  let score = Math.max(0, Math.min(1, base));
  if (vote('readsAsAI')) score = Math.min(score, 0.45);
  if (vote('upsellsBeforeValue') && ['welcome', 'nudge'].includes(kind)) score = Math.min(score, 0.35);
  return { lint, judge: { score: Math.round(score * 100) / 100, pointsToActivation: vote('pointsToActivation'), oneClearAction: vote('oneClearAction'), feedback: live[0].data.feedback, day: ctx.state.day }, feedback: live[0].data.feedback, mock: false };
}
