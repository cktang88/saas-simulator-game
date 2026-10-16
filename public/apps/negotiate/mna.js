// M&A / acquisition LOI negotiation adapter (Fundraising -> Exit -> Offers). The counterparty is the buyer behind an LOI on the
// listing; the founder's BATNA is the other offers on the table plus the option of keeping the company. Issues: price, earnout
// share and length, buyer stock, holdback/escrow share and months, exclusivity days, founder retention. The agreed terms are
// written onto the offer the player signs as the LOI; the exit flow (sim.js exitDay, mna-terms.js) turns them into proceeds:
// the holdback is released net of a possible indemnity claim, stock at a haircut, the earnout only if MRR holds, and a long
// exclusivity window raises the chance the buyer re-trades after diligence.

import { clamp, lerp, hash, money } from '../../core/util.js';
import { logMistake } from '../../core/operator.js';
import { notify } from '../../core/state.js';
import { MNA, MNA_ISSUES } from '../../data/negotiation.js';
import { registerAdapter, startNegotiation, findNegotiation } from '../../core/negotiation.js';
import { ensureFr } from '../fundraising/sim.js';
import { currentRunway } from '../fundraising/process.js';
import { mnaPackage, applyMnaTerms, loiExtras } from './mna-terms.js';

export const KIND = 'mna';
const FN = 'negotiation';
const stream = (state, salt) => { let t = (parseInt(hash(`${state.seed}|${salt}`), 36) | 0) || 1; return () => { t = (t + 0x6d2b79f5) | 0; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };

const styleFor = (o) => (/strategic/i.test(o.type) ? 'hardball' : /roll-up|holding/i.test(o.type) ? 'hardball' : /operator/i.test(o.type) ? 'collaborative' : 'bureaucratic');

export function mnaSpec(state, o) {
  const fr = ensureFr(state);
  const rnd = stream(state, `mna|${o.id}`);
  const style = styleFor(o);
  const room = lerp(0.03, 0.09, rnd()) * (style === 'hardball' ? 0.8 : 1);
  const lift = lerp(0.05, 0.15, rnd());
  const issues = MNA_ISSUES.map((i) => (i.id === 'price' ? { ...i, min: o.price, max: Math.round((o.price * 1.35) / 1000) * 1000, step: 1000 } : { ...i }));
  const floors = { price: clamp(1 - room / 0.35, 0, 0.98), holdback: 0, exclusivity: 0.1 };
  const leverageRoom = { price: clamp(lift / 0.35, 0, 0.5) };
  return {
    key: `loi:${o.id}`, kind: KIND, ref: o.id, title: `${o.type}: ${money(o.price)} offer`, stakes: 'high', stakesUsd: o.price, usdPerUtil: Math.round(o.price * 0.9),
    cp: { name: o.type, role: 'acquirer\'s corp dev', style },
    issues, floors, leverageRoom, batnaStrength: /strategic/i.test(o.type) ? 0.35 : 0.5, jitter: 0.2,
    opening: mnaPackage(o), openingMessage: `Our letter of intent: ${money(o.price)}, ${Math.round((loiExtras(o).earnoutPct) * 100)}% earnout, ${Math.round(loiExtras(o).holdbackPct * 100)}% holdback for ${loiExtras(o).holdbackMonths} months, ${loiExtras(o).exclusivityDays}-day exclusivity.`,
    cpDeadlineDays: Math.max(7, (o.expiresDay ?? state.day + 21) - state.day), expiresDay: o.expiresDay ?? null,
    mistakes: { bluff: 'bluffed_alternative', overplayed: 'overplayed_hand' },
    context: { offerId: o.id, price0: o.price, listed: Boolean(fr.exit?.listing?.active) },
  };
}

export function startMnaNegotiation(state, offerId) {
  const ex = ensureFr(state).exit;
  const o = ex.offers.find((x) => x.id === offerId);
  if (!o) throw new Error('That offer is no longer on the table.');
  if (ex.loi) throw new Error('You already signed an LOI.');
  return startNegotiation(state, mnaSpec(state, o));
}
export const negotiationForOffer = (state, o) => findNegotiation(state, `loi:${o.id}`);

function batna(state, neg) {
  const ex = ensureFr(state).exit;
  const sources = [];
  let best = 0;
  const others = (ex.offers ?? []).filter((x) => x.id !== neg.ref);
  const priceMax = neg.issues.find((i) => i.id === 'price').max, priceMin = neg.issues.find((i) => i.id === 'price').min;
  for (const o of others) {
    const t = clamp((o.price - priceMin) / Math.max(1, priceMax - priceMin), 0, 1);
    best = Math.max(best, 0.55 * t + 0.3);
    sources.push({ kind: 'offer', label: `${o.type}: ${money(o.price)} (${money(o.cashAtClose)} cash)`, strength: 0.3 + 0.55 * t });
  }
  let runway = Infinity;
  try { runway = currentRunway(state); } catch { runway = Infinity; }
  const keep = Number.isFinite(runway) && runway < 4 ? 0.12 : 0.22;
  sources.push({ kind: 'keep', label: Number.isFinite(runway) ? `Keep running the company (${runway.toFixed(1)} months of runway)` : 'Keep running the company (default alive)', strength: keep });
  return { value: clamp(Math.max(keep, best * 0.9), 0.05, 0.9), real: others.length > 0, leverage: others.length ? clamp(0.4 + 0.3 * others.length, 0, 1) : 0, sources };
}

function onClose(state, neg, result) {
  const ex = ensureFr(state).exit;
  const o = ex.offers.find((x) => x.id === neg.ref);
  const m = (id, label, cost, detail, delayed = true) => logMistake(state, { functionId: FN, id, label, app: 'fundraising', key: `neg:${neg.id}:${id}`, delayed, cost, detail });
  if (neg.status === 'agreed' && o) {
    applyMnaTerms(o, neg.final);
    notify(state, `Agreed LOI terms with the ${o.type.toLowerCase()}: ${money(o.price)}, ${money(o.cashAtClose)} at close${o.earnout ? `, ${money(o.earnout)} earnout (${o.earnoutMonths} months)` : ''}${o.holdbackPct ? `, ${Math.round(o.holdbackPct * 100)}% holdback for ${o.holdbackMonths} months` : ''}, ${o.exclusivityDays}-day exclusivity. Sign the LOI to start diligence.`, { type: 'good', app: 'fundraising' });
    if (o.exclusivityDays >= 60) notify(state, `A ${o.exclusivityDays}-day exclusivity window means no other buyer can bid, and buyers re-trade after diligence (10-15% base chance [design], higher with longer windows).`, { type: 'warn', app: 'fundraising' });
  } else if (['walked_cp', 'walked_player'].includes(neg.status) && o) {
    ex.offers = ex.offers.filter((x) => x.id !== o.id);
  }
}

registerAdapter(KIND, { label: 'Acquisition LOI', batna, onClose });
export { MNA };
