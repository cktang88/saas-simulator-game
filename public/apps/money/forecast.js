// 13-week cash forecast, scenarios, runway trigger rules and forecast-vs-actual scoring. Pure engine, no DOM.
//
// Gap analysis item 10 + operator-tiers audit fix 7. The player picks HOW to forecast, and the method plus the
// assumptions they type decide the accuracy, which is scored later against the real bank balance:
//  - 'quick'      extend last month's burn (what most founders do; ±25% at 3 months, o4 s1 [design])
//  - 'ai_agent'   an AI forecast agent (cfo.ai "Ari" style, $295/mo, T5 §1) that assumes flat burn and
//                  extrapolates revenue growth: the known failure mode (T5 §4)
//  - 'line_items' a 13-week model with named lines: Stripe payouts (with annual renewals as lumps), recurring
//                  bills on their days, payroll on the 15th and last day, founder pay, debt service, tax and
//                  compliance dates, planned hires and one-offs (stellar ±10%, o4 s1 [design])
// Scenarios: base, slow sales, lose the top customer, hire an engineer, churn shock. Each returns runway months,
// cash-out date, minimum cash, default-alive and burn multiple. Trigger rules ("start the raise at 9 months")
// fire from the live forecast and are checked later for whether the founder honoured them.
//
// runwayMonthsForecast(state) is the read other apps use (fundraising leverage): the true line-item runway from
// the live books, independent of how well the player forecasts.

import { notify } from '../../core/state.js';
import { round2, dayOfMonth, isLastDayOfMonth, fmtDate } from '../../core/util.js';
import { mrr, activeSubs, monthlyAmount, ensureStripe } from '../../core/stripe.js';
import { monthlyDebtService } from '../../core/debt.js';
import { addRecurring } from '../../core/bank.js';
import { cfg } from '../../core/market.js';
import { totalCash, runwayWithDebt, FINANCING, sumBy, monthOf } from './common.js';
import { mrrMovements } from './metrics.js';
import { openInvoiceTotal, deferredRevenueNow } from './ledger.js';
import { calendarItems, TAX, entityInfo } from './compliance.js';
import { monthlyCostOf } from '../people/payroll.js';
import { JOB_ROLES } from '../people/catalog.js';
import { mistake } from './operator.js';

export const FORECAST = {
  weeks: 13,
  horizonDays: 1096, // 36 months for runway and default-alive
  hours: { build: 1.5, update: 0.33, quick: 0.25, agent: 0.1 }, // gap analysis item 10: 1.5 h first build, ~20 min/week
  agent: { vendor: 'cfo.ai', price: 295, source: 'cfo.ai Startup tier $295/mo (T5 §1, yespress Sep 2026, secondary)' },
  feeRate: 0.034, // Stripe 2.9% + 30c on a typical SaaS ticket [design blend]; observed rate used when available
  arCollect: 0.9, // share of open invoices collected near the due date [design]
  // Forecast error tiers at 13 weeks (o4 s1, all [design]): stellar ±10%, good 10-20, average ±25, mediocre 40+.
  errorCuts: { stellar: 10, good: 20, average: 30 },
  scenarios: {
    base: { label: 'Base case' },
    slow_sales: { label: 'Slow sales (new MRR −50%)' },
    lose_top: { label: 'Lose the top customer' },
    hire: { label: 'Hire an engineer in week 4' },
    churn_shock: { label: 'Churn shock (churn ×2)' },
  },
  triggerKinds: {
    start_raise: { label: 'Start the raise', unit: 'months', default: 9, honorDays: 30 },
    cut_plan: { label: 'Execute the cut plan', unit: 'months', default: 6, honorDays: 60 },
    pause_hiring: { label: 'Pause hiring', unit: 'months', default: 12, honorDays: 60 },
    cash_floor: { label: 'Cash floor: cut spend', unit: 'usd', default: 50000, honorDays: 60 },
  },
};

