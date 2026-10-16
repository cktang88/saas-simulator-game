// Account-based marketing (ABM) and signal-based prospecting: target-account tiers, pre-deal buying-committee maps,
// 1:1 / 1:few / 1:many plays, intent-signal sources the player chooses, pays for and interprets, and the outcomes
// that follow from a HIDDEN truth per account (in market or not, true pain, current initiative, budget month).
//
// Research: docs/research/cold-email-alternatives-2026.md (sections 1 ABM, 2 Signals, "Operator tiers per motion",
// "Simulation hooks"). Vendor numbers there are mostly [unverified]; everything tagged [design] below is a game choice
// inside those ranges, never a measured statistic.
//
// How quality shows up (ARCHITECTURE principle 7):
//  - Accounts are only sometimes in market (45-day windows, more often for high-fit accounts). Replies come mostly from
//    in-market accounts that get a timely, relevant message. The player never sees "in market": they infer it from
//    signals (each source has its own precision, lag and half-life), research and replies.
//  - Signals are noisy: false alarms (the event did not happen), wrong people (visitor ID), and accounts that look
//    active but are not buying. Stacking two independent sources raises precision; acting late lets the window close.
//  - The message is judged against the truth: a referenced signal must be real and recent, the initiative named must
//    be the account's real one (only research or a reply reveals it), the angle must fit the person's role. Referencing
//    a false or stale signal, or a creepy "I saw you on our pricing page", backfires and is logged as a mistake.
//  - Multi-threading before the deal: committee members engaged pre-deal carry into the CRM deal's buying group, so
//    the deal engine's committee coverage (segments.js committeeEffect) rewards it and single-threading costs.
//
// Randomness: a dedicated seeded stream (abm.rs) and hash draws keyed by account and day, so the main rng(state)
// sequence is untouched and the same account has the same hidden truth for every play style.
import { clamp, hash, uid, words, dayOfMonth, monthKey, dateOf } from '../../core/util.js';
import { post, addRecurring } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { spendHours } from '../../core/state.js';
import { committeeFor } from '../../data/buyer-segments.js';
import { getSegment, methodFor, roleLabel } from './segments.js';
import { universe, PLANS as DB_PLANS, FUNDING_LABEL } from './prospector.js';
import { upsertCompany, addContact, addActivity, createMeeting, nextSlot, ensureDeal, contactById, contactName } from './model.js';
import { emitSalesEvent } from './events.js';
import { drawName, claimName, emailSlug } from '../../core/names.js';
import { mainPlan } from '../../core/market.js';

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export const ABM_TIERS = {
  1: { label: 'Tier 1 · 1:1', short: '1:1', target: [5, 10], blurb: 'Bespoke: researched brief, committee map, a personal note per person. About 1.5-3 h per account.' },
  2: { label: 'Tier 2 · 1:few', short: '1:few', target: [20, 50], blurb: 'Clusters that share an angle: one cluster message, light personalization. 20-40 min per account plus 3-4 h per cluster.' },
  3: { label: 'Tier 3 · 1:many', short: '1:many', target: [50, 500], blurb: 'Programmatic: matched-account ads and content keep you in front of them; act when they show intent.' },
};

// Founder hours per action (doc section 1 "Cost", section 2 "Cost") [design within those ranges].
export const HOURS = {
  addAccount: 0.05, researchLight: 0.33, researchDeep: 1.5, findPerson: 0.25, message: 0.15, clusterAsset: 3.5, clusterSend: 0.05,
  verifySignal: 0.1, dismissSignal: 0.02, sourceSetup: 0.5, adsSetup: 1.5,
};

// Signal types. hIn / hOut: daily hazard of the event at an account that is / is not in market [design]; their ratio and
// the in-market base rate set the source's precision (third-party intent ~30-40%, doc s2 [design]). factual: share of
// alerts where the event really happened as reported (job-change tools: ~14% false alarms, doc s2 [unverified]).
// halfLife: days for the signal's value to halve (web/content 3-7 d, job change and funding 2-3 weeks, doc s2 [design]).
// lag: days from the event to the alert (job-change alerts lag a few weeks, G2 reviews cited in doc s2).
export const SIGNAL_TYPES = {
  site_visit: { label: 'Visited your website', hIn: 0.07, hOut: 0.012, factual: 0.5, lag: [0, 1], halfLife: 4, creepy: true, person: true,
    ref: /\b(visit(ed|ing)?\b|on (our|my) (site|website|pricing)|our (pricing|product) page|checking out our|came by our)/i },
  category_surge: { label: 'Category research surge (third-party intent)', hIn: 0.08, hOut: 0.026, factual: 1, lag: [5, 9], halfLife: 10, creepy: true,
    ref: /\b(researching|evaluat(ing|e) (tools|vendors|solutions|options|platforms)|in the market for|in-market|looking (at|into) (tools|solutions|vendors|options|platforms)|intent data)/i },
  g2_research: { label: 'Compared tools in your category on G2', hIn: 0.045, hOut: 0.008, factual: 1, lag: [1, 3], halfLife: 7, creepy: true,
    ref: /\b(g2\b|compar(ed|ing) (tools|vendors|options)|review sites?)/i },
  competitor_review: { label: 'Wrote or engaged with a competitor review', hIn: 0.02, hOut: 0.003, factual: 0.8, lag: [2, 5], halfLife: 10, person: true,
    ref: /\b(review(ed)? of|left a review|your review|[1-5][- ]star|reviewed \w+)/i },
  funding: { label: 'Raised funding', hIn: 0.006, hOut: 0.003, factual: 0.97, lag: [1, 4], halfLife: 21, initiative: 'team_growth',
    ref: /\b(rais(e|ed|ing)\b|funding|series [abc]\b|seed round|the round\b|new round)/i },
  hiring: { label: 'Hiring for a related role', hIn: 0.02, hOut: 0.008, factual: 0.92, lag: [2, 7], halfLife: 14, initiative: 'team_growth',
    ref: /\b(hiring|job post(ing)?|open role|recruit(ing)?|new hires?|growing the team|adding headcount)/i },
  tech_change: { label: 'Changed a tool in their stack', hIn: 0.01, hOut: 0.004, factual: 0.8, lag: [3, 10], halfLife: 14, initiative: 'tool_consolidation',
    ref: /\b(switch(ed|ing)? (to|from)|mov(ed|ing) (to|off)|migrat(ed|ing|ion)|adopt(ed|ing)|rolled out|implement(ed|ing)|new stack)/i },
  content_engagement: { label: 'Engaged with your content', hIn: 0.035, hOut: 0.02, factual: 0.97, lag: [0, 1], halfLife: 5, person: true,
    ref: /\b(your comment|you (liked|commented|shared|reposted)|my (post|article|newsletter)|our (post|webinar|article)|the webinar|your question)/i },
  job_change: { label: 'Past champion started a new job', factual: 0.86, lag: [10, 21], halfLife: 21, person: true, initiative: 'new_leadership',
    ref: /\b(new role|congrat(s|ulations)? on (the|your) (new|move|role)|joined\b|just started|stepping into|new job)/i },
};

// Sources the player subscribes to. Monthly cost in USD; weeklyHours = manual monitoring time [design].
export const SOURCES = {
  visitor_id: { label: 'Website visitor ID', vendor: 'RB2B / Warmly-style', monthly: 149, types: ['site_visit'], level: 'person (US only)',
    note: 'Person-level match ~5-20% of US traffic; the named person is right roughly half the time; company-level only outside the US (GDPR). $149/mo paid start (doc s1, vendor) [unverified].' },
  third_party_intent: { label: 'Third-party category intent', vendor: 'Bombora / 6sense-style', monthly: 1500, types: ['category_surge'], level: 'account',
    note: 'Weekly surge scores; precision ~30-40% [design]; typically a five-figure annual contract, out of reach for most solo founders (doc s1) [design].' },
  g2_intent: { label: 'G2 buyer intent', vendor: 'G2-style', monthly: 800, types: ['g2_research'], level: 'account',
    note: 'Accounts researching your category or comparing vendors on a review site. Price [design]; requires a paid review-site profile.' },
  competitor_reviews: { label: 'Competitor review watch', vendor: 'manual', monthly: 0, weeklyHours: 0.5, types: ['competitor_review'], level: 'person',
    note: 'You skim competitors\' new reviews weekly (about 30 min). Public, rare, often specific. Time only [design].' },
  firmographic: { label: 'Funding, hiring and tech-change triggers', vendor: 'Clay-style', monthly: 185, types: ['funding', 'hiring', 'tech_change'], level: 'account',
    note: 'Clay Launch ~$185/mo (included if your prospect database is already Clay-style). Facts are mostly right, but a raise or a job post does not mean they are buying now.' },
  content_engagement: { label: 'Engagement with your content', vendor: 'manual / Trigify-style', monthly: 0, weeklyHours: 0.75, types: ['content_engagement'], level: 'person',
    note: 'People who like or comment on your posts and webinars. Cheap and noisy: most engagers are not buying (doc s2). Needs content to engage with.' },
  job_change: { label: 'Champion job-change alerts', vendor: 'Sales Navigator alerts', monthly: 100, types: ['job_change'], level: 'person',
    note: 'Tracks people who liked you before (replied, met, bought). When they move, they often bring you in. Alerts lag a few weeks; ~14% false alarms (doc s2) [unverified].' },
};

