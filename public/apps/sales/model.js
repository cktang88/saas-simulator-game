// Sales state (state.apps.crm / outreach / calls) and the operations every sales app shares.
import { LAND_STRATEGIES, EXPAND } from '../../data/gtm-comp.js';
import { ensure, notify, log } from '../../core/state.js';
import { uid, isWeekend, domainOf, rng, chance, fmtDate, hash, pick } from '../../core/util.js';
import { mainPlan, planOrReference, ensureMarket, hasProduct } from '../../core/market.js';
import { createCustomer, subscribe, cancel } from '../../core/stripe.js';
import { post } from '../../core/bank.js';
import { MARKET } from '../../core/params.js';
import { scheduleEvent, findSlots, fmtTime, cancelEvent, weekdayName, ensureCalendar } from '../../core/calendar.js';
import { validateProspect, trueEmailStatus, isRoleAddress, isFreeMail, normalizeEmail, normalizeLinkedin, splitName } from './csv.js';
import { advanceTo, isOpen, dealAcv, noShowProbability, cycleDays, stageLabel, securityReviewChance, dpaChance, contractDays } from './deals.js';
import { employeesOf, personaFor } from './replies.js';
import { segmentOf, buildCommittee, committeeContacts, methodFor, procurementPlan, dealPaperwork, rollScenarios, getSegment, isCertification, revealMember, addMembers, roleDef } from './segments.js';
import { committeeFor } from '../../data/buyer-segments.js';
import { SALES } from './params.js';
import { ensureLegal } from '../legal/sim.js';
import { CLAUSES } from '../legal/redlines.js';
import { newThread, addMessage } from '../../core/mail.js';
import { discountCheck } from '../channels/pricing-model.js';
import { worldEffect } from '../marketworld/engine.js';
import { emitSalesEvent } from './events.js';
import { checkEarlyDiscount } from './pipeline.js';
import { applyNegotiatedSub, repriceMfn } from '../negotiate/consequences.js'; // negotiated terms land on the subscription; MFN repricing
import { timeline } from '../../core/timing.js';
import { afterSigned, procurementClaimsCheck, recordBridgeLetter, CLAIMS } from './claims.js'; // what the buyer was told vs what is true
import { requestReferences } from './references.js';

const MAX_ACTIVITIES = 3000;

export function ensureCrm(state) {
  const crm = ensure(state, 'crm', () => ({}));
  crm.companies ??= [];
  crm.contacts ??= [];
  crm.deals ??= [];
  crm.activities ??= [];
  crm.tasks ??= [];
  crm.inboundQueue ??= [];
  return crm;
}

export function ensureOutreach(state) {
  const o = ensure(state, 'outreach', () => ({}));
  o.domains ??= [];
  o.inboxes ??= [];
  o.sequences ??= [];
  o.enrollments ??= [];
  o.daily ??= [];
  o.sequencer ??= false;
  o.aiSdr ??= { active: false, reputation: 70, sent: 0, replies: 0, meetings: 0, hallucinations: 0, complaints: 0 };
  o.linkedin ??= { requests: [], messages: [] };
  return o;
}

/** Already in a sequence somewhere, or finished one inside the re-enroll cool-down (what a real sequencer dedupes on). */
export const enrollBlocked = (state, contactId) => ensureOutreach(state).enrollments.some((e) => e.contactId === contactId && (e.status === 'active' || (e.finishedDay != null && state.day - e.finishedDay < SALES.reenroll.coolDownDays)));

/** Enroll a contact in a sequence: the shared path for the Outreach button and automations (status, deal, activity). */
export function enrollContact(state, seq, c, { by = null } = {}) {
  const o = ensureOutreach(state);
  const repeat = o.enrollments.some((e) => e.contactId === c.id);
  const enr = { id: uid('enr'), sequenceId: seq.id, contactId: c.id, step: 0, nextDay: state.day + 1, status: 'active', sent: [], inboxId: null, enrolledDay: state.day, repeat };
  if (by) enr.by = by;
  o.enrollments.push(enr);
  if (['new', 'no_reply', 'inbound'].includes(c.status)) c.status = 'enrolled';
  ensureDeal(state, { companyId: c.companyId, contactId: c.id, source: 'outbound', stage: 'lead' });
  addActivity(state, { type: 'sequence', text: `Enrolled in "${seq.name}"${by === 'automation' ? ' (automation)' : ''}`, companyId: c.companyId, contactId: c.id });
  return enr;
}

/** Remove a sequence step without shifting enrolled contacts onto the wrong step (e.step is the next step to send). */
export function removeSequenceStep(state, seq, stepId) {
  const idx = seq.steps.findIndex((x) => x.id === stepId);
  if (idx < 0) return false;
  seq.steps.splice(idx, 1);
  for (const e of ensureOutreach(state).enrollments) {
    if (e.sequenceId !== seq.id || e.status !== 'active') continue;
    if (e.step > idx) e.step--;
    if (e.step >= seq.steps.length) { e.status = 'finished'; e.finishedDay = state.day; }
  }
  return true;
}

export function ensureCalls(state) {
  const c = ensure(state, 'calls', () => ({}));
  c.meetings ??= [];
  c.reminders ??= true;
  return c;
}

export const contactName = (c) => (c ? (c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email) : 'Unknown');
export const companyOf = (state, c) => ensureCrm(state).companies.find((x) => x.id === c?.companyId);
export const contactById = (state, id) => ensureCrm(state).contacts.find((c) => c.id === id);
export const companyById = (state, id) => ensureCrm(state).companies.find((c) => c.id === id);
export const dealById = (state, id) => ensureCrm(state).deals.find((d) => d.id === id);

