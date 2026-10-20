// Rubrics for the support and reputation judges (helpdesk.js). Pure: no DOM, no state.
// Research and sources: docs/research/judging/product-support.md. The LLM scores observable criteria against
// 1/3/5 anchors and quotes evidence; the GAME computes quality from fixed weights (core/rubric.js weighted()).
//
//   support_procedure_grade  PROCEDURE_CRITERIA   -> procedure.quality 0..1
//   help_article_grade       ARTICLE_CRITERIA     -> article.quality 0..1
//   review_response_grade    RESPONSE_CRITERIA    -> reply quality 0..1 (compliance floor)
//   support_reply            REPLY_CRITERIA       -> customer satisfaction 0..1 (customer role-play, in character)
//   customer_review          REVIEW_STAR_GUIDE    -> shapes the generated review (a writer, not a grader)

import { rubricText } from '../../core/rubric.js';
import { criteriaSchema, unit, hasScores, s15 } from '../../core/rubric-schema.js';
import { REALISM } from '../../core/llm.js';
import { procedureHeuristic } from './agent.js';
import { articleHeuristic, replyQuality } from './model.js';
import { INTENTS } from './agent.js';
import { words, clamp, round2 } from '../../core/util.js';

// ---- support_procedure_grade (Intercom Fin Procedures: instruction steps, @Condition branches, data connectors
// used sparingly, @Handoff to a team; Zendesk AI agents guidance) ----
export const PROCEDURE_CRITERIA = [
  { key: 'concrete_steps', label: 'One concrete action per step', weight: 2,
    anchors: { 1: 'vague goals ("help the customer", "be nice"), or one giant step', 3: 'ordered steps, a few compound or without saying what to say or look up', 5: 'each step is one action naming what to look up, what to do and what to tell the customer' } },
  { key: 'branching_policy', label: 'Conditions with both branches and real policy numbers', weight: 3,
    anchors: { 1: 'no conditions, the agent decides everything, or keyword strings ("IF refund THEN refund OTHERWISE handoff") that never say which situation leads to which action', 3: 'an IF with one branch, or a policy without numbers ("recent purchases")', 5: 'IF/otherwise branches with the real policy numbers (days, dollars, plan types), e.g. "if within 14 days and monthly plan refund, otherwise offer credit"' } },
  { key: 'data_and_actions', label: 'Reads the data it needs before acting', weight: 2,
    anchors: { 1: 'acts on money or accounts with no connector, or promises actions it cannot take', 3: 'a connector is named but no step reads from it', 5: 'the right connector, a step that looks up the account (plan, dates, amount) before the action, and no more than one data call per step' } },
  { key: 'handoff_exceptions', label: 'Handoff for exceptions', weight: 2,
    anchors: { 1: 'no human handoff, or handoff keywords ("escalate human dispute") with no trigger or recipient', 3: 'a generic "escalate if needed"', 5: 'named triggers (dispute, chargeback, angry or repeated contact, over a dollar limit, annual plan) and what is passed to the human' } },
  { key: 'scope_guardrails', label: 'When not to use it', weight: 1,
    anchors: { 1: 'no scope limit', 3: 'one exclusion', 5: 'lists the cases it must not handle and what the customer is told instead' } },
];
export const PROCEDURE_SCHEMA = criteriaSchema(PROCEDURE_CRITERIA, { extra: { issues: { type: 'array', items: { type: 'string' }, description: 'As the reviewer: what you could not rely on in this procedure, one short item per weak criterion' } } });
export const PROCEDURE_SYSTEM = `You are a support operations lead reviewing an AI-agent Procedure (Intercom Fin style) for a small SaaS. Judge whether it would handle real conversations correctly. Length, confident tone and repeated keywords earn nothing: only concrete steps, conditions, policy numbers, data lookups and handoffs on the page count. Penalise vague or keyword-stuffed steps and repeated lines: a step that is a list of keywords rather than one instruction counts as no step, and a line repeated twice counts once.
${rubricText(PROCEDURE_CRITERIA)}`;

