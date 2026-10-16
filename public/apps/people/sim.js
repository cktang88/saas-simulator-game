// People simulation: state slice, player actions (pure state mutations used by the UI and tests),
// and the daily/monthly tick (pipeline, payroll, support load, morale, attrition, AI agent billing).

import { ensure, notify, log } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { post, addRecurring, balance } from '../../core/bank.js';
import { activeSubs, trialingSubs, mrr } from '../../core/stripe.js';
import { setModifier } from '../../core/market.js';
import { newThread, addMessage, findThread } from '../../core/mail.js';
import { scheduleEvent, completeEvent, cancelEvent, ensureCalendar } from '../../core/calendar.js';
import { uid, rng, poisson, chance, clamp, round2, dayOfWeek, dayOfMonth, dateOf, fmtDate, money, gaussian } from '../../core/util.js';
import { ROLES, JOB_ROLES, AI_AGENTS, EQUITY, BASE_ATTRITION_MONTHLY, ONBOARDING_HOURS_PER_WEEK, ONBOARDING_WEEKS } from './catalog.js';
import { acceptProbability, marketMid, rampFactor } from './hiring.js';
import { ROLES as DATA_ROLES, METHODS, z } from '../../data/roles.js';
import { makeCandidate, TRAIT_IDS } from './candidates.js';
import { gradeQuestion, interviewEvidence, observe, estimate } from './interview.js';
import { runAssessment } from './assess.js';
import { AGENCY, channelFits, channelFlow, chargeOnStart, chargeWeekly, chargeOnClose, placementFee, contractorFeePct, guaranteeRefund, conversionFee, recordOwnership, ownershipClaim, openDispute, resolveDispute, daysToFirst, AI_APPLICATION_SHARE } from './sourcing.js';
import { productivityFor, managementHours, monthlyRead, monthlyIncidents, startPip, resolvePip } from './performance.js';
import { recordPublicEvent } from '../../core/network.js';
import { runPayrollIfDue, payContractors, contractorInvoice, severanceCost, vendorBills, monthlyCostOf } from './payroll.js';
import { activePolicy } from './benefits.js';
import { compDay, compMonthEnd, effectiveOfferSalary, checkOteMarket } from './comp.js';
import { gtmTeamDay } from './gtm-team.js';
import { supportWeek, weeklyTickets, staffTicketsPerWeek, SUPPORT, supportAiErrorRate } from './support.js';
import { computeAiCodingMultiplier, monthlyPeopleCost, moraleFactor } from './capacity.js';
import { entityOf, hasEin, ciiaaReady } from '../legal/api.js';
import { fdShares, poolTotal } from '../fundraising/captable.js';
import { hireProvenance, exitPostMortem, concerningNote, misfitP12, monthlyHazard, clarityMult, memberFit, provenanceLine } from './provenance.js';
import { ensureMgmt, weeklyManage, oneOnOneHours, moraleShift, attritionMult, onboardingMult, monthlyNeglect, onResignation, onTermination, processClaims } from './manage.js';
import { backgroundDay, screeningClaimsDay, atsDay, onRejectWithReport, triageHours } from './screening.js';
import { REGION_IDS } from '../../data/regions.js';
import { hireVetting, ensureGlobal, regionData, regionFlow, globalStart, globalWeekly, globalMonthly, attritionFactor, moraleDrag, recordEnglish, englishEstimate, refreshOverlap, partTimeFit, isFractionalRole, loadRatio, coreOf, partTimePremium } from './global.js';
import { opsOnOffer, opsGate, opsAdjustProb, opsOnDecline, opsOnHire, opsOnStart, opsOnOpenJob, opsOnExit, opsDay, opsWeekly, opsMoraleShift, opsMonthEnd } from './ops.js';
import { signOnBoost, belowRangeComplaint } from './negotiation.js';
import { candidateBackchannel, carryClaimsToHire, misledQuitHazard, offerVsPostedRange } from './integrity.js';
import './readers.js'; // registers the hiring and people_management operator readers
import './ops-readers.js'; // registers the people_ops operator reader
import { dueDay } from '../../core/timing.js';

export function ensurePeople(state) {
  const p = ensure(state, 'people', () => ({
    members: [], jobs: [], candidates: [], runs: [],
    aiCodingMultiplier: 1, aiReview: true, benefits: 'standard',
    payrollSetup: { gusto: false, deel: false },
    support: { backlog: 0, docsHours: 0, docsQuality: 0, founderCapHours: 8, lastWeek: null, history: [], monthResolutions: 0 },
    equity: { valuation: null, poolPct: 0 },
    vendorRec: { gusto: null, deel: null },
    hires: 0,
  }));
  // The default stack already pays for Claude Max: show it as the founder's coding-agent seat.
  const rec = state.recurring.find((r) => r.active && /claude max/i.test(r.vendor));
  if (rec && !p.members.some((m) => m.recurringId === rec.id)) {
    p.members.push({ id: uid('mem'), name: 'Claude Max (your seat)', role: 'engineer', kind: 'ai_agent', agentType: 'code_max', status: 'active', startDay: 0, readyDay: 0, hoursPerWeek: 0, monthlyCost: rec.amount, equityPct: 0, recurringId: rec.id });
    p.aiCodingMultiplier = computeAiCodingMultiplier(state);
  }
  return p;
}

const humansActive = (p) => p.members.filter((m) => m.kind !== 'ai_agent' && m.status === 'active');
export const findCand = (p, id) => p.candidates.find((c) => c.id === id);
export const findJob = (p, id) => p.jobs.find((j) => j.id === id);
export const findMember = (p, id) => p.members.find((m) => m.id === id);

function runwayMonths(state) {
  // AI agents billed through a recurring bill are already in the recurring total: don't count them twice.
  const recIds = new Set(state.recurring.filter((r) => r.active).map((r) => r.id));
  const agentsOnBills = ensurePeople(state).members.filter((m) => (m.status === 'active' || m.status === 'offer') && m.recurringId && recIds.has(m.recurringId)).reduce((a, m) => a + monthlyCostOf(state, m), 0);
  const burn = monthlyPeopleCost(state) - agentsOnBills + state.recurring.filter((r) => r.active).reduce((a, r) => a + r.amount, 0) - mrr(state);
  return burn > 0 ? balance(state) / burn : 99;
}

export function offerContext(state) {
  const p = ensurePeople(state);
  return {
    path: state.company.path, incorporated: state.company.incorporated, entity: entityOf(state),
    runwayMonths: runwayMonths(state), raised: state.bank.txns.some((t) => t.category === 'investment'), hireIndex: p.hires,
  };
}

// ---------------------------------------------------------------------------
// Hiring actions
// ---------------------------------------------------------------------------

export function createJob(state, { role, title, region, engagement, payLo, payHi, hoursPerWeek = 40, text, remote = true, requiredOverlap = 0, allowShift = false, senior = false }) {
  const p = ensurePeople(state);
  if (!JOB_ROLES[role]) throw new Error('Pick a role.');
  if (!REGION_IDS.includes(region)) throw new Error('Pick a region.');
  // Part-time employee and fractional are engagements the form offers; underneath they are an employee/EOR or a
  // contractor with fewer hours (and flags), so payroll, vendors and the rest keep working.
  let partTime = false, fractional = false;
  if (engagement === 'part_time_employee') { engagement = region === 'us' ? 'employee' : 'eor'; partTime = true; }
  if (engagement === 'fractional') { engagement = 'contractor'; fractional = true; }
  if (isFractionalRole(role) && !(fractional || engagement === 'contractor')) throw new Error('Fractional executives are engaged as fractional (retainer or hourly) or contractor.');
  if (isFractionalRole(role)) fractional = true;
  if (fractional && !isFractionalRole(role)) throw new Error('Fractional is for executive roles (CFO, CMO, VP Sales, Head of CS). Use "contractor" with fewer hours for other work.');
  if (engagement === 'employee' && region !== 'us') throw new Error('Employees abroad need an EOR (Deel). Pick "EOR" or "Contractor".');
  if (engagement === 'eor' && region === 'us') throw new Error('US hires are regular W-2 employees via Gusto.');
  const hours = fractional ? clamp(hoursPerWeek, 4, 20) : engagement === 'contractor' ? clamp(hoursPerWeek, 5, 40) : partTime ? clamp(hoursPerWeek, 10, 30) : 40;
  const req = clamp(Number(requiredOverlap) || 0, 0, 8);
  const job = { id: uid('job'), role, title: title || JOB_ROLES[role].label, region, engagement, remote, payLo: payLo || 0, payHi: payHi || 0, hoursPerWeek: hours, partTime, fractional, requiredOverlap: req, allowShift: Boolean(allowShift), senior: Boolean(senior), text: text ?? '', judge: null, quality: null, payTransparency: false, channels: [], channelStart: {}, status: 'draft', createdDay: state.day, openedDay: null, applications: 0, aiApplications: 0, shortlisted: 0, scorecard: null, workSampleReady: false };
  p.jobs.unshift(job);
  return job;
}

