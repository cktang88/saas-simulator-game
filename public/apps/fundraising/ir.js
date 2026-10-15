// Investor relations: monthly updates (judged by an AI investor panel), warmth/trust, ask fulfillment,
// insider follow-on, board meetings after a priced round, and advisors on FAST agreements.
// Numbers: public/data/world.js INVESTOR_RELATIONS (docs/research/world-ops-support-life.md §4). Most are [design].

import { notify, log } from '../../core/state.js';
import { uid, rng, chance, clamp, monthKey, fmtDate, money, words } from '../../core/util.js';
import { scheduleEvent, findSlots, ensureCalendar, fmtTime, completeEvent } from '../../core/calendar.js';
import { ensureNetwork } from '../../core/network.js';
import { addInboundLead } from '../sales/crm-api.js';
import { INVESTOR_RELATIONS as IR_DATA } from '../../data/world.js';
import { computeMetrics } from './metrics.js';
import { ensureFr } from './sim.js';
import { frMistake } from './operator.js';
import { weighted } from '../../core/rubric.js';
import { UPDATE_CRITERIA, UPDATE_SCHEMA_R, BOARD_SCHEMA_R } from './judge-rubrics.js';
import { updateProgressFallback, boardScoresFallback } from './judge-fallbacks.js';

// KPI names in an update ("MRR: $12.4K" → "mrr"), to detect quietly changed metric definitions (o5 §2 trap).
export function kpiNames(text) {
  return [...new Set(String(text ?? '').split('\n').map((l) => l.replace(/^[-*•\d.)\s]+/, '').split(/[:=(]|\s[-–]\s/)[0].trim().toLowerCase().replace(/[^a-z0-9 %/]/g, '').trim()).filter((x) => x && x.length <= 40 && /[a-z]/.test(x)))];
}
const FLAGGED_CHANGE = /(definition|redefin|changed how|now count|new metric|methodology|switch(ed)? from)/i;

export const IR = IR_DATA ?? {
  updates: { hoursPerUpdate: [1, 3], hoursWithTemplate: [0.5, 1], askFulfilledChancePerUpdate: [0.05, 0.15], warmthDecayPerMissedMonth: 0.1, consistentSixMonthsInsiderOddsMult: 1.3, surpriseBadNewsAtRaiseWarmth: -0.3 },
  board: { cadenceWeeks: [6, 13], meetingHours: [1.5, 3], prepHoursFirst: [6, 12], prepHoursLater: [3, 6] },
  advisors: { equityPct: [0.25, 1], vestingYears: 2, cliffMonths: [0, 3], trialBeforeGrantMonths: 1, hoursPerMonth: [1, 2], usefulIntrosPerYear: [1, 4], goQuietWithinYear: 0.5 },
};

export function ensureIr(state) {
  const fr = ensureFr(state);
  fr.ir ??= { updates: [], warmth: 0.6, streak: 0, lastMonth: null, missed: 0, hidBadNews: false, includeProspects: false, board: null, advisors: [], advisorProspects: [], insiderAsked: {} };
  return fr.ir;
}

// Everyone with money in: closed SAFE/priced investors in the CRM, accelerators, and named SAFE holders.
export function insiders(state) {
  const fr = ensureFr(state);
  const list = fr.investors.filter((i) => i.status === 'committed' && i.closedDay != null).map((i) => ({ id: i.id, name: i.name, firm: i.firm, amount: i.terms?.amount ?? 0, crm: true }));
  for (const [id, a] of Object.entries(fr.accel)) if (['enrolled', 'done'].includes(a.status)) list.push({ id: `accel_${id}`, name: id === 'yc' ? 'Y Combinator' : id === 'techstars' ? 'Techstars' : 'a16z speedrun', firm: '', amount: 0, crm: false });
  return list;
}
export const prospects = (state) => ensureFr(state).investors.filter((i) => !['committed', 'passed'].includes(i.status) && i.status !== 'researching');

