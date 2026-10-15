// Candidates with hidden trait vectors (public/data/roles.js TRAITS / CANDIDATE_POOL; research
// docs/research/hiring-and-performance.md §1, §3.3, §7). Applicants' true traits are never shown; the
// player sees a resume, interview answers and noisy assessment results. `polish` (interview presence)
// is deliberately separate from performance. Deterministic given state.seed.

import { TRAITS, ROLES as DATA_ROLES, CANDIDATE_POOL, composite, z } from '../../data/roles.js';
import { rng, gaussian, clamp, pick, round2 } from '../../core/util.js';
import { JOB_ROLES } from './catalog.js';

export const TRAIT_IDS = Object.keys(TRAITS);
const TECHNICAL = new Set(['engineer', 'ai_engineer', 'designer']);
const SALES = new Set(['account_executive', 'founding_ae', 'sdr', 'am', 'se']);

// Role composite (performance-relevant traits only; polish excluded unless the role weights it).
export const roleComposite = (jobRole, traits) => composite(traits, DATA_ROLES[jobRole]?.traitWeights ?? DATA_ROLES.engineer.traitWeights);

/**
 * Sample a hidden trait vector for a job role.
 * shift: { qualityShift (points on role-weighted traits), sdMult, polishShift, talkerDoer: true|false|null (null = by pool share) }
 */
export function sampleTraits(state, jobRole, { qualityShift = 0, sdMult = 1, polishShift = 0, talkerDoer = null, bigCompany = null } = {}) {
  const pool = CANDIDATE_POOL[jobRole] ?? CANDIDATE_POOL.engineer;
  const weights = DATA_ROLES[jobRole]?.traitWeights ?? DATA_ROLES.engineer.traitWeights;
  const n = Object.fromEntries(TRAIT_IDS.map((id) => [id, gaussian(state)]));
  // Correlations from CANDIDATE_POOL._notes [P/design].
  n.grit = 0.7 * n.conscientiousness + 0.714 * n.grit;
  n.craft = 0.35 * n.gma + 0.937 * n.craft;
  n.ambiguity_tolerance = 0.4 * n.agency + 0.3 * n.adaptability + 0.866 * n.ambiguity_tolerance;
  n.empathy = 0.3 * n.communication + 0.954 * n.empathy;
  n.integrity = 0.3 * n.conscientiousness + 0.954 * n.integrity;
  const t = {};
  for (const id of TRAIT_IDS) {
    if (id === 'polish') continue;
    const d = pool.traits[id] ?? { mean: 50, sd: 15 };
    t[id] = d.mean + d.sd * sdMult * n[id] + (weights[id] ? qualityShift : 0);
  }
  const c = composite(t, weights);
  const pd = pool.traits.polish ?? { mean: 50, sd: 15 };
  t.polish = pd.mean + pd.sd * (0.15 * c + 0.989 * n.polish) + polishShift; // polish ~ composite r ≈ .15
  // Big-company background [design].
  const big = bigCompany ?? rng(state) < 0.3;
  if (big) { t.craft += 4; t.domain += 4; t.agency -= 4; t.ambiguity_tolerance -= 6; t.polish += 4; }
  // Strong talker / weak doer (polish ≥ +1 SD, composite ≤ −0.5 SD): pool share minus the ~3% that occur naturally.
  const td = talkerDoer ?? rng(state) < Math.max(0, (pool.strongTalkerWeakDoerShare ?? 0.1) - 0.03);
  if (td) {
    t.polish = Math.max(t.polish, pd.mean + pd.sd * (1.1 + Math.abs(gaussian(state)) * 0.6));
    for (let i = 0; i < 6 && composite(t, weights) > -0.55; i++) for (const id of Object.keys(weights)) if (id !== 'polish') t[id] -= 4;
  }
  for (const id of TRAIT_IDS) t[id] = Math.round(clamp(t[id], 1, 99));
  return { traits: t, bigCompany: big, talkerDoer: td };
}

