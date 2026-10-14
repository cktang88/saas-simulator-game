// Helpdesk (Zendesk/Intercom-style): tickets from real customers about what you actually shipped (and broke),
// priorities and SLAs, macros, a help center that deflects tickets, an AI support agent, CSAT, first-response
// time → churn, and Reviews & reputation (G2/Capterra/Trustpilot/app stores, FTC fake-review rule).
//
// Numbers: public/data/world.js SUPPORT / REVIEWS (docs/research/world-ops-support-life.md §2). Volumes and
// multipliers are [design] game estimates anchored on vendor benchmarks; never shown as measured facts.
//
// Coordination: state.apps.support.active = true once the Helpdesk is opened. From then on this app owns
// support load (People should skip its aggregate support-hours charge when it sees `active`).

import { html, mount, on, formData, toast } from '../core/ui.js';
import * as llmCore from '../core/llm.js';
import { REALISM } from '../core/llm.js';
import { ensure, notify } from '../core/state.js';
import { post } from '../core/bank.js';
import { activeSubs, trialingSubs, ensureStripe, cancel } from '../core/stripe.js';
import { ensureMarket, setModifier, shippedFeatures } from '../core/market.js';
import { enqueue } from '../core/jobs.js';
import { rng, poisson, chance, pick, stochRound, uid, fmtDate, pct, money, clamp, words, round2, isWeekend, dayOfWeek } from '../core/util.js';
import { productSlice, customersSlice } from './product/store.js';
import { worldEffect } from './marketworld/engine.js';
import { openBugHours } from './product/build.js';
import { staffTicketsPerWeek } from './people/support.js';
import { supportQuality } from './people/capacity.js';
import { MINUTES_PER_TICKET, MACRO_SPEEDUP, AI_ERROR_RATE, CSAT_RESPONSE_RATE, SLA_HOURS, expectedTickets, docsQuality, aiResolveShare, AI_INELIGIBLE, frtHours, frtChurnMult, csatFromFrt, csatP, PLATFORMS, REQUEST_CHANNELS, starsFor, happiness, reviewsMultiplier, FAKE_REVIEWS, articleHeuristic, replyQuality } from './support/model.js';
import { CATEGORIES, categoryWeights, drawCategory, fallbackTicket, TICKET_SCHEMA, REPLY_SCHEMA, REVIEW_SCHEMA, ARTICLE_SCHEMA, RESPONSE_SCHEMA, fallbackReview } from './support/tickets.js';

const CONCRETE_PER_DAY = 2; // max tickets written out in full each day; the rest are aggregated [design]
const CONCRETE_SHARE = 0.35; // [design] share of tickets that become full conversations
const AUTO_ANSWER_AFTER_DAYS = 2; // your daily block also gives a quick answer to conversations left this long [design]
const ABANDON_DAYS = 7; // unanswered tickets older than this are given up on [design]
const ORGANIC_REVIEWS_PER_ACCOUNT_MONTH = 0.005; // unprompted reviews [design]
const ARTICLE_HOURS = 1; // writing a help-center article ≈ 45–90 min [design]
const AI_AGENT = { perResolution: 0.99, monthlyMin: 50 }; // research hr-legal-product.md §1.1 [S]
const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low'];
const CONCRETE_ORDER = ['angry', 'outage', 'bug', 'billing', 'howto', 'account', 'feature'];

export const ensureSupport = (state) => {
  const s = ensure(state, 'support', () => ({}));
  s.active ??= false; s.queue ??= []; s.tickets ??= []; s.frtLog ??= []; s.csatLog ??= []; s.macros ??= []; s.articles ??= [];
  s.ai ??= { enabled: false, sinceDay: null, monthResolutions: 0 }; s.autoHoursPerDay ??= 1; s.daily ??= [];
  s.reviews ??= []; s.reviewRequests ??= []; s.pendingAngry ??= 0; s.fake ??= null;
  return s;
};

const llmOf = (ctx) => ctx.llm ?? llmCore;
const custOf = (state, id) => ensureStripe(state).customers.find((c) => c.id === id);
const subOf = (state, id) => ensureStripe(state).subscriptions.find((x) => x.id === id);
const peopleAi = (state) => (state.apps.people?.members ?? []).find((m) => m.agentType === 'support_ai' && m.status === 'active' && state.day >= (m.readyDay ?? m.startDay));
export const aiActive = (state) => Boolean(ensureSupport(state).ai.enabled || peopleAi(state));
const minutesPerTicket = (state, sup) => MINUTES_PER_TICKET[state.company.model] * (sup.macros.length >= 3 ? MACRO_SPEEDUP : 1);
// Today's incident from Product analytics. Accepts yesterday's if this app ran before Insights that day.
const outageToday = (state) => {
  const t = state.apps.insights?.today;
  if (!t || t.day < state.day - 1 || (t.day < state.day && t.helpdeskSeen)) return null;
  t.helpdeskSeen = true;
  return t;
};

function chargeFounder(state, hours, label) {
  const f = state.founder;
  const h = round2(Math.min(hours, Math.max(0, f.hoursPerWeek - f.hoursUsed)));
  if (h <= 0) return 0;
  f.hoursUsed += h;
  f.timeLog ??= [];
  f.timeLog.push({ day: state.day, hours: h, label });
  return h;
}

function staffPerDay(state) {
  const staff = (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.role === 'support' && m.status === 'active' && m.startDay <= state.day);
  return staff.reduce((a, m) => a + staffTicketsPerWeek(state.company.model) * ((m.hoursPerWeek ?? 40) / 40), 0) / 7;
}

// Work aggregate tickets oldest-first. Logs first-response times and CSAT survey responses.
// staff: { frtMult, csat, escalationRate } from People's supportQuality for hired support (null = founder).
function workQueue(state, sup, capacity, staff = null) {
  let left = capacity, done = 0;
  while (left >= 1 && sup.queue.length) {
    const item = sup.queue[0];
    const take = Math.min(item.n, Math.floor(left));
    if (take <= 0) break;
    item.n -= take; left -= take; done += take;
    const frt = frtHours(state.day - item.day) * (staff?.frtMult ?? 1);
    sup.frtLog.push({ day: state.day, frt, n: take });
    // Hired support: their CSAT relative to a median specialist (0.85) shifts satisfaction; escalations bounce to you.
    const staffAdj = staff?.csat != null ? staff.csat - 0.85 : 0;
    logCsat(state, sup, take, clamp(csatP({ frt, resolved: true, hard: 0.2, fit: ensureMarket(state).fit.product.score ?? 0.5 }) + staffAdj, 0.05, 0.98));
    if (staff?.escalationRate) {
      const esc = stochRound(state, take * staff.escalationRate * 0.5); // [design] half of escalations need you
      if (esc) sup.queue.push({ day: state.day, n: esc, escalated: true });
    }
    if (item.n <= 0) sup.queue.shift();
  }
  return done;
}

function logCsat(state, sup, n, pPositive) {
  const responses = stochRound(state, n * CSAT_RESPONSE_RATE);
  if (!responses) return;
  let positive = 0;
  for (let i = 0; i < responses; i++) if (chance(state, pPositive)) positive++;
  sup.csatLog.push({ day: state.day, responses, positive });
}

