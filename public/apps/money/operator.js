// Operator reads for the money functions this module owns (cash/runway and bookkeeping/close/tax) and the
// mistake hook the money engines use. Registered with core/operator.js (owner's reader wins over the
// Scorecard defaults in outcomes/readers.js). Weights and cut-offs are [design]; tier spreads are in
// public/data/operator-tiers.js (cash_runway, bookkeeping_close_tax).

import { registerOperatorReader, logMistake, shrink, tierFromScore, trapCoaching, tierBehaviours, unknownRead, TIER_RANK } from '../../core/operator.js';
import { clamp } from '../../core/util.js';
import * as spendMod from './spend.js';
import * as forecastMod from './forecast.js';
import * as ledgerMod from './ledger.js';

/** Log a consequential mistake (core/operator.js ledger). Never throws from inside a daily tick. */
export function mistake(state, entry) {
  try { return logMistake(state, entry); } catch { return null; }
}

const lin = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);
const wavg = (parts) => { const p = parts.filter(([v]) => v != null && Number.isFinite(v)); const w = p.reduce((a, [, x]) => a + x, 0); return w ? p.reduce((a, [v, x]) => a + v * x, 0) / w : null; };

function read(fn, { raw, n, k = 3, evidence, traps = [], cap = null, extra = [] }) {
  const score = shrink(clamp(raw, 0, 1), n, 0.5, k);
  let tier = tierFromScore(score, { n, minN: 1 });
  if (cap && TIER_RANK[tier] > TIER_RANK[cap]) tier = cap;
  const coaching = [...traps.map((t) => trapCoaching(fn, t.id, t.text) || t.text), ...extra];
  if (tier !== 'stellar' && tier !== 'unknown') { const b = tierBehaviours(fn, 'stellar')[0]; if (b) coaching.push(`What a stellar operator does: ${b}.`); }
  return { tier, score: Math.round(score * 100) / 100, raw: Math.round(clamp(raw, 0, 1) * 100) / 100, n, evidence, coaching: [...new Set(coaching.filter(Boolean))], traps: traps.map((t) => t.id) };
}

// ---- Cash, runway and forecasting ----
export function readCashSync(state) {
  const F = forecastMod, S = spendMod;
  const st = F.forecastStats(state);
  const burnNow = state.metrics?.daily?.length > 60;
  const true_ = F.runwayForecast(state);
  if (!st.snapshots && !st.triggers && !st.raiseStarts.length && !(burnNow && true_.months < 9)) return unknownRead();
  const cadence = st.recent ? lin(st.weeksCovered * (st.lineItems ? 1 : 0.5), 1, 10) : 0;
  const err = st.err13 ?? (st.err4 != null ? st.err4 * 1.6 : null);
  const accuracy = err == null ? null : lin(err, 45, 8);
  const triggers = st.triggers ? 0.5 + 0.5 * (st.honored + st.ignored ? st.honored / (st.honored + st.ignored) : 1) : 0;
  const raise = st.raiseStarts.length ? lin(Math.min(...st.raiseStarts.map((r) => (Number.isFinite(r.runway) ? r.runway : 24))), 4, 10) : null;
  const waste = S.stackWaste(state);
  const traps = [];
  if (st.trapAR) traps.push({ id: 'deferred_as_cash' });
  if (st.ignored) traps.push({ id: 'wait_for_round' });
  if ((state.mistakes ?? []).some((m) => m.functionId === 'cash_runway' && m.id === 'hire_on_forecast')) traps.push({ id: 'hire_on_forecast' });
  if (waste > 100) traps.push({ id: 'cut_payback_marketing', text: `About $${Math.round(waste)}/mo goes to unused tools and seats. Cut spend with no owner first.` });
  let raw = wavg([[cadence, 0.3], [accuracy, 0.3], [triggers, 0.2], [raise, 0.2]]) ?? 0;
  if (st.trapAR) raw -= 0.15;
  if (st.trapAnnual) raw -= 0.05;
  const n = Math.max(1, st.scored + (st.triggers ? 1 : 0) + st.raiseStarts.length + (st.recent ? 1 : 0));
  const cap = !st.snapshots && burnNow && true_.months < 6 ? 'mediocre' : st.ignored ? 'average' : null;
  return read('cash_runway', {
    raw, n, k: 3, traps, cap,
    evidence: [
      st.snapshots ? `${st.recent} forecast${st.recent === 1 ? '' : 's'} in 120 days over ${st.weeksCovered} week(s)${st.lineItems ? ` (${st.lineItems} line-item)` : ' (no line items)'}` : 'No cash forecast saved',
      err != null ? `Forecast error ${err.toFixed(0)}% (${st.err13 != null ? '13-week' : '4-week, scaled'})` : 'No forecast old enough to score yet',
      st.triggers ? `${st.triggers} trigger rule(s): ${st.honored} honoured, ${st.ignored} ignored` : 'No trigger rules',
      st.raiseStarts.length ? `Raise started at ${st.raiseStarts.map((r) => (Number.isFinite(r.runway) ? r.runway.toFixed(1) : '∞')).join(', ')} months of runway` : 'No raise started',
      `True runway now: ${Number.isFinite(true_.months) ? `${true_.months.toFixed(1)} months` : 'default alive (36+ months)'}`,
    ],
  });
}

