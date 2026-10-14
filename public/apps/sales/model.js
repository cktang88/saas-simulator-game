// Sales state (state.apps.crm / outreach / calls) and the operations every sales app shares.
import { ensure, notify, log } from '../../core/state.js';
import { uid, isWeekend, domainOf, rng, chance, fmtDate, hash, pick } from '../../core/util.js';
import { mainPlan, ensureMarket, hasProduct } from '../../core/market.js';
import { createCustomer, subscribe } from '../../core/stripe.js';
import { MARKET } from '../../core/params.js';
import { scheduleEvent, findSlots, fmtTime, cancelEvent, weekdayName, ensureCalendar } from '../../core/calendar.js';
import { validateProspect, trueEmailStatus, isRoleAddress, isFreeMail, normalizeEmail, normalizeLinkedin, splitName } from './csv.js';
import { advanceTo, isOpen, dealAcv, noShowProbability, cycleDays, stageLabel, securityReviewChance, dpaChance, contractDays } from './deals.js';
import { employeesOf } from './replies.js';
import { SALES } from './params.js';
import { ensureLegal } from '../legal/sim.js';
import { CLAUSES } from '../legal/redlines.js';
import { newThread, addMessage } from '../../core/mail.js';
import { discountCheck } from '../channels/pricing-model.js';
import { worldEffect } from '../marketworld/engine.js';

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
  const plan = defaultPlan(state);
  deal = {
    id: uid('deal'), companyId, contactId, name: `${co?.name ?? 'New'} – ${plan.name}`,
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
  return deal;
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
  const days = contractDays(deal.amount ?? 0, rng(state));
  deal.contract = { sentDay: state.day, signDay: state.day + days, redlineId: null };
  const big = state.company.model === 'ent' || (deal.amount ?? 0) >= 15000;
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

/** Customer signed: create the Stripe customer + subscription with the deal's plan. */
export function closeWon(state, deal) {
  const crm = ensureCrm(state);
  const co = companyById(state, deal.companyId);
  const ct = contactById(state, deal.contactId) ?? crm.contacts.find((c) => c.companyId === deal.companyId);
  const base = state.plans.find((p) => p.id === deal.planId) ?? mainPlan(state);
  const ent = state.company.model === 'ent';
  let plan = { ...base };
  if ((ent || deal.annual) && base.interval === 'month') {
    const disc = ent ? 0 : MARKET.smb.annualDiscount;
    plan = { ...base, interval: 'year', price: Math.round(base.price * 12 * (1 - disc)) };
  }
  const source = stripeSource(deal.source);
  const customer = createCustomer(state, { name: ct ? contactName(ct) : co?.name ?? 'Customer', email: ct?.email ?? '', company: co?.name ?? null, source, crmCompanyId: co?.id ?? null, meta: { dealId: deal.id } });
  const sub = subscribe(state, customer.id, plan, { trial: false, quantity: deal.quantity ?? 1, discountPct: deal.discountPct ?? 0, source, invoiceManually: ent });
  deal.stage = 'won';
  deal.stageDay = state.day;
  deal.history.push({ stage: 'won', day: state.day });
  deal.customerId = customer.id;
  deal.subscriptionId = sub.id;
  if (state.apps.legal?.seenSubs && deal.contract) state.apps.legal.seenSubs.push(sub.id); // terms already negotiated pre-signature
  if (ct) ct.status = 'customer';
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

export function hasSoc2(state) {
  const s = state.apps.legal?.soc2;
  if (!s) return false;
  if (s === true) return true;
  // Legal app: 'none' | 'type1_in_progress' | 'type1' | 'type2_in_progress' | 'type2' (a finished Type I counts).
  if (typeof s === 'string') return s === 'type1' || s === 'type2' || s === 'type2_in_progress';
  const st = String(s.status ?? s.stage ?? '').toLowerCase();
  return Boolean(s.report || s.done || /type ?(1|2|i|ii)|complete|done|passed|issued/.test(st));
}
export const hasDpa = (state) => Boolean(state.apps.legal?.dpaReady);

/** Send a proposal / start a paid pilot: sets the decision date and rolls enterprise blockers. */
export function startProposal(state, deal, { planId, quantity = 1, annual = false, discountPct = 0 }) {
  const plan = state.plans.find((p) => p.id === planId) ?? mainPlan(state);
  const ent = state.company.model === 'ent';
  deal.planId = plan.id;
  // Seats can't exceed headcount; proposals far above what they'd roll out to rarely close.
  const co = companyById(state, deal.companyId) ?? {};
  const employees = employeesOf(co, ent ? 'ent' : 'smb');
  deal.quantity = Math.min(Math.max(1, Math.round(quantity)), employees);
  deal.oversized = deal.quantity > 1 && deal.quantity > SALES.oversizedShare * employees;
  deal.annual = ent || annual;
  deal.discountPct = Math.min(0.5, Math.max(0, discountPct));
  deal.amount = dealAcv(plan, { quantity: deal.quantity, annual: deal.annual, discountPct: deal.discountPct, annualDiscount: ent ? 0 : MARKET.smb.annualDiscount });
  // Discount guardrail from the Pricing app (by list ACV band).
  const listAcv = dealAcv(plan, { quantity: deal.quantity, annual: deal.annual, annualDiscount: ent ? 0 : MARKET.smb.annualDiscount });
  const chk = discountCheck(state, listAcv, deal.discountPct);
  deal.discountGuard = { max: chk.max, over: !chk.ok, note: chk.note };
  const ct = contactById(state, deal.contactId);
  const responsive = ct ? responsiveContact(ct) : false;
  const heldDay = deal.history.find((h) => h.stage === 'meeting_held')?.day ?? state.day;
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
  moveDeal(state, deal, 'proposal', `${plan.name} × ${deal.quantity}, ACV $${deal.amount.toLocaleString('en-US')}`);
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
