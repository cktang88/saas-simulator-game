// People app parameters. Source of truth: docs/research/hr-legal-product.md §1 and §5 (checked 2026).
// [P] primary, [S] secondary, [A] game-design assumption. Never show [A] values to players as statistics:
// the UI labels them "game assumption".

import { COMPANY } from '../../core/params.js';
import { REGION_DATA, ROLE_CLASS, PAY_SHARE } from '../../data/regions.js';
import { benefitsAnnual } from './ops-data.js';

// Every hiring region (data/regions.js: pay shares, English distribution, time zones, pool depth, notice, FX, risks).
export const REGIONS = Object.fromEntries(Object.entries(REGION_DATA).map(([k, r]) => [k, { label: r.label, short: r.short }]));

// Job roles (ids match public/data/roles.js) → the shared member-role contract (ARCHITECTURE.md:
// 'engineer'|'designer'|'ae'|'sdr'|'support'|'marketer'|'ops'). Annual base salary ranges [lo, hi] and
// contract hourly ranges by region. Ramp, traits and outputs come from public/data/roles.js.
export const JOB_ROLES = {
  engineer: {
    label: 'Founding / senior engineer', memberRole: 'engineer',
    salary: { us: [140000, 200000], latam: [55000, 110000], eeu: [45000, 120000], india: [35000, 47000] }, // Carta H1 2025 [P]; Lemon.io, Wisemonk 2026 [S]
    hourly: { us: [100, 150], latam: [45, 65], eeu: [50, 75], india: [33, 45] }, // intl [S]; US contract rate [A]
    rampWeeks: 8, hireWeeks: [6, 10], equityBench: 1.0, technical: true,
    src: 'Carta H1 2025 [P]; Lemon.io / Wisemonk 2026 [S]',
  },
  ai_engineer: {
    label: 'AI/ML engineer (LLM features)', memberRole: 'engineer',
    salary: { us: [160000, 240000], latam: [65000, 130000], eeu: [55000, 140000], india: [40000, 60000] }, // hiring research CANDIDATE_POOL [design] level; intl scaled from engineer [A]
    hourly: { us: [120, 180], latam: [55, 80], eeu: [60, 90], india: [40, 55] }, // [A]
    rampWeeks: 10, hireWeeks: [6, 12], equityBench: 1.0, technical: true,
    src: 'hiring-and-performance.md CANDIDATE_POOL; AI/ML pay fastest-rising (Carta) [design]',
  },
  designer: {
    label: 'Product designer', memberRole: 'designer',
    salary: { us: [105000, 145000], latam: [37000, 87000], eeu: [37000, 87000], india: [30000, 60000] }, // BLS 2025 [P], Levels.fyi [S]; intl 35–60% of US [A]
    hourly: { us: [60, 120], latam: [30, 60], eeu: [30, 60], india: [20, 40] }, // [A]
    rampWeeks: 6, hireWeeks: [5, 8], equityBench: 0.5, technical: true,
    src: 'BLS OEWS 2025 [P]; Levels.fyi 2026 [S]; intl share [A]',
  },
  account_executive: {
    label: 'Account executive', memberRole: 'ae',
    // Median OTE ~$190–200k, base ~50–55% (Bridge Group 2024/2026 [P/V]); commission ≈ variable/quota.
    salary: { us: [85000, 120000], latam: [40000, 70000], eeu: [40000, 70000], india: [30000, 55000] },
    hourly: { us: [60, 90], latam: [30, 50], eeu: [30, 50], india: [20, 35] }, // [A]
    commissionRate: 0.104, quota: 960000, // $100k variable / $960k quota (Bridge 2026)
    rampWeeks: 27, hireWeeks: [4, 8], equityBench: 0.4,
    src: 'Bridge Group 2024 / 2026 [P/V]',
  },
  sdr: {
    label: 'SDR / BDR', memberRole: 'sdr',
    // Median OTE $80k at 68:32 → ~$54k base + ~$26k variable (Bridge Group 2025 [P]). Variable paid at target [A].
    salary: { us: [48000, 62000], latam: [20000, 35000], eeu: [22000, 38000], india: [12000, 22000] },
    hourly: { us: [30, 45], latam: [12, 20], eeu: [14, 22], india: [8, 14] }, // [A]
    variableAnnual: 25600, rampWeeks: 13, hireWeeks: [4, 8], equityBench: 0.1,
    src: 'Bridge Group Feb 2025 [P]; intl [A]',
  },
  founding_ae: {
    label: 'Founding AE (lower OTE + equity)', memberRole: 'ae',
    // Cash-light variant of the AE: base ~$90-120k, OTE ~$150k, equity instead of a market OTE [design]; postings run higher [unverified].
    salary: { us: [90000, 120000], latam: [40000, 70000], eeu: [40000, 70000], india: [30000, 55000] },
    hourly: { us: [60, 90], latam: [30, 50], eeu: [30, 50], india: [20, 35] }, // [A]
    commissionRate: 0.104, quota: 600000,
    rampWeeks: 17, hireWeeks: [4, 8], equityBench: 0.5,
    src: 'Founding-AE postings and recruiter guides [unverified]; cash-light trade [design]',
  },
  csm: {
    label: 'CSM (owns an account book)', memberRole: 'csm',
    salary: { us: [70000, 105000], latam: [25000, 50000], eeu: [28000, 55000], india: [18000, 35000] }, // 80:20 of ~$105K OTE [design]
    hourly: { us: [40, 65], latam: [15, 28], eeu: [18, 30], india: [10, 20] }, // [A]
    rampWeeks: 10, hireWeeks: [4, 8], equityBench: 0.15,
    src: 'CaptivateIQ CSM comp guidance [secondary]; coverage ratios [unverified]; OTE [design]',
  },
  am: {
    label: 'Account manager (expansion + renewals)', memberRole: 'am',
    salary: { us: [85000, 115000], latam: [32000, 60000], eeu: [32000, 60000], india: [22000, 42000] }, // 75:25 of ~$135K OTE [design]
    hourly: { us: [50, 80], latam: [22, 40], eeu: [22, 40], india: [14, 28] }, // [A]
    rampWeeks: 13, hireWeeks: [4, 8], equityBench: 0.2,
    src: 'No usable public AM benchmark: game assumption [design]',
  },
  se: {
    label: 'Sales engineer', memberRole: 'se',
    salary: { us: [105000, 140000], latam: [45000, 80000], eeu: [45000, 80000], india: [30000, 55000] }, // 70:30 of ~$170K OTE [design]
    hourly: { us: [70, 110], latam: [30, 55], eeu: [30, 55], india: [20, 38] }, // [A]
    rampWeeks: 17, hireWeeks: [5, 9], equityBench: 0.25,
    src: 'No usable public SE benchmark: game assumption [design]',
  },
  support: {
    label: 'Customer support specialist', memberRole: 'support',
    salary: { us: [45000, 65000], latam: [12000, 30000], eeu: [18000, 32000], india: [12000, 24000] }, // Founderpath 2026 [S], BLS [P]; offshore [A]
    hourly: { us: [22, 32], latam: [8, 15], eeu: [10, 16], india: [6, 12] }, // [A]
    rampWeeks: 4, hireWeeks: [4, 6], equityBench: 0.05,
    src: 'Founderpath 2026 [S]; BLS OEWS 2025 [P]; offshore range [A]',
  },
  customer_success: {
    label: 'Customer success manager', memberRole: 'support',
    salary: { us: [70000, 110000], latam: [25000, 50000], eeu: [28000, 55000], india: [18000, 35000] }, // [design]
    hourly: { us: [40, 65], latam: [15, 28], eeu: [18, 30], india: [10, 20] }, // [A]
    rampWeeks: 10, hireWeeks: [4, 8], equityBench: 0.15,
    src: 'hiring-and-performance.md CANDIDATE_POOL [design]',
  },
  marketer: {
    label: 'Growth / content marketer', memberRole: 'marketer',
    salary: { us: [90000, 150000], latam: [35000, 70000], eeu: [35000, 70000], india: [20000, 45000] }, // [design]
    hourly: { us: [60, 110], latam: [30, 55], eeu: [30, 55], india: [18, 35] }, // [A]
    rampWeeks: 12, hireWeeks: [4, 8], equityBench: 0.3,
    src: 'game assumption [design]',
  },
  content_writer: {
    label: 'Content writer', memberRole: 'marketer',
    salary: { us: [55000, 100000], latam: [20000, 40000], eeu: [22000, 42000], india: [12000, 25000] }, // [design]
    hourly: { us: [40, 90], latam: [20, 40], eeu: [20, 40], india: [12, 25] }, // per-piece in practice [A]
    rampWeeks: 4, hireWeeks: [3, 6], equityBench: 0.05,
    src: 'game assumption [design]',
  },
  ops_generalist: {
    label: 'Ops / generalist (first business hire)', memberRole: 'ops',
    salary: { us: [75000, 130000], latam: [22000, 45000], eeu: [22000, 45000], india: [15000, 30000] }, // [design]
    hourly: { us: [35, 70], latam: [15, 30], eeu: [18, 32], india: [10, 20] }, // [A]
    rampWeeks: 6, hireWeeks: [4, 6], equityBench: 0.2,
    src: 'game assumption [design]',
  },
  // Fractional executives: part-time retainers or hourly (research international-part-time.md §4): fractional CFO
  // $150-450/hr or $4-8k/mo [secondary]; CMO $200-350/hr, $5-10k/mo [secondary]; no data for VP Sales or Head of CS [design].
  // Engaged as a contractor with `fractional: true` (4-20 h/week). `salary` is the hourly range x 2,080 h, for display only.
  fractional_cfo: {
    label: 'Fractional CFO / finance lead', memberRole: 'ops', fractional: true,
    salary: { us: [312000, 624000] }, hourly: { us: [150, 300] }, // [secondary] $150-450/hr; lower band used for a seed-stage engagement
    rampWeeks: 3, hireWeeks: [3, 6], equityBench: 0.05, src: 'EagleRock 2025 vendor survey, $4-8k/mo; $150-450/hr [secondary]',
  },
  fractional_cmo: {
    label: 'Fractional CMO / head of growth', memberRole: 'marketer', fractional: true,
    salary: { us: [416000, 728000] }, hourly: { us: [200, 350] },
    rampWeeks: 6, hireWeeks: [3, 6], equityBench: 0.1, src: '$200-350/hr, $5-10k/mo retainers [secondary]',
  },
  fractional_vp_sales: {
    label: 'Fractional VP Sales / sales coach', memberRole: 'ops', fractional: true,
    salary: { us: [364000, 624000] }, hourly: { us: [175, 300] },
    rampWeeks: 6, hireWeeks: [3, 6], equityBench: 0.1, src: 'No rate data found: game assumption [design]',
  },
  fractional_head_cs: {
    label: 'Fractional Head of Customer Success', memberRole: 'ops', fractional: true,
    salary: { us: [260000, 468000] }, hourly: { us: [125, 225] },
    rampWeeks: 6, hireWeeks: [3, 6], equityBench: 0.08, src: 'No rate data found: game assumption [design]',
  },
};

