// Financing applications and company (business) debt.
//
// Applications: every lender product is applied for here. A hard pull happens at application; the lender
// decides and funds after the product's fundingDays (SBA 7(a) 30–60 days, Kiva 30–60, RBF ~21, cards ~10),
// re-running underwriting on the founder's profile at that point. Personal products fund the founder's
// personal account (core/personal.js); business products fund the COMPANY bank (category 'loan') and are
// serviced here:
//   - Stripe Capital: no upfront fee; 15% of each Stripe payment's net is withheld before it reaches the
//     balance (core/stripe.js calls capitalWithhold), with a minimum of 1/18 of the total every 60 days.
//   - Revenue-based financing: monthly, 8% of the last 30 days' gross charges until the cap is repaid.
//   - SBA 7(a)/Express/Microloan and business lines of credit: level monthly amortization from the bank.
//   - Business 0% card: charges financed on the card; 1% + interest minimum after the intro period.
// Each repayment posts principal ('loan_repayment') and interest/fees ('loan_interest') as separate lines.

import { uid, round2, rng, clamp } from './util.js';
import { post } from './bank.js';
import { notify } from './state.js';
import { PAYMENTS, CREDIT } from './params.js';
import * as LND from '../data/lenders.js';
import { ensurePersonal, takePersonalLoan, openPersonalCard, hardPull } from './personal.js';
import { mrr } from './stripe.js';

export const NOTICE_DAYS = 14; // the founder's last two weeks at the day job: lenders still see W-2 income

const BUSINESS_KINDS = new Set(['rbf', 'sba_7a', 'sba_express', 'sba_micro', 'line_of_credit']);
export const isBusinessProduct = (product) => BUSINESS_KINDS.has(product.kind) || product.id === 'cc_business_0apr';

export function ensureDebt(state) {
  state.debt ??= { loans: [], applications: [] };
  state.debt.loans ??= [];
  state.debt.applications ??= [];
  return state.debt;
}

export const inNoticeWindow = (state) => {
  const p = ensurePersonal(state);
  return p.job === 'quit' && !p.quitLater && state.day < NOTICE_DAYS && (p.priorW2Income ?? 0) > 0;
};

// What a lender sees today (feeds data/lenders.js underwrite()).
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

const isHardPull = (product) => /^hard pull|varies/i.test(product.hardPull ?? 'hard pull');

function fundingDelay(state, product) {
  const r = rng(state);
  if (product.kind === 'sba_7a') return 30 + Math.floor(r * 31); // 45 ± 15
  if (product.kind === 'kiva') return 30 + Math.floor(r * 31); // 30–60 (private round + public crowd)
  if (product.kind === 'sba_express' || product.kind === 'sba_micro') return Math.round(product.fundingDays * (0.75 + 0.5 * r));
  return product.fundingDays ?? 1;
}

/**
 * Apply for a lender product. product: an entry of LENDER_PRODUCTS; result: its current underwrite() result.
 * Returns the pending application. The decision and the money come on app.fundDay.
 */
export function applyForFinancing(state, product, result, amount) {
  const d = ensureDebt(state);
  amount = Math.round(Number(amount));
  if (!result?.approved) throw new Error('This lender would decline you today.');
  if (!(amount > 0) || amount > result.maxAmount) throw new Error(`Enter an amount up to ${result.maxAmount}.`);
  if (d.applications.some((a) => a.status === 'pending' && a.productId === product.id)) throw new Error('You already have a pending application for this product.');
  if (isHardPull(product)) hardPull(state, product.id);
  const app = {
    id: uid('lapp'), productId: product.id, name: product.name, kind: product.kind, amount, apr: result.apr, feePct: result.feePct ?? 0,
    termMonths: result.termMonths, introAprMonths: product.introAprMonths ?? 0, personalGuarantee: product.personalGuarantee ?? false,
    target: isBusinessProduct(product) ? 'company' : 'personal', appliedDay: state.day, fundDay: state.day + fundingDelay(state, product), status: 'pending',
    totalRepayPerDollar: result.details?.totalRepayment ? result.details.totalRepayment / result.maxAmount : null,
  };
  d.applications.push(app);
  return app;
}

