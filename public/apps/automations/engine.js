// Automations engine: platform plan & billing, event detection from real game state, run execution with the
// platform's counting rules and limits, failure modes (silent auth expiry, mapping drift, duplicates, broken
// filters, AI mistakes, rate limits, runaway loops, self-host outages), consequences (complaints, cancellations,
// lost CRM notes, missed leads, debugging hours, overage) and the hours hook other apps call.
//
// Hooks for other apps (all no-ops that return the input when the player has no automations):
//   isAutomated(state, key)                       → is an automation for this work switched on?
//   claimAutomated(state, key, hours, { ref })     → hours to charge for work an automation does (records the saving)
//   deflectTickets(state, n, minutesPerTicket)     → tickets left after good onboarding emails pre-empt some
// Keys: model.js CAPABILITIES (crm_log_meeting, crm_inbound_triage, failed_payment_notice, onboarding_emails,
// metrics_digest, support_triage).

import { ensure, notify } from '../../core/state.js';
import { uid, chance, round2, dayOfWeek, dayOfMonth, monthKey, fmtDate, hash, clamp } from '../../core/util.js';
import { post, addRecurring } from '../../core/bank.js';
import { ensureStripe, cancel, sendInvoiceReminder, monthlyAmount, customerById, subscriptionById } from '../../core/stripe.js';
import { enqueue } from '../../core/jobs.js';
import { addInboundLead, addActivity } from '../sales/crm-api.js';
import { addTask } from '../sales/model.js';
import {
  PLATFORMS, SELF_HOST, AUTOBUY_PREMIUM, N8N_AI_USD_PER_RUN, APPS, EXPIRY_PER_MONTH, MAPPING_DRIFT_PER_MONTH, BUILD_ERRORS,
  DUPLICATE_RATE, LOOP_RUNS, RATE_LIMIT_PER_DAY, ENRICH, AI_ERROR, REVIEW, COMPLAINT, OVER_EMAIL_PER_WEEK, DEBUG_HOURS,
  DEFLECT, DIGEST_HOURS, MANUAL_HOURS, TRIGGERS, ACTIONS, TEMPLATES, DEFAULT_COPY, CAPABILITIES,
  capabilitiesOf, emailCopyScore, setupHours, testHours, unitsFor, validateSpec,
} from './model.js';
import { collectExternal, callExternal, actionCopy, isBenign, isBroadcast } from './integrations.js';
import { bizBlock } from '../context.js';
import { CATEGORIES as TICKET_CATEGORIES } from '../support/tickets.js';

const ID = 'automations';
const MAX_EVENTS_PER_DAY = 150; // per automation; the rest wait for tomorrow (queue lag) [design]
const MAX_RUNS_LOG = 600;
const live = (sub) => sub && (sub.status === 'active' || sub.status === 'past_due');
const daily = (pMonth) => 1 - Math.pow(1 - pMonth, 1 / 30);

export function ensureAutomations(state) {
  const a = ensure(state, ID, () => ({}));
  a.platform ??= null;
  a.recurringId ??= null;
  a.autoBuy ??= false;
  a.weeklyReview ??= false;
  a.connections ??= {};
  a.automations ??= [];
  a.runs ??= [];
  a.incidents ??= [];
  a.seen ??= {};
  a.held ??= [];
  a.claims ??= [];
  a.okRefs ??= {};
  a.emailLog ??= {};
  a.sheet ??= [];
  a.outage ??= null;
  a.usage ??= { month: null, units: 0, overage: 0, notified: false, byAuto: {} };
  a.pending ??= { enrichUsd: 0, aiUsd: 0 };
  a.stats ??= { saved: {}, setupHours: 0, testHours: 0, reviewHours: 0, debugHours: 0, monitorHours: 0, overageUsd: 0, enrichUsd: 0, aiUsd: 0 };
  a.today ??= { day: -1, calls: {}, slack: 0, aiJobs: {}, review: 0 };
  return a;
}

// ---------------------------------------------------------------------------
// Founder time (automatic charges from the daily sim; capped at what is left this week, like other apps)
// ---------------------------------------------------------------------------

function chargeFounder(state, hours, label) {
  const f = state.founder;
  const h = round2(Math.min(hours, Math.max(0, f.hoursPerWeek - f.hoursUsed)));
  if (h <= 0) return 0;
  f.hoursUsed += h;
  f.timeLog ??= [];
  f.timeLog.push({ day: state.day, hours: h, label });
  return h;
}
function addStat(A, key, h) { A.stats[key] = round2((A.stats[key] ?? 0) + h); }
function saved(A, cap, h) { if (h > 0) A.stats.saved[cap] = round2((A.stats.saved[cap] ?? 0) + h); }

function incident(state, A, auto, kind, text, extra = {}) {
  const x = { id: uid('inc'), day: state.day, autoId: auto?.id ?? null, kind, text, ...extra };
  A.incidents.unshift(x);
  if (A.incidents.length > 400) A.incidents.length = 400;
  if (auto) { auto.incidents ??= {}; auto.incidents[kind] = (auto.incidents[kind] ?? 0) + 1; }
  A.incidentCounts ??= {};
  A.incidentCounts[kind] = (A.incidentCounts[kind] ?? 0) + 1; // all-time (the list itself is capped)
  return x;
}

// ---------------------------------------------------------------------------
// Platform & billing
// ---------------------------------------------------------------------------

export const platformOf = (state) => PLATFORMS[ensureAutomations(state).platform] ?? null;
export const isPlatformCost = (t) => String(t.description ?? '').startsWith('Automations');

// Switch plan: posts the first month now, then a recurring bill on this day of month. Returns founder hours.
export function choosePlatform(state, id) {
  const A = ensureAutomations(state);
  const p = PLATFORMS[id];
  if (!p) throw new Error('Unknown plan.');
  if (A.platform === id) return 0;
  const prev = PLATFORMS[A.platform];
  const hoursNeeded = platformHours(state, id);
  const old = state.recurring.find((r) => r.id === A.recurringId);
  if (old) old.active = false;
  A.recurringId = null;
  if (p.price > 0) {
    const desc = `Automations: ${p.vendor} ${p.name}`;
    post(state, { amount: -p.price, counterparty: p.selfHosted ? 'Hetzner (n8n server)' : p.vendor, description: desc, category: p.priceCategory ?? 'software', method: 'card' });
    A.recurringId = addRecurring(state, { vendor: p.selfHosted ? 'Hetzner (n8n server)' : p.vendor, amount: p.price, category: p.priceCategory ?? 'software', dayOfMonth: dayOfMonth(state), note: desc }).id;
  }
  const switching = prev && prev.vendor !== p.vendor;
  A.platform = id;
  A.platformSince = state.day;
  A.outage = null;
  // Rebuilding on another vendor: everything has to be re-created and re-tested.
  for (const a of A.automations) {
    if (switching) { a.tested = false; a.latent = { filterBroken: Boolean(a.filter) && chance(state, BUILD_ERRORS.filterBroken), mappingBroken: chance(state, BUILD_ERRORS.mappingBroken) }; }
    if (validateSpec(a, id).length && a.status === 'on') { a.status = 'off'; notify(state, `"${a.name}" was turned off: it does not fit ${p.vendor} ${p.name}.`, { type: 'warn', app: ID }); }
  }
  const hours = hoursNeeded; // incl. rebuilding on a new vendor
  addStat(A, 'setupHours', hours);
  return hours;
}

// ---------------------------------------------------------------------------
// Building, testing, maintaining
// ---------------------------------------------------------------------------

// Player settings for a built-in app action (flow id, sequence id, subject, body...): short scalars only.
function cleanParams(p) {
  const out = {};
  for (const [k, v] of Object.entries(p ?? {}).slice(0, 8)) {
    if (!/^[a-zA-Z_]{1,24}$/.test(k)) continue;
    if (typeof v === 'boolean' || typeof v === 'number') { out[k] = v; continue; }
    const t = String(v ?? '').trim().slice(0, 2000);
    if (!t) continue;
    out[k] = t === 'true' ? true : t === 'false' ? false : /^-?\d+(\.\d+)?$/.test(t) && t.length < 12 ? Number(t) : t;
  }
  return out;
}

function normalizeSpec(spec) {
  return {
    name: String(spec.name ?? '').trim().slice(0, 80) || 'Untitled automation',
    trigger: spec.trigger,
    filter: spec.filter || null,
    dedupe: Boolean(spec.dedupe),
    alerts: Boolean(spec.alerts),
    retry: Boolean(spec.retry),
    actions: (spec.actions ?? []).map((x) => ({
      type: x.type,
      ...(x.type === 'ai_step' ? { mode: x.mode ?? 'summarize', review: Boolean(x.review) } : {}),
      ...(ACTIONS[x.type]?.ext ? { review: Boolean(x.review), params: cleanParams(x.params) } : {}),
      ...(x.type === 'email_customer' ? { kind: x.kind ?? 'onboarding', copy: String(x.copy ?? DEFAULT_COPY[x.kind ?? 'onboarding'] ?? '').slice(0, 2000) } : {}),
    })),
  };
}

export function templateSpec(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return null;
  const actions = t.actions.map((x) => ({ ...x, ...(x.type === 'email_customer' ? { copy: x.kind === 'reply' || t.actions.some((y) => y.type === 'ai_step' && y.mode === 'draft') ? '{{ai_draft}}' : DEFAULT_COPY[x.kind] } : {}) }));
  return { name: t.name, trigger: t.trigger, filter: t.filter, actions, dedupe: false, alerts: false, templateId: t.id };
}

