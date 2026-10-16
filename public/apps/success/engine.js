// Customer success simulation: CRM-linked accounts, health → churn multiplier, annual renewal pipeline
// (T−90/60/30), renewal outcomes, expansion, champion turnover, QBRs on the calendar and enterprise
// procurement asks (security questionnaires, VPAT/ACR, data residency, localization).
import { ensure, notify } from '../../core/state.js';
import { uid, chance, rng, poisson, clamp, round2, hash } from '../../core/util.js';
import { ensureStripe, changePrice, cancel, monthlyAmount } from '../../core/stripe.js';
import { ensureMarket, syntheticPerson } from '../../core/market.js';
import { post, addRecurring } from '../../core/bank.js';
import { scheduleEvent, findSlots, completeEvent, ensureCalendar } from '../../core/calendar.js';
import { CS, healthScore, churnMultFromHealth, usageProxy, renewalAcceptance, counterAsk, expansionAcceptance, questionnaireHours, ASK_LABEL, renewalCallScore, renewalTimingBonus, validateSuccessPlan, retentionTier } from './model.js';
import { registerOperatorReader, unknownRead, logMistake } from '../../core/operator.js';
import { ensureChurn } from '../../core/churn.js';
import { frtChurnMult } from '../support/model.js';
import { employeesOf } from '../sales/replies.js';
import { ensureCrm, contactById, companyById, contactName, addActivity, hasSoc2, hasDpa, dealById } from '../sales/model.js';
import { addInboundLead } from '../sales/crm-api.js';
import { isOpen } from '../sales/deals.js';
import { competitionFor, competitorOfferChance } from '../sales/competition.js';
import { gtmChurn, anchorMult } from '../sales/expand-model.js';
import { cappedUplift } from '../negotiate/consequences.js'; // negotiated renewal uplift cap

export function ensureSuccess(state) {
  const s = ensure(state, 'success', () => ({}));
  s.accounts ??= {};
  s.asks ??= [];
  s.qbrs ??= [];
  s.calls ??= []; // renewal negotiation calls
  s.library ??= false; // security questionnaire answer library
  s.vpat ??= null; // { day } once an ACR/VPAT exists
  s.euRegion ??= false;
  s.languages ??= [];
  s.log ??= [];
  return s;
}

const subsOf = (state) => ensureStripe(state).subscriptions;
const custOf = (state, id) => ensureStripe(state).customers.find((c) => c.id === id);
const live = (sub) => sub.status === 'active' || sub.status === 'past_due';
export const acvOf = (sub) => Math.round(monthlyAmount(sub) * 12);
export const subById = (state, id) => subsOf(state).find((s) => s.id === id);

function bugHours(state) {
  return (state.apps.product?.bugs ?? []).filter((b) => !b.fixedDay).reduce((a, b) => a + Math.max(0, (b.hours ?? 0) - (b.progress ?? 0)), 0);
}
// Support responsiveness: the Helpdesk's median first response once it owns support (People's aggregate model then
// reports a flat 1), else People's weekly model.
const supportMult = (state) => (state.apps.support?.active ? frtChurnMult(state.apps.support.metrics?.firstResponseHours ?? null) : state.apps.people?.support?.lastWeek?.churnMult ?? 1);

// Our per-account churn factor lives in sub.csChurnMult (core multiplies it with sub.churnMult).
function applyCsMult(sub, mult) {
  if (sub.csMult != null) { // older saves baked our factor into churnMult: take it back out once
    sub.churnMult = round2((sub.churnMult ?? 1) / sub.csMult);
    delete sub.csMult;
  }
  sub.csChurnMult = round2(mult);
}

/** Accounts = live subscriptions whose Stripe customer came from a CRM deal (crmCompanyId). */
export function syncAccounts(state) {
  const cs = ensureSuccess(state);
  const crm = ensureCrm(state);
  for (const sub of subsOf(state)) {
    if (!live(sub) || cs.accounts[sub.id]) continue;
    const cus = custOf(state, sub.customerId);
    if (!cus?.crmCompanyId) continue;
    const deal = crm.deals.find((d) => d.subscriptionId === sub.id) ?? crm.deals.find((d) => d.companyId === cus.crmCompanyId && d.stage === 'won');
    const contactId = deal?.contactId ?? crm.contacts.find((c) => c.companyId === cus.crmCompanyId)?.id ?? null;
    cs.accounts[sub.id] = {
      subId: sub.id, customerId: cus.id, companyId: cus.crmCompanyId, contactId, intl: cus.country !== 'US',
      champion: contactId ? 'active' : 'none', championLeftDay: null, createdDay: state.day, lastTouchDay: state.day,
      lastQbrDay: null, drift: 0, health: null, history: [], renewal: null, expansion: null, multiYearUntil: (sub.termYears ?? 1) > 1 ? (sub.currentPeriodEnd ?? state.day + 365) + 365 * (sub.termYears - 1) : null,
    };
  }
  return cs;
}

