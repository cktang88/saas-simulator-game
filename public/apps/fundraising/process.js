// Raise process quality (operator-tiers audit items 4 and 7): market talk from spraying investors, runway
// leverage at the start of a raise, and the bridge / down-round consequences of raising late. Pure logic on the
// fundraising slice (no DOM). Every number here is a [design] calibration unless a source is named:
// - o5 §1 (docs/research/operators/o5-fundraising-ops-founder.md): stellar founders pick 40-60 targets, run
//   them in parallel and in a tight window; average founders cold-email many VCs; "Accepts the first offer
//   because the cash is needed". No source quantifies the "shopped deal" effect, so the multipliers are [design].
// - operator-tiers.js fundraising.runwayAtStartMonths: stellar 9-14, good 7-9, average 4-7, mediocre 0-5 [design].
// - Audit target (operator-tiers-audit.md fix 7): a raise under 4 months of runway lowers cap odds ~25% and
//   tends to force the first term sheet.

import { clamp } from '../../core/util.js';
import * as moneyCommon from '../money/common.js';
import { computeMetrics } from './metrics.js';

// ---- Market talk ("the deal has been around") ----
// Investors talk to each other. A long tail of passes, a cold blast to 150 funds, pitching funds that don't do
// your stage, and re-pitching people who just passed all leak into the market and make the next investor less
// likely to take the meeting, connectors less willing to intro, and the eventual lead more price-aggressive.
export const TALK = {
  focusedContacts: 60, // contacts in 90 days before volume starts to read as spray (o5: stellar 40-60)
  perExtraContact: 0.004, // 200 contacts → +0.56
  pdfExtra: 0.5, // an untracked PDF attachment gets forwarded around: counts as 1.5 contacts
  perMisfit: 0.02, // wrong stage / check size / thesis (fit < 0.5)
  meetingPassesFree: 20, // passes after a meeting within 60 days before the long tail counts
  perMeetingPass: 0.03,
  noMeetingPassesFree: 25,
  perNoMeetingPass: 0.01,
  perRepitch: 0.08, // re-pitching a pass within 180 days with no material change
  windowContacts: 90,
  windowPasses: 60,
  windowRepitch: 180,
};
// Effects at talk = 1 (linear in talk) [design]:
export const TALK_EFFECT = { meeting: 0.4, intro: 0.35, close: 0.25, valuation: 0.15 };

const frOf = (state) => state.apps.fundraising;

export function talkLog(state) {
  const fr = frOf(state);
  fr.talkLog ??= [];
  return fr.talkLog;
}

// Append-only (removing an investor from the CRM does not erase what the market heard).
export function recordTalk(state, kind, { invId = null, w = 1, note = '' } = {}) {
  const log = talkLog(state);
  log.push({ day: state.day, kind, invId, w, note });
  if (log.length > 1500) log.splice(0, log.length - 1500);
}

export function marketTalk(state, day = state.day) {
  const fr = frOf(state);
  const log = fr?.talkLog ?? [];
  let contacts = 0, misfit = 0, mPass = 0, nPass = 0, repitch = 0;
  for (const e of log) {
    const age = day - e.day;
    if (age < 0) continue;
    if (e.kind === 'contact' && age <= TALK.windowContacts) contacts += e.w ?? 1;
    else if (e.kind === 'misfit' && age <= TALK.windowContacts) misfit++;
    else if (e.kind === 'pass_meeting' && age <= TALK.windowPasses) mPass++;
    else if (e.kind === 'pass' && age <= TALK.windowPasses) nPass++;
    else if (e.kind === 'repitch' && age <= TALK.windowRepitch) repitch++;
  }
  const parts = {
    volume: Math.max(0, contacts - TALK.focusedContacts) * TALK.perExtraContact,
    misfit: misfit * TALK.perMisfit,
    longTail: Math.max(0, mPass - TALK.meetingPassesFree) * TALK.perMeetingPass + Math.max(0, nPass - TALK.noMeetingPassesFree) * TALK.perNoMeetingPass,
    repitch: repitch * TALK.perRepitch,
  };
  const talk = clamp(parts.volume + parts.misfit + parts.longTail + parts.repitch, 0, 1);
  return { talk, parts, contacts: Math.round(contacts), misfit, meetingPasses: mPass, passes: nPass, repitches: repitch };
}