// Pay for the regions added with the global-hiring work: a share of the US range by role class (data/regions.js
// PAY_SHARE: engineers from Terminal 2026 where sourced, the rest [design]). LatAm, E. Europe and India keep the
// hand-set ranges above.
const EXEC_SHARE = { latam: 0.5, eeu: 0.5, india: 0.35 }; // fractional execs in the three older regions [design]
for (const [id, r] of Object.entries(JOB_ROLES)) {
  const cls = ROLE_CLASS[id];
  const round = (v, step) => Math.max(step, Math.round(v / step) * step);
  for (const region of Object.keys(REGION_DATA)) {
    if (region === 'us' || (r.salary[region] && r.hourly[region])) continue;
    const share = PAY_SHARE[region]?.[cls] ?? EXEC_SHARE[region] ?? 0.5;
    r.salary[region] = r.salary.us.map((v) => round(v * share, 1000));
    r.hourly[region] = r.hourly.us.map((v) => round(v * share, 1));
  }
}
// Lookup by job role OR member role (aliases for the contract roles 'ae' and 'ops').
export const ROLES = { ...JOB_ROLES };
Object.defineProperty(ROLES, 'ae', { value: JOB_ROLES.account_executive, enumerable: false });
Object.defineProperty(ROLES, 'ops', { value: JOB_ROLES.ops_generalist, enumerable: false });
export const DEFAULT_JOB_ROLE = { engineer: 'engineer', designer: 'designer', ae: 'account_executive', sdr: 'sdr', support: 'support', marketer: 'marketer', ops: 'ops_generalist', csm: 'csm', am: 'am', se: 'se' };
// Sourcing channels list the base roles; a fractional exec is sourced where the base role is.
export const CHANNEL_ROLE = { fractional_cfo: 'ops_generalist', fractional_cmo: 'marketer', fractional_vp_sales: 'account_executive', fractional_head_cs: 'customer_success' };
export const jobRoleOf = (m) => m.jobRole ?? DEFAULT_JOB_ROLE[m.role] ?? m.role;

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

