// You: the founder as a person. Energy, where your hours went, life events, and the habits that keep you
// going. Grounded in docs/research/world-ops-support-life.md (WELLBEING): ~54% of founders report
// burnout in a year; 60h+ weeks roughly double the risk.

import { html, mount, on, formData, lineChart, badge, stat, toast } from '../core/ui.js';
import { ensureWellbeing, capacityMult, respondLife, lifeEventTypes } from '../core/wellbeing.js';
import { hoursLeft } from '../core/state.js';
import { OVERWORK, weekWorked, sleepDebtEff } from '../core/overwork.js';
import { fmtDate } from '../core/util.js';
import { personalRunwayMonths } from '../core/personal.js';
import { ensurePlanner, addCriterion, decideCriterion, CRITERION_METRICS, PLAN_HOURS, sustainabilitySignals } from './assistant/planner.js';
import { sustainabilityRead } from './assistant/operators.js';
import { reviewFor } from '../core/advice.js';

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
        ${stat('This week', `${weekWorked(s).toFixed(1)}h`, `plan ${f.hoursPerWeek}h · ${hoursLeft(s).toFixed(1)}h of it left`, weekWorked(s) > OVERWORK.weekWarn ? 'bad' : weekWorked(s) > f.hoursPerWeek ? 'warn' : '')}
        ${stat('Sleep debt', `${(f.sleepDebt ?? 0).toFixed(1)}h`, (f.sleepDebt ?? 0) >= OVERWORK.illnessDebt ? `~${Math.round((1 - sleepDebtEff(s)) * 100)}% slower, sick more often` : (f.sleepDebt ?? 0) >= 1 ? `~${Math.round((1 - sleepDebtEff(s)) * 100)}% slower until you catch up` : 'rested', (f.sleepDebt ?? 0) >= OVERWORK.illnessDebt ? 'bad' : (f.sleepDebt ?? 0) >= 4 ? 'warn' : 'good')}
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
      ${renderNights(s)}
      ${renderCriteria(s)}
      <div class="grid-2">
        <section class="panel"><h2>How you work</h2>
          <form id="habits">
            <label>Hours per week you plan to work <input type="number" name="hoursPerWeek" min="10" max="90" value="${f.hoursPerWeek}" /></label>
            <p class="hint">${f.hoursPerWeek > 60 ? 'Over 60h a week, roughly half of founders burn out within a year.' : f.hoursPerWeek <= 55 ? 'Sustainable for most people, with a real day off.' : 'Borderline: watch your energy.'}</p>
            <label><input type="checkbox" name="dayOff" ${wb.dayOff ? 'checked' : ''} /> Protect one real day off per week (Sunday: no planned hours; working on it anyway forfeits its recovery)</label>
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
    on(root, 'submit', '#critForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => addCriterion(st, { metric: f.metric, threshold: f.threshold, byDay: st.day + Math.round((Number(f.months) || 0) * 30.4), action: f.action, note: f.note }), { hours: PLAN_HOURS.criterion, label: 'Writing kill criteria' });
    });
    on(root, 'click', '[data-decide]', (e, el) => {
      const [id, decision] = el.dataset.decide.split('|');
      const months = decision === 'persist' ? Number(root.querySelector(`[data-persist-months="${id}"]`)?.value || 3) : 0;
      ctx.act((st) => decideCriterion(st, id, decision, { byDay: st.day + Math.round(months * 30.4) }), { hours: PLAN_HOURS.decision, label: 'Persist / pivot decision' });
    });
    on(root, 'submit', '#habits', (e) => {
      e.preventDefault();
      const fd = formData(e.target);
      ctx.act((st) => {
        const w = ensureWellbeing(st);
        if (Number.isFinite(fd.hoursPerWeek)) st.founder.hoursPerWeek = Math.min(90, Math.max(10, fd.hoursPerWeek)); // an emptied field keeps the old value
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

function renderCriteria(s) {
  const P = ensurePlanner(s);
  const sig = sustainabilitySignals(s);
  const read = sustainabilityRead(s);
  const rv = reviewFor(s, 'founder_sustainability', read);
  const open = P.criteria.filter((c) => c.status === 'active' || c.status === 'missed' || c.status === 'met');
  const done = P.criteria.filter((c) => c.status === 'decided').slice(-5).reverse();
  const tone = { active: 'accent', missed: 'bad', met: 'good' };
  return html`<div class="grid-2">
    <section class="panel"><h2>Kill and pivot criteria</h2>
      <p class="small muted">Write the bar before you start the bet: "if MRR is under $X by <date>, we pivot or stop". On the date the game checks it against your real numbers. Missing it and deciding nothing is the expensive outcome.</p>
      ${open.length ? html`<ul class="list">${open.map((c) => html`<li>${badge(c.status, tone[c.status])} <b>${CRITERION_METRICS[c.metric]} ${c.threshold}</b> by ${fmtDate(s, c.byDay)} · else ${c.action}${c.note ? html`<div class="small muted">${c.note}</div>` : ''}
        ${c.status === 'missed' ? html`<div class="small neg">Missed ${s.day - c.missedDay} days ago (actual ${Number.isFinite(c.value) ? c.value : '—'}).</div>` : ''}
        ${['missed', 'met'].includes(c.status) ? html`<div class="inline" style="margin-top:4px"><button class="sm" data-decide="${c.id}|pivot">Pivot</button><button class="sm" data-decide="${c.id}|stop">Stop / wind down</button>
          <label style="flex:0 0 auto;min-width:0">new date in <input type="number" min="1" max="24" value="3" data-persist-months="${c.id}" style="width:60px" /> months</label><button class="sm" data-decide="${c.id}|persist">Persist with a new criterion</button></div>` : ''}</li>`)}</ul>` : html`<p class="muted small">No criteria yet.</p>`}
      <form id="critForm"><div class="grid-2"><label>Metric <select name="metric">${Object.entries(CRITERION_METRICS).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label><label>Threshold <input type="number" name="threshold" required /></label></div>
        <div class="grid-2"><label>Check in (months) <input type="number" name="months" min="1" max="36" value="6" /></label><label>If missed <select name="action"><option value="pivot">pivot</option><option value="stop">stop</option><option value="raise">raise or cut burn</option></select></label></div>
        <label>Why this bar (optional) <input name="note" placeholder="Below this, the market is telling us no" /></label>
        <button class="primary">Write criterion (15 min)</button></form>
      ${done.length ? html`<h3>Decided</h3><ul class="list small">${done.map((c) => html`<li>${fmtDate(s, c.decisionDay)} · ${CRITERION_METRICS[c.metric]} ${c.threshold}: ${c.decision}${c.missedDay != null ? ` (${c.decisionDay - c.missedDay} days after the miss)` : ''}</li>`)}</ul>` : ''}
    </section>
    <section class="panel"><h2>Decision quality</h2>
      <ul class="list small"><li>Weeks over 60 hours, last quarter: ${sig.weeksOver60}</li><li>Pivots: ${sig.pivots}${sig.fastPivots ? ` (${sig.fastPivots} within 90 days on thin evidence)` : ''}</li><li>Real day off: ${sig.dayOff ? 'yes' : 'no'}</li></ul>
      ${rv.tier && rv.tier !== 'unknown' ? html`<p>${rv.reviewer}: ${badge(rv.tier, rv.tier === 'stellar' || rv.tier === 'good' ? 'good' : rv.tier === 'mediocre' ? 'bad' : 'warn')}</p>` : ''}
      ${rv.items.map((i) => html`<div class="callout warn small">${i.text} <span class="muted">(${i.from})</span></div>`)}
    </section></div>`;
}

// Recent days: hours worked, sleep and the debt it left. Days past 12 h are flagged (core/overwork.js).
function renderNights(s) {
  const log = (s.founder.dayLog ?? []).slice(-14).reverse();
  if (!log.length) return '';
  return html`<section class="panel"><h2>Days and nights</h2>
    <p class="small muted">Your planned hours are a plan, not a wall: you can work late, on weekends and on your day off. Past ${OVERWORK.dayWarn} h a day or ${OVERWORK.weekWarn} h a week, each hour gets less done (fatigue shows up as extra hours above), sleep debt builds and only repays slowly (about ${OVERWORK.recoverNormal} h a normal night), energy drops, and burnout and illness get likelier. Sources: Pencavel 2014, Van Dongen 2003, Dembe 2005, Prather 2015, WHO/ILO 2021.</p>
    <table><thead><tr><th>Day</th><th class="r">Worked</th><th class="r">Sleep</th><th class="r">Sleep debt</th></tr></thead><tbody>
    ${log.map((d) => html`<tr><td>${fmtDate(s, d.day)}</td><td class="r ${d.hours > OVERWORK.dayWarn ? 'neg' : d.hours > 10 ? 'warn' : ''}">${d.hours.toFixed(1)}h</td><td class="r ${d.sleep < 6 ? 'neg' : d.sleep < 7 ? 'warn' : ''}">${d.sleep.toFixed(1)}h</td><td class="r">${d.debt.toFixed(1)}h</td></tr>`)}
    </tbody></table></section>`;
}
