// Churn-reason data for the founder simulator: why customers cancel, by buyer segment and B2C app category, how
// they phrase it in exit surveys, what warns the founder in advance and which saves work.
// Pure data plus small sampling helpers (reasonMixFor, sampleChurnReason, surveyAnswer). No DOM, no state.
// Research notes and full dated sources: docs/research/churn-reasons.md (synthesis) and
// docs/research/churn/c1..c10 (raw notes, compiled 2026-10-14).
//
// Conventions
// - Every number is either sourced (the `sourced` arrays and CROSS.*.sources carry URL and date; [unverified] means a
//   secondary, vendor or snippet-only source) or a [design] estimate from the research notes. Almost every
//   segment-level churn range, reason share, save rate and lead time is [design]: no independent source publishes
//   them for these verticals. Never show a [design] value to players as a real statistic.
// - Ranges are [min, max], always ordered. Shares and rates are 0..1. Months are 1..12. Days are calendar days.
// - Reason mixes are shares of CHURNED LOGOS (not revenue) and sum to 1. `involuntaryShare` equals the
//   `payment_failed` share of that mix; `involuntaryShareRange` is the range the notes gave in prose.
//   Where the notes' table and prose disagreed, see docs/research/churn-reasons.md "Conflicts and how they were resolved".
// - Sampling helpers take `rand` (a () => [0,1) function, default Math.random) so callers can pass the seeded rng.
// - saveable keys: pause (pause plan), discount (price concession), downgrade (cheaper tier / fewer seats or units),
//   execOutreach (executive or founder outreach to the economic buyer or successor), fix (remove the cause:
//   ship the feature, fix the bug, re-onboard, supply the compliance package, run dunning). Each is the chance that
//   the customer stays (or pauses instead of leaving) when the RIGHT offer is made in time; use the max of the
//   keys that apply, not the sum.

import { getSegment } from './buyer-segments.js';

// ---------------------------------------------------------------------------------------------
// Helpers for building the tables below
// ---------------------------------------------------------------------------------------------
const ORDER = ['pause', 'discount', 'downgrade', 'execOutreach', 'fix'];
const r4 = (n) => Math.round(n * 10000) / 10000;
const L = (text, w, category, misleading = false) => ({ text, w, category, misleading });

function reason(label, o) {
  const save = Object.fromEntries(ORDER.map((k, i) => [k, o.save[i]]));
  return {
    label, voluntary: o.v ?? true, kind: o.kind, controllable: o.c, surveyLabels: o.survey,
    typicalNoticeDays: o.notice, saveable: save, signals: o.signals, note: o.note ?? '',
  };
}

// ---------------------------------------------------------------------------------------------
// CHURN_REASONS
// `kind`: billing | customer_situation | vendor_fit | procurement | ownership | consumer
// survey `category` values are the game's CANCEL_CATEGORIES ids in public/apps/product/panel.js
// (too_expensive, missing_feature, not_using, bugs, switched, no_longer_needed, felt_ignored, payment_failed) or null (no answer).
// ---------------------------------------------------------------------------------------------
export const CHURN_REASONS = {
  business_closed: reason('Business closed or stopped trading', {
    kind: 'customer_situation', c: 0.02, notice: [0, 14], save: [0.06, 0, 0.02, 0, 0],
    signals: ['closure_news', 'business_volume_decline', 'failed_payment', 'plan_downgrade', 'data_export_request'],
    survey: [L('Business closed / no longer operating', 0.3, 'no_longer_needed'), L('Too expensive', 0.22, 'too_expensive', true), L('No longer need it', 0.18, 'no_longer_needed'), L('Cutting every cost we can', 0.1, 'too_expensive', true), L('(no answer: the owner just stopped paying)', 0.2, null)],
    note: 'Usually appears as a sudden stop in activity, not a cancel request. Owners in a cash crunch often tick "too expensive".',
  }),
  seasonal_pause: reason('Seasonal slowdown / off-season', {
    kind: 'customer_situation', c: 0.5, notice: [0, 30], save: [0.4, 0.1, 0.3, 0.02, 0],
    signals: ['season_end', 'business_volume_decline', 'usage_drop'],
    survey: [L('Slow season, will be back', 0.35, 'no_longer_needed'), L('Not using it right now', 0.3, 'not_using'), L('Too expensive for what we use in winter', 0.25, 'too_expensive', true), L('Cutting costs', 0.1, 'too_expensive', true)],
    note: 'A pause plan with a fixed reactivation date is the natural fit.',
  }),
  budget_cut: reason('Budget cut / cost-cutting', {
    kind: 'customer_situation', c: 0.35, notice: [0, 60], save: [0.25, 0.2, 0.35, 0.15, 0.05],
    signals: ['layoffs_or_freeze', 'budget_review', 'seat_decline', 'plan_downgrade', 'usage_drop'],
    survey: [L('Budget cuts', 0.45, 'too_expensive'), L('Too expensive', 0.3, 'too_expensive'), L('Consolidating tools', 0.1, 'switched', true), L('Not using it enough', 0.15, 'not_using', true)],
    note: 'Churnkey: budget is the top stated reason (33%) but often masks low value.',
  }),
  funding_ended: reason('Grant, ESSER or funding round ended', {
    kind: 'customer_situation', c: 0.15, notice: [14, 120], save: [0.25, 0.15, 0.25, 0.15, 0],
    signals: ['funding_cliff', 'layoffs_or_freeze', 'budget_review'],
    survey: [L('Grant / funding ended', 0.45, 'no_longer_needed'), L('Budget cuts', 0.3, 'too_expensive'), L('Too expensive', 0.15, 'too_expensive', true), L('Not using it enough', 0.1, 'not_using', true)],
  }),
  price_too_high: reason('Price too high for the value', {
    kind: 'vendor_fit', c: 0.6, notice: [0, 30], save: [0.1, 0.3, 0.3, 0.1, 0.15],
    signals: ['usage_drop', 'plan_downgrade', 'competitor_pitch', 'support_silence'],
    survey: [L('Too expensive for the value', 0.7, 'too_expensive'), L('Found something cheaper', 0.15, 'switched'), L('Budget cuts', 0.15, 'too_expensive', true)],
    note: 'Treat a survey "price" answer as roughly half real price sensitivity and half missing value (design rule).',
  }),
  not_using: reason('Not using it enough / low adoption', {
    kind: 'vendor_fit', c: 0.6, notice: [0, 30], save: [0.2, 0.08, 0.25, 0.12, 0.3],
    signals: ['usage_drop', 'login_decay', 'seat_decline', 'champion_departure', 'never_activated_7d'],
    survey: [L('Not using it enough', 0.4, 'not_using'), L('Too expensive', 0.35, 'too_expensive', true), L('Just testing multiple apps', 0.1, 'not_using', true), L('Budget cuts', 0.15, 'too_expensive', true)],
    note: 'Largest true bucket in most exit surveys; it hides behind "price" and "budget". Shopify developers saw up to 98% of mandatory-prompt answers as "testing multiple apps".',
  }),
  champion_left: reason('Champion left / new leadership', {
    kind: 'customer_situation', c: 0.3, notice: [0, 60], save: [0.05, 0.08, 0.1, 0.33, 0.15],
    signals: ['champion_departure', 'exec_sponsor_change', 'usage_drop', 'support_silence'],
    survey: [L('Not using it enough', 0.35, 'not_using', true), L('New leadership chose another tool', 0.25, 'switched'), L('Too expensive', 0.2, 'too_expensive', true), L('Nobody owns it any more', 0.2, 'not_using')],
    note: 'Stripo/ChurnZero claim ~51% churn within 12 months after a champion leaves and 65% after an executive change [unverified].',
  }),
  acquired_or_merged: reason('Customer acquired or merged', {
    kind: 'ownership', c: 0.15, notice: [0, 180], save: [0, 0.05, 0.05, 0.22, 0.05],
    signals: ['acquisition_news', 'exec_sponsor_change', 'seat_decline', 'champion_departure'],
    survey: [L('Merged: moving to the parent company system', 0.55, 'no_longer_needed'), L('Consolidating tools', 0.2, 'switched'), L('Business changed', 0.15, 'no_longer_needed'), L('(no answer: acquirer ordered the cancellation)', 0.1, null)],
    note: 'Saves exist only before the acquirer fixes its tech plan (about 15-35% of at-risk accounts pre-close, under 10-15% after) [design].',
  }),
  switched_competitor: reason('Switched to a competitor', {
    kind: 'vendor_fit', c: 0.55, notice: [0, 30], save: [0.03, 0.22, 0.08, 0.12, 0.2],
    signals: ['competitor_pitch', 'usage_drop', 'support_ticket_spike', 'platform_announcement', 'data_export_request'],
    survey: [L('Switched to another tool', 0.55, 'switched'), L('Too expensive', 0.2, 'too_expensive', true), L('Missing a feature I need', 0.15, 'missing_feature', true), L('Better fit elsewhere', 0.1, 'switched')],
  }),
  platform_built_in: reason('Platform built the feature in', {
    kind: 'vendor_fit', c: 0.15, notice: [0, 30], save: [0, 0.08, 0.12, 0.05, 0.18],
    signals: ['platform_announcement', 'usage_drop', 'competitor_pitch'],
    survey: [L('Using the built-in feature instead', 0.5, 'switched'), L('Not using it enough', 0.25, 'not_using', true), L('Too expensive for what it adds', 0.25, 'too_expensive', true)],
    note: 'Shopify, Microsoft, Google, brand-supplied POS or CRM bundles. Merchants rarely name the platform in a survey.',
  }),
  missing_feature: reason('Missing a feature they need', {
    kind: 'vendor_fit', c: 0.7, notice: [0, 30], save: [0.03, 0.08, 0.05, 0.1, 0.4],
    signals: ['support_ticket_spike', 'competitor_pitch', 'usage_drop'],
    survey: [L('Missing a feature I need', 0.6, 'missing_feature'), L('Switched to another tool', 0.25, 'switched'), L('Too expensive for what it does', 0.15, 'too_expensive', true)],
  }),
  poor_support: reason('Poor or slow support', {
    kind: 'vendor_fit', c: 0.95, notice: [0, 14], save: [0, 0.15, 0, 0.2, 0.55],
    signals: ['support_ticket_spike', 'support_silence', 'nps_drop'],
    survey: [L("Support didn't respond", 0.5, 'felt_ignored'), L('Switched to another tool', 0.2, 'switched'), L('Not using it enough', 0.15, 'not_using', true), L('Bugs or reliability', 0.15, 'bugs', true)],
    note: 'The game already models this as cancelReason felt_ignored; a fast personal reply saves it.',
  }),
  bugs_reliability: reason('Bugs or reliability', {
    kind: 'vendor_fit', c: 0.9, notice: [0, 14], save: [0, 0.15, 0, 0.2, 0.5],
    signals: ['outage_incident', 'support_ticket_spike', 'usage_drop'],
    survey: [L('Bugs or reliability', 0.55, 'bugs'), L('Switched to another tool', 0.25, 'switched'), L('Not worth the price', 0.2, 'too_expensive', true)],
    note: 'Outages during peak hours (restaurant service, front-desk check-in) are remembered strongly.',
  }),
  never_activated: reason('Never activated / onboarding failed', {
    kind: 'vendor_fit', c: 0.75, notice: [0, 30], save: [0.05, 0.05, 0.05, 0.05, 0.3],
    signals: ['never_activated_7d', 'login_decay', 'usage_drop'],
    survey: [L("Didn't use it enough / never set it up", 0.5, 'not_using'), L('Too complicated', 0.15, 'not_using'), L('Too expensive', 0.2, 'too_expensive', true), L('Just testing multiple apps', 0.15, 'not_using', true)],
    note: 'Users who do not reach first value within about 7 days churn about twice as fast [design]. Often mislabelled "not using".',
  }),
  outgrew_product: reason('Outgrew the product', {
    kind: 'vendor_fit', c: 0.5, notice: [14, 60], save: [0, 0.05, 0, 0.15, 0.25],
    signals: ['support_ticket_spike', 'competitor_pitch', 'seat_decline'],
    survey: [L('Switched to a bigger platform', 0.55, 'switched'), L('Missing a feature I need', 0.35, 'missing_feature'), L('Business changed', 0.1, 'no_longer_needed')],
  }),
  consolidated_vendors: reason('Vendor consolidation / tool rationalisation', {
    kind: 'procurement', c: 0.3, notice: [30, 180], save: [0, 0.12, 0.1, 0.25, 0.2],
    signals: ['budget_review', 'exec_sponsor_change', 'rfp_posted', 'seat_decline', 'term_end_approaching'],
    survey: [L('Consolidating tools', 0.45, 'switched'), L('Budget cuts', 0.25, 'too_expensive', true), L('Not using it enough', 0.15, 'not_using', true), L('Too expensive', 0.15, 'too_expensive', true)],
    note: 'Denver Public Schools cut digital tools from over 1,000 to 346; KLAS: 57% of RCM suite adopters cited vendor consolidation.',
  }),
  security_or_compliance: reason('Security or compliance failure', {
    kind: 'procurement', c: 0.7, notice: [30, 120], save: [0.02, 0, 0, 0.15, 0.5],
    signals: ['security_review_stall', 'regulatory_change', 'rfp_posted'],
    survey: [L('Failed our security review', 0.4, 'missing_feature'), L('Missing a feature I need', 0.3, 'missing_feature'), L('Switched to another tool', 0.3, 'switched')],
    note: 'SOC 2, HECVAT/VPAT, BAA, StateRAMP/FedRAMP, NERC CIP, 21 CFR Part 11 validation.',
  }),
  contract_term_end_rfp: reason('Contract ended / forced rebid (RFP)', {
    kind: 'procurement', c: 0.35, notice: [90, 540], save: [0, 0.15, 0.08, 0.25, 0.1],
    signals: ['rfp_posted', 'term_end_approaching', 'exec_sponsor_change', 'budget_review'],
    survey: [L('Contract ended: we went to bid', 0.5, 'no_longer_needed'), L('Switched to another vendor', 0.3, 'switched'), L('Consolidating tools', 0.1, 'switched'), L('Budget cuts', 0.1, 'too_expensive', true)],
    note: 'Early extension offered before the RFP saves about 40-60% (utilities, local gov) [design]; an open RFP saves under 25%.',
  }),
  moved_to_in_house: reason('Moved in-house / built their own', {
    kind: 'vendor_fit', c: 0.3, notice: [30, 180], save: [0, 0.05, 0, 0.12, 0.15],
    signals: ['competitor_pitch', 'seat_decline', 'exec_sponsor_change'],
    survey: [L('Building it ourselves', 0.5, 'switched'), L('Missing a feature I need', 0.3, 'missing_feature', true), L('Too expensive', 0.2, 'too_expensive', true)],
    note: 'Retool (vendor) reports 35% of teams replaced at least one SaaS tool with a custom build [unverified].',
  }),
  payment_failed: reason('Payment failed (involuntary)', {
    v: false, kind: 'billing', c: 0.5, notice: [0, 14], save: [0, 0, 0.05, 0, 0.42],
    signals: ['failed_payment', 'card_expiring', 'slow_invoice_payment'],
    survey: [L('(no response: failed-payment churners rarely answer)', 0.8, null), L('Payment failed', 0.12, 'payment_failed'), L('Too expensive', 0.08, 'too_expensive', true)],
    note: 'fix = dunning retries plus card updater: about 35-55% of soft declines recover within 30 days; hard declines under 10% without a new card [design].',
  }),
  owner_retired_or_sold: reason('Owner retired or sold the business', {
    kind: 'ownership', c: 0.05, notice: [0, 90], save: [0.05, 0, 0, 0.12, 0],
    signals: ['owner_succession', 'closure_news', 'business_volume_decline'],
    survey: [L('Owner retiring / sold the business', 0.45, 'no_longer_needed'), L('Business closed', 0.25, 'no_longer_needed'), L('Too expensive', 0.15, 'too_expensive', true), L('(no answer)', 0.15, null)],
  }),
  regulation_change: reason('Regulation or mandate changed', {
    kind: 'procurement', c: 0.1, notice: [30, 365], save: [0.02, 0, 0, 0.1, 0.3],
    signals: ['regulatory_change', 'security_review_stall'],
    survey: [L('Rules changed: we had to switch', 0.45, 'switched'), L('No longer needed', 0.3, 'no_longer_needed'), L('Missing a feature I need', 0.25, 'missing_feature')],
    note: 'Examples: FMCSA ELD revocations forcing a fleet to swap vendors; PUC reliability rules; new state law.',
  }),
  management_change: reason('Management company or operator changed', {
    kind: 'ownership', c: 0.15, notice: [0, 30], save: [0, 0.1, 0.05, 0.22, 0.05],
    signals: ['acquisition_news', 'champion_departure', 'brand_mandate'],
    survey: [L('New management is using their own systems', 0.55, 'switched'), L('Switched to another tool', 0.25, 'switched'), L('Not using it enough', 0.2, 'not_using', true)],
    note: 'Hotels: a third-party manager replaces the operator and brings its own stack; the vendor learns from the new GM, often with 30 days or less notice.',
  }),
  franchisor_mandated_switch: reason('Franchisor or brand mandated another system', {
    kind: 'procurement', c: 0.15, notice: [30, 540], save: [0, 0.2, 0, 0.3, 0],
    signals: ['brand_mandate', 'competitor_pitch'],
    survey: [L('Brand standard requires a different system', 0.6, 'switched'), L('Switched to another tool', 0.25, 'switched'), L('Not using it enough', 0.15, 'not_using', true)],
    note: 'Binary event: you are on the approved vendor list or you lose the category. Mandates typically give 6-18 months.',
  }),
  political_termination: reason('Cancelled by political or executive action', {
    kind: 'procurement', c: 0.05, notice: [0, 30], save: [0, 0, 0.15, 0.1, 0.05],
    signals: ['exec_sponsor_change', 'budget_review', 'layoffs_or_freeze'],
    survey: [L('Contract terminated for convenience', 0.5, 'no_longer_needed'), L('Budget cuts', 0.4, 'too_expensive'), L('(no answer)', 0.1, null)],
    note: 'DOGE-era terminations of about 1,100 federal contracts in early 2025; some were later revived [unverified].',
  }),
  project_completed_no_renewal: reason('Project finished, no follow-on job', {
    kind: 'customer_situation', c: 0.35, notice: [0, 30], save: [0.35, 0.05, 0.25, 0.2, 0],
    signals: ['business_volume_decline', 'usage_drop', 'season_end'],
    survey: [L('Project completed', 0.5, 'no_longer_needed'), L('Not using it enough', 0.25, 'not_using'), L('Too expensive between jobs', 0.25, 'too_expensive', true)],
    note: 'General contractors: pricing per active project and pausing between jobs retains more than seat pricing.',
  }),
  achieved_goal: reason('Achieved the goal (B2C)', {
    kind: 'consumer', c: 0.2, notice: [0, 0], save: [0.1, 0.05, 0.05, 0, 0.05],
    signals: ['goal_milestone_hit', 'b2c_engagement_drop'],
    survey: [L('Got what I needed (trip done, test passed, goal met)', 0.45, 'no_longer_needed'), L('No longer need it', 0.3, 'no_longer_needed'), L("Don't use it enough", 0.15, 'not_using', true), L('Too expensive', 0.1, 'too_expensive', true)],
    note: 'Dating: the best outcome is a cancel (met a partner). Achieved-goal churners rarely return except at the next event.',
  }),
  found_free_alternative: reason('Found a free alternative (B2C)', {
    kind: 'consumer', c: 0.45, notice: [0, 0], save: [0.05, 0.15, 0.2, 0, 0.15],
    signals: ['b2c_engagement_drop', 'new_model_release', 'competitor_pitch'],
    survey: [L('Found a free alternative / the phone does it built in', 0.4, 'switched'), L('Too expensive', 0.4, 'too_expensive', true), L("Don't use it enough", 0.2, 'not_using', true)],
    note: 'Examples: CapCut and phone editors, Apple Reminders, free chatbots, the app\'s own free tier.',
  }),
  forgot_or_surprised_renewal: reason('Forgot / surprised by the renewal (B2C)', {
    kind: 'consumer', c: 0.85, notice: [0, 0], save: [0.15, 0.1, 0.2, 0, 0.35],
    signals: ['annual_renewal_approaching', 'refund_request', 'b2c_engagement_drop'],
    survey: [L('I forgot to cancel / did not expect the charge', 0.5, 'no_longer_needed'), L("Don't use it enough", 0.25, 'not_using', true), L('Too expensive', 0.25, 'too_expensive', true)],
    note: 'Shows up as refund requests (annual plans 6-7.6%, all apps median 2.71% [Adapty]) and, on web billing, chargebacks.',
  }),
  subscription_fatigue: reason('Too many subscriptions (B2C)', {
    kind: 'consumer', c: 0.3, notice: [0, 0], save: [0.25, 0.15, 0.15, 0, 0.05],
    signals: ['b2c_engagement_drop', 'annual_renewal_approaching'],
    survey: [L('Too many subscriptions', 0.5, 'too_expensive'), L('Too expensive', 0.35, 'too_expensive'), L("Don't use it enough", 0.15, 'not_using', true)],
    note: 'Circana: about 40% of recent Game Pass Essential / PS Plus Essential cancellers said they liked it but could not afford it (Nintendo Switch Online 50%).',
  }),
  other: reason('Other / unclassified', {
    kind: 'vendor_fit', c: 0.3, notice: [0, 30], save: [0.05, 0.05, 0.05, 0.05, 0.1],
    signals: ['usage_drop'],
    survey: [L('Other', 0.7, 'no_longer_needed'), L('Too expensive', 0.3, 'too_expensive', true)],
  }),
};

