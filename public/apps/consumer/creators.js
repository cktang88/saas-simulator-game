// Organic creator program (Sideshift-style marketplace): post a brief, hire student / micro creators who post on THEIR OWN
// accounts, many posts a week. Views per post are heavy-tailed (most flop, a few break out); the hook the player writes and the
// brief's clarity decide the odds. Disclosure (#ad / branded content) is the creator's duty and your liability. Proven hooks
// can be promoted to Meta as Partnership ads through the Ads creatives library.
// Research: docs/research/consumer-apps/ugc-clipping.md sections 1, 3, 4. Odds and volumes are [design].

import { CREATORS, MISTAKE_FN, SATURATION } from './params.js';
import { personName } from '../../core/names.js';
import { ensureConsumer, crand, cchance, cnormal, lognormal, binomial, saturation, pushEvent } from './state.js';
import { deliverVisits } from './funnel.js';
import { post } from '../../core/bank.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { clamp, round2, uid } from '../../core/util.js';
import { productFactor } from '../../core/market.js';
import { creativeHeuristic, creativeSkill, briefHeuristic } from '../growth/judges.js';
import { addCreative } from '../growth/adsEngine.js';
import { ledgerAdd } from '../growth/acquire.js';

const FN = MISTAKE_FN;
const NICHES = ['study tips', 'self-improvement', 'fitness', 'budgeting', 'parenting', 'habit tracking', 'travel', 'cooking', 'productivity', 'comedy skits', 'beauty', 'gaming'];
const DAY_SHARE = [0.38, 0.22, 0.14, 0.1, 0.07, 0.05, 0.04]; // how a post's views arrive over its first week

/** Hook strength 0..1 from the same creative heuristics the Ads app uses (specific, ICP-fit, not generic or buzzwordy). */
export function hookSkill(state, hook, message = '') {
  const t = String(hook ?? '').trim();
  if (!t) return 0.1;
  const h = creativeHeuristic(state, { hook: t, primaryText: message, headline: '', cta: 'Download' });
  return round2(clamp(creativeSkill([h]), 0, 1));
}
export function briefScore(state, b) {
  const h = briefHeuristic(state, { hook: b.hooks.join('\n'), keyMessage: b.message, notes: b.notes });
  return round2(clamp((h.clarity + h.hookStrength * 1.3 + h.icpFit + h.actionable * 0.7) / 40, 0, 1));
}

export function setMarketplace(state, tier) {
  const C = ensureConsumer(state);
  if (!CREATORS.subs[tier]) return { ok: false, error: 'Unknown tier.' };
  C.creators.sub = tier;
  return { ok: true, hours: 0.25 };
}

/** Write a brief: up to 5 hook options (one per line), the message, shots / dos and don'ts, fee and bonus. */
export function postBrief(state, { hooks = [], message = '', notes = '', fee = 100, bonusPer1k = 2, requireDisclosure = null } = {}) {
  const C = ensureConsumer(state);
  const hs = hooks.map((h) => String(h).trim()).filter(Boolean).slice(0, 5);
  if (!hs.length) return { ok: false, error: 'Write at least one hook.' };
  fee = clamp(+fee || 0, 20, 600);
  bonusPer1k = clamp(+bonusPer1k || 0, 0, 10);
  const needs = requireDisclosure ?? /#ad\b|paid partnership|branded content|disclos|sponsor/i.test(`${notes} ${message}`);
  const b = { id: `brief_${++C.creators.seq}`, hooks: hs, message, notes, fee, bonusPer1k, requireDisclosure: Boolean(needs), day: state.day };
  b.score = briefScore(state, b);
  b.hookSkills = hs.map((h) => hookSkill(state, h, message));
  C.creators.briefs.push(b);
  return { ok: true, hours: briefHours(hs), brief: b };
}
/** Founder hours for a brief with these hook lines (blank lines and hooks past the fifth are dropped, as postBrief does). */
export const briefHours = (hooks = []) => round2(CREATORS.hourPerBrief + 0.1 * hooks.map((h) => String(h).trim()).filter(Boolean).slice(0, 5).length);

/** Creators currently on the roster (hired, not yet done): the subscription's rosterMax caps these, not each hire. */
export const rosterActive = (C) => C.creators.posts.filter((p) => p.status !== 'done').length;
/** How many of `count` requested creators the roster has room for right now (0 when it is full). */
export function hireCount(state, count = 5) {
  const C = ensureConsumer(state);
  const sub = CREATORS.subs[C.creators.sub] ?? CREATORS.subs.none;
  return Math.min(Math.max(1, Math.round(Number(count) || 1)), Math.max(0, sub.rosterMax - rosterActive(C)));
}

