// Customer research: Mom Test interview practice with AI personas (booked on the calendar, live chat with
// hidden facts, graded transcript), a form to log REAL interviews (the only evidence), and an insights
// board you can link to feature specs.
//
// Sources: docs/research/sales-and-research.md §4 (Mom Test, recruiting response rates, NN/G on
// synthetic users: rehearsal, never evidence; interview grading rubric).

import { html, mount, on, toast } from '../core/ui.js';
import { REALISM } from '../core/llm.js';
import { notify } from '../core/state.js';
import { scheduleEvent, findSlots, completeEvent, cancelEvent, ensureCalendar, fmtTime } from '../core/calendar.js';
import { rng, uid, fmtDate, pct, words, clamp } from '../core/util.js';
import { researchSlice, productSlice } from './product/store.js';
import { knownCompetitors, competitionBrief } from './marketworld/competitors.js';
import { RECRUIT, INTERVIEW_MINUTES, FACT_KEYS, COMMITMENTS, COMMIT_LABEL, classifyQuestion, makeFacts, fallbackReply, gradeTranscript, extractFromNotes, themeOf } from './product/interview.js';

const MAX_TURNS = 24; // ~45 minutes of conversation
const WRITEUP_HOURS = 0.25; // notes after a call [A]
const REAL_LOG_HOURS = 1; // 45-min real call + write-up
const FIRST = ['Dana', 'Marcus', 'Priya', 'Tom', 'Elena', 'Kofi', 'Lena', 'Raj', 'Sara', 'Jonas', 'Mei', 'Carlos'];
const LAST = ['Reyes', 'Hoffman', 'Shah', 'Becker', 'Okoro', 'Lind', 'Moreau', 'Ito', 'Walsh', 'Novak'];

// Module-level drafts so re-renders never wipe typing.
const chatDraft = {};
let logDraft = { name: '', role: '', company: '', channel: 'warm', notes: '', commitments: [] };

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
const GRADE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['score', 'leadingQuestions', 'hypotheticals', 'pitching', 'goodQuestions', 'insights', 'feedback'],
  properties: {
    score: { type: 'number', description: '0-100 Mom Test quality' },
    leadingQuestions: { type: 'array', items: { type: 'string' } },
    hypotheticals: { type: 'array', items: { type: 'string' } },
    pitching: { type: 'array', items: { type: 'string' } },
    goodQuestions: { type: 'array', items: { type: 'string' } },
    insights: { type: 'array', items: INSIGHT },
    feedback: { type: 'string', description: '2-4 sentences of coaching' },
  },
};
const NOTES_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['insights', 'quality', 'issues'],
  properties: { insights: { type: 'array', items: INSIGHT }, quality: { type: 'number', description: '0-100' }, issues: { type: 'array', items: { type: 'string' } } },
};
const GRADER = `You grade customer-discovery interviews against The Mom Test (Fitzpatrick). Penalise leading questions, hypotheticals/future questions ("would you…"), pitching before the problem is understood, generic "do you usually" questions, founder talking more than ~30%, and compliments treated as validation. Credit questions about specific past behaviour ("tell me about the last time…"), current workarounds, money/time already spent, and ending with a commitment (intro, follow-up, pilot, LOI, pre-order). Extract only insights the interviewee actually stated; never infer.`;

function crmPeople(state) {
  const crm = state.apps.crm;
  if (!crm?.companies?.length) return [];
  const out = [];
  for (const c of crm.companies) {
    const contacts = (crm.contacts ?? []).filter((p) => p.companyId === c.id);
    for (const p of contacts.length ? contacts : [{ id: null, name: null, title: null }]) out.push({ key: `${c.id}:${p.id ?? ''}`, company: c, contact: p });
  }
  return out.slice(0, 60);
}

async function createInterview(ctx, { source, crmKey, channel }) {
  const state = ctx.state;
  const slice = researchSlice(state);
  const r = RECRUIT[channel === 'intro' ? 'warm' : channel];
  if (channel === 'intro') { if (slice.introCredits < 1) throw new Error('No introductions banked. Ask interviewees for intros.'); slice.introCredits--; }
  if (channel === 'warm') { if ((slice.warmUsed ?? 0) >= warmPool(state)) throw new Error('You have asked everyone in your warm network already. Use communities, cold outreach, or intros.'); slice.warmUsed = (slice.warmUsed ?? 0) + 1; }
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
    id: ivId, real: false, source, channel, crmCompanyId: crmP?.company.id ?? null, knows: known.map((k) => ({ name: k.competitor.name, relation: k.relation })),
    persona: { name: p.name || fbName, role: p.role, company: p.company, context: p.context, site, facts },
    status: 'scheduled', messages: [], grade: null, createdDay: state.day, mock: res.mock,
  };
  const [lo, hi] = r.days;
  const fromDay = state.day + lo + Math.floor(rng(state) * (hi - lo + 1));
  const slot = findSlots(state, { fromDay, duration: INTERVIEW_MINUTES, count: 1 })[0];
  if (!slot) throw new Error('No free 45-minute slot in the next month. Clear some calendar time.');
  const ev = scheduleEvent(state, { title: `Interview: ${iv.persona.name}${iv.persona.company ? ` (${iv.persona.company})` : ''}`, kind: 'interview', app: 'research', refId: iv.id, with: { name: iv.persona.name }, day: slot.day, start: slot.start, duration: INTERVIEW_MINUTES, notes: 'Customer discovery (rehearsal with an AI persona). Ask about the past, not the future.' });
  Object.assign(iv, { eventId: ev.id, day: slot.day, start: slot.start });
  slice.interviews.unshift(iv);
  return iv;
}

