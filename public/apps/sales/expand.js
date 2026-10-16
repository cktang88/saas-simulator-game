// Land and expand: the land strategy chosen per deal, the account map (hidden whitespace by department), expansion
// signals, expansion and contraction through real Stripe subscription changes (quantity/price, so MRR movements
// show as expansion or contraction), ramped contracts, true-ups, owner-run renewals and the failure modes
// (land too small, anchored price, upsell before value, shelfware, lost champion, no owner).
// Rules and numbers: sales/expand-model.js and data/gtm-comp.js (research docs/research/gtm-comp/land-and-expand.md).
// Accounts are the Success app's accounts (state.apps.success.accounts, keyed by subscription id).

import { notify } from '../../core/state.js';
import { rng, chance, gaussian, clamp, round2, uid } from '../../core/util.js';
import { logMistake } from '../../core/operator.js';
import { changePrice, charge, cancel } from '../../core/stripe.js';
import { LAND_STRATEGIES, COVERAGE, EXPAND, BEHAVIOR, bandOfAcv } from '../../data/gtm-comp.js';
import { ensureSuccess, syncAccounts, subById, acvOf, seatRoom, proposeRenewal, acceptCounter } from '../success/engine.js';
import { companyById, dealById } from './model.js';
import { employeesOf } from './replies.js';
import { emitSalesEvent } from './events.js';
import { championRisk, pursuitProbability, blendedUnitPrice, landSeats, adoptionCeiling, landFit } from './expand-model.js';
import { outputFor } from '../people/performance.js';
import { planFor } from '../people/comp.js';

const DEPTS = ['Finance', 'Sales', 'Customer support', 'Operations', 'Marketing', 'Engineering', 'People ops', 'Legal'];
const live = (sub) => sub && (sub.status === 'active' || sub.status === 'past_due');
const members = (state) => state.apps.people?.members ?? [];
const memberById = (state, id) => members(state).find((m) => m.id === id);
const nameOf = (state, acct) => companyById(state, acct.companyId)?.name ?? 'an account';

// ---------------------------------------------------------------------------------------------
// Land strategy on a deal
// ---------------------------------------------------------------------------------------------

/** Choose how to land a deal: sets the seats seated, cycle and win rate when the proposal is built. Before the proposal only. */
export function setLandStrategy(state, deal, strategyId, { ramp = false } = {}) {
  if (!LAND_STRATEGIES[strategyId]) throw new Error('Unknown land strategy.');
  if (['proposal', 'contract', 'won', 'lost'].includes(deal.stage)) throw new Error('Choose the land strategy before the proposal goes out.');
  deal.land = { strategy: strategyId, ramp: Boolean(ramp), chosenDay: state.day };
  return deal.land;
}

/** Seat count at the land for a strategy given the buyer's headcount (used by the proposal builder). */
export const seatsForLand = (strategyId, employees) => landSeats(strategyId, employees);

// ---------------------------------------------------------------------------------------------
// Account map
// ---------------------------------------------------------------------------------------------

const dealFor = (state, acct) => state.apps.crm?.deals?.find((d) => d.subscriptionId === acct.subId) ?? (acct.land?.dealId ? dealById(state, acct.land.dealId) : null);

