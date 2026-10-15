// Go-to-market compensation, new GTM roles and land-and-expand: DATA ONLY (no logic, no imports).
// Research: docs/research/gtm-comp/comp-plans.md and docs/research/gtm-comp/land-and-expand.md.
// Tags: [verified] read on the source page; [secondary] vendor or aggregator summary; [unverified] single vendor
// claim or job posting; [design] simulator assumption. NEVER show a [design] or [unverified] number to players as
// a real statistic (ARCHITECTURE principle 3): the UI labels them "game assumption".

// ---------------------------------------------------------------------------------------------
// Roles that can carry a variable-pay plan. planKey -> defaults and the market the hiring market compares to.
//  ote: on-target earnings (USD/yr); basePct: base share of OTE; quota: annual quota in the metric's unit;
//  rampMonths: months to full productivity; attrition: market annual attrition; metrics: allowed pay metrics.
// ---------------------------------------------------------------------------------------------
export const COMP_ROLES = {
  sdr: {
    label: 'SDR / BDR', jobRole: 'sdr', memberRole: 'sdr',
    ote: 80000, basePct: 0.68, rampMonths: 3, attrition: 0.40,
    metric: 'qualified_opps', metrics: ['meetings_held', 'qualified_opps', 'pipeline_usd', 'sourced_closed_won'],
    quotas: { meetings_held: 120, qualified_opps: 72, pipeline_usd: 3000000, sourced_closed_won: 360000 },
    units: { meetings_held: 'meetings held', qualified_opps: 'qualified opps', pipeline_usd: 'sourced pipeline $', sourced_closed_won: 'sourced closed-won $' },
    src: 'Bridge Group 2025: median OTE $80K, 68:32, 3.0-month ramp, 40% median attrition, 10 held meetings and 6 Stage-1 conversions per month [verified]; per-metric annual quotas other than meetings are [design]',
  },
  ae: {
    label: 'Account executive', jobRole: 'account_executive', memberRole: 'ae',
    ote: 200000, basePct: 0.5, rampMonths: 6, attrition: 0.30,
    metric: 'new_acv', metrics: ['new_acv', 'tcv'],
    quotas: { new_acv: 960000, tcv: 1300000 },
    units: { new_acv: 'new ACV (first-year)', tcv: 'multi-year TCV' },
    src: 'Bridge Group 2026 AE report: OTE ~$200K, quota $960K, 6.2-month ramp [verified by the project data]; 30% attrition and the TCV quota are [design]; quota:OTE ~4.2x is [unverified]',
  },
  founding_ae: {
    label: 'Founding AE (lower OTE + equity)', jobRole: 'founding_ae', memberRole: 'ae',
    ote: 150000, basePct: 0.6, rampMonths: 4, attrition: 0.30,
    metric: 'new_acv', metrics: ['new_acv', 'tcv'],
    quotas: { new_acv: 600000, tcv: 800000 },
    units: { new_acv: 'new ACV (first-year)', tcv: 'multi-year TCV' },
    equityOtePerPct: 30000, // USD/yr of OTE-equivalent a candidate credits per 1% of equity [design]
    marketOte: 190000, // US postings show $250-300K OTE at funded startups [unverified]; a cash-light seed-stage market is lower [design]
    src: 'Founding-AE postings cluster at $125-150K base, $250-300K OTE plus 0.05-0.5% equity [unverified]; OTE, quota and equity trade below are [design]',
  },
  am: {
    label: 'Account manager', jobRole: 'am', memberRole: 'am',
    ote: 135000, basePct: 0.75, rampMonths: 3, attrition: 0.25,
    metric: 'expansion_renewals', metrics: ['expansion_renewals'],
    quotas: { expansion_renewals: 450000 },
    units: { expansion_renewals: 'expansion ARR + 20% of renewed ARR' },
    src: 'No usable public AM benchmark found [design]: OTE, split, quota and ramp are game assumptions',
  },
  csm: {
    label: 'Customer success manager', jobRole: 'csm', memberRole: 'csm',
    ote: 105000, basePct: 0.8, rampMonths: 2.5, attrition: 0.20,
    metric: 'grr', metrics: ['grr', 'nrr', 'renewals_bonus'],
    targets: { grr: 0.9, nrr: 1.02, renewals_bonus: 0.9 }, slopes: { grr: 5, nrr: 2.5, renewals_bonus: 3 },
    quotas: { grr: 0.9, nrr: 1.02, renewals_bonus: 0.9 },
    units: { grr: 'gross revenue retention on the book', nrr: 'net revenue retention on the book', renewals_bonus: 'renewal rate on the book' },
    src: 'CSM variable 15-25% of total pay, 70:30 to 80:20 design guidance [secondary, CaptivateIQ; unverified]; targets, slopes and OTE are [design]',
  },
  se: {
    label: 'Sales engineer', jobRole: 'se', memberRole: 'se',
    ote: 170000, basePct: 0.7, rampMonths: 4, attrition: 0.20,
    metric: 'team_quota', metrics: ['team_quota'],
    quotas: { team_quota: 1900000 },
    units: { team_quota: 'team new ACV (all AEs and founder-led deals)' },
    src: 'No usable public SE benchmark found; team-based bonus recommended [design]',
  },
};
export const COMP_ROLE_KEYS = Object.keys(COMP_ROLES);

