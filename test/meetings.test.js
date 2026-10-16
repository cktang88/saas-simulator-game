import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack } from '../public/core/bank.js';
import { ensureNetwork, archetypes } from '../public/core/network.js';
import { ensureMail, addMessage } from '../public/core/mail.js';
import { ensureCalendar, scheduleEvent, clockNow } from '../public/core/calendar.js';
import messagesApp from '../public/apps/messages.js';
import { gradeMeeting, joinMeeting, endMeeting, meetingContext, fixRepeatAsk, ensureMeetings, REALIZE } from '../public/apps/meetings/model.js';

function fresh(seed = 7) { const s = newState({ companyName: 'Meet Co', model: 'smb', path: 'vc', founderName: 'Pat Lee', seed }); ensureStripe(s); ensureMarket(s); seedDefaultStack(s); return s; }
const offline = (s) => ({ state: s, llm: { ask: async (o) => ({ data: o.fallback(), mock: true }) } });

test('the clock moves with the work and flows around meetings', () => {
  const s = fresh();
  ensureCalendar(s).events.push({ id: 'ev_x', day: s.day, start: 10 * 60, duration: 60, kind: 'call', status: 'scheduled', charged: true });
  s.founder.dayOf = s.day; s.founder.dayUsed = 1; // the meeting only
  assert.equal(clockNow(s), 9 * 60, 'nothing done yet: start of the work day');
  s.founder.dayUsed = 3; // the meeting + 2h of work: 9-10 work, 10-11 meeting, 11-12 work
  assert.equal(clockNow(s), 12 * 60);
});

async function bookedLead(s, outcome = 'customer_lead') {
  const n = ensureNetwork(s);
  const a = archetypes().find((x) => x.category === 'customer' && (x.channel ?? 'email') === 'email');
  const inb = { id: 'inb_t1', archetypeId: a.id, category: a.category, channel: 'email', day: s.day, outcome, status: 'pending', personId: null, threadId: null, engaged: 0, resolved: false };
  n.inbound.push(inb);
  const ctx = offline(s);
  await messagesApp.jobs['network:inbound'](ctx, { inboundId: inb.id });
  const t = ensureMail(s).threads.find((x) => x.id === inb.threadId);
  addMessage(s, t.id, { from: 'me', body: 'Thanks for reaching out, happy to jump on a call and hear how your team handles this today.' });
  await messagesApp.jobs['reply:network'](ctx, { threadId: t.id, refId: inb.id });
  return { inb, t, ctx };
}

test('a booked call goes to Meetings, and the contact stops asking to schedule one', async () => {
  const s = fresh();
  const { inb, t, ctx } = await bookedLead(s);
  assert.ok(inb.eventId, 'call booked');
  const ev = ensureCalendar(s).events.find((e) => e.id === inb.eventId);
  assert.equal(ev.app, 'meetings');
  assert.equal(ev.refId, ev.id);
  addMessage(s, t.id, { from: 'me', body: 'Great, could we do a quick call to talk through it? What does your calendar look like this week?' });
  await messagesApp.jobs['reply:network'](ctx, { threadId: t.id, refId: inb.id });
  const last = t.messages.at(-1).body;
  assert.doesNotMatch(last, /pick a slot|week look|30 min|Calendar invite/i, last);
  assert.match(last, /Talk /);
  assert.equal(ensureCalendar(s).events.filter((e) => e.inboundId === inb.id).length, 1, 'no second invite');
  assert.equal(fixRepeatAsk(s, inb, { reply: 'Sure. Up for a 30 min call?', wantsCall: true }).wantsCall, false);
});

test('the meeting knows the earlier thread, runs in the booked block and keeps notes outside Messages', async () => {
  const s = fresh();
  const { inb } = await bookedLead(s);
  const ev = ensureCalendar(s).events.find((e) => e.id === inb.eventId);
  s.day = ev.day;
  const c = meetingContext(s, ev.id);
  assert.ok(c.prior.length >= 3, 'earlier messages are context');
  assert.throws(() => endMeeting(s, ev.id), /Join/);
  const note = joinMeeting(s, ev.id);
  assert.equal(ev.status, 'in_progress');
  note.agenda = 'Get them on a trial this week with both ops people using it.';
  note.transcript.push({ from: 'me', body: 'What does your team do today when this comes up, and who spends time on it?' }, { from: 'them', body: 'Two ops people, every Monday, spreadsheets and copy-paste for most of the day.' });
  note.transcript.push({ from: 'me', body: 'I will send you a trial link and a two-line summary by Tuesday so both of them can try it next week.' }, { from: 'them', body: 'Perfect, send it over.' });
  const done = endMeeting(s, ev.id);
  assert.equal(done.status, 'done');
  assert.ok(done.summary && done.nextSteps.length, 'summary and next steps kept');
  assert.equal(ev.status, 'done');
  assert.ok(inb.resolved);
  assert.equal(ensureMeetings(s).notes.length, 1);
  assert.equal(endMeeting(s, ev.id), done, 'ending twice is a no-op');
});

