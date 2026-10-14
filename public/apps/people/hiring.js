// Hiring pipeline logic (Ashby-lite): job-post judging heuristics, candidate generation, interview
// signal, offer acceptance and ramp. Pure functions; randomness only via rng(state).

import { rng, gaussian, clamp, pick, words, round2 } from '../../core/util.js';
import { ROLES, CHANNELS, REGIONS, midSalary, midHourly } from './catalog.js';

const NAMES = {
  us: { first: ['Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Jamie', 'Drew', 'Quinn', 'Hayden', 'Parker', 'Reese'], last: ['Miller', 'Brooks', 'Reed', 'Hughes', 'Price', 'Bennett', 'Foster', 'Ward', 'Sullivan', 'Hayes', 'Park', 'Nguyen'] },
  latam: { first: ['Camila', 'Mateo', 'Valentina', 'Santiago', 'Lucía', 'Sebastián', 'Isabela', 'Joaquín', 'Mariana', 'Thiago'], last: ['González', 'Rodríguez', 'Fernández', 'Pereira', 'Silva', 'Martínez', 'Souza', 'Ramírez', 'Castro', 'Rojas'] },
  eeu: { first: ['Andrii', 'Katarzyna', 'Mihai', 'Ana', 'Tomasz', 'Petra', 'Bogdan', 'Ivana', 'Marek', 'Oksana'], last: ['Kowalski', 'Novák', 'Popescu', 'Horvat', 'Shevchenko', 'Nowak', 'Petrov', 'Ionescu', 'Kovač', 'Dvořák'] },
  india: { first: ['Aarav', 'Ananya', 'Rohan', 'Priya', 'Vikram', 'Diya', 'Karthik', 'Meera', 'Arjun', 'Sneha'], last: ['Sharma', 'Iyer', 'Reddy', 'Gupta', 'Nair', 'Menon', 'Rao', 'Kulkarni', 'Banerjee', 'Joshi'] },
};
const CITIES = { us: ['Austin, TX', 'Denver, CO', 'Brooklyn, NY', 'Oakland, CA', 'Raleigh, NC', 'Columbus, OH', 'Seattle, WA'], latam: ['Buenos Aires', 'São Paulo', 'Medellín', 'Mexico City', 'Montevideo', 'Santiago'], eeu: ['Kraków', 'Kyiv', 'Bucharest', 'Belgrade', 'Brno', 'Zagreb'], india: ['Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Gurugram'] };

const SIGNALS = {
  engineer: { good: ['Shipped a product end-to-end at a seed-stage startup', 'Active open-source maintainer', 'Built and ran a production Postgres at scale', 'Writes clear design docs (linked)', 'Uses coding agents daily with a review workflow', 'Owned on-call for a payments system'], bad: ['Mostly maintenance work on a legacy monolith', 'Job hopped every 8 months', 'Portfolio is tutorial projects', 'Vague about what they personally built'] },
  designer: { good: ['Portfolio shows research → shipped outcomes', 'Designed onboarding that lifted activation (with numbers)', 'Comfortable in code (ships CSS)'], bad: ['Dribbble shots, no shipped work', 'Only agency work, no product iteration'] },
  ae: { good: ['Hit 110%+ of quota 3 years running (verifiable)', 'Sold to your ICP before', 'Has run full-cycle deals without SDR support'], bad: ['Only sold inbound at a big brand', 'Quota attainment unclear', 'Needs a big sales stack to function'] },
  sdr: { good: ['Booked 15+ meetings/month at last job', 'Writes sharp, researched first lines', 'Knows deliverability basics'], bad: ['Only used high-volume templates', 'No metrics on CV'] },
  support: { good: ['Writes great help-center articles', 'Handled technical tier-2 tickets', 'Calm de-escalation examples'], bad: ['Script-only call-center background', 'Weak written English'] },
  marketer: { good: ['Grew a newsletter from 0 to 10k', 'Ranks for real keywords (shows Search Console)', 'Ran paid tests with clear kill rules'], bad: ['Lists tools, not results', 'Only brand work at large companies'] },
  ops: { good: ['Closed books monthly at a startup', 'Set up payroll and HR from scratch'], bad: ['Only worked inside large ERP teams'] },
};

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

// Expected shortlist-worthy applicants per day for a job post.
export function arrivalRate(job) {
  const q = job.quality ?? 0.4;
  let r = 0;
  for (const ch of job.channels ?? []) {
    const c = CHANNELS[ch];
    if (!c) continue;
    if (c.contractorOnly && job.engagement !== 'contractor') continue;
    if (c.employeeOnly && job.engagement === 'contractor') continue;
    let rate = c.rate;
    if (c.roles && !c.roles.includes(job.role)) rate *= 0.5;
    r += rate / 7;
  }
  return r * (0.5 + q) * (job.payTransparency ? 1.15 : 0.85);
}

