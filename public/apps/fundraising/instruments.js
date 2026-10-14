// Accelerator deals, revenue-based financing and grants. Pure functions.
// Sources: docs/research/fundraising.md §1 (accelerator table), §4 (RBF, grants), §8 (parameters).

import { clamp } from '../../core/util.js';

// ---- Accelerators (2026 standard deals) ----
// Acceptance rates are not in the research; programs are highly selective. baseAccept is a [D] game value.
export const ACCELERATORS = {
  yc: {
    label: 'Y Combinator', source: 'ycombinator.com/deal (2026) [P]',
    summary: '$500K: $125K for 7% on a post-money SAFE + $375K uncapped MFN SAFE (~9.5% total at a $15M cap). Pro-rata right, no fees.',
    parts: [
      { kind: 'safe', amount: 125000, cap: 125000 / 0.07, mfn: false, proRata: true, label: '$125K for 7% (post-money SAFE)' },
      { kind: 'safe', amount: 375000, cap: null, mfn: true, proRata: true, label: '$375K uncapped MFN SAFE' },
    ],
    weeks: 13, hoursPerWeek: 10, decisionDays: 35, baseAccept: 0.015, soloMult: 0.8,
    questions: ['Describe what your company does in 50 characters or less.', 'What is your company going to make? Please describe your product and what it does or will do.', 'Why did you pick this idea to work on? Do you have domain expertise in this area? How do you know people need what you\'re making?', 'Who are your competitors? What do you understand about your business that they don\'t?', 'How far along are you? How many active users or customers do you have? What is your revenue?'],
  },
  techstars: {
    label: 'Techstars', source: '2026 program coverage [S]',
    summary: '$220K: $20K for 5% common (convertible equity agreement) + $200K uncapped MFN SAFE.',
    parts: [
      { kind: 'common', pct: 0.05, amount: 20000, label: '$20K for 5% common' },
      { kind: 'safe', amount: 200000, cap: null, mfn: true, proRata: false, label: '$200K uncapped MFN SAFE' },
    ],
    weeks: 13, hoursPerWeek: 10, decisionDays: 45, baseAccept: 0.02, soloMult: 0.85,
    questions: ['What does your company do, in one sentence?', 'What problem are you solving and for whom?', 'What traction do you have so far?', 'Why is your team the right one to build this?', 'What do you want to get out of the program?'],
  },
  speedrun: {
    label: 'a16z speedrun', source: 'a16z.com SR007 post (2026) [P]',
    summary: 'Up to $1M: $500K for 10% via a SAFE + $500K into your next round within 18 months. $5M+ in credits.',
    parts: [
      { kind: 'safe', amount: 500000, cap: 5000000, mfn: false, proRata: true, label: '$500K for 10% (SAFE, $5M post-money cap)' },
      { kind: 'commitment', amount: 500000, months: 18, label: '$500K reserved for your next round (within 18 months)' },
    ],
    weeks: 12, hoursPerWeek: 10, decisionDays: 40, baseAccept: 0.01, soloMult: 0.85,
    questions: ['What are you building, in one line?', 'Why now? What changed in the last 18 months that makes this possible?', 'What have you shipped and how fast?', 'Who is using it and what do they pay?', 'What would stop OpenAI or an incumbent from doing this?'],
  },
};

// [D] Acceptance odds from panel score S (1–5) and the LLM-judged essay (1–10). Calibrated so a median
// founder (S≈3.2, essay 6) is ~1–2% and an exceptional one (S≈4.3, essay 8–9) is ~10–20%.
export function acceleratorOdds(prog, { S, essay, solo }) {
  const p = prog.baseAccept * Math.exp((S - 3) * 1.2) * Math.pow(clamp(essay, 1, 10) / 6, 2) * (solo ? prog.soloMult : 1);
  return clamp(p, 0.001, 0.3);
}