// ---- Update judging ----
// Per-criterion integer scores (judge-rubrics.js UPDATE_CRITERIA) plus feedback and the typed asks.
export const UPDATE_SCHEMA = UPDATE_SCHEMA_R;

export function heuristicUpdate(u, m) {
  const t = `${u.summary}\n${u.highlights}\n${u.lowlights}\n${u.kpis}\n${u.asks}`.toLowerCase();
  const nums = (u.kpis.match(/\$\s?\d|\d+%|\d+/g) ?? []).length;
  const askLines = u.asks.split('\n').map((x) => x.replace(/^[-*•\d.)\s]+/, '').trim()).filter((x) => x.length > 5);
  const asks = askLines.slice(0, 6).map((text) => {
    const l = text.toLowerCase();
    const type = /investor|vc|fund|angel/.test(l) ? 'intro_investor' : /hire|engineer|candidate|designer|recruit/.test(l) ? 'hire' : /intro|customer|buyer|head of|vp|cfo|ops/.test(l) ? 'intro_customer' : /advice|feedback|how/.test(l) ? 'advice' : 'other';
    return { text, type, specific: /[A-Z][a-z]+ [A-Z]|@|at [A-Z]|\b(vp|head of|cfo|cto)\b/i.test(text) && words(text) >= 5 };
  });
  const declining = (m.momGrowth ?? 0) < 0;
  const candor = clamp(2 + (words(u.lowlights) >= 15 ? 2 : words(u.lowlights) > 0 ? 1 : 0) - (declining && words(u.lowlights) < 10 ? 1.5 : 0), 1, 5);
  const clarity = clamp(1.5 + (u.summary.trim() ? 1 : 0) + Math.min(1.5, nums * 0.25) + (words(t) < 600 ? 0.5 : -0.5), 1, 5);
  const asksSpec = clamp(1 + asks.filter((a) => a.specific).length * 1.2 - (asks.length > 4 ? 1 : 0), 1, 5);
  const claimed = [...u.kpis.matchAll(/\$\s?([\d,.]+)\s?(k)?\s*mrr|mrr[:\s]*\$\s?([\d,.]+)\s?(k)?/gi)].map((x) => parseFloat((x[1] ?? x[3]).replace(/,/g, '')) * (x[2] || x[4] ? 1000 : 1));
  const accuracy = claimed.some((c) => Math.abs(c - m.mrr) > Math.max(300, m.mrr * 0.15)) ? 1.5 : nums ? 4 : 3;
  const r = (v) => Math.round(clamp(v, 1, 5) * 2) / 2; // half-point steps keep the old 1.5 "claim off by >15%" signal
  return { candor: r(candor), clarity: r(clarity), asks_specificity: r(asksSpec), accuracy: r(accuracy), progress: updateProgressFallback(u), feedback: 'Offline heuristic: checks for a summary, numeric KPIs, honest lowlights, specific asks and highlights tied to numbers.', asks };
}

// Fixed rubric weights (judge-rubrics.js); a judge without `progress` (older saves) is scored on the other four.
export const updateQuality = (j) => clamp(weighted(j, UPDATE_CRITERIA) ?? 1, 1, 5);
export function updateHours(u) {
  const w = words(`${u.summary} ${u.highlights} ${u.lowlights} ${u.kpis} ${u.asks}`);
  const [lo, hi] = IR.updates.hoursPerUpdate;
  return +clamp(lo + w / 400, lo * 0.5, hi).toFixed(2); // longer drafts take longer; 30–60 min with a template
}

