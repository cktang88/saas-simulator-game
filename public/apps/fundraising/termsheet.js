// Term-sheet redlines: several rounds of markup between the founder and the investor, clause by clause.
//
// A lead's first draft is more investor-friendly than what gets signed (the market prevalence figures, e.g. 1x
// non-participating in ~96% of US deals, describe SIGNED deals). Each round the founder marks every clause accept /
// push back (with a value) / trade (concede it to buy movement elsewhere) and may add a note; optional startup
// counsel reviews the draft first and flags what is off-market. The investor answers per clause (accept, partial
// meet, hold firm) on the timing engine, a few business days later, and may pull the term sheet when the founder
// over-negotiates without leverage, re-trades agreed points, bluffs, or pushes an exploding offer.
// Agreed terms flow into close() (cap table, preference, governance) and the exit waterfall.
//
// Research: docs/research/term-sheet-negotiation.md, docs/research/negotiation/vc-terms.md.
// Numbers marked [design] are game assumptions, never real statistics.

import { rng, chance, clamp, money, hash } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { timeline, explain } from '../../core/timing.js';
import { raiseLeverage } from './process.js';
import { frMistake } from './operator.js';
import { isAngelLike } from './investors.js';
import { prefCostUsd, effectivePreMoney, BOARD_TEXT, VESTING_TEXT, PROTECTIVE_TEXT } from '../negotiate/vc-terms.js';
import { ensureFr, passInvestor, raiseContext, investorEmail } from './sim.js';

// ---- Costs and timing ----
// Founder hours per markup round: read the draft, decide positions, write the note, a call with the partner [design].
export const REDLINE_HOURS = { priced: 2, safe: 0.5 };
// Startup counsel review of one draft: ~2-4 partner hours on a priced seed term sheet, a quick read of a SAFE and
// side letter. Seed rounds average ~$17K of legal fees in total (Pilot, 9,059 transactions) [design per round].
export const COUNSEL = { priced: { usd: 2500, hours: 0.75 }, safe: { usd: 750, hours: 0.5 } };
export const MAX_ROUNDS = { priced: 4, safe: 2 }; // after this the investor calls it best and final [design]
// Turnaround of a markup: partners and their counsel return redlines in a few business days; hot rounds faster.
export const REDLINE_TIMING = {
  priced: { median: 3, p90: 8, unit: 'bday', src: '[design] lead partner + fund counsel turn a term-sheet markup in ~2-5 business days (practitioner accounts)' },
  safe: { median: 1.5, p90: 5, unit: 'bday', src: '[design] a SAFE side-letter question is answered in a day or two' },
  counsel: { median: 2, p90: 5, unit: 'bday', src: '[design] startup counsel turns a term-sheet review in 1-3 business days' },
};
// Hiring-plan pool: what a 12-18 month hiring plan needs [design]; pools sized to a plan rather than a round number
// are the standard founder ask (docs/research/term-sheet-negotiation.md §2).
export const HIRING_PLAN_POOL = { seed: 0.08, 'series-a': 0.1 };
const HARD = { multistage: 1.6, cvc: 1.3, micro_vc: 0.8, seed_fund: 1, family_office: 0.9 };

