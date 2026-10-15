// Co-founder judges: researched criteria (docs/research/judging/investors-people-ops.md §Co-founder).
// The profile review scores the founder's matching-platform profile; the call judge and the chat are an
// in-character potential co-founder, so they get "what moves you" criteria scored privately, not a grader voice.
import { rubricText, weighted } from '../../core/rubric.js';
import { rubricSchema } from '../../core/rubric-fields.js';
import { clamp, words } from '../../core/util.js';

export const PROFILE_CRITERIA = [
  { key: 'accomplishment', label: 'One specific accomplishment that shows how you think', weight: 3, anchors: { 1: 'job titles and adjectives ("passionate", "visionary")', 3: 'a project named with no outcome', 5: 'one accomplishment with numbers and your role (shipped X to N users, $Y revenue, how you decided what to build)' } },
  { key: 'the_ask', label: 'Explicit about the partner and role wanted', weight: 2.5, anchors: { 1: '"looking for a co-founder"', 3: 'names the skill needed', 5: 'names the skill, stage, domain, and what each of you would own' } },
  { key: 'commitment', label: 'Commitment, timing and runway are stated', weight: 2.5, anchors: { 1: 'nothing on hours, start date or money', 3: '"full-time" with no date, runway or pay expectation', 5: 'start date, personal runway in months, salary expectation, and willingness to run a paid trial project' } },
  { key: 'traction_proof', label: 'Where the company is today, with evidence', weight: 2, anchors: { 1: 'an idea only', 3: 'a prototype or some users', 5: 'paying customers or MRR consistent with the real metrics, plus what is broken' } },
  { key: 'working_style', label: 'Values, decision style and equity/vesting stance', weight: 1.5, anchors: { 1: 'nothing on values, decisions or equity', 3: 'one line about values', 5: 'how you decide and disagree, hours and location, and an equity and vesting position (e.g. 4-year vest with cliff, trial first)' } },
];
export const PROFILE_SCHEMA_R = rubricSchema(PROFILE_CRITERIA, {
  feedback: { type: 'string', description: 'What a strong candidate would want to see added, quoting the weakest line.' },
});
export const profileRubric = () => rubricText(PROFILE_CRITERIA);
export const profileQuality = (scores) => weighted(scores, PROFILE_CRITERIA);

// What moves a potential co-founder, scored privately after a call.
export const CALL_CRITERIA = [
  { key: 'commitment_alignment', label: 'Commitment matches what I need', weight: 2.5, anchors: { 1: 'vague on hours, start date and runway; wants me to go first', 3: 'full-time intent but no timeline or runway', 5: 'clear start date, personal runway, and a credible plan if funding is slow' } },
  { key: 'roles_decisions', label: 'Roles and who decides', weight: 2, anchors: { 1: 'wants a "partner" who does whatever is needed; no ownership split', 3: 'rough split of work, no decision rule', 5: 'clear ownership areas, how ties are broken, what the founder will not give up' } },
  { key: 'equity_vesting', label: 'Equity and vesting position', weight: 2.5, anchors: { 1: 'avoids the topic or offers a flat 50/50 or a vague promise', 3: 'proposes a split without reasoning or vesting', 5: 'explains the split (contribution, timing, risk), proposes 4-year vesting with a 1-year cliff for both, and a trial first' } },
  { key: 'conflict_handling', label: 'How we will disagree', weight: 1.5, anchors: { 1: 'never had a conflict; or blames others', 3: 'generic ("we will communicate")', 5: 'a real past disagreement, what they did, and a rule for the next one' } },
  { key: 'honesty', label: 'Honest about traction, runway and weak spots', weight: 2.5, anchors: { 1: 'claims I can check are false or inflated', 3: 'accurate headline, avoids the bad numbers', 5: 'volunteers what is not working and what is unknown, numbers match what I can see' } },
  { key: 'curiosity', label: 'Asks about me and listens', weight: 1, anchors: { 1: 'monologue about their idea', 3: 'asks a surface question', 5: 'asks about my goals and constraints and builds on my answers' } },
];
export const CALL_SCHEMA_R = rubricSchema(CALL_CRITERIA, {
  interest: { type: 'integer', description: '1-5 your overall interest in a 1-3 month trial project together; the game recomputes it from the criteria' },
  concerns: { type: 'array', items: { type: 'string' } },
  summary: { type: 'string', description: 'Two sentences in your own voice, quoting what the founder said that moved you or worried you.' },
});
export const callRubric = () => `PRIVATE NOTES AFTER THE CALL (stay in character; these are your own notes, not a grade for the founder).\n${rubricText(CALL_CRITERIA)}`;
export const callInterest = (scores) => { const w = weighted(scores, CALL_CRITERIA); return w == null ? null : clamp(Math.round(w), 1, 5); };

