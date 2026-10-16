// Analytics: ChartMogul/Baremetrics-style subscription analytics plus a query builder.
// Weekly dashboard with benchmark flags, MRR movements (reconciled to MRR), cohort retention heatmaps (logo &
// revenue), voluntary vs involuntary churn, trial conversion, CAC by channel & payback, and an ad-hoc query
// builder over subscriptions, customers, charges, bank transactions, daily metrics and MRR events.
// Definitions and benchmarks: docs/research/finance-and-payments.md §5.

import { html, mount, on, stat, download, lineChart, barChart } from '../core/ui.js';
import { money, pct, toCsv, isoDate, fmtDate, isLastDayOfMonth } from '../core/util.js';
import { ensure, log } from '../core/state.js';
import { ensureStripe } from '../core/stripe.js';
import { monthOf, monthLabel, sumBy } from './money/common.js';
import { mrrMovements, cohorts, churnSplit, trialConversion, cacByChannel, unitEconomics, weeklyFlags } from './money/metrics.js';
import { datasets, runQuery, OPS, AGGS } from './money/query.js';
import { syncLedger, ledgerByMonth, profitAndLoss, allMonths, reviewQueue, closableMonths, ensureBooks } from './money/ledger.js';
import { appCss, usd, tabs, stackedBars, legend, heat } from './money/ui.js';
import { retentionByGroup, hasIdea as truthIdea } from './insights/pmf.js';
import { recordRetentionView } from './insights/lab.js';
import { claimAutomated } from './automations/engine.js';
import { claimAssistant } from './assistant/engine.js';
import { riskPanel, signalSummary, wireRisk } from './retention/ui.js';

const ID = 'analytics';
/** Weekly review hours: an Automations digest or an approved Assistant digest cuts the work; never both stacked. */
export function weeklyReviewHours(state, base = 0.5) {
  const a = claimAutomated(state, 'metrics_digest', base);
  return a < base ? a : claimAssistant(state, 'metrics_digest', base);
}
const ensureApp = (state) => ensure(state, 'analytics', () => ({ saved: [], lastReviewDay: null, tickEvents: {} }));
const ui = { cohortMode: 'logo', cohortBy: 'month', cacDays: 90, q: { dataset: 'charges', filters: [], groupBy: 'day', bucket: 'month', agg: 'sum', aggField: 'amount' } };

const PRESETS = [
  { name: 'Gross volume by month', spec: { dataset: 'charges', filters: [{ field: 'status', op: '!=', value: 'failed' }], groupBy: 'day', bucket: 'month', agg: 'sum', aggField: 'amount' } },
  { name: 'Failed charges by decline code', spec: { dataset: 'charges', filters: [{ field: 'status', op: '=', value: 'failed' }], groupBy: 'failureCode', agg: 'count', aggField: '' } },
  { name: 'Live MRR by acquisition source', spec: { dataset: 'subscriptions', filters: [{ field: 'mrr', op: '>', value: '0' }], groupBy: 'source', agg: 'sum', aggField: 'mrr' } },
  { name: 'Churned MRR by week', spec: { dataset: 'events', filters: [{ field: 'type', op: '=', value: 'churn' }], groupBy: 'day', bucket: 'week', agg: 'sum', aggField: 'amount' } },
  { name: 'Cancellations by reason', spec: { dataset: 'subscriptions', filters: [{ field: 'status', op: '=', value: 'canceled' }], groupBy: 'cancelReason', agg: 'count', aggField: '' } },
  { name: 'Spend by category (bank)', spec: { dataset: 'bank', filters: [{ field: 'amount', op: '<', value: '0' }], groupBy: 'category', agg: 'sum', aggField: 'amount' } },
  { name: 'Cash by week (median)', spec: { dataset: 'daily', filters: [], groupBy: 'day', bucket: 'week', agg: 'median', aggField: 'cash' } },
];

