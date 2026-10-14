// SaaS metrics for the Analytics app (ChartMogul/Baremetrics-style). Pure, testable in Node.
// Definitions follow docs/research/finance-and-payments.md §5. MRR policy (core/stripe.js): annual plans count
// price ÷ 12, trials count 0 until the first payment, past_due subscriptions stay in MRR during dunning and churn
// when retries are exhausted.

import { ensureStripe, monthlyAmount, mrr, activeSubs } from '../../core/stripe.js';
import { PAYMENTS, MARKET } from '../../core/params.js';
import { monthOf, monthsBetween, monthEndDay, monthStartDay, prevMonthKey, sumBy, totalCash, trailingBurn, FINANCING } from './common.js';

export const MOVES = ['new', 'expansion', 'reactivation', 'contraction', 'churn'];

// Events with ChartMogul's reactivation rule: a "new" subscription from a customer who churned before is a reactivation.
export function classifiedEvents(state) {
  const st = ensureStripe(state);
  const churned = new Set();
  const out = [];
  for (const e of [...st.events].sort((a, b) => a.day - b.day)) {
    let type = e.type;
    if (type === 'new' && churned.has(e.customerId)) type = 'reactivation';
    if (type === 'churn') churned.add(e.customerId);
    out.push({ ...e, type });
  }
  return out;
}

// Monthly MRR movements with a reconciliation check: start + Σ movements = end, and end ties to the
// daily MRR snapshot (core clock) or to live MRR for the current month.
export function mrrMovements(state) {
  const ev = classifiedEvents(state);
  const rawEvents = ensureStripe(state).events;
  const months = monthsBetween(monthOf(state, 0), monthOf(state));
  const snaps = state.metrics.daily;
  const running = new Map(); // customerId -> MRR
  const paying = () => [...running.values()].filter((v) => v > 0.001).length;
  let i = 0, start = 0;
  return months.map((m) => {
    const r = { month: m, new: 0, expansion: 0, reactivation: 0, contraction: 0, churn: 0, newCount: 0, churnCount: 0, start, startCustomers: paying() };
    while (i < ev.length && monthOf(state, ev[i].day) <= m) {
      const e = ev[i++];
      r[e.type] += e.amount;
      if (e.type === 'new' || e.type === 'reactivation') r.newCount++;
      if (e.type === 'churn') r.churnCount++;
      running.set(e.customerId, (running.get(e.customerId) ?? 0) + e.amount);
    }
    r.net = r.new + r.expansion + r.reactivation + r.contraction + r.churn; // contraction/churn are negative
    r.end = start + r.net;
    r.endCustomers = paying();
    const isCurrent = m === monthOf(state);
    const endDay = monthEndDay(state, m);
    const tol = 0.01 + 0.005 * Math.max(r.startCustomers, r.endCustomers); // events are rounded to cents per subscription
    if (isCurrent) {
      r.reported = mrr(state);
      r.tickEnd = r.end;
    } else {
      // The clock snapshots MRR at the end of each day's tick. Changes made later that same day (UI actions)
      // land after the snapshot, so compare the snapshot with MRR from the events that existed at that tick.
      const snap = [...snaps].reverse().find((d) => d.day <= endDay && d.day >= monthStartDay(state, m));
      const idx = state.apps?.analytics?.tickEvents?.[m];
      r.reported = snap ? snap.mrr : null;
      r.tickEnd = idx != null ? sumBy(rawEvents.slice(0, idx), (e) => e.amount) : r.end;
    }
    r.late = r.end - r.tickEnd; // same-day changes after the month-end snapshot
    r.diff = r.reported == null ? null : r.tickEnd - r.reported;
    r.reconciles = r.diff == null ? null : Math.abs(r.diff) <= (isCurrent ? tol : tol + 0.5); // snapshots round to $1
    start = r.end;
    return r;
  });
}

// Per-customer MRR at a day, from the event stream.
function customerTimelines(state) {
  const tl = {};
  for (const e of classifiedEvents(state)) (tl[e.customerId] ??= []).push(e);
  return tl;
}
const mrrAt = (events, day) => sumBy(events.filter((e) => e.day <= day), (e) => e.amount);

