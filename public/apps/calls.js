// Calls (Zoom + Gong-lite): meetings booked from replies live on the founder calendar. Prospects no-show at
// researched rates; you reschedule. Joining runs a live chat with the prospect persona (hidden pains, tools,
// budget, authority, timeline grounded in their real website). Afterwards a Gong-style scorecard grades the
// call and the outcome moves the deal at researched meeting → opportunity rates.
import { html, mount, on, stat, badge, toast } from '../core/ui.js';
import { fmtDate, pct, chance, words, clamp } from '../core/util.js';
import { findSlots, moveEvent, completeEvent, fmtTime } from '../core/calendar.js';
import { shippedFeatures } from '../core/market.js';
import { SALES, HOURS } from './sales/params.js';
import { personaFor } from './sales/replies.js';
import { heuristicScorecard, heuristicCallReply, SCORECARD_SCHEMA, CALL_REPLY_SCHEMA, countGoodQuestions } from './sales/scorecard.js';
import { callQuality, stageLabel } from './sales/deals.js';
import { ensureCalls, ensureCrm, contactById, companyById, contactName, calendarEvent, createMeeting, nextSlot, cancelMeeting, moveDeal, dealById, slotText, addActivity } from './sales/model.js';
import { callsDay, applyCallOutcome } from './sales/engine.js';
import { personaSystem } from './sales/jobs.js';
import { segmentOf, stakeholderBrief, roleLabel, committeeContacts, methodCoverage } from './sales/segments.js';
import { scorecardSchema } from './sales/scorecard.js';

// A committee member who is not the first contact plays their role: concerns become their "pain" and objections.
function callPersona(s, ct, co) {
  const p = personaFor(s, ct, co);
  const cm = ct?.committee;
  if (cm && !cm.primary) {
    p.pain = (cm.concerns ?? []).join('; ') || p.pain;
    p.objection = cm.concerns?.[1] ?? cm.concerns?.[0] ?? p.objection;
    p.hasPain = cm.stance !== 'oppose' || cm.role === 'user';
    p.authority = roleLabel(cm.role);
  }
  return p;
}
const dealOf = (s, m) => s.apps.crm?.deals.find((d) => d.id === m.dealId);
function segmentContext(s, ct, co, m) {
  const seg = segmentOf(s, co);
  const deal = dealOf(s, m);
  if (!seg) return '';
  const others = deal ? committeeContacts(s, deal).filter((c) => c.id !== ct?.id).map((c) => `${c.title} (${roleLabel(c.committee.role)})`) : [];
  return `\n${stakeholderBrief(seg, ct?.committee ? ct : { committee: { role: 'economic_buyer', concerns: [], stance: 'neutral' } })}\nOther people involved in this decision (mention them only when asked about the decision process, who signs, security, legal or procurement): ${others.join(', ') || 'nobody else'}.`;
}

const draft = {}; // meetingId -> text being typed

const STATUS_TONE = { scheduled: 'accent', ready: 'good', in_call: 'good', held: 'good', no_show: 'bad', missed: 'bad', canceled: '' };
const when = (s, m) => `${fmtDate(s, m.day)} · ${fmtTime(m.start)} (${m.duration} min)`;
const priceText = (s) => s.plans.filter((p) => p.active).map((p) => `$${p.price}/${p.interval === 'year' ? 'yr' : 'mo'}`).join(', ');