// Gross margin and inference share from the Books accrual P&L over the last 3 complete months (or this month).
function marginFromBooks(s) {
  syncLedger(s);
  const L = ledgerByMonth(s);
  const done = allMonths(s).filter((m) => m < monthOf(s)).slice(-3);
  const months = done.length ? done : [monthOf(s)];
  const pl = profitAndLoss(s, months, 'accrual', L);
  const rev = sumBy(pl.revenue, (v) => v);
  const inference = -sumBy(months, (m) => L[m]?.['5010'] ?? 0);
  return { gm: rev > 0 ? sumBy(pl.grossProfit, (v) => v) / rev : null, inferenceShare: rev > 0 ? inference / rev : null, months };
}

const fmtX = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(d)}×`);
const mo = (v) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)} mo`);

function dashboard(s) {
  const { gm, inferenceShare, months } = marginFromBooks(s);
  const ue = unitEconomics(s, { grossMargin: gm });
  const b = ensureBooks(s);
  const flags = weeklyFlags(s, ue, { inferenceShare, unreviewed: reviewQueue(s).length, unclosed: closableMonths(s).filter((m) => !b.closed[m]).length });
  const mv = mrrMovements(s).at(-1);
  const tc = trialConversion(s).at(-1);
  const d = s.metrics.daily.slice(-90);
  const app = ensureApp(s);
  return html`
    <div class="${ID}-kpis">
      ${stat('Cash', money(ue.cash), `runway ${ue.runway === Infinity ? '∞ (not burning)' : mo(ue.runway)}`, ue.runway < 6 ? 'bad' : ue.runway < 12 ? 'warn' : '')}
      ${stat('MRR', money(ue.mrr), `${mv.net >= 0 ? '+' : ''}${money(mv.net)} this month · ARR ${money(ue.arr)}`)}
      ${stat('Paying customers', ue.customers, `ARPA ${ue.arpa == null ? '—' : usd(ue.arpa)}`)}
      ${stat('Trial → paid', tc?.rate == null ? '—' : pct(tc.rate, 0), tc ? `${tc.converted}/${tc.ended} trials ended ${monthLabel(tc.month)}` : 'no trials ended yet')}
      ${stat('Revenue churn / mo', ue.revChurn == null ? '—' : pct(ue.revChurn), `logo churn ${ue.logoChurn == null ? '—' : pct(ue.logoChurn)}`)}
      ${stat('NRR / GRR', ue.nrr == null ? '—' : `${pct(ue.nrr, 0)} / ${pct(ue.grr, 0)}`, ue.retentionMonths ? `trailing ${ue.retentionMonths} mo · median ~101% / 84%` : 'needs a full month')}
      ${stat('Quick ratio', fmtX(ue.quickRatio), '>4 strong (last 3 months)')}
      ${stat('Gross margin', gm == null ? '—' : pct(gm, 0), `Books accrual, ${months.length} mo · SaaS 75–85%, AI 45–55%`)}
      ${stat('LTV', ue.ltv == null ? '—' : money(ue.ltv), `ARPA × GM ÷ revenue churn, ≤ 5 yrs`)}
      ${stat('Blended CAC', ue.cac == null ? '—' : money(ue.cac), 'S&M spend ÷ new customers (90d)')}
      ${stat('CAC payback', mo(ue.payback), '<12 mo good for SMB', ue.payback > 12 ? 'warn' : '')}
      ${stat('Burn multiple', ue.burn <= 0 ? 'n/a' : fmtX(ue.burnMultiple), ue.burn <= 0 ? 'cash-flow positive' : `net burn ${money(ue.burn)}/mo ÷ net new ARR`)}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>This week's flags ${flags.length ? '' : html`<span class="badge good">all clear</span>`}</h2>
        ${flags.length ? flags.map((f) => html`<div class="${ID}-flag"><span class="badge ${f.level}">${f.level === 'bad' ? 'Act' : 'Watch'}</span><div><b>${f.title}</b><div class="small">${f.detail}</div><div class="small muted">${f.source}</div></div></div>`) : html`<p class="muted">Nothing outside benchmarks. Keep talking to customers.</p>`}
        <div class="app-actions" style="margin-top:10px"><button data-act="review">Do the weekly metrics review (30 min)</button>${app.lastReviewDay != null ? html`<span class="small muted">last done ${fmtDate(s, app.lastReviewDay)}</span>` : ''}</div>
      </section>
      <section class="panel"><h2>MRR & cash · 90 days</h2><canvas id="mrrLine" style="width:100%"></canvas><canvas id="cashLine" style="width:100%;margin-top:8px"></canvas>
        <p class="small muted">What founders check weekly (research §5.5): cash & runway, MRR movements, trials & conversion, churn with reasons, failed payments, inference vs revenue, pipeline, disputes.</p></section>
    </div>`;
}

