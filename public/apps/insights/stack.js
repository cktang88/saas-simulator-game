// Data stack: product analytics vendor (PostHog / Mixpanel / Amplitude), tracking plan and data quality, Segment as a
// CDP, BI (Metabase / Hex) on a data source (production DB / read replica / warehouse), Retool for internal tools, and
// the metric questions investors and boards actually ask. Pure + deterministic (rng(state), uid()); no DOM.
//
// Source: docs/research/tools/2026q4/dev-data.md §4 (product analytics), §5 (BI and internal tools), §1 (PostHog
// bundle). Most prices there are third-party aggregators ([3p]); [design] = game assumption, never shown as a statistic.
//
// Paradigms (what the vendor choice changes in play, not only the bill):
// - PostHog: one event model for analytics + replay + flags + experiments + surveys + errors + SQL. Autocapture is on,
//   so you get data with no plan, but it is noisy (any click after signup reads as "activated"). Usage-metered per
//   product: recordings are the bill spike. Billing limits drop data instead of billing.
// - Mixpanel: event-first, clean funnels and retention. No autocapture by default: without an event plan the funnel
//   is empty. No surveys, flags or replay in the game model (you bolt those on by hand: extra hours).
// - Amplitude: behavioral analytics + experiment + surveys, governed taxonomy. Heavy setup and weekly governance; MTU
//   billing jumps to a sales-led annual contract. Fits Series A+ with a data owner; overkill before.
// - Heap (Contentsquare since Dec 2023) and June (shut 2025-08-08): notes only, no new signups.
// - Segment: collect once, route to many tools. Worth it only with several destinations; MTU counts anonymous visitors.
// - Metabase: GUI question builder for non-analysts; OSS self-host or Starter. Fast answers, wrong-metric risk without
//   written definitions. Hex: notebooks (SQL + Python) to apps + AI on a semantic layer; needs a warehouse and someone
//   who writes SQL; per-editor + compute. Retool: internal tools that WRITE (admin panels), not dashboards.
// - Querying the production DB directly: zero setup, but heavy queries cause load incidents and definitions drift.
//
// Operator tiers (CLAUDE.md principle 7), what the player does:
// - stellar: PostHog (or Mixpanel) sized to stage, a short tracking plan (signup, activation, payment + 1-2 useful
//   events, plan/source properties), identify + reverse proxy, sampled replays with a billing limit, no CDP until 3+
//   destinations, Metabase on a read replica with written metric definitions, reconciles numbers before sending them.
// - good: right vendor and plan, misses one or two details (no proxy, no definitions).
// - average: autocapture with no plan, replays on everything, answers investor questions by hand from exports.
// - mediocre: Amplitude/Hex/Segment at pre-seed, no plan, BI on the production DB, wrong metric definitions, sends
//   unreconciled numbers that diligence later finds wrong.

import { clamp, rng, chance, uid, round2, money, monthKey, lerp } from '../../core/util.js';
import { notify, forceHours } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { logMistake, registerOperatorReader, tierFromScore } from '../../core/operator.js';

const FN = 'data_stack';

// ---------------- Vendors ----------------
export const ANALYTICS_VENDORS = {
  posthog: {
    name: 'PostHog', status: 'active', verdict: 'KEEP', available: true, fit: 'any',
    paradigm: 'All-in-one on one event model: autocapture, events, replay, flags, experiments, surveys, error tracking, SQL (HogQL). Usage-billed per product.',
    makesEasy: 'Data from day one (autocapture); surveys and experiments in the same tool; SQL over events and a synced Stripe source.',
    makesHard: 'Autocapture floods you with unnamed events; each product is metered, so replays and events grow the bill.',
    features: { funnels: true, retention: true, replay: true, flags: true, experiments: true, surveys: true, errors: true, sql: true },
    autocapture: true, setupHours: 1.5, eventHours: 0.4, identifyHours: 1, proxyHours: 1.5, governanceWeekly: 0,
    billing: 'events', freeEvents: 1e6, perEvent: 0.00005, freeRecordings: 5000, perRecording: 0.005, caps: true,
    price: 'Free about 1M events + 5K recordings/mo; then usage (recordings about $0.005 each) [3p, dev-data.md §1/§4]',
  },
  mixpanel: {
    name: 'Mixpanel', status: 'active', verdict: 'KEEP-ALT', available: true, fit: 'any',
    paradigm: 'Event-first analytics with polished funnels, retention and flows. You instrument carefully; no autocapture by default.',
    makesEasy: 'Clean funnels and retention once events are named and planned.',
    makesHard: 'Without an event plan the funnel is empty. No in-product surveys or flags here: you bolt those on by hand.',
    features: { funnels: true, retention: true, replay: false, flags: false, experiments: false, surveys: false, errors: false, sql: false },
    autocapture: false, setupHours: 2, eventHours: 0.5, identifyHours: 1.5, proxyHours: 1.5, governanceWeekly: 0,
    billing: 'events', freeEvents: 1e6, perEvent: 0.00028, freeRecordings: 0, perRecording: 0, caps: false,
    price: 'Free about 1M events; Growth about $0.28 per 1K events after [3p, sources disagree, dev-data.md §4]',
  },
  amplitude: {
    name: 'Amplitude', status: 'active', verdict: 'KEEP-ALT (Series A+)', available: true, fit: 'seriesA',
    paradigm: 'Behavioral analytics + experimentation + AI agents with a governed taxonomy (data planning, approvals). MTU billing, enterprise-leaning.',
    makesEasy: 'Cohorts, experiments and surveys at scale with a data owner keeping the taxonomy clean.',
    makesHard: 'Heavy setup; every event goes through the taxonomy; weekly governance. Past the starter MTU tiers it is a sales-led annual contract.',
    features: { funnels: true, retention: true, replay: true, flags: true, experiments: true, surveys: true, errors: false, sql: false },
    autocapture: false, setupHours: 3, taxonomyHours: 4, eventHours: 0.75, identifyHours: 1.5, proxyHours: 1.5, governanceWeekly: 0.5,
    billing: 'mtu', freeMtu: 10000, plusPrice: 49, plusMtu: 50000, growthMonthly: 5392, caps: false,
    price: 'Free about 10K MTU; Plus $49/mo reported; median Growth contract about $64.7K/yr (Vendr via Fungies) [3p, dev-data.md §4]. Plus MTU ceiling 50K is [design].',
  },
  heap: {
    name: 'Heap', status: 'outdated', verdict: 'OUTDATED', available: false,
    note: 'Acquired by Contentsquare (announced 2023-09-28, closed 2023-12-07) and folded into Contentsquare Product Analytics; quote-only pricing with reported steep renewals. Its idea (autocapture everything, define "virtual events" later) lives on in PostHog autocapture. Not offered for new startups [verified, dev-data.md headline].',
  },
  june: {
    name: 'June', status: 'dead', verdict: 'DEAD', available: false,
    note: 'Wound down on 2025-08-08; the team joined Amplitude. It was templated B2B reports on Segment events. Use PostHog, Mixpanel or Amplitude [verified, dev-data.md §4].',
  },
};

