import * as E from './engine.js';
import { coach } from './coach.js';
import { PLAYBOOK } from './playbook.js';

const SAVE_KEY = 'saas-sim-v2';
const PB_KEY = 'saas-sim-playbook';
const TAB_KEY = 'saas-sim-tab';
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const money = (n) => {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(1)}k`;
  return `${sign}$${Math.round(a).toLocaleString()}`;
};
const pct = (n, d = 1) => (n == null || !isFinite(n) ? '—' : `${(n * 100).toFixed(d)}%`);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

let state = null;
try { state = JSON.parse(store.get(SAVE_KEY)); } catch {}
if (state && state.v !== 2) state = null;
let autoTimer = null;

// ---------------------------------------------------------------------------
// Company tab
// ---------------------------------------------------------------------------

function runwayInfo() {
  const l = state.lastMonth;
  const net = l ? l.netCash : E.mrr(state) - E.monthlyCosts(state).total;
  return { net, runway: net >= 0 ? null : Math.max(0, state.cash) / -net };
}

function kpi(label, value, delta, cls = '', title = '') {
  return `<div class="kpi" title="${esc(title)}"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="delta">${delta ?? '&nbsp;'}</div></div>`;
}

function renderHeader() {
  const cfg = E.model(state);
  $('company').textContent = state.companyName;
  $('modelChip').textContent = cfg.short;
  $('date').textContent = `Month ${state.month} (${E.MONTHS[E.calendarMonth(state)]}, year ${Math.floor(state.month / 12) + 1})`;
  $('phase').textContent = state.phase === 'idea'
    ? `Pre-launch: MVP ${Math.min(100, Math.round((state.rawFeatures / cfg.mvp) * 100))}% built`
    : state.raise ? `Raising ${E.ROUNDS[state.raise.round].name}` : 'Launched';
}

function renderKpis() {
  const m = E.mrr(state);
  const met = E.metrics(state);
  const { net, runway } = runwayInfo();
  const l = state.lastMonth;
  $('kpis').innerHTML = [
    kpi('MRR', money(m), `${money(m * 12)} ARR${met.cmgr != null ? ` · <span class="${met.cmgr >= 0 ? 'up' : 'down'}">${met.cmgr >= 0 ? '▲' : '▼'}${pct(Math.abs(met.cmgr))}/mo</span>` : ''}`, '', 'Monthly recurring revenue. Growth is the 3-month compound monthly growth rate.'),
    kpi('Cash', money(state.cash), `<span class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : ''}${money(net)}/mo</span>`),
    kpi('Runway', runway == null ? 'Profitable' : `${runway.toFixed(1)} mo`, runway == null ? 'default alive' : 'at current burn', runway == null ? 'up' : runway < 4 ? 'down' : runway < 9 ? 'warn' : ''),
    kpi('Customers', state.customers.toLocaleString(), l ? `+${l.newCustomers} new / -${l.churned} churned` : null),
    kpi('Product–market fit', `${Math.round(E.ellisScore(state))}%`, '"very disappointed" (40% = PMF)', E.ellisScore(state) >= 40 ? 'up' : E.ellisScore(state) < 25 ? 'down' : 'warn', 'Sean Ellis test: share of users who would be very disappointed if your product disappeared.'),
    kpi('Founders own', pct(state.founderEquity), state.investors.length ? `${state.investors.length} round${state.investors.length > 1 ? 's' : ''} raised` : 'no investors'),
  ].join('');
}

function renderCoach() {
  $('coach').innerHTML = coach(state).map((t) => `<li class="${t.level}">${esc(t.text)}</li>`).join('');
}

function drawLine(canvas, values, colorVar, { zero = false, floor = 1 } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = +canvas.getAttribute('height');
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const col = (v) => css.getPropertyValue(v).trim();
  const data = values.length ? values : [0];
  const pad = { l: 58, r: 8, t: 8, b: 16 };
  const max = Math.max(floor, ...data);
  const min = Math.min(0, ...data);
  const x = (i) => pad.l + (i / Math.max(1, data.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min || 1)) * (h - pad.t - pad.b);
  ctx.font = '11px system-ui';
  ctx.fillStyle = col('--muted');
  ctx.strokeStyle = col('--border');
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    ctx.beginPath(); ctx.moveTo(pad.l, y(v)); ctx.lineTo(w - pad.r, y(v)); ctx.stroke();
    ctx.fillText(money(v), 2, y(v) + 4);
  }
  if (zero && min < 0) {
    ctx.strokeStyle = col('--bad');
    ctx.beginPath(); ctx.moveTo(pad.l, y(0)); ctx.lineTo(w - pad.r, y(0)); ctx.stroke();
  }
  const first = state.history[0]?.month ?? 0;
  ctx.fillText(`month ${first}`, pad.l, h - 2);
  ctx.fillText(`${state.month}`, w - pad.r - 20, h - 2);
  ctx.strokeStyle = col(colorVar);
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.stroke();
}

function renderCharts() {
  drawLine($('chartMrr'), [0, ...state.history.map((h) => h.mrr)], '--accent', { floor: 1000 });
  drawLine($('chartCash'), [80000, ...state.history.map((h) => h.cash)], '--cash', { zero: true });
}

function cells(items) {
  return items.map(([k, v, title]) => `<div title="${esc(title ?? '')}"><span>${k}</span><b>${v}</b></div>`).join('');
}

function renderFunnel() {
  const l = state.lastMonth;
  const cfg = E.model(state);
  if (state.phase === 'idea') {
    $('funnel').innerHTML = cells([
      ['MVP built', `${Math.min(100, Math.round((state.rawFeatures / cfg.mvp) * 100))}%`],
      ['Customer insight', `${Math.round(state.insight)}/100`, 'Grows with customer-discovery time.'],
      [state.model === 'ent' ? 'Design partners' : 'Waitlist', Math.round(state.waitlist).toLocaleString()],
      ['Monthly burn', money(E.monthlyCosts(state).total)],
    ]) + `<p class="muted" style="grid-column:1/-1;margin:0">No revenue until you launch. Split founder time between building, customer discovery, and lining up early users.</p>`;
    return;
  }
  if (!l) { $('funnel').innerHTML = ''; return; }
  const top = state.model === 'ent'
    ? [['New opportunities', l.opps.toFixed(1)], ['Worked', l.worked + (l.unworked > 0.5 ? ' ⚠' : ''), 'Limited by founder sales time and account execs.'], ['Win rate', pct(l.convRate)], ['Sales cycle', `${l.cycle} mo`, 'Deals you win today close this many months later.'], ['Deals closed', `+${l.newCustomers}`]]
    : [['Visitors', l.visitors.toLocaleString()], ['Signups', l.signups.toLocaleString()], [state.model === 'smb' ? 'Trials incl. outbound' : 'Trials incl. founder-led', l.trials.toLocaleString()], ['Trial → paid', pct(l.convRate)], ['New customers', `+${l.newCustomers}`]];
  $('funnel').innerHTML = cells([
    ...top,
    ['Churned', `-${l.churned} (${pct(l.logoChurn)})`],
    ['New MRR', money(l.newMrr)],
    ['Expansion MRR', money(l.expMrr)],
    ['Churned MRR', money(-l.churnMrr)],
    ['Cash collected', money(l.collected), 'Monthly plans plus annual plans billed this month.'],
    ['Costs', money(l.costs.total)],
    ['Seasonality', `×${l.season.toFixed(2)}`, 'B2B slows in summer and December; B2C peaks in January and November.'],
  ]) + (l.unworked > 0.5 ? '<p class="warn" style="grid-column:1/-1;margin:0;font-size:12px">⚠ Opportunities are going unworked: add founder sales time or hire account execs.</p>' : '');
}

const TIME_LABELS = {
  build: ['Build product', 'Founder engineering time'],
  sell: ['Sell & market', 'Founder-led sales, communities, outreach'],
  research: ['Customer discovery', 'Interviews, user research → insight & PMF'],
  fundraise: ['Fundraise', 'Investor meetings. Needed to close a round'],
};

function renderTime() {
  const total = E.FOUNDER_TIME.reduce((a, k) => a + state.time[k], 0) || 1;
  $('time').innerHTML = E.FOUNDER_TIME.map((k) => `
    <label>${TIME_LABELS[k][0]} <output>${Math.round((state.time[k] / total) * 100)}%</output>
      <input type="range" min="0" max="100" step="5" value="${state.time[k]}" data-time="${k}" aria-label="${TIME_LABELS[k][0]}" />
      <span class="muted">${TIME_LABELS[k][1]}</span>
    </label>`).join('');
  $('salary').value = state.founderSalary;
  $('salaryOut').textContent = state.founderSalary ? `${money(state.founderSalary)}/mo` : 'unpaid';
}

function renderTeam() {
  const roles = Object.entries(E.ROLES).filter(([r]) => !(r === 'ae' && state.model === 'b2c'));
  $('team').innerHTML = roles.map(([role, r]) => {
    const list = state.employees.filter((e) => e.role === role);
    const pending = list.filter((e) => e.tenure < 0).length;
    const ramping = list.filter((e) => e.tenure >= 0 && e.tenure + 1 < (role === 'ae' ? E.model(state).aeRamp ?? 3 : r.ramp)).length;
    const status = [pending && `${pending} starting next month`, ramping && `${ramping} ramping up`].filter(Boolean).join(', ');
    const label = role === 'support' && state.model === 'ent' ? 'Customer success' : r.label;
    return `<div class="row" title="${esc(r.desc)}">
      <div>${label} <span class="muted">${money(r.salary)}/mo</span><div class="muted">${status || esc(r.desc)}</div></div>
      <div class="ctrl">
        <button class="small" data-fire="${role}" ${list.length ? '' : 'disabled'} aria-label="Remove one ${label}">−</button>
        <b>${list.length}</b>
        <button class="small" data-hire="${role}" aria-label="Hire one ${label}" title="Hire (${money(E.RECRUITING_FEE)} recruiting)">+</button>
      </div></div>`;
  }).join('') + `<p class="muted" style="margin:6px 0 0">Hiring costs ${money(E.RECRUITING_FEE)} and takes a month. New hires ramp up over 1–5 months. Layoffs cost a month of severance and hurt morale.</p>`;
}

function meter(label, value, color, hint) {
  return `<div class="meter"><div class="top"><span>${label}</span><b>${Math.round(value)}</b></div>
    <div class="bar"><div style="width:${Math.max(0, Math.min(100, value))}%;background:${color}"></div></div>
    ${hint ? `<div class="muted">${hint}</div>` : ''}</div>`;
}

function renderProduct() {
  $('focus').value = state.featureFocus;
  $('focusOut').textContent = `${state.featureFocus}% / ${100 - state.featureFocus}%`;
  const d = state.techDebt, mo = state.morale;
  $('health').innerHTML =
    meter('Customer insight', state.insight, 'var(--accent)', 'How well you understand the problem. Features built with low insight mostly miss.') +
    meter('Product quality', E.quality(state), 'var(--good)', 'Raises conversion and retention.') +
    meter('Product–market fit', E.pmf(state), 'var(--cash)', `Insight × quality. ≈${Math.round(E.ellisScore(state))}% of users would be "very disappointed" without you; 40% is the PMF bar.`) +
    meter('Tech debt', d, d > 45 ? 'var(--bad)' : 'var(--warn)', d > 45 ? 'Outage risk! Shift time to refactoring.' : 'Slows engineering; causes outages above ~45.') +
    meter('Team morale', mo, mo < 50 ? 'var(--bad)' : 'var(--accent)', mo < 50 ? 'People are polishing their résumés.' : 'Affects productivity and attrition.') +
    (state.effects.length ? state.effects.filter((e) => e.months < 100).map((e) => `<span class="chip">${esc(e.label)} · ${e.months} mo</span> `).join('') : '');
}

function toggle(id, label, checked, sub, disabled = false) {
  return `<label class="toggle"><span>${label}<span class="muted">${sub}</span></span><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} /></label>`;
}

function renderGtm() {
  const cfg = E.model(state);
  const p = $('price');
  p.min = cfg.price.min; p.max = cfg.price.max; p.step = cfg.price.step; p.value = state.price;
  $('priceOut').textContent = `$${state.price.toLocaleString()}/mo${state.model === 'ent' ? ` ($${E.fmtM(state.price * 12)} ACV)` : ''}`;
  const avg = E.arpa(state);
  const target = state.price * (state.model === 'ent' ? 1 : 1 - 0.17 * E.annualShare(state));
  const gf = state.customers > 0 && Math.abs(avg - target) / target > 0.03;
  $('priceNote').innerHTML = `Similar ${cfg.short} products charge ~$${cfg.price.ref.toLocaleString()}/mo. New price applies to new customers only.` +
    (gf ? ` Existing customers average ${money(avg)}. <button class="small" id="migrate">Move them to the new price</button>` : '');
  if (gf) $('migrate').onclick = () => act(() => E.migratePrice(state));

  $('paid').value = state.paidBudget;
  $('paid').disabled = state.phase === 'idea';
  $('paidOut').textContent = state.phase === 'idea' ? 'after launch' : `${money(state.paidBudget)}/mo`;
  $('content').value = state.contentBudget;
  $('contentOut').textContent = `${money(state.contentBudget)}/mo`;

  const t = [];
  if (state.model !== 'ent') {
    t.push(toggle('tAnnual', 'Offer annual plans', state.annualPlans, '2 months free, 12 months of cash upfront'));
    t.push(toggle('tDunning', 'Failed-payment recovery', state.dunning, '$300/mo: retries, card updater, reminders'));
    t.push(`<label class="toggle"><span>Signup model<span class="muted">Trade signup volume against conversion</span></span><select id="tTrial">
      <option value="optin" ${state.trialMode === 'optin' ? 'selected' : ''}>Free trial, no card</option>
      <option value="card" ${state.trialMode === 'card' ? 'selected' : ''}>Trial, card required</option>
      <option value="freemium" ${state.trialMode === 'freemium' ? 'selected' : ''}>Freemium</option></select></label>`);
  }
  if (state.model !== 'b2c') {
    const soc = { none: '<button class="small" id="tSoc2">Start ($35k)</button>', inprogress: `<span class="chip">ready month ${state.soc2Ready}</span>`, done: '<span class="chip good">certified</span>' }[state.soc2];
    t.push(`<div class="toggle"><span>SOC 2 Type II<span class="muted">${state.model === 'ent' ? 'Most enterprise buyers require it' : 'Unlocks larger customers'}</span></span>${soc}</div>`);
  }
  $('gtmToggles').innerHTML = t.join('');
  if ($('tAnnual')) $('tAnnual').onchange = (e) => act(() => (state.annualPlans = e.target.checked));
  if ($('tDunning')) $('tDunning').onchange = (e) => act(() => (state.dunning = e.target.checked));
  if ($('tTrial')) $('tTrial').onchange = (e) => act(() => (state.trialMode = e.target.value));
  if ($('tSoc2')) $('tSoc2').onclick = () => act(() => E.startSoc2(state));
}

function renderFund() {
  const r = E.ROUNDS[state.roundsRaised];
  const c = E.canRaise(state);
  const score = r ? E.raiseScore(state) : 0;
  const climate = `<span class="chip ${state.climate === 'hot' ? 'good' : state.climate === 'cold' ? 'bad' : ''}">VC market: ${state.climate}</span>`;
  let html = '';
  if (r) {
    const bar = r.id === 'preseed' ? 'Investors back strong teams with real customer insight, design partners or a waitlist, or early revenue.' : `Typical bar: ~${money(r.barMrr * 12)} ARR growing ~${pct(Math.pow(1 + r.targetGrowth, 12) - 1, 0)}/yr with healthy retention.`;
    html += `<div><b>Next: ${r.name}</b> · raise ${money(r.amount)} ${climate}<div class="muted">${bar}</div>
      <div class="meter" style="margin-top:6px"><div class="top"><span class="muted">Investor readiness</span><b>${Math.round(Math.min(2, score) * 100)}%</b></div>
      <div class="bar"><div style="width:${Math.min(100, score * 70)}%;background:${score >= 1 ? 'var(--good)' : score >= 0.7 ? 'var(--warn)' : 'var(--bad)'}"></div></div></div>
      ${state.raise ? `<p class="muted">Raising… ${state.raise.monthsLeft} months left. Keep founder time on "Fundraise".</p>` : `<button id="startRaise" ${c.ok ? '' : 'disabled'}>Start raising</button> <span class="muted">${c.ok ? '' : esc(c.why)}</span>`}</div>`;
  } else html += `<p class="muted">All priced rounds raised. ${climate}</p>`;
  const canRbf = E.mrr(state) >= 10000 && state.rbf <= 0;
  html += `<div class="row" style="margin-top:8px"><div>Revenue-based financing<div class="muted">${state.rbf > 0 ? `Repaying ${money(state.rbf)} left (10% of revenue)` : 'Non-dilutive: ~6× MRR now, repay 1.15× from revenue. Needs $10k MRR.'}</div></div><button class="small" id="rbf" ${canRbf ? '' : 'disabled'}>Take</button></div>`;
  $('fund').innerHTML = html;
  if ($('startRaise')) $('startRaise').onclick = () => act(() => E.startRaise(state));
  $('rbf').onclick = () => act(() => E.takeRbf(state));
}

function renderLog() {
  $('log').innerHTML = state.log.slice().reverse().slice(0, 80)
    .map((e) => `<li class="${e.type}"><span class="m">Month ${e.month}</span>${esc(e.text)}</li>`).join('');
}

// ---------------------------------------------------------------------------
// Unit economics tab
// ---------------------------------------------------------------------------

function grade(v, [good, ok], lowerBetter = false) {
  if (v == null || !isFinite(v)) return '';
  if (lowerBetter) return v <= good ? 'good' : v <= ok ? 'ok' : 'bad';
  return v >= good ? 'good' : v >= ok ? 'ok' : 'bad';
}

function renderEconomics() {
  const m = E.metrics(state);
  const B = E.BENCH, mod = state.model, cfg = E.model(state);
  const cards = [
    ['ARPA', money(m.arpa), '', `Average revenue per account per month. Reference for ${cfg.short}: ~$${cfg.price.ref.toLocaleString()}.`, 'Your price, net of discounts, plus expansion.'],
    ['Logo churn (monthly)', pct(m.logoChurn), grade(m.logoChurn, B.logoChurn[mod], true), `Good for ${cfg.short}: under ${pct(B.logoChurn[mod][0])}/month.`, 'Share of customers who cancel each month. 3%/month is ~31% a year.'],
    ['Net revenue retention', pct(m.nrr, 0), grade(m.nrr, B.nrr[mod]), `Good for ${cfg.short}: ${pct(B.nrr[mod][0], 0)}+ annualized.`, 'Revenue kept from existing customers after churn, downgrades and expansion. Over 100% means the base grows on its own.'],
    ['Gross margin', pct(m.grossMargin, 0), grade(m.grossMargin, B.grossMargin), 'Good SaaS: 75–85%.', '(Revenue − hosting − payment fees − support) ÷ revenue.'],
    ['CAC', money(m.cac), '', 'Excludes founder time.', 'Customer acquisition cost: sales & marketing spend ÷ new customers (3-month blended).'],
    ['LTV', money(m.ltv), '', 'ARPA × gross margin ÷ net revenue churn (capped at 5 years).', 'Lifetime gross profit from an average customer.'],
    ['LTV : CAC', m.ltvCac == null ? '—' : `${m.ltvCac.toFixed(1)}×`, grade(m.ltvCac, B.ltvCac), 'Healthy: 3× or more. Under 1× loses money on every customer.', 'Value of a customer vs. what it costs to win one.'],
    ['CAC payback', m.payback == null ? '—' : `${m.payback.toFixed(1)} mo`, grade(m.payback, B.payback[mod], true), `Good for ${cfg.short}: under ${B.payback[mod][0]} months.`, 'Months of gross profit to earn back acquisition cost. Drives how much cash growth needs.'],
    ['Burn multiple', m.burnMultiple == null ? (state.flags.defaultAlive ? 'Profitable' : '—') : isFinite(m.burnMultiple) ? `${m.burnMultiple.toFixed(1)}×` : '∞', grade(m.burnMultiple, B.burnMultiple, true), 'Great: under 1×. Fine: under 1.5–2×.', 'Net cash burned ÷ net new ARR. How efficiently you turn cash into growth.'],
    ['Growth (CMGR)', pct(m.cmgr), m.cmgr == null ? '' : m.cmgr >= 0.08 ? 'good' : m.cmgr >= 0.03 ? 'ok' : 'bad', 'Early stage: 10–20%/mo is excellent. ~6%/mo ≈ 2× a year.', 'Compound monthly growth rate of MRR over 3 months.'],
    ['Rule of 40', m.ruleOf40 == null ? '—' : m.ruleOf40.toFixed(0), m.ruleOf40 == null ? '' : m.ruleOf40 >= 40 ? 'good' : m.ruleOf40 >= 20 ? 'ok' : 'bad', 'Growth % + profit margin % ≥ 40 (mainly for $1M+ ARR).', 'Balances growth against profitability.'],
  ];
  $('metricCards').innerHTML = cards.map(([k, v, g, b, d]) => `<div class="metric ${g}"><div class="muted">${k}</div><div class="v">${v}</div><div class="b">${b}</div><p>${d}</p></div>`).join('');

  const l = state.lastMonth;
  if (l) {
    const c = l.costs;
    const rows = [['Cash collected', l.collected], ['Payroll (employees)', -c.payroll], ['Founder salaries', -c.founderPay], ['Paid ads + content', -c.marketing], ['Sales commissions', -c.commission], ['Hosting & infrastructure (COGS)', -c.cogs], ['Payment processing fees', -c.fees], ['Tools, legal, accounting', -c.tools], ['SOC 2 / dunning / other', -(c.soc2 + c.dunning + c.other)], ['Debt repayment (RBF)', -l.rbfPay]];
    $('pnl').innerHTML = `<table>${rows.filter(([, v]) => Math.abs(v) > 0.5).map(([k, v]) => `<tr><td>${k}</td><td class="${v < 0 ? '' : 'up'}">${money(v)}</td></tr>`).join('')}<tr class="total"><td>Net cash flow</td><td class="${l.netCash >= 0 ? 'up' : 'down'}">${money(l.netCash)}</td></tr></table>
      <p class="muted">Recognized revenue (MRR) was ${money(l.revenue)}. Annual plans make cash and revenue differ.</p>`;
  } else $('pnl').innerHTML = '<p class="muted">Play a month to see your P&amp;L.</p>';

  const invOwn = state.investors.reduce((a, i) => a + i.ownership, 0);
  const pool = Math.max(0, 1 - state.founderEquity - state.deadEquity - invOwn);
  const capRows = [['Active founders', state.founderEquity], ...(state.deadEquity > 0 ? [['Departed co-founder', state.deadEquity]] : []), ...state.investors.map((i) => [`${i.name} investors${i.participating ? ' (2× participating)' : ''}`, i.ownership]), ...(pool > 0.001 ? [['Other', pool]] : [])];
  $('captable').innerHTML = `<table>${capRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${pct(v)}</td></tr>`).join('')}</table>` +
    (state.investors.length ? `<p class="muted">At a $${E.fmtM(E.mrr(state) * 12 * 6)} exit (6× ARR), founders would take home ~$${E.fmtM(E.exitPayout(state, E.mrr(state) * 12 * 6))} after liquidation preferences.</p>` : '<p class="muted">100% founder-owned. Bootstrapping keeps control; venture money buys speed.</p>');
}

