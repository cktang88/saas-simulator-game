// Gong-lite call analysis (pure): talk ratio, questions, Mom Test violations, next step, MEDDICC-lite.
// Also a deterministic offline prospect for live calls. Rubric: docs/research/sales-and-research.md §4.
import { clamp, words, hash } from '../../core/util.js';
import { rubricSchema, cleanRubric } from '../../core/rubric-schema.js';
import { SCORECARD_RUBRIC } from './rubrics.js';
import { offlineAnswer, classifyQuestion, COMMITMENT_ORDER } from '../../data/persona-prompts.js';

export const SCORECARD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['rubric', 'talkRatio', 'questionsAsked', 'discoveryQuality', 'momTestViolations', 'nextStepSecured', 'nextStep', 'meddicc', 'competitiveHandling', 'summary', 'coaching'],
  properties: {
    rubric: rubricSchema(SCORECARD_RUBRIC, 'Score each criterion 1-5 against its anchors, from the transcript only'),
    talkRatio: { type: 'number', description: 'Founder share of words spoken, 0-1' },
    questionsAsked: { type: 'number' },
    discoveryQuality: { type: 'number', description: '1-10: did the founder uncover past behaviour, the real problem, its cost, current workaround?' },
    momTestViolations: { type: 'array', items: { type: 'string' }, description: 'Up to 6: each leading / hypothetical / pitching / compliment-fishing moment, quoted briefly (max 20 words each)' },
    nextStepSecured: { type: 'boolean', description: 'A concrete, dated commitment from the prospect (meeting, intro, trial, pilot, payment). "Keep me posted" is NOT a next step.' },
    nextStep: { type: 'string', description: 'The agreed next step in max 15 words, or empty' },
    meddicc: {
      type: 'object', additionalProperties: false,
      required: ['metrics', 'economicBuyer', 'decisionCriteria', 'decisionProcess', 'paperProcess', 'pain', 'champion', 'competition'],
      properties: { metrics: { type: 'boolean' }, economicBuyer: { type: 'boolean' }, decisionCriteria: { type: 'boolean' }, decisionProcess: { type: 'boolean' }, paperProcess: { type: 'boolean', description: 'Learned what security/legal/procurement/insurance/board paperwork is needed and how long it takes' }, pain: { type: 'boolean' }, champion: { type: 'boolean' }, competition: { type: 'boolean', description: 'Learned the alternatives incl. doing nothing or building in-house' } },
    },
    competitiveHandling: { type: 'string', enum: ['not_raised', 'handled', 'fumbled'], description: 'When the prospect raised a competitor or their current tool: handled = asked why/what they like about it and differentiated on something specific, without bashing; fumbled = bashed the competitor, dodged, or claimed to beat it on everything' },
    summary: { type: 'string', description: 'Max 40 words' },
    coaching: { type: 'array', items: { type: 'string' }, description: 'Up to 5 points, max 30 words each, each quoting the line it is about and what a stellar seller would have said instead' },
  },
};