const weightedMedian = (pairs) => {
  const tot = pairs.reduce((a, p) => a + p.w, 0);
  if (!tot) return null;
  const s = pairs.slice().sort((a, b) => a.v - b.v);
  let acc = 0;
  for (const p of s) { acc += p.w; if (acc >= tot / 2) return p.v; }
  return s.at(-1).v;
};

export function frtMedian(state, sup, days = 14) {
  const pairs = sup.frtLog.filter((x) => x.day > state.day - days).map((x) => ({ v: x.frt, w: x.n }));
  for (const q of sup.queue) pairs.push({ v: (state.day - q.day) * 24 + 2, w: q.n });
  for (const t of sup.tickets) if (t.status === 'open' && t.firstResponseDay == null) pairs.push({ v: (state.day - t.createdDay) * 24 + 2, w: 1 });
  return weightedMedian(pairs);
}

export function csat30(state, sup) {
  const rows = sup.csatLog.filter((x) => x.day > state.day - 30);
  const r = rows.reduce((a, x) => a + x.responses, 0);
  return r ? rows.reduce((a, x) => a + x.positive, 0) / r : null;
}

// People's sim pushes aggregate tickets into state.apps.support.tickets when the array exists; this app
// generates its own at research rates, so drop those (they carry source 'people:volume' and no messages).
const purgeForeign = (sup) => { sup.tickets = sup.tickets.filter((t) => Array.isArray(t.messages)); };

function supportDay(state) {
  // The Helpdesk model takes over at the first paying customer, opened or not (review S1).
  if (!state.apps.support?.active) {
    if (!activeSubs(state).length) return;
    const sp = ensureSupport(state);
    sp.active = true; sp.activatedDay = state.day;
    notify(state, 'Your first paying customer: support tickets now land in the Helpdesk.', { type: 'info', app: 'helpdesk' });
  }
  const sup = ensureSupport(state);
  purgeForeign(sup);
  const model = state.company.model;
  const pslice = productSlice(state);
  const bugs = openBugHours(pslice);
  const out = outageToday(state);
  const feats = shippedFeatures(state);
  const accounts = activeSubs(state).map((s) => ({ ageDays: state.day - (custOf(state, s.customerId)?.createdDay ?? s.startDay), sub: s }));
  const trials = trialingSubs(state).length;
  const dq = docsQuality(sup.articles);
  const exp = expectedTickets({ model, accounts, trials, docsQuality: dq, releaseWeek: feats.some((f) => state.day - (f.shippedDay ?? -99) <= 7), outage: out?.severity ?? 0, statusPage: Boolean(out?.statusPosted) });
  const n = feats.length ? poisson(state, exp * (Number(worldEffect(state, 'ticketsMult')) || 1)) : 0;
  const weights = categoryWeights({ bugHours: bugs, outage: out?.severity ?? 0 });
  const counts = {};
  for (let i = 0; i < n; i++) { const c = drawCategory(() => rng(state), weights); counts[c] = (counts[c] ?? 0) + 1; }
  if (sup.pendingAngry > 0) { counts.angry = (counts.angry ?? 0) + sup.pendingAngry; sup.pendingAngry = 0; }

  // AI agent first (never billing, bugs, angry customers, outages).
  let aiResolved = 0, aiErr = 0;
  if (aiActive(state)) {
    sup.ai.sinceDay ??= state.day;
    const share = aiResolveShare(dq, (state.day - sup.ai.sinceDay) / 30);
    for (const [cat, c] of Object.entries(counts)) {
      if (AI_INELIGIBLE.has(cat)) continue;
      const r = Math.min(c, stochRound(state, c * share));
      counts[cat] -= r; aiResolved += r;
    }
    // World events (e.g. a model regression) add to the wrong-answer rate; worldEffect('errorRate') is 0 when neutral.
    aiErr = stochRound(state, aiResolved * clamp(AI_ERROR_RATE + (Number(worldEffect(state, 'errorRate')) || 0), 0, 0.6));
    aiResolved -= aiErr;
    sup.pendingAngry += aiErr; // wrong answers come back tomorrow as escalations
    if (aiResolved) { sup.frtLog.push({ day: state.day, frt: frtHours(0, { ai: true }), n: aiResolved }); logCsat(state, sup, aiResolved, csatP({ frt: 0.05, resolved: true, fit: ensureMarket(state).fit.product.score ?? 0.5 }) - 0.05); }
    sup.ai.monthResolutions += aiResolved;
    // Oversight: reviewing transcripts, fixing the docs it trips on (research: 1–3 h/week).
    if (dayOfWeek(state) === 1 && !peopleAi(state)) {
      const week = sup.daily.slice(-7).reduce((a, d) => a + d.new, 0);
      chargeFounder(state, clamp(1 + week / 200, 1, 3), 'AI support agent oversight');
    }
  }

  // A couple of tickets become real, written conversations; the rest join the aggregate queue.
  const subs = accounts.map((a) => a.sub);
  let concrete = 0;
  for (const cat of CONCRETE_ORDER) {
    if (concrete >= CONCRETE_PER_DAY || !subs.length) break;
    if (!(counts[cat] > 0)) continue;
    if (!chance(state, cat === 'angry' || cat === 'outage' ? 0.8 : CONCRETE_SHARE)) continue;
    counts[cat]--; concrete++;
    const sub = pick(state, subs);
    const openBugs = pslice.bugs.filter((b) => !b.fixedDay);
    enqueue(state, 'support:ticket', {
      customerId: sub.customerId, subId: sub.id, category: cat, priority: CATEGORIES[cat].priority, day: state.day,
      topic: cat === 'bug' && openBugs.length ? pick(state, openBugs).title : cat === 'outage' ? out?.cause : cat === 'feature' ? (customersSlice(state).panels[0]?.agg.mustHaves[0]?.text ?? null) : null,
      feature: feats.length ? pick(state, feats).title : null,
    }, { label: 'Support ticket' });
  }
  const rest = Object.values(counts).reduce((a, b) => a + Math.max(0, b), 0);
  if (rest > 0) sup.queue.push({ day: state.day, n: rest });

  // Support staff, then the founder's daily support block (weekdays), work the queue oldest-first.
  const q = supportQuality(state);
  let handled = workQueue(state, sup, staffPerDay(state), q.staff ? { frtMult: q.firstResponseMult, csat: q.csat, escalationRate: q.escalationRate } : null);
  if (!isWeekend(state) && sup.autoHoursPerDay > 0 && sup.queue.length) {
    const mins = minutesPerTicket(state, sup);
    const backlog = sup.queue.reduce((a, q) => a + q.n, 0);
    const need = Math.min(sup.autoHoursPerDay, (backlog * mins) / 60);
    const got = chargeFounder(state, need, 'Support inbox');
    handled += workQueue(state, sup, (got * 60) / mins + 1e-6);
  }
  if (isWeekend(state) && sup.weekendCheck && sup.queue.length) {
    const mins = minutesPerTicket(state, sup);
    const got = chargeFounder(state, 0.25, 'Support inbox (weekend check)');
    handled += workQueue(state, sup, (got * 60) / mins + 1e-6);
  }
  // Conversations nobody opened for a couple of days get a quick answer in the daily block.
  if (!isWeekend(state) && sup.autoHoursPerDay > 0) {
    for (const t of sup.tickets) {
      if (t.status !== 'open' || t.firstResponseDay != null || state.day - t.createdDay < AUTO_ANSWER_AFTER_DAYS) continue;
      if (!chargeFounder(state, MINUTES_PER_TICKET[model] / 60, 'Support inbox')) break;
      const frt = frtHours(state.day - t.createdDay);
      t.firstResponseDay = state.day;
      t.status = 'solved';
      t.autoAnswered = true;
      t.messages.push({ from: 'me', text: '(Quick answer from your daily support block.)', day: state.day });
      sup.frtLog.push({ day: state.day, frt, n: 1 });
      logCsat(state, sup, 1 / CSAT_RESPONSE_RATE, csatP({ frt, resolved: !['bug', 'outage'].includes(t.category), hard: ['bug', 'outage', 'angry'].includes(t.category) ? 1 : 0, fit: ensureMarket(state).fit.product.score ?? 0.5 }));
      handled++;
    }
  }

  // Abandoned tickets: customers give up (and some say so publicly).
  while (sup.queue.length && sup.queue[0].day <= state.day - ABANDON_DAYS) {
    const q = sup.queue.shift();
    sup.frtLog.push({ day: state.day, frt: ABANDON_DAYS * 24, n: q.n, abandoned: true });
    logCsat(state, sup, q.n, csatP({ frt: ABANDON_DAYS * 24, resolved: false, fit: ensureMarket(state).fit.product.score ?? 0.5 }) - 0.15);
    for (let i = 0; i < q.n; i++) if (chance(state, 0.03)) sup.angryReviews = (sup.angryReviews ?? 0) + 1;
  }
  for (const t of sup.tickets) {
    if (t.status !== 'open' || t.firstResponseDay != null || state.day - t.createdDay < ABANDON_DAYS) continue;
    t.status = 'abandoned';
    sup.frtLog.push({ day: state.day, frt: ABANDON_DAYS * 24, n: 1, abandoned: true });
    const sub = subOf(state, t.subId);
    if (sub?.status === 'active' && !sub.cancelAtPeriodEnd && chance(state, 0.2)) { cancel(state, sub.id, { atPeriodEnd: true, reason: 'felt_ignored' }); t.consequence = 'cancel_at_period_end'; }
    if (chance(state, 0.1)) sup.angryReviews = (sup.angryReviews ?? 0) + 1;
  }

  const blockCap = (sup.autoHoursPerDay * 60) / minutesPerTicket(state, sup);
  const waiting = sup.queue.reduce((a, q) => a + q.n, 0);
  if (waiting > 2 * Math.max(1, blockCap) && state.day - (sup.backlogWarnDay ?? -99) >= 7) {
    sup.backlogWarnDay = state.day;
    notify(state, `Support backlog: ${waiting} tickets waiting, more than 2 days of your ${sup.autoHoursPerDay} h/day support block. Raise the block, add the AI agent, or write help articles.`, { type: 'warn', app: 'helpdesk' });
  }
  const med = frtMedian(state, sup);
  sup.metrics = { firstResponseHours: med == null ? null : round2(med), medianFrtHours: med == null ? null : round2(med), csat: csat30(state, sup), day: state.day }; // read by People and Market
  ensureMarket(state);
  const mult = frtChurnMult(med);
  setModifier(state, 'churn', 'support-frt', accounts.length ? mult : 1);
  sup.daily.push({ day: state.day, new: n, ai: aiResolved, handled, backlog: sup.queue.reduce((a, q) => a + q.n, 0), frt: med });
  if (sup.daily.length > 120) sup.daily.shift();
  sup.frtLog = sup.frtLog.filter((x) => x.day > state.day - 60);
  sup.csatLog = sup.csatLog.filter((x) => x.day > state.day - 90);
  if (sup.tickets.length > 200) sup.tickets = sup.tickets.filter((t, i) => i < 150 || t.status === 'open');
  if (mult > 1.1 && state.day % 7 === 0) notify(state, `Support: median first response is ${Math.round(med)}h. Slow replies correlate with churn (×${mult}).`, { type: 'warn', app: 'helpdesk' });

  reviewsDay(state, sup, accounts);
}

