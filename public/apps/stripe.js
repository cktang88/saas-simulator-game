// Payments: a Stripe Dashboard clone over core/stripe.js. Home (volume, MRR, balance, payouts, failed payments),
// Payments, Customers (+ detail), Subscriptions (cancel / change price & quantity → MRR events), Invoices,
// Products & prices (grandfathering + an explicit, noticed migration), Billing settings (Smart Retries, dunning
// emails, merchant of record, Stripe Tax), Disputes (write evidence → judged → respondToDispute), Payouts, and
// Revenue recovery, Invoices with an accounts-receivable view (net-30 enterprise invoices, reminders), payout
// schedule / manual / Instant Payouts, and a balance reconciliation status line (core stripeReconciliation).
// Fees and thresholds: docs/research/finance-and-payments.md §1.

import { html, mount, on, modal, formData, stat, badge, barChart } from '../core/ui.js';
import { money, fmtDate, pct, clamp, words, round2, chance, rng, uid } from '../core/util.js';
import { ensure, notify } from '../core/state.js';
import { ensureRisk, RISK, disputeWindow, vampThreshold } from '../core/stripe.js';
import { recordClaims, penalize } from '../core/integrity.js';
import { isActivated } from './lifecycle/model.js';
import { hash } from '../core/util.js';
import { MOR_PROVIDERS, BILLING_PLATFORMS } from './money/vendors.js';
import { setBillingPlatform } from './money/backoffice.js';
import { morFee, billingPctFor } from '../core/stripe.js';
import { ensureDunning, dunningStepQuality, DUNNING, declineClass, ensureStripe, mrr, activeSubs, trialingSubs, monthlyAmount, cancel, changePrice, respondToDispute, customerById, subscriptionById, stripeReconciliation, openInvoices, accountsReceivable, sendInvoiceReminder, instantPayout, manualPayout } from '../core/stripe.js';
import { ensureMarket, setModifier } from '../core/market.js';
import { PAYMENTS } from '../core/params.js';
import { REALISM, averageField } from '../core/llm.js';
import { newThread, addMessage } from '../core/mail.js';
import { customerRegion, sumBy } from './money/common.js';
import { recoveryStats, disputeRate, classifiedEvents } from './money/metrics.js';
import { ensureBooks, syncLedger, ledgerByMonth, stripeRecon, stripeEnding, allMonths } from './money/ledger.js';
import { monthLabel } from './money/common.js';
import { partialRefund, prorationAmount, chargeProration, createCoupon, applyCoupon, expireCoupons, setListPrice } from './money/payments.js';
import { EVIDENCE_SCHEMA, EVIDENCE_SYSTEM, MIN_EVIDENCE_WORDS, evidenceHeuristic, evidencePrompt, NOTICE_SCHEMA, noticeHeuristic, migrationChurnMultiplier } from './money/judge.js';
import { EVIDENCE_QUALITY, contradictsRecords, evidenceQuality, evidenceRubric, DUNNING_SCHEMA, dunningRubric, dunningFallback, dunningScores, noticeRubric, noticeRisk } from './money/rubric.js';
import { appCss, usd, short, statusBadge, tabs } from './money/ui.js';
import { cancelFlowPanel, wireCancelFlow } from './retention/ui.js';
import { ensureChurn } from '../core/churn.js';
import { recordPublicEvent } from '../core/network.js';
import { registerOperatorReader, tierFromScore, unknownRead } from '../core/operator.js';
import { bizBlock } from './context.js';
import { usageProxy } from './success/model.js';
import { NOTICE_CRITERIA } from './money/rubric.js';
import { EVIDENCE_CRITERIA } from './money/rubric.js';

const ID = 'stripe';
// Notice period for raising prices on existing subscribers. Most ToS and US state auto-renewal laws (e.g.
// California's) require clear advance notice of a material change; 30 days is the common standard. [design]
const MIN_NOTICE_DAYS = 30;
const CHURN_WINDOW_DAYS = 60; // migration churn spike lasts ~2 renewal cycles [design]
// Trial-ending reminder emails: auto-converting trials without a reminder are the main B2C dispute driver
// (research §1.3). With reminders: half the first-charge disputes, ~5% fewer trial conversions (relative). [design]
const TRIAL_REMINDER = { disputeCut: 0.5, conversion: 0.95 };
// Moving to/from a merchant of record: re-checkout or card-data migration over ~3 weeks; 5–10% of subscribers
// don't make it across [design, review M17]. MoRs pay out monthly or twice monthly (research §2.2).
const MOR_MIGRATION = { days: 21, loss: [0.05, 0.1] }; // legacy default; per-provider values in money/vendors.js MOR_PROVIDERS
const morOf = (st) => MOR_PROVIDERS[st.settings.morProvider ?? 'paddle'] ?? MOR_PROVIDERS.paddle;
const billingOf = (st) => BILLING_PLATFORMS[st.settings.billingPlatform ?? 'stripe_billing'] ?? BILLING_PLATFORMS.stripe_billing;
// Adaptive Pricing (local-currency prices for international customers): Stripe reports higher cross-border
// checkout conversion; the game uses +5% relative for international buyers [design, Stripe vendor claim]. The
// cost is core's +1% FX on those payments.
const ADAPTIVE_LIFT = 0.05;
const PAYOUT_SCHEDULES = [['daily', 'Daily (every business day)'], ['weekly', 'Weekly (Mondays)'], ['monthly', 'Monthly (1st)'], ['manual', 'Manual']];

const ensureApp = (state) => {
  const a = ensure(state, 'stripe', () => ({ migrations: [], nudged: {} }));
  a.coupons ??= []; a.dSeen ??= {}; a.retention ??= { enabled: false, pctOff: 25, months: 3 };
  return a;
};
const ui = { cq: '', subStatus: 'all', payStatus: 'all', drafts: {}, notice: '' };
const cust = (s, id) => customerById(s, id);
const planName = (s, id) => s.plans.find((p) => p.id === id)?.name ?? id;
const card = (c) => (c ? `${c.card.brand === 'visa' ? 'Visa' : 'Mastercard'} •••• ${c.card.last4}` : '—');
const flag = (country) => country.replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
const isLive = (sub) => sub.status === 'active' || sub.status === 'past_due';
const inTransit = (st) => sumBy(st.payouts.filter((p) => p.status === 'in_transit'), (p) => p.amount);

function vol(s, days) {
  const st = ensureStripe(s);
  const from = s.day - days;
  const ch = st.charges.filter((c) => c.day > from && c.status !== 'failed');
  const gross = sumBy(ch, (c) => c.amount);
  const fees = sumBy(ch, (c) => c.fee);
  const refunds = sumBy(st.refunds.filter((r) => r.day > from), (r) => r.amount);
  const disputes = sumBy(st.disputes.filter((d) => d.status !== 'scheduled' && d.day > from), (d) => d.amount + PAYMENTS.disputeFee);
  const failed = st.charges.filter((c) => c.day > from && c.status === 'failed');
  return { gross, fees, refunds, disputes, net: gross - fees - refunds - disputes, count: ch.length, failed: failed.length, failedAmt: sumBy(failed, (c) => c.amount) };
}

// ---------- views ----------

