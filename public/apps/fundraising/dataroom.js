// DocSend / Papermark-style tracked deck links, a diligence data room with a readiness checklist, and a
// Foundersuite-style intro-path finder over the founder's real network (tool-gap item 24, T7 §2-§5).
// Pure logic, no DOM. Numbers are [design] unless a source is named:
// - "Opened twice is not a term sheet": view analytics are a noisy intent signal (T7 failure modes). Here opens
//   barely depend on interest; forwards to a partner depend on it somewhat.
// - VCs as a rule do not sign NDAs to read a deck; an NDA gate mostly stops them from opening it [design].
// - Data room 2-4 h to assemble; ready before the first meeting shortens diligence (gap item 24 separation metric).

import { uid, rng, chance, clamp, hash } from '../../core/util.js';
import { ensureNetwork, introDecision } from '../../core/network.js';
import { computeMetrics, metricsSheet } from './metrics.js';
import { closableMonths } from '../money/ledger.js';
import { monthStartDay, nextMonthKey } from '../money/common.js';

const frOf = (state) => state.apps.fundraising;
const unit = (s) => parseInt(hash(s), 36) / 2 ** 32; // deterministic 0..1 from a string

// ---- Tracked links ----
export const LINK_HOURS = 0.05;
export const GATES = { none: 'Anyone with the link', email: 'Email required to view', nda: 'NDA click-through before viewing' };
export const DECK_MODES = { none: 'No deck: one-line ask, deck after the call', link: 'Tracked deck link', pdf: 'PDF attachment (untracked)' };

export function ensureRoom(state) {
  const fr = frOf(state);
  fr.shareLinks ??= [];
  fr.room ??= { items: {}, log: [] };
  return fr;
}

export function linkFor(state, invId) {
  return ensureRoom(state).shareLinks.filter((l) => l.invId === invId && !l.revoked).at(-1) ?? null;
}

export function createLink(state, inv, { gate = 'email', expiresDays = 30, download = false } = {}) {
  const fr = ensureRoom(state);
  for (const l of fr.shareLinks) if (l.invId === inv.id) l.revoked = true;
  const link = { id: uid('lnk'), invId: inv.id, name: inv.name, firm: inv.firm, day: state.day, gate: GATES[gate] ? gate : 'email', expiresDay: expiresDays ? state.day + expiresDays : null, download: Boolean(download), views: [], deckEvalId: fr.evaluations.at(-1)?.id ?? null };
  fr.shareLinks.push(link);
  return link;
}

export const linkLive = (state, l) => l && !l.revoked && (l.expiresDay == null || state.day <= l.expiresDay);

// Meeting-odds factor for how the deck went out with the first email [design]. A strong deck helps a little when
// sent cold; a weak one gets the founder passed on without a call (o5 trap "deck_before_call").
export function deckModeFactor(state, inv, S) {
  const mode = inv.outreach?.deck ?? 'none';
  if (mode === 'none') return 1;
  let f = S >= 3.5 ? 1.05 : S >= 3 ? 0.95 : 0.8;
  if (mode === 'link') {
    const l = linkFor(state, inv.id);
    if (!linkLive(state, l)) f *= 0.85; // expired link: "can you resend?" friction
    else if (l.gate === 'nda') f *= 0.5;
    else if (l.gate === 'email') f *= 0.98;
  }
  return f;
}

const SLIDES = ['Title', 'Problem', 'Solution', 'Traction', 'Market', 'Product', 'Business model', 'Competition', 'Team', 'Financials', 'The ask', 'Appendix'];