/** Create the land record, hidden whitespace and adoption state for an account (once). */
export function initMap(state, acct) {
  if (acct.map) return acct.map;
  const sub = subById(state, acct.subId);
  if (!sub) return null;
  const deal = dealFor(state, acct);
  const co = companyById(state, acct.companyId) ?? {};
  const emp = employeesOf(co, state.company.model === 'ent' ? 'ent' : 'smb');
  const q0 = sub.quantity ?? 1;
  const strat = deal?.land?.strategy ?? 'unspecified';
  const L = LAND_STRATEGIES[strat];
  const finalShare = L?.finalShare ?? 0.3;
  const rampTo = deal?.rampTo ?? null;
  const acv = acvOf(sub);
  const potential = clamp(Math.round(((rampTo ?? q0) / finalShare) * Math.exp(0.25 * gaussian(state))), rampTo ?? q0, Math.max(rampTo ?? q0, emp));
  const remainder = Math.max(0, potential - (rampTo ?? q0));
  const nDept = remainder >= 10 ? 6 : remainder >= 6 ? 5 : remainder >= 3 ? 3 : remainder >= 1 ? remainder : 0;
  const pool = [...DEPTS];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng(state) * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const names = pool.slice(0, nDept);
  const w = names.map(() => 0.5 + rng(state));
  const wsum = w.reduce((a, b) => a + b, 0) || 1;
  let left = remainder;
  const items = names.map((dept, i) => {
    const seats = i === names.length - 1 ? left : Math.max(1, Math.min(left - (names.length - 1 - i), Math.round((remainder * w[i]) / wsum)));
    left -= seats;
    return { id: uid('ws'), dept, seats: Math.max(1, seats), status: 'hidden', needsSponsor: chance(state, 0.4), attempts: 0 };
  }).filter((x) => x.seats > 0);
  acct.land = { strategy: strat, dealId: deal?.id ?? null, landDay: state.day, seats: q0, landAcv: acv, discountPct: sub.discountPct ?? 0, listUnit: sub.price, ramp: Boolean(rampTo), finalShare };
  acct.map = { mapped: false, threads: 1, execSponsor: false, whitespace: items, potentialSeats: potential };
  acct.adoption = 0.25;
  const g = (acct.gtm ??= {});
  if (q0 / Math.max(q0, potential) < EXPAND.landTooSmallShare) g.landSmall = 1.4;
  if (L) g.landFit = round2(L.churnMult * (1 + 0.3 * (1 - landFit(strat, rampTo ? acv : acv))));
  if (strat === 'paid_pilot') acct.pilot = { endDay: state.day + L.pilotDays, fullSeats: Math.min(emp, Math.max(q0 + 1, Math.round(emp * 0.3))), status: 'active' };
  if (rampTo && rampTo > q0) acct.contract = { type: 'ramp', steps: [{ day: state.day + 180, toSeats: rampTo, done: false }], contractedSeats: rampTo };
  return acct.map;
}

/** Map the account: reveals whitespace by department and who else matters. 1.5 founder hours. */
export function mapAccount(state, acct) {
  const m = initMap(state, acct);
  if (!m) throw new Error('No account to map.');
  for (const it of m.whitespace) if (it.status === 'hidden') it.status = 'mapped';
  m.mapped = true;
  m.mappedDay = state.day;
  acct.lastTouchDay = state.day;
  return m;
}

/** Meet more stakeholders (multi-threading): a second thread, and sometimes the executive sponsor. 2 founder hours. */
export function meetStakeholders(state, acct) {
  initMap(state, acct);
  const m = acct.map;
  m.threads = Math.max(m.threads ?? 1, acct.threads ?? 1) + 1;
  if (!m.execSponsor && chance(state, 0.35 + 0.1 * Math.min(3, m.threads))) m.execSponsor = true;
  acct.lastTouchDay = state.day;
  acct.drift = (acct.drift ?? 0) + 0.03;
  return { threads: m.threads, execSponsor: m.execSponsor };
}

// ---------------------------------------------------------------------------------------------
// Expansion and contraction through Stripe
// ---------------------------------------------------------------------------------------------

/** Add seats (quantity) on the live subscription; the price per added seat is list x (1 - askDiscount), blended into sub.price. */
export function addSeats(state, acct, seats, askDiscount = null) {
  const sub = subById(state, acct.subId);
  const q0 = sub.quantity ?? 1;
  const room = seatRoom(state, acct, sub).room;
  const add = Math.max(0, Math.min(seats, Math.max(room, 0)));
  if (add <= 0) return 0;
  const L = acct.land ?? {};
  const d0 = sub.discountPct ?? 0;
  const ask = askDiscount ?? d0;
  const listUnit = L.listUnit ?? sub.price;
  const { q1, unit } = blendedUnitPrice(listUnit, q0, d0, add, ask);
  changePrice(state, sub.id, { price: unit, quantity: q1 });
  if (acct.adoption != null) acct.adoption = clamp((acct.adoption * q0 + 0.5 * add) / q1, 0, 1); // new seats start half-used
  return add;
}