export function applyJudge(job, judge) {
  job.judge = judge;
  job.payTransparency = Boolean(judge.payTransparency);
  job.quality = round2(clamp(((judge.clarity + judge.specificity) / 20) * (judge.payTransparency ? 1.1 : 0.85), 0, 1));
}

// Structured scorecard (mission, 3–5 outcomes, 5–8 competencies). Costs ~3h to design (METHODS.structuredInterview).
export function createScorecard(state, jobId, { mission = '', outcomes = [], competencies = [] }) {
  const job = findJob(ensurePeople(state), jobId);
  if (!job) throw new Error('No such job.');
  const comps = competencies.filter((k) => DATA_ROLES[job.role]?.traitWeights[k] != null || ['integrity', 'coachability', 'empathy', 'grit', 'domain', 'gma'].includes(k));
  if (comps.length < 3) throw new Error('Pick at least 3 competencies to score.');
  if (outcomes.filter((o) => String(o).trim().length > 10).length < 2) throw new Error('Write at least 2 concrete outcomes for the first 6–12 months.');
  job.scorecard = { mission: String(mission).slice(0, 400), outcomes: outcomes.map((o) => String(o).slice(0, 200)).filter(Boolean).slice(0, 5), competencies: comps.slice(0, 8), day: state.day };
  return job.scorecard;
}

export function designWorkSample(state, jobId) {
  const job = findJob(ensurePeople(state), jobId);
  if (!job) throw new Error('No such job.');
  job.workSampleReady = true;
}

export function openJob(state, jobId, channels) {
  const p = ensurePeople(state);
  const job = findJob(p, jobId);
  if (!job) throw new Error('No such job.');
  if (!job.judge) throw new Error('Publish the post first (it gets reviewed).');
  const valid = channels.filter((c) => channelFits(state, AGENCY[c], job));
  if (!valid.length) throw new Error('Pick at least one channel that fits this role and engagement.');
  job.channelStart ??= {};
  for (const c of valid) {
    if (job.channels.includes(c)) continue;
    chargeOnStart(state, AGENCY[c], job);
    job.channels.push(c);
    job.channelStart[c] = state.day + Math.round(daysToFirst(state, AGENCY[c]) * regionData(job.region).fillMult); // thin or slow markets take longer to produce a first candidate
    if (AGENCY[c].kind === 'job_board') recordPublicEvent(state, 'hiring_post', { role: job.role });
  }
  job.status = 'open';
  job.openedDay ??= state.day;
  opsOnOpenJob(state, job); // pay-transparency law and the office-required applicant pool (people/ops.js)
  return job;
}

export function closeJob(state, jobId) {
  const p = ensurePeople(state);
  const job = findJob(p, jobId);
  if (!job || job.status === 'closed') return;
  chargeWeekly(state, job, Math.max(0, (state.day - (job.lastBilledDay ?? job.openedDay ?? state.day))));
  chargeOnClose(state, job);
  job.status = 'closed';
  job.closedDay = state.day;
  for (const c of p.candidates) if (c.jobId === jobId && ['new', 'screened'].includes(c.stage)) c.stage = 'rejected';
}

export function screenCandidate(state, candId, advance) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!c || !['new'].includes(c.stage)) throw new Error('Candidate is not awaiting screening.');
  c.lastTouchDay = state.day;
  c.screenDay = state.day;
  if (!advance) { c.stage = 'rejected'; return c; }
  c.stage = 'screened';
  // A 20-minute screen call: basically an unstructured chat (validity ~.19, polish weight .45).
  const u = METHODS.unstructuredInterview;
  c.evidence ??= [];
  c.evidence.push({ method: 'screen', target: 'composite', v: u.validity, obs: observe(c, 'composite', u.validity, gaussian(state), u.polishWeight) });
  // Twenty minutes of talking: a rough read of spoken English (fluent presenters sound a little better than they are).
  recordEnglish(state, c, 'screen call', 1.1, 0.2 * z(c.traits.polish));
  return c;
}

export function scheduleInterview(state, candId, slot) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!c || c.stage !== 'screened') throw new Error('Screen the candidate first.');
  const minutes = Math.round(METHODS.structuredInterview.costHours.perCandidate * 60);
  const ev = scheduleEvent(state, { title: `Interview: ${c.name} (${JOB_ROLES[c.role]?.label ?? c.role})`, kind: 'interview', app: 'people', refId: c.id, with: { name: c.name, email: c.email }, day: slot.day, start: slot.start, duration: minutes, location: 'Video call (camera on)', notes: 'Structured interview. Join from People → candidate.' });
  c.stage = 'interview_scheduled';
  c.interview = { eventId: ev.id, day: slot.day, messages: [], started: false, done: false };
  c.lastTouchDay = state.day;
  return ev;
}

export function interviewEvent(state, c) {
  return c?.interview ? ensureCalendar(state).events.find((e) => e.id === c.interview.eventId) : null;
}

// Can the player join the interview now? (On the meeting's day; the calendar charges the time.)
export function canJoin(state, c) {
  const ev = interviewEvent(state, c);
  return Boolean(ev && ev.day === state.day && ['scheduled', 'in_progress'].includes(ev.status) && !c.interview.done);
}

// camera: insist on camera on, good light, and a live ID / location check (a request, not a hostile act). Candidates
// running an identity-fraud scheme often decline, glitch or "have technical problems" (DOJ remote IT worker cases).
export function startInterview(state, candId, { camera = false } = {}) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!canJoin(state, c)) throw new Error('You can only join on the day of the interview.');
  const ev = interviewEvent(state, c);
  ev.status = 'in_progress';
  c.interview.started = true;
  c.interview.camera = Boolean(camera);
  if (camera && c.fraud === 'stand_in') {
    c.redFlags ??= [];
    if (chance(state, 0.3)) {
      c.interview.done = true; c.stage = 'withdrawn'; c.withdrawReason = 'ended the call when asked to keep the camera on and show ID';
      completeEvent(state, ev.id, 'done', { withdrawn: true });
    } else if (chance(state, 0.5)) {
      c.redFlags.push('On camera: lag, off-axis gaze, a virtual background that glitched, and a refusal to hold ID to the lens');
    }
  }
  return c;
}

// Record and grade a founder question. Illegal topics → warning, complaint risk, candidate may leave.
// Returns { grade, depth, ended }.
export function askQuestion(state, candId, text) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!c?.interview?.started || c.interview.done) throw new Error('The interview is not running.');
  const mine = c.interview.messages.filter((m) => m.from === 'me');
  const prev = mine.at(-1)?.grade ?? null;
  const grade = gradeQuestion(text, c.role, prev);
  let depth = 0;
  for (let i = mine.length - 1; i >= 0 && mine[i].grade?.type === 'probe'; i--) depth++;
  if (grade.type === 'probe') depth++;
  c.interview.messages.push({ from: 'me', text, grade });
  let ended = false;
  if (grade.illegal) {
    c.interview.illegal = (c.interview.illegal ?? 0) + 1;
    p.legalRisk ??= [];
    p.legalRisk.push({ day: state.day, candidate: c.name, topic: grade.illegal.topic });
    // Complaint 2–5% per incident; candidate withdraws 10–25% (research §7 [design]).
    if (chance(state, 0.035)) {
      p.complaints ??= [];
      p.complaints.push({ id: uid('eeoc'), candidate: c.name, topic: grade.illegal.topic, dueDay: state.day + 30 + Math.floor(rng(state) * 60), status: 'pending' });
    }
    if (chance(state, 0.18)) {
      ended = true;
      c.interview.done = true;
      c.stage = 'withdrawn';
      c.withdrawReason = 'ended the interview after an inappropriate question';
      const ev = interviewEvent(state, c);
      if (ev) completeEvent(state, ev.id, 'done', { withdrawn: true });
    }
  }
  return { grade, depth, ended };
}