// Cohort retention: rows = month of first payment; column k = end of month (start + k).
// mode 'logo' → % of cohort customers still paying; 'revenue' → % of the cohort's starting MRR retained (can exceed 100%).
export function cohorts(state, mode = 'logo', maxK = 12) {
  const tl = customerTimelines(state);
  const cur = monthOf(state);
  const groups = {};
  for (const [cid, evs] of Object.entries(tl)) {
    const first = evs.find((e) => e.type === 'new');
    if (!first) continue;
    (groups[monthOf(state, first.day)] ??= []).push({ cid, evs, base: first.amount });
  }
  return Object.keys(groups).sort().map((m) => {
    const g = groups[m];
    const baseMrr = sumBy(g, (x) => x.base);
    const cells = [];
    let k = 0;
    for (let mk = m; k <= maxK; mk = nextKey(mk), k++) {
      if (mk > cur) { cells.push(null); continue; }
      const day = mk === cur ? state.day : monthEndDay(state, mk);
      if (mode === 'logo') cells.push(g.filter((x) => mrrAt(x.evs, day) > 0.001).length / g.length);
      else cells.push(baseMrr > 0 ? sumBy(g, (x) => mrrAt(x.evs, day)) / baseMrr : null);
    }
    return { month: m, size: g.length, baseMrr, cells };
  });
}
function nextKey(k) {
  let [y, mo] = k.split('-').map(Number);
  mo++; if (mo > 12) { mo = 1; y++; }
  return `${y}-${String(mo).padStart(2, '0')}`;
}

// Churn split by cancellation reason. Involuntary = card failures after all retries.
export const INVOLUNTARY = new Set(['payment_failed']);
export function churnSplit(state) {
  const st = ensureStripe(state);
  const subs = new Map(st.subscriptions.map((s) => [s.id, s]));
  const out = {};
  for (const e of classifiedEvents(state)) {
    if (e.type !== 'churn') continue;
    const m = monthOf(state, e.day);
    const r = (out[m] ??= { month: m, voluntary: 0, involuntary: 0, volCount: 0, invCount: 0, reasons: {} });
    const reason = subs.get(e.subId)?.cancelReason ?? 'unknown';
    if (INVOLUNTARY.has(reason)) { r.involuntary += -e.amount; r.invCount++; } else { r.voluntary += -e.amount; r.volCount++; }
    r.reasons[reason] = (r.reasons[reason] ?? 0) + 1;
  }
  return Object.values(out).sort((a, b) => a.month.localeCompare(b.month));
}

// Trial → paid by month the trial ended.
export function trialConversion(state) {
  const st = ensureStripe(state);
  const paid = new Set(st.events.filter((e) => e.type === 'new').map((e) => e.subId));
  const out = {};
  for (const s of st.subscriptions) {
    if (s.trialEndDay == null || s.trialEndDay > state.day || s.status === 'trialing') continue;
    const m = monthOf(state, s.trialEndDay);
    const r = (out[m] ??= { month: m, ended: 0, converted: 0 });
    r.ended++;
    if (paid.has(s.id)) r.converted++;
  }
  return Object.values(out).sort((a, b) => a.month.localeCompare(b.month)).map((r) => ({ ...r, rate: r.ended ? r.converted / r.ended : null }));
}

// ---- Acquisition spend & CAC by channel ----

const AD_CHANNELS = [[/meta|facebook|facebk|instagram/i, 'ads:meta'], [/google/i, 'ads:google'], [/tiktok/i, 'ads:tiktok'], [/apple/i, 'ads:apple'], [/linkedin/i, 'ads:linkedin'], [/reddit/i, 'ads:reddit'], [/product ?hunt/i, 'product-hunt']];
export function channelOfTxn(t) {
  const m = t.meta ?? {};
  if (m.source || m.channel) return m.source ?? m.channel;
  if (m.platform) return String(m.platform).startsWith('ads:') ? m.platform : `ads:${m.platform}`;
  const txt = `${t.counterparty ?? ''} ${t.description ?? ''}`;
  for (const [re, ch] of AD_CHANNELS) if (re.test(txt)) return ch;
  return t.category === 'advertising' ? 'advertising (unattributed)' : 'marketing (unattributed)';
}

