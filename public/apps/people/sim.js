// People simulation: state slice, player actions (pure state mutations used by the UI and tests),
// and the daily/monthly tick (pipeline, payroll, support load, morale, attrition, AI agent billing).

import { ensure, notify, log } from '../../core/state.js';
import { post, addRecurring, balance } from '../../core/bank.js';
import { activeSubs, trialingSubs, mrr } from '../../core/stripe.js';
import { setModifier } from '../../core/market.js';
import { newThread, addMessage, findThread } from '../../core/mail.js';
import { scheduleEvent, completeEvent, cancelEvent, ensureCalendar } from '../../core/calendar.js';
import { uid, rng, poisson, chance, clamp, round2, dayOfWeek, dateOf, fmtDate, money } from '../../core/util.js';
import { ROLES, AI_AGENTS, CHANNELS, EQUITY, BASE_ATTRITION_MONTHLY, MGMT_HOURS_PER_REPORT, ONBOARDING_HOURS_PER_WEEK, ONBOARDING_WEEKS } from './catalog.js';
import { arrivalRate, makeCandidate, acceptProbability, interviewSignal, qualityEstimate, marketMid, rampFactor } from './hiring.js';
import { runPayrollIfDue, payContractors, severanceCost, vendorBills, monthlyCostOf } from './payroll.js';
import { supportWeek, weeklyTickets, staffTicketsPerWeek } from './support.js';
import { computeAiCodingMultiplier, monthlyPeopleCost, moraleFactor } from './capacity.js';
import { entityOf, hasEin, ciiaaReady } from '../legal/api.js';

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
  const burn = monthlyPeopleCost(state) + state.recurring.filter((r) => r.active).reduce((a, r) => a + r.amount, 0) - mrr(state);
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

export function createJob(state, { role, title, region, engagement, payLo, payHi, hoursPerWeek = 40, text }) {
  const p = ensurePeople(state);
  if (!ROLES[role]) throw new Error('Pick a role.');
  if (engagement === 'employee' && region !== 'us') throw new Error('Employees abroad need an EOR (Deel). Pick "EOR" or "Contractor".');
  if (engagement === 'eor' && region === 'us') throw new Error('US hires are regular W-2 employees via Gusto.');
  const job = { id: uid('job'), role, title: title || ROLES[role].label, region, engagement, payLo: payLo || 0, payHi: payHi || 0, hoursPerWeek: engagement === 'contractor' ? clamp(hoursPerWeek, 5, 40) : 40, text: text ?? '', judge: null, quality: null, payTransparency: false, channels: [], status: 'draft', createdDay: state.day, openedDay: null, applications: 0, shortlisted: 0 };
  p.jobs.unshift(job);
  return job;
}

export function applyJudge(job, judge) {
  job.judge = judge;
  job.payTransparency = Boolean(judge.payTransparency);
  job.quality = round2(clamp(((judge.clarity + judge.specificity) / 20) * (judge.payTransparency ? 1.1 : 0.85), 0, 1));
}

export function openJob(state, jobId, channels) {
  const p = ensurePeople(state);
  const job = findJob(p, jobId);
  if (!job) throw new Error('No such job.');
  if (!job.judge) throw new Error('Publish the post first (it gets reviewed).');
  const valid = channels.filter((c) => CHANNELS[c] && !(CHANNELS[c].contractorOnly && job.engagement !== 'contractor') && !(CHANNELS[c].employeeOnly && job.engagement === 'contractor'));
  if (!valid.length) throw new Error('Pick at least one channel that fits this role.');
  for (const c of valid) {
    if (job.channels.includes(c)) continue;
    const once = CHANNELS[c].once ?? 0;
    if (once > 0) post(state, { amount: -once, counterparty: CHANNELS[c].label, description: `Job post: ${job.title}`, category: 'other', method: 'card', meta: { app: 'people', recruiting: true } });
    job.channels.push(c);
  }
  job.status = 'open';
  job.openedDay ??= state.day;
  job.adDaysUnbilled ??= 0;
  return job;
}

export function closeJob(state, jobId) {
  const p = ensurePeople(state);
  const job = findJob(p, jobId);
  if (!job) return;
  billAds(state, job);
  job.status = 'closed';
  job.closedDay = state.day;
  for (const c of p.candidates) if (c.jobId === jobId && ['new', 'screened'].includes(c.stage)) c.stage = 'rejected';
}

