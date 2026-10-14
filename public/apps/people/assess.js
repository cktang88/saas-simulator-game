// Assessment methods beyond the interview, with research validity, costs and candidate drop-off
// (public/data/roles.js METHODS; docs/research/hiring-and-performance.md §3.4–3.5). Each method adds
// noisy evidence about hidden traits (observedScore) and may surface red flags.

import { METHODS, ROLES as DATA_ROLES, z } from '../../data/roles.js';
import { post } from '../../core/bank.js';
import { chance, gaussian, round2, clamp, pick } from '../../core/util.js';
import { observe } from './interview.js';
import { roleComposite } from './candidates.js';

const workSampleTraits = (jobRole) => {
  const role = DATA_ROLES[jobRole] ?? DATA_ROLES.engineer;
  const ws = role.sampleQuestions.find((q) => q.type === 'work_sample');
  return ws ? ws.probes.filter((t) => t !== 'polish') : ['craft'];
};

// UI/action metadata. hours = founder hours per candidate; design = one-off per job.
export const ASSESSMENTS = {
  workSample: { label: 'Live work sample', method: 'workSample', hours: 1, design: METHODS.workSample.costHours.design, dropoff: METHODS.workSample.candidateDropoff, validity: METHODS.workSample.validity, note: 'Short, job-realistic task done live or with a live walkthrough. Measures craft directly; hard to fake.' },
  takeHome: { label: 'Unsupervised take-home', method: 'takeHome', hours: 1, design: METHODS.takeHome.costHours.design, dropoff: METHODS.takeHome.candidateDropoff, validity: METHODS.takeHome.validity, note: '~62% complete it. In 2026 much of it is AI output: validity ~.20 alone, ~.32 with a live walkthrough.' },
  walkthrough: { label: 'Live walkthrough of the take-home', method: 'takeHome', hours: 0.75, dropoff: 0.03, validity: METHODS.takeHome.validityWithWalkthrough, note: 'They explain and extend their own submission. Exposes undisclosed AI work.' },
  paidTrial: { label: 'Paid trial project (2 days)', method: 'paidTrial', hours: 6, dropoff: METHODS.paidTrial.candidateDropoff, validity: METHODS.paidTrial.validity, days: 2, note: 'Highest realism; costs money and many employed candidates can\'t do it. Needs a contractor agreement with IP assignment.' },
  references: { label: 'Reference calls (candidate-supplied)', method: 'referenceCheck', hours: METHODS.referenceCheck.costHours.perCandidate, dropoff: METHODS.referenceCheck.candidateDropoff, validity: METHODS.referenceCheck.validity, note: 'Lenient — candidates pick their referees. Structured questions help ("would you rehire?", "1–10 vs peers").' },
  backchannel: { label: 'Backchannel references (via your network)', method: 'backchannel', hours: METHODS.backchannel.costHours.perCandidate, dropoff: 0, validity: METHODS.backchannel.validity, note: 'People the candidate didn\'t name. Best at red flags (integrity, inflated numbers). Never call a current employer without consent.' },
};

// Daily rate for a paid trial: hourly × 8 for contractors, salary / 260 for employees.
export const trialDayRate = (c) => (c.engagement === 'contractor' ? c.expectation * 8 : c.expectation / 260);

function dropOff(state, c, p) {
  if (chance(state, p * (c.persona?.otherOffers ? 1.3 : 1))) { c.stage = 'withdrawn'; c.withdrawReason = 'dropped out of the process'; return true; }
  return false;
}

/**
 * Run an assessment on a candidate. Returns { ok, text, redFlags } and pushes evidence onto c.evidence.
 * opts: { scorecard: bool } (structured reference questions)
 */