// Salary ask: 1 + .06·z(craft) + .04·z(domain) + .05·z(polish) + N(0,.08) × role median for the region
// (CANDIDATE_POOL._notes.salaryLinkage [design]). Polish raises the ask about as much as craft does.
export function salaryAsk(state, jobRole, region, traits, contractor = false) {
  const r = JOB_ROLES[jobRole] ?? JOB_ROLES.engineer;
  const [lo, hi] = contractor ? r.hourly[region] : r.salary[region];
  const midv = (lo + hi) / 2;
  const mult = 1 + 0.06 * z(traits.craft) + 0.04 * z(traits.domain) + 0.05 * z(traits.polish) + gaussian(state) * 0.08;
  const v = clamp(midv * mult, lo * 0.8, hi * 1.2);
  return contractor ? Math.round(v) : Math.round(v / 1000) * 1000;
}

// What an automated resume screen "sees": polish and pedigree count more than they should [design].
export const resumeScore = (jobRole, traits, noise) => 0.35 * roleComposite(jobRole, traits) + 0.45 * z(traits.polish) + 0.2 * noise;

const NAMES = {
  us: { first: ['Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Jamie', 'Drew', 'Quinn', 'Hayden', 'Parker', 'Reese', 'Dana', 'Elliot', 'Rowan'], last: ['Miller', 'Brooks', 'Reed', 'Hughes', 'Price', 'Bennett', 'Foster', 'Ward', 'Sullivan', 'Hayes', 'Park', 'Nguyen', 'Kaur', 'Ortiz', 'Bailey'] },
  latam: { first: ['Camila', 'Mateo', 'Valentina', 'Santiago', 'Lucía', 'Sebastián', 'Isabela', 'Joaquín', 'Mariana', 'Thiago'], last: ['González', 'Rodríguez', 'Fernández', 'Pereira', 'Silva', 'Martínez', 'Souza', 'Ramírez', 'Castro', 'Rojas'] },
  eeu: { first: ['Andrii', 'Katarzyna', 'Mihai', 'Ana', 'Tomasz', 'Petra', 'Bogdan', 'Ivana', 'Marek', 'Oksana'], last: ['Kowalski', 'Novák', 'Popescu', 'Horvat', 'Shevchenko', 'Nowak', 'Petrov', 'Ionescu', 'Kovač', 'Dvořák'] },
  india: { first: ['Aarav', 'Ananya', 'Rohan', 'Priya', 'Vikram', 'Diya', 'Karthik', 'Meera', 'Arjun', 'Sneha'], last: ['Sharma', 'Iyer', 'Reddy', 'Gupta', 'Nair', 'Menon', 'Rao', 'Kulkarni', 'Banerjee', 'Joshi'] },
};
const CITIES = { us: ['Austin, TX', 'Denver, CO', 'Brooklyn, NY', 'Oakland, CA', 'Raleigh, NC', 'Columbus, OH', 'Seattle, WA'], latam: ['Buenos Aires', 'São Paulo', 'Medellín', 'Mexico City', 'Montevideo', 'Santiago'], eeu: ['Kraków', 'Kyiv', 'Bucharest', 'Belgrade', 'Brno', 'Zagreb'], india: ['Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Gurugram'] };