/** Map game cancelReason strings (core/stripe.js callers) to a reason id here. */
export const GAME_REASON_ALIASES = {
  customer_request: null, felt_ignored: 'poor_support', renewal_declined: 'contract_term_end_rfp', price_increase: 'price_too_high',
  billing_migration_failed: 'payment_failed', incomplete_expired: 'payment_failed', contract_terms: 'contract_term_end_rfp',
  pilot_ended: 'contract_term_end_rfp', trial_not_converted: 'never_activated', voluntary: null,
};

// ---------------------------------------------------------------------------------------------
// SIGNALS: leading indicators. leadDays = how far ahead of the cancellation or non-renewal the signal usually shows.
// All lead times and strengths are [design] (the notes found no primary study ranking signals); ordering follows
// c10 section E2. strength = how predictive the signal is when it fires (0..1).
// ---------------------------------------------------------------------------------------------
const sig = (label, leadDays, strength, howDetected) => ({ label, leadDays, strength, howDetected, status: 'design' });
export const SIGNALS = {
  usage_drop: sig('Usage down 40% or more vs baseline', [30, 60], 0.7, 'Analytics: active users or core actions fall against the account baseline for 30 days; weekly active share in the Success app health score drops.'),
  login_decay: sig('Logins fading (admin only, or none)', [14, 30], 0.35, 'Analytics: last-seen date ages; only the admin logs in. Weak for multi-seat accounts (logins can be automated).'),
  seat_decline: sig('Seat or unit count falling', [30, 60], 0.75, 'Stripe: subscription quantity decreases or a renewal quote comes back with fewer seats, locations, trucks or technicians.'),
  champion_departure: sig('Champion changed job or role', [30, 90], 0.8, 'CRM / LinkedIn: the contact\'s job change; the Success app flags "champion left". Usually noticed only by checking LinkedIn or when an email bounces.'),
  exec_sponsor_change: sig('New executive or leadership', [60, 120], 0.55, 'CRM / news: a new CIO, CFO, superintendent, pastor, mayor or managing partner. Often the trigger rather than the signal.'),
  failed_payment: sig('Missed invoice or declined card', [0, 7], 0.5, 'Stripe: invoice.payment_failed, subscription past_due, dunning retry count. Predicts involuntary churn; weak for voluntary.'),
  card_expiring: sig('Card on file about to expire', [7, 30], 0.4, 'Stripe: payment method expiry date within 30 days.'),
  slow_invoice_payment: sig('Invoice paid late / PO delayed', [14, 60], 0.4, 'Stripe: invoices open past net terms; procurement stops answering. For invoiced buyers this is a procurement delay more often than a cancellation.'),
  support_ticket_spike: sig('Ticket spike on a new issue type', [14, 45], 0.5, 'Helpdesk: ticket volume per account up in 30 days, repeated tickets on the same workflow; trend matters more than count.'),
  support_silence: sig('Account goes quiet (no tickets, no replies)', [30, 60], 0.3, 'Helpdesk / inbox: an account that used to write stops writing; unanswered emails to the owner. Quiet is often worse than a spike.'),
  nps_drop: sig('NPS or CSAT drop', [30, 90], 0.3, 'Customers app: a detractor score or sharply lower CSAT. Most respondents are not at risk; detractors are.'),
  never_activated_7d: sig('No first-value event within 7 days', [0, 30], 0.65, 'Analytics: setup unfinished, no key action by day 7 (unverified 4.2x higher 90-day churn).'),
  business_volume_decline: sig('Customer\'s own activity falling', [30, 90], 0.7, 'Analytics / integration data: fewer transactions, covers, bookings, invoices, active projects, listings or dispatches synced from the customer.'),
  closure_news: sig('Closure, bankruptcy or lost authority is public', [0, 60], 0.85, 'News / public records: bankruptcy filing, WARN notice, FMCSA authority revoked, licence lapsed, "closed for good" post, hours cut.'),
  acquisition_news: sig('Merger, sale or roll-up announced', [60, 180], 0.8, 'News: press release, 8-K/S-4, DSO or PE roll-up in the region, hotel sale or management change. Reach the acquirer before its tech plan is fixed.'),
  budget_review: sig('Budget season / vendor review under way', [60, 180], 0.5, 'Calendar and CRM: fiscal-year budget cycle, tool-audit email, procurement asking for usage data, "software inventory" on a board agenda.'),
  rfp_posted: sig('RFI / RFP or sources-sought notice posted', [180, 540], 0.8, 'Public portals: SAM.gov, state and council procurement sites, agenda items about extension or re-procurement.'),
  term_end_approaching: sig('Term ends within 12 months, no renewal talk', [90, 365], 0.45, 'Success app: renewal pipeline at T-90/60/30; the term end is near and nobody has booked the conversation.'),
  funding_cliff: sig('Grant or funding line ending', [60, 270], 0.75, 'CRM: grant end date recorded at onboarding; ESSER or pass-through funding report shows your line item ending; no new round for 12 months.'),
  layoffs_or_freeze: sig('Layoffs, hiring or spending freeze', [30, 120], 0.6, 'News / LinkedIn: customer layoffs, governor freeze order, job posts removed. Seat counts usually fall next.'),
  competitor_pitch: sig('Competitor pitching or switch offer', [14, 90], 0.5, 'CRM / customer call: the customer mentions a rival, a switching discount or an AI alternative; Success app logs a competitor offer at renewal.'),
  platform_announcement: sig('Platform announces a native version of your feature', [30, 180], 0.4, 'News: Shopify Editions, Microsoft or Google release, brand-standard POS update. Merchants rarely tell you.'),
  season_end: sig('Season ending / off-season starting', [0, 30], 0.6, 'Calendar: winter for roofing and HVAC, post-holiday retail, after tax season, summer slow period, end of semester.'),
  owner_succession: sig('Owner nearing retirement or selling', [90, 365], 0.45, 'CRM / news: owner age, listing on a broker site, M&A advisor engaged, the owner stops buying new tools.'),
  brand_mandate: sig('Franchisor or brand announces a technology standard', [180, 540], 0.85, 'News / franchisor email: FDD change, "prescribed technology" notice, approved-vendor list published.'),
  regulatory_change: sig('Regulation, audit or approval status changing', [90, 365], 0.6, 'News / public records: ELD vendor revoked, new state law, PUC rule, audit finding, ATO or FedRAMP status lapse.'),
  security_review_stall: sig('Security questionnaire stalls or is re-requested', [30, 120], 0.5, 'Success app: procurement ask (SIG Lite, HECVAT, VPAT, BAA) goes overdue or is asked again at renewal.'),
  outage_incident: sig('Outage or major bug hit the account', [7, 60], 0.4, 'Status page / Helpdesk: incident during their peak hours followed by an angry ticket or silence.'),
  data_export_request: sig('Customer asks for a data export', [0, 14], 0.9, 'Helpdesk / inbox: "how do I export my data?" or a migration request; the strongest late signal [design].'),
  plan_downgrade: sig('Plan or tier downgrade, or pause request', [7, 45], 0.55, 'Stripe: a move to a cheaper plan or a "pause" request; Shopify plan downgrade; fewer add-ons.'),
  b2c_engagement_drop: sig('Consumer engagement fading', [7, 30], 0.65, 'Analytics: sessions per week fall; streak or habit lapses; no second real item created.'),
  streak_broken: sig('Streak or habit broken', [3, 21], 0.5, 'Analytics: streak reset or three missed sessions in a row (language, fitness, meditation apps).'),
  goal_milestone_hit: sig('Project or goal completed', [0, 14], 0.5, 'Analytics: export done, course finished, goal reached, match made; the reason to subscribe has ended.'),
  annual_renewal_approaching: sig('Annual renewal about to charge', [0, 14], 0.5, 'Stripe: upcoming annual invoice; reminder emails and "did not expect this charge" tickets follow.'),
  refund_request: sig('Refund request', [0, 7], 0.6, 'Stripe / Helpdesk: a refund ask right after a charge, often "I never used it".'),
  new_model_release: sig('Rival model or app ships a big upgrade', [7, 45], 0.45, 'News: a competitor model or app release; AI-app users try the newest model and drift.'),
};

// ---------------------------------------------------------------------------------------------
// SAVE_TACTICS: generic rates. A segment can override the rate in SEGMENT_CHURN.saveTactics.
// `hours` = founder hours per account touched (setup excluded); `costNote` says what else it costs.
// evidence: 'design' (my estimate) | 'vendor' (vendor claim, discount heavily) | 'sourced'.
// ---------------------------------------------------------------------------------------------
const tac = (label, rate, appliesTo, hours, costNote, evidence = 'design') => ({ label, rate, appliesTo, costNote, hours, evidence });
export const SAVE_TACTICS = {
  cancel_flow_offer: tac('Cancel-flow survey with one tailored offer', 0.2, ['price_too_high', 'not_using', 'missing_feature', 'found_free_alternative', 'subscription_fatigue', 'budget_cut'], 0.1, 'One-time setup of a cancel flow (about 6-10 h); Churnkey/Paddle-style tools cost money. Well-built flows save 15-25% of those who start to cancel (vendor claims 34-54%).', 'vendor'),
  pause_plan: tac('Pause plan (1-3 months, data kept)', 0.25, ['seasonal_pause', 'budget_cut', 'funding_ended', 'not_using', 'subscription_fatigue', 'project_completed_no_renewal'], 0.3, 'Needs a pause feature and a fixed reactivation date; revenue is zero while paused. About 25% of would-be cancellers pause where offered [unverified, Userpilot].', 'vendor'),
  downgrade_offer: tac('Downgrade: fewer seats, units or a cheaper tier', 0.22, ['budget_cut', 'price_too_high', 'not_using', 'funding_ended', 'found_free_alternative', 'political_termination', 'forgot_or_surprised_renewal'], 0.3, 'Keeps the logo but cuts MRR; the most common save in freezes, grant gaps and slowdowns.'),
  discount_offer: tac('Temporary discount', 0.15, ['price_too_high', 'budget_cut', 'switched_competitor', 'franchisor_mandated_switch'], 0.2, 'Least durable: reverses at expiry and lowers revenue per retained account. Offer acceptance 15-25% of impressions [unverified].', 'vendor'),
  exec_outreach: tac('Founder / executive outreach to the economic buyer or successor', 0.3, ['champion_left', 'acquired_or_merged', 'management_change', 'consolidated_vendors', 'contract_term_end_rfp', 'owner_retired_or_sold'], 1.5, 'Needs a contact above or beside the champion. ChurnZero claims contact within 48 h of a champion change makes renewal 33% more likely [unverified].', 'vendor'),
  early_renewal_extension: tac('Early extension / renewal with capped increase, offered before a rebid', 0.5, ['contract_term_end_rfp', 'budget_cut', 'consolidated_vendors'], 4, 'Start 9-12 months before term end. Utilities and local gov: 40-60% when offered before the RFP [design]; Wollongong and Fresno chose extensions over re-procurement.'),
  rfp_defense: tac('Respond to an open RFP as incumbent', 0.22, ['contract_term_end_rfp', 'consolidated_vendors'], 30, 'Response writing, references, pricing; incumbents rarely win a rebid on price alone (under 25%) [design].'),
  multi_year_price_lock: tac('Multi-year term with price lock / cap', 0.4, ['budget_cut', 'contract_term_end_rfp', 'consolidated_vendors', 'price_too_high'], 3, 'Needs a 10-20% discount; shifts risk to the next budget cycle; excluded from the renewal pool for 1-2 years (Kellblog). K-12: 40-60% when offered before budget adoption [design].'),
  cooperative_contract_listing: tac('Listing on a state or cooperative contract vehicle', 0.4, ['contract_term_end_rfp', 'consolidated_vendors'], 40, 'Months of paperwork and often fees; lets buyers renew without a full rebid [design].'),
  dunning_retries: tac('Dunning: smart retries plus failed-payment emails', 0.42, ['payment_failed'], 0.05, 'Stripe Smart Retries (8 tries in 2 weeks recommended). Soft declines recover 35-55% in 30 days, hard declines under 10%; medians quoted 25-55% [unverified].', 'vendor'),
  card_updater: tac('Card account updater / automatic card updates', 0.2, ['payment_failed'], 0, 'Catches roughly half of expiry-driven failures before the first retry and adds 15-25% to soft-decline recovery [design]; no primary effect size found.'),
  annual_prepay_switch: tac('Move to annual prepay at a discount', 0.15, ['price_too_high', 'budget_cut', 'seasonal_pause', 'payment_failed'], 0.3, 'Cuts logo churn 30-60% vs monthly but partly mechanically; creates a renewal cliff; 10-20% discount.'),
  onboarding_rescue: tac('Onboarding rescue: call, data import, setup help in first 14 days', 0.25, ['never_activated', 'not_using'], 1, 'Founder time per account; best in the first 7 days (first value within 48 h separates retained from churned users by 10-15 points [design]).'),
  renewal_survey_and_usage_report: tac('Usage report and user survey before renewal', 0.4, ['consolidated_vendors', 'budget_cut', 'not_using', 'contract_term_end_rfp'], 2, 'University of Colorado renewed Concur for three years after a user survey; 35-50% when a survey exists before renewal [design]. One-page report the champion can show their dean or principal.'),
  pre_close_buyer_outreach: tac('Reach the buyer / new owner before their tech plan is fixed', 0.3, ['acquired_or_merged', 'management_change', 'owner_retired_or_sold'], 3, 'Needs deal-flow monitoring (8-K, trade press, roll-up news). Pre-close 15-60% depending on segment, after the decision under 10-15% [design].'),
  multi_site_master_contract: tac('Multi-site / group master agreement', 0.25, ['acquired_or_merged', 'business_closed', 'management_change'], 2, 'One closing or sold site does not end the account; acquirer can adopt it [design].'),
  integration_switching_cost: tac('Activated integration with their core stack', 0.25, ['switched_competitor', 'consolidated_vendors', 'platform_built_in', 'moved_to_in_house'], 4, 'Build and maintain integrations (accounting, ERP, SIS, EHR, core banking). Integrated customers cancel 20-35% less (relative) [design]; vendor surveys claim more [unverified].'),
  champion_handoff: tac('Handoff to the new leader within 30 days', 0.3, ['champion_left'], 1.5, 'Needs a second admin on file and a training session [design].'),
  multi_thread_second_contact: tac('Second champion / multi-threading (finance, ops, users)', 0.3, ['champion_left', 'acquired_or_merged'], 1, 'Preventive: contact map built before the champion leaves; at least two named contacts per account [design].'),
  flex_usage_pricing: tac('Flex pricing: per active project / per unit with parked-unit credit / seat removal', 0.25, ['budget_cut', 'not_using', 'seasonal_pause', 'project_completed_no_renewal'], 0.5, 'Bill falls when the customer shrinks instead of the account leaving; idle-line churn saves 25-40% in manufacturing [design].'),
  fix_and_credit: tac('Fix the issue, apologise personally, add a credit', 0.35, ['bugs_reliability', 'poor_support', 'missing_feature'], 2, 'Fix cost varies; felt_ignored cancellations in the game are saved by a fast reply.'),
  exemption_mapping: tac('Document a freeze exemption (revenue, public safety, federal compliance)', 0.4, ['budget_cut', 'funding_ended', 'political_termination'], 2, 'Washington\'s 2024 freeze exempted revenue-generating contracts [unverified]; high if the product qualifies [design].'),
  grant_funding_relabel: tac('Help the buyer move the spend to another funding line', 0.3, ['funding_ended', 'budget_cut'], 2, 'E.g. Title I / Title IV or general fund after ESSER; nonprofit grant line to operating budget [design].'),
  approved_vendor_listing: tac('Get on the franchisor / brand approved-vendor list', 0.4, ['franchisor_mandated_switch', 'management_change'], 6, 'Call the franchisor before the mandate; 30-50% of mandated switches when already listed [design].'),
  compliance_package: tac('Ship the compliance package (SOC 2, BAA, VPAT/HECVAT, validation docs)', 0.45, ['security_or_compliance', 'contract_term_end_rfp', 'regulation_change'], 20, 'Costs money and weeks; 74% of buyers accept a standard SOC 2 / CAIQ instead of a custom questionnaire (world.js).'),
  free_tier_fallback: tac('Free tier fallback instead of cancel', 0.2, ['found_free_alternative', 'budget_cut'], 0.2, 'Keeps the user but cuts revenue; Kami keeps teachers on a free plan when the district stops paying.'),
  b2c_cancel_flow_pause: tac('Consumer cancel flow: pause or switch to monthly', 0.2, ['not_using', 'subscription_fatigue', 'price_too_high', 'seasonal_pause'], 0, 'App-store billing limits offers; a developer self-report claims 47% saved with tailored offers [unverified].', 'vendor'),
  b2c_renewal_reminder: tac('Renewal reminder email before annual charge', 0.3, ['forgot_or_surprised_renewal'], 0, 'Turns a surprise charge into a conscious choice; reduces refunds and chargebacks [design].'),
  b2c_streak_reengagement: tac('Streak / habit re-engagement push', 0.15, ['not_using', 'achieved_goal'], 0, 'Push or email timed to the lapse; language apps return at higher rates after a streak reset [design].'),
  b2c_event_timed_offer: tac('Event-timed win-back (January, new season, model upgrade, new project)', 0.12, ['achieved_goal', 'seasonal_pause', 'found_free_alternative'], 0, 'Win-back after the cancel rather than a save; monthly lapsed users return at 5-25% within 6 months depending on category [design].'),
};