export const talkMult = (state, kind) => 1 - TALK_EFFECT[kind] * marketTalk(state).talk;

// Top pass reasons in the last 60 days, for the coaching read ("N investors passed, top reason").
export function passSummary(state, days = 60) {
  const fr = frOf(state);
  const passed = (fr?.investors ?? []).filter((i) => i.status === 'passed' && i.passedDay != null && state.day - i.passedDay <= days && !i.passByFounder);
  const counts = {};
  for (const i of passed) { const r = String(i.passReason ?? '').split(':')[0].slice(0, 80); counts[r] = (counts[r] ?? 0) + 1; }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { n: passed.length, top: top ? { reason: top[0], n: top[1] } : null };
}

// ---- Runway leverage ----
// The money builder may export runwayMonthsForecast(state) (13-week forecast); fall back to the bank runway
// (trailing burn incl. debt service) and then to the fundraising metrics sheet.
export function currentRunway(state) {
  const fr = frOf(state);
  if (fr?.runwayCache?.day === state.day) return fr.runwayCache.months;
  let months = null;
  try {
    if (typeof moneyCommon.runwayMonthsForecast === 'function') months = moneyCommon.runwayMonthsForecast(state);
    if (!Number.isFinite(months) && months !== Infinity) months = moneyCommon.runwayMonths(state);
  } catch { months = null; }
  if (months == null || Number.isNaN(months)) { try { months = computeMetrics(state).runwayMonths; } catch { months = Infinity; } }
  if (fr) fr.runwayCache = { day: state.day, months };
  return months;
}

// Leverage table [design], anchored on the operator-tiers runwayAtStartMonths bands and the audit target.
export const LEVERAGE = [
  { min: 9, terms: 1, close: 1, forcedP: 0, label: 'strong' },
  { min: 6, terms: 0.95, close: 0.95, forcedP: 0.1, label: 'fair' },
  { min: 4, terms: 0.85, close: 0.85, forcedP: 0.35, label: 'weak' },
  { min: -Infinity, terms: 0.75, close: 0.75, forcedP: 0.7, label: 'none' },
];
export function leverageFor(months) {
  const m = months == null || Number.isNaN(months) ? Infinity : months;
  return LEVERAGE.find((l) => m >= l.min);
}

// Investors read the runway you have now, never better than what you started with (a raise that drags burns
// leverage too).
export function raiseLeverage(state) {
  const r = frOf(state)?.raise;
  if (!r) return { ...leverageFor(Infinity), months: Infinity, atStart: Infinity };
  if (r.runwayAtStart === undefined) r.runwayAtStart = finite(currentRunway(state));
  const now = currentRunway(state);
  const months = Math.min(r.runwayAtStart ?? Infinity, now ?? Infinity);
  return { ...leverageFor(months), months, atStart: r.runwayAtStart ?? Infinity };
}
const finite = (x) => (Number.isFinite(x) ? +x.toFixed(2) : null); // null = default alive (JSON-safe Infinity)

// USD value of the extra ownership sold when the price is multiplied by m < 1 (valued at the fair price):
// amount/(mP) - amount/P of the company at P = amount * (1/m - 1).
export const dilutionCostUsd = (amount, m) => (m > 0 && m < 1 ? Math.round(amount * (1 / m - 1)) : 0);

// ---- Fundraising operator read ----
const scoreBand = (x, bands) => { for (const [min, s] of bands) if (x >= min) return s; return bands.at(-1)[1]; };

export function raiseStats(state, raise) {
  const fr = frOf(state);
  const inRaise = (fr?.investors ?? []).filter((i) => i.raiseId === raise.id || (i.raiseIds ?? []).includes(raise.id));
  const contacted = inRaise.filter((i) => i.outreach);
  const warm = contacted.filter((i) => i.outreach.channel === 'warm').length;
  const met = (fr?.meetings ?? []).filter((m) => m.status === 'done' && inRaise.some((i) => i.id === m.invId));
  const firstMeetings = met.filter((m) => m.kind === 'first');
  const warmFirst = firstMeetings.filter((m) => inRaise.find((i) => i.id === m.invId)?.outreach?.channel === 'warm').length;
  const partner = met.filter((m) => m.kind === 'partner').length;
  return {
    contacts: contacted.length + (raise.removedContacts ?? 0),
    warmShare: contacted.length ? warm / contacted.length : null,
    firstMeetings: firstMeetings.length,
    warmMeetingShare: firstMeetings.length ? warmFirst / firstMeetings.length : null,
    partnerMeetings: partner,
    deckFirst: contacted.filter((i) => ['pdf', 'link'].includes(i.outreach.deck)).length,
  };
}