// Events the player can put in the tracking plan. role: what the funnel needs it for; junk: noise that bills and
// clutters (autocapture already covers clicks and pageviews).
export const EVENT_CATALOG = [
  { id: 'signup', label: 'signup_completed', role: 'signup', key: true },
  { id: 'activated', label: 'core_action_completed (your activation event)', role: 'activation', key: true },
  { id: 'subscribed', label: 'subscription_started (server-side, from the Stripe webhook)', role: 'paid', key: true },
  { id: 'aha', label: 'aha_reached (3rd core action in week 1)', role: 'aha', useful: true },
  { id: 'invited', label: 'teammate_invited', useful: true },
  { id: 'onboarding_step', label: 'onboarding_step_completed {step}', useful: true },
  { id: 'cancel', label: 'cancel_flow_started {reason}', useful: true },
  { id: 'feature_used', label: 'feature_used {feature_name}', useful: true },
  { id: 'page_viewed', label: 'page_viewed (by hand, on every page)', junk: true },
  { id: 'button_clicked', label: 'button_clicked (every button)', junk: true },
  { id: 'modal_opened', label: 'modal_opened', junk: true },
  { id: 'scrolled', label: 'scroll_depth_25_50_75', junk: true },
  { id: 'api_request', label: 'api_request (every backend call)', junk: true },
];
const EV = Object.fromEntries(EVENT_CATALOG.map((e) => [e.id, e]));

export const RECORDING_SHARE = { off: 0, sampled: 0.1, all: 1 }; // share of sessions recorded
export const EVENTS_PER_SESSION = { autocapture: 25, perPlanned: 0.6, junkMult: 4 }; // [design] autocapture fires on every click/pageview; a hand-tracked "api_request" fires many times per session
export const ADBLOCK_UNDERCOUNT = { b2c: 0.25, smb: 0.15, ent: 0.1 }; // [design] research §4 failure mode "ad blockers undercounting (use reverse proxy)"
export const SPLIT_USERS = 0.15; // [design] identify/alias bugs split users: ~15% of people counted twice
export const SEATS = { b2c: 1, smb: 2, ent: 8 }; // [design] tracked users per paying account
export const UNIQUE_VISITOR_SHARE = 0.75; // [design] monthly unique visitors / daily-visit sum
export const DRIFT = { amplitudeNoTaxonomy: 0.04, default: 0.015, reviewHours: 1 }; // [design] monthly decay of plan quality as events get added ad hoc

// ---------------- CDP ----------------
export const DESTINATIONS = {
  crm: 'CRM (HubSpot / Attio)', lifecycle: 'Lifecycle email (Loops / Customer.io)', warehouse: 'Warehouse (BigQuery / Postgres)', ads: 'Ad platforms (conversion API)', support: 'Helpdesk (user context)',
};
export const SEGMENT = {
  setupHours: 4, perDestinationHours: 0.5, monthlyHours: 0.25, freeMtu: 1000, teamPrice: 120, teamMtu: 10000, overPer1k: 12, // overPer1k [design]: Business is custom-quoted
  price: 'Free 1,000 MTU; Team $120/mo (10K MTU); Business custom [3p, dev-data.md §4]. Above 10K MTU we extrapolate $12 per 1K MTU [design].',
};
export const DIRECT_DEST = { setupHours: 2, monthlyHours: 0.25, disagreeP: 0.12, disagreeHours: 1.5 }; // [design] hand-wired integrations drift apart

// ---------------- BI and internal tools ----------------
export const BI_TOOLS = {
  none: { name: 'No BI (Stripe dashboard + spreadsheets)', available: true, answers: true, monthly: 0, setupHours: 0, upkeepMonthly: 0 },
  metabase_oss: {
    name: 'Metabase OSS (self-hosted)', status: 'active', verdict: 'KEEP', available: true, fit: 'any', answers: true, monthly: 15, monthlyCategory: 'hosting', setupHours: 3, upkeepMonthly: 0.5,
    paradigm: 'Question builder (no SQL) + SQL editor + dashboards on your app DB. Free license; you host and upgrade it.', price: 'Open source free; hosting about $15/mo [design]',
  },
  metabase_starter: {
    name: 'Metabase Starter (cloud)', status: 'active', verdict: 'KEEP', available: true, fit: 'any', answers: true, monthly: 100, setupHours: 1.5, upkeepMonthly: 0.1,
    paradigm: 'Same question builder, hosted: 5 users included.', price: 'About $100/mo for 5 users, $6/extra [3p, dev-data.md §5]',
  },
  hex: {
    name: 'Hex', status: 'active', verdict: 'KEEP (Series A+)', available: true, fit: 'seriesA', answers: true, monthly: 36 + 25, setupHours: 2, upkeepMonthly: 0.25, needsWarehouse: true, sql: true,
    paradigm: 'Notebooks (SQL + Python) to published data apps, plus Threads (AI chat) over a governed semantic layer. Built for a data person on a warehouse.',
    price: 'Professional $36/editor/mo + compute/AI usage (about $25/mo here [design]) [3p, dev-data.md §5]',
  },
  retool: {
    name: 'Retool', status: 'active', verdict: 'KEEP (internal tools, not BI)', available: true, fit: 'any', answers: false, monthly: 50, setupHours: 4, upkeepMonthly: 0.25, internal: true,
    paradigm: 'Drag-and-drop UI bound to queries and APIs with WRITE actions (refund, ban user): admin panels and support consoles, not analysis.',
    price: 'About $50/user/mo [3p, single source, dev-data.md §5]',
  },
};
export const BI_NOTES = [
  { name: 'Chartio', status: 'dead', note: 'Bought by Atlassian in 2021; the service shut on 2022-03-01 [3p, dev-data.md §5].' },
  { name: 'Mode', status: 'outdated', note: 'Bought by ThoughtSpot for $200M (closed 2023-07-19); no clear startup positioning since. Not recommended for new startups [verified acquisition; current state unverified].' },
  { name: 'Redash (hosted)', status: 'dead', note: 'Hosted service ended 2021 (Databricks); OSS Redash is near-dormant (about one release a year). Use Metabase [3p, dev-data.md §5].' },
];
export const DATA_SOURCES = {
  prod: { name: 'Production database (direct)', setupHours: 0.25, monthly: 0, loadP: 0.06, dashboardLoadMonthly: 0.05, note: 'Zero setup. Heavy queries slow the app for customers; no semantic layer, so definitions drift.' },
  replica: { name: 'Read replica', setupHours: 1.5, monthly: 15, loadP: 0, note: 'Copy of the app DB for queries: no customer-facing load. About $15/mo [design].' },
  warehouse: { name: 'Warehouse (BigQuery / Postgres + ELT from Stripe and events)', setupHours: 8, monthly: 50, loadP: 0, joins: true, note: 'Joins Stripe, product events and the app DB. 8 h setup, about $50/mo [design]. Hex needs one.' },
};
export const ADMIN_PANEL = { lookupShare: 0.3, lookupHours: 0.15, panelMult: 0.25 }; // [design] ~30% of tickets need a DB lookup, ~9 min by hand in SQL; an admin panel cuts it to a quarter

