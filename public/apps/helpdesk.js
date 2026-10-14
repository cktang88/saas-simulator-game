// Helpdesk (Zendesk/Intercom-style): tickets from real customers about what you actually shipped (and broke),
// priorities and SLAs, macros, a help center that deflects tickets, an AI support agent, CSAT, first-response
// time → churn, and Reviews & reputation (G2/Capterra/Trustpilot/app stores, FTC fake-review rule).
// AI agent (Intercom Fin-style, support/agent.js): content, scope, Procedures, handoff rules, batch tests,
// set live, weekly review with the honest metric (repeat contact within 72h), $0.99 per claimed resolution.
// Also: Slack Connect shared channels for B2B accounts (Plain/Pylon-style tiers and SLAs) and a status-page
// update during incidents. Operator reader + mistake log: support/operator.js.
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
import { activeSubs, trialingSubs, ensureStripe, cancel, refund, monthlyAmount } from '../core/stripe.js';
import { ensureMarket, setModifier, shippedFeatures } from '../core/market.js';
import { enqueue } from '../core/jobs.js';
import { rng, poisson, chance, pick, stochRound, uid, fmtDate, pct, money, clamp, words, round2, isWeekend, dayOfWeek, monthKey } from '../core/util.js';
import { productSlice, customersSlice } from './product/store.js';
import { worldEffect } from './marketworld/engine.js';
import { openBugHours } from './product/build.js';
import { staffTicketsPerWeek } from './people/support.js';
import { supportQuality } from './people/capacity.js';
import { MINUTES_PER_TICKET, MACRO_SPEEDUP, CSAT_RESPONSE_RATE, SLA_HOURS, expectedTickets, docsQuality, frtHours, frtChurnMult, csatFromFrt, csatP, PLATFORMS, REQUEST_CHANNELS, starsFor, happiness, reviewsMultiplier, FAKE_REVIEWS, articleHeuristic, replyQuality } from './support/model.js';
import { deflectTickets } from './automations/engine.js';
import { AI_PRICING, AI_HOURS, BATCH_SIZE, SIM_CAP, INTENTS, INTENT_IDS, HANDOFF_RULES, AFTERMATH, migrateAgent, inferIntent, articleStale, sourceArticles, coverage, configHash, isTested, hasHumanHandoff, reviewDrift, intentOdds, resolveConversation, claimedOutcome, drawIntent, agentMetrics, batchTest, procedureHeuristic, simulateProcedure, statusUpdateQuality } from './support/agent.js';
import { logSupportMistake, supportOperatorReader, themeCounts } from './support/operator.js';
import { CATEGORIES, categoryWeights, drawCategory, fallbackTicket, TICKET_SCHEMA, REPLY_SCHEMA, REVIEW_SCHEMA, ARTICLE_SCHEMA, RESPONSE_SCHEMA, fallbackReview } from './support/tickets.js';

const CONCRETE_PER_DAY = 2; // max tickets written out in full each day; the rest are aggregated [design]
const CONCRETE_SHARE = 0.35; // [design] share of tickets that become full conversations
const AUTO_ANSWER_AFTER_DAYS = 2; // your daily block also gives a quick answer to conversations left this long [design]
const ABANDON_DAYS = 7; // unanswered tickets older than this are given up on [design]
const ORGANIC_REVIEWS_PER_ACCOUNT_MONTH = 0.005; // unprompted reviews [design]
const ARTICLE_HOURS = 1; // writing a help-center article ≈ 45–90 min [design]
const AI_AGENT = AI_PRICING; // $0.99/resolution (d09 §1 pricing page), 50/month minimum [A]
// Slack Connect shared channels (Plain/Pylon practice: per-tier first-response targets; d09 §2). The game clock is
// in days, so a same-day Slack reply counts as ~1h [design]. Tier by account MRR [design].
export const SLACK = { setupHours: 0.25, weeklyMinutesPerChannel: 10, sla: { enterprise: 2, standard: 4 }, enterpriseMrr: 500, abandonCancel: 0.35, missingChannelChurn: 0.06 };
const PROCEDURE_INTENTS = INTENT_IDS.filter((k) => INTENTS[k].kind === 'procedure');
const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low'];
const CONCRETE_ORDER = ['angry', 'outage', 'bug', 'billing', 'howto', 'account', 'feature'];

export const ensureSupport = (state) => {
  const s = ensure(state, 'support', () => ({}));
  s.active ??= false; s.queue ??= []; s.tickets ??= []; s.frtLog ??= []; s.csatLog ??= []; s.macros ??= []; s.articles ??= [];
  s.ai ??= {}; migrateAgent(s.ai); s.autoHoursPerDay ??= 1; s.daily ??= [];
  s.reviews ??= []; s.reviewRequests ??= []; s.pendingAngry ??= 0; s.fake ??= null;
  s.pendingRepeat ??= {}; s.themeLog ??= []; s.channels ??= {}; s.statusUpdates ??= []; s.mistakeLog ??= []; s.mistakeKeys ??= {};
  for (const a of s.articles) a.intent ??= inferIntent(a.title);
  return s;
};