// ---------------------------------------------------------------------------
// Playbook tab
// ---------------------------------------------------------------------------

let pbDone = {};
try { pbDone = JSON.parse(store.get(PB_KEY)) || {}; } catch {}

function renderPlaybook() {
  const filter = $('pbModel').value;
  const show = (models) => filter === 'all' || !models || models.includes(filter);
  $('playbook').innerHTML = PLAYBOOK.filter((st) => show(st.appliesTo)).map((st, i) => {
    const steps = st.steps.filter((x) => show(x.models ?? st.appliesTo));
    const done = steps.filter((x) => pbDone[x.id]).length;
    const bench = st.benchmarks?.length ? `<table style="margin-top:10px"><tr><th>Benchmark</th><th>B2C</th><th>B2B SMB</th><th>Enterprise</th></tr>${st.benchmarks.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>` : '';
    const tpls = (st.templates ?? []).map((t) => `<details class="tpl"><summary><b>Template:</b> ${esc(t.title)}</summary><pre>${esc(t.body)}</pre><button class="small" data-copy="${esc(t.title)}">Copy</button></details>`).join('');
    return `<details class="stage" ${i === 0 ? 'open' : ''}><summary><span class="t">${i + 1}. ${esc(st.title)}</span><span class="muted">${done}/${steps.length}</span></summary>
      <div class="body"><p class="summary">${esc(st.summary)}</p>
      ${steps.map((x) => `<div class="step ${pbDone[x.id] ? 'done' : ''}"><input type="checkbox" data-step="${x.id}" ${pbDone[x.id] ? 'checked' : ''} aria-label="${esc(x.text)}" /><details><summary class="stext">${esc(x.text)}</summary><p>${esc(x.detail)}</p></details></div>`).join('')}
      ${bench}${tpls}</div></details>`;
  }).join('');
}

