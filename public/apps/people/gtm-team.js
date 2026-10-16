// CSMs, account managers and sales engineers: who owns which account, how much of a book one person can cover, and
// what they change. Reads the Success app's accounts (state.apps.success.accounts) and Stripe directly, so it adds
// no dependency on the customer apps. Coverage ratios (accounts per CSM by segment) are [unverified]/[design]:
// docs/research/gtm-comp/comp-plans.md section 6.
//
// Effects (all [design]):
//  - CSM: lowers churn and lifts health on covered accounts; an overloaded CSM loses effect (load^-1.3) and a
//    ramping one has partial effect.
//  - AM: owns expansion and renewals on mid-market and enterprise accounts (expansion itself runs in
//    sales/expand.js; the renewal bonus is read by the success engine).
//  - SE: raises the technical-win rate and shortens enterprise cycles on deals above a technical-evaluation size.

import { COVERAGE, bandOfAcv } from '../../data/gtm-comp.js';
import { clamp, round2 } from '../../core/util.js';
import { monthlyAmount } from '../../core/stripe.js';
import { outputFor } from './performance.js';
import { rampFactor } from './hiring.js';
import { planKeyOf, setCompHooks } from './comp.js';

const members = (state) => state.apps.people?.members ?? [];
const activeOf = (state, key) => members(state).filter((m) => m.kind !== 'ai_agent' && m.status === 'active' && m.startDay <= state.day && planKeyOf(m) === key);
const subOf = (state, id) => (state.stripe?.subscriptions ?? []).find((s) => s.id === id);
const liveSub = (s) => s && (s.status === 'active' || s.status === 'past_due');
const acvOfSub = (s) => Math.round(monthlyAmount(s) * 12);
const accountsOf = (state) => Object.values(state.apps.success?.accounts ?? {});

/** Capacity of one person in "average accounts of a segment" units: 1 is a full book; ramp and trait scale it. */
export const personCapacity = (state, m) => round2(clamp(outputFor(m, 'capacityMult') ?? 1, 0.6, 1.5) * clamp(rampFactor(m, state.day), 0.25, 1));

/** Effect scale 0..1 of someone carrying `load` against `capacity`: full inside capacity, falling off beyond it. */
export const overloadEffect = (load, capacity) => (load <= capacity || capacity <= 0 ? (capacity <= 0 ? 0 : 1) : Math.pow(capacity / load, COVERAGE.csm.overloadExp));

function assignBook(state, people, accts, table, skipSmb) {
  const load = new Map(people.map((m) => [m.id, 0]));
  const caps = new Map(people.map((m) => [m.id, personCapacity(state, m)]));
  const out = new Map();
  for (const a of accts) {
    const sub = subOf(state, a.subId);
    const band = bandOfAcv(acvOfSub(sub));
    if (skipSmb && band === 'smb') continue;
    if (!people.length) break;
    let best = null;
    for (const m of people) {
      const r = load.get(m.id) / Math.max(0.05, caps.get(m.id));
      if (!best || r < best.r) best = { m, r };
    }
    out.set(a.subId, best.m.id);
    load.set(best.m.id, load.get(best.m.id) + 1 / table[band]);
  }
  return { out, load, caps };
}

