// Hiring pipeline logic (Ashby-lite): job-post judging heuristics, candidate generation, interview
// signal, offer acceptance and ramp. Pure functions; randomness only via rng(state).

import { rng, gaussian, clamp, pick, words, round2 } from '../../core/util.js';
import { ROLES, REGIONS, midSalary, midHourly } from './catalog.js';
import { roleComposite } from './candidates.js';

const BUZZ = ['rockstar', 'ninja', 'guru', 'wear many hats', 'fast-paced', 'family', 'work hard play hard', 'unlimited pto', 'passionate', 'self-starter', 'synergy', '10x', 'world-class'];

// Offline job-post judge: clarity & specificity of the role. Same shape as the LLM schema.
export function heuristicPostJudge(post) {
  const text = String(post.text ?? '');
  const t = text.toLowerCase();
  const n = words(text);
  const hasPay = /\$\s?\d|\d+\s?k\b|usd|per hour|\/hr|salary range/i.test(text) || (post.payLo > 0 && post.payHi > 0);
  const outcomes = /(first 30|first 60|first 90|30\/60\/90|in your first|by month|you will own|you'll own|success looks like)/i.test(text);
  const resp = (t.match(/you will|you'll|responsib|own the|build|ship|design|run /g) ?? []).length;
  const reqs = /(you have|requirements|must have|experience with|you've)/i.test(text);
  const context = /(we are|we're|our customers|stage|team of|founder|revenue|mrr|arr|customers)/i.test(text);
  const process = /(interview|process|steps|take-home|paid trial|timeline)/i.test(text);
  const numbers = (text.match(/\d+/g) ?? []).length;
  const buzz = BUZZ.filter((b) => t.includes(b)).length;
  const yearsAbsurd = /(10|12|15)\+ years/.test(t) && post.role !== 'engineer';
  const clarity = clamp(2 + (n > 120 ? 2 : n > 60 ? 1 : -1) + (resp >= 3 ? 2 : resp ? 1 : 0) + (reqs ? 1 : 0) + (context ? 1 : 0) + (process ? 1 : 0) - buzz * 0.8, 1, 10);
  const specificity = clamp(1 + (outcomes ? 3 : 0) + Math.min(3, numbers * 0.4) + (hasPay ? 1.5 : 0) + (context ? 1 : 0) - buzz * 0.7 - (yearsAbsurd ? 1 : 0), 1, 10);
  const issues = [
    !hasPay && 'No pay range. Required in many US states and under the EU Pay Transparency Directive; posts without one get fewer, worse applicants.',
    !outcomes && 'Doesn\'t say what success looks like in the first 30/60/90 days.',
    resp < 2 && 'Responsibilities are vague: what will this person actually own?',
    !context && 'No company context (stage, customers, team size). Good candidates screen you too.',
    buzz > 0 && `Clichés that repel senior candidates: ${BUZZ.filter((b) => t.includes(b)).join(', ')}.`,
    n < 60 && 'Too short to judge the role.',
    yearsAbsurd && 'Unrealistic years-of-experience requirement.',
  ].filter(Boolean);
  return {
    firstImpression: issues.length > 3 ? 'Generic post. I can\'t tell what I\'d own or what it pays, so I\'d skip it.' : issues.length ? 'Decent, but a few gaps would make me hesitate to apply.' : 'Clear, specific role with pay and outcomes. I\'d apply.',
    clarity: Math.round(clarity), specificity: Math.round(specificity), payTransparency: hasPay,
    issues, rewriteHint: issues[0] ?? 'Add one concrete example of a problem they would solve in month one.',
  };
}

export const POST_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['firstImpression', 'clarity', 'specificity', 'payTransparency', 'issues', 'rewriteHint'],
  properties: {
    firstImpression: { type: 'string', description: 'One or two blunt sentences, as a strong candidate skimming the post.' },
    clarity: { type: 'number', description: '1-10: do I understand what I would own, for whom, and how I would be judged?' },
    specificity: { type: 'number', description: '1-10: concrete outcomes, stack/tools, numbers, stage; not generic boilerplate.' },
    payTransparency: { type: 'boolean', description: 'Does the post state a real pay range?' },
    issues: { type: 'array', items: { type: 'string' } },
    rewriteHint: { type: 'string' },
  },
};

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

export function candidatePersonaPrompt(state, cand, job) {
  const q = candQuality(cand);
  const level = q > 0.7 ? 'a genuinely strong candidate: specific, uses numbers, admits mistakes, asks sharp questions' : q > 0.4 ? 'a solid but unremarkable candidate: some specifics, some vagueness' : 'a weak candidate who sounds fine but is vague, overclaims team work as your own and dodges specifics';
  return `You are ${cand.name}, a ${cand.years}-year ${ROLES[cand.role]?.label ?? cand.role} based in ${cand.location}, interviewing for "${job?.title ?? ROLES[cand.role].label}" at ${state.company.name}, a ${state.company.path === 'vc' ? 'venture-backed' : 'bootstrapped'} startup (${state.company.oneLiner || 'early-stage SaaS'}). The year is 2026. You are ${level}. Communication style: ${cand.persona.style}. Your main concern: ${cand.persona.concern}. ${cand.persona.otherOffers ? 'You have other offers in process.' : ''} Your expectation: ${cand.engagement === 'contractor' ? `$${cand.expectation}/hour` : `$${cand.expectation.toLocaleString('en-US')} base per year`}. Answer only what is asked; do not invent impressive achievements beyond your level. You are evaluating the founder too: vague answers about runway, role or pay lower your interest.`;
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
  return contractor ? midHourly(role, region) : midSalary(role, region);
}

export const regionLabel = (r) => REGIONS[r]?.short ?? r;
