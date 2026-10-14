// Personal and early-stage business financing products for the SaaS founder simulator.
// Research basis: docs/research/personal-financing.md (researched 2026-10-14).
// Values marked [design] in comments are game assumptions bracketed by sources, not published lender terms.
// Deterministic and dependency-free. Not financial advice.

// ---------------------------------------------------------------------------
// Market constants (October 2026)
// ---------------------------------------------------------------------------

/** WSJ/Fed bank prime loan rate, % (FRED DPRIME = 7.00 on 2026-10-02, after the 2026-09-16 FOMC hike to 3.75-4.00%). */
export const PRIME_RATE_2026 = 7.0;

/** IRS applicable federal rates for October 2026, annual compounding, % (Rev. Rul. 2026-19). */
export const AFR_OCT_2026 = { shortTerm: 4.25, midTerm: 4.61, longTerm: 5.22 };

/** Federal credit union loan APR ceiling, % (NCUA, extended to 2027-09-10). */
export const NCUA_FCU_APR_CAP = 18.0;

/** Average credit card APR, % (Bankrate weekly average, 2026-09-30). */
export const AVG_CREDIT_CARD_APR_2026 = 19.63;

/** Freddie Mac PMMS 30-year fixed, % (week of 2026-10-01). */
export const MORTGAGE_30Y_2026 = 7.28;

/** 401(k) plan loan cap, $ (IRC 72(p); IRS Retirement Plans FAQs regarding loans). */
export const PLAN_LOAN_MAX = 50000;

/** Gift tax annual exclusion per donee, 2026, $ (IRS). */
export const GIFT_TAX_ANNUAL_EXCLUSION_2026 = 19000;

/** ACA national average benchmark (second-lowest silver) premium, 40-year-old, unsubsidized, $/month, 2026 (KFF via Becker's). */
export const ACA_BENCHMARK_PREMIUM_40YO_2026 = 625;

/** 400% FPL subsidy cliff for a single person, 2026 coverage year, $ (KFF). Enhanced credits expired 2025-12-31. */
export const ACA_SUBSIDY_CLIFF_SINGLE_2026 = 62600;

/** SBA 7(a) variable-rate maximum spreads over the base (prime) rate, by loan size (SOP 50 10 8; sba.gov). */
export const SBA_VARIABLE_SPREADS = [
  { maxLoan: 50000, spread: 6.5 },
  { maxLoan: 250000, spread: 6.0 },
  { maxLoan: 350000, spread: 4.5 },
  { maxLoan: Infinity, spread: 3.0 },
];

/** SBA 7(a) fixed-rate maximum spreads over prime, by loan size (SOP 50 10 8 as summarized by United Capital Source, Apr 2026). */
export const SBA_FIXED_SPREADS = [
  { maxLoan: 25000, spread: 8.0 },
  { maxLoan: 50000, spread: 7.0 },
  { maxLoan: 250000, spread: 6.0 },
  { maxLoan: Infinity, spread: 5.0 },
];

/** SBA 7(a) minimum debt service coverage for 7(a) Small loans (Procedural Notice 5000-876777, eff. 2026-03-01). */
export const SBA_MIN_DSCR = 1.1;

/** SBA minimum equity injection for start-ups (SOP 50 10 8). Lenders often ask 20-30% for start-ups. */
export const SBA_MIN_EQUITY_INJECTION_STARTUP = 0.1;

// ---------------------------------------------------------------------------
// Product catalogue
// ---------------------------------------------------------------------------

const S = {
  nerdwalletBest: 'https://www.nerdwallet.com/m/loans/personal-loans/best-personal-loans',
  nerdwalletBiz: 'https://www.nerdwallet.com/best/loans/personal-loans/personal-business-loans',
  credibleRates: 'https://www.credible.com/personal-loan/personal-loan-interest-rates',
  bankratePL: 'https://www.bankrate.com/personal-loans/',
  lightstreamFaq: 'https://www.lightstream.com/faq',
  ncua: 'https://ncua.gov/newsroom/press-release/2026/ncua-board-extends-loan-interest-rate-ceiling',
  bankrateCards: 'https://www.wcax.com/bankrate-article/2026/09/30/current-credit-card-interest-rates/',
  creditKarmaBT: 'https://www.creditkarma.com/credit-cards/i/best-balance-transfer-cards-ccm',
  nerdwalletBiz0: 'https://www.nerdwallet.com/business/credit-cards/best/zero-percent-apr?cat=t3qb91',
  navBizReporting: 'https://www.nav.com/business-credit-card/do-business-credit-cards-report-to-personal-credit/',
  mbrHeloc: 'https://www.monitorbankrates.com/news/home-equity-rates/average-home-equity-rates-october-6-2026',
  primeratesHeloc: 'https://primerates.com/mortgage-rates/heloc-rates/',
  mortgageReportsSE: 'https://themortgagereports.com/126395/heloc-approval-for-self-employed',
  fannieSE: 'https://selling-guide.fanniemae.com/sel/b3-3.2-01/underwriting-factors-and-documentation-self-employed-borrower',
  pmms: 'https://tradingeconomics.com/united-states/30-year-mortgage-rate/news/588887',
  irsPlanLoans: 'https://www.irs.gov/retirement-plans/retirement-plans-faqs-regarding-loans',
  irsRobs: 'https://www.irs.gov/retirement-plans/rollovers-as-business-start-ups-compliance-project',
  guidantPricing: 'https://www.guidantfinancial.com/pricing',
  sba7a: 'https://www.sba.gov/funding-programs/loans/7a-loans',
  sbaMicro: 'https://www.sba.gov/funding-programs/loans/microloans',
  sbaSbss: 'https://www.naggl.org/wp-content/uploads/2026/05/5000-876777.pdf',
  sbaCitizenship: 'https://www.naggl.org/procedural-notice-revising-sop-50-10-8-for-new-citizenship-and-residency-requirements/',
  sbaCitizenship2: 'https://www.selfemployed.com/news/sba-loan-citizenship-rule-2026/',
  sbaFees: 'https://www.naggl.org/fy-2026-loan-fees-and-clarification-of-fee-calculation-for-multiple-wcp-or-ewcp-loans/',
  sbaRates: 'https://www.unitedcapitalsource.com/blog/sba-loan-interest-rates-jan-2026/',
  sop50108: 'https://www.whitefordlaw.com/news-events/client-alert-sba-issues-sop-50-10-8-key-changes-impacting-sba-7a-lending',
  afr: 'https://www.irs.gov/pub/irs-drop/rr-26-19.pdf',
  irsGift: 'https://www.irs.gov/businesses/small-businesses-self-employed/frequently-asked-questions-on-gift-taxes',
  kiva: 'https://startupowl.com/reviews/kiva',
  ibkrMargin: 'https://www.interactivebrokers.com.hk/en/whyib/low-cost-margin.php',
  schwabSbl: 'https://www.schwab.com/learn/story/what-is-securities-based-lending',
  stripeCapital: 'https://docs.stripe.com/capital/eligibility',
  lighter: 'https://lightercapital.com/tech-startup-business-loans',
  onlineLenders: 'https://www.business.org/finance/loans/best-startup-business-loans/',
  fundboxBluevine: 'https://www.nerdwallet.com/article/small-business/bluevine-fundbox-small-business',
  bankLoc: 'https://www.nerdwallet.com/article/small-business/startup-business-line-of-credit',
  fred: 'https://fred.stlouisfed.org/series/DPRIME',
};