// If the Ads app keeps per-day delivery stats, use them to split unattributed ad spend by platform.
// Shape-tolerant: looks for arrays of { day, spend, platform|channel } in state.apps.ads. Bank spend stays the
// source of truth for the total (money only moves through bank.post), so nothing is double counted.
export function adsDailySpend(state) {
  const a = state.apps?.ads;
  if (!a) return [];
  const rows = [];
  const scan = (arr, platform) => {
    if (!Array.isArray(arr)) return;
    for (const r of arr) if (r && Number.isFinite(r.spend) && Number.isFinite(r.day)) rows.push({ day: r.day, spend: r.spend, channel: normCh(r.platform ?? r.channel ?? platform) });
  };
  const normCh = (p) => (p ? (String(p).startsWith('ads:') ? p : `ads:${String(p).toLowerCase()}`) : 'ads:other');
  scan(a.daily); scan(a.stats);
  for (const c of a.campaigns ?? []) { scan(c.daily, c.platform ?? c.channel); scan(c.stats, c.platform ?? c.channel); }
  return rows;
}

export function cacByChannel(state, days = 90) {
  const from = state.day - days + 1;
  const spend = {};
  for (const t of state.bank.txns) {
    if (t.day < from || !['advertising', 'marketing'].includes(t.category) || t.amount >= 0) continue;
    const ch = channelOfTxn(t);
    spend[ch] = (spend[ch] ?? 0) - t.amount;
  }
  const un = spend['advertising (unattributed)'] ?? 0;
  const ads = adsDailySpend(state).filter((r) => r.day >= from);
  const adsTot = sumBy(ads, (r) => r.spend);
  if (un > 0 && adsTot > 0) {
    delete spend['advertising (unattributed)'];
    for (const r of ads) spend[r.channel] = (spend[r.channel] ?? 0) + (un * r.spend) / adsTot;
  }
  const newCust = {};
  for (const e of classifiedEvents(state)) if (e.type === 'new' && e.day >= from) newCust[e.source ?? 'direct'] = (newCust[e.source ?? 'direct'] ?? 0) + 1;
  const channels = [...new Set([...Object.keys(spend), ...Object.keys(newCust)])];
  const rows = channels.map((ch) => ({ channel: ch, spend: spend[ch] ?? 0, customers: newCust[ch] ?? 0, cac: newCust[ch] ? (spend[ch] ?? 0) / newCust[ch] : null }));
  const totalSpend = sumBy(rows, (r) => r.spend), totalNew = sumBy(rows, (r) => r.customers);
  return { rows: rows.sort((a, b) => b.spend - a.spend || b.customers - a.customers), totalSpend, totalNew, blended: totalNew ? totalSpend / totalNew : null, days };
}

// ---- Headline unit economics ----

// grossMargin: pass in from the Books accrual P&L (trailing) so the number ties to the ledger.
export function unitEconomics(state, { grossMargin = null } = {}) {
  const st = ensureStripe(state);
  const moves = mrrMovements(state);
  const live = activeSubs(state);
  const customers = new Set(live.map((s) => s.customerId)).size;
  const m = mrr(state);
  const arpa = customers ? m / customers : null;
  const complete = moves.filter((r) => r.month < monthOf(state));
  const last3 = complete.slice(-3).filter((r) => r.start > 0);
  const revChurn = last3.length ? sumBy(last3, (r) => -(r.churn + r.contraction) / r.start) / last3.length : null;
  const logoChurn = last3.length ? sumBy(last3, (r) => r.churnCount / Math.max(1, r.startCustomers)) / last3.length : null;
  const gm = grossMargin ?? 0.8;
  const lifetime = revChurn && revChurn > 0 ? Math.min(60, 1 / revChurn) : 60; // cap at 5 years (research §5.2)
  const ltv = arpa != null ? arpa * gm * lifetime : null;
  const cac = cacByChannel(state);
  const payback = cac.blended != null && arpa ? cac.blended / (arpa * gm) : null;
  const recent = moves.slice(-3);
  const gained = sumBy(recent, (r) => r.new + r.expansion + r.reactivation);
  const lost = -sumBy(recent, (r) => r.churn + r.contraction);
  const quickRatio = lost > 0 ? gained / lost : null;
  const { nrr, grr, baseMonths } = retention(state);
  // Burn multiple: net burn ÷ net new ARR over the last 3 months (Sacks, 2020).
  const burn = trailingBurn(state, 3);
  const netNewMrr3 = sumBy(complete.slice(-3), (r) => r.net) / Math.max(1, complete.slice(-3).length);
  const burnMultiple = burn.burn > 0 && netNewMrr3 > 0 ? burn.burn / (netNewMrr3 * 12) : null;
  const cash = totalCash(state);
  return {
    mrr: m, arr: m * 12, customers, arpa, revChurn, logoChurn, grossMargin: grossMargin, ltv, lifetime,
    cac: cac.blended, payback, quickRatio, nrr, grr, retentionMonths: baseMonths,
    burn: burn.burn, burnMultiple, netNewMrr: netNewMrr3, runway: burn.burn > 0 ? cash / burn.burn : Infinity, cash,
    failedRecovery: recoveryStats(state).rate,
  };
}

