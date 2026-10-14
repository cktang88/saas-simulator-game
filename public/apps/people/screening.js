// Background checks (Checkr-style) and AI application criteria (Ashby-style), gap item 25.
//
// Background checks: package, candidate consent, report (clear / consider) and the FCRA adverse-action steps
// (pre-adverse notice with a copy of the report, a waiting period of ~5 business days, then the final notice).
// Prices: Checkr about $30 entry to $80 top tier, usage-based (t6, CostBench 2026 [unverified]). Ordering before a
// conditional offer conflicts with fair-chance laws (California Fair Chance Act, NYC and many states); skipping
// the adverse-action steps is an FCRA violation. Claim probabilities and costs are [design].
//
// AI criteria: per job, up to 10 criteria evaluated per candidate as meets / does not meet / undecided with
// reasoning (never a score), 1 credit per candidate per job; Ashby Foundations $400/month includes 1,500 AI
// credits/month (ashbyhq.com/pricing, accessed 2026-10-14). The validator warns about EEO-risky proxy criteria.
// Ashby publishes no accuracy figures and says results "may be inaccurate"; the simulated reads come from the
// resume only (polish-biased, weak), so criteria help triage but are not evidence of performance [design].

import { round2, uid, chance, rng, gaussian, money } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { post, addRecurring } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { TRAITS, z } from '../../data/roles.js';
import { roleComposite } from './candidates.js';

export const BG_PACKAGES = {
  basic: { label: 'Basic: SSN trace, national criminal, sex offender', usd: 35, days: [2, 4], identity: 0.45, employment: false },
  standard: { label: 'Standard: + county criminal (7 years)', usd: 55, days: [3, 6], identity: 0.6, employment: false },
  pro: { label: 'Pro: + employment & education verification', usd: 80, days: [4, 8], identity: 0.9, employment: true },
};
export const FCRA = { waitDays: 7, claimNoProcess: 0.3, claimUnrelated: 0.1, claimPreOffer: 0.06, cost: [5000, 25000] }; // [design]
export const ASHBY = { monthly: 400, credits: 1500, setupHours: 0.5, criteriaHours: 0.75, reviewHoursPer: 0.05, optOut: 0.05 };
export const TRIAGE = { minutesPerApplication: 1.5, capHoursPerJob: 4, aiReviewHoursPerJob: 0.75 }; // [design] d10: 3-5 h/role → 45-90 min

// ---------------------------------------------------------------------------
// Background checks
// ---------------------------------------------------------------------------

export function orderBackgroundCheck(state, p, c, pkg) {
  const P = BG_PACKAGES[pkg];
  if (!P) throw new Error('Pick a package.');
  if (c.backgroundCheck) throw new Error('A check is already on file.');
  if (!['screened', 'interview_scheduled', 'interviewed', 'offer', 'hired'].includes(c.stage)) throw new Error('Only for candidates in process.');
  const preOffer = !['offer', 'hired'].includes(c.stage);
  post(state, { amount: -P.usd, counterparty: 'Checkr', description: `Background check (${pkg}): ${c.name}`, category: 'other', method: 'card', meta: { app: 'people', recruiting: true } });
  // Consent: a standalone FCRA disclosure; a few candidates drop out at this point.
  if (chance(state, c.fraud ? 0.35 : 0.02)) {
    c.backgroundCheck = { pkg, orderedDay: state.day, status: 'no_consent', preOffer };
    if (c.stage !== 'hired') { c.stage = 'withdrawn'; c.withdrawReason = 'did not consent to the background check'; }
    return c.backgroundCheck;
  }
  const d = P.days[0] + Math.floor(rng(state) * (P.days[1] - P.days[0] + 1));
  c.backgroundCheck = { pkg, orderedDay: state.day, readyDay: state.day + d, status: 'pending', preOffer };
  if (preOffer) {
    logMistake(state, { functionId: 'hiring', id: 'bg_pre_offer', label: 'Background check before a conditional offer', app: 'people', cost: { usd: 0 }, detail: `${c.name}: fair-chance laws (CA, NYC and many states) require a conditional offer first. Claim risk ~${Math.round(FCRA.claimPreOffer * 100)}%.` });
    if (chance(state, FCRA.claimPreOffer)) scheduleClaim(state, p, c.name, 'fair-chance (pre-offer background check)');
  }
  return c.backgroundCheck;
}