function mrrView(s) {
  const mv = mrrMovements(s);
  const cols = [['new', 'New', '--good'], ['expansion', 'Expansion', '--accent'], ['reactivation', 'Reactivation', '--cash'], ['contraction', 'Contraction', '--warn'], ['churn', 'Churn', '--bad']];
  return html`<section class="panel"><h2>MRR movements</h2>
      <canvas id="moveChart" style="width:100%"></canvas>${legend(cols.map(([k, l, c]) => ({ label: l, color: c })).concat([{ label: 'Net new MRR (line)', color: '--text' }]))}
    </section>
    <section class="panel"><div class="table-wrap"><table class="${ID}-tbl"><thead><tr><th>Month</th><th class="r">Start MRR</th>${cols.map(([, l]) => html`<th class="r">${l}</th>`)}<th class="r">Net new</th><th class="r">End MRR</th><th class="r">Reported MRR</th><th>Check</th></tr></thead><tbody>
      ${mv.slice().reverse().map((r) => html`<tr><td>${monthLabel(r.month)}</td><td class="r">${usd(r.start)}</td>${cols.map(([k]) => html`<td class="r ${r[k] < 0 ? 'neg' : r[k] > 0 ? 'pos' : 'muted'}">${Math.abs(r[k]) < 0.005 ? '—' : usd(r[k])}</td>`)}
        <td class="r"><b>${usd(r.net)}</b></td><td class="r">${usd(r.end)}</td><td class="r">${r.reported == null ? '—' : usd(r.reported)}</td>
        <td>${r.reconciles == null ? '' : r.reconciles ? html`<span class="badge good" title="start + movements = end, and end ties to reported MRR">✓ ties</span>` : html`<span class="badge bad">off ${usd(r.diff)}</span>`}${Math.abs(r.late ?? 0) > 0.01 ? html`<div class="${ID}-sub" title="Changes made after the end-of-day snapshot on the last day of the month">${usd(r.late)} after snapshot</div>` : ''}</td></tr>`)}
    </tbody></table></div>
    <p class="small muted">Net new MRR = new + expansion + reactivation − contraction − churn (ChartMogul definitions). Policy: annual plans count price ÷ 12; trials are $0 until the first payment; past-due subscriptions stay in MRR during retries and churn when retries are exhausted. Reactivation = a customer who churned earlier starts paying again. Reported MRR comes from the daily snapshot (rounded to $1) or live MRR for this month.</p></section>`;
}

