// Financing: the founder's personal balance sheet and runway, the day-job decision, and what real
// lenders would offer given your credit profile (personal loans, cards, HELOC, 401(k) loan, ROBS,
// SBA, family loans...). Underwriting rules and products come from public/data/lenders.js
// (docs/research/personal-financing.md).

import { html, mount, on, formData, table, stat, badge, modal, toast } from '../core/ui.js';
import { money, pct, fmtDate } from '../core/util.js';
import { ensurePersonal, contributeToCompany, personalRunwayMonths, personalTxn, startJobSearch, cashAdvance, cardBalance, cardAvailable, cashAdvanceLimit, utilization, refreshDebtPayments } from '../core/personal.js';
import { post, balance } from '../core/bank.js';
import { notify } from '../core/state.js';
import { CREDIT } from '../core/params.js';
import { lenderProfile, inNoticeWindow, NOTICE_DAYS, applyForFinancing, ensureDebt, businessDebtBalance, monthlyDebtService, isBusinessProduct, prepayBusinessLoan } from '../core/debt.js';
import * as lenders from '../data/lenders.js';

export { lenderProfile, inNoticeWindow, NOTICE_DAYS };
const lendersError = null;
const HARD_PULL_POINTS = CREDIT.hardPullPoints; // a hard inquiry costs a few FICO points and is scored for 12 months

function offers(state) {
  if (!lenders) return [];
  const prof = lenderProfile(state);
  return lenders.LENDER_PRODUCTS.map((product) => ({ product, result: lenders.underwrite(prof, product) }));
}

const JOBS = {
  quit: { label: 'Quit, full-time founder', hours: null, incomeShare: 0 },
  part_time: { label: 'Part-time job', hours: 40, incomeShare: 0.45 },
  full_time: { label: 'Full-time job (nights & weekends)', hours: 25, incomeShare: 1 },
};

