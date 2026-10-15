// Automations (Zapier / Make / n8n): platforms, trigger & action catalog, templates and pure helpers.
// Sources: docs/research/tools/deep/d01-automation-zapier-make-n8n.md (pricing, counting rules, failure modes,
// the 15 founder automations), d04-meeting-notes-call-intel.md (AI note accuracy), d08-lifecycle-email-social.md
// (welcome / trial / dunning sequences), d09-support-ai-cancelflows.md (AI triage), d02-clay-apollo.md (enrichment),
// tools/t8-ops-productivity.md (automation sprawl, silent failures). [design] = game estimate, not a statistic.
//
// Operator tiers (CLAUDE.md principle 7), what the player does and the expected effect over a quarter:
// - stellar: automates only high-frequency, rule-based work the game actually charges hours for (call notes, lead
//   triage, invoice chasing, weekly digest); filters every trigger, dedupes, tests with sample data, turns on
//   failure alerts and fixes breaks within days, keeps humans reviewing customer-facing AI. Net hours saved clearly
//   positive, ~0 customer complaints, bill on the cheapest plan that fits.
// - good: the right flows and alerts, but skips a test or a filter here and there: small leaks (a few duplicate
//   runs, a broken week now and then).
// - average: automates a mix of useful and vanity flows, reacts to errors late. Saves a little, costs a little.
// - mediocre: over-automates (visibility flows that save nothing), never tests (broken filters fire on everything,
//   mapping errors), fires unreviewed AI emails at customers, ignores errors, pays overage for runaway tasks. Net
//   hours negative or ~0, complaints and some cancellations, missed leads and lost CRM notes, higher bills.

import { FREE_MAIL } from '../sales/params.js';

// ---- Platforms (USD/month, monthly billing unless noted) ----
// unit: what the plan meters. count: how a run is counted.
//  - 'task' (Zapier): one successful action step; triggers and filters are free; failed steps are not counted.
//  - 'credit' (Make): every module that runs, trigger included; filters/routers/error handlers free; some AI modules
//    cost more than one credit (we use 3 [design]).
//  - 'execution' (n8n): one per workflow run regardless of steps (even if a filter stops it) [d01: design, verify].
export const PLATFORMS = {
  zapier_free: { vendor: 'Zapier', name: 'Free', price: 0, limit: 100, unit: 'tasks', count: 'task', maxActions: 1, ai: false, overLimit: 'hold', setupMult: 1, note: '100 tasks/mo, two-step Zaps only (1 trigger + 1 action), no AI fields [verified, zapier.com/pricing].' },
  zapier_pro: { vendor: 'Zapier', name: 'Professional · 750 tasks', price: 29.99, limit: 750, unit: 'tasks', count: 'task', maxActions: 20, ai: true, overLimit: 'hold', setupMult: 1, note: '$29.99/mo monthly ($19.99 annual) for 750 tasks; multi-step Zaps, AI by Zapier [verified].' },
  zapier_pro_2k: { vendor: 'Zapier', name: 'Professional · 2,000 tasks', price: 73.5, limit: 2000, unit: 'tasks', count: 'task', maxActions: 20, ai: true, overLimit: 'hold', setupMult: 1, note: '$73.50/mo monthly ($49 annual) for 2,000 tasks [verified]. Covers ~10 multi-step Zaps for a solo founder.' },
  zapier_team: { vendor: 'Zapier', name: 'Team · 2,000 tasks', price: 103.5, limit: 2000, unit: 'tasks', count: 'task', maxActions: 20, ai: true, overLimit: 'hold', setupMult: 1, note: '$103.50/mo monthly for 2,000 tasks, 25 users [verified]. Paying for seats a solo founder does not use.' },
  make_free: { vendor: 'Make', name: 'Free', price: 0, limit: 1000, unit: 'credits', count: 'credit', maxActions: 20, maxActive: 2, ai: true, overLimit: 'stop', setupMult: 1.2, note: '1,000 credits/mo [verified]; 2 active scenarios, 15-minute scheduling [secondary].' },
  make_core: { vendor: 'Make', name: 'Core · 10k credits', price: 10.59, limit: 10000, unit: 'credits', count: 'credit', maxActions: 20, ai: true, overLimit: 'stop', autoBuy: true, setupMult: 1.2, note: '$10.59/mo monthly ($9 annual) for 10,000 credits [secondary]; unlimited scenarios; auto-buy extra credits [verified].' },
  make_pro: { vendor: 'Make', name: 'Pro · 10k credits', price: 18.82, limit: 10000, unit: 'credits', count: 'credit', maxActions: 20, ai: true, overLimit: 'stop', autoBuy: true, setupMult: 1.2, note: '$18.82/mo monthly ($16 annual) [secondary]; adds priority execution and full-text log search.' },
  n8n_starter: { vendor: 'n8n', name: 'Cloud Starter · 2.5k executions', price: 24, limit: 2500, unit: 'executions', count: 'execution', maxActions: 20, ai: true, overLimit: 'stop', setupMult: 1.4, note: '€20/mo billed annually (≈$24) for 2,500 executions [verified, EUR]; each run is one execution however many steps.' },
  n8n_pro: { vendor: 'n8n', name: 'Cloud Pro · 10k executions', price: 59, limit: 10000, unit: 'executions', count: 'execution', maxActions: 20, ai: true, overLimit: 'stop', setupMult: 1.4, note: '€50/mo billed annually (≈$59) for 10,000 executions [verified, EUR].' },
  n8n_self: { vendor: 'n8n', name: 'Self-hosted (Community)', price: 12, priceCategory: 'hosting', limit: Infinity, unit: 'executions', count: 'execution', maxActions: 20, ai: true, overLimit: 'stop', setupMult: 1.6, selfHosted: true, setupHours: 4, note: 'Free license; you pay for a small server (~$12/mo [design]) and run upgrades, backups and restarts yourself. Unlimited executions; a stopped container stops every workflow.' },
};
export const SELF_HOST = { monthlyOutage: 0.08, restartHours: 1, monthlyUpkeepHours: 1 }; // [design] d01 "self-hosting maintenance" failure mode
export const AUTOBUY_PREMIUM = 1.3; // [design] extra credits priced 30% above the plan's per-credit rate (Clay top-ups: +30%, d02)
export const AI_CREDITS = 3; // [design] Make AI modules cost more than one credit [verified that they do; amount design]
export const N8N_AI_USD_PER_RUN = 0.003; // [design] bring-your-own-key LLM cost per AI step on n8n

