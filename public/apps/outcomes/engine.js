// Outcomes engine (slice state.apps.outcomes): luck as surface area, plus elite-habit and failure-mode signals.
//
// Research: docs/research/outcomes-success-failure.md, data/outcomes.js. Luck events (viral post, HN front page,
// creator mention, whale inbound, acquisition interest, AI capability tailwinds…) arrive as a Poisson process whose
// rate is the researched base rate × luckRate's surface-area multiplier. Surface area is measured from what the
// founder actually did in the game (posts, launches, conversations, shipped features, outbound, content, audience,
// MRR, growth, live integrations), with log diminishing returns and caps. So hard work makes luck likelier but
// never guarantees it, and a founder who ships nothing and talks to no one gets almost none.
//
// Effects flow through existing systems: visit bursts through the Organic schedule, enterprise leads through the
// CRM inbound queue, unsolicited acquisition offers through Fundraising → Exit, investor intros through network
// investorLeads, demand shifts through core market modifiers (expired here). Events owned elsewhere
// (term sheets pulled, LOIs falling through, key people leaving) are simulated by those apps, not here.

import { ensure, log, notify } from '../../core/state.js';
import { rng, poisson, uid, clamp, money, hash } from '../../core/util.js';
import { setModifier, shippedFeatures, hasProduct } from '../../core/market.js';
import { mrr, activeSubs, ensureStripe, cancel } from '../../core/stripe.js';
import { totalCash } from '../../core/bank.js';
import { audience, recordPublicEvent, ensureNetwork } from '../../core/network.js';
import { LUCK_EVENTS, luckRate, ELITE_BEHAVIORS, FAILURE_MODES } from '../../data/outcomes.js';
import { addInboundLead } from '../sales/crm-api.js';
import { exitFair } from '../fundraising/sim.js';
import { makeOffer } from '../fundraising/exit.js';
import { aiDependence } from '../marketworld/model.js';
import { analyzeCopy } from '../sales/copy.js';
import { killCriteriaWarnings } from '../assistant/planner.js';

const HANDLED = new Set(['viral_post', 'hn_front_page', 'product_hunt_top3', 'creator_mention', 'press_feature', 'whale_inbound', 'acquisition_interest', 'capability_tailwind', 'investor_inbound', 'marketplace_feature', 'category_heat', 'whale_churn', 'payment_reserve', 'clone_after_viral']);
export const EVENTS = LUCK_EVENTS.filter((e) => HANDLED.has(e.id));
const GROWTH_MIN_BASE = 500; // MRR ($) a month ago below which growth rate is not a luck signal [design]
const byId = (id) => LUCK_EVENTS.find((e) => e.id === id);
// Own random stream (seeded once from the game seed), so adding luck doesn't reshuffle every other system's draws.
const L = (state) => { const o = ensureOutcomes(state); o.seed ??= (state.seed ^ 0x5bd1e995) | 0; return o; };

export function ensureOutcomes(state) {
  const o = ensure(state, 'outcomes', () => ({}));
  o.events ??= []; // [{ id, type, day, label, text, mult, rate }]
  o.mods ??= []; // [{ kind, key, until }] market modifiers to reset to 1 when they expire
  o.tailwind ??= null; // { day, until, demand, captured }
  o.firstShipDay ??= null;
  o.firstChargeDay ??= null;
  return o;
}

// ---------------- Surface area (what the founder actually did) ----------------

const since = (state, days) => state.day - days;
const countSince = (list, days, state, dayKey = 'day') => (list ?? []).filter((x) => (x?.[dayKey] ?? -1e9) > since(state, days)).length;