const LEADING = /\b(wouldn'?t it be (great|nice)|don'?t you (hate|think|agree)|isn'?t it (annoying|frustrating)|you'?d agree|right\?$)/i;
const HYPOTHETICAL = /\b(would you (use|pay|buy|switch|consider|be interested|want)|if (we|i) (built|made|had|offered)|how much would you pay|would that (help|be useful)|do you think you'?d|could you see yourself)\b/i;
const FISHING = /\b(what do you think (of|about) (my|our|the) (idea|product)|do you like (it|the idea)|isn'?t (that|this) cool)\b/i;
const GOOD_Q = /\b(last time|walk me through|tell me about|how do you (currently|handle|deal)|what (do|did) you (use|try|do)|what did (that|it) cost|how much (time|money) (do|did|does)|who else|what happens if|why (is|was) that|how often did|when did that)\b/i;
const PITCH = /\b(our (product|platform|tool|solution|app)|we (built|offer|provide|help)|it (automatically|lets you)|feature|demo|let me show|our pricing)\b/i;
const NEXT = /\b(next (week|tuesday|monday|wednesday|thursday|friday)|follow[- ]?up|send (you|over)|trial|pilot|proposal|intro(duce)?|loop in|calendar invite|set up (a|the)|kick-?off|contract|onboard)\b/i;
const AGREE = /\b(sure|sounds good|ok(ay)?|yes|let'?s do|works for me|happy to|send it|i'?ll (intro|loop|check with))\b/i;

// Discovery-question topics: each earns credit once per call (operator-tiers audit fix 13: a turn stuffed with
// "last time / walk me through / who else / what happens if" used to score like four real questions).
export const Q_TOPICS = [
  ['past', /\b(last time|when did that|how often did)\b/i],
  ['process', /\b(walk me through|how do you (currently|handle|deal))\b/i],
  ['story', /\btell me about\b/i],
  ['tried', /\bwhat (do|did) you (use|try|do)\b/i],
  ['cost', /\b(what did (that|it) cost|how much (time|money) (do|did|does))\b/i],
  ['others', /\bwho else\b/i],
  ['consequence', /\bwhat happens if\b/i],
  ['why', /\bwhy (is|was) that\b/i],
];
const QSTOP = new Set(['about', 'their', 'there', 'which', 'would', 'could', 'should', 'these', 'those', 'where', 'really', 'things', 'thing', 'think', 'right', 'today', 'little', 'pretty', 'probably', 'honestly', 'actually', 'something', 'everything', 'usually', 'always', 'mostly', 'doesn', 'works', 'until', 'other', 'every', 'month', 'months', 'weeks', 'years']);
const content = (s) => new Set(String(s).toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !QSTOP.has(w)));

/**
 * Strong-question credits for the founder's turns. A turn earns at most 1 (only if it asks something, '?'), each
 * topic counts once per call, and a follow-up that picks up a word from the prospect's previous answer earns +0.5
 * (real follow-ups reference the answer). Stacking 3+ topics with 3+ question marks in one turn is flagged.
 * → { credits, topics: Set, followUps, stacked: [turnText] }
 */
export function questionCredits(transcript) {
  const seen = new Set();
  let credits = 0, followUps = 0;
  const stacked = [];
  let prevThem = null;
  for (const t of transcript) {
    if (t.from === 'them') { prevThem = t.text; continue; }
    const qm = (t.text.match(/\?/g) ?? []).length;
    const hits = Q_TOPICS.filter(([, re]) => re.test(t.text)).map(([id]) => id);
    if (hits.length >= 4 || (hits.length >= 3 && qm >= 3)) stacked.push(t.text);
    if (qm && hits.some((h) => !seen.has(h))) {
      credits += hits.length >= 3 && qm >= 3 ? 0.5 : 1;
      for (const h of hits) seen.add(h);
    }
    if (qm && prevThem) {
      const theirs = content(prevThem);
      const mine = content(t.text);
      if ([...mine].some((w) => theirs.has(w))) { credits += 0.5; followUps++; }
    }
    prevThem = null;
  }
  return { credits, topics: seen, followUps, stacked };
}

const meText = (transcript) => transcript.filter((t) => t.from === 'me').map((t) => t.text).join(' ');
const BASH = /\b(terrible|sucks|awful|garbage|outdated|clunky|overpriced|worse|nobody likes|dinosaur)\b/i;
const PROBE = /\b(what do you like|what made you (choose|pick)|why did you (choose|pick|go with)|how is .* working|what('s| is) missing|what would make you (switch|move)|what did you (like|not like)|how long have you)\b|\?/i;

/**
 * Scorecard schema for a deal's methodology: the MEDDPICC-lite flags plus one boolean per element of the method
 * (BANT, SPIN, value selling, MEDDPICC…). Strict: every property required, no extras.
 */
export function scorecardSchema(method) {
  if (!method?.elements?.length) return SCORECARD_SCHEMA;
  const props = Object.fromEntries(method.elements.map((e) => [e.id, { type: 'boolean', description: `${e.label}: e.g. "${e.probeQuestions[0]}"` }]));
  return {
    ...SCORECARD_SCHEMA,
    required: [...SCORECARD_SCHEMA.required, 'methodElements'],
    properties: { ...SCORECARD_SCHEMA.properties, methodElements: { type: 'object', additionalProperties: false, required: Object.keys(props), properties: props, description: `${method.label}: which elements this call established` } },
  };
}

/** Did the founder handle a competitor/current-tool mention well? competitors: names the prospect knows. */
export function competitiveHandling(transcript, competitors = []) {
  const names = competitors.filter(Boolean).map((n) => n.toLowerCase());
  const idx = transcript.findIndex((t) => t.from === 'them' && (names.some((n) => t.text.toLowerCase().includes(n)) || /\b(we already use|we use|already have|different from|compared to|vs\.?)\b/i.test(t.text)));
  if (idx < 0) return 'not_raised';
  const reply = transcript.slice(idx + 1).find((t) => t.from === 'me');
  if (!reply) return 'fumbled';
  if (BASH.test(reply.text) || /\b(better (than|at) everything|we beat|no comparison)\b/i.test(reply.text)) return 'fumbled';
  return PROBE.test(reply.text) ? 'handled' : words(reply.text) > 80 ? 'fumbled' : 'handled';
}

/** transcript: [{ from: 'me'|'them', text }] → scorecard (same shape as SCORECARD_SCHEMA). */
export function heuristicScorecard(transcript, { competitors = [] } = {}) {
  const me = transcript.filter((t) => t.from === 'me');
  const them = transcript.filter((t) => t.from === 'them');
  const meW = me.reduce((a, t) => a + words(t.text), 0);
  const themW = them.reduce((a, t) => a + words(t.text), 0);
  const talkRatio = meW + themW ? meW / (meW + themW) : 0.5;
  const questions = me.reduce((a, t) => a + (t.text.match(/\?/g) ?? []).length, 0);
  const violations = [];
  let good = 0, pitchedEarly = false, qsSoFar = 0;
  for (const t of me) {
    const q = t.text.slice(0, 80);
    if (LEADING.test(t.text)) violations.push(`Leading question: "${q}"`);
    if (HYPOTHETICAL.test(t.text)) violations.push(`Hypothetical/future question: "${q}"`);
    if (FISHING.test(t.text)) violations.push(`Fishing for compliments: "${q}"`);
    if (PITCH.test(t.text) && qsSoFar < 3 && !pitchedEarly) { pitchedEarly = true; violations.push(`Pitched before understanding the problem: "${q}"`); }
    if (words(t.text) > 90) violations.push(`Monologue (${words(t.text)} words)`);
    qsSoFar += (t.text.match(/\?/g) ?? []).length;
  }
  const qc = questionCredits(transcript);
  good = Math.floor(qc.credits);
  for (const x of qc.stacked) violations.push(`Stacked several questions in one turn: "${x.slice(0, 60)}"`);
  const all = transcript.map((t) => t.text).join(' ');
  const lastMe = me.slice(-2).map((t) => t.text).join(' ');
  const lastThem = them.slice(-1)[0]?.text ?? '';
  const nextStepSecured = NEXT.test(lastMe + ' ' + lastThem) && AGREE.test(lastThem) && !/keep me posted|i'?ll think about it|not sure/i.test(lastThem);
  const meddicc = {
    metrics: /\$\d|\b\d+ ?(hours?|days?|%|k\b|customers|people|patients)|\bhow (much|many)\b|\bwhat did (it|that) cost\b/i.test(all),
    economicBuyer: /\b(who (signs|decides|approves|else)|budget owner|your (boss|partner|cfo|ceo)|decision[- ]maker)/i.test(all),
    decisionCriteria: /\b(what would (it|you) need|must[- ]have|deal[- ]?breaker|criteria|compare|evaluat)/i.test(all),
    decisionProcess: /\b(process|procurement|security review|legal|sign[- ]off|how do you (buy|usually buy|decide))/i.test(all),
    paperProcess: /\b(security (review|questionnaire)|soc ?2|legal|procurement|purchasing|paperwork|insurance|vendor (portal|onboarding|approval)|rfp|bid|purchase order|w-?9|dpa|baa|ndpa|board (approval|meeting))\b/i.test(meText(transcript)),
    competition: /\b(who else|alternatives?|other (vendors?|tools?|options)|do nothing|in-house|build (it )?yourselves|compared? to)\b/i.test(meText(transcript)),
    pain: good >= 1 && them.some((t) => words(t.text) > 15),
    champion: nextStepSecured && /\b(intro|loop in|my (boss|team|partner))/i.test(all),
  };
  // Discovery quality = what the prospect actually told you. With a truth-grounded prospect (offline replies carry the
  // hidden facts they disclosed) it is the number of distinct real facts plus a next step; otherwise the strong-question
  // credits stand in. Mom Test violations and talk ratio are coaching only: they cost you because the prospect answers
  // a leading or hypothetical question with politeness, a pitch with a shrug, and a monologue with nothing.
  const facts = new Set(them.flatMap((t) => t.revealed ?? []));
  const truthGrounded = them.some((t) => Array.isArray(t.revealed));
  const raw = truthGrounded ? clamp(2 + 1.4 * Math.min(5, facts.size) + (them.some((t) => t.negative) ? 0.5 : 0), 1, 10) : clamp(2 + good * 1.6 + Math.min(2, questions * 0.3), 1, 10);
  // Offline heuristic = conservative fallback: shrink toward the median (audit 5.4), the LLM judge stays primary.
  const discoveryQuality = clamp(Math.round(5 + 0.8 * (raw - 5)), 1, 10);
  const maxMono = Math.max(0, ...me.map((t) => words(t.text)));
  const lastStrong = (them.filter((t) => words(t.text) > 15).length);
  const rubric = cleanRubric({
    pain_depth: 1 + (qc.topics.has('past') || qc.topics.has('story') ? 2 : 0) + (qc.topics.has('tried') ? 1 : 0) + (lastStrong >= 2 ? 1 : 0) - (qc.credits < 1 ? 1 : 0),
    question_craft: questions < 3 ? 1 : 1 + Math.min(3, qc.credits * 0.5) + (qc.followUps >= 2 ? 1 : 0), // coaching display; violations are listed, not deducted
    listening: me.length < 2 ? 1 : maxMono > 90 || talkRatio > 0.6 ? 1 : talkRatio > 0.45 ? 3 : talkRatio > 0.4 ? 4 : 5,
    quantified_impact: (meddicc.metrics ? 3 : 1) + (qc.topics.has('cost') ? 1 : 0) + (qc.topics.has('consequence') ? 1 : 0),
    stakeholders_process: 1 + [meddicc.economicBuyer, meddicc.decisionProcess, meddicc.paperProcess, meddicc.competition].filter(Boolean).length,
  }, SCORECARD_RUBRIC);
  const coaching = [];
  if (talkRatio > 0.45) coaching.push(`You talked ${Math.round(talkRatio * 100)}% of the time. Aim for under 40% on discovery calls.`);
  if (good < 2) coaching.push('Ask about specific past events: "Tell me about the last time…", "What did you try?", "What did that cost?"');
  if (violations.some((v) => v.startsWith('Hypothetical'))) coaching.push('Hypotheticals ("would you…") produce fluff. Ask what they actually did.');
  if (pitchedEarly) coaching.push('You pitched before you understood the problem. Earn the right to demo.');
  if (!nextStepSecured) coaching.push('No concrete next step. End by asking for a commitment: a dated follow-up, an intro, or a trial.');
  if (!meddicc.economicBuyer) coaching.push('You never found out who signs off.');
  if (qc.followUps === 0 && me.length >= 3) coaching.push('None of your questions built on what they just said. Follow up on their words ("you said the refunds slip: what happened last time?").');
  if (good < 6 || !nextStepSecured || talkRatio > 0.4) coaching.push('A stellar discovery call: 11-14 targeted questions about past events, dollars and time lost, the status quo and who else decides; one follow-up on each answer; under 40% talk time; ends with a dated next step and a recap within 24 hours.');
  const comp = competitiveHandling(transcript, competitors);
  if (comp === 'fumbled') { violations.push('Competitor raised and handled badly (bashing, dodging or a feature war)'); coaching.push('When they name a competitor: ask what they like about it and what is missing, then differentiate on one specific thing. Never bash it.'); }
  return {
    rubric, talkRatio: +talkRatio.toFixed(2), questionsAsked: questions, discoveryQuality, momTestViolations: violations.slice(0, 8),
    nextStepSecured, nextStep: nextStepSecured ? lastThem.slice(0, 120) : '', meddicc, competitiveHandling: comp,
    summary: `${me.length} founder turns, ${questions} questions, ${good} strong discovery questions, ${violations.length} Mom Test issues.`,
    coaching,
  };
}

// ---- Offline live-call prospect ----

export const CALL_REPLY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reply', 'engagement', 'agreedNextStep'],
  properties: {
    reply: { type: 'string', description: 'What you say next, in character, 1-4 sentences' },
    engagement: { type: 'number', description: '0-10 how engaged you are now' },
    agreedNextStep: { type: 'boolean', description: 'true only if you just agreed to a concrete next step' },
  },
};

// How a prospect says their own authority out loud (never the sales label).
const AUTHORITY_SAY = {
  'economic buyer': "It's my call in the end.",
  'budget influencer / likely champion': 'I can push for it, but someone above me approves the spend.',
  'champion without budget': "I'd recommend it, but I don't control the budget.",
  'end user with no buying authority': "I'd use it, but I don't buy software here.",
};
const u01 = (s) => (parseInt(hash(s), 36) % 100000) / 100000;
const streamOf = (seed) => { let i = 0; return () => u01(`${seed}:${i++}`); };
const pickH = (seed, arr) => arr[Math.floor(u01(seed) * arr.length) % arr.length];
/**
 * How this prospect's engagement moves after their own reply [design]: it follows what THEY experienced, not a label on
 * the question. Getting to talk about a problem they really have warms them up; a polite person enjoys agreeing; someone
 * without the problem loses interest when the call is about something they do not need; being asked the same thing
 * again or a wall of questions is tiring. Only a display and a tie-breaker: commitments come from the hidden person.
 */
export function engagementDelta(person, type, reply) {
  if (reply.repeat) return -0.4;
  if ((reply.revealed ?? []).length) return 0.5;
  if (reply.negative) return 0.1;
  if (type === 'stacked') return -0.3;
  if (reply.signal === 'agree') return (person?.politeness ?? 0.25) >= 0.55 ? 0.1 : 0;
  if (reply.signal === 'guarded') return person?.hasPain ? 0 : -0.3;
  if (type === 'small_talk') return 0.1;
  return person?.hasPain ? 0 : -0.1;
}
const DEMO = /\b(demo|let me show|share my screen|show you)\b/i;

/**
 * The offline prospect when there is a hidden person (personaFor(...).person): the same deterministic interviewee as
 * the research app (data/persona-prompts.js offlineAnswer), so a call answers what was asked, reveals one real fact per
 * good question, remembers what it already said (history[].revealed), never speaks sales jargon and agrees to a next
 * step only within what the person can honestly commit to. Demos are checked against what is live.
 */
function truthCallReply({ persona, text, engagement = 5, shipped = [], history = [], seed = '', priceMonthly = null }) {
  const person = { ...(persona.voiced ?? { ...persona.person, name: persona.name, role: persona.title }), hasPain: persona.hasPain ?? persona.person.hasPain };
  if (person.hasPain && !person.lastIncident) person.lastIncident = persona.lastIncident && !/^none/.test(persona.lastIncident) ? persona.lastIncident : `${persona.pain} caught us out recently`;
  const type = classifyQuestion(text, history);
  const sk = `${seed}:${history.length}`;
  let e = engagement;
  if (type === 'small_talk' && history.filter((m) => m.from === 'me').length >= 2) e -= 0.3; // still chatting ten minutes in
  if (type === 'pitch' && DEMO.test(text)) {
    e += person.hasPain ? 0 : -0.3; // a demo of something you do not need is a chore; a long one more so
    e -= words(text) > 60 ? 0.7 : 0;
    const live = shipped.slice(0, 2).map((f) => f.title);
    const reply = !live.length ? pickH(`${sk}:nodemo`, ["Wait, so this exists today or not? I can only look at what's actually live.", 'Is this a real product yet, or slides?', "I'd rather see it working than hear about it. What can I actually use today?"])
      : person.hasPain ? pickH(`${sk}:demo`, [`OK. So it does ${live.join(' and ')}? How is that different from ${persona.currentTools}?`, `Show me ${live[0]} on something like ours. That's where ${persona.currentTools} lets us down.`, `Hm, ${live[0]} I could use. What happens when it gets something wrong?`])
        : pickH(`${sk}:demo0`, [`Looks fine. Honestly, ${persona.currentTools} covers this for us.`, `OK. I'm not sure we'd use ${live[0]} much.`, 'Nice enough. Not something we struggle with, though.']);
    return { reply, engagement: clamp(e, 0, 10), agreedNextStep: false, revealed: [] };
  }
  const r = offlineAnswer(person, text, history, streamOf(sk), { price: priceMonthly });
  let reply = r.reply;
  if ((r.revealed ?? []).includes('decision') && persona.decisionProcess) reply += ` ${persona.decisionProcess[0].toUpperCase()}${persona.decisionProcess.slice(1)}.`;
  e += engagementDelta(person, type, r);
  // The next step is the person's own decision (offlineAnswer: real pain, authority, what they have told you so far).
  const committed = COMMITMENT_ORDER.indexOf(r.commitment) >= COMMITMENT_ORDER.indexOf('followup');
  return { reply, engagement: clamp(e, 0, 10), agreedNextStep: committed, revealed: r.revealed ?? [], negative: !!r.negative, signal: r.signal ?? null, commitment: r.commitment };
}

/**
 * One turn of the deterministic prospect. With a hidden person and the call `history` ([{ from, text, revealed }],
 * excluding this turn) it is the truth-grounded interviewee above; otherwise the legacy keyword prospect.
 */
export function heuristicCallReply({ persona, text, turn = 0, engagement = 5, shipped = [], price = '', goodQuestions = 0, history = null, seed = '', priceMonthly = null }) {
  if (persona?.person && Array.isArray(history)) return truthCallReply({ persona, text, engagement, shipped, history, seed, priceMonthly });
  const t = String(text);
  let e = engagement;
  let reply;
  let agreed = false;
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  if (words(t) <= 14 && /\b(hi|hello|hey|thanks for|how are you|how's your|how is your|nice to meet|good to meet)\b/i.test(t) && !GOOD_Q.test(t)) reply = 'Hi, good to meet you. I have about half an hour.';
  else if (HYPOTHETICAL.test(t)) { e -= persona.hasPain ? 0 : 0.2; reply = 'Maybe? Hard to say. Depends on a lot of things.'; }
  else if (LEADING.test(t)) { e -= persona.hasPain ? 0 : 0.2; reply = 'I guess, sure.'; }
  else if (/\b(price|cost|budget|pay|spend)\b/i.test(t) && /\?/.test(t) && !/\b(time|hours?|days?)\b/i.test(t)) {
    // Budget is a stance; a rough range only after good discovery (≥3 strong questions) and real pain.
    const range = persona.budgetRange ?? [Math.round(persona.budgetMonthly * 0.6), persona.budgetMonthly];
    reply = !persona.hasPain ? 'We would not budget for this right now.'
      : goodQuestions >= 3 ? `If it really fixed this, somewhere around $${range[0]}–${range[1]} a month. ${price ? `You said ${price}?` : ''}`.trim()
        : `Hard to say. ${persona.budgetStance ? persona.budgetStance[0].toUpperCase() + persona.budgetStance.slice(1) : 'Depends on the ROI'}.`;
  } else if (/\b(who (else|signs|decides|approves)|decision|sign off|procurement|process)\b/i.test(t)) {
    reply = `${cap(persona.decisionProcess)}. ${AUTHORITY_SAY[persona.authority] ?? ''}`.trim();
  } else if (GOOD_Q.test(t) || /\b(how|what|why|when)\b[^?]*\?/i.test(t)) {
    e += 0.7;
    // Answer what was asked (calibration miss 7: rotating answers by turn hid real pain from good discovery calls).
    const topic = /\b(last time|walk me through|tell me about|problem|happen|cost|hours?|time (did|does)|how much|incident|hard|painful)\b/i.test(t) ? 0
      : /\b(currently|today|use|tool|handle|deal with|tried|try)\b/i.test(t) ? 1
      : /\b(when|timeline|deadline|by when|soon)\b/i.test(t) ? 2
      : /\b(worr|concern|stop|risk|deal[- ]?breaker|switch|need to)\b/i.test(t) ? 3 : turn % 4;
    reply = persona.hasPain
      ? [`Honestly, ${persona.pain}. ${cap(persona.lastIncident)}.`, `Today we use ${persona.currentTools}. It works, mostly, until it doesn't.`, `Timeline-wise: ${persona.timeline}.`, `My worry: ${persona.objection}.`][topic]
      : [`It's not really a problem for us. We use ${persona.currentTools}.`, 'Not much to say, it runs fine.', `I'd say ${persona.timeline}.`, 'Not much to say, it runs fine.'][topic];
  } else if (PITCH.test(t) || /\b(demo|show)\b/i.test(t)) {
    e -= words(t) > 60 ? 1 : 0.3;
    reply = shipped.length
      ? `OK. So it does ${shipped.slice(0, 2).map((f) => f.title).join(' and ')}? How is that different from ${persona.currentTools}?`
      : 'Wait, so this exists today or not? I can only look at what\'s actually live.';
  } else if (NEXT.test(t)) {
    agreed = persona.hasPain && e >= 5;
    reply = agreed ? 'Sure. Send it over and put something in my calendar for next week.' : 'Just email me something. I\'ll take a look when I can.';
  } else reply = words(t) > 70 ? 'Sorry, you lost me there. What exactly are you asking?' : 'Mm-hm.';
  return { reply, engagement: clamp(e, 0, 10), agreedNextStep: agreed };
}

/** Strong discovery questions the founder has asked so far (for budget disclosure). */
export const countGoodQuestions = (transcript) => Math.floor(questionCredits(transcript).credits);
