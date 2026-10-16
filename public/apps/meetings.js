// Meetings: your video-call room and meeting notes. A call booked with someone runs here, in its calendar block's
// time (the calendar already charged those hours). The person on the other side remembers everything you exchanged
// before the call. When you end the call you get notes (summary, key points, next steps) and a read on how you ran it.
// Calls owned by other apps (sales discovery, investor pitches, interviews) are listed with Join links into them.

import { html, mount, on, formData, toast, badge } from '../core/ui.js';
import { REALISM } from '../core/llm.js';
import { fmtDate, words } from '../core/util.js';
import { fmtTime, clockNow } from '../core/calendar.js';
import { onInboundEngaged } from './assistant/triage.js';
import { bizBlock } from './context.js';
import { OUTCOME_GUIDE, companyBrief } from './messages.js';
import { ensureMeetings, meetingContext, joinMeeting, endMeeting, offlineMeetingReply, upcomingMeetings, pastMeetings, joinHref, meetingWhen } from './meetings/model.js';

const drafts = {};
const TIER_TONE = { stellar: 'good', good: 'good', average: 'warn', mediocre: 'bad' };
const AGENDA_HOURS = 0.1; // writing a one-line goal and skimming the thread before a call (~5 min)

const TURN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reply', 'wrap_up'],
  properties: { reply: { type: 'string' }, wrap_up: { type: 'boolean', description: 'True when you are wrapping up the call.' } },
};
const NOTES_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['score', 'summary', 'keyPoints', 'nextSteps', 'feedback'],
  properties: {
    score: { type: 'number', description: '0-100: how well the founder ran this call given what the other person really wanted.' },
    summary: { type: 'string' }, keyPoints: { type: 'array', items: { type: 'string' } },
    nextSteps: { type: 'array', items: { type: 'string' } }, feedback: { type: 'array', items: { type: 'string' }, description: 'What a stellar founder would have done differently, concrete.' },
  },
};

const lines = (s, person, msgs) => msgs.map((m) => `${m.from === 'me' ? `FOUNDER (${s.founder.name})` : `YOU (${person?.name})`}: ${m.body}`).join('\n');

async function theirTurn(ctx, c, note, said) {
  const s = ctx.state;
  const { person, inb } = c;
  const turn = note.transcript.filter((m) => m.from === 'me').length - 1;
  const res = await ctx.llm.ask({
    task: 'meeting_turn', context: bizBlock(s, 'public'),
    system: `${REALISM}\nYou are ${person?.name}, ${person?.role} at ${person?.company}. You are on a live ${c.ev.duration}-minute video call with the founder of ${s.company.name}, booked for ${fmtTime(c.ev.start)} after the messages below. You remember those messages. Your private agenda: ${person?.persona}. HIDDEN TRUTH about what you will really do: ${OUTCOME_GUIDE[inb?.outcome] ?? ''} Stay consistent with it; reveal it through what you say and do, not by announcing it. Speak as on a call: 1-4 sentences, natural. Never ask to schedule a call (you are on it). Answer specific questions specifically if your truth allows; vague questions get vague answers. After about six exchanges, wrap up.`,
    prompt: `${companyBrief(s)}\n\nWhat you exchanged before the call:\n${lines(s, person, c.prior.slice(-10)) || '(nothing)'}\n${c.earlier.length ? `\nEarlier calls: ${c.earlier.map((x) => x.summary).join(' | ')}\n` : ''}\nThe call so far:\n${lines(s, person, note.transcript)}\n\nWrite only YOUR next line as ${person?.name}.`,
    schema: TURN_SCHEMA, temperature: 0.8, maxTokens: 300,
    fallback: () => offlineMeetingReply(s, inb, said, turn),
  });
  return res.data;
}

