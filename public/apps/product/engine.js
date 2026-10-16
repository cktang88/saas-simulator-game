// Product engine extensions: AI-coding sessions (workflow, plan usage, risks), the vibe-coding builder path,
// shipping consequences (evidence draw, security holes, deploys), the daily releases/latent-bug/metric-check
// loop and the decisions log. product.js calls these; UI lives in product/views.js.
//
// Numbers live in product/agent.js, builder.js, releases.js, decisions.js, tracker.js and fit.js (sources and
// [design] tags there).

import { notify } from '../../core/state.js';
import { post, addRecurring } from '../../core/bank.js';
import { activeSubs, trialingSubs } from '../../core/stripe.js';
import { setModifier } from '../../core/market.js';
import { rng, chance, round2, monthKey, uid } from '../../core/util.js';
import { aiCodingMultiplier } from '../people/capacity.js';
import { featureAdoption } from '../insights/model.js';
import { researchSlice } from './store.js';
import { shipFactors, featureValue, contactFactor, icpIsBroad, FIT } from './fit.js';
import { PLANS, DEFAULT_PLAN, throughputFactor, reworkShare, latentShare, securityBugChance, changeFailureRate, secretLeakChance, destructiveChance, perceivedSpeed, diffStats, usageFor, workflowScore } from './agent.js';
import { BUILDERS, BUILDER, builderSlice, builderMultiplier, loopChance, onBuilderShip, onFoundation, leakHazardMonthly, dailyFromMonthly, builderUsage, ceilingReason } from './builder.js';
import { releasesSlice, deploy, releasesDay } from './releases.js';
import { hostingDay } from './hosting.js';
import { obsDay } from './observability.js';
import './infra-operator.js'; // registers the infra_ops operator reader
import { CHECK_DAYS, metricCheck, rebuildOf, REBUILD, logDecision, parseKeepPlan } from './decisions.js';
import { issueKey, duplicateOf, DUP_SHARE } from './tracker.js';
import { productMistake } from './operator.js';
import { raiseProductIncident } from '../insights/raise.js';

const R = (state) => () => rng(state);
export const activeAccounts = (state) => activeSubs(state).length + trialingSubs(state).length;
const shippedN = (slice) => slice.features.filter((f) => f.status === 'shipped').length;
export const builderActive = (slice) => Boolean(slice.builder?.active);

// ---------------------------------------------------------------------------
// Plans and seats
// ---------------------------------------------------------------------------

// The founder's coding plan: the one picked in Product, else the default stack's "Claude Max" bill, else the
// best People coding seat. null = no coding agent.
const SEAT_PLAN = { code_pro: 'claude_pro', code_plus: 'cursor_premium', code_max: 'claude_max5', code_ultra: 'claude_max20', code_api: 'claude_max20' };
export function activePlan(state) {
  const a = state.apps.product?.agent;
  const rec = state.recurring ?? [];
  if (a?.recurringId && rec.some((r) => r.id === a.recurringId && r.active) && PLANS[a.planId]) return a.planId;
  const cm = rec.find((r) => r.active && /claude max/i.test(r.vendor) && !r.codingAgent);
  if (cm) return cm.amount >= 200 ? 'claude_max20' : DEFAULT_PLAN;
  const seat = (state.apps.people?.members ?? []).find((m) => m.status === 'active' && m.kind === 'ai_agent' && SEAT_PLAN[m.agentType]);
  return seat ? SEAT_PLAN[seat.agentType] : null;
}

// Switch the founder's plan: cancel the bill it replaces, add the new one (tagged so People counts the seat).
export function choosePlan(state, planId) {
  const p = PLANS[planId];
  if (!p) throw new Error('Unknown plan');
  const a = state.apps.product.agent;
  for (const r of state.recurring ?? []) {
    if (!r.active) continue;
    if (r.id === a.recurringId || (/claude max/i.test(r.vendor) && !r.codingAgent)) r.active = false;
  }
  const r = addRecurring(state, { vendor: p.label, amount: p.monthly, category: 'software', dayOfMonth: 5, note: `AI coding agent subscription (${p.tool})` });
  r.codingAgent = p.boostKey;
  a.planId = planId; a.recurringId = r.id;
  return r;
}
export function cancelPlan(state) {
  const a = state.apps.product.agent;
  for (const r of state.recurring ?? []) if (r.active && (r.id === a.recurringId || (/claude max/i.test(r.vendor) && !r.codingAgent))) r.active = false;
  a.recurringId = null; a.planId = null;
}