// ---------------- Metric definitions and questions ----------------
export const DEFINITIONS = {
  mrr: { label: 'MRR', options: [
    { id: 'normalized', ok: true, label: 'Active paid subscriptions, normalized to monthly (annual / 12), net of discounts; excludes trials and one-off charges' },
    { id: 'charges', ok: false, label: 'All Stripe charges collected this month' },
    { id: 'with_trials', ok: false, label: 'All subscriptions at list price, including trials' },
  ] },
  active: { label: 'Active customer', options: [
    { id: 'paying', ok: true, label: 'An account with an active or past-due paid subscription' },
    { id: 'logged_in', ok: false, label: 'Anyone who logged in this month' },
    { id: 'all_signups', ok: false, label: 'Every account ever created that has not deleted itself' },
  ] },
  churn: { label: 'Logo churn', options: [
    { id: 'start_base', ok: true, label: 'Paying accounts that canceled in the month / paying accounts at the start of the month' },
    { id: 'all_signups', ok: false, label: 'Cancellations / all signups, trials included' },
    { id: 'net', ok: false, label: 'Net change in customer count (new minus canceled)' },
  ] },
  activation: { label: 'Activation', options: [
    { id: 'core_action', ok: true, label: 'Completed the core action within 7 days of signup' },
    { id: 'logged_in', ok: false, label: 'Logged in at least once after signup' },
    { id: 'any_click', ok: false, label: 'Any click after signup (autocapture default)' },
  ] },
};
export const DEFINITION_HOURS = 1;

export const QUESTIONS = [
  { id: 'mrr_trend', text: 'MRR by month for the last 6 months, split into new, expansion and churned', depth: 1, metric: 'mrr' },
  { id: 'logo_churn', text: 'Monthly logo churn for the last two quarters', depth: 1, metric: 'churn' },
  { id: 'active_customers', text: 'How many active paying customers, and how many are on annual plans?', depth: 1, metric: 'active' },
  { id: 'nrr_cohort', text: 'Net revenue retention by signup cohort', depth: 2, metric: 'mrr' },
  { id: 'cac_payback', text: 'CAC payback by acquisition channel', depth: 2, metric: 'mrr' },
  { id: 'activation_paid', text: 'Do users who activate in week 1 convert to paid more than those who do not?', depth: 3, metric: 'activation', product: true },
  { id: 'feature_retention', text: 'Do accounts that use your newest feature retain better?', depth: 3, metric: 'activation', product: true },
];
const QBY = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
// Founder hours to answer one question by depth [design]: research §5 "Metabase makes the CEO answer own questions in
// minutes"; by hand = Stripe export + SQL + spreadsheet.
export const ANSWER_HOURS = {
  manual: { 1: 2, 2: 4, 3: 8 },
  bi: { 1: 0.5, 2: 1, 3: 2 },
  hex: { 1: 0.75, 2: 1, 3: 1.5 },
  posthog_sql: { 1: 1.5, 2: 2.5, 3: 1 },
};
export const RECONCILE_HOURS = 0.5;
export const P_WRONG = { manual: 0.12, bi: 0.1, biDefs: 0.03, hex: 0.08, hexDefs: 0.02, posthog_sql: 0.06, wrongDef: 0.5, guess: 0.6 }; // [design]
export const CATCH_BUG = { manual: 0.15, bi: 0.2, biDefs: 0.45, hex: 0.6, posthog_sql: 0.3, reconcile: 0.4, audit: { tool: 0.7, none: 0.35 }, auditHours: 2 }; // [design]
export const QUESTION_RATE = { board: 2, raising: 4, insiders: 1, none: 0 }; // per month [design]
export const DUE_DAYS = { board: 7, raising: 3, insiders: 7 };
export const WRONG_FOUND = { p: 0.7, days: [20, 60] }; // [design] diligence / the board reconciles later
export const BUG_KINDS = [
  { id: 'trials_in_mrr', metric: 'mrr', text: 'trialing subscriptions were counted in MRR' },
  { id: 'annual_not_normalized', metric: 'mrr', text: 'annual plans were counted at their full annual price in one month' },
  { id: 'test_accounts', metric: 'active', text: 'internal and test accounts were counted as customers' },
  { id: 'duplicate_users', metric: 'activation', text: 'users were split across devices, double-counting signups' },
];
export const SERIES_A_RAISED = 3e6; // [design] cumulative equity raised that counts as "Series A+" for stage fit

// ---------------- State ----------------
export function ensureStack(state) {
  state.apps ??= {};
  const ins = (state.apps.insights ??= {});
  if (!ins.stack) {
    // Old saves (analytics already running) keep the old behaviour: assume PostHog with autocapture and a basic plan.
    const legacy = (ins.daily?.length ?? 0) > 0 || (ins.experiments?.length ?? 0) > 0 || (ins.pmf?.surveys?.length ?? 0) > 0;
    ins.stack = { legacy, vendor: legacy ? 'posthog' : null };
  }
  const st = ins.stack;
  st.plan ??= { events: [], props: false, designedDay: null };
  st.identify ??= false; st.proxy ??= false; st.autocapture ??= st.vendor ? ANALYTICS_VENDORS[st.vendor]?.autocapture ?? false : false;
  st.recordings ??= 'off'; st.cap ??= null; st.drift ??= 0; st.taxonomy ??= false;
  st.cdp ??= null; st.destinations ??= [];
  st.bi ??= 'none'; st.source ??= null; st.definitions ??= {}; st.adminPanel ??= 'none';
  st.usage ??= { events: 0, recordings: 0, visits: 0, droppedDay: null };
  st.bills ??= []; st.questions ??= []; st.bug ??= null; st.history ??= []; st.log ??= [];
  return st;
}
const log = (st, day, text) => { st.log.unshift({ day, text }); if (st.log.length > 40) st.log.length = 40; };

export const raisedTotal = (state) => (state.bank?.txns ?? []).filter((t) => t.category === 'investment' && t.amount > 0).reduce((a, t) => a + t.amount, 0);
export const isSeriesA = (state) => raisedTotal(state) >= SERIES_A_RAISED;
export const vendorOf = (state) => ANALYTICS_VENDORS[ensureStack(state).vendor] ?? null;
/** True once the player has a product analytics tool (or an old save assumed one). */
export const hasAnalytics = (state) => !!vendorOf(state);
/** Vendor feature check. Old saves: everything on. No vendor: nothing. */
export function hasFeature(state, f) {
  const st = ensureStack(state);
  if (st.legacy && st.vendor === 'posthog') return true;
  return !!vendorOf(state)?.features?.[f];
}
/** Hours to do a lab task the vendor does not support natively (Typeform + email; hand-rolled flag + manual readout). */
export const MISSING_FEATURE_HOURS = { surveys: 1, experiments: 2.5 }; // [design]
export const missingFeatureHours = (state, f) => (hasAnalytics(state) && !hasFeature(state, f) ? MISSING_FEATURE_HOURS[f] ?? 0 : 0);

export function planScore(plan) {
  const ev = (plan?.events ?? []).map((id) => EV[id]).filter(Boolean);
  if (!ev.length) return 0;
  const key = ev.filter((e) => e.key).length / 3;
  const useful = Math.min(2, ev.filter((e) => e.useful).length) / 2;
  const junk = ev.filter((e) => e.junk).length;
  return clamp(0.6 * key + 0.25 * useful + (plan.props ? 0.15 : 0) - 0.1 * junk - (ev.length > 12 ? 0.1 : 0), 0, 1);
}
const inPlan = (st, id) => st.plan.events.includes(id);