function makePool(state, n, fee) {
  const mean = 0.35 + 0.3 * clamp((fee - 50) / 250, 0, 1); // pay more and the better creators apply
  return Array.from({ length: n }, () => {
    const skill = clamp(mean + 0.18 * cnormal(state), 0.05, 0.98);
    // Name: shared bank, unique in the game; one crand draw, as the old first-name pick made.
    return { id: uid('crt'), name: personName(state, { rand: () => crand(state), oneDraw: true }).name, niche: NICHES[Math.floor(crand(state) * NICHES.length)], followers: Math.round(lognormal(state, 6000, 0.9)), skill: round2(skill), match: round2(clamp(0.45 + 0.45 * crand(state), 0, 1)) };
  });
}

/** Hire `count` creators on a brief; each makes one post over the next 3-9 days. Fees are paid when the post goes up. */
export function hireCreators(state, { briefId, count = 5 } = {}) {
  const C = ensureConsumer(state);
  const b = C.creators.briefs.find((x) => x.id === briefId);
  if (!b) return { ok: false, error: 'Pick a brief.' };
  const sub = CREATORS.subs[C.creators.sub];
  count = hireCount(state, count);
  if (count < 1) return { ok: false, error: `Your roster is full (${rosterActive(C)} of ${sub.rosterMax} creators on ${sub.label}). Wait for posts to finish or move to a bigger plan.` };
  const pool = makePool(state, count, b.fee);
  const posts = [];
  pool.forEach((cr, i) => {
    const hookIdx = i % b.hooks.length;
    const [lo, hi] = CREATORS.postDelay;
    const p = { id: uid('post'), briefId: b.id, creator: cr, hook: b.hooks[hookIdx], hookIdx, hookQ: b.hookSkills[hookIdx], postDay: state.day + lo + Math.floor(crand(state) * (hi - lo + 1)), fee: b.fee, bonusPer1k: b.bonusPer1k, status: 'queued', views: 0, installs: 0, disclosed: null, breakout: false, finalViews: 0, age: 0, bonusPaid: 0 };
    C.creators.posts.push(p);
    posts.push(p);
  });
  if (C.creators.posts.length > 400) C.creators.posts = C.creators.posts.filter((p) => p.status !== 'done').slice(-300).concat(C.creators.posts.filter((p) => p.status === 'done').slice(-100));
  return { ok: true, hours: round2(CREATORS.hourPerCreator * count), posts };
}

const tested = (C, hook) => { let h = C.creators.hooksTested.find((x) => x.hook === hook); if (!h) { h = { hook, posts: 0, views: 0, installs: 0, breakouts: 0 }; C.creators.hooksTested.push(h); } return h; };

function publish(state, C, p) {
  const b = C.creators.briefs.find((x) => x.id === p.briefId);
  const V = CREATORS.views;
  const sat = saturation(state);
  const eff = clamp(0.6 * p.hookQ + 0.4 * p.creator.skill, 0, 1) * (0.7 + 0.3 * (b?.score ?? 0.4)); // an unclear brief drags every post down
  const hit = (V.breakoutBase + V.breakoutHook * eff) * (1 - SATURATION.hitMult * sat) * (C.app?.copycat ? 0.8 : 1);
  p.breakout = crand(state) < hit;
  const scale = 0.6 + 0.8 * eff;
  p.finalViews = Math.round(p.breakout ? V.median * (V.breakoutMult[0] + crand(state) * (V.breakoutMult[1] - V.breakoutMult[0])) * scale : lognormal(state, V.median, V.sigma) * scale);
  p.disclosed = cchance(state, b?.requireDisclosure ? CREATORS.disclosure.briefed : CREATORS.disclosure.unbriefed);
  p.status = 'live'; p.age = 0; p.liveDay = state.day;
  post(state, { amount: -p.fee, counterparty: `${p.creator.name} (creator, ${p.creator.niche})`, description: `UGC post fee: ${p.hook.slice(0, 40)}`, category: 'marketing', method: 'card', meta: { source: 'organic:ugc' } });
  ledgerAdd(state, state.day, 'organic:ugc', 'sp', p.fee);
  const h = tested(C, p.hook); h.posts++;
  if (p.breakout) h.breakouts++;
  if (p.finalViews >= CREATORS.viralViews) {
    pushEvent(state, 'creator_post_viral', { postId: p.id, views: p.finalViews, hook: p.hook, label: `A creator post is going viral (${Math.round(p.finalViews / 1000)}k views)` });
    notify(state, `A creator post is taking off: ${Math.round(p.finalViews / 1000)}k views projected.`, { type: 'good', app: 'launch' });
  }
}

