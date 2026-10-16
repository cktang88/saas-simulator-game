// Channels & partnerships simulation: state slice, attribution, fees, player actions and the daily engine.
// Synchronous and deterministic (core rng). LLM judging happens in the UI (ctx.act) and arrives here as a
// `judged` object { quality 0..1, score, results, mock }.
//
// Numbers: public/data/channels.js (CHANNELS) via ./model.js and ./catalog.js. [design] = game estimate.

import { ensure, notify, log } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { createCustomer, subscribe, activeSubs, mrr, monthlyAmount } from '../../core/stripe.js';
import { mainPlan, syntheticPerson, trialConversion, productFactor, priceFactor, landingConversion, hasProduct, shippedFeatures } from '../../core/market.js';
import { rng, chance, poisson, uid, round2, pick, dayOfMonth, isWeekend, monthIndex } from '../../core/util.js';
import { fitCount } from '../../core/customer-type.js';
import { scheduleEvent, ensureCalendar } from '../../core/calendar.js';
import { newThread, addMessage } from '../../core/mail.js';
import { recordPublicEvent } from '../../core/network.js';
import { addInboundLead } from '../sales/crm-api.js';
import { ledgerAdd, isLeadFlow } from '../growth/acquire.js';
import { ensureOrganic, setReferral } from '../growth/organicEngine.js';
import { productSlice, newFeature } from '../product/store.js';
import { toEffortHours } from '../product/build.js';
import { channelById, STORES, podcasts, creators, conferences, coPartners, partnerProspects, DIRECTORIES } from './catalog.js';
import * as M from './model.js';
import { dueDay } from '../../core/timing.js';

const R = (state) => () => rng(state);

// ---------------------------------------------------------------------------------------------------------
// Channel keys: what the performance table shows and which Stripe/CRM `source` each one writes.
// ---------------------------------------------------------------------------------------------------------

export const KEYS = {
  affiliate: { label: 'Affiliates', source: 'affiliate', ch: 'affiliate_program' },
  referral: { label: 'Customer referrals', source: 'referral', ch: 'customer_referral' },
  partner: { label: 'Resellers & agencies', source: 'partner', ch: 'resellers_var_msp' },
  comarketing: { label: 'Co-marketing swaps', source: 'partner', ch: 'tech_comarketing' },
  webinar: { label: 'Webinars', source: 'webinar', ch: 'webinars' },
  events: { label: 'Conferences (booth/attend)', source: 'events', ch: 'conference_booth' },
  speaking: { label: 'Conference talks', source: 'events', ch: 'conference_speaking' },
  pr: { label: 'PR (DIY pitching)', source: 'pr', ch: 'diy_pr' },
  pr_firm: { label: 'PR agency', source: 'pr', ch: 'pr_firm' },
  sponsor_podcast: { label: 'Podcast sponsorships', source: 'sponsorship', ch: 'podcast_sponsorship' },
  sponsor_youtube: { label: 'YouTube sponsorships', source: 'sponsorship', ch: 'youtube_creator' },
  review_sites: { label: 'Review sites (G2/Capterra)', source: 'review_sites', ch: 'review_sites' },
  free_tools: { label: 'Free tools', source: 'free_tools', ch: 'free_tools' },
  directories: { label: 'Directories & templates', source: 'directories', ch: 'templates_directories' },
  plg: { label: 'PLG loops', source: 'plg', ch: 'plg_collab_invites' },
  ltd: { label: 'Lifetime deal (AppSumo)', source: 'ltd', ch: 'appsumo_ltd' },
  cold_call: { label: 'Cold calling', source: 'cold_call', ch: 'cold_calling' },
  direct_mail: { label: 'Direct mail', source: 'direct_mail', ch: 'direct_mail' },
  ai_search: { label: 'AI search visibility', source: 'ai_search', ch: 'ai_search_optimization' },
};
for (const id of Object.keys(STORES)) KEYS[`mkt:${id}`] = { label: STORES[id].label, source: `marketplace:${id}`, ch: STORES[id].channel };

export const sourceOf = (key) => KEYS[key]?.source ?? key;
export const subKey = (m) => (typeof m === 'string' ? m : m?.key);

// ---------------------------------------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------------------------------------

export function ensureChannels(state) {
  const C = ensure(state, 'channels', () => ({}));
  C.stats ??= {}; // key -> { sp, ld, tr, vis, fees }
  C.daily ??= []; // [{ d, k: { key: { sp, ld, tr } } }]
  C.leadMap ??= {}; // lead email -> key (for CRM-won attribution)
  C.subMap ??= {}; // subId -> { key, affId?, partnerId?, claimed? }
  C.schedule ??= []; // [{ day, key, n, conv, lead?, note }]
  C.payables ??= []; // [{ id, key, payee, amount, dueDay, status, subId?, affId?, fraud? }]
  C.monthlyFees ??= {}; // key -> { vendor, amount, category, note, sinceDay }
  C.affiliates ??= { program: null, brief: null, outreach: null, list: [], pendingJoins: [], recruited: 0 };
  C.referral ??= { rewardPct: 0.2, placements: [], tool: null, launches: [], extraDays: 0, refPaidSeen: 0 };
  C.stores ??= {};
  C.partners ??= { program: {}, list: [], pitched: {} };
  C.comarketing ??= [];
  C.events ??= { dates: {}, list: [] };
  C.pr ??= { campaigns: [], retainer: null, pieces: [] };
  C.sponsors ??= [];
  C.reviews ??= { claimed: false, count: 0, asked: 0, g2Paid: false, ppc: null, pending: [], ppcAccrued: 0 };
  C.tools ??= [];
  C.directories ??= { listings: [], templates: [] };
  C.plg ??= {};
  C.ltd ??= null;
  C.calls ??= { dialer: null, list: null, script: null, blocks: [] };
  C.mailCampaigns ??= [];
  C.aiSearch ??= { prompts: [], mentions: 0, checks: [], pitches: [] };
  C.mail ??= []; // delayed persona emails: [{ day, subject, from, email, body, refId }]
  return C;
}

// ---------------------------------------------------------------------------------------------------------
// Attribution, stats, money
// ---------------------------------------------------------------------------------------------------------

export function bump(state, key, field, n = 1) {
  if (!n) return;
  const C = ensureChannels(state);
  const s = (C.stats[key] ??= { sp: 0, ld: 0, tr: 0, vis: 0, fees: 0 });
  s[field] = round2((s[field] ?? 0) + n);
  let d = C.daily.at(-1);
  if (!d || d.d !== state.day) { d = { d: state.day, k: {} }; C.daily.push(d); if (C.daily.length > 400) C.daily.shift(); }
  const e = (d.k[key] ??= {});
  e[field] = round2((e[field] ?? 0) + n);
}

// Spend money on a channel (bank) with attribution meta so Books/Analytics CAC by channel picks it up.
export function spend(state, key, amount, { counterparty, description, category = 'marketing', method = 'card' } = {}) {
  if (!(amount > 0)) return null;
  const t = post(state, { amount: -round2(amount), counterparty, description, category, method, meta: { source: sourceOf(key), channel: key } });
  bump(state, key, 'sp', amount);
  ledgerAdd(state, state.day, sourceOf(key), 'sp', amount);
  return t;
}

export function setMonthlyFee(state, id, fee) {
  const C = ensureChannels(state);
  if (!fee) { delete C.monthlyFees[id]; return; }
  const prev = C.monthlyFees[id];
  C.monthlyFees[id] = { ...fee, sinceDay: prev?.sinceDay ?? state.day, paidThrough: prev?.paidThrough ?? null };
  if (!prev && fee.amount > 0) {
    spend(state, fee.key, fee.amount, { counterparty: fee.vendor, description: `${fee.note ?? fee.vendor} (first month)`, category: fee.category ?? 'marketing' });
    C.monthlyFees[id].paidThrough = state.day + 30; // the first payment covers 30 days
  }
}

const TITLES = ['VP Operations', 'Head of Finance', 'Director of IT', 'COO', 'Head of RevOps', 'Operations Manager', 'Owner', 'Head of Marketing'];
const CORPS = ['Northwind', 'Bluefin', 'Altamira', 'Keystone', 'Meridian', 'Pinecrest', 'Halcyon', 'Ironbridge', 'Sable', 'Corvid', 'Lumen', 'Granite'];
const SECT = ['Logistics', 'Health', 'Financial', 'Retail', 'Manufacturing', 'Software', 'Insurance', 'Studio', 'Dental', 'Realty'];
function leadPerson(state) {
  const p = syntheticPerson(state);
  if (state.company.model === 'ent' || !p.company) {
    const company = `${pick(state, CORPS)} ${pick(state, SECT)}`;
    const domain = `${company.toLowerCase().replace(/[^a-z]/g, '')}.com`;
    return { name: p.name, email: `${p.name.split(' ')[0].toLowerCase()}.${uid('x').slice(-4)}@${domain}`, title: pick(state, TITLES), company, domain };
  }
  return { ...p, domain: p.email.split('@')[1], title: pick(state, TITLES.slice(5)) };
}

export const LEAD_CLOSE_RATE = 0.2;

// How much the player's product/price make channel signups convert, relative to a neutral setup (1 = neutral).
export function productAdj(state) {
  if (!hasProduct(state)) return 0;
  // Damped: CHANNELS conversion ranges already describe a typical product; fit/price move it ±~40% [design].
  return M.clamp(Math.sqrt(productFactor(state) / 0.7), 0, 1.4) * Math.pow(M.clamp(priceFactor(state), 0.1, 2.5), 0.3);
}

/**
 * Turn n channel signups into Stripe trials/subscriptions or CRM leads.
 * conv: the channel's signup→paid rate (before product adjustment). lead: true forces CRM leads for B2B
 * (meetings booked by calls, mail, events). Returns { trials, leads, paid }.
 */
export function acquireN(state, key, { n, conv = 0.1, lead = 'auto', note = '', meta = {}, discountPct = 0, convIsFinal = false } = {}) {
  const out = { trials: 0, leads: 0, paid: 0, subs: [], emails: [] };
  if (!(n > 0)) return out;
  const C = ensureChannels(state);
  const source = sourceOf(key);
  n = fitCount(state, source, n, R(state), monthIndex(state)); // customer type: does this channel reach your buyers?
  if (!(n > 0)) return out;
  const leadFlow = lead === true ? state.company.model !== 'b2c' : lead === false ? false : isLeadFlow(state);
  if (leadFlow) {
    // lead === true: the volume already is meetings / qualified leads. Otherwise (signups, installs, tool users)
    // only the share that would plausibly buy asks for a demo: qualified lead → closed-won ~20% [design].
    const k = lead === true ? n : M.binomialSample(R(state), n, M.clamp((convIsFinal ? conv : conv * Math.max(0.3, productAdj(state))) / LEAD_CLOSE_RATE, 0, 1));
    bump(state, key, 'ld', n - k);
    for (let i = 0; i < k; i++) {
      const p = leadPerson(state);
      const c = addInboundLead(state, { ...p, source, note: note || `Inbound via ${KEYS[key]?.label ?? key}` });
      if (!c) continue;
      C.leadMap[String(p.email).toLowerCase()] = key;
      out.emails.push(String(p.email).toLowerCase());
      out.leads++;
      ledgerAdd(state, state.day, source, 'ld', 1);
    }
    bump(state, key, 'ld', out.leads);
    bump(state, key, 'tr', out.leads); // CRM leads shown in the trials/leads column
    return out;
  }
  if (!hasProduct(state)) { bump(state, key, 'ld', n); return out; } // people show up, but there is nothing to sign up for
  const plan = mainPlan(state);
  const convEff = convIsFinal ? conv : conv * productAdj(state);
  const tc = trialConversion(state, plan);
  const make = (trial, force) => {
    const p = syntheticPerson(state);
    const c = createCustomer(state, { name: p.name, email: p.email, company: p.company ?? null, source, meta: { channel: key, ...meta } });
    const sub = subscribe(state, c.id, plan, { trial, source, discountPct });
    if (trial && force != null) sub.forceConvert = force;
    C.subMap[sub.id] = Object.keys(meta).length ? { key, ...meta } : key; // plain key string when no metadata
    ledgerAdd(state, state.day, source, 'tr', 1);
    out.subs.push(sub);
    return sub;
  };
  if (plan.trialDays > 0) {
    const split = M.trialSplit(convEff, tc);
    const k = M.binomialSample(R(state), n, split.trialShare);
    for (let i = 0; i < k; i++) make(true, split.forceConvert);
    out.trials = k;
    bump(state, key, 'tr', k);
  } else {
    const k = M.binomialSample(R(state), n, M.clamp(convEff, 0, 1));
    for (let i = 0; i < k; i++) make(false, null);
    out.paid = k;
    bump(state, key, 'tr', k);
  }
  bump(state, key, 'ld', n);
  return out;
}

