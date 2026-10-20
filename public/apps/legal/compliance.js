// SOC 2 as a compliance-automation workflow (Vanta / Drata style, gap item 11): pick a platform, connect
// integrations in phases, triage failing tests (each names a resource), adopt policies and decide which
// commitments you can really operate, run personnel tasks for the People team, then an auditor runs Type I /
// Type II and writes exceptions for anything that did not operate. Plus AI security-questionnaire answering with
// a human review step. Replaces the old single progress bar; state.apps.legal.soc2 keeps its string enum
// ('none' | 'type1_in_progress' | 'type1' | 'type2_in_progress' | 'type2') because Sales and Success read it.
//
// Sources: docs/research/tools/deep/d10-compliance-ats.md (Vanta/Drata workflows, failure modes, questionnaire
// quotas 25/144 per year, vendor claims "80% automated, up to 95% accepted" [vendor claim, unverified]),
// t6-legal-hr.md (Vanta $10k-80k/yr, Drata from ~$7.5k [unverified]), legal/catalog.js SOC2 (audit fees, timelines).
// Hours: 3-6 h/week of setup work in the first 6-8 weeks, 1-2 h/week steady state, questionnaire 2-4 h by hand vs
// 20-40 min with a reviewed AI draft (d10 [design]). Probabilities marked [design] are tuning values.
//
// Vendor paradigms (docs/research/tools/2026q4/support-people-compliance.md §4): Vanta = continuous tests across the
// broadest integration catalogue, trust center included, renewal escalators. Drata = nightly sync, deeper setup, owns
// the SafeBase trust center (bought Feb 2025, ~$250M, single-source) so more questionnaires are deflected. Secureframe
// = Vanta-like plus human compliance experts (policy review without overcommitments, fix guidance) and a visible
// ~$7.5K per additional framework. Oneleet = security substance first: a real in-house pentest, a vCISO and a partner
// CPA firm in one bundle; slower onboarding, thinner integrations, one framework at a time. The Delve-style templated
// shop is the trap: cheapest, "certified" in weeks, a pre-filled report from an auditor no TPRM team recognises; it
// passes a light review and fails a strict one (or a whistleblower story), and then every buyer who relied on it
// finds out. Delve itself is retired (YC cut ties April 2026, TechCrunch 2026-04-23).

import { notify, log, forceHours } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { mrr, activeSubs, cancel } from '../../core/stripe.js';
import { uid, rng, chance, clamp, round2, dayOfWeek, fmtDate, money, hash } from '../../core/util.js';
import { logMistake, registerOperatorReader, tierFromScore, unknownRead } from '../../core/operator.js';
import { OPERATOR_TIERS } from '../../data/operator-tiers.js';
import { SOC2 } from './catalog.js';
import { ensureLegal, legalIssues } from './sim.js';
import { workOnAsk } from '../success/engine.js';
import { workPaperwork, loseDeal, soc2ReportOnHand } from '../sales/model.js';
import { recordClaims, verify, penalize, sideRoll } from '../../core/integrity.js';
import { getSegment } from '../../data/buyer-segments.js';
import { ripplingAutomates, usPayrollVendor } from '../people/stack.js';

export const PLATFORMS = {
  vanta: {
    label: 'Vanta', status: 'keep', paradigm: 'Continuous monitoring, broadest integrations', annual: 10000, renewalMult: 1.4, retestDays: 0, questionnaires: 25, setupHours: 1,
    trustCenter: { label: 'Vanta Trust Center (included from Essentials)', deflect: 0.2 }, frameworkFee: 5000,
    note: 'Quote-only; ~$10k/yr entry, median ~$20k (third-party); renewals reported up ~40-100% [unverified]. Tests re-run continuously; scope changes lag up to an hour. The tool is not the audit: you still hire the auditor.',
  },
  drata: {
    label: 'Drata', status: 'keep', paradigm: 'Engineering-rigour controls + SafeBase trust center', annual: 7500, renewalMult: 1.5, retestDays: 1, questionnaires: 25, setupHours: 2,
    trustCenter: { label: 'SafeBase trust center (Drata-owned since Feb 2025)', deflect: 0.35 }, frameworkFee: 5000,
    note: 'Quote-only; ~$7.5k entry, median ~$24.6k (222 purchases, third-party). Autopilot syncs nightly, so fixes show the next day; setup goes deeper. Owns SafeBase: the strongest self-serve trust center.',
  },
  secureframe: {
    label: 'Secureframe', status: 'keep-alt', paradigm: 'Multi-framework + human compliance experts', annual: 10000, renewalMult: 1.3, retestDays: 0, questionnaires: 25, setupHours: 1.5,
    trustCenter: { label: 'Secureframe Trust', deflect: 0.15 }, frameworkFee: 7500, expertReview: true, fixMult: 0.8,
    note: '$7.5k-100k range, median ~$20k; ~$7.5k per additional framework; seed example ~$10k/yr + $8-12k Type I audit (third-party). A compliance manager reviews your policies (no overcommitments) and walks you through fixes.',
  },
  oneleet: {
    label: 'Oneleet', status: 'keep-alt', paradigm: 'Security substance: real pentest + vCISO + partner auditor', annual: 15000, renewalMult: 1.2, retestDays: 1, questionnaires: 0, setupHours: 3,
    trustCenter: { label: 'Oneleet trust page', deflect: 0.1 }, frameworkFee: 7500, includesAudit: 'partner', includesPentest: true, fixMult: 0.7,
    onboardDays: 14, unsupported: ['hris', 'tickets'], manualEvidenceHours: 0.5, oneFramework: true,
    note: 'Est. $12-60k/yr bundle (third-party): in-house pentest, vCISO and a partner CPA firm, one framework at a time; $33M Series A Oct 2025. Slower onboarding, fewer integrations, no AI questionnaire drafting [design]; the pentest finds real issues you then fix.',
  },
  templated: {
    label: "Templated 'AI compliance' shop (Delve-style)", status: 'trap', paradigm: '"AI does it": click through, report in weeks', annual: 6000, renewalMult: 1, retestDays: 0, questionnaires: 25, setupHours: 2,
    includesAudit: 'sham', fastReportDays: 21,
    note: 'Cheapest sticker, audit included, "certified" in ~3 weeks without fixing anything. The report is pre-filled boilerplate from an auditor enterprise TPRM teams do not recognise [design, modelled on the Delve allegations].',
  },
  delve: {
    label: 'Delve', status: 'dead', retired: true, annual: 0, renewalMult: 1, retestDays: 0, questionnaires: 0,
    note: 'Not available. Whistleblower posts (Mar 2026) alleged templated, pre-filled SOC 2 reports and sham auditors; YC cut ties (early Apr 2026); customers such as LiteLLM and Context AI re-certified with Vanta plus an independent auditor (TechCrunch, 2026-04-23). Delve disputes the claims.',
  },
};
export const ACTIVE_PLATFORMS = Object.keys(PLATFORMS).filter((k) => !PLATFORMS[k].retired);
// What a templated report costs once it is exposed [design]: strict security reviews check the auditor (AICPA peer
// review, boilerplate identical across clients) most of the time; light reviews rarely; a press story or a breach any month.
export const TEMPLATED = { strictCatch: 0.6, lightCatch: 0.1, monthlyPress: 0.015, churnP: 0.3 };
export const FRAMEWORKS = { iso27001: { label: 'ISO 27001' }, hipaa: { label: 'HIPAA' }, gdpr: { label: 'GDPR' } };
export const MANUAL = { weeklyHours: SOC2.weeklyHours, sprintHours: SOC2.sprintHours, sprintPerWeek: SOC2.sprintPerWeek, fixesPerWeek: 2 };
export const STEADY_HOURS = 1.5; // weekly alert triage on a platform [design, d10: 1-2 h/week]
export const AUDITORS = {
  boutique: { label: 'Boutique CPA firm', type1: SOC2.type1Audit, type2: SOC2.type2Audit, fieldworkDays: 35, reportDays: 21, detect: 0.8 },
  established: { label: 'Established CPA firm (known to enterprise TPRM teams)', type1: 16000, type2: 28000, fieldworkDays: 42, reportDays: 28, detect: 0.95 },
  partner: { label: "Oneleet's partner CPA firm (in the bundle)", type1: 0, type2: 0, fieldworkDays: 35, reportDays: 21, detect: 0.92, bundled: 'oneleet' },
  sham: { label: 'Unverified "partner auditor" (templated shop)', type1: 0, type2: 0, fieldworkDays: 7, reportDays: 14, detect: 0, bundled: 'templated' },
};
export const INTEGRATIONS = {
  cloud: { label: 'Cloud provider (AWS)', phase: 1, hours: 0.5 },
  idp: { label: 'Identity provider (Google Workspace)', phase: 1, hours: 0.5 },
  vcs: { label: 'Version control (GitHub)', phase: 2, hours: 0.25 },
  mdm: { label: 'Device management + agent (laptops)', phase: 2, hours: 0.75 },
  vuln: { label: 'Vulnerability scanner', phase: 2, hours: 0.5 },
  hris: { label: 'HRIS (Gusto / Rippling / Justworks)', phase: 3, hours: 0.25 },
  tickets: { label: 'Task tracker (Linear / Jira)', phase: 3, hours: 0.25 },
};
// Automated tests. failP = chance the setting is failing when first connected [design]; fixHours 15-30 min (d10).
export const TESTS = {
  cloud_root_mfa: { integ: 'cloud', control: 'CC6.1 Logical access', name: 'MFA on cloud root/admin accounts', failP: 0.7, fixHours: 0.25, resource: 'root account (AWS)' },
  cloud_logging: { integ: 'cloud', control: 'CC7.2 Monitoring', name: 'Audit logging enabled in all regions', failP: 0.5, fixHours: 0.5, resource: 'CloudTrail: us-west-2, eu-central-1' },
  cloud_encryption: { integ: 'cloud', control: 'CC6.7 Encryption', name: 'Databases encrypted at rest', failP: 0.3, fixHours: 0.5, resource: 'rds: analytics-replica' },
  cloud_backups: { integ: 'cloud', control: 'A1.2 Backups', name: 'Automated database backups enabled', failP: 0.4, fixHours: 0.25, resource: 'rds: prod-main' },
  cloud_ssh: { integ: 'cloud', control: 'CC6.6 Network', name: 'No security group open to 0.0.0.0/0 on SSH', failP: 0.4, fixHours: 0.25, resource: 'sg-0a3f (bastion-old)' },
  cloud_sandbox: { integ: 'cloud', control: 'Scope', name: 'Sandbox account resources (public bucket, no logging)', failP: 1, fixHours: 2.5, resource: 'aws: sandbox-dev account', scopeOut: true },
  idp_mfa: { integ: 'idp', control: 'CC6.1 Logical access', name: 'MFA enforced for all users', failP: 0.6, fixHours: 0.5, resource: 'Google Workspace: 2-step verification not enforced' },
  idp_stale: { integ: 'idp', control: 'CC6.2 Offboarding', name: 'Offboarded accounts disabled within 24h', failP: 0, fixHours: 0.25, resource: 'former team member still active', dynamic: true },
  vcs_branch: { integ: 'vcs', control: 'CC8.1 Change management', name: 'Branch protection and required review on main', failP: 0.6, fixHours: 0.25, resource: 'github: app/main', dynamic: true },
  vcs_deps: { integ: 'vcs', control: 'CC7.1 Vulnerabilities', name: 'Dependency vulnerability alerts enabled', failP: 0.5, fixHours: 0.25, resource: 'github: app' },
  mdm_disk: { integ: 'mdm', control: 'CC6.7 Encryption', name: 'Disk encryption on every laptop', failP: 0.4, fixHours: 0.25, resource: 'laptop without FileVault', dynamic: true },
  mdm_lock: { integ: 'mdm', control: 'CC6.1 Logical access', name: 'Screen lock within 15 minutes', failP: 0.4, fixHours: 0.25, resource: 'laptops without screen-lock policy' },
  vuln_crit: { integ: 'vuln', control: 'CC7.1 Vulnerabilities', name: 'Critical vulnerabilities patched within 30 days', failP: 0.5, fixHours: 0.5, resource: 'CVE in base image', recurring: 0.12 },
  hris_bg: { integ: 'hris', control: 'CC1.4 Personnel', name: 'Background checks for employees', failP: 0, fixHours: 0, resource: 'employees without a check (order in People)', dynamic: true, external: 'people' },
  tickets_change: { integ: 'tickets', control: 'CC8.1 Change management', name: 'Production changes linked to tickets', failP: 0.5, fixHours: 0.25, resource: 'deploys without a linked ticket' },
};
// Policy commitments. Templates include what SOC 2 needs; AI generators also add commitments a 2-person company
// cannot operate (24/7 SOC, daily manual log review) [design]. Kept-but-not-operated commitments become audit
// exceptions; removed required ones become control gaps.
export const COMMITMENTS = {
  mfa: { label: 'MFA required on all systems', required: true },
  access_review: { label: 'Quarterly user access reviews', required: true, action: { label: 'Run an access review', hours: 1, everyDays: 100 } },
  training: { label: 'Annual security awareness training for all staff', required: true },
  encryption: { label: 'Laptops and databases encrypted', required: true },
  backup_restore: { label: 'Backups restored and tested at least annually', required: true, action: { label: 'Run a backup restore drill', hours: 2, everyDays: 365 } },
  vendor_review: { label: 'Annual vendor risk review (subprocessors)', required: true, action: { label: 'Review vendors and subprocessors', hours: 1.5, everyDays: 365 } },
  ir_tabletop: { label: 'Annual incident-response tabletop exercise', required: true, action: { label: 'Run an incident-response tabletop', hours: 2, everyDays: 365 } },
  bgcheck: { label: 'Background checks for new employees', required: true },
  pentest: { label: 'Annual third-party penetration test', required: false, action: { label: 'Commission a penetration test', hours: 2, everyDays: 365, usd: SOC2.pentest } },
  soc247: { label: '24/7 security operations centre monitoring', required: false, trap: true },
  daily_logs: { label: 'Daily manual review of all security logs', required: false, trap: true },
};
export const POLICY_HOURS = { template: 2, ai: 0.5, review: 1.5 }; // whole pack of ~8 policies [design]
export const PERSONNEL = { sendHours: 0.25, founderHours: 1, weeklyDone: 0.5, contractorWeeklyDone: 0.35 };