// Apply a judged update: warmth, streak, asks fulfilled. Returns { fulfilled: [..] }.
export function applyUpdate(state, u, judge) {
  const ir = ensureIr(state);
  const m = computeMetrics(state);
  const q = updateQuality(judge);
  const mk = monthKey(state);
  const first = ir.lastMonth !== mk;
  if (first) ir.streak = ir.lastMonth && monthsBetween(ir.lastMonth, mk) <= 1 ? ir.streak + 1 : 1;
  ir.lastMonth = mk;
  // A monthly cadence compounds trust (audit IR fix): +0.02 extra once the streak reaches 3 months [design].
  ir.warmth = clamp(ir.warmth + (q - 3) * 0.04 + (first ? 0.02 : 0) + (first && ir.streak >= 3 ? 0.02 : 0), 0, 1);
  // Stable metric definitions: swapping most KPI names without saying so reads as moving the goalposts.
  const prev = ir.updates.at(-1);
  const now = kpiNames(u.kpis), before = prev ? kpiNames(prev.kpis) : [];
  let redefined = false;
  if (before.length >= 2 && now.length >= 2) {
    const inter = now.filter((k) => before.includes(k)).length;
    const jac = inter / new Set([...now, ...before]).size;
    if (jac < 0.34 && !FLAGGED_CHANGE.test(`${u.kpis} ${u.summary} ${u.lowlights}`)) {
      redefined = true;
      ir.warmth = clamp(ir.warmth - 0.05, 0, 1);
      frMistake(state, 'investor_relations', 'metric_redefinition', 'Changed the metrics without saying so', { reputation: 0.5 }, `This update reports ${now.slice(0, 4).join(', ')} where the last one reported ${before.slice(0, 4).join(', ')}. Investors compare month to month; unflagged changes cost credibility (warmth −5 points).`);
    }
  }
  const declining = (m.momGrowth ?? 0) < -0.02;
  // Early bad news does not lower warmth; hiding it is remembered and punished at the next raise.
  ir.hidBadNews = declining ? judge.candor < 3 : ir.hidBadNews && judge.candor < 3;
  const recipients = insiders(state).length + (u.toProspects ? prospects(state).length : 0);
  const [plo, phi] = IR.updates.askFulfilledChancePerUpdate;
  const fulfilled = [];
  for (const ask of (judge.asks ?? []).slice(0, 4)) {
    const p = clamp((plo + (phi - plo) * ((q - 1) / 4)) * (ask.specific ? 1 : 0.4) * (0.6 + ir.warmth * 0.8) * Math.min(2, 0.6 + recipients / 8), 0, 0.35);
    if (!chance(state, p)) continue;
    const via = pickInsiderName(state);
    fulfillAsk(state, ask, via);
    fulfilled.push({ ...ask, via });
  }
  // A progress update to prospects is a follow-up with news: ghosted investors re-roll their reply (review F8 e2e).
  let revived = 0;
  if (u.toProspects && q >= 2.5) {
    for (const inv of ensureFr(state).investors) {
      if (inv.status !== 'contacted' || !inv.ghosted || (inv.outreach?.followUps ?? 0) >= 3) continue;
      inv.ghosted = false;
      inv.outreach.followUps = (inv.outreach.followUps ?? 0) + 1;
      inv.pending = { type: 'reply', day: state.day + 2 + Math.floor(rng(state) * 6) };
      revived++;
    }
  }
  const rec = { id: uid('upd'), day: state.day, month: mk, ...u, quality: +q.toFixed(2), judge, recipients, fulfilled, revived, mrr: m.mrr, redefined };
  ir.updates.push(rec);
  if (ir.updates.length > 36) ir.updates.shift();
  return rec;
}