// Quality weights (audit item 9): surface area counts what the audience would actually notice. A post, article
// or email judged generic counts for much less than a specific one, so volume alone buys little luck. Weights are
// [design]: judged quality 0.65+ counts fully, 0.3 or below counts 15%; offline (heuristic) judgments are shrunk
// toward the median first. Items with no judgment at all (legacy saves, tests) count fully.
export const qualityWeight = (q, mock = false) => {
  if (q == null || !Number.isFinite(q)) return 1;
  const v = mock ? 0.5 + (q - 0.5) * 0.6 : q;
  return clamp((v - 0.3) / 0.35, 0, 1) * 0.85 + 0.15;
};
// Cold email: the personalisation tier the engine assigned to each prospect (generic merge fields read as
// automation in 2026), times the sequence copy quality. AI SDR sends count a quarter [design].
// Same rule as sales/engine.js stepQuality, kept local so the Scorecard does not import the sales engine.
const stepQuality = (seq, step, i) => seq.judge?.[hash(`${step.subject}\n${step.body}`)]?.quality ?? analyzeCopy(step, i).score;
const OUTREACH_TIER_WEIGHT = { generic: 0.2, basic: 0.55, researched: 1, warm: 1 };
export function outreachWeight(state, W = 28) {
  const o = state.apps.outreach;
  const contacts = new Map((state.apps.crm?.contacts ?? []).map((c) => [c.id, c]));
  const recent = (o?.enrollments ?? []).filter((e) => (e.enrolledDay ?? -1e9) > since(state, W));
  const ws = recent.map((e) => {
    const t = contacts.get(e.contactId)?.tier;
    const seq = (o.sequences ?? []).find((q) => q.id === e.sequenceId);
    let q = null;
    try { q = seq?.steps?.length ? stepQuality(seq, seq.steps[0], 0) : null; } catch { q = null; }
    return (t ? OUTREACH_TIER_WEIGHT[t] ?? 0.5 : 0.6) * (q == null ? 1 : clamp(0.4 + q, 0.4, 1));
  });
  return ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : 1;
}

export function activity(state) {
  const A = state.apps;
  const O = A.organic ?? {};
  const weeks = (d) => Math.max(1, Math.min(d, state.day + 1) / 7);
  const W = 28;
  const recentW = (list, days, w) => (list ?? []).filter((x) => (x?.day ?? -1e9) > since(state, days)).reduce((a, x) => a + w(x), 0);
  const posts = recentW(O.posts, W, (p) => qualityWeight(p.skill, p.judge?.mock ?? p.mock));
  const community = recentW(O.community?.posts, W, (p) => (p.removed ? 0 : qualityWeight(p.judge?.helpfulness ?? p.helpfulness, p.judge?.mock)));
  const realInterviews = (A.research?.interviews ?? []).filter((i) => i.real && i.status === 'done' && (i.doneDay ?? i.createdDay ?? -1e9) > since(state, W)).length;
  const salesCalls = (A.calls?.meetings ?? []).filter((m) => ['done', 'held'].includes(m.status) && m.day > since(state, W)).length;
  const csCalls = countSince(A.success?.calls, W, state);
  // Onboarding / concierge calls the founder actually held are customer conversations too (Customers → Onboarding).
  const onbCalls = (A.customers?.onboarding ?? []).filter((r) => r.status === 'held' && (r.day ?? -1e9) > since(state, W)).length;
  const days = (A.outreach?.daily ?? []).filter((d) => d.day > since(state, W));
  const outbound = days.reduce((a, d) => a + (d.sent ?? 0), 0) * outreachWeight(state, W) + days.reduce((a, d) => a + (d.aiSent ?? 0), 0) * 0.25
    + recentW(A.outreach?.linkedin?.requests, W, (r) => (r.note ? 0.6 : 0.4));
  const shipped90 = shippedFeatures(state).filter((f) => (f.shippedDay ?? -1e9) > since(state, 90)).length;
  const articles90 = recentW(O.articles, 90, (a) => qualityWeight(a.quality, a.judge?.mock) * ((a.slop ?? 0) > 0.5 ? 0.3 : 1));
  const launchDays = [O.launch?.day, O.ph?.day, ...(ensureNetwork(state).publicEvents ?? []).filter((e) => /launch/.test(e.type)).map((e) => e.day)].filter((d) => d != null && d > since(state, 365));
  const daily = state.metrics?.daily ?? [];
  const now = daily.at(-1)?.mrr ?? mrr(state);
  const prev = daily.find((d) => d.day >= state.day - 30)?.mrr ?? 0;
  const stores = Object.values(A.channels?.stores ?? {}).filter((s) => s.status === 'live').length;
  return {
    publicPostsPerWeek: posts / weeks(W),
    audienceSize: audience(state),
    // Organic keeps every launch with a legit flag (organicEngine recordLaunch). Re-launches with no real change count
    // for nothing; a release announcement of a shipped feature is a small shot (¼) [design, calibration round 2].
    launchesPerYear: Array.isArray(O.launches) && O.launches.length
      ? O.launches.filter((l) => l.legit && l.day > since(state, 365)).reduce((a, l) => a + (l.kind === 'release' ? 0.25 : 1), 0)
      : new Set(launchDays).size,
    customerConversationsPerWeek: (realInterviews + salesCalls + csCalls + onbCalls) / weeks(W),
    shippedFeaturesPerMonth: shipped90 / Math.max(1, Math.min(90, state.day + 1) / 30),
    outboundTouchesPerWeek: outbound / weeks(W),
    contentPiecesPerMonth: articles90 / Math.max(1, Math.min(90, state.day + 1) / 30),
    mrr: now,
    // Growth only counts from a real base: $50 → $100 MRR is not "100% growth" to a journalist or investor (calibration).
    growthRateMonthly: prev >= GROWTH_MIN_BASE ? now / prev - 1 : 0,
    communityAnswersPerWeek: community / weeks(W),
    integrationsLive: stores + Object.keys(A.channels?.partners?.program ?? {}).length,
  };
}