export function finishInterview(state, candId) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!c?.interview?.started) throw new Error('Interview not started.');
  const graded = c.interview.messages.filter((m) => m.from === 'me' && m.grade).map((m) => m.grade);
  const job = findJob(p, c.jobId);
  const res = interviewEvidence(state, c, graded, { scorecard: Boolean(job?.scorecard) });
  c.evidence ??= [];
  c.evidence.push(...res.evidence);
  c.interview.execution = res.execution;
  c.interview.validity = res.validity;
  c.interview.polishWeight = res.polishWeight;
  c.interview.done = true;
  // The more the candidate talks through real cases (structured, probing questions), the clearer their English reads.
  const talk = graded.filter((g) => g.quality != null && g.type !== 'logistics').length;
  recordEnglish(state, c, 'interview', clamp(1.05 - 0.75 * res.execution, 0.3, 1.1) * (talk < 2 ? 1.2 : 1), 0.2 * z(c.traits.polish) * (1 - res.execution));
  const ints = c.interview.messages.filter((m) => m.from === 'them' && typeof m.interest === 'number').map((m) => m.interest);
  if (ints.length) c.interest = round2(clamp(ints.at(-1) / 10, 0, 1));
  if (c.stage !== 'withdrawn') c.stage = 'interviewed';
  c.lastTouchDay = state.day;
  const ev = interviewEvent(state, c);
  if (ev && ev.status !== 'done') completeEvent(state, ev.id, 'done', { execution: res.execution });
  return c;
}

// The founder's 1–5 scorecard ratings per competency (their judgement, recorded for the decision).
export function rateScorecard(state, candId, ratings) {
  const c = findCand(ensurePeople(state), candId);
  if (!c) throw new Error('No such candidate.');
  c.scorecard = Object.fromEntries(Object.entries(ratings).map(([k, v]) => [k, clamp(Math.round(Number(v) || 3), 1, 5)]));
  return c.scorecard;
}

export function assessCandidate(state, candId, key) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!c || !['screened', 'interview_scheduled', 'interviewed'].includes(c.stage)) throw new Error('Screen the candidate first.');
  const job = findJob(p, c.jobId);
  if (key === 'workSample' && !job?.workSampleReady) throw new Error('Design the work sample for this job first.');
  const r = runAssessment(state, c, key, { scorecard: Boolean(job?.scorecard) });
  c.lastTouchDay = state.day;
  if (!r.ok && c.stage === 'withdrawn') notify(state, r.text, { type: 'warn', app: 'people' });
  return r;
}

export function candidateEstimates(c) {
  const ev = c.evidence ?? [];
  const out = { composite: estimate(ev, 'composite') };
  for (const t of TRAIT_IDS) { if (t === 'polish') continue; const e = estimate(ev, t); if (e) out[t] = e; }
  return out;
}

export function rejectCandidate(state, candId) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!c) return;
  const ev = interviewEvent(state, c);
  if (ev && ev.status === 'scheduled') cancelEvent(state, ev.id, 'candidate rejected');
  onRejectWithReport(state, p, c);
  c.stage = 'rejected';
}

// Option pool in use (% of company): live grants, plus what departed members had vested when they left
// (vested options are exercised or held; only the unvested part returns to the pool). [design: exercise assumed]
export function poolUsed(p) {
  return p.members.reduce((a, m) => {
    const pct = m.equityPct || 0;
    if (!pct) return a;
    if (m.status !== 'gone') return a + pct;
    const end = m.endDay ?? m.leftDay;
    return m.grant && m.grant.status !== 'pending' && end != null ? a + vestedPct(m, end) : a;
  }, 0);
}

// Validate and send an offer. offer: { salary | hourlyRate, equityPct, startDay, hoursPerWeek }
export function makeOffer(state, candId, offer) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!c || !['interviewed', 'screened'].includes(c.stage)) throw new Error('Interview the candidate before making an offer.');
  const contractor = c.engagement === 'contractor';
  if (c.engagement === 'employee') {
    if (!state.company.incorporated || !hasEin(state)) throw new Error('W-2 employees need a company with an EIN. Incorporate in Legal first.');
    if (!p.payrollSetup.gusto) throw new Error('Set up payroll (Gusto) first: state tax registrations, bank verification.');
  }
  if (c.engagement === 'eor' && !p.payrollSetup.deel) throw new Error('Set up Deel first.');
  if (contractor && c.region !== 'us' && !p.payrollSetup.deel) throw new Error('Set up Deel first to pay contractors abroad.');
  if (contractor && c.region === 'us' && !p.payrollSetup.gusto && !p.payrollSetup.deel) throw new Error('Set up Gusto or Deel first to pay US contractors (W-9, 1099 tracking).');
  const notice = c.noticeDays ?? (contractor ? 3 : 14);
  const minStart = state.day + notice;
  if (offer.startDay < minStart) throw new Error(`Earliest realistic start is ${fmtDate(state, minStart)} (${notice <= 5 ? 'a few days' : `${notice} days' notice`}${c.region !== 'us' ? `, typical in ${regionData(c.region).label}` : ''}).`);
  // Hours: part-time employees 10-30 h/week, fractional 4-20, contractors 5-40, everyone else full time.
  const hours = c.fractional ? clamp(offer.hoursPerWeek ?? c.hoursPerWeek, 4, 20) : contractor ? clamp(offer.hoursPerWeek ?? c.hoursPerWeek ?? 40, 5, 40) : c.partTime ? clamp(offer.hoursPerWeek ?? c.hoursPerWeek, 10, 30) : 40;
  const eq = contractor ? 0 : Math.max(0, offer.equityPct || 0);
  if (eq > 0) {
    if (entityOf(state) !== 'ccorp') throw new Error('Stock options need a C-corp. LLCs use profits interests (lawyer needed).');
    if (!p.equity.poolPct) throw new Error('Create an option pool first (Equity tab).');
    const used = poolUsed(p);
    if (used + eq > p.equity.poolPct + 1e-9) throw new Error(`Only ${(p.equity.poolPct - used).toFixed(2)}% left in the pool.`);
  }
  const o = {
    salary: contractor ? null : Math.round(offer.salary), hourlyRate: contractor ? Math.round(offer.hourlyRate) : null,
    equityPct: eq, startDay: offer.startDay, hoursPerWeek: hours,
    // a part-time employee's ask scales with the hours you offer (they priced the job's hours)
    expectation: !contractor && c.hoursPerWeek && hours !== c.hoursPerWeek ? Math.round(c.expectation * hours / c.hoursPerWeek) : c.expectation, localIp: Boolean(offer.localIp),
    sentDay: state.day, decideDay: null, ciiaa: ciiaaReady(state), cor: Boolean(offer.cor),
    signOn: contractor ? 0 : Math.max(0, Math.round(offer.signOn || 0)), deadlineDays: offer.deadlineDays ?? null,
  };
  o.p = round2(acceptProbability({ ...c, expectation: o.expectation ?? c.expectation }, { ...o, salary: effectiveOfferSalary(state, c, o) + signOnBoost(o) }, offerContext(state)));
  // A strong offer gets a fast yes; a borderline one sits while they shop it against other processes [design].
  o.decideDay = Math.max(state.day + 1, dueDay(state, 'candidate.offerDecision', [o.p >= 0.7 ? { label: 'strong offer', pull: -0.7 } : o.p < 0.4 ? { label: 'shopping it around', pull: 0.8 } : null]));
  // A local-law IP assignment for a contractor abroad: counsel reviews the clause once per country ($400-900 [design]).
  if (contractor && c.region !== 'us' && o.localIp) {
    const g = ensureGlobal(p);
    if (!g.ipReviewed[c.region]) {
      post(state, { amount: -650, counterparty: 'Local counsel', description: `Local-law IP assignment and confidentiality clause (${regionData(c.region).label})`, category: 'legal', method: 'ach', meta: { app: 'people' } });
      g.ipReviewed[c.region] = state.day;
    }
  }
  c.offer = o;
  c.stage = 'offer';
  c.lastTouchDay = state.day;
  // The posted range is a promise to every applicant: an offer below it reads as bait-and-switch (people/integrity.js).
  const rangeCheck = offerVsPostedRange(state, c, findJob(p, c.jobId), contractor ? o.hourlyRate : o.salary);
  if (rangeCheck.below) { c.offerSentiment = round2((c.offerSentiment ?? 0) - 0.1); o.belowPostedRange = true; belowRangeComplaint(state, c, findJob(p, c.jobId)); }
  opsOnOffer(state, c, o); // competing offers, an employer counteroffer, a possible deadline (people/negotiation.js)
  const pay = contractor ? `$${o.hourlyRate}/hour, ~${o.hoursPerWeek}h/week` : `$${o.salary.toLocaleString('en-US')} base salary${eq ? ` and options for ${eq}% of the company (4-year vesting, 1-year cliff)` : ''}`;
  const t = findThread(state, c.id) ?? newThread(state, { subject: `Offer: ${JOB_ROLES[c.role]?.label ?? c.role} at ${state.company.name}`, with: { name: c.name, email: c.email }, kind: 'candidate', app: 'people', refId: c.id });
  addMessage(state, t.id, { from: 'me', body: `Hi ${c.name.split(' ')[0]},\n\nThanks for the conversations. We'd love to have you join ${state.company.name}. Offer: ${pay}, start date ${fmtDate(state, o.startDay)}.${o.ciiaa ? ' The offer includes our standard confidentiality & invention assignment agreement (CIIAA).' : ''}\n\nHappy to answer any questions.` });
  return o;
}