async function sendTurn(ctx, iv, text) {
  const state = ctx.state;
  const tags = classifyQuestion(text);
  const history = iv.messages.slice();
  iv.messages.push({ from: 'me', text, tags });
  const f = iv.persona.facts;
  const transcript = iv.messages.slice(-14).map((m) => `${m.from === 'me' ? 'FOUNDER' : 'YOU'}: ${m.text}`).join('\n');
  const res = await ctx.llm.ask({
    task: 'interview_chat',
    system: `${REALISM}\nYou are ${iv.persona.name}, ${iv.persona.role}${iv.persona.company ? ` at ${iv.persona.company}` : ''}. ${iv.persona.context ?? ''}\nA founder is interviewing you on a video call (you agreed to 45 minutes as a favour). HIDDEN FACTS (stay consistent; reveal one only when a question about your real past behaviour naturally draws it out, then list its key in "revealed"):\n${FACT_KEYS.map((k) => `- ${k}: ${f[k]}`).join('\n')}\nThe pain is ${f.painReal ? 'REAL for you' : 'NOT a priority for you'}.\nBehave like a real person: answer hypotheticals ("would you…") with vague polite yeses that mean nothing; if they pitch, give compliments and no information; leading questions get agreement without substance. Short answers (1-3 sentences). Commit to something (followup/intro/pilot/loi/preorder) ONLY if the pain is real, the founder clearly understood your situation, and they explicitly asked for that next step. If the pain is not real, never go beyond "keep me posted".`,
    prompt: `${transcript}\n\nReply as ${iv.persona.name} to the founder's last message.`,
    schema: CHAT_SCHEMA,
    temperature: 0.8,
    maxTokens: 300,
    fallback: () => fallbackReply(iv.persona, history, text),
  });
  const d = res.data;
  if (!f.painReal && ['pilot', 'loi', 'preorder'].includes(d.commitment)) d.commitment = 'followup'; // keep the game's ground truth
  iv.messages.push({ from: 'them', text: d.reply, revealed: (d.revealed ?? []).filter((k) => FACT_KEYS.includes(k)), commitment: d.commitment ?? 'none', mock: res.mock });
}

async function finishInterview(ctx, iv) {
  const state = ctx.state;
  const slice = researchSlice(state);
  const h = gradeTranscript(iv.messages, iv.persona);
  const transcript = iv.messages.map((m) => `${m.from === 'me' ? 'FOUNDER' : 'INTERVIEWEE'}: ${m.text}`).join('\n').slice(0, 9000);
  const res = await ctx.llm.panel({
    task: 'interview_grade', system: GRADER, prompt: `Transcript:\n${transcript}`, schema: GRADE_SCHEMA, temperature: 0.2, maxTokens: 900,
    fallback: () => h, cache: state.cache,
  });
  const live = res.filter((r) => !r.mock);
  const pickLive = live[0]?.data ?? h;
  const score = Math.round(clamp(res.reduce((a, r) => a + (Number(r.data.score) || 0), 0) / res.length, 0, 100));
  iv.grade = {
    score, talkRatio: h.talkRatio, commitments: h.commitments,
    leadingQuestions: pickLive.leadingQuestions ?? [], hypotheticals: pickLive.hypotheticals ?? [], pitching: pickLive.pitching ?? [], goodQuestions: pickLive.goodQuestions ?? [],
    feedback: pickLive.feedback, source: live.length ? 'LLM panel' : 'offline heuristic', pastSpecifics: h.pastSpecifics,
  };
  iv.status = 'done';
  iv.doneDay = state.day;
  if (iv.eventId) completeEvent(state, iv.eventId, 'done', `score ${score}`);
  for (const i of (pickLive.insights ?? []).slice(0, 8)) slice.insights.unshift({ id: uid('ins'), interviewId: iv.id, theme: i.theme || themeOf(i.text), text: i.text, type: i.type, real: false, who: `${iv.persona.name} (AI persona)`, day: state.day });
  if (h.commitments.includes('intro')) slice.introCredits++;
  notify(state, `Interview with ${iv.persona.name}: Mom Test score ${score}/100${h.commitments.length ? `, commitment: ${COMMIT_LABEL[h.commitments[0]]}` : ', no commitment'}.`, { type: score >= 65 ? 'good' : 'info', app: 'research' });
}

