// Bank → Forecast tab: 13-week cash forecast, scenarios, trigger rules, forecast vs actual. Engine: forecast.js.

import { html, on, formData, stat, badge, lineChart } from '../../core/ui.js';
import { money, fmtDate, round2 } from '../../core/util.js';
import { usd } from './ui.js';
import {
  FORECAST, ensureForecast, assumptionsFor, project, forecastHours, saveAssumptions, saveSnapshot, setAgent, addTrigger, removeTrigger, forecastStats,
} from './forecast.js';

const ID = 'bank';
const fui = { method: 'line_items', scenario: 'base' };
const fmtRunway = (m) => (Number.isFinite(m) ? `${m.toFixed(1)} mo` : '36+ mo');

export function forecastView(s) {
  const f = ensureForecast(s);
  if (fui.method === 'ai_agent' && !f.agent) fui.method = 'line_items';
  const a = assumptionsFor(s);
  const asm = fui.method === 'line_items' ? a : null;
  const res = {};
  for (const id of Object.keys(FORECAST.scenarios)) res[id] = project(s, { method: fui.method, scenario: id, assumptions: asm });
  const base = res.base;
  const shown = res[fui.scenario] ?? base;
  const st = forecastStats(s);
  const last = f.snapshots.at(-1);
  const hours = forecastHours(s, fui.method);
  return html`
    <div class="grid-2">
      <section class="panel">
        <h2>13-week cash forecast</h2>
        <form id="methodForm" class="inline">
          <label>Method <select name="method">
            <option value="line_items" ${fui.method === 'line_items' ? 'selected' : ''}>Line items: payouts, bills, payroll dates, taxes, hires</option>
            <option value="quick" ${fui.method === 'quick' ? 'selected' : ''}>Quick: extend last month's burn</option>
            <option value="ai_agent" ${fui.method === 'ai_agent' ? 'selected' : ''} ${f.agent ? '' : 'disabled'}>AI forecast agent (${FORECAST.agent.vendor})</option></select></label>
          <label>Scenario <select name="scenario">${Object.entries(FORECAST.scenarios).map(([k, v]) => html`<option value="${k}" ${fui.scenario === k ? 'selected' : ''}>${v.label}</option>`)}</select></label>
        </form>
        <div class="${ID}-kpis" style="margin-top:10px">
          ${stat('Runway (this forecast)', fmtRunway(shown.runwayMonths), shown.cashOutDay ? `cash out ≈ ${fmtDate(s, shown.cashOutDay)}` : 'cash lasts the 36-month horizon', shown.runwayMonths < 6 ? 'bad' : shown.runwayMonths < 12 ? 'warn' : 'good')}
          ${stat('Lowest cash in 13 weeks', money(shown.minCash13), '', shown.minCash13 < 0 ? 'bad' : '')}
          ${stat('Default alive?', shown.defaultAlive ? 'Yes' : 'No', 'profitable before the money runs out (Graham, 2015)', shown.defaultAlive ? 'good' : 'warn')}
          ${stat('Burn multiple', shown.burnMultiple == null ? '—' : `${shown.burnMultiple.toFixed(1)}×`, 'net burn ÷ net new ARR (Sacks 2020: <1 amazing, >3 bad)')}
        </div>
        ${shown.cliffs?.length ? html`<div class="callout warn small"><b>Credit cliff in this forecast:</b> ${shown.cliffs.map((c) => `${c.name} ${c.reason} ${fmtDate(s, c.day)}, +${money(c.monthlyUsd)}/mo in cash`).join(' · ')}. <a href="#/bank/perks">Plan it</a>.</div>` : (fui.method !== 'line_items' && (s.apps.perks?.credits ?? []).some((c) => c.status === 'active') ? html`<div class="callout small">Startup credits are covering part of your bills. This method extends today's net burn and will miss the day they end; use line items.</div>` : '')}
        <canvas id="fcChart" style="width:100%"></canvas>
        <div class="app-actions" style="margin-top:8px"><button class="primary" data-fc="save">Save this forecast (${hours} h)</button>
          <label class="small"><input type="checkbox" id="agentToggle" ${f.agent ? 'checked' : ''} /> AI forecast agent ($${FORECAST.agent.price}/mo)</label></div>
        <p class="small muted">Saved forecasts are scored against your real bank balance 4 and 13 weeks later. A careful line-item forecast lands within ~10%; extending last month is ~±25%; counting receivables or deferred revenue as cash misses by 40%+ (o4 s1 [design]). The AI agent assumes flat burn by default, the failure mode T5 §4 describes. ${FORECAST.agent.source}.</p>
      </section>
      <section class="panel">
        <h2>Scenarios</h2>
        <div class="table-wrap"><table><thead><tr><th>Scenario</th><th class="r">Runway</th><th>Cash out</th><th class="r">Min cash (13 wk)</th><th>Default alive</th></tr></thead><tbody>
          ${Object.entries(res).map(([k, r]) => html`<tr class="${k === fui.scenario ? 'total' : ''}"><td>${FORECAST.scenarios[k].label}</td><td class="r">${fmtRunway(r.runwayMonths)}</td><td class="small">${r.cashOutDay ? fmtDate(s, r.cashOutDay) : '—'}</td><td class="r">${money(r.minCash13)}</td><td>${r.defaultAlive ? badge('yes', 'good') : badge('no', 'warn')}</td></tr>`)}
        </tbody></table></div>
        <p class="small muted">The hire scenario adds a US senior engineer at ~${money(Math.round(((170000) * 1.1) / 12))}/mo loaded from week 4 (Carta H1 2025 salary midpoint + ~10% employer cost [design]). Write down what you would cut in each case before you need to.</p>
        ${triggers(s, f)}
      </section>
    </div>
    ${fui.method === 'line_items' ? assumptionsPanel(s, a) : ''}
    <section class="panel"><h2>Weeks · ${FORECAST.scenarios[fui.scenario].label}</h2>
      <div class="table-wrap"><table class="${ID}-tbl"><thead><tr><th>Week</th><th>Ending</th><th class="r">Opening</th><th class="r">In</th><th class="r">Out</th><th class="r">Closing</th></tr></thead><tbody>
        ${shown.weeks.map((w) => html`<tr><td>W${w.k}</td><td class="small">${fmtDate(s, w.end)}</td><td class="r">${money(w.open)}</td><td class="r ${ID}-in">${money(w.inflow)}</td><td class="r">${money(w.outflow)}</td><td class="r"><b>${w.close < 0 ? html`<span style="color:var(--bad)">${money(w.close)}</span>` : money(w.close)}</b></td></tr>`)}
      </tbody></table></div></section>
    ${accuracy(s, f, st)}`;
}

function assumptionsPanel(s, a) {
  return html`<section class="panel"><h2>Assumptions</h2>
    <form id="asmForm">
      <div class="grid-2">
        <label>New + expansion MRR per month <input type="number" name="newMrr" min="0" step="10" value="${round2(a.newMrr)}" /></label>
        <label>Monthly revenue churn (%) <input type="number" name="churnPct" min="0" max="50" step="0.1" value="${round2(a.churnPct * 100)}" /></label>
        <label>Other spend per month (ads, inference, usage, travel) <input type="number" name="variable" min="0" step="50" value="${Math.round(a.variable)}" /></label>
        <label>Annual plans that renew (%) <input type="number" name="renewalPct" min="0" max="100" step="1" value="${Math.round((a.renewalPct ?? 0.75) * 100)}" /></label>
      </div>
      <fieldset><legend>Line items</legend>
        <label class="small"><input type="checkbox" name="includePayroll" ${a.includePayroll ? 'checked' : ''} /> Payroll on its pay dates (15th and last day)</label>
        <label class="small"><input type="checkbox" name="includeTax" ${a.includeTax ? 'checked' : ''} /> Tax and compliance dates (Books calendar)</label>
        <label class="small"><input type="checkbox" name="includeAnnual" ${a.includeAnnual ? 'checked' : ''} /> Annual plans arrive as lumps at renewal (not as monthly MRR)</label>
        <label class="small"><input type="checkbox" name="includeAR" ${a.includeAR ? 'checked' : ''} /> Open invoices collected around their due dates</label>
        <label class="small"><input type="checkbox" name="receivablesAsCash" ${a.receivablesAsCash ? 'checked' : ''} /> Count open invoices and deferred revenue as cash today</label>
      </fieldset>
      <h3>Planned hires</h3>
      ${(a.hires ?? []).map((h, i) => html`<div class="${ID}-row"><span>${h.label || 'Hire'} · ${money(h.monthlyCost)}/mo from week ${h.startWeek}</span><span><button type="button" class="sm danger" data-delhire="${i}">Remove</button></span></div>`)}
      <div class="${ID}-filters"><label>Role <input name="hLabel" maxlength="40" placeholder="Engineer" /></label><label>Loaded cost / month <input type="number" name="hCost" min="0" step="500" /></label><label>Start week <input type="number" name="hWeek" min="0" max="156" value="4" /></label><button type="button" class="sm" data-fc="addhire">Add hire</button></div>
      <h3>One-offs</h3>
      ${(a.oneOffs ?? []).map((o, i) => html`<div class="${ID}-row"><span>${o.label || 'One-off'} · week ${o.week}</span><span>${usd(o.amount)} <button type="button" class="sm danger" data-deloo="${i}">Remove</button></span></div>`)}
      <div class="${ID}-filters"><label>What <input name="oLabel" maxlength="40" placeholder="Annual insurance / laptop / grant" /></label><label>Amount (+ in, − out) <input type="number" name="oAmount" step="100" /></label><label>Week <input type="number" name="oWeek" min="1" max="156" value="2" /></label><button type="button" class="sm" data-fc="addoo">Add one-off</button></div>
      <button class="primary">Apply assumptions</button>
      <p class="small muted">Defaults come from your last three complete months. A forecast is only as good as these numbers: a hockey-stick new-MRR line or a forgotten hire shows up as forecast error later.</p>
    </form></section>`;
}

function triggers(s, f) {
  return html`<h3>Trigger rules</h3>
    ${f.triggers.length ? f.triggers.slice(-8).map((t) => { const k = FORECAST.triggerKinds[t.kind]; return html`<div class="${ID}-row"><span>${k.label} when ${t.kind === 'cash_floor' ? `cash < ${money(t.threshold)}` : `runway < ${t.threshold} months`}<div class="${ID}-sub">set ${fmtDate(s, t.createdDay)}${t.firedDay != null ? ` · fired ${fmtDate(s, t.firedDay)}` : ''}</div></span><span>${t.status === 'armed' ? html`${badge('armed', 'accent')} <button class="sm" data-deltrig="${t.id}">Remove</button>` : badge(t.status, t.status === 'honored' ? 'good' : t.status === 'ignored' ? 'bad' : 'warn')}</span></div>`; }) : html`<p class="small muted">No rules yet. A pre-set rule is what stops "we'll raise when we need to" turning into raising with 3 months left.</p>`}
    <form id="trigForm" class="${ID}-filters" style="margin-top:6px">
      <label>When <select name="kind">${Object.entries(FORECAST.triggerKinds).map(([k, v]) => html`<option value="${k}">${v.label} (${v.unit === 'usd' ? 'cash below $' : 'runway below, months'})</option>`)}</select></label>
      <label>Threshold <input type="number" name="threshold" min="1" step="0.5" value="9" /></label>
      <button class="sm">Add rule (0.1 h)</button></form>
    <p class="small muted">Rules run weekly against your own live forecast (your method and assumptions). When one fires you get an alert; later the game checks whether you did it.</p>`;
}

function accuracy(s, f, st) {
  const rows = f.snapshots.slice(-12).reverse();
  if (!rows.length) return '';
  return html`<section class="panel"><h2>Forecast vs actual ${st.err13 != null ? badge(`13-wk error ${st.err13.toFixed(0)}%`, st.err13 <= 10 ? 'good' : st.err13 <= 25 ? 'warn' : 'bad') : st.err4 != null ? badge(`4-wk error ${st.err4.toFixed(0)}%`, '') : ''}</h2>
    <div class="table-wrap"><table><thead><tr><th>Saved</th><th>Method</th><th class="r">Week 4 forecast</th><th class="r">Actual</th><th class="r">Error</th><th class="r">Week 13 forecast</th><th class="r">Actual</th><th class="r">Error</th></tr></thead><tbody>
      ${rows.map((r) => html`<tr><td class="small">${fmtDate(s, r.day)}</td><td class="small">${{ line_items: 'line items', quick: 'quick', ai_agent: 'AI agent' }[r.method]}</td>
        <td class="r">${money(r.predicted[3])}</td><td class="r">${r.actual[3] != null ? money(r.actual[3]) : '—'}</td><td class="r">${r.err4 != null ? `${r.err4.toFixed(0)}%` : '—'}</td>
        <td class="r">${money(r.predicted[12])}</td><td class="r">${r.actual[12] != null ? money(r.actual[12]) : '—'}</td><td class="r">${r.err13 != null ? `${r.err13.toFixed(0)}%` : '—'}</td></tr>`)}
    </tbody></table></div>
    <p class="small muted">Error = |forecast − actual| ÷ actual cash.</p></section>`;
}

export function drawForecast(root, s) {
  const c = root.querySelector('#fcChart');
  if (!c) return;
  const asm = fui.method === 'line_items' ? assumptionsFor(s) : null;
  const pick = ['base', 'slow_sales', 'lose_top'];
  const colors = ['--cash', '--warn', '--bad'];
  const series = pick.map((id, i) => { const p = project(s, { method: fui.method, scenario: id, assumptions: asm, days: 91 }); return { values: [p.daily[0], ...p.weeks.map((w) => w.close)], color: colors[i] }; });
  lineChart(c, series, { height: 150, labels: [fmtDate(s, s.day), fmtDate(s, s.day + 91)] });
}

export function wireForecast(root, ctx) {
  const s = ctx.state;
  on(root, 'change', '#methodForm select', (e) => { fui[e.target.name] = e.target.value; ctx.render(); });
  on(root, 'change', '#agentToggle', (e) => ctx.act((st) => { setAgent(st, e.target.checked); if (e.target.checked) fui.method = 'ai_agent'; }, { hours: e.target.checked ? 0.25 : 0.05, label: 'AI forecast agent' }));
  on(root, 'click', '[data-fc]', (e, el) => {
    const a = el.dataset.fc;
    const form = root.querySelector('#asmForm');
    if (a === 'save') {
      ctx.act((st) => {
        const snap = saveSnapshot(st, fui.method);
        ctx.toast(`Forecast saved: ${fmtRunway(snap.runwayMonths)} of runway in the base case. It is scored against your bank balance in 4 and 13 weeks.`, 'good');
      }, { hours: forecastHours(s, fui.method), label: fui.method === 'line_items' ? 'Cash forecast (line items)' : 'Cash forecast' });
    } else if (a === 'addhire' && form) {
      const f = formData(form);
      if (!(f.hCost > 0)) return ctx.toast('Enter the loaded monthly cost.', 'warn');
      ctx.act((st) => { saveAssumptions(st, { hires: [...(ensureForecast(st).assumptions?.hires ?? []), { label: f.hLabel || 'Hire', monthlyCost: f.hCost, startWeek: f.hWeek ?? 4 }] }); }, { hours: 0.05, label: 'Forecast assumptions' });
    } else if (a === 'addoo' && form) {
      const f = formData(form);
      if (!f.oAmount) return ctx.toast('Enter an amount (negative for money out).', 'warn');
      ctx.act((st) => { saveAssumptions(st, { oneOffs: [...(ensureForecast(st).assumptions?.oneOffs ?? []), { label: f.oLabel || 'One-off', amount: f.oAmount, week: f.oWeek ?? 1 }] }); }, { hours: 0.05, label: 'Forecast assumptions' });
    }
  });
  on(root, 'click', '[data-delhire]', (e, el) => ctx.act((st) => { const h = [...(ensureForecast(st).assumptions?.hires ?? [])]; h.splice(+el.dataset.delhire, 1); saveAssumptions(st, { hires: h }); }));
  on(root, 'click', '[data-deloo]', (e, el) => ctx.act((st) => { const o = [...(ensureForecast(st).assumptions?.oneOffs ?? [])]; o.splice(+el.dataset.deloo, 1); saveAssumptions(st, { oneOffs: o }); }));
  on(root, 'submit', '#asmForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    ctx.act((st) => { saveAssumptions(st, { newMrr: f.newMrr, churnPct: (f.churnPct ?? 0) / 100, variable: f.variable, renewalPct: (f.renewalPct ?? 75) / 100, includePayroll: f.includePayroll, includeTax: f.includeTax, includeAnnual: f.includeAnnual, includeAR: f.includeAR, receivablesAsCash: f.receivablesAsCash }); }, { hours: 0.1, label: 'Forecast assumptions' });
  });
  on(root, 'submit', '#trigForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    ctx.act((st) => addTrigger(st, { kind: f.kind, threshold: f.threshold }), { hours: 0.1, label: 'Runway trigger rule' });
  });
  on(root, 'click', '[data-deltrig]', (e, el) => ctx.act((st) => removeTrigger(st, el.dataset.deltrig)));
}