// Build an automation (off until switched on). Returns { auto, hours }.
export function createAutomation(state, spec, { template = false } = {}) {
  const A = ensureAutomations(state);
  const s = normalizeSpec(spec);
  const errs = validateSpec(s, A.platform);
  if (errs.length) throw new Error(errs[0]);
  const auto = {
    id: uid('zap'), ...s, templateId: spec.templateId ?? null, status: 'off', createdDay: state.day,
    tested: false, testedDay: null, testFindings: [], drift: false, errSince: null, errCount: 0, notifiedDay: null, lost: 0,
    latent: { filterBroken: Boolean(s.filter) && chance(state, BUILD_ERRORS.filterBroken), mappingBroken: chance(state, BUILD_ERRORS.mappingBroken) },
    stats: { success: 0, error: 0, skipped: 0, held: 0, units: 0 }, incidents: {},
  };
  A.automations.push(auto);
  const hours = setupHours(s, A.platform, { template });
  addStat(A, 'setupHours', hours);
  return { auto, hours };
}

export function updateAutomation(state, auto, spec) {
  const A = ensureAutomations(state);
  const s = normalizeSpec(spec);
  const errs = validateSpec(s, A.platform);
  if (errs.length) throw new Error(errs[0]);
  const hours = updateHours(state, auto, spec);
  const stepsChanged = stepsChangedOf(s, auto);
  const filterChanged = s.filter !== auto.filter;
  Object.assign(auto, s);
  if (stepsChanged) { auto.tested = false; auto.latent.mappingBroken = chance(state, BUILD_ERRORS.mappingBroken); }
  if (filterChanged) { auto.tested = false; auto.latent.filterBroken = Boolean(s.filter) && chance(state, BUILD_ERRORS.filterBroken); }
  addStat(A, 'setupHours', hours);
  return hours;
}

export function deleteAutomation(state, autoId) {
  const A = ensureAutomations(state);
  A.automations = A.automations.filter((a) => a.id !== autoId);
  A.held = A.held.filter((h) => h.autoId !== autoId);
}

export function setStatus(state, auto, on) {
  const A = ensureAutomations(state);
  const p = platformOf(state);
  if (on) {
    if (!p) throw new Error('Pick a platform plan first.');
    const errs = validateSpec(auto, A.platform);
    if (errs.length) throw new Error(errs[0]);
    if (p.maxActive && A.automations.filter((a) => a.status === 'on' && a.id !== auto.id).length >= p.maxActive) throw new Error(`${p.vendor} ${p.name} allows ${p.maxActive} active scenarios.`);
    for (const app of appsOf(auto)) A.connections[app] ??= { status: 'ok', since: state.day };
  }
  auto.status = on ? 'on' : 'off';
  if (on) { auto.onSince ??= state.day; auto.errSince = null; }
}

export const appsOf = (auto) => [...new Set([TRIGGERS[auto.trigger]?.app, ...auto.actions.map((x) => ACTIONS[x.type]?.app)].filter((x) => x && !APPS[x]?.never))];
const recommendedFilter = (trigger) => Object.keys(TRIGGERS[trigger]?.filters ?? {})[0] ?? null;

// Run the automation on sample data (recent real events when available). Reveals build errors, loop risk,
// weak email copy, unreviewed customer-facing AI and projected usage. Returns { samples, findings, hours }.
export function testAutomation(state, auto) {
  const A = ensureAutomations(state);
  const T = TRIGGERS[auto.trigger];
  let evs = collectEvents(state, auto.trigger, { lookback: 30, ignoreSeen: true }).slice(-8);
  if (evs.length < 4) evs = evs.concat(syntheticEvents(state, auto.trigger, 6 - evs.length));
  const rec = recommendedFilter(auto.trigger);
  const filt = auto.filter ? T.filters[auto.filter] : null;
  const samples = evs.map((ev) => {
    const wouldBlock = filt ? !filt.pass(ev) : rec ? !T.filters[rec].pass(ev) : false;
    const passed = filt && !auto.latent.filterBroken ? filt.pass(ev) : true;
    return { label: ev.label, passed, wouldBlock };
  });
  const findings = [];
  const leaked = samples.filter((x) => x.passed && x.wouldBlock).length;
  if (filt && auto.latent.filterBroken) findings.push({ kind: 'filter', fix: true, text: `Filter misconfigured: it passed ${samples.filter((x) => x.passed).length}/${samples.length} samples, including ${Math.max(1, leaked)} that "${filt.label}" should block (operator set to "exists" instead of "equals").` });
  if (auto.latent.mappingBroken) { const i = Math.max(0, auto.actions.findIndex((x) => ['crm_log', 'email_customer', 'crm_add_lead', 'sheet_log'].includes(x.type))); findings.push({ kind: 'mapping', fix: true, text: `Step ${i + 2} (${ACTIONS[auto.actions[i].type].label}): "required field missing" on ${Math.min(samples.length, 3)} samples. The email field is mapped from the wrong object.` }); }
  if (!filt && rec && samples.some((x) => x.wouldBlock)) findings.push({ kind: 'nofilter', text: `No filter: ${samples.filter((x) => x.wouldBlock).length}/${samples.length} samples are ones you probably don't want ("${T.filters[rec].label}").` });
  if ((auto.trigger === 'crm_inbound_lead' && auto.actions.some((x) => x.type === 'crm_add_lead') || auto.actions.some((x) => ACTIONS[x.type]?.loops?.includes(auto.trigger))) && auto.filter !== 'not_automation' && !auto.dedupe) findings.push({ kind: 'loop', fix: true, text: 'Loop: this writes a CRM lead, which fires its own trigger again. Add the loop-guard filter or a dedupe key.' });
  for (const app of appsOf(auto)) if (A.connections[app]?.status === 'expired') findings.push({ kind: 'auth', text: `${APPS[app].label} connection expired: reconnect it.` });
  for (const x of auto.actions) {
    if (x.type === 'email_customer') {
      const g = emailCopyScore(x.copy, x.kind);
      if (!g.ai && g.score < 0.7) findings.push({ kind: 'copy', text: `Email copy scores ${Math.round(g.score * 100)}/100: ${g.feedback.join(' ')}` });
      if (g.ai && !auto.actions.some((y) => y.type === 'ai_step' && y.review)) findings.push({ kind: 'review', text: 'An AI-drafted email goes to customers with no human review. Turn on review for the AI step: drafts that invent facts become complaints.' });
    }
  }
  // Built-in app actions: customer-facing ones need a review step; a dry run against real events shows what would fail.
  for (const [i, x] of auto.actions.entries()) {
    if (!ACTIONS[x.type]?.ext) continue;
    if (ACTIONS[x.type].customer && !x.review) findings.push({ kind: 'review', text: `Step ${i + 2} (${ACTIONS[x.type].label}) reaches customers with no human approval step. Add review: wrong recipients and weak copy go out unchecked.` });
    const real = evs.find((e) => e.raw);
    if (real) {
      const d = callExternal(state, x, real, { dryRun: true, approved: true });
      if (!d.ok && !isBenign(x.type, d.error)) findings.push({ kind: 'action', text: `Step ${i + 2} (${ACTIONS[x.type].label}) would fail on "${real.label}": ${d.error}. Fix its settings before turning it on.` });
    }
  }
  const proj = projectedUnits(state, auto);
  const p = platformOf(state);
  if (p && Number.isFinite(p.limit) && proj > 0.5 * p.limit) findings.push({ kind: 'usage', text: `Projected ~${Math.round(proj)} ${p.unit}/month for this one automation (plan: ${p.limit.toLocaleString()}).` });
  auto.tested = true;
  auto.testedDay = state.day;
  auto.testFindings = findings;
  auto.testSamples = samples;
  const hours = testHours(auto);
  addStat(A, 'testHours', hours);
  return { samples, findings, hours };
}

// Fix what a test found (bad filter operator, wrong field mapping, loop guard). Returns hours.
export function fixFindings(state, auto) {
  const A = ensureAutomations(state);
  let n = 0;
  for (const f of auto.testFindings ?? []) {
    if (!f.fix) continue;
    if (f.kind === 'filter') auto.latent.filterBroken = false;
    if (f.kind === 'mapping') auto.latent.mappingBroken = false;
    if (f.kind === 'loop') auto.dedupe = true;
    n++;
  }
  auto.testFindings = (auto.testFindings ?? []).filter((f) => !f.fix);
  const hours = round2(n * DEBUG_HOURS.fixFilter);
  addStat(A, 'debugHours', hours);
  return hours;
}

