// People management inputs (audit fix 3): a 30/60/90 onboarding plan, a 1:1 cadence with an agenda, written
// feedback and dated performance conversations. Each is something the founder writes or schedules (and pays for
// in hours); together they form a per-member management score that moves morale, ramp, attrition and the
// "quiet quitting" productivity drag. Neglect is never free but mostly lands later: quiet quitting after ~2 months
// of no feedback or 1:1s, regretted attrition of strong people, a mis-hire kept for months, and disputes after
// undocumented firings.
//
// Tier behaviours and spreads: public/data/operator-tiers.js people_management (o4 s6). Engagement 2.7x with
// weekly feedback (Gallup 2019 via secondary, [unverified]); attrition 0.6x / 0.85x / 1x / 2x vs average and the
// days-to-address bands are [design]. Heuristic judges are deliberately conservative (shrunk toward the median)
// so keyword stuffing cannot reach stellar.

import { clamp, round2, fmtDate, money, uid, chance, rng } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { logMistake, shrink } from '../../core/operator.js';
import { confidentlyConcerning, memberFit } from './provenance.js';

export const MGMT_HOURS = { plan: 1.5, feedback: 0.25, talk: 1, agenda: 0.25 };
// Weekly founder hours per member by 1:1 cadence (30-min meeting + prep/notes) [design].
export const CADENCE = {
  weekly: { label: 'Weekly 1:1 (30 min + prep)', hoursPerWeek: 0.75, base: 0.6 },
  biweekly: { label: 'Every two weeks', hoursPerWeek: 0.4, base: 0.45 },
  adhoc: { label: 'Ad hoc ("ping me if you need anything")', hoursPerWeek: 0, base: 0.3 },
  none: { label: 'No 1:1s', hoursPerWeek: 0, base: 0 },
};
// Attrition multiplier by management score (target ~0.6x / 0.85x / 1x / 2x by tier, operator-tiers [design]).
const ATTR_POINTS = [[0, 2.3], [0.15, 2.0], [0.3, 1.25], [0.42, 1], [0.6, 0.9], [0.75, 0.72], [0.9, 0.62], [1, 0.58]];
export const QUIET_QUIT = { lowScore: 0.28, days: 60, productivity: 0.85, recover: 0.5 }; // [design]
export const DISPUTE = { undocumented: 0.12, documented: 0.03, cost: [8000, 35000] }; // termination claims [design]

const words = (t) => String(t ?? '').trim().split(/\s+/).filter(Boolean).length;
const NUM = /(\d|%|\bone\b|\btwo\b|\bthree\b|\bfive\b|\bten\b)/i;
const TIME = /(\bday\s?\d{1,3}\b|\bby (day|week|month|the end|end of|\w+day|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d)|\bweek \d|\b30\b|\b60\b|\b90\b|\bwithin \d|\bq[1-4]\b|\d{4}-\d{2}-\d{2})/i;
const VERB = /\b(ship|launch|close|resolve|cut|reduce|raise|own|write|publish|run|book|hit|answer|migrate|build|deliver|lead|set up|interview|document|automate|fix|onboard|land|sign|grow)\w*/i;
const VAGUE = /\b(get (familiar|up to speed|comfortable)|learn (the|about)|meet (the|everyone)|settle in|understand the|shadow|absorb|explore|be a team player|hit the ground running|do (their|your) best|add value|make an impact)\b/i;

/** Score one measurable outcome 0..1 [design heuristic]. */
export function outcomeScore(text) {
  const t = String(text ?? '').trim();
  if (words(t) < 4) return 0;
  let s = 0.15 + (NUM.test(t) ? 0.3 : 0) + (TIME.test(t) ? 0.25 : 0) + (VERB.test(t) ? 0.2 : 0) + (words(t) >= 8 && words(t) <= 45 ? 0.1 : 0);
  if (VAGUE.test(t)) s -= 0.35;
  return round2(clamp(s, 0, 1));
}