/** Assign every live account to a CSM (all accounts) and an AM (mid-market and above) and store the effects on acct.gtm. */
export function assignOwners(state) {
  const accts = accountsOf(state).filter((a) => !a.closed && liveSub(subOf(state, a.subId))).sort((a, b) => acvOfSub(subOf(state, b.subId)) - acvOfSub(subOf(state, a.subId)));
  const csms = activeOf(state, 'csm');
  const ams = activeOf(state, 'am');
  const C = assignBook(state, csms, accts, COVERAGE.accountsPerCsm, false);
  const A = assignBook(state, ams, accts, COVERAGE.amAccounts, true);
  const effOf = (res, people) => {
    const e = new Map();
    for (const m of people) e.set(m.id, overloadEffect(res.load.get(m.id) ?? 0, res.caps.get(m.id)));
    return e;
  };
  const csmEff = effOf(C, csms), amEff = effOf(A, ams);
  for (const a of accts) {
    const g = (a.gtm ??= {});
    const csm = csms.find((m) => m.id === C.out.get(a.subId));
    const am = ams.find((m) => m.id === A.out.get(a.subId));
    g.csmId = csm?.id ?? null; g.amId = am?.id ?? null;
    if (csm) {
      const ramp = clamp(rampFactor(csm, state.day), 0.25, 1);
      const eff = csmEff.get(csm.id) * ramp;
      const trait = clamp(outputFor(csm, 'churnMult') ?? 1, 0.7, 1.3);
      g.csmEffect = round2(eff);
      g.ownerChurn = round2(1 - (1 - COVERAGE.csm.churnMult * trait) * eff);
      g.healthBonus = round2(COVERAGE.csm.healthBonus * eff);
      g.renewalBonus = round2(COVERAGE.csm.renewalBonus * eff);
      g.overloaded = (C.load.get(csm.id) ?? 0) > C.caps.get(csm.id) * 1.001;
    } else { g.csmEffect = 0; g.ownerChurn = 1; g.healthBonus = 0; g.renewalBonus = 0; g.overloaded = false; }
    if (am) {
      const eff = amEff.get(am.id) * clamp(rampFactor(am, state.day), 0.25, 1);
      g.amEffect = round2(eff);
      g.renewalBonus = Math.max(g.renewalBonus ?? 0, round2(COVERAGE.am.renewalBonus * eff * clamp(outputFor(am, 'renewalMult') ?? 1, 0.7, 1.4)));
    } else g.amEffect = 0;
    g.owned = Boolean(csm || am);
  }
  for (const a of accountsOf(state)) if (a.closed && a.gtm) a.gtm.owned = false;
  const st = ((state.apps.people ??= { members: [] }).gtm ??= {});
  st.lastAssign = state.day;
  return { csms: csms.length, ams: ams.length, accounts: accts.length };
}

/** Coverage by segment for the UI and the readers: accounts, owners, load vs capacity. */
export function coverageReport(state) {
  const accts = accountsOf(state).filter((a) => !a.closed && liveSub(subOf(state, a.subId)));
  const csms = activeOf(state, 'csm');
  const out = { smb: { accounts: 0, covered: 0 }, mid: { accounts: 0, covered: 0 }, ent: { accounts: 0, covered: 0 } };
  let loadW = 0;
  for (const a of accts) {
    const band = bandOfAcv(acvOfSub(subOf(state, a.subId)));
    out[band].accounts++;
    if (a.gtm?.csmId) out[band].covered++;
    loadW += 1 / COVERAGE.accountsPerCsm[band];
  }
  const cap = csms.reduce((x, m) => x + personCapacity(state, m), 0);
  return { bands: out, csms: csms.length, ams: activeOf(state, 'am').length, ses: activeOf(state, 'se').length, load: round2(loadW), capacity: round2(cap), coverage: cap > 0 ? round2(Math.min(1, cap / Math.max(0.0001, loadW))) : 0, overloaded: cap > 0 && loadW > cap * 1.001 };
}

/** SE effect on technical evaluations (deals at or above COVERAGE.se.minAcv). */
export function seEffect(state) {
  const ses = activeOf(state, 'se');
  const aes = members(state).filter((m) => m.kind !== 'ai_agent' && m.status === 'active' && planKeyOf(m) && ['ae', 'founding_ae'].includes(planKeyOf(m))).length;
  if (!ses.length) return { ses: 0, coverage: 0, winMult: 1, cycleMult: 1 };
  const seats = ses.reduce((a, m) => a + clamp(rampFactor(m, state.day), 0.25, 1), 0) * COVERAGE.seAes;
  const coverage = clamp(seats / Math.max(1, aes + 1), 0, 1);
  const trait = ses.reduce((a, m) => a + (outputFor(m, 'technicalWinMult') ?? 1), 0) / ses.length;
  const cyc = ses.reduce((a, m) => a + (outputFor(m, 'cycleMult') ?? 1), 0) / ses.length;
  return {
    ses: ses.length, coverage: round2(coverage),
    winMult: round2(1 + (COVERAGE.se.winMult - 1) * coverage * trait),
    cycleMult: round2(1 - (1 - COVERAGE.se.cycleMult) * coverage / clamp(cyc, 0.8, 1.1)),
  };
}