const SHAPE = { too_early: 'too early to tell', flattening: 'flattening', decaying: 'still decaying' };
// Cohorts cut by segment / source (insights/pmf.js): the curve that flattens is the real PMF signal, and it may flatten for one segment only.
function cohortByGroup(s) {
  const by = ui.cohortBy === 'source' ? 'source' : truthIdea(s) ? 'segment' : 'all';
  const rows = retentionByGroup(s, by);
  const K = Math.max(0, ...rows.map((r) => r.curve.filter((c) => c != null).length - 1));
  return rows.length ? html`<div class="table-wrap"><table class="${ID}-heat"><thead><tr><th>${by === 'source' ? 'Signup source' : 'Segment'}</th><th class="r">Customers</th>${Array.from({ length: K + 1 }, (_, k) => html`<th>M${k}</th>`)}<th>Shape</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr><td style="text-align:left">${r.label}</td><td class="r">${r.n}</td>${r.curve.slice(0, K + 1).map((c) => html`<td style="${heat(c)}">${c == null ? '' : pct(c, 0)}</td>`)}<td>${SHAPE[r.state]}${r.state !== 'too_early' && r.floor != null ? ` at ${pct(r.floor, 0)}` : ''}</td></tr>`)}
  </tbody></table></div><p class="small muted">Months since first payment (needs 5+ customers per point). Flattening at a floor = people who need it stay; still decaying = no fit for that group, however good the blended number looks.</p>` : html`<p class="empty">No paying customers yet.</p>`;
}

function cohortView(s) {
  const rows = ui.cohortBy === 'month' ? cohorts(s, ui.cohortMode) : [];
  const maxK = Math.min(12, Math.max(0, ...rows.map((r) => r.cells.filter((c) => c != null).length - 1)));
  return html`<section class="panel">
    <div class="inline" style="justify-content:space-between"><h2>Cohort retention</h2>
      <div class="app-actions"><button class="sm ${ui.cohortMode === 'logo' ? 'primary' : ''}" data-cohort="logo">Logo (customers)</button><button class="sm ${ui.cohortMode === 'revenue' ? 'primary' : ''}" data-cohort="revenue">Revenue (MRR)</button>
      <button class="sm ${ui.cohortBy === 'month' ? 'primary' : ''}" data-cohortby="month">By month</button><button class="sm ${ui.cohortBy === 'segment' ? 'primary' : ''}" data-cohortby="segment">By segment</button><button class="sm ${ui.cohortBy === 'source' ? 'primary' : ''}" data-cohortby="source">By source</button></div></div>
    ${ui.cohortBy !== 'month' ? cohortByGroup(s) : rows.length ? html`<div class="table-wrap"><table class="${ID}-heat"><thead><tr><th>Cohort (first payment)</th><th class="r">Customers</th><th class="r">Start MRR</th>${Array.from({ length: maxK + 1 }, (_, k) => html`<th>M${k}</th>`)}</tr></thead><tbody>
      ${rows.map((r) => html`<tr><td style="text-align:left">${monthLabel(r.month)}</td><td class="r">${r.size}</td><td class="r">${money(r.baseMrr)}</td>${r.cells.slice(0, maxK + 1).map((c) => html`<td style="${heat(c)}">${c == null ? '' : pct(c, 0)}</td>`)}</tr>`)}
    </tbody></table></div>` : html`<p class="empty">No paying customers yet.</p>`}
    <p class="small muted">Rows = month of first payment; Mk = still paying at the end of month k (M0 = end of the signup month). Read down a column: are newer cohorts retaining better (product improving)? Read along a row: does the curve flatten? A curve that never flattens means no product-market fit for that segment. Revenue retention can exceed 100% with expansion (research §5.3).</p>
  </section>`;
}

function churnView(s) {
  const split = churnSplit(s);
  const mv = mrrMovements(s);
  const tc = trialConversion(s);
  const reasons = {};
  for (const r of split) for (const [k, n] of Object.entries(r.reasons)) reasons[k] = (reasons[k] ?? 0) + n;
  return html`<div class="grid-2">
    <section class="panel"><h2>Voluntary vs involuntary churn</h2>
      ${split.length ? html`<div class="table-wrap"><table><thead><tr><th>Month</th><th class="r">Voluntary MRR</th><th class="r">Involuntary MRR</th><th class="r">Invol. % of start MRR</th><th class="r">Invol. share</th></tr></thead><tbody>
        ${split.slice().reverse().map((r) => { const st = mv.find((x) => x.month === r.month)?.start ?? 0; return html`<tr><td>${monthLabel(r.month)}</td><td class="r">${usd(r.voluntary)} <span class="muted small">(${r.volCount})</span></td><td class="r">${usd(r.involuntary)} <span class="muted small">(${r.invCount})</span></td><td class="r">${st ? pct(r.involuntary / st) : '—'}</td><td class="r">${pct(r.involuntary / Math.max(0.01, r.involuntary + r.voluntary), 0)}</td></tr>`; })}</tbody></table></div>` : html`<p class="empty">No churn yet.</p>`}
      <p class="small muted">Involuntary = card failures after all retries. Benchmarks (monthly MRR): consumer 1.5–3%, SMB 0.8–2%, enterprise 0.3–0.8% (Chargehive, vendor); roughly a third of all churn (Recurly). Fix with Smart Retries, dunning emails, pre-expiry reminders.</p>
      <h3>Cancellation reasons (all time)</h3>${Object.keys(reasons).length ? Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => html`<div class="${ID}-row"><span>${k.replace(/_/g, ' ')}</span><span>${n}</span></div>`) : html`<p class="muted small">—</p>`}
    </section>
    <section class="panel"><h2>Trial conversion</h2>
      ${tc.length ? html`<div class="table-wrap"><table><thead><tr><th>Trial ended</th><th class="r">Ended</th><th class="r">Converted</th><th class="r">Rate</th></tr></thead><tbody>${tc.slice().reverse().map((r) => html`<tr><td>${monthLabel(r.month)}</td><td class="r">${r.ended}</td><td class="r">${r.converted}</td><td class="r">${pct(r.rate, 0)}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No trials have ended yet.</p>`}
      <p class="small muted">Benchmarks: consumer 14-day card-required trials ~40% (RevenueCat 2026), much lower without a card; B2B opt-in trials 15–25%, card-required 30–60%.</p>
    </section></div>
    <div class="grid-2">${signalSummary(s)}${s.company.model === 'b2c' ? '' : riskPanel(s, { crm: false, title: 'At-risk self-serve accounts' })}</div>`;
}

