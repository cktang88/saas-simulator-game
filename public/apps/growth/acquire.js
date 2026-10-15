// Turning growth outcomes into real customers, plus the attribution ledger behind the cohort ROAS view.
//
// Every signup from ads/organic becomes a real Stripe customer + subscription (trial when the plan has one), or a
// CRM inbound lead for enterprise / no-trial B2B plans. Trial conversion, renewals and churn are then handled by
// core billing, so LTV unfolds over real time. The ledger (state.apps.growth) records spend, trials and the revenue
// each acquisition-week cohort produces at D7 / D30 / D90 / D180, keyed by subscription.source.

import { ensure } from '../../core/state.js';
import { createCustomer, subscribe } from '../../core/stripe.js';
import { mainPlan, syntheticPerson, trialConversion } from '../../core/market.js';
import { addInboundLead } from '../sales/crm-api.js';
import { pick, rng, round2 } from '../../core/util.js';

export const ensureGrowth = (state) => {
  const g = ensure(state, 'growth', () => ({ cohorts: {}, visits: [], lastChargeDay: -1 }));
  g.cohorts ??= {};
  g.visits ??= [];
  return g;
};

export const weekOf = (day) => Math.floor(day / 7);
const AGES = [['r7', 7], ['r30', 30], ['r90', 90], ['r180', 180]];

export function ledgerAdd(state, day, source, field, amount) {
  const g = ensureGrowth(state);
  const w = (g.cohorts[weekOf(day)] ??= {});
  const e = (w[source] ??= { sp: 0, tr: 0, ld: 0, py: 0, r7: 0, r30: 0, r90: 0, r180: 0, r: 0 });
  e[field] = round2((e[field] ?? 0) + amount);
}

// Website visitors (all channels) for retargeting audiences: [[day, n]] over the last 30 days.
export function addVisitors(state, n) {
  if (!(n > 0)) return;
  const g = ensureGrowth(state);
  const last = g.visits.at(-1);
  if (last && last[0] === state.day) last[1] += n;
  else g.visits.push([state.day, n]);
  while (g.visits.length && g.visits[0][0] < state.day - 30) g.visits.shift();
}
export const visitors30 = (state) => Math.round(ensureGrowth(state).visits.filter(([d]) => d > state.day - 30).reduce((a, [, n]) => a + n, 0));

const TITLES = ['VP Operations', 'Head of Finance', 'Director of IT', 'COO', 'Head of RevOps', 'VP Engineering', 'Director of Customer Success'];
const CORPS = ['Northwind', 'Bluefin', 'Altamira', 'Keystone', 'Meridian', 'Pinecrest', 'Halcyon', 'Ironbridge', 'Sable', 'Corvid'];
const SECT = ['Logistics', 'Health', 'Financial', 'Retail Group', 'Manufacturing', 'Software', 'Insurance', 'Energy'];

function leadPerson(state) {
  const p = syntheticPerson(state);
  if (state.company.model === 'ent' || !p.company) {
    const company = `${pick(state, CORPS)} ${pick(state, SECT)}`;
    const domain = `${company.toLowerCase().replace(/[^a-z]/g, '')}.com`;
    const first = p.name.split(' ')[0].toLowerCase();
    return { name: p.name, email: `${first}@${domain}`, title: pick(state, TITLES), company, domain };
  }
  return { ...p, domain: p.email.split('@')[1], title: 'Owner' };
}

// Does an acquisition become a CRM lead (demo request) rather than a self-serve trial/purchase?
export function isLeadFlow(state, { lead = 'auto' } = {}) {
  if (lead === true) return state.company.model !== 'b2c';
  const plan = mainPlan(state);
  if (state.company.model === 'ent') return true;
  if (state.company.model === 'smb' && !(plan.trialDays > 0)) return true;
  return false;
}

// Registered by plg/access.js: (state, { source, n }) -> { admit, convMult } or null when launch mode is untouched.
let accessGate = null;
export function setAcquireGate(fn) { accessGate = fn; }

/**
 * Acquire n signups from a channel.
 * opts: { source, n, lead ('auto'|true), convMult (× core trial conversion), forceConvert (absolute), note, day }
 * → { subs: [...], leads: n }
 */
