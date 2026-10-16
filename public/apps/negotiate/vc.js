// VC term-sheet negotiation adapter (Fundraising -> Investor CRM -> a term sheet or SAFE commitment).
// The investor persona comes from the existing investor kinds/archetypes; its BATNA is its other deals; the founder's leverage
// is REAL competing term sheets in the same raise and runway (process.js raiseLeverage). An exploding term sheet (short runway)
// allows no negotiation: asking for more risks the offer being withdrawn. Issues: valuation or SAFE cap, round size, option pool
// (pre-money shuffle), liquidation preference, board, pro rata, founder vesting, protective provisions, no-shop, SAFE MFN.
// Agreed terms are written onto inv.terms and flow into the cap table (close() in sim.js: preference, participation) and the
// exit waterfall (captable.js); governance (board control, vetoes, vesting) is recorded for the exit flow.

import { clamp, hash, money, round2, lerp } from '../../core/util.js';
import { logMistake } from '../../core/operator.js';
import { notify } from '../../core/state.js';
import { VC, VC_PRICED_ISSUES, VC_SAFE_ISSUES } from '../../data/negotiation.js';
import { registerAdapter, startNegotiation, pkgU, snapPackage, findNegotiation, getNegotiation } from '../../core/negotiation.js';
import { ensureFr, passInvestor, describeTerms, investorById } from '../fundraising/sim.js';
import { raiseLeverage } from '../fundraising/process.js';
import { prefCostUsd, effectivePreMoney } from './vc-terms.js';