// ---------------------------------------------------------------------------
// Builder path
// ---------------------------------------------------------------------------

export function chooseBuilder(state, slice, tool) {
  const t = BUILDERS[tool];
  if (!t) throw new Error('Unknown builder');
  const b = builderSlice(slice);
  if (b.recurringId) { const old = state.recurring.find((r) => r.id === b.recurringId); if (old) old.active = false; }
  const r = addRecurring(state, { vendor: t.label, amount: t.monthly, category: 'software', dayOfMonth: 6, note: 'AI app builder (vibe coding)' });
  Object.assign(b, { tool, recurringId: r.id, active: true, startedDay: b.startedDay ?? state.day });
  // The builder generates auth, database, hosting and checkout scaffolding in hours, not ~80 agent-hours.
  if (slice.foundation && !slice.foundation.done) slice.foundation.effortHours = Math.min(slice.foundation.effortHours, BUILDER.foundationHuman);
  return b;
}

// Leave the builder for real code: export (lock-in costs extra without it) and rebuild part of what was shipped.
export function migrateFromBuilder(state, slice) {
  const b = builderSlice(slice);
  const shippedEffort = slice.features.filter((f) => f.status === 'shipped').reduce((x, f) => x + (f.effortHours ?? 0), 0);
  const rebuild = Math.round(shippedEffort * BUILDER.rebuildShare * (b.exported ? 1 : 1 + BUILDER.lockInExtra) + 20);
  slice.foundation = { effortHours: rebuild, progressHours: 0, done: false, doneDay: null, rebuild: true };
  b.active = false;
  b.ceiling = { ...(b.ceiling ?? {}), choice: 'migrate', day: state.day };
  const r = state.recurring.find((x) => x.id === b.recurringId); if (r) r.active = false;
  logDecision(slice, { day: state.day, kind: 'migrate', title: 'Moved off the app builder to real code', reason: `Rebuild ~${rebuild} h${b.exported ? '' : ' (no early export: +30% lock-in cost)'}` });
  return rebuild;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function aiMultiplier(state, slice) {
  return builderActive(slice) ? builderMultiplier(shippedN(slice)) : aiCodingMultiplier(state);
}

function resetMonth(state, a) {
  const m = monthKey(state);
  if (a.usage.month !== m) a.usage = { month: m, hours: 0, overageUsd: 0 };
}

// Before applying hours: usage/limits, throughput and wasted loops. Returns a multiplier on effective hours and info.
export function prepareSession(state, slice, rawHours, { founder }) {
  const a = slice.agent;
  const w = a.workflow;
  const mult = aiMultiplier(state, slice);
  const agent = mult > 1.0001;
  const info = { agent, mult, tp: throughputFactor(w, { agent: agent && !builderActive(slice) }), stalled: 0, overageUsd: 0, loop: false, windowHit: false, monthHit: false, capped: false };
  let factor = info.tp;
  if (founder && agent && builderActive(slice)) {
    const b = builderSlice(slice);
    const m = monthKey(state);
    if (b.usage.month !== m) b.usage = { month: m, hours: 0, topupUsd: 0 };
    const u = builderUsage(b, b.tool, rawHours);
    info.stalled = round2(rawHours * u.stalledShare);
    info.overageUsd = u.topupUsd;
    if (u.topupUsd > 0) post(state, { amount: -u.topupUsd, counterparty: BUILDERS[b.tool].label, description: 'Builder credit top-up', category: 'software', method: 'card' });
    const top = slice.buildQueue.map((id) => slice.features.find((f) => f.id === id)).find(Boolean);
    if (rng(state) < loopChance(top?.grade?.total, b)) { info.loop = true; b.loops++; factor *= 1 - BUILDER.loopWaste; }
  } else if (founder && agent) {
    resetMonth(state, a);
    const planId = activePlan(state) ?? DEFAULT_PLAN;
    const u = usageFor(planId, w, { sessionHours: rawHours, used: a.usage.hours, overageSoFar: a.usage.overageUsd });
    a.usage.hours = round2(a.usage.hours + u.allowanceUsed);
    a.usage.overageUsd = round2(a.usage.overageUsd + u.overageUsd);
    Object.assign(info, { stalled: u.hoursStalled, overageUsd: u.overageUsd, windowHit: u.windowHit, monthHit: u.monthHit, capped: u.capped, planId });
    if (u.overageUsd > 0) post(state, { amount: -u.overageUsd, counterparty: PLANS[planId].tool, description: `${PLANS[planId].label}: extra usage at API rates`, category: 'software', method: 'card', meta: { dev: true, usage: true } }); // R&D tooling, not COGS (as aicost/coding.js)
  }
  // Stalled hours run without the agent (waiting on the window, or coding by hand).
  if (info.stalled > 0 && rawHours > 0) factor *= 1 - (info.stalled / rawHours) * (1 - 1 / mult);
  info.factor = round2(factor);
  return info;
}

// After applying hours: accumulate per-feature workflow traces (rework, latent, security, change failure).
export function accumulate(state, slice, before, { agent, builder }) {
  const w = slice.agent.workflow;
  const debt = slice.agent.unreviewedDebt;
  const bw = builder ? { mode: 'oneshot', permissions: 'auto', diff: 'large', review: 'skim', tests: 'none', bugbot: false } : w;
  const r = builder ? 0.35 : reworkShare(w, { agent, unreviewedDebt: debt });
  const lat = latentShare(bw), sec = builder ? 0.02 : securityBugChance(w, { agent }), cfr = changeFailureRate(bw, { agent, unreviewedDebt: debt });
  const unrev = agent && !builder ? ({ every: 0, skim: 0.5, none: 1 }[w.review] ?? 0.5) : 0;
  for (const f of slice.features) {
    const d = (f.progressHours ?? 0) - (before.get(f.id) ?? 0);
    if (d <= 0) continue;
    const t = (f.trace ??= { h: 0, rw: 0, lat: 0, sec: 0, cfr: 0, unrev: 0 });
    t.h += d; t.rw += d * r; t.lat += d * lat; t.sec += d * sec; t.cfr += d * cfr; t.unrev += d * unrev;
  }
  return { r, cfr };
}

// Founder session record + rare risks. eff = effective hours applied.
export function finishSession(state, slice, { hours, eff, info, target, r, cfr }) {
  const a = slice.agent;
  const w = a.workflow;
  const builder = builderActive(slice);
  const rec = {
    id: uid('ses'), day: state.day, hours: round2(hours), eff: round2(eff), target, reworkHours: round2(eff * r), r, cfr,
    diff: diffStats(eff, w), stalled: info.stalled, overageUsd: info.overageUsd, loop: info.loop, windowHit: info.windowHit, monthHit: info.monthHit,
    perceived: perceivedSpeed(hours ? eff / hours : 0, builder ? { ...w, review: 'skim', permissions: 'auto', mode: 'oneshot' } : w),
    score: builder ? null : workflowScore(w), builder, w: { ...w },
  };
  if (rec.score == null) rec.score = 0.5;
  a.sessions.unshift(rec);
  if (a.sessions.length > 120) a.sessions.length = 120;
  // Unreviewed code piles up; bug-fix sessions with full review pay it down.
  if (info.agent && !builder) {
    const u = { every: 0, skim: 0.4, none: 1 }[w.review] ?? 0.4;
    a.unreviewedDebt = round2(Math.min(1, Math.max(0, a.unreviewedDebt + (eff * u * (w.diff === 'large' ? 1.2 : 1)) / 150 - (target === 'bugs' && w.review === 'every' ? eff / 80 : 0))));
  }
  if (info.agent && !builder) sessionRisks(state, slice, w, hours);
  return rec;
}

export function sessionRisks(state, slice, w, hours, { team = false } = {}) {
  const a = slice.agent;
  const scale = Math.max(0.25, hours / 4);
  const scanning = Boolean(state.apps.insights?.flags?.secretScanning);
  if (chance(state, secretLeakChance(w, { agent: true, scanning }) * scale)) {
    a.leaks++;
    if (scanning) {
      slice.bugs.push({ id: uid('bug'), title: 'Secret scanning caught an API key the agent committed: rotate it', hours: 1, progress: 0, severity: 'high', foundDay: state.day, fixedDay: null, triage: false });
      notify(state, 'Secret scanning blocked a commit with a live API key in it (the agent pasted it into a config file). Rotate the key.', { type: 'warn', app: 'product' });
    } else {
      const usd = 300 + Math.round(rng(state) * 2700);
      post(state, { amount: -usd, counterparty: 'Cloud / LLM provider', description: 'Abuse of a leaked API key (committed by the coding agent)', category: 'software', method: 'card' });
      slice.bugs.push({ id: uid('bug'), title: 'Rotate leaked keys, purge them from git history, audit access logs', hours: 3, progress: 0, severity: 'high', foundDay: state.day, fixedDay: null, triage: false });
      notify(state, `An API key the coding agent committed to the repo was scraped and abused: ${'$'}${usd.toLocaleString('en-US')} before you noticed. If customer data was reachable, you may have breach-notification duties (Legal).`, { type: 'bad', app: 'product' });
      productMistake(state, slice, { functionId: 'ai_building', id: 'leaked_secret', label: 'Secret leaked by an unsupervised coding agent', cost: { usd, hours: 3 }, detail: `${w.permissions === 'auto' ? 'Auto-accept' : 'Unread diffs'}; no secret scanning.`, delayed: false });
    }
  }
  if (!team && chance(state, destructiveChance(w, { agent: true }) * scale)) dbWipe(state, slice, w);
}

// The Replit-style disaster: the agent runs a destructive command against production.
export function dbWipe(state, slice, w) {
  const a = slice.agent;
  a.wipes++;
  const backups = Boolean(state.apps.insights?.flags?.testedBackups);
  const accounts = activeAccounts(state);
  if (backups) {
    slice.bugs.push({ id: uid('bug'), title: 'Restore production from backup and replay the last hours of writes', hours: 5, progress: 0, severity: 'high', foundDay: state.day, fixedDay: null, triage: false });
    addEffect(state, slice, 'churn', 'product-dbwipe', 1.08, 30);
    notify(state, 'The coding agent ran a destructive migration against production and dropped tables. Your tested backups worked: about 4 hours of data to replay and an afternoon of downtime.', { type: 'bad', app: 'product' });
    productMistake(state, slice, { functionId: 'ai_building', id: 'agent_prod_access', label: 'Coding agent with production access', cost: { hours: 5, customers: Math.round(accounts * 0.02) }, detail: 'Destructive command under auto-accept; restored from tested backups.' });
  } else {
    slice.bugs.push({ id: uid('bug'), title: 'Rebuild lost customer data by hand from emails, Stripe and exports', hours: 24, progress: 0, severity: 'high', foundDay: state.day, fixedDay: null, triage: false });
    addEffect(state, slice, 'churn', 'product-dbwipe', 1.6, 90);
    addEffect(state, slice, 'conversion', 'product-dbwipe', 0.8, 60);
    notify(state, 'The coding agent deleted your production database (it ran a destructive command it was allowed to run). There were no tested backups. Customers lost data; expect cancellations and a long week rebuilding records by hand.', { type: 'bad', app: 'product' });
    productMistake(state, slice, { functionId: 'ai_building', id: 'agent_db_wipe', label: 'Production database wiped by the coding agent (no backups)', cost: { hours: 24, customers: Math.max(1, Math.round(accounts * 0.3)), reputation: 3 }, detail: `${w.permissions === 'auto' ? 'Auto-accept' : 'Prompts'} with production credentials; backups never tested.`, delayed: true });
  }
}

// Temporary market modifiers with an end day.
export function addEffect(state, slice, kind, key, value, days) {
  setModifier(state, kind, key, value);
  slice.effects = (slice.effects ?? []).filter((e) => !(e.kind === kind && e.key === key));
  slice.effects.push({ kind, key, until: state.day + days });
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

export const realInterviewsSince = (state, since) => researchSlice(state).interviews.filter((i) => i.real && i.status === 'done' && (i.doneDay ?? i.day ?? -999) >= since).length;
export function daysSinceContact(state) {
  const days = [
    ...researchSlice(state).interviews.filter((i) => i.real && i.status === 'done').map((i) => i.doneDay ?? i.day),
    ...(state.apps.customers?.onboarding ?? []).filter((r) => r.status === 'held').map((r) => r.heldDay ?? r.day),
    ...(state.apps.calls?.meetings ?? []).filter((m) => m.status === 'held').map((m) => m.day), // sales/discovery calls
  ].filter((d) => Number.isFinite(d));
  return days.length ? state.day - Math.max(...days) : null;
}
export function contactNow(state, slice) {
  // Stub features with no spec text (old saves, tests) keep the neutral pre-evidence model.
  if (!slice.features.some((f) => f.status === 'shipped' && (f.problem || f.solution))) return 1;
  const first = Math.min(...slice.features.filter((f) => f.status === 'shipped').map((f) => f.shippedDay ?? state.day), state.day);
  return contactFactor(daysSinceContact(state), { daysSinceFirstShip: state.day - first });
}

const MIGRATION = /\b(import|sync|migrat|schema|table|field|column|history|records?)\b/i;

// Consequences decided at ship. Returns { reworkShare, latentShare }.
export function onShipExtras(state, slice, f) {
  const t = f.trace ?? { h: 0 };
  const h = t.h || 0;
  const out = { reworkShare: h ? t.rw / h : null, latentShare: h ? t.lat / h : 0.5 };
  const insights = researchSlice(state).insights;
  f.ship = shipFactors(f, { insights, realInterviewsRecent: realInterviewsSince(state, state.day - 56), rand: R(state), state });
  issueKey(slice, f);
  // Security hole in the shipped code (missing auth check / IDOR) surfaces later.
  if (h && rng(state) < t.sec / h) {
    slice.latentBugs = [...(slice.latentBugs ?? []), { id: `bug_${f.id}_sec`, featureId: f.id, title: `Missing authorization check in "${String(f.title).slice(0, 40)}": one account can read another's records`, hours: 4, progress: 0, severity: 'high', security: true, foundDay: null, fixedDay: null, appearDay: state.day + 10 + Math.floor(rng(state) * 50) }];
  }
  const rel = releasesSlice(slice);
  const res = deploy(rel, f, { day: state.day, cfr: h ? t.cfr / h : 0.08, rand: R(state), accounts: activeAccounts(state), migration: MIGRATION.test(`${f.solution} ${f.title}`) });
  if (res.error) {
    if (res.error.status === 'resolved') notify(state, `Canary caught a bad release of "${f.title}" and rolled it back automatically (${res.error.events} errors on 10% of traffic).`, { type: 'warn', app: 'product' });
    else if (res.error.visible) notify(state, `${rel.flags.alerts ? 'Alert: e' : 'E'}rror spike after deploying "${f.title}": ${res.error.title}. Roll back or fix it in Releases.`, { type: 'bad', app: 'product' });
    // Unresolved errors reaching users are an incident: tickets spike and a status update is owed.
    if (res.error.status !== 'resolved' && res.error.users > 0) raiseProductIncident(state, { cause: `bad release of "${f.title}": ${res.error.title}`, severity: res.error.severity === 'crash' ? 0.5 : 0.25, minutes: res.error.detectMin, major: res.error.severity === 'crash', source: 'release' });
  }
  if (builderActive(slice)) onBuilderShip(builderSlice(slice), f, R(state));
  // Mistakes ledger: unvalidated features and unreviewed agent code (traceable at ship; the cost lands later).
  if (f.ship.evidence < 0.2) {
    productMistake(state, slice, { functionId: 'product_prioritization', id: 'unvalidated_feature', key: `unvalidated:${f.id}`, label: 'Shipped a feature with no real customer evidence', cost: { hours: round2((f.agentHours ?? f.effortHours / 2) || 0) }, detail: `"${f.title}": no linked real interview evidence${f.ship.unwanted ? '. Customers don\'t want it.' : '.'}`, delayed: true });
  }
  if (h && t.unrev / h > 0.5) {
    const extra = round2(Math.max(0, (out.reworkShare ?? 0.15) - 0.15) * (f.effortHours ?? 0));
    productMistake(state, slice, { functionId: 'ai_building', id: 'unreviewed_agent_code', key: `unreviewed:${f.id}`, label: 'Merged agent code without reading the diffs', cost: { hours: extra }, detail: `"${f.title}": ${Math.round((t.unrev / h) * 100)}% of its build hours merged unread; ~${extra} h of extra rework.`, delayed: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Daily
// ---------------------------------------------------------------------------

export function dayExtras(state, slice) {
  // F7: a broad "everyone" ICP caps fit at the first spec that goes into the build (or ships); logged once.
  if (icpIsBroad(state.company.icp) && slice.features.some((f) => ['queued', 'building', 'shipped'].includes(f.status))) {
    productMistake(state, slice, { functionId: 'customer_discovery', id: 'broad_icp', key: 'broad_icp', label: 'Built for "everyone" (no specific ICP)', cost: { hours: 3, days: 10 }, delayed: true,
      detail: `Your ICP ("${String(state.company.icp || '(blank)').slice(0, 80)}") names no role or segment, so feature relevance and value are capped at ${FIT.broadIcpCap} and no buyer recognises themselves in the pitch. Name one job title or segment you can list by name.` });
  }
  // Effects expire.
  for (const e of slice.effects ?? []) if (state.day >= e.until) setModifier(state, e.kind, e.key, 1);
  slice.effects = (slice.effects ?? []).filter((e) => state.day < e.until);

  // Releases: unresolved errors hurt; unmonitored ones surface via tickets.
  const rel = releasesSlice(slice);
  const r = releasesDay(rel, { day: state.day, accounts: activeAccounts(state) });
  setModifier(state, 'churn', 'product-release-errors', r.churnMult);
  obsDay(state); hostingDay(state); // observability upkeep and bills; hosting ops hours, incidents, usage spikes
  for (const e of r.surfaced) notify(state, `Customers are reporting errors after the "${rel.deployments.find((d) => d.id === e.deploymentId)?.title ?? 'last'}" release (${e.users} users affected). You had no monitoring, so this ran for ${Math.round(e.minutes / 60)} h before you knew.`, { type: 'bad', app: 'product' });

  // 30-day metric checks.
  for (const f of slice.features) {
    if (f.status !== 'shipped' || f.check || f.shippedDay == null || state.day - f.shippedDay < CHECK_DAYS) continue;
    const value = featureValue(f, { icp: `${state.company.icp} ${state.company.oneLiner}`, insights: researchSlice(state).insights });
    const adoption = featureAdoption({ daysLive: CHECK_DAYS, usefulShare: value });
    f.check = metricCheck(f, { value, rand: R(state), day: state.day, adoption: round2(adoption) });
    f.decisionDue = state.day + 30;
    notify(state, `30-day check on "${f.title}": ${f.check.text} Keep, iterate or kill it (Product → Decisions).`, { type: f.check.verdict === 'hit' ? 'good' : 'warn', app: 'product' });
  }
  for (const f of slice.features) {
    if (f.status === 'shipped' && f.check && !f.decision && state.day >= (f.decisionDue ?? Infinity)) {
      f.decision = 'keep'; f.decisionDefault = true; // nobody decided: it stays, clutter and all
      if (f.check.verdict !== 'hit') productMistake(state, slice, { functionId: 'product_prioritization', id: 'kept_missed_feature', key: `kept:${f.id}`, label: 'Kept a feature that missed its metric without deciding', cost: { hours: 2 }, detail: `"${f.title}": ${f.check.text}`, delayed: true });
    }
  }

  // A keep with a new target comes due: measure again. Still missing it and no new plan means the decision reopens
  // (and defaults to a logged kept_missed_feature if nobody decides again).
  for (const f of slice.features) {
    const kp = f.keepPlan;
    if (f.status !== 'shipped' || f.decision !== 'keep' || !kp || kp.checked || state.day < kp.dueDay) continue;
    kp.checked = true;
    const value = featureValue(f, { icp: `${state.company.icp} ${state.company.oneLiner}`, insights: researchSlice(state).insights });
    const check = metricCheck({ ...f, metric: kp.clean ?? kp.metric, baseline: f.check?.got != null ? `${f.check.got}${f.check.unit === '%' ? '%' : ''}` : f.baseline }, { value, rand: R(state), day: state.day, adoption: round2(featureAdoption({ daysLive: CHECK_DAYS, usefulShare: value })) });
    kp.verdict = check.verdict;
    notify(state, `Re-check on "${f.title}" against your new target: ${check.text}`, { type: check.verdict === 'hit' ? 'good' : 'warn', app: 'product' });
    if (check.verdict !== 'hit') { f.check = check; f.decision = null; f.decisionDue = state.day + 14; f.keepPlan = null; }
  }

  // Builder: data leaks once real users exist; the ceiling.
  if (builderActive(slice) || slice.builder?.tables?.length) {
    const b = builderSlice(slice);
    const accounts = activeAccounts(state);
    if (accounts > 0 && b.tables.length && chance(state, dailyFromMonthly(leakHazardMonthly(b)))) builderLeak(state, slice, b, accounts);
    if (b.active) {
      const why = ceilingReason(b, { accounts, queued: slice.buildQueue.map((id) => slice.features.find((f) => f.id === id)).filter(Boolean) });
      if (why) {
        b.ceiling = { day: state.day, reason: why, choice: null };
        notify(state, `App-builder ceiling: ${why}. Decide in Product → Build: harden with a senior engineer, migrate to real code, or keep prompting (more broken-code loops).`, { type: 'warn', app: 'product' });
      }
    }
  }
}

export function builderLeak(state, slice, b, accounts) {
  const cause = b.serviceRoleInFrontend ? 'a service_role key in your frontend JavaScript' : b.tables.some((t) => t.rls === 'off') ? `table "${b.tables.find((t) => t.rls === 'off').name}" with row-level security off` : b.tables.some((t) => t.rls === 'permissive') ? `an RLS policy on "${b.tables.find((t) => t.rls === 'permissive').name}" that allows every row ("using (true)")` : 'a misconfiguration nobody caught';
  b.leaks.push({ day: state.day, cause });
  const usd = 1500 + Math.round(rng(state) * 3500);
  post(state, { amount: -usd, counterparty: 'Breach response (lawyer + notifications)', description: 'Data exposure: legal review and customer notifications', category: 'legal', method: 'card' });
  addEffect(state, slice, 'churn', 'product-data-leak', 1.35, 90);
  addEffect(state, slice, 'conversion', 'product-data-leak', 0.85, 90);
  const hrs = BUILDER.hardenHours[0] + Math.round(rng(state) * (BUILDER.hardenHours[1] - BUILDER.hardenHours[0]));
  slice.bugs.push({ id: uid('bug'), title: 'Emergency hardening after the data exposure: RLS on every table, rotate keys, audit access', hours: hrs, progress: 0, severity: 'high', foundDay: state.day, fixedDay: null, triage: false, security: true });
  for (const t of b.tables) if (t.rls === 'off') t.rls = 'permissive';
  b.serviceRoleInFrontend = false;
  raiseProductIncident(state, { cause: `data exposure via ${cause}`, severity: 0.9, minutes: 120, major: true, source: 'data_leak' });
  // Legal exposes no task API: the breach duties (notifications, regulator) are in the notice below and the Legal app.
  notify(state, `Customer data from your app was exposed through ${cause}. A researcher (or worse) found it with the public anon key. You owe breach notifications (GDPR: 72 hours to the regulator), refunds and an apology; expect cancellations.`, { type: 'bad', app: 'product' });
  productMistake(state, slice, { functionId: 'ai_building', id: 'vibe_data_leak', label: 'Vibe-coded app leaked customer data', cost: { usd, hours: hrs, customers: Math.max(1, Math.round(accounts * 0.25)), reputation: 3 }, detail: `Cause: ${cause}.${b.scannedDay == null ? ' Never ran the security scan.' : ''}${b.reviewed ? '' : ' No senior review.'}`, delayed: true });
}

// Latent bugs that surface: tracker triage, duplicates, and exploited security holes.
export function surfaceBugs(state, slice, due) {
  for (const b of due) {
    const bug = { ...b, foundDay: state.day, appearDay: undefined, triage: true };
    issueKey(slice, bug);
    slice.bugs.push(bug);
    if (rng(state) < DUP_SHARE) slice.bugs.push(duplicateOf(bug, state.day));
    if (bug.security && rng(state) < 0.3) {
      const accounts = activeAccounts(state);
      addEffect(state, slice, 'churn', `product-exposure-${bug.id}`, 1.2, 60);
      notify(state, `A customer found they could see another account's records ("${bug.title}"). That is a data exposure: fix it today and tell affected customers.`, { type: 'bad', app: 'product' });
      productMistake(state, slice, { functionId: 'ai_building', id: 'agent_security_hole', label: 'Security hole in agent-written code reached customers', cost: { hours: bug.hours + 2, customers: Math.max(1, Math.round(accounts * 0.05)), reputation: 1 }, detail: bug.title, delayed: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export function decideFeature(state, slice, f, kind, reason = '') {
  if (!['keep', 'iterate', 'kill'].includes(kind)) throw new Error('keep, iterate or kill');
  f.decision = kind; f.decisionDefault = false;
  if (kind === 'keep' && f.check && f.check.verdict !== 'hit') {
    // F3: keeping a feature that missed its metric is only a decision with a new measurable target and a date.
    const plan = parseKeepPlan(state, reason);
    if (plan) f.keepPlan = { ...plan, day: state.day, checked: false };
    else productMistake(state, slice, { functionId: 'product_prioritization', id: 'kept_missed_feature', key: `kept:${f.id}`, label: 'Kept a feature that missed its metric without a new target', cost: { hours: 2 }, detail: `"${f.title}": ${f.check.text} You said keep but set no new target metric and date, so nothing will tell you whether it earns its place.`, delayed: true });
  }
  logDecision(slice, { day: state.day, kind, featureId: f.id, title: f.title, reason: String(reason).slice(0, 300), check: f.check?.text ?? null });
  if (kind === 'kill') {
    f.status = 'killed'; f.killedDay = state.day;
    for (const b of slice.bugs) if (b.featureId === f.id && !b.fixedDay) { b.fixedDay = state.day; b.wontFix = true; }
    slice.latentBugs = (slice.latentBugs ?? []).filter((b) => b.featureId !== f.id);
  }
  return f;
}

export function declineSpec(state, slice, f, reason) {
  f.status = 'declined'; f.declinedDay = state.day;
  slice.buildQueue = slice.buildQueue.filter((x) => x !== f.id);
  logDecision(slice, { day: state.day, kind: 'decline', featureId: f.id, title: f.title || '(untitled)', reason: String(reason ?? '').slice(0, 300) });
}

// Rebuild tax: re-queuing something you killed within 90 days costs +25% effort and is logged.
export function applyRebuildTax(state, slice, f) {
  // Re-queuing a spec already flagged as a rebuild (pulled from the queue, then added back): queueFeature reset
  // effortHours from the estimate, so the tax applies again (logged once, when it was first detected).
  if (f.rebuildOf) { f.effortHours += Math.round(f.effortHours * REBUILD.tax); return null; }
  const prev = rebuildOf(slice.features, f, state.day);
  if (!prev) return null;
  f.rebuildOf = prev.id;
  const extra = Math.round(f.effortHours * REBUILD.tax);
  f.effortHours += extra;
  logDecision(slice, { day: state.day, kind: 'rebuild', featureId: f.id, title: f.title, reason: `Rebuilds "${prev.title}", ${prev.status === 'killed' ? 'killed' : 'abandoned'} ${state.day - (prev.killedDay ?? prev.declinedDay)} days ago (+${extra} h)` });
  productMistake(state, slice, { functionId: 'product_prioritization', id: 'going_in_circles', key: `rebuild:${f.id}`, label: 'Rebuilt a feature you had killed', cost: { hours: round2(extra / 2), days: 3 }, circles: true, detail: `"${f.title}" rebuilds "${prev.title}" within ${REBUILD.windowDays} days.` });
  return prev;
}