function bgResult(state, c) {
  const bg = c.backgroundCheck;
  const P = BG_PACKAGES[bg.pkg];
  if (c.fraud === 'stand_in' && chance(state, P.identity)) return { status: 'consider', relevant: true, finding: P.employment ? 'Employment history could not be verified at two listed employers; SSN trace shows a different name history.' : 'SSN trace returned a different name history than the application.' };
  if (z(c.traits?.integrity ?? 50) < -1.3 && chance(state, 0.25)) return { status: 'consider', relevant: true, finding: 'Conviction for fraud-related offence (2019), directly related to handling customer data and money.' };
  if (chance(state, 0.06)) return { status: 'consider', relevant: false, finding: 'Misdemeanor from 11 years ago (minor, unrelated to the job). An individualized assessment would not disqualify.' };
  return { status: 'clear', relevant: false, finding: P.employment ? 'Identity, criminal records and employment history verified.' : 'Identity and criminal records clear.' };
}

/** Daily: reports land; adverse-action waits complete. */
export function backgroundDay(state, p) {
  for (const c of p.candidates) {
    const bg = c.backgroundCheck;
    if (bg?.status === 'pending' && state.day >= bg.readyDay) {
      Object.assign(bg, bgResult(state, c), { reportDay: state.day });
      const m = p.members.find((x) => x.candidateId === c.id);
      if (m?.provenance) m.provenance.backgroundCheck = { pkg: bg.pkg, result: bg.status, preOffer: Boolean(bg.preOffer) };
      notify(state, `Background check for ${c.name}: ${bg.status === 'clear' ? 'clear' : 'CONSIDER'}. ${bg.finding}`, { type: bg.status === 'clear' ? 'good' : 'warn', app: 'people' });
    }
  }
}

/** FCRA adverse action. step 'pre' sends the pre-adverse notice + report copy; 'final' after the wait. Returns the check. */
export function adverseAction(state, p, c, step) {
  const bg = c.backgroundCheck;
  if (!bg || bg.status !== 'consider') throw new Error('Adverse action only follows a "consider" report.');
  if (step === 'pre') { if (bg.preAdverseDay != null) throw new Error('Pre-adverse notice already sent.'); bg.preAdverseDay = state.day; return bg; }
  if (step === 'final') {
    if (bg.preAdverseDay == null) throw new Error('Send the pre-adverse notice first.');
    if (state.day - bg.preAdverseDay < FCRA.waitDays) throw new Error(`Wait until ${FCRA.waitDays} days after the pre-adverse notice (the candidate may dispute the report).`);
    bg.finalDay = state.day;
    bg.adverse = true;
    if (!bg.relevant) {
      logMistake(state, { functionId: 'hiring', id: 'bg_unrelated', label: 'Rejected over an unrelated record', app: 'people', cost: { usd: 0 }, detail: `${c.name}: the finding was unrelated to the job; an individualized assessment would have kept them in.` });
      if (chance(state, FCRA.claimUnrelated)) scheduleClaim(state, p, c.name, 'disparate impact (unrelated record)');
    }
    return bg;
  }
  throw new Error('Unknown step.');
}

/** Called when the player rejects or rescinds a candidate who has a "consider" report. */
export function onRejectWithReport(state, p, c) {
  const bg = c.backgroundCheck;
  if (!bg || bg.status !== 'consider' || bg.adverse) return null;
  logMistake(state, { functionId: 'hiring', id: 'fcra_skipped', label: 'Skipped FCRA adverse-action steps', app: 'people', cost: { usd: 0 }, detail: `${c.name}: rejected after a background report with no pre-adverse notice or waiting period (FCRA). Claim risk ~${Math.round(FCRA.claimNoProcess * 100)}%.` });
  if (chance(state, FCRA.claimNoProcess)) scheduleClaim(state, p, c.name, 'FCRA (no adverse-action notice)');
  bg.adverse = 'skipped';
  return true;
}

