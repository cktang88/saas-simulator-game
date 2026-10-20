// The HR and hiring tool stack as paradigms, not price tags (Q4 2026). Each vendor changes what the founder does:
//   Payroll / HR:  Gusto = payroll-first, US only (pay run at the centre; IT and offboarding are on you; employees
//                  abroad are referred to Remote). Rippling = one employee record drives payroll, apps, devices and
//                  offboarding; you design workflows once and they fire on every hire and exit, but the list price
//                  hides module creep ($20-35 per employee real bills) and an annual contract. Justworks = a PEO:
//                  co-employment, its benefits plans and state accounts, a higher per-employee fee, lock-in on exit.
//   Global:        Deel = EOR-first breadth (EOR, contractors, Contractor of Record, US PEO), fastest onboarding.
//                  Remote = owned-entity EOR (fewer local payroll errors, annual price or a monthly premium).
//                  Oyster = EOR with a benefits bundle. Rippling and Justworks sell their own EOR add-ons.
//   ATS:           Ashby = all-in-one with analytics (source yield, time in stage) and self-scheduling; add-on creep.
//                  Greenhouse = structured hiring enforced (kit + scorecard before any interview, scorecards after),
//                  Real Talent fraud flags; ~$27K/yr median, overkill for a small team. Lever = candidate CRM
//                  (nurture past candidates back), thinner evaluation; declining (Employ Inc., no 2026 product news).
//   Sourcing:      Juicebox-style AI search: you describe the candidate, review the shortlist, send a sequence; bounded
//                  by email-lookup credits and reply rates, and a spray of generic messages burns the pool.
//
// Source: docs/research/tools/2026q4/support-people-compliance.md §2 (HR paradigm table), §3 (ATS paradigm table),
// §5 (verdicts). Prices tagged [verified] / [third-party] / [unverified] as in that doc; tuning values are [design].
// Old saves: state.apps.people.hrStack is created with ??=; a save with only payrollSetup.gusto / .deel reads as
// Gusto + Deel (the stack before this module).

import { post, addRecurring } from '../../core/bank.js';
import { notify } from '../../core/state.js';
import { round2, clamp, rng, uid, money, dateOf } from '../../core/util.js';
import { logMistake } from '../../core/operator.js';
import { VENDORS, FICA } from './catalog.js';
import { PEO } from './ops-data.js';
import { ensureOps, chargeHours, humansOf } from './ops-state.js';
import { streamFor } from './global.js';
import { makeCandidate } from './candidates.js';
import { AGENCY } from './sourcing.js';

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export const PAYROLL_VENDORS = {
  gusto: {
    label: 'Gusto', status: 'keep', paradigm: 'Payroll-first, US only',
    base: VENDORS.gusto.base, perPerson: VENDORS.gusto.perPerson, contractorOnlyBase: VENDORS.gusto.contractorOnlyBase, // Simple $49 + $6/person; contractor-only $35 + $6 [third-party]
    setupHours: 2, runHours: 0.25, // a biweekly run takes ~10-20 minutes (research §2.1)
    intlContractors: true, // pays contractors in 120+ countries (W-8BEN) [third-party]
    intlEmployees: false, eorPartner: 'remote', // new customers' employees abroad are referred to Remote from 2026-05-01 [unverified, one source]
    stateRegHours: 1.5, // registering state withholding + unemployment accounts for a hire in a new state [design]
    fit: 'Pre-seed to Series A, US team, <10-15 people',
    trap: 'No employees abroad; IT provisioning and offboarding stay manual.',
  },
  rippling: {
    label: 'Rippling', status: 'keep', paradigm: 'Unified employee graph (HR + payroll + IT)',
    platform: 40, // ~$35-40/mo platform fee + ~$8/user base [third-party]
    implFee: 1000, // implementation fees are common; amount [design]
    contractMonths: 12, // annual contracts common [third-party]
    setupHours: 5, workflowHours: 4, runHours: 0.15, stateRegHours: 1.5,
    intlContractors: true, intlEmployees: true, eorPartner: 'rippling',
    fit: 'Seed+ with 10+ people or a SOC 2 programme (device and access evidence)',
    trap: 'Module creep (real bills $20-35/employee), annual contract, overkill under ~5 people.',
  },
  justworks: {
    label: 'Justworks (PEO)', status: 'keep-alt', paradigm: 'PEO co-employment',
    pepm: { basic: PEO.basic, plus: PEO.plus }, // list PEPM $79 / $124 [unverified]
    contractorFee: 8, // [design]
    setupHours: 3, runHours: 0.15, stateRegHours: 0, // the PEO's state accounts cover new states [design]
    intlContractors: true, intlEmployees: true, eorPartner: 'justworks',
    fit: '2-30 US employees who want big-company benefits and human HR support',
    trap: 'Higher per-employee fee; leaving mid-year restarts payroll-tax wage bases and takes a migration.',
  },
};

// Rippling modules: per-user prices are [design], set so a typical 3-4 module bill lands at $20-35/employee
// ([third-party] real-bill range): core 4 modules = $26/user + the platform fee; the rep's 7-module bundle = $36/user. `useful` is what the module needs to earn its fee in this company.
export const RIPPLING_MODULES = {
  hris: { label: 'Core HRIS (employee record)', perUser: 8, required: true, useful: () => true },
  payroll: { label: 'Payroll', perUser: 6, required: true, useful: () => true },
  it: { label: 'App management + SSO (provision and deprovision accounts)', perUser: 6, useful: (s, n) => n >= 3 || soc2Active(s) },
  devices: { label: 'Device management (MDM, laptop agent)', perUser: 6, useful: (s, n) => n >= 3 || soc2Active(s) },
  benefits: { label: 'Benefits administration', perUser: 4, useful: (s) => Boolean(s.apps.people?.ops?.benefits?.configured && s.apps.people.ops.benefits.health?.mode !== 'none') },
  time: { label: 'Time and attendance', perUser: 3, useful: (s) => humansOf(s.apps.people).some((m) => m.status === 'active' && (m.partTime || (m.hoursPerWeek ?? 40) < 35)) },
  spend: { label: 'Spend management and cards', perUser: 3, useful: (s, n) => n >= 6 },
  learning: { label: 'Learning management', perUser: 3, useful: (s, n) => n >= 12 },
};
// What a Rippling rep pitches as "the bundle" (the UI pre-checks it) [design].
export const RIPPLING_BUNDLE = ['hris', 'payroll', 'it', 'devices', 'benefits', 'time', 'spend'];