function listView(s, calls) {
  const upcoming = calls.meetings.filter((m) => ['scheduled', 'ready', 'in_call'].includes(m.status)).sort((a, b) => a.day - b.day || a.start - b.start);
  const noShows = calls.meetings.filter((m) => m.status === 'no_show' && !m.rebooked && (m.rebookTries ?? 0) < 2);
  const past = calls.meetings.filter((m) => ['held', 'no_show', 'missed', 'canceled'].includes(m.status)).sort((a, b) => b.day - a.day).slice(0, 40);
  const booked = calls.meetings.filter((m) => m.status !== 'canceled');
  const resolved = booked.filter((m) => ['held', 'no_show'].includes(m.status));
  const held = booked.filter((m) => m.status === 'held');
  const qual = held.filter((m) => m.qualified).length;
  const row = (m) => {
    const ct = contactById(s, m.contactId);
    const co = companyById(s, m.companyId);
    return html`<li style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <span><a href="#/calls/${m.id}"><b>${contactName(ct)}</b></a> · ${co?.name ?? ''} <span class="muted small">${m.kind.replace('_', '-')} · ${m.source}</span><div class="small muted">${when(s, m)}</div></span>
      <span>${badge(m.status.replace('_', ' '), STATUS_TONE[m.status])} ${m.status === 'ready' && m.day === s.day ? html`<a class="btn sm primary" href="#/calls/${m.id}">Join</a>` : ''}</span></li>`;
  };
  return html`
    <div class="stats">
      ${stat('Upcoming', upcoming.length)}
      ${stat('Show rate', resolved.length ? pct(held.length / resolved.length, 0) : '—', 'benchmark 70–80% (20–30% no-show)')}
      ${stat('Held', held.length)}
      ${stat('→ Qualified', held.length ? pct(qual / held.length, 0) : '—', 'founder-run benchmark 50–60%')}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Upcoming & today</h2>${upcoming.length ? html`<ul class="list">${upcoming.map(row)}</ul>` : html`<p class="empty">No calls booked. Calls come from prospects agreeing in Mail, inbound demo requests, or your AI SDR.</p>`}</section>
      <section class="panel"><h2>Needs rescheduling</h2>${noShows.length ? html`<ul class="list">${noShows.map(row)}</ul>` : html`<p class="empty">Nothing to reschedule.</p>`}
        <h3>Settings</h3><label><input type="checkbox" id="reminders" ${calls.reminders ? 'checked' : ''} /> Automatic reminders (Calendly-style email + SMS 24h and 1h before)</label></section>
    </div>
    <section class="panel"><h2>Past calls</h2>${past.length ? html`<ul class="list">${past.map((m) => html`${row(m)}${m.scorecard ? html`<div class="small muted" style="margin:-4px 0 6px">Discovery ${m.scorecard.discoveryQuality}/10 · talk ${pct(m.scorecard.talkRatio, 0)} · ${m.scorecard.nextStepSecured ? 'next step ✓' : 'no next step'} · ${m.qualified ? 'qualified' : 'not qualified'}</div>` : ''}`)}</ul>` : html`<p class="empty">None yet.</p>`}</section>`;
}