// ---------------- Daily luck ----------------

// Gates: an event that cannot happen to this company right now (no product, no customers…) has rate 0.
function eligible(state, e, act) {
  const product = hasProduct(state);
  const subs = activeSubs(state);
  switch (e.id) {
    case 'viral_post': return act.publicPostsPerWeek > 0 || act.audienceSize >= 500;
    case 'hn_front_page': case 'product_hunt_top3': return product && act.launchesPerYear > 0;
    case 'creator_mention': case 'press_feature': case 'marketplace_feature': return product && (e.id !== 'marketplace_feature' || act.integrationsLive > 0);
    case 'whale_inbound': return product && state.company.model !== 'b2c';
    case 'acquisition_interest': return act.mrr >= (e.minMrr ?? 1000) && state.day >= 180;
    case 'capability_tailwind': return product && !ensureOutcomes(state).tailwind;
    case 'investor_inbound': return product && (act.mrr >= 1000 || act.growthRateMonthly >= 0.15 || act.audienceSize >= 5000);
    case 'category_heat': return state.day >= 60;
    case 'whale_churn': return subs.length >= 3 && topShare(state) >= 0.15;
    case 'payment_reserve': return (ensureStripe(state).charges ?? []).length >= 20;
    case 'clone_after_viral': return ensureOutcomes(state).events.some((x) => ['viral_post', 'hn_front_page', 'product_hunt_top3'].includes(x.type) && state.day - x.day <= 60);
    default: return false;
  }
}

export function eventRate(state, e, act = activity(state)) {
  if (!eligible(state, e, act)) return 0;
  // conditions.aiDependence (data/outcomes.js): a capability jump mostly helps products that run on AI.
  const ai = e.conditions?.aiDependence ? (e.conditions.aiDependence[aiDependence(state)] ?? 1) : 1;
  return luckRate(e, act, { model: state.company.model, path: state.company.path }) * ai;
}

export function surfaceMultiplier(state, e, act = activity(state)) {
  const ai = e.conditions?.aiDependence ? (e.conditions.aiDependence[aiDependence(state)] ?? 1) : 1;
  const base = e.baseRatePerYear * (e.models?.[state.company.model] ?? 1) * (e.paths?.[state.company.path] ?? 1) * ai;
  return base > 0 ? eventRate(state, e, act) / base : 0;
}

export function outcomesDay(state) {
  const o = ensureOutcomes(state);
  if (o.firstShipDay == null && hasProduct(state)) o.firstShipDay = Math.min(...shippedFeatures(state).map((f) => f.shippedDay ?? state.day));
  if (o.firstChargeDay == null && (ensureStripe(state).charges ?? []).some((c) => c.status === 'succeeded' || c.paid)) o.firstChargeDay = state.day;
  expireMods(state, o);
  tailwindDay(state, o);
  const act = activity(state);
  for (const e of EVENTS) {
    const rate = eventRate(state, e, act);
    if (rate <= 0) continue;
    if (poisson(L(state), rate / 365) > 0) fire(state, e, act, rate);
  }
}

// ---------------- Effects ----------------