const llmOf = (ctx) => ctx.llm ?? llmCore;
const custOf = (state, id) => ensureStripe(state).customers.find((c) => c.id === id);
const subOf = (state, id) => ensureStripe(state).subscriptions.find((x) => x.id === id);
const peopleAi = (state) => (state.apps.people?.members ?? []).find((m) => m.agentType === 'support_ai' && m.status === 'active' && state.day >= (m.readyDay ?? m.startDay));
export const aiActive = (state) => Boolean(ensureSupport(state).ai.status === 'live' || peopleAi(state));
const statusQFor = (sup, out) => (out ? (sup.statusUpdates.find((u) => u.incidentId === out.id)?.q ?? (out.statusPosted ? 0.75 : 0)) : 0); // a generic template update ≈ 0.75 [design]
const agentCtx = (state, sup, out = null) => ({ articles: sup.articles, feats: shippedFeatures(state), statusQ: statusQFor(sup, out ?? state.apps.insights?.today), catWeights: categoryWeights({ bugHours: openBugHours(productSlice(state)) }), day: state.day });
const tierOf = (state, sub) => (sub && monthlyAmount(sub) >= SLACK.enterpriseMrr ? 'enterprise' : 'standard');
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
  const statusQ = statusQFor(sup, out);
  const exp = expectedTickets({ model, accounts, trials, docsQuality: dq, releaseWeek: feats.some((f) => state.day - (f.shippedDay ?? -99) <= 7), outage: out?.severity ?? 0, statusPage: out?.statusPosted ? statusQ : 0 });
  // Good onboarding emails (Automations app) pre-empt some how-to tickets; a no-op without that automation.
  const n = feats.length ? deflectTickets(state, poisson(state, exp * (Number(worldEffect(state, 'ticketsMult')) || 1)), minutesPerTicket(state, sup)) : 0;
  const weights = categoryWeights({ bugHours: bugs, outage: out?.severity ?? 0 });
  const counts = {};
  for (let i = 0; i < n; i++) { const c = drawCategory(() => rng(state), weights); counts[c] = (counts[c] ?? 0) + 1; }
  if (sup.pendingAngry > 0) { counts.angry = (counts.angry ?? 0) + sup.pendingAngry; sup.pendingAngry = 0; }
  checkIncidentComms(state, sup, out);

  // Every conversation has an intent (the question behind it): drives the KB-gap queue and the AI agent.
  const byCat = {}, themes = {};
  for (const [cat, c] of Object.entries(counts)) for (let i = 0; i < c; i++) { const k = drawIntent(() => rng(state), cat); themes[k] = (themes[k] ?? 0) + 1; (byCat[cat] ??= []).push(k); }
  sup.themeLog.push({ day: state.day, k: themes });
  sup.themeLog = sup.themeLog.filter((r) => r.day > state.day - 90);

  // AI agent first: in-scope conversations it resolves (or claims to), hands off, or gets wrong.
  processFallout(state, sup);
  let aiRow = null;
  if (aiActive(state)) aiRow = runAgent(state, sup, byCat, counts, { feats, out, accounts });
  const aiResolved = aiRow?.claimed ?? 0;
  // Customers who came back within 72h after a "resolution" skip the bot and go to a human.
  for (const [cat, c] of Object.entries(sup.pendingRepeat)) counts[cat] = (counts[cat] ?? 0) + c;
  sup.pendingRepeat = {};

  // A couple of tickets become real, written conversations; the rest join the aggregate queue.
  const subs = accounts.map((a) => a.sub);
  let concrete = 0;
  for (const cat of CONCRETE_ORDER) {
    if (concrete >= CONCRETE_PER_DAY || !subs.length) break;
    if (!(counts[cat] > 0)) continue;
    if (!chance(state, cat === 'angry' || cat === 'outage' ? 0.8 : CONCRETE_SHARE)) continue;
    counts[cat]--; concrete++;
    const slackSubs = subs.filter((x) => sup.channels[x.customerId]);
    const sub = slackSubs.length && chance(state, 0.5) ? pick(state, slackSubs) : pick(state, subs);
    const ch = sup.channels[sub.customerId];
    const openBugs = pslice.bugs.filter((b) => !b.fixedDay);
    enqueue(state, 'support:ticket', {
      customerId: sub.customerId, subId: sub.id, category: cat, priority: CATEGORIES[cat].priority, day: state.day,
      topic: cat === 'bug' && openBugs.length ? pick(state, openBugs).title : cat === 'outage' ? out?.cause : cat === 'feature' ? (customersSlice(state).panels[0]?.agg.mustHaves[0]?.text ?? null) : null,
      feature: feats.length ? pick(state, feats).title : null,
      channel: ch ? 'slack' : 'email', tier: ch ? tierOf(state, sub) : null,
    }, { label: ch ? 'Slack thread' : 'Support ticket' });
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
    const slack = t.channel === 'slack';
    if (sub?.status === 'active' && !sub.cancelAtPeriodEnd && chance(state, slack ? SLACK.abandonCancel : 0.2)) {
      cancel(state, sub.id, { atPeriodEnd: true, reason: 'felt_ignored' }); t.consequence = 'cancel_at_period_end';
      logSupportMistake(state, { trap: 'ticket_abandoned', customers: 1, delayed: true, estCost: monthlyAmount(sub) * 12, text: `${t.name}${t.company ? ` (${t.company})` : ''} waited ${ABANDON_DAYS} days ${slack ? 'in your shared Slack channel ' : ''}with no reply and cancelled: ~${money(monthlyAmount(sub))}/mo lost.` });
    } else if (slack) logSupportMistake(state, { trap: 'slack_ignored', key: `slack:${t.id}`, text: `A Slack Connect thread from ${t.company ?? t.name} went unanswered for a week; their whole team saw it.` });
    if (chance(state, 0.1)) sup.angryReviews = (sup.angryReviews ?? 0) + 1;
  }

  const blockCap = (sup.autoHoursPerDay * 60) / minutesPerTicket(state, sup);
  const waiting = sup.queue.reduce((a, q) => a + q.n, 0);
  const overloaded = waiting > 2 * Math.max(1, blockCap);
  // A warning that is still true a week later was ignored: that is the mistake, and abandoned tickets follow.
  if (overloaded && sup.backlogWarnDay != null && state.day - sup.backlogWarnDay === 7) {
    const arpa = accounts.length ? accounts.reduce((a, x) => a + monthlyAmount(x.sub), 0) / accounts.length : 0;
    const est = waiting * 0.2 * CONCRETE_SHARE * arpa * 12; // abandoned × 20% cancel × written share × a year of revenue [design]
    logSupportMistake(state, { trap: 'ignored_backlog', key: `backlog:${sup.backlogWarnDay}`, estCost: est, text: `Ignored a support backlog for a week (${waiting} tickets waiting). Tickets older than ${ABANDON_DAYS} days are abandoned and some of those customers cancel. Game estimate: ~${money(est)} of annual revenue at risk.` });
  }
  if (overloaded && state.day - (sup.backlogWarnDay ?? -99) >= 7) {
    sup.backlogWarnDay = state.day;
    notify(state, `Support backlog: ${waiting} tickets waiting, more than 2 days of your ${sup.autoHoursPerDay} h/day support block. Raise the block, write help articles for the top questions, or set up the AI agent properly.`, { type: 'warn', app: 'helpdesk' });
  }
  const med = frtMedian(state, sup);
  sup.metrics = { firstResponseHours: med == null ? null : round2(med), medianFrtHours: med == null ? null : round2(med), csat: csat30(state, sup), day: state.day }; // read by People and Market
  ensureMarket(state);
  const mult = frtChurnMult(med);
  setModifier(state, 'churn', 'support-frt', accounts.length ? mult : 1);
  sup.daily.push({ day: state.day, new: n, ai: aiResolved, aiTrue: aiRow?.resolved ?? 0, handled, backlog: sup.queue.reduce((a, q) => a + q.n, 0), frt: med });
  if (sup.daily.length > 120) sup.daily.shift();
  sup.frtLog = sup.frtLog.filter((x) => x.day > state.day - 60);
  sup.csatLog = sup.csatLog.filter((x) => x.day > state.day - 90);
  if (sup.tickets.length > 200) sup.tickets = sup.tickets.filter((t, i) => i < 150 || t.status === 'open');
  if (mult > 1.1 && state.day % 7 === 0) notify(state, `Support: median first response is ${Math.round(med)}h. Slow replies correlate with churn (×${mult}).`, { type: 'warn', app: 'helpdesk' });

  slackDay(state, sup, accounts);
  reviewsDay(state, sup, accounts);
}

// ---- AI agent day ----

// Runs today's conversations through the agent. Mutates counts (what is left for humans) and returns the log row.
function runAgent(state, sup, byCat, counts, { feats, out, accounts }) {
  const ai = sup.ai;
  if (ai.status !== 'live' && peopleAi(state)) {
    // Hired via People: the vendor seat goes live on whatever config the Helpdesk has (Fin's defaults if untouched).
    ai.status = 'live';
    ai.liveDay = state.day;
    if (!isTested(ai)) logSupportMistake(state, { trap: 'ai_live_untested', key: `untested:${ai.liveDay}`, text: 'The AI support agent went live (hired in People) without a batch test on sample questions: nobody knows which intents it gets wrong. Expect ~40% more confidently wrong answers until you test and fix them (game estimate).' });
  }
  ai.sinceDay ??= state.day; ai.liveDay ??= state.day;
  const ctx = { articles: sup.articles, feats, statusQ: statusQFor(sup, out) };
  const opts = { tested: isTested(ai), drift: reviewDrift(ai, state.day), monthsLive: (state.day - ai.liveDay) / 30, worldErr: Number(worldEffect(state, 'errorRate')) || 0 };
  const odds = {};
  const row = { day: state.day, seen: 0, involved: 0, claimed: 0, resolved: 0, wrong: 0, silent: 0, unresolved: 0, handoff: 0, outOfScope: 0, repeat: 0, csatResp: 0, csatPos: 0 };
  const subs = accounts.map((a) => a.sub);
  const fit = ensureMarket(state).fit.product.score ?? 0.5;
  let sampled = 0;
  for (const [cat, list] of Object.entries(byCat)) {
    for (const k of list) {
      row.seen++;
      if (ai.usageCap != null && ai.monthResolutions >= ai.usageCap) { row.outOfScope++; continue; } // hard usage limit: Fin stops
      const o = resolveConversation(() => rng(state), (odds[k] ??= intentOdds(ai, k, coverage(ai, k, ctx), opts)));
      if (o === 'out_of_scope') { row.outOfScope++; continue; }
      row.involved++;
      if (o === 'handoff' || o === 'stuck_handoff') { row.handoff++; continue; } // stays in counts: a human answers
      if (o === 'unresolved') { row.unresolved++; logCsatInto(state, sup, row, 1, 0.3); continue; } // "that didn't help": emails you
      counts[cat] = Math.max(0, (counts[cat] ?? 0) - 1);
      if (claimedOutcome(o)) { row.claimed++; ai.monthResolutions++; }
      const sub = subs.length ? pick(state, subs) : null;
      let repeat = false;
      if (o === 'resolved') {
        row.resolved++;
        repeat = chance(state, AFTERMATH.resolvedRepeat);
        if (k === 'refund' && sub) overRefund(state, sup, sub);
      } else if (o === 'wrong') {
        row.wrong++;
        repeat = chance(state, AFTERMATH.wrongReturnsAngry);
        ai.fallout.push({ id: uid('fo'), day: state.day, due: state.day + 1 + Math.floor(rng(state) * 2), intent: k, cat, customerId: sub?.customerId ?? null, subId: sub?.id ?? null, returns: repeat, caught: false, corrected: false });
      } else if (o === 'silent') {
        row.silent++;
        repeat = chance(state, AFTERMATH.silentRepeat);
        if (!repeat) {
          logCsatInto(state, sup, row, 1, 0.25); // gave up; some of them say so in the survey
          if (sub && sub.status === 'active' && !sub.cancelAtPeriodEnd && chance(state, AFTERMATH.silentChurn)) {
            cancel(state, sub.id, { atPeriodEnd: true, reason: 'ai_dead_end' });
            logSupportMistake(state, { trap: 'deflection_as_resolution', customers: 1, delayed: true, estCost: monthlyAmount(sub) * 12, text: `A customer asked the AI agent about "${INTENTS[k].label}", got no answer and no handoff, and cancelled. The dashboard still counted it as resolved.` });
          }
        }
      }
      if (repeat && o !== 'wrong') sup.pendingRepeat[cat] = (sup.pendingRepeat[cat] ?? 0) + 1;
      if (repeat) row.repeat++;
      if (o === 'resolved' && !repeat) logCsatInto(state, sup, row, 1, csatP({ frt: 0.05, resolved: true, fit }) - 0.05);
      if (sampled < 8 || o !== 'resolved') {
        sampled++;
        ai.convos.unshift({ id: uid('aic'), day: state.day, intent: k, outcome: o, repeat, customerId: sub?.customerId ?? null, reviewed: false, falloutId: o === 'wrong' ? ai.fallout.at(-1).id : null });
      }
    }
  }
  if (ai.convos.length > 80) ai.convos.length = 80;
  if (row.claimed) sup.frtLog.push({ day: state.day, frt: frtHours(0, { ai: true }), n: row.claimed });
  row.cost = round2(row.claimed * AI_AGENT.perResolution);
  ai.log.push(row);
  if (ai.log.length > 120) ai.log.shift();
  agentMistakes(state, sup);
  return row;
}