// Security questionnaire bank: each question is about one fact the company either does or does not do.
export const QUESTIONS = [
  { id: 'q_mfa', q: 'Is MFA enforced for all workforce accounts?', fact: 'mfa' },
  { id: 'q_enc', q: 'Is customer data encrypted at rest and in transit?', fact: 'encryption' },
  { id: 'q_soc2', q: 'Do you have a current SOC 2 Type II report?', fact: 'soc2_type2' },
  { id: 'q_soc2any', q: 'Have you completed any SOC 2 audit?', fact: 'soc2_any' },
  { id: 'q_pentest', q: 'Is a third-party penetration test performed at least annually?', fact: 'pentest' },
  { id: 'q_247', q: 'Do you have 24/7 security monitoring with a staffed SOC?', fact: 'soc247' },
  { id: 'q_bg', q: 'Are background checks performed on all employees with data access?', fact: 'bgcheck' },
  { id: 'q_ir', q: 'Is your incident response plan tested at least annually?', fact: 'ir_tabletop' },
  { id: 'q_backup', q: 'Are backups tested by restoring them?', fact: 'backup_restore' },
  { id: 'q_access', q: 'Are user access reviews performed at least quarterly?', fact: 'access_review' },
  { id: 'q_vendor', q: 'Do you assess the security of your subprocessors annually?', fact: 'vendor_review' },
  { id: 'q_training', q: 'Do all staff complete annual security awareness training?', fact: 'training' },
  { id: 'q_dpa', q: 'Will you sign our DPA and list your subprocessors?', fact: 'dpa' },
  { id: 'q_offboard', q: 'Is access removed within 24 hours when someone leaves?', fact: 'offboarding' },
  { id: 'q_change', q: 'Are production changes peer-reviewed before deploy?', fact: 'change_review' },
  { id: 'q_aitrain', q: 'Do you use customer data to train AI models?', fact: 'no_ai_training', invert: true },
];
export const Q = { shown: 12, manualHoursPerQ: 0.25, aiBaseHours: 0.3, reviewHoursPerQ: 0.05, detectP: 0.2, aiHallucinate: 0.35 }; // [design]

export function ensureCompliance(state) {
  const L = ensureLegal(state);
  L.compliance ??= {
    platform: null, platformDay: null, renewals: 0, recurringId: null,
    integrations: {}, tests: {}, policies: null, commitments: {}, actions: {}, personnel: {}, onboardingSent: false,
    auditor: null, audit: null, reports: [], questionnaires: [], library: {}, detections: [], quotaYear: null, quotaUsed: 0,
    hours: { setup: 0, fixes: 0, steady: 0, questionnaires: 0 },
  };
  const c = L.compliance;
  c.history ??= []; c.frameworks ??= {}; c.trust ??= null; c.deflectTried ??= {}; c.templated ??= null;
  return c;
}

const C = ensureCompliance;
const peopleHumans = (state) => (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.status === 'active');

// ---------------------------------------------------------------------------
// Platform, integrations, tests
// ---------------------------------------------------------------------------

/** Evidence that a real buyer needs SOC 2 now (open deal paperwork, a security ask, or enterprise customers). */
export function soc2Demand(state) {
  const deals = (state.apps.crm?.deals ?? []).filter((d) => !['won', 'lost'].includes(d.stage) && (d.paperwork ?? []).some((it) => /^soc2_|security_questionnaire|sig_|caiq/.test(it.id) && it.status === 'open'));
  const asks = (state.apps.success?.asks ?? []).filter((a) => a.kind === 'security_questionnaire' && a.status === 'open');
  const ent = state.company.model === 'ent' && activeSubs(state).length >= 2;
  return { deals: deals.length, asks: asks.length, ent, any: deals.length > 0 || asks.length > 0 || ent };
}

export function choosePlatform(state, id) {
  const P = PLATFORMS[id];
  if (!P) throw new Error('Pick a platform.');
  if (P.retired) throw new Error(`${P.label} is not available: ${P.note}`);
  const c = C(state);
  if (c.platform) throw new Error(`Already on ${PLATFORMS[c.platform].label}.`);
  const demand = soc2Demand(state);
  post(state, { amount: -P.annual, counterparty: P.label.replace(/ \(.*\)$/, ''), description: `${P.label} compliance platform (annual)`, category: 'software', method: 'card', meta: { app: 'legal', item: 'Compliance automation platform' } });
  Object.assign(c, { platform: id, platformDay: state.day, renewals: 0, demandAtPurchase: demand, mrrAtPurchase: round2(mrr(state)) });
  c.history.push({ platform: id, day: state.day, demand: demand.any, strict: strictDemand(state) });
  if (P.includesAudit) c.auditor = P.includesAudit;
  if (P.onboardDays) c.readyDay = state.day + P.onboardDays;
  if (P.includesPentest) c.pentestDueDay = state.day + (P.onboardDays ?? 0) + 14; // the bundled pentest runs after onboarding [design]
  if (!demand.any && mrr(state) < 5000) {
    logMistake(state, { functionId: 'legal_hygiene', id: 'soc2_too_early', label: 'Compliance platform bought before any buyer asked', app: 'legal', cost: { usd: P.annual }, detail: `${P.label} at ${money(mrr(state))} MRR with no open security review or questionnaire: ${money(P.annual)}/yr for controls no buyer is asking about yet.` });
  }
  log(state, 'info', `Compliance platform: ${P.label}.`, 'legal');
  return c;
}

