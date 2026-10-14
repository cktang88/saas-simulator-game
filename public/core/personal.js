// The founder's personal finances. Separate from the company: living costs, a day job (if kept),
// founder salary/draws received, personal loans and cards taken to fund the company.
// Runs on the 1st of each month from the clock.

import { uid, round2, dayOfMonth } from './util.js';
import { post } from './bank.js';
import { notify } from './state.js';

const EFFECTIVE_TAX = 0.25; // rough blended tax on wages/draws for the personal cash view [design]

export const ensurePersonal = (state) => {
  state.personal ??= { fico: 700, annualIncome: 0, incomeType: 'none', job: 'quit', monthlyLivingCosts: 3500, liquidSavings: 0, brokerage: 0, retirementVested: 0, homeEquity: 0, monthlyDebtPayments: 0, creditCardDebt: 0, usCitizenOrResident: true, loans: [], txns: [] };
  state.personal.loans ??= [];
  state.personal.txns ??= [];
  return state.personal;
};

export function personalTxn(state, amount, description, kind = 'other') {
  const p = ensurePersonal(state);
  p.liquidSavings = round2(p.liquidSavings + amount);
  p.txns.push({ id: uid('ptx'), day: state.day, amount: round2(amount), description, kind, balanceAfter: p.liquidSavings });
  if (p.txns.length > 600) p.txns.splice(0, 100);
}

// Monthly payment on an amortizing loan.
export function amortizedPayment(principal, aprPct, months) {
  const r = aprPct / 100 / 12;
  if (!r) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

// Book a personal loan/credit line the founder took. offer: { productId, name, kind, amount, apr, feePct, termMonths, introAprMonths? }
export function takePersonalLoan(state, offer) {
  const p = ensurePersonal(state);
  const fee = round2(offer.amount * (offer.feePct ?? 0) / 100);
  const net = round2(offer.amount - fee);
  const isCard = offer.kind === 'credit_card' || offer.kind === 'heloc' || offer.kind === 'margin_loan' || offer.kind === 'line_of_credit';
  const loan = {
    id: uid('loan'),
    productId: offer.productId,
    name: offer.name,
    kind: offer.kind,
    principal: offer.amount,
    balance: offer.amount,
    apr: offer.apr,
    introAprMonths: offer.introAprMonths ?? 0,
    termMonths: offer.termMonths ?? 0,
    payment: offer.termMonths ? round2(amortizedPayment(offer.amount, offer.apr, offer.termMonths)) : 0,
    startDay: state.day,
    revolving: isCard,
    personalGuarantee: offer.personalGuarantee ?? true,
  };
  p.loans.push(loan);
  personalTxn(state, net, `${offer.name} proceeds${fee ? ` (fee ${fee})` : ''}`, 'loan');
  if (loan.payment) p.monthlyDebtPayments = round2(p.monthlyDebtPayments + loan.payment);
  notify(state, `${offer.name}: ${net.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} landed in your personal account. ${loan.payment ? `Payment ${loan.payment.toFixed(0)}/mo for ${loan.termMonths} months.` : 'Revolving: minimum payments apply.'}`, { type: 'info', app: 'financing' });
  return loan;
}

// Move personal money into the company (owner contribution / loan to company).
export function contributeToCompany(state, amount, { asLoan = false } = {}) {
  const p = ensurePersonal(state);
  if (amount <= 0) throw new Error('Enter a positive amount.');
  if (amount > p.liquidSavings) throw new Error(`You only have ${Math.floor(p.liquidSavings).toLocaleString()} in personal savings.`);
  personalTxn(state, -amount, asLoan ? 'Loan to company' : 'Owner contribution to company', 'company');
  post(state, { amount, counterparty: state.founder.name, description: asLoan ? 'Founder loan to company' : 'Owner contribution', category: asLoan ? 'loan' : 'owner_contribution', method: 'ach' });
}

export function personalMonth(state) {
  const p = ensurePersonal(state);
  if (dayOfMonth(state) !== 1) return;
  if (p.annualIncome > 0) personalTxn(state, round2((p.annualIncome / 12) * (1 - EFFECTIVE_TAX)), p.job === 'full_time' ? 'Paycheck (day job)' : 'Paycheck (part-time job)', 'income');
  personalTxn(state, -p.monthlyLivingCosts, 'Living costs (rent, food, health insurance…)', 'living');

  // Debts: amortizing loans pay down; revolving lines accrue interest after any intro period.
  let paid = 0;
  for (const l of p.loans) {
    if (l.balance <= 0.5) continue;
    const monthsIn = Math.floor((state.day - l.startDay) / 30);
    const rate = l.revolving && monthsIn < l.introAprMonths ? 0 : l.apr;
    const interest = round2(l.balance * rate / 100 / 12);
    const pay = l.payment || round2(Math.max(35, l.balance * 0.01 + interest)); // card minimum ≈ 1% + interest
    l.balance = round2(Math.max(0, l.balance + interest - pay));
    paid += pay;
  }
  const otherDebt = Math.max(0, p.monthlyDebtPayments - p.loans.reduce((a, l) => a + (l.payment || 0), 0));
  if (paid + otherDebt > 0) personalTxn(state, -round2(paid + otherDebt), 'Debt payments', 'debt');
  p.monthlyDebtPayments = round2(otherDebt + p.loans.filter((l) => l.balance > 0.5).reduce((a, l) => a + (l.payment || 0), 0));

  if (p.liquidSavings < 0) {
    p.missedMonths = (p.missedMonths ?? 0) + 1;
    p.fico = Math.max(300, p.fico - 40 * p.missedMonths); // missed payments wreck credit
    if (p.missedMonths >= 2 && p.job === 'quit') {
      p.job = 'full_time';
      p.incomeType = 'w2';
      p.annualIncome = Math.round((p.priorW2Income || 90000) * 0.9);
      state.founder.hoursPerWeek = Math.min(state.founder.hoursPerWeek, 25);
      notify(state, 'You ran out of personal money and missed payments. You took a full-time job to stay afloat: the company now gets nights and weekends only (25h/week).', { type: 'bad', app: 'financing' });
    } else {
      notify(state, `Your personal account is negative (${Math.round(p.liquidSavings)}). Pay yourself, borrow, or cut living costs, or you will miss payments and your credit score will drop.`, { type: 'bad', app: 'financing' });
    }
  } else p.missedMonths = 0;
}

// Founder salary/draw paid by the company arrives in the personal account (net of rough taxes).
export function receiveDraw(state, gross) {
  personalTxn(state, round2(gross * (1 - EFFECTIVE_TAX)), 'Founder salary / draw (after tax)', 'income');
}

export const personalRunwayMonths = (state) => {
  const p = ensurePersonal(state);
  const net = p.monthlyLivingCosts + p.monthlyDebtPayments - (p.annualIncome / 12) * (1 - EFFECTIVE_TAX) - (state.founder.salary || 0) * (1 - EFFECTIVE_TAX);
  return net <= 0 ? Infinity : Math.max(0, p.liquidSavings) / net;
};