/** Data quality 0..1 and why. null when the old save assumed a clean setup or there is no tool. */
export function dataQuality(state) {
  const st = ensureStack(state);
  const v = vendorOf(state);
  if (!v || st.legacy) return null;
  const why = [];
  let q;
  const ps = planScore(st.plan);
  if (!st.plan.events.length) { q = st.autocapture ? 0.45 : 0.15; why.push(st.autocapture ? 'no tracking plan: autocapture only (unnamed clicks and pageviews)' : 'no tracking plan and no autocapture: almost nothing is tracked'); }
  else {
    q = 0.35 + 0.6 * ps;
    if (ps < 0.6) why.push(`tracking plan covers ${Math.round(ps * 100)}% of what it should`);
    if (st.plan.events.some((id) => EV[id]?.junk)) why.push('junk events in the plan');
  }
  if (!st.identify) { q *= 1 - SPLIT_USERS; why.push('no identify() on login: users split across devices'); }
  if (!st.proxy) { q *= 0.9; why.push('no reverse proxy: ad blockers drop events'); }
  if (st.drift > 0.005) { q *= 1 - st.drift; why.push(`plan drift ${Math.round(st.drift * 100)}% (ad-hoc events since the last review)`); }
  const extra = st.destinations.length;
  if (extra >= 2 && !st.cdp) { q *= 1 - 0.03 * (extra - 1); why.push('several hand-wired destinations disagree'); }
  return { q: round2(clamp(q, 0.05, 0.98)), why, plan: round2(ps) };
}

/** Can the player target or measure this role (signup / activation / aha / paid)? Old saves and no-tool games: model-level yes. */
export function tracked(state, role) {
  const st = ensureStack(state);
  if (st.legacy || !st.vendor) return true;
  const id = { signup: 'signup', activation: 'activated', aha: 'aha', paid: 'subscribed' }[role];
  return inPlan(st, id) || (role === 'signup' && st.autocapture);
}

/**
 * What the analytics tool SHOWS for the activation funnel (the simulation keeps the truth). Signups and paid come from
 * Stripe. Returns { activated, aha, note } where a null count means "not tracked".
 */
export function measuredFunnel(state, { signups, activated, aha }) {
  const st = ensureStack(state);
  if (st.legacy) return { activated, aha, note: null };
  if (!st.vendor) return { activated: null, aha: null, note: 'No product analytics tool: activation is not tracked. Signups and paid come from Stripe.' };
  const under = st.proxy ? 1 : 1 - (ADBLOCK_UNDERCOUNT[state.company?.model] ?? 0.15);
  const out = { note: null };
  if (inPlan(st, 'activated')) out.activated = Math.round(activated * under);
  else if (st.autocapture) { out.activated = Math.round(Math.min(signups, activated + (signups - activated) * 0.5)); out.note = 'Autocapture only: "activated" here is any click after signup, so it reads high.'; }
  else { out.activated = null; out.note = 'Your plan has no activation event: the funnel stops at signup.'; }
  out.aha = inPlan(st, 'aha') ? Math.round(aha * under) : null;
  if (!st.proxy && out.activated != null) out.note = `${out.note ? `${out.note} ` : ''}No reverse proxy: ad blockers hide about ${Math.round((1 - under) * 100)}% of events.`;
  return out;
}

// ---------------- Actions (each returns { ok, hours, msg }; the caller charges hours via ctx.act) ----------------
export function chooseVendorHours(state, id, { taxonomy = false } = {}) {
  const v = ANALYTICS_VENDORS[id];
  const st = ensureStack(state);
  if (!v?.available) return 0;
  return round2(v.setupHours + (st.vendor ? st.plan.events.length * v.eventHours : 0) + (id === 'amplitude' && taxonomy ? v.taxonomyHours : 0));
}
export function chooseVendor(state, id, { taxonomy = false } = {}) {
  const v = ANALYTICS_VENDORS[id];
  const st = ensureStack(state);
  if (!v) return { ok: false, msg: 'Unknown vendor.' };
  if (!v.available) return { ok: false, msg: `${v.name}: ${v.note}` };
  if (st.vendor === id) return { ok: false, msg: `Already on ${v.name}.` };
  const prev = st.vendor;
  const hours = chooseVendorHours(state, id, { taxonomy });
  if (prev) {
    st.history.push({ vendor: prev, until: state.day });
    const lost = st.history.length;
    logMistake(state, { functionId: FN, id: 'analytics_migration', label: 'Switched product analytics vendor', app: 'insights', circles: true,
      cost: { hours: round2(hours), days: 30 },
      detail: `Moved from ${ANALYTICS_VENDORS[prev]?.name} to ${v.name}: every event re-instrumented and identity re-wired; funnels and retention start again from ${lost > 1 ? 'zero, again' : 'zero'} (history does not migrate). A stellar operator picks the tool that fits the next 18 months once.` });
    st.identify = false; st.proxy = false; // SDK swap: both have to be redone
  }
  st.vendor = id; st.legacy = false; st.autocapture = v.autocapture; st.taxonomy = id === 'amplitude' ? !!taxonomy : false; st.drift = 0;
  st.since = state.day;
  if (!v.features.replay) st.recordings = 'off';
  if (v.fit === 'seriesA' && !isSeriesA(state)) {
    logMistake(state, { functionId: FN, id: 'analytics_overkill', label: `${v.name} before Series A`, app: 'insights',
      cost: { hours: round2(hours - ANALYTICS_VENDORS.posthog.setupHours) },
      detail: `${v.name} is built for a data team with a governed taxonomy; ${money(raisedTotal(state))} raised and no data owner. Setup took ${round2(hours)} h vs ${ANALYTICS_VENDORS.posthog.setupHours} h for PostHog, plus ${v.governanceWeekly} h a week of governance. A stellar operator starts on PostHog or Mixpanel and moves when a data hire owns the taxonomy.` });
  }
  log(st, state.day, `Installed ${v.name}${prev ? ` (migrated from ${ANALYTICS_VENDORS[prev]?.name})` : ''}.`);
  return { ok: true, hours: round2(hours), msg: `${v.name} installed.` };
}

/** Write or rewrite the tracking plan. Hours: 1 h to design + per-event instrumentation for new events. */
export function setTrackingPlan(state, { events = [], props = false } = {}) {
  const st = ensureStack(state);
  const v = vendorOf(state);
  const clean = [...new Set(events)].filter((id) => EV[id]);
  const added = clean.filter((id) => !st.plan.events.includes(id)).length;
  const per = v?.eventHours ?? 0.5;
  const hours = 1 + added * per + (props && !st.plan.props ? 0.5 : 0) + (st.taxonomy ? added * 0.25 : 0);
  st.plan = { events: clean, props: !!props, designedDay: state.day };
  st.drift = 0;
  log(st, state.day, `Tracking plan: ${clean.length} events${props ? ' with plan/source properties' : ''}.`);
  return { ok: true, hours: round2(hours), msg: `Tracking plan saved (${clean.length} events).` };
}
export const reviewPlan = (state) => { const st = ensureStack(state); st.drift = 0; st.plan.designedDay = state.day; return { ok: true, hours: DRIFT.reviewHours, msg: 'Tracking plan reviewed: duplicate and dead events cleaned up.' }; };

export function setInstrumentation(state, { identify, proxy, autocapture, recordings, cap } = {}) {
  const st = ensureStack(state);
  const v = vendorOf(state);
  if (!v) return { ok: false, hours: 0, msg: 'Pick a product analytics tool first.' };
  let hours = 0;
  if (identify != null && !!identify !== st.identify) { if (identify) hours += v.identifyHours; st.identify = !!identify; }
  if (proxy != null && !!proxy !== st.proxy) { if (proxy) hours += v.proxyHours; st.proxy = !!proxy; }
  if (autocapture != null) st.autocapture = !!autocapture;
  if (recordings != null && RECORDING_SHARE[recordings] != null) { st.recordings = v.features.replay ? recordings : 'off'; hours += 0.1; }
  if (cap !== undefined) st.cap = v.caps && cap != null && cap !== '' && Number.isFinite(Number(cap)) ? Math.max(0, Number(cap)) : null;
  return { ok: true, hours: round2(hours), msg: 'Instrumentation updated.' };
}