// On the funding day: the lender re-underwrites (income, DTI and FICO may have changed) and rolls the odds.
export function recheckApplications(state) {
  const d = ensureDebt(state);
  for (const app of d.applications) {
    if (app.status !== 'pending' || state.day < app.fundDay) continue;
    const product = LND.LENDER_PRODUCTS.find((x) => x.id === app.productId);
    const r = product ? LND.underwrite(lenderProfile(state), product) : { approved: false, reason: 'Product no longer offered.' };
    let ok = r.approved && rng(state) < LND.approvalProbability(r);
    let reason = r.approved ? 'the lender declined after underwriting' : r.reason;
    if (ok && app.kind === 'kiva') { // Kiva funds only if your own network lends first, then the crowd
      const friends = state.founder?.network?.friends ?? 0;
      ok = rng(state) < clamp(0.25 + friends / 80, 0.25, 0.9);
      if (!ok) reason = 'the loan did not fill: not enough of your network lent in the private round';
    }
    if (!ok) {
      app.status = 'declined';
      app.decidedDay = state.day;
      notify(state, `${app.name}: declined (${reason}). The hard pull still counts.`, { type: 'bad', app: 'financing' });
      continue;
    }
    const amount = Math.min(app.amount, r.maxAmount);
    app.status = 'funded';
    app.decidedDay = state.day;
    app.fundedAmount = amount;
    const offer = { productId: app.productId, name: app.name, kind: app.kind, amount, apr: r.apr, feePct: r.feePct ?? 0, termMonths: r.termMonths, introAprMonths: app.introAprMonths, personalGuarantee: app.personalGuarantee };
    if (app.target === 'company') bookBusinessLoan(state, product, offer, r);
    else if (app.kind === 'credit_card') openPersonalCard(state, offer);
    else takePersonalLoan(state, offer);
    if (amount < app.amount) notify(state, `${app.name}: approved for ${amount.toLocaleString()} instead of ${app.amount.toLocaleString()} after re-underwriting.`, { type: 'warn', app: 'financing' });
  }
  if (d.applications.length > 60) d.applications = d.applications.filter((a) => a.status === 'pending' || state.day - a.appliedDay < 365);
}

// ---- Company loans ----

