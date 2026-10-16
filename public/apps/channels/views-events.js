// Channels -> Events tab: the event-led growth playbook. A numbered guide with deep links, the "host an event"
// designer (format, judged agenda and invitation, CRM guest list with anchors, budget, date, reminders), your hosted
// events with RSVPs, attendance and follow-up, and conferences tied to real CRM contacts (pre-booked meetings,
// captured conversations, follow-up).

import { html, on, formData, table, badge } from '../../core/ui.js';
import { money, fmtDate, round2, isWeekend } from '../../core/util.js';
import * as S from './sim.js';
import * as H from './hosted.js';
import * as E from './events-model.js';
import { judgeBox, currentJudged, wireJudgeHelper, meter, designTag } from './ui-common.js';

const statusBadge = (s) => badge(String(s).replace(/_/g, ' '), ['done', 'accepted'].includes(s) ? 'good' : ['rejected', 'missed'].includes(s) ? 'bad' : ['cfp', 'booked', 'invited'].includes(s) ? 'warn' : '');

// Module-level form state so re-renders never lose the guest list being built.
export const hostForm = { format: 'dinner', title: '', guestIds: new Set(), anchorIds: new Set(), budget: 'standard', daysAhead: 21, reminders: true, promoUsd: 0, filter: 'all' };
let talkFor = null;

function guide(s) {
  const crmN = (s.apps.crm?.contacts ?? []).filter((c) => !c.hidden).length;
  // Links inside this page scroll (the router owns the hash); other links deep-link to the app.
  const step = (n, text, link = null) => html`<li style="margin:4px 0"><b>${n}.</b> ${text}${link ? (link[0].startsWith('#/') ? html` <a href="${link[0]}">${link[1]} →</a>` : html` <a href="#/channels/events" data-scroll="${link[0].slice(1)}">${link[1]} ↓</a>`) : ''}</li>`;
  return html`<section class="panel"><h2>How to run an event that creates pipeline</h2>
    <ol style="list-style:none;padding-left:0;margin:0" class="small">
      ${step(1, html`Start from accounts, not from a venue: list the ICP companies you want in the room (${crmN} contacts in your CRM now).`, ['#/crm/prospects', 'Build a list in Prospects'])}
      ${step(2, 'Pick the format for the job: a dinner or roundtable of 8-20 senior buyers builds trust; a webinar scales but converts about 1% of attendees; a meetup mixes buyers with peers and vendors.', ['#host', 'Choose a format below'])}
      ${step(3, 'Write a peer-value topic and agenda: a real problem, a guest practitioner, open discussion. A product demo empties the room and burns the guest list.', ['#host-agenda', 'Write the agenda'])}
      ${step(4, 'Curate the guest list from CRM contacts at ICP accounts (right industry, size and role). Ask two or three anchor guests personally first: their yes makes everyone else say yes.', ['#host-guests', 'Pick guests'])}
      ${step(5, 'Send a short, personal invitation 2-6 weeks ahead (senior calendars fill up), with reminders the week and the day before.', ['#/calendar', 'Check your calendar'])}
      ${step(6, 'Host it: you are on the calendar; missing your own event burns every confirmed guest.')}
      ${step(7, html`Follow up the same evening or next morning with a personal note that references the conversation and one next step. ${designTag} Most event leads are cold within 72 hours (widely cited, unverified).`, ['#host-events', 'Your events'])}
      ${step(8, 'Meetings land as discovery calls in the CRM; work them like any deal.', ['#/crm/pipeline', 'Open the pipeline'])}
      ${step(9, 'Conferences: attend and pre-book meetings with target accounts 2-4 weeks before. A booth without pre-booked meetings is mostly badge scans of students and vendors.', ['#host-conf', 'Conferences'])}
    </ol>
    <p class="small muted">Research: webinar registration to live attendance 41.6-60% (ON24, Livestorm, TwentyThree); hosted dinners $3,500-8,000 for 12-20 guests, 80-90% of confirmed attend, 5-12 buyer conversations (Vendelux, single vendor, likely optimistic). Roundtable, meetup and summit numbers are game estimates.</p>
  </section>`;
}