// US engineer, midpoint salary, loaded with ~10% employer cost (people/catalog.js, Carta H1 2025) [design load].
const HIRE_COST = () => { const r = JOB_ROLES.engineer.salary.us; return Math.round(((r[0] + r[1]) / 2) * 1.1 / 12); };

export function ensureForecast(state) {
  const b = (state.apps.bank ??= { payees: [], notes: {}, canceled: [], inTransit: [] });
  const f = (b.forecast ??= {});
  f.snapshots ??= [];
  f.triggers ??= [];
  f.assumptions ??= null; // the player's saved assumptions (null = use defaults)
  f.raiseStarts ??= {};
  f.flags ??= {};
  f.agent ??= false;
  return f;
}

// ---------------------------------------------------------------------------------------------------------
// Inputs from the live state
// ---------------------------------------------------------------------------------------------------------

const VAR_EXCLUDE = new Set([...FINANCING, 'stripe_payout', 'payroll', 'payroll_tax', 'owner_draw', 'loan_repayment', 'loan_interest', 'taxes']);
/** Trailing monthly net spend not covered by a named line (ads, inference, usage hosting, travel, contractors paid by ACH...). */
export function variableSpend(state, days = 60) {
  const vendors = new Set(state.recurring.filter((r) => r.active || r.annual || r.cardHold).map((r) => r.vendor));
  const from = state.day - days;
  const lines = state.bank.txns.filter((t) => t.day > from && !VAR_EXCLUDE.has(t.category) && !t.meta?.founderPayroll && !t.meta?.annualPrepay && t.meta?.app !== 'people' && !(t.amount < 0 && vendors.has(t.counterparty) && !t.meta?.usage));
  const span = Math.max(7, Math.min(days, state.day + 1));
  return round2((-sumBy(lines, (t) => t.amount) / span) * 30.4);
}
function observedFeeRate(state) {
  const st = ensureStripe(state);
  const arch = Object.values(st.archive ?? {}).slice(-3);
  const gross = sumBy(arch, (a) => a.gross), fees = sumBy(arch, (a) => a.fees);
  return gross > 500 ? Math.min(0.08, Math.max(0.02, fees / gross)) : FORECAST.feeRate;
}

/** Default assumptions from the last 3 complete months (what a careful founder would start from). */
export function defaultAssumptions(state) {
  const moves = mrrMovements(state);
  const cur = monthOf(state);
  const complete = moves.filter((r) => r.month < cur).slice(-3);
  const rows = complete.length ? complete : moves.slice(-1);
  const newMrr = rows.length ? sumBy(rows, (r) => r.new + r.expansion + r.reactivation) / rows.length : 0;
  const churnRows = rows.filter((r) => r.start > 0);
  const churnPct = churnRows.length ? sumBy(churnRows, (r) => -(r.churn + r.contraction) / r.start) / churnRows.length : 0.03;
  // Annual renewal rate: your own history once there is some, else the segment benchmark (params.js MARKET).
  const st = ensureStripe(state);
  const didRenew = (x) => x.currentPeriodEnd != null && x.currentPeriodEnd - (x.startDay ?? 0) > 400;
  const reached = st.subscriptions.filter((x) => x.interval === 'year' && (didRenew(x) || (x.status === 'canceled' && x.canceledDay != null && x.canceledDay - (x.startDay ?? 0) >= 330)));
  const renewed = reached.filter(didRenew).length;
  const renewalPct = reached.length >= 3 ? renewed / reached.length : (cfg(state)?.annualRenewal ?? 0.75);
  return {
    newMrr: round2(Math.max(0, newMrr)), renewalPct: round2(renewalPct), churnPct: round2(Math.min(0.5, Math.max(0, churnPct)) * 1000) / 1000, variable: Math.max(0, variableSpend(state)),
    hires: [], oneOffs: [],
    includePayroll: true, includeTax: true, includeAnnual: true, includeAR: true, receivablesAsCash: false,
  };
}
export const assumptionsFor = (state) => ({ ...defaultAssumptions(state), ...(ensureForecast(state).assumptions ?? {}) });

// ---------------------------------------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------------------------------------

