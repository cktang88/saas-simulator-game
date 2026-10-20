// Pipeline hygiene and forecast discipline (operator-tiers audit 3.2 "Deal management" fixes, gap item 19).
// Before this, stale deals and gut forecasts cost nothing. Now:
//  - days since the last BUYER contact (a reply, a held call, a recap, an answered check-in) decays win odds after
//    21 days (×0.98 per day, floor ×0.5) [design]; a 14-day stale flag is raised (Automations: deal_stale);
//  - a weekly forecast (Commit / Best case / Pipeline) is scored against what actually closed 30 days later;
//    a commit that misses by 40%+ is logged as "commit inflation" with the deals that should have come out;
//  - a discount offered before the buyer ever stated a budget buys no extra odds (buyers anchor on it) and the
//    margin given away is logged ("discounted before a buyer budget was stated").
// Gong's "20% more precision" is a vendor claim (d04); forecast accuracy bands (±20% stellar, 50%+ mediocre) are
// operator-tier estimates [design].
import { uid, chance, clamp } from '../../core/util.js';
import { logMistake } from '../../core/operator.js';
import { emitSalesEvent } from './events.js';
import { isOpen } from './deals.js';

export const PIPE = {
  staleFlagDays: 14,
  decayFrom: 21,
  decayPerDay: 0.98,
  decayFloor: 0.5,
  forecastHorizon: 30,
  forecastMissMistake: 0.4,
  hours: { review: 0.5, nudge: 0.15 },
  nudge: { good: 0.55, weak: 0.35, repeatDecay: 0.6 }, // [design]
};
export const FORECAST_CATS = { commit: 'Commit', best: 'Best case', pipeline: 'Pipeline', omit: 'Omit' };
const LATE = ['qualified', 'proposal', 'contract'];

/** Last day the buyer actually engaged with this deal. */
export function lastBuyerContact(state, deal) {
  let d = deal.lastTouchDay ?? deal.createdDay ?? 0;
  for (const m of state.apps.calls?.meetings ?? []) if (m.dealId === deal.id && m.status === 'held') d = Math.max(d, m.day);
  if (deal.recap) d = Math.max(d, deal.recap.day);
  if (deal.lastBuyerDay != null) d = Math.max(d, deal.lastBuyerDay);
  const ct = state.apps.crm?.contacts?.find((c) => c.id === deal.contactId);
  if (ct?.lastThemDay != null) d = Math.max(d, ct.lastThemDay);
  return d;
}
export const staleDays = (state, deal) => state.day - lastBuyerContact(state, deal);

/** Win-odds multiplier from buyer silence (late-stage deals only). */
export function staleMult(state, deal) {
  if (!LATE.includes(deal.stage)) return 1;
  // A well multithreaded buying group (3+ people engaged) carries its own process through procurement [design].
  const ids = deal.committee?.members ?? [];
  if (ids.length && (state.apps.crm?.contacts ?? []).filter((c) => ids.includes(c.id) && c.committee?.engaged && c.committee.stance !== 'left').length >= 3) return 1;
  // Delivered paperwork the buyer accepted counts as contact, but never a review that ends in the future.
  for (const it of deal.paperwork ?? []) if (it.doneDay != null) deal.lastBuyerDay = Math.max(deal.lastBuyerDay ?? 0, Math.min(state.day, it.readyDay ?? it.doneDay));
  const s = staleDays(state, deal);
  return s <= PIPE.decayFrom ? 1 : Math.max(PIPE.decayFloor, Math.pow(PIPE.decayPerDay, s - PIPE.decayFrom));
}

/** Daily: raise stale flags; resolve forecasts whose horizon has passed. */
export function pipelineDay(state) {
  const crm = state.apps.crm;
  if (!crm) return;
  for (const deal of crm.deals) {
    if (!isOpen(deal) || !LATE.includes(deal.stage)) continue;
    const s = staleDays(state, deal);
    if (s >= PIPE.staleFlagDays && !deal.staleFlagged) {
      deal.staleFlagged = state.day;
      emitSalesEvent(state, 'deal_stale', { dealId: deal.id, companyId: deal.companyId, days: s }, `stale:${deal.id}:${lastBuyerContact(state, deal)}`);
    } else if (s < PIPE.staleFlagDays) deal.staleFlagged = null;
  }
  for (const t of crm.tasks ?? []) if (!t.done && t.dueDay === state.day) emitSalesEvent(state, 'task_due', { taskId: t.id, dealId: t.dealId, contactId: t.contactId }, `task:${t.id}`);
  for (const f of crm.forecasts ?? []) if (!f.resolved && state.day >= f.periodEnd) resolveForecast(state, f);
}

/** Check in with the buyer asking for a dated step. Silence after repeated nudges is the honest signal. */
export function nudgeDeal(state, deal) {
  deal.nudges = (deal.nudges ?? []).filter((d) => d > state.day - 30);
  const p = ((deal.callQuality ?? 0.4) >= 0.6 ? PIPE.nudge.good : PIPE.nudge.weak) * Math.pow(PIPE.nudge.repeatDecay, deal.nudges.length);
  deal.nudges.push(state.day);
  const ok = chance(state, p);
  if (ok) deal.lastBuyerDay = state.day;
  return { ok, p };
}

// ---- Forecast ----

export function ensureForecasts(state) {
  const crm = (state.apps.crm ??= {});
  return (crm.forecasts ??= []);
}

