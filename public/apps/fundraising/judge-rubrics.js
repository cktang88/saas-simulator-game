// Researched, observable criteria for the investor-side LLM judges (docs/research/judging/investors-people-ops.md).
// Pure: no DOM. The LLM scores each criterion 1-5 against the anchors; the GAME applies the fixed weights.
import { rubricText, weighted } from '../../core/rubric.js';
import { rubricSchema } from '../../core/rubric-fields.js';
import { clamp } from '../../core/util.js';

// ---- 1. Cold email / warm-intro blurb (investor_outreach_judge) -----------------------------------------
const OUT_COMMON = [
  { key: 'hook', label: 'Traction or proof in the first two lines', weight: 3, anchors: { 1: 'opens with greeting, flattery, backstory or "passionate about"; no number in the first two lines', 3: 'a number or customer appears but below the opening, or is vague ("growing fast", "strong traction")', 5: 'line one says what it does for whom plus one hard metric (MRR, MoM growth, paying customers, a named logo) that matches the real metrics' } },
  { key: 'ask', label: 'One small, specific ask with round context', weight: 2, anchors: { 1: 'no ask, or "pick your brain", "explore synergies", several asks', 3: 'asks for a call but gives no round size, instrument or timing', 5: 'one concrete low-effort ask (20-minute call, or intro to a named person) plus round size, instrument and timing' } },
  { key: 'credibility', label: 'Claims are checkable and consistent with the real metrics', weight: 2, anchors: { 1: 'hype adjectives ("revolutionary", "world-class"), or a claim that contradicts the real metrics', 3: 'mostly factual but some unverifiable claims or a missing why-me', 5: 'every claim is checkable, matches the real metrics, and one line says why this founder' } },
  { key: 'concision', label: 'Skimmable length', weight: 1.5, anchors: { 1: 'over 200 words, wall of text, or attachments instead of words', 3: '120-200 words', 5: 'under 120 words (a forwardable blurb: 2-4 sentences), one paragraph break at most' } },
];
export const OUTREACH_COLD = [
  OUT_COMMON[0],
  { key: 'fit', label: 'Specific to this investor (thesis, portfolio, stage, check size)', weight: 2, anchors: { 1: 'could be sent to any investor unchanged', 3: 'names the firm or their sector in one generic line', 5: 'ties to a specific portfolio company, post or stated thesis, and stage and check size match' } },
  ...OUT_COMMON.slice(1),
];
export const OUTREACH_WARM = [
  OUT_COMMON[0],
  { key: 'forwardable', label: 'Blurb stands alone and makes the introducer look good', weight: 2, anchors: { 1: 'needs the thread above it, is long, or asks the introducer to explain the company', 3: 'readable alone but the introducer would need to edit it', 5: '2-4 sentences, third person, says why this investor specifically, can be pasted into an intro with no edits' } },
  ...OUT_COMMON.slice(1),
];
export const outreachCriteria = (warm) => (warm ? OUTREACH_WARM : OUTREACH_COLD);
export const outreachSchema = (warm) => rubricSchema(outreachCriteria(warm), {
  issues: { type: 'array', items: { type: 'string' } },
  reaction: { type: 'string', description: "One blunt sentence: the investor's gut reaction on reading it." },
});
export const outreachRubric = (warm) => rubricText(outreachCriteria(warm));
export const outreachQuality = (scores, warm) => weighted(scores, outreachCriteria(warm));

// ---- 2. Pitch meeting: in-character investor ("what moves you") + private notes judge --------------------
export const MEETING_CRITERIA = [
  { key: 'metrics_command', label: 'Command of the numbers', weight: 3, anchors: { 1: 'vague ("doing well"), or states numbers that contradict the real metrics', 3: 'gives MRR and growth when asked, misses churn, burn or payback', 5: 'volunteers accurate MRR, growth, churn, burn and payback, including the unflattering ones, with definitions' } },
  { key: 'candor', label: 'Owns weaknesses instead of defending', weight: 2.5, anchors: { 1: 'evades, spins, or contradicts a fact the investor already has', 3: 'admits a weakness only when pressed', 5: 'names the weakest part (churn, solo, a competitor) before asked and says what they are doing about it' } },
  { key: 'insight_moat', label: 'Earned insight, why now, defensibility', weight: 2.5, anchors: { 1: '"AI-powered X", no answer to why the platform or an incumbent will not do this', 3: 'a vertical workflow or some data, generic why now', 5: 'a non-obvious insight from the work, a specific shift in the last 18 months, and a compounding data, workflow or distribution advantage' } },
  { key: 'directness', label: 'Answers the question asked, first', weight: 1.5, anchors: { 1: 'pivots to the pitch or a different topic', 3: 'answers after a preamble', 5: 'first sentence answers, then one piece of evidence, under about 100 words' } },
  { key: 'ask_milestones', label: 'The ask: amount, terms, milestones to the next round', weight: 2, anchors: { 1: 'never states the round, or "whatever you want to put in"', 3: 'amount and instrument, no milestones', 5: "amount, instrument, runway and the milestones that reach the next round's bar in 18-24 months" } },
  { key: 'control', label: 'Runs the conversation (concise, asks back, agrees a next step)', weight: 1, anchors: { 1: 'rambles or monologues; ends with no next step', 3: 'adequate answers, passive close', 5: 'short answers, one good question back, ends with an explicit next step and what they will send' } },
];
export const MEETING_SCHEMA_R = rubricSchema(MEETING_CRITERIA, {
  strengths: { type: 'array', items: { type: 'string' } },
  concerns: { type: 'array', items: { type: 'string' } },
  summary: { type: 'string', description: 'Two-sentence internal note to your partners, quoting what the founder said.' },
});
export const meetingRubric = () => rubricText(MEETING_CRITERIA);
export const meetingPerformance = (scores) => weighted(scores, MEETING_CRITERIA);

