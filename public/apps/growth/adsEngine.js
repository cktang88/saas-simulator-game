// Ads simulation engine: ad accounts & billing, campaign/ad set/ad structure, daily delivery for every platform,
// attribution (true vs reported), learning phase, creative review and UGC creator orders.
// Pure math lives in ./delivery.js; this module applies it to state.apps.ads. onDay code is synchronous and
// uses rng(state) only.

import { ensure, notify, log } from '../../core/state.js';
import { post, balance } from '../../core/bank.js';
import { mainPlan, landingConversion, monthlyPrice, hasProduct, productFactor } from '../../core/market.js';
import { rng, uid, round2, dateOf, dayOfMonth, hash, chance } from '../../core/util.js';
import { PLATFORMS, AUDIENCES, UGC, NO_TRIAL_PURCHASE_FACTOR, ATTRIBUTION_DAYS, PURCHASE_OPT, FORMATS, AI_UGC, WEAR_HALF_LIFE_DAYS } from './params.js';
import { keywordMetrics } from './organicModel.js';
import { keywordRoot } from './delivery.js';
import { auctionDay, searchDay, learningStatus, reportRate, reportDelay, qualityFromDraw, budgetEditEffect } from './delivery.js';
import { acquire, addVisitors, visitors30, ledgerAdd, sampleCount, ensureGrowth } from './acquire.js';
import { worldEffect } from '../marketworld/engine.js';

// ---------------- State ----------------

export function ensureAds(state) {
  const A = ensure(state, 'ads', () => ({}));
  A.accounts ??= {};
  A.campaigns ??= [];
  A.adsets ??= [];
  A.ads ??= [];
  A.creatives ??= [];
  A.rows ??= [];
  A.pending ??= [];
  A.attrib ??= {};
  A.orders ??= [];
  A.creators ??= makeCreators(state);
  A.salt ??= hash(`${state.company.name}|${state.founder.name}|${state.startDate}`); // per-game salt for creative draws
  return A;
}

export const platformAccount = (state, p) => ensureAds(state).accounts[p] ?? null;
export function accountReady(acct) {
  return Boolean(acct && acct.payment && acct.status !== 'payment_failed');
}

export function createAccount(state, p) {
  const A = ensureAds(state);
  const P = PLATFORMS[p];
  A.accounts[p] = {
    createdDay: state.day, payment: null, pixel: false, capi: false, trialValue: 0, status: 'active',
    thresholdIdx: 0, unbilled: 0, lifetime: 0, paidBills: 0, bills: [],
    dailyLimit: P.newDailyLimit, spendCap: null, targetCpa: defaultTargetCpa(state),
    id: String(1000000000 + Math.floor(rng(state) * 8999999999)).slice(0, 15),
  };
  return A.accounts[p];
}
export function defaultTargetCpa(state) {
  const price = monthlyPrice(mainPlan(state));
  return Math.round(state.company.model === 'b2c' ? price * 2.5 : state.company.model === 'smb' ? price * 3 : price * 0.6);
}

const byId = (arr, id) => arr.find((x) => x.id === id);

export function createCampaign(state, { p, name, objective }) {
  const c = { id: uid('cmp'), p, name: name || `${PLATFORMS[p].label} campaign`, objective, status: 'active', createdDay: state.day };
  ensureAds(state).campaigns.push(c);
  return c;
}
export function createAdSet(state, { campaignId, name, budget, bid, audience, placement, optimization, keywords }) {
  const A = ensureAds(state);
  const c = byId(A.campaigns, campaignId);
  const s = {
    id: uid('as'), campaignId, p: c.p, name: name || 'Ad set', budget: Math.max(1, +budget || 0), bid: bid ?? { strategy: 'lowest_cost', cap: null },
    audience: audience ?? { type: 'broad' }, placement: placement ?? 'advantage', optimization: optimization ?? 'trial',
    keywords: keywords ?? [], status: 'active', createdDay: state.day, learn: { start: state.day, status: 'learning' }, edits: [],
  };
  A.adsets.push(s);
  if (c.p === 'apple') createAd(state, { adsetId: s.id, creativeId: null, name: 'Default product page' });
  return s;
}
export function createAd(state, { adsetId, creativeId, name }) {
  const A = ensureAds(state);
  const s = byId(A.adsets, adsetId);
  const cr = creativeId ? byId(A.creatives, creativeId) : null;
  const ad = { id: uid('ad'), adsetId, campaignId: s.campaignId, p: s.p, creativeId, name: name || cr?.name || 'Ad', status: 'active', createdDay: state.day, lifeImps: 0, first: { im: 0, cl: 0 } };
  A.ads.push(ad);
  // Adding new ads to a running ad set is a significant edit on Meta/TikTok.
  if (s.createdDay < state.day && PLATFORMS[s.p].learning && s.learn.status !== 'learning') relearn(state, s, 'new ad added');
  return ad;
}