// ---- Connections (each app you authenticate) ----
export const APPS = {
  stripe: { label: 'Stripe', oauth: false },
  crm: { label: 'CRM (HubSpot/Attio)', oauth: true },
  email: { label: 'Gmail / Loops', oauth: true },
  slack: { label: 'Slack', oauth: true },
  calendar: { label: 'Google Calendar / Calls', oauth: true },
  helpdesk: { label: 'Helpdesk', oauth: true },
  sheets: { label: 'Google Sheets', oauth: true },
  enrich: { label: 'Apollo (enrichment)', oauth: false },
  ai: { label: 'AI model', oauth: false },
  webhook: { label: 'Webhook (your app)', oauth: false },
  schedule: { label: 'Schedule', oauth: false, never: true },
  // First-party apps of this company (no OAuth to expire): triggers and actions exposed by the other apps.
  outreach: { label: 'Outreach (built-in)', oauth: false, never: true },
  calls: { label: 'Calls (built-in)', oauth: false, never: true },
  prospects: { label: 'Prospects (built-in)', oauth: false, never: true },
  product: { label: 'Product (built-in)', oauth: false, never: true },
  lifecycle: { label: 'Lifecycle email (built-in)', oauth: false, never: true },
  plg: { label: 'Growth loops (built-in)', oauth: false, never: true },
  transactional: { label: 'Transactional email (built-in)', oauth: false, never: true },
  audience: { label: 'Owned audience (built-in)', oauth: false, never: true },
  insights: { label: 'Insights (built-in)', oauth: false, never: true },
  people: { label: 'People (built-in)', oauth: false, never: true },
  legal: { label: 'Legal (built-in)', oauth: false, never: true },
  money: { label: 'Money (built-in)', oauth: false, never: true },
  fundraising: { label: 'Fundraising (built-in)', oauth: false, never: true },
  assistant: { label: 'Assistant & mail (built-in)', oauth: false, never: true },
  retention: { label: 'Retention (built-in)', oauth: false, never: true },
};
// Monthly chance that a connection silently needs re-auth (token expiry, password/SSO change, API key rotated). [design; d01 "auth expiry: common"]
export const EXPIRY_PER_MONTH = { oauth: 0.05, key: 0.01 };
export const MAPPING_DRIFT_PER_MONTH = 0.015; // [design] a field renamed in the destination app → "required field missing"
export const BUILD_ERRORS = { filterBroken: 0.2, mappingBroken: 0.15 }; // [design] untested builds: filter matches everything / bad field mapping
export const DUPLICATE_RATE = 0.04; // [design] trigger fires twice (e.g. Stripe New Charge + New Payment, polling replays) d01
export const LOOP_RUNS = 25; // [design] a Zap that writes the record that triggers it runs this many times before something stops it
export const RATE_LIMIT_PER_DAY = 300; // [design] steps per connection per day before 429 Too Many Requests
export const ENRICH = { hit: 0.65, wrong: 0.12, usdPerHit: 0.2 }; // [design hit rate]; wrong ≈ Apollo ~88% US email accuracy [unverified]; ~$0.20/credit overage [unverified] (d02)
export const AI_ERROR = { summarize: 0.07, classify: 0.08, draft: 0.06 }; // d04: 5–10% wrong/unsupported action items [design]; d09: vendor triage ~92% accurate [unverified]
export const REVIEW = { minutes: 2.5, catch: 0.9 }; // [design] skim an AI output before it goes out
export const COMPLAINT = { base: 0.002, perQualityGap: 0.012, wrongAi: 0.5, duplicate: 0.05, overEmail: 0.04, misfire: 0.03, handleHours: 0.15, cancel: 0.15 }; // [design]
export const OVER_EMAIL_PER_WEEK = 3; // [design] automated emails to one customer in 7 days before it reads as spam
export const DEBUG_HOURS = { reconnect: 0.25, repair: 0.5, backfillEach: 0.1, backfillCap: 3, wrongDataCleanup: 0.25, fixFilter: 0.1, replay: 0.1, monitorWeekly: 0.25 }; // [design]
export const DEFLECT = { share: 0.1 }; // [design] welcome/setup emails pre-empt ~10% of tickets × copy quality (new-account how-to questions)
export const DIGEST_HOURS = { manual: 0.5, withDigest: 0.2 }; // Analytics charges 0.5h for the weekly review; reading a digest ≈ 12 min [design]
export const MANUAL_HOURS = { invoiceReminder: 0.1, triageWithEnrichment: 0.05 }; // what the other apps charge (Stripe app: 6 min per reminder; CRM: 6 min triage)

// ---- Triggers ----
// filters: preset conditions (the "Only continue if…" step). pass(ev) → true to continue.
const businessEmail = (ev) => Boolean(ev.email) && !FREE_MAIL.includes(String(ev.email).split('@')[1] ?? '') && !ev.junk;
export const TRIGGERS = {
  stripe_customer: { label: 'Stripe: New customer', app: 'stripe', freq: 'per customer', filters: { business_email: { label: 'Email is a business domain (not Gmail etc.)', pass: businessEmail }, not_junk: { label: 'Skip test / example.com sign-ups', pass: (ev) => !ev.junk } } },
  stripe_subscription: { label: 'Stripe: New paid subscription', app: 'stripe', freq: 'per new paying customer', filters: { amount_positive: { label: 'Amount > 0 (skip $0 / 100%-off coupons)', pass: (ev) => (ev.amount ?? 0) > 0 } } },
  stripe_failed_payment: { label: 'Stripe: Payment failed (invoice.payment_failed)', app: 'stripe', freq: 'per failed attempt (incl. retries)', filters: { first_attempt: { label: 'Only the first failed attempt (attempt_count = 1)', pass: (ev) => ev.attempt === 1 } } },
  invoice_overdue: { label: 'Stripe: Invoice past due (net-30 invoices)', app: 'stripe', freq: 'day 1, 8 and 15 past due', filters: { first_notice: { label: 'Only once per invoice (first notice)', pass: (ev) => ev.notice === 1 }, weekly_notice: { label: 'At most weekly (day 1 and 8)', pass: (ev) => ev.notice <= 2 } } },
  stripe_cancellation: { label: 'Stripe: Subscription canceled', app: 'stripe', freq: 'per cancellation', filters: { voluntary: { label: 'Voluntary cancellations only (not failed payments)', pass: (ev) => ev.reason !== 'payment_failed' && ev.reason !== 'disputed' } } },
  trial_ending: { label: 'Stripe: Trial will end (3 days before)', app: 'stripe', freq: 'per trial', filters: { business_email: { label: 'Business email only', pass: businessEmail }, not_junk: { label: 'Skip test / example.com sign-ups', pass: (ev) => !ev.junk } } },
  form_signup: { label: 'Website: New trial signup (webhook)', app: 'webhook', freq: 'per signup', filters: { not_junk: { label: 'Skip test / example.com / disposable sign-ups', pass: (ev) => !ev.junk }, business_email: { label: 'Business email only (B2B lead routing)', pass: businessEmail } } },
  crm_inbound_lead: { label: 'CRM: New inbound lead', app: 'crm', freq: 'per inbound lead', filters: { business_email: { label: 'Has a business email', pass: businessEmail }, not_automation: { label: 'Not created by this automation (loop guard)', pass: (ev) => !ev.selfMade } } },
  deal_stage: { label: 'CRM: Deal stage changed', app: 'crm', freq: 'per stage change', filters: { meeting_booked: { label: 'New stage is "Meeting booked"', pass: (ev) => ev.stage === 'meeting_booked' }, won: { label: 'New stage is "Closed won"', pass: (ev) => ev.stage === 'won' }, replied: { label: 'New stage is "Replied"', pass: (ev) => ev.stage === 'replied' } } },
  meeting_held: { label: 'Calls / Calendar: Meeting ended', app: 'calendar', freq: 'per meeting', filters: { sales_calls: { label: 'Sales calls only (from Calls)', pass: (ev) => ev.source === 'calls' } } },
  support_ticket: { label: 'Helpdesk: New ticket', app: 'helpdesk', freq: 'per written ticket', filters: { billing_or_urgent: { label: 'Category is Billing or priority is Urgent', pass: (ev) => ev.category === 'billing' || ev.priority === 'urgent' } } },
  weekly_schedule: { label: 'Schedule: Every Monday 8:00', app: 'schedule', freq: 'weekly', filters: {} },
};