function logCsatInto(state, sup, row, n, p) {
  const before = sup.csatLog.length;
  logCsat(state, sup, n, p);
  for (const x of sup.csatLog.slice(before)) { row.csatResp += x.responses; row.csatPos += x.positive; }
}

// A refund Procedure that skips a condition refunds people it should not (wrong plan, outside the window).
function overRefund(state, sup, sub) {
  const proc = sup.ai.procedures.find((p) => p.intent === 'refund');
  if (!proc || !chance(state, (1 - proc.quality) * AFTERMATH.overRefundPerQualityGap)) return;
  const ch = ensureStripe(state).charges.filter((c) => c.customerId === sub.customerId && c.status === 'succeeded' && state.day - c.day <= 90).at(-1);
  if (!ch) return;
  const r = refund(state, ch.id);
  if (!r) return;
  logSupportMistake(state, { trap: 'procedure_over_refund', delayed: true, estCost: ch.amount, text: `The AI refund Procedure refunded ${money(ch.amount)} outside your policy (its conditions did not check the plan or the date). Test Procedures with simulations before going live.` });
}

// Wrong answers come due: an angry ticket and sometimes a cancellation, unless you caught and corrected it in review.
function processFallout(state, sup) {
  const ai = sup.ai;
  const due = ai.fallout.filter((f) => f.due <= state.day);
  if (!due.length) return;
  ai.fallout = ai.fallout.filter((f) => f.due > state.day);
  for (const f of due) {
    if (f.corrected) continue;
    if (f.returns) sup.pendingAngry++;
    const sub = f.subId ? subOf(state, f.subId) : null;
    const p = AFTERMATH.wrongChurn * (['refund', 'cancel', 'billing_dispute', 'human'].includes(f.intent) ? 2 : 1);
    if (sub && sub.status === 'active' && !sub.cancelAtPeriodEnd && chance(state, p)) {
      cancel(state, sub.id, { atPeriodEnd: true, reason: 'bad_ai_answer' });
      logSupportMistake(state, { trap: 'ai_wrong_answer', customers: 1, delayed: true, estCost: monthlyAmount(sub) * 12, text: `The AI agent confidently answered "${INTENTS[f.intent].label}" wrong; nobody caught it in review and the customer cancelled (~${money(monthlyAmount(sub))}/mo).` });
    }
  }
}

function agentMistakes(state, sup) {
  const ai = sup.ai;
  if (!hasHumanHandoff(ai)) logSupportMistake(state, { trap: 'no_handoff', key: `nohandoff:${ai.liveDay}:${Math.floor(state.day / 30)}`, text: 'The AI agent is live with no human handoff for frustrated customers or "talk to a person" requests. Stuck customers argue with the bot, then leave.' });
  if (state.day - Math.max(ai.lastReviewDay ?? -1e9, ai.liveDay) >= 21) logSupportMistake(state, { trap: 'ai_unreviewed', key: `unreviewed:${Math.floor(state.day / 30)}`, text: 'Three weeks with no review of AI conversations: wrong answers look like resolutions on the dashboard and are never corrected.' });
}

// Incident comms: an outage that passes without any status update is a mistake (support spike, churn bump).
function checkIncidentComms(state, sup, out) {
  const prev = sup.lastOutage;
  if (prev && prev.day < state.day) {
    const t = state.apps.insights?.today;
    const known = !t || t.id === prev.id; // a newer incident replaced Insights' record: we cannot tell, skip
    const posted = (t?.id === prev.id && t.statusPosted) || sup.statusUpdates.some((u) => u.incidentId === prev.id);
    if (known && !posted) logSupportMistake(state, { trap: 'silent_outage', key: `outage:${prev.id}`, text: `No status update during "${prev.cause}". Silence lets the support spike run (updates cut it to ~×0.6, game estimate) and customers assume the worst.` });
    sup.lastOutage = null;
  }
  if (out && out.severity > 0 && !out.statusPosted) sup.lastOutage = { id: out.id, day: state.day, cause: out.cause };
}

// ---- Slack Connect shared channels (B2B) ----

export const slackEligible = (state, sub) => state.company.model !== 'b2c' && (state.company.model === 'ent' || monthlyAmount(sub) >= SLACK.enterpriseMrr);

function slackDay(state, sup, accounts) {
  const live = new Set(accounts.map((a) => a.sub.customerId));
  for (const id of Object.keys(sup.channels)) if (!live.has(id)) delete sup.channels[id];
  const n = Object.keys(sup.channels).length;
  if (n && dayOfWeek(state) === 1) chargeFounder(state, (n * SLACK.weeklyMinutesPerChannel) / 60, 'Support: Slack Connect channels');
  // B2B buyers above the enterprise line expect a shared channel; accounts without one churn a little more [design].
  const big = accounts.filter((a) => slackEligible(state, a.sub) && tierOf(state, a.sub) === 'enterprise');
  const without = big.filter((a) => !sup.channels[a.sub.customerId]).length;
  setModifier(state, 'churn', 'support-slack', big.length ? round2(1 + SLACK.missingChannelChurn * (without / big.length)) : 1);
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
  sup.tickets.unshift({ id: uid('tkt'), customerId: c.id, subId: p.subId, name: c.name, company: c.company, email: c.email, category: p.category, priority: p.priority, subject: res.data.subject, createdDay: p.day ?? state.day, status: 'open', firstResponseDay: null, messages: [{ from: 'them', text: res.data.body, day: p.day ?? state.day }], csat: null, mock: res.mock, channel: p.channel ?? 'email', tier: p.tier ?? null, feature: p.feature ?? null });
}

// What a grounded reply can reference: the customer's own words, their name and company, the feature involved.
export const ticketFacts = (t) => ({
  ticketText: `${t.subject ?? ''} ${t.messages.filter((m) => m.from === 'them').map((m) => m.text).join(' ')}`,
  facts: [String(t.name ?? '').split(' ')[0], t.company, t.feature].filter((x) => x && String(x).length >= 3),
});

