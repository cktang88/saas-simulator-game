// Weekly plan, OKRs and time-blocking (Reclaim / Motion / Notion style), the Friday review of planned vs actual
// time, kill/pivot criteria and the founder-sustainability reads (operator-tiers audit fix 14).
// Sources: docs/research/tools/deep/d12-ai-assistants-ops.md §5 Reclaim (focus target e.g. 12 h/week, Starter
// $10/seat yearly, $12 monthly, fetched 2026-10-14; failure modes: overblocking, task-sync flooding), §6 Motion
// (Pro AI $19/seat [conflicting sources]; reschedule thrash); docs/research/operators/o5 §4 (stellar: weekly
// planning ritual with three outcomes, half-day maker blocks, Friday calendar vs goals review; protected maker
// hours 15-20 stellar, 5-8 average, <3 mediocre [design]) and §6 (kill criteria set before a bet and reviewed on
// schedule; Sifted Feb 2025: 54% of founders report burnout in 12 months). docs/review/tool-gap-analysis.md item 18.
//
// Operator tiers (principle 7):
// - stellar: Monday plan with at most three priorities tied to a key result, time-blocked in half-day chunks,
//   Friday review that names one thing to stop; 60%+ of hours land on the priorities; kill criteria written
//   before the bet and decided on the date.
// - good: plans most weeks; 40-60% of hours on priorities; reviews late.
// - average: reactive; priorities written but not blocked; 25-40%.
// - mediocre: nine-item lists or no plan; meetings and inbox eat the week (<25%); criteria never set, or missed and
//   ignored for months.
// Separation metric: share of hours on the stated priorities; days past a missed criterion before a decision.

import { ensure, notify } from '../../core/state.js';
import { uid, round2, dayOfWeek, fmtDate, money, clamp, words } from '../../core/util.js';
import { post, addRecurring, totalCash } from '../../core/bank.js';
import { mrr, activeSubs, trialingSubs } from '../../core/stripe.js';
import { ensureCalendar, scheduleEvent, focusSlot, focusHoursByWeek, isFragmentedDay } from '../../core/calendar.js';
import { logMistake } from '../../core/operator.js';
import { syncPivotSnapshot, substantivePivots } from '../../core/pivots.js';
import { shippedFeatures } from '../../core/market.js';
import { killSignal } from '../research/hypotheses.js';

export const TIME_CATEGORIES = {
  build: 'Product & building', sales: 'Sales', customers: 'Customers & research', marketing: 'Marketing & growth',
  fundraising: 'Fundraising & investors', hiring: 'Hiring & team', admin: 'Finance, legal & admin', comms: 'Inbox, messages & meetings', other: 'Other',
};
const APP_CAT = { calls: 'sales', crm: 'sales', outreach: 'sales', fundraising: 'fundraising', people: 'hiring', cofounder: 'hiring', research: 'customers', success: 'customers', helpdesk: 'customers', customers: 'customers', messages: 'comms', product: 'build', organic: 'marketing', ads: 'marketing', website: 'marketing', channels: 'marketing', books: 'admin', bank: 'admin', legal: 'admin' };
const LABEL_RULES = [
  ['comms', /email reply|texting|polite no|context switching|inbox|^meetings \((meeting|calendar)\)|reply$|waiting for a reply|calendar|rescheduling|skim/i],
  ['fundraising', /investor|pitch|deck|fundrais|safe\b|board|data room|term sheet|raise/i],
  ['hiring', /hire|hiring|candidate|job post|offer|payroll|performance|onboard(ing)? (an? )?(employee|hire)|reference|1:1|scorecard|offboarding/i],
  ['customers', /support|ticket|customer|trial check|interview|research|churn|help-center|macro|qbr|renewal|onboarding call/i],
  ['sales', /prospect|outbound|cold|sequence|deal|demo|crm|proposal|pipeline|call notes|linkedin outreach|discovery|pilot|procurement|security questionnaire|multi-thread|^meetings \(call\)/i],
  ['marketing', /seo|article|post\b|posting|content|\bads?\b|campaign|website|launch|newsletter|ugc|creative|landing|organic|referral|pricing|price|community|podcast|affiliate|partner/i],
  ['build', /cod(e|ing)|build|ship|spec|feature|bug|deploy|release|mvp|product|qa\b|design/i],
  ['admin', /book|close|reconcil|tax|legal|filing|bank|transfer|treasury|journal|categor|vat|incorporat|compliance|billing|loan|automation|assistant|tool|subscription|83\(b\)|plan(ning)?|review/i],
];
export function categorize(entry) {
  const label = String(entry?.label ?? '');
  for (const [cat, re] of LABEL_RULES) if (re.test(label)) return cat;
  if (entry?.app && APP_CAT[entry.app]) return APP_CAT[entry.app];
  return 'other';
}