function guestPicker(s) {
  const all = H.crmCandidates(s, { filter: hostForm.filter });
  const anyCrm = (s.apps.crm?.contacts ?? []).some((c) => !c.hidden);
  if (!anyCrm) return html`<div class="card" id="host-guests"><b>No CRM contacts yet.</b> <span class="small">Guests come from your CRM. Build a list in <a href="#/crm/prospects">Prospects</a>, <a href="#/crm/import">import a CSV</a> or add people you already know in <a href="#/crm/contacts">Contacts</a>.</span></div>`;
  const shown = all.slice(0, 150);
  return html`<div class="card" id="host-guests"><h3 style="margin-top:0">3. Guest list (from your CRM)</h3>
    <div class="inline" style="align-items:center;gap:8px;flex-wrap:wrap">
      <label>Show <select id="guestFilter">${[['all', 'All contacts'], ['targets', 'Target accounts (ABM)'], ['senior', 'Senior titles'], ['warm', 'Warm (already know you)'], ['nodeal', 'No open deal']].map(([k, l]) => html`<option value="${k}" ${hostForm.filter === k ? 'selected' : ''}>${l}</option>`)}</select></label>
      <button class="sm" id="guestAll">Tick all shown (${shown.length})</button> <button class="sm" id="guestNone">Clear</button>
      <span class="small"><b>${hostForm.guestIds.size}</b> invited · <b>${hostForm.anchorIds.size}</b>/3 anchors</span>
    </div>
    <p class="small muted">You see what a host sees: title, company, industry and size. Whether they are really in your ICP, in market, a peer or a vendor shows only in the room. Anchors are asked personally first (0.5 h each).</p>
    ${shown.length ? html`<div style="max-height:320px;overflow:auto">${table({ columns: [
      { key: 'i', label: 'Invite', render: (r) => html`<input type="checkbox" data-guest="${r.c.id}" style="width:auto" ${hostForm.guestIds.has(r.c.id) ? 'checked' : ''}/>` },
      { key: 'a', label: 'Anchor', render: (r) => html`<input type="checkbox" data-anchor="${r.c.id}" style="width:auto" ${hostForm.anchorIds.has(r.c.id) ? 'checked' : ''}/>` },
      { key: 'n', label: 'Name', render: (r) => html`${r.name}${r.c.warm ? html` ${badge('warm', 'good')}` : ''}${r.target ? html` ${badge(`target ${r.target}`, 'accent')}` : ''}` },
      { key: 't', label: 'Title', render: (r) => r.c.title || '—' },
      { key: 'co', label: 'Company', render: (r) => html`${r.co?.name ?? '—'} <span class="small muted">${[r.co?.industry, r.co?.size].filter(Boolean).join(' · ')}</span>` },
    ], rows: shown })}</div>` : html`<p class="small">Nobody matches this filter. ${hostForm.filter === 'targets' ? html`Mark target accounts in <a href="#/crm/prospects">Prospects</a> (ABM tiers) or switch the filter.` : ''}</p>`}
    ${all.length > shown.length ? html`<p class="small muted">Showing 150 of ${all.length}; narrow the filter.</p>` : ''}
  </div>`;
}

