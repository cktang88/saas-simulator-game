// Recruiting advice sources (the app-facing half of core/advice.js). Everything that touches another app lives here:
// the cap table (FAST advisor equity via fundraising/ir.js signAdvisor), the consulting roster (channels/agencies.js),
// accelerators (fundraising slice), People fractional execs and the board (priced rounds). Core stays app-free.
//
// Hidden quality is drawn from a keyed hash (drawQualityKeyed), never the main rng stream, so syncing sources cannot shift
// any other seeded flow. Numbers tagged [design] are game assumptions; equity bands follow docs/research/early-stage/advisors-consultants.md
// (FAST: about 0.1-1%, two-year monthly vest; Carta pre-seed median advisor grant about 0.24%).

import { notify } from '../../core/state.js';
import { clamp } from '../../core/util.js';
import { scheduleEvent, findSlots, ensureCalendar } from '../../core/calendar.js';
import { readOperators, TIER_RANK } from '../../core/operator.js';
import { ensureAdvice, addSource, endSource, sourceById, sources, drawQualityKeyed, sayFrom, recordAdvice, EXPERTISE, FRACTIONAL_EXPERTISE, inferFunction } from '../../core/advice.js';
import { ensureIr, generateAdvisors, signAdvisor, endAdvisor, boardActive, insiders, IR } from '../fundraising/ir.js';
import { searchAgencies, engage, outcomeOf, KINDS } from '../channels/agencies.js';

// FAST engagement levels: more of the advisor's time, more equity [design bands inside the sourced 0.1-1% range].
export const ENGAGEMENT = {
  light:   { label: 'Light: one call a quarter, intros', pct: 0.15, hoursPerMonth: 1 },
  regular: { label: 'Regular: a monthly call', pct: 0.35, hoursPerMonth: 2 },
  deep:    { label: 'Deep: monthly session and on call', pct: 0.75, hoursPerMonth: 4 },
};
// Peer groups: a founders group and a paid mastermind [design fees; no sourced survey of mastermind fees].
export const PEER_GROUPS = {
  founder_group: { label: 'Founder group (free-ish community, monthly dinner)', perMonthUsd: 50 },
  mastermind: { label: 'Paid mastermind (small group, weekly call)', perMonthUsd: 400 },
};
const ACCEL_LABEL = { yc: 'Y Combinator', techstars: 'Techstars', speedrun: 'a16z speedrun' };

/** Map an agency/engagement effectiveness 0..1 to a hidden advice quality. */
export const qualityFromEffectiveness = (eff, scam = false) => (scam ? 'bad' : eff >= 0.75 ? 'great' : eff >= 0.58 ? 'good' : eff >= 0.4 ? 'average' : 'mediocre');
const expertiseOfFunction = (fn) => Object.entries(EXPERTISE).find(([k, v]) => k !== 'general' && k !== 'board' && v.includes(fn))?.[0] ?? 'general';

// ---------------- Advisors (FAST) ----------------
/** Search for advisor candidates through your network, investors and accelerators (2 founder hours charged by the caller). */
export function findAdvisors(state, n = 3) {
  const ir = ensureIr(state);
  ir.advisorProspects = generateAdvisors(state, n);
  return ir.advisorProspects;
}
/** Start a one-month working trial: the person becomes a source straight away; sign a FAST agreement afterwards. */
export function startAdvisorTrial(state, prospectId) {
  const ir = ensureIr(state);
  const a = ir.advisorProspects.find((x) => x.id === prospectId);
  if (!a) throw new Error('That candidate is no longer available.');
  ir.advisorProspects = ir.advisorProspects.filter((x) => x !== a);
  const adv = { ...a, status: 'trial', startDay: state.day, trialEnds: state.day + Math.round(30.4 * IR.advisors.trialBeforeGrantMonths) };
  ir.advisors.push(adv);
  return syncSources(state).find((s) => s.refs.irAdvisorId === adv.id);
}
/**
 * Sign the FAST agreement. level: 'light'|'regular'|'deep' picks equity and hours (0.1-1%, two-year monthly vest); signing posts
 * the shares to the cap table (fundraising/ir.js signAdvisor). Returns the source.
 */
