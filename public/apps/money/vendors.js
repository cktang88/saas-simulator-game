// Back-office vendors as of Q4 2026: what each one is, how its workflow differs, and the numbers the engine uses.
// Data only (no imports) so spend.js, ledger.js, compliance.js and core/stripe.js can read it without cycles.
// Source: docs/research/tools/2026q4/back-office-finance.md ("BOF §n"), building on deep/d11-banking-spend-bookkeeping.md.
// Tags: [vendor] vendor page, [third-party] aggregator or competitor, [unverified] not confirmed, [design] a game
// estimate that is never shown as a statistic.

// Key dates (BOF §0). Dates are compared with the game calendar (state.startDate + day).
export const DATES = {
  brexCapitalOne: '2026-04-07', // Capital One closed the Brex acquisition (BOF §0.2)
  mercuryOccConditional: '2026-04-27', // OCC conditional national-bank charter; FDIC + Fed approvals still pending (BOF §0.7)
  angelListClosed: '2026-08-01', // standalone cap table closed to new customers, Aug 2026 [third-party] (BOF §0.5)
  pulleyAnnounce: '2026-09-16', // shutdown announced (TechCrunch) (BOF §0.1)
  pulleyAssistCutoff: '2026-11-30', // last day to sign with Carta for the assisted migration + year-1 price match
  pulleyShutdown: '2026-12-08', // last day of service; self-serve export ends
  pulleyDataEnd: '2027-01-31', // limited data access reportedly ends [third-party]
};

// ---------------------------------------------------------------------------------------------------------
// Banking (BOF §2). The paradigm decides what the founder does every month.
//  subAccounts: 'envelopes' = percentage rules split every deposit into named accounts automatically (Profit First);
//               'manual' = extra accounts exist but you move the money yourself; 'none' = one account.
//  billPay: 'automated' = bills arrive by email, OCR, approval, scheduled ACH, synced to the ledger;
//           'basic' = you type each bill in and schedule it.
// ---------------------------------------------------------------------------------------------------------
export const BANKS = {
  mercury: {
    label: 'Mercury', monthly: 0, subAccounts: 'manual', billPay: 'basic', treasury: true,
    paradigm: 'Bank-first operating account: ACH, wires, invoices, Treasury, bank feeds. The card is a feature.',
    status: 'OCC conditional national-bank charter (Apr 27, 2026); it still needs FDIC and Federal Reserve approval, so deposits sit at partner banks (Choice, Column) until then.',
    fit: 'Default operating account for most startups, pre-seed to Series A.',
    source: 'BOF §0.7, §2; plans Free / Plus $29.90 / Pro $299 (d11)',
  },
  relay: {
    label: 'Relay', monthly: 30, subAccounts: 'envelopes', billPay: 'basic', treasury: false,
    paradigm: 'Envelope banking: up to 20 checking accounts and percentage rules that split each deposit (tax, profit, owner pay, opex). Built for Profit First.',
    status: 'Active. Grow plan ~$30/mo for auto-transfer rules [unverified: vendor page not reached; not in BOF].',
    fit: 'Indie and profitable bootstrapped companies that want tax money out of sight before it gets spent.',
    trap: 'No Treasury in the game: idle cash above ~$250K earns nothing here.',
    source: 'task brief; prices [unverified]',
  },
  rho: {
    label: 'Rho', monthly: 0, subAccounts: 'manual', billPay: 'automated', treasury: true,
    paradigm: 'Banking, AP bill pay, cards and treasury in one platform: bills are captured, approved and paid by scheduled ACH, then synced to the ledger.',
    status: 'Active; no platform fee [vendor claim, unverified].',
    fit: 'Seed+ companies paying many vendor and contractor invoices.',
    source: 'BOF cites Rho comparisons (Firstbase, Treasury yields); AP features [vendor claim]',
  },
  brex: {
    label: 'Brex business account', monthly: 0, subAccounts: 'none', billPay: 'automated', treasury: true,
    paradigm: 'Card-first platform with a business account; limits underwritten on your cash balance. Inside Capital One since Apr 7, 2026.',
    status: 'Acquired by Capital One (closed Apr 7, 2026; CEO stays). Post-acquisition product changes are not verified, so the game models integration risk: terms and onboarding notices you must handle.',
    fit: 'VC-backed teams with travel and global spend; fewer new-startup signals than Ramp since the deal.',
    trap: 'Acquisition integration: expect re-verification requests and changed terms.',
    source: 'BOF §0.2, §2',
  },
};
// Bill pay hours per vendor bill and chance a bill is paid late, by workflow [design: typing an invoice, matching
// it, scheduling the ACH and attaching it to the books ≈ 9 min by hand; ~2 min to approve a captured bill].
export const BILL_PAY = {
  basic: { hours: 0.15, lateChance: 0.04 },
  automated: { hours: 0.03, lateChance: 0.005 },
  lateFee: { pct: 0.015, min: 25 }, // typical vendor late fee 1.5% or $25 [design]
};
// Moving the operating account: new KYC, Stripe payout account, payroll, every card on file [design].
export const BANK_SWITCH = { hours: 3, perRecurring: 0.1, missedCardChance: 0.08 };
// IRC §6657 dishonored payment penalty: 2% of a payment of $1,250 or more, otherwise the lesser of $25 or the payment.
export const DISHONORED = { pct: 0.02, threshold: 1250, flat: 25 };
export const MANUAL_SWEEP_HOURS = 0.25; // moving the tax reserve by hand each month [design]