function scheduleClaim(state, p, name, kind) {
  p.screenClaims ??= [];
  p.screenClaims.push({ id: uid('fcra'), name, kind, dueDay: state.day + 45 + Math.floor(rng(state) * 90), cost: round2(FCRA.cost[0] + rng(state) * (FCRA.cost[1] - FCRA.cost[0])), status: 'pending' });
}

export function screeningClaimsDay(state, p) {
  for (const k of p.screenClaims ?? []) {
    if (k.status !== 'pending' || state.day < k.dueDay) continue;
    k.status = 'settled';
    post(state, { amount: -k.cost, counterparty: 'Employment lawyer', description: `${k.kind} claim (${k.name}): defense & settlement`, category: 'legal', method: 'ach', meta: { app: 'people' } });
    notify(state, `${k.name} brought a ${k.kind} claim. Defense and settlement cost ${money(k.cost)}.`, { type: 'bad', app: 'people' });
    logMistake(state, { functionId: 'hiring', id: 'screening_claim', label: `Screening claim: ${k.kind}`, app: 'people', delayed: true, cost: { usd: k.cost, hours: 5 }, detail: `${k.name}: ${money(k.cost)} settlement.` });
  }
}

// ---------------------------------------------------------------------------
// AI application criteria
// ---------------------------------------------------------------------------

// Words that map a criterion to the hidden trait the resume can (weakly) show [design].
const CRIT_TRAITS = [
  [/(ship|built|production|code|engineer|repo|deploy|architecture|portfolio|design system|wrote|published|byline|quota|attainment|closed|pipeline|tickets?|csat|campaign|seo|channel)/i, 'craft'],
  [/(saas|b2b|industry|domain|revops|finance|fintech|health|vertical|buyer|market)/i, 'domain'],
  [/(startup|seed|early[- ]stage|end[- ]to[- ]end|owned|founding|0 ?(to|→) ?1|zero to one|initiative)/i, 'agency'],
  [/(\bai\b|llm|agent|claude|cursor|copilot|prompt|eval)/i, 'ai_fluency'],
  [/(writ|document|explain|communicat|docs|help[- ]cent)/i, 'communication'],
  [/(test|on[- ]call|reliab|quality|detail|process)/i, 'conscientiousness'],
];
// EEO / proxy criteria the validator flags (age, nationality, disability, gender, family, pedigree proxies) [design].
export const PROXY = [
  [/(young|recent grad|digital native|under \d{2}|graduat\w* (in|after) (19|20)\d\d|energetic|fresh)/i, 'age proxy'],
  [/(native (english )?speaker|mother tongue|citizen|no visa|local candidates only|accent)/i, 'national-origin proxy'],
  [/(no (employment )?gaps?|continuous employment|career break)/i, 'gaps proxy (caregivers, disability, illness)'],
  [/(culture fit|fits? (in|our culture)|like us|beer test)/i, '"culture fit" (similarity bias)'],
  [/(ivy|top[- ]?(10|tier|school|university)|stanford|mit\b|harvard|elite (school|university))/i, 'pedigree proxy'],
  [/(\bhe\b|\bshe\b|guys?\b|manpower|salesman|chairman|rockstar|ninja)/i, 'gender-coded wording'],
  [/(physically fit|able[- ]bodied|healthy|no disabilit)/i, 'disability proxy'],
  [/(married|single|kids|children|family plans)/i, 'family-status proxy'],
];

