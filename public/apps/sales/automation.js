// Sales triggers and actions for the Automations app (tool-gap-analysis section 4 exposure table).
// Contract: every event has a stable id, a day and an idempotency key (events.js); every action takes
// (state, args, { dryRun, approved }) and returns { ok, error?, hoursCost, usdCost, result? }. Actions that send
// something to a prospect or customer need `approved: true` (the Automations app's approval flag), otherwise they
// return { ok: false, error: 'needs approval' }. hoursCost is what a human would have spent (the Automations app
// decides whether to charge or claim it); nothing here charges founder hours itself.
import { SALES_EVENT_TYPES, salesEvents } from './events.js';
import { HOURS, SALES } from './params.js';
import { ensureCrm, ensureOutreach, addContact, upsertCompany, ensureDeal, moveDeal, addActivity, addTask, contactById, createMeeting, nextSlot, dealById, setNextStep, companyById } from './model.js';
import { manualMoves } from './deals.js';
import { ensureInbox, approveDraft, CATEGORIES } from './inbox.js';
import { pushNotes, sendRecap } from './notetaker.js';
import { reveal, PROVIDERS } from './prospector.js';
import { uid } from '../../core/util.js';

export const SALES_TRIGGERS = Object.fromEntries(Object.entries(SALES_EVENT_TYPES).map(([id, label]) => [id, { label, app: id.startsWith('call') || id === 'notes_ready' ? 'calls' : ['reply_received', 'bounce_rate_over_threshold', 'domain_reputation_drop', 'sequence_finished', 'market_burned', 'meeting_booked'].includes(id) ? 'outreach' : ['list_verified', 'bounce_over_threshold', 'signal_fired'].includes(id) ? 'prospects' : 'crm' }]));

const res = (ok, extra = {}) => ({ ok, hoursCost: 0, usdCost: 0, ...extra });
const needsApproval = (opts) => !opts?.approved;