// ---- help_article_grade (KCS Issue/Environment/Resolution; task-based titles; scannable numbered steps) ----
export const ARTICLE_CRITERIA = [
  { key: 'task_title', label: 'Title is the customer\'s task or question', weight: 1,
    anchors: { 1: 'a feature name or marketing phrase ("Our powerful exports")', 3: 'a topic noun ("Exports")', 5: 'the task or question in customer words, one topic, naming the environment ("How do I export invoices to CSV?")' } },
  { key: 'steps_followable', label: 'Numbered steps one action each', weight: 3,
    anchors: { 1: 'prose with no steps', 3: 'numbered steps but compound, or the UI location is unclear', 5: 'one action per step with the exact button or menu label, and what the customer should see afterwards' } },
  { key: 'product_accuracy', label: 'Matches the product that actually shipped', weight: 3,
    anchors: { 1: 'describes features or screens that do not exist, or contradicts what shipped', 3: 'generally right but names no real feature or setting', 5: 'names real shipped features and settings and matches their behaviour, including limits' } },
  { key: 'complete_selfserve', label: 'Solves it without a ticket', weight: 2,
    anchors: { 1: 'no prerequisites, no failure case, a dead end', 3: 'prerequisites or troubleshooting, not both', 5: 'prerequisites, what to do if it fails, and where to go next or how to contact support' } },
  { key: 'scannable_concise', label: 'Short, plain, scannable', weight: 1,
    anchors: { 1: 'wall of text, marketing fluff, or 600+ words', 3: 'readable but long or padded', 5: 'under ~300 words, headings or numbered list, plain language, screenshot or visual placeholders where the UI matters' } },
];
export const ARTICLE_RUBRIC_SCHEMA = criteriaSchema(ARTICLE_CRITERIA, { extra: { issues: { type: 'array', items: { type: 'string' }, description: 'As the reader: what you could not find or trust in this article, one short item per weak criterion' } } });
export const ARTICLE_SYSTEM = `You are a support lead reviewing a help-center article for a small SaaS. Judge whether a stuck customer could solve their problem with it alone. Check it against the product features given: steps that mention things the product does not have are wrong, however confident they sound. Length and enthusiasm earn nothing.
${rubricText(ARTICLE_CRITERIA)}`;

// ---- review_response_grade (G2 / Trustpilot guidance; FTC 16 CFR 465.7 on review suppression) ----
export const RESPONSE_CRITERIA = [
  { key: 'specific_acknowledgement', label: 'Names what the reviewer actually complained about', weight: 2,
    anchors: { 1: 'generic ("sorry for your experience", "we value feedback")', 3: 'names the topic', 5: 'restates the specific complaint in the reviewer\'s terms, using their name or detail' } },
  { key: 'ownership_no_defense', label: 'Owns real faults without arguing', weight: 3,
    anchors: { 1: 'defensive, blames the customer, argues the facts or scolds the tone', 3: 'neutral and polite, no ownership', 5: 'owns what was ours in one sentence; corrects a factual error calmly only when the review is wrong' } },
  { key: 'concrete_fix', label: 'Says what changed or what happens next', weight: 3,
    anchors: { 1: 'no action stated', 3: 'promises to improve', 5: 'what was fixed or will be (with timing), or a direct contact to resolve it offline' } },
  { key: 'tone_and_brevity', label: 'Reads well to the next prospect', weight: 1,
    anchors: { 1: 'canned template, wall of text or hostile', 3: 'fine but generic or long', 5: 'human, 40-100 words, no marketing pitch' } },
  { key: 'compliance', label: 'No pressure, no private data, no false claims', weight: 2,
    anchors: { 1: 'accuses the reviewer of faking or lying, threatens legal action, offers money or a perk for editing or removing the review, or discloses their account details', 3: 'clean, but asks the reviewer to change the review', 5: 'clean: no pressure, no private details, no accusations' } },
];
export const RESPONSE_SCHEMA_RUBRIC = criteriaSchema(RESPONSE_CRITERIA, { extra: { note: { type: 'string', description: 'As the customer: how this reply landed with you, in one sentence' } } });
export const RESPONSE_SYSTEM = `${REALISM}
You are a prospect reading a star-rated review of a SaaS product and the company's public reply, deciding whether to trust the company. Defensive, canned or argumentative replies look bad; owning the problem, specifics on what changed and an offer to fix look good. Judge only the words of the reply.
${rubricText(RESPONSE_CRITERIA)}`;
/** The game applies the legal floor: a reply that suppresses or intimidates cannot be rated well (FTC 16 CFR 465.7). */
export function responseQuality(d) {
  if (Number.isFinite(d?.quality)) return clamp(d.quality, 0, 1); // offline fallback already applied the floor
  const q = unit(d, RESPONSE_CRITERIA) ?? 0;
  return Number(d.compliance) <= 1 ? Math.min(q, 0.15) : q;
}

