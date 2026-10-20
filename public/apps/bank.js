// Bank: a Mercury-style business bank. Accounts & balances, a searchable transaction ledger with statement
// descriptors and running balances, a transaction drawer, Send money (ACH / domestic wire) to payees, Add personal
// funds (owner contribution or founder loan via core/personal.js), card spend by vendor, a recurring-bills manager
// with a catalog of real 2026 tools (declined / suspended bills and reactivation), Mercury Treasury (auto-sweep,
// tiered yield) and a runway widget that includes scheduled company debt service (core/debt.js). Before
// incorporation the operating account is the founder's personal checking (core/bank.js isPreIncorporationAccount).
// Numbers: docs/research/finance-and-payments.md §2 (banking), §2.3 (tool prices), §5.2 (runway).
// Cards & spend, receipts and the SaaS-stack audit (Ramp/Brex style) live in money/spend.js; the 13-week
// forecast, scenarios and runway triggers in money/forecast.js; Mercury auto-transfer rules in money/treasury.js.

import { html, mount, on, modal, formData, download, stat, badge, lineChart } from '../core/ui.js';
import { money, fmtDate, isoDate, toCsv, dayOfMonth, round2, isWeekend, uid, hash } from '../core/util.js';
import { activeSubs } from '../core/stripe.js';
import { post, addRecurring, reactivateRecurring, isPreIncorporationAccount, balance } from '../core/bank.js';
import { monthlyDebtService, businessDebtBalance, activeBusinessLoans } from '../core/debt.js';
import { ensure } from '../core/state.js';
import { contributeToCompany, ensurePersonal } from '../core/personal.js';
import { catLabel, descriptorFor, totalCash, trailingBurn, runwayWithDebt, monthOf, monthLabel, dayForIso, sumBy, monthEndDay, monthStartDay } from './money/common.js';
import { TOOL_CATALOG, TREASURY, treasuryApy } from './money/catalog.js';
import { bookCategory, categorize, isReviewed, isLocked, CATEGORY_CHOICES } from './money/ledger.js';
import { appCss, usd, signed, tabs, statusBadge } from './money/ui.js';
import { ensureSpend, spendDay, authorizeCard, missingReceipts, pendingRequests, openTrials } from './money/spend.js';
import { forecastDay, ensureForecast, forecastStats, livePlayerRunway } from './money/forecast.js';
import { ensureTreasury, transferTreasury, settleTransfers, treasuryRuleDay, treasuryWatch, redemptionAllowed, inTransitTotal, RULES } from './money/treasury.js';
import { cardsView, receiptsView, stackView, wireSpend } from './money/view-spend.js';
import { forecastView, drawForecast, wireForecast } from './money/view-forecast.js';
import { perksView, wirePerks } from './aicost/views.js';
import './aicost/index.js'; // credit-offset hook + readers
import { backofficeDay, bank as bankVendor, bankLabel } from './money/backoffice.js';
import { backofficeView, wireBackoffice } from './money/view-backoffice.js';

const ID = 'bank';
// Usage-based hosting (bandwidth, functions, database) per active paying customer per month (review M22:
// Vercel/Supabase usage pricing; B2C $0.02–0.10, SMB $0.30–1.00 per account; enterprise per account [design]).
const HOSTING_PER_CUSTOMER = { b2c: 0.06, smb: 0.65, ent: 3 };
const ensureBank = (state) => {
  const b = ensure(state, 'bank', () => ({ payees: [], notes: {}, treasury: { enabled: false, target: TREASURY.defaultOperatingTarget }, canceled: [] }));
  b.payees ??= []; b.notes ??= {}; b.canceled ??= []; b.inTransit ??= [];
  b.treasury ??= { enabled: false, target: TREASURY.defaultOperatingTarget };
  return b;
};
const treasuryAcct = (state) => state.bank.accounts.find((a) => a.id === 'treasury');
const acctName = (state, id) => state.bank.accounts.find((a) => a.id === id)?.name ?? (id === 'treasury' ? 'Treasury' : 'Checking');
const bankTitle = (state) => (isPreIncorporationAccount(state) ? 'Personal checking' : bankLabel(state));
const ui = { q: '', cat: '', method: '', acct: '', dir: '', from: '', to: '', limit: 150, cardMonth: null };

function filtered(state) {
  const q = ui.q.trim().toLowerCase();
  const from = ui.from ? dayForIso(state, ui.from) : -Infinity;
  const to = ui.to ? dayForIso(state, ui.to) : Infinity;
  return state.bank.txns.filter((t) => {
    if (t.day < from || t.day > to) return false;
    if (ui.method && t.method !== ui.method) return false;
    if (ui.acct && t.accountId !== ui.acct) return false;
    if (ui.dir === 'in' && t.amount <= 0) return false;
    if (ui.dir === 'out' && t.amount >= 0) return false;
    if (ui.cat && bookCategory(state, t) !== ui.cat) return false;
    if (q && !`${t.counterparty} ${t.description} ${descriptorFor(t)} ${Math.abs(t.amount)}`.toLowerCase().includes(q)) return false;
    return true;
  }).reverse();
}

// Company-paid health insurance replaces the premium inside the founder's personal living costs (no double count).
function healthOffset(state, r, on2) {
  if (!r.personalOffset) return;
  const p = ensurePersonal(state);
  p.monthlyLivingCosts = Math.max(0, round2(p.monthlyLivingCosts + (on2 ? -r.personalOffset : r.personalOffset)));
}

// Cancel a recurring bill. A company-paid health plan moves its premium back into personal living costs unless a
// manual pause or a vendor suspension already did: active and card-held bills still carry the offset.
export function cancelBill(state, id) {
  const i = state.recurring.findIndex((x) => x.id === id);
  if (i < 0) throw new Error('Bill not found.');
  const [r] = state.recurring.splice(i, 1);
  if (r.active || r.cardHold || (r.suspended && !r.offsetSuspended)) healthOffset(state, r, false);
  ensureBank(state).canceled.push({ vendor: r.vendor, amount: r.amount, day: state.day });
  return r;
}

// ---------- views ----------