// ---- Actions ----
// units: how a successful step counts (Zapier tasks); customer: emails real customers (complaint risk).
export const ACTIONS = {
  crm_add_lead: { label: 'CRM: Create inbound lead', app: 'crm', setup: 0.2 },
  crm_log: { label: 'CRM: Log note / activity', app: 'crm', setup: 0.2 },
  create_task: { label: 'CRM: Create task', app: 'crm', setup: 0.15 },
  email_customer: { label: 'Email the customer (Gmail / Loops)', app: 'email', setup: 0.2, customer: true, needsCopy: true },
  email_founder: { label: 'Email me', app: 'email', setup: 0.1 },
  slack_post: { label: 'Slack: Post message', app: 'slack', setup: 0.1 },
  enrich: { label: 'Enrich person & company (Apollo)', app: 'enrich', setup: 0.3 },
  tag_customer: { label: 'Stripe: Tag customer (metadata)', app: 'stripe', setup: 0.1 },
  ai_step: { label: 'AI: Summarize / draft / classify', app: 'ai', setup: 0.6, ai: true },
  sheet_log: { label: 'Google Sheets: Add row', app: 'sheets', setup: 0.15 },
};
// ---- Built-in app triggers and actions (exposed by the other apps; stable event ids, dryRun and approval contracts) ----
// Metadata only; the adapters that call the other apps live in integrations.js. Trigger ids are `${family}_${type}`.
// Customer-facing actions (customer: true) need a human approval step (review: true, ~2.5 min per run) or they go out
// unreviewed: higher complaint risk, an 'unreviewed_send' incident when a wrong recipient is hit. `human: true`
// actions are work a founder would have to do (save tactics, interviews): the run charges their hours.
export const FAMILIES = { core: 'Stripe, CRM & schedule', sales: 'Sales', product: 'Product', lifecycle: 'Lifecycle email', plg: 'Growth loops', transactional: 'Transactional email', audience: 'Owned audience', insights: 'Insights', helpdesk: 'Helpdesk', people: 'People', legal: 'Legal', money: 'Money', fundraising: 'Fundraising', assistant: 'Assistant & mail', retention: 'Retention' };
const NOT_AUTO = { not_automation: { label: 'Not created by an automation (loop guard)', pass: (ev) => !ev.selfMade } };
const BIZ = { business_email: { label: 'Has a business email', pass: businessEmail } };
const F = (key, label, pass) => ({ [key]: { label, pass } });
const TRIGGER_ROWS = [
  // [family, type, label, app, freq, filters]
  ['sales', 'contact_created', 'CRM: contact created', 'crm', 'per contact', { ...BIZ, ...NOT_AUTO }],
  ['sales', 'deal_stage_changed', 'CRM: deal stage changed', 'crm', 'per stage change', { ...F('meeting_booked', 'New stage is "Meeting booked"', (ev) => ev.stage === 'meeting_booked'), ...F('won', 'New stage is "Closed won"', (ev) => ev.stage === 'won') }],
  ['sales', 'deal_won', 'CRM: deal won', 'crm', 'per won deal', {}],
  ['sales', 'deal_lost', 'CRM: deal lost', 'crm', 'per lost deal', {}],
  ['sales', 'inbound_lead_created', 'CRM: inbound lead created', 'crm', 'per inbound lead', { ...BIZ, ...NOT_AUTO }],
  ['sales', 'task_due', 'CRM: task due', 'crm', 'per task, the day it is due', {}],
  ['sales', 'deal_stale', 'CRM: deal stale (no buyer contact 14+ days)', 'crm', 'once per silence streak', {}],
  ['sales', 'reply_received', 'Outreach: reply received', 'outreach', 'per reply', {}],
  ['sales', 'meeting_booked', 'Outreach/Calls: meeting booked', 'outreach', 'per booked meeting', {}],
  ['sales', 'bounce_rate_over_threshold', 'Outreach: sequence bounce rate over 5%', 'outreach', 'per sequence per day', {}],
  ['sales', 'domain_reputation_drop', 'Outreach: domain reputation below 30', 'outreach', 'per domain per day', {}],
  ['sales', 'sequence_finished', 'Outreach: prospect finished a sequence with no reply', 'outreach', 'per prospect', {}],
  ['sales', 'call_scheduled', 'Calls: call scheduled', 'calls', 'per call', {}],
  ['sales', 'call_held', 'Calls: call held', 'calls', 'per call', {}],
  ['sales', 'call_no_show', 'Calls: prospect no-show', 'calls', 'per no-show', {}],
  ['sales', 'notes_ready', 'Calls: AI notes ready for review', 'calls', 'per call', {}],
  ['sales', 'list_verified', 'Prospects: list verified', 'prospects', 'per list', {}],
  ['sales', 'bounce_over_threshold', 'Prospects: saved list bounce over 5%', 'prospects', 'per list', {}],
  ['sales', 'signal_fired', 'Prospects: signal fired (job change, hiring, funding)', 'prospects', 'per signal', {}],
  ['sales', 'market_burned', 'Outreach: company or segment over-contacted', 'outreach', 'per company per day', {}],
  ['sales', 'sdr_drafts_ready', 'Outreach: AI SDR drafts waiting for review', 'outreach', 'once a day with new drafts', {}],
  ['sales', 'sdr_queue_backlog', 'Outreach: AI SDR review queue backlog (30+ drafts)', 'outreach', 'once a day while backed up', {}],
  ['sales', 'offer_commitment_received', 'CRM: pre-sell commitment received (LOI, pre-order or deposit)', 'crm', 'per commitment', {}],
  ['sales', 'offer_date_at_risk', 'CRM: pre-sold offer delivery date at risk', 'crm', 'per offer and date', {}],
  ['sales', 'offer_refunds_issued', 'CRM: pre-sale refunds issued (delivery missed)', 'crm', 'per offer', {}],
  ['sales', 'founder_win_rate_stable', 'CRM: founder-led win rate is stable', 'crm', 'once', {}],
  ['sales', 'rfp_issued', 'Bids: an RFP was issued', 'crm', 'per RFP', {}],
  ['sales', 'rfp_question_deadline', 'Bids: RFP question deadline in 3 days', 'crm', 'per RFP', {}],
  ['sales', 'rfp_due_soon', 'Bids: RFP response due in 3 days', 'crm', 'per RFP and due date', {}],
  ['sales', 'rfp_addendum_issued', 'Bids: RFP addendum issued', 'crm', 'per addendum', {}],
  ['sales', 'rfp_shortlisted', 'Bids: shortlisted for demo / orals', 'crm', 'per RFP', {}],
  ['sales', 'rfp_awarded', 'Bids: notice of intent to award to you', 'crm', 'per RFP', {}],
  ['sales', 'rfp_lost', 'Bids: RFP lost or disqualified (debrief window open)', 'crm', 'per RFP', {}],
  ['product', 'spec_graded', 'Product: spec graded', 'product', 'per grading', { ...F('passed', 'Spec passed review', (ev) => ev.pass === true) }],
  ['product', 'feature_shipped', 'Product: feature shipped', 'product', 'per feature', {}],
  ['product', 'bug_found', 'Product: bug found', 'product', 'per bug', { ...F('high_severity', 'High severity only', (ev) => ev.severity === 'high') }],
  ['product', 'release_failed', 'Product: release error visible to users', 'product', 'per error', { ...F('high_severity', 'High severity only', (ev) => ev.severity === 'high') }],
  ['product', 'metric_check_ready', 'Product: post-launch metric check ready', 'product', 'per feature', {}],
  ['lifecycle', 'contact_entered_flow', 'Lifecycle: contact entered a flow', 'lifecycle', 'per enrolment', {}],
  ['lifecycle', 'goal_reached', 'Lifecycle: contact reached the flow goal', 'lifecycle', 'per goal', {}],
  ['lifecycle', 'unsubscribed', 'Lifecycle: contact unsubscribed', 'lifecycle', 'per unsubscribe', {}],
  ['lifecycle', 'complaint', 'Lifecycle: spam complaint', 'lifecycle', 'per complaint', {}],
  ['plg', 'lever_live', 'Growth loops: a lever went live', 'plg', 'per lever', {}],
  ['plg', 'pql_created', 'Growth loops: product-qualified lead handed to the CRM', 'plg', 'per PQL', {}],
  ['plg', 'seo_penalty', 'Growth loops: Google demoted thin programmatic pages', 'plg', 'per update', {}],
  ['transactional', 'deliverability_alert', 'Transactional email: inbox delivery below 70%', 'transactional', 'per day', {}],
  ['transactional', 'provider_incident', 'Transactional email: provider incident', 'transactional', 'per incident', {}],
  ['transactional', 'template_published', 'Transactional email: a template went live', 'transactional', 'per template', {}],
  ['audience', 'issue_sent', 'Owned audience: newsletter issue sent', 'audience', 'per issue', {}],
  ['plg', 'cohort_released', 'Growth loops: waitlist cohort released', 'plg', 'per cohort', {}],
  ['insights', 'activation_event', 'Insights: activation events (daily count)', 'insights', 'daily', {}],
  ['helpdesk', 'ticket_created', 'Helpdesk: ticket created', 'helpdesk', 'per ticket', { ...F('billing_or_urgent', 'Category is Billing or priority is Urgent', (ev) => ev.category === 'billing' || ev.priority === 'urgent') }],
  ['helpdesk', 'sla_at_risk', 'Helpdesk: ticket SLA at risk (75% of the limit used)', 'helpdesk', 'once per ticket', { ...F('urgent_or_high', 'Urgent or high priority only', (ev) => ev.priority === 'urgent' || ev.priority === 'high') }],
  ['helpdesk', 'ai_handoff', 'Helpdesk: AI agent handed conversations to you', 'helpdesk', 'daily', {}],
  ['helpdesk', 'review_posted', 'Helpdesk: public review posted', 'helpdesk', 'per review', { ...F('low_rating', 'Rating 3 or below', (ev) => (ev.rating ?? 5) <= 3) }],
  ['helpdesk', 'case_created', 'Helpdesk: ticket-type case opened (refund, dispute, transfer, data request...)', 'helpdesk', 'per case', { ...F('p1_only', 'P1 only', (ev) => ev.priority === 'p1'), ...F('vip_only', 'VIP accounts only', (ev) => ev.vip === true), ...F('privacy_or_security', 'Privacy or security cases', (ev) => ev.family === 'privacy' || ev.family === 'security') }],
  ['helpdesk', 'dsr_clock', 'Helpdesk: data-subject request clock started (GDPR 30 days / CCPA 45 days)', 'helpdesk', 'per request', {}],
  ['helpdesk', 'dsr_due_soon', 'Helpdesk: data-subject request due within 7 days', 'helpdesk', 'once per request', {}],
  ['helpdesk', 'dispute_due', 'Helpdesk: card dispute response due within 3 days', 'helpdesk', 'once per dispute', {}],
  ['helpdesk', 'dispute_ratio', 'Helpdesk: dispute ratio over a watch or network line', 'helpdesk', 'per level per month', {}],
  ['helpdesk', 'security_report', 'Helpdesk: security report from a researcher', 'helpdesk', 'per report', {}],
  ['helpdesk', 'public_complaint', 'Helpdesk: public complaint (X / Reddit / review)', 'helpdesk', 'per complaint', {}],
  ['helpdesk', 'issue_fixed', 'Helpdesk: a bug a customer reported was fixed (tell them)', 'helpdesk', 'per linked ticket', {}],
  ['helpdesk', 'vip_case', 'Helpdesk: a VIP account opened a case', 'helpdesk', 'per case', {}],
  ['people', 'candidate_applied', 'People: candidate applied', 'people', 'per applicant', {}],
  ['people', 'offer_accepted', 'People: offer accepted', 'people', 'per hire', {}],
  ['people', 'member_left', 'People: team member left', 'people', 'per departure', {}],
  ['people', 'background_check_ready', 'People: background check ready', 'people', 'per candidate', {}],
  ['people', 'performance_concern', 'People: performance concern raised', 'people', 'per concern', {}],
  ['people', 'payroll_due', 'People: payroll ran', 'people', 'per payroll run', {}],
  ['legal', 'soc2_test_failing', 'Legal: SOC 2 test failing', 'legal', 'per failing test', {}],
  ['legal', 'soc2_milestone', 'Legal: SOC 2 milestone (audit started / report)', 'legal', 'per milestone', {}],
  ['legal', 'questionnaire_received', 'Legal: security questionnaire received', 'legal', 'per questionnaire', {}],
  ['legal', 'redline_arrived', 'Legal: customer redlines arrived', 'legal', 'per contract', {}],
  ['legal', 'dsr_received', 'Legal: GDPR data-subject request received', 'legal', 'per request', {}],
  ['money', 'receipt_missing', 'Money: card charge still has no receipt', 'money', 'per charge', { ...F('over_100', 'Charges of $100 or more', (ev) => (ev.amount ?? 0) >= 100) }],
  ['money', 'card_locked', 'Money: card locked (missing receipts)', 'money', 'per lock', {}],
  ['money', 'spend_request', 'Money: spend request waiting for approval', 'money', 'per request', {}],
  ['money', 'trial_converting', 'Money: software trial converts to paid in 3 days', 'money', 'per trial', {}],
  ['money', 'runway_below', 'Money: runway fell below your trigger', 'money', 'per fired trigger', {}],
  ['fundraising', 'investor_replied', 'Fundraising: investor replied', 'fundraising', 'per reply', {}],
  ['fundraising', 'stage_changed', 'Fundraising: investor stage changed', 'fundraising', 'per change', {}],
  ['fundraising', 'update_due', 'Fundraising: investor update overdue (28+ days)', 'fundraising', 'monthly', {}],
  ['assistant', 'run_finished', 'Assistant: task run finished', 'assistant', 'per run', {}],
  ['assistant', 'run_failed', 'Assistant: task run failed', 'assistant', 'per run', {}],
];
for (const [family, type, label, app, freq, filters] of TRIGGER_ROWS) TRIGGERS[`${family}_${type}`] = { label, app, family, type, freq, filters, ext: true };