function hostDesigner(s) {
  const F = E.HOSTED[hostForm.format];
  if (!F.budgets[hostForm.budget]) hostForm.budget = Object.keys(F.budgets)[0];
  const day = s.day + Math.max(0, hostForm.daysAhead | 0);
  const agenda = currentJudged(s, 'event_agenda');
  const invite = currentJudged(s, 'event_invite');
  const spec = { format: hostForm.format, title: hostForm.title, agenda, invite, guestIds: [...hostForm.guestIds], anchorIds: [...hostForm.anchorIds], budget: hostForm.budget, day, reminders: hostForm.reminders, promoUsd: F.audience ? hostForm.promoUsd : 0 };
  const why = H.hostBlockers(s, spec);
  const hours = E.prepHours(hostForm.format, { guests: hostForm.guestIds.size, anchors: hostForm.anchorIds.size, reminders: hostForm.reminders });
  const b = F.budgets[hostForm.budget];
  const est = b.fixed + b.perGuest * Math.min(F.capacity, Math.max(F.minGuests, Math.round(hostForm.guestIds.size * 0.45)));
  const lead = hostForm.daysAhead | 0;
  const [lo, hi] = F.leadIdeal;
  return html`<section class="panel" id="host"><h2>Host an event</h2>
    <form id="hostForm" class="grid-2">
      <label>1. Format <select name="format">${Object.entries(E.HOSTED).map(([k, f]) => html`<option value="${k}" ${hostForm.format === k ? 'selected' : ''}>${f.label} (up to ${f.capacity})</option>`)}</select></label>
      <label>Title <input name="title" value="${hostForm.title}" placeholder="e.g. How 5 agency owners closed the books in 2 days"/></label>
      <label>Venue / budget <select name="budget">${Object.entries(F.budgets).map(([k, x]) => html`<option value="${k}" ${hostForm.budget === k ? 'selected' : ''}>${x.label}</option>`)}</select></label>
      <label>Date: days from today <input type="number" name="daysAhead" min="3" max="120" value="${lead}"/> <span class="small ${lead < lo ? 'bad' : ''}">${fmtDate(s, day)}${isWeekend(s, day) ? ' (weekend)' : ''} · ideal notice ${lo}-${hi} days</span></label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="reminders" style="width:auto;display:inline-block" ${hostForm.reminders ? 'checked' : ''}/> Reminders a week and a day before (+0.5h)</label>
      ${F.audience ? html`<label>Paid promotion (USD) <input type="number" name="promoUsd" min="0" step="100" value="${hostForm.promoUsd}"/> <span class="small muted">~$${E.PROMO_CPR} per registrant ${designTag}</span></label>` : html`<span class="small muted">Invitation-only: guests come from your list below.</span>`}
    </form>
    <p class="small muted">${F.note}</p>
    <div class="card" id="host-agenda">${judgeBox(s, 'event_agenda', { label: '2. Topic and agenda (peer value, not a pitch)', hours: 1, rows: 6, placeholder: 'What guests will discuss and learn, who the guest practitioner is, how the time is split. No product demo.' })}</div>
    ${guestPicker(s)}
    <div class="card">${judgeBox(s, 'event_invite', { label: '4. Invitation (personal, short: why them, who else, when, where)', hours: 0.5, rows: 5, placeholder: 'Hi {first_name}, I am hosting 12 ops leaders from ... for dinner on Thursday the 14th at 7pm ...' })}</div>
    <div class="card"><b>5. Plan</b>
      <div class="small">Prep ~${hours}h (format ${F.prepHours}h + ~5 min per invitee + anchors${hostForm.reminders ? ' + reminders' : ''}) · on the calendar ${round2(F.hostMin / 60)}h · estimated spend ${money(est + (F.audience ? hostForm.promoUsd : 0))}${b.perGuest && (hostForm.format === 'dinner' || hostForm.format === 'roundtable') ? ' (covers are guaranteed: no-shows still cost)' : ''}</div>
      ${why.length ? html`<div class="small" style="margin-top:6px"><b>Why you cannot host yet:</b><ul style="margin:4px 0 0 18px">${why.map((w) => html`<li>${w}</li>`)}</ul></div>` : ''}
      <button class="primary" id="hostGo" ${why.length ? 'disabled' : ''} title="${why.join(' ')}">Send invitations and book it (${hours}h)</button>
    </div>
  </section>`;
}