export const SCHEDULER_PLANS = {
  reclaim_starter: { vendor: 'Reclaim.ai', name: 'Reclaim Starter', price: 12, note: '$12/seat monthly, $10 yearly (reclaim.ai/pricing, fetched 2026-10-14, d12 §5). Focus Time, habits, task sync.' },
  motion_pro: { vendor: 'Motion', name: 'Motion Pro AI', price: 19, note: '$19/seat/month (usemotion.com/pricing; sources conflict up to $49 monthly, d12 §6 [unverified]). Auto-schedules tasks with deadlines.' },
};
export const PLAN_HOURS = { weekly: 0.5, weeklyWithDigest: 0.3, review: 0.25, okr: 0.5, criterion: 0.25, decision: 0.5, blockEach: 0.05, schedulerSetup: 0.25 };
export const DRIFT = { shareFloor: 0.35, stellar: 0.6, good: 0.45, average: 0.3 }; // [design] o5 §4 has no measured shares
export const KR_METRICS = {
  mrr: 'MRR ($)', customers: 'Paying customers', trials: 'Trials in progress', interviews: 'Real customer interviews done',
  features: 'Features shipped', meetings: 'External meetings held',
};

export function ensurePlanner(state) {
  const P = ensure(state, 'planner', () => ({}));
  P.okrs ??= [];
  P.weeks ??= {};
  P.scheduler ??= { plan: null, recurringId: null, targetFocus: 12, since: null };
  P.criteria ??= [];
  P.pivots ??= [];
  P.ideaText ??= null;
  P.lastIdeaDay ??= null;
  P.stats ??= { plannedWeeks: 0, reviews: 0, drifts: 0 };
  return P;
}

export const weekStartOf = (state, day = state.day) => day - ((dayOfWeek(state, day) + 6) % 7);

// ---------------------------------------------------------------------------
// OKRs
// ---------------------------------------------------------------------------
export function metricValue(state, metric) {
  switch (metric) {
    case 'mrr': return mrr(state);
    case 'customers': return activeSubs(state).length;
    case 'trials': return trialingSubs(state).length;
    case 'interviews': return (state.apps.research?.interviews ?? []).filter((i) => i.real && i.status === 'done').length;
    case 'features': return shippedFeatures(state).length;
    case 'meetings': return ensureCalendar(state).events.filter((e) => e.status === 'done' && ['call', 'meeting', 'pitch', 'interview'].includes(e.kind)).length;
    default: return null;
  }
}
export function addOkr(state, { objective, krs = [], dueDay = state.day + 90 }) {
  const P = ensurePlanner(state);
  if (!String(objective ?? '').trim()) throw new Error('Write the objective.');
  const o = { id: uid('okr'), objective: String(objective).slice(0, 200), createdDay: state.day, dueDay, krs: [] };
  for (const k of krs.slice(0, 4)) {
    if (!KR_METRICS[k.metric] && k.metric !== 'manual') continue;
    o.krs.push({ id: uid('kr'), metric: k.metric, label: String(k.label || KR_METRICS[k.metric] || 'Key result').slice(0, 120), target: Number(k.target) || 0, baseline: metricValue(state, k.metric) ?? 0, manual: 0 });
  }
  P.okrs.push(o);
  return o;
}
export function krProgress(state, kr) {
  const cur = kr.metric === 'manual' ? kr.manual : metricValue(state, kr.metric) ?? 0;
  const span = kr.target - kr.baseline;
  return { current: cur, pct: span ? clamp((cur - kr.baseline) / span, 0, 1.5) : cur >= kr.target ? 1 : 0 };
}
export const allKrs = (state) => ensurePlanner(state).okrs.flatMap((o) => o.krs.map((k) => ({ ...k, objective: o.objective })));

