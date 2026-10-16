// Customer research: Mom Test interview practice with AI personas (booked on the calendar, live chat with
// hidden facts, graded transcript), a form to log REAL interviews (the only evidence), and an insights
// board you can link to feature specs.
//
// Sources: docs/research/sales-and-research.md §4 (Mom Test, recruiting response rates, NN/G on
// synthetic users: rehearsal, never evidence; interview grading rubric).

import { html, mount, on, toast } from '../core/ui.js';
import { REALISM } from '../core/llm.js';
import { notify } from '../core/state.js';
import { logMistake } from '../core/operator.js';
import { scheduleEvent, findSlots, completeEvent, cancelEvent, ensureCalendar, fmtTime } from '../core/calendar.js';
import { rng, uid, fmtDate, pct, words, clamp } from '../core/util.js';
import { researchSlice, productSlice } from './product/store.js';
import { knownCompetitors, competitionBrief } from './marketworld/competitors.js';
import { criteriaSchema, hasScores, percent } from '../core/rubric-schema.js';
import { INTERVIEW_CRITERIA, INTERVIEW_RUBRIC, NOTES_CRITERIA, NOTES_RUBRIC } from './product/rubrics.js';
import { RECRUIT, INTERVIEW_MINUTES, FACT_KEYS, COMMITMENTS, COMMIT_LABEL, classifyQuestion, classifyQuestionLive, intervieweeSystem, makeFacts, fallbackReply, gradeTranscript, extractFromNotes, themeOf } from './product/interview.js';

const MAX_TURNS = 24; // ~45 minutes of conversation
const WRITEUP_HOURS = 0.25; // notes after a call [A]
const REHEARSAL_HOURS = 0.25; // an AI-persona rehearsal: no recruiting, no calendar (review P9)
const REAL_LOG_HOURS = 1; // 45-min real call + write-up
const FIRST = ['Dana', 'Marcus', 'Priya', 'Tom', 'Elena', 'Kofi', 'Lena', 'Raj', 'Sara', 'Jonas', 'Mei', 'Carlos'];
const LAST = ['Reyes', 'Hoffman', 'Shah', 'Becker', 'Okoro', 'Lind', 'Moreau', 'Ito', 'Walsh', 'Novak'];

// Module-level drafts so re-renders never wipe typing.
const chatDraft = {};
const EMPTY_LOG = () => ({ name: '', role: '', company: '', channel: 'warm', notes: '', commitments: [], email: '', transcript: '', bookingId: null });
let logDraft = EMPTY_LOG();
let bookDraft = { name: '', role: '', company: '', email: '', channel: 'warm', crm: '' };

// Warm-network interviews available [A]: ~1 per 10 close friends + 1 per 100 LinkedIn connections.
export const warmPool = (state) => Math.round((state.founder.network?.friends ?? 0) / 10 + (state.founder.network?.linkedin ?? 0) / 100);

const PERSONA_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['name', 'role', 'company', 'context', ...FACT_KEYS],
  properties: Object.fromEntries(['name', 'role', 'company', 'context', ...FACT_KEYS].map((k) => [k, { type: 'string' }])),
};
const CHAT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reply', 'revealed', 'commitment'],
  properties: {
    reply: { type: 'string' },
    revealed: { type: 'array', items: { type: 'string', enum: FACT_KEYS }, description: 'Hidden facts you disclosed in this reply' },
    commitment: { type: 'string', enum: COMMITMENTS, description: 'A commitment you made in THIS reply, else none' },
  },
};
const INSIGHT = { type: 'object', additionalProperties: false, required: ['theme', 'text', 'type'], properties: { theme: { type: 'string' }, text: { type: 'string' }, type: { type: 'string', enum: ['pain', 'workaround', 'spend', 'behavior', 'request', 'commitment'] } } };
export const INTERVIEW_GRADE_SCHEMA = criteriaSchema(INTERVIEW_CRITERIA, { extra: {
  leadingQuestions: { type: 'array', items: { type: 'string' } },
  hypotheticals: { type: 'array', items: { type: 'string' } },
  pitching: { type: 'array', items: { type: 'string' } },
  goodQuestions: { type: 'array', items: { type: 'string' } },
  insights: { type: 'array', items: INSIGHT },
  feedback: { type: 'string', description: '2-4 sentences of coaching: what a stellar interviewer would have asked instead, quoting the weakest question' },
} });
// Live and offline results are both criterion scores; the 0-100 score is computed by the game from fixed weights.
export const NOTES_SCHEMA = criteriaSchema(NOTES_CRITERIA, { extra: { insights: { type: 'array', items: INSIGHT }, issues: { type: 'array', items: { type: 'string' } } } });
const GRADER = `You grade customer-discovery interviews against The Mom Test (Fitzpatrick). Penalise leading questions, hypotheticals/future questions ("would you…"), pitching before the problem is understood, generic "do you usually" questions, founder talking more than ~30%, and compliments treated as validation. Credit questions about specific past behaviour ("tell me about the last time…"), current workarounds, money/time already spent, and ending with a commitment (intro, follow-up, pilot, LOI, pre-order). Extract only insights the interviewee actually stated; never infer. Length, fluency and confident wording earn nothing; only what the page shows counts.`;
export const GRADER_INTERVIEW = `${GRADER}\n${INTERVIEW_RUBRIC}`;
export const GRADER_NOTES = `${GRADER} You are reading a founder's own notes of a real call (self-reported): score only what the notes contain, and treat unspecific, round or invented-looking details as missing.\n${NOTES_RUBRIC}`;