/** Cut seats (true-down, shelfware at renewal): a real Stripe contraction. */
export function contractAccount(state, acct, newSeats, reason = 'shelfware at renewal') {
  const sub = subById(state, acct.subId);
  const q0 = sub.quantity ?? 1;
  const q1 = clamp(Math.round(newSeats), 1, q0);
  if (q1 >= q0) return 0;
  const before = acvOf(sub);
  changePrice(state, sub.id, { quantity: q1 });
  const lost = before - acvOf(sub);
  acct.drift = (acct.drift ?? 0) - 0.05;
  acct.contractions = (acct.contractions ?? 0) + 1;
  emitSalesEvent(state, 'account_contracted', { companyId: acct.companyId, subId: sub.id, customerId: sub.customerId, seatsBefore: q0, seatsAfter: q1, arrLost: lost, reason, label: `${nameOf(state, acct)} cut ${q0 - q1} seat(s) (${reason})` }, `contract:${sub.id}:${state.day}`);
  notify(state, `${nameOf(state, acct)} cut ${q0} seats to ${q1} (${reason}): -$${Math.round(lost).toLocaleString('en-US')}/yr.`, { type: 'bad', app: 'success' });
  return lost;
}

/**
 * Pursue a whitespace item (a department's seats). Returns { ok, p, seats }.
 * Selling before the account has seen value (low seat utilisation) rarely lands and raises churn risk.
 */
export function pursueWhitespace(state, acct, itemId, { askDiscount = null, by = 'founder', premature = null } = {}) {
  initMap(state, acct);
  const sub = subById(state, acct.subId);
  const item = acct.map.whitespace.find((x) => x.id === itemId);
  if (!sub || !item || !['open', 'mapped', 'hidden'].includes(item.status)) return { ok: false, p: 0, seats: 0 };
  const g = (acct.gtm ??= {});
  const util = acct.adoption ?? 0.6;
  const early = premature ?? util < COVERAGE_FLOOR;
  const landDiscount = acct.land?.discountPct ?? 0;
  let boost = 1;
  if (by === 'am') boost = 1 + 0.4 * (g.amEffect ?? 0);
  const p = pursuitProbability({ health: acct.health ?? 60, itemStatus: item.status === 'open' ? 'open' : 'mapped', needsSponsor: item.needsSponsor, execSponsor: acct.map.execSponsor, util, landDiscount, askDiscount: askDiscount ?? null, ownerBoost: boost });
  item.attempts = (item.attempts ?? 0) + 1;
  acct.lastTouchDay = state.day;
  const ok = chance(state, p);
  if (early) {
    g.upsell = EXPAND.upsellBeforeValueChurn; g.upsellUntil = state.day + 180;
    logMistake(state, {
      functionId: 'account_expansion', id: 'upsell_before_value', label: 'Pushed an upsell before the account saw value', app: 'success', delayed: true, key: `upsell:${acct.subId}:${Math.floor(state.day / 90)}`,
      cost: { usd: Math.round(acvOf(sub) * 0.2), customers: ok ? 0.3 : 0.15, hours: 1 }, charge: by === 'founder',
      detail: `${nameOf(state, acct)} uses ~${Math.round(util * 100)}% of the seats they have. ${by === 'csm' ? 'The CSM, paid on net retention, pushed' : 'You pushed'} ${item.seats} more seats for ${item.dept}; ${ok ? 'they signed, and now hold more shelfware (churn risk x' + EXPAND.upsellBeforeValueChurn + ' until they adopt it).' : 'they said no and trust dropped.'} Fix adoption first, then expand where usage already hit the limit.`,
    });
    if (!ok) acct.drift = (acct.drift ?? 0) - 0.04;
  } else if (!ok) {
    acct.drift = (acct.drift ?? 0) - (item.status === 'open' ? 0.01 : 0.02);
    if (item.status === 'open' && item.attempts >= 2) item.status = 'lost';
  }
  if (!ok) return { ok: false, p, seats: 0 };
  const L = acct.land ?? {};
  const added = addSeats(state, acct, item.seats, askDiscount);
  item.status = added > 0 ? 'won' : 'mapped';
  acct.lastExpansionDay = state.day;
  acct.expansions = (acct.expansions ?? 0) + (added > 0 ? 1 : 0);
  if (added > 0 && (L.discountPct ?? 0) > EXPAND.anchorDiscount && (askDiscount ?? L.discountPct) >= L.discountPct) {
    logMistake(state, {
      functionId: 'account_expansion', id: 'anchored_low_price', label: 'Expanded at the discounted land price', app: 'success', delayed: true, key: `anchor:${acct.subId}`,
      cost: { usd: Math.round(added * (L.listUnit ?? sub.price) * ((L.discountPct ?? 0) - 0.1) * (sub.interval === 'year' ? 1 : 12)) },
      detail: `${nameOf(state, acct)} landed at ${Math.round((L.discountPct ?? 0) * 100)}% off and every added seat now sells at the same discount. Deep first-year discounts anchor the price: land near list, trade term or scope instead.`,
    });
  }
  return { ok: added > 0, p, seats: added };
}
const COVERAGE_FLOOR = EXPAND.shelfwareUtil;

