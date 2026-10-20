// Meetings: the live call with a person you booked a meeting with (network contacts today; other apps keep their own
// rooms and are listed with Join links). The meeting happens in the calendar block's time (the calendar charges those
// hours); the contact remembers the messages you exchanged before; afterwards the notes are kept here, not in Messages.
// Pure logic, no DOM: grading, offline replies, outcome, summaries.

import { ensure } from '../../core/state.js';
import { ensureCalendar, completeEvent, fmtTime, weekdayName } from '../../core/calendar.js';
import { ensureNetwork, resolveInbound } from '../../core/network.js';
import { ensureMail } from '../../core/mail.js';
import { words, hash, rng, uid } from '../../core/util.js';
import { tierFromScore, logMistake } from '../../core/operator.js';
import { addInboundLead } from '../sales/crm-api.js';

export const GOOD_OUTCOMES = ['intro_customer', 'intro_investor', 'intro_partner', 'customer_lead', 'investor_meeting', 'press', 'hire', 'advice'];

// Chance a genuine opportunity actually turns into something after the call, by how the call was run. [design]
// No published benchmark exists for "networking call → follow-through"; the spread mirrors the discovery-call gap
// (Gong 2023: top reps ask 11-14 targeted questions and set a dated next step far more often than average reps).
export const REALIZE = { stellar: 0.95, good: 0.85, average: 0.7, mediocre: 0.45 };

export function ensureMeetings(state) {
  const m = ensure(state, 'meetings', () => ({ notes: [] }));
  m.notes ??= [];
  // Old saves: network calls were owned by Messages and pointed at the inbound record.
  for (const e of ensureCalendar(state).events) {
    if (e.app === 'messages' && typeof e.refId === 'string' && e.refId.startsWith('inb')) { e.inboundId = e.refId; e.app = 'meetings'; e.refId = e.id; }
  }
  return m;
}

const isMeeting = (e) => !['focus', 'personal', 'deadline'].includes(e.kind);
export const joinHref = (e) => (e.app === 'meetings' ? `#/meetings/${e.id}` : e.app ? `#/${e.app}/${e.refId ?? ''}` : null);
export const upcomingMeetings = (state) => ensureCalendar(state).events
  .filter((e) => isMeeting(e) && ['scheduled', 'in_progress'].includes(e.status) && e.day >= state.day)
  .sort((a, b) => a.day - b.day || a.start - b.start);
export const pastMeetings = (state, days = 45) => ensureCalendar(state).events
  .filter((e) => isMeeting(e) && !['scheduled', 'in_progress', 'canceled'].includes(e.status) && e.day >= state.day - days && e.day <= state.day)
  .sort((a, b) => b.day - a.day || b.start - a.start);

/** Everything the room needs: the event, the inbound contact, the person and what you said to each other before. */
export function meetingContext(state, eventId) {
  const ev = ensureCalendar(state).events.find((e) => e.id === eventId);
  if (!ev) return null;
  const n = ensureNetwork(state);
  const inb = ev.inboundId ? n.inbound.find((x) => x.id === ev.inboundId) : null;
  const person = inb ? n.people.find((p) => p.id === inb.personId) : null;
  let prior = [];
  if (inb?.threadId) {
    const t = inb.channel === 'email' ? ensureMail(state).threads.find((x) => x.id === inb.threadId) : n.threads.find((x) => x.id === inb.threadId);
    prior = (t?.messages ?? []).map((m) => ({ from: m.from === 'me' ? 'me' : 'them', body: m.body, day: m.day }));
  }
  const note = ensureMeetings(state).notes.find((x) => x.eventId === eventId) ?? null;
  const earlier = person ? ensureMeetings(state).notes.filter((x) => x.personId === person.id && x.eventId !== eventId && x.status === 'done') : [];
  return { ev, inb, person, prior, note, earlier };
}

export const meetingWhen = (state, ev) => `${ev.day === state.day ? 'today' : ev.day === state.day + 1 ? 'tomorrow' : weekdayName(state, ev.day)} at ${fmtTime(ev.start)}`;

// ---- A booked call is booked: the contact stops asking to schedule one ----
const CALL_ASK = /\b(call|calls|30 min(ute)?s?|15 min(ute)?s?|pick a slot|slot|week look|easier live|walk you through it live|zoom|calendar|invite|meet up|grab time|quick chat)\b/i;
export const stripCallAsk = (text) => String(text ?? '').split(/(?<=[.!?])\s+/).filter((s) => !CALL_ASK.test(s)).join(' ').trim();