function crmPeople(state) {
  const crm = state.apps.crm;
  if (!crm?.companies?.length) return [];
  const out = [];
  for (const c of crm.companies) {
    const contacts = (crm.contacts ?? []).filter((p) => p.companyId === c.id && !p.hidden);
    for (const p of contacts.length ? contacts : [{ id: null, name: null, title: null }]) out.push({ key: `${c.id}:${p.id ?? ''}`, company: c, contact: p });
  }
  return out.slice(0, 60);
}

// Rehearsal with an AI persona: starts immediately, no recruiting, no calendar, warm network untouched.
export async function createInterview(ctx, { source, crmKey }) {
  const state = ctx.state;
  const slice = researchSlice(state);
  const rand = () => rng(state);
  const crmP = source === 'crm' ? crmPeople(state).find((p) => p.key === crmKey) : null;
  const site = crmP ? String(crmP.company.website?.text ?? crmP.company.siteText ?? crmP.company.site?.text ?? crmP.company.description ?? '').slice(0, 1500) : '';
  const base = makeFacts(rand, { model: state.company.model, icp: state.company.icp || state.company.oneLiner });
  // Their real current tool comes from the actual competitive landscape (consistent per persona).
  const ivId = uid('iv');
  const known = knownCompetitors(state, { audience: state.company.model === 'b2c' ? 'consumer' : 'prospect', seed: crmP ? `crm:${crmKey}` : ivId, max: 4 });
  const uses = known.find((k) => k.relation === 'uses')?.competitor;
  if (uses) base.workaround = base.painReal ? `Uses ${uses.name}${uses.statusQuo ? '' : `${uses.pricingText && uses.pricingText !== 'unknown' ? ` (${uses.pricingText})` : ''}`} and patches the gaps by hand` : `Uses ${uses.name} and it is good enough`;
  const evaluated = known.filter((k) => k.relation === 'evaluated').map((k) => k.competitor.name);
  if (evaluated.length) base.decision += `; looked at ${evaluated.join(' and ')} before`;
  const brief = competitionBrief(state, known);
  const fbName = crmP?.contact?.name ?? `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
  const icp = state.company.icp || state.company.oneLiner || 'small businesses';
  const res = await ctx.llm.ask({
    task: 'interview_persona',
    system: 'You create realistic, specific interviewees for customer-discovery practice. Facts must be concrete (numbers, tools, dates) and internally consistent. Do not make them enthusiastic.',
    prompt: `Target customer profile: ${icp}\n${crmP ? `Real company: ${crmP.company.name}${crmP.company.domain ? ` (${crmP.company.domain})` : ''}. Contact: ${crmP.contact?.name ?? 'unknown'}, ${crmP.contact?.title ?? 'decision maker'}.\nTheir website says: ${site || '(not fetched)'}\n` : ''}Is the problem real and painful for this person right now? ${base.painReal ? 'YES: they have it, have hacked a workaround and spend time/money on it.' : 'NO: it is a minor annoyance; other priorities matter far more and they spend ~nothing on it.'}\n${brief ? `What they use and know today (keep this as their workaround/tool; do not invent other products): ${brief}\nCurrent workaround fact must be: ${base.workaround}.\n` : 'They know no dedicated tool for this; their workaround is manual.\n'}Return: name${crmP?.contact?.name ? ` (use "${crmP.contact.name}")` : ''}, role, company, one-line context, and hidden facts: lastTime (the last specific time they hit the problem), workaround, spend (money/time spent today), frequency, decision (who decides/buys), priorities (what matters more this quarter).`,
    schema: PERSONA_SCHEMA,
    temperature: 0.9,
    maxTokens: 600,
    fallback: () => ({ name: fbName, role: crmP?.contact?.title ?? (state.company.model === 'b2c' ? 'consumer in your target segment' : 'owner-operator'), company: crmP?.company.name ?? (state.company.model === 'b2c' ? '' : `${fbName.split(' ')[1]} & Co`), context: icp.slice(0, 160), ...Object.fromEntries(FACT_KEYS.map((k) => [k, base[k]])) }),
  });
  const p = res.data;
  const facts = { ...base, ...Object.fromEntries(FACT_KEYS.map((k) => [k, p[k] || base[k]])) };
  if (uses) facts.workaround = base.workaround; // ground truth from the market, whatever the LLM wrote
  const iv = {
    id: ivId, real: false, source, channel: 'rehearsal', crmCompanyId: crmP?.company.id ?? null, knows: known.map((k) => ({ name: k.competitor.name, relation: k.relation })),
    persona: { name: p.name || fbName, role: p.role, company: p.company, context: p.context, site, facts },
    status: 'live', day: state.day, messages: [{ from: 'them', text: `Hi, this is ${p.name || fbName}. I've got a few minutes. What did you want to ask?`, revealed: [], commitment: 'none' }], grade: null, createdDay: state.day, mock: res.mock,
  };
  slice.interviews.unshift(iv);
  return iv;
}

// Outreach hours per BOOKED call: messages for one reply ÷ the reply rate (calibration.md R7): warm ~0.6 h,
// community ~2 h, cold ~14 h. Intros spend a banked introduction and cost like warm outreach.
export function recruitHours(channel) {
  const r = RECRUIT[channel === 'intro' ? 'warm' : channel];
  return r ? Math.round((r.hours / r.response) * 100) / 100 : 1;
}

// A REAL interview: recruit (warm pool / intros / community / cold) and book it on the calendar. The call
// happens in real life; afterwards the founder logs notes (the only path that counts as evidence).
// Hours for ONE recruiting attempt (a batch of outreach messages). A booked call needs hours / response on average
// (recruitHours); bookReal rolls the response, so a failed attempt burns these hours and a warm/intro slot.
export const attemptHours = (channel) => RECRUIT[channel === 'intro' ? 'warm' : channel]?.hours ?? 1;