// Visitors → signups through the core landing-page conversion (sponsorships, PR spikes, AI search).
export function visitorsToSignups(state, key, visits, { warm = 1, attributedShare = 1 } = {}) {
  const v = poisson(state, visits);
  if (!v) return 0;
  bump(state, key, 'vis', v);
  if (!hasProduct(state)) return 0;
  const signups = M.binomialSample(R(state), v, M.clamp(landingConversion(state) * warm, 0, 0.6));
  if (!signups) return 0;
  const attributed = M.binomialSample(R(state), signups, attributedShare);
  // Signups from landing conversion already passed the website; they convert like core trials (conv final = core).
  const tc = trialConversion(state);
  if (attributed) acquireN(state, key, { n: attributed, conv: tc, convIsFinal: true });
  const rest = signups - attributed;
  if (rest > 0) {
    // Untracked: listeners typed the URL later; they show up as direct traffic in your attribution.
    const plan = mainPlan(state);
    for (let i = 0; i < rest; i++) {
      const p = syntheticPerson(state);
      if (isLeadFlow(state)) {
        addInboundLead(state, { ...leadPerson(state), source: 'inbound', note: 'Typed in the URL directly' });
        continue;
      }
      const c = createCustomer(state, { name: p.name, email: p.email, company: p.company ?? null, source: 'direct', meta: { hiddenChannel: key } });
      subscribe(state, c.id, plan, { trial: plan.trialDays > 0, source: 'direct' });
    }
    bump(state, key, 'untracked', rest);
  }
  return signups;
}

function drainHours(state, hours, label) {
  if (!(hours > 0)) return;
  state.founder.hoursUsed += hours;
  state.founder.timeLog ??= [];
  state.founder.timeLog.push({ day: state.day, hours: round2(hours), label });
}

function mailLater(state, { day, subject, from, email, body, refId }) {
  ensureChannels(state).mail.push({ day, subject, from, email, body, refId });
}
function deliverMail(state) {
  const C = ensureChannels(state);
  const due = C.mail.filter((m) => m.day <= state.day);
  C.mail = C.mail.filter((m) => m.day > state.day);
  for (const m of due) {
    const t = newThread(state, { subject: m.subject, with: { name: m.from, email: m.email }, kind: 'vendor', app: 'channels', refId: m.refId });
    addMessage(state, t.id, { from: 'them', body: m.body });
  }
}

const organicActive = (state) => state.apps.organic?.lastK != null;
const hasFunding = (state) => state.bank.txns.some((t) => t.category === 'investment');
const fitOf = (state, key) => channelById(KEYS[key]?.ch)?.fit?.[state.company.model] ?? 0.5;
const traction = (state) => M.tractionFactor(mrr(state));

// ---------------------------------------------------------------------------------------------------------
// Affiliates
// ---------------------------------------------------------------------------------------------------------

export function launchAffiliates(state, { tool, rate, months, cookieDays, payoutDelay, terms }) {
  const C = ensureChannels(state);
  const T = M.AFFILIATE_TOOLS[tool];
  if (!T) throw new Error('Pick an affiliate tool.');
  if (!(rate > 0 && rate <= 0.6)) throw new Error('Commission must be between 1% and 60%.');
  const first = !C.affiliates.program;
  const wasActive = Boolean(C.affiliates.program?.active);
  C.affiliates.program = { tool, rate, months, cookieDays, payoutDelay, terms: Boolean(terms), launchedDay: C.affiliates.program?.launchedDay ?? state.day, active: true };
  setMonthlyFee(state, 'aff_tool', { key: 'affiliate', vendor: T.label, amount: T.monthly, category: 'software', note: `${T.label} affiliate software` });
  if (!wasActive) recordPublicEvent(state, 'affiliate_program_launched', { tool, rate, relaunch: !first }); // editing terms of a live program is not news
  if (first) log(state, 'info', `Launched an affiliate program on ${T.label}: ${Math.round(rate * 100)}% for ${months || 'lifetime'} months, ${cookieDays}-day cookie.`, 'channels');
  return C.affiliates.program;
}

export function closeAffiliates(state) {
  const C = ensureChannels(state);
  if (!C.affiliates.program) return;
  C.affiliates.program.active = false;
  setMonthlyFee(state, 'aff_tool', null);
  for (const a of C.affiliates.list) if (a.status === 'active') a.status = 'closed';
}

// Recruit `count` prospects with a written DM (judged). Joins arrive over 3–28 days.
export function recruitAffiliates(state, { count, personalized, judged }) {
  const C = ensureChannels(state);
  const P = C.affiliates.program;
  if (!P?.active) throw new Error('Launch the program first.');
  const attract = M.offerAttractiveness({ rate: P.rate, months: P.months, cookieDays: P.cookieDays });
  const market = M.AFFILIATE_TOOLS[P.tool]?.marketplace;
  let joins = 0;
  for (let i = 0; i < count; i++) {
    const kind = M.pickAffiliateKind(R(state), { termsWritten: P.terms });
    if (chance(state, M.affiliateJoinProb({ quality: judged.quality, personalized, attractiveness: attract, marketplace: market, kind }))) {
      C.affiliates.pendingJoins.push({ day: state.day + 3 + Math.floor(rng(state) * 26), kind });
      joins++;
    }
  }
  C.affiliates.recruited += count;
  C.affiliates.outreach = { ...judged, count, personalized, day: state.day };
  return joins;
}

const AFF_FIRST = ['Maya', 'Jon', 'Ines', 'Theo', 'Rae', 'Omar', 'Lena', 'Kofi', 'Ari', 'Bea', 'Cal', 'Dev', 'Eli', 'Fay', 'Gus', 'Hal'];
function joinAffiliate(state, kind) {
  const C = ensureChannels(state);
  const pot = M.affiliatePotency(R(state), { briefQuality: C.affiliates.brief?.quality ?? 0.25, kind });
  const k = M.AFFILIATE_KINDS[kind];
  const a = {
    id: uid('aff'), name: `${pick(state, AFF_FIRST)} (${k.label})`, kind, kindFraud: k.fraud ?? null, joinedDay: state.day, status: 'active',
    producer: pot.producer, monthly: pot.monthly, startDay: state.day + 7 + Math.floor(rng(state) * 45), clicks: 0, signups: 0, customers: 0, earned: 0, paid: 0, activated: false,
  };
  C.affiliates.list.push(a);
  return a;
}

export function activateAffiliate(state, affId) {
  const C = ensureChannels(state);
  const i = C.affiliates.list.findIndex((a) => a.id === affId);
  if (i < 0) throw new Error('Unknown affiliate.');
  if (C.affiliates.list[i].activated) throw new Error('Already activated.');
  C.affiliates.list[i] = M.activateBoost(C.affiliates.list[i], R(state));
  C.affiliates.list[i].activated = true;
  C.affiliates.list[i].startDay = Math.min(C.affiliates.list[i].startDay, state.day + 7);
}

// Review recent conversions for fraud (brand bidding, coupon sites, self-referral) [design: 75% catch per
// fraudulent affiliate when terms forbid it, 45% without written terms].
export function reviewAffiliateFraud(state) {
  const C = ensureChannels(state);
  const pCatch = C.affiliates.program?.terms ? 0.75 : 0.45;
  const caught = [];
  for (const a of C.affiliates.list) {
    if (a.status !== 'active' || !a.kindFraud || !(a.signups > 0 || a.claims > 0)) continue;
    if (chance(state, pCatch)) {
      a.status = 'banned';
      caught.push(a);
      for (const p of C.payables) if (p.affId === a.id && p.status === 'pending') p.status = 'blocked';
    }
  }
  C.affiliates.lastReviewDay = state.day;
  return caught;
}