// Simulate viewer activity on the investor's link. interest: 0..1, whether they really are interested (hidden).
export function simulateViews(state, inv, interest, { phase = 'outreach' } = {}) {
  const l = linkFor(state, inv.id);
  if (!linkLive(state, l)) return [];
  const warm = inv.outreach?.channel === 'warm';
  const pOpen = (l.gate === 'nda' ? 0.15 : warm ? 0.85 : 0.5) + 0.08 * interest; // opens barely track interest
  if (!chance(state, clamp(pOpen, 0, 0.95))) return [];
  const out = [];
  const opens = 1 + Math.floor(rng(state) * 3) + (chance(state, 0.15 + 0.15 * interest) ? 1 : 0);
  for (let k = 0; k < opens; k++) {
    // Seed decks get ~3-4 minutes and ~58% are read to the end (view-profile copy; DocSend reports).
    const read = chance(state, 0.5 + 0.15 * interest) ? SLIDES.length : 3 + Math.floor(rng(state) * 7);
    const secs = SLIDES.slice(0, read).map((s) => Math.round((8 + rng(state) * 22) * (s === 'Traction' || s === 'Team' ? 1.6 : 1) * (1 + 0.15 * interest)));
    out.push({ day: state.day + k, viewer: k === 0 ? inv.name : chance(state, 0.6) ? inv.name : `${inv.name} (another device)`, secs, total: secs.reduce((a, b) => a + b, 0), phase });
  }
  // Forwards: an interested investor shares with a partner; others sometimes forward to an associate or a friend.
  if (chance(state, 0.1 + 0.45 * interest)) out.push({ day: state.day + 1, viewer: interest > 0.5 && chance(state, 0.7) ? `A partner at ${inv.firm || inv.name}` : l.gate === 'none' ? 'Unknown viewer (forwarded)' : `An associate at ${inv.firm || inv.name}`, secs: SLIDES.slice(0, 6).map(() => Math.round(6 + rng(state) * 14)), total: 0, forward: true, phase });
  for (const v of out) { if (!v.total) v.total = v.secs.reduce((a, b) => a + b, 0); l.views.push(v); }
  if (l.views.length > 40) l.views.splice(0, l.views.length - 40);
  return out;
}

export function linkStats(l) {
  const views = l.views ?? [];
  const per = SLIDES.map((name, i) => {
    const xs = views.filter((v) => v.secs[i] != null).map((v) => v.secs[i]);
    return { name, avg: xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0, n: xs.length };
  });
  return { opens: views.filter((v) => !v.forward).length, forwards: views.filter((v) => v.forward).length, totalSecs: views.reduce((a, v) => a + v.total, 0), lastDay: views.at(-1)?.day ?? null, per };
}

// ---- Data room ----
// Hours are per refresh. freshDays: how long a snapshot stays current before investors call it stale.
export const ROOM_ITEMS = [
  { id: 'metrics', label: 'Metrics pack: MRR by customer, cohorts, burn, runway', hours: 1.5, freshDays: 45 },
  { id: 'financials', label: 'Financial statements (P&L, balance sheet) from Books', hours: 1, freshDays: 45 },
  { id: 'captable', label: 'Cap table and SAFE / option register', hours: 0.5, freshDays: 180 },
  { id: 'legal', label: 'Charter, IP assignments / CIIAAs, 83(b) elections', hours: 0.5, freshDays: 365 },
  { id: 'contracts', label: 'Customer contracts, LOIs and references', hours: 0.75, freshDays: 90 },
];
const LEGAL_BLOCKERS = /83\(b\)|IP assignment|CIIAA|Not incorporated|LLC/;

export function prepareItem(state, id) {
  const fr = ensureRoom(state);
  const m = computeMetrics(state);
  fr.room.items[id] = { day: state.day, mrr: m.mrr, safes: fr.cap?.safes?.length ?? 0, rounds: fr.rounds?.length ?? 0, ...(id === 'metrics' ? { sheet: metricsSheet(m, { landscape: false }) } : {}) };
  return fr.room.items[id];
}