export const EOR_VENDORS = {
  deel: {
    label: 'Deel', status: 'keep', paradigm: 'EOR-first breadth: EOR, contractors, Contractor of Record, US PEO',
    eor: VENDORS.deel.eor, contractor: VENDORS.deel.contractor, cor: VENDORS.deel.cor, // $599 / $49 / $325 [verified deel.com/pricing]
    onboardDays: 3, incidentMult: 1, setupHours: 1, // "days not months" [vendor]; error rate [design]
  },
  remote: {
    label: 'Remote', status: 'keep-alt', paradigm: 'Owned-entity EOR',
    eor: 599, eorMonthly: 699, contractor: VENDORS.deel.contractor, // $599 annual / $699 monthly [third-party]; contractor price [design: assumed parity]
    onboardDays: 5, incidentMult: 0.6, setupHours: 1, annualMonths: 12, // owned entities: fewer local payroll errors [design]
  },
  oyster: {
    label: 'Oyster', status: 'keep-alt', paradigm: 'EOR with a benefits bundle',
    eor: 699, contractor: VENDORS.deel.contractor, // ~$699 [third-party]; benefits bundling disputed
    onboardDays: 6, incidentMult: 0.9, setupHours: 1, moraleBonus: 3, // [design]
  },
  rippling: {
    label: 'Rippling EOR', status: 'keep', paradigm: 'EOR inside the same employee graph', requires: 'rippling',
    eor: 500, contractor: 8, // global EOR quoted separately, ~$500/mo cited [third-party]; contractor [design]
    onboardDays: 5, incidentMult: 1.1, setupHours: 0.5,
  },
  justworks: {
    label: 'Justworks international EOR', status: 'keep-alt', paradigm: 'PEO add-on', requires: 'justworks',
    eor: 599, contractor: 8, onboardDays: 6, incidentMult: 1, setupHours: 0.5, // $599 add-on [third-party]
  },
};
// Local statutory payroll error per EOR employee-month (missed 13th-month pay, a late filing, benefits not enrolled) [design].
export const EOR_INCIDENT = { monthly: 0.012, hours: 3, morale: 6, backPay: [300, 1800] };

export const ATS_VENDORS = {
  none: { label: 'Spreadsheet + calendar links', status: 'keep', paradigm: 'No system', schedHours: 0.25, coldMult: 1, revive: 0, analytics: false },
  ashby: {
    label: 'Ashby', status: 'keep', paradigm: 'All-in-one, analytics-first', monthly: 400, // Foundations up to 100 employees [verified ashbyhq.com/pricing]
    credits: 1500, setupHours: 2, schedHours: 0.05, coldMult: 0.7, revive: 0.15, analytics: true, aiCriteria: true, // self-serve scheduling links; CRM in one data model
    fit: '5-100 hires a year', trap: 'Add-on creep: texting, SSO, AI Notetaker, Advanced Scheduling.',
  },
  greenhouse: {
    label: 'Greenhouse', status: 'keep-alt', paradigm: 'Structured hiring enforced', annualSmall: [6000, 7000], annualMedian: 27000, // entry ~$6-6.5K small teams, ~$27K median (711 purchases) [third-party]
    setupHours: 8, schedHours: 0.1, perInterviewHours: 0.25, coldMult: 0.8, revive: 0.05, analytics: false, kitEnforced: true, fraudFlag: 0.5, // Real Talent fraud/spam [third-party]; detection share [design]
    fit: '50+ employees with steady hiring', trap: 'Price and admin weight; overkill early.',
  },
  lever: {
    label: 'Lever', status: 'declining', paradigm: 'Candidate CRM (nurture first)', annual: [5000, 15000], // ~$5-15K/yr startups [third-party]
    setupHours: 3, schedHours: 0.1, coldMult: 0.85, revive: 0.3, analytics: false, nurtureHours: 0.5,
    note: 'Owned by Employ Inc. (JazzHR, Jobvite); no major 2026 product news. Still sold; trend is down.',
    fit: 'Outbound-heavy recruiting', trap: 'Evaluation and reporting are thinner.',
  },
};
export const ATS_ADDONS = {
  sso: { label: 'SSO', monthly: 100, useful: (s, n) => n >= 10 || soc2Active(s) }, // [verified]
  texting: { label: 'Texting (1,000 messages)', monthly: 90, useful: (s) => (s.apps.people?.jobs ?? []).some((j) => j.status === 'open' && ['support', 'sdr'].includes(j.role)) }, // +$90 per 1,000 [verified]
  notetaker: { label: 'AI Notetaker', monthly: 150, useful: (s) => interviewsLast30(s) >= 4 }, // add-on, price [design]
  scheduling: { label: 'Advanced Scheduling (panels)', monthly: 100, useful: (s) => interviewsLast30(s) >= 8 }, // add-on, price [design]
};

export const JUICEBOX = {
  label: 'Juicebox (PeopleGPT)', seat: 139, // Starter ~$79-139/seat/mo annual [third-party]
  lookups: 300, // email lookups per seat per month [design]
  briefHours: 0.5, reviewHoursPer25: 0.75, shortlist: 25,
  minutesPerMessage: { template: 1, sequence: 2, personalized: 6 },
  // Reply rates: data/roles.js ai_sourcing_outbound (cold InMail ~5.5%, per-candidate sequence ~16.6%, founder-personalised 15-30%).
  reply: { template: 0.055, sequence: 0.166, personalized: 0.24 },
  burnDays: 90, burnMult: 0.5, // a generic blast to an unmatched list burns that pool [design]
};

export const MIGRATION = { hours: 8, peoHours: 10 }; // switching payroll vendors [design]
export const MODULE_GRACE_DAYS = 60; // a module unused after 60 days is creep [design]

// ---------------------------------------------------------------------------
// State and resolution
// ---------------------------------------------------------------------------

const P = (state) => state.apps.people;
const soc2Active = (s) => Boolean(s.apps.legal?.compliance?.platform) || /in_progress|type/.test(String(s.apps.legal?.soc2 ?? 'none'));
const interviewsLast30 = (s) => (s.apps.people?.candidates ?? []).filter((c) => c.interview?.done && s.day - (c.interview.day ?? -999) <= 30).length;
const humansNow = (state) => humansOf(P(state)).filter((m) => m.status === 'active' || m.status === 'offer');
const usStaff = (state) => humansNow(state).filter((m) => m.region === 'us' && m.engagement === 'employee');

export function ensureStack(state) {
  const p = P(state);
  p.hrStack ??= { payroll: null, payrollDay: null, eor: null, eorDay: null, rippling: null, peoTier: 'basic', remotePlan: 'annual', switches: [], stateRegs: {}, flagged: {} };
  const h = p.hrStack;
  h.switches ??= []; h.stateRegs ??= {}; h.flagged ??= {};
  p.ats ??= { ashby: false, recurringId: null, credits: 0, month: null, used: 0 };
  const a = p.ats;
  a.vendor ??= a.ashby ? 'ashby' : 'none';
  a.addOns ??= {}; a.reviews ??= []; a.nurtures ??= [];
  p.sourcing ??= { juicebox: false, recurringId: null, lookups: 0, month: null, searches: [], burned: {} };
  return h;
}

