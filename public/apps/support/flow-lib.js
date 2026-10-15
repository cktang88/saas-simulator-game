// Shared state and consequence helpers for the Helpdesk ticket-type flows (support/flows.js, flow-types.js).
// Everything here mutates state deterministically (rng(state), uid()); no DOM. Research: docs/research/support/*.
// Numbers marked [design] are game estimates anchored on those notes, never presented as measured statistics.

import { rng, chance, uid, round2, money, clamp, hash } from '../../core/util.js';
import { ensure } from '../../core/state.js';
import { ensureStripe, monthlyAmount, cancel } from '../../core/stripe.js';
import { post } from '../../core/bank.js';
import { logSupportMistake } from './operator.js';

export const ensureFlows = (state) => {
  const sup = ensure(state, 'support', () => ({}));
  const f = (sup.flows ??= {});
  f.cases ??= []; f.pending ??= []; f.requests ??= []; f.seenDisputes ??= {}; f.aiLog ??= []; f.slaBreaches ??= []; f.cancelFailures ??= []; f.drain ??= [];
  f.stats ??= { resolved: 0, reopened: 0, aiResolved: 0, aiWrong: 0, disputesWon: 0, disputesLost: 0, disputesMissed: 0, takeoversBlocked: 0, takeovers: 0, loopsClosed: 0, loopsMissed: 0, viral: 0, langCsat: {} };
  f.ops ??= {};
  const o = f.ops;
  o.chat ??= false; o.afterHours ??= 'none'; o.langPolicy ??= 'english_only'; o.glossary ??= false; o.refundWindowDays ??= 14; o.securityTxt ??= false; o.begMagnetUntil ??= 0;
  f.aiScope ??= {}; // per case type 'off' | 'draft' | 'auto' (unset = vendor default: auto)
  f.network ??= { level: 'ok', ratio: 0, disputes30: 0, since: null, weeksExcessive: 0, holdDay: -1e9 };
  return f;
};

export const custOf = (state, id) => ensureStripe(state).customers.find((c) => c.id === id);
export const subOf = (state, id) => ensureStripe(state).subscriptions.find((x) => x.id === id);
export const isLiveSub = (s) => s && (s.status === 'active' || s.status === 'trialing' || s.status === 'past_due');
export function lastCharge(state, customerId) {
  const ch = ensureStripe(state).charges;
  for (let i = ch.length - 1; i >= 0; i--) if (ch[i].customerId === customerId && ch[i].status === 'succeeded') return ch[i];
  return null;
}

// Support tier by plan price (research S4 §2: starter / pro / enterprise) [design].
export const TIER_AT = { pro: 50, enterprise: 300 };
export const supportTier = (sub) => { const m = sub ? monthlyAmount(sub) : 0; return m >= TIER_AT.enterprise ? 'enterprise' : m >= TIER_AT.pro ? 'pro' : 'starter'; };
// First-response targets in hours by tier and priority P1..P4 (S4 §2: P1 30 min ack for contracted enterprise) [design].
export const TIER_SLA = { starter: { p1: 8, p2: 24, p3: 24, p4: 72 }, pro: { p1: 2, p2: 4, p3: 8, p4: 48 }, enterprise: { p1: 0.5, p2: 1, p3: 4, p4: 24 } };
// VIP = 5%+ of MRR or one of the top 10 accounts by MRR; VIP targets are halved [design].
export function isVip(state, sub) {
  if (!sub) return false;
  const live = ensureStripe(state).subscriptions.filter(isLiveSub);
  const total = live.reduce((a, s) => a + monthlyAmount(s), 0);
  if (!total) return false;
  const mine = monthlyAmount(sub);
  const rank = live.filter((s) => monthlyAmount(s) > mine).length;
  return mine / total >= 0.05 || (live.length >= 15 && rank < 10 && mine >= TIER_AT.pro);
}

const LANGS = [['es', 0.3], ['de', 0.2], ['fr', 0.2], ['pt', 0.15], ['ja', 0.15]];
export const NON_EN_SHARE = { b2c: 0.3, smb: 0.15, ent: 0.1 }; // [design] (S4 §4: pick 2-3 languages with real volume)
export function langOf(state, customerId) {
  const c = custOf(state, customerId);
  if (!c) return 'en';
  const h = parseInt(hash(`lang|${c.id}`), 36);
  const share = NON_EN_SHARE[state.company.model] * (c.country === 'INTL' ? 1.6 : 0.3);
  if ((h % 1000) / 1000 >= share) return 'en';
  let r = ((h >> 10) % 1000) / 1000;
  for (const [l, w] of LANGS) { r -= w; if (r <= 0) return l; }
  return 'es';
}

export function schedule(state, days, kind, data = {}) {
  ensureFlows(state).pending.push({ id: uid('fp'), due: state.day + Math.max(0, Math.round(days)), kind, data });
}

export function mistake(state, c, trap, text, o = {}) {
  const { key, ...rest } = o;
  return logSupportMistake(state, { trap, text, key: key === undefined ? `${trap}:${c?.id ?? uid('m')}` : key, ...rest });
}

// A customer files a card dispute (Stripe core processes it from 'scheduled').
export function scheduleDispute(state, c, p, cause) {
  if (!chance(state, p)) return false;
  const st = ensureStripe(state);
  const ch = lastCharge(state, c.customerId);
  if (!ch || st.disputes.some((d) => d.chargeId === ch.id)) return false;
  st.disputes.push({ id: uid('dp'), chargeId: ch.id, customerId: c.customerId, day: state.day + 2 + Math.floor(rng(state) * 5), amount: ch.amount, status: 'scheduled', reason: cause === 'fraud' ? 'fraudulent' : 'subscription_canceled', cause, fromCase: c.id });
  return true;
}

export function scheduleCancel(state, c, p, reason, trap, text, days = 14) {
  const sub = subOf(state, c.subId);
  if (!sub || !isLiveSub(sub) || sub.cancelAtPeriodEnd || ensureFlows(state).pending.some((x) => x.kind === 'cancel' && x.data.subId === sub.id) || !chance(state, p)) return false; // a customer leaves once
  schedule(state, days * (0.5 + rng(state)), 'cancel', { subId: sub.id, reason, trap, text, caseId: c.id });
  return true;
}

export function angryReview(state, n = 1) {
  const sup = ensure(state, 'support', () => ({}));
  sup.angryReviews = (sup.angryReviews ?? 0) + n;
}

export function maybePublic(state, c, p, topic, venue = null) {
  if (!chance(state, p)) return false;
  schedule(state, 1 + Math.floor(rng(state) * 3), 'public', { customerId: c.customerId, subId: c.subId, topic, venue, fromCase: c.id });
  return true;
}

export function fine(state, usd, description, category = 'legal') {
  usd = Math.round(usd);
  post(state, { amount: -usd, counterparty: category === 'legal' ? 'Outside counsel / authority' : 'Vendor', description, category, method: 'wire' });
  return usd;
}

export const annual = (state, subId) => { const s = subOf(state, subId); return s ? monthlyAmount(s) * 12 : 0; };
export const nameOf = (c) => `${c.name}${c.company ? ` (${c.company})` : ''}`;
export const first = (name) => String(name ?? 'there').split(' ')[0];
export { clamp, money, round2, cancel };
