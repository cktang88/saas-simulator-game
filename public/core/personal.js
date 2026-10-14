// The founder's personal finances. Separate from the company: living costs, a day job (if kept),
// founder salary/draws received, personal loans and cards taken to fund the company, the credit score.
// personalMonth() runs every day from the clock (daily hooks first, then the monthly cycle on the 1st).

import { uid, round2, dayOfMonth, monthIndex, dateOf, rng, clamp } from './util.js';
import { post, account, CATEGORIES } from './bank.js';
import { notify } from './state.js';
import { CREDIT, FOUNDER_PAY, COMPANY } from './params.js';
import { debtDay, recheckApplications } from './debt.js';

const EFFECTIVE_TAX = 0.25; // rough blended tax on day-job wages for the personal cash view [design]

export const ensurePersonal = (state) => {
  state.personal ??= { fico: 700, annualIncome: 0, incomeType: 'none', job: 'quit', monthlyLivingCosts: 3500, liquidSavings: 0, brokerage: 0, retirementVested: 0, homeEquity: 0, monthlyDebtPayments: 0, creditCardDebt: 0, usCitizenOrResident: true, loans: [], txns: [] };
  const p = state.personal;
  p.loans ??= [];
  p.txns ??= [];
  p.cards ??= [];
  p.inquiries ??= [];
  // Debts the founder already had before the game (car, student loans...). Older saves only had the total.
  p.otherDebtPayments ??= Math.max(0, (p.monthlyDebtPayments ?? 0) - p.loans.filter((l) => l.balance > 0.5).reduce((a, l) => a + (l.payment || 0), 0));
  return p;
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

// ---- Credit cards: a payment method with a limit, not cash ----

const cardRate = (state, card) => (state.day < (card.introUntilDay ?? 0) ? 0 : card.apr);
export const cardBalance = (card) => round2((card.balance ?? 0) + (card.advanceBalance ?? 0));
export const cardAvailable = (card) => round2(card.limit - cardBalance(card));
export const cashAdvanceLimit = (card) => round2(Math.max(0, card.limit * CREDIT.cashAdvanceShareOfLimit - (card.advanceBalance ?? 0)));

// Minimum payment: 1% of the balance + this month's interest, at least $35 (or the whole balance if smaller).
export function cardMinimum(state, card) {
  const bal = cardBalance(card);
  if (bal <= 0.5) return 0;
  const interest = (card.balance * cardRate(state, card) + (card.advanceBalance ?? 0) * CREDIT.cashAdvanceApr) / 100 / 12;
  return round2(Math.min(bal + interest, Math.max(CREDIT.minPaymentFloor, bal * CREDIT.minPaymentPct + interest)));
}

export const utilization = (state) => {
  const p = ensurePersonal(state);
  const limit = p.cards.reduce((a, c) => a + c.limit, 0);
  return limit > 0 ? p.cards.reduce((a, c) => a + cardBalance(c), 0) / limit : 0;
};

// A personal card approved by an issuer (Financing). No cash lands anywhere: it's spending power.
export function openPersonalCard(state, offer) {
  const p = ensurePersonal(state);
  const card = {
    id: uid('pcard'), productId: offer.productId, name: offer.name, limit: offer.amount, balance: 0, advanceBalance: 0,
    apr: offer.apr, introUntilDay: state.day + (offer.introAprMonths ?? 0) * 30, openedDay: state.day, last4: String(1000 + Math.floor(rng(state) * 9000)),
  };
  p.cards.push(card);
  notify(state, `${offer.name} arrived: ${card.limit.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} limit${offer.introAprMonths ? `, 0% on purchases for ${offer.introAprMonths} months` : ''}. It's a payment method, not cash: pay company tools and ads with it (booked as a founder loan). Cash advances are capped at ${Math.round(CREDIT.cashAdvanceShareOfLimit * 100)}% of the limit and cost ${Math.round(CREDIT.cashAdvanceFeePct * 100)}% + ${CREDIT.cashAdvanceApr}% APR from day one.`, { type: 'info', app: 'financing' });
  return card;
}

const pickCard = (state, amount, cardId) => {
  const p = ensurePersonal(state);
  const card = cardId ? p.cards.find((c) => c.id === cardId) : p.cards.filter((c) => cardAvailable(c) >= amount).sort((a, b) => cardRate(state, a) - cardRate(state, b))[0];
  if (!card) throw new Error(p.cards.length ? 'Not enough available credit on your personal cards.' : 'You have no personal credit card. Apply for one in Financing.');
  if (cardAvailable(card) < amount - 0.005) throw new Error(`${card.name}: only ${cardAvailable(card).toFixed(2)} of credit available.`);
  return card;
};

/**
 * Pay a company expense (tools, ads, hosting...) with the founder's personal card. The card balance grows;
 * the company books the expense and owes the founder the same amount (a founder loan, repayable in Financing).
 * Posts two bank lines that net to zero: +amount 'loan' (Founder loan to company) and −amount <category>.
 */
export function chargeFounderCard(state, amount, desc, { category = 'software', counterparty = null, cardId = null } = {}) {
  amount = round2(Number(amount));
  if (!(amount > 0)) throw new Error('Enter a positive amount.');
  const card = pickCard(state, amount, cardId);
  card.balance = round2(card.balance + amount);
  const meta = { via: 'founder_personal_card', cardId: card.id };
  post(state, { amount, counterparty: state.founder.name, description: 'Founder loan to company', category: 'loan', method: 'internal', meta: { ...meta, memo: `Paid with ${card.name} ••${card.last4}: ${desc}` } });
  post(state, { amount: -amount, counterparty: counterparty ?? desc, description: `${desc} (founder's personal card ••${card.last4})`, category, method: 'card', meta });
  return card;
}

// Cash advance: limited to ~25% of the line, 5% fee (min $10), 29.99% APR from day one, no grace period.
export function cashAdvance(state, cardId, amount) {
  const p = ensurePersonal(state);
  const card = p.cards.find((c) => c.id === cardId) ?? p.cards[0];
  if (!card) throw new Error('No personal credit card.');
  amount = round2(Number(amount));
  if (!(amount > 0)) throw new Error('Enter a positive amount.');
  const fee = round2(Math.max(CREDIT.cashAdvanceFeeMin, amount * CREDIT.cashAdvanceFeePct));
  if (amount + fee > cashAdvanceLimit(card) + 0.005 || amount + fee > cardAvailable(card) + 0.005) throw new Error(`Cash advance limit: ${Math.min(cashAdvanceLimit(card), cardAvailable(card)).toFixed(0)} including the ${Math.round(CREDIT.cashAdvanceFeePct * 100)}% fee.`);
  card.advanceBalance = round2((card.advanceBalance ?? 0) + amount + fee);
  personalTxn(state, amount, `Cash advance on ${card.name} (fee ${fee.toFixed(2)})`, 'loan');
  return { card, fee };
}

function recomputeDebtPayments(state) {
  const p = ensurePersonal(state);
  const loans = p.loans.filter((l) => l.balance > 0.5).reduce((a, l) => a + (l.payment || 0), 0);
  const cards = p.cards.reduce((a, c) => a + cardMinimum(state, c), 0);
  p.monthlyDebtPayments = round2(p.otherDebtPayments + loans + cards);
  return p.monthlyDebtPayments;
}
export const refreshDebtPayments = recomputeDebtPayments;

// ---- Personal loans (cash) ----

// Book a personal loan the founder took. offer: { productId, name, kind, amount, apr, feePct, termMonths, introAprMonths? }
// Business products (Stripe Capital, RBF, SBA, business lines/cards) go through core/debt.js instead.
export function takePersonalLoan(state, offer) {
  if (offer.kind === 'credit_card') return openPersonalCard(state, offer);
  const p = ensurePersonal(state);
  const fee = round2(offer.amount * (offer.feePct ?? 0) / 100);
  const net = round2(offer.amount - fee);
  const isLine = (offer.kind === 'heloc' && offer.productId === 'heloc') || offer.kind === 'margin_loan';
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
    payment: offer.termMonths && !isLine ? round2(amortizedPayment(offer.amount, offer.apr, offer.termMonths)) : 0,
    startDay: state.day,
    revolving: isLine,
    personalGuarantee: offer.personalGuarantee ?? true,
  };
  p.loans.push(loan);
  personalTxn(state, net, `${offer.name} proceeds${fee ? ` (fee ${fee})` : ''}`, 'loan');
  recomputeDebtPayments(state);
  notify(state, `${offer.name}: ${net.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} landed in your personal account. ${loan.payment ? `Payment ${loan.payment.toFixed(0)}/mo for ${loan.termMonths} months.` : 'Interest-only line: minimum payments apply.'}`, { type: 'info', app: 'financing' });
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

// ---- Credit score ----

function applyFico(state, delta) {
  const p = ensurePersonal(state);
  p.fico = clamp(Math.round(p.fico + delta), 300, 850);
}

// A hard inquiry: about −5 points, scored for 12 months (then added back).
export function hardPull(state, productId) {
  const p = ensurePersonal(state);
  applyFico(state, -CREDIT.hardPullPoints);
  p.inquiries.push({ day: state.day, productId, points: CREDIT.hardPullPoints });
}

function delinquencyMonth(state) {
  const p = ensurePersonal(state);
  p.missedMonths = (p.missedMonths ?? 0) + 1;
  p.cleanMonths = 0;
  if (p.missedMonths === 1) {
    p.ficoBeforeDelinquency ??= p.fico;
    applyFico(state, -CREDIT.firstLatePoints(p.fico)); // first 30-day late
  } else {
    applyFico(state, -CREDIT.furtherLatePoints); // 60/90/120-day lates
    if (p.missedMonths === CREDIT.chargeOffMonth) applyFico(state, -CREDIT.chargeOffPoints); // charge-off
  }
  if (p.missedMonths < CREDIT.chargeOffMonth) p.fico = Math.max(p.fico, Math.min(CREDIT.floorBeforeChargeOff, p.ficoBeforeDelinquency ?? 850));
}

function cleanMonth(state) {
  const p = ensurePersonal(state);
  p.missedMonths = 0;
  p.cleanMonths = (p.cleanMonths ?? 0) + 1;
  if (p.ficoBeforeDelinquency != null && p.cleanMonths > CREDIT.recoveryAfterCleanMonths) {
    applyFico(state, Math.min(CREDIT.recoveryPerMonth, Math.max(0, p.ficoBeforeDelinquency - p.fico)));
    if (p.fico >= p.ficoBeforeDelinquency) p.ficoBeforeDelinquency = null;
  }
}

// Utilization is recomputed on each statement: >30% costs ~20 points, >70% ~45; paying down restores them.
function utilizationAdjust(state) {
  const p = ensurePersonal(state);
  const u = utilization(state);
  const hit = CREDIT.utilizationHits.find((h) => u > h.over)?.points ?? 0;
  applyFico(state, hit - (p.ficoUtilAdj ?? 0));
  p.ficoUtilAdj = hit;
}

// ---- Day job search (finding a job takes 60–120 days; quitting is instant) ----

export function startJobSearch(state, job = 'full_time', { reason = 'choice' } = {}) {
  const p = ensurePersonal(state);
  if (p.jobSearch) return p.jobSearch;
  const [lo, hi] = CREDIT.jobSearchDays;
  const days = job === 'part_time' ? Math.round((lo + Math.floor(rng(state) * (hi - lo + 1))) * 0.6) : lo + Math.floor(rng(state) * (hi - lo + 1));
  p.jobSearch = { job, startDay: state.day, offerDay: state.day + days, reason };
  return p.jobSearch;
}

function takeJob(state) {
  const p = ensurePersonal(state);
  const js = p.jobSearch;
  p.jobSearch = null;
  p.job = js.job;
  p.incomeType = 'w2';
  const share = js.job === 'part_time' ? 0.45 : 1;
  p.annualIncome = Math.round((p.priorW2Income || 90000) * (js.reason === 'forced' ? 0.9 : 1) * share);
  state.founder.hoursPerWeek = Math.min(state.founder.hoursPerWeek, js.job === 'part_time' ? 40 : 25);
  notify(state, `You accepted a ${js.job.replace('_', '-')} job at ${p.annualIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}/yr after ${state.day - js.startDay} days of searching. Paychecks start next month; the company now gets ${js.job === 'part_time' ? 40 : 25}h/week.`, { type: js.reason === 'forced' ? 'warn' : 'good', app: 'financing' });
}

// ---- Pre-incorporation money → Mercury (M15) ----

const businessDaysAfter = (state, n) => {
  let d = state.day, added = 0;
  while (added < n) { d++; const wd = dateOf(state, d).getUTCDay(); if (wd !== 0 && wd !== 6) added++; }
  return d;
};

function checkBankMigration(state) {
  const acct = account(state, 'checking');
  if (!acct?.personal || !state.company.incorporated) return;
  const legal = state.apps?.legal;
  const einOk = !legal || legal.ein?.status === 'done' || legal.ein == null; // Mercury needs the company's EIN
  const b = state.bank;
  if (!einOk) return;
  if (b.mercuryOpenDay == null) {
    b.mercuryOpenDay = businessDaysAfter(state, 1 + Math.floor(rng(state) * 3));
    notify(state, `Mercury application submitted for ${state.company.name}. Approval usually takes 1–3 business days.`, { app: 'bank' });
    return;
  }
  if (state.day < b.mercuryOpenDay) return;
  const amt = round2(acct.balance);
  if (amt > 0) post(state, { amount: -amt, counterparty: state.company.name, description: 'TRANSFER TO MERCURY CHECKING (pre-incorporation business funds)', category: 'transfer', method: 'internal' });
  acct.name = 'Mercury Checking ••4821';
  acct.personal = false;
  acct.institution = 'Mercury';
  acct.openedDay = state.day;
  b.preIncorporation = { closedDay: state.day, moved: Math.max(0, amt) };
  if (amt > 0) post(state, { amount: amt, counterparty: 'Personal checking', description: 'TRANSFER FROM PERSONAL CHECKING (pre-incorporation business funds)', category: 'transfer', method: 'internal' });
  notify(state, `Mercury Checking is open in ${state.company.name}'s name.${amt > 0 ? ` ${amt.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} of business money moved over from your personal checking.` : ''} Keep company and personal money separate from now on (it protects the liability shield).`, { type: 'good', app: 'bank' });
}

// ---- Daily + monthly cycle ----

function personalDay(state) {
  const p = ensurePersonal(state);
  // Hard inquiries stop counting after 12 months.
  for (const q of p.inquiries) if (!q.restored && q.points && state.day - q.day >= CREDIT.hardPullDays) { q.restored = true; applyFico(state, q.points); }
  if (p.jobSearch && state.day >= p.jobSearch.offerDay) takeJob(state);
  checkBankMigration(state);
  recheckApplications(state);
  debtDay(state);
}

export function personalMonth(state) {
  const p = ensurePersonal(state);
  personalDay(state);
  estimatedTaxDay(state);
  if (dayOfMonth(state) !== 1) return;
  if (p.annualIncome > 0) personalTxn(state, round2((p.annualIncome / 12) * (1 - EFFECTIVE_TAX)), p.job === 'full_time' ? 'Paycheck (day job)' : 'Paycheck (part-time job)', 'income');
  personalTxn(state, -p.monthlyLivingCosts, 'Living costs (rent, food, health insurance…)', 'living');

  // Debts: amortizing loans pay down; lines accrue interest after any intro period.
  let paid = 0;
  for (const l of p.loans) {
    if (l.balance <= 0.5) continue;
    const monthsIn = Math.floor((state.day - l.startDay) / 30);
    const rate = l.revolving && monthsIn < l.introAprMonths ? 0 : l.apr;
    const interest = round2(l.balance * rate / 100 / 12);
    const due = round2(l.balance + interest);
    const pay = Math.min(due, l.payment || round2(Math.max(CREDIT.minPaymentFloor, l.balance * CREDIT.minPaymentPct + interest)));
    l.balance = round2(due - pay);
    paid += pay;
  }
  // Cards: interest (0% during the intro on purchases; cash advances always 29.99%), then the minimum.
  for (const c of p.cards) {
    const min = cardMinimum(state, c);
    if (!min) continue;
    const intP = round2(c.balance * cardRate(state, c) / 100 / 12);
    const intA = round2((c.advanceBalance ?? 0) * CREDIT.cashAdvanceApr / 100 / 12);
    c.balance = round2(c.balance + intP);
    c.advanceBalance = round2((c.advanceBalance ?? 0) + intA);
    let rest = min;
    const toA = Math.min(rest, c.advanceBalance); c.advanceBalance = round2(c.advanceBalance - toA); rest -= toA; // highest APR first
    c.balance = round2(Math.max(0, c.balance - rest));
    paid += min;
  }
  paid += p.otherDebtPayments;
  if (paid > 0) personalTxn(state, -round2(paid), 'Debt payments (loans, card minimums, other debts)', 'debt');
  recomputeDebtPayments(state);
  utilizationAdjust(state);

  if (p.liquidSavings < 0) {
    const hasDebts = p.monthlyDebtPayments > 0 || paid > 0;
    if (hasDebts) delinquencyMonth(state);
    else { p.missedMonths = (p.missedMonths ?? 0) + 1; p.cleanMonths = 0; }
    if (p.missedMonths >= 2 && p.job === 'quit' && !p.jobSearch) {
      startJobSearch(state, 'full_time', { reason: 'forced' });
      notify(state, `You're out of personal money and missing payments (credit score now ${p.fico}). You started looking for a full-time job; offers take 2–4 months. Until then, borrow (family, cards), cut living costs or pay yourself from the company.`, { type: 'bad', app: 'financing' });
    } else {
      notify(state, `Your personal account is negative (${Math.round(p.liquidSavings)}).${hasDebts ? ` Payments were missed: credit score ${p.fico}.` : ''} Pay yourself, borrow, or cut living costs.`, { type: 'bad', app: 'financing' });
    }
  } else cleanMonth(state);
}

// ---- Founder pay (M5) ----

const isCcorp = (state) => !!state.company.incorporated && state.company.entity === 'ccorp';
const peopleGustoActive = (state) => {
  const pp = state.apps?.people;
  if (!pp?.payrollSetup?.gusto) return false;
  const r = state.recurring.find((x) => x.id === pp.vendorRec?.gusto);
  return !!(r && r.active && r.amount > 0);
};

// What lands in the founder's personal account per month from the company pay.
export const netFounderPay = (state, gross = state.founder.salary || 0) => round2(isCcorp(state) ? gross * (1 - FOUNDER_PAY.employeeFica - FOUNDER_PAY.incomeTaxWithholding) : gross);

/**
 * Month-end founder pay. C-corp: W-2 payroll through Gusto (gross wages → 'payroll', employer FICA + FUTA + SUTA →
 * 'payroll_tax', Gusto fee), the founder receives net pay. LLC / sole prop: an owner draw (equity, not taxed as wages);
 * income tax + SE tax on the business profit are paid personally through quarterly 1040-ES estimates.
 */
export function payFounder(state) {
  const p = ensurePersonal(state);
  const gross = round2(state.founder.salary || 0);
  if (gross > 0) {
    if (isCcorp(state)) {
      const year = dateOf(state).getUTCFullYear();
      if (p.payrollYtd?.year !== year) p.payrollYtd = { year, wages: 0 };
      const ytd = p.payrollYtd.wages;
      const capped = (base) => Math.max(0, Math.min(gross, base - ytd));
      const employer = round2(gross * FOUNDER_PAY.employerFica + capped(FOUNDER_PAY.futaWageBase) * FOUNDER_PAY.futaRate + capped(FOUNDER_PAY.sutaWageBase) * FOUNDER_PAY.sutaRate);
      p.payrollYtd.wages = round2(ytd + gross);
      post(state, { amount: -gross, counterparty: 'Gusto', description: `GUSTO NET PAY + WITHHOLDING (founder: ${state.founder.name})`, category: 'payroll', method: 'payroll', meta: { founderPayroll: true } });
      post(state, { amount: -employer, counterparty: 'Gusto', description: 'GUSTO EMPLOYER TAXES (FICA, FUTA, SUTA) founder', category: 'payroll_tax', method: 'payroll', meta: { founderPayroll: true } });
      const fee = peopleGustoActive(state) ? COMPANY.gusto.perPerson : COMPANY.gusto.base + COMPANY.gusto.perPerson;
      post(state, { amount: -fee, counterparty: 'Gusto', description: peopleGustoActive(state) ? 'Gusto per-person fee (founder)' : 'Gusto payroll (base + founder)', category: 'software', method: 'card', meta: { founderPayroll: true } });
      personalTxn(state, netFounderPay(state, gross), 'Founder salary (W-2, net of FICA and withholding)', 'income');
    } else {
      post(state, { amount: -gross, counterparty: state.founder.name, description: 'Owner draw', category: 'owner_draw', method: 'ach' });
      personalTxn(state, gross, 'Owner draw (taxed through quarterly 1040-ES, not withheld)', 'income');
    }
  }
  accrueEstimatedTax(state);
}

// Pass-through profit (LLC / sole prop) accrues personal income + SE tax, paid on the 1040-ES dates.
function accrueEstimatedTax(state) {
  if (isCcorp(state)) return;
  const p = ensurePersonal(state);
  const year = dateOf(state).getUTCFullYear();
  const month = monthIndex(state);
  const est = (p.estTax ??= { year, profit: 0, paid: 0, prev: null });
  if (est.year !== year) { est.prev = { year: est.year, profit: est.profit, paid: est.paid }; Object.assign(est, { year, profit: 0, paid: 0 }); }
  let profit = 0;
  for (const t of state.bank.txns) {
    const d = dateOf(state, t.day);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month) continue;
    const kind = CATEGORIES[t.category]?.kind;
    if (kind === 'income' || kind === 'expense' || kind === 'cogs') profit += t.amount;
  }
  est.profit = round2(est.profit + profit);
}