export const SALES_ACTIONS = {
  create_contact: {
    label: 'CRM: create contact', app: 'crm', customerFacing: false,
    run(state, { email, name, title = '', company = '', domain = '', source = 'automation' }, opts = {}) {
      if (opts.dryRun) return res(true, { hoursCost: HOURS.addProspect });
      try { const r = addContact(state, { fullName: name, email, title, company, domain }, { source }); return res(true, { hoursCost: HOURS.addProspect, result: { contactId: r.contact.id, companyId: r.company.id } }); } catch (e) { return res(false, { error: e.message }); }
    },
  },
  update_company: {
    label: 'CRM: create or update company', app: 'crm', customerFacing: false,
    run(state, { name = '', domain = '', industry = '', size = '', notes = '' }, opts = {}) {
      if (opts.dryRun) return res(true, { hoursCost: 0.02 });
      const co = upsertCompany(state, { name, domain, industry, size, notes, source: 'automation' });
      return res(true, { hoursCost: 0.02, result: { companyId: co.id } });
    },
  },
  create_deal: {
    label: 'CRM: create deal', app: 'crm', customerFacing: false,
    run(state, { companyId, contactId = null, stage = 'lead' }, opts = {}) {
      if (!companyById(state, companyId)) return res(false, { error: 'company not found' });
      if (opts.dryRun) return res(true, { hoursCost: HOURS.stage });
      const d = ensureDeal(state, { companyId, contactId, source: 'outbound', stage });
      return res(true, { hoursCost: HOURS.stage, result: { dealId: d.id } });
    },
  },
  move_deal: {
    label: 'CRM: move deal stage (only moves a human could make)', app: 'crm', customerFacing: false,
    run(state, { dealId, stage }, opts = {}) {
      const d = dealById(state, dealId);
      if (!d) return res(false, { error: 'deal not found' });
      if (!manualMoves(d).includes(stage)) return res(false, { error: `Buyers move deals to ${stage}; automations cannot.` });
      if (opts.dryRun) return res(true, { hoursCost: HOURS.stage });
      moveDeal(state, d, stage, 'by automation');
      return res(true, { hoursCost: HOURS.stage });
    },
  },
  add_note: {
    label: 'CRM: add note / activity', app: 'crm', customerFacing: false,
    run(state, { companyId, dealId = null, contactId = null, text }, opts = {}) {
      if (opts.dryRun) return res(true, { hoursCost: HOURS.note });
      addActivity(state, { type: 'note', text: String(text ?? '').slice(0, 500), companyId, dealId, contactId });
      return res(true, { hoursCost: HOURS.note });
    },
  },
  create_task: {
    label: 'CRM: create task', app: 'crm', customerFacing: false,
    run(state, { title, dueDay = state.day + 1, dealId = null, contactId = null, companyId = null }, opts = {}) {
      if (opts.dryRun) return res(true, { hoursCost: HOURS.task });
      const t = addTask(state, { title, dueDay, dealId, contactId, companyId });
      return res(true, { hoursCost: HOURS.task, result: { taskId: t.id } });
    },
  },
  add_to_inbound_queue: {
    label: 'CRM: add to inbound queue', app: 'crm', customerFacing: false,
    run(state, { contactId, source = 'automation', note = '' }, opts = {}) {
      const c = contactById(state, contactId);
      if (!c) return res(false, { error: 'contact not found' });
      if (opts.dryRun) return res(true);
      const crm = ensureCrm(state);
      if (!crm.inboundQueue.some((q) => q.contactId === c.id && q.status === 'new')) crm.inboundQueue.push({ id: uid('inb'), contactId: c.id, companyId: c.companyId, email: c.email, source, note, day: state.day, status: 'new' });
      return res(true);
    },
  },
  enroll_in_sequence: {
    label: 'Outreach: enroll contact in sequence', app: 'outreach', customerFacing: true,
    run(state, { contactId, sequenceId }, opts = {}) {
      const o = ensureOutreach(state);
      const c = contactById(state, contactId);
      const seq = o.sequences.find((s) => s.id === sequenceId);
      if (!c || !seq) return res(false, { error: 'contact or sequence not found' });
      if (['unsubscribed', 'bounced', 'customer'].includes(c.status)) return res(false, { error: `contact is ${c.status}` });
      // Same dedupe as a real sequencer (and the Outreach enroll button): active anywhere, or finished inside the cool-down.
      if (o.enrollments.some((e) => e.contactId === c.id && (e.status === 'active' || (e.finishedDay != null && state.day - e.finishedDay < SALES.reenroll.coolDownDays)))) return res(false, { error: 'contact is already in a sequence (or cooling down)' });
      if (needsApproval(opts)) return res(false, { error: 'needs approval' });
      if (opts.dryRun) return res(true, { hoursCost: HOURS.enrollPer });
      const repeat = o.enrollments.some((e) => e.contactId === c.id);
      o.enrollments.push({ id: uid('enr'), sequenceId: seq.id, contactId: c.id, step: 0, nextDay: state.day + 1, status: 'active', sent: [], inboxId: null, enrolledDay: state.day, repeat, by: 'automation' });
      return res(true, { hoursCost: HOURS.enrollPer });
    },
  },
  pause_enrollment: {
    label: 'Outreach: pause / unenroll contact', app: 'outreach', customerFacing: false,
    run(state, { contactId }, opts = {}) {
      if (opts.dryRun) return res(true);
      for (const e of ensureOutreach(state).enrollments) if (e.contactId === contactId && e.status === 'active') e.status = 'stopped';
      return res(true);
    },
  },
  pause_inbox: {
    label: 'Outreach: pause sending inbox', app: 'outreach', customerFacing: false,
    run(state, { inboxId }, opts = {}) {
      const ib = ensureOutreach(state).inboxes.find((x) => x.id === inboxId);
      if (!ib) return res(false, { error: 'inbox not found' });
      if (!opts.dryRun) ib.paused = true;
      return res(true);
    },
  },
  label_reply: {
    label: 'Outreach: label reply', app: 'outreach', customerFacing: false,
    run(state, { replyId, label }, opts = {}) {
      const it = ensureInbox(state).items.find((x) => x.id === replyId);
      if (!it || !CATEGORIES[label]) return res(false, { error: 'reply or label not found' });
      if (!opts.dryRun) it.label = label;
      return res(true, { hoursCost: 0.01 });
    },
  },
  send_approved_reply: {
    label: 'Outreach: send the AI-drafted reply', app: 'outreach', customerFacing: true,
    run(state, { replyId }, opts = {}) {
      const it = ensureInbox(state).items.find((x) => x.id === replyId);
      if (!it || it.status !== 'drafted') return res(false, { error: 'no draft for that reply' });
      if (needsApproval(opts)) return res(false, { error: 'needs approval' });
      if (opts.dryRun) return res(true, { hoursCost: 0.035 });
      approveDraft(state, it);
      return res(true, { hoursCost: 0.035, result: { outcome: it.outcome } });
    },
  },
  book_call: {
    label: 'Calls: book a call (next free slot)', app: 'calls', customerFacing: true,
    run(state, { contactId }, opts = {}) {
      const c = contactById(state, contactId);
      if (!c) return res(false, { error: 'contact not found' });
      if (needsApproval(opts)) return res(false, { error: 'needs approval' });
      const slot = nextSlot(state, { minLead: 1, seed: contactId });
      if (!slot) return res(false, { error: 'no free slot' });
      if (opts.dryRun) return res(true, { hoursCost: HOURS.reschedule });
      const m = createMeeting(state, { contactId, slot, source: 'outbound' });
      return res(true, { hoursCost: HOURS.reschedule, result: { meetingId: m.id } });
    },
  },
  push_notes: {
    label: 'Calls: push AI notes to the CRM (unreviewed)', app: 'calls', customerFacing: false,
    run(state, { meetingId }, opts = {}) {
      const m = state.apps.calls?.meetings?.find((x) => x.id === meetingId);
      if (!m?.notes) return res(false, { error: 'no notes' });
      if (opts.dryRun) return res(true, { hoursCost: 0.03 });
      const r = pushNotes(state, m, dealById(state, m.dealId), { reviewed: false, setNextStep, addActivity });
      return res(true, { hoursCost: 0.03, result: r });
    },
  },
  send_recap: {
    label: 'Calls: send recap email', app: 'calls', customerFacing: true,
    run(state, { meetingId }, opts = {}) {
      const m = state.apps.calls?.meetings?.find((x) => x.id === meetingId);
      if (!m) return res(false, { error: 'meeting not found' });
      if (needsApproval(opts)) return res(false, { error: 'needs approval' });
      if (opts.dryRun) return res(true, { hoursCost: 0.1 });
      return res(true, { hoursCost: 0.1, result: sendRecap(state, m, dealById(state, m.dealId)) });
    },
  },
  enrich_row: {
    label: 'Prospects: enrich (waterfall)', app: 'prospects', customerFacing: false,
    run(state, { rowIds = [] }, opts = {}) {
      if (opts.dryRun) return res(true, { usdCost: 0 });
      try { const r = reveal(state, rowIds, { mode: state.apps.crm?.prospector?.plan === 'clay_launch' ? 'waterfall' : 'db' }); return res(true, { result: r }); } catch (e) { return res(false, { error: e.message }); }
    },
  },
};

/** Trigger events for the Automations app: salesEvents(state, { since, types }). */
export { salesEvents, PROVIDERS };