function meetingView(s, m) {
  const ct = contactById(s, m.contactId);
  const co = companyById(s, m.companyId) ?? {};
  const deal = dealById(s, m.dealId);
  const ev = calendarEvent(s, m);
  const shipped = shippedFeatures(s);
  const header = html`<p><a href="#/calls">← Calls</a></p>
    <div class="app-head"><div><h1>${m.kind === 'discovery' ? 'Discovery call' : m.kind === 'stakeholder' ? `Stakeholder call (${roleLabel(ct?.committee?.role ?? '')})` : 'Follow-up call'} · ${contactName(ct)}</h1>
      <p>${ct?.title ?? ''} at <a href="#/crm/company:${m.companyId}">${co.name ?? ''}</a> · ${when(s, m)} · ${badge(m.status.replace('_', ' '), STATUS_TONE[m.status])} ${deal ? badge(stageLabel(deal.stage), 'accent') : ''}</p></div></div>`;
  const prep = html`<section class="panel"><h2>Prep</h2>
    ${co.research ? html`<p class="small"><b>Hypotheses:</b> ${(co.research.pains ?? []).join(' · ')}</p>` : html`<p class="small warn">You haven't researched this company. <a href="#/crm/company:${m.companyId}">Research it first</a>.</p>`}
    <p class="small"><b>What they can see is live:</b> ${shipped.length ? shipped.map((f) => f.title).join(', ') : 'nothing shipped yet: no demo possible'} · price ${priceText(s)}</p>
    <p class="small muted">Mom Test: ask about the last time it happened, what they did, what it cost, who else was involved. No pitching until you understand the problem. End with a concrete commitment.</p></section>`;

  if (m.status === 'scheduled') {
    const slots = findSlots(s, { fromDay: s.day + 1, duration: m.duration, count: 4 });
    return html`${header}<div class="grid-2"><section class="panel"><h2>Scheduled</h2>
      <p>It's on your calendar. Join on the day from here or from the Calendar.</p>
      <div class="inline"><button data-remind ${m.reminded ? 'disabled' : ''}>${m.reminded ? 'Confirmation sent' : 'Send personal confirmation (3 min)'}</button><button class="danger" data-cancel>Cancel meeting</button></div>
      <h3>Reschedule to</h3><div class="inline">${slots.map((sl) => html`<button class="sm" data-move="${sl.day}:${sl.start}">${slotText(s, sl)}</button>`)}</div>
      <p class="hint">Every reschedule raises the no-show odds a little.</p></section>${prep}</div>`;
  }
  if (m.status === 'no_show') {
    return html`${header}<section class="panel"><h2>They didn't show</h2>
      <p>No-shows are normal: 20–30% on average, worse for cold SMB meetings booked a week out. A short, no-guilt note recovers about half.</p>
      ${m.rebooked ? html`<p class="pos">Rebooked.</p>` : (m.rebookTries ?? 0) >= 2 ? html`<p class="muted">They've gone quiet. Move on.</p>` : html`<button class="primary" data-rebook>Send reschedule note (6 min)</button>`}</section>`;
  }
  if (m.status === 'missed') return html`${header}<div class="callout bad">You never joined this call. They waited, then left. Founder no-shows burn trust fast.</div>`;
  if (m.status === 'canceled') return html`${header}<p class="muted">Canceled.</p>`;
  if (m.status === 'ready') {
    return html`${header}<div class="grid-2"><section class="panel"><h2>${m.day === s.day ? 'They\'re in the waiting room' : 'Ready'}</h2>
      <p>${m.duration} minutes are already blocked on your calendar for this call.</p>
      <button class="primary" data-join ${m.day === s.day ? '' : 'disabled'}>Join call</button>
      ${ev?.status === 'missed' ? html`<p class="neg">Your calendar marked this as missed.</p>` : ''}</section>${prep}</div>`;
  }
  // in call or held: transcript
  const card = m.scorecard;
  return html`${header}<div class="grid-2">
    <section class="panel"><h2>${m.status === 'in_call' ? '🔴 Live' : 'Transcript'}</h2>
      <div class="chat" id="chat">${m.transcript.length ? m.transcript.map((t) => html`<div class="msg ${t.from}">${t.text}</div>`) : html`<p class="muted small">You're on. Say hi and start with a question about them.</p>`}</div>
      ${m.status === 'in_call' ? html`<form id="say" style="margin-top:8px"><textarea id="sayText" rows="3" placeholder="What do you say? (Enter to send, Shift+Enter for a new line)">${draft[m.id] ?? ''}</textarea>
        <div class="inline"><button class="primary">Say it</button><button type="button" class="danger" data-end>End call & score</button><span class="hint">${m.transcript.filter((t) => t.from === 'me').length} turns · engagement ${m.engagement.toFixed(1)}/10</span></div></form>` : ''}
    </section>
    ${card ? html`<section class="panel"><h2>Scorecard ${m.cardMock ? badge('offline heuristic') : badge('AI', 'accent')}</h2>
      <div class="stats">
        ${stat('Talk ratio (you)', pct(card.talkRatio, 0), 'aim < 40%', card.talkRatio > 0.55 ? 'bad' : card.talkRatio > 0.45 ? 'warn' : 'good')}
        ${stat('Questions', card.questionsAsked)}
        ${stat('Discovery', `${card.discoveryQuality}/10`, '', card.discoveryQuality >= 7 ? 'good' : card.discoveryQuality <= 4 ? 'bad' : '')}
        ${stat('Next step', card.nextStepSecured ? 'Secured' : 'None', card.nextStep, card.nextStepSecured ? 'good' : 'bad')}
      </div>
      ${card.competitiveHandling && card.competitiveHandling !== 'not_raised' ? html`<p>Competitor objection: ${badge(card.competitiveHandling, card.competitiveHandling === 'handled' ? 'good' : 'bad')}</p>` : ''}
      <h3>MEDDICC-lite</h3><p>${Object.entries(card.meddicc).map(([k, v]) => html`${badge(`${v ? '✓' : '✗'} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`, v ? 'good' : '')} `)}</p>
      ${methodPanel(s, m)}
      ${card.momTestViolations.length ? html`<h3>Mom Test violations</h3><ul class="small">${card.momTestViolations.map((v) => html`<li>${v}</li>`)}</ul>` : html`<p class="pos small">No Mom Test violations.</p>`}
      ${card.coaching.length ? html`<h3>Coaching</h3><ul class="small">${card.coaching.map((v) => html`<li>${v}</li>`)}</ul>` : ''}
      <p class="small muted">${card.summary}</p>
      <div class="callout ${m.qualified ? 'good' : ''}">${m.qualified ? html`Outcome: <b>qualified opportunity</b>. Next: <a href="#/crm/company:${m.companyId}">send a proposal or pilot in the CRM</a>.` : html`Outcome: <b>not qualified</b> (yet). ${m.qualifyP != null ? html`<span class="small muted">Chance was ~${pct(m.qualifyP, 0)} given call quality, their real need and your product.</span>` : ''} If there was real pain, <a href="#/crm/company:${m.companyId}">propose a design partnership or paid pilot</a>, or follow up by email.`}</div>
    </section>` : prep}
  </div>`;
}

function methodPanel(s, m) {
  const deal = dealOf(s, m);
  const me = deal?.method;
  if (!me) return '';
  const cov = methodCoverage(deal);
  const learned = new Set((m.revealed ?? []));
  return html`<h3>${me.label} for this deal · ${Math.round((cov?.critical ?? 0) * 100)}% of critical elements known</h3>
    <p>${me.elements.map((e) => html`${badge(`${me.known?.[e.id] != null ? '✓' : '?'} ${e.label}${me.critical.includes(e.id) ? ' *' : ''}`, me.known?.[e.id] != null ? 'good' : me.critical.includes(e.id) ? 'warn' : '')} `)}</p>
    ${me.elements.filter((e) => me.known?.[e.id] == null && me.critical.includes(e.id)).slice(0, 2).map((e) => html`<p class="small muted">Next time ask (${e.label}): “${e.probeQuestions[0]}”</p>`)}
    ${learned.size ? html`<p class="small pos">You learned who else is involved: ${committeeContacts(s, deal).filter((c) => learned.has(c.id)).map((c) => `${c.title} (${roleLabel(c.committee.role)})`).join(', ')}.</p>` : ''}`;
}

async function sayTurn(ctx, m, text) {
  const s = ctx.state;
  const ct = contactById(s, m.contactId);
  const co = companyById(s, m.companyId) ?? {};
  const persona = callPersona(s, ct, co);
  m.transcript.push({ from: 'me', text });
  const turn = m.transcript.filter((t) => t.from === 'me').length;
  const history = m.transcript.slice(-16).map((t) => `${t.from === 'me' ? s.founder.name : persona.name}: ${t.text}`).join('\n');
  const res = await ctx.llm.ask({
    task: 'live_sales_call',
    system: `${personaSystem(s, ct, co, persona)}${segmentContext(s, ct, co, m)}\nThis is a live ${m.duration}-minute call (${m.kind === 'discovery' ? 'first discovery call' : m.kind === 'stakeholder' ? `a call with you as the ${roleLabel(ct?.committee?.role ?? 'stakeholder')} in this purchase` : 'follow-up'}). Your engagement so far: ${m.engagement.toFixed(1)}/10. Speak naturally, 1-4 sentences. Reveal hidden facts only in response to good, specific questions about your past and current situation. Hypothetical questions get vague answers. If they pitch features that are not in the shipped list, be skeptical and ask to see it. If they ask for a concrete next step and you have real pain and they've earned it, agree to something specific; otherwise deflect politely.`,
    prompt: `Call so far:\n${history}\n\nRespond as ${persona.name}. JSON only.`,
    schema: CALL_REPLY_SCHEMA, temperature: 0.8, maxTokens: 300,
    fallback: () => heuristicCallReply({ persona, text, turn, engagement: m.engagement, shipped: shippedFeatures(s), price: priceText(s), goodQuestions: countGoodQuestions(m.transcript) }),
  });
  const d = res.data ?? {};
  m.transcript.push({ from: 'them', text: String(d.reply ?? '…') });
  m.engagement = clamp(Number(d.engagement ?? m.engagement), 0, 10);
  if (d.agreedNextStep) m.agreed = true;
  if (res.mock) m.mock = true;
}