async function replyJob(ctx, p) {
  const state = ctx.state;
  const sup = ensureSupport(state);
  const t = sup.tickets.find((x) => x.id === p.ticketId);
  if (!t) return;
  const mine = t.messages.filter((m) => m.from === 'me').at(-1)?.text ?? '';
  const q = replyQuality(mine, t.category, ticketFacts(t));
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

const drafts = { reply: {}, article: { title: '', body: '', intent: '', editId: null }, macro: { name: '', body: '' }, response: {}, proc: { intent: 'refund', whenNot: '', steps: '', connector: 'payments' }, status: '' };
const monthKeyOf = (state) => monthKey(state);
const slaState = (state, t) => {
  const slack = t.channel === 'slack';
  const hours = t.firstResponseDay != null ? (slack && t.firstResponseDay === t.createdDay ? 1 : frtHours(t.firstResponseDay - t.createdDay)) : (state.day - t.createdDay) * 24 + 2;
  const limit = slack ? Math.min(SLA_HOURS[t.priority], SLACK.sla[t.tier ?? 'standard']) : SLA_HOURS[t.priority];
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
    <div class="stat"><div class="stat-label">AI "resolved" (30d)</div><div class="stat-value">${tot ? pct(ai / tot, 0) : '—'}</div><div class="stat-sub">${aiActive(state) ? html`agent live · <a href="#/helpdesk/ai">review</a>` : 'agent off'}</div></div>
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
    return html`<tr class="clickable" data-tkt="${t.id}"><td><span class="badge ${prioTone[t.priority]}">${t.priority}</span></td><td><b>${t.subject}</b>${t.channel === 'slack' ? html` <span class="badge accent">Slack</span>` : ''}<div class="small muted">${t.name}${t.company ? `, ${t.company}` : ''} · ${CATEGORIES[t.category]?.label}</div></td>
      <td class="small">${fmtDate(s, t.createdDay)}</td><td><span class="badge ${sla.breached ? 'bad' : sla.done ? 'good' : ''}">${sla.done ? `replied ${Math.round(sla.hours)}h` : `${Math.round(sla.hours)}h / SLA ${sla.limit}h`}</span></td><td><span class="badge">${t.status}</span>${t.csat ? html` ${'★'.repeat(t.csat)}` : ''}</td></tr>`;
  };
  return html`
    ${headerStats(s, sup)}
    ${statusCallout(ctx, sup)}
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
  const feats = shippedFeatures(s);
  const themes = themeCounts(sup, s.day, 30);
  const all = { ...sup.ai, sourceIds: null };
  const gaps = INTENT_IDS.filter((k) => INTENTS[k].kind !== 'human' && INTENTS[k].kind !== 'status' && (themes[k] ?? 0) > 0)
    .map((k) => ({ k, n: themes[k], cov: coverage(all, k, { articles: sup.articles, feats }) }))
    .filter((g) => g.cov < 0.5).sort((x, y) => y.n - x.n).slice(0, 6);
  const editing = drafts.article.editId ? sup.articles.find((x) => x.id === drafts.article.editId) : null;
  const intentSel = drafts.article.intent || inferIntent(drafts.article.title);
  return html`<div class="grid-2">
    <section class="panel"><h2>Help center <span class="badge ${dq > 0.6 ? 'good' : ''}">docs quality ${pct(dq, 0)}</span></h2>
      <p class="small muted">Good articles deflect up to ~30% of tickets and are what the AI agent answers from. Write the article you wish existed for your most common ticket; update it when you ship changes.</p>
      <form id="artForm"><label>Title (the question customers ask) <input id="art-title" data-art="title" value="${drafts.article.title}" placeholder="How do I connect QuickBooks?" /></label>
        <label>Answers which question? <select data-art="intent">${INTENT_IDS.filter((k) => INTENTS[k].kind !== 'human').map((k) => html`<option value="${k}" ${intentSel === k ? 'selected' : ''}>${INTENTS[k].label}</option>`)}</select></label>
        <label>Body <textarea id="art-body" data-art="body" rows="8" placeholder="1. Go to Settings → Integrations…">${drafts.article.body}</textarea></label>
        <button class="primary">${editing ? `Update "${editing.title}" (${Math.round(AI_HOURS.articleUpdate * 60)} min)` : `Publish (${ARTICLE_HOURS} h)`}</button>${editing ? html` <button type="button" class="sm" id="artCancel">Cancel edit</button>` : ''}</form>
      ${sup.articles.length ? html`<ul class="list">${sup.articles.map((a) => html`<li><b>${a.title}</b> <span class="small muted">${INTENTS[a.intent]?.label ?? ''}</span> <span class="badge ${a.quality >= 0.6 ? 'good' : a.quality >= 0.35 ? 'warn' : 'bad'}">${pct(a.quality, 0)}</span>${articleStale(a, feats) ? html` <span class="badge bad">stale: shipped since</span>` : ''} <button class="sm" data-edit-art="${a.id}">Edit</button> <button class="sm" data-del-art="${a.id}">Unpublish</button>${a.issues?.length ? html`<div class="small muted">${a.issues.join(' ')}</div>` : ''}</li>`)}</ul>` : ''}
    </section>
    <section class="panel"><h2>Unanswered themes (30 days)</h2>
      <p class="small muted">Question themes from your tickets with no solid, current article. This is where articles pay off.</p>
      ${gaps.length ? html`<ul class="list small">${gaps.map((g) => html`<li><b>${INTENTS[g.k].label}</b>: ${g.n} ticket(s) · coverage <span class="badge ${g.cov >= 0.3 ? 'warn' : 'bad'}">${pct(g.cov, 0)}</span> <span class="muted">e.g. "${INTENTS[g.k].q}"</span></li>`)}</ul>` : html`<p class="empty">No gaps in the themes customers asked about.</p>`}
      <h2>Macros (saved replies)</h2>
      <p class="small muted">With 3+ macros routine tickets take ~30% less time. Keep them specific; customers can smell a canned reply.</p>
      <form id="macroForm"><label>Name <input id="mac-name" data-mac="name" value="${drafts.macro.name}" placeholder="Reset invite email" /></label><label>Reply <textarea id="mac-body" data-mac="body" rows="4">${drafts.macro.body}</textarea></label><button>Save macro (10 min)</button></form>
      ${sup.macros.length ? html`<ul class="list small">${sup.macros.map((m) => html`<li><b>${m.name}</b>: ${m.body.slice(0, 120)} <button class="sm" data-del-mac="${m.id}">✕</button></li>`)}</ul>` : ''}
    </section></div>`;
}

function channelsView(ctx, sup) {
  const s = ctx.state;
  const subs = activeSubs(s).filter((x) => slackEligible(s, x));
  const rows = subs.map((x) => ({ sub: x, c: custOf(s, x.customerId), ch: sup.channels[x.customerId], tier: tierOf(s, x) })).sort((a, b) => monthlyAmount(b.sub) - monthlyAmount(a.sub));
  const threads = sup.tickets.filter((t) => t.channel === 'slack').slice(0, 15);
  return html`<div class="grid-2">
    <section class="panel"><h2>Shared Slack channels</h2>
      <p class="small muted">Plain/Pylon-style B2B support: each Slack Connect message becomes a tracked thread with a per-tier first-response target (enterprise ${SLACK.sla.enterprise}h, standard ${SLACK.sla.standard}h). Customers above ${money(SLACK.enterpriseMrr)}/mo expect one. Each channel costs ~${SLACK.weeklyMinutesPerChannel} min/week, and an ignored thread is seen by their whole team.</p>
      ${rows.length ? html`<div class="table-wrap"><table class="small"><thead><tr><th>Account</th><th>MRR</th><th>Tier</th><th></th></tr></thead><tbody>${rows.slice(0, 40).map((r) => html`<tr><td>${r.c?.company ?? r.c?.name ?? r.sub.customerId}</td><td>${money(monthlyAmount(r.sub))}</td><td>${r.tier}</td><td>${r.ch ? html`<span class="badge good">channel open</span> <button class="sm" data-close-ch="${r.sub.customerId}">Close</button>` : html`<button class="sm" data-open-ch="${r.sub.customerId}">Open channel (15 min)</button>`}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No B2B accounts large enough for a shared channel yet.</p>`}
    </section>
    <section class="panel"><h2>Recent Slack threads</h2>
      ${threads.length ? html`<ul class="list small">${threads.map((t) => { const sla = slaState(s, t); return html`<li><a href="#/helpdesk/${t.id}">${t.subject}</a> · ${t.company ?? t.name} <span class="badge ${sla.breached ? 'bad' : sla.done ? 'good' : ''}">${sla.done ? `replied ${Math.round(sla.hours)}h` : `${Math.round(sla.hours)}h / ${sla.limit}h`}</span></li>`; })}</ul>` : html`<p class="empty">No threads yet.</p>`}
    </section></div>`;
}

function statusCallout(ctx, sup) {
  const s = ctx.state;
  const t = s.apps.insights?.today;
  if (!t || t.day < s.day - 1) return '';
  const mine = sup.statusUpdates.find((u) => u.incidentId === t.id);
  if (t.statusPosted || mine) return html`<div class="callout small"><b>Incident:</b> ${t.cause}. Status update posted${mine ? html` <span class="badge ${mine.q >= 0.7 ? 'good' : 'warn'}">clarity ${pct(mine.q, 0)}</span>` : ''}.</div>`;
  return html`<div class="callout bad"><b>Incident:</b> ${t.cause}. Customers are writing in. Post a status update: what is affected, what you are doing, when the next update comes.
    <form id="statusForm" style="margin-top:6px"><textarea data-status rows="3" placeholder="Investigating: report exports are failing for all workspaces since 09:10 UTC. We have identified a bad deploy and are rolling it back. No data is lost. Next update by 11:00 UTC.">${drafts.status}</textarea><button class="sm primary">Post to status page (15 min)</button></form></div>`;
}

const pctOr = (x) => (x == null ? '—' : pct(x, 0));
const OUTCOME_LABEL = { resolved: ['Correct', 'good'], wrong: ['Confidently wrong', 'bad'], silent: ['No answer, customer went quiet (billed)', 'warn'], unresolved: ['Said it did not help, emailed you', 'warn'], handoff: ['Handed off', ''], stuck_handoff: ['Handed off after 2 tries', ''] };

function aiView(ctx, sup) {
  const s = ctx.state;
  const ai = sup.ai;
  const viaPeople = Boolean(peopleAi(s));
  const staff = staffPerDay(s);
  const actx = agentCtx(s, sup);
  const themes = themeCounts(sup, s.day, 30);
  const tested = isTested(ai);
  const last = ai.tests[0];
  const m = agentMetrics(ai.log, s.day, 30);
  const weeks = [0, 1, 2, 3].map((w) => ({ w, m: agentMetrics(ai.log.filter((r) => r.day <= s.day - 7 * w), s.day - 7 * w, 7) }));
  const live = ai.status === 'live' || viaPeople;
  const statusBadge = live ? html`<span class="badge good">live</span>` : ai.status === 'paused' ? html`<span class="badge warn">paused</span>` : ai.status === 'draft' ? html`<span class="badge">draft</span>` : html`<span class="badge">off</span>`;
  const simLeft = SIM_CAP - (ai.sims.month === monthKeyOf(s) ? ai.sims.runs : 0);
  const reviewable = ai.convos.filter((c) => !c.reviewed && s.day - c.day <= 14);
  const reviewed = ai.convos.filter((c) => c.reviewed).slice(0, 25);
  const pending = new Map(ai.fallout.map((f) => [f.id, f]));
  const srcIds = ai.sourceIds;
  return html`
    <div class="stats">
      <div class="stat"><div class="stat-label">Agent</div><div class="stat-value">${statusBadge}</div><div class="stat-sub">${tested ? 'tested on current setup' : html`<span class="neg">not tested on current setup</span>`}</div></div>
      <div class="stat"><div class="stat-label">Resolution rate (vendor view)</div><div class="stat-value">${pctOr(m.claimedRate)}</div><div class="stat-sub">counts silent customers as resolved</div></div>
      <div class="stat ${m.repeatRate != null && m.repeatRate > 0.2 ? 'bad' : m.repeatRate != null && m.repeatRate > 0.12 ? 'warn' : ''}"><div class="stat-label">Came back within 72h</div><div class="stat-value">${pctOr(m.repeatRate)}</div><div class="stat-sub">of "resolved" conversations</div></div>
      <div class="stat"><div class="stat-label">Resolved, no repeat in 72h</div><div class="stat-value">${pctOr(m.honestRate)}</div><div class="stat-sub">${m.claimed} billed · ${money(m.claimed * AI_AGENT.perResolution)} (30d)</div></div>
    </div>
    <div class="callout small">Benchmarks: vendors report 66–76% resolution (Intercom / AI Agent Index, vendor-reported); practitioners report ~41% median tier-1 automation and ~59% top quartile; an independent 60-day test on small clients measured 38%. Vendors count a conversation as resolved when the customer goes quiet, so the repeat-contact rate is the number to manage. Per-intent rates in this game are estimates.</div>
    <div class="grid-2">
      <section class="panel"><h2>1. Content</h2>
        <p class="small muted">Articles the agent may answer from. Stale = written before a later release; it will describe the old UI.</p>
        ${sup.articles.length ? html`<ul class="list small">${sup.articles.map((a) => { const on = srcIds == null || srcIds.includes(a.id); const st = articleStale(a, actx.feats); return html`<li><label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="display:inline-block;margin:3px 0 0;flex:none" type="checkbox" data-src="${a.id}" ${on ? 'checked' : ''} /> <span><b>${a.title}</b> · ${INTENTS[a.intent]?.label ?? '—'} <span class="badge ${a.quality >= 0.6 ? 'good' : a.quality >= 0.35 ? 'warn' : 'bad'}">${pct(a.quality, 0)}</span>${st ? html` <span class="badge bad">stale</span>` : ''}</span></label></li>`; })}</ul>` : html`<p class="empty">No help articles yet. Without content the agent improvises. <a href="#/helpdesk/kb">Write articles</a>.</p>`}
      </section>
      <section class="panel"><h2>2. Scope</h2>
        <p class="small muted">Which questions it may answer (Fin's default is everything). Coverage = how well your content answers that intent.</p>
        <div class="table-wrap"><table class="small"><thead><tr><th></th><th>Intent</th><th>30d</th><th>Coverage</th><th>Last test</th></tr></thead><tbody>
          ${INTENT_IDS.map((k) => { const it = INTENTS[k]; const cov = coverage(ai, k, actx); const b = last?.byIntent?.[k]; return html`<tr><td><input type="checkbox" data-scope="${k}" ${ai.scope[k] ? 'checked' : ''} /></td><td>${it.label}${it.kind === 'human' ? html` <span class="badge warn">needs a human</span>` : it.kind === 'procedure' ? html` <span class="badge">procedure</span>` : ''}</td><td>${themes[k] ?? 0}</td><td><span class="badge ${it.kind === 'human' ? '' : cov >= 0.6 ? 'good' : cov >= 0.3 ? 'warn' : 'bad'}">${it.kind === 'human' ? '—' : pct(cov, 0)}</span></td><td>${b ? html`<span class="${b.poor ? 'neg' : ''}">${b.good}/${b.acceptable}/${b.poor}</span>` : '—'}</td></tr>`; })}
        </tbody></table></div>
        <p class="small muted">Test column: Good / Acceptable / Poor.</p>
      </section>
    </div>
    <div class="grid-2">
      <section class="panel"><h2>3. Handoff rules</h2>
        <p class="small muted">Handoffs land in your inbox (they cost your time, not money). The first three ship on by default.</p>
        ${Object.entries(HANDOFF_RULES).map(([k, r]) => html`<label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="display:inline-block;margin:3px 0 0;flex:none" type="checkbox" data-handoff="${k}" ${ai.handoff[k] ? 'checked' : ''} /> ${r.label}</label>`)}
        ${!hasHumanHandoff(ai) ? html`<p class="callout bad small">No human handoff: frustrated customers will be stuck with the bot.</p>` : ''}
        <label>Hard usage limit (resolutions/month) <input id="usageCap" type="number" min="0" step="10" value="${ai.usageCap ?? ''}" placeholder="none" /></label>
      </section>
      <section class="panel"><h2>4. Procedures</h2>
        <p class="small muted">Multi-step jobs the agent can actually do, like a refund through the Payments connector. Without one it can only talk about the policy. Simulations: ${simLeft}/${SIM_CAP} runs left this month.</p>
        ${ai.procedures.length ? html`<ul class="list small">${ai.procedures.map((p) => html`<li><b>${p.name}</b> · ${INTENTS[p.intent].label} <span class="badge ${p.quality >= 0.6 ? 'good' : p.quality >= 0.35 ? 'warn' : 'bad'}">${pct(p.quality, 0)}</span> ${p.sim ? html`<span class="badge ${p.simPassed ? 'good' : 'bad'}">sim ${p.sim.passed}/${p.sim.runs}</span>` : html`<span class="badge">not simulated</span>`}
          <button class="sm" data-simulate="${p.id}" ${simLeft >= 10 ? '' : 'disabled'}>Run 10 simulations (15 min)</button> <button class="sm" data-del-proc="${p.id}">✕</button>${p.issues?.length ? html`<div class="muted">${p.issues.join(' ')}</div>` : ''}</li>`)}</ul>` : ''}
        <form id="procForm">
          <label>For <select name="intent">${PROCEDURE_INTENTS.map((k) => html`<option value="${k}" ${drafts.proc.intent === k ? 'selected' : ''}>${INTENTS[k].label}</option>`)}</select></label>
          <label>When NOT to use <input data-proc="whenNot" value="${drafts.proc.whenNot}" placeholder="Disputes or chargebacks; annual plans; accounts over $500/mo" /></label>
          <label>Steps (one per line) <textarea data-proc="steps" rows="5" placeholder="1. Look up the subscription with @Payments\n2. If the last charge is within 14 days and the plan is monthly, refund it and confirm\n3. Otherwise explain the policy and offer a pause\n4. If the customer disputes it, hand off to a human">${drafts.proc.steps}</textarea></label>
          <label>Data connector <select name="connector"><option value="payments" ${drafts.proc.connector === 'payments' ? 'selected' : ''}>Payments (look up and refund)</option><option value="" ${drafts.proc.connector === '' ? 'selected' : ''}>None</option></select></label>
          <button>Save procedure (${Math.round(AI_HOURS.procedure * 60)} min)</button>
        </form>
      </section>
    </div>
    <div class="grid-2">
      <section class="panel"><h2>5. Test</h2>
        <p class="small muted">Batch test: ${BATCH_SIZE} sample questions drawn from your ticket mix, each answer rated Good / Acceptable / Poor. Free; reading the answers takes you ~${AI_HOURS.batchTest} h. Re-test after changing scope, content, handoffs or procedures.</p>
        <button class="primary" id="aiTest">Run batch test (${AI_HOURS.batchTest} h)</button>
        ${last ? html`<p class="small" style="margin-top:8px"><b>${fmtDate(s, last.day)}:</b> ${last.good} good · ${last.acceptable} acceptable · <span class="${last.poor ? 'neg' : ''}">${last.poor} poor</span> of ${last.n}${last.hash !== configHash(ai) ? html` <span class="badge warn">setup changed since</span>` : ''}</p>
          ${last.examples.length ? html`<ul class="list small">${last.examples.map((e) => html`<li><b>${INTENTS[e.intent].label}</b>: "${e.q}" <span class="badge bad">poor</span><div class="muted">${e.why}</div></li>`)}</ul>` : ''}` : ''}
      </section>
      <section class="panel"><h2>6. Go live</h2>
        ${viaPeople ? html`<p class="callout small">An AI support agent hired in People runs on this setup; it is billed there.</p>` : html`
          <p class="small">$${AI_AGENT.perResolution} per resolution the vendor counts (including customers who just went quiet), ${AI_AGENT.monthlyMin}/month minimum while live.</p>
          ${ai.status === 'off' ? html`<button class="primary" id="aiDraft">Set up the agent (${Math.round(AI_HOURS.configure * 60)} min)</button>` : ''}
          ${ai.status === 'draft' || ai.status === 'paused' ? html`<button class="primary" id="aiLive">Set live (${Math.round(AI_HOURS.goLive * 60)} min)</button>` : ''}
          ${ai.status === 'live' ? html`<button id="aiPause">Pause the agent</button>` : ''}`}
        <p class="small muted">Resolutions billed this month: ${Math.round(ai.monthResolutions)}.</p>
      </section>
    </div>
    ${ai.liveDay != null ? html`<section class="panel"><h2>7. Weekly review</h2>
      <p class="small">Last review: ${ai.lastReviewDay == null ? html`<span class="neg">never</span>` : `${s.day - ai.lastReviewDay} day(s) ago`}. ${reviewable.length} conversation(s) from the last 14 days not reviewed. Reading them shows which "resolutions" were wrong; correct a wrong answer before the customer comes back angry.</p>
      <button class="primary" id="aiReview" ${reviewable.length ? '' : 'disabled'}>Review the worst ${Math.min(20, reviewable.length)} conversations (${AI_HOURS.review} h)</button>
      <div class="table-wrap" style="margin-top:8px"><table class="small"><thead><tr><th>Week</th><th>Seen</th><th>Resolution (vendor)</th><th>Repeat 72h</th><th>Handed off</th><th>Billed</th></tr></thead><tbody>
        ${weeks.map(({ w, m: x }) => html`<tr><td>${w === 0 ? 'This week' : `${w} wk ago`}</td><td>${x.seen}</td><td>${pctOr(x.claimedRate)}</td><td>${pctOr(x.repeatRate)}</td><td>${pctOr(x.handoffRate)}</td><td>${money(x.claimed * AI_AGENT.perResolution)}</td></tr>`)}
      </tbody></table></div>
      ${reviewed.length ? html`<h3>Reviewed conversations</h3><ul class="list small">${reviewed.map((c) => { const [lab, tone] = OUTCOME_LABEL[c.outcome] ?? [c.outcome, '']; const f = c.falloutId ? pending.get(c.falloutId) : null; return html`<li>${fmtDate(s, c.day)} · <b>${INTENTS[c.intent].label}</b> <span class="badge ${tone}">${lab}</span>${c.repeat ? html` <span class="badge warn">came back</span>` : ''}${f && !f.corrected ? html` <button class="sm" data-correct="${f.id}">Reach out with the right answer (10 min)</button>` : f?.corrected ? html` <span class="badge good">corrected</span>` : ''}</li>`; })}</ul>
        <p class="small muted">In your reviewed sample: ${pct(reviewed.filter((c) => c.outcome === 'resolved').length / reviewed.length, 0)} were actually correct.</p>` : ''}
    </section>` : ''}
    <section class="panel"><h2>Team</h2>
      <p class="small">Support staff capacity: ${staff ? `${Math.round(staff * 7)} tickets/week` : html`none: hire in <a href="#/people">People</a>`}. Your daily support block: ${sup.autoHoursPerDay} h on weekdays.</p>
      <p class="small muted">2016 advice: "hire support person #1 at ~100 customers". 2026: AI handles a share of tier-1, but the founder handles escalations far longer, and only ~10% of support orgs report mature AI deployments.</p>
    </section>`;
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

// ---- Actions (pure state changes; the UI charges hours via ctx.act; also usable by Automations and tests) ----

export function addProcedure(state, d, res) {
  const ai = ensureSupport(state).ai;
  const arr = Array.isArray(res) ? res : [{ data: res }];
  const q = arr.reduce((x, r) => x + clamp(Number(r.data.quality) || 0, 0, 1), 0) / arr.length;
  const prev = ai.procedures.find((p) => p.intent === d.intent);
  const p = { id: prev?.id ?? uid('proc'), name: INTENTS[d.intent].label, intent: d.intent, whenNot: d.whenNot ?? '', steps: d.steps, connector: d.connector || null,
    quality: round2(d.connector === 'payments' || INTENTS[d.intent].kind !== 'procedure' ? q : Math.min(q, 0.3)), issues: arr[0].data.issues ?? [], day: state.day, version: (prev?.version ?? 0) + 1, sim: null, simPassed: false };
  ai.procedures = ai.procedures.filter((x) => x.intent !== d.intent).concat(p);
  return p;
}

export function simulate(state, procId) {
  const sup = ensureSupport(state), ai = sup.ai;
  const p = ai.procedures.find((x) => x.id === procId);
  if (!p) throw new Error('No such procedure.');
  const mk = monthKeyOf(state);
  if (ai.sims.month !== mk) ai.sims = { month: mk, runs: 0 };
  if (ai.sims.runs + 10 > SIM_CAP) throw new Error(`Simulation cap reached (${SIM_CAP} runs/month under 1K conversations). Runs reset on the 1st.`);
  const r = simulateProcedure(() => rng(state), p);
  ai.sims.runs += r.runs;
  p.sim = { day: state.day, runs: r.runs, passed: r.passed };
  p.simPassed = r.ok;
  return r;
}

export function runBatchTest(state) {
  const sup = ensureSupport(state);
  const r = batchTest(() => rng(state), sup.ai, agentCtx(state, sup));
  sup.ai.tests.unshift(r);
  if (sup.ai.tests.length > 10) sup.ai.tests.length = 10;
  sup.ai.testedHash = r.hash;
  if (sup.ai.status === 'off') sup.ai.status = 'draft';
  return r;
}

export function goLive(state) {
  const sup = ensureSupport(state), ai = sup.ai;
  const tested = isTested(ai);
  ai.status = 'live';
  ai.sinceDay ??= state.day;
  ai.liveDay = ai.liveDay ?? state.day;
  ai.flags.liveTested = tested;
  if (!tested) logSupportMistake(state, { trap: 'ai_live_untested', key: `untested:${state.day}`, text: 'Set the AI support agent live without a batch test on the current setup. Nobody checked which questions it answers wrong; customers find out first (game estimate: ~40% more wrong answers until tested).' });
  if (!sup.articles.length) logSupportMistake(state, { trap: 'founder_view_kb', key: `nokb:${state.day}`, text: 'Set the AI agent live with no help-center content: it improvises answers.' });
  return ai;
}

export function reviewAgent(state, n = 20) {
  const ai = ensureSupport(state).ai;
  const rank = { wrong: 0, silent: 1, unresolved: 2, stuck_handoff: 3, handoff: 4, resolved: 5 };
  const pool = ai.convos.filter((c) => !c.reviewed && state.day - c.day <= 14).sort((a, b) => rank[a.outcome] - rank[b.outcome] || b.day - a.day).slice(0, n);
  for (const c of pool) c.reviewed = true;
  const fallIds = new Set(pool.map((c) => c.falloutId).filter(Boolean));
  for (const f of ai.fallout) if (fallIds.has(f.id)) f.caught = true;
  ai.lastReviewDay = state.day;
  return { reviewed: pool.length, wrong: pool.filter((c) => c.outcome === 'wrong').length };
}

export function correctFallout(state, id) {
  const sup = ensureSupport(state);
  const f = sup.ai.fallout.find((x) => x.id === id);
  if (!f || !f.caught) throw new Error('Review the conversation first.');
  f.corrected = true;
  logCsat(state, sup, 1 / CSAT_RESPONSE_RATE, 0.6); // a founder who follows up recovers most of the goodwill [design]
}

export function postStatusUpdate(state, text) {
  const sup = ensureSupport(state);
  const t = state.apps.insights?.today;
  if (!t) throw new Error('No incident today.');
  const q = statusUpdateQuality(text, t.cause);
  t.statusPosted = true;
  sup.statusUpdates.unshift({ incidentId: t.id, day: state.day, q, text });
  if (sup.statusUpdates.length > 30) sup.statusUpdates.length = 30;
  return q;
}

export function openChannel(state, customerId) {
  const sup = ensureSupport(state);
  const sub = activeSubs(state).find((x) => x.customerId === customerId);
  if (!sub) throw new Error('No active subscription for that account.');
  sup.channels[customerId] = { day: state.day, tier: tierOf(state, sub) };
}

// Automations exposure (gap analysis §4): triggers derived from state, idempotent by id.
export function helpdeskEvents(state, sinceDay) {
  const sup = state.apps.support;
  if (!sup) return [];
  const ev = [];
  for (const t of sup.tickets ?? []) {
    if (t.createdDay >= sinceDay) ev.push({ id: `ticket_created:${t.id}`, type: 'ticket_created', day: t.createdDay, ticketId: t.id, category: t.category, priority: t.priority, customerId: t.customerId, channel: t.channel ?? 'email' });
    const sla = slaState(state, t);
    if (!sla.done && t.status === 'open' && sla.hours > sla.limit * 0.75) ev.push({ id: `sla_at_risk:${t.id}`, type: 'sla_at_risk', day: state.day, ticketId: t.id, priority: t.priority });
  }
  for (const r of sup.ai?.log ?? []) if (r.day >= sinceDay && r.handoff) ev.push({ id: `ai_handoff:${r.day}`, type: 'ai_handoff', day: r.day, n: r.handoff });
  for (const r of sup.reviews ?? []) if (r.day >= sinceDay && !r.fake) ev.push({ id: `review_posted:${r.id}`, type: 'review_posted', day: r.day, reviewId: r.id, rating: r.rating });
  return ev;
}

export { supportOperatorReader };

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
    const b2b = s.company.model !== 'b2c';
    const tab = t ? 'inbox' : ['inbox', 'kb', 'ai', 'reviews', ...(b2b ? ['slack'] : [])].includes(param) ? param : 'inbox';
    const tabs = [['inbox', 'Inbox'], ['kb', 'Help center & macros'], ['ai', 'AI agent & team'], ...(b2b ? [['slack', 'Shared channels']] : []), ['reviews', 'Reviews']];
    mount(root, html`
      <div class="app-head"><div><h1>Helpdesk</h1><p>Every customer question, bug report and billing problem lands here. How fast and how well you answer shows up in churn, CSAT and public reviews.</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => html`<a href="#/helpdesk/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${!shippedFeatures(s).length ? html`<div class="callout">No product shipped yet, so no tickets. Once customers use what you build, they will write in.</div>` : ''}
      ${t ? ticketView(ctx, sup, t) : tab === 'kb' ? kbView(ctx, sup) : tab === 'ai' ? aiView(ctx, sup) : tab === 'slack' ? channelsView(ctx, sup) : tab === 'reviews' ? reviewsView(ctx, sup) : inboxView(ctx, sup)}`);

    on(root, 'click', '[data-tkt]', (e, el) => ctx.navigate('helpdesk', el.dataset.tkt));
    on(root, 'submit', '#workForm', (e) => {
      e.preventDefault();
      const h = Number(formData(e.target).hours) || 1;
      ctx.act((st) => { const sp = ensureSupport(st); const n = workQueue(st, sp, (h * 60) / minutesPerTicket(st, sp) + 1e-6); toast(`Answered ${n} routine ticket(s).`, 'good'); }, { hours: h, label: 'Support inbox' });
    });
    on(root, 'change', '#weekendCheck', (e, el) => ctx.act((st) => { ensureSupport(st).weekendCheck = el.checked; }));
    on(root, 'change', '#autoHours', (e, el) => ctx.act((st) => { ensureSupport(st).autoHoursPerDay = Number(el.value); }));
    // AI agent setup (config changes are quick; they invalidate the last batch test)
    on(root, 'change', '[data-src]', (e, el) => ctx.act((st) => {
      const ai = ensureSupport(st).ai;
      const ids = new Set(ai.sourceIds ?? ensureSupport(st).articles.map((a) => a.id));
      if (el.checked) ids.add(el.dataset.src); else ids.delete(el.dataset.src);
      ai.sourceIds = [...ids];
    }));
    on(root, 'change', '[data-scope]', (e, el) => ctx.act((st) => { ensureSupport(st).ai.scope[el.dataset.scope] = el.checked; }));
    on(root, 'change', '[data-handoff]', (e, el) => ctx.act((st) => { ensureSupport(st).ai.handoff[el.dataset.handoff] = el.checked; }));
    on(root, 'change', '#usageCap', (e, el) => ctx.act((st) => { const v = Number(el.value); ensureSupport(st).ai.usageCap = el.value === '' || !(v >= 0) ? null : Math.round(v); }));
    on(root, 'input', '[data-proc]', (e, el) => { drafts.proc[el.dataset.proc] = el.value; });
    on(root, 'change', '#procForm select', (e, el) => { drafts.proc[el.name] = el.value; });
    on(root, 'submit', '#procForm', async (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const d = { ...drafts.proc, intent: f.intent, connector: f.connector };
      if (words(d.steps) < 12) return toast('Write the actual steps the agent should follow (one per line).', 'warn');
      const ok = await ctx.act(async (st) => {
        const res = await ctx.llm.panel({
          task: 'support_procedure_grade',
          system: 'You are a support operations lead reviewing an AI-agent Procedure (Intercom Fin style) for a small SaaS. Judge whether it would handle real conversations correctly: concrete steps, conditions with both branches and real policy numbers, the data connector it needs to act, a handoff for exceptions, and a clear "when not to use". Penalise vague or keyword-stuffed steps.',
          prompt: `INTENT: ${INTENTS[d.intent].label}\nDATA CONNECTOR: ${d.connector || 'none'}\nWHEN NOT TO USE: ${d.whenNot}\nSTEPS:\n${d.steps.slice(0, 3000)}`,
          schema: ARTICLE_SCHEMA, temperature: 0.2, maxTokens: 300, cache: st.cache,
          fallback: () => procedureHeuristic(d),
        });
        addProcedure(st, d, res);
        return true;
      }, { hours: AI_HOURS.procedure, label: 'AI agent procedure' });
      if (ok) { drafts.proc = { intent: 'refund', whenNot: '', steps: '', connector: 'payments' }; ctx.render(); }
    });
    on(root, 'click', '[data-simulate]', (e, el) => ctx.act((st) => { const r = simulate(st, el.dataset.simulate); toast(`Simulations: ${r.passed}/${r.runs} passed.`, r.ok ? 'good' : 'warn'); }, { hours: AI_HOURS.simulate, label: 'AI agent simulations' }));
    on(root, 'click', '[data-del-proc]', (e, el) => ctx.act((st) => { const ai = ensureSupport(st).ai; ai.procedures = ai.procedures.filter((p) => p.id !== el.dataset.delProc); }));
    on(root, 'click', '#aiTest', () => ctx.act((st) => { const r = runBatchTest(st); toast(`Batch test: ${r.good} good, ${r.acceptable} acceptable, ${r.poor} poor.`, r.poor > 5 ? 'warn' : 'good'); }, { hours: AI_HOURS.batchTest, label: 'AI agent batch test' }));
    on(root, 'click', '#aiDraft', () => ctx.act((st) => { const ai = ensureSupport(st).ai; ai.status = 'draft'; ai.sinceDay ??= st.day; }, { hours: AI_HOURS.configure, label: 'AI support agent setup' }));
    on(root, 'click', '#aiLive', () => {
      if (!isTested(sup.ai) && !confirm('The agent has not been batch-tested on this setup. Go live anyway? Customers will find its wrong answers for you.')) return;
      ctx.act((st) => goLive(st), { hours: AI_HOURS.goLive, label: 'AI support agent go-live' });
    });
    on(root, 'click', '#aiPause', () => ctx.act((st) => { ensureSupport(st).ai.status = 'paused'; }));
    on(root, 'click', '#aiReview', () => ctx.act((st) => { const r = reviewAgent(st); toast(`Reviewed ${r.reviewed}: ${r.wrong} wrong answer(s) found.`, r.wrong ? 'warn' : 'good'); }, { hours: AI_HOURS.review, label: 'Support: AI conversation review' }));
    on(root, 'click', '[data-correct]', (e, el) => ctx.act((st) => correctFallout(st, el.dataset.correct), { hours: AI_HOURS.correct, label: 'Support: correcting an AI answer' }));
    on(root, 'click', '[data-open-ch]', (e, el) => ctx.act((st) => openChannel(st, el.dataset.openCh), { hours: SLACK.setupHours, label: 'Support: Slack Connect channel' }));
    on(root, 'click', '[data-close-ch]', (e, el) => ctx.act((st) => { delete ensureSupport(st).channels[el.dataset.closeCh]; }));
    on(root, 'input', '[data-status]', (e, el) => { drafts.status = el.value; });
    on(root, 'submit', '#statusForm', (e) => {
      e.preventDefault();
      if (words(drafts.status) < 6) return toast('Write the update: what is affected, what you are doing, when the next update comes.', 'warn');
      ctx.act((st) => { const q = postStatusUpdate(st, drafts.status); drafts.status = ''; toast(`Status update posted (clarity ${pct(q, 0)}).`, q >= 0.7 ? 'good' : 'warn'); }, { hours: 0.25, label: 'Incident status update' });
    });

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
          if (t.firstResponseDay == null) { t.firstResponseDay = st.day; ensureSupport(st).frtLog.push({ day: st.day, frt: slaState(st, t).hours, n: 1 }); }
          drafts.reply[t.id] = ''; drafts.reply[`${t.id}:macro`] = false;
          ctx.enqueue('support:reply', { ticketId: t.id }, { label: `Reply from ${t.name}` });
        }, { hours, label: 'Support ticket' });
      });
      on(root, 'click', '#tktSolve', () => ctx.act((st) => {
        const answered = t.messages.some((m) => m.from === 'me');
        t.status = 'solved';
        if (!answered) {
          t.closedUnanswered = true;
          logSupportMistake(st, { trap: 'fast_and_wrong', text: `Closed "${t.subject}" from ${t.name} without answering. It looks like inbox zero; to the customer it looks like being ignored.` });
          const sub = subOf(st, t.subId);
          if (sub?.status === 'active' && !sub.cancelAtPeriodEnd && chance(st, 0.1)) { cancel(st, sub.id, { atPeriodEnd: true, reason: 'felt_ignored' }); t.consequence = 'cancel_at_period_end'; }
          logCsat(st, ensureSupport(st), 1 / CSAT_RESPONSE_RATE, 0.15);
        }
      }));
    }

    on(root, 'input', '[data-art]', (e, el) => { drafts.article[el.dataset.art] = el.value; });
    on(root, 'change', 'select[data-art]', (e, el) => { drafts.article[el.dataset.art] = el.value; });
    on(root, 'click', '[data-edit-art]', (e, el) => { const a = sup.articles.find((x) => x.id === el.dataset.editArt); if (!a) return; drafts.article = { title: a.title, body: a.body, intent: a.intent, editId: a.id }; ctx.render(); });
    on(root, 'click', '#artCancel', () => { drafts.article = { title: '', body: '', intent: '', editId: null }; ctx.render(); });
    on(root, 'input', '[data-mac]', (e, el) => { drafts.macro[el.dataset.mac] = el.value; });
    on(root, 'input', '[data-resp]', (e, el) => { drafts.response[el.dataset.resp] = el.value; });
    on(root, 'submit', '#artForm', async (e) => {
      e.preventDefault();
      const a = { ...drafts.article, intent: drafts.article.intent || inferIntent(drafts.article.title) };
      if (words(a.body) < 30 || !a.title.trim()) return toast('Write a real article: a question as the title and at least a few steps.', 'warn');
      const old = a.editId ? sup.articles.find((x) => x.id === a.editId) : null;
      if (old && old.body.trim() === a.body.trim()) return toast('Nothing changed. Update the steps to match what you shipped.', 'warn');
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
        const sp = ensureSupport(st);
        const prev = old ? sp.articles.find((x) => x.id === old.id) : null;
        if (prev) Object.assign(prev, { title: a.title.trim(), body: a.body, intent: a.intent, quality: round2(q), issues: res[0].data.issues ?? [], updatedDay: st.day });
        else sp.articles.push({ id: uid('art'), title: a.title.trim(), body: a.body, intent: a.intent, quality: round2(q), issues: res[0].data.issues ?? [], day: st.day });
        return true;
      }, { hours: old ? AI_HOURS.articleUpdate : ARTICLE_HOURS, label: 'Help-center article' });
      if (ok) { drafts.article = { title: '', body: '', intent: '', editId: null }; ctx.render(); }
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
          fallback: () => ({ quality: replyQuality(text, 'review', { ticketText: `${r.title} ${r.text}` }), note: '' }),
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
    else if (sup.ai.status === 'live' || res > 0) post(state, { amount: -round2(Math.max(sup.ai.status === 'live' ? AI_AGENT.monthlyMin : 0, res) * AI_AGENT.perResolution), counterparty: 'Intercom', description: `Fin AI resolutions: ${res}${sup.ai.status === 'live' ? ` (min ${AI_AGENT.monthlyMin})` : ''}`, category: 'software', method: 'card' });
    sup.ai.monthResolutions = 0;
  },

  jobs: { 'support:ticket': ticketJob, 'support:reply': replyJob, 'support:review': reviewJob },
};