// ---- Clauses ----
// `order` is founder-best first. `market` lists the market-standard positions (sourced where possible, see the doc).
const CHOICE = {
  liq: { order: ['np1', 'p1', 'np2', 'p2'], market: ['np1'], text: { np1: '1x non-participating', p1: '1x participating', np2: '2x non-participating', p2: '2x participating' } },
  proRata: { order: ['none', 'major', 'all'], market: ['major'], text: { none: 'no pro rata', major: 'pro rata for major investors', all: 'pro rata for every investor' } },
  board: { order: ['founder', 'indep', 'balanced', 'investor'], market: { seed: ['founder', 'indep'], 'series-a': ['indep', 'balanced'] }, text: BOARD_TEXT },
  protective: { order: ['light', 'standard', 'broad'], market: ['light', 'standard'], text: PROTECTIVE_TEXT },
  info: { order: ['standard', 'monthly'], market: ['standard'], text: { standard: 'quarterly financials + annual budget to major investors', monthly: 'monthly reporting package, budget approval and inspection rights' } },
  vesting: { order: ['keep', 'partial', 'reset'], market: ['keep', 'partial'], text: VESTING_TEXT },
  noShop: { order: [30, 45, 60, 90], market: [30, 45, 60], text: { 30: '30-day no-shop', 45: '45-day no-shop', 60: '60-day no-shop', 90: '90-day no-shop' } },
  discount: { order: [0, 0.1, 0.15, 0.2, 0.25, 0.3], market: [0, 0.1, 0.15, 0.2], text: { 0: 'no discount', 0.1: '10% discount', 0.15: '15% discount', 0.2: '20% discount', 0.25: '25% discount', 0.3: '30% discount' } },
  mfn: { order: ['none', 'mfn'], market: ['none', 'mfn'], text: { none: 'no MFN', mfn: 'MFN' } },
  safeProRata: { order: ['none', 'pr'], market: ['none', 'pr'], text: { none: 'no side letter', pr: 'pro rata side letter' } },
};
export const CLAUSES = {
  preMoney: { label: 'Pre-money valuation', group: 'economics', type: 'money', why: 'Headline price. Read it together with the pool: the shuffle can take 10%+ off it.' },
  roundSize: { label: 'Round size', group: 'economics', type: 'money', why: 'More money is more dilution; the lead sizes it to its ownership target (±15% is negotiable).' },
  pool: { label: 'Option pool (post-money, in the pre)', group: 'economics', type: 'pct', why: 'The top-up comes out of the existing holders, not the new investor. Size it to a 12-18 month hiring plan.' },
  liq: { label: 'Liquidation preference', group: 'economics', type: 'choice', why: '1x non-participating is ~96% of US deals (Cooley). Participation or a multiple takes money from common at every exit.' },
  proRata: { label: 'Pro rata rights', group: 'rights', type: 'choice', why: 'Major investors get pro rata as standard; striking it is an unreasonable ask, granting it to everyone crowds the next round.' },
  board: { label: 'Board composition', group: 'control', type: 'choice', why: 'Seed: 2 founders + 1 investor; Series A: 2-2-1. An investor majority can replace the CEO and decide a sale.' },
  protective: { label: 'Protective provisions', group: 'control', type: 'choice', why: 'Standard vetoes cover new senior stock, a sale and charter changes. Broad ones add budget, hiring and debt vetoes.' },
  info: { label: 'Information rights', group: 'rights', type: 'choice', why: 'Quarterly financials and an annual budget are standard; monthly packages and budget approval cost founder hours every month.' },
  vesting: { label: 'Founder vesting', group: 'control', type: 'choice', why: 'Credit for time served with double-trigger acceleration is standard; a full re-vest forfeits stock if you leave or sell early.' },
  noShop: { label: 'No-shop / exclusivity', group: 'process', type: 'choice', why: '30-60 days is market. A long no-shop removes the lead\'s pressure to close while you cannot talk to anyone else.' },
  cap: { label: 'Valuation cap (post-money)', group: 'economics', type: 'money', why: 'The price of the SAFE. Carta 2025 medians: ~$10M for $250K-1M rounds, ~$15M for $1-2.5M.' },
  discount: { label: 'Discount', group: 'economics', type: 'choice', why: 'Cap-only is 61% of SAFEs, cap + discount 30% (Carta 2024), usually 20%. More than 20% is off-market.' },
  mfn: { label: 'MFN', group: 'rights', type: 'choice', why: 'Most-favoured-nation: they get any better terms you give later SAFE investors. Common, but it ties your later SAFEs.' },
  safeProRata: { label: 'Pro rata side letter', group: 'rights', type: 'choice', why: 'Funds often ask for a pro rata side letter (YC form). Normal for a fund, unusual for a small angel check.' },
};
export const PRICED_IDS = ['preMoney', 'roundSize', 'pool', 'liq', 'board', 'protective', 'vesting', 'proRata', 'info', 'noShop'];
export const SAFE_IDS = ['cap', 'discount', 'mfn', 'safeProRata'];
// How much a trade on this clause is worth to the investor (goodwill toward the other asks) [design].
const TRADE_W = { info: 0.6, proRata: 0.7, safeProRata: 0.7, noShop: 0.4, mfn: 0.5, discount: 0.5, pool: 0.8, roundSize: 0.5, preMoney: 1, cap: 1, liq: 1, board: 1, protective: 0.8, vesting: 0.8 };
// What each clause is about: the focus a stellar operator spends their asks on.
export const MATTERS = new Set(['liq', 'board', 'protective', 'vesting', 'pool']);

const isSafe = (t) => t?.instrument === 'safe';
const choiceKey = (id) => (id === 'proRata' ? 'proRata' : id);
const marketOf = (id, stage) => { const m = CHOICE[id]?.market; return Array.isArray(m) ? m : m?.[stage === 'series-a' ? 'series-a' : 'seed'] ?? []; };

