// Payments: a Stripe Dashboard clone over core/stripe.js. Home (volume, MRR, balance, payouts, failed payments),
// Payments, Customers (+ detail), Subscriptions (cancel / change price & quantity → MRR events), Invoices,
// Products & prices (grandfathering + an explicit, noticed migration), Billing settings (Smart Retries, dunning
// emails, merchant of record, Stripe Tax), Disputes (write evidence → judged → respondToDispute), Payouts, and
// Revenue recovery. Fees and thresholds: docs/research/finance-and-payments.md §1.

import { html, mount, on, modal, formData, stat, badge, barChart } from '../core/ui.js';
import { money, fmtDate, pct, clamp, words, round2, chance, rng } from '../core/util.js';
import { ensure, notify } from '../core/state.js';
import { ensureStripe, mrr, activeSubs, trialingSubs, monthlyAmount, cancel, changePrice, respondToDispute } from '../core/stripe.js';
import { ensureMarket, setModifier, churnBeforeRenewal } from '../core/market.js';
import { PAYMENTS } from '../core/params.js';
import { REALISM, averageField } from '../core/llm.js';
import { newThread, addMessage } from '../core/mail.js';
import { customerRegion, sumBy } from './money/common.js';
import { recoveryStats, disputeRate, classifiedEvents } from './money/metrics.js';
import { ensureBooks } from './money/ledger.js';
import { partialRefund, prorationAmount, chargeProration, createCoupon, applyCoupon, expireCoupons } from './money/payments.js';
import { EVIDENCE_SCHEMA, EVIDENCE_SYSTEM, MIN_EVIDENCE_WORDS, evidenceHeuristic, evidencePrompt, NOTICE_SCHEMA, noticeHeuristic, migrationChurnMultiplier } from './money/judge.js';
import { appCss, usd, short, statusBadge, tabs } from './money/ui.js';

const ID = 'stripe';
// Notice period for raising prices on existing subscribers. Most ToS and US state auto-renewal laws (e.g.
// California's) require clear advance notice of a material change; 30 days is the common standard. [design]
const MIN_NOTICE_DAYS = 30;
const CHURN_WINDOW_DAYS = 60; // migration churn spike lasts ~2 renewal cycles [design]
const DUNNING_CARD_UPDATE = 0.4; // share of expired-card customers who update their card after dunning emails [design]
// Trial-ending reminder emails: auto-converting trials without a reminder are the main B2C dispute driver
// (research §1.3). With reminders: half the first-charge disputes, ~5% fewer trial conversions (relative). [design]
const TRIAL_REMINDER = { disputeCut: 0.5, conversion: 0.95 };
// Cancellation flow with a retention offer (customer portal): vendors (Churnkey, ProsperStack) claim 20–30% of
// cancel attempts saved; the game uses 20% [vendor claims; design].
const RETENTION_SAVE = 0.2;
// Moving to/from a merchant of record: re-checkout or card-data migration over ~3 weeks; 5–10% of subscribers
// don't make it across [design, review M17]. MoRs pay out monthly or twice monthly (research §2.2).
const MOR_MIGRATION = { days: 21, loss: [0.05, 0.1] };