function taxAmount(state, it, monthlyProfit) {
  if (it.rec?.amount) return it.rec.amount;
  if (/^de-franchise/.test(it.id)) return 450; // APVC method + annual report (money/compliance.js)
  if (/^de-llc-tax/.test(it.id)) return TAX.deLlcTax;
  if (/^cest-/.test(it.id)) return monthlyProfit > 0 ? round2((monthlyProfit * 12 * TAX.corpRate) / 4) : 0;
  if (/^1120-/.test(it.id)) return TAX.cpaBase.ccorp;
  return 0;
}

/**
 * Project daily cash. opts: { method, scenario, assumptions, days } → { daily: [cash...], weeks: [...], months,
 * runwayMonths, cashOutDay, minCash13, defaultAlive, burnMultiple, netBurn }.
 */
export function project(state, { method = 'line_items', scenario = 'base', assumptions = null, days = FORECAST.horizonDays } = {}) {
  const a = { ...defaultAssumptions(state), ...(assumptions ?? {}) };
  const day0 = state.day;
  const inTransit = sumBy(state.apps.bank?.inTransit ?? [], (x) => x.amount);
  let cash = totalCash(state) + inTransit;
  const ins = new Float64Array(days + 1), outs = new Float64Array(days + 1); // money in / out on day0 + i
  const add = (i, v) => { if (v >= 0) ins[i] += v; else outs[i] -= v; };
  const fee = observedFeeRate(state);
  const rw = runwayWithDebt(state);
  const subs = activeSubs(state);
  let mrr0 = mrr(state);
  let newMrr = a.newMrr, churn = a.churnPct;
  if (scenario === 'slow_sales') newMrr *= 0.5;
  if (scenario === 'churn_shock') churn = Math.min(0.5, churn * 2);
  // Top customer by MRR (lost from day 7 in that scenario).
  const byCust = {};
  for (const s of subs) byCust[s.customerId] = (byCust[s.customerId] ?? 0) + monthlyAmount(s);
  const top = Object.entries(byCust).sort((x, y) => y[1] - x[1])[0];
  const lostId = scenario === 'lose_top' && top ? top[0] : null;

  if (method === 'quick' || method === 'ai_agent') {
    // Flat burn from the bank. The AI agent splits revenue out and grows it at the trailing rate.
    const burn = rw.burn;
    if (method === 'quick') {
      for (let i = 1; i <= days; i++) add(i, -burn / 30.4);
    } else {
      const moves = mrrMovements(state).filter((r) => r.month < monthOf(state)).slice(-3).filter((r) => r.start > 0);
      const g = moves.length ? Math.max(-0.2, Math.min(0.3, sumBy(moves, (r) => r.net / r.start) / moves.length)) : 0;
      const rev0 = mrr0 * (1 - fee);
      const costs = burn + rev0;
      for (let i = 1; i <= days; i++) { add(i, (rev0 * Math.pow(1 + g, i / 30.4)) / 30.4); add(i, -costs / 30.4); }
    }
    if (lostId) for (let i = 7; i <= days; i++) add(i, -((byCust[lostId] * (1 - fee)) / 30.4));
    if (scenario === 'slow_sales' && method === 'ai_agent') for (let i = 1; i <= days; i++) add(i, -((a.newMrr * 0.5 * (1 - fee) * (i / 30.4)) / 30.4));
    if (scenario === 'churn_shock') for (let i = 1; i <= days; i++) add(i, -((mrr0 * a.churnPct * (1 - fee) * Math.min(i / 30.4, 12)) / 30.4));
    if (scenario === 'hire') for (let i = 28; i <= days; i++) add(i, -(HIRE_COST() / 30.4));
    return finish(state, a, ins, outs, cash, days, { newMrr, churn, mrr0, fee, method, scenario });
  }

  // ---- Line items ----
  if (a.receivablesAsCash) cash += openInvoiceTotal(state) + deferredRevenueNow(state); // the trap: not cash
  // Stripe balance in flight lands over the next payout days.
  const st = ensureStripe(state);
  for (const p of st.pending ?? []) { const i = Math.max(1, Math.min(days, (p.availableDay ?? day0 + 2) - day0)); add(i, p.amount); }
  if (st.available > 0) add(1, st.available);
  for (const p of (st.payouts ?? []).filter((x) => x.status === 'in_transit')) add(Math.max(1, Math.min(days, p.arrivalDay - day0)), p.amount);
  // Subscription revenue. Annual plans arrive as lumps at renewal when includeAnnual; otherwise smoothed (trap).
  let monthlyBase = 0;
  const lumps = [];
  for (const s of subs) {
    const amt = monthlyAmount(s);
    if (s.customerId === lostId || s.cancelAtPeriodEnd) continue; // already cancelled: no renewal coming
    if (s.interval === 'year' && a.includeAnnual) lumps.push({ day: (s.currentPeriodEnd ?? day0 + 365) + (s.paymentTermsDays ?? 0), amount: amt * 12 });
    else monthlyBase += amt;
  }
  if (lostId) mrr0 -= byCust[lostId];
  let m = monthlyBase;
  for (let i = 1; i <= days; i++) {
    m += newMrr / 30.4 - (m * churn) / 30.4;
    add(i, (m * (1 - fee)) / 30.4);
  }
  for (const l of lumps) {
    for (let d = l.day, yr = 0; d - day0 <= days; d += 365, yr++) {
      if (d <= day0) continue;
      const keep = Math.pow(a.renewalPct ?? 0.75, yr + 1); // annual customers decide at renewal
      add(d - day0, l.amount * keep * (1 - fee));
    }
  }
  if (a.includeAR) for (const inv of st.invoices.filter((x) => x.status === 'open' && x.method === 'ach_invoice')) { const i = Math.max(1, Math.min(days, (inv.dueDay ?? day0 + 30) - day0)); add(i, inv.amount * FORECAST.arCollect); }
  // Calendar for the horizon (Date math once, not per line item).
  const dom = new Uint8Array(days + 1), last = new Uint8Array(days + 1);
  for (let i = 1; i <= days; i++) { dom[i] = dayOfMonth(state, day0 + i); last[i] = isLastDayOfMonth(state, day0 + i) ? 1 : 0; }
  // Recurring bills on their billing day; annual plans at renewal.
  for (const r of state.recurring) {
    if (r.usage) continue;
    if (r.annual) { for (let d = r.annual.renewDay; d - day0 <= days; d += 365) if (d > day0) add(d - day0, -(r.annual.amount)); continue; }
    if (!(r.active || r.cardHold) || r.variable) continue;
    for (let i = 1; i <= days; i++) if (dom[i] === r.dayOfMonth) add(i, -(r.amount));
  }
  // Variable spend, smoothed.
  for (let i = 1; i <= days; i++) add(i, -(a.variable / 30.4));
  // Payroll: employees on the 15th and last day; contractors at month end; future start dates honoured.
  const members = (state.apps.people?.members ?? []).filter((x) => ['active', 'offer'].includes(x.status) && x.kind !== 'ai_agent' && !x.recurringId);
  const hires = [...(a.hires ?? []).map((h) => ({ cost: Number(h.monthlyCost) || 0, start: day0 + 7 * (Number(h.startWeek) || 0), end: Infinity, contractor: false }))];
  if (scenario === 'hire') hires.push({ cost: HIRE_COST(), start: day0 + 28, end: Infinity, contractor: false });
  const people = [...members.map((x) => ({ cost: monthlyCostOf(state, x), start: x.startDay ?? day0, end: x.endDay ?? Infinity, contractor: x.engagement === 'contractor' })), ...hires];
  const founder = (state.founder?.salary ?? 0) * (entityInfo(state).entity === 'ccorp' ? 1.08 : 1);
  const debt = monthlyDebtService(state);
  for (let i = 1; i <= days; i++) {
    const d = day0 + i;
    for (const p of people) {
      if (d < p.start || d > p.end) continue;
      if (!a.includePayroll) add(i, -(p.cost / 30.4));
      else if (p.contractor) { if (last[i]) add(i, -(p.cost)); }
      else if (dom[i] === 15 || last[i]) add(i, -(p.cost / 2));
    }
    if (last[i]) add(i, -(founder));
    if (dom[i] === 1) add(i, -(debt));
  }
  // Tax and compliance dates.
  if (a.includeTax) {
    const monthlyProfit = -rw.burn;
    let items = [];
    try { items = calendarItems(state); } catch { items = []; }
    for (const it of items) {
      if (it.status === 'done' || it.day <= day0 || it.day - day0 > days || !['payment', 'filing'].includes(it.kind)) continue;
      add(it.day - day0, -(taxAmount(state, it, monthlyProfit)));
    }
  }
  for (const o of a.oneOffs ?? []) { const i = Math.max(1, Math.min(days, 7 * (Number(o.week) || 0) || 1)); add(i, Number(o.amount) || 0); }
  return finish(state, a, ins, outs, cash, days, { newMrr, churn, mrr0, fee, method, scenario });
}