// ---------------------------------------------------------------------------------------------------------
// Spend (BOF §2): Ramp is software on top of any bank; Brex is now part of Capital One.
// ---------------------------------------------------------------------------------------------------------
export const SPEND_VENDORS = {
  ramp: {
    label: 'Ramp', plusPerUser: 15, cashback: 0.015, agent: true, savingsInsights: true, billPay: 'automated',
    paradigm: 'Software-first spend control: card, receipts, approvals, bill pay and AI coding at the swipe (Accounting Agent, Feb 2026, on by default for Plus), sitting on whichever bank you use. Price intelligence flags unused and overpriced SaaS.',
    source: 'Free $0/user, Plus $15/user + platform fee, 1.5% cashback [third-party]; Accounting Agent [vendor docs] (BOF §2)',
  },
  brex: {
    label: 'Brex (Capital One)', plusPerUser: 12, cashback: 0.01, agent: false, savingsInsights: false, billPay: 'automated', global: true,
    paradigm: 'High limits underwritten on your cash balance, points, travel and multi-currency cards. Now on Capital One\'s balance sheet.',
    source: 'Essentials $0 / Premium $12 (d11); points ≈ 1% effective [design]; Capital One deal (BOF §0.2)',
  },
};
// Ramp's agent codes card charges at the swipe: card miscategorizations drop to this share of what the bookkeeping
// tool alone would do [design; vendor claims ~99% accuracy without a method].
export const AGENT_MISCLASS_MULT = 0.4;
// Capital One integration notices on Brex products: chance per quarter, hours to handle, rewards change [design].
export const INTEGRATION = { perQuarter: 0.25, hours: 1.5, rewardCut: 0.0025 };

