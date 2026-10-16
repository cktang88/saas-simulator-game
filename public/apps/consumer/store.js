// Mobile build path and App Review: platform stack (Expo / native / PWA), developer accounts and fees, EAS builds, TestFlight,
// and App Review as a real gate (days in review, rejections by guideline, resubmission cycles). Product's feature board keeps
// the app's features; this module is the shipping pipeline to the stores.
// Research: docs/research/consumer-apps/paywall-mobile-playbook.md section 1. Rejection odds are [design].

import { STACKS, ACCOUNTS, EAS, REVIEW, SATURATION, PAYWALL, MISTAKE_FN } from './params.js';
import { ensureConsumer, crand, cchance, saturation, pushEvent } from './state.js';
import { judgeDisclosure, darkOf } from './monetize.js';
import { post } from '../../core/bank.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { clamp, round2, monthKey } from '../../core/util.js';
import { shippedFeatures, hasProduct } from '../../core/market.js';
import { productSlice, newFeature } from '../product/store.js';
import { icpOverlap } from '../growth/judges.js';
import { ASO } from '../growth/asoParams.js';

const FN = MISTAKE_FN;
const competitorBrands = (text) => { const t = String(text ?? '').toLowerCase(); return (ASO.competitorBrands ?? []).filter((b) => t.includes(b)); };
export const storeCapable = (C) => Boolean(C.app.stack && STACKS[C.app.stack]?.store);
export const mobileLive = (state) => { const C = state.apps?.consumer; return Boolean(C && (C.app.live.ios || C.app.live.play)); };
/** True while the player runs a store app (the channels then route installs through the paywall funnel). */
export function mobileOn(state) {
  const C = state.apps?.consumer;
  return Boolean(C && state.company.model === 'b2c' && C.app.stack && STACKS[C.app.stack]?.store);
}

/** An AI coding agent (Product -> Build plan) or a vibe-coding builder is configured. */
export function hasAgent(state) {
  const P = productSlice(state);
  return Boolean(P.agent?.planId || P.agent?.recurringId || P.builder?.active);
}

// ---------------- stack and build ----------------

export function chooseStack(state, stack) {
  const C = ensureConsumer(state);
  if (state.company.model !== 'b2c') return { ok: false, error: 'The mobile playbook is for consumer (B2C) apps.' };
  if (!STACKS[stack]) return { ok: false, error: 'Unknown stack.' };
  if (C.app.stack === stack) return { ok: true, hours: 0 };
  if (C.app.built) {
    // Switching stack after building throws the build away: going in circles.
    logMistake(state, { functionId: FN, id: 'rebuilt_on_new_stack', label: `Rebuilt the app on ${STACKS[stack].label}`, cost: { hours: Math.round(STACKS[stack].hours * 0.6), days: 10 }, circles: true, charge: true, app: 'launch', detail: `The ${STACKS[C.app.stack].label} build could not be reused.` });
    C.app.built = false; C.app.builtDay = null; C.app.hoursDone = 0; C.app.status = 'none'; C.app.live = { ios: false, play: false };
  }
  C.app.stack = stack; C.app.stackDay = state.day;
  return { ok: true, hours: 0.5 };
}

export function buildHours(state, stack = ensureConsumer(state).app.stack) {
  const S = STACKS[stack];
  if (!S) return 0;
  return round2(S.hours * (hasAgent(state) ? S.agentMult : 1));
}

/** Build the MVP. Costs founder hours (returned) and ships a "mobile app" feature so the product exists for channels to point at. */
export function buildApp(state) {
  const C = ensureConsumer(state);
  if (!C.app.stack) return { ok: false, error: 'Choose a platform stack first.' };
  if (C.app.built) return { ok: false, error: 'Already built.' };
  const agent = hasAgent(state);
  const hours = buildHours(state);
  C.app.built = true; C.app.builtDay = state.day; C.app.hoursDone = hours; C.app.withAgent = agent;
  if (!shippedFeatures(state).length) {
    const f = { ...newFeature(state), title: `${STACKS[C.app.stack].label} app (MVP)`, status: 'shipped', shippedDay: state.day, effortHours: hours, progressHours: hours, user: state.company.icp || '', problem: state.company.oneLiner || '', solution: `${STACKS[C.app.stack].label} app: ${state.company.oneLiner || 'first version'}`, mobileMvp: true };
    productSlice(state).features.push(f);
  }
  return { ok: true, hours, agent, note: agent ? 'Built with your AI coding agent.' : 'Built by hand: an agent plan in Product would have roughly halved this on a JS stack.' };
}