// Resume lines: what a CV claims. Polish makes a CV read better whether or not the substance is there.
const RESUME = {
  engineer: { good: ['Shipped a product end-to-end at a seed-stage startup', 'Active open-source maintainer', 'Ran production Postgres at scale', 'Writes design docs (linked)', 'Owned on-call for a payments system'], fluff: ['"Passionate full-stack ninja, 10x with AI"', 'Long list of frameworks, few outcomes'], bad: ['Mostly maintenance on a legacy monolith', 'Job hopped every 8 months', 'Portfolio is tutorial projects'] },
  ai_engineer: { good: ['Shipped an LLM feature with an eval suite', 'Cut inference cost 60% via caching/routing', 'Published a retrieval benchmark'], fluff: ['"AI visionary", lists every model release', 'Certificates from prompt-engineering courses'], bad: ['Only notebooks, nothing in production', 'Claims model training for prompt-only work'] },
  designer: { good: ['Portfolio shows research → shipped outcome', 'Onboarding redesign that lifted activation (numbers)', 'Ships CSS'], fluff: ['Beautiful Dribbble shots', '"Human-centred storyteller"'], bad: ['Only agency work, no iteration', 'Cannot say what was theirs in team projects'] },
  account_executive: { good: ['Attainment by quarter listed (verifiable)', 'Sold to RevOps / finance buyers before', 'Full-cycle with self-sourced pipeline'], fluff: ['"President\'s Club" with no numbers', '"Consistent top performer"'], bad: ['Only inbound at a big brand', 'Three jobs in two years'] },
  sdr: { good: ['15+ held meetings/month (numbers)', 'Wrote own sequences', 'Knows deliverability basics'], fluff: ['"Hunter mentality, crushes quota"'], bad: ['Template-only volume role', 'No metrics on CV'] },
  founding_ae: { good: ['First sales hire at a seed-stage startup (numbers)', 'Built own outbound list and pitch', 'Closed deals before any marketing existed'], fluff: ['"Zero-to-one builder"', '"Hunter" with no deal sizes'], bad: ['Only inherited pipeline at a big brand', 'Needs a full enablement team'] },
  csm: { good: ['GRR and NRR on a named book (ARR listed)', 'Built health scores and tiers', 'Ran renewals and exec business reviews'], fluff: ['"Trusted advisor", no retention numbers'], bad: ['Quota on upsell only', 'Relationship-only, no metrics'] },
  am: { good: ['Expansion ARR by account with named sponsors', 'Account maps and multi-threading', 'Renewal rate on a book'], fluff: ['"Land-and-expand expert" with no figures'], bad: ['Discount-led renewals', 'Seat pitches to a single champion'] },
  se: { good: ['Won technical evaluations (POCs scoped to success criteria)', 'Security questionnaires and integrations', 'Demo craft with real customers'], fluff: ['"Technical storyteller"'], bad: ['Demo-path only', 'Promises roadmap to close'] },
  support: { good: ['Wrote help-center articles', 'Handled technical tier-2 tickets', 'CSAT numbers listed'], fluff: ['"Customer obsessed people person"'], bad: ['Script-only call centre', 'Typos in the application'] },
  customer_success: { good: ['Renewal and expansion numbers by account', 'Ran QBRs with exec sponsors'], fluff: ['"Trusted advisor to C-suite"'], bad: ['Relationship-only, no metrics'] },
  marketer: { good: ['Grew a channel from 0 with CAC numbers', 'Search Console screenshots', 'Ran paid tests with kill rules'], fluff: ['Lists 30 tools', '"Growth hacker" with impressions only'], bad: ['Only brand work at large companies'] },
  content_writer: { good: ['Bylined pieces with traffic numbers', 'Interviews customers for stories'], fluff: ['"Wordsmith", generic listicles'], bad: ['Samples look AI-generated', 'No verifiable bylines'] },
  ops_generalist: { good: ['Closed books monthly at a startup', 'Set up payroll and HR from scratch'], fluff: ['"Strategic operator", consulting decks'], bad: ['Only big-company process roles'] },
};

function resumeLines(state, jobRole, traits, big) {
  const r = RESUME[jobRole] ?? RESUME.engineer;
  const subst = roleComposite(jobRole, traits) + gaussian(state) * 0.6;
  const pol = z(traits.polish);
  const out = [];
  const goods = [...r.good], bads = [...r.bad], fluffs = [...r.fluff];
  const take = (arr, tone) => { if (arr.length) out.push({ text: arr.splice(Math.floor(rng(state) * arr.length), 1)[0], tone }); };
  for (let i = 0; i < clamp(Math.round(1 + subst + 0.4 * pol), 0, 3); i++) take(goods, 'good');
  if (pol > 0.6 && rng(state) < 0.7) take(fluffs, 'neutral');
  for (let i = 0; i < clamp(Math.round(0.6 - subst - 0.3 * pol), 0, 2); i++) take(bads, 'bad');
  if (big) out.push({ text: 'Mostly big-company experience', tone: 'neutral' });
  if (!out.length) out.push({ text: 'Generic resume: titles and tech stack, no outcomes', tone: 'neutral' });
  return out;
}