function monthsBetween(a, b) {
  const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
function pickInsiderName(state) {
  const list = [...insiders(state), ...prospects(state).map((p) => ({ name: p.name }))];
  return list.length ? list[Math.floor(rng(state) * list.length)].name : 'a reader of your update';
}

export function fulfillAsk(state, ask, via) {
  const n = ensureNetwork(state);
  if (ask.type === 'intro_investor') {
    n.investorLeads.push({ id: uid('il'), day: state.day, via, name: null, firm: null, email: '', warm: true, imported: false });
    notify(state, `${via} answered your update ask with an investor intro. Import it from Fundraising → Investors.`, { type: 'good', app: 'fundraising' });
  } else if (ask.type === 'intro_customer') {
    try { addInboundLead(state, { name: `Referral from ${via}`, email: '', company: 'Referred company', source: 'referral', note: `Intro from your investor update ask: "${String(ask.text).slice(0, 120)}"` }); } catch { /* CRM not ready */ }
    notify(state, `${via} made a customer intro from your update. It's in your CRM inbound queue.`, { type: 'good', app: 'fundraising' });
  } else if (ask.type === 'hire') {
    n.candidateLeads ??= [];
    n.candidateLeads.push({ id: uid('cl'), day: state.day, name: null, role: /design/i.test(ask.text) ? 'designer' : /sales|ae\b/i.test(ask.text) ? 'ae' : 'engineer', via });
    notify(state, `${via} referred a candidate from your update ask.`, { type: 'good', app: 'fundraising' });
  } else {
    notify(state, `${via} replied to your update with genuinely useful advice on "${String(ask.text).slice(0, 60)}".`, { type: 'good', app: 'fundraising' });
  }
}

// Multiplier on warm-intro meeting odds and insider follow-on odds.
export function warmthMultiplier(state) {
  const ir = state.apps.fundraising?.ir;
  if (!ir || !insiders(state).length) return 1;
  return clamp(0.85 + 0.3 * ir.warmth, 0.85, 1.15);
}
export const investorWarmth = (state) => state.apps.fundraising?.ir?.warmth ?? null; // for People (hiring) and others

// Insider pro-rata/bridge: [D] base 30% per insider, × warmth, × 1.3 after 6+ consistent months.
export function insiderOdds(state) {
  const ir = ensureIr(state);
  return clamp(0.3 * (0.5 + ir.warmth) * (ir.streak >= 6 ? IR.updates.consistentSixMonthsInsiderOddsMult : 1), 0.02, 0.8);
}

// ---- Board ----
export function boardActive(state) {
  return ensureFr(state).rounds.some((r) => r.instrument === 'priced');
}

function scheduleBoard(state, ir, fromDay) {
  const slot = findSlots(state, { fromDay, duration: 120, count: 1 })[0];
  if (!slot) return null;
  const mtg = { id: uid('board'), day: slot.day, start: slot.start, duration: 120, status: 'scheduled', prepHours: 0, memo: '', quality: null };
  try {
    const ev = scheduleEvent(state, { title: 'Board meeting', kind: 'meeting', app: 'fundraising', refId: mtg.id, with: { name: 'Board' }, day: slot.day, start: slot.start, duration: 120, location: 'Video call', notes: 'Prepare the board deck/memo in Fundraising → Investor relations.' });
    mtg.eventId = ev.id;
  } catch { return null; }
  ir.board.meetings.push(mtg);
  notify(state, `Board meeting scheduled for ${fmtDate(state, slot.day)} at ${fmtTime(slot.start)}. Prep the board memo beforehand.`, { app: 'fundraising' });
  return mtg;
}

export const boardPrepNeeded = (ir) => {
  const first = !ir.board.meetings.some((m) => m.status === 'done');
  const [lo, hi] = first ? IR.board.prepHoursFirst : IR.board.prepHoursLater;
  return Math.round((lo + hi) / 2);
};

export const BOARD_SCHEMA = BOARD_SCHEMA_R;
export function heuristicBoard(memo, m) {
  const { scores, score } = boardScoresFallback(memo, m);
  const gap = Object.entries(scores).sort((x, y) => x[1] - y[1])[0]?.[0];
  return { ...scores, quality: clamp(+(score ?? 1).toFixed(2), 1, 5), feedback: `Offline heuristic: plan-vs-actual, decisions requested, risks, cash/runway and length. Weakest: ${String(gap).replace(/_/g, ' ')}.`, questions: [(m.burn ?? 0) > 0 ? 'What is the plan if growth does not reach the next-round bar before runway ends?' : 'Should we invest more aggressively in growth given you are profitable?'] };
}

// ---- Advisors ----
const ADV_FIRST = ['Grace', 'Henrik', 'Lucia', 'Sameer', 'Olga', 'Ben', 'Amara', 'Theo', 'Ruth', 'Kai'];
const ADV_LAST = ['Whitfield', 'Nakamura', 'Ortega', 'Bose', 'Lindgren', 'Adeyemi', 'Fischer', 'Rao', 'Conti', 'Hale'];
export const EXPERTISE = [
  ['gtm', 'Go-to-market / sales leader', 'intro_customer'],
  ['fundraising', 'Ex-founder who raised a seed and A', 'intro_investor'],
  ['technical', 'Staff ML / infra engineer', 'advice'],
  ['domain', 'Industry operator in your ICP', 'intro_customer'],
  ['product', 'Product / design lead', 'advice'],
];
export function generateAdvisors(state, n = 3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const [key, label, value] = EXPERTISE[Math.floor(rng(state) * EXPERTISE.length)];
    out.push({ id: uid('adv'), name: `${ADV_FIRST[Math.floor(rng(state) * ADV_FIRST.length)]} ${ADV_LAST[Math.floor(rng(state) * ADV_LAST.length)]}`, expertise: key, label, value, askPct: +(IR.advisors.equityPct[0] + rng(state) * (IR.advisors.equityPct[1] - IR.advisors.equityPct[0])).toFixed(2), hidden: { introsPerYear: IR.advisors.usefulIntrosPerYear[0] + rng(state) * (IR.advisors.usefulIntrosPerYear[1] - IR.advisors.usefulIntrosPerYear[0]), quietAfterDays: Math.round((-Math.log(Math.max(1e-6, rng(state))) * 365) / Math.log(1 / (1 - IR.advisors.goQuietWithinYear))) } });
  }
  return out;
}
// Vested fraction of an advisor's FAST grant: monthly over vestingYears after the cliff.
export function advisorVested(adv, day) {
  const months = (day - adv.startDay) / 30.4;
  if (months < (adv.cliffMonths ?? 0)) return 0;
  return clamp(months / (IR.advisors.vestingYears * 12), 0, 1);
}

