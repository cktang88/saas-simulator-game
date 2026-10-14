// Every realistic number the simulation uses lives here, with its source.
// Research notes behind these: docs/research/*.md. Values are typical 2025–2026 ranges;
// the game uses a point inside the range and adds noise.

export const PAYMENTS = {
  // Stripe US pricing (stripe.com/pricing)
  cardPct: 0.029,
  cardFixed: 0.3,
  intlCardPct: 0.015, // added for international cards
  fxPct: 0.01, // added when currency conversion is required
  billingPct: 0.007, // Stripe Billing pay-as-you-go, on recurring volume
  taxPct: 0.005, // Stripe Tax per transaction (when enabled)
  disputeFee: 15,
  disputeContestFee: 15, // since June 2025; refunded if you win
  excessiveDisputeRate: 0.0075, // Stripe flags accounts above ~0.75%
  intlShare: { b2c: 0.35, smb: 0.25, ent: 0.15 }, // share of customers paying with non-US cards
  payoutDelayDays: 2, // standard US payout schedule (business days)
  firstPayoutHoldDays: 10, // new accounts: first payout typically 7–14 days after first charge
  // Merchant of record (Paddle-style) all-in fee, handles global sales tax/VAT
  morPct: 0.05,
  morFixed: 0.5,
  // Renewal charge failures (soft + hard declines) and recovery
  // Involuntary churn after recovery ≈ 1.5–3% MRR/mo consumer, 0.8–2% SMB, 0.3–0.8% enterprise (vendor data)
  renewalFailRate: { b2c: 0.05, smb: 0.03, ent: 0.01 },
  retryDays: [3, 5, 7, 7], // Smart Retries spread attempts over ~3 weeks
  retrySuccess: 0.11, // per retry attempt: fixed-schedule retries recover ~25–40% overall
  smartRetryBoost: 1.45, // Smart Retries + card updater: Stripe reports ~55% recovery across tools
  disputeRate: { b2c: 0.006, smb: 0.002, ent: 0.0005 },
  disputeWinWithEvidence: 0.35,
  refundRate: { b2c: 0.025, smb: 0.015, ent: 0.002 }, // share of first charges refunded (B2C 2–3%, annual 4–7%)
};

export const BANK = {
  treasuryApy: 0.035, // sweep / treasury yield on idle cash (varies with rates)
};

// Customer behavior baselines per business model. The product/website/price fit
// (judged by LLM customer panels) scales these up or down.
export const MARKET = {
  b2c: {
    trialStartRate: 0.05, // landing visitor → trial start (landing CVR median 3.8–6.6%, Unbounce)
    trialToPaid: { 3: 0.255, 7: 0.374, 14: 0.4, 30: 0.425 }, // RevenueCat 2026 by trial length (≤4d, 5–9d, 17–32d)
    noCardTrialFactor: 0.4, // no-card trials convert far worse
    // ~52% renew month 1, ~43% still paying at day 90, ~17% at one year (RevenueCat 2026)
    monthlyChurn: [0.48, 0.12, 0.085, 0.09, 0.09, 0.09],
    annualRenewal: 0.33, // first annual renewal 23–40%
    annualShare: 0.45,
    annualDiscount: 0.4,
    refPrice: 9.99,
    elasticity: 1.2,
  },
  smb: {
    trialStartRate: 0.025,
    trialToPaid: { 7: 0.15, 14: 0.18, 30: 0.18 }, // opt-in (no card) B2B trials: 15–25%; card-required 30–60%
    noCardTrialFactor: 1, // already modeled as opt-in
    cardTrialFactor: 2.2,
    monthlyChurn: [0.08, 0.05, 0.04, 0.035, 0.03, 0.03],
    annualRenewal: 0.75,
    annualShare: 0.25,
    annualDiscount: 0.17,
    refPrice: 79,
    elasticity: 0.7,
  },
  ent: {
    trialStartRate: 0.004, // demo requests per visitor
    trialToPaid: { 0: 1 },
    monthlyChurn: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01],
    annualRenewal: 0.88,
    annualShare: 0.95,
    annualDiscount: 0,
    refPrice: 1500,
    elasticity: 0.5,
  },
};

// Onboarding mode effects on trial → paid (relative to self-serve).
export const ONBOARDING = {
  self: { conv: 1, hoursPerTrial: 0 },
  call: { conv: 1.6, hoursPerTrial: 0.75 }, // optional kickoff call offered
  concierge: { conv: 2.2, hoursPerTrial: 2.5 }, // founder sets it up for them
};

export const FOUNDER = {
  defaultHoursPerWeek: 55,
  burnoutHours: 70,
};

// Business setup costs (docs/research/hr-legal-product.md, finance-and-payments.md).
export const COMPANY = {
  incorporation: { atlas: 500, clerky: 427 },
  delawareFranchiseMin: 400, // alternative assumed-par-value method; the default method can bill ~$85k
  delawareAnnualReportFee: 50,
  trademarkPerClass: 350,
  gusto: { base: 49, perPerson: 6 },
  deelPerContractor: 49,
  employerBurden: { indie: 1.25, vc: 1.35 },
};

export const LLM = {
  defaultModels: ['anthropic/claude-haiku-5.5', 'typesafe/jev-router'],
  maxConcurrent: 3,
};