// ---------------------------------------------------------------------------
// Weekly plan
// ---------------------------------------------------------------------------
export function currentWeek(state) { return ensurePlanner(state).weeks[weekStartOf(state)] ?? null; }

/** Monday planning: priorities [{ text, category, krId, hours }]. Returns the week record. */
export function setWeekPlan(state, priorities) {
  const P = ensurePlanner(state);
  const ws = weekStartOf(state);
  const list = priorities.filter((p) => String(p.text ?? '').trim()).map((p) => ({
    id: uid('pri'), text: String(p.text).slice(0, 160), category: TIME_CATEGORIES[p.category] ? p.category : 'other', krId: p.krId || null, hours: clamp(Number(p.hours) || 0, 0, 40), blocked: 0,
  }));
  if (!list.length) throw new Error('Write at least one priority.');
  const prev = P.weeks[ws];
  P.weeks[ws] = { weekStart: ws, plannedDay: state.day, priorities: list, review: prev?.review ?? null, replans: (prev ? (prev.replans ?? 0) + 1 : 0) };
  if (!prev) P.stats.plannedWeeks++;
  return P.weeks[ws];
}

/** Block focus time for this week's priorities (fixed blocks by hand, or flexible ones by an AI scheduler). */
export function blockPriorities(state, { flexible = false, chunkMin = 180 } = {}) {
  const wk = currentWeek(state);
  if (!wk) throw new Error('Plan the week first.');
  const ws = wk.weekStart;
  const created = [];
  for (const p of wk.priorities) {
    let left = Math.max(0, p.hours - p.blocked);
    while (left >= 0.75) {
      const dur = Math.min(chunkMin, Math.round((left * 60) / 30) * 30);
      const slot = focusSlot(state, { fromDay: Math.max(state.day, ws), toDay: ws + 5, duration: dur });
      if (!slot) break;
      const ev = scheduleEvent(state, { title: `Focus: ${p.text}`.slice(0, 80), kind: 'focus', day: slot.day, start: slot.start, duration: dur, flexible, priorityId: p.id, allowConflict: true });
      created.push(ev);
      p.blocked = round2(p.blocked + dur / 60);
      left -= dur / 60;
    }
  }
  return created;
}

export function chooseScheduler(state, planId) {
  const P = ensurePlanner(state);
  const p = SCHEDULER_PLANS[planId];
  if (planId && !p) throw new Error('Unknown plan');
  if ((planId || null) === P.scheduler.plan) return p ?? null; // already on it (stale button): no second charge or bill
  if (P.scheduler.recurringId) { const r = state.recurring.find((x) => x.id === P.scheduler.recurringId); if (r) r.active = false; P.scheduler.recurringId = null; }
  P.scheduler.plan = planId || null;
  if (!p) return null;
  post(state, { amount: -p.price, counterparty: p.vendor, description: `${p.name} subscription`, category: 'software', method: 'card' });
  P.scheduler.recurringId = addRecurring(state, { vendor: p.vendor, amount: p.price, category: 'software', dayOfMonth: 1, note: `${p.name} (AI calendar)` }).id;
  P.scheduler.since = state.day;
  return p;
}