export default {
  id: 'financing',
  title: 'Financing',
  icon: '🏧',
  group: 'Capital',
  render(root, ctx) {
    const s = ctx.state;
    const p = ensurePersonal(s);
    const runway = personalRunwayMonths(s);
    const debt = p.loans.reduce((a, l) => a + l.balance, 0) + p.cards.reduce((a, c) => a + cardBalance(c), 0);
    const D = ensureDebt(s);
    const bizDebt = businessDebtBalance(s);
    const pending = D.applications.filter((a) => a.status === 'pending');
    const tab = ctx.params || 'overview';
    const list = offers(s);
    mount(root, html`
      <div class="app-head"><div><h1>Financing</h1><p>Your personal money is your first runway. Bootstrapping means living on savings, a day job or early revenue. Borrowing personally to fund a startup is common and risky: you owe it even if the company dies. General information, not financial advice.</p></div></div>
      <div class="stats">
        ${stat('Personal savings', money(p.liquidSavings), `${money(p.monthlyLivingCosts)}/mo living costs`, p.liquidSavings < 0 ? 'bad' : '')}
        ${stat('Personal runway', runway === Infinity ? 'Covered' : `${runway.toFixed(1)} mo`, 'savings ÷ monthly shortfall', runway < 3 ? 'bad' : runway < 6 ? 'warn' : '')}
        ${stat('Credit score', Math.round(p.fico), [p.inquiries.filter((q) => s.day - q.day < 365).length ? `${p.inquiries.filter((q) => s.day - q.day < 365).length} hard pulls (12 mo)` : 'FICO estimate', p.cards.length ? `utilization ${pct(utilization(s), 0)}` : ''].filter(Boolean).join(' · '), p.fico < 640 ? 'bad' : p.fico < 700 ? 'warn' : 'good')}
        ${stat('Personal debt', money(debt), `${money(p.monthlyDebtPayments)}/mo payments`, debt > 0 ? 'warn' : '')}
        ${stat('Company debt', money(bizDebt), bizDebt > 0 ? `~${money(monthlyDebtService(s))}/mo debt service` : 'none', bizDebt > 0 ? 'warn' : '')}
        ${stat('Company cash', money(balance(s)), 'separate from your personal money')}
      </div>
      ${p.jobSearch ? html`<div class="callout warn">Job search in progress since ${fmtDate(s, p.jobSearch.startDay)}: expect an offer around ${fmtDate(s, p.jobSearch.offerDay)}. Until then there is no paycheck.</div>` : ''}
      ${pending.length ? html`<div class="callout">Pending applications: ${pending.map((a) => html`<b>${a.name}</b> (${money(a.amount)}, decision ~${fmtDate(s, a.fundDay)}) `)}</div>` : ''}
      <div class="tabs">${['overview', 'offers', 'loans', 'ledger'].map((t) => html`<a href="#/financing/${t}" class="${t === tab ? 'active' : ''}">${{ overview: 'Overview', offers: 'Lending offers', loans: 'Your debts', ledger: 'Personal ledger' }[t]}</a>`)}</div>
      ${tab === 'overview' ? html`
        <div class="grid-2">
          <section class="panel">
            <h2>Your situation</h2>
            <form id="profileForm">
              <div class="grid-2">
                <label>Credit score (FICO) <input type="number" name="fico" min="300" max="850" value="${Math.round(p.fico)}" /></label>
                <label>Monthly living costs ($) <input type="number" name="monthlyLivingCosts" min="0" step="100" value="${p.monthlyLivingCosts}" /></label>
                <label>Brokerage / investments ($) <input type="number" name="brokerage" min="0" step="1000" value="${p.brokerage}" /></label>
                <label>Retirement, vested ($) <input type="number" name="retirementVested" min="0" step="1000" value="${p.retirementVested}" /></label>
                <label>Home equity ($) <input type="number" name="homeEquity" min="0" step="5000" value="${p.homeEquity}" /></label>
                <label>Other monthly debt payments ($) <input type="number" name="otherDebt" min="0" step="50" value="${p.otherDebtPayments}" /></label>
              </div>
              <div class="grid-2">
                <label>Partner / household income ($/yr) <input type="number" name="partnerIncome" min="0" step="1000" value="${p.partnerIncome ?? 0}" /></label>
                <label>Family willing to lend ($) <input type="number" name="familyOfferAmount" min="0" step="1000" value="${p.familyOfferAmount ?? 0}" /></label>
              </div>
              <label><input type="checkbox" name="usCitizenOrResident" ${p.usCitizenOrResident ? 'checked' : ''} /> US citizen or permanent resident (most US lenders)</label>
              <label><input type="checkbox" name="usCitizen" ${(p.usCitizen ?? p.usCitizenOrResident) ? 'checked' : ''} /> US citizen (SBA requires 100% citizen ownership since March 2026)</label>
              <button>Update</button>
            </form>
          </section>
          <section class="panel">
            <h2>Day job</h2>
            <p class="muted">Keeping a job is the classic bootstrapper's funding source: verifiable income, health insurance, and lenders will still approve you. It costs founder hours. Lenders want current W-2 income or 2 years of self-employment tax returns, so <b>apply for credit before you quit</b>. Quitting is instant; finding a job again takes 2–4 months.</p>
            <div class="list">${Object.entries(JOBS).map(([k, j]) => html`<label class="radio-card"><input type="radio" name="job" value="${k}" ${p.job === k ? 'checked' : ''} /><b>${j.label}</b><span>${k === 'quit' ? 'All your hours go to the company. No paycheck.' : `${money((p.priorW2Income || 0) * j.incomeShare)}/yr before tax · founder time capped at ${j.hours}h/week`}</span></label>`)}</div>
            <button id="saveJob">Change job situation</button>
            <h2 style="margin-top:14px">Move money</h2>
            <form id="moveForm" class="inline">
              <label>Amount ($) <input type="number" name="amount" min="1" step="100" /></label>
              <label>As <select name="as"><option value="equity">Owner contribution (equity)</option><option value="loan">Founder loan to company</option></select></label>
              <button class="primary">Personal → company</button>
            </form>
            <form id="repayForm" class="inline">
              <label>Amount ($) <input type="number" name="amount" min="1" step="100" /></label>
              <button>Company repays founder loan → personal</button>
            </form>
          </section>
        </div>` : ''}
      ${tab === 'offers' ? html`
        <section class="panel">
          <h2>What lenders would offer you today</h2>
          ${inNoticeWindow(s) ? html`<div class="callout good">You're still in your notice period (until ${fmtDate(s, NOTICE_DAYS)}). Lenders can verify your salary, so this is the moment to apply. Once your last paycheck lands, almost every product disappears.</div>` : ensurePersonal(s).job === 'quit' ? html`<div class="callout warn">You have no verifiable income. Personal loans, HELOCs and 401(k) loans need W-2 pay stubs or two years of self-employment tax returns. Founders who plan to borrow apply before they quit.</div>` : ''}
          <p class="muted small">Based on your credit score, income type, debt-to-income, savings, assets and company revenue. Applying is a hard credit pull (about −${HARD_PULL_POINTS} points). Many personal-loan lenders restrict business use; read the notes.</p>
          ${!lenders ? html`<p class="muted">${lendersError ? `Lender data unavailable: ${lendersError}` : 'Loading lender data…'}</p>` : table({
            columns: [
              { label: 'Product', render: (o) => html`<b>${o.product.name}</b><div class="small muted">${o.product.notes ?? ''}</div>` },
              { label: 'Decision', render: (o) => (o.result.approved ? html`${badge(`${lenders.approvalLabel(o.result)} (~${Math.round(lenders.approvalProbability(o.result) * 100)}%)`, o.result.approvalOdds === 'high' ? 'good' : o.result.approvalOdds === 'low' ? 'bad' : 'warn')}<div class="small muted">${isBusinessProduct(o.product) ? 'Funds the company' : 'Funds you personally'} · decision in ~${o.product.fundingDays} days</div>${(o.result.warnings ?? []).map((w) => html`<div class="small warn">⚠ ${w}</div>`)}` : html`${badge('Declined', 'bad')}<div class="small muted">${o.result.reason}</div>`) },
              { label: 'Up to', align: 'right', render: (o) => (o.result.approved ? money(o.result.maxAmount) : '—') },
              { label: 'APR', align: 'right', render: (o) => (o.result.approved ? `${o.result.apr?.toFixed?.(1) ?? o.result.apr}%` : '—') },
              { label: 'Payment at max', align: 'right', render: (o) => (o.result.approved && o.result.monthlyPaymentAtMax ? `${money(o.result.monthlyPaymentAtMax)}/mo` : '—') },
              { label: 'Business use', render: (o) => (o.product.businessUseAllowed === true ? 'Allowed' : o.product.businessUseAllowed === 'restricted' ? badge('Restricted', 'warn') : badge('Not allowed', 'bad')) },
              { label: '', render: (o) => (o.result.approved ? (pending.some((a) => a.productId === o.product.id) ? badge('Pending', 'warn') : html`<button class="sm" data-apply="${o.product.id}">Apply</button>`) : '') },
            ],
            rows: list,
          })}
        </section>` : ''}
      ${tab === 'loans' ? html`
        <section class="panel">
          <h2>Your personal debts</h2>
          ${table({
            columns: [
              { label: 'Debt', render: (l) => html`${l.name}${l.personalGuarantee ? html` ${badge('personally liable', 'warn')}` : ''}` },
              { label: 'Taken', render: (l) => fmtDate(s, l.startDay) },
              { label: 'Original', align: 'right', render: (l) => money(l.principal) },
              { label: 'Balance', align: 'right', render: (l) => money(l.balance) },
              { label: 'APR', align: 'right', render: (l) => `${l.apr}%${l.introAprMonths ? ` (0% for ${l.introAprMonths} mo)` : ''}` },
              { label: 'Payment', align: 'right', render: (l) => (l.payment ? `${money(l.payment)}/mo` : 'min. ~1% + interest') },
              { label: '', render: (l) => (l.balance > 0 ? html`<button class="sm" data-payoff="${l.id}">Pay off</button>` : badge('Paid', 'good')) },
            ],
            rows: p.loans,
            empty: 'No personal loans.',
          })}
          <h2 style="margin-top:14px">Personal credit cards</h2>
          <p class="small muted">A card is a payment method, not cash. Pay company tools and ads with it from Bank (booked as a founder loan the company owes you). Cash advances: up to ${Math.round(CREDIT.cashAdvanceShareOfLimit * 100)}% of the limit, ${Math.round(CREDIT.cashAdvanceFeePct * 100)}% fee (min $${CREDIT.cashAdvanceFeeMin}), ${CREDIT.cashAdvanceApr}% APR from day one. Utilization over 30% costs ~20 FICO points, over 70% ~45.</p>
          ${table({
            columns: [
              { label: 'Card', render: (c) => html`${c.name} ••${c.last4}` },
              { label: 'Limit', align: 'right', render: (c) => money(c.limit) },
              { label: 'Balance', align: 'right', render: (c) => html`${money(cardBalance(c))}${c.advanceBalance > 0 ? html`<div class="small muted">incl. ${money(c.advanceBalance)} cash advance</div>` : ''}` },
              { label: 'Available', align: 'right', render: (c) => money(cardAvailable(c)) },
              { label: 'APR', align: 'right', render: (c) => (s.day < c.introUntilDay ? `0% until ${fmtDate(s, c.introUntilDay)}, then ${c.apr}%` : `${c.apr}%`) },
              { label: '', render: (c) => html`<button class="sm" data-advance="${c.id}">Cash advance (≤ ${money(Math.min(cashAdvanceLimit(c), cardAvailable(c)))})</button> ${cardBalance(c) > 0 ? html`<button class="sm" data-paycard="${c.id}">Pay balance</button>` : ''}` },
            ],
            rows: p.cards,
            empty: 'No personal credit cards.',
          })}
        </section>
        <section class="panel">
          <h2>Company debt</h2>
          <p class="small muted">Business financing funds the company's bank account and is repaid by the company: Stripe Capital withholds a share of every payment, revenue-based financing takes a share of monthly revenue, SBA loans and lines amortize monthly. "Personally liable" means you signed a personal guarantee.</p>
          ${table({
            columns: [
              { label: 'Financing', render: (l) => html`${l.name}${l.personalGuarantee ? html` ${badge('personally liable', 'warn')}` : ''}` },
              { label: 'Funded', render: (l) => fmtDate(s, l.startDay) },
              { label: 'Principal', align: 'right', render: (l) => money(l.principal) },
              { label: 'Still owed', align: 'right', render: (l) => money(l.totalRepay != null ? l.totalRepay - l.paid : l.balance) },
              { label: 'Terms', render: (l) => (l.schedule === 'stripe' ? `${Math.round(l.withholdPct * 100)}% of each payment until ${money(l.totalRepay)}` : l.schedule === 'rbf' ? `${Math.round(l.repayPct * 100)}% of monthly revenue until ${money(l.totalRepay)}` : l.schedule === 'card' ? `${s.day < l.introUntilDay ? `0% until ${fmtDate(s, l.introUntilDay)}, then ` : ''}${l.apr}% · min 1% + interest` : `${l.apr}% · ${money(l.payment)}/mo`) },
              { label: 'Interest & fees paid', align: 'right', render: (l) => money(l.interestPaid) },
              { label: '', render: (l) => (l.status === 'active' ? html`<button class="sm" data-prepay="${l.id}">Repay early</button>` : badge('Repaid', 'good')) },
            ],
            rows: D.loans,
            empty: 'No company debt.',
          })}
          ${D.applications.length ? html`<h2 style="margin-top:14px">Applications</h2>${table({
            columns: [
              { label: 'Product', key: 'name' },
              { label: 'Applied', render: (a) => fmtDate(s, a.appliedDay) },
              { label: 'Amount', align: 'right', render: (a) => money(a.fundedAmount ?? a.amount) },
              { label: 'Status', render: (a) => (a.status === 'pending' ? html`${badge('Pending', 'warn')} <span class="small muted">decision ~${fmtDate(s, a.fundDay)}</span>` : badge(a.status === 'funded' ? 'Funded' : 'Declined', a.status === 'funded' ? 'good' : 'bad')) },
            ],
            rows: D.applications.slice().reverse(),
          })}` : ''}
        </section>` : ''}
      ${tab === 'ledger' ? html`
        <section class="panel"><h2>Personal ledger</h2>
          ${table({ columns: [{ label: 'Date', render: (t) => fmtDate(s, t.day) }, { label: 'Description', key: 'description' }, { label: 'Amount', align: 'right', render: (t) => html`<span class="${t.amount < 0 ? '' : 'pos'}">${money(t.amount, { cents: true })}</span>` }, { label: 'Balance', align: 'right', render: (t) => money(t.balanceAfter) }], rows: p.txns.slice().reverse().slice(0, 200), empty: 'No personal transactions yet.' })}
        </section>` : ''}`);

    on(root, 'submit', '#profileForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => {
        const pp = ensurePersonal(st);
        Object.assign(pp, { fico: f.fico, monthlyLivingCosts: f.monthlyLivingCosts, brokerage: f.brokerage, retirementVested: f.retirementVested, homeEquity: f.homeEquity, usCitizenOrResident: f.usCitizenOrResident, usCitizen: f.usCitizen, partnerIncome: f.partnerIncome ?? 0, familyOfferAmount: f.familyOfferAmount ?? 0, otherDebtPayments: f.otherDebt ?? 0 });
        refreshDebtPayments(st);
      });
      toast('Updated.', 'good');
    });
    on(root, 'click', '#saveJob', () => {
      const v = root.querySelector('input[name=job]:checked')?.value;
      if (!v || v === p.job) return;
      // Finding a job takes time (60–120 days for full-time); quitting is instant.
      ctx.act((st) => {
        const pp = ensurePersonal(st);
        const j = JOBS[v];
        if (v === 'quit') {
          pp.job = 'quit';
          pp.incomeType = 'none';
          pp.annualIncome = 0;
          pp.jobSearch = null;
          pp.forcedJob = false;
          st.founder.hoursPerWeek = Math.max(st.founder.hoursPerWeek, pp.hoursBeforeJob ?? 55);
          pp.hoursBeforeJob = null;
          notify(st, 'You quit your job. Every hour goes to the company now, and so does every dollar of risk.', { app: 'financing' });
        } else if (pp.job !== 'quit') {
          // Switching between part-time and full-time with the same employer.
          pp.job = v;
          pp.annualIncome = Math.round((pp.priorW2Income || 0) * j.incomeShare);
          st.founder.hoursPerWeek = Math.min(st.founder.hoursPerWeek, j.hours);
          notify(st, `You moved to a ${v.replace('_', '-')} schedule. Founder time is capped at ${j.hours}h/week.`, { app: 'financing' });
        } else {
          pp.jobSearch = null;
          const js = startJobSearch(st, v);
          notify(st, `You started looking for a ${v.replace('_', '-')} job. Expect an offer around ${fmtDate(st, js.offerDay)}.`, { app: 'financing' });
        }
      }, { hours: v === 'quit' ? 0 : 6, label: 'Job change' });
    });
    on(root, 'submit', '#moveForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => contributeToCompany(st, f.amount, { asLoan: f.as === 'loan' }), { hours: 0.1, label: 'Transfer' });
    });
    on(root, 'submit', '#repayForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => {
        const lent = st.bank.txns.filter((t) => t.category === 'loan' && t.description === 'Founder loan to company').reduce((a, t) => a + t.amount, 0);
        const repaid = st.bank.txns.filter((t) => t.category === 'loan_repayment' && t.counterparty === st.founder.name).reduce((a, t) => a - t.amount, 0);
        if (f.amount > lent - repaid + 0.01) throw new Error(`The company only owes you ${money(lent - repaid)} in founder loans.`);
        if (f.amount > balance(st)) throw new Error('The company does not have that much cash.');
        post(st, { amount: -f.amount, counterparty: st.founder.name, description: 'Repay founder loan', category: 'loan_repayment', method: 'ach' });
        personalTxn(st, f.amount, 'Company repaid founder loan', 'company');
      }, { hours: 0.1, label: 'Transfer' });
    });
    on(root, 'click', '[data-apply]', (e, el) => {
      const o = list.find((x) => x.product.id === el.dataset.apply);
      const r = o.result;
      modal({
        title: `Apply: ${o.product.name}`,
        body: html`<p>Approved up to <b>${money(r.maxAmount)}</b> at ~${r.apr}% APR${r.feePct ? `, ${r.feePct}% origination fee` : ''}${r.termMonths ? `, ${r.termMonths} months` : ''}.</p>
          ${o.product.risks?.length ? html`<div class="callout warn"><b>Risks:</b> ${o.product.risks.join(' · ')}</div>` : ''}
          ${o.product.businessUseAllowed !== true ? html`<div class="callout bad">This lender ${o.product.businessUseAllowed === 'restricted' ? 'restricts' : 'prohibits'} using funds for a business. Misrepresenting the purpose can breach the loan agreement.</div>` : ''}
          <p class="small muted">${isBusinessProduct(o.product) ? 'Business financing: the money goes to the company bank account and the company repays it.' : o.product.kind === 'credit_card' ? 'A card is a credit line you spend on, not cash.' : 'Personal financing: the money lands in your personal account and you repay it.'} Decision and funding in ~${o.product.fundingDays} days; the lender re-checks your profile then. Odds: ${lenders.approvalLabel(r)}.</p>
          <label>${o.product.kind === 'credit_card' && !isBusinessProduct(o.product) ? 'Requested limit' : 'Amount'} ($) <input type="number" name="amount" min="${o.product.minAmount ?? 500}" max="${r.maxAmount}" value="${Math.round(Math.min(r.maxAmount, 25000))}" step="500" required /></label>`,
        actions: [{ label: 'Cancel' }, {
          label: 'Submit application (hard pull)', primary: true,
          onClick: async (d, form) => {
            const amount = Number(form.elements.amount.value);
            if (!(amount > 0) || amount > r.maxAmount) { toast('Enter an amount up to your approval.', 'warn'); return false; }
            await ctx.act((st) => {
              const a = applyForFinancing(st, o.product, r, amount);
              notify(st, `${o.product.name}: application submitted. Expect a decision around ${fmtDate(st, a.fundDay)}.`, { app: 'financing' });
            }, { hours: o.product.kind.startsWith('sba') ? 6 : 1, label: 'Loan application' });
          },
        }],
      });
    });
    on(root, 'click', '[data-payoff]', (e, el) => ctx.act((st) => {
      const pp = ensurePersonal(st);
      const l = pp.loans.find((x) => x.id === el.dataset.payoff);
      if (pp.liquidSavings < l.balance) throw new Error(`You need ${money(l.balance)} in personal savings to pay this off.`);
      personalTxn(st, -l.balance, `Paid off ${l.name}`, 'debt');
      l.balance = 0;
      refreshDebtPayments(st);
    }, { hours: 0.1, label: 'Loan payoff' }));
    on(root, 'click', '[data-paycard]', (e, el) => ctx.act((st) => {
      const pp = ensurePersonal(st);
      const c = pp.cards.find((x) => x.id === el.dataset.paycard);
      const amt = Math.min(cardBalance(c), Math.max(0, pp.liquidSavings));
      if (amt <= 0) throw new Error('No personal savings to pay the card with.');
      personalTxn(st, -amt, `Payment to ${c.name}`, 'debt');
      const toA = Math.min(amt, c.advanceBalance ?? 0);
      c.advanceBalance = Math.round(((c.advanceBalance ?? 0) - toA) * 100) / 100;
      c.balance = Math.round((c.balance - (amt - toA)) * 100) / 100;
      refreshDebtPayments(st);
    }, { hours: 0.1, label: 'Card payment' }));
    on(root, 'click', '[data-advance]', (e, el) => {
      const c = p.cards.find((x) => x.id === el.dataset.advance);
      modal({
        title: `Cash advance: ${c.name}`,
        body: html`<div class="callout warn">Cash advances are the most expensive credit there is: ${Math.round(CREDIT.cashAdvanceFeePct * 100)}% fee up front and ${CREDIT.cashAdvanceApr}% APR from day one (no 0% intro, no grace period).</div><label>Amount ($) <input type="number" name="amount" min="50" step="50" max="${Math.floor(Math.min(cashAdvanceLimit(c), cardAvailable(c)) / (1 + CREDIT.cashAdvanceFeePct))}" required /></label>`,
        actions: [{ label: 'Cancel' }, { label: 'Take cash advance', primary: true, onClick: async (d, form) => { await ctx.act((st) => { cashAdvance(st, c.id, Number(form.elements.amount.value)); refreshDebtPayments(st); }, { hours: 0.1, label: 'Cash advance' }); } }],
      });
    });
    on(root, 'click', '[data-prepay]', (e, el) => ctx.act((st) => {
      const l = ensureDebt(st).loans.find((x) => x.id === el.dataset.prepay);
      const owed = l.totalRepay != null ? l.totalRepay - l.paid : l.balance;
      if (balance(st) < owed) throw new Error(`The company needs ${money(owed)} in checking to repay this early.`);
      prepayBusinessLoan(st, l.id);
    }, { hours: 0.25, label: 'Loan prepayment' }));
  },
};