/** Connect an integration; reveals its tests. A few fail to connect the first time (admin permission). */
export function connectIntegration(state, key) {
  const c = C(state);
  const I = INTEGRATIONS[key];
  if (!I) throw new Error('Unknown integration.');
  if (!c.platform) throw new Error('Pick a compliance platform first (or run the audit manually).');
  if (c.integrations[key]?.status === 'connected') throw new Error('Already connected.');
  const P = PLATFORMS[c.platform];
  if (c.readyDay != null && state.day < c.readyDay) throw new Error(`${P.label} onboarding (vCISO kickoff, scoping) finishes ${fmtDate(state, c.readyDay)}; integrations open then.`);
  if (P.unsupported?.includes(key)) throw new Error(`${P.label} has no ${I.label} integration: that evidence is uploaded by hand (~${P.manualEvidenceHours}h a week).`);
  if (key === 'hris' && !usPayrollVendor(state)) throw new Error('Set up US payroll (Gusto, Rippling or Justworks) in People first.');
  if (chance(state, 0.12) && !c.integrations[key]?.retried) {
    c.integrations[key] = { status: 'error', day: state.day, retried: true, error: 'Needs an admin role / read-only service account. Grant it and retry.' };
    return c.integrations[key];
  }
  c.integrations[key] = { status: 'connected', day: state.day };
  for (const [id, T] of Object.entries(TESTS)) {
    if (T.integ !== key) continue;
    if (c.tests[id]) { c.tests[id].hidden = false; c.tests[id].visibleDay = state.day; continue; } // reality was there all along
    const failing = T.dynamic ? false : chance(state, T.failP);
    c.tests[id] = { status: failing ? 'fail' : 'pass', since: state.day, failDays: 0, scoped: true, visibleDay: state.day };
  }
  syncDynamicTests(state);
  return c.integrations[key];
}

/** Tests whose result comes from the rest of the game (People offboarding, background checks, AI review). */
export function syncDynamicTests(state) {
  const c = C(state);
  const t = c.tests;
  const people = state.apps.people;
  const set = (id, fail, resource) => {
    if (!t[id]) return;
    const prev = t[id].status;
    if (fail && prev !== 'fail') Object.assign(t[id], { status: 'fail', since: state.day, resource, visibleDay: state.day + (PLATFORMS[c.platform]?.retestDays ?? 0) });
    else if (!fail && prev === 'fail' && TESTS[id].external) Object.assign(t[id], { status: 'pass', since: state.day, resource: null });
    if (fail) t[id].resource = resource;
  };
  // Rippling's exit workflow deprovisions every app the day someone leaves; its MDM enrolls every new laptop (people/stack.js).
  const rip = people?.hrStack?.rippling;
  if (rip?.workflowsDay != null && ripplingAutomates(state, 'it')) for (const m of people.members ?? []) if (m.status === 'gone' && m.endDay != null && m.endDay >= rip.workflowsDay) (c.offboarded ??= {})[m.id] ??= m.endDay;
  if (ripplingAutomates(state, 'devices')) for (const m of peopleHumans(state)) (c.devices ??= {})[m.id] ??= Math.max(m.startDay ?? 0, rip.workflowsDay ?? 0);
  if (t.idp_stale) {
    const stale = (people?.members ?? []).filter((m) => m.status === 'gone' && m.kind !== 'ai_agent' && m.endDay != null && state.day - m.endDay <= 365 && !c.offboarded?.[m.id]);
    if (stale.length) set('idp_stale', true, `${stale.map((m) => m.name).slice(0, 3).join(', ')} still active in Google Workspace`);
  }
  if (t.hris_bg) {
    const missing = peopleHumans(state).filter((m) => m.engagement !== 'contractor' && m.provenance && !(m.provenance.backgroundCheck?.result === 'clear'));
    set('hris_bg', missing.length > 0, missing.length ? `${missing.map((m) => m.name).slice(0, 3).join(', ')} hired without a background check` : null);
  }
  if (t.vcs_branch && people?.aiReview === false && t.vcs_branch.status === 'pass' && !t.vcs_branch.aiNoted) {
    t.vcs_branch.aiNoted = true;
    set('vcs_branch', true, 'AI-agent changes merged to main without review');
  }
  if (t.mdm_disk) {
    const newcomers = peopleHumans(state).filter((m) => !c.devices?.[m.id] && state.day - m.startDay >= 0);
    if (newcomers.length && c.integrations.mdm?.status === 'connected') set('mdm_disk', true, `${newcomers.map((m) => m.name).slice(0, 3).join(', ')}: laptop not enrolled / not encrypted`);
  }
}

/** Fix a failing test (or scope a sandbox resource out with a reason). Returns { hours }. */
export function fixTest(state, id, { scopeOut = false, reason = '' } = {}) {
  const c = C(state);
  const t = c.tests[id], T = TESTS[id];
  if (!t || t.status !== 'fail') throw new Error('That test is not failing.');
  if (T.external) throw new Error('Fix this in People (order background checks).');
  if (scopeOut) {
    if (String(reason).trim().length < 15) throw new Error('Auditors scrutinise exclusions: give a specific reason.');
    Object.assign(t, { status: 'pass', scoped: false, scopeReason: String(reason).slice(0, 300), since: state.day });
    if (!T.scopeOut) logMistake(state, { functionId: 'legal_hygiene', id: 'scope_out_prod', label: 'Production resource scoped out of SOC 2', app: 'legal', cost: { usd: 0 }, detail: `${T.name}: excluding an in-scope resource hides a real control failure; auditors flag unjustified exclusions.` });
    return { hours: 0.1 };
  }
  if (id === 'idp_stale') { c.offboarded ??= {}; for (const m of state.apps.people?.members ?? []) if (m.status === 'gone') c.offboarded[m.id] = state.day; }
  if (id === 'mdm_disk') { c.devices ??= {}; for (const m of peopleHumans(state)) c.devices[m.id] = state.day; }
  if (id === 'vcs_branch' && state.apps.people?.aiReview === false) { t.aiNoted = true; }
  Object.assign(t, { status: 'pass', since: state.day, fixedDay: state.day, resource: null, visibleDay: state.day + (PLATFORMS[c.platform]?.retestDays ?? 0) });
  const hours = round2(T.fixHours * (PLATFORMS[c.platform]?.fixMult ?? 1)); // expert / vCISO guidance makes fixes faster
  c.hours.fixes = round2(c.hours.fixes + hours);
  return { hours };
}

// ---------------------------------------------------------------------------
// Policies, commitments, personnel
// ---------------------------------------------------------------------------

/** Generate the policy pack. kind 'template' (edit by hand) or 'ai' (agentic generator; overcommits). */
export function generatePolicies(state, kind) {
  const c = C(state);
  if (!['template', 'ai'].includes(kind)) throw new Error('Template or AI generator.');
  if (kind === 'ai' && !c.platform) throw new Error('The AI policy generator comes with a compliance platform.');
  const keys = Object.keys(COMMITMENTS).filter((k) => !COMMITMENTS[k].trap);
  // Secureframe's experts and Oneleet's vCISO size the policies to the company; a bare generator overcommits.
  const sized = PLATFORMS[c.platform]?.expertReview || PLATFORMS[c.platform]?.includesPentest;
  if (kind === 'ai') { const a = chance(state, 0.6), b = chance(state, 0.5); if (a && !sized) keys.push('soc247'); if (b && !sized) keys.push('daily_logs'); }
  c.policies = { kind, day: state.day, status: 'draft', reviewed: false };
  c.commitments = Object.fromEntries(keys.map((k) => [k, { kept: true, day: state.day }]));
  return c.policies;
}

/** Review: keep only the commitments you will operate. keep = [commitmentId]. */
export function reviewPolicies(state, keep) {
  const c = C(state);
  if (!c.policies) throw new Error('Generate the policies first.');
  for (const k of Object.keys(c.commitments)) c.commitments[k].kept = keep.includes(k);
  c.policies.reviewed = true;
  return approvePolicies(state);
}

export function approvePolicies(state) {
  const c = C(state);
  if (!c.policies) throw new Error('Generate the policies first.');
  c.policies.status = 'approved';
  c.policies.approvedDay = state.day;
  return c.policies;
}

/** Recurring control activities (access review, restore drill, vendor review, tabletop, pentest). */
export function runControlAction(state, key) {
  const K = COMMITMENTS[key];
  if (!K?.action) throw new Error('Nothing to run for that commitment.');
  const c = C(state);
  if (K.action.usd) post(state, { amount: -K.action.usd, counterparty: 'Pentest firm', description: 'Penetration test', category: 'legal', method: 'ach', meta: { app: 'legal', item: 'Penetration test' } });
  c.actions[key] = state.day;
  if (key === 'pentest' && state.apps.legal.soc2Plan) state.apps.legal.soc2Plan.pentestDay = state.day;
  return { hours: K.action.hours };
}

