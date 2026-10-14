// Hire provenance: how each hire was selected (scorecard, structured vs unstructured interview, work sample,
// references/backchannel, background check, AI screening, days from final step to offer), the 12-month
// replacement model that turns selection quality into delayed consequences, and the post-mortem that traces a
// mis-hire back to the steps that were skipped (audit fix 2, docs/review/operator-tiers-audit.md).
//
// Tier targets (public/data/operator-tiers.js hiring, all [design] except validity ordering):
//   hires replaced within 12 months: stellar 5-10%, good 10-20%, average 20-35%, mediocre 40-60%.
//   days from final interview to offer: 1-2 / 3-7 / 10-14 / 14-30.
// Validity ordering structured > work sample > unstructured (o4 s5, Sackett 2022 via METHODS) is what
// separates the tiers: better methods pick candidates with a higher hidden role fit, and the hidden fit drives
// the replacement hazard below. Nothing here reads the player's tier directly.

import { clamp, round2, money } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { roleComposite } from './candidates.js';
import { estimate, toFive } from './interview.js';
import { jobRoleOf } from './catalog.js';

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// [design] P(role mismatch ends the job within 12 months) from the hidden role composite (weighted trait
// composite, SD ~0.6 across applicants) and how well the role was defined before interviewing ("hiring before
// the role is defined: mismatch in six months", operator-tiers hiring trap role_undefined). Calibrated with
// test/people-ops.test.js: over the same finalist pools the four selection loops land at ~15 / 21 / 36 / 41%
// replaced (hiring alone, neutral management); with the matching management routine (onboarding plan, 1:1s:
// manage.js attrition 0.6x..2x) the full operator lands at ~10% vs ~50%, the operator-tiers bands.
export const MISFIT = { a: -2.6, b: -7, fraud: 0.95, clarity: { scorecard: 1, post: 1.6, none: 2.5 } };
export const BASE_P12 = 0.085; // voluntary attrition at neutral morale (~0.0075/month, catalog BASE_ATTRITION_MONTHLY at morale 70)

/** Role-definition multiplier from the provenance (scorecard before interviews, else a specific post, else none). */
export const clarityMult = (pv) => (pv?.scorecardBefore ? MISFIT.clarity.scorecard : (pv?.postQuality ?? 0) >= 0.6 ? MISFIT.clarity.post : MISFIT.clarity.none);

/** P(the hire is replaced for fit within 12 months), before voluntary attrition. */
export function misfitP12(fitZ, { fraud = null, clarity = 1, onboarding = 1 } = {}) {
  if (fraud) return MISFIT.fraud;
  return clamp(sigmoid(MISFIT.a + MISFIT.b * fitZ) * clarity * onboarding, 0, 0.97);
}

/** Total 12-month replacement probability (fit + voluntary attrition scaled by the management routine). */
export const replacementP12 = (fitZ, { attrition = 1, ...opts } = {}) => round2(1 - (1 - misfitP12(fitZ, opts)) * (1 - clamp(BASE_P12 * attrition, 0, 0.95)));

/** Monthly hazard equivalent of a 12-month probability. */
export const monthlyHazard = (p12) => 1 - Math.pow(1 - clamp(p12, 0, 0.999), 1 / 12);

export const memberFit = (m) => (m.fraud === 'stand_in' ? -2 : m.traits ? roleComposite(jobRoleOf(m), m.traits) : 0);

const done = (A, k) => Boolean(A?.[k] && !A[k].dropped && A[k].found !== false);

/** Last day of real evaluation (interview or assessment) before the offer. */
export function finalStepDay(c) {
  const days = [];
  if (c.interview?.done && c.interview.day != null) days.push(c.interview.day);
  for (const a of Object.values(c.assessments ?? {})) if (a?.day != null && !a.dropped) days.push(a.day);
  return days.length ? Math.max(...days) : c.screenDay ?? c.appliedDay ?? null;
}

/**
 * Selection record stored on the member at acceptance. Every field is something the player did or skipped.
 * score 0..1 [design weights] mirrors the stellar behaviours in operator-tiers hiring.
 */
