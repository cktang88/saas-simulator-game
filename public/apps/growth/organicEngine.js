// Organic growth engine: personal-network launch, build in public, SEO/GEO content, communities, Product Hunt,
// referral program + word of mouth, newsletter sponsorships. Actions take judged inputs (from ./judges.js)
// and schedule real signups; onDay turns schedules and compounding channels into Stripe trials / CRM leads.

import { ensure, notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { activeSubs } from '../../core/stripe.js';
import { landingConversion, productFactor, hasProduct, trialConversion, ensureMarket } from '../../core/market.js';
import { rng, uid, round2, hash, isWeekend } from '../../core/util.js';
import { ORGANIC } from './params.js';
import { drCap, keywordMetrics, drawPosition, seoDailyVisits, geoDailyVisits, socialReach, communityOutcome, communityTail, networkLaunchPlan, phOutcome, kFactor, womTrialsPerDay, womWeight } from './organicModel.js';
import { acquire, addVisitors, sampleCount, ledgerAdd } from './acquire.js';
import { worldEffect } from '../marketworld/engine.js';

export function ensureOrganic(state) {
  const O = ensure(state, 'organic', () => ({}));
  O.schedule ??= []; // [{ day, source, visits?, trials?, conv?, forceConvert?, lead? }]
  O.posts ??= [];
  O.articles ??= [];
  O.community ??= { posts: [], banned: {} };
  O.launch ??= null;
  O.ph ??= null;
  O.referral ??= { enabled: false, reward: 'free_month', twoSided: true, cashAmount: 20 };
  O.sponsorships ??= [];
  O.newsletters ??= makeNewsletters(state);
  O.dr ??= 2; // domain rating (backlinks)
  O.linkEvents ??= 0;
  O.citations ??= 0; // third-party mentions LLM answer engines can cite
  O.stats ??= {}; // source -> { visits, signups }
  O.daily ??= []; // [{ d, src: {source: visits} }] last 120 days
  return O;
}

const stat = (O, source, field, n) => { const s = (O.stats[source] ??= { visits: 0, signups: 0 }); s[field] += n; };
function trackVisits(state, source, n) {
  const O = ensureOrganic(state);
  let day = O.daily.at(-1);
  if (!day || day.d !== state.day) { day = { d: state.day, src: {} }; O.daily.push(day); if (O.daily.length > 120) O.daily.shift(); }
  day.src[source] = (day.src[source] ?? 0) + n;
  stat(O, source, 'visits', n);
  addVisitors(state, n);
}

// Visitors → signups through the core landing-page conversion, with a channel multiplier.
function convertVisits(state, source, visits, { mult = 1, forceConvert = null, convMult = null, note = '' } = {}) {
  const O = ensureOrganic(state);
  const v = sampleCount(state, visits);
  if (!v) return 0;
  trackVisits(state, source, v);
  if (!hasProduct(state)) return 0;
  const n = Math.min(v, sampleCount(state, v * landingConversion(state) * mult));
  if (!n) return 0;
  const got = acquire(state, { source, n, forceConvert, convMult, note });
  stat(O, source, 'signups', n);
  return got.subs.length + got.leads;
}

// ---------------- Personal network launch (one-time) ----------------

export function launchToNetwork(state, { channels, message, skill }) {
  const O = ensureOrganic(state);
  if (O.launch) throw new Error('You already launched to your network. You only get one first impression.');
  const net = state.founder.network;
  const plan = networkLaunchPlan({ network: net, channels, model: state.company.model, skill });
  // Friends who try it: spread over the next 5 days; most pay only out of goodwill or if they are the ICP.
  const friends = sampleCount(state, plan.trials.friends ?? 0);
  for (let i = 0; i < friends; i++) O.schedule.push({ day: state.day + Math.floor(rng(state) * 5), source: 'network', trials: 1, forceConvert: plan.payProb.friends });
  for (let d = 0; d < 4; d++) O.schedule.push({ day: state.day + d, source: 'network', visits: plan.visits * [0.5, 0.25, 0.15, 0.1][d], mult: 2, convMult: 0.6 });
  O.launch = { day: state.day, channels, message, skill, friendsTrying: friends, expectedVisits: Math.round(plan.visits) };
  return O.launch;
}

// ---------------- Build in public ----------------

export function publishPost(state, { platform, text, skill, judge }) {
  const O = ensureOrganic(state);
  const net = state.founder.network;
  const followers = platform === 'x' ? net.x : net.linkedin;
  const hasLink = /https?:\/\/|www\.|\.(com|io|app|co)\b/i.test(text);
  const r = socialReach({ followers, platform, skill, hasLink }, () => rng(state));
  const fit = ORGANIC.social.audienceFit[state.company.model];
  const shares = [0.7, 0.2, 0.1];
  shares.forEach((sh, i) => O.schedule.push({ day: state.day + i, source: 'organic:social', visits: r.visits * sh, mult: fit }));
  if (platform === 'x') net.x += r.newFollowers; else net.linkedin += r.newFollowers;
  const p = { id: uid('post'), day: state.day, platform, text, skill, hasLink, ...r, judge };
  O.posts.unshift(p);
  if (O.posts.length > 200) O.posts.length = 200;
  if (r.breakout) notify(state, `Your ${platform === 'x' ? 'X' : 'LinkedIn'} post took off: ${r.reach.toLocaleString()} views, +${r.newFollowers} followers.`, { type: 'good', app: 'organic' });
  return p;
}

// ---------------- SEO / GEO content ----------------

export function publishArticle(state, { title, query, body, judge }) {
  const O = ensureOrganic(state);
  const km = keywordMetrics(query, state.company.model);
  const position = drawPosition({ tier: km.tier, quality: judge.quality, slop: judge.slop, dr: O.dr }, () => rng(state));
  const cited = rng(state) < judge.citable * (judge.slop > 0.5 ? 0.3 : 1);
  if (cited) O.citations += 1;
  const a = { id: uid('art'), day: state.day, title, query, words: String(body).trim().split(/\s+/).length, ...km, informational: judge.informational ?? !km.commercial, quality: judge.quality, slop: judge.slop, position, cited, visits: 0, signups: 0, judge: { results: judge.results, mock: judge.mock } };
  O.articles.unshift(a);
  return a;
}

// ---------------- Communities ----------------

export function communityPost(state, { community, kind, size, title, body, judge }) {
  const O = ensureOrganic(state);
  const key = community.trim().toLowerCase();
  if (O.community.banned[key]) throw new Error(`You're banned from ${community}.`);
  const hasLink = /https?:\/\/|www\.|\.(com|io|app|co)\b/i.test(`${title} ${body}`);
  const r = communityOutcome({ size, helpfulness: judge.helpfulness, relevance: judge.relevance, promotional: judge.promotional, report: judge.report, hasLink }, () => rng(state));
  if (r.banned) O.community.banned[key] = state.day;
  if (!r.removed) {
    [0.6, 0.25, 0.15].forEach((sh, i) => O.schedule.push({ day: state.day + i, source: 'organic:community', visits: r.visits * sh, mult: 1.1 }));
    if (r.citable) { O.citations += 0.5; addDR(O, 0.3, true); }
  }
  const p = { id: uid('cp'), day: state.day, community, kind, size, title, body, hasLink, ...r, judge: { results: judge.results, mock: judge.mock, promotional: judge.promotional, helpfulness: judge.helpfulness } };
  O.community.posts.unshift(p);
  return p;
}

// ---------------- Product Hunt ----------------

export function launchProductHunt(state, { tagline, description, firstComment, weekend, skill, judge }) {
  const O = ensureOrganic(state);
  if (O.ph) throw new Error('You already launched on Product Hunt.');
  const net = state.founder.network;
  const pf = Math.min(1, productFactor(state) / 1.75);
  const r = phOutcome({ skill, networkSize: net.x + net.linkedin * 0.3 + net.newsletter + net.friends, productFit: pf, weekend }, () => rng(state));
  ORGANIC.ph.dayShares.forEach((sh, i) => O.schedule.push({ day: state.day + i, source: 'product-hunt', trials: r.signups * sh, forceConvert: r.paidConv, visitsOnly: !hasProduct(state) }));
  addDR(O, r.dr, true);
  O.citations += r.rank <= 10 ? 1 : 0.3;
  ensureMarket(state).brand = Math.min(100, (state.market.brand ?? 0) + (r.rank <= 10 ? 6 : 2));
  O.ph = { day: state.day, tagline, description, firstComment, weekend, skill, ...r, judge };
  notify(state, `Product Hunt: you finished #${r.rank} of the day with ${r.upvotes} upvotes.`, { type: r.rank <= 10 ? 'good' : 'info', app: 'organic' });
  return O.ph;
}

// ---------------- Referral program ----------------

export function setReferral(state, cfg) {
  const O = ensureOrganic(state);
  O.referral = { ...O.referral, ...cfg };
  ensureMarket(state).referrals = { enabled: O.referral.enabled, reward: O.referral.reward };
  return O.referral;
}
export const currentK = (state) => kFactor({ model: state.company.model, productFactor: productFactor(state), referral: ensureOrganic(state).referral });

// ---------------- Newsletter sponsorships ----------------

const NL = {
  b2c: [['The Daily Upgrade', 'self-improvement'], ['Pocket Money', 'personal finance'], ['Morning Brew-style lifestyle digest', 'general consumer'], ['Fit Friday', 'fitness'], ['Study Hacks Weekly', 'students']],
  smb: [['Small Biz Weekly', 'small business owners'], ['The Agency Letter', 'agency owners'], ['Indie Ops', 'solo operators'], ['Ecom Insider', 'ecommerce'], ['The Bootstrapped Founder', 'founders']],
  ent: [['Ops Leaders Digest', 'operations executives'], ['The CFO Brief', 'finance leaders'], ['SecOps Weekly', 'security & IT'], ['RevOps Today', 'revenue operations'], ['The Enterprise Architect', 'IT architects']],
};
function makeNewsletters(state) {
  let seed = parseInt(hash(`${state.company.name}|nl`), 36) | 0;
  const r = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return (NL[state.company.model] ?? NL.smb).map(([name, niche], i) => {
    const subs = Math.round((state.company.model === 'ent' ? 8000 : 15000) * Math.pow(10, r() * 1.3) / 100) * 100;
    const cpm = ORGANIC.newsletter.cpmRange[0] + r() * (ORGANIC.newsletter.cpmRange[1] - ORGANIC.newsletter.cpmRange[0]);
    return { id: `nl_${i}`, name, niche, subs, price: Math.round((subs / 1000) * cpm / 10) * 10, fit: 0.4 + r() * 0.6, leadDays: 7 + Math.floor(r() * 21), open: ORGANIC.newsletter.open[0] + r() * (ORGANIC.newsletter.open[1] - ORGANIC.newsletter.open[0]) };
  });
}
export function bookSponsorship(state, { newsletterId, headline, body, cta, skill }) {
  const O = ensureOrganic(state);
  const nl = O.newsletters.find((n) => n.id === newsletterId);
  post(state, { amount: -nl.price, counterparty: nl.name, description: `Newsletter sponsorship (primary placement), send in ${nl.leadDays} days`, category: 'marketing', method: 'card' });
  ledgerAdd(state, state.day + nl.leadDays, 'newsletter', 'sp', nl.price);
  const b = { id: uid('sp'), newsletterId, name: nl.name, price: nl.price, bookedDay: state.day, sendDay: state.day + nl.leadDays, headline, body, cta, skill, status: 'booked' };
  O.sponsorships.unshift(b);
  return b;
}

// DR grows only from link events (and a trickle from content), up to a log-scale cap.
export function addDR(O, gain, linkEvent) {
  if (linkEvent) O.linkEvents = (O.linkEvents ?? 0) + 1;
  O.dr = Math.min(drCap(O.linkEvents ?? 0), O.dr + gain);
}

// ---------------- Daily ----------------

export function organicDay(state) {
  const O = ensureOrganic(state);
  const model = state.company.model;

  // Scheduled outcomes (launches, posts, PH spikes).
  const due = O.schedule.filter((x) => x.day <= state.day);
  O.schedule = O.schedule.filter((x) => x.day > state.day);
  for (const x of due) {
    if (x.visits) convertVisits(state, x.source, x.visits, { mult: x.mult ?? 1, convMult: x.convMult ?? null, forceConvert: x.forceConvert ?? null });
    if (x.trials) {
      const n = sampleCount(state, x.trials);
      if (!n) continue;
      trackVisits(state, x.source, n);
      if (x.visitsOnly || !hasProduct(state)) continue;
      const got = acquire(state, { source: x.source, n, forceConvert: x.forceConvert ?? null });
      stat(O, x.source, 'signups', got.subs.length + got.leads);
    }
  }

  // Newsletter sends.
  for (const b of O.sponsorships) {
    if (b.status !== 'booked' || b.sendDay !== state.day) continue;
    const nl = O.newsletters.find((n) => n.id === b.newsletterId);
    const opens = nl.subs * nl.open;
    const ctr = ORGANIC.newsletter.ctr[0] + (ORGANIC.newsletter.ctr[1] - ORGANIC.newsletter.ctr[0]) * b.skill * nl.fit;
    const clicks = opens * ctr;
    const before = O.stats.newsletter?.signups ?? 0;
    convertVisits(state, 'newsletter', clicks * 0.7, { mult: ORGANIC.newsletter.warm });
    O.schedule.push({ day: state.day + 1, source: 'newsletter', visits: clicks * 0.3, mult: ORGANIC.newsletter.warm });
    b.status = 'sent';
    b.clicks = Math.round(clicks);
    b.signups = (O.stats.newsletter?.signups ?? 0) - before;
    notify(state, `${nl.name} sent your sponsorship to ${nl.subs.toLocaleString()} subscribers: ~${b.clicks} clicks.`, { type: 'info', app: 'organic' });
  }

  // SEO articles compound slowly; LLM answer engines cite a few pages.
  const seoShock = worldEffect(state, 'organicTrafficMult') * worldEffect(state, 'organicShareMult'); // core updates, new entrants
  for (const a of O.articles) {
    const v = seoShock * seoDailyVisits({ volume: a.volume, position: a.position, informational: a.informational, ageDays: state.day - a.day, tier: a.tier });
    const conv = a.commercial ? ORGANIC.seo.commercialConv : ORGANIC.seo.blogConv;
    const s = convertVisits(state, 'organic:seo', v, { mult: conv });
    a.signups += s;
    a.visits += v;
  }
  const geo = geoDailyVisits(O.citations) * worldEffect(state, 'aiReferralMult');
  if (geo > 0) convertVisits(state, 'organic:llm', geo, { mult: ORGANIC.geo.convMult * ORGANIC.seo.commercialConv });

  // Helpful community threads keep sending a trickle.
  for (const p of O.community.posts) {
    if (!p.tail) continue;
    const v = communityTail(p.tail, state.day - p.day);
    if (v < 0.01) continue;
    convertVisits(state, 'organic:community', v, { mult: 1 });
  }

  // Word of mouth & referrals: proportional to active customers × fit × referral program.
  const active = activeSubs(state);
  if (active.length > 0 && hasProduct(state)) {
    const k = currentK(state);
    const tc = trialConversion(state);
    const weighted = active.reduce((a, x) => a + womWeight(state.day - x.startDay), 0);
    const mean = womTrialsPerDay({ weighted, k, trialConv: tc });
    const n = sampleCount(state, mean);
    if (n > 0) {
      const kBase = kFactor({ model, productFactor: productFactor(state), referral: null });
      const refShare = O.referral.enabled ? Math.max(0, 1 - kBase / Math.max(k, 1e-9)) : 0;
      let ref = 0;
      for (let i = 0; i < n; i++) if (rng(state) < refShare) ref++;
      if (n - ref > 0) { const g = acquire(state, { source: 'organic:wom', n: n - ref, convMult: ORGANIC.wom.referredConvMult }); stat(O, 'organic:wom', 'signups', g.subs.length + g.leads); }
      if (ref > 0) {
        const g = acquire(state, { source: 'referral', n: ref, convMult: ORGANIC.wom.referredConvMult });
        stat(O, 'referral', 'signups', g.subs.length + g.leads);
        if (O.referral.reward === 'cash') {
          const cost = round2(ref * O.referral.cashAmount * (O.referral.twoSided ? 2 : 1) * tc);
          if (cost > 0) post(state, { amount: -cost, counterparty: 'Referral payouts (Rewardful)', description: `Cash referral rewards (${ref} referred signups)`, category: 'marketing', method: 'ach' });
        }
      }
    }
  }
  O.lastK = currentK(state);
  if (!isWeekend(state) && state.day % 7 === 3) addDR(O, 0.01 * O.articles.length, false);
}
