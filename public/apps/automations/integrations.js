// Automations <-> built-in apps: the adapters behind the family triggers and actions declared in model.js.
// Triggers read ONLY the events the other apps export (salesEvents, productEvents, lifecycleEvents, insightsEvents,
// helpdeskEvents, peopleEvents, legalEvents, spendEvents, forecastEvents, automationEvents, assistantEvents), each
// with a stable id used as the dedupe key. Actions call the exported functions with the contract
// (state, args, { dryRun, approved }) -> { ok, error?, hoursCost, usdCost, result? }; where an app's function has no
// dryRun of its own, the adapter validates without writing. Nothing here uses Date.now() or Math.random().
// The engine decides what a run costs (units, review time, complaints); this file only talks to the apps.
// Modules are imported statically but only called at run time, so import cycles with apps that call the
// Automations hooks (claimAutomated, deflectTickets) are harmless.

import { customerById } from '../../core/stripe.js';
import { ensureMail } from '../../core/mail.js';
import { salesEvents } from '../sales/events.js';
import { SALES_ACTIONS } from '../sales/automation.js';
import { contactById, companyById } from '../sales/model.js';
import { productEvents, PRODUCT_ACTIONS } from '../product/api.js';
import { lifecycleEvents, enrolContact, sendBroadcast } from '../lifecycle/model.js';
import { insightsEvents } from '../insights.js';
import { toggleFlag } from '../insights/lab.js';
import { plgEvents, PLG_ACTIONS } from '../plg/model.js';
import { txnEvents, TXN_ACTIONS } from '../emailops/model.js';
import { audienceEvents, AUDIENCE_ACTIONS } from '../audience/model.js';
import { ensureAccess } from '../plg/access.js';
import { helpdeskEvents, runBatchTest, goLive, reviewAgent, postStatusUpdate, openChannel } from '../helpdesk.js';
import { peopleEvents } from '../people/readers.js';
import { legalEvents } from '../legal/compliance.js';
import { spendEvents, attachReceipt, decideRequest, cancelTrial, issueCard, ensureSpend } from '../money/spend.js';
import { forecastEvents } from '../money/forecast.js';
import { transferTreasury } from '../money/treasury.js';
import { automationEvents } from '../fundraising/process.js';
import { runTaskAction, assistantEvents } from '../assistant/engine.js';
import { snooze, setReminder, toggleVip, queueSendLater } from '../assistant/triage.js';
import { applySaveTactic, tacticsFor } from '../../core/churn.js';
import { requestExitInterview } from '../customers.js';
import { hash } from '../../core/util.js';
import { aiEvents } from '../aicost/index.js'; // AI costs & credits events (separate block)
import { TRIGGERS, DEFAULT_COPY } from './model.js';
import { approveRequest } from '../people/absence.js'; // People ops block
import { orderEquipment, provisionAccounts } from '../people/onboarding.js';
import { ONB } from '../people/ops-data.js';

const safe = (fn) => { try { return fn() ?? []; } catch { return []; } };
const R = (ok, extra = {}) => ({ ok, hoursCost: 0, usdCost: 0, ...extra });
const fail = (error, extra = {}) => R(false, { error, ...extra });

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