// Employer cost of a US employee, built bottom-up (realism review F18) instead of a flat %:
// FICA 7.65% up to the 2026 Social Security wage base ($184,500) + 1.45% Medicare above it, ~$420 FUTA/SUTA,
// a fixed health premium per employee and an optional 401(k) match. Regressive: heavier on lower salaries.
// BLS ECEC Jun 2026: benefits are 30–31.5% of total comp on average (incl. paid leave, which salary already covers).
export const FICA = { rate: 0.0765, medicare: 0.0145, wageBase: 184500, futaSuta: 420 };
export const BENEFITS = {
  lean: { label: 'Lean: payroll taxes + basic health', health: 8000, retirement: 0 },
  standard: { label: 'Standard for your path', health: null, retirement: null }, // indie: $8.5k health; VC: $11k + 2% match [A]
  rich: { label: 'Full benefits (health, dental, 401k match)', health: 14000, retirement: 0.04 },
};
function benefitsFor(state) {
  // Once the founder configures the benefits policy (People -> Benefits & time off), the employer cost comes from it: KFF 2025
  // premiums trended to this year x the contribution, dental/vision, stipends and the 401(k) match (people/ops-data.js).
  const ops = state.apps.people?.ops?.benefits;
  if (ops?.configured) {
    let b = ops;
    const live = state.apps.people.members.filter((m) => m.engagement === 'employee' && m.region === 'us' && (m.status === 'active' || m.status === 'offer')).length;
    if (b.health.mode === 'peo' && live < 2 || b.health.mode === 'qsehra' && live > 49) b = { ...b, health: { ...b.health, mode: 'none' } };
    const a = benefitsAnnual(state, b, { remote: state.apps.people.ops.workplace?.mode !== 'lease' });
    return { health: a.total, retirement: a.retirement };
  }
  const level = state.apps.people?.benefits ?? 'standard';
  const b = BENEFITS[level] ?? BENEFITS.standard;
  const vc = state.company.path === 'vc';
  return { health: b.health ?? (vc ? 11000 : 8500), retirement: b.retirement ?? (vc ? 0.02 : 0) };
}
// Annual employer taxes + benefits on top of an annual gross pay.
// US employees under 30 scheduled hours a week are not offered the health plan: 30 h/week or 130 h/month is the
// ACA full-time line (IRC 4980H). The mandate only binds employers with 50+ FTE, so for a small company this is
// the game's eligibility rule [design]; verify on IRS.gov before relying on it. Payroll taxes still apply.
export const ACA_FULL_TIME_HOURS = 30;
export const benefitsEligible = (hours = 40) => hours >= ACA_FULL_TIME_HOURS;
export function employerAnnual(state, gross, { hours = 40 } = {}) {
  if (!(gross > 0)) return 0;
  const b = benefitsFor(state);
  return FICA.rate * Math.min(gross, FICA.wageBase) + FICA.medicare * Math.max(0, gross - FICA.wageBase) + FICA.futaSuta + (benefitsEligible(hours) ? b.health : 0) + b.retirement * gross;
}
// Effective multiplier for display (default: a $170k engineer).
export function burdenRate(state, salary = 170000) {
  return 1 + employerAnnual(state, salary) / salary;
}