function acquisitionView(s) {
  const { gm } = marginFromBooks(s);
  const ue = unitEconomics(s, { grossMargin: gm });
  const cac = cacByChannel(s, ui.cacDays);
  const g = gm ?? 0.8;
  return html`<section class="panel">
    <div class="inline" style="justify-content:space-between"><h2>CAC by channel</h2><label>Window <select id="cacDays">${[30, 90, 180, 365].map((d) => html`<option value="${d}" ${ui.cacDays === d ? 'selected' : ''}>Last ${d} days</option>`)}</select></label></div>
    <div class="table-wrap"><table><thead><tr><th>Channel</th><th class="r">Spend</th><th class="r">New customers</th><th class="r">CAC</th><th class="r">Payback</th></tr></thead><tbody>
      ${cac.rows.map((r) => html`<tr><td>${r.channel}</td><td class="r">${usd(r.spend)}</td><td class="r">${r.customers}</td><td class="r">${r.cac == null ? (r.spend ? '∞' : '—') : usd(r.cac)}</td><td class="r">${r.cac == null || !ue.arpa ? '—' : mo(r.cac / (ue.arpa * g))}</td></tr>`)}
      <tr class="total"><td><b>Blended</b></td><td class="r"><b>${usd(cac.totalSpend)}</b></td><td class="r"><b>${cac.totalNew}</b></td><td class="r"><b>${cac.blended == null ? '—' : usd(cac.blended)}</b></td><td class="r"><b>${mo(ue.payback)}</b></td></tr>
    </tbody></table></div>
    <p class="small muted">Spend = Mercury transactions categorized Advertising or Marketing, attributed by vendor (Meta, Google, TikTok, LinkedIn…) or by the Ads app's per-platform delivery when the bank line is unattributed. Customers = new paying subscriptions by their <code>source</code>. Payback = CAC ÷ (ARPA ${ue.arpa ? usd(ue.arpa) : '—'} × gross margin ${pct(g, 0)}). Channels with $0 spend (outbound, network, SEO) still cost founder hours: this table does not include your time, a fully loaded CAC would.</p>
  </section>`;
}