// ---- Reviews ----

function happinessNow(state, sup, wonMoment = false) {
  return happiness({ productFit: ensureMarket(state).fit.product.score ?? 0.35, csat: csat30(state, sup) ?? 0.75, bugHours: openBugHours(productSlice(state)), wonMoment });
}

function addReview(state, sup, { rating, customerId = null, organic = true, fake = false, platform = null }) {
  const plats = PLATFORMS[state.company.model];
  const r = { id: uid('rev'), platform: platform ?? pick(state, plats), rating, customerId, day: state.day, organic, fake, title: '', text: '', response: null, removed: false };
  const feat = shippedFeatures(state)[0]?.title;
  Object.assign(r, fallbackReview(rating, { product: state.company.name, feature: feat }));
  sup.reviews.unshift(r);
  if (!fake && (sup.reviewJobsToday ?? 0) < 3) { enqueue(state, 'support:review', { reviewId: r.id }, { label: 'New review' }); sup.reviewJobsToday = (sup.reviewJobsToday ?? 0) + 1; }
  if (rating <= 2) notify(state, `New ${rating}★ review on ${r.platform}. Prospects read how you respond.`, { type: 'bad', app: 'helpdesk' });
  return r;
}

function reviewsDay(state, sup, accounts) {
  sup.reviewJobsToday = 0;
  // Requested reviews posting over the following days.
  for (const rq of sup.reviewRequests) {
    for (const p of rq.posts) {
      if (p.done || p.day > state.day) continue;
      p.done = true;
      addReview(state, sup, { rating: starsFor(happinessNow(state, sup, rq.won), rng(state)), customerId: p.customerId, organic: false });
    }
  }
  sup.reviewRequests = sup.reviewRequests.filter((rq) => rq.posts.some((p) => !p.done) || state.day - rq.day < 60);
  // Unprompted reviews skew to the extremes; angry customers are the most motivated writers.
  const organic = poisson(state, (accounts.length * ORGANIC_REVIEWS_PER_ACCOUNT_MONTH) / 30);
  for (let i = 0; i < organic; i++) {
    const h = happinessNow(state, sup) * (chance(state, 0.5) ? 0.6 : 1.1);
    addReview(state, sup, { rating: starsFor(h, rng(state)), customerId: accounts.length ? pick(state, accounts).sub.customerId : null });
  }
  while ((sup.angryReviews ?? 0) > 0) { sup.angryReviews--; addReview(state, sup, { rating: chance(state, 0.6) ? 1 : 2 }); }

  // Fake reviews: platforms remove most; detection brings a warning label and possibly the FTC.
  const fk = sup.fake;
  if (fk && !fk.closed) {
    for (const r of sup.reviews) if (r.fake && !r.removed && chance(state, FAKE_REVIEWS.platformRemoval / 60)) r.removed = true;
    if (!fk.detectedDay && chance(state, FAKE_REVIEWS.detectedPerYear / 365)) {
      fk.detectedDay = state.day;
      fk.warningUntil = state.day + FAKE_REVIEWS.warningDays;
      for (const r of sup.reviews) if (r.fake) r.removed = true;
      notify(state, 'A review platform detected your purchased reviews, removed them and put a "suspicious review activity" warning on your profile for 90 days.', { type: 'bad', app: 'helpdesk' });
      if (chance(state, FAKE_REVIEWS.ftcGivenDetected)) fk.ftcDay = state.day + 30 + Math.floor(rng(state) * 90);
    }
    if (fk.ftcDay && state.day >= fk.ftcDay && !fk.penalty) {
      const [lo, hi] = FAKE_REVIEWS.settlementShare;
      fk.penalty = Math.round(fk.n * FAKE_REVIEWS.penaltyPerViolation * (lo + (hi - lo) * rng(state)));
      post(state, { amount: -fk.penalty, counterparty: 'FTC settlement', description: `Civil penalty: ${fk.n} fake reviews (16 CFR Part 465)`, category: 'legal', method: 'wire' });
      notify(state, `The FTC fined ${state.company.name} ${money(fk.penalty)} for buying fake reviews (up to ${money(FAKE_REVIEWS.penaltyPerViolation)} per violation under the 2024 rule).`, { type: 'bad', app: 'helpdesk' });
      fk.closed = true;
    }
    if (!fk.ftcDay && fk.detectedDay && state.day > fk.warningUntil) fk.closed = true;
  }
  updateReviewModifier(state, sup);
}