function hostedEvents(s) {
  const list = H.hostedSlice(s).list;
  const pending = list.some((e) => e.status === 'done' && !e.followed);
  return html`<section class="panel" id="host-events"><h2>Your hosted events</h2>
    ${table({ columns: [
      { key: 'title', label: 'Event', render: (e) => html`<b>${e.title}</b><br><span class="small muted">${E.HOSTED[e.format]?.label}</span>` },
      { key: 'day', label: 'Date', render: (e) => fmtDate(s, e.day) },
      { key: 'status', label: 'Status', render: (e) => statusBadge(e.status) },
      { key: 'r', label: 'Room', render: (e) => (e.results ? html`<span class="small">${e.results.invited} invited · ${e.results.rsvps} RSVPs${e.results.registrants ? ` · ${e.results.registrants} registered` : ''} · <b>${e.results.attended}</b> attended (${e.results.noShows} no-shows) · ${e.results.conversations} buyer conversations · ${Math.round(e.results.icpShare * 100)}% ICP · engagement ${Math.round(e.results.engagement * 100)}%</span>` : html`<span class="small">${e.guests.length} invited · ${H.rsvpsVisible(s, e) ?? 'RSVPs pending'}${H.rsvpsVisible(s, e) != null ? ' RSVPs' : ''} · ${e.anchors} anchor(s)</span>`) },
      { key: 'f', label: 'Follow-up', render: (e) => {
        if (e.followed) return html`<span class="small">${e.followed.personalized ? 'Personal' : 'Templated'}, ${e.followed.late === 0 ? 'same day' : `${e.followed.late} day(s) later`}: <b>${e.followed.meetings}</b> meetings in the CRM</span>`;
        if (e.status !== 'done') return '';
        const late = s.day - e.capturedDay;
        return html`<span class="small ${late >= 2 ? 'bad' : 'warn'}">${late === 0 ? 'Today: full value' : `${late} day(s) since: ~${Math.round(E.eventFollowUpFactor(late) * 100)}% of value left`}</span><br>
          <button class="sm primary" data-hfollow="${e.id}" data-personal="1">Personal notes (${H.followUpHours(e, true)}h)</button> <button class="sm" data-hfollow="${e.id}" data-personal="0">Template (${H.followUpHours(e, false)}h)</button>`;
      } },
    ], rows: list, empty: 'No hosted events yet. Design one above: a dinner for 12 ICP buyers is the highest-trust start.' })}
    ${pending || conferencePending(s) ? html`<div class="card">${judgeBox(s, 'event_followup', { label: 'Follow-up note (used for the next follow-up you send)', hours: 0.5, rows: 5, placeholder: 'Hi {first_name}, thanks for coming last night. You mentioned ... Here is the benchmark we discussed. Worth 20 minutes next week to ...?' })}</div>` : ''}
  </section>`;
}

const conferencePending = (s) => (S.ensureChannels(s).events.list ?? []).some((e) => e.leads && !e.leads.followed);

function conferencesPanel(s) {
  const C = S.ensureChannels(s);
  const confs = S.conferenceDates(s);
  const mine = C.events.list;
  const picked = hostForm.guestIds.size;
  return html`<section class="panel" id="host-conf"><h2>Conferences & meetups</h2>
    <p class="small muted">A 10×10 booth: $10k–$15k for space, $15k–$50k all-in; cost per lead ~$100–$900; ~80% of trade-show leads never get a follow-up (CEIR via vendors). Solo founders do better attending and booking meetings with target accounts in advance. CFPs close 3–9 months ahead ${designTag}.</p>
    ${table({ columns: [
      { key: 'name', label: 'Event' }, { key: 'day', label: 'Date', render: (c) => fmtDate(s, c.day) },
      { key: 'attendees', label: 'Attendees', align: 'right', render: (c) => c.attendees.toLocaleString() },
      { key: 'icp', label: 'ICP density', render: (c) => meter(c.icpDensity) },
      { key: 'cost', label: 'Booth all-in', align: 'right', render: (c) => money(c.boothAllIn) },
      { key: 'tix', label: 'Ticket + travel', align: 'right', render: (c) => money(c.ticket + c.travel) },
      { key: 'cfp', label: 'CFP closes', render: (c) => (s.day > c.cfpCloseDay ? badge('closed', '') : fmtDate(s, c.cfpCloseDay)) },
      { key: 'a', label: '', render: (c) => html`<button class="sm" data-attend="${c.id}">Attend</button> <button class="sm" data-booth="${c.id}">Booth</button> ${s.day <= c.cfpCloseDay ? html`<button class="sm" data-talk="${c.id}">Submit talk</button>` : ''}` },
    ], rows: confs })}
    ${talkFor ? html`<div class="card"><h3>Talk proposal for ${confs.find((c) => c.id === talkFor)?.name}</h3>
      ${judgeBox(s, 'talk', { label: 'Title + abstract (no vendor pitch)', hours: 1, rows: 7, placeholder: 'Title\n\nWhat the audience will learn, the story/data behind it, 3 takeaways…' })}
      <button class="primary" id="submitTalk">Submit to CFP (0.25h)</button></div>` : ''}
    <h3>Your conferences</h3>
    ${table({ columns: [
      { key: 'name', label: 'Event' }, { key: 'mode', label: 'How' }, { key: 'day', label: 'Date', render: (e) => fmtDate(s, e.day) },
      { key: 'status', label: 'Status', render: (e) => statusBadge(e.status) },
      { key: 'leads', label: 'Meetings & contacts', render: (e) => html`<span class="small">${e.prebooked ? `${e.prebooked} meetings pre-booked (${e.prebookAsks ?? 0} asks)` : 'no meetings pre-booked'}${e.leads ? ` · ${e.leads.total} captured, ${e.leads.real} real conversations in CRM${e.leads.followed ? ` → ${e.leads.followed.qualified} meetings` : ''}` : ''}</span>` },
      { key: 'a', label: '', render: (e) => html`${['booked', 'accepted'].includes(e.status) ? html`<button class="sm" data-prebook="${e.id}" ${picked ? '' : 'title="Tick target contacts in the guest list above to ask them by name"'}>${picked ? `Ask ${Math.min(picked, Math.floor((2 * 60) / S.PREBOOK_MIN_PER_ASK))} ticked contacts to meet (2h)` : 'Work the attendee list (2h)'}</button>` : ''}
        ${e.leads && !e.leads.followed ? html`<span class="small ${s.day - e.leads.capturedDay >= 2 ? 'bad' : 'warn'}">${s.day - e.leads.capturedDay} days since event</span> <button class="sm primary" data-follow="${e.id}" data-personal="1">Personal follow-ups (${round2(Math.max(0.5, e.leads.real * 10 / 60))}h)</button> <button class="sm" data-follow="${e.id}" data-personal="0">Templated (1h)</button>` : ''}` },
    ], rows: mine, empty: 'No conferences booked.' })}
  </section>`;
}