/** Weekly forecast call. picks: { dealId: 'commit'|'best'|'pipeline'|'omit' }. */
export function submitForecast(state, picks) {
  const list = ensureForecasts(state);
  const deals = (state.apps.crm.deals ?? []).filter((d) => isOpen(d) && LATE.includes(d.stage));
  const rows = deals.map((d) => ({ dealId: d.id, cat: picks[d.id] ?? 'pipeline', amount: d.amount ?? 0, stage: d.stage, stale: staleDays(state, d), econBuyer: hasEconomicBuyer(state, d) }));
  const sum = (cat) => rows.filter((r) => r.cat === cat).reduce((a, r) => a + r.amount, 0);
  for (const d of deals) d.reviewedDay = state.day;
  const f = { id: uid('fc'), day: state.day, periodEnd: state.day + PIPE.forecastHorizon, rows, commit: sum('commit'), best: sum('commit') + sum('best'), pipeline: sum('pipeline'), resolved: false };
  list.push(f);
  if (list.length > 60) list.shift();
  return f;
}

function hasEconomicBuyer(state, deal) {
  const ids = deal.committee?.members ?? [];
  const eb = (state.apps.crm.contacts ?? []).find((c) => ids.includes(c.id) && c.committee?.role === 'economic_buyer');
  if (eb) return Boolean(eb.committee.engaged);
  const ct = state.apps.crm.contacts.find((c) => c.id === deal.contactId);
  return /owner|founder|ceo|president|cfo|coo/i.test(ct?.title ?? '');
}

export function resolveForecast(state, f) {
  const deals = state.apps.crm.deals;
  const won = (r) => { const d = deals.find((x) => x.id === r.dealId); return d?.stage === 'won' && (d.stageDay ?? 0) <= f.periodEnd ? r.amount : 0; };
  f.realisedCommit = f.rows.filter((r) => r.cat === 'commit').reduce((a, r) => a + won(r), 0);
  f.realised = f.rows.reduce((a, r) => a + won(r), 0);
  f.error = f.commit || f.realised ? Math.abs(f.commit - f.realised) / Math.max(f.commit, f.realised) : 0;
  f.resolved = true;
  const bad = f.rows.filter((r) => r.cat === 'commit' && won(r) === 0);
  f.coaching = bad.map((r) => `${r.stale > PIPE.decayFrom ? `no buyer contact for ${r.stale} days` : r.econBuyer ? 'committed but slipped' : 'no economic buyer engaged'}`);
  if (f.commit > 0 && f.commit > f.realised && f.error >= PIPE.forecastMissMistake) {
    logMistake(state, {
      functionId: 'deal_management', id: 'commit_inflation', label: '"Commit" inflation', app: 'crm', delayed: true, key: `fc:${f.id}`,
      cost: { usd: Math.round((f.commit - f.realised) * 0.1) }, // spend planned against phantom revenue [design: 10% of the miss]
      detail: `You committed $${Math.round(f.commit).toLocaleString('en-US')} and $${Math.round(f.realised).toLocaleString('en-US')} closed (${Math.round(f.error * 100)}% miss). ${bad.length} committed deal(s) did not close: ${[...new Set(f.coaching)].join('; ')}.`,
    });
  }
  return f;
}

/** Forecast accuracy history (resolved forecasts). */
export function forecastAccuracy(state) {
  const done = ensureForecasts(state).filter((f) => f.resolved && (f.commit || f.realised));
  return { n: done.length, meanError: done.length ? done.reduce((a, f) => a + f.error, 0) / done.length : null, last: done.at(-1) ?? null };
}

/** Zombie deals: open late-stage deals with no buyer contact for 30+ days. */
export const zombies = (state) => (state.apps.crm?.deals ?? []).filter((d) => isOpen(d) && LATE.includes(d.stage) && staleDays(state, d) >= 30);

// ---- Early discount ----

/** Did the buyer state a budget before the proposal (call transcript with a $ figure from them, or a reviewed field)? */
export function budgetStated(state, deal) {
  if (deal.fields?.budget && !deal.fields.budget.wrong) return true;
  if (deal.method?.known && Object.keys(deal.method.known).some((k) => /budget/i.test(k))) return true;
  return (state.apps.calls?.meetings ?? []).some((m) => m.dealId === deal.id && (m.transcript ?? []).some((t) => t.from === 'them' && /\$\s?\d/.test(t.text)));
}

/** Called when a proposal goes out with a discount. Marks an early discount and logs its margin cost. */
export function checkEarlyDiscount(state, deal, listAcv) {
  if (!(deal.discountPct > 0) || budgetStated(state, deal)) { deal.earlyDiscount = null; return false; }
  deal.earlyDiscount = { pct: deal.discountPct, day: state.day };
  logMistake(state, {
    functionId: 'deal_management', id: 'early_discount', label: 'Discounted before a budget was stated', app: 'crm', key: `earlydisc:${deal.id}`,
    cost: { usd: Math.round(listAcv * deal.discountPct) },
    detail: `${Math.round(deal.discountPct * 100)}% off before the buyer named a budget: it buys no extra odds (they anchor on it and push for more) and costs the margin every year.`,
  });
  return true;
}

/** Pipeline-hygiene stats for the operator reader. */
export function hygieneStats(state) {
  const open = (state.apps.crm?.deals ?? []).filter((d) => isOpen(d) && LATE.includes(d.stage));
  const dated = open.filter((d) => d.nextStep && d.nextStep.dueDay >= state.day).length;
  const fresh = open.filter((d) => staleDays(state, d) <= PIPE.decayFrom).length;
  // Weeks with a forecast review, not submissions: four reviews on one afternoon are not a weekly cadence.
  const recent = new Set(ensureForecasts(state).filter((f) => f.day > state.day - 35).map((f) => Math.floor(f.day / 7))).size;
  return { open: open.length, datedShare: open.length ? dated / open.length : null, freshShare: open.length ? fresh / open.length : null, forecastsLast5w: recent, zombies: zombies(state).length, ...forecastAccuracy(state) };
}

export { clamp };
