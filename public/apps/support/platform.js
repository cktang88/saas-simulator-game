// Support platform state: choosing, switching, enterprise demos and contracts, daily fit, monthly bill.
// Pure vendor data and math: support/vendors.js. The Helpdesk (apps/helpdesk.js) calls these.
//
// State: state.apps.support.vendor = { id, sinceDay, legacy, seatPolicy, contractEndDay, unit, demos, enterprise,
//   today: { mix, fit, handlingMult, churnMult }, month: { extraHours, adminHours, credits, creditsOut }, history }
// Old saves: an agent that was ever set up was Intercom Fin (the only option before), billed as before (no seats).

import { rng, round2, money, dayOfWeek } from '../../core/util.js';
import { post } from '../../core/bank.js';
import { activeSubs, monthlyAmount } from '../../core/stripe.js';
import { logSupportMistake } from './operator.js';
import { VENDORS, CHOOSABLE, ENTERPRISE, ENTERPRISE_DEMO_HOURS, SWITCH_HOURS, vendorOf, channelMix, channelFit, handlingMult, churnMult, seatsFor, engineerAssist, aiBill, qualifiesEnterprise, estimateMonth, vendorFit, MIX } from './vendors.js';
import { MINUTES_PER_TICKET } from './model.js';

const humans = (state) => (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.status === 'active' && (m.startDay ?? 0) <= state.day);

export function ensureVendor(sup) {
  const ai = sup.ai ?? {};
  sup.vendor ??= { id: ai.status && ai.status !== 'off' ? 'intercom' : ai.liveDay != null ? 'intercom' : 'inbox', legacy: true, sinceDay: null };
  const v = sup.vendor;
  v.seatPolicy ??= 'support_only'; v.contractEndDay ??= null; v.unit ??= null; v.demos ??= {}; v.enterprise ??= null;
  v.month ??= { extraHours: 0, adminHours: 0, credits: 0, creditsOut: 0 }; v.history ??= []; v.lockinFees ??= 0;
  if (!VENDORS[v.id] || VENDORS[v.id].status === 'retired') v.id = 'inbox';
  // Never chosen explicitly and an agent was set up (old toggle, People hire): that agent was Intercom Fin.
  if (v.legacy && v.id === 'inbox' && ((ai.status && ai.status !== 'off') || ai.viaPeople)) v.id = 'intercom';
  return v;
}

// Accounts as the vendor model sees them. bigLine: the Slack Connect MRR line (Helpdesk SLACK.enterpriseMrr).
export function accountsFor(state, bigLine = 500) {
  const consumer = state.company.model === 'b2c';
  return activeSubs(state).map((s) => ({ consumer, big: !consumer && (state.company.model === 'ent' || monthlyAmount(s) >= bigLine), mrr: monthlyAmount(s) }));
}

// Profile for estimateMonth from the live state.
export function profileFor(state, sup) {
  const accts = accountsFor(state);
  const convos = (sup.daily ?? []).filter((d) => d.day > state.day - 30).reduce((a, d) => a + d.new, 0);
  const team = humans(state);
  const supportHumans = 1 + team.filter((m) => m.role === 'support').length;
  const mrr = accts.reduce((a, x) => a + x.mrr, 0);
  return {
    mix: channelMix(accts), convos, aiShare: 0.6, trueRate: 0.45, supportHours: (convos * (MINUTES_PER_TICKET[state.company.model] ?? 15)) / 60,
    supportHumans, otherHumans: team.length - (supportHumans - 1), seatPolicy: sup.vendor?.seatPolicy ?? 'support_only', mrr, arr: mrr * 12,
    b2b: state.company.model !== 'b2c', usefulMacros: sup.macros?.length ?? 0, convosPerMonth: convos,
  };
}

// Can the AI agent run on the current platform today?
export function agentAvailable(state, sup) {
  const v = ensureVendor(sup);
  const def = vendorOf(v.id);
  if (!def.ai) return false;
  if (def.status === 'enterprise') return Boolean(v.enterprise && v.enterprise.id === v.id && state.day >= v.enterprise.liveDay);
  return true;
}