export function relearn(state, s, why) {
  s.learn = { start: state.day, status: 'learning' };
  s.edits.push({ day: state.day, why });
}

// Budget edit with the learning-phase consequences of a large change.
export function editBudget(state, adsetId, newBudget) {
  const s = byId(ensureAds(state).adsets, adsetId);
  if (!s) return null;
  const eff = budgetEditEffect(s.budget, newBudget, () => rng(state));
  s.edits.push({ day: state.day, why: `budget ${Math.round(s.budget)} → ${Math.round(newBudget)}` });
  s.budget = Math.max(1, newBudget);
  if (eff.relearn && PLATFORMS[s.p].learning) relearn(state, s, `budget change ${Math.round(eff.change * 100)}%`);
  return eff;
}

// ---------------- Creatives ----------------

// Creative "entities" (Meta Andromeda groups near-identical ads): the hidden draw is seeded from the normalized copy,
// so pasting the same ad again buys no new lottery ticket; copy with token overlap ≥ 0.6 joins the existing entity
// and shares its wear.
export const normalizeCopy = (c) => `${c.hook ?? ''} ${c.primaryText ?? ''} ${c.headline ?? ''}`.toLowerCase().replace(/[^a-z0-9$% ]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (t) => new Set(t.split(' ').filter((w) => w.length > 2));
export function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return a === b ? 1 : 0; // too short to compare by words: only exact copies match
  let i = 0;
  for (const w of A) if (B.has(w)) i++;
  return i / (A.size + B.size - i);
}
const unit = (str) => (parseInt(hash(str), 36) % 1_000_003) / 1_000_003;
export const SIMILAR = 0.6;
export const MAX_REVIEWS_PER_DAY = 50;

// The hook is what makes an ad different in the feed: same body with a new hook is a new entity.
export function findEntity(state, format, copy, hookKey = '') {
  const A = ensureAds(state);
  let best = null, bestJ = 0;
  for (const c of A.creatives) {
    if (c.format !== format || !c.copyKey) continue;
    if (hookKey && c.hookKey != null && jaccard(hookKey, c.hookKey) < SIMILAR) continue;
    const j = jaccard(copy, c.copyKey);
    if (j > bestJ) { bestJ = j; best = c; }
  }
  return bestJ >= SIMILAR ? { root: entityOf(state, best), similarity: bestJ } : null;
}
export function entityOf(state, c) {
  if (!c?.entity) return c;
  return ensureAds(state).creatives.find((x) => x.id === c.entity) ?? c;
}