function finish(state, a, ins, outs, cash0, days, { newMrr, churn, mrr0, fee, method, scenario }) {
  const day0 = state.day;
  const daily = new Array(days + 1);
  let cash = cash0, out = null, min13 = cash0;
  daily[0] = cash0;
  for (let i = 1; i <= days; i++) {
    cash += ins[i] - outs[i];
    daily[i] = cash;
    if (i <= 91) min13 = Math.min(min13, cash);
    if (out == null && cash < 0) out = i;
  }
  const weeks = [];
  for (let k = 1; k <= FORECAST.weeks; k++) {
    let inflow = 0, outflow = 0;
    for (let i = 7 * (k - 1) + 1; i <= 7 * k; i++) { inflow += ins[i]; outflow += outs[i]; }
    weeks.push({ k, start: day0 + 7 * (k - 1) + 1, end: day0 + 7 * k, open: daily[7 * (k - 1)], inflow: round2(inflow), outflow: round2(outflow), close: round2(daily[7 * k]) });
  }
  const monthNet = (from, to) => (daily[Math.min(days, to)] - daily[Math.min(days, from)]);
  const firstQ = monthNet(0, 91) / 3;
  const lastQ = monthNet(days - 91, days) / 3;
  const netNewMrr = newMrr - churn * mrr0;
  const netBurn = -firstQ;
  return {
    method, scenario, weeks, daily,
    runwayMonths: out == null ? Infinity : round2(out / 30.4),
    cashOutDay: out == null ? null : day0 + out,
    minCash13: round2(min13),
    defaultAlive: out == null && lastQ >= 0,
    netBurn: round2(netBurn),
    burnMultiple: netBurn > 0 && netNewMrr > 0 ? round2(netBurn / (netNewMrr * 12)) : null,
    endCash: round2(daily[days]),
  };
}