const ACTION_ROWS = [
  // [id, label, app, setupHours, { customer, human, loops, saves }]
  ['sales_create_contact', 'CRM: create contact', 'crm', 0.2, { loops: ['sales_contact_created'] }],
  ['sales_update_company', 'CRM: create or update company', 'crm', 0.15],
  ['sales_create_deal', 'CRM: create deal', 'crm', 0.2, { loops: ['sales_deal_stage_changed'] }],
  ['sales_move_deal', 'CRM: move deal stage (human-type moves only)', 'crm', 0.2, { loops: ['sales_deal_stage_changed'] }],
  ['sales_add_note', 'CRM: add note / activity', 'crm', 0.15],
  ['sales_create_task', 'CRM: create task', 'crm', 0.15],
  ['sales_add_to_inbound_queue', 'CRM: add contact to inbound queue', 'crm', 0.15, { loops: ['crm_inbound_lead', 'sales_inbound_lead_created'] }],
  ['sales_enroll_in_sequence', 'Outreach: enroll contact in sequence', 'outreach', 0.3, { customer: true }],
  ['sales_pause_enrollment', 'Outreach: pause / unenroll contact', 'outreach', 0.1],
  ['sales_pause_inbox', 'Outreach: pause sending inbox', 'outreach', 0.1],
  ['sales_label_reply', 'Outreach: label reply', 'outreach', 0.1],
  ['sales_send_approved_reply', 'Outreach: send the AI-drafted reply', 'outreach', 0.2, { customer: true }],
  ['sales_book_call', 'Calls: book a call (next free slot)', 'calls', 0.2, { customer: true }],
  ['sales_push_notes', 'Calls: push AI notes to the CRM (unreviewed)', 'calls', 0.15],
  ['sales_send_recap', 'Calls: send recap email', 'calls', 0.2, { customer: true }],
  ['sales_enrich_row', 'Prospects: enrich (waterfall)', 'prospects', 0.2],
  ['sales_sdr_set_mode', 'Outreach: set AI SDR mode (autopilot removes the human check)', 'outreach', 0.1, { customer: true }],
  ['sales_tag_deal_variant', 'CRM: tag a deal with message / demo / buyer-role variant', 'crm', 0.1],
  ['sales_ask_commitment', 'CRM: ask a prospect for an LOI, deposit or pre-order', 'crm', 0.25, { customer: true, human: true }],
  ['sales_deliver_offer', 'CRM: deliver a pre-sold offer (starts subscriptions, refunds the rest)', 'crm', 0.25, { customer: true, human: true }],
  ['sales_rfp_no_bid', 'Bids: send a no-bid notice on an RFP', 'crm', 0.2, { customer: true, human: true }],
  ['sales_rfp_request_debrief', 'Bids: request the debrief on a lost RFP (must be within 3 days)', 'crm', 0.2, { customer: true, human: true }],
  ['product_create_spec_draft', 'Product: open a spec draft', 'product', 0.15],
  ['product_queue_feature', 'Product: queue a feature that passed review', 'product', 0.15],
  ['product_add_changelog_entry', 'Product: add changelog entry', 'product', 0.15],
  ['lifecycle_enrol_contact', 'Lifecycle: enrol contact in a live flow', 'lifecycle', 0.25, { customer: true }],
  ['lifecycle_send_broadcast', 'Lifecycle: send a broadcast (customer-facing)', 'lifecycle', 0.3, { customer: true }],
  ['plg_queue_lever_build', 'Growth loops: queue a lever build in Product', 'plg', 0.15],
  ['plg_prune_pages', 'Growth loops: prune the weakest programmatic pages', 'plg', 0.2],
  ['plg_toggle_lever', 'Growth loops: switch a lever off or on (flag kill switch)', 'plg', 0.15],
  ['plg_validate_pql_rule', 'Growth loops: check the PQL rule against closed deals', 'plg', 0.15, { human: true }],
  ['transactional_run_seed_test', 'Transactional email: run a seed test', 'transactional', 0.15, { human: true }],
  ['transactional_publish_template', 'Transactional email: publish a drafted template (customer-facing)', 'transactional', 0.2, { customer: true }],
  ['transactional_set_fallback', 'Transactional email: turn the fallback provider on or off', 'transactional', 0.15],
  ['audience_send_issue', 'Owned audience: send a newsletter issue (customer-facing)', 'audience', 0.3, { customer: true }],
  ['audience_run_sunset', 'Owned audience: re-engage and suppress silent subscribers (customer-facing)', 'audience', 0.2, { customer: true, human: true }],
  ['audience_process_unsubscribes', 'Owned audience: process opt-outs', 'audience', 0.1],
  ['insights_toggle_flag', 'Insights: toggle a feature flag (kill switch)', 'insights', 0.15],
  ['helpdesk_run_batch_test', 'Helpdesk: run the AI agent batch test', 'helpdesk', 0.15],
  ['helpdesk_go_live', 'Helpdesk: set the AI support agent live', 'helpdesk', 0.2, { customer: true }],
  ['helpdesk_review_agent', 'Helpdesk: review the AI agent\'s conversations', 'helpdesk', 0.15, { human: true }],
  ['helpdesk_post_status_update', 'Helpdesk: post an incident status update', 'helpdesk', 0.2, { customer: true }],
  ['helpdesk_open_channel', 'Helpdesk: open a shared channel with a customer', 'helpdesk', 0.2, { customer: true }],
  ['money_attach_receipt', 'Money: attach receipt to a card charge', 'money', 0.2, { saves: true }],
  ['money_decide_request', 'Money: approve / decline a spend request', 'money', 0.2],
  ['money_cancel_trial', 'Money: cancel a software trial before it bills', 'money', 0.15],
  ['money_issue_card', 'Money: issue a virtual card', 'money', 0.2],
  ['money_transfer_treasury', 'Money: move cash to / from Treasury', 'money', 0.2],
  ['assistant_run_task', 'Assistant: run a recurring task', 'assistant', 0.15],
  ['assistant_snooze', 'Mail: snooze a thread', 'assistant', 0.1],
  ['assistant_set_reminder', 'Mail: set a follow-up reminder on a thread', 'assistant', 0.1],
  ['assistant_toggle_vip', 'Mail: toggle VIP for a sender', 'assistant', 0.1],
  ['assistant_queue_send_later', 'Mail: queue a message to send tomorrow', 'assistant', 0.15, { customer: true }],
  ['retention_apply_save_tactic', 'Retention: apply a save tactic (offer to the customer)', 'retention', 0.25, { customer: true, human: true }],
  ['retention_request_exit_interview', 'Retention: ask a cancelled customer for an exit interview', 'retention', 0.15, { customer: true }],
];
for (const [id, label, app, setup, o = {}] of ACTION_ROWS) ACTIONS[id] = { label, app, setup, ext: true, family: id.split('_')[0], ...o };

