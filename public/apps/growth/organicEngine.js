// Organic growth engine: personal-network launch, build in public, SEO/GEO content, communities, Product Hunt,
// referral program + word of mouth, newsletter sponsorships. Actions take judged inputs (from ./judges.js)
// and schedule real signups; onDay turns schedules and compounding channels into Stripe trials / CRM leads.

import { ensure, notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { activeSubs, cancel } from '../../core/stripe.js';
import { landingConversion, productFactor, hasProduct, trialConversion, ensureMarket, marketDemand, shippedFeatures } from '../../core/market.js';
import { logMistake } from '../../core/operator.js';
import { rng, uid, round2, hash, isWeekend } from '../../core/util.js';
import { ORGANIC, DEMAND_EXP, WOM_K_CAP, APPSTORE, LAUNCHES, ATTENTION } from './params.js';
import { drCap, geoDailyVisits, socialReach, communityOutcome, communityTail, networkLaunchPlan, phOutcome, kFactor, womTrialsPerDay, womWeight, appStoreInstalls, reviewStars, hnOutcome, relaunchMult, attentionAfterPost, attentionRecover } from './organicModel.js';
import { ideaHash } from '../marketworld/competitors.js';
import { acquire, addVisitors, sampleCount, ledgerAdd } from './acquire.js';
import { worldEffect } from '../marketworld/engine.js';
import { seoPenaltyMult } from '../plg/penalty.js';
import { createArticle, seoDay, articleDay, pageConversion, seoSiteMult } from './seoDynamics.js';
import { aiDailyVisits, aiConvMult } from '../searchtools/geo.js';

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
  O.launches ??= []; // every launch: { day, kind, idea, change, legit, n, ... }
  O.attention ??= { x: 1, linkedin: 1 }; // audience attention per platform (posting fatigue)
  O.appstore ??= { startDay: null, reviews: 0, starSum: 0, prompt: 'none', aso: null };
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

// Hidden market demand scales traffic VOLUME (sub-linear exponent per channel).
export const demandMult = (state, kind) => Math.pow(marketDemand(state), DEMAND_EXP[kind] ?? 0.5);

// ---------------- Launches: many shots ----------------

// What changed since the last launch of this kind? Features shipped since then, or a different product (idea).
export function launchContext(state, kind) {
  const O = ensureOrganic(state);
  const idea = ideaHash(state);
  const same = O.launches.filter((l) => l.kind === kind && l.idea === idea);
  const last = same.at(-1) ?? null;
  const change = last ? shippedFeatures(state).filter((f) => (f.shippedDay ?? -1) > last.day).length : shippedFeatures(state).length;
  const legit = !last || change >= LAUNCHES.minChangeFeatures;
  return { n: same.length, last, change, legit, newProduct: !last && O.launches.some((l) => l.kind === kind), daysSince: last ? state.day - last.day : null, idea };
}
// Relaunching without real change: platforms flag it, audiences tune out, reputation takes a hit (traceable).
function relaunchPenalty(state, kind, ctx, label) {
  if (ctx.legit) return;
  const m = ensureMarket(state);
  m.brand = Math.max(0, (m.brand ?? 0) - LAUNCHES.noChangePenalty.brand);
  logMistake(state, { functionId: 'launch_community_referral', id: 'relaunch_no_change', label: `Re-launched on ${label} without real change`, cost: { reputation: LAUNCHES.noChangePenalty.brand, hours: 0 }, detail: `${ctx.change} feature(s) shipped since the last ${label} launch ${ctx.daysSince} days ago. Audiences and moderators treat it as spam.`, app: 'organic' });
}
function recordLaunch(state, kind, ctx, extra = {}) {
  const O = ensureOrganic(state);
  const l = { day: state.day, kind, idea: ctx.idea, change: ctx.change, legit: ctx.legit, n: ctx.n, ...extra };
  O.launches.push(l);
  if (O.launches.length > 100) O.launches.shift();
  return l;
}

// ---------------- Personal network launch (first launch, then re-announcements) ----------------

export function launchToNetwork(state, { channels, message, skill }) {
  const O = ensureOrganic(state);
  const ctx = launchContext(state, 'network');
  relaunchPenalty(state, 'network', ctx, 'your network');
  const net = state.founder.network;
  const plan = networkLaunchPlan({ network: net, channels, model: state.company.model, skill });
  // Friends and followers tune out repeated asks: ×0.6 per earlier announcement, ×0.3 more without real change.
  const mult = relaunchMult(ctx.n, ctx.legit);
  plan.trials.friends = (plan.trials.friends ?? 0) * mult;
  plan.visits *= mult * demandMult(state, 'network');
  // Friends who try it: spread over the next 5 days; most pay only out of goodwill or if they are the ICP.
  const friends = sampleCount(state, plan.trials.friends ?? 0);
  for (let i = 0; i < friends; i++) {
    const day = state.day + Math.floor(rng(state) * 5);
    // Is this friend actually the customer? Then they convert like any trial (product fit decides); otherwise only a rare pity buy.
    if (rng(state) < plan.icpShare) O.schedule.push({ day, source: 'network', trials: 1, convMult: ORGANIC.network.icpConvMult });
    else O.schedule.push({ day, source: 'network', trials: 1, forceConvert: plan.pityConv, pity: true });
  }
  for (let d = 0; d < 4; d++) O.schedule.push({ day: state.day + d, source: 'network', visits: plan.visits * [0.5, 0.25, 0.15, 0.1][d], mult: 2, convMult: 0.6 });
  O.launch = { day: state.day, channels, message, skill, friendsTrying: friends, expectedVisits: Math.round(plan.visits), repeat: ctx.n, legit: ctx.legit };
  recordLaunch(state, 'network', ctx, { friends });
  return O.launch;
}

// ---------------- Build in public ----------------

export function publishPost(state, { platform, text, skill, judge, release = null }) {
  const O = ensureOrganic(state);
  const net = state.founder.network;
  const followers = platform === 'x' ? net.x : net.linkedin;
  const hasLink = /https?:\/\/|www\.|\.(com|io|app|co)\b/i.test(text);
  const r = socialReach({ followers, platform, skill, hasLink }, () => rng(state));
  // Audience fatigue: reach scales with remaining attention; generic posts burn it much faster.
  const att = O.attention[platform] ?? 1;
  const sameDay = O.posts.some((x) => x.platform === platform && x.day === state.day);
  const boost = release ? LAUNCHES.releaseBoost * (release.legit ? 1 : LAUNCHES.noChangePenalty.reach) : 1;
  const k = att * boost;
  r.reach = Math.round(r.reach * k); r.engagements = Math.round(r.engagements * k);
  r.visits *= k * demandMult(state, 'social');
  r.newFollowers = Math.round(r.newFollowers * k * demandMult(state, 'followers'));
  O.attention[platform] = attentionAfterPost(att, skill, sameDay);
  if (skill < 0.4) r.newFollowers -= Math.round(followers * ATTENTION.unfollowGeneric);
  if (O.attention[platform] < 0.5) logMistake(state, { functionId: 'content_seo_geo', id: 'bip_no_point', label: 'Posting so often or so generically that your audience tunes out', cost: { reputation: 1 }, detail: `${platform === 'x' ? 'X' : 'LinkedIn'} attention is down to ${Math.round(O.attention[platform] * 100)}%: each new post now reaches a fraction of your followers.`, app: 'organic', key: `attention:${platform}:${Math.floor(state.day / 14)}` });
  const fit = ORGANIC.social.audienceFit[state.company.model];
  const shares = [0.7, 0.2, 0.1];
  shares.forEach((sh, i) => O.schedule.push({ day: state.day + i, source: 'organic:social', visits: r.visits * sh, mult: fit }));
  if (platform === 'x') net.x = Math.max(0, net.x + r.newFollowers); else net.linkedin = Math.max(0, net.linkedin + r.newFollowers);
  const p = { id: uid('post'), day: state.day, platform, text, skill, hasLink, attention: +att.toFixed(2), release: Boolean(release), ...r, judge };
  O.posts.unshift(p);
  if (O.posts.length > 200) O.posts.length = 200;
  if (r.breakout) notify(state, `Your ${platform === 'x' ? 'X' : 'LinkedIn'} post took off: ${r.reach.toLocaleString()} views, +${r.newFollowers} followers.`, { type: 'good', app: 'organic' });
  return p;
}

// ---------------- SEO / GEO content ----------------

// Article creation, ranking, decay, refresh, core updates, links and technical SEO live in ./seoDynamics.js.
export function publishArticle(state, { title, query, body, judge }) {
  ensureOrganic(state);
  return createArticle(state, { title, query, body, judge, source: 'founder' });
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
    r.visits *= demandMult(state, 'community');
    r.tail *= demandMult(state, 'community');
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
  const ctx = launchContext(state, 'product_hunt');
  if (ctx.last && ctx.daysSince < LAUNCHES.phMinDays) throw new Error(`Product Hunt only allows a relaunch about 6 months after the last one (${ctx.daysSince} days ago).`);
  relaunchPenalty(state, 'product_hunt', ctx, 'Product Hunt');
  const net = state.founder.network;
  const pf = Math.min(1, productFactor(state) / 1.75);
  const r = phOutcome({ skill: ctx.legit ? skill : skill * 0.5, networkSize: net.x + net.linkedin * 0.3 + net.newsletter + net.friends, productFit: pf, weekend }, () => rng(state));
  r.signups = Math.round(r.signups * relaunchMult(ctx.n, ctx.legit) * demandMult(state, 'launch'));
  if (ctx.n) r.dr = ctx.legit ? 1 : 0;
  ORGANIC.ph.dayShares.forEach((sh, i) => O.schedule.push({ day: state.day + i, source: 'product-hunt', trials: r.signups * sh, forceConvert: r.paidConv, visitsOnly: !hasProduct(state) }));
  addDR(O, r.dr, true);
  O.citations += r.rank <= 10 ? 1 : 0.3;
  ensureMarket(state).brand = Math.min(100, (state.market.brand ?? 0) + (r.rank <= 10 ? 6 : 2));
  O.ph = { day: state.day, tagline, description, firstComment, weekend, skill, ...r, judge, repeat: ctx.n, legit: ctx.legit };
  recordLaunch(state, 'product_hunt', ctx, { rank: r.rank, signups: r.signups });
  notify(state, `Product Hunt: you finished #${r.rank} of the day with ${r.upvotes} upvotes.`, { type: r.rank <= 10 ? 'good' : 'info', app: 'organic' });
  return O.ph;
}

// ---------------- Show HN ----------------

const DEV_FIT = /\b(developer|devs?|api|sdk|engineer|code|coding|open[- ]source|cli|database|infra|devops|github|llm|ai agent)\b/i;
export function launchShowHN(state, { title, text, skill }) {
  const ctx = launchContext(state, 'show_hn');
  relaunchPenalty(state, 'show_hn', ctx, 'Hacker News');
  const devFit = DEV_FIT.test(`${state.company.oneLiner} ${state.company.icp}`) ? 1 : 0.3;
  const r = hnOutcome({ skill, devFit, legit: ctx.legit }, () => rng(state));
  const visits = r.visitors * relaunchMult(ctx.n, true) * demandMult(state, 'launch');
  const O = ensureOrganic(state);
  [0.7, 0.2, 0.1].forEach((sh, i) => O.schedule.push({ day: state.day + i, source: 'organic:hn', visits: visits * sh, mult: LAUNCHES.hn.conv }));
  if (r.front) { addDR(O, 2, true); O.citations += 0.5; }
  const l = recordLaunch(state, 'show_hn', ctx, { title, front: r.front, points: r.points, visits: Math.round(visits), flagged: r.flagged });
  notify(state, r.front ? `Show HN reached the front page: ${r.points} points.` : r.flagged ? 'Your Show HN was flagged as a repost.' : `Show HN got ${r.points} points and sank.`, { type: r.front ? 'good' : 'info', app: 'organic' });
  return l;
}

// ---------------- Release announcements (new major features) ----------------

export function announceRelease(state, { platform, text, skill, judge }) {
  const ctx = launchContext(state, 'release');
  // A "release" with nothing new shipped is just a louder ordinary post that annoys people.
  const real = { ...ctx, legit: ctx.change >= 1 };
  relaunchPenalty(state, 'release', real, 'a release announcement');
  const p = publishPost(state, { platform, text, skill, judge, release: real });
  recordLaunch(state, 'release', real, { reach: p.reach });
  return p;
}

// ---------------- Referral program ----------------

export function setReferral(state, cfg) {
  const O = ensureOrganic(state);
  O.referral = { ...O.referral, ...cfg };
  ensureMarket(state).referrals = { enabled: O.referral.enabled, reward: O.referral.reward };
  return O.referral;
}
// Word of mouth also depends on how many people around your customers have the problem (hidden demand); capped at 0.6.
export const currentK = (state) => Math.min(WOM_K_CAP, kFactor({ model: state.company.model, productFactor: productFactor(state), referral: ensureOrganic(state).referral }) * demandMult(state, 'wom'));

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

// ---------------- B2C app-store organic discovery ----------------

export function appStoreState(state) {
  const S = ensureOrganic(state).appstore;
  return { ...S, stars: S.reviews ? S.starSum / S.reviews : null };
}
export function appStoreDay(state) {
  if (state.company.model !== 'b2c' || !hasProduct(state)) return;
  const O = ensureOrganic(state);
  const S = O.appstore;
  S.startDay ??= state.day;
  const stars = S.reviews ? S.starSum / S.reviews : null;
  const installs = appStoreInstalls({ stars, reviews: S.reviews, aso: S.aso?.score ?? null, daysLive: state.day - S.startDay }) * demandMult(state, 'appstore');
  const n = sampleCount(state, installs);
  if (!n) return;
  trackVisits(state, 'organic:appstore', n);
  const trials = Math.min(n, sampleCount(state, n * landingConversion(state) * APPSTORE.installIntent));
  if (trials) { const got = acquire(state, { source: 'organic:appstore', n: trials }); stat(O, 'organic:appstore', 'signups', got.subs.length); }
  // Ratings: installers who are prompted (or volunteer) rate the app; product fit sets the stars.
  const k = sampleCount(state, n * (APPSTORE.promptRate[S.prompt] ?? APPSTORE.promptRate.none));
  const mean = reviewStars(state.market?.fit?.product?.score ?? 0.3, S.prompt);
  for (let i = 0; i < k; i++) { S.starSum += Math.min(5, Math.max(1, Math.round(mean + (rng(state) - 0.5) * 2.4))); S.reviews++; }
}
export function setReviewPrompt(state, prompt) {
  const S = ensureOrganic(state).appstore;
  S.prompt = prompt;
  if (prompt === 'on_open') logMistake(state, { functionId: 'launch_community_referral', id: 'review_prompt_on_open', label: 'Asking for a rating on app open', cost: { reputation: 2 }, delayed: true, detail: 'Interrupting people before they got value pulls ratings down; your star average and store ranking will show it.', app: 'organic' });
  return S;
}
export function setAsoListing(state, { title, subtitle, keywords, description, score, feedback }) {
  const S = ensureOrganic(state).appstore;
  S.aso = { day: state.day, title, subtitle, keywords, description, score, feedback };
  return S.aso;
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
      const got = acquire(state, { source: x.source, n, forceConvert: x.forceConvert ?? null, convMult: x.convMult ?? null });
      if (x.pity) for (const sub of got.subs) (O.pity ??= []).push(sub.id);
      stat(O, x.source, 'signups', got.subs.length + got.leads);
    }
  }

  // Pity purchases pay once, then cancel at the end of the first paid period.
  if (O.pity?.length) {
    const subs = new Map(state.stripe.subscriptions.map((x) => [x.id, x]));
    O.pity = O.pity.filter((id) => {
      const sub = subs.get(id);
      if (!sub || sub.status === 'canceled') return false;
      if (sub.status === 'active' && !sub.cancelAtPeriodEnd) { cancel(state, id, { atPeriodEnd: true, reason: 'pity_purchase' }); return false; }
      return true;
    });
  }

  // Newsletter sends.
  for (const b of O.sponsorships) {
    if (b.status !== 'booked' || b.sendDay !== state.day) continue;
    const nl = O.newsletters.find((n) => n.id === b.newsletterId);
    const opens = nl.subs * nl.open;
    const ctr = (ORGANIC.newsletter.ctr[0] + (ORGANIC.newsletter.ctr[1] - ORGANIC.newsletter.ctr[0]) * b.skill * nl.fit) * demandMult(state, 'newsletter');
    const clicks = opens * ctr;
    const before = O.stats.newsletter?.signups ?? 0;
    convertVisits(state, 'newsletter', clicks * 0.7, { mult: ORGANIC.newsletter.warm });
    O.schedule.push({ day: state.day + 1, source: 'newsletter', visits: clicks * 0.3, mult: ORGANIC.newsletter.warm });
    b.status = 'sent';
    b.clicks = Math.round(clicks);
    b.signups = (O.stats.newsletter?.signups ?? 0) - before;
    notify(state, `${nl.name} sent your sponsorship to ${nl.subs.toLocaleString()} subscribers: ~${b.clicks} clicks.`, { type: 'info', app: 'organic' });
  }

  // SEO articles compound slowly (and decay, drift, get re-judged by core updates: ./seoDynamics.js); LLM answer
  // engines cite a few pages.
  seoDay(state);
  const seoDemand = demandMult(state, 'seo');
  const seoShock = worldEffect(state, 'organicTrafficMult') * worldEffect(state, 'organicShareMult') * seoPenaltyMult(state); // world shocks, PLG pSEO demotion
  const site = seoSiteMult(state); // spam demotions, manual actions, migrations, noindex accidents
  for (const a of O.articles) {
    const { visits: v } = articleDay(state, a, { shock: seoShock, demand: seoDemand, site });
    if (!(v > 0)) continue;
    const s = convertVisits(state, 'organic:seo', v, { mult: pageConversion(a) });
    a.signups += s;
    a.visits += v;
  }
  // GEO: share of voice across buyer prompts and engines (apps/searchtools/geo.js); O.citations stays as its decayed scalar.
  const geo = aiDailyVisits(state) * worldEffect(state, 'aiReferralMult') * demandMult(state, 'geo');
  if (geo > 0) convertVisits(state, 'organic:llm', geo, { mult: aiConvMult(state) * ORGANIC.seo.commercialConv });

  // Helpful community threads keep sending a trickle.
  for (const p of O.community.posts) {
    if (!p.tail) continue;
    const v = communityTail(p.tail, state.day - p.day); // tail already scaled by demand at posting time
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
  for (const k of Object.keys(O.attention)) O.attention[k] = attentionRecover(O.attention[k]);
  appStoreDay(state);
  if (!isWeekend(state) && state.day % 7 === 3) addDR(O, 0.01 * O.articles.length, false);
}