// International EOR statutory load on gross pay: per-country loads BR ~0.7, MX ~0.35, AR ~0.45 → LatAm ~0.45;
// PL ~0.21, RO ~0.03 → E. Europe ~0.18; IN ~0.17 (realism review F18; research range 13–40% [S]).
export const EOR_LOAD = Object.fromEntries(Object.entries(REGION_DATA).filter(([, r]) => r.eorLoad > 0).map(([k, r]) => [k, r.eorLoad]));
// Others are [design]: Canada 0.12, W. Europe/UK 0.22, Pakistan 0.10, Philippines/SE Asia 0.22 (13th-month pay), Africa 0.15.

// AI workforce (research §1.1, §5). Capabilities are game values derived from vendor claims [A].
export const AI_AGENTS = {
  support_ai: {
    label: 'AI support agent (Fin-style)', role: 'support', group: 'support',
    pricing: '$0.99 per resolution, 50 resolutions/month minimum', perResolution: 0.99, monthlyMin: 50, // Intercom Fin pricing via [S] 2026
    resolveRange: [0.3, 0.7], // year one 30–55%, mature 55–70% of all tickets (world-ops-support-life.md §2; vendor claims 67–76%, independent test ~38%)
    errorRate: 0.08, // confidently wrong answers that bounce back angrier (aligned with the Helpdesk app) [design]
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

// Hours the founder spends per week managing each human report (1:1s, unblocking, reviews) [A].
export const MGMT_HOURS_PER_REPORT = 1; // default; engineers use ROLES outputs.founderHoursPerWeek from data/roles.js
export const ONBOARDING_HOURS_PER_WEEK = 3; // first 4 weeks of a new hire [A]
export const ONBOARDING_WEEKS = 4;

// 409A + equity (research §1.6).
export const EQUITY = {
  // Default (independent appraiser) cost; the real price depends on the cap-table vendor (money/backoffice.js valuation409A:
  // included in Carta Build+, ~$2,500 standalone, Cake $1,500, Fidelity from $1,229 [third-party], back-office-finance.md §5).
  valuation409A: { cost: 2000, range: [1000, 5000], validDays: 365, hours: 2 }, // [design] within the $1,000-5,000 range
  poolDefaultPct: 10, // 10–15% post-seed (Carta-cited [S])
  vestYears: 4, cliffDays: 365,
};

// Severance: 2–8 weeks pay + COBRA support [A].
export const SEVERANCE = { weeksRange: [2, 8], cobraMonthly: 700 };

export const BASE_ATTRITION_MONTHLY = 0.012; // ~13%/yr voluntary turnover at neutral morale [A]