/** Is a commitment actually operated today? */
export function operated(state, key) {
  const c = C(state);
  const tp = (id) => !c.tests[id] || (c.tests[id].status === 'pass');
  const fresh = (k) => c.actions[k] != null && state.day - c.actions[k] <= (COMMITMENTS[k].action?.everyDays ?? 365);
  switch (key) {
    case 'mfa': return Boolean(c.tests.idp_mfa && c.tests.cloud_root_mfa) && tp('idp_mfa') && tp('cloud_root_mfa');
    case 'encryption': return Boolean(c.tests.cloud_encryption) && tp('cloud_encryption') && (!c.tests.mdm_disk || tp('mdm_disk'));
    case 'training': return personnelDone(state).training;
    case 'bgcheck': return !c.tests.hris_bg || tp('hris_bg');
    case 'soc247': case 'daily_logs': return false;
    case 'pentest': return fresh('pentest') || (state.apps.legal.soc2Plan?.pentestDay != null && state.day - state.apps.legal.soc2Plan.pentestDay <= 365);
    default: return fresh(key);
  }
}

export function sendPersonnelOnboarding(state) {
  const c = C(state);
  c.onboardingSent = true;
  c.onboardingDay = state.day;
  for (const m of peopleHumans(state)) c.personnel[m.id] ??= { policies: false, training: false, device: false, since: state.day };
  return c;
}

export function completeOwnTasks(state) {
  const c = C(state);
  c.personnel.founder = { policies: true, training: true, device: true, since: state.day };
  return c.personnel.founder;
}

/** { done, total, training, list } over founder + active team. */
export function personnelDone(state) {
  const c = C(state);
  const people = [{ id: 'founder', name: state.founder?.name ?? 'You' }, ...peopleHumans(state)];
  const list = people.map((m) => ({ id: m.id, name: m.name, tasks: c.personnel[m.id] ?? { policies: false, training: false, device: false } }));
  const done = list.filter((x) => x.tasks.policies && x.tasks.training && x.tasks.device).length;
  return { done, total: list.length, training: list.every((x) => x.tasks.training), list };
}

// ---------------------------------------------------------------------------
// Readiness, audit
// ---------------------------------------------------------------------------

export function readiness(state) {
  const c = C(state);
  const tests = Object.entries(c.tests).filter(([, t]) => t.scoped);
  const failing = tests.filter(([, t]) => t.status === 'fail').map(([id]) => id);
  const pd = personnelDone(state);
  const kept = Object.entries(c.commitments).filter(([, v]) => v.kept).map(([k]) => k);
  const gaps = Object.keys(COMMITMENTS).filter((k) => COMMITMENTS[k].required && c.policies && !kept.includes(k));
  const notOperated = kept.filter((k) => !operated(state, k));
  const integ = Object.values(c.integrations).filter((x) => x.status === 'connected').length;
  const parts = {
    integrations: integ / Object.keys(INTEGRATIONS).length,
    tests: tests.length ? 1 - failing.length / tests.length : 0,
    policies: c.policies?.status === 'approved' ? (gaps.length ? 0.5 : 1) : 0,
    personnel: pd.total ? pd.done / pd.total : 0,
    commitments: kept.length ? 1 - notOperated.length / kept.length : 0,
  };
  const score = round2((parts.integrations * 0.15 + parts.tests * 0.3 + parts.policies * 0.2 + parts.personnel * 0.15 + parts.commitments * 0.2));
  return { score, parts, failing, gaps, notOperated, personnel: pd };
}

export function chooseAuditor(state, firm) {
  if (!AUDITORS[firm]) throw new Error('Pick an audit firm.');
  const c = C(state);
  const bundled = PLATFORMS[c.platform]?.includesAudit;
  if (bundled) { c.auditor = bundled; return bundled; } // the bundle's auditor runs the audit
  if (AUDITORS[firm].bundled) throw new Error(`${AUDITORS[firm].label} only audits ${PLATFORMS[AUDITORS[firm].bundled].label} customers.`);
  c.auditor = firm;
  return firm;
}

/**
 * Start a SOC 2 audit (Type I point-in-time, Type II over a window). Without a platform this is the manual path
 * (spreadsheets and screenshots: ~8 h/week + a 20 h sprint, fixes found by hand). API kept from the old progress
 * bar: startSoc2(state, 'type1' | 'type2', { windowMonths }).
 */
export function startSoc2(state, type, { windowMonths = 3, pentest = false } = {}) {
  const L = ensureLegal(state);
  const c = C(state);
  if (type === 'type1' && L.soc2 !== 'none') throw new Error('SOC 2 already underway.');
  // 'type2' → renewal: the annual re-audit (the last report stays valid with buyers while the new window runs).
  if (type === 'type2' && !['none', 'type1', 'type2'].includes(L.soc2)) throw new Error('A Type II is already underway.');
  const renewal = type === 'type2' && L.soc2 === 'type2';
  if (![3, 6, 12].includes(windowMonths)) throw new Error('Observation window: 3, 6 or 12 months.');
  c.auditor ??= 'boutique';
  const A = AUDITORS[c.auditor];
  if (pentest) runControlAction(state, 'pentest');
  const manual = !c.platform;
  if (manual) seedReality(state);
  const plan = L.soc2Plan ?? {};
  const prep = manual ? SOC2.type1Days - A.fieldworkDays - A.reportDays : 0; // manual evidence collection before fieldwork
  const fast = PLATFORMS[c.platform]?.fastReportDays;
  if (fast) {
    // Templated shop: the "audit" is a pre-filled report; nothing you do (or do not do) changes it.
    Object.assign(plan, { type, startDay: state.day, manual: false, templated: true, windowMonths: type === 'type2' ? windowMonths : undefined, snapshotDay: state.day + Math.round(fast / 2), readyDay: state.day + fast + (type === 'type2' ? 9 : 0), renewal });
    delete plan.findings; delete plan.doneDay;
    L.soc2 = type === 'type1' ? 'type1_in_progress' : 'type2_in_progress';
  } else if (type === 'type1') {
    Object.assign(plan, { type, startDay: state.day, manual, snapshotDay: state.day + prep + A.fieldworkDays, readyDay: state.day + prep + A.fieldworkDays + A.reportDays });
    L.soc2 = 'type1_in_progress';
  } else {
    const ready = L.soc2 === 'type1' || renewal ? 0 : manual ? SOC2.readinessDays : 0;
    const windowEnd = state.day + ready + windowMonths * 30;
    Object.assign(plan, { type, startDay: state.day, manual, windowMonths, windowStart: state.day + ready, snapshotDay: windowEnd, readyDay: windowEnd + SOC2.fieldworkReportDays, renewal });
    delete plan.findings; delete plan.doneDay; // a new window gets its own fieldwork snapshot (not the last audit's findings)
    if (renewal) for (const t of Object.values(c.tests ?? {})) t.failDays = 0;
    L.soc2 = 'type2_in_progress';
  }
  plan.sprintLeft = manual ? (plan.sprintLeft ?? 0) + MANUAL.sprintHours : 0;
  plan.hoursSpent ??= 0;
  plan.auditor = c.auditor;
  L.soc2Plan = plan;
  c.audit = { type, startDay: state.day, auditor: c.auditor, findings: [] };
  const d = soc2Demand(state);
  if (d.deals > 0 && !c.platform && !renewal) logMistake(state, { functionId: 'legal_hygiene', id: 'soc2_in_deal', label: 'SOC 2 started inside a live deal', app: 'legal', delayed: true, cost: { days: 90 }, detail: `${d.deals} open deal(s) already need the report; a first audit takes months, so the deal waits or walks.` });
  return plan;
}

/** The company's real control settings before anything is connected (hidden until an integration shows them). */
export function seedReality(state) {
  const c = C(state);
  for (const [id, T] of Object.entries(TESTS)) if (!c.tests[id] && !['mdm_disk', 'mdm_lock'].includes(id)) {
    c.tests[id] = { status: T.dynamic ? 'pass' : chance(state, T.failP) ? 'fail' : 'pass', since: state.day, failDays: 0, scoped: true, hidden: true };
  }
  syncDynamicTests(state);
}

function exceptionsNow(state, { windowFailDays = null } = {}) {
  const c = C(state);
  const out = [];
  for (const [id, t] of Object.entries(c.tests)) {
    if (!t.scoped) continue;
    const failing = windowFailDays != null ? (t.failDays ?? 0) > windowFailDays : t.status === 'fail';
    if (failing) out.push({ kind: 'test', id, text: `${TESTS[id].control}: ${TESTS[id].name} was not operating${t.resource || TESTS[id].resource ? ` (${t.resource ?? TESTS[id].resource})` : ''}.` });
  }
  if (!c.policies || c.policies.status !== 'approved') out.push({ kind: 'gap', id: 'policies', text: 'No approved security policies.' });
  else {
    for (const [k, v] of Object.entries(c.commitments)) {
      if (v.kept && !operated(state, k)) out.push({ kind: 'commitment', id: k, text: `Policy commits to "${COMMITMENTS[k].label}" but there is no evidence it happened.` });
      if (!v.kept && COMMITMENTS[k].required) out.push({ kind: 'gap', id: k, text: `No control for "${COMMITMENTS[k].label}" (required).` });
    }
  }
  const pd = personnelDone(state);
  if (pd.done < pd.total) out.push({ kind: 'personnel', id: 'personnel', text: `${pd.total - pd.done} of ${pd.total} people had not accepted policies, done training or enrolled a device.` });
  return out;
}