// A private stream per investor so drafting the term sheet never moves the main rng(state) sequence.
function stream(state, salt) {
  let s = (parseInt(hash(`${state.seed}|tsr|${salt}`), 36) | 0) || 1;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Read one clause's value off the terms (choice clauses as their option key). */
export function clauseValue(t, id) {
  switch (id) {
    case 'preMoney': return t.preMoney;
    case 'roundSize': return t.roundSize ?? t.amount;
    case 'pool': return t.poolTargetPost ?? 0;
    case 'liq': return `${t.participating ? 'p' : 'np'}${t.liqPref ?? 1}`;
    case 'proRata': return t.proRata === false ? 'none' : t.proRataLevel === 'all' ? 'all' : 'major';
    case 'board': return t.boardSeats ?? 'founder';
    case 'protective': return t.protective ?? 'standard';
    case 'info': return t.info ?? 'standard';
    case 'vesting': return t.vesting ?? 'keep';
    case 'noShop': return t.noShopDays ?? 45;
    case 'cap': return t.cap;
    case 'discount': return t.discount ?? 0;
    case 'mfn': return t.mfn ? 'mfn' : 'none';
    case 'safeProRata': return t.proRata ? 'pr' : 'none';
    default: return null;
  }
}
function setClause(t, id, v, ctx = {}) {
  switch (id) {
    case 'preMoney': t.preMoney = Math.round(v / 100000) * 100000; break;
    case 'roundSize': {
      const rs0 = t.roundSize ?? t.amount;
      const rs = Math.round(v / 100000) * 100000;
      t.amount = Math.round((t.amount * rs) / rs0 / 100000) * 100000;
      t.roundSize = rs;
      break;
    }
    case 'pool': t.poolTargetPost = +Number(v).toFixed(3); break;
    case 'liq': t.participating = v.startsWith('p'); t.liqPref = Number(v.slice(-1)); break;
    case 'proRata': t.proRata = v !== 'none'; t.proRataLevel = v; break;
    case 'board': t.boardSeats = v; t.boardSeat = v !== 'founder' || ctx.stage !== 'pre-seed'; break;
    case 'protective': t.protective = v; break;
    case 'info': t.info = v; break;
    case 'vesting': t.vesting = v; break;
    case 'noShop': t.noShopDays = Number(v); break;
    case 'cap': t.cap = Math.round(v / 250000) * 250000; break;
    case 'discount': t.discount = Number(v); break;
    case 'mfn': t.mfn = v === 'mfn'; break;
    case 'safeProRata': t.proRata = v === 'pr'; break;
  }
  if (!isSafe(t) && t.preMoney != null) t.postMoney = t.preMoney + (t.roundSize ?? t.amount);
}
export function clauseText(t, id) {
  const v = clauseValue(t, id);
  const c = CLAUSES[id];
  if (c.type === 'money') return money(v);
  if (c.type === 'pct') return `${Math.round(v * 1000) / 10}%`;
  return CHOICE[choiceKey(id)]?.text?.[v] ?? String(v);
}
export const clauseIds = (t) => (isSafe(t) ? SAFE_IDS : PRICED_IDS);

/** Off-market clauses on the terms right now: what counsel flags. */
export function offMarket(t, stage = 'seed') {
  const out = [];
  for (const id of clauseIds(t)) {
    const v = clauseValue(t, id);
    if (id === 'pool') {
      const plan = HIRING_PLAN_POOL[stage === 'series-a' ? 'series-a' : 'seed'];
      if (v > plan + 0.025) out.push({ id, label: CLAUSES[id].label, now: clauseText(t, id), market: `~${Math.round(plan * 100)}% sized to a 12-18 month hiring plan`, severity: v >= 0.14 ? 'high' : 'mid' });
      continue;
    }
    if (CLAUSES[id].type !== 'choice') continue;
    const mk = marketOf(choiceKey(id), stage);
    if (!mk.length || mk.includes(v)) continue;
    out.push({ id, label: CLAUSES[id].label, now: clauseText(t, id), market: mk.map((x) => CHOICE[choiceKey(id)].text[x]).join(' or '), severity: MATTERS.has(id) || id === 'discount' ? 'high' : 'mid' });
  }
  return out;
}

// ---- The investor's first draft ----
// Draft anchors a lead adds above what it will settle for (the pool shuffle above all) [design]; hardball funds more.
export function draftTermSheet(state, inv, t, stage, { anchors = true } = {}) {
  const ts = { version: 1, rounds: [], clauses: {}, pending: null, counsel: null, asks: 0, retrades: 0, bluffs: 0, final: false, stage };
  const r = stream(state, inv.id);
  const h = anchors ? HARD[inv.kind] ?? 1 : 0;
  const anchored = new Set();
  if (!isSafe(t)) {
    const basePool = t.poolTargetPost ?? 0.1;
    if (r() < Math.min(0.9, 0.6 * h)) { t.poolTargetPost = +Math.min(0.2, basePool + 0.01 + 0.03 * r()).toFixed(3); anchored.add('pool'); }
    if ((t.info ?? 'standard') === 'standard' && r() < 0.3 * h) { t.info = 'monthly'; anchored.add('info'); }
    if ((t.protective ?? 'standard') !== 'broad' && r() < 0.15 * h) { t.protective = 'broad'; anchored.add('protective'); }
    if ((t.noShopDays ?? 45) <= 45 && r() < 0.35 * h) { t.noShopDays = r() < 0.3 ? 90 : 60; anchored.add('noShop'); }
    if (!t.participating && r() < 0.1 * h) { t.participating = true; anchored.add('liq'); }
    if (stage !== 'series-a' && (t.boardSeats ?? 'founder') === 'founder' && r() < 0.12 * h) { t.boardSeats = 'balanced'; anchored.add('board'); }
    if ((t.vesting ?? 'keep') === 'keep' && r() < 0.08 * h) { t.vesting = 'reset'; anchored.add('vesting'); }
    t.info ??= 'standard';
    t.proRataLevel ??= 'major';
    const room = (0.02 + 0.08 * r()) * (h > 1.2 ? 0.7 : 1);
    for (const id of PRICED_IDS) {
      const v = clauseValue(t, id);
      const c = { opening: v, anchored: anchored.has(id), agreed: false };
      if (id === 'preMoney') c.floor = v * (1 + room);
      else if (id === 'roundSize') c.floor = [v * 0.85, v * 1.15];
      else if (id === 'pool') c.floor = Math.max(HIRING_PLAN_POOL[stage === 'series-a' ? 'series-a' : 'seed'], (anchored.has('pool') ? basePool : v) - 0.03);
      else {
        const mk = marketOf(id, stage);
        // Anchors and off-market draws concede to the worst market position; market positions are held.
        const order = CHOICE[id].order;
        c.floor = mk.includes(v) ? v : mk.slice().sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] ?? v;
        c.firm = !anchored.has(id) && !mk.includes(v); // off-market but not an anchor: they really want it
      }
      ts.clauses[id] = c;
    }
  } else {
    const room = 0.03 + 0.07 * r();
    for (const id of SAFE_IDS) {
      const v = clauseValue(t, id);
      const c = { opening: v, anchored: false, agreed: false };
      if (id === 'cap') c.floor = v * (1 + (t.countered ? room * 0.4 : room));
      else if (id === 'discount') c.floor = v > 0.2 ? 0.2 : v;
      else if (id === 'safeProRata') c.floor = isAngelLike(inv) ? 'none' : v; // a fund keeps its side letter
      else c.floor = v;
      ts.clauses[id] = c;
    }
  }
  return ts;
}
export const tsOf = (inv) => inv?.terms?.redline ?? null;

