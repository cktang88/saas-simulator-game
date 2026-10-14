// Gong-lite call analysis (pure): talk ratio, questions, Mom Test violations, next step, MEDDICC-lite.
// Also a deterministic offline prospect for live calls. Rubric: docs/research/sales-and-research.md §4.
import { clamp, words } from '../../core/util.js';

export const SCORECARD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['talkRatio', 'questionsAsked', 'discoveryQuality', 'momTestViolations', 'nextStepSecured', 'nextStep', 'meddicc', 'summary', 'coaching'],
  properties: {
    talkRatio: { type: 'number', description: 'Founder share of words spoken, 0-1' },
    questionsAsked: { type: 'number' },
    discoveryQuality: { type: 'number', description: '1-10: did the founder uncover past behaviour, the real problem, its cost, current workaround?' },
    momTestViolations: { type: 'array', items: { type: 'string' }, description: 'Each leading / hypothetical / pitching / compliment-fishing moment, quoted briefly' },
    nextStepSecured: { type: 'boolean', description: 'A concrete, dated commitment from the prospect (meeting, intro, trial, pilot, payment). "Keep me posted" is NOT a next step.' },
    nextStep: { type: 'string' },
    meddicc: {
      type: 'object', additionalProperties: false,
      required: ['metrics', 'economicBuyer', 'decisionCriteria', 'decisionProcess', 'pain', 'champion'],
      properties: { metrics: { type: 'boolean' }, economicBuyer: { type: 'boolean' }, decisionCriteria: { type: 'boolean' }, decisionProcess: { type: 'boolean' }, pain: { type: 'boolean' }, champion: { type: 'boolean' } },
    },
    summary: { type: 'string' },
    coaching: { type: 'array', items: { type: 'string' } },
  },
};