// ---------------------------------------------------------------------------------------------------------
// Tax (BOF §3). Rivet is unverified, so the generic option is a startup CPA, not a named vendor.
// ---------------------------------------------------------------------------------------------------------
export const TAX_SERVICES = {
  cpa: {
    label: 'Generic CPA firm', base: { ccorp: 1500, llc: 600, none: 0 }, rd: false,
    paradigm: 'Files the return from your books at year end. R&D credits only if you ask for a separate study.',
    source: 'C-corp return $1,000–3,500 (money/compliance.js TAX.cpaBase) [design]',
  },
  fondo: {
    label: 'Fondo (startup tax + R&D credits)', base: { ccorp: 950, llc: 950, none: 0 }, rd: true, rdFee: 0.2,
    paradigm: 'Startup-specialist tax: Delaware franchise, 1120, state filings and the R&D credit study bundled; the credit is claimed against payroll tax.',
    source: 'tax from ~$950/yr [third-party, conflicting]; R&D ~20% contingency [unverified] (BOF §3)',
  },
};
// R&D credit, alternative simplified credit for a company with no QREs in the prior 3 years: 6% of current QREs
// (IRC §41(c)(4)(B)); a qualified small business may apply up to $500K against the employer share of payroll tax.
// Contract research counts at 65% (§41(b)(3)). Share of wages that are qualified research at an engineering-led
// startup [design].
export const RD_CREDIT = { rate: 0.06, contractShare: 0.65, wageShare: 0.6, payrollCap: 500000, minToBother: 1000 };

// ---------------------------------------------------------------------------------------------------------
// Billing platforms (BOF §4). Stripe Billing's 0.7% is replaced (not added) when another platform bills.
//  metering: 'basic' (Stripe meters) | 'advanced' (event streams, pricing-as-code, credits, plan versions).
// ---------------------------------------------------------------------------------------------------------
export const BILLING_PLATFORMS = {
  stripe_billing: {
    label: 'Stripe Billing', pct: 0.007, monthly: 0, setupHours: 0, metering: 'basic', revrec: false,
    paradigm: 'Billing welded to payments: one data model for charge, invoice, tax, dunning and portal. Cheapest setup; weakest for complex usage and credits.',
    source: '0.7% of billed volume [third-party] (BOF §4)',
  },
  metronome: {
    label: 'Metronome (Stripe)', pct: 0, monthly: 0, setupHours: 40, metering: 'advanced', revrec: false, allotment: 100000, overAllotmentMonthly: 1500,
    paradigm: 'Event metering and pricing-as-code, now Stripe\'s enterprise usage billing. For truly usage or credit-priced, sales-led contracts.',
    source: 'acquired by Stripe (closed early 2026); Startup plan $100K billing allotment, 10M events [third-party]; above it a custom contract [design]',
  },
  orb: {
    label: 'Orb (Adyen)', pct: 0, monthly: 720, setupHours: 40, metering: 'advanced', revrec: false,
    paradigm: 'Event-stream usage billing with plan versioning and real-time usage, processor-agnostic. Adyen bought it in Jul 2026; standalone for now.',
    trap: 'Roadmap risk: the acquirer wants it inside its payments stack.',
    source: 'acquired by Adyen ($335M, Jul 2026) [verified]; price quote-only, $720/mo is [design]',
  },
  chargebee: {
    label: 'Chargebee', pct: 0.008, monthly: 0, setupHours: 20, metering: 'basic', revrec: true,
    paradigm: 'Finance-ops subscription management: invoicing, revenue recognition, multiple gateways. Plans in flux in 2026.',
    trap: 'Overkill for a Stripe-only company under ~$1M ARR.',
    source: '~0.8% of billing [third-party, competitor-sourced; plans restructured mid-2026] (BOF §4)',
  },
};
export const USAGE_MODELS = new Set(['usage', 'hybrid', 'ai_credits', 'outcome']);
// Usage invoices on basic metering: share wrong each month, the credit issued, and founder hours to reconcile per
// usage customer; advanced metering cuts both [design].
export const USAGE_BILLING = { errorRate: { basic: 0.03, advanced: 0.003 }, creditShare: 0.15, reconcileHours: { basic: 0.05, advanced: 0.005 }, overkillAfterDays: 60 };

