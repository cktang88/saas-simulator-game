// People app parameters. Source of truth: docs/research/hr-legal-product.md §1 and §5 (checked 2026).
// [P] primary, [S] secondary, [A] game-design assumption. Never show [A] values to players as statistics:
// the UI labels them "game assumption".

import { COMPANY } from '../../core/params.js';

export const REGIONS = {
  us: { label: 'United States', short: 'US' },
  latam: { label: 'Latin America', short: 'LatAm' },
  eeu: { label: 'Eastern Europe', short: 'E. Europe' },
  india: { label: 'India', short: 'India' },
};

// Annual base salary ranges [lo, hi] and contract hourly ranges by region.
export const ROLES = {
  engineer: {
    label: 'Founding / senior engineer',
    salary: { us: [140000, 200000], latam: [55000, 110000], eeu: [45000, 120000], india: [35000, 47000] }, // Carta H1 2025 [P]; Lemon.io, Wisemonk 2026 [S]
    hourly: { us: [100, 150], latam: [45, 65], eeu: [50, 75], india: [33, 45] }, // intl [S]; US contract rate [A]
    rampWeeks: 8, // 1.5–6 months; well-documented teams 4–6 weeks (Lethain/Flow [S])
    hireWeeks: [6, 10], // founder part-time [A]; ATS median ~40 days (Ashby via [S])
    equityBench: 1.0, // first engineer ~0.5–2%, default 1% (Carta/Pave via [S])
    src: 'Carta H1 2025 [P]; Lemon.io / Wisemonk 2026 [S]',
  },
  designer: {
    label: 'Product designer',
    salary: { us: [105000, 145000], latam: [37000, 87000], eeu: [37000, 87000], india: [30000, 60000] }, // BLS 2025 [P], Levels.fyi [S]; intl 35–60% of US [A]
    hourly: { us: [60, 120], latam: [30, 60], eeu: [30, 60], india: [20, 40] }, // [A]
    rampWeeks: 5,
    hireWeeks: [5, 8],
    equityBench: 0.5,
    src: 'BLS OEWS 2025 [P]; Levels.fyi 2026 [S]; intl share [A]',
  },
  ae: {
    label: 'Account executive',
    // Median OTE $190k at 53:47 base:variable → ~$100k base; variable ≈ 11% of new ARR at an $800k quota (Bridge Group 2024 [P]).
    salary: { us: [92000, 110000], latam: [40000, 70000], eeu: [40000, 70000], india: [30000, 55000] },
    hourly: { us: [60, 90], latam: [30, 50], eeu: [30, 50], india: [20, 35] }, // [A]
    commissionRate: 0.112,
    rampWeeks: 27, // 6.2 months (Bridge Group 2026 [P])
    hireWeeks: [4, 8],
    equityBench: 0.4,
    src: 'Bridge Group 2024 / 2026 [P]',
  },
  sdr: {
    label: 'SDR',
    // Median OTE $80k at 68:32 → ~$54k base + ~$26k variable (Bridge Group 2025 [P]). Variable paid at target [A].
    salary: { us: [50000, 60000], latam: [20000, 35000], eeu: [22000, 38000], india: [12000, 22000] },
    hourly: { us: [30, 45], latam: [12, 20], eeu: [14, 22], india: [8, 14] }, // [A]
    variableAnnual: 25600,
    rampWeeks: 12, // [A]
    hireWeeks: [4, 8],
    equityBench: 0.1,
    src: 'Bridge Group Feb 2025 [P]; intl [A]',
  },
  support: {
    label: 'Customer support specialist',
    salary: { us: [45000, 65000], latam: [12000, 30000], eeu: [18000, 32000], india: [12000, 24000] }, // Founderpath 2026 [S], BLS [P]; offshore [A]
    hourly: { us: [22, 32], latam: [8, 15], eeu: [10, 16], india: [6, 12] }, // [A]
    rampWeeks: 3, // [A]
    hireWeeks: [4, 6],
    equityBench: 0.05,
    src: 'Founderpath 2026 [S]; BLS OEWS 2025 [P]; offshore range [A]',
  },
  marketer: {
    label: 'Growth / content marketer',
    salary: { us: [90000, 130000], latam: [35000, 70000], eeu: [35000, 70000], india: [20000, 45000] }, // [A]
    hourly: { us: [60, 110], latam: [30, 55], eeu: [30, 55], india: [18, 35] }, // [A]
    rampWeeks: 8,
    hireWeeks: [4, 8],
    equityBench: 0.3,
    src: 'game assumption [A]',
  },
  ops: {
    label: 'Operations / finance generalist',
    salary: { us: [60000, 90000], latam: [20000, 45000], eeu: [22000, 45000], india: [15000, 30000] }, // [A]
    hourly: { us: [35, 60], latam: [15, 30], eeu: [18, 32], india: [10, 20] }, // [A]
    rampWeeks: 4,
    hireWeeks: [4, 6],
    equityBench: 0.1,
    src: 'game assumption [A]',
  },
};