function decideOffer(state, p, c) {
  const o = c.offer;
  const gate = opsGate(state, p, c); // the candidate may counter first (people/negotiation.js); no main-rng draws here
  if (gate.action === 'wait') return null;
  const t = findThread(state, c.id);
  const first = c.name.split(' ')[0];
  if (gate.action === 'decline') {
    c.stage = 'declined';
    if (t) addMessage(state, t.id, { from: 'them', body: `Thanks for the offer. ${gate.reason} Best of luck with ${state.company.name}. — ${first}` });
    notify(state, `${c.name} declined your offer.`, { type: 'bad', app: 'people' });
    opsOnDecline(state, c, gate.reason, gate.cause);
    return null;
  }
  // Candidates weigh what they were told (a claimed runway) until their backchannel says otherwise (people/integrity.js).
  const bc = candidateBackchannel(state, c, offerContext(state));
  let prob = acceptProbability({ ...c, expectation: o.expectation ?? c.expectation }, { ...o, salary: effectiveOfferSalary(state, c, o) + signOnBoost(o) }, bc.ctx);
  prob = opsAdjustProb(state, c, prob) * bc.mult;
  if (chance(state, prob)) {
    c.stage = 'hired';
    const m = hireFromCandidate(state, p, c);
    if (t) addMessage(state, t.id, { from: 'them', body: `Hi! I'm happy to accept. Looking forward to starting on ${fmtDate(state, o.startDay)}. — ${first}` });
    notify(state, `${c.name} accepted your offer (${JOB_ROLES[c.role]?.label ?? c.role}). Starts ${fmtDate(state, o.startDay)}.`, { type: 'good', app: 'people' });
    const a = AGENCY[c.channel];
    const fee = placementFee(a, o.salary ?? 0).fee;
    if (fee > 0) {
      post(state, { amount: -fee, counterparty: a.label, description: `Placement fee ${Math.round(a.costModel.pct * 100)}% of first-year base: ${c.name}`, category: 'other', method: 'ach', meta: { app: 'people', recruiting: true } });
      m.placement = { agencyId: a.id, fee, day: state.day };
    }
    const claim = ownershipClaim(p, c, state.day);
    if (claim) openDispute(state, p, { agencyId: claim.agencyId, name: c.name, salary: o.salary ?? (o.hourlyRate ?? 0) * 2080, memberId: m.id });
    if (a?.kind === 'referral') { p.bonuses ??= []; p.bonuses.push({ memberId: m.id, name: c.name, dueDay: o.startDay + (a.bonusPaidAfterDays ?? 90), amount: a.costModel.oneTime, status: 'pending' }); }
    const job = findJob(p, c.jobId);
    if (job && job.status === 'open') closeJob(state, job.id);
    return m;
  }
  c.stage = 'declined';
  const why = c.persona.otherOffers ? 'I decided to take another offer that was a better fit for me right now.' : o.p < 0.4 ? 'The compensation is too far from what I need.' : 'After thinking it over I\'m going to stay where I am for now.';
  if (t) addMessage(state, t.id, { from: 'them', body: `Thanks so much for the offer. ${why} Best of luck with ${state.company.name}. — ${first}` });
  notify(state, `${c.name} declined your offer.`, { type: 'bad', app: 'people' });
  opsOnDecline(state, c, why);
  return null;
}

export function hireFromCandidate(state, p, c) {
  const o = c.offer;
  const dr = DATA_ROLES[c.role]?.rampWeeks?.full;
  const m = {
    id: uid('mem'), name: c.name, role: JOB_ROLES[c.role]?.memberRole ?? c.role, jobRole: c.role,
    kind: c.engagement === 'contractor' ? 'contractor' : 'employee', engagement: c.engagement,
    region: c.region, status: 'offer', startDay: o.startDay, hoursPerWeek: o.hoursPerWeek, salary: o.salary, hourlyRate: o.hourlyRate,
    equityPct: o.equityPct, traits: { ...c.traits }, fraud: c.fraud ?? null, morale: 72, ciiaa: o.ciiaa, cor: o.cor,
    // A template in the offer is not a signature: with e-signature the CIIAA is signed with the offer; otherwise it is
    // an onboarding step (collectCiiaa). Diligence checks signatures, not templates (legal/sim.js runLegalDiligence).
    ciiaaSigned: o.ciiaa && state.apps.legal?.docs?.esign ? state.day : null,
    platformFeePct: contractorFeePct(AGENCY[c.channel]), channel: c.channel, candidateId: c.id,
    rampWeeks: c.engagement === 'contractor' ? 2 : dr ? Math.round((dr[0] + dr[1]) / 2) : JOB_ROLES[c.role]?.rampWeeks ?? 8, hiredDay: state.day,
    // where they work from and how (people/global.js): all output modifiers read these in one place (performance.js outputFor)
    city: c.city ?? c.location, country: c.country, tz: c.tz ?? null, workStart: c.workStart, windowLen: c.windowLen, english: c.englishLevel, buyerFit: c.buyerFit,
    nightShift: Boolean(c.nightShift), moonlight: Boolean(c.moonlight), fractional: Boolean(c.fractional), partTime: Boolean(c.partTime), loadHours: c.loadHours ?? null,
    ipLocal: Boolean(o.localIp) || c.region === 'us' || c.engagement === 'eor', seniority: c.seniority,
  };
  if (m.tz != null) refreshOverlap(state, m);
  m.productivity = productivityFor(m);
  m.monthlyCost = monthlyCostOf(state, m);
  m.provenance = hireProvenance(state, findJob(p, c.jobId), c);
  carryClaimsToHire(state, c, m);
  m.vetting = hireVetting(state, c, findJob(p, c.jobId));
  if (!m.provenance.references && !m.provenance.backchannel && !m.provenance.workSample) {
    // Onboarding gaps from a hire nobody vetted [design]: ~6 founder hours of rework. A later mis-hire post-mortem
    // already lists these skipped steps (provenance.skipped).
    logMistake(state, { functionId: 'hiring', id: 'hire_unvetted', label: 'Hired with no references and no work sample', app: 'people', key: `unvetted:${c.id}`, cost: { hours: 6 }, charge: true, detail: `${c.name}: no reference calls, no backchannel and no work sample, so strengths and gaps surfaced only after the start date. If this turns into a mis-hire, the post-mortem will name these skipped steps.` });
  }
  ensureMgmt(m);
  if (o.equityPct > 0) {
    const v = p.equity.valuation;
    const valid = v && state.day <= v.validUntil;
    m.grant = { pct: o.equityPct, vestStart: o.startDay, cliffDay: o.startDay + EQUITY.cliffDays, vestYears: EQUITY.vestYears, strike: valid ? v.fmv : null, status: valid ? 'granted' : 'pending' };
    if (!valid) notify(state, `${c.name}'s option grant can't be priced until you have a current 409A valuation (Equity tab).`, { type: 'warn', app: 'people' });
  }
  p.members.push(m);
  if (m.kind !== 'contractor') p.hires++;
  checkOteMarket(state, m);
  opsOnHire(state, p, m, c); // terms check (lowball, renege draw), onboarding checklist, work state (people/ops.js)
  return m;
}