function billAds(state, job) {
  const days = job.adDaysUnbilled ?? 0;
  if (!days) return;
  for (const c of job.channels) {
    const d = CHANNELS[c]?.daily ?? 0;
    if (d > 0) post(state, { amount: -d * days, counterparty: CHANNELS[c].label, description: `Sponsored job ad (${days} days): ${job.title}`, category: 'other', method: 'card', meta: { app: 'people', recruiting: true } });
  }
  job.adDaysUnbilled = 0;
}

export function screenCandidate(state, candId, advance) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!c || !['new'].includes(c.stage)) throw new Error('Candidate is not awaiting screening.');
  c.lastTouchDay = state.day;
  if (!advance) { c.stage = 'rejected'; return c; }
  c.stage = 'screened';
  // A 20-minute screen gives a rough read: ±0.35.
  c.estimate = { q: round2(clamp(c.quality + (rng(state) - 0.5) * 0.7, 0, 1)), sd: 0.35 };
  return c;
}

export function scheduleInterview(state, candId, slot) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!c || c.stage !== 'screened') throw new Error('Screen the candidate first.');
  const ev = scheduleEvent(state, { title: `Interview: ${c.name} (${ROLES[c.role].label})`, kind: 'interview', app: 'people', refId: c.id, with: { name: c.name, email: c.email }, day: slot.day, start: slot.start, duration: 60, location: 'Video call', notes: 'Structured interview. Join from People → candidate.' });
  c.stage = 'interview_scheduled';
  c.interview = { eventId: ev.id, day: slot.day, messages: [], started: false, done: false };
  c.lastTouchDay = state.day;
  return ev;
}

export function interviewEvent(state, c) {
  return c?.interview ? ensureCalendar(state).events.find((e) => e.id === c.interview.eventId) : null;
}

// Can the player join the interview now? (On the meeting's day; the calendar charges the hour.)
export function canJoin(state, c) {
  const ev = interviewEvent(state, c);
  return Boolean(ev && ev.day === state.day && ['scheduled', 'in_progress'].includes(ev.status) && !c.interview.done);
}

export function startInterview(state, candId) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!canJoin(state, c)) throw new Error('You can only join on the day of the interview.');
  const ev = interviewEvent(state, c);
  ev.status = 'in_progress';
  c.interview.started = true;
  return c;
}

export function finishInterview(state, candId) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!c?.interview?.started) throw new Error('Interview not started.');
  const signal = interviewSignal(c.interview.messages);
  c.interview.signal = round2(signal);
  c.interview.done = true;
  c.estimate = qualityEstimate(state, c, signal);
  const ints = c.interview.messages.filter((m) => m.from === 'them' && typeof m.interest === 'number').map((m) => m.interest);
  if (ints.length) c.interest = round2(clamp(ints.at(-1) / 10, 0, 1));
  c.stage = 'interviewed';
  c.lastTouchDay = state.day;
  const ev = interviewEvent(state, c);
  if (ev) completeEvent(state, ev.id, 'done', { signal: c.interview.signal, estimate: c.estimate.q });
  return c;
}

export function rejectCandidate(state, candId) {
  const p = ensurePeople(state);
  const c = findCand(p, candId);
  if (!c) return;
  const ev = interviewEvent(state, c);
  if (ev && ev.status === 'scheduled') cancelEvent(state, ev.id, 'candidate rejected');
  c.stage = 'rejected';
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
  const minStart = state.day + (contractor ? 3 : 14);
  if (offer.startDay < minStart) throw new Error(`Earliest realistic start is ${fmtDate(state, minStart)} (${contractor ? 'a few days' : 'two weeks\' notice'}).`);
  const eq = contractor ? 0 : Math.max(0, offer.equityPct || 0);
  if (eq > 0) {
    if (entityOf(state) !== 'ccorp') throw new Error('Stock options need a C-corp. LLCs use profits interests (lawyer needed).');
    if (!p.equity.poolPct) throw new Error('Create an option pool first (Equity tab).');
    const used = p.members.filter((m) => m.status !== 'gone').reduce((a, m) => a + (m.equityPct || 0), 0);
    if (used + eq > p.equity.poolPct + 1e-9) throw new Error(`Only ${(p.equity.poolPct - used).toFixed(2)}% left in the pool.`);
  }
  const o = {
    salary: contractor ? null : Math.round(offer.salary), hourlyRate: contractor ? Math.round(offer.hourlyRate) : null,
    equityPct: eq, startDay: offer.startDay, hoursPerWeek: contractor ? clamp(offer.hoursPerWeek ?? 40, 5, 40) : 40,
    sentDay: state.day, decideDay: state.day + 2 + Math.floor(rng(state) * 4), ciiaa: ciiaaReady(state), cor: Boolean(offer.cor),
  };
  o.p = round2(acceptProbability(c, o, offerContext(state)));
  c.offer = o;
  c.stage = 'offer';
  c.lastTouchDay = state.day;
  const pay = contractor ? `$${o.hourlyRate}/hour, ~${o.hoursPerWeek}h/week` : `$${o.salary.toLocaleString('en-US')} base salary${eq ? ` and options for ${eq}% of the company (4-year vesting, 1-year cliff)` : ''}`;
  const t = findThread(state, c.id) ?? newThread(state, { subject: `Offer: ${ROLES[c.role].label} at ${state.company.name}`, with: { name: c.name, email: c.email }, kind: 'candidate', app: 'people', refId: c.id });
  addMessage(state, t.id, { from: 'me', body: `Hi ${c.name.split(' ')[0]},\n\nThanks for the conversations. We'd love to have you join ${state.company.name}. Offer: ${pay}, start date ${fmtDate(state, o.startDay)}.${o.ciiaa ? ' The offer includes our standard confidentiality & invention assignment agreement (CIIAA).' : ''}\n\nHappy to answer any questions.` });
  return o;
}