export function runAssessment(state, c, key, { scorecard = false } = {}) {
  const a = ASSESSMENTS[key];
  if (!a) throw new Error('Unknown assessment.');
  c.assessments ??= {};
  c.evidence ??= [];
  c.redFlags ??= [];
  if (c.assessments[key]) throw new Error('Already done.');
  if (key === 'walkthrough' && !c.assessments.takeHome) throw new Error('Send a take-home first.');
  if (dropOff(state, c, a.dropoff)) { c.assessments[key] = { day: state.day, dropped: true }; return { ok: false, text: `${c.name} dropped out rather than do the ${a.label.toLowerCase()}.`, redFlags: [] }; }
  const add = (target, v, bias = 0, method = a.method) => c.evidence.push({ method, target, v, obs: round2(observe(c, target, v, gaussian(state), 0) + bias) });
  const flags = [];
  let text = '';
  switch (key) {
    case 'workSample': {
      add('composite', a.validity);
      for (const t of workSampleTraits(c.role)) add(t, a.validity);
      if (c.fraud === 'stand_in' && chance(state, 0.6)) flags.push('Struggled to work live on camera; the person seemed different from the earlier call');
      text = `Work sample done. ${roleComposite(c.role, c.traits) + gaussian(state) * 0.5 > 0.3 ? 'Clean, well-reasoned work.' : roleComposite(c.role, c.traits) + gaussian(state) * 0.5 < -0.4 ? 'Shaky: missed obvious issues.' : 'Solid but unremarkable.'}`;
      break;
    }
    case 'takeHome': {
      // Undisclosed AI help inflates craft by ~1 SD on unsupervised work [design from Fabric 2026].
      const bias = c.aiCheat ? 1 : 0;
      add('craft', a.validity, bias * a.validity);
      add('composite', a.validity, bias * 0.5 * a.validity);
      text = `Take-home submitted.${c.aiCheat ? ' It looks polished — maybe suspiciously so.' : ''}`;
      break;
    }
    case 'walkthrough': {
      // Replace the take-home's weak signal with a walkthrough-quality one.
      c.evidence = c.evidence.filter((e) => e.method !== 'takeHome');
      add('craft', a.validity);
      add('composite', a.validity);
      if (c.aiCheat && z(c.traits.craft) < 0.3) flags.push('Could not explain or extend their own take-home (likely AI-generated without understanding)');
      text = flags.length ? 'Walkthrough exposed gaps in their own submission.' : 'They explained and extended their work convincingly.';
      break;
    }
    case 'paidTrial': {
      const cost = round2(trialDayRate(c) * a.days);
      post(state, { amount: -cost, counterparty: c.name, description: `Paid trial project (${a.days} days)`, category: 'contractors', method: 'ach', meta: { app: 'people', candidateId: c.id } });
      add('composite', a.validity);
      for (const t of ['craft', 'conscientiousness', 'communication']) add(t, a.validity * 0.9);
      if (c.fraud === 'stand_in') flags.push('Trial work quality didn\'t match the interviews at all (possible stand-in)');
      if (z(c.traits.integrity) < -1.2 && chance(state, 0.5)) flags.push('Missed a check-in, then over-reported progress');
      text = `Paid trial done (${cost.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}).`;
      break;
    }
    case 'references': {
      const v = scorecard ? METHODS.referenceCheck.validityStructured : a.validity;
      add('composite', v, 0.4 * v); // lenient, pre-selected referees [design]
      add('conscientiousness', v * 0.8, 0.3 * v);
      text = `References were ${z(c.traits.conscientiousness) > -0.5 ? 'warm' : 'polite but brief'}${scorecard ? '; your structured questions got a "6 or 7 out of 10 vs peers" type answer' : ''}.`;
      break;
    }
    case 'backchannel': {
      const linked = state.founder?.network?.linkedin ?? 0;
      const people = state.network?.people?.length ?? 0;
      if (!chance(state, clamp(0.3 + linked / 1000 + people / 50, 0, 0.9))) { c.assessments[key] = { day: state.day, found: false }; return { ok: false, text: 'You couldn\'t find anyone in your network who worked with them.', redFlags: [] }; }
      add('composite', a.validity);
      add('integrity', a.validity);
      if (z(c.traits.integrity) < -1 && chance(state, 0.7)) flags.push('Former colleague: "numbers in their stories were… generous"');
      if (c.fraud === 'stand_in' && chance(state, 0.8)) flags.push('Nobody at their listed employer remembers them in that role');
      if (c.talkerDoer && chance(state, 0.5)) flags.push('Former manager: "great in meetings, light on delivery"');
      const who = state.network?.people?.length ? pick(state, state.network.people).name : 'a former colleague of theirs you reached via LinkedIn';
      text = `Backchannel via ${who}: ${flags.length ? 'concerns raised.' : roleComposite(c.role, c.traits) > 0.4 ? '"Would hire them again in a heartbeat."' : '"Fine. Solid, not a standout."'}`;
      break;
    }
    default: break;
  }
  c.redFlags.push(...flags);
  c.assessments[key] = { day: state.day, text, flags };
  return { ok: true, text, redFlags: flags };
}