function issueReport(state, L, plan) {
  const c = C(state);
  const A = AUDITORS[plan.auditor ?? 'boutique'];
  const t1 = plan.type === 'type1';
  const templated = Boolean(plan.templated);
  const found = templated ? [] : (plan.findings ?? []).filter(() => chance(state, A.detect)); // a pre-filled report lists no exceptions
  const fee = t1 ? A.type1 : A.type2;
  if (fee > 0) post(state, { amount: -fee, counterparty: A.label, description: `SOC 2 ${t1 ? 'Type I' : 'Type II'} audit`, category: 'legal', method: 'ach', meta: { app: 'legal', item: `SOC 2 ${t1 ? 'Type I' : 'Type II'} audit` } });
  const gaps = found.filter((f) => f.kind === 'gap').length;
  const opinion = found.length === 0 ? 'clean' : found.length >= 4 || gaps > 0 ? 'qualified' : 'exceptions';
  L.soc2 = t1 ? 'type1' : 'type2';
  plan.doneDay = state.day;
  const report = { id: uid('soc2r'), type: plan.type, day: state.day, auditor: plan.auditor, exceptions: found, opinion, ...(templated ? { templated: true, realFindings: (plan.findings ?? []).length } : {}) };
  c.reports.push(report);
  if (templated) {
    // A latent statement to every buyer the report reaches: "an independent auditor tested our controls". It is not true.
    const [rec] = recordClaims(state, { audience: 'customer', recipientId: 'soc2_report', channel: 'soc2_report', claims: [{ metric: 'soc2_audit', claimed: true, truth: false, text: 'SOC 2 report from a templated audit (pre-filled controls, unverified auditor)', kind: 'hygiene' }] });
    c.templated = { reportId: report.id, day: state.day, claimId: rec?.id ?? null, exposed: false, checkedDeals: {} };
  }
  L.soc2Report = report;
  L.soc2Qualified = opinion === 'qualified';
  c.audit = null;
  if (opinion === 'clean') notify(state, `SOC 2 ${t1 ? 'Type I' : 'Type II'} report issued with a clean opinion. Share it under NDA from your trust center.`, { type: 'good', app: 'legal' });
  else {
    notify(state, `SOC 2 ${t1 ? 'Type I' : 'Type II'} report issued with ${found.length} exception(s)${opinion === 'qualified' ? ' and a QUALIFIED opinion: strict security teams will not accept it' : ''}. ${found.slice(0, 2).map((f) => f.text).join(' ')}`, { type: opinion === 'qualified' ? 'bad' : 'warn', app: 'legal' });
    const reaudit = opinion === 'qualified' ? (t1 ? A.type1 : A.type2) : 0;
    logMistake(state, { functionId: 'legal_hygiene', id: opinion === 'qualified' ? 'soc2_qualified' : 'soc2_exceptions', label: opinion === 'qualified' ? 'Qualified SOC 2 opinion' : 'SOC 2 report with exceptions', app: 'legal', delayed: true, circles: opinion === 'qualified', cost: { usd: reaudit, days: opinion === 'qualified' ? 120 : 0 }, detail: `${found.length} exception(s): ${found.slice(0, 3).map((f) => f.id).join(', ')}. ${opinion === 'qualified' ? 'Buyers ask for a re-audit; that is another fee and months.' : 'Buyers will ask about each exception.'}` });
  }
  return report;
}

// ---------------------------------------------------------------------------
// Trust center, frameworks, the templated-report trap
// ---------------------------------------------------------------------------

const strictDeal = (d) => ['regulated', 'health', 'public'].includes(getSegment(d.segmentId)?.group) || d.segmentId === 'enterprise' || (d.amount ?? 0) >= 50000;
/** Open deals with a strict security team (enterprise, regulated, $50k+). */
export const strictDemand = (state) => (state.apps.crm?.deals ?? []).filter((d) => !['won', 'lost'].includes(d.stage) && strictDeal(d)).length;

/** Publish the trust center (policies, report and pentest summary behind an NDA gate). Needs approved policies. */
export function publishTrustCenter(state) {
  const c = C(state);
  const P = PLATFORMS[c.platform];
  if (!P?.trustCenter) throw new Error('A trust center comes with a compliance platform.');
  if (c.policies?.status !== 'approved') throw new Error('Approve your security policies first: the trust center publishes them.');
  if (c.trust) throw new Error('Already published.');
  c.trust = { day: state.day, platform: c.platform, deflected: 0, tried: 0 };
  return { hours: 2 };
}

/**
 * Send the trust-center link instead of filling the questionnaire. Some buyers self-serve from it (Drata/SafeBase
 * deflects most, strict TPRM teams least). It only shows what is true, so nothing false is claimed. Returns
 * { deflected, hours }; a buyer who still wants the questionnaire stays in the inbox.
 */
export function deflectQuestionnaire(state, sourceKey) {
  const c = C(state);
  if (!c.trust) throw new Error('Publish the trust center first.');
  if (c.deflectTried[sourceKey]) throw new Error('They already have the link and still want the questionnaire.');
  const src = questionnaireInbox(state).find((x) => x.sourceKey === sourceKey);
  if (!src) throw new Error('Nothing to deflect.');
  c.deflectTried[sourceKey] = state.day;
  c.trust.tried++;
  const deal = src.dealId ? (state.apps.crm?.deals ?? []).find((x) => x.id === src.dealId) : null;
  const p = (PLATFORMS[c.trust.platform]?.trustCenter?.deflect ?? 0.15) * (deal && strictDeal(deal) ? 0.5 : 1) * (soc2ReportOnHand(state) ? 1 : 0.5);
  const ok = sideRoll(state, `deflect|${sourceKey}`) < p;
  if (ok) {
    c.trust.deflected++;
    c.questionnaires.unshift({ id: uid('qn'), ...src, day: state.day, status: 'submitted', submittedDay: state.day, deflected: true, answers: [], accuracy: 1, reviewedShare: 1, wrong: [] });
    try {
      if (src.kind === 'ask') { const ask = (state.apps.success?.asks ?? []).find((x) => x.id === src.askId); if (ask?.status === 'open') workOnAsk(state, ask, Math.max(0, ask.hours - ask.progress)); }
      else { const it = deal?.paperwork?.find((x) => x.id === src.itemId && x.status === 'open'); if (it) workPaperwork(state, deal, src.itemId, Math.max(0, it.hours - it.progress)); }
    } catch { /* the deal moved on */ }
  }
  return { deflected: ok, hours: 0.1 };
}

/** Add a framework (ISO 27001, HIPAA, GDPR) to the platform: Secureframe's ~$7.5K each is the visible price. */
export function addFramework(state, fw) {
  const c = C(state);
  const P = PLATFORMS[c.platform];
  if (!P || P.retired) throw new Error('Pick a compliance platform first.');
  if (!FRAMEWORKS[fw]) throw new Error('Unknown framework.');
  if (c.frameworks[fw]) throw new Error('Already added.');
  if (P.includesAudit === 'sham') throw new Error('The templated shop only sells SOC 2.');
  if (P.oneFramework && !c.reports.some((r) => !r.templated)) throw new Error(`${P.label} runs one framework at a time: finish the SOC 2 audit first.`);
  const fee = P.frameworkFee ?? 5000;
  post(state, { amount: -fee, counterparty: P.label, description: `${P.label}: ${FRAMEWORKS[fw].label} framework (annual)`, category: 'software', method: 'card', meta: { app: 'legal', item: 'Compliance framework' } });
  c.frameworks[fw] = { day: state.day, usd: fee };
  const d = soc2Demand(state);
  if (!d.ent && !d.deals) logMistake(state, { functionId: 'legal_hygiene', id: 'framework_unneeded', label: `${FRAMEWORKS[fw].label} added with no buyer asking`, app: 'legal', key: `fw:${fw}`, cost: { usd: fee, hours: 6 }, detail: `${money(fee)} a year plus mapping work for a framework no deal requires yet. Add frameworks when a named buyer's paperwork lists them.` });
  return { hours: 6, usd: fee };
}

/** Daily: does the templated report get exposed? Strict reviews check the auditor; a press story can land any week. */
function templatedDay(state, L, c) {
  const T = c.templated;
  if (!T || T.exposed) return 0;
  let trigger = null;
  for (const d of state.apps.crm?.deals ?? []) {
    if (T.checkedDeals[d.id] || !d.secClaimsChecked) continue;
    T.checkedDeals[d.id] = state.day;
    const p = strictDeal(d) ? TEMPLATED.strictCatch : TEMPLATED.lightCatch;
    if (sideRoll(state, `templated|${d.id}`) < p) { trigger = { why: `${state.apps.crm?.companies?.find((x) => x.id === d.companyId)?.name ?? 'A buyer'}'s security team looked up the auditor and compared the report's control text with other vendors' reports` }; break; }
  }
  if (!trigger && dayOfWeek(state) === 1 && sideRoll(state, 'templated|press') < TEMPLATED.monthlyPress / 4.3) trigger = { why: 'A whistleblower thread shows the shop issued identical pre-filled reports through an auditor that never tested anything' };
  if (!trigger) return 0;
  return exposeTemplated(state, trigger.why);
}