export function scenarios(state, method = 'line_items', assumptions = null) {
  const out = {};
  for (const id of Object.keys(FORECAST.scenarios)) out[id] = project(state, { method, scenario: id, assumptions, days: FORECAST.horizonDays });
  return out;
}

// The true runway (live line items, default assumptions). Cached per day and ledger size; does not mutate state.
const cache = new WeakMap();
export function runwayForecast(state) {
  const key = `${state.day}|${state.bank.txns.length}|${state.recurring.length}`;
  const c = cache.get(state);
  if (c?.key === key) return c.value;
  let value;
  try {
    const p = project(state, { method: 'line_items', scenario: 'base' });
    value = { months: p.runwayMonths, cashOutDay: p.cashOutDay, defaultAlive: p.defaultAlive, burnMultiple: p.burnMultiple, netBurn: p.netBurn };
  } catch {
    const rw = runwayWithDebt(state);
    value = { months: rw.runway, cashOutDay: rw.runway === Infinity ? null : state.day + Math.round(rw.runway * 30.4), defaultAlive: rw.burn <= 0, burnMultiple: null, netBurn: rw.burn };
  }
  cache.set(state, { key, value });
  return value;
}
/** Months of runway from the true line-item forecast (Infinity when cash never runs out in 36 months). */
export const runwayMonthsForecast = (state) => runwayForecast(state).months;