export const estimatedTaxRate = () => FOUNDER_PAY.seTax + FOUNDER_PAY.passThroughIncomeTax;

function estimatedTaxDay(state) {
  if (dayOfMonth(state) !== 15) return;
  const p = ensurePersonal(state);
  const est = p.estTax;
  if (!est) return;
  const m = monthIndex(state);
  const rate = estimatedTaxRate();
  let due = 0, label = '';
  if (m === 0 && est.prev) { due = Math.max(0, est.prev.profit) * rate - est.prev.paid; est.prev.paid += Math.max(0, due); label = `Q4 ${est.prev.year}`; }
  else if (m === 3 || m === 5 || m === 8) { due = Math.max(0, est.profit) * rate - est.paid; est.paid += Math.max(0, due); label = `${{ 3: 'Q1', 5: 'Q2', 8: 'Q3' }[m]} ${est.year}`; }
  due = round2(due);
  if (due > 1) {
    personalTxn(state, -due, `IRS Form 1040-ES estimated tax ${label} (income + self-employment tax on business profit)`, 'tax');
    notify(state, `Paid ${due.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} of quarterly estimated tax (${label}) from your personal account: the business profit is yours for tax purposes.`, { app: 'financing' });
  }
}

// Kept for compatibility: pay received as a draw/salary (net as computed by netFounderPay).
export function receiveDraw(state, gross) {
  personalTxn(state, netFounderPay(state, gross), 'Founder salary / draw', 'income');
}

export const personalRunwayMonths = (state) => {
  const p = ensurePersonal(state);
  const net = p.monthlyLivingCosts + p.monthlyDebtPayments - (p.annualIncome / 12) * (1 - EFFECTIVE_TAX) - netFounderPay(state);
  return net <= 0 ? Infinity : Math.max(0, p.liquidSavings) / net;
};