export const KIND = 'vc';
const FN = 'negotiation';
export const STYLE_BY_KIND = { angel: 'time_pressed', syndicate: 'collaborative', angel_group: 'bureaucratic', scout: 'time_pressed', micro_vc: 'collaborative', seed_fund: 'collaborative', multistage: 'hardball', accelerator: 'bureaucratic', cvc: 'bureaucratic', family_office: 'collaborative', rbf: 'bureaucratic' };
const stream = (state, salt) => { let t = (parseInt(hash(`${state.seed}|${salt}`), 36) | 0) || 1; return () => { t = (t + 0x6d2b79f5) | 0; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };
const LIQ = { np1: [1, false], p1: [1, true], np2: [2, false], p2: [2, true] };
const ROUND_F = { small: 0.75, base: 1, large: 1.25 };

/** The current term-sheet terms as a package of the negotiation's issues. */
export function termsToPackage(t) {
  if (t.instrument === 'safe') return { cap: t.cap, discount: t.discount ?? 0, mfn: t.mfn ? 'mfn' : 'none', proRata: t.proRata ? 'pr' : 'none' };
  return {
    preMoney: t.preMoney, pool: t.poolTargetPost ?? 0.1,
    liq: `${t.participating ? 'p' : 'np'}${t.liqPref ?? 1}`,
    board: t.boardSeats ?? 'founder', proRata: t.proRata ? 'major' : 'none', vesting: t.vesting ?? 'keep', protective: t.protective ?? 'standard',
    round: 'base', noShop: `d${t.noShopDays ?? 45}`,
  };
}

/** Write an agreed package back onto the term sheet. */
export function applyVcTerms(state, inv, pkg, ctx = {}) {
  const t = inv.terms;
  const fr = ensureFr(state);
  if (t.instrument === 'safe') {
    t.cap = Math.round(Number(pkg.cap) / 250000) * 250000;
    t.discount = Number(pkg.discount);
    t.mfn = pkg.mfn === 'mfn';
    t.proRata = pkg.proRata === 'pr';
    t.downRound = Boolean(fr.lastPostMoney && t.cap < fr.lastPostMoney);
  } else {
    const f = ROUND_F[pkg.round] ?? 1;
    t.preMoney = Math.round(Number(pkg.preMoney) / 100000) * 100000;
    t.poolTargetPost = Number(pkg.pool);
    [t.liqPref, t.participating] = LIQ[pkg.liq] ?? [1, false];
    t.boardSeats = pkg.board; t.boardSeat = true;
    t.proRata = pkg.proRata !== 'none'; t.proRataLevel = pkg.proRata;
    t.vesting = pkg.vesting; t.protective = pkg.protective;
    t.noShopDays = Number(String(pkg.noShop).slice(1));
    t.amount = Math.round(((ctx.amount0 ?? t.amount) * f) / 100000) * 100000;
    t.roundSize = Math.round((((ctx.roundSize0 ?? t.roundSize ?? t.amount)) * f) / 100000) * 100000;
    t.postMoney = t.preMoney + (t.roundSize ?? t.amount);
    t.downRound = Boolean(fr.lastPostMoney && t.postMoney < fr.lastPostMoney);
  }
  t.negotiated = true; t.countered = true;
  inv.log.push({ day: state.day, text: `Negotiated terms: ${describeTerms(t)}` });
}

function otherTermSheets(state, inv) {
  const fr = ensureFr(state);
  return fr.investors.filter((i) => i !== inv && i.raiseId === inv.raiseId && i.status === 'term_sheet' && i.terms && i.terms.instrument === inv.terms?.instrument);
}

export function vcSpec(state, inv) {
  const fr = ensureFr(state);
  const t = inv.terms;
  const raise = fr.raise;
  const safe = t.instrument === 'safe';
  const style = STYLE_BY_KIND[inv.kind] ?? 'collaborative';
  const rnd = stream(state, `vc|${inv.id}`);
  const hard = style === 'hardball';
  const room = lerp(VC.roomBase[0], VC.roomBase[1], rnd()) * (hard ? 0.7 : style === 'time_pressed' ? 1.2 : 1);
  const lift = lerp(VC.leverageLift[0], VC.leverageLift[1], rnd());
  const lev = raiseLeverage(state);
  let issues;
  const floors = {}, leverageRoom = {};
  if (safe) {
    issues = VC_SAFE_ISSUES.map((i) => (i.id === 'cap' ? { ...i, min: t.cap, max: Math.round((t.cap * 1.35) / 250000) * 250000, step: 250000 } : { ...i }));
    floors.cap = clamp(1 - room / 0.35, 0, 0.98);
    leverageRoom.cap = clamp(lift / 0.35, 0, 0.5);
    floors.proRata = 0; // they will negotiate away their side letter if pushed
  } else {
    issues = VC_PRICED_ISSUES.map((i) => (i.id === 'preMoney' ? { ...i, min: t.preMoney, max: Math.round((t.preMoney * 1.4) / 100000) * 100000, step: 100000 } : i.id === 'pool' ? { ...i, min: 0.05, max: 0.2, step: 0.01 } : { ...i }));
    floors.preMoney = clamp(1 - room / 0.4, 0, 0.98);
    leverageRoom.preMoney = clamp(lift / 0.4, 0, 0.5);
    floors.pool = clamp((Math.max(0.05, (t.poolTargetPost ?? 0.1) - 0.03) - 0.05) / 0.15, 0, 1);
    floors.board = 0.3; floors.protective = 0.4; floors.noShop = 0.1;
    leverageRoom.pool = 0.1;
  }
  const weights = { wc: {} };
  if (!safe && hard) { weights.wc.liq = 0.22; weights.wc.board = 0.16; weights.wc.protective = 0.1; }
  const exploding = Boolean(t.exploding);
  const stakesUsd = t.roundSize ?? t.amount;
  const cpName = inv.name;
  const batnaStrength = clamp((inv.leads ? 0.5 : 0.35) + (raise?.stage === 'series-a' ? 0.05 : 0) - 0.03 * (fr.reputation ?? 0), 0.2, 0.8);
  const weak = lev.months != null && lev.months < 4;
  return {
    key: `inv:${inv.id}`, kind: KIND, ref: inv.id, title: `${inv.name}: ${safe ? 'SAFE' : 'term sheet'}`,
    stakes: stakesUsd >= 1500000 ? 'high' : 'mid', stakesUsd, usdPerUtil: Math.round(0.35 * (t.postMoney ?? t.cap ?? stakesUsd * 6)),
    cp: { name: cpName, role: inv.firm ? `partner at ${inv.firm}` : 'investor', style, rigid: exploding ? 'none' : null },
    issues, weights, floors, leverageRoom, batnaStrength, jitter: 0.2,
    opening: termsToPackage(t), openingMessage: `Here are the terms: ${describeTerms(t)}.${exploding ? ' This offer expires in a few days.' : ''}`,
    cpDeadlineDays: exploding ? VC.explodingDays : Math.max(5, (inv.termExpiresDay ?? state.day + 14) - state.day),
    playerDeadlineDay: weak ? state.day + 5 : null, cpKnowsDeadline: weak,
    expiresDay: inv.termExpiresDay ?? null,
    mistakes: { bluff: 'bluffed_competing_term_sheet', overplayed: 'overplayed_hand_lost_term_sheet' },
    context: { invId: inv.id, safe, amount0: t.amount, roundSize0: t.roundSize ?? t.amount, pool0: t.poolTargetPost ?? 0, preMoney0: t.preMoney ?? null, cap0: t.cap ?? null, exploding, stage: raise?.stage ?? 'seed', open: termsToPackage(t) },
  };
}

export function startVcNegotiation(state, inv) {
  if (!inv?.terms || inv.status !== 'term_sheet') throw new Error('There is no open term sheet from this investor.');
  if (!inv.terms.lead && inv.terms.instrument !== 'safe') throw new Error('Followers invest on the lead\'s terms; there is nothing to negotiate.');
  return startNegotiation(state, vcSpec(state, inv));
}
export const negotiationForInvestor = (state, inv) => findNegotiation(state, `inv:${inv.id}`);

// ---- The founder's real alternatives ----
function batna(state, neg) {
  const fr = ensureFr(state);
  const inv = investorById(fr, neg.context.invId);
  const lev = raiseLeverage(state);
  const sources = [];
  const base = 0.28 * lev.terms * lev.terms;
  sources.push({ kind: 'runway', label: Number.isFinite(lev.months) ? `Runway ${lev.months.toFixed(1)} months (${lev.label} leverage)` : 'Default alive: you can keep building', strength: lev.terms });
  let best = 0;
  const others = inv ? otherTermSheets(state, inv) : [];
  for (const o of others) {
    const up = pkgU(neg, snapPackage(neg, termsToPackage(o.terms))).p;
    best = Math.max(best, up);
    sources.push({ kind: 'term_sheet', label: `${o.name}${o.firm ? ` (${o.firm})` : ''}: ${describeTerms(o.terms)}`, strength: up });
  }
  const live = fr.investors.filter((i) => i !== inv && i.raiseId === inv?.raiseId && ['partner_meeting', 'diligence'].includes(i.status)).length;
  if (live) sources.push({ kind: 'pipeline', label: `${live} investor${live > 1 ? 's' : ''} in partner meetings or diligence`, strength: Math.min(0.12, 0.04 * live) });
  const value = Math.max(base + Math.min(0.12, 0.04 * live), best * 0.95);
  const real = others.length > 0;
  return { value: clamp(value, 0.05, 0.9), real, leverage: real ? clamp(0.4 + 0.3 * others.length, 0, 1) : 0, sources };
}

// ---- Close ----
function onClose(state, neg, result) {
  const fr = ensureFr(state);
  const inv = investorById(fr, neg.context.invId);
  if (!inv) return;
  const ctx = neg.context;
  const m = (id, label, cost, detail, delayed = false) => logMistake(state, { functionId: FN, id, label, app: 'fundraising', key: `neg:${neg.id}:${id}`, delayed, cost, detail });
  if (result.bluff === 'caught') fr.reputation = (fr.reputation ?? 0) - VC.shopRepRisk;
  if (neg.flags.leverageUsed) {
    // Using a real term sheet as leverage is normal; doing it with several investors in one raise is shopping, and word gets around.
    fr.shopCount = (fr.shopCount ?? 0) + 1;
    if (fr.shopCount >= 3) { fr.reputation = (fr.reputation ?? 0) - VC.shopRepRiskReal; notify(state, 'You have used competing term sheets as leverage with several investors in this raise. Investors talk: expect firmer terms and slower replies.', { type: 'warn', app: 'fundraising' }); }
  }
  if (neg.status === 'agreed' && inv.status === 'term_sheet') {
    const pkg = neg.final;
    applyVcTerms(state, inv, pkg, ctx);
    if (neg.flags.leverageUsed) inv.terms.leverage = true;
    const t = inv.terms;
    if (ctx.safe) {
      notify(state, `${inv.name} agreed: ${describeTerms(t)}. Sign to close.`, { type: 'good', app: 'fundraising' });
      return;
    }
    const own = t.amount / Math.max(1, t.postMoney);
    const [liqPref, participating] = LIQ[pkg.liq] ?? [1, false];
    if (participating || liqPref > 1) {
      const cost = prefCostUsd({ invested: t.amount, ownership: own, liqPref, participating, exitValue: 3 * t.postMoney });
      m('accepted_participating_pref', 'Accepted a participating liquidation preference', { usd: cost }, `${liqPref}x ${participating ? 'participating' : 'non-participating'} preferred: at a ${money(3 * t.postMoney)} exit (3x this round's post-money) it takes ${money(cost)} more than the market 1x non-participating (96.4% of US deals, Cooley Q1 2026). Common holders, you included, pay for it.`, true);
    }
    const pool = Number(pkg.pool);
    if (pool >= 0.13 && (neg.history.filter((h) => h.from === 'player' && h.package).every((h) => Number(h.package.pool) >= ctx.pool0 - 1e-9))) {
      const eff = effectivePreMoney({ preMoney: t.preMoney, investment: t.roundSize ?? t.amount, poolPostPct: pool });
      m('pool_shuffle_ignored', 'Ignored the option pool shuffle', { usd: Math.round(Math.max(0, pool - 0.1) * t.preMoney) }, `A ${Math.round(pool * 100)}% post-money pool set in the pre-money makes your ${money(t.preMoney)} headline worth ${money(eff.effective)} effective (${Math.round(eff.haircut * 100)}% less). You never pushed the pool size down or asked for a hiring-plan-based pool.`, true);
    }
    if (pkg.board === 'investor' || (ctx.stage !== 'series-a' && pkg.board === 'balanced')) {
      m('gave_up_board_control', 'Gave up board control', { reputation: 0 }, `${pkg.board === 'investor' ? 'An investor-controlled board' : 'A 2-2-1 board at the seed stage'} can replace the CEO and decide a sale. Seed boards are typically 3 seats with two founders (practitioner sources, unverified).`, true);
    }
    notify(state, `${inv.name} agreed: ${describeTerms(t)}. Sign to close.`, { type: 'good', app: 'fundraising' });
  } else if (neg.status === 'walked_cp') {
    if (inv.status === 'term_sheet') passInvestor(state, inv, neg.flags.pulled ? 'You pushed on an exploding offer; they withdrew it.' : 'They withdrew the term sheet after the negotiation.', { email: false });
  } else if (neg.status === 'walked_player') {
    if (inv.status === 'term_sheet') passInvestor(state, inv, 'You declined the terms.', { email: false, byFounder: true });
  }
}

registerAdapter(KIND, { label: 'VC term sheet', batna, onClose });

export { saleConsent, vestingForfeit, saleVestingForfeit } from './gov.js';
export { getNegotiation };