// ---------------- accounts, EAS, TestFlight ----------------

export function enrollApple(state) {
  const C = ensureConsumer(state);
  if (C.app.apple.enrolled || C.app.apple.day != null) return { ok: false, error: 'Already enrolled.' };
  const S = state.apps.organic?.appstore; // the ASO module charges the same membership: never twice
  if (!(S?.fees?.appleYearDay != null && state.day - S.fees.appleYearDay < 365)) post(state, { amount: -ACCOUNTS.appleYear, counterparty: 'Apple Developer Program', description: 'Annual membership', category: 'software', method: 'card' });
  C.app.apple.day = state.day; C.app.apple.yearDay = state.day;
  if (S?.fees) S.fees.appleYearDay = state.day;
  return { ok: true, hours: 1.5, note: `Enrollment confirms in about ${ACCOUNTS.appleEnrollDays} days.` };
}
export function enrollGoogle(state) {
  const C = ensureConsumer(state);
  if (C.app.google.enrolled) return { ok: false, error: 'Already registered.' };
  post(state, { amount: -ACCOUNTS.googleOnce, counterparty: 'Google Play Console', description: 'One-time registration', category: 'software', method: 'card' });
  C.app.google.enrolled = true;
  return { ok: true, hours: 1 };
}
export const appleReady = (state) => { const a = ensureConsumer(state).app.apple; return a.day != null && state.day >= a.day + ACCOUNTS.appleEnrollDays; };

export function setEasPlan(state, plan) {
  const C = ensureConsumer(state);
  C.app.eas.plan = plan === 'starter' ? 'starter' : 'free';
  return { ok: true, hours: 0.2 };
}
/** One EAS build. Free plan: 15 builds a platform a month, then pay per build [unverified prices]; Starter covers more. */
export function easBuild(state, platform) {
  const C = ensureConsumer(state);
  const e = C.app.eas;
  const mk = monthKey(state);
  if (e.month !== mk) { e.month = mk; e.ios = 0; e.android = 0; e.extraUsd = 0; }
  const k = platform === 'ios' ? 'ios' : 'android';
  e[k]++;
  const free = EAS.freeBuilds[k] * (e.plan === 'starter' ? 3 : 1);
  let usd = 0;
  if (e[k] > free) { usd = EAS.extra[k]; e.extraUsd = round2(e.extraUsd + usd); post(state, { amount: -usd, counterparty: 'Expo (EAS Build)', description: `${k} build over the included quota`, category: 'software', method: 'card' }); }
  return { usd, hours: EAS.buildHours };
}

/** A TestFlight / internal-testing round: costs a few hours, finds crashes before App Review does. */
export function runBeta(state, { testers = 20 } = {}) {
  const C = ensureConsumer(state);
  if (!C.app.built) return { ok: false, error: 'Build the app first.' };
  if (!appleReady(state) && !C.app.google.enrolled) return { ok: false, error: 'Enroll in the Apple Developer Program (TestFlight) or Google Play first.' };
  easBuild(state, appleReady(state) ? 'ios' : 'android');
  C.app.beta.rounds++; C.app.beta.day = state.day; C.app.beta.fixed += Math.max(1, Math.round(testers / 8));
  return { ok: true, hours: REVIEW.testflightHours, found: Math.max(1, Math.round(testers / 8)), note: `${testers} testers found ${Math.max(1, Math.round(testers / 8))} bugs you fixed before review.` };
}

// ---------------- listing ----------------