function overview(s) {
  const cash = totalCash(s);
  const { months, partial } = trailingBurn(s, 3);
  const rw = runwayWithDebt(s);
  const { burn, runway } = rw;
  const debtBal = businessDebtBalance(s);
  const pre = isPreIncorporationAccount(s);
  const declines = (s.bank.declines ?? []).filter((d) => d.day > s.day - 14);
  const suspended = s.recurring.filter((r) => r.suspended);
  const last30 = s.bank.txns.filter((t) => t.day > s.day - 30 && t.category !== 'transfer');
  const moneyIn = sumBy(last30.filter((t) => t.amount > 0), (t) => t.amount);
  const moneyOut = -sumBy(last30.filter((t) => t.amount < 0), (t) => t.amount);
  const p = ensurePersonal(s);
  const tr = treasuryAcct(s);
  return html`
    ${pre ? html`<div class="callout warn"><b>Pre-incorporation:</b> the business is running through your <b>personal</b> checking account. Mercury (like most business banks) needs a registered LLC or C-corp and an EIN; incorporate in Legal and the business account opens 1–3 business days after the EIN arrives. Until then keep business money clearly separated in the books: commingling makes the first year's taxes and any later diligence harder.</div>` : ''}
    ${suspended.length ? html`<div class="callout bad"><b>${suspended.map((r) => r.vendor).join(', ')} suspended</b> your account after repeated declined payments.${suspended.some((r) => r.category === 'hosting') ? ' Your product is down for customers.' : ''} <a href="#/bank/bills">Add funds and reactivate →</a></div>` : declines.length ? html`<div class="callout warn">${declines.length} card payment${declines.length === 1 ? ' was' : 's were'} declined in the last 2 weeks (no overdraft on this account): ${[...new Set(declines.map((d) => d.vendor))].join(', ')}. <a href="#/bank/bills">Recurring bills →</a></div>` : ''}
    <div class="grid-2">
      <section class="panel">
        <div class="small muted">Total balance</div>
        <div class="${ID}-big">${usd(cash)}</div>
        <div class="small muted">Money in ${money(moneyIn)} · Money out ${money(moneyOut)} (last 30 days)</div>
        <canvas id="balChart" style="width:100%;margin-top:8px"></canvas>
        <h3>Accounts</h3>
        ${s.bank.accounts.map((a) => html`<div class="${ID}-row"><span>${a.name}${a.id === 'treasury' ? html` <span class="badge accent">${(treasuryApy(a.balance) * 100).toFixed(2)}% net yield</span>` : html` <span class="badge">0% APY</span>`}</span><span><b>${usd(a.balance)}</b></span></div>`)}
        ${inTransitTotal(s) ? html`<div class="${ID}-row"><span>Treasury redemption in transit (T+1)</span><span>${usd(inTransitTotal(s))}</span></div>` : ''}
        <div class="small muted" style="margin-top:6px">${pre ? 'A personal account: standard $250K FDIC coverage, no business tools, and every business transaction is mixed with your own spending.' : `${bankLabel(s)}: ${bankVendor(s).status} ${(s.apps.backoffice?.bank ?? 'mercury') === 'mercury' ?'Deposits sweep across partner banks for up to $5M FDIC coverage (research §2.1).' : ''}`}</div>
      </section>
      <section class="panel">
        <h2>Runway</h2>
        <div class="${ID}-kpis">
          ${stat('Cash (checking + treasury)', money(cash))}
          ${stat('Net burn / month', burn > 0 ? money(burn) : 'Cash-flow positive', `${partial ? 'this month so far, annualized to 30 days' : `trailing ${months}-month average`}${rw.debtService ? `, incl. ${money(rw.debtService)} scheduled debt service` : ''}`, burn > 0 ? '' : 'good')}
          ${stat('Runway', runway === Infinity ? '∞' : `${runway.toFixed(1)} mo`, runway === Infinity ? 'default alive at current burn' : `out of cash ≈ ${fmtDate(s, s.day + Math.round(runway * 30.4))}`, runway < 6 ? 'bad' : runway < 12 ? 'warn' : 'good')}
          ${debtBal > 0 || rw.debtService > 0 ? stat('Debt service / month', money(rw.debtService), `${money(debtBal)} company debt outstanding · ${activeBusinessLoans(s).length} loan${activeBusinessLoans(s).length === 1 ? '' : 's'}`, rw.debtService > Math.max(0, -burn + rw.debtService) * 0.5 && burn > 0 ? 'warn' : '') : ''}
        </div>
        ${forecastCallout(s)}
        <p class="small muted">Runway = cash ÷ monthly net burn (research §5.2). Burn is the average of the last 3 complete months, excluding money raised (owner contributions, investment, loan proceeds) and internal transfers, with past loan payments replaced by the debt service now scheduled (amortized payments, card minimums, revenue-share repayments at today's MRR). Stripe Capital withholdings already show up as smaller Stripe payouts.</p>
        <h3>Personal funds</h3>
        <div class="${ID}-row"><span>Your personal savings</span><span><b>${usd(p.liquidSavings)}</b></span></div>
        <div class="app-actions" style="margin-top:8px"><button class="primary" data-act="send">Send money</button><button data-act="fund">Add personal funds</button><button data-act="export">Export statement (CSV)</button></div>
      </section>
    </div>
    <section class="panel"><h2>Recent transactions <a class="small" href="#/bank/transactions">View all →</a></h2>${txnTable(s, s.bank.txns.slice(-8).reverse(), false)}</section>
    ${tr || !bankVendor(s).treasury ? '' : s.bank.accounts.length && cash >= TREASURY.minimum ? html`<div class="callout">You qualify for ${bankLabel(s)} Treasury (≥ $250K). Idle cash at 0% is lost runway: <a href="#/bank/treasury">open Treasury</a>.</div>` : ''}`;
}

function txnTable(s, rows, withBalance = true) {
  if (!rows.length) return html`<p class="empty">No transactions match.</p>`;
  return html`<div class="table-wrap"><table class="${ID}-tbl"><thead><tr><th>Date</th><th>To / From</th><th>Account</th><th>Method</th><th>Category</th><th class="r">Amount</th>${withBalance ? html`<th class="r">Balance</th>` : ''}</tr></thead><tbody>
    ${rows.map((t) => html`<tr class="clickable" data-txn="${t.id}">
      <td>${fmtDate(s, t.day)}</td>
      <td><div>${t.counterparty}</div><div class="${ID}-sub">${descriptorFor(t)}</div></td>
      <td class="small">${t.accountId === 'treasury' ? 'Treasury' : isPreIncorporationAccount(s) ? 'Personal' : 'Checking'}</td>
      <td class="small">${{ ach: 'ACH', wire: 'Wire', card: 'Card', stripe: 'Stripe', payroll: 'Payroll', internal: 'Transfer' }[t.method] ?? t.method}</td>
      <td class="small">${catLabel(bookCategory(s, t))}${isReviewed(s, t) ? '' : html` <span class="badge warn" title="Not yet reviewed in Books">?</span>`}</td>
      <td class="r ${ID}-amt ${t.amount > 0 ? `${ID}-in` : ''}">${signed(t.amount)}</td>
      ${withBalance ? html`<td class="r ${ID}-amt muted">${usd(t.balanceAfter)}</td>` : ''}
    </tr>`)}</tbody></table></div>`;
}

function transactions(s, openId) {
  const rows = filtered(s);
  const shown = rows.slice(0, ui.limit);
  const cats = [...new Set(s.bank.txns.map((t) => bookCategory(s, t)))].sort();
  const t = openId && s.bank.txns.find((x) => x.id === openId);
  return html`
    <section class="panel">
      <form class="${ID}-filters" id="filters" onsubmit="return false">
        <label>Search <input id="f-q" name="q" value="${ui.q}" placeholder="Vendor, descriptor, amount" /></label>
        <label>Category <select name="cat"><option value="">All</option>${cats.map((c) => html`<option value="${c}" ${ui.cat === c ? 'selected' : ''}>${catLabel(c)}</option>`)}</select></label>
        <label>Method <select name="method"><option value="">All</option>${['ach', 'wire', 'card', 'internal'].map((m) => html`<option value="${m}" ${ui.method === m ? 'selected' : ''}>${m.toUpperCase()}</option>`)}</select></label>
        <label>Account <select name="acct"><option value="">All</option>${s.bank.accounts.map((a) => html`<option value="${a.id}" ${ui.acct === a.id ? 'selected' : ''}>${a.name}</option>`)}</select></label>
        <label>Direction <select name="dir"><option value="">In & out</option><option value="in" ${ui.dir === 'in' ? 'selected' : ''}>Money in</option><option value="out" ${ui.dir === 'out' ? 'selected' : ''}>Money out</option></select></label>
        <label>From <input type="date" name="from" value="${ui.from}" /></label>
        <label>To <input type="date" name="to" value="${ui.to}" /></label>
      </form>
      <div class="inline small muted" style="justify-content:space-between;margin-bottom:6px"><span>${rows.length} transactions · in ${usd(sumBy(rows.filter((x) => x.amount > 0), (x) => x.amount))} · out ${usd(sumBy(rows.filter((x) => x.amount < 0), (x) => x.amount))}</span>
        <span class="app-actions"><button class="sm" data-act="clear">Clear filters</button><button class="sm" data-act="export">Export CSV</button></span></div>
      ${txnTable(s, shown)}
      ${rows.length > shown.length ? html`<button data-act="more" style="margin-top:8px">Show more (${rows.length - shown.length})</button>` : ''}
    </section>
    ${t ? drawer(s, t) : ''}`;
}

function drawer(s, t) {
  const cat = bookCategory(s, t);
  const locked = isLocked(s, t.day);
  const auto = ['stripe_payout', 'transfer'].includes(t.category);
  const note = ensureBank(s).notes[t.id] ?? t.meta?.memo ?? '';
  return html`<aside class="${ID}-drawer" aria-label="Transaction details">
    <h2><span>${t.amount > 0 ? 'Money in' : 'Money out'}</span><a href="#/bank/transactions" class="btn sm">✕</a></h2>
    <div class="${ID}-big ${t.amount > 0 ? `${ID}-in` : ''}">${signed(t.amount)}</div>
    <p class="muted">${t.counterparty} · ${fmtDate(s, t.day)}</p>
    <div class="${ID}-row"><span>Status</span><span>${statusBadge('done', t.method === 'ach' && t.amount < 0 && s.day - t.day < 2 ? 'Sent · arrives 1–2 business days' : 'Posted')}</span></div>
    <div class="${ID}-row"><span>Statement descriptor</span><span><code>${descriptorFor(t)}</code></span></div>
    <div class="${ID}-row"><span>Method</span><span>${t.method.toUpperCase()}</span></div>
    <div class="${ID}-row"><span>Account</span><span>${acctName(s, t.accountId)}</span></div>
    <div class="${ID}-row"><span>Balance after</span><span>${usd(t.balanceAfter)}</span></div>
    <div class="${ID}-row"><span>Transaction ID</span><span class="small muted">${t.id}</span></div>
    <h3>Category</h3>
    ${auto ? html`<p class="small muted">${catLabel(cat)}: matched automatically by a bank rule.</p>` : html`
      <form id="catForm" class="inline"><label>Category <select name="cat" ${locked ? 'disabled' : ''}>${CATEGORY_CHOICES.map((c) => html`<option value="${c}" ${c === cat ? 'selected' : ''}>${catLabel(c)}</option>`)}</select></label>
      <button ${locked ? 'disabled' : ''}>Save</button></form>
      <label class="small"><input type="checkbox" form="catForm" name="rule" /> Always categorize ${t.counterparty} this way</label>
      <p class="small muted">${locked ? `${monthOf(s, t.day)} is closed in Books, so its categories are locked.` : isReviewed(s, t) ? 'Reviewed. Syncs to Books.' : 'Suggested by the AI categorizer. Not reviewed yet: confirm it here or in Books → Bank feed.'}</p>`}
    <h3>Note</h3>
    <form id="noteForm"><textarea name="note" rows="3" placeholder="What was this for? (helps your bookkeeper and your future self)">${note}</textarea><button>Save note</button></form>
  </aside>`;
}

function sendMoney(s) {
  const b = ensureBank(s);
  return html`<section class="panel">
      <h2>Payees</h2>
      ${b.payees.length ? html`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Default method</th><th>Account</th><th>W-9</th><th class="r">Paid (all time)</th><th></th></tr></thead><tbody>
        ${b.payees.map((p) => html`<tr><td>${p.name}<div class="${ID}-sub">${p.email}</div></td><td>${p.type}</td><td>${p.method.toUpperCase()}</td><td>••${p.last4}</td>
        <td>${p.type === 'contractor' ? (p.w9 ? badge('On file', 'good') : html`<button class="sm" data-w9="${p.id}">Request W-9</button>`) : '—'}</td>
        <td class="r">${usd(-sumBy(s.bank.txns.filter((t) => t.meta?.payeeId === p.id), (t) => t.amount))}</td>
        <td><button class="sm primary" data-pay="${p.id}">Pay</button></td></tr>`)}</tbody></table></div>` : html`<p class="empty">No payees yet. Add the contractor or vendor you need to pay.</p>`}
      <div class="app-actions" style="margin-top:10px"><button class="primary" data-act="send">Send money</button><button data-act="payee">Add payee</button></div>
      <p class="small muted">ACH is free and arrives in 1–2 business days. Domestic wires are free at Mercury and arrive same day but cannot be reversed (most banks charge $15–$30; research §2.2). Collect a W-9 from every US contractor before the first payment: you'll need it for 1099-NEC (≥ $2,000 paid in 2026+).</p>
    </section>`;
}

function statements(s) {
  const months = [...new Set(s.bank.txns.map((t) => monthOf(s, t.day)))].sort().reverse();
  return html`<section class="panel"><h2>Monthly statements</h2>
    ${months.length ? html`<div class="table-wrap"><table><thead><tr><th>Statement</th><th>Account</th><th class="r">Opening</th><th class="r">Money in</th><th class="r">Money out</th><th class="r">Ending balance</th><th></th></tr></thead><tbody>
      ${months.flatMap((m) => s.bank.accounts.map((a) => {
        const from = monthStartDay(s, m), to = monthEndDay(s, m);
        const tx = s.bank.txns.filter((t) => t.accountId === a.id && t.day >= from && t.day <= to);
        const before = s.bank.txns.filter((t) => t.accountId === a.id && t.day < from).at(-1)?.balanceAfter ?? 0;
        const end = tx.at(-1)?.balanceAfter ?? before;
        return html`<tr><td>${monthLabel(m)}${m === monthOf(s) ? html` <span class="badge">to date</span>` : ''}</td><td>${a.name}</td><td class="r">${usd(before)}</td><td class="r ${ID}-in">${usd(sumBy(tx.filter((t) => t.amount > 0), (t) => t.amount))}</td><td class="r">${usd(sumBy(tx.filter((t) => t.amount < 0), (t) => t.amount))}</td><td class="r"><b>${usd(end)}</b></td><td><button class="sm" data-stmt="${m}|${a.id}">CSV</button></td></tr>`;
      }))}</tbody></table></div>` : html`<p class="empty">No statements yet.</p>`}
    <p class="small muted">Your bookkeeper reconciles the ledger to these ending balances every month (Books → Month-end close).</p></section>`;
}

function bills(s) {
  const rec = s.recurring;
  const active = rec.filter((r) => r.active);
  const monthly = sumBy(active.filter((r) => !r.variable), (r) => r.amount) + sumBy(rec.filter((r) => r.annual && r.active), (r) => r.annual.amount / 12);
  const groups = [...new Set(TOOL_CATALOG.map((t) => t.group))];
  return html`
    <section class="panel">
      <h2>Recurring bills <span class="badge">${money(monthly)}/mo · ${money(monthly * 12)}/yr</span></h2>
      ${rec.length ? html`<div class="table-wrap"><table><thead><tr><th>Vendor</th><th>Category</th><th>Charged on</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>
        ${rec.map((r) => html`<tr><td>${r.vendor}<div class="${ID}-sub">${r.note || ''}</div></td><td class="small">${catLabel(r.category)}</td><td>${r.annual ? html`annual · renews ${fmtDate(s, r.annual.renewDay)}` : r.variable ? 'usage-based' : `day ${r.dayOfMonth}`}</td><td class="r">${r.annual ? html`${usd(r.annual.amount)}/yr` : r.variable ? 'varies' : usd(r.amount)}</td>
        <td>${r.cardHold ? html`${badge('Card declined', 'bad')}<div class="${ID}-sub">${r.cardHold}</div>` : r.suspended ? badge(`Suspended (${r.declines ?? 0} declines)`, 'bad') : r.active && r.retryDay != null ? html`${badge('Declined', 'warn')}<div class="${ID}-sub">retry ${fmtDate(s, r.retryDay)}</div>` : r.active ? badge('Active', 'good') : badge('Paused', 'warn')}</td>
        <td class="r" style="white-space:nowrap">${r.usage ? html`<span class="small muted">scales with customers</span>` : r.suspended ? html`<button class="sm primary" data-reactivate="${r.id}">Pay ${usd(r.amount)} & reactivate</button> <button class="sm danger" data-cancel="${r.id}">Cancel</button>` : html`<button class="sm" data-toggle="${r.id}">${r.active ? 'Pause' : 'Resume'}</button> <button class="sm danger" data-cancel="${r.id}">Cancel</button>`}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No recurring bills.</p>`}
      <p class="small muted">${isPreIncorporationAccount(s) ? 'Personal' : 'Mercury'} checking has no overdraft: a bill that checking can't cover is declined, the vendor retries a few days later, and after repeated declines it suspends your account. A suspended hosting provider takes your product down.</p>
      <p class="small muted">Every tool is a monthly fixed cost against your runway. Typical solo stack 2026: AI coding $20–$400, hosting $20–$300, Workspace $7–$22/user, email/auth/monitoring $0–$150 (research §2.3). Hosting, email delivery and AI APIs used by customers are cost of revenue in Books; your own tools are operating expenses.</p>
      ${ensureBank(s).canceled.length ? html`<details><summary class="small">Canceled (${ensureBank(s).canceled.length})</summary><ul class="list small">${ensureBank(s).canceled.slice(-20).reverse().map((c) => html`<li>${c.vendor} · ${usd(c.amount)}/mo · canceled ${fmtDate(s, c.day)}</li>`)}</ul></details>` : ''}
    </section>
    <section class="panel">
      <h2>Add a tool</h2>
      <p class="small muted">Real 2026 list prices, billed monthly (per seat where noted). Verify on the vendor's page; prices change.</p>
      ${groups.map((g) => html`<h3>${g}</h3><div class="table-wrap"><table><tbody>${TOOL_CATALOG.filter((t) => t.group === g).map((t) => html`<tr><td><b>${t.vendor}</b> <span class="muted">${t.plan}</span><div class="${ID}-sub">${t.source}</div></td><td class="small">${catLabel(t.category)}</td><td class="r">${usd(t.amount)}/mo</td><td class="r"><button class="sm" data-add="${t.id}" ${rec.some((r) => r.catalogId === t.id && r.active) ? 'disabled' : ''}>${rec.some((r) => r.catalogId === t.id && r.active) ? 'Subscribed' : 'Subscribe'}</button></td></tr>`)}</tbody></table></div>`)}
      <h3>Other vendor</h3>
      <form id="customBill" class="inline"><label>Vendor <input name="vendor" required maxlength="40" /></label><label>Monthly amount <input type="number" name="amount" min="1" step="0.01" required /></label>
        <label>Category <select name="category">${['software', 'hosting', 'ai_inference', 'marketing', 'legal', 'accounting', 'other'].map((c) => html`<option value="${c}">${catLabel(c)}</option>`)}</select></label><button>Add bill</button></form>
    </section>`;
}

function forecastCallout(s) {
  const f = s.apps.bank?.forecast;
  const st = forecastStats(s);
  const fired = (f?.triggers ?? []).filter((t) => t.status === 'fired');
  if (fired.length) return html`<div class="callout warn">Trigger fired: ${fired.map((t) => t.kind.replace('_', ' ')).join(', ')}. <a href="#/bank/forecast">Forecast →</a></div>`;
  if (!st.snapshots) return html`<p class="small"><a href="#/bank/forecast">Build a 13-week forecast →</a> <span class="muted">This number extends last quarter; payroll dates, annual renewals and tax dates move the real cash-out date.</span></p>`;
  const last = f.snapshots.at(-1);
  const live = livePlayerRunway(s);
  return html`<p class="small">Your forecast (${fmtDate(s, last.day)}): ${Number.isFinite(live.months) ? `${live.months.toFixed(1)} months` : 'default alive'} of runway. <a href="#/bank/forecast">Forecast →</a></p>`;
}

function treasury(s) {
  const cash = totalCash(s);
  const tr = treasuryAcct(s);
  if (isPreIncorporationAccount(s)) return html`<section class="panel"><h2>Mercury Treasury</h2><div class="callout warn">Treasury is a Mercury business product. Incorporate first (Legal); your business account opens once the EIN arrives.</div></section>`;
  const eligible = cash >= TREASURY.minimum || tr;
  const rule = ensureTreasury(s);
  const apy = treasuryApy(tr?.balance ?? Math.max(0, cash - rule.max));
  const idle = Math.max(0, cash - rule.max);
  const allowed = redemptionAllowed(s);
  const skips = rule.skips.filter((x) => x.day > s.day - 60);
  return html`<div class="grid-2">
    <section class="panel">
      <h2>Mercury Treasury ${tr ? badge(rule.enabled ? 'Auto-transfer rule on' : 'No rule', rule.enabled ? 'good' : 'warn') : ''}</h2>
      <p>Idle cash in checking earns 0%. Treasury invests it in T-bills and money-market funds: net yield <b>3.01–3.81% by tier</b>, and it requires <b>$250K across accounts</b> (research §2.1, Rho comparison 2026-08-02). Holdings are SIPC-covered, not FDIC.</p>
      ${eligible ? html`
        <div class="${ID}-kpis">${stat('Treasury balance', usd(tr?.balance ?? 0))}${stat('Your yield tier', `${(apy * 100).toFixed(2)}%`)}${stat('Yield on idle cash', `${money((idle * apy) / 12)}/mo`, `${money(idle)} above your checking maximum`)}${stat('Transfers out left this month', allowed.ok ? String(allowed.left) : '0', allowed.ok ? `max ${RULES.maxRedemptionsPerMonth}/month, ${RULES.minDaysApart} days apart` : allowed.reason, allowed.ok ? '' : 'warn')}</div>
        ${skips.length ? html`<div class="callout warn">The rule was skipped ${skips.length} time(s) in the last 60 days (${skips.at(-1).why === 'underfunded' ? `Treasury could not cover the ${money(skips.at(-1).need)} refill` : skips.at(-1).why}). Mercury only emails you; it does not partially refill.</div>` : ''}
        <form id="treasuryForm" class="${ID}-filters"><label>Checking minimum (refill below) <input type="number" name="min" min="0" step="5000" value="${rule.min}" /></label>
          <label>Checking maximum (sweep above) <input type="number" name="max" min="1000" step="5000" value="${rule.max}" /></label>
          <label><input type="checkbox" name="enabled" ${rule.enabled ? 'checked' : ''} /> Rule: maintain checking between these</label><button class="primary">${tr ? 'Save rule' : 'Open Treasury (30 min)'}</button></form>
        <p class="small muted">Mercury's "maintain a target balance" rule (D11 §1): runs on business days, sweeps cash above the maximum into Treasury and refills checking to the minimum from Treasury. Transfers out of Treasury are limited to <b>two per month, at least seven days apart</b> (manual ones count), arrive the next business day, and the rule is <b>skipped, not partially run</b>, when Treasury cannot cover the refill. Set the minimum to cover a payroll-plus-bills fortnight. Interest is paid monthly into Treasury.</p>`
      : html`<div class="callout warn">You need ${money(TREASURY.minimum)} across accounts to open Treasury (you have ${money(cash)}). Under that, the lesson from SVB (March 2023) still applies: keep operating cash in a sweep account with FDIC coverage and a second bank with 1–2 months of expenses.</div>`}
    </section>
    <section class="panel"><h2>Tiers ${badge('game interpolation of the published range', '')}</h2>
      ${TREASURY.tiers.map((t, i) => html`<div class="${ID}-row"><span>${money(Math.max(TREASURY.minimum, t.from))}${TREASURY.tiers[i + 1] ? ` – ${money(TREASURY.tiers[i + 1].from)}` : '+'}</span><span>${(t.apy * 100).toFixed(2)}%</span></div>`)}
      ${tr ? html`<div class="app-actions" style="margin-top:10px"><button data-act="tr-in">Move to Treasury…</button><button data-act="tr-out">Move to checking…</button></div>` : ''}
    </section></div>`;
}

// ---------- modals ----------

function sendModal(ctx, payeeId = null) {
  const s = ctx.state;
  const b = ensureBank(s);
  modal({
    title: 'Send money',
    body: html`
      <label>Pay to <select name="payee"><option value="__new">+ New payee…</option>${b.payees.map((p) => html`<option value="${p.id}" ${p.id === payeeId ? 'selected' : ''}>${p.name} (${p.type})</option>`)}</select></label>
      <fieldset class="newpayee"><legend>New payee</legend><div class="grid-2">
        <label>Name <input name="name" maxlength="60" placeholder="Jane Doe / Acme Design LLC" /></label>
        <label>Type <select name="type"><option value="contractor">Contractor</option><option value="vendor">Vendor</option><option value="other">Other</option></select></label>
        <label>Email <input name="email" type="email" /></label>
        <label>Account number (last 4) <input name="last4" maxlength="4" pattern="[0-9]{4}" placeholder="1234" /></label></div></fieldset>
      <div class="grid-2">
        <label>Amount (USD) <input type="number" name="amount" min="1" step="0.01" required /></label>
        <label>Method <select name="method"><option value="ach">ACH (free, 1–2 business days)</option><option value="wire">Domestic wire (same day, irreversible)</option></select></label>
      </div>
      <label>Memo (appears to the recipient) <input name="memo" maxlength="80" placeholder="Invoice #1042 — landing page design" /></label>
      <label>Category <select name="category">${['contractors', 'software', 'hosting', 'ai_inference', 'marketing', 'advertising', 'legal', 'accounting', 'travel', 'taxes', 'other'].map((c) => html`<option value="${c}">${catLabel(c)}</option>`)}</select></label>
      <p class="small muted">Available in checking: ${usd(s.bank.accounts[0].balance)}.</p>`,
    onOpen: (d, form) => {
      const sync = () => { d.querySelector('.newpayee').hidden = form.payee.value !== '__new'; };
      form.payee.addEventListener('change', sync); sync();
    },
    actions: [{ label: 'Cancel' }, {
      label: 'Send', primary: true, onClick: async (d, form) => {
        const f = formData(form);
        const res = await ctx.act((st) => {
          const bk = ensureBank(st);
          let p = bk.payees.find((x) => x.id === f.payee);
          if (!p) {
            if (!f.name?.trim()) throw new Error('Name the new payee.');
            p = { id: uid('pay'), name: f.name.trim(), type: f.type, email: f.email ?? '', last4: f.last4 || String(1000 + (parseInt(hash(f.name.trim()), 36) % 9000)), method: f.method, w9: f.type !== 'contractor' ? null : false };
            bk.payees.push(p);
          }
          if (!(f.amount > 0)) throw new Error('Enter an amount.');
          if (f.amount > st.bank.accounts[0].balance) throw new Error('Insufficient funds in checking. Move money from Treasury or add funds first.');
          const t = post(st, { amount: -f.amount, counterparty: p.name, description: `${f.method === 'wire' ? 'WIRE TO' : 'ACH TO'} ${p.name.toUpperCase()}${f.memo ? ` ${f.memo.toUpperCase()}` : ''}`.slice(0, 60), category: f.category, method: f.method, meta: { payeeId: p.id, memo: f.memo } });
          categorize(st, t.id, f.category); // you chose the category when paying: it syncs to Books as reviewed
          if (p.type === 'contractor' && !p.w9) ctx.toast(`No W-9 on file for ${p.name}. Request one before year-end (1099-NEC).`, 'warn');
          return true;
        }, { hours: b.payees.some((x) => x.id === f.payee) ? 0.1 : 0.2, label: 'Send payment' });
        return res ? undefined : false;
      },
    }],
  });
}

function fundModal(ctx) {
  const s = ctx.state;
  const p = ensurePersonal(s);
  const corp = s.company.entity === 'ccorp' || (s.company.incorporated && s.company.entity !== 'llc');
  modal({
    title: 'Add personal funds',
    body: html`<p>Personal savings available: <b>${usd(p.liquidSavings)}</b></p>
      <label>Amount <input type="number" name="amount" min="1" step="100" required /></label>
      <fieldset><legend>Book it as</legend>
        <label class="radio-card"><input type="radio" name="kind" value="contribution" checked /><b>Owner contribution (equity)</b><span>${corp ? 'Paid-in capital in a C-corp. You can\'t take it back out tax-free except as salary or dividends.' : 'Owner\'s equity in an LLC / sole prop. You can draw it back out later.'}</span></label>
        <label class="radio-card"><input type="radio" name="kind" value="loan" /><b>Founder loan to the company</b><span>A liability the company repays you. Document it with a simple promissory note; investors will ask about it.</span></label>
      </fieldset>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Transfer', primary: true, onClick: async (d, form) => {
        const f = formData(form);
        const ok = await ctx.act((st) => { contributeToCompany(st, f.amount, { asLoan: f.kind === 'loan' }); return true; }, { hours: 0.1, label: 'Fund company' });
        return ok ? undefined : false;
      },
    }],
  });
}

