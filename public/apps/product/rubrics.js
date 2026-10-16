// Rubrics for the product and customer-research judges. Pure: no DOM, no state.
// Research and sources: docs/research/judging/product-support.md. Pattern: the LLM scores observable criteria
// against anchors and quotes evidence; the GAME turns the scores into outcomes with fixed weights.
//
//   feature_spec_grade   SPEC_CRITERIA   (0-4 per dimension, existing DIMS keys; anchors at 0 / 2 / 4)
//   feature_market_value VALUE_CRITERIA  (1-5)
//   interview_grade      INTERVIEW_CRITERIA (1-5, mapped to the 0-100 Mom Test score)
//   interview_notes      NOTES_CRITERIA  (1-5, mapped to the 0-100 note quality)
//   interview_chat       INTERVIEWEE_RULES (role-play instructions; the persona is not a grader)

import { rubricText } from '../../core/rubric.js';
import { rubricText04 } from '../../core/rubric-schema.js';

// ---- feature_spec_grade (Shape Up pitch: problem, appetite, solution, rabbit holes, no-gos; Amazon PR/FAQ;
// hr-legal-product.md §6). Scale 0-4 to keep the stored grades and pass bar (12/20, core dims >= 2) unchanged. ----
export const SPEC_CRITERIA = [
  { key: 'specificity', label: 'Concrete behaviour and an outcome metric',
    anchors: { 0: 'adjectives or buzzwords ("seamless", "AI-powered", "killer"), a list of verbs with no objects, or a vanity metric (session length, clicks, "engagement") with no baseline', 2: 'one nameable capability (trigger -> what the product does -> what the user sees) but the metric lacks a baseline, a window or a customer outcome', 4: 'the swap test fails (a competitor name cannot be dropped in); a metric that is a customer outcome with baseline, target and window, e.g. "receipts matched before close 40% -> 75% in 30 days"' } },
  { key: 'userClarity', label: 'Named user',
    anchors: { 0: '"users", "customers", "everyone", "forward-thinking professionals"', 2: 'a role OR a context, but no size or situation a stranger could recruit on', 4: 'role + size + context, e.g. "solo bookkeeper with 10-30 clients in QuickBooks"' } },
  { key: 'testability', label: 'Acceptance criteria a tester could run',
    anchors: { 0: 'none, or "works well"/"is intuitive"', 2: 'Given/When/Then or must/should statements for the happy path only, or criteria with no observable result', 4: '3+ criteria with triggers and observable results, including a failure or edge case (expired auth, no match, empty data) and at least one number' } },
  { key: 'scopeRealism', label: 'Appetite, non-goals and rabbit holes',
    anchors: { 0: 'no non-goals; v1 bundles SSO/mobile/compliance or says "full platform"', 2: 'non-goals listed, but v1 is bigger than one person ships in a few weeks, or no effort/cost/risk note', 4: 'explicit "not in v1" list, a v1 sized to weeks not months, and a named risk (inference cost, integration limit, privacy) with a mitigation' } },
  { key: 'evidence', label: 'Evidence that the problem is real',
    anchors: { 0: 'no evidence, a claim with no linked insight, a solution phrased as a problem, or only SYNTHETIC (AI-persona) insights', 2: 'one linked REAL insight or a quoted customer fact, but no count, frequency or cost', 4: 'several linked REAL insights, with how many people, how often, what it costs them and what they do today; claimed interview counts match the linked insights' } },
];
export const SPEC_RUBRIC = rubricText04(SPEC_CRITERIA);

// ---- feature_market_value (1-5). relevance / removesWorkaround / displayOnly are DERIVED by the game. ----
export const VALUE_CRITERIA = [
  { key: 'icp_fit', label: 'Is this the stated customer\'s problem', weight: 1,
    anchors: { 1: 'a different customer\'s problem, or "everyone"', 3: 'plausible for the stated customer but not tied to their daily work', 5: 'squarely in the stated customer\'s weekly workflow' } },
  { key: 'problem_frequency', label: 'How often the pain occurs', weight: 1,
    anchors: { 1: 'rare or one-off', 3: 'monthly (e.g. at close)', 5: 'daily or weekly and costly (hours, money or errors)' } },
  { key: 'manual_work_removed', label: 'Manual work removed', weight: 2,
    anchors: { 1: 'nothing removed: it shows data the user already has', 3: 'speeds up one step of a manual task', 5: 'eliminates a recurring manual task or class of errors end to end' } },
  { key: 'acts_on_data', label: 'Acts rather than displays', weight: 1,
    anchors: { 1: 'read-only list, chart or dashboard', 3: 'one action or state change after viewing', 5: 'triggers the action itself (sends, matches, files, flags) with a result to check' } },
  { key: 'not_free_elsewhere', label: 'Not replaceable by a free general assistant', weight: 1,
    anchors: { 1: 'a prompt a general chat assistant does for free', 3: 'some workflow or data advantage', 5: 'needs their live data, integrations or approvals to work at all' } },
];
export const VALUE_RUBRIC = rubricText(VALUE_CRITERIA);