/** The US payroll vendor in use: the stack choice, or Gusto for a save that only has payrollSetup.gusto. */
export function usPayrollVendor(state) {
  const p = P(state);
  return p?.hrStack?.payroll ?? (p?.payrollSetup?.gusto ? 'gusto' : null);
}
/** The global (EOR / contractors abroad) vendor in use: the stack choice, or Deel for a legacy save. */
export function globalVendor(state) {
  const p = P(state);
  return p?.hrStack?.eor ?? (p?.payrollSetup?.deel ? 'deel' : null);
}
export const payrollLabel = (state) => PAYROLL_VENDORS[usPayrollVendor(state) ?? 'gusto'].label.replace(/ \(PEO\)$/, '');
export const eorVendorOf = (state, m) => m?.eorVendor ?? globalVendor(state) ?? 'deel';
export const eorLabelOf = (state, m) => EOR_VENDORS[eorVendorOf(state, m)]?.label.replace(/ (EOR|international EOR)$/, '') ?? 'Deel';
/** Who pays a contractor: m.payVendor stamped at hire ('gusto' for a US contractor or one paid via Gusto abroad). */
export const contractorVendorOf = (state, m) => m?.payVendor ?? (m?.region === 'us' ? 'gusto' : 'deel');

/** Rippling per-user price for the active modules. */
export function ripplingPerUser(state) {
  const r = P(state)?.hrStack?.rippling;
  if (!r) return 0;
  return Object.keys(r.modules ?? {}).reduce((a, k) => a + (RIPPLING_MODULES[k]?.perUser ?? 0), 0);
}
const ripplingHas = (state, mod) => usPayrollVendor(state) === 'rippling' && Boolean(P(state).hrStack?.rippling?.modules?.[mod]);
/** Rippling automation is live: the module is paid for AND the hire/exit workflows were designed. */
export const ripplingAutomates = (state, mod) => ripplingHas(state, mod) && Boolean(P(state).hrStack.rippling.workflowsDay != null);
const peoCoversBenefits = (state) => P(state)?.ops?.benefits?.configured && P(state).ops.benefits.health?.mode === 'peo';

// ---------------------------------------------------------------------------
// Fees (used by payroll.js monthlyCostOf / vendorBills)
// ---------------------------------------------------------------------------

/** Per-person monthly fee of the US payroll vendor for one US employee. */
export function usEmployeeFee(state) {
  const v = usPayrollVendor(state) ?? 'gusto';
  if (v === 'rippling') return ripplingPerUser(state);
  if (v === 'justworks') return peoCoversBenefits(state) ? 0 : PEO[P(state).hrStack?.peoTier ?? 'basic'] ?? PEO.basic; // PEPM already in the benefits cost when the policy is a PEO plan
  return VENDORS.gusto.perPerson;
}
export function eorFee(state, m) {
  const id = eorVendorOf(state, m);
  const E = EOR_VENDORS[id] ?? EOR_VENDORS.deel;
  if (id === 'remote' && (P(state)?.hrStack?.remotePlan ?? 'annual') === 'monthly') return E.eorMonthly;
  return E.eor;
}
export function contractorFee(state, m) {
  const v = contractorVendorOf(state, m);
  if (m.cor) return VENDORS.deel.cor;
  if (v === 'gusto') return VENDORS.gusto.perPerson;
  if (v === 'rippling') return ripplingPerUser(state) || 8;
  if (v === 'justworks') return PAYROLL_VENDORS.justworks.contractorFee;
  return EOR_VENDORS[v]?.contractor ?? VENDORS.deel.contractor;
}