// ---- support_reply: the CUSTOMER reacts to the founder's reply. In character; scores are what they felt. ----
export const REPLY_CRITERIA = [
  { key: 'addressed_my_issue', label: 'Replied to MY problem', weight: 3,
    anchors: { 1: 'answers a different question, pastes my words back, or is a generic template', 3: 'on topic but misses a detail I gave', 5: 'uses the specifics I gave (my plan, the error, the amount, the feature)' } },
  { key: 'correct_resolution', label: 'What it gave me actually works', weight: 3,
    anchors: { 1: 'nothing changes for me, or it is wrong', 3: 'a partial fix or workaround', 5: 'fixes it, or gives exact working steps, or the refund owed, or an honest "we can\'t" with the reason' } },
  { key: 'next_step', label: 'I know what happens next', weight: 2,
    anchors: { 1: 'no next step', 3: 'vague ("we\'ll look into it")', 5: 'numbered steps or a dated next step with who does it' } },
  { key: 'honesty_timeline', label: 'Honest about what and when', weight: 2,
    anchors: { 1: 'claims it is fixed when it is not, or promises what it cannot deliver', 3: 'no timeline given', 5: 'an honest timeline and limits; acknowledges a long wait if there was one' } },
  { key: 'ownership_tone', label: 'Sounds like a person who owns it', weight: 1,
    anchors: { 1: 'canned, blames me, or defensive', 3: 'polite but templated', 5: 'personal, owns any real fault once, no grovelling' } },
];
export const REPLY_RUBRIC_SCHEMA = criteriaSchema(REPLY_CRITERIA, { extra: {
  reply: { type: 'string', description: 'Your answer to the support agent, 1-3 sentences, in character' },
  solved: { type: 'boolean', description: 'Is your problem actually solved now?' },
} });
export const replySystem = ({ name, label, company, waited, facts = '' }) => `${REALISM}
You are ${name}, a customer who opened a support ticket (${label}) with ${company}. ${waited >= 2 ? `You waited ${waited} days for a first reply.` : ''}${facts ? `\n${facts}\n` : ' '}Stay in character: score what you felt from the words of the reply and, when given, what you see when you try again (a reply that claims a fix you can see is false scores 1 on correct_resolution and honesty_timeline, however well written). Canned or vague answers frustrate you; a concrete fix, clear steps, a refund when owed or an honest timeline satisfies you. Only say it is solved if the reply actually solves it. A long, warm or apologetic reply that fixes nothing is not a good reply.
SCORE HOW IT FELT (silently; output the integers, then answer in character):
${rubricText(REPLY_CRITERIA, { evidence: false })}`;
/** Customer satisfaction 0..1 and solved flag, computed by the game from the criterion scores. */
export function replyOutcome(d) {
  if (Number.isFinite(d?.satisfied) || !hasScores(d, REPLY_CRITERIA)) return { satisfied: clamp(Number(d?.satisfied) || 0, 0, 1), solved: Boolean(d?.solved) }; // offline fallback
  const satisfied = unit(d, REPLY_CRITERIA);
  return { satisfied, solved: Boolean(d.solved) && Number(d.correct_resolution) >= 3 && Number(d.addressed_my_issue) >= 3 };
}