// Starting accelerators/caps etc. Every number here is a tuning default, not a statistic.
export const PLAN_DEFAULTS = {
  accelAt: 1, accelMult: 1.5, // 80% of plans use accelerators, typically 2-4 tiers at ~1.5-2x [vendor, unverified]
  decelBelow: 0.7, decelMult: 0.5, // decelerators below 70-80% of quota [unverified prevalence]
  cap: null, // null = uncapped; else a multiple of target variable (many plans cap near 150% of quota [unverified])
  clawbackDays: 90, clawbackPct: 1, // most common window 60-120 days [vendor, unverified]
  drawMonths: 3, drawPct: 0.75, drawRecoverable: false, // draws run 3-6 months, non-recoverable most common [unverified]
  payTiming: 'booking', // booking is the common default; cash-collection is less common [unverified]
  founderCredit: 'reduced', // founder-sourced deals: reduced or no credit [design]
  period: 'quarterly',
  discountAuthority: 0.1,
  spiffPerUnit: 0, spiffUntilDay: null,
};

// Hiring-market guardrails (share of market OTE).
export const OTE_MARKET = { underpaid: 0.85, overpaid: 1.3, attritionUnder: 1.6, attritionLowBand: 1.25 }; // [design]

// ---------------------------------------------------------------------------------------------
// Plan templates (dropdown). Fields override PLAN_DEFAULTS and the role defaults. `roles` limits who gets what.
// ---------------------------------------------------------------------------------------------
export const PLAN_TEMPLATES = {
  bridge_default: {
    label: 'Bridge-style default (median benchmarks)',
    note: 'Role-median OTE and split, quarterly accelerators above 100%, decelerator below 70%, 90-day clawback, 3-month draw.',
    apply: { accelMult: 1.5, decelBelow: 0.7, cap: null, clawbackDays: 90, drawMonths: 3, payTiming: 'booking', discountAuthority: 0.1, founderCredit: 'reduced' },
    sdrMetric: 'qualified_opps',
  },
  uncapped_accelerators: {
    label: 'Uncapped with accelerators',
    note: 'Top performers earn without limit: 2x above 100%. No sandbagging, but cost scales with success.',
    apply: { accelMult: 2, decelBelow: 0.5, decelMult: 0.75, cap: null, clawbackDays: 120, drawMonths: 3, payTiming: 'booking', discountAuthority: 0.1 },
  },
  capped_flat: {
    label: 'Capped at 150%, flat rate',
    note: 'Predictable cost. Top reps stop selling when they hit the cap, or hold deals for the next period.',
    apply: { accelMult: 1, decelBelow: 0, cap: 1.5, clawbackDays: 90, drawMonths: 3, payTiming: 'booking', discountAuthority: 0.15 },
  },
  cash_basis: {
    label: 'Paid on cash collected',
    note: 'Commission when the customer pays. Reps chase collections and avoid slow-paying buyers; pay lags the booking.',
    apply: { accelMult: 1.5, decelBelow: 0.7, cap: null, clawbackDays: 60, drawMonths: 4, payTiming: 'cash', discountAuthority: 0.1 },
  },
  per_meeting_sdr: {
    label: 'SDR paid per meeting held',
    note: 'Pays for activity. More meetings, but more junk meetings and wasted AE time.',
    apply: { accelMult: 1.25, decelBelow: 0, cap: null, clawbackDays: 0, drawMonths: 2, payTiming: 'booking' },
    sdrMetric: 'meetings_held',
  },
  founding_equity: {
    label: 'Founding AE: lower OTE plus equity',
    note: 'Cash-light seed-stage trade: below-market OTE offset by 0.25-0.5% equity (needs a C-corp and an option pool).',
    apply: { accelMult: 2, decelBelow: 0, cap: null, clawbackDays: 120, drawMonths: 4, drawRecoverable: true, payTiming: 'booking', founderCredit: 'full', discountAuthority: 0.1 },
    oteScale: 0.8, // of the role default
  },
  no_guardrails: {
    label: 'Bookings, big discount authority, no clawback',
    note: 'Looks generous and simple. Reps close fast, discount at quarter end, and sign poor-fit customers who churn.',
    apply: { accelMult: 2, decelBelow: 0, cap: null, clawbackDays: 0, drawMonths: 3, payTiming: 'booking', discountAuthority: 0.3, founderCredit: 'full' },
  },
  retention_first: {
    label: 'Retention-first (CSM/AM gate on renewals)',
    note: 'CSM paid on GRR, AM on expansion gated by a healthy book. No upsell-before-value incentive.',
    apply: { accelMult: 1.25, decelBelow: 0.8, decelMult: 0.5, cap: 1.75, clawbackDays: 180, drawMonths: 2, payTiming: 'cash' },
    csmMetric: 'grr',
  },
};

