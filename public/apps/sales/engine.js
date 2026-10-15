// Daily (synchronous, seeded) simulation for the sales apps: sending, deliverability, reply gating,
// LinkedIn, AI SDR, meetings/no-shows and deal decisions. LLM work is only enqueued here.
import { notify } from '../../core/state.js';
import { fmtDate } from '../../core/util.js';
import { enqueue } from '../../core/jobs.js';
import { rng, chance, poisson, isWeekend, lerp, clamp, hash, dayOfMonth, words } from '../../core/util.js';
import { syntheticPerson, hasProduct, ensureMarket, shippedFeatures } from '../../core/market.js';
import { completeEvent, moveEvent } from '../../core/calendar.js';
import { cancel } from '../../core/stripe.js';
import { post, addRecurring } from '../../core/bank.js';
import { SALES } from './params.js';
import { analyzeCopy, spamminess, renderTemplate, varsFor } from './copy.js';
import { warmupProgress, recommendedCap, effectiveCap, inboxPlacement, bounceProbability, complaintProbability, nextReputation } from './deliverability.js';
import { tierFor, replyProbability, positiveShare, replyKind, isPositive, isSaasIcp, personaFor } from './replies.js';
import { isOpen, closeProbability, qualifyProbability, callQuality, cycleDays, winRate, dealAcv } from './deals.js';
import { heuristicScorecard } from './scorecard.js';
import { askPenalty, askDelay } from '../success/asks.js';
import { worldDealMult } from '../marketworld/engine.js';
import { competitionFor, competitorDealMult } from './competition.js';
import { salesCapacity } from '../people/capacity.js';
import { committeeContacts, committeeEffect, revealFromTranscript, engageMember, methodKnownFromCall, assignIcpSegment, isCertification, getSegment, roleLabel, activeBlockers } from './segments.js';
import { CROSS_SEGMENT } from '../../data/buyer-segments.js';
import { recordTouch, recordNegative, marketReplyMult, marketComplaintMult, decayBurn, recordDomainBurn } from './market-burn.js';
import { trueFit, listReplyMult, prospectorDay, checkListBounces } from './prospector.js';
import { emitSalesEvent } from './events.js';
import { inboxOnReply, inboxDay } from './inbox.js';
import { pipelineDay, staleMult } from './pipeline.js';
import { generateNotes, pushNotes, notesCloseMult, ensureNotetaker, NOTETAKER } from './notetaker.js';
import {
  ensureCrm, ensureOutreach, ensureCalls, contactById, companyOf, contactName, ensureDeal, moveDeal, loseDeal, closeWon, sendContract,
  addActivity, addTask, addBusinessDays, addContact, createMeeting, nextSlot, calendarEvent, hasSoc2, hasDpa, responsiveContact, cancelMeeting, startProposal, ensureCommittee,
} from './model.js';

