// Hiring pipeline logic (Ashby-lite): job-post judging heuristics, candidate generation, interview
// signal, offer acceptance and ramp. Pure functions; randomness only via rng(state).

import { rng, gaussian, clamp, pick, words, round2 } from '../../core/util.js';
import { ROLES, REGIONS, midSalary, midHourly } from './catalog.js';
import { roleComposite } from './candidates.js';
import { heuristicPostJudgeR, JOB_POST_SCHEMA_R } from './judge-rubrics.js';

const BUZZ = ['rockstar', 'ninja', 'guru', 'wear many hats', 'fast-paced', 'family', 'work hard play hard', 'unlimited pto', 'passionate', 'self-starter', 'synergy', '10x', 'world-class'];

// Offline job-post judge: scores the same criteria as the LLM rubric (people/judge-rubrics.js); clarity and
// specificity (1-10) are derived from them with fixed weights. Same shape as the LLM schema.
export const heuristicPostJudge = (post) => heuristicPostJudgeR(post);

// One integer per criterion + first impression, pay flag, issues and rewrite hint.
export const POST_SCHEMA = JOB_POST_SCHEMA_R;

// 0..1 post quality from a judge result.
export const postQuality = (j) => clamp(((j.clarity + j.specificity) / 20) * (j.payTransparency ? 1.1 : 0.85), 0, 1);

export const CANDIDATE_MAIL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reply', 'sentiment'],
  properties: {
    reply: { type: 'string', description: 'Your email reply, in character, 1-6 sentences.' },
    sentiment: { type: 'number', description: '-1 to 1: how the founder\'s message changed your willingness to accept.' },
  },
};

// 0..1 quality: legacy field, else from the hidden role composite (−2..+2 SD).
export const candQuality = (cand) => cand.quality ?? clamp((roleComposite(cand.role, cand.traits ?? {}) + 2) / 4, 0, 1);

// What a candidate can actually know: the posted pay range, the market rate for this role and region (they
// benchmark on Levels/Glassdoor/peers), the company's visible stage risk, and any offer in writing. Never the
// company's internal metrics unless the founder tells them.
const fmtPay = (v, contractor) => (contractor ? `$${Math.round(v)}/hour` : `$${Math.round(v / 1000)}K`);
export function candidateMarketBlock(state, cand, job) {
  const contractor = cand.engagement === 'contractor';
  const mid = marketMid(cand.role, cand.region ?? job?.region ?? 'us', contractor);
  const lines = [];
  if (mid) lines.push(`Market rate you benchmark against for this role in ${REGIONS[cand.region ?? job?.region]?.label ?? 'your region'}: about ${fmtPay(mid, contractor)}${contractor ? '' : ' base'} (median).`);
  if (job?.payLo && job?.payHi) lines.push(`The job post listed ${fmtPay(job.payLo, contractor)}-${fmtPay(job.payHi, contractor)}.`); else lines.push('The job post did not list pay.');
  const team = (state.apps?.people?.members ?? []).filter((m) => m.status === 'active' && m.kind !== 'ai_agent').length;
  const funded = (state.bank?.txns ?? []).some((t) => t.category === 'investment');
  lines.push(`Stage risk you can see: an early ${state.company.path === 'vc' ? (funded ? 'venture-backed startup that has raised money' : 'startup that says it is raising venture money but has not announced a round') : 'bootstrapped startup with no outside funding'}, founder${team ? ` + ${team} employee${team > 1 ? 's' : ''}` : ' only'}. You do not know its revenue or runway unless the founder tells you; most seed startups fail, so you discount equity heavily and ask about runway.`);
  if (cand.stage === 'offer' && cand.offer) lines.push(`The written offer: ${contractor ? `$${cand.offer.hourlyRate}/hour` : `$${Math.round((cand.offer.salary ?? 0)).toLocaleString('en-US')} base`}${cand.offer.equityPct ? ` + ${cand.offer.equityPct}% equity` : ''} versus your expectation of ${contractor ? `$${cand.expectation}/hour` : `$${cand.expectation.toLocaleString('en-US')}`}. Below your expectation or the market rate is a real problem for you; you weigh it against the risk.`);
  return lines.join(' ');
}

