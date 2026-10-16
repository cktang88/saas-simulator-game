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

import { notify, log } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { mrr, activeSubs, cancel } from '../../core/stripe.js';
import { uid, rng, chance, clamp, round2, dayOfWeek, fmtDate, money, hash } from '../../core/util.js';
import { logMistake, registerOperatorReader, tierFromScore, unknownRead } from '../../core/operator.js';
import { OPERATOR_TIERS } from '../../data/operator-tiers.js';
import { SOC2 } from './catalog.js';
import { ensureLegal, legalIssues } from './sim.js';
import { workOnAsk } from '../success/engine.js';
import { workPaperwork, loseDeal, soc2ReportOnHand } from '../sales/model.js';
import { recordClaims } from '../../core/integrity.js';

export const PLATFORMS = {
  vanta: { label: 'Vanta', annual: 10000, renewalMult: 1.4, retestDays: 0, questionnaires: 25, note: 'Quote-only; ~$10k/yr entry for SOC 2 (third-party estimates), renewals reported up ~40-100% [unverified]. Tests re-run continuously; scope changes lag up to an hour.' },
  drata: { label: 'Drata', annual: 7500, renewalMult: 1.5, retestDays: 1, questionnaires: 25, note: 'Quote-only; ~$7.5k entry, Vendr medians $25-38k [unverified]. Autopilot syncs nightly, so fixes show the next day.' },
};
export const MANUAL = { weeklyHours: SOC2.weeklyHours, sprintHours: SOC2.sprintHours, sprintPerWeek: SOC2.sprintPerWeek, fixesPerWeek: 2 };
export const STEADY_HOURS = 1.5; // weekly alert triage on a platform [design, d10: 1-2 h/week]
export const AUDITORS = {
  boutique: { label: 'Boutique CPA firm', type1: SOC2.type1Audit, type2: SOC2.type2Audit, fieldworkDays: 35, reportDays: 21, detect: 0.8 },
  established: { label: 'Established CPA firm (known to enterprise TPRM teams)', type1: 16000, type2: 28000, fieldworkDays: 42, reportDays: 28, detect: 0.95 },
};
export const INTEGRATIONS = {
  cloud: { label: 'Cloud provider (AWS)', phase: 1, hours: 0.5 },
  idp: { label: 'Identity provider (Google Workspace)', phase: 1, hours: 0.5 },
  vcs: { label: 'Version control (GitHub)', phase: 2, hours: 0.25 },
  mdm: { label: 'Device management + agent (laptops)', phase: 2, hours: 0.75 },
  vuln: { label: 'Vulnerability scanner', phase: 2, hours: 0.5 },
  hris: { label: 'HRIS (Gusto)', phase: 3, hours: 0.25 },
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
  return L.compliance;
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
  const c = C(state);
  if (c.platform) throw new Error(`Already on ${PLATFORMS[c.platform].label}.`);
  const demand = soc2Demand(state);
  post(state, { amount: -P.annual, counterparty: P.label, description: `${P.label} compliance platform (annual)`, category: 'software', method: 'card', meta: { app: 'legal', item: 'Compliance automation platform' } });
  Object.assign(c, { platform: id, platformDay: state.day, renewals: 0, demandAtPurchase: demand, mrrAtPurchase: round2(mrr(state)) });
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
  if (key === 'hris' && !state.apps.people?.payrollSetup?.gusto) throw new Error('Set up Gusto in People first.');
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
  c.hours.fixes = round2(c.hours.fixes + T.fixHours);
  return { hours: T.fixHours };
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
  if (kind === 'ai') { if (chance(state, 0.6)) keys.push('soc247'); if (chance(state, 0.5)) keys.push('daily_logs'); }
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
  C(state).auditor = firm;
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
  if (type === 'type1') {
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
  const found = (plan.findings ?? []).filter(() => chance(state, A.detect));
  post(state, { amount: -(t1 ? A.type1 : A.type2), counterparty: A.label, description: `SOC 2 ${t1 ? 'Type I' : 'Type II'} audit`, category: 'legal', method: 'ach', meta: { app: 'legal', item: `SOC 2 ${t1 ? 'Type I' : 'Type II'} audit` } });
  const gaps = found.filter((f) => f.kind === 'gap').length;
  const opinion = found.length === 0 ? 'clean' : found.length >= 4 || gaps > 0 ? 'qualified' : 'exceptions';
  L.soc2 = t1 ? 'type1' : 'type2';
  plan.doneDay = state.day;
  const report = { id: uid('soc2r'), type: plan.type, day: state.day, auditor: plan.auditor, exceptions: found, opinion };
  c.reports.push(report);
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

function chargeFounder(state, hours, label) {
  const f = state.founder;
  const h = round2(Math.min(hours, Math.max(0, f.hoursPerWeek - f.hoursUsed)));
  if (h <= 0) return 0;
  f.hoursUsed += h;
  f.timeLog ??= [];
  f.timeLog.push({ day: state.day, hours: h, label });
  return h;
}

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
    const got = chargeFounder(state, STEADY_HOURS, 'SOC 2: compliance alerts & evidence');
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
  if (mistakes.some((m) => m.id === 'soc2_in_deal')) { score -= 0.1; coaching.push(trap('soc2_in_deal')); }
  if (L.soc2Qualified) { score -= 0.15; evidence.push('SOC 2 report has a qualified opinion.'); coaching.push('Fix red tests weekly and only keep policy commitments you actually operate.'); }
  if (acc != null) { score -= clamp((0.95 - acc) * 1.2, 0, 0.3); evidence.push(`Security questionnaires: ${Math.round(acc * 100)}% accurate across ${subs.length}.`); if (acc < 0.9) coaching.push('Review every AI-drafted answer against your live controls before you send it.'); }
  if (issues.some((x) => /DPA/.test(x))) coaching.push(trap('dpa_unread'));
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

