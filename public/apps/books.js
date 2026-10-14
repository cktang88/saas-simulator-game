// Books: accounting after the Bench shutdown (Dec 2024) — QuickBooks / AI-bookkeeper style.
// Bank feed review queue (AI guesses, ~10% wrong for DIY), chart of accounts, P&L on cash and accrual basis
// (ASC 606 ratable recognition, deferred revenue, Stripe fees + hosting + inference as COGS), a balance sheet
// that balances and ties out to the bank and Stripe, the monthly close checklist, a tax & compliance calendar
// with real deadlines and penalties, and the choice of bookkeeping service.
// Source of truth: docs/research/finance-and-payments.md §3 (accounting), §4 (taxes), §7.

import { html, mount, on, modal, formData, download, stat, badge } from '../core/ui.js';
import { money, fmtDate, pct, toCsv, isoDate } from '../core/util.js';
import { addRecurring } from '../core/bank.js';
import { notify } from '../core/state.js';
import { mrr } from '../core/stripe.js';
import { catLabel, descriptorFor, frac, txnKey, monthOf, monthLabel, sumBy, monthEndDay, yearOf } from './money/common.js';
import { BOOKKEEPING } from './money/catalog.js';
import {
  COA, ensureBooks, service, syncLedger, serviceAutoReview, ledgerByMonth, profitAndLoss, balanceSheet, tieOuts, stripeRecon,
  deferredRollforward, bookCategory, guessCategory, categorize, reviewQueue, isLocked, CATEGORY_CHOICES, CLOSE_ITEMS, closeHours,
  closeState, closableMonths, closeBlocker, plVariances, allMonths, bankLinesFor, isPL,
  addAccrual, addPrepaid, removeAdjustment, prepaidCandidates, checkReconciliation,
} from './money/ledger.js';
import {
  calendarItems, complianceDay, entityInfo, franchiseTaxAuthorized,
  contractorTotals, payEstimatedTax, estimateDue, cpaQuote, fileWithCpa, fileExtension, nexusStatus, registerNexus, registerVat, fileVatReturn, TAX,
} from './money/compliance.js';
import { appCss, usd, tabs, statusBadge, short } from './money/ui.js';

const ID = 'books';
const ui = { feedMonth: '', period: 'last6', basis: 'accrual', bsMonth: null, closeMonth: null };

// AI confidence shown next to each suggestion. Wrong guesses tend to be less confident, with overlap. [design]
const confidence = (s, t) => {
  const u = frac(`${txnKey(t)}:conf`);
  return guessCategory(s, t) === t.category ? 0.74 + 0.25 * u : 0.52 + 0.33 * u;
};

function periodMonths(s) {
  const all = allMonths(s);
  if (ui.period === 'last6') return all.slice(-6);
  if (ui.period === 'ytd') return all.filter((m) => m.startsWith(String(yearOf(s))));
  return all.filter((m) => m.startsWith(ui.period));
}

// ---------- views ----------

function overview(s, L) {
  const cur = monthOf(s);
  const months = allMonths(s).slice(-3);
  const pl = profitAndLoss(s, months, 'accrual', L);
  const i = months.length - 1;
  const ytd = profitAndLoss(s, allMonths(s).filter((m) => m.startsWith(cur.slice(0, 4))), 'accrual', L);
  const bs = balanceSheet(s, cur, L);
  const q = reviewQueue(s).length;
  const b = ensureBooks(s);
  const lastClosed = Object.keys(b.closed).sort().at(-1);
  const due = calendarItems(s).filter((it) => it.kind !== 'info' && (!it.status || it.status === 'overdue') && it.day <= s.day + 45);
  const cash = b.cash[cur] ?? { gross: 0 };
  return html`
    <div class="${ID}-kpis">
      ${stat(`Revenue (${monthLabel(cur)}, accrual)`, money(pl.revenue[i]), `cash collected ${money(cash.gross)} · MRR ${money(mrr(s))}`)}
      ${stat('Gross margin', pl.grossMargin[i] == null ? '—' : pct(pl.grossMargin[i], 0), 'after hosting, inference, payment fees')}
      ${stat(`Net income ${cur.slice(0, 4)} YTD`, money(sumBy(ytd.netIncome, (v) => v)), '', sumBy(ytd.netIncome, (v) => v) < 0 ? 'bad' : 'good')}
      ${stat('Deferred revenue', money(bs.liabilities.find((l) => l.acct === '2500')?.value ?? 0), 'unearned annual & prepaid')}
      ${stat('To review', q, 'bank feed transactions', q > 25 ? 'warn' : '')}
      ${stat('Last closed month', lastClosed ? monthLabel(lastClosed) : 'none', closableMonths(s).filter((m) => !b.closed[m]).length ? `${closableMonths(s).filter((m) => !b.closed[m]).length} month(s) open` : 'up to date')}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Cash vs revenue vs MRR (${monthLabel(cur)})</h2>
        <div class="${ID}-row"><span>Cash collected from customers (gross charges)</span><span>${usd(cash.gross)}</span></div>
        <div class="${ID}-row"><span>Revenue recognized (accrual)</span><span>${usd(pl.revenue[i])}</span></div>
        <div class="${ID}-row"><span>MRR today</span><span>${usd(mrr(s))}</span></div>
        <div class="${ID}-row"><span>Stripe payouts deposited</span><span>${usd(sumBy(s.bank.txns.filter((t) => t.category === 'stripe_payout' && monthOf(s, t.day) === cur), (t) => t.amount))}</span></div>
        <p class="small muted">Annual plans: cash arrives upfront, revenue is earned monthly (deferred revenue), MRR is price ÷ 12. Payouts are net of fees and refunds, so they match none of the three. Confusing them is a classic founder error (research §3.2).</p>
      </section>
      <section class="panel"><h2>Upcoming deadlines</h2>
        ${due.length ? due.map((it) => html`<div class="${ID}-row"><span>${it.title}</span><span class="${it.day < s.day ? 'neg' : ''}">${fmtDate(s, it.day)}</span></div>`) : html`<p class="muted">Nothing due in the next 45 days.</p>`}
        <p><a href="#/books/tax">Tax & compliance calendar →</a></p>
        <h3>Bookkeeping</h3><p class="small">${service(s).label} · ${service(s).price ? `${usd(service(s).price)}/mo` : 'free'} · <a href="#/books/service">change</a></p>
      </section>
    </div>`;
}