// ---------------------------------------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------------------------------------

/** Hours this forecast costs: first line-item build vs a weekly update. */
export function forecastHours(state, method) {
  const f = ensureForecast(state);
  if (method === 'quick') return FORECAST.hours.quick;
  if (method === 'ai_agent') return FORECAST.hours.agent;
  const last = f.snapshots.filter((s) => s.method === 'line_items').at(-1);
  return last && state.day - last.day <= 14 ? FORECAST.hours.update : last ? 0.75 : FORECAST.hours.build;
}

export function saveAssumptions(state, patch) {
  const f = ensureForecast(state);
  const a = { ...(f.assumptions ?? {}), ...patch };
  for (const k of ['newMrr', 'churnPct', 'variable', 'renewalPct']) if (a[k] != null) a[k] = Math.max(0, Number(a[k]) || 0);
  if (a.renewalPct != null) a.renewalPct = Math.min(1, a.renewalPct);
  a.hires = (a.hires ?? []).filter((h) => Number(h.monthlyCost) > 0).slice(0, 10);
  a.oneOffs = (a.oneOffs ?? []).filter((o) => Number(o.amount)).slice(0, 10);
  f.assumptions = a;
  return a;
}

export function setAgent(state, on) {
  const f = ensureForecast(state);
  f.agent = Boolean(on);
  let r = state.recurring.find((x) => x.forecastAgent);
  if (on && !r) { r = addRecurring(state, { vendor: FORECAST.agent.vendor, amount: FORECAST.agent.price, category: 'software', dayOfMonth: Math.min(28, dayOfMonth(state)), note: 'AI forecast agent (Startup tier)' }); r.forecastAgent = true; }
  if (!on && r) state.recurring.splice(state.recurring.indexOf(r), 1);
}

/** Save the forecast as a dated snapshot (what gets scored against the real bank balance later). */
export function saveSnapshot(state, method) {
  const f = ensureForecast(state);
  if (method === 'ai_agent' && !f.agent) throw new Error('Turn on the AI forecast agent first.');
  const a = method === 'line_items' ? assumptionsFor(state) : null;
  const base = project(state, { method, scenario: 'base', assumptions: a });
  const scen = {};
  for (const id of Object.keys(FORECAST.scenarios)) scen[id] = id === 'base' ? base.runwayMonths : project(state, { method, scenario: id, assumptions: a }).runwayMonths;
  const snap = {
    id: `fc_${state.day}_${f.snapshots.length}`, day: state.day, method, assumptions: a ? { newMrr: a.newMrr, churnPct: a.churnPct, variable: a.variable, hires: a.hires.length, receivablesAsCash: a.receivablesAsCash, includePayroll: a.includePayroll, includeTax: a.includeTax, includeAnnual: a.includeAnnual } : null,
    open: round2(base.daily[0]), predicted: base.weeks.map((w) => w.close), runwayMonths: base.runwayMonths, scenarios: scen, defaultAlive: base.defaultAlive, burnMultiple: base.burnMultiple,
    actual: [], err4: null, err13: null,
  };
  f.snapshots.push(snap);
  if (f.snapshots.length > 80) f.snapshots.splice(0, 20);
  return snap;
}

export function addTrigger(state, { kind, threshold }) {
  const f = ensureForecast(state);
  const k = FORECAST.triggerKinds[kind];
  if (!k) throw new Error('Unknown trigger.');
  if (!(threshold > 0)) throw new Error('Set a threshold.');
  const t = { id: `tr_${state.day}_${f.triggers.length}`, kind, threshold, createdDay: state.day, status: 'armed' };
  f.triggers.push(t);
  return t;
}
export function removeTrigger(state, id) {
  const f = ensureForecast(state);
  f.triggers = f.triggers.filter((t) => t.id !== id || t.status !== 'armed');
}