export function addCreative(state, data) {
  const A = ensureAds(state);
  const today = A.creatives.filter((x) => x.createdDay === state.day && x.source !== 'creator').length;
  if (data.source !== 'creator' && today >= MAX_REVIEWS_PER_DAY) throw new Error(`Ad review limit: ${MAX_REVIEWS_PER_DAY} new creatives per day.`);
  const copy = normalizeCopy(data);
  const hookKey = normalizeCopy({ hook: data.hook });
  const ent = findEntity(state, data.format, copy, hookKey);
  const key = `${A.salt}|${data.format}|${copy}`;
  const u = ent ? Math.min(1, Math.max(0, ent.root.u + (unit(key) - 0.5) * 0.1)) : unit(key);
  const tier = data.format === 'ai_ugc' ? (data.tier ?? 'pro') : null;
  const c = {
    id: uid('cr'), name: data.name || data.headline || 'Creative', format: data.format, hook: data.hook ?? '', primaryText: data.primaryText ?? '',
    headline: data.headline ?? '', cta: data.cta ?? 'Learn more', source: data.source ?? 'self', creatorId: data.creatorId ?? null,
    createdDay: state.day, status: 'in_review', u, q: null, skill: data.skill ?? null, judge: null, copyKey: copy, hookKey, tier,
    entity: ent ? ent.root.id : null, similarity: ent ? +ent.similarity.toFixed(2) : null, lifeImps: 0,
    glitch: tier ? unit(`${key}|glitch`) < (AI_UGC.glitchByTier[tier] ?? AI_UGC.glitchChance) : false, whitelistedThrough: data.whitelistedThrough ?? null, fee: data.fee ?? 0, orderId: data.orderId ?? null,
  };
  if (c.skill != null) { c.q = qualityFromDraw(c.u, c.skill); }
  A.creatives.push(c);
  return c;
}

export const creativeFor = (state, ad) => (ad.creativeId ? byId(ensureAds(state).creatives, ad.creativeId) : null);
export const isWhitelisted = (state, cr) => Boolean(cr?.whitelistedThrough != null && cr.whitelistedThrough >= state.day);

// ---------------- UGC creators ----------------

const CREATOR_FIRST = ['Jess', 'Marcus', 'Priya', 'Tom', 'Aaliyah', 'Dani', 'Kofi', 'Mia', 'Rafael', 'Hannah', 'Chen', 'Leila', 'Brooke', 'Andre'];
const CREATOR_NICHE = { b2c: ['lifestyle', 'productivity', 'fitness & wellness', 'personal finance', 'students', 'parents', 'tech reviews', 'ASMR / aesthetic'], smb: ['small business', 'agency owners', 'ecommerce', 'creator economy', 'productivity', 'freelancers', 'tech reviews', 'B2B explainer'], ent: ['B2B explainer', 'IT & security', 'finance leaders', 'sales leaders', 'HR / people ops', 'tech reviews', 'operations', 'analyst-style'] };

function makeCreators(state) {
  let seed = parseInt(hash(`${state.company.name}|creators`), 36) | 0;
  const r = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const niches = CREATOR_NICHE[state.company.model] ?? CREATOR_NICHE.b2c;
  return Array.from({ length: 10 }, (_, i) => {
    const premium = i % 5 === 4;
    const [lo, hi] = premium ? UGC.premiumRange : UGC.rateRange;
    const name = CREATOR_FIRST[(i * 5 + Math.floor(r() * 3)) % CREATOR_FIRST.length];
    return {
      id: `cr8r_${i}`, name, handle: `@${name.toLowerCase()}${premium ? '.creates' : Math.floor(r() * 90 + 10)}`, niche: niches[i % niches.length],
      rate: Math.round((lo + r() * (hi - lo)) / 5) * 5, rating: +(4.3 + r() * 0.7).toFixed(1), jobs: Math.floor(10 + r() * 300),
      days: UGC.deliveryDays[0] + Math.floor(r() * (UGC.deliveryDays[1] - UGC.deliveryDays[0] + 1)),
      skill: Math.min(0.95, 0.3 + r() * 0.5 + (premium ? 0.15 : 0)), premium,
      style: ['talking head, testimonial', 'problem/solution skit', 'green-screen reaction', 'day-in-the-life', 'unboxing / screen demo'][Math.floor(r() * 5)],
    };
  });
}