export const CHAT_MOVES = `WHAT MOVES YOUR INTEREST (react as a person; never announce a score):
- Up: specific hours, start date and personal runway; a clear role split; a reasoned equity position with vesting (4 years, 1-year cliff) for both of you; a real story of a past disagreement; honest weak spots; a question about your goals.
- Down: pressure to decide today; "50/50, we will figure it out"; evasions about money or hours; claims that do not match the traction you can see; a monologue about the idea; no mention of vesting, roles or commitment.
- If the founder dodged something you asked, ask it again once, more plainly.`;

// ---- Offline scorers (same criteria, observable text features) ----
const lc = (t) => String(t ?? '').toLowerCase();
const r5 = (v) => Math.round(clamp(v, 1, 5));
const count = (t, re) => new Set(lc(t).match(re) ?? []).size;

export function profileScoresFallback(text) {
  const l = lc(text);
  const n = words(text);
  const nums = (l.match(/\$\s?[\d,.]+\s?[km]?|\d+\s?(%|customers|users|paying|mrr|months|years|hours)/g) ?? []).length;
  return {
    accomplishment: r5(1 + (/(built|shipped|launched|sold|grew|led|founded|raised)/.test(l) ? 1.3 : 0) + Math.min(2, nums * 0.7) - (/(passionate|visionary|rockstar|guru)/.test(l) ? 0.7 : 0)),
    the_ask: r5(1 + (/(looking for|need a|want a|seeking)/.test(l) ? 1 : 0) + (/(technical|engineer|cto|sales|go-to-market|growth|design|product|ops)/.test(l) ? 1 : 0) + (/(you will|you'd|own|lead|responsible)/.test(l) ? 1.5 : 0)),
    commitment: r5(1 + (/(full[- ]time|part[- ]time|hours)/.test(l) ? 1 : 0) + (/(runway|savings|months of)/.test(l) ? 1.5 : 0) + (/(start|by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|q[1-4]|next month)/.test(l) ? 0.8 : 0) + (/(trial|test project|paid)/.test(l) ? 0.7 : 0)),
    traction_proof: r5(1 + (/(prototype|mvp|beta|waitlist)/.test(l) ? 1 : 0) + (/(paying|customers|mrr|revenue)/.test(l) ? 1 : 0) + (/\$\s?[\d,.]+\s?[km]?\s?(mrr|\/mo|arr)|mrr[:\s]+\$/.test(l) ? 1.3 : 0) + (/(churn|not working|struggl|weak)/.test(l) ? 0.7 : 0)),
    working_style: r5(1 + (/(values|culture|decide|disagree|trust)/.test(l) ? 1 : 0) + (/(equity|vest|cliff)/.test(l) ? 1.5 : 0) + (/(remote|timezone|hours|location|async)/.test(l) ? 0.8 : 0) + (n > 90 ? 0.5 : 0)),
  };
}
export function heuristicProfileR(text) {
  const scores = profileScoresFallback(text);
  const w = profileQuality(scores);
  const weakest = PROFILE_CRITERIA.slice().sort((a, b) => scores[a.key] - scores[b.key])[0];
  return { ...scores, quality: clamp(+w.toFixed(1), 1, 5), feedback: `Offline heuristic on the rubric. Add to the weakest area (${weakest.label}): ${weakest.anchors[5]}.` };
}

export function callScoresFallback(transcript) {
  const mine = transcript.filter((m) => m.from === 'me').map((m) => String(m.text ?? ''));
  const all = mine.join('\n');
  const l = lc(all);
  const inflated = /(guaranteed|can't fail|cannot fail|10x for sure|no competition|billion for sure)/.test(l);
  return {
    commitment_alignment: r5(1 + (/(full[- ]time|hours|per week)/.test(l) ? 1 : 0) + (/(runway|savings|months of)/.test(l) ? 1.5 : 0) + (/(start|by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|next month|q[1-4])/.test(l) ? 1 : 0) + (/\$\s?[\d,.]+/.test(l) ? 0.5 : 0)),
    roles_decisions: r5(1 + count(l, /\b(own|ownership|decide|decision|tie-?break|final say|responsible|you would lead|i would lead|ceo|cto)\b/g) * 0.9),
    equity_vesting: r5(1 + (/(equity|split|percent|%)/.test(l) ? 1 : 0) + (/(vest|vesting|cliff)/.test(l) ? 1.7 : 0) + (/(trial|test project)/.test(l) ? 0.8 : 0) + (/(contribution|risk|timing|because)/.test(l) && /(equity|split)/.test(l) ? 0.7 : 0)),
    conflict_handling: r5(1 + (/(disagree|conflict|argu|fight)/.test(l) ? 1.3 : 0) + (/(last time|once|example|when we|i learned)/.test(l) ? 1.2 : 0) + (/(rule|process|agree to|escalat|advisor|mediat)/.test(l) ? 1.2 : 0)),
    honesty: r5(2.5 + (/(churn|not working|don't know|do not know|haven't|struggl|weak|mistake|worried)/.test(l) ? 1.5 : 0) + (/\$\s?[\d,.]+\s?[km]?\s?(mrr|arr)|\d+ (paying )?customers/.test(l) ? 0.7 : 0) - (inflated ? 2 : 0) - (mine.length && !/\d/.test(l) ? 0.7 : 0)),
    curiosity: r5(1 + Math.min(2.5, (all.match(/\?/g) ?? []).length * 0.9) + (/(what do you|what are you|how do you|your goals|what would you)/.test(l) ? 1 : 0)),
  };
}
/** Offline call judgment: criteria from the founder's lines, nudged by the candidate's hidden prior interest. */
export function heuristicCall(transcript, cand) {
  const scores = callScoresFallback(transcript);
  const w = weighted(scores, CALL_CRITERIA);
  const turns = transcript.filter((m) => m.from === 'me').length;
  const prior = 1 + (cand?.interest ?? 0.5) * 4;
  let interest = clamp(Math.round(0.75 * w + 0.25 * prior), 1, 5);
  if (turns < 3) interest = Math.min(interest, 3);
  const concerns = CALL_CRITERIA.filter((c) => scores[c.key] <= 2).map((c) => `${c.label}: not addressed`).slice(0, 3);
  return { ...scores, interest, concerns, summary: 'Offline judgment from what the founder actually said about commitment, roles, equity and vesting, conflict and honesty.' };
}

/** Offline chat reply: sentiment change (-1..1) from the founder's last message. */
export function chatInterestFallback(text) {
  const l = lc(text);
  const n = words(text);
  let d = 0;
  if (/\d/.test(l)) d += 0.15;
  if (/(vest|cliff)/.test(l)) d += 0.25; else if (/(equity|split)/.test(l)) d += 0.05;
  if (/(runway|full[- ]time|hours|start)/.test(l)) d += 0.2;
  if (/(churn|not working|don't know|honest|mistake|worr)/.test(l)) d += 0.15;
  if (/\?/.test(l)) d += 0.1;
  if (/(today only|right now or|need an answer|no time|must decide|50\/50 and|figure it out later)/.test(l)) d -= 0.4;
  if (/(revolutioniz|disrupt|game-chang|10x)/.test(l)) d -= 0.15;
  if (n < 6) d -= 0.15;
  return clamp(+d.toFixed(2), -0.6, 0.7);
}
