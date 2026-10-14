// Financing: the founder's personal balance sheet and runway, the day-job decision, and what real
// lenders would offer given your credit profile (personal loans, cards, HELOC, 401(k) loan, ROBS,
// SBA, family loans...). Underwriting rules and products come from public/data/lenders.js
// (docs/research/personal-financing.md).

import { html, mount, on, formData, table, stat, badge, modal, toast } from '../core/ui.js';
import { money, pct, fmtDate, rng } from '../core/util.js';
import { ensurePersonal, takePersonalLoan, contributeToCompany, personalRunwayMonths, personalTxn } from '../core/personal.js';
import { post, balance } from '../core/bank.js';
import { mrr } from '../core/stripe.js';
import { notify } from '../core/state.js';

let lenders = null;
let lendersError = null;
import('../data/lenders.js').then((m) => { lenders = m; }).catch((e) => { lendersError = e.message; });

const HARD_PULL_POINTS = 5; // a hard inquiry typically costs a few FICO points for ~a year

export const NOTICE_DAYS = 14; // your last two weeks at the job: lenders still see W-2 income

export const inNoticeWindow = (state) => {
  const p = ensurePersonal(state);
  return p.job === 'quit' && !p.quitLater && state.day < NOTICE_DAYS && (p.priorW2Income ?? 0) > 0;
};