// Switch platforms (self-serve options). Returns { hours, fee }. Hours are charged by the caller (ctx.act).
export function switchHours(sup, id) {
  const v = ensureVendor(sup);
  if (id === v.id) return 0;
  const migrate = v.id === 'inbox' && !sup.articles?.length ? 0 : SWITCH_HOURS.base + SWITCH_HOURS.perArticle * (sup.articles?.length ?? 0) + SWITCH_HOURS.perMacro * (sup.macros?.length ?? 0);
  return round2(vendorOf(id).setupHours + migrate);
}

export function chooseVendor(state, sup, id) {
  const def = VENDORS[id];
  if (!def) throw new Error('Unknown support platform.');
  if (def.status === 'retired') throw new Error(def.note);
  if (def.status === 'enterprise') throw new Error(`${def.label} is sales-led: request a demo first.`);
  const v = ensureVendor(sup);
  if (id === v.id && !v.legacy) return { hours: 0, fee: 0 };
  const hours = switchHours(sup, id);
  const fee = leaveContract(state, sup);
  v.history.unshift({ day: state.day, from: v.id, to: id, hours, fee });
  v.id = id; v.legacy = false; v.sinceDay = state.day;
  v.contractEndDay = def.annual ? state.day + 365 : null;
  v.unit = def.ai?.unitRange ? round2(def.ai.unitRange[0] + (def.ai.unitRange[1] - def.ai.unitRange[0]) * rng(state)) : null; // contract-quoted per run [design]
  // Procedures, tests and the live agent do not port between platforms: re-build, re-test, re-launch.
  const ai = sup.ai;
  if (ai) {
    ai.testedHash = null;
    for (const p of ai.procedures ?? []) { p.simPassed = false; p.sim = null; }
    if (ai.status === 'live' && !ai.viaPeople) ai.status = def.ai ? 'paused' : 'off';
    if (!def.ai && ai.status !== 'off') ai.status = 'off';
  }
  if (id === 'plain') for (const k of Object.keys(sup.channels ?? {}).slice(def.channelCap)) delete sup.channels[k];
  return { hours, fee };
}

// Leaving an annual contract early: the rest of the term is still owed (seat minimum × months left).
function leaveContract(state, sup) {
  const v = sup.vendor;
  const def = vendorOf(v.id);
  let fee = 0;
  if (def.status === 'enterprise' && v.enterprise?.id === v.id) {
    const unpaid = Math.max(0, v.enterprise.endDay - Math.max(state.day, v.enterprise.prepaidUntil));
    fee = round2(Math.ceil(unpaid / 90) * (v.enterprise.acv / 4)); // quarters not yet prepaid are still owed
    v.enterprise = null;
  } else if (def.annual && v.contractEndDay != null && v.contractEndDay > state.day && !v.legacy) {
    const months = Math.ceil((v.contractEndDay - state.day) / 30);
    fee = round2(months * def.seat * Math.max(def.seatMin, 1));
  }
  if (fee > 0) {
    post(state, { amount: -fee, counterparty: def.short, description: `${def.short}: rest of the annual contract after switching away`, category: 'software', method: 'card' });
    v.lockinFees += fee;
    logSupportMistake(state, { trap: 'vendor_lockin_fee', estCost: fee, text: `Left ${def.label} before the annual term ended and still owed ${money(fee)}. Pick the platform that fits your customers before signing an annual contract, or start monthly.` });
  }
  return fee;
}

// Enterprise sales path. A demo costs hours; below the gate the vendor quotes its minimum anyway.
export function requestDemo(state, sup, id) {
  const def = VENDORS[id];
  if (def?.status !== 'enterprise') throw new Error('Only the enterprise vendors are sales-led.');
  const v = ensureVendor(sup);
  const p = profileFor(state, sup);
  const qualified = qualifiesEnterprise(p);
  v.demos[id] = { day: state.day, qualified, acv: def.contract.acv, arr: round2(p.arr), convos: p.convos };
  if (!qualified) logSupportMistake(state, { trap: 'enterprise_demo_unqualified', key: `demo:${id}`, hours: ENTERPRISE_DEMO_HOURS, text: `Spent ${ENTERPRISE_DEMO_HOURS} h in ${def.label} sales calls at ${money(p.arr)} ARR and ~${p.convos} conversations a month. Their minimum is ${money(def.contract.acv)}/yr; a self-serve agent covers this volume.` });
  return v.demos[id];
}