function renderCalc() {
  const v = (id) => Math.max(0, +$(id).value || 0);
  const price = v('cPrice'), churn = Math.max(0.1, v('cChurn')) / 100, gm = Math.min(100, Math.max(1, v('cGm'))) / 100, cac = v('cCac'), fixed = v('cFixed');
  const ltv = (price * gm) / churn;
  const ratio = cac ? ltv / cac : Infinity;
  const payback = price * gm ? cac / (price * gm) : Infinity;
  const breakeven = price * gm ? Math.ceil(fixed / (price * gm)) : Infinity;
  const life = 1 / churn;
  const tag = (ok) => `<span class="${ok ? 'up' : 'down'}">${ok ? '✓' : '✗'}</span>`;
  $('calcOut').innerHTML = cells([
    ['Avg. customer lifetime', `${life.toFixed(0)} months`],
    ['LTV (gross profit)', money(ltv)],
    ['LTV : CAC', `${isFinite(ratio) ? ratio.toFixed(1) + '×' : '∞'} ${tag(ratio >= 3)}`],
    ['CAC payback', `${isFinite(payback) ? payback.toFixed(1) : '∞'} mo ${tag(payback <= 12)}`],
    ['Customers to break even', isFinite(breakeven) ? breakeven.toLocaleString() : '∞'],
    ['Annual churn', pct(1 - Math.pow(1 - churn, 12), 0)],
  ]);
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

function renderLessons() {
  $('lessonCount').textContent = state.lessons.length || '';
  $('lessons').innerHTML = state.lessons.length
    ? state.lessons.slice().reverse().map((l) => `<div class="lesson-card"><h3>${esc(l.title)}</h3><p class="muted">Month ${l.month}</p><p>${esc(l.text)}</p></div>`).join('')
    : '<p class="muted">No lessons yet. They unlock as you face real founder decisions.</p>';
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

function maybeShowDecision() {
  const d = E.currentDecision(state);
  if (!d || $('decisionDialog').open) return;
  stopAuto();
  $('decTitle').textContent = d.title;
  $('decText').textContent = d.text;
  $('decResult').hidden = true;
  $('decChoices').hidden = false;
  $('decChoices').innerHTML = d.choices.map((c, i) => `<button data-choice="${i}">${esc(c)}</button>`).join('');
  $('decChoices').onclick = (e) => {
    const i = e.target.closest('[data-choice]')?.dataset.choice;
    if (i == null) return;
    const res = E.decide(state, d.id, +i);
    save();
    $('decChoices').hidden = true;
    $('decOutcome').textContent = res.text;
    $('decLesson').textContent = res.lesson ?? '';
    $('decResult').hidden = false;
    $('decContinue').focus();
  };
  $('decisionDialog').showModal();
}
$('decContinue').onclick = () => { $('decisionDialog').close(); render(); };
$('decisionDialog').addEventListener('cancel', (e) => e.preventDefault()); // decisions must be made

function showEnd() {
  stopAuto();
  if ($('endDialog').open) return;
  const t = { won: '🎉 $10M ARR!', exited: '🤝 Acquired', bankrupt: '💀 Out of cash' }[state.status];
  $('endTitle').textContent = t;
  $('endText').textContent = state.endText + (state.status === 'bankrupt' ? ' Most startups die this way: not from competition, but from running out of runway before finding a repeatable growth engine.' : '');
  $('endDialog').showModal();
}
$('endRestart').onclick = () => { $('endDialog').close(); openStart(); };
$('endLessons').onclick = () => { $('endDialog').close(); setTab('lessons'); };

let pickedModel = 'smb';
function openStart() {
  stopAuto();
  $('startName').value = randomName();
  $('modelCards').innerHTML = Object.entries(E.MODELS).map(([k, m]) => `<button class="model-card" data-model="${k}" aria-pressed="${k === pickedModel}"><b>${m.label}</b><span>${m.blurb}</span></button>`).join('');
  $('startCancel').hidden = !state;
  $('startDialog').showModal();
}
$('modelCards').onclick = (e) => {
  const b = e.target.closest('[data-model]');
  if (!b) return;
  pickedModel = b.dataset.model;
  for (const x of $('modelCards').children) x.setAttribute('aria-pressed', x === b);
};
$('startGo').onclick = () => {
  state = E.newGame({ name: $('startName').value.trim() || randomName(), model: pickedModel, seed: Date.now() });
  $('pbModel').value = pickedModel;
  $('startDialog').close();
  setTab('company');
  act(() => {});
};
$('startCancel').onclick = () => $('startDialog').close();
$('startDialog').addEventListener('cancel', (e) => { if (!state) e.preventDefault(); });

function randomName() {
  const a = ['Cloud', 'Stack', 'Pipe', 'Sync', 'Flow', 'Metric', 'Ship', 'Desk', 'Loop', 'Form', 'Ledger', 'Pulse'];
  const b = ['ly', 'io', 'HQ', 'base', 'hub', 'kit', 'wise', 'ify'];
  return a[Math.floor(Math.random() * a.length)] + b[Math.floor(Math.random() * b.length)];
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function save() { store.set(SAVE_KEY, JSON.stringify(state)); }

function render() {
  if (!state) return;
  renderHeader(); renderKpis(); renderCoach(); renderFunnel(); renderTime(); renderTeam(); renderProduct(); renderGtm(); renderFund(); renderLog(); renderLessons();
  if (!$('tab-company').hidden) renderCharts();
  if (!$('tab-economics').hidden) renderEconomics();
  const over = state.status !== 'playing';
  $('next').disabled = over;
  $('auto').disabled = over;
  if (over) showEnd();
  else maybeShowDecision();
}

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

function setTab(name) {
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', b.dataset.tab === name);
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== `tab-${name}`;
  store.set(TAB_KEY, name);
  if (name === 'playbook') renderPlaybook();
  render();
}

const nextMonth = () => act(() => E.step(state));
$('next').onclick = nextMonth;
$('auto').onclick = () => {
  if (autoTimer) return stopAuto();
  $('auto').textContent = '⏸ Pause';
  autoTimer = setInterval(() => (state.pendingDecision ? stopAuto() : nextMonth()), 900);
};
$('restart').onclick = openStart;
document.querySelector('.tabs').onclick = (e) => { const t = e.target.closest('[data-tab]'); if (t) setTab(t.dataset.tab); };

$('team').onclick = (e) => {
  const b = e.target.closest('button');
  if (b?.dataset.hire) act(() => E.hire(state, b.dataset.hire));
  if (b?.dataset.fire) act(() => E.fire(state, b.dataset.fire));
};
$('time').oninput = (e) => { if (e.target.dataset.time) act(() => E.setTime(state, e.target.dataset.time, +e.target.value)); };
$('salary').oninput = (e) => act(() => (state.founderSalary = +e.target.value));
$('focus').oninput = (e) => act(() => (state.featureFocus = +e.target.value));
$('price').oninput = (e) => act(() => (state.price = +e.target.value));
$('paid').oninput = (e) => act(() => (state.paidBudget = +e.target.value));
$('content').oninput = (e) => act(() => (state.contentBudget = +e.target.value));

$('pbModel').onchange = renderPlaybook;
$('playbook').onchange = (e) => {
  const id = e.target.dataset.step;
  if (!id) return;
  pbDone[id] = e.target.checked;
  store.set(PB_KEY, JSON.stringify(pbDone));
  e.target.closest('.step').classList.toggle('done', e.target.checked);
};
$('playbook').onclick = (e) => {
  const title = e.target.dataset.copy;
  if (!title) return;
  const t = PLAYBOOK.flatMap((s) => s.templates ?? []).find((x) => x.title === title);
  navigator.clipboard?.writeText(t.body).then(() => (e.target.textContent = 'Copied'), () => {});
};
for (const id of ['cPrice', 'cChurn', 'cGm', 'cCac', 'cFixed']) $(id).oninput = renderCalc;

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && e.target === document.body && state?.status === 'playing' && !document.querySelector('dialog[open]')) {
    e.preventDefault();
    nextMonth();
  }
});
window.addEventListener('resize', () => state && !$('tab-company').hidden && renderCharts());

renderCalc();
if (state) {
  $('pbModel').value = state.model;
  setTab(store.get(TAB_KEY) || 'company');
} else {
  openStart();
}