// ---------------------------------------------------------------------------------------------
// SEGMENT_CHURN
// ---------------------------------------------------------------------------------------------
const sigRef = (s) => {
  const [id, lo, hi] = Array.isArray(s) ? s : [s];
  const base = SIGNALS[id];
  return { id, leadDays: lo != null ? [lo, hi] : [...base.leadDays] };
};
const tacRef = (t) => {
  const [id, rate, hours] = Array.isArray(t) ? t : [t];
  const base = SAVE_TACTICS[id];
  return { id, label: base.label, rate: rate ?? base.rate, hours: hours ?? base.hours, costNote: base.costNote };
};
/** Turn [[id, n], ...] into a normalised mix. inv: payment_failed share (default: the n given, or 0). */
function normMix(rows, inv) {
  const pfRaw = rows.filter(([id]) => id === 'payment_failed').reduce((a, [, n]) => a + n, 0);
  const rest = rows.filter(([id]) => id !== 'payment_failed');
  const total = rows.reduce((a, [, n]) => a + n, 0);
  const pf = inv ?? pfRaw / total;
  const restTotal = rest.reduce((a, [, n]) => a + n, 0);
  const mix = {};
  for (const [id, n] of rest) mix[id] = (mix[id] ?? 0) + (n / restTotal) * (1 - pf);
  mix.payment_failed = pf;
  const keys = Object.keys(mix);
  for (const k of keys) mix[k] = r4(mix[k]);
  const diff = r4(1 - keys.reduce((a, k) => a + mix[k], 0));
  const big = keys.filter((k) => k !== 'payment_failed').sort((a, b) => mix[b] - mix[a])[0];
  mix[big] = r4(mix[big] + diff);
  return mix;
}
function seg(o) {
  // Where the note's table share falls outside its own prose range for involuntary churn, use the prose midpoint
  // (the prose ranges agree with Churnkey/Stripe 16% for B2B and Recurly 30%+ for low ARPC; the tables sit lower than any source).
  const table = o.mix.filter(([id]) => id === 'payment_failed').reduce((a, [, n]) => a + n, 0) / o.mix.reduce((a, [, n]) => a + n, 0);
  const inv = o.inv ?? (table >= o.invRange[0] - 1e-9 && table <= o.invRange[1] + 1e-9 ? undefined : r4((o.invRange[0] + o.invRange[1]) / 2));
  const reasonMix = normMix(o.mix, inv);
  return {
    annualLogoChurn: o.churn,
    involuntaryShare: reasonMix.payment_failed,
    involuntaryShareRange: o.invRange,
    reasonMix,
    timing: { renewalClustered: o.renewal, fiscalYearEnd: o.fy, seasonalMonths: o.months, earlyLifeMult: o.early, note: o.note },
    signals: o.signals.map(sigRef),
    saveTactics: o.tactics.map(tacRef),
    evidence: o.evidence ?? 'design',
    sourced: o.sourced,
    design: o.design,
  };
}