export function hireProvenance(state, job, c) {
  const sc = job?.scorecard ?? null;
  const ivDay = c.interview?.done ? c.interview.day : null;
  const scorecardBefore = Boolean(sc && (ivDay == null || sc.day <= ivDay));
  const ex = c.interview?.done ? (c.interview.execution ?? 0) : null;
  const interview = ex == null ? 'none' : ex >= 0.6 && sc ? 'structured' : ex >= 0.4 ? 'semi-structured' : 'unstructured';
  const A = c.assessments ?? {};
  const workSample = done(A, 'workSample') ? 'live work sample' : done(A, 'paidTrial') ? 'paid trial' : done(A, 'walkthrough') ? 'take-home + live walkthrough' : done(A, 'takeHome') ? 'unsupervised take-home' : null;
  const references = done(A, 'references');
  const backchannel = done(A, 'backchannel');
  const fin = finalStepDay(c);
  const daysToOffer = c.offer && fin != null ? Math.max(0, c.offer.sentDay - fin) : null;
  const est = estimate(c.evidence ?? [], 'composite');
  const bg = c.backgroundCheck ?? null;
  const skipped = [];
  if (!sc) skipped.push('no role scorecard');
  else if (!scorecardBefore) skipped.push('scorecard written after the interviews');
  if (interview === 'none') skipped.push('no interview beyond a 20-minute screen');
  else if (interview === 'unstructured') skipped.push('unstructured interview (chat, clichés, leading questions)');
  if (!workSample) skipped.push('no work sample');
  else if (workSample === 'unsupervised take-home') skipped.push('take-home without a live walkthrough');
  if (!references && !backchannel) skipped.push('no reference or backchannel calls');
  if (daysToOffer != null && daysToOffer > 7) skipped.push(`offer sent ${daysToOffer} days after the final step`);
  if (c.redFlags?.length) skipped.push(`hired despite ${c.redFlags.length} red flag(s)`);
  if (bg?.preOffer) skipped.push('background check before a conditional offer');
  const score = clamp(
    (sc ? (scorecardBefore ? 0.18 : 0.08) : 0)
    + ({ structured: 0.24, 'semi-structured': 0.12, unstructured: 0.03, none: 0 }[interview])
    + ({ 'live work sample': 0.2, 'paid trial': 0.2, 'take-home + live walkthrough': 0.16, 'unsupervised take-home': 0.05 }[workSample] ?? 0)
    + (references ? (sc ? 0.1 : 0.06) : 0) + (backchannel ? 0.1 : 0)
    + (daysToOffer == null ? 0 : daysToOffer <= 2 ? 0.1 : daysToOffer <= 7 ? 0.06 : daysToOffer <= 14 ? 0.02 : 0)
    - (c.redFlags?.length ? 0.15 : 0),
    0, 1);
  return {
    day: state.day, jobId: job?.id ?? null, channel: c.channel, postQuality: job?.quality ?? null,
    scorecard: Boolean(sc), scorecardBefore, interview, execution: ex, validity: c.interview?.validity ?? null,
    workSample, references, backchannel, daysToOffer,
    readAtHire: est ? round2(toFive(est.z)) : null, readSd: est ? est.sd : null, evidenceMethods: est?.methods ?? [],
    redFlags: c.redFlags?.length ?? 0,
    backgroundCheck: bg ? { pkg: bg.pkg, result: bg.result ?? bg.status, preOffer: Boolean(bg.preOffer) } : null,
    aiScreen: c.aiEval ? { met: c.aiEval.met, total: c.aiEval.total, reviewed: Boolean(c.aiEval.reviewed) } : null,
    skipped, score: round2(score), tier: score >= 0.75 ? 'stellar' : score >= 0.5 ? 'good' : score >= 0.28 ? 'average' : 'mediocre',
  };
}