/** 30/60/90 plan: three outcomes; duplicates and vague items count for little. Returns { score, notes }. */
export function planScore(outcomes) {
  const list = (outcomes ?? []).map((o) => String(o ?? '').trim()).filter(Boolean).slice(0, 3);
  const seen = new Set();
  const per = list.map((o) => { const k = o.toLowerCase().replace(/[^a-z]/g, '').slice(0, 40); const dup = seen.has(k); seen.add(k); return dup ? 0 : outcomeScore(o); });
  while (per.length < 3) per.push(0);
  const raw = per.reduce((a, b) => a + b, 0) / 3;
  const notes = [];
  if (list.length < 3) notes.push('Write three outcomes: one each for day 30, 60 and 90.');
  if (per.some((v, i) => list[i] && v < 0.5)) notes.push('Make each outcome measurable: a number and a date ("Resolve 80% of tier-1 tickets without escalation by day 60").');
  if (list.some((o) => VAGUE.test(o))) notes.push('"Get up to speed" is an activity, not an outcome. Say what will be true.');
  return { score: round2(shrink(raw, 3, 0.45, 1)), per, notes };
}

const AGENDA_ITEMS = [
  [/block|stuck|in the way|obstacle/i, 'what is blocking you'],
  [/need from me|support|help from me|unblock|what can i/i, 'what you need from me'],
  [/learn|grow|career|develop|skill/i, 'what you are learning'],
  [/priorit|focus|this week|next week|top (3|three)/i, 'priorities'],
  [/feedback|went well|could be better|retro/i, 'feedback both ways'],
  [/metric|number|progress|outcome|goal|okr|30\/60\/90|plan/i, 'progress against outcomes'],
];
/** Fixed 1:1 agenda quality 0..1 (distinct standing items, capped; stuffing beyond 4 items adds nothing). */
export function agendaScore(text) {
  const t = String(text ?? '');
  if (words(t) < 3) return { score: 0, hits: [] };
  const hits = AGENDA_ITEMS.filter(([re]) => re.test(t)).map(([, l]) => l);
  return { score: round2(clamp(hits.length / 4, 0, 1) * (words(t) > 120 ? 0.8 : 1)), hits };
}

const SITUATION = /(yesterday|today|last (week|month|monday|tuesday|wednesday|thursday|friday|sprint|call|release)|on (monday|tuesday|wednesday|thursday|friday)|\bin (the|your|our) [a-z-]+ (call|review|demo|meeting|pr|pull request|release|launch|ticket|thread|email|standup|retro)|\bon \d{1,2}[/ -]|\d{4}-\d{2}-\d{2}|this morning|when you)/i;
const IMPACT = /(which meant|so the|as a result|because of that|the customer|the team|that caused|that saved|led to|impact|cost us|helped us|we lost|we won)/i;
const NEXT = /(next time|going forward|from now on|instead|could you|i need|please|by (friday|monday|next|the end|\w+day|day)|i'?d like|let'?s|keep doing|do more of)/i;
const REDIRECT = /(next time|instead|missed|late|didn'?t|did not|wasn'?t|was not|concern|improve|change|should have|need you to|not ok|problem|slipped|wrong)/i;
const GENERIC = /^(great job|good job|nice work|well done|thanks|keep it up|awesome|amazing)[.! ]*$/i;

/** Written feedback quality (situation, behaviour, impact, next step) and kind. */
export function feedbackScore(text) {
  const t = String(text ?? '').trim();
  if (!t || GENERIC.test(t) || words(t) < 6) return { score: 0.1, kind: REDIRECT.test(t) ? 'redirect' : 'praise', notes: ['Generic praise teaches nothing. Name the situation, what they did, the effect and what to do next.'] };
  const parts = { situation: SITUATION.test(t), impact: IMPACT.test(t), next: NEXT.test(t), length: words(t) >= 20 && words(t) <= 220 };
  const raw = 0.15 + (parts.situation ? 0.3 : 0) + (parts.impact ? 0.25 : 0) + (parts.next ? 0.2 : 0) + (parts.length ? 0.1 : 0);
  const notes = [];
  if (!parts.situation) notes.push('Anchor it in a specific moment ("in Tuesday\'s demo...").');
  if (!parts.impact) notes.push('Say what it caused (for the customer, the team, the numbers).');
  if (!parts.next) notes.push('End with what to keep doing or change, and by when.');
  return { score: round2(shrink(clamp(raw, 0, 1), 2, 0.45, 1)), kind: REDIRECT.test(t) ? 'redirect' : 'praise', parts, notes };
}