// Day-before confirmation: a short reminder message cuts interviewee no-shows [design: ~20% unconfirmed vs ~7% confirmed].
export const NO_SHOW_P = { unconfirmed: 0.2, confirmed: 0.07 };
export function confirmInterview(state, id) {
  const iv = researchSlice(state).interviews.find((x) => x.id === id);
  if (!iv || iv.status !== 'scheduled' || !iv.real) throw new Error('Nothing to confirm.');
  if (state.day >= iv.day) throw new Error('Too late: confirm the day before.');
  iv.confirmedDay = state.day;
  return iv;
}
const wasConfirmed = (iv) => iv.confirmedDay != null && iv.confirmedDay >= iv.day - 2 && iv.confirmedDay < iv.day;

export function bookReal(state, d) {
  const slice = researchSlice(state);
  const channel = d.channel;
  const r = RECRUIT[channel === 'intro' ? 'warm' : channel];
  if (!r) throw new Error('Pick how you recruited them.');
  if (!String(d.name ?? '').trim()) throw new Error('Who are you talking to? Add their name.');
  if (channel === 'intro') { if (slice.introCredits < 1) throw new Error('No introductions banked. Ask interviewees for intros.'); slice.introCredits--; }
  if (channel === 'warm') { if ((slice.warmUsed ?? 0) >= warmPool(state)) throw new Error('You have asked everyone in your warm network already. Use communities, cold outreach, or intros.'); slice.warmUsed = (slice.warmUsed ?? 0) + 1; }
  // The recruiting attempt can fail: response rates by channel (RECRUIT.response). Warm/intro slots are spent either way.
  if (rng(state) >= r.response) {
    const miss = { id: uid('iv'), real: true, booked: false, source: 'real', channel, persona: { name: d.name.trim(), role: d.role, company: d.company }, status: 'no-reply', messages: [], grade: null, createdDay: state.day, day: state.day };
    slice.interviews.unshift(miss);
    notify(state, `${miss.persona.name} never replied (${Math.round(r.response * 100)}% of ${r.label.toLowerCase()} outreach does). Try another batch or another channel.`, { type: 'warn', app: 'research' });
    return miss;
  }
  const [lo, hi] = r.days;
  const fromDay = state.day + lo + Math.floor(rng(state) * (hi - lo + 1));
  const slot = findSlots(state, { fromDay, duration: INTERVIEW_MINUTES, count: 1 })[0];
  if (!slot) {
    // Nothing was booked: give back the warm/intro slot (the action is rejected and its hours refunded).
    if (channel === 'intro') slice.introCredits++;
    if (channel === 'warm') slice.warmUsed--;
    throw new Error('No free 45-minute slot in the next month. Clear some calendar time.');
  }
  const iv = { id: uid('iv'), real: true, booked: true, source: 'real', channel, persona: { name: d.name.trim(), role: d.role, company: d.company }, email: d.email?.trim() || null, status: 'scheduled', messages: [], grade: null, createdDay: state.day };
  const ev = scheduleEvent(state, { title: `Customer interview: ${iv.persona.name}${iv.persona.company ? ` (${iv.persona.company})` : ''}`, kind: 'interview', app: 'research', refId: iv.id, with: { name: iv.persona.name, email: iv.email }, day: slot.day, start: slot.start, duration: INTERVIEW_MINUTES, notes: 'Real customer discovery call. Ask about the past, not the future. Log your notes afterwards.' });
  Object.assign(iv, { eventId: ev.id, day: slot.day, start: slot.start });
  slice.interviews.unshift(iv);
  return iv;
}

export async function sendTurn(ctx, iv, text) {
  const state = ctx.state;
  const history = iv.messages.slice();
  const mine = { from: 'me', text, tags: classifyQuestion(text) };
  iv.messages.push(mine);
  const tagging = classifyQuestionLive(ctx.llm, text, { previousReply: history.filter((m) => m.from === 'them').at(-1)?.text ?? '' });
  const f = iv.persona.facts;
  const transcript = iv.messages.slice(-14).map((m) => `${m.from === 'me' ? 'FOUNDER' : 'YOU'}: ${m.text}`).join('\n');
  const res = await ctx.llm.ask({
    task: 'interview_chat',
    system: intervieweeSystem(iv.persona),
    prompt: `${transcript}\n\nReply as ${iv.persona.name} to the founder's last message.`,
    schema: CHAT_SCHEMA,
    temperature: 0.8,
    maxTokens: 300,
    fallback: () => fallbackReply(iv.persona, history, text),
  });
  mine.tags = (await tagging).tags;
  const d = res.data;
  if (!f.painReal && ['intro', 'pilot', 'loi', 'preorder'].includes(d.commitment)) d.commitment = 'followup'; // keep the game's ground truth: no pain, at most a polite follow-up
  const goodTurns = iv.messages.filter((m) => m.from === 'me' && (m.tags ?? []).includes('good')).length;
  if (d.commitment === 'preorder' && !(f.painReal && goodTurns >= 4 && (f.spendNum ?? 0) >= 200)) d.commitment = 'pilot'; // pre-orders are rare and earned
  iv.messages.push({ from: 'them', text: d.reply, revealed: (d.revealed ?? []).filter((k) => FACT_KEYS.includes(k)).slice(0, 1), commitment: d.commitment ?? 'none', mock: res.mock });
}