// Convert a staffing / contract-to-hire contractor to a direct employee (conversion fee minus billed-hour credit).
export function convertToEmployee(state, memberId, salary) {
  const p = ensurePeople(state);
  const m = findMember(p, memberId);
  if (!m || m.engagement !== 'contractor' || m.status !== 'active') throw new Error('Only active contractors can convert.');
  if (m.region !== 'us') throw new Error('Abroad, convert through an EOR instead.');
  if (!p.payrollSetup.gusto) throw new Error('Set up Gusto first.');
  const hours = ((state.day - m.startDay) / 7) * (m.hoursPerWeek ?? 40);
  const fee = conversionFee(AGENCY[m.channel], salary, hours);
  if (fee > 0) post(state, { amount: -fee, counterparty: AGENCY[m.channel].label, description: `Conversion fee: ${m.name}`, category: 'other', method: 'ach', meta: { app: 'people', recruiting: true } });
  // Final contractor invoice for this month up to yesterday (month-end contractor runs skip employees); salary starts today.
  if (state.day - 1 >= m.startDay) contractorInvoice(state, m, state.day - dayOfMonth(state) + 1, state.day - 1);
  Object.assign(m, { engagement: 'employee', kind: 'employee', salary: Math.round(salary), hourlyRate: null, platformFeePct: 0, hoursPerWeek: 40, convertedDay: state.day });
  syncVendorBills(state);
  return fee;
}

export function disputeFee(state, disputeId, action) {
  return resolveDispute(state, ensurePeople(state), disputeId, action);
}

export function putOnPip(state, memberId) {
  const m = findMember(ensurePeople(state), memberId);
  if (!m || m.kind === 'ai_agent' || m.status !== 'active') throw new Error('Not an active team member.');
  startPip(state, m);
}

// ---------------------------------------------------------------------------
// Team actions
// ---------------------------------------------------------------------------

export function setupPayroll(state, vendor) {
  const p = ensurePeople(state);
  if (vendor === 'gusto' && !hasEin(state)) throw new Error('Gusto needs your EIN and state employer accounts. Incorporate and get an EIN in Legal first.');
  p.payrollSetup[vendor] = true;
  syncVendorBills(state);
}

export function terminate(state, memberId, { severanceWeeks = 0, reason = 'let go' } = {}) {
  const p = ensurePeople(state);
  const m = findMember(p, memberId);
  if (!m || m.status === 'gone') throw new Error('Not on the team.');
  if (m.kind === 'ai_agent') return cancelAgent(state, memberId);
  const cand = m.candidateId ? findCand(p, m.candidateId) : null;
  if (cand && !(cand.backgroundCheck?.adverse)) onRejectWithReport(state, p, cand);
  if (m.status === 'offer') { m.status = 'gone'; m.endDay = state.day; m.exitReason = 'offer rescinded'; syncVendorBills(state); return 0; }
  m.status = 'gone';
  m.endDay = state.day;
  m.exitReason = reason;
  if (m.kind !== 'cofounder') { onTermination(state, p, m); exitPostMortem(state, m, { reason }); }
  contractorExit(state, m);
  placementGuarantee(state, m);
  opsOnExit(state, m, { fired: reason !== 'resigned' }); // PTO payout, access removal checklist
  const sev = severanceCost(m, severanceWeeks);
  if (sev > 0) post(state, { amount: -sev, counterparty: m.engagement === 'eor' ? 'Deel' : 'Gusto', description: `Severance ${severanceWeeks} weeks + COBRA support: ${m.name}`, category: 'payroll', method: 'payroll', meta: { app: 'people' } });
  if (m.grant && m.grant.status === 'granted') m.grant.vestedAtExit = vestedPct(m, state.day);
  // Morale hit for everyone else.
  for (const o of humansActive(p)) o.morale = clamp((o.morale ?? 70) - 6, 0, 100);
  syncVendorBills(state);
  log(state, 'info', `${m.name} left the company (${reason}).`, 'people');
  return sev;
}

export function vestedPct(m, day) {
  const g = m.grant;
  if (!g || day < g.cliffDay) return 0;
  const months = Math.floor((day - g.vestStart) / 30.4);
  return round2(g.pct * clamp(months / (g.vestYears * 12), 0, 1));
}

export function hireAgent(state, type) {
  const p = ensurePeople(state);
  const a = AI_AGENTS[type];
  if (!a) throw new Error('Unknown agent.');
  if (a.group !== 'coding' && p.members.some((m) => m.agentType === type && m.status === 'active')) throw new Error('Already active.');
  const m = { id: uid('mem'), name: a.label, role: a.role, kind: 'ai_agent', agentType: type, status: 'active', startDay: state.day, readyDay: state.day + (a.setupDays ?? 0), hoursPerWeek: 0, monthlyCost: a.monthly ?? 0, equityPct: 0 };
  if (a.monthly) m.recurringId = addRecurring(state, { vendor: a.label, amount: a.monthly, category: a.category ?? 'software', dayOfMonth: Math.min(28, Number(dateOf(state).getUTCDate())), note: a.label }).id;
  if (a.contractMonths) m.contractEndDay = state.day + a.contractMonths * 30;
  if (type === 'support_ai') m.monthlyCost = estimateSupportAiCost(state);
  p.members.push(m);
  p.aiCodingMultiplier = computeAiCodingMultiplier(state);
  return m;
}

export function cancelAgent(state, memberId) {
  const p = ensurePeople(state);
  const m = findMember(p, memberId);
  if (!m || m.kind !== 'ai_agent' || m.status !== 'active') throw new Error('Not an active agent.');
  const rec = state.recurring.find((r) => r.id === m.recurringId);
  if (rec) rec.active = false;
  let fee = 0;
  if (m.contractEndDay && m.contractEndDay > state.day) {
    const months = Math.ceil((m.contractEndDay - state.day) / 30);
    fee = months * (AI_AGENTS[m.agentType].monthly ?? 0);
    post(state, { amount: -fee, counterparty: m.name, description: `Annual contract: remaining ${months} months owed`, category: 'software', method: 'ach', meta: { app: 'people' } });
  }
  if (m.agentType === 'support_ai') {
    const ai = state.apps.support?.ai;
    if (ai) {
      // Resolutions the Helpdesk counted this month go on the final Fin bill, and a seat the Helpdesk switched live
      // because of this hire stops (older saves: set live by People = never went through the Helpdesk's goLive).
      p.support.monthResolutions = (p.support.monthResolutions ?? 0) + (ai.monthResolutions ?? 0);
      ai.monthResolutions = 0;
      if (ai.status === 'live' && (ai.viaPeople ?? ai.flags?.liveTested == null)) ai.status = 'paused';
    }
    billSupportAi(state, p);
  }
  m.status = 'gone';
  m.endDay = state.day;
  p.aiCodingMultiplier = computeAiCodingMultiplier(state);
  return fee;
}

export function writeHelpDocs(state, hours) {
  const s = ensurePeople(state).support;
  s.docsHours += hours;
  s.docsQuality = round2(clamp(s.docsHours / 20, 0, 1)); // ~20h of real help-center content saturates [A]
}

export function get409A(state) {
  const p = ensurePeople(state);
  if (entityOf(state) !== 'ccorp') throw new Error('A 409A is for C-corp stock options. Incorporate as (or convert to) a C-corp first.');
  const cost = EQUITY.valuation409A.cost;
  post(state, { amount: -cost, counterparty: 'Carta', description: '409A valuation (independent appraisal of common stock)', category: 'accounting', method: 'card', meta: { app: 'people' } });
  const shares = fullyDilutedShares(state);
  const raisedPost = state.apps.fundraising?.lastPostMoney ?? 0; // common ≈ 20–35% of the preferred price
  const enterprise = Math.max(raisedPost * 0.3, mrr(state) * 12 * 2 * 0.3 + Math.max(0, balance(state)) * 0.3, 50_000);
  p.equity.valuation = { day: state.day, validUntil: state.day + EQUITY.valuation409A.validDays, fmv: round2(Math.max(0.0001, enterprise / shares) * 10000) / 10000, cost };
  for (const m of p.members) if (m.grant?.status === 'pending' && m.status !== 'gone') { m.grant.status = 'granted'; m.grant.strike = p.equity.valuation.fmv; }
  return p.equity.valuation;
}

// Fully diluted shares: the Fundraising cap table when it exists (plus a People pool it hasn't reserved yet),
// else founder shares issued in Legal grossed up for the reserved pool (realism review F16).
export function fullyDilutedShares(state) {
  const pool = (state.apps.people?.optionPool?.reservedPct ?? 0) / 100;
  const cap = state.apps.fundraising?.cap;
  if (cap) {
    const fd = fdShares(cap);
    return Math.round(cap.pool > 0 ? fd : fd / (1 - pool));
  }
  const issued = state.apps.legal?.founderStock?.issued ?? 10_000_000;
  return Math.round(issued / (1 - pool));
}

