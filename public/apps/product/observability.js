// Observability: which tool watches production, and what it changes. Each vendor has its own paradigm:
//   Sentry       code-level errors grouped by fingerprint, with release, commit and stack. Needs source maps and
//                releases uploaded or issues are unreadable. Seer AI root-cause is billed per ACTIVE CONTRIBUTOR.
//   PostHog      product events first; error tracking bundled in the same event model, shallower (no release/commit
//                workflow). Monitoring hook only here: analytics live in Insights.
//   Better Stack "is it up, who is on call, what do the logs say, tell customers": uptime checks, phone on-call,
//                logs and a status page in one bill. Shallow code errors.
//   Datadog      infrastructure/APM per host; custom metrics and log indexing make surprise bills. Overkill pre-Series A.
//   LogRocket    front-end session replay with console and network. Declining for startups (PostHog and Sentry replay).
//   AppSignal    flat-priced errors + APM + uptime; strongest for Ruby/Elixir shops, niche for a JS stack.
//
// Research: docs/research/tools/2026q4/dev-data.md §1 (all prices third-party aggregator figures, 2026; Seer
// $40/active contributor/mo, contributor = opens 2+ PRs on a Seer repo; LogRocket pricing unstable across sources).
// Fix-time multipliers, detection lags, surprise-bill odds and ops hours are [design].

import { round2, clamp } from '../../core/util.js';
import { addRecurring, post } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { forceHours } from '../../core/state.js';
import { mrr, activeSubs, trialingSubs } from '../../core/stripe.js';
import { productSlice } from './store.js';
import { releasesSlice } from './releases.js';
import { contributorsOf, engineersOf, h01 } from './hosting.js';

export const OBS = {
  sentry: {
    label: 'Sentry', shape: 'flat tier + event quotas', setupH: 1, opsH: 0.25, fix: 1, detect: 'monitoring', uptime: false, status: 'keep',
    price: 'Team $26/mo (50K errors, 5M spans, 50 replays) [third-party]', monthly: () => 26,
    paradigm: 'Error-first: issues grouped by fingerprint with stack trace, breadcrumbs, release and affected users. Slack alert -> open issue -> Seer root cause -> resolve in next release.',
    trap: 'Skipping source maps and release upload: minified stack traces nobody can read, so every fix takes much longer.',
  },
  posthog: {
    label: 'PostHog error tracking (bundled)', shape: 'usage, free 100K exceptions/mo', setupH: 0.5, opsH: 0.25, fix: 1.3, detect: 'monitoring', uptime: false, status: 'keep',
    price: 'Free up to ~100K exceptions/mo, then usage [third-party]', monthly: (n) => (n > 100000 ? round2((n - 100000) / 1000 * 0.37) : 0),
    paradigm: 'One event and person model for analytics, replay, flags and errors. Errors are a side feature: no deep release/commit workflow.',
    trap: 'Fine pre-seed; shallow once you need release health and code-owner triage. Each product is metered separately.',
  },
  betterstack: {
    label: 'Better Stack', shape: 'modular (on-call + add-ons)', setupH: 2, opsH: 0.25, fix: 1.2, detect: 'monitoring', uptime: true, statusPage: true, status: 'keep-alt',
    price: 'Responder ~$29/mo + status page add-on ~$12; logs usage-based; real teams pay $80-150 [third-party, sources disagree]', monthly: (n, a) => round2(29 + 12 + 0.02 * a),
    paradigm: 'Monitor URL -> phone/Slack page -> on-call ack -> incident timeline -> public status page update -> postmortem. Logs with SQL-like queries.',
    trap: 'Modular billing: each add-on is its own line. Code-level errors are shallow next to Sentry.',
  },
  datadog: {
    label: 'Datadog', shape: 'per host, per product', setupH: 10, opsH: 1.5, fix: 1.15, detect: 'monitoring', uptime: true, status: 'keep',
    price: 'Infra Pro ~$15/host/mo + APM ~$31/host/mo, logs and custom metrics extra [third-party, competitor-authored]', monthly: (n, a) => round2(hostsFor(a) * (15 + 31) + 0.05 * a),
    paradigm: 'Infrastructure-first: per-host metrics, APM traces and dashboards for Kubernetes and microservices, run by a platform engineer.',
    trap: 'Custom metrics, high-cardinality tags and indexed logs bill per unit: the classic surprise invoice. Before Series A it is overspend and setup hours for no benefit.',
  },
  logrocket: {
    label: 'LogRocket', shape: 'sessions tiers', setupH: 1.5, opsH: 0.5, fix: 1.1, detect: 'monitoring', uptime: false, status: 'declining',
    price: 'Team ~$69/mo; pricing unstable across sources (one shows $176/user) [third-party, unverified]', monthly: () => 69,
    paradigm: 'Find the user\'s session by ID or email, scrub the replay with console, network and state, share the link to a ticket.',
    trap: 'Declining relevance: PostHog and Sentry replay cover most of it bundled. Strong on front-end bugs, weak on backend errors.',
  },
  appsignal: {
    label: 'AppSignal', shape: 'flat tiers', setupH: 1.5, opsH: 0.25, fix: 1.15, detect: 'monitoring', uptime: true, status: 'keep-alt',
    price: 'Starter $23, Growth $59, Pro $139/mo [third-party]', monthly: (n, a) => (a > 1500 ? 139 : a > 300 ? 59 : 23),
    paradigm: 'Errors + APM + host metrics + uptime on one flat bill, strongest for Ruby, Elixir, Node and Python shops.',
    trap: 'Niche: fine flat pricing, fewer integrations and community answers than Sentry for a JS/Next stack.',
  },
};
export const OBS_IDS = Object.keys(OBS);
export const SEER_PER_CONTRIBUTOR = 40; // [third-party] $40 per active contributor per month; legacy $20 plan closed Jan 2026
export const SOURCEMAPS_HOURS = 1;
export const DD_CONTROLS_HOURS = 3;
export const NO_SOURCEMAP_FIX_MULT = 1.8; // [design] minified traces: you reproduce the bug by hand
const BACKEND = /500 on|Timeout|Database|promise/;
export const hostsFor = (accounts) => Math.max(2, Math.ceil(accounts / 300)) + 1; // [design] app hosts + one for the database