export function orderUgc(state, { creatorId, brief, briefScore, videos = 1, hookVariations = 0, whitelisting = false }) {
  const A = ensureAds(state);
  const cr = byId(A.creators, creatorId);
  const base = cr.rate * videos + UGC.hookVariation * hookVariations;
  const wl = whitelisting ? round2(base * UGC.whitelistPct) : 0;
  const fee = round2(base + wl);
  post(state, { amount: -fee, counterparty: `${cr.name} (${cr.handle}) via UGC marketplace`, description: `UGC: ${videos} video(s)${hookVariations ? ` + ${hookVariations} hook variations` : ''}${whitelisting ? ' + 30-day whitelisting' : ''}`, category: 'marketing', method: 'card' });
  const late = chance(state, UGC.lateChance) ? 1 + Math.floor(rng(state) * 5) : 0;
  const o = { id: uid('ugc'), creatorId, brief, briefScore, videos, hookVariations, whitelisting, fee, base, orderedDay: state.day, dueDay: state.day + cr.days + late, promisedDay: state.day + cr.days, status: 'in_production', creativeIds: [] };
  A.orders.push(o);
  return o;
}

function deliverOrders(state) {
  const A = ensureAds(state);
  for (const o of A.orders) {
    if (o.status !== 'in_production' || state.day < o.dueDay) continue;
    const cr = byId(A.creators, o.creatorId);
    const hooks = String(o.brief.hook).split('\n').map((h) => h.trim()).filter(Boolean);
    const n = o.videos + o.hookVariations;
    for (let i = 0; i < n; i++) {
      const skill = Math.min(1, Math.max(0, 0.55 * o.briefScore + 0.45 * cr.skill + (rng(state) - 0.5) * 0.15));
      const c = addCreative(state, {
        name: `${cr.name} UGC #${i + 1}`, format: 'ugc_video', hook: hooks[i % Math.max(1, hooks.length)] || '(creator improvised the hook)',
        primaryText: o.brief.keyMessage, headline: o.brief.headline || state.company.name, cta: 'Learn more', source: 'creator', creatorId: cr.id,
        skill, orderId: o.id, fee: o.base / n, whitelistedThrough: o.whitelisting ? state.day + 30 : null,
      });
      c.status = 'approved';
      c.judge = { skill, mock: true, results: [], note: `Brief score ${Math.round(o.briefScore * 100)}, creator ${cr.handle}` };
      o.creativeIds.push(c.id);
    }
    o.status = 'delivered';
    o.deliveredDay = state.day;
    notify(state, `${cr.name} delivered ${n} UGC video${n > 1 ? 's' : ''}${o.dueDay > o.promisedDay ? ` (${o.dueDay - o.promisedDay} days late)` : ''}. They're in your creative library.`, { type: 'good', app: 'ads' });
  }
}

function renewWhitelisting(state) {
  const A = ensureAds(state);
  const activeCreatives = new Set(A.ads.filter((a) => a.status === 'active').map((a) => a.creativeId));
  for (const c of A.creatives) {
    if (c.whitelistedThrough == null || c.whitelistedThrough !== state.day || !activeCreatives.has(c.id) || !c.orderId) continue;
    const o = byId(A.orders, c.orderId);
    const fee = round2((o.base / Math.max(1, o.videos + o.hookVariations)) * UGC.whitelistPct);
    post(state, { amount: -fee, counterparty: `${byId(A.creators, c.creatorId)?.name ?? 'Creator'} (whitelisting)`, description: `Whitelisting / partnership ads renewal: ${c.name}`, category: 'marketing', method: 'card' });
    c.whitelistedThrough = state.day + 30;
  }
}

// ---------------- Billing ----------------

export function billAccount(state, p, { reason = 'threshold' } = {}) {
  const acct = platformAccount(state, p);
  const P = PLATFORMS[p];
  const amount = round2(acct.unbilled);
  if (amount <= 0) return true;
  if (balance(state) < amount) {
    acct.status = 'payment_failed';
    acct.bills.push({ day: state.day, amount, status: 'failed', reason });
    notify(state, `${P.label}: your card was declined for ${amount.toFixed(2)}. Ads stopped delivering until the balance is paid.`, { type: 'bad', app: 'ads' });
    return false;
  }
  post(state, { amount: -amount, counterparty: P.vendor, description: `${P.descriptor} ${acct.id.slice(-6)} ${reason === 'monthly' ? 'monthly invoice' : 'billing threshold'}`, category: 'advertising', method: 'card' });
  acct.unbilled = 0;
  acct.status = 'active';
  acct.paidBills++;
  acct.bills.push({ day: state.day, amount, status: 'paid', reason });
  if (acct.bills.length > 200) acct.bills.splice(0, 50);
  acct.thresholdIdx = Math.min(acct.thresholdIdx + 1, P.thresholds.length - 1);
  if (acct.dailyLimit != null) acct.dailyLimit = acct.paidBills >= 4 ? null : acct.dailyLimit * 2;
  return true;
}

