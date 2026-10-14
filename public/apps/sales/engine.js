// Daily (synchronous, seeded) simulation for the sales apps: sending, deliverability, reply gating,
// LinkedIn, AI SDR, meetings/no-shows and deal decisions. LLM work is only enqueued here.
import { notify } from '../../core/state.js';
import { enqueue } from '../../core/jobs.js';
import { rng, chance, poisson, isWeekend, lerp, clamp, hash, dayOfMonth } from '../../core/util.js';
import { syntheticPerson, hasProduct, ensureMarket } from '../../core/market.js';
import { completeEvent } from '../../core/calendar.js';
import { post, addRecurring } from '../../core/bank.js';
import { SALES } from './params.js';
import { analyzeCopy, spamminess, renderTemplate, varsFor } from './copy.js';
import { warmupProgress, recommendedCap, effectiveCap, inboxPlacement, bounceProbability, complaintProbability, nextReputation } from './deliverability.js';
import { tierFor, replyProbability, positiveShare, replyKind, isPositive, isSaasIcp, personaFor } from './replies.js';
import { isOpen, closeProbability, qualifyProbability, callQuality } from './deals.js';
import { heuristicScorecard } from './scorecard.js';
import { askPenalty, askDelay } from '../success/asks.js';
import {
  ensureCrm, ensureOutreach, ensureCalls, contactById, companyOf, contactName, ensureDeal, moveDeal, loseDeal, closeWon,
  addActivity, addTask, addBusinessDays, addContact, createMeeting, nextSlot, calendarEvent, hasSoc2, hasDpa, responsiveContact,
} from './model.js';

export const stepKey = (step) => hash(`${step.subject}\n${step.body}`);
export function stepQuality(seq, step, i) {
  const j = seq.judge?.[stepKey(step)];
  return j?.quality ?? analyzeCopy(step, i).score;
}

// Render step i of a sequence for a contact. Follow-ups without a subject reply in the same thread.
export function renderStep(state, seq, i, contact, company) {
  const step = seq.steps[i];
  const vars = varsFor(state, contact, company);
  const firstSubj = renderTemplate(seq.steps[0]?.subject ?? '', vars);
  const subject = step.subject?.trim() ? renderTemplate(step.subject, vars) : `Re: ${firstSubj}`;
  return { subject, body: renderTemplate(step.body, vars) };
}

// ---------------------------------------------------------------------------
// Replies (shared by sequences, LinkedIn and AI SDR)
// ---------------------------------------------------------------------------

export function recordReply(state, { contact, kind, source = 'sequence', channel = 'email', subject = '', body = '', day = state.day }) {
  const o = ensureOutreach(state);
  const co = companyOf(state, contact);
  if (kind !== 'ooo') {
    contact.replyKind = kind;
    contact.status = isPositive(kind) ? 'interested' : kind === 'unsubscribe' || kind === 'hallucination' ? 'unsubscribed' : 'replied';
    contact.lastThemDay = day;
    for (const e of o.enrollments) if (e.contactId === contact.id && e.status === 'active') e.status = 'replied';
    const dealSource = source === 'ai_sdr' ? 'ai_sdr' : source === 'linkedin' ? 'linkedin' : 'outbound';
    if (co) {
      const deal = ensureDeal(state, { companyId: co.id, contactId: contact.id, source: dealSource, stage: isPositive(kind) ? 'replied' : 'contacted' });
      if (kind === 'unsubscribe' || kind === 'hallucination') loseDeal(state, deal, 'Opted out');
      if (kind === 'not_now') addTask(state, { title: `Check back with ${contactName(contact)} (said "not now")`, dueDay: day + 90, dealId: deal.id, contactId: contact.id });
    }
  }
  addActivity(state, { type: 'reply', text: `${channel === 'linkedin' ? 'LinkedIn reply' : 'Email reply'}: ${kind.replace('_', ' ')}`, companyId: co?.id, contactId: contact.id, day });
  enqueue(state, 'sales:coldReply', { contactId: contact.id, kind, source, channel, subject, body, day }, { label: `Reply from ${contactName(contact)}` });
}

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

function dayCounters(map, id) {
  return (map[id] ??= { sent: 0, bounced: 0, complaints: 0, positive: 0, overSends: 0 });
}