export function addActivity(state, { type, text, companyId = null, contactId = null, dealId = null, day = state.day }) {
  const crm = ensureCrm(state);
  crm.activities.push({ id: uid('act'), day, type, text, companyId, contactId, dealId });
  if (crm.activities.length > MAX_ACTIVITIES) crm.activities.splice(0, crm.activities.length - MAX_ACTIVITIES);
}

export function addBusinessDays(state, from, n) {
  let d = from, added = 0;
  while (added < n) { d++; if (!isWeekend(state, d)) added++; }
  return d;
}

// ---- Companies & contacts ----

export function upsertCompany(state, { name = '', domain = '', industry = '', size = '', notes = '', source = 'manual' }) {
  const crm = ensureCrm(state);
  const dom = domainOf(domain);
  let co = (dom && crm.companies.find((c) => c.domain === dom)) || (!dom && name && crm.companies.find((c) => c.name.toLowerCase() === name.toLowerCase()));
  if (co) {
    co.industry ||= industry; co.size ||= size; co.name ||= name;
    if (notes && !co.notes.includes(notes)) co.notes = [co.notes, notes].filter(Boolean).join('\n');
    return co;
  }
  co = { id: uid('co'), name: name || dom || 'Unknown company', domain: dom, industry, size, notes, source, createdDay: state.day, site: null, research: null };
  crm.companies.push(co);
  return co;
}

/**
 * Add a prospect (manual form, CSV row or inbound lead). Validates email syntax and duplicates.
 * p: { firstName, lastName, fullName?, email, title, company, domain, linkedin, industry, size, notes }
 * → { contact, company, issues } or throws on a hard validation error.
 */
export function addContact(state, p, { source = 'manual', status = 'new', warm = false, allowNoEmail = false } = {}) {
  const crm = ensureCrm(state);
  const email = normalizeEmail(p.email);
  let { firstName = '', lastName = '' } = p;
  if (!firstName && p.fullName) ({ firstName, lastName } = splitName(p.fullName));
  const rec = { ...p, email, firstName, lastName };
  let { issues, status: vs } = validateProspect(rec, { existing: new Set(crm.contacts.map((c) => c.email).filter(Boolean)) });
  if (allowNoEmail && !email) { issues = issues.filter((i) => i.text !== 'No email'); vs = issues.some((i) => i.level === 'error') ? 'skip' : 'warn'; issues.push({ level: 'warn', text: 'No email yet (warm intro): reply via the introducer or ask for it' }); }
  if (vs === 'skip') throw new Error(issues.filter((i) => i.level === 'error').map((i) => i.text).join('; '));
  const domain = p.domain || (!isFreeMail(email) ? email.split('@')[1] : '');
  const company = upsertCompany(state, { name: p.company, domain, industry: p.industry, size: p.size, notes: p.notes, source });
  const contact = {
    id: uid('ct'), companyId: company.id, firstName: firstName.trim(), lastName: lastName.trim(),
    name: [firstName, lastName].filter(Boolean).join(' ').trim(), title: (p.title ?? '').trim(), email,
    linkedin: normalizeLinkedin(p.linkedin), source, status, warm,
    role: isRoleAddress(email), free: isFreeMail(email),
    verification: null, truth: trueEmailStatus(email),
    personalization: '', personalizationSource: null, tier: null, linkedinConnected: false,
    replyKind: null, threadId: null, createdDay: state.day, lastContactDay: null, lastThemDay: null, responseDelays: [],
  };
  crm.contacts.push(contact);
  addActivity(state, { type: 'created', text: `Added ${contactName(contact)} (${source})`, companyId: company.id, contactId: contact.id });
  emitSalesEvent(state, 'contact_created', { contactId: contact.id, companyId: company.id, source }, `contact:${contact.id}`);
  return { contact, company, issues };
}

// Simulated verifier (ZeroBounce/NeverBounce-style). Reveals the hidden status; costs money.
export function verifyContacts(state, contacts) {
  const n = contacts.filter((c) => !c.verification).length;
  for (const c of contacts) if (!c.verification) c.verification = c.truth;
  return n;
}

// ---- Deals ----

export const openDealFor = (state, companyId) => ensureCrm(state).deals.find((d) => d.companyId === companyId && isOpen(d));

export function defaultPlan(state) {
  return mainPlan(state);
}

export function ensureDeal(state, { companyId, contactId = null, source = 'outbound', stage = 'lead' }) {
  const crm = ensureCrm(state);
  let deal = openDealFor(state, companyId);
  if (deal) {
    deal.contactId ??= contactId;
    if (stage) moveDeal(state, deal, advanceTo(deal.stage, stage));
    return deal;
  }
  const co = companyById(state, companyId);
  const plan = defaultPlan(state) ?? planOrReference(state); // no price yet: the deal is sized off the market until you set one
  deal = {
    id: uid('deal'), companyId, contactId, name: `${co?.name ?? 'New'} – ${plan.reference ? 'no price yet' : plan.name}`,
    stage, source, planId: plan.id, quantity: 1, annual: state.company.model === 'ent', discountPct: 0,
    amount: dealAcv(plan, { annual: state.company.model === 'ent' }),
    createdDay: state.day, stageDay: state.day, history: [{ stage, day: state.day }],
    expectedCloseDay: null, decisionDay: null, nextStep: null, callQuality: null, lostReason: null,
    security: null, dpa: null, hasPain: null,
  };
  crm.deals.push(deal);
  addActivity(state, { type: 'deal', text: `Deal created at ${stageLabel(stage)}`, companyId, contactId, dealId: deal.id });
  return deal;
}

export function moveDeal(state, deal, stage, note = '') {
  if (!deal || deal.stage === stage) return deal;
  if (stage === 'won') return closeWon(state, deal);
  deal.stage = stage;
  deal.stageDay = state.day;
  deal.history.push({ stage, day: state.day });
  addActivity(state, { type: 'stage', text: `Stage → ${stageLabel(stage)}${note ? `: ${note}` : ''}`, companyId: deal.companyId, contactId: deal.contactId, dealId: deal.id });
  emitSalesEvent(state, stage === 'lost' ? 'deal_lost' : 'deal_stage_changed', { dealId: deal.id, companyId: deal.companyId, stage, reason: stage === 'lost' ? note : undefined });
  return deal;
}