function feed(s) {
  const q = reviewQueue(s);
  const months = [...new Set(q.map((t) => monthOf(s, t.day)))].sort();
  const m = ui.feedMonth && months.includes(ui.feedMonth) ? ui.feedMonth : '';
  const rows = (m ? q.filter((t) => monthOf(s, t.day) === m) : q).slice(0, 120);
  const sv = service(s);
  const b = ensureBooks(s);
  const reviewed = s.bank.txns.filter((t) => b.cats[t.id]).slice(-40).reverse();
  return html`<section class="panel">
      <h2>For review ${badge(q.length, q.length ? 'warn' : 'good')}</h2>
      <p class="small muted">Your bank feed, auto-categorized by ${sv.label}. AI categorizers get some wrong — inference vs subscriptions, ads vs marketing, an owner contribution booked as income. Check the descriptor, the memo and the vendor. Reviewing takes ~${sv.reviewMin} min per transaction; a vendor rule applies to every future transaction from that counterparty (careful with vendors that bill for different things).</p>
      <div class="inline" style="margin-bottom:8px"><label>Month <select id="feedMonth"><option value="">All (${q.length})</option>${months.map((x) => html`<option value="${x}" ${x === m ? 'selected' : ''}>${monthLabel(x)} (${q.filter((t) => monthOf(s, t.day) === x).length})</option>`)}</select></label>
        ${rows.length ? html`<button data-act="confirmAll" title="Accepts every suggestion as-is">Accept all ${rows.length} suggestions (${((rows.length * sv.reviewMin * 0.25) / 60).toFixed(1)}h)</button>` : ''}</div>
      ${rows.length ? html`<div class="table-wrap"><table class="${ID}-tbl"><thead><tr><th>Date</th><th>Description</th><th class="r">Amount</th><th>Category</th><th>Rule</th><th></th></tr></thead><tbody>
        ${rows.map((t) => { const c = bookCategory(s, t); const conf = confidence(s, t); return html`<tr data-row="${t.id}">
          <td class="small">${fmtDate(s, t.day)}</td>
          <td>${t.counterparty}<div class="${ID}-sub"><code>${descriptorFor(t)}</code>${t.description && t.description !== descriptorFor(t) ? ` · ${t.description}` : ''}${t.meta?.memo ? ` · memo: ${t.meta.memo}` : ''}</div></td>
          <td class="r ${ID}-amt ${t.amount > 0 ? `${ID}-in` : ''}">${usd(t.amount)}</td>
          <td><select data-cat="${t.id}">${CATEGORY_CHOICES.map((x) => html`<option value="${x}" ${x === c ? 'selected' : ''}>${catLabel(x)}</option>`)}</select><div class="${ID}-sub">AI suggestion · ${Math.round(conf * 100)}% confident</div></td>
          <td><input type="checkbox" data-rule="${t.id}" title="Always categorize ${t.counterparty} this way" /></td>
          <td><button class="sm primary" data-confirm="${t.id}">Confirm</button></td></tr>`; })}
      </tbody></table></div>` : html`<p class="empty">All caught up. ✓</p>`}
    </section>
    ${reviewed.length ? html`<section class="panel"><h2>Recently reviewed</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Counterparty</th><th class="r">Amount</th><th>Category</th><th>By</th></tr></thead><tbody>
      ${reviewed.map((t) => html`<tr><td class="small">${fmtDate(s, t.day)}</td><td>${t.counterparty}</td><td class="r">${usd(t.amount)}</td>
        <td>${isLocked(s, t.day) ? catLabel(bookCategory(s, t)) : html`<select data-recat="${t.id}">${CATEGORY_CHOICES.map((x) => html`<option value="${x}" ${x === bookCategory(s, t) ? 'selected' : ''}>${catLabel(x)}</option>`)}</select>`}</td>
        <td class="small">${b.cats[t.id].by}</td></tr>`)}</tbody></table></div>
      ${Object.keys(b.rules).length ? html`<h3>Vendor rules</h3><ul class="list small">${Object.entries(b.rules).map(([cp, c]) => html`<li>${cp} → ${catLabel(c)} <button class="sm" data-unrule="${cp}">Remove</button></li>`)}</ul>` : ''}</section>` : ''}`;
}

function plView(s, L) {
  const months = periodMonths(s);
  const pl = profitAndLoss(s, months, ui.basis, L);
  const years = [...new Set(allMonths(s).map((m) => m.slice(0, 4)))];
  const total = (vals) => sumBy(vals, (v) => v);
  const row = (l, cls = '') => html`<tr class="${cls}"><td class="ind ${l.acct && COA[l.acct] ? 'clickable' : ''}" data-drill="${l.acct ?? ''}">${l.acct ? html`<span class="muted small">${l.acct}</span> ` : ''}${l.name}</td>${l.values.map((v) => html`<td class="r">${Math.abs(v) < 0.005 ? '—' : usd(v)}</td>`)}<td class="r"><b>${usd(total(l.values))}</b></td></tr>`;
  return html`<section class="panel">
    <div class="inline" style="margin-bottom:8px">
      <label>Period <select id="period"><option value="last6" ${ui.period === 'last6' ? 'selected' : ''}>Last 6 months</option><option value="ytd" ${ui.period === 'ytd' ? 'selected' : ''}>Year to date</option>${years.map((y) => html`<option value="${y}" ${ui.period === y ? 'selected' : ''}>${y}</option>`)}</select></label>
      <label>Basis <select id="basis"><option value="accrual" ${ui.basis === 'accrual' ? 'selected' : ''}>Accrual (GAAP)</option><option value="cash" ${ui.basis === 'cash' ? 'selected' : ''}>Cash</option></select></label>
      <button data-act="exportPl">Export CSV</button>
    </div>
    <p class="small muted">${ui.basis === 'accrual' ? 'Accrual: subscription revenue is recognized ratably over each service period (ASC 606). Annual prepayments sit in deferred revenue until earned. Investors, acquirers and lenders expect this.' : 'Cash: revenue when customers pay (gross charges collected), expenses when paid. Simple, but annual plans make it lumpy and misleading.'} Click a line to see the transactions behind it.</p>
    <div class="table-wrap"><table class="${ID}-tbl"><thead><tr><th>Account</th>${months.map((m) => html`<th class="r">${monthLabel(m)}</th>`)}<th class="r">Total</th></tr></thead><tbody>
      ${pl.sections.map((sec) => html`<tr class="section"><td colspan="${months.length + 2}">${sec.title}</td></tr>${sec.lines.map((l) => row(l))}${row({ name: sec.totalLabel, values: sec.total }, 'total')}
        ${sec.title === 'Cost of revenue' ? html`${row({ name: 'Gross profit', values: pl.grossProfit }, 'total')}<tr><td class="ind muted">Gross margin</td>${pl.grossMargin.map((g) => html`<td class="r muted">${g == null ? '—' : pct(g, 0)}</td>`)}<td class="r muted">${total(pl.revenue) > 0 ? pct(total(pl.grossProfit) / total(pl.revenue), 0) : '—'}</td></tr>` : ''}
        ${sec.title === 'Operating expenses' ? row({ name: 'Operating income', values: pl.operatingIncome }, 'total') : ''}`)}
      ${row({ name: 'Net income', values: pl.netIncome }, 'total')}
    </tbody></table></div>
    <p class="small muted">COGS = production hosting, AI inference used by customers, payment processing and dispute fees: that split is what makes gross margin meaningful (traditional SaaS 75–85%, AI-native ~45–55%). Your own coding tools are R&D (opex). Owner draws and contributions are equity, not P&L.</p>
  </section>`;
}