function rawEvents(state, family, type, since) {
  switch (family) {
    case 'sales': return salesEvents(state, { since, types: [type] }).map((e) => ({ ...e, ref: e.id }));
    case 'product': return productEvents(state, { since }).filter((e) => e.type === type).map((e) => ({ ...e, ref: e.id }));
    case 'lifecycle': return lifecycleEvents(state, since, [type]).map((e) => ({ ...e, ref: e.id }));
    case 'plg': return type === 'cohort_released' ? (ensureAccess(state).events ?? []).filter((e) => e.type === type && e.day >= since).map((e) => ({ ...e, ref: e.id })) : plgEvents(state, since).filter((e) => e.type === type).map((e) => ({ ...e, ref: e.id }));
    case 'transactional': return txnEvents(state, since).filter((e) => e.type === type).map((e) => ({ ...e, ref: e.id }));
    case 'audience': return audienceEvents(state, since).filter((e) => e.type === type).map((e) => ({ ...e, ref: e.id }));
    case 'insights': return type === 'activation_event' ? insightsEvents(state, since).map((e) => ({ ...e, ref: e.id })) : [];
    case 'helpdesk': return helpdeskEvents(state, since).filter((e) => e.type === type).map((e) => ({ ...e, ref: e.id }));
    case 'people': return peopleEvents(state, type, since);
    case 'aicost': return aiEvents(state, since).filter((e) => e.type === type).map((e) => ({ ...e, ref: e.id })); // AI costs & credits block
    case 'legal': return legalEvents(state, type, since);
    case 'money':
      return type === 'runway_below' ? forecastEvents(state, since).map((e) => ({ ...e, ref: e.id })) : spendEvents(state, since).filter((e) => e.type === type).map((e) => ({ ...e, ref: e.id }));
    case 'fundraising': return automationEvents(state, since).filter((e) => e.trigger === type).map((e) => ({ ...e, ref: type === 'update_due' ? `update_due:${Math.floor(e.day / 28)}` : `${type}:${e.ref}:${e.day}:${hash(e.text ?? e.intent ?? '').slice(0, 6)}` }));
    case 'assistant': return assistantEvents(state, since).filter((e) => e.type === type).map((e) => ({ ...e, ref: e.id }));
    default: return [];
  }
}

const describe = (r) => r.title ?? r.label ?? r.name ?? r.text ?? r.ticketId ?? r.dealId ?? r.contactId ?? r.refId ?? r.testId ?? '';