function home(s) {
  const st = ensureStripe(s);
  const v = vol(s, 30);
  const newCust = classifiedEvents(s).filter((e) => e.type === 'new' && e.day > s.day - 30).length;
  const pending = sumBy(st.pending, (p) => p.amount);
  const upcoming = {};
  for (const p of st.pending) upcoming[p.availableDay] = (upcoming[p.availableDay] ?? 0) + p.amount;
  const dr = disputeRate(s);
  const rec = recoveryStats(s);
  const needs = st.disputes.filter((d) => d.status === 'needs_response');
  const ar = accountsReceivable(s);
  const overdue = openInvoices(s).filter((i) => i.dueDay < s.day);
  return html`
    ${reconLine(s)}
    ${needs.length ? html`<div class="callout bad"><b>${needs.length} dispute${needs.length > 1 ? 's' : ''} need a response.</b> ${needs.map((d) => html`<a href="#/stripe/disputes/${d.id}">${usd(d.amount)} due ${short(s, d.dueDay)}</a> `)}</div>` : ''}
    ${dr.charges >= 20 && dr.rate >= PAYMENTS.excessiveDisputeRate ? html`<div class="callout bad">Dispute rate ${pct(dr.rate, 2)} is above Stripe's 0.75% excessive threshold. Expect reserves or account review.</div>` : ''}
    ${riskCallout(s)}
    <div class="${ID}-kpis">
      ${stat('Gross volume (30d)', usd(v.gross), `${v.count} payments`)}
      ${stat('Net volume (30d)', usd(v.net), `after ${usd(v.fees)} fees, ${usd(v.refunds)} refunds, ${usd(v.disputes)} disputes`)}
      ${stat('MRR', usd(mrr(s)), `${activeSubs(s).length} subscribers · ${trialingSubs(s).length} trialing`)}
      ${stat('New customers (30d)', newCust)}
      ${stat('Failed payments (30d)', v.failed, `${usd(v.failedAmt)} · recovery ${rec.rate == null ? '—' : pct(rec.rate, 0)}`, v.failed ? 'warn' : '')}
      ${stat('Dispute rate (90d)', pct(dr.rate, 2), `${dr.disputes} of ${dr.charges} charges · limit 0.75%`, dr.rate >= 0.0075 && dr.charges >= 20 ? 'bad' : '')}
      ${ar > 0 ? stat('Open invoices (AR)', usd(ar), `${overdue.length} overdue · ${usd(sumBy(overdue, (i) => i.amount))}`, overdue.length ? 'warn' : '') : ''}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Gross volume · last 30 days</h2><canvas id="volChart" style="width:100%"></canvas></section>
      <section class="panel"><h2>Balance</h2>
        <div class="${ID}-row"><span>Incoming (pending)</span><span>${usd(pending)}</span></div>
        <div class="${ID}-row"><span>Available</span><span>${usd(st.available)}</span></div>
        <div class="${ID}-row"><span>In transit to Mercury</span><span>${usd(inTransit(st))}</span></div>
        <h3>Upcoming payouts</h3>
        ${Object.keys(upcoming).length ? Object.entries(upcoming).sort((a, b) => a[0] - b[0]).slice(0, 6).map(([d, a]) => html`<div class="${ID}-row"><span>Available ${short(s, +d)} → est. arrival ${short(s, +d + 1)}</span><span>${usd(a)}</span></div>`) : html`<p class="muted small">Nothing pending.</p>`}
        <p class="small muted">Funds settle T+2 business days; new accounts wait 7–14 days for the first payout (research §1.2). Payout schedule: ${payoutScheduleLabel(st)} (<a href="#/stripe/payouts">change</a>).</p>
      </section>
    </div>`;
}

const payoutScheduleLabel = (st) => (st.settings.merchantOfRecord ? `merchant of record, ${(st.settings.morPayoutSchedule ?? 'semimonthly') === 'monthly' ? 'monthly' : 'twice monthly'}` : PAYOUT_SCHEDULES.find(([k]) => k === (st.settings.payoutSchedule ?? 'daily'))?.[1] ?? st.settings.payoutSchedule);

// Balance reconciliation (core): every movement of the Stripe balance is counted; opening + flows must equal
// pending + available + in transit, and tracked payouts must equal the Stripe lines in the bank.
function reconLine(s) {
  const r = stripeReconciliation(s);
  const ok = r.ok && r.payoutsOk;
  return html`<p class="small ${ok ? 'muted' : 'neg'}" style="margin:0 0 8px">${ok ? '✓' : '⚠'} Balance reconciliation: ${ok ? `ties. Expected balance ${usd(r.expected)} = pending + available + in transit; payouts ${usd(r.payoutsTracked)} match the bank.` : `off by ${usd(r.diff)} (expected ${usd(r.expected)}, actual ${usd(r.actual)}); payouts tracked ${usd(r.payoutsTracked)} vs bank ${usd(r.bankPayouts)}.`}</p>`;
}

function chargeRows(s, charges) {
  if (!charges.length) return html`<p class="empty">No payments.</p>`;
  return html`<div class="table-wrap"><table><thead><tr><th class="r">Amount</th><th>Status</th><th>Customer</th><th>Payment method</th><th>Date</th><th class="r">Fee</th><th class="r">Net</th><th>Decline code</th></tr></thead><tbody>
    ${charges.map((c) => { const cu = cust(s, c.customerId); const reg = customerRegion(cu); return html`<tr class="clickable" data-charge="${c.id}">
      <td class="r ${ID}-amt"><b>${usd(c.amount)}</b> <span class="muted small">USD</span></td><td>${statusBadge(c.status)}</td>
      <td>${cu?.name ?? c.customerId}<div class="${ID}-sub">${cu?.email ?? ''}</div></td>
      <td class="small">${c.method === 'ach_invoice' ? 'ACH (invoice)' : card(cu)} ${flag(reg.country)}</td>
      <td class="small">${fmtDate(s, c.day)}</td><td class="r small">${c.fee ? usd(c.fee) : '—'}</td><td class="r small">${c.status === 'failed' ? '—' : usd(c.amount - c.fee)}</td>
      <td class="small">${c.failureCode ?? ''}</td></tr>`; })}</tbody></table></div>`;
}

function payments(s) {
  const st = ensureStripe(s);
  const list = st.charges.filter((c) => ui.payStatus === 'all' || c.status === ui.payStatus).slice().reverse().slice(0, 300);
  const counts = (k) => st.charges.filter((c) => c.status === k).length;
  return html`<section class="panel">
    <div class="app-actions" style="margin-bottom:8px">${['all', 'succeeded', 'refunded', 'disputed', 'failed'].map((k) => html`<button class="sm ${ui.payStatus === k ? 'primary' : ''}" data-paystatus="${k}">${k}${k !== 'all' ? ` (${counts(k)})` : ''}</button>`)}</div>
    ${chargeRows(s, list)}
    <p class="small muted">Detail kept for the last 120 days; older months are summarized in reports. Refunds don't return Stripe's fee (research §1.1).</p></section>`;
}

function customers(s, id) {
  const st = ensureStripe(s);
  if (id) return customerDetail(s, cust(s, id));
  const q = ui.cq.toLowerCase();
  const subsBy = {};
  for (const x of st.subscriptions) (subsBy[x.customerId] ??= []).push(x);
  const rows = st.customers.filter((c) => !q || `${c.name} ${c.email} ${c.company ?? ''}`.toLowerCase().includes(q)).slice().reverse().slice(0, 300);
  return html`<section class="panel">
    <label>Search customers <input id="cq" value="${ui.cq}" placeholder="Name, email or company" /></label>
    <div class="table-wrap"><table><thead><tr><th>Customer</th><th>Country</th><th>Payment method</th><th>Status</th><th class="r">MRR</th><th>Created</th><th>Source</th></tr></thead><tbody>
    ${rows.map((c) => { const subs = subsBy[c.id] ?? []; const live = subs.filter(isLive); const m = sumBy(live, monthlyAmount); const status = live.length ? live[0].status : subs.some((x) => x.status === 'trialing') ? 'trialing' : subs.length ? 'canceled' : 'none'; const reg = customerRegion(c);
      return html`<tr class="clickable" data-cust="${c.id}"><td>${c.name}<div class="${ID}-sub">${c.email}${c.company ? ` · ${c.company}` : ''}</div></td><td>${flag(reg.country)} ${reg.country}${reg.state && reg.state !== 'OTHER' ? `-${reg.state}` : ''}</td><td class="small">${card(c)}</td><td>${statusBadge(status)}</td><td class="r">${m ? usd(m) : '—'}</td><td class="small">${fmtDate(s, c.createdDay)}</td><td class="small">${c.source}</td></tr>`; })}
    </tbody></table></div>${rows.length ? '' : html`<p class="empty">No customers yet.</p>`}</section>`;
}

function customerDetail(s, c) {
  if (!c) return html`<p class="empty">Customer not found.</p>`;
  const st = ensureStripe(s);
  const subs = st.subscriptions.filter((x) => x.customerId === c.id);
  const inv = st.invoices.filter((i) => i.customerId === c.id).slice().reverse();
  const ch = st.charges.filter((x) => x.customerId === c.id).slice().reverse();
  const reg = customerRegion(c);
  const ltv = sumBy(ch.filter((x) => x.status === 'succeeded'), (x) => x.amount);
  return html`<p><a href="#/stripe/customers">← Customers</a></p>
    <div class="grid-2">
      <section class="panel"><h2>${c.name}</h2>
        <div class="${ID}-row"><span>Email</span><span>${c.email}</span></div>
        ${c.company ? html`<div class="${ID}-row"><span>Company</span><span>${c.company}</span></div>` : ''}
        <div class="${ID}-row"><span>Country</span><span>${flag(reg.country)} ${reg.country}${reg.state && reg.state !== 'OTHER' ? ` (${reg.state})` : ''}</span></div>
        <div class="${ID}-row"><span>Customer since</span><span>${fmtDate(s, c.createdDay)}</span></div>
        <div class="${ID}-row"><span>Acquisition source</span><span>${c.source}</span></div>
        <div class="${ID}-row"><span>Total spent</span><span>${usd(ltv)}</span></div>
        <div class="${ID}-row"><span>ID</span><span class="small muted">${c.id}</span></div></section>
      <section class="panel"><h2>Payment method</h2>
        <div class="${ID}-row"><span>${card(c)}</span><span>${c.card.expiresDay < s.day ? badge('Expired', 'bad') : badge(`Expires ${fmtDate(s, c.card.expiresDay).replace(/^\w+ \d+, /, '')}`, '')}</span></div>
        <p class="small muted">The card account updater (included with Stripe) fetches new card numbers for many expired cards on retry.</p></section>
    </div>
    <section class="panel"><h2>Subscriptions</h2>${subTable(s, subs)}</section>
    <section class="panel"><h2>Invoices</h2>${invTable(s, inv)}</section>
    <section class="panel"><h2>Payments</h2>${chargeRows(s, ch)}</section>`;
}

function subTable(s, subs) {
  if (!subs.length) return html`<p class="empty">No subscriptions.</p>`;
  return html`<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th class="r">Price</th><th class="r">Qty</th><th class="r">MRR</th><th>Started</th><th>Renews / ends</th><th>Source</th><th></th></tr></thead><tbody>
    ${subs.map((x) => { const c = cust(s, x.customerId); return html`<tr>
      <td><a href="#/stripe/customers/${x.customerId}">${c?.name ?? x.customerId}</a></td>
      <td>${planName(s, x.planId)}</td>
      <td>${statusBadge(x.status)}${x.cancelAtPeriodEnd ? html` ${badge('cancels at period end', 'warn')}` : ''}${x.status === 'canceled' ? html`<div class="${ID}-sub">${String(x.cancelReason ?? '').replace(/_/g, ' ')} · ${short(s, x.canceledDay)}</div>` : ''}${x.status === 'past_due' && x.retry ? html`<div class="${ID}-sub">retry ${x.retry.attempts + 1} on ${short(s, x.retry.nextDay)}</div>` : ''}</td>
      <td class="r">${usd(x.price)}/${x.interval === 'year' ? 'yr' : 'mo'}</td><td class="r">${x.quantity ?? 1}</td>
      <td class="r">${isLive(x) ? usd(monthlyAmount(x)) : '—'}</td>
      <td class="small">${fmtDate(s, x.startDay)}</td>
      <td class="small">${x.status === 'trialing' ? `trial ends ${short(s, x.trialEndDay)}` : x.status === 'canceled' ? '—' : short(s, x.currentPeriodEnd)}</td>
      <td class="small">${x.source}</td>
      <td style="white-space:nowrap">${x.status !== 'canceled' ? html`<button class="sm" data-upd="${x.id}">Update</button> <button class="sm danger" data-cxl="${x.id}">Cancel</button>` : ''}</td></tr>`; })}
    </tbody></table></div>`;
}

function subscriptions(s) {
  const st = ensureStripe(s);
  const f = ui.subStatus;
  const list = st.subscriptions.filter((x) => f === 'all' || (f === 'scheduled' ? x.cancelAtPeriodEnd && x.status !== 'canceled' : x.status === f)).slice().reverse().slice(0, 300);
  const count = (k) => st.subscriptions.filter((x) => (k === 'scheduled' ? x.cancelAtPeriodEnd && x.status !== 'canceled' : x.status === k)).length;
  const reasons = {};
  for (const x of st.subscriptions.filter((y) => y.status === 'canceled')) reasons[x.cancelReason] = (reasons[x.cancelReason] ?? 0) + 1;
  return html`<section class="panel">
    <div class="app-actions" style="margin-bottom:8px">${[['all', 'All'], ['active', 'Active'], ['trialing', 'Trialing'], ['past_due', 'Past due'], ['scheduled', 'Cancels at period end'], ['canceled', 'Canceled']].map(([k, l]) => html`<button class="sm ${f === k ? 'primary' : ''}" data-substatus="${k}">${l}${k !== 'all' ? ` (${count(k)})` : ''}</button>`)}</div>
    ${f === 'canceled' && Object.keys(reasons).length ? html`<p class="small muted">Cancellation reasons: ${Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${String(r).replace(/_/g, ' ')} ${n}`).join(' · ')}</p>` : ''}
    ${subTable(s, list)}</section>`;
}

function invTable(s, inv) {
  if (!inv.length) return html`<p class="empty">No invoices.</p>`;
  return html`<div class="table-wrap"><table><thead><tr><th class="r">Amount</th><th>Status</th><th>Customer</th><th>Number</th><th>Collection</th><th>Created</th><th>Due / paid</th><th class="r">Attempts</th></tr></thead><tbody>
    ${inv.map((i) => html`<tr><td class="r"><b>${usd(i.amount)}</b></td><td>${statusBadge(i.status)}</td><td>${cust(s, i.customerId)?.name ?? ''}</td><td class="small muted">${i.id.slice(-10).toUpperCase()}${i.pay ? html`<div class="${ID}-sub">Typical for this buyer: ~${i.pay.typical} days to pay, slow ones ${i.pay.p90}+${i.pay.factors.length ? ` (${i.pay.factors.map((f) => f.label).join(', ')})` : ''}</div>` : ''}</td>
      <td class="small">${i.method === 'ach_invoice' ? 'Send invoice (net 30, ACH)' : 'Charge card automatically'}</td><td class="small">${fmtDate(s, i.issuedDay ?? i.day)}</td>
      <td class="small">${i.paidDay != null ? `paid ${short(s, i.paidDay)}` : i.dueDay != null ? `due ${short(s, i.dueDay)}` : '—'}</td><td class="r">${i.attempts}</td></tr>`)}</tbody></table></div>`;
}

const AGING = [['Not yet due', -Infinity, 0], ['1–30 days', 1, 30], ['31–60 days', 31, 60], ['61–90 days', 61, 90], ['90+ days', 91, Infinity]];

// Accounts receivable: open net-30 invoices (enterprise customers pay by ACH / bank transfer, often late).
function invoices(s) {
  const st = ensureStripe(s);
  const open = openInvoices(s).slice().sort((a, b) => a.dueDay - b.dueDay);
  const late = (i) => s.day - i.dueDay;
  const buckets = AGING.map(([label, lo, hi]) => { const xs = open.filter((i) => late(i) >= lo && late(i) <= hi); return { label, n: xs.length, amt: sumBy(xs, (i) => i.amount) }; });
  const writtenOff = st.invoices.filter((i) => i.status === 'uncollectible' && i.method === 'ach_invoice');
  const paid = st.invoices.filter((i) => i.method === 'ach_invoice' && i.paidDay != null);
  const avgDays = paid.length ? sumBy(paid, (i) => i.paidDay - (i.issuedDay ?? i.day)) / paid.length : null;
  return html`
    ${open.length || writtenOff.length || paid.length ? html`<div class="${ID}-kpis">
      ${stat('Accounts receivable', usd(accountsReceivable(s)), `${open.length} open invoice${open.length === 1 ? '' : 's'}`)}
      ${buckets.map((b, k) => stat(b.label + (k ? ' overdue' : ''), usd(b.amt), `${b.n} invoice${b.n === 1 ? '' : 's'}`, k >= 3 && b.n ? 'bad' : k >= 1 && b.n ? 'warn' : ''))}
      ${stat('Days to pay (120d)', avgDays == null ? '—' : `${Math.round(avgDays)} days`, 'issued → paid')}
      ${stat('Written off (120d)', usd(sumBy(writtenOff, (i) => i.amount)), `${writtenOff.length} invoice${writtenOff.length === 1 ? '' : 's'} · 120+ days overdue`, writtenOff.length ? 'bad' : '')}
    </div>` : ''}
    <section class="panel"><h2>Open invoices</h2>
      ${open.length ? html`<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Number</th><th class="r">Amount</th><th>Issued</th><th>Due</th><th>Status</th><th class="r">Reminders</th><th></th></tr></thead><tbody>
        ${open.map((i) => { const d = late(i); return html`<tr><td><a href="#/stripe/customers/${i.customerId}">${cust(s, i.customerId)?.name ?? i.customerId}</a>${cust(s, i.customerId)?.company ? html`<div class="${ID}-sub">${cust(s, i.customerId).company}</div>` : ''}</td>
          <td class="small muted">${i.id.slice(-10).toUpperCase()}${i.pay ? html`<div class="${ID}-sub">Typical for this buyer: ~${i.pay.typical} days to pay, slow ones ${i.pay.p90}+${i.pay.factors.length ? ` (${i.pay.factors.map((f) => f.label).join(', ')})` : ''}</div>` : ''}</td><td class="r"><b>${usd(i.amount)}</b></td><td class="small">${fmtDate(s, i.issuedDay ?? i.day)}</td><td class="small">${fmtDate(s, i.dueDay)}</td>
          <td>${d > 0 ? badge(`${d} days overdue`, d > 60 ? 'bad' : 'warn') : badge(d === 0 ? 'due today' : `due in ${-d} days`, '')}</td><td class="r">${i.reminders ?? 0}</td>
          <td><button class="sm" data-remind="${i.id}">Send reminder (6 min)</button></td></tr>`; })}</tbody></table></div>` : html`<p class="empty">No open invoices.</p>`}
      <p class="small muted">Enterprise customers pay invoices by ACH or wire on net-30 terms, usually late: on net-30 the median pays ~10 days after the due date and the slowest 10% take 45+ days. Who the buyer is matters: federal agencies pay inside 30 days (Prompt Payment Act), hospitals, universities and big-company AP run weeks late, and an invoice from a vendor whose W-9 / supplier-portal setup is unfinished sits in AP. About 1% never pay and are written off at 120 days past due (bad debt in Books). A polite reminder with the invoice link attached gets slow payers moving (the first one does most of the work; a second in the same week does nothing). ACH Direct Debit costs 0.8% capped at $5, plus Billing 0.7% (or Invoicing 0.4%) — far below card fees on large invoices (research §1.1).</p>
    </section>
    <section class="panel"><h2>All invoices</h2>${invTable(s, st.invoices.slice().reverse().slice(0, 300))}</section>`;
}

