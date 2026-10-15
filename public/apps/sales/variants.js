// Founder-led sales learning (hybrid motion): tag each deal with the message, the demo flow and the buyer role,
// then read win rate by variant before you hire sales. Hiring an AE before the founder's own win rate is stable
// is a recorded mistake (the People app exposes hires; read-only here).
//
// Numbers [design]: "repeatable" = at least 12 closed deals that reached a qualified opportunity, 3+ wins, and the
// recent half within 20 points of the older half. Standard advice is to close the first ~10-20 deals yourself
// (no public benchmark; this is the usual founder-led-sales rule of thumb, not a statistic).
import { logMistake } from '../../core/operator.js';
import { ensureCrm, contactById } from './model.js';
import { authorityFor } from './replies.js';
import { emitSalesEvent } from './events.js';

export const VARIANT_FIELDS = { message: 'Message / angle', demo: 'Demo flow', role: 'Buyer role' };
export const STABLE = { minClosed: 12, minWins: 3, maxDrift: 0.2, minVariantN: 5 };

const clean = (t) => String(t ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);

/** Buyer role of the deal's main contact: committee role if mapped, else the authority implied by their title. */
export function dealRole(state, deal) {
  const ct = contactById(state, deal.contactId);
  if (ct?.committee?.role) return String(ct.committee.role).replace(/_/g, ' ');
  return ct ? authorityFor(ct.title) : 'unknown';
}

/** Tag a deal. Free text, normalised; role defaults to the contact's role. Re-tagging replaces the old tag. */
export function tagDeal(state, deal, { message, demo, role } = {}) {
  deal.variant = {
    message: clean(message ?? deal.variant?.message),
    demo: clean(demo ?? deal.variant?.demo),
    role: clean(role ?? deal.variant?.role) || dealRole(state, deal),
    day: state.day,
  };
  return deal.variant;
}

const closeDay = (d) => d.history?.at(-1)?.day ?? d.stageDay ?? 0;
const reachedQualified = (d) => d.history?.some((h) => ['qualified', 'proposal', 'contract', 'won'].includes(h.stage));

/** Wilson 95% interval for a win rate. */
export function wilson(w, n) {
  if (!n) return [0, 1];
  const z = 1.96, p = w / n, d = 1 + z * z / n;
  const c = p + z * z / (2 * n);
  const m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}

/** Win rate by variant for one field ('message' | 'demo' | 'role'), over founder-led deals that were tagged. */
export function variantStats(state, field = 'message') {
  const deals = ensureCrm(state).deals.filter((d) => !d.ownerAeId && d.variant && (field === 'role' || d.variant[field]));
  const by = new Map();
  for (const d of deals) {
    const key = field === 'role' ? (d.variant.role || dealRole(state, d)) : d.variant[field];
    if (!key) continue;
    const row = by.get(key) ?? { variant: key, won: 0, lost: 0, open: 0 };
    if (d.stage === 'won') row.won++; else if (d.stage === 'lost' && reachedQualified(d)) row.lost++; else if (!['won', 'lost'].includes(d.stage)) row.open++;
    by.set(key, row);
  }
  const rows = [...by.values()].map((r) => {
    const n = r.won + r.lost;
    const [lo, hi] = wilson(r.won, n);
    return { ...r, closed: n, winRate: n ? r.won / n : null, lo, hi, enough: n >= STABLE.minVariantN };
  }).sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || b.closed - a.closed);
  const [top, next] = rows.filter((r) => r.enough);
  // A "winner" only when the intervals do not overlap: otherwise it is noise at founder-led sample sizes.
  const clearWinner = top && next && top.lo > next.hi ? top.variant : null;
  return { field, rows, clearWinner, tagged: deals.length };
}

/** Is the founder's own (all-variants) win rate stable enough to hand sales to someone else? */
export function founderWinRate(state) {
  const closed = ensureCrm(state).deals.filter((d) => !d.ownerAeId && ['won', 'lost'].includes(d.stage) && reachedQualified(d)).sort((a, b) => closeDay(a) - closeDay(b));
  const n = closed.length;
  const wins = closed.filter((d) => d.stage === 'won').length;
  const half = Math.floor(n / 2);
  const rate = (arr) => (arr.length ? arr.filter((d) => d.stage === 'won').length / arr.length : 0);
  const drift = n >= 4 ? Math.abs(rate(closed.slice(half)) - rate(closed.slice(0, half))) : null;
  const [lo, hi] = wilson(wins, n);
  const stable = n >= STABLE.minClosed && wins >= STABLE.minWins && drift != null && drift <= STABLE.maxDrift;
  const tagged = closed.filter((d) => d.variant).length;
  return { closed: n, wins, winRate: n ? wins / n : null, lo, hi, drift, stable, tagged, taggedShare: n ? tagged / n : 0 };
}

/**
 * Daily check, called from the deals loop: logs the AE-too-early mistake once per hire and emits the "stable" event.
 * Reads state.apps.people.members (People app, read-only): role 'ae', human, hired (active or offer accepted).
 */
export function hybridDay(state) {
  const members = state.apps?.people?.members;
  if (!Array.isArray(members) || !members.length) return;
  const wr = founderWinRate(state);
  if (wr.stable) emitSalesEvent(state, 'founder_win_rate_stable', { closed: wr.closed, winRate: +wr.winRate.toFixed(2) }, 'fwr_stable');
  for (const m of members) {
    if (m.role !== 'ae' || m.kind === 'ai_agent' || !m.status === 'active') continue;
    if (wr.stable) continue;
    const monthly = Number(m.monthlyCost) || 9000;
    logMistake(state, {
      functionId: 'hiring', id: 'ae_before_repeatable_sales', label: 'Hired an AE before the founder-led win rate was stable', app: 'crm', delayed: true, key: `early_ae:${m.id}`,
      cost: { usd: Math.round(monthly * 3), days: 60, hours: 8 },
      detail: `${wr.closed} founder-led deals closed (${wr.wins} won${wr.tagged ? `, ${wr.tagged} tagged with a variant` : ', none tagged with a message or demo variant'}). A new AE needs a repeatable message and demo to run; ramp is ~3 months of pay with little to show. A stellar operator tags deals, closes 12+ qualified opportunities themselves, finds the message and buyer role that win, then hires.`,
    });
  }
}