function affiliatesDay(state) {
  const C = ensureChannels(state);
  const A = C.affiliates;
  const P = A.program;
  if (!P) return;
  const due = A.pendingJoins.filter((j) => j.day <= state.day);
  A.pendingJoins = A.pendingJoins.filter((j) => j.day > state.day);
  if (P.active) for (const j of due) joinAffiliate(state, j.kind);
  if (!P.active) return;
  const credit = M.cookieCredit(P.cookieDays);
  const ch = channelById('affiliate_program');
  const conv = M.channelConversion(ch.steadyStateMonthly.conversionToPaid, C.affiliates.brief?.quality ?? 0.4);
  const todays = (state.stripe?.subscriptions ?? []).filter((s) => s.startDay === state.day && !C.subMap[s.id] && s.source !== 'affiliate');
  for (const a of A.list) {
    if (a.status !== 'active' || !a.producer || state.day < a.startDay) continue;
    const mean = (a.monthly / 30) * M.dayNoise(R(state), 0.5);
    if (a.kindFraud === 'non_incremental') {
      // Coupon sites / brand bidders: they "refer" people who were already buying.
      let k = Math.min(poisson(state, mean * 0.6), todays.length);
      while (k-- > 0) {
        const s = todays.splice(Math.floor(rng(state) * todays.length), 1)[0];
        C.subMap[s.id] = { key: 'affiliate', affId: a.id, claimed: true };
        a.claims = (a.claims ?? 0) + 1;
      }
      continue;
    }
    if (a.kindFraud === 'self_referral') {
      // Fake signups that "pay" one month to trigger recurring commissions.
      const k = poisson(state, mean * 0.4);
      for (let i = 0; i < k; i++) {
        const amt = round2(mainPlan(state).price * P.rate * (mainPlan(state).interval === 'year' ? 1 : 2));
        const caughtByDelay = P.payoutDelay >= 30 && chance(state, 0.7);
        C.payables.push({ id: uid('pay'), key: 'affiliate', payee: a.name, affId: a.id, amount: amt, dueDay: state.day + P.payoutDelay, status: caughtByDelay ? 'blocked' : 'pending', fraud: true });
        a.signups++;
        a.earned += amt;
      }
      continue;
    }
    const n = poisson(state, mean * credit);
    if (!n) continue;
    a.signups += n;
    acquireN(state, 'affiliate', { n, conv: conv * (M.AFFILIATE_KINDS[a.kind]?.convMult ?? 1), meta: { affId: a.id }, note: `Referred by affiliate ${a.name}` });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Customer referral program (shares state.apps.organic.referral with the Organic app's word-of-mouth engine)
// ---------------------------------------------------------------------------------------------------------

export const REFERRAL_TOOLS = { inhouse: { label: 'Build it in-house (Stripe coupons + a share link)', monthly: 0, hours: 8 }, growsurf: { label: 'Referral tool (GrowSurf / Rewardful-style)', monthly: 99, hours: 2 } };

export function configureReferral(state, { enabled, reward, twoSided, cashAmount, rewardPct, placements, tool }) {
  const C = ensureChannels(state);
  const R0 = C.referral;
  const newPlacements = (placements ?? []).filter((p) => !R0.placements.includes(p));
  R0.rewardPct = rewardPct;
  R0.placements = placements ?? [];
  if (tool) R0.tool = tool;
  setReferral(state, { enabled: Boolean(enabled), reward, twoSided: Boolean(twoSided), cashAmount: cashAmount ?? 20 });
  syncReferralTool(state);
  R0.enabledDay ??= enabled ? state.day : null;
  return newPlacements;
}
// The referral tool is billed while the shared program is on (from Channels or Organic): switching it off cancels
// the subscription, switching back on resubscribes. Re-saving an unchanged live program keeps the existing billing.
export function syncReferralTool(state) {
  const R0 = ensureChannels(state).referral;
  const T = REFERRAL_TOOLS[R0.tool];
  setMonthlyFee(state, 'ref_tool', ensureOrganic(state).referral.enabled && T?.monthly ? { key: 'referral', vendor: 'Referral software', amount: T.monthly, category: 'software', note: 'Referral program software' } : null);
}
// Founder hours to wire each ask placement into the product [design].
export const PLACEMENT_HOURS = { aha: 4, transactional: 1, onboarding: 2, renewal: 2, settings: 0.5 };

export function referralParticipation(state) {
  const O = ensureOrganic(state);
  const C = ensureChannels(state);
  if (!O.referral.enabled) return 0;
  return M.referralParticipation({ model: state.company.model, reward: O.referral.reward, rewardPct: C.referral.rewardPct, twoSided: O.referral.twoSided, placements: C.referral.placements, productFactor: productFactor(state) });
}

// One-off email to existing customers announcing the program (judged): a two-week burst of invites.
export function launchReferralEmail(state, judged) {
  const C = ensureChannels(state);
  const O = ensureOrganic(state);
  if (!O.referral.enabled) throw new Error('Turn the program on first.');
  if (C.referral.launches.some((l) => state.day - l.day < 60)) throw new Error('You emailed customers about it in the last 60 days. Again so soon reads as spam.');
  const active = activeSubs(state).length;
  const part = referralParticipation(state) * (0.8 + 0.8 * judged.quality);
  const expected = M.referralSignupsPerMonth(active, part) * 0.9;
  for (let d = 1; d <= 14; d++) C.schedule.push({ day: state.day + d, key: 'referral', n: expected * (d <= 3 ? 0.16 : 0.034), conv: 0.3 * M.REFERRAL_FUNNEL.referredConvMult });
  C.referral.launches.push({ day: state.day, quality: judged.quality, score: judged.score, expected: round2(expected), active });
  return expected;
}

function referralDay(state) {
  const C = ensureChannels(state);
  const O = state.apps.organic;
  if (!O?.referral?.enabled) return;
  const active = activeSubs(state).length;
  // If the Organic app's word-of-mouth engine is running it already produces baseline referral signups; we add
  // only the uplift from ask placements beyond its program boost. Otherwise we simulate the program ourselves.
  const part = referralParticipation(state);
  const monthly = M.referralSignupsPerMonth(active, part);
  const daily = organicActive(state) ? Math.max(0, monthly - M.referralSignupsPerMonth(active, M.referralParticipation({ model: state.company.model, reward: O.referral.reward, rewardPct: 0.2, twoSided: O.referral.twoSided, placements: ['transactional'], productFactor: productFactor(state) }))) / 30 : monthly / 30;
  const n = poisson(state, daily);
  if (n) acquireN(state, 'referral', { n, conv: 0.3 * M.REFERRAL_FUNNEL.referredConvMult });
  // Rewards for referred customers who started paying today (credits/free months extend billing periods,
  // like a Stripe customer-balance credit; cash is paid out here for every referred payer, including the ones the
  // Organic word-of-mouth engine produced).
  const newRef = (state.stripe?.events ?? []).filter((e) => e.day === state.day && e.type === 'new' && e.source === 'referral');
  if (!newRef.length) return;
  const subs = state.stripe.subscriptions;
  const others = activeSubs(state).filter((s) => s.source !== 'referral');
  for (const e of newRef) {
    const sub = subs.find((s) => s.id === e.subId);
    if (!sub) continue;
    const mth = monthlyAmount(sub);
    if (O.referral.reward === 'cash') {
      spend(state, 'referral', (O.referral.cashAmount ?? 20) * (O.referral.twoSided ? 2 : 1), { counterparty: 'Referral payouts', description: 'Cash referral reward', method: 'ach' });
      continue;
    }
    const value = O.referral.reward === 'free_month' ? mth : C.referral.rewardPct * mth * 12;
    const days = Math.round(Math.min(365, value / Math.max(0.01, mth / 30)));
    if (O.referral.twoSided) sub.currentPeriodEnd += days; // referee's credit
    const referrer = others.length ? others[Math.floor(rng(state) * others.length)] : null;
    if (referrer) referrer.currentPeriodEnd += days;
    bump(state, 'referral', 'credits', round2(value * (O.referral.twoSided ? 2 : 1)));
  }
}

// ---------------------------------------------------------------------------------------------------------
// Marketplaces & app stores
// ---------------------------------------------------------------------------------------------------------

export function storeState(state, id) {
  const C = ensureChannels(state);
  return (C.stores[id] ??= { status: 'none', featureId: null, listing: null, submissions: 0, installs: 0, reviews: 0, lifetimeRev: 0, feeAccrued: 0, liveDay: null, activeInstalls: 0 });
}

// Engineering effort goes into the Product build queue (human-equivalent hours like any feature); listing
// and partner-program paperwork is founder time charged now. Split of CHANNELS.setupHours [design]: 80/20.
export function startStoreBuild(state, id) {
  const st = storeState(state, id);
  const S = STORES[id];
  const ch = channelById(S.channel);
  if (st.status !== 'none') throw new Error('Already started.');
  const slice = productSlice(state);
  const f = newFeature(state);
  const agentHours = Math.round(ch.setupHours * 0.8);
  Object.assign(f, {
    title: `${S.label} integration`, user: state.company.icp || 'Existing users of the platform', problem: `Users of ${S.label.split(' ')[0]} want ${state.company.name} inside the tool they already use.`,
    solution: `Build and package the ${S.label} integration (auth, core actions, billing hooks, review requirements).`, acceptance: ['Passes the platform review checklist', 'Install → first value in under 10 minutes'],
    status: 'queued', agentHours, effortHours: toEffortHours(agentHours), progressHours: 0, channelBuild: id,
    grade: { pass: true, verdict: 'integration', instant: false, scores: null, total: null, issues: [], agentHours, day: state.day, source: 'channels' },
  });
  slice.features.push(f);
  slice.buildQueue.push(f.id);
  st.featureId = f.id;
  st.status = 'building';
  st.startedDay = state.day;
  if (S.registration) spend(state, `mkt:${id}`, S.registration, { counterparty: S.label, description: 'Developer registration fee', category: 'software' });
  return { feature: f, listingHours: Math.round(ch.setupHours * 0.2) };
}

export function storeBuildProgress(state, id) {
  const st = storeState(state, id);
  const f = (state.apps.product?.features ?? []).find((x) => x.id === st.featureId);
  if (!f) return { pct: 0, shipped: false };
  return { pct: f.effortHours ? (f.progressHours ?? 0) / f.effortHours : 0, shipped: f.status === 'shipped', feature: f };
}

export function submitStore(state, id, { sensitiveScopes = false } = {}) {
  const st = storeState(state, id);
  const S = STORES[id];
  if (!storeBuildProgress(state, id).shipped) throw new Error('The integration has not shipped yet. Build it in Product.');
  if (!st.listing) throw new Error('Write the listing first.');
  if (['review', 'live'].includes(st.status)) throw new Error('Already submitted.');
  if (S.reviewFee) spend(state, `mkt:${id}`, S.reviewFee, { counterparty: S.label, description: 'Security review fee', category: 'software' });
  const [a, b] = S.review;
  let days = a + Math.floor(rng(state) * (b - a + 1));
  if (sensitiveScopes && S.sensitiveExtra) days += S.sensitiveExtra[0] + Math.floor(rng(state) * (S.sensitiveExtra[1] - S.sensitiveExtra[0]));
  st.status = 'review';
  st.submissions++;
  st.reviewDay = state.day + days;
  st.sensitive = sensitiveScopes;
  return days;
}

const privacyPolicy = (state) => Boolean(state.apps.legal?.docs?.privacy || state.apps.legal?.docs?.terms || state.apps.legal?.policies);

// Hand-recruit early installs (merchant groups, agencies, your own customers) and ask each for a review.
export function recruitInstalls(state, id, contacts) {
  const st = storeState(state, id);
  if (st.status !== 'live') throw new Error('The listing is not live.');
  const installs = M.binomialSample(R(state), contacts, 0.3);
  const reviews = M.binomialSample(R(state), installs, 0.35);
  st.installs += installs;
  st.reviews += reviews;
  st.handInstalls = (st.handInstalls ?? 0) + installs;
  const S = STORES[id];
  const ch = channelById(S.channel);
  const conv = M.channelConversion(ch.steadyStateMonthly.conversionToPaid, st.listing?.quality ?? 0.4);
  if (installs) acquireN(state, `mkt:${id}`, { n: installs, conv, lead: S.leads ? true : 'auto', note: `Installed from ${S.label}` });
  return { installs, reviews };
}

function storesDay(state) {
  const C = ensureChannels(state);
  for (const [id, st] of Object.entries(C.stores)) {
    const S = STORES[id];
    const ch = channelById(S.channel);
    if (st.status === 'building' && storeBuildProgress(state, id).shipped) {
      st.status = 'built';
      notify(state, `${S.label} integration shipped. Write the listing and submit it for review in Channels.`, { type: 'good', app: 'channels' });
    }
    if (st.status === 'review' && state.day >= st.reviewDay) {
      const q = st.listing?.quality ?? 0.4;
      const pReject = M.clamp(S.reject * (1.5 - q) * (privacyPolicy(state) ? 0.8 : 1.4) * (st.submissions > 1 ? 0.6 : 1), 0.03, 0.85);
      if (chance(state, pReject)) {
        st.status = 'rejected';
        const reasons = ['missing or vague privacy policy', 'install flow errors in the test account', 'requested permissions broader than the feature needs', 'listing screenshots do not match the app', 'support contact not reachable'];
        st.rejectReason = pick(state, reasons);
        notify(state, `${S.label} rejected your submission: ${st.rejectReason}. Fix it and resubmit.`, { type: 'bad', app: 'channels' });
      } else {
        st.status = 'live';
        st.liveDay = state.day;
        recordPublicEvent(state, 'partner_integration_live', { store: id, label: S.label });
        notify(state, `${S.label} approved your listing. Cold start: expect ~0–2 organic installs a week until you have ~10 reviews.`, { type: 'good', app: 'channels' });
      }
    }
    if (st.status !== 'live') continue;
    const age = state.day - st.liveDay;
    const steady = M.steadyMonthly(ch.steadyStateMonthly.leadsOrSignups, { quality: st.listing?.quality ?? 0.4, fit: ch.fit[state.company.model] }) * traction(state);
    const certified = S.certify ? st.installs >= S.certify.installs && age >= S.certify.days : false;
    if (certified && !st.certified) { st.certified = true; notify(state, `${S.label}: you qualified for certification (60 installs, 6 months). Placement improves.`, { type: 'good', app: 'channels' }); }
    if (!st.native && state.day % 30 === 0 && chance(state, 0.01)) { st.native = state.day; notify(state, `${S.label.split(' ')[0]} shipped a native feature that overlaps your app. Installs drop.`, { type: 'bad', app: 'channels' }); }
    const perDay = M.marketplaceInstallsPerDay({ steadyMonthly: steady, ageDays: age, firstResultDay: ch.daysToFirstResult[0], rampMonths: ch.rampMonths, reviews: st.reviews, certified, nativeFeature: Boolean(st.native) });
    const installs = poisson(state, perDay * M.dayNoise(R(state)));
    if (!installs) continue;
    st.installs += installs;
    st.reviews += M.binomialSample(R(state), installs, M.REVIEW_PER_INSTALL);
    const conv = M.channelConversion(ch.steadyStateMonthly.conversionToPaid, st.listing?.quality ?? 0.4);
    acquireN(state, `mkt:${id}`, { n: installs, conv, lead: S.leads ? true : 'auto', note: `Installed from ${S.label}` });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Resellers & agency partners
// ---------------------------------------------------------------------------------------------------------

export const PARTNER_TERMS = {
  reseller: { label: 'Reseller / VAR / MSP', margin: 0.3, setupHours: 12, setupCost: 2000, note: 'Reseller buys at 30% off list and owns billing (margin 20–40%)' },
  agency: { label: 'Agency / consultant referral', margin: 0.2, setupHours: 8, setupCost: 0, note: '20% of first-year revenue as a referral fee, paid monthly' },
};

export function setupPartnerProgram(state, kind, margin) {
  const C = ensureChannels(state);
  const T = PARTNER_TERMS[kind];
  const first = !C.partners.program[kind];
  C.partners.program[kind] = { margin: M.clamp(margin ?? T.margin, 0.05, 0.6), day: C.partners.program[kind]?.day ?? state.day };
  if (first && T.setupCost) spend(state, 'partner', T.setupCost, { counterparty: 'Startup law firm', description: 'Reseller agreement & deal-registration terms', category: 'legal', method: 'ach' });
  return first;
}

export function pitchPartner(state, prospect, judged) {
  const C = ensureChannels(state);
  if (!C.partners.program[prospect.kind]) throw new Error(`Set up your ${PARTNER_TERMS[prospect.kind].label} program terms first.`);
  if (C.partners.pitched[prospect.id]) throw new Error('Already pitched.');
  const p = M.partnerSignProb(judged.quality, prospect.kind) * (0.6 + 0.8 * prospect.fit);
  const signs = chance(state, p);
  const day = state.day + 5 + Math.floor(rng(state) * 16);
  C.partners.pitched[prospect.id] = { day: state.day, signs, decisionDay: day, quality: judged.quality };
  mailLater(state, {
    day, refId: prospect.id, from: `${prospect.name}`, email: `partners@${prospect.name.toLowerCase().replace(/[^a-z]/g, '')}.com`,
    subject: signs ? `Re: partnering with ${state.company.name}` : `Re: ${state.company.name} partner program`,
    body: signs ? `Thanks — the team liked it. Send over the partner agreement and let's set up a training session for our people. No promises on volume until we see a couple of client wins.` : `Appreciate the note. We're committed to our current stack for now and don't have bandwidth to onboard another vendor this quarter.`,
  });
  return { day };
}

function partnersDay(state) {
  const C = ensureChannels(state);
  const prospects = partnerProspects(state);
  for (const [pid, pt] of Object.entries(C.partners.pitched)) {
    if (pt.done || state.day < pt.decisionDay) continue;
    pt.done = true;
    if (!pt.signs) continue;
    const pr = prospects.find((x) => x.id === pid);
    if (!pr) continue;
    C.partners.list.push({ id: uid('prt'), prospectId: pid, name: pr.name, kind: pr.kind, type: pr.type, signedDay: state.day, engagement: 0.5, lastSessionDay: state.day, productive: null, firstDealDay: null, deals: 0, status: 'signed', sessions: 0, fit: pr.fit });
    notify(state, `${pr.name} signed up as a ${PARTNER_TERMS[pr.kind].label} partner. Enable them weekly or they will go quiet.`, { type: 'good', app: 'channels' });
  }
  const isMonday = new Date(Date.parse(state.startDate + 'T12:00:00Z') + state.day * 86400000).getUTCDay() === 1;
  for (const p of C.partners.list) {
    if (p.status === 'dropped') continue;
    if (isMonday) p.engagement = M.clamp(p.engagement - M.PARTNER.decayPerWeek, 0, 1);
    if (p.productive == null && state.day - p.signedDay >= 45) {
      p.productive = M.partnerProductive(R(state), p.engagement);
      p.firstDealDay = p.signedDay + M.partnerFirstDealDay(R(state));
    }
    if (p.engagement < M.PARTNER.stall && p.status !== 'stalled') { p.status = 'stalled'; notify(state, `${p.name} has gone quiet (no enablement for weeks). Most partners stall exactly like this.`, { type: 'warn', app: 'channels' }); }
    if (p.engagement >= M.PARTNER.stall && p.status === 'stalled') p.status = 'signed';
    if (!p.productive || p.status === 'stalled' || state.day < p.firstDealDay) continue;
    const rate = M.lerpRange(M.PARTNER.dealsPerMonth, p.engagement * p.fit) * (p.kind === 'reseller' ? 1 : 1.2);
    const n = poisson(state, rate / 30);
    if (!n) continue;
    if (!p.deals) notify(state, `${p.name} registered their first partner-sourced deal.`, { type: 'good', app: 'channels' });
    p.deals += n;
    p.status = 'producing';
    const margin = C.partners.program[p.kind]?.margin ?? PARTNER_TERMS[p.kind].margin;
    const ch = channelById(p.kind === 'reseller' ? 'resellers_var_msp' : 'agency_consultant_referrals');
    const conv = M.channelConversion(ch.steadyStateMonthly.conversionToPaid, p.engagement);
    const got = acquireN(state, 'partner', { n, conv, lead: state.company.model !== 'b2c' ? (p.kind === 'reseller' || isLeadFlow(state)) : 'auto', meta: { partnerId: p.id }, discountPct: p.kind === 'reseller' ? margin : 0, note: `Partner-sourced deal registered by ${p.name}` });
    for (const email of got.emails) (C.partnerLeads ??= {})[email] = p.id;
  }
}

export function enablePartner(state, partnerId) {
  const C = ensureChannels(state);
  const p = C.partners.list.find((x) => x.id === partnerId);
  if (!p) throw new Error('Unknown partner.');
  p.engagement = M.clamp(p.engagement + M.PARTNER.sessionBoost, 0, 1);
  p.lastSessionDay = state.day;
  p.sessions++;
}

// ---------------------------------------------------------------------------------------------------------
// Co-marketing and webinars
// ---------------------------------------------------------------------------------------------------------

export const COMARKETING_TYPES = {
  webinar: { label: 'Co-hosted webinar', key: 'webinar', prepHours: 8, promoHours: 2 },
  swap: { label: 'Newsletter swap (you feature each other)', key: 'comarketing', prepHours: 3, promoHours: 0 },
  launch: { label: 'Joint integration launch post', key: 'comarketing', prepHours: 5, promoHours: 1 },
};
export const ourAudience = (state) => (state.founder.network.newsletter ?? 0) + (state.founder.network.linkedin ?? 0) * 0.3 + (state.founder.network.x ?? 0) * 0.2 + (state.apps.organic?.followers ?? 0) * 0.2;

export function proposeComarketing(state, { partnerId, type, judged, replyText }) {
  const C = ensureChannels(state);
  const partner = partnerId ? coPartners(state).find((p) => p.id === partnerId) : null;
  if (partnerId && !partner) throw new Error('Unknown partner.');
  if (partner && C.comarketing.some((c) => c.partnerId === partnerId && state.day - c.day < 90)) throw new Error('You pitched them in the last 90 days.');
  const accept = partner ? chance(state, M.comarketingAcceptProb({ quality: judged.quality, ourAudience: ourAudience(state), theirAudience: partner.audience, overlap: partner.overlap })) : true;
  // A sharp, mutually useful pitch gets answered this week; a vague one to a much bigger partner sits [design].
  // judged.quality is 0..1 (channels/judge.js): ±0.8 SD around the median reply time.
  const replyDay = partner ? dueDay(state, 'partner.reply', [{ label: 'pitch quality', pull: (0.5 - (judged.quality ?? 0.5)) * 1.6 }, (partner.audience ?? 0) > 5 * Math.max(1, ourAudience(state)) ? { label: 'they are much bigger', pull: 0.5 } : null]) : state.day;
  const c = { id: uid('cm'), partnerId, partnerName: partner?.name ?? null, type, day: state.day, quality: judged.quality, accept, replyDay, status: partner ? 'pitched' : 'scheduled', eventDay: null, prep: 0, promo: false };
  if (!partner) scheduleComarketing(state, c);
  C.comarketing.unshift(c);
  if (partner) mailLater(state, { day: replyDay, refId: c.id, from: `${partner.contact}, ${partner.name}`, email: `partners@${partner.name.toLowerCase()}.com`, subject: `Re: ${COMARKETING_TYPES[type].label.toLowerCase()} with ${state.company.name}`, body: replyText || (accept ? 'Sounds good — let\'s do it. Can you send a draft outline and a couple of dates in the next 3–4 weeks?' : 'Thanks for thinking of us. Our co-marketing calendar is full for the next couple of quarters, so we\'ll pass for now.') });
  return c;
}

function scheduleComarketing(state, c) {
  c.status = 'scheduled';
  c.eventDay = state.day + (c.type === 'webinar' ? 21 : 14) + Math.floor(rng(state) * 8);
  while (isWeekend(state, c.eventDay)) c.eventDay++;
  if (c.type === 'webinar') {
    try {
      const ev = scheduleEvent(state, { title: `Webinar${c.partnerName ? ` with ${c.partnerName}` : ''}`, kind: 'meeting', app: 'channels', refId: c.id, day: c.eventDay, start: 11 * 60, duration: 75, location: 'Zoom Webinar', allowConflict: true, notes: 'Live webinar: show up or it fails.' });
      c.eventId = ev.id;
    } catch { /* past day can't happen here */ }
  }
}

export function prepComarketing(state, id, what) {
  const c = ensureChannels(state).comarketing.find((x) => x.id === id);
  if (!c || c.status !== 'scheduled') throw new Error('Nothing to prepare.');
  if (what === 'prep') c.prep = 1;
  if (what === 'promo') c.promo = true;
}

function comarketingDay(state) {
  const C = ensureChannels(state);
  for (const c of C.comarketing) {
    if (c.status === 'pitched' && state.day >= c.replyDay) {
      if (c.accept) { scheduleComarketing(state, c); notify(state, `${c.partnerName} said yes to the ${COMARKETING_TYPES[c.type].label.toLowerCase()} on ${new Date(Date.parse(state.startDate) + c.eventDay * 86400000).toISOString().slice(0, 10)}. Prepare and promote it.`, { type: 'good', app: 'channels' }); }
      else c.status = 'declined';
    }
    if (c.status !== 'scheduled' || state.day < c.eventDay) continue;
    const partner = c.partnerId ? coPartners(state).find((p) => p.id === c.partnerId) : null;
    const T = COMARKETING_TYPES[c.type];
    const prepQ = M.clamp(0.35 * c.quality + 0.45 * c.prep + (c.promo ? 0.2 : 0), 0, 1);
    if (c.type === 'webinar') {
      const ev = ensureCalendar(state).events.find((e) => e.id === c.eventId);
      if (ev && ['missed', 'unattended', 'canceled'].includes(ev.status)) { c.status = 'failed'; notify(state, 'You missed your own webinar. Registrants got nothing and the partner is annoyed.', { type: 'bad', app: 'channels' }); continue; }
      const reg = M.webinarRegistrants({ ownList: (state.founder.network.newsletter ?? 0) * (c.promo ? 1 : 0.3), followers: (state.founder.network.linkedin ?? 0) + (state.founder.network.x ?? 0), partnerAudience: partner?.audience ?? 0, overlap: partner?.overlap ?? 0, quality: prepQ });
      const attend = Math.round(reg * M.lerpRange(M.WEBINAR.attend, rng(state)));
      const regToPaid = M.lerpRange(M.WEBINAR.regToPaid, prepQ);
      c.registrants = reg; c.attendees = attend; c.status = 'done';
      ev && (ev.status = 'done');
      // Attendees who sign up: paid = registrants × regToPaid; we create signups among attendees.
      const signups = Math.min(attend, Math.round(attend * 0.35));
      const conv = signups ? M.clamp((reg * regToPaid) / signups, 0, 0.9) : 0;
      if (signups) acquireN(state, 'webinar', { n: signups, conv, note: `Attended your webinar${c.partnerName ? ` with ${c.partnerName}` : ''}` });
      notify(state, `Webinar done: ${reg} registered, ${attend} attended (${Math.round((attend / Math.max(1, reg)) * 100)}%).`, { type: 'info', app: 'channels' });
    } else {
      if (!c.prep) { c.status = 'failed'; notify(state, `You never wrote your side of the ${T.label.toLowerCase()}. ${c.partnerName} pulled out.`, { type: 'bad', app: 'channels' }); continue; }
      const aud = partner?.audience ?? 0;
      const visits = aud * 0.4 * (0.01 + 0.02 * c.quality) * (0.5 + (partner?.overlap ?? 0));
      c.status = 'done';
      for (let d = 0; d < 3; d++) C.schedule.push({ day: state.day + d, key: 'comarketing', visits: visits * M.SPIKE_SHARES[d], warm: 1.3 });
      notify(state, `${T.label} with ${c.partnerName} went out to ~${aud.toLocaleString()} people.`, { type: 'info', app: 'channels' });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Events & conferences
// ---------------------------------------------------------------------------------------------------------

export function conferenceDates(state) {
  const C = ensureChannels(state);
  return conferences(state).map((cf) => {
    let d = C.events.dates[cf.id];
    if (d == null || d < state.day) {
      d = (d == null ? state.day + cf.monthOffset * 30 : d + 365);
      while (isWeekend(state, d)) d++;
      C.events.dates[cf.id] = d;
    }
    return { ...cf, day: d, cfpCloseDay: d - cf.cfpLeadDays };
  });
}

export function bookConference(state, confId, mode, judged = null) {
  const C = ensureChannels(state);
  const cf = conferenceDates(state).find((x) => x.id === confId);
  if (!cf) throw new Error('Unknown event.');
  if (C.events.list.some((e) => e.confId === confId && e.day === cf.day && e.mode === mode)) throw new Error('Already booked.');
  const e = { id: uid('evt'), confId, name: cf.name, mode, day: cf.day, status: 'booked', leads: null, quality: judged?.quality ?? 0.5, prebooked: 0 };
  if (mode === 'speak') {
    if (state.day > cf.cfpCloseDay) throw new Error('The CFP for this edition has closed. Try the next one or a smaller meetup.');
    e.status = 'cfp';
    e.decisionDay = Math.min(cf.day - 14, state.day + 21 + Math.floor(rng(state) * 30));
    e.accepted = chance(state, M.cfpAcceptProb({ quality: judged.quality, size: cf.size }));
  }
  if (mode === 'booth') {
    spend(state, 'events', Math.round(cf.boothAllIn * 0.5), { counterparty: cf.name, description: 'Booth deposit (50%)', method: 'ach' });
    e.balanceDue = Math.round(cf.boothAllIn * 0.5);
  }
  if (mode === 'attend' && cf.ticket) spend(state, 'events', cf.ticket, { counterparty: cf.name, description: 'Conference ticket', category: 'travel' });
  if (mode === 'attend' && cf.travel) spend(state, 'events', cf.travel, { counterparty: 'Airline & hotel', description: `Travel to ${cf.name}`, category: 'travel' });
  if (mode !== 'speak') calendarDays(state, e, cf);
  C.events.list.unshift(e);
  return e;
}

function calendarDays(state, e, cf) {
  const days = cf.size === 'small' ? 1 : 2;
  e.eventIds = [];
  for (let i = 0; i < days; i++) {
    try { e.eventIds.push(scheduleEvent(state, { title: `${cf.name} (${e.mode === 'booth' ? 'booth' : e.mode === 'speak' ? 'talk' : 'attending'})`, kind: 'meeting', app: 'channels', refId: e.id, day: e.day + i, start: 9 * 60, duration: cf.size === 'small' ? 180 : 480, location: cf.name, allowConflict: true }).id); } catch { /* ignore */ }
  }
}

// Book meetings with attendees before the event (the solo-founder playbook) [design: ~0.6 meetings per hour
// of pre-event outreach, ×ICP density].
export function prebookMeetings(state, eventId, hours) {
  const e = ensureChannels(state).events.list.find((x) => x.id === eventId);
  if (!e || !['booked', 'accepted'].includes(e.status)) throw new Error('Nothing to prebook for.');
  const cf = conferences(state).find((c) => c.id === e.confId);
  const n = poisson(state, hours * 0.6 * (cf?.icpDensity ?? 0.5) * 2);
  e.prebooked += n;
  return n;
}

export function followUpEventLeads(state, eventId, { personalized, judged }) {
  const C = ensureChannels(state);
  const e = C.events.list.find((x) => x.id === eventId);
  if (!e?.leads || e.leads.followed) throw new Error('No leads waiting for follow-up.');
  const late = state.day - e.leads.capturedDay;
  const f = M.followUpFactor(late);
  const qualify = (state.company.model === 'ent' ? 0.15 : 0.1) * (0.6 + 0.8 * judged.quality) * (personalized ? 1.3 : 0.8) * f;
  const n = M.binomialSample(R(state), e.leads.real, M.clamp(qualify, 0, 0.6)) + e.prebooked;
  e.leads.followed = { day: state.day, late, qualified: n, personalized };
  const key = e.mode === 'speak' ? 'speaking' : 'events';
  const ch = channelById(KEYS[key].ch);
  acquireN(state, key, { n, conv: M.channelConversion(ch.steadyStateMonthly.conversionToPaid, judged.quality) * 3, lead: true, note: `Met at ${e.name}${late > 2 ? ` (followed up ${late} days later)` : ''}` });
  return { n, late };
}

function eventsDay(state) {
  const C = ensureChannels(state);
  const confs = conferences(state);
  for (const e of C.events.list) {
    const cf = confs.find((c) => c.id === e.confId);
    if (e.status === 'cfp' && state.day >= e.decisionDay) {
      e.status = e.accepted ? 'accepted' : 'rejected';
      notify(state, e.accepted ? `Your talk was accepted at ${e.name}! Book travel and prepare.` : `${e.name} rejected your talk. Most CFPs accept 10–35%; apply widely.`, { type: e.accepted ? 'good' : 'info', app: 'channels' });
      if (e.accepted) { if (cf?.travel) spend(state, 'speaking', cf.travel, { counterparty: 'Airline & hotel', description: `Travel to ${e.name}`, category: 'travel' }); calendarDays(state, e, cf); }
    }
    const lastDay = e.day + (cf?.size === 'small' ? 0 : 1);
    if (['booked', 'accepted'].includes(e.status) && state.day > lastDay) {
      const evs = ensureCalendar(state).events.filter((x) => (e.eventIds ?? []).includes(x.id));
      const missed = evs.length && evs.every((x) => ['missed', 'canceled'].includes(x.status));
      for (const x of evs) if (x.status === 'unattended') x.status = 'done';
      if (e.mode === 'booth' && e.balanceDue) { spend(state, 'events', e.balanceDue, { counterparty: e.name, description: 'Booth balance, build, swag & travel', method: 'ach' }); e.balanceDue = 0; }
      if (missed) { e.status = 'missed'; notify(state, `You never made it to ${e.name}.`, { type: 'bad', app: 'channels' }); continue; }
      e.status = 'done';
      recordPublicEvent(state, 'event_attended', { event: e.name, mode: e.mode });
      let scans = 0;
      if (e.mode === 'booth') scans = M.boothScans(R(state), { attendees: cf?.attendees ?? 1000, quality: e.quality });
      else if (e.mode === 'speak') { scans = Math.round((cf?.attendees ?? 300) * (cf?.size === 'large' ? 0.004 : 0.03) * (0.5 + e.quality)); recordPublicEvent(state, 'conference_talk', { event: e.name }); }
      else scans = poisson(state, 6 * (cf?.icpDensity ?? 0.5));
      const junk = M.lerpRange(M.BOOTH_JUNK, rng(state));
      e.leads = { total: scans, real: Math.round(scans * (1 - junk) * (cf?.icpDensity ?? 0.5) * 1.5), capturedDay: state.day, followed: null };
      notify(state, `${e.name} wrapped: ${scans} contacts captured${e.prebooked ? ` + ${e.prebooked} pre-booked meetings` : ''}. Most trade-show leads never get followed up.`, { type: 'info', app: 'channels' });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// PR
// ---------------------------------------------------------------------------------------------------------

const REPORTERS = ['Sam Okafor', 'Priya Raman', 'Dana Weiss', 'Luis Ortega', 'Hannah Cole', 'Mei Chen', 'Tom Becker', 'Aisha Noor'];

export function launchPitchCampaign(state, { tier, hook, listSize, personalized, judged }) {
  const C = ensureChannels(state);
  const words = judged.words ?? 200;
  const pResp = M.pitchResponseProb({ words, personalized, quality: judged.quality, tier });
  const replies = M.binomialSample(R(state), listSize, pResp);
  const pCov = M.coverageProb({ hook, tier, quality: judged.quality, listSize, hasFunding: hasFunding(state), personalized });
  const coverage = chance(state, pCov);
  const camp = { id: uid('pr'), day: state.day, tier, hook, listSize, personalized, quality: judged.quality, score: judged.score, replies: Math.max(replies, coverage ? 1 : 0), coverage, pResp, pCov, status: 'sent', interviewDeadline: null };
  C.pr.campaigns.unshift(camp);
  const reporter = pick(state, REPORTERS);
  camp.reporter = reporter;
  let storyDay = null;
  for (let i = 0; i < camp.replies; i++) {
    const isStory = coverage && i === 0;
    mailLater(state, {
      day: (x => (isStory ? (storyDay = x) : x))(dueDay(state, 'press.reply', [isStory ? { label: 'wants the story', pull: -0.8 } : null, tier === 'tier1' ? { label: 'tier-1 inbox', pull: 0.3 } : null])), refId: camp.id, from: isStory ? reporter : pick(state, REPORTERS), email: `${isStory ? reporter.split(' ')[0].toLowerCase() : 'newsdesk'}@${tier === 'tier1' ? 'technews.example' : 'tradejournal.example'}`,
      subject: `Re: ${state.company.name}`,
      body: isStory ? `This could work for a piece I'm putting together. Can you do a 30-minute call this week? I'll need a customer I can talk to and any numbers you can share on the record.` : pick(state, ['Thanks, not a fit for my beat right now.', 'Interesting, but we only cover funding rounds above $10M. Keep me posted.', 'Can you send the data behind this? (No promises.)']),
    });
  }
  if (coverage) { camp.interviewOfferDay = storyDay ?? state.day + 1; camp.status = 'awaiting_reply'; } // the interview ask arrives with their email
  return camp;
}

export function doPressInterview(state, campId) {
  const camp = ensureChannels(state).pr.campaigns.find((c) => c.id === campId);
  if (!camp || camp.status !== 'interview') throw new Error('No interview request to answer.');
  camp.status = 'interviewed';
  camp.publishDay = state.day + 3 + Math.floor(rng(state) * 8);
}

function publishPiece(state, key, { tier, outlet }) {
  const C = ensureChannels(state);
  const n = M.coverageSignups(R(state), { tier, fit: 0.8 });
  const piece = { day: state.day, tier, outlet, key, expected: n };
  C.pr.pieces.unshift(piece);
  if (C.pr.pieces.length > 60) C.pr.pieces.length = 60;
  recordPublicEvent(state, 'press_coverage', { tier, outlet });
  for (let d = 0; d < 3; d++) C.schedule.push({ day: state.day + d, key, visits: (n / Math.max(0.005, landingConversion(state) || 0.02)) * M.SPIKE_SHARES[d], warm: 1 });
  addMention(state, tier === 'tier1' ? 3 : 1);
  state.market && (state.market.brand = Math.min(100, (state.market.brand ?? 0) + (tier === 'tier1' ? 4 : 1)));
  notify(state, `Press: ${outlet} covered ${state.company.name}. Spikes last 1–3 days — capture it.`, { type: 'good', app: 'channels' });
  return piece;
}

export const PR_FIRMS = { boutique: { label: 'Boutique PR agency', monthly: 5000, minMonths: 3, placementsPerMonth: 1.2, tier1PerMonth: 0.05 }, startup: { label: 'Startup tech PR firm', monthly: 10000, minMonths: 6, placementsPerMonth: 2, tier1PerMonth: 0.1 } };

export function hirePrFirm(state, firm) {
  const C = ensureChannels(state);
  if (C.pr.retainer?.active) throw new Error('You already have a PR retainer.');
  const F = PR_FIRMS[firm];
  C.pr.retainer = { firm, active: true, startDay: state.day, minEndDay: state.day + F.minMonths * 30, placements: 0 };
  setMonthlyFee(state, 'pr_retainer', { key: 'pr_firm', vendor: F.label, amount: F.monthly, category: 'marketing', note: `${F.label} retainer` });
}
export function cancelPrFirm(state) {
  const C = ensureChannels(state);
  const r = C.pr.retainer;
  if (!r?.active) return;
  if (state.day < r.minEndDay) throw new Error(`Minimum term runs until day ${r.minEndDay}. You can cancel after that.`);
  r.active = false;
  setMonthlyFee(state, 'pr_retainer', null);
}

function prDay(state) {
  const C = ensureChannels(state);
  for (const camp of C.pr.campaigns) {
    if (camp.status === 'awaiting_reply' && state.day >= camp.interviewOfferDay) { camp.status = 'interview'; camp.interviewDeadline = state.day + 5; notify(state, `${camp.reporter} wants an interview for a ${camp.tier === 'tier1' ? 'tier-1' : 'trade'} piece. Do it within 5 days (Channels → PR).`, { type: 'good', app: 'channels' }); }
    if (camp.status === 'interview' && state.day > camp.interviewDeadline) { camp.status = 'story_died'; notify(state, `${camp.reporter} moved on — you didn't take the interview in time.`, { type: 'bad', app: 'channels' }); }
    if (camp.status === 'interviewed' && state.day >= camp.publishDay) { camp.status = 'published'; publishPiece(state, 'pr', { tier: camp.tier, outlet: camp.tier === 'tier1' ? 'A tier-1 tech outlet' : 'A trade publication' }); }
  }
  const r = C.pr.retainer;
  if (r?.active && dayOfMonth(state) === 15) {
    const F = PR_FIRMS[r.firm];
    const n = poisson(state, F.placementsPerMonth * (0.6 + 0.4 * traction(state)));
    for (let i = 0; i < n; i++) { publishPiece(state, 'pr_firm', { tier: 'trade', outlet: 'Trade outlet (via agency)' }); drainHours(state, 1, 'Press interview (agency placement)'); }
    if (chance(state, F.tier1PerMonth * (hasFunding(state) ? 2 : 1))) { publishPiece(state, 'pr_firm', { tier: 'tier1', outlet: 'Tier-1 outlet (via agency)' }); drainHours(state, 1.5, 'Press interview (tier-1)'); }
    r.placements += n;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Sponsorships (podcasts, YouTube)
// ---------------------------------------------------------------------------------------------------------

export function bookSponsor(state, { showId, format, judged }) {
  const C = ensureChannels(state);
  const show = [...podcasts(state), ...creators(state)].find((s) => s.id === showId);
  if (!show) throw new Error('Unknown show.');
  const F = M.SPONSOR_FORMATS[format];
  if (F.kind !== show.kind) throw new Error('That format is not offered by this show.');
  const price = M.sponsorshipPrice({ audience: show.audience, cpm: show.cpm, format });
  const key = show.kind === 'podcast' ? 'sponsor_podcast' : 'sponsor_youtube';
  spend(state, key, price, { counterparty: show.name, description: `${F.label} (${show.audience.toLocaleString()} ${show.kind === 'podcast' ? 'downloads' : 'expected views'})` });
  const lead = F.lead[0] + Math.floor(rng(state) * (F.lead[1] - F.lead[0]));
  const visits = M.sponsorshipVisits({ audience: show.audience, format, fit: show.fit, quality: judged.quality }) * M.dayNoise(R(state), 0.6);
  const b = { id: uid('spn'), showId, name: show.name, kind: show.kind, key, format, price, bookedDay: state.day, publishDay: state.day + lead, totalVisits: visits, quality: judged.quality, tail: F.tail, status: 'booked', signups: 0 };
  C.sponsors.unshift(b);
  return b;
}

function sponsorsDay(state) {
  const C = ensureChannels(state);
  for (const b of C.sponsors) {
    if (state.day < b.publishDay || b.status === 'done') continue;
    if (b.status === 'booked') { b.status = 'live'; notify(state, `Your sponsorship on ${b.name} is live.`, { type: 'info', app: 'channels' }); }
    const d = state.day - b.publishDay;
    if (d > b.tail * 2) { b.status = 'done'; continue; }
    const v = b.totalVisits * M.tailShare(d, b.tail);
    b.signups += visitorsToSignups(state, b.key, v, { warm: 1.3, attributedShare: M.SPONSOR_ATTRIBUTED });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Review sites (G2 / Capterra)
// ---------------------------------------------------------------------------------------------------------

export function askForReviews(state, { incentive }) {
  const C = ensureChannels(state);
  if (!C.reviews.claimed) throw new Error('Claim your G2/Capterra profiles first.');
  const active = activeSubs(state).filter((s) => !C.reviews.askedSubs?.[s.id]);
  if (!active.length) throw new Error('No customers you haven\'t asked yet.');
  C.reviews.askedSubs ??= {};
  for (const s of active) C.reviews.askedSubs[s.id] = state.day;
  const n = M.binomialSample(R(state), active.length, M.reviewAskRate(incentive) * M.clamp(productFactor(state) / 0.7, 0.4, 1.4));
  for (let i = 0; i < n; i++) C.reviews.pending.push({ day: state.day + 2 + Math.floor(rng(state) * 18), incentive });
  C.reviews.asked += active.length;
  return { asked: active.length, expected: n };
}

export function setReviewsPaid(state, { g2Paid, ppc }) {
  const C = ensureChannels(state);
  C.reviews.g2Paid = Boolean(g2Paid);
  setMonthlyFee(state, 'g2', g2Paid ? { key: 'review_sites', vendor: 'G2', amount: 299, category: 'marketing', note: 'G2 Starter profile' } : null);
  C.reviews.ppc = ppc && ppc.bid >= 2 ? { bid: Math.max(2, Math.round(ppc.bid * 4) / 4), cap: Math.max(5, ppc.cap) } : null;
}

function reviewsDay(state) {
  const C = ensureChannels(state);
  const Rv = C.reviews;
  const due = Rv.pending.filter((p) => p.day <= state.day);
  Rv.pending = Rv.pending.filter((p) => p.day > state.day);
  for (const p of due) {
    Rv.count++;
    addMention(state, 0.2);
    if (p.incentive > 0) spend(state, 'review_sites', p.incentive, { counterparty: 'Gift card provider', description: 'Review thank-you gift card' });
  }
  if (!Rv.claimed) return;
  const ch = channelById('review_sites');
  const age = state.day - Rv.claimedDay;
  const steady = M.steadyMonthly(ch.steadyStateMonthly.leadsOrSignups, { quality: M.clamp(Rv.count / 40, 0, 1), fit: ch.fit[state.company.model] }) * traction(state);
  const flow = (steady / 30) * M.rampFactor(age, ch.daysToFirstResult[0], ch.rampMonths) * M.reviewProfileFactor(Rv.count) * (Rv.g2Paid ? 1.3 : 1);
  const n = poisson(state, flow * M.dayNoise(R(state)));
  const conv = M.channelConversion(ch.steadyStateMonthly.conversionToPaid, M.clamp(Rv.count / 30, 0, 1));
  if (n) acquireN(state, 'review_sites', { n, conv, note: 'Found you on G2/Capterra' });
  if (Rv.ppc) {
    const demand = { b2c: 4, smb: 14, ent: 6 }[state.company.model];
    const clicks = poisson(state, M.ppcClicksPerDay({ bid: Rv.ppc.bid, competitiveBid: 20, demandPerDay: demand, dailyCap: Rv.ppc.cap }));
    if (clicks) {
      Rv.ppcAccrued += clicks * Rv.ppc.bid * (0.7 + 0.3 * rng(state)); // second-price auction: pay ≤ bid
      const leads = M.binomialSample(R(state), clicks, M.PPC_CONV * M.reviewProfileFactor(Rv.count) ** 0.5);
      bump(state, 'review_sites', 'vis', clicks);
      if (leads) acquireN(state, 'review_sites', { n: leads, conv, note: 'Capterra PPC click' });
    }
    if (new Date(Date.parse(state.startDate + 'T12:00:00Z') + state.day * 86400000).getUTCDay() === 1 && Rv.ppcAccrued > 0) {
      spend(state, 'review_sites', Rv.ppcAccrued, { counterparty: 'Capterra', description: 'Capterra/GetApp PPC clicks (weekly)', category: 'advertising' });
      Rv.ppcAccrued = 0;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Free tools, directories, templates, PLG loops
// ---------------------------------------------------------------------------------------------------------

export const TOOL_SCOPES = { weekend: { label: 'Weekend tool (~20h)', hours: 20, mult: 0.7 }, solid: { label: 'Solid tool (~40h)', hours: 40, mult: 1 }, ambitious: { label: 'Ambitious tool (~80h)', hours: 80, mult: 1.25 } };

export function createTool(state, { name, idea, scope, usesLlm, judged }) {
  const C = ensureChannels(state);
  const t = { id: uid('tool'), name: name || 'Free tool', idea, scope, usesLlm: Boolean(usesLlm), quality: judged.quality, score: judged.score, hoursDone: 0, hoursNeeded: TOOL_SCOPES[scope].hours, status: 'building', createdDay: state.day, signups: 0 };
  C.tools.unshift(t);
  return t;
}
export function buildTool(state, toolId, hours) {
  const t = ensureChannels(state).tools.find((x) => x.id === toolId);
  if (!t || t.status !== 'building') throw new Error('Nothing to build.');
  t.hoursDone += hours;
  if (t.hoursDone >= t.hoursNeeded - 1e-9) { t.status = 'live'; t.liveDay = state.day; if (t.usesLlm) setMonthlyFee(state, `tool_llm_${t.id}`, { key: 'free_tools', vendor: 'LLM API', amount: 40, category: 'ai_inference', note: `LLM calls for ${t.name}` }); }
  return t;
}

export function submitDirectory(state, dirId, paid) {
  const C = ensureChannels(state);
  const D = DIRECTORIES.find((d) => d.id === dirId);
  if (C.directories.listings.some((l) => l.dirId === dirId)) throw new Error('Already listed there.');
  if (paid && D.paidCost) spend(state, 'directories', D.paidCost, { counterparty: D.label.split('(')[0].trim(), description: 'Featured directory listing' });
  C.directories.listings.push({ dirId, day: state.day, paid: Boolean(paid) });
}
export function publishTemplate(state, title) {
  if (!String(title).trim()) throw new Error('Name the template.');
  ensureChannels(state).directories.templates.push({ title: String(title).slice(0, 80), day: state.day });
}

export const PLG_BUILDS = { invites: { label: 'Collaboration invites / sharing', ch: 'plg_collab_invites', hours: 60 }, watermark: { label: '"Made with" badge on public outputs', ch: 'plg_watermark', hours: 8 } };
export function startPlgBuild(state, kind) {
  const C = ensureChannels(state);
  if (C.plg[kind]) throw new Error('Already started.');
  const B = PLG_BUILDS[kind];
  const slice = productSlice(state);
  const f = newFeature(state);
  const agentHours = B.hours;
  Object.assign(f, { title: B.label, user: state.company.icp || 'Existing users', problem: 'Users want to share their work with people who are not users yet.', solution: B.label, acceptance: ['Invitees can view without signing up', 'Share at the moment of output'], status: 'queued', agentHours, effortHours: toEffortHours(agentHours), progressHours: 0, channelBuild: `plg_${kind}`, grade: { pass: true, verdict: 'growth loop', instant: false, scores: null, total: null, issues: [], agentHours, day: state.day, source: 'channels' } });
  slice.features.push(f);
  slice.buildQueue.push(f.id);
  C.plg[kind] = { featureId: f.id, status: 'building', k: null };
}

function contentDay(state) {
  const C = ensureChannels(state);
  const tc = Math.max(0.02, trialConversion(state));
  // Free tools
  const toolCh = channelById('free_tools');
  for (const t of C.tools) {
    if (t.status !== 'live') continue;
    const steady = M.steadyMonthly(toolCh.steadyStateMonthly.leadsOrSignups, { quality: t.quality, fit: toolCh.fit[state.company.model] }) * TOOL_SCOPES[t.scope].mult * 0.7; // 2026: AI answers satisfy many tool queries
    const n = poisson(state, (steady / 30) * M.rampFactor(state.day - t.liveDay, toolCh.daysToFirstResult[0], toolCh.rampMonths) * M.dayNoise(R(state)));
    if (!n) continue;
    t.signups += n;
    acquireN(state, 'free_tools', { n, conv: M.channelConversion(toolCh.steadyStateMonthly.conversionToPaid, t.quality), note: `Used your free tool "${t.name}"` });
    if (t.usesLlm && C.monthlyFees[`tool_llm_${t.id}`]) C.monthlyFees[`tool_llm_${t.id}`].amount = Math.min(500, 20 + t.signups * 0.05);
  }
  // Directories and templates
  const dirCh = channelById('templates_directories');
  let mean = 0;
  for (const l of C.directories.listings) {
    const D = DIRECTORIES.find((d) => d.id === l.dirId);
    const age = state.day - l.day;
    mean += (M.lerpRange(D.monthly, l.paid ? 0.7 : 0.3) * (D[state.company.model] ?? 0.5) / 30) * Math.max(0.25, Math.exp(-age / 120));
  }
  for (const t of C.directories.templates) mean += (4 / 30) * M.rampFactor(state.day - t.day, 7, 4) * dirCh.fit[state.company.model];
  const dn = poisson(state, mean);
  if (dn) acquireN(state, 'directories', { n: dn, conv: M.channelConversion(dirCh.steadyStateMonthly.conversionToPaid, 0.4) });
  // PLG loops (built through the Product queue)
  for (const [kind, p] of Object.entries(C.plg)) {
    const f = (state.apps.product?.features ?? []).find((x) => x.id === p.featureId);
    if (p.status === 'building' && f?.status === 'shipped') { p.status = 'live'; p.liveDay = state.day; p.k = +M.lerpRange(channelById(PLG_BUILDS[kind].ch).steadyStateMonthly.kFactorAdd, rng(state) * channelById(PLG_BUILDS[kind].ch).fit[state.company.model]).toFixed(3); notify(state, `${PLG_BUILDS[kind].label} shipped: adds ~${p.k} to your K-factor.`, { type: 'good', app: 'channels' }); }
    if (p.status !== 'live') continue;
    const active = activeSubs(state).length;
    const ch = channelById(PLG_BUILDS[kind].ch);
    const n = poisson(state, ((active * p.k) / 30 / tc) * M.rampFactor(state.day - p.liveDay, ch.daysToFirstResult[0], ch.rampMonths));
    if (n) acquireN(state, 'plg', { n, conv: tc, convIsFinal: true });
  }
}

// ---------------------------------------------------------------------------------------------------------
// AI search visibility
// ---------------------------------------------------------------------------------------------------------

export function addMention(state, n) {
  const C = ensureChannels(state);
  C.aiSearch.mentions = round2(C.aiSearch.mentions + n);
  if (state.apps.organic) state.apps.organic.citations = round2((state.apps.organic.citations ?? 0) + n);
}

export function pitchListicle(state, judged) {
  const C = ensureChannels(state);
  const ok = chance(state, M.listicleAcceptProb(judged.quality, C.reviews.count));
  const day = state.day + 14 + Math.floor(rng(state) * 31);
  C.aiSearch.pitches.unshift({ day: state.day, accepted: ok, liveDay: ok ? day : null, quality: judged.quality });
  return ok;
}

export function aiVisibility(state) {
  const C = ensureChannels(state);
  const comparison = (state.apps.organic?.articles ?? []).filter((a) => /\bvs\b|alternative/i.test(`${a.title} ${a.query}`)).length;
  return M.aiAnswerShare({ mentions: C.aiSearch.mentions, reviews: C.reviews.count, comparisonPages: comparison });
}

function aiSearchDay(state) {
  const C = ensureChannels(state);
  for (const p of C.aiSearch.pitches) if (p.accepted && p.liveDay === state.day) { addMention(state, 2); notify(state, 'A "best tools" listicle added you. AI answer engines cite these third-party lists.', { type: 'good', app: 'channels' }); }
  // If the Organic app's GEO engine runs, mentions feed its citations; otherwise we turn them into visits here.
  if (organicActive(state)) return;
  const v = 0.04 * Math.pow(Math.max(0, C.aiSearch.mentions), 0.8);
  if (v > 0) visitorsToSignups(state, 'ai_search', v, { warm: 3 });
}

// ---------------------------------------------------------------------------------------------------------
// Lifetime deal
// ---------------------------------------------------------------------------------------------------------

export function applyLtd(state, { deal, price, cap, limits, judged }) {
  const C = ensureChannels(state);
  if (C.ltd && !['rejected', 'ended'].includes(C.ltd.status)) throw new Error('You already have a deal in progress.');
  const accept = chance(state, M.clamp(0.1 + 0.5 * judged.quality, 0.05, 0.6) * (hasProduct(state) ? 1 : 0.1));
  C.ltd = { deal, price, cap, limits: Boolean(limits), quality: judged.quality, appliedDay: state.day, decisionDay: state.day + 14 + Math.floor(rng(state) * 17), accept, status: 'applied', sold: 0, refunded: 0, gross: 0, net: 0, paidOut: 0, users: 0, upgrades: 0, buyers: 0 };
  return C.ltd;
}

function ltdDay(state) {
  const C = ensureChannels(state);
  const L = C.ltd;
  if (!L) return;
  if (L.status === 'applied' && state.day >= L.decisionDay) {
    if (!L.accept) { L.status = 'rejected'; notify(state, 'The deal platform passed on your lifetime deal.', { type: 'info', app: 'channels' }); return; }
    L.status = 'accepted';
    L.launchDay = state.day + 21;
    L.buyers = Math.min(L.cap, M.ltdBuyers({ quality: L.quality, fit: channelById('appsumo_ltd').fit[state.company.model], deal: L.deal }) * (L.price <= 49 ? 1.3 : L.price >= 99 ? 0.7 : 1));
    notify(state, `Lifetime deal accepted. Launch in 3 weeks — prepare onboarding and support macros.`, { type: 'good', app: 'channels' });
  }
  if (L.status === 'accepted' && state.day >= L.launchDay) L.status = 'live';
  if (L.status === 'live') {
    const d = state.day - L.launchDay;
    if (d >= 60) { L.status = 'ended'; notify(state, `Lifetime deal closed: ${L.sold} codes sold, ${L.refunded} refunded. Those users stay forever.`, { type: 'info', app: 'channels' }); }
    else {
      const n = Math.min(L.cap - L.sold, poisson(state, L.buyers * M.ltdDayShare(d)));
      if (n > 0) {
        L.sold += n;
        L.users += n;
        L.gross += n * L.price;
        L.net += n * L.price * M.LTD_DEALS[L.deal].partnerShare;
        bump(state, 'ltd', 'ld', n);
        bump(state, 'ltd', 'tr', n);
        (L.cohorts ??= []).push({ day: state.day, n });
      }
    }
  }
  if (!['live', 'ended'].includes(L.status)) return;
  // 60-day refund window [design 8–15%]
  for (const c of L.cohorts ?? []) {
    if (c.refundDone || state.day - c.day < 30) continue;
    c.refundDone = true;
    const r = M.binomialSample(R(state), c.n, M.lerpRange(M.LTD.refundRate, 1 - L.quality));
    L.refunded += r;
    L.users -= r;
    L.net -= r * L.price * M.LTD_DEALS[L.deal].partnerShare;
  }
  // Support load and compute for users who never pay again.
  const age = state.day - L.launchDay;
  const active = L.users * Math.pow(0.5, Math.max(0, age) / M.LTD.supportHalfLifeDays);
  const isMonday = new Date(Date.parse(state.startDate + 'T12:00:00Z') + state.day * 86400000).getUTCDay() === 1;
  if (isMonday && active > 1) drainHours(state, Math.min(15, (active * M.LTD.supportMinPerUserWeek) / 60), 'Support for lifetime-deal users');
  if (dayOfMonth(state) === 1 && L.users > 0) {
    const ai = shippedFeatures(state).some((f) => f.ai?.enabled) ? M.LTD.aiPerUser * (L.limits ? 0.35 : 1) : 0;
    const cost = round2(active * (M.LTD.hostingPerUser + ai));
    if (cost >= 1) post(state, { amount: -cost, counterparty: ai ? 'AI API + hosting' : 'Hosting', description: `Compute for ~${Math.round(active)} active lifetime-deal users (no recurring revenue)`, category: ai ? 'ai_inference' : 'hosting', method: 'card', meta: { source: 'ltd' } });
    // Platform pays out net revenue monthly (≈ 30–60 days after sale) [design].
    const owed = round2(L.net - L.paidOut);
    if (owed > 0 && state.day - L.launchDay >= 30) {
      post(state, { amount: owed, counterparty: 'AppSumo', description: 'Lifetime deal payout (net of platform share and refunds)', category: 'stripe_payout', method: 'ach', meta: { source: 'ltd', revenue: true } });
      L.paidOut += owed;
    }
    // A few lifetime users later buy a subscription / add-on [design 1–3% over the first months].
    const up = M.binomialSample(R(state), Math.round(active), M.lerpRange(M.LTD.upgradeRate, L.quality) / 6);
    if (up > 0 && hasProduct(state)) { L.upgrades += up; acquireN(state, 'ltd', { n: up, conv: 1, convIsFinal: true, lead: false }); }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Cold calling & direct mail
// ---------------------------------------------------------------------------------------------------------

export const CALL_LISTS = { scraped: { label: 'Free / scraped numbers (mostly switchboards)', quality: 0.3, per100: 0 }, data: { label: 'Verified mobile numbers (Apollo/Cognism-style credits)', quality: 0.75, per100: 60 } };

export function setDialer(state, dialer) {
  const C = ensureChannels(state);
  C.calls.dialer = dialer;
  const D = M.DIALERS[dialer];
  setMonthlyFee(state, 'dialer', D.monthly ? { key: 'cold_call', vendor: D.label.split('(')[0].trim(), amount: D.monthly, category: 'software', note: 'Dialer seat' } : null);
}
export function buyCallList(state, kind, size) {
  const C = ensureChannels(state);
  const L = CALL_LISTS[kind];
  if (L.per100) spend(state, 'cold_call', (size / 100) * L.per100, { counterparty: 'Contact data provider', description: `${size} verified phone numbers`, category: 'software' });
  C.calls.list = { kind, size, left: size, quality: L.quality, day: state.day };
}
export function callBlock(state, hours) {
  const C = ensureChannels(state);
  if (!C.calls.list?.left) throw new Error('Buy or build a call list first.');
  if (!C.calls.script) throw new Error('Write your call script first.');
  const res = M.coldCallBlock(R(state), { hours, dialer: C.calls.dialer ?? 'manual', scriptQuality: C.calls.script.quality, listQuality: C.calls.list.quality });
  res.dials = Math.min(res.dials, C.calls.list.left);
  C.calls.list.left -= res.dials;
  C.calls.blocks.unshift({ day: state.day, hours, ...res });
  if (C.calls.blocks.length > 50) C.calls.blocks.length = 50;
  bump(state, 'cold_call', 'vis', res.dials);
  if (res.meetings) acquireN(state, 'cold_call', { n: res.meetings, conv: 0.2, lead: true, note: 'Meeting booked on a cold call' });
  return res;
}

export function sendDirectMail(state, { piece, count, followUp, judged }) {
  const C = ensureChannels(state);
  const P = M.MAIL_PIECES[piece];
  const cost = count * (P.cost + 0.35); // + addresses/postage handling [design]
  spend(state, 'direct_mail', cost, { counterparty: 'Direct-mail vendor (Lob/Sendoso-style)', description: `${count} × ${P.label}` });
  const rate = M.directMailResponse({ piece, quality: judged.quality, followUp });
  const responses = M.binomialSample(R(state), count, rate);
  const qualified = M.binomialSample(R(state), responses, M.MAIL_QUALIFY);
  const camp = { id: uid('dm'), day: state.day, piece, count, followUp, quality: judged.quality, cost: round2(cost), responses, qualified, arriveDay: state.day + 10 + Math.floor(rng(state) * 20), status: 'in_mail' };
  C.mailCampaigns.unshift(camp);
  return camp;
}

function directMailDay(state) {
  for (const c of ensureChannels(state).mailCampaigns) {
    if (c.status !== 'in_mail' || state.day < c.arriveDay) continue;
    c.status = 'done';
    if (c.qualified) acquireN(state, 'direct_mail', { n: c.qualified, conv: 0.2, lead: true, note: `Responded to your ${M.MAIL_PIECES[c.piece].label.toLowerCase()}` });
    notify(state, `Direct mail: ${c.responses} responses to ${c.count} pieces, ${c.qualified} qualified.`, { type: 'info', app: 'channels' });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Fees, commissions, payouts
// ---------------------------------------------------------------------------------------------------------

function feesDay(state) {
  const C = ensureChannels(state);
  const st = state.stripe;
  if (!st) return;
  const subs = new Map(st.subscriptions.map((s) => [s.id, s]));
  const custs = new Map(st.customers.map((c) => [c.id, c]));
  const P = C.affiliates.program;
  for (const ch of st.charges) {
    if (ch.day !== state.day || ch.status !== 'succeeded') continue;
    const sub = subs.get(ch.subId);
    if (!sub) continue;
    const m = C.subMap[sub.id];
    // Marketplace revenue share
    if (sub.source?.startsWith('marketplace:')) {
      const id = sub.source.slice(12);
      const S = STORES[id];
      const s = C.stores[id];
      if (S && s) {
        const fee = M.revShareFee(S.fee, ch.amount, s.lifetimeRev);
        s.lifetimeRev += ch.amount;
        s.feeAccrued = round2(s.feeAccrued + fee);
      }
    }
    // Affiliate commission while the referred subscription is active and inside the commission duration.
    if (m?.affId && P) {
      const amt = M.commissionOn({ amount: ch.amount, rate: P.rate, months: P.months, paidMonthsBefore: sub.paidMonths ?? 0, interval: sub.interval });
      const aff = C.affiliates.list.find((a) => a.id === m.affId);
      if (amt > 0 && aff && aff.status !== 'banned') {
        C.payables.push({ id: uid('pay'), key: 'affiliate', payee: aff.name, affId: aff.id, subId: sub.id, chargeId: ch.id, amount: round2(amt), dueDay: state.day + (P.payoutDelay ?? 30), status: 'pending' });
        aff.earned = round2(aff.earned + amt);
        if ((sub.paidMonths ?? 0) === 0) aff.customers++;
      }
    }
    // Agency referral fee (first-year revenue) / reseller margin on CRM-closed partner deals.
    const email = String(custs.get(sub.customerId)?.email ?? '').toLowerCase();
    const leadKey = C.leadMap[email];
    if ((m?.partnerId || leadKey === 'partner') && (sub.paidMonths ?? 0) < 12) {
      const partner = C.partners.list.find((p) => p.id === (m?.partnerId ?? C.partnerLeads?.[email]));
      const kind = partner?.kind ?? 'agency';
      if (kind === 'agency' || (kind === 'reseller' && !m)) {
        const pct = C.partners.program[kind]?.margin ?? PARTNER_TERMS[kind].margin;
        C.payables.push({ id: uid('pay'), key: 'partner', payee: partner?.name ?? 'Partner', partnerId: partner?.id, subId: sub.id, chargeId: ch.id, amount: round2(ch.amount * pct), dueDay: state.day + 30, status: 'pending' });
      }
    }
  }
  // Refunds claw back unpaid commissions.
  for (const r of st.refunds) {
    if (r.day !== state.day) continue;
    for (const p of C.payables) if (p.chargeId === r.chargeId && p.status === 'pending') p.status = 'clawed';
  }
}

function payoutsDay(state) {
  const C = ensureChannels(state);
  if (dayOfMonth(state) !== 1) return;
  // Monthly payouts of commissions / partner fees that cleared the payout delay.
  const due = C.payables.filter((p) => p.status === 'pending' && p.dueDay <= state.day);
  const byKey = {};
  for (const p of due) { (byKey[p.key] ??= []).push(p); p.status = 'paid'; p.paidDay = state.day; }
  for (const [key, ps] of Object.entries(byKey)) {
    const total = round2(ps.reduce((a, p) => a + p.amount, 0));
    const payees = new Set(ps.map((p) => p.payee)).size;
    spend(state, key, total, { counterparty: key === 'affiliate' ? `Affiliate payouts (${M.AFFILIATE_TOOLS[C.affiliates.program?.tool]?.label ?? 'tool'})` : 'Partner payouts', description: `${key === 'affiliate' ? 'Affiliate commissions' : 'Partner referral fees'} — ${payees} payee(s)`, method: 'ach' });
    if (key === 'affiliate') for (const p of ps) { const a = C.affiliates.list.find((x) => x.id === p.affId); if (a) a.paid = round2(a.paid + p.amount); }
  }
  if (C.payables.length > 1500) C.payables = C.payables.filter((p) => p.status === 'pending' || state.day - (p.paidDay ?? p.dueDay) < 120);
  // Marketplace revenue share for last month.
  for (const [id, s] of Object.entries(C.stores)) {
    if (s.feeAccrued > 0.5) { spend(state, `mkt:${id}`, s.feeAccrued, { counterparty: STORES[id].label, description: 'Marketplace revenue share (last month)', method: 'ach' }); bump(state, `mkt:${id}`, 'fees', s.feeAccrued); s.feeAccrued = 0; }
  }
  // Recurring tool fees and retainers.
  // The first monthly bill after signup only charges the days the up-front first-month payment did not cover
  // (otherwise a retainer signed on the 28th was billed twice within a week).
  for (const [id, f] of Object.entries(C.monthlyFees)) {
    if (f.sinceDay === state.day || !(f.amount > 0)) continue;
    const covered = f.paidThrough != null ? Math.max(0, Math.min(30, f.paidThrough - state.day)) : 0;
    f.paidThrough = null;
    const amount = round2(f.amount * (1 - covered / 30));
    if (amount > 0) spend(state, f.key, amount, { counterparty: f.vendor, description: `${f.note ?? f.vendor}${covered ? ' (prorated)' : ''}`, category: f.category ?? 'marketing' });
    void id;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Daily entry point
// ---------------------------------------------------------------------------------------------------------

function scheduleDay(state) {
  const C = ensureChannels(state);
  const due = C.schedule.filter((x) => x.day <= state.day);
  C.schedule = C.schedule.filter((x) => x.day > state.day);
  for (const x of due) {
    if (x.visits) visitorsToSignups(state, x.key, x.visits * M.dayNoise(R(state), 0.3), { warm: x.warm ?? 1 });
    if (x.n) { const n = poisson(state, x.n); if (n) acquireN(state, x.key, { n, conv: x.conv ?? 0.1, lead: x.lead ?? 'auto', note: x.note ?? '' }); }
  }
}

// Keep saves small: forget attribution for trials that never converted (they can't be customers or revenue).
function compactChannels(state) {
  const C = ensureChannels(state);
  if (state.day % 30 !== 0 || !state.stripe) return;
  const subs = new Map(state.stripe.subscriptions.map((s) => [s.id, s]));
  for (const [id, m] of Object.entries(C.subMap)) {
    const sub = subs.get(id);
    if (!sub || (sub.status === 'canceled' && sub.cancelReason === 'trial_not_converted' && !m.affId)) delete C.subMap[id];
  }
  const leadEmails = Object.keys(C.leadMap);
  if (leadEmails.length > 3000) for (const e of leadEmails.slice(0, leadEmails.length - 3000)) delete C.leadMap[e];
}

export function channelsDay(state) {
  // Nothing set up yet, unless the referral program was switched on from Organic: its rewards are paid here.
  if (!state.apps.channels && !state.apps.organic?.referral?.enabled) return;
  deliverMail(state);
  scheduleDay(state);
  affiliatesDay(state);
  referralDay(state);
  storesDay(state);
  partnersDay(state);
  comarketingDay(state);
  eventsDay(state);
  prDay(state);
  sponsorsDay(state);
  reviewsDay(state);
  contentDay(state);
  aiSearchDay(state);
  ltdDay(state);
  directMailDay(state);
  feesDay(state);
  payoutsDay(state);
  compactChannels(state);
}

// ---------------------------------------------------------------------------------------------------------
// Performance table
// ---------------------------------------------------------------------------------------------------------

/**
 * Per-channel results over the last `days` (null = all time): spend, leads/signups, trials, customers,
 * revenue, CAC, payback months. Customers are counted from subscriptions we created (subMap), CRM deals won
 * from leads we sent (leadMap by email), and for referrals every subscription with source 'referral'.
 */
export function performance(state, days = null) {
  const C = ensureChannels(state);
  const from = days ? state.day - days + 1 : -1;
  const rows = {};
  const row = (k) => (rows[k] ??= { key: k, label: KEYS[k]?.label ?? k, sp: 0, ld: 0, tr: 0, vis: 0, customers: 0, revenue: 0, mrr: 0, fees: 0, untracked: 0 });
  for (const d of C.daily) {
    if (d.d < from) continue;
    for (const [k, e] of Object.entries(d.k)) { const r = row(k); for (const f of ['sp', 'ld', 'tr', 'vis', 'fees', 'untracked']) r[f] += e[f] ?? 0; }
  }
  const st = state.stripe;
  if (st) {
    const custs = new Map(st.customers.map((c) => [c.id, c]));
    const keyOf = (sub) => subKey(C.subMap[sub.id]) ?? (sub.source === 'referral' ? 'referral' : C.leadMap[String(custs.get(sub.customerId)?.email ?? '').toLowerCase()]);
    const keyBySub = new Map();
    for (const sub of st.subscriptions) {
      if (C.subMap[sub.id]?.claimed) continue;
      const k = keyOf(sub);
      if (!k) continue;
      keyBySub.set(sub.id, k);
      const paid = (sub.paidMonths ?? 0) > 0 || sub.status === 'active' || sub.status === 'past_due' || (sub.status === 'canceled' && sub.cancelReason !== 'trial_not_converted');
      const convDay = sub.trialEndDay ?? sub.startDay;
      if (paid && convDay >= from && sub.cancelReason !== 'trial_not_converted') row(k).customers++;
      if (sub.status === 'active' || sub.status === 'past_due') row(k).mrr += monthlyAmount(sub);
    }
    for (const ch of st.charges) {
      if (ch.day < from || ch.status === 'failed') continue;
      const k = keyBySub.get(ch.subId);
      if (k) row(k).revenue += ch.status === 'refunded' ? 0 : ch.amount;
    }
  }
  if (C.ltd) { const r = row('ltd'); r.revenue += C.ltd.paidOut; r.customers += 0; }
  const out = Object.values(rows).filter((r) => r.sp || r.ld || r.tr || r.customers || r.revenue || r.vis);
  for (const r of out) {
    r.cac = r.customers ? r.sp / r.customers : null;
    const arpa = r.customers && r.mrr ? r.mrr / Math.max(1, r.customers) : null;
    r.payback = r.cac != null && arpa ? r.cac / (arpa * 0.8) : null; // 80% gross margin [design]
  }
  return out.sort((a, b) => b.customers - a.customers || b.sp - a.sp);
}