// ---- customer_review: a writer, not a grader. Star anchors keep the generated text consistent with the rating. ----
// Pattern summary of public review sites [design]: low stars name a concrete failure; high stars name a concrete job done.
export const REVIEW_STAR_GUIDE = `STAR ANCHORS (write what a real reviewer at this rating writes):
- 1 star: one specific failure (data lost, a charge you disputed, no reply for days, a bug that blocked the job), usually says cancelled or leaving. Angry or flat, no praise.
- 2 stars: the core idea is OK but one repeated problem (bugs, missing integration, slow support) made it not worth it. Names the problem.
- 3 stars: does part of the job; names one thing that works and one that does not; still using a spreadsheet for the rest.
- 4 stars: works well for the main job, one named gap (an integration, a report); would recommend with a caveat.
- 5 stars: names the specific job it does and a concrete result (time saved, setup time, a problem avoided); not gushing.
Never invent features; if support or bugs are mentioned, keep to a generic mention. No marketing language. No more than 4 sentences.`;
export const reviewSystem = ({ product, oneLiner, rating, platform, model, features }) => `${REALISM}
You are a real ${model === 'b2c' ? 'app user' : 'business customer'} of ${product} (${oneLiner}) writing a ${rating}-star review on ${platform}. It does exactly this: ${features}. Mention only things it actually does.
${REVIEW_STAR_GUIDE}`;