async function endCall(ctx, m) {
  const s = ctx.state;
  const ct = contactById(s, m.contactId);
  const co = companyById(s, m.companyId) ?? {};
  const transcript = m.transcript.map((t) => `${t.from === 'me' ? 'FOUNDER' : 'PROSPECT'}: ${t.text}`).join('\n');
  const competitors = personaFor(s, ct, co).competitorNames ?? [];
  const deal = dealOf(s, m);
  const method = deal?.method;
  const res = await ctx.llm.ask({
    task: 'call_scorecard',
    system: 'You are a strict sales coach (Gong-style call review) who also applies The Mom Test (Rob Fitzpatrick). Count only what is in the transcript. A "next step" means a concrete, dated commitment from the prospect; "keep me posted" or "send me info" is not one.',
    prompt: `Seller: ${s.company.name} (${s.company.oneLiner}). Prospect: ${contactName(ct)}, ${ct?.title} at ${co.name}. Competitors/tools the prospect knows: ${competitors.join(', ') || 'none'}.${ct?.committee ? ` Their role in the purchase: ${roleLabel(ct.committee.role)}.` : ''}${method ? ` Deal methodology: ${method.label} (critical: ${method.critical.join(', ')}). Coach against it.` : ''}\nTranscript:\n${transcript || '(empty)'}\n\nScore the founder. JSON only.`,
    schema: scorecardSchema(method), temperature: 0.2, maxTokens: 1100,
    fallback: () => heuristicScorecard(m.transcript, { competitors }),
  });
  const card = { ...heuristicScorecard(m.transcript, { competitors }), ...(res.data ?? {}) };
  if (!m.transcript.some((t) => t.from === 'me')) Object.assign(card, { discoveryQuality: 1, nextStepSecured: false });
  if (m.agreed && !card.nextStepSecured && res.mock) card.nextStepSecured = true;
  m.scorecard = card;
  m.cardMock = res.mock;
  m.status = 'held';
  const q = callQuality(card);
  const { qualified } = applyCallOutcome(s, m, card, q);
  m.qualified = qualified;
  m.quality = q;
  const ev = calendarEvent(s, m);
  if (ev) completeEvent(s, ev.id, 'done', qualified ? 'qualified' : 'not qualified');
  addActivity(s, { type: 'call', text: `Call held: discovery ${card.discoveryQuality}/10, talk ratio ${Math.round(card.talkRatio * 100)}%, ${card.nextStepSecured ? `next step: ${card.nextStep}` : 'no next step'}${qualified ? ' → qualified' : ''}`, companyId: m.companyId, contactId: m.contactId, dealId: m.dealId });
}