export function computeHealth(state, acct) {
  const sub = subById(state, acct.subId);
  const cs = ensureSuccess(state);
  const fit = ensureMarket(state).fit.product.score;
  const usage = usageProxy({ productFit: fit, bugHours: bugHours(state), seed: acct.subId, drift: acct.drift });
  const overdue = cs.asks.filter((a) => a.target === 'account' && a.refId === acct.subId && (a.status === 'declined' || (a.status === 'open' && a.dueDay < state.day))).length;
  const h = healthScore({
    usage, champion: acct.champion, qbrDaysAgo: acct.lastQbrDay == null ? null : state.day - acct.lastQbrDay,
    needsQbr: sub ? acvOf(sub) >= CS.qbrAboveAcv : false, support: supportMult(state), openAsks: overdue,
    touchDaysAgo: state.day - (acct.lastTouchDay ?? acct.createdDay), plan: planStatus(state, acct),
  });
  acct.usage = +usage.toFixed(2);
  acct.health = Math.min(100, Math.round(h + (acct.gtm?.healthBonus ?? 0))); // a covering CSM/AM lifts health (people/gtm-team.js)
  return acct.health;
}

function planStatus(state, acct) {
  const p = acct.plan;
  if (!p || !p.valid) return 'none';
  if (p.status === 'achieved') return 'achieved';
  if (p.status === 'missed') return 'missed';
  return 'on_track';
}

/** Write a success plan (metric + target + date) with the customer. Invalid (generic) plans count as none. */
export function setSuccessPlan(state, acct, { metric, target, dueDays }) {
  const v = validateSuccessPlan({ metric, target, dueDays: Number(dueDays) });
  acct.plan = { metric: String(metric).slice(0, 160), target: String(target).slice(0, 80), setDay: state.day, dueDay: state.day + Math.round(Number(dueDays) || 0), valid: v.valid, issues: v.issues, status: v.valid ? 'on_track' : 'invalid' };
  acct.lastTouchDay = state.day;
  if (v.valid) { acct.drift += 0.02; log(state, acct, `Success plan agreed: ${acct.plan.metric} → ${acct.plan.target} by day ${acct.plan.dueDay}`); }
  return acct.plan;
}

// At the plan's date the outcome is checked against the account's real usage (hidden state).
function planDay(state, acct) {
  const p = acct.plan;
  if (!p?.valid || p.status !== 'on_track' || state.day < p.dueDay) return;
  if ((acct.usage ?? 0) >= 0.5) { p.status = 'achieved'; acct.drift += 0.04; notify(state, `${companyById(state, acct.companyId)?.name}: success plan hit (${p.metric}). Put it in the renewal conversation.`, { type: 'good', app: 'success' }); }
  else { p.status = 'missed'; acct.drift -= 0.03; notify(state, `${companyById(state, acct.companyId)?.name}: success plan missed (${p.metric}). Find out why before the renewal does.`, { type: 'warn', app: 'success' }); }
}

/** Start the renewal conversation yourself (from T-150). Early starts with usage data renew more often. */
export function startRenewalEarly(state, acct) {
  const sub = subById(state, acct.subId);
  if (!sub || sub.interval !== 'year' || sub.currentPeriodEnd == null) throw new Error('Only annual contracts have a renewal to start.');
  const left = sub.currentPeriodEnd - state.day;
  if (left > 150) throw new Error('Too early: start 90–150 days before the renewal date.');
  if (acct.renewal && acct.renewal.periodEnd === sub.currentPeriodEnd) { acct.renewal.startedLeft ??= left; acct.lastTouchDay = state.day; return acct.renewal; }
  acct.renewal = { id: uid('rn'), periodEnd: sub.currentPeriodEnd, status: 'open', window: Math.min(90, left), terms: null, offers: [], counter: null, createdDay: state.day, startedLeft: left, early: true };
  acct.lastTouchDay = state.day;
  log(state, acct, `Renewal conversation started ${left} days out`);
  maybeCompetitorOffer(state, acct, acct.renewal);
  return acct.renewal;
}

function log(state, acct, text, type = 'note') {
  addActivity(state, { type, text, companyId: acct.companyId, contactId: acct.contactId });
}

// ---------------------------------------------------------------------------