function sendSequences(state, o, today, perDomain) {
  const crm = ensureCrm(state);
  const caps = new Map(o.inboxes.map((ib) => [ib.id, { left: effectiveCap(ib, state.day), rec: recommendedCap(ib, state.day), used: 0 }]));
  const due = o.enrollments.filter((e) => e.status === 'active' && e.nextDay <= state.day).sort((a, b) => a.nextDay - b.nextDay);
  const saas = isSaasIcp(state);
  for (const e of due) {
    const seq = o.sequences.find((s) => s.id === e.sequenceId);
    if (!seq || seq.status !== 'active' || !seq.steps[e.step]) continue;
    const pool = (seq.inboxIds?.length ? seq.inboxIds : o.inboxes.map((i) => i.id)).map((id) => o.inboxes.find((i) => i.id === id)).filter(Boolean);
    let inbox = pool.find((i) => i.id === e.inboxId && caps.get(i.id)?.left > 0);
    if (!inbox) inbox = pool.filter((i) => caps.get(i.id)?.left > 0).sort((a, b) => caps.get(b.id).left - caps.get(a.id).left)[0];
    if (!inbox) continue; // queued for tomorrow
    e.inboxId ??= inbox.id;
    const cap = caps.get(inbox.id);
    cap.left--; cap.used++;
    const contact = contactById(state, e.contactId);
    if (!contact || !contact.email || ['unsubscribed', 'bounced', 'customer', 'disqualified'].includes(contact.status) || (contact.replyKind && contact.replyKind !== 'ooo')) { e.status = 'stopped'; cap.left++; cap.used--; continue; }
    const company = companyOf(state, contact);
    const domain = o.domains.find((d) => d.id === inbox.domainId);
    const step = seq.steps[e.step];
    const analysis = analyzeCopy(step, e.step);
    const quality = stepQuality(seq, step, e.step);
    const tier = tierFor({ contact, company, analysis, stepIndex: e.step });
    if (e.step === 0) contact.tier = tier;
    const spam = spamminess(analysis);
    const overCap = cap.rec ? Math.max(0, (cap.used - cap.rec) / cap.rec) : 1;
    const dc = dayCounters(perDomain, domain.id);
    dc.sent++; if (overCap > 0) dc.overSends++;
    today.sent++;
    seq.stats.sent++;
    inbox.sentTotal = (inbox.sentTotal ?? 0) + 1;
    const { subject, body } = renderStep(state, seq, e.step, contact, company);
    e.sent.push(state.day);
    contact.lastContactDay = state.day;
    if (['new', 'enrolled', 'inbound'].includes(contact.status)) contact.status = 'contacted';
    if (company) ensureDeal(state, { companyId: company.id, contactId: contact.id, source: 'outbound', stage: 'contacted' });
    addActivity(state, { type: 'email', text: `Email ${e.step + 1} sent from ${inbox.address}: "${subject}"`, companyId: company?.id, contactId: contact.id });

    if (chance(state, bounceProbability(contact.truth, { role: contact.role }))) {
      dc.bounced++; today.bounced++; seq.stats.bounced++;
      contact.status = 'bounced'; contact.verification ??= 'invalid';
      e.status = 'bounced';
      addActivity(state, { type: 'bounce', text: `Hard bounce: ${contact.email}`, companyId: company?.id, contactId: contact.id });
      continue;
    }
    const inboxed = chance(state, inboxPlacement({ domain, warmup: warmupProgress(inbox, state.day), content: quality, spam, overCap, trackOpens: seq.trackOpens }));
    if (seq.trackOpens && ((inboxed && chance(state, SALES.humanOpenRate)) || chance(state, SALES.mppOpenInflation))) { seq.stats.opens++; today.opens++; }
    if (inboxed) {
      seq.stats.inboxed++; today.inboxed++;
      if (chance(state, complaintProbability({ tier, spam, hasOptOut: analysis.hasOptOut, overCap, role: contact.role }))) {
        dc.complaints++; today.complaints++; seq.stats.complaints++;
        contact.status = 'unsubscribed';
        e.status = 'complained';
        addActivity(state, { type: 'complaint', text: 'Marked your email as spam', companyId: company?.id, contactId: contact.id });
        continue;
      }
      if (e.step === 0 && chance(state, SALES.oooRate)) {
        today.ooo++;
        enqueue(state, 'sales:coldReply', { contactId: contact.id, kind: 'ooo', source: 'sequence', channel: 'email', subject, body, day: state.day }, { label: 'Auto-reply' });
      }
      const p = replyProbability({ tier, stepIndex: e.step, quality, fit: company?.research?.fit ?? null, saas, contact });
      if (chance(state, p)) {
        const kind = replyKind(positiveShare({ tier, quality, fit: company?.research?.fit ?? null }), rng(state), rng(state));
        today.replies++; seq.stats.replies++;
        if (isPositive(kind)) { today.positive++; seq.stats.positive++; dc.positive++; }
        recordReply(state, { contact, kind, source: 'sequence', subject, body });
        e.status = 'replied';
        continue;
      }
    }
    e.step++;
    if (e.step >= seq.steps.length) {
      e.status = 'finished';
      if (contact.status === 'contacted') contact.status = 'no_reply';
    } else e.nextDay = addBusinessDays(state, state.day, Math.max(1, seq.steps[e.step].delayDays ?? 3));
  }
  // Instantly-style auto-pause on high bounces.
  for (const seq of o.sequences) {
    if (seq.status === 'active' && seq.stats.sent >= SALES.bouncePauseMinSends && seq.stats.bounced / seq.stats.sent >= SALES.bouncePause) {
      seq.status = 'paused';
      notify(state, `Sequence "${seq.name}" auto-paused: bounce rate ${(100 * seq.stats.bounced / seq.stats.sent).toFixed(1)}% (≥5%). Verify your list.`, { type: 'bad', app: 'outreach' });
    }
  }
}