// NRR / GRR over the trailing 12 months (or as many months as exist): MRR now from customers who were paying
// at the base date ÷ their MRR then. GRR caps each customer at their base MRR (no expansion credit).
export function retention(state, months = 12) {
  const tl = customerTimelines(state);
  const cur = monthOf(state);
  let base = cur;
  let n = 0;
  while (n < months && prevMonthKey(base) >= monthOf(state, 0)) { base = prevMonthKey(base); n++; }
  if (n === 0) return { nrr: null, grr: null, baseMonths: 0 };
  const baseDay = monthEndDay(state, base);
  let b = 0, now = 0, kept = 0;
  for (const evs of Object.values(tl)) {
    const then = mrrAt(evs, baseDay);
    if (then <= 0.001) continue;
    const curv = mrrAt(evs, state.day);
    b += then; now += curv; kept += Math.min(then, curv);
  }
  return { nrr: b ? now / b : null, grr: b ? kept / b : null, baseMonths: n };
}

// Failed payment recovery (Stripe "Revenue recovery"): invoices that failed at least once.
export function recoveryStats(state) {
  const st = ensureStripe(state);
  const failedInv = new Set(st.charges.filter((c) => c.status === 'failed').map((c) => c.invoiceId));
  const inv = st.invoices.filter((i) => failedInv.has(i.id));
  const recovered = inv.filter((i) => i.status === 'paid');
  const lost = inv.filter((i) => i.status === 'uncollectible');
  const open = inv.filter((i) => i.status === 'open');
  const decided = recovered.length + lost.length;
  return { failed: inv.length, recovered: recovered.length, lost: lost.length, open: open.length, recoveredAmount: sumBy(recovered, (i) => i.amount), lostAmount: sumBy(lost, (i) => i.amount), atRisk: sumBy(open, (i) => i.amount), rate: decided ? recovered.length / decided : null };
}

// Dispute rate over the last 90 days: disputes opened ÷ successful charges (Stripe measures similarly).
export function disputeRate(state, days = 90) {
  const st = ensureStripe(state);
  const from = state.day - days;
  const charges = st.charges.filter((c) => c.day > from && c.status !== 'failed').length;
  const disputes = st.disputes.filter((d) => d.status !== 'scheduled' && d.day > from).length;
  return { charges, disputes, rate: charges ? disputes / charges : 0 };
}

// ---- Weekly dashboard flags (research §5.5 and benchmarks in §5.2 / §7) ----