export function successDay(state) {
  if (state.company.model === 'b2c') return;
  if (!state.apps.crm && !state.apps.success) return;
  const cs = syncAccounts(state);
  const accounts = Object.values(cs.accounts);
  if (!accounts.length && !cs.asks.length) return;
  for (const acct of accounts) {
    const sub = subById(state, acct.subId);
    if (!sub || !live(sub)) {
      if (!acct.closed) { acct.closed = true; acct.closedDay = state.day; if (acct.renewal && ['open', 'committed', 'at_risk'].includes(acct.renewal.status)) acct.renewal.status = 'churned'; }
      continue;
    }
    // Usage drifts slowly back toward its baseline; QBRs and fixes push it up, neglect down.
    acct.drift = clamp(acct.drift * 0.995 - (state.day - (acct.lastTouchDay ?? acct.createdDay) > 120 ? 0.0005 : 0), -0.25, 0.25);
    const h = computeHealth(state, acct);
    if (state.day % 7 === 0) { acct.history.push({ day: state.day, h }); if (acct.history.length > 104) acct.history.shift(); }
    // Churn-risk alert when an account crosses into "at risk".
    if (h < 45 && !acct.riskAlerted) {
      acct.riskAlerted = true;
      notify(state, `Churn risk: ${companyById(state, acct.companyId)?.name ?? 'an account'} health ${h}/100. Talk to them before the renewal decides itself.`, { type: 'warn', app: 'success' });
    } else if (h >= 55) acct.riskAlerted = false;

    championDay(state, acct);
    planDay(state, acct);
    renewalDay(state, acct, sub);
    expansionDay(state, acct, sub);
    askArrivals(state, acct);

    const r = acct.renewal;
    const committed = r && r.status === 'committed' && r.periodEnd === sub.currentPeriodEnd;
    const multiYear = acct.multiYearUntil != null && sub.currentPeriodEnd <= acct.multiYearUntil;
    applyCsMult(sub, committed || multiYear ? 0.02 : churnMultFromHealth(acct.health ?? h) * (r?.status === 'at_risk' ? 1.6 : 1) * gtmChurn(acct)); // gtmChurn: owner coverage, lost champion, ignored renewal, upsell before value, land fit (sales/expand-model.js)
  }
  companyAsks(state, cs);
  for (const a of cs.asks) if (a.status === 'open' && state.day > a.dueDay && !a.overdueNotified) {
    a.overdueNotified = true;
    notify(state, `${ASK_LABEL[a.kind]} for ${companyById(state, a.companyId)?.name ?? 'a buyer'} is overdue. It is hurting the ${a.target === 'deal' ? 'deal' : 'renewal'}.`, { type: 'warn', app: 'success' });
  }
  qbrDay(state, cs);
  callDay(state, cs);
}

function championDay(state, acct) {
  if (acct.champion !== 'active' && acct.champion !== 'weak') return;
  if (!chance(state, CS.championTurnoverPerYear / 365)) return;
  const ct = contactById(state, acct.contactId);
  const co = companyById(state, acct.companyId);
  acct.champion = 'left';
  acct.championLeftDay = state.day;
  acct.drift -= 0.05;
  notify(state, `${ct ? contactName(ct) : 'Your champion'} left ${co?.name ?? 'the account'}. Nobody there owns the tool now: find a new champion, and follow them to their new company.`, { type: 'bad', app: 'success' });
  log(state, acct, 'Champion left the company');
  if (ct) {
    const p = syntheticPerson(state);
    acct.formerChampion = { name: contactName(ct), newCompany: p.company, email: `${(ct.firstName || 'x').toLowerCase()}@${p.company.toLowerCase().replace(/[^a-z]/g, '')}.com`, followed: false };
  }
}

export function followChampion(state, acct) {
  const f = acct.formerChampion;
  if (!f || f.followed) return null;
  f.followed = true;
  return addInboundLead(state, { name: f.name, email: f.email, company: f.newCompany, title: 'Operations lead', source: 'referral', note: `Former champion at ${companyById(state, acct.companyId)?.name ?? 'a customer'}; just joined ${f.newCompany}.` });
}

export function findNewChampion(state, acct) {
  const ok = chance(state, 0.6);
  acct.lastTouchDay = state.day;
  if (ok) { acct.champion = 'weak'; log(state, acct, 'Found a new (still lukewarm) champion'); }
  return ok;
}

// ---- Renewals ----

function renewalDay(state, acct, sub) {
  if (sub.interval !== 'year' || sub.currentPeriodEnd == null) return;
  const left = sub.currentPeriodEnd - state.day;
  let r = acct.renewal;
  if (r && r.periodEnd !== sub.currentPeriodEnd && sub.currentPeriodEnd > r.periodEnd) {
    // The core billing engine renewed the subscription.
    r.status = r.status === 'committed' ? 'renewed' : 'auto-renewed';
    r.renewedDay = state.day;
    (acct.past ??= []).push(r);
    acct.renewal = null;
    r = null;
  }
  const multiYear = acct.multiYearUntil != null && sub.currentPeriodEnd <= acct.multiYearUntil;
  if (!r && left <= 90 && left > 0) {
    r = acct.renewal = { id: uid('rn'), periodEnd: sub.currentPeriodEnd, status: multiYear ? 'committed' : 'open', window: 90, terms: multiYear ? { upliftPct: 0, discountPct: 0, years: 1, multiYear: true } : null, offers: [], counter: null, createdDay: state.day };
    const co = companyById(state, acct.companyId);
    if (!multiYear) notify(state, `Renewal in 90 days: ${co?.name ?? 'an account'} (${'$' + acvOf(sub).toLocaleString('en-US')}/yr, health ${acct.health}). Plan the conversation now.`, { type: 'info', app: 'success' });
    if (!multiYear) maybeCompetitorOffer(state, acct, r);
    // Vendor re-assessment at renewal only for contracts big enough to warrant one (≥$15k ACV).
    if (acvOf(sub) >= 15000 && chance(state, CS.questionnaireAtRenewal)) addAsk(state, { kind: 'security_questionnaire', target: 'account', refId: acct.subId, companyId: acct.companyId, dueDay: sub.currentPeriodEnd - 21 });
  }
  if (!r) return;
  for (const w of [60, 30]) {
    if (left <= w && r.window > w) {
      r.window = w;
      if (r.status === 'open') notify(state, `Renewal in ${w} days and nothing agreed: ${companyById(state, acct.companyId)?.name}.`, { type: w === 30 ? 'warn' : 'info', app: 'success' });
    }
  }
  // Apply agreed terms the day before the period ends so the renewal invoice uses them.
  if (left <= 1) applyRenewalTerms(state, acct, sub);
}

