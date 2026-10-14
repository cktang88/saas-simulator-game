// Calendar (Google Calendar / Cal.com style): week view, today's agenda with Join links into the app
// that owns each meeting, focus blocks, work hours, and a booking link that lets inbound contacts
// book into your free slots.

import { html, mount, on, formData, modal, toast, badge } from '../core/ui.js';
import { ensureCalendar, scheduleEvent, cancelEvent, moveEvent, eventsOn, fmtTime, weekdayName } from '../core/calendar.js';
import { dayOfWeek, fmtDate, isoDate } from '../core/util.js';
import { hoursLeft } from '../core/state.js';

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
  render(root, ctx) {
    const s = ctx.state;
    const cal = ensureCalendar(s);
    const offset = Number(ctx.params || 0);
    const monday = s.day - ((dayOfWeek(s) + 6) % 7) + offset * 7;
    const days = Array.from({ length: 7 }, (_, i) => monday + i);
    const weekEvents = cal.events.filter((e) => e.day >= monday && e.day < monday + 7 && e.status !== 'canceled');
    const meetingHours = weekEvents.filter((e) => !['focus', 'personal', 'deadline'].includes(e.kind)).reduce((a, e) => a + e.duration / 60, 0);
    const focusHours = weekEvents.filter((e) => e.kind === 'focus').reduce((a, e) => a + e.duration / 60, 0);
    const today = eventsOn(s, s.day);
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
        .cal-work { position: absolute; left: 0; right: 0; background: var(--accent-soft); opacity: 0.35; pointer-events: none; }
      </style>
      <div class="app-head"><div><h1>Calendar</h1><p>Plan your week like a real founder: protect maker time, batch calls, leave buffers. Meetings take hours from your weekly budget on the day they happen; overbook and you miss them. Three or more meetings without a focus block costs an extra hour to context switching.</p></div>
        <div class="app-actions"><a class="btn" href="#/calendar/${offset - 1}">← Prev</a><a class="btn" href="#/calendar/0">This week</a><a class="btn" href="#/calendar/${offset + 1}">Next →</a><button class="primary" id="newEv">New event</button></div></div>
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
            ${weekEvents.filter((e) => e.day === d).map((e) => html`<div class="cal-ev ${e.kind === 'focus' ? 'focus' : ''} st-${e.status}" data-ev="${e.id}" title="${e.title}"
              style="top:${Math.max(0, ((e.start - FIRST_HOUR * 60) / 60) * HOUR_PX)}px;height:${Math.max(16, (e.duration / 60) * HOUR_PX - 2)}px;background:var(${KIND_COLOR[e.kind] ?? '--accent'})">
              <b>${fmtTime(e.start)}</b> ${e.title}</div>`)}
          </div>`)}
        </div>
      </div>`);

    const openNew = (day = s.day + 1, start = cal.workHours.start) => modal({
      title: 'New event',
      body: html`<label>Title <input name="title" required placeholder="Deep work: billing integration" /></label>
        <label>Type <select name="kind"><option value="focus">Focus block (maker time)</option><option value="meeting">Meeting</option><option value="personal">Personal (gym, family, doctor)</option></select></label>
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