function products(s) {
  const st = ensureStripe(s);
  const m = ensureMarket(s);
  const app = ensureApp(s);
  return html`
    <section class="panel">
      <h2>Products & prices</h2>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th class="r">Price</th><th>Interval</th><th class="r">Trial</th><th>Status</th><th>Subscribers</th><th></th></tr></thead><tbody>
      ${s.plans.map((p) => { const subs = st.subscriptions.filter((x) => x.planId === p.id && (isLive(x) || x.status === 'trialing')); const old = subs.filter((x) => !x.coupon && Math.abs(x.price - p.price) > 0.001); const mig = app.migrations.find((x) => x.planId === p.id && x.status === 'scheduled');
        return html`<tr><td><b>${p.name}</b><div class="${ID}-sub">${p.id}</div></td><td class="r">${usd(p.price)}</td><td>${p.interval === 'year' ? 'Yearly' : 'Monthly'}</td><td class="r">${p.trialDays ? `${p.trialDays} days` : 'none'}</td>
          <td>${p.active ? badge('Active', 'good') : badge('Archived', '')}</td>
          <td>${subs.length}${old.length ? html`<div class="${ID}-sub">${old.length} grandfathered on ${[...new Set(old.map((x) => usd(x.price)))].join(', ')}</div>` : ''}${mig ? html`<div class="${ID}-sub">→ migrating to ${usd(mig.newPrice)} on ${short(s, mig.effectiveDay)}</div>` : ''}</td>
          <td style="white-space:nowrap"><button class="sm" data-editplan="${p.id}">Edit</button>${old.length && !mig ? html` <button class="sm" data-migrate="${p.id}">Migrate existing…</button>` : ''}</td></tr>`; })}
      </tbody></table></div>
      <div class="app-actions" style="margin-top:10px"><button data-act="newplan">+ Add price</button></div>
      <div class="callout"><b>Grandfathering:</b> changing a price applies to <b>new</b> subscriptions only. Existing subscribers keep the price they signed up at (in Stripe, prices are immutable: you create a new price and existing subscriptions stay on the old one). Moving them requires an explicit migration with advance notice.</div>
    </section>
    <section class="panel"><h2>Checkout & trials</h2>
      <label><input type="checkbox" id="cardReq" ${m.cardRequired ? 'checked' : ''} /> Require a card to start a trial</label>
      <p class="small muted">${s.company.model === 'b2c' ? 'Consumer apps: card-required (opt-out) trials convert far better than no-card trials, but trials that auto-convert without a reminder email are the #1 cause of disputes (research §1.3).' : s.company.model === 'smb' ? 'B2B: opt-in (no card) trials convert ~15–25%; card-required trials 30–60% but start fewer trials (params.js).' : 'Enterprise deals are usually invoiced after a pilot; trial settings matter less.'}</p>
    </section>
    <section class="panel"><h2>Coupons</h2>
      ${app.coupons.length ? html`<div class="table-wrap"><table><thead><tr><th>Code</th><th class="r">Off</th><th>Duration</th><th class="r">Redemptions</th></tr></thead><tbody>${app.coupons.map((c) => html`<tr><td><code>${c.code}</code></td><td class="r">${c.pctOff}%</td><td>${c.duration === 'forever' ? 'forever' : c.duration === 'once' ? 'once' : `${c.months} months`}</td><td class="r">${c.redemptions}</td></tr>`)}</tbody></table></div>` : html`<p class="muted small">No coupons yet.</p>`}
      <form id="couponForm" class="inline"><label>Code <input name="code" maxlength="20" placeholder="STAY25" /></label><label>% off <input type="number" name="pctOff" min="1" max="100" value="25" /></label>
        <label>Duration <select name="duration"><option value="once">Once</option><option value="repeating" selected>Repeating</option><option value="forever">Forever</option></select></label><label>Months <input type="number" name="months" min="1" max="24" value="3" /></label><button>Create coupon</button></form>
      <p class="small muted">Apply coupons from a subscription's Update dialog. Discounts count as contraction MRR while active and expansion when they end (ChartMogul treats discounts as contraction).</p></section>
    ${app.migrations.length ? html`<section class="panel"><h2>Price migrations</h2><div class="table-wrap"><table><thead><tr><th>Plan</th><th>Change</th><th>Notice sent</th><th>Effective</th><th class="r">Subs</th><th>Churn effect</th><th>Status</th></tr></thead><tbody>
      ${app.migrations.map((x) => html`<tr><td>${planName(s, x.planId)}</td><td>${usd(x.oldPrice)} → ${usd(x.newPrice)}</td><td class="small">${fmtDate(s, x.noticeDay)}</td><td class="small">${fmtDate(s, x.effectiveDay)}</td><td class="r">${x.affected}</td><td class="small">×${x.multiplier} churn for ${CHURN_WINDOW_DAYS} days</td><td>${statusBadge(x.status === 'done' ? 'done' : x.status === 'active' ? 'active' : 'pending', x.status)}</td></tr>${x.results?.length ? html`<tr><td colspan="7" class="small">${noticeReadersView(x.results)}</td></tr>` : ''}`)}</tbody></table></div></section>` : ''}`;
}

function settings(s) {
  const st = ensureStripe(s);
  const app = ensureApp(s);
  ensureDunning(s);
  const v = vol(s, 30);
  const ch = st.charges.filter((c) => c.day > s.day - 30 && c.status !== 'failed');
  const stripeFees = sumBy(ch, (c) => { const cu = cust(s, c.customerId); let p = PAYMENTS.cardPct + billingPctFor(st); if (cu?.country !== 'US') p += PAYMENTS.intlCardPct + (st.settings.adaptivePricing ? PAYMENTS.fxPct : 0); return c.amount * p + PAYMENTS.cardFixed; });
  const taxFees = v.gross * PAYMENTS.taxPct;
  const morFees = sumBy(ch, (c) => morFee(st, c.amount, cust(s, c.customerId)));
  const b = ensureBooks(s);
  const toggle = (key, on2, title, body, hours) => html`<div class="${ID}-check"><span class="dot ${on2 ? 'ok' : ''}">${on2 ? '✓' : ''}</span><div><b>${title}</b><div class="small muted">${body}</div></div><div class="actions"><button class="sm ${on2 ? '' : 'primary'}" data-set="${key}" data-hours="${hours}">${on2 ? 'Turn off' : 'Turn on'}${hours >= 1 ? ` (${hours}h)` : ''}</button></div></div>`;
  return html`<section class="panel"><h2>Billing settings</h2>
    ${toggle('smartRetries', st.settings.smartRetries, 'Smart Retries', 'Off = a fixed schedule (4 retries over ~3 weeks). On = up to 8 ML-timed retries within 2 weeks (Stripe recommendation). Retries only help soft declines (insufficient funds, do not honor); hard declines and expired cards need a new card from the customer.', 0.1)}
    ${toggle('cardUpdater', Boolean(st.settings.cardUpdater), 'Card account updater', 'Refreshes expired or reissued cards before the renewal is charged. Without it, issuers\' own network tokens still refresh most cards, but not all.', 0.25)}
    ${toggle('preExpiryEmails', Boolean(st.settings.preExpiryEmails), 'Card-expiry reminder emails', 'Asks customers to update a card that expires before the next charge (sent with your dunning sender).', 0.25)}
    ${dunningEditor(s)}
    ${toggle('stripeTax', st.settings.stripeTax, 'Stripe Tax', `Calculates and collects sales tax/VAT where you're registered: +0.5% per transaction (≈ ${usd(taxFees)}/30d at current volume). It monitors thresholds, but you still have to register in each state/country (research §4.3).`, 1)}
    ${toggle('adaptivePricing', Boolean(st.settings.adaptivePricing), 'Adaptive Pricing (local currencies)', `Shows international customers prices in their own currency at checkout. Stripe reports higher cross-border conversion (the game: +${Math.round(ADAPTIVE_LIFT * 100)}% relative for international buyers [design]); you pay the 1% currency-conversion fee on those payments. Prices stay USD for US customers.`, 0.25)}
    ${toggle('invoicingOnly', Boolean(st.settings.invoicingOnly), 'Bill invoices with Stripe Invoicing instead of Billing', `For invoice-only (send invoice, net 30) customers: Invoicing costs 0.4% per paid invoice instead of Billing's 0.7%. Card subscriptions still use Billing. ${s.company.model === 'ent' ? 'Most enterprise SaaS bills this way.' : 'Matters only if you invoice customers.'}`, 0.25)}
    ${toggle('trialReminders', Boolean(st.settings.trialReminders), 'Trial-ending reminder emails', 'Emails trial users ~3 days before the first charge. Auto-converting trials with no reminder are the main cause of consumer disputes ("I never agreed to pay"). Halves first-charge disputes; costs ~5% of trial conversions (relative). [design, research §1.3]', 0.25)}
    ${cancelFlowPanel(s)}
    <div class="${ID}-check"><span class="dot ${st.settings.merchantOfRecord ? 'ok' : ''}">${st.settings.merchantOfRecord ? '✓' : ''}</span><div><b>Merchant of record${st.settings.merchantOfRecord ? `: ${morOf(st).label}` : ''}</b>
      <div class="small muted">The MoR becomes the legal seller: it collects, files and remits sales tax and VAT worldwide and fights disputes for you. Indie founders choose it when selling B2C/prosumer into many countries (EU/UK VAT is due from the first consumer sale), when they're non-US or solo, and under ~$1–2M ARR. B2B founders invoicing US businesses usually stay on Stripe (research §1.6). Paddle, Lemon Squeezy and Polar mean a new checkout and moving every subscription (~3 weeks, 5–10% of subscribers don't make it across); Stripe Managed Payments keeps your subscriptions in your own Stripe account.</div>
      <div class="table-wrap"><table class="small"><thead><tr><th>Provider</th><th>Fee</th><th>Workflow</th><th>Move</th></tr></thead><tbody>${Object.entries(MOR_PROVIDERS).map(([k, p]) => html`<tr><td><b>${p.label}</b></td><td>${p.onTopOfStripe ? `Stripe fees + ${(p.pct * 100).toFixed(1)}%` : `${(p.pct * 100).toFixed(0)}% + ${Math.round(p.fixed * 100)}¢`}${p.intl ? ` (+${(p.intl * 100).toFixed(1)}% intl)` : ''}${p.sub ? ` (+${(p.sub * 100).toFixed(1)}% subs)` : ''}</td><td>${p.paradigm}${p.invoicing ? ' B2B invoices supported.' : ' No B2B invoicing.'}${p.trap ? html` <span class="warn">${p.trap}</span>` : ''} <span class="muted">${p.source}</span></td><td>${p.migrate.days} days, ${p.migrate.hours}h, ${Math.round(p.migrate.loss[0] * 100)}–${Math.round(p.migrate.loss[1] * 100)}% lost</td></tr>`)}</tbody></table></div>
      ${app.morMigration ? html`<div class="callout warn">Migration ${app.morMigration.target ? `to ${MOR_PROVIDERS[app.morMigration.provider ?? 'paddle']?.label ?? 'the MoR'}` : 'back to Stripe'} in progress: completes ${fmtDate(s, app.morMigration.endDay)}.</div>` : html`<form id="morForm" class="inline" style="margin-top:6px"><label>Provider <select name="provider">${Object.entries(MOR_PROVIDERS).map(([k, p]) => html`<option value="${k}" ${(st.settings.morProvider ?? 'paddle') === k ? 'selected' : ''}>${p.label}</option>`)}</select></label>${st.settings.merchantOfRecord ? html`<span class="small">Payouts: ${morOf(st).payouts === 'stripe' ? 'your Stripe schedule' : st.settings.morPayoutSchedule ?? 'semimonthly'}</span><button class="sm" name="go" value="switch">Switch provider</button><button class="sm" name="go" value="back">Move back to Stripe direct</button>` : html`<label>MoR payouts <select name="schedule"><option value="semimonthly">Twice monthly (1st & 15th)</option><option value="monthly">Monthly</option></select></label><button class="sm primary" name="go" value="to">Start migration to the MoR</button>`}</form>`}
    </div><div></div></div>
    <div class="${ID}-check"><span class="dot ok">✓</span><div><b>Billing platform: ${billingOf(st).label}</b>
      <div class="small muted">${billingOf(st).paradigm} Usage-billing tools only pay off when pricing is usage- or credit-based (Pricing lab: ${s.apps.pricing?.model ?? 'flat'}).</div>
      <form id="billPlatForm" class="inline" style="margin-top:6px"><label>Platform <select name="platform">${Object.entries(BILLING_PLATFORMS).map(([k, p]) => html`<option value="${k}" ${(st.settings.billingPlatform ?? 'stripe_billing') === k ? 'selected' : ''}>${p.label} (${p.pct ? `${(p.pct * 100).toFixed(1)}%` : p.monthly ? `$${p.monthly}/mo` : p.allotment ? `free to $${p.allotment / 1000}K billed` : ''}${p.setupHours ? `, ${p.setupHours}h setup` : ''})</option>`)}</select></label><button class="sm">Switch</button></form>
      <p class="small muted">${Object.values(BILLING_PLATFORMS).map((p) => `${p.label}: ${p.source}`).join(' · ')}</p>
    </div><div></div></div>
  </section>
  <section class="panel"><h2>Cost at your last 30 days of volume (${usd(v.gross)})</h2>
    <div class="${ID}-row"><span>Stripe: 2.9% + 30¢ + 0.7% Billing (+1.5% intl${st.settings.adaptivePricing ? ', +1% FX' : ''})</span><span>${usd(stripeFees)} (${pct(v.gross ? stripeFees / v.gross : 0)})</span></div>
    <div class="${ID}-row"><span>+ Stripe Tax 0.5%</span><span>${usd(stripeFees + taxFees)} (${pct(v.gross ? (stripeFees + taxFees) / v.gross : 0)})</span></div>
    <div class="${ID}-row"><span>Merchant of record: ${morOf(st).label} (tax handled)</span><span>${usd(morFees)} (${pct(v.gross ? morFees / v.gross : 0)})</span></div>
    ${s.company.model === 'b2c' ? html`<div class="${ID}-row"><span>Unremitted EU/UK VAT exposure (Books)</span><span class="${b.vat.exposure > 0 ? 'neg' : ''}">${usd(b.vat.exposure)}</span></div>` : ''}
    <p class="small muted">Worked example (research §1.1): a $49 US-card subscription costs $2.06 (4.2%) on Stripe Billing, $2.31 with Stripe Tax; a European card with conversion ≈ $3.29 (6.7%).</p>
  </section>`;
}

function disputes(s, id) {
  const st = ensureStripe(s);
  const dr = disputeRate(s);
  if (id) return disputeDetail(s, st.disputes.find((d) => d.id === id));
  const list = st.disputes.filter((d) => d.status !== 'scheduled').slice().reverse();
  return html`<section class="panel">
    <div class="${ID}-kpis">${stat('Dispute rate (90d)', pct(dr.rate, 2), `${dr.disputes} disputes / ${dr.charges} charges`, dr.rate >= PAYMENTS.excessiveDisputeRate && dr.charges >= 20 ? 'bad' : dr.rate >= 0.005 ? 'warn' : '')}${stat('Stripe threshold', '0.75%', 'Visa VAMP excessive: 1.5% (Apr 2026)')}${stat('Won / lost', `${list.filter((d) => d.status === 'won').length} / ${list.filter((d) => d.status === 'lost').length}`)}</div>
    <div class="meter"><div style="width:${Math.min(100, (dr.rate / PAYMENTS.excessiveDisputeRate) * 100)}%;background:${dr.rate >= PAYMENTS.excessiveDisputeRate ? 'var(--bad)' : 'var(--accent)'}"></div></div>
    <p class="small muted">Each dispute costs $15 (kept even if you win). Countering with evidence costs another $15, refunded if you win (since June 2025). Won disputes still count toward your rate (research §1.3).</p>
    ${riskCallout(s, { always: true })}
    ${list.length ? html`<div class="table-wrap"><table><thead><tr><th class="r">Amount</th><th>Status</th><th>Reason</th><th>Customer</th><th>Opened</th><th>Respond by</th><th></th></tr></thead><tbody>
      ${list.map((d) => html`<tr><td class="r"><b>${usd(d.amount)}</b></td><td>${statusBadge(d.status)}</td><td>${d.reason.replace(/_/g, ' ')}</td><td>${cust(s, d.customerId)?.name ?? ''}</td><td class="small">${fmtDate(s, d.day)}</td>
        <td class="small ${d.status === 'needs_response' && d.dueDay - s.day <= 2 ? 'neg' : ''}">${d.status === 'needs_response' ? `${fmtDate(s, d.dueDay)} (${d.dueDay - s.day}d)` : d.status === 'under_review' ? `decision ~${short(s, d.decisionDay)}` : '—'}</td>
        <td>${d.status === 'needs_response' ? html`<a class="btn sm primary" href="#/stripe/disputes/${d.id}">Respond</a>` : d.evidence ? html`<a class="btn sm" href="#/stripe/disputes/${d.id}">View</a>` : ''}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No disputes. Keep it that way: recognizable descriptor, receipts, trial-ending reminders.</p>`}
  </section>`;
}