// ---------------------------------------------------------------------------
// AI SDR (managed agent prospecting from its own vendor database)
// ---------------------------------------------------------------------------

function aiSdrDay(state, o, today) {
  const a = o.aiSdr;
  if (!a.active || isWeekend(state)) return;
  const A = SALES.aiSdr;
  const weeks = (state.day - a.startDay) / 7;
  const rate = lerp(A.replyStart, A.replyFloor, weeks / A.decayWeeks);
  const placement = clamp(0.35 + 0.55 * a.reputation / 100, 0.1, 0.9);
  const sends = A.dailySends;
  const halluc = poisson(state, sends * A.hallucination);
  const complaints = poisson(state, sends * placement * 0.0012 + halluc * placement * 0.006);
  a.sent += sends; a.hallucinations += halluc; a.complaints += complaints;
  a.reputation = clamp(a.reputation + (70 - a.reputation) * 0.02 - complaints * 2.5 - halluc * 0.08, 0, 100);
  today.aiSent += sends;
  const replies = poisson(state, sends * placement * rate * 0.5);
  for (let i = 0; i < replies; i++) {
    const person = syntheticPerson(state);
    let contact;
    try {
      contact = addContact(state, { fullName: person.name, email: person.email, company: person.company, title: chance(state, 0.5) ? 'Owner' : 'Operations Manager', notes: 'Sourced by the AI SDR from its vendor database' }, { source: 'ai_sdr', status: 'contacted' }).contact;
    } catch { continue; }
    const kind = chance(state, A.hallucination) ? 'hallucination' : replyKind(A.positiveShare, rng(state), rng(state));
    a.replies++;
    recordReply(state, { contact, kind, source: 'ai_sdr', subject: `Quick question, ${person.company}`, body: '(Written and sent by your AI SDR — you never reviewed this email.)' });
    if (kind === 'hallucination') notify(state, `Your AI SDR told ${person.company} something untrue about them. They complained.`, { type: 'bad', app: 'outreach' });
    if (kind === 'interested' && chance(state, A.autoBook)) {
      const slot = nextSlot(state, { minLead: 2 + Math.floor(rng(state) * 5) });
      if (slot) { createMeeting(state, { contactId: contact.id, slot, source: 'ai_sdr' }); a.meetings++; }
    }
  }
  if (a.reputation < 30 && !a.warned) {
    a.warned = true;
    notify(state, 'AI SDR sending domains are burning out (reputation < 30). Replies will dry up.', { type: 'warn', app: 'outreach' });
  }
}