// ---- Bookkeeping, close and compliance (Books + receipts) ----
export function readBooks(state) {
  const L = ledgerMod, S = spendMod;
  const B = state.apps.books;
  const txns = state.bank?.txns ?? [];
  let months = [];
  try { months = L.closableMonths(state).slice(-6); } catch { months = []; }
  if (!months.length || txns.length < 5) return unknownRead();
  const closedShare = months.filter((m) => B?.closed?.[m]).length / months.length;
  const recent = txns.filter((t) => t.day > state.day - 120 && !['stripe_payout', 'transfer'].includes(t.category));
  let mis = 0;
  try { mis = recent.filter((t) => L.isMisclassified(state, t)).length; } catch { mis = 0; }
  const misShare = recent.length ? mis / recent.length : 0;
  const missed = Object.values(B?.compliance ?? {}).filter((r) => ['missed', 'overdue', 'late', 'assessed'].includes(r?.status)).length;
  const rc = S.receiptStats(state, 3);
  const receipts = rc.share == null ? null : lin(rc.share, 0.4, 0.03);
  const raw = wavg([[closedShare, 0.35], [lin(misShare, 0.2, 0.02), 0.25], [missed ? 0 : 1, 0.2], [receipts, 0.2]]);
  const traps = [];
  if (months.length >= 2 && closedShare === 0) traps.push({ id: 'bank_feed_is_books' });
  if (missed) traps.push({ id: 'deadline_in_head' });
  if (rc.share != null && rc.share > 0.25) traps.push({ id: 'missing_receipts', text: `${Math.round(rc.share * 100)}% of card charges had no receipt at close. Attach receipts within 48 hours with a one-line memo; the CPA bills for every missing one.` });
  return read('bookkeeping_close_tax', {
    raw, n: months.length + (rc.months ?? 0), k: 3, traps, cap: missed ? 'average' : null,
    evidence: [
      `${Math.round(closedShare * 100)}% of the last ${months.length} month(s) closed`,
      `${(misShare * 100).toFixed(1)}% of recent transactions booked to the wrong category`,
      rc.share != null ? `${Math.round(rc.share * 100)}% of card charges without a receipt at close (${rc.months} month(s))` : 'No card months measured yet',
      `${missed} missed filing${missed === 1 ? '' : 's'}`,
    ],
  });
}

// The engines import this module for mistake(); the cycle is safe because nothing imported is used at load time.
registerOperatorReader('cash_runway', readCashSync);
registerOperatorReader('bookkeeping_close_tax', readBooks);
