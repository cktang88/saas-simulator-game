// Calendar (Google Calendar / Cal.com style): week view, today's agenda with Join links into the app
// that owns each meeting, focus blocks, work hours, and a booking link that lets inbound contacts
// book into your free slots.

import { html, mount, on, formData, modal, toast, badge, stat } from '../core/ui.js';
import { ensureCalendar, scheduleEvent, cancelEvent, moveEvent, eventsOn, fmtTime, weekdayName } from '../core/calendar.js';
import { dayOfWeek, fmtDate, isoDate, money, round2 } from '../core/util.js';
import { hoursLeft } from '../core/state.js';
import {
  ensurePlanner, currentWeek, setWeekPlan, blockPriorities, reviewWeek, weekActuals, addOkr, krProgress, allKrs, chooseScheduler,
  plannerDay, TIME_CATEGORIES, KR_METRICS, SCHEDULER_PLANS, PLAN_HOURS, DRIFT, weekStartOf,
} from './assistant/planner.js';
import { claimAssistant } from './assistant/engine.js';
import { founderTimeRead } from './assistant/operators.js';
import { deadlines } from './calendar/deadlines.js';

const HOUR_PX = 38;
const FIRST_HOUR = 7, LAST_HOUR = 21;
const KIND_COLOR = { meeting: '--accent', call: '--accent', pitch: '--good', interview: '--cash', focus: '--muted', personal: '--warn', deadline: '--bad' };
const STATUS_TONE = { scheduled: 'accent', done: 'good', no_show: 'warn', missed: 'bad', unattended: 'bad', canceled: '' };