function moveModal(ctx, toTreasury) {
  modal({
    title: toTreasury ? 'Move to Treasury' : 'Move to checking',
    body: html`<label>Amount <input type="number" name="amount" min="1" step="100" required /></label>`,
    actions: [{ label: 'Cancel' }, { label: 'Move', primary: true, onClick: (d, form) => ctx.act((st) => {
      const amt = formData(form).amount;
      const from = toTreasury ? st.bank.accounts.find((a) => a.id === 'checking') : treasuryAcct(st);
      if (!(amt > 0) || amt > from.balance) throw new Error('Not enough balance.');
      transferTreasury(st, amt, toTreasury);
    }, { hours: 0.05, label: 'Treasury transfer' }) }],
  });
}

function exportCsv(s) {
  const rows = filtered(s).reverse().map((t) => ({ Date: isoDate(s, t.day), Description: descriptorFor(t), Counterparty: t.counterparty, Amount: t.amount.toFixed(2), Category: catLabel(bookCategory(s, t)), Method: t.method, Account: t.accountId, 'Running balance': t.balanceAfter.toFixed(2), Note: ensureBank(s).notes[t.id] ?? t.meta?.memo ?? '', 'Transaction ID': t.id }));
  download(`mercury-statement-${isoDate(s)}.csv`, toCsv(rows));
}