// ---------------- Rows (daily stats per ad) ----------------

function rowFor(A, d, ad) {
  const found = findRow(A, d, ad.id);
  if (found) return found;
  const r = { d, p: ad.p, c: ad.campaignId, s: ad.adsetId, a: ad.id, sp: 0, im: 0, cl: 0, lp: 0, tr: 0, pu: 0, rt: 0, rpp: 0, rv: 0 };
  A.rows.push(r);
  return r;
}
// Rows for older days (attribution updates): scan backwards.
function findRow(A, d, adId) {
  for (let i = A.rows.length - 1; i >= 0; i--) {
    const r = A.rows[i];
    if (r.d === d && r.a === adId) return r;
    if (r.d < d) break;
  }
  return null;
}

export const resultsField = (opt) => (opt === 'purchase' ? 'rpp' : 'rt');

function eventsInWindow(A, s, day, cfg) {
  if (!cfg) return 0;
  const from = Math.max(s.learn.start, day - cfg.window + 1);
  const f = resultsField(s.optimization);
  let n = 0;
  for (let i = A.rows.length - 1; i >= 0; i--) {
    const r = A.rows[i];
    if (r.d < from) break;
    if (r.s === s.id) n += r[f];
  }
  return n;
}
function poolImps(A, ids, fromDay, toDay) {
  let n = 0;
  for (let i = A.rows.length - 1; i >= 0; i--) {
    const r = A.rows[i];
    if (r.d < fromDay) break;
    if (ids.has(r.s) && r.d <= toDay) n += r.im;
  }
  return n;
}

export function audienceSize(state, s) {
  const model = state.company.model;
  const t = s.audience.type;
  if (t === 'retargeting') return Math.round(visitors30(state) * 0.7);
  const a = AUDIENCES[t] ?? AUDIENCES.broad;
  return a.size?.[model] ?? a.size?.smb ?? 100000;
}
export function audienceProblem(state, s) {
  const acct = platformAccount(state, s.p);
  const t = s.audience.type;
  if (t === 'retargeting' && !acct?.pixel) return 'Retargeting needs the pixel installed.';
  if (t === 'retargeting' && audienceSize(state, s) < 100) return `Custom audience too small (${audienceSize(state, s)} matched visitors; needs ≥100).`;
  if (t === 'lookalike' && (state.stripe?.customers.length ?? 0) < (AUDIENCES.lookalike.seedMin)) return `Lookalike needs a seed of ≥100 customers (you have ${state.stripe?.customers.length ?? 0}).`;
  return null;
}

// Eligible ads in an ad set and the reason it is not delivering, if any.
export function deliveryState(state, s) {
  const A = ensureAds(state);
  const c = byId(A.campaigns, s.campaignId);
  const acct = platformAccount(state, s.p);
  if (!acct) return { ok: false, why: 'No ad account' };
  if (!acct.payment) return { ok: false, why: 'No payment method' };
  if (acct.status === 'payment_failed') return { ok: false, why: 'Payment failed' };
  if (s.p === 'meta' && worldEffect(state, 'paidMetaSpendMult') === 0) return { ok: false, why: 'Account restricted' };
  if (c?.status !== 'active') return { ok: false, why: 'Campaign off' };
  if (s.status !== 'active') return { ok: false, why: 'Off' };
  if (acct.spendCap != null && acct.lifetime >= acct.spendCap) return { ok: false, why: 'Account spending limit reached' };
  const prob = audienceProblem(state, s);
  if (prob) return { ok: false, why: prob };
  if (PLATFORMS[s.p].kind === 'search' && !s.keywords?.length) return { ok: false, why: 'No keywords' };
  const ads = A.ads.filter((a) => a.adsetId === s.id && a.status === 'active' && (s.p === 'apple' || creativeFor(state, a)?.status === 'approved'));
  if (!ads.length) {
    const inReview = A.ads.some((a) => a.adsetId === s.id && a.status === 'active' && creativeFor(state, a)?.status === 'in_review');
    return { ok: false, why: inReview ? 'In review' : 'No active ads' };
  }
  return { ok: true, ads };
}

