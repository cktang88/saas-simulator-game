// Founder AI assistant engine: plan and usage, connectors (scopes, silent auth expiry), projects, chat answers with
// source chips, scheduled tasks and runs, failure injection (truncation, hallucinated numbers, stale auth, prompt
// injection, wrong actions), approvals, verification, delayed consequences, and the read model for coaching.
//
// The numbers are computed deterministically from game state (so they are right unless the failure model says
// otherwise); the LLM only writes the prose around them (job 'assistant:prose' / chat), with an offline template.
//
// Hooks for other apps and the Automations app (stable, side-effect free unless noted):
//   claimAssistant(state, key, hours)      → hours to charge for work a fresh, approved assistant output covers
//                                            (key 'metrics_digest' | 'investor_update' | 'meeting_prep'); records the saving
//   runTaskAction(state, taskId, {dryRun}) → { ok, error?, hoursCost, usdCost, runId? } (Automations action "run assistant task")
//   assistantEvents(state, sinceDay)       → [{ id, type: 'run_finished'|'run_failed', day, runId, taskId, status }]

import { ensure, notify, log } from '../../core/state.js';
import { uid, rng, chance, round2, money, dayOfWeek, isWeekend, isLastDayOfMonth, fmtDate, clamp } from '../../core/util.js';
import { post, addRecurring, totalCash } from '../../core/bank.js';
import { mrr, activeSubs, trialingSubs, ensureStripe, cancel } from '../../core/stripe.js';
import { setModifier, mainPlan } from '../../core/market.js';
import { ensureMail, newThread, addMessage, replyDay } from '../../core/mail.js';
import { ensureCalendar } from '../../core/calendar.js';
import { enqueue, hasJob } from '../../core/jobs.js';
import { logMistake } from '../../core/operator.js';
import { pipelineSummary } from '../sales/crm-api.js';
import { PLANS, EXTRA_USAGE_USD_PER_UNIT, UNITS, CONNECTORS, SCOPE_RANK, AUTH_DAYS, FAIL, HOURS, FACTS, TEMPLATES, UNSUPPORTED_CLAIMS, gradeInstructions, templateForText, factsForQuestion } from './model.js';

const ID = 'assistant';
const MAX_RUNS = 300;
const MAX_CHAT = 120;

export function ensureAssistant(state) {
  const a = ensure(state, ID, () => ({}));
  a.plan ??= null;
  a.recurringId ??= null;
  a.extraUsage ??= false;
  a.connectors ??= {};
  a.projects ??= [];
  a.tasks ??= [];
  a.runs ??= [];
  a.chat ??= [];
  a.usage ??= { weekStart: null, units: 0, extraUnits: 0, extraUnitsMonth: 0, blocked: 0 };
  a.stats ??= { savedHours: 0, reviewHours: 0, verifyClicks: 0, setupHours: 0, chats: 0 };
  a.pending ??= []; // delayed consequences: { id, dueDay, kind, ... }
  a.incidents ??= []; // { id, day, kind, text }
  a.events ??= []; // automation triggers
  a.expiring ??= []; // { key, kind, untilDay } market modifiers to remove later
  a.claims ??= {};
  return a;
}

// ---------------------------------------------------------------------------
// Founder hours charged by the daily sim (capped at what is left this week, like other apps)
// ---------------------------------------------------------------------------
export function chargeFounder(state, hours, label) {
  const f = state.founder;
  const h = round2(Math.min(hours, Math.max(0, f.hoursPerWeek - f.hoursUsed)));
  if (h <= 0) return 0;
  f.hoursUsed += h;
  f.timeLog ??= [];
  f.timeLog.push({ day: state.day, hours: h, label });
  return h;
}

// ---------------------------------------------------------------------------
// Plan, usage and billing
// ---------------------------------------------------------------------------
export const planOf = (state) => PLANS[ensureAssistant(state).plan] ?? null;

export function choosePlan(state, planId) {
  const A = ensureAssistant(state);
  const p = PLANS[planId];
  if (planId && !p) throw new Error('Unknown plan');
  if (A.recurringId) { const r = state.recurring.find((x) => x.id === A.recurringId); if (r) r.active = false; A.recurringId = null; }
  A.plan = planId || null;
  if (!p) return null;
  post(state, { amount: -p.price, counterparty: p.vendor, description: `${p.name} subscription`, category: 'software', method: 'card' });
  const dom = Math.min(28, new Date(Date.parse(state.startDate + 'T12:00:00Z') + state.day * 86400000).getUTCDate());
  A.recurringId = addRecurring(state, { vendor: p.vendor, amount: p.price, category: 'software', dayOfMonth: dom, note: `${p.name} (AI assistant)` }).id;
  A.planSince = state.day;
  return p;
}