/** Re-open a lost deal at Lead. One open deal per company: with another one open, work that one instead. */
export function reopenDeal(state, deal, note = 'moved manually') {
  if (!deal || deal.stage !== 'lost') throw new Error('Only a lost deal can be re-opened.');
  const other = openDealFor(state, deal.companyId);
  if (other && other.id !== deal.id) throw new Error('This company already has an open deal. Work that one instead of re-opening the old one.');
  deal.lostReason = null;
  return moveDeal(state, deal, 'lead', note);
}

export function loseDeal(state, deal, reason) {
  if (!deal || !isOpen(deal)) return;
  deal.lostReason = reason;
  moveDeal(state, deal, 'lost', reason);
  for (const m of ensureCalls(state).meetings) if (m.dealId === deal.id && ['scheduled', 'ready'].includes(m.status)) cancelMeeting(state, m, 'deal lost');
}

// Attribution channel strings used by Stripe/analytics. Known channel sources pass through unchanged;
// only actual outbound (sequences, LinkedIn, AI SDR, manual prospecting) maps to 'outbound'.
const CHANNEL_SOURCES = new Set(['affiliate', 'referral', 'partner', 'pr', 'sponsorship', 'events', 'webinar', 'review_sites', 'ltd', 'cold_call', 'direct_mail', 'free_tools', 'directories', 'plg', 'ai_search', 'competitor-switch', 'inbound', 'network', 'product-hunt', 'outbound']);
export function stripeSource(src) {
  if (!src) return 'outbound';
  if (/^(ads:|organic:|marketplace:)/.test(src) || CHANNEL_SOURCES.has(src)) return src;
  return 'outbound';
}

/**
 * The buyer said yes: send the order form / MSA. Signature (and billing) follows after a negotiation window
 * (SMB 2–5 d, mid-market 10–20, enterprise 30–60). Larger deals often come back with redlines, handled in
 * Legal → Contracts through Legal's existing redline flow; the deal closes or dies on Legal's outcome.
 */
export function sendContract(state, deal) {
  if (procurementClaimsCheck(state, deal) === 'lost') return deal; // procurement asks for the reports and certificates you claimed
  const card = Boolean(deal.proc?.cardPay);
  const days = card ? 1 : contractDays(deal.amount ?? 0, rng(state));
  deal.contract = { sentDay: state.day, signDay: state.day + days, redlineId: null };
  const big = !card && (state.company.model === 'ent' || (deal.amount ?? 0) >= 15000);
  if (big && chance(state, SALES.redlineChance)) {
    try {
      const L = ensureLegal(state);
      const co = companyById(state, deal.companyId);
      const ct = contactById(state, deal.contactId);
      const keys = Object.keys(CLAUSES);
      const n = state.company.model === 'ent' ? 3 : 2;
      const clauses = [];
      while (clauses.length < Math.min(n, keys.length)) { const k = pick(state, keys); if (!clauses.includes(k)) clauses.push(k); }
      const r = { id: uid('rl'), subId: null, dealId: deal.id, customer: co?.name ?? 'A customer', contact: ct ? contactName(ct) : 'Procurement', receivedDay: state.day, dueDay: state.day + 10, clauses, status: 'open', ownPaper: L.docs?.msa === 'none' };
      L.redlines.unshift(r);
      const t = newThread(state, { subject: `Redlines on the ${r.ownPaper ? 'agreement' : 'MSA'} — ${r.customer}`, with: { name: `${r.customer} Legal`, email: '' }, kind: 'legal', app: 'legal', refId: r.id });
      addMessage(state, t.id, { from: 'them', body: `Before we sign the order form, our legal team has comments (${clauses.map((k) => CLAUSES[k].title.toLowerCase()).join(', ')}). ${r.ownPaper ? 'Since you did not send an MSA, we used our standard paper.' : 'Redlined MSA attached.'} We need your response within 10 days to keep this in the quarter.` });
      deal.contract.redlineId = r.id;
      notify(state, `${r.customer} sent contract redlines before signing. Respond in Legal → Contracts within 10 days.`, { type: 'warn', app: 'legal' });
    } catch (e) { console.warn('[sales] redline creation failed', e); }
  }
  moveDeal(state, deal, 'contract', deal.contract.redlineId ? 'order form sent; redlines received' : 'order form sent for signature');
  return deal;
}

/**
 * Propose an unpaid design partnership or a paid pilot (the usual first enterprise step). One ask per type per deal.
 * Odds: base × real pain × call quality × warm intro × (paid pilots need a usable product). → { ok, p }
 */