function queryView(s) {
  const ds = datasets(s);
  const q = ui.q;
  const d = ds[q.dataset];
  const fields = Object.keys(d.fields);
  const numeric = fields.filter((f) => ['number'].includes(d.fields[f].type));
  let res = null, err = null;
  try { res = runQuery(s, q, ds); } catch (e) { err = e.message; }
  const app = ensureApp(s);
  const gtype = d.fields[q.groupBy]?.type;
  return html`<style>[data-app="analytics"] .analytics-qgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:14px}@media (max-width:820px){[data-app="analytics"] .analytics-qgrid{grid-template-columns:1fr}}</style><div class="analytics-qgrid">
    <section class="panel"><h2>Query</h2>
      <form id="qform" onsubmit="return false">
        <label>Dataset <select name="dataset">${Object.entries(ds).map(([k, v]) => html`<option value="${k}" ${k === q.dataset ? 'selected' : ''}>${v.label}</option>`)}</select></label>
        <h3>Filters</h3>
        ${q.filters.map((f, i) => html`<div class="inline" style="margin-bottom:6px">
          <select data-fi="${i}" data-k="field">${fields.map((x) => html`<option ${x === f.field ? 'selected' : ''}>${x}</option>`)}</select>
          <select data-fi="${i}" data-k="op">${Object.entries(OPS).map(([k, l]) => html`<option value="${k}" ${k === f.op ? 'selected' : ''}>${l}</option>`)}</select>
          ${['empty', 'notempty'].includes(f.op) ? '' : html`<input data-fi="${i}" data-k="value" value="${f.value ?? ''}" style="width:110px" />`}
          <button class="sm" data-rmf="${i}">✕</button></div>`)}
        <button class="sm" data-act="addf">+ Add filter</button>
        <h3>Group & aggregate</h3>
        <label>Group by <select name="groupBy"><option value="">(no grouping: show rows)</option>${fields.map((x) => html`<option value="${x}" ${x === q.groupBy ? 'selected' : ''}>${x}${d.fields[x].type === 'day' ? ' (date)' : ''}</option>`)}</select></label>
        ${gtype === 'day' ? html`<label>Bucket <select name="bucket">${['day', 'week', 'month'].map((b) => html`<option ${b === q.bucket ? 'selected' : ''}>${b}</option>`)}</select></label>` : ''}
        <div class="grid-2"><label>Aggregate <select name="agg">${AGGS.map((a) => html`<option ${a === q.agg ? 'selected' : ''}>${a}</option>`)}</select></label>
          ${q.agg !== 'count' ? html`<label>Of <select name="aggField">${numeric.map((x) => html`<option ${x === q.aggField ? 'selected' : ''}>${x}</option>`)}</select></label>` : ''}</div>
      </form>
      <h3>Presets & saved</h3>
      <ul class="list small">${PRESETS.map((p, i) => html`<li><a href="javascript:void 0" data-preset="${i}">${p.name}</a></li>`)}${app.saved.map((p, i) => html`<li><a href="javascript:void 0" data-saved="${i}">★ ${p.name}</a> <button class="sm" data-rmsaved="${i}">✕</button></li>`)}</ul>
      <form id="saveQ" class="inline"><label>Save as <input name="name" maxlength="40" placeholder="Report name" /></label><button class="sm">Save</button></form>
    </section>
    <section class="panel"><h2>Result ${res ? html`<span class="badge">${res.total} rows matched</span>` : ''} <button class="sm" data-act="csv" style="float:right">Export CSV</button></h2>
      ${err ? html`<div class="callout bad">${err}</div>` : res.kind === 'grouped' ? html`
        <canvas id="qChart" style="width:100%"></canvas>
        <div class="table-wrap" style="margin-top:8px"><table><thead><tr>${res.columns.map((c, i) => html`<th class="${i ? 'r' : ''}">${c}</th>`)}</tr></thead><tbody>
          ${res.rows.slice(0, 200).map((r) => html`<tr><td>${r.group}</td><td class="r">${r.value == null ? '—' : Number.isInteger(r.value) ? r.value.toLocaleString() : r.value.toFixed(2)}</td><td class="r muted">${r.count}</td></tr>`)}</tbody></table></div>`
      : html`${res.value != null && q.agg ? html`<p><b>${q.agg}${q.agg === 'count' ? '' : `(${q.aggField})`}: ${Number(res.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></p>` : ''}
        <div class="table-wrap"><table><thead><tr>${res.columns.map((c) => html`<th>${c}</th>`)}</tr></thead><tbody>${res.rows.slice(0, 200).map((r) => html`<tr>${res.columns.map((c) => html`<td class="small">${d.fields[c].type === 'day' && r[c] != null ? isoDate(s, r[c]) : typeof r[c] === 'number' ? (Number.isInteger(r[c]) ? r[c] : r[c].toFixed(2)) : r[c] ?? ''}</td>`)}</tr>`)}</tbody></table></div>
        ${res.rows.length > 200 ? html`<p class="small muted">Showing 200 of ${res.total}. Export for all.</p>` : ''}`}
      <p class="small muted">Like asking an AI agent to analyze a Stripe export, but you must still check definitions: which statuses count as revenue, whether amounts are gross or net, and which day a row belongs to.</p>
    </section></div>`;
}