export const SEGMENT_CHURN = {
  retail_shops: seg({
    churn: [0.12, 0.3], invRange: [0.1, 0.2], renewal: false, fy: false, months: [1, 2], early: 2.5,
    note: 'Mostly monthly plans. Closures cluster after the holidays (Jan-Feb) and at lease renewals; the vendor usually gets no notice because the owner just stops paying.',
    mix: [['business_closed', 18], ['not_using', 14], ['budget_cut', 12], ['price_too_high', 9], ['payment_failed', 9], ['owner_retired_or_sold', 8], ['switched_competitor', 7], ['platform_built_in', 7], ['never_activated', 6], ['missing_feature', 5], ['poor_support', 2], ['seasonal_pause', 3]],
    signals: ['failed_payment', ['business_volume_decline', 60, 90], 'usage_drop', 'season_end', 'closure_news'],
    tactics: ['pause_plan', 'downgrade_offer', 'dunning_retries', 'card_updater'],
    sourced: [
      'Churnkey, about 2M exit responses across all SaaS: budget 33.0%, infrequent use 30.6%, expectations not met 8.6%, technical 4.7%, alternatives 4.3% (https://churnkey.co/blog/voluntary-churn-benchmarks/, 2025-12-13)',
      'Retail trade 5-year establishment survival 54.2% [unverified, third-party summary of BLS data] (general BLS pattern: https://www.bls.gov/opub/ted/2024/34-7-percent-of-business-establishments-born-in-2013-were-still-operating-in-2023.htm, 2024)',
      'Tariff pressure on small shops (Modern Retail, https://www.modernretail.co/operations/its-covid-2-0-mom-and-pop-shops-are-already-feeling-the-squeeze-of-trumps-tariff-wars/, 2025-02-24)',
      'Coresight: about 8,200 US store closures in 2025, +12% vs 2024, all retailers not independents [unverified] (https://macaubusiness.com/economic-watch-u-s-retailers-see-8200-closures-in-2025-amid-tariffs-debt-pressures/, 2026)',
    ],
    design: ['Annual logo churn 20-30% on monthly plans, 10-15% on annual prepay [design]', 'Reason mix and involuntary share [design]; no verified SaaS churn figure exists for independent retail', 'Save rates unknown for this segment; generic rates apply'],
  }),
  restaurants: seg({
    churn: [0.15, 0.3], invRange: [0.1, 0.2], renewal: false, fy: false, months: [1, 2, 7], early: 2.0,
    note: 'Mostly monthly. Closures follow lease expiry and slow seasons (Jan-Feb, summer in tourist markets); multi-unit groups churn unit by unit.',
    mix: [['business_closed', 26], ['switched_competitor', 12], ['price_too_high', 9], ['budget_cut', 9], ['not_using', 8], ['payment_failed', 7], ['platform_built_in', 6], ['owner_retired_or_sold', 6], ['bugs_reliability', 6], ['champion_left', 5], ['acquired_or_merged', 3], ['missing_feature', 3]],
    signals: [['business_volume_decline', 30, 90], 'failed_payment', 'closure_news', 'champion_departure', 'outage_incident', 'seat_decline'],
    tactics: ['pause_plan', 'downgrade_offer', 'multi_year_price_lock', 'fix_and_credit', 'dunning_retries'],
    sourced: [
      'Independent US restaurant locations fell from 422,001 (2024) to 412,498 (end 2025), -2.3%; 42% of operators were not profitable in 2025 (Technomic via Nation\'s Restaurant News, https://www.nrn.com/independent-restaurants/the-independent-restaurant-sector-shrunk-by-2-3-in-2025, 2026-02-24)',
      'Toast: about 164,000 locations at end 2025, 30,000 net adds, SaaS net retention 109% (https://www.businesswire.com/news/home/20260212058106/en/Toast-Announces-Fourth-Quarter-and-Full-Year-2025-Financial-Results, 2026-02-12)',
      'Toast churn "slightly above 10%" annualized, mostly smaller restaurants [unverified, analyst Q&A summary] (https://fintool.com/app/research/companies/TOST, undated)',
      'First-year restaurant failure 14-30% (NRA) or about 17% (BLS) [unverified, secondary] (https://www.restroworks.com/blog/restaurant-failure-statistics/, 2025)',
      'Churnkey: discounts are 62% of cancel-flow offers presented (offer frequency, not a save rate) [unverified] (https://churnkey.co/blog/voluntary-churn-benchmarks/, 2025-12-13)',
    ],
    design: ['Annual logo churn 15-30% [design]', 'Reason mix [design]; location-level downgrade saves groups better than a whole-account discount [design]', 'No verified save rates for restaurant SaaS'],
  }),
  salons_fitness: seg({
    churn: [0.12, 0.35], invRange: [0.15, 0.25], renewal: false, fy: false, months: [1, 7, 8], early: 2.5,
    note: 'Monthly plus annual contracts. Churn clusters after the January slump and summer slow season; a booth renter or key instructor leaving can take a seat with them in any month.',
    mix: [['price_too_high', 16], ['switched_competitor', 14], ['business_closed', 12], ['champion_left', 10], ['payment_failed', 7], ['not_using', 8], ['bugs_reliability', 6], ['never_activated', 6], ['outgrew_product', 6], ['poor_support', 5], ['budget_cut', 5], ['owner_retired_or_sold', 5]],
    signals: [['business_volume_decline', 28, 42], 'champion_departure', 'failed_payment', 'seat_decline', 'outage_incident'],
    tactics: ['pause_plan', 'flex_usage_pricing', 'multi_thread_second_contact', 'dunning_retries'],
    sourced: [
      'Regis averaged about 50 store closures a quarter [unverified] (https://finance.yahoo.com/economy/articles/104-old-national-hair-salon-140700487.html, undated)',
      'F45 franchisee Mad Fitness Group filed Chapter 11 in August 2026; Nike Studios closed all locations after about three years [unverified for snippet dates] (https://athletechnews.com/f45-franchisee-mad-fitness-group-files-for-chapter-11-bankruptcy/, 2026)',
      'Capterra review: Vagaro added fees and an outage stopped check-in and checkout during business hours [unverified, anecdotal] (https://www.capterra.com/p/153752/Vagaro/reviews/?page=18, 2025)',
    ],
    design: ['Annual logo churn 20-35% monthly plans, 10-15% annual contracts [design]', 'Reason mix [design]; champion_left means the stylist, instructor or studio manager who ran the account', 'Phorest survey: 45% of 1,000 salon owners had considered closing [unverified, undated, likely pre-2025, no URL kept]', 'No published save rates'],
  }),
  trades: seg({
    churn: [0.15, 0.45], invRange: [0.15, 0.25], renewal: false, fy: false, months: [11, 12, 1, 2], early: 3.0,
    note: 'Monthly, no notice period. Cancellations cluster in the winter off-season for roofing and cooling work; onboarding failures cluster in the first 90 days; dunning window 1-3 weeks.',
    mix: [['business_closed', 14], ['payment_failed', 14], ['seasonal_pause', 10], ['not_using', 12], ['price_too_high', 9], ['switched_competitor', 8], ['never_activated', 8], ['owner_retired_or_sold', 6], ['missing_feature', 6], ['bugs_reliability', 4], ['poor_support', 3], ['consolidated_vendors', 3], ['outgrew_product', 3]],
    signals: [['business_volume_decline', 14, 60], ['usage_drop', 14, 30], 'failed_payment', 'seat_decline', 'season_end', 'closure_news'],
    tactics: [['pause_plan', 0.3], 'dunning_retries', 'card_updater', 'annual_prepay_switch', 'flex_usage_pricing'],
    evidence: 'proxy',
    sourced: [
      'ServiceTitan gross dollar retention above 95% in each of its last 10 quarters, only for customers above $10K annualized billings (S-1, period ended 2024-07-31: https://www.sec.gov/Archives/edgar/data/1638826/000119312524260611/d577298ds1.htm)',
      'SaaS Capital: a 95% quarterly figure compounds to about 81.5% annually and ServiceTitan excludes downgrades; 75-80% GRR is strong for small-business software (https://www.saas-capital.com/blog-posts/how-to-have-a-95-gross-revenue-retention-selling-saas-to-small-businesses/, 2024-12-10)',
      'Churnkey/Stripe: involuntary is 22% of all SaaS churn, 16% for B2B, 26% for AOV $30-100 and 35% under $10 (https://churnkey.co/blog/involuntary-churn-benchmarks, 2025-11-14, updated 2025-12-12)',
      'Optifai 2026 (N=939): SMB SaaS 3-7% monthly, 30-58% annual [unverified] (https://stealthagents.com/research/saas-churn-rate-statistics-2026, 2026)',
      'Contractor+ offers account credits for reactivation [unverified] (https://support.contractorplus.app/en/articles/11429067-how-to-cancel-your-contractor-membership)',
    ],
    design: ['Annual logo churn 30-45% monthly plans, 1.5-2.5x lower on annual prepay [design]', 'Seasonal pause converts 20-40% of would-be seasonal cancels [design]', 'Reason mix [design]'],
  }),
  trucking: seg({
    churn: [0.05, 0.45], invRange: [0.15, 0.25], renewal: false, fy: false, months: [], early: 2.5,
    note: 'Follows freight-market cycles, not renewals. Small carriers vanish without notice; mid-size fleets give 60-90 days around a renewal or the end of a ~36-month hardware lease.',
    mix: [['business_closed', 24], ['payment_failed', 10], ['price_too_high', 9], ['switched_competitor', 8], ['acquired_or_merged', 7], ['not_using', 6], ['consolidated_vendors', 6], ['bugs_reliability', 6], ['never_activated', 6], ['owner_retired_or_sold', 6], ['poor_support', 5], ['missing_feature', 4], ['regulation_change', 3]],
    signals: [['closure_news', 0, 60], ['seat_decline', 14, 60], ['usage_drop', 7, 30], 'regulatory_change', 'failed_payment', 'slow_invoice_payment'],
    tactics: ['flex_usage_pricing', 'multi_year_price_lock', 'dunning_retries', 'downgrade_offer'],
    evidence: 'proxy',
    sourced: [
      'Motive net dollar retention 109-110% (Core, ARR above $7,500) and 125-126% (Large, above $100K) (S-1, data to 2025-09-30: https://www.sec.gov/Archives/edgar/data/1646681/000162828025058773/motive-sx1.htm; https://tomtunguz.com/motive-s-1/)',
      'Samsara FY26 core-customer NRR target about 115% [unverified] (https://www.tipranks.com/news/the-fly/samsara-sees-q1-annual-recurring-revenue-down-from-q4)',
      'FreightWaves SONAR: about 838 net revocations a week as of 2026-05-15 (the same article gives both "30% below the 2025 average" and "31% above 2025": conflicting) [unverified] (https://www.freightwaves.com/news/fmcsa-removes-five-elds-warns-fleets-to-switch-by-dec-16, 2026)',
      'FMCSA revoked 24 ELDs by mid-2025, the most since 2018 [unverified] (https://www.freightwaves.com/news/fmcsa-pulls-three-more-elds-from-the-approved-list, 2025)',
      'Epiq AACER H1 2026: total US filings +12%, commercial Chapter 11 +28% (https://www.abfjournal.com/epiq-total-bankruptcy-filings-increase-12-in-h1-26/, 2026)',
    ],
    design: ['Annual logo churn 25-45% for small carriers, 5-10% for fleets above 50 units [design]', 'Reason mix [design]; regulation_change = forced ELD swap counted as churn for the old vendor'],
  }),
  general_contractors: seg({
    churn: [0.1, 0.25], invRange: [0.1, 0.15], renewal: true, fy: true, months: [11, 12, 1], early: 1.8,
    note: 'Churn clusters at project completion and calendar/fiscal year-end (software budgets reviewed in Q4 and Q1); 60-90 days notice through procurement; dunning window 1-3 weeks.',
    mix: [['project_completed_no_renewal', 14], ['switched_competitor', 12], ['business_closed', 12], ['consolidated_vendors', 10], ['budget_cut', 7], ['acquired_or_merged', 8], ['champion_left', 8], ['missing_feature', 8], ['never_activated', 6], ['price_too_high', 6], ['poor_support', 5], ['payment_failed', 4]],
    signals: [['business_volume_decline', 30, 60], 'champion_departure', 'acquisition_news', 'usage_drop', 'term_end_approaching'],
    tactics: ['flex_usage_pricing', 'multi_thread_second_contact', 'exec_outreach', 'multi_year_price_lock'],
    evidence: 'proxy',
    sourced: [
      'Procore FY2025 gross revenue retention 95%, net 106% (preliminary Q4 release, https://www.businesswire.com/news/home/20260212491358/en/, 2026-02-12); a larger multi-module base, so a ceiling for a small GC tool',
      'Motive S-1 NDR 109-126% by customer size (https://www.sec.gov/Archives/edgar/data/1646681/000162828025058773/motive-sx1.htm, data to 2025-09-30); net of churn, so it does not isolate churn',
      'Construction firm 5-year survival 46.2% (1996-97 founders) vs 59.3% (2016-17) [unverified, BLS-based via eSub] (https://esub.com/blog/construction-business-software)',
      'Autodesk reseller says cost and workflow fit drive Procore to ACC moves [unverified, promotional] (https://resources.imaginit.com/building-solutions-blog/why-organizations-are-switching-from-procore-to-autodesk-construction-cloud-acc)',
    ],
    design: ['Annual logo churn 15-25% (range widened to 10% to include Procore-style larger accounts); monthly plans 2-4% a month [design]', 'Reason mix [design]; project_completed_no_renewal is segment-specific'],
  }),
  health_practices: seg({
    churn: [0.12, 0.2], invRange: [0.15, 0.25], renewal: true, fy: false, months: [7, 8, 12], early: 2.0,
    note: 'Voluntary churn clusters at the annual renewal date and in the first 90 days after go-live; acquisitions close 60-120 days after the first signal and the group may give 30-90 days notice; involuntary at card expiry.',
    mix: [['acquired_or_merged', 18], ['switched_competitor', 10], ['price_too_high', 9], ['payment_failed', 9], ['business_closed', 12], ['owner_retired_or_sold', 8], ['champion_left', 8], ['not_using', 8], ['never_activated', 5], ['poor_support', 5], ['bugs_reliability', 5], ['missing_feature', 3]],
    signals: [['acquisition_news', 60, 120], 'champion_departure', 'usage_drop', 'failed_payment', 'support_ticket_spike'],
    tactics: [['pre_close_buyer_outreach', 0.25], ['downgrade_offer', 0.2], 'pause_plan', 'dunning_retries'],
    evidence: 'proxy',
    sourced: [
      'Weave: dollar-based net retention 93% and gross retention 89% at 2025-12-31; Q3 2025 GRR 90% vs 92% a year earlier (https://www.businesswire.com/news/home/20260218591820/en/Weave-Announces-Fourth-Quarter-and-Full-Year-2025-Financial-Results/, 2026-02-18; Q3 detail via https://fintool.com/app/research/companies/WEAV/earnings/Q3%202025 [secondary])',
      'About 13% of US dentists are DSO-affiliated (ADA HPI via Becker\'s, https://www.beckersdental.com/dentists/41051-13-of-dentists-are-affiliated-with-dsos-7-things-to-know.html, undated); more than 1 in 4 dentists within 10 years of school in 2024 (https://adanews.ada.org/new-dentist/2025/november/hpi-more-new-dentists-affiliated-with-dsos/, 2025-11)',
      '25% to nearly 50% of US vet practices are corporate-owned, definitions differ (https://www.economicliberties.us/our-work/the-save-our-pets-act-stopping-the-corporate-takeover-of-veterinary-practices/, 2025-05; https://www.frontiersin.org/journals/veterinary-science/articles/10.3389/fvets.2025.1558745/full, 2025)',
      'A DSO merged 67 acquired practices onto its practice-management system (https://www.beckersdental.com/dso-dpms/pennsylvania-dso-merges-67-acquired-practices-to-practice-management-system/, undated)',
      'Churnkey: insufficient funds 40.5% of about 5M failed subscription payments [unverified] (https://churnkey.co/blog/involuntary-churn-benchmarks); champion departure then 51% churn within 12 months [unverified] (https://research.stripo.email/enterprise-saas-churn-rate-benchmarks-2026, 2026-06)',
    ],
    design: ['Annual logo churn 12-20% (2-4% a month on monthly plans); revenue churn 3-6 points lower [design]', 'Reason mix [design]; Weave GRR 89% implies about 11% gross revenue loss, consistent with the range', 'Pause/downgrade retains 15-25% of at-risk accounts; dunning recovers 30-50% of failed payments [design]'],
  }),
  hospitals: seg({
    churn: [0.03, 0.06], inv: 0.02, invRange: [0.01, 0.03], renewal: true, fy: true, months: [7, 10], early: 1.1,
    note: 'Rare mid-contract; concentrated at term end and in the 60-120 days before it when an RFP is issued. Budget decisions land at fiscal-year start (often July 1 or October 1). Merger rationalisation lags 12-24 months.',
    mix: [['contract_term_end_rfp', 22], ['consolidated_vendors', 18], ['acquired_or_merged', 14], ['champion_left', 12], ['budget_cut', 10], ['switched_competitor', 6], ['poor_support', 4], ['missing_feature', 5], ['bugs_reliability', 3], ['security_or_compliance', 3], ['regulation_change', 3]],
    signals: [['rfp_posted', 90, 180], ['term_end_approaching', 180, 365], 'exec_sponsor_change', 'acquisition_news', 'seat_decline', ['budget_review', 60, 120]],
    tactics: ['early_renewal_extension', 'exec_outreach', 'multi_thread_second_contact', 'compliance_package'],
    sourced: [
      'KLAS: deep adopters consolidated RCM suites for "vendor consolidation" and "stronger vendor relationship" (each 57%), pricing 43% (https://healthsystemcio.com/2026/07/21/rcm-suite-consolidation-partnership/, 2026-07-21)',
      'Hospitals making new EHR decisions fell 40% in 2025 vs 2024 and 50% vs 2023; only two systems with 10+ hospitals made enterprise EHR decisions, both Epic [snippet only, page returned 403] (https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/are-big-health-systems-done-switching-ehrs/)',
      'Chartis 2025: 46% of rural hospitals operating at a loss, 432 vulnerable to closure (https://www.fiercehealthcare.com/providers/46-rural-hospitals-red-432-vulnerable-closure-report-finds, 2025-02)',
      'Federal Medicaid cuts about $911B over a decade, most impact 2027 and later (Capstone, https://capstonedc.com/wp-content/uploads/2025/12/Provider-2026-Preview-Web.pdf, 2025-12); $80B provider revenue loss in 2026 is a projection [unverified] (Becker\'s)',
      'Champion departure then 51% churn within 12 months, executive sponsor departure 65% [unverified vendor report] (https://research.stripo.email/enterprise-saas-churn-rate-benchmarks-2026, 2026-06)',
    ],
    design: ['Annual logo churn 3-6%, revenue churn 2-5% [design]', 'Reason mix [design]; involuntary 1-3% (invoice and PO) [design]', 'No public save rates for health-system software'],
  }),
  pharma: seg({
    churn: [0.03, 0.25], inv: 0.02, invRange: [0.0, 0.03], renewal: true, fy: true, months: [11, 12, 1], early: 1.2,
    note: 'Biotech churn is a sudden event (shutdown notice, asset sale) with 30 days or less notice; pharma churn follows multi-year platform migrations with 12-36 months notice; budgets set on the calendar year.',
    mix: [['business_closed', 22], ['budget_cut', 15], ['acquired_or_merged', 14], ['funding_ended', 10], ['consolidated_vendors', 9], ['contract_term_end_rfp', 8], ['switched_competitor', 7], ['not_using', 6], ['champion_left', 5], ['security_or_compliance', 4]],
    signals: [['funding_cliff', 60, 270], 'layoffs_or_freeze', 'champion_departure', 'acquisition_news', 'usage_drop'],
    tactics: ['downgrade_offer', 'multi_year_price_lock', 'compliance_package', 'pause_plan'],
    sourced: [
      'About 42,700 biopharma employees affected by cuts in 2025, +47.1% YoY (https://www.biospace.com/job-trends/biopharmas-axed-47-more-employees-year-over-year, 2025)',
      'Fierce Biotech graveyard: 19 biotech closures in 2025, 22 in 2024, a record 27 in 2023 (https://www.fiercebiotech.com/special-reports/2025-biotech-graveyard, late 2025 or Jan 2026)',
      '17 biopharma layoff announcements Apr-Jun 2026 vs 64 in Q2 2025 (https://www.fiercebiotech.com/biotech/biotechs-better-position-avoid-workforce-reductions-layoffs-continue-drop-q226, Q2 2026)',
      'Veeva separated from Salesforce Sept 2025, customers have a transition window to 2030; Salesforce claims 40+ pharma clients on Life Sciences Cloud (self-reported) (https://intuitionlabs.ai/articles/veeva-vault-crm-migration-roadmap, 2025); Veeva claims nine committed top-20 CRM customers (self-reported, https://www.nasdaq.com/articles/veeva-systems-lifts-outlook-crm-wins)',
      'Benchling cut 9% of staff (https://www.clinicaltrialsarena.com/news/life-sciences-software-company-benchling-trims-workforce-by-9/)',
    ],
    design: ['Annual logo churn 15-25% for small and mid biotechs, 3-8% for large pharma [design]', 'Reason mix [design]; involuntary under 3% (invoice) [design]', 'No public save rates for life-sciences software'],
  }),
  law_firms: seg({
    churn: [0.12, 0.2], invRange: [0.1, 0.15], renewal: true, fy: true, months: [11, 12, 1], early: 2.0,
    note: 'Annual renewal and calendar year-end budget planning. Annual plans give no notice; monthly plans about 30 days. Data migration from the prior system is the main onboarding failure in the first 90 days.',
    mix: [['switched_competitor', 18], ['price_too_high', 14], ['not_using', 12], ['champion_left', 10], ['missing_feature', 8], ['acquired_or_merged', 8], ['poor_support', 6], ['never_activated', 6], ['owner_retired_or_sold', 6], ['business_closed', 5], ['payment_failed', 4], ['bugs_reliability', 3]],
    signals: ['seat_decline', 'usage_drop', 'champion_departure', 'failed_payment', 'owner_succession'],
    tactics: ['annual_prepay_switch', 'downgrade_offer', 'onboarding_rescue', 'integration_switching_cost'],
    sourced: [
      'Churnkey State of Retention 2025: voluntary about 7% a month, involuntary about 1% a month on average across its (unsegmented) dataset, yet it also says involuntary "can easily comprise 40%" of churn: the two statements do not match (https://churnkey.co/reports/state-of-retention-2025, data year 2024, page updated 2026-09-11)',
      'Clio reports more than US$500M ARR and discloses no churn (https://www.clio.com/?p=56400, 2025-2026); third-party Clio SMB retention of about 96% is from low-quality sites [unverified]',
      'ABA 2025: 73% of firms use cloud legal tools (https://www.americanbar.org/news/abanews/aba-news-archives/2025/03/aba-releases-survey-tech-trends/, 2025-03)',
      'Capterra review: moved away from PracticePanther mainly because cancelling required a support call (https://www.capterra.com/p/140231/PracticePanther-Legal-Software/reviews/?page=10, undated); Dewey B Strategic survey (n=87) cited high cost and low usage (https://www.deweybstrategic.com/?p=7889, 2020) [unverified]',
    ],
    design: ['Annual logo churn 12-20%, revenue churn 8-12%, monthly plans 2-3x annual [design]', 'Reason mix [design]; cancellation friction distorts stated reasons, so treat switched and price as floors'],
  }),
  accounting_firms: seg({
    churn: [0.08, 0.15], invRange: [0.08, 0.12], renewal: true, fy: false, months: [5, 6, 9, 10], early: 1.8,
    note: 'Two decision windows: May-June (season review, preparers have left) and September-December (budget for next season). Largest drop in seats and logins May-August. Notice is short; many cancel by email at renewal.',
    mix: [['not_using', 14], ['price_too_high', 14], ['switched_competitor', 14], ['poor_support', 10], ['consolidated_vendors', 8], ['business_closed', 8], ['bugs_reliability', 7], ['outgrew_product', 6], ['champion_left', 6], ['acquired_or_merged', 6], ['security_or_compliance', 4], ['payment_failed', 3]],
    signals: [['usage_drop', 30, 90], 'seat_decline', 'champion_departure', 'support_silence', 'competitor_pitch', 'season_end'],
    tactics: [['pause_plan', 0.3], 'annual_prepay_switch', 'onboarding_rescue', 'fix_and_credit', 'multi_thread_second_contact'],
    sourced: [
      'CPA firms patch post-season breakage; sponsored item cites crashes and remote-access failures at small firms (https://www.cpapracticeadvisor.com/2026/02/24/what-cpa-firms-miss-when-preparing-for-tax-season/178747/, 2026-02-24)',
      'AICPA 2025 National MAP Survey (released 2025-11) is the place to look for firm-level retention; figures not retrieved (https://www.aicpa-cima.com/resources/article/key-small-firm-insights-in-the-2025-national-map-survey)',
    ],
    design: ['Annual logo churn 8-15% for firm-level software, 25-35% for monthly client-portal tools [design]', 'Dormant off-season plan at about 30-50% of list price [design]', 'TaxDome cites 98% client retention on a third-party comparison page, no methodology [unverified]; a TaxDome-sponsored claim that 90% of switching clients cannot get answers [unverified, origin not traced]', 'Reason mix [design]'],
  }),
  real_estate: seg({
    churn: [0.15, 0.6], invRange: [0.05, 0.1], renewal: true, fy: true, months: [12, 1, 2], early: 2.5,
    note: 'Brokerage contracts commonly start and end in January; agent exits cluster around licence renewal dates and the slow winter months. Notice is usually none: agents stop paying and disappear.',
    mix: [['business_closed', 10], ['owner_retired_or_sold', 6], ['champion_left', 14], ['budget_cut', 12], ['not_using', 12], ['platform_built_in', 10], ['switched_competitor', 10], ['price_too_high', 8], ['missing_feature', 6], ['payment_failed', 5], ['acquired_or_merged', 4], ['poor_support', 3]],
    signals: [['business_volume_decline', 60, 180], 'champion_departure', 'failed_payment', 'platform_announcement', 'usage_drop'],
    tactics: ['pause_plan', 'downgrade_offer', 'multi_site_master_contract', 'integration_switching_cost'],
    sourced: [
      'Recruiting Insight / Lone Wolf: 6.8% of productive agents changed in 2025 (6.0% in 2024), external moves 5.5% (https://www.housingwire.com/articles/agent-migration-2025-trends/, 2026)',
      'Courted: about 16% of agents (roughly 230,000) changed brokerages in 2025, stable at 16-18% since 2020 (https://www.housingwire.com/articles/agent-churn-2025-courted/, 2026); the two measures differ in definition (productive agents vs all agents)',
      'Cotality/ResiClub survey (213 agents, Feb-Mar 2026): 92% plan to stay active at least three more years (https://www.resiclubanalytics.com/p/resale-turnover-4-decade-low-real-estate-agents-survey-cotality-resiclub, 2026)',
      'iPro Realty (Ontario, about 2,400 agents) ordered closed by RECO effective 2025-08-19 after a trust-account shortfall (https://reco.on.ca/news/update-for-consumers-and-agents-ipro-closure)',
      'NAR membership -1.7% "in the year to June 2026" [unverified; the cited Inman article is dated 2026-03-30, so the period cannot be right] (https://www.inman.com/2026/03/30/agent-commissions-show-stickiness-nearly-2-years-after-nar-settlement/)',
    ],
    design: ['Per-agent seat tools: 5-8% monthly, 40-60% annual logo churn; per-brokerage tools 15-25% [design]', 'Brokerage-paid tools churn when the agent changes brokerage (about 16% a year)', 'agent_exit_industry in the notes split 10 business_closed / 6 owner_retired_or_sold'],
  }),
  agencies: seg({
    churn: [0.2, 0.35], invRange: [0.03, 0.08], renewal: false, fy: true, months: [12, 1, 2], early: 2.0,
    note: 'Client losses are decided at annual budget cycles (Q4 planning, Q1 reset) and after pitches; the agency\'s SaaS cancellation follows the client loss by 1-2 quarters.',
    mix: [['budget_cut', 20], ['champion_left', 12], ['switched_competitor', 12], ['not_using', 14], ['business_closed', 5], ['acquired_or_merged', 3], ['price_too_high', 8], ['missing_feature', 6], ['consolidated_vendors', 6], ['outgrew_product', 4], ['poor_support', 4], ['payment_failed', 3]],
    signals: [['business_volume_decline', 60, 180], 'seat_decline', 'champion_departure', 'layoffs_or_freeze', 'slow_invoice_payment'],
    tactics: ['flex_usage_pricing', 'pause_plan', 'integration_switching_cost', 'downgrade_offer'],
    sourced: [
      'Gartner CMO Spend Survey (Feb-Mar 2025, n=402): budgets flat at 7.7% of revenue, 39% plan to cut agency budgets, 22% say generative AI reduced their need for outside creative (https://www.businesswire.com/news/home/20250512782208/en, 2025-05-12)',
      'Focus Digital: annual client churn about 33% performance, 28% hybrid, 18% retainer [unverified; year unclear] (https://focus-digital.co/average-churn-rate-by-industry-saas/)',
      'Setup 6th Annual Marketing Relationship Survey (400+ respondents): clients leave over what the agency did; agencies think it is what happened to the client [unverified secondary] (https://everything-pr.com/the-cmo-agency-trust-gap-2026-why-clients-leave-and-why-agencies-dont-see-it-coming, 2026)',
      'Vendasta 2023 via Duda: most agencies see 2-8% churn, period not stated [unverified] (https://blog.duda.co/warning-signs-your-smb-client-might-churn-and-how-to-keep-them)',
      'vcita SMB survey of 500 (https://www.vcita.com/press/smb-survey-highlights-marketing-agency-churn, 2025-04)',
    ],
    design: ['Annual logo churn 20-35%, higher for project-billed agencies [design]', 'Reason mix [design]: the note\'s table sums to 97, normalised here'],
  }),
  ecommerce: seg({
    churn: [0.25, 0.45], inv: 0.15, invRange: [0.08, 0.3], renewal: false, fy: false, months: [1], early: 4.0,
    note: 'Continuous with a steep early-life spike (testing many apps); uninstall is a single event with no lead time; scheduled store cancellation auto-uninstalls every app.',
    mix: [['not_using', 22], ['switched_competitor', 12], ['business_closed', 12], ['platform_built_in', 10], ['price_too_high', 10], ['missing_feature', 8], ['payment_failed', 8], ['never_activated', 6], ['poor_support', 3], ['bugs_reliability', 3], ['consolidated_vendors', 4], ['owner_retired_or_sold', 2]],
    signals: ['plan_downgrade', ['business_volume_decline', 30, 60], ['never_activated_7d', 0, 30], 'platform_announcement', 'login_decay'],
    tactics: ['onboarding_rescue', 'pause_plan', 'downgrade_offer', 'cancel_flow_offer'],
    sourced: [
      'Recurly (July 2026 data) ecommerce total 4.25%, voluntary 2.87%, involuntary 1.38%, period unit not stated [unverified] (https://www.recurly.com/research/churn-rate-benchmarks, accessed 2026-10-14)',
      'About 14% of merchants uninstall a Shopify app within 24 hours and about 35% remain at day 90 [unverified vendor blog] (https://marmeto.com/blogs/news/shopify-app-uninstalls)',
      'Shopify changed uninstall reasons in April 2026; one developer saw 98% of answers as "testing multiple apps" (https://shopify.dev/changelog/update-to-app-uninstall-reasons, 2026)',
      'Scheduled store cancellation auto-uninstalls all third-party apps; filter these out [unverified] (https://community.shopify.dev/t/new-uninstall-reason-scheduled-cancellation/33033)',
      'Shopify Editions 2025 added native features (cart discount codes, Google Ads from the dashboard): vendor marketing claims, no merchant churn data (https://ecommercepartners.com/2025/05/22/top-5-shopify-editions-summer-25-features-every-ecommerce-manager-should-know-and-what-to-ask-your-dev-agency/, 2025-05-22)',
    ],
    design: ['Annual logo churn 25-45% is a synthesis estimate: the note gave no annual figure [design]', 'Reason mix [design]; involuntary set to 15% as a compromise between the note\'s table (8%) and the Recurly-derived 32% share', 'earlyLifeMult 4 from the unverified 14%-in-24h / 35%-at-day-90 figures'],
  }),
  startup_smb: seg({
    churn: [0.12, 0.3], invRange: [0.09, 0.33], renewal: true, fy: false, months: [], early: 2.5,
    note: 'Self-serve monthly or annual; voluntary churn peaks at annual renewal and in the first 90 days; budget moves at quarter start and after funding rounds close; dunning runs 2-4 weeks.',
    mix: [['not_using', 20], ['budget_cut', 15], ['business_closed', 6], ['funding_ended', 6], ['consolidated_vendors', 11], ['switched_competitor', 9], ['payment_failed', 9], ['outgrew_product', 7], ['price_too_high', 6], ['champion_left', 4], ['missing_feature', 4], ['never_activated', 3]],
    signals: ['layoffs_or_freeze', ['usage_drop', 14, 30], 'seat_decline', 'exec_sponsor_change', 'funding_cliff', 'support_silence'],
    tactics: ['pause_plan', 'downgrade_offer', 'annual_prepay_switch', 'dunning_retries'],
    sourced: [
      'Carta recorded 966 closures among its US customers in 2024, up from 769 in 2023 (https://techcrunch.com/2025/01/26/2025-will-likely-be-another-brutal-year-of-failed-startups-data-suggests, 2025-01-26)',
      'Software Finder survey (1,008 US professionals): 38% of firms canceled or downgraded legacy SaaS in 2025, 21% replaced legacy tools with AI-native ones [unverified; firm-wide] (https://www.marketingprofs.com/chirp/2025/53966/how-saas-solution-preferences-are-evolving-infographic, 2025)',
      'Retool 2026 Build vs Buy: 35% of teams replaced at least one SaaS tool with a custom build [unverified, vendor] (https://www.businesswire.com/news/home/20260217548274/en/, 2026-02-17)',
      'Zylo 2025 SaaS Management Index: $4,830 spend per employee, +21.9% YoY (https://zylo.com/news/2025-saas-management-index, 2025-01)',
      'SMB annual logo churn 10-14% (ChartMogul 2025) and 14-22% for ACV under $5K (Paddle/ProfitWell) [unverified, secondary] (https://userjot.com/blog/saas-churn-rate-benchmarks); CB Insights: 70% of 431 venture-backed shutdowns ran out of capital [unverified, secondhand]',
    ],
    design: ['Annual logo churn 12-30% synthesis range from conflicting secondary sources [design]', 'Reason mix [design]; business_closed / funding_ended row (12%) split 6/6', 'Pause or downgrade saves more than discounts because low adoption is the top reason [design]'],
  }),
  mid_market: seg({
    churn: [0.06, 0.15], inv: 0.07, invRange: [0.05, 0.1], renewal: true, fy: true, months: [11, 12], early: 1.3,
    note: 'Churn clusters at the renewal date and the 60-90 days before it; fiscal-year end (often December or June) and Q3-Q4 budget planning are the peak windows for consolidation decisions; without a champion the vendor often gets no notice.',
    mix: [['consolidated_vendors', 18], ['budget_cut', 14], ['champion_left', 13], ['switched_competitor', 11], ['acquired_or_merged', 9], ['not_using', 9], ['missing_feature', 7], ['outgrew_product', 6], ['never_activated', 4], ['contract_term_end_rfp', 4], ['security_or_compliance', 3], ['moved_to_in_house', 2]],
    signals: ['champion_departure', 'exec_sponsor_change', 'seat_decline', 'slow_invoice_payment', 'support_ticket_spike', ['budget_review', 60, 90]],
    tactics: [['exec_outreach', 0.33], 'renewal_survey_and_usage_report', 'multi_year_price_lock', 'integration_switching_cost'],
    sourced: [
      'Annual logo churn 6-15%, 7-12% called healthy [unverified, secondary blogs] (https://meltingspot.io/en/blog/saas-b2b-churn-rate-benchmark)',
      'ChurnZero: about 51% chance of churn within 12 months after a champion leaves, 65% of accounts with an executive change do not renew; executive outreach within 48 hours makes renewal 33% more likely [unverified, secondhand] (https://churnzero.com/blog/customer-churn-risks-2025-monsters)',
      'Torii 2026: firms with 1,500-4,999 employees average 101 tools, spend +8% [unverified; primary report not retrieved] (https://www.cloudmagazin.com/en/2026/02/25/saas-consolidation-how-cios-are-taming-the-tool-jungle/, 2026-02-25)',
      'Zylo 2025 SaaS Management Index: spend per employee +21.9% YoY, app count flat (https://zylo.com/news/2025-saas-management-index, 2025-01)',
    ],
    design: ['Involuntary 5-10% (invoiced annual contracts) [design]', 'Reason mix [design]', 'QBR 90 days before renewal is the main consolidation defence; save rate unknown'],
  }),
  enterprise: seg({
    churn: [0.02, 0.05], inv: 0.01, invRange: [0.0, 0.02], renewal: true, fy: true, months: [12], early: 1.1,
    note: 'Decided at the renewal date and the RFP award, which often falls 3-9 months before term end; fiscal-year ends are budget lock points; 90-180 days notice in most large contracts.',
    mix: [['contract_term_end_rfp', 22], ['consolidated_vendors', 20], ['budget_cut', 15], ['acquired_or_merged', 10], ['champion_left', 8], ['switched_competitor', 8], ['moved_to_in_house', 5], ['security_or_compliance', 4], ['missing_feature', 3], ['not_using', 3], ['poor_support', 1], ['regulation_change', 1]],
    signals: [['rfp_posted', 180, 365], 'exec_sponsor_change', 'acquisition_news', ['budget_review', 90, 270], 'seat_decline'],
    tactics: ['early_renewal_extension', 'multi_year_price_lock', 'integration_switching_cost', 'rfp_defense'],
    sourced: [
      'Enterprise annual logo churn 2-5% (ChartMogul 2025 via a secondary blog) and 3.2% above $50K ACV [unverified] (https://userjot.com/blog/saas-churn-rate-benchmarks)',
      'Vendr (15,817 transactions, Jan 2024 to Mar 2026): median renewal price -8% ($27K to $24K), median new-deal size -43% ($11K to $6K) [unverified: gated, from the summary; a "2025" report with data to Mar 2026] (https://www.vendr.com/resources/trends-report)',
      'Flexera citing BetterCloud: enterprises cut SaaS applications by 18% in 2025 and 82% are consolidating vendors [unverified] (https://www.flexera.com/solutions/financial-services, 2025)',
      'CloudBolt survey (2026-01, n=302, 1,000+ employee firms): 4% fully replaced VMware, 86% reducing use, 59% saw 25-49% price increases [unverified; vendor sells migration tools] (https://www.channelinsider.com/infrastructure/cloudbolt-vmware-survey-reducing-usage/)',
      'ServiceTitan GDR above 95% is a trades figure, not Fortune 500 (https://www.sec.gov/Archives/edgar/data/1638826/000119312524260611/d577298ds1.htm, S-1 period ended 2024-07-31)',
    ],
    design: ['Revenue churn below logo churn because large accounts stay; involuntary near zero (AP invoices) [design]', 'Reason mix [design]', 'No save-rate data for F500 renewals'],
  }),
  hotels: seg({
    churn: [0.15, 0.25], invRange: [0.03, 0.06], renewal: false, fy: true, months: [9, 10, 1], early: 1.5,
    note: 'Follows the management agreement term (often 5-15 years) or a sale closing; more churn after the summer peak and in January; the new owner or manager often gives 30 days or less.',
    mix: [['acquired_or_merged', 18], ['franchisor_mandated_switch', 16], ['champion_left', 14], ['management_change', 12], ['switched_competitor', 10], ['not_using', 8], ['missing_feature', 7], ['bugs_reliability', 2.5], ['poor_support', 2.5], ['budget_cut', 5], ['payment_failed', 5]],
    signals: ['acquisition_news', 'brand_mandate', 'champion_departure', ['usage_drop', 14, 45], 'outage_incident'],
    tactics: [['pre_close_buyer_outreach', 0.5], 'multi_site_master_contract', 'approved_vendor_listing', 'integration_switching_cost'],
    sourced: [
      'Service Properties Trust\'s 2025 sale of managed Sonesta hotels to franchise partners (113 or 114 properties, reports differ) [unverified] (https://asianhospitality.com/sonesta-to-franchise-114-managed-properties-following-svc-sale, 2025)',
      'Braemar converted the Sofitel Chicago Magnificent Mile to a franchise agreement in April 2025, same operator (https://www.sec.gov/Archives/edgar/data/1574085/000157408525000029/bhr-20250403.htm, 2025-04-03)',
      'Hilton Durban left the Hilton portfolio after the owner ended the management agreement (https://themercury.co.za/business/2026-02-10-hilton-hotel-in-durban-no-longer-part-of-hilton-portfolio, 2026-02-10)',
      'Hotel management agreements run 5-15 years; termination fee often a multiple of prior-12-month gross revenue [unverified] (https://www.mishcon.com/news/hospitality-matters-hotel-agreements)',
      '2026 Hotel Tech Report: 48% of hotels would switch PMS vendors over reliability, 42% over cybersecurity [unverified] (https://hoteltechreport.com/news/2026-hotel-pms-report, 2026)',
    ],
    design: ['Annual logo churn 15-25%, revenue churn 10-18% [design]', 'Reason mix [design]; the note\'s "platform_built_in / brand-mandated" row (16%) is mapped to franchisor_mandated_switch', 'Pre-sale return figure to the new owner saves 40-60% of acquisition-driven losses [design]'],
  }),
  franchise_systems: seg({
    churn: [0.1, 0.2], invRange: [0.02, 0.05], renewal: false, fy: false, months: [], early: 2.0,
    note: 'Mandated switches arrive with a franchisor deadline of 6-18 months at the franchisee\'s expense; closures at lease end or after a bad year (a unit closes with 1-4 weeks notice and no formal cancellation).',
    mix: [['business_closed', 22], ['franchisor_mandated_switch', 20], ['owner_retired_or_sold', 12], ['platform_built_in', 10], ['consolidated_vendors', 8], ['budget_cut', 7], ['not_using', 6], ['champion_left', 5], ['switched_competitor', 4], ['payment_failed', 3], ['missing_feature', 1.5], ['poor_support', 1.5]],
    signals: [['brand_mandate', 180, 540], 'closure_news', 'usage_drop', 'acquisition_news', 'failed_payment'],
    tactics: ['approved_vendor_listing', 'discount_offer', 'pause_plan', 'downgrade_offer'],
    sourced: [
      'Median annual franchised-outlet closure rate 3.2% across 1,446 brands [unverified aggregator] (https://www.webtonic.io/blog/franchise-lifecycle-and-retention-marketing-statistics, 2026)',
      'Dickey\'s closed 97 franchised units and opened 12 in fiscal 2024 [unverified; the cited QSR URL slug says 85] (https://www.qsrmagazine.com/story/dickeys-barbecue-closes-85-u-s-franchised-restaurants/, 2025)',
      'Subway closed at least 729 stores; several franchisee bankruptcies [unverified] (https://finance.yahoo.com/markets/stocks/articles/subway-closed-least-729-stores-105300180.html, 2026)',
      'Franchisors can mandate prescribed technology if disclosed in the FDD [unverified] (https://cfa.ca/start-me-up-considerations-for-franchisors-when-mandating-the-use-of-software-by-franchisees/, 2025-03; https://www.heritagelawwi.com/force-franchisee-to-buy-specific-pos-system); closures and terminations are reported in FDD Item 20 [unverified] (https://afranchisecoach.com/glossaries/item-20/)',
    ],
    design: ['Annual logo churn 10-20%, revenue churn 8-15% [design]', 'Reason mix [design]', 'Approved-vendor listing: 30-50% of mandated switches where already listed [design]'],
  }),
  banks: seg({
    churn: [0.06, 0.1], inv: 0.03, invRange: [0.02, 0.05], renewal: true, fy: true, months: [], early: 1.2,
    note: 'Annual or 3-5 year contracts; churn clusters at contract end and at merger close (6-12 months after announcement). An acquirer can order exits with little notice (90-180 days when the FI controls the decision). Termination fees scale with remaining term.',
    mix: [['acquired_or_merged', 22], ['consolidated_vendors', 14], ['contract_term_end_rfp', 12], ['switched_competitor', 10], ['champion_left', 8], ['budget_cut', 7], ['missing_feature', 6], ['poor_support', 6], ['security_or_compliance', 4], ['never_activated', 4], ['not_using', 4], ['bugs_reliability', 3]],
    signals: [['acquisition_news', 90, 365], 'champion_departure', 'seat_decline', ['rfp_posted', 180, 365], 'exec_sponsor_change'],
    tactics: [['pre_close_buyer_outreach', 0.27], 'integration_switching_cost', 'multi_year_price_lock', 'flex_usage_pricing'],
    sourced: [
      'ABA 2024 Core Platforms Survey: 69% of bankers likely to stay with their core at renewal, 19% likely to switch; satisfaction falls the longer a contract runs, to 41% within two years of renewal (https://bankingjournal.aba.com/2025/07/aba-survey-most-banks-likely-to-stick-with-current-core-provider/, 2025-07-02)',
      'Community bank sellers completed 127 mergers in 2025, the most since 2021 [from search summary; PDF did not parse] (https://www.kansascityfed.org/documents/14360/Community_Banking_Bulletin_Highlight_-_Jan_2026_-_MA_U7KPMwX.pdf, 2026-01)',
      '157 credit union mergers in 2025 with $45B merged assets [unverified podcast transcript] (https://withflyingcolors.transistor.fm/348, 2026); federally insured CU count 4,455 to 4,287 during 2025 [unverified] (https://walnutinvest.com/stats/credit-union-statistics, 2026)',
      'Termination fees scale with remaining term, so exits cluster at term end (American Banker https://www.americanbanker.com/news/tech-contracts-creating-tangle-of-troubles-in-m-amp-a-deals, undated; Barclay Damon https://barclaydamon.com/news/credit-union-times-breaking-free-strategies-for-credit-unions-to-navigate-vendor-terminations, 2024-08)',
      'Cross-industry B2B SaaS churn 3.5% (2.6% voluntary, 0.8% involuntary) per Recurly 2025 via Vitally [unverified] (https://www.vitally.io/post/saas-churn-benchmarks, 2025-04-23)',
    ],
    design: ['Annual logo churn 6-10%, revenue churn 4-7% [design]', 'Reason mix [design]; save rate 20-35% if reached pre-close, under 10% after the acquirer decides [design]'],
  }),
  insurance: seg({
    churn: [0.02, 0.1], inv: 0.04, invRange: [0.03, 0.05], renewal: false, fy: false, months: [], early: 1.3,
    note: 'Acquired agencies often churn at close or at the first AMS renewal after close; retention earnouts (1-3 years) can hold the old system until the earnout ends; notice is usually none because the acquirer decides.',
    mix: [['acquired_or_merged', 30], ['consolidated_vendors', 16], ['owner_retired_or_sold', 12], ['champion_left', 10], ['switched_competitor', 9], ['missing_feature', 6], ['budget_cut', 5], ['poor_support', 4], ['outgrew_product', 3], ['security_or_compliance', 3], ['business_closed', 2]],
    signals: [['acquisition_news', 60, 365], 'owner_succession', 'champion_departure', 'business_volume_decline', 'seat_decline'],
    tactics: [['pre_close_buyer_outreach', 0.2], 'multi_thread_second_contact', 'flex_usage_pricing', 'multi_site_master_contract'],
    sourced: [
      'Equal Parts moves acquired agencies onto its in-house operating system (https://www.axios.com/pro/fintech-deals/2026/02/10/equal-parts-25m-insurance-rollup, 2026-02-10); Applied Systems acquired EZLynx, a competing AMS (https://www.insurancebusinessmag.com/us/news/technology/applied-systems-announces-acquisition-of-ezlynx-243576.aspx, 2026)',
      '695 announced insurance distribution deals in 2025, -12%, 95 unique buyers [unverified secondary blog] (https://www.sonant.ai/blog/insurance-industry-consolidation)',
      'Independent agencies fell from about 39,000 (2024) to about 37,000 (2026) per Big I Agency Universe Study via ACT [unverified; search summary] (https://www.independentagent.com/wp-content/uploads/2026/02/26_ACT_TechTrendsReport.pdf, 2026-02)',
      'HawkSoft: the AMS is the hardest system to change after an acquisition, so migration is planned and can be delayed (https://blog.hawksoft.com/considerations-during-agency-acquisition-or-merge, undated); earnouts run 1-3 years [unverified] (https://acquisitionstars.com/blog/insurance-agency-book-of-business-diligence-ma)',
    ],
    design: ['Agency SaaS 6-10% annual logo churn; carriers 2-5% [design]', 'Reason mix [design]; save rate 15-25% of acquired agencies if reached before the buyer\'s tech decision [design]'],
  }),
  manufacturing: seg({
    churn: [0.08, 0.14], inv: 0.045, invRange: [0.03, 0.06], renewal: false, fy: false, months: [], early: 1.5,
    note: 'Mid-market plants renew annually but closures and acquisitions interrupt at any point; parent-driven moves follow the parent\'s ERP timeline (12-24 months after acquisition); plant closures give weeks of notice and the vendor often learns after the fact.',
    mix: [['business_closed', 14], ['acquired_or_merged', 16], ['consolidated_vendors', 12], ['not_using', 9], ['bugs_reliability', 8], ['budget_cut', 8], ['champion_left', 7], ['switched_competitor', 7], ['missing_feature', 7], ['never_activated', 6], ['contract_term_end_rfp', 3], ['outgrew_product', 3]],
    signals: ['seat_decline', ['acquisition_news', 90, 365], 'layoffs_or_freeze', 'champion_departure', ['usage_drop', 14, 45], 'closure_news'],
    tactics: [['flex_usage_pricing', 0.32], ['pre_close_buyer_outreach', 0.12], 'multi_site_master_contract', 'integration_switching_cost'],
    sourced: [
      'About 34.7% of establishments born in 2013 were still operating in 2023 (BLS TED, https://www.bls.gov/opub/ted/2024/34-7-percent-of-business-establishments-born-in-2013-were-still-operating-in-2023.htm, 2024; from the title, not fetched); 5-year survival 51.4% for March 2020 establishments [unverified, third-party reading] (https://startbusinessbystate.com/business-survival-rates-by-state, 2025)',
      'Plant Services 2025 roundups of closures: Akebono Brake Kentucky (about 450 jobs), TransAxle 16 US sites (209 jobs), Hubbell Illinois (110 jobs) (https://www.plantservices.com/roundup/article/55292914/factory-fallout-manufacturing-plant-closures-and-layoffs-from-chevron-transaxle-denka-and-more, 2025)',
      'MES buyers increasingly favor integrated suites from large ERP and OT vendors (Gartner MES market guide, undated); Emerson/AspenTech, Vista/Amtech, GE Vernova Proficy sale to TPG show MES consolidation (ABI Research 2025; Houlihan Lokey fall 2025: https://cdn.hl.com/pdf/2025/hl-industrial-software-market-update-2025-fall.pdf)',
    ],
    design: ['Plant SaaS 8-14% annual logo churn, revenue churn 6-10% [design]', 'Reason mix [design]; step-down for idle lines saves 25-40% of idle-line churn; acquisition-driven saves under 15% [design]'],
  }),
  utilities: seg({
    churn: [0.03, 0.06], inv: 0.02, invRange: [0.0, 0.03], renewal: true, fy: true, months: [6, 7], early: 1.0,
    note: 'Multi-year terms (5 years plus 1-year extension options) and churn at re-procurement; public RFP gives 9-18 months notice [unverified vendor guidance]; municipal fiscal years often end June 30.',
    mix: [['contract_term_end_rfp', 22], ['acquired_or_merged', 14], ['consolidated_vendors', 12], ['budget_cut', 10], ['regulation_change', 10], ['security_or_compliance', 8], ['switched_competitor', 8], ['missing_feature', 5], ['poor_support', 5], ['champion_left', 4], ['bugs_reliability', 2]],
    signals: [['rfp_posted', 270, 540], ['term_end_approaching', 180, 540], 'regulatory_change', 'acquisition_news', 'exec_sponsor_change'],
    tactics: [['early_renewal_extension', 0.5], ['rfp_defense', 0.22], 'compliance_package', 'cooperative_contract_listing'],
    sourced: [
      'UK water utility award 2025-2030 with extensions to 2035 (https://www.find-tender.service.gov.uk/Notice/009966-2025/PDF, 2025)',
      'Fresno billing system renewal authorises three one-year extensions with increases capped at 10% (https://agendas.fresno.gov/en/legislation/id-24-1489-18776, 2024)',
      'Wollongong NSW extended a seven-year SaaS contract expiring September 2025 instead of re-procuring (https://www.wollongong.nsw.gov.au/__data/assets/pdf_file/0035/269657/Item-3-Extension-of-Contract-One-Council-Enterprise-Software.pdf, 2025)',
      'Yarra Ranges Council replaced three systems with one SaaS suite on a five-year, $7.3M contract [date not confirmed; search summary] (https://www.arnnet.com.au/?p=1256290)',
    ],
    design: ['Annual logo churn 3-6%, revenue churn 2-4% [design]', 'Reason mix [design]; early extension saves 40-60%, an open RFP under 25% [design]'],
  }),
  local_gov: seg({
    churn: [0.06, 0.12], inv: 0.015, invRange: [0.0, 0.02], renewal: true, fy: true, months: [4, 5, 6], early: 1.0,
    note: 'Churn at contract end; fiscal years often end June 30 or September 30; non-renewal notices 60-120 days before, usually via a procurement notice; mid-term termination is rare in a first term.',
    mix: [['contract_term_end_rfp', 30], ['budget_cut', 18], ['champion_left', 14], ['consolidated_vendors', 10], ['missing_feature', 4], ['moved_to_in_house', 4], ['switched_competitor', 7], ['poor_support', 2.5], ['bugs_reliability', 2.5], ['security_or_compliance', 4], ['not_using', 3], ['political_termination', 1]],
    signals: [['rfp_posted', 180, 365], ['term_end_approaching', 180, 365], 'exec_sponsor_change', 'budget_review', 'usage_drop'],
    tactics: [['early_renewal_extension', 0.5], 'cooperative_contract_listing', 'integration_switching_cost', 'multi_thread_second_contact'],
    sourced: [
      'San Francisco OpenGov: a $5.9M award by mayoral directive with no competitive bid (the reverse of a forced rebid) [unverified] (https://sfstandard.com/2026/09/02/san-francisco-opengov-daniel-lurie-contract-software/, 2026-09-02)',
      'Naperville, IL moved e-procurement from DemandStar to OpenGov on 2026-01-05, a staff decision [unverified] (https://www.naperville.il.us/globalassets/media/meeting-agendas-and-minutes/managers-memorandum/mm20251218.pdf, 2025-12-18)',
      'A 3-5x gap between monthly and annual plan churn is a general SaaS pattern [unverified] (https://stealthagents.com/research/saas-churn-rate-statistics-2026, 2026)',
    ],
    design: ['Annual logo churn 6-12%, revenue churn 4-9% [design]', 'Reason mix [design]; pre-rebid engagement 9-12 months out saves 40-60% [design]', 'Other (new administration reverses a purchase, 1%) mapped to political_termination'],
  }),
  state_gov: seg({
    churn: [0.05, 0.1], inv: 0.008, invRange: [0.0, 0.01], renewal: true, fy: true, months: [4, 5, 10], early: 1.0,
    note: 'Most state fiscal years start July 1; decisions and freezes cluster in spring (budget submission) and fall (mid-year revisions); statewide contracts run 3-5 years with options; freezes can take effect with 2-4 weeks notice.',
    mix: [['budget_cut', 28], ['contract_term_end_rfp', 22], ['consolidated_vendors', 12], ['champion_left', 10], ['funding_ended', 8], ['missing_feature', 3], ['moved_to_in_house', 3], ['security_or_compliance', 5], ['switched_competitor', 4], ['poor_support', 1.5], ['bugs_reliability', 1.5], ['regulation_change', 2]],
    signals: ['layoffs_or_freeze', ['budget_review', 30, 120], 'funding_cliff', ['rfp_posted', 180, 365], 'exec_sponsor_change'],
    tactics: [['exemption_mapping', 0.4], ['exec_outreach', 0.4], 'downgrade_offer', 'cooperative_contract_listing'],
    sourced: [
      'California 2023 order required agencies to review IT maintenance and operations contracts, including software licences, and terminate those no longer needed [unverified] (https://meritalkslg.com/articles/california-drops-bombshell-with-state-it-spending-freeze/, 2023)',
      'Washington\'s December 2024 order froze most non-essential service contracts; revenue-generating contracts were exempt [unverified] (https://washingtonstatestandard.com/2024/12/03/wa-gov-inslee-orders-hiring-and-travel-freeze-for-state-agencies/, 2024-12-03)',
      'Nebraska July 2026: added cuts and a hiring freeze after a $172M projected deficit; software contracts not mentioned [unverified] (https://www.kwit.org/podcast/spm-news/2026-07-09/nebraska-governor-pillen-announces-plan-to-address-states-budget-shortfall, 2026-07-09)',
      'ESSER extensions rescinded March 2025, later partly restored; final late-liquidation deadline 2026-03-28 [unverified] (https://thejournal.com/articles/2025/03/31/ed-abruptly-cancels-esser-funding-extensions.aspx, 2025-03-31)',
    ],
    design: ['Annual logo churn 5-10%, revenue churn 3-8% [design]', 'Reason mix [design]; exec outreach saves 30-50% in a soft freeze [design]'],
  }),
  federal: seg({
    churn: [0.08, 0.15], inv: 0.005, invRange: [0.0, 0.01], renewal: true, fy: true, months: [9, 10], early: 1.0,
    note: 'Churn lands at option-year or contract-end dates; the fiscal year ends September 30 with spending pushed into Q4 and a lapse in appropriations landing in October; 30-90 days notice for an unexercised option.',
    mix: [['contract_term_end_rfp', 25], ['budget_cut', 20], ['consolidated_vendors', 14], ['funding_ended', 10], ['champion_left', 8], ['security_or_compliance', 7], ['switched_competitor', 5], ['political_termination', 5], ['missing_feature', 2], ['poor_support', 2], ['not_using', 2]],
    signals: [['rfp_posted', 180, 540], 'funding_cliff', 'regulatory_change', 'exec_sponsor_change', ['term_end_approaching', 90, 365]],
    tactics: ['early_renewal_extension', 'exemption_mapping', 'compliance_package', 'cooperative_contract_listing'],
    sourced: [
      'DOGE cancelled about 1,100 federal contracts in early 2025; reporting later found many saved nothing (https://fortune.com/2025/02/25/doge-canceled-1100-federal-contracts-no-save-government-money, 2025-02-25) [unverified]; some cancelled contracts, including software licences, were revived [unverified] (https://www.yahoo.com/news/more-220-million-contracts-canceled-211240992.html)',
      '43-day shutdown 2025-10-01 to 2025-11-12, then a CR to 2026-01-30 [unverified: Wikipedia] (https://en.wikipedia.org/wiki/2026_United_States_federal_budget); the 20 largest civilian agencies spent 63% less in October 2025 than October 2024 [unverified] (https://washingtontechnology.com/contracts/2025/11/civilian-agency-spending-cratered-during-shutdown/409795/, 2025-11)',
      'OMB memo M-26-10 (2026-03-31) requires CIO review of covered IT contracts [unverified] (https://govciomedia.com/omb-memo-forces-agencies-to-rethink-procurement-oversight/, 2026)',
      'GSA said it would negotiate directly with IT vendors rather than resellers [unverified] (https://washingtontechnology.com/opinion/2025/12/doge-was-government-contractings-biggest-story-2025-and-its-not-close/410372/, 2025-12)',
    ],
    design: ['Annual logo churn 8-15%, revenue churn 6-12% [design]', 'Reason mix [design], with shutdown and DOGE-era shares weighted up for 2025-2026', 'Pre-option call 90 days out is the main save point [design]'],
  }),
  k12: seg({
    churn: [0.15, 0.25], inv: 0.02, invRange: [0.01, 0.1], renewal: true, fy: true, months: [6, 7, 8, 1, 2], early: 1.2,
    note: 'District fiscal year usually July 1 to June 30; renewal decisions cluster late winter to June; spikes in June-August and January-February (budget revisions); teacher-adopted tools can vanish with no notice.',
    mix: [['budget_cut', 22], ['funding_ended', 18], ['consolidated_vendors', 16], ['not_using', 14], ['champion_left', 8], ['contract_term_end_rfp', 8], ['switched_competitor', 5], ['platform_built_in', 4], ['price_too_high', 3], ['acquired_or_merged', 2]],
    signals: [['usage_drop', 60, 120], 'exec_sponsor_change', ['funding_cliff', 120, 365], ['budget_review', 90, 180], 'plan_downgrade'],
    tactics: [['multi_year_price_lock', 0.5], ['downgrade_offer', 0.35], 'grant_funding_relabel', 'renewal_survey_and_usage_report'],
    sourced: [
      'Denver Public Schools cut digital tools from more than 1,000 to 346, saving about $1M, and reviews all apps every two years (EdWeek, https://www.edweek.org/technology/how-this-district-cut-hundreds-of-ed-tech-tools-and-saved-1m/2025/07, 2025-07); LearnPlatform: districts averaged 2,982 tools in 2024-25, up from 2,739 [unverified]',
      'Lighter Capital: education-vertical customer churn doubling from 11% (2024) to 22% (2025), 155 private SaaS startups [unverified: secondary citation via WeAreFounders; the 22% was not visible on Lighter\'s page] (https://www.lightercapital.com/blog/2025-b2b-saas-startup-benchmarks; https://www.wearefounders.uk/saas-churn-rates-and-customer-acquisition-costs-by-industry-2025-data/)',
      'ESSER III liquidation ended with a 2026-03-28 final deadline after 2025 reversals and litigation (The Journal, https://thejournal.com/articles/2025/03/31/ed-abruptly-cancels-esser-funding-extensions.aspx, 2025-03-31) [final date unverified]',
      'Speakable district plans bill annually, no auto-renew unless the order form says so, written cancellation 30 days before renewal [unverified, one vendor] (https://www.speakable.io/policies/cancellation-policy); a Kami teacher found the app on hold after the district stopped buying (https://community.kamihq.com/t/i-think-my-school-is-not-renewing-kami/5750)',
    ],
    design: ['Annual logo churn 15-25% for district central-office tools, 30-50% for teacher-adopted tools; revenue churn 10-15% [design]', 'Reason mix [design]', 'Multi-year lock before budget adoption saves 40-60%; a bridge year saves 30-40% [design]'],
  }),
  higher_ed: seg({
    churn: [0.08, 0.15], inv: 0.01, invRange: [0.0, 0.02], renewal: true, fy: true, months: [3, 4, 5, 6], early: 1.2,
    note: 'Many public universities run July 1 fiscal years so renewals cluster in spring and early summer; academic-year contracts start August or September with decisions January to May; RFP-driven losses give 60-120 days.',
    mix: [['consolidated_vendors', 20], ['budget_cut', 16], ['champion_left', 14], ['not_using', 13], ['acquired_or_merged', 8], ['switched_competitor', 8], ['contract_term_end_rfp', 7], ['missing_feature', 5], ['security_or_compliance', 4], ['outgrew_product', 3], ['platform_built_in', 2]],
    signals: ['exec_sponsor_change', ['rfp_posted', 120, 270], 'security_review_stall', 'usage_drop', ['budget_review', 90, 180]],
    tactics: [['renewal_survey_and_usage_report', 0.42], 'multi_year_price_lock', 'integration_switching_cost', 'multi_thread_second_contact'],
    sourced: [
      'Cost inflation pushes institutions to consolidate vendors and demand clearer ROI [unverified newsletter] (https://higheredintel.substack.com/p/cost-inflation-pressures-campuses, 2025-12)',
      'Ellucian closed its Anthology SIS and ERP acquisition at the end of 2025, adding 260 customers [unverified, vendor-press] (https://erp.today/ellucian-completes-anthology-sis-and-erp-acquisition-adding-260-higher-education-customers/); Anthology\'s enrollment business went to Encoura in early 2026 [unverified]',
      'University of Colorado renewed SAP Concur for three years in 2024 after market research and a user survey, concluding switching costs outweighed benefits (https://www.cu.edu/print/blog/psc-communicator/concur-travel-and-expense-renewal)',
      'University of Salford Mentimeter renewal review notice, Feb 2025 [unverified] (https://www.contractsfinder.service.gov.uk/Notice/21078505-3f30-4283-a47d-b42d4a5dade1)',
    ],
    design: ['Annual logo churn 8-15%, revenue churn 5-10% [design]', 'Reason mix [design]; a user survey before renewal saves 35-50% [design]'],
  }),
  nonprofits: seg({
    churn: [0.1, 0.25], invRange: [0.03, 0.06], renewal: false, fy: true, months: [6, 7, 12], early: 2.0,
    note: 'Churn clusters at grant end dates (often mid-year) and fiscal-year end (July 1 or calendar year); stress shows as downgrades first, cancellations later; vendor notice often under 30 days.',
    mix: [['budget_cut', 24], ['funding_ended', 22], ['not_using', 12], ['price_too_high', 8], ['champion_left', 7], ['platform_built_in', 6], ['consolidated_vendors', 6], ['business_closed', 6], ['payment_failed', 5], ['switched_competitor', 4]],
    signals: [['funding_cliff', 30, 180], 'champion_departure', 'failed_payment', 'layoffs_or_freeze', 'usage_drop', 'plan_downgrade'],
    tactics: [['pause_plan', 0.28], 'downgrade_offer', 'annual_prepay_switch', 'grant_funding_relabel'],
    sourced: [
      'Urban Institute / Chronicle of Philanthropy 2025: 21% of nonprofits that lost government funding had a grant or contract end, and 29% of those hit reduced staff [unverified; garbled secondary summary] (https://www.philanthropy.com/article/a-third-of-u-s-nonprofits-that-serve-communities-lost-government-funding-in-early-2025)',
      'Minnesota Council of Nonprofits 2025 Pulse Check: organizations under strain cut staff and programs before closing; none said they were very likely to close within 12 months (https://minnesotanonprofits.org/wp-content/uploads/2026/01/2025-Pulse-Check-Report.pdf, uploaded 2026-01)',
      'Microsoft retired its nonprofit Business Premium and E1 grant offers (renewals through the next renewal on or after 2025-07-01), affecting about 400,000 nonprofits [unverified, advocacy press] (https://wholewhale.com/resources/400k-nonprofits-impacted-by-microsoft-grant-cancellation-coming-july-2025/); a Cybernews claim of retirement in June 2026 is unconfirmed (https://cybernews.com/tech/microsoft-data-non-profits/)',
      'Connecticut Nonprofit Alliance Survey of Federal Impact (https://ctnonprofitalliance.org/wp-content/uploads/2025/10/Survey-of-Federal-Impact.pdf, 2025-10)',
    ],
    design: ['Annual logo churn 15-25% for small and mid nonprofits, 10-15% for dues-based associations; revenue churn 10-20% [design]', 'Reason mix [design]; a pause plan saves 20-35% of accounts facing a grant gap [design]'],
  }),
  churches: seg({
    churn: [0.12, 0.2], invRange: [0.02, 0.05], renewal: false, fy: true, months: [7, 8, 11, 12], early: 1.8,
    note: 'Budget year is usually the calendar year, so tool costs get cut in October-December; pastoral transitions cluster in summer and trigger tool changes; a closure is sudden, a pastor resignation gives 1-3 months.',
    mix: [['champion_left', 22], ['switched_competitor', 15], ['business_closed', 12], ['price_too_high', 10], ['not_using', 10], ['missing_feature', 8], ['poor_support', 7], ['outgrew_product', 6], ['payment_failed', 4], ['acquired_or_merged', 3], ['platform_built_in', 3]],
    signals: ['champion_departure', 'usage_drop', 'seat_decline', 'failed_payment', 'closure_news', ['budget_review', 30, 90]],
    tactics: ['champion_handoff', 'annual_prepay_switch', 'downgrade_offer', 'onboarding_rescue'],
    sourced: [
      'Lifeway: 1.8% of 49,842 active Southern Baptist congregations (2022) disbanded or closed by 2023, about 18% over a decade at that rate; a Duke sociology study cites about 1 in 100 churches closing per year; 94% of pastors expect their church open in 10 years (https://news.lifeway.com/2025/04/15/few-protestant-pastors-believe-their-churches-will-close-soon/, 2025-04-15)',
      'Capterra reviews: a Planning Center Giving reviewer moved from Pushpay to a cheaper, easier tool after a contract lock-in; another left CCB and Pushpay because the older platform lagged [unverified, individual reviews] (https://www.capterra.com/p/76708/Planning-Center/reviews/)',
      'Religion News Service on pastor optimism vs closures (https://religionnews.com/2025/04/16/most-pastors-think-their-churches-wont-close-anytime-soon-they-are-right-for-now/, 2025-04-16)',
    ],
    design: ['Annual logo churn 12-20%, revenue churn 8-14%; small churches (under 100 attendance) churn most [design]', 'Reason mix [design]', 'Handoff to the new leader within 30 days is often the difference between keeping and losing the account [design]'],
  }),
};