export async function finishInterview(ctx, iv) {
  const state = ctx.state;
  const slice = researchSlice(state);
  const h = gradeTranscript(iv.messages, iv.persona);
  const transcript = iv.messages.map((m) => `${m.from === 'me' ? 'FOUNDER' : 'INTERVIEWEE'}: ${m.text}`).join('\n').slice(0, 9000);
  const res = await ctx.llm.panel({
    task: 'interview_grade', rubric: INTERVIEW_CRITERIA, system: GRADER_INTERVIEW, prompt: `Transcript:\n${transcript}`, schema: INTERVIEW_GRADE_SCHEMA, temperature: 0.2, maxTokens: 1800,
    fallback: () => h, cache: state.cache,
  });
  const live = res.filter((r) => !r.mock);
  const pickLive = live[0]?.data ?? h;
  const scoreOf = (r) => (!r.mock && hasScores(r.data, INTERVIEW_CRITERIA) ? percent(r.data, INTERVIEW_CRITERIA) : Number(r.data.score) || 0);
  const score = Math.round(clamp(res.reduce((a, r) => a + scoreOf(r), 0) / res.length, 0, 100));
  iv.grade = {
    score, talkRatio: h.talkRatio, commitments: h.commitments,
    leadingQuestions: pickLive.leadingQuestions ?? [], hypotheticals: pickLive.hypotheticals ?? [], pitching: pickLive.pitching ?? [], goodQuestions: pickLive.goodQuestions ?? [],
    feedback: pickLive.feedback, source: live.length ? 'LLM panel' : 'offline heuristic', pastSpecifics: h.pastSpecifics,
  };
  iv.status = 'done';
  iv.doneDay = state.day;
  if (iv.eventId) completeEvent(state, iv.eventId, 'done', `score ${score}`);
  for (const i of (pickLive.insights ?? []).slice(0, 8)) slice.insights.unshift({ id: uid('ins'), interviewId: iv.id, theme: i.theme || themeOf(i.text), text: i.text, type: i.type, real: false, who: `${iv.persona.name} (AI persona)`, day: state.day });
  notify(state, `Rehearsal with ${iv.persona.name}: Mom Test score ${score}/100${h.commitments.length ? `, commitment: ${COMMIT_LABEL[h.commitments[0]]}` : ', no commitment'}.`, { type: score >= 65 ? 'good' : 'info', app: 'research' });
}

// Real-interview notes must contain specifics (review P4). Returns an error message or null.
export function notesProblem(notes) {
  if (words(notes) < 40) return 'Write real notes (40+ words): what they did, spent and said.';
  if (!/\d/.test(notes)) return 'Real notes have specifics: a number (hours, $, how many clients, how often).';
  if (!/\b(last|ago|yesterday|spent|paid|tried|used|did|lost|switched|hired|built|uses|currently)\b/i.test(notes)) return 'Note at least one thing they actually did or use today (past behaviour), not opinions.';
  return null;
}

export async function logReal(ctx, d) {
  const state = ctx.state;
  const slice = researchSlice(state);
  const problem = notesProblem(d.notes);
  if (problem) throw new Error(problem);
  const booking = d.bookingId ? slice.interviews.find((x) => x.id === d.bookingId) : null;
  // Honor system: full credit only with a held calendar booking + attendee email, or a transcript/recording note.
  const verified = Boolean((booking && (booking.email || d.email) && /\S+@\S+\.\S+/.test(booking.email || d.email)) || words(d.transcript ?? '') >= 3);
  const commitments = d.commitments.filter((c) => COMMITMENTS.includes(c) && c !== 'none');
  const fb = extractFromNotes(d.notes, commitments);
  const res = await ctx.llm.ask({
    task: 'interview_notes', rubric: NOTES_CRITERIA, system: GRADER_NOTES,
    prompt: `Notes from a REAL customer interview with ${d.name}, ${d.role} at ${d.company}. Commitments recorded: ${commitments.join(', ') || 'none'}.\n\n${d.notes.slice(0, 6000)}\n\nExtract insights (only what the interviewee said or did), score the rubric from what the notes show, and list Mom Test issues.`,
    schema: NOTES_SCHEMA, temperature: 0.2, maxTokens: 1500, fallback: () => fb, cache: state.cache,
  });
  const grade = { score: Math.round(clamp(!res.mock && hasScores(res.data, NOTES_CRITERIA) ? percent(res.data, NOTES_CRITERIA) : Number(res.data.quality) || 0, 0, 100)), commitments, issues: res.data.issues ?? [], source: res.mock ? 'offline heuristic' : 'LLM', selfReported: true };
  let iv;
  if (booking) {
    iv = booking;
    Object.assign(iv, { notes: d.notes, status: 'done', doneDay: state.day, grade, verified, transcript: d.transcript || null });
    if (iv.eventId) completeEvent(state, iv.eventId, 'done', 'notes logged');
  } else {
    iv = { id: uid('iv'), real: true, source: 'real', channel: d.channel, persona: { name: d.name, role: d.role, company: d.company }, email: d.email || null, transcript: d.transcript || null, notes: d.notes, status: 'done', createdDay: state.day, doneDay: state.day, grade, verified };
    slice.interviews.unshift(iv);
  }
  const ins = [...(res.data.insights ?? []), ...(res.mock ? [] : commitments.map((c) => ({ theme: 'Commitments', type: 'commitment', text: COMMIT_LABEL[c] })))];
  for (const i of ins.slice(0, 10)) slice.insights.unshift({ id: uid('ins'), interviewId: iv.id, theme: i.theme || themeOf(i.text), text: i.text, type: i.type, real: true, verified, who: `${iv.persona.name}${iv.persona.company ? `, ${iv.persona.company}` : ''}`, day: state.day });
  if (commitments.includes('intro')) slice.introCredits++;
  return iv;
}