async function judgeCall(ctx, c, note) {
  const s = ctx.state;
  if (!c.inb) return null;
  const res = await ctx.llm.ask({
    task: 'meeting_notes', context: bizBlock(s, 'public'),
    system: `${REALISM}\nYou are an experienced founder coach and a meeting notetaker. Write the notes for this call and grade how the founder ran it. What the other person really wanted (hidden from the founder): ${OUTCOME_GUIDE[c.inb.outcome] ?? ''} Stellar: a clear goal, qualifying questions early, listening more than pitching, a concrete dated next step for a real opportunity, or ending fast and politely with a time-waster and never committing money. Mediocre: pitching, vague small talk, no next step, or agreeing to pay. Never reveal the hidden truth in the notes.`,
    prompt: `Founder's goal for the call: ${note.agenda || '(none written)'}\n\nTranscript:\n${lines(s, c.person, note.transcript)}`,
    schema: NOTES_SCHEMA, temperature: 0.2, maxTokens: 700,
    fallback: () => null,
  });
  if (!res.data || res.mock) return null;
  return { ...res.data, score: Number(res.data.score) / 100 };
}

function renderRoom(root, ctx, eventId) {
  const s = ctx.state;
  const c = meetingContext(s, eventId);
  if (!c) { mount(root, html`<div class="app-head"><div><h1>Meeting</h1></div><div class="app-actions"><a class="btn" href="#/meetings">Back</a></div></div><p class="empty">That meeting no longer exists.</p>`); return; }
  const { ev, person, prior, note, earlier, inb } = c;
  const today = ev.day === s.day;
  const live = note?.status === 'live';
  const canJoin = today && ['scheduled', 'in_progress'].includes(ev.status) && !live && (!note || note.status !== 'done');
  const now = clockNow(s);
  const wrapping = live && note.wrapUp;
  mount(root, html`
    <div class="app-head"><div><h1>${live ? '🔴 ' : ''}${ev.title}</h1>
      <p>${person ? html`${person.role}${person.company ? ` · ${person.company}` : ''} · ` : ''}${fmtDate(s, ev.day)} ${fmtTime(ev.start)}–${fmtTime(ev.start + ev.duration)} · ${ev.location || 'Video call'}${today ? html` · it's ${fmtTime(Math.round(now / 5) * 5)} now` : ''}</p></div>
      <div class="app-actions"><a class="btn" href="#/meetings">All meetings</a></div></div>
    <div class="grid-2" style="grid-template-columns: minmax(240px,1fr) 2fr">
      <section class="panel">
        <h2>Context</h2>
        ${person ? html`<p class="small"><b>${person.name}</b>, ${person.role}${person.company ? ` at ${person.company}` : ''}. Reached you by ${inb?.channel ?? 'message'} on ${inb ? fmtDate(s, inb.day) : '?'}.</p>` : html`<p class="small muted">No contact attached to this calendar block.</p>`}
        <h3 class="small">Before the call</h3>
        ${prior.length ? html`<div class="chat" style="max-height:260px;overflow:auto">${prior.slice(-8).map((m) => html`<div class="msg ${m.from}">${m.body}</div>`)}</div>` : html`<p class="small muted">No messages before this call.</p>`}
        ${earlier.length ? html`<h3 class="small">Earlier calls</h3><ul class="list small">${earlier.map((x) => html`<li>${fmtDate(s, x.day)}: ${x.summary}</li>`)}</ul>` : ''}
        <h3 class="small">Your goal for this call</h3>
        ${note?.status === 'done' ? html`<p class="small">${note.agenda || html`<span class="muted">none written</span>`}</p>` : html`
          <form id="agendaForm"><textarea name="agenda" rows="2" placeholder="What do you want them to do after this call?">${note?.agenda ?? ev.agenda ?? ''}</textarea><button class="sm">Save goal (5 min)</button></form>`}
      </section>
      <section class="panel">
        ${!person && !note ? html`<p class="muted">This calendar block has no one on the other end in the game. Use it as time, not a call.</p>`
          : note?.status === 'done' ? notesView(s, note)
          : !today ? html`<p class="muted">This call is ${meetingWhen(s, ev)} (${fmtDate(s, ev.day)}). The time is blocked on your calendar. Come back on the day to join, and write your goal for the call beforehand.</p>`
          : ev.status === 'unattended' || ev.status === 'missed' ? html`<p class="callout bad">You missed this call.</p>`
          : html`
            ${canJoin ? html`<p>${now < ev.start ? `Starts at ${fmtTime(ev.start)}.` : now >= ev.start + ev.duration ? `This was due at ${fmtTime(ev.start)}; they are still waiting in the room.` : 'Starting now.'} The ${ev.duration} minutes are already on your calendar.</p><button class="primary" id="join">Join call</button>` : ''}
            ${live ? html`
              <div class="chat">${note.transcript.length ? note.transcript.map((m) => html`<div class="msg ${m.from}">${m.body}</div>`) : html`<p class="small muted">You're in. ${person?.name} is on. Say hello and steer the call.</p>`}</div>
              ${wrapping ? html`<p class="callout">${person?.name} is wrapping up. End the call to get your notes.</p>` : ''}
              <form id="sayForm" style="margin-top:8px"><textarea id="sayBody" name="body" rows="2" placeholder="Say something…" required>${drafts[eventId] ?? ''}</textarea>
                <div class="inline"><button class="primary">Say</button><button type="button" id="endCall">End call</button></div></form>` : ''}`}
      </section>
    </div>`);

  on(root, 'submit', '#agendaForm', (e) => {
    e.preventDefault();
    const { agenda } = formData(e.target);
    ctx.act((st) => {
      const x = meetingContext(st, eventId);
      x.ev.agenda = agenda;
      if (x.note) x.note.agenda = agenda;
    }, { hours: AGENDA_HOURS, label: 'Meeting prep' });
  });
  on(root, 'click', '#join', () => ctx.act((st) => { joinMeeting(st, eventId); })); // the calendar already charged the call's time
  on(root, 'input', '#sayBody', (e) => { drafts[eventId] = e.target.value; });
  on(root, 'submit', '#sayForm', async (e) => {
    e.preventDefault();
    const { body } = formData(e.target);
    delete drafts[eventId];
    await ctx.act(async (st) => {
      const x = meetingContext(st, eventId);
      x.note.transcript.push({ from: 'me', body });
      if (x.inb && words(body) >= 12) { x.inb.engaged++; onInboundEngaged(st, x.inb); }
      const r = await theirTurn(ctx, x, x.note, body);
      x.note.transcript.push({ from: 'them', body: r.reply });
      if (r.wrap_up) x.note.wrapUp = true;
    });
  });
  on(root, 'click', '#endCall', () => ctx.act(async (st) => {
    const x = meetingContext(st, eventId);
    const judge = await judgeCall(ctx, x, x.note).catch(() => null);
    const n = endMeeting(st, eventId, { judge });
    toast(n.resultText || 'Call ended. Notes saved in Meetings.', n.result === 'went cold' ? 'warn' : 'info');
  }));
}

function notesView(s, n) {
  return html`
    <h2>Notes ${n.tier ? badge(n.tier, TIER_TONE[n.tier]) : ''} ${n.judged ? '' : html`<span class="small muted">offline notes</span>`}</h2>
    <p>${n.summary}</p>
    ${n.keyPoints?.length ? html`<h3 class="small">Key points</h3><ul class="small">${n.keyPoints.map((k) => html`<li>${k}</li>`)}</ul>` : ''}
    ${n.nextSteps?.length ? html`<h3 class="small">Next steps</h3><ul class="small">${n.nextSteps.map((k) => html`<li>${k}</li>`)}</ul>` : html`<p class="small muted">No next step was agreed.</p>`}
    ${n.result ? html`<div class="callout ${n.result === 'went cold' ? 'bad' : ['waste', 'scam'].includes(n.result) ? '' : 'good'}">Outcome: ${n.result}${n.resultText ? html`. ${n.resultText}` : ''}</div>` : ''}
    ${n.evidence?.length ? html`<h3 class="small">What you did well</h3><ul class="small">${n.evidence.map((k) => html`<li>${k}</li>`)}</ul>` : ''}
    ${n.feedback?.length ? html`<h3 class="small">What a stellar founder would have done</h3><ul class="small">${n.feedback.map((k) => html`<li>${k}</li>`)}</ul>` : ''}
    <details><summary class="small">Transcript (${n.transcript.length} lines)</summary><div class="chat">${n.transcript.map((m) => html`<div class="msg ${m.from}">${m.body}</div>`)}</div></details>`;
}

export default {
  id: 'meetings',
  title: 'Meetings',
  icon: '🎥',
  group: 'Home',
  badge: (state) => upcomingMeetings(state).filter((e) => e.day === state.day).length || null,
  onDay(state) { ensureMeetings(state); },
  render(root, ctx) {
    const s = ctx.state;
    const m = ensureMeetings(s);
    const [tab = 'upcoming'] = (ctx.params || 'upcoming').split(':');
    if (ctx.params && (s.calendar?.events ?? []).some((e) => e.id === ctx.params)) return renderRoom(root, ctx, ctx.params);
    const up = upcomingMeetings(s);
    const past = pastMeetings(s);
    const notes = m.notes.filter((x) => x.status === 'done').slice().reverse();
    const row = (e) => {
      const href = joinHref(e);
      const note = m.notes.find((x) => x.eventId === e.id);
      return html`<tr><td class="small">${fmtDate(s, e.day)} ${fmtTime(e.start)}</td><td><b>${e.title}</b><div class="small muted">${e.duration} min · ${e.app ?? 'calendar'}</div></td>
        <td>${badge(e.status.replace('_', ' '), e.status === 'done' ? 'good' : ['missed', 'unattended', 'no_show'].includes(e.status) ? 'bad' : '')}${note?.tier ? html` ${badge(note.tier, TIER_TONE[note.tier])}` : ''}</td>
        <td>${href && e.day === s.day && ['scheduled', 'in_progress'].includes(e.status) ? html`<a class="btn sm primary" href="${href}">Join</a>` : href && e.app === 'meetings' ? html`<a class="btn sm" href="${href}">${note?.status === 'done' ? 'Notes' : 'Open'}</a>` : ''}</td></tr>`;
    };
    mount(root, html`
      <div class="app-head"><div><h1>Meetings</h1><p>Your video calls and meeting notes. A call takes its calendar block's time; the person remembers what you discussed before. Go in with a goal, ask before you pitch, and leave with a dated next step, or end a time-waster early.</p></div></div>
      <div class="tabs">${[['upcoming', `Upcoming (${up.length})`], ['notes', `Notes (${notes.length})`], ['past', 'Past']].map(([k, l]) => html`<a href="#/meetings/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${tab === 'upcoming' ? html`<section class="panel">${up.length ? html`<div class="table-wrap"><table><thead><tr><th>When</th><th>Meeting</th><th>Status</th><th></th></tr></thead><tbody>${up.map(row)}</tbody></table></div>` : html`<p class="empty">No meetings booked. Calls get booked from Messages, the CRM, Fundraising and Hiring.</p>`}</section>` : ''}
      ${tab === 'past' ? html`<section class="panel">${past.length ? html`<div class="table-wrap"><table><thead><tr><th>When</th><th>Meeting</th><th>Status</th><th></th></tr></thead><tbody>${past.map(row)}</tbody></table></div>` : html`<p class="empty">No past meetings in the last 45 days.</p>`}</section>` : ''}
      ${tab === 'notes' ? html`<section class="panel">${notes.length ? html`<ul class="list">${notes.map((n) => html`<li style="padding:10px 0"><a href="#/meetings/${n.eventId}"><b>${n.title}</b></a> <span class="small muted">${fmtDate(s, n.day)} ${fmtTime(n.start)}</span> ${n.tier ? badge(n.tier, TIER_TONE[n.tier]) : ''} ${n.result ? badge(n.result, n.result === 'went cold' ? 'bad' : '') : ''}
        <div class="small">${n.summary}</div>${n.nextSteps?.length ? html`<div class="small muted">Next: ${n.nextSteps.join(' · ')}</div>` : ''}</li>`)}</ul>` : html`<p class="empty">Notes from your calls appear here after you end them.</p>`}</section>` : ''}`);
  },
};