const range = (state, [lo, hi]) => lo + (hi - lo) * rng(L(state));
const logRange = (state, [lo, hi]) => Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * rng(L(state)));
const topShare = (state) => {
  const subs = activeSubs(state);
  const total = mrr(state);
  if (!subs.length || total <= 0) return 0;
  return Math.max(...subs.map((s) => (s.price ?? 0) * (s.quantity ?? 1) / (s.interval === 'year' ? 12 : 1))) / total;
};
function baselineVisits(state) {
  const days = (state.apps.organic?.daily ?? []).filter((d) => d.d > state.day - 14);
  const total = days.reduce((a, d) => a + Object.values(d.src).reduce((x, y) => x + y, 0), 0);
  return Math.max(20, total / 14);
}
// mult: × landing conversion for this audience; convMult: × trial→paid (low-intent crowds browse, few buy).
function burst(state, source, visits, shares = [0.55, 0.25, 0.12, 0.08], mult = 1, convMult = 1) {
  const O = state.apps.organic;
  if (!O?.schedule) return 0;
  shares.forEach((sh, i) => O.schedule.push({ day: state.day + i, source, visits: visits * sh, mult, ...(convMult !== 1 ? { convMult } : {}) }));
  return Math.round(visits);
}
function modifier(state, kind, key, mult, days) {
  const o = ensureOutcomes(state);
  setModifier(state, kind, key, mult);
  o.mods = o.mods.filter((m) => !(m.kind === kind && m.key === key));
  o.mods.push({ kind, key, until: state.day + Math.round(days) });
}
function expireMods(state, o) {
  for (const m of o.mods) if (m.until <= state.day) setModifier(state, m.kind, m.key, 1);
  o.mods = o.mods.filter((m) => m.until > state.day);
}