// ---- UI ----

function listView(ctx, slice) {
  const s = ctx.state;
  const real = slice.interviews.filter((i) => i.real);
  const synth = slice.interviews.filter((i) => !i.real && i.status === 'done');
  const commits = slice.interviews.flatMap((i) => i.grade?.commitments ?? []);
  const crm = crmPeople(s);
  const warmLeft = Math.max(0, warmPool(s) - (slice.warmUsed ?? 0));
  return html`
    <div class="callout warn small"><b>Synthetic interviews are rehearsal, not evidence.</b> AI personas idealise behaviour and are too agreeable (NN/G, 2024–2025). Use them to practise Mom Test questions and pressure-test your script. Only <b>real</b> conversations, logged below, count as evidence in spec reviews.</div>
    <div class="stats">
      <div class="stat"><div class="stat-label">Real interviews</div><div class="stat-value">${real.length}</div><div class="stat-sub">5–10 per narrow segment; 20–30 before big bets</div></div>
      <div class="stat"><div class="stat-label">Rehearsals</div><div class="stat-value">${synth.length}</div><div class="stat-sub">avg score ${synth.length ? Math.round(synth.reduce((a, i) => a + i.grade.score, 0) / synth.length) : '—'}</div></div>
      <div class="stat"><div class="stat-label">Commitments</div><div class="stat-value">${commits.length}</div><div class="stat-sub">${commits.map((c) => COMMIT_LABEL[c]).slice(0, 3).join(', ') || 'none yet'}</div></div>
      <div class="stat"><div class="stat-label">Intros banked</div><div class="stat-value">${slice.introCredits}</div><div class="stat-sub">warm network left: ${warmLeft}</div></div>
    </div>
    <div class="grid-3">
      <section class="panel">
        <h2>Rehearse with an AI persona</h2>
        <form id="newIv">
          <label>Who <select name="who"><option value="icp">A persona from your ICP</option>${crm.map((p) => html`<option value="crm|${p.key}">${p.contact?.name ? `${p.contact.name}, ` : ''}${p.company.name} (CRM, AI-played)</option>`)}</select></label>
          <button class="primary">Start rehearsal (${Math.round(REHEARSAL_HOURS * 60)} min)</button>
        </form>
        <p class="hint">Practice your script. No recruiting, no calendar, and it never counts as evidence.</p>
      </section>
      <section class="panel">
        <h2>Book a real interview</h2>
        <form id="bookForm">
          ${crm.length ? html`<label>From CRM <select id="bk-crm" data-book="crm"><option value="">—</option>${crm.map((p) => html`<option value="${p.key}" ${bookDraft.crm === p.key ? 'selected' : ''}>${p.contact?.name ? `${p.contact.name}, ` : ''}${p.company.name}</option>`)}</select></label>` : ''}
          <div class="grid-2"><label>Name <input id="bk-name" data-book="name" value="${bookDraft.name}" /></label><label>Email <input id="bk-email" data-book="email" type="email" value="${bookDraft.email}" /></label></div>
          <div class="grid-2"><label>Role <input id="bk-role" data-book="role" value="${bookDraft.role}" /></label><label>Company <input id="bk-company" data-book="company" value="${bookDraft.company}" /></label></div>
          <label>Recruit via <select id="bk-channel" data-book="channel">
            ${slice.introCredits ? html`<option value="intro" ${bookDraft.channel === 'intro' ? 'selected' : ''}>Intro from a past interviewee (${slice.introCredits} left)</option>` : ''}
            ${Object.entries(RECRUIT).map(([k, r]) => html`<option value="${k}" ${bookDraft.channel === k ? 'selected' : ''} ${k === 'warm' && !warmLeft ? 'disabled' : ''}>${r.label}: ~${recruitHours(k) < 2 ? `${Math.round(recruitHours(k) * 60)} min` : `${recruitHours(k)} h`} of outreach per booked call (~${pct(r.response, 0)} reply), call in ${r.days[0]}–${r.days[1]} days</option>`)}
          </select></label>
          <button class="primary">Recruit & book</button>
        </form>
        <p class="hint">Outreach time is charged now; the ${INTERVIEW_MINUTES}-min call goes on your calendar (hours charged that day). Have the conversation for real, then log your notes.</p>
      </section>
      <section class="panel">
        <h2>Log a real interview</h2>
        ${logDraft.bookingId ? html`<p class="small"><span class="badge good">booked call</span> Logging notes for ${logDraft.name}. <a href="#" id="unlinkLog">not this one</a></p>` : ''}
        <form id="realForm">
          <div class="grid-2"><label>Name <input id="rl-name" data-log="name" value="${logDraft.name}" required /></label><label>Role <input id="rl-role" data-log="role" value="${logDraft.role}" /></label></div>
          <div class="grid-2"><label>Company <input id="rl-company" data-log="company" value="${logDraft.company}" /></label>
            <label>Recruited via <select id="rl-channel" data-log="channel">${Object.entries(RECRUIT).map(([k, r]) => html`<option value="${k}" ${logDraft.channel === k ? 'selected' : ''}>${r.label}</option>`)}</select></label></div>
          <label>Notes <span class="hint">40+ words: the last time it happened, what they use today, what it costs (numbers), quotes</span><textarea id="rl-notes" data-log="notes" rows="5">${logDraft.notes}</textarea></label>
          <div class="grid-2"><label>Attendee email <input id="rl-email" data-log="email" type="email" value="${logDraft.email}" /></label><label>Recording / transcript reference <input id="rl-transcript" data-log="transcript" value="${logDraft.transcript}" placeholder="e.g. Granola note 'Dana – Oct 12'" /></label></div>
          <div class="small">Commitments: ${COMMITMENTS.filter((c) => c !== 'none').map((c) => html`<label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="display:inline-block;margin:3px 0 0;flex:none" type="checkbox" data-commit="${c}" ${logDraft.commitments.includes(c) ? 'checked' : ''} /> ${COMMIT_LABEL[c]}</label>`)}</div>
          <button class="primary">Log interview (${logDraft.bookingId ? `${Math.round(WRITEUP_HOURS * 60)} min` : `${REAL_LOG_HOURS} h`})</button>
        </form>
        <p class="small muted"><b>Honor system.</b> The game can't check that a real conversation happened. Self-reported notes count half in spec reviews; notes from a booked call with the attendee's email, or with a recording/transcript reference, count fully. Faking it only fools you.</p>
      </section>
    </div>
    <section class="panel"><h2>Interviews</h2>
      ${slice.interviews.length ? html`<div class="table-wrap"><table><thead><tr><th>Who</th><th>Type</th><th>When</th><th>Status</th><th class="r">Score</th><th>Commitment</th></tr></thead><tbody>
        ${slice.interviews.slice(0, 50).map((i) => html`<tr class="clickable" data-iv="${i.id}"><td><b>${i.persona.name}</b><div class="small muted">${i.persona.role ?? ''}${i.persona.company ? `, ${i.persona.company}` : ''}</div></td>
          <td>${i.real ? html`<span class="badge good">real${i.status === 'done' ? (i.verified ? ' · verified' : ' · self-reported') : ''}</span>` : html`<span class="badge">rehearsal</span>`}</td><td class="small">${fmtDate(s, i.day ?? i.createdDay)}${i.start != null ? ` ${fmtTime(i.start)}` : ''}</td>
          <td><span class="badge ${i.status === 'done' ? 'good' : i.status === 'no-show' ? 'bad' : 'accent'}">${i.status}</span></td><td class="r">${i.grade?.score ?? '—'}</td><td class="small">${(i.grade?.commitments ?? []).map((c) => COMMIT_LABEL[c]).join(', ')}</td></tr>`)}
      </tbody></table></div>` : html`<p class="empty">No interviews yet.</p>`}
    </section>
    ${insightsBoard(s, slice)}`;
}