export function setCdp(state, { segment, destinations = [] } = {}) {
  const st = ensureStack(state);
  const dests = [...new Set(destinations)].filter((d) => DESTINATIONS[d]);
  const added = dests.filter((d) => !st.destinations.includes(d)).length;
  let hours;
  if (segment) hours = (st.cdp ? 0 : SEGMENT.setupHours) + (st.cdp ? added : dests.length) * SEGMENT.perDestinationHours;
  else hours = added * DIRECT_DEST.setupHours;
  st.cdp = segment ? 'segment' : null;
  st.destinations = dests;
  if (segment && dests.length < 2) {
    logMistake(state, { functionId: FN, id: 'cdp_one_destination', label: 'Segment with one or two tools', app: 'insights', key: `cdp_few:${monthKey(state)}`,
      cost: { hours: round2(hours) },
      detail: `Segment routes events to ${dests.length} destination(s) besides analytics. A CDP pays off when one event stream feeds many tools; with ${dests.length} it is an extra hop, an extra bill (MTU counts anonymous visitors) and an extra place for events to break. A stellar operator sends events straight to PostHog and adds a CDP at 3+ destinations.` });
  }
  return { ok: true, hours: round2(hours), msg: segment ? `Segment routing to ${dests.length} destination(s).` : `${dests.length} direct integration(s).` };
}

export function setBi(state, { tool, source } = {}) {
  const st = ensureStack(state);
  let hours = 0;
  const t = BI_TOOLS[tool] ? tool : st.bi;
  const src = DATA_SOURCES[source] ? source : st.source;
  if (t !== st.bi) hours += BI_TOOLS[t].setupHours;
  if (src && src !== st.source) hours += DATA_SOURCES[src].setupHours;
  if (BI_TOOLS[t].needsWarehouse && src !== 'warehouse') return { ok: false, hours: 0, msg: 'Hex runs on a warehouse: set up the warehouse source first (8 h).' };
  st.bi = t; st.source = t === 'none' ? null : src ?? 'prod';
  const tool0 = BI_TOOLS[t];
  if (tool0.fit === 'seriesA' && !isSeriesA(state)) {
    logMistake(state, { functionId: FN, id: 'hex_too_early', label: `${tool0.name} before a data team`, app: 'insights', key: `hex_early:${state.day}`,
      cost: { hours: round2(hours), usd: tool0.monthly * 3 },
      detail: `${tool0.name} is notebooks and a semantic layer for someone who writes SQL and Python on a warehouse; with ${money(raisedTotal(state))} raised it is ${round2(hours)} h of setup and about ${money(tool0.monthly + DATA_SOURCES.warehouse.monthly)}/mo for questions Metabase answers in minutes. A stellar operator starts on Metabase on a read replica.` });
  }
  if (t === 'retool') {
    logMistake(state, { functionId: FN, id: 'retool_as_bi', label: 'Bought Retool for dashboards', app: 'insights', key: `retool_bi:${state.day}`,
      cost: { hours: round2(hours) },
      detail: 'Retool builds internal tools that write (refunds, user admin); it is not a BI tool, so metric questions are still answered by hand. A stellar operator uses Retool for the admin panel and Metabase for questions.' });
  }
  log(st, state.day, `BI: ${tool0.name}${st.source ? ` on ${DATA_SOURCES[st.source].name}` : ''}.`);
  return { ok: true, hours: round2(hours), msg: `${tool0.name} connected.` };
}

export function setAdminPanel(state, kind) {
  const st = ensureStack(state);
  if (!['none', 'retool', 'built'].includes(kind) || kind === st.adminPanel) return { ok: false, hours: 0, msg: 'No change.' };
  st.adminPanel = kind;
  return { ok: true, hours: kind === 'retool' ? BI_TOOLS.retool.setupHours : kind === 'built' ? 12 : 0, msg: kind === 'retool' ? 'Retool admin panel built (user lookup, refund, plan change).' : kind === 'built' ? 'Hand-built admin pages shipped.' : 'Admin panel removed.' };
}

export function setDefinitions(state, defs = {}) {
  const st = ensureStack(state);
  for (const [k, v] of Object.entries(defs)) if (DEFINITIONS[k]?.options.some((o) => o.id === v)) st.definitions[k] = v;
  return { ok: true, hours: DEFINITION_HOURS, msg: 'Metric definitions saved.' };
}
const defState = (st, metric) => { const id = st.definitions[metric]; if (!id) return 'none'; return DEFINITIONS[metric].options.find((o) => o.id === id)?.ok ? 'ok' : 'wrong'; };
export const definitionsOk = (st) => Object.keys(DEFINITIONS).every((k) => defState(st, k) === 'ok');

// ---------------- Metric questions ----------------
export function questionAudience(state) {
  const fr = state.apps?.fundraising;
  if ((fr?.rounds ?? []).some((r) => r.instrument === 'priced')) return 'board';
  if (fr?.raise && fr.raise.status === 'active') return 'raising';
  if ((fr?.investors ?? []).some((i) => i.status === 'committed' && i.closedDay != null)) return 'insiders';
  return 'none';
}
const AUDIENCE_LABEL = { board: 'A board member', raising: 'An investor in your raise', insiders: 'One of your angels' };

export function askQuestion(state, { qid = null, from = null } = {}) {
  const st = ensureStack(state);
  const aud = from ?? questionAudience(state);
  const pool = QUESTIONS.filter((q) => !st.questions.some((x) => x.qid === q.id && x.status === 'open'));
  const q = qid ? QBY[qid] : pool[Math.floor(rng(state) * pool.length)];
  if (!q) return null;
  const item = { id: uid('mq'), qid: q.id, from: aud, asker: AUDIENCE_LABEL[aud] ?? 'You', day: state.day, dueDay: state.day + (DUE_DAYS[aud] ?? 7), status: 'open' };
  st.questions.unshift(item);
  if (st.questions.length > 60) st.questions.length = 60;
  return item;
}

/** Answer methods available now: manual always; the BI tool if it answers; PostHog SQL if on PostHog. */
export function answerMethods(state) {
  const st = ensureStack(state);
  const out = ['manual'];
  if (BI_TOOLS[st.bi]?.answers && st.bi !== 'none') out.push(st.bi === 'hex' ? 'hex' : 'bi');
  if (st.vendor === 'posthog' && !st.legacy) out.push('posthog_sql');
  return out;
}
export function answerHours(state, item, method, { reconcile = false } = {}) {
  const st = ensureStack(state);
  const q = QBY[item.qid];
  let d = q.depth;
  // Metabase on a non-warehouse source cannot join events with Stripe: deep product questions become a long SQL job.
  if (method === 'bi' && q.product && st.source !== 'warehouse') d = 3;
  let h = ANSWER_HOURS[method]?.[d] ?? ANSWER_HOURS.manual[d];
  if (method === 'posthog_sql' && !q.product) h = ANSWER_HOURS.posthog_sql[q.depth]; // revenue questions are awkward in an events tool
  if (method === 'manual' && st.bi === 'retool') h *= 1.2; // exporting through a CRUD app [design]
  return round2(h + (reconcile ? RECONCILE_HOURS : 0));
}