/** The templated report is exposed: report void, deals that relied on it lost, customers reconsider, a re-audit from zero. */
export function exposeTemplated(state, why = 'A buyer\'s security team checked the auditor') {
  const L = ensureLegal(state);
  const c = C(state);
  const T = c.templated;
  if (!T || T.exposed) return 0;
  T.exposed = state.day;
  const rep = c.reports.find((r) => r.id === T.reportId);
  if (rep) rep.invalid = state.day;
  L.soc2 = 'none'; L.soc2Report = null; L.soc2Plan = null; L.soc2Qualified = false;
  c.platform = null; c.auditor = null; // a dead report from a shop you now have to leave
  const caught = verify(state, { audience: 'customer', check: 'audit', final: true, roll: () => 0, filter: (x) => x.id === T.claimId }).caught;
  const lost = [];
  for (const d of state.apps.crm?.deals ?? []) {
    if (['won', 'lost'].includes(d.stage) || !(d.paperwork ?? []).some((it) => /^soc2_/.test(it.id))) continue;
    loseDeal(state, d, 'SOC 2 report exposed as templated'); lost.push(d.id);
  }
  let churned = 0;
  if (state.company.model === 'ent') for (const sub of activeSubs(state)) if (sideRoll(state, `templated|churn|${sub.id}`) < TEMPLATED.churnP) { cancel(state, sub.id, { atPeriodEnd: true, reason: 'security_misrepresentation' }); churned++; }
  const redo = SOC2.platform + AUDITORS.established.type1;
  T.lost = lost.length; T.churned = churned; T.redo = redo;
  const detail = `${why}. The report is void: ${lost.length} open deal(s) lost, ${churned} customer(s) cancelling at renewal, and a real programme (platform + an independent auditor, ~${money(redo)}) starts from zero. LiteLLM and Context AI paid this after Delve (TechCrunch 2026-04-23).`;
  const lesson = "Cheap and fast is fine for tooling, never for the audit: pick a CPA firm enterprise buyers recognise (Vanta, Drata or Secureframe plus an established auditor, or Oneleet's bundle) and fix the red tests before fieldwork.";
  const sev = caught.length ? penalize(state, caught, { audience: 'customer', functionId: 'legal_hygiene', id: 'soc2_templated_report', label: 'SOC 2 report exposed as templated', usd: redo, hours: 30, customers: churned, app: 'legal', detail, lesson }) : 0;
  if (!caught.length) logMistake(state, { functionId: 'legal_hygiene', id: 'soc2_templated_report', label: 'SOC 2 report exposed as templated', app: 'legal', delayed: true, circles: true, cost: { usd: redo, hours: 30, customers: churned, reputation: 2 }, detail, lesson });
  notify(state, `Your SOC 2 report has been exposed as a templated, pre-filled report. ${detail}`, { type: 'bad', app: 'legal' });
  return sev || 1;
}

/** Compliance vendor fit, 0..1 (feeds legal_hygiene; shown in the SOC 2 tab). null before any platform. */
export function complianceVendorScore(state) {
  const c = state.apps.legal?.compliance;
  if (!c?.history?.length) return null;
  const evidence = [], coaching = [];
  const used = c.history.map((h) => h.platform);
  let s = 0.8;
  if (used.includes('templated')) {
    s = c.templated?.exposed ? 0 : 0.15;
    evidence.push(`SOC 2 from a templated shop${c.templated?.exposed ? ': exposed, report void' : ' (a latent liability)'}.`);
    coaching.push('A pre-filled report from an auditor nobody recognises passes a light review and fails a strict one. Use a recognised auditor and fix the red tests.');
  } else {
    const last = c.history.at(-1);
    if (last.platform === 'oneleet' && last.strict) { s += 0.15; evidence.push('Oneleet bundle (real pentest + partner auditor) for security-sensitive buyers.'); }
    else if (['vanta', 'drata', 'secureframe'].includes(last.platform)) evidence.push(`${PLATFORMS[last.platform].label} at ${last.demand ? 'a real buyer ask' : 'no buyer ask yet'}.`);
    if (!last.demand) s -= 0.2;
    if (c.trust?.deflected) { s += 0.05; evidence.push(`Trust center deflected ${c.trust.deflected} questionnaire(s).`); }
    const fw = (state.mistakes ?? []).filter((m) => m.id === 'framework_unneeded').length;
    if (fw) { s -= 0.1 * Math.min(2, fw); coaching.push('Add frameworks when a named deal lists them; each is a yearly fee and mapping work.'); }
  }
  const score = clamp(s, 0, 1);
  if (score < 0.8) coaching.push('What a stellar operator does: buys the platform when a real deal needs the report, picks Oneleet or an established auditor when buyers are security-sensitive, publishes the trust center to deflect questionnaires, and never buys a "certified in 3 weeks" report.');
  return { score: round2(score), evidence, coaching };
}

// ---------------------------------------------------------------------------
// Security questionnaires (AI draft + human review)
// ---------------------------------------------------------------------------

/** What is true today for a questionnaire fact. */
export function factTrue(state, fact) {
  const L = ensureLegal(state);
  const c = C(state);
  switch (fact) {
    case 'soc2_type2': return soc2ReportOnHand(state)?.type === 'type2' && !L.soc2Qualified; // includes the last report during a renewal
    case 'soc2_any': return Boolean(soc2ReportOnHand(state)); // a Type II window in progress is not a completed audit
    case 'dpa': return Boolean(L.dpaReady);
    case 'offboarding': return !c.tests.idp_stale || c.tests.idp_stale.status === 'pass';
    case 'change_review': return Boolean(c.tests.vcs_branch) && c.tests.vcs_branch.status === 'pass' && state.apps.people?.aiReview !== false;
    case 'no_ai_training': return true; // the product does not train on customer data [design]
    case 'bgcheck': return !peopleHumans(state).some((m) => m.engagement !== 'contractor' && m.provenance && m.provenance.backgroundCheck?.result !== 'clear');
    default: return COMMITMENTS[fact] ? operated(state, fact) : false;
  }
}

/** Open questionnaires elsewhere in the game (Success asks and CRM deal paperwork) not yet imported. */
export function questionnaireInbox(state) {
  const c = C(state);
  const have = new Set(c.questionnaires.map((x) => x.sourceKey));
  const out = [];
  for (const a of state.apps.success?.asks ?? []) if (a.kind === 'security_questionnaire' && a.status === 'open' && !have.has(`ask:${a.id}`)) out.push({ sourceKey: `ask:${a.id}`, kind: 'ask', askId: a.id, label: 'Security questionnaire (renewal)', customer: state.apps.crm?.companies?.find((x) => x.id === a.companyId)?.name ?? 'Customer', dueDay: a.dueDay, size: 1 });
  for (const d of state.apps.crm?.deals ?? []) {
    if (['won', 'lost'].includes(d.stage)) continue;
    for (const it of d.paperwork ?? []) if (['security_questionnaire', 'sig_lite', 'caiq'].includes(it.id) && it.status === 'open' && !have.has(`deal:${d.id}:${it.id}`)) {
      out.push({ sourceKey: `deal:${d.id}:${it.id}`, kind: 'deal', dealId: d.id, itemId: it.id, label: it.label, customer: state.apps.crm?.companies?.find((x) => x.id === d.companyId)?.name ?? 'Prospect', size: it.id === 'caiq' ? 2 : it.id === 'sig_lite' ? 1.5 : 1 });
    }
  }
  return out;
}

export function importQuestionnaire(state, sourceKey) {
  const c = C(state);
  const src = questionnaireInbox(state).find((x) => x.sourceKey === sourceKey);
  if (!src) throw new Error('Nothing to import.');
  if (!Object.keys(c.tests).length) seedReality(state);
  const h = parseInt(hash(sourceKey), 36);
  const qs = [...QUESTIONS].sort((a, b) => (parseInt(hash(a.id + h), 36) % 997) - (parseInt(hash(b.id + h), 36) % 997)).slice(0, Q.shown);
  const qn = { id: uid('qn'), ...src, day: state.day, status: 'open', answers: qs.map((x) => ({ qid: x.id, q: x.q, fact: x.fact, invert: Boolean(x.invert), draft: null, final: null, source: null, reviewed: false })) };
  c.questionnaires.unshift(qn);
  return qn;
}

const quotaLeft = (state) => {
  const c = C(state);
  const yr = Math.floor(state.day / 365);
  if (c.quotaYear !== yr) { c.quotaYear = yr; c.quotaUsed = 0; }
  return (PLATFORMS[c.platform]?.questionnaires ?? 0) - c.quotaUsed;
};

/** AI draft from the answer library, the policies and the live control status. Uses quota. Returns hours. */
export function aiDraft(state, qnId) {
  const c = C(state);
  const qn = c.questionnaires.find((x) => x.id === qnId);
  if (!qn || qn.status !== 'open') throw new Error('Not open.');
  if (!c.platform) throw new Error('AI questionnaire drafting comes with a compliance platform.');
  if (quotaLeft(state) <= 0) throw new Error('Questionnaire quota used up for this year (upgrade the plan or answer by hand).');
  c.quotaUsed++;
  for (const a of qn.answers) {
    const lib = c.library[a.fact];
    const truth = factTrue(state, a.fact);
    let yes, source, conf;
    if (lib) { yes = lib.yes; source = `Answer library (approved ${fmtDate(state, lib.day)})`; conf = 'high'; }
    else if (c.commitments[a.fact]?.kept) { yes = true; source = 'Your security policy'; conf = 'high'; }
    else if (['soc2_type2', 'soc2_any', 'dpa', 'offboarding', 'change_review', 'mfa', 'encryption'].includes(a.fact) && Object.keys(c.tests).length) { yes = truth; source = 'Live control status'; conf = 'high'; }
    else if (a.fact === 'no_ai_training') { yes = true; source = 'Trust center'; conf = 'medium'; }
    else { yes = chance(state, Q.aiHallucinate + 0.35) ? true : truth; source = 'No source found: AI inferred'; conf = 'low'; }
    if (a.invert) yes = a.fact === 'no_ai_training' ? false : !yes;
    a.draft = { yes, source, conf };
    a.final = null; a.reviewed = false;
  }
  qn.drafted = state.day;
  const hours = Q.aiBaseHours;
  c.hours.questionnaires = round2(c.hours.questionnaires + hours);
  return { hours };
}

const truthful = (state, a) => (a.invert ? !factTrue(state, a.fact) : factTrue(state, a.fact));

