// Market & world engine (slice state.apps.world): the competitor landscape and its moves, and the world-event
// sampler for categories competitor / platform / ai_lab / macro / reputation (public/data/world.js).
// Effects go to core market modifiers under 'world:<instanceId>' keys; effects other apps must consume are
// exposed through worldEffect(state, key) and worldDealMult(state).

import { ensure, log } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { setModifier, ensureMarket } from '../../core/market.js';
import { enqueue } from '../../core/jobs.js';
import { rng, uid, poisson } from '../../core/util.js';
import { WORLD_EVENTS } from '../../data/world.js';
import { HANDLED_CATEGORIES, profile, eventRate, RIVAL_SCALED, rivalFactor, drawEffects, applyHint, resilienceOf, nicheType, landscapeSize, templateCompetitors, pressureMult, threatOf } from './model.js';
import { acquire } from '../growth/acquire.js';
import { competitivePressure, shouldDiscover, markPending } from './competitors.js';

export const EVENTS = WORLD_EVENTS.filter((e) => HANDLED_CATEGORIES.includes(e.category) && e.id && e.baseRatePerYear > 0);
export const eventById = (id) => WORLD_EVENTS.find((e) => e.id === id);
const RESPONSE_WINDOW = 14; // days to choose a response before the default ("do nothing") applies

export function ensureWorld(state) {
  const W = ensure(state, 'world', () => ({}));
  W.rivals ??= [];
  W.landscape ??= null; // { nicheType, total, generatedDay, source }
  W.news ??= [];
  W.active ??= [];
  W.history ??= [];
  W.pages ??= []; // battlecards / alternatives pages
  W.rateMult ??= {}; // eventId -> multiplier from past responses (e.g. better content → fewer bad core updates)
  W.bursts ??= []; // scheduled inbound bursts from competitor exits: { day, n, source }
  return W;
}

// ---------------- Landscape ----------------

export function seedLandscape(state) {
  const W = ensureWorld(state);
  if (W.landscape) return W.landscape;
  const nt = nicheType(state);
  const size = landscapeSize(nt, () => rng(state));
  const rivals = templateCompetitors(state, () => rng(state), size.notable, nt);
  W.rivals = rivals.map((c) => ({ id: uid('riv'), ...c, status: 'active', researched: false, mentioned: false, moves: [], momentum: 0, addedDay: state.day }));
  W.landscape = { nicheType: nt, total: size.total, generatedDay: state.day, source: 'template', category: '' };
  return W.landscape;
}

export const activeRivals = (state) => ensureWorld(state).rivals.filter((c) => c.status === 'active');
const pickRival = (state, pred = () => true) => {
  const list = activeRivals(state).filter(pred);
  if (!list.length) return null;
  // Stronger rivals make more news.
  const w = list.map((c) => threatOf(c, state.company.model));
  let r = rng(state) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
  return list.at(-1);
};

// ---------------- Effects plumbing ----------------

// Translate an active instance's effects into core modifiers.
// Effects fade linearly toward neutral over the event's duration (markets adapt) [design]; permanent ones don't.
export function decayFactor(inst, day) {
  const dur = inst.endDay - inst.startDay;
  if (dur > 400 || inst.effects.permanent) return 1;
  return Math.max(0, 1 - (day - inst.startDay) / Math.max(1, dur));
}
function coreMods(state, inst) {
  const e = inst.effects;
  const f = decayFactor(inst, state.day);
  const fade = (m) => 1 + (m - 1) * f;
  const b2b = state.company.model !== 'b2c';
  let landing = (e.conversionMult ?? 1) * (e.signupMult ?? 1);
  // Organic shocks (organicTrafficMult / organicShareMult) are applied to SEO visits in the Organic engine.
  if (e.checkoutConversionMult != null) landing *= e.checkoutConversionMult;
  if (inst.rivalId && hasPageFor(state, inst.rivalId) && landing < 1) landing = 1 - (1 - landing) / 2; // your vs-page blunts their move
  const churn = (e.churnMult ?? 1) * (e.voluntaryChurnMult ?? 1);
  // Trial→paid: in B2B, price pressure and discount requests weigh on closes.
  const conversion = b2b && e.discountRequests ? 1 - e.discountRequests * 0.25 : 1;
  return { landing: fade(landing), churn: fade(churn), conversion: fade(conversion) };
}
function applyMods(state, inst, on = true) {
  const key = `world:${inst.id}`;
  const m = coreMods(state, inst);
  for (const kind of ['landing', 'churn', 'conversion']) setModifier(state, kind, key, on ? +m[kind].toFixed(4) : null);
}