// ---------------------------------------------------------------------------------------------
// Behaviour of reps under a plan [design]. Research caveat: "no academic study of pull-forward or sandbagging in
// SaaS was retrieved; Misra & Nair (2011) removing caps and quota ratchets raised sales ~8% (blog summary, not read)".
// ---------------------------------------------------------------------------------------------
export const BEHAVIOR = {
  sdr: {
    // meetings_held: more meetings, fewer real ones. Scaled by variable share / 0.32.
    meetings_held: { meetingsMult: 1.2, qualifiedMult: 0.72, junkMeetings: true },
    qualified_opps: { meetingsMult: 0.97, qualifiedMult: 1.04 },
    pipeline_usd: { meetingsMult: 0.95, qualifiedMult: 1.0, dealSizeMult: 1.1 },
    sourced_closed_won: { meetingsMult: 0.92, qualifiedMult: 1.07, lagMonths: 4 }, // long lag: pay arrives after the fact; morale cost when the cycle is long
  },
  noClawback: { poorFitShare: 0.3, poorFitChurnMult: 1.9, winMult: 1.06 }, // clawbackDays 0
  weakClawback: { poorFitShare: 0.14, poorFitChurnMult: 1.6, winMult: 1.03 }, // clawbackDays under 60
  discountPressure: { authorityAt: 0.2, add: 0.07, quarterEndAdd: 0.05 },
  sandbag: { attritionMult: 1.8, holdDays: 30 },
  cashPlan: { winMult: 0.97, collectionsMult: 0.6 }, // fewer slow-pay deals
  bookingsPlan: { slowPayShare: 0.35, termsDays: 60, nonPayMult: 1.8 }, // booked-pay reps ignore collection risk
  midyearChange: { moraleHit: 8, attritionMult: 1.7, days: 120 },
  confusing: { complexity: 8, moraleHit: 4, attritionMult: 1.25 },
  complexityWeights: { accelTier: 1.5, decel: 1.5, cap: 1, spiff: 2, clawback: 1, draw: 1, cashBasis: 1, founderCredit: 0.5 },
  newBusinessOnlyRenewalNeglect: 1.4, // renewals nobody owns churn at this multiple
  upsellBeforeValue: { pushUsageBelow: 0.55, churnMult: 1.5, acceptP: 0.3 },
  noOwner: { churnMult: 1.4 },
};