test('meeting operator tiers separate, and keyword stuffing or volume does not help', () => {
  const T = (...lines) => lines.flatMap(([me, them]) => [{ from: 'me', body: me }, { from: 'them', body: them ?? 'Okay, tell me more about that please.' }]);
  const goal = 'Get a trial started this week with both of their ops people.';
  const stellar = gradeMeeting({ outcome: 'customer_lead', agenda: goal, transcript: T(
    ['What happens today when this comes up, and who on your team handles it?', 'Two ops people spend every Monday reconciling spreadsheets by hand, it is painful.'],
    ['How many hours does that take them each week, and what did you try before?', 'About a day each; we tried two tools and dropped them because setup was too heavy.'],
    ['I will send a trial link and a two-line summary by Tuesday so both can try it next week.', 'Great.']) });
  const good = gradeMeeting({ outcome: 'customer_lead', agenda: '', transcript: T(
    ['What happens today when this comes up, and who on your team handles it?', 'Two ops people spend every Monday reconciling spreadsheets by hand, it is painful.'],
    ['I will send a trial link and a two-line summary by Tuesday so both can try it next week.', 'Great.']) });
  const average = gradeMeeting({ outcome: 'customer_lead', agenda: '', transcript: T(
    ['Thanks for joining, we built this to save teams a lot of time every week.'],
    ['How many hours does that take each week for your team right now?', 'About a day each.']) });
  const mediocre = gradeMeeting({ outcome: 'customer_lead', agenda: '', transcript: T(
    ['Our product is amazing and it automates everything you could ever imagine for your team, with AI, dashboards, integrations and a lot more coming soon.'], ['ok'], ['Cool']) });
  assert.ok(stellar.score > good.score && good.score > average.score && average.score > mediocre.score, JSON.stringify([stellar.score, good.score, average.score, mediocre.score]));
  assert.equal(stellar.tier, 'stellar');
  assert.equal(mediocre.tier, 'mediocre');
  assert.ok(mediocre.feedback.length >= 2, 'feedback says what a stellar founder would do');
  // Repeating the same question ten times is not ten questions.
  const spam = gradeMeeting({ outcome: 'customer_lead', agenda: '', transcript: T(...Array(10).fill(['Thanks for joining, we built this to save teams a lot of time every week.'])) });
  assert.ok(spam.score <= average.score);
  // With a time-waster, qualifying fast and ending beats a long friendly call where you agree to pay.
  const quick = gradeMeeting({ outcome: 'waste', agenda: goal, transcript: T(['What exactly would you want from us, and what does it cost?', 'It depends.'], ['Thanks, this is not a fit for us right now. Good luck.']) });
  const sucked = gradeMeeting({ outcome: 'waste', agenda: '', transcript: T(...Array(7).fill(0).map((_, i) => [`That sounds great, tell me more about part ${i} of the plan you mentioned.`]), ['Sounds good, sign me up and send the invoice.']) });
  assert.ok(quick.tier === 'stellar' || quick.tier === 'good');
  assert.equal(sucked.tier, 'mediocre');
  assert.ok(REALIZE.stellar > REALIZE.good && REALIZE.good > REALIZE.average && REALIZE.average > REALIZE.mediocre);
});

test('a badly run call loses real opportunities at a traceable cost, a well run one keeps them', async () => {
  let lost = { bad: 0, good: 0 };
  for (let seed = 1; seed <= 30; seed++) {
    for (const kind of ['bad', 'good']) {
      const s = fresh(seed);
      const { inb } = await bookedLead(s);
      const ev = ensureCalendar(s).events.find((e) => e.id === inb.eventId);
      s.day = ev.day;
      const note = joinMeeting(s, ev.id);
      if (kind === 'good') {
        note.agenda = 'Get them on a trial this week with both ops people using it.';
        note.transcript.push({ from: 'me', body: 'What does your team do today when this comes up, and who spends time on it?' }, { from: 'them', body: 'Two ops people every Monday, spreadsheets.' }, { from: 'me', body: 'How many hours a week is that, and what have you tried before for it?' }, { from: 'them', body: 'A day each; we tried two tools.' }, { from: 'me', body: 'I will send you a trial link and a short summary by Tuesday for both of them.' }, { from: 'them', body: 'Great.' });
      } else note.transcript.push({ from: 'me', body: 'cool' }, { from: 'them', body: 'Sorry, what would you like to know?' });
      const n = endMeeting(s, ev.id);
      if (n.result === 'went cold') { lost[kind]++; assert.ok((s.mistakes ?? []).some((m) => m.id === 'meeting_went_cold')); }
    }
  }
  assert.ok(lost.bad > lost.good + 5, JSON.stringify(lost));
});

test('old saves: network calls owned by Messages move to Meetings', () => {
  const s = fresh();
  const ev = scheduleEvent(s, { title: 'Call: X', kind: 'meeting', app: 'messages', refId: 'inb_n5', day: s.day + 2, start: 600, duration: 30 });
  ensureMeetings(s);
  assert.equal(ev.app, 'meetings');
  assert.equal(ev.inboundId, 'inb_n5');
  assert.equal(ev.refId, ev.id);
});