/** True-up: bill the overage retroactively and move the commitment up to actual use. */
export function trueUp(state, acct) {
  const sub = subById(state, acct.subId);
  initMap(state, acct);
  const open = acct.map.whitespace.find((x) => x.status === 'open');
  if (!sub || !open) return { ok: false, error: 'No usage above the commitment to true up.' };
  const seats = Math.min(open.seats, seatRoom(state, acct, sub).room);
  if (seats <= 0) return { ok: false, error: 'No seats above the commitment.' };
  const unit = round2((sub.price ?? 0) * (1 - (sub.discountPct ?? 0)));
  const amount = round2(unit * seats * (sub.interval === 'year' ? 0.25 : 3) * EXPAND.trueUpPremium);
  charge(state, sub.customerId, { amount, description: `True-up: ${seats} seat(s) used above the commitment`, subId: sub.id, source: 'true_up' });
  addSeats(state, acct, seats, acct.land?.discountPct ?? 0);
  open.status = 'won';
  return { ok: true, seats, amount };
}

// ---------------------------------------------------------------------------------------------
// Daily simulation (called from the Success app's onDay)
// ---------------------------------------------------------------------------------------------

const BAND_SIGNAL = { smb: 0.8, mid: 0.8, ent: 1.9 };

export function expandDay(state) {
  if (state.company.model === 'b2c' || !state.apps.success) return;
  const cs = syncAccounts(state);
  for (const acct of Object.values(cs.accounts)) {
    const sub = subById(state, acct.subId);
    if (!sub || !live(sub) || acct.closed) continue;
    initMap(state, acct);
    accountDay(state, acct, sub);
  }
}