const ensureApp = (state) => {
  const a = ensure(state, 'stripe', () => ({ migrations: [], nudged: {} }));
  a.coupons ??= []; a.dSeen ??= {}; a.retention ??= { enabled: false, pctOff: 25, months: 3 };
  return a;
};
const ui = { cq: '', subStatus: 'all', payStatus: 'all', drafts: {}, notice: '' };
const cust = (s, id) => ensureStripe(s).customers.find((c) => c.id === id);
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
  return html`
    ${needs.length ? html`<div class="callout bad"><b>${needs.length} dispute${needs.length > 1 ? 's' : ''} need a response.</b> ${needs.map((d) => html`<a href="#/stripe/disputes/${d.id}">${usd(d.amount)} due ${short(s, d.dueDay)}</a> `)}</div>` : ''}
    ${dr.charges >= 20 && dr.rate >= PAYMENTS.excessiveDisputeRate ? html`<div class="callout bad">Dispute rate ${pct(dr.rate, 2)} is above Stripe's 0.75% excessive threshold. Expect reserves or account review.</div>` : ''}
    <div class="${ID}-kpis">
      ${stat('Gross volume (30d)', usd(v.gross), `${v.count} payments`)}
      ${stat('Net volume (30d)', usd(v.net), `after ${usd(v.fees)} fees, ${usd(v.refunds)} refunds, ${usd(v.disputes)} disputes`)}
      ${stat('MRR', usd(mrr(s)), `${activeSubs(s).length} subscribers · ${trialingSubs(s).length} trialing`)}
      ${stat('New customers (30d)', newCust)}
      ${stat('Failed payments (30d)', v.failed, `${usd(v.failedAmt)} · recovery ${rec.rate == null ? '—' : pct(rec.rate, 0)}`, v.failed ? 'warn' : '')}
      ${stat('Dispute rate (90d)', pct(dr.rate, 2), `${dr.disputes} of ${dr.charges} charges · limit 0.75%`, dr.rate >= 0.0075 && dr.charges >= 20 ? 'bad' : '')}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Gross volume · last 30 days</h2><canvas id="volChart" style="width:100%"></canvas></section>
      <section class="panel"><h2>Balance</h2>
        <div class="${ID}-row"><span>Incoming (pending)</span><span>${usd(pending)}</span></div>
        <div class="${ID}-row"><span>Available</span><span>${usd(st.available)}</span></div>
        <div class="${ID}-row"><span>In transit to Mercury</span><span>${usd(inTransit(st))}</span></div>
        <h3>Upcoming payouts</h3>
        ${Object.keys(upcoming).length ? Object.entries(upcoming).sort((a, b) => a[0] - b[0]).slice(0, 6).map(([d, a]) => html`<div class="${ID}-row"><span>Available ${short(s, +d)} → est. arrival ${short(s, +d + 1)}</span><span>${usd(a)}</span></div>`) : html`<p class="muted small">Nothing pending.</p>`}
        <p class="small muted">Funds settle T+2 business days; new accounts wait 7–14 days for the first payout (research §1.2). Payout schedule: ${st.settings.payoutSchedule}.</p>
      </section>
    </div>`;
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
  return html`<div class="table-wrap"><table><thead><tr><th class="r">Amount</th><th>Status</th><th>Customer</th><th>Number</th><th>Created</th><th class="r">Attempts</th></tr></thead><tbody>
    ${inv.map((i) => html`<tr><td class="r"><b>${usd(i.amount)}</b></td><td>${statusBadge(i.status)}</td><td>${cust(s, i.customerId)?.name ?? ''}</td><td class="small muted">${i.id.slice(-10).toUpperCase()}</td><td class="small">${fmtDate(s, i.day)}</td><td class="r">${i.attempts}</td></tr>`)}</tbody></table></div>`;
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
      ${app.migrations.map((x) => html`<tr><td>${planName(s, x.planId)}</td><td>${usd(x.oldPrice)} → ${usd(x.newPrice)}</td><td class="small">${fmtDate(s, x.noticeDay)}</td><td class="small">${fmtDate(s, x.effectiveDay)}</td><td class="r">${x.affected}</td><td class="small">×${x.multiplier} churn for ${CHURN_WINDOW_DAYS} days</td><td>${statusBadge(x.status === 'done' ? 'done' : x.status === 'active' ? 'active' : 'pending', x.status)}</td></tr>`)}</tbody></table></div></section>` : ''}`;
}

function settings(s) {
  const st = ensureStripe(s);
  st.settings.dunningEmails ??= true;
  const v = vol(s, 30);
  const ch = st.charges.filter((c) => c.day > s.day - 30 && c.status !== 'failed');
  const stripeFees = sumBy(ch, (c) => { const cu = cust(s, c.customerId); let p = PAYMENTS.cardPct + PAYMENTS.billingPct; if (cu?.country !== 'US') p += PAYMENTS.intlCardPct + PAYMENTS.fxPct; return c.amount * p + PAYMENTS.cardFixed; });
  const taxFees = v.gross * PAYMENTS.taxPct;
  const morFees = sumBy(ch, (c) => c.amount * PAYMENTS.morPct + PAYMENTS.morFixed);
  const b = ensureBooks(s);
  const toggle = (key, on2, title, body, hours) => html`<div class="${ID}-check"><span class="dot ${on2 ? 'ok' : ''}">${on2 ? '✓' : ''}</span><div><b>${title}</b><div class="small muted">${body}</div></div><div class="actions"><button class="sm ${on2 ? '' : 'primary'}" data-set="${key}" data-hours="${hours}">${on2 ? 'Turn off' : 'Turn on'}${hours >= 1 ? ` (${hours}h)` : ''}</button></div></div>`;
  return html`<section class="panel"><h2>Billing settings</h2>
    ${toggle('smartRetries', st.settings.smartRetries, 'Smart Retries', 'ML-timed retries over ~3 weeks. Stripe reports 55% of failed payments recovered across all its tools; retries alone 25–40% (research §1.4).', 0.1)}
    ${toggle('dunningEmails', st.settings.dunningEmails, 'Failed-payment & card-expiry emails', 'Emails customers a hosted link to update their card when a payment fails or a card is about to expire. Recovers expired cards the account updater misses.', 0.25)}
    ${toggle('stripeTax', st.settings.stripeTax, 'Stripe Tax', `Calculates and collects sales tax/VAT where you're registered: +0.5% per transaction (≈ ${usd(taxFees)}/30d at current volume). It monitors thresholds, but you still have to register in each state/country (research §4.3).`, 1)}
    ${toggle('trialReminders', Boolean(st.settings.trialReminders), 'Trial-ending reminder emails', 'Emails trial users ~3 days before the first charge. Auto-converting trials with no reminder are the main cause of consumer disputes ("I never agreed to pay"). Halves first-charge disputes; costs ~5% of trial conversions (relative). [design, research §1.3]', 0.25)}
    <div class="${ID}-check"><span class="dot ${app.retention.enabled ? 'ok' : ''}">${app.retention.enabled ? '✓' : ''}</span><div><b>Cancellation flow: retention offer</b><div class="small muted">Customer portal cancel flow asks why, then offers a discount. Vendors claim 20–30% of cancel attempts saved; saved customers pay less (contraction MRR). [vendor claims, design]</div>
      <form id="retForm" class="inline" style="margin-top:6px"><label>% off <input type="number" name="pctOff" min="5" max="90" value="${app.retention.pctOff}" /></label><label>Months <input type="number" name="months" min="1" max="12" value="${app.retention.months}" /></label><label><input type="checkbox" name="enabled" ${app.retention.enabled ? 'checked' : ''} /> On</label><button class="sm">Save (30 min)</button></form></div><div></div></div>
    <div class="${ID}-check"><span class="dot ${st.settings.merchantOfRecord ? 'ok' : ''}">${st.settings.merchantOfRecord ? '✓' : ''}</span><div><b>Merchant of record (Paddle-style, 5% + 50¢)</b>
      <div class="small muted">The MoR becomes the legal seller: it collects, files and remits sales tax and VAT worldwide and fights disputes for you. Payouts come monthly or twice monthly, net of tax. Indie founders choose it when selling B2C/prosumer into many countries (EU/UK VAT is due from the first consumer sale), when they're non-US or solo, and under ~$1–2M ARR. B2B founders invoicing US businesses usually stay on Stripe (research §1.6). Switching means a new checkout and moving every subscription: ~3 weeks, and 5–10% of subscribers don't make it across.</div>
      ${app.morMigration ? html`<div class="callout warn">Migration ${app.morMigration.target ? 'to the MoR' : 'back to Stripe'} in progress: completes ${fmtDate(s, app.morMigration.endDay)}.</div>` : html`<form id="morForm" class="inline" style="margin-top:6px">${st.settings.merchantOfRecord ? html`<span class="small">Payouts: ${st.settings.morPayoutSchedule ?? 'semimonthly'}</span><button class="sm">Move back to Stripe direct (12h)</button>` : html`<label>MoR payouts <select name="schedule"><option value="semimonthly">Twice monthly (1st & 15th)</option><option value="monthly">Monthly</option></select></label><button class="sm primary">Start migration to MoR (12h)</button>`}</form>`}
    </div><div></div></div>
  </section>
  <section class="panel"><h2>Cost at your last 30 days of volume (${usd(v.gross)})</h2>
    <div class="${ID}-row"><span>Stripe: 2.9% + 30¢ + 0.7% Billing (+1.5% intl, +1% FX)</span><span>${usd(stripeFees)} (${pct(v.gross ? stripeFees / v.gross : 0)})</span></div>
    <div class="${ID}-row"><span>+ Stripe Tax 0.5%</span><span>${usd(stripeFees + taxFees)} (${pct(v.gross ? (stripeFees + taxFees) / v.gross : 0)})</span></div>
    <div class="${ID}-row"><span>Merchant of record 5% + 50¢ (all-in, tax handled)</span><span>${usd(morFees)} (${pct(v.gross ? morFees / v.gross : 0)})</span></div>
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
    ${list.length ? html`<div class="table-wrap"><table><thead><tr><th class="r">Amount</th><th>Status</th><th>Reason</th><th>Customer</th><th>Opened</th><th>Respond by</th><th></th></tr></thead><tbody>
      ${list.map((d) => html`<tr><td class="r"><b>${usd(d.amount)}</b></td><td>${statusBadge(d.status)}</td><td>${d.reason.replace(/_/g, ' ')}</td><td>${cust(s, d.customerId)?.name ?? ''}</td><td class="small">${fmtDate(s, d.day)}</td>
        <td class="small ${d.status === 'needs_response' && d.dueDay - s.day <= 2 ? 'neg' : ''}">${d.status === 'needs_response' ? `${fmtDate(s, d.dueDay)} (${d.dueDay - s.day}d)` : d.status === 'under_review' ? `decision ~${short(s, d.decisionDay)}` : '—'}</td>
        <td>${d.status === 'needs_response' ? html`<a class="btn sm primary" href="#/stripe/disputes/${d.id}">Respond</a>` : d.evidence ? html`<a class="btn sm" href="#/stripe/disputes/${d.id}">View</a>` : ''}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No disputes. Keep it that way: recognizable descriptor, receipts, trial-ending reminders.</p>`}
  </section>`;
}