/** After a call is booked (or held), a reply never asks for another one; it points at the booked time instead. */
export function fixRepeatAsk(state, inb, r) {
  const ev = inb?.eventId ? ensureCalendar(state).events.find((e) => e.id === inb.eventId) : null;
  if (!ev || ev.status === 'canceled') return r;
  const booked = ['scheduled', 'in_progress'].includes(ev.status);
  const asked = r.wantsCall || CALL_ASK.test(r.reply);
  if (!asked) return { ...r, wantsCall: false };
  const kept = stripCallAsk(r.reply);
  const tail = booked ? `Talk ${meetingWhen(state, ev)}.` : 'Thanks again for the call.';
  return { ...r, reply: kept ? `${kept} ${tail}` : tail, wantsCall: false };
}

export function bookedNote(state, inb) {
  const ev = inb?.eventId ? ensureCalendar(state).events.find((e) => e.id === inb.eventId) : null;
  if (!ev || ev.status === 'canceled') return '';
  if (['scheduled', 'in_progress'].includes(ev.status)) return ` A ${ev.duration}-minute video call with the founder is ALREADY booked for ${meetingWhen(state, ev)}; never ask to schedule a call or send another invite (wantsCall false). You can refer to that call.`;
  return ' You already had a call with the founder; do not ask for another one (wantsCall false).';
}

// ---- Offline in-call replies (deterministic per call and turn) ----
const choose = (key, arr) => arr[parseInt(hash(key), 36) % arr.length];
const OPEN = {
  customer_lead: ['Thanks for making time. So the short version: we do this by hand today, it eats a day a week across two people, and I am tired of it.', 'Appreciate it. We tried two tools last year and dropped both; I want to see if yours is different.'],
  intro_customer: ['Good to finally talk. I reached out because a couple of people I work with complain about exactly what you are building.'],
  intro_investor: ['Great to meet. I mostly wanted to hear the story; I know a few people on the investing side.'],
  intro_partner: ['Thanks for jumping on. Our customers keep asking whether we work with something like yours.'],
  investor_meeting: ['Thanks for taking the time. I have read the site; I would love to hear how you got here and who is using it.'],
  press: ['Thanks for doing this. I am putting together a piece on tools in this space and want a founder angle.'],
  hire: ['Thanks for the time. I have been following what you are building and I am looking for something early-stage.'],
  advice: ['Happy to help. Tell me where you are and what is keeping you up at night.'],
  waste: ['Thanks for hopping on! So we work with a lot of companies like yours and help them grow faster.', 'Great to connect! I wanted to learn more about you and share a bit about what we do.'],
  scam: ['Thanks for making time! We were really impressed with what you are building, and we think you are a perfect fit for our program.'],
};
const DETAIL = {
  customer_lead: 'Concretely: we are a team of about 20, two ops people spend Mondays reconciling this in spreadsheets, and our budget for tools like this is a few hundred a month.',
  intro_customer: 'The two I am thinking of both run ops at 30-50 person companies and both have this problem right now.',
  intro_investor: 'One is a seed partner who has done two deals in your space; she likes founders who show early pull.',
  intro_partner: 'We have about 400 customers and maybe a third of them would care about this integration.',
  investor_meeting: 'We write first checks of $250k-$1M. The partners will ask how your first customers found you and what retention looks like.',
  press: 'I need a first-hand story of the problem and one customer I can name, and I file in two weeks.',
  hire: 'Most recently I shipped the billing system at a 15-person startup; I can do a paid trial week so you can see the work.',
  advice: 'What we got wrong last time: we hired sales before we knew who bought. I would wait until you can close ten deals yourself.',
  waste: 'Every client is different, so it really depends on your goals. We have packages for every stage.',
  scam: 'It is a curated program; selected founders get featured in front of our investor network.',
};
const CLOSE = {
  customer_lead: 'If you can send me a trial link and a two-line summary I can forward, I will get both ops people on it this week.',
  intro_customer: 'Send me a short forwardable blurb and I will intro you to both of them.',
  intro_investor: 'Send me a three-sentence blurb and a deck link and I will forward it to her.',
  intro_partner: 'Let me loop in our partnerships lead by email so we can scope it.',
  investor_meeting: 'Send the deck and your last three months of numbers; if it holds up I will bring it to our Monday partner meeting.',
  press: 'Send me those answers by email by Friday and I will include you.',
  hire: 'If you want, send me a trial project and I will start next week.',
  advice: 'Ping me in a month with where you landed; happy to look at it again.',
  waste: 'Our starter package is $2,500 a month with a three-month minimum. I can send a proposal today!',
  scam: 'To lock in your spot we just need the participation fee this week. I will send the invoice after this call.',
};
const VAGUE = ['Sorry, what would you like to know?', 'Sure. What did you have in mind?', 'Okay. Where do you want to start?'];