// Generate one candidate for a job, attributed to one of its channels.
export function makeCandidate(state, job, uidFn) {
  const chans = (job.channels ?? []).filter((c) => CHANNELS[c] && !(CHANNELS[c].contractorOnly && job.engagement !== 'contractor') && !(CHANNELS[c].employeeOnly && job.engagement === 'contractor'));
  const channel = chans.length ? pick(state, chans) : 'network';
  const ch = CHANNELS[channel];
  const region = job.region;
  const q = clamp(ch.quality + ((job.quality ?? 0.4) - 0.5) * 0.3 + gaussian(state) * 0.18, 0.02, 0.98);
  const names = NAMES[region] ?? NAMES.us;
  const first = pick(state, names.first), last = pick(state, names.last);
  const contractor = job.engagement === 'contractor';
  const [lo, hi] = contractor ? ROLES[job.role].hourly[region] : ROLES[job.role].salary[region];
  const pos = clamp(0.2 + 0.65 * q + gaussian(state) * 0.12, 0, 1.15);
  const expectation = contractor ? Math.round(lo + (hi - lo) * pos) : Math.round((lo + (hi - lo) * pos) / 1000) * 1000;
  const sig = SIGNALS[job.role] ?? SIGNALS.engineer;
  // Visible signals are noisy: good candidates usually show more good signals, but not always.
  const signals = [];
  const nGood = clamp(Math.round(q * 3 + gaussian(state) * 0.8), 0, 3);
  const nBad = clamp(Math.round((1 - q) * 2 + gaussian(state) * 0.7), 0, 2);
  const goods = [...sig.good], bads = [...sig.bad];
  for (let i = 0; i < nGood && goods.length; i++) signals.push({ text: goods.splice(Math.floor(rng(state) * goods.length), 1)[0], tone: 'good' });
  for (let i = 0; i < nBad && bads.length; i++) signals.push({ text: bads.splice(Math.floor(rng(state) * bads.length), 1)[0], tone: 'bad' });
  if (!signals.length) signals.push({ text: 'Generic resume: titles and tech stack, no outcomes', tone: 'neutral' });
  const years = clamp(Math.round(3 + q * 8 + gaussian(state) * 2), 1, 20);
  return {
    id: uidFn('cand'), jobId: job.id, role: job.role, region, engagement: job.engagement,
    name: `${first} ${last}`, email: `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[^a-z.]/g, '') + '@mail.com',
    location: pick(state, CITIES[region] ?? CITIES.us), years, channel,
    quality: round2(q), expectation, signals,
    persona: {
      style: pick(state, ['direct and concise', 'warm and talkative', 'reserved, answers briefly', 'confident, a bit salesy']),
      concern: pick(state, ['stability and runway', 'scope and ownership', 'compensation', 'remote flexibility', 'equity upside', 'working with a solo founder']),
      otherOffers: rng(state) < 0.25 + q * 0.4,
    },
    appliedDay: state.day, lastTouchDay: state.day, stage: 'new', estimate: null, interest: round2(clamp(0.45 + gaussian(state) * 0.15, 0.1, 0.9)),
    interview: null, offer: null,
  };
}

// How much signal the founder's interview questions extract (0..1).
export function interviewSignal(messages) {
  const qs = messages.filter((m) => m.from === 'me').map((m) => m.text.toLowerCase());
  if (!qs.length) return 0;
  const strong = /(tell me about a time|walk me through|how did you|what did you|example|trade-?off|what would you do|debug|metric|numbers|last (time|project)|specifically|why did|what went wrong|how would you (design|approach)|take-home|pair)/;
  const weak = /(are you a team player|do you like|are you passionate|what('s| is) your (biggest )?weakness|where do you see yourself)/;
  let s = 0;
  for (const q of qs) s += (strong.test(q) ? 1 : 0.35) - (weak.test(q) ? 0.4 : 0) + (q.length > 80 ? 0.15 : 0);
  return clamp(s / 6, 0, 1);
}

// Noisy quality estimate after an interview: better questions → tighter estimate.
export function qualityEstimate(state, cand, signal) {
  const sd = 0.3 - 0.2 * signal;
  return { q: round2(clamp(cand.quality + gaussian(state) * sd, 0, 1)), sd: round2(sd) };
}

// Offline candidate reply in a live interview.
export function heuristicCandidateReply(cand, question) {
  const q = cand.quality;
  const t = question.toLowerCase();
  const strongAns = q > 0.65, weakAns = q < 0.4;
  let reply;
  if (/salary|comp|pay|expect/.test(t)) reply = `I'm targeting around ${cand.engagement === 'contractor' ? `$${cand.expectation}/hr` : `$${Math.round(cand.expectation / 1000)}k base`}${cand.persona.concern === 'equity upside' ? ', and equity matters to me' : ''}.`;
  else if (/question for (me|us)|ask me|anything you want/.test(t)) reply = `What's your runway, and what does the first month look like for this role? Also: ${cand.persona.concern}.`;
  else if (/tell me about a time|walk me through|example|how did you|last project/.test(t)) reply = strongAns ? 'At my last company I owned the migration end to end: wrote the plan, cut over in two phases, and we went from weekly incidents to one a quarter. The hard part was getting buy-in, so I shipped a small version first and showed the numbers.' : weakAns ? 'We did a lot of projects, I was involved in most of them. It went well overall, the team was happy.' : 'I led part of a rebuild of our onboarding. It shipped about a month late, but activation went up a bit; I would scope smaller next time.';
  else if (/why (us|this|our)|interest/.test(t)) reply = cand.interest > 0.55 ? 'I like the problem and the idea of owning a lot early. I want to see real customers using what I build.' : 'Honestly I\'m exploring a few options right now. Tell me more about traction.';
  else reply = strongAns ? 'Good question. It depends on the constraints, but I would start with the smallest thing that tests the riskiest assumption, measure it, then decide.' : weakAns ? 'I think I would figure it out as I go, I learn fast.' : 'I\'d look at how it\'s done today and improve the obvious problems first.';
  return { reply, interest: Math.round(cand.interest * 10) };
}

export const INTERVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reply', 'interest'],
  properties: {
    reply: { type: 'string', description: 'Your spoken answer, 1-5 sentences, in character.' },
    interest: { type: 'number', description: '0-10: how interested you now are in joining this company.' },
  },
};

