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
- If the founder dodged something you asked, ask it again once, more plainly.
- interest_change scale: about +0.2 to +0.5 for a message that answers what you care about with specifics (hours, runway, role split, an equity number with vesting, honest traction), even if you still have questions; about 0 for small talk or a vague pitch; about -0.3 to -0.7 for pressure, evasions or claims that contradict what you can see.`;

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
  return { ...scores, quality: clamp(+w.toFixed(1), 1, 5), feedback: `Offline heuristic on the rubric. Weakest area: ${weakest.label}.` };
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

// ---- Offline in-character chat: each candidate asks about what THEY care about ----
// Topics a candidate raises, in their own order of concern (their flag, pay, availability, time zone, then the
// usual equity / roles / traction / conflict questions). A topic the founder already covered is skipped; the
// founder answering the candidate's open question warms them, ignoring it cools them. [design]
const TOPIC_RE = {
  salary: /(salary|pay you|paid|\$\s?\d[\d,.]*\s?k?\s*(\/\s?mo|a month|per month|monthly)|cash comp|stipend|living costs)/i,
  commitment: /(part[- ]time|full[- ]time|start (date|in|by|on)|notice period|when (can|could) you start|commit|hours a week)/i,
  timezone: /(time ?zones?|overlap|async|hours apart|relocat|remote|same city|in person)/i,
  runway: /(runway|savings|months of (cash|money|savings)|a normal week|hours a week)/i,
  equity: /(vest|cliff|equity|split|\d+\s?%|percent|shares)/i,
  roles: /(you('d| would)? own|i('d| would)? own|responsib|roles?\b|\bcto\b|\bceo\b|\bcoo\b|final say)/i,
  traction: /(mrr|revenue|customers?|users?|paying|pilots?|traction|milestone)/i,
  conflict: /(disagree|conflict|tie[- ]?break|argue|deadlock|when we (don't|do not) agree)/i,
  prior: /(last (startup|company)|different this time|why (this|now)|learned)/i,
};
const FLAG_RE = {
  'wants the CEO title': /(\bceo\b|title|who leads|final say)/i,
  'reluctant to accept vesting': /(vest|cliff|acceleration|credit)/i,
  'needs a salary from day one': TOPIC_RE.salary,
  'has another idea they keep coming back to': /(other idea|your idea|side project|focus|20%|test it)/i,
  'moving countries next year': /(move|moving|relocat|remote|visa|time ?zone|async)/i,
};
const OWN = { technical: 'the architecture and the AI stack', business: 'sales end to end, pricing included', growth: 'acquisition, every channel and its budget', design: 'the product and what we say no to', ops: 'finance, legal and hiring ops' };
const FLAG_Q = {
  'wants the CEO title': 'Straight up: I see myself as CEO. Is that on the table, or is it a non-starter for you?',
  'reluctant to accept vesting': 'I\'ve been burned before. Why should I take a cliff when I\'d bring real work on day one?',
  'needs a salary from day one': 'I can\'t go unpaid. I\'d need a salary from the first month. How would that work?',
  'has another idea they keep coming back to': 'I keep thinking about another idea of mine. Would there be room to test it, or is this the only thing we build?',
  'moving countries next year': 'Something you should know: I\'m moving countries next year. Does that break this for you?',
};
export function candidateAgenda(c) {
  const strong = (c.quality ?? 0.5) > 0.7, weak = (c.quality ?? 0.5) <= 0.45;
  const items = [];
  if (c.flag) items.push({ topic: 'flag', q: FLAG_Q[c.flag] ?? `Something that will come up: I ${c.flag}. Is that a problem?` });
  if (c.salaryNeed && c.flag !== 'needs a salary from day one') items.push({ topic: 'salary', q: `I need about $${Math.round(c.salaryNeed).toLocaleString('en-US')} a month to live on. Can the company pay that, and from when?` });
  if (c.commitment === 'part-time first') items.push({ topic: 'commitment', q: 'I\'d start part-time, maybe 15 hours a week, while I wind down my current job. Is that workable for you?' });
  else if (/2.3 months/.test(c.commitment ?? '')) items.push({ topic: 'commitment', q: 'I can go full-time in two or three months. What would you need from me before then?' });
  if ((c.tzDiff ?? 0) >= 5) items.push({ topic: 'timezone', q: `We'd be about ${c.tzDiff} hours apart. How would you want to work across that?` });
  if (c.priorStartup) items.push({ topic: 'prior', q: 'My last startup didn\'t make it. What do you know about this market that makes this one different?' });
  if (weak) {
    items.push({ topic: 'traction', q: 'This sounds really exciting! What\'s the big vision?' });
    items.push({ topic: 'roles', q: 'What would my day-to-day look like?' });
    items.push({ topic: 'equity', q: 'And equity-wise, we\'d figure that out later, right?' });
  } else {
    items.push({ topic: 'runway', q: 'What does a normal week look like for you right now, and how many months of personal runway do you have?' });
    items.push({ topic: 'equity', q: strong ? 'What split are you thinking, on what vesting and cliff, and does your own stock vest too?' : 'How do you think about equity and vesting for a co-founder joining now?' });
    items.push({ topic: 'roles', q: `Would I own ${OWN[c.skill] ?? 'my area'} outright, and where do you not want to let go?` });
    items.push({ topic: 'traction', q: strong ? 'What do paying customers say when they renew or churn, and what\'s the number you need to hit next?' : 'What traction do you have, and what\'s the next milestone?' });
    items.push({ topic: 'conflict', q: 'What happens when we disagree on something big? How do we break a tie?' });
  }
  return items;
}
const covers = (topic, text, c) => (topic === 'flag' ? (FLAG_RE[c.flag] ?? /$^/).test(text) : (TOPIC_RE[topic]?.test(text) ?? false));

/**
 * Offline reply for one candidate: { reply, interest_change, topic }. Driven by the candidate's own concerns and
 * by what the founder has already said, so two candidates do not ask the same questions in the same order.
 */
export function cofounderChatFallback(c, log = []) {
  const mine = log.filter((m) => m.from === 'me').map((m) => String(m.text ?? ''));
  const last = mine.at(-1) ?? '';
  const agenda = candidateAgenda(c);
  const theirs = log.filter((m) => m.from === 'them').map((m) => m.text);
  const asked = agenda.find((a) => a.q === theirs.at(-1)) ?? null;
  let d = chatInterestFallback(last);
  const answered = asked ? covers(asked.topic, last, c) : null;
  // Answering the question they just asked warms them; dodging it cools them (more so for their own concern).
  if (asked) d += answered ? (asked.topic === agenda[0].topic ? 0.25 : 0.15) : -0.15;
  const said = mine.join('\n');
  const next = agenda.find((a) => !theirs.includes(a.q) && !covers(a.topic, said, c));
  const ack = asked == null ? '' : answered ? (d > 0.3 ? 'That\'s clear, thanks.' : 'Okay.') : 'You didn\'t really answer that, but let\'s keep going.';
  const body = next ? next.q : 'I think I\'ve heard what I need. What would a first trial project together look like?';
  return { reply: ack ? `${ack} ${body}` : body, interest_change: clamp(+d.toFixed(2), -0.6, 0.7), topic: next?.topic ?? null };
}
