// People judges: researched criteria (docs/research/judging/investors-people-ops.md §Hiring).
// job_post_review scores a post a strong candidate would skim; candidate_interview and candidate_email are
// in-character candidates, so they get "what moves your interest" guidance, not a grader voice.
import { rubricText, weighted } from '../../core/rubric.js';
import { rubricSchema } from '../../core/rubric-fields.js';
import { clamp, words } from '../../core/util.js';

// group: which 1-10 legacy field the criterion feeds (clarity = do I understand the role; specificity = concrete facts).
export const JOB_POST_CRITERIA = [
  { key: 'ownership', group: 'clarity', label: 'What I would own and who I report to', weight: 2.5, anchors: { 1: 'a list of generic duties ("help with various projects")', 3: 'named responsibilities, no decision rights or reporting line', 5: 'named product areas or systems, the decisions you make alone, who you report to and who you work with' } },
  { key: 'requirements', group: 'clarity', label: 'Realistic requirements, inclusive wording', weight: 2, anchors: { 1: 'long wish list, absurd years of experience, clichés ("rockstar", "ninja", "dominant", "work hard play hard")', 3: 'reasonable list but must-have and nice-to-have are mixed', 5: 'at most 5-6 must-haves separated from nice-to-haves, no gender-coded clichés, an accommodations or equal-opportunity line' } },
  { key: 'process', group: 'clarity', label: 'Hiring process and timeline', weight: 1.5, anchors: { 1: 'nothing about the process', 3: 'says "interview" with no steps', 5: 'each step, its length, any paid trial or take-home hours, and when a decision comes' } },
  { key: 'outcomes', group: 'specificity', label: 'Outcomes: what success looks like at 30/60/90 days', weight: 3, anchors: { 1: 'tasks only', 3: 'one goal for the role with no timeline or measure', 5: 'two or three measurable outcomes by 30/60/90 days or 6 months, tied to a real company problem' } },
  { key: 'pay', group: 'specificity', label: 'Real pay range (and equity)', weight: 3, anchors: { 1: 'no pay information', 3: '"competitive", or a range wider than about 1.6x, or no equity detail for a startup', 5: 'a tight real range (top under about 1.35x the bottom) plus equity range or the benefits that matter; location rules stated' } },
  { key: 'company_context', group: 'specificity', label: 'Honest company context (stage, customers, team, funding)', weight: 2, anchors: { 1: 'nothing beyond a tagline', 3: 'stage or product described, no numbers', 5: 'stage, customers or revenue, team size, funding or runway status, and the hard parts of the job' } },
];
export const JOB_POST_SCHEMA_R = rubricSchema(JOB_POST_CRITERIA, {
  firstImpression: { type: 'string', description: 'One or two blunt sentences, as a strong candidate skimming the post.' },
  payTransparency: { type: 'boolean', description: 'Does the post state a real pay range?' },
  issues: { type: 'array', items: { type: 'string' } },
  rewriteHint: { type: 'string', description: 'The single highest-value rewrite, quoting the weakest line.' },
});
export const jobPostRubric = () => rubricText(JOB_POST_CRITERIA);
const group = (g) => JOB_POST_CRITERIA.filter((c) => c.group === g);
/** Legacy 1-10 fields from the criterion scores (the game, not the model, applies the weights). */
export function postClaritySpecificity(scores) {
  const c = weighted(scores, group('clarity')), s = weighted(scores, group('specificity'));
  return { clarity: c == null ? null : clamp(c * 2, 1, 10), specificity: s == null ? null : clamp(s * 2, 1, 10) };
}

