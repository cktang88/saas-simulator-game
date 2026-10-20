// Clipping campaigns (Whop Content Rewards-style): fund a budget, set a CPM payout per 1,000 views, a platform fee (~7%) and content rules;
// many clippers post clips and slideshows on their own accounts. Views are cheap, installs per view are low and depend on
// content-to-product fit and the hook. Botted views exist (more at higher CPMs, caught only by verification), platforms demote
// reused / mass-produced content on a schedule, and many apps run the same playbook so CPMs and hit rates decay.
// Research: docs/research/consumer-apps/ugc-clipping.md sections 2, 3, 5. Fraud share, view curves and crackdown dates are [design].

import { CLIPPING, SATURATION, MISTAKE_FN } from './params.js';
import { ensureConsumer, crand, cchance, lognormal, binomial, samplePoisson, saturation, pushEvent } from './state.js';
import { deliverVisits } from './funnel.js';
import { hookSkill } from './creators.js';
import { post } from '../../core/bank.js';
import { notify, forceHours } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { clamp, round2, uid, hash } from '../../core/util.js';
import { icpOverlap } from '../growth/judges.js';
import { ledgerAdd } from '../growth/acquire.js';
import { productFactor } from '../../core/market.js';

const FN = MISTAKE_FN;

/** How reused or mass-produced the content the rules ask for is (0 original ... 1 identical template). */
export function templatedShare(rules) {
  const t = String(rules ?? '');
  if (CLIPPING.templated.required.test(t) && !CLIPPING.templated.original.test(t)) return 1;
  if (CLIPPING.templated.original.test(t)) return CLIPPING.templated.required.test(t) ? 0.5 : 0.1;
  return 0.45;
}
export const marketCpm = (state) => 1 * (1 + SATURATION.clipCpmMult * saturation(state));
export const fraudShare = (cpm) => clamp(CLIPPING.fraud.base + CLIPPING.fraud.perCpm * Math.max(0, cpm - 0.5), 0, CLIPPING.fraud.cap);

/** Content-to-product fit of a campaign (0..1): what the clips are about, the hook, and how well it speaks to the right viewer. */
export function clipFit(state, c) {
  const content = CLIPPING.contentFit[c.content] ?? 0.4;
  return clamp(content * (0.55 + 0.45 * c.hookQ) * (0.6 + 0.4 * Math.min(1, icpOverlap(state, `${c.hook} ${c.rules}`) * 1.5)), 0.03, 1);
}

export function launchCampaign(state, { name = 'Clip campaign', budget = 500, cpm = 1, maxPerClip = 50, content = 'demo_slideshow', hook = '', rules = '', verification = 'basic' } = {}) {
  const C = ensureConsumer(state);
  if (!CLIPPING.contentFit[content]) return { ok: false, error: 'Pick what the clips are about.' };
  if (!CLIPPING.verification[verification]) return { ok: false, error: 'Unknown verification.' };
  budget = Math.round(+budget || 0);
  if (budget < CLIPPING.minBudget) return { ok: false, error: `Minimum budget is $${CLIPPING.minBudget}.` };
  cpm = round2(clamp(+cpm || 1, 0.2, 6));
  const c = {
    id: `clip_${++C.clipping.seq}`, name, budget, cpm, maxPerClip: Math.max(5, +maxPerClip || 50), content, hook, rules, verification, hookQ: hookSkill(state, hook), templated: templatedShare(rules),
    status: 'active', startDay: state.day, paid: 0, fees: 0, clips: 0, realViews: 0, reportedViews: 0, payableViews: 0, fakePaid: 0, detected: 0, installs: 0, payouts: [], viewMult: 1, bannedUntil: -1, reserved: 0,
  };
  c.fit = clipFit(state, c);
  post(state, { amount: -budget, counterparty: 'Whop (Content Rewards)', description: `Campaign funding: ${name}`, category: 'marketing', method: 'card', meta: { source: 'organic:clips' } });
  C.clipping.campaigns.push(c);
  return { ok: true, hours: 1.5, campaign: c };
}

export function closeCampaign(state, id, why = 'closed') {
  const C = ensureConsumer(state);
  const c = C.clipping.campaigns.find((x) => x.id === id);
  if (!c || c.status === 'closed') return { ok: false, error: 'No open campaign.' };
  const left = round2(c.budget - c.paid - c.fees - c.reserved);
  c.status = 'closed'; c.closedDay = state.day;
  if (left > 1) post(state, { amount: left, counterparty: 'Whop (Content Rewards)', description: `Unspent campaign balance returned: ${c.name}`, category: 'marketing', method: 'ach', meta: { source: 'organic:clips' } });
  evaluate(state, c);
  return { ok: true, hours: 0.25, refunded: Math.max(0, left), why };
}

const chargeHours = (state, h, label) => { forceHours(state, h, label); }; // on today's hours too (core/state.js)