function weekStart(state) { return state.day - ((dayOfWeek(state) + 6) % 7); }
function syncWeek(state) {
  const A = ensureAssistant(state);
  const ws = weekStart(state);
  if (A.usage.weekStart !== ws) { A.usage.weekStart = ws; A.usage.units = 0; A.usage.blocked = 0; }
  return A.usage;
}
export function usagePct(state) {
  const p = planOf(state);
  if (!p) return 0;
  return Math.min(1, syncWeek(state).units / p.weeklyUnits);
}
/** Consume usage. Returns false (and counts a block) when the allowance is gone and extra usage is off. */
export function consumeUnits(state, units) {
  const A = ensureAssistant(state);
  const p = planOf(state);
  if (!p) return false;
  const u = syncWeek(state);
  if (u.units + units > p.weeklyUnits) {
    if (!A.extraUsage) { u.blocked++; return false; }
    const over = Math.min(units, u.units + units - p.weeklyUnits);
    u.extraUnits += over;
    u.extraUnitsMonth += over;
  }
  u.units += units;
  return true;
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------
export function grantConnector(state, id, scope = 'read') {
  const c = CONNECTORS[id];
  if (!c) throw new Error('Unknown connector');
  if (!c.scopes.includes(scope)) throw new Error(`${c.label} does not offer ${scope} access`);
  const A = ensureAssistant(state);
  const days = AUTH_DAYS[0] + Math.floor(rng(state) * (AUTH_DAYS[1] - AUTH_DAYS[0] + 1));
  A.connectors[id] = { on: true, scope, authDay: state.day, expiresDay: state.day + days };
  return A.connectors[id];
}
export function setScope(state, id, scope) {
  const g = ensureAssistant(state).connectors[id];
  if (!g) return grantConnector(state, id, scope);
  if (!CONNECTORS[id].scopes.includes(scope)) throw new Error(`${CONNECTORS[id].label} does not offer ${scope} access`);
  g.scope = scope;
  return g;
}
export function revokeConnector(state, id) {
  const g = ensureAssistant(state).connectors[id];
  if (g) g.on = false;
}
export const reconnect = (state, id) => grantConnector(state, id, ensureAssistant(state).connectors[id]?.scope ?? 'read');
export function connectorStatus(state, id) {
  const g = ensureAssistant(state).connectors[id];
  if (!g || !g.on) return 'off';
  return state.day >= g.expiresDay ? 'expired' : 'ok';
}
const scopeOf = (state, id) => (connectorStatus(state, id) === 'ok' ? ensureAssistant(state).connectors[id].scope : null);
const canDo = (state, id, scope) => { const s = scopeOf(state, id); return s != null && SCOPE_RANK[s] >= SCOPE_RANK[scope]; };

// ---------------------------------------------------------------------------
// Projects and tasks
// ---------------------------------------------------------------------------
export function createProject(state, { name, instructions = '' }) {
  const A = ensureAssistant(state);
  const p = { id: uid('prj'), name: String(name || 'Project').slice(0, 80), instructions: String(instructions).slice(0, 4000), attached: [], createdDay: state.day };
  A.projects.push(p);
  return p;
}
export function updateProject(state, id, patch) {
  const p = ensureAssistant(state).projects.find((x) => x.id === id);
  if (!p) throw new Error('Project not found');
  if (patch.instructions != null) p.instructions = String(patch.instructions).slice(0, 4000);
  if (patch.name) p.name = String(patch.name).slice(0, 80);
  return p;
}
const projectGrade = (state, projectId) => gradeInstructions(ensureAssistant(state).projects.find((p) => p.id === projectId)?.instructions ?? '');

export function createTask(state, { name, templateId, text = '', projectId = null, mode = 'ask', schedule = 'weekly' }) {
  const A = ensureAssistant(state);
  const tpl = TEMPLATES[templateId] ? templateId : templateForText(text);
  const t = { id: uid('tsk'), name: String(name || TEMPLATES[tpl].label).slice(0, 80), templateId: tpl, text: String(text).slice(0, 1000), projectId, mode, schedule, on: schedule !== 'once', createdDay: state.day, lastRunDay: null, modeSince: state.day };
  A.tasks.push(t);
  return t;
}
export function updateTask(state, id, patch) {
  const t = ensureAssistant(state).tasks.find((x) => x.id === id);
  if (!t) throw new Error('Task not found');
  if (patch.mode && patch.mode !== t.mode) { t.mode = patch.mode; t.modeSince = state.day; }
  if (patch.schedule) t.schedule = patch.schedule;
  if (patch.on != null) t.on = !!patch.on;
  if (patch.projectId !== undefined) t.projectId = patch.projectId;
  return t;
}

// ---------------------------------------------------------------------------
// Facts: what the source apps really say, and what the assistant claims
// ---------------------------------------------------------------------------
function burnInfo(state) {
  const d = state.metrics?.daily ?? [];
  const cash = totalCash(state);
  if (d.length < 2) return { cash, burn: null, runway: null };
  const back = d[Math.max(0, d.length - 31)];
  const days = d.at(-1).day - back.day;
  if (!days) return { cash, burn: null, runway: null };
  const inflow = state.bank.txns.filter((t) => t.day > back.day && ['investment', 'owner_contribution', 'loan'].includes(t.category)).reduce((a, t) => a + t.amount, 0);
  const net = ((d.at(-1).cash - back.cash - inflow) / days) * 30;
  const burn = -net;
  return { cash, burn, runway: burn > 0 ? cash / burn : null };
}

/** True value of a fact from the source app: { value, rows }. value null = no data. */
export function truthOf(state, id) {
  const st = ensureStripe(state);
  switch (id) {
    case 'mrr': return { value: mrr(state), rows: activeSubs(state).length };
    case 'active_customers': { const n = activeSubs(state).length; return { value: n, rows: n }; }
    case 'new_customers_7d': return { value: st.events.filter((e) => e.type === 'new' && e.day > state.day - 7).length, rows: 0 };
    case 'churned_30d': return { value: st.events.filter((e) => e.type === 'churn' && e.day > state.day - 30).length, rows: 0 };
    case 'trials': { const n = trialingSubs(state).length; return { value: n, rows: n }; }
    case 'mrr_change_7d': {
      const d = state.metrics?.daily ?? [];
      const prev = d.find((x) => x.day >= state.day - 7)?.mrr;
      const cur = mrr(state);
      return { value: prev ? (cur - prev) / prev : null, rows: 0 };
    }
    case 'cash': return { value: totalCash(state), rows: 0 };
    case 'burn_30d': return { value: burnInfo(state).burn, rows: 0 };
    case 'runway': return { value: burnInfo(state).runway, rows: 0 };
    case 'uncategorized': { const n = state.bank.txns.filter((t) => (t.category ?? 'uncategorized') === 'uncategorized').length; return { value: n, rows: n }; }
    case 'open_deals': { const p = pipelineSummary(state); return { value: p.open, rows: p.open }; }
    case 'pipeline_value': { const p = pipelineSummary(state); return { value: p.openValue, rows: p.open }; }
    case 'open_tickets': { const t = (state.apps.support?.tickets ?? []).filter((x) => x.status === 'open' || x.status === 'pending'); return { value: t.length, rows: t.length }; }
    case 'oldest_ticket': { const t = (state.apps.support?.tickets ?? []).filter((x) => x.status === 'open' || x.status === 'pending'); return { value: t.length ? Math.max(...t.map((x) => state.day - (x.createdDay ?? state.day))) : 0, rows: 0 }; }
    case 'meetings_week':
    case 'focus_week': {
      const ws = weekStart(state);
      const evs = ensureCalendar(state).events.filter((e) => e.day >= ws && e.day < ws + 7 && e.status !== 'canceled');
      const pick = id === 'focus_week' ? evs.filter((e) => e.kind === 'focus') : evs.filter((e) => !['focus', 'personal', 'deadline'].includes(e.kind));
      return { value: round2(pick.reduce((a, e) => a + e.duration / 60, 0)), rows: 0 };
    }
    case 'unread_mail': { const n = ensureMail(state).threads.filter((t) => t.unread && !t.archived).length; return { value: n, rows: ensureMail(state).threads.length }; }
    case 'customer_threads': { const n = awaitingCustomer(state).length; return { value: n, rows: ensureMail(state).threads.length }; }
    case 'rival_price': {
      const r = (state.apps.world?.rivals ?? []).filter((c) => c.status === 'active').sort((a, b) => (b.raisedUsd ?? 0) - (a.raisedUsd ?? 0))[0];
      return { value: r?.priceMonthly ?? null, rows: 0, note: r ? r.name : null };
    }
    default: return { value: null, rows: 0 };
  }
}

const awaitingCustomer = (state) => ensureMail(state).threads.filter((t) => !t.archived && ['customer', 'prospect'].includes(t.kind) && t.messages.at(-1)?.from === 'them');

export function fmtFact(kind, v) {
  if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return kind === 'months' ? 'not burning cash' : 'n/a';
  switch (kind) {
    case 'money': return money(v);
    case 'count': return String(Math.round(v));
    case 'months': return `${v.toFixed(1)} months`;
    case 'pct': return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
    case 'hours': return `${(+v).toFixed(1)}h`;
    case 'days': return `${Math.round(v)} days`;
    default: return String(v);
  }
}

function perturb(state, v, kind, big = false) {
  const sign = chance(state, 0.5) ? 1 : -1;
  const mag = (big ? 0.2 : 0.12) + rng(state) * (big ? 0.45 : 0.28);
  if (v == null) return kind === 'pct' ? sign * (0.04 + rng(state) * 0.12) : kind === 'count' ? 1 + Math.floor(rng(state) * 12) : kind === 'months' ? 6 + rng(state) * 12 : 1000 + Math.round(rng(state) * 9000);
  if (kind === 'pct') return v + sign * (0.04 + rng(state) * 0.12);
  if (kind === 'count') { const d = Math.max(1, Math.round(Math.abs(v) * mag)); return Math.max(0, Math.round(v) + sign * d) === Math.round(v) ? Math.round(v) + d : Math.max(0, Math.round(v) + sign * d); }
  if (kind === 'money') return Math.round((v * (1 + sign * mag)) / 10) * 10 || 10 * sign;
  return Math.max(0, v * (1 + sign * mag));
}

/** One fact as the assistant reports it. grade: project instruction grade (halves error rates when good). */
export function claimFact(state, id, { grade = null } = {}) {
  const def = FACTS[id];
  const truth = truthOf(state, id);
  const conn = CONNECTORS[def.connector];
  const status0 = connectorStatus(state, def.connector);
  const good = grade?.good;
  const f = { id, label: truth.note ? `${def.label} (${truth.note})` : def.label, kind: def.kind, route: def.route, connector: def.connector, truth: truth.value, claimed: truth.value, status: 'ok', rowsTotal: truth.rows, rowsRead: truth.rows, verified: false, corrected: false };
  if (status0 !== 'ok') {
    // No live source: either say so, or (sometimes) state a number anyway.
    if (chance(state, good ? FAIL.unsourcedGoodInstr : FAIL.unsourced)) { f.claimed = perturb(state, truth.value, def.kind, true); f.status = 'unsourced'; }
    else { f.status = 'unavailable'; f.claimed = null; f.reason = status0 === 'expired' ? `${conn.label} connector authorization expired` : `No ${conn.label} connector`; }
    f.rowsRead = 0;
    return f;
  }
  if (def.list && truth.rows > conn.pageSize && chance(state, FAIL.truncate)) {
    f.status = 'truncated';
    f.rowsRead = conn.pageSize;
    const share = conn.pageSize / truth.rows;
    f.claimed = def.kind === 'count' ? conn.pageSize : Math.round((truth.value * share) / 10) * 10;
    return f;
  }
  if (truth.value != null && chance(state, good ? FAIL.wrongSourcedGoodInstr : FAIL.wrongSourced)) { f.claimed = perturb(state, truth.value, def.kind); f.status = 'misread'; }
  return f;
}

export const factWrong = (f) => f.status !== 'unavailable' && !f.corrected && fmtFact(f.kind, f.claimed) !== fmtFact(f.kind, f.truth);

// ---------------------------------------------------------------------------
// Chat: questions about the business
// ---------------------------------------------------------------------------
/** Synchronous part of a chat answer: which facts, what the assistant claims, usage. */
export function answerQuestion(state, question, { projectId = null } = {}) {
  const A = ensureAssistant(state);
  if (!planOf(state)) throw new Error('Pick an assistant plan first (Plan tab).');
  const ids = factsForQuestion(question);
  const conns = new Set(ids.map((id) => FACTS[id].connector));
  const units = UNITS.chat + UNITS.chatPerConnector * conns.size + (conns.has('web') ? UNITS.web : 0);
  if (!consumeUnits(state, units)) throw new Error('You have used this week\'s assistant allowance. It resets Monday, or turn on extra usage in the Plan tab.');
  const grade = projectId ? projectGrade(state, projectId) : null;
  const facts = ids.map((id) => claimFact(state, id, { grade }));
  const notes = facts.filter((f) => f.status === 'unavailable').map((f) => f.reason);
  const msg = { id: uid('chat'), day: state.day, projectId, question: String(question).slice(0, 1000), facts, notes, text: null, mock: true, used: false };
  A.chat.push(msg);
  if (A.chat.length > MAX_CHAT) A.chat.splice(0, A.chat.length - MAX_CHAT);
  A.stats.chats++;
  return msg;
}

export function proseFallback(state, facts, { question = '', template = null } = {}) {
  const parts = facts.map((f, i) => (f.status === 'unavailable' ? `I couldn't read ${CONNECTORS[f.connector].label} (${f.reason}), so I can't give ${f.label.toLowerCase()}.` : `${f.label}: ${fmtFact(f.kind, f.claimed)} [${i + 1}].`));
  const head = template ? `${TEMPLATES[template].label}, ${fmtDate(state)}.` : question ? 'Here is what I found.' : '';
  return `${head} ${parts.join(' ')}`.trim();
}

export function prosePrompt(state, facts, { question = '', template = null, instructions = '' } = {}) {
  const lines = facts.map((f, i) => `[${i + 1}] ${f.label}: ${f.status === 'unavailable' ? `UNAVAILABLE (${f.reason})` : fmtFact(f.kind, f.claimed)}`).join('\n');
  return {
    system: `You are the founder's AI assistant (like Claude or ChatGPT with connectors) for ${state.company.name} (${state.company.oneLiner || 'a SaaS'}). Write for a busy founder: plain, specific, under 140 words. Use ONLY the numbered facts below and cite each number with its tag like [1]. If a fact is UNAVAILABLE, say you could not access it. Do not add numbers that are not in the facts.${instructions ? `\nProject instructions from the founder: ${instructions.slice(0, 1500)}` : ''}`,
    prompt: `${template ? `Task: ${TEMPLATES[template].label}. ${TEMPLATES[template].prompt}` : `Question: ${question}`}\n\nFacts:\n${lines}`,
  };
}

export const PROSE_SCHEMA = { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } };

/** Mark a chat answer as used for a decision (counts it like an approved report). */
export function useChatAnswer(state, chatId) {
  const A = ensureAssistant(state);
  const m = A.chat.find((x) => x.id === chatId);
  if (!m || m.used) return m;
  m.used = true;
  m.usedDay = state.day;
  scheduleWrongNumberCosts(state, { source: 'chat', id: m.id, facts: m.facts, template: null });
  return m;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------
function injectedThreads(state) {
  return ensureMail(state).threads.filter((t) => !t.archived && t.lastDay >= state.day - 14 && t.messages.some((m) => m.meta?.injection));
}

function buildActions(state, task, tpl, run) {
  const out = [];
  const add = (a) => out.push({ id: uid('act'), status: 'proposed', ...a });
  if (tpl.actions === 'reply_drafts') {
    for (const t of awaitingCustomer(state).slice(0, 3)) {
      const bad = chance(state, FAIL.draftUnsupported) ? UNSUPPORTED_CLAIMS[Math.floor(rng(state) * UNSUPPORTED_CLAIMS.length)] : null;
      const text = `Hi ${String(t.with?.name ?? '').split(' ')[0] || 'there'}, thanks for the note about "${String(t.subject ?? '').slice(0, 60)}". ${bad ? `${bad} ` : ''}I'll follow up with specifics shortly.`;
      add({ type: 'reply', connector: 'mail', need: 'write', threadId: t.id, desc: `Reply to ${t.with?.name ?? 'customer'}: "${text}"`, text, badClaim: bad });
    }
  } else if (tpl.actions === 'recategorize') {
    const n = Math.min(10, state.bank.txns.filter((t) => (t.category ?? 'uncategorized') === 'uncategorized').length);
    if (n) {
      let wrong = 0;
      for (let i = 0; i < n; i++) if (chance(state, FAIL.wrongAction * 1.6)) wrong++;
      add({ type: 'recategorize', connector: 'books', need: 'write', n, wrong, flagged: Math.round(wrong * 0.6), desc: `Recategorize ${n} transactions (${Math.round(wrong * 0.6)} marked "unsure")` });
    }
  } else if (tpl.actions === 'agenda') {
    const ws = weekStart(state);
    const ev = ensureCalendar(state).events.find((e) => e.day >= state.day && e.day < ws + 7 && e.status === 'scheduled' && e.with?.name && !['focus', 'personal', 'deadline'].includes(e.kind));
    if (ev) add({ type: 'agenda', connector: 'mail', need: 'write', eventId: ev.id, to: ev.with.name, wrongRecipient: chance(state, FAIL.wrongAction), desc: `Email an agenda to ${ev.with.name} for "${ev.title}"` });
  } else if (tpl.actions === 'investor_send') {
    add({ type: 'investor_send', connector: 'mail', need: 'write', desc: 'Send the update to your investor list' });
  }
  // Prompt injection: untrusted text the task read carries an instruction aimed at the agent.
  const readMail = canDo(state, 'mail', 'read') && (tpl.connectors.includes('mail') || tpl.optional.includes('mail'));
  const inj = (readMail && injectedThreads(state)[0]) || (canDo(state, 'web', 'read') && tpl.connectors.includes('web') && chance(state, FAIL.injectionWebPerRun) ? { web: true } : null);
  if (inj) {
    run.injection = inj.web ? 'a competitor page' : `an email from ${inj.with?.name ?? 'an unknown sender'}`;
    if (chance(state, FAIL.followInjection)) add({ type: 'forward_customers', connector: 'mail', need: 'write', malicious: true, desc: `Forward the customer list and open invoices to an outside "compliance" address (instruction found in ${run.injection})` });
  }
  return out;
}

/** Decide what happens to each proposed action under the task's approval mode and the connector scopes. */
function routeActions(state, task, run) {
  for (const a of run.actions) {
    if (!canDo(state, a.connector, 'draft') && !canDo(state, a.connector, a.need)) { a.status = 'dropped'; a.note = 'no access'; continue; }
    if (task.mode === 'draft' || !canDo(state, a.connector, a.need)) { a.status = 'drafted'; if (a.type === 'reply') attachDraft(state, a); continue; }
    if (task.mode === 'ask') { a.status = 'pending'; continue; }
    executeAction(state, run, a, { auto: true });
  }
}

function attachDraft(state, a) {
  const t = ensureMail(state).threads.find((x) => x.id === a.threadId);
  if (t) t.aiDraft = { text: a.text, badClaim: a.badClaim ?? null, by: 'assistant', day: state.day };
}

function incident(state, kind, text) {
  const A = ensureAssistant(state);
  const x = { id: uid('ainc'), day: state.day, kind, text };
  A.incidents.unshift(x);
  if (A.incidents.length > 200) A.incidents.length = 200;
  return x;
}

/** Execute one action (auto mode, or after the player approves). */
export function executeAction(state, run, a, { auto = false } = {}) {
  const A = ensureAssistant(state);
  a.status = 'executed';
  a.executedDay = state.day;
  a.auto = auto;
  const plan = mainPlan(state);
  switch (a.type) {
    case 'reply': {
      const t = ensureMail(state).threads.find((x) => x.id === a.threadId);
      if (t) {
        addMessage(state, t.id, { from: 'me', body: a.text, meta: { ai: true } });
        delete t.aiDraft;
        // The customer answers in their own time, like any reply the founder sends from Mail.
        if (hasJob(`reply:${t.kind}`)) enqueue(state, `reply:${t.kind}`, { threadId: t.id, refId: t.refId }, { label: `Reply from ${t.with?.name ?? ''}`, notBefore: replyDay(state, t.kind) });
      }
      if (a.badClaim) {
        const usd = Math.round(plan?.price ?? 49);
        post(state, { amount: -usd, counterparty: t?.with?.name ?? 'Customer', description: 'Credit honouring an AI-drafted commitment', category: 'other', method: 'ach' });
        chargeFounder(state, 0.5, 'Walking back an AI-sent commitment');
        incident(state, 'unsupported_claim', `An AI reply to ${t?.with?.name ?? 'a customer'} promised: "${a.badClaim}"`);
        logMistake(state, { functionId: 'automation_ai', id: 'unreviewed_ai_output', label: 'AI reply sent with a commitment nobody agreed', cost: { hours: 0.5, usd, reputation: 0.5 }, detail: `"${a.badClaim}" went to ${t?.with?.name ?? 'a customer'}${auto ? ' with no human review' : ' after you approved it without reading closely'}. You honoured it with a credit.`, app: 'assistant' });
        notify(state, `Your assistant's reply to ${t?.with?.name ?? 'a customer'} promised "${a.badClaim}". You gave a ${money(usd)} credit to honour it.`, { type: 'bad', app: 'assistant' });
      }
      break;
    }
    case 'recategorize': {
      if (a.wrong > 0) A.pending.push({ id: uid('pend'), dueDay: state.day + 10 + Math.floor(rng(state) * 15), kind: 'wrong_categories', n: a.wrong, runId: run.id });
      break;
    }
    case 'agenda': {
      const ev = ensureCalendar(state).events.find((e) => e.id === a.eventId);
      const to = a.wrongRecipient ? 'a different contact with the same first name' : a.to;
      const th = newThread(state, { subject: `Agenda: ${ev?.title ?? 'our meeting'}`, with: { name: to }, kind: 'system', app: 'assistant' });
      addMessage(state, th.id, { from: 'me', body: `Agenda for ${ev?.title ?? 'our meeting'} (drafted by your assistant).`, meta: { ai: true } });
      if (a.wrongRecipient) {
        chargeFounder(state, 0.25, 'Apologising for a misdirected email');
        incident(state, 'wrong_recipient', `An agenda for "${ev?.title}" went to the wrong person.`);
        logMistake(state, { functionId: 'automation_ai', id: 'wrong_recipient', label: 'Assistant emailed the wrong person', cost: { hours: 0.25, reputation: 0.5 }, detail: `The agenda for "${ev?.title ?? 'a meeting'}" (with deal notes) went to the wrong contact${auto ? ' in auto mode' : ''}.`, app: 'assistant' });
        notify(state, `Your assistant sent the agenda for "${ev?.title}" (with your deal notes) to the wrong contact.`, { type: 'bad', app: 'assistant' });
      }
      break;
    }
    case 'investor_send': {
      const th = newThread(state, { subject: `${state.company.name} investor update, ${fmtDate(state)}`, with: { name: 'Investors' }, kind: 'investor', app: 'assistant' });
      addMessage(state, th.id, { from: 'me', body: run.prose ?? proseFallback(state, run.facts, { template: run.templateId }), meta: { ai: true } });
      run.sentToInvestors = true;
      if (auto && !run.reviewed) {
        const fr = state.apps.fundraising;
        if (fr && typeof fr.reputation === 'number') fr.reputation -= 0.5;
        logMistake(state, { functionId: 'automation_ai', id: 'replace_human_loop', label: 'Investor update sent by the assistant unread', cost: { reputation: 1 }, detail: 'Two investors replied asking if everything was OK: the update read like a template. Write the update yourself and automate the data pull.', delayed: true, app: 'assistant' });
      }
      scheduleWrongNumberCosts(state, { source: 'run', id: run.id, facts: run.facts, template: 'investor_update', investors: true });
      break;
    }
    case 'forward_customers': {
      chargeFounder(state, 3, 'Data incident response');
      const subs = activeSubs(state);
      let lost = 0;
      if (subs.length && chance(state, 0.5)) { const s = subs[Math.floor(rng(state) * subs.length)]; cancel(state, s.id, { atPeriodEnd: true, reason: 'customer_request' }); lost = 1; }
      setModifier(state, 'churn', 'assistant-data-leak', 1.1);
      A.expiring.push({ kind: 'churn', key: 'assistant-data-leak', untilDay: state.day + 60 });
      incident(state, 'prompt_injection', `Followed an instruction hidden in ${run.injection}: customer list sent outside the company.`);
      logMistake(state, { functionId: 'automation_ai', id: 'prompt_injection', label: 'Prompt injection: customer list sent to an outsider', cost: { hours: 3, customers: lost, reputation: 1 }, detail: `A task that read ${run.injection} could ${auto ? 'send email without asking' : 'send email and you approved the step'}. Keep tasks that read untrusted text read-only or ask-first.`, app: 'assistant' });
      notify(state, `Data incident: your assistant followed an instruction hidden in ${run.injection} and emailed your customer list to an outside address. Incident response took 3h${lost ? '; one customer cancelled' : ''}.`, { type: 'bad', app: 'assistant' });
      break;
    }
    default:
  }
  return a;
}

export function approveAction(state, runId, actionId) {
  const run = ensureAssistant(state).runs.find((r) => r.id === runId);
  const a = run?.actions.find((x) => x.id === actionId);
  if (!a || a.status !== 'pending') throw new Error('Nothing to approve');
  return executeAction(state, run, a, { auto: false });
}
export function rejectAction(state, runId, actionId) {
  const run = ensureAssistant(state).runs.find((r) => r.id === runId);
  const a = run?.actions.find((x) => x.id === actionId);
  if (!a || a.status !== 'pending') throw new Error('Nothing to reject');
  a.status = 'rejected';
  a.rejectedDay = state.day;
  if (a.malicious) run.injectionCaught = true;
  return a;
}
/** Review the "unsure" rows of a recategorize batch before approving: the flagged wrong ones get fixed. */
export function reviewUnsure(state, runId, actionId) {
  const run = ensureAssistant(state).runs.find((r) => r.id === runId);
  const a = run?.actions.find((x) => x.id === actionId);
  if (!a || a.type !== 'recategorize' || a.reviewedUnsure) return a;
  a.wrong = Math.max(0, a.wrong - a.flagged);
  a.reviewedUnsure = true;
  return a;
}

/** Run a task now. Synchronous and deterministic; prose follows via the 'assistant:prose' job. */
export function runTask(state, task, { manual = false } = {}) {
  const A = ensureAssistant(state);
  const tpl = TEMPLATES[task.templateId];
  const run = { id: uid('run'), taskId: task.id, templateId: task.templateId, name: task.name, day: state.day, manual, mode: task.mode, status: 'ok', facts: [], actions: [], notes: [], prose: null, mock: true, reviewed: false, seen: false, used: false };
  task.lastRunDay = state.day;
  const conns = [...new Set([...tpl.connectors, ...tpl.optional.filter((c) => connectorStatus(state, c) !== 'off')])];
  const units = UNITS.run + UNITS.runPerConnector * conns.length + (conns.includes('web') ? UNITS.web : 0);
  if (!planOf(state)) run.status = 'no_plan';
  else if (tpl.connectors.some((c) => connectorStatus(state, c) === 'expired')) run.status = 'auth_expired'; // fails silently: only the run log shows it
  else if (!consumeUnits(state, units)) run.status = 'over_budget';
  if (run.status === 'ok') {
    const grade = task.projectId ? projectGrade(state, task.projectId) : null;
    run.facts = tpl.facts.map((id) => claimFact(state, id, { grade }));
    run.notes = run.facts.filter((f) => f.status === 'unavailable').map((f) => f.reason);
    run.actions = buildActions(state, task, tpl, run);
    routeActions(state, task, run);
    if (task.mode === 'auto') { run.used = true; run.usedDay = state.day; run.autoUsed = true; scheduleWrongNumberCosts(state, { source: 'run', id: run.id, facts: run.facts, template: run.templateId }); }
    enqueue(state, 'assistant:prose', { runId: run.id }, { label: `Assistant: ${task.name}` });
  }
  A.runs.unshift(run);
  if (A.runs.length > MAX_RUNS) A.runs.length = MAX_RUNS;
  A.events.push({ id: `asst:${run.id}`, type: run.status === 'ok' ? 'run_finished' : 'run_failed', day: state.day, runId: run.id, taskId: task.id, status: run.status });
  if (A.events.length > 300) A.events.splice(0, 100);
  if (manual && run.status !== 'ok') notify(state, `Assistant task "${task.name}" did not run: ${statusText(run.status)}.`, { type: 'warn', app: 'assistant' });
  return run;
}

export const statusText = (st) => ({ ok: 'finished', auth_expired: 'a connector\'s authorization expired', over_budget: 'over this week\'s usage allowance', no_plan: 'no assistant plan', failed: 'failed' })[st] ?? st;

/** Open a run (costs review time once). */
export function reviewRun(state, runId) {
  const A = ensureAssistant(state);
  const run = A.runs.find((r) => r.id === runId);
  if (!run) throw new Error('Run not found');
  run.seen = true;
  if (run.status !== 'ok' || run.reviewed) return 0;
  run.reviewed = true;
  run.reviewedDay = state.day;
  A.stats.reviewHours = round2(A.stats.reviewHours + HOURS.review);
  return HOURS.review;
}
export const markSeen = (state, runId) => { const r = ensureAssistant(state).runs.find((x) => x.id === runId); if (r) r.seen = true; };

/** Click a source chip: compare the claim with the source app. */
export function verifyFact(state, holder, factIndex) {
  const A = ensureAssistant(state);
  const f = holder?.facts?.[factIndex];
  if (!f) throw new Error('Nothing to verify');
  if (!f.verified) { f.verified = true; A.stats.verifyClicks++; }
  // Re-read the source now (the source may have moved since the run); the claim is compared with the run-day truth.
  return { claimed: fmtFact(f.kind, f.claimed), truth: fmtFact(f.kind, f.truth), wrong: factWrong(f), status: f.status, rowsRead: f.rowsRead, rowsTotal: f.rowsTotal };
}
export function correctFact(state, holder, factIndex) {
  const f = holder?.facts?.[factIndex];
  if (!f || !f.verified) throw new Error('Check the source first');
  f.corrected = true;
  f.claimed = f.truth;
  return f;
}

/** Approve a run's output: it becomes the report you use. Wrong, uncorrected numbers cost later. */
export function approveRun(state, runId) {
  const A = ensureAssistant(state);
  const run = A.runs.find((r) => r.id === runId);
  if (!run || run.status !== 'ok') throw new Error('Nothing to approve');
  if (run.used) return run;
  run.used = true;
  run.usedDay = state.day;
  const tpl = TEMPLATES[run.templateId];
  const spent = HOURS.review + run.facts.filter((f) => f.verified).length * HOURS.verify;
  A.stats.savedHours = round2(A.stats.savedHours + Math.max(0, tpl.manualHours - spent));
  scheduleWrongNumberCosts(state, { source: 'run', id: run.id, facts: run.facts, template: run.templateId });
  return run;
}

function scheduleWrongNumberCosts(state, { source, id, facts, template, investors = false }) {
  const A = ensureAssistant(state);
  const wrong = facts.filter(factWrong);
  if (!wrong.length) return;
  if (A.pending.some((p) => p.kind === 'wrong_number' && p.ref === `${source}:${id}` && p.investors === investors)) return;
  A.pending.push({ id: uid('pend'), dueDay: state.day + 7 + Math.floor(rng(state) * 21), kind: 'wrong_number', ref: `${source}:${id}`, template, investors, facts: wrong.map((f) => ({ label: f.label, claimed: fmtFact(f.kind, f.claimed), truth: fmtFact(f.kind, f.truth), status: f.status })) });
}

function settlePending(state) {
  const A = ensureAssistant(state);
  const due = A.pending.filter((p) => p.dueDay <= state.day);
  if (!due.length) return;
  A.pending = A.pending.filter((p) => p.dueDay > state.day);
  for (const p of due) {
    if (p.kind === 'wrong_number') {
      const f = p.facts[0];
      const why = { truncated: 'the connector returned only the first page', unsourced: 'it had no source and guessed', misread: 'it misread the source' }[f.status] ?? 'it was wrong';
      const hours = p.investors ? 0.75 : p.template === 'investor_update' ? 1 : 1;
      const rep = p.investors ? 1 : 0;
      chargeFounder(state, hours, p.investors ? 'Correction email to investors' : 'Redoing a decision built on a wrong number');
      if (p.investors) { const fr = state.apps.fundraising; if (fr && typeof fr.reputation === 'number') fr.reputation -= 0.5; }
      logMistake(state, { functionId: 'automation_ai', id: 'wrong_number_used', label: p.investors ? 'Wrong number sent to investors' : 'Decision built on an unverified AI number', cost: { hours, reputation: rep }, delayed: true, detail: `${f.label}: the assistant said ${f.claimed}, the source said ${f.truth} (${why})${p.facts.length > 1 ? `, plus ${p.facts.length - 1} more` : ''}. Nobody clicked the source chip.`, app: 'assistant' });
      notify(state, `${p.investors ? 'An investor spotted a wrong number in your update' : 'A number you acted on was wrong'}: ${f.label} was ${f.truth}, not ${f.claimed} (${why}). Fixing it cost ${hours}h.`, { type: 'bad', app: 'assistant' });
    } else if (p.kind === 'wrong_categories') {
      const hours = round2(0.25 * p.n);
      chargeFounder(state, hours, 'Fixing miscategorized transactions at close');
      logMistake(state, { functionId: 'automation_ai', id: 'wrong_write', label: 'Assistant miscategorized transactions', cost: { hours }, delayed: true, detail: `${p.n} transactions the assistant recategorized in write mode were wrong and surfaced at month-end close.`, app: 'assistant' });
      notify(state, `${p.n} transactions your assistant recategorized were wrong; untangling them at close took ${hours}h.`, { type: 'warn', app: 'assistant' });
    }
  }
}

// ---------------------------------------------------------------------------
// Daily sim
// ---------------------------------------------------------------------------
export function assistantDay(state) {
  const A = state.apps[ID];
  if (!A) return;
  ensureAssistant(state);
  syncWeek(state);
  const dow = dayOfWeek(state);
  if (planOf(state)) {
    for (const t of A.tasks) {
      if (!t.on || t.schedule === 'once' || t.lastRunDay === state.day) continue;
      const due = t.schedule === 'weekly' ? dow === 1 : t.schedule === 'weekdays' ? !isWeekend(state) : false;
      if (due) runTask(state, t);
    }
    if (dow === 1) {
      const unseen = A.runs.filter((r) => !r.seen && r.day > state.day - 14);
      const failed = unseen.filter((r) => r.status !== 'ok').length;
      if (unseen.length) notify(state, `Assistant: ${unseen.length} run${unseen.length === 1 ? '' : 's'} you have not opened. Check the run list.`, { type: 'info', app: 'assistant' });
      A.lastNudge = { day: state.day, unseen: unseen.length, failed };
    }
  }
  settlePending(state);
  A.expiring = A.expiring.filter((x) => { if (x.untilDay <= state.day) { setModifier(state, x.kind, x.key, 1); return false; } return true; });
  if (isLastDayOfMonth(state) && A.usage.extraUnitsMonth > 0) {
    const usd = round2(A.usage.extraUnitsMonth * EXTRA_USAGE_USD_PER_UNIT);
    post(state, { amount: -usd, counterparty: planOf(state)?.vendor ?? 'AI assistant', description: 'AI assistant extra usage', category: 'software', method: 'card' });
    A.usage.extraUnitsMonth = 0;
    A.stats.extraUsd = round2((A.stats.extraUsd ?? 0) + usd);
  }
}

// ---------------------------------------------------------------------------
// Hooks for other apps / Automations
// ---------------------------------------------------------------------------
const CLAIM_TEMPLATE = { metrics_digest: 'weekly_metrics', investor_update: 'investor_update', meeting_prep: 'meeting_prep' };
export function claimAssistant(state, key, hours) {
  const A = state.apps[ID];
  const tpl = CLAIM_TEMPLATE[key];
  if (!A || !tpl || !(hours > 0)) return hours;
  const fresh = A.runs.find((r) => r.templateId === tpl && r.used && r.status === 'ok' && state.day - r.day <= 7);
  if (!fresh || A.claims[`${key}:${fresh.id}`] != null) return hours;
  A.claims[`${key}:${fresh.id}`] = state.day;
  const charge = round2(hours * 0.25);
  A.stats.savedHours = round2(A.stats.savedHours + hours - charge);
  return charge;
}
export function runTaskAction(state, taskId, { dryRun = false } = {}) {
  const t = ensureAssistant(state).tasks.find((x) => x.id === taskId);
  if (!t) return { ok: false, error: 'task not found', hoursCost: 0, usdCost: 0 };
  if (dryRun) return { ok: !!planOf(state), error: planOf(state) ? undefined : 'no plan', hoursCost: 0, usdCost: 0 };
  const r = runTask(state, t);
  return { ok: r.status === 'ok', error: r.status === 'ok' ? undefined : statusText(r.status), hoursCost: 0, usdCost: 0, runId: r.id };
}
export const assistantEvents = (state, sinceDay = state.day - 1) => (state.apps[ID]?.events ?? []).filter((e) => e.day >= sinceDay);

// ---------------------------------------------------------------------------
// Read model: signals and coaching
// ---------------------------------------------------------------------------
export function assistantSignals(state, days = 90) {
  const A = state.apps[ID];
  if (!A) return null;
  const since = state.day - days;
  const runs = A.runs.filter((r) => r.day > since && r.status === 'ok');
  const used = [...runs.filter((r) => r.used), ...A.chat.filter((m) => m.used && m.day > since)];
  const usedWrong = used.filter((x) => x.facts.some(factWrong)).length;
  const checkable = runs.filter((r) => r.reviewed || r.used);
  const facts = checkable.flatMap((r) => r.facts.filter((f) => f.status !== 'unavailable'));
  const verified = facts.filter((f) => f.verified).length;
  const incidents = A.incidents.filter((x) => x.day > since).length;
  const writeRisk = A.tasks.filter((t) => t.on && t.mode === 'auto' && (TEMPLATES[t.templateId].untrusted || TEMPLATES[t.templateId].connectors.some((c) => CONNECTORS[c].untrusted)) && canDo(state, 'mail', 'write')).length;
  const autoInvestor = A.tasks.some((t) => t.on && t.mode === 'auto' && t.templateId === 'investor_update' && canDo(state, 'mail', 'write'));
  const failedUnseen = A.runs.filter((r) => r.status !== 'ok' && !r.seen && state.day - r.day >= 7).length;
  const expired = Object.keys(A.connectors).filter((c) => connectorStatus(state, c) === 'expired');
  const goodProjects = A.projects.filter((p) => gradeInstructions(p.instructions).good).length;
  const activity = A.runs.filter((r) => r.day > state.day - 30).length + A.chat.filter((m) => m.day > state.day - 30).length;
  const paidUnused = !!A.plan && (state.day - (A.planSince ?? state.day)) > 30 && activity < 2;
  const firstWeeksAuto = A.tasks.filter((t) => t.mode === 'auto' && t.modeSince - t.createdDay < 14).length;
  return {
    runs: runs.length, used: used.length, usedWrong, wrongShare: used.length ? usedWrong / used.length : null,
    facts: facts.length, verified, verifyRate: facts.length ? verified / facts.length : null,
    incidents, writeRisk, autoInvestor, failedUnseen, expired, goodProjects, projects: A.projects.length,
    paidUnused, savedHours: A.stats.savedHours, reviewHours: A.stats.reviewHours, firstWeeksAuto, chats: A.chat.filter((m) => m.day > since).length,
  };
}

export function assistantCoaching(state) {
  const s = assistantSignals(state);
  if (!s) return [];
  const notes = [];
  if (s.expired.length) notes.push({ tone: 'bad', text: `${s.expired.map((c) => CONNECTORS[c].label).join(', ')} authorization expired. Scheduled runs that need it fail silently until you reconnect.` });
  if (s.failedUnseen) notes.push({ tone: 'bad', text: `${s.failedUnseen} failed run${s.failedUnseen === 1 ? '' : 's'} nobody opened. Check the run list weekly.` });
  if (s.writeRisk) notes.push({ tone: 'bad', text: 'A task that reads untrusted text (inbound email, web pages) can send email without asking. That is how prompt injection turns into an incident: make it read-only or ask-first.' });
  if (s.autoInvestor) notes.push({ tone: 'bad', text: 'Your investor update goes out without you reading it. Write the update yourself and automate the data pull.' });
  if (s.used >= 3 && (s.verifyRate ?? 0) < 0.1) notes.push({ tone: 'warn', text: `You used ${s.used} assistant outputs and checked ${s.verified} source${s.verified === 1 ? '' : 's'}. Click two numbers per run and compare them with the source app.` });
  if (s.usedWrong) notes.push({ tone: 'bad', text: `${s.usedWrong} of ${s.used} outputs you used contained a wrong number (truncated lists, guesses without a source, misreads).` });
  if (s.projects && !s.goodProjects) notes.push({ tone: 'warn', text: 'Your project instructions do not say who reads it, which metrics and thresholds matter, or to say "unknown" instead of guessing.' });
  if (s.paidUnused) notes.push({ tone: 'warn', text: 'You pay for an assistant plan and barely use it. Cancel or give it one recurring job.' });
  if (!notes.length && s.runs) notes.push({ tone: 'good', text: 'Healthy: drafts first, sources checked, writes on approval.' });
  return notes;
}