export function updateReviewModifier(state, sup = ensureSupport(state)) {
  const rm = reviewsMultiplier(sup.reviews, state.company.model, state.day);
  const neg = sup.reviews.filter((r) => !r.removed && r.rating <= 3 && state.day - r.day <= 365);
  const responded = neg.filter((r) => (r.response?.quality ?? 0) >= 0.6).length;
  let mult = rm.mult * (neg.length >= 2 && responded / neg.length >= 0.5 ? 1.02 : 1); // [design] good public replies help a little
  if (sup.fake?.warningUntil && state.day <= sup.fake.warningUntil) mult *= FAKE_REVIEWS.warningLandingMult;
  ensureMarket(state);
  setModifier(state, 'landing', 'reviews', round2(mult));
  sup.reviewSummary = { ...rm, mult: round2(mult), day: state.day };
}

// ---- Jobs ----

async function ticketJob(ctx, p) {
  const state = ctx.state;
  const sup = ensureSupport(state);
  const c = custOf(state, p.customerId);
  if (!c) return;
  const feats = shippedFeatures(state).map((f) => f.title).join('; ');
  const res = await llmOf(ctx).ask({
    task: 'support_ticket',
    system: `${REALISM}\nYou are ${c.name}${c.company ? ` at ${c.company}` : ''}, a customer of ${state.company.name} (${state.company.oneLiner}). Its shipped features: ${feats}. You are writing to support. Be specific to your situation, short, no greeting padding.`,
    prompt: `Write a ${CATEGORIES[p.category].label} support ticket${p.topic ? ` about: ${p.topic}` : ''}${p.feature ? ` (related feature: ${p.feature})` : ''}. ${p.category === 'angry' ? 'The AI support bot gave you a wrong answer and you are annoyed.' : ''} 1–4 sentences.`,
    schema: TICKET_SCHEMA, temperature: 0.9, maxTokens: 250,
    fallback: () => fallbackTicket({ category: p.category, topic: p.topic, name: c.name, product: state.company.name, feature: p.feature }),
  });
  sup.tickets.unshift({ id: uid('tkt'), customerId: c.id, subId: p.subId, name: c.name, company: c.company, email: c.email, category: p.category, priority: p.priority, subject: res.data.subject, createdDay: p.day ?? state.day, status: 'open', firstResponseDay: null, messages: [{ from: 'them', text: res.data.body, day: p.day ?? state.day }], csat: null, mock: res.mock });
}

async function replyJob(ctx, p) {
  const state = ctx.state;
  const sup = ensureSupport(state);
  const t = sup.tickets.find((x) => x.id === p.ticketId);
  if (!t) return;
  const mine = t.messages.filter((m) => m.from === 'me').at(-1)?.text ?? '';
  const q = replyQuality(mine, t.category);
  const convo = t.messages.slice(-6).map((m) => `${m.from === 'me' ? 'SUPPORT' : 'YOU'}: ${m.text}`).join('\n');
  const waited = (t.firstResponseDay ?? state.day) - t.createdDay;
  const res = await llmOf(ctx).ask({
    task: 'support_reply',
    system: `${REALISM}\nYou are ${t.name}, a customer who opened a support ticket (${CATEGORIES[t.category].label}) with ${state.company.name}. ${waited >= 2 ? `You waited ${waited} days for a first reply.` : ''} Canned or vague answers frustrate you; a concrete fix, clear steps, a refund when owed, or an honest timeline satisfies you. Only say it's solved if the reply actually solves it.`,
    prompt: `${convo}\n\nReply in character and rate the support you got.`,
    schema: REPLY_SCHEMA, temperature: 0.7, maxTokens: 250,
    fallback: () => ({ reply: q >= 0.6 ? 'That worked, thanks.' : 'That doesn\'t really answer my question.', satisfied: clamp(q - (waited >= 2 ? 0.15 : 0), 0, 1), solved: q >= 0.6 && t.category !== 'feature' }),
  });
  const d = res.data;
  const sat = clamp(Number(d.satisfied) || 0, 0, 1);
  t.messages.push({ from: 'them', text: d.reply, day: state.day });
  t.satisfaction = sat;
  if (d.solved || sat >= 0.7) {
    t.status = 'solved';
    t.csat = Math.max(1, Math.min(5, Math.round(1 + 4 * sat)));
    sup.csatLog.push({ day: state.day, responses: 1, positive: t.csat >= 4 ? 1 : 0 });
    if (t.csat === 5) t.win = true;
    const sub = subOf(state, t.subId);
    if (sub?.cancelAtPeriodEnd && sub.cancelReason === 'felt_ignored') { sub.cancelAtPeriodEnd = false; sub.cancelReason = null; t.consequence = 'saved'; }
  } else {
    t.status = 'pending';
    if (sat < 0.3 && chance(state, 0.12)) sup.angryReviews = (sup.angryReviews ?? 0) + 1;
  }
}

async function reviewJob(ctx, p) {
  const state = ctx.state;
  const r = ensureSupport(state).reviews.find((x) => x.id === p.reviewId);
  if (!r) return;
  const feats = shippedFeatures(state);
  const res = await llmOf(ctx).ask({
    task: 'customer_review',
    system: `${REALISM}\nYou are a real ${state.company.model === 'b2c' ? 'app user' : 'business customer'} of ${state.company.name} (${state.company.oneLiner}) writing a ${r.rating}-star review on ${r.platform}. It does exactly this: ${feats.map((f) => `${f.title}: ${f.solution}`).join(' | ').slice(0, 800)}. Mention only things it actually does.`,
    prompt: `Write the review: a short title and 2–4 sentences consistent with ${r.rating} stars.`,
    schema: REVIEW_SCHEMA, temperature: 0.9, maxTokens: 250,
    fallback: () => fallbackReview(r.rating, { product: state.company.name, feature: feats[0]?.title }),
  });
  Object.assign(r, { title: res.data.title, text: res.data.text, mock: res.mock });
}

// ---- UI ----

const drafts = { reply: {}, article: { title: '', body: '' }, macro: { name: '', body: '' }, response: {} };
const slaState = (state, t) => {
  const hours = t.firstResponseDay != null ? frtHours(t.firstResponseDay - t.createdDay) : (state.day - t.createdDay) * 24 + 2;
  const limit = SLA_HOURS[t.priority];
  return { hours, limit, breached: hours > limit, done: t.firstResponseDay != null };
};
const prioTone = { urgent: 'bad', high: 'warn', normal: '', low: '' };