/** Player-written store positioning. How different you are from the category leaders is judged from the words and what you built. */
export function setListing(state, patch = {}) {
  const C = ensureConsumer(state);
  Object.assign(C.app.listing, patch);
  return { ok: true, hours: 0.75, diff: differentiation(state) };
}
export function differentiation(state) {
  const C = ensureConsumer(state);
  const t = String(C.app.listing.differentiation ?? '');
  const words = t.trim().split(/\s+/).filter(Boolean).length;
  let s = 0.15;
  if (words >= 20) s += 0.2; else if (words >= 8) s += 0.08;
  if (/\d+\s?(%|x|minutes?|min|days?|weeks?|steps?|seconds?)|\b(only|unlike|first|specific|for (people|parents|students|nurses|runners|beginners))\b/i.test(t)) s += 0.2;
  s += 0.2 * icpOverlap(state, t);
  if (/\b(like|clone|similar to|better version|alternative to|but with ai|ai[- ]powered)\b/i.test(t)) s -= 0.2;
  const comp = competitorBrands(`${t} ${C.app.listing.competitors ?? ''}`);
  if (comp.length) s -= 0.1;
  s += 0.2 * clamp((shippedFeatures(state).length - 1) / 4, 0, 1); // features beyond the MVP are what make an app not a template
  return round2(clamp(s, 0, 1));
}

// ---------------- review ----------------

/** Per-guideline rejection odds for a submission today (pure; used by the UI to coach and by tests). */
export function reviewRisks(state, store = 'ios') {
  const C = ensureConsumer(state);
  const pw = C.monet.paywall;
  const d = pw.disclosure ?? judgeDisclosure(pw);
  const dark = darkOf(pw);
  const B = REVIEW.base;
  const sat = saturation(state);
  const diff = differentiation(state);
  const r = {
    '3.1.2': clamp(B['3.1.2'] + Math.pow(1 - d.score, 1.5) * 0.8 + dark.r312, 0, 0.95),
    '3.1.1': C.monet.mode === 'web' ? REVIEW.linkOut3_1_1 : B['3.1.1'],
    '4.3': clamp((B['4.3'] + sat * (1 - diff) * 0.55) * (1 + SATURATION.reject43 * sat * (1 - diff)), 0, 0.9),
    '5.1.1': C.app.listing.privacyUrl && C.app.listing.privacyLabel ? B['5.1.1'] : REVIEW.noPrivacyPolicy,
    '2.1': C.app.beta.rounds > 0 ? B['2.1'] : REVIEW.noBeta2_1,
  };
  if (store === 'play') for (const k of Object.keys(r)) r[k] *= 0.6; // Play review is faster and lenient on some rules [design]
  return r;
}

export function submitForReview(state, store = 'ios') {
  const C = ensureConsumer(state);
  if (!C.app.built) return { ok: false, error: 'Build the app first.' };
  if (C.app.pending) return { ok: false, error: 'A submission is already in review.' };
  if (store === 'ios' && !appleReady(state)) return { ok: false, error: 'The Apple Developer account is not enrolled yet.' };
  if (store === 'play' && !C.app.google.enrolled) return { ok: false, error: 'Register a Google Play developer account ($25) first.' };
  if (!STACKS[C.app.stack].platforms.includes(store === 'ios' ? 'ios' : 'play')) return { ok: false, error: `${STACKS[C.app.stack].label} does not ship to ${store === 'ios' ? 'iOS' : 'Android'}.` };
  if (!hasProduct(state)) return { ok: false, error: 'Nothing is shipped to review.' };
  easBuild(state, store === 'ios' ? 'ios' : 'android');
  const pw = C.monet.paywall;
  pw.disclosure = judgeDisclosure(pw);
  const risks = reviewRisks(state, store);
  const rejects = Object.entries(risks).filter(([, p]) => crand(state) < p).map(([g]) => g);
  let r = crand(state), days = 1;
  for (const [d, w] of REVIEW.dayWeights) { r -= w; days = d; if (r <= 0) break; }
  if (store === 'play') days = Math.max(1, days - 1);
  C.app.pending = { store, submittedDay: state.day, decideDay: state.day + days, rejects, risks };
  C.app.stats.submissions++;
  return { ok: true, hours: 0.75, days, risks };
}

