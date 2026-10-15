// LLM judging for Search & AI visibility. Chat models write and score against a rubric; Jev (ctx.llm.decide) makes
// the typed calls: which kind each prompt is, and whether a pasted real AI answer names / recommends the brand.
// Every call has a deterministic offline fallback (ARCHITECTURE principle 8).

import { rubricText } from '../../core/rubric.js';
import { REALISM } from '../../core/llm.js';
import { bizBlock } from '../context.js';
import { withRubric, rubricSkill } from '../growth/rubrics.js';
import { classifyPrompt, promptSetStructure, rivalNames } from './geo.js';
import { mainPlan } from '../../core/market.js';

// What separates a prompt set that measures buyers from one that flatters you (llm-visibility tiers table).
export const PROMPT_SET_CRITERIA = [
  { key: 'buyer_intent', label: 'prompts a buyer would type before choosing a tool', weight: 0.3,
    anchors: { 1: 'mostly "what is <brand>" / "is <brand> good" or unrelated questions', 3: 'some category prompts mixed with vanity ones', 5: 'nearly all are category, problem or "best X for Y" prompts that do not contain the brand' } },
  { key: 'funnel_coverage', label: 'covers the journey: problem, category, comparison, pricing', weight: 0.2,
    anchors: { 1: 'one kind of question repeated', 3: 'category and comparison, nothing on problems or pricing', 5: 'problem-aware, category, "X vs Y" / alternatives and pricing prompts, each several times' } },
  { key: 'icp_specificity', label: 'specific to the real ICP and use case', weight: 0.2,
    anchors: { 1: 'generic ("best software")', 3: 'names the category', 5: 'names the buyer, their situation and constraints as they would ("for a 3-person Shopify store on QuickBooks")' } },
  { key: 'competitor_coverage', label: 'includes the competitors buyers compare you with', weight: 0.15,
    anchors: { 1: 'no competitor appears', 3: 'one obvious competitor', 5: 'the main real alternatives and the status quo (spreadsheets, agencies) appear in comparison prompts' } },
  { key: 'real_phrasing', label: 'phrased the way buyers actually ask (sales calls, support, Search Console)', weight: 0.15,
    anchors: { 1: 'keyword strings or marketing language', 3: 'plain but generic', 5: 'conversational, with the details people really include; clearly drawn from real conversations' } },
];

const PROMPT_SET_SCHEMA = withRubric({
  type: 'object', additionalProperties: false,
  required: ['quality', 'feedback'],
  properties: { quality: { type: 'number', description: '0-10 overall: would tracking these prompts tell the founder how buyers see them in AI answers?' }, feedback: { type: 'string', description: 'Two sentences: the biggest gap and the prompts to add.' } },
}, PROMPT_SET_CRITERIA);

const KIND_CRITERIA = {
  generic: 'a buyer asking for a tool, category or solution to a problem, without naming this brand',
  comparison: 'compares tools or asks for alternatives to a named product (X vs Y, alternatives to X)',
  vanity: 'contains this brand name or asks about the company itself; it will name the brand whatever the market thinks',
  off_target: 'unrelated to what the business sells, or not something a buyer would ask',
};

function heuristicJudge(state, texts) {
  const list = texts.map((t) => ({ text: t, kind: classifyPrompt(state, t) }));
  const st = promptSetStructure(list);
  const to5 = (x) => Math.max(1, Math.min(5, Math.round(1 + 4 * x)));
  const comp = list.filter((p) => p.kind === 'comparison').length / Math.max(1, list.length);
  const specific = list.filter((p) => p.text.split(/\s+/).length >= 7).length / Math.max(1, list.length);
  return {
    quality: Math.round(st.score * 100) / 10, feedback: st.vanityShare > 0.3 ? 'Too many prompts contain your brand name: they will always name you and measure nothing. Replace them with "best X for Y" and "X alternatives" prompts.' : st.n < 10 ? 'Too few prompts to see a pattern: aim for 20-50 from sales calls, support and Search Console.' : 'Add comparison and pricing prompts that name your real competitors.',
    buyer_intent: to5(st.buyerShare - st.vanityShare), funnel_coverage: to5(comp > 0 && comp < 0.8 ? 0.7 : 0.3), icp_specificity: to5(specific), competitor_coverage: to5(Math.min(1, comp * 2.5)), real_phrasing: to5(specific * 0.8), evidence: 'offline heuristic',
  };
}