function insightsBoard(s, slice) {
  const byTheme = {};
  for (const i of slice.insights) (byTheme[i.theme] ??= []).push(i);
  const feats = productSlice(s).features;
  const used = (id) => feats.filter((f) => (f.evidence ?? []).includes(id)).length;
  return html`<section class="panel"><h2>Insights board</h2><p class="small muted">Grouped by theme. Link them from a spec's "Evidence" section in Product. Look for the same pain from several real people before you build.</p>
    ${slice.insights.length ? html`<div class="kanban">${Object.entries(byTheme).map(([theme, list]) => html`<div class="col"><h4><span>${theme}</span><span>${list.filter((i) => i.real).length} real · ${list.filter((i) => !i.real).length} synth</span></h4>
      ${list.slice(0, 20).map((i) => html`<div class="card"><span class="badge ${i.real ? 'good' : ''}">${i.real ? 'real' : 'synthetic'}</span> ${i.text}<div class="small muted">${i.who}${used(i.id) ? ` · cited in ${used(i.id)} spec(s)` : ''} <button class="sm" data-del-ins="${i.id}" title="Remove">✕</button></div></div>`)}</div>`)}</div>` : html`<p class="empty">Insights from interviews will appear here.</p>`}</section>`;
}

function detailView(ctx, slice, iv) {
  const s = ctx.state;
  const ev = ensureCalendar(s).events.find((e) => e.id === iv.eventId);
  const canLog = iv.real && iv.status === 'scheduled' && ev && ev.day <= s.day && s.day <= ev.day + 3 && ['scheduled', 'in_progress', 'unattended'].includes(ev.status);
  const turns = iv.messages.filter((m) => m.from === 'me').length;
  const g = iv.grade;
  return html`
    <p><a href="#/research">← All interviews</a></p>
    <div class="grid-2">
      <section class="panel">
        <h2>${iv.persona.name} ${iv.real ? html`<span class="badge good">real</span>` : html`<span class="badge">AI persona · rehearsal</span>`}</h2>
        <p class="small muted">${iv.persona.role ?? ''}${iv.persona.company ? ` at ${iv.persona.company}` : ''}${iv.persona.context ? ` · ${iv.persona.context}` : ''}</p>
        ${iv.status === 'scheduled' ? html`<p>Booked for <b>${fmtDate(s, iv.day)} ${fmtTime(iv.start)}</b> (${INTERVIEW_MINUTES} min). ${ev?.day > s.day ? 'Have the real conversation on the day, then log your notes here.' : ''}</p>
          ${canLog ? html`<button class="primary" id="logBooked">I had the call: log notes</button>` : ''} ${iv.real && iv.status === 'scheduled' && s.day < iv.day ? html`<button id="confirmIv">${iv.confirmedDay != null ? 'Confirmed' : 'Send day-before confirmation'}</button>` : ''} <button class="danger" id="cancelIv">Cancel</button>` : ''}
        ${iv.real ? html`<h3>Notes</h3><p class="small" style="white-space:pre-wrap">${iv.notes}</p>` : ''}
        ${iv.messages.length ? html`<div class="chat" id="chatBox">${iv.messages.map((m) => html`<div class="msg ${m.from}">${m.text}${m.from === 'me' && iv.status === 'done' && m.tags?.some((t) => t !== 'good' && t !== 'ask') ? html`<div class="small" style="opacity:.8">⚠ ${m.tags.filter((t) => t !== 'good' && t !== 'ask').join(', ')}</div>` : ''}</div>`)}</div>` : ''}
        ${iv.status === 'live' ? html`<form id="chatForm" style="margin-top:8px"><textarea id="chatInput" rows="2" placeholder="Ask about the last time it happened…">${chatDraft[iv.id] ?? ''}</textarea>
          <div class="inline"><button class="primary" ${turns >= MAX_TURNS ? 'disabled' : ''}>Ask</button><button type="button" id="endIv">End call & grade</button><span class="hint">${turns}/${MAX_TURNS} questions · talk less, ask about the past, end with a concrete next step</span></div></form>` : ''}
      </section>
      <section class="panel">
        ${g ? html`<h2>Grade: <span class="${g.score >= 65 ? 'pos' : g.score >= 40 ? 'warn' : 'neg'}">${g.score}/100</span></h2><p class="small muted">${g.source}</p>
          ${g.talkRatio != null ? html`<p class="small">You talked ${pct(g.talkRatio, 0)} of the time ${g.talkRatio > 0.3 ? html`<span class="neg">(aim under 30%)</span>` : ''}.</p>` : ''}
          ${g.feedback ? html`<p>${g.feedback}</p>` : ''}
          ${[['Leading', g.leadingQuestions], ['Hypothetical / future', g.hypotheticals], ['Pitching', g.pitching], ['Good questions', g.goodQuestions]].map(([l, list]) => list?.length ? html`<h3>${l}</h3><ul class="small">${list.slice(0, 5).map((q) => html`<li>${q}</li>`)}</ul>` : '')}
          ${g.pastSpecifics?.length ? html`<h3>Past specifics you got</h3><ul class="small">${g.pastSpecifics.map((x) => html`<li>${x}</li>`)}</ul>` : ''}
          ${g.issues?.length ? html`<h3>Issues</h3><ul class="small">${g.issues.map((x) => html`<li>${x}</li>`)}</ul>` : ''}
          <p class="small"><b>Commitment:</b> ${(g.commitments ?? []).map((c) => COMMIT_LABEL[c]).join(', ') || 'none ("keep me posted" is a polite no)'}</p>
          ${!iv.real ? html`<p class="small muted">Rehearsal: insights are tagged synthetic and give no evidence credit.</p>` : ''}`
        : html`<h2>Mom Test cheat sheet</h2><ul class="small"><li>Talk about their life and past behaviour, not your idea.</li><li>"Tell me about the last time…", "What did you try?", "What did that cost?", "Who else was involved?"</li><li>Avoid "Would you…?", "Wouldn't it be great if…?" and pitching.</li><li>Compliments are not data. Commitments (intro, pilot, pre-order) are.</li><li>End by asking for a next step or 1–2 introductions.</li></ul>`}
      </section>
    </div>`;
}