function fire(state, e, act, rate) {
  const o = ensureOutcomes(state);
  const mult = surfaceMultiplier(state, e, act);
  const m = e.magnitude ?? {};
  let text = '';
  switch (e.id) {
    case 'viral_post': {
      const visits = burst(state, 'organic:social', baselineVisits(state) * logRange(state, m.reachMultiplier) * 0.5, undefined, m.landingMultByModel?.[state.company.model] ?? 1);
      const gain = Math.round(logRange(state, m.followerGain) * clamp(Math.log10(act.audienceSize + 10) / 3, 0.3, 1.5));
      state.founder.network.x = (state.founder.network.x ?? 0) + gain;
      recordPublicEvent(state, 'viral_post', {});
      text = `A post of yours went viral: about ${visits.toLocaleString()} visits over the next few days and +${gain.toLocaleString()} followers.`;
      break;
    }
    case 'hn_front_page': {
      const visits = burst(state, 'hacker-news', logRange(state, m.visits), [0.7, 0.3], m.landingMult ?? 1, m.paidConvMult ?? 1);
      if (state.apps.organic) state.apps.organic.dr = (state.apps.organic.dr ?? 2) + Math.round(range(state, [1, 4]));
      text = `You hit the Hacker News front page: about ${visits.toLocaleString()} visits in two days, plus backlinks. Expect blunt comments and few paid conversions.`;
      break;
    }
    case 'product_hunt_top3': {
      const visits = burst(state, 'product-hunt', logRange(state, m.visits), [0.6, 0.3, 0.1], m.landingMult ?? 0.7, m.paidConvMult ?? 1);
      text = `A Product Hunt newsletter feature sent about ${visits.toLocaleString()} visits. Lots of browsers, few buyers.`;
      break;
    }
    case 'creator_mention': {
      const days = Math.round(range(state, m.durationDays));
      const visits = burst(state, 'creator', baselineVisits(state) * logRange(state, m.signupsMultiplier) * days * 0.4, Array.from({ length: days }, (_, i) => (days - i) / ((days * (days + 1)) / 2)));
      modifier(state, 'landing', 'luck:creator', range(state, m.longTailLift), 120);
      text = `A creator in your niche mentioned you unprompted: about ${visits.toLocaleString()} visits over ${days} days and a small lasting lift.`;
      break;
    }
    case 'press_feature': {
      const visits = burst(state, 'press', logRange(state, m.visits), [0.6, 0.25, 0.1, 0.05], m.landingMult ?? 1, m.paidConvMult ?? 1);
      recordPublicEvent(state, 'press_coverage', { tier: 'luck' });
      text = `A journalist covered you: about ${visits.toLocaleString()} visits. Investors and enterprise buyers will have seen it.`;
      break;
    }
    case 'whale_inbound': {
      const lead = addInboundLead(state, { name: 'Head of Operations', email: `ops-lead-${uid('w').slice(-5)}@enterprise-prospect.example`, title: 'Head of Operations', company: 'Large inbound prospect', source: 'whale_inbound', note: `Found you via ${act.contentPiecesPerMonth > 0 ? 'your content' : act.integrationsLive ? 'your integration listing' : 'a referral'}; wants a security questionnaire, SSO and custom terms before a pilot. Potential deal ${Math.round(logRange(state, m.acvMultipleOfMedian))}× your typical ACV.` });
      if (!lead) return;
      text = 'A much larger company than your usual customer reached out about a pilot. Big upside, long cycle, and concentration risk if you bend the roadmap for them.';
      break;
    }
    case 'acquisition_interest': {
      const fr = state.apps.fundraising;
      if (!fr?.exit) return;
      const fair = exitFair(state);
      if (!(fair.value > 0)) return;
      const off = makeOffer({ fair: fair.value, ask: fair.value * 1.3, rand: () => rng(L(state)) });
      fr.exit.offers.push({ id: uid('off'), day: state.day, expiresDay: state.day + 30, unsolicited: true, ...off });
      text = `Unsolicited acquisition interest: a ${off.type.toLowerCase()} offered ${money(off.price)} (${money(off.cashAtClose)} cash at close). Most of these never close; see Fundraising → Exit.`;
      break;
    }
    case 'capability_tailwind': {
      o.tailwind = { day: state.day, until: state.day + Math.round(range(state, m.durationMonths) * 30), demand: logRange(state, m.categoryDemandMultiplier), captured: false };
      text = 'A new AI model release just made something in your category much cheaper or newly possible. Founders who ship on it within ~30 days capture most of the demand; after 90 days it is mostly gone.';
      break;
    }
    case 'investor_inbound': {
      const n = ensureNetwork(state);
      const k = Math.round(range(state, m.meetingsOffered));
      for (let i = 0; i < k; i++) n.investorLeads.push({ id: uid('il'), day: state.day, via: 'inbound', name: null, firm: null, warm: true, imported: false, inbound: true });
      text = `${k} investor${k > 1 ? 's' : ''} reached out after seeing your ${act.growthRateMonthly >= 0.1 ? 'growth' : 'public work'}. Inbound interest is not a term sheet.`;
      break;
    }
    case 'marketplace_feature': {
      const visits = burst(state, 'marketplace:featured', baselineVisits(state) * logRange(state, m.installsMultiplier) * 7, [0.3, 0.2, 0.15, 0.1, 0.1, 0.08, 0.07]);
      text = `Your marketplace listing got featured: about ${visits.toLocaleString()} extra visits over a week.`;
      break;
    }
    case 'category_heat': {
      const months = range(state, m.durationMonths);
      modifier(state, 'conversion', 'luck:heat', clamp(range(state, m.demandMultiplier) ** 0.35, 1, 1.3), months * 30);
      state.apps.outcomes.heat = { until: state.day + Math.round(months * 30), investorMult: range(state, m.investorInterestMultiplier) };
      text = `Your category got hot: buyers are curious and investors are asking around for ~${Math.round(months)} months. New competitors will follow.`;
      break;
    }
    case 'whale_churn': {
      const subs = activeSubs(state);
      const big = subs.reduce((a, s) => ((s.price ?? 0) * (s.quantity ?? 1) > (a.price ?? 0) * (a.quantity ?? 1) ? s : a), subs[0]);
      const cause = e.magnitude.causes[Math.floor(rng(L(state)) * e.magnitude.causes.length)];
      cancel(state, big.id, { atPeriodEnd: true, reason: `luck:${cause}` });
      text = `Your biggest customer is leaving at the end of their term (${cause}). It is nobody's fault, which is why concentration is a risk.`;
      break;
    }
    case 'payment_reserve': {
      const st = ensureStripe(state);
      const share = range(state, m.reserveShare);
      const held = Math.round((st.available ?? 0) * share);
      if (held <= 0) return;
      st.available -= held;
      st.pending.push({ amount: held, availableDay: state.day + Math.round(range(state, m.holdDays)), chargeId: 'reserve' });
      text = `Stripe placed a ${Math.round(share * 100)}% rolling reserve on your account after a risk review: ${money(held)} held. Cash you counted on is not there.`;
      break;
    }
    case 'clone_after_viral': {
      modifier(state, 'conversion', 'luck:clones', range(state, m.conversionMultiplier), range(state, m.durationMonths) * 30);
      text = 'Your visibility attracted copycats: a few clones launched with your positioning. Conversion dips while buyers compare.';
      break;
    }
    default: return;
  }
  const rec = { id: uid('luck'), type: e.id, day: state.day, label: e.label ?? e.id, polarity: e.polarity, text, mult: Math.round(mult * 100) / 100, rate: Math.round(rate * 1000) / 1000 };
  o.events.unshift(rec);
  if (o.events.length > 100) o.events.length = 100;
  const why = e.polarity === 'positive' ? ` Your activity made this about ${rec.mult.toFixed(1)}× as likely as for a typical founder.` : '';
  notify(state, text + why, { type: e.polarity === 'positive' ? 'good' : 'bad', app: 'outcomes' });
  log(state, e.polarity === 'positive' ? 'good' : 'bad', `Luck: ${rec.label}`, 'outcomes');
}