function accountDay(state, acct, sub) {
  const g = (acct.gtm ??= {});
  const mp = acct.map;
  const acv = acvOf(sub);
  const band = bandOfAcv(acv);
  const strat = acct.land?.strategy;
  const L = LAND_STRATEGIES[strat] ?? { expandMult: 1, adoptCeil: 0.85 };
  const health = acct.health ?? 60;

  // adoption of purchased seats grows toward the strategy's ceiling (time constant ~90 days)
  const ceil = adoptionCeiling(strat, health, g.csmEffect ?? 0);
  acct.adoption = clamp((acct.adoption ?? 0.25) + (ceil - (acct.adoption ?? 0.25)) / 90, 0, 1);

  // temporary factors expire
  if (g.upsellUntil != null && state.day > g.upsellUntil) { g.upsell = 1; g.upsellUntil = null; }
  if (acct.land && state.day - acct.land.landDay > 450) { g.landFit = 1; g.landSmall = 1; }

  // champion lost: churn multiplier from championRisk (multi-threading, exec sponsor, QBR cadence soften it)
  g.champion = championRisk(acct, state.day);
  if (acct.champion === 'left' && acct.championLeftDay === state.day) {
    emitSalesEvent(state, 'champion_left', { companyId: acct.companyId, subId: sub.id, customerId: sub.customerId, arr: acv, label: `Champion left ${nameOf(state, acct)}` }, `champ:${sub.id}:${acct.championLeftDay}`);
    if ((mp.threads ?? 1) < 2 && !mp.execSponsor) logMistake(state, {
      functionId: 'account_expansion', id: 'single_threaded_account', label: 'Champion left an account with one relationship', app: 'success', delayed: true, key: `single:${sub.id}:${acct.championLeftDay}`,
      cost: { usd: Math.round(acv * 0.2), customers: 0.2 }, detail: `${nameOf(state, acct)} ($${acv.toLocaleString('en-US')}/yr) depended on one contact. With no second thread or executive sponsor, churn risk runs x${EXPAND.champion.leftMult} until you find a new champion. Map the account and meet a second stakeholder before you need one.`,
    });
  }

  // paid pilot: convert or stop at the end of the window
  const pl = acct.pilot;
  if (pl?.status === 'active' && state.day >= pl.endDay) {
    pl.status = 'decided';
    const p = clamp(LAND_STRATEGIES.paid_pilot.convertBase + 1.0 * ((acct.adoption ?? 0.5) - 0.55) + (mp.execSponsor ? 0.1 : 0) + 0.002 * (health - 60), 0.05, 0.95); // highest when the pilot reached production [design]
    if (chance(state, p)) {
      const q0 = sub.quantity ?? 1;
      const add = addSeats(state, acct, pl.fullSeats - q0, acct.land?.discountPct ?? 0);
      pl.converted = true;
      notify(state, `${nameOf(state, acct)} converted after the pilot (+${add} seats).`, { type: 'good', app: 'success' });
    } else {
      pl.converted = false;
      cancel(state, sub.id, { atPeriodEnd: false, reason: 'pilot_ended' });
      notify(state, `${nameOf(state, acct)} ended the pilot without buying. The success test was not met.`, { type: 'warn', app: 'success' });
      return;
    }
  }

  // ramped contract: scheduled step-ups
  for (const st of acct.contract?.steps ?? []) {
    if (st.done || state.day < st.day) continue;
    st.done = true;
    const q0 = sub.quantity ?? 1;
    if (st.toSeats > q0) { changePrice(state, sub.id, { quantity: st.toSeats }); acct.adoption = clamp((acct.adoption * q0) / st.toSeats, 0, 1); notify(state, `${nameOf(state, acct)} stepped up to ${st.toSeats} seats as contracted.`, { type: 'good', app: 'success' }); }
  }

  // usage-based starter: volume follows usage, up and down
  if (strat === 'usage_starter' && state.day % 30 === 0) {
    const q0 = sub.quantity ?? 1;
    if ((acct.adoption ?? 0) >= 0.85 && chance(state, 0.5)) addSeats(state, acct, Math.max(1, Math.round(q0 * (0.1 + 0.15 * rng(state)))), acct.land.discountPct);
    else if ((acct.adoption ?? 1) < 0.5 && chance(state, 0.3)) contractAccount(state, acct, Math.round(q0 * 0.9), 'usage dipped');
  }

  // signals
  if (!acct.pilot || acct.pilot.status !== 'active') signalsDay(state, acct, sub, band, L);

  // owners: AM pursues open expansion; CSM paid on net retention may push upsell early; owner-run renewals
  ownerDay(state, acct, sub);

  // renewals: due event, ignored renewal, shelfware at the renewal
  renewalDay(state, acct, sub, acv);
}