/** Account risk status from the monthly dispute-ratio review (core/stripe.js riskDay). */
function riskCallout(s, { always = false } = {}) {
  const R = ensureStripe(s).risk;
  const w = disputeWindow(s);
  if (!R || (R.level === 'ok' && !R.highRisk && !always)) return '';
  const lvl = R.level === 'terminated' ? 'Terminated (MATCH-listed)' : R.highRisk ? `High-risk processor (${R.level})` : { ok: 'In good standing', warning: 'Warning: remediation plan due', review: 'Under review', excessive: 'Excessive dispute program' }[R.level];
  return html`<div class="callout ${R.level === 'ok' && !R.highRisk ? '' : 'bad'} small"><b>Account risk: ${lvl}.</b> Last 30 days: ${w.disputes} disputes / ${w.charges} card charges (${pct(w.ratio, 2)}); reviewed every ${RISK.reviewEveryDays} days against Stripe ~0.75% and Visa VAMP ${(vampThreshold(s) * 100).toFixed(1)}%. ${R.reservePct ? `Rolling reserve ${Math.round(R.reservePct * 100)}% (held ${RISK.reserveHoldDays} days). ` : ''}${R.payoutDelay ? `Payouts slowed ${R.payoutDelay} business days. ` : ''}${R.match ? `On the MATCH list until ${fmtDate(s, R.match.untilDay)}. ` : ''}Two clean months step the status back down.</div>`;
}

/** Did this customer actually use the product (the ground truth behind "they logged in and used it")? */
export function customerUsedProduct(s, customerId, sub) {
  const acct = sub ? s.apps.success?.accounts?.[sub.id] : null;
  if (acct?.usage != null) return acct.usage >= 0.3;
  const lc = (s.apps.lifecycle?.contacts ?? []).find((c) => c.cid === customerId);
  if (lc) return isActivated(lc, s.day);
  const fit = ensureMarket(s).fit.product.score ?? 0.3;
  const u = (parseInt(hash(`used|${customerId}`), 36) % 1000) / 1000;
  return (s.apps.product?.features ?? []).some((f) => f.status === 'shipped') && u < 0.25 + 0.6 * fit; // [design] activation proxy
}

/** Were the trial-ending / renewal notices (Transactional email) live and good enough to count as sent? */
export function reminderSent(s, sub) {
  const T = s.apps.transactional;
  const ok = (id) => { const x = T?.templates?.[id]; return x?.status === 'live' && (x.q ?? 0) >= 0.6 && (T.delivery ?? 1) >= 0.6; };
  if (!sub) return ok('trial_ending') || ok('renewal_notice');
  if (sub.trialEndDay != null) return ok('trial_ending');
  if (sub.interval === 'year') return ok('renewal_notice');
  return ok('receipt') || ok('renewal_notice');
}

export function disputeFacts(s, d) {
  const st = ensureStripe(s);
  const ch = st.charges.find((c) => c.id === d.chargeId);
  const c = cust(s, d.customerId);
  const sub = ch ? subscriptionById(s, ch.subId) : null;
  return {
    usedProduct: customerUsedProduct(s, d.customerId, sub),
    reminderSent: reminderSent(s, sub),
    tosAccepted: (s.apps.legal?.docs?.tos ?? 'none') !== 'none',
    reason: d.reason, amount: d.amount.toFixed(2), customerName: c?.name ?? 'unknown', chargeDate: ch ? fmtDate(s, ch.day) : 'unknown', signupDate: c ? fmtDate(s, c.createdDay) : 'unknown',
    successfulCharges: st.charges.filter((x) => x.customerId === d.customerId && x.status !== 'failed').length,
    cancelRequested: Boolean(sub && ch && (sub.cancelAtPeriodEnd || (sub.canceledDay != null && sub.canceledDay < ch.day && sub.cancelReason === 'customer_request'))),
    product: `${s.company.name}: ${s.company.oneLiner || 'SaaS subscription'}`,
  };
}