/** Deterministic crackdown schedule (YouTube inauthentic-content policy, TikTok enforcement waves). */
export function crackdownDays(state, horizon = 1500) {
  const C = ensureConsumer(state);
  if (!C.clipping.schedule) {
    const k = CLIPPING.crackdown;
    const out = [];
    let d = k.first + (parseInt(hash(`${C.rs}|crack`), 36) % k.spread);
    while (d < horizon) { out.push(d); d += k.every + (parseInt(hash(`${C.rs}|c${d}`), 36) % 40); }
    C.clipping.schedule = out;
  }
  return C.clipping.schedule;
}
export const crackdownActive = (state) => crackdownDays(state).some((d) => state.day >= d && state.day < d + CLIPPING.crackdown.days);

export function clippingDay(state) {
  const C = ensureConsumer(state);
  const K = CLIPPING;
  const sat = saturation(state);
  const waveToday = crackdownDays(state).includes(state.day);
  for (const c of C.clipping.campaigns) {
    // A closed campaign stops taking clips, but payouts already reserved (held for review) still clear and are spend.
    if (c.status === 'closed') { if (c.payouts.some((p) => !p.done)) releasePayouts(state, c); continue; }
    // Platform enforcement waves.
    if (waveToday) {
      const heavy = c.templated >= 0.5;
      const share = heavy ? K.crackdown.bannedShare[0] + crand(state) * (K.crackdown.bannedShare[1] - K.crackdown.bannedShare[0]) : K.crackdown.mildShare;
      c.viewMult = round2(c.viewMult * (1 - share * K.crackdown.viewCut / 0.5 * (heavy ? 1 : 0.5)));
      c.viewMult = Math.max(0.1, c.viewMult);
      c.bannedUntil = state.day + K.crackdown.days;
      pushEvent(state, 'platform_policy_strike', { kind: 'clip_crackdown', campaignId: c.id, label: `Platform enforcement wave hit ${c.name}: ${Math.round(share * 100)}% of clip accounts demoted or banned` });
      if (heavy) {
        logMistake(state, { functionId: FN, id: 'clip_accounts_banned_policy', label: 'Clip accounts banned under inauthentic / reused-content rules', cost: { usd: round2(Math.max(0, c.budget - c.paid) * 0.12 + 50), reputation: 2, days: 14, hours: 2 }, delayed: true, charge: true, app: 'launch', detail: `Rules asked clippers to post the same template (${Math.round(c.templated * 100)}% templated). YouTube's July 2025 inauthentic-content policy and TikTok enforcement removed ${Math.round(share * 100)}% of the accounts; views fell the same week.`, key: `clipban:${c.id}:${state.day}` });
        notify(state, `Platform enforcement hit "${c.name}": templated clip accounts were banned and views dropped.`, { type: 'bad', app: 'launch' });
      }
    }
    // Views recover slowly after a wave ends (new accounts).
    if (state.day >= c.bannedUntil && c.viewMult < 1) c.viewMult = Math.min(1, round2(c.viewMult + 0.015));
    // Ordinary account bans: much more likely when the rules ask for the same video again and again.
    if (c.clips > 20 && cchance(state, c.templated * K.banRisk.templatedDaily + (1 - c.templated) * K.banRisk.originalDaily)) c.viewMult = Math.max(0.1, round2(c.viewMult * 0.85));

    const remaining = c.budget - c.paid - c.fees - c.reserved;
    if (remaining > c.maxPerClip * 0.5 && c.status === 'active') {
      const mc = marketCpm(state);
      const attract = Math.pow(c.cpm / mc, 1.4);
      const n = samplePoisson(state, K.clippersPerDay * attract * c.viewMult * clamp(remaining / 100, 0.2, 1));
      const pf = fraudShare(c.cpm);
      const V = K.views;
      let clipsChecked = 0;
      for (let i = 0; i < n; i++) {
        if (c.budget - c.paid - c.fees - c.reserved < 0.01) break; // budget fully reserved: clippers stop submitting
        const boost = cchance(state, V.boostBase * (0.5 + c.hookQ) * (1 - 0.4 * sat));
        const real = Math.max(30, Math.round(lognormal(state, V.median, V.sigma) * (boost ? V.boostMult[0] + crand(state) * (V.boostMult[1] - V.boostMult[0]) : 1) * c.viewMult));
        const fraud = cchance(state, pf);
        const fake = fraud ? Math.round(real * (1.5 + crand(state) * 3) + 2000) : 0;
        let reported = real + fake;
        const capViews = Math.round((c.maxPerClip / c.cpm) * 1000);
        if (fraud) reported = Math.min(reported, Math.round(capViews * 0.97)); // bots stop just under the per-clip payout cap
        reported = Math.min(reported, capViews);
        c.clips++; clipsChecked++;
        c.realViews += real; c.reportedViews += reported;
        const ver = K.verification[c.verification];
        let payable = Math.min(real, capViews), caught = false;
        if (fraud) {
          caught = crand(state) < ver.detect;
          if (caught) { c.detected++; payable = Math.min(real, capViews); } else { payable = reported; c.fakePaid += Math.max(0, reported - Math.min(real, capViews)); }
        } else payable = Math.min(real, capViews);
        // The funded budget caps payouts: the last clips share what is left (the platform never pays past the escrow).
        const left = round2(c.budget - c.paid - c.fees - c.reserved);
        let amount = round2((payable / 1000) * c.cpm);
        if (amount * (1 + K.platformFee) > left) { amount = round2(Math.max(0, left) / (1 + K.platformFee)); payable = Math.round((amount / c.cpm) * 1000); }
        c.payableViews += payable;
        const fee = round2(Math.min(amount * K.platformFee, Math.max(0, left - amount)));
        c.reserved = round2(c.reserved + amount + fee);
        c.payouts.push({ day: state.day + K.payoutHold, amount, fee, fraud: fraud && !caught, caught });
        if (caught) pushEvent(state, 'view_fraud_detected', { campaignId: c.id, fakeViews: fake, label: `Botted views caught on a clip in ${c.name}` });
        // Real viewers become installs, but cheaply: low conversion, scaled by content-to-product fit and saturation.
        const inst = binomial(state, real, K.viewToInstall * c.fit * (1 - SATURATION.clipConvMult * sat) * clamp(Math.sqrt(productFactor(state) / 0.9), 0.4, 1.5));
        if (inst > 0) { c.installs += inst; deliverVisits(state, { source: 'organic:clips', installs: inst }); }
      }
      if (clipsChecked) chargeHours(state, (clipsChecked / 20) * K.verification[c.verification].hoursPer20, `Verifying clips: ${c.name}`);
    }
    // Pay what has cleared the hold.
    releasePayouts(state, c);
    if (c.status === 'active' && c.budget - c.paid - c.fees - c.reserved < c.maxPerClip * 0.5) c.status = 'exhausted';
    if (c.status === 'exhausted' && !c.payouts.some((p) => !p.done) && !c.closedDay) closeCampaign(state, c.id, 'budget spent');
  }
  // Keep the funnel's top-of-funnel view count in step with real views.
  const f = (C.funnel.sources['organic:clips'] ??= { views: 0, installs: 0, pwViews: 0, starts: 0, paid: 0, spend: 0, extraSpend: 0 });
  f.views = C.clipping.campaigns.reduce((a, c) => a + c.realViews, 0);
}