export function signEnterprise(state, sup, id) {
  const def = VENDORS[id];
  const v = ensureVendor(sup);
  const demo = v.demos[id];
  if (!demo) throw new Error('Take the demo call first.');
  const p = profileFor(state, sup);
  const fee = leaveContract(state, sup);
  const acv = def.contract.acv;
  v.history.unshift({ day: state.day, from: v.id, to: id, hours: def.setupHours, fee });
  v.id = id; v.legacy = false; v.sinceDay = state.day; v.contractEndDay = state.day + 365;
  v.enterprise = { id, signedDay: state.day, liveDay: state.day + def.contract.implDays, endDay: state.day + 365, acv, prepaidUntil: state.day + 90, implHoursLeft: def.contract.implHours };
  post(state, { amount: -acv / 4, counterparty: def.short, description: `${def.short} annual contract: first quarter in advance`, category: 'software', method: 'ach' });
  if (sup.ai) { sup.ai.testedHash = null; if (sup.ai.status === 'live' && !sup.ai.viaPeople) sup.ai.status = 'paused'; }
  if (!qualifiesEnterprise(p)) {
    const fin = estimateMonth('intercom', p);
    const over = round2(acv - fin.bill * 12);
    v.enterprise.overbuy = true;
    logSupportMistake(state, { trap: 'enterprise_overbuy', estCost: over, text: `Signed ${def.label} at ${money(acv)}/yr with ~${p.convos} conversations a month. A self-serve agent would bill ~${money(fin.bill * 12)}/yr for the same volume: ~${money(over)} overpaid, plus ${def.contract.implHours} h of implementation before it answers anything.` });
  }
  return v.enterprise;
}

// Daily: today's channel mix and fit, admin and implementation hours on Mondays, contract renewals.
// chargeFounder(hours, label) is the Helpdesk's founder-time charger.
export function vendorDay(state, sup, { chargeFounder, usefulMacros = 0, bigLine = 500 }) {
  const v = ensureVendor(sup);
  const def = vendorOf(v.id);
  const accts = accountsFor(state, bigLine);
  const mix = channelMix(accts);
  const team = humans(state);
  const other = team.filter((m) => m.role !== 'support').length;
  const ea = engineerAssist(v.id, v.seatPolicy, other);
  v.today = { mix, fit: channelFit(v.id, mix), handlingMult: accts.length ? handlingMult(v.id, mix, { usefulMacros, b2b: state.company.model !== 'b2c', engineerAssist: ea }) : 1, churnMult: accts.length ? churnMult(v.id, mix) : 1, day: state.day };
  if (dayOfWeek(state) === 1) {
    if (def.adminHours) v.month.adminHours += chargeFounder(def.adminHours, `Support platform admin (${def.short})`);
    const e = v.enterprise;
    if (e && e.id === v.id && state.day < e.liveDay && e.implHoursLeft > 0) {
      const weeks = Math.max(1, Math.ceil((e.liveDay - state.day) / 7));
      const h = round2(e.implHoursLeft / weeks);
      e.implHoursLeft = round2(e.implHoursLeft - chargeFounder(h, `${def.short} implementation`));
    }
  }
  const e = v.enterprise;
  if (e && e.id === v.id && state.day >= e.prepaidUntil && state.day < e.endDay) {
    post(state, { amount: -e.acv / 4, counterparty: def.short, description: `${def.short} annual contract: quarter in advance`, category: 'software', method: 'ach' });
    e.prepaidUntil += 90;
  }
  if (e && e.id === v.id && state.day >= e.endDay) { e.endDay += 365; e.prepaidUntil = state.day; v.contractEndDay = e.endDay; } // auto-renews [design]
  if (def.annual && !def.contract && v.contractEndDay != null && state.day >= v.contractEndDay) v.contractEndDay += 365; // auto-renews
  return v.today;
}

// Credits-allowance platforms (Plain): the agent stops when the month's credits are used. true = may answer.
export function spendCredit(sup) {
  const v = sup.vendor;
  const ai = vendorOf(v?.id).ai;
  if (!ai || ai.model !== 'credits') return true;
  if (ai.allowance != null && v.month.credits + ai.creditsPerConvo > ai.allowance) { v.month.creditsOut++; return false; }
  v.month.credits += ai.creditsPerConvo;
  return true;
}