/**
 * Build a candidate for a job from a sourcing channel (agency entry from AGENCIES or null).
 * Hidden: traits, talkerDoer, fraud ('stand_in' identity fraud), aiCheat (would use undisclosed AI in
 * unsupervised screens). Visible: resume lines, years, location, expectation (after screen).
 */
export function makeCandidate(state, job, agency, uidFn) {
  const region = job.region;
  const shift = { qualityShift: agency?.qualityShift ?? 0, sdMult: agency?.qualitySdMult ?? 1, polishShift: agency?.polishShift ?? 0 };
  // Job boards: the AI resume screen picks the best-looking of several applicants (polish-biased).
  let best = null;
  const draws = agency?.kind === 'job_board' ? 3 : 1;
  for (let i = 0; i < draws; i++) {
    const s = sampleTraits(state, job.role, shift);
    const score = resumeScore(job.role, s.traits, gaussian(state));
    if (!best || score > best.score) best = { ...s, score };
  }
  const { traits, bigCompany, talkerDoer } = best;
  const pool = CANDIDATE_POOL[job.role] ?? CANDIDATE_POOL.engineer;
  const remote = region !== 'us' || job.remote !== false;
  const fraud = TECHNICAL.has(job.role) && remote && rng(state) < (pool.fraudShareRemote ?? 0.03) ? 'stand_in' : null;
  const aiCheat = rng(state) < (TECHNICAL.has(job.role) ? 0.4 : SALES.has(job.role) ? 0.12 : 0.25); // Fabric 2026: 48% technical / 12% sales flagged [V]
  const names = NAMES[region] ?? NAMES.us;
  const first = pick(state, names.first), last = pick(state, names.last);
  const contractor = job.engagement === 'contractor';
  const years = clamp(Math.round(4 + 2.2 * z(traits.craft) + 1.5 * gaussian(state) + (bigCompany ? 2 : 0)), 1, 22);
  return {
    id: uidFn('cand'), personKey: uidFn('person'), jobId: job.id, role: job.role, region, engagement: job.engagement,
    name: `${first} ${last}`, email: `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[^a-z.]/g, '') + '@mail.com',
    location: pick(state, CITIES[region] ?? CITIES.us), years, channel: agency?.id ?? 'direct',
    traits, talkerDoer, fraud, aiCheat, bigCompany,
    expectation: salaryAsk(state, job.role, region, traits, contractor),
    signals: resumeLines(state, job.role, traits, bigCompany),
    aiApplication: agency?.kind === 'job_board' && rng(state) < 0.35,
    persona: {
      style: pick(state, ['direct and concise', 'warm and talkative', 'reserved, answers briefly', 'confident, a bit salesy']),
      concern: pick(state, ['stability and runway', 'scope and ownership', 'compensation', 'remote flexibility', 'equity upside', 'working with a solo founder']),
      otherOffers: rng(state) < 0.2 + 0.4 * clamp((roleComposite(job.role, traits) + 1) / 2.5, 0, 1),
    },
    appliedDay: state.day, lastTouchDay: state.day, stage: 'new',
    interest: round2(clamp(0.45 + gaussian(state) * 0.15, 0.1, 0.9)),
    evidence: [], interview: null, offer: null, assessments: {},
  };
}

// For tests / analysis: is this a strong-talker-weak-doer profile?
export const isTalkerDoer = (jobRole, traits) => z(traits.polish) >= 1 && roleComposite(jobRole, traits) <= -0.5;