// What an account is actually working on right now (hidden; research or a reply reveals it) [design].
export const INITIATIVES = {
  team_growth: { label: 'Growing the team fast', re: /\b(grow(ing|th)?|scal(e|ing)|headcount|new hires?|onboard(ing)? (new )?(staff|people|hires|reps))\b/i },
  tool_consolidation: { label: 'Consolidating tools / replacing a system', re: /\b(consolidat\w*|too many tools|replac(e|ing)|rip(ping)? out|sunset\w*|one system|single platform)\b/i },
  replace_spreadsheets: { label: 'Getting off spreadsheets and manual work', re: /\b(spreadsheets?|excel|manual(ly)?|by hand|copy[- ]past\w*|double entry)\b/i },
  compliance_push: { label: 'Compliance or audit push', re: /\b(complian\w*|audit\w*|soc ?2|hipaa|regulat\w*|gdpr)\b/i },
  new_location: { label: 'Opening a new location or market', re: /\b(new (location|office|site|market|region)|second (location|office|site)|expan(d|ding|sion))\b/i },
  cost_cutting: { label: 'Cutting costs this year', re: /\b(cost(s)?|budget cuts?|cut(ting)? spend|sav(e|ing|ings)|efficien\w*|do more with less)\b/i },
  customer_experience: { label: 'Fixing customer experience (response times, reviews, churn)', re: /\b(customer experience|response times?|reviews|churn|retention|nps|complaints)\b/i },
  new_leadership: { label: 'New leader reviewing the stack in their first 90 days', re: /\b(first 90 days|new (ceo|cfo|coo|cto|vp|head|leader|role)|fresh look)\b/i },
};
const INIT_IDS = Object.keys(INITIATIVES);

// Reply odds [design], calibrated so a stellar signal operator gets about 3-5x the positive replies of a mediocre one
// (doc "Operator tiers per motion"): untargeted cold 1-3% reply, strong fresh first-party signal 10-25% (doc s2 game values).
export const ODDS = {
  inMarket: 0.10, outOfMarket: 0.02, maxP: 0.55,
  role: { champion: 1.25, user: 1.0, economic_buyer: 0.8, technical: 0.6, finance: 0.6, security: 0.5, procurement: 0.35, legal: 0.4 },
  roleDefault: 0.55,
  freshLift: 0.4, staleMult: 0.7, falseMult: 0.45, creepyMult: 0.65,
  fatigueFree: 2, fatigueMult: 0.75, burnUnanswered: 5, burnDays: 180, // 6-12 months cooldown (doc s1) [design]
  priorityMult: 1.25, warmMult: 2.4, threadMult: 1.3, trustMult: 0.5, trustDays: 90, awareLift: 0.15,
  meetingGivenPositive: 0.8,
};
export const IN_MARKET = { windowDays: 45, base: 0.03, fitWeight: 0.22, budgetLift: 1.4, boostMult: 2.5 }; // "95:5" style rarity [design]
export const ADS = { cpm: 42, impressionsForFullAwareness: 300 }; // LinkedIn matched-audience CPM $25-60 (doc s3) [unverified]
export const JOB_CHANGE = { dailyHazard: 1 / 1100, boostDays: 90 }; // ~30% of B2B contacts change jobs a year [unverified]; new leaders buy in the first 90 days [design]
const BIG_ACCOUNT = { employees: 150, acv: 25000 }; // single-threading matters on $25k+ / larger buying groups (Gong lift is measured on $50k+) [design]

// ---------------------------------------------------------------------------
// State and randomness
// ---------------------------------------------------------------------------

export function ensureAbm(state) {
  const crm = (state.apps.crm ??= {});
  const a = (crm.abm ??= {});
  a.salt ??= hash(`abm|${state.company?.name ?? ''}|${state.seed}`);
  a.rs ??= parseInt(hash(`abm-rs|${a.salt}`), 36) | 0;
  a.accounts ??= [];
  a.sources ??= {}; // id -> { on, since, recurringId, pruned, prunedStats }
  a.signals ??= [];
  a.touches ??= [];
  a.clusters ??= {}; // name -> { text, assetDay, segId }
  a.ads ??= { monthly: 0, recurringId: null, since: null };
  a.hours ??= 0;
  a.tracked ??= {}; // contactId -> { day } champions watched for job changes
  a.stats ??= {}; // sourceId -> { signals, acted, positives, meetings }
  a.guideSeen ??= false;
  return a;
}