/** In-character guidance for the live investor (no grader voice). */
export const INVESTOR_MOVES = `WHAT MOVES YOU (react like a person, never announce a score):
- You warm up when the founder answers the question you asked in the first sentence, quotes exact numbers (MRR, growth, churn, burn) that match what you already know, and names their own weakest spot before you find it.
- You cool down at vague answers ("doing great", "huge TAM"), numbers that do not match the metrics you have, buzzwords, an answer that dodges a hard question, or a pitch recited back at you.
- Probe a vague answer once with "what exactly" or "what number"; if the second answer is still vague, move on and write it down as a concern.
- You also want to hear the ask: amount, terms and the milestones it buys before the next round. If it never comes, ask for it.`;

// ---- 3. Monthly investor update (investor_update_review) -------------------------------------------------
// Keys candor/clarity/asks_specificity/accuracy are what ir.js and the Scorecard already read.
export const UPDATE_CRITERIA = [
  { key: 'candor', label: 'Lowlights told honestly and consistent with the real metrics', weight: 3, anchors: { 1: 'no lowlights while a metric is falling, or spin that hides it', 3: 'a lowlight is listed but has no cause or fix, or is softened', 5: 'each lowlight states the number, the cause and the fix; bad news is first-class, not buried' } },
  { key: 'accuracy', label: 'KPIs match the authoritative metrics', weight: 3, anchors: { 1: 'a headline KPI is off by more than 15% or is invented', 3: 'numbers are close but rounded favourably or undefined', 5: 'every KPI matches the systems of record and has a stable definition' } },
  { key: 'clarity', label: 'Skimmable: headline first, stable KPIs compared to last month', weight: 2, anchors: { 1: 'long narrative, no headline, KPIs missing or redefined', 3: 'sections exist but KPIs are not compared to the prior period', 5: 'a one-line TL;DR, the same 4-6 KPIs each month with month-over-month change, under about 400 words' } },
  { key: 'asks_specificity', label: 'Asks an investor can act on in two minutes', weight: 2, anchors: { 1: 'no asks, or "any intros appreciated"', 3: 'asks name a type of person or role but not who or why', 5: 'at most 3-4 asks, each naming a company or role, why it matters and what the investor would actually send' } },
  { key: 'progress', label: "Highlights tie to a metric and to last month's asks", weight: 1.5, anchors: { 1: 'activity ("had many meetings") with no outcome', 3: "wins stated with a number but not tied to the plan or last month's asks", 5: "each highlight carries a number and a comparison, and says what happened to last month's asks" } },
];
export const UPDATE_SCHEMA_R = rubricSchema(UPDATE_CRITERIA, {
  feedback: { type: 'string', description: 'What a stellar founder would have written differently, quoting the weakest line.' },
  asks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'type', 'specific'], properties: { text: { type: 'string' }, type: { type: 'string', enum: ['intro_investor', 'intro_customer', 'hire', 'advice', 'other'] }, specific: { type: 'boolean' } } } },
});
export const updateRubric = () => rubricText(UPDATE_CRITERIA);

// ---- 4. Board memo (board_memo_review) -------------------------------------------------------------------
export const BOARD_CRITERIA = [
  { key: 'plan_vs_actual', label: 'Actuals against plan with explained variances', weight: 3, anchors: { 1: 'no plan; metrics without comparison', 3: 'actual vs plan for headline metrics, variances not explained', 5: 'the same dashboard as last time, actual vs plan, every material variance explained with its cause' } },
  { key: 'decisions', label: 'The 1-3 decisions needed from the board', weight: 3, anchors: { 1: 'a status report with no decision or ask', 3: 'asks for "thoughts" on a topic', 5: 'one to three explicit decisions, each with options, a recommendation and the deadline' } },
  { key: 'risks_candor', label: 'Risks and bad news up front', weight: 2.5, anchors: { 1: 'no risks, or risks the board will learn elsewhere', 3: 'risks listed generically', 5: 'top risks with probability, impact and mitigation; the worst news is on page one' } },
  { key: 'cash_runway', label: 'Cash, burn and runway with scenarios', weight: 2, anchors: { 1: 'cash not mentioned', 3: 'cash and runway months given', 5: 'cash, burn, runway and what the base and downside cases do to the next-round timeline' } },
  { key: 'concision', label: 'Readable pre-read', weight: 1, anchors: { 1: 'over 6 pages of narrative, or slides with no text', 3: 'readable but repeats the monthly update', 5: 'a short memo (2-4 pages equivalent) the board can read in 15 minutes, sent 2-3 days ahead' } },
];
export const BOARD_SCHEMA_R = rubricSchema(BOARD_CRITERIA, {
  feedback: { type: 'string', description: 'What a stellar CEO memo would add, quoting the memo.' },
  questions: { type: 'array', items: { type: 'string' } },
});
export const boardRubric = () => rubricText(BOARD_CRITERIA);
export const boardQuality = (scores) => weighted(scores, BOARD_CRITERIA);