export function acquire(state, { source, n = 1, lead = 'auto', convMult = null, forceConvert = null, note = '', skipGate = false }) {
  const out = { subs: [], leads: 0, held: 0 };
  if (!(n > 0)) return out;
  const plan = mainPlan(state);
  const leadFlow = isLeadFlow(state, { lead });
  // Launch mode (plg/access.js): open signup, waitlist or invite-only cohorts. Self-serve signups only; demo requests are never gated.
  if (!leadFlow && !skipGate && accessGate) {
    const g = accessGate(state, { source, n });
    if (g) { out.held = n - g.admit; n = g.admit; if (g.convMult != null && g.convMult !== 1) convMult = (convMult ?? 1) * g.convMult; if (!(n > 0)) return out; }
  }
  for (let i = 0; i < n; i++) {
    if (leadFlow) {
      const p = leadPerson(state);
      addInboundLead(state, { ...p, source, note: note || `Inbound from ${source}` });
      out.leads++;
      ledgerAdd(state, state.day, source, 'ld', 1);
      continue;
    }
    const p = syntheticPerson(state);
    const c = createCustomer(state, { name: p.name, email: p.email, company: p.company ?? null, source });
    const trial = plan.trialDays > 0;
    const sub = subscribe(state, c.id, plan, { trial, source });
    if (trial) {
      if (forceConvert != null) sub.forceConvert = Math.min(0.9, Math.max(0, forceConvert));
      else if (convMult != null && convMult !== 1) sub.forceConvert = Math.min(0.9, trialConversion(state, plan) * convMult);
    }
    out.subs.push(sub);
    ledgerAdd(state, state.day, source, 'tr', 1);
  }
  return out;
}

// Sample an integer from an expected value without importing the core poisson everywhere.
export function sampleCount(state, mean) {
  if (!(mean > 0)) return 0;
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * (rng(state) + rng(state) + rng(state) - 1.5) * 2));
  const L = Math.exp(-mean);
  let k = 0, p = 1;
  do { k++; p *= rng(state); } while (p > L);
  return k - 1;
}

// Called once a day: books yesterday's Stripe charges and refunds into the cohort revenue buckets.
export function bookRevenue(state) {
  const g = ensureGrowth(state);
  const st = state.stripe;
  if (!st) return;
  const target = state.day - 1;
  if (g.lastChargeDay >= target) return;
  const from = g.lastChargeDay + 1;
  const subs = new Map(st.subscriptions.map((s) => [s.id, s]));
  const book = (sub, amount, chargeDay, firstPay) => {
    const age = chargeDay - sub.startDay;
    const w = (g.cohorts[weekOf(sub.startDay)] ??= {});
    const e = (w[sub.source] ??= { sp: 0, tr: 0, ld: 0, py: 0, r7: 0, r30: 0, r90: 0, r180: 0, r: 0 });
    for (const [k, d] of AGES) if (age < d) e[k] = round2(e[k] + amount);
    e.r = round2(e.r + amount);
    if (firstPay) e.py++;
  };
  for (const c of st.charges) {
    if (c.day < from || c.day > target || c.status === 'failed') continue;
    const sub = subs.get(c.subId);
    if (!sub) continue;
    book(sub, c.amount, c.day, (sub.paidMonths ?? 0) === 0 && !sub._growthPaid);
    if (!sub._growthPaid) sub._growthPaid = true;
  }
  let chargeById = null;
  for (const r of st.refunds) {
    if (r.day < from || r.day > target) continue;
    chargeById ??= new Map(st.charges.map((c) => [c.id, c]));
    const ch = chargeById.get(r.chargeId);
    const sub = ch && subs.get(ch.subId);
    if (sub) book(sub, -r.amount, ch.day, false);
  }
  g.lastChargeDay = target;
}

// Cohort rows for the ROAS view. sourceFilter: exact source, a prefix ending in ':' (e.g. 'ads:'), or 'all'.
export function cohortRows(state, sourceFilter = 'ads:', weeks = 16) {
  const g = ensureGrowth(state);
  const nowWeek = weekOf(state.day);
  const rows = [];
  for (let w = nowWeek; w > nowWeek - weeks && w >= 0; w--) {
    const bucket = g.cohorts[w] ?? {};
    const e = { week: w, sp: 0, tr: 0, ld: 0, py: 0, r7: 0, r30: 0, r90: 0, r180: 0, r: 0 };
    for (const [src, v] of Object.entries(bucket)) {
      if (sourceFilter !== 'all' && !(sourceFilter.endsWith(':') ? src.startsWith(sourceFilter) : src === sourceFilter)) continue;
      for (const k of Object.keys(v)) e[k] += v[k];
    }
    // A D-n bucket is complete once the whole cohort week is at least n days old.
    const age = state.day - (w * 7 + 6);
    e.mature = { r7: age >= 7, r30: age >= 30, r90: age >= 90, r180: age >= 180 };
    if (e.sp || e.tr || e.ld || e.r) rows.push(e);
  }
  return rows;
}
export const cohortRoas = (e, key) => (e.sp > 0 && e.mature[key] ? e[key] / e.sp : null);