// ---------------------------------------------------------------------------------------------
// B2C_CHURN: consumer subscription app categories. Reason ids use the B2C set (achieved_goal, found_free_alternative,
// forgot_or_surprised_renewal, subscription_fatigue) plus not_using, price_too_high, bugs_reliability (the notes'
// "technical_issues"), seasonal_pause (the notes' "seasonal"), payment_failed, other.
// Involuntary share is set to 20% for every category: the notes' tables said 8-12% but their prose said 15-25%,
// RevenueCat's store split is 14% (App Store) / 31% (Google Play) and Recurly's low-ARPC web-billed share is about 30%.
// Almost all category-level numbers are [design]; the anchors are in CROSS.b2c.
// ---------------------------------------------------------------------------------------------
const b2c = (o) => {
  const reasonMix = normMix(o.mix, 0.2);
  return {
    label: o.label, monthlyChurn: o.monthly, annualYear1CancelRate: o.year1,
    trialToPaidDropReasons: o.drops, reasonMix, involuntaryShare: reasonMix.payment_failed,
    refundRate: o.refund, chargebackRate: o.chargeback, winbackMonthly: o.winM, winbackAnnual: o.winA,
    timing: o.timing, signals: o.signals.map(sigRef), saveTactics: o.tactics.map(tacRef),
    evidence: 'design', sourced: o.sourced, design: o.design,
  };
};
const drop = (id, label, w) => ({ id, label, w });
const B2C_SIGNALS = ['never_activated_7d', 'b2c_engagement_drop', 'annual_renewal_approaching', 'refund_request'];
const B2C_TACTICS = ['b2c_cancel_flow_pause', 'b2c_renewal_reminder', 'dunning_retries', 'b2c_event_timed_offer'];