const dayFromIso = (state, iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(state.startDate + 'T12:00:00Z')) / 86400000);
const timeToMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const minToInput = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default {
  id: 'calendar',
  title: 'Calendar',
  icon: '📅',
  group: 'Home',
  badge: (state) => eventsOn(state, state.day).filter((e) => e.status === 'scheduled' && !['focus', 'personal'].includes(e.kind)).length || null,
  onDay: plannerDay,
  render(root, ctx) {
    const s = ctx.state;
    if ((ctx.params || '').startsWith('plan')) return renderPlan(root, ctx);
    const cal = ensureCalendar(s);
    const offset = Number(ctx.params || 0);
    const monday = s.day - ((dayOfWeek(s) + 6) % 7) + offset * 7;
    const days = Array.from({ length: 7 }, (_, i) => monday + i);
    const weekEvents = cal.events.filter((e) => e.day >= monday && e.day < monday + 7 && e.status !== 'canceled');
    const meetingHours = weekEvents.filter((e) => !['focus', 'personal', 'deadline'].includes(e.kind)).reduce((a, e) => a + e.duration / 60, 0);
    const focusHours = weekEvents.filter((e) => e.kind === 'focus').reduce((a, e) => a + e.duration / 60, 0);
    const today = eventsOn(s, s.day);
    const weekDue = deadlines(s, { fromDay: monday, toDay: monday + 7 });
    const soonDue = deadlines(s, { toDay: s.day + 30 });
    const upcoming = cal.events.filter((e) => e.day > s.day && e.status === 'scheduled').sort((a, b) => a.day - b.day || a.start - b.start).slice(0, 8);

    mount(root, html`
      <style>
        .cal-grid { display: grid; grid-template-columns: 44px repeat(7, minmax(90px, 1fr)); border: 1px solid var(--border); border-radius: 10px; overflow: auto; background: var(--panel); }
        .cal-head { position: sticky; top: 0; background: var(--panel-2); font-size: 12px; padding: 6px; border-bottom: 1px solid var(--border); text-align: center; }
        .cal-head.today { color: var(--accent); font-weight: 700; }
        .cal-col { position: relative; border-left: 1px solid var(--border); height: ${(LAST_HOUR - FIRST_HOUR) * HOUR_PX}px; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--border) ${HOUR_PX - 1}px, var(--border) ${HOUR_PX}px); }
        .cal-col.past { background-color: var(--panel-2); }
        .cal-hours { position: relative; height: ${(LAST_HOUR - FIRST_HOUR) * HOUR_PX}px; font-size: 10px; color: var(--muted); }
        .cal-hours span { position: absolute; right: 4px; transform: translateY(-6px); }
        .cal-ev { position: absolute; left: 2px; right: 2px; border-radius: 6px; padding: 2px 5px; font-size: 11px; overflow: hidden; cursor: pointer; color: #fff; line-height: 1.25; border: 1px solid rgb(0 0 0 / 0.08); }
        .cal-ev.focus { color: var(--text); background: repeating-linear-gradient(45deg, var(--panel-2), var(--panel-2) 6px, var(--border) 6px, var(--border) 7px) !important; }
        .cal-ev.st-missed, .cal-ev.st-unattended, .cal-ev.st-no_show { opacity: 0.55; text-decoration: line-through; }
        .cal-due { z-index: 2; text-decoration: none; white-space: nowrap; text-overflow: ellipsis; }
        .cal-work { position: absolute; left: 0; right: 0; background: var(--accent-soft); opacity: 0.35; pointer-events: none; }
      </style>
      <div class="app-head"><div><h1>Calendar</h1><p>Plan your week like a real founder: protect maker time, batch calls, leave buffers. Meetings take hours from your weekly budget on the day they happen; overbook and you miss them. Three or more meetings without a focus block costs an extra hour to context switching.</p></div>
        <div class="app-actions"><a class="btn primary" href="#/calendar/plan">Weekly plan${currentWeek(s) ? '' : ' (not set)'}</a><a class="btn" href="#/calendar/${offset - 1}">← Prev</a><a class="btn" href="#/calendar/0">This week</a><a class="btn" href="#/calendar/${offset + 1}">Next →</a><button class="primary" id="newEv">New event</button></div></div>
      <div class="stats">
        <div class="stat"><div class="stat-label">Meetings this week</div><div class="stat-value">${meetingHours.toFixed(1)}h</div><div class="stat-sub">${weekEvents.filter((e) => !['focus', 'personal', 'deadline'].includes(e.kind)).length} meetings</div></div>
        <div class="stat"><div class="stat-label">Focus blocks</div><div class="stat-value">${focusHours.toFixed(1)}h</div><div class="stat-sub">maker time planned</div></div>
        <div class="stat ${hoursLeft(s) < 5 ? 'warn' : ''}"><div class="stat-label">Hours left this week</div><div class="stat-value">${hoursLeft(s).toFixed(1)}h</div><div class="stat-sub">of ${s.founder.hoursPerWeek}h</div></div>
        <div class="stat"><div class="stat-label">Booking link</div><div class="stat-value" style="font-size:15px">${cal.bookingLink ? 'On' : 'Off'}</div><div class="stat-sub"><button class="sm" id="toggleLink">${cal.bookingLink ? 'Turn off' : 'Turn on'}</button></div></div>
      </div>
      <div class="grid-2" style="grid-template-columns: 1fr 2.4fr">
        <div>
          <section class="panel"><h2>Today · ${weekdayName(s, s.day)} ${fmtDate(s)}</h2>
            ${today.length ? html`<ul class="list">${today.map((e) => html`<li><b>${fmtTime(e.start)}</b> ${e.title} ${badge(e.status.replace('_', ' '), STATUS_TONE[e.status])}
              ${e.with?.name ? html`<div class="small muted">with ${e.with.name} · ${e.duration} min · ${e.location}</div>` : html`<div class="small muted">${e.duration} min</div>`}
              ${e.status === 'scheduled' && e.app ? html`<a class="btn sm primary" href="#/${e.app}/${e.refId ?? ''}">Join</a>` : ''}</li>`)}</ul>` : html`<p class="muted">Nothing scheduled. A clear day is a good day to build.</p>`}
          </section>
          <section class="panel"><h2>Deadlines · next 30 days</h2>
            ${soonDue.length ? html`<ul class="list small">${soonDue.slice(0, 10).map((d) => html`<li><span class="${d.overdue ? 'neg' : d.day === s.day ? 'warn' : 'muted'}">${d.overdue ? 'Overdue' : d.day === s.day ? 'Today' : `${weekdayName(s, d.day)} ${fmtDate(s, d.day)}`}</span><br /><a href="${d.href}">${d.title}</a>${d.note ? html` <span class="muted">· ${d.note}</span>` : ''}</li>`)}</ul>${soonDue.length > 10 ? html`<p class="hint">+${soonDue.length - 10} more</p>` : ''}` : html`<p class="muted">No filings, payments or customer deadlines in the next 30 days.</p>`}
          </section>
          <section class="panel"><h2>Upcoming</h2>
            ${upcoming.length ? html`<ul class="list small">${upcoming.map((e) => html`<li><span class="muted">${weekdayName(s, e.day)} ${fmtDate(s, e.day)} ${fmtTime(e.start)}</span><br />${e.title}</li>`)}</ul>` : html`<p class="muted">No upcoming meetings.</p>`}
          </section>
          <section class="panel"><h2>Work hours</h2>
            <form id="whForm" class="inline"><label>Start <input type="time" name="start" value="${minToInput(cal.workHours.start)}" /></label><label>End <input type="time" name="end" value="${minToInput(cal.workHours.end)}" /></label><button>Save</button></form>
            <p class="hint">Others can only book you inside these hours.</p>
          </section>
        </div>
        <div class="cal-grid">
          <div class="cal-head"></div>
          ${days.map((d) => html`<div class="cal-head ${d === s.day ? 'today' : ''}">${weekdayName(s, d)}<br />${fmtDate(s, d).replace(/, \d{4}$/, '')}</div>`)}
          <div class="cal-hours">${Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => html`<span style="top:${i * HOUR_PX}px">${fmtTime((FIRST_HOUR + i) * 60)}</span>`)}</div>
          ${days.map((d) => html`<div class="cal-col ${d < s.day ? 'past' : ''}" data-day="${d}">
            <div class="cal-work" style="top:${((cal.workHours.start - FIRST_HOUR * 60) / 60) * HOUR_PX}px;height:${((cal.workHours.end - cal.workHours.start) / 60) * HOUR_PX}px"></div>
            ${weekDue.filter((x) => (x.overdue ? d === s.day : x.day === d)).map((x, i) => html`<a class="cal-ev cal-due" href="${x.href}" title="${x.title}" style="top:${i * 18}px;height:16px;background:var(--bad)">⚑ ${x.title}</a>`)}
            ${weekEvents.filter((e) => e.day === d).map((e) => html`<div class="cal-ev ${e.kind === 'focus' ? 'focus' : ''} st-${e.status}" data-ev="${e.id}" title="${e.title}"
              style="top:${Math.max(0, ((e.start - FIRST_HOUR * 60) / 60) * HOUR_PX)}px;height:${Math.max(16, (e.duration / 60) * HOUR_PX - 2)}px;background:var(${KIND_COLOR[e.kind] ?? '--accent'})">
              <b>${fmtTime(e.start)}</b> ${e.title}</div>`)}
          </div>`)}
        </div>
      </div>`);

    const openNew = (day = s.day + 1, start = cal.workHours.start) => modal({
      title: 'New event',
      body: html`<label>Title <input name="title" required placeholder="Deep work: billing integration" /></label>
        <label>Type <select name="kind"><option value="focus">Focus block (maker time: build and writing work done inside it counts for more)</option><option value="meeting">Meeting</option><option value="personal">Personal (gym, family, doctor)</option></select></label>
        <div class="grid-2"><label>Date <input type="date" name="date" min="${isoDate(s)}" value="${isoDate(s, Math.max(day, s.day))}" required /></label>
        <label>Start <input type="time" name="start" value="${minToInput(start)}" step="900" required /></label></div>
        <label>Duration (minutes) <input type="number" name="duration" min="15" max="480" step="15" value="${90}" /></label>
        <label>With (optional) <input name="with" placeholder="Name" /></label>`,
      actions: [{ label: 'Cancel' }, {
        label: 'Create', primary: true,
        onClick: (d, form) => {
          const f = formData(form);
          try {
            ctx.act((st) => scheduleEvent(st, { title: f.title, kind: f.kind, day: dayFromIso(st, f.date), start: timeToMin(f.start), duration: f.duration, with: f.with ? { name: f.with } : null }), { hours: 0.05, label: 'Calendar' });
          } catch (e) { toast(e.message, 'bad'); return false; }
        },
      }],
    });

    on(root, 'click', '#newEv', () => openNew());
    on(root, 'dblclick', '.cal-col', (e, el) => {
      if (e.target.closest('.cal-ev')) return;
      const rect = el.getBoundingClientRect();
      const min = Math.round(((e.clientY - rect.top) / HOUR_PX) * 60 / 15) * 15 + FIRST_HOUR * 60;
      openNew(Number(el.dataset.day), min);
    });
    on(root, 'click', '#toggleLink', () => ctx.act((st) => { ensureCalendar(st).bookingLink = !ensureCalendar(st).bookingLink; }));
    on(root, 'submit', '#whForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => { ensureCalendar(st).workHours = { start: timeToMin(f.start), end: timeToMin(f.end) }; });
    });
    on(root, 'click', '[data-ev]', (e, el) => {
      const ev = cal.events.find((x) => x.id === el.dataset.ev);
      if (!ev) return;
      modal({
        title: ev.title,
        body: html`<p>${weekdayName(s, ev.day)} ${fmtDate(s, ev.day)}, ${fmtTime(ev.start)}–${fmtTime(ev.start + ev.duration)} · ${ev.kind} ${badge(ev.status.replace('_', ' '), STATUS_TONE[ev.status])}</p>
          ${ev.with?.name ? html`<p>With ${ev.with.name}${ev.with.email ? ` <${ev.with.email}>` : ''}</p>` : ''}
          ${ev.location ? html`<p class="muted">${ev.location}</p>` : ''}${ev.notes ? html`<p>${ev.notes}</p>` : ''}
          ${ev.status === 'scheduled' && ev.day >= s.day ? html`<div class="grid-2"><label>Move to date <input type="date" name="date" min="${isoDate(s)}" value="${isoDate(s, ev.day)}" /></label><label>Start <input type="time" name="start" value="${minToInput(ev.start)}" step="900" /></label></div>
            <p class="hint">Moving a meeting someone else booked often annoys them; it may get declined or bumped.</p>` : ''}`,
        actions: [
          { label: 'Close' },
          ...(ev.status === 'scheduled' && ev.app && ev.day === s.day ? [{ label: 'Join', onClick: () => ctx.navigate(ev.app, ev.refId ?? '') }] : []),
          ...(ev.status === 'scheduled' ? [{ label: 'Cancel event', danger: true, onClick: () => { ctx.act((st) => cancelEvent(st, ev.id, 'canceled_by_founder')); } }] : []),
          ...(ev.status === 'scheduled' && ev.day >= s.day ? [{
            label: 'Move', primary: true,
            onClick: (d, form) => {
              const f = formData(form);
              try { ctx.act((st) => { const moved = moveEvent(st, ev.id, dayFromIso(st, f.date), timeToMin(f.start)); if (moved?.app) moved.movedByFounder = true; }, { hours: 0.05, label: 'Calendar' }); } catch (err) { toast(err.message, 'bad'); return false; }
            },
          }] : []),
        ],
      });
    });
  },
};