/** Performance conversation: dated example + measurable expected change + a date 2-8 weeks out. */
export function talkScore({ example, expectation, byDay }, today) {
  const ex = String(example ?? ''), exp = String(expectation ?? '');
  const horizon = byDay != null ? byDay - today : null;
  const raw = 0.1 + (SITUATION.test(ex) && words(ex) >= 8 ? 0.3 : words(ex) >= 8 ? 0.12 : 0) + (outcomeScore(exp) >= 0.5 ? 0.35 : words(exp) >= 6 ? 0.12 : 0)
    + (horizon != null && horizon >= 14 && horizon <= 60 ? 0.25 : horizon != null && horizon > 0 ? 0.1 : 0);
  const notes = [];
  if (!SITUATION.test(ex)) notes.push('Use a dated example ("in the 12 March release you merged without tests").');
  if (outcomeScore(exp) < 0.5) notes.push('Write the expected change so you can check it: what, how much, by when.');
  if (horizon == null || horizon < 14 || horizon > 60) notes.push('Give 2–8 weeks to show the change, then check on the date.');
  return { score: round2(clamp(raw, 0, 1)), notes };
}

export function ensureMgmt(m) {
  m.mgmt ??= { plan: null, cadence: 'adhoc', agenda: '', agendaScore: 0, feedback: [], talks: [], scoreHist: [] };
  m.mgmt.feedback ??= [];
  m.mgmt.talks ??= [];
  m.mgmt.scoreHist ??= [];
  return m.mgmt;
}

const human = (m) => m && m.kind !== 'ai_agent' && m.kind !== 'cofounder' && m.status !== 'gone';

// ---------------------------------------------------------------------------
// Player actions (pure state mutations; hours are charged by the UI's ctx.act)
// ---------------------------------------------------------------------------

export function writeOnboardingPlan(state, m, outcomes) {
  if (!human(m)) throw new Error('Not a team member you manage.');
  const g = ensureMgmt(m);
  const j = planScore(outcomes);
  g.plan = { day: state.day, outcomes: outcomes.map((o) => String(o).slice(0, 240)).slice(0, 3), score: j.score, notes: j.notes, beforeStart: state.day <= m.startDay };
  return g.plan;
}

export function setOneOnOne(state, m, { cadence, agenda }) {
  if (!human(m)) throw new Error('Not a team member you manage.');
  if (!CADENCE[cadence]) throw new Error('Pick a cadence.');
  const g = ensureMgmt(m);
  g.cadence = cadence;
  if (agenda != null) { g.agenda = String(agenda).slice(0, 600); const a = agendaScore(g.agenda); g.agendaScore = a.score; g.agendaHits = a.hits; }
  g.cadenceDay = state.day;
  return g;
}

export function giveFeedback(state, m, text) {
  if (!human(m) || m.status !== 'active') throw new Error('Not an active team member.');
  const g = ensureMgmt(m);
  const j = feedbackScore(text);
  const fb = { id: uid('fb'), day: state.day, text: String(text).slice(0, 1500), score: j.score, kind: j.kind, notes: j.notes };
  g.feedback.push(fb);
  if (g.feedback.length > 24) g.feedback.shift();
  return fb;
}

export function performanceConversation(state, m, { example, expectation, byDay }) {
  if (!human(m) || m.status !== 'active') throw new Error('Not an active team member.');
  const g = ensureMgmt(m);
  const j = talkScore({ example, expectation, byDay }, state.day);
  const t = { id: uid('talk'), day: state.day, example: String(example ?? '').slice(0, 800), expectation: String(expectation ?? '').slice(0, 600), byDay: byDay ?? null, score: j.score, notes: j.notes, concernDay: m.concernSince ?? null };
  g.talks.push(t);
  return t;
}