/** Where the week's hours went, against the plan. */
export function weekActuals(state, ws = weekStartOf(state)) {
  const log = (state.founder.timeLog ?? []).filter((t) => t.day >= ws && t.day < ws + 7);
  const by = {};
  for (const t of log) { const c = categorize(t); by[c] = round2((by[c] ?? 0) + t.hours); }
  const total = round2(log.reduce((a, t) => a + t.hours, 0));
  const wk = ensurePlanner(state).weeks[ws];
  const cats = new Set((wk?.priorities ?? []).map((p) => p.category));
  const onPri = round2([...cats].reduce((a, c) => a + (by[c] ?? 0), 0));
  const planned = round2((wk?.priorities ?? []).reduce((a, p) => a + p.hours, 0));
  const cal = ensureCalendar(state);
  const meetings = round2(cal.events.filter((e) => e.day >= ws && e.day < ws + 7 && e.charged && !['focus', 'personal', 'deadline'].includes(e.kind)).reduce((a, e) => a + e.duration / 60, 0));
  const focusUsed = round2((cal.deepWork ?? []).filter((x) => x.day >= ws && x.day < ws + 7).reduce((a, x) => a + x.focusHours, 0));
  const fragmented = Array.from({ length: 5 }, (_, i) => ws + i).filter((d) => d <= state.day && isFragmentedDay(state, d)).length;
  return { ws, total, by, onPriorities: onPri, share: total > 0 && wk ? onPri / total : null, planned, meetings, focusUsed, fragmented, plannedWeek: !!wk, count: wk?.priorities.length ?? 0 };
}

/** Friday review: planned vs actual, plus one thing to stop. */
export function reviewWeek(state, { stopDoing = '' } = {}) {
  const P = ensurePlanner(state);
  const ws = weekStartOf(state);
  const wk = P.weeks[ws];
  if (!wk) throw new Error('No plan this week to review.');
  const a = weekActuals(state, ws);
  wk.review = { day: state.day, share: a.share, onPriorities: a.onPriorities, total: a.total, stopDoing: String(stopDoing).slice(0, 200), focusUsed: a.focusUsed, meetings: a.meetings };
  P.stats.reviews++;
  return wk.review;
}