/** Review one answer: approve (keep) or correct to the truth (you checked the control). Returns hours. */
export function reviewAnswer(state, qnId, qid, action) {
  const qn = C(state).questionnaires.find((x) => x.id === qnId);
  const a = qn?.answers.find((x) => x.qid === qid);
  if (!a?.draft) throw new Error('Draft first.');
  a.reviewed = true;
  a.final = action === 'correct' ? { yes: truthful(state, a), edited: true } : { yes: a.draft.yes };
  return { hours: Q.reviewHoursPerQ * (qn.size ?? 1) };
}

/** Submit. mode: 'reviewed' (unreviewed answers ship as drafted), 'manual' (by hand, truthful, 2-4 h). */
export function submitQuestionnaire(state, qnId, { mode = 'reviewed' } = {}) {
  const c = C(state);
  const qn = c.questionnaires.find((x) => x.id === qnId);
  if (!qn || qn.status !== 'open') throw new Error('Not open.');
  let hours = 0;
  if (mode === 'manual') { for (const a of qn.answers) a.final = { yes: truthful(state, a), manual: true }; hours = Q.manualHoursPerQ * Q.shown * (qn.size ?? 1); }
  else { if (!qn.drafted) throw new Error('Draft with AI first, or answer by hand.'); for (const a of qn.answers) a.final ??= { yes: a.draft.yes }; hours = 0.1; }
  const wrong = qn.answers.filter((a) => a.final.yes !== truthful(state, a));
  const overclaims = wrong.filter((a) => a.final.yes && !a.invert || (a.invert && !a.final.yes));
  qn.status = 'submitted';
  qn.submittedDay = state.day;
  qn.accuracy = round2(1 - wrong.length / qn.answers.length);
  qn.reviewedShare = round2(qn.answers.filter((a) => a.reviewed || a.final.manual).length / qn.answers.length);
  qn.wrong = wrong.map((a) => a.qid);
  for (const a of qn.answers) if (a.reviewed || a.final.manual) c.library[a.fact] = { yes: a.final.yes, day: state.day };
  // Deliver to the deal / account through the owning app's exported functions.
  try {
    if (qn.kind === 'ask') { const ask = (state.apps.success?.asks ?? []).find((x) => x.id === qn.askId); if (ask?.status === 'open') workOnAsk(state, ask, Math.max(0, ask.hours - ask.progress)); }
    else { const deal = (state.apps.crm?.deals ?? []).find((x) => x.id === qn.dealId); const it = deal?.paperwork?.find((x) => x.id === qn.itemId && x.status === 'open'); if (it) workPaperwork(state, deal, qn.itemId, Math.max(0, it.hours - it.progress)); }
  } catch { /* the deal moved on */ }
  // Every answer is a statement to this buyer, recorded with the truth (core/integrity.js): the security review asks for
  // the evidence behind the yeses (sales/claims.js); answers that survive can still be found later (detections below).
  const buyerId = qn.kind === 'ask' ? (state.apps.success?.asks ?? []).find((x) => x.id === qn.askId)?.companyId : (state.apps.crm?.deals ?? []).find((x) => x.id === qn.dealId)?.companyId;
  if (buyerId) {
    const metricOf = (f) => (f === 'soc2_type2' ? 'soc2_type2' : f === 'soc2_any' ? 'soc2' : f === 'pentest' ? 'pentest' : `control:${f}`);
    const recs = recordClaims(state, { audience: 'customer', recipientId: buyerId, channel: 'questionnaire', claims: qn.answers.filter((a) => (a.invert ? !a.final.yes : a.final.yes)).map((a) => ({ metric: metricOf(a.fact), claimed: true, truth: truthful(state, a), text: a.q })) });
    for (const r of recs) { r.qnId = qn.id; r.dealId = qn.dealId ?? null; }
  }
  for (const a of overclaims) c.detections.push({ id: uid('qd'), qnId: qn.id, qid: a.qid, q: a.q, customer: qn.customer, kind: qn.kind, dealId: qn.dealId ?? null, askId: qn.askId ?? null, dueDay: state.day + 30 + Math.floor(rng(state) * 90), p: Q.detectP });
  if (overclaims.length) logMistake(state, { functionId: 'legal_hygiene', id: 'questionnaire_overclaim', label: 'Security questionnaire claims you cannot back', app: 'legal', delayed: true, cost: { usd: 0 }, detail: `${qn.customer}: ${overclaims.length} answer(s) claim controls that are not operating (${overclaims.slice(0, 2).map((a) => `"${a.q}"`).join('; ')}). ${Math.round((1 - qn.reviewedShare) * 100)}% of answers were never reviewed.` });
  c.hours.questionnaires = round2(c.hours.questionnaires + hours);
  return { hours, accuracy: qn.accuracy, wrong: wrong.length, overclaims: overclaims.length };
}

function detectionsDay(state, c) {
  for (const d of c.detections) {
    if (d.status || state.day < d.dueDay) continue;
    if (!chance(state, d.p)) { d.status = 'unnoticed'; continue; }
    d.status = 'caught';
    for (const cl of state.integrity?.claims ?? []) if (cl.qnId === d.qnId && cl.text === d.q && cl.status === 'open') Object.assign(cl, { status: 'caught', caughtDay: state.day, caughtBy: 'evidence later' });
    const deal = d.dealId ? (state.apps.crm?.deals ?? []).find((x) => x.id === d.dealId) : null;
    if (deal && !['won', 'lost'].includes(deal.stage)) {
      loseDeal(state, deal, 'Security questionnaire answer contradicted by evidence');
      notify(state, `${d.customer}'s security team found that "${d.q}" was answered yes but is not true. The deal is dead.`, { type: 'bad', app: 'legal' });
      logMistake(state, { functionId: 'legal_hygiene', id: 'questionnaire_overclaim', label: 'Deal lost over a false questionnaire answer', app: 'legal', delayed: true, cost: { customers: 1, reputation: 1 }, detail: `${d.customer}: "${d.q}".` });
    } else {
      const L = ensureLegal(state);
      L.exposure = round2((L.exposure ?? 0) + 1);
      const ask = d.askId ? (state.apps.success?.asks ?? []).find((x) => x.id === d.askId) : null;
      const sub = ask?.target === 'account' ? state.stripe?.subscriptions?.find((s) => s.id === ask.refId && s.status !== 'canceled') : null;
      if (sub && chance(state, 0.5)) cancel(state, sub.id, { atPeriodEnd: true, reason: 'security_misrepresentation' });
      notify(state, `${d.customer} discovered that your answer to "${d.q}" was false. Their counsel calls it a misrepresentation under the contract${sub ? '; they are reviewing the renewal' : ''}.`, { type: 'bad', app: 'legal' });
      logMistake(state, { functionId: 'legal_hygiene', id: 'questionnaire_overclaim', label: 'Customer caught a false questionnaire answer', app: 'legal', delayed: true, cost: { customers: sub ? 0.5 : 0, reputation: 1 }, detail: `${d.customer}: "${d.q}". Contract exposure up.` });
    }
  }
}

// ---------------------------------------------------------------------------
// Daily tick (called from the Legal app's onDay after legalDay)
// ---------------------------------------------------------------------------

// SOC 2 chores you committed to: charged in full past the weekly plan (core/state.js forceHours); only the physical
// weekly ceiling leaves the work undone (and the audit slips).
const chargeFounder = (state, hours, label) => forceHours(state, hours, label, { functionId: 'legal_hygiene' });

export function complianceDay(state) {
  const L = ensureLegal(state);
  const c = C(state);
  syncDynamicTests(state);
  // Platform renewal (escalates in year two [unverified]).
  if (c.platform && state.day - c.platformDay >= 365 * (c.renewals + 1)) {
    const P = PLATFORMS[c.platform];
    const amt = round2(P.annual * (c.renewals === 0 ? P.renewalMult : P.renewalMult));
    c.renewals++;
    post(state, { amount: -amt, counterparty: P.label, description: `${P.label} renewal (year ${c.renewals + 1})`, category: 'software', method: 'card', meta: { app: 'legal', item: 'Compliance automation platform' } });
    notify(state, `${P.label} renewed at ${money(amt)} (renewal escalators are common; negotiate a multi-year cap next time).`, { type: 'info', app: 'legal' });
  }
  if (dayOfWeek(state) === 1) weekly(state, L, c);
  // Oneleet's bundled pentest: a real test finds real issues (and counts as the annual pentest).
  if (c.pentestDueDay != null && state.day >= c.pentestDueDay && c.platform === 'oneleet') {
    c.pentestDueDay = null;
    c.actions.pentest = state.day;
    const found = [];
    for (const id of ['vuln_crit', 'cloud_ssh', 'cloud_encryption']) {
      const t = c.tests[id];
      if (!t || t.status === 'fail' || found.length >= 2) continue;
      if (sideRoll(state, `pentest|${id}`) < 0.6) { Object.assign(t, { status: 'fail', since: state.day, visibleDay: state.day, resource: `${TESTS[id].resource} (pentest finding)` }); found.push(TESTS[id].name); }
    }
    notify(state, `Oneleet pentest report: ${found.length ? `${found.length} finding(s) to remediate (${found.join('; ')})` : 'no material findings'}. It also satisfies the annual pentest commitment.`, { type: found.length ? 'warn' : 'good', app: 'legal' });
  }
  templatedDay(state, L, c);
  // Fail-days during a Type II observation window (exceptions need >14 failing days).
  const plan = L.soc2Plan;
  if (plan && L.soc2 === 'type2_in_progress' && state.day >= (plan.windowStart ?? plan.startDay)) for (const t of Object.values(c.tests)) if (t.scoped && t.status === 'fail') t.failDays = (t.failDays ?? 0) + 1;
  // Fieldwork snapshot and report.
  if (plan && L.soc2.endsWith('in_progress')) {
    if (plan.snapshotDay != null && state.day >= plan.snapshotDay && !plan.findings) {
      plan.findings = exceptionsNow(state, { windowFailDays: plan.type === 'type2' ? 14 : null });
      notify(state, `SOC 2 fieldwork: the auditor is testing ${plan.type === 'type1' ? 'your controls as of today' : 'the observation window'}. Report expected ${fmtDate(state, plan.readyDay)}.`, { type: 'info', app: 'legal' });
    }
    if (state.day >= plan.readyDay) { plan.findings ??= exceptionsNow(state); issueReport(state, L, plan); }
  }
  detectionsDay(state, c);
}