function headerStats(state, sup) {
  const med = frtMedian(state, sup);
  const cs = csat30(state, sup);
  const last30 = sup.daily.filter((d) => d.day > state.day - 30);
  const tot = last30.reduce((a, d) => a + d.new, 0), ai = last30.reduce((a, d) => a + d.ai, 0);
  const backlog = sup.queue.reduce((a, q) => a + q.n, 0) + sup.tickets.filter((t) => t.status === 'open').length;
  return html`<div class="stats">
    <div class="stat ${med != null && med > 24 ? 'bad' : med != null && med > 8 ? 'warn' : ''}"><div class="stat-label">Median first response</div><div class="stat-value">${med == null ? '—' : med < 1 ? `${Math.round(med * 60)}m` : `${Math.round(med)}h`}</div><div class="stat-sub">software median ~47 min · churn ×${frtChurnMult(med)}</div></div>
    <div class="stat ${cs != null && cs < 0.75 ? 'warn' : ''}"><div class="stat-label">CSAT (30d)</div><div class="stat-value">${cs == null ? '—' : pct(cs, 0)}</div><div class="stat-sub">good: 75–85%</div></div>
    <div class="stat ${backlog > 20 ? 'warn' : ''}"><div class="stat-label">Waiting</div><div class="stat-value">${backlog}</div><div class="stat-sub">${tot} new in 30d</div></div>
    <div class="stat"><div class="stat-label">AI resolved (30d)</div><div class="stat-value">${tot ? pct(ai / tot, 0) : '—'}</div><div class="stat-sub">${aiActive(state) ? 'agent on' : 'agent off'}</div></div>
  </div>`;
}

function inboxView(ctx, sup) {
  const s = ctx.state;
  const open = sup.tickets.filter((t) => t.status === 'open' || t.status === 'pending').sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || a.createdDay - b.createdDay);
  const closed = sup.tickets.filter((t) => !['open', 'pending'].includes(t.status)).slice(0, 15);
  const queued = sup.queue.reduce((a, q) => a + q.n, 0);
  const oldest = sup.queue[0] ? s.day - sup.queue[0].day : 0;
  const mins = minutesPerTicket(s, sup);
  const emails = customersSlice(s).feedback.filter((x) => x.status === 'open').length;
  const row = (t) => {
    const sla = slaState(s, t);
    return html`<tr class="clickable" data-tkt="${t.id}"><td><span class="badge ${prioTone[t.priority]}">${t.priority}</span></td><td><b>${t.subject}</b><div class="small muted">${t.name}${t.company ? `, ${t.company}` : ''} · ${CATEGORIES[t.category]?.label}</div></td>
      <td class="small">${fmtDate(s, t.createdDay)}</td><td><span class="badge ${sla.breached ? 'bad' : sla.done ? 'good' : ''}">${sla.done ? `replied ${Math.round(sla.hours)}h` : `${Math.round(sla.hours)}h / SLA ${sla.limit}h`}</span></td><td><span class="badge">${t.status}</span>${t.csat ? html` ${'★'.repeat(t.csat)}` : ''}</td></tr>`;
  };
  return html`
    ${headerStats(s, sup)}
    <div class="grid-2">
      <section class="panel">
        <h2>Routine queue <span class="badge ${oldest >= 2 ? 'warn' : ''}">${queued} waiting</span></h2>
        <p class="small muted">Most tickets are routine (how do I…, password resets, invoices). They wait here; support staff and your daily support block work them oldest-first at ~${Math.round(mins)} min each${sup.macros.length >= 3 ? ' (macros: −30%)' : ''}.${oldest ? ` Oldest: ${oldest} day(s).` : ''}</p>
        <form id="workForm" class="inline"><label>Work the queue <select name="hours">${[0.5, 1, 2, 4].map((h) => html`<option value="${h}">${h} h (~${Math.floor((h * 60) / mins)} tickets)</option>`)}</select></label><button class="primary" ${queued ? '' : 'disabled'}>Answer</button></form>
        ${(() => {
          const wk = sup.daily.filter((d) => d.day > s.day - 7);
          const needed = wk.reduce((a, d) => a + Math.max(0, d.new - d.ai), 0) * mins / 60;
          const spent = (s.founder.timeLog ?? []).filter((t) => t.day > s.day - 7 && /^Support/.test(t.label)).reduce((a, t) => a + t.hours, 0);
          return html`<p class="small"><b>Last 7 days:</b> ~${needed.toFixed(1)} h of tickets came in for humans; you spent ${spent.toFixed(1)} h on support.${needed > spent + 1 ? html` <span class="neg">The queue is growing.</span>` : ''}</p>`;
        })()}
        <label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="display:inline-block;margin:3px 0 0;flex:none" type="checkbox" id="weekendCheck" ${sup.weekendCheck ? 'checked' : ''} /> Check the inbox on weekends (15 min/day)</label>
        <label>Daily support block (weekdays) <select id="autoHours">${[0, 0.5, 1, 2, 3].map((h) => html`<option value="${h}" ${sup.autoHoursPerDay === h ? 'selected' : ''}>${h ? `${h} h/day` : 'Off'}</option>`)}</select></label>
        ${emails ? html`<p class="small"><a href="#/customers/feedback">${emails} customer email(s) waiting in Mail</a> (feature requests, cancellation replies).</p>` : ''}
      </section>
      <section class="panel">
        <h2>How this works</h2>
        <ul class="small">
          <li>Volume follows your active customers (×2–3 in their first month), releases, outages and bugs. Good help-center docs cut it ~30%.</li>
          <li>Each day a couple of tickets arrive as real conversations below. Reply like you would in Intercom; the customer answers and rates you.</li>
          <li>SLA targets (B2B practice): urgent 1h, high 4h, normal 12h, low 48h. Median first response sets a churn multiplier (game assumption; the evidence is correlational).</li>
        </ul>
      </section>
    </div>
    <section class="panel"><h2>Conversations</h2>
      ${open.length ? html`<div class="table-wrap"><table><thead><tr><th>Priority</th><th>Ticket</th><th>Opened</th><th>SLA</th><th>Status</th></tr></thead><tbody>${open.map(row)}</tbody></table></div>` : html`<p class="empty">Inbox zero.</p>`}
      ${closed.length ? html`<details><summary class="small">Recently closed (${closed.length})</summary><div class="table-wrap"><table><tbody>${closed.map(row)}</tbody></table></div></details>` : ''}
    </section>`;
}