export const documented = (m) => (m.mgmt?.talks ?? []).some((t) => t.score >= 0.5);

// ---------------------------------------------------------------------------
// Management score and its effects
// ---------------------------------------------------------------------------

/** Per-member management score 0..1 and its parts (used weekly). */
export function mgmtScore(state, m) {
  const g = ensureMgmt(m);
  const tenure = state.day - m.startDay;
  const parts = [];
  if (tenure < 120) {
    const p = g.plan;
    parts.push(['onboarding', 0.25, p ? p.score * (p.beforeStart || p.day - m.startDay <= 7 ? 1 : 0.7) : 0.25]);
  }
  const cad = CADENCE[g.cadence] ?? CADENCE.adhoc;
  const oneOnOne = g.cadence === 'weekly' ? cad.base + 0.4 * g.agendaScore : g.cadence === 'biweekly' ? cad.base + 0.25 * g.agendaScore : cad.base;
  parts.push(['one_on_ones', 0.35, oneOnOne]);
  const fbs = g.feedback;
  let fb;
  if (!fbs.length) fb = tenure < 45 ? 0.4 : 0.12;
  else {
    const last = fbs.at(-1);
    const d = state.day - last.day;
    const best = Math.max(...fbs.filter((x) => state.day - x.day <= 90).map((x) => x.score), last.score);
    fb = d <= 45 ? best : d <= 90 ? 0.7 * best : d <= 180 ? 0.4 * best : 0.12;
    if (tenure > 90 && fbs.length >= 2 && fbs.every((x) => x.kind === 'praise') && m.concernSince != null) fb *= 0.6; // positive-only while a problem is visible
  }
  parts.push(['feedback', 0.3, fb]);
  if (m.concernSince != null) {
    const talk = g.talks.filter((t) => t.day >= m.concernSince - 14).at(-1);
    const d = state.day - m.concernSince;
    parts.push(['performance', 0.25, talk ? talk.score : d <= 14 ? 0.7 : clamp(1 - (d - 14) / 60, 0, 0.7)]);
  }
  const w = parts.reduce((a, [, wt]) => a + wt, 0);
  const score = round2(parts.reduce((a, [, wt, v]) => a + wt * clamp(v, 0, 1), 0) / w);
  return { score, parts: Object.fromEntries(parts.map(([k, , v]) => [k, round2(v)])) };
}

const lerp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts.at(-1)[1];
};
export const attritionMult = (score) => round2(lerp(ATTR_POINTS, score));
/** Morale target shift from management (on top of pay, equity, runway, founder energy). */
export const moraleShift = (score) => round2(clamp((score - 0.42) * 14, -6, 7));
/** Onboarding multiplier on the fit-driven replacement hazard (clear expectations catch mismatch early). */
export const onboardingMult = (m) => { const p = m.mgmt?.plan; return !p ? 1.15 : p.score >= 0.6 ? 0.8 : 1; };
export const tierOfScore = (s) => (s >= 0.75 ? 'stellar' : s >= 0.55 ? 'good' : s >= 0.35 ? 'average' : 'mediocre');

/** Weekly founder hours for 1:1s across the team. */
export function oneOnOneHours(members) {
  return round2(members.filter(human).filter((m) => m.status === 'active').reduce((a, m) => a + (CADENCE[ensureMgmt(m).cadence]?.hoursPerWeek ?? 0), 0));
}

/**
 * Weekly update for one member: score, ramp adjustment, quiet quitting, concern tracking. Returns the score.
 * Called from people/sim.js weekly(); cheap and deterministic.
 */