function ensureTs(state, inv) {
  const t = inv.terms;
  if (!t.redline) {
    const stage = ensureFr(state).raise?.stage ?? (isSafe(t) ? 'pre-seed' : 'seed');
    // A term sheet that came in before redlines existed (or from a test) gets no extra anchors.
    t.redline = draftTermSheet(state, inv, t, stage, { anchors: false });
  }
  return t.redline;
}

// ---- Counsel ----
/** Ask startup counsel to review the current draft. Charges the fee now; the flags arrive on the timing engine. */
export function requestCounsel(state, inv) {
  const t = inv?.terms;
  if (!t || inv.status !== 'term_sheet') return { error: 'There is no open term sheet from this investor.' };
  const ts = ensureTs(state, inv);
  if (ts.counsel && ts.counsel.version === ts.version) return { error: 'Counsel already has this draft.' };
  const c = COUNSEL[isSafe(t) ? 'safe' : 'priced'];
  post(state, { amount: -c.usd, counterparty: 'Startup counsel', description: `Term sheet review (${inv.firm || inv.name}, draft ${ts.version})`, category: 'legal', method: 'card' });
  const tl = timeline(state, `fundraising.counsel.${inv.id}`, [ts.rounds.length ? { label: 'second look at a known draft', speed: 0.6 } : null], { def: REDLINE_TIMING.counsel });
  ts.counsel = { version: ts.version, day: state.day, readyDay: tl.day, flags: null };
  ts.counselUsd = (ts.counselUsd ?? 0) + c.usd;
  return { ok: true, hoursCost: c.hours, usdCost: c.usd, readyDay: tl.day, eta: explain(tl) };
}
/** Counsel's flags for the current draft, or null while nobody has reviewed it. */
export function counselFlags(state, inv) {
  const ts = tsOf(inv);
  if (!ts?.counsel || ts.counsel.version !== ts.version || ts.counsel.readyDay > state.day) return null;
  return ts.counsel.flags ?? offMarket(inv.terms, ts.stage);
}

// ---- One markup round ----
const REASON_RE = /\b(because|hiring plan|market|standard|nvca|cooley|carta|yc|runway|we plan|so that|in exchange|instead|month[s]? of)\b/gi;
const COMPETING_RE = /\b(term sheet|other (offer|lead|fund|investor)s?|another (offer|lead|fund|investor)|competing|competitive|multiple offers)\b/i;
const dirOk = (id, cur, ask) => {
  const c = CLAUSES[id];
  if (id === 'roundSize') return ask !== cur && ask > 0;
  if (c.type === 'money') return ask > cur;
  if (c.type === 'pct') return ask < cur && ask >= 0;
  const o = CHOICE[choiceKey(id)].order;
  return o.indexOf(ask) >= 0 && o.indexOf(ask) < o.indexOf(cur);
};
const parseChoice = (id, v) => { const o = CHOICE[choiceKey(id)].order; return o.find((x) => String(x) === String(v)) ?? null; };

/**
 * Send a markup. marks: { [clauseId]: { action: 'accept'|'push'|'trade', value } }; clauses left out count as accepted.
 * Returns { ok, hoursCost, responseDay } or { error }. The investor answers on `responseDay` (redlineDay in the tick).
 */
export function submitRedline(state, inv, { marks = {}, note = '' } = {}) {
  const t = inv?.terms;
  if (!t || inv.status !== 'term_sheet') return { error: 'There is no open term sheet from this investor.' };
  if (!isSafe(t) && !t.lead) return { error: 'Followers invest on the lead\'s terms; there is nothing to redline.' };
  const ts = ensureTs(state, inv);
  if (ts.pending) return { error: 'Your last markup is still with them.' };
  const ids = clauseIds(t);
  const clean = {};
  for (const [id, m] of Object.entries(marks)) {
    if (!ids.includes(id) || !m || !['accept', 'push', 'trade'].includes(m.action)) continue;
    if (m.action !== 'push') { clean[id] = { action: m.action }; continue; }
    const cur = clauseValue(t, id);
    const ask = CLAUSES[id].type === 'choice' ? parseChoice(id, m.value) : Number(m.value);
    if (ask == null || (CLAUSES[id].type !== 'choice' && !Number.isFinite(ask)) || !dirOk(id, cur, ask)) {
      return { error: `${CLAUSES[id].label}: push for something better for you than ${clauseText(t, id)}.` };
    }
    clean[id] = { action: 'push', value: ask };
  }
  const pushes = Object.entries(clean).filter(([, m]) => m.action === 'push');
  if (!pushes.length) return { error: 'Nothing to send: no clause is pushed back. Sign it instead.' };
  const fr = ensureFr(state);
  const competing = competingLeads(fr, inv);
  const roundNo = ts.rounds.length + 1;
  const fresh = Boolean(ts.counsel && ts.counsel.version === ts.version && ts.counsel.readyDay <= state.day);
  const f = [
    competing ? { label: 'competing term sheets: they move fast', pull: -0.7 } : null,
    pushes.length > 4 ? { label: `long markup (${pushes.length} asks)`, pull: Math.min(1, 0.15 * (pushes.length - 4)) } : null,
    roundNo >= 3 ? { label: 'deal fatigue', pull: 0.3 } : null,
    fresh ? { label: 'clean counsel markup', pull: -0.2 } : null,
    ['multistage', 'cvc'].includes(inv.kind) ? { label: 'partnership sign-off', speed: 1.3 } : null,
  ];
  const tl = timeline(state, `fundraising.redline.${inv.id}`, f, { def: REDLINE_TIMING[isSafe(t) ? 'safe' : 'priced'] });
  ts.pending = { day: tl.day, sentDay: state.day, marks: clean, note: String(note).slice(0, 2000), counsel: fresh, eta: explain(tl) };
  inv.termExpiresDay = Math.max(inv.termExpiresDay ?? state.day, tl.day + 1); // the offer stays open while they read it
  inv.log ??= [];
  inv.log.push({ day: state.day, text: `Sent markup ${roundNo}: ${pushes.map(([id, m]) => `${CLAUSES[id].label} → ${valueText(id, m.value)}`).join('; ')}.` });
  return { ok: true, hoursCost: REDLINE_HOURS[isSafe(t) ? 'safe' : 'priced'], responseDay: tl.day, eta: explain(tl) };
}
export function valueText(id, v) {
  const c = CLAUSES[id];
  if (c.type === 'money') return money(v);
  if (c.type === 'pct') return `${Math.round(v * 1000) / 10}%`;
  return CHOICE[choiceKey(id)]?.text?.[v] ?? String(v);
}
function competingLeads(fr, inv) {
  return fr.investors.filter((i) => i !== inv && i.raiseId === inv.raiseId && i.status === 'term_sheet' && i.terms && (i.terms.lead || (isSafe(i.terms) && i.leads && !isAngelLike(i)))).length;
}