function rand(state) {
  const a = ensureAbm(state);
  let t = (a.rs = (a.rs + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const hu = (salt, ...parts) => (parseInt(hash(`${salt}|${parts.join('|')}`), 36) % 1000003) / 1000003;
const prngOf = (seed) => { let a = parseInt(hash(seed), 36) | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const charge = (state, h, what = 'other') => { const a = ensureAbm(state); a.hours = +(a.hours + h).toFixed(3); (a.hoursBy ??= {})[what] = +((a.hoursBy[what] ?? 0) + h).toFixed(3); return h; };

export const accountById = (state, id) => ensureAbm(state).accounts.find((x) => x.id === id);
export const targets = (state) => ensureAbm(state).accounts.filter((x) => x.status === 'target');
const statFor = (a, src) => (a.stats[src] ??= { signals: 0, acted: 0, positives: 0, meetings: 0 });

// ---------------------------------------------------------------------------
// Hidden truth
// ---------------------------------------------------------------------------

const monthOf = (state, day) => dateOf(state, day).getUTCMonth();

/** Is the account in market on this day? HIDDEN: never shown; the player infers it from signals and replies. */
export function inMarket(state, acc, day = state.day) {
  const a = ensureAbm(state);
  const t = acc.truth;
  const block = Math.floor((day + t.phase) / IN_MARKET.windowDays);
  let p = IN_MARKET.base + IN_MARKET.fitWeight * Math.pow(t.fit, 1.5);
  const toBudget = (t.budgetMonth - monthOf(state, day) + 12) % 12;
  if (toBudget <= 2) p *= IN_MARKET.budgetLift; // budgets get set in the two months before the fiscal year
  if (t.boostUntil != null && day <= t.boostUntil) p *= IN_MARKET.boostMult;
  return hu(a.salt, acc.key, 'im', block) < Math.min(0.75, p);
}

function rollStance(role, r) {
  const u = r();
  const [sup, neu] = role === 'champion' ? [0.6, 0.95] : role === 'economic_buyer' ? [0.3, 0.85] : role === 'user' ? [0.4, 0.9] : [0.15, 0.75];
  return u < sup ? 'support' : u < neu ? 'neutral' : 'oppose';
}

function estimateAcv(state, seg) {
  const plan = mainPlan(state);
  if (plan) return plan.interval === 'year' ? plan.price : plan.price * 12;
  return seg?.acvRange ? Math.sqrt(seg.acvRange[0] * seg.acvRange[1]) : 6000;
}

let coIndex = { key: null, map: null };
/** A database company by its key (prospector universe). */
export function companyByKey(state, key) {
  const u = universe(state);
  if (coIndex.key !== u.key) {
    const map = new Map();
    for (const r of u.rows) {
      const e = map.get(r.co.key);
      if (!e) map.set(r.co.key, { co: r.co, fit: r.fit });
      else e.fit = Math.max(e.fit, r.fit);
    }
    for (const co of u.companies) if (!map.has(co.key)) map.set(co.key, { co, fit: 0.2 });
    coIndex = { key: u.key, map };
  }
  return coIndex.map.get(key) ?? null;
}

/** Candidate accounts for the "Add accounts" search: one row per company, with only what a database shows. */
export function accountCandidates(state, { segment = '', minEmp = 0, maxEmp = Infinity, trigger = '', tech = '', limit = 60 } = {}) {
  const u = universe(state);
  const have = new Set(ensureAbm(state).accounts.map((x) => x.key));
  const out = [];
  for (const co of u.companies) {
    if (have.has(co.key)) continue;
    if (segment && co.segId !== segment) continue;
    if (co.employees < (Number(minEmp) || 0) || co.employees > (Number(maxEmp) || Infinity)) continue;
    if (tech && !co.techs.includes(tech)) continue;
    if (trigger === 'hiring' && !co.hiringShown) continue;
    if (trigger === 'raised' && !co.recentRaise) continue;
    out.push(co);
    if (out.length >= limit) break;
  }
  return out;
}

const SENIORITY_ROLE = { owner: 'economic_buyer', vp: 'champion', manager: 'user', ic: 'user' };

/** Build the hidden account record from a database company. */
function buildAccount(state, co, fit, { tier, reason, status = 'target' }) {
  const a = ensureAbm(state);
  const r = prngOf(`${a.salt}|acct|${co.key}`);
  const seg = getSegment(co.segId);
  const acv = estimateAcv(state, seg);
  // Initiative: hiring or a raise points to growth; the rest is a weighted draw [design].
  const pick = r();
  const initiative = co.hiring && pick < 0.45 ? 'team_growth' : co.recentRaise && pick < 0.55 ? 'team_growth' : INIT_IDS.filter((x) => x !== 'new_leadership')[Math.floor(r() * (INIT_IDS.length - 1))];
  const truth = {
    fit: clamp(fit, 0.02, 0.98), pain: clamp(fit + (r() - 0.5) * 0.3, 0.05, 0.95), initiative,
    budgetMonth: Math.floor(r() * 12), phase: Math.floor(r() * IN_MARKET.windowDays), boostUntil: null,
    recentRaise: Boolean(co.recentRaise), hiring: Boolean(co.hiring), techs: [...(co.techs ?? [])],
  };
  // Buying group for a deal of this size in this segment (data/buyer-segments.js), at most 5 people [design].
  let roles = committeeFor(co.segId, acv, r);
  const seen = new Set();
  roles = roles.filter((m) => !seen.has(m.role) && seen.add(m.role)).slice(0, 5);
  if (!roles.some((m) => m.role === 'economic_buyer')) roles.unshift({ role: 'economic_buyer', title: 'Owner', influence: 0.9, canBlock: true, concerns: [] });
  const dbPeople = [...(co.people ?? [])];
  const members = roles.map((m, i) => {
    const di = dbPeople.findIndex((p) => SENIORITY_ROLE[p.seniority] === m.role);
    const db = di >= 0 ? dbPeople.splice(di, 1)[0] : null;
    const nm = db ? { first: db.first, last: db.last } : drawName(r, { country: co.geo });
    return {
      key: `${co.key}|m${i}`, role: m.role, title: db?.title ?? m.title, first: nm.first, last: nm.last, influence: m.influence, canBlock: Boolean(m.canBlock),
      concerns: m.concerns ?? [], stance: rollStance(m.role, r), found: Boolean(db), fromDb: Boolean(db), contactId: null, touches: 0, lastTouchDay: null, replied: null, optedOut: false,
    };
  });
  return {
    id: uid('acct'), key: co.key, companyId: null, name: co.name, domain: co.domain, segId: co.segId, segLabel: co.segLabel ?? seg?.label ?? '', industry: co.industry,
    employees: co.employees, geo: co.geo, techs: [...(co.techs ?? [])], funding: co.funding, hiringShown: Boolean(co.hiringShown), recentRaise: Boolean(co.recentRaise),
    tier: Number(tier) || 2, reason: String(reason ?? ''), status, addedDay: state.day, acv, truth, members,
    research: { light: 0, deep: 0, hours: 0, initiative: null, budgetKnown: false, notes: [] }, cluster: null,
    burnedUntil: null, trustUntil: null, oppDealId: null, oppDay: null, warm: false,
  };
}

function ensureCrmCompany(state, acc) {
  if (acc.companyId) return acc.companyId;
  const co = upsertCompany(state, { name: acc.name, domain: acc.domain, industry: acc.industry, size: String(acc.employees), source: 'abm', notes: `Target account (${ABM_TIERS[acc.tier]?.short ?? ''})` });
  co.employees ??= acc.employees;
  co.segmentId ??= acc.segId;
  co.abmId = acc.id;
  acc.companyId = co.id;
  return co.id;
}

/** Add a database company to the target-account list. Returns { account, hours }. */
export function addTargetAccount(state, coKey, { tier = 2, reason = '' } = {}) {
  const a = ensureAbm(state);
  const ex = a.accounts.find((x) => x.key === coKey);
  if (ex) {
    if (ex.status !== 'target') { ex.status = 'target'; ex.tier = Number(tier) || ex.tier; ex.reason = reason || ex.reason; ex.addedDay = state.day; ensureCrmCompany(state, ex); }
    return { account: ex, hours: 0 };
  }
  const e = companyByKey(state, coKey);
  if (!e) throw new Error('That company is not in the database.');
  const acc = buildAccount(state, e.co, e.fit, { tier, reason });
  a.accounts.push(acc);
  ensureCrmCompany(state, acc);
  return { account: acc, hours: charge(state, HOURS.addAccount, 'accounts') };
}

export function setTier(state, accId, tier) {
  const acc = accountById(state, accId);
  if (!acc) throw new Error('No such account');
  acc.tier = Number(tier);
}
export function setReason(state, accId, reason) { const acc = accountById(state, accId); if (acc) acc.reason = String(reason ?? ''); }
export function dropTarget(state, accId) { const acc = accountById(state, accId); if (acc) { acc.status = 'dropped'; acc.droppedDay = state.day; } }

/** Does the "why this account" reason cite something true and checkable (fit or a trigger), or only size/logo? */
export function reasonQuality(acc) {
  const r = String(acc.reason ?? '').toLowerCase();
  if (words(r) < 4) return { score: 0, why: 'no reason written' };
  const T = acc.truth;
  const claims = [
    [/hir(e|es|ing)|job post|recruit/, T.hiring],
    [/rais|funding|series|seed/, T.recentRaise],
    [new RegExp((T.techs ?? []).map((t) => t.toLowerCase()).join('|') || '^$'), true],
    [INITIATIVES[T.initiative].re, true],
  ];
  const made = claims.filter(([re]) => re.test(r));
  const wrong = made.filter(([, ok]) => !ok).length;
  const sizeOnly = /\b(big|large|huge|enterprise|logo|famous|employees|biggest|revenue)\b/.test(r) && !made.length;
  if (wrong) return { score: 0.2, why: 'cites a trigger that is not true' };
  if (sizeOnly) return { score: 0.3, why: 'size or logo, not fit' };
  return made.length ? { score: 1, why: 'cites a checkable fit or trigger' } : { score: 0.5, why: 'no checkable trigger' };
}

// ---------------------------------------------------------------------------
// Research and the committee map
// ---------------------------------------------------------------------------

/** Research the account. depth 'light' (20 min: site, news) or 'deep' (about 2 h: brief, initiatives, budget timing). */
export function researchAccount(state, accId, depth = 'light') {
  const acc = accountById(state, accId);
  if (!acc) throw new Error('No such account');
  const a = ensureAbm(state);
  const deep = depth === 'deep';
  const h = deep ? HOURS.researchDeep : HOURS.researchLight;
  const n = acc.research.light + acc.research.deep;
  deep ? acc.research.deep++ : acc.research.light++;
  acc.research.hours = +(acc.research.hours + h).toFixed(2);
  const found = [];
  if (!acc.research.initiative && hu(a.salt, acc.key, 'research', n, depth) < (deep ? 0.85 : 0.3)) {
    acc.research.initiative = acc.truth.initiative;
    found.push(`Current initiative: ${INITIATIVES[acc.truth.initiative].label}`);
  }
  if (deep && !acc.research.budgetKnown && hu(a.salt, acc.key, 'budget', n) < 0.6) {
    acc.research.budgetKnown = true;
    found.push(`Budgets are set around ${MONTHS[acc.truth.budgetMonth]} (fiscal planning)`);
  }
  if (deep) { // a deep brief also surfaces one person you had not found
    const m = acc.members.find((x) => !x.found);
    if (m && hu(a.salt, acc.key, 'deepfind', n) < 0.6) { revealMember(state, acc, m); found.push(`Found ${m.first} ${m.last} (${roleLabel(m.role)})`); }
  }
  if (!found.length) found.push(deep ? 'Nothing new beyond what the database shows.' : 'Nothing conclusive from the website and news.');
  acc.research.notes.unshift({ day: state.day, depth, text: found.join(' · ') });
  return { found, hours: charge(state, h, 'research') };
}
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function memberContact(state, acc, m, { hidden = false } = {}) {
  if (m.contactId) { const c = contactById(state, m.contactId); if (c) return c; }
  ensureCrmCompany(state, acc);
  const full = `${m.first} ${m.last}`;
  const email = `${emailSlug(m.first)}.${emailSlug(m.last)}@${acc.domain}`.toLowerCase();
  let c = state.apps.crm.contacts.find((x) => x.email === email);
  if (!c) {
    try {
      c = addContact(state, { firstName: m.first, lastName: m.last, email, title: m.title, company: acc.name, domain: acc.domain, industry: acc.industry, size: String(acc.employees), notes: `Buying group: ${roleLabel(m.role)}` }, { source: 'abm' }).contact;
    } catch { return null; }
    const claimed = claimName(state, full, { key: m.key });
    if (claimed !== full) c.name = claimed;
  }
  c.abm = { accountId: acc.id, memberKey: m.key };
  c.verification ??= c.truth;
  if (hidden) c.hidden = true;
  m.contactId = c.id;
  return c;
}
function revealMember(state, acc, m) {
  m.found = true;
  const c = memberContact(state, acc, m);
  if (c) c.hidden = false;
}

/** Look for a specific role on LinkedIn / the org chart (15 min). Sales Navigator makes it likelier. */
export function findMember(state, accId, role) {
  const acc = accountById(state, accId);
  if (!acc) throw new Error('No such account');
  const a = ensureAbm(state);
  const m = acc.members.find((x) => x.role === role && !x.found);
  acc.findTries = (acc.findTries ?? 0) + 1;
  const h = charge(state, HOURS.findPerson, 'committee');
  if (!m) return { ok: false, hours: h, text: `No ${roleLabel(role).toLowerCase()} to find at ${acc.name}: that role is not part of this buying group.` };
  const p = a.sources.job_change?.on ? 0.85 : 0.7; // Sales Navigator search with the alerts plan [design]
  if (hu(a.salt, acc.key, 'find', role, acc.findTries) < p) { revealMember(state, acc, m); return { ok: true, hours: h, member: m, text: `Found ${m.first} ${m.last}, ${m.title}.` }; }
  return { ok: false, hours: h, text: 'No clear match yet (titles are messy). Try again or ask someone at the account.' };
}

// ---------------------------------------------------------------------------
// Sources (subscriptions)
// ---------------------------------------------------------------------------

const clayIncluded = (state) => DB_PLANS[state.apps.crm?.prospector?.plan]?.signals === true;
export const sourceMonthly = (state, id) => (id === 'firmographic' && clayIncluded(state) ? 0 : SOURCES[id].monthly);

export function subscribeSource(state, id) {
  const S = SOURCES[id];
  if (!S) throw new Error('Unknown source');
  const a = ensureAbm(state);
  const cur = (a.sources[id] ??= {});
  if (cur.on) return { hours: 0 };
  cur.on = true; cur.since = state.day; cur.pruned = null;
  const monthly = sourceMonthly(state, id);
  if (monthly > 0) {
    post(state, { amount: -monthly, counterparty: S.vendor, description: `${S.label}, first month`, category: 'software', method: 'card' });
    cur.recurringId = addRecurring(state, { vendor: S.vendor, amount: monthly, category: 'software', dayOfMonth: Math.min(28, dayOfMonth(state)), note: `Intent source: ${S.label}` }).id;
  }
  if (id === 'third_party_intent' && targets(state).length < 50) {
    logMistake(state, {
      functionId: 'account_based_marketing', id: 'intent_platform_too_early', label: 'Bought an enterprise intent platform for a small list', app: 'crm', key: `intentearly:${monthKey(state)}`,
      cost: { usd: monthly }, detail: `Subscribed to third-party intent at $${monthly.toLocaleString('en-US')}/month with ${targets(state).length} target accounts. At ~30-40% precision a short list yields a handful of mostly false surges a month.`,
      lesson: 'Intent platforms pay off on hundreds of accounts; on a short list, first-party signals and research are cheaper and more precise.',
    });
  }
  return { hours: charge(state, HOURS.sourceSetup, 'sources') };
}

/** Cancel a source. Records what it had produced, so pruning a dead source is credited and pruning a good one is visible. */
export function pruneSource(state, id) {
  const a = ensureAbm(state);
  const cur = a.sources[id];
  if (!cur?.on) return;
  cur.on = false;
  cur.pruned = state.day;
  cur.prunedStats = { ...statFor(a, id), days: state.day - (cur.since ?? state.day) };
  const r = state.recurring?.find((x) => x.id === cur.recurringId);
  if (r) r.active = false;
  cur.recurringId = null;
}

/** Per-source scoreboard the player uses to prune: signals, acted, positive replies, meetings, cost so far. */
export function sourceScoreboard(state) {
  const a = ensureAbm(state);
  return Object.keys(SOURCES).map((id) => {
    const st = statFor(a, id), cur = a.sources[id] ?? {};
    const months = cur.since != null ? Math.max(1, Math.ceil(((cur.pruned ?? state.day) - cur.since + 1) / 30)) : 0;
    return { id, ...SOURCES[id], on: Boolean(cur.on), since: cur.since, pruned: cur.pruned, ...st, spend: months * sourceMonthly(state, id), replyRate: st.acted ? st.positives / st.acted : null };
  });
}

// ---------------------------------------------------------------------------
// 1:many: matched-account ads (hook for the Ads app)
// ---------------------------------------------------------------------------

/** Set a monthly matched-account ads budget for the target list (LinkedIn-style). 0 stops it. */
export function setAdsBudget(state, monthly) {
  const a = ensureAbm(state);
  const m = Math.max(0, Math.round(Number(monthly) || 0));
  const old = state.recurring?.find((x) => x.id === a.ads.recurringId);
  if (old) old.active = false;
  a.ads.recurringId = null;
  if (m > 0 && !targets(state).length) throw new Error('Add target accounts first: matched-account ads need an account list.');
  const firstTime = !a.ads.monthly && m > 0;
  a.ads.monthly = m;
  if (m > 0) {
    a.ads.since ??= state.day;
    post(state, { amount: -m, counterparty: 'LinkedIn Ads', description: 'Matched-account campaign, first month', category: 'advertising', method: 'card' });
    a.ads.recurringId = addRecurring(state, { vendor: 'LinkedIn Ads', amount: m, category: 'advertising', dayOfMonth: Math.min(28, dayOfMonth(state)), note: 'ABM matched-account ads' }).id;
  }
  return { hours: firstTime ? charge(state, HOURS.adsSetup, 'ads') : 0 };
}

/** Awareness 0..1 per targeted account from the ads budget (impressions per account per month) [design]. */
export function awareness(state) {
  const a = ensureAbm(state);
  const n = targets(state).length;
  if (!a.ads.monthly || !n) return 0;
  const perAccount = (a.ads.monthly / ADS.cpm) * 1000 / n;
  return clamp(perAccount / ADS.impressionsForFullAwareness, 0, 1);
}

/**
 * Exported hook for the Ads app (1:many): the matched-account audience. Domains of the targeted accounts by tier and
 * the monthly budget set here. Ads can upload it as a company list; this module already posts the spend.
 */
export function abmAdAudience(state) {
  const a = state.apps?.crm?.abm;
  if (!a) return { domains: [], byTier: { 1: [], 2: [], 3: [] }, monthly: 0 };
  const t = a.accounts.filter((x) => x.status === 'target');
  return { domains: t.map((x) => x.domain), byTier: { 1: t.filter((x) => x.tier === 1).map((x) => x.domain), 2: t.filter((x) => x.tier === 2).map((x) => x.domain), 3: t.filter((x) => x.tier === 3).map((x) => x.domain) }, monthly: a.ads.monthly };
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export const signalAge = (state, sig) => state.day - sig.day;
/** What a signal is still worth: 0.5^(age / half-life) (doc "Simulation hooks"). */
export const signalStrength = (state, sig) => Math.pow(0.5, signalAge(state, sig) / SIGNAL_TYPES[sig.type].halfLife);
export const visibleSignals = (state, accId = null) => ensureAbm(state).signals.filter((s) => s.seenDay <= state.day && !s.unpaid && (!accId || s.accountId === accId));

function memberForSignal(state, acc, type, day) {
  const a = ensureAbm(state);
  const pool = acc.members.filter((m) => !m.optedOut);
  if (!pool.length) return null;
  return pool[Math.floor(hu(a.salt, acc.key, type, day, 'who') * pool.length)];
}

// Manual sources (competitor reviews, content engagement) cost founder time every week. When the week has no room,
// the watch is skipped and that week's signals from the source are missed.
function manualWatch(state) {
  const a = ensureAbm(state);
  if (state.day % 7 !== 0) return;
  for (const [id, cur] of Object.entries(a.sources)) {
    const h = SOURCES[id]?.weeklyHours;
    if (!cur.on || !h) continue;
    try { spendHours(state, h, `Watching ${SOURCES[id].label.toLowerCase()}`); charge(state, h, 'signals'); cur.skipUntil = null; }
    catch { cur.skipUntil = state.day + 7; }
  }
}

function genSignals(state) {
  const a = ensureAbm(state);
  const active = Object.keys(SOURCES).filter((id) => a.sources[id]?.on && id !== 'job_change' && !(a.sources[id].skipUntil > state.day));
  if (!active.length) return;
  const aware = awareness(state);
  const hasSite = Boolean(state.company?.website || state.apps?.website?.published || state.company?.domain);
  const hasContent = (state.founder?.network?.linkedin ?? 0) > 0 || aware > 0;
  for (const acc of a.accounts) {
    if (acc.status !== 'target') continue;
    const inM = inMarket(state, acc);
    for (const id of active) {
      for (const type of SOURCES[id].types) {
        const T = SIGNAL_TYPES[type];
        let p = inM ? T.hIn : T.hOut;
        if (type === 'site_visit') p *= hasSite ? 1 + aware : 0.3;
        if (type === 'content_engagement') p *= (hasContent ? 1 : 0.4) * (1 + aware);
        if (hu(a.salt, acc.key, type, state.day) >= p) continue;
        const factual = hu(a.salt, acc.key, type, state.day, 'fact') < T.factual;
        const lag = T.lag[0] + Math.floor(hu(a.salt, acc.key, type, state.day, 'lag') * (T.lag[1] - T.lag[0] + 1));
        let personKey = null;
        if (T.person && !(type === 'site_visit' && acc.geo !== 'US')) personKey = memberForSignal(state, acc, type, state.day)?.key ?? null;
        a.signals.push({ id: uid('asig'), accountId: acc.id, source: id, type, day: state.day, seenDay: state.day + lag, factual, inMarket: inM, personKey, companyLevel: type === 'site_visit' && acc.geo !== 'US' });
        if (factual && type === 'funding') { acc.truth.recentRaise = true; acc.truth.boostUntil = Math.max(acc.truth.boostUntil ?? 0, state.day + 60); }
        if (factual && type === 'hiring') acc.truth.hiring = true;
      }
    }
  }
}

/** Champions you can track: people who replied with interest, met you, or bought. */
export function trackableChampions(state) {
  return (state.apps.crm?.contacts ?? []).filter((c) => !c.hidden && !c.movedTo && (['meeting', 'customer', 'interested'].includes(c.status) || c.replyKind === 'interested' || c.committee?.stance === 'support' && c.committee?.engaged));
}

function genJobChanges(state) {
  const a = ensureAbm(state);
  if (!a.sources.job_change?.on) return;
  for (const c of trackableChampions(state)) {
    if (hu(a.salt, 'jc', c.id, state.day) >= JOB_CHANGE.dailyHazard) continue;
    const factual = hu(a.salt, 'jc', c.id, state.day, 'fact') < SIGNAL_TYPES.job_change.factual;
    const T = SIGNAL_TYPES.job_change;
    const lag = T.lag[0] + Math.floor(hu(a.salt, 'jc', c.id, state.day, 'lag') * (T.lag[1] - T.lag[0] + 1));
    a.signals.push({ id: uid('asig'), accountId: null, source: 'job_change', type: 'job_change', day: state.day, seenDay: state.day + lag, factual, inMarket: null, personKey: null, championId: c.id });
  }
}

/** A tracked champion moved (or the alert says so): a suggested account at the new company with them as a warm contact. */
export function applyJobChange(state, sig) {
  const a = ensureAbm(state);
  const c = contactById(state, sig.championId);
  if (!c) return null;
  const u = universe(state);
  const pool = u.companies.filter((co) => !a.accounts.some((x) => x.key === co.key) && co.employees >= 5);
  const co = pool[Math.floor(hu(a.salt, 'jcco', c.id, sig.day) * pool.length)];
  if (!co) return null;
  const e = companyByKey(state, co.key);
  const acc = buildAccount(state, co, e.fit, { tier: 1, reason: '', status: 'suggested' });
  // The champion becomes the account's champion (warm). A false alarm leaves a "ghost": they are not really there.
  const champ = { key: `${co.key}|champ|${c.id}`, role: 'champion', title: c.title || 'Head of Operations', first: c.firstName || contactName(c).split(' ')[0], last: c.lastName || '', influence: 0.7, canBlock: true, concerns: [], stance: 'support', found: true, fromDb: false, contactId: null, touches: 0, lastTouchDay: null, replied: null, optedOut: false, warm: true, ghost: !sig.factual, formerContactId: c.id };
  acc.members = [champ, ...acc.members.filter((m) => m.role !== 'champion')];
  acc.warm = true;
  if (sig.factual) { acc.truth.boostUntil = sig.day + JOB_CHANGE.boostDays; c.movedTo = acc.id; addActivity(state, { type: 'note', text: `${contactName(c)} left for ${acc.name}`, contactId: c.id, companyId: c.companyId }); }
  acc.truth.initiative = sig.factual && hu(a.salt, 'jcinit', c.id) < 0.6 ? 'new_leadership' : acc.truth.initiative;
  a.accounts.push(acc);
  sig.accountId = acc.id;
  sig.personKey = champ.key;
  sig.inMarket = sig.factual ? inMarket(state, acc, sig.day) : false;
  return acc;
}

function deliverSignals(state) {
  const a = ensureAbm(state);
  for (const sig of a.signals) {
    if (sig.delivered || sig.seenDay > state.day) continue;
    sig.delivered = true;
    if (sig.type === 'job_change' && !sig.accountId) applyJobChange(state, sig);
    statFor(a, sig.source).signals++;
    const acc = accountById(state, sig.accountId);
    // A person-level alert comes with a profile: that person is now known (it may be the wrong person, see factual).
    const who = sig.personKey && acc?.members.find((m) => m.key === sig.personKey);
    if (who && !who.found) revealMember(state, acc, who);
    emitSalesEvent(state, 'signal_fired', { companyId: acc?.companyId ?? null, signal: sig.type, signalId: sig.id, source: sig.source }, `abmsig:${sig.id}`);
  }
  if (a.signals.length > 1500) a.signals.splice(0, a.signals.length - 1500);
}

/** Check a signal before using it (open the press release, the job post, their LinkedIn): reveals whether it is real. */
export function verifySignal(state, sigId) {
  const sig = ensureAbm(state).signals.find((s) => s.id === sigId);
  if (!sig) throw new Error('No such signal');
  sig.verified = sig.type === 'category_surge' || sig.type === 'g2_research' ? 'unverifiable' : sig.factual ? 'confirmed' : 'not_true';
  return { result: sig.verified, hours: charge(state, HOURS.verifySignal, 'signals') };
}
export function dismissSignal(state, sigId) {
  const sig = ensureAbm(state).signals.find((s) => s.id === sigId);
  if (sig) sig.dismissed = state.day;
  return { hours: charge(state, HOURS.dismissSignal, 'signals') };
}

// ---------------------------------------------------------------------------
// Judging a message against the truth (offline heuristic; an LLM judge blends in for writing quality only)
// ---------------------------------------------------------------------------

const GENERIC = /\b(companies like yours|i hope this (email )?finds you well|just checking in|synerg\w*|revolutionar\w*|best[- ]in[- ]class|cutting[- ]edge|game[- ]chang\w*|leading provider|world[- ]class|touch base|quick call to (introduce|tell)|we help businesses)\b/gi;
const ASK = /\b(worth (a|it)|open to|would it (help|make sense)|does (that|this) (match|sound)|(15|20|ten|fifteen|twenty)[- ]?min|a quick (look|chat)|should i send|is that on your)\b|\?/i;
const PUSHY = /\b(book a demo|buy now|sign up today|limited time|act now|schedule a demo now)\b/i;
const ROLE_ANGLE = {
  economic_buyer: /\b(cost|roi|revenue|risk|budget|payback|margin|spend|save|saving|\$\d)/i,
  finance: /\b(cost|roi|budget|payback|spend|invoice|cash|save|saving|\$\d)/i,
  champion: /\b(team|rollout|workflow|time|hours|week|process|manual|results)/i,
  user: /\b(time|hours|workflow|manual|clicks|day[- ]to[- ]day|busywork|by hand|steps)/i,
  technical: /\b(integrat\w*|api|security|sso|data|migration|sync|uptime)/i,
  security: /\b(security|soc ?2|sso|encryption|access|audit)/i,
};
const CLAIM = /\b(you|your|you're|saw|noticed|congrat\w*|heard|read that|looks like)\b/i;
const STALE_CLAIM = /\b(just|recent(ly)?|this week|yesterday|last week|today)\b/i;

const normWords = (t, names) => new Set(String(t).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !names.has(w)));
function jaccard(a, b) { let i = 0; for (const x of a) if (b.has(x)) i++; return a.size + b.size ? i / (a.size + b.size - i) : 0; }

/**
 * Score a message to one member of an account. Checks every signal it references against what really happened
 * (seen signals at this account, the account's true facts), the initiative it names against the truth, the angle against
 * the role, plus length, ask and template reuse. Returns { q, refs, flags, notes, parts }.
 */
export function judgeMessage(state, acc, member, text, { play = '1:1' } = {}) {
  const a = ensureAbm(state);
  const t = String(text ?? '');
  const n = words(t);
  const parts = {};
  const flags = { creepy: false, falseRef: false, staleRef: false, template: false, stuffing: false, wrongPerson: false };
  const notes = [];
  parts.length = n < 25 ? -0.05 : n <= 140 ? 0.1 : n <= 200 ? 0.03 : -0.08;
  // Initiative / implication.
  const hits = INIT_IDS.filter((id) => INITIATIVES[id].re.test(t));
  if (hits.length >= 3) { flags.stuffing = true; parts.initiative = -0.15; notes.push('Names many possible priorities at once (reads like a checklist).'); }
  else if (hits.includes(acc.truth.initiative)) { parts.initiative = 0.22; notes.push('Names what the account is actually working on.'); }
  else parts.initiative = hits.length ? -0.05 : 0;
  // Signal references.
  const vis = visibleSignals(state, acc.id);
  const refs = [];
  // A reference is a claim about them: the sentence that mentions the event also addresses them ("you", "saw", "congrats").
  const sentences = t.split(/(?<=[.!?\n])\s+/);
  for (const [type, T] of Object.entries(SIGNAL_TYPES)) {
    if (!sentences.some((x) => T.ref.test(x) && CLAIM.test(x))) continue;
    const sig = vis.filter((s) => s.type === type).sort((x, y) => y.day - x.day)[0] ?? null;
    let ok = false, why = '';
    const truthFact = type === 'funding' ? acc.truth.recentRaise : type === 'hiring' ? acc.truth.hiring : null;
    if (sig) {
      const wrongPerson = T.person && sig.personKey && sig.personKey !== member.key && /\byou\b/i.test(t);
      const ghost = type === 'job_change' && member.ghost;
      if (!sig.factual || ghost) { why = 'the event did not happen as the alert said'; flags.falseRef = true; }
      else if (wrongPerson || (type === 'site_visit' && sig.companyLevel && /\byou\b/i.test(t))) { why = 'it was someone else at the company'; flags.falseRef = true; flags.wrongPerson = true; }
      else {
        const age = state.day - sig.day;
        if (age > 2 * T.halfLife && STALE_CLAIM.test(t)) { why = `${age} days old but written as news`; flags.staleRef = true; }
        else { ok = true; why = `${age} days old`; }
      }
    } else if (truthFact) { ok = true; why = 'true (from the database)'; }
    else { why = 'no such signal at this account'; flags.falseRef = true; }
    if (T.creepy) flags.creepy = true;
    refs.push({ type, signalId: sig?.id ?? null, ok, why, age: sig ? state.day - sig.day : null });
  }
  const okRefs = refs.filter((r) => r.ok);
  const fresh = okRefs.length ? Math.max(...okRefs.map((r) => (r.age == null ? 0.4 : Math.pow(0.5, r.age / SIGNAL_TYPES[r.type].halfLife)))) : 0;
  parts.signal = (okRefs.length && !flags.creepy ? 0.06 + 0.12 * fresh : 0) - (flags.falseRef ? 0.25 : 0) - (flags.staleRef ? 0.1 : 0) - (flags.creepy ? 0.15 : 0);
  if (flags.creepy) notes.push('Mentions tracking data (site visits, intent, research) the person never shared with you.');
  if (flags.falseRef) notes.push(`References something that is not true for this person or account (${refs.filter((r) => !r.ok && !/old/.test(r.why)).map((r) => r.why).join('; ')}).`);
  if (flags.staleRef) notes.push('Presents an old signal as news.');
  // Role angle, ask, personalization, generic phrases.
  const angle = ROLE_ANGLE[member.role] ?? ROLE_ANGLE.champion;
  parts.angle = angle.test(t) ? 0.08 : 0;
  parts.ask = (ASK.test(t) ? 0.07 : 0) - (PUSHY.test(t) ? 0.05 : 0);
  parts.personal = (new RegExp(`\\b${acc.name.split(' ')[0].replace(/[^A-Za-z]/g, '')}`, 'i').test(t) ? 0.02 : 0) + (member.first && new RegExp(`\\b${member.first}\\b`, 'i').test(t) ? 0.01 : 0);
  const generic = (t.match(GENERIC) ?? []).length;
  parts.generic = -Math.min(0.18, 0.06 * generic);
  if (generic) notes.push('Uses stock phrases.');
  let q = 0.3 + Object.values(parts).reduce((x, y) => x + y, 0);
  // Template reuse across accounts (names stripped).
  if (play === '1:1') {
    const names = new Set([acc.name, member.first, member.last].join(' ').toLowerCase().split(/\s+/));
    const me = normWords(t, names);
    const others = a.touches.filter((x) => x.accountId !== acc.id && x.play === '1:1').slice(-30);
    if (me.size >= 8 && others.some((x) => jaccard(me, normWords(x.text, new Set([...(x.names ?? [])]))) > 0.75)) { flags.template = true; q = Math.min(q, 0.4); notes.push('Nearly the same text you sent to other accounts.'); }
  } else q = Math.min(q, 0.7); // a cluster message is personal to a segment, not a person [design]
  return { q: +clamp(q, 0, 1).toFixed(3), refs, flags, notes, parts, priority: !flags.stuffing && hits.includes(acc.truth.initiative) };
}

/** Blend an LLM judge's writing score (0..1) with the heuristic; the factual checks stay with the heuristic. */
export function blendJudge(j, llmScore) {
  if (!Number.isFinite(llmScore)) return j.q;
  let q = 0.5 * j.q + 0.5 * clamp(llmScore, 0, 1);
  if (j.flags.falseRef) q -= 0.15;
  if (j.flags.creepy) q -= 0.1;
  if (j.flags.template) q = Math.min(q, 0.4);
  return +clamp(q, 0, 1).toFixed(3);
}

// ---------------------------------------------------------------------------
// Touches and outcomes
// ---------------------------------------------------------------------------

const unansweredRecent = (state, acc) => ensureAbm(state).touches.filter((x) => x.accountId === acc.id && state.day - x.day <= 30 && x.outcome !== 'positive' && x.outcome !== 'neutral').length;
export const isAccountBurned = (state, acc) => acc.burnedUntil != null && state.day < acc.burnedUntil;

/** Odds of a positive reply for this touch from the hidden truth. Exported for tests and debriefs. */
export function replyOdds(state, acc, member, judge, { day = state.day } = {}) {
  const inM = inMarket(state, acc, day);
  const P = {};
  P.base = inM ? ODDS.inMarket : ODDS.outOfMarket;
  P.relevance = 0.6 + 0.8 * judge.q;
  P.role = ODDS.role[member.role] ?? ODDS.roleDefault;
  P.pain = 0.4 + 1.2 * acc.truth.pain;
  P.priority = judge.priority ? ODDS.priorityMult : 1; // written about what they are actually working on
  const okRefs = judge.refs.filter((r) => r.ok);
  const fresh = okRefs.length ? Math.max(...okRefs.map((r) => (r.age == null ? 0.4 : Math.pow(0.5, r.age / SIGNAL_TYPES[r.type].halfLife)))) : 0;
  P.signal = (judge.flags.falseRef ? ODDS.falseMult : 1) * (judge.flags.staleRef ? ODDS.staleMult : 1) * (judge.flags.creepy ? ODDS.creepyMult : 1) * (okRefs.length && inM ? 1 + ODDS.freshLift * fresh : 1);
  const un = unansweredRecent(state, acc);
  P.fatigue = Math.pow(ODDS.fatigueMult, Math.max(0, un - ODDS.fatigueFree));
  P.trust = acc.trustUntil != null && day < acc.trustUntil ? ODDS.trustMult : 1;
  P.warm = member.warm && !member.ghost ? ODDS.warmMult : 1;
  P.thread = acc.members.some((m) => m.key !== member.key && m.replied === 'positive') ? ODDS.threadMult : 1;
  P.aware = 1 + ODDS.awareLift * awareness(state);
  P.ghost = member.ghost ? 0 : 1;
  const p = Object.values(P).reduce((x, y) => x * y, 1);
  return { p: clamp(p, 0, ODDS.maxP), inMarket: inM, parts: P };
}

/**
 * Send one touch (email or LinkedIn message) to a found member of a target account.
 * opts: { text, play '1:1'|'1:few', channel, llmScore, signalId (the signal you are acting on, if any) }.
 * Returns { touch, judge, hours }. The reply arrives in 1-4 days (abmDay).
 */
export function sendTouch(state, accId, memberKey, { text, play = '1:1', channel = 'email', llmScore = null, signalId = null } = {}) {
  const a = ensureAbm(state);
  const acc = accountById(state, accId);
  if (!acc) throw new Error('No such account');
  if (acc.status !== 'target') throw new Error('Add this account to your targets first.');
  if (isAccountBurned(state, acc)) throw new Error(`${acc.name} is burned until ${acc.burnedUntil - state.day} days from now: too many unanswered touches.`);
  const member = acc.members.find((m) => m.key === memberKey);
  if (!member?.found) throw new Error('Find this person first (research or LinkedIn lookup).');
  if (member.optedOut) throw new Error(`${member.first} asked not to be contacted.`);
  if (words(text) < 5) throw new Error('Write the message first.');
  memberContact(state, acc, member);
  const judge = judgeMessage(state, acc, member, text, { play });
  judge.q = blendJudge(judge, llmScore);
  const odds = replyOdds(state, acc, member, judge);
  const r = rand(state);
  const outcome = r < odds.p ? 'positive' : r < odds.p + 0.04 + 0.08 * (odds.inMarket ? 1 : 0) ? 'neutral' : r < odds.p + 0.17 ? 'negative' : 'none';
  const replyDay = outcome === 'none' ? null : state.day + 1 + Math.floor(rand(state) * (outcome === 'positive' ? 2 : 4));
  const actedOn = [...new Set([signalId, ...judge.refs.map((x) => x.signalId)].filter(Boolean))];
  const sigs = actedOn.map((id) => a.signals.find((s) => s.id === id)).filter(Boolean);
  const recent = visibleSignals(state, acc.id).filter((s) => state.day - s.seenDay <= 14 && !s.dismissed);
  const touch = {
    id: uid('touch'), accountId: acc.id, memberKey, role: member.role, tier: acc.tier, play, channel, day: state.day, text: String(text), names: [acc.name, member.first, member.last].join(' ').toLowerCase().split(/\s+/),
    q: judge.q, flags: judge.flags, refs: judge.refs, notes: judge.notes, signalIds: actedOn,
    signalAge: sigs.length ? Math.min(...sigs.map((s) => state.day - s.seenDay)) : null, eventAge: sigs.length ? Math.min(...sigs.map((s) => state.day - s.day)) : null,
    fresh: sigs.length ? +Math.max(...sigs.map((s) => Math.pow(0.5, (state.day - s.day) / SIGNAL_TYPES[s.type].halfLife))).toFixed(3) : null, sigType: sigs[0]?.type ?? null,
    stack: new Set(recent.map((s) => s.source)).size, inMarket: odds.inMarket, fit: acc.truth.fit, p: +odds.p.toFixed(4),
    outcome: null, pending: outcome, replyDay, // outcome revealed on replyDay
  };
  a.touches.push(touch);
  if (a.touches.length > 3000) a.touches.splice(0, a.touches.length - 3000);
  member.touches++; member.lastTouchDay = state.day;
  for (const s of sigs) { if (s.actedDay == null) { s.actedDay = state.day; statFor(a, s.source).acted++; } }
  addActivity(state, { type: 'email', text: `${play === '1:few' ? 'Cluster message' : 'Personal note'} to ${member.first} ${member.last} (${roleLabel(member.role)})${sigs.length ? ` on a ${SIGNAL_TYPES[sigs[0].type].label.toLowerCase()} signal` : ''}`, companyId: acc.companyId, contactId: member.contactId });
  touchMistakes(state, acc, member, touch, sigs);
  const h = play === '1:few' ? HOURS.clusterSend : HOURS.message;
  return { touch, judge, odds, hours: charge(state, h, 'messages') };
}

function touchMistakes(state, acc, member, touch, sigs) {
  const a = ensureAbm(state);
  const f = touch.flags;
  if (f.falseRef) {
    acc.trustUntil = state.day + ODDS.trustDays;
    logMistake(state, {
      functionId: 'signal_outreach', id: 'acted_on_false_signal', label: 'Referenced a signal that was not true', app: 'crm', key: `falsesig:${acc.id}:${state.day}`,
      cost: { hours: HOURS.message, reputation: 0.3 }, detail: `Told ${member.first} at ${acc.name} about ${touch.refs.filter((r) => !r.ok).map((r) => `${SIGNAL_TYPES[r.type].label.toLowerCase()} (${r.why})`).join(', ')}. Replies from this account are about half as likely for ${ODDS.trustDays} days.`,
      lesson: 'Verify a signal (the press release, the job post, their profile) before you quote it; tie it to their problem, not to your data.',
    });
  }
  if (f.creepy) {
    const eu = acc.geo !== 'US' && touch.refs.some((r) => r.type === 'site_visit');
    logMistake(state, {
      functionId: 'signal_outreach', id: eu ? 'gdpr_visitor_outreach' : 'creepy_signal_reference', label: eu ? 'Quoted tracking data to a non-US prospect' : 'Quoted tracking data in a message', app: 'crm', key: `creepy:${acc.id}:${state.day}`,
      cost: { hours: HOURS.message, reputation: eu ? 0.5 : 0.2, usd: eu ? 400 : 0 }, detail: `The note to ${member.first} at ${acc.name} said you saw them on your site or researching the category.${eu ? ' Person-level tracking outside the US needs a lawful basis (GDPR); a privacy review followed.' : ''}`,
      lesson: 'Use intent to choose whom and when to contact, then write about their problem; never quote the tracking.',
    });
  }
  if (f.staleRef) {
    logMistake(state, {
      functionId: 'signal_outreach', id: 'stale_signal_reference', label: 'Presented an old signal as news', app: 'crm', key: `stale:${acc.id}:${state.day}`,
      cost: { hours: HOURS.message, reputation: 0.1 }, detail: `Wrote to ${acc.name} about a ${touch.refs.find((r) => r.type && !r.ok)?.type?.replace('_', ' ') ?? 'signal'} that was ${touch.eventAge ?? '?'} days old as if it were this week's news.`,
      lesson: 'Act within 24-48 hours of a signal; after two half-lives, write about the problem, not the event.',
    });
  }
  // Acting very late on a fast signal: the window was likely gone (wasted hours).
  for (const s of sigs) {
    const T = SIGNAL_TYPES[s.type];
    if (state.day - s.day > 3 * T.halfLife) {
      logMistake(state, {
        functionId: 'signal_outreach', id: 'slow_signal_response', label: 'Acted on a signal weeks late', app: 'crm', key: `slow:${s.id}`,
        cost: { hours: HOURS.message }, detail: `Acted on a ${T.label.toLowerCase()} signal at ${acc.name} ${state.day - s.day} days after it happened (half-life ~${T.halfLife} days): it was worth ${Math.round(100 * Math.pow(0.5, (state.day - s.day) / T.halfLife))}% of a fresh one.`,
        lesson: 'Review alerts daily and act within 24-48 hours, or let the signal go.',
      });
    }
  }
  if (acc.tier === 1 && touch.play === '1:1' && (f.template || touch.q < 0.42)) {
    logMistake(state, {
      functionId: 'account_based_marketing', id: 'tier1_generic_message', label: 'Generic message to a tier-1 account', app: 'crm', key: `t1generic:${acc.id}`,
      cost: { hours: +(acc.research.hours + HOURS.message).toFixed(2), reputation: 0.1 }, detail: `${acc.name} is a 1:1 account, but the note to ${member.first} ${f.template ? 'was the same text sent to other accounts' : 'did not use anything specific to them'} (score ${Math.round(touch.q * 100)}/100). The ${acc.research.hours.toFixed(1)} h of research did not reach the message.`,
      lesson: 'A tier-1 note names their initiative and what it means for this person; otherwise run the account as 1:few.',
    });
  }
  // Untargeted blast: 5+ touches in a week to accounts that do not fit (hidden fit).
  const wk = a.touches.filter((x) => state.day - x.day < 7);
  const misfit = wk.filter((x) => x.fit < 0.4).length;
  if (misfit >= 5) {
    logMistake(state, {
      functionId: 'signal_outreach', id: 'untargeted_signal_blast', label: 'Acted on signals at accounts outside the ICP', app: 'crm', key: `blast:${Math.floor(state.day / 7)}`,
      cost: { hours: +(misfit * HOURS.message).toFixed(2) }, detail: `${misfit} of ${wk.length} touches this week went to accounts that do not fit what you sell; signals there rarely mean a purchase.`,
      lesson: 'Filter signals by ICP fit first; a signal at a poor-fit account is noise.',
    });
  }
  // Burn: too many unanswered touches on one account.
  if (unansweredRecent(state, acc) >= ODDS.burnUnanswered && !isAccountBurned(state, acc)) {
    acc.burnedUntil = state.day + ODDS.burnDays;
    const hrs = a.touches.filter((x) => x.accountId === acc.id).length * HOURS.message + acc.research.hours;
    logMistake(state, {
      functionId: 'account_based_marketing', id: 'burned_account', label: 'Burned a target account with too many touches', app: 'crm', key: `burn:${acc.id}:${state.day}`,
      cost: { hours: +hrs.toFixed(2), days: ODDS.burnDays }, delayed: false,
      detail: `${unansweredRecent(state, acc)} unanswered touches to ${acc.name} in 30 days. They stop responding for about six months; the ${hrs.toFixed(1)} h already invested are sunk.`,
      lesson: 'Cap touches per account, spread them across the buying group, and pause when nobody answers.',
    });
    emitSalesEvent(state, 'market_burned', { companyId: acc.companyId, reason: 'abm_over_touch' }, `abmburn:${acc.id}:${state.day}`);
  }
}

/** Run a 1:few cluster play: one message (with {first} and {company} merges) to the best-known person at each account. */
export function runClusterPlay(state, name, accIds, text) {
  const a = ensureAbm(state);
  if (words(text) < 15) throw new Error('Write the cluster message first (one angle that fits the whole cluster).');
  const cl = (a.clusters[name] ??= { name, text: '', assetDay: null, accounts: [] });
  let hours = 0;
  if (!cl.assetDay || cl.text !== text) { cl.assetDay = state.day; cl.text = text; hours += charge(state, HOURS.clusterAsset, 'messages'); }
  const sent = [], skipped = [];
  for (const id of accIds) {
    const acc = accountById(state, id);
    if (!acc || acc.status !== 'target' || isAccountBurned(state, acc)) { skipped.push(acc?.name ?? id); continue; }
    acc.cluster = name;
    cl.accounts = [...new Set([...cl.accounts, acc.id])];
    const m = acc.members.filter((x) => x.found && !x.optedOut).sort((x, y) => (y.role === 'champion') - (x.role === 'champion') || y.influence - x.influence)[0];
    if (!m) { skipped.push(acc.name); continue; }
    const body = text.replace(/\{first\}/gi, m.first).replace(/\{company\}/gi, acc.name);
    const r = sendTouch(state, acc.id, m.key, { text: body, play: '1:few' });
    hours += r.hours;
    sent.push(r.touch);
  }
  return { sent, skipped, hours };
}

// ---------------------------------------------------------------------------
// Replies -> meetings -> opportunities
// ---------------------------------------------------------------------------

const REPLY_TEXT = {
  positive: (m, acc) => `${m.first}: "Timing is actually good. We're looking at this now. Can you do a call next week?"`,
  neutral: (m, acc) => `${m.first}: "Not this quarter. We plan budgets around ${MONTHS[acc.truth.budgetMonth]}; reach out before then."`,
  negative: (m) => `${m.first}: "Not interested, please take me off your list."`,
};

function resolveReplies(state) {
  const a = ensureAbm(state);
  for (const t of a.touches) {
    if (t.outcome != null || !t.pending) continue;
    if (t.pending === 'none') { if (state.day - t.day >= 7) t.outcome = 'none'; continue; }
    if (t.replyDay > state.day) continue;
    t.outcome = t.pending;
    const acc = accountById(state, t.accountId);
    const m = acc?.members.find((x) => x.key === t.memberKey);
    if (!acc || !m) continue;
    m.replied = t.outcome === 'positive' ? 'positive' : m.replied === 'positive' ? 'positive' : t.outcome;
    addActivity(state, { type: 'reply', text: REPLY_TEXT[t.outcome](m, acc), companyId: acc.companyId, contactId: m.contactId });
    emitSalesEvent(state, 'reply_received', { contactId: m.contactId, companyId: acc.companyId, category: t.outcome === 'positive' ? 'interested' : t.outcome === 'neutral' ? 'not_now' : 'not_interested' }, `abmreply:${t.id}`);
    const c = contactById(state, m.contactId);
    if (t.outcome === 'negative') { m.optedOut = true; if (c) c.status = 'unsubscribed'; continue; }
    if (t.outcome === 'neutral') { acc.research.budgetKnown = true; if (c) c.status = 'replied'; continue; }
    if (c) { c.status = 'interested'; c.replyKind = 'interested'; }
    for (const id of t.signalIds) { const s = a.signals.find((x) => x.id === id); if (s && !s.positive) { s.positive = state.day; statFor(a, s.source).positives++; } }
    if (!acc.oppDealId && rand(state) < ODDS.meetingGivenPositive) bookOpportunity(state, acc, m, t);
  }
}

function bookOpportunity(state, acc, m, t) {
  const a = ensureAbm(state);
  const c = memberContact(state, acc, m);
  if (!c) return null;
  let deal = null;
  const slot = nextSlot(state, { minLead: 2, duration: 30, seed: c.id });
  try {
    if (slot) deal = state.apps.crm.deals.find((d) => d.id === createMeeting(state, { contactId: c.id, slot, kind: 'discovery', source: 'outbound' }).dealId);
  } catch { deal = null; }
  if (!deal) deal = ensureDeal(state, { companyId: acc.companyId, contactId: c.id, source: 'outbound', stage: 'lead' });
  acc.oppDealId = deal.id;
  acc.oppDay = state.day;
  for (const id of t.signalIds) { const s = a.signals.find((x) => x.id === id); if (s) statFor(a, s.source).meetings++; }
  seedDealCommittee(state, acc, deal, c);
  const touched = acc.members.filter((x) => x.touches > 0).length;
  const engaged = acc.members.filter((x) => x.replied === 'positive').length;
  if ((acc.employees >= BIG_ACCOUNT.employees || acc.acv >= BIG_ACCOUNT.acv) && touched <= 1 && acc.members.length >= 3) {
    logMistake(state, {
      functionId: 'account_based_marketing', id: 'single_threaded_enterprise', label: 'Single-threaded into a large account', app: 'crm', key: `single:${acc.id}`, delayed: true,
      cost: { days: 30 }, detail: `The opportunity at ${acc.name} (${acc.employees} people, ${acc.members.length} in the buying group) rests on one contact. Deals like this stall at the economic buyer or when that person leaves; the CRM deal starts with ${engaged} engaged stakeholder.`,
      lesson: 'Map the buying group and reach the champion, the economic buyer and a user before the first call.',
    });
  }
  return deal;
}

/** Carry the pre-deal committee map into the CRM deal's buying group (segments.js committeeEffect reads it). */
export function seedDealCommittee(state, acc, deal, primary) {
  const seg = getSegment(acc.segId);
  if (deal.committee) {
    for (const m of acc.members) {
      const c = m.contactId && contactById(state, m.contactId);
      if (c?.committee && deal.committee.members.includes(c.id) && m.replied === 'positive') { c.committee.engaged = true; c.committee.stance = 'support'; }
    }
    return deal.committee;
  }
  const ids = [];
  for (const m of acc.members) {
    if (m.ghost) continue;
    const c = memberContact(state, acc, m, { hidden: !m.found });
    if (!c) continue;
    c.committee = {
      dealId: deal.id, role: m.role, influence: m.influence, canBlock: m.canBlock, concerns: m.concerns, stance: m.replied === 'positive' ? 'support' : m.stance,
      engaged: m.replied === 'positive' || m.replied === 'neutral', addressed: m.replied === 'positive', discovered: m.found, primary: c.id === primary?.id, headcount: 1,
    };
    ids.push(c.id);
  }
  deal.committee = { segmentId: acc.segId, acv: acc.acv, members: ids, buyerIsUser: false, sampledDay: state.day, fromAbm: acc.id };
  if (seg) { deal.segmentId = seg.id; deal.method = { ...methodFor(seg, acc.acv, ids.length), known: {} }; }
  deal.abm = { accountId: acc.id, tier: acc.tier, threads: acc.members.filter((x) => x.touches > 0).length, engaged: acc.members.filter((x) => x.replied === 'positive').length };
  return deal.committee;
}

// ---------------------------------------------------------------------------
// Engagement score (what the player sees per account)
// ---------------------------------------------------------------------------

/** 0-100 from the last 30 days: signals (decayed), replies, distinct people engaged, meetings, ads awareness. */
export function accountEngagement(state, acc) {
  const a = ensureAbm(state);
  const sig = visibleSignals(state, acc.id).filter((s) => state.day - s.day <= 30 && !s.dismissed);
  const sigPts = sig.reduce((x, s) => x + 12 * signalStrength(state, s), 0);
  const sources = new Set(sig.filter((s) => signalStrength(state, s) > 0.25).map((s) => s.source)).size;
  const t = a.touches.filter((x) => x.accountId === acc.id && state.day - x.day <= 30 && x.outcome);
  const rep = t.reduce((x, y) => x + (y.outcome === 'positive' ? 30 : y.outcome === 'neutral' ? 10 : 0), 0);
  const people = acc.members.filter((m) => m.replied === 'positive' || m.replied === 'neutral').length;
  const score = clamp(Math.round(sigPts + rep + 12 * people + (acc.oppDealId ? 25 : 0) + 5 * awareness(state)), 0, 100);
  return { score, signals: sig.length, sources, people };
}

// ---------------------------------------------------------------------------
// Daily tick and monthly checks
// ---------------------------------------------------------------------------

function monthlyChecks(state) {
  const a = ensureAbm(state);
  if (dayOfMonth(state) !== 1) return;
  for (const [id, cur] of Object.entries(a.sources)) {
    if (!cur.on || cur.since == null || state.day - cur.since < 45) continue;
    const st = statFor(a, id);
    if (st.acted >= 12 && st.positives === 0) {
      logMistake(state, {
        functionId: 'signal_outreach', id: 'dead_source_kept', label: 'Kept paying for a signal source that produces nothing', app: 'crm', key: `deadsrc:${id}:${monthKey(state)}`, circles: true,
        cost: { usd: sourceMonthly(state, id), hours: +(st.acted * HOURS.message).toFixed(2) }, detail: `${SOURCES[id].label}: ${st.acted} signals acted on, 0 positive replies, still subscribed after ${state.day - cur.since} days.`,
        lesson: 'Log which signals turn into meetings and cancel the ones that do not.',
      });
    }
  }
}

/** Daily: signals happen (with lag), alerts arrive, replies land, opportunities open. Called from the CRM onDay. */
export function abmDay(state) {
  const a = state.apps?.crm?.abm;
  if (!a) return;
  monthlyChecks(state);
  manualWatch(state);
  genSignals(state);
  genJobChanges(state);
  deliverSignals(state);
  resolveReplies(state);
}

/** Summary numbers for the overview and tests. */
export function abmSummary(state) {
  const a = ensureAbm(state);
  const t = a.touches;
  const done = t.filter((x) => x.outcome);
  const positives = done.filter((x) => x.outcome === 'positive').length;
  const opps = a.accounts.filter((x) => x.oppDealId).length;
  return {
    targets: targets(state).length, byTier: [1, 2, 3].map((k) => targets(state).filter((x) => x.tier === k).length), touches: t.length, resolved: done.length, positives,
    replyRate: done.length ? positives / done.length : 0, opportunities: opps, hours: a.hours, burned: a.accounts.filter((x) => isAccountBurned(state, x)).length,
    meetingsPer10h: a.hours ? (opps / a.hours) * 10 : 0, suggested: a.accounts.filter((x) => x.status === 'suggested').length,
  };
}

export { FUNDING_LABEL };