// ---- Daily tick ----
export function irDay(state) {
  const fr = ensureFr(state);
  const ir = ensureIr(state);
  const ins = insiders(state);
  // Missed months erode trust: checked on the 1st for the previous month, once you've had investors all month.
  if (ins.length && monthKey(state) !== monthKey(state, state.day - 1)) {
    const prev = monthKey(state, state.day - 1);
    const since = Math.min(...fr.investors.filter((i) => i.closedDay != null).map((i) => i.closedDay), ...fr.rounds.map((r) => r.day), Infinity);
    if (state.day - since >= 28 && ir.lastMonth !== prev) {
      const before = ir.warmth;
      ir.warmth = clamp(ir.warmth * (1 - IR.updates.warmthDecayPerMissedMonth), 0, 1);
      frMistake(state, 'investor_relations', 'went_quiet', 'Skipped the monthly investor update', { reputation: 0.25 }, `No update in ${prev}: insider warmth ${Math.round(before * 100)}% → ${Math.round(ir.warmth * 100)}%, streak reset (insider follow-on and intro odds fall with it).`);
      ir.missed++;
      ir.streak = 0;
      notify(state, `No investor update went out in ${prev}. Investors assume the worst when updates stop (warmth ${Math.round(ir.warmth * 100)}%).`, { type: 'warn', app: 'fundraising' });
    }
  }
  // Surprise bad news at a raise.
  if (fr.raise && fr.raise.startDay === state.day && ir.hidBadNews) {
    ir.warmth = clamp(ir.warmth + IR.updates.surpriseBadNewsAtRaiseWarmth, 0, 1);
    ir.hidBadNews = false;
    ir.surprised = true;
    frMistake(state, 'investor_relations', 'all_highlights', 'Hid bad news from investors', { reputation: 1.5 }, `Insiders discovered the decline you glossed over only when the raise opened: warmth ${Math.round(-IR.updates.surpriseBadNewsAtRaiseWarmth * 100)} points lower, weaker follow-on and intros.`, { delayed: true });
    notify(state, 'Your insiders learned about the decline you glossed over in updates only now that you are raising. Trust took a hit.', { type: 'bad', app: 'fundraising' });
  }
  // Board.
  if (boardActive(state)) {
    ir.board ??= { meetings: [], seats: 3, since: state.day };
    const cal = ensureCalendar(state);
    for (const m of ir.board.meetings) {
      if (m.status !== 'scheduled') continue;
      const ev = cal.events.find((e) => e.id === m.eventId);
      if (!ev || ['unattended', 'missed', 'canceled'].includes(ev.status)) {
        m.status = 'missed';
        ir.warmth = clamp(ir.warmth - 0.15, 0, 1);
        fr.reputation -= 0.5;
        frMistake(state, 'investor_relations', 'missed_board', 'Missed a board meeting', { reputation: 1 }, 'Board meeting missed: insider warmth −15 points and investor reputation −0.5.');
        notify(state, 'You missed a board meeting. Your lead investor is not happy.', { type: 'bad', app: 'fundraising' });
      } else { m.day = ev.day; m.start = ev.start; }
    }
    const next = ir.board.meetings.find((m) => m.status === 'scheduled');
    if (!next) {
      const last = ir.board.meetings.filter((m) => m.status !== 'scheduled').at(-1);
      const weeks = 8; // seed/A: every 6–8 weeks, up to quarterly
      const due = last ? last.day + weeks * 7 : ir.board.since + 28;
      if (state.day >= due - 14) scheduleBoard(state, ir, Math.max(state.day + 3, due));
    }
  }
  // Advisors: engaged advisors produce occasional intros; ~50% go quiet within a year.
  for (const a of ir.advisors) {
    if (a.status !== 'active' && a.status !== 'trial') continue;
    const engaged = state.day - a.startDay < a.hidden.quietAfterDays;
    if (a.status === 'trial' && state.day >= a.trialEnds) { a.status = 'trial_done'; notify(state, `Your trial month with ${a.name} is over. Decide whether to sign a FAST agreement.`, { app: 'fundraising' }); }
    if (!engaged) { if (!a.quietNotified && state.day - a.startDay > 60) { a.quietNotified = true; a.quiet = true; } continue; }
    if (chance(state, a.hidden.introsPerYear / 365)) {
      a.intros = (a.intros ?? 0) + 1;
      a.lastHelpDay = state.day;
      fulfillAsk(state, { type: a.value, text: a.label }, `${a.name} (advisor)`);
    }
  }
}