// Distance of an ask beyond the investor's floor, in "steps" (1 = one option, or 10% of price) [design].
function overreach(id, c, ask, cur) {
  const type = CLAUSES[id].type;
  if (id === 'roundSize') return ask < c.floor[0] ? (c.floor[0] - ask) / (0.1 * cur) : ask > c.floor[1] ? (ask - c.floor[1]) / (0.1 * cur) : 0;
  if (type === 'money') return Math.max(0, (ask / c.floor - 1) / 0.1);
  if (type === 'pct') return Math.max(0, (c.floor - ask) / 0.03);
  const o = CHOICE[choiceKey(id)].order;
  return Math.max(0, o.indexOf(c.floor) - o.indexOf(ask));
}
function isMarketAsk(id, v, stage) {
  if (id === 'pool') return v >= HIRING_PLAN_POOL[stage === 'series-a' ? 'series-a' : 'seed'] - 1e-9;
  if (CLAUSES[id].type !== 'choice') return false;
  return marketOf(choiceKey(id), stage).includes(v);
}
/** What trading a clause gives the investor: one step toward them, or null when there is nothing left to give. */
export function tradeValue(id, cur) {
  const type = CLAUSES[id].type;
  if (type === 'money') return null; // price is not a trade chip; push or accept it
  if (type === 'pct') return cur < 0.2 ? +(cur + 0.01).toFixed(3) : null;
  const o = CHOICE[choiceKey(id)].order;
  const i = o.indexOf(cur);
  return i >= 0 && i < o.length - 1 ? o[i + 1] : null;
}
function partialValue(id, c, ask, cur) {
  const type = CLAUSES[id].type;
  if (id === 'roundSize') return (ask + cur) / 2;
  if (type === 'money') return ask <= c.floor ? (cur + ask) / 2 : Math.max(cur, c.floor);
  if (type === 'pct') return Math.max(ask, Math.max(c.floor, (cur + ask) / 2));
  const o = CHOICE[choiceKey(id)].order;
  const target = Math.max(o.indexOf(ask), o.indexOf(c.floor));
  const step = Math.min(o.indexOf(cur), Math.max(target, o.indexOf(cur) - 1));
  return o[step];
}