export function proposePilot(state, deal, { type = 'design_partner', fee = null } = {}) {
  const P = SALES.pilot[type];
  if (!P) throw new Error('Unknown pilot type');
  if (!['meeting_held', 'qualified'].includes(deal.stage) || deal.pilot) throw new Error('A pilot can follow a held discovery call.');
  deal.pilotAsked ??= {};
  if (deal.pilotAsked[type] != null) throw new Error('You already asked; they said not now.');
  deal.pilotAsked[type] = state.day;
  const ct = contactById(state, deal.contactId);
  const co = companyById(state, deal.companyId) ?? {};
  const persona = ct ? personaFor(state, ct, co) : null;
  const pain = deal.hasPain ?? persona?.hasPain ?? false;
  const q = deal.callQuality ?? 0.3;
  let p = P.base * (pain ? 1 : 0.15) * (0.6 + 0.8 * q) * (ct?.warm || ['network', 'referral', 'inbound'].includes(deal.source) ? 1.3 : 1);
  if (type === 'paid_pilot' && !hasProduct(state)) p *= 0.4;
  p = Math.max(0.02, Math.min(0.6, p));
  const ok = chance(state, p);
  if (!ok) { addActivity(state, { type: 'note', text: `${P.label} proposed: "not now"`, dealId: deal.id, companyId: deal.companyId }); return { ok, p }; }
  const plan = planOrReference(state); // a pilot fee is negotiated; without a list price it is sized off the market's
  const acv = dealAcv(plan, { annual: state.company.model === 'ent' });
  deal.pilot = { type, startDay: state.day, endDay: state.day + P.days, fee: type === 'paid_pilot' ? Math.round(fee ?? acv * P.feeShare) : 0, status: 'active', subId: null };
  if (deal.pilot.fee > 0) {
    const months = Math.max(1, Math.round(P.days / 30));
    const customer = createCustomer(state, { name: ct ? contactName(ct) : co.name, email: ct?.email ?? '', company: co.name ?? null, source: stripeSource(deal.source), crmCompanyId: co.id ?? null, meta: { dealId: deal.id, pilot: true } });
    const sub = subscribe(state, customer.id, { id: 'pilot', price: Math.round(deal.pilot.fee / months), interval: 'month', trialDays: 0 }, { trial: false, source: stripeSource(deal.source), invoiceManually: state.company.model === 'ent' });
    deal.pilot.subId = sub.id;
    deal.pilot.customerId = customer.id;
  }
  deal.decisionDay = null;
  moveDeal(state, deal, 'proposal', `${P.label} started${deal.pilot.fee ? ` ($${deal.pilot.fee.toLocaleString('en-US')})` : ''}, ends ${fmtDate(state, deal.pilot.endDay)}`);
  notify(state, `${co.name ?? 'A prospect'} agreed to a ${P.label.toLowerCase()} until ${fmtDate(state, deal.pilot.endDay)}.`, { type: 'good', app: 'crm' });
  return { ok, p };
}

/** No-bid: decline a formal RFP instead of spending 20-120 hours on a bid you are unlikely to win. */
export function declineRfp(state, deal) {
  if (!deal?.proc?.rfp || ['won', 'lost'].includes(deal.stage)) throw new Error('There is no open RFP on this deal.');
  addActivity(state, { type: 'note', text: 'Declined to bid on the RFP (no-bid)', dealId: deal.id, companyId: deal.companyId });
  const bid = deal.rfpBidId ? state.apps.crm?.rfp?.bids?.find((b) => b.id === deal.rfpBidId) : null; // the formal bid (sales/rfp.js), if one was opened
  if (bid && ['issued', 'bidding'].includes(bid.status)) { bid.status = 'no_bid'; bid.decision ??= 'no_bid'; bid.decisionDay = state.day; }
  loseDeal(state, deal, 'No-bid: you declined the RFP');
  return deal;
}

/** Customer signed: create the Stripe customer + subscription with the deal's plan. */
export function closeWon(state, deal) {
  const crm = ensureCrm(state);
  const co = companyById(state, deal.companyId);
  const ct = contactById(state, deal.contactId) ?? crm.contacts.find((c) => c.companyId === deal.companyId);
  const base = state.plans.find((p) => p.id === deal.planId) ?? mainPlan(state);
  if (!base) throw new Error('Set a price in the Pricing lab before closing a deal.');
  const ent = state.company.model === 'ent';
  let plan = { ...base };
  if ((ent || deal.annual) && base.interval === 'month') {
    const disc = ent ? 0 : MARKET.smb.annualDiscount;
    plan = { ...base, interval: 'year', price: Math.round(base.price * 12 * (1 - disc)) };
  }
  const source = stripeSource(deal.source);
  // A paid pilot already created this account: reuse it (one customer, not a duplicate with the pilot history orphaned).
  const pilotCustomer = deal.pilot?.customerId ? state.stripe?.customers?.find((c) => c.id === deal.pilot.customerId) : null;
  const customer = pilotCustomer ?? createCustomer(state, { name: ct ? contactName(ct) : co?.name ?? 'Customer', email: ct?.email ?? '', company: co?.name ?? null, source, crmCompanyId: co?.id ?? null, meta: { dealId: deal.id } });
  const invoiced = deal.proc ? !deal.proc.cardPay : ent;
  const sub = subscribe(state, customer.id, plan, { trial: false, quantity: deal.quantity ?? 1, discountPct: deal.discountPct ?? 0, source, invoiceManually: invoiced });
  if (deal.proc?.termsDays) sub.paymentTermsDays = deal.proc.termsDays; // net-N terms (core billing support requested)
  if (deal.negotiated) applyNegotiatedSub(state, deal, sub, co); // terms agreed in the contract negotiation (net terms, caps, MFN, liability, term)
  repriceMfn(state, sub); // a deeper discount than an MFN customer got reprices that customer
  deal.stage = 'won';
  deal.stageDay = state.day;
  deal.history.push({ stage: 'won', day: state.day });
  deal.customerId = customer.id;
  deal.subscriptionId = sub.id;
  afterSigned(state, deal, sub); // capability claims the buyer relied on become a sold-vs-delivered ledger
  if (state.apps.legal?.seenSubs && deal.contract) state.apps.legal.seenSubs.push(sub.id); // terms already negotiated pre-signature
  if (ct) ct.status = 'customer';
  emitSalesEvent(state, 'deal_won', { dealId: deal.id, companyId: deal.companyId, stage: 'won', customerId: customer.id, amount: deal.amount });
  addActivity(state, { type: 'stage', text: `Closed won 🎉 ${plan.name} ${plan.interval === 'year' ? 'annual' : 'monthly'} × ${deal.quantity ?? 1}`, companyId: deal.companyId, contactId: deal.contactId, dealId: deal.id });
  notify(state, `Closed won: ${co?.name ?? 'a customer'} signed (${plan.interval === 'year' ? `$${Math.round(plan.price * (deal.quantity ?? 1) * (1 - (deal.discountPct ?? 0)))}/yr${ent ? ', invoiced' : ''}` : `$${plan.price}/mo`}).`, { type: 'good', app: 'crm' });
  return deal;
}