function ticketView(ctx, sup, t) {
  const s = ctx.state;
  const sla = slaState(s, t);
  return html`<p><a href="#/helpdesk">← Inbox</a></p>
    <div class="grid-2">
      <section class="panel">
        <h2>${t.subject}</h2>
        <p class="small muted"><span class="badge ${prioTone[t.priority]}">${t.priority}</span> ${CATEGORIES[t.category]?.label} · ${t.name}${t.email ? ` <${t.email}>` : ''} · opened ${fmtDate(s, t.createdDay)} · <span class="${sla.breached ? 'neg' : ''}">${sla.done ? `first reply ${Math.round(sla.hours)}h` : `waiting ${Math.round(sla.hours)}h (SLA ${sla.limit}h)`}</span></p>
        <div class="chat">${t.messages.map((m) => html`<div class="msg ${m.from}">${m.text}</div>`)}</div>
        ${['open', 'pending'].includes(t.status) ? html`<form id="tktReply" style="margin-top:8px">
          ${sup.macros.length ? html`<label>Insert macro <select id="macroPick"><option value="">—</option>${sup.macros.map((m) => html`<option value="${m.id}">${m.name}</option>`)}</select></label>` : ''}
          <textarea id="tktText" rows="4" placeholder="Answer the actual question: steps, a fix, a refund, or an honest timeline.">${drafts.reply[t.id] ?? ''}</textarea>
          <div class="inline"><button class="primary">Send</button><button type="button" id="tktSolve">Mark solved</button><span class="hint">~6–30 min depending on length; macros are faster.</span></div></form>` : html`<p><span class="badge">${t.status}</span>${t.csat ? ` CSAT ${'★'.repeat(t.csat)}` : ''}${t.consequence === 'cancel_at_period_end' ? html` <span class="badge bad">customer canceled</span>` : ''}</p>`}
      </section>
      <section class="panel"><h2>Context</h2>
        <p class="small">Category guide: ${t.category === 'bug' ? 'acknowledge, give a workaround, and a date. Then fix it in Product.' : t.category === 'billing' ? 'check Payments; refund promptly when you owe it.' : t.category === 'angry' ? 'own the bad bot answer, fix their problem yourself.' : t.category === 'feature' ? 'ask what they are trying to do (the job), don\'t promise dates you can\'t keep.' : 'give exact steps, then write a help-center article so the next person doesn\'t need to ask.'}</p>
        <p class="small"><a href="#/product/build">Open bugs in Product</a> · <a href="#/stripe">Payments</a></p>
      </section>
    </div>`;
}

function kbView(ctx, sup) {
  const s = ctx.state;
  const dq = docsQuality(sup.articles);
  return html`<div class="grid-2">
    <section class="panel"><h2>Help center <span class="badge ${dq > 0.6 ? 'good' : ''}">docs quality ${pct(dq, 0)}</span></h2>
      <p class="small muted">Good articles deflect up to ~30% of tickets and raise the AI agent's resolution rate. Write the article you wish existed for your most common ticket.</p>
      <form id="artForm"><label>Title (the question customers ask) <input id="art-title" data-art="title" value="${drafts.article.title}" placeholder="How do I connect QuickBooks?" /></label>
        <label>Body <textarea id="art-body" data-art="body" rows="8" placeholder="1. Go to Settings → Integrations…">${drafts.article.body}</textarea></label>
        <button class="primary">Publish (${ARTICLE_HOURS} h)</button></form>
      ${sup.articles.length ? html`<ul class="list">${sup.articles.map((a) => html`<li><b>${a.title}</b> <span class="badge ${a.quality >= 0.6 ? 'good' : a.quality >= 0.35 ? 'warn' : 'bad'}">${pct(a.quality, 0)}</span> <button class="sm" data-del-art="${a.id}">Unpublish</button>${a.issues?.length ? html`<div class="small muted">${a.issues.join(' ')}</div>` : ''}</li>`)}</ul>` : ''}
    </section>
    <section class="panel"><h2>Macros (saved replies)</h2>
      <p class="small muted">With 3+ macros routine tickets take ~30% less time. Keep them specific; customers can smell a canned reply.</p>
      <form id="macroForm"><label>Name <input id="mac-name" data-mac="name" value="${drafts.macro.name}" placeholder="Reset invite email" /></label><label>Reply <textarea id="mac-body" data-mac="body" rows="4">${drafts.macro.body}</textarea></label><button>Save macro (10 min)</button></form>
      ${sup.macros.length ? html`<ul class="list small">${sup.macros.map((m) => html`<li><b>${m.name}</b>: ${m.body.slice(0, 120)} <button class="sm" data-del-mac="${m.id}">✕</button></li>`)}</ul>` : ''}
    </section></div>`;
}

function aiView(ctx, sup) {
  const s = ctx.state;
  const dq = docsQuality(sup.articles);
  const share = aiResolveShare(dq, sup.ai.sinceDay != null ? (s.day - sup.ai.sinceDay) / 30 : 0);
  const viaPeople = Boolean(peopleAi(s));
  const staff = staffPerDay(s);
  return html`<div class="grid-2">
    <section class="panel"><h2>AI support agent</h2>
      <p class="small">Fin-style agent at ~$${AI_AGENT.perResolution}/resolution (${AI_AGENT.monthlyMin}/mo minimum). Vendors claim 67–76%; case studies 42–50%; an independent SMB test measured 38%. Game: ${pct(share, 0)} of eligible tickets with your current docs (30–55% in year one, up to 55–70% when mature). It never handles billing disputes, bugs, outages or angry customers, and ~${pct(AI_ERROR_RATE, 0)} of its "resolutions" are confidently wrong and come back angry.</p>
      ${viaPeople ? html`<p class="callout small">An AI support agent is active via People; it is billed there.</p>` : html`<label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="display:inline-block;margin:3px 0 0;flex:none" type="checkbox" id="aiToggle" ${sup.ai.enabled ? 'checked' : ''} /> Turn on the AI agent (≈1–3 h/week of oversight is on you)</label>`}
      <p class="small muted">Resolutions this month: ${Math.round(sup.ai.monthResolutions)}.</p>
    </section>
    <section class="panel"><h2>Team</h2>
      <p class="small">Support staff capacity: ${staff ? `${Math.round(staff * 7)} tickets/week` : html`none: hire in <a href="#/people">People</a>`}. Your daily support block: ${sup.autoHoursPerDay} h on weekdays.</p>
      <p class="small muted">2016 advice: "hire support person #1 at ~100 customers". 2026: AI handles a share of tier-1, but the founder handles escalations far longer, and only ~10% of support orgs report mature AI deployments.</p>
    </section></div>`;
}