function disputeFacts(s, d) {
  const st = ensureStripe(s);
  const ch = st.charges.find((c) => c.id === d.chargeId);
  const c = cust(s, d.customerId);
  const sub = st.subscriptions.find((x) => x.id === ch?.subId);
  return {
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
  return html`<div class="${ID}-kpis">${stat('Incoming', usd(sumBy(st.pending, (p) => p.amount)))}${stat('Available', usd(st.available))}${stat('In transit', usd(inTransit(st)))}${stat('Paid out (120d)', usd(sumBy(st.payouts.filter((p) => p.status === 'paid'), (p) => p.amount)))}</div>
    <section class="panel"><h2>Payouts to Mercury ••4821</h2>
    ${list.length ? html`<div class="table-wrap"><table><thead><tr><th class="r">Amount</th><th>Status</th><th>Initiated</th><th>Arrives</th><th>Statement descriptor</th></tr></thead><tbody>
      ${list.map((p) => html`<tr><td class="r"><b>${usd(p.amount)}</b></td><td>${statusBadge(p.status)}</td><td class="small">${fmtDate(s, p.day)}</td><td class="small">${fmtDate(s, p.arrivalDay)}</td><td class="small"><code>STRIPE TRANSFER ${p.id.slice(-8).toUpperCase()}</code></td></tr>`)}</tbody></table></div>` : html`<p class="empty">No payouts yet.</p>`}
    <p class="small muted">A payout is net of fees, refunds and disputes, so it never equals your MRR or gross volume. Reconcile it in Books.</p></section>`;
}

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
      <section class="panel"><h2>Decline codes</h2>${Object.keys(codes).length ? Object.entries(codes).sort((a, b) => b[1] - a[1]).map(([k, n]) => html`<div class="${ID}-row"><span><code>${k}</code></span><span>${n}</span></div>`) : html`<p class="empty">No failed payments.</p>`}
        <p class="small muted">Benchmarks: Stripe recovers 55% of failed payments on average across tools; Smart Retries alone 25–40% (research §1.4). Smart Retries: <b>${st.settings.smartRetries ? 'on' : 'off'}</b> · dunning emails: <b>${st.settings.dunningEmails !== false ? 'on' : 'off'}</b> · <a href="#/stripe/settings">settings</a></p></section>
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
    body: html`<div class="grid-2"><label>Unit price (${x.interval === 'year' ? 'per year' : 'per month'}) <input type="number" name="price" min="0" step="0.01" value="${x.price}" /></label>
      <label>Quantity (seats) <input type="number" name="quantity" min="1" step="1" value="${x.quantity ?? 1}" /></label></div>
      <label><input type="checkbox" name="prorate" checked /> Invoice the proration now for upgrades</label>
      <p class="small muted" id="proration"></p>
      ${x.coupon ? html`<p>Coupon <code>${x.coupon.code}</code> (${x.coupon.pctOff}% off${x.coupon.endDay ? ` until ${fmtDate(s, x.coupon.endDay)}` : ', forever'}).</p>` : app.coupons.length ? html`<label>Apply coupon <select name="coupon"><option value="">None</option>${app.coupons.map((c) => html`<option value="${c.id}">${c.code} · ${c.pctOff}% off</option>`)}</select></label>` : ''}
      <p class="small muted">Current MRR ${usd(isLive(x) ? monthlyAmount(x) : 0)}. Increases are expansion MRR, decreases and coupons contraction (ChartMogul definitions). Upgrades mid-period are prorated: the difference for the unused days is invoiced now; downgrades take effect without a refund.</p>`,
    onOpen: (d, form) => {
      const upd = () => { const amt = prorationAmount(ctx.state, x, { price: Number(form.price.value), quantity: Math.round(Number(form.quantity.value)) }); d.querySelector('#proration').textContent = amt > 0 ? `Proration invoice now: ${usd(amt)} (${Math.max(0, x.currentPeriodEnd - ctx.state.day)} days left in the period).` : ''; };
      form.addEventListener('input', upd); upd();
    },
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: (d, form) => ctx.act((st) => {
      const f = formData(form);
      if (!(f.price >= 0) || !(f.quantity >= 1)) throw new Error('Enter a valid price and quantity.');
      const q = Math.round(f.quantity);
      const sub = st.stripe.subscriptions.find((y) => y.id === id);
      const pr = f.prorate ? prorationAmount(st, sub, { price: f.price, quantity: q }) : 0;
      if (Math.abs(f.price - sub.price) > 0.001 || q !== (sub.quantity ?? 1)) changePrice(st, id, { price: f.price, quantity: q });
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

function planModal(ctx, id) {
  const s = ctx.state;
  const p = s.plans.find((x) => x.id === id) ?? { id: null, name: '', price: s.plans[0]?.price ?? 49, interval: 'month', trialDays: s.plans[0]?.trialDays ?? 14, active: true };
  modal({
    title: id ? `Edit ${p.name}` : 'Add a price',
    body: html`<div class="grid-2"><label>Name <input name="name" value="${p.name}" required maxlength="40" placeholder="Pro (annual)" /></label>
      <label>Price (USD) <input type="number" name="price" min="0.5" step="0.01" value="${p.price}" required /></label>
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
        if (changed && live) ctx.toast(`New price applies to new subscriptions only. ${live} existing subscriber${live > 1 ? 's keep' : ' keeps'} the old price (grandfathered).`, 'info');
      } else st.plans.push({ id: `plan_${Date.now().toString(36)}`, name: f.name.trim(), price: round2(f.price), interval: f.interval, trialDays: Math.round(f.trialDays ?? 0), active: Boolean(f.active) });
      if (!st.plans.some((x) => x.active)) throw new Error('Keep at least one active price.');
    }, { hours: 0.25, label: 'Edit pricing' }) }],
  });
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
        const personas = st.company.model === 'b2c' ? ['a loyal subscriber who uses the app weekly', 'a price-sensitive subscriber who barely uses it'] : ['a small-business owner who relies on the product daily', 'an ops manager who has to justify every tool in the budget'];
        const results = [];
        for (const persona of personas) {
          const res = await ctx.llm.panel({
            task: 'price_increase_notice',
            system: `${REALISM}\nYou are ${persona}, a current customer of ${st.company.name} (${st.company.oneLiner || 'a SaaS product'}). The year is 2026.`,
            prompt: `You pay ${usd(oldPrice)} per ${p.interval}. You just received this email about a price change to ${usd(p.price)} effective in ${notice} days.\n\n=== EMAIL ===\n${f.email.slice(0, 4000)}\n=== END ===\nReact honestly.`,
            schema: NOTICE_SCHEMA,
            fallback: () => noticeHeuristic(f.email, { oldPrice, newPrice: p.price, noticeDays: notice }),
            cache: st.cache,
          });
          results.push(...res.map((r) => ({ persona, model: r.model, mock: r.mock, ...r.data })));
        }
        const risk = clamp(averageField(results.map((r) => ({ data: r })), 'churnRisk') ?? 0.2, 0, 1);
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

async function submitEvidence(ctx, id) {
  const s = ctx.state;
  const d = ensureStripe(s).disputes.find((x) => x.id === id);
  const text = ui.drafts[id] ?? '';
  if (words(text) < MIN_EVIDENCE_WORDS) { ctx.toast(`Write at least ${MIN_EVIDENCE_WORDS} words of evidence.`, 'warn'); return; }
  const facts = disputeFacts(s, d);
  await ctx.act(async (st) => {
    const res = await ctx.llm.panel({ task: 'dispute_evidence', system: EVIDENCE_SYSTEM, prompt: evidencePrompt(text, facts), schema: EVIDENCE_SCHEMA, temperature: 0.3, fallback: () => evidenceHeuristic(text, facts), cache: st.cache });
    const quality = clamp(averageField(res, 'quality') ?? 0.3, 0, 1);
    const dd = st.stripe.disputes.find((x) => x.id === id);
    if (dd.status !== 'needs_response') throw new Error('This dispute can no longer be countered.');
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
    const body = { payments, customers, subscriptions, products, settings, disputes, payouts, recovery }[view]?.(s, arg) ?? (view === 'invoices' ? html`<section class="panel">${invTable(s, st.invoices.slice().reverse().slice(0, 300))}</section>` : home(s));
    mount(root, html`${appCss(ID)}
      <div class="app-head"><div><h1>Stripe <span class="badge">Live mode</span></h1><p>Payments, subscriptions and payouts for ${s.company.name}. ${st.settings.merchantOfRecord ? 'Merchant of record: on (5% + 50¢ all-in).' : ''}</p></div></div>
      ${tabs(ID, [{ id: 'home', label: 'Home' }, { id: 'payments', label: 'Payments' }, { id: 'customers', label: 'Customers' }, { id: 'subscriptions', label: 'Subscriptions' }, { id: 'invoices', label: 'Invoices' }, { id: 'products', label: 'Products' }, { id: 'disputes', label: 'Disputes', count: needs, tone: 'bad' }, { id: 'payouts', label: 'Payouts' }, { id: 'recovery', label: 'Revenue recovery' }, { id: 'settings', label: 'Billing settings' }], view)}
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
    on(root, 'click', '[data-act=newplan]', () => planModal(ctx, null));
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
    on(root, 'submit', '#couponForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st2) => { createCoupon(ensureApp(st2), f); }, { hours: 0.1, label: 'Create coupon' }); });
    on(root, 'submit', '#retForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st2) => { Object.assign(ensureApp(st2).retention, { enabled: Boolean(f.enabled), pctOff: Math.min(90, Math.max(5, f.pctOff ?? 25)), months: Math.min(12, Math.max(1, Math.round(f.months ?? 3))) }); }, { hours: 0.5, label: 'Cancellation flow' }); });
    on(root, 'submit', '#morForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st2) => {
        const a = ensureApp(st2);
        const target = !ensureStripe(st2).settings.merchantOfRecord;
        a.morMigration = { target, schedule: f.schedule ?? 'semimonthly', startDay: st2.day, endDay: st2.day + MOR_MIGRATION.days };
        notify(st2, `Started moving billing ${target ? 'to a merchant of record' : 'back to Stripe'}. New checkout now; existing subscriptions move over the next 3 weeks.`, { type: 'info', app: ID });
      }, { hours: 12, label: 'Billing migration' });
    });
    on(root, 'click', '#acceptDispute', () => ctx.act((st2) => {
      const d = st2.stripe.disputes.find((x) => x.id === arg);
      if (d?.status === 'needs_response') { d.status = 'lost'; d.accepted = true; }
    }, { hours: 0.05, label: 'Accept dispute' }));
  },
  onDay(state) {
    const st = ensureStripe(state);
    const app = ensureApp(state);
    st.settings.dunningEmails ??= true;
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
      if (mig.target) st.settings.morPayoutSchedule = mig.schedule; else delete st.settings.morPayoutSchedule;
      const rate = MOR_MIGRATION.loss[0] + (MOR_MIGRATION.loss[1] - MOR_MIGRATION.loss[0]) * rng(state);
      let lost = 0;
      for (const x of st.subscriptions) if (isLive(x) && chance(state, rate)) { cancel(state, x.id, { atPeriodEnd: false, reason: 'billing_migration_failed' }); lost++; }
      app.morMigration = null;
      notify(state, `Billing migration ${mig.target ? 'to the merchant of record' : 'back to Stripe'} finished. ${lost} subscriber${lost === 1 ? '' : 's'} didn't re-enter a card and churned.`, { type: lost ? 'warn' : 'good', app: ID });
    }
    // Retention offer in the cancel flow: some would-be cancellers accept a discount instead.
    const ret = app.retention;
    setModifier(state, 'churn', 'retention-offer', ret.enabled ? 1 - RETENTION_SAVE : null);
    if (ret.enabled) {
      let co = app.coupons.find((c) => c.code === `SAVE${ret.pctOff}-${ret.months}M`);
      for (const x of st.subscriptions) {
        if (x.status !== 'active' || x.cancelAtPeriodEnd || x.coupon || x.currentPeriodEnd !== state.day + 1) continue;
        const q = (churnBeforeRenewal(state, x) * RETENTION_SAVE) / (1 - RETENTION_SAVE);
        if (!chance(state, q)) continue;
        co ??= createCoupon(app, { code: `SAVE${ret.pctOff}-${ret.months}M`, pctOff: ret.pctOff, duration: 'repeating', months: ret.months });
        applyCoupon(state, app, x, co.id);
      }
    }
    // Dunning emails: some customers with an expired card update it before the next retry. [design]
    if (st.settings.dunningEmails) {
      for (const x of st.subscriptions) {
        if (x.status !== 'past_due' || !x.retry) continue;
        const key = `${x.id}:${x.currentPeriodStart}`;
        if (app.nudged[key]) continue;
        app.nudged[key] = true;
        const c = cust(state, x.customerId);
        if (c && c.card.expiresDay < state.day && rngChance(state)) c.card.expiresDay = state.day + 1095;
      }
    }
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

const rngChance = (state) => chance(state, DUNNING_CARD_UPDATE);