// Month end: seats + AI usage + mistakes that only show over a month. viaPeople: AI usage is billed by People.
// usage: { claimed, involved, resolved, wrong } this month.
export function vendorMonthEnd(state, sup, { usage, live, viaPeople = false }) {
  const v = ensureVendor(sup);
  const def = vendorOf(v.id);
  const team = humans(state);
  const supportHumans = 1 + team.filter((m) => m.role === 'support').length;
  const other = team.length - (supportHumans - 1);
  const seats = seatsFor(v.id, { supportHumans, otherHumans: other, seatPolicy: v.seatPolicy });
  const out = { seats: 0, ai: 0 };
  // Legacy saves never billed a seat; a catalog subscription to the same vendor already pays one seat.
  const paidSeat = def.catalogId && (state.recurring ?? []).some((r) => r.active && r.catalogId === def.catalogId) ? 1 : 0;
  if (!v.legacy && def.seat && seats.billed - paidSeat > 0) {
    out.seats = round2((seats.billed - paidSeat) * def.seat);
    post(state, { amount: -out.seats, counterparty: def.short, description: `${def.short} seats: ${seats.billed - paidSeat} × $${def.seat}${seats.billed > seats.seats ? ` (minimum ${def.seatMin})` : ''}`, category: 'software', method: 'card' });
  }
  if (!viaPeople && def.ai && (live || usage.claimed > 0 || usage.involved > 0)) {
    const b = aiBill(v.id, usage, { live, unit: v.unit });
    if (b.usd > 0) { out.ai = b.usd; post(state, { amount: -b.usd, counterparty: def.short, description: b.label, category: 'software', method: 'card' }); }
  }
  const mk = `${state.day}`;
  const accts = accountsFor(state);
  if (accts.length >= 5 && !def.legacyBaseline) {
    const t = v.today ?? { fit: 1, handlingMult: 1, churnMult: 1 };
    const mrr = accts.reduce((a, x) => a + x.mrr, 0);
    if (t.fit < 0.7) {
      const est = round2(mrr * 0.03 * (t.churnMult - 1) * 12);
      logSupportMistake(state, { trap: 'vendor_channel_mismatch', key: `fit:${mk}`, hours: round2(v.month.extraHours), estCost: est, delayed: true, text: `${def.label} serves your customers' channels poorly (fit ${Math.round(t.fit * 100)}%): ~${round2(v.month.extraHours)} extra founder hours this month on copied-across threads, and accounts churn ×${t.churnMult} (game estimate ~${money(est)}/yr of revenue).` });
    }
    if (def.issueLinking && v.seatPolicy === 'everyone' && seats.wasted > 0 && seats.seats > supportHumans) logSupportMistake(state, { trap: 'support_seat_sprawl', key: `seats:${mk}`, estCost: round2((seats.seats - Math.max(def.seatMin, supportHumans)) * def.seat * 12), text: `Paying ${def.short} seats for ${seats.seats - supportHumans} teammate(s) who only read threads (${money(out.seats)}/mo of seats). Linked issues give engineers free view-only access.` });
    if (def.adminHours >= 1 && supportHumans <= 1 && accts.length < 300) logSupportMistake(state, { trap: 'vendor_overkill', key: `overkill:${mk}`, hours: round2(v.month.adminHours), text: `${round2(v.month.adminHours)} h this month maintaining ${def.short} views, triggers and SLA policies for a one-person support team. Built for 5+ agents.` });
  }
  if (v.month.creditsOut > 0) logSupportMistake(state, { trap: 'ai_credits_exhausted', key: `credits:${mk}`, hours: round2((v.month.creditsOut * (MINUTES_PER_TICKET[state.company.model] ?? 15)) / 60), text: `The ${def.short} AI credit allowance ran out: ${v.month.creditsOut} conversation(s) went to you instead. Scope the agent to the intents it resolves, or budget credits.` });
  v.month = { extraHours: 0, adminHours: 0, credits: 0, creditsOut: 0 };
  return out;
}

// For the operator reader and the Platform tab.
export function platformRead(state, sup) {
  const v = ensureVendor(sup);
  const p = profileFor(state, sup);
  return vendorFit({ id: v.id, p, seatPolicy: v.seatPolicy, overbuy: Boolean(v.enterprise?.overbuy), lockinFees: v.lockinFees });
}

export { VENDORS, CHOOSABLE, ENTERPRISE, MIX, estimateMonth };