export const events = {
  id: 'events', label: 'Events',
  render(ctx) {
    const s = ctx.state;
    S.ensureChannels(s);
    return html`${guide(s)}${hostDesigner(s)}${hostedEvents(s)}${conferencesPanel(s)}`;
  },
  wire(root, ctx) {
    const s = ctx.state;
    on(root, 'change', '#hostForm', () => {
      const f = formData(root.querySelector('#hostForm'));
      const formatChanged = f.format !== hostForm.format;
      Object.assign(hostForm, { format: f.format, title: f.title ?? '', budget: formatChanged ? Object.keys(E.HOSTED[f.format].budgets)[0] : f.budget, daysAhead: Math.max(3, Math.min(120, f.daysAhead ?? 21)), reminders: Boolean(f.reminders), promoUsd: Math.max(0, f.promoUsd ?? 0) });
      ctx.render();
    });
    on(root, 'click', '[data-scroll]', (e, el) => { e.preventDefault(); root.querySelector(`#${el.dataset.scroll}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    on(root, 'input', '#hostForm input[name=title]', (e, el) => { hostForm.title = el.value; });
    on(root, 'change', '#guestFilter', (e, el) => { hostForm.filter = el.value; ctx.render(); });
    on(root, 'change', '[data-guest]', (e, el) => { const id = el.dataset.guest; if (el.checked) hostForm.guestIds.add(id); else { hostForm.guestIds.delete(id); hostForm.anchorIds.delete(id); } ctx.render(); });
    on(root, 'change', '[data-anchor]', (e, el) => {
      const id = el.dataset.anchor;
      if (el.checked) { if (hostForm.anchorIds.size >= 3) { ctx.toast('Three anchors is plenty: ask them personally.', 'warn'); el.checked = false; return; } hostForm.anchorIds.add(id); hostForm.guestIds.add(id); } else hostForm.anchorIds.delete(id);
      ctx.render();
    });
    on(root, 'click', '#guestAll', () => { for (const r of H.crmCandidates(s, { filter: hostForm.filter }).slice(0, 150)) hostForm.guestIds.add(r.c.id); ctx.render(); });
    on(root, 'click', '#guestNone', () => { hostForm.guestIds.clear(); hostForm.anchorIds.clear(); ctx.render(); });
    on(root, 'click', '#hostGo', () => {
      const F = E.HOSTED[hostForm.format];
      const spec = { format: hostForm.format, title: hostForm.title, agenda: currentJudged(ctx.state, 'event_agenda'), invite: currentJudged(ctx.state, 'event_invite'), guestIds: [...hostForm.guestIds], anchorIds: [...hostForm.anchorIds], budget: hostForm.budget, day: ctx.state.day + (hostForm.daysAhead | 0), reminders: hostForm.reminders, promoUsd: F.audience ? hostForm.promoUsd : 0 };
      const hours = E.prepHours(hostForm.format, { guests: spec.guestIds.length, anchors: spec.anchorIds.length, reminders: spec.reminders });
      ctx.act((st) => {
        const ev = H.hostEvent(st, spec);
        hostForm.guestIds.clear(); hostForm.anchorIds.clear();
        ctx.toast(`Invitations out for "${ev.title}" on ${fmtDate(st, ev.day)}. ${ev.anchors} anchor guest(s) confirmed. RSVPs show in a few days.`, 'good');
      }, { hours, label: `Hosting: ${F.label}` });
    });
    on(root, 'click', '[data-hfollow]', (e, el) => {
      const j = currentJudged(ctx.state, 'event_followup');
      if (!j) return ctx.toast('Write the follow-up note and get feedback first.', 'warn');
      const ev = H.hostedSlice(ctx.state).list.find((x) => x.id === el.dataset.hfollow);
      const personal = el.dataset.personal === '1';
      ctx.act((st) => { const r = H.followUpHosted(st, ev.id, { personalized: personal, judged: j }); ctx.toast(`${r.meetings} of ${r.contacted} attendees agreed to a call; they are in your CRM pipeline${r.late >= 2 ? `. ${r.late} days late cost you most of them` : ''}.`, r.meetings ? 'good' : 'info'); }, { hours: H.followUpHours(ev, personal), label: 'Event follow-up' });
    });
    const book = (id, mode, j) => ctx.act((st) => { const ev = S.bookConference(st, id, mode, j); ctx.toast(mode === 'speak' ? 'Talk submitted. You\'ll hear back in a few weeks.' : `${ev.name} booked and blocked on your calendar.`, 'good'); talkFor = null; }, { hours: mode === 'booth' ? 6 : mode === 'speak' ? 0.25 : 1, label: mode === 'booth' ? 'Booth planning' : 'Event booking' });
    on(root, 'click', '[data-attend]', (e, el) => book(el.dataset.attend, 'attend'));
    on(root, 'click', '[data-booth]', (e, el) => { if (confirm('Book a booth? You pay 50% now and the rest at the event. Pre-book meetings or it will be badge scans.')) book(el.dataset.booth, 'booth'); });
    on(root, 'click', '[data-talk]', (e, el) => { talkFor = el.dataset.talk; ctx.render(); });
    on(root, 'click', '#submitTalk', () => { const j = currentJudged(ctx.state, 'talk'); if (!j) return ctx.toast('Get feedback on the current abstract first.', 'warn'); book(talkFor, 'speak', j); });
    on(root, 'click', '[data-prebook]', (e, el) => ctx.act((st) => {
      const ids = [...hostForm.guestIds];
      const n = S.prebookMeetings(st, el.dataset.prebook, 2, { contactIds: ids.length ? ids : null });
      ctx.toast(`${n} ${ids.length ? 'of the people you asked' : 'attendees'} agreed to meet. Meetings are in your CRM and calendar.`, n ? 'good' : 'info');
    }, { hours: 2, label: 'Pre-booking event meetings' }));
    on(root, 'click', '[data-follow]', (e, el) => {
      const j = currentJudged(ctx.state, 'event_followup');
      if (!j) return ctx.toast('Write the follow-up note and get feedback first.', 'warn');
      const ev = S.ensureChannels(ctx.state).events.list.find((x) => x.id === el.dataset.follow);
      const personal = el.dataset.personal === '1';
      ctx.act((st) => { const r = S.followUpEventLeads(st, ev.id, { personalized: personal, judged: j }); ctx.toast(`${r.n} meetings booked in your CRM${r.late >= 2 ? ` — ${r.late} days late cost you some` : ''}.`, r.n ? 'good' : 'info'); }, { hours: personal ? round2(Math.max(0.5, ev.leads.real * 10 / 60)) : 1, label: 'Event follow-up' });
    });
    wireJudgeHelper(root, ctx, {
      talk: ['talk_abstract', 1, 60],
      event_agenda: ['event_agenda', 1, 30, () => ({ format: E.HOSTED[hostForm.format].label.toLowerCase() })],
      event_invite: ['event_invite', 0.5, 25, () => ({ format: E.HOSTED[hostForm.format].label.toLowerCase() })],
      event_followup: ['event_followup', 0.5, 25],
    });
  },
};