export function weeklyManage(state, m) {
  if (!human(m) || m.status !== 'active') return null;
  const g = ensureMgmt(m);
  // Concern tracking: the first confidently concerning read starts the clock on addressing it.
  if (confidentlyConcerning(m)) m.concernSince ??= state.day;
  else if (m.concernSince != null && (m.perf?.estimate ?? 0) > -0.2) m.concernSince = null;
  const { score, parts } = mgmtScore(state, m);
  g.score = score;
  g.parts = parts;
  g.scoreHist.push({ day: state.day, score });
  if (g.scoreHist.length > 60) g.scoreHist.shift();
  // Ramp: a measurable plan before day 1 shortens ramp ~20%; no plan by day 14 lengthens it ~15% [design].
  if (!g.rampAdjusted) {
    if (g.plan && g.plan.score >= 0.6 && (g.plan.beforeStart || g.plan.day - m.startDay <= 7)) { m.rampWeeks = Math.max(1, Math.round((m.rampWeeks ?? 8) * 0.8)); g.rampAdjusted = 'faster'; }
    else if (state.day - m.startDay >= 14 && (!g.plan || g.plan.score < 0.6)) { m.rampWeeks = Math.round((m.rampWeeks ?? 8) * 1.15); g.rampAdjusted = 'slower'; }
  }
  // Quiet quitting after ~60 days of low management (no feedback, no 1:1s) [design].
  if (score < QUIET_QUIT.lowScore) g.lowSince ??= state.day; else if (score >= QUIET_QUIT.recover) g.lowSince = null;
  if (!m.quietQuitting && g.lowSince != null && state.day - g.lowSince >= QUIET_QUIT.days && state.day - m.startDay >= 60) {
    m.quietQuitting = { day: state.day };
    const monthly = monthlyPay(m);
    notify(state, `${m.name} has gone quiet: doing the minimum, no ideas in standups. Two months with no written feedback and ${g.cadence === 'none' ? 'no 1:1s' : 'only ad hoc check-ins'}. Output is down ~15% until that changes.`, { type: 'warn', app: 'people' });
    logMistake(state, { functionId: 'people_management', id: 'positive_only', label: 'Quiet quitting after months without feedback or 1:1s', app: 'people', delayed: true, cost: { usd: round2(monthly * 0.15 * 3), hours: 0 }, detail: `${m.name}: management score ${score} for ${state.day - g.lowSince} days; ~15% lower output (~${money(monthly * 0.15)}/month of pay buys nothing).` });
  } else if (m.quietQuitting && score >= QUIET_QUIT.recover && g.lowSince == null) {
    m.quietQuitting = null;
    notify(state, `${m.name} is re-engaged: regular 1:1s and specific feedback are working.`, { type: 'good', app: 'people' });
  }
  return score;
}

export const monthlyPay = (m) => (m.engagement === 'contractor' ? (m.hourlyRate ?? 0) * (m.hoursPerWeek ?? 40) * 4.33 : (m.salary ?? 0) / 12);

/** Monthly: a confidently concerning performer with no conversation for 30+ days costs pay and team morale. */
export function monthlyNeglect(state, team, m) {
  if (!human(m) || m.status !== 'active' || m.concernSince == null) return null;
  const g = ensureMgmt(m);
  const addressed = g.talks.some((t) => t.day >= m.concernSince - 14) || m.pip?.status === 'active';
  const days = state.day - m.concernSince;
  if (addressed || days < 30) return null;
  for (const o of team) if (o !== m && human(o) && o.status === 'active') o.morale = clamp((o.morale ?? 70) - 2, 0, 100);
  const cost = round2(monthlyPay(m) * 0.5);
  logMistake(state, { functionId: 'people_management', id: 'avoid_hard_conversation', label: 'Problem kept without a conversation', app: 'people', delayed: true, cost: { usd: cost }, detail: `${m.name}: concerning for ${days} days with no dated conversation; the team absorbs it (morale -2 each) and ~half the pay buys little.` });
  if (days >= 60 && days < 90) notify(state, `${m.name} has been underperforming for ${Math.round(days / 30.4)} months and nobody has told them. The rest of the team noticed (morale down). Name the example and the change you need by a date.`, { type: 'bad', app: 'people' });
  return cost;
}

