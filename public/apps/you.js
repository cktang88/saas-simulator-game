// You: the founder as a person. Energy, where your hours went, life events, and the habits that keep you
// going. Grounded in docs/research/world-ops-support-life.md (WELLBEING): ~54% of founders report
// burnout in a year; 60h+ weeks roughly double the risk.

import { html, mount, on, formData, lineChart, badge, stat, toast } from '../core/ui.js';
import { ensureWellbeing, capacityMult, respondLife, lifeEventTypes } from '../core/wellbeing.js';
import { hoursLeft } from '../core/state.js';
import { fmtDate } from '../core/util.js';
import { personalRunwayMonths } from '../core/personal.js';

export default {
  id: 'you',
  title: 'You',
  icon: '🧘',
  group: 'Home',
  badge: (state) => (state.founder.wellbeing?.events ?? []).filter((e) => e.status === 'needs_response').length || null,
  render(root, ctx) {
    const s = ctx.state;
    const f = s.founder;
    const wb = ensureWellbeing(s);
    const cap = capacityMult(s);
    const weekLog = (f.timeLog ?? []).filter((t) => t.day >= (f.weekStartDay ?? 0));
    const byLabel = {};
    for (const t of weekLog) byLabel[t.label] = (byLabel[t.label] ?? 0) + t.hours;
    const rows = Object.entries(byLabel).sort((a, b) => b[1] - a[1]);
    const open = wb.events.filter((e) => e.status === 'needs_response');
    const types = lifeEventTypes();
    const runway = personalRunwayMonths(s);
    mount(root, html`
      <div class="app-head"><div><h1>You</h1><p>You are the company's only irreplaceable resource. Around half of founders report burnout in a given year. Long weeks feel productive until they aren't: low energy makes you slower and sloppier, and burnout takes weeks to recover from.</p></div></div>
      <div class="stats">
        ${stat('Energy', Math.round(f.energy), f.energy < 20 ? 'burnout zone' : f.energy < 40 ? 'running low: ~20% slower' : 'okay', f.energy < 20 ? 'bad' : f.energy < 40 ? 'warn' : 'good')}
        ${stat('Capacity now', `${Math.round(cap * 100)}%`, wb.effects.length ? wb.effects.map((e) => e.label).join(', ') : 'nothing in the way')}
        ${stat('Hours left this week', `${hoursLeft(s).toFixed(1)}h`, `of ${f.hoursPerWeek}h`)}
        ${stat('Personal runway', runway === Infinity ? 'Covered' : `${runway.toFixed(1)} mo`, 'see Financing', runway < 4 ? 'bad' : '')}
      </div>
      ${open.length ? html`<section class="panel"><h2>Needs your decision</h2>${open.map((e) => {
        const responses = e.responses?.length ? e.responses : (types.find((t) => t.id === e.type)?.playerResponses ?? []);
        return html`<div class="callout bad"><b>${e.label}</b> · ${fmtDate(s, e.day)}<p>${e.text || ''}</p><p class="small">Capacity about ${Math.round(e.capacityMult * 100)}% for ~${e.durationDays} days${e.cost ? `, unexpected cost $${e.cost.toLocaleString()}` : ''}.</p>
          <div class="inline">${responses.map((r) => html`<button data-ev="${e.id}" data-resp="${r.id}">${r.label}${r.cost ? ` ($${r.cost.toLocaleString()})` : ''}${r.hours ? ` · ${r.hours}h` : ''}</button>`)}</div></div>`;
      })}</section>` : ''}
      <div class="grid-2">
        <section class="panel"><h2>Energy over time</h2><canvas id="energyChart"></canvas>
          <p class="small muted">Weeks over 55 hours drain energy (and 70h weeks about twice as fast). Lighter weeks with a real day off restore it.</p></section>
        <section class="panel"><h2>Where this week's hours went</h2>
          ${rows.length ? html`<table><tbody>${rows.map(([l, h]) => html`<tr><td>${l}</td><td class="r">${h.toFixed(1)}h</td></tr>`)}</tbody></table>` : html`<p class="muted">Nothing logged yet this week.</p>`}</section>
      </div>
      <div class="grid-2">
        <section class="panel"><h2>How you work</h2>
          <form id="habits">
            <label>Hours per week you plan to work <input type="number" name="hoursPerWeek" min="10" max="90" value="${f.hoursPerWeek}" /></label>
            <p class="hint">${f.hoursPerWeek > 60 ? 'Over 60h a week, roughly half of founders burn out within a year.' : f.hoursPerWeek <= 55 ? 'Sustainable for most people, with a real day off.' : 'Borderline: watch your energy.'}</p>
            <label><input type="checkbox" name="dayOff" ${wb.dayOff ? 'checked' : ''} /> Protect one real day off per week</label>
            <label><input type="checkbox" name="peerGroup" ${wb.peerGroup ? 'checked' : ''} /> Founder peer group (2h every two weeks; softens the drain)</label>
            <label><input type="checkbox" name="therapy" ${wb.therapy ? 'checked' : ''} /> Therapist or coach (~$600/month from personal money)</label>
            <button class="primary">Save</button>
          </form>
        </section>
        <section class="panel"><h2>Your circumstances</h2>
          <form id="life">
            <label><input type="checkbox" name="hasYoungKids" ${wb.hasYoungKids ? 'checked' : ''} /> Young kids at home</label>
            <label><input type="checkbox" name="renter" ${wb.renter ? 'checked' : ''} /> Renting</label>
            <label><input type="checkbox" name="age45plus" ${wb.age45plus ? 'checked' : ''} /> 45 or older</label>
            <p class="hint">These change how often life gets in the way (illness, caregiving, moving), at roughly real-world rates.</p>
            <button>Save</button>
          </form>
          <h3>Life so far</h3>
          ${wb.events.length ? html`<ul class="list small">${wb.events.slice(0, 12).map((e) => html`<li>${fmtDate(s, e.day)} · ${e.label} ${e.status === 'handled' ? badge(e.response, '') : badge('open', 'warn')}</li>`)}</ul>` : html`<p class="muted small">Nothing yet.</p>`}
        </section>
      </div>`);
    lineChart(root.querySelector('#energyChart'), [{ values: wb.history.map((h) => h.energy), color: '--good' }], { format: (v) => Math.round(v), height: 150 });
    on(root, 'click', '[data-resp]', (e, el) => ctx.act((st) => respondLife(st, el.dataset.ev, el.dataset.resp)));
    on(root, 'submit', '#habits', (e) => {
      e.preventDefault();
      const fd = formData(e.target);
      ctx.act((st) => {
        const w = ensureWellbeing(st);
        st.founder.hoursPerWeek = fd.hoursPerWeek;
        w.dayOff = fd.dayOff;
        if (fd.peerGroup && !w.peerGroup) toast('Peer group: block 2h every other week in your Calendar.', 'info');
        w.peerGroup = fd.peerGroup;
        w.therapy = fd.therapy;
      });
    });
    on(root, 'submit', '#life', (e) => {
      e.preventDefault();
      const fd = formData(e.target);
      ctx.act((st) => Object.assign(ensureWellbeing(st), { hasYoungKids: fd.hasYoungKids, renter: fd.renter, age45plus: fd.age45plus }));
    });
  },
};