export function answerQuestion(state, id, { method = 'manual', reconcile = false } = {}) {
  const st = ensureStack(state);
  const item = st.questions.find((x) => x.id === id);
  if (!item || item.status !== 'open') return { ok: false, hours: 0, msg: 'No open question.' };
  if (!answerMethods(state).includes(method)) method = 'manual';
  const q = QBY[item.qid];
  const hours = answerHours(state, item, method, { reconcile });
  const dq = dataQuality(state);
  const ds = defState(st, q.metric);
  const hasDefs = ds === 'ok';
  let pWrong = method === 'bi' ? (hasDefs ? P_WRONG.biDefs : P_WRONG.bi) : method === 'hex' ? (hasDefs ? P_WRONG.hexDefs : P_WRONG.hex) : P_WRONG[method] ?? P_WRONG.manual;
  if (ds === 'wrong') pWrong += P_WRONG.wrongDef;
  if (q.product) {
    if (!tracked(state, 'activation') || !hasAnalytics(state)) pWrong = Math.max(pWrong, P_WRONG.guess);
    else if (dq) pWrong += (1 - dq.q) * 0.5;
  }
  // A live metric bug in this metric: caught (and fixed) or it poisons the answer.
  let caught = false;
  if (st.bug && st.bug.metric === q.metric) {
    const cKey = method === 'bi' ? (hasDefs ? 'biDefs' : 'bi') : method;
    const pc = clamp((CATCH_BUG[cKey] ?? CATCH_BUG.manual) + (reconcile ? CATCH_BUG.reconcile : 0), 0, 0.95);
    if (chance(state, pc)) { caught = true; item.caughtBug = st.bug.text; st.bug = null; }
    else pWrong = Math.max(pWrong, 0.85);
  }
  if (reconcile && !caught) pWrong *= 0.5; // cross-checking against Stripe and the bank catches most slips
  const wrong = chance(state, clamp(pWrong, 0, 0.95));
  const late = state.day > item.dueDay;
  Object.assign(item, { status: 'answered', answeredDay: state.day, method, reconcile, hours, wrong, late });
  if (wrong) item.discoverDay = state.day + Math.round(lerp(WRONG_FOUND.days[0], WRONG_FOUND.days[1], rng(state)));
  let incident = false;
  if ((method === 'bi' || method === 'hex') && st.source === 'prod' && chance(state, DATA_SOURCES.prod.loadP * q.depth)) incident = true;
  if (late) logMistake(state, { functionId: FN, id: 'slow_metric_answer', label: 'Slow answer to an investor metric question', app: 'insights', cost: { reputation: 0.3, days: state.day - item.dueDay },
    detail: `${item.asker} asked "${q.text}" on day ${item.day}; you answered ${state.day - item.day} days later (expected within ${item.dueDay - item.day}). Slow answers read as a team that does not know its numbers. A stellar operator has the board metrics one query away.` });
  return { ok: true, hours, wrong, caught, incident, msg: caught ? `While answering you found a metric bug: ${item.caughtBug}. Fixed before it went out.` : 'Answer sent.' };
}

/** Audit the metrics (reconcile BI vs Stripe vs bank). Catches a live bug with good odds when a BI tool and definitions exist. */
export function auditMetrics(state) {
  const st = ensureStack(state);
  const p = st.bi !== 'none' && BI_TOOLS[st.bi]?.answers && definitionsOk(st) ? CATCH_BUG.audit.tool : CATCH_BUG.audit.none;
  let found = null;
  if (st.bug && chance(state, p)) { found = st.bug.text; st.bug = null; }
  st.lastAuditDay = state.day;
  return { ok: true, hours: CATCH_BUG.auditHours, found, msg: found ? `Audit found a metric bug: ${found}. Fixed.` : 'Audit done: Stripe, bank and dashboards reconcile as far as you can tell.' };
}

/** Log the cost of a BI load incident on the production DB (the caller raises the incident itself). */
export function biLoadMistake(state, cause) {
  return logMistake(state, { functionId: FN, id: 'bi_on_prod', label: 'BI query took down production', app: 'insights', key: `biload:${state.day}`, cost: { hours: 1.5, reputation: 0.2 },
    detail: `${cause}: customers saw a slow or failing app while a report ran. Querying the production DB is zero setup until it is an incident. A stellar operator points BI at a read replica (1.5 h, about $15/mo).` });
}

// ---------------- Daily / monthly ticks ----------------
// Upkeep and lookups the data stack forces: charged in full past the weekly plan (core/state.js forceHours).
const chargeFounder = (state, hours, label) => forceHours(state, hours, label, { functionId: 'data_stack' });

/**
 * Daily: usage metering, governance and lookup hours, question generation, wrong-answer discovery.
 * input: { sessions, visitors, accounts, tickets7 }. Returns { incidents: [cause] } for the caller to raise.
 */
export function stackDay(state, { sessions = 0, visitors = 0, accounts = 0, tickets7 = 0 } = {}) {
  const st = ensureStack(state);
  const out = { incidents: [] };
  const v = vendorOf(state);
  if (v && !st.legacy) {
    const planned = st.plan.events.reduce((a, id) => a + (EV[id]?.junk ? EVENTS_PER_SESSION.junkMult : EVENTS_PER_SESSION.perPlanned), 0);
    const perSession = (st.autocapture ? EVENTS_PER_SESSION.autocapture : 0) + planned;
    st.usage.events += Math.round(sessions * perSession + visitors * (st.autocapture ? 4 : 0.5)); // [design] visitors fire pageviews too
    st.usage.recordings += Math.round((sessions + visitors) * (RECORDING_SHARE[st.recordings] ?? 0));
  }
  st.usage.visits += visitors;
  st.usage.accounts = accounts;
  const dow = (state.day ?? 0) % 7;
  if (dow === 0) {
    if (v?.governanceWeekly && !st.legacy) chargeFounder(state, v.governanceWeekly, `${v.name} taxonomy governance`);
    const lookups = tickets7 * ADMIN_PANEL.lookupShare * ADMIN_PANEL.lookupHours * (st.adminPanel === 'none' ? 1 : ADMIN_PANEL.panelMult);
    if (lookups >= 0.05) chargeFounder(state, round2(lookups), st.adminPanel === 'none' ? 'Manual DB lookups for support tickets' : 'Support lookups (admin panel)');
  }
  // Investor / board metric questions.
  const aud = questionAudience(state);
  if (QUESTION_RATE[aud] && chance(state, QUESTION_RATE[aud] / 30)) {
    const it = askQuestion(state, { from: aud });
    if (it) notify(state, `${it.asker} asks: "${QBY[it.qid].text}" Due ${it.dueDay - it.day} days. Open Product analytics → Data stack.`, { type: 'info', app: 'insights' });
  }
  for (const it of st.questions) {
    if (it.status === 'open' && state.day > it.dueDay + 7) {
      it.status = 'expired';
      logMistake(state, { functionId: FN, id: 'unanswered_metric_question', label: 'Never answered an investor metric question', app: 'insights', cost: { reputation: 0.5 },
        detail: `${it.asker} asked "${QBY[it.qid].text}" and never got an answer. A stellar operator answers within days, with numbers that reconcile to Stripe.` });
    }
    if (it.status === 'answered' && it.wrong && it.discoverDay && state.day >= it.discoverDay && !it.discovered) {
      it.discovered = true;
      if (chance(state, WRONG_FOUND.p)) {
        it.found = true;
        logMistake(state, { functionId: FN, id: 'wrong_metric_to_investor', label: 'Sent an investor a wrong metric', app: 'insights', delayed: true, cost: { hours: 3, reputation: 1 }, charge: true,
          detail: `The number you sent for "${QBY[it.qid].text}" (day ${it.answeredDay}, ${it.method === 'manual' ? 'by hand' : it.method}) did not reconcile with Stripe when ${it.from === 'board' ? 'the board' : 'diligence'} checked. Correction email and a credibility hit. A stellar operator writes metric definitions once and reconciles against Stripe before sending.` });
        notify(state, `A metric you sent ${it.from === 'board' ? 'the board' : 'an investor'} turned out wrong. See the Scorecard.`, { type: 'bad', app: 'insights' });
      }
    }
  }
  // Dashboards refreshing on the production DB: occasional load incident.
  if (st.bi !== 'none' && st.source === 'prod' && chance(state, DATA_SOURCES.prod.dashboardLoadMonthly / 30)) out.incidents.push('A BI dashboard query on the production database locked tables');
  return out;
}

