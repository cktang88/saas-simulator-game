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
import { heuristicScorecard, heuristicCallReply, SCORECARD_SCHEMA, CALL_REPLY_SCHEMA, countGoodQuestions, questionCredits } from './sales/scorecard.js';
import { callQuality, stageLabel } from './sales/deals.js';
import { ensureCalls, ensureCrm, contactById, companyById, contactName, calendarEvent, createMeeting, nextSlot, cancelMeeting, moveDeal, dealById, slotText, addActivity } from './sales/model.js';
import { callsDay, applyCallOutcome } from './sales/engine.js';
import { personaSystem, cleanProspectText } from './sales/jobs.js';
import { segmentOf, stakeholderBrief, roleLabel, committeeContacts, methodCoverage } from './sales/segments.js';
import { scorecardSchema } from './sales/scorecard.js';
import { rubricText, weighted } from '../core/rubric.js';
import { SCORECARD_RUBRIC, CALL_PERSONA } from './sales/rubrics.js';
import { claimAutomated } from './automations/engine.js';
import { claimAssistant } from './assistant/engine.js';
import { NOTETAKER, ensureNotetaker, setNotetakerPlan, pushNotes, sendRecap, notesVisible, preCallBrief } from './sales/notetaker.js';
import { setNextStep } from './sales/model.js';
import { addMessage } from '../core/mail.js';
import { adviceFor, reviewFor } from '../core/advice.js';
import { recordSalesClaims } from './sales/claims.js';
import { variantForm, presellDealPanel, wireLearning } from './sales/learning-view.js';

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
        <h3>Settings</h3><label><input type="checkbox" id="reminders" ${calls.reminders ? 'checked' : ''} /> Automatic reminders (Calendly-style email + SMS 24h and 1h before)</label>
        ${notetakerSettings(s)}</section>
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
    ${(() => { const b = preCallBrief(s, ensureCalls(s).meetings, deal); return b ? html`<div class="callout"><b>Brief from your last call:</b> ${b.summary}${b.fields.length ? html`<div class="small">${b.fields.join(' · ')}</div>` : ''}</div>` : ''; })()}
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
  const judged = reviewFor(s, 'discovery_demo').tier != null; // a real founder has no grader: a reviewer source or learning mode grades the call
  return html`${header}<div class="grid-2">
    <section class="panel"><h2>${m.status === 'in_call' ? '🔴 Live' : 'Transcript'}</h2>
      <div class="chat" id="chat">${m.transcript.length ? m.transcript.map((t) => html`<div class="msg ${t.from}">${t.text}</div>`) : html`<p class="muted small">You're on. Say hi and start with a question about them.</p>`}</div>
      ${m.status === 'in_call' ? html`<form id="say" style="margin-top:8px"><textarea id="sayText" rows="3" placeholder="What do you say? (Enter to send, Shift+Enter for a new line)">${draft[m.id] ?? ''}</textarea>
        <div class="inline"><button class="primary">Say it</button><button type="button" class="danger" data-end>End call & score</button><span class="hint">${m.transcript.filter((t) => t.from === 'me').length} turns · engagement ${m.engagement.toFixed(1)}/10</span></div></form>` : ''}
    </section>
    ${card ? html`<section class="panel"><h2>Scorecard ${m.cardMock ? badge('offline heuristic') : badge('AI', 'accent')}</h2>
      <div class="stats">
        ${stat('Talk ratio (you)', pct(card.talkRatio, 0), '', card.talkRatio > 0.55 ? 'bad' : card.talkRatio > 0.45 ? 'warn' : 'good')}
        ${stat('Questions', card.questionsAsked)}
        ${judged ? stat('Discovery', `${card.discoveryQuality}/10`, '', card.discoveryQuality >= 7 ? 'good' : card.discoveryQuality <= 4 ? 'bad' : '') : ''}
        ${stat('Next step', card.nextStepSecured ? 'Secured' : 'None', card.nextStep, card.nextStepSecured ? 'good' : 'bad')}
      </div>
      ${card.competitiveHandling && card.competitiveHandling !== 'not_raised' ? html`<p>Competitor objection: ${badge(card.competitiveHandling, card.competitiveHandling === 'handled' ? 'good' : 'bad')}</p>` : ''}
      <h3>MEDDICC-lite</h3><p>${Object.entries(card.meddicc).map(([k, v]) => html`${badge(`${v ? '✓' : '✗'} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`, v ? 'good' : '')} `)}</p>
      ${methodPanel(s, m)}
      ${!judged ? '' : card.momTestViolations.length ? html`<h3>Mom Test violations</h3><ul class="small">${card.momTestViolations.map((v) => html`<li>${v}</li>`)}</ul>` : html`<p class="pos small">No Mom Test violations.</p>`}
      ${(() => { const adv = adviceFor(s, 'discovery_demo', card.coaching ?? []); return adv.length ? html`<h3>What your advisors say about this call</h3><ul class="small">${adv.map((a) => html`<li>${a.text} <span class="muted">(${a.from})</span></li>`)}</ul>` : ''; })()}
      <p class="small muted">${card.summary}</p>
      ${deal && !m.notes ? (deal.recap ? html`<p class="small">Recap sent ${fmtDate(s, deal.recap.day)}.</p>` : html`<button class="sm" data-recap>Send recap email (6 min)</button>`) : ''}
      ${deal && m.status === 'held' ? html`${variantForm(s, deal)}${presellDealPanel(s, deal)}` : ''}
      <div class="callout ${m.qualified ? 'good' : ''}">${m.qualified ? html`Outcome: <b>qualified opportunity</b>. Next: <a href="#/crm/company:${m.companyId}">send a proposal or pilot in the CRM</a>.` : html`Outcome: <b>not qualified</b> (yet). <a href="#/crm/company:${m.companyId}">follow up in the CRM</a>.`}</div>
    </section>` : prep}
  </div>${m.notes ? notesPanel(s, m, deal) : ''}`;
}

function notetakerSettings(s) {
  const nt = ensureNotetaker(s);
  return html`<h3>AI notetaker</h3>
    <label>Capture <select id="ntMode">${[['off', 'Off: I write notes myself (~12 min a call)'], ['bot', 'Bot joins the call (Fathom-style)'], ['local', 'Bot-free, records on my laptop (Granola-style)']].map(([k, l]) => html`<option value="${k}" ${nt.mode === k ? 'selected' : ''}>${l}</option>`)}</select></label>
    <label>Template <select id="ntTemplate">${[['discovery', 'Sales discovery'], ['meddicc', 'MEDDICC'], ['interview', 'Customer interview']].map(([k, l]) => html`<option value="${k}" ${nt.template === k ? 'selected' : ''}>${l}</option>`)}</select></label>
    <p class="small">Plan: ${Object.entries(NOTETAKER.plans).map(([k, p]) => html`<button class="sm ${nt.plan === k ? 'primary' : ''}" data-ntplan="${k}" ${nt.plan === k ? 'disabled' : ''}>${p.label}</button> `)}</p>
    <label><input type="checkbox" id="ntAuto" ${nt.autoShare ? 'checked' : ''} ${NOTETAKER.plans[nt.plan].push ? '' : 'disabled'} /> Auto-share notes to the CRM after every call (no review)</label>
    ${nt.mode === 'bot' ? html`<p class="hint warn">A recording bot needs consent: some US states require every party to agree (all-party consent). Announce it at the start; some prospects get more guarded.</p>` : ''}
    <p class="hint">Transcripts are 85–95% accurate; game estimate: 5–10% of proposed fields and action items are wrong or unsupported, more on long, noisy calls. Check each one against its transcript line.</p>`;
}

function notesPanel(s, m, deal) {
  const n = m.notes;
  if (!notesVisible(s, n)) return html`<section class="panel"><h2>AI notes</h2><p class="muted">Older than 30 days: hidden on the free plan.</p></section>`;
  const nt = ensureNotetaker(s);
  const canPush = NOTETAKER.plans[nt.plan].push;
  return html`<section class="panel"><h2>AI notes ${badge(n.status, n.status === 'pushed' ? 'good' : 'warn')} ${n.noisy ? badge('noisy call', 'warn') : ''}</h2>
    <p>${n.summary}</p>
    ${n.actionItems.length ? html`<h3>Action items</h3><ul class="small">${n.actionItems.map((a) => html`<li>${a.text} (${a.owner})</li>`)}</ul>` : ''}
    <h3>Proposed CRM updates</h3>
    ${n.fields.length ? html`<ul class="list small">${n.fields.map((f, i) => html`<li><b>${f.label}:</b> ${f.value} ${badge(f.conf === 'high' ? '● high' : '○ low', f.conf === 'high' ? 'good' : 'warn')}
      <div class="muted">Source line: “${(m.transcript[f.line]?.text ?? '').slice(0, 140)}”</div>
      ${n.status === 'pushed' ? '' : html`<div class="inline"><button class="sm ${f.decision === 'accept' ? 'primary' : ''}" data-fdec="${i}" data-v="accept">Keep</button><button class="sm ${f.decision === 'reject' ? 'danger' : ''}" data-fdec="${i}" data-v="reject">Drop</button></div>`}</li>`)}</ul>` : html`<p class="muted small">Nothing to update.</p>`}
    ${n.status === 'pushed' ? html`<p class="small muted">Pushed ${fmtDate(s, n.pushedDay)}${n.reviewed ? ' after review' : ' without review'}.</p>` : html`<div class="inline">
      ${canPush ? html`<button class="sm primary" data-pushrev>Push the fields I kept (${Math.round(NOTETAKER.hours.review * 60)} min review)</button><button class="sm" data-pushall>Push everything (2 min)</button>` : html`<button class="sm" data-pushrev>Copy the fields I kept into the CRM by hand (6 min)</button>`}</div>`}
    ${deal && !deal.recap ? html`<button class="sm" data-recap>Send recap email (6 min)</button>` : deal?.recap ? html`<p class="small">Recap sent ${fmtDate(s, deal.recap.day)} (${deal.recap.latency} day${deal.recap.latency === 1 ? '' : 's'} after the call).</p>` : ''}
  </section>`;
}

function methodPanel(s, m) {
  const deal = dealOf(s, m);
  const me = deal?.method;
  if (!me) return '';
  const cov = methodCoverage(deal);
  const learned = new Set((m.revealed ?? []));
  return html`<h3>${me.label} for this deal · ${Math.round((cov?.critical ?? 0) * 100)}% of critical elements known</h3>
    <p>${me.elements.map((e) => html`${badge(`${me.known?.[e.id] != null ? '✓' : '?'} ${e.label}${me.critical.includes(e.id) ? ' *' : ''}`, me.known?.[e.id] != null ? 'good' : me.critical.includes(e.id) ? 'warn' : '')} `)}</p>
    ${adviceFor(s, 'discovery_demo', me.elements.filter((e) => me.known?.[e.id] == null && me.critical.includes(e.id)).slice(0, 2).map((e) => `Next time ask (${e.label}): “${e.probeQuestions[0]}”`)).map((a) => html`<p class="small muted">${a.text} (${a.from})</p>`)}
    ${learned.size ? html`<p class="small pos">You learned who else is involved: ${committeeContacts(s, deal).filter((c) => learned.has(c.id)).map((c) => `${c.title} (${roleLabel(c.committee.role)})`).join(', ')}.</p>` : ''}`;
}

export async function sayTurn(ctx, m, text) {
  const s = ctx.state;
  const ct = contactById(s, m.contactId);
  const co = companyById(s, m.companyId) ?? {};
  const persona = callPersona(s, ct, co);
  m.transcript.push({ from: 'me', text });
  // What you tell a buyer is on the record: checked at the security review, pilot and after go-live (sales/claims.js).
  recordSalesClaims(s, { companyId: m.companyId, text, channel: 'call', dealId: m.dealId ?? null });
  const turn = m.transcript.filter((t) => t.from === 'me').length;
  const history = m.transcript.slice(-16).map((t) => `${t.from === 'me' ? s.founder.name : persona.name}: ${t.text}`).join('\n');
  const res = await ctx.llm.ask({
    task: 'live_sales_call',
    system: `${personaSystem(s, ct, co, persona, { know: 'call' })}${segmentContext(s, ct, co, m)}\n${CALL_PERSONA}\nThis is a live ${m.duration}-minute call (${m.kind === 'discovery' ? 'first discovery call' : m.kind === 'stakeholder' ? `a call with you as the ${roleLabel(ct?.committee?.role ?? 'stakeholder')} in this purchase` : 'follow-up'}). Your engagement so far: ${m.engagement.toFixed(1)}/10. Speak naturally, 1-4 sentences. Reveal hidden facts only in response to good, specific questions about your past and current situation. Hypothetical questions get vague answers. If they claim a capability that is not in the ground-truth list, be skeptical and ask to see it. If they ask for a concrete next step and you have real pain and they've earned it, agree to something specific; otherwise deflect politely.`,
    prompt: `Call so far:\n${history}\n\nRespond as ${persona.name}. JSON only.`,
    schema: CALL_REPLY_SCHEMA, temperature: 0.8, maxTokens: 1300,
    fallback: () => heuristicCallReply({ persona, text, turn, engagement: m.engagement, shipped: shippedFeatures(s), price: priceText(s), goodQuestions: countGoodQuestions(m.transcript) }),
  });
  const d = res.data ?? {};
  // The hidden person bounds what the model may say (no leaked WTP, no invented incidents), and a person without the
  // problem who is not just being polite cannot honestly agree to a real next step.
  const said = res.mock ? String(d.reply ?? '…') : cleanProspectText(s, persona, String(d.reply ?? '…'), { question: text, history: m.transcript.slice(-16).map((t) => ({ from: t.from, text: t.text })) });
  if (persona.person && !persona.hasPain && (persona.person.politeness ?? 0) < 0.55) d.agreedNextStep = false;
  m.transcript.push({ from: 'them', text: said });
  m.engagement = clamp(Number(d.engagement ?? m.engagement), 0, 10);
  if (d.agreedNextStep) m.agreed = true;
  if (res.mock) m.mock = true;
}