// Product of an exposed multiplier over active events, e.g. worldEffect(state, 'paidCpcMult').
// Keys: paidCpcMult, paidMetaSpendMult, salesCycleMult, expansionMult, inferenceCostMult, raiseOddsMult,
// valuationMult, aiReferralMult, organicTrafficMult, marketplaceLeadsMult, ticketsMult, errorRate (max), b2bInboundMult.
export function worldEffect(state, key) {
  const W = state.apps.world;
  if (!W) return key === 'errorRate' ? 0 : 1;
  const vals = W.active.filter((i) => i.status === 'active' && i.effects[key] != null).map((i) => i.effects[key]);
  if (key === 'errorRate') return vals.length ? Math.max(...vals) : 0;
  return vals.reduce((a, v) => a * v, 1);
}
// Multiplier for B2B deal close odds: competitive events, the landscape and your battlecards.
export function worldDealMult(state) {
  const W = state.apps.world;
  if (!W) return 1;
  let m = W.lastPressure ?? 1;
  for (const i of W.active) if (i.status === 'active' && i.effects.conversionMult != null) m *= i.effects.conversionMult;
  const cards = W.pages.filter((p) => p.kind === 'battlecard');
  m *= 1 + Math.min(0.15, cards.reduce((a, p) => a + 0.12 * p.score / Math.max(1, cards.length), 0));
  return Math.max(0.5, Math.min(1.3, m));
}
const hasPageFor = (state, rivalId) => ensureWorld(state).pages.some((p) => p.rivalId === rivalId && p.score >= 0.5);

// ---------------- Firing events ----------------

export function fireEvent(state, ev, { rival = null } = {}) {
  const W = ensureWorld(state);
  const effects = drawEffects(ev, resilienceOf(state), () => rng(state));
  // Event-specific grounding in the landscape.
  if (ev.id === 'competitor_new_entrant') {
    const nt = W.landscape?.nicheType ?? nicheType(state);
    const [c] = templateCompetitors(state, () => rng(state), 1, nt);
    const used = new Set(W.rivals.map((x) => x.name));
    if (used.has(c.name)) c.name += ' AI';
    rival = { id: uid('riv'), ...c, funding: rng(state) < 0.5 ? 'seed' : 'bootstrapped', status: 'active', researched: false, mentioned: true, moves: [], momentum: 0, addedDay: state.day, newEntrant: true };
    W.rivals.push(rival);
    if (W.landscape) W.landscape.total++;
  }
  if (RIVAL_SCALED.includes(ev.id) && !rival) rival = pickRival(state, ev.id === 'competitor_raise' ? (c) => c.funding !== 'public_incumbent' : () => true);
  if (RIVAL_SCALED.includes(ev.id) && !rival) return null;
  if (rival) {
    rival.mentioned = true;
    if (ev.id === 'competitor_raise') {
      const next = { bootstrapped: 'seed', seed: 'series_a', series_a: 'series_b_plus', series_b_plus: 'series_b_plus' }[rival.funding] ?? 'seed';
      const amt = { seed: [2e6, 6e6], series_a: [10e6, 25e6], series_b_plus: [30e6, 80e6] }[next];
      rival.funding = next;
      rival.lastRound = Math.round((amt[0] + rng(state) * (amt[1] - amt[0])) / 1e5) * 1e5;
      rival.raisedUsd = (rival.raisedUsd ?? 0) + rival.lastRound;
      rival.momentum = Math.min(0.2, (rival.momentum ?? 0) + 0.08);
    }
    if (ev.id === 'competitor_price_cut') {
      if (rng(state) < 0.4 || !(rival.priceMonthly > 0)) rival.freeTier = true;
      else rival.priceMonthly = Math.max(1, Math.round(rival.priceMonthly * (0.6 + rng(state) * 0.25)));
    }
    if (ev.id === 'competitor_exit') {
      rival.status = rng(state) < 0.5 ? 'shut_down' : 'acquired';
      // Displaced customers look for alternatives over the next ~6 weeks.
      if (rival.status === 'shut_down' || rng(state) < 0.5) {
        const n = Math.round(effects.inboundLeadsBurst ?? 10);
        for (let d = 1; d <= 42; d += 7) W.bursts.push({ day: state.day + d, n: n / 6, source: 'competitor-switch' });
      }
    }
    rival.moves.push({ day: state.day, eventId: ev.id, simulated: Boolean(rival.real) });
    if (rival.real && ev.id === 'competitor_price_cut') rival.simFreeTier = true;
  }
  if (ev.id === 'meta_ad_account_restricted') effects.permanent = rng(state) < (ev.effects.permanentChance ?? 0.15);
  if (ev.id === 'fake_review_temptation') effects.offer = true;

  // A newer instance of the same event replaces the old one (e.g. a second core update).
  for (const old of W.active) if (old.eventId === ev.id && old.status === 'active') endInstance(state, old, 'superseded');

  const inst = {
    id: `${ev.id}#${uid('w').slice(-6)}`, eventId: ev.id, category: ev.category, startDay: state.day,
    endDay: state.day + Math.min(ev.effects?.durationDays ?? 30, 3650), effects, rivalId: rival?.id ?? null,
    response: null, status: 'active', note: '',
  };
  W.active.push(inst);
  applyMods(state, inst, true);
  const n = { id: uid('news'), day: state.day, instId: inst.id, eventId: ev.id, category: ev.category, headline: ev.label + (rival ? `: ${rival.name}` : ''), body: ev.effects.text, source: 'Wire', pending: true, read: false, mock: true, simulated: Boolean(rival?.real) };
  W.news.unshift(n);
  if (W.news.length > 300) W.news.length = 300;
  inst.newsId = n.id;
  enqueue(state, 'world:news', { newsId: n.id }, { label: 'Writing news' });
  log(state, 'info', `World: ${ev.label}${rival ? ` (${rival.name})` : ''}.`, 'market');
  return inst;
}