// Merchants of record (BOF §4; research §1.6). fee = pct + fixed per transaction, plus surcharges.
// migrate: moving every subscription to a new checkout vs keeping them on your own Stripe account.
export const MOR_PROVIDERS = {
  paddle: {
    label: 'Paddle', pct: 0.05, fixed: 0.5, intl: 0, sub: 0, invoicing: true, payouts: 'mor', migrate: { days: 21, hours: 12, loss: [0.05, 0.1] },
    paradigm: 'Full MoR for software: tax, invoicing (B2B invoices too), fraud and disputes; paid monthly or twice monthly.',
    source: '5% + 50¢ all-in [vendor]',
  },
  lemon: {
    label: 'Lemon Squeezy (Stripe)', pct: 0.05, fixed: 0.5, intl: 0.015, sub: 0.005, invoicing: false, payouts: 'mor', migrate: { days: 21, hours: 12, loss: [0.05, 0.1] },
    paradigm: 'Indie-friendly MoR for digital products, owned by Stripe since 2024; Stripe now steers new MoR users to Managed Payments.',
    trap: 'Roadmap risk: maintenance mode is likely as Stripe grows Managed Payments [third-party].',
    source: '5% + 50¢, +1.5% international, +0.5% subscriptions [unverified]',
  },
  polar: {
    label: 'Polar', pct: 0.04, fixed: 0.4, intl: 0.015, sub: 0.005, invoicing: false, payouts: 'mor', migrate: { days: 21, hours: 12, loss: [0.05, 0.1] },
    paradigm: 'Open-source MoR for developers: usage meters, license keys, benefits. Cheapest base rate.',
    source: '4% + 40¢, +1.5% international, +0.5% subscriptions [unverified]',
  },
  stripe_mp: {
    label: 'Stripe Managed Payments', pct: 0.035, fixed: 0, intl: 0, sub: 0, onTopOfStripe: true, invoicing: false, payouts: 'stripe', migrate: { days: 7, hours: 4, loss: [0, 0.01] },
    paradigm: 'MoR inside your own Stripe account: Stripe becomes the seller for tax and disputes; subscriptions, customers and payouts stay where they are.',
    source: '3.5% on top of standard Stripe processing [vendor, verify]; digital products only',
  },
};

// ---------------------------------------------------------------------------------------------------------
// Cap table (BOF §5).
// ---------------------------------------------------------------------------------------------------------
export const CAP_VENDORS = {
  spreadsheet: {
    label: 'Spreadsheet (or an AI-maintained sheet)', annual: 0, fit: 'Pre-seed with a handful of holders.', errorPerEntry: 0.06,
    paradigm: 'Works until a priced round, a 409A or an audit, when every entry is checked against the signed documents.',
    sel: true, source: 'BOF §5 paradigm; error rate [design]',
  },
  carta: {
    label: 'Carta', annual: 5988, freeStakeholders: 25, freeRaised: 1000000, grow: { stakeholders: 100, annual: 11988 }, includes409a: true, renewalUplift: 0.1,
    paradigm: 'Investor-standard system of record: cap table, 409A, option administration. The gravity well (now absorbing Pulley).',
    sel: true, source: 'Launch free ≤25 stakeholders / ~$1M raised via law-firm partners [third-party, conflicting]; Build $5,988/yr incl. 409A, Grow $11,988 [third-party CostBench]; renewal uplift [design]',
  },
  cake: {
    label: 'Cake Equity', annual: 960, fit: 'Pre-seed and seed on a budget.', separate409a: 1500,
    paradigm: 'Low-cost cap table and option plans; 409A bought separately.',
    sel: true, source: '409A $1,500 separate [third-party]; subscription price [design]',
  },
  fidelity: {
    label: 'Fidelity Private Shares', annual: 0, fit: 'Early-stage companies that want a free start.', separate409a: 1229,
    paradigm: 'Free starter cap table from a brokerage, 409A from $1,229.',
    sel: true, source: '409A $1,229–3,199 [third-party]; free starter tier [unverified]',
  },
  ledgy: {
    label: 'Ledgy', annual: 1800, fit: 'EU/UK companies (EMI, BSPCE, VSOP plans).', separate409a: 2000,
    paradigm: 'European-first equity management; US 409A through a partner.',
    sel: true, source: 'BOF §5 alternatives; prices [design]',
  },
  pulley: {
    label: 'Pulley', annual: 1200, sel: false, dead: true,
    paradigm: 'Was the cheaper Carta challenger. Shutting down Dec 8, 2026; customers are handed to Carta.',
    source: 'last published Startup $1,200/yr [third-party]; shutdown (BOF §0.1)',
  },
  angellist: {
    label: 'AngelList cap table', annual: 1600, sel: false, closed: true,
    paradigm: 'Standalone cap table closed to new customers (Aug 2026); AngelList now centres on RUVs that collapse many angels into one line.',
    source: 'BOF §0.5 [third-party]',
  },
};
export const STANDALONE_409A = 2500; // Carta without Build, or an independent appraiser: ~$2,500–4,000 [third-party]
export const CAP_MIGRATION = { baseHours: 3, perStakeholder: 0.1, assistedHours: 2, exportHours: 8, rebuild: { hours: 15, usd: 4000, afterDataEnd: 6500 } }; // [design]
export const CAP_RECON = { usdPerError: 1200, hoursPerError: 3 }; // counsel reconciling a spreadsheet at a priced round [design]