function disputeDetail(s, d) {
  if (!d) return html`<p class="empty">Dispute not found.</p>`;
  const f = disputeFacts(s, d);
  const draft = ui.drafts[d.id] ?? '';
  return html`<p><a href="#/stripe/disputes">← Disputes</a></p>
    <div class="grid-2">
      <section class="panel"><h2>${usd(d.amount)} · ${d.reason.replace(/_/g, ' ')} ${statusBadge(d.status)}</h2>
        <div class="${ID}-row"><span>Customer</span><span>${f.customerName}</span></div>
        <div class="${ID}-row"><span>Signed up</span><span>${f.signupDate}</span></div>
        <div class="${ID}-row"><span>Disputed charge</span><span>${f.chargeDate}</span></div>
        <div class="${ID}-row"><span>Successful charges</span><span>${f.successfulCharges}</span></div>
        <div class="${ID}-row"><span>Cancellation requested before charge</span><span>${f.cancelRequested ? 'Yes' : 'No'}</span></div>
        ${d.status === 'needs_response' ? html`<div class="${ID}-row"><span>Respond by</span><span class="neg">${fmtDate(s, d.dueDay)}</span></div>` : ''}
        <h3>What issuers want</h3>
        <ul class="small">${d.reason === 'fraudulent' ? html`<li>AVS / CVC / 3D Secure results</li><li>Proof the cardholder used the account after paying (logins, IP, activity)</li><li>Prior undisputed payments from the same card</li>` : html`<li>The cancellation & refund policy they accepted, and when</li><li>Proof they didn't cancel before the charge</li><li>Renewal reminder / receipt emails sent</li><li>Usage after the charge</li>`}<li>Short, factual, dated. No emotion.</li></ul>
      </section>
      <section class="panel"><h2>Your evidence</h2>
        ${d.evidence ? html`<p class="small muted">Submitted ${fmtDate(s, d.evidence.day)} · judged quality ${Math.round(d.evidence.quality * 100)}/100</p><blockquote class="card">${d.evidence.text}</blockquote>
          ${d.evidence.results.map((r) => html`<div class="card small"><b>${r.model}${r.mock ? ' (offline)' : ''}</b>: ${r.likelyOutcome} · ${Math.round(r.quality * 100)}/100${r.strengths.length ? html`<div class="pos">+ ${r.strengths.join('; ')}</div>` : ''}${r.weaknesses.length ? html`<div class="neg">− ${r.weaknesses.join('; ')}</div>` : ''}</div>`)}`
        : d.handledBy === 'mor' || (ensureStripe(s).settings.merchantOfRecord && d.status === 'needs_response') ? html`<p class="muted">Handled by your merchant of record: it submits evidence and owns the outcome. The chargeback amount is still deducted from your balance until it's decided.</p>`
        : d.status === 'needs_response' ? html`
          <textarea id="evidence" rows="12" placeholder="Write the evidence letter to the issuing bank: what was sold, what the customer agreed to, proof of use, dates, amounts…">${draft}</textarea>
          <p class="small muted"><span id="wc">${words(draft)}</span> words (minimum ${MIN_EVIDENCE_WORDS}). Countering costs $15, refunded if you win. Gathering evidence ≈ 1h.</p>
          <div class="app-actions"><button class="primary" id="submitEvidence">Submit evidence (1h)</button><button class="danger" id="acceptDispute">Accept dispute</button></div>` : html`<p class="muted">No evidence was submitted.</p>`}
      </section>
    </div>`;
}

function payouts(s) {
  const st = ensureStripe(s);
  const list = st.payouts.slice().reverse().slice(0, 200);
  const mor = st.settings.merchantOfRecord;
  const sched = st.settings.payoutSchedule ?? 'daily';
  const instFee = (a) => round2(Math.max(PAYMENTS.instantPayoutMin, a * PAYMENTS.instantPayoutPct));
  const bankName = s.bank.accounts.find((a) => a.id === 'checking')?.name ?? 'your bank';
  return html`${reconLine(s)}
    <div class="${ID}-kpis">${stat('Incoming', usd(sumBy(st.pending, (p) => p.amount)))}${stat('Available', usd(st.available))}${stat('In transit', usd(inTransit(st)))}${stat('Paid out (120d)', usd(sumBy(st.payouts.filter((p) => p.status === 'paid'), (p) => p.amount)))}</div>
    <section class="panel"><h2>Payout settings</h2>
      ${mor ? html`<form id="morPayoutForm" class="inline"><label>Merchant of record payouts <select name="schedule">${[['semimonthly', 'Twice monthly (1st & 15th)'], ['monthly', 'Monthly (1st)']].map(([k, l]) => html`<option value="${k}" ${(st.settings.morPayoutSchedule ?? 'semimonthly') === k ? 'selected' : ''}>${l}</option>`)}</select></label><button class="sm">Save</button></form>
        <p class="small muted">Under a merchant of record you are paid on the MoR's schedule, net of fees and tax. Instant and manual payouts aren't available.</p>`
      : html`<form id="payoutForm" class="inline"><label>Schedule <select name="schedule">${PAYOUT_SCHEDULES.map(([k, l]) => html`<option value="${k}" ${sched === k ? 'selected' : ''}>${l}</option>`)}</select></label><button class="sm">Save</button></form>
        <div class="app-actions" style="margin-top:8px">
          ${sched === 'manual' ? html`<button class="sm primary" data-payout="manual" ${st.available > 1 ? '' : 'disabled'}>Pay out ${usd(st.available)} (standard, next business day)</button>` : ''}
          <button class="sm" data-payout="instant" ${st.available >= 1 ? '' : 'disabled'}>Instant payout ${usd(st.available)} (fee ${usd(instFee(st.available))})</button>
        </div>
        <p class="small muted">Standard payouts are free and arrive the same business day they are created (funds become available T+2 business days after the charge). Weekly/monthly schedules hold cash in Stripe longer: fine for a cushion against refunds and disputes, costly when cash is tight. Instant Payouts land in minutes for 1.5% (min $0.50), from the available balance only.</p>`}
    </section>
    <section class="panel"><h2>Payouts to ${bankName}</h2>
    ${list.length ? html`<div class="table-wrap"><table><thead><tr><th class="r">Amount</th><th>Status</th><th>Type</th><th>Initiated</th><th>Arrives</th><th>Statement descriptor</th></tr></thead><tbody>
      ${list.map((p) => html`<tr><td class="r"><b>${usd(p.amount)}</b></td><td>${statusBadge(p.status)}</td><td class="small">${p.instant ? `Instant (fee ${usd(p.fee ?? 0)})` : 'Standard'}</td><td class="small">${fmtDate(s, p.day)}</td><td class="small">${fmtDate(s, p.arrivalDay)}</td><td class="small"><code>STRIPE ${p.instant ? 'INSTANT PAYOUT' : 'TRANSFER'} ${p.id.slice(-8).toUpperCase()}</code></td></tr>`)}</tbody></table></div>` : html`<p class="empty">No payouts yet.</p>`}
    <p class="small muted">A payout is net of fees, refunds and disputes, so it never equals your MRR or gross volume. Reconcile it in Books.</p></section>
    ${balanceSummary(s)}`;
}

// Stripe's "Balance summary" report: what you reconcile the books against at month-end.
function balanceSummary(s) {
  syncLedger(s);
  const L = ledgerByMonth(s);
  const months = allMonths(s).slice().reverse().slice(0, 12);
  return html`<section class="panel"><h2>Monthly balance summary</h2><div class="table-wrap"><table><thead><tr><th>Month</th><th class="r">Starting balance</th><th class="r">Charges</th><th class="r">Refunds</th><th class="r">Disputes</th><th class="r">Fees</th><th class="r">Capital repayments</th><th class="r">Payouts</th><th class="r">Ending balance</th></tr></thead><tbody>
    ${months.map((m) => { const r = stripeRecon(s, m, L); const end = stripeEnding(s, m, L); return html`<tr><td>${monthLabel(m)}</td><td class="r">${usd(end - r.change)}</td><td class="r">${usd(r.gross)}</td><td class="r">${usd(-r.refunds)}</td><td class="r">${usd(-r.chargebacks)}</td><td class="r">${usd(-r.fees)}</td><td class="r">${r.withheld ? usd(-r.withheld) : '—'}</td><td class="r">${usd(-r.payouts)}</td><td class="r"><b>${usd(end)}</b></td></tr>`; })}
  </tbody></table></div><p class="small muted">Ending balance = pending + available + payouts in transit at month-end. Use it for the Stripe reconciliation in Books → Month-end close.</p></section>`;
}

// ---------- dunning sequence designer ----------
// Steps are the player's own messages (day offset, channel, subject, body). Copy is judged (heuristic offline; an
// LLM read is blended in when online) for an update link, specifics (amount, plan), a human sender and no threats.
const DUNNING_HOURS = { perStep: 0.3, base: 0.25 }; // writing and testing a dunning message ~15-20 min [design]
const dunDraft = { steps: null };
function dunningEditor(s) {
  const st = ensureStripe(s);
  const d = ensureDunning(s);
  const steps = dunDraft.steps ?? d.steps.map((x) => ({ ...x }));
  const emails = st.settings.dunningEmails !== false;
  return html`<div class="${ID}-check"><span class="dot ${emails ? 'ok' : ''}">${emails ? '✓' : ''}</span><div><b>Dunning sequence (failed-payment messages)</b>
    <div class="small muted">Each message is a chance for the customer to put in a new card, the only way to recover hard declines and expired cards. Stripe's stock setup is one plain email; placeholders you can use: <code>{{update_link}}</code>, <code>{{amount}}</code>, <code>{{plan}}</code>, <code>{{first_name}}</code>. Threats ("final warning", "collections") lower response.</div>
    <form id="dunForm" style="margin-top:6px">
      <label class="inline-check"><input type="checkbox" name="emails" ${emails ? 'checked' : ''}/> Send dunning messages</label>
      <label class="inline-check"><input type="checkbox" name="fromPerson" ${d.fromPerson ? 'checked' : ''}/> Send from a person (name + reply-to), not no-reply@</label>
      ${steps.map((x, i) => html`<div class="card" style="margin:6px 0"><div class="inline"><label>Day <input type="number" name="day${i}" min="0" max="30" value="${x.day}" style="width:60px"/></label><label>Channel <select name="channel${i}">${['email', 'in_app', 'sms'].map((c) => html`<option value="${c}" ${x.channel === c ? 'selected' : ''}>${c.replace('_', '-')}</option>`)}</select></label><span class="small muted">copy score ${Math.round(100 * (x.quality ?? dunningStepQuality(x)))}/100</span></div>
        <label>Subject <input name="subject${i}" maxlength="120" value="${x.subject ?? ''}"/></label><label>Body <textarea name="body${i}" rows="3" maxlength="1200">${x.body ?? ''}</textarea></label></div>`)}
      <div class="inline"><button type="button" class="sm" data-dun="add" ${steps.length >= DUNNING.maxSteps ? 'disabled' : ''}>Add message</button><button type="button" class="sm" data-dun="remove" ${steps.length <= 1 ? 'disabled' : ''}>Remove last</button><button class="sm primary">Save sequence (${(DUNNING_HOURS.base + DUNNING_HOURS.perStep * steps.length).toFixed(2)} h)</button></div>
    </form></div><div></div></div>`;
}
function readDunForm(form) {
  const f = formData(form);
  const steps = [];
  for (let i = 0; i < DUNNING.maxSteps; i++) if (f[`subject${i}`] != null) steps.push({ day: Math.max(0, Math.min(30, Math.round(+f[`day${i}`] || 0))), channel: f[`channel${i}`] || 'email', subject: String(f[`subject${i}`] ?? '').slice(0, 120), body: String(f[`body${i}`] ?? '').slice(0, 1200) });
  return { f, steps };
}
function wireDunning(root, ctx) {
  on(root, 'click', '[data-dun]', (e, el) => {
    const form = root.querySelector('#dunForm');
    const { steps } = readDunForm(form);
    if (el.dataset.dun === 'add') steps.push({ day: (steps.at(-1)?.day ?? 0) + 3, channel: 'email', subject: '', body: '' });
    else steps.pop();
    dunDraft.steps = steps;
    ctx.render();
  });
  on(root, 'submit', '#dunForm', (e) => {
    e.preventDefault();
    const { f, steps } = readDunForm(e.target);
    ctx.act(async (st) => {
      const set = ensureStripe(st).settings;
      const d = ensureDunning(st);
      const { llmQ } = await judgeDunningSteps(ctx, steps);
      d.steps = steps.map((x, i) => { const h = dunningStepQuality(x); const l = Number(llmQ?.[i]); return { ...x, quality: Number.isFinite(l) ? +(0.5 * h + 0.5 * Math.max(0, Math.min(1, l))).toFixed(2) : +h.toFixed(2) }; });
      d.fromPerson = Boolean(f.fromPerson);
      d.designedDay = st.day;
      set.dunningEmails = Boolean(f.emails);
      dunDraft.steps = null;
      ctx.toast(`Dunning sequence saved: ${d.steps.length} message${d.steps.length === 1 ? '' : 's'}.`, 'good');
    }, { hours: DUNNING_HOURS.base + DUNNING_HOURS.perStep * steps.length, label: 'Dunning sequence' });
  });
}

// The typical reader of a failed-payment email: a median-tenure live subscriber (plan, price, months paid).
function dunningReader(state) {
  const live = ensureStripe(state).subscriptions.filter(isLive);
  if (!live.length) return '';
  const x = live.slice().sort((a, b) => (a.firstPaidDay ?? a.startDay) - (b.firstPaidDay ?? b.startDay))[Math.floor(live.length / 2)];
  const months = Math.max(1, Math.round((state.day - (x.firstPaidDay ?? x.startDay)) / 30));
  return `You are on the ${planName(state, x.planId)} plan at ${usd(monthlyAmount(x))}/month and have paid for ${months} month${months === 1 ? '' : 's'}; you did not know the card had a problem.`;
}

// LLM read of the player's dunning copy (null when offline or on error): 0-1 per step from the weighted criteria.
export async function judgeDunningSteps(ctx, steps) {
  let llmQ = null, res = null;
  try {
    res = await ctx.llm.ask({
      task: 'dunning_copy_judge', context: bizBlock(ctx.state, 'customer'),
      system: `You are a busy customer of a SaaS company and your card payment just failed. ${dunningReader(ctx.state)} You read each failed-payment message and decide whether you act now or let it slide. Placeholders like {{amount}} are filled with your real details when sent. Judge only the words on the page; most dunning messages are mediocre.\n${dunningRubric()}`,
      prompt: `Messages in order (day offset after the failure, channel). Score every message on every criterion and return exactly ${steps.length} entr${steps.length === 1 ? 'y' : 'ies'} in messages, one per message in this order, even when two messages are identical.\n\n${steps.map((x, i) => `#${i + 1} (day ${x.day}, ${x.channel})\nSubject: ${x.subject}\n${x.body}`).join('\n\n')}`,
      schema: DUNNING_SCHEMA,
      fallback: () => dunningFallback(steps),
    });
    if (!res.mock) {
      llmQ = dunningScores(res.data);
      // The judge sometimes merges identical messages into one entry: a repeated step gets its twin's score.
      const key = (x) => `${x.subject}\u0000${x.body}`;
      llmQ = steps.map((x, i) => llmQ[i] ?? llmQ[steps.findIndex((y) => key(y) === key(x))] ?? null);
    }
  } catch { llmQ = null; }
  return { llmQ, res };
}

/** Failed-payment recovery from core dunning stats: overall and by decline class. */
export function dunningRecovery(state) {
  const ds = ensureStripe(state).dunningStats ?? { failed: 0, recovered: 0, lost: 0, byCode: {} };
  const decided = ds.recovered + ds.lost;
  const cls = {};
  for (const [code, v] of Object.entries(ds.byCode ?? {})) { const c = (cls[declineClass(code)] ??= { failed: 0, recovered: 0, lost: 0 }); c.failed += v.failed; c.recovered += v.recovered; c.lost += v.lost; }
  return { ...ds, decided, rate: decided ? ds.recovered / decided : null, byClass: cls };
}

// Operator read for payments / dunning (data/operator-tiers.js payments_dunning). Unknown until enough failed
// payments have resolved; the tier is the recovery the player's setup actually produced.
registerOperatorReader('payments_dunning', (state) => {
  if (!state.stripe) return unknownRead();
  const r = dunningRecovery(state);
  const st = state.stripe.settings;
  const d = st.dunning ?? {};
  if (r.decided < 8) return unknownRead(['Recovery is measured once a few failed payments have resolved.']);
  const tier = tierFromScore(r.rate, { cuts: { stellar: 0.7, good: 0.55, average: 0.4 } });
  const coaching = [];
  if ((d.steps ?? []).length <= 1 || st.dunningEmails === false) coaching.push('Send four over 14 days, with a card-update link in each.');
  if (!st.smartRetries) coaching.push('Use smart retry logic by decline reason.');
  if (!st.cardUpdater) coaching.push('Turn on the card account updater: involuntary churn is a billing problem you can fix this month.');
  if (!d.fromPerson) coaching.push('Send dunning from a named person with a reply-to; offer a pause instead of losing the customer.');
  return { tier, score: r.rate, n: r.decided, evidence: [`Recovered ${Math.round(100 * r.rate)}% of ${r.decided} failed payments`, `Soft declines ${pctOrDash(r.byClass.soft)} · hard ${pctOrDash(r.byClass.hard)} · expired ${pctOrDash(r.byClass.expired)}`], coaching };
});
const pctOrDash = (c) => (c && c.recovered + c.lost ? `${Math.round((100 * c.recovered) / (c.recovered + c.lost))}%` : '—');

function recovery(s) {
  const st = ensureStripe(s);
  const r = recoveryStats(s);
  const failed = st.charges.filter((c) => c.status === 'failed');
  const codes = {};
  for (const c of failed) codes[c.failureCode] = (codes[c.failureCode] ?? 0) + 1;
  const pastDue = st.subscriptions.filter((x) => x.status === 'past_due');
  return html`<div class="${ID}-kpis">
      ${stat('Failed invoices', r.failed)}${stat('Recovered', `${r.recovered} · ${usd(r.recoveredAmount)}`, r.rate == null ? '' : `${pct(r.rate, 0)} of decided`, r.rate != null && r.rate < 0.4 ? 'warn' : 'good')}
      ${stat('Lost (churned)', `${r.lost} · ${usd(r.lostAmount)}`, 'involuntary churn', r.lost ? 'bad' : '')}${stat('In retry now', `${r.open} · ${usd(r.atRisk)}`)}</div>
    <div class="grid-2">
      <section class="panel"><h2>Recovery by decline reason</h2>${(() => { const dr = dunningRecovery(s); const rows = Object.entries(dr.byCode).sort((a, b) => b[1].failed - a[1].failed); return rows.length ? html`<div class="table-wrap"><table><thead><tr><th>Code</th><th>Type</th><th class="r">Failed</th><th class="r">Recovered</th><th class="r">Lost</th></tr></thead><tbody>${rows.map(([k, v]) => html`<tr><td><code>${k}</code></td><td>${declineClass(k)}</td><td class="r">${v.failed}</td><td class="r">${v.recovered}</td><td class="r">${v.lost}</td></tr>`)}</tbody></table></div><p class="small muted">Overall ${dr.rate == null ? '—' : pct(dr.rate, 0)} of decided failures recovered. Soft declines come back on retries; hard declines and expired cards only when the customer enters a new card, which is what your dunning messages are for.</p>` : html`<p class="empty">No failed renewals yet.</p>`; })()}</section>
      <section class="panel"><h2>Decline codes</h2>${Object.keys(codes).length ? Object.entries(codes).sort((a, b) => b[1] - a[1]).map(([k, n]) => html`<div class="${ID}-row"><span><code>${k}</code></span><span>${n}</span></div>`) : html`<p class="empty">No failed payments.</p>`}
        <p class="small muted">Benchmarks: ordinary setups recover ~35–45% of failed payments, layered programmes 70–85% (Recurly/Yuno, unverified). Smart Retries: <b>${st.settings.smartRetries ? 'on' : 'off'}</b> · dunning messages: <b>${st.settings.dunningEmails !== false ? (st.settings.dunning?.steps?.length ?? 1) : 'off'}</b> · card updater: <b>${st.settings.cardUpdater ? 'on' : 'off'}</b> · <a href="#/stripe/settings">settings</a></p></section>
      <section class="panel"><h2>Past due now</h2>${pastDue.length ? html`<ul class="list small">${pastDue.map((x) => html`<li><a href="#/stripe/customers/${x.customerId}">${cust(s, x.customerId)?.name}</a> · ${usd(monthlyAmount(x))}/mo · retry ${x.retry ? `${x.retry.attempts + 1} on ${short(s, x.retry.nextDay)}` : '—'}</li>`)}</ul>` : html`<p class="empty">None.</p>`}</section>
    </div>`;
}

// ---------- modals & actions ----------

function chargeModal(ctx, id) {
  const s = ctx.state;
  const c = ensureStripe(s).charges.find((x) => x.id === id);
  if (!c) return;
  const cu = cust(s, c.customerId);
  modal({
    title: `${usd(c.amount)} payment`,
    body: html`<div class="${ID}-row"><span>Status</span><span>${statusBadge(c.status)}</span></div>
      <div class="${ID}-row"><span>Customer</span><span>${cu?.name} (${cu?.email})</span></div>
      <div class="${ID}-row"><span>Payment method</span><span>${card(cu)} · ${customerRegion(cu).country}</span></div>
      <div class="${ID}-row"><span>Date</span><span>${fmtDate(s, c.day)}</span></div>
      <div class="${ID}-row"><span>Stripe fee</span><span>${usd(c.fee)}</span></div>
      <div class="${ID}-row"><span>Net</span><span>${usd(c.amount - c.fee)}</span></div>
      ${c.failureCode ? html`<div class="${ID}-row"><span>Decline code</span><span><code>${c.failureCode}</code></span></div>` : ''}
      <div class="${ID}-row"><span>ID</span><span class="small muted">${c.id}</span></div>
      ${c.amountRefunded ? html`<div class="${ID}-row"><span>Refunded</span><span>${usd(c.amountRefunded)}</span></div>` : ''}
      ${c.status === 'succeeded' ? html`<label>Refund amount <input type="number" name="refund" min="0.5" step="0.01" max="${(c.amount - (c.amountRefunded ?? 0)).toFixed(2)}" value="${(c.amount - (c.amountRefunded ?? 0)).toFixed(2)}" /></label>
        <p class="small muted">Full or partial (e.g. pro-rata for unused days). Stripe keeps the ${usd(c.fee)} fee either way. Refunding before a customer disputes avoids the $15 dispute fee and protects your dispute rate.</p>` : ''}`,
    actions: [{ label: 'Close' }, ...(c.status === 'succeeded' ? [{ label: 'Refund', danger: true, onClick: (d, form) => ctx.act((st) => { partialRefund(st, id, Number(form.refund.value)); }, { hours: 0.1, label: 'Refund' }) }] : [])],
  });
}

function updateModal(ctx, id) {
  const s = ctx.state;
  const x = ensureStripe(s).subscriptions.find((y) => y.id === id);
  const app = ensureApp(s);
  modal({
    title: `Update subscription · ${cust(s, x.customerId)?.name}`,
    body: html`<div class="grid-2"><label>${x.coupon ? 'List price before coupon' : 'Unit price'} (${x.interval === 'year' ? 'per year' : 'per month'}) <input type="number" name="price" min="0" step="0.01" value="${x.coupon ? x.coupon.originalPrice : x.price}" /></label>
      <label>Quantity (seats) <input type="number" name="quantity" min="1" step="1" value="${x.quantity ?? 1}" /></label></div>
      <label><input type="checkbox" name="prorate" checked /> Invoice the proration now for upgrades</label>
      <p class="small muted" id="proration"></p>
      ${x.coupon ? html`<p>Coupon <code>${x.coupon.code}</code> (${x.coupon.pctOff}% off${x.coupon.endDay ? ` until ${fmtDate(s, x.coupon.endDay)}` : ', forever'}).</p>` : app.coupons.length ? html`<label>Apply coupon <select name="coupon"><option value="">None</option>${app.coupons.map((c) => html`<option value="${c.id}">${c.code} · ${c.pctOff}% off</option>`)}</select></label>` : ''}
      <p class="small muted">Current MRR ${usd(isLive(x) ? monthlyAmount(x) : 0)}. Increases are expansion MRR, decreases and coupons contraction (ChartMogul definitions). Upgrades mid-period are prorated: the difference for the unused days is invoiced now; downgrades take effect without a refund.</p>`,
    onOpen: (d, form) => {
      const upd = () => { const amt = prorationAmount(ctx.state, x, { price: Number(form.price.value) * (x.coupon ? 1 - x.coupon.pctOff / 100 : 1), quantity: Math.round(Number(form.quantity.value)) }); d.querySelector('#proration').textContent = amt > 0 ? `Proration invoice now: ${usd(amt)} (${Math.max(0, x.currentPeriodEnd - ctx.state.day)} days left in the period).` : ''; };
      form.addEventListener('input', upd); upd();
    },
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: (d, form) => ctx.act((st) => {
      const f = formData(form);
      if (!(f.price >= 0) || !(f.quantity >= 1)) throw new Error('Enter a valid price and quantity.');
      const q = Math.round(f.quantity);
      const sub = st.stripe.subscriptions.find((y) => y.id === id);
      const charged = sub.coupon ? f.price * (1 - sub.coupon.pctOff / 100) : f.price;
      const pr = f.prorate ? prorationAmount(st, sub, { price: charged, quantity: q }) : 0;
      setListPrice(st, sub, { price: f.price, quantity: q });
      if (pr > 0) chargeProration(st, sub, pr);
      if (f.coupon) applyCoupon(st, ensureApp(st), sub, f.coupon);
    }, { hours: 0.1, label: 'Update subscription' }) }],
  });
}

function cancelModal(ctx, id) {
  const s = ctx.state;
  const x = ensureStripe(s).subscriptions.find((y) => y.id === id);
  modal({
    title: `Cancel subscription · ${cust(s, x.customerId)?.name}`,
    body: html`<label class="radio-card"><input type="radio" name="when" value="end" checked /><b>At period end</b><span>Keeps access until ${x.currentPeriodEnd != null ? fmtDate(s, x.currentPeriodEnd) : 'the period ends'}; MRR churns then.</span></label>
      <label class="radio-card"><input type="radio" name="when" value="now" /><b>Immediately</b><span>Ends access now; MRR churns today. No automatic refund.</span></label>
      <label>Reason <select name="reason">${['customer_request', 'too_expensive', 'missing_features', 'switched_service', 'unused', 'low_quality', 'other'].map((r) => html`<option value="${r}">${r.replace(/_/g, ' ')}</option>`)}</select></label>`,
    actions: [{ label: 'Back' }, { label: 'Cancel subscription', primary: true, onClick: (d, form) => ctx.act((st) => {
      const f = formData(form);
      cancel(st, id, { atPeriodEnd: f.when === 'end', reason: f.reason });
    }, { hours: 0.1, label: 'Cancel subscription' }) }],
  });
}

// Prices are always typed by the founder: a new price starts blank (no suggested amount, no default trial).
export function planModal(ctx, id) {
  const s = ctx.state;
  const p = s.plans.find((x) => x.id === id) ?? { id: null, name: '', price: '', interval: s.company.model === 'ent' ? 'year' : 'month', trialDays: 0, active: true };
  modal({
    title: id ? `Edit ${p.name}` : 'Add a price',
    body: html`<div class="grid-2"><label>Name <input name="name" value="${p.name}" required maxlength="40" placeholder="Pro (annual)" /></label>
      <label>Price (USD) <input type="number" name="price" min="0.5" step="0.01" value="${p.price}" required placeholder="Your price" /></label>
      <label>Billing interval <select name="interval"><option value="month" ${p.interval === 'month' ? 'selected' : ''}>Monthly</option><option value="year" ${p.interval === 'year' ? 'selected' : ''}>Yearly</option></select></label>
      <label>Trial days <input type="number" name="trialDays" min="0" max="90" value="${p.trialDays}" /></label></div>
      <label><input type="checkbox" name="active" ${p.active ? 'checked' : ''} /> Active (offered to new customers)</label>
      <p class="small muted">The first active price is what new customers see. Annual plans are typically discounted 15–40% and are cash upfront, but revenue is recognized monthly (deferred revenue in Books).</p>`,
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: (d, form) => ctx.act((st) => {
      const f = formData(form);
      if (!f.name.trim() || !(f.price > 0)) throw new Error('Name and price are required.');
      const live = st.stripe.subscriptions.filter((x) => x.planId === id && isLive(x)).length;
      if (id) {
        const pl = st.plans.find((x) => x.id === id);
        const changed = Math.abs(pl.price - f.price) > 0.001 || pl.interval !== f.interval;
        Object.assign(pl, { name: f.name.trim(), price: round2(f.price), interval: f.interval, trialDays: Math.round(f.trialDays ?? 0), active: Boolean(f.active) });
        if (changed && pl.active) recordPublicEvent(st, 'price_change', { kind: 'list_price', planId: pl.id, to: pl.price, interval: pl.interval });
        if (changed && live) ctx.toast(`New price applies to new subscriptions only. ${live} existing subscriber${live > 1 ? 's keep' : ' keeps'} the old price (grandfathered).`, 'info');
      } else st.plans.push({ id: uid('plan'), name: f.name.trim(), price: round2(f.price), interval: f.interval, trialDays: Math.round(f.trialDays ?? 0), active: Boolean(f.active) });
      if (!st.plans.some((x) => x.active)) throw new Error('Keep at least one active price.');
    }, { hours: 0.25, label: 'Edit pricing' }) }],
  });
}

// Who reads the notice: up to three real subscribers on the plan (longest tenure, newest, least active), each with
// their own plan price, tenure and usage, so a daily user of two years and a barely-active new account react
// differently. Usage is the success app's proxy (product fit + per-account noise). Generic personas when no
// subscriber is live (a notice drafted before anyone pays).
export function noticePersonas(state, subs = []) {
  const live = subs.filter(isLive);
  if (!live.length) return (state.company.model === 'b2c' ? ['a loyal subscriber who uses the app weekly', 'a price-sensitive subscriber who barely uses it'] : ['a small-business owner who relies on the product daily', 'an ops manager who has to justify every tool in the budget']).map((who) => ({ who, price: null }));
  const fit = state.market?.fit?.product?.score ?? 0.3;
  const use = (x) => usageProxy({ productFit: fit, seed: x.id });
  const since = (x) => x.firstPaidDay ?? x.startDay ?? state.day;
  const byTenure = live.slice().sort((x, y) => since(x) - since(y));
  const picks = [...new Set([byTenure[0], byTenure.at(-1), live.slice().sort((x, y) => use(x) - use(y))[0]])];
  const role = state.company.model === 'b2c' ? 'a subscriber' : state.company.model === 'ent' ? 'the budget owner for this tool at your company' : 'the owner, who pays for the tool';
  return picks.map((x) => {
    const c = customerById(state, x.customerId);
    const months = Math.max(0, Math.round((state.day - since(x)) / 30));
    const u = use(x);
    const usage = u >= 0.65 ? 'use it most working days and it is part of your routine' : u >= 0.4 ? 'use it a few times a month' : 'have barely logged in for weeks and keep meaning to cancel';
    return { who: `${c?.name ?? 'a customer'}${c?.company ? ` at ${c.company}` : ''}, ${role}. You have paid for it for ${months < 1 ? 'less than a month' : `${months} month${months === 1 ? '' : 's'}`} and you ${usage}`, price: x.price, months, usage: +u.toFixed(2) };
  });
}

// What the subscribers who read the notice said, one line per reader (the persona string trimmed to who they are).
function noticeReadersView(results) {
  return html`<b>How your subscribers read the notice${results.some((r) => r.mock) ? ' (offline readers)' : ''}:</b><ul class="list">${results.slice(0, 6).map((r) => html`<li><i>${String(r.persona ?? '').split(',')[0]}${Number.isFinite(r.usage) ? ` (usage ${Math.round(r.usage * 100)}%)` : ''}:</i> "${r.reaction ?? ''}"</li>`)}</ul>`;
}

/** Customer panel reading a price-increase notice → { risk (0-1 mean churn risk), results }. */
export async function judgePriceNotice(ctx, { email, oldPrice, newPrice, interval = 'month', notice, subs = [] }) {
  const st = ctx.state;
  const results = [];
  for (const p of noticePersonas(st, subs)) {
    const pays = p.price ?? oldPrice;
    const res = await ctx.llm.panel({
      task: 'price_increase_notice', rubric: NOTICE_CRITERIA, context: bizBlock(st, 'customer'),
      system: `${REALISM}\nYou are ${p.who}. You are a current customer of ${st.company.name} (${st.company.oneLiner || 'a SaaS product'}). The year is 2026. Whether you stay depends on how much you rely on it and how long you have used it, as well as on this email.`,
      prompt: `You pay ${usd(pays)} per ${interval}. You just received this email about a price change to ${usd(newPrice)} per ${interval} (${Math.round(((newPrice - pays) / pays) * 100)}% more) effective in ${notice} days. Merge fields like {{first_name}} are filled in when it is sent.\n\n=== EMAIL ===\n${String(email).slice(0, 4000)}\n=== END ===\nReact honestly, in character. Score every criterion of the rubric below for what is actually in the email, then give your churn risk.\n${noticeRubric(notice)}`,
      schema: NOTICE_SCHEMA,
      fallback: () => noticeHeuristic(email, { oldPrice: pays, newPrice, noticeDays: notice, usage: p.usage, months: p.months }),
      cache: st.cache,
    });
    results.push(...res.map((r) => ({ persona: p.who, tenureMonths: p.months ?? null, usage: p.usage ?? null, model: r.model, mock: r.mock, jev: r.jev, ...r.data })));
  }
  const incPct = (newPrice - oldPrice) / oldPrice;
  // Low-usage accounts take any increase as the reason to leave; daily users grumble and stay. Personas state this
  // only weakly (stated risks cluster), so the reader's usage scales their risk: x0.79 at 0.85 usage, x1.12 at 0.3. [design]
  const usageMult = (u) => (Number.isFinite(u) ? clamp(1.3 - 0.6 * u, 0.7, 1.3) : 1);
  const risks = results.map((r) => (r.mock ? Number(r.churnRisk) : noticeRisk(r, { increasePct: incPct, noticeDays: notice })) * usageMult(r.usage)).filter(Number.isFinite);
  const risk = clamp(risks.length ? risks.reduce((a, b) => a + b, 0) / risks.length : 0.2, 0, 1);
  return { risk, results };
}

/** Issuer analyst reading the merchant's dispute evidence → { quality 0-1, res }. */
export async function judgeDisputeEvidence(ctx, text, facts) {
  const res = await ctx.llm.panel({ task: 'dispute_evidence', rubric: EVIDENCE_CRITERIA, system: EVIDENCE_SYSTEM, prompt: evidencePrompt(text, facts), schema: EVIDENCE_SCHEMA, temperature: 0.3, fallback: () => evidenceHeuristic(text, facts), cache: ctx.state.cache });
  const qs = res.map((r) => (r.mock ? Number(r.data.quality) : evidenceQuality(r.data))).filter(Number.isFinite);
  let quality = clamp(qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : 0.3, 0, 1);
  // The issuer gets the cancellation log with the case: a letter that denies a cancellation the merchant's own
  // records show is caught whatever the reviewers scored (the chat judge missed it about half the time live).
  // Same for claims about usage, reminder emails and terms acceptance that the merchant's own logs do not show: the
  // issuer asks for the session logs, the sent email and the acceptance record, and there are none.
  const contradictions = evidenceContradictions(text, facts);
  const contradicted = contradictsRecords(text, facts) || contradictions.length > 0;
  if (contradicted) quality = Math.min(quality, EVIDENCE_QUALITY.contradictedCap);
  return { quality, res, contradicted, contradictions };
}

function migrateModal(ctx, planId) {
  const s = ctx.state;
  const p = s.plans.find((x) => x.id === planId);
  const subs = ensureStripe(s).subscriptions.filter((x) => x.planId === planId && !x.coupon && (isLive(x) || x.status === 'trialing') && Math.abs(x.price - p.price) > 0.001);
  const oldPrice = subs.length ? subs.reduce((a, x) => a + x.price, 0) / subs.length : p.price;
  const delta = sumBy(subs.filter(isLive), (x) => (p.price - x.price) * (x.quantity ?? 1) * (x.interval === 'year' ? 1 / 12 : 1) * (1 - (x.discountPct ?? 0)));
  const increase = p.price > oldPrice;
  modal({
    title: `Migrate ${subs.length} subscribers to ${usd(p.price)}`,
    wide: true,
    body: html`<p>${subs.length} subscribers pay an average of ${usd(oldPrice)}. Moving them to ${usd(p.price)} changes MRR by <b>${usd(delta)}</b> on the effective date (recorded as ${increase ? 'expansion' : 'contraction'}).</p>
      ${increase ? html`<div class="callout warn">Price increases on existing customers need advance notice: at least ${MIN_NOTICE_DAYS} days is the common standard (most ToS and US state auto-renewal laws, e.g. California's, require clear notice of material changes). Expect a churn spike for about two renewal cycles; how big depends on how you communicate it.</div>
        <label>Notice period (days) <input type="number" name="notice" min="${MIN_NOTICE_DAYS}" max="120" value="${MIN_NOTICE_DAYS}" /></label>
        <label>Email to existing subscribers (≥ 60 words) <textarea name="email" rows="9" id="noticeEmail" placeholder="Subject: An update to your ${p.name} plan…">${ui.notice}</textarea></label>
        <p class="small muted">A panel of your customers reads it. Good notices say what changes, by how much, when, why (what they got), and offer a way to lock the old price (e.g. annual). ≈ 1h.</p>`
      : html`<p class="small muted">Price decreases take effect immediately; no notice needed.</p>`}`,
    onOpen: (d) => d.querySelector('#noticeEmail')?.addEventListener('input', (e) => { ui.notice = e.target.value; }),
    actions: [{ label: 'Cancel' }, { label: increase ? 'Send notice & schedule' : 'Migrate now', primary: true, onClick: async (d, form) => {
      const f = formData(form);
      const ok = await ctx.act(async (st) => {
        const app = ensureApp(st);
        if (!increase) {
          for (const x of subs) changePrice(st, x.id, { price: p.price });
          app.migrations.push({ planId, oldPrice, newPrice: p.price, noticeDay: st.day, effectiveDay: st.day, affected: subs.length, multiplier: 1, status: 'done' });
          return true;
        }
        const notice = Math.max(MIN_NOTICE_DAYS, Math.round(f.notice ?? MIN_NOTICE_DAYS));
        if (words(f.email) < 60) throw new Error('Write the notice email (at least 60 words).');
        const { risk, results } = await judgePriceNotice(ctx, { email: f.email, oldPrice, newPrice: p.price, interval: p.interval, notice, subs });
        const mult = migrationChurnMultiplier((p.price - oldPrice) / oldPrice, risk);
        const th = newThread(st, { subject: `Update to your ${p.name} plan`, with: `All ${p.name} subscribers (${subs.length})`, kind: 'customer', app: ID });
        addMessage(st, th.id, { from: 'me', body: f.email });
        app.migrations.push({ planId, oldPrice: round2(oldPrice), newPrice: p.price, noticeDay: st.day, effectiveDay: st.day + notice, affected: subs.length, multiplier: mult, risk, results, status: 'scheduled' });
        ui.notice = '';
        notify(st, `Price-change notice sent to ${subs.length} subscribers. Effective ${fmtDate(st, st.day + notice)}; customer panel churn risk ${pct(risk, 0)} → churn ×${mult} for ${CHURN_WINDOW_DAYS} days.`, { type: 'info', app: ID });
        return true;
      }, { hours: increase ? 1 : 0.25, label: 'Price migration' });
      return ok ? undefined : false;
    } }],
  });
}

// What a letter asserts that the records can prove or not: usage / logins, reminder emails, terms acceptance.
const CLAIMS_USE = /\b(logged in|log-?ins?|sessions?|actively used|used (the|our) (product|service|app)|continued to use|usage logs?|active (user|account)|accessed (the|their) account)\b/i;
const CLAIMS_REMINDER = /\b(reminder|renewal notice|trial[- ]ending (email|notice)|notified (them|the customer)|sent (an?|the) (email|notice) (before|ahead))\b/i;
const CLAIMS_TOS = /\b(accepted (our|the) (terms|tos)|agreed to (our|the) (terms|tos)|terms of service (were )?accepted|clickwrap|checkbox (at|during) checkout)\b/i;
/** Evidence claims contradicted by ground truth (usage, lifecycle emails sent, ToS on file). → [{ id, label }] */
export function evidenceContradictions(text, facts) {
  const t = String(text ?? '');
  const out = [];
  if (facts.usedProduct === false && CLAIMS_USE.test(t)) out.push({ id: 'usage', label: 'claims the customer used the product; the logs show no use' });
  if (facts.reminderSent === false && CLAIMS_REMINDER.test(t)) out.push({ id: 'reminder', label: 'claims a reminder email was sent; no live, deliverable notice existed' });
  if (facts.tosAccepted === false && CLAIMS_TOS.test(t)) out.push({ id: 'tos', label: 'claims terms were accepted at checkout; there are no published terms' });
  return out;
}

/** False statements in dispute evidence: recorded and judged by the processor (integrity, risk team patience). */
function falseEvidence(state, d, list) {
  const caught = recordClaims(state, { audience: 'processor', recipientId: 'stripe', channel: 'dispute_evidence', claims: list.map((x) => ({ metric: `evidence:${x.id}`, claimed: true, truth: false, text: x.label })) });
  for (const c of caught) Object.assign(c, { status: 'caught', caughtDay: state.day, caughtBy: 'issuer record check' });
  ensureRisk(state).falseEvidence = (ensureRisk(state).falseEvidence ?? 0) + 1;
  penalize(state, caught, { audience: 'processor', functionId: 'payments_dunning', id: 'false_dispute_evidence', label: 'Dispute evidence your own records contradict', app: 'stripe', detail: `Dispute ${d.id.slice(-6)}: ${list.map((x) => x.label).join('; ')}. The issuer asks for the log, the email or the acceptance record; a letter that asserts what you cannot show loses and makes the risk team less patient. A stellar operator attaches dated proof that exists, or accepts the dispute.` });
  return list.map((x) => x.id);
}

async function submitEvidence(ctx, id) {
  const s = ctx.state;
  const d = ensureStripe(s).disputes.find((x) => x.id === id);
  const text = ui.drafts[id] ?? '';
  if (words(text) < MIN_EVIDENCE_WORDS) { ctx.toast(`Write at least ${MIN_EVIDENCE_WORDS} words of evidence.`, 'warn'); return; }
  const facts = disputeFacts(s, d);
  await ctx.act(async (st) => {
    const { quality, res, contradictions } = await judgeDisputeEvidence(ctx, text, facts);
    const dd = st.stripe.disputes.find((x) => x.id === id);
    if (dd.status !== 'needs_response') throw new Error('This dispute can no longer be countered.');
    if (contradictions.length) dd.contradictions = falseEvidence(st, dd, contradictions);
    respondToDispute(st, id, quality);
    dd.evidence = { text, quality, day: st.day, results: res.map((r) => ({ model: r.model, mock: r.mock, ...r.data })) };
    delete ui.drafts[id];
    ctx.toast(`Evidence submitted (quality ${Math.round(quality * 100)}/100). The issuer decides in 30–60 days.`, quality > 0.55 ? 'good' : 'info');
  }, { hours: 1, label: 'Dispute evidence' });
}

// ---------- app ----------

export default {
  id: ID,
  title: 'Payments',
  icon: '💳',
  group: 'Money',
  badge: (state) => state.stripe?.disputes.filter((d) => d.status === 'needs_response').length || 0,
  render(root, ctx) {
    const s = ctx.state;
    const st = ensureStripe(s);
    ensureApp(s);
    const [v0, arg] = ctx.params.split('/'); const view = v0 || 'home';
    const needs = st.disputes.filter((d) => d.status === 'needs_response').length;
    const body = { payments, customers, subscriptions, invoices, products, settings, disputes, payouts, recovery }[view]?.(s, arg) ?? home(s);
    const overdueN = openInvoices(s).filter((i) => i.dueDay < s.day).length;
    mount(root, html`${appCss(ID)}
      <div class="app-head"><div><h1>Stripe <span class="badge">Live mode</span></h1><p>Payments, subscriptions and payouts for ${s.company.name}. ${st.settings.merchantOfRecord ? 'Merchant of record: on (5% + 50¢ all-in).' : ''}</p></div></div>
      ${tabs(ID, [{ id: 'home', label: 'Home' }, { id: 'payments', label: 'Payments' }, { id: 'customers', label: 'Customers' }, { id: 'subscriptions', label: 'Subscriptions' }, { id: 'invoices', label: 'Invoices', count: overdueN, tone: 'warn' }, { id: 'products', label: 'Products' }, { id: 'disputes', label: 'Disputes', count: needs, tone: 'bad' }, { id: 'payouts', label: 'Payouts' }, { id: 'recovery', label: 'Revenue recovery' }, { id: 'settings', label: 'Billing settings' }], view)}
      ${body}`);

    if (view === 'home') {
      const vals = [], labels = [];
      for (let d = s.day - 29; d <= s.day; d++) { vals.push(sumBy(st.charges.filter((c) => c.day === d && c.status !== 'failed'), (c) => c.amount)); labels.push(d === s.day - 29 || d === s.day ? short(s, d) : ''); }
      barChart(root.querySelector('#volChart'), vals, { labels, height: 150 });
    }

    on(root, 'click', '[data-charge]', (e, el) => chargeModal(ctx, el.dataset.charge));
    on(root, 'click', '[data-cust]', (e, el) => ctx.navigate(ID, `customers/${el.dataset.cust}`));
    on(root, 'click', '[data-paystatus]', (e, el) => { ui.payStatus = el.dataset.paystatus; ctx.render(); });
    on(root, 'click', '[data-substatus]', (e, el) => { ui.subStatus = el.dataset.substatus; ctx.render(); });
    on(root, 'input', '#cq', (e) => { ui.cq = e.target.value; ctx.render(); });
    on(root, 'click', '[data-upd]', (e, el) => updateModal(ctx, el.dataset.upd));
    on(root, 'click', '[data-cxl]', (e, el) => cancelModal(ctx, el.dataset.cxl));
    on(root, 'click', '[data-editplan]', (e, el) => planModal(ctx, el.dataset.editplan));
    on(root, 'click', '[data-act=newplan]', () => ctx.navigate('pricing', 'prices')); // prices are set in the Pricing lab
    on(root, 'click', '[data-migrate]', (e, el) => migrateModal(ctx, el.dataset.migrate));
    on(root, 'change', '#cardReq', (e) => ctx.act((st2) => { ensureMarket(st2).cardRequired = e.target.checked; }, { hours: 0.1, label: 'Checkout settings' }));
    on(root, 'click', '[data-set]', (e, el) => ctx.act((st2) => {
      const k = el.dataset.set;
      const set = ensureStripe(st2).settings;
      set[k] = !(set[k] ?? (k === 'dunningEmails'));
      if (k === 'merchantOfRecord') notify(st2, set[k] ? 'Moved billing to a merchant of record: 5% + 50¢ per transaction, global sales tax/VAT and disputes handled by the MoR.' : 'Moved billing back to Stripe direct. You are now responsible for sales tax and VAT registrations.', { type: 'info', app: ID });
    }, { hours: +el.dataset.hours, label: 'Billing settings' }));
    on(root, 'input', '#evidence', (e) => {
      ui.drafts[arg] = e.target.value;
      const wc = root.querySelector('#wc');
      if (wc) wc.textContent = words(e.target.value);
    });
    on(root, 'click', '#submitEvidence', () => submitEvidence(ctx, arg));
    on(root, 'click', '[data-remind]', (e, el) => ctx.act((st2) => {
      const inv = sendInvoiceReminder(st2, el.dataset.remind);
      if (!inv) throw new Error('That invoice is no longer open.');
      ctx.toast(`Reminder sent to ${cust(st2, inv.customerId)?.name ?? 'the customer'}.`, 'info');
    }, { hours: 0.1, label: 'Invoice reminder' }));
    on(root, 'submit', '#payoutForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st2) => { if (!PAYOUT_SCHEDULES.some(([k]) => k === f.schedule)) throw new Error('Pick a schedule.'); ensureStripe(st2).settings.payoutSchedule = f.schedule; }, { hours: 0.05, label: 'Payout schedule' }); });
    on(root, 'submit', '#morPayoutForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st2) => { ensureStripe(st2).settings.morPayoutSchedule = f.schedule === 'monthly' ? 'monthly' : 'semimonthly'; }, { hours: 0.05, label: 'Payout schedule' }); });
    on(root, 'click', '[data-payout]', (e, el) => ctx.act((st2) => {
      if (el.dataset.payout === 'instant') { const p = instantPayout(st2); ctx.toast(`Instant payout of ${usd(p.amount)} sent (fee ${usd(p.fee)}).`, 'good'); }
      else { const p = manualPayout(st2); ctx.toast(`Payout of ${usd(p.amount)} created; arrives ${fmtDate(st2, p.arrivalDay)}.`, 'good'); }
    }, { hours: 0.05, label: 'Payout' }));
    on(root, 'submit', '#couponForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st2) => { createCoupon(ensureApp(st2), f); }, { hours: 0.1, label: 'Create coupon' }); });
    wireCancelFlow(root, ctx);
    wireDunning(root, ctx);
    on(root, 'submit', '#morForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const cur = ensureStripe(s).settings;
      const provider = MOR_PROVIDERS[f.provider] ? f.provider : (cur.morProvider ?? 'paddle');
      const go = e.submitter?.value ?? (cur.merchantOfRecord ? 'back' : 'to');
      const target = go !== 'back';
      // Leaving or joining a MoR that keeps subscriptions in your Stripe account is the short path.
      const p = MOR_PROVIDERS[target ? provider : (cur.morProvider ?? 'paddle')] ?? MOR_PROVIDERS.paddle;
      if (go === 'switch' && provider === (cur.morProvider ?? 'paddle')) { ctx.toast('That is already your merchant of record.', 'warn'); return; }
      ctx.act((st2) => {
        const a = ensureApp(st2);
        a.morMigration = { target, provider, schedule: f.schedule ?? 'semimonthly', startDay: st2.day, endDay: st2.day + p.migrate.days, loss: p.migrate.loss };
        notify(st2, `Started moving billing ${target ? `to ${MOR_PROVIDERS[provider].label}` : 'back to Stripe'}. ${p.payouts === 'stripe' ? 'Subscriptions stay in your Stripe account' : 'New checkout now; existing subscriptions move over the next 3 weeks'}.`, { type: 'info', app: ID });
      }, { hours: p.migrate.hours, label: 'Billing migration' });
    });
    on(root, 'submit', '#billPlatForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const p = BILLING_PLATFORMS[f.platform];
      if (!p) return;
      ctx.act((st2) => { setBillingPlatform(st2, f.platform); notify(st2, `Billing moved to ${p.label}.${p.setupHours ? ` Integration took ~${p.setupHours}h of engineering.` : ''}`, { type: 'info', app: ID }); }, { hours: Math.max(0.25, p.setupHours), label: 'Billing platform integration' });
    });
    on(root, 'click', '#acceptDispute', () => ctx.act((st2) => {
      const d = st2.stripe.disputes.find((x) => x.id === arg);
      if (d?.status === 'needs_response') { d.status = 'lost'; d.accepted = true; }
    }, { hours: 0.05, label: 'Accept dispute' }));
  },
  onDay(state) {
    const st = ensureStripe(state);
    const app = ensureApp(state);
    ensureDunning(state);
    // Scheduled price migrations.
    for (const m of app.migrations) {
      if (m.status === 'scheduled' && state.day >= m.effectiveDay) {
        const plan = state.plans.find((p) => p.id === m.planId);
        for (const x of st.subscriptions) if (x.planId === m.planId && !x.coupon && (isLive(x) || x.status === 'trialing') && Math.abs(x.price - m.newPrice) > 0.001) changePrice(state, x.id, { price: m.newPrice });
        setModifier(state, 'churn', `price-migration-${m.planId}`, m.multiplier);
        m.status = 'active';
        m.endDay = state.day + CHURN_WINDOW_DAYS;
        notify(state, `${plan?.name ?? 'Plan'} price migration took effect: ${m.affected} subscribers now pay ${money(m.newPrice)}.`, { type: 'info', app: ID });
      } else if (m.status === 'active' && state.day >= m.endDay) {
        setModifier(state, 'churn', `price-migration-${m.planId}`, null);
        m.status = 'done';
      }
    }
    expireCoupons(state);
    // Trial-ending reminders: fewer first-charge disputes, slightly fewer conversions.
    setModifier(state, 'conversion', 'trial-reminders', st.settings.trialReminders ? TRIAL_REMINDER.conversion : null);
    setModifier(state, 'conversion', 'adaptive-pricing', st.settings.adaptivePricing && !st.settings.merchantOfRecord ? round2(1 + ADAPTIVE_LIFT * (PAYMENTS.intlShare?.[state.company.model] ?? 0.3)) : null);
    for (const d of st.disputes.slice()) {
      if (d.status !== 'scheduled' || app.dSeen[d.id]) continue;
      app.dSeen[d.id] = true;
      if (!st.settings.trialReminders) continue;
      const ch = st.charges.find((c) => c.id === d.chargeId);
      const first = ch && st.charges.filter((c) => c.subId === ch.subId && c.status !== 'failed' && c.day <= ch.day).length === 1;
      if (first && chance(state, TRIAL_REMINDER.disputeCut)) st.disputes.splice(st.disputes.indexOf(d), 1); // never filed
    }
    // Merchant of record: it answers disputes itself.
    if (st.settings.merchantOfRecord) for (const d of st.disputes) if (d.status === 'needs_response' && !d.handledBy) { respondToDispute(state, d.id, 0.55); d.handledBy = 'mor'; }
    // MoR migration completes: settings flip, payouts move to the MoR schedule, some subscribers are lost.
    const mig = app.morMigration;
    if (mig && state.day >= mig.endDay) {
      st.settings.merchantOfRecord = mig.target;
      if (mig.target) { st.settings.morPayoutSchedule = mig.schedule; st.settings.morProvider = mig.provider ?? 'paddle'; } else delete st.settings.morPayoutSchedule;
      const loss = mig.loss ?? MOR_MIGRATION.loss;
      const rate = loss[0] + (loss[1] - loss[0]) * rng(state);
      let lost = 0;
      for (const x of st.subscriptions) if (isLive(x) && chance(state, rate)) { cancel(state, x.id, { atPeriodEnd: false, reason: 'billing_migration_failed' }); lost++; }
      app.morMigration = null;
      notify(state, `Billing migration ${mig.target ? 'to the merchant of record' : 'back to Stripe'} finished. ${lost} subscriber${lost === 1 ? '' : 's'} didn't re-enter a card and churned.`, { type: lost ? 'warn' : 'good', app: ID });
    }
    // The old global "retention offer" modifier is replaced by core/churn.js's reason-aware cancel flow. Older saves
    // that had it on keep a discount-only flow (no setup hours charged again).
    setModifier(state, 'churn', 'retention-offer', null);
    if (app.retention?.enabled && !app.retention.migrated) {
      const f = ensureChurn(state).flow;
      Object.assign(f, { enabled: true, setup: true, survey: false, offers: { pause: false, downgrade: false, discount: true }, discountPct: app.retention.pctOff, discountMonths: app.retention.months, sinceDay: state.day });
      app.retention.migrated = true;
    }
    // Dunning (retries, sequence, card updater) is modeled in core/stripe.js.
  },
  onMonthEnd(state) {
    // Bound the nudge map.
    const app = ensureApp(state);
    const keys = Object.keys(app.nudged);
    if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 1000)) delete app.nudged[k];
    const seen = Object.keys(app.dSeen);
    if (seen.length > 3000) for (const k of seen.slice(0, seen.length - 1500)) delete app.dSeen[k];
  },
};

