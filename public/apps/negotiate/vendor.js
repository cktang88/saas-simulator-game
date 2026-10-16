// Vendor-contract negotiation wired into Money -> Stack audit (recurring software and hosting bills of $100/mo or more, and
// annual renewals). The counterparty is the vendor's sales rep (hardball, quota deadline at quarter end); researched bands:
// docs/research/negotiation/science-and-enterprise.md section 3 (prepay 10-20%, commit what you will use, price-lock letter)
// and data/negotiation.js VENDOR_NEG. The agreed package lands on the recurring bill (spend.js applyVendorContract): the
// amount, the annual flag and renewal day, the uplift cap for the next renewal, the seats, and an annual prepay posted to the
// bank now. Perk and credit offsets (aicost/credits.js) apply to the gross bill at post time, so a negotiated price is never
// discounted twice. Delayed consequences live in spend.js (auto_renewed_without_negotiating, prepaid_annual_then_churned_tool).

import { clamp } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { registerAdapter, startNegotiation, findNegotiation } from '../../core/negotiation.js';
import { currentRunway } from '../fundraising/process.js';
import { vendorFacts, vendorEligibility, applyVendorContract } from '../money/spend.js';
import { daysToQuarterEnd } from './enterprise.js';
import { vendorSpec, registerClose, runClosers } from './others.js';
import { bizBlock } from '../context.js';

const runwayOf = (state) => { try { const r = currentRunway(state); return Number.isFinite(r) ? r : Infinity; } catch { return Infinity; } };

/** Start (or return) the negotiation for one recurring bill. Throws a player-readable reason when it cannot be opened. */
export function startRecurringNegotiation(state, recurringId) {
  const f = vendorFacts(state, recurringId);
  const r = state.recurring.find((x) => x.id === recurringId);
  const key = `vendor:${recurringId}:${f.annual ? f.renewDay : state.day}`;
  const existing = findNegotiation(state, key);
  if (existing) return existing;
  const spec = vendorSpec(state, { vendor: f.vendor, listAnnual: f.listAnnual, seats: f.seats, usage: f.usage, alternatives: f.alternatives, runwayMonths: runwayOf(state), key,
    recurringId, annual: f.annual, renewDay: f.renewDay, team: f.team, currentAnnual: f.currentAnnual, qLeft: daysToQuarterEnd(state) });
  spec.context.unused = f.unused;
  spec.context.daysToRenewal = f.daysToRenewal;
  if (r) r.negKey = key;
  return startNegotiation(state, spec);
}
export const negotiationForBill = (state, recurringId) => {
  const r = state.recurring.find((x) => x.id === recurringId);
  return r?.negKey ? findNegotiation(state, r.negKey) : null;
};

// The player's real alternatives: a same-class vendor to switch to, an unused tool they could simply cancel, and the cash behind a
// prepay (short runway weakens every threat to walk).
function batna(state, neg) {
  const c = neg.context;
  const sources = [];
  let value = 0.2;
  if (c.alternatives) { value += 0.15 * Math.min(2, c.alternatives); sources.push({ kind: 'alternative', label: `${c.alternatives} comparable vendor${c.alternatives > 1 ? 's' : ''} you could switch to`, strength: 0.4 }); }
  if (c.unused) { value += 0.2; sources.push({ kind: 'cancel', label: 'Nobody is using it: you could cancel outright', strength: 0.5 }); }
  const runway = runwayOf(state);
  if (Number.isFinite(runway) && runway < 6) { value *= 0.8; sources.push({ kind: 'runway', label: `Runway ${runway.toFixed(1)} months: switching tools is a distraction you may not afford`, strength: -0.2 }); }
  const real = sources.some((s) => s.strength >= 0.4);
  return { value: clamp(value, 0.1, 0.6), real, leverage: real ? clamp(0.3 + 0.2 * (c.alternatives || 0) + (c.unused ? 0.2 : 0), 0, 0.8) : 0, sources };
}
// What the vendor's account executive knows: the account (seats, usage, current bill, renewal date) and the customer's public
// face. Not the customer's finances or which alternatives it has looked at.
function brief(state, neg) {
  const c = neg.context;
  return [
    `You sell ${c.vendor}. The customer: ${state.company?.name}, founder ${state.founder?.name ?? 'the founder'}.`,
    `Their account: ${c.seats ?? 1} seat${(c.seats ?? 1) > 1 ? 's' : ''}${c.usage != null && c.usage !== c.seats ? ` (${c.usage} active)` : ''}, currently about $${Math.round(c.currentAnnual ?? c.listAnnual).toLocaleString('en-US')} a year${c.annual ? `, annual plan renewing in ${Math.max(0, (c.renewDay ?? state.day) - state.day)} days` : ', billed monthly'}.`,
    c.qLeft != null ? `Your quarter ends in ${c.qLeft} days.` : '',
  ].filter(Boolean).join('\n') + bizBlock(state, 'public');
}
registerAdapter('vendor', { label: 'Vendor contract', batna, onClose: runClosers('vendor'), brief });

function closeVendor(state, neg) {
  const c = neg.context;
  const r = state.recurring.find((x) => x.id === c.recurringId);
  if (!r) return;
  if (neg.status !== 'agreed') {
    // A rep who walked out, hit an impasse or let the quote lapse will not reopen the price right away. Walking away yourself
    // does not burn the relationship: you can come back to the table.
    if (neg.status !== 'walked_player') r.noTalkUntil = state.day + 30;
    return;
  }
  const out = applyVendorContract(state, c.recurringId, neg.final, { negId: neg.id, currentRunway: runwayOf(state) });
  neg.context.outcome = { price: out.price, billing: out.billing, cashNow: out.cashNow, monthlyBefore: out.monthlyBefore, monthlyAfter: out.monthlyAfter, cap: out.cap, term: out.term, prepayFailed: out.prepayFailed };
  const saved = out.monthlyBefore - out.monthlyAfter;
  notify(state, `${r.vendor}: contract agreed, $${out.price.toLocaleString()}/yr${out.billing === 'annual' ? (out.cashNow ? ` (paid $${out.cashNow.toLocaleString()} today)` : ' at renewal') : ' billed monthly'}${saved > 0.5 ? `, saves about $${Math.round(saved)}/mo` : ''}.`, { type: 'good', app: 'bank' });
}
registerClose('vendor', closeVendor);