export function startAiSdr(state) {
  const o = ensureOutreach(state);
  const a = o.aiSdr;
  if (a.active) return;
  post(state, { amount: -SALES.aiSdr.monthly, counterparty: 'AI SDR vendor', description: 'Managed AI SDR, first month', category: 'software', method: 'card' });
  const r = addRecurring(state, { vendor: 'AI SDR vendor', amount: SALES.aiSdr.monthly, category: 'software', dayOfMonth: Math.min(28, dayOfMonth(state)), note: 'Managed AI SDR' });
  Object.assign(a, { active: true, startDay: state.day, recurringId: r.id, reputation: a.reputation ?? 70, warned: false });
}
export function stopAiSdr(state) {
  const a = ensureOutreach(state).aiSdr;
  a.active = false;
  a.endDay = state.day;
  const r = state.recurring.find((x) => x.id === a.recurringId);
  if (r) r.active = false;
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

function linkedinDay(state, o) {
  for (const r of o.linkedin.requests) {
    if (r.status !== 'pending' || r.decideDay > state.day) continue;
    const ct = contactById(state, r.contactId);
    if (chance(state, r.pAccept)) {
      r.status = 'accepted';
      if (ct) { ct.linkedinConnected = true; addActivity(state, { type: 'linkedin', text: 'Accepted your LinkedIn connection request', companyId: ct.companyId, contactId: ct.id }); }
    } else r.status = state.day - r.day > 21 ? 'ignored' : 'pending';
    if (r.status === 'pending') r.decideDay = state.day + 7;
  }
  for (const m of o.linkedin.messages) {
    if (m.status !== 'sent' || m.decideDay > state.day) continue;
    m.status = 'done';
    const ct = contactById(state, m.contactId);
    if (!ct || ct.replyKind) continue;
    if (chance(state, m.pReply)) {
      const q = m.quality ?? 0.6;
      const kind = replyKind(clamp(0.3 + 0.3 * q, 0.15, 0.6), rng(state), rng(state));
      recordReply(state, { contact: ct, kind, source: 'linkedin', channel: 'linkedin', subject: 'LinkedIn message', body: m.body });
    }
  }
}

export function linkedinWindow(state) {
  const o = ensureOutreach(state);
  const recent = o.linkedin.requests.filter((r) => r.day > state.day - 7).length;
  const decided = o.linkedin.requests.filter((r) => r.status !== 'pending').slice(-40);
  const acc = decided.length >= 20 ? decided.filter((r) => r.status === 'accepted').length / decided.length : null;
  const limit = acc != null && acc < SALES.linkedin.lowAcceptance ? SALES.linkedin.reducedLimit : SALES.linkedin.weeklyLimit;
  return { recent, limit, acceptance: acc, left: Math.max(0, limit - recent) };
}

// ---------------------------------------------------------------------------
// Outreach day
// ---------------------------------------------------------------------------

export function outreachDay(state) {
  if (!state.apps.outreach) return;
  const o = ensureOutreach(state);
  const today = { day: state.day, sent: 0, bounced: 0, inboxed: 0, opens: 0, complaints: 0, replies: 0, positive: 0, ooo: 0, aiSent: 0 };
  const perDomain = {};
  if (!isWeekend(state) && o.sequencer && o.inboxes.length) sendSequences(state, o, today, perDomain);
  aiSdrDay(state, o, today);
  linkedinDay(state, o);
  for (const d of o.domains) {
    const ibs = o.inboxes.filter((i) => i.domainId === d.id);
    const warmup = Math.max(0, ...ibs.map((i) => warmupProgress(i, state.day)));
    const c = perDomain[d.id] ?? { sent: 0, bounced: 0, complaints: 0, positive: 0, overSends: 0 };
    d.reputation = nextReputation(d, { ...c, warmup, warmupOn: ibs.some((i) => i.warmupStartDay != null) });
    if (c.sent) {
      (d.log ??= []).push({ day: state.day, sent: c.sent, bounced: c.bounced, complaints: c.complaints });
      if (d.log.length > 120) d.log.shift();
    }
    if (d.reputation < 30 && !d.warnedLow) {
      d.warnedLow = true;
      notify(state, `${d.name} reputation fell below 30: most email now lands in spam. Pause, fix the list and copy, and let it recover.`, { type: 'bad', app: 'outreach' });
    } else if (d.reputation > 45) d.warnedLow = false;
  }
  if (today.sent || today.aiSent || today.replies) {
    o.daily.push(today);
    if (o.daily.length > 400) o.daily.shift();
  }
}

// ---------------------------------------------------------------------------
// Calls: no-shows & founder no-shows
// ---------------------------------------------------------------------------

export function callsDay(state) {
  if (!state.apps.calls) return;
  const calls = ensureCalls(state);
  for (const m of calls.meetings) {
    if (m.status === 'in_call' && m.day < state.day) {
      // The player joined but never ended the call: score what was said.
      const card = heuristicScorecard(m.transcript ?? []);
      m.scorecard = card; m.cardMock = true; m.status = 'held';
      m.quality = callQuality(card);
      m.qualified = applyCallOutcome(state, m, card, m.quality).qualified;
      const ev0 = calendarEvent(state, m);
      if (ev0) completeEvent(state, ev0.id, 'done', m.qualified ? 'qualified' : 'not qualified');
      continue;
    }
    if (!['scheduled', 'ready'].includes(m.status)) continue;
    const ev = calendarEvent(state, m);
    const ct = contactById(state, m.contactId);
    if (m.status === 'scheduled' && m.day === state.day) {
      if (chance(state, m.noShowP)) {
        m.status = 'no_show';
        if (ev) completeEvent(state, ev.id, 'no_show', 'Prospect did not show');
        addActivity(state, { type: 'meeting', text: `${contactName(ct)} didn't show up`, companyId: m.companyId, contactId: m.contactId, dealId: m.dealId });
        addTask(state, { title: `Reschedule with ${contactName(ct)} (no-show)`, dueDay: state.day + 1, dealId: m.dealId, contactId: m.contactId });
        notify(state, `${contactName(ct)} no-showed your call. Send a short reschedule note in Calls.`, { type: 'warn', app: 'calls' });
      } else m.status = 'ready';
    }
    if ((m.status === 'ready' || m.status === 'scheduled') && ev && ['unattended', 'missed'].includes(ev.status)) {
      m.status = 'missed';
      const deal = ensureCrm(state).deals.find((d) => d.id === m.dealId);
      addActivity(state, { type: 'meeting', text: 'You missed the meeting (founder no-show)', companyId: m.companyId, contactId: m.contactId, dealId: m.dealId });
      if (deal && chance(state, 0.5)) loseDeal(state, deal, 'You missed the meeting');
      else if (deal) moveDeal(state, deal, 'replied', 'meeting missed');
      notify(state, `You never joined your call with ${contactName(ct)}. They waited on Zoom, then left.`, { type: 'bad', app: 'calls' });
    }
  }
}

/** Apply a held call's scorecard to the deal: qualify or not (research meeting→opportunity rates). */
export function applyCallOutcome(state, m, card, quality) {
  const crm = ensureCrm(state);
  const deal = crm.deals.find((d) => d.id === m.dealId);
  const ct = contactById(state, m.contactId);
  const co = companyOf(state, ct);
  const persona = personaFor(state, ct, co);
  if (!deal || !isOpen(deal)) return { qualified: false };
  deal.callQuality = deal.callQuality == null ? quality : Math.max(deal.callQuality, quality);
  deal.hasPain = persona.hasPain;
  moveDeal(state, deal, deal.stage === 'meeting_booked' || deal.stage === 'replied' ? 'meeting_held' : deal.stage);
  let qualified = ['qualified', 'proposal'].includes(deal.stage);
  if (!qualified) {
    const p = qualifyProbability({ quality, hasPain: persona.hasPain, hasProduct: hasProduct(state), source: m.source, productFit: ensureMarket(state).fit.product.score });
    qualified = chance(state, p);
    m.qualifyP = p;
    if (qualified) moveDeal(state, deal, 'qualified', 'pain, budget and a next step confirmed');
    else addActivity(state, { type: 'note', text: card.nextStepSecured ? 'They agreed to "a next step" but the deal does not look qualified yet.' : 'No qualified opportunity from this call.', dealId: deal.id, companyId: deal.companyId });
  }
  if (card.nextStepSecured) {
    deal.nextStep = { text: card.nextStep || 'Follow up', dueDay: addBusinessDays(state, state.day, 3) };
  }
  return { qualified };
}

// ---------------------------------------------------------------------------
// Deals: decisions, blockers, stalls
// ---------------------------------------------------------------------------

export function dealsDay(state) {
  if (!state.apps.crm) return;
  const crm = ensureCrm(state);
  for (const deal of crm.deals) {
    if (!isOpen(deal)) continue;
    if (deal.stage === 'qualified' && state.day - deal.stageDay > 60 && chance(state, 0.03)) { loseDeal(state, deal, 'Went dark after qualification (no proposal)'); continue; }
    if (deal.stage !== 'proposal' || deal.decisionDay == null || state.day < deal.decisionDay) continue;
    const co = crm.companies.find((c) => c.id === deal.companyId);
    // Security review
    if (deal.security?.status === 'requested' || deal.security?.status === 'questionnaire') {
      if (hasSoc2(state)) { deal.security.status = 'passed'; addActivity(state, { type: 'note', text: 'Security review passed (SOC 2 report shared)', dealId: deal.id, companyId: deal.companyId }); }
      else if (deal.security.status === 'questionnaire') {
        const pass = chance(state, deal.amount >= 50000 ? 0.3 : SALES.securityReview.questionnairePass);
        if (!pass) { loseDeal(state, deal, 'Failed security review (questionnaire without SOC 2)'); continue; }
        deal.security.status = 'passed';
      } else if (chance(state, SALES.securityReview.killNoSoc2)) { loseDeal(state, deal, 'Security review: no SOC 2 report'); continue; }
      else { deal.decisionDay = state.day + 30; deal.security.stalls = (deal.security.stalls ?? 0) + 1; addActivity(state, { type: 'note', text: 'Stuck in security review: they want a SOC 2 report or a completed questionnaire', dealId: deal.id, companyId: deal.companyId }); continue; }
    }
    // DPA
    if (deal.dpa?.status === 'requested') {
      if (hasDpa(state)) deal.dpa.status = 'sent';
      else {
        deal.dpa.stalls = (deal.dpa.stalls ?? 0) + 1;
        if (deal.dpa.stalls >= 2) { loseDeal(state, deal, 'Legal blocked it: no DPA'); continue; }
        deal.decisionDay = state.day + SALES.dpaRequest.stallDays;
        addActivity(state, { type: 'note', text: 'Their legal team is waiting for your DPA', dealId: deal.id, companyId: deal.companyId });
        continue;
      }
    }
    // Procurement asks (VPAT, data residency…) still being worked on hold the decision until their due date.
    const wait = askDelay(state, deal.id, state.day);
    if (wait > 0 && !deal.askWaited) { deal.askWaited = true; deal.decisionDay = state.day + wait; continue; }
    const ct = contactById(state, deal.contactId);
    const persona = ct ? personaFor(state, ct, co ?? {}) : null;
    const plan = state.plans.find((p) => p.id === deal.planId) ?? state.plans[0];
    const monthly = (deal.amount ?? 0) / 12 / Math.max(1, deal.quantity ?? 1);
    const budgetRatio = persona && monthly > 0 ? persona.budgetMonthly / ((plan.interval === 'year' ? plan.price / 12 : plan.price)) : 1;
    const p = closeProbability({
      acv: deal.amount ?? 0, quality: deal.callQuality ?? 0.4, productFit: ensureMarket(state).fit.product.score,
      budgetRatio, responsive: ct ? responsiveContact(ct) : false, hasPain: deal.hasPain ?? persona?.hasPain ?? true,
      discountPct: deal.discountPct ?? 0, penalties: (hasProduct(state) ? 1 : 0.2) * askPenalty(state, deal.id),
    });
    deal.closeP = p;
    if (chance(state, p)) closeWon(state, deal);
    else {
      const r = rng(state);
      loseDeal(state, deal, r < 0.5 ? 'No decision / went dark' : r < 0.75 ? 'Chose to stay with current tool' : budgetRatio < 1 ? 'Price above budget' : 'Chose a competitor');
      notify(state, `Closed lost: ${co?.name ?? 'a deal'} (${deal.lostReason}).`, { type: 'info', app: 'crm' });
    }
  }
}