// ---- Hour previews (so the UI can charge hours up front through ctx.act) ----
const backfillOf = (autos) => Math.min(DEBUG_HOURS.backfillCap, autos.reduce((s, a) => s + (a.lost ?? 0), 0) * DEBUG_HOURS.backfillEach);
export function platformHours(state, id) {
  const A = ensureAutomations(state);
  const p = PLATFORMS[id];
  const prev = PLATFORMS[A.platform];
  if (!p || A.platform === id) return 0;
  let h = 0.25 + (p.selfHosted ? p.setupHours : 0);
  if (prev && prev.vendor !== p.vendor) h += A.automations.reduce((s, a) => s + setupHours(a, id) * 0.6, 0);
  return round2(h);
}
export function reconnectHours(state, app) {
  const A = ensureAutomations(state);
  return round2(DEBUG_HOURS.reconnect + backfillOf(A.automations.filter((a) => appsOf(a).includes(app) && !a.drift && !a.latent.mappingBroken)));
}
export function repairHours(state, auto) {
  const A = ensureAutomations(state);
  const expired = appsOf(auto).some((app) => A.connections[app]?.status === 'expired');
  return round2(DEBUG_HOURS.repair + (expired ? 0 : backfillOf([auto])));
}
export const fixHours = (auto) => round2((auto.testFindings ?? []).filter((f) => f.fix).length * DEBUG_HOURS.fixFilter);
export const restartHours = (state) => round2(SELF_HOST.restartHours + backfillOf(ensureAutomations(state).automations));
function stepsChangedOf(s, auto) {
  const sig = (x) => JSON.stringify(x.actions.map((y) => [y.type, y.mode, y.kind, y.params ?? null]));
  return sig(s) !== sig(auto) || s.trigger !== auto.trigger;
}
export function updateHours(state, auto, spec) {
  const s = normalizeSpec(spec);
  return stepsChangedOf(s, auto) ? round2(setupHours(s, ensureAutomations(state).platform) * 0.5) : 0.1;
}

function backfill(state, A, autos) {
  const lost = autos.reduce((s, a) => s + (a.lost ?? 0), 0);
  for (const a of autos) a.lost = 0;
  return Math.min(DEBUG_HOURS.backfillCap, lost * DEBUG_HOURS.backfillEach);
}

// Re-authenticate an expired connection; you also backfill what broke while it was down. Returns hours.
export function reconnect(state, app) {
  const A = ensureAutomations(state);
  const c = A.connections[app];
  if (!c) return 0;
  c.status = 'ok'; c.since = state.day; c.expiredDay = null;
  const users = A.automations.filter((a) => appsOf(a).includes(app) && !a.drift && !a.latent.mappingBroken);
  const hours = round2(DEBUG_HOURS.reconnect + backfill(state, A, users));
  for (const a of users) { a.errSince = null; a.errCount = 0; }
  addStat(A, 'debugHours', hours);
  return hours;
}

// Repair a broken field mapping (API change) and backfill. Returns hours.
export function repairAutomation(state, auto) {
  const A = ensureAutomations(state);
  auto.drift = false;
  auto.latent.mappingBroken = false;
  const expired = appsOf(auto).filter((app) => A.connections[app]?.status === 'expired');
  const hours = round2(DEBUG_HOURS.repair + (expired.length ? 0 : backfill(state, A, [auto])));
  if (!expired.length) { auto.errSince = null; auto.errCount = 0; }
  addStat(A, 'debugHours', hours);
  return hours;
}

export function restartSelfHosted(state) {
  const A = ensureAutomations(state);
  A.outage = null;
  const hours = round2(SELF_HOST.restartHours + backfill(state, A, A.automations));
  addStat(A, 'debugHours', hours);
  return hours;
}

// Replay runs held for being over the plan limit (after upgrading or a new month). Returns { replayed, hours }.
export function replayHeld(state) {
  const A = ensureAutomations(state);
  const held = A.held.splice(0);
  let replayed = 0;
  for (const h of held) {
    const auto = A.automations.find((a) => a.id === h.autoId);
    if (!auto || auto.status !== 'on') continue;
    const r = execute(state, A, auto, h.ev);
    if (r.status !== 'held') replayed++;
  }
  const hours = held.length ? DEBUG_HOURS.replay : 0;
  addStat(A, 'debugHours', hours);
  return { replayed, hours };
}

// ---------------------------------------------------------------------------
// Events from the real game state
// ---------------------------------------------------------------------------

const isJunk = (id) => parseInt(hash(`junk:${id}`), 36) % 100 < 8; // [design] ~8% test / disposable sign-ups
function custEv(state, c, extra = {}) {
  return { email: c?.email ?? '', name: c?.name ?? 'Customer', company: c?.company ?? '', customerId: c?.id ?? null, subId: c?.subscriptionId ?? null, crmCompanyId: c?.crmCompanyId ?? null, junk: c ? isJunk(c.id) : false, ...extra };
}

// Events for a trigger since yesterday that no automation has processed yet.
export function collectEvents(state, trigger, { lookback = 1, ignoreSeen = false } = {}) {
  const A = ensureAutomations(state);
  const since = state.day - lookback;
  const st = ensureStripe(state);
  const out = [];
  const add = (ref, ev) => { const k = `${trigger}|${ref}`; if (ignoreSeen || A.seen[k] == null) out.push({ ref, key: k, ...ev }); };
  switch (trigger) {
    case 'stripe_customer':
      for (let i = st.customers.length - 1; i >= 0; i--) { const c = st.customers[i]; if (c.createdDay < since) break; add(c.id, custEv(state, c, { label: `New customer ${c.name}` })); }
      break;
    case 'stripe_subscription':
      for (let i = st.events.length - 1; i >= 0; i--) { const e = st.events[i]; if (e.day < since) break; if (e.type !== 'new') continue; const c = customerById(state, e.customerId); add(`${e.subId}:${e.day}`, custEv(state, c, { subId: e.subId, amount: e.amount, label: `New subscription ${c?.name ?? ''} $${Math.round(e.amount)}/mo` })); }
      break;
    case 'stripe_cancellation':
      for (let i = st.events.length - 1; i >= 0; i--) { const e = st.events[i]; if (e.day < since) break; if (e.type !== 'churn') continue; const c = customerById(state, e.customerId); const sub = subscriptionById(state, e.subId); add(`${e.subId}:${e.day}`, custEv(state, c, { subId: e.subId, reason: sub?.cancelReason ?? 'voluntary', label: `Canceled: ${c?.name ?? ''} (${String(sub?.cancelReason ?? 'voluntary').replace(/_/g, ' ')})` })); }
      break;
    case 'stripe_failed_payment':
      for (let i = st.charges.length - 1; i >= 0; i--) {
        const ch = st.charges[i];
        if (ch.day < since) break;
        if (ch.status !== 'failed') continue;
        const attempt = st.charges.filter((x) => x.invoiceId === ch.invoiceId && x.status === 'failed' && x.day <= ch.day).length;
        const c = customerById(state, ch.customerId);
        add(ch.id, custEv(state, c, { subId: ch.subId, attempt, reason: ch.failureCode, amount: ch.amount, label: `Payment failed: ${c?.name ?? ''} $${Math.round(ch.amount)} (${ch.failureCode}, attempt ${attempt})` }));
      }
      break;
    case 'invoice_overdue':
      for (const inv of st.invoices) {
        if (inv.status !== 'open' || inv.method !== 'ach_invoice') continue;
        for (const [n, off] of [[1, 1], [2, 8], [3, 15]]) {
          const d = inv.dueDay + off;
          if (d < since || d > state.day) continue;
          const c = customerById(state, inv.customerId);
          add(`${inv.id}:${n}`, custEv(state, c, { invoiceId: inv.id, subId: inv.subId, notice: n, amount: inv.amount, label: `Invoice ${inv.id.slice(-6).toUpperCase()} ${off} days past due ($${Math.round(inv.amount)})` }));
        }
      }
      break;
    case 'trial_ending':
      for (const sub of st.subscriptions) {
        if (sub.status !== 'trialing' || sub.trialEndDay == null) continue;
        const d = sub.trialEndDay - 3;
        if (d < since || d > state.day) continue;
        const c = customerById(state, sub.customerId);
        add(`${sub.id}:te`, custEv(state, c, { subId: sub.id, label: `Trial ends ${fmtDate(state, sub.trialEndDay)}: ${c?.name ?? ''}` }));
      }
      break;
    case 'form_signup':
      for (let i = st.subscriptions.length - 1; i >= 0; i--) {
        const sub = st.subscriptions[i];
        if (sub.startDay < since) break;
        if (sub.trialEndDay == null) continue;
        const c = customerById(state, sub.customerId);
        add(`${sub.id}:su`, custEv(state, c, { subId: sub.id, label: `Signup: ${c?.email ?? c?.name ?? 'trial'}` }));
      }
      break;
    case 'crm_inbound_lead':
      for (const q of state.apps.crm?.inboundQueue ?? []) if (q.day >= since) add(q.id, { email: q.email ?? '', name: q.name ?? '', company: q.company ?? '', crmCompanyId: q.companyId ?? null, leadId: q.id, source: q.source, selfMade: String(q.source ?? '').startsWith('automation'), label: `Inbound lead: ${q.name || q.email || 'unknown'}${q.company ? ` (${q.company})` : ''}` });
      break;
    case 'deal_stage':
      for (const d of state.apps.crm?.deals ?? []) for (const h of d.history ?? []) if (h.day >= since) { const co = state.apps.crm.companies.find((x) => x.id === d.companyId); const ct = state.apps.crm.contacts.find((x) => x.id === d.contactId); add(`${d.id}:${h.stage}:${h.day}`, { stage: h.stage, crmCompanyId: d.companyId, company: co?.name ?? '', email: ct?.email ?? '', name: ct?.name ?? '', dealId: d.id, label: `${co?.name ?? 'Deal'} → ${h.stage.replace(/_/g, ' ')}` }); }
      break;
    case 'meeting_held':
      for (const m of state.apps.calls?.meetings ?? []) {
        if (m.status !== 'held' || m.day < since - 2) continue;
        const co = state.apps.crm?.companies.find((x) => x.id === m.companyId);
        const ct = state.apps.crm?.contacts.find((x) => x.id === m.contactId);
        add(`mtg:${m.id}`, { source: 'calls', meetingId: m.id, crmCompanyId: m.companyId, company: co?.name ?? '', email: ct?.email ?? '', name: ct?.name ?? '', label: `Call held: ${ct?.name ?? ''}${co ? ` (${co.name})` : ''}` });
      }
      for (const e of state.calendar?.events ?? []) {
        if (e.status !== 'done' || e.app === 'calls' || !['call', 'meeting', 'pitch', 'interview'].includes(e.kind) || e.day < since - 2) continue;
        add(`ev:${e.id}`, { source: e.app ?? 'calendar', name: e.with?.name ?? '', email: e.with?.email ?? '', label: `Meeting ended: ${e.title}` });
      }
      break;
    case 'support_ticket':
      for (const t of state.apps.support?.tickets ?? []) if (t.createdDay >= since && Array.isArray(t.messages)) add(t.id, { email: t.email ?? '', name: t.name ?? '', company: t.company ?? '', customerId: t.customerId, subId: t.subId, category: t.category, priority: t.priority, ticketId: t.id, label: `Ticket: ${t.subject ?? t.category}` });
      break;
    case 'weekly_schedule':
      if (dayOfWeek(state) === 1 || ignoreSeen) add(`wk:${state.day}`, { label: `Weekly digest ${fmtDate(state)}` });
      break;
    default:
      if (TRIGGERS[trigger]?.ext) for (const { ref, ...ev } of collectExternal(state, trigger, since)) add(ref, ev);
  }
  return out;
}