export const B2C_CHURN = {
  health_fitness: b2c({
    label: 'Health and fitness', monthly: [0.09, 0.12], year1: 0.72,
    drops: [drop('plan_mismatch', 'Workout or meal plan did not fit the user\'s schedule', 0.3), drop('paywall_before_value', 'Paywall shown before the user saw the content', 0.25), drop('free_tier_enough', 'Free tier gave enough to stop there', 0.2), drop('day0_3_cancel', 'Cancelled in the first 3 days', 0.15), drop('sync_issues', 'Watch / HealthKit sync problems', 0.1)],
    mix: [['not_using', 36], ['price_too_high', 22], ['achieved_goal', 8], ['found_free_alternative', 9], ['bugs_reliability', 4], ['subscription_fatigue', 5], ['payment_failed', 10], ['forgot_or_surprised_renewal', 4], ['seasonal_pause', 2]],
    refund: [0.027, 0.06], chargeback: [0.002, 0.008], winM: [0.1, 0.2], winA: [0.02, 0.05],
    timing: { note: 'January spike then drop; summer dip; refund requests cluster in the days after the first annual charge.', seasonalMonths: [1, 2, 7, 8] },
    signals: [...B2C_SIGNALS, 'streak_broken'], tactics: [...B2C_TACTICS, 'b2c_streak_reengagement'],
    sourced: [
      'H&F median trial usage 6.7% of installs, behind only Business at 6.9% (games 2.9%) [unverified] (https://gigazine.net/gsc_news/en/20240313-apps-subscription-stats, 2024-03-13); trial-to-paid medians of about 35-40% [unverified secondary]',
      'Involuntary billing failures are 31% of cancellations on Google Play (28.2% in 2025) and 14% on the App Store (15.1% in 2025) (RevenueCat, https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026, 2026-03-19, updated 2026-04-22)',
    ],
    design: ['Monthly churn 9-12% and year-1 annual cancel rate near the all-app 72% [design]; no public category figure', 'Reason mix and win-back [design]; chargebacks have no source (app-store billing near zero, web-billed higher)'],
  }),
  productivity: b2c({
    label: 'Productivity', monthly: [0.07, 0.1], year1: 0.7,
    drops: [drop('blank_canvas', 'Never created a second real item (list, note, calendar sync)', 0.35), drop('setup_friction', 'Setup friction and an empty first session', 0.25), drop('trial_too_short', '3-day trial too short to build a habit (17-32 day trials convert 42.5% vs 25.5% for under 4 days)', 0.2), drop('free_alternative', 'Apple Reminders, Notion free or Google Keep was enough', 0.2)],
    mix: [['not_using', 30], ['found_free_alternative', 16], ['price_too_high', 14], ['achieved_goal', 4], ['bugs_reliability', 6], ['subscription_fatigue', 7], ['payment_failed', 12], ['forgot_or_surprised_renewal', 6], ['seasonal_pause', 3], ['other', 2]],
    refund: [0.027, 0.05], chargeback: [0.003, 0.01], winM: [0.05, 0.1], winA: [0.02, 0.05],
    timing: { note: 'Used in bursts; students churn at exam periods and semester end; refund requests cluster at the first annual renewal.', seasonalMonths: [5, 6, 12] },
    signals: B2C_SIGNALS, tactics: B2C_TACTICS,
    sourced: [
      'Trial-to-paid: 42.5% median for 17-32 day trials, 25.5% for trials under 4 days; day-35 hard paywall 10.7% vs freemium 2.1% (RevenueCat, https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026, 2026-03-19)',
      'RevenueCat 2025 cancellation reasons (secondary summary): not enough usage 37%, cost 35%, better alternative 10%, technical 7% [unverified] (https://www.revenuecat.com/blog/growth/subscription-app-churn-reasons-how-to-fix.md)',
    ],
    design: ['Monthly churn 7-10% [design]; winback 5-10% within 6 months is [design] (no source)'],
  }),
  education_language: b2c({
    label: 'Education and language learning', monthly: [0.08, 0.12], year1: 0.72,
    drops: [drop('streak_loss', 'Streak lost after 2-3 weeks', 0.35), drop('lesson_fatigue', 'Lesson fatigue at the first plateau', 0.3), drop('free_tier_enough', 'Free tier of the same app was enough', 0.2), drop('trial_too_short', 'Trial too short to see progress', 0.15)],
    mix: [['achieved_goal', 14], ['not_using', 28], ['price_too_high', 14], ['found_free_alternative', 12], ['subscription_fatigue', 6], ['bugs_reliability', 3], ['payment_failed', 12], ['forgot_or_surprised_renewal', 5], ['seasonal_pause', 4], ['other', 2]],
    refund: [0.02, 0.05], chargeback: [0.001, 0.004], winM: [0.08, 0.15], winA: [0.02, 0.04],
    timing: { note: 'Exam periods and travel seasons; achieved-goal churners (trip done, test passed) rarely return.', seasonalMonths: [5, 6, 12] },
    signals: [...B2C_SIGNALS, 'streak_broken', 'goal_milestone_hit'], tactics: [...B2C_TACTICS, 'b2c_streak_reengagement'],
    sourced: [
      'Duolingo Western-market churn about 28% in late 2025, down from 47% in 2020, paid base 12.2M [unverified: secondary Substack summary; period unit unclear] (https://sergeycyw.substack.com/p/duolingo-q1-2025-earnings-analysis, 2025)',
      'Language-learning retention below several other categories; free-to-paid conversion around 2-5% on iOS [unverified] (https://www.businessofapps.com/?p=56781, undated)',
    ],
    design: ['Monthly churn 8-12% for smaller language apps [design]; streak re-engagement push brings 8-15% back within 6 months [design]'],
  }),
  photo_video: b2c({
    label: 'Photo and video', monthly: [0.08, 0.12], year1: 0.76,
    drops: [drop('project_finished', 'One-off project (wedding video, trip edit) finished', 0.35), drop('export_paywall', 'Paywall or watermark at export', 0.25), drop('free_alternative', 'CapCut or the phone\'s built-in editor', 0.25), drop('export_fail', 'Export crashes or sync problems', 0.15)],
    mix: [['achieved_goal', 18], ['not_using', 22], ['price_too_high', 12], ['found_free_alternative', 14], ['bugs_reliability', 6], ['subscription_fatigue', 5], ['payment_failed', 10], ['forgot_or_surprised_renewal', 6], ['seasonal_pause', 5], ['other', 2]],
    refund: [0.03, 0.08], chargeback: [0.003, 0.01], winM: [0.08, 0.12], winA: [0.02, 0.05],
    timing: { note: 'Event-driven and seasonal (holidays, weddings, travel); export-paywall trial-to-paid is typically higher than onboarding-paywall.', seasonalMonths: [1, 6, 9] },
    signals: [...B2C_SIGNALS, 'goal_milestone_hit'], tactics: [...B2C_TACTICS, 'free_tier_fallback'],
    sourced: [
      'AI-powered products are 61.4% of photo and video apps in one 2026 summary [unverified]; RevenueCat 2026: AI apps churn 30-36% faster (sources disagree) (https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows, 2026-03-10)',
    ],
    design: ['Monthly churn 8-12%; year-1 annual cancel rate 0.76 because the AI-feature subset churns fastest [design]', 'Event-timed offers bring 8-12% back within 6 months [design]'],
  }),
  finance: b2c({
    label: 'Finance and budgeting', monthly: [0.05, 0.08], year1: 0.62,
    drops: [drop('bank_link_broke', 'Bank link broke or never connected', 0.35), drop('no_budget_set', 'No budget set before the trial ended', 0.3), drop('trial_shorter_than_cycle', 'Trial shorter than a billing cycle: no monthly summary seen', 0.2), drop('mistook_charge', 'Mistook the charge for a bank fee', 0.15)],
    mix: [['not_using', 24], ['achieved_goal', 10], ['price_too_high', 18], ['found_free_alternative', 12], ['bugs_reliability', 9], ['subscription_fatigue', 4], ['payment_failed', 11], ['forgot_or_surprised_renewal', 5], ['seasonal_pause', 4], ['other', 3]],
    refund: [0.02, 0.04], chargeback: [0.002, 0.008], winM: [0.06, 0.1], winA: [0.03, 0.06],
    timing: { note: 'Lower monthly churn because bank connections create switching cost; tax season and year-end resets; win-back works when the bank changes or a new year starts.', seasonalMonths: [1, 4] },
    signals: [...B2C_SIGNALS, 'outage_incident'], tactics: B2C_TACTICS,
    sourced: [
      'No category-level figure published; all-app anchors: 72% of annual subscribers cancel in year 1 (2026; 56% in 2025), 35% of annual cancellations in month 1 (RevenueCat, https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026, 2026-03-19, updated 2026-04-22)',
    ],
    design: ['Monthly churn 5-8%, lower than most consumer categories (bank links add switching cost) [design]', 'Year-1 annual cancel 0.62 [design]; no public category data'],
  }),
  dating_social: b2c({
    label: 'Dating and social', monthly: [0.12, 0.18], year1: 0.7,
    drops: [drop('no_matches', 'No matches or first conversation', 0.4), drop('bad_experience', 'Matched quickly then a bad experience', 0.25), drop('trial_abuse_cycle', 'Re-subscribed after an expired trial, charged, refunded', 0.2), drop('safety', 'Safety or harassment', 0.15)],
    mix: [['achieved_goal', 26], ['not_using', 24], ['price_too_high', 10], ['found_free_alternative', 9], ['bugs_reliability', 3], ['subscription_fatigue', 5], ['payment_failed', 9], ['forgot_or_surprised_renewal', 5], ['seasonal_pause', 4], ['other', 5]],
    refund: [0.04, 0.1], chargeback: [0.004, 0.012], winM: [0.15, 0.25], winA: [0.03, 0.06],
    timing: { note: 'New-year spike and post-holiday drop; success ends the need, so achieved_goal is the biggest single reason; users return when they reset their profile or move city.', seasonalMonths: [1, 2] },
    signals: [...B2C_SIGNALS, 'goal_milestone_hit'], tactics: B2C_TACTICS,
    sourced: [
      'Of 6,089 US Tinder subscribers who paid July 2024-June 2026 and then stopped, 90.3% did not buy another paid dating app; about 7% moved to Bumble and about 3% to Grindr [unverified; cohort definition garbled, windows approximate] (https://ask.yipitdata.com/insights/lapsed-tinder-payers-category-exit)',
      'RevenueCat data suggests about 20% of churned monthly subscribers reactivate within a year, 6% to 36% by category [unverified summary] (https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026, 2026-03-19)',
      'Refund requests after a trial-abuse cycle; a RevenueCat staffer says AI categories see higher refunds [anecdotal] (https://community.revenuecat.com/general-questions-7/higher-refund-rate-6814, 2025-08)',
    ],
    design: ['Monthly churn 12-18%, the highest listed, because the job is "find someone" [design]', 'Win-back 15-25% within 6 months [design / unverified]'],
  }),
  ai_tools: b2c({
    label: 'AI assistants and creative tools', monthly: [0.11, 0.15], year1: 0.79,
    drops: [drop('novelty_fades', 'Novelty of model output fades in the first two weeks', 0.35), drop('try_newest_model', 'User tries the newest model elsewhere', 0.3), drop('usage_caps', 'Usage caps or credits run out', 0.2), drop('quality_latency', 'Output quality, latency or outages', 0.15)],
    mix: [['found_free_alternative', 24], ['not_using', 22], ['price_too_high', 15], ['subscription_fatigue', 9], ['bugs_reliability', 6], ['payment_failed', 9], ['forgot_or_surprised_renewal', 5], ['achieved_goal', 4], ['seasonal_pause', 2], ['other', 4]],
    refund: [0.04, 0.09], chargeback: [0.004, 0.012], winM: [0.1, 0.2], winA: [0.04, 0.06],
    timing: { note: 'Drop is in the first two weeks; monthly subscribers return when a model upgrade ships; annual ones rarely return (about 5%); school term and tax deadlines cause small seasonal dips.', seasonalMonths: [6, 12] },
    signals: [...B2C_SIGNALS, 'new_model_release'], tactics: [...B2C_TACTICS, 'downgrade_offer'],
    sourced: [
      'RevenueCat 2026: AI apps churn about 30-36% faster than non-AI apps (summaries disagree); 12-month retention 21.1% (AI) vs 30.7% (non-AI); monthly retention 6.1% vs 9.5%; year-1 realised LTV $30.16 vs $21.37 median (https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows, 2026-03-10; https://www.computing.co.uk/news/2026/ai-powered-apps-struggle-retain-subscribers, 2026)',
      'Reactivation of cancelled annual subscribers about 4.9-5.9%; 95% never return (RevenueCat 2026 part two via PPC Land, https://ppc.land/95-of-annual-app-subscribers-who-cancel-never-return-revenuecat-finds/, undated)',
      'ChartMogul / Growth Unhinged (2025-12-10): AI-native median GRR 40%, NRR 48%; AI products under $50 a month GRR 23% (about 50 companies per sub-bucket, "directional") (https://www.growthunhinged.com/p/the-ai-churn-wave)',
    ],
    design: ['Monthly churn 11-15% derived as 1.3-1.36x a ~9% non-AI base [design]', 'Year-1 annual cancel 0.79 = 1 - 21.1% 12-month retention (a different measure than RevenueCat\'s annual-subscriber 72%)'],
  }),
  meditation_wellness: b2c({
    label: 'Meditation and wellness', monthly: [0.08, 0.12], year1: 0.72,
    drops: [drop('no_felt_change', 'Did one session and felt no change', 0.45), drop('trial_too_short', 'Trial under 7 days', 0.3), drop('free_alternative', 'Free apps or YouTube', 0.25)],
    mix: [['not_using', 30], ['found_free_alternative', 17], ['price_too_high', 16], ['achieved_goal', 8], ['subscription_fatigue', 6], ['bugs_reliability', 4], ['payment_failed', 8], ['forgot_or_surprised_renewal', 5], ['seasonal_pause', 4], ['other', 2]],
    refund: [0.03, 0.06], chargeback: [0.001, 0.005], winM: [0.15, 0.2], winA: [0.05, 0.08],
    timing: { note: 'Drop at day 0-3; January reset and exam periods; annual-plan buyers who used one session ask for refunds.', seasonalMonths: [1, 5] },
    signals: [...B2C_SIGNALS, 'streak_broken'], tactics: [...B2C_TACTICS, 'b2c_streak_reengagement'],
    sourced: [
      'Of 290 observed Headspace cancellers, 4.9% resumed Headspace within 180 days (small cohort, limited coverage) (https://ask.yipitdata.com/insights/headspace-cancelers-calm-starts, undated)',
      'A developer-forum post claims a cancellation survey with tailored offers saved 47% of cancellations [unverified self-report] (https://community.web2wave.com/t/we-halved-our-churn-rate-with-custom-win-back-offers-at-cancellation/1243)',
    ],
    design: ['Monthly churn 8-12% [design]; no churn number published by Headspace or Calm', 'Win-back 5-8% in 6 months for annual plans, 15-20% for monthly [design]'],
  }),
  games_entertainment: b2c({
    label: 'Games and entertainment subscriptions', monthly: [0.1, 0.15], year1: 0.72,
    drops: [drop('free_content_hides_benefit', 'Free content does not show the paid benefit in the first session', 0.5), drop('price', 'Price or bundle price', 0.3), drop('low_trial_use', 'Low trial usage (2.9% of installs)', 0.2)],
    mix: [['subscription_fatigue', 22], ['price_too_high', 20], ['not_using', 20], ['achieved_goal', 9], ['found_free_alternative', 6], ['bugs_reliability', 4], ['payment_failed', 9], ['forgot_or_surprised_renewal', 5], ['seasonal_pause', 3], ['other', 2]],
    refund: [0.03, 0.08], chargeback: [0.003, 0.01], winM: [0.04, 0.06], winA: [0.02, 0.05],
    timing: { note: 'Season-pass cycles and new releases; cancelling removes battle-pass access at period end; season-pass users return at each new season (15-25% of lapsed, [design]).', seasonalMonths: [1, 9, 12] },
    signals: [...B2C_SIGNALS, 'goal_milestone_hit'], tactics: [...B2C_TACTICS, 'downgrade_offer'],
    sourced: [
      'Circana survey: about 40% of recent Xbox Game Pass Essential and PlayStation Plus Essential cancellers said they still liked the service but could no longer afford it; Nintendo Switch Online 50% (via IBTimes, https://www.ibtimes.co.uk/xbox-game-pass-cancellations-circana-survey-1819309, undated)',
      'Battle-pass and VIP access end at period end after cancelling (Epic help, https://www.epicgames.com/help/c-202300000001636/c-202300000001721/why-did-i-lose-access-to-the-new-battle-pass-after-canceling-my-fortnite-crew-subscription-a202300000016043)',
    ],
    design: ['Mobile game subscription monthly churn 10-15% [design]; no public category figure', 'winbackSeasonPass 15-25% is [design]; winbackMonthly is for standing subscriptions'],
  }),
};
B2C_CHURN.games_entertainment.winbackSeasonPass = [0.15, 0.25];