// CSM / AM / SE capacity and effect [design unless noted].
export const COVERAGE = {
  // accounts per CSM [unverified, one 2025-dated source]: ~110 SMB, ~35 mid-market, ~10.5 enterprise.
  accountsPerCsm: { smb: 110, mid: 35, ent: 10.5 },
  arrPerCsm: { smb: 1200000, mid: 1600000, ent: 2500000 }, // [unverified]; game default $1.5-2.5M mid-market, $2.5M+ enterprise
  amAccounts: { smb: 90, mid: 30, ent: 9 }, // AMs carry slightly fewer accounts than CSMs but focus on revenue [design]
  seAes: 3, // AEs (plus the founder) one SE can support in technical evaluations [design]
  csm: { churnMult: 0.86, healthBonus: 8, renewalBonus: 0.06, overloadExp: 1.3 },
  am: { expansionMonthlyP: 0.025, renewalBonus: 0.07, uplift: 0.04 },
  se: { winMult: 1.12, cycleMult: 0.85, minAcv: 25000 },
};

// ---------------------------------------------------------------------------------------------
// Land and expand.
// sizeShare: share of the company's headcount seated at the land. cycleMult/winMult: sales cycle and win rate.
// finalShare: land as a share of the account's eventual size (no sourced ratio exists: [design]).
// adoptCeil: ceiling of seat utilisation. expandMult: expansion pace. churnMult: churn at first renewal.
// ---------------------------------------------------------------------------------------------
export const LAND_STRATEGIES = {
  single_team: {
    label: 'Single team', sizeShare: 0.15, cycleMult: 0.8, winMult: 1.1, finalShare: 0.25, adoptCeil: 0.92, expandMult: 1.0, churnMult: 1.0,
    blurb: 'One manager, one budget. Fast and easy to approve; expands when a second team hears about it.',
  },
  departmental: {
    label: 'Department', sizeShare: 0.3, cycleMult: 1.0, winMult: 1.0, finalShare: 0.4, adoptCeil: 0.85, expandMult: 0.9, churnMult: 0.95,
    blurb: 'A whole function. Bigger first cheque and a stickier base, but a second approver and a longer cycle.',
  },
  paid_pilot: {
    label: 'Paid pilot (90 days)', sizeShare: 0.1, cycleMult: 0.9, winMult: 1.12, finalShare: 0.22, adoptCeil: 0.9, expandMult: 1.0, churnMult: 1.0,
    pilotDays: 90, convertBase: 0.62, blurb: 'Small fee, defined success test. Converts to the full land only if it reaches production; otherwise it ends.',
  },
  usage_starter: {
    label: 'Usage-based starter commit', sizeShare: 0.12, cycleMult: 0.7, winMult: 1.15, finalShare: 0.15, adoptCeil: 0.95, expandMult: 1.6, churnMult: 1.1,
    blurb: 'Low commit, billed above it. Growth is automatic with usage; revenue is also volatile.',
  },
  freemium_team: {
    label: 'Freemium team plan', sizeShare: 0.05, cycleMult: 0.4, winMult: 1.3, finalShare: 0.1, adoptCeil: 0.95, expandMult: 1.3, churnMult: 1.35,
    blurb: 'Teams start free and upgrade at a limit. Cheap to win, tiny to start, and many never pay.',
  },
  top_down: {
    label: 'Top-down enterprise-wide', sizeShare: 0.7, cycleMult: 1.6, winMult: 0.6, finalShare: 0.8, adoptCeil: 0.5, expandMult: 0.35, churnMult: 1.0,
    blurb: 'Executive sponsor, multi-year, large commit. Big up front; rollout lags the contract and unused seats are cut at renewal.',
  },
};
export const LAND_IDS = Object.keys(LAND_STRATEGIES);