// Sample data when the account has no real events yet (Zapier's "use sample record").
function syntheticEvents(state, trigger, n) {
  const rec = recommendedFilter(trigger);
  const out = [];
  for (let i = 0; i < n; i++) {
    const bad = i % 3 === 2; // a third of samples are ones a good filter blocks
    const ev = { ref: `sample:${i}`, label: `Sample ${i + 1}`, email: bad ? `test${i}@gmail.com` : `alex${i}@acme-${i}.com`, name: `Alex ${i}`, company: `Acme ${i}`, junk: bad, attempt: bad ? 2 : 1, notice: bad ? 3 : 1, amount: bad ? 0 : 49, reason: bad ? 'payment_failed' : 'voluntary', stage: bad ? 'contacted' : rec === 'meeting_booked' ? 'meeting_booked' : rec === 'won' ? 'won' : 'replied', source: bad ? 'customers' : 'calls', category: bad ? 'howto' : 'billing', priority: bad ? 'normal' : 'high', selfMade: bad, severity: bad ? 'low' : 'high', pass: !bad, rating: bad ? 5 : 2 };
    out.push(ev);
  }
  return out;
}

function projectedUnits(state, auto) {
  const n = collectEvents(state, auto.trigger, { lookback: 30, ignoreSeen: true }).length;
  const perMonth = auto.trigger === 'weekly_schedule' ? 4.3 : n;
  return perMonth * unitsFor(ensureAutomations(state).platform, { actions: auto.actions }) * (auto.dedupe ? 1 : 1 + DUPLICATE_RATE);
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

function logRun(A, auto, run) {
  A.runs.unshift(run);
  if (A.runs.length > MAX_RUNS_LOG) A.runs.length = MAX_RUNS_LOG;
  auto.stats[run.status] = (auto.stats[run.status] ?? 0) + 1;
  auto.stats.units += run.units;
  auto.lastRunDay = run.day;
}

function useUnits(state, A, auto, units) {
  A.usage.units += units;
  A.usage.byAuto[auto.id] = (A.usage.byAuto[auto.id] ?? 0) + units;
  const p = PLATFORMS[A.platform];
  if (p && Number.isFinite(p.limit) && A.usage.units > p.limit) A.usage.overage = A.usage.units - p.limit;
}

// Room for `units` more this month? Returns 'ok' | 'overage' | 'hold' | 'stop'.
function capacity(state, A, units) {
  const p = PLATFORMS[A.platform];
  if (!p || !Number.isFinite(p.limit) || A.usage.units + units <= p.limit) return 'ok';
  if (!A.usage.notified) {
    A.usage.notified = true;
    notify(state, `${p.vendor}: you used your ${p.limit.toLocaleString()} ${p.unit} for ${monthKey(state)}. ${p.overLimit === 'hold' ? 'New runs are held until you upgrade or the month resets.' : p.autoBuy && A.autoBuy ? 'Extra credits are being bought automatically.' : 'Automations are stopped until next month.'}`, { type: 'bad', app: ID });
  }
  if (p.overLimit === 'hold') return 'hold';
  return p.autoBuy && A.autoBuy ? 'overage' : 'stop';
}

function emailCount(A, key, day) {
  const log = (A.emailLog[key] ??= []);
  while (log.length && log[0] < day - 7) log.shift();
  return log.length;
}

// One step's effect on the game. Returns { ok, msg }.
function doStep(state, A, auto, step, ev, run, carry) {
  const today = A.today;
  switch (step.type) {
    case 'crm_add_lead': {
      if (!ev.email || ev.junk) return { ok: true, msg: 'No usable email: nothing created' };
      addInboundLead(state, { name: ev.name || ev.email, email: ev.email, company: ev.company, source: 'automation', note: `Added by automation "${auto.name}" (${TRIGGERS[auto.trigger].label})` });
      if (auto.trigger === 'crm_inbound_lead') carry.loop = true;
      return { ok: true, msg: 'Lead created in CRM' };
    }
    case 'crm_log': {
      const text = carry.aiWrong ? `${carry.aiText ?? 'Summary'} (contains an invented next step)` : carry.aiText ?? ev.label;
      const r = addActivity(state, { crmCompanyId: ev.crmCompanyId, companyName: ev.company, contactEmail: ev.email, type: 'note', summary: `[Automation] ${text}${carry.enrichWrong ? ' · enrichment: wrong employer' : ''}` });
      if (carry.aiWrong) carry.wrongData = 'An AI summary invented a next step and it was written to the CRM unreviewed.';
      return { ok: true, msg: r ? 'Note logged on the CRM record' : 'No matching CRM record: nothing written' };
    }
    case 'create_task':
      if (ev.crmCompanyId || ev.dealId) addTask(state, { title: `${carry.aiWrong ? '(wrong) ' : ''}Follow up: ${ev.label}`.slice(0, 120), dueDay: state.day + 2, companyId: ev.crmCompanyId ?? null, dealId: ev.dealId ?? null });
      return { ok: true, msg: 'Task created' };
    case 'email_founder':
      return { ok: true, msg: 'Emailed you' };
    case 'slack_post':
      today.slack++;
      return { ok: true, msg: `Posted to Slack${carry.aiWrong ? ' (with a wrong AI summary)' : ''}` };
    case 'sheet_log':
      A.sheet.unshift({ day: state.day, auto: auto.name, row: ev.label });
      if (A.sheet.length > 200) A.sheet.length = 200;
      return { ok: true, msg: 'Row added' };
    case 'tag_customer': {
      const c = ev.customerId ? customerById(state, ev.customerId) : null;
      if (c) { c.meta ??= {}; c.meta.tags = [...new Set([...(c.meta.tags ?? []), auto.trigger])].slice(-10); }
      return { ok: true, msg: c ? 'Tagged' : 'No Stripe customer' };
    }
    case 'enrich': {
      if (!ev.email || ev.junk) return { ok: true, msg: 'Nothing to enrich' };
      if (!chance(state, ENRICH.hit)) return { ok: true, msg: 'No match (no credit charged)' };
      A.pending.enrichUsd = round2(A.pending.enrichUsd + ENRICH.usdPerHit);
      if (chance(state, ENRICH.wrong)) { carry.enrichWrong = true; carry.wrongData = 'Enrichment returned an old employer / wrong title.'; }
      return { ok: true, msg: carry.enrichWrong ? 'Enriched (stale data)' : 'Enriched: title, company size' };
    }
    case 'ai_step': {
      const mode = step.mode ?? 'summarize';
      const wrong = chance(state, AI_ERROR[mode] ?? 0.07);
      let caught = false;
      if (step.review) { today.review += REVIEW.minutes / 60; caught = wrong && chance(state, REVIEW.catch); }
      carry.aiWrong = wrong && !caught;
      carry.aiText = mode === 'classify' ? `Classified: ${ev.category ?? 'lead'}` : mode === 'draft' ? 'AI draft' : `Summary of ${ev.label}`;
      if (PLATFORMS[A.platform]?.vendor === 'n8n') A.pending.aiUsd = round2(A.pending.aiUsd + N8N_AI_USD_PER_RUN);
      if (!today.aiJobs[auto.id]) { today.aiJobs[auto.id] = true; enqueue(state, 'automations:ai', { autoId: auto.id, runId: run.id, mode, input: ev.label }, { label: 'Automation AI step' }); }
      if (mode === 'classify' && carry.aiWrong) carry.misrouted = true;
      return { ok: true, msg: `${mode}${step.review ? caught ? ' · review caught a mistake' : ' · reviewed' : ''}` };
    }
    case 'email_customer': {
      if (ev.junk) { carry.bounced = true; return { ok: true, msg: 'Sent to a test / disposable address (bounced)' }; }
      if (ev.invoiceId && step.kind === 'dunning') {
        sendInvoiceReminder(state, ev.invoiceId);
        saved(A, 'failed_payment_notice', MANUAL_HOURS.invoiceReminder);
      }
      const key = ev.customerId ?? ev.email ?? ev.ref;
      const recent = emailCount(A, key, state.day);
      A.emailLog[key].push(state.day);
      const g = emailCopyScore(step.copy, step.kind);
      const quality = g.ai ? (carry.aiWrong ? 0.2 : 0.55) : g.score;
      let p = COMPLAINT.base + (1 - quality) * COMPLAINT.perQualityGap;
      const why = [];
      if (g.ai && carry.aiWrong) { p += COMPLAINT.wrongAi; why.push('an unreviewed AI draft said something false'); }
      if (run.dupOf) { p += COMPLAINT.duplicate; why.push('they got the same email twice'); }
      if (run.misfire) { p += COMPLAINT.misfire; why.push('the email should never have gone to them (no / broken filter)'); }
      if (recent >= OVER_EMAIL_PER_WEEK) { p += COMPLAINT.overEmail; why.push(`their ${recent + 1}th automated email this week`); }
      if (chance(state, Math.min(0.9, p))) complain(state, A, auto, ev, why.length ? why.join('; ') : 'the email felt generic and automated');
      return { ok: true, msg: `Emailed ${ev.email || ev.name || 'customer'}${g.ai ? carry.aiWrong ? ' (AI draft with an error)' : ' (AI draft)' : ''}` };
    }
    default:
      if (ACTIONS[step.type]?.ext) return doExtStep(state, A, auto, step, ev, run, carry);
      return { ok: true, msg: '' };
  }
}

// A step that calls another app's exported action. Customer-facing steps need a review step (a human approving, ~2.5
// min a run, who also catches wrong recipients and weak copy); without it the step runs unattended and is counted
// as unreviewed: higher complaint odds and an 'unreviewed_send' incident when something wrong goes out.
const EXT_UNREVIEWED_QUALITY = 0.6; // [design] a generic automated message nobody read
function doExtStep(state, A, auto, step, ev, run, carry) {
  const def = ACTIONS[step.type];
  const copy = def.customer ? actionCopy(state, step, ev) : null;
  const g = copy ? emailCopyScore(copy.text, copy.kind) : null;
  if (def.customer && step.review) {
    A.today.review += REVIEW.minutes / 60;
    const bad = ev.junk || run.misfire || run.dupOf || carry.aiWrong;
    if (bad && chance(state, REVIEW.catch)) { run.notes.push('Your approval step stopped this one'); return { ok: true, msg: `${def.label}: held at your approval step and rejected` }; }
    if (g && g.score < 0.5) { run.notes.push('Your approval step rejected weak copy'); return { ok: true, msg: `${def.label}: rejected at your approval step (copy scores ${Math.round(g.score * 100)}/100)` }; }
  }
  const r = callExternal(state, step, ev, { approved: Boolean(def.customer) });
  if (!r.ok) return isBenign(step.type, r.error) ? { ok: true, msg: `${def.label}: nothing to do (${r.error})` } : { ok: false, msg: `${r.error}` };
  if (def.human && r.hoursCost > 0) addStat(A, 'actionHours', chargeFounder(state, r.hoursCost, def.label));
  if (def.saves && r.hoursCost > 0) saved(A, 'external_actions', r.hoursCost);
  if (def.loops?.includes(auto.trigger) && auto.filter !== 'not_automation' && !auto.dedupe) carry.loop = true;
  if (def.customer) {
    const wrongRecipient = ev.junk || run.misfire || run.dupOf;
    if (!step.review && (wrongRecipient || carry.aiWrong || (g && g.score < 0.5) || isBroadcast(step.type))) {
      incident(state, A, auto, 'unreviewed_send', `${ev.label}: "${def.label}" went out with no approval step${wrongRecipient ? ' to someone it should not have' : g && g.score < 0.5 ? ' with weak copy' : ''}.`);
      run.notes.push('Customer-facing step ran unreviewed');
    }
    if (!isBroadcast(step.type)) {
      const key = ev.customerId ?? ev.email ?? ev.ref;
      const recent = emailCount(A, key, state.day);
      A.emailLog[key].push(state.day);
      const quality = g ? g.score : EXT_UNREVIEWED_QUALITY;
      let p = COMPLAINT.base + (1 - quality) * COMPLAINT.perQualityGap * (step.review ? 0.4 : 1);
      const why = [];
      if (carry.aiWrong) { p += COMPLAINT.wrongAi; why.push('an unreviewed AI draft said something false'); }
      if (run.dupOf) { p += COMPLAINT.duplicate; why.push('they got the same message twice'); }
      if (run.misfire) { p += COMPLAINT.misfire; why.push('it should never have gone to them (no / broken filter)'); }
      if (recent >= OVER_EMAIL_PER_WEEK) { p += COMPLAINT.overEmail; why.push(`their ${recent + 1}th automated message this week`); }
      if (chance(state, Math.min(0.9, p))) complain(state, A, auto, ev, why.length ? why.join('; ') : step.review ? 'the message felt generic and automated' : 'an automated message nobody had read reached them');
    }
  }
  return { ok: true, msg: `${def.label}${r.result?.outcome ? ` (${r.result.outcome})` : ''}` };
}

function complain(state, A, auto, ev, why) {
  const h = chargeFounder(state, COMPLAINT.handleHours, 'Apologizing for an automated email');
  addStat(A, 'debugHours', h);
  incident(state, A, auto, 'complaint', `${ev.name || ev.email || 'A customer'} complained: ${why}.`);
  const sub = ev.subId ? subscriptionById(state, ev.subId) : null;
  if (live(sub) && !sub.cancelAtPeriodEnd && chance(state, COMPLAINT.cancel)) {
    cancel(state, sub.id, { atPeriodEnd: true, reason: 'annoyed_by_automated_email' });
    incident(state, A, auto, 'cancel', `${ev.name || 'A customer'} canceled after an automated email (${Math.round(monthlyAmount(sub))}/mo).`);
  }
}

// Consequences when a run errors, by what the automation was doing.
function onError(state, A, auto, ev, run) {
  auto.errCount = (auto.errCount ?? 0) + 1;
  if (auto.errSince == null) {
    auto.errSince = state.day;
    if (auto.alerts) { auto.notifiedDay = state.day; notify(state, `Automation "${auto.name}" failed: ${run.reason}`, { type: 'bad', app: ID }); }
  } else if (!auto.alerts && auto.notifiedDay == null && state.day - auto.errSince >= 14) {
    auto.notifiedDay = state.day;
    notify(state, `${PLATFORMS[A.platform]?.vendor ?? 'Your automation platform'} emailed you: "${auto.name}" has had ${auto.errCount} errors.`, { type: 'warn', app: ID });
  }
  auto.lost = (auto.lost ?? 0) + 1;
  const caps = capabilitiesOf(auto);
  if (auto.trigger === 'form_signup' && auto.actions.some((x) => x.type === 'crm_add_lead') && !ev.junk) incident(state, A, auto, 'missed_lead', `${ev.email || ev.name} signed up but never reached your CRM (${run.reason}).`);
  else if (caps.includes('crm_log_meeting')) incident(state, A, auto, 'lost_note', `${ev.label}: notes never reached the CRM (${run.reason}).`);
  else if (auto.trigger === 'crm_inbound_lead') incident(state, A, auto, 'missed_alert', `${ev.label}: no enrichment or alert (${run.reason}).`);
  // A call whose notes the founder skipped because "it's automated": the saving is lost.
  for (const c of A.claims) if (c.ref === ev.meetingId && c.status === 'pending') c.status = 'lost';
}

function onSuccess(state, A, auto, ev, run, carry) {
  if (auto.errSince != null) { auto.errSince = null; auto.errCount = 0; auto.notifiedDay = null; }
  for (const cap of capabilitiesOf(auto)) {
    A.okRefs[`${cap}:${ev.leadId ?? ev.meetingId ?? ev.ref}`] = state.day;
    if (cap === 'crm_log_meeting') for (const c of A.claims) if (c.ref === ev.meetingId && c.status === 'pending') { c.status = 'confirmed'; saved(A, cap, c.saved); }
  }
  if (carry.wrongData) {
    incident(state, A, auto, 'wrong_data', `${ev.label}: ${carry.wrongData}`);
    if (chance(state, 0.5)) addStat(A, 'debugHours', chargeFounder(state, DEBUG_HOURS.wrongDataCleanup, 'Fixing bad data an automation wrote'));
  }
  if (carry.misrouted) {
    incident(state, A, auto, 'misrouted', `${ev.label}: misclassified by AI and routed to the wrong place.`);
    addStat(A, 'debugHours', chargeFounder(state, 0.2, 'Finding a misrouted ticket'));
  }
  if (carry.loop) {
    const per = unitsFor(A.platform, { actions: auto.actions });
    const units = per * LOOP_RUNS;
    useUnits(state, A, auto, units);
    run.units += units;
    run.notes.push(`Loop: re-triggered itself ${LOOP_RUNS}×`);
    A.today.slack += auto.actions.some((x) => x.type === 'slack_post') ? LOOP_RUNS : 0;
    if (!auto.loopNotified || state.day - auto.loopNotified > 7) { auto.loopNotified = state.day; incident(state, A, auto, 'runaway', `"${auto.name}" triggered itself: ${units} ${PLATFORMS[A.platform]?.unit ?? 'tasks'} burned on one lead.`); }
  }
}

// Execute one automation on one event. Returns the run.
function execute(state, A, auto, ev, { dupOf = null } = {}) {
  const P = PLATFORMS[A.platform];
  const T = TRIGGERS[auto.trigger];
  const run = { id: uid('run'), autoId: auto.id, day: state.day, ref: ev.ref, label: ev.label, status: 'success', reason: '', steps: [], units: 0, notes: [], dupOf };
  const rec = recommendedFilter(auto.trigger);
  const filt = auto.filter ? T.filters[auto.filter] : null;
  if (filt && !auto.latent.filterBroken && !filt.pass(ev)) {
    run.status = 'skipped'; run.reason = `Filtered: ${filt.label}`;
    run.units = unitsFor(A.platform, { actions: auto.actions, filteredOut: true });
    useUnits(state, A, auto, run.units);
    logRun(A, auto, run);
    return run;
  }
  const guard = filt ?? (rec ? T.filters[rec] : null);
  if (guard && !guard.pass(ev)) { run.misfire = true; run.notes.push(filt ? 'Filter misconfigured: should have stopped here' : `No filter: "${guard.label}" would have stopped this`); }
  if (A.outage) {
    run.status = 'error'; run.reason = 'n8n instance is down (container stopped)';
    logRun(A, auto, run); onError(state, A, auto, ev, run);
    return run;
  }
  const planned = unitsFor(A.platform, { actions: auto.actions });
  const cap = capacity(state, A, planned);
  if (cap === 'hold') {
    run.status = 'held'; run.reason = `Over the ${P.limit.toLocaleString()} ${P.unit} limit: held for replay`;
    A.held.push({ autoId: auto.id, ev, day: state.day });
    if (A.held.length > 400) A.held.shift();
    logRun(A, auto, run);
    return run;
  }
  if (cap === 'stop') {
    run.status = 'skipped'; run.reason = `Out of ${P.unit} for this month: not run`;
    logRun(A, auto, run);
    onError(state, A, auto, ev, run);
    run.status = 'skipped';
    return run;
  }
  const carry = {};
  let ok = 0;
  const brokenAt = auto.latent.mappingBroken || auto.drift ? Math.max(0, auto.actions.findIndex((x) => ['crm_log', 'email_customer', 'crm_add_lead', 'sheet_log'].includes(x.type))) : -1;
  for (let i = 0; i < auto.actions.length; i++) {
    const step = auto.actions[i];
    const app = ACTIONS[step.type].app;
    if (i === 0 && A.connections[T.app]?.status === 'expired') { run.status = 'error'; run.reason = `${APPS[T.app].label} trigger: 401 Unauthorized (connection expired)`; break; }
    if (A.connections[app]?.status === 'expired') { run.status = 'error'; run.reason = `${APPS[app].label}: 401 Unauthorized (connection expired). Reconnect.`; break; }
    if (i === brokenAt) { run.status = 'error'; run.reason = `${ACTIONS[step.type].label}: required field "email" is missing (${auto.drift ? 'the app changed its API fields' : 'field mapped from the wrong object'})`; break; }
    A.today.calls[app] = (A.today.calls[app] ?? 0) + 1;
    if (A.today.calls[app] > RATE_LIMIT_PER_DAY) {
      if (auto.retry) { run.status = 'held'; run.reason = `${APPS[app].label}: 429 rate limited, retrying tomorrow`; A.held.push({ autoId: auto.id, ev, day: state.day, retry: true }); }
      else { run.status = 'error'; run.reason = `${APPS[app].label}: 429 Too Many Requests`; }
      break;
    }
    const r = doStep(state, A, auto, step, ev, run, carry);
    run.steps.push(`${ACTIONS[step.type].label}: ${r.msg}`);
    if (!r.ok) { run.status = 'error'; run.reason = r.msg; break; }
    ok++;
  }
  run.units = unitsFor(A.platform, { actions: auto.actions, ok });
  if (cap === 'overage') run.notes.push('Paid with extra credits');
  useUnits(state, A, auto, run.units);
  logRun(A, auto, run);
  if (run.status === 'error') onError(state, A, auto, ev, run);
  else if (run.status === 'success') onSuccess(state, A, auto, ev, run, carry);
  return run;
}

function processEvent(state, A, auto, ev) {
  const run = execute(state, A, auto, ev);
  if (run.status !== 'success') return;
  // Duplicate trigger deliveries (polling replays, overlapping Stripe events).
  if (chance(state, DUPLICATE_RATE)) {
    if (auto.dedupe) {
      const dup = { id: uid('run'), autoId: auto.id, day: state.day, ref: ev.ref, label: ev.label, status: 'skipped', reason: 'Duplicate event ignored (dedupe key)', steps: [], units: unitsFor(A.platform, { actions: auto.actions, filteredOut: true }), notes: [] };
      useUnits(state, A, auto, dup.units);
      logRun(A, auto, dup);
    } else {
      const r2 = execute(state, A, auto, { ...ev }, { dupOf: run.id });
      if (r2.status === 'success') { r2.notes.push('Duplicate run (no dedupe)'); incident(state, A, auto, 'duplicate', `${ev.label}: ran twice.`); }
    }
  }
}

// ---------------------------------------------------------------------------
// Daily simulation
// ---------------------------------------------------------------------------

function hazards(state, A) {
  const used = new Set();
  for (const a of A.automations) if (a.status === 'on') for (const app of appsOf(a)) used.add(app);
  for (const app of used) {
    const c = (A.connections[app] ??= { status: 'ok', since: state.day });
    if (c.status !== 'ok') continue;
    if (chance(state, daily(APPS[app]?.oauth ? EXPIRY_PER_MONTH.oauth : EXPIRY_PER_MONTH.key))) { c.status = 'expired'; c.expiredDay = state.day; }
  }
  for (const a of A.automations) if (a.status === 'on' && !a.drift && chance(state, daily(MAPPING_DRIFT_PER_MONTH))) a.drift = true;
  const p = PLATFORMS[A.platform];
  if (p?.selfHosted && !A.outage && chance(state, daily(SELF_HOST.monthlyOutage))) {
    A.outage = { since: state.day };
    notify(state, 'Your self-hosted n8n stopped (disk full after an upgrade). Every workflow is down until you restart it.', { type: 'bad', app: ID });
  }
}

function monthRollover(state, A) {
  const mk = monthKey(state);
  if (A.usage.month === mk) return;
  const p = PLATFORMS[A.platform];
  if (A.usage.month && p) {
    if (A.usage.overage > 0 && p.autoBuy && A.autoBuy) {
      const usd = round2(A.usage.overage * (p.price / p.limit) * AUTOBUY_PREMIUM);
      if (usd > 0) { post(state, { amount: -usd, counterparty: p.vendor, description: `Automations: extra ${p.unit} (${A.usage.overage.toLocaleString()})`, category: 'software', method: 'card' }); A.stats.overageUsd = round2(A.stats.overageUsd + usd); }
    }
    if (A.pending.enrichUsd > 0) { post(state, { amount: -A.pending.enrichUsd, counterparty: 'Apollo', description: 'Automations: enrichment credits', category: 'software', method: 'card' }); A.stats.enrichUsd = round2(A.stats.enrichUsd + A.pending.enrichUsd); }
    if (A.pending.aiUsd > 0) { post(state, { amount: -A.pending.aiUsd, counterparty: 'LLM API', description: 'Automations: AI steps (own API key)', category: 'ai_inference', method: 'card' }); A.stats.aiUsd = round2(A.stats.aiUsd + A.pending.aiUsd); }
    if (p.selfHosted) addStat(A, 'debugHours', chargeFounder(state, SELF_HOST.monthlyUpkeepHours, 'n8n server upgrades & backups'));
  }
  A.pending = { enrichUsd: 0, aiUsd: 0 };
  A.usage = { month: mk, units: 0, overage: 0, notified: false, byAuto: {} };
  // Held runs older than 30 days are gone (Zapier keeps held runs for a limited time [design]).
  const expired = A.held.filter((h) => h.day < state.day - 30);
  if (expired.length) {
    A.held = A.held.filter((h) => h.day >= state.day - 30);
    for (const h of expired) { const auto = A.automations.find((a) => a.id === h.autoId); if (auto) onError(state, A, auto, h.ev, { reason: 'held run expired without replay' }); }
  }
}

export function automationsDay(state) {
  if (!state.apps[ID]) return;
  const A = ensureAutomations(state);
  if (!A.platform) return;
  A.today = { day: state.day, calls: {}, slack: 0, aiJobs: {}, review: 0 };
  monthRollover(state, A);
  hazards(state, A);
  // Runs held by a 429 with "retry tomorrow" on are retried automatically the next day (not the plan-limit holds,
  // which wait for a manual replay).
  const retries = A.held.filter((h) => h.retry && h.day < state.day);
  if (retries.length) {
    A.held = A.held.filter((h) => !retries.includes(h));
    for (const h of retries) { const auto = A.automations.find((a) => a.id === h.autoId); if (auto?.status === 'on') execute(state, A, auto, h.ev); }
  }
  const on = A.automations.filter((a) => a.status === 'on');
  const triggers = [...new Set(on.map((a) => a.trigger))];
  for (const trig of triggers) {
    const evs = collectEvents(state, trig);
    for (const ev of evs) A.seen[ev.key] = state.day;
    for (const auto of on.filter((a) => a.trigger === trig)) for (const ev of evs.slice(0, MAX_EVENTS_PER_DAY)) processEvent(state, A, auto, ev);
  }
  if (A.today.review > 0) addStat(A, 'reviewHours', chargeFounder(state, A.today.review, 'Reviewing automation AI output'));
  if (A.today.slack > 40 && dayOfWeek(state) === 3) notify(state, `${A.today.slack} automated Slack posts today. Nobody reads a channel that noisy; real alerts drown in it.`, { type: 'warn', app: ID });
  // Weekly review of the run history (the stellar habit): surfaces failing automations even without alerts.
  if (A.weeklyReview && dayOfWeek(state) === 1) {
    addStat(A, 'monitorHours', chargeFounder(state, DEBUG_HOURS.monitorWeekly, 'Automation run history review'));
    for (const a of on) if (a.errSince != null && a.notifiedDay == null) { a.notifiedDay = state.day; notify(state, `Weekly review: "${a.name}" has failed ${a.errCount} times since ${fmtDate(state, a.errSince)}.`, { type: 'warn', app: ID }); }
  }
  // Calls whose notes were skipped ("it's automated") but no automation ever logged them: you write them later.
  for (const c of A.claims) {
    if (c.status === 'pending' && state.day - c.day > 5) { c.status = 'lost'; }
    if (c.status === 'lost' && !c.charged) { c.charged = true; addStat(A, 'debugHours', chargeFounder(state, c.saved + 0.05, 'Catching up on call notes the automation missed')); }
  }
  A.claims = A.claims.filter((c) => state.day - c.day <= 30);
  for (const k of Object.keys(A.seen)) if (A.seen[k] < state.day - 20) delete A.seen[k];
  for (const k of Object.keys(A.okRefs)) if (A.okRefs[k] < state.day - 30) delete A.okRefs[k];
  for (const k of Object.keys(A.triaged ?? {})) if (A.triaged[k] < state.day - 30) delete A.triaged[k];
  for (const k of Object.keys(A.emailLog)) if (!A.emailLog[k].length || A.emailLog[k].at(-1) < state.day - 8) delete A.emailLog[k];
}

// ---------------------------------------------------------------------------
// Hooks for other apps
// ---------------------------------------------------------------------------

const onWith = (state, key) => {
  const A = state.apps?.[ID];
  if (!A?.platform) return [];
  return (A.automations ?? []).filter((a) => a.status === 'on' && capabilitiesOf(a).includes(key));
};

/** Is an automation for this work switched on? (The founder trusts it; it may still be silently broken.) */
export const isAutomated = (state, key) => onWith(state, key).length > 0;

/**
 * Hours to charge for a piece of work an automation covers, recording the saving.
 * crm_log_meeting: the founder skips the write-up (pays only the AI review). The saving is confirmed when the
 *   automation actually logs that meeting (ref = meeting id); if it fails, the notes are lost and the catch-up
 *   is charged later.
 * crm_inbound_triage: faster triage only if an automation enriched/routed that lead (ref = inbound queue id).
 * metrics_digest: a shorter weekly review if a digest arrived in the last 7 days.
 */
export function claimAutomated(state, key, hours, { ref = null } = {}) {
  const autos = onWith(state, key);
  if (!autos.length || !(hours > 0)) return hours;
  const A = ensureAutomations(state);
  if (key === 'crm_log_meeting') {
    const steps = autos.flatMap((a) => a.actions);
    const ai = steps.find((x) => x.type === 'ai_step');
    const charge = ai ? 0 : hours * 0.5; // AI review time is charged by the automation itself; without AI you still write the summary
    if (ref && A.claims.some((c) => c.ref === ref && c.key === key)) return round2(charge); // re-clicked: already claimed
    const claim = { id: uid('clm'), key, ref, day: state.day, saved: round2(hours - charge), status: 'pending' };
    if (ref && A.okRefs[`${key}:${ref}`] != null) { claim.status = 'confirmed'; saved(A, key, claim.saved); }
    A.claims.push(claim);
    return round2(charge);
  }
  if (key === 'crm_inbound_triage') {
    if (!ref || A.okRefs[`${key}:${ref}`] == null) return hours;
    const charge = Math.min(hours, MANUAL_HOURS.triageWithEnrichment);
    A.triaged ??= {};
    if (!A.triaged[ref]) { A.triaged[ref] = state.day; saved(A, key, hours - charge); }
    return round2(charge);
  }
  if (key === 'metrics_digest') {
    const fresh = Object.entries(A.okRefs).some(([k, d]) => k.startsWith('metrics_digest:') && state.day - d <= 7);
    if (!fresh || (A.lastDigestClaim != null && state.day - A.lastDigestClaim < 6)) return hours;
    A.lastDigestClaim = state.day;
    const charge = round2(hours * (DIGEST_HOURS.withDigest / DIGEST_HOURS.manual));
    saved(A, key, hours - charge);
    return charge;
  }
  return hours;
}

/** Good onboarding emails pre-empt some how-to tickets. Returns the tickets left; records support minutes saved. */
export function deflectTickets(state, n, minutesPerTicket = 6) {
  if (!(n > 0)) return n;
  const autos = onWith(state, 'onboarding_emails');
  if (!autos.length) return n;
  const A = ensureAutomations(state);
  const healthy = autos.filter((a) => {
    const recent = A.runs.filter((r) => r.autoId === a.id && r.day > state.day - 14 && r.status !== 'skipped');
    const ok = recent.filter((r) => r.status === 'success').length;
    return ok > 0 && ok / recent.length >= 0.8;
  });
  if (!healthy.length) return n;
  const q = Math.max(...healthy.flatMap((a) => a.actions.filter((x) => x.type === 'email_customer').map((x) => { const g = emailCopyScore(x.copy, x.kind); return g.ai ? 0.4 : g.score; })));
  let d = 0;
  for (let i = 0; i < n; i++) if (chance(state, DEFLECT.share * q)) d++;
  saved(A, 'onboarding_emails', (d * minutesPerTicket) / 60);
  return n - d;
}

// ---------------------------------------------------------------------------
// Read models: summary and coaching
// ---------------------------------------------------------------------------

export function summary(state) {
  const A = ensureAutomations(state);
  const st = A.stats;
  const hoursSaved = round2(Object.values(st.saved).reduce((a, b) => a + b, 0));
  const spent = round2(st.setupHours + st.testHours + st.reviewHours + st.debugHours + st.monitorHours + (st.actionHours ?? 0));
  const incidents = { ...(A.incidentCounts ?? {}) };
  const runs = { success: 0, error: 0, skipped: 0, held: 0 };
  for (const a of A.automations) for (const k of Object.keys(runs)) runs[k] += a.stats[k] ?? 0;
  const costUsd = round2(-state.bank.txns.filter(isPlatformCost).reduce((a, t) => a + t.amount, 0));
  const harm = (incidents.complaint ?? 0) + (incidents.cancel ?? 0) * 3 + (incidents.missed_lead ?? 0) + (incidents.lost_note ?? 0) + (incidents.wrong_data ?? 0) + (incidents.misrouted ?? 0) + (incidents.duplicate ?? 0) * 0.5 + (incidents.runaway ?? 0) * 2 + (incidents.unreviewed_send ?? 0);
  return { hoursSaved, savedByCap: { ...st.saved }, spentHours: spent, netHours: round2(hoursSaved - spent), ...st, incidents, harm: round2(harm), runs, costUsd, usage: { ...A.usage }, held: A.held.length };
}

export function coaching(state) {
  const A = ensureAutomations(state);
  const notes = [];
  const p = platformOf(state);
  const since = state.day - 30;
  const inc = (kind, autoId = null) => A.incidents.filter((x) => x.kind === kind && x.day > since && (!autoId || x.autoId === autoId)).length;
  for (const a of A.automations) {
    if (a.errSince != null) notes.push({ tone: 'bad', autoId: a.id, text: `"${a.name}" has failed ${a.errCount} time${a.errCount === 1 ? '' : 's'} since ${fmtDate(state, a.errSince)}. ${A.runs.find((r) => r.autoId === a.id && r.status === 'error')?.reason ?? ''}` });
    const unreviewed = a.actions.some((x) => x.type === 'email_customer' && emailCopyScore(x.copy, x.kind).ai) && !a.actions.some((x) => x.type === 'ai_step' && x.review);
    const comp = inc('complaint', a.id);
    const extUnrev = a.actions.filter((x) => ACTIONS[x.type]?.ext && ACTIONS[x.type].customer && !x.review);
    if (extUnrev.length) { const n = inc('unreviewed_send', a.id); notes.push({ tone: n ? 'bad' : 'warn', autoId: a.id, text: `"${a.name}": ${extUnrev.map((x) => ACTIONS[x.type].label).join(', ')} reaches customers with no approval step${n ? ` (${n} wrong or weak send${n === 1 ? '' : 's'} this month)` : ''}.` }); }
    if (unreviewed) notes.push({ tone: comp ? 'bad' : 'warn', autoId: a.id, text: `AI emails to customers without review: ${comp} complaint${comp === 1 ? '' : 's'} this month.` });
    else if (comp) notes.push({ tone: 'bad', autoId: a.id, text: `"${a.name}": ${comp} complaint${comp === 1 ? '' : 's'} this month from automated emails.` });
    const dups = inc('duplicate', a.id);
    if (dups && !a.dedupe) notes.push({ tone: 'warn', autoId: a.id, text: `"${a.name}" ran twice on ${dups} event${dups === 1 ? '' : 's'} (no dedupe key).`, advice: 'Add a dedupe key (Storage by Zapier / a data store; free).' });
    const misfires = A.runs.filter((r) => r.autoId === a.id && r.misfire && r.day > since).length;
    if (misfires >= 3) notes.push({ tone: 'warn', autoId: a.id, text: `"${a.name}": ${misfires} runs this month should have been filtered out (${a.filter ? 'the filter is misconfigured' : 'no filter'}).` });
    const caps = capabilitiesOf(a);
    const used = A.usage.byAuto[a.id] ?? 0;
    if (a.status === 'on' && !caps.some((c) => c !== 'support_triage') && used > 50 && state.day - (a.onSince ?? state.day) > 14) notes.push({ tone: '', autoId: a.id, text: `"${a.name}" used ${used} ${p?.unit ?? 'tasks'} this month and saves no measurable time.`, advice: 'Fine if you read what it sends; otherwise it is automation sprawl: turn it off.' });
  }
  const untested = A.automations.filter((a) => a.status === 'on' && !a.tested);
  if (untested.length) notes.push({ tone: 'warn', autoId: untested.length === 1 ? untested[0].id : null, text: `${untested.length === 1 ? `"${untested[0].name}" was` : `${untested.length} live automations were`} never tested with sample data. Untested builds ship broken filters and field mappings about 1 time in 3 [design].` });
  for (const [app, c] of Object.entries(A.connections)) if (c.status === 'expired') notes.push({ tone: 'bad', text: `${APPS[app]?.label ?? app} connection expired on ${fmtDate(state, c.expiredDay)}. Everything that uses it fails until you reconnect.` });
  if (A.outage) notes.push({ tone: 'bad', text: `Your n8n server has been down since ${fmtDate(state, A.outage.since)}.` });
  if (p && Number.isFinite(p.limit)) {
    const dom = dayOfMonth(state);
    const proj = dom > 3 ? Math.round((A.usage.units / dom) * 30) : null;
    if (proj && proj > p.limit) notes.push({ tone: 'warn', text: `On pace for ~${proj.toLocaleString()} ${p.unit} this month (plan: ${p.limit.toLocaleString()}). ${p.overLimit === 'hold' ? 'Runs will be held.' : A.autoBuy ? 'You will pay for extra credits.' : 'Automations will stop.'}` });
  }
  if (A.held.length) notes.push({ tone: 'warn', text: `${A.held.length} run${A.held.length === 1 ? '' : 's'} held over the plan limit; they expire 30 days after they were held.`, advice: 'Upgrade and replay them before they expire.' });
  const missed = inc('missed_lead');
  if (missed) notes.push({ tone: 'bad', text: `${missed} signup${missed === 1 ? '' : 's'} never reached your CRM this month because an automation was broken.` });
  const lost = inc('lost_note');
  if (lost) notes.push({ tone: 'bad', text: `${lost} call note${lost === 1 ? '' : 's'} never reached the CRM. You skipped writing them because "it's automated".` });
  if (A.automations.some((a) => a.status === 'on') && !A.weeklyReview && !A.automations.some((a) => a.status === 'on' && a.alerts)) notes.push({ tone: 'warn', text: 'No failure alerts and no weekly run-history review: a broken automation can fail silently for weeks (t8: "automation sprawl, nobody owns the Zap").' });
  if (!notes.length && A.automations.length) notes.push({ tone: 'good', text: 'Nothing flagged: no failing automations, recent incidents or limit problems.', advice: 'Keep automating only frequent, rule-based work; keep humans on customer-facing AI.' });
  const rank = { bad: 0, warn: 1, '': 2, good: 3 };
  return notes.map((n, i) => ({ n, i })).sort((x, y) => rank[x.n.tone] - rank[y.n.tone] || x.i - y.i).map((x) => x.n);
}

// LLM job: produce the AI step's actual output for one sampled run (display + realism); falls back offline.
// "Classify / route" is a typed decision, so it goes to Jev (choice over a fixed label set, with confidence);
// summarize and draft write text, so they go to the chat model.
const LEAD_LABELS = {
  strong_fit: 'Matches the ideal customer profile: right kind of business, role, size and tools, and has the problem; worth a same-day reply',
  possible_fit: 'Close to the profile with ONE thing off or unknown (a bit small or large, the tool they would need to switch to, role unclear); could become a customer',
  poor_fit: 'A real person who is clearly not a buyer: a student, researcher or job seeker, or a business of the wrong kind or size with no fit to the problem',
  junk: 'Not a real prospect at all: spam, a test or fake sign-up, a vendor or SEO pitch, a disposable email address',
};
// Ticket routes need a description, not just a label: "Something is down" vs one broken feature is the classic miss.
const TICKET_ROUTE_HINTS = {
  howto: 'Asks how to do or set up something the product already does',
  bug: 'One feature errors or behaves wrongly for this customer while the app itself is up',
  billing: 'Charges, refunds, invoices, receipts, VAT, payment methods or plan price',
  feature: 'Asks for something the product does not do yet',
  account: 'Login, password, invites, teammates, permissions or access',
  outage: 'The whole app or site is down or unreachable, usually for everyone ("nothing loads")',
};
const GENERIC_LABELS = { act_now: 'Needs a human action today', routine: 'Needs handling, not urgent', no_action: 'Informational; nothing to do' };
function classifyLabels(trigger) {
  if (trigger === 'support_ticket') return Object.fromEntries(Object.entries(TICKET_CATEGORIES).filter(([k]) => k !== 'angry').map(([k, c]) => [k, TICKET_ROUTE_HINTS[k] ? `${c.label}: ${TICKET_ROUTE_HINTS[k]}` : c.label]));
  if (/lead|signup/.test(trigger ?? '')) return LEAD_LABELS;
  return GENERIC_LABELS;
}
function classifyFallback(labels, input) {
  const t = String(input ?? '').toLowerCase(), has = (k) => k in labels;
  const pick = has('billing') && /charge|refund|invoice|card|billing|price/.test(t) ? 'billing' : has('bug') && /error|bug|broken|crash|fail/.test(t) ? 'bug'
    : has('account') && /login|password|access|sso/.test(t) ? 'account' : has('junk') && /test|example\.com|mailinator|seo|backlink/.test(t) ? 'junk' : Object.keys(labels)[0];
  return { route: { type: 'choice', choice: pick, confidence: 0 } };
}

/** Classify one record for an automation's trigger. → { label, confidence, text, mock } */
export async function classifyRecord(ctx, trigger, input) {
  const labels = classifyLabels(trigger);
  const d = await ctx.llm.decide({
    task: 'automation_classify',
    state: { company: `${ctx.state.company.name}: ${ctx.state.company.oneLiner || 'a SaaS'}`, ideal_customer: ctx.state.company.icp || '', record: String(input ?? '').slice(0, 4000) },
    questions: { route: { type: 'choice', instructions: 'Which category does this record belong to?', criteria: labels } },
    fallback: () => classifyFallback(labels, input),
  });
  const a = d.answers.route ?? {};
  const confidence = Number.isFinite(a.confidence) ? a.confidence : null;
  return { label: a.choice ?? null, confidence, mock: d.mock, text: `${a.choice ?? 'unclassified'}${d.mock ? ' (offline rule)' : ` · ${Math.round((confidence ?? 0) * 100)}% confidence`}` };
}

async function classifyStep(ctx, p, run) {
  const auto = ensureAutomations(ctx.state).automations.find((a) => a.id === p.autoId);
  const c = await classifyRecord(ctx, auto?.trigger, p.input);
  if (run) Object.assign(run, { aiLabel: c.label, aiConfidence: c.confidence, aiOutput: c.text, aiMock: c.mock });
}

export async function aiStepJob(ctx, p) {
  const A = ensureAutomations(ctx.state);
  const run = A.runs.find((r) => r.id === p.runId);
  if (p.mode === 'classify') return classifyStep(ctx, p, run);
  const company = ctx.state.company;
  const res = await ctx.llm.ask({
    task: 'automation_ai_step', context: bizBlock(ctx.state, 'insider', { metrics: false }),
    system: `You are an AI step inside a no-code automation for ${company.name} (${company.oneLiner || 'a SaaS'}). Be brief and factual; do not invent facts not in the input.`,
    prompt: `Mode: ${p.mode}. Input record: ${p.input}. ${p.mode === 'classify' ? 'Return one category label and a one-line reason.' : p.mode === 'draft' ? 'Draft a 2–3 sentence reply email.' : 'Summarize in 3 short bullets.'}`,
    schema: { type: 'object', additionalProperties: false, required: ['output'], properties: { output: { type: 'string' } } },
    temperature: 0.3, maxTokens: 250,
    fallback: () => ({ output: p.mode === 'classify' ? 'billing: mentions a charge' : p.mode === 'draft' ? `Thanks for reaching out about "${p.input}". Here is what to do next…` : `• ${p.input}\n• Next step: follow up this week\n• No blockers mentioned` }),
  });
  if (run) { run.aiOutput = String(res.data?.output ?? '').slice(0, 500); run.aiMock = res.mock; }
}

export { CAPABILITIES, TEMPLATES };