function signalsDay(state, acct, sub, band, L) {
  const mp = acct.map;
  const open = mp.whitespace.filter((x) => x.status === 'open');
  for (const it of open) if (state.day - (it.signalDay ?? state.day) > 90) { it.status = mp.mapped ? 'mapped' : 'hidden'; it.expired = true; acct.missedSignals = (acct.missedSignals ?? 0) + 1; }
  const pool = mp.whitespace.filter((x) => x.status === 'hidden' || x.status === 'mapped');
  if (!pool.length || open.length) return;
  const g = acct.gtm ?? {};
  const qbrRecent = acct.lastQbrDay != null && state.day - acct.lastQbrDay <= EXPAND.qbrDays;
  const pDay = (EXPAND.signalMonthlyP / 30) * BAND_SIGNAL[band] * L.expandMult * clamp((acct.health ?? 60) / 60, 0.3, 1.6) * (mp.mapped ? 1.15 : 1) * (mp.execSponsor ? 1.1 : 1) * (qbrRecent ? 1.1 : 1) * (1 + 0.6 * (g.amEffect ?? 0)) * (acct.champion === 'active' ? 1 : acct.champion === 'weak' ? 0.7 : 0.2);
  let fire = chance(state, pDay);
  // an expansion question raised in a QBR can open an item right away
  if (!fire && acct.qbrExpansionAsk === state.day - 1 && (acct.adoption ?? 0) >= 0.5) fire = chance(state, 0.04 + (mp.mapped ? 0.04 : 0));
  if (!fire) return;
  const item = pool[Math.floor(rng(state) * pool.length)];
  const r = rng(state);
  const type = (acct.adoption ?? 0) >= 0.8 && r < 0.5 ? 'usage_near_limit' : r < 0.75 ? 'new_team_invited' : 'champion_promoted';
  item.status = 'open';
  item.signalDay = state.day;
  item.signal = type;
  (acct.signals ??= []).push({ day: state.day, type, itemId: item.id });
  if (acct.signals.length > 40) acct.signals.shift();
  emitSalesEvent(state, 'expansion_signal', { companyId: acct.companyId, subId: sub.id, customerId: sub.customerId, signal: type, dept: item.dept, seats: item.seats, label: `${nameOf(state, acct)}: ${type.replace(/_/g, ' ')} (${item.dept})` }, `sig:${item.id}`);
  notify(state, `Expansion signal at ${nameOf(state, acct)}: ${{ usage_near_limit: 'usage is near the seat limit', new_team_invited: `${item.dept} was invited`, champion_promoted: 'your champion was promoted' }[type]} (${item.dept}, ~${item.seats} seats).`, { type: 'good', app: 'success' });
}

function ownerDay(state, acct, sub) {
  const g = acct.gtm ?? {};
  const mp = acct.map;
  if (g.amId) {
    const am = memberById(state, g.amId);
    const open = mp.whitespace.find((x) => x.status === 'open');
    if (am && open && chance(state, (1 / 25) * (g.amEffect ?? 0) * clamp(outputFor(am, 'expansionMult') ?? 1, 0.6, 1.6))) {
      const plan = planFor(state, 'am');
      const traitD = outputFor(am, 'discountDepth') ?? 0.1;
      pursueWhitespace(state, acct, open.id, { by: 'am', askDiscount: Math.min(plan.discountAuthority, traitD) });
    }
  }
  if (g.csmId && state.day % 30 === 0) {
    const csm = memberById(state, g.csmId);
    if (csm && planFor(state, 'csm').metric === 'nrr' && (acct.adoption ?? 1) < BEHAVIOR.upsellBeforeValue.pushUsageBelow && chance(state, 0.3)) {
      const it = mp.whitespace.find((x) => ['open', 'mapped', 'hidden'].includes(x.status));
      if (it) pursueWhitespace(state, acct, it.id, { by: 'csm', premature: true });
    }
  }
}