// Agreed terms go onto the subscription before core billing renews it. Also called at commit time: a deal signed on
// the last day (after today's onDay ran) would otherwise renew at the old price and silently drop the uplift.
function applyRenewalTerms(state, acct, sub) {
  const r = acct.renewal;
  if (!r || r.status !== 'committed' || r.applied || !r.terms || !sub || r.periodEnd !== sub.currentPeriodEnd) return;
  r.applied = true;
  const f = (1 + (r.terms.upliftPct ?? 0)) * (1 - (r.terms.discountPct ?? 0));
  if (Math.abs(f - 1) > 0.001) changePrice(state, sub.id, { price: round2(sub.price * f) });
  if ((r.terms.years ?? 1) > 1) acct.multiYearUntil = sub.currentPeriodEnd + 365 * (r.terms.years - 1);
}
const applyIfDue = (state, acct) => { const sub = subById(state, acct.subId); if (sub && sub.currentPeriodEnd - state.day <= 1) applyRenewalTerms(state, acct, sub); };

// A real competitor the customer knows may pitch them a switching discount at renewal [design]:
// chance from that competitor's share, awareness, momentum and funding; discount 15–30%.
function maybeCompetitorOffer(state, acct, r) {
  const comp = competitionFor(state, { audience: 'customer', seed: acct.subId });
  const cands = comp.known.map((k) => k.competitor).filter((c) => !c.statusQuo).sort((a, b) => competitorOfferChance(b) - competitorOfferChance(a));
  const c = cands[0];
  if (!c || !chance(state, competitorOfferChance(c))) return;
  r.competitorOffer = { name: c.name, discountPct: +(0.15 + 0.15 * rng(state)).toFixed(2), day: state.day };
  notify(state, `${companyById(state, acct.companyId)?.name}: ${c.name} is pitching them ${Math.round(r.competitorOffer.discountPct * 100)}% off to switch at renewal.`, { type: 'warn', app: 'success' });
  log(state, acct, `${c.name} offered them ${Math.round(r.competitorOffer.discountPct * 100)}% off to switch`);
}

/** Put renewal terms to the customer (email quote or on a call). Returns { decision, p, counter }. */
export function proposeRenewal(state, acct, { upliftPct = 0, discountPct = 0, years = 1, viaCall = false, transcript = null }) {
  const sub = subById(state, acct.subId);
  const r = acct.renewal;
  if (!r || !['open', 'at_risk'].includes(r.status)) throw new Error('No open renewal for this account.');
  const up = cappedUplift(sub, upliftPct); // a negotiated renewal uplift cap limits the increase (negotiate/consequences.js)
  if (up.capped) { upliftPct = up.upliftPct; log(state, acct, `Uplift limited to the ${Math.round(up.cap * 100)}% cap in the contract`); }
  const health = acct.health ?? computeHealth(state, acct);
  const switching = clamp(0.3 + (state.day - acct.createdDay) / 730, 0.3, 0.9); // longer tenure → harder to switch
  const holdingFirm = r.offers.length > 0;
  const callScore = viaCall && transcript ? renewalCallScore(transcript) : 0;
  r.startedLeft ??= sub.currentPeriodEnd - state.day; // when YOU first engaged on this renewal
  let p = renewalAcceptance({ upliftPct, discountPct, years, health, switchingCost: switching, callScore }) * (viaCall ? 1 : 0.9) * (holdingFirm ? 0.75 : 1);
  p = clamp(p + renewalTimingBonus(r.startedLeft), 0.03, 0.95);
  if (state.company.model === 'ent' && !hasDpa(state)) p *= 0.9;
  p = clamp(p * anchorMult(acct.land?.discountPct ?? 0, upliftPct) + (acct.gtm?.renewalBonus ?? 0), 0.03, 0.95); // an over-discounted land refuses uplifts; an owner lifts odds
  // A live competitor offer: terms with no real concession lose some customers to it.
  if (r.competitorOffer && discountPct - upliftPct < r.competitorOffer.discountPct / 2) p *= 0.8;
  const roll = rng(state);
  const offer = { upliftPct, discountPct, years, day: state.day, p: +p.toFixed(2), viaCall };
  r.offers.push(offer);
  r.counter = null; // a new proposal replaces any earlier counter-offer
  acct.lastTouchDay = state.day;
  if (roll < p) {
    r.status = 'committed';
    r.terms = { upliftPct, discountPct, years };
    offer.decision = 'accept';
    applyIfDue(state, acct);
    log(state, acct, `Renewal agreed: ${fmtTerms(r.terms)}`);
    notify(state, `Renewal signed: ${companyById(state, acct.companyId)?.name} (${fmtTerms(r.terms)}).`, { type: 'good', app: 'success' });
  } else if (!holdingFirm && roll < p + (1 - p) * 0.75) {
    r.counter = counterAsk({ upliftPct, health, seed: `${acct.subId}${r.periodEnd}` });
    if (r.competitorOffer) r.counter = { upliftPct: 0, discountPct: Math.max(r.counter.discountPct, +(r.competitorOffer.discountPct * 0.75).toFixed(2)), text: `get close to ${r.competitorOffer.name}'s offer` };
    r.counter.years = years;
    offer.decision = 'counter';
  } else {
    offer.decision = 'walk';
    r.status = 'at_risk';
    if (health < 40 || (holdingFirm && chance(state, 0.4))) {
      r.status = 'lost';
      cancel(state, sub.id, { atPeriodEnd: true, reason: 'renewal_declined' });
      if ((r.startedLeft ?? 0) < 30) logMistake(state, { functionId: 'customer_success', id: 'late_renewal', label: 'Renewal started too late', cost: { customers: 1, usd: Math.round(acvOf(sub)) }, delayed: true, detail: `First renewal conversation ${r.startedLeft ?? 0} days before the date; stellar operators start 90-120 days out with usage data.`, app: 'success' });
      notify(state, `${companyById(state, acct.companyId)?.name} will not renew. They're evaluating alternatives.`, { type: 'bad', app: 'success' });
    }
  }
  return { decision: offer.decision, p, counter: r.counter };
}