export function addTask(state, { title, dueDay, dealId = null, contactId = null, companyId = null }) {
  const t = { id: uid('task'), title, dueDay, done: false, dealId, contactId, companyId, createdDay: state.day };
  ensureCrm(state).tasks.push(t);
  return t;
}

export function setNextStep(state, deal, text, dueDay) {
  deal.nextStep = { text, dueDay };
  addTask(state, { title: text, dueDay, dealId: deal.id, contactId: deal.contactId, companyId: deal.companyId });
}

// ---- Proposals, security reviews, DPAs ----

/**
 * The SOC 2 report the company can actually hand a buyer today: { type: 'type1'|'type2', opinion, day } or null.
 * An audit in progress is not a report: during a Type II window only an earlier Type I report counts.
 */
export function soc2ReportOnHand(state) {
  const L = state.apps.legal;
  const s = L?.soc2;
  if (!s || s === 'none') return null;
  if (s === true) return { type: 'type2', opinion: 'clean' };
  const reps = L.compliance?.reports ?? [];
  const last = (t) => (L.soc2Report?.type === t ? L.soc2Report : [...reps].reverse().find((r) => r.type === t) ?? null);
  if (s === 'type2') return last('type2') ?? { type: 'type2', opinion: L.soc2Qualified ? 'qualified' : 'clean' };
  if (s === 'type1') return last('type1') ?? { type: 'type1', opinion: L.soc2Qualified ? 'qualified' : 'clean' };
  if (s === 'type2_in_progress') return last('type2') ?? last('type1'); // a renewal keeps the last Type II on hand
  return null;
}

export function hasSoc2(state, { strict = false } = {}) {
  const s = state.apps.legal?.soc2;
  if (!s) return false;
  if (s === true) return true;
  // Legal app: 'none' | 'type1_in_progress' | 'type1' | 'type2_in_progress' | 'type2'. Only an issued report counts.
  if (typeof s === 'string') {
    const rep = soc2ReportOnHand(state);
    // Strict security teams (enterprise, regulated, $50k+) reject a qualified auditor's opinion.
    return Boolean(rep) && !(strict && rep.opinion === 'qualified');
  }
  if (strict && state.apps.legal?.soc2Report?.opinion === 'qualified') return false;
  const st = String(s.status ?? s.stage ?? '').toLowerCase();
  return Boolean(s.report || s.done || /type ?(1|2|i|ii)|complete|done|passed|issued/.test(st));
}
export const hasDpa = (state) => Boolean(state.apps.legal?.dpaReady);

// ---- Buyer segments: committee, methodology, procurement, paperwork, scenarios (sales/segments.js) ----

const R = (state) => () => rng(state);

/** Sample the buying committee once (at the first held call or the proposal), sized by the expected ACV. */
export function ensureCommittee(state, deal) {
  if (deal.committee) return deal.committee;
  const co = companyById(state, deal.companyId);
  const seg = segmentOf(state, co);
  if (!seg || !co) return null;
  const plan = state.plans.find((p) => p.id === deal.planId) ?? planOrReference(state);
  const acv = deal.amount || dealAcv(plan, { annual: state.company.model === 'ent' });
  deal.committee = buildCommittee(state, deal, { company: co, primary: contactById(state, deal.contactId), acv, rand: R(state), addContact });
  if (deal.committee) {
    deal.method = { ...methodFor(seg, acv, deal.committee.members.length), known: deal.method?.known ?? {} };
    deal.segmentId = seg.id;
  }
  return deal.committee;
}

/** Bigger proposals pull in more people: add roles a deal of this size would have. */
function growCommittee(state, deal, seg, acv) {
  if (!deal.committee || acv <= (deal.committee.acv ?? 0) * 1.5) return;
  const have = new Set(committeeContacts(state, deal).map((c) => c.committee.role));
  const seen = new Set();
  const extra = committeeFor(seg.id, acv, R(state)).filter((m) => !have.has(m.role) && !seen.has(m.role) && seen.add(m.role));
  deal.committee.acv = acv;
  if (!extra.length) return;
  addMembers(state, deal, companyById(state, deal.companyId), extra, R(state), addContact);
  addActivity(state, { type: 'note', text: 'A bigger deal means more people involved: new stakeholders will appear as you ask about the process.', dealId: deal.id, companyId: deal.companyId });
}