/** On resignation: was this regretted attrition the management routine could have prevented? */
export function onResignation(state, m) {
  if (!human(m)) return null;
  const fit = memberFit(m);
  const s = m.mgmt?.score ?? 0.42;
  if (fit < 0.15 || s >= 0.55) return null;
  const replace = round2(monthlyPay(m) * 2 + 3000); // lost ramp output + search spend [design]
  logMistake(state, { functionId: 'people_management', id: 'regretted_attrition', label: 'Regretted attrition of a strong performer', app: 'people', delayed: true, circles: true, cost: { usd: replace, hours: 30, days: 60 }, detail: `${m.name} (strong performer) resigned with a management score of ${s}: ${missingInputs(state, m).join('; ') || 'thin 1:1s and feedback'}.` });
  return replace;
}

export function missingInputs(state, m) {
  const g = ensureMgmt(m);
  const out = [];
  if (!g.plan && state.day - m.startDay < 150) out.push('no 30/60/90 plan');
  if (g.cadence === 'none' || g.cadence === 'adhoc') out.push(g.cadence === 'none' ? 'no 1:1s' : 'only ad hoc 1:1s');
  else if (g.agendaScore < 0.5) out.push('1:1s without a standing agenda');
  const last = g.feedback.at(-1);
  if (!last || state.day - last.day > 90) out.push(last ? `no written feedback for ${state.day - last.day} days` : 'no written feedback');
  else if (last.score < 0.45) out.push('generic feedback');
  if (m.concernSince != null && !g.talks.some((t) => t.day >= m.concernSince - 14)) out.push(`performance gap unaddressed for ${state.day - m.concernSince} days`);
  return out;
}

/** Termination without documentation: a later claim is likelier (scheduled as a delayed cost). */
export function onTermination(state, p, m) {
  if (!human(m) && m.status !== 'gone') return null;
  if (m.engagement === 'contractor' || m.exitReason === 'offer rescinded') return null;
  const doc = documented(m) || m.pip?.status === 'not_met';
  const pClaim = doc ? DISPUTE.documented : DISPUTE.undocumented;
  if (!doc) logMistake(state, { functionId: 'people_management', id: 'fire_without_notes', label: 'Fired without documentation', app: 'people', delayed: true, cost: { usd: 0 }, detail: `${m.name} let go with no dated performance conversation on file (claim risk ${Math.round(pClaim * 100)}% vs ${Math.round(DISPUTE.documented * 100)}% documented).` });
  if (chance(state, pClaim)) {
    p.claims ??= [];
    p.claims.push({ id: uid('claim'), name: m.name, memberId: m.id, dueDay: state.day + 30 + Math.floor(rng(state) * 60), cost: round2(DISPUTE.cost[0] + rng(state) * (DISPUTE.cost[1] - DISPUTE.cost[0])), documented: doc, status: 'pending' });
  }
  return pClaim;
}

/** Daily: termination claims land. */
export function processClaims(state, p) {
  for (const k of p.claims ?? []) {
    if (k.status !== 'pending' || state.day < k.dueDay) continue;
    k.status = 'settled';
    post(state, { amount: -k.cost, counterparty: 'Employment lawyer', description: `Wrongful termination claim (${k.name}): defense & settlement`, category: 'legal', method: 'ach', meta: { app: 'people' } });
    notify(state, `${k.name} filed a wrongful-termination claim${k.documented ? '' : ' and you had no written record of the performance problem'}. Defense and settlement: ${money(k.cost)}.`, { type: 'bad', app: 'people' });
    logMistake(state, { functionId: 'people_management', id: 'fire_without_notes', label: 'Termination claim settled', app: 'people', delayed: true, cost: { usd: k.cost, hours: 6 }, detail: `${k.name}: ${k.documented ? 'documented, still claimed (base rate)' : 'no documentation'}; settled for ${money(k.cost)}.` });
  }
}

export { fmtDate };