/** Monthly bills by vendor slot: { us: { vendor, label, amount }, global: { vendor, label, amount } }. */
export function hrBills(state, members = P(state)?.members ?? []) {
  const live = members.filter((m) => m.kind !== 'ai_agent' && m.kind !== 'cofounder' && (m.status === 'active' || m.status === 'offer'));
  const usEmp = live.filter((m) => m.engagement === 'employee').length;
  const usCon = live.filter((m) => m.engagement === 'contractor' && contractorVendorOf(state, m) === 'gusto' && !m.cor).length;
  const v = usPayrollVendor(state) ?? 'gusto';
  let us = 0;
  if (v === 'gusto') us = usEmp ? VENDORS.gusto.base + VENDORS.gusto.perPerson * (usEmp + usCon) : usCon ? VENDORS.gusto.contractorOnlyBase + VENDORS.gusto.perPerson * usCon : 0;
  else if (v === 'rippling') {
    const users = live.filter((m) => m.engagement === 'employee' || ['rippling'].includes(m.eorVendor) || contractorVendorOf(state, m) === 'rippling').length;
    us = P(state).hrStack?.rippling ? PAYROLL_VENDORS.rippling.platform + ripplingPerUser(state) * users : 0;
  } else if (v === 'justworks') {
    const jwCon = live.filter((m) => m.engagement === 'contractor' && contractorVendorOf(state, m) === 'justworks').length;
    us = usEmp * usEmployeeFee(state) + jwCon * PAYROLL_VENDORS.justworks.contractorFee;
  }
  let glob = 0;
  for (const m of live) {
    if (m.engagement === 'eor' && eorVendorOf(state, m) === 'rippling') us += eorFee(state, m); // one Rippling invoice
    else if (m.engagement === 'eor') glob += eorFee(state, m);
    else if (m.engagement === 'contractor' && (m.cor || !['gusto', 'rippling', 'justworks'].includes(contractorVendorOf(state, m)))) glob += contractorFee(state, m);
  }
  const g = globalVendor(state) ?? 'deel';
  return { us: { vendor: v, label: PAYROLL_VENDORS[v].label, amount: round2(us) }, global: { vendor: g, label: EOR_VENDORS[g]?.label ?? 'Deel', amount: round2(glob) }, usEmp, usCon };
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

/**
 * Choose (or switch) the US payroll / HR platform. opts: { modules: [...] } for Rippling, { tier } for Justworks.
 * Returns { hours, usd }. Switching costs a migration; leaving a PEO mid-year restarts wage bases; leaving Rippling
 * inside its annual term owes the rest of the term.
 */
export function choosePayroll(state, id, { modules = RIPPLING_BUNDLE, tier = 'basic', hasEin = true } = {}) {
  const V = PAYROLL_VENDORS[id];
  if (!V) throw new Error('Pick a payroll platform.');
  if (!hasEin) throw new Error(`${V.label} needs your EIN and state employer accounts. Incorporate and get an EIN in Legal first.`);
  const p = P(state);
  const h = ensureStack(state);
  const prev = usPayrollVendor(state);
  if (prev === id) throw new Error(`Already on ${V.label}.`);
  let hours = V.setupHours, usd = 0;
  const n = usStaff(state).length;
  if (prev) {
    hours += prev === 'justworks' ? MIGRATION.peoHours : MIGRATION.hours;
    // Rippling's annual term: the rest is owed.
    if (prev === 'rippling' && h.rippling) {
      const left = Math.max(0, Math.ceil((h.rippling.termEnd - state.day) / 30.4));
      const owed = round2(left * (PAYROLL_VENDORS.rippling.platform + ripplingPerUser(state) * Math.max(1, n)));
      if (owed > 0) { post(state, { amount: -owed, counterparty: 'Rippling', description: `Rippling early termination: ${left} month(s) left on the annual contract`, category: 'software', method: 'card', meta: { app: 'people' } }); usd += owed; }
    }
    // Leaving a PEO mid-year: wages paid under the PEO's EIN do not carry over, so unemployment wage bases restart (FUTA/SUTA again) [design simplification].
    if (prev === 'justworks' && dateOf(state).getUTCMonth() > 0 && n) {
      const extra = round2(FICA.futaSuta * n);
      post(state, { amount: -extra, counterparty: 'IRS / state UI', description: `Payroll-tax wage bases restarted after leaving the PEO mid-year (${n} employee(s))`, category: 'payroll_tax', method: 'payroll', meta: { app: 'people' } });
      usd += extra;
    }
    h.switches.push({ day: state.day, from: prev, to: id });
    const recent = h.switches.filter((x) => state.day - x.day <= 365);
    logMistake(state, { functionId: 'people_ops', id: recent.length >= 2 ? 'hr_vendor_churn' : 'hr_vendor_switch', label: recent.length >= 2 ? 'Switched payroll platforms twice in a year' : 'Payroll platform migration', app: 'people', key: `hrswitch:${h.switches.length}`, circles: recent.length >= 2, cost: { usd, hours }, detail: `${PAYROLL_VENDORS[prev].label} → ${V.label}: export employee records, re-enter tax setups and benefits, run parallel payroll${usd ? `, ${money(usd)} in exit costs` : ''}. Pick the platform for the team you will have in 12-18 months, not this month.` });
  }
  if (id === 'rippling') {
    const mods = Object.fromEntries([...new Set(['hris', 'payroll', ...modules])].filter((k) => RIPPLING_MODULES[k]).map((k) => [k, state.day]));
    h.rippling = { modules: mods, startDay: state.day, termEnd: state.day + 365, workflowsDay: null, renewals: 0, flagged: {} };
    post(state, { amount: -PAYROLL_VENDORS.rippling.implFee, counterparty: 'Rippling', description: 'Rippling implementation fee', category: 'software', method: 'card', meta: { app: 'people' } });
    usd += PAYROLL_VENDORS.rippling.implFee;
    const planned = humansNow(state).length + (p.jobs ?? []).filter((j) => j.status === 'open').length; // the team you are hiring for counts
    if (n < 5 && !soc2Active(state) && planned < 5) {
      logMistake(state, { functionId: 'people_ops', id: 'hr_overkill', label: 'Rippling bought for a tiny team', app: 'people', key: 'hr_overkill', cost: { usd: round2(PAYROLL_VENDORS.rippling.implFee + 12 * PAYROLL_VENDORS.rippling.platform) }, detail: `${n} US employee(s) and no SOC 2 programme: an implementation fee and a 12-month contract for automation that fires a few times a year. Gusto at $49 + $6/person covers this until ~10 people or a compliance need.` });
    }
  } else h.rippling = null;
  if (id === 'justworks') h.peoTier = PEO[tier] ? tier : 'basic';
  h.payroll = id;
  h.payrollDay = state.day;
  p.payrollSetup.gusto = true; // "US payroll is set up" (other apps read this flag)
  return { hours, usd };
}

/** Rippling: design the hire/exit workflows once (create accounts, ship + enroll a laptop, revoke on exit). */
export function designRipplingWorkflows(state) {
  const h = ensureStack(state);
  if (usPayrollVendor(state) !== 'rippling' || !h.rippling) throw new Error('Workflows are a Rippling feature.');
  if (h.rippling.workflowsDay != null) throw new Error('Workflows are already live.');
  h.rippling.workflowsDay = state.day;
  for (const m of P(state).members) if (m.status === 'offer') stackOnHire(state, m); // hires who have not started yet get accounts now
  return { hours: PAYROLL_VENDORS.rippling.workflowHours };
}

/** Rippling: add or drop modules. Dropping takes effect at renewal (annual contract). */
export function setRipplingModules(state, modules) {
  const h = ensureStack(state);
  if (!h.rippling) throw new Error('Not on Rippling.');
  const want = new Set(['hris', 'payroll', ...modules].filter((k) => RIPPLING_MODULES[k]));
  for (const k of want) h.rippling.modules[k] ??= state.day;
  h.rippling.pendingDrop = Object.keys(h.rippling.modules).filter((k) => !want.has(k));
  return { dropAtRenewal: h.rippling.pendingDrop };
}

/** Choose the global vendor (EOR and contractors abroad). opts.plan for Remote: 'annual' | 'monthly'. */
export function chooseEor(state, id, { plan = 'annual' } = {}) {
  const E = EOR_VENDORS[id];
  if (!E) throw new Error('Pick an EOR provider.');
  if (E.requires && usPayrollVendor(state) !== E.requires) throw new Error(`${E.label} is sold to ${PAYROLL_VENDORS[E.requires].label} customers.`);
  const h = ensureStack(state);
  const prev = globalVendor(state);
  if (prev === id) throw new Error(`Already on ${E.label}.`);
  // Existing EOR employees stay with the vendor that employs them (moving an EOR employee is a new local contract).
  if (prev) for (const m of humansNow(state)) if (m.engagement === 'eor') m.eorVendor ??= prev;
  h.eor = id; h.eorDay = state.day;
  if (id === 'remote') h.remotePlan = plan === 'monthly' ? 'monthly' : 'annual';
  P(state).payrollSetup.deel = true; // "global payroll is set up"
  return { hours: E.setupHours };
}

/** Stamp the paying vendor on a new hire (called before the first cost is computed). */
export function stampVendor(state, m) {
  if (m.kind === 'ai_agent' || m.engagement === 'cofounder') return m;
  if (m.engagement === 'eor') m.eorVendor = globalVendor(state) ?? 'deel';
  else if (m.engagement === 'contractor') {
    const g = globalVendor(state), u = usPayrollVendor(state);
    m.payVendor = m.region === 'us' ? (u && u !== 'gusto' ? u : 'gusto') : m.cor ? 'deel' : g ?? (PAYROLL_VENDORS[u]?.intlContractors ? u : 'deel');
  }
  return m;
}

/** Can this engagement ({ engagement, region, cor }) be paid with the current stack? Returns an error string or null. */
export function payrollGate(state, c) {
  const u = usPayrollVendor(state), g = globalVendor(state);
  if (c.engagement === 'eor' && !g) {
    if (u === 'gusto') return 'Gusto does not employ people abroad (new customers are referred to Remote). Pick an EOR provider in People → HR stack.';
    return 'Pick an EOR provider first (People → HR stack).';
  }
  if (c.engagement === 'contractor' && c.region !== 'us' && !g && !(u && PAYROLL_VENDORS[u].intlContractors)) return 'Set up Deel first to pay contractors abroad.';
  if (c.engagement === 'contractor' && c.cor && g && g !== 'deel') return 'Contractor of Record is a Deel product (switch the global provider to Deel).';
  return null;
}

/** Earliest start for an EOR hire: the local contract and onboarding take the vendor's onboarding days. */
export const eorOnboardDays = (state) => EOR_VENDORS[globalVendor(state) ?? 'deel']?.onboardDays ?? 3;

/** Founder hours for one pay run on the current US platform. */
export const runHours = (state) => PAYROLL_VENDORS[usPayrollVendor(state) ?? 'gusto'].runHours;

// ---------------------------------------------------------------------------
// Hooks from the People tick (ops.js / sim.js)
// ---------------------------------------------------------------------------

/** Accepted offer: Rippling's workflow provisions accounts before day 1 (no checklist click). */
export function stackOnHire(state, m) {
  if (m.kind === 'ai_agent' || m.kind === 'cofounder') return;
  const it = m.onboarding?.items;
  if (it?.accounts && it.accounts.done == null && ripplingAutomates(state, 'it')) Object.assign(it.accounts, { done: state.day, readyDay: Math.min(m.startDay, state.day + 1), byRippling: true });
}

/** First day: a US employee in a new state needs state payroll accounts (a PEO's accounts already cover it). */
export function stackOnStart(state, m) {
  if (m.kind === 'ai_agent' || m.kind === 'cofounder') return 0;
  const h = ensureStack(state);
  if (m.region !== 'us' || m.engagement !== 'employee' || !m.workState) return 0;
  const v = usPayrollVendor(state) ?? 'gusto';
  if (h.stateRegs[m.workState]) return 0;
  h.stateRegs[m.workState] = state.day;
  const hrs = PAYROLL_VENDORS[v].stateRegHours;
  return hrs ? chargeHours(state, hrs, `State payroll registration (${m.workState}): withholding + unemployment accounts`) : 0;
}

/** Exit: Rippling revokes every app the same day; on Gusto or a PEO it stays on the offboarding checklist. */
export function stackOnExit(state, m) {
  if (m.kind === 'ai_agent') return;
  if (!ripplingAutomates(state, 'it')) return;
  const rec = ensureOps(state).offboard.find((x) => x.memberId === m.id);
  if (rec && !rec.revoked) { rec.revoked = state.day; rec.byRippling = true; }
}

/** Pay day: founder minutes for the run (and the EOR approvals). */
export function stackPayRun(state, run) {
  if (!run) return 0;
  const eor = run.lines.some((l) => l.engagement === 'eor') ? 0.1 : 0;
  return chargeHours(state, runHours(state) + eor, `Payroll run (${payrollLabel(state)})`);
}

/** Month end: module and add-on creep, renewals, EOR local payroll errors. */
export function stackMonthEnd(state) {
  const p = P(state);
  if (!p) return;
  const h = ensureStack(state);
  const n = humansNow(state).length;
  // Rippling: unused modules are creep; renewal drops pending modules.
  if (h.rippling && usPayrollVendor(state) === 'rippling') {
    const r = h.rippling;
    r.flagged ??= {};
    for (const [k, since] of Object.entries(r.modules)) {
      const M = RIPPLING_MODULES[k];
      if (!M || M.required || r.flagged[k] || state.day - since < MODULE_GRACE_DAYS || M.useful(state, n)) continue;
      r.flagged[k] = state.day;
      const months = Math.max(1, Math.round((state.day - since) / 30.4));
      const wasted = round2(M.perUser * Math.max(1, usStaff(state).length) * months);
      logMistake(state, { functionId: 'people_ops', id: 'hr_module_creep', label: `Paying for a Rippling module nobody uses: ${M.label}`, app: 'people', key: `creep:${k}`, cost: { usd: wasted }, detail: `${M.label} has run ${months} month(s) at $${M.perUser}/user with nothing for it to do at ${n} people. It stays on the bill until the annual renewal: uncheck it in the HR stack now so it drops then.` });
    }
    if (state.day >= r.termEnd) {
      r.renewals = (r.renewals ?? 0) + 1;
      r.termEnd += 365;
      for (const k of r.pendingDrop ?? []) delete r.modules[k];
      r.pendingDrop = [];
    }
  }
  // Ashby add-ons that never got used.
  const a = p.ats;
  if (a?.vendor === 'ashby') for (const [k, on] of Object.entries(a.addOns ?? {})) {
    const A = ATS_ADDONS[k];
    if (!A || !on?.day || on.flagged || state.day - on.day < MODULE_GRACE_DAYS || A.useful(state, n)) continue;
    on.flagged = state.day;
    const months = Math.max(1, Math.round((state.day - on.day) / 30.4));
    logMistake(state, { functionId: 'hiring', id: 'ats_addon_creep', label: `Ashby add-on with no use: ${A.label}`, app: 'people', key: `atsaddon:${k}`, cost: { usd: round2(A.monthly * months) }, detail: `${A.label} at ${money(A.monthly)}/month for ${months} month(s) with nothing for it to do. Add an add-on when the pipeline needs it (panels, hourly roles, an SSO requirement).` });
  }
  // EOR local payroll errors (owned entities make fewer) [design].
  for (const m of humansNow(state)) {
    if (m.engagement !== 'eor' || m.status !== 'active') continue;
    const E = EOR_VENDORS[eorVendorOf(state, m)] ?? EOR_VENDORS.deel;
    const S = streamFor(state, `eorinc|${m.id}|${state.day}`);
    if (rng(S) >= EOR_INCIDENT.monthly * (E.incidentMult ?? 1)) continue;
    const usd = Math.round(EOR_INCIDENT.backPay[0] + rng(S) * (EOR_INCIDENT.backPay[1] - EOR_INCIDENT.backPay[0]));
    post(state, { amount: -usd, counterparty: E.label, description: `Local payroll correction (statutory pay or filing): ${m.name}`, category: 'payroll', method: 'payroll', meta: { app: 'people', memberId: m.id } });
    m.morale = clamp((m.morale ?? 70) - EOR_INCIDENT.morale, 0, 100);
    chargeHours(state, EOR_INCIDENT.hours, `EOR payroll error: ${m.name}`);
    notify(state, `${E.label} got ${m.name}'s local payroll wrong this month (a statutory payment or filing). Correction ${money(usd)}; ${m.name} is not happy.`, { type: 'warn', app: 'people' });
    (h.eorIncidents ??= []).push({ day: state.day, memberId: m.id, vendor: eorVendorOf(state, m), usd });
  }
  if (p.sourcing?.juicebox) {
    const mo = Math.floor(state.day / 30.4);
    if (p.sourcing.month !== mo) { p.sourcing.month = mo; p.sourcing.lookups = JUICEBOX.lookups; }
  }
}

/** Oyster's benefits bundle: a small morale lift for its EOR employees (weekly morale target) [design]. */
export const eorMoraleShift = (state, m) => (m.engagement === 'eor' ? (EOR_VENDORS[eorVendorOf(state, m)]?.moraleBonus ?? 0) : 0);

// ---------------------------------------------------------------------------
// ATS
// ---------------------------------------------------------------------------

export const atsVendor = (state) => (P(state)?.ats?.vendor ?? (P(state)?.ats?.ashby ? 'ashby' : 'none'));
export const atsSpec = (state) => ATS_VENDORS[atsVendor(state)] ?? ATS_VENDORS.none;

/** Choose the ATS. Ashby bills monthly; Greenhouse and Lever are annual contracts paid up front. Returns { hours, usd }. */
export function chooseAts(state, id) {
  const A = ATS_VENDORS[id];
  if (!A) throw new Error('Pick an ATS.');
  const p = P(state);
  ensureStack(state);
  const a = p.ats;
  const prev = a.vendor ?? 'none';
  if (prev === id) throw new Error(`Already on ${A.label}.`);
  if (prev === 'ashby' && a.recurringId) { const r = state.recurring.find((x) => x.id === a.recurringId); if (r) r.active = false; }
  for (const on of Object.values(a.addOns ?? {})) if (on?.recurringId) { const r = state.recurring.find((x) => x.id === on.recurringId); if (r) r.active = false; }
  a.addOns = {};
  let usd = 0;
  const heads = humansNow(state).length + 1;
  if (id === 'ashby') {
    a.ashby = true;
    a.recurringId = addRecurring(state, { vendor: 'Ashby', amount: A.monthly, category: 'software', dayOfMonth: 1, note: 'Ashby Foundations ATS (1,500 AI credits/month)' }).id;
    a.credits = A.credits;
    a.month = Math.floor(state.day / 30.4);
  } else {
    a.ashby = false;
    if (id !== 'none') {
      const [lo, hi] = id === 'greenhouse' ? (heads > 50 ? [A.annualMedian, A.annualMedian] : A.annualSmall) : A.annual;
      usd = Math.round((lo + rng(state) * (hi - lo)) / 100) * 100; // quote-only: the price rolls per run [design]
      if (id === 'lever') usd = Math.min(usd, 9000); // startup quotes cluster at the low end [design]
      post(state, { amount: -usd, counterparty: A.label, description: `${A.label} ATS annual contract`, category: 'software', method: 'card', meta: { app: 'people' } });
      a.contract = { vendor: id, day: state.day, usd, termEnd: state.day + 365 };
    }
  }
  a.vendor = id;
  a.vendorDay = state.day;
  const open = (p.jobs ?? []).filter((j) => j.status === 'open' || j.status === 'draft').length;
  if (id === 'greenhouse' && heads < 20) {
    logMistake(state, { functionId: 'hiring', id: 'ats_overkill', label: 'Greenhouse for a small team', app: 'people', key: 'ats_overkill', cost: { usd: Math.max(0, usd - 12 * ATS_VENDORS.ashby.monthly), hours: A.setupHours }, detail: `${heads} people: a ${money(usd)} annual contract and ~${A.setupHours}h of kits, scorecards and approvals for a handful of hires. Greenhouse pays off around 50+ employees with steady hiring; until then Ashby (or a structured scorecard in a spreadsheet) gives the same rigor.` });
  } else if (id !== 'none' && open === 0 && (p.hires ?? 0) < 2) {
    logMistake(state, { functionId: 'hiring', id: 'ats_too_early', label: 'ATS bought before there was anything to hire', app: 'people', key: 'ats_too_early', cost: { usd: id === 'ashby' ? A.monthly * 3 : usd }, detail: `No open role and ${p.hires ?? 0} hire(s) so far. A spreadsheet and calendar links handle the first one or two hires; buy the ATS when a pipeline exists.` });
  }
  return { hours: A.setupHours ?? 0, usd };
}

export function setAtsAddOn(state, key, on) {
  const p = P(state);
  ensureStack(state);
  if (atsVendor(state) !== 'ashby') throw new Error('Add-ons are Ashby items.');
  const A = ATS_ADDONS[key];
  if (!A) throw new Error('Unknown add-on.');
  const a = p.ats;
  const cur = a.addOns[key];
  if (on && !cur) a.addOns[key] = { day: state.day, recurringId: addRecurring(state, { vendor: 'Ashby', amount: A.monthly, category: 'software', dayOfMonth: 1, note: `Ashby add-on: ${A.label}` }).id };
  if (!on && cur) { const r = state.recurring.find((x) => x.id === cur.recurringId); if (r) r.active = false; delete a.addOns[key]; }
  return a.addOns;
}

/** Greenhouse refuses to schedule an interview without a kit and scorecard: the process comes first. */
export function atsScheduleGate(state, job) {
  if (atsSpec(state).kitEnforced && !job?.scorecard) return 'Greenhouse: build the interview kit and scorecard for this job before scheduling interviews (Hiring → job → Scorecard, ~3h).';
  return null;
}
/** Hours a scheduled interview costs in coordination on this ATS. */
export const schedulingHours = (state) => atsSpec(state).schedHours;
/** Hours an interview adds after it ends (Greenhouse: submit the scorecard in the kit). */
export const postInterviewHours = (state) => atsSpec(state).perInterviewHours ?? 0;
/** How fast idle candidates go cold on this ATS (reminders, self-scheduling, pipeline views). */
export const coldMult = (state) => atsSpec(state).coldMult;

/** Greenhouse Real Talent: flags a share of fraudulent applications on arrival. */
export function atsOnCandidate(state, c) {
  const A = atsSpec(state);
  if (!A.fraudFlag || !c.fraud || c.atsFlagged != null) return;
  const S = streamFor(state, `atsfraud|${c.id}`);
  c.atsFlagged = rng(S) < A.fraudFlag;
  if (c.atsFlagged) (c.redFlags ??= []).push('Greenhouse Real Talent: identity and application signals do not match (possible fraud or proxy applicant).');
}

/** Ashby pipeline report: per source, candidates → screened → interviewed → offers → hires, spend, cost per hire. */
export function pipelineReport(state) {
  const p = P(state);
  const by = {};
  for (const c of p.candidates ?? []) {
    const k = c.channel ?? 'unknown';
    const r = (by[k] ??= { channel: k, label: AGENCY[k]?.label ?? (k === 'juicebox' ? JUICEBOX.label : k), candidates: 0, screened: 0, interviewed: 0, offers: 0, hires: 0, spend: 0 });
    r.candidates++;
    if (['screened', 'interview_scheduled', 'interviewed', 'offer', 'hired', 'declined'].includes(c.stage) || c.screenDay != null) r.screened++;
    if (c.interview?.done) r.interviewed++;
    if (c.offer) r.offers++;
    if (c.stage === 'hired') r.hires++;
  }
  for (const t of state.bank?.txns ?? []) {
    if (!t.meta?.recruiting || !(t.amount < 0)) continue;
    const hit = Object.values(by).find((r) => t.counterparty === r.label);
    if (hit) hit.spend = round2(hit.spend - t.amount);
  }
  const rows = Object.values(by).map((r) => ({ ...r, yield: r.candidates ? round2(r.hires / r.candidates) : 0, costPerHire: r.hires ? round2(r.spend / r.hires) : null }));
  return rows.sort((x, y) => y.candidates - x.candidates);
}

/** Read the pipeline report (Ashby only: Greenhouse and Lever report counts, not source yield). */
export function reviewPipeline(state) {
  if (!atsSpec(state).analytics) throw new Error('Source-yield analytics are an Ashby feature; your ATS reports counts only.');
  ensureStack(state);
  P(state).ats.reviews.push(state.day);
  return { hours: 0.5, report: pipelineReport(state) };
}

/** Send a nurture campaign to past strong candidates (Lever is built around this; Ashby has a CRM too). */
export function sendNurture(state) {
  const A = atsSpec(state);
  if (!A.revive) throw new Error('No candidate CRM on this ATS.');
  ensureStack(state);
  P(state).ats.nurtures.push(state.day);
  return { hours: A.nurtureHours ?? 0.75 };
}

/**
 * A job opens: the CRM brings back past strong candidates for the same role (declined or withdrew earlier).
 * Nurtured in the last 90 days → full rate; otherwise a cold CRM brings back far fewer. Returns the revived.
 */
export function reviveFromCrm(state, job, composite) {
  const A = atsSpec(state);
  const p = P(state);
  if (!A.revive) return [];
  const nurtured = (p.ats?.nurtures ?? []).some((d) => state.day - d <= 90);
  const rate = A.revive * (nurtured ? 1 : 0.3);
  const out = [];
  for (const c of p.candidates ?? []) {
    if (out.length >= 2) break;
    if (c.role !== job.role || c.jobId === job.id || !['declined', 'withdrawn'].includes(c.stage) || c.revived || c.fraud) continue;
    if (composite(c) < 0.3) continue;
    const S = streamFor(state, `revive|${c.id}|${job.id}`);
    if (rng(S) >= rate) continue;
    c.revived = state.day;
    const copy = { ...structuredClone(c), id: uid('cand'), jobId: job.id, stage: 'new', appliedDay: state.day, lastTouchDay: state.day, offer: null, interview: null, evidence: [], negotiation: null, scorecard: null, aiEval: null, backgroundCheck: null, channel: c.channel, revivedFrom: c.id };
    p.candidates.unshift(copy);
    job.shortlisted = (job.shortlisted ?? 0) + 1;
    out.push(copy);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Juicebox-style AI sourcing
// ---------------------------------------------------------------------------

export function enableJuicebox(state) {
  const p = P(state);
  ensureStack(state);
  const s = p.sourcing;
  if (s.juicebox) throw new Error('Juicebox seat already active.');
  s.juicebox = true;
  s.recurringId = addRecurring(state, { vendor: 'Juicebox', amount: JUICEBOX.seat, category: 'software', dayOfMonth: 1, note: 'Juicebox seat (AI people search + sequences)' }).id;
  s.lookups = JUICEBOX.lookups;
  s.month = Math.floor(state.day / 30.4);
  return { hours: 0.5 };
}

/** How specific a sourcing brief is, 0..1, and what it is missing. Heuristic, deterministic. */
export function briefSpecificity(text) {
  const t = String(text ?? '').toLowerCase();
  const checks = [
    ['seniority', /\b(senior|staff|principal|lead|founding|junior|mid[- ]level|\d+\+?\s*(years|yrs))\b/],
    ['must-have skills', /\b(typescript|react|python|go|rust|postgres|kubernetes|aws|llm|rag|figma|saas|b2b|salesforce|hubspot|sql|ios|android|node|java|ml|evals|quota|outbound)\b/],
    ['location or time zone', /\b(remote|onsite|hybrid|utc|est|pst|cet|time ?zone|us-based|europe|latam|india|new york|san francisco|london|berlin|austin|overlap)\b/],
    ['companies or background', /\b(ex-|worked at|from (companies|startups)|like (stripe|linear|vercel|notion|datadog)|series [ab]|early[- ]stage|startup experience|yc)\b/],
    ['exclusions', /\b(not |no |exclude|excluding|avoid|without|except)\b/],
    ['outcome evidence', /\b(built|shipped|scaled|owned|launched|led|grew|closed|carried)\b/],
  ];
  const hit = checks.filter(([, re]) => re.test(t)).map(([k]) => k);
  const list = (t.match(/,/g) ?? []).length >= 3 ? 1 : 0;
  const score = clamp((hit.length + list * 0.5) / 6, 0, 1);
  return { score: round2(score), have: hit, missing: checks.map(([k]) => k).filter((k) => !hit.includes(k)) };
}

/** Run a natural-language search for a job: a shortlist whose match share follows the brief. Returns hours. */
export function juiceboxSearch(state, job, brief) {
  const s = P(state).sourcing;
  if (!s?.juicebox) throw new Error('Turn on a Juicebox seat first.');
  if (!job || job.status !== 'open') throw new Error('Open the job first.');
  const spec = briefSpecificity(brief);
  const matchShare = round2(0.25 + 0.6 * spec.score); // vague searches return look-alikes [design]
  job.juicebox = { day: state.day, brief: String(brief).slice(0, 500), spec: spec.score, missing: spec.missing, shortlist: JUICEBOX.shortlist, matchShare, sent: 0, replies: 0 };
  s.searches.push({ day: state.day, jobId: job.id, spec: spec.score });
  return { hours: JUICEBOX.briefHours + JUICEBOX.reviewHoursPer25, spec, matchShare };
}

/**
 * Send outreach to `count` shortlisted profiles. mode 'template' | 'sequence' | 'personalized'. Uses email lookups.
 * Replies become candidates in the normal pipeline. A generic blast from a vague brief burns the pool for 90 days.
 * Returns { sent, replies, hours }.
 */
export function juiceboxSend(state, job, { count = 25, mode = 'sequence' } = {}) {
  const p = P(state);
  const s = p.sourcing;
  if (!s?.juicebox) throw new Error('Turn on a Juicebox seat first.');
  const jb = job?.juicebox;
  if (!jb) throw new Error('Run a search for this job first.');
  if (!JUICEBOX.reply[mode]) throw new Error('Template, sequence or personalized.');
  const sent = Math.min(count, s.lookups, Math.max(0, jb.shortlist * 4 - jb.sent));
  if (sent <= 0) throw new Error(s.lookups <= 0 ? 'Email lookups used up for this month.' : 'Shortlist exhausted: refine the search.');
  s.lookups -= sent;
  jb.sent += sent;
  const burned = (s.burned[job.role] ?? -Infinity) > state.day;
  const rate = JUICEBOX.reply[mode] * (burned ? JUICEBOX.burnMult : 1);
  const S = streamFor(state, `jb|${job.id}|${state.day}|${jb.sent}`);
  let replies = 0;
  for (let i = 0; i < sent; i++) {
    const matched = rng(S) < jb.matchShare;
    if (rng(S) < rate * (matched ? 1.2 : 0.5)) {
      replies++;
      const c = makeCandidate(state, job, AGENCY.ai_sourcing_outbound, uid);
      c.channel = 'juicebox';
      c.sourcedMatch = matched;
      if (!matched) for (const k of Object.keys(c.traits)) if (k !== 'polish') c.traits[k] = clamp(c.traits[k] - 8, 1, 99); // look-alike profiles: weaker fit [design]
      p.candidates.unshift(c);
      job.shortlisted = (job.shortlisted ?? 0) + 1;
    }
  }
  jb.replies += replies;
  const hours = round2((sent * JUICEBOX.minutesPerMessage[mode]) / 60);
  if (mode === 'template' && jb.spec < 0.4 && sent >= 40) {
    s.burned[job.role] = state.day + JUICEBOX.burnDays;
    logMistake(state, { functionId: 'hiring', id: 'sourcing_spray', label: 'Generic sourcing blast from a vague search', app: 'people', key: `spray:${job.id}:${state.day}`, cost: { hours: round2(hours + 2) }, detail: `${sent} templated messages to a shortlist built from a vague brief (missing: ${jb.missing.join(', ')}). ${replies} replies; the people you spammed ignore the next message for ~3 months. Stellar: a specific brief (seniority, must-haves, location, example companies, exclusions), 20-30 personalised messages, two follow-ups.` });
  }
  return { sent, replies, hours };
}

// ---------------------------------------------------------------------------
// Grading: what the player chose vs what fits (feeds people_ops and hiring readers; shown in the HR stack tab)
// ---------------------------------------------------------------------------

/** HR + global stack fit, 0..1 with evidence and what a stellar operator would have done. null before any choice. */
export function hrStackScore(state) {
  const p = P(state);
  const h = p?.hrStack;
  if (!h?.payroll && !h?.eor) return null;
  const n = humansNow(state).length, us = usStaff(state).length;
  const v = usPayrollVendor(state);
  let s = 0.75;
  const evidence = [], coaching = [];
  const ids = new Set((state.mistakes ?? []).filter((x) => x.functionId === 'people_ops').map((x) => x.id));
  if (v === 'gusto') { s = n <= 15 ? 0.85 : 0.6; evidence.push(`Gusto for ${n} people${n > 15 ? ': manual IT and offboarding are getting expensive' : ''}.`); }
  if (v === 'rippling') {
    const r = h.rippling;
    const wf = r?.workflowsDay != null;
    s = n >= 8 || soc2Active(state) ? (wf ? 1 : 0.6) : wf ? 0.5 : 0.3;
    evidence.push(`Rippling with ${Object.keys(r?.modules ?? {}).length} module(s) for ${n} people${wf ? ', workflows live' : ', workflows never designed (paying for automation that does not fire)'}.`);
    if (!wf) coaching.push('Rippling only earns its fee once the hire and exit workflows exist: design them (4h) before the next hire.');
  }
  if (v === 'justworks') {
    s = us >= 2 && us <= 30 ? 0.85 : us < 2 ? 0.5 : 0.55;
    evidence.push(`Justworks PEO for ${us} US employee(s).`);
  }
  if (ids.has('hr_overkill')) { s -= 0.25; coaching.push('Under ~5 people with no SOC 2 programme, Gusto at $49 + $6/person is the fit; Rippling pays off with headcount x provisioning events or compliance evidence.'); }
  const creep = (state.mistakes ?? []).filter((x) => x.id === 'hr_module_creep').length;
  if (creep) { s -= Math.min(0.25, 0.08 * creep); coaching.push('Buy Rippling modules for today\'s team, not the rep\'s bundle: payroll + HRIS, then IT and devices once there are laptops to manage.'); }
  if (ids.has('hr_vendor_churn')) { s -= 0.3; coaching.push('Two payroll migrations in a year: pick the platform for the team you will have in 12-18 months.'); }
  else if (ids.has('hr_vendor_switch')) s -= 0.05;
  const eorPeople = humansNow(state).filter((m) => m.engagement === 'eor');
  if (eorPeople.length) evidence.push(`${eorPeople.length} EOR employee(s) via ${[...new Set(eorPeople.map((m) => EOR_VENDORS[eorVendorOf(state, m)]?.label))].join(', ')}.`);
  if (ids.has('access_not_revoked') && !ripplingAutomates(state, 'it')) { s -= 0.2; coaching.push('Access stayed on after someone left: revoke the same day by hand, or let Rippling\'s exit workflow do it.'); }
  if (ids.has('misclassified_foreign_contractor')) { s -= 0.15; coaching.push('A full-time person abroad belongs on an EOR (Deel, Remote, Oyster) or Deel Contractor of Record, not a contractor label.'); }
  const score = clamp(s, 0, 1);
  if (score < 0.8) coaching.push('What a stellar operator does: Gusto for a small US team, an EOR the first time someone abroad works full-time, and Rippling (payroll + IT + devices, workflows designed) once headcount or SOC 2 makes provisioning a weekly job.');
  return { score: round2(score), evidence, coaching };
}

/** ATS + sourcing fit, 0..1. null before any ATS or sourcing decision. */
export function atsScore(state) {
  const p = P(state);
  const a = p?.ats;
  const v = a?.vendor ?? 'none';
  const jb = p?.sourcing;
  if (v === 'none' && !jb?.juicebox && !(a?.reviews?.length)) return null;
  const ids = (state.mistakes ?? []).filter((x) => x.functionId === 'hiring').map((x) => x.id);
  const count = (id) => ids.filter((x) => x === id).length;
  let s = v === 'ashby' ? 0.75 : v === 'greenhouse' ? 0.6 : v === 'lever' ? 0.6 : 0.65;
  const evidence = [`ATS: ${ATS_VENDORS[v].label}.`], coaching = [];
  if (v === 'ashby') {
    const hiring = (p.jobs ?? []).some((j) => j.status === 'open');
    const recent = (a.reviews ?? []).filter((d) => state.day - d <= 45).length;
    if (recent) { s += 0.15; evidence.push('Reads the pipeline report (source yield, time in stage).'); }
    else if (hiring) coaching.push('You pay for Ashby\'s analytics: read the source-yield report while a role is open and cut channels with zero hires.');
  }
  if (count('ats_overkill')) { s -= 0.3; coaching.push('Greenhouse is built for 50+ employees; a small team gets the same structure from a scorecard written before the first interview.'); }
  if (count('ats_too_early')) s -= 0.1;
  if (count('ats_addon_creep')) { s -= Math.min(0.2, 0.08 * count('ats_addon_creep')); coaching.push('Turn on Ashby add-ons (texting, SSO, notetaker, panels) when the pipeline needs them.'); }
  if (jb?.searches?.length) {
    const avg = jb.searches.reduce((x, y) => x + y.spec, 0) / jb.searches.length;
    evidence.push(`${jb.searches.length} AI sourcing search(es), brief specificity ${Math.round(avg * 100)}%.`);
    s += avg >= 0.65 ? 0.1 : avg < 0.35 ? -0.1 : 0;
    if (avg < 0.65) coaching.push('Write the sourcing brief like a search query: seniority, must-have skills, location or time zone, example companies, exclusions, an outcome.');
  }
  if (count('sourcing_spray')) { s -= 0.2; coaching.push('A templated blast from a vague search burns the pool: send 20-30 personalised messages from a specific shortlist.'); }
  const score = clamp(s, 0, 1);
  if (score < 0.8) coaching.push('What a stellar operator does: Ashby (or a spreadsheet for the first hire), the pipeline report read weekly while hiring, add-ons only when needed, and specific sourcing briefs with personalised outreach.');
  return { score: round2(score), evidence, coaching };
}
