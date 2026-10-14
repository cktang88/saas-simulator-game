// Co-founder search: candidate pool, odds and equity math. Pure (no DOM).
// Numbers: public/data/world.js COFOUNDER (docs/research/world-ops-support-life.md §6). [design] values marked.

import { clamp } from '../../core/util.js';
import { COFOUNDER as CF_DATA } from '../../data/world.js';

export const CF = CF_DATA ?? {
  equity: { equalSplitTwoFounders2024: 0.459, medianSplit: [51, 49] },
  departures: { vcBackedLoseCofounderByYear4: 0.25 },
  matching: { ycInviteAcceptance: 0.25 },
  search: { trialMonths: [1, 3], hoursPerMonth: 10, funnelPerMonth: { profilesViewed: [15, 40], introCalls: [4, 10], deepConversations: [1, 2], trialStarts: [0.15, 0.35] }, trialSuccess: [0.35, 0.55], annualBreakupHazard: { years1to3: [0.08, 0.1], after: 0.03, strangersNoTrialMult: 1.5, priorColleaguesMult: 0.7 }, breakupDisruptionWeeks: [4, 12] },
  vesting: { resetCreditAtPricedRound: [0.1, 0.25] },
};

export const SKILLS = {
  technical: { label: 'Technical (engineering / AI)', memberRole: 'engineer' },
  business: { label: 'Business (sales / BD)', memberRole: 'ae' },
  growth: { label: 'Growth / marketing', memberRole: 'marketer' },
  design: { label: 'Product / design', memberRole: 'designer' },
  ops: { label: 'Operations / finance', memberRole: 'ops' },
};

// Which co-founder skill complements the founder, by business model. [design]
export function neededSkill(model, mySkill) {
  if (mySkill !== 'technical') return 'technical';
  return model === 'b2c' ? 'growth' : 'business';
}

const FIRST = ['Alex', 'Jordan', 'Sam', 'Priya', 'Mateo', 'Hana', 'Leo', 'Zara', 'Noah', 'Ines', 'Kofi', 'Mei', 'Arjun', 'Clara', 'Tariq', 'Elif', 'Ryan', 'Yuki', 'Bianca', 'Omar'];
const LAST = ['Reyes', 'Kowalski', 'Nair', 'Lindqvist', 'Mensah', 'Takeda', 'Duval', 'Brennan', 'Haddad', 'Ivanova', 'Osei', 'Petrov', 'Sato', 'Varga', 'Quinn', 'Bauer', 'Costa', 'Iqbal', 'Morales', 'Weiss'];
const CITIES = [['San Francisco', 0], ['New York', 3], ['Austin', 2], ['London', 8], ['Berlin', 9], ['Toronto', 3], ['Bangalore', 12.5], ['São Paulo', 5], ['Remote (US)', 1], ['Lisbon', 8]];
const BACKGROUNDS = {
  technical: ['senior engineer at a Series B fintech', 'ML engineer who shipped LLM features to production', 'full-stack dev who built two side projects with paying users', 'staff engineer at a big-tech company, never worked at a startup', 'ex-CTO of a seed-stage startup that shut down'],
  business: ['account executive who closed mid-market deals', 'ex-founder of a services agency', 'BD lead at a SaaS company selling to', 'consultant who advised', 'operator who ran a team of 10 at'],
  growth: ['growth marketer who scaled paid social for a consumer app', 'content/SEO lead with a 20k newsletter', 'performance marketer at a DTC brand', 'creator with an audience in the niche'],
  design: ['product designer at a design-led SaaS', 'PM who shipped onboarding redesigns', 'design engineer who prototypes in code'],
  ops: ['finance lead at a 50-person startup', 'operations manager who knows', 'chief of staff at a seed-stage company'],
};
const COMMIT = [['full-time now', 0.45], ['full-time in 2–3 months', 0.35], ['part-time first', 0.2]];
const FLAGS = ['wants the CEO title', 'reluctant to accept vesting', 'needs a salary from day one', 'has another idea they keep coming back to', 'moving countries next year', null, null, null, null, null];