export function candidatePersonaPrompt(state, cand, job) {
  const q = candQuality(cand);
  const level = q > 0.7 ? 'a genuinely strong candidate: specific, uses numbers, admits mistakes, asks sharp questions' : q > 0.4 ? 'a solid but unremarkable candidate: some specifics, some vagueness' : 'a weak candidate who sounds fine but is vague, overclaims team work as your own and dodges specifics';
  return `You are ${cand.name}, a ${cand.years}-year ${ROLES[cand.role]?.label ?? cand.role} based in ${cand.location}, interviewing for "${job?.title ?? ROLES[cand.role].label}" at ${state.company.name}, a ${state.company.path === 'vc' ? 'venture-backed' : 'bootstrapped'} startup (${state.company.oneLiner || 'early-stage SaaS'}). The year is 2026. You are ${level}. Communication style: ${cand.persona.style}. Your main concern: ${cand.persona.concern}. ${cand.persona.otherOffers ? 'You have other offers in process.' : ''} Your expectation: ${cand.engagement === 'contractor' ? `$${cand.expectation}/hour` : `$${cand.expectation.toLocaleString('en-US')} base per year`}. ${candidateMarketBlock(state, cand, job)} Answer only what is asked; do not invent impressive achievements beyond your level. You are evaluating the founder too: vague answers about runway, role or pay lower your interest; pay well below market or a short runway makes you hesitant unless the equity and the role clearly make up for it.`;
}

/**
 * Probability a candidate accepts an offer (pure).
 * offer: { salary | hourlyRate, equityPct }; ctx: { path, incorporated, entity, runwayMonths, raised, hireIndex }
 */
export function acceptProbability(cand, offer, ctx) {
  const contractor = cand.engagement === 'contractor';
  const offered = contractor ? offer.hourlyRate : offer.salary;
  const ratio = offered / Math.max(1, cand.expectation);
  // Calibrated to offer-acceptance benchmarks: Ashby startups ~80% (technical 73%, business 84%), Gem 82%
  // (realism review F12). Offer at expectation → ~0.8 median candidate; 10% below → ~0.5.
  let p = 1 / (1 + Math.exp(-12 * (ratio - 0.88)));
  if (!contractor) {
    const bench = (ROLES[cand.role]?.equityBench ?? 0.3) * Math.max(0.3, 1 - 0.18 * (ctx.hireIndex ?? 0));
    const eq = clamp((offer.equityPct ?? 0) / bench, 0, 1.5);
    p += ctx.entity === 'ccorp' ? 0.08 * (eq - 0.3) : 0;
    if (!ctx.incorporated) p -= 0.2;
    if (ctx.raised) p += 0.05;
  }
  if (ctx.runwayMonths != null && ctx.runwayMonths < 6) p -= contractor ? 0.05 : 0.15;
  p -= (candQuality(cand) - 0.5) * 0.15 * (cand.persona?.otherOffers ? 1 : 0.5);
  p += ((cand.interest ?? 0.5) - 0.5) * 0.3;
  p += cand.offerSentiment ?? 0;
  return clamp(p, 0.03, 0.95);
}

// Ramp: 25% productive on day one, linear to 100% at rampWeeks [A shape; durations from research].
export function rampFactor(m, day) {
  if (m.kind === 'ai_agent') return day >= (m.readyDay ?? m.startDay) ? 1 : 0;
  if (day < m.startDay) return 0;
  const weeks = m.rampWeeks ?? ROLES[m.role]?.rampWeeks ?? 6;
  return clamp(0.25 + 0.75 * ((day - m.startDay) / (weeks * 7)), 0.25, 1);
}

export function marketMid(role, region, contractor) {
  region = REGIONS[region] ? region : 'us'; // old saves: members recorded before regions existed are US hires
  return contractor ? midHourly(role, region) : midSalary(role, region);
}

export const regionLabel = (r) => REGIONS[r]?.short ?? r;