// How well each land fits an account of this size band (0..1) [design]; used by the account_expansion reader.
export const LAND_FIT = {
  smb: { single_team: 1, departmental: 0.55, paid_pilot: 0.35, usage_starter: 0.7, freemium_team: 0.8, top_down: 0.1 },
  mid: { single_team: 0.9, departmental: 1, paid_pilot: 0.75, usage_starter: 0.8, freemium_team: 0.4, top_down: 0.3 },
  ent: { single_team: 0.55, departmental: 0.8, paid_pilot: 1, usage_starter: 0.6, freemium_team: 0.2, top_down: 0.8 },
};
export const ACV_BANDS = [['smb', 10000], ['mid', 50000], ['ent', Infinity]]; // [design] band edges; SaaS Capital reports a $25-50K ACV band [secondary]
export const bandOfAcv = (acv) => ACV_BANDS.find(([, max]) => acv < max)[0];

// Net and gross revenue retention targets by band for a MEDIAN operator (calibration targets, not outputs).
// SaaS Capital 2025, $25-50K ACV: NRR median 102%, top quartile 111%, bottom quartile 97% [secondary, search extract];
// gross retention above $250K ACV ~95% vs ~91% below [secondary]; KeyBanc/Sapphire 2025 GRR ~90%, NRR >100% [sourced];
// SMB 90-100%, mid-market 100-110%, enterprise 110-120%+ working ranges [unverified]. Per-band medians are [design].
export const NRR_BANDS = {
  smb: { nrr: [0.9, 1.0], grr: [0.82, 0.9], note: 'SMB ~90-100% [unverified]' },
  mid: { nrr: [1.0, 1.1], grr: [0.86, 0.92], note: 'Mid-market ~100-110%; $25-50K ACV median 102%, top quartile 111%, bottom 97% [secondary]' },
  ent: { nrr: [1.08, 1.2], grr: [0.9, 0.96], note: 'Enterprise ~110-120%+ [unverified]; GRR ~95% above $250K ACV [secondary]' },
};

// Expansion mechanics [design].
export const EXPAND = {
  signalMonthlyP: 0.019, // base monthly chance a healthy account surfaces an expansion signal before multipliers; calibrated so a median operator lands in NRR_BANDS [design]
  stepSeatShare: [0.25, 0.6], // an expansion adds this share of the whitespace seats
  qbrDays: 100, // a QBR within this many days counts as current
  champion: { leftMult: 1.8, threadedMult: 1.2, qbrMult: 0.9, execMult: 0.85, decayDays: 180 },
  shelfwareUtil: 0.55, // below this seat utilisation at renewal the buyer cuts seats
  anchorDiscount: 0.2, // land discount above this anchors the price
  anchorUpliftPenalty: 2.2, // acceptance drop per point of uplift above the anchor
  landTooSmallShare: 0.15, // land under this share of potential is "too small to matter"
  upsellBeforeValueChurn: 1.5,
  trueUpPremium: 1.0,
  rampStart: 0.6, // ramp contracts start at this share of the full land
};

export const COMP_SRC = 'docs/research/gtm-comp/comp-plans.md';
export const EXPAND_SRC = 'docs/research/gtm-comp/land-and-expand.md';