export const LENDER_PRODUCTS = [
  {
    id: 'pl_prime_online',
    name: 'Online personal loan (prime lender)',
    kind: 'personal_loan',
    minFico: 660,
    maxDti: 0.4, // [design] within the 36-50% range lenders use
    requiresW2Income: false,
    incomeDocs: 'verified',
    minIncome: 30000, // [design]
    requiresBusinessRevenueMonths: 0,
    minAmount: 5000,
    maxAmount: 100000,
    maxIncomeMultiple: 0.6, // [design] unsecured total vs annual income
    amountRule: 'Lesser of $100k, 60% of verified income [design], and the amount whose payment keeps DTI <= 40% at the longest term',
    aprByFico: [
      { minFico: 760, aprMin: 6.99, aprMax: 11.5, feePct: 0 },
      { minFico: 720, aprMin: 9.0, aprMax: 15.5, feePct: 0 },
      { minFico: 680, aprMin: 12.0, aprMax: 20.0, feePct: 0 },
      { minFico: 660, aprMin: 16.0, aprMax: 24.94, feePct: 0 },
    ],
    originationFeePct: 0,
    termMonths: [24, 36, 48, 60, 72, 84],
    introAprMonths: 0,
    fundingDays: 1,
    collateral: 'none',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: false,
    hardPull: 'hard pull at application (LightStream); SoFi-type lenders prequalify with a soft pull',
    risks: [
      'Loan agreement limits use to personal, family or household purposes; using it for the company breaches the contract and the lender can demand repayment',
      'Fully personal debt: survives the company failing',
      'Hard inquiry costs a few points (usually < 5) for up to 12 months',
    ],
    notes: 'Modeled on LightStream (9.99-24.94%, $5k-$100k, min 660, no fees, "You may not use your loan proceeds for business purposes") and SoFi (6.99-35.49%, $5k-$100k, 0-7% fee, personal/family/household use). Marcus stopped new personal loans in 2023.',
    sources: [S.nerdwalletBest, S.lightstreamFaq, S.credibleRates, S.bankratePL],
  },
  {
    id: 'pl_business_ok',
    name: 'Online personal loan (business use permitted, marketplace lender)',
    kind: 'personal_loan',
    minFico: 600,
    maxDti: 0.45, // [design]
    requiresW2Income: false,
    incomeDocs: 'verified',
    minIncome: 12000, // Upstart published minimum
    requiresBusinessRevenueMonths: 0,
    minAmount: 1000,
    maxAmount: 75000,
    maxIncomeMultiple: 0.5, // [design]
    amountRule: 'Lesser of $75k ($50k below 680 FICO [design]), 50% of verified income [design], and DTI <= 45% at the longest term',
    aprByFico: [
      { minFico: 760, aprMin: 6.2, aprMax: 13.0, feePct: 1.0 },
      { minFico: 720, aprMin: 9.5, aprMax: 18.0, feePct: 3.0 },
      { minFico: 680, aprMin: 14.0, aprMax: 25.0, feePct: 5.0 },
      { minFico: 640, aprMin: 20.0, aprMax: 31.0, feePct: 7.0, maxAmount: 50000 },
      { minFico: 600, aprMin: 26.0, aprMax: 35.99, feePct: 9.99, maxAmount: 35000 },
    ],
    originationFeePct: 5.0,
    termMonths: [36, 60],
    introAprMonths: 0,
    fundingDays: 1,
    collateral: 'none',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'soft-pull prequalification; hard pull when you accept',
    risks: [
      'Origination fee (0.99-12%) is deducted from proceeds: you receive less than you owe',
      'APR near 36% below 640 FICO makes it ruinous as working capital',
      'Personal debt: you repay it even if the company dies',
    ],
    notes: 'Modeled on Upstart (6.20-35.99%, $1k-$75k, fee up to 12%, $12k min income), Best Egg (6.99-35.99%, $2k-$50k, min 600, fee 0.99-9.99%), Happen Bank/ex-LendingClub (5.96-35.99%, $1k-$75k, min 600, fee 0-8%). NerdWallet lists Upstart, Best Egg, Rocket Loans, Achieve and U.S. Bank as funding business expenses.',
    sources: [S.nerdwalletBiz, S.nerdwalletBest, S.credibleRates],
  },
  {
    id: 'pl_credit_union',
    name: 'Credit union personal loan',
    kind: 'personal_loan',
    minFico: 640, // [design]
    maxDti: 0.43, // [design]
    requiresW2Income: false,
    incomeDocs: 'verified',
    minIncome: 20000, // [design]
    requiresBusinessRevenueMonths: 0,
    minAmount: 500,
    maxAmount: 50000, // [design] typical upper limit
    maxIncomeMultiple: 0.4, // [design]
    amountRule: 'Lesser of $50k [design], 40% of verified income [design], and DTI <= 43%; APR capped at 18% for federal credit unions',
    aprByFico: [
      { minFico: 760, aprMin: 8.0, aprMax: 11.0, feePct: 0 },
      { minFico: 720, aprMin: 9.5, aprMax: 13.5, feePct: 0 },
      { minFico: 680, aprMin: 12.0, aprMax: 16.0, feePct: 0 },
      { minFico: 640, aprMin: 15.0, aprMax: 18.0, feePct: 0 },
    ],
    originationFeePct: 0,
    termMonths: [12, 24, 36, 48, 60],
    introAprMonths: 0,
    fundingDays: 3,
    collateral: 'none (share-secured versions exist)',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: 'restricted',
    hardPull: 'usually hard pull; membership required',
    risks: ['Consumer loan: business use depends on the credit union; many steer you to a member business loan instead'],
    notes: 'Federal credit unions are capped at 18% APR through 2027-09-10 (NCUA). Patelco example: 9.30-17.90% (Bankrate, Oct 2026).',
    sources: [S.ncua, S.bankratePL],
  },
  {
    id: 'cc_personal_0apr',
    name: 'Personal credit card, 0% intro APR (21 months)',
    kind: 'credit_card',
    minFico: 670, // [design] issuers target good-to-excellent credit
    maxDti: 0.5, // [design] ability-to-pay screen
    requiresW2Income: false,
    incomeDocs: 'stated',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 1000,
    maxAmount: 25000, // [design]
    limitPctOfIncomeByFico: [
      { minFico: 760, pct: 0.2 },
      { minFico: 720, pct: 0.15 },
      { minFico: 680, pct: 0.1 },
      { minFico: 670, pct: 0.07 },
    ], // [design]
    amountRule: 'Credit limit = stated income x 7-20% by FICO band [design], $1k-$25k; 21 months at 0% then standard APR',
    aprByFico: [
      { minFico: 760, aprMin: 17.49, aprMax: 20.0, feePct: 0 },
      { minFico: 720, aprMin: 20.0, aprMax: 23.99, feePct: 0 },
      { minFico: 680, aprMin: 23.99, aprMax: 27.0, feePct: 0 },
      { minFico: 670, aprMin: 26.0, aprMax: 28.24, feePct: 0 },
    ],
    originationFeePct: 0,
    balanceTransferFeePct: 5,
    termMonths: [21],
    introAprMonths: 21,
    fundingDays: 10,
    collateral: 'none',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: 'restricted',
    hardPull: 'hard pull',
    risks: [
      'Utilization is ~30% of a FICO score ("amounts owed"); a maxed card can drop the score sharply right when you need more credit',
      'After 21 months the balance reverts to ~17.5-28% APR',
      'Issuers can cut limits at any time',
    ],
    notes: 'Modeled on Wells Fargo Reflect (21 months 0% on purchases and transfers, then 17.49/23.99/28.24% variable, 5% BT fee) and Citi Simplicity (21 months on transfers, 12 on purchases, 3% then 5% BT fee). Average card APR 19.63% (Bankrate, 2026-09-30). A 10% APR cap was proposed in Jan 2026 but not enacted as of the latest coverage found.',
    sources: [S.creditKarmaBT, S.bankrateCards],
  },
  {
    id: 'cc_business_0apr',
    name: 'Business credit card, 0% intro APR (12 months, personal guarantee)',
    kind: 'credit_card',
    minFico: 680, // [design]
    maxDti: 0.5, // [design]
    requiresW2Income: false,
    incomeDocs: 'stated',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 2000,
    maxAmount: 50000, // [design]
    limitPctOfIncomeByFico: [
      { minFico: 760, pct: 0.2 },
      { minFico: 720, pct: 0.15 },
      { minFico: 680, pct: 0.1 },
    ], // [design]; issuers count personal + business income for new businesses
    amountRule: 'Credit limit = (stated personal income + annual business revenue) x 10-20% by FICO [design], $2k-$50k; 12 months 0% on purchases',
    aprByFico: [
      { minFico: 760, aprMin: 16.74, aprMax: 19.74, feePct: 0 },
      { minFico: 720, aprMin: 18.74, aprMax: 22.74, feePct: 0 },
      { minFico: 680, aprMin: 21.74, aprMax: 26.74, feePct: 0 },
    ],
    originationFeePct: 0,
    termMonths: [12],
    introAprMonths: 12,
    fundingDays: 10,
    collateral: 'none',
    personalGuarantee: true,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'hard pull on your personal report (sole proprietors can apply with SSN)',
    risks: [
      'Personal guarantee: you owe the balance if the company cannot pay',
      'Most issuers report only serious delinquency/default to personal bureaus; Capital One reports all activity',
      'Intro APR covers purchases only, not balance transfers',
    ],
    notes: 'Modeled on Chase Ink Business Unlimited/Cash and Amex Blue Business Plus/Cash: 0% on purchases for 12 months, no annual fee, then ~16.74-26.74% variable. A new LLC with no revenue can qualify on personal credit and income.',
    sources: [S.nerdwalletBiz0, S.navBizReporting],
  },
  {
    id: 'heloc',
    name: 'Home equity line of credit (HELOC)',
    kind: 'heloc',
    minFico: 640, // sources: 620-680 typical floor; 720 for best terms
    maxDti: 0.43, // sources: 43-50%
    requiresW2Income: false,
    incomeDocs: 'verified',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 10000,
    maxAmount: 500000, // [design]
    cltvByFico: [
      { minFico: 720, cltv: 0.85 },
      { minFico: 680, cltv: 0.85 },
      { minFico: 640, cltv: 0.8 },
    ],
    amountRule: 'Line = max CLTV (80-85%) x home value - mortgage balance, limited so interest-only payment on the full line keeps DTI <= 43% (50% at 740+)',
    aprByFico: [
      // expressed as absolute APR at prime 7.00%: prime + margin
      { minFico: 760, aprMin: PRIME_RATE_2026 + 0.0, aprMax: PRIME_RATE_2026 + 0.75, feePct: 0.5 },
      { minFico: 720, aprMin: PRIME_RATE_2026 + 0.5, aprMax: PRIME_RATE_2026 + 1.25, feePct: 0.5 },
      { minFico: 680, aprMin: PRIME_RATE_2026 + 1.0, aprMax: PRIME_RATE_2026 + 2.0, feePct: 1.0 },
      { minFico: 640, aprMin: PRIME_RATE_2026 + 2.0, aprMax: PRIME_RATE_2026 + 3.0, feePct: 1.0 },
    ],
    originationFeePct: 0.5, // [design] many HELOCs have low/no closing costs; appraisal/annual fees vary
    termMonths: [120, 240], // 10-year draw, 20-year repayment
    introAprMonths: 0,
    fundingDays: 30,
    collateral: 'your home (second lien)',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'hard pull',
    risks: [
      'Your home secures it: default can mean foreclosure',
      'Variable rate tied to prime; prime rose to 7.00% in Sept 2026',
      'Lender can freeze or cut the line if home values fall or your income drops',
      'Self-employed applicants need 2 years of tax returns; apply while still W-2 employed',
    ],
    notes: 'Average HELOC APR 7.08%, home equity loan 6.87% (MonitorBankRates, 2026-10-06); Bankrate HELOC 7.47% (2026-06-17). Margins over prime: 760+ ~0-0.75; 680-699 ~1.25-1.75 (Primerates/Wealthvieu 2026).',
    sources: [S.mbrHeloc, S.primeratesHeloc, S.mortgageReportsSE],
  },
  {
    id: 'home_equity_loan',
    name: 'Home equity loan (fixed rate)',
    kind: 'heloc',
    minFico: 640,
    maxDti: 0.43,
    requiresW2Income: false,
    incomeDocs: 'verified',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 10000,
    maxAmount: 500000, // [design]
    cltvByFico: [
      { minFico: 720, cltv: 0.85 },
      { minFico: 680, cltv: 0.85 },
      { minFico: 640, cltv: 0.8 },
    ],
    amountRule: 'Lump sum = max CLTV x home value - mortgage balance, limited so the amortized payment keeps DTI <= 43%',
    aprByFico: [
      { minFico: 760, aprMin: 6.75, aprMax: 7.75, feePct: 2.0 },
      { minFico: 720, aprMin: 7.25, aprMax: 8.25, feePct: 2.0 },
      { minFico: 680, aprMin: 8.0, aprMax: 9.5, feePct: 2.5 },
      { minFico: 640, aprMin: 9.5, aprMax: 11.0, feePct: 3.0 },
    ], // [design] anchored to 6.87% (Oct 2026) and 8.08% (Bankrate Jul 2026) averages
    originationFeePct: 2.0, // [design] closing costs 2-5% commonly quoted
    termMonths: [60, 120, 180, 240],
    introAprMonths: 0,
    fundingDays: 30,
    collateral: 'your home (second lien)',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'hard pull',
    risks: ['Foreclosure risk', 'Full payment starts immediately even if the business has no revenue'],
    notes: 'Fixed-rate sibling of the HELOC.',
    sources: [S.mbrHeloc],
  },
  {
    id: 'cash_out_refi',
    name: 'Cash-out mortgage refinance',
    kind: 'heloc',
    minFico: 640, // [design] conventional floor ~620
    maxDti: 0.45, // [design] conventional DU up to 50%
    requiresW2Income: false,
    incomeDocs: 'verified',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 10000,
    maxAmount: 1000000,
    cltvByFico: [{ minFico: 640, cltv: 0.8 }],
    amountRule: 'Cash out = 80% LTV x home value - existing mortgage; payment modeled only on the cash-out portion (the whole mortgage reprices)',
    aprByFico: [
      { minFico: 760, aprMin: MORTGAGE_30Y_2026 + 0.125, aprMax: MORTGAGE_30Y_2026 + 0.5, feePct: 3.0 },
      { minFico: 720, aprMin: MORTGAGE_30Y_2026 + 0.375, aprMax: MORTGAGE_30Y_2026 + 0.75, feePct: 3.0 },
      { minFico: 680, aprMin: MORTGAGE_30Y_2026 + 0.625, aprMax: MORTGAGE_30Y_2026 + 1.125, feePct: 3.5 },
      { minFico: 640, aprMin: MORTGAGE_30Y_2026 + 1.0, aprMax: MORTGAGE_30Y_2026 + 1.75, feePct: 4.0 },
    ], // [design] PMMS 7.28% + cash-out pricing adjustments
    originationFeePct: 3.0, // [design] closing costs on the whole new loan
    termMonths: [360],
    introAprMonths: 0,
    fundingDays: 40,
    collateral: 'your home (first lien)',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'hard pull',
    risks: [
      'With 30-year rates at ~7.3% (Oct 2026), refinancing a low-rate mortgage raises the cost of the whole balance, not just the cash',
      'Closing costs apply to the entire new loan',
      'Foreclosure risk',
    ],
    notes: 'Rarely sensible in 2026 for anyone holding a sub-5% mortgage; HELOC usually dominates.',
    sources: [S.pmms, S.fannieSE],
  },
  {
    id: 'loan_401k',
    name: '401(k) plan loan (current employer)',
    kind: '401k_loan',
    minFico: 0,
    maxDti: 1,
    requiresW2Income: true,
    incomeDocs: 'none',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 1000,
    maxAmount: PLAN_LOAN_MAX,
    amountRule: 'Lesser of $50,000 or 50% of vested balance (plans may allow up to $10k if 50% is less); only from your current employer\'s plan',
    aprByFico: [{ minFico: 0, aprMin: PRIME_RATE_2026 + 1, aprMax: PRIME_RATE_2026 + 2, feePct: 0 }],
    originationFeePct: 0,
    flatFee: 75, // [design] typical plan loan setup fee $50-$100
    termMonths: [60],
    introAprMonths: 0,
    fundingDays: 7,
    collateral: 'your vested 401(k) balance',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'none',
    risks: [
      'Quit or lose the job and the balance is due by your tax-return due date (with extensions); otherwise it becomes a taxable distribution plus 10% penalty if under 59.5',
      'Money out of the market loses compounding',
      'IRAs cannot lend at all; former-employer plans usually do not issue new loans',
    ],
    notes: 'Interest (usually prime + 1-2%) is paid back into your own account. No credit check. Repay within 5 years by payroll deduction.',
    sources: [S.irsPlanLoans],
  },
  {
    id: 'robs',
    name: 'ROBS (Rollover as Business Startup)',
    kind: 'robs',
    minFico: 0,
    maxDti: 1,
    requiresW2Income: false,
    incomeDocs: 'none',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 50000, // [design] providers generally steer smaller balances away
    maxAmount: 5000000,
    amountRule: 'Up to the full rollover-eligible pre-tax balance (401(k)/traditional IRA; not Roth); company must be a C-corp sponsoring a new 401(k) that buys its stock',
    aprByFico: [{ minFico: 0, aprMin: 0, aprMax: 0, feePct: 0 }],
    originationFeePct: 0,
    flatFee: 4995, // Guidant setup fee
    monthlyFee: 149, // Guidant plan administration from $149/month
    termMonths: [0],
    introAprMonths: 0,
    fundingDays: 21, // [design]
    collateral: 'none (equity, not debt)',
    personalGuarantee: false,
    personalLiability: false,
    businessUseAllowed: true,
    hardPull: 'none',
    risks: [
      'IRS ROBS compliance project: "most ROBS businesses either failed or were on the road to failure" with high rates of bankruptcy, liens and dissolutions',
      'Retirement savings concentrated in one startup: a failure wipes them out with no capital-loss deduction',
      'Requires a C-corp, W-2 salary for the founder, annual Form 5500 and plan admin; errors can disqualify the plan',
      'Plan must offer the stock option to other eligible employees',
    ],
    notes: 'Not a loan: no payments, no credit check, no taxes or penalty if done correctly. Setup ~$3,500-$5,000 plus ~$1,200-$1,800/yr (Guidant $4,995 + from $149/mo; IRA Financial $3,500 + $1,200/yr; Pango $4,695 + $1,548/yr).',
    sources: [S.irsRobs, S.guidantPricing],
  },
  {
    id: 'sba_7a_small',
    name: 'SBA 7(a) Small loan (bank, up to $350k)',
    kind: 'sba_7a',
    minFico: 680, // [design] SBA has no minimum; lenders typically 650-680+, startups 700+
    maxDti: 0.45,
    requiresW2Income: false,
    incomeDocs: 'verified',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 25000, // [design]
    maxAmount: 350000,
    amountRule: 'Lesser of $350k, equity-injection limit (you inject 10-30% of project cost from unborrowed cash) and DSCR >= 1.10 on business cash flow plus guarantor surplus income',
    aprByFico: [{ minFico: 0, aprMin: PRIME_RATE_2026 + 3.0, aprMax: PRIME_RATE_2026 + 6.5, feePct: 1.7 }],
    originationFeePct: 1.7, // 2% of the 85% guaranteed portion (loans <= $150k, FY2026/FY2027)
    termMonths: [120],
    introAprMonths: 0,
    fundingDays: 60,
    collateral: 'business assets; above $50k the lender must take available collateral including a lien on 20%+ owners\' home equity (if >= 25% equity)',
    personalGuarantee: true,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'hard pull on every 20%+ owner/guarantor',
    risks: [
      'Unlimited personal guarantee from every 20%+ owner',
      'Defaulted SBA debt goes to Treasury: tax-refund offset and administrative wage garnishment up to 15% without a court order',
      'Since 2026-03-01 every direct and indirect owner must be a US citizen or national (green-card holders now ineligible)',
      'Pre-revenue software with no hard collateral is usually declined',
    ],
    notes: 'SOP 50 10 8 (eff. 2025-06-01) restored 10% minimum equity injection for start-ups and collateral above $50k. SBSS score retired 2026-03-01: lenders use their own credit analysis; 7(a) Small needs DSCR >= 1.10 historical or projected and 2 months of bank statements. Rate caps at prime 7.00%: variable 13.5% (<= $50k), 13.0% ($50-250k), 11.5% ($250-350k).',
    sources: [S.sba7a, S.sbaSbss, S.sbaCitizenship, S.sbaCitizenship2, S.sop50108, S.sbaRates, S.sbaFees],
  },
  {
    id: 'sba_express',
    name: 'SBA Express loan or line (up to $500k)',
    kind: 'sba_express',
    minFico: 680, // [design]
    maxDti: 0.45,
    requiresW2Income: false,
    incomeDocs: 'verified',
    minIncome: 0,
    requiresBusinessRevenueMonths: 24, // [design] lender guides cite 24 months in business
    minAmount: 25000,
    maxAmount: 500000,
    amountRule: 'Lesser of $500k, ~10-15% of annual revenue [design], and DSCR >= 1.10',
    aprByFico: [{ minFico: 0, aprMin: PRIME_RATE_2026 + 3.0, aprMax: PRIME_RATE_2026 + 6.5, feePct: 1.0 }],
    originationFeePct: 1.0, // 2% of the 50% guaranteed portion
    termMonths: [84, 120],
    introAprMonths: 0,
    fundingDays: 30,
    collateral: 'lender policy; above $50k available collateral',
    personalGuarantee: true,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'hard pull',
    risks: ['Personal guarantee', 'Only a 50% SBA guarantee, so lenders are pickier than for standard 7(a)', 'US-citizen ownership rule applies'],
    notes: 'SBA Express lenders may keep using business credit-scoring models (unaffected by the SBSS sunset). Same 7(a) rate caps.',
    sources: [S.sbaSbss, S.sbaRates],
  },
  {
    id: 'sba_micro',
    name: 'SBA Microloan (nonprofit intermediary, up to $50k)',
    kind: 'sba_micro',
    minFico: 600, // [design] intermediaries are flexible; many accept 575-620
    maxDti: 0.5, // [design]
    requiresW2Income: false,
    incomeDocs: 'verified',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 500,
    maxAmount: 50000,
    amountRule: 'Lesser of $50k and the amount repayable from verified personal income plus business cash flow at DTI <= 50% [design]; average loan ~$13k-$16k',
    aprByFico: [
      { minFico: 720, aprMin: 8.0, aprMax: 10.0, feePct: 2.0 },
      { minFico: 660, aprMin: 9.5, aprMax: 11.5, feePct: 2.5 },
      { minFico: 600, aprMin: 11.0, aprMax: 13.0, feePct: 3.0 },
    ],
    originationFeePct: 2.5, // [design]
    termMonths: [36, 60, 72],
    introAprMonths: 0,
    fundingDays: 45, // [design]
    collateral: 'usually some collateral plus personal guarantee (intermediary policy)',
    personalGuarantee: true,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'hard pull',
    risks: ['Personal guarantee', '100% US-citizen ownership required since 2026-04-01', 'Slow: business plan and training often required'],
    notes: 'Max $50k, typically 8-13%, terms up to 7 years (sba.gov). Best fit for a pre-revenue founder who still has an income source.',
    sources: [S.sbaMicro, S.sbaCitizenship2],
  },
  {
    id: 'family_loan',
    name: 'Loan from family (documented, at AFR)',
    kind: 'family_loan',
    minFico: 0,
    maxDti: 1,
    requiresW2Income: false,
    incomeDocs: 'none',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 1000,
    maxAmount: 250000,
    amountRule: 'Whatever a relative offers (profile.familyOfferAmount); charge at least the AFR on loans over $10k to avoid imputed-interest problems',
    aprByFico: [{ minFico: 0, aprMin: AFR_OCT_2026.midTerm, aprMax: AFR_OCT_2026.midTerm, feePct: 0 }],
    originationFeePct: 0,
    termMonths: [36, 60, 84],
    introAprMonths: 0,
    fundingDays: 3,
    collateral: 'none (optional)',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'none',
    risks: [
      'Relationship risk if the company fails',
      'Below-AFR loans over $10k can create imputed interest (IRC 7872); forgiven amounts above $19,000/yr per donor count against the lifetime exemption',
    ],
    notes: 'October 2026 AFRs: short 4.25%, mid 4.61%, long 5.22% (Rev. Rul. 2026-19). Use a signed promissory note and a payment schedule.',
    sources: [S.afr, S.irsGift],
  },
  {
    id: 'kiva_us',
    name: 'Kiva US 0% crowdfunded microloan',
    kind: 'kiva',
    minFico: 0,
    maxDti: 1,
    requiresW2Income: false,
    incomeDocs: 'none',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 1000,
    maxAmount: 15000,
    amountRule: '$1k-$15k; you must first recruit lenders from your own network during a private fundraising period',
    aprByFico: [{ minFico: 0, aprMin: 0, aprMax: 0, feePct: 0 }],
    originationFeePct: 0,
    termMonths: [12, 24, 36],
    introAprMonths: 0,
    fundingDays: 45,
    collateral: 'none',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'none (character-based)',
    risks: ['Small amount', 'Can fail to fund if your network does not chip in', 'Public campaign'],
    notes: '0% APR, no fees, 12-36 months; borrower must live in the US, be 18+, not be in bankruptcy/foreclosure. Start to finish 30-60 days.',
    sources: [S.kiva],
  },
  {
    id: 'margin_loan',
    name: 'Brokerage margin loan',
    kind: 'margin_loan',
    minFico: 0,
    maxDti: 1,
    requiresW2Income: false,
    incomeDocs: 'none',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minAmount: 1000,
    maxAmount: 10000000,
    amountRule: 'Up to 50% of marginable portfolio value (Reg T); $2,000 minimum equity; borrow <= 20-25% to keep a safety buffer',
    aprByFico: [{ minFico: 0, aprMin: 11.58, aprMax: 12.2, feePct: 0 }],
    originationFeePct: 0,
    maintenanceMargin: 0.3, // [design] FINRA floor 25%, brokers commonly 30%+
    termMonths: [0],
    introAprMonths: 0,
    fundingDays: 1,
    collateral: 'your brokerage securities',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'none',
    risks: [
      'Margin call: if equity falls below maintenance the broker can sell your holdings without notice, at the worst time',
      'Retail broker margin rates ~11.6-12.2% at $25k (Schwab/Fidelity/E*Trade, Sept 2026); low-cost brokers ~5.4%',
      'Selling to meet a call can trigger capital-gains tax',
    ],
    notes: 'Interest accrues monthly; no fixed repayment. The game should model a market drawdown event that can trigger a call.',
    sources: [S.ibkrMargin],
  },
  {
    id: 'sbloc',
    name: 'Securities-based line of credit (bank/wealth platform)',
    kind: 'margin_loan',
    minFico: 0,
    maxDti: 1,
    requiresW2Income: false,
    incomeDocs: 'none',
    minIncome: 0,
    requiresBusinessRevenueMonths: 0,
    minPortfolio: 100000, // [design]
    minAmount: 25000, // [design]
    maxAmount: 10000000,
    amountRule: '50-70% of eligible diversified portfolio [design]; cannot be used to buy securities',
    aprByFico: [{ minFico: 0, aprMin: 6.5, aprMax: 9.0, feePct: 0 }], // [design] SOFR + ~2.5-5
    originationFeePct: 0,
    maintenanceMargin: 0.35, // [design]
    termMonths: [0],
    introAprMonths: 0,
    fundingDays: 7,
    collateral: 'pledged securities',
    personalGuarantee: false,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'varies',
    risks: ['Collateral call and forced liquidation in a market drop', 'Lender can raise requirements without advance notice'],
    notes: 'Schwab: lines typically advance more than margin (generally up to 50%); usable for almost any lawful purpose except buying securities.',
    sources: [S.schwabSbl],
  },
  {
    id: 'rbf_saas',
    name: 'Revenue-based financing (SaaS)',
    kind: 'rbf',
    minFico: 0,
    maxDti: 1,
    requiresW2Income: false,
    incomeDocs: 'none',
    minIncome: 0,
    requiresBusinessRevenueMonths: 12, // [design]
    minMrr: 15000,
    minAmount: 50000,
    maxAmount: 4000000,
    amountRule: 'Lesser of ~1/3 of ARR and what 8% of flat revenue repays at 1.5x within 48 months [design]; repaid at 2-8% of monthly revenue until 1.35-2.0x is repaid',
    aprByFico: [{ minFico: 0, aprMin: 20, aprMax: 45, feePct: 0 }], // effective APR computed from the cap
    costMultiple: 1.5, // [design] midpoint of 1.35-2.0x
    repaymentPctOfRevenue: 0.08, // [design] top of the 2-8% band so payback fits the max term
    maxRepayMonths: 48, // [design]
    originationFeePct: 0,
    termMonths: [24],
    introAprMonths: 0,
    fundingDays: 21,
    collateral: 'general business lien',
    personalGuarantee: false,
    personalLiability: false,
    businessUseAllowed: true,
    hardPull: 'business data connections; soft pull',
    risks: ['Effective APR is high when revenue grows fast (repaid quickly)', 'Cash drag on every month of revenue'],
    notes: 'Lighter Capital floor: $200k ARR or $15k MRR (see docs/research/fundraising.md).',
    sources: [S.lighter],
  },
  {
    id: 'stripe_capital',
    name: 'Payment-processor advance (Stripe Capital-style)',
    kind: 'rbf',
    minFico: 0,
    maxDti: 1,
    requiresW2Income: false,
    incomeDocs: 'none',
    minIncome: 0,
    requiresBusinessRevenueMonths: 3,
    minMrr: 1000,
    minAmount: 1000,
    maxAmount: 2000000,
    amountRule: 'Offer roughly 1-1.5x monthly processing volume [design]; flat fee repaid as a % of daily sales',
    aprByFico: [{ minFico: 0, aprMin: 15, aprMax: 60, feePct: 0 }],
    flatFeePct: 12, // [design] reported 8-20%
    repaymentPctOfRevenue: 0.15, // [design]
    originationFeePct: 0,
    termMonths: [12],
    introAprMonths: 0,
    fundingDays: 2,
    collateral: 'future Stripe receivables',
    personalGuarantee: false,
    personalLiability: false,
    businessUseAllowed: true,
    hardPull: 'none',
    risks: ['Offers are invitation-only and can vanish', 'Short payback makes the effective APR far above the flat fee'],
    notes: 'Stripe US eligibility: >= 3 months processing, >= $5k/yr and avg >= $1k/month over the last 3 months, US-based business with a US home address for representatives.',
    sources: [S.stripeCapital],
  },
  {
    id: 'online_loc',
    name: 'Online business line of credit (fintech)',
    kind: 'line_of_credit',
    minFico: 600,
    maxDti: 1,
    requiresW2Income: false,
    incomeDocs: 'none',
    minIncome: 0,
    requiresBusinessRevenueMonths: 6,
    minAnnualRevenue: 100000, // Fundbox/OnDeck listings; some list $30k
    minAmount: 1000,
    maxAmount: 250000,
    amountRule: 'About 10-15% of annual revenue [design], up to $250k',
    aprByFico: [
      { minFico: 700, aprMin: 20, aprMax: 35, feePct: 0 },
      { minFico: 650, aprMin: 30, aprMax: 50, feePct: 0 },
      { minFico: 600, aprMin: 45, aprMax: 70, feePct: 0 },
    ],
    originationFeePct: 0,
    termMonths: [6, 12],
    introAprMonths: 0,
    fundingDays: 2,
    collateral: 'general business lien (UCC)',
    personalGuarantee: true,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'soft pull to apply on most',
    risks: ['APR-equivalent ~20-80%', 'Weekly repayments', 'Personal guarantee'],
    notes: 'OnDeck: 625 FICO, 1 yr, $100k revenue (avg LOC APR 57.10% Feb 2025). Fundbox: 600, 6 months, $100k (or $30k). Bluevine: 625, 12-24 months, ~$10k+/month.',
    sources: [S.onlineLenders, S.fundboxBluevine],
  },
  {
    id: 'bank_loc',
    name: 'Bank business line of credit',
    kind: 'line_of_credit',
    minFico: 680,
    maxDti: 1,
    requiresW2Income: false,
    incomeDocs: 'verified',
    minIncome: 0,
    requiresBusinessRevenueMonths: 12, // [design] sources range 6-24 months
    minAnnualRevenue: 100000,
    minAmount: 10000,
    maxAmount: 150000,
    amountRule: 'About 10% of annual revenue [design], $10k-$150k unsecured',
    aprByFico: [
      { minFico: 760, aprMin: PRIME_RATE_2026 + 1.75, aprMax: PRIME_RATE_2026 + 4.0, feePct: 0 },
      { minFico: 680, aprMin: PRIME_RATE_2026 + 3.0, aprMax: PRIME_RATE_2026 + 7.0, feePct: 0 },
    ], // [design]
    originationFeePct: 0,
    termMonths: [12],
    introAprMonths: 0,
    fundingDays: 14,
    collateral: 'general business lien',
    personalGuarantee: true,
    personalLiability: true,
    businessUseAllowed: true,
    hardPull: 'hard pull',
    risks: ['Annual renewal can be refused', 'Personal guarantee'],
    notes: 'Wells Fargo BusinessLine: 6 months in business, 680 FICO, $10k-$150k, personal guarantee; Chase: ~$100k revenue, 660 FICO. Banks do not lend unsecured to pre-revenue software startups.',
    sources: [S.bankLoc],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round2 = (x) => Math.round(x * 100) / 100;
const floorTo = (x, step) => Math.max(0, Math.floor(x / step) * step);

/** Level monthly payment for an amortizing loan. */
export function amortizedPayment(principal, aprPct, months) {
  if (principal <= 0) return 0;
  if (!months) return round2((principal * aprPct) / 100 / 12); // interest-only
  const r = aprPct / 100 / 12;
  if (r === 0) return round2(principal / months);
  return round2((principal * r) / (1 - Math.pow(1 + r, -months)));
}

/** Largest principal a given monthly payment can amortize. */
export function principalForPayment(payment, aprPct, months) {
  if (payment <= 0) return 0;
  const r = aprPct / 100 / 12;
  if (!months) return r === 0 ? Infinity : payment / r;
  if (r === 0) return payment * months;
  return (payment * (1 - Math.pow(1 + r, -months))) / r;
}

/** Monthly IRR (as annual %) of receiving `principal` now and paying `payment` for `months` months. */
function effectiveApr(principal, payment, months) {
  if (principal <= 0 || payment <= 0 || months <= 0) return 0;
  if (payment * months <= principal) return 0;
  let lo = 0, hi = 1; // monthly rate
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const pv = (payment * (1 - Math.pow(1 + mid, -months))) / mid;
    if (pv > principal) lo = mid; else hi = mid;
  }
  return round2(((lo + hi) / 2) * 12 * 100);
}

/** SBA 7(a) maximum variable rate for a loan size (prime-based). */
export function sbaMaxVariableRate(amount, prime = PRIME_RATE_2026) {
  const tier = SBA_VARIABLE_SPREADS.find((t) => amount <= t.maxLoan);
  return round2(prime + tier.spread);
}

function band(list, fico) {
  return list.find((b) => fico >= b.minFico) || null;
}

function normalize(p) {
  const incomeType = p.incomeType || 'none';
  return {
    fico: Number(p.fico) || 0,
    annualIncome: Math.max(0, Number(p.annualIncome) || 0),
    incomeType,
    monthlyDebtPayments: Math.max(0, Number(p.monthlyDebtPayments) || 0),
    liquidSavings: Math.max(0, Number(p.liquidSavings) || 0),
    homeEquity: Math.max(0, Number(p.homeEquity) || 0),
    // Optional: if absent we assume equity is 45% of value [design] (only matters for CLTV math).
    homeValue: p.homeValue != null ? Math.max(0, Number(p.homeValue)) : null,
    retirementVested: Math.max(0, Number(p.retirementVested) || 0),
    brokerage: Math.max(0, Number(p.brokerage) || 0),
    businessMonthlyRevenue: Math.max(0, Number(p.businessMonthlyRevenue) || 0),
    businessAgeMonths: Math.max(0, Number(p.businessAgeMonths) || 0),
    usCitizenOrResident: p.usCitizenOrResident !== false,
    // Optional: SBA requires citizen/national since 2026-03-01. Defaults to usCitizenOrResident.
    usCitizen: p.usCitizen != null ? !!p.usCitizen : p.usCitizenOrResident !== false,
    // Optional: months of self-employment history documented on tax returns (default 24 if self-employed).
    selfEmployedMonths: p.selfEmployedMonths != null ? Number(p.selfEmployedMonths) : (incomeType === 'self_employed' ? 24 : 0),
    // Optional: does the current employer's 401(k) allow loans? Default: yes if W-2 with a vested balance.
    has401kLoanAccess: p.has401kLoanAccess != null ? !!p.has401kLoanAccess : incomeType === 'w2',
    householdIncome: Math.max(0, Number(p.householdIncome) || 0),
    familyOfferAmount: Math.max(0, Number(p.familyOfferAmount) || 0),
    inBankruptcy: !!p.inBankruptcy,
  };
}

/** Income a lender will count. Cards accept stated income; loans want documents. */
export function countableIncome(profile, product) {
  const p = profile;
  if (product.incomeDocs === 'stated') {
    if (p.incomeType === 'none') return p.householdIncome; // CARD Act: income you have reasonable access to (21+)
    return p.annualIncome;
  }
  if (p.incomeType === 'w2') return p.annualIncome;
  if (p.incomeType === 'self_employed') {
    if (p.selfEmployedMonths >= 24) return p.annualIncome; // net income from 2 years of returns
    // Fannie Mae-style 12-month exception exists for mortgages/HELOCs with prior same-field income [simplified]
    if (product.kind === 'heloc' && p.selfEmployedMonths >= 12) return p.annualIncome;
    return 0;
  }
  return 0;
}

function odds(product, fico, dtiAfter, maxDti) {
  const head = fico - product.minFico;
  if (head >= 60 && dtiAfter <= maxDti * 0.75) return 'high';
  if (head < 20 || dtiAfter > maxDti * 0.9) return 'low';
  return 'medium';
}

function decline(reason, extra = {}) {
  return {
    approved: false,
    reason,
    maxAmount: 0,
    apr: null,
    feePct: null,
    termMonths: null,
    monthlyPaymentAtMax: 0,
    approvalOdds: 'none',
    warnings: [],
    ...extra,
  };
}

function incomeDeclineReason(p) {
  if (p.incomeType === 'none') return 'No verifiable income. Lenders need W-2 pay stubs or 2 years of self-employment tax returns; apply before quitting your job.';
  if (p.incomeType === 'self_employed') return `Only ${p.selfEmployedMonths} months of self-employment income on tax returns; most lenders need 24 months.`;
  return 'Income below the lender minimum.';
}

function bizUseWarnings(product) {
  if (product.businessUseAllowed === false) return ['Loan agreement prohibits business use: putting the money into your company breaches the contract and lets the lender demand full repayment.'];
  if (product.businessUseAllowed === 'restricted') return ['Business use depends on the lender\'s terms; confirm in writing before applying.'];
  return [];
}

// ---------------------------------------------------------------------------
// Underwriting by product kind
// ---------------------------------------------------------------------------

function uwPersonalLoan(p, product) {
  if (!p.usCitizenOrResident) return decline('Most US personal lenders require US citizenship or permanent residency (some accept certain visa holders).');
  if (p.inBankruptcy) return decline('Open bankruptcy.');
  if (p.fico < product.minFico) return decline(`FICO ${p.fico} is below this lender's minimum of ${product.minFico}.`);
  const income = countableIncome(p, product);
  if (income < product.minIncome) return decline(incomeDeclineReason(p));
  const monthlyIncome = income / 12;
  const dtiBefore = p.monthlyDebtPayments / monthlyIncome;
  if (dtiBefore >= product.maxDti) return decline(`Debt-to-income ${(dtiBefore * 100).toFixed(0)}% already exceeds the ${(product.maxDti * 100).toFixed(0)}% limit.`);
  const b = band(product.aprByFico, p.fico);
  const t = clamp(dtiBefore / product.maxDti, 0, 1);
  const apr = round2(b.aprMin + t * (b.aprMax - b.aprMin));
  const term = Math.max(...product.termMonths);
  const capacity = product.maxDti * monthlyIncome - p.monthlyDebtPayments;
  const byDti = principalForPayment(capacity, apr, term);
  const byIncome = income * product.maxIncomeMultiple;
  const cap = b.maxAmount != null ? Math.min(b.maxAmount, product.maxAmount) : product.maxAmount;
  const maxAmount = floorTo(Math.min(cap, byDti, byIncome), 500);
  if (maxAmount < product.minAmount) return decline('Income and existing debts do not support the minimum loan amount.');
  const pay = amortizedPayment(maxAmount, apr, term);
  const dtiAfter = (p.monthlyDebtPayments + pay) / monthlyIncome;
  return {
    approved: true,
    reason: `Approved on verified income $${Math.round(income).toLocaleString('en-US')}, FICO ${p.fico}, DTI ${(dtiBefore * 100).toFixed(0)}% -> ${(dtiAfter * 100).toFixed(0)}% at max.`,
    maxAmount,
    apr,
    feePct: b.feePct ?? product.originationFeePct,
    termMonths: term,
    monthlyPaymentAtMax: pay,
    approvalOdds: odds(product, p.fico, dtiAfter, product.maxDti),
    warnings: bizUseWarnings(product),
    details: { dtiBefore: round2(dtiBefore), dtiAfter: round2(dtiAfter), netProceeds: round2(maxAmount * (1 - (b.feePct ?? 0) / 100)) },
  };
}

function uwCreditCard(p, product) {
  if (!p.usCitizenOrResident) return decline('US issuers require an SSN or ITIN and a US address.');
  if (p.inBankruptcy) return decline('Open bankruptcy.');
  if (p.fico < product.minFico) return decline(`FICO ${p.fico} is below the ~${product.minFico} these 0% cards usually require.`);
  let income = countableIncome(p, product);
  if (product.personalGuarantee) income += p.businessMonthlyRevenue * 12; // business cards ask for business revenue too
  if (income <= 0) return decline('No income to state. Cards require income you can reasonably access (your own, or a spouse\'s if 21+).');
  const dti = p.monthlyDebtPayments / (income / 12);
  if (dti > product.maxDti) return decline(`Existing debt payments are ${(dti * 100).toFixed(0)}% of income; issuer ability-to-pay screen fails.`);
  const lb = band(product.limitPctOfIncomeByFico, p.fico);
  const limit = floorTo(clamp(income * lb.pct, product.minAmount, product.maxAmount), 500);
  const b = band(product.aprByFico, p.fico);
  const t = clamp(dti / product.maxDti, 0, 1);
  const apr = round2(b.aprMin + t * (b.aprMax - b.aprMin));
  const minPayIntro = round2(Math.max(25, limit * 0.01)); // typical: 1% of balance + interest (0 during intro)
  const postIntro = round2(Math.max(25, limit * 0.01 + (limit * apr) / 100 / 12));
  return {
    approved: true,
    reason: `Approved: limit ~${lb.pct * 100}% of stated income at FICO ${p.fico} [design].`,
    maxAmount: limit,
    apr,
    introApr: 0,
    feePct: 0,
    termMonths: product.introAprMonths,
    monthlyPaymentAtMax: minPayIntro,
    approvalOdds: odds(product, p.fico, dti, product.maxDti),
    warnings: [
      `Maxing this card pushes utilization toward 100% on it (amounts owed ~30% of FICO); expect a temporary score drop.`,
      `After ${product.introAprMonths} months the minimum payment on a full balance is ~$${postIntro} at ${apr}% APR.`,
      ...(product.personalGuarantee ? ['Personal guarantee: the balance is yours if the company fails.'] : []),
      ...bizUseWarnings(product),
    ],
    details: { balanceTransferFeePct: product.balanceTransferFeePct || null, postIntroMinPayment: postIntro },
  };
}

function uwHomeEquity(p, product) {
  if (p.homeEquity <= 0) return decline('No home equity.');
  if (p.inBankruptcy) return decline('Open bankruptcy.');
  if (p.fico < product.minFico) return decline(`FICO ${p.fico} is below the ${product.minFico} minimum.`);
  const income = countableIncome(p, product);
  if (income <= 0) return decline(incomeDeclineReason(p));
  const homeValue = p.homeValue != null ? p.homeValue : p.homeEquity / 0.45; // [design] default equity share
  const mortgage = Math.max(0, homeValue - p.homeEquity);
  const cltv = band(product.cltvByFico, p.fico).cltv;
  const byCltv = cltv * homeValue - mortgage;
  if (byCltv < product.minAmount) return decline(`At ${Math.round(cltv * 100)}% max CLTV you have only $${Math.max(0, Math.round(byCltv)).toLocaleString('en-US')} of borrowable equity.`);
  const monthlyIncome = income / 12;
  const maxDti = product.id === 'heloc' && p.fico >= 740 ? 0.5 : product.maxDti;
  const dtiBefore = p.monthlyDebtPayments / monthlyIncome;
  if (dtiBefore >= maxDti) return decline(`DTI ${(dtiBefore * 100).toFixed(0)}% exceeds ${(maxDti * 100).toFixed(0)}%.`);
  const b = band(product.aprByFico, p.fico);
  const t = clamp(dtiBefore / maxDti, 0, 1); // higher existing DTI -> higher price within the band
  const apr = round2(b.aprMin + t * (b.aprMax - b.aprMin));
  const capacity = maxDti * monthlyIncome - p.monthlyDebtPayments;
  const isLine = product.id === 'heloc';
  const term = isLine ? 0 : Math.max(...product.termMonths);
  const byDti = principalForPayment(capacity, apr, term); // HELOC: interest-only on the full line
  const maxAmount = floorTo(Math.min(product.maxAmount, byCltv, byDti), 1000);
  if (maxAmount < product.minAmount) return decline('Income does not support the payment on a meaningful line.');
  const pay = amortizedPayment(maxAmount, apr, term);
  const warnings = [];
  if (p.homeValue == null) warnings.push('Home value not provided; assumed equity = 45% of value [design].');
  if (product.id === 'cash_out_refi') warnings.push('Cash-out refi reprices your entire mortgage at ~7.3%+ (Oct 2026); payment shown covers only the cash-out portion.');
  if (p.incomeType === 'self_employed' && p.selfEmployedMonths < 24) warnings.push('Approved on the 12-month self-employment exception; many lenders will still ask for 24 months.');
  return {
    approved: true,
    reason: `Approved: ${Math.round(cltv * 100)}% CLTV on est. home value $${Math.round(homeValue).toLocaleString('en-US')}, DTI limit ${(maxDti * 100).toFixed(0)}%.`,
    maxAmount,
    apr,
    feePct: b.feePct ?? product.originationFeePct,
    termMonths: isLine ? 120 : term,
    monthlyPaymentAtMax: pay,
    approvalOdds: odds(product, p.fico, (p.monthlyDebtPayments + pay) / monthlyIncome, maxDti),
    warnings: [...warnings, 'Secured by your home: default can lead to foreclosure.'],
    details: { homeValue: Math.round(homeValue), mortgageBalance: Math.round(mortgage), maxCltv: cltv, interestOnly: isLine },
  };
}

function uw401k(p, product) {
  if (p.incomeType !== 'w2' || !p.has401kLoanAccess) return decline('401(k) loans come only from your current employer\'s plan; you must still be employed there.');
  if (p.retirementVested <= 0) return decline('No vested 401(k) balance.');
  const max = floorTo(Math.min(PLAN_LOAN_MAX, 0.5 * p.retirementVested), 100); // optional $10k exception ignored
  if (max < product.minAmount) return decline('Vested balance too small for the plan minimum.');
  const apr = round2(PRIME_RATE_2026 + 1);
  const term = 60;
  return {
    approved: true,
    reason: `Plan loan: 50% of $${Math.round(p.retirementVested).toLocaleString('en-US')} vested, capped at $50,000. No credit check.`,
    maxAmount: max,
    apr,
    feePct: round2((product.flatFee / max) * 100),
    termMonths: term,
    monthlyPaymentAtMax: amortizedPayment(max, apr, term),
    approvalOdds: 'high',
    warnings: [
      'If you quit to work on the startup, the unpaid balance is due by your tax-filing deadline (with extensions) or it becomes taxable income plus a 10% penalty if under 59.5.',
      'Interest is paid to yourself, but the borrowed money misses market returns.',
    ],
    details: { taxableIfUnpaidOnExit: true },
  };
}

function uwRobs(p, product) {
  if (p.retirementVested < product.minAmount) return decline(`ROBS is only worth the setup cost and risk with roughly $${product.minAmount.toLocaleString('en-US')}+ in rollover-eligible pre-tax retirement funds [design].`);
  const amount = floorTo(p.retirementVested, 100);
  return {
    approved: true,
    reason: 'Eligible: rollover-eligible balance available (assumes pre-tax 401(k)/traditional IRA, not Roth). Company must be a C-corp and hire you as a W-2 employee.',
    maxAmount: amount,
    apr: 0,
    feePct: round2((product.flatFee / amount) * 100),
    termMonths: 0,
    monthlyPaymentAtMax: product.monthlyFee,
    approvalOdds: 'high',
    warnings: [
      'IRS: most ROBS businesses it reviewed "either failed or were on the road to failure"; if yours fails, the retirement money is gone.',
      'Ongoing compliance: annual Form 5500, plan administration, payroll for the founder.',
    ],
    details: { setupFee: product.flatFee, monthlyAdminFee: product.monthlyFee, isEquityNotDebt: true },
  };
}

function businessOcf(p) {
  // Operating cash flow proxy for an early SaaS: 25% EBITDA margin on revenue [design].
  return p.businessMonthlyRevenue * 12 * 0.25;
}

function guarantorSurplus(p, product) {
  // Global cash flow: verified personal income after existing debt and a living-cost allowance [design].
  const income = countableIncome(p, product);
  const living = Math.max(36000, 0.35 * income);
  return Math.max(0, income - 12 * p.monthlyDebtPayments - living);
}

function uwSba(p, product) {
  if (!p.usCitizen) return decline('Since 2026-03-01 (7(a)/504) and 2026-04-01 (Microloan), 100% of owners must be US citizens or nationals living in the US; green-card holders and foreign owners are ineligible.');
  if (p.inBankruptcy) return decline('Open bankruptcy.');
  if (p.fico < product.minFico) return decline(`FICO ${p.fico} is below the ~${product.minFico} most SBA lenders want [design].`);
  if (product.requiresBusinessRevenueMonths && (p.businessAgeMonths < product.requiresBusinessRevenueMonths || p.businessMonthlyRevenue <= 0)) {
    return decline(`Lender wants ${product.requiresBusinessRevenueMonths}+ months of operating history with revenue.`);
  }
  const ocf = businessOcf(p);
  const surplus = guarantorSurplus(p, product);
  const isMicro = product.kind === 'sba_micro';
  const startup = p.businessAgeMonths < 24;
  const preRevenue = p.businessMonthlyRevenue <= 0;
  const cashFlow = ocf + surplus;
  if (cashFlow <= 0) return decline('No repayment source: no business cash flow and no verified outside income. Keep your job (or partner income) while applying.');
  const b = band(product.aprByFico, p.fico);
  const term = Math.max(...product.termMonths);

  let maxAmount;
  let apr;
  if (isMicro) {
    apr = round2((b.aprMin + b.aprMax) / 2);
    const byCf = principalForPayment((cashFlow / 12) * 0.5 / SBA_MIN_DSCR, apr, term); // [design] half of surplus to debt
    maxAmount = floorTo(Math.min(product.maxAmount, byCf), 500);
  } else {
    // Equity injection: start-ups inject 10% SBA minimum; lenders commonly ask 20-30% for start-ups. [design: 20% pre-revenue, 10% otherwise]
    const inj = preRevenue ? 0.2 : startup ? 0.15 : SBA_MIN_EQUITY_INJECTION_STARTUP;
    const injectable = p.liquidSavings * 0.75; // [design] keep a personal reserve; must be unborrowed cash
    const byInjection = startup ? (injectable * (1 - inj)) / inj : Infinity;
    const guessApr = sbaMaxVariableRate(150000);
    const byDscr = principalForPayment(cashFlow / 12 / SBA_MIN_DSCR, guessApr, term);
    const annualRev = p.businessMonthlyRevenue * 12;
    const revenueCap = product.kind === 'sba_express' ? annualRev * 0.15 : preRevenue ? Infinity : annualRev * 1.0; // [design]
    maxAmount = floorTo(Math.min(product.maxAmount, byInjection, byDscr, revenueCap), 1000);
    if (preRevenue) {
      // Pre-revenue software: lenders rely on guarantor income + hard collateral; cap exposure. [design]
      const collateralOk = p.homeEquity >= 0.25 * Math.min(maxAmount, 150000) || p.liquidSavings >= 0.5 * Math.min(maxAmount, 150000);
      if (p.fico < 700 || !collateralOk) {
        return decline('Pre-revenue software with no hard collateral: banks rarely lend (no cash-flow history, intangible assets). Try a Microloan, personal financing, or come back with revenue.', { approvalOdds: 'none' });
      }
      maxAmount = Math.min(maxAmount, 150000);
    }
    apr = sbaMaxVariableRate(maxAmount);
  }
  if (maxAmount < product.minAmount) return decline('Cash flow or equity injection does not support the minimum loan.');
  const pay = amortizedPayment(maxAmount, apr, term);
  const guaranteedShare = product.kind === 'sba_express' ? 0.5 : maxAmount <= 150000 ? 0.85 : 0.75;
  const feePct = isMicro ? b.feePct : round2(2 * guaranteedShare * (maxAmount <= 150000 ? 1 : 1.5)); // [design] >$150k tiers
  const warnings = [
    'Unlimited personal guarantee required from every 20%+ owner.',
    'Default sends the debt to Treasury: tax-refund offsets and wage garnishment up to 15% without a lawsuit.',
  ];
  if (maxAmount > 50000) warnings.push('Above $50k the lender must take available collateral, including a lien on your home if you have >= 25% equity.');
  if (preRevenue) warnings.push('Approval modeled on your outside income and collateral; real approval odds for pre-revenue software are low.');
  return {
    approved: true,
    reason: `Approved: DSCR >= ${SBA_MIN_DSCR} on business cash flow $${Math.round(ocf).toLocaleString('en-US')}/yr + guarantor surplus $${Math.round(surplus).toLocaleString('en-US')}/yr.`,
    maxAmount,
    apr,
    feePct,
    termMonths: term,
    monthlyPaymentAtMax: pay,
    approvalOdds: preRevenue ? 'low' : startup ? 'medium' : odds(product, p.fico, 0, 1),
    warnings,
    details: { businessCashFlow: Math.round(ocf), guarantorSurplus: Math.round(surplus), sbaGuaranteeShare: isMicro ? null : guaranteedShare },
  };
}

function uwFamily(p, product) {
  if (p.familyOfferAmount <= 0) return decline('No family offer. Set profile.familyOfferAmount when a relative agrees to lend.');
  const amount = Math.min(product.maxAmount, p.familyOfferAmount);
  const term = 60;
  const apr = term <= 36 ? AFR_OCT_2026.shortTerm : term <= 108 ? AFR_OCT_2026.midTerm : AFR_OCT_2026.longTerm;
  return {
    approved: true,
    reason: `Documented family loan at the October 2026 mid-term AFR (${apr}%).`,
    maxAmount: amount,
    apr,
    feePct: 0,
    termMonths: term,
    monthlyPaymentAtMax: amortizedPayment(amount, apr, term),
    approvalOdds: 'high',
    warnings: [
      `Forgiving more than $${GIFT_TAX_ANNUAL_EXCLUSION_2026.toLocaleString('en-US')} a year per lender is a reportable gift (no tax owed until the $15M lifetime exemption is used).`,
      'Put it in writing: promissory note, schedule, and what happens if the company fails.',
    ],
  };
}

function uwKiva(p, product) {
  if (!p.usCitizenOrResident) return decline('Kiva US borrowers must live in the US.');
  if (p.inBankruptcy) return decline('Kiva US excludes borrowers in bankruptcy or foreclosure.');
  const term = 36;
  return {
    approved: true,
    reason: 'Eligible for a 0% Kiva US loan once friends and family fund the private round.',
    maxAmount: product.maxAmount,
    apr: 0,
    feePct: 0,
    termMonths: term,
    monthlyPaymentAtMax: amortizedPayment(product.maxAmount, 0, term),
    approvalOdds: 'medium',
    warnings: ['Funding depends on your network and the public crowd; it can fall short.'],
  };
}

function uwSecurities(p, product) {
  const minPortfolio = product.minPortfolio || 2000;
  if (p.brokerage < minPortfolio) return decline(`Needs at least $${minPortfolio.toLocaleString('en-US')} in eligible securities.`);
  const advance = product.id === 'sbloc' ? 0.6 : 0.5; // [design] SBLOC 50-70%; Reg T 50%
  const maxAmount = floorTo(p.brokerage * advance, 500);
  const b = product.aprByFico[0];
  const apr = round2((b.aprMin + b.aprMax) / 2);
  // Price drop that triggers a call when borrowed at the max: equity/value < maintenance.
  const callDrop = 1 - maxAmount / (1 - product.maintenanceMargin) / p.brokerage;
  const safe = floorTo(p.brokerage * 0.2, 500);
  return {
    approved: true,
    reason: `Up to ${advance * 100}% of a $${Math.round(p.brokerage).toLocaleString('en-US')} portfolio; no credit check.`,
    maxAmount,
    apr,
    feePct: 0,
    termMonths: 0,
    monthlyPaymentAtMax: amortizedPayment(maxAmount, apr, 0),
    approvalOdds: 'high',
    warnings: [
      `Borrowing the max, a ~${Math.round(callDrop * 100)}% market drop triggers a collateral call and forced sales.`,
      `A safer ceiling is ~20% of the portfolio ($${safe.toLocaleString('en-US')}).`,
    ],
    details: { marketDropToMarginCall: round2(callDrop), saferMax: safe },
  };
}

function uwRbf(p, product) {
  if (p.businessAgeMonths < product.requiresBusinessRevenueMonths) return decline(`Needs ${product.requiresBusinessRevenueMonths}+ months of revenue history.`);
  if (p.businessMonthlyRevenue < product.minMrr) return decline(`Needs at least $${product.minMrr.toLocaleString('en-US')} in monthly revenue.`);
  if (product.id === 'stripe_capital' && (!p.usCitizenOrResident || p.businessMonthlyRevenue * 12 < 5000)) return decline('Stripe Capital (US) needs a US business and >= $5k/yr on Stripe.');
  const mrr = p.businessMonthlyRevenue;
  let maxAmount, totalRepay, monthlyPay;
  if (product.id === 'stripe_capital') {
    maxAmount = floorTo(Math.min(product.maxAmount, mrr * 1.25), 500); // [design]
    totalRepay = maxAmount * (1 + product.flatFeePct / 100);
  } else {
    const byTerm = (mrr * product.repaymentPctOfRevenue * product.maxRepayMonths) / product.costMultiple;
    maxAmount = floorTo(Math.min(product.maxAmount, (mrr * 12) / 3, byTerm), 1000);
    totalRepay = maxAmount * product.costMultiple;
  }
  if (maxAmount < product.minAmount) return decline('Revenue too small for this provider\'s minimum.');
  monthlyPay = round2(mrr * product.repaymentPctOfRevenue);
  const months = Math.ceil(totalRepay / monthlyPay);
  const apr = effectiveApr(maxAmount, monthlyPay, months);
  return {
    approved: true,
    reason: `Offer sized on $${Math.round(mrr).toLocaleString('en-US')} MRR; repay ${Math.round(product.repaymentPctOfRevenue * 100)}% of revenue until ${round2(totalRepay / maxAmount)}x is repaid (~${months} months at flat revenue).`,
    maxAmount,
    apr,
    feePct: round2(((totalRepay - maxAmount) / maxAmount) * 100),
    termMonths: months,
    monthlyPaymentAtMax: monthlyPay,
    approvalOdds: 'medium',
    warnings: ['Effective APR rises if revenue grows (faster payback of a fixed fee).'],
    details: { totalRepayment: round2(totalRepay) },
  };
}

function uwLoc(p, product) {
  if (p.fico < product.minFico) return decline(`FICO ${p.fico} is below the ${product.minFico} minimum.`);
  if (p.businessAgeMonths < product.requiresBusinessRevenueMonths) return decline(`Needs ${product.requiresBusinessRevenueMonths}+ months in business.`);
  const annualRev = p.businessMonthlyRevenue * 12;
  if (annualRev < product.minAnnualRevenue) return decline(`Needs ~$${product.minAnnualRevenue.toLocaleString('en-US')}+ annual revenue; pre-revenue startups do not qualify.`);
  const pct = product.id === 'online_loc' ? 0.125 : 0.1; // [design]
  const maxAmount = floorTo(Math.min(product.maxAmount, annualRev * pct), 1000);
  if (maxAmount < product.minAmount) return decline('Revenue too small for the minimum line.');
  const b = band(product.aprByFico, p.fico);
  const apr = round2((b.aprMin + b.aprMax) / 2);
  const term = Math.max(...product.termMonths);
  return {
    approved: true,
    reason: `Line sized at ~${pct * 100}% of $${Math.round(annualRev).toLocaleString('en-US')} annual revenue [design].`,
    maxAmount,
    apr,
    feePct: product.originationFeePct,
    termMonths: term,
    monthlyPaymentAtMax: amortizedPayment(maxAmount, apr, term),
    approvalOdds: odds(product, p.fico, 0, 1),
    warnings: ['Personal guarantee required.'],
  };
}

/**
 * Deterministic underwriting of one product for one founder profile.
 * @param {object} profile { fico, annualIncome, incomeType: 'w2'|'self_employed'|'none', monthlyDebtPayments, liquidSavings,
 *   homeEquity, retirementVested, brokerage, businessMonthlyRevenue, businessAgeMonths, usCitizenOrResident,
 *   optional: usCitizen, homeValue, selfEmployedMonths, has401kLoanAccess, householdIncome, familyOfferAmount, inBankruptcy }
 * @param {object} product one entry of LENDER_PRODUCTS
 * @returns {{approved:boolean, reason:string, maxAmount:number, apr:number|null, feePct:number|null, termMonths:number|null,
 *   monthlyPaymentAtMax:number, approvalOdds:string, warnings:string[], details?:object}}
 */
export function underwrite(profile, product) {
  const p = normalize(profile || {});
  if (!product) return decline('Unknown product.');
  if (product.requiresW2Income && p.incomeType !== 'w2') return decline('Requires current W-2 employment.');
  switch (product.kind) {
    case 'personal_loan': return uwPersonalLoan(p, product);
    case 'credit_card': return uwCreditCard(p, product);
    case 'heloc': return uwHomeEquity(p, product);
    case '401k_loan': return uw401k(p, product);
    case 'robs': return uwRobs(p, product);
    case 'sba_7a':
    case 'sba_express':
    case 'sba_micro': return uwSba(p, product);
    case 'family_loan': return uwFamily(p, product);
    case 'kiva': return uwKiva(p, product);
    case 'margin_loan': return uwSecurities(p, product);
    case 'rbf': return uwRbf(p, product);
    case 'line_of_credit': return uwLoc(p, product);
    default: return decline(`No underwriting rule for kind ${product.kind}.`);
  }
}

/** Underwrite every product; convenient for an offers screen. */
export function underwriteAll(profile) {
  return LENDER_PRODUCTS.map((product) => ({ id: product.id, name: product.name, kind: product.kind, ...underwrite(profile, product) }));
}