// ---------------------------------------------------------------------------------------------------------
// Daily: score snapshots, evaluate triggers, record runway at raise start, flag unplanned runway
// ---------------------------------------------------------------------------------------------------------

const cashNow = (state) => totalCash(state) + sumBy(state.apps.bank?.inTransit ?? [], (x) => x.amount);
export const errorPct = (pred, actual, open) => round2((Math.abs(pred - actual) / Math.max(Math.abs(actual), Math.abs(open) * 0.25, 1000)) * 100);

/** Live runway as the founder's own forecast shows it (their last method and assumptions), else the trailing number. */
export function livePlayerRunway(state) {
  const f = ensureForecast(state);
  const last = f.snapshots.at(-1);
  if (!last || state.day - last.day > 45) { const rw = runwayWithDebt(state); return { months: rw.runway, source: 'trailing' }; }
  return { months: project(state, { method: last.method, scenario: 'base', assumptions: last.method === 'line_items' ? assumptionsFor(state) : null }).runwayMonths, source: last.method };
}

export function forecastDay(state) {
  const f = ensureForecast(state);
  // Score snapshots against reality.
  for (const s of f.snapshots) {
    const k = (state.day - s.day) / 7;
    if (!Number.isInteger(k) || k < 1 || k > FORECAST.weeks) continue;
    const actual = round2(cashNow(state));
    s.actual[k - 1] = actual;
    if (k === 4) s.err4 = errorPct(s.predicted[3], actual, s.open);
    if (k === 13) s.err13 = errorPct(s.predicted[12], actual, s.open);
  }
  // Runway when a raise starts (fundraising leverage and the tier read).
  const raise = state.apps.fundraising?.raise;
  if (raise?.id && !f.raiseStarts[raise.id]) {
    f.raiseStarts[raise.id] = { day: state.day, runway: runwayMonthsForecast(state), stage: raise.stage };
  }
  if (state.day % 7 !== 0) return; // weekly checks
  const live = livePlayerRunway(state);
  for (const t of f.triggers) {
    if (t.status === 'armed') {
      const hit = t.kind === 'cash_floor' ? cashNow(state) < t.threshold : live.months < t.threshold;
      if (hit) {
        t.status = 'fired'; t.firedDay = state.day; t.burnAtFire = runwayWithDebt(state).burn; t.runwayAtFire = live.months;
        const k = FORECAST.triggerKinds[t.kind];
        notify(state, `Your trigger fired: ${t.kind === 'cash_floor' ? `cash under $${t.threshold.toLocaleString()}` : `runway ${Number.isFinite(live.months) ? live.months.toFixed(1) : '∞'} months < ${t.threshold}`} → ${k.label.toLowerCase()} (rule set ${fmtDate(state, t.createdDay)}).`, { type: 'warn', app: 'bank' });
      }
    } else if (t.status === 'fired') checkHonored(state, t);
  }
  // Running low with no plan: no recent forecast, no trigger, no raise or financing in motion.
  const rw = runwayMonthsForecast(state);
  if (rw < 4 && !f.flags.unplanned) {
    const recent = f.snapshots.some((s) => state.day - s.day <= 45);
    const plan = f.triggers.some((t) => t.status !== 'armed' || state.day - t.createdDay <= 365);
    const moving = state.apps.fundraising?.raise?.status === 'active' || (state.debt?.applications ?? []).some((x) => state.day - (x.day ?? x.appliedDay ?? 0) <= 60);
    if (!recent && !plan && !moving) {
      f.flags.unplanned = state.day;
      mistake(state, { functionId: 'cash_runway', id: 'wait_for_round', label: 'Ran down to under 4 months of runway with no plan', cost: { days: 60 }, delayed: true, detail: `True runway ${rw.toFixed(1)} months, no forecast in 45 days, no trigger rule, no raise or financing under way. Every option is now worse: a raise takes 3-6 months and investors see the deadline.`, app: 'bank', key: `unplanned:${state.day}` });
      notify(state, `Runway is ${rw.toFixed(1)} months and nothing is in motion. Build a forecast, decide the cuts, and start financing now.`, { type: 'bad', app: 'bank' });
    }
  }
  if (rw >= 6) f.flags.unplanned = null;
}

