// Feature spec quality: instant genericity blocker (heuristics) + rubric grader (LLM panel with a
// deterministic fallback). Pure: no DOM, no state mutation. Usable from Node tests.
//
// Rubric and blocklist: docs/research/hr-legal-product.md §6 ("Feature spec quality rubric") and §3.3
// (one-page indie PRD). The game grades five dimensions 0–4 (total /20):
//   specificity (concrete behaviour + outcome metric), user clarity, testability (acceptance criteria),
//   scope realism (non-goals, v1-sized), evidence (observed pain, numbers, real interview insights).
// The pass bar (12/20, no core dimension below 2) mirrors the research verdict (≥10/14 specific,
// 6–9 revise, ≤5 generic) rescaled; it is a [design] choice, not a statistic.

import { words } from '../../core/util.js';
import { SPEC_RUBRIC } from './rubrics.js';

// Word budget for a one-page spec. Research §6 rule 7 blocks under ~40 words; ~100 is the [design] target.
export const SPEC_WORDS = { block: 40, min: 60, target: 100, max: 300 };
export const PASS_TOTAL = 12; // of 20 [design]
export const DIMS = [
  ['specificity', 'Specificity'],
  ['userClarity', 'User clarity'],
  ['testability', 'Testability'],
  ['scopeRealism', 'Scope realism'],
  ['evidence', 'Evidence'],
];