// Ground truth behind the folders (verification brief): a folder is only "ready" when what it would contain is real.
// Financials: every month that ended 15+ days ago (last three) closed and locked in Books (categorized, Stripe and
// bank reconciled; ledger.js closeBlocker enforces that). Contracts: real customers, pilots or LOIs exist. Cap table:
// no dead equity >= 10% and no co-founder with a missed 83(b).
export function booksGap(state) {
  let months = [];
  try { months = closableMonths(state).slice(-3); } catch { return null; }
  const closed = state.apps.books?.closed ?? {};
  const due = months.filter((mk) => { try { return state.day - monthStartDay(state, nextMonthKey(mk)) >= 15; } catch { return true; } });
  const open = due.filter((mk) => !closed[mk]);
  return open.length ? `Books not closed for ${open.join(', ')}: the P&L would not tie to the bank` : null;
}
function contractsGap(m) {
  return (m.customers ?? 0) + (m.lois ?? 0) + (m.pilots ?? 0) > 0 ? null : 'Empty: no paying customers, signed contracts or LOIs to show';
}
function capTableGap(state, fr) {
  const f = fr.cap?.founders ?? [];
  const all = f.reduce((a, x) => a + x.shares, 0) + (fr.cap?.common ?? []).reduce((a, c) => a + c.shares, 0) + (fr.cap?.preferred ?? []).reduce((a, p) => a + p.shares, 0) + (fr.cap?.pool ?? 0);
  const dead = f.filter((x) => x.departed).reduce((a, x) => a + x.shares, 0);
  if (all && dead / all >= 0.1) return `${Math.round((dead / all) * 100)}% dead equity held by a departed founder`;
  const missed = (state.apps.cofounder?.candidates ?? []).find((c) => c.signed?.missed83b);
  if (missed) return `${missed.name}'s 83(b) election was never filed`;
  return null;
}

export function roomStatus(state) {
  const fr = ensureRoom(state);
  const m = computeMetrics(state);
  const rows = ROOM_ITEMS.map((it) => {
    const p = fr.room.items[it.id];
    let status = p ? 'ready' : 'missing', why = p ? '' : 'Not prepared';
    if (p && state.day - p.day > it.freshDays) { status = 'stale'; why = `Prepared ${state.day - p.day} days ago`; }
    if (p && it.id === 'metrics' && m.mrr > 0 && Math.abs(p.mrr - m.mrr) > Math.max(500, 0.15 * m.mrr)) { status = 'stale'; why = `Numbers out of date (pack says $${Math.round(p.mrr)} MRR)`; }
    if (p && it.id === 'captable' && ((fr.cap?.safes?.length ?? 0) !== p.safes || (fr.rounds?.length ?? 0) !== p.rounds)) { status = 'stale'; why = 'Cap table changed since'; }
    const gap = p && status === 'ready' ? (it.id === 'financials' ? booksGap(state) : it.id === 'contracts' ? contractsGap(m) : it.id === 'captable' ? capTableGap(state, fr) : null) : null;
    if (gap) { status = 'gap'; why = gap; }
    if (it.id === 'legal') {
      const blockers = (m.legal ?? []).filter((x) => LEGAL_BLOCKERS.test(x));
      if (blockers.length) { status = 'blocked'; why = blockers[0]; }
    }
    return { ...it, status, why, prepared: p ?? null };
  });
  const ready = rows.filter((r) => r.status === 'ready').length;
  return { rows, ready, total: rows.length, pct: ready / rows.length, overstated: rows.some((r) => r.id === 'metrics' && r.status === 'stale' && r.prepared && r.prepared.mrr > m.mrr) };
}

// Diligence duration multiplier and extra weekly hours from readiness [design]: ready → ~40% faster; a scramble
// adds weeks and founder hours.
export function diligenceFactor(pct) {
  return pct >= 0.99 ? 0.6 : pct >= 0.6 ? 0.85 : 1.3;
}
export const scrambleHours = (pct) => Math.round((1 - pct) * 6 * 10) / 10;
// Close odds after diligence: a complete room helps a little, a stale or overstated one hurts.
export const roomCloseFactor = (st) => (st.overstated ? 0.8 : 0.9 + 0.15 * st.pct);