function weekly(state, L, c) {
  // Drift: passing tests regress as the company changes (new resources, new laptops, CVEs) [design 3%/week].
  for (const [id, t] of Object.entries(c.tests)) {
    const T = TESTS[id];
    if (T.dynamic || !t.scoped || t.status !== 'pass') continue;
    if (chance(state, T.recurring ?? 0.03)) Object.assign(t, { status: 'fail', since: state.day, visibleDay: state.day + (PLATFORMS[c.platform]?.retestDays ?? 0), resource: T.recurring ? `${T.resource} (new this week)` : `${T.resource} (changed)` });
  }
  // Personnel tasks: people complete them after the onboarding link (contractors slower).
  if (c.onboardingSent) for (const m of peopleHumans(state)) {
    const t = (c.personnel[m.id] ??= { policies: false, training: false, device: false, since: state.day });
    const p = m.engagement === 'contractor' ? PERSONNEL.contractorWeeklyDone : PERSONNEL.weeklyDone;
    for (const k of ['policies', 'training', 'device']) if (!t[k] && chance(state, p)) t[k] = true;
  }
  const plan = L.soc2Plan;
  const inProgress = plan && L.soc2.endsWith('in_progress');
  if (c.platform) {
    const P = PLATFORMS[c.platform];
    const manualEv = P.unsupported?.length ? P.manualEvidenceHours : 0; // evidence for systems the platform cannot read
    const got = chargeFounder(state, P.includesAudit === 'sham' ? 0.25 : STEADY_HOURS + manualEv, 'SOC 2: compliance alerts & evidence');
    c.hours.steady = round2(c.hours.steady + got);
    if (inProgress) plan.hoursSpent = round2((plan.hoursSpent ?? 0) + got);
  } else if (inProgress && plan.manual) {
    // Manual path: spreadsheets and screenshots; hours find and fix a few failing settings each week.
    const need = MANUAL.weeklyHours[L.soc2 === 'type1_in_progress' ? 'type1' : 'type2'];
    const sprint = Math.min(plan.sprintLeft ?? 0, MANUAL.sprintPerWeek);
    const got = chargeFounder(state, need + sprint, 'SOC 2: policies, evidence, vendor reviews');
    plan.sprintLeft = round2(Math.max(0, (plan.sprintLeft ?? 0) - Math.max(0, got - need)));
    plan.hoursSpent = round2((plan.hoursSpent ?? 0) + got);
    let fixes = Math.floor(MANUAL.fixesPerWeek * Math.min(1, got / need));
    for (const [id, t] of Object.entries(c.tests)) { if (fixes <= 0) break; if (t.status === 'fail' && !TESTS[id].external && !TESTS[id].scopeOut) { Object.assign(t, { status: 'pass', since: state.day }); fixes--; } }
    if (got < need) { plan.readyDay += Math.round(7 * (1 - got / need)); if (plan.snapshotDay != null) plan.snapshotDay += Math.round(7 * (1 - got / need)); }
    if (!c.policies && got >= need) { generatePolicies(state, 'template'); approvePolicies(state); }
    if (!c.onboardingSent && got >= need) sendPersonnelOnboarding(state);
  }
}

// ---------------------------------------------------------------------------
// Operator reader: legal hygiene
// ---------------------------------------------------------------------------

const trap = (id) => OPERATOR_TIERS.legal_hygiene.traps.find((t) => t.id === id)?.coaching;

export function legalHygieneRead(state) {
  const L = state.apps.legal;
  if (!L || (!L.incorporation && !L.founderStock && !L.compliance?.platform && L.soc2 === 'none')) return unknownRead('Incorporate before the first customer and sign the founder IP assignment.');
  const issues = legalIssues(state);
  const c = L.compliance ?? {};
  const fs = L.founderStock;
  const firstSub = (state.stripe?.subscriptions ?? []).reduce((a, s) => Math.min(a, s.startDay ?? Infinity), Infinity);
  const subs = (c.questionnaires ?? []).filter((q) => q.status === 'submitted');
  const acc = subs.length ? subs.reduce((a, q) => a + q.accuracy, 0) / subs.length : null;
  const mistakes = (state.mistakes ?? []).filter((m) => m.functionId === 'legal_hygiene');
  let score = 1;
  const evidence = [], coaching = [];
  if (fs?.missed) { score -= 0.35; evidence.push('83(b) missed: taxed at each vesting event.'); coaching.push(trap('miss_83b')); }
  else if (fs?.filed83b) evidence.push(`83(b) filed ${fs.filedDay - fs.grantDay} days after the grant.`);
  if (L.incorporation && Number.isFinite(firstSub) && L.incorporation.filedDay > firstSub) { score -= 0.1; evidence.push('Customers were paying before the company existed.'); }
  if (state.company.incorporated && !L.docs?.ipAssignment) coaching.push(trap('no_ip_assignment'));
  score -= Math.min(0.4, 0.08 * issues.length);
  evidence.push(`${issues.length} diligence red flag(s)${issues.length ? `: ${issues.slice(0, 2).join(' ')}` : ''}.`);
  if (mistakes.some((m) => m.id === 'soc2_too_early')) { score -= 0.15; evidence.push('Compliance platform bought before any buyer asked.'); coaching.push('Buy the platform when a real deal needs the report (often ~$50k+ ACV), not at $0 MRR.'); }
  const ignored = mistakes.filter((m) => m.id === 'filing_ignored').length; // assessed with penalties (legal/sim.js)
  if (ignored) { score -= Math.min(0.3, 0.12 * ignored); evidence.push(`${ignored} filing(s) ignored until the authority assessed them with penalties.`); coaching.push('Pay filings from Legal → Calendar when they come due: the fee is small, the assessment adds penalties and interest.'); }
  if (mistakes.some((m) => m.id === 'soc2_in_deal')) { score -= 0.1; coaching.push(trap('soc2_in_deal')); }
  if (L.soc2Qualified) { score -= 0.15; evidence.push('SOC 2 report has a qualified opinion.'); coaching.push('Fix red tests weekly and only keep policy commitments you actually operate.'); }
  if (acc != null) { score -= clamp((0.95 - acc) * 1.2, 0, 0.3); evidence.push(`Security questionnaires: ${Math.round(acc * 100)}% accurate across ${subs.length}.`); if (acc < 0.9) coaching.push('Review every AI-drafted answer against your live controls before you send it.'); }
  if (issues.some((x) => /DPA/.test(x))) coaching.push(trap('dpa_unread'));
  const vs = complianceVendorScore(state); // vendor fit: templated report, stage fit, trust center (above)
  if (vs) { score -= Math.max(0, 0.8 - vs.score) * 0.5; evidence.push(...vs.evidence); coaching.push(...vs.coaching); }
  coaching.push(`Stellar: ${OPERATOR_TIERS.legal_hygiene.tiers.stellar.behaviours[0]}`);
  return { tier: tierFromScore(clamp(score, 0, 1), { cuts: { stellar: 0.85, good: 0.65, average: 0.45 } }), score: round2(clamp(score, 0, 1)), evidence, coaching: [...new Set(coaching.filter(Boolean))] };
}

registerOperatorReader('legal_hygiene', legalHygieneRead);

// ---------------------------------------------------------------------------
// Automations exposure
// ---------------------------------------------------------------------------

export const LEGAL_TRIGGERS = ['soc2_test_failing', 'soc2_milestone', 'questionnaire_received', 'redline_arrived', 'dsr_received'];

export function legalEvents(state, trigger, since = state.day - 1) {
  const L = state.apps.legal;
  if (!L) return [];
  const c = L.compliance ?? { tests: {}, reports: [] };
  const out = [];
  if (trigger === 'soc2_test_failing') for (const [id, t] of Object.entries(c.tests)) { if (t.status === 'fail' && t.since >= since && !t.hidden) out.push({ ref: `test:${id}:${t.since}`, testId: id, label: `Failing: ${TESTS[id].name}` }); }
  if (trigger === 'soc2_milestone') {
    for (const r of c.reports ?? []) if (r.day >= since) out.push({ ref: `report:${r.id}`, label: `SOC 2 ${r.type === 'type1' ? 'Type I' : 'Type II'} report (${r.opinion})` });
    if (L.soc2Plan?.startDay >= since) out.push({ ref: `audit:${L.soc2Plan.startDay}`, label: `SOC 2 ${L.soc2Plan.type} audit started` });
  }
  if (trigger === 'questionnaire_received') for (const q of questionnaireInbox(state)) out.push({ ref: q.sourceKey, customer: q.customer, label: `${q.label}: ${q.customer}` });
  if (trigger === 'redline_arrived') for (const r of L.redlines ?? []) if ((r.day ?? r.createdDay ?? -1) >= since) out.push({ ref: `rl:${r.id}`, label: `Redlines from ${r.customer}` });
  if (trigger === 'dsr_received') for (const d of L.dsrs ?? []) if (d.day >= since) out.push({ ref: `dsr:${d.id}`, label: `GDPR ${d.type} request: ${d.name}` });
  return out;
}