// Settings the player fills in for built-in app actions (defaults come from the event; these override them).
export const ACTION_PARAMS = {
  sales_enroll_in_sequence: [['sequenceId', 'Sequence id']],
  sales_label_reply: [['replyId', 'Reply id'], ['label', 'Label']],
  sales_send_approved_reply: [['replyId', 'Reply id']],
  sales_sdr_set_mode: [['mode', 'autopilot or review']],
  sales_tag_deal_variant: [['message', 'Message variant'], ['demo', 'Demo variant'], ['role', 'Buyer role']],
  sales_ask_commitment: [['offerId', 'Offer id'], ['level', 'loi, deposit or preorder']],
  sales_pause_inbox: [['inboxId', 'Inbox id']],
  sales_create_deal: [['stage', 'Stage (default lead)']],
  sales_move_deal: [['stage', 'New stage']],
  lifecycle_enrol_contact: [['flowId', 'Live flow id']],
  lifecycle_send_broadcast: [['subject', 'Subject'], ['segment', 'Segment (default all)'], ['body', 'Body', true]],
  insights_toggle_flag: [['key', 'Flag key'], ['on', 'On? (true / false)']],
  plg_queue_lever_build: [['leverId', 'Lever id (limits, pql, invites, ...)']],
  plg_prune_pages: [['kind', 'pseo or templates']],
  plg_toggle_lever: [['leverId', 'Lever id'], ['on', 'On? (true / false)']],
  transactional_publish_template: [['templateId', 'Template id (receipt, trial_ending, ...)']],
  transactional_set_fallback: [['on', 'On? (true / false)']],
  audience_send_issue: [['subject', 'Subject'], ['segment', 'Segment (engaged or all)'], ['body', 'Body', true]],
  helpdesk_review_agent: [['n', 'Conversations to review (default 20)']],
  helpdesk_post_status_update: [['text', 'Status text', true]],
  money_decide_request: [['approve', 'Approve? (true / false, default true)']],
  money_issue_card: [['name', 'Card name'], ['limit', 'Monthly limit'], ['merchant', 'Merchant lock']],
  money_transfer_treasury: [['amount', 'Amount'], ['toTreasury', 'To Treasury? (true / false)']],
  assistant_snooze: [['days', 'Days']],
  assistant_set_reminder: [['days', 'Days']],
  assistant_queue_send_later: [['threadId', 'Thread id'], ['body', 'Message', true]],
  retention_apply_save_tactic: [['tacticId', 'Tactic id (e.g. discount_offer)']],
  product_create_spec_draft: [['title', 'Spec title']],
};