function analyticsBill(v, st, mtu) {
  if (!v || st.legacy) return { amount: 0, parts: [] };
  const parts = [];
  if (v.billing === 'events') {
    const ev = Math.max(0, st.usage.events - v.freeEvents) * v.perEvent;
    if (ev > 0) parts.push(['events', ev]);
    let rec = Math.max(0, st.usage.recordings - (v.freeRecordings ?? 0)) * (v.perRecording ?? 0);
    if (rec > 0) parts.push(['recordings', rec]);
  } else if (v.billing === 'mtu') {
    if (mtu > v.plusMtu) parts.push(['Growth contract', v.growthMonthly]);
    else if (mtu > v.freeMtu) parts.push(['Plus', v.plusPrice]);
  }
  let amount = parts.reduce((a, [, x]) => a + x, 0);
  let capped = false;
  if (st.cap != null && v.caps && amount > st.cap) { amount = st.cap; capped = true; }
  return { amount: round2(amount), parts, capped };
}
export function segmentBill(mtu) {
  if (mtu <= SEGMENT.freeMtu) return 0;
  if (mtu <= SEGMENT.teamMtu) return SEGMENT.teamPrice;
  return SEGMENT.teamPrice + Math.ceil((mtu - SEGMENT.teamMtu) / 1000) * SEGMENT.overPer1k;
}
export const monthlyMtu = (state) => { const st = ensureStack(state); return Math.round(st.usage.visits * UNIQUE_VISITOR_SHARE + (st.usage.accounts ?? 0) * (SEATS[state.company?.model] ?? 2)); };

/** Month end: bills, drift, overkill hours, garbage-data circles, metric bugs. */
export function stackMonthEnd(state) {
  const st = ensureStack(state);
  const v = vendorOf(state);
  const mk = monthKey(state);
  const mtu = monthlyMtu(state);
  const ab = analyticsBill(v, st, mtu);
  const seg = st.cdp === 'segment' ? segmentBill(mtu) : 0;
  const tool = BI_TOOLS[st.bi];
  const bi = (st.bi !== 'none' ? tool.monthly : 0) + (st.source ? DATA_SOURCES[st.source].monthly : 0) + (st.adminPanel === 'retool' && st.bi !== 'retool' ? BI_TOOLS.retool.monthly : 0);
  const pay = (amount, who, desc, category = 'software') => { if (amount > 0) post(state, { amount: -round2(amount), counterparty: who, description: desc, category, method: 'card' }); };
  if (ab.amount > 0) pay(ab.amount, v.name, `${v.name} usage: ${ab.parts.map(([k, x]) => `${k} ${money(x)}`).join(', ')}${ab.capped ? ' (billing limit hit)' : ''}`);
  if (ab.capped) { st.usage.dropped = true; log(st, state.day, `${v.name} billing limit reached: events and replays beyond it were dropped this month.`); }
  pay(seg, 'Segment', `Segment CDP: ${mtu.toLocaleString('en-US')} MTU`);
  pay(bi, st.bi !== 'none' ? tool.name : 'Data infrastructure', `BI and data: ${st.bi !== 'none' ? tool.name : ''}${st.source ? ` on ${DATA_SOURCES[st.source].name}` : ''}`, st.bi === 'metabase_oss' ? 'hosting' : 'software');
  const prev = st.bills.slice(-3).map((b) => b.analytics);
  const base = prev.length ? prev.reduce((a, x) => a + x, 0) / prev.length : 0;
  if (ab.amount > Math.max(100, 3 * base) && v) {
    const recPart = ab.parts.find(([k]) => k === 'recordings')?.[1] ?? 0;
    notify(state, `${v.name} bill spiked to ${money(ab.amount)} (${ab.parts.map(([k, x]) => `${k} ${money(x)}`).join(', ')}).`, { type: 'bad', app: 'insights' });
    if (recPart > 0 && st.recordings === 'all') logMistake(state, { functionId: FN, id: 'recording_bill_spike', label: 'Recorded every session', app: 'insights', key: `recspike:${mk}`, cost: { usd: round2(Math.max(0, ab.amount - base)) },
      detail: `${st.usage.recordings.toLocaleString('en-US')} recordings this month against ${(v.freeRecordings ?? 0).toLocaleString('en-US')} free: replays were the bill. Nobody watches more than a handful a week. A stellar operator samples 5-10% of sessions, records drop-offs on purpose and sets a billing limit.` });
    else if (v.billing === 'mtu' && ab.parts.some(([k]) => k === 'Growth contract')) logMistake(state, { functionId: FN, id: 'mtu_contract_jump', label: `${v.name} MTU jumped to an annual contract`, app: 'insights', key: `mtujump:${mk}`, cost: { usd: round2(ab.amount - base), hours: 2 }, charge: true,
      detail: `${mtu.toLocaleString('en-US')} monthly tracked users (anonymous visitors count) pushed you past the self-serve tier into a sales-led contract. A stellar operator checks how the vendor meters before traffic grows.` });
    else if (st.autocapture && st.plan.events.length === 0) logMistake(state, { functionId: FN, id: 'autocapture_bill', label: 'Paid for autocapture noise', app: 'insights', key: `autocap:${mk}`, cost: { usd: round2(Math.max(0, ab.amount - base)) },
      detail: `${st.usage.events.toLocaleString('en-US')} events this month, almost all unnamed autocaptured clicks. A stellar operator names the 5-10 events that matter and trims autocapture to what they use.` });
  }
  st.bills.push({ month: mk, analytics: ab.amount, segment: seg, bi: round2(bi), mtu, events: st.usage.events, recordings: st.usage.recordings, capped: !!ab.capped });
  if (st.bills.length > 36) st.bills.shift();
  // Ongoing hours: BI upkeep, CDP / direct destination upkeep, disagreeing tools.
  if (st.bi !== 'none') chargeFounder(state, tool.upkeepMonthly, `${tool.name} upkeep`);
  if (st.cdp) chargeFounder(state, SEGMENT.monthlyHours, 'Segment: schema and destination upkeep');
  else if (st.destinations.length) {
    chargeFounder(state, DIRECT_DEST.monthlyHours * st.destinations.length, 'Maintaining hand-wired analytics integrations');
    if (st.destinations.length >= 2 && chance(state, DIRECT_DEST.disagreeP * (st.destinations.length - 1))) {
      logMistake(state, { functionId: FN, id: 'tools_disagree', label: 'Tools disagree on the same event', app: 'insights', circles: true, charge: true, key: `disagree:${mk}`, cost: { hours: DIRECT_DEST.disagreeHours },
        detail: `${st.destinations.length} tools each wired by hand count signups differently; you spent ${DIRECT_DEST.disagreeHours} h finding which one is right. At 3+ destinations a stellar operator routes one event stream through a CDP (Segment) or the analytics hub.` });
    }
  }
  // Plan drift.
  if (v && !st.legacy && st.plan.events.length) st.drift = round2(clamp(st.drift + (st.vendor === 'amplitude' && !st.taxonomy ? DRIFT.amplitudeNoTaxonomy : st.taxonomy ? 0 : DRIFT.default), 0, 0.5));
  // Garbage data: numbers that do not add up send you in circles.
  const dq = dataQuality(state);
  if (dq && dq.q < 0.5 && (st.usage.accounts ?? 0) >= 5) {
    logMistake(state, { functionId: FN, id: 'garbage_data', label: 'Chased numbers that do not add up', app: 'insights', circles: true, charge: true, key: `garbage:${mk}`, cost: { hours: 2 },
      detail: `Data quality ${Math.round(dq.q * 100)}% (${dq.why.slice(0, 2).join('; ')}). Funnels and dashboards disagreed with Stripe and you spent 2 h working out which to believe. A stellar operator writes a short tracking plan (signup, activation, payment), calls identify() on login and proxies the SDK.` });
  }
  // A metric bug appears now and then; worse with wrong definitions and noisy data.
  if ((st.usage.accounts ?? 0) >= 5 && !st.bug) {
    const wrongDefs = Object.keys(DEFINITIONS).filter((k) => defState(st, k) === 'wrong').length;
    const p = 0.06 + 0.06 * wrongDefs + (dq ? 0.1 * (1 - dq.q) : 0); // [design]
    if (chance(state, p)) { const b = BUG_KINDS[Math.floor(rng(state) * BUG_KINDS.length)]; st.bug = { ...b, day: state.day }; }
  }
  st.usage = { events: 0, recordings: 0, visits: 0, accounts: st.usage.accounts ?? 0 };
}