// ---- 5. Accelerator application (accelerator_application) -----------------------------------------------
// Output keeps score 1-10 versus the pool: score = 2 x weighted (3 = median applicant -> 6; 4.5 -> 9).
export const ACCEL_CRITERIA = [
  { key: 'plain_answer', label: 'Plain, direct answers (lead with the answer)', weight: 1.5, anchors: { 1: 'marketing language ("revolutionary platform"), answer buried', 3: 'clear but with filler and some jargon', 5: 'first sentence of each answer is the answer, in plain words a stranger repeats' } },
  { key: 'progress', label: 'Progress shown, not planned', weight: 3, anchors: { 1: 'plans and intentions only; no users, revenue or shipped product', 3: 'a shipped product and a few users or LOIs', 5: 'paying users or fast-growing usage with dates and numbers, matching the real metrics' } },
  { key: 'insight', label: 'Founders understand users and the problem', weight: 2.5, anchors: { 1: 'no evidence of talking to users; generic problem', 3: 'some user conversations, generic lessons', 5: 'specific things learned from named kinds of users that changed what was built' } },
  { key: 'velocity', label: 'Speed and technical ability', weight: 2, anchors: { 1: 'nothing built, or outsourced', 3: 'built an MVP in months', 5: 'ships weekly; concrete examples of things built in days and iterated' } },
  { key: 'ambition_team', label: 'Market ambition and the team (solo addressed head-on)', weight: 1.5, anchors: { 1: 'small niche with no path to a large outcome; team question ignored', 3: 'plausible large market, team described', 5: 'credible path to a very large company; says why this team; a solo founder explains the plan for the gap' } },
];
export const ACCEL_SCHEMA_R = rubricSchema(ACCEL_CRITERIA, {
  strengths: { type: 'array', items: { type: 'string' } },
  weaknesses: { type: 'array', items: { type: 'string' } },
  feedback: { type: 'string' },
});
export const accelRubric = () => rubricText(ACCEL_CRITERIA);
export const accelScore10 = (scores) => { const w = weighted(scores, ACCEL_CRITERIA); return w == null ? null : clamp(Math.round(w * 2 * 10) / 10, 1, 10); };

// ---- 6. SBIR/STTR Phase I proposal (sbir_review) ----------------------------------------------------------
export const SBIR_CRITERIA = [
  { key: 'technical_risk', label: 'Genuine R&D: a technical uncertainty not solvable by routine engineering', weight: 3, anchors: { 1: 'ordinary software build or integration; no unknown to resolve', 3: 'some technical uncertainty named but answerable with known methods', 5: 'a specific scientific or engineering unknown, stated as a hypothesis the Phase I work will test' } },
  { key: 'innovation', label: 'Innovation over the state of the art', weight: 2, anchors: { 1: 'same as existing products; no comparison', 3: 'a new combination of known parts, prior art named', 5: 'compared to named alternatives with a measurable advantage and a barrier to copying' } },
  { key: 'approach', label: 'Approach: aims, milestones and measurable go/no-go criteria', weight: 2.5, anchors: { 1: 'no work plan', 3: 'aims and a timeline but vague success measures', 5: 'specific aims, experiments or prototypes, quantitative success criteria that decide Phase II, risks and fallbacks' } },
  { key: 'team', label: 'Team and resources can do the work', weight: 1.5, anchors: { 1: 'no relevant expertise stated', 3: 'relevant experience, gaps unaddressed', 5: 'named expertise for each aim; collaborators or facilities where needed' } },
  { key: 'commercial', label: 'Commercial and societal impact path', weight: 2, anchors: { 1: '"huge market" with no customer', 3: 'a defined customer segment and market size', 5: 'customer discovery done, a path to Phase II/III funding, revenue model, who adopts it' } },
];
export const SBIR_SCHEMA_R = rubricSchema(SBIR_CRITERIA, {
  deep_tech: { type: 'boolean', description: 'true if this is genuine R&D (novel technology risk), false for an ordinary software product' },
  feedback: { type: 'string', description: 'What reviewers would write: strengths and weaknesses, quoting the proposal.' },
});
export const sbirRubric = () => rubricText(SBIR_CRITERIA);
export const sbirScore10 = (scores) => { const w = weighted(scores, SBIR_CRITERIA); return w == null ? null : clamp(Math.round(w * 2 * 10) / 10, 1, 10); };