export function fundraisingRead(state, { traps = [] } = {}) {
  const fr = frOf(state);
  const raises = [...(fr?.raises ?? []), ...(fr?.raise ? [fr.raise] : [])].filter((r) => state.day - (r.startDay ?? 0) <= 540);
  const r = raises.at(-1);
  if (!r) return { tier: 'unknown', evidence: [], coaching: ['Open a round only when you have 9+ months of runway, a 40-60 investor list and warm paths to most of it.'] };
  const st = raiseStats(state, r);
  if (st.contacts < 5) return { tier: 'unknown', evidence: [`${st.contacts} investors contacted so far`], coaching: [] };
  const talkPeak = Math.max(r.talkPeak ?? 0, marketTalk(state).talk);
  const runway = r.runwayAtStart == null ? 18 : r.runwayAtStart; // null = default alive
  const parts = {
    warm: scoreBand(st.warmMeetingShare ?? st.warmShare ?? 0, [[0.7, 1], [0.55, 0.75], [0.2, 0.45], [0, 0.15]]),
    focus: st.contacts > 200 ? 0.1 : st.contacts > 100 ? 0.35 : st.contacts > 60 ? 0.65 : st.contacts >= 25 ? 1 : 0.7,
    runway: scoreBand(runway, [[9, 1], [6, 0.75], [4, 0.4], [-Infinity, 0.15]]),
    room: r.roomAtFirstMeeting == null ? 0.5 : scoreBand(r.roomAtFirstMeeting, [[0.99, 1], [0.6, 0.65], [0, 0.3]]),
    talk: 1 - talkPeak,
    process: r.acceptedCompeting == null ? 0.6 : scoreBand(r.acceptedCompeting, [[2, 1], [1, 0.75], [0, 0.35]]),
  };
  const W = { warm: 0.25, focus: 0.15, runway: 0.2, room: 0.1, talk: 0.15, process: 0.15 };
  const score = Object.entries(W).reduce((a, [k, w]) => a + w * parts[k], 0);
  const tier = score >= 0.8 ? 'stellar' : score >= 0.62 ? 'good' : score >= 0.42 ? 'average' : 'mediocre';
  const ps = passSummary(state);
  const evidence = [
    `${st.contacts} investors contacted, ${st.warmShare == null ? '—' : Math.round(st.warmShare * 100)}% through warm intros`,
    `${st.firstMeetings} first meetings → ${st.partnerMeetings} partner meetings`,
    `Runway when the raise opened: ${r.runwayAtStart == null ? 'default alive' : `${r.runwayAtStart.toFixed(1)} months`}`,
    `Market talk peak ${Math.round(talkPeak * 100)}% (game estimate)`,
    ...(r.roomAtFirstMeeting != null ? [`Data room ${Math.round(r.roomAtFirstMeeting * 100)}% ready at the first meeting`] : []),
    ...(r.acceptedCompeting != null ? [`Signed with ${r.acceptedCompeting} competing lead term sheet${r.acceptedCompeting === 1 ? '' : 's'} on the table`] : []),
    ...(ps.n ? [`${ps.n} investors passed in 60 days${ps.top ? `; top reason: "${ps.top.reason}" (${ps.top.n})` : ''}`] : []),
  ];
  const coach = (id) => traps.find((t) => t.id === id)?.coaching;
  const coaching = [];
  if (parts.focus < 1 || parts.talk < 0.8) coaching.push(`You're pitching ${st.contacts} investors. ${coach('meeting_count') ?? 'Pick 40, get intros, and ask each investor what would make them lead.'}`);
  if (parts.warm < 0.75) coaching.push('Most of your first meetings came from cold email. Map intro paths first: a forwardable blurb through someone the investor trusts converts 10-20x better.');
  if (parts.runway < 0.75) coaching.push('You started raising with under 6 months of runway. Investors can see it in the metrics: start at 9-12 months, or cut burn first.');
  if (r.acceptedCompeting === 0) coaching.push(coach('first_term_sheet') ?? 'Run the process for 4-6 weeks so you have a choice.');
  if (st.firstMeetings >= 15 && st.partnerMeetings <= 1) coaching.push('Many first meetings, almost no partner meetings: the pitch or the fit is the problem, not the volume.');
  if (r.roomAtFirstMeeting != null && r.roomAtFirstMeeting < 0.6) coaching.push('Have the data room ready before the first meeting: diligence then takes weeks, not months.');
  if (st.deckFirst > 0.5 * st.contacts && st.contacts >= 10) coaching.push(coach('deck_before_call') ?? 'Lead with a one-line ask and send the deck after the call.');
  return { tier, score: +score.toFixed(2), n: st.contacts, parts, evidence, coaching: coaching.slice(0, 4) };
}