export function validateCriterion(text) {
  const t = String(text ?? '').trim();
  const trait = CRIT_TRAITS.find(([re]) => re.test(t))?.[1] ?? null;
  const warn = PROXY.filter(([re]) => re.test(t)).map(([, l]) => l);
  const vague = !trait && !warn.length;
  return { text: t.slice(0, 200), trait, warn, vague, note: warn.length ? `EEO risk: ${warn.join(', ')}.` : vague ? 'Unclear: the AI cannot check this from a resume; results will be mostly "undecided".' : `Checks ${TRAITS[trait]?.label ?? trait} from the resume.` };
}

export function ensureAts(p) {
  p.ats ??= { ashby: false, recurringId: null, credits: 0, month: null, used: 0 };
  return p.ats;
}

export function enableAshby(state, p) {
  const a = ensureAts(p);
  if (a.ashby) throw new Error('Already on Ashby.');
  a.ashby = true;
  a.recurringId = addRecurring(state, { vendor: 'Ashby', amount: ASHBY.monthly, category: 'software', dayOfMonth: 1, note: 'Ashby Foundations ATS (1,500 AI credits/month)' }).id;
  a.credits = ASHBY.credits;
  a.month = Math.floor(state.day / 30.4);
  return a;
}

export function atsDay(state, p) {
  const a = ensureAts(p);
  if (!a.ashby) return;
  const rec = state.recurring.find((r) => r.id === a.recurringId);
  if (!rec?.active) { a.ashby = false; return; }
  const mo = Math.floor(state.day / 30.4);
  if (mo !== a.month) { a.month = mo; a.credits = ASHBY.credits; }
}

/** Save criteria on a job (validated). ignoreWarnings records that EEO warnings were overridden. */
export function setCriteria(state, job, texts, { ignoreWarnings = false } = {}) {
  const list = texts.map(validateCriterion).filter((c) => c.text).slice(0, 10);
  if (!list.length) throw new Error('Add at least one criterion.');
  const warned = list.filter((c) => c.warn.length);
  if (warned.length && !ignoreWarnings) { const e = new Error(`EEO warnings: ${warned.map((c) => `"${c.text}" (${c.warn.join(', ')})`).join('; ')}. Remove them or save anyway.`); e.warnings = warned; throw e; }
  job.aiCriteria = { day: state.day, list, ignoredWarnings: warned.length > 0, fromScorecard: Boolean(job.scorecard) && list.every((c) => c.trait && job.scorecard.competencies.includes(c.trait)) };
  if (warned.length) logMistake(state, { functionId: 'hiring', id: 'eeo_proxy_criteria', label: 'AI screening criteria with EEO proxies', app: 'people', cost: { usd: 0 }, detail: `${job.title}: kept ${warned.map((c) => `"${c.text}"`).join(', ')} despite the validator warning (disparate-impact exposure; hiring AI is EU AI Act high-risk from Dec 2027).` });
  return job.aiCriteria;
}

const READ = (c, trait, state) => {
  // Resume-only evidence: weak and polish-biased [design]: r ≈ .3 with the trait, + .35 SD of polish.
  if (c.aiApplication && chance(state, 0.15)) return null; // generic AI-written application: nothing specific to read
  return 0.3 * z(c.traits[trait]) + 0.35 * z(c.traits.polish) + 0.85 * gaussian(state);
};

