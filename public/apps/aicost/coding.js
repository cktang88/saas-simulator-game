// AI coding spend per engineer: subscription seats (individual -> power -> team), pay-as-you-go API for agentic and
// background usage, usage-limit hits that slow work, and the incidents behind the bills (a runaway agent loop, a
// leaked shared API key). Engineers are read from People (read only); each active engineer consumes a seat.
//
// Distribution and prices: data/ai-costs.js (research: docs/research/ops-2026/llm-spend.md).

import { notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { monthKey, round2, dayOfMonth } from '../../core/util.js';
import { SEAT_PLANS, SEAT_ORDER, CODING_USAGE, CODING, PROVIDERS } from '../../data/ai-costs.js';
import { aiSlice, aiRng, zOf, pushEvent, aiMistake, usd0 } from './model.js';

// Overage off ('wait'): days a looped seat waits for its usage limit to reset, with / without a spend alert [design].
export const RUNAWAY_STALL_DAYS = [1, 5];

export const engineers = (state) => (state.apps.people?.members ?? []).filter((m) => m.role === 'engineer' && m.status === 'active' && m.kind !== 'ai_agent');

const POLICY_SEAT = { shadow: 'individual', individual: 'individual', plus: 'plus', power100: 'power100', power200: 'power200', team_std: 'team_std', team_prem: 'team_prem' };
export const seatOf = (state, m) => {
  const c = aiSlice(state).coding;
  return c.seats[m.id] ?? POLICY_SEAT[c.policy] ?? 'individual';
};

/** An engineer's monthly API-list-price-equivalent usage (heavy-tailed, stable per person, varies by month). */
export function usageEq(state, m, month = monthKey(state)) {
  const base = CODING_USAGE.median * Math.exp(CODING_USAGE.sigma * zOf(`eng|${m.id}`));
  return round2(base * Math.exp(CODING_USAGE.monthlyNoise * zOf(`engm|${m.id}|${month}`)));
}

/** What one engineer costs a month on a seat given the overage policy. */
export function seatCost(plan, usage, { overage = 'api', capUsd = null } = {}) {
  const p = SEAT_PLANS[plan];
  const over = Math.max(0, usage - p.allowEq);
  let api = 0, limitedShare = 0;
  if (overage === 'api') {
    api = capUsd == null ? over : Math.min(over, capUsd);
    if (capUsd != null && over > capUsd) limitedShare = 1 - (p.allowEq + capUsd) / usage;
  } else limitedShare = over > 0 ? over / usage : 0;
  return { seat: p.price, api: round2(api), total: round2(p.price + api), limitedShare: round2(limitedShare) };
}
/** The cheapest seat for a usage level (with API overage). */
export function bestSeat(usage) {
  return SEAT_ORDER.map((id) => ({ id, ...seatCost(id, usage) })).sort((a, b) => a.total - b.total)[0];
}

export function codingPicture(state, month = monthKey(state)) {
  const c = aiSlice(state).coding;
  const rows = engineers(state).map((m) => {
    const usage = usageEq(state, m, month);
    const plan = seatOf(state, m);
    const cost = seatCost(plan, usage, c);
    const best = bestSeat(usage);
    return { id: m.id, name: m.name, usage, plan, ...cost, best: best.id, bestTotal: best.total, waste: round2(Math.max(0, cost.total - best.total)) };
  });
  return {
    rows, seatUsd: round2(rows.reduce((a, r) => a + r.seat, 0)), apiUsd: round2(rows.reduce((a, r) => a + r.api, 0)),
    total: round2(rows.reduce((a, r) => a + r.total, 0)), waste: round2(rows.reduce((a, r) => a + r.waste, 0)),
    limitedShare: rows.length ? rows.reduce((a, r) => a + r.limitedShare, 0) / rows.length : 0,
  };
}

const factorCache = new WeakMap();
/** Multiplier on the team's AI-assisted pace today: engineers who hit their usage limit work slower until the window resets. */
export function codingLimitFactor(state) {
  const key = `${state.day}|${engineers(state).length}`;
  const hit = factorCache.get(state);
  if (hit?.key === key) return hit.v;
  const c = aiSlice(state).coding;
  const eng = engineers(state);
  let v = 1;
  if (eng.length) {
    const frac = Math.min(1, dayOfMonth(state) / 30);
    let limited = 0;
    for (const m of eng) {
      const u = usageEq(state, m);
      const p = SEAT_PLANS[seatOf(state, m)];
      const ceiling = c.overage === 'api' ? (c.capUsd == null ? Infinity : p.allowEq + c.capUsd) : p.allowEq;
      if (u * frac > ceiling || (c.stalls?.[m.id] ?? -1) > state.day) limited++; // over the limit, or stalled after a runaway loop
    }
    v = round2(1 - CODING.limitSlow * (limited / eng.length));
  }
  factorCache.set(state, { key, v });
  return v;
}

// ---- player actions (each returns { ok, hours }) ----
export function setCodingPolicy(state, patch) {
  const c = aiSlice(state).coding;
  let hours = CODING.setupHours;
  if (patch.policy && (patch.policy === 'shadow' || SEAT_PLANS[patch.policy])) { c.policy = patch.policy; c.seats = {}; }
  if (patch.overage) c.overage = patch.overage === 'wait' ? 'wait' : 'api';
  if ('capUsd' in patch) c.capUsd = patch.capUsd == null || patch.capUsd === '' ? null : Math.max(0, Number(patch.capUsd));
  if ('alerts' in patch) c.alerts = Boolean(patch.alerts);
  if ('hardLimit' in patch) c.hardLimit = Boolean(patch.hardLimit);
  if (patch.keyMode) { if (patch.keyMode === 'scoped' && c.keyMode !== 'scoped') hours += 2; c.keyMode = patch.keyMode === 'scoped' ? 'scoped' : 'shared'; }
  return { ok: true, hours };
}
export function assignSeat(state, memberId, plan) {
  if (!SEAT_PLANS[plan]) return { ok: false, error: 'Unknown seat' };
  aiSlice(state).coding.seats[memberId] = plan;
  return { ok: true, hours: 0.1 };
}
/** Read the admin consoles: per-engineer usage becomes visible and right-sizing can be done on facts. */
export function auditCoding(state) {
  const c = aiSlice(state).coding;
  c.audits++; c.lastAudit = { day: state.day, rows: codingPicture(state).rows.map((r) => ({ id: r.id, usage: r.usage, best: r.best })) };
  return { ok: true, hours: CODING.auditHours };
}
export function rightSizeAll(state) {
  const c = aiSlice(state).coding;
  for (const r of codingPicture(state).rows) c.seats[r.id] = r.best;
  return { ok: true, hours: 0.5 };
}

// ---- monthly settlement ----
export function codingMonthEnd(state) {
  const eng = engineers(state);
  if (!eng.length) return null;
  const S = aiSlice(state), c = S.coding;
  const month = monthKey(state);
  const pic = codingPicture(state, month);
  const prov = PROVIDERS[c.provider];
  let extra = 0, incident = null;
  // Runaway agent loop on one engineer's account.
  for (const r of pic.rows) {
    if (aiRng(state) >= CODING.runawayMonthly) continue;
    const mult = CODING.runawayMult[0] + aiRng(state) * (CODING.runawayMult[1] - CODING.runawayMult[0]);
    if (c.overage === 'wait') {
      // No pay-as-you-go: the loop burns the seat's allowance and the engineer waits for the limit to reset. No bill,
      // but lost AI-assisted pace; an alert catches it the same day instead of when they complain.
      const days = c.alerts ? RUNAWAY_STALL_DAYS[0] : RUNAWAY_STALL_DAYS[1];
      (c.stalls ??= {})[r.id] = state.day + days;
      const hpw = eng.find((m) => m.id === r.id)?.hoursPerWeek ?? 40;
      const lostHours = round2((hpw / 5) * days * CODING.limitSlow);
      incident = { kind: 'runaway_stall', who: r.name, usd: 0, days, lostHours };
      c.incidents.push({ month, ...incident });
      if (!c.alerts) aiMistake(state, { functionId: 'ai_cost_management', id: 'unmonitored_agent_spend', label: `Runaway agent loop burned ${r.name}'s usage allowance`, cost: { hours: lostHours }, delayed: true, detail: `An unattended agent looped at ~${Math.round(mult)}x normal token use and used up the seat's limit. With overage off there was no bill, but ${r.name} worked without the agent for ~${days} days (about ${lostHours} h of lost pace). A spend alert flags the loop the same day.`, key: `rl:${month}:${r.id}` });
      else { S.stats.runawayCaught++; pushEvent(S, state, 'ai_spend_spike', { usd: 0, kind: 'coding_runaway', text: `Coding agent loop on ${r.name}: allowance used up, stalled ~${days} day(s).` }); }
      continue;
    }
    let bill = r.usage * (mult - 1);
    if (c.capUsd != null) bill = Math.min(bill, c.capUsd);
    else if (c.alerts) bill *= 0.3;
    extra += bill;
    incident = { kind: 'runaway', who: r.name, usd: round2(bill) };
    c.incidents.push({ month, ...incident });
    if (c.capUsd == null && !c.alerts) {
      aiMistake(state, { functionId: 'ai_cost_management', id: 'unmonitored_agent_spend', label: `Runaway agent loop on ${r.name}'s account`, cost: { usd: Math.round(bill), hours: 1.5 }, delayed: true, detail: `An unattended agent looped at ~${Math.round(mult)}x normal token use. With no per-seat cap and no spend alert you found out on the invoice.`, key: `rl:${month}:${r.id}` });
    } else S.stats.runawayCaught++;
    if (c.alerts) pushEvent(S, state, 'ai_spend_spike', { usd: round2(bill), kind: 'coding_runaway', text: `Coding agent spend spike on ${r.name}: ${usd0(bill)}.` });
  }
  // Leaked API key.
  const pLeak = c.keyMode === 'shared' ? CODING.leakMonthlyShared : CODING.leakMonthlyScoped;
  if (c.overage === 'api' && aiRng(state) < pLeak) {
    const z = (aiRng(state) + aiRng(state) + aiRng(state) - 1.5) * 2; // ~N(0,1)
    let bill = Math.min(CODING.leakMaxUsd, CODING.leakMedianUsd * Math.exp(CODING.leakSigma * z));
    if (c.keyMode === 'scoped') bill = Math.min(bill, Math.max(300, pic.apiUsd * 3));
    if (c.hardLimit) bill = Math.min(bill, Math.max(500, pic.apiUsd * 2));
    if (c.alerts) bill *= CODING.leakAlertShare;
    bill = round2(bill);
    extra += bill;
    S.stats.leaks++;
    c.incidents.push({ month, kind: 'key_leak', usd: bill });
    state.founder.hoursUsed = (state.founder.hoursUsed ?? 0) + CODING.rotateHours;
    if (c.keyMode === 'shared') {
      aiMistake(state, { functionId: 'ai_cost_management', id: 'shared_api_key_leak', label: 'A shared, unscoped API key leaked', cost: { usd: Math.round(bill), hours: CODING.rotateHours }, delayed: true, detail: `One key shared by the whole team leaked and was resold within hours: ${usd0(bill)} of abuse before it was revoked. Per-environment keys, a prepaid hard limit and alerts bound this.`, key: `leak:${month}` });
    }
    notify(state, `A leaked API key was abused for ${usd0(bill)}. Rotate keys; use scoped keys and a hard spend limit.`, { type: 'bad', app: 'product' });
    if (c.alerts) pushEvent(S, state, 'ai_spend_spike', { usd: bill, kind: 'key_leak', text: `Leaked key abuse ${usd0(bill)}.` });
  }
  const seats = pic.seatUsd, api = round2(pic.apiUsd + extra);
  if (seats > 0) post(state, { amount: -seats, counterparty: 'AI coding seats', description: `AI coding seats for ${eng.length} engineer(s)`, category: 'software', method: 'card', meta: { app: 'aicost', dev: true, usage: true } });
  if (api > 0.01) post(state, { amount: -api, counterparty: prov.counterparty, description: `AI coding API usage (agentic and background work)${extra ? `, incl. ${usd0(extra)} incident` : ''}`, category: 'software', method: 'card', meta: { provider: c.provider, dev: true, app: 'aicost', usage: true } });
  c.hist.push({ month, engineers: eng.length, seats, api, extra: round2(extra), limitedShare: round2(pic.limitedShare), waste: pic.waste, perEngineer: round2((seats + api) / eng.length) });
  if (c.hist.length > 36) c.hist.shift();
  c.month = month;
  return { seats, api, extra, incident };
}

export { SEAT_PLANS, SEAT_ORDER };