export function endInstance(state, inst, why = 'expired') {
  inst.status = 'ended';
  // Restored ad accounts restart delivery from scratch: ad sets go back into learning.
  if (inst.eventId === 'meta_ad_account_restricted') for (const s of state.apps.ads?.adsets ?? []) if (s.p === 'meta') { s.learn = { start: state.day, status: 'learning' }; (s.edits ??= []).push({ day: state.day, why: 'account restored' }); }
  inst.endedWhy = why;
  applyMods(state, inst, false);
  const W = ensureWorld(state);
  W.history.unshift({ id: inst.id, eventId: inst.eventId, startDay: inst.startDay, endDay: state.day, response: inst.response, why });
  if (W.history.length > 200) W.history.length = 200;
}

// ---------------- Player responses ----------------

export function respond(state, instId, responseId) {
  const W = ensureWorld(state);
  const inst = W.active.find((i) => i.id === instId);
  if (!inst || inst.status !== 'active' || inst.response) throw new Error('This event no longer needs a response.');
  const ev = eventById(inst.eventId);
  const r = ev.playerResponses.find((x) => x.id === responseId);
  if (!r) throw new Error('Unknown response.');
  if (r.cost > 0) post(state, { amount: -r.cost, counterparty: responseVendor(ev, r), description: `${ev.label}: ${r.label}`, category: ev.category === 'ai_lab' ? 'ai_inference' : ev.category === 'reputation' ? 'marketing' : 'other', method: 'card' });
  const notes = [];
  const h = r.effectHints ?? {};
  const rand = () => rng(state);
  for (const [k, v] of Object.entries(h)) {
    switch (k) {
      case 'resolveDays': inst.endDay = state.day + Math.round(v[0] + rand() * (v[1] - v[0])); break;
      case 'permanentChance': if (rand() < v) inst.effects.permanent = true; break;
      case 'regressionRisk': if (rand() < v) { notes.push('A quality regression slipped through: some users noticed.'); W.active.push(regression(state)); } break;
      case 'futureRateMult': W.rateMult[ev.id] = (W.rateMult[ev.id] ?? 1) * v; break;
      case 'nextUpdateBias': W.rateMult[ev.id] = (W.rateMult[ev.id] ?? 1) * 0.85; notes.push('Thin pages pruned: the next update is less likely to hurt.'); break;
      case 'platformPenaltyChance': if (rand() < v) { notes.push('The platform flagged your listing for suspicious reviews.'); inst.effects.conversionMult = 0.85; inst.endDay = state.day + 120; } else { inst.effects.conversionMult = 1.03; inst.endDay = state.day + (h.ratingBumpDays ?? 60); } break;
      case 'ratingBumpDays': case 'legalRisk': break;
      case 'cacMult': inst.effects.paidCpcMult = (inst.effects.paidCpcMult ?? 1) * v; break;
      case 'paidVolumeMult': inst.effects.paidMetaSpendMult = v; break;
      default: { const note = applyHint(inst.effects, k, v, rand); if (note) notes.push(note); }
    }
  }
  if (ev.id === 'competitor_exit' && responseId === 'migration_offer') for (const b of W.bursts) if (b.source === 'competitor-switch' && b.day > state.day) b.n *= 1.5;
  if (ev.id === 'meta_ad_account_restricted' && responseId === 'new_account' && inst.effects.permanent) notes.push('Meta linked the new account to the restricted one and disabled both.');
  if (ev.id === 'meta_ad_account_restricted' && inst.effects.permanent) inst.endDay = state.day + 3650;
  if (ev.id === 'competitor_new_entrant' && responseId === 'teardown') { const rv = W.rivals.find((c) => c.id === inst.rivalId); if (rv) rv.researched = true; }
  inst.response = responseId;
  inst.note = [r.outcome, ...notes].join(' ');
  applyMods(state, inst, true);
  return inst;
}
function responseVendor(ev, r) {
  if (ev.id === 'fake_review_temptation') return 'Reputation agency (offshore)';
  if (ev.category === 'ai_lab') return 'LLM provider';
  return r.label.slice(0, 40);
}
function regression(state) {
  const inst = { id: `regression#${uid('w').slice(-6)}`, eventId: 'regression', category: 'ai_lab', startDay: state.day, endDay: state.day + 30, effects: { churnMult: 1.08 }, status: 'active', response: 'n/a', note: 'Model migration regression' };
  applyMods(state, inst, true);
  return inst;
}