export function obsSlice(state) {
  const p = productSlice(state);
  const o = (p.observability ??= {});
  o.vendor ??= null; o.sinceDay ??= null; o.billId ??= null; o.seerBillId ??= null; o.ddControls ??= false;
  o.surprises ??= 0; o.unreadableFixes ??= 0; o.lastOpsWeek ??= null; o.lastBill ??= 0; o.lastSeer ??= 0;
  // Old saves: the generic "Sentry-style SDK + source maps" monitoring becomes Sentry with source maps on.
  const rel = releasesSlice(p);
  if (o.vendor == null && rel.flags.monitoring) { o.vendor = 'sentry'; rel.flags.sourcemaps ??= true; }
  rel.obs = o.vendor;
  return o;
}
const accountsOf = (state) => (state.stripe ? activeSubs(state).length + trialingSubs(state).length : 0);

/** Fix-time multiplier for an error under the current tool (read by releases.deploy / resolveWithFix). */
export function fixMultFor(rel, e) {
  if (!rel?.obs || !OBS[rel.obs]) return 1;
  let m = OBS[rel.obs].fix;
  if (rel.obs === 'logrocket') m = BACKEND.test(e?.title ?? '') ? 1.4 : 0.85; // replay shines on UI bugs, not on backend errors
  if (!rel.flags?.sourcemaps) m *= NO_SOURCEMAP_FIX_MULT;
  return round2(m);
}
export const seerUsable = (rel) => Boolean(rel?.flags?.seer && rel.obs === 'sentry' && rel.flags.sourcemaps);
export const seerMonthly = (state) => SEER_PER_CONTRIBUTOR * contributorsOf(state);