// ---------------------------------------------------------------------------------------------
// CROSS: cross-cutting benchmarks (c10 plus anchors from c1-c9). Status tags: 'sourced' | 'unverified' | 'design'.
// ---------------------------------------------------------------------------------------------
const arpc = (lo, hi, total, voluntary, involuntary) => ({ arpcMonthly: [lo, hi], total, voluntary, involuntary, involuntaryShare: r4(involuntary / total) });
export const CROSS = {
  annualLogoChurnByModel: {
    note: 'Game models smb/ent/b2c in public/core/params.js MARKET. Ranges are [design] working ranges for a well-run company in 2026.',
    b2c: { monthly: [0.07, 0.18], status: 'design', source: 'B2C_CHURN category ranges' },
    smb: { annual: [0.12, 0.45], monthlyEquivalent: [0.01, 0.05], status: 'design' },
    ent: { annual: [0.02, 0.15], status: 'design' },
  },
  involuntaryShareByArpc: {
    status: 'sourced',
    note: 'Recurly network medians by price per customer. Recurly labels them annual, but its own FAQ equates 2% monthly with 22% annual and the page contradicts itself (SaaS median 3.04% in body vs 3.22% in table), so use the SHARES, not the levels.',
    bands: [arpc(10, 25, 0.0429, 0.0299, 0.013), arpc(25, 50, 0.0384, 0.0273, 0.0111), arpc(50, 100, 0.0315, 0.0241, 0.0074), arpc(100, 250, 0.0287, 0.024, 0.0046), arpc(250, 1e9, 0.0307, 0.029, 0.0018)],
    overall: { recurlyNetwork: 0.35, recurlySaas: 0.33, recurlyEducation: 0.34, recurlyEcommerce: 0.32, churnkeyShareOfCancellations: 0.22, churnkeyB2B: 0.16, stripeB2B: 0.16, vendorClaimRange: [0.2, 0.4] },
    byAov: { 'under_10': 0.35, '30_to_100': 0.26 },
    sources: [
      'Recurly churn benchmarks, July 2026 data: overall 3.60% (2.34% voluntary, 1.25% involuntary), SaaS 3.22% (2.16%/1.06%); by ARPC table (https://recurly.com/research/churn-rate-benchmarks, accessed 2026-10-14; sample size not stated)',
      'Churnkey/Stripe: involuntary 22% of all SaaS churn, 16% for B2B, 26% for AOV $30-100, 35% under $10 (https://churnkey.co/blog/involuntary-churn-benchmarks, 2025-11-14, updated 2025-12-12)',
      'Stripe-cited B2B annual churn 38% of which 32 points voluntary (84%) [unverified, secondhand] (https://churnkey.co/blog/voluntary-churn-benchmarks/, 2025-12-13)',
      'Churnkey "20-40% of overall churn" with no methodology (https://www.churnkey.co/blog/involuntary-churn, updated 2026-02-25); Churnkey State of Retention 2025 reports about 7% a month voluntary and 1% involuntary (about 12% involuntary) which conflicts with these (https://churnkey.co/reports/state-of-retention-2025)',
    ],
  },
  declineReasons: {
    status: 'unverified', note: 'Churnkey, about 5.4M failed payments. Stripe will not retry highest_risk_level or transaction_not_allowed without a new payment method, so do not count them as recoverable by retries.',
    shares: { insufficient_funds: 0.406, transaction_not_allowed: 0.088, highest_risk_level: 0.08, do_not_honor: 0.076, generic_decline: 0.058, incorrect_number: 0.047, expired_card: 0.011 },
    softShareOfFailures: [0.8, 0.9],
    sources: ['https://churnkey.co/guides/reduce-involuntary-churn (undated) [unverified]', 'https://docs.stripe.com/billing/revenue-recovery/smart-retries (live docs)'],
  },
  dunningRecovery: {
    status: 'design',
    softDecline: [0.35, 0.55], hardDecline: [0, 0.1], blendedMedian: 0.42,
    note: 'Quoted figures conflict and use different denominators/windows: Recurly median 47.6% (top performers 70-85%) [unverified, via Orb/Yuno]; Stripe marketing 55% (Billing customers) [unverified]; Redux audit of 200+ B2C accounts 25-35%; Churnkey about 38% for Stripe tools and a product claim of up to 89%; Smart Retries alone about 38% [unverified DEV post]. The simulator default is the middle of the credible band.',
    stripeDefault: 'Smart Retries: recommended 8 tries within 2 weeks; ACH 2 retries over 40 days; SEPA 2 over 30 days',
    sources: ['https://y.uno/en/blog/how-to-actually-measure-failed-payment-recovery.md (2026) [unverified]', 'https://www.reduxpayments.com/blog/stripe-smart-retries-explained (undated) [unverified]', 'https://www.churnkey.co/blog/involuntary-churn (updated 2026-02-25, vendor claim)', 'https://docs.stripe.com/billing/revenue-recovery/smart-retries (live docs)'],
  },
  cardUpdater: {
    status: 'design',
    expiryFailuresCaughtBeforeFirstRetry: 0.5, shareOfSoftDeclineRecovery: [0.15, 0.25],
    note: 'No primary source quantifies Card Account Updater or Stripe automatic card updates; a DEV post estimates 60-70% of card changes are caught [unverified]. Expired card is only about 1.1% of declines in Churnkey data, so the updater matters most for older subscriber bases.',
    sources: ['https://docs.stripe.com/billing/revenue-recovery/smart-retries (feature description only)'],
  },
  exitSurveyAccuracy: {
    status: 'design',
    priceAnswerIsRealPrice: 0.5, // [design] treat a "too expensive" answer as half real price, half missing value
    notUsingIsActivationProblem: 0.7, // [design]
    statedMatchesActual: 0.27, // [unverified] UserIntuition claim "less than 27%", no study named; direction plausible
    involuntaryChurnersAnswering: 0.05, // [design] failed-payment churners almost never answer
    note: 'Menus shape answers: Paddle Retain defaults omit price entirely; Churnkey shares are conditional on the reason being displayed; the exit survey only reaches people who finish the flow. Churnkey (about 2M-3M responses, all SaaS): budget 33.0%, infrequent use 30.6%, other 17.9%, expectations 8.6%, technical 4.7%, alternatives 4.3%, usability 1.0%. Shopify developer saw 98% "testing multiple apps" in the mandatory prompt.',
    sources: ['https://churnkey.co/blog/voluntary-churn-benchmarks/ (2025-12-13)', 'https://developer.paddle.com/build/retain/configure-cancellation-flows-surveys.md (2024)', 'https://www.enterpret.com/guides/the-6-best-tools-to-analyze-cancellation-and-exit-survey-responses-at-scale (undated)', 'https://www.userintuition.ai/reference-guides/why-customers-canceling-subscriptions/ [unverified]', 'https://shopify.dev/changelog/update-to-app-uninstall-reasons (2026)'],
  },
  curveByMonth: {
    status: 'design',
    note: 'Monthly churn by lifetime month (c10 section F2). No primary source gives B2B cohort-month curves. Compare with MARKET.*.monthlyChurn in public/core/params.js.',
    smb_selfserve_monthly: [{ fromMonth: 1, toMonth: 3, monthly: [0.06, 0.12] }, { fromMonth: 4, toMonth: 6, monthly: [0.04, 0.07] }, { fromMonth: 7, toMonth: 11, monthly: [0.02, 0.04] }, { fromMonth: 12, toMonth: 999, monthly: [0.015, 0.03] }],
    mid_market_annual: [{ fromMonth: 1, toMonth: 11, monthly: [0, 0.003] }, { fromMonth: 12, toMonth: 12, renewalSpike: [0.05, 0.15] }, { fromMonth: 13, toMonth: 999, monthly: [0.005, 0.01] }],
    ai_native_under50: [{ fromMonth: 1, toMonth: 3, monthly: [0.15, 0.3] }, { fromMonth: 4, toMonth: 6, monthly: [0.05, 0.1] }, { fromMonth: 7, toMonth: 11, monthly: [0.03, 0.06] }, { fromMonth: 12, toMonth: 999, monthly: [0.02, 0.04] }],
    b2c_app: { month1Renew: 0.52, day90Paying: 0.43, oneYearPaying: 0.17, source: 'MARKET.b2c comments citing RevenueCat 2026; annual-subscriber year-1 cancel rate 72% (2026) vs 56% (2025), 35% of annual cancellations in month 1, 55.4% of 3-day-trial cancellations on day 0 (https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026, 2026-03-19)' },
    earlyLifeRules: ['A user who has not reached first value within 7 days has about twice the monthly churn of one who has [design]', 'AI-native self-serve under $50 a month: 30-45% of signups churn within 30 days then the cohort flattens [design]; AI tourist effect, measure retention from month 3 [unverified a16z framing]'],
  },
  byAcvBand: {
    status: 'design',
    note: 'c10 section A2 working ranges (annual gross logo churn for a well-run company in 2026). Secondary sources conflict by about 3x (ChartMogul-attributed SMB 10-14% vs Optifai/StealthAgents 30-58%), most likely a logo vs revenue, monthly-equivalent vs annual and micro vs sales-led difference.',
    bands: [
      { id: 'lt1k', acv: [0, 1000], label: 'Micro / self-serve SMB', annualLogoChurn: [0.25, 0.4], grr: [0.65, 0.8], involuntaryShare: 0.3 },
      { id: 'k1to10', acv: [1000, 10000], label: 'SMB', annualLogoChurn: [0.12, 0.25], grr: [0.8, 0.88], involuntaryShare: 0.22 },
      { id: 'k10to100', acv: [10000, 100000], label: 'Mid-market', annualLogoChurn: [0.06, 0.12], grr: [0.88, 0.94], involuntaryShare: 0.1 },
      { id: 'gt100k', acv: [100000, 1e12], label: 'Enterprise', annualLogoChurn: [0.02, 0.06], grr: [0.92, 0.97], involuntaryShare: 0.03 },
    ],
    gameAcvBands: 'public/data/buyer-segments.js acvBand(): lt5k, k5to25, k25to100, gt100',
    sources: ['https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/ (2025-09-18): NRR 102% median at $25k-$50k ACV (top quartile 111%, bottom 97%); per-band medians only in an unreadable chart', 'https://prospeo.io/s/net-revenue-retention (undated) [unverified]: NRR about 96% under $1k ACV, 102% at $25-50k, 108% above $100k', 'https://stealthagents.com/research/saas-churn-rate-statistics-2026 (2026) [unverified]: GRR 92-96% above $50k ACV, 80-88% below $5k', 'https://www.growthunhinged.com/p/the-ai-churn-wave (2025-12-10)'],
  },
  byContract: {
    status: 'unverified',
    monthlyToAnnualRatio: [1.5, 2.5], // [design]
    survey2024: { monthly: 0.14, annual: 0.1, oneToTwoYear: 0.06, twoToThreePlusYear: 0.03, note: 'KBCM/Sapphire-derived, reprinted by an aggregator that corrected earlier drafts [unverified]' },
    multiYearExposure: [0.4, 0.6], multiYearDiscount: [0.1, 0.2],
    annualRenewalCancelOrDowngrade: [0.2, 0.3], // [design] share of annual renewal decisions
    note: 'Annual contracts cut logo churn 30-60% vs monthly, partly mechanically (no renewal decision for 12 months). Kellblog: multi-year contracts leave the renewal pool for 1-2 years, so a 10% annual rate equals about 27% over three years: do not compare on a simple annual basis.',
    sources: ['https://research.successcoaching.co/docs/churn [unverified]', 'https://fungies.io/reduce-saas-churn-guide-2026 [unverified: 8.5% annual vs 16% monthly]', 'https://www.kellblog.com/the-biggest-mistake-youre-likely-making-in-calculating-churn-annualizing-and-weighting-multi-year-atr-churn-rates/ (undated)', 'https://www.getmonetizely.com/articles/multi-year-contracts-optimizing-pricing-strategies-for-long-term-saas-success [unverified]'],
  },
  saveFlow: {
    status: 'design',
    unassistedWellBuilt: [0.15, 0.25], vendorClaims: [0.34, 0.54], offerAcceptance: [0.15, 0.25], pauseAdoptionWherePossible: [0.1, 0.25], halfOfSavesArePauseOrDowngrade: 0.5,
    note: 'Chargebee defines save rate as saved subscribers over cancel-page sessions with a 30-day save interval. Discounts give the least durable saves (reverse at expiry); pauses give the most reactivation. Vendor claims (Churnkey 54%, Userpilot 34%) should be discounted.',
    sources: ['https://www.chargebee.com/docs/growth/reporting/key-metrics-glossary (undated)', 'https://churnkey.co/comparisons/churn-buster-vs-churnkey (undated, vendor)', 'https://developer.paddle.com/concepts/retain/cancellation-flows-surveys (undated, vendor)', 'https://skillselion.com/skills/coreyhaines31/marketingskills/churn-prevention [unverified]'],
  },
  integrations: { status: 'design', relativeChurnReduction: [0.2, 0.35], note: 'PartnerStack: 60% of surveyed firms say activated integrations cancel less (Apr 2026); Partnerfleet: 98% say so (perception); Crossbeam 2023 self-reported 50-79% reductions [all unverified]. Direction consistent, magnitude not.', sources: ['https://partnerfleet.io/blog/valuable-integration-statistics-to-know (2026) [unverified]', 'https://www.affilitizer.com/news/partnerstack-analyse-integrationen-senken-churn-rate-bei-b2b-saas-unternehmen-deutlich (2026-04) [unverified]'] },
  leadingIndicators: {
    status: 'design',
    healthScoreWarningDays: { annualMidMarket: [45, 90], selfServeSmb: [0, 14] },
    note: 'No primary study ranks signals by predictive power or lead time. Usage decline is a lagging signal in many playbooks; champion departure is top-tier risk and multi-threading is the protective factor. Vendor claims of "63 days warning vs 11 days" for AI scoring are unsourced.',
    sources: ['https://sharedcontext.ai/skills/external/ncklrs/customer-health-analyst (undated, low authority) [unverified]'],
  },
  b2c: {
    status: 'sourced',
    year1CancelRateAnnualSubs: { y2026: 0.72, y2025: 0.56 },
    involuntaryShareByStore: { appStore: 0.14, googlePlay: 0.31, webBilledLowArpc: 0.3 },
    refundRate: { allAppsMedian: 0.0271, annualSubscriptions: [0.06, 0.076] },
    reactivation: { annualSubscribers: [0.049, 0.059], monthlySameTier: 0.289, monthlyChurnedWithinYearByCategory: [0.06, 0.36], monthlyChurnedWithinYearAvg: 0.2 },
    aiApps: { churnFasterRatio: [1.3, 1.36], retention12m: { ai: 0.211, nonAi: 0.307 } },
    trialToPaid: { under4Days: 0.255, d17to32: 0.425, hardPaywallDay35: 0.107, freemiumDay35: 0.021 },
    note: 'Conflict: monthly reactivation is 28.9% (same price tier) in one RevenueCat summary and about 20% within a year (6-36% by category) in another; the game should use the lower, category-spread figure. Chargeback rates for subscription apps were not found; [design] values in B2C_CHURN are placeholders.',
    sources: ['https://www-docs.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 (2026-03-19, updated 2026-04-22)', 'https://ppc.land/95-of-annual-app-subscribers-who-cancel-never-return-revenuecat-finds/ (undated)', 'https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows (2026-03-10)', 'https://uploads.adapty.io/the_guide_on_managing_refunds_for_subscription_apps.pdf (undated)'],
  },
  aiNative: {
    status: 'sourced',
    medianGrr: 0.4, medianNrr: 0.48, under50GrrAi: 0.23, b2bSaasNrr: 0.82, b2cSaasNrr: 0.49,
    note: 'ChartMogul / Growth Unhinged, about 3,500 scraped companies (about 200 AI-native, about 50 per sub-bucket, "directional"), companies at least $250k ARR, annualised through 2025.',
    sources: ['https://www.growthunhinged.com/p/the-ai-churn-wave (2025-12-10)'],
  },
  defaultMix: null, // filled below (generic fallbacks for unknown segments)
  sources: [
    'https://churnkey.co/blog/voluntary-churn-benchmarks/ (2025-12-13)', 'https://recurly.com/research/churn-rate-benchmarks (July 2026 data)', 'https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/ (2025-09-18)',
    'https://www.growthunhinged.com/p/the-ai-churn-wave (2025-12-10)', 'https://churnkey.co/reports/state-of-retention-2025 (data 2024, updated 2026-09-11)',
  ],
};