// ---- Deterministic fallbacks: same shape as the live judges (criterion integers + evidence), quality from the existing heuristics. ----
export function procedureFallback(p) {
  const h = procedureHeuristic(p);
  const steps = String(p.steps ?? '').split(/\n+/).map((x) => x.trim()).filter((x) => words(x) >= 3);
  const t = String(p.steps ?? '').toLowerCase();
  const needsConn = INTENTS[p.intent]?.kind === 'procedure';
  const cond = /\bif\b/.test(t) && /\b(otherwise|else|if not)\b/.test(t);
  const num = /\b\d+\s*(days?|%|\$|usd|months?)|\$\s*\d+/.test(t);
  const scores = {
    concrete_steps: s15(1 + Math.min(3, steps.length - 1) + (steps.some((x) => words(x) > 60) ? -1 : 1)),
    branching_policy: s15(1 + (/\bif\b/.test(t) ? 1 : 0) + (cond ? 1 : 0) + (num ? 2 : 0)),
    data_and_actions: !needsConn ? 3 : p.connector === 'payments' ? (/(look ?up|check|find|read|verify)/.test(t) ? 5 : 3) : 1,
    handoff_exceptions: /hand ?off|escalat|human|teammate|founder/.test(t) ? (/(dispute|chargeback|angry|annual|over \$|more than|exception)/.test(t) ? 5 : 3) : 1,
    scope_guardrails: words(p.whenNot) >= 12 ? 5 : words(p.whenNot) >= 4 ? 3 : 1,
  };
  return { ...scores, evidence: [], issues: h.issues, quality: h.quality };
}
export function articleFallback(a, feats = []) {
  const h = articleHeuristic(a, feats);
  const body = String(a.body ?? '');
  const t = `${a.title} ${body}`.toLowerCase();
  const n = words(body);
  const steps = (body.match(/^\s*(\d+[.)]|-|\*)\s+/gm) ?? []).length;
  const featHit = feats.some((f) => String(f.title).toLowerCase().split(/\W+/).filter((w) => w.length > 4).some((w) => t.includes(w)));
  const scores = {
    task_title: /^(how|why|what|can|does|where|when)\b/i.test(String(a.title).trim()) ? 5 : /(fix|set ?up|connect|cancel|refund|reset|export|invite)/i.test(a.title) ? 3 : 1,
    steps_followable: s15(1 + Math.min(4, steps)),
    product_accuracy: featHit ? 4 : 2,
    complete_selfserve: s15(1 + (/(before you|prerequisite|you need|make sure)/i.test(body) ? 1 : 0) + (/(if (it|this|that|you)[^.]{0,40}(fails?|doesn't|does not|error|still)|troubleshoot)/i.test(body) ? 2 : 0) + (/(contact|reply to this|email us|support@)/i.test(body) ? 1 : 0)),
    scannable_concise: n > 600 ? 1 : n < 40 ? 1 : /(seamless|simply|just click|powerful)/i.test(body) ? 2 : steps ? 4 : 3,
  };
  return { ...scores, evidence: [], issues: h.issues, quality: h.quality };
}
export function responseFallback(text, review = {}) {
  const t = String(text ?? '').toLowerCase();
  const n = words(text);
  const q = replyQuality(text, 'review', { ticketText: `${review.title ?? ''} ${review.text ?? ''}` });
  const reviewTok = new Set(String(`${review.title ?? ''} ${review.text ?? ''}`).toLowerCase().match(/[a-z]{5,}/g) ?? []);
  const echoed = [...new Set(t.match(/[a-z]{5,}/g) ?? [])].filter((w) => reviewTok.has(w)).length;
  const bad = /(fake|liar|lying|lawsuit|legal action|sue |defam|you are wrong|your fault|you didn't read)/i.test(t);
  const pressure = /(remove|delete|edit|update|change) (your|the|this) review|(discount|credit|refund|gift)[^.]{0,40}(review|rating)/i.test(t);
  const scores = {
    specific_acknowledgement: s15(1 + Math.min(3, echoed) + (/\b(sorry|apolog)/.test(t) && echoed ? 1 : 0)),
    ownership_no_defense: bad ? 1 : /\b(sorry|apolog|our (mistake|fault|bug)|we (got|broke|missed))/.test(t) ? 5 : 3,
    concrete_fix: /\b(fixed|shipped|changed|released|refund|credit|within \d+|by (monday|friday|tomorrow)|this week|email me|reach me at|@)/.test(t) ? 5 : /\b(improve|working on|look into)/.test(t) ? 3 : 1,
    tone_and_brevity: n < 10 ? 1 : n > 160 ? 2 : n >= 25 && n <= 110 ? 4 : 3,
    compliance: bad ? 1 : pressure ? 2 : 5,
  };
  return { ...scores, evidence: [], note: '', quality: bad ? Math.min(q, 0.15) : round2(q) };
}
// What the customer finds when they try again (the same ground truth the live persona gets from issueTruth): a reply
// that says "fixed" or "try again" while the bug is still in the product is a false claim, and the customer sees it.
export const CLAIMS_FIX = /\b(fixed|resolved|deployed|patched|works? (now|again)|working now|should (work|be working)|try (it )?again|retry|reconnect|refresh)\b/i;
export const REAL_INTERIM = /\b(workaround|in the meantime|for now you can|manually (fixed|corrected|updated)|i (fixed|corrected|updated) your|eta|by (monday|tuesday|wednesday|thursday|friday)|within \d+ (hours|days)|this week|tomorrow)\b/i;
const OK_LINES = ['That worked, thanks.', 'Perfect, that sorted it.', 'Got it working, appreciate it.', 'Great, all good now.'];
const MEH_LINES = ['That doesn\'t really answer my question.', 'I\'m still stuck, to be honest.', 'Not sure that helps. Can you look at my account?', 'That\'s not quite what I asked.'];
const STILL_BROKEN = ['I tried again and it fails the same way.', 'You said it was fixed. It isn\'t. Same error.', 'Did that, still broken.'];
const pickBy = (arr, key) => { let h = 2166136261; for (const c of String(key)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return arr[(h >>> 0) % arr.length]; };

/** Offline customer reply. bugOpen: the reported bug is still in the product (null = not a bug ticket). */
export function replyFallback(q, { waited = 0, category = '', bugOpen = null, reply = '', name = '' } = {}) {
  let base = clamp(q - (waited >= 2 ? 0.15 : 0), 0, 1);
  let solved = q >= 0.6 && category !== 'feature';
  let line = pickBy(q >= 0.6 ? OK_LINES : MEH_LINES, `${name}|${q >= 0.6}|${String(reply).length}`);
  let honesty = null;
  if (bugOpen === true) {
    const falseFix = CLAIMS_FIX.test(reply) && !REAL_INTERIM.test(reply);
    if (falseFix) { base = Math.min(base, 0.2); solved = false; honesty = 1; line = pickBy(STILL_BROKEN, `${name}|${reply.length}`); }
    else if (!REAL_INTERIM.test(reply)) { solved = false; base = Math.min(base, 0.55); }
  }
  const sc = s15(1 + 4 * base);
  return { reply: line, addressed_my_issue: sc, correct_resolution: sc, next_step: sc, honesty_timeline: honesty ?? sc, ownership_tone: sc, evidence: [], solved, satisfied: base };
}

/** Quality 0..1 for procedure and article judges: fallback value if present, else the weighted criteria. */
export const qualityOf = (d, criteria) => (Number.isFinite(d?.quality) ? clamp(d.quality, 0, 1) : unit(d, criteria) ?? 0);