export { stepKey, stepQuality } from './copy.js';
import { stepKey, stepQuality } from './copy.js';

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
      if (kind === 'unsubscribe' || kind === 'hallucination') { loseDeal(state, deal, 'Opted out'); recordNegative(state, co, 'unsub'); }
      if (kind === 'not_now') addTask(state, { title: `Check back with ${contactName(contact)} (said "not now")`, dueDay: day + 90, dealId: deal.id, contactId: contact.id });
    }
  }
  addActivity(state, { type: 'reply', text: `${channel === 'linkedin' ? 'LinkedIn reply' : 'Email reply'}: ${kind.replace('_', ' ')}`, companyId: co?.id, contactId: contact.id, day });
  enqueue(state, 'sales:coldReply', { contactId: contact.id, kind, source, channel, subject, body, day }, { label: `Reply from ${contactName(contact)}` });
  const item = inboxOnReply(state, { contact, company: co, kind, source, channel, day });
  emitSalesEvent(state, 'reply_received', { contactId: contact.id, companyId: co?.id ?? null, kind, category: item?.label ?? null, channel, source }, `reply:${contact.id}:${day}:${kind}`);
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
    const fit = trueFit(company);
    const mkt = marketReplyMult(state, company) * listReplyMult(state, contact, company);
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
    recordTouch(state, company, contact.id, tier);
    addActivity(state, { type: 'email', text: `Email ${e.step + 1} sent from ${inbox.address}: "${subject}"`, companyId: company?.id, contactId: contact.id });

    // A hard bounce is a property of the address: decided on the first send; later steps only see decay/soft bounces.
    if (chance(state, e.step === 0 ? bounceProbability(contact.truth, { role: contact.role }) : 0.002)) {
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
      if (chance(state, complaintProbability({ tier, spam, hasOptOut: analysis.hasOptOut, overCap, role: contact.role }) * (e.repeat ? SALES.reenroll.complaintMult : 1) * marketComplaintMult(state, company))) {
        dc.complaints++; today.complaints++; seq.stats.complaints++;
        contact.status = 'unsubscribed';
        e.status = 'complained';
        addActivity(state, { type: 'complaint', text: 'Marked your email as spam', companyId: company?.id, contactId: contact.id });
        recordNegative(state, company, 'complaint');
        continue;
      }
      if (e.step === 0 && chance(state, SALES.oooRate)) {
        today.ooo++;
        enqueue(state, 'sales:coldReply', { contactId: contact.id, kind: 'ooo', source: 'sequence', channel: 'email', subject, body, day: state.day }, { label: 'Auto-reply' });
      }
      const p = replyProbability({ tier, stepIndex: e.step, quality, fit, saas, contact, mult: mkt }) * (e.repeat ? SALES.reenroll.replyMult : 1);
      if (chance(state, p)) {
        // The wrong persona (or a departed person's mailbox) mostly answers "wrong person / remove me".
        const wrong = contact.prospect?.wrongPersona || contact.prospect?.wrongPerson;
        const kind = replyKind(positiveShare({ tier, quality, fit }) * (wrong ? 0.4 : 1), rng(state), rng(state));
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
      e.finishedDay = state.day;
      emitSalesEvent(state, 'sequence_finished', { contactId: contact.id, sequenceId: seq.id }, `seqdone:${e.id}`);
      if (contact.status === 'contacted') contact.status = 'no_reply';
    } else e.nextDay = addBusinessDays(state, state.day, Math.max(1, seq.steps[e.step].delayDays ?? 3));
  }
  // Instantly-style auto-pause on high bounces.
  for (const seq of o.sequences) {
    if (seq.status === 'active' && seq.stats.sent >= SALES.bouncePauseMinSends && seq.stats.bounced / seq.stats.sent >= SALES.bouncePause) {
      seq.status = 'paused';
      emitSalesEvent(state, 'bounce_rate_over_threshold', { sequenceId: seq.id, bounceRate: +(seq.stats.bounced / seq.stats.sent).toFixed(3) }, `seqbounce:${seq.id}:${state.day}`);
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
  a.reputation = clamp(a.reputation + (70 - a.reputation) * 0.02 - complaints * 2.5, 0, 100); // reputation suffers via complaints only
  today.aiSent += sends;
  const replies = poisson(state, sends * placement * rate);
  for (let i = 0; i < replies; i++) {
    const person = syntheticPerson(state);
    let contact;
    try {
      const added = addContact(state, { fullName: person.name, email: person.email, company: person.company, title: chance(state, 0.5) ? 'Owner' : 'Operations Manager', notes: 'Sourced by the AI SDR from its vendor database' }, { source: 'ai_sdr', status: 'contacted' });
      contact = added.contact;
      assignIcpSegment(state, added.company, () => rng(state));
    } catch { continue; }
    const kind = chance(state, A.hallucination) ? 'hallucination' : replyKind(A.positiveShare, rng(state), rng(state));
    a.replies++;
    recordReply(state, { contact, kind, source: 'ai_sdr', subject: `Quick question, ${person.company}`, body: '(Written and sent by your AI SDR — you never reviewed this email.)' });
    if (kind === 'hallucination') notify(state, `Your AI SDR told ${person.company} something untrue about them. They complained.`, { type: 'bad', app: 'outreach' });
    if ((kind === 'interested' && chance(state, A.autoBook)) || (kind === 'curious' && chance(state, A.autoBookCurious))) {
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
  if (state.apps.crm?.prospector) { prospectorDay(state); checkListBounces(state); }
  if (!state.apps.outreach) return;
  const o = ensureOutreach(state);
  decayBurn(state);
  const today = { day: state.day, sent: 0, bounced: 0, inboxed: 0, opens: 0, complaints: 0, replies: 0, positive: 0, ooo: 0, aiSent: 0 };
  const perDomain = {};
  if (!isWeekend(state) && o.sequencer && o.inboxes.length) sendSequences(state, o, today, perDomain);
  aiSdrDay(state, o, today);
  linkedinDay(state, o);
  inboxDay(state);
  for (const d of o.domains) {
    const ibs = o.inboxes.filter((i) => i.domainId === d.id);
    const warmup = Math.max(0, ...ibs.map((i) => warmupProgress(i, state.day)));
    const c = perDomain[d.id] ?? { sent: 0, bounced: 0, complaints: 0, positive: 0, overSends: 0 };
    d.reputation = nextReputation(d, { ...c, warmup, warmupOn: ibs.some((i) => i.warmupStartDay != null), day: state.day });
    if (c.sent) {
      (d.log ??= []).push({ day: state.day, sent: c.sent, bounced: c.bounced, complaints: c.complaints });
      if (d.log.length > 120) d.log.shift();
    }
    if (d.reputation < 25) recordDomainBurn(state, d);
    if (d.reputation < 30 && !d.warnedLow) {
      d.warnedLow = true;
      emitSalesEvent(state, 'domain_reputation_drop', { domainId: d.id, reputation: Math.round(d.reputation) }, `domdrop:${d.id}:${state.day}`);
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
      const ctm = contactById(state, m.contactId);
      const card = heuristicScorecard(m.transcript ?? [], { competitors: ctm ? personaFor(state, ctm, companyOf(state, ctm) ?? {}).competitorNames : [] });
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
    // Prospects reschedule (10–20% SMB, 20–35% ent) and occasionally cancel the day before.
    if (m.status === 'scheduled' && m.day - state.day === 2 && !m.prospectMoveRolled) {
      m.prospectMoveRolled = true;
      if (chance(state, SALES.prospectReschedule[state.company.model === 'ent' ? 'ent' : 'smb'])) {
        const slot = nextSlot(state, { minLead: 3 + Math.floor(rng(state) * 4), duration: m.duration, seed: m.contactId });
        if (slot && ev) {
          try { moveEvent(state, ev.id, slot.day, slot.start); Object.assign(m, { day: slot.day, start: slot.start, rescheduled: (m.rescheduled ?? 0) + 1, noShowP: Math.min(0.6, m.noShowP + 0.03) }); notify(state, `${contactName(ct)} asked to move your call to ${fmtDate(state, slot.day)}.`, { type: 'info', app: 'calls' }); } catch { /* keep original slot on conflict */ }
        }
      }
    }
    if (m.status === 'scheduled' && m.day - state.day === 1 && !m.cancelRolled) {
      m.cancelRolled = true;
      if (chance(state, SALES.prospectCancel)) {
        cancelMeeting(state, m, 'canceled by prospect');
        m.status = 'canceled';
        addTask(state, { title: `Rebook with ${contactName(ct)} (they canceled)`, dueDay: state.day + 1, dealId: m.dealId, contactId: m.contactId });
        notify(state, `${contactName(ct)} canceled tomorrow's call ("something came up").`, { type: 'warn', app: 'calls' });
        continue;
      }
    }
    if (m.status === 'scheduled' && m.day === state.day) {
      if (chance(state, m.noShowP)) {
        m.status = 'no_show';
        if (ev) completeEvent(state, ev.id, 'no_show', 'Prospect did not show');
        emitSalesEvent(state, 'call_no_show', { meetingId: m.id, contactId: m.contactId, dealId: m.dealId }, `noshow:${m.id}`);
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

/** Held call bookkeeping: event for Automations, AI notes (notetaker on), auto-share without review. */
function afterCall(state, m, deal, persona, card) {
  emitSalesEvent(state, 'call_held', { meetingId: m.id, contactId: m.contactId, dealId: m.dealId }, `held:${m.id}`);
  const nt = ensureNotetaker(state);
  if (nt.mode === 'off' || m.notes) return;
  const notes = generateNotes(state, m, persona, card);
  if (notes && nt.autoShare && NOTETAKER.plans[nt.plan].push) pushNotes(state, m, deal, { reviewed: false, setNextStep: (st, d, text, due) => { d.nextStep = { text, dueDay: due }; addTask(st, { title: text, dueDay: due, dealId: d.id, contactId: d.contactId, companyId: d.companyId }); }, addActivity });
}

/** Apply a held call's scorecard to the deal: qualify or not (research meeting→opportunity rates). */
export function applyCallOutcome(state, m, card, quality) {
  const crm = ensureCrm(state);
  const deal = crm.deals.find((d) => d.id === m.dealId);
  const ct = contactById(state, m.contactId);
  const co = companyOf(state, ct);
  const persona = personaFor(state, ct, co);
  if (!deal || !isOpen(deal)) return { qualified: false };
  // Buying committee: who was on this call, who the founder's questions surfaced, what the methodology now knows.
  ensureCommittee(state, deal);
  const me = (m.transcript ?? []).filter((t) => t.from === 'me');
  const held = me.length >= 2;
  if (ct?.committee && held) engageMember(ct, quality, () => rng(state));
  const found = held ? revealFromTranscript(state, deal, m.transcript) : [];
  if (found.length) addActivity(state, { type: 'note', text: `Learned who else is involved: ${found.map((c) => `${c.title} (${roleLabel(c.committee.role)})`).join(', ')}`, dealId: deal.id, companyId: deal.companyId });
  m.revealed = found.map((c) => c.id);
  if (deal.method && held) {
    deal.method.known ??= {};
    for (const id of methodKnownFromCall(deal.method, card, m.transcript)) deal.method.known[id] ??= state.day;
  }
  if (m.stakeholder || (ct?.committee && !ct.committee.primary)) {
    deal.callQuality = deal.callQuality == null ? quality : Math.max(deal.callQuality, quality);
    if (card.nextStepSecured) deal.nextStep = { text: card.nextStep || 'Follow up', dueDay: addBusinessDays(state, state.day, 3) };
    deal.lastBuyerDay = state.day;
    afterCall(state, m, deal, persona, card);
    return { qualified: ['qualified', 'proposal', 'contract'].includes(deal.stage), stakeholder: true };
  }
  deal.callQuality = deal.callQuality == null ? quality : Math.max(deal.callQuality, quality);
  deal.hasPain = persona.hasPain;
  moveDeal(state, deal, deal.stage === 'meeting_booked' || deal.stage === 'replied' ? 'meeting_held' : deal.stage);
  let qualified = ['qualified', 'proposal', 'contract'].includes(deal.stage);
  const shippedNow = shippedFeatures(state).length;
  // Qualification is rolled ONCE per deal. A later call can re-open it only if something real changed
  // (you shipped more features since); otherwise follow-ups just improve call quality.
  const canRoll = !qualified && (!deal.qualRoll || shippedNow > deal.qualRoll.shipped);
  if (canRoll) {
    const me = (m.transcript ?? []).filter((t) => t.from === 'me');
    const p = qualifyProbability({
      quality, hasPain: persona.hasPain, hasProduct: hasProduct(state), source: m.source, productFit: ensureMarket(state).fit.product.score,
      founderTurns: me.length, founderWords: me.reduce((a, t) => a + words(t.text), 0), painUncovered: Boolean(card.meddicc?.pain),
    });
    qualified = chance(state, p);
    m.qualifyP = p;
    deal.qualRoll = { day: state.day, shipped: shippedNow, p: +p.toFixed(2) };
    if (qualified) {
      moveDeal(state, deal, 'qualified', 'pain, budget and a next step confirmed');
      if (ct?.committee) Object.assign(ct.committee, { stance: 'support', addressed: true }); // the person who qualified it is on your side
    }
    else addActivity(state, { type: 'note', text: card.nextStepSecured ? 'They agreed to "a next step" but the deal does not look qualified yet.' : 'No qualified opportunity from this call.', dealId: deal.id, companyId: deal.companyId });
  }
  if (card.nextStepSecured) {
    deal.nextStep = { text: card.nextStep || 'Follow up', dueDay: addBusinessDays(state, state.day, 3) };
  }
  afterCall(state, m, deal, persona, card);
  return { qualified };
}

// Pilot end: convert to a contract (pilot → paid, design partner → paid), or it ends there.
function pilotDay(state, deal) {
  const pl = deal.pilot;
  if (state.day < pl.endDay) return;
  const P = SALES.pilot[pl.type];
  const ct = contactById(state, deal.contactId);
  const persona = ct ? personaFor(state, ct, companyOf(state, ct) ?? {}) : null;
  if (pl.subId) { cancel(state, pl.subId, { atPeriodEnd: false, reason: 'pilot_ended' }); }
  let p = P.convert * ((deal.hasPain ?? persona?.hasPain) ? 1 : 0.2) * (hasProduct(state) ? 1 : 0.3) * (0.7 + 0.6 * (ensureMarket(state).fit.product.score ?? 0.4));
  p = Math.min(0.85, p);
  pl.status = chance(state, p) ? 'converted' : 'ended';
  pl.convertP = +p.toFixed(2);
  if (pl.status === 'converted') {
    const plan = state.plans.find((x) => x.active) ?? state.plans[0];
    startProposal(state, deal, { planId: plan.id, quantity: deal.quantity ?? 1, annual: state.company.model === 'ent' });
    deal.pilotConverted = true; // the buyer said yes; procurement steps (paperwork, board, budget) still apply
    deal.decisionDay = Math.max(state.day + 3, deal.proc?.board?.day ?? 0, deal.proc?.earliestDecisionDay ?? 0);
    notify(state, `${companyOf(state, ct)?.name ?? 'Your pilot customer'} wants to buy after the ${P.label.toLowerCase()}. Get them through procurement.`, { type: 'good', app: 'crm' });
  } else loseDeal(state, deal, `${P.label} ended without a contract`);
}

// ---- Buyer-segment decision gates ----

function segmentGate(state, deal, co) {
  const name = co?.name ?? 'The buyer';
  // Paperwork: everything delivered and reviewed; SOC 2 follows Legal.
  for (const it of deal.paperwork ?? []) {
    const strictTeam = ['regulated', 'health', 'public'].includes(getSegment(deal.segmentId)?.group) || deal.segmentId === 'enterprise' || (deal.amount ?? 0) >= 50000;
    if (strictTeam && state.apps.legal?.soc2Report?.opinion === 'qualified') continue; // a qualified opinion does not satisfy strict TPRM
    if (it.status === 'open' && isCertification(it.id) && ((it.id === 'soc2_type1' && ['type1', 'type2', 'type2_in_progress'].includes(state.apps.legal?.soc2)) || (it.id === 'soc2_type2' && state.apps.legal?.soc2 === 'type2'))) { it.status = 'done'; it.doneDay = it.readyDay = state.day; }
  }
  const open = (deal.paperwork ?? []).filter((it) => it.status === 'open' || (it.readyDay ?? 0) > state.day);
  if (open.length) {
    if (deal.paperDeadline == null) {
      deal.paperDeadline = state.day + 30;
      notify(state, `${name} is waiting on: ${open.map((x) => x.label).join(', ')}. Deliver within 30 days or the deal dies.`, { type: 'warn', app: 'crm' });
    }
    if (state.day <= deal.paperDeadline || open.every((it) => it.status !== 'open')) { deal.decisionDay = state.day + 1; return 'wait'; }
    const miss = open.find((it) => it.status === 'open');
    loseDeal(state, deal, `${miss.label} not delivered`);
    return 'lost';
  }
  if (deal.proc.board && state.day < deal.proc.board.day) { deal.decisionDay = deal.proc.board.day; return 'wait'; }
  if (deal.proc.earliestDecisionDay && state.day < deal.proc.earliestDecisionDay) { deal.decisionDay = deal.proc.earliestDecisionDay; return 'wait'; }
  const members = committeeContacts(state, deal);
  // Scenarios that need a role engaged: one stall, then they weigh on the odds.
  for (const sc of deal.scenarios ?? []) {
    const need = sc.effect.needsRole;
    if (!need || sc.stalled) continue;
    const who = members.find((c) => c.committee.role === need);
    if (!who || who.committee.engaged) continue;
    sc.stalled = true;
    const [a, b] = sc.effect.stallDays ?? [14, 30];
    deal.decisionDay = state.day + Math.round(a + (b - a) * rng(state));
    notify(state, `${name}: ${sc.label}. ${sc.howToHandle}`, { type: 'warn', app: 'crm' });
    return 'wait';
  }
  // Opposing blockers: first a stall (book a call to address them), then they can kill the deal.
  for (const c of activeBlockers(members, deal.amount ?? 0)) {
    if (!c.committee.blockStalled) {
      c.committee.blockStalled = true;
      if (c.hidden) { c.hidden = false; c.committee.discovered = true; }
      deal.decisionDay = state.day + 21 + Math.round(24 * rng(state));
      notify(state, `${name}: ${c.title} has concerns (${(c.committee.concerns ?? []).slice(0, 2).join('; ') || 'unclear'}). Book a call with them before the decision.`, { type: 'warn', app: 'crm' });
      return 'wait';
    }
    // Someone who can block and was never won over usually does [design]: 40% + half their influence.
    if (chance(state, 0.4 + 0.5 * c.committee.influence)) { loseDeal(state, deal, `Blocked by ${c.title} (${roleLabel(c.committee.role)})`); return 'lost'; }
  }
  return 'go';
}

function segmentWinMult(state, deal) {
  const eff = committeeEffect(state, deal);
  let m = eff.mult;
  deal.coverage = { mult: +eff.mult.toFixed(2), notes: eff.notes };
  // Small owner-led purchases (< $5k ACV) are decided fast by one person: side scenarios weigh half as much
  // (calibration miss 7: stacked scenario penalties cut a $79/mo deal's odds to a third) [design].
  const w = (deal.amount ?? 0) < 5000 ? 0.5 : 1;
  const soften = (x) => 1 + (x - 1) * w;
  for (const c of eff.blockers) m *= soften(1 - 0.3 * c.committee.influence);
  for (const sc of deal.scenarios ?? []) {
    m *= soften(sc.effect.winMult ?? 1);
    const need = sc.effect.needsRole;
    if (need && !committeeContacts(state, deal).some((c) => c.committee.role === need && c.committee.engaged)) m *= soften(0.6);
  }
  if (deal.proc?.rfp) m *= 0.5; // an open bid against incumbents
  return m;
}

// Champion turnover during long cycles (6–12% per 90 days, CROSS_SEGMENT.championLoss [design]).
function championHazard(state, deal) {
  if (!deal.committee || deal.championLost || !['qualified', 'proposal', 'contract'].includes(deal.stage)) return;
  const [lo, hi] = CROSS_SEGMENT.championLoss.perNinetyDays;
  if (!chance(state, (lo + hi) / 2 / 90)) return;
  const champ = committeeContacts(state, deal).find((c) => c.committee.role === 'champion' && c.committee.stance !== 'left');
  if (!champ) return;
  champ.committee.stance = 'left';
  champ.committee.engaged = false;
  deal.championLost = true;
  const co = state.apps.crm.companies.find((c) => c.id === deal.companyId);
  notify(state, `${contactName(champ)}, your champion at ${co?.name ?? 'a deal'}, left. Find a second champion or the deal will drift.`, { type: 'bad', app: 'crm' });
  addActivity(state, { type: 'note', text: `Champion ${contactName(champ)} left the company`, dealId: deal.id, companyId: deal.companyId });
}

function aeWinMult(state, deal) {
  if (!deal.ownerAeId) return 1;
  const ae = teamCap(state)?.aes.find((a) => a.id === deal.ownerAeId);
  return ae ? ae.winRateMult : 1;
}

// Contract stage: signature after the negotiation window, or Legal's redline outcome.
function contractDay(state, deal) {
  const c = deal.contract;
  if (!c) { closeWon(state, deal); return; }
  if (c.redlineId) {
    const r = state.apps.legal?.redlines?.find((x) => x.id === c.redlineId);
    if (r?.status === 'signed') { closeWon(state, deal); return; }
    if (r?.status === 'lost') { loseDeal(state, deal, 'Walked away over contract terms'); return; }
    if (r) return; // still open in Legal (Legal resolves it at its due date)
  }
  if (state.day >= c.signDay) closeWon(state, deal);
}

// ---------------------------------------------------------------------------
// Deals: decisions, blockers, stalls
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Hired sales team (People app): SDR meetings and AE pipeline driven by each hire's hidden traits.
// Neutral when there is no team. [design] AEs self-source ~40% of their quota; SDR meetings cover the rest.
// ---------------------------------------------------------------------------

const AE_SELF_SOURCE = 0.4;
const TEAM_NO_SHOW = 0.25; // 20–30% no-show baseline

function teamCap(state) {
  try { return salesCapacity(state); } catch { return null; }
}

function teamProspect(state, source) {
  const p = syntheticPerson(state);
  try {
    const r = addContact(state, { fullName: p.name, email: p.email, company: p.company, title: chance(state, 0.5) ? 'Owner' : 'Operations Manager', notes: `Sourced by your ${source === 'sdr' ? 'SDR' : 'AE'}` }, { source, status: 'contacted' });
    assignIcpSegment(state, r.company, () => rng(state)); // drawn from segments that fit your ICP
    return r.contact;
  } catch { return null; }
}

export function teamDay(state) {
  const cap = teamCap(state);
  if (!cap || (!cap.aes.length && !cap.sdrs.length) || isWeekend(state)) return;
  if (!state.apps.crm && !cap.aes.length && !cap.sdrs.length) return;
  const crm = ensureCrm(state);
  const plan = state.plans.find((p) => p.active) ?? state.plans[0];
  const ent = state.company.model === 'ent';
  const acv = dealAcv(plan, { annual: ent });
  const aes = cap.aes.filter((a) => a.ramp > 0);
  let rr = state.day;
  const nextAe = () => (aes.length ? aes[rr++ % aes.length] : null);
  // SDR-booked meetings: an AE runs them; with no AE they land on the founder's calendar.
  for (const sdr of cap.sdrs) {
    const n = poisson(state, sdr.meetingsPerMonth / 21.7);
    for (let i = 0; i < n; i++) {
      const ct = teamProspect(state, 'sdr');
      if (!ct) continue;
      const ae = nextAe();
      const deal = ensureDeal(state, { companyId: ct.companyId, contactId: ct.id, source: 'outbound', stage: 'meeting_booked' });
      deal.sdrId = sdr.id;
      deal.sdrQualified = sdr.qualifiedRatio;
      if (ae) { deal.ownerAeId = ae.id; deal.teamMeetingDay = addBusinessDays(state, state.day, 2 + Math.floor(rng(state) * 5)); }
      else {
        const slot = nextSlot(state, { minLead: 2, seed: ct.id });
        if (slot) createMeeting(state, { contactId: ct.id, slot, source: 'outbound' });
      }
    }
  }
  // AE self-sourced qualified opportunities, sized so expected closes ≈ AE_SELF_SOURCE × quota × attainment.
  for (const ae of aes) {
    const quotaYear = (ae.attainment ?? 0.9) * ae.ramp * (cap.quotaArr / Math.max(0.01, cap.aes.reduce((a, x) => a + (x.attainment ?? 0.9) * x.ramp, 0)));
    const oppsPerDay = (AE_SELF_SOURCE * quotaYear / 365) / Math.max(1, acv * winRate(acv)) * (7 / 5);
    // An AE can work ~10 new self-sourced opportunities a month [design]; low ACV shows up as low attainment.
    const n = poisson(state, Math.min(oppsPerDay, 10 / 21.7));
    for (let i = 0; i < n; i++) {
      const ct = teamProspect(state, 'ae');
      if (!ct) continue;
      const deal = ensureDeal(state, { companyId: ct.companyId, contactId: ct.id, source: 'outbound', stage: 'qualified' });
      deal.ownerAeId = ae.id;
      teamProposal(state, deal, ae);
    }
  }
  // AE-run meetings from SDRs.
  for (const deal of crm.deals) {
    if (!isOpen(deal) || !deal.ownerAeId || deal.teamMeetingDay == null || deal.teamMeetingDay > state.day) continue;
    deal.teamMeetingDay = null;
    const ae = cap.aes.find((a) => a.id === deal.ownerAeId);
    if (chance(state, TEAM_NO_SHOW)) { loseDeal(state, deal, 'No-show on the SDR-booked meeting'); continue; }
    moveDeal(state, deal, 'meeting_held', 'AE ran the discovery call');
    if (!chance(state, deal.sdrQualified ?? SALES.meetingToOpp)) { loseDeal(state, deal, 'Not qualified (SDR meeting)'); continue; }
    moveDeal(state, deal, 'qualified');
    if (ae) teamProposal(state, deal, ae); else deal.ownerAeId = null;
  }
}

function teamProposal(state, deal, ae) {
  const plan = state.plans.find((p) => p.active) ?? state.plans[0];
  deal.callQuality = 0.5; // a competent discovery call; the AE's skill shows in winRateMult
  deal.hasPain ??= true;
  startProposal(state, deal, { planId: plan.id, quantity: 1, annual: state.company.model === 'ent', discountPct: ae.discountDepth ?? 0.12 });
  // A hired AE multi-threads and runs the paperwork themselves (not founder hours); SOC 2 still comes from Legal.
  const members = committeeContacts(state, deal).sort((a, b) => b.committee.influence - a.committee.influence);
  for (const c of members.slice(0, Math.max(2, Math.round(2 + 2 * (ae.winRateMult ?? 1) - 1)))) { c.hidden = false; c.committee.discovered = true; engageMember(c, 0.5, () => rng(state)); }
  if (deal.method) for (const el of deal.method.critical) deal.method.known[el] ??= state.day;
  for (const it of deal.paperwork ?? []) if (it.status === 'open' && !isCertification(it.id)) { it.status = 'done'; it.doneDay = state.day; it.readyDay = state.day + (it.days ?? 0); }
}

export function dealsDay(state) {
  teamDay(state);
  if (!state.apps.crm) return;
  const crm = ensureCrm(state);
  pipelineDay(state);
  for (const deal of crm.deals) {
    if (!isOpen(deal)) continue;
    championHazard(state, deal);
    if (!isOpen(deal)) continue;
    if (deal.stage === 'qualified' && state.day - deal.stageDay > 60 && chance(state, 0.03)) { loseDeal(state, deal, 'Went dark after qualification (no proposal)'); continue; }
    if (deal.stage === 'contract') { contractDay(state, deal); continue; }
    if (deal.pilot?.status === 'active') { pilotDay(state, deal); continue; }
    if (deal.stage !== 'proposal' || deal.decisionDay == null || state.day < deal.decisionDay) continue;
    const co = crm.companies.find((c) => c.id === deal.companyId);
    // Security review
    if (deal.security?.status === 'requested' || deal.security?.status === 'questionnaire') {
      if (hasSoc2(state, { strict: (deal.amount ?? 0) >= 50000 })) { deal.security.status = 'passed'; addActivity(state, { type: 'note', text: 'Security review passed (SOC 2 report shared)', dealId: deal.id, companyId: deal.companyId }); }
      else if (deal.security.status === 'questionnaire') {
        const pass = chance(state, deal.amount >= 50000 ? 0.3 : SALES.securityReview.questionnairePass);
        if (!pass) { loseDeal(state, deal, 'Failed security review (questionnaire without SOC 2)'); continue; }
        deal.security.status = 'passed';
      } else if (!deal.security.rolled) {
        // One roll (≈30% loss), then a slow review: no repeated 50% kills at every check.
        deal.security.rolled = true;
        if (chance(state, SALES.securityReview.killNoSoc2)) { loseDeal(state, deal, 'Security review: no SOC 2 report'); continue; }
        deal.decisionDay = state.day + 30;
        addActivity(state, { type: 'note', text: 'Slow security review without a SOC 2 report: they pushed the decision ~30 days', dealId: deal.id, companyId: deal.companyId });
        continue;
      } else deal.security.status = 'passed';
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
    // Buyer-segment process: paperwork, board / fiscal-year timing, scenarios that need a role, blockers.
    if (deal.proc) {
      const gate = segmentGate(state, deal, co);
      if (gate === 'lost' || gate === 'wait') continue;
    }
    // Procurement asks (VPAT, data residency…) still being worked on hold the decision until their due date.
    const wait = askDelay(state, deal.id, state.day);
    if (wait > 0 && !deal.askWaited) { deal.askWaited = true; deal.decisionDay = state.day + wait; continue; }
    if (deal.pilotConverted) { sendContract(state, deal); continue; }
    const ct = contactById(state, deal.contactId);
    const persona = ct ? personaFor(state, ct, co ?? {}) : null;
    // The buyer's own budget (company size × pain) against what this proposal costs per month.
    const monthly = (deal.amount ?? 0) / 12;
    const budgetRatio = persona && monthly > 0 ? persona.budgetMonthly / monthly : 1;
    // Over budget: the deal first stalls while they look for money (an exec has to approve it).
    if (budgetRatio < 1 && !deal.budgetStalled) {
      deal.budgetStalled = true;
      deal.decisionDay = state.day + 21 + Math.round(30 * (1 - budgetRatio));
      addActivity(state, { type: 'note', text: 'Over their budget: waiting on an exec to approve the spend', dealId: deal.id, companyId: deal.companyId });
      continue;
    }
    const parts = {
      base: deal.segmentId ? getSegment(deal.segmentId)?.winRateQualified ?? null : null, quality: +(deal.callQuality ?? 0.4).toFixed(2), budgetRatio: +budgetRatio.toFixed(2),
      world: +worldDealMult(state).toFixed(2), competitor: +competitorDealMult(ct ? competitionFor(state, { audience: 'prospect', seed: ct.id }) : null).toFixed(2),
      segment: deal.proc ? +segmentWinMult(state, deal).toFixed(2) : 1, asks: +askPenalty(state, deal.id).toFixed(2),
    };
    deal.closeParts = parts; // why this deal closed or not (debrief and calibration)
    const p = closeProbability({
      acv: deal.amount ?? 0, quality: deal.callQuality ?? 0.4, productFit: ensureMarket(state).fit.product.score,
      budgetRatio, responsive: ct ? responsiveContact(ct) : false, hasPain: deal.hasPain ?? persona?.hasPain ?? true,
      // Discounts past the guardrail buy nothing extra and signal desperation (buyers push harder) [design].
      // An early discount (before the buyer named a budget) buys nothing: they anchor on it.
      discountPct: deal.earlyDiscount ? 0 : Math.min(deal.discountPct ?? 0, deal.discountGuard?.max ?? 1), penalties: staleMult(state, deal) * notesCloseMult(deal) * (deal.oversized ? 0.5 : 1) * (deal.discountGuard?.over ? 0.95 : 1) * (hasProduct(state) ? 1 : 0.2) * askPenalty(state, deal.id) * worldDealMult(state) // landscape, market events, battlecards
        * competitorDealMult(ct ? competitionFor(state, { audience: 'prospect', seed: ct.id }) : null) // this buyer's incumbent / status quo
        * aeWinMult(state, deal) // the owning AE's hidden skill (People app)
        * (deal.proc ? segmentWinMult(state, deal) : 1), // committee coverage, methodology, scenarios, RFP
      baseWin: deal.segmentId ? getSegment(deal.segmentId)?.winRateQualified : null,
    });
    deal.closeP = p;
    if (chance(state, p)) sendContract(state, deal);
    else {
      const r = rng(state);
      loseDeal(state, deal, deal.oversized && r < 0.4 ? 'Oversized proposal: more seats than they would roll out' : budgetRatio < 0.7 && r < 0.6 ? 'Price above budget' : r < 0.5 ? 'No decision / went dark' : r < 0.75 ? 'Chose to stay with current tool' : 'Chose a competitor');
      notify(state, `Closed lost: ${co?.name ?? 'a deal'} (${deal.lostReason}).`, { type: 'info', app: 'crm' });
    }
  }
}