export function acceptCounter(state, acct) {
  const r = acct.renewal;
  if (!r?.counter || !['open', 'at_risk'].includes(r.status)) throw new Error('No counter-offer on the table.');
  r.status = 'committed';
  r.terms = { upliftPct: r.counter.upliftPct, discountPct: r.counter.discountPct, years: r.counter.years ?? 1 };
  r.counter = null;
  acct.lastTouchDay = state.day;
  applyIfDue(state, acct);
  log(state, acct, `Renewal agreed on their terms: ${fmtTerms(r.terms)}`);
}

export const fmtTerms = (t) => `${t.upliftPct ? `+${Math.round(t.upliftPct * 100)}% uplift` : 'flat price'}${t.discountPct ? `, −${Math.round(t.discountPct * 100)}% discount` : ''}${(t.years ?? 1) > 1 ? `, ${t.years}-year term` : ''}`;

// ---- Expansion ----

// Real seat need only: headcount above seats, at most one opportunity per 6 months, shrinking as they fill up.
export function seatRoom(state, acct, sub) {
  const emp = employeesOf(companyById(state, acct.companyId) ?? {}, state.company.model === 'ent' ? 'ent' : 'smb');
  return { employees: emp, room: Math.max(0, emp - (sub.quantity ?? 1)) };
}
function openExpansion(state, acct, sub, reason) {
  const { employees, room } = seatRoom(state, acct, sub);
  if (room < 1 || (acct.lastExpansionDay != null && state.day - acct.lastExpansionDay < 180)) return false;
  const q = sub.quantity ?? 1;
  const seats = Math.min(room, Math.max(1, Math.ceil(q * (0.1 + 0.2 * rng(state)))));
  acct.expansion = { status: 'open', seats, createdDay: state.day, reason };
  acct.lastExpansionDay = state.day;
  void employees;
  return true;
}
function expansionDay(state, acct, sub) {
  if (acct.expansion?.status === 'open' || (acct.health ?? 0) < 65 || (acct.usage ?? 0) < 0.55) return;
  const { employees, room } = seatRoom(state, acct, sub);
  const need = room / Math.max(1, employees); // diminishing returns as seats approach headcount
  const p = CS.expansionChancePerMonth[state.company.model === 'ent' ? 'ent' : 'smb'] / 30 * Math.min(1, need * 2);
  if (!chance(state, p)) return;
  if (openExpansion(state, acct, sub, state.company.model === 'ent' ? 'another team wants access' : 'they hired and want logins for new staff')) {
    notify(state, `Expansion signal: ${companyById(state, acct.companyId)?.name} — ${acct.expansion.reason}.`, { type: 'good', app: 'success' });
  }
}

export function pitchExpansion(state, acct, seatsAdded) {
  const sub = subById(state, acct.subId);
  const opp = acct.expansion?.status === 'open';
  const p = expansionAcceptance({ health: acct.health ?? 60, hasOpportunity: opp, seatsAdded, seats: sub.quantity ?? 1, employees: seatRoom(state, acct, sub).employees });
  acct.lastTouchDay = state.day;
  const ok = chance(state, p);
  if (ok) {
    changePrice(state, sub.id, { quantity: (sub.quantity ?? 1) + seatsAdded });
    log(state, acct, `Expanded by ${seatsAdded} seat(s)`);
  } else if (!opp) acct.drift -= 0.02; // pushy upsell without a need
  if (acct.expansion) acct.expansion.status = ok ? 'won' : 'lost';
  return { ok, p };
}

// ---- Procurement asks ----