export function lenderProfile(state) {
  const p = ensurePersonal(state);
  const firstCharge = state.stripe?.firstChargeDay;
  const notice = inNoticeWindow(state);
  return {
    fico: Math.round(p.fico),
    annualIncome: notice ? p.priorW2Income : p.annualIncome,
    incomeType: notice ? 'w2' : p.incomeType,
    householdIncome: (notice ? p.priorW2Income : p.annualIncome) + (p.partnerIncome ?? 0),
    familyOfferAmount: p.familyOfferAmount ?? 0,
    usCitizen: p.usCitizen ?? p.usCitizenOrResident,
    has401kLoanAccess: notice || p.job !== 'quit',
    monthlyDebtPayments: p.monthlyDebtPayments,
    liquidSavings: Math.max(0, p.liquidSavings),
    homeEquity: p.homeEquity,
    retirementVested: p.retirementVested,
    brokerage: p.brokerage,
    businessMonthlyRevenue: Math.round(mrr(state)),
    businessAgeMonths: firstCharge == null ? 0 : Math.floor((state.day - firstCharge) / 30),
    usCitizenOrResident: p.usCitizenOrResident,
  };
}

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
    const debt = p.loans.reduce((a, l) => a + l.balance, 0);
    const tab = ctx.params || 'overview';
    const list = offers(s);
    mount(root, html`
      <div class="app-head"><div><h1>Financing</h1><p>Your personal money is your first runway. Bootstrapping means living on savings, a day job or early revenue. Borrowing personally to fund a startup is common and risky: you owe it even if the company dies. General information, not financial advice.</p></div></div>
      <div class="stats">
        ${stat('Personal savings', money(p.liquidSavings), `${money(p.monthlyLivingCosts)}/mo living costs`, p.liquidSavings < 0 ? 'bad' : '')}
        ${stat('Personal runway', runway === Infinity ? 'Covered' : `${runway.toFixed(1)} mo`, 'savings ÷ monthly shortfall', runway < 3 ? 'bad' : runway < 6 ? 'warn' : '')}
        ${stat('Credit score', Math.round(p.fico), p.inquiries?.length ? `${p.inquiries.length} recent hard pulls` : 'FICO estimate', p.fico < 640 ? 'bad' : p.fico < 700 ? 'warn' : 'good')}
        ${stat('Personal debt', money(debt), `${money(p.monthlyDebtPayments)}/mo payments`, debt > 0 ? 'warn' : '')}
        ${stat('Company cash', money(balance(s)), 'separate from your personal money')}
      </div>
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
                <label>Other monthly debt payments ($) <input type="number" name="otherDebt" min="0" step="50" value="${Math.max(0, p.monthlyDebtPayments - p.loans.reduce((a, l) => a + (l.payment || 0), 0))}" /></label>
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
            <p class="muted">Keeping a job is the classic bootstrapper's funding source: verifiable income, health insurance, and lenders will still approve you. It costs founder hours. Lenders want current W-2 income or 2 years of self-employment tax returns, so <b>apply for credit before you quit</b>.</p>
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
              { label: 'Decision', render: (o) => (o.result.approved ? html`${badge(o.result.approvalOdds != null ? `~${Math.round(o.result.approvalOdds * 100)}% approval odds` : 'Likely approved', 'good')}${(o.result.warnings ?? []).map((w) => html`<div class="small warn">⚠ ${w}</div>`)}` : html`${badge('Declined', 'bad')}<div class="small muted">${o.result.reason}</div>`) },
              { label: 'Up to', align: 'right', render: (o) => (o.result.approved ? money(o.result.maxAmount) : '—') },
              { label: 'APR', align: 'right', render: (o) => (o.result.approved ? `${o.result.apr?.toFixed?.(1) ?? o.result.apr}%` : '—') },
              { label: 'Payment at max', align: 'right', render: (o) => (o.result.approved && o.result.monthlyPaymentAtMax ? `${money(o.result.monthlyPaymentAtMax)}/mo` : '—') },
              { label: 'Business use', render: (o) => (o.product.businessUseAllowed === true ? 'Allowed' : o.product.businessUseAllowed === 'restricted' ? badge('Restricted', 'warn') : badge('Not allowed', 'bad')) },
              { label: '', render: (o) => (o.result.approved ? html`<button class="sm" data-apply="${o.product.id}">Apply</button>` : '') },
            ],
            rows: list,
          })}
        </section>` : ''}
      ${tab === 'loans' ? html`
        <section class="panel">
          <h2>Your debts</h2>
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
            empty: 'No personal debt. Bootstrapped from savings so far.',
          })}
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
        const loanPayments = pp.loans.filter((l) => l.balance > 0.5).reduce((a, l) => a + (l.payment || 0), 0);
        Object.assign(pp, { fico: f.fico, monthlyLivingCosts: f.monthlyLivingCosts, brokerage: f.brokerage, retirementVested: f.retirementVested, homeEquity: f.homeEquity, usCitizenOrResident: f.usCitizenOrResident, usCitizen: f.usCitizen, partnerIncome: f.partnerIncome ?? 0, familyOfferAmount: f.familyOfferAmount ?? 0, monthlyDebtPayments: loanPayments + (f.otherDebt ?? 0) });
      });
      toast('Updated.', 'good');
    });
    on(root, 'click', '#saveJob', () => {
      const v = root.querySelector('input[name=job]:checked')?.value;
      if (!v || v === p.job) return;
      // Finding a job takes time; quitting is instant.
      ctx.act((st) => {
        const pp = ensurePersonal(st);
        const j = JOBS[v];
        pp.job = v;
        pp.incomeType = v === 'quit' ? 'none' : 'w2';
        pp.annualIncome = Math.round((pp.priorW2Income || 0) * j.incomeShare);
        if (j.hours) st.founder.hoursPerWeek = Math.min(st.founder.hoursPerWeek, j.hours);
        else st.founder.hoursPerWeek = Math.max(st.founder.hoursPerWeek, 55);
        notify(st, v === 'quit' ? 'You quit your job. Every hour goes to the company now, and so does every dollar of risk.' : `You took a ${v.replace('_', '-')} job. Paychecks resume; founder time is now capped at ${j.hours}h/week.`, { app: 'financing' });
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
          <label>Amount ($) <input type="number" name="amount" min="${o.product.minAmount ?? 500}" max="${r.maxAmount}" value="${Math.round(Math.min(r.maxAmount, 25000))}" step="500" required /></label>`,
        actions: [{ label: 'Cancel' }, {
          label: 'Submit application (hard pull)', primary: true,
          onClick: async (d, form) => {
            const amount = Number(form.elements.amount.value);
            if (!(amount > 0) || amount > r.maxAmount) { toast('Enter an amount up to your approval.', 'warn'); return false; }
            await ctx.act((st) => {
              const pp = ensurePersonal(st);
              pp.fico = Math.max(300, pp.fico - HARD_PULL_POINTS);
              (pp.inquiries ??= []).push({ day: st.day, productId: o.product.id });
              if (r.approvalOdds != null && rng(st) > r.approvalOdds) {
                notify(st, `${o.product.name}: application declined after underwriting. The hard pull still counts.`, { type: 'bad', app: 'financing' });
                return;
              }
              takePersonalLoan(st, { productId: o.product.id, name: o.product.name, kind: o.product.kind, amount, apr: r.apr, feePct: r.feePct, termMonths: r.termMonths, introAprMonths: o.product.introAprMonths, personalGuarantee: o.product.personalGuarantee });
            }, { hours: 1, label: 'Loan application' });
          },
        }],
      });
    });
    on(root, 'click', '[data-payoff]', (e, el) => ctx.act((st) => {
      const pp = ensurePersonal(st);
      const l = pp.loans.find((x) => x.id === el.dataset.payoff);
      if (pp.liquidSavings < l.balance) throw new Error(`You need ${money(l.balance)} in personal savings to pay this off.`);
      personalTxn(st, -l.balance, `Paid off ${l.name}`, 'debt');
      pp.monthlyDebtPayments = Math.max(0, pp.monthlyDebtPayments - (l.payment || 0));
      l.balance = 0;
    }, { hours: 0.1, label: 'Loan payoff' }));
  },
};