// Capability tailwind: capture depends on how fast you ship after the release (latency buckets from the research).
function tailwindDay(state, o) {
  const t = o.tailwind;
  if (!t) return;
  if (!t.captured) {
    const shipped = shippedFeatures(state).find((f) => (f.shippedDay ?? -1) >= t.day);
    if (shipped) {
      const lat = shipped.shippedDay - t.day;
      const cap = byId('capability_tailwind').magnitude.captureByShipLatency;
      const capture = range(state, lat <= 30 ? cap.le30d : lat <= 90 ? cap.le90d : cap.gt90d);
      t.captured = true;
      const lift = 1 + capture * Math.min(1, (t.demand - 1) / 4) * 0.5;
      modifier(state, 'conversion', 'luck:tailwind', lift, t.until - state.day);
      notify(state, `You shipped "${shipped.title ?? 'a feature'}" ${lat} days after the capability shift and captured ${Math.round(capture * 100)}% of the new demand (conversion ×${lift.toFixed(2)} for now).`, { type: capture > 0.3 ? 'good' : 'info', app: 'outcomes' });
    }
  }
  if (state.day >= t.until) o.tailwind = null;
}

// ---------------- Elite habits & failure warnings ----------------

export function signals(state) {
  const o = ensureOutcomes(state);
  const act = activity(state);
  const daily = state.metrics?.daily ?? [];
  const cur = mrr(state);
  const at = (d) => daily.find((x) => x.day >= state.day - d)?.mrr ?? 0;
  const burn = monthlyBurn(state);
  const runway = burn > 0 ? totalCash(state) / burn : Infinity;
  // A release = a day on which something user-visible went live: a shipped feature or a bug fix (ELITE ship_fast:
  // "releases user-visible improvements weekly … fixes reported bugs within days"). Several on one day count once.
  const releaseDays = new Set([...shippedFeatures(state).map((f) => f.shippedDay), ...(state.apps.product?.bugs ?? []).map((b) => b.fixedDay)].filter((d) => d != null && d > state.day - 56));
  const realIv = (state.apps.research?.interviews ?? []).filter((i) => i.real && i.status === 'done').length;
  const subs = activeSubs(state);
  const concierge = (state.apps.customers?.onboarding ?? []).filter((x) => /concierge/.test(x.kind ?? x.mode ?? '')).length;
  const pmf = pmfResponses(state);
  const firstShip = o.firstShipDay ?? (hasProduct(state) ? Math.min(...shippedFeatures(state).map((f) => f.shippedDay ?? state.day)) : null);
  const launched = firstShip != null;
  const daysLive = launched ? state.day - firstShip : 0;

  const habits = [
    habit('customer_contact', act.customerConversationsPerWeek, (v) => v >= (cur >= 5000 ? 3 : 5), (v) => `${v.toFixed(1)} customer conversations a week (last 4 weeks)`),
    habit('ship_fast', releaseDays.size / 8, (v) => v >= 1, (v) => `${v.toFixed(1)} releases a week (last 8 weeks)`),
    habit('many_shots', act.launchesPerYear, (v) => v >= 4, (v) => `${v} public launches in the last year`),
    habit('build_in_public', act.publicPostsPerWeek, (v) => v >= 3, (v) => `${v.toFixed(1)} public posts a week`),
    habit('charge_early', o.firstChargeDay != null && firstShip != null ? o.firstChargeDay - firstShip : null, (v) => v != null && v <= 30, (v) => (v == null ? 'No paid charge yet' : `First charge ${v} days after first ship`)),
    habit('unscalable_concierge', concierge, (v) => v >= Math.min(20, Math.max(3, subs.length)), (v) => `${v} concierge onboardings`),
    habit('pmf_measurement', pmf, (v) => v >= 40, (v) => (v ? `${v} PMF survey responses from activated users` : 'No PMF ("how would you feel if you could no longer use it?") survey of activated users yet. Exit surveys from cancellations do not count.')),
    habit('default_alive', runway, (v) => v >= 12 || (burn <= 0 && cur > 0), (v) => (v === Infinity ? 'Not burning cash' : `${v.toFixed(1)} months of company runway`)),
  ].filter(Boolean);

  const warn = [];
  const fm = (id, cond, detail) => { if (cond) { const f = FAILURE_MODES.find((x) => x.id === id); if (f) warn.push({ id, label: f.label, detail, ends: f.howItEndsInGame }); } };
  fm('no_market_need', launched && daysLive >= 90 && subs.length === 0, 'No paying customers 90+ days after your first ship.');
  fm('no_market_need', !launched && state.day >= 90 && realIv < 5, 'Three months in with almost no real customer conversations.');
  fm('overbuilt_before_validation', shippedFeatures(state).length >= 4 && realIv < 3, `${shippedFeatures(state).length} features shipped on ${realIv} real interviews.`);
  fm('ran_out_of_cash', runway < 6, `About ${runway.toFixed(1)} months of company cash left at this burn.`);
  const new30 = daily.length > 30 ? cur - at(30) : null;
  fm('leaky_bucket', new30 != null && cur > 300 && Math.abs(new30) < cur * 0.02 && (state.apps.customers?.surveys ?? []).filter((x) => x.day > state.day - 30).length >= 2, 'MRR flat for a month while customers keep cancelling: new revenue is only replacing churn.');
  fm('no_distribution', launched && daysLive >= 60 && act.publicPostsPerWeek < 0.5 && act.outboundTouchesPerWeek < 5 && act.contentPiecesPerMonth < 1 && !(state.apps.ads?.campaigns ?? []).some((c) => c.status === 'active'), 'You have a product but no channel that reaches buyers (no posts, outbound, content or ads).');
  fm('founder_burnout', state.founder.energy < 30 || state.founder.hoursPerWeek > 65, `Energy ${Math.round(state.founder.energy)}; planned ${state.founder.hoursPerWeek}h weeks.`);
  fm('walking_dead', daily.length > 365 && cur > 0 && cur < 10000 && Math.abs(cur - at(365)) < Math.max(200, at(365) * 0.15), 'MRR roughly flat for a year: alive, but not going anywhere.');
  fm('platform_dependency', platformShare(state) > 0.5, `${Math.round(platformShare(state) * 100)}% of recent visits come from one platform.`);
  for (const w of killCriteriaWarnings(state)) warn.push(w); // founder's own kill/pivot criteria (You), checked against real metrics
  return { activity: act, habits, warnings: warn, runway, burn };
}