// ---------- app ----------

export default {
  id: ID,
  title: 'Bank',
  icon: '🏦',
  group: 'Money',
  badge: (state) => (totalCash(state) < 0 || state.recurring?.some((r) => r.suspended) || state.apps.bank?.spend?.cards?.some((c) => c.locked) ? '!' : 0),
  render(root, ctx) {
    const s = ctx.state;
    ensureBank(s); ensureSpend(s); ensureForecast(s); ensureTreasury(s);
    const [v0, arg] = ctx.params.split('/'); const view = v0 || 'home';
    const body = view === 'statements' ? statements(s) : view === 'transactions' ? transactions(s, arg) : view === 'payments' ? sendMoney(s) : view === 'cards' ? cardsView(s) : view === 'receipts' ? receiptsView(s) : view === 'stack' ? stackView(s) : view === 'forecast' ? forecastView(s) : view === 'perks' ? perksView(s) : view === 'bills' ? bills(s) : view === 'treasury' ? treasury(s) : view === 'backoffice' ? backofficeView(s) : overview(s);
    mount(root, html`${appCss(ID)}
      <div class="app-head"><div><h1>${bankTitle(s)}${isPreIncorporationAccount(s) ? html` <span class="badge warn">pre-incorporation</span>` : ''}</h1><p>${isPreIncorporationAccount(s) ? `Your own checking account, used for ${s.company.name} until it is incorporated.` : `Your company's bank. Every dollar in or out of ${s.company.name} shows up here with the descriptor the counterparty uses.`}</p></div>
        <div class="app-actions"><button class="primary" data-act="send">Send money</button><button data-act="fund">Add personal funds</button></div></div>
      ${tabs(ID, [{ id: 'home', label: 'Overview' }, { id: 'transactions', label: 'Transactions' }, { id: 'statements', label: 'Statements' }, { id: 'payments', label: 'Payments & payees' }, { id: 'cards', label: 'Cards & spend', count: pendingRequests(s).length + s.apps.bank.spend.cards.filter((c) => c.locked).length, tone: 'warn' }, { id: 'receipts', label: 'Receipts', count: missingReceipts(s).length, tone: missingReceipts(s).length > 10 ? 'bad' : '' }, { id: 'stack', label: 'Stack audit', count: openTrials(s).length, tone: 'warn' }, { id: 'bills', label: 'Recurring bills', count: s.recurring.filter((r) => r.active || r.annual).length }, { id: 'forecast', label: 'Forecast' }, { id: 'perks', label: 'Perks & credits', count: (s.apps.perks?.applications ?? []).filter((a) => a.status === 'pending').length }, { id: 'treasury', label: 'Treasury' }, { id: 'backoffice', label: 'Back office', count: s.apps.backoffice?.cap?.vendor === 'pulley' ? 1 : 0, tone: 'bad' }], view)}
      ${body}`);

    if (view === 'home') {
      // Total balance series from the ledger (checking + treasury), last 180 days.
      const from = Math.max(0, s.day - 180);
      let bal = sumBy(s.bank.txns.filter((t) => t.day < from), (t) => t.amount);
      const byDay = {};
      for (const t of s.bank.txns) if (t.day >= from) byDay[t.day] = (byDay[t.day] ?? 0) + t.amount;
      const vals = [];
      for (let d = from; d <= s.day; d++) { bal += byDay[d] ?? 0; vals.push(bal); }
      lineChart(root.querySelector('#balChart'), [{ values: vals, color: '--cash' }], { labels: [fmtDate(s, from), fmtDate(s, s.day)], height: 130 });
    }

    if (view === 'forecast') drawForecast(root, s);
    if (['cards', 'receipts', 'stack'].includes(view)) wireSpend(root, ctx);
    if (view === 'forecast') wireForecast(root, ctx);
    if (view === 'perks') wirePerks(root, ctx);
    if (view === 'backoffice') wireBackoffice(root, ctx);

    on(root, 'click', '[data-act]', (e, el) => {
      const a = el.dataset.act;
      if (a === 'send') sendModal(ctx);
      else if (a === 'fund') fundModal(ctx);
      else if (a === 'export') exportCsv(s);
      else if (a === 'more') { ui.limit += 200; ctx.render(); }
      else if (a === 'clear') { Object.assign(ui, { q: '', cat: '', method: '', acct: '', dir: '', from: '', to: '' }); ctx.render(); }
      else if (a === 'payee') sendModal(ctx);
      else if (a === 'tr-in') moveModal(ctx, true);
      else if (a === 'tr-out') moveModal(ctx, false);
    });
    on(root, 'click', '[data-stmt]', (e, el) => {
      const [m, acct] = el.dataset.stmt.split('|');
      const rows = s.bank.txns.filter((t) => t.accountId === acct && monthOf(s, t.day) === m).map((t) => ({ Date: isoDate(s, t.day), Description: descriptorFor(t), Amount: t.amount.toFixed(2), Balance: t.balanceAfter.toFixed(2) }));
      download(`mercury-${acct}-${m}.csv`, toCsv(rows));
    });
    on(root, 'click', 'tr[data-txn]', (e, el) => ctx.navigate(ID, `transactions/${el.dataset.txn}`));
    on(root, 'input', '#filters input[name=q]', (e) => { ui.q = e.target.value; ui.limit = 150; ctx.render(); });
    on(root, 'change', '#filters select, #filters input[type=date]', (e) => { ui[e.target.name] = e.target.value; ui.limit = 150; ctx.render(); });
    on(root, 'change', '#cardMonth', (e) => { ui.cardMonth = e.target.value; ctx.render(); });
    on(root, 'click', '[data-pay]', (e, el) => sendModal(ctx, el.dataset.pay));
    on(root, 'click', '[data-w9]', (e, el) => ctx.act((st) => { const p = ensureBank(st).payees.find((x) => x.id === el.dataset.w9); p.w9 = true; ctx.toast(`${p.name} returned a signed W-9.`, 'good'); }, { hours: 0.1, label: 'Collect W-9' }));
    on(root, 'submit', '#catForm', (e) => {
      e.preventDefault();
      const id = ctx.params.split('/')[1];
      const f = formData(e.target);
      const rule = root.querySelector('input[name=rule]')?.checked;
      ctx.act((st) => categorize(st, id, f.cat, { rule }), { hours: 0.03, label: 'Categorize transaction' });
    });
    on(root, 'submit', '#noteForm', (e) => {
      e.preventDefault();
      const id = ctx.params.split('/')[1];
      const note = formData(e.target).note;
      ctx.act((st) => { ensureBank(st).notes[id] = note; }, { hours: 0.02, label: 'Transaction note' });
    });
    on(root, 'click', '[data-toggle]', (e, el) => ctx.act((st) => {
      const r = st.recurring.find((x) => x.id === el.dataset.toggle);
      if (!r) throw new Error('Bill not found.');
      const held = Boolean(r.cardHold);
      if (r.cardHold) { r.cardHold = null; r.active = false; } // a declined bill paused by hand stays paused
      r.active = !r.active;
      r.paused = !r.active;
      if (!held) healthOffset(st, r, r.active); // a card hold never removed the offset, so resuming must not apply it again
    }, { hours: 0.1, label: 'Manage subscriptions' }));
    on(root, 'click', '[data-reactivate]', (e, el) => ctx.act((st) => {
      const r = st.recurring.find((x) => x.id === el.dataset.reactivate);
      if (!r) throw new Error('Bill not found.');
      if (balance(st) < r.amount) throw new Error(`Checking has ${usd(balance(st))}; the vendor needs ${usd(r.amount)} to reactivate. Add funds first.`);
      // The vendor collects the overdue bill when you re-enter the card, then restores the account.
      post(st, { amount: -r.amount, counterparty: r.vendor, description: `${r.vendor} past-due payment`, category: r.category, method: 'card' });
      reactivateRecurring(st, r.id);
      ctx.toast(`${r.vendor} reactivated.`, 'good');
    }, { hours: 0.25, label: 'Reactivate vendor' }));
    on(root, 'click', '[data-cancel]', (e, el) => ctx.act((st) => {
      const r = cancelBill(st, el.dataset.cancel);
      ctx.toast(`Canceled ${r.vendor}. Saves ${money(r.amount * 12)}/yr.`, 'good');
    }, { hours: 0.15, label: 'Cancel subscription' }));
    on(root, 'click', '[data-add]', (e, el) => ctx.act((st) => {
      const t = TOOL_CATALOG.find((x) => x.id === el.dataset.add);
      const auth = authorizeCard(st, { vendor: t.vendor, category: t.category, amount: t.amount });
      if (!auth.ok) throw new Error(`Card declined: ${auth.reason}.`);
      const r = addRecurring(st, { vendor: t.vendor, amount: t.amount, category: t.category, dayOfMonth: Math.min(28, dayOfMonth(st)), note: t.plan });
      r.catalogId = t.id;
      if (t.personalOffset) { r.personalOffset = t.amount; healthOffset(st, r, true); ctx.toast(`The company now pays your ${t.vendor}: your personal living costs drop by ${money(t.amount)}/mo.`, 'info'); }
      // First month is charged at signup, like real SaaS.
      post(st, { amount: -t.amount, counterparty: t.vendor, description: `${t.vendor} ${t.plan}`, category: t.category, method: 'card' });
    }, { hours: 0.25, label: 'Sign up for a tool' }));
    on(root, 'submit', '#customBill', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => {
        const auth = authorizeCard(st, { vendor: f.vendor.trim(), category: f.category, amount: f.amount });
        if (!auth.ok) throw new Error(`Card declined: ${auth.reason}.`);
        addRecurring(st, { vendor: f.vendor.trim(), amount: f.amount, category: f.category, dayOfMonth: Math.min(28, dayOfMonth(st)) });
        post(st, { amount: -f.amount, counterparty: f.vendor.trim(), description: `${f.vendor.trim()} subscription`, category: f.category, method: 'card' });
      }, { hours: 0.25, label: 'Sign up for a tool' });
    });
    on(root, 'submit', '#treasuryForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const opening = !treasuryAcct(s);
      ctx.act((st) => {
        const b = ensureBank(st);
        if (!treasuryAcct(st)) {
          if (!bankVendor(st).treasury) throw new Error(`${bankLabel(st)} has no Treasury product in the game: idle cash stays at 0%.`);
          if (totalCash(st) < TREASURY.minimum) throw new Error('Treasury requires $250K across accounts.');
          st.bank.accounts.push({ id: 'treasury', name: 'Treasury', type: 'treasury', balance: 0 });
        }
        const t = ensureTreasury(st);
        t.min = Math.max(0, f.min ?? t.min);
        t.max = Math.max(t.min + 1000, f.max ?? t.max);
        t.target = t.max; // legacy field
        t.enabled = Boolean(f.enabled);
        if (t.enabled) treasuryRuleDay(st);
      }, { hours: opening ? 0.5 : 0.05, label: 'Treasury setup' });
    });
  },
  onDay(state) {
    const b = state.apps.bank;
    if (b?.inTransit?.length) settleTransfers(state);
    if (b?.treasury?.enabled && treasuryAcct(state)) { ensureTreasury(state); treasuryRuleDay(state); }
    spendDay(state);
    backofficeDay(state);
    forecastDay(state);
    treasuryWatch(state);
  },
  onMonthEnd(state) {
    // Usage-based hosting scales with paying customers.
    const n = new Set(activeSubs(state).map((x) => x.customerId)).size;
    const amt = round2(n * (HOSTING_PER_CUSTOMER[state.company.model] ?? 0.5));
    if (!state.recurring.some((r) => r.usage)) Object.assign(addRecurring(state, { vendor: 'Vercel + Supabase usage', amount: 0, category: 'hosting', variable: true, note: `~$${HOSTING_PER_CUSTOMER[state.company.model]}/active customer/mo (bandwidth, functions, database)` }), { usage: true });
    if (amt >= 1) post(state, { amount: -amt, counterparty: 'Vercel', description: 'VERCEL INC. USAGE', category: 'hosting', method: 'card', meta: { usage: true, customers: n } });
    const tr = treasuryAcct(state);
    if (tr && tr.balance > 1) {
      const amt = round2((tr.balance * treasuryApy(tr.balance)) / 12);
      post(state, { amount: amt, counterparty: 'Mercury Treasury', description: 'TREASURY DIVIDEND', category: 'interest', method: 'internal', accountId: 'treasury' });
    }
  },
};