function reviewsView(ctx, sup) {
  const s = ctx.state;
  const sum = sup.reviewSummary ?? reviewsMultiplier(sup.reviews, s.company.model, s.day);
  const plats = PLATFORMS[s.company.model];
  const vis = sup.reviews.filter((r) => !r.removed);
  const chans = Object.entries(REQUEST_CHANNELS).filter(([, c]) => c.models.includes(s.company.model));
  const eligible = activeSubs(s).length;
  const wins = sup.tickets.filter((t) => t.win && s.day - t.createdDay < 60).length;
  return html`
    <div class="stats">
      <div class="stat"><div class="stat-label">Rating (12 mo)</div><div class="stat-value">${sum.rating == null ? '—' : `${sum.rating.toFixed(1)}★`}</div><div class="stat-sub">${sum.count} recent reviews</div></div>
      <div class="stat ${sum.mult < 1 ? 'warn' : 'good'}"><div class="stat-label">Landing conversion</div><div class="stat-value">×${(sup.reviewSummary?.mult ?? sum.mult).toFixed(2)}</div><div class="stat-sub">0 reviews ×0.8–0.9 · 5+ ×1.0 · 20+ ×1.05</div></div>
      <div class="stat"><div class="stat-label">AI answers cite you</div><div class="stat-value">${sum.aiMentions ? 'Yes' : 'Not yet'}</div><div class="stat-sub">51% of B2B buyers start in an AI chatbot (G2 2026)</div></div>
    </div>
    ${sup.fake?.warningUntil && s.day <= sup.fake.warningUntil ? html`<div class="callout bad">Review platforms show a "suspicious review activity" warning on your profile until ${fmtDate(s, sup.fake.warningUntil)}.</div>` : ''}
    <div class="grid-2">
      <section class="panel"><h2>Ask for reviews</h2>
        <p class="small muted">Best moments: after an aha, after a solved ticket with CSAT 5, at renewal/upgrade, ~90 days in. Incentives are legal only if disclosed and not conditioned on a positive rating (FTC rule, Oct 2024).</p>
        <form id="askForm">
          <label>Channel <select name="channel">${chans.map(([k, c]) => html`<option value="${k}">${c.label}: ${pct(c.rate[0], 0)}–${pct(c.rate[1], 0)} post${c.costPerReview ? `, $${c.costPerReview}/review` : ''}</option>`)}</select></label>
          <label>Who <select name="who"><option value="wins">Customers with a recent win (${wins} solved CSAT-5 tickets + 90-day customers)</option><option value="all">All ${eligible} active customers</option></select></label>
          <button class="primary" ${eligible ? '' : 'disabled'}>Send requests</button>
        </form>
      </section>
      <section class="panel"><h2>Shortcut offered by a "review growth" vendor</h2>
        <p class="small">"20 verified 5★ reviews on ${plats.join(', ')} for $${20 * FAKE_REVIEWS.vendorPrice}, delivered in a week."</p>
        <p class="small muted">Buying reviews is illegal under the FTC's 2024 rule (up to ${money(FAKE_REVIEWS.penaltyPerViolation)} per violation, indexed annually). Platforms remove ~7% of all submissions as fake, mostly automatically.</p>
        <button class="danger" id="buyFake" ${sup.fake ? 'disabled' : ''}>Buy 20 reviews ($${20 * FAKE_REVIEWS.vendorPrice})</button>
      </section>
    </div>
    <section class="panel"><h2>Reviews</h2>
      ${vis.length ? html`<ul class="list">${vis.slice(0, 30).map((r) => html`<li><div><b>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</b> ${r.title} <span class="small muted">· ${r.platform} · ${fmtDate(s, r.day)}${r.organic ? '' : ' · requested'}${r.fake ? ' · purchased' : ''}</span></div><div class="small">${r.text}</div>
        ${r.response ? html`<div class="small" style="margin-top:4px;padding-left:10px;border-left:2px solid var(--border)"><b>Your reply:</b> ${r.response.text} <span class="badge ${r.response.quality >= 0.6 ? 'good' : 'warn'}">${pct(r.response.quality, 0)}</span></div>`
          : r.rating <= 3 && !r.fake ? html`<form data-respond="${r.id}" class="inline" style="margin-top:4px"><label style="flex:3">Public reply <textarea rows="2" id="resp-${r.id}" data-resp="${r.id}">${drafts.response[r.id] ?? ''}</textarea></label><button class="sm">Post reply (15 min)</button></form>` : ''}</li>`)}</ul>` : html`<p class="empty">No reviews yet. With zero reviews, prospects convert worse.</p>`}
    </section>`;
}