export function signAdvisor(state, adv, { pct, cliffMonths }) {
  const fr = ensureFr(state);
  const fd = fr.cap.founders.reduce((a, f) => a + f.shares, 0) + (fr.cap.common ?? []).reduce((a, c) => a + c.shares, 0) + (fr.cap.preferred ?? []).reduce((a, p) => a + p.shares, 0) + Math.max(fr.cap.pool ?? 0, (fr.cap.grants ?? []).reduce((a, g) => a + g.shares, 0));
  const shares = Math.round((fd * pct / 100) / (1 - pct / 100));
  fr.cap.common.push({ id: `adv_${adv.id}`, name: adv.name, shares, note: `Advisor (FAST, ${pct}% over 2 yrs)` });
  adv.status = 'active';
  adv.pct = pct;
  adv.cliffMonths = cliffMonths;
  adv.signedDay = state.day;
  adv.startDay ??= state.day;
  adv.shares = shares;
  log(state, 'info', `Signed FAST advisor agreement with ${adv.name} (${pct}%).`, 'fundraising');
}

export function endAdvisor(state, adv) {
  const fr = ensureFr(state);
  const holder = fr.cap.common.find((c) => c.id === `adv_${adv.id}`);
  if (holder) {
    const vested = Math.round(adv.shares * advisorVested(adv, state.day));
    if (vested > 0) { holder.shares = vested; holder.note = 'Advisor (ended, vested shares)'; }
    else fr.cap.common = fr.cap.common.filter((c) => c !== holder);
  }
  adv.status = 'ended';
  adv.endDay = state.day;
}

export { money };