function segmentProposal(state, deal, seg, { heldDay, responsive }) {
  ensureCommittee(state, deal);
  growCommittee(state, deal, seg, deal.amount);
  deal.method = { ...methodFor(seg, deal.amount, deal.committee?.members.length ?? 1), known: deal.method?.known ?? {} };
  const rand = R(state);
  deal.scenarios = rollScenarios(seg, rand, deal.amount);
  // Roles a scenario needs must exist in the committee (hidden until discovered).
  for (const sc of deal.scenarios) {
    const need = sc.effect.needsRole;
    if (!need || committeeContacts(state, deal).some((c) => c.committee.role === need)) continue;
    const def = roleDef(seg, need);
    if (def) addMembers(state, deal, companyById(state, deal.companyId), [def], rand, addContact);
  }
  const coopAward = Boolean(state.apps.crm?.paperAssets?.coop_contract);
  deal.proc = procurementPlan(state, seg, deal.amount, rand, { coopAward });
  const extra = deal.scenarios.flatMap((x) => x.effect.paperwork ?? []);
  if (deal.proc.rfp) extra.push('rfp_response');
  if (deal.proc.board) extra.push('board_packet');
  deal.paperwork = dealPaperwork(state, seg, deal.amount, rand, extra, deal.proc);
  let cycle = seg.cycleDays ? Math.round(cycleDaysForSeg(seg, deal.amount, rand) * (responsive ? SALES.responseBonus.cycle : 1)) : cycleDays(deal.amount, rand());
  for (const sc of deal.scenarios) {
    cycle *= sc.effect.cycleMult ?? 1;
    if (sc.effect.stallDays && !sc.effect.needsRole) cycle += sc.effect.stallDays[0] + (sc.effect.stallDays[1] - sc.effect.stallDays[0]) * rand();
  }
  cycle = Math.round(cycle * (worldEffect(state, 'salesCycleMult') || 1));
  deal.expectedCloseDay = Math.max(state.day + (deal.proc.cardPay ? 1 : 3), heldDay + cycle, deal.proc.board?.day ?? 0, deal.proc.earliestDecisionDay ?? 0);
  deal.decisionDay = deal.expectedCloseDay;
  deal.security = null; deal.dpa = null; // segment paperwork replaces the generic review
  const fired = deal.scenarios.filter((x) => (x.effect.winMult ?? 1) < 1 || x.effect.needsRole || x.effect.paperwork);
  if (fired.length) addActivity(state, { type: 'note', text: `Watch out: ${fired.map((x) => x.label).join('; ')}`, dealId: deal.id, companyId: deal.companyId });
  for (const n of deal.proc.notes) addActivity(state, { type: 'note', text: n, dealId: deal.id, companyId: deal.companyId });
}

function cycleDaysForSeg(seg, acv, rand) {
  const band = acv < 5000 ? 'lt5k' : acv < 25000 ? 'k5to25' : acv < 100000 ? 'k25to100' : 'gt100';
  const [lo, hi] = seg.cycleDays[band];
  return Math.round(lo + (hi - lo) * Math.pow(rand(), 1.3));
}

/** Work on a paperwork item for up to `hours` (cash cost charged when you start). Returns true when delivered. */
export function workPaperwork(state, deal, itemId, hours) {
  const it = deal.paperwork?.find((x) => x.id === itemId && x.status === 'open');
  if (!it) throw new Error('Nothing to do on that item.');
  if (isCertification(it.id)) throw new Error('SOC 2 is run from Legal (it takes months). Offer a bridge letter meanwhile.');
  if (it.progress === 0 && it.costUsd > 0) post(state, { amount: -it.costUsd, counterparty: /insurance|coi/i.test(it.id) ? 'Insurance broker' : /pen_test|vpat|audit|validation/i.test(it.id) ? 'Outside firm' : 'Compliance vendor', description: it.label, category: /dpa|baa|msa|ndpa|redline|agreement/i.test(it.id) ? 'legal' : 'contractors', method: 'card' });
  it.progress = Math.round((it.progress + hours) * 100) / 100;
  if (it.progress + 1e-9 < it.hours) return false;
  it.status = 'done';
  it.doneDay = state.day;
  it.readyDay = state.day + (it.days ?? 0); // the buyer still has to review it
  const crm = ensureCrm(state);
  (crm.paperAssets ??= {})[it.id] = state.day;
  addActivity(state, { type: 'note', text: `Delivered: ${it.label} (their review ~${it.days} days)`, dealId: deal.id, companyId: deal.companyId });
  return true;
}

/** While SOC 2 is in progress: offer a bridge letter. Mid-market often accepts; strict TPRM teams don't. */
export function offerBridgeLetter(state, deal) {
  const it = deal.paperwork?.find((x) => isCertification(x.id) && x.status === 'open');
  if (!it) throw new Error('No SOC 2 requirement open.');
  const seg = getSegment(deal.segmentId);
  const B = CLAIMS.bridge;
  // A bridge letter bridges an audit that is underway (auditor, window dates). With no audit started it is a
  // promise only, and security teams that ask "who is your auditor?" mostly say no [design].
  const underway = /_in_progress$/.test(String(state.apps.legal?.soc2 ?? ''));
  const p = (['regulated', 'health', 'public'].includes(seg?.group) || seg?.id === 'enterprise' ? B.acceptStrict : B.acceptMid) * (underway ? 1 : B.noAuditMult);
  const ok = chance(state, p);
  it.bridgeTried = true;
  if (ok) { it.status = 'done'; it.waived = 'bridge letter'; it.doneDay = state.day; it.readyDay = state.day + 3; }
  recordBridgeLetter(state, deal, it, { accepted: ok }); // the buyer comes back for the report by the promised date
  addActivity(state, { type: 'note', text: ok ? `They accepted a SOC 2 bridge letter for now; they expect the report by day ${it.bridge?.promisedDay}` : underway ? 'They need the actual SOC 2 report' : 'No audit underway: they will not accept a letter without an auditor and window dates', dealId: deal.id, companyId: deal.companyId });
  return ok;
}