// ---------------------------------------------------------------------------
// Weekly plan, OKRs and time-blocking (Reclaim / Motion / Notion style). Engine: assistant/planner.js.
// ---------------------------------------------------------------------------
const planDraft = { rows: null };

function renderPlan(root, ctx) {
  const s = ctx.state;
  const P = ensurePlanner(s);
  const wk = currentWeek(s);
  const a = weekActuals(s);
  const krs = allKrs(s);
  const read = founderTimeRead(s);
  const past = Object.values(P.weeks).filter((w) => w.weekStart < weekStartOf(s)).sort((x, y) => y.weekStart - x.weekStart).slice(0, 8);
  planDraft.rows ??= Array.from({ length: 5 }, () => ({ text: '', category: 'build', krId: '', hours: 0 }));
  const sched = SCHEDULER_PLANS[P.scheduler.plan];
  const dow = dayOfWeek(s);
  mount(root, html`
    <div class="app-head"><div><h1>Weekly plan</h1><p>Monday: pick at most three priorities tied to a key result and block time for them. Friday: compare the plan with where your hours actually went and name one thing to stop. The calendar charges meetings first; whatever is left is what you can spend on priorities.</p></div>
      <div class="app-actions"><a class="btn" href="#/calendar/0">← Calendar</a></div></div>
    <div class="stats">
      ${stat('On priorities this week', a.share == null ? '—' : `${Math.round(a.share * 100)}%`, `${a.onPriorities}h of ${a.total}h logged`, a.share != null && a.share < DRIFT.shareFloor && a.total >= 10 ? 'warn' : '')}
      ${stat('Deep work in focus blocks', `${a.focusUsed}h`, 'this week')}
      ${stat('Meetings', `${a.meetings}h`, `${a.fragmented} fragmented day${a.fragmented === 1 ? '' : 's'}`)}
      ${stat('Your time read', read.tier === 'unknown' ? '—' : read.tier, read.evidence?.[0] ?? 'plan two weeks to get a read')}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>This week ${wk ? html`<span class="small muted">planned ${fmtDate(s, wk.plannedDay)}</span>` : ''}</h2>
        ${wk ? html`<div class="table-wrap"><table><thead><tr><th>Priority</th><th>Area</th><th class="r">Planned</th><th class="r">Blocked</th><th class="r">Actual (area)</th></tr></thead><tbody>
          ${wk.priorities.map((p) => html`<tr><td>${p.text}${p.krId ? html`<div class="small muted">→ ${krs.find((k) => k.id === p.krId)?.label ?? ''}</div>` : ''}</td><td class="small">${TIME_CATEGORIES[p.category]}</td><td class="r">${p.hours}h</td><td class="r">${p.blocked}h</td><td class="r">${a.by[p.category] ?? 0}h</td></tr>`)}
          </tbody></table></div>
          <div class="inline"><button id="blockFixed">Block focus time (fixed)</button>${sched ? html`<button id="blockFlex">Let ${sched.name} place flexible blocks</button>` : ''}<span class="hint">Half-day blocks (2-3h) count most. Fixed blocks hold; flexible ones move when meetings land, and a block moved twice is thrash.</span></div>
          <h3>Friday review</h3>
          ${wk.review ? html`<p class="small">Reviewed ${fmtDate(s, wk.review.day)}: ${Math.round((wk.review.share ?? 0) * 100)}% on priorities. Stop doing: ${wk.review.stopDoing || html`<span class="neg">nothing named</span>`}</p>` : ''}
          <form id="reviewForm" class="inline"><label>One thing to stop next week <input name="stopDoing" placeholder="Taking intro calls that do not move a deal or a hire" /></label><button ${dow >= 4 || dow === 0 ? '' : 'disabled'}>Review the week (15 min)</button></form>
          ${dow >= 1 && dow < 4 ? html`<p class="hint">The review opens on Thursday.</p>` : ''}`
        : html`<form id="planForm">
          ${planDraft.rows.map((r, i) => html`<div class="grid-4" style="grid-template-columns: 2fr 1fr 1fr 70px; gap:6px">
            <input name="text_${i}" value="${r.text}" placeholder="${i < 3 ? `Priority ${i + 1}: an outcome, not a task list` : 'optional'}" />
            <select name="cat_${i}">${Object.entries(TIME_CATEGORIES).filter(([k]) => k !== 'other').map(([k, l]) => html`<option value="${k}" ${r.category === k ? 'selected' : ''}>${l}</option>`)}</select>
            <select name="kr_${i}"><option value="">No key result</option>${krs.map((k) => html`<option value="${k.id}" ${r.krId === k.id ? 'selected' : ''}>${k.label}</option>`)}</select>
            <input type="number" name="hours_${i}" min="0" max="40" step="0.5" value="${r.hours || ''}" placeholder="h" /></div>`)}
          <div class="inline" style="margin-top:8px"><button class="primary">Set this week's plan (${PLAN_HOURS.weekly * 60} min)</button><span class="hint">Three priorities beat nine. Hours = the maker time each needs.</span></div></form>`}
      </section>
      <section class="panel"><h2>Where the hours went</h2>
        ${a.total ? html`<table><tbody>${Object.entries(a.by).sort((x, y) => y[1] - x[1]).map(([c, h]) => html`<tr><td>${TIME_CATEGORIES[c]}${wk?.priorities.some((p) => p.category === c) ? html` ${badge('priority', 'accent')}` : ''}</td><td class="r">${h}h</td><td style="width:40%"><div class="meter"><div style="width:${Math.min(100, (h / a.total) * 100)}%"></div></div></td></tr>`)}</tbody></table>` : html`<p class="muted">Nothing logged yet this week.</p>`}
        ${read.coaching?.length ? read.coaching.map((c) => html`<div class="callout warn small">${c}</div>`) : ''}
      </section>
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Objectives and key results</h2>
        ${P.okrs.length ? P.okrs.map((o) => html`<div style="margin-bottom:10px"><b>${o.objective}</b> <span class="small muted">by ${fmtDate(s, o.dueDay)}</span>
          ${o.krs.map((k) => { const pr = krProgress(s, k); return html`<div class="small">${k.label}: ${k.metric === 'mrr' ? money(pr.current) : round2(pr.current)} / ${k.metric === 'mrr' ? money(k.target) : k.target}<div class="meter"><div style="width:${Math.min(100, pr.pct * 100)}%"></div></div></div>`; })}</div>`) : html`<p class="muted small">No objectives yet. Progress is read from your real numbers.</p>`}
        <form id="okrForm"><label>Objective <input name="objective" placeholder="Prove small agencies will pay" /></label>
          ${[0, 1, 2].map((i) => html`<div class="grid-2" style="gap:6px"><select name="m_${i}"><option value="">Key result ${i + 1}…</option>${Object.entries(KR_METRICS).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select><input type="number" name="t_${i}" placeholder="target" /></div>`)}
          <label>Due <input type="number" name="days" value="90" min="14" max="365" /> days</label>
          <button>Add objective (30 min)</button></form>
      </section>
      <section class="panel"><h2>AI calendar</h2>
        <p class="small muted">An AI scheduler places flexible focus blocks around your meetings and moves them when a meeting lands. It saves the manual blocking but can thrash when estimates are wrong, and it only helps if you also cut meetings.</p>
        <div class="table-wrap"><table><tbody>${Object.entries(SCHEDULER_PLANS).map(([id, p]) => html`<tr><td><b>${p.name}</b><div class="small muted">${p.note}</div></td><td class="r">${money(p.price)}/mo</td><td>${P.scheduler.plan === id ? badge('current', 'good') : html`<button class="sm" data-sched="${id}">Choose</button>`}</td></tr>`)}</tbody></table></div>
        ${P.scheduler.plan ? html`<button class="sm" data-sched="">Cancel</button>` : ''}
        <h3>Past weeks</h3>
        ${past.length ? html`<table><tbody>${past.map((w) => html`<tr><td class="small">${fmtDate(s, w.weekStart)}</td><td class="small">${w.priorities.length} priorities</td><td class="r">${w.final?.share != null ? `${Math.round(w.final.share * 100)}%` : '—'}</td><td>${w.review ? badge('reviewed', 'good') : badge('no review')}</td></tr>`)}</tbody></table>` : html`<p class="muted small">No past plans.</p>`}
      </section>
    </div>`);

  on(root, 'input', '#planForm', (e) => {
    const m = e.target.name?.match(/^(text|cat|kr|hours)_(\d)$/);
    if (!m) return;
    const r = planDraft.rows[+m[2]];
    if (m[1] === 'text') r.text = e.target.value; else if (m[1] === 'cat') r.category = e.target.value; else if (m[1] === 'kr') r.krId = e.target.value; else r.hours = Number(e.target.value) || 0;
  });
  on(root, 'submit', '#planForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const rows = planDraft.rows.map((_, i) => ({ text: f[`text_${i}`], category: f[`cat_${i}`], krId: f[`kr_${i}`], hours: f[`hours_${i}`] }));
    if (!rows.some((r) => String(r.text ?? '').trim())) return toast('Write at least one priority.', 'warn');
    const hours = claimAssistant(ctx.state, 'metrics_digest', PLAN_HOURS.weekly);
    ctx.act((st) => {
      setWeekPlan(st, rows);
      if (ensurePlanner(st).scheduler.plan) blockPriorities(st, { flexible: true });
      planDraft.rows = null;
    }, { hours, label: 'Weekly planning' });
  });
  on(root, 'click', '#blockFixed', () => {
    let n = 0;
    ctx.act((st) => { n = blockPriorities(st, { flexible: false }).length; toast(n ? `Blocked ${n} focus block${n === 1 ? '' : 's'}.` : 'No free slots left this week, or everything is blocked.'); }, { hours: PLAN_HOURS.blockEach * 4, label: 'Calendar' });
  });
  on(root, 'click', '#blockFlex', () => ctx.act((st) => { const n = blockPriorities(st, { flexible: true }).length; toast(n ? `${n} flexible block${n === 1 ? '' : 's'} placed.` : 'Nothing left to place.'); }));
  on(root, 'submit', '#reviewForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => reviewWeek(st, f), { hours: PLAN_HOURS.review, label: 'Weekly review' }); });
  on(root, 'submit', '#okrForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const k = [0, 1, 2].filter((i) => f[`m_${i}`]).map((i) => ({ metric: f[`m_${i}`], target: f[`t_${i}`] }));
    ctx.act((st) => addOkr(st, { objective: f.objective, krs: k, dueDay: st.day + (Number(f.days) || 90) }), { hours: PLAN_HOURS.okr, label: 'Planning OKRs' });
  });
  on(root, 'click', '[data-sched]', (e, el) => ctx.act((st) => chooseScheduler(st, el.dataset.sched || null), { hours: el.dataset.sched && !P.scheduler.plan ? PLAN_HOURS.schedulerSetup : 0, label: 'AI calendar setup' }));
}