export function addAsk(state, { kind, target, refId, companyId, dueDay }) {
  const cs = ensureSuccess(state);
  if (cs.asks.some((a) => a.kind === kind && a.refId === refId && a.status === 'open')) return null;
  const hours = kind === 'security_questionnaire' ? questionnaireHours({ soc2: hasSoc2(state), library: cs.library, seed: refId })
    : kind === 'vpat' ? (cs.vpat ? 0.25 : Math.round(CS.a11yRemediationHours[0] + (CS.a11yRemediationHours[1] - CS.a11yRemediationHours[0]) * (parseInt(hash(refId), 36) % 100) / 100))
      : kind === 'data_residency' ? (cs.euRegion ? 0.25 : CS.euRegionHours)
        : Math.round(CS.translationHours[0] + (CS.translationHours[1] - CS.translationHours[0]) * 0.5);
  const a = { id: uid('ask'), kind, target, refId, companyId, createdDay: state.day, dueDay: dueDay ?? state.day + 30, status: 'open', hours, progress: 0 };
  if (kind === 'localization') a.language = ['German', 'French', 'Spanish', 'Japanese', 'Portuguese'][parseInt(hash(companyId ?? refId), 36) % 5];
  cs.asks.push(a);
  addActivity(state, { type: 'note', text: `Procurement ask: ${ASK_LABEL[a.kind]}${a.language ? ` (${a.language})` : ''}`, companyId, dealId: target === 'deal' ? refId : null });
  notify(state, `${companyById(state, companyId)?.name ?? 'A buyer'} asks for: ${ASK_LABEL[kind]}${a.language ? ` (${a.language})` : ''}. ~${hours}h of work.`, { type: 'info', app: 'success' });
  return a;
}

function askArrivals(state, acct) {
  if (!acct.intl) return;
  const ent = state.company.model === 'ent';
  if (ent && chance(state, CS.residencyRequestsPerYear / 365)) addAsk(state, { kind: 'data_residency', target: 'account', refId: acct.subId, companyId: acct.companyId, dueDay: state.day + 60 });
  if (chance(state, CS.localizationRequestsPerYear / 365)) {
    const lang = ['German', 'French', 'Spanish', 'Japanese', 'Portuguese'][parseInt(hash(acct.companyId), 36) % 5];
    if (!ensureSuccess(state).languages.includes(lang)) addAsk(state, { kind: 'localization', target: 'account', refId: acct.subId, companyId: acct.companyId, dueDay: state.day + 90 });
  }
}

// Company-level asks: VPAT/ACR requests once selling up-market (0.5–2/yr), attached to an open enterprise deal or account.
function companyAsks(state, cs) {
  const crm = ensureCrm(state);
  const upmarket = state.company.model === 'ent' || Object.values(cs.accounts).some((a) => { const s = subById(state, a.subId); return s && live(s) && acvOf(s) >= CS.qbrAboveAcv; });
  if (!upmarket) return;
  const rate = (CS.a11yRequestsPerYear[0] + CS.a11yRequestsPerYear[1]) / 2 / 365;
  if (poisson(state, rate) < 1) return;
  const deals = crm.deals.filter((d) => isOpen(d) && ['qualified', 'proposal'].includes(d.stage) && !d.paperwork); // segment deals carry their own paperwork list
  const accts = Object.values(cs.accounts).filter((a) => !a.closed);
  if (deals.length && (chance(state, 0.6) || !accts.length)) {
    const d = deals[Math.floor(rng(state) * deals.length)];
    addAsk(state, { kind: 'vpat', target: 'deal', refId: d.id, companyId: d.companyId, dueDay: state.day + 30 });
  } else if (accts.length) {
    const a = accts[Math.floor(rng(state) * accts.length)];
    addAsk(state, { kind: 'vpat', target: 'account', refId: a.subId, companyId: a.companyId, dueDay: state.day + 45 });
  }
}

/** Work on an ask for up to `hours`. Completes it (and builds reusable assets) when done. */
export function workOnAsk(state, ask, hours) {
  const cs = ensureSuccess(state);
  if (ask.status !== 'open') return false; // stale UI / automation: a delivered or declined ask takes no more work
  // One audit covers the product: two VPAT asks open at once must not each buy it.
  if (ask.kind === 'vpat' && !cs.vpat && cs.vpatAuditPaidDay == null && hours > 0 && !cs.asks.some((o) => o.kind === 'vpat' && o.progress > 0)) { post(state, { amount: -CS.vpatAuditCost, counterparty: 'Accessibility auditor', description: 'WCAG 2.1 AA audit + ACR (VPAT)', category: 'contractors', method: 'card' }); cs.vpatAuditPaidDay = state.day; }
  ask.progress = round2(ask.progress + hours);
  if (ask.progress + 1e-9 < ask.hours) return false;
  ask.status = 'done';
  ask.doneDay = state.day;
  if (ask.kind === 'security_questionnaire') {
    cs.library = true;
    const deal = ask.target === 'deal' ? dealById(state, ask.refId) : null;
    if (deal?.security && deal.security.status === 'requested') deal.security.status = 'questionnaire';
  }
  if (ask.kind === 'vpat') cs.vpat ??= { day: state.day };
  if (ask.kind === 'data_residency' && !cs.euRegion) {
    cs.euRegion = true;
    addRecurring(state, { vendor: 'Cloud hosting (EU region)', amount: CS.euRegionMonthly, category: 'hosting', dayOfMonth: 8, note: 'EU data residency' });
  }
  if (ask.kind === 'localization' && ask.language && !cs.languages.includes(ask.language)) cs.languages.push(ask.language);
  // Other open asks of the same kind become cheap now that the asset exists.
  for (const o of cs.asks) if (o.status === 'open' && o.kind === ask.kind && o.id !== ask.id && (ask.kind !== 'localization' || o.language === ask.language)) o.hours = Math.min(o.hours, ask.kind === 'security_questionnaire' ? questionnaireHours({ soc2: hasSoc2(state), library: true, seed: o.refId }) : 0.25);
  const acct = ask.target === 'account' ? cs.accounts[ask.refId] : null;
  if (acct) { acct.lastTouchDay = state.day; acct.drift += 0.02; }
  addActivity(state, { type: 'note', text: `Delivered: ${ASK_LABEL[ask.kind]}`, companyId: ask.companyId, dealId: ask.target === 'deal' ? ask.refId : null });
  return true;
}