// PMF measurement habit (audit item 9): only a Sean Ellis-style survey of activated users counts. Exit surveys
// fill passively from cancellations and measure why people left, not whether the product is a must-have.
// Reads state.apps.insights.pmf as written by the insights owner: responses as a number or a list of
// { activated } rows (non-activated responses are dilution and are not counted).
export function pmfResponses(state) {
  const pmf = state.apps.insights?.pmf;
  if (!pmf) return 0;
  const r = pmf.responses;
  if (Array.isArray(r)) return r.filter((x) => x && x.activated !== false).length;
  return Math.max(0, Number(pmf.activatedResponses ?? r) || 0);
}

function habit(id, value, ok, fmt) {
  const b = ELITE_BEHAVIORS.find((x) => x.id === id);
  if (!b) return null;
  return { id, label: b.label, met: Boolean(ok(value)), detail: fmt(value), why: b.effect?.mechanic ?? '', examples: b.examples ?? [] };
}

function monthlyBurn(state) {
  const txns = (state.bank?.txns ?? []).filter((t) => t.day > state.day - 30 && !['investment', 'transfer', 'loan', 'owner_contribution'].includes(t.category));
  const net = txns.reduce((a, t) => a + (t.amount ?? 0), 0);
  return Math.max(0, -net);
}

function platformShare(state) {
  const days = (state.apps.organic?.daily ?? []).filter((d) => d.d > state.day - 28);
  const by = {};
  for (const d of days) for (const [k, v] of Object.entries(d.src)) by[k] = (by[k] ?? 0) + v;
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  return total >= 200 ? Math.max(...Object.values(by)) / total : 0;
}