function bsView(s, L) {
  const months = allMonths(s);
  const m = ui.bsMonth && months.includes(ui.bsMonth) ? ui.bsMonth : months.at(-1);
  const bs = balanceSheet(s, m, L);
  const isCur = m === monthOf(s);
  const ties = isCur ? tieOuts(s, L) : [];
  const roll = deferredRollforward(s, m, L);
  const sect = (title, lines, total) => html`<tr class="section"><td colspan="2">${title}</td></tr>${lines.map((l) => html`<tr><td class="ind">${l.acct.length === 4 ? html`<span class="muted small">${l.acct}</span> ` : ''}${l.name}</td><td class="r">${usd(l.value)}</td></tr>`)}<tr class="total"><td>Total ${title.toLowerCase()}</td><td class="r">${usd(total)}</td></tr>`;
  return html`<div class="grid-2">
    <section class="panel">
      <div class="inline"><label>As of end of <select id="bsMonth">${months.map((x) => html`<option value="${x}" ${x === m ? 'selected' : ''}>${monthLabel(x)}${x === monthOf(s) ? ' (to date)' : ''}</option>`)}</select></label></div>
      <div class="table-wrap"><table class="${ID}-tbl"><tbody>
        ${sect('Assets', bs.assets, bs.totalAssets)}
        ${sect('Liabilities', bs.liabilities, bs.totalLiabilities)}
        ${sect('Equity', bs.equity, bs.totalEquity)}
        <tr class="total"><td>Total liabilities & equity</td><td class="r">${usd(bs.totalLiabilities + bs.totalEquity)}</td></tr>
      </tbody></table></div>
      <p>${bs.balanced ? badge('Balanced: assets = liabilities + equity', 'good') : badge(`Out of balance by ${usd(bs.totalAssets - bs.totalLiabilities - bs.totalEquity)}`, 'bad')}</p>
    </section>
    <section class="panel">
      ${isCur ? html`<h2>Tie-outs to source systems</h2>${ties.map((t) => html`<div class="${ID}-row"><span>${t.label}</span><span>${usd(t.ledger)} vs ${usd(t.actual)} ${t.ok ? badge('✓', 'good') : badge('✗', 'bad')}</span></div>`)}` : ''}
      <h2 style="margin-top:12px">Deferred revenue roll-forward · ${monthLabel(m)}</h2>
      <div class="${ID}-row"><span>Opening balance</span><span>${usd(roll.opening)}</span></div>
      <div class="${ID}-row"><span>+ Billings (charges collected)</span><span>${usd(roll.billings)}</span></div>
      <div class="${ID}-row"><span>− Revenue recognized</span><span>${usd(-roll.recognized)}</span></div>
      <div class="${ID}-row"><span>− Refund / dispute reversals</span><span>${usd(-roll.reversals)}</span></div>
      <div class="${ID}-row"><span><b>Closing balance</b></span><span><b>${usd(roll.closing)}</b></span></div>
      <p class="small muted">Deferred revenue is a liability: you owe customers the service they prepaid. Stripe clearing holds charges collected but not yet paid out (pending + available + in transit). Sales tax/VAT collected would be a liability too, never revenue.</p>
    </section></div>`;
}