export function declineAsk(state, ask) {
  ask.status = 'declined';
  ask.doneDay = state.day;
  addActivity(state, { type: 'note', text: `Declined: ${ASK_LABEL[ask.kind]}`, companyId: ask.companyId, dealId: ask.target === 'deal' ? ask.refId : null });
}

// ---- QBRs & renewal calls on the calendar ----

export function scheduleQbr(state, acct) {
  const cs = ensureSuccess(state);
  const slot = findSlots(state, { fromDay: state.day + 3, duration: 60, count: 1 })[0];
  if (!slot) throw new Error('No free hour on your calendar in the next 30 days.');
  const co = companyById(state, acct.companyId);
  const ct = contactById(state, acct.contactId);
  const q = { id: uid('qbr'), subId: acct.subId, companyId: acct.companyId, day: slot.day, start: slot.start, status: 'scheduled', prepped: false, eventId: null };
  const ev = scheduleEvent(state, { title: `QBR: ${co?.name ?? 'customer'}`, kind: 'meeting', app: 'success', refId: q.id, with: ct ? { name: contactName(ct), email: ct.email } : null, day: slot.day, start: slot.start, duration: 60, location: 'Zoom', notes: 'Quarterly business review' });
  q.eventId = ev.id;
  cs.qbrs.push(q);
  return q;
}

export function scheduleRenewalCall(state, acct) {
  const cs = ensureSuccess(state);
  const slot = findSlots(state, { fromDay: state.day + 2, duration: 45, count: 1 })[0];
  if (!slot) throw new Error('No free slot on your calendar in the next 30 days.');
  const ct = contactById(state, acct.contactId);
  const c = { id: uid('rnc'), subId: acct.subId, companyId: acct.companyId, day: slot.day, start: slot.start, status: 'scheduled', transcript: [], eventId: null };
  const rsub = subById(state, acct.subId);
  if (acct.renewal && rsub?.currentPeriodEnd != null) acct.renewal.startedLeft ??= rsub.currentPeriodEnd - state.day;
  const ev = scheduleEvent(state, { title: `Renewal call: ${companyById(state, acct.companyId)?.name ?? 'customer'}`, kind: 'call', app: 'success', refId: c.id, with: ct ? { name: contactName(ct), email: ct.email } : null, day: slot.day, start: slot.start, duration: 45, location: 'Zoom' });
  c.eventId = ev.id;
  cs.calls.push(c);
  return c;
}

const evOf = (state, id) => ensureCalendar(state).events.find((e) => e.id === id);

/** Run a QBR. agenda: { roi, roadmap, expansion, exec } booleans. */
export function runQbr(state, q, agenda = {}) {
  const cs = ensureSuccess(state);
  const acct = cs.accounts[q.subId];
  q.status = 'held';
  q.agenda = agenda;
  const ev = evOf(state, q.eventId);
  if (ev) completeEvent(state, ev.id, 'done', 'QBR held');
  if (!acct) return { notes: [] };
  const notes = [];
  acct.lastQbrDay = state.day;
  acct.lastTouchDay = state.day;
  acct.drift += q.prepped ? 0.06 : 0.02;
  if (!q.prepped) notes.push('You winged it: no usage data or ROI numbers. They noticed.');
  if (agenda.roi && q.prepped) { acct.drift += 0.03; notes.push('ROI review landed: they can defend the spend internally.'); }
  if (agenda.exec) {
    if (chance(state, 0.3 * (acct.health ?? 50) / 100)) { if (acct.champion === 'weak' || acct.champion === 'none') acct.champion = 'active'; acct.execSponsor = true; acct.threads = Math.max(acct.threads ?? 1, acct.map?.threads ?? 1) + 1; if (acct.map) { acct.map.execSponsor = true; acct.map.threads = acct.threads; } notes.push('Their exec sponsor joined: the relationship is multi-threaded now.'); }
    else notes.push('You invited their exec; they sent apologies. Execs show up when the account matters to them.');
  }
  if (agenda.roadmap) notes.push('They shared what they need next; check Customers → feedback.');
  if (agenda.expansion) {
    acct.qbrExpansionAsk = state.day;
    const sub = subById(state, acct.subId);
    if (sub && (acct.usage ?? 0) >= 0.5 && acct.expansion?.status !== 'open' && chance(state, 0.35) && openExpansion(state, acct, sub, 'raised in the QBR')) notes.push(`They want ${acct.expansion.seats} more seat(s). Expansion opportunity opened.`);
    else notes.push('No expansion need right now; asking too early can feel pushy.');
  }
  addActivity(state, { type: 'meeting', text: `QBR held${q.prepped ? '' : ' (unprepared)'}`, companyId: acct.companyId, contactId: acct.contactId });
  q.notes = notes;
  return { notes };
}