// ---- Revenue-based financing ----
// Lighter Capital: min $15K MRR ($200K ARR); up to ~1/3 ARR; 2–8% of monthly revenue until 1.35–2.0x. [P/S]
// Founderpath: min ~$10K MRR; up to ~50% ARR; 7–13% discount, fixed monthly installments (12 mo here). [V]
// Stripe Capital: Stripe merchants only; flat fee ~8–20%; repaid as a % of daily Stripe sales. [V]
export const RBF_PROVIDERS = {
  lighter: { label: 'Lighter-style RBF', minMrr: 15000, minMonths: 6, maxAdvanceOfArr: 1 / 3, repayPct: [0.02, 0.08], capMultiple: [1.35, 2.0], schedule: 'pct', source: 'Lighter Capital pages/reviews [P/S]' },
  founderpath: { label: 'Founderpath-style advance', minMrr: 10000, minMonths: 6, maxAdvanceOfArr: 0.5, discount: [0.07, 0.13], termMonths: 12, schedule: 'fixed', source: 'Founderpath own pages [V]' },
  stripe: { label: 'Stripe Capital-style loan', minMonths: 3, minMonthlyVolume: 1000, flatFee: [0.08, 0.2], withholdPct: 0.15, schedule: 'stripe', source: 'Founderpath vs Stripe Capital comparison [V]' },
};

// Risk 0 (great) … 1 (poor) from churn, growth, margin and history. [D]
export function rbfRisk(m, monthsHistory) {
  let r = 0.5;
  const ch = m.revenueChurn ?? 0.05;
  r += ch > 0.06 ? 0.2 : ch < 0.02 ? -0.15 : 0;
  const g = m.momGrowth ?? 0;
  r += g < 0 ? 0.2 : g > 0.08 ? -0.15 : 0;
  const gm = m.grossMargin ?? 0.6;
  r += gm < 0.5 ? 0.15 : gm > 0.75 ? -0.1 : 0;
  r += monthsHistory >= 12 ? -0.1 : 0;
  return clamp(r, 0, 1);
}

/** rbfOffer(providerId, metrics, { monthsHistory, stripeMonthlyVolume, hasStripe }) → offer or { eligible:false, reason } */
export function rbfOffer(id, m, { monthsHistory = 0, stripeMonthlyVolume = 0, hasStripe = true } = {}) {
  const p = RBF_PROVIDERS[id];
  if (monthsHistory < p.minMonths) return { eligible: false, reason: `Needs ${p.minMonths}+ months of revenue history (you have ${monthsHistory.toFixed(1)}).` };
  const risk = rbfRisk(m, monthsHistory);
  const lerp = ([a, b], t) => a + (b - a) * t;
  if (p.schedule === 'stripe') {
    if (!hasStripe || stripeMonthlyVolume < p.minMonthlyVolume) return { eligible: false, reason: 'Only offered to Stripe merchants with steady processing volume.' };
    const advance = Math.round((stripeMonthlyVolume * (2.5 - risk)) / 500) * 500; // [D] ~1.5–2.5 months of volume
    const fee = +lerp(p.flatFee, risk).toFixed(3);
    const total = Math.round(advance * (1 + fee));
    // Stripe Capital: a % of sales is withheld; loans carry a minimum (≈ total/9 every 60 days) and an ~18-month term.
    return { eligible: true, provider: id, advance, fee, total, repayPct: p.withholdPct, schedule: 'stripe', minPer60Days: Math.round(total / 9), termMonths: 18, risk };
  }
  if ((m.mrr ?? 0) < p.minMrr) return { eligible: false, reason: `Needs at least $${p.minMrr.toLocaleString('en-US')} MRR (you have $${Math.round(m.mrr ?? 0).toLocaleString('en-US')}).` };
  let advance = Math.round((m.arr * p.maxAdvanceOfArr * (1 - 0.5 * risk)) / 1000) * 1000;
  if (p.schedule === 'pct') {
    // Review F9: Lighter pays off in ~22–48 months; size the % to repay the cap in ~36 months at today's revenue
    // (2–8%), shrink the advance if that would need more than 8%, and set a 60-month maturity (balloon).
    const capMultiple = +lerp(p.capMultiple, risk).toFixed(2);
    let repayPct = (advance * capMultiple) / (36 * m.mrr);
    if (repayPct > 0.08) { advance = Math.floor((0.08 * 36 * m.mrr) / capMultiple / 1000) * 1000; repayPct = 0.08; }
    repayPct = +clamp(repayPct, 0.02, 0.08).toFixed(3);
    return { eligible: true, provider: id, advance, capMultiple, total: Math.round(advance * capMultiple), repayPct, schedule: 'pct', maturityMonths: 60, risk };
  }
  const discount = +lerp(p.discount, risk).toFixed(3);
  const total = Math.round(advance / (1 - discount));
  return { eligible: true, provider: id, advance, discount, total, installment: Math.round(total / p.termMonths), termMonths: p.termMonths, schedule: 'fixed', risk };
}