/**
 * Generate one candidate profile. rand: () => [0,1). Conditioned on the player's model/ICP and their needed skill.
 * source 'matching' (YC-style platform, strangers) or 'network' (some are prior colleagues).
 */
export function generateCandidate({ model, icp = '', need = 'technical', source = 'matching', rand }) {
  const roll = rand();
  const skill = roll < 0.6 ? need : Object.keys(SKILLS)[Math.floor(rand() * 5)];
  const first = FIRST[Math.floor(rand() * FIRST.length)], last = LAST[Math.floor(rand() * LAST.length)];
  const [city, tz] = CITIES[Math.floor(rand() * CITIES.length)];
  const years = Math.round(2 + rand() * 14);
  const bgList = BACKGROUNDS[skill];
  let bg = bgList[Math.floor(rand() * bgList.length)];
  const icpShort = (icp || (model === 'b2c' ? 'consumers' : 'small businesses')).split(/[.,;]/)[0].slice(0, 60);
  if (/to$|advised$|at$|knows$/.test(bg)) bg += ` ${icpShort}`;
  const domainFit = rand() < 0.3; // some have real domain experience in your ICP
  let c = 0, commit = COMMIT[0][0];
  const cr = rand();
  for (const [k, p] of COMMIT) { c += p; if (cr <= c) { commit = k; break; } }
  const quality = clamp(0.25 + rand() * 0.6 + (domainFit ? 0.1 : 0) + (years > 8 ? 0.05 : 0), 0, 1); // hidden
  const salaryNeed = rand() < 0.35 ? Math.round((4000 + rand() * 6000) / 500) * 500 : 0;
  return {
    name: `${first} ${last}`,
    skill, memberRole: SKILLS[skill].memberRole,
    years, background: `${years} years: ${bg}${domainFit ? `; has worked with ${icpShort} directly` : ''}`,
    city, tzDiff: tz, commitment: commit, salaryNeed,
    priorStartup: rand() < 0.35,
    priorColleague: source === 'network' && rand() < 0.5,
    source, domainFit,
    flag: FLAGS[Math.floor(rand() * FLAGS.length)],
    quality, interest: clamp(0.3 + rand() * 0.4, 0, 1),
  };
}

// Invite acceptance: YC matching reported 25% invite acceptance; scaled by your profile and traction. [design]
export function inviteAcceptance({ profileQuality = 3, traction = 0, cand }) {
  const base = CF.matching.ycInviteAcceptance ?? 0.25;
  const fit = cand.source === 'network' ? 1.6 : 1;
  return clamp(base * (0.5 + 0.25 * profileQuality) * (1 + Math.min(0.6, traction)) * fit * (cand.quality > 0.75 ? 0.75 : 1), 0.03, 0.85);
}

// Fair-ish equity expectation for a co-founder joining now. Equal split is the 2024–25 norm for two founders
// at founding (~46% split exactly equally; median 51/49); joining after progress earns less. [design]
export function equityExpectation({ cand, monthsIn = 0, mrr = 0, raised = 0 }) {
  const atFounding = 0.5;
  const progress = clamp(monthsIn / 24 + Math.log10(1 + mrr / 1000) * 0.12 + Math.log10(1 + raised / 100000) * 0.08, 0, 0.75);
  const q = 0.75 + 0.5 * cand.quality; // stronger candidates expect more
  return clamp(atFounding * (1 - progress) * q, 0.05, 0.5);
}