/** Daily: refresh ownership weekly (and whenever the team changes). */
export function gtmTeamDay(state) {
  const p = state.apps.people;
  if (!p) return;
  const g = (p.gtm ??= { lastAssign: -99, sig: '' });
  const sig = p.members.filter((m) => ['csm', 'am'].includes(planKeyOf(m)) && m.status === 'active').map((m) => m.id).join(',');
  if (!state.apps.success) { g.sig = sig; return; }
  if (state.day - (g.lastAssign ?? -99) >= 7 || sig !== g.sig) { g.sig = sig; assignOwners(state); }
}

// ---------------------------------------------------------------------------------------------
// Settlement inputs for AM, SE and CSM plans (registered into comp.js)
// ---------------------------------------------------------------------------------------------

const events = (state) => state.stripe?.events ?? [];

function amUnits(state, m, start, end) {
  const mine = new Set(accountsOf(state).filter((a) => a.gtm?.amId === m.id).map((a) => a.subId));
  let exp = 0;
  for (const e of events(state)) if (e.day >= start && e.day <= end && mine.has(e.subId) && e.type === 'expansion' && e.amount > 0) exp += e.amount * 12;
  let renewed = 0;
  for (const a of accountsOf(state)) {
    if (!mine.has(a.subId)) continue;
    for (const r of a.past ?? []) if (r.renewedDay != null && r.renewedDay >= start && r.renewedDay <= end && (r.status === 'renewed' || r.status === 'auto-renewed')) renewed += acvOfSub(subOf(state, a.subId) ?? { price: 0, quantity: 1 });
  }
  return exp + 0.2 * renewed;
}

function seUnits(state, m, start, end) {
  let n = 0;
  for (const e of events(state)) if (e.day >= start && e.day <= end && e.type === 'new' && e.amount > 0 && !/^ads:|^organic:/.test(e.source ?? '')) n += e.amount * 12;
  return n;
}

function csmStats(state, m) {
  const book = accountsOf(state).filter((a) => a.gtm?.csmId === m.id);
  if (!book.length) return null;
  const since = Math.max(m.startDay, state.day - 365);
  const window = state.day - since;
  if (window < 60) return null;
  const ids = new Set(book.map((a) => a.subId));
  const at = new Map();
  for (const e of events(state)) {
    if (!ids.has(e.subId)) continue;
    const x = at.get(e.subId) ?? { start: 0, end: 0 };
    if (e.day <= since) x.start += e.amount;
    x.end += e.amount;
    at.set(e.subId, x);
  }
  let start = 0, loss = 0, end = 0;
  for (const x of at.values()) {
    if (x.start <= 0.5) continue;
    start += x.start; end += Math.max(0, x.end); loss += Math.min(0, Math.max(0, x.end) - x.start);
  }
  if (start <= 0) return null;
  const f = Math.max(1, 365 / window);
  const grr = clamp(1 + (loss / start) * f, 0, 1), nrr = clamp((end / start - 1) * f + 1, 0, 2);
  let due = 0, kept = 0;
  for (const a of book) for (const r of a.past ?? []) if (r.renewedDay != null && r.renewedDay >= since) { due++; if (r.status === 'renewed' || r.status === 'auto-renewed') kept++; }
  for (const a of book) if (a.closed && a.closedDay >= since && a.renewal && ['churned', 'lost'].includes(a.renewal.status)) due++;
  return { grr, nrr, renewalRate: due ? kept / due : null, accounts: book.length };
}

setCompHooks({ amUnits, seUnits, csmStats });
export { csmStats, amUnits, seUnits };