export function logRoomAccess(state, inv) {
  const fr = ensureRoom(state);
  const st = roomStatus(state);
  for (const r of st.rows.filter((x) => x.status !== 'missing')) if (chance(state, 0.7)) fr.room.log.push({ day: state.day + Math.floor(rng(state) * 5), who: `${inv.name} (${inv.firm || 'angel'})`, item: r.label, status: r.status });
  if (fr.room.log.length > 80) fr.room.log.splice(0, fr.room.log.length - 80);
}

// ---- Intro paths ----
const INVESTOR_ADJACENT = /(investor|vc\b|venture|angel|partner|founder|ceo|cto|operator|advisor|scout)/i;
export const PATH_HOURS = 0.25;

// Paths from the founder's network to an investor: people who plausibly know them (1 hop) and strong ties who
// know someone who does (2 hops), plus insiders (portfolio-style intros). Deterministic per person+investor.
export function introPaths(state, inv) {
  const n = ensureNetwork(state);
  const fr = frOf(state);
  const out = [];
  for (const p of n.people ?? []) {
    if ((p.strength ?? 0) < 0.1) continue;
    const knows = INVESTOR_ADJACENT.test(`${p.role} ${p.relation} ${p.howTheyCanHelp}`) ? 0.3 : 0.07;
    if (unit(`${p.id}>${inv.id}`) < knows) out.push({ personId: p.id, label: `${p.name}${p.company ? ` (${p.company})` : ''}`, chain: [p.name, inv.name], hops: 1, strength: p.strength });
    else if ((p.strength ?? 0) >= 0.5 && unit(`${p.id}>>${inv.id}`) < 0.2) {
      const mid = ['a founder they backed', 'their former colleague', 'a fund LP they know', 'a co-investor'][Math.floor(unit(`${p.id}#${inv.id}`) * 4)];
      out.push({ personId: p.id, label: `${p.name} → ${mid}`, chain: [p.name, mid, inv.name], hops: 2, strength: p.strength * 0.5 });
    }
  }
  for (const i of fr?.investors ?? []) if (i.status === 'committed' && i.closedDay != null && i.id !== inv.id && unit(`${i.id}>${inv.id}`) < 0.35) out.push({ personId: null, insiderId: i.id, label: `${i.name} (your investor)`, chain: [i.name, inv.name], hops: 1, strength: 0.8 });
  if (inv.warmPath && !inv.introVia && !inv.introInsider) out.push({ personId: null, label: inv.warmPath, chain: [inv.warmPath, inv.name], hops: 2, strength: 0.35, listed: true });
  return out.sort((a, b) => b.strength / b.hops - a.strength / a.hops).slice(0, 5);
}

export function choosePath(state, inv, path) {
  inv.warmPath = path.label;
  inv.introVia = path.personId ?? null;
  inv.introInsider = path.insiderId ?? null;
  inv.introHops = path.hops;
  // Expected odds for display; the real roll happens at the intro (network.introDecision for real contacts).
  inv.introOdds = clamp(path.insiderId ? 0.9 : path.strength >= 0.66 ? 0.82 : path.strength >= 0.33 ? 0.6 : 0.3, 0.05, 0.95) * (path.hops > 1 ? 0.7 : 1);
  inv.log ??= [];
  inv.log.push({ day: state.day, text: `Intro path chosen: ${path.chain.join(' → ')}.` });
}

// Will the connector make it? Real network contacts go through core/network introDecision (tie strength,
// forwardable blurb, connector fatigue); a 2-hop path needs both people to say yes.
export function introMade(state, inv, talkIntroMult = 1) {
  const n = ensureNetwork(state);
  const person = inv.introVia ? (n.people ?? []).find((p) => p.id === inv.introVia) : null;
  let made;
  if (person) {
    made = introDecision(state, person, { message: inv.outreach?.text ?? '', targetKind: 'investor' }).made;
    if (made && (inv.introHops ?? 1) > 1) made = chance(state, 0.6);
  } else made = chance(state, inv.introOdds ?? 0.6);
  return made && chance(state, talkIntroMult);
}