// Probability they accept an offer. offer: { pct, vesting: 'standard'|'credit'|'none', salary, title }
export function offerAcceptance({ cand, offer, expectation }) {
  const ratio = offer.pct / Math.max(0.01, expectation);
  let p = 1 / (1 + Math.exp(-9 * (ratio - 0.92)));
  if (offer.vesting === 'credit') p += 0.06;
  if (offer.vesting === 'none') p += 0.04;
  if (cand.salaryNeed > 0 && (offer.salary ?? 0) < cand.salaryNeed * 0.8) p -= 0.35;
  if (cand.flag === 'wants the CEO title' && offer.title !== 'CEO') p -= 0.2;
  if (cand.flag === 'reluctant to accept vesting' && offer.vesting === 'standard') p -= 0.15;
  p += (cand.interest - 0.5) * 0.4;
  return clamp(p, 0.02, 0.95);
}

// Trial success (both want to continue): 35–55% [design], driven by hidden quality, fit and your engagement.
export function trialSuccessProb({ cand, checkInRate = 1, months = 2 }) {
  const [lo, hi] = CF.search.trialSuccess;
  const base = lo + (hi - lo) * cand.quality;
  return clamp(base * (0.7 + 0.3 * clamp(checkInRate, 0, 1)) * (cand.commitment === 'part-time first' ? 0.85 : 1) * (months >= 2 ? 1.05 : 0.95) * (cand.flag ? 0.9 : 1), 0.1, 0.75);
}

// Daily breakup hazard. Annual 8–10% in years 1–3, ~3% after; ×1.5 strangers without a trial, ×0.7 prior colleagues.
export function breakupHazard({ yearsTogether, trialDone, priorColleague, energy = 70 }) {
  const h = CF.search.annualBreakupHazard;
  let annual = yearsTogether < 3 ? (h.years1to3[0] + h.years1to3[1]) / 2 : h.after;
  if (!trialDone && !priorColleague) annual *= h.strangersNoTrialMult;
  if (priorColleague) annual *= h.priorColleaguesMult;
  if (energy < 30) annual *= 1.3; // [design] burnout strains partnerships
  return 1 - Math.pow(1 - annual, 1 / 365);
}

// Vested fraction: 4-year schedule, 1-year cliff, optional up-front credit (10–25% typical at a reset).
export function vestedFraction({ startDay, day, years = 4, cliffMonths = 12, credit = 0 }) {
  const months = (day - startDay) / 30.4;
  const sched = months < cliffMonths ? 0 : clamp(months / (years * 12), 0, 1);
  return clamp(credit + (1 - credit) * sched, 0, 1);
}

// Shares to issue so the new co-founder holds `pct` of the fully diluted company after issuance.
export const sharesForPct = (fd, pct) => Math.round((fd * pct) / (1 - pct));

export const PROFILE_SCHEMA = { type: 'object', additionalProperties: false, required: ['quality', 'feedback'], properties: { quality: { type: 'number', description: '1-5 how compelling this co-founder profile is to strong candidates' }, feedback: { type: 'string' } } };
export const CHAT_SCHEMA = { type: 'object', additionalProperties: false, required: ['reply', 'interest_change'], properties: { reply: { type: 'string' }, interest_change: { type: 'number', description: '-1..1: how this exchange changed your interest in partnering' } } };
export const CALL_SCHEMA = { type: 'object', additionalProperties: false, required: ['interest', 'concerns', 'summary'], properties: { interest: { type: 'number', description: '1-5 your interest in a trial project together' }, concerns: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } } };

export function heuristicProfile(text) {
  const t = String(text ?? '').toLowerCase();
  const n = t.split(/\s+/).filter(Boolean).length;
  const q = clamp(1.5 + Math.min(1.5, n / 120) + (/\$\s?\d|\d+ (customers|users)|mrr/.test(t) ? 0.8 : 0) + (/(looking for|you)/.test(t) ? 0.4 : 0) + (/(equity|vest|full-time)/.test(t) ? 0.3 : 0), 1, 5);
  return { quality: +q.toFixed(1), feedback: 'Offline heuristic: specific traction, what you need, commitment and equity expectations make a profile credible.' };
}