function renewalDay(state, acct, sub, acv) {
  const r = acct.renewal;
  const g = (acct.gtm ??= {});
  if (r && acct.lastRenewalEvent !== r.id) {
    acct.lastRenewalEvent = r.id;
    emitSalesEvent(state, 'renewal_due', { companyId: acct.companyId, subId: sub.id, customerId: sub.customerId, arr: acv, renewalDay: sub.currentPeriodEnd, label: `${nameOf(state, acct)} renewal in ${sub.currentPeriodEnd - state.day} days ($${acv.toLocaleString('en-US')})` }, `renew:${r.id}`);
  }
  if (sub.interval !== 'year' || sub.currentPeriodEnd == null) return;
  const left = sub.currentPeriodEnd - state.day;
  // owner-run renewal (AM or CSM carries it when the founder has not)
  if (r && ['open', 'at_risk'].includes(r.status) && left <= 60 && !r.offers.length && g.owned) {
    r.startedLeft ??= left;
    const up = g.amId ? COVERAGE.am.uplift : 0.02;
    try {
      const res = proposeRenewal(state, acct, { upliftPct: up, discountPct: 0, years: 1, viaCall: true });
      if (res.decision === 'counter' && res.counter && res.counter.discountPct <= 0.1) acceptCounter(state, acct);
      r.ownerRun = g.amId ?? g.csmId;
    } catch { /* no open renewal */ }
  }
  // nobody owns the renewal: it slides toward auto-renew or churn
  if (r && ['open', 'at_risk'].includes(r.status) && left <= 30 && !r.offers.length && r.startedLeft == null && !g.owned && !g.ignored) {
    g.ignored = BEHAVIOR.noOwner.churnMult;
    logMistake(state, {
      functionId: 'account_expansion', id: 'no_account_owner', label: 'Nobody owned the renewal', app: 'success', delayed: true, key: `noowner:${r.id}`,
      cost: { usd: Math.round(acv * 0.25), customers: 0.4 },
      detail: `${nameOf(state, acct)} ($${acv.toLocaleString('en-US')}/yr) reaches its renewal in ${left} days with no conversation started and no CSM or account manager attached. The AE who sold it is on new business; unowned renewals churn about ${BEHAVIOR.noOwner.churnMult}x as often.`,
    });
  }
  if (r && (r.status === 'renewed' || r.status === 'auto-renewed' || r.status === 'committed') && g.ignored && left > 60) g.ignored = 1;
  // shelfware: at the renewal, the buyer cuts seats they do not use
  if (left === 2 && !acct.contractedAt?.[sub.currentPeriodEnd]) {
    (acct.contractedAt ??= {})[sub.currentPeriodEnd] = true;
    const q = sub.quantity ?? 1;
    if (q >= 4 && (acct.adoption ?? 1) < EXPAND.shelfwareUtil) {
      const to = Math.max(1, Math.ceil((q * Math.max(acct.adoption, 0.3)) / 0.85));
      const lost = contractAccount(state, acct, to, 'shelfware at renewal');
      if (lost > 0) logMistake(state, {
        functionId: 'account_expansion', id: 'oversized_land_shelfware', label: 'Seats sold ahead of adoption were cut at renewal', app: 'success', delayed: true, key: `shelf:${sub.id}:${sub.currentPeriodEnd}`,
        cost: { usd: Math.round(lost), customers: 0.2 },
        detail: `${nameOf(state, acct)} used ~${Math.round((acct.adoption ?? 0) * 100)}% of ${q} seats at renewal and cut to ${to}. ${acct.land?.strategy === 'top_down' ? 'Enterprise-wide commits roll out slower than the contract.' : 'More seats than the buyer would roll out'} Land what they will use in the first 90 days and expand on adoption.`,
      });
    }
    // landed too small to matter: never expanded, and a renewal that is easy to skip
    if ((g.landSmall ?? 1) > 1 && !acct.expansions) logMistake(state, {
      functionId: 'account_expansion', id: 'land_too_small', label: 'Landed too small to matter', app: 'success', delayed: true, key: `small:${sub.id}`,
      cost: { usd: Math.round(Math.max(acv * 0.3, 500)), customers: 0.2, hours: 1 },
      detail: `${nameOf(state, acct)} landed at ${(acct.land?.seats ?? sub.quantity)} seat(s) out of ~${acct.map.potentialSeats} it could use ($${acv.toLocaleString('en-US')}/yr). Nobody with a budget depends on it, so it never expanded and churns about x${g.landSmall} as often at the first renewal. Land a team with a real budget and a use case that matters.`,
    });
    // an over-discounted land refuses the uplift later; log when the anchor shows at renewal with no concession possible
    if ((acct.land?.discountPct ?? 0) > EXPAND.anchorDiscount && !acct.anchorLogged) {
      acct.anchorLogged = true;
      logMistake(state, { functionId: 'account_expansion', id: 'over_discounted_land', label: 'Over-discounted land anchors the price', app: 'success', delayed: true, key: `landdisc:${sub.id}`,
        cost: { usd: Math.round(acv * ((acct.land.discountPct ?? 0) - 0.1)) }, detail: `${nameOf(state, acct)} landed at ${Math.round(acct.land.discountPct * 100)}% off. At renewal they expect the same price: uplifts are refused far more often and each expansion starts from the low number.` });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------------------------

/** Gross and net revenue retention of CRM accounts by ACV band over a trailing window, from Stripe MRR events. */
export function retentionByBand(state, windowDays = 365) {
  const cs = ensureSuccess(state);
  const t0 = state.day - Math.min(windowDays, state.day);
  const rows = {};
  const per = new Map();
  for (const e of state.stripe?.events ?? []) {
    if (!cs.accounts[e.subId]) continue;
    const x = per.get(e.subId) ?? { start: 0, end: 0 };
    if (e.day <= t0) x.start += e.amount;
    x.end += e.amount;
    per.set(e.subId, x);
  }
  for (const [subId, x] of per) {
    if (x.start <= 0.5) continue;
    const band = bandOfAcv(x.start * 12);
    const r = (rows[band] ??= { n: 0, start: 0, end: 0, loss: 0, expansion: 0 });
    r.n++; r.start += x.start; r.end += Math.max(0, x.end); r.loss += Math.min(0, Math.max(0, x.end) - x.start); r.expansion += Math.max(0, Math.max(0, x.end) - x.start);
    void subId;
  }
  for (const r of Object.values(rows)) { r.grr = (r.start + r.loss) / r.start; r.nrr = r.end / r.start; }
  return rows;
}

/** Summary for the readers and the UI. */
export function expansionStats(state) {
  const cs = state.apps.success;
  const accts = Object.values(cs?.accounts ?? {});
  const live_ = accts.filter((a) => !a.closed && a.map);
  return {
    accounts: live_.length,
    mapped: live_.filter((a) => a.map.mapped).length,
    threaded: live_.filter((a) => (a.map.threads ?? 1) >= 2 || a.map.execSponsor).length,
    withLand: live_.filter((a) => a.land && a.land.strategy !== 'unspecified').length,
    signalsOpen: live_.reduce((n, a) => n + a.map.whitespace.filter((x) => x.status === 'open').length, 0),
    won: live_.reduce((n, a) => n + (a.expansions ?? 0), 0),
    missed: live_.reduce((n, a) => n + (a.missedSignals ?? 0), 0),
    contractions: accts.reduce((n, a) => n + (a.contractions ?? 0), 0),
    qbrs: (cs?.qbrs ?? []).filter((q) => q.status === 'held').length,
  };
}