// ---------------- Daily simulation ----------------

export function adsDay(state) {
  const A = ensureAds(state);
  deliverOrders(state);
  renewWhitelisting(state);
  processAttribution(state);
  revealReports(state);

  const model = state.company.model;
  const plan = mainPlan(state);
  const date = dateOf(state);
  const priceMonthly = monthlyPrice(plan);
  const noTrialB2c = model === 'b2c' && !(plan.trialDays > 0);
  const baseLanding = hasProduct(state) ? landingConversion(state) * (noTrialB2c ? NO_TRIAL_PURCHASE_FACTOR : 1) : 0;
  // Organic signups yesterday: some get claimed as 1-day view-through conversions by the platforms.
  const orgYesterday = (state.stripe?.subscriptions ?? []).filter((x) => x.startDay === state.day - 1 && !String(x.source).startsWith('ads:')).length;

  for (const p of Object.keys(A.accounts)) {
    const acct = A.accounts[p];
    const P = PLATFORMS[p];
    const sets = A.adsets.filter((s) => s.p === p);
    const live = [];
    for (const s of sets) {
      const ds = deliveryState(state, s);
      s.delivery = ds.ok ? null : ds.why;
      // Learning status updates whether or not it delivers today.
      s.learn.status = learningStatus({ prev: s.learn.status, events: eventsInWindow(A, s, state.day, P.learning), days: state.day - s.learn.start, cfg: P.learning, tracked: acct.pixel });
      if (ds.ok) live.push({ s, ads: ds.ads });
    }
    if (!live.length) continue;
    // New-account daily spending limit and account spending cap scale every ad set down.
    const planned = live.reduce((a, x) => a + x.s.budget, 0);
    let scale = 1;
    if (acct.dailyLimit != null && planned > acct.dailyLimit) scale = acct.dailyLimit / planned;
    if (acct.spendCap != null) scale = Math.min(scale, Math.max(0, (acct.spendCap - acct.lifetime) / planned));
    // World events: rivals bidding on the same audiences/keywords raise costs; pulled-back Meta volume.
    const costMult = worldEffect(state, 'paidCpcMult');
    if (p === 'meta') { const v = worldEffect(state, 'paidMetaSpendMult'); if (v > 0 && v < 1) scale *= v; }
    const rr = reportRate({ platform: p, model, pixel: acct.pixel, capi: acct.capi });
    let spendToday = 0;
    // Account-level audience pools: ad sets on the same audience share frequency, diminishing returns and overlap.
    const pools = new Map();
    for (const { s } of live) {
      const k = s.audience.type;
      const g = pools.get(k) ?? { budget: 0, n: 0, ids: new Set() };
      g.budget += s.budget * scale; g.n++; g.ids.add(s.id);
      pools.set(k, g);
    }
    for (const g of pools.values()) g.imps6 = poolImps(A, g.ids, state.day - 6, state.day - 1);
    const claimedRoots = new Set();

    for (const { s, ads } of live) {
      const budget = s.budget * scale;
      const isLeadObj = p === 'linkedin' && s.optimization === 'lead';
      const landingRate = isLeadObj ? (hasProduct(state) ? P.leadFormRate * Math.sqrt(productFactor(state)) : 0) : baseLanding;
      const status = s.learn.status;
      const perAd = [];
      if (P.kind === 'auction') {
        const res = auctionDay({
          platform: p, model, date, budget, audience: { type: s.audience.type, size: audienceSize(state, s) }, placement: s.placement,
          objective: byId(A.campaigns, s.campaignId).objective, optimization: s.optimization, bid: s.bid, status,
          imps6: pools.get(s.audience.type).imps6, poolBudget: pools.get(s.audience.type).budget, overlap: pools.get(s.audience.type).n,
          landingRate, priceMonthly, costMult, rand: () => rng(state),
          ads: ads.map((ad) => { const cr = creativeFor(state, ad); return { id: ad.id, q: cr.q ?? 0.3, format: cr.format, lifeImps: entityOf(state, cr).lifeImps ?? 0, newAd: ad.lifeImps < 3000, glitch: cr.glitch, whitelisted: isWhitelisted(state, cr), tier: cr.tier }; }),
        });
        s.lastFreq7 = res.freq7;
        s.lastReach7 = res.reach7;
        for (const r of res.ads) perAd.push({ ad: ads.find((a) => a.id === r.id), ...r });
      } else {
        // Search: one auction per ad group; ads rotate toward the best copy.
        const crs = ads.map((ad) => creativeFor(state, ad));
        const qs = crs.map((c) => c?.q ?? (p === 'apple' ? 0.35 + 0.5 * (state.market?.fit.website.score ?? 0.35) : 0.3));
        const best = Math.max(...qs);
        // One keyword per query across the whole account: roots already bid on by another ad group don't add demand.
        const kws = s.keywords.filter((k) => { const r = keywordRoot(k.text); if (claimedRoots.has(r)) return false; return true; }).map((k) => ({ ...k, volume: keywordMetrics(k.text, model).volume }));
        for (const k of kws) claimedRoots.add(keywordRoot(k.text));
        const res = searchDay({ platform: p, model, date, budget, keywords: kws, q: best, landingRate, status, bid: s.bid, costMult, rand: () => rng(state) });
        s.lastLost = { budget: res.lostToBudget, demand: res.lostToDemand };
        const w = qs.map((q) => Math.pow(q + 0.05, 3));
        const ws = w.reduce((a, b) => a + b, 0);
        ads.forEach((ad, i) => {
          const f = w[i] / ws;
          perAd.push({ ad, spend: res.spend * f, imps: res.imps * f, clicks: res.clicks * f, lpv: res.lpv * f, expConv: res.expConv * f * (0.85 + 0.15 * qs[i] / best) });
        });
      }

      // Hard caps: pacing noise (Meta's ad-set overspend allowance) never overrides the account's daily
      // spending limit or its lifetime spending cap.
      const caps = [];
      if (acct.dailyLimit != null) caps.push(acct.dailyLimit - spendToday);
      if (acct.spendCap != null) caps.push(acct.spendCap - acct.lifetime - spendToday);
      const room = caps.length ? Math.max(0, Math.min(...caps)) : Infinity;
      const planned = perAd.reduce((a, x) => a + x.spend, 0);
      if (planned > room) {
        const f = planned > 0 ? room / planned : 0;
        for (const x of perAd) for (const k of ['spend', 'imps', 'clicks', 'lpv', 'expConv']) x[k] *= f;
      }

      const convMult = s.optimization === 'purchase' ? PURCHASE_OPT.convMult : null;
      for (const x of perAd) {
        if (!x.ad || x.spend <= 0) continue;
        const row = rowFor(A, state.day, x.ad);
        const clicks = sampleCount(state, x.clicks);
        const lpv = Math.min(clicks, sampleCount(state, x.lpv));
        const n = Math.min(lpv || 0, sampleCount(state, x.expConv));
        row.sp = round2(row.sp + x.spend);
        row.im += Math.round(x.imps);
        row.cl += clicks;
        row.lp += lpv;
        spendToday += x.spend;
        x.ad.lifeImps += x.imps;
        const ent = entityOf(state, creativeFor(state, x.ad));
        if (ent) ent.lifeImps = (ent.lifeImps ?? 0) + x.imps;
        if (state.day - x.ad.createdDay < 3) { x.ad.first.im += Math.round(x.imps); x.ad.first.cl += clicks; }
        addVisitors(state, lpv);
        if (n > 0) {
          const got = acquire(state, { source: `ads:${p}`, n, lead: isLeadObj ? true : 'auto', convMult, note: `${P.label} ${isLeadObj ? 'lead gen form' : 'ad'}: ${x.ad.name}` });
          row.tr += got.subs.length + got.leads;
          for (const sub of got.subs) A.attrib[sub.id] = { a: x.ad.id, d: state.day, rr };
          // Reported start events (trial/lead/purchase-without-trial), possibly delayed (iOS SKAN/AEM).
          let reported = 0;
          for (let i = 0; i < n; i++) if (rng(state) < rr) reported++;
          if (reported) queueReport(state, x.ad.id, reported, reported * (noTrialB2c ? plan.price : acct.trialValue || 0), reportDelay(() => rng(state), { model, capi: acct.capi }), 'rt');
        }
      }
      // 1-day view-through: the platform claims some people who converted anyway (organic) after seeing an ad.
      if (acct.pixel && P.kind === 'auction' && orgYesterday > 0 && perAd.length) {
        const vt = sampleCount(state, orgYesterday * (AUDIENCES[s.audience.type]?.vt ?? 0.05) * Math.min(1, budget / 100) / Math.max(1, live.length));
        if (vt) {
          const top = perAd.reduce((a, b) => (b.spend > a.spend ? b : a));
          queueReport(state, top.ad.id, vt, vt * (acct.trialValue || 0), 0, 'rt');
        }
      }
    }

    spendToday = round2(spendToday);
    if (spendToday > 0) {
      acct.unbilled = round2(acct.unbilled + spendToday);
      acct.lifetime = round2(acct.lifetime + spendToday);
      ledgerAdd(state, state.day, `ads:${p}`, 'sp', spendToday);
    }
    const threshold = P.thresholds[acct.thresholdIdx];
    if (acct.unbilled > 0 && (acct.unbilled >= threshold)) billAccount(state, p, { reason: 'threshold' });
    else if (acct.unbilled > 0 && dayOfMonth(state) === 1) billAccount(state, p, { reason: 'monthly' });
  }

  // Creative wear recovers: lifetime impressions decay with a ~30-day half-life.
  const decay = Math.pow(0.5, 1 / WEAR_HALF_LIFE_DAYS);
  for (const c of A.creatives) if (c.lifeImps) c.lifeImps *= decay;

  // Keep a year of daily rows.
  if (state.day % 30 === 0) A.rows = A.rows.filter((r) => r.d >= state.day - 365);
}