export default {
  id: 'helpdesk',
  title: 'Helpdesk',
  icon: '🎧',
  group: 'Product',
  badge: (state) => (state.apps.support?.tickets ?? []).filter((t) => t.status === 'open').length || null,

  render(root, ctx) {
    const s = ctx.state;
    const sup = ensureSupport(s);
    if (!sup.active) { sup.active = true; sup.activatedDay = s.day; ctx.save(); }
    purgeForeign(sup);
    const param = ctx.params || 'inbox';
    const t = param.startsWith('tkt_') ? sup.tickets.find((x) => x.id === param) : null;
    const tab = t ? 'inbox' : ['inbox', 'kb', 'ai', 'reviews'].includes(param) ? param : 'inbox';
    const tabs = [['inbox', 'Inbox'], ['kb', 'Help center & macros'], ['ai', 'AI agent & team'], ['reviews', 'Reviews']];
    mount(root, html`
      <div class="app-head"><div><h1>Helpdesk</h1><p>Every customer question, bug report and billing problem lands here. How fast and how well you answer shows up in churn, CSAT and public reviews.</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => html`<a href="#/helpdesk/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${!shippedFeatures(s).length ? html`<div class="callout">No product shipped yet, so no tickets. Once customers use what you build, they will write in.</div>` : ''}
      ${t ? ticketView(ctx, sup, t) : tab === 'kb' ? kbView(ctx, sup) : tab === 'ai' ? aiView(ctx, sup) : tab === 'reviews' ? reviewsView(ctx, sup) : inboxView(ctx, sup)}`);

    on(root, 'click', '[data-tkt]', (e, el) => ctx.navigate('helpdesk', el.dataset.tkt));
    on(root, 'submit', '#workForm', (e) => {
      e.preventDefault();
      const h = Number(formData(e.target).hours) || 1;
      ctx.act((st) => { const sp = ensureSupport(st); const n = workQueue(st, sp, (h * 60) / minutesPerTicket(st, sp) + 1e-6); toast(`Answered ${n} routine ticket(s).`, 'good'); }, { hours: h, label: 'Support inbox' });
    });
    on(root, 'change', '#weekendCheck', (e, el) => ctx.act((st) => { ensureSupport(st).weekendCheck = el.checked; }));
    on(root, 'change', '#autoHours', (e, el) => ctx.act((st) => { ensureSupport(st).autoHoursPerDay = Number(el.value); }));
    on(root, 'change', '#aiToggle', (e, el) => ctx.act((st) => { const sp = ensureSupport(st); sp.ai.enabled = el.checked; if (el.checked) sp.ai.sinceDay ??= st.day; }, { hours: el.checked ? 1 : 0, label: 'AI support agent setup' }));

    if (t) {
      on(root, 'input', '#tktText', (e, el) => { drafts.reply[t.id] = el.value; });
      on(root, 'change', '#macroPick', (e, el) => {
        const m = sup.macros.find((x) => x.id === el.value);
        if (!m) return;
        const ta = root.querySelector('#tktText');
        ta.value = `${ta.value ? `${ta.value}\n` : ''}${m.body.replace(/\{name\}/g, String(t.name).split(' ')[0])}`;
        drafts.reply[t.id] = ta.value;
        drafts.reply[`${t.id}:macro`] = true;
      });
      on(root, 'submit', '#tktReply', (e) => {
        e.preventDefault();
        const body = String(drafts.reply[t.id] ?? '').trim();
        if (!body) return;
        const macro = drafts.reply[`${t.id}:macro`];
        const hours = macro ? 0.05 : Math.min(0.5, 0.1 + words(body) / 400);
        ctx.act((st) => {
          t.messages.push({ from: 'me', text: body, day: st.day });
          if (t.firstResponseDay == null) { t.firstResponseDay = st.day; ensureSupport(st).frtLog.push({ day: st.day, frt: frtHours(st.day - t.createdDay), n: 1 }); }
          drafts.reply[t.id] = ''; drafts.reply[`${t.id}:macro`] = false;
          ctx.enqueue('support:reply', { ticketId: t.id }, { label: `Reply from ${t.name}` });
        }, { hours, label: 'Support ticket' });
      });
      on(root, 'click', '#tktSolve', () => ctx.act(() => { t.status = 'solved'; }));
    }

    on(root, 'input', '[data-art]', (e, el) => { drafts.article[el.dataset.art] = el.value; });
    on(root, 'input', '[data-mac]', (e, el) => { drafts.macro[el.dataset.mac] = el.value; });
    on(root, 'input', '[data-resp]', (e, el) => { drafts.response[el.dataset.resp] = el.value; });
    on(root, 'submit', '#artForm', async (e) => {
      e.preventDefault();
      const a = { ...drafts.article };
      if (words(a.body) < 30 || !a.title.trim()) return toast('Write a real article: a question as the title and at least a few steps.', 'warn');
      const ok = await ctx.act(async (st) => {
        const feats = shippedFeatures(st);
        const res = await ctx.llm.panel({
          task: 'help_article_grade',
          system: 'You are a support lead reviewing a help-center article for a small SaaS. Judge whether a stuck customer could solve their problem with it alone: a real question as title, concrete numbered steps, matches the actual product, no marketing fluff.',
          prompt: `Product features: ${feats.map((f) => `${f.title}: ${f.solution}`).join(' | ').slice(0, 1200)}\n\nARTICLE TITLE: ${a.title}\n${a.body.slice(0, 5000)}`,
          schema: ARTICLE_SCHEMA, temperature: 0.2, maxTokens: 300, cache: st.cache,
          fallback: () => articleHeuristic(a, feats),
        });
        const q = res.reduce((x, r) => x + clamp(Number(r.data.quality) || 0, 0, 1), 0) / res.length;
        ensureSupport(st).articles.push({ id: uid('art'), title: a.title.trim(), body: a.body, quality: round2(q), issues: res[0].data.issues ?? [], day: st.day });
        return true;
      }, { hours: ARTICLE_HOURS, label: 'Help-center article' });
      if (ok) { drafts.article = { title: '', body: '' }; ctx.render(); }
    });
    on(root, 'click', '[data-del-art]', (e, el) => ctx.act((st) => { const sp = ensureSupport(st); sp.articles = sp.articles.filter((x) => x.id !== el.dataset.delArt); }));
    on(root, 'submit', '#macroForm', (e) => {
      e.preventDefault();
      const m = { ...drafts.macro };
      if (!m.name.trim() || words(m.body) < 8) return toast('Give the macro a name and a real reply.', 'warn');
      ctx.act((st) => { ensureSupport(st).macros.push({ id: uid('mac'), name: m.name.trim(), body: m.body }); drafts.macro = { name: '', body: '' }; }, { hours: 1 / 6, label: 'Support macro' });
    });
    on(root, 'click', '[data-del-mac]', (e, el) => ctx.act((st) => { const sp = ensureSupport(st); sp.macros = sp.macros.filter((x) => x.id !== el.dataset.delMac); }));

    on(root, 'submit', '#askForm', (e) => {
      e.preventDefault();
      const { channel, who } = formData(e.target);
      const ch = REQUEST_CHANNELS[channel];
      ctx.act((st) => {
        const sp = ensureSupport(st);
        const subs = activeSubs(st);
        const winIds = new Set(sp.tickets.filter((t2) => t2.win && st.day - t2.createdDay < 60).map((t2) => t2.customerId));
        const asked = who === 'wins' ? subs.filter((x) => winIds.has(x.customerId) || st.day - x.startDay >= 90) : subs;
        if (!asked.length) throw new Error('Nobody fits that group yet.');
        const won = who === 'wins';
        const posts = [];
        for (const x of asked) {
          const rate = ch.rate[0] + (ch.rate[1] - ch.rate[0]) * (won ? 0.8 : 0.3);
          if (chance(st, rate)) posts.push({ customerId: x.customerId, day: st.day + 1 + Math.floor(rng(st) * 10), done: false });
        }
        sp.reviewRequests.push({ id: uid('rq'), day: st.day, channel, asked: asked.length, won, posts });
        if (ch.costPerReview && posts.length) post(st, { amount: -ch.costPerReview * posts.length, counterparty: 'Gift cards', description: `Disclosed review incentive (${posts.length})`, category: 'marketing', method: 'card' });
        toast(`Asked ${asked.length} customer(s). Expect a few reviews over the next ~10 days.`, 'good');
      }, { hours: Math.max(0.25, ((REQUEST_CHANNELS[channel].minutesPerAsk ?? 1) * Math.min(activeSubs(s).length, 60)) / 60), label: 'Review requests' });
    });
    on(root, 'click', '#buyFake', () => {
      if (!confirm('Buy 20 fake 5-star reviews? This violates the FTC rule on fake reviews.')) return;
      ctx.act((st) => {
        const sp = ensureSupport(st);
        post(st, { amount: -20 * FAKE_REVIEWS.vendorPrice, counterparty: 'ReviewBoost Services', description: '20 reviews package', category: 'marketing', method: 'card' });
        sp.fake = { day: st.day, n: 20 };
        for (let i = 0; i < 20; i++) addReview(st, sp, { rating: 5, organic: false, fake: true });
        updateReviewModifier(st, sp);
      }, { hours: 0.25, label: 'Review vendor' });
    });
    on(root, 'submit', '[data-respond]', async (e, el) => {
      e.preventDefault();
      const id = el.dataset.respond;
      const text = String(drafts.response[id] ?? '').trim();
      if (words(text) < 10) return toast('Write a real reply (acknowledge, explain what changed, offer a fix).', 'warn');
      await ctx.act(async (st) => {
        const r = ensureSupport(st).reviews.find((x) => x.id === id);
        const res = await ctx.llm.ask({
          task: 'review_response_grade',
          system: `${REALISM}\nYou are a prospect reading a ${r.rating}-star review of ${st.company.name} and the company's public reply. Defensive, canned or argumentative replies look bad; owning the problem, specifics on what changed, and an offer to fix look good.`,
          prompt: `REVIEW: ${r.title}. ${r.text}\nCOMPANY REPLY: ${text}`,
          schema: RESPONSE_SCHEMA, temperature: 0.3, maxTokens: 200,
          fallback: () => ({ quality: replyQuality(text, 'review'), note: '' }),
        });
        r.response = { text, quality: round2(clamp(Number(res.data.quality) || 0, 0, 1)), day: st.day };
        drafts.response[id] = '';
        updateReviewModifier(st);
      }, { hours: 0.25, label: 'Review reply' });
    });
  },

  onDay: supportDay,

  onMonthEnd(state) {
    if (!state.apps.support?.active) return;
    const sup = ensureSupport(state);
    const res = Math.round(sup.ai.monthResolutions);
    if (peopleAi(state)) { const ps = state.apps.people?.support; if (ps) ps.monthResolutions = (ps.monthResolutions ?? 0) + res; }
    else if (sup.ai.enabled) post(state, { amount: -Math.max(AI_AGENT.monthlyMin, res) * AI_AGENT.perResolution, counterparty: 'Intercom', description: `Fin AI resolutions: ${res} (min ${AI_AGENT.monthlyMin})`, category: 'software', method: 'card' });
    sup.ai.monthResolutions = 0;
  },

  jobs: { 'support:ticket': ticketJob, 'support:reply': replyJob, 'support:review': reviewJob },
};