export const midSalary = (role, region) => {
  const [lo, hi] = ROLES[role].salary[region];
  return (lo + hi) / 2;
};
export const midHourly = (role, region) => {
  const [lo, hi] = ROLES[role].hourly[region];
  return (lo + hi) / 2;
};

// Payroll / EOR vendors (checked 2026, [S]).
export const VENDORS = {
  gusto: { base: COMPANY.gusto.base, perPerson: COMPANY.gusto.perPerson, contractorOnlyBase: 35 }, // Gusto Simple $49 + $6/person; contractor-only $35 + $6
  deel: { contractor: COMPANY.deelPerContractor, cor: 325, eor: 599 }, // Deel contractor $49; Contractor of Record ~$325; EOR $599
};

// Employer burden on US base pay: indie lean 1.20–1.25×, VC 1.30–1.40× (BLS ECEC Jun 2026 [P] + [A]).
export const BENEFITS = {
  lean: { label: 'Lean: payroll taxes + basic health', burden: 1.22 },
  standard: { label: 'Standard for your path', burden: null }, // COMPANY.employerBurden[path]
  rich: { label: 'Full benefits (health, dental, 401k match)', burden: 1.4 },
};
export function burdenRate(state) {
  const level = state.apps.people?.benefits ?? 'standard';
  return BENEFITS[level]?.burden ?? COMPANY.employerBurden[state.company.path] ?? 1.25;
}

// International EOR statutory load on gross pay: 13–40% by country [S]; regional point values [A].
export const EOR_LOAD = { latam: 0.3, eeu: 0.25, india: 0.15 };