/** Events for a family trigger since a day, normalised for the engine: { ref (stable id), label, email, name, ...fields }. */
export function collectExternal(state, trigger, since) {
  const T = TRIGGERS[trigger];
  if (!T?.ext) return [];
  return safe(() => rawEvents(state, T.family, T.type, since)).filter((r) => r.ref).map((r) => {
    const { id, type, key, ref, ...rest } = r;
    const ev = { ...rest, ref, raw: r, label: `${T.label.split(': ')[1] ?? T.label}${describe(r) ? `: ${describe(r)}` : ''}`.slice(0, 140), junk: false };
    const contact = r.contactId ? safe(() => contactById(state, r.contactId)) : null;
    const company = (r.companyId ?? contact?.companyId) ? safe(() => companyById(state, r.companyId ?? contact.companyId)) : null;
    const cust = r.customerId ? safe(() => customerById(state, r.customerId)) : null;
    ev.email = ev.email ?? contact?.email ?? cust?.email ?? '';
    ev.name = ev.name ?? contact?.fullName ?? contact?.name ?? cust?.name ?? '';
    ev.company = ev.company ?? company?.name ?? cust?.company ?? '';
    ev.crmCompanyId = r.companyId ?? contact?.companyId ?? cust?.crmCompanyId ?? null;
    ev.customerId = r.customerId ?? null;
    ev.subId = r.subId ?? cust?.subscriptionId ?? null;
    ev.dealId = r.dealId ?? null;
    ev.meetingId = r.meetingId ?? null;
    ev.leadId = r.inboundId ?? null; // CRM inbound-queue id: lets the triage hours hook confirm the saving
    ev.selfMade = r.source === 'automation';
    if (T.family === 'fundraising' && type === 'investor_replied') ev.threadId = (state.apps.fundraising?.investors ?? []).find((i) => i.id === r.ref)?.threadId ?? null;
    return ev;
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const baseArgs = (ev) => ({ ...(ev.raw ?? {}), email: ev.email, name: ev.name, company: ev.company });
const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

const sales = (key, defaults = () => ({})) => (state, args, opts) => SALES_ACTIONS[key].run(state, args, opts);
const prod = (key) => (state, args, opts) => PRODUCT_ACTIONS[key](state, args, opts);

const IMPL = {
  // ---- Sales (SALES_ACTIONS: run(state, args, { dryRun, approved })) ----
  sales_create_contact: { call: sales('create_contact'), args: (ev) => ({ ...baseArgs(ev), source: 'automation' }) },
  sales_update_company: { call: sales('update_company'), args: (ev) => ({ name: ev.company, notes: ev.label }) },
  sales_create_deal: { call: sales('create_deal'), args: (ev) => ({ companyId: ev.crmCompanyId, contactId: ev.raw?.contactId ?? null }) },
  sales_move_deal: { call: sales('move_deal'), args: (ev) => ({ dealId: ev.dealId }) },
  sales_add_note: { call: sales('add_note'), args: (ev) => ({ companyId: ev.crmCompanyId, dealId: ev.dealId, contactId: ev.raw?.contactId ?? null, text: `[Automation] ${ev.label}` }) },
  sales_create_task: { call: sales('create_task'), args: (ev, state) => ({ title: `Follow up: ${ev.label}`.slice(0, 120), dueDay: state.day + 2, dealId: ev.dealId, contactId: ev.raw?.contactId ?? null, companyId: ev.crmCompanyId }) },
  sales_add_to_inbound_queue: { call: sales('add_to_inbound_queue'), args: (ev) => ({ contactId: ev.raw?.contactId, source: 'automation' }) },
  sales_enroll_in_sequence: { call: sales('enroll_in_sequence'), args: (ev) => ({ contactId: ev.raw?.contactId }) },
  sales_pause_enrollment: { call: sales('pause_enrollment'), args: (ev) => ({ contactId: ev.raw?.contactId }) },
  sales_pause_inbox: { call: sales('pause_inbox'), args: () => ({}) },
  sales_label_reply: { call: sales('label_reply'), args: () => ({}) },
  sales_send_approved_reply: { call: sales('send_approved_reply'), args: () => ({}) },
  sales_book_call: { call: sales('book_call'), args: (ev) => ({ contactId: ev.raw?.contactId }) },
  sales_sdr_set_mode: { call: sales('sdr_set_mode'), args: () => ({ mode: 'review' }) },
  sales_tag_deal_variant: { call: sales('tag_deal_variant'), args: (ev) => ({ dealId: ev.dealId ?? ev.raw?.dealId }) },
  sales_ask_commitment: { call: sales('ask_commitment'), args: (ev) => ({ dealId: ev.dealId ?? ev.raw?.dealId, level: 'preorder' }) },
  sales_deliver_offer: { call: sales('deliver_offer'), args: (ev) => ({ offerId: ev.raw?.offerId ?? ev.offerId }) },
  sales_rfp_no_bid: { call: sales('rfp_no_bid'), args: (ev) => ({ bidId: ev.raw?.bidId ?? ev.bidId }) },
  sales_rfp_request_debrief: { call: sales('rfp_request_debrief'), args: (ev) => ({ bidId: ev.raw?.bidId ?? ev.bidId }) },
  sales_push_notes: { call: sales('push_notes'), args: (ev) => ({ meetingId: ev.meetingId }) },
  sales_send_recap: { call: sales('send_recap'), args: (ev) => ({ meetingId: ev.meetingId }) },
  sales_enrich_row: { call: sales('enrich_row'), args: () => ({}) },
  // ---- Product (plain functions (state, args, { dryRun })) ----
  product_create_spec_draft: { call: prod('create_spec_draft'), args: (ev) => ({ title: `Follow-up: ${ev.raw?.title ?? ev.label}`.slice(0, 90), problem: ev.label }) },
  product_queue_feature: { call: prod('queue_feature'), args: (ev) => ({ featureId: ev.raw?.featureId }) },
  product_add_changelog_entry: { call: prod('add_changelog_entry'), args: (ev) => ({ featureId: ev.raw?.featureId, note: ev.raw?.note ?? '' }) },
  // ---- Lifecycle ----
  lifecycle_enrol_contact: { call: (state, a, o) => enrolContact(state, { contactId: a.contactId ?? null, email: a.email || null, flowId: a.flowId, dryRun: o.dryRun }), args: (ev) => ({ contactId: ev.raw?.contactId ?? null, email: ev.email }), benign: /already enrolled|unsubscribed/ },
  lifecycle_send_broadcast: {
    call: (state, a, o) => sendBroadcast(state, { subject: a.subject, body: a.body, segment: a.segment ?? 'all', dryRun: o.dryRun, approved: o.approved }),
    args: (ev) => ({ subject: `What's new: ${ev.raw?.title ?? 'an update'}`, body: DEFAULT_COPY.update.replace('{{feature}}', ev.raw?.title ?? 'a new feature').replace('{{one_line_benefit}}', ev.raw?.note ?? ''), segment: 'all' }),
    copy: (a) => a.body, kind: 'update', broadcast: true,
  },
  // ---- Growth loops, transactional email, owned audience ----
  plg_queue_lever_build: { call: (state, a, o) => PLG_ACTIONS.queue_lever_build(state, a, o), args: () => ({}) },
  plg_prune_pages: { call: (state, a, o) => PLG_ACTIONS.prune_pages(state, a, o), args: () => ({ kind: 'pseo' }) },
  plg_toggle_lever: { call: (state, a, o) => PLG_ACTIONS.toggle_lever(state, { leverId: a.leverId, on: a.on !== 'false' && a.on !== false }, o), args: () => ({}) },
  plg_validate_pql_rule: { call: (state, a, o) => PLG_ACTIONS.validate_pql_rule(state, a, o), args: () => ({}) },
  transactional_run_seed_test: { call: (state, a, o) => TXN_ACTIONS.run_seed_test(state, a, o), args: () => ({}) },
  transactional_publish_template: { call: (state, a, o) => TXN_ACTIONS.publish_template(state, a, o), args: (ev) => ({ templateId: ev.raw?.templateId }) },
  transactional_set_fallback: { call: (state, a, o) => TXN_ACTIONS.set_fallback(state, { on: a.on !== 'false' && a.on !== false }, o), args: () => ({}) },
  audience_send_issue: { call: (state, a, o) => AUDIENCE_ACTIONS.send_issue(state, a, o), args: (ev) => ({ subject: `Update: ${ev.label}`.slice(0, 80), body: DEFAULT_COPY.update.replace('{{feature}}', ev.label).replace('{{one_line_benefit}}', ''), segment: 'engaged' }), copy: (a) => a.body, kind: 'update', broadcast: true },
  audience_run_sunset: { call: (state, a, o) => AUDIENCE_ACTIONS.run_sunset(state, a, o), args: () => ({}) },
  audience_process_unsubscribes: { call: (state, a, o) => AUDIENCE_ACTIONS.process_unsubscribes(state, a, o), args: () => ({}) },
  // ---- Insights ----
  insights_toggle_flag: { call: (state, a, o) => toggleFlag(state, a.key, a.on !== false, { dryRun: o.dryRun }), args: () => ({}) },
  // ---- Helpdesk ----
  helpdesk_run_batch_test: { call: (state, a, o) => { if (o.dryRun) return R(true); const r = runBatchTest(state); return R(true, { result: { passed: r?.passed ?? null } }); }, args: () => ({}) },
  helpdesk_go_live: { call: (state, a, o) => { if (o.needsApproval && !o.approved) return fail('needs approval'); if (o.dryRun) return R(true); goLive(state); return R(true); }, args: () => ({}), gated: true },
  helpdesk_review_agent: { call: (state, a, o) => { const n = num(a.n, 20); if (o.dryRun) return R(true, { hoursCost: 0.25 }); const r = reviewAgent(state, n); return R(true, { hoursCost: Math.round((0.1 + 0.03 * (r?.reviewed ?? 0)) * 100) / 100, result: r }); }, args: () => ({}) },
  helpdesk_post_status_update: {
    call: (state, a, o) => {
      if (!state.apps.insights?.today) return fail('no incident today');
      if (!o.approved) return fail('needs approval');
      if (o.dryRun) return R(true, { hoursCost: 0.25 });
      const q = postStatusUpdate(state, String(a.text ?? '').slice(0, 800));
      return R(true, { hoursCost: 0.25, result: { quality: q } });
    },
    args: (ev) => ({ text: `We are investigating an issue affecting some customers (${ev.label}). Next update in 30 minutes.` }),
    copy: (a) => a.text, kind: 'update',
  },
  helpdesk_open_channel: { call: (state, a, o) => { if (!a.customerId) return fail('no customer on this event'); if (!o.approved) return fail('needs approval'); if (o.dryRun) return R(true); openChannel(state, a.customerId); return R(true); }, args: (ev) => ({ customerId: ev.customerId }) },
  // ---- Money ----
  money_attach_receipt: {
    call: (state, a, o) => {
      if (!ensureSpend(state).receipts?.[a.txnId]) return fail('no receipt request for that transaction');
      if (o.dryRun) return R(true, { hoursCost: 0.05 });
      const r = attachReceipt(state, a.txnId, String(a.memo ?? 'attached by automation'));
      return r.ok ? R(true, { hoursCost: r.hours ?? 0 }) : fail('receipt could not be retrieved (too old)', { hoursCost: r.hours ?? 0 });
    },
    args: (ev) => ({ txnId: ev.raw?.txnId }),
  },
  money_decide_request: {
    call: (state, a, o) => {
      const req = ensureSpend(state).requests.find((r) => r.id === a.requestId);
      if (!req || req.status !== 'pending') return fail('nothing to decide');
      if (o.dryRun) return R(true);
      decideRequest(state, a.requestId, a.approve !== false, { bulk: true }); // an unattended decision is a rubber stamp, counted as such
      return R(true);
    },
    args: (ev) => ({ requestId: ev.raw?.requestId }),
  },
  money_cancel_trial: {
    call: (state, a, o) => {
      const tr = ensureSpend(state).trials.find((x) => x.id === a.trialId);
      if (!tr || !['trial', 'request'].includes(tr.status)) return fail('nothing to cancel');
      if (!o.dryRun) cancelTrial(state, a.trialId);
      return R(true);
    },
    args: (ev) => ({ trialId: ev.raw?.trialId }),
  },
  money_issue_card: {
    call: (state, a, o) => {
      if (!String(a.name ?? '').trim()) return fail('name the card');
      if (!(num(a.limit, 0) > 0)) return fail('set a monthly limit');
      if (o.dryRun) return R(true);
      const c = issueCard(state, { name: String(a.name), limit: num(a.limit, 0), merchant: String(a.merchant ?? ''), category: String(a.category ?? '') });
      return R(true, { result: { cardId: c.id } });
    },
    args: () => ({}),
  },
  money_transfer_treasury: {
    call: (state, a, o) => {
      if (!(num(a.amount, 0) > 0)) return fail('set an amount');
      if (o.dryRun) return R(true);
      return transferTreasury(state, num(a.amount, 0), a.toTreasury !== false) ? R(true) : fail('transfer refused');
    },
    args: () => ({}),
  },
  // ---- Assistant & mail ----
  assistant_run_task: { call: (state, a, o) => runTaskAction(state, a.taskId, { dryRun: o.dryRun }), args: (ev) => ({ taskId: ev.raw?.taskId }) },
  assistant_snooze: { call: (state, a, o) => { if (!ensureMail(state).threads.some((t) => t.id === a.threadId)) return fail('thread not found'); if (!o.dryRun) snooze(state, a.threadId, num(a.days, 2)); return R(true); }, args: (ev) => ({ threadId: ev.threadId }) },
  assistant_set_reminder: { call: (state, a, o) => { if (!ensureMail(state).threads.some((t) => t.id === a.threadId)) return fail('thread not found'); if (!o.dryRun) setReminder(state, a.threadId, num(a.days, 3)); return R(true); }, args: (ev) => ({ threadId: ev.threadId }) },
  assistant_toggle_vip: { call: (state, a, o) => { if (!String(a.who ?? '').trim()) return fail('who?'); if (!o.dryRun) toggleVip(state, String(a.who)); return R(true); }, args: (ev) => ({ who: ev.name }) },
  assistant_queue_send_later: {
    call: (state, a, o) => {
      if (!ensureMail(state).threads.some((t) => t.id === a.threadId)) return fail('thread not found');
      if (!String(a.body ?? '').trim()) return fail('body required');
      if (!o.approved) return fail('needs approval');
      if (!o.dryRun) queueSendLater(state, a.threadId, String(a.body).slice(0, 2000));
      return R(true);
    },
    args: (ev) => ({ threadId: ev.threadId }),
    copy: (a) => a.body, kind: 'reply',
  },
  // ---- People ops block (people/absence.js, people/onboarding.js) ----
  people_approve_pto: {
    call: (state, a, o) => {
      const r = (state.apps.people?.ops?.absences ?? []).find((x) => x.id === a.requestId && x.status === 'pending');
      if (!r) return fail('nothing pending to approve');
      if (o.dryRun) return R(true, { hoursCost: 0.05 });
      approveRequest(state, a.requestId);
      return R(true, { hoursCost: 0.05 });
    },
    args: (ev) => ({ requestId: ev.raw?.requestId }),
  },
  people_provision_new_hire: {
    call: (state, a, o) => {
      const m = (state.apps.people?.members ?? []).find((x) => x.id === a.memberId && x.onboarding);
      if (!m) return fail('no new hire on this event');
      const eq = m.onboarding.items.equipment, ac = m.onboarding.items.accounts;
      if ((!eq || eq.done != null) && ac.done != null) return fail('already provisioned');
      const usd = eq && eq.done == null ? ONB.laptop.standard.cost + (m.region !== 'us' ? ONB.shipAbroad : 0) : 0;
      if (o.dryRun) return R(true, { hoursCost: 0.1, usdCost: usd });
      if (eq && eq.done == null) orderEquipment(state, m.id, 'standard');
      if (ac.done == null) provisionAccounts(state, m.id);
      return R(true, { hoursCost: 0.1, usdCost: usd });
    },
    args: (ev) => ({ memberId: ev.raw?.memberId }),
    benign: /already provisioned/,
  },
  // ---- end People ops block ----
  // ---- Retention (core/churn.js, customers.js) ----
  retention_apply_save_tactic: {
    call: (state, a, o) => {
      const sub = state.stripe?.subscriptions?.find((x) => x.id === a.subId);
      const t = sub ? tacticsFor(state, sub).find((x) => x.id === a.tacticId) : null;
      if (!sub || !t) return fail('that tactic does not fit this account');
      if (!o.approved) return fail('needs approval');
      if (o.dryRun) return R(true, { hoursCost: t.hours, usdCost: t.cash });
      const r = applySaveTactic(state, a.subId, a.tacticId);
      return R(true, { hoursCost: t.hours, usdCost: t.cash, result: r });
    },
    args: (ev) => ({ subId: ev.subId }),
  },
  retention_request_exit_interview: {
    call: (state, a, o) => {
      if (!a.subId) return fail('no subscription on this event');
      if (!o.approved) return fail('needs approval');
      if (o.dryRun) return R(true, { hoursCost: 0.1 });
      const iv = requestExitInterview(state, a.subId);
      return R(true, { hoursCost: 0.1, result: { status: iv.status } });
    },
    args: (ev) => ({ subId: ev.subId }),
    benign: /already asked/,
  },
};

/** Parameters an action will get for an event: app defaults from the event, then the player's own settings. */
export function actionArgs(state, step, ev) {
  const impl = IMPL[step.type];
  if (!impl) return {};
  return { ...(impl.args?.(ev, state) ?? {}), ...(step.params ?? {}) };
}

/** The customer-visible text of a step (graded like email copy), or null when it has none. */
export function actionCopy(state, step, ev) {
  const impl = IMPL[step.type];
  return impl?.copy ? { text: impl.copy(actionArgs(state, step, ev)), kind: impl.kind ?? 'update' } : null;
}

export const isBenign = (type, error) => Boolean(IMPL[type]?.benign?.test(String(error ?? '')));
export const isBroadcast = (type) => Boolean(IMPL[type]?.broadcast);

/**
 * Call a built-in app action. `approved` is the human approval flag (set by the engine only when the step has a
 * review step, or when the player chose to run it unattended). Never throws.
 */
export function callExternal(state, step, ev, { dryRun = false, approved = false } = {}) {
  const impl = IMPL[step.type];
  if (!impl) return fail(`unknown action ${step.type}`);
  try {
    const out = impl.call(state, actionArgs(state, step, ev), { dryRun, approved, needsApproval: Boolean(impl.gated) });
    return { hoursCost: 0, usdCost: 0, ...out, ok: Boolean(out?.ok) };
  } catch (e) {
    return fail(e.message ?? String(e));
  }
}

export const EXTERNAL_ACTION_IDS = Object.keys(IMPL);