function qbrDay(state, cs) {
  for (const q of cs.qbrs) {
    if (q.status !== 'scheduled') continue;
    const ev = evOf(state, q.eventId);
    if (ev && ['unattended', 'missed'].includes(ev.status)) {
      q.status = 'missed';
      const acct = cs.accounts[q.subId];
      if (acct) { acct.drift -= 0.06; if (acct.champion === 'active') acct.champion = 'weak'; }
      notify(state, `You missed the QBR with ${companyById(state, q.companyId)?.name}. They noticed.`, { type: 'bad', app: 'success' });
    }
  }
}

function callDay(state, cs) {
  for (const c of cs.calls) {
    if (c.status === 'in_call' && c.day < state.day) { c.status = 'held'; const ev = evOf(state, c.eventId); if (ev) completeEvent(state, ev.id, 'done'); continue; }
    if (c.status !== 'scheduled') continue;
    const ev = evOf(state, c.eventId);
    if (ev && ['unattended', 'missed'].includes(ev.status)) {
      c.status = 'missed';
      const acct = cs.accounts[c.subId];
      if (acct) { acct.drift -= 0.05; if (acct.renewal?.status === 'open') acct.renewal.status = 'at_risk'; }
      notify(state, `You missed the renewal call with ${companyById(state, c.companyId)?.name}. Procurement noticed.`, { type: 'bad', app: 'success' });
    }
  }
}

// ---- New-deal odds (read by the CRM decision engine) ----

/** Multiplier on a CRM deal's close probability from unresolved procurement asks. */
export { askPenalty } from './asks.js';

// ---- Retention read-out (NRR / GRR) and the operator read ----

/** Gross and net revenue retention of CRM accounts over the trailing window (from Stripe MRR events). */
export function retentionStats(state, windowDays = 365) {
  const cs = ensureSuccess(state);
  const st = ensureStripe(state);
  const t0 = state.day - Math.min(windowDays, state.day);
  const ids = new Set(Object.keys(cs.accounts));
  const at = new Map();
  for (const e of st.events) {
    if (!ids.has(e.subId)) continue;
    const x = at.get(e.subId) ?? { start: 0, end: 0 };
    if (e.day <= t0) x.start += e.amount;
    x.end += e.amount;
    at.set(e.subId, x);
  }
  let start = 0, loss = 0, end = 0, n = 0;
  for (const x of at.values()) {
    if (x.start <= 0.5) continue; // cohort = accounts paying at the start of the window
    n++;
    start += x.start;
    end += Math.max(0, x.end);
    loss += Math.min(0, Math.max(0, x.end) - x.start);
  }
  if (!n || start <= 0) return { n: 0, windowDays: state.day - t0, grr: null, nrr: null, tier: 'unknown' };
  const grr = (start + loss) / start;
  return { n, windowDays: state.day - t0, grr, nrr: end / start, startMrr: start, endMrr: end, tier: retentionTier(grr) };
}

registerOperatorReader('customer_success', (state) => {
  if (state.company.model === 'b2c' || !state.apps.success) return unknownRead();
  const cs = ensureSuccess(state);
  const r = retentionStats(state);
  if (r.n < 3 || r.windowDays < 120) return unknownRead(['Retention is read once at least three accounts have been with you for four months.']);
  const accts = Object.values(cs.accounts);
  const renewals = accts.flatMap((a) => [...(a.past ?? []), ...(a.renewal ? [a.renewal] : [])]).filter((x) => x.startedLeft != null);
  const avgStart = renewals.length ? renewals.reduce((a, x) => a + x.startedLeft, 0) / renewals.length : null;
  const planned = accts.filter((a) => a.plan?.valid).length;
  const ch = ensureChurn(state);
  let tier = r.tier;
  if (avgStart != null && avgStart < 30 && ['stellar', 'good'].includes(tier)) tier = 'average';
  const coaching = [];
  if (avgStart == null || avgStart < 90) coaching.push('Start renewal conversations 90-120 days out with usage data, not a price negotiation the week before.');
  if (planned < accts.length / 2) coaching.push('Agree a success metric (number + date) in writing in the first 30 days.');
  if (ch.missed) coaching.push('Track usage, champion status and economic-buyer contact: act on churn signals within a week.');
  if (ch.saves.wasted) coaching.push('You offered a discount before they asked. Ask what outcome they are not getting yet.');
  return { tier, score: r.grr, n: r.n, evidence: [`GRR ${Math.round(r.grr * 100)}%, NRR ${Math.round(r.nrr * 100)}% over ${r.windowDays} days (${r.n} accounts; stellar GRR 92-95%, mediocre 75-84%)`, avgStart != null ? `Renewal conversations started on average ${Math.round(avgStart)} days before the date` : 'No renewal conversations started yet', `${planned}/${accts.length} accounts have a valid success plan`, `${ch.missed} churn signals ignored, ${ch.saves.wasted} wasted save attempts`], coaching };
});