const LEADING = /\b(wouldn'?t it be (great|nice)|don'?t you (hate|think|agree)|isn'?t it (annoying|frustrating)|you'?d agree|right\?$)/i;
const HYPOTHETICAL = /\b(would you (use|pay|buy|switch|consider|be interested|want)|if (we|i) (built|made|had|offered)|how much would you pay|would that (help|be useful)|do you think you'?d|could you see yourself)\b/i;
const FISHING = /\b(what do you think (of|about) (my|our|the) (idea|product)|do you like (it|the idea)|isn'?t (that|this) cool)\b/i;
const GOOD_Q = /\b(last time|walk me through|tell me about|how do you (currently|handle|deal)|what (do|did) you (use|try|do)|what did (that|it) cost|how much (time|money) (do|did|does)|who else|what happens if|why (is|was) that|how often did|when did that)\b/i;
const PITCH = /\b(our (product|platform|tool|solution|app)|we (built|offer|provide|help)|it (automatically|lets you)|feature|demo|let me show|our pricing)\b/i;
const NEXT = /\b(next (week|tuesday|monday|wednesday|thursday|friday)|follow[- ]?up|send (you|over)|trial|pilot|proposal|intro(duce)?|loop in|calendar invite|set up (a|the)|kick-?off|contract|onboard)\b/i;
const AGREE = /\b(sure|sounds good|ok(ay)?|yes|let'?s do|works for me|happy to|send it|i'?ll (intro|loop|check with))\b/i;

/** transcript: [{ from: 'me'|'them', text }] → scorecard (same shape as SCORECARD_SCHEMA). */
export function heuristicScorecard(transcript) {
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
    if (GOOD_Q.test(t.text)) good++;
    qsSoFar += (t.text.match(/\?/g) ?? []).length;
  }
  const all = transcript.map((t) => t.text).join(' ');
  const lastMe = me.slice(-2).map((t) => t.text).join(' ');
  const lastThem = them.slice(-1)[0]?.text ?? '';
  const nextStepSecured = NEXT.test(lastMe + ' ' + lastThem) && AGREE.test(lastThem) && !/keep me posted|i'?ll think about it|not sure/i.test(lastThem);
  const meddicc = {
    metrics: /\$\d|\b\d+ ?(hours?|days?|%|k\b|customers|people|patients)|\bhow (much|many)\b|\bwhat did (it|that) cost\b/i.test(all),
    economicBuyer: /\b(who (signs|decides|approves|else)|budget owner|your (boss|partner|cfo|ceo)|decision[- ]maker)/i.test(all),
    decisionCriteria: /\b(what would (it|you) need|must[- ]have|deal[- ]?breaker|criteria|compare|evaluat)/i.test(all),
    decisionProcess: /\b(process|procurement|security review|legal|sign[- ]off|how do you (buy|usually buy|decide))/i.test(all),
    pain: good >= 1 && them.some((t) => words(t.text) > 15),
    champion: nextStepSecured && /\b(intro|loop in|my (boss|team|partner))/i.test(all),
  };
  const discoveryQuality = clamp(Math.round(2 + good * 1.6 + Math.min(2, questions * 0.3) - violations.length * 0.8 - (talkRatio > 0.6 ? 2 : talkRatio > 0.45 ? 1 : 0)), 1, 10);
  const coaching = [];
  if (talkRatio > 0.45) coaching.push(`You talked ${Math.round(talkRatio * 100)}% of the time. Aim for under 40% on discovery calls.`);
  if (good < 2) coaching.push('Ask about specific past events: "Tell me about the last time…", "What did you try?", "What did that cost?"');
  if (violations.some((v) => v.startsWith('Hypothetical'))) coaching.push('Hypotheticals ("would you…") produce fluff. Ask what they actually did.');
  if (pitchedEarly) coaching.push('You pitched before you understood the problem. Earn the right to demo.');
  if (!nextStepSecured) coaching.push('No concrete next step. End by asking for a commitment: a dated follow-up, an intro, or a trial.');
  if (!meddicc.economicBuyer) coaching.push('You never found out who signs off.');
  return {
    talkRatio: +talkRatio.toFixed(2), questionsAsked: questions, discoveryQuality, momTestViolations: violations.slice(0, 8),
    nextStepSecured, nextStep: nextStepSecured ? lastThem.slice(0, 120) : '', meddicc,
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

/** One turn of the deterministic prospect. call: { engagement, revealed: [] } is mutated by the caller with the result. */
export function heuristicCallReply({ persona, text, turn = 0, engagement = 5, shipped = [], price = '' }) {
  const t = String(text);
  let e = engagement;
  let reply;
  let agreed = false;
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  if (HYPOTHETICAL.test(t)) { e -= 0.5; reply = 'Maybe? Hard to say. Depends on a lot of things.'; }
  else if (LEADING.test(t)) { e -= 0.5; reply = 'I guess, sure.'; }
  else if (/\b(price|cost|budget|pay|spend)\b/i.test(t) && /\?/.test(t)) {
    reply = persona.hasPain ? `We spend very little on this today apart from time. For something that actually fixed it, maybe around $${persona.budgetMonthly}/month. ${price ? `You said ${price}?` : ''}` : 'We would not budget for this right now.';
  } else if (/\b(who (else|signs|decides|approves)|decision|sign off|procurement|process)\b/i.test(t)) {
    reply = `${cap(persona.decisionProcess)}. I'm the ${persona.authority}.`;
  } else if (GOOD_Q.test(t) || /\b(how|what|why|when)\b[^?]*\?/i.test(t)) {
    e += 0.7;
    reply = persona.hasPain
      ? [`Honestly, ${persona.pain}. ${cap(persona.lastIncident)}.`, `Today we use ${persona.currentTools}. It works, mostly, until it doesn't.`, `Timeline-wise: ${persona.timeline}.`, `My worry: ${persona.objection}.`][turn % 4]
      : [`It's not really a problem for us. We use ${persona.currentTools}.`, 'Not much to say, it runs fine.', `I'd say ${persona.timeline}.`][turn % 3];
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