/** One-line summary for the monthly read and the exit note. */
export function provenanceLine(pv) {
  if (!pv) return 'Hired before provenance tracking (no record).';
  const parts = [
    pv.scorecard ? (pv.scorecardBefore ? 'scorecard first' : 'scorecard late') : 'no scorecard',
    `${pv.interview} interview`,
    pv.workSample ?? 'no work sample',
    pv.references || pv.backchannel ? [pv.references && 'references', pv.backchannel && 'backchannel'].filter(Boolean).join(' + ') : 'no references',
    pv.daysToOffer != null ? `offer ${pv.daysToOffer}d after final step` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Is the monthly read confidently concerning? (perf.estimate from performance.js) */
export const confidentlyConcerning = (m) => Boolean(m.perf?.reads?.length && m.perf.estimate < -0.45 && m.perf.sd < 0.66);

/**
 * Post-mortem for a member who left (or is leaving). Returns { text, misHire, cost } and logs a mistake when the
 * hire was a mis-hire and the selection skipped steps that would have caught it.
 */
export function exitPostMortem(state, m, { reason = m.exitReason ?? 'left' } = {}) {
  if (m.kind === 'ai_agent' || m.kind === 'cofounder' || m.postMortem) return m.postMortem ?? null;
  const tenureDays = Math.max(0, (m.endDay ?? state.day) - m.startDay);
  const fit = memberFit(m);
  const misHire = (fit < -0.25 || m.fraud === 'stand_in' || confidentlyConcerning(m)) && tenureDays <= 400;
  const pv = m.provenance;
  const monthly = m.engagement === 'contractor' ? (m.hourlyRate ?? 0) * (m.hoursPerWeek ?? 40) * 4.33 : (m.salary ?? 0) / 12 * 1.2;
  // Cost of a mis-hire [design]: pay while output was below a median hire (~50% wasted), the recruiting spend,
  // plus ~30 founder hours to re-run the search.
  const wasted = round2(monthly * (tenureDays / 30.4) * 0.5 + (m.placement?.fee ?? 0));
  const lines = [`${m.name} (${Math.round(tenureDays / 30.4)} months): ${reason}.`, `Selection: ${provenanceLine(pv)}.`];
  if (pv?.readAtHire != null) lines.push(`Read at hire ${pv.readAtHire.toFixed(1)}/5 ±${(pv.readSd ?? 0).toFixed(1)}; on the job ${m.perf?.reads?.length ? `${toFive(m.perf.estimate).toFixed(1)}/5` : 'too early to tell'}.`);
  let cost = null;
  if (misHire) {
    const skipped = pv?.skipped?.length ? pv.skipped : [];
    lines.push(skipped.length ? `Mis-hire. Steps skipped that usually catch this: ${skipped.join('; ')}.` : 'Mis-hire despite a full process: base rates still bite (good process cuts the miss rate, it does not remove it).');
    cost = { usd: wasted, hours: 30, days: 75 };
    logMistake(state, {
      functionId: 'hiring', id: pv && !pv.scorecard ? 'role_undefined' : pv && pv.interview !== 'structured' ? 'culture_fit' : 'mis_hire', app: 'people',
      label: 'Mis-hire replaced within a year', cost, delayed: true, circles: true,
      detail: `${m.name}: ${skipped.length ? `skipped ${skipped.slice(0, 3).join(', ')}` : 'full process'}; ~${money(wasted)} of pay and fees with below-median output, plus a new search.`,
    });
  }
  m.postMortem = { day: state.day, text: lines.join(' '), misHire, cost };
  return m.postMortem;
}

/** Text appended to the monthly read for a member whose read is concerning. */
export function concerningNote(state, m) {
  if (!confidentlyConcerning(m) || m.concernNotified) return null;
  m.concernNotified = state.day;
  const pv = m.provenance;
  const skipped = pv?.skipped?.length ? ` Their hire skipped: ${pv.skipped.slice(0, 3).join('; ')}.` : '';
  notify(state, `Performance read for ${m.name} is concerning (${perfFive(m)}/5).${skipped} Raise it with them now: a dated example and the change you need by a date (People → Team → Manage).`, { type: 'warn', app: 'people' });
  return true;
}

const perfFive = (m) => toFive(m.perf?.estimate ?? 0).toFixed(1);