// ---- Offline scorer ----
const CLICHE = ['rockstar', 'ninja', 'guru', 'wear many hats', 'fast-paced', 'family', 'work hard play hard', 'unlimited pto', 'passionate', 'self-starter', 'synergy', '10x', 'world-class', 'dominant', 'aggressive', 'crush it'];
const r5 = (v) => Math.round(clamp(v, 1, 5));
export function jobPostScoresFallback(post) {
  const text = String(post.text ?? '');
  const t = text.toLowerCase();
  const n = words(text);
  const payInText = /\$\s?\d|\d+\s?k\b|usd|per hour|\/hr|salary range|€\s?\d|£\s?\d/i.test(text);
  const lo = Number(post.payLo) || 0, hi = Number(post.payHi) || 0;
  const hasPay = payInText || (lo > 0 && hi > 0);
  const spread = lo > 0 && hi > 0 ? hi / lo : null;
  const resp = (t.match(/you will|you'll|responsib|own the|build|ship|design|run /g) ?? []).length;
  const buzz = CLICHE.filter((b) => t.includes(b));
  const yearsAbsurd = /(10|12|15)\+ years/.test(t) && post.role !== 'engineer';
  const outcomeHits = (t.match(/first 30|first 60|first 90|30\/60\/90|in your first|by month|success looks like|within \d+ (days|months)|by the end of/g) ?? []).length;
  const numbers = (text.match(/\d+/g) ?? []).length;
  const context = (t.match(/we are|we're|our customers|stage|team of|founder|revenue|mrr|arr|customers|bootstrapped|funded|seed|runway/g) ?? []).length;
  const processHits = (t.match(/interview|process|steps|take-home|paid trial|timeline|decision (by|within)|call/g) ?? []).length;
  const must = (t.match(/must have|required|you have|you've|experience with|requirements/g) ?? []).length;
  return {
    ownership: r5(1 + Math.min(2.5, resp * 0.6) + (/(report to|reports to|work directly with|work with our)/.test(t) ? 1 : 0) + (/(you will own|you'll own|own the|decide)/.test(t) ? 0.8 : 0)),
    requirements: r5(3.2 - buzz.length * 0.9 - (yearsAbsurd ? 1.2 : 0) + (/(nice to have|bonus|preferred)/.test(t) ? 0.7 : 0) + (/(equal opportunity|accommodat|encourage .* apply)/.test(t) ? 0.7 : 0) - (must > 8 ? 1 : 0) - (n < 60 ? 0.7 : 0)),
    process: r5(1 + Math.min(2, processHits * 0.7) + (/(paid|\d+\s?-?\s?(min|minute|hour|h)\b)/.test(t) ? 1 : 0) + (/decision (by|within)|timeline|days/.test(t) ? 0.8 : 0)),
    outcomes: r5(1 + Math.min(2.6, outcomeHits * 1.3) + Math.min(1.4, numbers * 0.25)),
    pay: r5(hasPay ? (spread == null ? 3.5 : spread <= 1.35 ? 5 : spread <= 1.6 ? 4 : 3) + (/(option|equity|rsu)/.test(t) ? 0.4 : 0) : /competitive/.test(t) ? 1.5 : 1),
    company_context: r5(1 + Math.min(3, context * 0.9) + (numbers >= 3 ? 0.7 : 0)),
  };
}
export function heuristicPostJudgeR(post) {
  const scores = jobPostScoresFallback(post);
  const text = String(post.text ?? '');
  const t = text.toLowerCase();
  const n = words(text);
  const hasPay = scores.pay >= 3 || Boolean(Number(post.payLo) > 0 && Number(post.payHi) > 0);
  const buzz = CLICHE.filter((b) => t.includes(b));
  const yearsAbsurd = /(10|12|15)\+ years/.test(t) && post.role !== 'engineer';
  const issues = [
    !hasPay && 'No pay range. Required in many US states (e.g. CO, CA, NY, WA, IL) and under the EU Pay Transparency Directive; posts without one get fewer, worse applicants.',
    hasPay && scores.pay <= 3 && Number(post.payHi) / Math.max(1, Number(post.payLo)) > 1.6 && 'The pay range is so wide it reads as no range; keep the top under about 1.35x the bottom.',
    scores.outcomes <= 2 && "Doesn't say what success looks like in the first 30/60/90 days.",
    scores.ownership <= 2 && 'Responsibilities are vague: what will this person actually own, and who do they report to?',
    scores.company_context <= 2 && 'No company context (stage, customers, team size, funding). Good candidates screen you too.',
    buzz.length > 0 && `Clichés and gender-coded words that repel senior candidates: ${buzz.join(', ')}.`,
    scores.process <= 1 && 'No hiring process or timeline.',
    n < 60 && 'Too short to judge the role.',
    yearsAbsurd && 'Unrealistic years-of-experience requirement.',
  ].filter(Boolean);
  const { clarity, specificity } = postClaritySpecificity(scores);
  return {
    ...scores,
    firstImpression: issues.length > 3 ? "Generic post. I can't tell what I'd own or what it pays, so I'd skip it." : issues.length ? 'Decent, but a few gaps would make me hesitate to apply.' : "Clear, specific role with pay and outcomes. I'd apply.",
    clarity: Math.round(clarity), specificity: Math.round(specificity), payTransparency: hasPay,
    issues, rewriteHint: issues[0] ?? 'Add one concrete example of a problem they would solve in month one.',
  };
}

// ---- In-character candidates ----
export const CANDIDATE_INTERVIEW_MOVES = `WHAT MOVES YOUR INTEREST (0-10; react as a person, never announce a score):
- Up: questions about specific things you actually did, with follow-ups ("what exactly did you do", "what was the result"); the founder answering your questions about runway, pay, role and how decisions are made with real numbers; a clear process and respect for your time; a founder who admits what is hard.
- Down: yes/no and leading questions, brainteasers, clichés ("where do you see yourself"), dodged answers about runway or pay, overselling, interrupting, or any question about family, age, religion or other protected topics.`;

export const CANDIDATE_MAIL_MOVES = `WHAT MOVES YOUR WILLINGNESS TO ACCEPT (sentiment -1..1; react as a person):
- Up: a fast reply that answers the specific thing you asked; concrete terms (base, equity percent and what it is worth after dilution, vesting and cliff, start date, a decision deadline of several days); honesty about runway and risks; movement on the item you said mattered most (your stated main concern); a respectful tone.
- Down: no answer to your question; vague "competitive" or "we will figure out equity later"; an exploding deadline or pressure ("need an answer today"); a hard sell; guilt about the team; silence for days.`;

export function mailSentimentFallback(body, c) {
  const t = String(body ?? '').toLowerCase();
  let s = 0;
  if (/runway|revenue|customers|mrr|funded|raised/.test(t)) s += 0.04;
  if (/\d+(\.\d+)?\s?%/.test(t) && /equity|options|shares/.test(t)) s += 0.06;
  else if (/equity|options|vest/.test(t)) s += c?.persona?.concern === 'equity upside' ? 0.06 : 0.02;
  if (/vest|cliff/.test(t)) s += 0.02;
  if (/\$\s?[\d,]+|\d+k\b/.test(t) && /(base|salary|rate)/.test(t)) s += 0.03;
  if (/(increase|raise|bump|improve).*(offer|salary|base|rate)|(offer|salary|base|rate).*(increase|raise|bump)/.test(t)) s += 0.08;
  const concern = String(c?.persona?.concern ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  if (concern.some((w) => t.includes(w))) s += 0.04;
  if (/(take your time|by (monday|tuesday|wednesday|thursday|friday|next week)|\d+ days)/.test(t)) s += 0.02;
  if (/asap|deadline|exploding|today only|need an answer/.test(t)) s -= 0.08;
  if (/competitive/.test(t) && !/\d/.test(t)) s -= 0.02;
  if (t.length < 40) s -= 0.03;
  return Math.round(clamp(s, -0.3, 0.3) * 100) / 100;
}