// Reserve an option pool (board consent). Shared contract with the Fundraising cap table:
// state.apps.people.optionPool = { reservedPct, day } — % of fully diluted shares reserved for the plan
// (granted + unissued). Fundraising reads it; after a priced round it may write the post-round % back.
// After a priced round (the pool shuffle in Fundraising's cap table), write the post-round pool % back.
export function syncPoolFromCapTable(state, p = ensurePeople(state)) {
  const cap = state.apps.fundraising?.cap;
  const rounds = cap?.preferred?.length ?? 0;
  if (!cap || rounds <= (p.poolSyncedRounds ?? 0)) return null;
  p.poolSyncedRounds = rounds;
  const pool = Math.max(cap.pool ?? 0, poolTotal(cap));
  if (!(pool > 0)) return null;
  const pct = round2((pool / fdShares(cap)) * 100);
  p.optionPool = { reservedPct: pct, day: state.day, source: 'priced round' };
  p.equity.poolPct = pct;
  return pct;
}

export function createPool(state, pct) {
  const p = ensurePeople(state);
  if (entityOf(state) !== 'ccorp') throw new Error('Option pools need a C-corp.');
  if (pct < 1 || pct > 25) throw new Error('Pick 1–25%. Post-seed pools are typically 10–15%.');
  p.optionPool = { reservedPct: pct, day: state.day };
  p.equity.poolPct = pct;
}

// ---------------------------------------------------------------------------
// Vendors & billing
// ---------------------------------------------------------------------------

export function syncVendorBills(state) {
  const p = ensurePeople(state);
  const b = vendorBills(p.members);
  const sync = (key, vendor, amount, note) => {
    let r = state.recurring.find((x) => x.id === p.vendorRec[key]);
    if (amount > 0 && !r) { r = addRecurring(state, { vendor, amount, category: 'software', dayOfMonth: 1, note }); p.vendorRec[key] = r.id; }
    if (r) { r.amount = round2(amount); r.active = amount > 0; }
  };
  // A PEO runs payroll itself (its PEPM fee is billed with benefits), so a separate payroll provider is not paid twice.
  if (activePolicy(state).health?.mode === 'peo') b.gusto = 0;
  sync('gusto', 'Gusto', b.gusto, 'Payroll: base + per person');
  sync('deel', 'Deel', b.deel, 'Contractor management / EOR fees');
  return b;
}

function estimateSupportAiCost(state) {
  const last = state.apps.people?.support?.lastWeek;
  const res = last ? last.aiResolved * 4.33 : 0;
  return round2(Math.max(AI_AGENTS.support_ai.monthlyMin, res) * AI_AGENTS.support_ai.perResolution);
}

function billSupportAi(state, p) {
  const a = AI_AGENTS.support_ai;
  const res = Math.round(p.support.monthResolutions);
  const amount = round2(Math.max(a.monthlyMin, res) * a.perResolution);
  post(state, { amount: -amount, counterparty: 'Intercom', description: `Fin AI resolutions: ${res} (min ${a.monthlyMin})`, category: 'software', method: 'card', meta: { app: 'people' } });
  p.support.monthResolutions = 0;
  return amount;
}

// ---------------------------------------------------------------------------
// Misclassification risk for contractors (factors from research §1.2; scoring is [A]).
// ---------------------------------------------------------------------------

export function misclassRisk(m, day) {
  if (m.engagement !== 'contractor' || m.cor) return { score: 0, factors: [] };
  const factors = [];
  if (m.hoursPerWeek >= 30) factors.push('works full-time hours for you');
  if (day - m.startDay > 180) factors.push('ongoing for 6+ months like a staff member');
  if (['engineer', 'support', 'sdr', 'ae'].includes(m.role)) factors.push('does core, ongoing work you direct');
  if (m.region === 'us') factors.push('US state tests (e.g. California ABC) are strict');
  return { score: factors.length, factors, level: factors.length >= 3 ? 'high' : factors.length === 2 ? 'medium' : 'low' };
}

// ---------------------------------------------------------------------------
// Daily / monthly tick
// ---------------------------------------------------------------------------

export function peopleDay(state) {
  const p = ensurePeople(state);
  syncPoolFromCapTable(state, p);
  if (p.optionPool && p.optionPool.reservedPct !== p.equity.poolPct) p.equity.poolPct = p.optionPool.reservedPct;

  // Offers decided, starts, resignations taking effect.
  for (const c of p.candidates) if (c.stage === 'offer' && state.day >= c.offer.decideDay) decideOffer(state, p, c);
  for (const m of p.members) {
    if (m.status === 'offer' && state.day >= m.startDay) {
      m.status = 'active';
      notify(state, `${m.name} starts today as ${ROLES[m.role]?.label ?? m.role}.${m.ciiaa ? '' : ' No CIIAA signed: IP they create may not belong to the company.'}`, { type: m.ciiaa ? 'good' : 'warn', app: 'people' });
      globalStart(state, m);
      opsOnStart(state, p, m);
    }
    if (m.status === 'active' && m.leavingDay != null && state.day >= m.leavingDay) {
      m.status = 'gone'; m.endDay = state.day; m.exitReason ??= 'resigned';
      if (m.kind !== 'cofounder') exitPostMortem(state, m, { reason: m.exitReason });
      contractorExit(state, m);
      placementGuarantee(state, m);
      opsOnExit(state, m, { fired: false });
      if (m.grant?.status === 'granted') m.grant.vestedAtExit = vestedPct(m, state.day);
    }
  }

  // New applicants per open job and channel. Job boards bring floods of applications (many AI-written);
  // the automated resume screen passes a few profiles (biased toward polish). Agencies and referrals
  // send fewer, pre-screened (and often interview-coached) candidates.
  for (const job of p.jobs) {
    if (job.status !== 'open') continue;
    for (const id of job.channels) {
      const a = AGENCY[id];
      if (!a || state.day < (job.channelStart?.[id] ?? 0)) continue;
      const flow = channelFlow(a, job);
      const rf = regionFlow(state, job); // pool depth, seniority and time-zone requirement (people/global.js); 1 for an ordinary US job
      if (a.kind === 'job_board') {
        const apps = poisson(state, flow.applications * rf.apps);
        job.applications += apps;
        job.aiApplications = (job.aiApplications ?? 0) + Math.round(apps * AI_APPLICATION_SHARE);
      }
      const n = Math.min(4, poisson(state, flow.profiles * rf.profiles));
      for (let i = 0; i < n; i++) {
        let c = makeCandidate(state, job, a, uid);
        // Someone an agency already submitted re-applies directly → ownership claim if you hire them.
        const owned = !['contingency', 'retained', 'marketplace'].includes(a.kind) ? (p.ownership ?? []).find((o) => o.role === job.role && state.day <= o.untilDay && !o.reused) : null;
        if (owned && chance(state, 0.08)) {
          const orig = findCand(p, owned.candidateId);
          if (orig && !['hired', 'offer'].includes(orig.stage)) {
            owned.reused = true;
            c = { ...c, name: orig.name, email: orig.email, personKey: orig.personKey, traits: { ...orig.traits }, talkerDoer: orig.talkerDoer, fraud: orig.fraud, expectation: orig.expectation, signals: orig.signals, years: orig.years, location: orig.location };
          }
        }
        if (['pct_first_year_base', 'pct_first_year_cash_comp'].includes(a.costModel.type) || a.kind === 'contract_to_hire') recordOwnership(p, c, a.id, state.day);
        p.candidates.unshift(c);
        job.shortlisted++;
        if (a.kind !== 'job_board') job.applications++;
      }
    }
  }

  // Referral bonuses, illegal-question complaints, PIP outcomes.
  for (const b of p.bonuses ?? []) {
    if (b.status !== 'pending' || state.day < b.dueDay) continue;
    const m = findMember(p, b.memberId);
    b.status = m?.status === 'active' ? 'paid' : 'void';
    if (b.status === 'paid') post(state, { amount: -b.amount, counterparty: 'Referral bonus', description: `Referral bonus for hiring ${b.name}`, category: 'payroll', method: 'payroll', meta: { app: 'people', recruiting: true } });
  }
  for (const k of p.complaints ?? []) {
    if (k.status !== 'pending' || state.day < k.dueDay) continue;
    k.status = 'filed';
    const cost = round2(8000 + rng(state) * 22000);
    post(state, { amount: -cost, counterparty: 'Employment lawyer', description: `Discrimination complaint (${k.topic.replace(/_/g, ' ')} question to ${k.candidate}): response & settlement`, category: 'legal', method: 'ach', meta: { app: 'people' } });
    notify(state, `${k.candidate} filed a discrimination charge (EEOC/state agency) after you asked about ${k.topic.replace(/_/g, ' ')} in an interview. Responding and settling cost ${money(cost)}.`, { type: 'bad', app: 'people' });
  }
  for (const m of p.members) if (m.pip?.status === 'active') resolvePip(state, m);
  processClaims(state, p);
  backgroundDay(state, p);
  screeningClaimsDay(state, p);
  atsDay(state, p);

  // Candidates go cold: good people get other offers.
  for (const c of p.candidates) {
    const idle = state.day - c.lastTouchDay;
    if (['new', 'screened'].includes(c.stage) && idle > 7 && chance(state, c.persona.otherOffers ? 0.07 : 0.04)) c.stage = 'withdrawn';
    else if (c.stage === 'interviewed' && idle > 10 && chance(state, 0.05)) c.stage = 'withdrawn';
    else if (c.stage === 'interview_scheduled') {
      const ev = interviewEvent(state, c);
      if (ev && ['unattended', 'missed', 'canceled'].includes(ev.status)) {
        c.stage = 'withdrawn';
        notify(state, `You didn't show up to the interview with ${c.name}. They withdrew.`, { type: 'bad', app: 'people' });
      }
    }
  }
  if (p.candidates.length > 300) p.candidates = p.candidates.filter((c, i) => i < 200 || !['rejected', 'withdrawn', 'declined'].includes(c.stage));

  opsDay(state, p); // fines, reneges, onboarding deadlines, access removal, absences, lease (people/ops.js)
  compDay(state);
  gtmTeamDay(state);
  runPayrollIfDue(state, p);
  payContractors(state, p);

  if (dayOfWeek(state) === 1) weekly(state, p);
  p.aiCodingMultiplier = computeAiCodingMultiplier(state);
  syncVendorBills(state);
}