// ---------------- Operator read ----------------
export function dataStackRead(state) {
  const st = state.apps?.insights?.stack;
  if (!st || st.legacy || (!st.vendor && st.bi === 'none' && !(st.questions ?? []).some((q) => q.status !== 'open'))) return { tier: 'unknown', evidence: [], coaching: ['Pick a product analytics tool and write a short tracking plan.'] };
  const evidence = [], coaching = [];
  let s = 0.55;
  const v = ANALYTICS_VENDORS[st.vendor];
  const seriesA = isSeriesA(state);
  if (!v) { s -= 0.15; evidence.push('no product analytics tool'); coaching.push('Pick a product analytics tool and write a short tracking plan.'); }
  else {
    if (v.fit === 'seriesA' && !seriesA) { s -= 0.15; evidence.push(`${v.name} before Series A`); coaching.push('Start on PostHog or Mixpanel; move to Amplitude when a data owner runs the taxonomy.'); }
    else { s += 0.05; evidence.push(`${v.name} fits the stage`); }
    const ps = planScore(st.plan);
    s += 0.35 * ((st.plan.events.length ? ps : st.autocapture ? 0.3 : 0) - 0.5); // autocapture alone gives some usable data
    evidence.push(st.plan.events.length ? `tracking plan ${Math.round(ps * 100)}% (${st.plan.events.length} events)` : 'no tracking plan');
    if (!st.plan.events.length) coaching.push('Name the 5-10 events that matter (signup, activation, payment) before trusting a funnel.');
    if (st.plan.events.some((id) => EV[id]?.junk)) coaching.push('Drop junk events: autocapture already has clicks and pageviews.');
    s += st.identify ? 0.05 : -0.03;
    s += st.proxy ? 0.04 : -0.01;
    if (!st.identify) coaching.push('Call identify() on login so one person is one user.');
    if (st.recordings === 'all' && st.cap == null) { s -= 0.08; evidence.push('records every session with no billing limit'); coaching.push('Sample 5-10% of sessions and set a billing limit.'); }
    else if (st.recordings === 'sampled') { s += 0.03; evidence.push('sampled replays'); }
  }
  if (st.cdp === 'segment') {
    if (st.destinations.length < 3) { s -= 0.12; evidence.push(`Segment with ${st.destinations.length} destination(s)`); coaching.push('Add a CDP only when one event stream feeds 3+ tools.'); }
    else { s += 0.04; evidence.push(`Segment routing to ${st.destinations.length} tools`); }
  } else if (st.destinations.length >= 3) { s -= 0.04; evidence.push(`${st.destinations.length} hand-wired destinations`); }
  if (st.bi !== 'none') {
    const t = BI_TOOLS[st.bi];
    if (t.fit === 'seriesA' && !seriesA) { s -= 0.12; evidence.push(`${t.name} before a data team`); coaching.push('Start BI on Metabase on a read replica; Hex when someone writes SQL full time.'); }
    if (st.bi === 'retool') { s -= 0.08; evidence.push('Retool used as the BI tool'); coaching.push('Use Retool for admin panels and a BI tool for questions.'); }
    if (st.source === 'prod') { s -= 0.1; evidence.push('BI queries the production database'); coaching.push('Point BI at a read replica or warehouse, never the production DB.'); }
    else if (st.source) { s += 0.04; evidence.push(`BI on a ${st.source === 'replica' ? 'read replica' : 'warehouse'}`); }
  }
  const defs = Object.keys(DEFINITIONS).map((k) => defState(st, k));
  if (defs.some((d) => d === 'wrong')) { s -= 0.12; evidence.push(`${defs.filter((d) => d === 'wrong').length} metric definition(s) wrong`); coaching.push('Write metric definitions once (MRR excludes trials; churn over the starting paying base) and reconcile to Stripe.'); }
  else if (defs.every((d) => d === 'ok')) { s += 0.08; evidence.push('metric definitions written and correct'); }
  const done = (st.questions ?? []).filter((q) => q.status === 'answered' || q.status === 'expired');
  if (done.length) {
    const good = done.filter((q) => q.status === 'answered' && !q.late && !q.wrong).length / done.length;
    const rec = done.filter((q) => q.reconcile).length / done.length;
    s += 0.2 * (good - 0.6) + 0.05 * rec;
    evidence.push(`${done.length} investor metric question(s): ${Math.round(good * 100)}% on time and right, ${Math.round(rec * 100)}% reconciled to Stripe`);
    if (good < 0.8) coaching.push('Reconcile against Stripe before sending numbers to investors.');
  }
  const mist = (state.mistakes ?? []).filter((m) => m.functionId === FN).length;
  if (mist) { s -= Math.min(0.2, 0.04 * mist); evidence.push(`${mist} data-stack mistake(s) logged`); }
  const score = clamp(s, 0, 1);
  const tier = tierFromScore(score);
  if (tier !== 'stellar') coaching.push('What a stellar operator does: PostHog with a short tracking plan, identify and a proxy, sampled replays under a billing limit, no CDP before 3 destinations, Metabase on a read replica with written metric definitions, numbers reconciled before they go out.');
  return { tier, score: round2(score), evidence, coaching };
}
registerOperatorReader(FN, dataStackRead);