export function storeDay(state) {
  const C = ensureConsumer(state);
  const a = C.app;
  // Apple membership renews yearly.
  if (a.apple.enrolled || a.apple.day != null) {
    if (!a.apple.enrolled && appleReady(state)) { a.apple.enrolled = true; notify(state, 'Apple Developer enrollment is confirmed.', { type: 'good', app: 'launch' }); }
    if (a.apple.yearDay != null && state.day - a.apple.yearDay >= 365) {
      const S = state.apps.organic?.appstore;
      if (!(S?.fees?.appleYearDay != null && S.fees.appleYearDay > a.apple.yearDay)) post(state, { amount: -ACCOUNTS.appleYear, counterparty: 'Apple Developer Program', description: 'Annual membership', category: 'software', method: 'card' });
      a.apple.yearDay = state.day;
    }
  }
  const p = a.pending;
  if (!p || state.day < p.decideDay) return;
  a.pending = null;
  const label = p.store === 'ios' ? 'App Store' : 'Google Play';
  if (!p.rejects.length) {
    a.live[p.store === 'ios' ? 'ios' : 'play'] = true; a.status = 'live'; a.liveDay ??= state.day;
    a.history.push({ day: state.day, store: p.store, result: 'approved' });
    pushEvent(state, 'app_review_result', { store: p.store, result: 'approved', label: `${label}: your app was approved` });
    notify(state, `${label} approved your app. It is live.`, { type: 'good', app: 'launch' });
    // Live in a crowded category with a thin differentiator: the copycat tax shows up in every channel later.
    if (saturation(state) >= 0.5 && differentiation(state) < 0.35) {
      a.copycat = true;
      logMistake(state, { functionId: FN, id: 'saturated_category_copycat', label: 'Launched a look-alike app into a saturated category', cost: { days: 30, reputation: 1 }, delayed: true, app: 'launch', detail: `Category saturation ${Math.round(saturation(state) * 100)}% and differentiation ${Math.round(differentiation(state) * 100)}%: installs convert and rank worse, and 4.3 reviews get harder every submission.`, key: 'copycat_live' });
    }
    return;
  }
  const g = p.rejects[0];
  a.stats.rejections++; a.stats.byGuideline[g] = (a.stats.byGuideline[g] ?? 0) + 1;
  a.history.push({ day: state.day, store: p.store, result: 'rejected', guideline: g });
  const fixH = REVIEW.fixHours[g] ?? 3;
  const ids = { '3.1.2': 'app_review_rejected_paywall', '4.3': 'saturated_category_copycat', '3.1.1': 'app_review_rejected_iap', '5.1.1': 'app_review_rejected_privacy', '2.1': 'app_review_rejected_incomplete' };
  const labels = { '3.1.2': 'App Review rejected the paywall (3.1.2)', '4.3': 'App Review rejected the app as spam / a copycat (4.3)', '3.1.1': 'App Review rejected the web checkout (3.1.1)', '5.1.1': 'App Review rejected the app for privacy (5.1.1)', '2.1': 'App Review rejected the build as incomplete (2.1)' };
  const sat = saturation(state);
  logMistake(state, {
    functionId: FN, id: ids[g] ?? 'app_review_rejected', label: labels[g] ?? `App Review rejected (${g})`, cost: { hours: fixH, days: 2 + Math.round(fixH / 2) },
    circles: a.stats.byGuideline[g] > 1, charge: true, app: 'launch',
    detail: `Guideline ${g}: ${REVIEW.guidelines[g] ?? ''}${g === '4.3' ? ` Category saturation ${Math.round(sat * 100)}%.` : ''}${g === '3.1.2' ? ` Paywall disclosure scored ${Math.round((C.monet.paywall.disclosure?.score ?? 0) * 100)}%.` : ''} Fix and resubmit: another day or two in the queue.`,
  });
  pushEvent(state, 'app_review_result', { store: p.store, result: 'rejected', guideline: g, label: `${label} rejected your app: ${g}` });
  notify(state, `${label} rejected your app under ${g}. ${REVIEW.guidelines[g] ?? ''} Fix it and resubmit.`, { type: 'bad', app: 'launch' });
}

export function storeMonthEnd(state) {
  const C = ensureConsumer(state);
  if (C.app.eas.plan === 'starter') post(state, { amount: -EAS.starterMonthly, counterparty: 'Expo (EAS Starter)', description: 'EAS plan', category: 'software', method: 'card' });
}
