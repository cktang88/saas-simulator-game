// The composable core of the Launch playbook: every acquisition channel (Meta ads, creators, clipping, ASO, founder content,
// referrals, anything that calls acquire()) delivers installs here, and one paywall + plan mix turns them into customers. The
// Playbook view reads the same ledgers: views -> installs -> paywall views -> starts -> paying -> retained, cost per step by
// channel, blended CAC, LTV by plan and payback.

import { setMobileGate, setMobileLanding, acquire, ensureGrowth, cohortRows, ledgerAdd } from '../growth/acquire.js';
import { ensureConsumer, peekConsumer, binomial } from './state.js';
import { convertInstalls, revenuePerPayer, planMix, currentCommission, darkOf, judgeDisclosure, funnelRates } from './monetize.js';
import { mobileOn, mobileLive } from './store.js';
import { landingConversion, hasProduct } from '../../core/market.js';
import { logMistake } from '../../core/operator.js';
import { INTENT, MISTAKE_FN } from './params.js';
import { round2 } from '../../core/util.js';
import * as M from '../growth/asoModel.js';

export const SOURCE_LABELS = {
  'ads:meta': 'Meta ads', 'ads:tiktok': 'TikTok ads', 'ads:apple': 'Apple Search Ads', 'organic:ugc': 'Creator posts (UGC)', 'organic:clips': 'Clipping campaigns',
  'organic:appstore': 'App Store / Play search (ASO)', 'organic:social': 'Founder content', 'organic:wom': 'Word of mouth', referral: 'Referrals', network: 'Your network', 'organic:seo': 'SEO', 'organic:community': 'Communities', 'product-hunt': 'Product Hunt',
};
export const labelOf = (s) => SOURCE_LABELS[s] ?? s;

/** Store-page conversion (page view -> install) from the ASO module when it exists, else the market default. */
export function storeCvr(state) {
  const S = state.apps.organic?.appstore;
  const st = S?.stores?.ios;
  if (!S || !st) return 0.27;
  const stars = S.reviews ? S.starSum / S.reviews : null;
  return M.pageCvr('ios', { shotsQ: st.shots?.q ?? 0.3, video: st.shots?.video, copyScore: st.live?.score ?? null, stars, ratings: S.reviews ?? 0, replies: false, testLift: st.testLift ?? 0 });
}

// The gate acquire() calls first. null = not a mobile company, the web funnel runs as before.
function gate(state, { source, n, convMult }) {
  const C = peekConsumer(state);
  if (!C || !mobileOn(state)) return null;
  if (!mobileLive(state)) {
    // Installs are impossible before a store listing exists: ad money spent now is wasted and the player should see why.
    const f = (C.funnel.sources[source] ??= { views: 0, installs: 0, pwViews: 0, starts: 0, paid: 0, spend: 0, extraSpend: 0 });
    f.lost = (f.lost ?? 0) + n;
    if (source.startsWith('ads:') && (f.lost ?? 0) >= 20) logMistake(state, { functionId: MISTAKE_FN, id: 'spent_before_store_live', label: 'Paid for traffic before the app was live in a store', cost: { usd: 0, days: 7 }, app: 'launch', detail: `${f.lost} clicks had nowhere to install. Get through App Review before buying traffic.`, key: 'spent_before_live' });
    return { subs: [], leads: 0, held: n };
  }
  return convertInstalls(state, { source, n, intent: convMult && convMult !== 1 ? (INTENT[source] ?? INTENT.default) * convMult : null });
}
setMobileGate(gate);
setMobileLanding((state) => (mobileOn(state) ? storeCvr(state) : null));

/**
 * Deliver installs (or, when the company is not running a store app, web visits) from a channel.
 * The one entry point for new channels: pass the source string and the number of installs.
 */
export function deliverVisits(state, { source, installs, geoArppu = 1 }) {
  if (!(installs > 0) || !hasProduct(state)) return { subs: [], leads: 0 };
  const C = ensureConsumer(state);
  if (mobileOn(state)) {
    if (!mobileLive(state)) return gate(state, { source, n: installs, convMult: 1 });
    const r = convertInstalls(state, { source, n: installs, geoArppu });
    if (r.subs.length) { ledgerAddTrials(state, source, r.subs.length); }
    return r;
  }
  // Web / PWA: visitors convert on the landing page like any other channel.
  const f = (C.funnel.sources[source] ??= { views: 0, installs: 0, pwViews: 0, starts: 0, paid: 0, spend: 0, extraSpend: 0 });
  f.installs += installs;
  const n = binomial(state, installs, landingConversion(state));
  const got = n ? acquire(state, { source, n }) : { subs: [], leads: 0 };
  f.starts += got.subs.length;
  return got;
}
function ledgerAddTrials(state, source, n) { ledgerAdd(state, state.day, source, 'tr', n); }

// ---------------- reading the funnel ----------------

const sumLedger = (state, source) => {
  const g = ensureGrowth(state);
  const t = { sp: 0, tr: 0, py: 0, r7: 0, r30: 0, r: 0 };
  for (const w of Object.values(g.cohorts)) { const e = w[source]; if (!e) continue; for (const k of Object.keys(t)) t[k] += e[k] ?? 0; }
  return t;
};