// Generic fallback mixes: C2 section C2 (voluntary mix midpoints, [design]) plus 20% involuntary for SMB self-serve.
CROSS.defaultMix = {
  smb: normMix([['not_using', 27], ['price_too_high', 15], ['business_closed', 10], ['switched_competitor', 10], ['missing_feature', 8], ['never_activated', 7], ['budget_cut', 5.5], ['champion_left', 4.5], ['acquired_or_merged', 3], ['poor_support', 2.75], ['bugs_reliability', 2.75], ['platform_built_in', 3.5], ['other', 6.5]].map(([i, n]) => [i, n * 0.8]).concat([['payment_failed', 20]])),
  ent: null, // average of mid_market and enterprise, filled below
  b2c: null, // average of B2C categories, filled below
};

function averageMixes(mixes) {
  const out = {};
  for (const m of mixes) for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v / mixes.length;
  return out;
}
CROSS.defaultMix.ent = averageMixes([SEGMENT_CHURN.mid_market.reasonMix, SEGMENT_CHURN.enterprise.reasonMix]);
CROSS.defaultMix.b2c = averageMixes(Object.values(B2C_CHURN).map((c) => c.reasonMix));

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
/**
 * Reason mix (id -> share, sums to 1) for a buyer-segment id or B2C category id. Fallback chain: exact entry, then
 * the average of its buyer-segment group (public/data/buyer-segments.js), then the cross-cutting default for the
 * model ('smb' | 'ent' | 'b2c', default 'smb'). Always returns a fresh object.
 */
export function reasonMixFor(id, { model = 'smb' } = {}) {
  if (SEGMENT_CHURN[id]) return { ...SEGMENT_CHURN[id].reasonMix };
  if (B2C_CHURN[id]) return { ...B2C_CHURN[id].reasonMix };
  const group = getSegment(id)?.group;
  if (group) {
    const peers = Object.keys(SEGMENT_CHURN).filter((k) => getSegment(k)?.group === group);
    if (peers.length) return averageMixes(peers.map((k) => SEGMENT_CHURN[k].reasonMix));
  }
  return { ...(CROSS.defaultMix[model] ?? CROSS.defaultMix.smb) };
}

/** Draw one reason id from reasonMixFor(id). rand: () => [0,1). */
export function sampleChurnReason(id, rand = Math.random, opts = {}) {
  const mix = reasonMixFor(id, opts);
  const entries = Object.entries(mix);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  let r = rand() * total;
  for (const [k, v] of entries) { r -= v; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}

/**
 * What a churning customer says in an exit survey for a true reason id. Some answers are misleading ("too expensive"
 * for a business that closed). Returns { text, category, misleading, trueReason }; category is a game
 * CANCEL_CATEGORIES id or null when the customer gives no answer (closed businesses and failed payments often do not).
 */
export function surveyAnswer(reasonId, rand = Math.random) {
  const labels = (CHURN_REASONS[reasonId] ?? CHURN_REASONS.other).surveyLabels;
  const total = labels.reduce((a, l) => a + l.w, 0);
  let r = rand() * total;
  let pick = labels[labels.length - 1];
  for (const l of labels) { r -= l.w; if (r <= 0) { pick = l; break; } }
  return { text: pick.text, category: pick.category, misleading: pick.misleading, trueReason: reasonId };
}

/** Map a game cancelReason (core/stripe.js) to a reason id here, or null if it has no equivalent. */
export const reasonForGameCancel = (gameReason) => (CHURN_REASONS[gameReason] ? gameReason : GAME_REASON_ALIASES[gameReason] ?? null);