// ---------------------------------------------------------------------------------------------------------
// Virtual mailroom (BOF §1).
// ---------------------------------------------------------------------------------------------------------
export const MAILROOM = {
  none: { label: 'No business address (registered agent only / forwarding)', monthly: 0, missChance: 0.3, note: 'Official mail goes to an old address or sits with the registered agent.' },
  home: { label: 'Home address', monthly: 0, missChance: 0.02, usOnly: true, note: 'Free, but your home address goes on public filings, and moving means updating the IRS (Form 8822-B), the state and the bank.' },
  bundled: { label: 'Formation-bundled address (doola / Firstbase)', monthly: 0, missChance: 0.03, note: 'Included with the formation subscription; forwarding is slower.' },
  stable: { label: 'Stable virtual mailroom (Grow)', monthly: 59, annualMonthly: 49, pieces: 30, overage: 3, agentPerState: 25, missChance: 0, firstYearDiscount: 0.5, note: 'Scanned to a dashboard the day it arrives: open, scan, forward, shred, deposit checks. 50% off Grow for a year under $1M revenue.' },
};
// Official notices per month (IRS, Delaware, each state you are registered in) and the cost of a missed one
// [design: state late penalties are typically $50–$400; game uses $250 plus a reinstatement-style fix].
export const NOTICES = { perEntity: 0.2, perState: 0.15, handleHours: 0.1, missedPenalty: 250, missedHours: 2, surfaceDays: 45, piecesBase: 4 };

// ---------------------------------------------------------------------------------------------------------
// Retired or outdated tools, with the dated note players see (BOF §0, §7: SignalFire guide items gone stale).
// ---------------------------------------------------------------------------------------------------------
export const RETIRED = [
  { name: 'Bench', status: 'Dead', note: 'Shut down overnight Dec 27, 2024, then sold to Employer.com; customers lost access to their books and tax documents. Keep books in a standard ledger you can export.' },
  { name: 'Pulley', status: 'Shutting down Dec 8, 2026', note: 'Carta matches year-1 pricing for customers who sign by Nov 30, 2026; self-serve export ends Dec 8.' },
  { name: 'AngelList cap table', status: 'Closed to new customers (Aug 2026)', note: 'Third-party reports; AngelList now centres on RUVs and SPVs.' },
  { name: 'First Republic', status: 'Failed (2023)', note: 'Still listed in the SignalFire back-office guide (2024).' },
  { name: 'SVB', status: 'Now part of First Citizens', note: 'The guide lists it as a standalone startup bank.' },
  { name: 'Divvy', status: 'Now BILL Spend & Expense', note: 'Acquired by Bill (2021) [unverified].' },
  { name: 'captable.io', status: 'Unverified / legacy', note: 'No 2026 pricing or status found; use a spreadsheet or a free starter tier.' },
  { name: 'Ironclad', status: 'Outdated for small startups', note: 'Enterprise CLM ($30K+/yr est.): shelfware before you sign hundreds of contracts a year.' },
];