/** Evaluate all unevaluated 'new' candidates of a job against its criteria. Returns { evaluated, skipped, credits }. */
export function evaluateCandidates(state, p, job) {
  const a = ensureAts(p);
  if (!a.ashby) throw new Error('Turn on Ashby first.');
  if (!job.aiCriteria?.list?.length) throw new Error('Set criteria for this job first.');
  let evaluated = 0, skipped = 0;
  for (const c of p.candidates) {
    if (c.jobId !== job.id || c.stage !== 'new' || c.aiEval) continue;
    if (a.credits < 1) break;
    if (c.aiOptOut ?? (c.aiOptOut = rng(state) < ASHBY.optOut)) { skipped++; c.aiEval = { optedOut: true, day: state.day }; continue; }
    a.credits--; a.used++;
    const results = job.aiCriteria.list.map((cr) => {
      if (cr.warn.length && !cr.trait) return { criterion: cr.text, status: chance(state, 0.5) ? 'meets' : 'does_not_meet', reason: 'Inferred from indirect resume cues (unreliable and legally risky).', proxy: true };
      if (!cr.trait) return { criterion: cr.text, status: 'undecided', reason: 'Nothing in the resume speaks to this.' };
      const r = READ(c, cr.trait, state);
      if (r == null) return { criterion: cr.text, status: 'undecided', reason: 'Generic application text; no specifics to check.' };
      const status = r > 0.35 ? 'meets' : r < -0.45 ? 'does_not_meet' : 'undecided';
      const line = (c.signals ?? []).find((sg) => sg.tone === (status === 'meets' ? 'good' : 'bad'))?.text ?? (c.signals?.[0]?.text ?? 'resume');
      return { criterion: cr.text, status, reason: status === 'undecided' ? 'Mixed signals in the resume.' : `Based on: "${line}".` };
    });
    c.aiEval = { day: state.day, results, met: results.filter((r) => r.status === 'meets').length, total: results.length, reviewed: false };
    evaluated++;
  }
  job.aiEvaluated = (job.aiEvaluated ?? 0) + evaluated;
  return { evaluated, skipped, credits: a.credits };
}

/** Human review of one candidate's AI reasoning (~3 min). Corrects a clearly wrong "does not meet". */
export function reviewAiEval(state, c) {
  if (!c.aiEval || c.aiEval.optedOut) throw new Error('No AI evaluation to review.');
  c.aiEval.reviewed = true;
  const strong = roleComposite(c.role, c.traits) > 0.3 && !c.fraud;
  const fixed = strong ? c.aiEval.results.filter((r) => r.status === 'does_not_meet' && !r.proxy).slice(0, 1) : [];
  for (const r of fixed) { r.status = 'undecided'; r.reason += ' (You read the resume: the evidence is there, the AI missed it.)'; }
  c.aiEval.met = c.aiEval.results.filter((r) => r.status === 'meets').length;
  return { corrected: fixed.length };
}

/** Bulk-reject candidates under a met share without reading them (the mediocre shortcut). */
export function autoReject(state, p, job, minShare = 0.5) {
  const out = [];
  for (const c of p.candidates) {
    if (c.jobId !== job.id || c.stage !== 'new' || !c.aiEval || c.aiEval.optedOut) continue;
    if (c.aiEval.met / Math.max(1, c.aiEval.total) < minShare) { c.stage = 'rejected'; c.rejectedBy = 'ai'; out.push(c); }
  }
  const missed = out.filter((c) => !c.aiEval.reviewed && roleComposite(c.role, c.traits) > 0.35 && !c.fraud).length;
  job.autoRejected = (job.autoRejected ?? 0) + out.length;
  if (missed) logMistake(state, { functionId: 'hiring', id: 'ai_auto_reject', label: 'AI auto-reject without human review', app: 'people', delayed: true, cost: { days: 7 * missed, hours: 0 }, detail: `${job.title}: auto-rejected ${out.length} applicants on the percent-met column; ${missed} of them were strong candidates the resume read missed (Ashby: results "may be inaccurate").` });
  if (out.length && job.aiCriteria?.ignoredWarnings && chance(state, 0.04)) scheduleClaim(state, p, `Applicants to ${job.title}`, 'disparate impact (automated screening)');
  return { rejected: out.length, missed };
}

/** Weekly resume triage hours for job-board applications (manual vs AI criteria + review). */
export function triageHours(job, newApplications) {
  if (!newApplications) return 0;
  if (job.aiCriteria && job.aiEvaluated) return round2(Math.min(TRIAGE.aiReviewHoursPerJob, 0.1 + newApplications * 0.01));
  return round2(Math.min(TRIAGE.capHoursPerJob, (newApplications * TRIAGE.minutesPerApplication) / 60));
}