// Finalise last week on Monday: drift against the plan is a coachable mistake with a traceable cost.
function closeWeek(state, ws) {
  const P = ensurePlanner(state);
  const wk = P.weeks[ws];
  if (!wk || wk.closed) return;
  wk.closed = true;
  const a = weekActuals(state, ws);
  wk.final = { share: a.share, total: a.total, onPriorities: a.onPriorities, planned: a.planned, by: a.by, focusUsed: a.focusUsed, meetings: a.meetings, fragmented: a.fragmented };
  if (a.total < 10 || a.share == null) return;
  const tooMany = wk.priorities.length > 3;
  if (a.share < DRIFT.shareFloor || tooMany) {
    P.stats.drifts++;
    const top = Object.entries(a.by).filter(([c]) => !wk.priorities.some((p) => p.category === c)).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([c, h]) => `${TIME_CATEGORIES[c]} ${h}h`).join(', ');
    const lost = round2(Math.min(15, Math.max(a.planned - a.onPriorities, a.total * (DRIFT.shareFloor - a.share), 1)));
    logMistake(state, {
      functionId: 'founder_time', id: tooMany ? 'busy_work' : 'busy_work', label: tooMany ? `Week planned with ${wk.priorities.length} priorities` : 'Week drifted from the plan',
      cost: { hours: lost }, delayed: true, app: 'calendar', key: `drift:${ws}`,
      detail: `${Math.round((a.share ?? 0) * 100)}% of ${a.total}h went to your priorities (${wk.priorities.map((p) => p.text).join('; ').slice(0, 140)}).${top ? ` The rest went to ${top}.` : ''}${tooMany ? ' A plan with more than three priorities is a to-do list.' : ''}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Kill / pivot criteria (founder sustainability)
// ---------------------------------------------------------------------------
export const CRITERION_METRICS = { mrr: 'MRR at least ($)', customers: 'Paying customers at least', runway: 'Runway at least (months)', interviews: 'Real customer interviews at least', growth: 'MRR growth last 30 days at least (%)' };
function criterionValue(state, metric) {
  if (metric === 'runway') {
    const d = state.metrics?.daily ?? [];
    if (d.length < 31) return Infinity;
    const back = d[d.length - 31];
    const inflow = state.bank.txns.filter((t) => t.day > back.day && ['investment', 'owner_contribution', 'loan'].includes(t.category)).reduce((a, t) => a + t.amount, 0);
    const burn = -((d.at(-1).cash - back.cash - inflow) / (d.at(-1).day - back.day || 1)) * 30;
    return burn > 0 ? totalCash(state) / burn : Infinity;
  }
  if (metric === 'growth') {
    const d = state.metrics?.daily ?? [];
    const prev = d.find((x) => x.day >= state.day - 30)?.mrr ?? 0;
    return prev > 0 ? ((mrr(state) - prev) / prev) * 100 : 0;
  }
  return metricValue(state, metric);
}
const betStart = (P) => (P.pivots.length ? P.pivots.at(-1).day : 0);

export function addCriterion(state, { metric, threshold, byDay, action = 'pivot', note = '' }) {
  const P = ensurePlanner(state);
  if (!CRITERION_METRICS[metric]) throw new Error('Pick a metric.');
  if (!(Number(byDay) > state.day)) throw new Error('Pick a review date in the future.');
  const c = { id: uid('kc'), metric, threshold: Number(threshold) || 0, byDay: Number(byDay), action, note: String(note).slice(0, 200), setDay: state.day, status: 'active', beforeBet: state.day - betStart(P) <= 45, renewals: 0 };
  P.criteria.push(c);
  return c;
}

/** Decide on a missed (or met) criterion: pivot, stop, or persist with a new dated criterion. */
export function decideCriterion(state, id, decision, { byDay = null, threshold = null } = {}) {
  const P = ensurePlanner(state);
  const c = P.criteria.find((x) => x.id === id);
  if (!c || !['missed', 'met'].includes(c.status)) throw new Error('Nothing to decide yet.');
  // Validate before mutating: a rejected persist must leave the criterion open (the UI mutates state in place).
  if (decision === 'persist' && !(Number(byDay) >= state.day + 30)) throw new Error('Persisting needs a new criterion at least 30 days out.');
  c.status = 'decided'; c.decision = decision; c.decisionDay = state.day;
  if (decision === 'persist') {
    const n = addCriterion(state, { metric: c.metric, threshold: threshold ?? c.threshold, byDay, action: c.action, note: `Renewed from ${fmtDate(state, c.byDay)}` });
    n.renewals = (c.renewals ?? 0) + 1;
    n.beforeBet = c.beforeBet;
    if (n.renewals >= 2 && c.missedDay != null) logMistake(state, { functionId: 'founder_sustainability', id: 'sunk_cost', label: 'Kill criterion pushed out again', cost: { days: 30 }, circles: true, app: 'you', key: `sunk:${n.id}`, detail: `Missed ${c.renewals + 1} times and pushed out again.`, lesson: 'Each renewal buys more of the same. Decide from the metrics, not from the time already spent.' });
  }
  return c;
}

function checkCriteria(state) {
  const P = ensurePlanner(state);
  for (const c of P.criteria) {
    if (c.status === 'active' && state.day >= c.byDay) {
      const v = criterionValue(state, c.metric);
      c.value = Number.isFinite(v) ? round2(v) : v;
      if (v >= c.threshold) { c.status = 'met'; c.metDay = state.day; notify(state, `Criterion met: ${CRITERION_METRICS[c.metric]} ${c.threshold} by ${fmtDate(state, c.byDay)} (now ${Number.isFinite(v) ? round2(v) : 'not burning'}).`, { type: 'good', app: 'you' }); }
      else { c.status = 'missed'; c.missedDay = state.day; notify(state, `Kill criterion missed: ${CRITERION_METRICS[c.metric]} ${c.threshold} by ${fmtDate(state, c.byDay)} (actual ${Number.isFinite(v) ? round2(v) : '—'}). Your stated action: ${c.action}.`, { type: 'bad', app: 'you' }); }
    }
    if (c.status === 'missed') {
      const late = state.day - c.missedDay;
      if (late > 0 && late % 30 === 0) {
        const d = state.metrics?.daily ?? [];
        const back = d[Math.max(0, d.length - 31)];
        const inflow = back ? state.bank.txns.filter((t) => t.day > back.day && ['investment', 'owner_contribution', 'loan'].includes(t.category)).reduce((a, t) => a + t.amount, 0) : 0;
        const burned = back ? Math.max(0, -(d.at(-1).cash - back.cash - inflow)) : 0;
        logMistake(state, { functionId: 'founder_sustainability', id: 'persistence_as_inaction', label: 'Missed kill criterion, no decision', cost: { usd: Math.round(burned), days: 30 }, delayed: true, app: 'you', key: `inaction:${c.id}:${late}`,
          detail: `${late} days past "${CRITERION_METRICS[c.metric]} ${c.threshold}" with no pivot, stop or persist decision recorded. Burn over the last month: ${money(burned)}.` });
      }
    }
  }
}

// A failed customer-discovery hypothesis is a kill/pivot trigger of its own (research/hypotheses.js killSignal). Left
// with no pivot, kill or change for 60+ days it is persistence as inaction, charged every 30 days after that.
export const HYP_INACTION_DAYS = 60;
function checkHypothesisKill(state) {
  const P = ensurePlanner(state);
  const ks = killSignal(state);
  if (!ks || ks.status !== 'fail') { if (P.hypFail && !ks) P.hypFail = null; return; }
  if (P.hypFail?.id !== ks.hypothesisId) {
    P.hypFail = { id: ks.hypothesisId, day: state.day, summary: ks.summary };
    notify(state, `Your own test failed: ${ks.summary}. Your own criteria said: kill or pivot.`, { type: 'bad', app: 'you' });
    return;
  }
  const late = state.day - P.hypFail.day;
  const changed = (P.pivots ?? []).some((p) => p.day >= P.hypFail.day);
  if (changed) { P.hypFail.day = state.day; return; } // you acted on it: the clock restarts for whatever is next
  if (late >= HYP_INACTION_DAYS && late % 30 === 0) {
    logMistake(state, { functionId: 'founder_sustainability', id: 'persistence_as_inaction', label: 'Failed hypothesis, no pivot or change', cost: { days: 30, hours: 4 }, delayed: true, app: 'you', key: `inaction:hyp:${ks.hypothesisId}:${late}`,
      detail: `Your hypothesis "${ks.customer}" failed its own criteria ${late} days ago (${ks.summary}) and nothing changed: no kill, no pivot, no new test.` });
  }
}

// Pivots are detected by ONE core detector (core/pivots.js, shared with Settings). Settings registers a confirmed pivot
// itself; this daily pass catches edits that bypassed it, then mirrors the log into P.pivots for the scorecard.
// Pivot mistakes (pivot_without_evidence, pivot_every_90, thrash_pivoting) are logged by the detector.
function trackPivots(state) {
  const P = ensurePlanner(state);
  P.ideaText = `${state.company.oneLiner ?? ''} ${state.company.icp ?? ''}`.trim().toLowerCase();
  syncPivotSnapshot(state);
  P.pivots = substantivePivots(state).map((p) => ({ day: p.day, evidence: p.evidence ?? 0, type: p.type }));
}

/** Scorecard warnings (outcomes/engine.js signals): missed criteria with no decision, or none set at all. */
export function killCriteriaWarnings(state) {
  const P = state.apps.planner;
  const out = [];
  if (P?.hypFail && state.day - P.hypFail.day >= 30) out.push({ id: 'hypothesis_failed_no_action', label: 'Your hypothesis failed its own test', detail: `${P.hypFail.summary}. ${state.day - P.hypFail.day} days with no kill, pivot or new test.`, ends: 'Months building on a conclusion your own criteria rejected.' });
  for (const c of P?.criteria ?? []) {
    if (c.status !== 'missed') continue;
    out.push({ id: 'kill_criterion_missed', label: 'You missed your own kill criterion', detail: `"${CRITERION_METRICS[c.metric]} ${c.threshold} by ${fmtDate(state, c.byDay)}" was missed ${state.day - c.missedDay} days ago (actual ${Number.isFinite(c.value) ? c.value : '—'}). Your stated action: ${c.action}.`, ends: 'Months of burn on an unchanged plan (walking dead), then a forced decision with less cash.' });
  }
  if (state.day >= 90 && !(P?.criteria?.length)) out.push({ id: 'no_kill_criteria', label: 'No kill or pivot criteria', detail: 'Three months in with no written threshold for persisting, pivoting or stopping (You → Kill criteria).', ends: 'Either quitting after one bad month or continuing for years unchanged.' });
  return out;
}

// ---------------------------------------------------------------------------
// Daily sim
// ---------------------------------------------------------------------------
export function plannerDay(state) {
  const P = state.apps.planner;
  if (!P) { if (state.day >= 1) ensurePlanner(state).ideaText = `${state.company.oneLiner ?? ''} ${state.company.icp ?? ''}`.trim().toLowerCase(); return; }
  ensurePlanner(state);
  if (dayOfWeek(state) === 1) {
    closeWeek(state, weekStartOf(state) - 7);
    // AI scheduler: carry the plan forward and place flexible focus blocks around the week's meetings.
    if (P.scheduler.plan) {
      const wk = currentWeek(state);
      if (wk) blockPriorities(state, { flexible: true });
    }
  }
  checkCriteria(state);
  checkHypothesisKill(state);
  trackPivots(state);
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------
export function planningSignals(state, weeks = 4) {
  const P = state.apps.planner;
  const ws = weekStartOf(state);
  const rows = Array.from({ length: weeks }, (_, i) => ws - 7 * (i + 1)).map((w) => ({ ws: w, plan: P?.weeks?.[w] ?? null, a: weekActuals(state, w) }));
  const played = rows.filter((r) => r.a.total >= 10);
  const planned = played.filter((r) => r.plan);
  const shares = played.map((r) => (r.plan ? r.a.share ?? 0 : 0));
  // Unplanned weeks: reactive work still lands partly on what matters ([design] 0.7 of non-inbox/meeting hours).
  const effShares = played.map((r) => (r.plan ? r.a.share ?? 0 : r.a.total ? (0.7 * (r.a.total - (r.a.by.comms ?? 0) - (r.a.by.other ?? 0))) / r.a.total : 0));
  const focus = focusHoursByWeek(state, weeks);
  const tied = planned.flatMap((r) => r.plan.priorities).filter((p) => p.krId).length;
  const pris = planned.flatMap((r) => r.plan.priorities).length;
  return {
    weeks: played.length, plannedWeeks: planned.length, avgShare: shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null,
    effShare: effShares.length ? effShares.reduce((a, b) => a + b, 0) / effShares.length : null,
    reviews: planned.filter((r) => r.plan.review).length, tooMany: planned.filter((r) => r.plan.priorities.length > 3).length,
    tiedShare: pris ? tied / pris : 0, focusPerWeek: focus.length ? focus.reduce((a, b) => a + b, 0) / focus.length : 0,
    fragmentedPerWeek: played.length ? played.reduce((a, r) => a + r.a.fragmented, 0) / played.length : 0,
    meetingsPerWeek: played.length ? played.reduce((a, r) => a + r.a.meetings, 0) / played.length : 0,
    okrs: P?.okrs?.length ?? 0,
  };
}
export function sustainabilitySignals(state) {
  const P = state.apps.planner;
  const crit = P?.criteria ?? [];
  const hist = state.founder.wellbeing?.history ?? [];
  const lastQ = hist.filter((h) => h.day > state.day - 91);
  const missed = crit.filter((c) => c.status === 'missed');
  const decided = crit.filter((c) => c.status === 'decided' && c.missedDay != null);
  return {
    criteria: crit.length, beforeBet: crit.some((c) => c.beforeBet), missedOpen: missed.length,
    daysPast: missed.length ? Math.max(...missed.map((c) => state.day - c.missedDay)) : decided.length ? Math.max(...decided.map((c) => c.decisionDay - c.missedDay)) : null,
    weeksOver60: lastQ.filter((h) => h.hours > 60).length, pivots: P?.pivots?.length ?? 0,
    fastPivots: (P?.pivots ?? []).filter((p, i, arr) => i > 0 && p.day - arr[i - 1].day < 90 && p.evidence < 20).length,
    dayOff: !!state.founder.wellbeing?.dayOff && !(state.founder.dayOffWorked > state.day - 14), // worked through it lately: not a day off
    crunchDays: lastQ.reduce((a, h) => a + (h.crunchDays ?? 0), 0),
  };
}