function itemDetail(s, m, item, L) {
  if (item.id === 'categorize') { const n = reviewQueue(s, m).length; return n ? html`<a href="#/books/feed" data-feedmonth="${m}">${n} to review →</a>` : html`<span class="pos">All transactions reviewed</span>`; }
  const cs = closeState(s, m);
  const locked = ensureBooks(s).closed[m];
  if (item.id === 'stripe') {
    const r = stripeRecon(s, m, L);
    if (!cs.recon?.stripe) return locked ? '' : html`<form class="inline" data-recon="stripe"><label>Stripe ending balance (Payments → Payouts → Monthly balance summary) <input type="number" name="stripe" step="0.01" required /></label><button class="sm">Reconcile (15 min)</button></form>`;
    return html`<span class="pos">Reconciled to ${usd(cs.recon.stripe.stripe)}</span> · gross ${usd(r.gross)} − refunds ${usd(r.refunds)} − disputes ${usd(r.chargebacks)} − fees ${usd(r.fees)}${r.withheld ? ` − Stripe Capital repayments ${usd(r.withheld)}` : ''} − payouts ${usd(r.payouts)} = ${usd(r.expectedChange)} vs change in Stripe clearing ${usd(r.change)} ${r.ok ? badge('ties', 'good') : badge('difference', 'bad')}`;
  }
  if (item.id === 'bank' && !cs.recon?.bank) return locked ? '' : html`<form class="inline" data-recon="bank">${s.bank.accounts.map((a) => html`<label>${a.name} statement ending balance (Bank → Statements) <input type="number" name="${a.id}" step="0.01" required /></label>`)}<button class="sm">Reconcile (15 min)</button></form>`;
  if (item.id === 'accruals' || item.id === 'prepaids') {
    const kind = item.id === 'accruals' ? 'accrual' : 'prepaid';
    const jes = ensureBooks(s).adjustments.filter((j) => j.month === m && j.kind === kind);
    const list = jes.map((j) => html`<div>${kind === 'accrual' ? `Accrued ${usd(j.lines[0].amount)} to ${j.lines[0].acct} ${COA[j.lines[0].acct].name} (reverses ${monthLabel(j.lines[2].month)})` : j.memo} ${locked ? '' : html`<button class="sm" data-rmje="${j.id}">Remove</button>`}</div>`);
    const na = cs.na?.[item.id] ? html`<div class="muted">N/A: ${cs.na[item.id]}</div>` : '';
    if (locked) return html`${list}${na}`;
    if (kind === 'accrual') {
      const ai = sumBy(s.bank.txns.filter((t) => monthOf(s, t.day) === m && bookCategory(s, t) === 'ai_inference'), (t) => -t.amount);
      return html`${list}${na}<div class="small muted">AI inference paid this month: ${usd(ai)}. Usage for the days after the provider's billing cut-off arrives next month.</div>
        <form class="inline" data-accrual="${m}"><label>Amount <input type="number" name="amount" min="1" step="0.01" required /></label><label>Expense <select name="acct"><option value="5010">5010 AI inference</option><option value="5000">5000 Hosting</option><option value="6005">6005 Contractors</option><option value="6000">6000 Salaries</option></select></label><input name="memo" placeholder="Memo (e.g. Anthropic usage Mar 25–31)" /><button class="sm">Book accrual (15 min)</button></form>`;
    }
    const cands = prepaidCandidates(s, m);
    return html`${list}${na}${cands.length ? cands.map((t) => html`<div>${t.counterparty} ${usd(t.amount)} on ${short(s, t.day)} <button class="sm" data-prepaid="${t.id}">Amortize over 12 months (15 min)</button></div>`) : html`<div class="small muted">No payments ≥ $100 that look like annual prepayments this month.</div>`}`;
  }
  if (item.id === 'bank') {
    const bs = balanceSheet(s, m, L);
    return s.bank.accounts.map((a) => { const last = s.bank.txns.filter((t) => t.accountId === a.id && t.day <= monthEndDay(s, m)).at(-1); const stmt = last?.balanceAfter ?? 0; const led = bs.cum[a.id === 'treasury' ? '1010' : '1000'] ?? 0; return html`<div>${a.name}: statement ${usd(stmt)} vs ledger ${usd(led)} ${Math.abs(stmt - led) < 0.01 ? badge('✓', 'good') : badge('✗', 'bad')}</div>`; });
  }
  if (item.id === 'revrec') { const r = deferredRollforward(s, m, L); const snap = [...s.metrics.daily].reverse().find((d) => d.day <= monthEndDay(s, m)); return html`Recognized ${usd(r.recognized)} vs month-end MRR ${usd(snap?.mrr ?? 0)} · deferred ${usd(r.opening)} → ${usd(r.closing)}`; }
  if (item.id === 'payroll') { const p = sumBy(s.bank.txns.filter((t) => monthOf(s, t.day) === m && ['payroll', 'payroll_tax'].includes(bookCategory(s, t))), (t) => -t.amount); return p ? html`Payroll debits ${usd(p)}` : html`<span class="muted">No payroll this month → N/A</span>`; }
  if (item.id === 'salestax') { const n = nexusStatus(s).slice(0, 3); const b = ensureBooks(s); return html`${n.map((r) => html`<span>${r.state} ${pct(r.pct, 0)} of threshold · </span>`)}${s.company.model === 'b2c' ? html`VAT exposure ${usd(b.vat.exposure)}` : ''}`; }
  if (item.id === 'pl') { const v = plVariances(s, m, L); return v.length ? v.map((x) => html`<div>${x.name}: ${usd(x.prev)} → ${usd(x.cur)}</div>`) : html`<span class="muted">No line moved more than 20% and $500.</span>`; }
  if (item.id === 'bs') { const bs = balanceSheet(s, m, L); return bs.balanced ? html`<span class="pos">Balanced · total assets ${usd(bs.totalAssets)}</span>` : html`<span class="neg">Out of balance</span>`; }
  if (item.id === 'metrics') return html`<a href="#/analytics/mrr">MRR movements</a> · <a href="#/analytics/home">weekly dashboard</a>`;
  return '';
}

function closeView(s, L) {
  const b = ensureBooks(s);
  const months = closableMonths(s);
  if (!months.length) return html`<section class="panel"><p class="empty">Your first month-end close is available after ${monthLabel(monthOf(s))} ends.</p></section>`;
  const firstOpen = months.find((m) => !b.closed[m]) ?? months.at(-1);
  const m = ui.closeMonth && months.includes(ui.closeMonth) ? ui.closeMonth : firstOpen;
  const cs = closeState(s, m);
  const closed = b.closed[m];
  const done = CLOSE_ITEMS.filter((i) => cs.items[i.id]).length;
  const total = sumBy(CLOSE_ITEMS.filter((i) => !cs.items[i.id]), (i) => closeHours(s, i));
  return html`<section class="panel">
    <div class="inline" style="justify-content:space-between"><label>Month <select id="closeMonth">${months.map((x) => html`<option value="${x}" ${x === m ? 'selected' : ''}>${monthLabel(x)} ${b.closed[x] ? '🔒' : ''}</option>`)}</select></label>
      <div>${closed ? html`${badge(`Closed ${fmtDate(s, closed.day)}`, 'good')} <button class="sm" data-act="reopen">Reopen (15 min)</button>` : html`${badge(`${done}/${CLOSE_ITEMS.length} done`, 'accent')} <span class="small muted">~${total.toFixed(1)}h left with ${service(s).label}</span>`}</div></div>
    <p class="small muted">Target: closed within 5–10 business days of month-end (solo founders with an AI bookkeeper often close in 1–3 days). Closing locks the month: categories can't change, so numbers you send investors stay true (research §3.4).</p>
    ${CLOSE_ITEMS.map((i, n) => { const st = cs.items[i.id]; const blocker = closed ? null : closeBlocker(s, m, i.id); return html`<div class="${ID}-check">
      <span class="dot ${st ? 'ok' : ''}">${st ? '✓' : n + 1}</span>
      <div><b>${i.title}</b>${st === 'na' ? html` ${badge('N/A')}` : ''}<div class="small muted">${i.help}</div><div class="small" style="margin-top:4px">${itemDetail(s, m, i, L)}</div>${blocker && !st ? html`<div class="small warn">${blocker}</div>` : ''}</div>
      <div class="actions">${closed || st ? '' : html`<button class="sm ${i.id === 'lock' ? 'primary' : ''}" data-close="${i.id}" ${blocker ? 'disabled' : ''}>${i.id === 'lock' ? 'Close & lock' : 'Mark done'} (${closeHours(s, i)}h)</button>${i.na ? html`<button class="sm" data-na="${i.id}">N/A…</button>` : ''}`}</div></div>`; })}
  </section>`;
}