function decideOffer(state, p, c) {
  const o = c.offer;
  const prob = acceptProbability(c, o, offerContext(state));
  const t = findThread(state, c.id);
  const first = c.name.split(' ')[0];
  if (chance(state, prob)) {
    c.stage = 'hired';
    const m = hireFromCandidate(state, p, c);
    if (t) addMessage(state, t.id, { from: 'them', body: `Hi! I'm happy to accept. Looking forward to starting on ${fmtDate(state, o.startDay)}. — ${first}` });
    notify(state, `${c.name} accepted your offer (${ROLES[c.role].label}). Starts ${fmtDate(state, o.startDay)}.`, { type: 'good', app: 'people' });
    if (c.channel === 'recruiter') post(state, { amount: -round2((o.salary ?? 0) * CHANNELS.recruiter.feePct), counterparty: 'Recruiting agency', description: `Placement fee: ${c.name}`, category: 'other', method: 'ach', meta: { app: 'people', recruiting: true } });
    const job = findJob(p, c.jobId);
    if (job && job.status === 'open') closeJob(state, job.id);
    return m;
  }
  c.stage = 'declined';
  const why = c.persona.otherOffers ? 'I decided to take another offer that was a better fit for me right now.' : o.p < 0.4 ? 'The compensation is too far from what I need.' : 'After thinking it over I\'m going to stay where I am for now.';
  if (t) addMessage(state, t.id, { from: 'them', body: `Thanks so much for the offer. ${why} Best of luck with ${state.company.name}. — ${first}` });
  notify(state, `${c.name} declined your offer.`, { type: 'bad', app: 'people' });
  return null;
}

function hireFromCandidate(state, p, c) {
  const o = c.offer;
  const m = {
    id: uid('mem'), name: c.name, role: c.role, kind: c.engagement === 'contractor' ? 'contractor' : 'employee', engagement: c.engagement,
    region: c.region, status: 'offer', startDay: o.startDay, hoursPerWeek: o.hoursPerWeek, salary: o.salary, hourlyRate: o.hourlyRate,
    equityPct: o.equityPct, productivity: round2(0.6 + 0.7 * c.quality), quality: c.quality, morale: 72, ciiaa: o.ciiaa, cor: o.cor,
    platformFeePct: c.channel === 'upwork' ? CHANNELS.upwork.feePct : 0, candidateId: c.id, rampWeeks: ROLES[c.role].rampWeeks, hiredDay: state.day,
  };
  m.monthlyCost = monthlyCostOf(state, m);
  if (o.equityPct > 0) {
    const v = p.equity.valuation;
    const valid = v && state.day <= v.validUntil;
    m.grant = { pct: o.equityPct, vestStart: o.startDay, cliffDay: o.startDay + EQUITY.cliffDays, vestYears: EQUITY.vestYears, strike: valid ? v.fmv : null, status: valid ? 'granted' : 'pending' };
    if (!valid) notify(state, `${c.name}'s option grant can't be priced until you have a current 409A valuation (Equity tab).`, { type: 'warn', app: 'people' });
  }
  p.members.push(m);
  if (m.kind !== 'contractor') p.hires++;
  return m;
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
  if (m.status === 'offer') { m.status = 'gone'; m.endDay = state.day; m.exitReason = 'offer rescinded'; syncVendorBills(state); return 0; }
  m.status = 'gone';
  m.endDay = state.day;
  m.exitReason = reason;
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
  if (m.agentType === 'support_ai') billSupportAi(state, p);
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
  const shares = state.apps.legal?.founderStock?.authorized ?? 10_000_000;
  const raisedPost = state.apps.fundraising?.lastPostMoney ?? 0;
  const enterprise = Math.max(raisedPost * 0.3, mrr(state) * 12 * 2 * 0.3 + Math.max(0, balance(state)) * 0.3, 50_000);
  p.equity.valuation = { day: state.day, validUntil: state.day + EQUITY.valuation409A.validDays, fmv: round2(Math.max(0.0001, enterprise / shares) * 10000) / 10000, cost };
  for (const m of p.members) if (m.grant?.status === 'pending' && m.status !== 'gone') { m.grant.status = 'granted'; m.grant.strike = p.equity.valuation.fmv; }
  return p.equity.valuation;
}