export default {
  id: 'research',
  title: 'Interviews',
  icon: '🎙️',
  group: 'Product',
  badge: (state) => (state.apps.research?.interviews ?? []).filter((i) => i.status === 'scheduled' && i.day === state.day).length || null,

  render(root, ctx) {
    const s = ctx.state;
    const slice = researchSlice(s);
    const iv = ctx.params ? slice.interviews.find((i) => i.id === ctx.params) : null;
    mount(root, html`
      <div class="app-head"><div><h1>Customer interviews</h1><p>Customer discovery the Mom Test way: their past behaviour, not your idea. Rehearse with AI personas, then do it for real and log what you learn.</p></div></div>
      ${iv ? detailView(ctx, slice, iv) : listView(ctx, slice)}`);
    const chat = root.querySelector('#chatBox');
    if (chat) chat.scrollTop = chat.scrollHeight;

    on(root, 'click', '[data-iv]', (e, el) => ctx.navigate('research', el.dataset.iv));
    on(root, 'submit', '#newIv', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const who = String(fd.get('who'));
      e.target.querySelector('button').disabled = true;
      const r = await ctx.act(() => createInterview(ctx, { source: who.startsWith('crm|') ? 'crm' : 'icp', crmKey: who.split('|')[1] }), { hours: REHEARSAL_HOURS, label: 'Interview rehearsal (AI persona)' });
      if (r) ctx.navigate('research', r.id);
    });
    on(root, 'input', '[data-book]', (e, el) => { bookDraft[el.dataset.book] = el.value; });
    on(root, 'change', '[data-book]', (e, el) => {
      bookDraft[el.dataset.book] = el.value;
      if (el.dataset.book === 'crm') {
        const p = crmPeople(s).find((x) => x.key === el.value);
        if (p) { Object.assign(bookDraft, { name: p.contact?.name ?? '', role: p.contact?.title ?? '', company: p.company.name ?? '', email: p.contact?.email ?? '' }); ctx.render(); }
      }
    });
    on(root, 'submit', '#bookForm', async (e) => {
      e.preventDefault();
      const d = { ...bookDraft };
      const hours = attemptHours(d.channel);
      const r = await ctx.act((st) => { const iv2 = bookReal(st, d); if (iv2.status === 'no-reply') { toast(`${iv2.persona.name} did not reply. The outreach hours are spent; try again.`, 'warn'); return iv2; } toast(`Booked ${iv2.persona.name} for ${fmtDate(st, iv2.day)} ${fmtTime(iv2.start)}.`, 'good'); return iv2; }, { hours, label: 'Recruiting interviewees' });
      if (r) bookDraft = { name: '', role: '', company: '', email: '', channel: 'warm', crm: '' };
    });
    on(root, 'click', '#unlinkLog', (e) => { e.preventDefault(); logDraft.bookingId = null; ctx.render(); });
    on(root, 'input', '[data-log]', (e, el) => { logDraft[el.dataset.log] = el.value; });
    on(root, 'change', '[data-log]', (e, el) => { logDraft[el.dataset.log] = el.value; });
    on(root, 'change', '[data-commit]', (e, el) => {
      const set = new Set(logDraft.commitments);
      el.checked ? set.add(el.dataset.commit) : set.delete(el.dataset.commit);
      logDraft.commitments = [...set];
    });
    on(root, 'submit', '#realForm', async (e) => {
      e.preventDefault();
      const problem = notesProblem(logDraft.notes);
      if (problem) return toast(problem, 'warn');
      const d = { ...logDraft };
      const iv2 = await ctx.act(async () => logReal(ctx, d), { hours: d.bookingId ? WRITEUP_HOURS : REAL_LOG_HOURS, label: 'Customer interview (real)' });
      if (iv2) { logDraft = EMPTY_LOG(); ctx.render(); toast(iv2.verified ? 'Logged. Its insights count as evidence.' : 'Logged as self-reported: its insights count half until you add the attendee email or a recording reference.', iv2.verified ? 'good' : 'info'); }
    });
    on(root, 'click', '[data-del-ins]', (e, el) => { e.stopPropagation(); ctx.act((st) => { const sl = researchSlice(st); sl.insights = sl.insights.filter((i) => i.id !== el.dataset.delIns); }); });

    if (iv) {
      on(root, 'click', '#logBooked', () => {
        completeEvent(s, iv.eventId, 'in_progress');
        logDraft = { ...EMPTY_LOG(), name: iv.persona.name, role: iv.persona.role ?? '', company: iv.persona.company ?? '', channel: iv.channel, email: iv.email ?? '', bookingId: iv.id };
        ctx.save();
        ctx.navigate('research', '');
      });
      on(root, 'click', '#confirmIv', () => ctx.act((st) => confirmInterview(st, iv.id), { hours: 0.1, label: 'Confirm interview' }));
      on(root, 'click', '#cancelIv', () => ctx.act((st) => { cancelEvent(st, iv.eventId, 'canceled by founder'); iv.status = 'canceled'; }));
      on(root, 'input', '#chatInput', (e, el) => { chatDraft[iv.id] = el.value; });
      on(root, 'keydown', '#chatInput', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); } });
      on(root, 'submit', '#chatForm', async (e) => {
        e.preventDefault();
        const text = String(chatDraft[iv.id] ?? '').trim();
        if (!text) return;
        chatDraft[iv.id] = '';
        e.target.querySelector('button').disabled = true;
        await ctx.act(() => sendTurn(ctx, iv, text));
      });
      on(root, 'click', '#endIv', async (e, el) => {
        el.disabled = true;
        el.textContent = 'Grading…';
        await ctx.act(() => finishInterview(ctx, iv), { hours: WRITEUP_HOURS, label: 'Interview notes' });
      });
    }
  },

  onDay(state) {
    const slice = researchSlice(state);
    const evs = ensureCalendar(state).events;
    for (const iv of slice.interviews) {
      if (iv.status !== 'scheduled') continue;
      const ev = evs.find((e) => e.id === iv.eventId);
      if (!ev || ev.status === 'canceled') { iv.status = 'canceled'; continue; }
      // Real calls happen outside the game: allow 3 days to log notes before treating it as a no-show.
      // The interviewee can flake on the day [design]; unconfirmed calls flake far more often.
      if (iv.real && state.day === iv.day && !iv.noShowRolled) {
        iv.noShowRolled = true;
        if (rng(state) < (wasConfirmed(iv) ? NO_SHOW_P.confirmed : NO_SHOW_P.unconfirmed)) {
          iv.status = 'no-show'; iv.noShowBy = 'them'; cancelEvent(state, ev.id, 'interviewee no-show');
          const confirmed = wasConfirmed(iv);
          notify(state, `${iv.persona.name} did not show up for the interview.${confirmed ? '' : ' You never sent a day-before confirmation.'}`, { type: 'bad', app: 'research' });
          if (!confirmed) logMistake(state, { functionId: 'customer_discovery', id: 'interview_no_confirm', label: 'Interviewee no-show, no day-before confirmation', app: 'research', cost: { hours: 0.75 }, key: `ivnoshow:${iv.id}`, charge: true, detail: `${iv.persona.name} flaked; the 45-minute slot and the recruiting hours (${attemptHours(iv.channel)}h per attempt) were wasted. A one-line confirmation the day before cuts no-shows by roughly two thirds [design].` });
          continue;
        }
      }
      if (ev.status === 'missed' || (ev.status === 'unattended' && (!iv.real || state.day > ev.day + 3))) {
        iv.status = 'no-show';
        if (iv.real) logMistake(state, { functionId: 'customer_discovery', id: 'interview_missed', label: 'Missed a booked customer interview', app: 'research', cost: { hours: 0.75, reputation: 0.2 }, key: `ivmissed:${iv.id}`, detail: `${iv.persona.name} set aside 45 minutes and the founder did not log the call; the recruiting hours are wasted and an intro is unlikely.` });
        notify(state, `You missed your interview with ${iv.persona.name}. They set aside 45 minutes for you; don't expect an intro.`, { type: 'bad', app: 'research' });
      }
    }
    // A live call left open past its day ends without a grade.
    for (const iv of slice.interviews) if (iv.status === 'live' && iv.day < state.day - 1) iv.status = 'abandoned';
  },
};