// Rubric rule 1 (always vague) vs. buzzwords that are fine only when the spec says what actually happens.
const HARD_BUZZ = [
  [/\bkiller\b/i, '"killer"'], [/game[- ]?chang/i, '"game-changing"'], [/revolution/i, '"revolutionary"'],
  [/best[- ]in[- ]class/i, '"best-in-class"'], [/world[- ]class/i, '"world-class"'], [/next[- ]gen/i, '"next-gen"'],
  [/\b10x\b/i, '"10x"'], [/\bviral\b/i, '"viral"'], [/\buber for\b/i, '"Uber for"'], [/cutting[- ]edge/i, '"cutting-edge"'],
  [/supercharg/i, '"supercharge"'], [/\bimprove (the )?(ux|ui|user experience|experience|usability)\b/i, '"improve UX"'],
  [/\bbetter (ux|ui|user experience)\b/i, '"better UX"'], [/\bmake (it|things) (better|easier|nicer)\b/i, '"make it better"'],
  [/\b(users?|customers?|people) (will )?(love|adore)\b/i, '"users will love it"'], [/\bwow\b/i, '"wow"'],
];
const SOFT_BUZZ = [
  [/\bai[- ]powered\b|\bpowered by ai\b|\bai[- ]driven\b/i, '"AI-powered"'], [/seamless/i, '"seamless"'], [/delightful/i, '"delightful"'],
  [/\bintuitive\b/i, '"intuitive"'], [/\bsmart\b/i, '"smart"'], [/\bpowerful\b/i, '"powerful"'], [/all[- ]in[- ]one/i, '"all-in-one"'],
  [/\brobust\b/i, '"robust"'], [/effortless/i, '"effortless"'], [/\bleverag/i, '"leverage"'], [/\bmagic(al)?\b/i, '"magic"'],
];
// A concrete capability has a verb a tester could watch happen.
export const ACTION = /\b(send|sends|sent|email|emails|text|texts|sms|generate|generates|export|exports|import|imports|sync|syncs|match|matches|attach|attaches|upload|uploads|schedule|schedules|notify|notifies|remind|reminds|flag|flags|detect|detects|extract|extracts|categori[sz]e|categori[sz]es|classif(y|ies)|summari[sz]e|summari[sz]es|draft|drafts|create|creates|show|shows|display|displays|list|lists|filter|filters|calculate|calculates|reconcile|reconciles|book|books|invite|invites|assign|assigns|approve|approves|connect|connects|pull|pulls|post|posts|alert|alerts|scan|scans|transcribe|transcribes|translate|translates|route|routes|tag|tags|group|groups|compare|compares|highlight|highlights|block|blocks|retry|retries|merge|merges|track|tracks|log|logs|copy|copies|archive|archives|download|downloads|fill|fills|prefill|prefills|pre-fill|pre-fills|autofill|search|searches|sort|sorts|rank|ranks|predict|predicts|reply|replies|forward|forwards|charge|charges|refund|refunds|invoice|invoices|pdf|csv|link|links|webhook|webhooks|digest|report|reports|preview|previews|undo|lock|locks)\b/i;
// Rubric rule 2: engagement metrics with no causal link to value.
const VANITY = /(session (length|time|duration)|time (in|spent in|spent on|on) (the )?(app|site|product)|time on site|page ?views|\bengagement\b|\bdau\b|\bmau\b|daily active|monthly active|weekly active|\bwau\b|active users|\bclicks?\b|\blikes\b|\bdownloads\b|users? love|\bstickiness\b|\bopens\b)/i;
const VALUE = /(retention|retain|churn|revenue|\bpaid\b|paying|conversion|convert|activation|activate|upgrade|renew|\bmrr\b|\barr\b|trial|hours? saved|time saved|minutes saved|\bsaves?\b|\bclose[sd]?\b|errors?|refunds?|tickets?|matched|completed|sent|resolved|on[- ]time|late|missed|cost)/i;
const WINDOW = /(within|after|in (the first )?\d+|per (day|week|month|quarter)|\d+\s*(days?|weeks?|months?|quarters?)|by (the )?(end|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4])|\bq[1-4]\b|weekly|monthly|daily|30-day|60-day|90-day)/i;
const GENERIC_USER = new Set(['users', 'user', 'customers', 'customer', 'everyone', 'people', 'person', 'businesses', 'business', 'companies', 'company', 'anyone', 'teams', 'team', 'clients', 'client', 'smbs', 'smb', 'consumers', 'consumer', 'our', 'all', 'the', 'and', 'any', 'who', 'that', 'with', 'for', 'their', 'them', 'they', 'most', 'many', 'some', 'small', 'large', 'big', 'good', 'new', 'existing', 'potential', 'target', 'general', 'various', 'members', 'folks', 'individuals', 'organizations', 'orgs', 'enterprises']);
const SOLUTION_AS_PROBLEM = [
  /^\s*(our |the )?(users?|customers?|they|we|people|clients?)\s+(need|needs|want|wants|would like)\s+(a|an|the|to have|better|more)\b/i,
  /^\s*(add|build|create|implement|make|ship|develop|we need|we should|let'?s)\b/i,
  /^\s*(there is|there's|there are) no\b/i,
  /^\s*(lack of|missing|no)\s+(a\s+)?(dashboard|feature|integration|app|tool|button|page|report|ai)\b/i,
  /\bneeds? (a|an) (dashboard|app|feature|tool|integration|button|page|ai)\b/i,
  /\b(lack|lacks|lacking)\b[^.]{0,40}\b(tool|app|way|feature|solution|software|dashboard|integration|system|platform)\b/i,
  /^\s*without (a|an) /i,
  /\bno way to\b/i,
  /\b(doesn'?t|don'?t) have (a|an) (tool|app|feature|way|dashboard)\b/i,
  /\b(it )?would be (great|nice|helpful) (if|to)\b/i,
];
const TRIGGER = /(when|whenever|every|each|after|before|during|while|at (the )?(end|start|close)|month[- ]end|year[- ]end|weekly|daily|monthly|quarterly|last (time|week|month|year)|per (week|month|day)|once|each time|on (monday|friday|the \d))/i;
const PAIN = /(\d+\s*(h|hrs?|hours?|mins?|minutes?|days?|weeks?|times?|x|%)\b|\$\s?\d|\d+\s?\$|\blost\b|\bmiss(es|ed)?\b|\blate\b|\berrors?\b|\bfines?\b|penalt|churn|refund|angry|complain|overtime|weekend|evenings?)/i;
const WORKAROUND = /(currently|today|right now|instead|workaround|spreadsheet|excel|google sheets|sheet|manually|by hand|copy|paste|whatsapp|slack|notion|zapier|they use|uses|using|screenshot|email|phone|paper|post-it|calendar|a vendor|an agency|hire|pay (a|an|someone))/i;
const TESTABLE = /(\bnever\b|\bsees?\b|\breceives?\b|\bgets?\b|\bflagged\b|\bgiven\b|\bwhen\b|\bthen\b|\bshould\b|\bmust\b|\bwithin\b|\bshows?\b|\bsends?\b|\breturns?\b|\bdisplays?\b|\bis (created|sent|shown|saved|attached|blocked|listed|marked|emailed|exported)\b|\bfails?\b|\berror\b|\bcan\b|\bcannot\b|≤|≥|<=|>=|\d)/i;
const EDGE = /(\berror\b|\bfails?\b|\bfailure\b|\binvalid\b|\bexpired?\b|\bempty\b|\bmissing\b|\bno match|\bunmatched\b|\btimeout\b|\bduplicate\b|\bdeclin|\bif (the|a|no|there)\b|\bnot\b|\bwithout\b|\bretry\b|\brevoked\b|\bdisconnect)/i;
const GWT = /\bgiven\b[\s\S]*\bwhen\b[\s\S]*\bthen\b/i;
const NUM = /\d/;

export const acceptanceList = (f) => (Array.isArray(f.acceptance) ? f.acceptance : String(f.acceptance ?? '').split('\n')).map((x) => String(x).trim()).filter(Boolean);

// The full one-page spec as text (stored in feature.spec, sent to graders and coding agents).
export function composeSpec(f) {
  const ac = acceptanceList(f);
  return [
    `TITLE: ${f.title ?? ''}`,
    `TARGET USER: ${f.user ?? ''}`,
    `PROBLEM: ${f.problem ?? ''}`,
    `PROPOSED SOLUTION: ${f.solution ?? ''}`,
    `ACCEPTANCE CRITERIA:\n${ac.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
    `SUCCESS METRIC: ${f.metric ?? ''}${f.baseline ? ` (baseline: ${f.baseline})` : ''}`,
    f.nonGoals ? `NOT IN V1: ${f.nonGoals}` : '',
    f.ai?.enabled ? `RUNTIME AI: ${f.ai.level} usage` : '',
  ].filter(Boolean).join('\n');
}

export function specWordCount(f) {
  return words([f.title, f.user, f.problem, f.solution, acceptanceList(f).join(' '), f.metric, f.baseline, f.nonGoals].filter(Boolean).join(' '));
}

// Hash of everything a grade depends on, so edits invalidate an old grade.
export function specKey(f) {
  return JSON.stringify([f.title, f.user, f.problem, f.solution, acceptanceList(f), f.metric, f.baseline, f.nonGoals, f.ai?.enabled ? f.ai.level : null, (f.evidence ?? []).slice().sort()]);
}

const ROLE = /\b(owner|owners|founder|founders|manager|managers|bookkeeper|bookkeepers|accountant|accountants|dentist|dentists|doctor|nurse|clinic|agency|agencies|freelancer|freelancers|consultant|consultants|developer|developers|engineer|engineers|designer|designers|marketer|marketers|recruiter|recruiters|teacher|teachers|lawyer|lawyers|paralegal|realtor|realtors|agent|agents|coach|coaches|therapist|therapists|parent|parents|student|students|admin|admins|lead|leads|director|directors|vp|head|cfo|ceo|cto|coo|controller|operator|operators|planner|planners|dispatcher|dispatchers|technician|technicians|contractor|contractors|plumber|plumbers|electrician|electricians|landlord|landlords|tutor|tutors|trainer|trainers|chef|chefs|editor|editors|writer|writers|creator|creators|seller|sellers|merchant|merchants|buyer|buyers|analyst|analysts|rep|reps|specialist|specialists|assistant|assistants|practice|practices|studio|studios|shop|shops|store|stores|restaurant|restaurants|salon|salons|gym|gyms)\b/i;
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'it', 'its', 'their', 'them', 'they', 'with', 'into', 'from', 'that', 'this', 'each', 'every', 'when', 'then', 'app', 'user', 'users']);
// (a) a capability = an action verb applied to an object noun that also appears in the problem.
export function verbObjectHits(solution, problem) {
  const pt = new Set(String(problem).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.replace(/s$/, '')));
  const toks = String(solution).toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
  let hits = 0;
  for (let i = 0; i < toks.length; i++) {
    if (!ACTION.test(toks[i])) continue;
    const window = toks.slice(i + 1, i + 6).filter((w) => !STOP.has(w));
    if (window.some((w) => pt.has(w.replace(/s$/, '')))) hits++;
  }
  return hits;
}
export function isStuffed(solution) {
  const distinct = new Set((String(solution).match(new RegExp(ACTION.source, 'gi')) ?? []).map((x) => x.toLowerCase()));
  return distinct.size > 6 && words(solution) <= 30;
}
// (e) >3× on a revenue metric within ≤30 days is implausible.
export function metricImplausible(metric, baseline) {
  const t = `${metric} ${baseline}`;
  if (!/(mrr|arr|revenue|\$|sales|paying)/i.test(t)) return false;
  const nums = (t.match(/\$?\s?(\d+(?:[.,]\d+)?)\s*(k|m)?/gi) ?? []).map((x) => { const m = x.replace(/[$\s,]/g, '').match(/([\d.]+)(k|m)?/i); return m ? +m[1] * (m[2]?.toLowerCase() === 'k' ? 1e3 : m[2]?.toLowerCase() === 'm' ? 1e6 : 1) : NaN; }).filter((n) => Number.isFinite(n));
  const days = +(t.match(/(\d+)\s*days?/i)?.[1] ?? (/\bweek/i.test(t) ? 7 : /\bmonth/i.test(t) ? 30 : 999));
  if (nums.length < 2 || days > 30) return false;
  const lo = Math.min(...nums.filter((n) => n !== days)), hi = Math.max(...nums);
  return lo === 0 ? hi >= 1000 : hi / lo > 3;
}
// (f) metrics counting the feature's own actions without a customer outcome.
export function isOutputMetric(metric) {
  return /\b(sent|send|used|uses|clicks?|clicked|opened|views?|generated|created|requests?|messages?|emails?)\b/i.test(metric) && !VALUE.test(metric.replace(/\b(sent|requests?)\b/gi, ''));
}
const HEAVY = new Set(['SSO', 'offline', 'mobile app', 'multi-tenant', 'compliance', 'regulated']);

const userTokens = (u) => String(u ?? '').toLowerCase().split(/[^a-z0-9$–-]+/).filter((w) => w.length > 2 && !GENERIC_USER.has(w));

// Instant blocker. Returns { blockers: [{rule, msg}], warnings: [{rule, msg}], words }.
export function lintSpec(f, { realInterviews = null } = {}) {
  const blockers = [], warnings = [];
  const B = (rule, msg) => blockers.push({ rule, msg });
  const W = (rule, msg) => warnings.push({ rule, msg });
  const title = String(f.title ?? ''), user = String(f.user ?? ''), problem = String(f.problem ?? ''), solution = String(f.solution ?? '');
  const metric = String(f.metric ?? ''), baseline = String(f.baseline ?? '');
  const ac = acceptanceList(f);
  const all = [title, user, problem, solution, ac.join(' '), metric, baseline, f.nonGoals ?? ''].join(' ');
  const n = specWordCount(f);

  for (const [re, label] of HARD_BUZZ) if (re.test(all)) B('buzzword', `${label} is a vague claim, not behaviour. Say what the user does and what the product does in response.`);
  const soft = SOFT_BUZZ.filter(([re]) => re.test(all)).map(([, l]) => l);
  const solActions = (solution.match(new RegExp(ACTION.source, 'gi')) ?? []).length;
  if (!solution.trim() || words(solution) < 8) B('solution', 'Proposed solution is missing or too short: describe the concrete capability (what triggers it, what the product does, what the user sees).');
  else if (!solActions) B('solution', `No concrete action in the solution${soft.length ? ` (${soft.join(', ')} alone isn't a capability)` : ''}: which verb would a tester watch happen (sends, matches, exports, flags…)?`);
  else if (soft.length) W('buzzword', `${soft.join(', ')}: fine only if the spec says exactly what happens. Cut the adjective.`);

  const ut = userTokens(user);
  if (ut.length < 2) B('user', `Target user is ${user.trim() ? `generic ("${user.trim().slice(0, 40)}")` : 'missing'}: name a role, size and context (e.g. "solo bookkeeper with 10–30 clients in QuickBooks").`);

  // P4: claimed interview counts must be backed by logged real interviews.
  if (realInterviews != null) {
    const claims = [...problem.matchAll(/\b(\d+)\s*(?:of|out of|\/)\s*(\d+)\b[^.]*?(interview|talked|spoke|asked|survey|call)/gi)].map((m) => +m[2]);
    const claimed = Math.max(0, ...claims);
    if (claimed > realInterviews) B('evidence-claim', `Claims ${claimed} interviews; you have logged ${realInterviews} real interview(s). Cite only what you actually logged.`);
  }
  if (!problem.trim() || words(problem) < 8) B('problem', 'Problem is missing or too short: who hits it, when, how painful, and what they do today.');
  else {
    if (SOLUTION_AS_PROBLEM.some((re) => re.test(problem))) B('problem-as-solution', 'Problem is phrased as a solution ("users need a dashboard"). Describe the observable pain instead.');
    if (!TRIGGER.test(problem) && !NUM.test(problem)) B('trigger', 'Problem has no concrete trigger or frequency: when does it happen (e.g. "at month-end close", "every Monday")?');
    if (!PAIN.test(problem)) W('pain', 'How painful is it? Add time, money, errors or frequency (e.g. "2–3 h per month").');
    if (!WORKAROUND.test(problem)) W('workaround', 'What do they do today instead (the current workaround)?');
  }

  if (!ac.length) B('acceptance', 'No acceptance criteria. Add testable Given/When/Then statements, including a failure case.');
  else if (!ac.some((a) => TESTABLE.test(a))) B('acceptance', 'Acceptance criteria are not verifiable ("works well"). Write Given/When/Then or "must/should" statements a tester could check.');
  else {
    if (ac.length < 2) W('acceptance', 'Only one acceptance criterion: cover the happy path and at least one edge or failure case.');
    else if (!ac.some((a) => EDGE.test(a))) W('edge', 'No edge or failure case in the acceptance criteria (expired auth, empty data, no match…).');
  }

  if (!metric.trim()) B('metric', 'No success metric. Pick an outcome tied to customer value, with baseline, target and time window.');
  else {
    if (VANITY.test(metric) && !VALUE.test(metric)) B('vanity', 'Vanity/engagement metric (session length, time in app, page views, DAU…) with no link to value. Longer sessions can mean users are stuck; measure the outcome instead.');
    const hasBaseline = NUM.test(baseline) || /(from|currently|today|baseline|now)\b[^.]*\d/i.test(metric) || /\d[^.]*(→|->)\s*\d/.test(metric);
    if (!hasBaseline) B('baseline', `${/%/.test(metric) ? 'A % target' : 'The metric'} has no baseline. Where is it today (even "0%" or "unknown, measure for 2 weeks first: 0 of 12 accounts")?`);
    if (/\d/.test(metric) && !WINDOW.test(metric + ' ' + baseline)) B('window', 'The metric target has no time window (e.g. "within 30 days of enabling").');
    if (!/\d/.test(metric)) W('target', 'The metric has no numeric target.');
  }

  const heavy = complexityTags(f).filter((t) => HEAVY.has(t.tag));
  if (heavy.length >= 3 || complexityTags(f).reduce((a, t) => a + t.hours, 0) > 120) B('scope', `v1 too big (${complexityTags(f).map((t) => t.tag).join(', ')}). Ship the smallest slice that tests the outcome; move the rest to non-goals.`);
  if (metricImplausible(metric, baseline)) W('plausibility', 'The target is implausible for the window (more than 3× on a revenue metric within 30 days). Pick a target you could actually hit.');
  if (isOutputMetric(metric)) W('output-metric', 'This metric counts the feature\'s own output (sent, used, clicked). Tie it to a customer outcome (time saved, matched before close, retained).');
  if (!NUM.test(all)) B('numbers', 'No numbers anywhere: real specs have sizes, frequencies, amounts or targets.');
  if (n < SPEC_WORDS.block) B('length', `Only ${n} words. A useful one-page spec is ~${SPEC_WORDS.target} words.`);
  else if (n < SPEC_WORDS.min) W('length', `${n} words: aim for ~${SPEC_WORDS.target}.`);
  if (n > SPEC_WORDS.max) B('length', `${n} words: over ${SPEC_WORDS.max}. Cut to one page; a coding agent and a reader both need it tight.`);
  if (!String(f.nonGoals ?? '').trim()) W('scope', 'No non-goals: what is explicitly NOT in v1?');
  if (!title.trim()) B('title', 'Give it a title that names the capability.');
  if (/\b(lorem|ipsum|consectetur|adipiscing|asdf|qwerty|tbd|todo|xxx+)\b/i.test(all)) B('placeholder', 'Placeholder text (lorem ipsum, TBD). Write the real spec.');
  if (all.trim() && !/\b(the|and|for|with|when|to|of)\b/i.test(all)) W('language', 'Specs are graded in English.');

  return { blockers: dedupe(blockers), warnings: dedupe(warnings), words: n };
}
const dedupe = (arr) => arr.filter((x, i) => arr.findIndex((y) => y.rule === x.rule && y.msg === x.msg) === i);

// ---- Grader ----

export const GRADE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['specificity', 'userClarity', 'testability', 'scopeRealism', 'evidence', 'blockingIssues', 'rewriteHint', 'agentHours', 'thinWrapper'],
  properties: {
    specificity: { type: 'number', description: '0-4: concrete solution behaviour and an outcome metric with baseline+target+window tied to customer value' },
    userClarity: { type: 'number', description: '0-4: named role, size and context' },
    testability: { type: 'number', description: '0-4: Given/When/Then acceptance criteria incl. failure cases' },
    scopeRealism: { type: 'number', description: '0-4: v1-sized, explicit non-goals, cost/risk awareness' },
    evidence: { type: 'number', description: '0-4: observed pain with numbers and REAL interview evidence; synthetic/AI-persona insights count 0' },
    blockingIssues: { type: 'array', items: { type: 'string' }, description: 'dimension: "quote" -> what a stellar spec would say, for each dimension scored below 3' },
    rewriteHint: { type: 'string', description: 'One sentence: the direction of the rewrite, not the rewrite itself' },
    agentHours: { type: 'number', description: 'Focused hours for one experienced developer using 2026 AI coding agents (Claude Code/Cursor) on a young codebase, incl. review and tests' },
    thinWrapper: { type: 'boolean', description: 'true if the feature is mostly a prompt over a general LLM that a model vendor could ship for free' },
  },
};

export const GRADER_SYSTEM = `You grade SaaS feature specs written by a solo founder in 2026, like a demanding product lead. Score each dimension 0-4.
Rules: buzzwords without concrete behaviour score 0-1 on specificity. Vanity metrics (session length, time in app, page views, "engagement") score at most 1 on specificity unless the spec explains why they drive revenue or retention. A % target without baseline scores at most 1. A problem phrased as a solution scores 0 on evidence. Insights marked SYNTHETIC come from AI-persona rehearsal interviews and count as ZERO evidence; only REAL interview insights, customer data or quotes count. Apply the swap test: if a competitor's name could be swapped in and the spec reads the same, it is generic. Lists of verbs without objects score 0 on specificity. Claims of interview counts that are not backed by linked REAL insights score 0 on evidence. A v1 with SSO, mobile and compliance together scores at most 1 on scope. A metric counting the feature's own output (messages sent, clicks) is not an outcome. Never write the spec for them: rewriteHint is one sentence of direction.\n${SPEC_RUBRIC}\nFor every dimension you score below 3, add one entry to blockingIssues of the form: dimension: "exact quote from the spec" (or "missing: <element>") -> what a stellar spec would say there. Length, confident tone and buzzwords never raise a score; only observable content does.`;

export function gradePrompt(f, { insights = [], company = {} } = {}) {
  const ev = insights.length ? insights.map((i) => `- [${i.real ? 'REAL' : 'SYNTHETIC'}] (${i.theme}) ${String(i.text).slice(0, 200)}`).join('\n') : '(none linked)';
  return `Company: ${company.name ?? ''}, ${company.oneLiner ?? ''}. ICP: ${String(company.icp ?? '').slice(0, 300)}\n\n=== SPEC ===\n${composeSpec(f)}\n=== LINKED RESEARCH INSIGHTS ===\n${ev}`;
}

// Deterministic fallback grader (same shape as GRADE_SCHEMA).
export function heuristicGrade(f, { insights = [], realInterviews = null } = {}) {
  const lint = lintSpec(f, { realInterviews });
  const ac = acceptanceList(f);
  const solution = String(f.solution ?? ''), problem = String(f.problem ?? ''), metric = String(f.metric ?? '');
  const has = (rule) => lint.blockers.some((b) => b.rule === rule);
  const warn = (rule) => lint.warnings.some((b) => b.rule === rule);
  const cap = (v) => Math.max(0, Math.min(4, Math.round(v)));

  // Specificity: verb+object capabilities grounded in the problem, plus an outcome metric.
  const vo = verbObjectHits(solution, problem);
  let specificity = (vo >= 2 ? 2 : vo >= 1 ? 1.5 : 0) + (metric && !has('vanity') && !has('baseline') && !has('window') ? 2 : metric ? 0.5 : 0);
  if (has('buzzword')) specificity -= 2;
  if (warn('buzzword')) specificity -= 0.5;
  if (isStuffed(solution)) specificity = Math.min(specificity, 1);
  if (warn('plausibility')) specificity = Math.min(specificity, 1);
  if (warn('output-metric')) specificity = Math.min(specificity, 1);
  if (VANITY.test(metric)) specificity = Math.min(specificity, 1); // vanity metric even with a value word tacked on
  const softInSolution = SOFT_BUZZ.filter(([re]) => re.test(solution)).length;
  if (softInSolution >= 2 && vo < 2) specificity = Math.min(specificity, 1);

  // User clarity needs a role noun or a size number, not just non-generic words.
  const ut = userTokens(f.user);
  const roleOrSize = ROLE.test(f.user ?? '') || /\d/.test(f.user ?? '');
  const userClarity = !roleOrSize ? Math.min(1, ut.length >= 2 ? 1 : 0) : ut.length >= 4 ? 3 + (NUM.test(f.user) ? 1 : 0) : ut.length >= 2 ? 2 + (NUM.test(f.user) ? 1 : 0) : 1;

  // Testability: well-formed criteria (trigger + observable + number), capped; short criteria cost a point.
  const wellFormed = ac.filter((a) => words(a) >= 8 && TESTABLE.test(a) && /\d|\b(error|fails?|expired|empty|no match|unmatched|not|never|invalid|flagged)\b/i.test(a)).length;
  let testability = Math.min(3, wellFormed) + (ac.some((a) => EDGE.test(a)) && (ac.some((a) => GWT.test(a)) || wellFormed >= 2) ? 1 : 0);
  if (ac.some((a) => words(a) < 8)) testability -= 1;

  const effort = heuristicAgentHours(f);
  let scopeRealism = (String(f.nonGoals ?? '').trim() ? 2 : 0) + (effort <= 40 ? 2 : effort <= 90 ? 1 : 0) - (lint.words > SPEC_WORDS.max ? 1 : 0);
  if (has('scope')) scopeRealism = Math.min(scopeRealism, 1);

  // Evidence: only LINKED REAL insights count (text claims score 0). Self-reported logs count half.
  const realWeight = insights.filter((i) => i.real).reduce((a, i) => a + (i.verified ? 1 : 0.5), 0);
  const evidence = has('problem-as-solution') || has('evidence-claim') ? 0 : Math.min(4, 2 * realWeight);

  const scores = { specificity: cap(specificity), userClarity: cap(userClarity), testability: cap(testability), scopeRealism: cap(scopeRealism), evidence: cap(evidence) };
  const issues = [...lint.blockers.map((b) => b.msg), ...lint.warnings.filter((w) => ['pain', 'workaround', 'edge', 'scope', 'plausibility', 'output-metric'].includes(w.rule)).map((w) => w.msg)].slice(0, 5);
  if (!roleOrSize) issues.push('Target user has no role or size ("forward-thinking professionals" could be anyone).');
  if (isStuffed(solution)) issues.push('The solution is a list of verbs, not one capability.');
  return { ...scores, blockingIssues: issues.slice(0, 6), rewriteHint: rewriteHint(scores, insights), agentHours: effort, thinWrapper: isThinWrapper(f) };
}

function rewriteHint(scores, insights) {
  const worst = DIMS.map(([k]) => k).sort((a, b) => scores[a] - scores[b])[0];
  return {
    specificity: 'Replace adjectives with the exact behaviour (trigger → what the product does → what the user sees) and tie the metric to a customer outcome with baseline, target and window.',
    userClarity: 'Narrow the user to one role in one context with a size (team size, client count, volume) so a stranger could recruit them.',
    testability: 'Rewrite acceptance criteria as Given/When/Then statements and add the failure case (expired auth, no match, empty data).',
    scopeRealism: 'Cut v1 to the smallest slice that tests the outcome and list what is explicitly not included.',
    evidence: insights.some((i) => i.real) ? 'Quote the strongest real interview evidence in the problem statement (how many people, how often, what it costs them).' : 'Back the problem with evidence: talk to real customers about the last time it happened and cite how many had it and what it cost.',
  }[worst];
}

// Thin-wrapper test (research §3.5): AI feature whose moat is only a prompt.
export function isThinWrapper(f) {
  if (!f.ai?.enabled) return false;
  const t = composeSpec(f).toLowerCase();
  return !/(integrat|sync|import|quickbooks|xero|shopify|stripe|salesforce|hubspot|gmail|outlook|slack|api|webhook|your data|history|workflow|approval|team|permission|audit|calendar|database|records|bank|crm|erp|ehr|connect)/.test(t);
}

// ---- Effort heuristic (agent-assisted hours, young codebase) ----
// Base + per acceptance criterion, plus complexity keywords. [A] calibrated to research §3.2:
// a narrow B2B workflow MVP (≈4–8 such features) takes a solo founder with agents 2–6 weeks.
const COMPLEXITY = [
  [/payment|billing|checkout|subscription|invoice|stripe|refund/i, 12, 'payments'],
  [/\bsso\b|saml|okta|scim|single sign/i, 40, 'SSO'],
  [/\bauth\b|login|sign[- ]?in|oauth|authori[sz]|permission|\broles?\b|rbac/i, 6, 'auth'],
  [/integrat|quickbooks|xero|shopify|salesforce|hubspot|gmail|outlook|google (calendar|sheets|drive)|\bapi\b|webhook|\bsync|connect\w*[^.]{0,40}\b(ledger|accounting|crm|calendar|inbox|bank|store|erp|ehr)|nightly|\bimport/i, 8, 'integration'],
  [/offline/i, 40, 'offline'],
  [/multi[- ]?tenant|workspaces|organi[sz]ations? (and|with) (roles|teams)/i, 40, 'multi-tenant'],
  [/real[- ]?time|live (updates?|collab)|websocket|collaborat/i, 10, 'real-time'],
  [/\b(ios|iphone|android|mobile app|native app)\b/i, 60, 'mobile app'],
  [/\bai\b|llm|gpt|claude|summari[sz]|classif|extract|transcri|\bocr\b/i, 5, 'AI'],
  [/\bcsv\b|\bexport|\bpdf\b/i, 3, 'import/export'],
  [/\bsms\b|text message|notification|\bemails?\b|remind/i, 3, 'notifications'],
  [/hipaa|soc ?2|pci|gdpr|phi\b|audit log|encrypt|compliance/i, 80, 'compliance'],
  [/migrat|legacy|backfill/i, 8, 'migration'],
];
// Effort is about what gets BUILT: title, solution and acceptance criteria (never the non-goals).
const buildText = (f) => [f.title, f.solution, acceptanceList(f).join(' ')].filter(Boolean).join(' ');
export function complexityTags(f) {
  const t = buildText(f);
  const tags = COMPLEXITY.filter(([re]) => re.test(t)).map(([, h, tag]) => ({ tag, hours: h }));
  if (/\b(ios|iphone)\b/i.test(t) && /\bandroid\b/i.test(t)) tags.push({ tag: 'second platform', hours: 40 });
  if (/hipaa|phi\b|pci|fedramp|finra/i.test(t)) tags.push({ tag: 'regulated', hours: 0 });
  return tags;
}
export function heuristicAgentHours(f) {
  const ac = acceptanceList(f).length;
  const base = 4 + 2.5 * Math.max(1, ac);
  const tags = complexityTags(f);
  const extra = tags.reduce((a, c) => a + c.hours, 0);
  const floor = tags.some((t) => t.tag === 'regulated') ? 120 : 0; // research §3.2: regulated work takes months
  return Math.round(Math.min(400, Math.max(floor, base + extra)));
}

// Combine panel results (averages) with the instant lint. Lint blockers always fail.
export function combineGrades(results, lint) {
  const avg = (k) => {
    const v = results.map((r) => r[k]).filter((x) => typeof x === 'number' && Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const scores = Object.fromEntries(DIMS.map(([k]) => [k, Math.round(Math.max(0, Math.min(4, avg(k))) * 10) / 10]));
  const total = Math.round(DIMS.reduce((a, [k]) => a + scores[k], 0) * 10) / 10;
  const core = ['specificity', 'userClarity', 'testability'].every((k) => scores[k] >= 2);
  const pass = !lint.blockers.length && total >= PASS_TOTAL && core;
  const verdict = pass ? 'specific' : total >= 8 && !lint.blockers.length ? 'revise' : 'generic';
  const issues = [...new Set([...lint.blockers.map((b) => b.msg), ...results.flatMap((r) => r.blockingIssues ?? [])])].slice(0, 6);
  const hints = results.map((r) => r.rewriteHint).filter(Boolean);
  const agentHours = Math.max(2, Math.round(avg('agentHours') || 0));
  return { scores, total, pass, verdict, issues, rewriteHint: hints[0] ?? '', hints, agentHours, thinWrapper: results.filter((r) => r.thinWrapper).length * 2 >= results.length && results.length > 0 };
}
