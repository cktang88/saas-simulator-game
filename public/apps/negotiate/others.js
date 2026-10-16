// Adapter factories for vendor contracts (buying SaaS) and hiring offers. They only build negotiation specs and a close
// hook; the People and Money apps wire them in when ready (this module edits neither). Both are read-only on game state.
//
//  vendorSpec({ vendor, listAnnual, seats, usage, runwayMonths }) -> spec for startNegotiation (kind 'vendor')
//  hiringSpec({ candidate, role, expectation, offer, competing }) -> spec (kind 'hiring'). It reads only fields of the
//    candidate object the People app already carries (expectation, persona.otherOffers, seniority); wiring to
//    people/negotiation.js (packageValue, counters) is the coordinator's step: pass `onAgreed` to apply the package.
//  registerClose(kind, fn) lets the owner app attach consequences (post the invoice, set the offer fields) at close.

import { clamp, hash, money } from '../../core/util.js';
import { VENDOR_ISSUES, HIRING_ISSUES, VENDOR_NEG } from '../../data/negotiation.js';
import { registerAdapter, startNegotiation } from '../../core/negotiation.js';

const closers = { vendor: [], hiring: [] };
export function registerClose(kind, fn) { (closers[kind] ??= []).push(fn); }
const stream = (state, salt) => { let t = (parseInt(hash(`${state.seed}|${salt}`), 36) | 0) || 1; return () => { t = (t + 0x6d2b79f5) | 0; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };

export function vendorSpec(state, { vendor = 'the vendor', listAnnual = 12000, seats = 10, usage = seats, alternatives = 0, runwayMonths = Infinity, key = null, recurringId = null, annual = false, renewDay = null, team = seats > 1, currentAnnual = listAnnual, qLeft = null } = {}) {
  const rnd = stream(state, `vendor|${vendor}|${listAnnual}`);
  const lo = Math.round(listAnnual * (1 - VENDOR_NEG.maxDiscount));
  let issues = VENDOR_ISSUES.map((i) => (i.id === 'price' ? { ...i, min: lo, max: Math.round(listAnnual), step: Math.max(1, Math.round(listAnnual / 200)) } : { ...i }));
  // A plan that is already annual renews annually; the seat commitment only means something for team-wide tools.
  if (annual) issues = issues.map((i) => (i.id === 'prepay' ? { ...i, options: i.options.filter((o) => o.id === 'annual') } : i));
  if (!team) issues = issues.filter((i) => i.id !== 'seats');
  const batnaStrength = clamp(0.4 + 0.1 * rnd(), 0.2, 0.7);
  const q = qLeft ?? 45; // days to the rep's quarter end: their quota deadline, the lever behind end-of-quarter discounts
  const stakes = listAnnual >= 30000 ? 'mid' : 'low';
  return {
    key: key ?? `vendor:${vendor}:${state.day}`, kind: 'vendor', ref: recurringId ?? vendor, title: `${vendor}: ${annual ? 'renewal' : 'contract'}`, stakes, stakesUsd: listAnnual, usdPerUtil: listAnnual * 1.2,
    cp: { name: vendor, role: 'account executive', style: 'hardball' },
    issues, floors: { price: 0.3 }, leverageRoom: { price: 0.3 }, batnaStrength, cpOpens: true, cpDeadlineDays: clamp(q, 5, 60), jitter: 0.3,
    playerDeadlineDay: annual && renewDay != null ? renewDay : null, cpKnowsDeadline: annual,
    expiresDay: state.day + clamp(q + 7, VENDOR_NEG.quoteWindow[0], VENDOR_NEG.quoteWindow[1]),
    context: { vendor, listAnnual, seats, usage, alternatives, recurringId, annual, renewDay, currentAnnual, runwayMonths: Number.isFinite(runwayMonths) ? runwayMonths : null, qLeft: q },
  };
}
export function hiringSpec(state, { candidate = {}, role = 'hire', expectation = 120000, offer = null, competing = false, key = null } = {}) {
  const rnd = stream(state, `hire|${candidate.id ?? role}`);
  const base = expectation;
  const issues = HIRING_ISSUES.map((i) => (i.id === 'salary' ? { ...i, min: Math.round(base * 0.85), max: Math.round(base * 1.25), step: 1000 } : { ...i }));
  const inDemand = Boolean(competing || candidate.persona?.otherOffers);
  return {
    key: key ?? `hire:${candidate.id ?? role}`, kind: 'hiring', ref: candidate.id ?? null, title: `${candidate.name ?? 'Candidate'}: offer`, stakes: 'mid', stakesUsd: base, usdPerUtil: base * 1.5,
    cp: { name: candidate.name ?? 'The candidate', role: role, style: inDemand ? 'time_pressed' : 'collaborative' },
    issues, floors: { salary: 0.15 }, leverageRoom: { salary: 0.1 }, batnaStrength: clamp(inDemand ? 0.65 : 0.35 + 0.1 * rnd(), 0.2, 0.8), cpOpens: false, jitter: 0.25,
    context: { candidateId: candidate.id ?? null, expectation: base, offer },
  };
}

export function runClosers(kind) {
  return (state, neg, result) => { for (const fn of closers[kind] ?? []) { try { fn(state, neg, result); } catch (e) { console.warn(`[negotiation] ${kind} close hook failed`, e); } } };
}
const flatBatna = (state, neg) => ({ value: 0.2 + 0.2 * (neg.context.alternatives ? 1 : 0), real: Boolean(neg.context.alternatives), leverage: neg.context.alternatives ? 0.5 : 0, sources: neg.context.alternatives ? [{ kind: 'alternative', label: `${neg.context.alternatives} alternative(s)`, strength: 0.4 }] : [] });
registerAdapter('vendor', { label: 'Vendor contract', batna: flatBatna, onClose: runClosers('vendor') });
registerAdapter('hiring', { label: 'Hiring offer', batna: (state, neg) => ({ value: 0.25, real: false, leverage: 0, sources: [{ kind: 'pipeline', label: 'Other candidates in your pipeline (People app)', strength: 0.25 }] }), onClose: runClosers('hiring') });
export const startVendorNegotiation = (state, opts) => startNegotiation(state, vendorSpec(state, opts));
export const startHiringNegotiation = (state, opts) => startNegotiation(state, hiringSpec(state, opts));
export const fmt = money;