export const AI_MODES = { summarize: 'Summarize', classify: 'Classify / route', draft: 'Draft text (used by the next email step)' };
export const EMAIL_KINDS = { onboarding: 'Welcome / onboarding', dunning: 'Payment failed / invoice reminder', trial: 'Trial ending', survey: 'Exit survey / win-back', reply: 'Reply to the customer', update: 'Product update' };

// ---- Capabilities: which manual work in other apps an automation actually replaces (the hours hook) ----
export const CAPABILITIES = {
  crm_log_meeting: { label: 'Post-call CRM notes (Calls)', app: 'calls' },
  crm_inbound_triage: { label: 'Inbound lead triage (CRM)', app: 'crm' },
  failed_payment_notice: { label: 'Failed-payment & invoice reminders (Payments)', app: 'stripe' },
  onboarding_emails: { label: 'Onboarding emails → fewer how-to tickets (Helpdesk)', app: 'helpdesk' },
  metrics_digest: { label: 'Weekly metrics review (Analytics)', app: 'analytics' },
  support_triage: { label: 'Ticket triage', app: 'helpdesk' },
  external_actions: { label: 'Built-in app actions (receipts etc.)', app: 'money' },
};
const has = (a, type, pred = () => true) => a.actions.some((x) => x.type === type && pred(x));
export function capabilitiesOf(a) {
  const caps = [];
  if (a.trigger === 'meeting_held' && has(a, 'crm_log')) caps.push('crm_log_meeting');
  if (['crm_inbound_lead', 'sales_inbound_lead_created'].includes(a.trigger) && (has(a, 'enrich') || has(a, 'ai_step', (x) => x.mode === 'classify')) && (has(a, 'crm_log') || has(a, 'sales_add_note') || has(a, 'slack_post') || has(a, 'create_task'))) caps.push('crm_inbound_triage');
  if (['stripe_failed_payment', 'invoice_overdue'].includes(a.trigger) && has(a, 'email_customer')) caps.push('failed_payment_notice');
  if (['form_signup', 'stripe_customer', 'stripe_subscription'].includes(a.trigger) && has(a, 'email_customer', (x) => (x.kind ?? 'onboarding') === 'onboarding')) caps.push('onboarding_emails');
  if (a.trigger === 'weekly_schedule' && (has(a, 'slack_post') || has(a, 'sheet_log') || has(a, 'email_founder'))) caps.push('metrics_digest');
  if (a.trigger === 'support_ticket' && has(a, 'ai_step', (x) => x.mode === 'classify')) caps.push('support_triage');
  return caps;
}

// What a template saves in this game (shown in the gallery; honest about vanity flows).
export const SAVES = {
  crm_log_meeting: 'Calls stops charging for post-call notes (you only skim the AI summary if review is on).',
  crm_inbound_triage: 'Accepting an enriched, routed inbound lead takes 3 min instead of 6.',
  failed_payment_notice: 'Overdue-invoice reminders go out without the 6-minute manual click in Payments; card-failure notices are visibility only (Stripe already sends dunning emails).',
  onboarding_emails: 'Good welcome emails pre-empt some how-to tickets (Helpdesk minutes).',
  metrics_digest: 'The weekly metrics review in Analytics takes ~12 min instead of 30 when a digest arrived.',
  support_triage: 'Visibility only: routes tickets, does not answer them.',
};

