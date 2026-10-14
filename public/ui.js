import * as E from './engine.js';

const SAVE_KEY = 'saas-sim-save';
const $ = (id) => document.getElementById(id);

const money = (n) => {
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(1)}k`;
  return `${sign}$${Math.round(a).toLocaleString()}`;
};
const pct = (n) => `${(n * 100).toFixed(1)}%`;

let state = load() ?? E.newGame(randomName());
let autoTimer = null;

function randomName() {
  const a = ['Cloud', 'Stack', 'Pipe', 'Sync', 'Flow', 'Metric', 'Ship', 'Desk', 'Loop', 'Form'];
  const b = ['ly', 'io', 'HQ', 'base', 'hub', 'kit', 'stack', 'wise'];
  return a[Math.floor(Math.random() * a.length)] + b[Math.floor(Math.random() * b.length)];
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
}

// ---- Rendering ----

function kpi(label, value, delta, cls = '') {
  return `<div class="kpi"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="delta">${delta ?? '&nbsp;'}</div></div>`;
}

function renderKpis() {
  const m = E.mrr(state), burn = E.monthlyBurn(state), net = m - burn;
  const prev = state.history.at(-2)?.mrr;
  const growth = prev ? (m - prev) / prev : null;
  const runway = net >= 0 ? null : Math.max(0, state.cash) / -net;
  const runwayCls = runway === null ? 'up' : runway < 4 ? 'down' : runway < 9 ? 'warn' : '';
  const progress = Math.min(1, (m * 12) / E.WIN_ARR);
  $('kpis').innerHTML = [
    kpi('MRR', money(m), growth === null ? null : `<span class="${growth >= 0 ? 'up' : 'down'}">${growth >= 0 ? '▲' : '▼'} ${pct(Math.abs(growth))} MoM</span>`),
    kpi('Cash', money(state.cash), `<span class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : ''}${money(net)}/mo</span>`),
    kpi('Runway', runway === null ? 'Profitable' : `${runway.toFixed(1)} mo`, null, runwayCls),
    kpi('Customers', state.customers.toLocaleString(), state.lastMonth ? `+${state.lastMonth.newCustomers} / -${state.lastMonth.churned}` : null),
    kpi('Monthly burn', money(burn), `${E.headcount(state)} employees`),
    kpi('Valuation', money(E.valuation(state)), `You own ${pct(state.founderEquity)}`),
    kpi('Goal: $10M ARR', pct(progress), `<div class="bar"><div style="width:${progress * 100}%;background:var(--accent)"></div></div>`),
  ].join('');
}

function renderTeam() {
  const rows = Object.entries(E.ROLES).map(([role, r]) => `
    <div class="row">
      <div>${r.label}<div class="muted">${money(r.salary)}/mo each</div></div>
      <div class="ctrl">
        <button class="small" data-fire="${role}" ${state.team[role] === 0 ? 'disabled' : ''} title="Lay off (1 month severance)">−</button>
        <b>${state.team[role]}</b>
        <button class="small" data-hire="${role}" title="Hire ($3k recruiting)">+</button>
      </div>
    </div>`);
  rows.unshift(`<div class="row"><div>Founders<div class="muted">Unpaid. Build product, close early deals.</div></div><div class="ctrl"><b>${state.founders}</b></div></div>`);
  $('team').innerHTML = rows.join('');
}

function renderControls() {
  $('price').value = state.price;
  $('priceOut').textContent = `$${state.price}/mo`;
  $('mkt').value = state.marketingBudget;
  $('mktOut').textContent = money(state.marketingBudget);
  $('focus').value = state.featureFocus;
  $('focusOut').textContent = `${state.featureFocus}% / ${100 - state.featureFocus}%`;
}

function renderFund() {
  const r = E.nextRound(state);
  if (!r) {
    $('fund').innerHTML = `<p class="muted">All rounds raised. Time to grow into that valuation.</p>`;
    return;
  }
  const ready = E.mrr(state) >= r.minMrr;
  $('fund').innerHTML = `
    <div class="row">
      <div>${r.name}: ${money(r.amount)}<div class="muted">Requires ${money(r.minMrr)} MRR · ~${pct(r.dilution)} dilution or less</div></div>
      <button id="raise" class="${ready ? 'primary' : ''}" ${ready ? '' : 'disabled'}>Pitch VCs</button>
    </div>`;
  $('raise').onclick = () => act(() => E.raise(state));
}

function meter(label, value, color, hint) {
  return `<div class="meter"><div class="top"><span>${label}</span><b>${Math.round(value)}</b></div>
    <div class="bar"><div style="width:${value}%;background:${color}"></div></div>
    ${hint ? `<div class="muted" style="font-size:12px;color:var(--muted)">${hint}</div>` : ''}</div>`;
}

function renderHealth() {
  const q = E.quality(state), d = state.techDebt, mo = state.morale, b = state.brand;
  $('health').innerHTML =
    meter('Product quality', q, 'var(--good)', 'Raises conversion, lowers churn') +
    meter('Tech debt', d, d > 40 ? 'var(--bad)' : 'var(--warn)', d > 40 ? 'Outage risk! Shift focus to refactoring.' : 'Slows engineers; causes outages above 40') +
    meter('Team morale', mo, mo < 50 ? 'var(--bad)' : 'var(--accent)', mo < 50 ? 'People are polishing their résumés.' : null) +
    meter('Brand', b, 'var(--cash)', 'Organic leads. Grows with marketers + spend') +
    (state.effects.length ? state.effects.map((e) => `<span class="chip">${e.label} · ${e.months} mo</span>`).join('') : '');
}

function renderFunnel() {
  const l = state.lastMonth;
  if (!l) {
    $('funnel').innerHTML = '<p style="color:var(--muted)">Press “Next month” to start.</p>';
    return;
  }
  const items = [
    ['Leads', l.leads.toLocaleString()],
    ['Worked by sales', l.worked.toLocaleString() + (l.worked < l.leads ? ' ⚠' : '')],
    ['Conversion', pct(l.conv)],
    ['New customers', '+' + l.newCustomers],
    ['Churn rate', pct(l.churnRate)],
    ['Revenue', money(l.revenue)],
    ['Burn', money(l.burn)],
    ['Dev output', l.devPoints.toFixed(1) + ' pts'],
  ];
  $('funnel').innerHTML = items.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('') +
    (l.worked < l.leads ? '<p style="grid-column:1/-1;margin:0;color:var(--warn);font-size:12px">⚠ Leads are going unworked. Hire sales reps.</p>' : '');
}

function renderLog() {
  $('log').innerHTML = state.log.slice().reverse().slice(0, 60)
    .map((e) => `<li class="${e.type}"><span class="m">Month ${e.month}</span>${e.text}</li>`).join('');
}

function renderChart() {
  const c = $('chart');
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = 220;
  c.width = w * dpr; c.height = h * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const col = (v) => css.getPropertyValue(v).trim();
  const data = [{ month: 0, mrr: 490, cash: 150000 }, ...state.history];
  const pad = { l: 56, r: 10, t: 10, b: 22 };
  const max = Math.max(1000, ...data.map((d) => Math.max(d.mrr, d.cash)));
  const min = Math.min(0, ...data.map((d) => d.cash));
  const x = (i) => pad.l + (i / Math.max(1, data.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);

  ctx.font = '11px system-ui';
  ctx.fillStyle = col('--muted');
  ctx.strokeStyle = col('--border');
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4;
    ctx.beginPath(); ctx.moveTo(pad.l, y(v)); ctx.lineTo(w - pad.r, y(v)); ctx.stroke();
    ctx.fillText(money(v), 4, y(v) + 4);
  }
  ctx.fillText(`Month ${data.at(-1).month}`, w - pad.r - 60, h - 6);

  for (const [key, color] of [['cash', '--cash'], ['mrr', '--accent']]) {
    ctx.strokeStyle = col(color);
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => (i ? ctx.lineTo(x(i), y(d[key])) : ctx.moveTo(x(i), y(d[key]))));
    ctx.stroke();
  }
}

function render() {
  $('company').textContent = state.companyName;
  $('month').textContent = state.month;
  renderKpis(); renderTeam(); renderControls(); renderFund(); renderHealth(); renderFunnel(); renderLog(); renderChart();
  const over = state.status !== 'playing';
  $('next').disabled = over;
  $('auto').disabled = over;
  if (over) showEnd();
}

function showEnd() {
  stopAuto();
  const won = state.status === 'won';
  $('endTitle').textContent = won ? '🎉 Exit!' : '💀 Bankrupt';
  $('endText').textContent = won
    ? `${state.companyName} hit $10M ARR in ${state.month} months and was acquired for ${money(E.valuation(state))}. You owned ${pct(state.founderEquity)}, so your payout is ${money(E.valuation(state) * state.founderEquity)}.`
    : `${state.companyName} ran out of cash in month ${state.month} with ${money(E.mrr(state))} MRR and ${state.customers} customers. Watch your runway — and raise before you need to.`;
  if (!$('endDialog').open) $('endDialog').showModal();
}

// ---- Actions ----

function act(fn) {
  fn();
  save();
  render();
}

function stopAuto() {
  clearInterval(autoTimer);
  autoTimer = null;
  $('auto').textContent = '▶ Auto';
}

function restart() {
  stopAuto();
  if ($('endDialog').open) $('endDialog').close();
  state = E.newGame(randomName());
  act(() => {});
}

$('next').onclick = () => act(() => E.step(state));
$('auto').onclick = () => {
  if (autoTimer) return stopAuto();
  $('auto').textContent = '⏸ Pause';
  autoTimer = setInterval(() => act(() => E.step(state)), 600);
};
$('restart').onclick = () => { if (confirm('Abandon this company and start over?')) restart(); };
$('endRestart').onclick = restart;
$('team').onclick = (e) => {
  const hire = e.target.dataset.hire, fire = e.target.dataset.fire;
  if (hire) act(() => E.hire(state, hire));
  if (fire) act(() => E.fire(state, fire));
};
$('price').oninput = (e) => act(() => (state.price = +e.target.value));
$('mkt').oninput = (e) => act(() => (state.marketingBudget = +e.target.value));
$('focus').oninput = (e) => act(() => (state.featureFocus = +e.target.value));
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && e.target === document.body && state.status === 'playing') {
    e.preventDefault();
    act(() => E.step(state));
  }
});
window.addEventListener('resize', renderChart);

render();