/** Views to installs for a post: audience match of the hook and message, the creator's niche, and product fit. */
export function viewToInstall(state, p, b) {
  // Audience match as a viewer judges it (the ad judge's relevance, which caps a hook stuffed with ICP keywords): raw
  // keyword overlap would pay a word list more installs than a specific hook.
  const h = creativeHeuristic(state, { hook: p.hook, primaryText: b?.message ?? '', headline: '', cta: 'Download' });
  const aud = 0.25 + 0.75 * clamp((h.relevance - 3) / 4, 0, 1) * (h.generic ? 0.1 : 1);
  const fit = clamp(Math.sqrt(productFactor(state) / 0.9), 0.4, 1.5);
  return CREATORS.viewToInstall * aud * (0.6 + 0.4 * p.creator.match) * fit;
}

export function creatorsDay(state) {
  const C = ensureConsumer(state);
  const penalty = state.day < C.creators.penaltyUntil ? CREATORS.disclosure.reachPenalty : 1;
  for (const p of C.creators.posts) {
    if (p.status === 'queued' && state.day >= p.postDay) publish(state, C, p);
    const b = C.creators.briefs.find((x) => x.id === p.briefId);
    if (p.status === 'done' && !p.removed && !p.disclosed && !p.flagged && p.liveDay != null && state.day - p.liveDay <= 30) {
      // The post's views are over, but the paid, unlabelled post stays up and exposed for its first month.
      if (cchance(state, CREATORS.disclosure.dailyRisk)) strike(state, C, p, b);
      continue;
    }
    if (p.status !== 'live') continue;
    const share = DAY_SHARE[p.age] ?? 0;
    p.age++;
    const views = Math.round(p.finalViews * share * penalty);
    if (views > 0) {
      p.views += views;
      const inst = binomial(state, views, viewToInstall(state, p, b));
      p.installs += inst;
      const h = tested(C, p.hook); h.views += views; h.installs += inst;
      const f = (C.funnel.sources['organic:ugc'] ??= { views: 0, installs: 0, pwViews: 0, starts: 0, paid: 0, spend: 0, extraSpend: 0 });
      f.views += views;
      if (inst > 0) deliverVisits(state, { source: 'organic:ugc', installs: inst });
    }
    // Undisclosed paid posts are exposed to platform labels and the FTC for their first month.
    if (!p.disclosed && !p.flagged && p.age <= 30 && cchance(state, CREATORS.disclosure.dailyRisk)) strike(state, C, p, b);
    if (p.age >= DAY_SHARE.length + 1) finish(state, C, p, b);
  }
}

function strike(state, C, p, b) {
  p.flagged = true;
  C.creators.strikes.push({ day: state.day, postId: p.id });
  C.creators.penaltyUntil = state.day + CREATORS.disclosure.penaltyDays;
  const D = CREATORS.disclosure;
  let usd = D.takedownUsd, extra = '';
  if (C.creators.strikes.length >= 2 && cchance(state, D.ftcOdds)) {
    const bill = Math.round(D.ftcBill[0] + crand(state) * (D.ftcBill[1] - D.ftcBill[0]));
    usd += bill; C.creators.ftc++;
    post(state, { amount: -bill, counterparty: 'Law firm (endorsement disclosure inquiry)', description: 'Response to an FTC endorsement-disclosure inquiry', category: 'legal', method: 'ach' });
    extra = ` After repeat strikes a regulator asked about your endorsement disclosures (legal bill $${bill}).`;
  }
  post(state, { amount: -D.takedownUsd, counterparty: 'Creator marketplace', description: 'Takedown, relabel and re-brief of an undisclosed paid post', category: 'marketing', method: 'card', meta: { source: 'organic:ugc' } });
  logMistake(state, { functionId: FN, id: 'undisclosed_creator_posts', label: 'Paid creator post without #ad / branded-content disclosure', cost: { usd, reputation: 2, hours: 3 }, delayed: true, charge: true, app: 'launch', detail: `The brief ${b?.requireDisclosure ? 'asked for' : 'did not require'} a disclosure; a platform label strike cut reach of every creator post by ${Math.round((1 - D.reachPenalty) * 100)}% for ${D.penaltyDays} days.${extra}`, key: `undisclosed:${p.id}` });
  pushEvent(state, 'platform_policy_strike', { kind: 'undisclosed_ad', postId: p.id, label: 'A creator post was flagged for missing paid-partnership disclosure' });
}