// ---- Templates (from d01 Part 4, d04, d08, d09) ----
const S = (type, extra = {}) => ({ type, ...extra });
export const TEMPLATES = [
  { id: 'stripe_crm_slack', name: 'New paying customer → CRM → Slack #revenue', source: 'd01 #1', trigger: 'stripe_subscription', filter: 'amount_positive', actions: [S('crm_log'), S('slack_post')], why: 'Classic first Zap. Pure visibility: nothing in the game charges you for this today.' },
  { id: 'churn_survey', name: 'Cancellation → CRM churn note → Slack → exit survey', source: 'd01 #2, d08 §6.5', trigger: 'stripe_cancellation', filter: 'voluntary', actions: [S('crm_log'), S('slack_post'), S('email_customer', { kind: 'survey' })], why: 'One question, sent once. Skip failed-payment churn (they did not choose to leave).' },
  { id: 'dunning_alert', name: 'Failed payment → Slack #billing → personal note', source: 'd01 #3, d08 §6.4', trigger: 'stripe_failed_payment', filter: 'first_attempt', actions: [S('slack_post'), S('email_customer', { kind: 'dunning' })], why: 'Filter attempt_count = 1 or you email the customer on every retry, on top of Stripe\'s own dunning emails.' },
  { id: 'invoice_chaser', name: 'Invoice past due → reminder with invoice link', source: 'd01 #4, d08 §6.4', trigger: 'invoice_overdue', filter: 'weekly_notice', actions: [S('email_customer', { kind: 'dunning' })], why: 'Replaces the manual reminder click in Payments (net-30 enterprise invoices).' },
  { id: 'lead_enrich_score', name: 'Inbound lead → enrich → score in CRM → Slack #leads', source: 'd01 #5', trigger: 'crm_inbound_lead', filter: 'business_email', actions: [S('enrich'), S('crm_log'), S('slack_post')], why: 'Enrichment costs credits and is wrong ~1 in 8 times; it makes triage faster, not automatic.' },
  { id: 'lead_routing', name: 'Inbound lead → AI segment → create follow-up task', source: 'd01 #6', trigger: 'crm_inbound_lead', filter: 'business_email', actions: [S('ai_step', { mode: 'classify' }), S('create_task')], why: 'Routing for when you have more than one person selling.' },
  { id: 'demo_brief', name: 'Meeting booked → enrich → AI prep brief → Slack DM', source: 'd01 #7', trigger: 'deal_stage', filter: 'meeting_booked', actions: [S('enrich'), S('ai_step', { mode: 'summarize', review: true }), S('slack_post')], why: 'Read the brief before the call; it can be wrong.' },
  { id: 'meeting_notes_crm', name: 'Meeting ended → AI summary → CRM note → Slack DM', source: 'd01 #8, d04 §4', trigger: 'meeting_held', filter: 'sales_calls', actions: [S('ai_step', { mode: 'summarize', review: true }), S('crm_log'), S('slack_post')], why: 'Saves the post-call write-up. Review the summary: 5–10% invent a next step.' },
  { id: 'action_items', name: 'Meeting ended → AI action items → CRM tasks', source: 'd01 #9', trigger: 'meeting_held', filter: 'sales_calls', actions: [S('ai_step', { mode: 'summarize' }), S('create_task')], why: 'Tasks nobody does are noise; filter to your own commitments.' },
  { id: 'welcome_sequence', name: 'New trial signup → welcome / setup email', source: 'd01 #10, d08 §6.1', trigger: 'form_signup', filter: 'not_junk', actions: [S('email_customer', { kind: 'onboarding' })], why: 'One clear next step. Exit when they activate.' },
  { id: 'trial_ending', name: 'Trial ends in 3 days → reminder email', source: 'd01 #11, d08 §6.3', trigger: 'trial_ending', filter: 'not_junk', actions: [S('email_customer', { kind: 'trial' })], why: 'Check Payments: Stripe\'s own trial reminders may already do this (double emails annoy).' },
  { id: 'ticket_triage', name: 'Ticket → AI classify → Slack #support / task', source: 'd01 #12, d09', trigger: 'support_ticket', filter: null, actions: [S('ai_step', { mode: 'classify' }), S('slack_post')], why: 'Internal routing; a misroute delays an urgent ticket.' },
  { id: 'ai_ticket_reply', name: 'Ticket → AI drafts reply → email customer', source: 'd01 #12, d09', trigger: 'support_ticket', filter: 'billing_or_urgent', actions: [S('ai_step', { mode: 'draft', review: true }), S('email_customer', { kind: 'reply' })], why: 'Keep the human review step: an unreviewed AI reply to a billing question is how complaints start.' },
  { id: 'reply_stage', name: 'Prospect replied → Slack DM', source: 'd01 #13', trigger: 'deal_stage', filter: 'replied', actions: [S('slack_post')], why: 'Speed-to-lead visibility; saves nothing measurable.' },
  { id: 'weekly_digest', name: 'Monday → metrics digest → Slack + Sheet', source: 'd01 #15', trigger: 'weekly_schedule', filter: null, actions: [S('ai_step', { mode: 'summarize', review: true }), S('slack_post'), S('sheet_log')], why: 'Cuts the weekly review. An AI summary can misstate a number; skim it.' },
  { id: 'paid_ledger', name: 'New paying customer → Sheet (bookkeeping log)', source: 'd01 #4', trigger: 'stripe_subscription', filter: 'amount_positive', actions: [S('sheet_log')], why: 'Your Books app already syncs Stripe; this mostly duplicates it.' },
  { id: 'ai_welcome', name: 'New customer → AI-personalized welcome email', source: 'd08 §6.1', trigger: 'stripe_customer', filter: 'not_junk', actions: [S('ai_step', { mode: 'draft' }), S('email_customer', { kind: 'onboarding' })], why: 'Tempting. Unreviewed, a few in a hundred will say something false about your product.' },
  { id: 'signup_to_crm', name: 'Business trial signup → CRM lead → Slack', source: 'd01 #5 (PLG)', trigger: 'form_signup', filter: 'business_email', actions: [S('crm_add_lead'), S('slack_post')], why: 'Puts B2B trial signups in front of you for a sales-assist touch. If it breaks, those leads never reach the CRM.' },
  // ---- Built-in app templates (events and actions exported by the other apps) ----
  { id: 'inbound_lead_crm_notify', name: 'New inbound lead → enrich → CRM note → Slack', source: 'tool-gap §4, d01 #5', trigger: 'sales_inbound_lead_created', filter: 'business_email', actions: [S('enrich'), S('sales_add_note'), S('slack_post')], why: 'Stable event id per lead, so it fires once. Enrichment is wrong about 1 in 8 times; the CRM note carries it, so skim the lead before you call.' },
  { id: 'sla_slack_alert', name: 'Ticket SLA at risk → Slack alert', source: 'd09, tool-gap §4', trigger: 'helpdesk_sla_at_risk', filter: 'urgent_or_high', actions: [S('slack_post')], why: 'Fires once per ticket when 75% of the SLA is gone. Internal alert only; the ticket still needs a human answer.' },
  { id: 'receipt_reminder', name: 'Receipt missing → reminder task for me', source: 'finance, tool-gap §4', trigger: 'money_receipt_missing', filter: 'over_100', actions: [S('email_founder'), S('slack_post')], why: 'Missing receipts lock cards and cost CPA time later. Only charges worth chasing; a reminder, not auto-attach (you still have to find the receipt).' },
  { id: 'feature_changelog_post', name: 'Feature shipped → changelog + release post draft for review', source: 'd08 §6.6, tool-gap §4', trigger: 'product_feature_shipped', filter: null, actions: [S('product_add_changelog_entry'), S('ai_step', { mode: 'draft', review: true }), S('slack_post')], why: 'The changelog entry is internal-safe; the AI release post lands in Slack as a draft for you to edit. Sending it to every customer is a separate, approved step.' },
  { id: 'runway_alert', name: 'Runway below my trigger → Slack + email me', source: 'finance, tool-gap §4', trigger: 'money_runway_below', filter: null, actions: [S('slack_post'), S('email_founder')], why: 'You set the trigger in Forecast; this makes sure you see it the day it fires, not at the next monthly review.' },
  { id: 'investor_reply_alert', name: 'Investor replied → Slack + follow-up task', source: 'fundraising, tool-gap §4', trigger: 'fundraising_investor_replied', filter: null, actions: [S('slack_post'), S('email_founder')], why: 'Speed matters in a live raise. Alert only: reply yourself.' },
];