export function signAdvisorSource(state, sourceId, { level = 'regular', pct = null, cliffMonths = 0 } = {}) {
  const src = sourceById(state, sourceId);
  const adv = src && ensureIr(state).advisors.find((x) => x.id === src.refs.irAdvisorId);
  if (!adv) throw new Error('No such advisor.');
  const L = ENGAGEMENT[level] ?? ENGAGEMENT.regular;
  const p = clamp(pct ?? L.pct, 0.1, 1);
  signAdvisor(state, adv, { pct: p, cliffMonths: clamp(cliffMonths, 0, 3) });
  src.cost.equityPct = p;
  src.hoursPerMonth = L.hoursPerMonth;
  src.level = level;
  return src;
}
export function endAdvisorSource(state, sourceId) {
  const src = sourceById(state, sourceId);
  const adv = src && ensureIr(state).advisors.find((x) => x.id === src.refs.irAdvisorId);
  if (adv && adv.status !== 'ended') endAdvisor(state, adv);
  return endSource(state, sourceId);
}

// ---------------- Consultants ----------------
/** Search the consulting roster for a niche (agencies.js, 0.5 h when charge is true). Hidden quality never appears. */
export const findConsultants = (state, query = '', { charge = false } = {}) => searchAgencies(state, { query, kind: 'consulting', charge });
/**
 * Hire a consultant: engage() takes the up-front payment; the consultant becomes a source for the engagement window (45 days [design]),
 * with hours = the block you bought. Biased toward recommending more consulting. A scammy firm ghosts and gives bad advice.
 */
export function hireConsultant(state, listingId, { hours = 10, brief = '', topic = null, charge = false } = {}) {
  const { engagement, lessons } = engage(state, listingId, { units: hours, brief, charge });
  const o = outcomeOf(state, engagement.id);
  const L = findListing(state, listingId);
  const exp = topic && EXPERTISE[topic] ? topic : expertiseOfFunction(inferFunction(`${brief} ${L?.specialty ?? ''}`));
  const src = addSource(state, {
    kind: 'consultant', name: L?.name ?? 'Consultant', role: `${KINDS.consulting.label}${L?.nicheLabel ? ` (${L.nicheLabel})` : ''}`, expertise: exp,
    quality: qualityFromEffectiveness(o.effectiveness, o.ghosted || engagement.ghostDay != null), hoursPerMonth: hours, quietAfterDays: 45,
    cost: { perHourUsd: 0, feeUsd: engagement.paid }, refs: { listingId, engagementId: engagement.id, billedElsewhere: true },
  });
  return { source: src, engagement, lessons };
}
const findListing = (state, id) => state.agencyBook?.listings?.[id] ?? null;

// ---------------- Peers, AI ----------------
export function joinPeerGroup(state, groupId = 'founder_group') {
  const G = PEER_GROUPS[groupId];
  if (!G) throw new Error('Unknown peer group.');
  if (sources(state).some((s) => s.refs.group === groupId)) throw new Error('You are already in that group.');
  const q = drawQualityKeyed(state, 'peers', `peers|${groupId}`);
  return addSource(state, { kind: 'peers', name: G.label.split(' (')[0], role: 'Peer founders', expertise: 'general', quality: q, cost: { perMonthUsd: G.perMonthUsd }, refs: { group: groupId } });
}
export function enableAssistantSource(state) {
  const have = sources(state).find((s) => s.kind === 'ai');
  return have ?? addSource(state, { kind: 'ai', name: 'AI Assistant', role: 'General-purpose AI assistant', expertise: 'general', quality: 'mediocre' });
}

// ---------------- Mentors, board, fractional execs: synced from the rest of the game ----------------
/**
 * Create sources for people the player already has: signed or trial FAST advisors (Fundraising -> Investor relations), accelerator
 * mentors, the board after a priced round (or a lead investor from an existing round), and active fractional execs in People.
 * Idempotent; ends sources whose underlying relationship ended. Returns active sources. Called daily by the Advisors app.
 */