export default {
  id: ID,
  title: 'Analytics',
  icon: '📈',
  group: 'Money',
  // Remember how many MRR events existed at each month-end tick, so MRR movements reconcile exactly with the
  // clock's end-of-day snapshot (see metrics.mrrMovements). A month-end hook of the LAST app in the registry, so it
  // runs after every app's onDay and onMonthEnd, right before the snapshot.
  onMonthEnd(state) {
    if (!isLastDayOfMonth(state)) return;
    const a = ensureApp(state);
    a.tickEvents ??= {};
    a.tickEvents[monthOf(state)] = ensureStripe(state).events.length;
  },
  render(root, ctx) {
    const s = ctx.state;
    ensureStripe(s);
    ensureApp(s);
    const view = ctx.params.split('/')[0] || 'home';
    const body = { mrr: mrrView, cohorts: cohortView, churn: churnView, acquisition: acquisitionView, query: queryView }[view]?.(s) ?? dashboard(s);
    mount(root, html`${appCss(ID)}
      <div class="app-head"><div><h1>Analytics</h1><p>Subscription metrics from Stripe, margins from Books, cash from Mercury. Every number traces to a transaction.</p></div></div>
      ${tabs(ID, [{ id: 'home', label: 'Weekly dashboard' }, { id: 'mrr', label: 'MRR movements' }, { id: 'cohorts', label: 'Cohorts' }, { id: 'churn', label: 'Churn & trials' }, { id: 'acquisition', label: 'CAC & payback' }, { id: 'query', label: 'Query builder' }], view)}
      ${body}`);

    if (view === 'home') {
      const d = s.metrics.daily.slice(-90);
      const labels = d.length ? [fmtDate(s, d[0].day), fmtDate(s, d.at(-1).day)] : null;
      lineChart(root.querySelector('#mrrLine'), [{ values: d.map((x) => x.mrr), color: '--accent' }], { labels, height: 120 });
      lineChart(root.querySelector('#cashLine'), [{ values: d.map((x) => x.cash), color: '--cash' }], { labels, height: 120 });
    } else if (view === 'mrr') {
      const mv = mrrMovements(s).slice(-12);
      stackedBars(root.querySelector('#moveChart'), mv.map((r) => monthLabel(r.month)), [
        { values: mv.map((r) => r.new), color: '--good' }, { values: mv.map((r) => r.expansion), color: '--accent' }, { values: mv.map((r) => r.reactivation), color: '--cash' },
        { values: mv.map((r) => r.contraction), color: '--warn' }, { values: mv.map((r) => r.churn), color: '--bad' },
      ], { line: { values: mv.map((r) => r.net), color: '--text' } });
    } else if (view === 'query') {
      const cv = root.querySelector('#qChart');
      try {
        const res = runQuery(s, ui.q);
        if (cv && res.kind === 'grouped') {
          const rows = res.rows.slice(0, 60);
          const vals = rows.map((r) => r.value ?? 0);
          if (res.timeSeries && rows.length > 1) lineChart(cv, [{ values: vals, color: '--accent' }], { labels: [rows[0].group, rows.at(-1).group], height: 180, format: (v) => (Math.abs(v) >= 1000 ? money(v) : v.toFixed(0)) });
          else barChart(cv, vals, { height: 180, labels: rows.map((r, i) => (rows.length <= 8 || i % Math.ceil(rows.length / 8) === 0 ? String(r.group).slice(0, 10) : '')), format: (v) => (Math.abs(v) >= 1000 ? money(v) : v.toFixed(0)) });
        }
      } catch { /* shown in the panel */ }
    }

    on(root, 'click', '[data-act=review]', () => ctx.act((st) => { ensureApp(st).lastReviewDay = st.day; log(st, 'info', 'Weekly metrics review done.', ID); }, { hours: weeklyReviewHours(s), label: 'Weekly metrics review' }));
    on(root, 'click', '[data-cohortby]', (e, el) => { ui.cohortBy = el.dataset.cohortby; if (ui.cohortBy !== 'month') ctx.act((st) => recordRetentionView(st, ui.cohortBy), { hours: 0.1, label: 'Review retention by segment' }); else ctx.render(); });
    on(root, 'click', '[data-cohort]', (e, el) => { ui.cohortMode = el.dataset.cohort; ctx.render(); });
    wireRisk(root, ctx);
    on(root, 'change', '#cacDays', (e) => { ui.cacDays = +e.target.value; ctx.render(); });
    // Query builder
    on(root, 'change', '#qform select[name], #qform input[name]', (e) => {
      const { name, value } = e.target;
      if (name === 'dataset') {
        const d = datasets(s)[value];
        const f = Object.keys(d.fields);
        ui.q = { dataset: value, filters: [], groupBy: f.find((x) => d.fields[x].type === 'day') ?? '', bucket: 'month', agg: 'count', aggField: f.find((x) => d.fields[x].type === 'number') ?? '' };
      } else {
        ui.q[name] = value;
        if (name === 'agg' && value !== 'count' && !ui.q.aggField) ui.q.aggField = Object.keys(datasets(s)[ui.q.dataset].fields).find((x) => datasets(s)[ui.q.dataset].fields[x].type === 'number') ?? '';
      }
      ctx.render();
    });
    on(root, 'change', '[data-fi]', (e, el) => { ui.q.filters[+el.dataset.fi][el.dataset.k] = el.value; ctx.render(); });
    on(root, 'click', '[data-act=addf]', () => { const f = Object.keys(datasets(s)[ui.q.dataset].fields)[0]; ui.q.filters.push({ field: f, op: '=', value: '' }); ctx.render(); });
    on(root, 'click', '[data-rmf]', (e, el) => { ui.q.filters.splice(+el.dataset.rmf, 1); ctx.render(); });
    on(root, 'click', '[data-preset]', (e, el) => { ui.q = structuredClone(PRESETS[+el.dataset.preset].spec); ctx.render(); });
    on(root, 'click', '[data-saved]', (e, el) => { ui.q = structuredClone(ensureApp(s).saved[+el.dataset.saved].spec); ctx.render(); });
    on(root, 'click', '[data-rmsaved]', (e, el) => ctx.act((st) => { ensureApp(st).saved.splice(+el.dataset.rmsaved, 1); }));
    on(root, 'submit', '#saveQ', (e) => { e.preventDefault(); const name = new FormData(e.target).get('name')?.trim(); if (name) ctx.act((st) => { ensureApp(st).saved.push({ name, spec: structuredClone(ui.q) }); }); });
    on(root, 'click', '[data-act=csv]', () => {
      const res = runQuery(s, ui.q);
      const rows = res.kind === 'grouped' ? res.rows.map((r) => ({ [res.columns[0]]: r.group, [res.columns[1]]: r.value, rows: r.count })) : res.rows;
      download(`${ui.q.dataset}-query-${isoDate(s)}.csv`, toCsv(rows));
    });
  },
};