async function logReal(ctx, d) {
  const state = ctx.state;
  const slice = researchSlice(state);
  const commitments = d.commitments.filter((c) => COMMITMENTS.includes(c) && c !== 'none');
  const fb = extractFromNotes(d.notes, commitments);
  const res = await ctx.llm.ask({
    task: 'interview_notes', system: GRADER,
    prompt: `Notes from a REAL customer interview with ${d.name}, ${d.role} at ${d.company}. Commitments recorded: ${commitments.join(', ') || 'none'}.\n\n${d.notes.slice(0, 6000)}\n\nExtract insights (only what the interviewee said or did), rate the interview quality 0-100 from what the notes show, and list Mom Test issues.`,
    schema: NOTES_SCHEMA, temperature: 0.2, maxTokens: 800, fallback: () => fb, cache: state.cache,
  });
  const iv = { id: uid('iv'), real: true, source: 'real', channel: d.channel, persona: { name: d.name, role: d.role, company: d.company }, notes: d.notes, status: 'done', createdDay: state.day, doneDay: state.day, grade: { score: Math.round(clamp(Number(res.data.quality) || 0, 0, 100)), commitments, issues: res.data.issues ?? [], source: res.mock ? 'offline heuristic' : 'LLM' } };
  slice.interviews.unshift(iv);
  const ins = [...(res.data.insights ?? []), ...(res.mock ? [] : commitments.map((c) => ({ theme: 'Commitments', type: 'commitment', text: COMMIT_LABEL[c] })))];
  for (const i of ins.slice(0, 10)) slice.insights.unshift({ id: uid('ins'), interviewId: iv.id, theme: i.theme || themeOf(i.text), text: i.text, type: i.type, real: true, who: `${d.name}${d.company ? `, ${d.company}` : ''}`, day: state.day });
  if (commitments.includes('intro')) slice.introCredits++;
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
    <div class="grid-2">
      <section class="panel">
        <h2>Book a practice interview</h2>
        <form id="newIv">
          <label>Who <select name="who"><option value="icp">A persona from your ICP</option>${crm.map((p) => html`<option value="crm|${p.key}">${p.contact?.name ? `${p.contact.name}, ` : ''}${p.company.name} (CRM)</option>`)}</select></label>
          <label>Recruit via <select name="channel">
            ${slice.introCredits ? html`<option value="intro">Intro from a past interviewee (${slice.introCredits} left)</option>` : ''}
            ${Object.entries(RECRUIT).map(([k, r]) => html`<option value="${k}" ${k === 'warm' && !warmLeft ? 'disabled' : ''}>${r.label}: ~${Math.round(r.hours * 60)} min outreach, ~${pct(r.response, 0)} reply, call in ${r.days[0]}–${r.days[1]} days</option>`)}
          </select></label>
          <button class="primary">Recruit & book</button>
        </form>
        <p class="hint">Recruiting time is charged now; the ${INTERVIEW_MINUTES}-minute call goes on your calendar and its hours are charged on the day. Ask for advice, not a sale: "I'm researching how X handle Y, not selling anything."</p>
      </section>
      <section class="panel">
        <h2>Log a real interview</h2>
        <form id="realForm">
          <div class="grid-2"><label>Name <input id="rl-name" data-log="name" value="${logDraft.name}" required /></label><label>Role <input id="rl-role" data-log="role" value="${logDraft.role}" /></label></div>
          <div class="grid-2"><label>Company <input id="rl-company" data-log="company" value="${logDraft.company}" /></label>
            <label>Recruited via <select id="rl-channel" data-log="channel">${Object.entries(RECRUIT).map(([k, r]) => html`<option value="${k}" ${logDraft.channel === k ? 'selected' : ''}>${r.label}</option>`)}</select></label></div>
          <label>Notes <span class="hint">what they said and did: the last time it happened, workaround, what it costs, quotes</span><textarea id="rl-notes" data-log="notes" rows="5">${logDraft.notes}</textarea></label>
          <div class="small">Commitments: ${COMMITMENTS.filter((c) => c !== 'none').map((c) => html`<label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="display:inline-block;margin:3px 0 0;flex:none" type="checkbox" data-commit="${c}" ${logDraft.commitments.includes(c) ? 'checked' : ''} /> ${COMMIT_LABEL[c]}</label>`)}</div>
          <button class="primary">Log interview (${REAL_LOG_HOURS} h)</button>
        </form>
      </section>
    </div>
    <section class="panel"><h2>Interviews</h2>
      ${slice.interviews.length ? html`<div class="table-wrap"><table><thead><tr><th>Who</th><th>Type</th><th>When</th><th>Status</th><th class="r">Score</th><th>Commitment</th></tr></thead><tbody>
        ${slice.interviews.slice(0, 50).map((i) => html`<tr class="clickable" data-iv="${i.id}"><td><b>${i.persona.name}</b><div class="small muted">${i.persona.role ?? ''}${i.persona.company ? `, ${i.persona.company}` : ''}</div></td>
          <td>${i.real ? html`<span class="badge good">real</span>` : html`<span class="badge">rehearsal</span>`}</td><td class="small">${fmtDate(s, i.day ?? i.createdDay)}${i.start != null ? ` ${fmtTime(i.start)}` : ''}</td>
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
  const canJoin = !iv.real && iv.status === 'scheduled' && ev && ev.day === s.day && ev.status === 'scheduled';
  const turns = iv.messages.filter((m) => m.from === 'me').length;
  const g = iv.grade;
  return html`
    <p><a href="#/research">← All interviews</a></p>
    <div class="grid-2">
      <section class="panel">
        <h2>${iv.persona.name} ${iv.real ? html`<span class="badge good">real</span>` : html`<span class="badge">AI persona · rehearsal</span>`}</h2>
        <p class="small muted">${iv.persona.role ?? ''}${iv.persona.company ? ` at ${iv.persona.company}` : ''}${iv.persona.context ? ` · ${iv.persona.context}` : ''}</p>
        ${iv.status === 'scheduled' ? html`<p>Booked for <b>${fmtDate(s, iv.day)} ${fmtTime(iv.start)}</b> (${INTERVIEW_MINUTES} min). ${canJoin ? '' : ev?.day > s.day ? 'Come back on the day to join.' : ''}</p>
          ${canJoin ? html`<button class="primary" id="joinIv">Join the call</button>` : ''} <button class="danger" id="cancelIv">Cancel</button>` : ''}
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
      const channel = String(fd.get('channel'));
      const hours = RECRUIT[channel === 'intro' ? 'warm' : channel].hours;
      e.target.querySelector('button').disabled = true;
      const r = await ctx.act(async () => {
        const created = await createInterview(ctx, { source: who.startsWith('crm|') ? 'crm' : 'icp', crmKey: who.split('|')[1], channel });
        toast(`Booked ${created.persona.name} for ${fmtDate(s, created.day)} ${fmtTime(created.start)}.`, 'good');
        return created;
      }, { hours, label: 'Recruiting interviewees' });
      if (r) ctx.navigate('research', r.id);
    });
    on(root, 'input', '[data-log]', (e, el) => { logDraft[el.dataset.log] = el.value; });
    on(root, 'change', '[data-log]', (e, el) => { logDraft[el.dataset.log] = el.value; });
    on(root, 'change', '[data-commit]', (e, el) => {
      const set = new Set(logDraft.commitments);
      el.checked ? set.add(el.dataset.commit) : set.delete(el.dataset.commit);
      logDraft.commitments = [...set];
    });
    on(root, 'submit', '#realForm', async (e) => {
      e.preventDefault();
      if (words(logDraft.notes) < 15) return toast('Write real notes (at least a few sentences): what they did, spent and said.', 'warn');
      const d = { ...logDraft };
      const ok = await ctx.act(async () => { await logReal(ctx, d); return true; }, { hours: REAL_LOG_HOURS, label: 'Customer interview (real)' });
      if (ok) { logDraft = { name: '', role: '', company: '', channel: 'warm', notes: '', commitments: [] }; ctx.render(); toast('Logged. Its insights count as evidence.', 'good'); }
    });
    on(root, 'click', '[data-del-ins]', (e, el) => { e.stopPropagation(); ctx.act((st) => { const sl = researchSlice(st); sl.insights = sl.insights.filter((i) => i.id !== el.dataset.delIns); }); });

    if (iv) {
      on(root, 'click', '#joinIv', () => ctx.act((st) => {
        iv.status = 'live';
        completeEvent(st, iv.eventId, 'in_progress');
        iv.messages.push({ from: 'them', text: `Hi, this is ${iv.persona.name}. I've got about 45 minutes. What did you want to ask?`, revealed: [], commitment: 'none' });
      }));
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
      if (ev.status === 'unattended' || ev.status === 'missed') {
        iv.status = 'no-show';
        notify(state, `You never joined your interview with ${iv.persona.name}. They gave up 45 minutes for you; don't expect an intro.`, { type: 'bad', app: 'research' });
      }
    }
    // A live call left open past its day ends without a grade.
    for (const iv of slice.interviews) if (iv.status === 'live' && iv.day < state.day - 1) iv.status = 'abandoned';
  },
};