function finish(state, C, p, b) {
  p.status = 'done';
  const bonus = round2((p.views / 1000) * p.bonusPer1k);
  if (bonus > 0) { post(state, { amount: -bonus, counterparty: `${p.creator.name} (creator bonus)`, description: `View bonus ($${p.bonusPer1k}/1k views)`, category: 'marketing', method: 'card', meta: { source: 'organic:ugc' } }); ledgerAdd(state, state.day, 'organic:ugc', 'sp', bonus); p.bonusPaid = bonus; }
  // Reach without installs: the wrong audience (memes, mismatched niche) shows up as views that never convert.
  const expected = p.views * CREATORS.viewToInstall;
  if (p.views >= 20000 && p.installs < expected * 0.35) {
    logMistake(state, { functionId: FN, id: 'views_without_installs', label: 'Big reach, almost no installs (wrong audience)', cost: { usd: round2(p.fee + bonus), days: 7 }, app: 'launch', detail: `${p.views.toLocaleString()} views produced ${p.installs} installs (${(100 * p.installs / Math.max(1, p.views)).toFixed(2)}% vs ~${(100 * CREATORS.viewToInstall).toFixed(2)}% at full fit). The hook "${p.hook.slice(0, 50)}" did not speak to the people who need the app.`, key: `vwi:${p.id}` });
  }
}

/** Audit disclosure on live posts: ask creators to add the label. Costs founder time, removes the strike exposure. */
export function auditDisclosure(state) {
  const C = ensureConsumer(state);
  const live = C.creators.posts.filter((p) => p.status === 'live' || (p.status === 'done' && state.day - p.liveDay <= 30));
  const bad = live.filter((p) => !p.disclosed);
  let fixed = 0, removed = 0;
  for (const p of bad) { if (crand(state) < 0.9) { p.disclosed = true; fixed++; } else { p.status = 'done'; p.removed = true; removed++; } }
  C.creators.audits++;
  return { ok: true, hours: round2(0.3 + 0.05 * live.length + 0.1 * bad.length), checked: live.length, fixed, removed };
}

/** Promote a creator post's hook to Meta as a Partnership ad: needs disclosure, costs a whitelisting fee, lands in the Ads library. */
export function promoteToAds(state, postId) {
  const C = ensureConsumer(state);
  const p = C.creators.posts.find((x) => x.id === postId);
  if (!p) return { ok: false, error: 'No such post.' };
  if (p.status === 'queued') return { ok: false, error: 'The post is not live yet.' };
  if (!p.disclosed) return { ok: false, error: 'Partnership ads need the branded-content disclosure on the post. Run a disclosure audit first.' };
  if (C.creators.promoted.some((x) => x.postId === p.id)) return { ok: false, error: 'Already promoted.' };
  const b = C.creators.briefs.find((x) => x.id === p.briefId);
  const fee = round2(p.fee * CREATORS.promote.whitelistPct);
  post(state, { amount: -fee, counterparty: `${p.creator.name} (partnership ad access)`, description: `Partnership ad access for 30 days: ${p.hook.slice(0, 40)}`, category: 'marketing', method: 'card', meta: { source: 'ads:meta' } }); // runs as a Meta ad
  const proven = p.breakout || p.views >= CREATORS.viralViews / 5;
  const skill = clamp(p.hookQ + (proven ? CREATORS.promote.provenBoost : -0.05), 0, 1);
  const cr = addCreative(state, { name: `Partner: ${p.hook.slice(0, 32)}`, format: 'ugc_video', hook: p.hook, primaryText: b?.message ?? '', headline: '', cta: 'Download', source: 'creator', skill, whitelistedThrough: state.day + CREATORS.promote.days, fee });
  cr.status = 'approved';
  cr.provenViews = p.views;
  C.creators.promoted.push({ postId: p.id, creativeId: cr.id, hook: p.hook, proven, views: p.views, day: state.day });
  return { ok: true, hours: 0.5, creative: cr, proven, fee };
}

/** Summary used by the UI and the operator reader. */
export function creatorStats(state) {
  const C = ensureConsumer(state);
  const posts = C.creators.posts.filter((p) => p.status !== 'queued');
  const sorted = posts.map((p) => p.finalViews).sort((a, b) => b - a);
  const total = sorted.reduce((a, b) => a + b, 0);
  const top = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.1))).reduce((a, b) => a + b, 0);
  const spent = posts.reduce((a, p) => a + p.fee + p.bonusPaid, 0);
  const installs = posts.reduce((a, p) => a + p.installs, 0);
  return { posts: posts.length, breakouts: posts.filter((p) => p.breakout).length, views: posts.reduce((a, p) => a + p.views, 0), installs, spent: round2(spent), cpi: installs ? round2(spent / installs) : null, topDecileShare: total ? top / total : 0, disclosedShare: posts.length ? posts.filter((p) => p.disclosed).length / posts.length : 1, hooksTested: C.creators.hooksTested.length, promoted: C.creators.promoted.length, provenPromoted: C.creators.promoted.filter((x) => x.proven).length, strikes: C.creators.strikes.length };
}

export function creatorsMonthEnd(state) {
  const C = ensureConsumer(state);
  const sub = CREATORS.subs[C.creators.sub];
  if (sub?.monthly > 0) post(state, { amount: -sub.monthly, counterparty: 'Creator marketplace subscription', description: sub.label, category: 'marketing', method: 'card', meta: { source: 'organic:ugc' } });
}