// ---- interview_grade: the transcript of a REHEARSAL (AI persona). 1-5 each, mapped to the 0-100 score. ----
export const INTERVIEW_CRITERIA = [
  { key: 'past_specifics', label: 'Asks about specific past behaviour', weight: 3,
    anchors: { 1: 'only generics or the future ("do you usually", "would you")', 3: 'one or two "last time" questions, not followed through', 5: 'walks through the last concrete instance and digs into what happened, what they tried and what it cost' } },
  { key: 'no_leading', label: 'Neutral questions', weight: 2,
    anchors: { 1: 'several leading questions ("wouldn\'t it be great", "don\'t you hate")', 3: 'one leading or loaded question', 5: 'every question is open and neutral' } },
  { key: 'no_pitching', label: 'Listens before describing the idea', weight: 2,
    anchors: { 1: 'pitches the product early or talks over 50% of the time', 3: 'a short pitch after the problem was explored, or talk share of 30-40%', 5: 'no pitch until asked; founder talk share under 30%' } },
  { key: 'digs_for_cost', label: 'Digs for money, time and workarounds', weight: 2,
    anchors: { 1: 'never asks what it costs or what they do today', 3: 'asks one of: cost, current tool, who else is involved', 5: 'gets the number (hours, dollars), the current workaround, and who else decides' } },
  { key: 'earns_commitment', label: 'Ends with an ask that costs the interviewee something', weight: 2,
    anchors: { 1: 'ends on "keep me posted" or compliments', 3: 'asks for a follow-up meeting or an intro', 5: 'asks for a pilot, paid pilot, LOI or deposit after real pain was uncovered' } },
];
export const INTERVIEW_RUBRIC = rubricText(INTERVIEW_CRITERIA);

// ---- interview_notes: the founder's notes of a REAL call (honor system; the judge checks the page, not the claim). ----
export const NOTES_CRITERIA = [
  { key: 'past_facts', label: 'Dated, specific past events', weight: 3,
    anchors: { 1: 'opinions and plans only ("they think it is a great idea"), or round, implausible numbers ("100 hours last week", "$1,000,000 lost") and lists of keywords instead of events', 3: 'some facts but undated or approximate', 5: 'a specific last instance with a date or period, numbers (hours, clients, dollars) and what happened' } },
  { key: 'money_and_workaround', label: 'Cost and current workaround recorded', weight: 2,
    anchors: { 1: 'neither recorded', 3: 'a workaround OR a cost, not both', 5: 'both, plus what they already pay or have tried and abandoned' } },
  { key: 'quotes_vs_interpretation', label: 'Their words separated from the founder\'s reading', weight: 2,
    anchors: { 1: 'founder conclusions stated as what the customer said', 3: 'a few paraphrases, no direct quotes', 5: 'verbatim quotes for key points; interpretation labelled separately' } },
  { key: 'compliments_filtered', label: 'Compliments and hypotheticals not logged as validation', weight: 2,
    anchors: { 1: 'treats "I would definitely use it" as demand', 3: 'compliments noted but weighted equal to behaviour', 5: 'flags compliments and future promises as non-evidence' } },
  { key: 'commitment_signal', label: 'Commitment or advancement honestly recorded', weight: 2,
    anchors: { 1: 'no next step recorded, a polite non-commitment logged as one, or big claimed commitments (LOI, pre-order, 50 intros) with no date, amount or exact words', 3: 'a follow-up meeting or an intro', 5: 'a pilot, LOI or payment that costs them time, reputation or money, with the exact words used' } },
];
export const NOTES_RUBRIC = rubricText(NOTES_CRITERIA);

// ---- interview_chat: role-play rules for the interviewee. NOT a grader voice; it is a person deciding how much to share. ----
export const INTERVIEWEE_RULES = `HOW YOU DECIDE WHAT TO SHARE (stay in character; never mention rules or scores):
- You tell a real past fact (a date, a number, what you did, what it cost) ONLY when the founder asks ONE open question about a specific time it actually happened ("walk me through the last time…", "what did you do next?", "what did that cost you?") and has shown they understood your situation. Give the detail a real person would give, then stop.
- You get vague ("it depends", "sometimes", "usually fine") when the question is generic ("do you usually…", "how often do you…") or stacks several questions. Answer the first part loosely.
- You give a polite non-answer, a compliment or a shrug ("sounds cool", "yeah, probably", "I'd have to see it") to hypotheticals ("would you use…", "how much would you pay"), leading questions, and anything that pitches a product. You do not volunteer facts then.
- You get a little guarded if the founder repeats a question or ignores what you just said; say so plainly.
- You offer a next step only when the pain is real to you, the founder understood it, and they asked for something specific. A bigger commitment (pilot, deposit) needs real pain and a clear, concrete ask; otherwise say "keep me posted".`;