export function bookBusinessLoan(state, product, offer, result = null) {
  const d = ensureDebt(state);
  const amount = round2(offer.amount);
  const base = {
    id: uid('bloan'), productId: offer.productId, name: offer.name, kind: offer.kind, principal: amount, balance: amount,
    paid: 0, interestPaid: 0, apr: offer.apr, termMonths: offer.termMonths ?? 0, startDay: state.day,
    personalGuarantee: offer.personalGuarantee ?? false, status: 'active', nextDueDay: state.day + 30,
  };
  let loan;
  const lender = product?.id === 'stripe_capital' ? 'Stripe Capital' : offer.name;
  if (offer.productId === 'stripe_capital') {
    const perDollar = result?.details?.totalRepayment && result.maxAmount ? result.details.totalRepayment / result.maxAmount : 1 + (product?.flatFeePct ?? 12) / 100;
    const total = round2(amount * perDollar);
    loan = { ...base, schedule: 'stripe', totalRepay: total, fee: round2(total - amount), withholdPct: product?.repaymentPctOfRevenue ?? PAYMENTS.capitalWithholdPct, withholdStartDay: state.day + 2, periodStart: state.day, periodPaid: 0, feePct: 0 };
  } else if (offer.kind === 'rbf') {
    const total = round2(amount * (product?.costMultiple ?? 1.5));
    loan = { ...base, schedule: 'rbf', totalRepay: total, fee: round2(total - amount), repayPct: product?.repaymentPctOfRevenue ?? 0.08, feePct: 0 };
  } else if (offer.productId === 'cc_business_0apr') {
    loan = { ...base, schedule: 'card', limit: result?.maxAmount ?? amount, introUntilDay: state.day + (offer.introAprMonths ?? 12) * 30 };
  } else {
    const n = Math.max(1, offer.termMonths || 12);
    const r = offer.apr / 100 / 12;
    loan = { ...base, schedule: 'amortized', payment: round2(r ? (amount * r) / (1 - Math.pow(1 + r, -n)) : amount / n), remainingPayments: n };
  }
  d.loans.push(loan);
  post(state, { amount, counterparty: lender, description: offer.productId === 'cc_business_0apr' ? `${offer.name}: company expenses financed on the card` : `${offer.name} proceeds`, category: 'loan', method: 'ach', meta: { loanId: loan.id } });
  // Only SBA/Micro-style upfront guarantee/packaging fees are charged at funding; RBF/Capital fees are paid over time.
  const upfront = /^sba_/.test(offer.kind) ? round2(amount * (offer.feePct ?? 0) / 100) : 0;
  if (upfront > 0) {
    post(state, { amount: -upfront, counterparty: lender, description: `${offer.name}: upfront guarantee / packaging fee (${offer.feePct}%)`, category: 'loan_interest', method: 'ach', meta: { loanId: loan.id } });
    loan.interestPaid = upfront;
  }
  notify(state, `${offer.name}: ${amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} landed in the company account.${loan.schedule === 'stripe' ? ` ${Math.round(loan.withholdPct * 100)}% of each Stripe payment is withheld until ${loan.totalRepay.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} is repaid.` : loan.schedule === 'rbf' ? ` Repay ${Math.round(loan.repayPct * 100)}% of monthly revenue until ${loan.totalRepay.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.` : loan.payment ? ` ${loan.payment.toFixed(0)}/mo for ${loan.termMonths} months.` : ''}`, { type: 'good', app: 'financing' });
  return loan;
}

// Post a repayment as principal + interest lines from the company bank.
function payFromBank(state, loan, principal, interest, desc) {
  principal = round2(principal); interest = round2(interest);
  const lender = loan.productId === 'stripe_capital' ? 'Stripe Capital' : loan.name;
  if (principal > 0) post(state, { amount: -principal, counterparty: lender, description: `${desc} (principal)`, category: 'loan_repayment', method: 'ach', meta: { loanId: loan.id } });
  if (interest > 0) post(state, { amount: -interest, counterparty: lender, description: `${desc} (interest / fee)`, category: 'loan_interest', method: 'ach', meta: { loanId: loan.id } });
  applyPaid(state, loan, principal, interest);
}

function applyPaid(state, loan, principal, interest) {
  loan.balance = round2(Math.max(0, loan.balance - principal));
  loan.paid = round2(loan.paid + principal + interest);
  loan.interestPaid = round2(loan.interestPaid + interest);
  const done = loan.totalRepay != null ? loan.paid >= loan.totalRepay - 0.01 : loan.balance <= 0.01;
  if (done && loan.status === 'active') {
    loan.status = 'repaid';
    loan.repaidDay = state.day;
    loan.balance = 0;
    notify(state, `${loan.name} fully repaid.`, { type: 'good', app: 'financing' });
  }
}

// Split a revenue-share payment into principal and fee in proportion to principal / total repayment.
const split = (loan, pay) => { const principal = round2(pay * loan.principal / loan.totalRepay); return [principal, round2(pay - principal)]; };

/**
 * Stripe Capital servicing, called by core/stripe.js for each successful payment before it goes to pending.
 * Returns the amount withheld. Each withholding is also recorded in state.stripe.capitalRepayments
 * ({ id, day, chargeId, loanId, amount, principal, interest }) so the books can clear it from Stripe clearing.
 */
export function capitalWithhold(state, net, chargeId) {
  const d = state.debt;
  if (!d?.loans?.length || !(net > 0)) return 0;
  let total = 0;
  for (const loan of d.loans) {
    if (loan.schedule !== 'stripe' || loan.status !== 'active' || state.day < loan.withholdStartDay) continue;
    const left = round2(loan.totalRepay - loan.paid);
    const w = round2(Math.min(left, (net - total) * loan.withholdPct));
    if (w <= 0) continue;
    const [principal, interest] = split(loan, w);
    (state.stripe.capitalRepayments ??= []).push({ id: uid('cap'), day: state.day, chargeId, loanId: loan.id, amount: w, principal, interest });
    loan.periodPaid = round2((loan.periodPaid ?? 0) + w);
    applyPaid(state, loan, principal, interest);
    total = round2(total + w);
  }
  return total;
}

const grossLast30 = (state) => (state.stripe?.charges ?? []).filter((c) => c.day > state.day - 30 && c.day <= state.day && c.status !== 'failed').reduce((a, c) => a + c.amount, 0);

export function debtDay(state) {
  const d = state.debt;
  if (!d?.loans?.length) return;
  for (const loan of d.loans) {
    if (loan.status !== 'active') continue;
    if (loan.schedule === 'stripe') {
      // Minimum: 1/18 of the total every 60 days; any shortfall is debited from the bank account.
      if (state.day - loan.periodStart >= PAYMENTS.capitalMinPeriodDays) {
        const min = loan.totalRepay / PAYMENTS.capitalMinPeriods;
        const short = round2(Math.min(loan.totalRepay - loan.paid, min - (loan.periodPaid ?? 0)));
        if (short > 0.01) {
          const [principal, interest] = split(loan, short);
          payFromBank(state, loan, principal, interest, 'Stripe Capital minimum payment shortfall');
          notify(state, `Stripe Capital: withholdings were below the 60-day minimum, so ${short.toFixed(2)} was debited from your bank account.`, { type: 'warn', app: 'financing' });
        }
        loan.periodStart = state.day;
        loan.periodPaid = 0;
      }
      continue;
    }
    if (state.day < loan.nextDueDay) continue;
    loan.nextDueDay += 30;
    if (loan.schedule === 'rbf') {
      const pay = round2(Math.min(loan.totalRepay - loan.paid, grossLast30(state) * loan.repayPct));
      if (pay > 0) { const [principal, interest] = split(loan, pay); payFromBank(state, loan, principal, interest, `${loan.name}: ${Math.round(loan.repayPct * 100)}% of revenue`); }
    } else if (loan.schedule === 'amortized') {
      const interest = round2(loan.balance * loan.apr / 100 / 12);
      const principal = round2(Math.min(loan.balance, loan.payment - interest));
      loan.remainingPayments = Math.max(0, (loan.remainingPayments ?? 1) - 1);
      payFromBank(state, loan, loan.remainingPayments === 0 ? loan.balance : Math.max(0, principal), interest, `${loan.name} monthly payment`);
    } else if (loan.schedule === 'card') {
      const interest = state.day < loan.introUntilDay ? 0 : round2(loan.balance * loan.apr / 100 / 12);
      const principal = round2(Math.min(loan.balance, Math.max(CREDIT.minPaymentFloor - interest, loan.balance * CREDIT.minPaymentPct)));
      payFromBank(state, loan, principal, interest, `${loan.name} minimum payment`);
    }
  }
}

// Pay a company loan down early from the bank (principal only; revenue-share products owe the full cap).
export function prepayBusinessLoan(state, loanId, amount = null) {
  const loan = ensureDebt(state).loans.find((l) => l.id === loanId);
  if (!loan || loan.status !== 'active') throw new Error('No active loan.');
  if (loan.totalRepay != null) {
    const left = round2(loan.totalRepay - loan.paid);
    const pay = round2(Math.min(left, amount ?? left));
    const [principal, interest] = split(loan, pay);
    payFromBank(state, loan, principal, interest, `${loan.name} early repayment`);
  } else {
    const pay = round2(Math.min(loan.balance, amount ?? loan.balance));
    payFromBank(state, loan, pay, 0, `${loan.name} early repayment`);
  }
  return loan;
}

export const activeBusinessLoans = (state) => (state.debt?.loans ?? []).filter((l) => l.status === 'active');
export const businessDebtBalance = (state) => round2(activeBusinessLoans(state).reduce((a, l) => a + (l.totalRepay != null ? l.totalRepay - l.paid : l.balance), 0));

/**
 * Expected company debt service per month (for runway): amortized payments, card minimums, revenue-share
 * repayments at today's MRR (Stripe Capital never below its 60-day minimum), plus RBF advances booked
 * by the Fundraising app (state.apps.fundraising.loans).
 */
export function monthlyDebtService(state) {
  const m = mrr(state);
  let total = 0;
  for (const l of activeBusinessLoans(state)) {
    const left = l.totalRepay != null ? l.totalRepay - l.paid : l.balance;
    if (l.schedule === 'amortized') total += Math.min(l.payment, left + l.balance * l.apr / 1200);
    else if (l.schedule === 'card') total += Math.min(left, Math.max(CREDIT.minPaymentFloor, l.balance * CREDIT.minPaymentPct + (state.day < l.introUntilDay ? 0 : l.balance * l.apr / 1200)));
    else if (l.schedule === 'rbf') total += Math.min(left, m * l.repayPct);
    else if (l.schedule === 'stripe') total += Math.min(left, Math.max(m * l.withholdPct, (l.totalRepay / PAYMENTS.capitalMinPeriods) / 2));
  }
  for (const l of state.apps?.fundraising?.loans ?? []) {
    if (!(l.remaining > 0)) continue;
    total += Math.min(l.remaining, l.installment || m * (l.repayPct || 0));
  }
  return round2(total);
}