export default {
  id: 'calls',
  title: 'Calls',
  icon: '📞',
  group: 'Sales',
  models: ['smb', 'ent'],
  badge: (s) => (s.apps.calls?.meetings ?? []).filter((m) => m.status === 'ready' && m.day === s.day).length,
  onDay(state) { callsDay(state); },
  render(root, ctx) {
    const s = ctx.state;
    const calls = ensureCalls(s);
    ensureCrm(s);
    const m = ctx.params ? calls.meetings.find((x) => x.id === ctx.params) : null;
    mount(root, m ? meetingView(s, m) : html`
      <div class="app-head"><div><h1>Calls</h1><p>Your Zoom + call recorder. Join booked calls, run discovery like The Mom Test says, and get a Gong-style scorecard. Calls are on your calendar and use those hours automatically.</p></div></div>
      ${listView(s, calls)}`);
    const chat = root.querySelector('#chat');
    if (chat) chat.scrollTop = chat.scrollHeight;

    on(root, 'change', '#reminders', (e) => ctx.act(() => { calls.reminders = e.target.checked; }));
    if (!m) return;
    const ev = calendarEvent(s, m);
    on(root, 'click', '[data-remind]', () => ctx.act(() => { m.reminded = true; m.noShowP *= calls.reminders ? 0.9 : 0.8; }, { hours: HOURS.reminder, label: 'Meeting confirmation' }));
    on(root, 'click', '[data-cancel]', () => ctx.act((st) => {
      cancelMeeting(st, m, 'canceled by founder');
      const d = dealById(st, m.dealId);
      if (d) moveDeal(st, d, 'replied', 'meeting canceled');
    }, { hours: 0.05, label: 'Scheduling' }));
    on(root, 'click', '[data-move]', (e, el) => ctx.act((st) => {
      const [day, start] = el.dataset.move.split(':').map(Number);
      if (ev) moveEvent(st, ev.id, day, start);
      Object.assign(m, { day, start, rescheduled: m.rescheduled + 1, noShowP: Math.min(0.6, m.noShowP + 0.05) });
      addActivity(st, { type: 'meeting', text: `Call moved to ${slotText(st, { day, start })}`, companyId: m.companyId, contactId: m.contactId, dealId: m.dealId });
    }, { hours: HOURS.reschedule, label: 'Scheduling' }));
    on(root, 'click', '[data-rebook]', () => ctx.act((st) => {
      m.rebookTries = (m.rebookTries ?? 0) + 1;
      if (chance(st, SALES.rebookAfterNoShow / m.rebookTries)) {
        const slot = nextSlot(st, { minLead: 1 + (m.rebookTries > 1 ? 2 : 0), duration: m.duration });
        if (!slot) throw new Error('Your calendar has no free slot in the next 30 days.');
        const n = createMeeting(st, { contactId: m.contactId, slot, kind: m.kind, source: m.source, duration: m.duration });
        m.rebooked = n.id;
        toast(`They apologized and rebooked: ${slotText(st, slot)}.`, 'good');
      } else toast('No reply yet. You can nudge once more later.', 'warn');
    }, { hours: HOURS.reschedule, label: 'Rescheduling' }));
    on(root, 'click', '[data-join]', () => ctx.act((st) => {
      m.status = 'in_call';
      m.transcript = [];
      m.engagement = 5;
      if (ev) completeEvent(st, ev.id, 'in_progress');
    })); // hours already charged by the calendar
    const send = () => {
      const ta = root.querySelector('#sayText');
      const text = ta.value.trim();
      if (!text) return;
      draft[m.id] = '';
      ta.disabled = true;
      ctx.act(() => sayTurn(ctx, m, text));
    };
    on(root, 'input', '#sayText', (e) => { draft[m.id] = e.target.value; });
    on(root, 'keydown', '#sayText', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    on(root, 'submit', '#say', (e) => { e.preventDefault(); send(); });
    on(root, 'click', '[data-end]', (e) => {
      e.target.disabled = true; e.target.textContent = 'Scoring…';
      const turns = m.transcript.filter((t) => t.from === 'me').length;
      const words_ = m.transcript.reduce((a, t) => a + words(t.text), 0);
      // Post-call notes/CRM update; long calls overrun the calendar block.
      const extra = HOURS.followUp * 0.6 + (turns > 14 || words_ > 1500 ? 0.25 : 0);
      ctx.act(() => endCall(ctx, m), { hours: extra, label: 'Post-call notes' });
    });
  },
};