// One repayment. loan: { schedule, repayPct, installment, remaining }. revenue = that period's revenue.
export function rbfPayment(loan, revenue) {
  if (loan.remaining <= 0) return 0;
  const due = loan.schedule === 'fixed' ? loan.installment : Math.max(0, revenue) * loan.repayPct;
  return Math.round(Math.min(loan.remaining, due) * 100) / 100;
}

// Annualized cost from cash flows (IRR): flows[0] = +advance at t0, then monthly payments (negative).
export function irrApr(advance, payments) {
  const npv = (r) => advance - payments.reduce((a, p, i) => a + p / Math.pow(1 + r, i + 1), 0);
  if (npv(0) >= 0) return 0;
  let lo = 0, hi = 1;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (npv(mid) < 0) lo = mid; else hi = mid; }
  return Math.pow(1 + (lo + hi) / 2, 12) - 1;
}

// Project payoff month by month at a revenue growth rate; returns { months, apr (true IRR-based), balloon }.
export function rbfProjection(offer, mrr, monthlyGrowth = 0) {
  let remaining = offer.total, rev = mrr, months = 0, balloon = 0;
  const pays = [];
  const maxMonths = offer.maturityMonths ?? offer.termMonths ?? 120;
  while (remaining > 0.5 && months < maxMonths) {
    let pay = offer.schedule === 'fixed' ? Math.min(remaining, offer.installment) : Math.min(remaining, rev * offer.repayPct);
    if (offer.schedule === 'stripe' && (months + 1) % 2 === 0) { const two = pay + (pays.at(-1) ?? 0); if (two < offer.minPer60Days) pay += Math.min(remaining - pay, offer.minPer60Days - two); }
    pays.push(pay); remaining -= pay; months++; rev *= 1 + monthlyGrowth;
  }
  if (remaining > 0.5) { balloon = remaining; pays[pays.length - 1] += remaining; }
  return { months, apr: irrApr(offer.advance, pays), balloon: Math.round(balloon) };
}

// ---- Grants ----
// SBIR/STTR reauthorized through Sep 30 2031 (research §4). Phase I amounts vary by agency; the game uses
// [D] $150K–$275K, a [D] 15% base award rate, slow decisions (~4–6 months) and better odds for deep-tech/gov.
export const GRANTS = {
  sbir: { label: 'SBIR/STTR Phase I', amount: [150000, 275000], writingHours: 24, decisionDays: [120, 180], baseOdds: 0.15, source: 'Crowell & Moring alert, Apr 2026 [P/S]; amounts/odds are game assumptions' },
};
export function grantOdds(score10, deepTech) {
  return clamp(GRANTS.sbir.baseOdds * Math.pow(score10 / 6, 2) * (deepTech ? 1.6 : 0.5), 0.01, 0.4);
}