const INVOL_MAX = { b2c: 0.03, smb: 0.02, ent: 0.008 }; // Chargehive upper bounds, monthly MRR (vendor)
export function weeklyFlags(state, ue, extra = {}) {
  const f = [];
  const flag = (level, title, detail, source) => f.push({ level, title, detail, source });
  if (ue.runway !== Infinity && ue.runway < 6) flag('bad', `Runway ${ue.runway.toFixed(1)} months`, 'Under 6 months: raise, cut, or get to profitability now. Fundraises take 3–6 months.', 'Common guidance; Graham "Default alive" (2015)');
  else if (ue.runway !== Infinity && ue.runway < 12) flag('warn', `Runway ${ue.runway.toFixed(1)} months`, 'Under 12 months. Know your default-alive date.', 'Graham, "Default Alive or Default Dead?" (2015)');
  const moves = mrrMovements(state);
  const last = moves.filter((r) => r.month < monthOf(state)).at(-1);
  const split = churnSplit(state).find((r) => r.month === last?.month);
  if (last && last.start > 0 && split) {
    const inv = split.involuntary / last.start;
    const max = INVOL_MAX[state.company.model];
    if (inv > max) flag('bad', `Involuntary churn ${(inv * 100).toFixed(1)}% of MRR in ${last.month}`, `Above the ${(max * 100).toFixed(1)}% upper benchmark for your segment. Turn on Smart Retries and dunning emails; send pre-expiry reminders.`, 'Chargehive (vendor, 2025–2026)');
  }
  if (ue.failedRecovery != null && ue.failedRecovery < 0.4) flag('warn', `Failed-payment recovery ${(ue.failedRecovery * 100).toFixed(0)}%`, 'Stripe reports 55% average recovery across all tools; Smart Retries alone 25–40%.', 'stripe.com/billing (2026); vendor blogs');
  if (ue.payback != null && ue.payback > 12) flag(ue.payback > 24 ? 'bad' : 'warn', `CAC payback ${ue.payback.toFixed(1)} months`, 'Under 12 months is good for SMB SaaS. Cut the worst channel or raise price.', 'Research §5.2');
  if (ue.quickRatio != null && ue.quickRatio < 1) flag('bad', `Quick ratio ${ue.quickRatio.toFixed(2)}`, 'You are losing MRR faster than you add it.', 'Mamoon Hamid, Social Capital (2015): >4 is strong');
  else if (ue.quickRatio != null && ue.quickRatio < 4) flag('warn', `Quick ratio ${ue.quickRatio.toFixed(2)}`, 'Above 4 is strong growth efficiency; below means leaky growth.', 'Mamoon Hamid (2015)');
  if (ue.grr != null && ue.retentionMonths >= 3 && ue.grr < 0.84) flag('warn', `GRR ${(ue.grr * 100).toFixed(0)}% (${ue.retentionMonths} mo)`, 'Below the ~84% private-SaaS median (annualized benchmark; short windows are noisier).', 'Benchmarkit CY2025 (secondary)');
  if (ue.grossMargin != null && ue.grossMargin < 0.5) flag('bad', `Gross margin ${(ue.grossMargin * 100).toFixed(0)}%`, 'Below even AI-native norms (45–55%). Check inference cost per user, routing and pricing.', 'ICONIQ State of AI 2026; Bessemer');
  else if (ue.grossMargin != null && ue.grossMargin < 0.75) flag('warn', `Gross margin ${(ue.grossMargin * 100).toFixed(0)}%`, 'Below traditional SaaS (75–85%). Fine for AI-heavy products if it is improving.', 'Research §5.2');
  if (ue.burnMultiple != null && ue.burnMultiple > 2) flag(ue.burnMultiple > 3 ? 'bad' : 'warn', `Burn multiple ${ue.burnMultiple.toFixed(1)}×`, 'Sacks: <1 amazing, 1–1.5 great, 1.5–2 good, 2–3 suspect, >3 bad.', 'David Sacks, "The Burn Multiple" (2020)');
  const dr = disputeRate(state);
  if (dr.charges >= 20 && dr.rate >= PAYMENTS.excessiveDisputeRate) flag('bad', `Dispute rate ${(dr.rate * 100).toFixed(2)}%`, 'Stripe treats >0.75% as excessive; Visa VAMP excessive is 1.5% from April 2026.', 'docs.stripe.com/disputes/measuring');
  else if (dr.charges >= 20 && dr.rate >= 0.005) flag('warn', `Dispute rate ${(dr.rate * 100).toFixed(2)}%`, 'Approaching Stripe\'s 0.75% threshold. Send trial-ending reminders and use a recognizable statement descriptor.', 'docs.stripe.com/disputes/measuring');
  const tc = trialConversion(state).at(-1);
  const base = MARKET[state.company.model]?.trialToPaid;
  if (tc && tc.ended >= 10 && base) {
    const ref = Object.values(base).at(-1) * (state.company.model === 'smb' && state.market?.cardRequired ? MARKET.smb.cardTrialFactor : 1);
    if (tc.rate < ref * 0.6) flag('warn', `Trial conversion ${(tc.rate * 100).toFixed(0)}% (${tc.month})`, `Well below the ~${(ref * 100).toFixed(0)}% benchmark for your model and trial setup.`, 'RevenueCat 2026 / B2B trial benchmarks (params.js)');
  }
  if (extra.inferenceShare != null && extra.inferenceShare > 0.3) flag('warn', `AI inference ${(extra.inferenceShare * 100).toFixed(0)}% of revenue`, 'ICONIQ finds ~23% average at scaling AI B2B companies; above 30% squeezes margin.', 'ICONIQ (Jan 2026, secondary)');
  if (extra.unreviewed > 25) flag('warn', `${extra.unreviewed} unreviewed transactions`, 'Your books (and gross margin) are only as good as your categorization.', 'Research §3.4');
  if (extra.unclosed > 1) flag('warn', `${extra.unclosed} months not closed`, 'Close within 5–10 business days of month-end.', 'Research §3.4');
  return f;
}

export { FINANCING, monthlyAmount };