// ---- Default email copy (players should rewrite it; quality is graded) ----
export const DEFAULT_COPY = {
  onboarding: 'Hi {{first_name}},\n\nThanks for signing up. The one thing to do first: connect your account in Settings so your first report runs tonight. It takes about 3 minutes.\n\nIf anything is unclear, just reply to this email; it comes straight to me.\n\n{{founder_name}}',
  dunning: 'Hi {{first_name}},\n\nYour last payment for {{product}} did not go through ({{decline_reason}}). Nothing is lost and your account stays active while you update the card here: {{update_card_url}}\n\nReply if you need an invoice or a different payment method.\n\n{{founder_name}}',
  trial: 'Hi {{first_name}},\n\nYour trial ends on {{trial_end_date}}. If it is working for you, nothing to do: you will be billed {{price}}. If not, you can cancel here in one click: {{billing_url}}\n\n{{founder_name}}',
  survey: 'Hi {{first_name}},\n\nSorry to see you go. One question, one line is plenty: what made you cancel?\n\nThanks for trying {{product}}.\n{{founder_name}}',
  reply: '{{ai_draft}}',
  update: 'Hi {{first_name}},\n\nWe shipped {{feature}} this week. {{one_line_benefit}}\n\n{{founder_name}}',
};

const BUZZ = /\b(seamless(ly)?|revolutionar\w*|leverage|synerg\w*|game[- ]chang\w*|cutting[- ]edge|unlock|supercharge|best[- ]in[- ]class|world[- ]class|empower\w*)\b/gi;
const SPAM = /(!!+|\bact now\b|\blimited time\b|\bguarantee[d]?\b|\bfree!|\bclick here\b|\burgent\b)/gi;
// Grade customer email copy 0..1 with feedback. Rewards a short, personal, single-next-step email; can't be
// keyword-stuffed (repeating tokens or links lowers the score).
export function emailCopyScore(text, kind = 'onboarding') {
  const t = String(text ?? '').trim();
  const feedback = [];
  if (!t) return { score: 0, feedback: ['Empty email.'] };
  if (t.includes('{{ai_draft}}')) return { score: 0.5, feedback: ['Body comes from the AI step: quality depends on its draft (and your review).'], ai: true };
  const words = t.split(/\s+/).filter(Boolean).length;
  let s = 0.5;
  if (words < 25) { s -= 0.2; feedback.push('Too short to be useful: say what to do next and why.'); } else if (words <= 160) s += 0.1; else if (words > 250) { s -= 0.2; feedback.push('Too long: nobody reads 250+ word automated emails. One idea, one next step.'); }
  const tokens = t.match(/\{\{\s*[a-z_]+\s*\}\}/gi) ?? [];
  if (tokens.some((x) => /first_name|company/i.test(x))) s += 0.1; else feedback.push('Not personalized: use {{first_name}} (and company for B2B).');
  const links = (t.match(/https?:\/\/\S+|\{\{\s*\w*(url|link)\w*\s*\}\}/gi) ?? []).length;
  if (kind === 'dunning' && !/update_card_url|invoice_url|billing_url|https?:\/\//i.test(t)) { s -= 0.25; feedback.push('A payment email without the update-card / invoice link makes them hunt for it.'); }
  if (links === 1) s += 0.1; else if (links > 2) { s -= 0.15; feedback.push('Too many links: give one clear next step.'); }
  if (/\breply\b/i.test(t) || /\{\{\s*founder_name\s*\}\}/i.test(t)) s += 0.1; else feedback.push('Sign it as a person and invite a reply; it catches confused customers before they become tickets.');
  const buzz = (t.match(BUZZ) ?? []).length;
  if (buzz) { s -= 0.08 * buzz; feedback.push('Buzzwords read as marketing automation. Say the concrete thing.'); }
  const spam = (t.match(SPAM) ?? []).length + (t.match(/\b[A-Z]{4,}\b/g) ?? []).length;
  if (spam) { s -= 0.1 * Math.min(3, spam); feedback.push('Spammy phrasing or shouting hurts deliverability and trust.'); }
  const uniq = new Set(tokens.map((x) => x.toLowerCase()));
  if (tokens.length - uniq.size >= 3) { s -= 0.15; feedback.push('Repeating merge tags does not make it more personal.'); }
  if (kind === 'survey' && (t.match(/\?/g) ?? []).length > 2) { s -= 0.1; feedback.push('Exit surveys get answered when they ask one question.'); }
  return { score: Math.round(Math.max(0, Math.min(1, s)) * 100) / 100, feedback };
}

// Founder hours to build an automation (simple 0.25–0.5h, multi-step 1–3h, AI steps more).
export function setupHours(spec, platformId, { template = false } = {}) {
  const p = PLATFORMS[platformId] ?? PLATFORMS.zapier_pro;
  let h = 0.15 + (spec.filter ? 0.1 : 0) + (spec.dedupe ? 0.05 : 0);
  for (const a of spec.actions ?? []) {
    h += ACTIONS[a.type]?.setup ?? 0.2;
    if (a.type === 'email_customer' && !String(a.copy ?? '').includes('{{ai_draft}}')) h += 0.25; // writing the email
    if (a.review) h += 0.1; // approval step (Slack approve / Gmail draft)
  }
  h *= p.setupMult * (template ? 0.7 : 1);
  return Math.round(Math.min(4, Math.max(0.25, h)) * 100) / 100;
}
export const testHours = (spec) => Math.round((0.1 + 0.05 * (spec.actions?.length ?? 1)) * 100) / 100;

// Units one run uses under a platform's counting rule.
export function unitsFor(platformId, { actions = [], filteredOut = false, ok = actions.length }) {
  const p = PLATFORMS[platformId];
  if (!p) return 0;
  const done = actions.slice(0, ok);
  if (p.count === 'execution') return 1;
  if (p.count === 'credit') return 1 + (filteredOut ? 0 : done.reduce((a, x) => a + (x.type === 'ai_step' ? AI_CREDITS : 1), 0));
  return filteredOut ? 0 : done.length; // Zapier: successful action steps only
}

// Validate a spec against the platform (Zapier Free: two-step Zaps, no AI; Make Free: 2 active scenarios).
export function validateSpec(spec, platformId) {
  const p = PLATFORMS[platformId];
  const errs = [];
  if (!p) errs.push('Pick an automation platform first.');
  if (!TRIGGERS[spec.trigger]) errs.push('Pick a trigger.');
  if (!spec.actions?.length) errs.push('Add at least one action.');
  if (p && spec.actions?.length > p.maxActions) errs.push(`${p.vendor} ${p.name} allows ${p.maxActions} action per Zap (two-step Zaps). Upgrade for multi-step.`);
  if (p && !p.ai && spec.actions?.some((a) => a.type === 'ai_step')) errs.push(`${p.vendor} ${p.name} has no AI steps.`);
  if (spec.filter && !TRIGGERS[spec.trigger]?.filters[spec.filter]) errs.push('That filter does not apply to this trigger.');
  for (const a of spec.actions ?? []) if (!ACTIONS[a.type]) errs.push(`Unknown action ${a.type}.`);
  return errs;
}