function queueReport(state, adId, n, value, delay, field) {
  const A = ensureAds(state);
  if (delay <= 0) return applyReport(A, { d: state.day, a: adId, n, v: value, f: field });
  A.pending.push({ d: state.day, a: adId, n, v: value, f: field, at: state.day + delay });
}
function applyReport(A, x) {
  const r = findRow(A, x.d, x.a);
  if (!r) return;
  r[x.f] += x.n;
  r.rv = round2(r.rv + x.v);
}
function revealReports(state) {
  const A = ensureAds(state);
  if (!A.pending.length) return;
  const keep = [];
  for (const x of A.pending) (x.at <= state.day ? applyReport(A, x) : keep.push(x));
  A.pending = keep;
}

// First payments by ad-acquired subscriptions: true purchases always; reported only inside the 7-day click window.
function processAttribution(state) {
  const A = ensureAds(state);
  const st = state.stripe;
  if (!st) return;
  const y = state.day - 1;
  for (const c of st.charges) {
    if (c.day !== y || c.status === 'failed') continue;
    const e = A.attrib[c.subId];
    if (!e || e.paid) continue;
    e.paid = true;
    const row = findRow(A, e.d, e.a);
    if (!row) continue;
    row.pu += 1;
    if (y - e.d <= ATTRIBUTION_DAYS && rng(state) < e.rr) { row.rpp += 1; row.rv = round2(row.rv + c.amount); }
  }
  if (state.day % 7 === 0) for (const [k, e] of Object.entries(A.attrib)) if (e.paid || state.day - e.d > 45) delete A.attrib[k];
}

// ---------------- Async: creative review (ad review + AI panel) ----------------

export function ensureGrowthReady(state) { ensureAds(state); ensureGrowth(state); }

export function logAds(state, text) { log(state, 'info', text, 'ads'); }

export { FORMATS };