function checkHonored(state, t) {
  const k = FORECAST.triggerKinds[t.kind];
  const since = state.day - t.firedDay;
  let ok = false;
  if (t.kind === 'start_raise') {
    const fr = state.apps.fundraising;
    ok = Boolean(fr?.raise && fr.raise.startDay >= t.firedDay - 14) || (fr?.rounds ?? []).some((r) => (r.closedDay ?? r.day ?? 0) >= t.firedDay - 14) || (state.debt?.applications ?? []).some((x) => (x.day ?? x.appliedDay ?? -1) >= t.firedDay - 14);
  } else if (t.kind === 'pause_hiring') {
    const hired = (state.apps.people?.members ?? []).some((m) => m.kind !== 'ai_agent' && (m.startDay ?? -1) > t.firedDay);
    if (hired) { t.status = 'ignored'; t.resolvedDay = state.day; return mistake(state, { functionId: 'cash_runway', id: 'hire_on_forecast', label: 'Hired after your own pause-hiring trigger fired', cost: { usd: 0, days: 30 }, delayed: true, detail: 'The rule said pause hiring below the runway line; a new hire started anyway and locked in the burn.', app: 'bank', key: `trig:${t.id}` }); }
    ok = since >= k.honorDays;
  } else {
    ok = runwayWithDebt(state).burn <= (t.burnAtFire ?? Infinity) * 0.9 && since >= 21;
  }
  if (ok) { t.status = 'honored'; t.resolvedDay = state.day; return; }
  if (since >= k.honorDays) {
    t.status = 'ignored'; t.resolvedDay = state.day;
    mistake(state, { functionId: 'cash_runway', id: t.kind === 'start_raise' ? 'wait_for_round' : 'cut_payback_marketing', label: `Ignored your own trigger: ${k.label.toLowerCase()}`, cost: { days: k.honorDays }, delayed: true, detail: `The rule fired ${fmtDate(state, t.firedDay)} at ${Number.isFinite(t.runwayAtFire) ? t.runwayAtFire.toFixed(1) : '∞'} months of runway and nothing happened for ${k.honorDays} days.`, app: 'bank', key: `trig:${t.id}` });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Read-outs
// ---------------------------------------------------------------------------------------------------------

export function forecastStats(state) {
  const f = ensureForecast(state);
  const recent = f.snapshots.filter((s) => state.day - s.day <= 120);
  const scored13 = f.snapshots.filter((s) => s.err13 != null).slice(-6);
  const scored4 = f.snapshots.filter((s) => s.err4 != null).slice(-8);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const weeks = new Set(recent.map((s) => Math.floor(s.day / 7)));
  const fired = f.triggers.filter((t) => ['honored', 'ignored'].includes(t.status));
  return {
    snapshots: f.snapshots.length, recent: recent.length, weeksCovered: weeks.size,
    lineItems: recent.filter((s) => s.method === 'line_items').length,
    err13: mean(scored13.map((s) => s.err13)), err4: mean(scored4.map((s) => s.err4)), scored: scored13.length || scored4.length,
    triggers: f.triggers.length, honored: fired.filter((t) => t.status === 'honored').length, ignored: fired.filter((t) => t.status === 'ignored').length,
    raiseStarts: Object.values(f.raiseStarts),
    trapAR: recent.some((s) => s.assumptions?.receivablesAsCash), trapAnnual: recent.some((s) => s.assumptions && !s.assumptions.includeAnnual),
  };
}

/** Events for the Automations app. */
export function forecastEvents(state, sinceDay = state.day) {
  const f = ensureForecast(state);
  return f.triggers.filter((t) => t.firedDay != null && t.firedDay >= sinceDay).map((t) => ({ id: `runway_trigger:${t.id}`, type: 'runway_below', day: t.firedDay, triggerId: t.id, kind: t.kind, threshold: t.threshold }));
}