export const CANDIDATE_MAIL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reply', 'sentiment'],
  properties: {
    reply: { type: 'string', description: 'Your email reply, in character, 1-6 sentences.' },
    sentiment: { type: 'number', description: '-1 to 1: how the founder\'s message changed your willingness to accept.' },
  },
};

export function candidatePersonaPrompt(state, cand, job) {
  const level = cand.quality > 0.7 ? 'a genuinely strong candidate: specific, uses numbers, admits mistakes, asks sharp questions' : cand.quality > 0.4 ? 'a solid but unremarkable candidate: some specifics, some vagueness' : 'a weak candidate who sounds fine but is vague, overclaims team work as your own and dodges specifics';
  return `You are ${cand.name}, a ${cand.years}-year ${ROLES[cand.role].label} based in ${cand.location}, interviewing for "${job?.title ?? ROLES[cand.role].label}" at ${state.company.name}, a ${state.company.path === 'vc' ? 'venture-backed' : 'bootstrapped'} startup (${state.company.oneLiner || 'early-stage SaaS'}). The year is 2026. You are ${level}. Communication style: ${cand.persona.style}. Your main concern: ${cand.persona.concern}. ${cand.persona.otherOffers ? 'You have other offers in process.' : ''} Your expectation: ${cand.engagement === 'contractor' ? `$${cand.expectation}/hour` : `$${cand.expectation.toLocaleString('en-US')} base per year`}. Answer only what is asked; do not invent impressive achievements beyond your level. You are evaluating the founder too: vague answers about runway, role or pay lower your interest.`;
}

/**
 * Probability a candidate accepts an offer (pure).
 * offer: { salary | hourlyRate, equityPct }; ctx: { path, incorporated, entity, runwayMonths, raised, hireIndex }
 */
export function acceptProbability(cand, offer, ctx) {
  const contractor = cand.engagement === 'contractor';
  const offered = contractor ? offer.hourlyRate : offer.salary;
  const ratio = offered / Math.max(1, cand.expectation);
  let p = 1 / (1 + Math.exp(-10 * (ratio - 0.97)));
  if (!contractor) {
    const bench = (ROLES[cand.role].equityBench ?? 0.3) * Math.max(0.3, 1 - 0.18 * (ctx.hireIndex ?? 0));
    const eq = clamp((offer.equityPct ?? 0) / bench, 0, 1.5);
    p += ctx.entity === 'ccorp' ? 0.12 * (eq - 0.5) : 0;
    if (!ctx.incorporated) p -= 0.2;
    if (ctx.raised) p += 0.05;
  }
  if (ctx.runwayMonths != null && ctx.runwayMonths < 6) p -= contractor ? 0.05 : 0.15;
  p -= (cand.quality - 0.5) * 0.2 * (cand.persona?.otherOffers ? 1.5 : 1);
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