/** The investor's answer to the pending markup. Called by the daily tick when the response is due. */
export function resolveRedline(state, inv) {
  const t = inv.terms;
  const ts = tsOf(inv);
  const p = ts?.pending;
  if (!p || inv.status !== 'term_sheet') { if (ts) ts.pending = null; return null; }
  const fr = ensureFr(state);
  const ctx = raiseContext(state);
  const S = ctx.S ?? 3;
  const lev = raiseLeverage(state);
  const competing = competingLeads(fr, inv);
  const mentions = COMPETING_RE.test(p.note);
  const bluff = mentions && competing === 0;
  const reasons = Math.min(2, (p.note.match(REASON_RE) ?? []).length);
  const roundNo = ts.rounds.length + 1;
  const h = HARD[inv.kind] ?? 1;
  const levLift = competing ? Math.min(0.25, 0.1 * competing) * (mentions ? 1 : 0.5) : 0; // [design] 5-15% per credible lead
  let goodwill = 0, over = 0, retrades = 0;
  const pushes = Object.entries(p.marks).filter(([, m]) => m.action === 'push');
  // A trade gives the investor one step on that clause (monthly reporting, pro rata for all, +1pt of pool, a smaller
  // discount...). It buys goodwill only when there was something left to give.
  const trades = {};
  for (const [id, m] of Object.entries(p.marks)) {
    if (m.action !== 'trade') continue;
    const v = tradeValue(id, clauseValue(t, id));
    if (v == null) continue;
    trades[id] = v;
    goodwill += TRADE_W[id] ?? 0.5;
  }
  goodwill = Math.min(2, goodwill);
  ts.asks += pushes.length;
  const responses = {};
  for (const [id, m] of pushes) {
    const c = ts.clauses[id];
    const cur = clauseValue(t, id);
    if (c.agreed) retrades++;
    // Real leverage raises the price floor (and softens their hold on the rest).
    const floorC = CLAUSES[id].type === 'money' && id !== 'roundSize' ? { ...c, floor: c.floor * (1 + levLift) } : c;
    const dist = overreach(id, floorC, m.value, cur);
    let pAcc = (dist <= 0 ? (c.firm ? 0.45 : c.anchored ? 0.8 : 0.7) : 0)
      + 0.06 * (S - 3) + 0.08 * goodwill + (p.counsel ? 0.05 : 0) + 0.03 * reasons + (competing ? 0.08 : 0)
      - 0.04 * Math.max(0, ts.asks - 6) - 0.08 * Math.max(0, roundNo - 2) - (h > 1.2 && MATTERS.has(id) ? 0.1 : 0) - (c.agreed ? 0.3 : 0);
    if (t.exploding) pAcc = 0;
    let out = 'hold', value = cur;
    if (dist <= 0 && chance(state, clamp(pAcc, 0, 0.95))) { out = 'accept'; value = m.value; }
    else if (!t.exploding && chance(state, clamp(dist <= 0 ? 0.75 : 0.25 + (competing ? 0.15 : 0) + 0.05 * goodwill, 0, 0.9))) {
      value = partialValue(id, floorC, m.value, cur);
      out = value === cur ? 'hold' : value === m.value ? 'accept' : 'partial';
    }
    // An ask for the market-standard position is not greedy even when it is past their floor: half weight [design].
    over += dist * (isMarketAsk(id, m.value, ts.stage) ? 0.5 : 1);
    responses[id] = { ask: m.value, out, value, dist: +dist.toFixed(2) };
  }
  // Walk risk: overreach without leverage, re-trades, a bluff, pushing an exploding or "final" offer, fatigue [design].
  let pWalk = 0.05 * over * (competing ? 0.5 : 1) * (lev.terms < 1 ? 1.5 : 1)
    + 0.3 * retrades + (bluff ? 0.15 : 0) + 0.05 * Math.max(0, roundNo - 3) + 0.04 * Math.max(0, ts.asks - 8)
    + (t.exploding ? 0.45 : 0) + (ts.final ? 0.25 : 0) - 0.02 * (S - 3);
  pWalk = clamp(pWalk, 0, 0.9);
  const walked = chance(state, pWalk);
  if (retrades) {
    ts.retrades += retrades;
    fr.reputation = (fr.reputation ?? 0) - 0.3 * retrades;
    frMistake(state, 'fundraising', 'retraded_term_sheet', 'Re-traded agreed term-sheet points', { reputation: 0.5 * retrades, days: 3 }, `Reopened ${retrades} point${retrades > 1 ? 's' : ''} already agreed with ${inv.name}. Investors read re-trading as a founder who will be hard to work with; it raised the odds they walk (+${Math.round(30 * retrades)} pts) and cost goodwill on the rest.`);
  }
  if (bluff) {
    ts.bluffs++;
    fr.reputation = (fr.reputation ?? 0) - 0.5;
    frMistake(state, 'fundraising', 'bluffed_competing_term_sheet', 'Bluffed a competing term sheet', { reputation: 1 }, `Your note to ${inv.name} implied another offer when there was none. Partners check with each other; it added walk risk and gave you no leverage.`);
  }
  const round = { n: roundNo, trades, sentDay: p.sentDay, day: state.day, marks: p.marks, note: p.note, counsel: p.counsel, responses, pWalk: +pWalk.toFixed(2), walked, competing, bluff };
  ts.rounds.push(round);
  ts.pending = null;
  if (walked) {
    const why = t.exploding ? 'You pushed on an exploding offer; they withdrew it.' : retrades ? 'You reopened points we had agreed. We are going to step back.' : bluff ? 'We do not think we are the right partner for this round.' : 'We are too far apart on terms; we are withdrawing the term sheet.';
    passInvestor(state, inv, why, { email: true });
    frMistake(state, 'fundraising', 'overnegotiated_term_sheet', 'Over-negotiated and lost the term sheet', { days: 45, reputation: 0.5 }, `${inv.name} pulled the term sheet after markup ${roundNo} (${ts.asks} asks so far, ${competing ? `${competing} competing term sheet(s)` : 'no competing term sheet'}, walk risk ~${Math.round(pWalk * 100)}%). Restarting with another lead typically costs 4-8 weeks [design]. Spend asks on control, the preference and the pool shuffle, and push price only with a real second offer.`, { delayed: false });
    notify(state, `${inv.name} pulled the term sheet after your markup.`, { type: 'bad', app: 'fundraising' });
    return round;
  }
  const stage = ts.stage;
  for (const [id, r] of Object.entries(responses)) {
    if (r.out !== 'hold') setClause(t, id, r.value, { stage });
    if (r.out === 'accept') ts.clauses[id].agreed = true;
  }
  for (const [id, v] of Object.entries(trades)) setClause(t, id, v, { stage });
  for (const [id, m] of Object.entries(p.marks)) if (m.action !== 'push') ts.clauses[id].agreed = true;
  t.downRound = Boolean(fr.lastPostMoney && (isSafe(t) ? t.cap : t.postMoney) < fr.lastPostMoney);
  t.negotiated = true;
  ts.version++;
  if (roundNo >= MAX_ROUNDS[isSafe(t) ? 'safe' : 'priced']) ts.final = true;
  inv.termExpiresDay = state.day + (t.exploding ? 2 : 10); // [design] a revised draft stays open about two business weeks
  const summary = Object.entries(responses).map(([id, r]) => `${CLAUSES[id].label}: ${r.out === 'accept' ? 'agreed' : r.out === 'partial' ? `met you partway (${valueText(id, r.value)})` : 'holding'}`).join('; ');
  inv.log ??= [];
  inv.log.push({ day: state.day, text: `Response to markup ${roundNo}: ${summary}.${ts.final ? ' Best and final.' : ''}` });
  investorEmail(state, inv, 'redline', { summary, final: ts.final });
  notify(state, `${inv.name} answered your markup: ${summary}.${ts.final ? ' They call this best and final.' : ''} Respond by ${inv.termExpiresDay - state.day} days.`, { type: 'good', app: 'fundraising' });
  return round;
}