// ---- Investor-relations operator read ----
export function irRead(state, { traps = [] } = {}) {
  const fr = frOf(state);
  const ir = fr?.ir;
  const updates = (ir?.updates ?? []).filter((u) => state.day - u.day <= 365);
  const insiderSince = Math.min(...(fr?.rounds ?? []).map((r) => r.day), Infinity);
  if (!updates.length && !Number.isFinite(insiderSince)) return { tier: 'unknown', evidence: [], coaching: [] };
  const monthsWithInsiders = Number.isFinite(insiderSince) ? clamp(Math.floor((state.day - insiderSince) / 30.4), 0, 12) : 0;
  if (!updates.length && monthsWithInsiders < 2) return { tier: 'unknown', evidence: [], coaching: [] };
  const months = new Set(updates.map((u) => u.month)).size;
  const expected = Math.max(1, monthsWithInsiders || months);
  const cadence = clamp(months / expected, 0, 1);
  const lowlights = updates.filter((u) => (u.judge?.candor ?? 0) >= 3.5).length / Math.max(1, updates.length);
  const specific = updates.filter((u) => (u.judge?.asks ?? []).some((a) => a.specific)).length / Math.max(1, updates.length);
  const redefinitions = updates.filter((u) => u.redefined).length;
  const parts = {
    cadence: scoreBand(cadence, [[0.9, 1], [0.75, 0.75], [0.3, 0.4], [0, 0.1]]),
    lowlight: scoreBand(lowlights, [[0.8, 1], [0.5, 0.7], [0.1, 0.4], [0, 0.1]]),
    asks: scoreBand(specific, [[0.66, 1], [0.33, 0.65], [0.01, 0.4], [0, 0.15]]),
    trust: clamp((ir?.warmth ?? 0.6) - 0.1 * redefinitions - (ir?.surprised ? 0.2 : 0), 0, 1),
  };
  const score = 0.35 * parts.cadence + 0.25 * parts.lowlight + 0.2 * parts.asks + 0.2 * parts.trust;
  const tier = score >= 0.8 ? 'stellar' : score >= 0.6 ? 'good' : score >= 0.38 ? 'average' : 'mediocre';
  const coach = (id, fb) => traps.find((t) => t.id === id)?.coaching ?? fb;
  const coaching = [];
  if (parts.cadence < 0.75) coaching.push(`You sent ${months} update${months === 1 ? '' : 's'} in ${expected} months. Send even a short update monthly, on the same day.`);
  if (parts.lowlight < 0.7) coaching.push(coach('all_highlights', 'Add the lowlight and what you did about it.'));
  if (parts.asks < 0.65) coaching.push(coach('broad_ask', 'Ask for two intros to CFOs at $10M ARR SaaS companies.'));
  if (redefinitions) coaching.push(coach('metric_redefinition', 'Keep definitions stable and flag changes.'));
  if (ir?.surprised) coaching.push(coach('wait_for_next_update', 'Same-day email for same-day news.'));
  return {
    tier, score: +score.toFixed(2), n: updates.length, parts,
    evidence: [`${months} monthly updates in the last ${expected} months (streak ${ir?.streak ?? 0})`, `Named lowlight in ${Math.round(lowlights * 100)}% of updates`, `Specific asks in ${Math.round(specific * 100)}% of updates`, `Insider warmth ${Math.round((ir?.warmth ?? 0.6) * 100)}%`, ...(redefinitions ? [`${redefinitions} update(s) quietly changed metric definitions`] : [])],
    coaching: coaching.slice(0, 4),
  };
}