function syncBills(state, o) {
  const rel = releasesSlice(productSlice(state));
  const a = accountsOf(state);
  const v = OBS[o.vendor];
  const events = rel.errors.reduce((s, e) => s + (e.lastSeen >= (state.day ?? 0) - 30 ? e.events : 0), 0);
  const amount = v ? round2(v.monthly(events, a)) : 0;
  let r = (state.recurring ?? []).find((x) => x.id === o.billId);
  if (!r && v) { r = addRecurring(state, { vendor: v.label.split(' (')[0], amount, category: 'software', dayOfMonth: 9, note: `Observability: ${v.shape}` }); o.billId = r.id; }
  if (r) { r.amount = amount; r.active = Boolean(v) && amount > 0; if (v) { r.vendor = v.label.split(' (')[0]; r.note = `Observability: ${v.shape}`; } }
  o.lastBill = amount;
  // Seer: $40 x active contributors (the founder plus every engineer opening PRs), not a flat fee.
  let s = (state.recurring ?? []).find((x) => x.id === o.seerBillId) ?? (state.recurring ?? []).find((x) => x.active && /Seer/i.test(x.vendor));
  if (rel.flags.seer && o.vendor === 'sentry') {
    const amt = seerMonthly(state);
    if (!s) s = addRecurring(state, { vendor: 'Sentry Seer', amount: amt, category: 'software', dayOfMonth: 9 });
    o.seerBillId = s.id; s.vendor = 'Sentry Seer'; s.amount = amt; s.active = true; s.note = `$${SEER_PER_CONTRIBUTOR} x ${contributorsOf(state)} active contributor(s)`;
    o.lastSeer = amt;
  } else if (s) { s.active = false; o.lastSeer = 0; }
}

/** Pick (or switch) the observability tool. Returns { ok, hours }. */
export function chooseObs(state, id) {
  const v = OBS[id];
  if (!v) return { ok: false, error: 'Unknown tool' };
  const o = obsSlice(state);
  const p = productSlice(state);
  const rel = releasesSlice(p);
  if (o.vendor === id) return { ok: false, error: 'Already in use' };
  const switching = Boolean(o.vendor);
  // Old generic "Error monitoring (Sentry-style)" bill from before vendor choice.
  for (const r of state.recurring ?? []) if (r.active && /Error monitoring \(Sentry-style\)/.test(r.vendor) && r.id !== o.billId) { r.active = false; r.movedToHost = true; }
  for (const r of state.recurring ?? []) if (r.active && /^sentry$/i.test(r.vendor) && r.id !== o.billId) { r.active = false; r.movedToHost = true; } // catalog Sentry row
  o.vendor = id; o.sinceDay = state.day; rel.obs = id; rel.flags.monitoring = true;
  rel.flags.sourcemaps = false; // a new SDK: source maps and releases are a separate upload step in CI
  if (id !== 'sentry') rel.flags.seer = false;
  if (v.uptime || v.statusPage) { // uptime paging (and Better Stack's status page) come with the tool
    const ins = (state.apps.insights ??= {}); ins.flags ??= {};
    if (v.uptime) ins.flags.paging = true;
    if (v.statusPage) ins.flags.statusPage = true;
  }
  syncBills(state, o);
  if (id === 'datadog' && (state.stripe ? mrr(state) : 0) < 80000 && engineersOf(state) < 3) {
    logMistake(state, { functionId: 'infra_ops', id: 'datadog_overkill', app: 'product', label: 'Datadog before Series A', cost: { usd: round2(o.lastBill * 6), hours: v.setupH }, delayed: true, detail: `Per-host infrastructure monitoring for a team of ${engineersOf(state) + 1} with no Kubernetes or platform engineer: ${round2(o.lastBill)} USD/mo and ${v.setupH} h of setup for alerts Sentry plus an uptime check give you. Stellar seed teams run Sentry (errors) + PostHog (product) + a cheap uptime pager.`, key: 'dd_overkill' });
  }
  return { ok: true, hours: round2(v.setupH * (switching ? 1.3 : 1)) };
}
export function uploadSourcemaps(state) { const rel = releasesSlice(productSlice(state)); if (!rel.obs) return { ok: false, error: 'Pick a tool first' }; rel.flags.sourcemaps = true; return { ok: true, hours: SOURCEMAPS_HOURS }; }
export function setDatadogControls(state) { const o = obsSlice(state); if (o.vendor !== 'datadog') return { ok: false, error: 'Only for Datadog' }; o.ddControls = true; return { ok: true, hours: DD_CONTROLS_HOURS }; }
export function enableSeer(state) {
  const p = productSlice(state); const rel = releasesSlice(p); const o = obsSlice(state);
  if (o.vendor !== 'sentry') return { ok: false, error: 'Seer is Sentry\'s AI debugger' };
  rel.flags.seer = true; syncBills(state, o); return { ok: true, hours: 0.25 };
}