function chargeFounder(state, hours, label) {
  if (hours <= 0) return 0;
  const f = state.founder;
  const room = Math.max(0, f.hoursPerWeek - f.hoursUsed);
  const h = round2(Math.min(hours, room));
  if (h <= 0) return 0;
  f.hoursUsed += h;
  f.timeLog ??= [];
  f.timeLog.push({ day: state.day, hours: h, label });
  return h;
}

function weekly(state, p) {
  for (const job of p.jobs) if (job.status === 'open') { chargeWeekly(state, job, Math.min(7, state.day - (job.lastBilledDay ?? job.openedDay ?? state.day))); job.lastBilledDay = state.day; }

  opsWeekly(state, p);
  const f = state.founder;
  const capTotal = f.hoursPerWeek * 0.6; // auto-charged team overhead never eats more than 60% of a week [A]
  let avail = Math.min(capTotal, Math.max(0, f.hoursPerWeek - f.hoursUsed));

  // Management overhead.
  const humans = humansActive(p);
  // Hires with onboarding meetings on the calendar are charged there (core/calendar.js); the rest get the flat weekly charge.
  const onboarding = humans.filter((m) => m.kind !== 'cofounder' && state.day - m.startDay < ONBOARDING_WEEKS * 7 && !m.onboarding?.meetingsScheduled).length * ONBOARDING_HOURS_PER_WEEK;
  const mgmt = humans.filter((m) => m.kind !== 'cofounder').reduce((a, m) => a + managementHours(m) + (m.pip?.status === 'active' ? 2 : 0), 0) + onboarding;
  const mgmtCharged = chargeFounder(state, Math.min(mgmt, avail), 'Team: onboarding, unblocking');
  avail -= mgmtCharged;
  // 1:1s at the cadence the founder set (people/manage.js CADENCE).
  const ooo = oneOnOneHours(humans);
  if (ooo > 0) avail -= chargeFounder(state, Math.min(ooo, avail), 'Team: 1:1s');
  for (const m of humans) { weeklyManage(state, m); globalWeekly(state, m); }
  // Resume triage for job-board applications: by hand, or AI criteria + reading the reasoning (screening.js).
  for (const job of p.jobs) {
    if (job.status !== 'open') continue;
    const fresh = Math.max(0, (job.applications ?? 0) - (job.triagedApps ?? 0));
    job.triagedApps = job.applications ?? 0;
    const h = triageHours(job, fresh);
    if (h > 0) avail -= chargeFounder(state, Math.min(h, avail), `Resume triage: ${job.title}`);
  }

  // Support load.
  const week = supportTick(state, p, avail);

  // Morale drifts toward a target driven by pay vs market, equity, founder state and runway [A].
  const runwayLow = balance(state) < 3 * monthlyPeopleCost(state);
  for (const m of humans) {
    if (m.kind === 'cofounder') continue; // co-founder morale lives in the Co-founder app
    const contractor = m.engagement === 'contractor';
    const pay = contractor ? m.hourlyRate : m.salary / Math.max(0.25, (m.hoursPerWeek ?? 40) / 40); // a part-timer's pay is compared per full-time equivalent
    const comp = clamp((pay / marketMid(m.role, m.region, contractor) - 1) * 60, -20, 10);
    let target = 70 + comp + (m.equityPct > 0 ? 5 : 0) - (f.energy < 40 ? 10 : 0) - (runwayLow ? 15 : 0) + moraleShift(m.mgmt?.score ?? 0.3) - (m.compMoraleDrag ?? 0) - moraleDrag(m) + opsMoraleShift(state, m); // compMoraleDrag: plan changes, underpay, caps, low earnings (people/comp.js)
    if (m.role === 'support' && (week?.unhandled ?? 0) > 5) target -= 8;
    m.morale = round2(clamp((m.morale ?? 70) + (target - (m.morale ?? 70)) * 0.25, 0, 100));
  }
}

function supportStaffOnly(state, members) {
  return members.filter((m) => m.kind !== 'ai_agent' && m.role === 'support' && m.status === 'active')
    .reduce((a, m) => a + staffTicketsPerWeek(state.company.model) * ((m.hoursPerWeek ?? 40) / 40) * (m.productivity ?? 1) * rampFactor(m, state.day) * moraleFactor(m), 0);
}

// Weekly support volume → handling. If a Helpdesk app owns state.apps.support.tickets, tickets are
// generated there (it handles resolution, hours and churn); otherwise the aggregate model runs here.
function supportTick(state, p, avail) {
  const model = state.company.model;
  const s = p.support;
  const subs = activeSubs(state);
  const newCustomers = subs.filter((x) => state.day - x.startDay < 30).length;
  const newTickets = weeklyTickets(model, subs.length, trialingSubs(state).length, { newCustomers, docsQuality: s.docsQuality });
  const aiMember = p.members.find((m) => m.agentType === 'support_ai' && m.status === 'active' && state.day >= m.readyDay);
  const helpdesk = state.apps.support;
  if (helpdesk?.active) {
    // The Helpdesk app generates and resolves tickets itself (research rates); People only reports.
    // Mirror the Helpdesk's actual last 7 days so the People view shows one consistent model (review S1).
    const wk = (helpdesk.daily ?? []).filter((d) => d.day > state.day - 7);
    const n = wk.reduce((a, d) => a + d.new, 0), ai = wk.reduce((a, d) => a + d.ai, 0), handled = wk.reduce((a, d) => a + d.handled, 0);
    const backlog = (helpdesk.queue ?? []).reduce((a, q) => a + q.n, 0);
    s.lastWeek = { day: state.day, total: n, newTickets: n, aiResolved: ai, aiErrors: 0, staffHandled: 0, founderHandled: handled, founderHours: 0, unhandled: backlog, churnMult: 1, firstResponseHours: helpdesk.metrics?.firstResponseHours ?? null, viaHelpdesk: true };
    s.history.push({ day: state.day, total: n, ai, staff: 0, founder: handled, unhandled: backlog });
    setModifier(state, 'churn', 'support-backlog', 1); // the Helpdesk's FRT modifier replaces this
    if (s.history.length > 60) s.history.shift();
    return s.lastWeek;
  }
  const staffCapacity = Math.round(supportStaffOnly(state, p.members));
  const monthsLive = aiMember ? (state.day - aiMember.readyDay) / 30.4 : 0;
  const oversightEst = aiMember ? Math.min(avail, clamp(1 + (newTickets + s.backlog) / 200, 1, 3)) : 0;
  const week = supportWeek({ model, newTickets, backlog: s.backlog, ai: aiMember ? { active: true, docsQuality: s.docsQuality, monthsLive, errorRate: supportAiErrorRate(state) } : null, staffCapacity, founderCapHours: Math.max(0, Math.min(s.founderCapHours, avail - oversightEst)) });
  const charged = chargeFounder(state, week.founderHours + week.oversightHours, 'Support tickets & AI agent oversight');
  s.backlog = week.backlog;
  s.lastWeek = { ...week, day: state.day, newTickets: round2(newTickets), founderCharged: charged };
  s.history.push({ day: state.day, total: week.total, ai: week.aiResolved, staff: week.staffHandled, founder: week.founderHandled, unhandled: week.unhandled });
  if (s.history.length > 60) s.history.shift();
  s.monthResolutions += week.aiResolved;
  if (aiMember) aiMember.monthlyCost = estimateSupportAiCost(state);
  setModifier(state, 'churn', 'support-backlog', Math.abs(week.churnMult - 1) > 0.005 ? week.churnMult : 1);
  if (week.total >= 1 && (week.founderHours >= 1 || week.unhandled >= 1)) {
    notify(state, `Support: ${Math.round(week.total)} tickets this week. ${week.aiResolved ? `AI resolved ${Math.round(week.aiResolved)}. ` : ''}You spent ${week.founderHours.toFixed(1)}h answering. Median first response ~${week.firstResponseHours < 1 ? '<1' : week.firstResponseHours}h.${week.unhandled >= 1 ? ` ${Math.round(week.unhandled)} went unanswered — churn ×${week.churnMult}.` : ''}`, { type: week.unhandled >= 1 ? 'warn' : 'info', app: 'people' });
  }
  return week;
}