export function createPool(state, pct) {
  const p = ensurePeople(state);
  if (entityOf(state) !== 'ccorp') throw new Error('Option pools need a C-corp.');
  if (pct < 1 || pct > 25) throw new Error('Pick 1–25%. Post-seed pools are typically 10–15%.');
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

  // Offers decided, starts, resignations taking effect.
  for (const c of p.candidates) if (c.stage === 'offer' && state.day >= c.offer.decideDay) decideOffer(state, p, c);
  for (const m of p.members) {
    if (m.status === 'offer' && state.day >= m.startDay) {
      m.status = 'active';
      notify(state, `${m.name} starts today as ${ROLES[m.role]?.label ?? m.role}.${m.ciiaa ? '' : ' No CIIAA signed: IP they create may not belong to the company.'}`, { type: m.ciiaa ? 'good' : 'warn', app: 'people' });
    }
    if (m.status === 'active' && m.leavingDay != null && state.day >= m.leavingDay) {
      m.status = 'gone'; m.endDay = state.day; m.exitReason = 'resigned';
      if (m.grant?.status === 'granted') m.grant.vestedAtExit = vestedPct(m, state.day);
    }
  }

  // New applicants for open jobs. Most of the 300+ applications per hire are filtered by ATS screening.
  for (const job of p.jobs) {
    if (job.status !== 'open') continue;
    job.adDaysUnbilled = (job.adDaysUnbilled ?? 0) + 1;
    const n = poisson(state, arrivalRate(job));
    for (let i = 0; i < n; i++) {
      const c = makeCandidate(state, job, uid);
      p.candidates.unshift(c);
      job.shortlisted++;
    }
    job.applications += n * (20 + Math.floor(rng(state) * 25)) + poisson(state, 2);
  }

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
  for (const job of p.jobs) if (job.status === 'open') billAds(state, job);

  const f = state.founder;
  const capTotal = f.hoursPerWeek * 0.6; // auto-charged team overhead never eats more than 60% of a week [A]
  let avail = Math.min(capTotal, Math.max(0, f.hoursPerWeek - f.hoursUsed));

  // Management overhead.
  const humans = humansActive(p);
  const onboarding = humans.filter((m) => state.day - m.startDay < ONBOARDING_WEEKS * 7).length * ONBOARDING_HOURS_PER_WEEK;
  const mgmt = humans.length * MGMT_HOURS_PER_REPORT + onboarding;
  const mgmtCharged = chargeFounder(state, Math.min(mgmt, avail), 'Team: 1:1s, onboarding, unblocking');
  avail -= mgmtCharged;

  // Support load.
  const model = state.company.model;
  const s = p.support;
  const newTickets = weeklyTickets(model, activeSubs(state).length, trialingSubs(state).length);
  const aiMember = p.members.find((m) => m.agentType === 'support_ai' && m.status === 'active' && state.day >= m.readyDay);
  const staffCapacity = Math.round(supportStaffOnly(state, p.members));
  const oversightEst = aiMember ? Math.min(avail, clamp(1 + (newTickets + s.backlog) / 200, 1, 3)) : 0;
  const week = supportWeek({ model, newTickets, backlog: s.backlog, ai: aiMember ? { active: true, docsQuality: s.docsQuality } : null, staffCapacity, founderCapHours: Math.max(0, Math.min(s.founderCapHours, avail - oversightEst)) });
  const charged = chargeFounder(state, week.founderHours + week.oversightHours, 'Support tickets & AI agent oversight');
  s.backlog = week.backlog;
  s.lastWeek = { ...week, day: state.day, newTickets: round2(newTickets), founderCharged: charged };
  s.history.push({ day: state.day, total: week.total, ai: week.aiResolved, staff: week.staffHandled, founder: week.founderHandled, unhandled: week.unhandled });
  if (s.history.length > 60) s.history.shift();
  s.monthResolutions += week.aiResolved;
  if (aiMember) aiMember.monthlyCost = estimateSupportAiCost(state);
  setModifier(state, 'churn', 'support-backlog', week.churnMult > 1.01 ? week.churnMult : 1);
  if (week.total >= 1 && (week.founderHours >= 1 || week.unhandled >= 1)) {
    notify(state, `Support: ${Math.round(week.total)} tickets this week. ${week.aiResolved ? `AI resolved ${Math.round(week.aiResolved)}. ` : ''}You spent ${week.founderHours.toFixed(1)}h answering.${week.unhandled >= 1 ? ` ${Math.round(week.unhandled)} went unanswered — churn risk ×${week.churnMult}.` : ''}`, { type: week.unhandled >= 1 ? 'warn' : 'info', app: 'people' });
  }

  // Morale drifts toward a target driven by pay vs market, equity, founder state and runway [A].
  const runwayLow = balance(state) < 3 * monthlyPeopleCost(state);
  for (const m of humans) {
    const contractor = m.engagement === 'contractor';
    const pay = contractor ? m.hourlyRate : m.salary;
    const comp = clamp((pay / marketMid(m.role, m.region, contractor) - 1) * 60, -20, 10);
    let target = 70 + comp + (m.equityPct > 0 ? 5 : 0) - (f.energy < 40 ? 10 : 0) - (runwayLow ? 15 : 0);
    if (m.role === 'support' && week.unhandled > 5) target -= 8;
    m.morale = round2(clamp((m.morale ?? 70) + (target - (m.morale ?? 70)) * 0.25, 0, 100));
  }
}