// AI workforce (research §1.1, §5). Capabilities are game values derived from vendor claims [A].
export const AI_AGENTS = {
  support_ai: {
    label: 'AI support agent (Fin-style)', role: 'support', group: 'support',
    pricing: '$0.99 per resolution, 50 resolutions/month minimum', perResolution: 0.99, monthlyMin: 50, // Intercom Fin pricing via [S] 2026
    resolveRange: [0.3, 0.7], // year one 30–55%, mature 55–70% of all tickets (world-ops-support-life.md §2; vendor claims 67–76%, independent test ~38%)
    errorRate: 0.05, // confidently wrong answers that bounce back angrier [A]
    setupHours: 6, setupDays: 7, // help-center docs, guardrails, evals [A: 1–2 weeks]
    fails: 'Billing disputes, bugs that need an engineer, angry or churn-risk customers, anything missing from your help docs.',
  },
  code_pro: { label: 'Coding agent seat: Claude Pro / Cursor Pro', role: 'engineer', group: 'coding', monthly: 20, boost: 0.5, setupHours: 0.25 },
  code_plus: { label: 'Coding agent seat: Cursor Pro+', role: 'engineer', group: 'coding', monthly: 60, boost: 0.75, setupHours: 0.25 },
  code_max: { label: 'Coding agent seat: Claude Max', role: 'engineer', group: 'coding', monthly: 100, boost: 1.0, setupHours: 0.25 },
  code_ultra: { label: 'Coding agent seat: Claude Max 20× / Cursor Ultra', role: 'engineer', group: 'coding', monthly: 200, boost: 1.25, setupHours: 0.25 },
  code_api: { label: 'Heavy agentic API usage (background agents)', role: 'engineer', group: 'coding', monthly: 800, boost: 1.5, setupHours: 2, category: 'ai_inference', note: 'API heavy use runs $200–$2,000/mo [A]' },
  sdr_11x: {
    label: 'AI SDR (11x-style)', role: 'sdr', group: 'sdr', monthly: 4000, contractMonths: 12, quality: 0.45, setupHours: 4, // ~$3,750–5,000/mo annual [S]
    fails: 'Handles replies poorly, can hallucinate claims, burns domain reputation without a human on deliverability. Early cohorts reportedly churned heavily.',
  },
  sdr_artisan: {
    label: 'AI SDR (Artisan-style)', role: 'sdr', group: 'sdr', monthly: 2000, contractMonths: 12, quality: 0.4, setupHours: 4, // reported deals $1.5–5k/mo [S]
    fails: 'Same failure modes as any first-generation AI SDR: generic personalization, weak reply handling.',
  },
  books_ai: { label: 'AI bookkeeping (Digits-style)', role: 'ops', group: 'books', monthly: 100, errorRate: 0.05, setupHours: 2, fails: 'Miscategorizes unusual transactions; taxes, R&D credits, 409A inputs and state filings still need a CPA.' },
  books_pilot: { label: 'AI bookkeeping + human review (Pilot-style)', role: 'ops', group: 'books', monthly: 400, errorRate: 0.01, setupHours: 2, fails: 'Year-end tax return and state filings are extra.' },
};

// Hiring channels. Rates are shortlist-worthy applicants per week for an average post [A];
// prices are approximate 2026 list prices — verify with the vendor.
export const CHANNELS = {
  linkedin: { label: 'LinkedIn Jobs (promoted)', daily: 15, rate: 1.0, quality: 0.5, note: 'pay-per-click budget ~$15/day (approx.)' },
  wellfound: { label: 'Wellfound (startup jobs)', once: 0, rate: 0.7, quality: 0.55, note: 'free posting, startup-minded candidates' },
  wwr: { label: 'We Work Remotely', once: 299, rate: 0.9, quality: 0.5, note: 'one 30-day post (approx. list price)', remote: true },
  indeed: { label: 'Indeed sponsored', daily: 8, rate: 0.8, quality: 0.35, note: 'volume; best for support/ops/SDR', roles: ['support', 'ops', 'sdr', 'ae'] },
  upwork: { label: 'Upwork / Contra (freelancers)', once: 0, feePct: 0.05, rate: 1.6, quality: 0.45, note: 'contract roles only; ~5% client fee on payments (approx.)', contractorOnly: true },
  network: { label: 'Your network & referrals', once: 0, hours: 2, rate: 0.35, quality: 0.72, note: '2h of DMs to people who know great candidates' },
  recruiter: { label: 'Contingency recruiter', once: 0, feePct: 0.2, rate: 1.2, quality: 0.65, note: 'fee ~20% of first-year salary on hire [A]', employeeOnly: true },
};

// Hours the founder spends per week managing each human report (1:1s, unblocking, reviews) [A].
export const MGMT_HOURS_PER_REPORT = 1;
export const ONBOARDING_HOURS_PER_WEEK = 3; // first 4 weeks of a new hire [A]
export const ONBOARDING_WEEKS = 4;

// 409A + equity (research §1.6).
export const EQUITY = {
  valuation409A: { cost: 2000, range: [1000, 5000], validDays: 365, hours: 2 }, // Pulley [S]
  poolDefaultPct: 10, // 10–15% post-seed (Carta-cited [S])
  vestYears: 4, cliffDays: 365,
};

// Severance: 2–8 weeks pay + COBRA support [A].
export const SEVERANCE = { weeksRange: [2, 8], cobraMonthly: 700 };

export const BASE_ATTRITION_MONTHLY = 0.012; // ~13%/yr voluntary turnover at neutral morale [A]