// Rate adjustments on top of the research conventions [design, see docs/review/growth.md G7/G15]:
// - Sherlocking by an AI lab is a market-wide multi-year event: capped at 0.3/yr per player.
// - New entrants slow down as the niche fills up: × clamp(8 / active rivals, 0.3, 1).
// - Meta restrictions concentrate in new accounts and sudden spend ramps; verified, seasoned accounts are safer.
export function effectiveRate(state, ev, p, rivals) {
  const W = ensureWorld(state);
  let rate = eventRate(ev, p, W.rateMult[ev.id] ?? 1);
  if (!rate) return 0;
  if (RIVAL_SCALED.includes(ev.id)) rate *= rivalFactor(rivals);
  if (ev.id === 'competitor_new_entrant') rate *= Math.min(1, Math.max(0.3, 8 / Math.max(1, rivals)));
  if (ev.id === 'ai_lab_feature_overlap') rate = Math.min(rate, 0.3);
  if (ev.id === 'meta_ad_account_restricted') {
    const acct = state.apps.ads?.accounts?.meta;
    const age = acct ? state.day - acct.createdDay : 0;
    const rows = state.apps.ads?.rows ?? [];
    const wk = (from, to) => rows.reduce((a, r) => a + (r.p === 'meta' && r.d > from && r.d <= to ? r.sp : 0), 0);
    const last = wk(state.day - 7, state.day), prev = wk(state.day - 14, state.day - 7);
    if (age < 60 || (prev > 0 && last > 3 * prev)) rate *= 3;
    else if (age > 180 && p.flags.verifiedBusiness) rate *= 0.5;
  }
  return rate;
}

// ---------------- Daily ----------------

// Benign competitor pricing/packaging moves (PricingSaaS 500: ~0.7 changes per company per year; 70–80% are
// increases / AI add-ons that don't hurt you). Harmful cuts come from the competitor_price_cut world event.
const BENIGN_MOVES_PER_RIVAL_YEAR = 0.5;