export function offlineMeetingReply(state, inb, founderMsg, turn) {
  const k = `${inb?.id}:mtg:${turn}`;
  const o = inb?.outcome ?? 'waste';
  const m = String(founderMsg ?? '');
  if (turn === 0) return { reply: choose(k, OPEN[o] ?? OPEN.waste), wrap_up: false };
  if (words(m) < 5) return { reply: choose(k, VAGUE), wrap_up: turn >= 5 };
  const asks = /\?/.test(m) && /\b(what|why|how|who|when|which|tell me)\b/i.test(m);
  const proposes = NEXT.test(m);
  if (proposes || turn >= 3) return { reply: CLOSE[o] ?? CLOSE.waste, wrap_up: turn >= 3 };
  if (asks) return { reply: DETAIL[o] ?? DETAIL.waste, wrap_up: false };
  return { reply: GOOD_OUTCOMES.includes(o) ? 'Makes sense. What would you need from me?' : 'Love that! Honestly, that is exactly why we should work together.', wrap_up: false };
}

// ---- Grading: what the founder did on the call ----
const NEXT = /\b(send|intro|introduce|follow[- ]?up|next (week|step|steps)|by (mon|tues|wednes|thurs|fri)day|tomorrow|trial|pilot|demo|deck|forward|loop in|blurb)\b/i;
const COMMITS = /\b(sign me up|send (me )?(the|an) invoice|i'?ll pay|we'?ll pay|let'?s do (it|the package)|deal\b|count me in|book the package)\b/i;

/**
 * gradeMeeting({ transcript, agenda, outcome }) → { score, tier, evidence, feedback }.
 * Stellar: a written goal, a qualifying question early, real listening (talk share under ~60%), and a dated,
 * concrete next step for a real opportunity; or, for a time-waster, qualifying fast, not committing and ending early.
 * Volume does not help: repeated lines, one-word turns and questions under six words are ignored.
 */
export function gradeMeeting({ transcript = [], agenda = '', outcome = 'waste' }) {
  const seen = new Set();
  const turns = transcript.filter((m) => m.from === 'me').map((m) => String(m.body)).filter((b) => { const k = b.toLowerCase().replace(/\W+/g, ' ').trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  const evidence = [], feedback = [];
  if (!turns.length) return { score: 0.1, tier: 'mediocre', evidence: ['You joined and said nothing.'], feedback: ['Show up with one goal for the call and open with a question about them.'] };
  const sub = turns.filter((b) => words(b) >= 6);
  const qualifying = sub.slice(0, 2).some((b) => /\?/.test(b) && /\b(what|why|how|who|when|which)\b/i.test(b));
  const questions = sub.filter((b) => /\?/.test(b)).length;
  const nextStep = turns.slice(-2).some((b) => words(b) >= 8 && NEXT.test(b));
  const meW = turns.reduce((a, b) => a + words(b), 0);
  const themW = transcript.filter((m) => m.from === 'them').reduce((a, m) => a + words(m.body), 0);
  const share = meW / Math.max(1, meW + themW);
  const goal = words(agenda) >= 8;
  const bad = !GOOD_OUTCOMES.includes(outcome);
  let score;
  if (bad) {
    const committed = turns.some((b) => COMMITS.test(b));
    score = 0.15 + (goal ? 0.2 : 0) + (qualifying ? 0.3 : 0) + (turns.length <= 3 ? 0.3 : turns.length <= 5 ? 0.1 : -0.1) - (committed ? 0.4 : 0) - (nextStep ? 0.1 : 0);
    if (qualifying) evidence.push('Asked what they actually wanted early.'); else feedback.push('Ask in the first two minutes what exactly they want from you; vague answers are your signal to wrap up.');
    if (turns.length <= 3) evidence.push('Ended it quickly once it was not going anywhere.'); else feedback.push('This was not going anywhere: a stellar operator ends politely after two or three exchanges and gets the rest of the half hour back for real work.');
    if (committed) feedback.push('You agreed to buy or pay on the call. Never commit money on a first call with someone who reached out to you.');
    if (nextStep) feedback.push('You set up more time with someone who wastes it.');
  } else {
    score = 0.1 + (goal ? 0.2 : 0) + (qualifying ? 0.2 : 0) + 0.15 * Math.min(1, questions / 2) + (nextStep ? 0.25 : 0) + (share <= 0.6 ? 0.1 : share > 0.75 ? -0.1 : 0);
    if (goal) evidence.push('Went in with a written goal.'); else feedback.push('Write one line before the call: what do you want them to do afterwards?');
    if (qualifying) evidence.push('Opened with a real question about them.'); else feedback.push('Open with a question about their situation, not your pitch.');
    if (questions >= 2) evidence.push(`${questions} substantive questions.`); else feedback.push('Ask at least two specific questions (who, how many, what happened last time).');
    if (nextStep) evidence.push('Closed with a concrete next step.'); else feedback.push('End with a concrete, dated next step: who sends what by when. Without it, most warm calls go cold.');
    if (share > 0.75) feedback.push(`You did ${Math.round(share * 100)}% of the talking. Listen more than you pitch.`);
  }
  score = Math.max(0, Math.min(1, score));
  return { score, tier: tierFromScore(score), evidence, feedback };
}

export function offlineSummary(state, { ctx: c, transcript }) {
  const them = transcript.filter((m) => m.from === 'them').map((m) => m.body.split(/(?<=[.!?])\s+/)[0]).slice(0, 4);
  const steps = transcript.filter((m) => NEXT.test(m.body) && words(m.body) >= 6).map((m) => `${m.from === 'me' ? 'You' : c.person?.name ?? 'They'}: ${m.body}`).slice(-3);
  return {
    summary: `${c.ev.duration}-minute call with ${c.person?.name ?? c.ev.with?.name ?? 'the contact'}${c.person?.role ? ` (${c.person.role}${c.person.company ? `, ${c.person.company}` : ''})` : ''}. ${transcript.filter((m) => m.from === 'me').length} exchanges.`,
    keyPoints: them, nextSteps: steps,
  };
}

/** Start (or resume) the meeting record when you join. */
export function joinMeeting(state, eventId) {
  const c = meetingContext(state, eventId);
  if (!c) throw new Error('Meeting not found.');
  if (c.ev.day !== state.day || !['scheduled', 'in_progress'].includes(c.ev.status)) throw new Error('You can only join a meeting on its day.');
  c.ev.status = 'in_progress';
  let note = c.note;
  if (!note) {
    note = { id: uid('mtg'), eventId, inboundId: c.inb?.id ?? null, personId: c.person?.id ?? null, title: c.ev.title, with: c.person?.name ?? c.ev.with?.name ?? '', day: c.ev.day, start: c.ev.start, duration: c.ev.duration, agenda: c.ev.agenda ?? '', transcript: [], status: 'live' };
    ensureMeetings(state).notes.push(note);
  }
  return note;
}

/**
 * endMeeting(state, eventId, { judge }) closes the call: grade (offline heuristic, blended with an LLM judge when one
 * ran), notes, and the outcome. A real opportunity only turns into something as often as the call earns (REALIZE);
 * the rest go cold, which is logged as a mistake you can trace.
 */
export function endMeeting(state, eventId, { judge = null } = {}) {
  const c = meetingContext(state, eventId);
  if (!c?.note) throw new Error('Join the meeting first.');
  const note = c.note;
  if (note.status === 'done') return note;
  const g = gradeMeeting({ transcript: note.transcript, agenda: note.agenda, outcome: c.inb?.outcome ?? 'waste' });
  const score = judge && Number.isFinite(judge.score) ? 0.5 * g.score + 0.5 * Math.max(0, Math.min(1, judge.score)) : g.score;
  const tier = tierFromScore(score);
  const sum = offlineSummary(state, { ctx: c, transcript: note.transcript });
  Object.assign(note, {
    status: 'done', endedDay: state.day, score: Math.round(score * 100) / 100, tier, evidence: g.evidence,
    feedback: judge?.feedback?.length ? [...new Set([...judge.feedback, ...g.feedback])].slice(0, 5) : g.feedback,
    summary: judge?.summary || sum.summary, keyPoints: judge?.keyPoints?.length ? judge.keyPoints : sum.keyPoints,
    nextSteps: judge?.nextSteps?.length ? judge.nextSteps : sum.nextSteps, judged: !!judge,
  });
  completeEvent(state, eventId, 'done', tier);
  const inb = c.inb;
  if (inb && !inb.resolved) {
    if (GOOD_OUTCOMES.includes(inb.outcome) && rng(state) > REALIZE[tier]) {
      inb.resolved = true; inb.result = 'fizzled';
      note.result = 'went cold';
      note.resultText = `${c.person?.name ?? 'They'} never followed up. It was a real opportunity (${inb.outcome.replaceAll('_', ' ')}).`;
      logMistake(state, { functionId: 'founder_time', id: 'meeting_went_cold', label: 'A real opportunity went cold after the call', cost: { hours: c.ev.duration / 60 }, detail: `${note.resultText} Lesson: ${g.feedback[0] ?? 'Close every good call with a dated next step.'}`, app: 'meetings', key: `mtg_cold:${eventId}` });
    } else {
      const msg = resolveInbound(state, inb, { addInboundLead });
      note.result = (inb.result ?? inb.outcome).replaceAll('_', ' ');
      note.resultText = msg || '';
    }
  }
  return note;
}