/** Called when a fix is applied: log the unreadable-trace cost the first time it bites. */
export function noteFix(state, e) {
  const rel = releasesSlice(productSlice(state));
  if (!rel.obs || rel.flags.sourcemaps) return;
  const o = obsSlice(state); o.unreadableFixes++;
  logMistake(state, { functionId: 'infra_ops', id: 'no_sourcemaps', app: 'product', label: 'Error tool without source maps or releases', cost: { hours: round2((e?.fixHours ?? 1.5) * (1 - 1 / NO_SOURCEMAP_FIX_MULT)) }, delayed: true, detail: `"${e?.title ?? 'An error'}" had a minified stack trace and no release, so the fix took ~${NO_SOURCEMAP_FIX_MULT}x longer. Uploading source maps and tagging releases in CI is a one-hour job.`, key: `nosrc:${Math.floor((state.day ?? 0) / 30)}` });
}

/** Daily: weekly tool upkeep, Datadog surprise bills, bills in sync with contributors and load. */
export function obsDay(state) {
  const o = obsSlice(state);
  if (!o.vendor) return;
  const v = OBS[o.vendor];
  const t = state.day ?? 0;
  const week = Math.floor(t / 7);
  if (o.lastOpsWeek !== week) {
    o.lastOpsWeek = week;
    forceHours(state, v.opsH, `${v.label}: alerts and dashboards`, { functionId: 'infra_ops' }); // past the plan too
  }
  if (t % 30 === 0) syncBills(state, o);
  if (o.vendor === 'datadog' && t % 30 === 20 && h01(`dd|${state.seed}|${t}`) < (o.ddControls ? 0.02 : 0.15)) {
    const usd = round2(o.lastBill * (1 + 2 * h01(`ddx|${state.seed}|${t}`)) + 150);
    o.surprises++;
    postSurprise(state, usd);
    logMistake(state, { functionId: 'infra_ops', id: 'datadog_surprise_bill', app: 'product', label: 'Datadog surprise bill (custom metrics / indexed logs)', cost: { usd }, charge: false, detail: `High-cardinality tags and indexed logs billed ${usd} USD above plan. Usage controls (metric limits, log exclusion filters, ingestion caps) take ~${DD_CONTROLS_HOURS} h.`, key: `ddbill:${Math.floor(t / 30)}` });
  }
}
function postSurprise(state, usd) { post(state, { amount: -usd, counterparty: 'Datadog', description: 'Datadog overage: custom metrics and indexed logs', category: 'software', method: 'card', meta: { app: 'product', usage: true } }); }

/** 0-1: how well the observability setup fits the stage [design]. */
export function obsFit(state) {
  const o = obsSlice(state);
  const rel = releasesSlice(productSlice(state));
  if (!o.vendor) return 0;
  const m = state.stripe ? mrr(state) : 0;
  const base = { sentry: 1, posthog: m < 20000 ? 0.85 : 0.6, betterstack: 0.75, datadog: m >= 80000 || engineersOf(state) >= 3 ? 0.85 : 0.2, logrocket: 0.55, appsignal: 0.65 }[o.vendor] ?? 0.5;
  return clamp(base - (rel.flags.sourcemaps ? 0 : 0.3) - (o.vendor === 'datadog' && !o.ddControls ? 0.1 : 0), 0, 1);
}