function taxView(s, L) {
  const e = entityInfo(s);
  const b = ensureBooks(s);
  const items = calendarItems(s).filter((it) => it.day <= s.day + 400 && (it.day >= s.day - 120 || it.status === 'overdue' || !it.status));
  const year = yearOf(s);
  const lastYear = year - 1;
  const contractors = contractorTotals(s, year);
  const nexus = nexusStatus(s).slice(0, 8);
  const payees = s.apps.bank?.payees ?? [];
  const action = (it) => {
    if (it.kind === 'info' || it.status === 'done' || it.status === 'na') return '';
    if (it.owner === 'legal' && it.day - s.day <= 75) return html`<a class="btn sm" href="#/legal">File in Legal →</a>`;
    if (it.day - s.day > 75 && it.status !== 'overdue') return html`<span class="small muted">opens ${short(s, it.day - 75)}</span>`;
    if (it.owner === 'legal') return html`<a class="btn sm" href="#/legal">File in Legal →</a>`;
    if (it.id.startsWith('1120')) return html`<button class="sm primary" data-cpa="${it.year}">Send to CPA…</button>${it.status !== 'extended' && it.day >= s.day ? html` <button class="sm" data-ext="${it.year}">File 7004 extension</button>` : ''}`;
    if (it.id.startsWith('cest-')) { const d = estimateDue(s, it.year, L); return d > 0 ? html`<button class="sm primary" data-est="${it.id}" data-amt="${d}">Pay ${money(d)}</button>` : html`<button class="sm" data-estna="${it.id}">Not required (no profit)</button>`; }
    if (it.id.startsWith('oss-')) return html`<button class="sm primary" data-oss="${it.id}">File return (${usd(b.vat.payable)})</button>`;
    return '';
  };
  return html`
    <section class="panel"><h2>Entity</h2>
      <div class="${ID}-kpis">
        ${stat('Entity', { ccorp: 'Delaware C-corp', llc: 'Delaware LLC', none: 'Not incorporated' }[e.entity], e.incorporatedDay != null ? `since ${fmtDate(s, e.incorporatedDay)}` : 'sole proprietor: everything is on your personal return')}
        ${e.entity === 'ccorp' ? stat('Authorized shares', e.authorized.toLocaleString(), e.authorizedFromLegal ? 'from Legal' : 'Atlas/Clerky default (assumed)') : ''}
        ${e.entity === 'ccorp' ? stat('Issued shares', e.issued.toLocaleString()) : ''}
        ${stat('NOL carryforward', money(b.nol ?? 0), 'federal, offsets 80% of future income')}
        ${e.entity === 'ccorp' ? stat('Delaware franchise tax', `${usd(franchiseTaxAuthorized(e.authorized) + TAX.deAnnualReportFee)} vs ~${usd(TAX.deMinTax + TAX.deAnnualReportFee)}`, 'Authorized Shares notice vs Assumed Par Value Capital (filed in Legal)') : ''}
      </div>
      <p class="small muted">BOI reports: US-formed companies have been exempt since FinCEN's March 2025 interim rule. R&D: domestic software development is deductible again from 2025 (§174A); foreign contractors' R&E still amortizes over 15 years. General information, not tax advice.</p>
    </section>
    <section class="panel"><h2>Compliance calendar</h2>
      ${items.length ? html`<div class="table-wrap"><table><thead><tr><th>Due</th><th>Item</th><th>Status</th><th></th></tr></thead><tbody>
        ${items.map((it) => html`<tr><td class="small ${it.day < s.day && !it.status ? 'neg' : ''}">${fmtDate(s, it.day)}</td><td><b>${it.title}</b>${it.owner === 'legal' ? html` <span class="badge">Legal</span>` : ''}<div class="${ID}-sub">${it.detail}</div>${it.rec?.note ? html`<div class="${ID}-sub">${it.rec.note}</div>` : ''}</td>
          <td>${it.kind === 'info' ? badge('personal') : it.status ? statusBadge(it.status) : it.day < s.day ? statusBadge('overdue') : badge('upcoming')}${it.rec?.amount ? html`<div class="${ID}-sub">${usd(it.rec.amount)}</div>` : ''}</td>
          <td style="white-space:nowrap">${action(it)}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No filings apply yet.</p>`}
    </section>
    <div class="grid-2">
      <section class="panel"><h2>Contractors paid in ${year} (1099-NEC)</h2>
        ${contractors.length ? contractors.map((c) => { const p = payees.find((x) => x.name === c.payee); return html`<div class="${ID}-row"><span>${c.payee} ${c.required ? badge('1099 required', 'warn') : badge(`under $${TAX.form1099Threshold.toLocaleString()}`)} ${p ? (p.w9 ? badge('W-9', 'good') : badge('no W-9', 'bad')) : ''}</span><span>${usd(c.total)}</span></div>`; }) : html`<p class="muted small">No contractor payments booked this year.</p>`}
        <p class="small muted">Threshold is $2,000 for payments made in 2026 and later (was $600). Filed from the Legal app; this list uses your <i>books</i> categories, so a contractor payment miscategorized as software is easy to miss.</p></section>
      <section class="panel"><h2>Sales tax nexus (${year})</h2>
        ${nexus.length ? nexus.map((r) => html`<div class="${ID}-row"><span>${r.state} ${r.taxable ? badge('SaaS taxable', 'warn') : badge('SaaS exempt')} ${r.registered ? badge('registered', 'good') : r.crossed ? badge('nexus!', 'bad') : ''}</span><span>${money(r.sales)} / ${money(r.threshold)}${r.crossed && !r.registered ? html` <button class="sm" data-nexus="${r.state}">Register (2h)</button>` : ''}</span></div>`) : html`<p class="muted small">No US sales yet.</p>`}
        <p class="small muted">Economic nexus: usually $100K of sales in a state (CA, TX, NY $500K). SaaS taxability varies by state and sources conflict. Stripe Tax monitors thresholds but you still have to register; an MoR handles it for you (research §4.3).</p>
        ${s.company.model === 'b2c' ? html`<h3>EU / UK VAT</h3>
          ${s.stripe?.settings.merchantOfRecord ? html`<p class="small pos">Your merchant of record collects and remits VAT.</p>` : html`
          <div class="${ID}-row"><span>EU/UK consumer sales (all time)</span><span>${usd(b.vat.intlB2cSales)}</span></div>
          <div class="${ID}-row"><span>VAT you owe but didn't collect</span><span class="${b.vat.exposure > 0 ? 'neg' : ''}">${usd(b.vat.exposure)}</span></div>
          <div class="${ID}-row"><span>Status</span><span>${b.vat.registered ? badge(`registered ${fmtDate(s, b.vat.registeredDay)}`, 'good') : badge('not registered', b.vat.firstSaleDay != null ? 'bad' : '')}</span></div>
          ${b.vat.registered ? html`<p class="small muted">${s.stripe?.settings.stripeTax ? 'Stripe Tax adds VAT on top of your price: it passes through to the quarterly return.' : 'Stripe Tax is off, so VAT is not added to the price and comes out of your revenue at each return (payable now ' + usd(b.vat.payable) + ').'}</p>` : html`<button class="sm primary" data-vat ${b.vat.firstSaleDay == null ? 'disabled' : ''}>Register for Non-Union OSS + UK VAT (3h)</button>`}
          <p class="small muted">Non-EU/UK sellers owe VAT on digital services to consumers from the first sale; no threshold (research §4.4). Registering means paying back what you should have charged.</p>`}` : ''}
      </section>
    </div>
    ${e.entity === 'ccorp' && allMonths(s).some((m) => m.startsWith(String(lastYear))) ? html`<section class="panel"><h2>${lastYear} tax return estimate</h2>${(() => { const q = cpaQuote(s, lastYear, L); return html`
      <div class="${ID}-row"><span>Pre-tax income (accrual books)</span><span>${usd(q.booksPreTax)}</span></div>
      <div class="${ID}-row"><span>Federal tax (21% after NOL)</span><span>${usd(q.booksTax ?? 0)}</span></div>
      ${q.errors ? html`<p class="small muted">${q.errors} transaction(s) are miscategorized: the CPA will correct them, so the return can differ from these books.</p>` : ''}
      <div class="${ID}-row"><span>CPA fee: base + ${q.unclosed} unclosed month(s) catch-up + ${q.errors} miscategorized transaction(s)</span><span>${usd(q.fee)}</span></div>`; })()}
      <p class="small muted">CPA fees are designer estimates ($1,000–$3,500 for a C-corp return). Clean, closed books are cheaper.</p></section>` : ''}`;
}

function coaView(s, L) {
  const bs = balanceSheet(s, monthOf(s), L);
  const ytdMonths = allMonths(s).filter((m) => m.startsWith(monthOf(s).slice(0, 4)));
  const ytd = (a) => -sumBy(ytdMonths, (m) => L[m]?.[a] ?? 0);
  return html`<section class="panel"><h2>Chart of accounts</h2>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Account</th><th>Type</th><th class="r">Balance / YTD</th></tr></thead><tbody>
    ${Object.entries(COA).map(([a, x]) => html`<tr class="clickable" data-drill="${a}"><td>${a}</td><td>${x.name}</td><td class="small">${x.type}</td><td class="r">${isPL(a) ? usd(ytd(a)) : usd((x.type === 'asset' ? 1 : -1) * (bs.cum[a] ?? 0))}</td></tr>`)}</tbody></table></div>
    <p class="small muted">From research §3.3, trimmed to what this company produces. Bank categories map to accounts (e.g. Hosting → 5000 COGS, Software → 6010 R&D tools, Owner contribution → 3200 equity).</p></section>`;
}

function serviceView(s) {
  const b = ensureBooks(s);
  return html`<section class="panel"><h2>Who keeps your books?</h2>
    <p class="small muted">Bench shut down overnight on Dec 27, 2024 (~12,000–35,000 customers). Lesson: whoever does the work, your books must live in a standard ledger you can export. AI tools categorize; you still review and own the close (research §3.5).</p>
    <div class="${ID}-cards">${Object.entries(BOOKKEEPING).map(([k, v]) => html`<div class="card ${ID}-card ${b.service === k ? 'sel' : ''}">
      <b>${v.label}</b><div class="score" style="font-size:20px">${v.price ? `${usd(v.price)}/mo` : 'Free'}</div>
      <div class="small">${v.note}</div>
      <ul class="small"><li>Review: ${v.autoReview ? 'done for you within ~3 days' : `you, ~${v.reviewMin} min/transaction`}</li><li>Close: you spend ~${Math.round(v.closeFactor * 100)}% of the DIY hours</li><li>Categorization errors left: ${v.errorRate >= 0.08 ? '~1 in 10' : v.errorRate >= 0.05 ? '~1 in 14' : v.errorRate >= 0.02 ? '~1 in 40' : '~1 in 100'} [design]</li></ul>
      ${b.service === k ? badge('Current', 'good') : html`<button class="sm primary" data-svc="${k}">Switch (2h onboarding)</button>`}</div>`)}</div>
    <div class="app-actions" style="margin-top:12px"><button data-act="exportGl">Export general ledger (CSV)</button></div></section>`;
}

// ---------- drill-down ----------

function drill(ctx, acct, L) {
  const s = ctx.state;
  if (!COA[acct]) return;
  const months = ui.period ? periodMonths(s) : allMonths(s).slice(-6);
  const lines = months.flatMap((m) => bankLinesFor(s, acct, m));
  const stripeFed = ['1050', '2500', '4000', '4900', '4910', '5100', '5110'].includes(acct);
  modal({
    title: `${acct} · ${COA[acct].name}`,
    wide: true,
    body: html`${stripeFed ? html`<p class="small muted">Fed from Stripe activity by the revenue engine: charges, refunds, disputes and fees are journaled daily; revenue is recognized per day of each service period.</p>
        <div class="table-wrap"><table><thead><tr><th>Month</th><th class="r">Gross</th><th class="r">Refunds</th><th class="r">Disputes</th><th class="r">Fees</th><th class="r">This account</th></tr></thead><tbody>
        ${months.map((m) => { const c = ensureBooks(s).cash[m] ?? { gross: 0, refunds: 0, chargebacks: 0, fees: 0 }; return html`<tr><td>${monthLabel(m)}</td><td class="r">${usd(c.gross)}</td><td class="r">${usd(c.refunds)}</td><td class="r">${usd(c.chargebacks)}</td><td class="r">${usd(c.fees)}</td><td class="r">${usd(L[m]?.[acct] ?? 0)}</td></tr>`; })}</tbody></table></div>` : ''}
      ${lines.length ? html`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Counterparty</th><th>Category</th><th class="r">Amount</th></tr></thead><tbody>${lines.slice(-200).reverse().map((t) => html`<tr><td class="small">${fmtDate(s, t.day)}</td><td>${t.counterparty}<div class="${ID}-sub">${descriptorFor(t)}</div></td><td class="small">${catLabel(bookCategory(s, t))}</td><td class="r">${usd(t.amount)}</td></tr>`)}</tbody></table></div>` : stripeFed ? '' : html`<p class="empty">No bank transactions in this period.</p>`}`,
  });
}

function cpaModal(ctx, year, L) {
  const s = ctx.state;
  const q = cpaQuote(s, year, L);
  modal({
    title: `Send ${year} books to your CPA (Form 1120)`,
    body: html`<div class="${ID}-row"><span>Base return fee</span><span>${usd(q.base)}</span></div>
      <div class="${ID}-row"><span>Catch-up bookkeeping: ${q.unclosed} month(s) not closed × $${TAX.cpaCatchUpPerMonth}</span><span>${usd(q.catchUp)}</span></div>
      <div class="${ID}-row"><span>Fixing ${q.errors} miscategorized transaction(s) × $${TAX.cpaPerMisclass}</span><span>${usd(q.fix)}</span></div>
      <div class="${ID}-row"><span>Pre-tax income ${year} (as filed, after the CPA's corrections)</span><span>${usd(q.preTax)}</span></div>
      ${Math.abs(q.adjustment) >= 1 ? html`<div class="${ID}-row"><span>CPA adjustment for miscategorized transactions (your books said ${usd(q.booksPreTax)})</span><span>${usd(q.adjustment)}</span></div>` : ''}
      <div class="${ID}-row"><span>Federal income tax (21%, after NOL) − estimates paid ${usd(q.estimatesPaid)}</span><span>${usd(q.balanceDue)}</span></div>
      ${q.underpaymentPenalty ? html`<div class="${ID}-row"><span>Estimated-tax underpayment penalty (Form 2220)</span><span>${usd(q.underpaymentPenalty)}</span></div>` : ''}
      <p class="small muted">Fees are designer estimates. You'll spend ~2h answering the CPA's questions.</p>`,
    actions: [{ label: 'Cancel' }, { label: `Pay ${usd(q.fee + q.balanceDue + q.underpaymentPenalty)} & file`, primary: true, onClick: () => ctx.act((st) => { fileWithCpa(st, year); }, { hours: 2, label: 'Tax return with CPA' }) }],
  });
}

function exportGl(s, L) {
  const rows = [];
  for (const m of Object.keys(L).sort()) for (const [a, v] of Object.entries(L[m])) if (Math.abs(v) > 0.004) rows.push({ Month: m, Account: a, Name: COA[a]?.name ?? a, Debit: v > 0 ? v.toFixed(2) : '', Credit: v < 0 ? (-v).toFixed(2) : '' });
  download(`general-ledger-${isoDate(s)}.csv`, toCsv(rows));
}

// ---------- app ----------

export default {
  id: ID,
  title: 'Books',
  icon: '📒',
  group: 'Money',
  badge: (state) => {
    if (!state.apps.books) return 0;
    const overdue = calendarItems(state).filter((i) => i.status === 'overdue').length;
    return overdue || (reviewQueue(state).length > 25 ? reviewQueue(state).length : 0);
  },
  render(root, ctx) {
    const s = ctx.state;
    syncLedger(s);
    const L = ledgerByMonth(s);
    const view = ctx.params.split('/')[0] || 'home';
    const q = reviewQueue(s).length;
    const overdue = calendarItems(s).filter((i) => i.status === 'overdue' || (!i.status && i.kind !== 'info' && i.day < s.day)).length;
    const body = { feed: () => feed(s), pl: () => plView(s, L), bs: () => bsView(s, L), close: () => closeView(s, L), tax: () => taxView(s, L), coa: () => coaView(s, L), service: () => serviceView(s) }[view]?.() ?? overview(s, L);
    mount(root, html`${appCss(ID)}
      <div class="app-head"><div><h1>Books</h1><p>Double-entry books for ${s.company.name}: every number traces to a bank transaction or a Stripe charge.</p></div>
        <div class="app-actions"><span class="badge">${service(s).label}</span></div></div>
      ${tabs(ID, [{ id: 'home', label: 'Overview' }, { id: 'feed', label: 'Bank feed', count: q, tone: 'warn' }, { id: 'pl', label: 'Profit & loss' }, { id: 'bs', label: 'Balance sheet' }, { id: 'close', label: 'Month-end close' }, { id: 'tax', label: 'Tax & compliance', count: overdue, tone: 'bad' }, { id: 'coa', label: 'Chart of accounts' }, { id: 'service', label: 'Bookkeeping service' }], view)}
      ${body}`);

    const reviewH = service(s).reviewMin / 60;
    on(root, 'change', '#feedMonth', (e) => { ui.feedMonth = e.target.value; ctx.render(); });
    on(root, 'click', '[data-feedmonth]', (e, el) => { ui.feedMonth = el.dataset.feedmonth; });
    on(root, 'click', '[data-confirm]', (e, el) => {
      const id = el.dataset.confirm;
      const cat = root.querySelector(`select[data-cat="${id}"]`).value;
      const rule = root.querySelector(`input[data-rule="${id}"]`).checked;
      ctx.act((st) => categorize(st, id, cat, { rule }), { hours: reviewH, label: 'Review transactions' });
    });
    on(root, 'change', '[data-recat]', (e, el) => ctx.act((st) => categorize(st, el.dataset.recat, el.value), { hours: reviewH, label: 'Recategorize' }));
    on(root, 'click', '[data-unrule]', (e, el) => ctx.act((st) => { delete ensureBooks(st).rules[el.dataset.unrule]; }, { hours: 0.02, label: 'Edit rules' }));
    on(root, 'click', '[data-act=confirmAll]', () => {
      const rows = [...root.querySelectorAll('tr[data-row]')].map((tr) => tr.dataset.row);
      ctx.act((st) => { for (const id of rows) { const t = st.bank.txns.find((x) => x.id === id); categorize(st, id, bookCategory(st, t)); } }, { hours: Math.round(rows.length * service(s).reviewMin * 0.25 / 60 * 100) / 100, label: 'Accept AI categories' });
    });
    on(root, 'change', '#period', (e) => { ui.period = e.target.value; ctx.render(); });
    on(root, 'change', '#basis', (e) => { ui.basis = e.target.value; ctx.render(); });
    on(root, 'change', '#bsMonth', (e) => { ui.bsMonth = e.target.value; ctx.render(); });
    on(root, 'change', '#closeMonth', (e) => { ui.closeMonth = e.target.value; ctx.render(); });
    on(root, 'click', '[data-drill]', (e, el) => el.dataset.drill && drill(ctx, el.dataset.drill, L));
    on(root, 'click', '[data-act=exportPl]', () => {
      const months = periodMonths(s);
      const pl = profitAndLoss(s, months, ui.basis, L);
      const rows = pl.sections.flatMap((sec) => [...sec.lines, { name: sec.totalLabel, values: sec.total }]).concat([{ name: 'Net income', values: pl.netIncome }]).map((l) => ({ Account: l.acct ?? '', Line: l.name, ...Object.fromEntries(months.map((m, i) => [m, l.values[i].toFixed(2)])) }));
      download(`pnl-${ui.basis}-${isoDate(s)}.csv`, toCsv(rows));
    });
    on(root, 'click', '[data-act=exportGl]', () => exportGl(s, L));
    const closeM = () => root.querySelector('#closeMonth')?.value;
    on(root, 'click', '[data-close]', (e, el) => {
      const m = closeM(), id = el.dataset.close;
      const item = CLOSE_ITEMS.find((i) => i.id === id);
      ctx.act((st) => {
        const blocker = closeBlocker(st, m, id);
        if (blocker) throw new Error(blocker);
        closeState(st, m).items[id] = 'done';
        if (id === 'lock') { ensureBooks(st).closed[m] = { day: st.day }; notify(st, `Closed the books for ${monthLabel(m)}.`, { type: 'good', app: ID }); }
      }, { hours: closeHours(s, item), label: 'Month-end close' });
    });
    on(root, 'click', '[data-na]', (e, el) => {
      const m = closeM(), id = el.dataset.na;
      const reasons = { accruals: ['All vendors billed through month-end', 'No usage-based or unbilled services', 'Immaterial (< $100)'], prepaids: ['No annual prepayments this month', 'Prepayments below materiality (< $100)', 'Already amortized'], payroll: ['No payroll this month (no employees)', 'Contractors only'], fixed: ['No purchases above the $2,500 capitalization threshold', 'No equipment purchases'] }[id] ?? ['Not applicable'];
      modal({ title: `Mark "${CLOSE_ITEMS.find((i) => i.id === id).title}" N/A`, body: html`<label>Reason (your CPA will read this) <select name="reason">${reasons.map((r) => html`<option>${r}</option>`)}</select></label>`,
        actions: [{ label: 'Cancel' }, { label: 'Mark N/A', primary: true, onClick: (d, form) => ctx.act((st) => { const cs = closeState(st, m); cs.na ??= {}; cs.na[id] = form.reason.value; cs.items[id] = 'na'; }, { hours: 0.05, label: 'Month-end close' }) }] });
    });
    on(root, 'submit', '[data-recon]', (e, el) => {
      e.preventDefault();
      const m = closeM(), kind = el.dataset.recon;
      const f = formData(el);
      ctx.act((st) => {
        const err = checkReconciliation(st, m, kind, f);
        if (err) { ctx.toast(err, 'bad'); return; }
        const cs = closeState(st, m); cs.recon ??= {}; cs.recon[kind] = { ...f, day: st.day };
        ctx.toast('Reconciled: difference $0.00.', 'good');
      }, { hours: 0.25, label: 'Reconciliation' });
    });
    on(root, 'submit', '[data-accrual]', (e, el) => { e.preventDefault(); const f = formData(el); ctx.act((st) => { addAccrual(st, el.dataset.accrual, { amount: f.amount, acct: f.acct, memo: f.memo }); }, { hours: 0.25, label: 'Journal entry' }); });
    on(root, 'click', '[data-prepaid]', (e, el) => ctx.act((st) => { addPrepaid(st, el.dataset.prepaid, 12); }, { hours: 0.25, label: 'Journal entry' }));
    on(root, 'click', '[data-rmje]', (e, el) => ctx.act((st) => { removeAdjustment(st, el.dataset.rmje); }, { hours: 0.05, label: 'Journal entry' }));
    on(root, 'click', '[data-act=reopen]', () => {
      const m = closeM();
      ctx.act((st) => {
        const b = ensureBooks(st);
        const later = Object.keys(b.closed).filter((x) => x > m);
        if (later.length) throw new Error(`Reopen ${later.sort().at(-1)} first.`);
        delete b.closed[m];
        delete closeState(st, m).items.lock;
      }, { hours: 0.25, label: 'Reopen period' });
    });
    on(root, 'click', '[data-svc]', (e, el) => ctx.act((st) => {
      const b = ensureBooks(st);
      const k = el.dataset.svc;
      const v = BOOKKEEPING[k];
      st.recurring = st.recurring.filter((r) => !r.bookkeeping);
      if (v.price) { const r = addRecurring(st, { vendor: v.vendor, amount: v.price, category: 'accounting', dayOfMonth: 1, note: 'Bookkeeping service' }); r.bookkeeping = true; }
      b.service = k; b.serviceSince = st.day;
      notify(st, `Switched bookkeeping to ${v.label}${v.price ? ` (${money(v.price)}/mo)` : ''}.`, { type: 'info', app: ID });
    }, { hours: 2, label: 'Bookkeeping onboarding' }));
    on(root, 'click', '[data-cpa]', (e, el) => cpaModal(ctx, +el.dataset.cpa, L));
    on(root, 'click', '[data-ext]', (e, el) => ctx.act((st) => fileExtension(st, +el.dataset.ext), { hours: 0.25, label: 'Form 7004' }));
    on(root, 'click', '[data-est]', (e, el) => ctx.act((st) => payEstimatedTax(st, el.dataset.est, +el.dataset.amt), { hours: 0.25, label: 'Estimated tax' }));
    on(root, 'click', '[data-estna]', (e, el) => ctx.act((st) => { const r = (ensureBooks(st).compliance[el.dataset.estna] ??= {}); r.status = 'na'; r.day = st.day; }, { hours: 0.05, label: 'Estimated tax' }));
    on(root, 'click', '[data-oss]', (e, el) => ctx.act((st) => fileVatReturn(st, el.dataset.oss), { hours: 1, label: 'VAT return' }));
    on(root, 'click', '[data-vat]', () => ctx.act((st) => { const back = registerVat(st); ctx.toast(`Registered for Non-Union OSS + UK VAT. Paid ${money(back)} in back VAT.`, 'warn'); }, { hours: 3, label: 'VAT registration' }));
    on(root, 'click', '[data-nexus]', (e, el) => ctx.act((st) => { const back = registerNexus(st, el.dataset.nexus); if (back) ctx.toast(`Registered in ${el.dataset.nexus}; paid ${money(back)} in back sales tax + penalty.`, 'warn'); }, { hours: 2, label: 'Sales tax registration' }));
  },
  onDay(state) {
    syncLedger(state);
    serviceAutoReview(state);
    complianceDay(state);
  },
};