/** Multi-threading: ask a supportive, engaged contact for an intro, or reach out cold. Returns { ok, p }. */
export function reachStakeholder(state, deal, contactId, { via = 'intro' } = {}) {
  const target = contactById(state, contactId);
  if (!target?.committee) throw new Error('Not part of this buying group.');
  const helpers = committeeContacts(state, deal).filter((c) => c.committee.engaged && c.committee.stance === 'support' && c.id !== contactId);
  const champ = helpers.find((c) => c.committee.role === 'champion') ?? helpers[0];
  let p = via === 'intro' ? (champ ? (champ.committee.role === 'champion' ? 0.7 : 0.45) : 0) : 0.25;
  if (target.committee.stance === 'oppose') p *= 0.7;
  if (via === 'intro' && !champ) throw new Error('Nobody supportive has met you yet: find a champion first.');
  // Check the calendar before asking anyone: a failed ask must not leave the contact revealed or the ask counted.
  const slot = nextSlot(state, { minLead: 2, duration: state.company.model === 'ent' ? 45 : 30, seed: target.id });
  if (!slot) throw new Error('No free slot on your calendar in the next 30 days.');
  target.committee.asked = (target.committee.asked ?? 0) + 1;
  p *= Math.pow(0.6, target.committee.asked - 1);
  const ok = chance(state, p);
  if (ok) {
    revealMember(target);
    const m = createMeeting(state, { contactId: target.id, slot, kind: 'stakeholder', source: via === 'intro' ? 'referral' : 'outbound', duration: state.company.model === 'ent' ? 45 : 30 });
    m.dealId = deal.id;
    m.stakeholder = true;
    if (via === 'intro') m.noShowP *= 0.6;
  }
  addActivity(state, { type: 'note', text: `${via === 'intro' ? `Asked ${champ ? contactName(champ) : 'your contact'} for an intro to` : 'Cold outreach to'} ${contactName(target)} (${target.title}): ${ok ? 'call booked' : 'no response'}`, dealId: deal.id, companyId: deal.companyId });
  return { ok, p };
}

/** Find more of the buying group (LinkedIn, the org chart on their website). */
export function mapBuyingGroup(state, deal) {
  const hidden = committeeContacts(state, deal).filter((c) => c.hidden).sort((a, b) => b.committee.influence - a.committee.influence);
  if (!hidden.length) return null;
  if (!chance(state, 0.6)) return null;
  const c = hidden[Math.floor(rng(state) * Math.min(3, hidden.length))];
  revealMember(c);
  addActivity(state, { type: 'note', text: `Found ${contactName(c)} (${c.title}) on LinkedIn`, dealId: deal.id, companyId: deal.companyId });
  return c;
}

/** Send a proposal / start a paid pilot: sets the decision date and rolls enterprise blockers. */
export function startProposal(state, deal, { planId, quantity = 1, annual = false, discountPct = 0 }) {
  const plan = state.plans.find((p) => p.id === planId) ?? mainPlan(state);
  if (!plan) throw new Error('Set a price in the Pricing lab before sending a proposal.');
  const ent = state.company.model === 'ent';
  deal.planId = plan.id;
  // Seats can't exceed headcount; proposals far above what they'd roll out to rarely close.
  const co = companyById(state, deal.companyId) ?? {};
  const employees = employeesOf(co, ent ? 'ent' : 'smb');
  // A chosen land strategy (sales/expand.js) sets how many seats the first contract covers; a ramped contract starts smaller.
  const L = deal.land ? LAND_STRATEGIES[deal.land.strategy] : null;
  if (L) quantity = Math.max(1, Math.round(employees * L.sizeShare));
  deal.quantity = Math.min(Math.max(1, Math.round(quantity)), employees);
  if (L && deal.land.ramp && deal.quantity >= 3) { deal.rampTo = deal.quantity; deal.quantity = Math.max(1, Math.round(deal.quantity * EXPAND.rampStart)); } else delete deal.rampTo;
  deal.oversized = !L && deal.quantity > 1 && deal.quantity > SALES.oversizedShare * employees;
  deal.annual = ent || annual;
  deal.discountPct = Math.min(0.5, Math.max(0, discountPct));
  deal.amount = dealAcv(plan, { quantity: deal.quantity, annual: deal.annual, discountPct: deal.discountPct, annualDiscount: ent ? 0 : MARKET.smb.annualDiscount });
  // Discount guardrail from the Pricing app (by list ACV band).
  const listAcv = dealAcv(plan, { quantity: deal.quantity, annual: deal.annual, annualDiscount: ent ? 0 : MARKET.smb.annualDiscount });
  const chk = discountCheck(state, listAcv, deal.discountPct);
  deal.discountGuard = { max: chk.max, over: !chk.ok, note: chk.note };
  if (!deal.ownerAeId) checkEarlyDiscount(state, deal, listAcv); // a hired AE's discounting shows in their own traits
  const ct = contactById(state, deal.contactId);
  const responsive = ct ? responsiveContact(ct) : false;
  const heldDay = deal.history.find((h) => h.stage === 'meeting_held')?.day ?? state.day;
  const seg = segmentOf(state, co);
  if (seg) {
    segmentProposal(state, deal, seg, { heldDay, responsive });
  } else {
    // Market events (e.g. enterprise budget freezes ×1.3–1.6) stretch the cycle.
    const cycle = Math.round(cycleDays(deal.amount, rng(state), { responsive }) * (worldEffect(state, 'salesCycleMult') || 1));
    deal.expectedCloseDay = Math.max(state.day + 3, heldDay + cycle);
    deal.decisionDay = deal.expectedCloseDay;
    // Procurement friction keys on ACV, not on the business model (a $1.5k "enterprise" deal rarely gets a SIG).
    if (!deal.security && chance(state, securityReviewChance(deal.amount))) {
      deal.security = { status: 'requested', day: state.day };
      addActivity(state, { type: 'note', text: 'Buyer requested a security review (SOC 2 report or questionnaire).', dealId: deal.id, companyId: deal.companyId });
    }
    if (!deal.dpa && chance(state, dpaChance(deal.amount))) {
      deal.dpa = { status: hasDpa(state) ? 'sent' : 'requested', day: state.day };
      addActivity(state, { type: 'note', text: `Buyer asked for a DPA${hasDpa(state) ? ' (sent your standard DPA)' : ''}.`, dealId: deal.id, companyId: deal.companyId });
    }
  }
  if (L && deal.decisionDay != null) {
    deal.decisionDay = state.day + Math.max(1, Math.round((deal.decisionDay - state.day) * L.cycleMult * (deal.land.ramp ? 0.95 : 1)));
    deal.expectedCloseDay = deal.decisionDay;
  }
  requestReferences(state, deal); // bigger buyers call 1-3 of your customers before they decide (sales/references.js)
  moveDeal(state, deal, 'proposal', `${plan.name} × ${deal.quantity}, ACV $${deal.amount.toLocaleString('en-US')}${L ? `, land: ${L.label.toLowerCase()}` : ''}`);
  return deal;
}

