// Archetype hiring loops for the tier-separation tests (inputs only: the questions, methods and timing a
// stellar / good / average / mediocre operator would use, from operator-tiers hiring behaviours).
import { newState } from '../../public/core/state.js';
import { post } from '../../public/core/bank.js';
import { chance } from '../../public/core/util.js';
import { ensureStripe } from '../../public/core/stripe.js';
import { ensureMarket } from '../../public/core/market.js';
import { ROLES as DATA_ROLES } from '../../public/data/roles.js';
import { makeCandidate, roleComposite } from '../../public/apps/people/candidates.js';
import { gradeQuestion, interviewEvidence, estimate } from '../../public/apps/people/interview.js';
import { runAssessment } from '../../public/apps/people/assess.js';
import { ensurePeople, createJob, applyJudge, createScorecard, designWorkSample, screenCandidate } from '../../public/apps/people/sim.js';
import { hireProvenance, replacementP12, clarityMult } from '../../public/apps/people/provenance.js';

const SAMPLE = DATA_ROLES.engineer.sampleQuestions.filter((q) => q.type !== 'work_sample').map((q) => q.text);
const PROBES = ['What exactly did you do, personally?', 'What was the result, in numbers?', 'How did you know it worked?', 'What would you do differently?'];
export const QUESTIONS = {
  stellar: [SAMPLE[0], PROBES[0], PROBES[1], SAMPLE[1], PROBES[0], SAMPLE[2], PROBES[2], SAMPLE[3], PROBES[3]],
  good: [SAMPLE[0], PROBES[0], SAMPLE[1], SAMPLE[2], SAMPLE[3], 'What would you do differently next time?'],
  average: ['Tell me about yourself.', SAMPLE[0], 'Do you like working at startups?', SAMPLE[3], 'What are your strengths?'],
  mediocre: ['Tell me about yourself.', 'What is your biggest weakness?', 'Are you a team player?', 'Do you enjoy fast-paced environments?', 'Where do you see yourself in five years?'],
};
export const LOOP = {
  // bar: the minimum read (z of the posterior) a careful operator needs before hiring; below it they source
  // another batch of finalists instead of hiring the best of a weak batch (batches = max searches).
  stellar: { scorecard: true, workSample: true, references: true, backchannel: true, offerDelay: 1, bar: 0.9, batches: 4 },
  good: { scorecard: true, workSample: false, references: true, backchannel: false, offerDelay: 4, bar: 0.5, batches: 2 },
  average: { scorecard: false, workSample: false, references: false, backchannel: false, offerDelay: 12, bar: -Infinity, batches: 1 },
  mediocre: { scorecard: false, workSample: false, references: false, backchannel: false, offerDelay: 20, bar: -Infinity, batches: 1 },
};

export function freshState(seed) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  s.founder.network = { ...(s.founder.network ?? {}), linkedin: 600 };
  return s;
}

/** n finalists for one engineering role (same pool across tiers when built from the same seed). */
export function finalists(seed, n = 8) {
  const s = freshState(seed);
  const job = createJob(s, { role: 'engineer', region: 'us', engagement: 'contractor', text: 'x' });
  let k = 0;
  return Array.from({ length: n }, () => makeCandidate(s, job, null, (x) => `${x}_${seed}_${k++}`));
}

/**
 * Run one tier's loop. Batch b uses finalists(seed + 1000*b), so every tier sees the same first batch and the
 * same later batches. Returns the chosen candidate, its provenance, hidden fit, batches used and P12.
 */
export function runLoop(tier, seed, pool = finalists(seed)) {
  const s = freshState(seed * 7919 + tier.length);
  const p = ensurePeople(s);
  const cfg = LOOP[tier];
  const job = createJob(s, { role: 'engineer', region: 'us', engagement: 'contractor', text: 'x' });
  const post = tier === 'mediocre' ? { clarity: 4, specificity: 3, payTransparency: false } : { clarity: 7, specificity: 7, payTransparency: true };
  applyJudge(job, { firstImpression: '', issues: [], rewriteHint: '', ...post });
  if (cfg.scorecard) createScorecard(s, job.id, { mission: 'Own billing', outcomes: ['Ship annual billing with proration tests by day 60', 'Cut p95 dashboard latency below 800ms by day 90'], competencies: ['craft', 'gma', 'conscientiousness', 'agency'] });
  if (cfg.workSample) designWorkSample(s, job.id);
  const careful = tier === 'stellar' || tier === 'good';
  let best = null, batches = 0;
  for (let b = 0; b < cfg.batches; b++) {
    batches++;
    const src = b === 0 ? pool : finalists(seed + 1000 * b);
    const cands = src.map((c) => ({ ...structuredClone(c), jobId: job.id, stage: 'new' }));
    p.candidates.push(...cands);
    for (const c of cands) {
      screenCandidate(s, c.id, true);
      const graded = [];
      let prev = null;
      for (const q of QUESTIONS[tier]) { const g = gradeQuestion(q, 'engineer', prev); graded.push(g); prev = g; }
      const res = interviewEvidence(s, c, graded, { scorecard: cfg.scorecard });
      c.evidence.push(...res.evidence);
      c.interview = { day: s.day, done: true, execution: res.execution, validity: res.validity, messages: [] };
      if (cfg.workSample && c.stage !== 'withdrawn') runAssessment(s, c, 'workSample', { scorecard: true });
      if (cfg.references && c.stage !== 'withdrawn') runAssessment(s, c, 'references', { scorecard: cfg.scorecard });
      if (cfg.backchannel && c.stage !== 'withdrawn') runAssessment(s, c, 'backchannel');
    }
    const ranked = cands.filter((c) => c.stage !== 'withdrawn')
      .map((c) => ({ c, z: estimate(c.evidence, 'composite')?.z ?? 0, flags: c.redFlags?.length ?? 0 }))
      .filter((x) => !careful || x.flags === 0)
      .sort((a, b2) => b2.z - a.z);
    if (ranked[0] && (!best || ranked[0].z > best.z)) best = ranked[0];
    if (best && best.z >= cfg.bar) break;
  }
  // Slow offers lose candidates who have other processes running (the sim's idle-withdrawal hazard, condensed):
  // the operator then hires the next-best read.
  let chosen = best.c;
  const pGone = (c) => 1 - Math.pow(c.persona?.otherOffers ? 0.95 : 0.985, Math.max(0, cfg.offerDelay - 2));
  if (chance(s, pGone(chosen))) {
    const alt = p.candidates.filter((c) => c !== chosen && c.stage !== 'withdrawn' && (!careful || !(c.redFlags?.length)))
      .map((c) => ({ c, z: estimate(c.evidence, 'composite')?.z ?? 0 })).sort((a, b) => b.z - a.z)[0];
    if (alt) chosen = alt.c;
  }
  chosen.offer = { sentDay: s.day + cfg.offerDelay };
  const pv = hireProvenance(s, job, chosen);
  const fit = chosen.fraud ? -2 : roleComposite('engineer', chosen.traits);
  return { chosen, pv, fit, batches, p12: replacementP12(fit, { fraud: chosen.fraud, clarity: clarityMult(pv) }) };
}