function supportStaffOnly(state, members) {
  return members.filter((m) => m.kind !== 'ai_agent' && m.role === 'support' && m.status === 'active')
    .reduce((a, m) => a + staffTicketsPerWeek(state.company.model) * ((m.hoursPerWeek ?? 40) / 40) * rampFactor(m, state.day) * moraleFactor(m), 0);
}

export function peopleMonthEnd(state) {
  const p = ensurePeople(state);
  if (p.members.some((m) => m.agentType === 'support_ai' && m.status === 'active')) billSupportAi(state, p);

  // AE commission: ~11.2% of new ARR booked this month (Bridge Group OTE math), split across ramped AEs.
  const aes = humansActive(p).filter((m) => m.role === 'ae');
  if (aes.length) {
    const since = state.day - (dateOf(state).getUTCDate() - 1);
    const newMrr = (state.stripe?.events ?? []).filter((e) => e.day >= since && (e.type === 'new' || e.type === 'expansion') && e.amount > 0 && !/^ads:|^organic:/.test(e.source ?? '')).reduce((a, e) => a + e.amount, 0);
    const pool = newMrr * 12 * ROLES.ae.commissionRate;
    for (const m of aes) m.commissionDue = round2((m.commissionDue ?? 0) + pool / aes.length);
  }

  // Attrition.
  for (const m of humansActive(p)) {
    if (m.leavingDay != null) continue;
    const prob = BASE_ATTRITION_MONTHLY * Math.pow(2, (60 - (m.morale ?? 70)) / 15);
    if (chance(state, prob)) {
      m.leavingDay = state.day + 14;
      notify(state, `${m.name} resigned (morale ${Math.round(m.morale)}). Last day ${fmtDate(state, m.leavingDay)}.`, { type: 'bad', app: 'people' });
    }
  }

  // Misclassification: rare but expensive [A].
  for (const m of humansActive(p)) {
    const r = misclassRisk(m, state.day);
    if (r.score >= 2 && chance(state, 0.002 * r.score * r.score)) {
      const paid = Object.values(m.paidByYear ?? {}).reduce((a, b) => a + b, 0);
      const penalty = round2(Math.max(2000, paid * 0.2));
      post(state, { amount: -penalty, counterparty: m.region === 'us' ? 'State EDD' : 'Local labor authority', description: `Worker misclassification assessment: ${m.name} (back taxes & penalties)`, category: 'taxes', method: 'ach', meta: { app: 'people' } });
      m.misclassified = true;
      notify(state, `${m.name} was found to be misclassified as a contractor: ${money(penalty)} in back taxes and penalties. Convert them to an employee/EOR or restructure the engagement.`, { type: 'bad', app: 'people' });
    }
  }
}