function releasePayouts(state, c) {
  const due = c.payouts.filter((p) => !p.done && p.day <= state.day);
  if (!due.length) return;
  const amt = round2(due.reduce((a, p) => a + p.amount, 0)), fee = round2(due.reduce((a, p) => a + p.fee, 0));
  for (const p of due) p.done = true;
  c.reserved = round2(Math.max(0, c.reserved - amt - fee));
  c.paid = round2(c.paid + amt); c.fees = round2(c.fees + fee);
  ledgerAdd(state, state.day, 'organic:clips', 'sp', amt + fee);
  pushEvent(state, 'clip_campaign_payout_due', { campaignId: c.id, amount: amt, label: `Clip payouts released for ${c.name}: $${amt.toFixed(2)} (+$${fee.toFixed(2)} fee)` });
}

function evaluate(state, c) {
  if (c.paid < 20) return;
  const fakeCost = c.payableViews > 0 ? round2((c.fakePaid / 1000) * c.cpm) : 0;
  if (fakeCost >= 50 && fakeCost / Math.max(1, c.paid) >= 0.1) {
    logMistake(state, { functionId: FN, id: 'paid_for_botted_views', label: 'Paid for botted views in a clipping campaign', cost: { usd: fakeCost, reputation: 1 }, delayed: true, app: 'launch', detail: `${c.fakePaid.toLocaleString()} fake views were paid at $${c.cpm.toFixed(2)} CPM (${Math.round(100 * fakeCost / c.paid)}% of payouts) because clips were paid on dashboard numbers (${CLIPPING.verification[c.verification].label.toLowerCase()}). Clips whose views stop just under the per-clip cap are the tell.`, key: `bots:${c.id}` });
  }
  const expected = c.realViews * CLIPPING.viewToInstall;
  if (c.realViews >= 100000 && c.installs < expected * 0.3) {
    logMistake(state, { functionId: FN, id: 'views_without_installs', label: 'Clipping reach that never became installs', cost: { usd: round2(c.paid + c.fees), days: 14 }, app: 'launch', detail: `${c.realViews.toLocaleString()} real views produced ${c.installs} installs. The clips (${c.content.replace(/_/g, ' ')}) were not about the app's problem, so the audience did not match.`, key: `vwi:${c.id}` });
  }
}

export function clippingStats(state) {
  const C = ensureConsumer(state);
  const cs = C.clipping.campaigns;
  const paid = cs.reduce((a, c) => a + c.paid + c.fees, 0);
  const real = cs.reduce((a, c) => a + c.realViews, 0);
  const installs = cs.reduce((a, c) => a + c.installs, 0);
  const fakePaid = cs.reduce((a, c) => a + c.fakePaid, 0);
  return { campaigns: cs.length, paid: round2(paid), realViews: real, installs, cpi: installs ? round2(paid / installs) : null, effectiveCpm: real ? round2((paid / real) * 1000) : null, detected: cs.reduce((a, c) => a + c.detected, 0), fakePaid, verified: cs.filter((c) => c.verification !== 'none').length };
}
