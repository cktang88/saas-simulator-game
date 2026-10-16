// Newsletter issue judge: rubric (growth/rubrics.js NEWSLETTER_CRITERIA), strict schema and the deterministic offline
// fallback. The LLM scores criteria 1-5 and quotes evidence; the game computes `score` with fixed weights.
// Research: docs/research/judging/marketing.md.

import { rubricText } from '../../core/rubric.js';
import { NEWSLETTER_CRITERIA, withRubric, rubricSkill } from '../growth/rubrics.js';
import { lintIssue } from './model.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wc = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

export const NEWSLETTER_SCHEMA = withRubric({
  type: 'object', additionalProperties: false, required: ['score', 'fix'],
  properties: { score: { type: 'number', description: '0-1 overall; the game recomputes it from the criteria' }, fix: { type: 'string', description: 'The single change a stellar editor would make first' } },
}, NEWSLETTER_CRITERIA);

export const NEWSLETTER_SYSTEM = `You are a skeptical newsletter editor judging one issue the way a reader skimming it would. Reward one idea, specific numbers and examples, a consistent human voice and at most one soft call to action. Penalise product pitches in every issue, filler and generic advice. Length, exclamation marks and repeating the product name earn nothing.\n${rubricText(NEWSLETTER_CRITERIA)}`;

export function issueHeuristic(state, { subject = '', body = '' }) {
  const l = lintIssue(state, { subject, body });
  const text = String(body);
  const nums = (text.match(/\d[\d,.%$]*/g) ?? []).length;
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim());
  const heads = (text.match(/^#+\s|^\*\*[^*]+\*\*\s*$/gm) ?? []).length;
  const sw = wc(subject);
  const filler = /(in today'?s|delve|game-?changer|unlock|supercharge|stay tuned|exciting news|we'?re thrilled)/i.test(text);
  const story = /\b(i|we)\b.*\b(tried|learned|shipped|lost|made|grew|mistake|found|ran|measured)/i.test(text);
  const crit = {
    one_idea: clamp(1 + (paras.length >= 3 ? 1 : 0) + (l.words >= 200 && l.words <= 1200 ? 1 : 0) + (story ? 1.5 : 0) + (nums >= 2 ? 0.5 : 0), 1, 5),
    specific_evidence: clamp(1 + Math.min(3, nums * 0.6) + (story ? 1 : 0), 1, 5),
    voice_consistency: clamp(3.5 + (story ? 1 : 0) - (filler ? 2 : 0) - (/(sorry we haven'?t|it'?s been a while)/i.test(text) ? 1 : 0), 1, 5),
    cta_discipline: l.pitchRatio > 1 ? 1 : clamp(5 - l.pitchRatio * 2.5 - Math.max(0, l.pitches - 1), 1, 5),
    subject_body_match: !sw ? 1 : clamp(4 - (sw > 9 ? 1.5 : 0) - (/[A-Z]{5,}|!!/.test(subject) ? 1.5 : 0) + (/\d/.test(subject) ? 0.5 : 0), 1, 5),
    scannable_length: clamp(1 + (l.words >= 300 && l.words <= 1000 ? 2 : l.words >= 120 && l.words <= 1400 ? 1 : 0) + (paras.length >= 4 ? 1 : 0) + (heads ? 1 : 0), 1, 5),
  };
  const worst = Object.entries(crit).sort((a, b) => a[1] - b[1])[0][0];
  const fixes = {
    one_idea: 'Pick one idea and develop it with a worked example.', specific_evidence: 'Add real numbers, a screenshot or a teardown only you can write.',
    voice_consistency: 'Cut the filler openers and write the way you talk; keep the same section each week.', cta_discipline: 'Sell once, softly, at the end; value comes first.',
    subject_body_match: 'Subject: plain, specific, under nine words, and paid off in the first paragraph.', scannable_length: 'Aim for 300-1,000 words in short paragraphs.',
  };
  const fix = l.issues[0] ?? fixes[worst];
  const out = { ...crit, evidence: l.issues[0] ?? `Weakest area: ${worst}`, fix };
  return { score: issueScore(out), ...out };
}

/** Judge one issue with the chat model + Jev rubric blend. → { score, fix, data, jev } live, or null offline (the model uses its own lint). */
export async function judgeIssue(ctx, subject, body) {
  const res = await ctx.llm.ask({
    task: 'newsletter_issue_judge', rubric: NEWSLETTER_CRITERIA,
    system: NEWSLETTER_SYSTEM,
    prompt: `Subject: ${subject}\n\n${String(body).slice(0, 4000)}\n\nScore each criterion, quote evidence for the low ones, and give the one fix a stellar editor would make first.`,
    schema: NEWSLETTER_SCHEMA, temperature: 0.3, maxTokens: 2000,
    fallback: () => issueHeuristic(ctx.state, { subject, body }),
  });
  return res.mock ? null : { score: issueScore(res.data), fix: res.data.fix, data: res.data, jev: res.jev };
}

/** 0..1 score from per-criterion results (fixed weights); the model's own holistic number is only a fallback. */
export function issueScore(data) {
  const r = rubricSkill([data], NEWSLETTER_CRITERIA);
  return r == null ? clamp(Number(data?.score) || 0, 0, 1) : clamp(r, 0, 1);
}