export function worldDay(state) {
  const W = ensureWorld(state);
  if (!W.landscape && (state.company.oneLiner || state.day > 0)) seedLandscape(state);
  // Real competitors: rediscover (web search) whenever the idea text changes; debounced to once per day.
  if (shouldDiscover(state)) { markPending(state, W.competitors ? 'idea_changed' : 'initial'); enqueue(state, 'world:competitors', { reason: 'idea_changed' }, { label: 'Researching competitors' }); }
  const p = profile(state);
  const rivals = activeRivals(state).length;

  // Expire, and apply default responses after the window.
  for (const inst of W.active) {
    if (inst.status !== 'active') continue;
    if (state.day >= inst.endDay) { endInstance(state, inst); continue; }
    if (!inst.response && state.day - inst.startDay >= RESPONSE_WINDOW) {
      const ev = eventById(inst.eventId);
      const def = ev?.playerResponses?.find((r) => !r.hours && !r.cost);
      inst.response = def?.id ?? 'none';
      inst.note = def ? `No response chosen: ${def.outcome}` : 'No response chosen.';
      if (def) for (const [k, v] of Object.entries(def.effectHints ?? {})) applyHint(inst.effects, k, v, () => rng(state));
      applyMods(state, inst, true);
    }
  }
  if (W.active.length > 60) W.active = W.active.filter((i) => i.status === 'active' || state.day - i.startDay < 400);

  // Sample new events: Poisson(rate/365) per event.
  for (const ev of EVENTS) {
    const rate = effectiveRate(state, ev, p, rivals);
    if (!rate) continue;
    const k = poisson(state, rate / 365);
    if (k > 0) fireEvent(state, ev);
  }

  // Fading effects are re-applied daily.
  for (const inst of W.active) if (inst.status === 'active') applyMods(state, inst, true);

  // Small bootstrapped (fictional) rivals quietly die at ~25%/yr, so the landscape doesn't only grow [design].
  for (const c of W.rivals) {
    if (c.real || c.status !== 'active' || c.funding !== 'bootstrapped') continue;
    if (rng(state) < 0.25 / 365) { c.status = 'shut_down'; c.moves.push({ day: state.day, eventId: 'quiet_shutdown' }); }
  }

  // Benign rival moves (flavor news, tiny relief).
  for (const c of activeRivals(state)) {
    if (rng(state) >= BENIGN_MOVES_PER_RIVAL_YEAR / 365) continue;
    const up = rng(state) < 0.6;
    if (up) c.priceMonthly = Math.round(c.priceMonthly * (1.1 + rng(state) * 0.15));
    c.moves.push({ day: state.day, eventId: up ? 'price_increase' : 'ai_addon', simulated: Boolean(c.real) });
    const pre = c.real ? 'Simulated: ' : '';
    W.news.unshift({ id: uid('news'), day: state.day, simulated: Boolean(c.real), eventId: up ? 'price_increase' : 'ai_addon', category: 'competitor', headline: up ? `${pre}${c.name} raises prices${c.priceMonthly ? ` to $${c.priceMonthly}/mo` : ''}` : `${pre}${c.name} launches a paid AI add-on`, body: up ? `${c.name} announced new pricing for its plans. Price-sensitive buyers may start comparing alternatives.` : `${c.name} now charges extra for AI features on top of its plans.`, source: c.real ? 'Simulated market event' : `${c.name} blog`, read: false, mock: true });
  }

  // Displaced customers from a competitor exit.
  const due = W.bursts.filter((b) => b.day <= state.day);
  W.bursts = W.bursts.filter((b) => b.day > state.day);
  for (const b of due) {
    const n = poisson(state, b.n);
    if (n > 0) acquire(state, { source: b.source, n, lead: state.company.model === 'b2c' ? 'auto' : true, note: 'Looking to switch after a competitor exit' });
  }

  // Landscape pressure and your published pages as standing modifiers.
  W.lastPressure = competitivePressure(state) ?? pressureMult(W.rivals, state.company.model);
  setModifier(state, 'landing', 'world:landscape', +W.lastPressure.toFixed(4));
  const pubs = W.pages.filter((x) => x.kind !== 'battlecard');
  // All world landing effects together never cut conversion below ×0.75.
  setModifier(state, 'landing', 'world:floor', null);
  const worldLanding = Object.entries(state.market.modifiers.landing).filter(([k]) => k.startsWith('world:')).reduce((a, [, v]) => a * v, 1);
  if (worldLanding < 0.75) setModifier(state, 'landing', 'world:floor', +(0.75 / worldLanding).toFixed(4));
  setModifier(state, 'landing', 'world:pages', pubs.length ? +(1 + Math.min(0.06, pubs.reduce((a, x) => a + 0.025 * x.score, 0))).toFixed(4) : null);
  ensureMarket(state);
}

// Exposure summary for the UI: expected events per year for each handled event given today's business.
export function exposureTable(state) {
  const p = profile(state);
  const rivals = activeRivals(state).length;
  return EVENTS.map((ev) => ({ ev, rate: effectiveRate(state, ev, p, rivals) })).sort((a, b) => b.rate - a.rate);
}

export function savePage(state, { rivalId, kind, title, text, judge }) {
  const W = ensureWorld(state);
  const pg = { id: uid('pg'), day: state.day, rivalId, kind, title, words: String(text).trim().split(/\s+/).length, text, score: judge.score, results: judge.results, mock: judge.mock };
  W.pages.unshift(pg);
  return pg;
}

