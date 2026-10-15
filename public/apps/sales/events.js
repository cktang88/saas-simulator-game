// Sales event log for the Automations app (docs/review/tool-gap-analysis.md section 4, exposure contract).
// Every event carries a stable `id`, a `day`, an idempotency `key` and the ids needed to fetch the record.
// The log lives in the CRM slice (owned by the Sales apps) and is capped; consumers read with salesEvents(state, since).
import { uid } from '../../core/util.js';

const CAP = 600;

export const SALES_EVENT_TYPES = {
  contact_created: 'CRM: contact created',
  deal_stage_changed: 'CRM: deal stage changed',
  deal_won: 'CRM: deal won',
  deal_lost: 'CRM: deal lost',
  inbound_lead_created: 'CRM: inbound lead created',
  task_due: 'CRM: task due',
  deal_stale: 'CRM: deal stale (no buyer contact 14+ days)',
  reply_received: 'Outreach: reply received (with category)',
  meeting_booked: 'Outreach/Calls: meeting booked',
  bounce_rate_over_threshold: 'Outreach: sequence bounce rate over 5%',
  domain_reputation_drop: 'Outreach: domain reputation below 30',
  sequence_finished: 'Outreach: prospect finished a sequence with no reply',
  call_scheduled: 'Calls: call scheduled',
  call_held: 'Calls: call held',
  call_no_show: 'Calls: prospect no-show',
  notes_ready: 'Calls: AI notes ready for review',
  list_verified: 'Prospects: list verified',
  bounce_over_threshold: 'Prospects: saved list bounce over 5%',
  signal_fired: 'Prospects: signal fired (job change, hiring, funding, news)',
  market_burned: 'Outreach: company or segment over-contacted',
};

function log(state) {
  const crm = (state.apps.crm ??= {});
  return (crm.events ??= []);
}

/** Record a sales event. `key` makes it idempotent (same key → ignored). Returns the event or null. */
export function emitSalesEvent(state, type, data = {}, key = null) {
  if (!state?.apps) return null;
  const events = log(state);
  const k = key ?? `${type}:${data.dealId ?? data.contactId ?? data.meetingId ?? data.companyId ?? data.refId ?? ''}:${data.stage ?? ''}:${state.day}`;
  if (events.some((e) => e.key === k)) return null;
  const ev = { id: uid('sev'), type, day: state.day, key: k, ...data };
  events.push(ev);
  if (events.length > CAP) events.splice(0, events.length - CAP);
  return ev;
}

/** Events since a day (inclusive), optionally of some types. */
export function salesEvents(state, { since = -Infinity, types = null } = {}) {
  return (state.apps?.crm?.events ?? []).filter((e) => e.day >= since && (!types || types.includes(e.type)));
}

// Events added by the SDR review, pre-sell and variant features. Kept apart from SALES_EVENT_TYPES so the
// Automations catalog (apps/automations/model.js) can adopt them deliberately: ids are stable, keys are idempotent.
export const SALES_NEW_EVENT_TYPES = {
  sdr_drafts_ready: 'Outreach: AI SDR drafts waiting for review',
  sdr_queue_backlog: 'Outreach: AI SDR review queue backlog (30+ drafts)',
  offer_commitment_received: 'CRM: pre-sell commitment received (LOI, pre-order or deposit)',
  offer_date_at_risk: 'CRM: pre-sold offer delivery date at risk',
  offer_refunds_issued: 'CRM: pre-sale refunds issued (delivery missed)',
  founder_win_rate_stable: 'CRM: founder-led win rate is stable (safe to consider an AE)',
};