export const responsiveContact = (ct) => {
  const d = ct.responseDelays ?? [];
  return d.length > 0 && d.filter((x) => x <= 1).length / d.length >= 0.7;
};

// ---- Meetings (on the founder calendar) ----

export const meetingById = (state, id) => ensureCalls(state).meetings.find((m) => m.id === id);
export const openMeetingFor = (state, contactId) => ensureCalls(state).meetings.find((m) => m.contactId === contactId && ['scheduled', 'ready'].includes(m.status));
export const slotText = (state, slot) => `${weekdayName(state, slot.day)} ${fmtDate(state, slot.day).replace(/, \d{4}$/, '')} at ${fmtTime(slot.start)}`;

/** Next free calendar slot for a call at least `minLead` business days out. */
/** A free calendar slot the prospect picks: they choose among ~3 offered days and prefer their own time of day. */
// Business days until a prospect's first free slot (core/timing.js 'meeting.lead.prospect'). Execs are booked
// further out and often go through an assistant; an eager buyer makes room this week; enterprise calendars are
// fuller than an owner-operator's; a booking link lets them grab your earliest slot [design, timelines.md §2].
const EXEC = /\b(chief|ceo|cfo|cto|coo|cio|ciso|cro|cmo|vp|vice president|president|general counsel|partner)\b/i;
export function prospectLead(state, contact, { interest = null } = {}) {
  const title = contact?.title ?? '';
  const f = [
    EXEC.test(title) ? { label: 'exec calendar', pull: 0.7 } : /director|head of/i.test(title) ? { label: 'director calendar', pull: 0.3 } : /owner|founder/i.test(title) && state.company.model !== 'ent' ? { label: 'owner-operator', pull: -0.3 } : null,
    interest === 'interested' ? { label: 'eager', pull: -0.6 } : interest === 'curious' ? { label: 'lukewarm', pull: 0.3 } : null,
    state.company.model === 'ent' ? { label: 'enterprise', pull: 0.4 } : null,
    ensureCalendar(state).bookingLink ? { label: 'your booking link', speed: 0.7 } : null,
  ];
  return Math.max(1, Math.round(timeline(state, 'meeting.lead.prospect', f).days));
}

export function nextSlot(state, { minLead = 1, duration = 30, seed = null } = {}) {
  const fromDay = addBusinessDays(state, state.day, minLead);
  const opts = findSlots(state, { fromDay, duration, count: 3 });
  if (!opts.length) return null;
  if (seed == null) return opts[0];
  const u = (k) => (parseInt(hash(`${seed}|${state.day}|${k}`), 36) % 1000) / 1000;
  const day = opts[Math.floor(u('d') * opts.length)].day;
  const pref = [9 * 60, 10 * 60 + 30, 11 * 60 + 30, 13 * 60 + 30, 15 * 60, 16 * 60][Math.floor(u('t') * 6)];
  const later = findSlots(state, { fromDay: day, duration, count: 1, earliest: pref })[0];
  return later && later.day === day ? later : opts.find((o) => o.day === day);
}

export function createMeeting(state, { contactId, slot, kind = 'discovery', source = 'outbound', duration = 30 }) {
  const calls = ensureCalls(state);
  const ct = contactById(state, contactId);
  const co = companyOf(state, ct);
  const deal = ensureDeal(state, { companyId: co.id, contactId, source, stage: 'meeting_booked' });
  const leadDays = slot.day - state.day;
  const seg = state.company.model === 'ent' ? 'ent' : 'smb';
  const m = {
    id: uid('mtg'), contactId, companyId: co.id, dealId: deal.id, kind, source, day: slot.day, start: slot.start, duration,
    bookedDay: state.day, status: 'scheduled', noShowP: noShowProbability({ leadDays, segment: seg, source, reminders: calls.reminders }),
    eventId: null, transcript: [], scorecard: null, engagement: 5, rescheduled: 0,
  };
  const ev = scheduleEvent(state, { title: `${kind === 'discovery' ? 'Discovery call' : 'Follow-up call'}: ${contactName(ct)} (${co.name})`, kind: 'call', app: 'calls', refId: m.id, with: { name: contactName(ct), email: ct.email }, day: slot.day, start: slot.start, duration, location: 'Zoom', notes: deal.name, allowConflict: true });
  m.eventId = ev.id;
  calls.meetings.push(m);
  if (ct.status !== 'customer') ct.status = 'meeting';
  addActivity(state, { type: 'meeting', text: `${kind === 'discovery' ? 'Discovery' : 'Follow-up'} call booked for ${slotText(state, slot)}`, companyId: co.id, contactId, dealId: deal.id });
  emitSalesEvent(state, 'meeting_booked', { meetingId: m.id, contactId, companyId: co.id, dealId: deal.id, source }, `booked:${m.id}`);
  emitSalesEvent(state, 'call_scheduled', { meetingId: m.id, contactId, dealId: deal.id, callDay: slot.day }, `sched:${m.id}`);
  return m;
}

export function cancelMeeting(state, m, reason = 'canceled') {
  m.status = 'canceled';
  if (m.eventId) cancelEvent(state, m.eventId, reason);
}

export function calendarEvent(state, m) {
  return ensureCalendar(state).events.find((e) => e.id === m.eventId);
}

export { hasProduct, ensureMarket };
export const logSales = (state, text) => log(state, 'info', text, 'crm');