/** Daily tick: deliver counsel flags and investor responses that are due. */
export function redlineDay(state, inv) {
  const ts = tsOf(inv);
  if (!ts || inv.status !== 'term_sheet') return;
  if (ts.counsel && !ts.counsel.flags && ts.counsel.readyDay <= state.day && ts.counsel.version === ts.version) {
    ts.counsel.flags = offMarket(inv.terms, ts.stage);
    notify(state, `Counsel reviewed ${inv.name}'s ${isSafe(inv.terms) ? 'SAFE' : 'term sheet'}: ${ts.counsel.flags.length ? `${ts.counsel.flags.length} off-market term${ts.counsel.flags.length > 1 ? 's' : ''} flagged (${ts.counsel.flags.map((f) => f.label).join(', ')}).` : 'nothing off-market.'}`, { type: ts.counsel.flags.length ? 'warn' : 'good', app: 'fundraising' });
  }
  if (ts.pending && ts.pending.day <= state.day) resolveRedline(state, inv);
}

// ---- Signing: make what was signed traceable, and grade the negotiation ----
/** Called by acceptTerms. Logs the cost of every off-market term signed and stores a review for the founder. */
export function traceSignedTerms(state, inv) {
  const t = inv.terms;
  const ts = t.redline ?? null;
  if (ts?.pending) ts.pending = null; // signing the current draft withdraws an open markup
  const stage = ts?.stage ?? ensureFr(state).raise?.stage ?? 'seed';
  const flags = offMarket(t, stage);
  const reviewed = Boolean(ts?.counsel && ts.counsel.readyDay <= state.day);
  const who = reviewed ? 'counsel had flagged it' : 'no counsel review: nobody flagged it';
  const m = (id, label, cost, detail) => frMistake(state, 'fundraising', id, label, cost, `${detail} (${who}).`, { delayed: true });
  if (!isSafe(t)) {
    const invested = t.roundSize ?? t.amount;
    const own = invested / Math.max(1, t.postMoney);
    for (const f of flags) {
      if (f.id === 'liq') m('signed_participating_pref', 'Signed a participating or multiple preference', { usd: prefCostUsd({ invested, ownership: own, liqPref: t.liqPref, participating: t.participating, exitValue: 3 * t.postMoney }) }, `${clauseText(t, 'liq')}: at a ${money(3 * t.postMoney)} exit it takes that much more from common than 1x non-participating (~96% of US deals, Cooley)`);
      else if (f.id === 'pool') {
        const plan = HIRING_PLAN_POOL[stage === 'series-a' ? 'series-a' : 'seed'];
        const eff = effectivePreMoney({ preMoney: t.preMoney, investment: invested, poolPostPct: t.poolTargetPost });
        m('pool_shuffle_signed', 'Signed an oversized pre-money option pool', { usd: Math.round((t.poolTargetPost - plan) * t.postMoney) }, `A ${clauseText(t, 'pool')} pool in the pre-money makes the ${money(t.preMoney)} headline worth ${money(eff.effective)}; a hiring-plan pool (~${Math.round(plan * 100)}%) would have saved the difference`);
      } else if (f.id === 'board') m('gave_up_board_control', 'Gave up board control', { reputation: 0 }, `${clauseText(t, 'board')}: the investors can outvote you on a sale or on replacing the CEO`);
      else if (f.id === 'protective') m('broad_protective_provisions', 'Signed broad protective provisions', { hours: 12 }, 'Budget, hiring and debt vetoes: every one is a consent request, and a sale below their target can be blocked');
      else if (f.id === 'vesting') m('founder_vesting_reset', 'Accepted a full founder re-vest', { reputation: 0 }, 'Your stock re-vests over 4 years with a cliff and no acceleration: leave or sell early and the unvested part is forfeited');
      else if (f.id === 'info') m('heavy_information_rights', 'Signed heavy information rights', { hours: 48 }, 'Monthly reporting packages and budget approval: about 4 founder hours a month for the life of the company');
      else if (f.id === 'noShop') m('long_no_shop', 'Signed a long no-shop', { days: 20 }, `${clauseText(t, 'noShop')}: the lead has no pressure to close quickly and you cannot talk to anyone else meanwhile`);
      else if (f.id === 'proRata') m('pro_rata_for_all', 'Gave pro rata to every investor', { reputation: 0 }, 'Small holders with pro rata crowd the next round\'s allocation');
    }
    if (flags.length && !reviewed) frMistake(state, 'fundraising', 'signed_term_sheet_blind', 'Signed a term sheet without counsel review', { usd: 0 }, `${flags.length} off-market term(s) went through unflagged: ${flags.map((f) => f.label).join(', ')}. A ~${money(COUNSEL.priced.usd)} review would have flagged them.`, { delayed: true });
  } else {
    for (const f of flags) if (f.id === 'discount') m('safe_discount_off_market', 'Signed an off-market SAFE discount', { usd: Math.round(t.amount * (t.discount - 0.2) / (1 - t.discount)) }, `${clauseText(t, 'discount')} on top of a cap: 20% is the usual discount when there is one (Carta)`);
  }
  if (ts) {
    ts.signedDay = state.day;
    ts.review = negotiationReview(state, inv);
    const fr = ensureFr(state);
    if (fr.raise) fr.raise.termSheetReview = { invId: inv.id, ...ts.review };
  }
}