export async function endCall(ctx, m) {
  const s = ctx.state;
  if (m.status !== 'in_call') return; // already scored (a second click, or the day ended and callsDay scored it)
  const ct = contactById(s, m.contactId);
  const co = companyById(s, m.companyId) ?? {};
  const transcript = m.transcript.map((t) => `${t.from === 'me' ? 'FOUNDER' : 'PROSPECT'}: ${t.text}`).join('\n');
  const competitors = personaFor(s, ct, co).competitorNames ?? [];
  const deal = dealOf(s, m);
  const method = deal?.method;
  const res = await ctx.llm.ask({
    task: 'call_scorecard', rubric: SCORECARD_RUBRIC,
    system: `You are a strict sales coach (Gong-style call review) who also applies The Mom Test. Count only what is in the transcript. A "next step" means a concrete, dated commitment from the prospect; "keep me posted" or "send me info" is not one. A question only counts if the prospect's answer is in the transcript; stacked questions count once; a pasted list of questions with no follow-ups is question_craft 2 at best.\n${rubricText(SCORECARD_RUBRIC)}\nCredit pain_depth and quantified_impact only for what the founder's own focused, one-at-a-time questions drew out; details the prospect volunteered after stacked or leading questions count at most 3. Fill "rubric" first, then derive the other fields from the same evidence. Put the quote behind each score of 2 or lower in "coaching".`,
    prompt: `Seller: ${s.company.name} (${s.company.oneLiner}). Prospect: ${contactName(ct)}, ${ct?.title} at ${co.name}. Competitors/tools the prospect knows: ${competitors.join(', ') || 'none'}.${ct?.committee ? ` Their role in the purchase: ${roleLabel(ct.committee.role)}.` : ''}${method ? ` Deal methodology: ${method.label} (critical: ${method.critical.join(', ')}). Coach against it.` : ''}\nTranscript:\n${transcript || '(empty)'}\n\nScore the founder. JSON only.`,
    schema: scorecardSchema(method), temperature: 0.2, maxTokens: 3200,
    fallback: () => heuristicScorecard(m.transcript, { competitors }),
  });
  if (m.status !== 'in_call') return; // the day rolled over while the coach was scoring: callsDay already applied the outcome
  const card = { ...heuristicScorecard(m.transcript, { competitors }), ...(res.data ?? {}) };
  // Live model: discovery quality comes from the fixed-weight rubric, not the model's holistic 1-10.
  if (!res.mock && res.data?.rubric) card.discoveryQuality = Math.min(10, Math.max(1, Math.round(2 * (weighted(card.rubric, SCORECARD_RUBRIC) ?? 3))));
  // Anti-gaming: turns stacking 3+ discovery prompts earn no discovery credit, whatever the prospect volunteered.
  if (questionCredits(m.transcript).stacked.length >= 2) card.discoveryQuality = Math.min(card.discoveryQuality, 4);
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

/** Prep for a call: 15 min reading the account and your last notes, once per meeting; an approved Assistant brief cuts it. */
export function meetingPrepHours(state, m) {
  if (m.prepCharged) return 0;
  m.prepCharged = true;
  return claimAssistant(state, 'meeting_prep', 0.25);
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
    wireLearning(root, ctx);

    on(root, 'change', '#reminders', (e) => ctx.act(() => { calls.reminders = e.target.checked; }));
    on(root, 'change', '#ntMode', (e) => ctx.act((st) => { ensureNotetaker(st).mode = e.target.value; }, { hours: 0.1, label: 'Notetaker setup' }));
    on(root, 'change', '#ntTemplate', (e) => ctx.act((st) => { ensureNotetaker(st).template = e.target.value; }));
    on(root, 'change', '#ntAuto', (e) => ctx.act((st) => { ensureNotetaker(st).autoShare = e.target.checked; }));
    on(root, 'click', '[data-ntplan]', (e, el) => ctx.act((st) => setNotetakerPlan(st, el.dataset.ntplan), { hours: 0.1, label: 'Notetaker setup' }));
    if (m?.status === 'held') {
      on(root, 'click', '[data-fdec]', (e, el) => ctx.act(() => { m.notes.fields[Number(el.dataset.fdec)].decision = el.dataset.v; }));
      on(root, 'click', '[data-pushrev]', () => ctx.act((st) => { const r = pushNotes(st, m, dealById(st, m.dealId), { reviewed: true, setNextStep, addActivity }); toast(`Pushed ${r.pushed} field(s).`, 'good'); }, { hours: NOTETAKER.plans[ensureNotetaker(s).plan].push ? NOTETAKER.hours.review : NOTETAKER.hours.manualCopy, label: 'Reviewing call notes' }));
      on(root, 'click', '[data-pushall]', () => ctx.act((st) => { const r = pushNotes(st, m, dealById(st, m.dealId), { reviewed: false, setNextStep, addActivity }); toast(`Pushed ${r.pushed} field(s) without review.`, 'warn'); }, { hours: NOTETAKER.hours.pushOnly, label: 'Call notes' }));
      on(root, 'click', '[data-recap]', () => ctx.act((st) => {
        const d = dealById(st, m.dealId);
        sendRecap(st, m, d);
        const ct = contactById(st, m.contactId);
        if (ct?.threadId) addMessage(st, ct.threadId, { from: 'me', body: `Thanks for the time today. What I heard: ${m.notes?.summary ?? m.scorecard?.nextStep ?? ""} ${Object.values(d?.fields ?? {}).map((f) => f.value).join('; ')}` });
        toast('Recap sent.', 'good');
      }, { hours: NOTETAKER.hours.recap, label: 'Call recap' }));
    }
    if (!m) return;
    const ev = calendarEvent(s, m);
    on(root, 'click', '[data-remind]', () => ctx.act(() => { m.reminded = true; m.noShowP *= calls.reminders ? 0.9 : 0.8; }, { hours: HOURS.reminder, label: 'Meeting confirmation' }));
    on(root, 'click', '[data-cancel]', () => ctx.act((st) => {
      cancelMeeting(st, m, 'canceled by founder');
      const d = dealById(st, m.dealId);
      // Only a deal waiting on this first meeting goes back to "replied"; canceling a follow-up or stakeholder call
      // must not drag a qualified / proposal / contract deal backwards (it would drop out of the decision loop).
      if (d && d.stage === 'meeting_booked') moveDeal(st, d, 'replied', 'meeting canceled');
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
    on(root, 'click', '[data-join]', async () => {
      const prep = meetingPrepHours(s, m);
      const ok = await ctx.act((st) => {
        m.status = 'in_call';
        m.transcript = [];
        m.engagement = 5 - (ensureNotetaker(st).mode === 'bot' ? NOTETAKER.botEngagementCost : 0);
        if (ev) completeEvent(st, ev.id, 'in_progress');
        return true;
      }, { hours: prep, label: 'Meeting prep' }); // the call itself is charged by the calendar
      if (!ok && prep > 0) m.prepCharged = false; // rejected (e.g. out of hours): the prep hours were refunded, so they are still owed
    });
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
      // A real CRM write-up (notes, next step, fields) takes 10-15 min (d04). With the AI notetaker the write-up is
      // replaced by reviewing its notes (charged when you review), so the automation hook only applies without it.
      const overrun = turns > 14 || words_ > 1500 ? 0.25 : 0;
      const notetaker = ensureNotetaker(s).mode !== 'off';
      const hours = notetaker ? overrun : claimAutomated(s, 'crm_log_meeting', NOTETAKER.hours.manualNotes, { ref: m.id }) + overrun;
      ctx.act(() => endCall(ctx, m), { hours, label: notetaker ? 'Call overrun' : 'Post-call notes' });
    });
  },
};