/** Judge a prompt set: Jev classifies each prompt, a rubric panel scores the set. → { kinds, rubric (0..1|null), feedback, mock } */
export async function judgePromptSet(ctx, texts) {
  const state = ctx.state;
  const sample = texts.slice(0, 30);
  const questions = Object.fromEntries(sample.map((t, i) => [`p${i}`, { type: 'choice', instructions: `Classify this prompt someone typed into an AI assistant: "${t}". The company is ${state.company?.name}: ${state.company?.oneLiner ?? ''}.`, criteria: KIND_CRITERIA }]));
  const dec = await ctx.llm.decide({
    task: 'geo_prompt_kind', state: { company: state.company?.name, oneLiner: state.company?.oneLiner, icp: state.company?.icp, competitors: rivalNames(state) }, questions,
    fallback: () => Object.fromEntries(sample.map((t, i) => [`p${i}`, { type: 'choice', choice: classifyPrompt(state, t), confidence: 0.5 }])), cache: state.cache,
  });
  const kinds = texts.map((t, i) => {
    const a = dec.answers?.[`p${i}`];
    return a?.choice && KIND_CRITERIA[a.choice] ? a.choice : classifyPrompt(state, t);
  });
  const res = await ctx.llm.panel({
    task: 'geo_prompt_set', rubric: PROMPT_SET_CRITERIA, context: bizBlock(state, 'insider'),
    system: `${REALISM}\nYou are a B2B SaaS search lead who has run AI-visibility tracking for many companies. Judge whether tracking this prompt set would tell the founder how real buyers see them in ChatGPT, Claude, Perplexity, Gemini and AI Overviews. More prompts or keywords do not earn credit; buyer realism does.\n${rubricText(PROMPT_SET_CRITERIA)}`,
    prompt: `Prompt set (${texts.length}):\n${texts.slice(0, 60).map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
    schema: PROMPT_SET_SCHEMA, maxTokens: 500,
    fallback: () => heuristicJudge(state, texts), cache: state.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...r.data }));
  const mock = results.every((r) => r.mock) && dec.mock;
  return { kinds, rubric: rubricSkill(results, PROMPT_SET_CRITERIA), feedback: results[0]?.feedback ?? '', mock };
}

/** Classify a real AI answer the player pasted: is the brand named, recommended, described negatively, with a wrong price? */
export async function classifyAnswer(ctx, { prompt, answer }) {
  const state = ctx.state;
  const brand = String(state.company?.name ?? '').trim();
  const plan = mainPlan(state);
  const text = String(answer ?? '').slice(0, 6000);
  const fallback = () => {
    const named = brand && new RegExp(`\\b${brand.replace(/[^\w ]/g, '').split(/\s+/)[0]}\\b`, 'i').test(text);
    const prices = [...text.matchAll(/\$\s?(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    const wrong = named && plan && prices.length > 0 && !prices.includes(plan.price);
    const neg = named && /\b(scam|avoid|complain|astroturf|fake reviews|not recommended|buggy)\b/i.test(text);
    return {
      mentioned: { type: 'noul', noul: named ? 0.95 : 0.05 },
      stance: { type: 'choice', choice: !named ? 'absent' : neg ? 'negative' : /\b(recommend|best|top pick|go with)\b/i.test(text) ? 'recommended' : 'listed', confidence: 0.5 },
      wrong_fact: { type: 'noul', noul: wrong ? 0.7 : 0.1 },
    };
  };
  const r = await ctx.llm.decide({
    task: 'geo_answer_check',
    state: { brand, our_price: plan ? `$${plan.price}/${plan.interval}` : 'unknown', buyer_prompt: String(prompt ?? '').slice(0, 300), ai_answer: text },
    questions: {
      mentioned: { type: 'noul', instructions: `Does the AI answer name ${brand} (the product, not a different company with a similar name)?`, criteria: { true: `${brand} is named`, false: `${brand} is not named` } },
      stance: { type: 'choice', instructions: `How does the answer treat ${brand}?`, criteria: { recommended: 'recommended or ranked as a top pick', listed: 'listed among options without a recommendation', negative: 'mentioned with warnings, complaints or negative claims', absent: 'not mentioned' } },
      wrong_fact: { type: 'noul', instructions: `Does the answer state a price, plan or feature for ${brand} that contradicts our_price or is clearly invented?`, criteria: { true: 'states a wrong price, plan or feature', false: 'no wrong facts about the brand' } },
    },
    fallback, cache: state.cache,
  });
  const a = r.answers ?? fallback();
  return { mentioned: (a.mentioned?.noul ?? 0) >= 0.5, pMentioned: a.mentioned?.noul ?? 0, stance: a.stance?.choice ?? 'absent', wrongFact: (a.wrong_fact?.noul ?? 0) >= 0.5, mock: r.mock };
}