// Back payroll taxes (7.65% employer FICA + 1.5% withholding liability) + 20% penalty, plus a fixed
// $5–25k state fine if operating in California (realism review F13; amounts are game values).
export function misclassAssessment(state, m, trigger = 'an unemployment claim') {
  const paid = Object.values(m.paidByYear ?? {}).reduce((a, b) => a + b, 0);
  const back = paid * (0.0765 + 0.015);
  const ca = m.region === 'us' && state.apps.legal?.incorporation?.operatingState === 'CA' ? 5000 + Math.round(rng(state) * 20000) : 0;
  const penalty = round2(Math.max(1000, back * 1.2 + ca));
  post(state, { amount: -penalty, counterparty: m.region === 'us' ? 'State EDD / IRS' : 'Local labor authority', description: `Worker misclassification assessment: ${m.name} (back taxes, penalties${ca ? ', CA fine' : ''})`, category: 'taxes', method: 'ach', meta: { app: 'people' } });
  m.misclassified = true;
  notify(state, `${m.name} was found to be misclassified as a contractor after ${trigger}: ${money(penalty)} in back taxes and penalties.`, { type: 'bad', app: 'people' });
  return penalty;
}

// Agency guarantee: pro-rated refund when a placed hire leaves inside the guarantee window [design].
function placementGuarantee(state, m) {
  if (!m.placement) return;
  const refund = guaranteeRefund(AGENCY[m.placement.agencyId], m.placement.fee, state.day - m.startDay);
  if (refund > 0) {
    post(state, { amount: refund, counterparty: AGENCY[m.placement.agencyId].label, description: `Placement guarantee refund (pro-rated): ${m.name}`, category: 'refund_in', method: 'ach', meta: { app: 'people' } });
    notify(state, `${m.name} left within the agency's ${AGENCY[m.placement.agencyId].guaranteeDays}-day guarantee: ${money(refund)} refunded (pro-rated).`, { type: 'info', app: 'people' });
  }
}

// Most misclassification cases are triggered after the engagement ends (unemployment claim, SS-8 filing).
function contractorExit(state, m) {
  if (m.engagement !== 'contractor' || m.misclassified) return;
  if (misclassRisk(m, state.day).score >= 3 && chance(state, 0.15)) misclassAssessment(state, m);
}

// Monthly voluntary attrition: morale curve x the management routine (manage.js attritionMult).
export function attritionProbability(m) {
  return BASE_ATTRITION_MONTHLY * Math.pow(2, (60 - (m.morale ?? 70)) / 15) * attritionMult(m.mgmt?.score ?? 0.3) * (m.compAttr ?? 1) * attritionFactor(m) * (m.opsAttr ?? 1) + misledQuitHazard(m);
}

// F5: hiring ahead of revenue. The rule of thumb [design]: payroll up to ~60% of MRR AND six months of that payroll
// in the bank, or you are betting the company on a product that has not found its market (pre-PMF: MRR under $10k).
export const HIRE_RULE = { payrollShareOfMrr: 0.6, cashMonths: 6, preMrr: 10000 };
export function prematureHireCheck(state, p = ensurePeople(state)) {
  const humans = humansActive(p).filter((m) => m.kind !== 'cofounder' && m.engagement !== 'cofounder');
  if (!humans.length) return null;
  const payroll = round2(humans.reduce((a, m) => a + monthlyCostOf(state, m), 0));
  const revenue = mrr(state);
  if (payroll <= 0 || revenue >= HIRE_RULE.preMrr) return null;
  if (payroll <= HIRE_RULE.payrollShareOfMrr * revenue || balance(state) >= HIRE_RULE.cashMonths * payroll) return null;
  const newest = [...humans].sort((a, b) => (b.startDay ?? 0) - (a.startDay ?? 0))[0];
  const excess = payroll - HIRE_RULE.payrollShareOfMrr * revenue;
  return logMistake(state, {
    functionId: 'hiring', id: 'premature_hire', app: 'people', delayed: true, key: `premature_hire:${newest.id}`,
    label: 'Hired ahead of revenue', cost: { usd: Math.round(excess * 3), hours: 4 },
    detail: `Payroll is $${Math.round(payroll)}/month against $${Math.round(revenue)} MRR, with $${Math.round(balance(state))} in the bank (under ${HIRE_RULE.cashMonths} months of payroll). Before product-market fit, keep payroll under ${HIRE_RULE.payrollShareOfMrr * 100}% of MRR and hold ${HIRE_RULE.cashMonths} months of it in cash; each month of the gap is runway you cannot get back.`,
  });
}

export function peopleMonthEnd(state) {
  const p = ensurePeople(state);
  prematureHireCheck(state, p);
  opsMonthEnd(state, p);
  for (const m of p.members) { monthlyRead(state, m); monthlyIncidents(state, m); concerningNote(state, m); }
  for (const m of humansActive(p)) globalMonthly(state, m); // fraud and moonlighting surface, outages, classification claims (people/global.js)
  for (const m of humansActive(p)) monthlyNeglect(state, humansActive(p), m);
  if (p.members.some((m) => m.agentType === 'support_ai' && m.status === 'active')) billSupportAi(state, p);

  // Variable pay: each rep's plan (people/comp.js) settles credit into commission, paid with the next payroll run.
  compMonthEnd(state);

  // Attrition.
  for (const m of humansActive(p)) {
    if (m.leavingDay != null || m.kind === 'cofounder') continue; // co-founder departures are modelled by the Co-founder app
    const prob = attritionProbability(m);
    (m.attrHist ??= []).push(round2(prob));
    if (m.attrHist.length > 36) m.attrHist.shift();
    if (chance(state, prob)) {
      m.leavingDay = state.day + 14;
      m.exitReason = 'resigned';
      notify(state, `${m.name} resigned (morale ${Math.round(m.morale)}). Last day ${fmtDate(state, m.leavingDay)}.`, { type: 'bad', app: 'people' });
      onResignation(state, m);
      continue;
    }
    // Role mismatch surfaces for hires made through the pipeline (people/provenance.js): first-year hazard from
    // the hidden fit, how well the role was defined, and onboarding.
    if (m.provenance) {
      const p12 = misfitP12(memberFit(m), { fraud: m.fraud, clarity: clarityMult(m.provenance), onboarding: onboardingMult(m) });
      const h = monthlyHazard(p12) * (state.day - m.startDay > 365 ? 0.5 : 1);
      if (chance(state, h)) {
        m.leavingDay = state.day + 14;
        m.exitReason = 'role mismatch';
        notify(state, `${m.name} and you both know it isn't working: they're leaving (last day ${fmtDate(state, m.leavingDay)}). How they were hired: ${provenanceLine(m.provenance)}.`, { type: 'bad', app: 'people' });
      }
    }
  }

  // Misclassification while active: ~1%/yr per risk factor (realism review F13); most cases surface at exit.
  for (const m of humansActive(p)) {
    const r = misclassRisk(m, state.day);
    if (r.score >= 2 && !m.misclassified && chance(state, (0.01 / 12) * r.score)) misclassAssessment(state, m, 'an audit');
  }
}