export function syncSources(state) {
  ensureAdvice(state);
  const have = (pred) => state.advice.sources.some(pred);
  // FAST advisors
  const ir = state.apps?.fundraising?.ir;
  for (const adv of ir?.advisors ?? []) {
    const src = state.advice.sources.find((s) => s.refs.irAdvisorId === adv.id);
    if (!src) {
      if (!['trial', 'trial_done', 'active'].includes(adv.status)) continue;
      addSource(state, { kind: 'advisor', name: adv.name, role: adv.label, expertise: adv.expertise, quality: drawQualityKeyed(state, 'advisor', `adv|${adv.id}`), biases: adv.expertise === 'fundraising' ? ['raise'] : [], cost: { equityPct: adv.pct ?? 0 }, hoursPerMonth: IR.advisors.hoursPerMonth[1], quietAfterDays: adv.hidden?.quietAfterDays ?? null, refs: { irAdvisorId: adv.id } });
    } else {
      if (adv.pct && !src.cost.equityPct) src.cost.equityPct = adv.pct;
      if (['ended', 'dropped'].includes(adv.status) && src.status === 'active') endSource(state, src.id);
    }
  }
  // Accelerator mentors (office hours)
  for (const [id, a] of Object.entries(state.apps?.fundraising?.accel ?? {})) {
    if (!['enrolled', 'done'].includes(a.status) || have((s) => s.refs.accelId === id)) continue;
    addSource(state, { kind: 'mentor', name: `${ACCEL_LABEL[id] ?? id} mentors`, role: 'Accelerator office hours', expertise: 'general', quality: drawQualityKeyed(state, 'mentor', `mentor|${id}`), refs: { accelId: id } });
  }
  // Board after a priced round; otherwise a lead investor from an existing round
  const priced = boardActive(state);
  if (priced && !have((s) => s.kind === 'board')) addSource(state, { kind: 'board', name: 'Your board', role: 'Lead investor and board', expertise: 'board', quality: drawQualityKeyed(state, 'board', 'board'), refs: { board: true } });
  else if (!priced && insiders(state).some((i) => i.crm) && !have((s) => s.refs.leadInvestor)) {
    const lead = insiders(state).find((i) => i.crm);
    addSource(state, { kind: 'advisor', name: lead.name, role: 'Existing investor', expertise: 'fundraising', quality: drawQualityKeyed(state, 'advisor', `inv|${lead.id}`), biases: ['raise'], access: 'metrics', refs: { leadInvestor: lead.id } });
  }
  // Fractional execs
  for (const m of state.apps?.people?.members ?? []) {
    if (!m.fractional) continue;
    const src = state.advice.sources.find((s) => s.refs.memberId === m.id);
    if (!src && m.status === 'active') {
      addSource(state, { kind: 'fractional', name: m.name, role: m.title ?? m.jobRole ?? 'Fractional executive', expertise: FRACTIONAL_EXPERTISE[m.jobRole] ?? 'general', quality: drawQualityKeyed(state, 'fractional', `frac|${m.id}`), hoursPerMonth: Math.max(2, Math.round((m.hoursPerWeek ?? 8) * 0.5)), cost: { perMonthUsd: m.monthlyCost ?? 0 }, refs: { memberId: m.id, billedElsewhere: true } });
    } else if (src && m.status !== 'active' && src.status === 'active') endSource(state, src.id);
  }
  return sources(state);
}

// ---------------- Office hours (calendar) ----------------
/** Book a 30-minute session on the calendar; the meeting itself charges the founder hours. Returns the event. */
export function bookOfficeHours(state, sourceId, { day = null, start = null } = {}) {
  const s = sourceById(state, sourceId);
  if (!s || s.status !== 'active') throw new Error('You are not working with that source.');
  const slot = day != null && start != null ? { day, start } : findSlots(state, { fromDay: state.day + Math.max(1, s.responseDays), duration: 30, count: 1 })[0];
  if (!slot) throw new Error('No free 30-minute slot in the next weeks.');
  return scheduleEvent(state, { title: `Office hours: ${s.name}`, kind: 'meeting', app: 'advisors', refId: s.id, with: { name: s.name }, day: slot.day, start: slot.start, duration: 30, location: 'Video call', notes: 'Bring numbers and one specific question.' });
}
/**
 * A held session: the source reviews the functions it covers where you read weakest, and says what it would say (through the gate:
 * quality, bias and data access decide the content). Items land in the inbox. Returns the items.
 */
export function holdOfficeHours(state, sourceId, { limit = 3 } = {}) {
  const s = sourceById(state, sourceId);
  if (!s) return [];
  const reads = Object.values(readOperators(state)).filter((r) => r.tier !== 'unknown' && (s.functions.includes('*') || s.functions.includes(r.functionId))).sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]).slice(0, limit);
  const out = [];
  for (const r of reads) out.push(...sayFrom(state, s, r.functionId, r.coaching, { kind: 'coaching' }));
  recordAdvice(state, out);
  s.sessions = (s.sessions ?? 0) + 1;
  return out;
}

/** Daily: sync sources, deliver held office hours, bill monthly fees (core adviceDay is called by the app). */
export function advisorsDay(state) {
  syncSources(state);
  for (const ev of ensureCalendar(state).events) {
    if (ev.app !== 'advisors' || ev.status !== 'done' || ev.processed) continue;
    ev.processed = true;
    const items = holdOfficeHours(state, ev.refId);
    if (items.length) notify(state, `${ev.with?.name ?? 'Your advisor'} shared thoughts after office hours (${items.length}). Open Advisors.`, { app: 'advisors' });
  }
}