/** One row per source that has any activity. */
export function funnelRows(state) {
  const C = ensureConsumer(state);
  const g = ensureGrowth(state);
  const sources = new Set([...Object.keys(C.funnel.sources)]);
  for (const w of Object.values(g.cohorts)) for (const s of Object.keys(w)) sources.add(s);
  const subs = state.stripe?.subscriptions ?? [];
  const rows = [];
  for (const source of sources) {
    const f = C.funnel.sources[source] ?? { views: 0, installs: 0, pwViews: 0, starts: 0 };
    const L = sumLedger(state, source);
    const live = subs.filter((s) => s.source === source && (s.status === 'active' || s.status === 'past_due')).length;
    if (!(f.installs || L.sp || L.tr || f.views)) continue;
    const spend = round2(L.sp);
    const paying = Math.round(L.py);
    rows.push({
      source, label: labelOf(source), views: f.views ?? 0, installs: f.installs, pwViews: f.pwViews, starts: f.starts, paying, retained: live, spend, revenue: round2(L.r), r7: round2(L.r7),
      cpi: f.installs && spend ? round2(spend / f.installs) : null, costPerStart: f.starts && spend ? round2(spend / f.starts) : null, cac: paying && spend ? round2(spend / paying) : null,
      viewToInstall: f.views ? f.installs / f.views : null, installToPaywall: f.installs ? f.pwViews / f.installs : null, paywallToStart: f.pwViews ? f.starts / f.pwViews : null, startToPaying: f.starts ? paying / f.starts : null,
    });
  }
  return rows.sort((a, b) => b.installs - a.installs);
}

/** Blended totals across every channel: spend, installs, paying, CAC (all customers and paid-only). */
export function funnelTotals(state, rows = funnelRows(state)) {
  const t = rows.reduce((a, r) => ({ spend: a.spend + r.spend, installs: a.installs + r.installs, pwViews: a.pwViews + r.pwViews, starts: a.starts + r.starts, paying: a.paying + r.paying, retained: a.retained + r.retained, revenue: a.revenue + r.revenue, views: a.views + r.views }), { spend: 0, installs: 0, pwViews: 0, starts: 0, paying: 0, retained: 0, revenue: 0, views: 0 });
  const paidRows = rows.filter((r) => r.spend > 0);
  const paidPaying = paidRows.reduce((a, r) => a + r.paying, 0);
  return { ...t, blendedCac: t.paying ? round2(t.spend / t.paying) : null, paidCac: paidPaying ? round2(paidRows.reduce((a, r) => a + r.spend, 0) / paidPaying) : null, blendedCpi: t.installs ? round2(t.spend / t.installs) : null };
}

/** LTV by plan (12 months, net of the store commission and refunds, per paying subscriber). */
export function ltvByPlan(state, store = 'ios') {
  const C = ensureConsumer(state);
  const pw = C.monet.paywall;
  const rate = C.monet.mode === 'web' ? 0 : currentCommission(state, store);
  const out = {};
  for (const n of ['weekly', 'monthly', 'annual']) {
    if (!pw.plans[n].on) continue;
    const gross = revenuePerPayer(state, pw, { [n]: 1 }, 365);
    out[n] = { price: pw.plans[n].price, gross: round2(gross), net: round2(gross * (1 - rate)), d60: round2(revenuePerPayer(state, pw, { [n]: 1 }, 60)) };
  }
  return out;
}

/** Days until a payer's cumulative net revenue (plan mix) covers the CAC; null when it never does within a year. */
export function paybackDays(state, cac, store = 'ios') {
  if (!(cac > 0)) return null;
  const C = ensureConsumer(state);
  const pw = C.monet.paywall;
  const mix = planMix(state, pw);
  const net = 1 - (C.monet.mode === 'web' ? 0 : currentCommission(state, store));
  for (let d = 0; d <= 365; d += 3) if (revenuePerPayer(state, pw, mix, d) * net >= cac) return d;
  return null;
}

/** D7 / D30 ROAS from the cohort ledger for a source filter ('ads:' etc.), mature cohorts only. gross and net of store fees. */
export function roasView(state, filter = 'ads:', store = 'ios') {
  const rows = cohortRows(state, filter, 20);
  const C = ensureConsumer(state);
  const net = 1 - (C.monet.mode === 'web' ? 0 : currentCommission(state, store));
  const agg = (key) => {
    const m = rows.filter((r) => r.mature[key] && r.sp > 0);
    const sp = m.reduce((a, r) => a + r.sp, 0), rev = m.reduce((a, r) => a + r[key], 0);
    return { weeks: m.length, spend: round2(sp), revenue: round2(rev), roas: sp > 0 ? rev / sp : null, netRoas: sp > 0 ? (rev * net) / sp : null };
  };
  return { d7: agg('r7'), d30: agg('r30'), net };
}

/** Everything the Playbook view and the tests read. */
export function playbookSummary(state) {
  const C = ensureConsumer(state);
  const rows = funnelRows(state);
  const totals = funnelTotals(state, rows);
  const ltv = ltvByPlan(state);
  const mix = planMix(state, C.monet.paywall);
  return { rows, totals, ltv, mix, payback: paybackDays(state, totals.paidCac ?? totals.blendedCac), roas: roasView(state, 'ads:'), expected: { meta: funnelRates(state, 'ads:meta'), appstore: funnelRates(state, 'organic:appstore') }, disclosure: C.monet.paywall.disclosure ?? judgeDisclosure(C.monet.paywall), dark: darkOf(C.monet.paywall).on };
}