/**
 * Grade the negotiation and write what a stellar operator would have done (shown after signing or a walk).
 * Score [design]: focus of asks on what matters (control, preference, pool shuffle), off-market terms left at
 * signing, counsel use, leverage use on price, rounds, re-trades and bluffs.
 */
export function negotiationReview(state, inv) {
  const t = inv.terms;
  const ts = t?.redline;
  const safe = isSafe(t);
  const stage = ts?.stage ?? 'seed';
  const left = offMarket(t, stage);
  const rounds = ts?.rounds ?? [];
  const asks = rounds.flatMap((r) => Object.entries(r.marks).filter(([, m]) => m.action === 'push').map(([id]) => id));
  const priceAsks = asks.filter((id) => id === 'preMoney' || id === 'cap').length;
  const opening = ts ? Object.fromEntries(Object.entries(ts.clauses).map(([id, c]) => [id, c.opening])) : {};
  const openFlags = ts ? offMarket({ ...t, ...openingTerms(t, opening) }, stage) : left;
  const fixed = openFlags.filter((f) => !left.some((l) => l.id === f.id)).length;
  const counsel = Boolean(ts?.counsel);
  const competing = rounds.some((r) => r.competing);
  const levUsed = rounds.some((r) => r.competing && COMPETING_RE.test(r.note));
  let score = 0.5;
  if (openFlags.length) score += 0.35 * (fixed / openFlags.length) - 0.1 * left.filter((f) => f.severity === 'high').length;
  else score += 0.15;
  if (asks.length) score += 0.15 * (asks.filter((id) => MATTERS.has(id) || openFlags.some((f) => f.id === id)).length / asks.length) - (priceAsks === asks.length && asks.length >= 2 ? 0.15 : 0);
  score += counsel ? 0.1 : safe ? 0 : -0.1;
  if (competing) score += levUsed ? 0.05 : -0.05;
  else if (priceAsks) score -= 0.1; // pushed price with no second term sheet behind it
  score -= 0.2 * (ts?.retrades ?? 0) + 0.15 * (ts?.bluffs ?? 0) + 0.05 * Math.max(0, rounds.length - 3);
  score = clamp(score, 0, 1);
  const tier = score >= 0.8 ? 'stellar' : score >= 0.6 ? 'good' : score >= 0.4 ? 'average' : 'mediocre';
  const coaching = [];
  if (!counsel && !safe) coaching.push(`Have startup counsel mark up the first draft (~${money(COUNSEL.priced.usd)}, 1-3 days). It flags the off-market terms before you spend asks.`);
  for (const f of left) coaching.push(`${f.label}: you signed ${f.now}. A stellar operator asks for ${f.market} and explains why.`);
  if (priceAsks && priceAsks === asks.length && openFlags.length) coaching.push('You spent every ask on the headline price while the pool, preference or control terms cost more. Fix structure first; price moves only with a real second term sheet.');
  if (competing && !levUsed) coaching.push('You had a competing term sheet and never mentioned it: say so plainly (without naming the price) when you push on price.');
  if (ts?.retrades) coaching.push('Never reopen a point you already agreed: re-trading is the fastest way to lose a lead.');
  if (ts?.bluffs) coaching.push('Do not imply an offer you do not have. Investors check, and it costs reputation across the market.');
  if (rounds.length > 3) coaching.push('Two or three rounds is normal; by the fourth the partner is tired and walk risk climbs.');
  if (!coaching.length) coaching.push('Clean negotiation: asks focused on terms that decide control and exit proceeds, counsel involved, no re-trades.');
  return { tier, score: +score.toFixed(2), rounds: rounds.length, asks: asks.length, priceAsks, fixed, offMarketAtOpen: openFlags.length, offMarketSigned: left.map((f) => f.id), counsel, coaching: coaching.slice(0, 5) };
}
function openingTerms(t, opening) {
  const o = { ...t };
  for (const [id, v] of Object.entries(opening)) setClause(o, id, v, {});
  return o;
}

/** Monthly founder hours that signed information rights cost (read by the fundraising tick) [design]. */
export const INFO_RIGHTS_HOURS = { monthly: 4, standard: 0 };

/** Options for a choice clause, founder-best first: [{ value, text, market }]. */
export function clauseOptions(id, stage = 'seed') {
  const c = CHOICE[choiceKey(id)];
  if (!c) return [];
  const mk = marketOf(choiceKey(id), stage);
  return c.order.map((v) => ({ value: v, text: c.text[v] ?? String(v), market: mk.includes(v) }));
}
