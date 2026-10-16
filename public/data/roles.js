// Hiring system data: hidden candidate traits, roles, how traits drive on-the-job outputs,
// interview/assessment methods and their validity, illegal interview topics, candidate pools
// and recruiting agencies / sourcing channels.
// Research notes and full dated sources: docs/research/hiring-and-performance.md (compiled 2026-10-14).
// Salaries, ramp context and equity: docs/research/hr-legal-product.md §1.
//
// Conventions
// - Trait values are on a 0..100 scale. In the open applicant market each trait has mean 50 and SD 15.
//   z = (value - 50) / 15.
// - traitWeights per role sum to 1. They are [design] composites grounded in the cited evidence.
// - outputs[k].traits are weights (sum 1) over traits. composite = Σ w·z.
//   outputs[k].range = [value at composite -2, value at composite +2], and median = value at composite 0.
//   Interpolate piecewise-linearly between those points and clamp outside the range (see outputValue()).
//   A range can run "downwards" (e.g. bugRateMult [2.0, 0.45]), meaning better traits give a lower value.
// - METHODS[k].validity is the operational correlation between the method's score and the hidden role
//   composite. Observed = r·z_true + sqrt(1 - r²)·noise (see observedScore()). Values are from Sackett et al.
//   (2022), unless marked [design].
// - fakeability 0..1: how much a high-polish candidate can inflate the apparent trait in an interview
//   answer. Structured probing reduces it (see METHODS.structuredInterview.polishWeight).
// - Labels in `sources`: [P] peer-reviewed, [G] government, [S] secondary, [V] vendor, [Q] practitioner,
//   [design] game estimate. Never show a [design] value to players as a real statistic.

const S = {
  sackett2022: 'Sackett, Zhang, Berry & Lievens (2022) JAP 107(11), Table 3 [P]',
  sackett2023: 'Sackett et al. (2023) IOP 16(3) 283-300; GMA .23 in 21st-century data (Griebe et al.) [P]',
  sh1998: 'Schmidt & Hunter (1998) Psych Bull 124(2) [P]',
  crede2017: 'Credé, Tynan & Harms (2017) JPSP 113: grit-C .84, grit-perf ~.18-.21 [P]',
  fuller2009: 'Fuller & Marler (2009) proactive personality ρ=.38; Thomas et al. 2010 .26 (objective .16) [P/S]',
  huang2014: 'Huang et al. (2014) JAP: emotional stability & ambition → adaptive performance [P]',
  dudley2006: 'Dudley et al. (2006) JAP 91(1): conscientiousness facets add validity [P]',
  joseph2010: 'Joseph & Newman (2010) JAP 95(1): EI helps only in high emotional-labour jobs [P]',
  vinchur1998: 'Vinchur et al. (1998): achievement→objective sales .41, potency .26, GMA .04 [P/S]',
  barrick2009: 'Barrick, Shaffer & DeGrassi (2009): impression mgmt .47 w/ interview ratings vs .15 w/ performance (via Peck & Levashina 2017) [P/S]',
  dana2013: 'Dana, Dawes & Peterson (2013) JDM 8(5): unstructured interviews dilute valid info [P]',
  hunter1990: 'Hunter, Schmidt & Judiesch (1990): output SD 19/32/48% of mean by complexity; sales higher [P/S]',
  roberge: 'Roberge, The Sales Acceleration Formula (2015): coachability, curiosity, prior success, intelligence, work ethic [Q]',
  bridge2026: 'Bridge Group 2026 AE report (2026-06-22): 48% at quota, ramp 6.2 mo, quota $960k, OTE $200k [V]',
  bridgeSdr2025: 'Bridge Group SDR 2025 via Cirrus Insight: ramp 3.0 mo, 10 held mtgs/mo, 40% attrition [S]',
  salescookie2026: 'SalesCookie 2026-06-08: 2025 median attainment 74.3%, p90 139%, 28.7% ≥100% [V]',
  repvue2025: 'RepVue Cloud Sales Index Q2 2025 ~43% at quota (via QuotaPath) [S]',
  metr: 'METR 2025-07-10 RCT (-19%), 2026-02-24 update (+18% returning devs, weak), 2026-05-11 survey [P/V]',
  csatBand: 'CSAT good band 75-85% (Sobot/Survicate, see world-ops-support-life.md) [V]',
  fabric2026: 'Fabric 2026: 38.5% of 19,368 AI interviews flagged; 48% technical, 12% sales [V]',
  gartner2025: 'Gartner 2025-07 via HR Dive: 6% admit interview fraud; 1 in 4 profiles fake by 2028 [S]',
  ivTakehome: 'interviewing.io: take-home completion ~62% [V]',
  references: 'S&H 1998 .26 [P]; structured reference meta-analysis .32 (Massey) [S]; Aamodt & Williams 2005 ~.29 [S]',
  bock2013: 'Bock (Google) via NYT/The Register 2013-06-20: brainteasers and GPA "don\'t predict anything" [S]',
  rivera2012: 'Rivera (2012) ASR 77(6): hiring as cultural matching [P]',
  eeoc: 'EEOC Prohibited Employment Policies/Practices (accessed 2026-10-14) [G]',
  salaryBans: 'Salary history bans: ~22 incl. DC (Paycor 2024-11); Virginia private employers from 2026-07-01 (2026 guide) [S]',
  leadershipIQ: 'Leadership IQ (2005): 46% of new hires fail within 18 months [V]',
  greenhouse: 'Greenhouse benchmarks: apps/job 116→244, apps/recruiter 146→746 (2022→2025) [V]',
  hrLegal: 'docs/research/hr-legal-product.md §1.5 salaries [P/S]',
  // agencies
  dover2026: 'Dover 2026-07-13: contingency 15-25% of base, 30-90 day guarantee; fractional ~$4.8k/hire [V]',
  recruitbpm: 'RecruitBPM 2026: contingency 15-30%, hourly recruiters $75-125/h [V]',
  retained: 'Talentfoot / Kitalent / sample retained contracts: 25-35%, often 1/3 in thirds; 60-120 days [V/S]',
  rpo: 'EOR HQ / 1840 & Co / Pin 2026: embedded recruiter $8k-15k/mo [V]',
  paraform: 'HeroHunt 2026 / Paraform blog: ~20-25% success fee, 90-day instalment guarantee [V]',
  ownership: 'BountyJobs; sample agency T&Cs: 6-12 month candidate ownership [V/S]',
  staffing: 'Upwork / Pin / Robert Half public contract (65-70%) / Recruiterflow conversion 15-20% [V/S]',
  offshore: 'QArea / HireInSouth / StealthAgents 2026 outsourcing rates [V]',
  marketplaces: 'Codersera / RaftLabs / Acquaintsoft / Fast.io 2026 comparisons [V]',
  upwork: 'Upwork client fee 5% (3% ACH), Business Plus 10%, $0.99-14.99 contract fee (2026 guides) [S]',
  contra: 'Contra 0% freelancer commission; client fees ~$29/contract (sources conflict) [S]',
  fractional: 'Marketful/Geisheker, GoFractional, Eightx 2026: CMO $5-15k/mo early stage; CFO $5-15k/mo [V]',
  linkedin: 'LinkedIn Recruiter Lite ~$170/mo, 30 InMails (Pin 2026) [V]',
  wellfound: 'Wellfound: free posts; seats ~$250-499/mo; Autopilot ~$500/mo/role + 10% (2026 reviews) [V/S]',
  wwr: 'We Work Remotely $299 / 30 days (support page) [V]',
  noon: 'Noon 2026: 16.6% per-candidate reply over sequences; cold InMail 5.5% [V]',
  referrals: 'FMC Group 2026 (28-34% vs 2-7%); Jobvite via ERIN; WorldatWork via Hyring ($1-5k bonus) [V/S]',
};

// ---------------------------------------------------------------------------------------------
// TRAITS
// ---------------------------------------------------------------------------------------------
export const TRAITS = {
  gma: {
    label: 'Problem solving / learning ability',
    description: 'General mental ability: speed of learning, reasoning with new information, handling complexity. Validity .31 overall (.23 in modern data); matters more in complex and new jobs; predicts sales ratings but not objective sales.',
    howItShowsInAnswers: 'Breaks problems into parts, spots the key constraint quickly, asks sharp clarifying questions, reasons aloud about trade-offs, transfers lessons across contexts.',
    howToProbe: 'Situational problem with incomplete info; "walk me through how you diagnosed X"; ask them to estimate with stated assumptions (not brainteasers).',
    fakeability: 0.15,
    sources: [S.sackett2022, S.sackett2023],
  },
  conscientiousness: {
    label: 'Conscientiousness / work ethic',
    description: 'Dependability, thoroughness, achievement striving. Most general personality predictor (.19 generic, .25 contextualised); achievement facet predicts objective sales .41.',
    howItShowsInAnswers: 'Specific follow-through habits (checklists, tests, CRM hygiene), deadlines met with evidence, owns misses with concrete fixes.',
    howToProbe: '"Tell me about a time you were behind on a commitment." "How did you make sure nothing slipped on project X?" Backchannel: reliability.',
    fakeability: 0.6,
    sources: [S.sackett2022, S.dudley2006, S.vinchur1998],
  },
  agency: {
    label: 'Agency / ownership (proactive)',
    description: 'Initiates without being told, owns outcomes end-to-end, removes blockers. Proactive personality ρ≈.26–.38 with performance (stronger for ratings than objective output).',
    howItShowsInAnswers: '"I noticed… so I…"; describes problems they found and fixed outside their remit; uses "I" for decisions; describes trade-offs they made.',
    howToProbe: '"Tell me about something you improved that nobody asked you to." Probe: what exactly did you do, who objected, what happened next.',
    fakeability: 0.55,
    sources: [S.fuller2009],
  },
  adaptability: {
    label: 'Adaptability / composure',
    description: 'Adjusts to change and stays effective under pressure. Emotional stability predicts reactive adaptation and ambition predicts proactive adaptation.',
    howItShowsInAnswers: 'Calm, specific accounts of pivots or crises; describes what they changed in their own approach.',
    howToProbe: '"Tell me about a time priorities changed mid-project." Situational: the spec changes on day 3.',
    fakeability: 0.5,
    sources: [S.huang2014],
  },
  grit: {
    label: 'Perseverance (grit)',
    description: 'Perseverance of effort through rejection and long slogs. Credé 2017: grit ≈ conscientiousness (ρ .84); only the perseverance facet adds anything. Matters in rejection-heavy roles.',
    howItShowsInAnswers: 'Long efforts with setbacks, what kept them going, numbers of attempts (calls, iterations).',
    howToProbe: '"Tell me about the longest you kept pushing on something that kept failing." Ask for counts and timeline.',
    fakeability: 0.65,
    sources: [S.crede2017],
  },
  coachability: {
    label: 'Coachability',
    description: 'Seeks, accepts and applies feedback quickly. A core HubSpot sales hiring trait (Roberge); "attitude" is the most cited reason for new-hire failure (Leadership IQ, vendor).',
    howItShowsInAnswers: 'Names specific feedback and what changed afterwards; no defensiveness; references to mentors.',
    howToProbe: 'Role-play, then give one piece of feedback and run it again: measure the change. "What is the best feedback you got and what did you do with it?"',
    fakeability: 0.5,
    sources: [S.roberge, S.leadershipIQ],
  },
  communication: {
    label: 'Communication (written + verbal clarity)',
    description: 'Clear, concise, audience-appropriate writing and speaking. Critical in remote, async startups and in support/CS/sales.',
    howItShowsInAnswers: 'Structured answers, the conclusion first, appropriate detail, plain words. Written exercises are clear and well organised.',
    howToProbe: 'Written work sample (customer email, spec, PR description); ask them to explain a complex thing to a non-expert.',
    fakeability: 0.35,
    sources: [S.sackett2022],
  },
  empathy: {
    label: 'Empathy / customer curiosity',
    description: 'Perspective-taking, de-escalation, genuine curiosity about the customer. Valid mostly in high emotional-labour roles (support, CS, sales discovery). EI questionnaires are weak and fakeable.',
    howItShowsInAnswers: 'Describes the customer\'s situation in the customer\'s words, asks discovery questions, de-escalation steps that worked.',
    howToProbe: 'Role-play an angry customer or a discovery call; "Tell me about a customer you turned around."',
    fakeability: 0.55,
    sources: [S.joseph2010],
  },
  craft: {
    label: 'Role craft (core skill)',
    description: 'The role-specific skill: code quality and debugging; design; sales skill and track record; writing; channel expertise; troubleshooting. Best measured by work samples (.33) and job knowledge (.40).',
    howItShowsInAnswers: 'Precise technical vocabulary used correctly, concrete artifacts, numbers, explains why not just what, handles third-level follow-ups.',
    howToProbe: 'Work sample, artifact walkthrough, job-knowledge questions, "go deeper" probes on past projects.',
    fakeability: 0.25,
    sources: [S.sackett2022],
  },
  domain: {
    label: 'Domain / market knowledge',
    description: 'Knowledge of the customer segment, industry, buyer and tools (e.g. selling to RevOps, fintech compliance).',
    howItShowsInAnswers: 'Names real buyer roles, objections, competitors and workflows correctly.',
    howToProbe: '"Who buys this and why do deals stall?" "What would you tell a CFO who objects to X?"',
    fakeability: 0.3,
    sources: [S.sackett2022],
  },
  ai_fluency: {
    label: 'AI tool fluency (2026)',
    description: 'Uses AI agents and tools effectively and critically: specs, decomposition, verification, knowing when not to use them. Real productivity effects are mixed (METR); unverified AI output raises error rates.',
    howItShowsInAnswers: 'Specific workflows (agents, evals, review steps), examples of catching AI mistakes, measured before/after.',
    howToProbe: 'Work sample with AI allowed: watch how they prompt, verify and correct. "Show me a time AI got it wrong and how you caught it."',
    fakeability: 0.45,
    sources: [S.metr],
  },
  integrity: {
    label: 'Integrity / honesty',
    description: 'Honesty, rule-following, not gaming metrics. Integrity tests .31; acts as a gate: low integrity creates incidents (fraud, data misuse, fake activity) in any role.',
    howItShowsInAnswers: 'Admits mistakes unprompted, consistent details across interviews and references, does not disparage or share confidential info from past employers.',
    howToProbe: 'Consistency checks across interviewers; backchannel references; "Tell me about a time you saw someone cut corners."',
    fakeability: 0.7,
    sources: [S.sackett2022],
  },
  ambiguity_tolerance: {
    label: 'Ambiguity tolerance (startup fit)',
    description: 'Effective without clear specs, process or support functions; makes reasonable calls with partial info. No direct selection meta-analysis: [design] trait related to emotional stability and openness.',
    howItShowsInAnswers: 'Comfortable describing messy situations, how they decided without full information, no complaints about lack of process.',
    howToProbe: 'Situational: "It\'s week 1, there is no spec and the founder is travelling. What do you do?"',
    fakeability: 0.5,
    sources: ['[design]', S.huang2014],
  },
  polish: {
    label: 'Polish / interview presence (presentation, not performance)',
    description: 'Verbal fluency, confidence and impression-management skill. Inflates interview ratings (.47) much more than it predicts performance (.15). Contributes a little to sales (potency .26 with objective sales).',
    howItShowsInAnswers: 'Fluent, confident, well-structured, buzzword-rich answers that stay generic and short on numbers and specifics.',
    howToProbe: 'Do not probe it; neutralise it. Use anchored scoring, ask for specifics and artifacts, and probe 3 levels deep.',
    fakeability: 1.0,
    sources: [S.barrick2009, S.dana2013],
  },
};

// ---------------------------------------------------------------------------------------------
// ROLES
// ---------------------------------------------------------------------------------------------
export const ROLES = {
  engineer: {
    label: 'Software engineer (full-stack / founding)',
    traitWeights: { craft: 0.25, gma: 0.18, conscientiousness: 0.15, agency: 0.12, ai_fluency: 0.10, communication: 0.08, adaptability: 0.07, ambiguity_tolerance: 0.05 },
    outputs: {
      velocityMult: { traits: { craft: 0.3, gma: 0.2, ai_fluency: 0.2, agency: 0.15, conscientiousness: 0.15 }, range: [0.4, 1.9], median: 1.0, note: 'Feature throughput vs a median engineer. Output SD ~45-50% of mean (Hunter 1990).' },
      bugRateMult: { traits: { conscientiousness: 0.4, craft: 0.35, gma: 0.25 }, range: [2.0, 0.45], median: 1.0, note: 'Defects shipped per feature. Low conscientiousness + high ai_fluency adds +15% (unverified AI output) [design].' },
      estimateAccuracy: { traits: { communication: 0.4, gma: 0.3, ambiguity_tolerance: 0.3 }, range: [0.4, 0.9], median: 0.65, note: 'Share of tasks delivered within 1.5x of estimate [design].' },
      founderHoursPerWeek: { traits: { agency: 0.5, communication: 0.3, ambiguity_tolerance: 0.2 }, range: [8, 1.5], median: 4, note: 'Founder management/unblocking time required [design].' },
    },
    rampWeeks: { firstOutput: [1, 3], full: [6, 20] },
    performanceDistribution: { metric: 'relative output', p10: 0.45, p25: 0.7, p50: 1.0, p75: 1.3, p90: 1.7, sources: [S.hunter1990, '[design]'] },
    sampleQuestions: [
      { text: 'Tell me about the hardest production bug you debugged in the last year. Walk me through it step by step.', type: 'behavioral', probes: ['craft', 'gma', 'conscientiousness'],
        strongAnswerSignals: ['specific symptoms, logs and hypotheses in order', 'how they narrowed it down (bisect, repro, instrumentation)', 'root cause plus a prevention step (test, alert)', 'time-to-fix and impact numbers'],
        weakAnswerSignals: ['"we just restarted it"', 'cannot explain the root cause', 'no follow-up to prevent recurrence', 'credit to "the team" with no personal steps'] },
      { text: 'Tell me about something you shipped end-to-end that nobody asked you to build.', type: 'behavioral', probes: ['agency', 'craft', 'communication'],
        strongAnswerSignals: ['noticed a real problem with evidence', 'scoped it, got buy-in, shipped', 'measured outcome', 'admits what they would do differently'],
        weakAnswerSignals: ['only did assigned tickets', 'side project unrelated to users', 'no outcome measured'] },
      { text: 'How do you use AI coding agents day to day? Show me a time the AI was confidently wrong and how you caught it.', type: 'behavioral', probes: ['ai_fluency', 'conscientiousness', 'craft'],
        strongAnswerSignals: ['concrete workflow (spec → agent → review → tests)', 'example of a subtle AI bug caught by tests/review', 'knows when not to use it', 'honest about speedup size'],
        weakAnswerSignals: ['"it writes everything, 10x faster"', 'never reviews generated code', 'refuses to use AI at all with no reason', 'cannot name a failure'] },
      { text: 'We have 2 weeks to ship billing for annual plans and the spec is half-written. I am at a conference. What do you do on day 1?', type: 'situational', probes: ['ambiguity_tolerance', 'agency', 'communication'],
        strongAnswerSignals: ['clarifies must-haves async, writes a short spec and shares it', 'cuts scope explicitly', 'identifies risks (proration, tax, refunds)', 'sets check-in points'],
        weakAnswerSignals: ['waits for the spec', 'starts coding without confirming scope', 'over-engineers'] },
      { text: 'Work sample: extend this small repo (2-3 h) to add rate limiting to an API endpoint with tests; then a 30-minute live walkthrough where you extend it.', type: 'work_sample', probes: ['craft', 'conscientiousness', 'ai_fluency', 'communication'],
        strongAnswerSignals: ['working, tested, readable code', 'explains trade-offs (in-memory vs redis)', 'extends live without breaking', 'notes edge cases'],
        weakAnswerSignals: ['cannot explain own submission (AI-generated without understanding)', 'no tests', 'breaks on live extension'] },
    ],
    workSample: { description: '2-3 h scoped task on a small realistic repo (AI allowed and disclosed), followed by a 30-45 min live walkthrough and extension. Pay if it takes >4 h.', hours: 3, validity: 0.33 },
    redFlags: ['cannot explain their own code or take-home', 'blames teammates for every outage', 'claims 10x AI speedups with no evidence', 'dismisses tests/code review', 'identity mismatch or off-screen prompting in remote rounds'],
  },

  ai_engineer: {
    label: 'AI/ML engineer (LLM features)',
    traitWeights: { craft: 0.25, gma: 0.20, ai_fluency: 0.15, agency: 0.12, conscientiousness: 0.10, adaptability: 0.08, communication: 0.05, domain: 0.05 },
    outputs: {
      velocityMult: { traits: { craft: 0.35, ai_fluency: 0.25, gma: 0.2, agency: 0.2 }, range: [0.4, 2.0], median: 1.0, note: 'AI feature throughput [design].' },
      aiQualityMult: { traits: { craft: 0.35, conscientiousness: 0.3, gma: 0.2, domain: 0.15 }, range: [0.6, 1.35], median: 1.0, note: 'Eval pass rate / hallucination reduction; multiplies AI feature quality and support deflection [design].' },
      inferenceCostMult: { traits: { craft: 0.5, gma: 0.3, conscientiousness: 0.2 }, range: [1.6, 0.6], median: 1.0, note: 'Cost per AI request via caching, routing, model choice [design].' },
    },
    rampWeeks: { firstOutput: [1, 3], full: [6, 16] },
    performanceDistribution: { metric: 'relative output', p10: 0.45, p25: 0.7, p50: 1.0, p75: 1.35, p90: 1.8, sources: [S.hunter1990, '[design]'] },
    sampleQuestions: [
      { text: 'Tell me about an LLM feature you shipped. How did you know it was good enough to launch?', type: 'behavioral', probes: ['craft', 'conscientiousness', 'gma'],
        strongAnswerSignals: ['built an eval set from real data', 'tracked specific failure modes', 'regression checks before model changes', 'launch criteria and post-launch metrics'],
        weakAnswerSignals: ['"it looked good in testing"', 'no evals', 'only prompt tweaks by vibe'] },
      { text: 'Our AI feature costs $0.40 per user per day and margins are negative. What do you investigate first?', type: 'situational', probes: ['craft', 'gma', 'domain'],
        strongAnswerSignals: ['measures token usage by step', 'caching, smaller model routing, batching', 'quality guardrail while cutting cost', 'quantifies expected savings'],
        weakAnswerSignals: ['switch to the cheapest model without evals', 'no measurement plan'] },
      { text: 'A new model version is released and our provider deprecates the old one in 60 days. Walk me through the migration.', type: 'situational', probes: ['conscientiousness', 'adaptability', 'craft'],
        strongAnswerSignals: ['run evals on both', 'staged rollout and rollback', 'prompt adjustments documented', 'communicate changes to support'],
        weakAnswerSignals: ['swap the model string and ship'] },
      { text: 'Work sample: given 50 real (anonymised) support tickets, build a small classifier/agent prompt and an eval that measures it. 3 h, AI allowed, then a walkthrough.', type: 'work_sample', probes: ['craft', 'ai_fluency', 'gma'],
        strongAnswerSignals: ['clean eval split', 'reports precision/recall by class', 'error analysis with next steps'],
        weakAnswerSignals: ['no held-out set', 'cannot explain failures'] },
    ],
    workSample: { description: 'Build and evaluate a small LLM component on real anonymised data (3 h, AI allowed) + live error analysis.', hours: 3, validity: 0.33 },
    redFlags: ['no concept of evals', 'overclaims model training experience for prompt-only work', 'ignores cost and latency', 'sends customer data to unapproved tools'],
  },

  designer: {
    label: 'Product designer',
    traitWeights: { craft: 0.28, empathy: 0.14, communication: 0.14, gma: 0.12, agency: 0.10, conscientiousness: 0.08, ai_fluency: 0.07, adaptability: 0.07 },
    outputs: {
      designQuality: { traits: { craft: 0.5, empathy: 0.25, gma: 0.25 }, range: [35, 92], median: 65, note: '0-100 quality score feeding website/product fit scores [design].' },
      conversionLiftMult: { traits: { craft: 0.4, empathy: 0.35, gma: 0.25 }, range: [0.92, 1.25], median: 1.05, note: 'Multiplier on landing/activation conversion once their redesign ships [design].' },
      throughputMult: { traits: { craft: 0.3, ai_fluency: 0.25, conscientiousness: 0.25, agency: 0.2 }, range: [0.5, 1.6], median: 1.0, note: '[design]' },
    },
    rampWeeks: { firstOutput: [1, 2], full: [4, 10] },
    performanceDistribution: { metric: 'relative output', p10: 0.5, p25: 0.75, p50: 1.0, p75: 1.25, p90: 1.6, sources: [S.hunter1990, '[design]'] },
    sampleQuestions: [
      { text: 'Walk me through one portfolio project from problem to shipped result. What did research change about your first idea?', type: 'behavioral', probes: ['craft', 'empathy', 'communication'],
        strongAnswerSignals: ['explicit problem and user', 'research that changed the design', 'rejected alternatives', 'shipped metric'],
        weakAnswerSignals: ['only final screens', 'no user evidence', 'cannot say what they personally did'] },
      { text: 'Tell me about a time an engineer or founder pushed back hard on your design.', type: 'behavioral', probes: ['communication', 'adaptability', 'coachability'],
        strongAnswerSignals: ['understood the constraint', 'found a compromise with evidence', 'kept the relationship'],
        weakAnswerSignals: ['"they didn\'t get design"', 'gave in without reasoning'] },
      { text: 'Our trial-to-paid conversion dropped from 18% to 12% after a redesign. What do you do this week?', type: 'situational', probes: ['gma', 'empathy', 'agency'],
        strongAnswerSignals: ['look at funnel data and session recordings', 'talk to 5 churned trials', 'quick reversible test'],
        weakAnswerSignals: ['redesign again from scratch', 'blames marketing'] },
      { text: 'Work sample: redesign our onboarding first-run (3 h). Present the rationale for 20 minutes.', type: 'work_sample', probes: ['craft', 'communication', 'empathy'],
        strongAnswerSignals: ['clear hypothesis about activation', 'explains trade-offs', 'realistic for engineering'],
        weakAnswerSignals: ['pretty but ignores the activation goal', 'no rationale'] },
    ],
    workSample: { description: 'Paid 3-4 h redesign of a real flow + 20 min presentation/critique.', hours: 3.5, validity: 0.33 },
    redFlags: ['portfolio work they cannot explain in detail (team or AI work presented as their own)', 'no interest in users or metrics', 'defensive in critique'],
  },

  account_executive: {
    label: 'Account executive',
    traitWeights: { craft: 0.18, conscientiousness: 0.18, coachability: 0.14, communication: 0.14, grit: 0.10, empathy: 0.10, gma: 0.08, polish: 0.08 },
    outputs: {
      quotaAttainment: { traits: { conscientiousness: 0.25, craft: 0.25, coachability: 0.15, grit: 0.1, empathy: 0.1, polish: 0.1, gma: 0.05 }, range: [0.25, 1.6], median: 0.92, note: 'Ramped annual attainment; ≈48% reach 1.0 (Bridge 2026).' },
      winRateMult: { traits: { empathy: 0.35, craft: 0.35, communication: 0.3 }, range: [0.6, 1.5], median: 1.0, note: 'Multiplier on stage-to-close conversion [design].' },
      discountDepth: { traits: { craft: 0.5, conscientiousness: 0.2, integrity: 0.3 }, range: [0.25, 0.05], median: 0.12, note: 'Average discount given to close [design].' },
      forecastAccuracy: { traits: { integrity: 0.4, conscientiousness: 0.4, gma: 0.2 }, range: [0.45, 0.92], median: 0.72, note: 'Commit vs actual [design].' },
    },
    rampWeeks: { firstOutput: [6, 10], full: [22, 30] },
    performanceDistribution: { metric: 'quota attainment', p10: 0.30, p25: 0.60, p50: 0.92, p75: 1.12, p90: 1.40, shareAtQuota: 0.48, sources: [S.bridge2026, S.salescookie2026, S.repvue2025, '[design]'] },
    sampleQuestions: [
      { text: 'Walk me through your last 4 quarters: quota, attainment, average deal size, sales cycle, and where your pipeline came from.', type: 'behavioral', probes: ['craft', 'integrity', 'conscientiousness'],
        strongAnswerSignals: ['exact numbers without hesitation', 'stack rank vs team', 'explains a bad quarter honestly', 'self-sourced pipeline share'],
        weakAnswerSignals: ['vague "I always hit"', 'numbers change under follow-up', 'cannot name deal size or cycle', 'blames territory or product every time'] },
      { text: 'Tell me about a deal you lost that you should have won. What did you change afterwards?', type: 'behavioral', probes: ['coachability', 'empathy', 'craft'],
        strongAnswerSignals: ['specific misread (champion, economic buyer)', 'concrete change in process', 'evidence it worked later'],
        weakAnswerSignals: ['"price"', 'no lesson', 'blames the SE/product'] },
      { text: 'Role-play: I am a skeptical Head of RevOps on a first call. Run 10 minutes of discovery. Then I will give you feedback and we run it again.', type: 'work_sample', probes: ['empathy', 'communication', 'coachability', 'craft'],
        strongAnswerSignals: ['open questions, quantifies pain', 'listens more than talks', 'applies the feedback in round 2', 'agrees a next step'],
        weakAnswerSignals: ['pitches features immediately', 'ignores feedback in round 2', 'talks 80% of the time'] },
      { text: 'Your biggest deal\'s champion leaves the company two weeks before signing. What do you do?', type: 'situational', probes: ['grit', 'craft', 'adaptability'],
        strongAnswerSignals: ['multi-thread map', 'reach economic buyer with the business case', 'realistic forecast update'],
        weakAnswerSignals: ['keeps it in commit', 'waits for the new person'] },
      { text: 'Tell me about the hardest stretch of rejection you went through in sales. What did your weekly numbers look like?', type: 'behavioral', probes: ['grit', 'conscientiousness'],
        strongAnswerSignals: ['activity numbers', 'adjusted approach', 'kept going with evidence'],
        weakAnswerSignals: ['quit or switched jobs fast every time', 'no numbers'] },
    ],
    workSample: { description: 'Discovery + demo role-play with mid-call feedback (coachability test), plus a written follow-up email. 60-90 min.', hours: 1.5, validity: 0.33 },
    redFlags: ['attainment numbers that change or cannot be verified with a backchannel', 'President\'s Club claims with no specifics', 'talks over the buyer in role-play', 'ignores coaching', 'sandbagging or happy-ears forecasting stories', 'trashes former companies and products'],
  },

  sdr: {
    label: 'SDR / BDR',
    traitWeights: { conscientiousness: 0.22, grit: 0.18, coachability: 0.16, communication: 0.14, craft: 0.10, agency: 0.08, ai_fluency: 0.07, gma: 0.05 },
    outputs: {
      meetingsPerMonth: { traits: { conscientiousness: 0.3, grit: 0.25, craft: 0.2, communication: 0.15, ai_fluency: 0.1 }, range: [3, 16], median: 9, note: 'Held meetings/month once ramped; median quota 10 (Bridge 2025).' },
      replyRateMult: { traits: { communication: 0.4, craft: 0.35, ai_fluency: 0.25 }, range: [0.5, 1.7], median: 1.0, note: 'Multiplier on outbound reply rate [design].' },
      qualifiedRatio: { traits: { craft: 0.4, gma: 0.3, integrity: 0.3 }, range: [0.35, 0.75], median: 0.58, note: 'Held → qualified opportunity (~50-60% benchmark).' },
    },
    rampWeeks: { firstOutput: [2, 4], full: [10, 16] },
    performanceDistribution: { metric: 'held meetings / month', p10: 4, p25: 6.5, p50: 9, p75: 11.5, p90: 15, sources: [S.bridgeSdr2025, '[design]'] },
    sampleQuestions: [
      { text: 'Tell me about a goal you hit that required hundreds of repetitive attempts. What were the numbers?', type: 'behavioral', probes: ['grit', 'conscientiousness'],
        strongAnswerSignals: ['counts and conversion rates', 'daily system', 'adjusted based on data'],
        weakAnswerSignals: ['no numbers', 'gave up quickly', 'only talks about motivation'] },
      { text: 'Write a 90-word cold email to this prospect (we give you their LinkedIn and company page). 20 minutes, AI allowed.', type: 'work_sample', probes: ['communication', 'craft', 'ai_fluency'],
        strongAnswerSignals: ['specific relevant hook', 'one clear ask', 'no generic AI fluff', 'correct facts'],
        weakAnswerSignals: ['generic template', 'hallucinated facts', 'feature dump'] },
      { text: 'A prospect replies "not interested, stop emailing". What do you do?', type: 'situational', probes: ['integrity', 'empathy'],
        strongAnswerSignals: ['stops and marks do-not-contact', 'polite close', 'notes learnings'],
        weakAnswerSignals: ['keeps sequencing', 'argues'] },
      { text: 'Cold-call role-play, then feedback, then a second attempt.', type: 'work_sample', probes: ['coachability', 'communication'],
        strongAnswerSignals: ['clear opener', 'handles one objection', 'improves visibly on round 2'],
        weakAnswerSignals: ['same mistakes on round 2', 'defensive'] },
    ],
    workSample: { description: 'Research 3 accounts + write first-touch emails + call role-play with feedback (90 min).', hours: 1.5, validity: 0.33 },
    redFlags: ['no tolerance for rejection stories', 'ignores opt-outs', 'pads activity metrics', 'refuses feedback'],
  },

  support: {
    label: 'Customer support specialist',
    traitWeights: { empathy: 0.20, communication: 0.20, conscientiousness: 0.15, craft: 0.13, gma: 0.10, adaptability: 0.08, integrity: 0.07, ai_fluency: 0.07 },
    outputs: {
      csat: { traits: { empathy: 0.35, communication: 0.35, craft: 0.15, adaptability: 0.15 }, range: [0.68, 0.95], median: 0.85, note: 'Per-agent CSAT. Good band 75-85%.' },
      ticketsPerDayMult: { traits: { craft: 0.3, conscientiousness: 0.25, gma: 0.2, ai_fluency: 0.25 }, range: [0.55, 1.6], median: 1.0, note: 'Throughput vs a median agent [design].' },
      firstResponseMult: { traits: { conscientiousness: 0.6, agency: 0.4 }, range: [1.8, 0.6], median: 1.0, note: 'Multiplier on first-response time (lower is better) [design].' },
      escalationRate: { traits: { craft: 0.5, gma: 0.3, agency: 0.2 }, range: [0.35, 0.08], median: 0.18, note: 'Share escalated to engineering/founder [design].' },
    },
    rampWeeks: { firstOutput: [1, 2], full: [3, 6] },
    performanceDistribution: { metric: 'CSAT', p10: 0.72, p25: 0.79, p50: 0.85, p75: 0.90, p90: 0.94, sources: [S.csatBand, '[design]'] },
    sampleQuestions: [
      { text: 'Tell me about the angriest customer you helped. What did you say first, and how did it end?', type: 'behavioral', probes: ['empathy', 'adaptability', 'communication'],
        strongAnswerSignals: ['acknowledges the emotion specifically', 'owns the next step', 'follow-up and outcome', 'stays calm'],
        weakAnswerSignals: ['blames the customer', 'escalates immediately', 'no resolution'] },
      { text: 'Work sample: answer these 5 real tickets in writing (one angry, one bug, one billing, one feature request, one vague). 60 minutes; AI drafts allowed but you are responsible.', type: 'work_sample', probes: ['communication', 'empathy', 'craft', 'ai_fluency'],
        strongAnswerSignals: ['clear, warm, correct', 'asks the right clarifying question on the vague one', 'reproduces the bug with steps', 'no AI hallucinations'],
        weakAnswerSignals: ['canned or wrong answers', 'promises features or refunds without authority', 'typos and walls of text'] },
      { text: 'A customer asks for a refund outside our policy and threatens a 1-star review. What do you do?', type: 'situational', probes: ['integrity', 'empathy', 'gma'],
        strongAnswerSignals: ['understands the cause', 'applies policy with judgment and escalation path', 'documents it'],
        weakAnswerSignals: ['caves without thinking', 'argues with the customer'] },
      { text: 'Tell me about a time you found a pattern in tickets and got it fixed at the source.', type: 'behavioral', probes: ['agency', 'craft'],
        strongAnswerSignals: ['quantified the pattern', 'wrote it up for product', 'ticket volume dropped'],
        weakAnswerSignals: ['just answered tickets'] },
    ],
    workSample: { description: 'Answer 5 realistic tickets in writing (60 min), score on a rubric for accuracy, tone, clarity and next steps.', hours: 1, validity: 0.33 },
    redFlags: ['sarcastic or blaming tone in writing', 'makes promises outside authority', 'cannot write clearly', 'shares customer data carelessly'],
  },

  customer_success: {
    label: 'Customer success manager',
    traitWeights: { empathy: 0.17, communication: 0.17, domain: 0.14, conscientiousness: 0.14, agency: 0.12, craft: 0.10, gma: 0.08, integrity: 0.08 },
    outputs: {
      churnMult: { traits: { empathy: 0.25, agency: 0.25, conscientiousness: 0.25, domain: 0.25 }, range: [1.3, 0.7], median: 1.0, note: 'Multiplier on churn of assigned accounts [design].' },
      expansionMult: { traits: { domain: 0.3, craft: 0.3, communication: 0.2, agency: 0.2 }, range: [0.7, 1.5], median: 1.0, note: 'Multiplier on expansion MRR [design].' },
      healthAccuracy: { traits: { gma: 0.4, conscientiousness: 0.3, integrity: 0.3 }, range: [0.5, 0.9], median: 0.7, note: 'How early at-risk accounts are flagged [design].' },
    },
    rampWeeks: { firstOutput: [2, 4], full: [8, 13] },
    performanceDistribution: { metric: 'net revenue retention delta vs median', p10: -0.06, p25: -0.03, p50: 0, p75: 0.03, p90: 0.07, sources: ['[design]'] },
    sampleQuestions: [
      { text: 'Tell me about an account you saved from churning. What were the early signals, and what did you do?', type: 'behavioral', probes: ['agency', 'empathy', 'domain'],
        strongAnswerSignals: ['specific usage signals', 'exec alignment', 'success plan with dates', 'renewal outcome'],
        weakAnswerSignals: ['discount was the only lever', 'noticed too late'] },
      { text: 'A customer is using 20% of seats 3 months before renewal. Plan the next 90 days.', type: 'situational', probes: ['craft', 'conscientiousness', 'domain'],
        strongAnswerSignals: ['diagnose why', 'adoption plan with owner', 'honest right-sizing option'],
        weakAnswerSignals: ['send a check-in email', 'push the full renewal blindly'] },
      { text: 'Work sample: run a 20-minute QBR for this (fictional) account using the data pack.', type: 'work_sample', probes: ['communication', 'domain', 'craft'],
        strongAnswerSignals: ['business outcomes first', 'clear asks', 'risks surfaced'],
        weakAnswerSignals: ['feature tour', 'no asks'] },
    ],
    workSample: { description: 'QBR or renewal-risk plan from a data pack (2 h prep + 20 min presentation).', hours: 2.5, validity: 0.33 },
    redFlags: ['relationship-only, no metrics', 'avoids hard conversations', 'over-promises roadmap'],
  },

  founding_ae: {
    label: 'Founding AE',
    traitWeights: { craft: 0.16, agency: 0.14, conscientiousness: 0.14, coachability: 0.1, communication: 0.14, grit: 0.12, empathy: 0.1, ambiguity_tolerance: 0.1 },
    outputs: {
      quotaAttainment: { traits: { agency: 0.25, craft: 0.25, grit: 0.2, conscientiousness: 0.15, empathy: 0.15 }, range: [0.2, 1.6], median: 0.8, note: 'Founding AEs build process as they sell: lower median attainment, wider spread than a ramped AE [design].' },
      winRateMult: { traits: { empathy: 0.35, craft: 0.35, communication: 0.3 }, range: [0.6, 1.5], median: 1.0, note: 'Multiplier on stage-to-close conversion [design].' },
      discountDepth: { traits: { craft: 0.5, conscientiousness: 0.2, integrity: 0.3 }, range: [0.25, 0.05], median: 0.12, note: 'Average discount given to close [design].' },
      forecastAccuracy: { traits: { integrity: 0.4, conscientiousness: 0.4, gma: 0.2 }, range: [0.4, 0.9], median: 0.65, note: 'Commit vs actual [design].' },
    },
    rampWeeks: { firstOutput: [4, 8], full: [14, 22] },
    performanceDistribution: { metric: 'quota attainment', p10: 0.2, p25: 0.5, p50: 0.8, p75: 1.05, p90: 1.4, sources: ['[design]'] },
    sampleQuestions: [
      { text: 'Tell me about a time you were the first sales hire or sold with no playbook. What did you build, and what did you sell in the first 90 days?', type: 'behavioral', probes: ['agency', 'ambiguity_tolerance', 'craft'],
        strongAnswerSignals: ['built a repeatable pitch and a list from scratch', 'numbers for first deals', 'worked with the founder on what the product could not do'],
        weakAnswerSignals: ['needs enablement and a playbook', 'only inherited pipeline', 'big-company process'] },
      { text: 'You have no marketing and no SDR. Where do your first 20 qualified meetings come from?', type: 'situational', probes: ['agency', 'grit', 'craft'],
        strongAnswerSignals: ['named channels and a weekly activity plan', 'uses the founder network and warm intros first', 'tracks conversion by source'],
        weakAnswerSignals: ['waits for leads', 'asks for a marketing budget first'] },
      { text: 'Role-play: skeptical buyer on discovery, then feedback, then again.', type: 'work_sample', probes: ['empathy', 'communication', 'coachability'],
        strongAnswerSignals: ['quantifies pain', 'applies feedback in round 2'], weakAnswerSignals: ['pitches features', 'defensive'] },
    ],
    workSample: { description: 'Discovery role-play with mid-call feedback plus a one-page 90-day pipeline plan (90 min).', hours: 1.5, validity: 0.33 },
    redFlags: ['wants a big base and a full team before selling', 'never closed without inbound', 'blames product-market fit for every miss', 'cannot name where first pipeline would come from'],
  },

  csm: {
    label: 'Customer success manager (account book)',
    traitWeights: { empathy: 0.17, communication: 0.15, domain: 0.14, conscientiousness: 0.16, agency: 0.14, craft: 0.1, integrity: 0.08, gma: 0.06 },
    outputs: {
      churnMult: { traits: { empathy: 0.25, agency: 0.25, conscientiousness: 0.25, domain: 0.25 }, range: [1.3, 0.7], median: 1.0, note: 'Multiplier on the churn effect of their covered accounts (lower is better) [design].' },
      healthAccuracy: { traits: { gma: 0.4, conscientiousness: 0.3, integrity: 0.3 }, range: [0.5, 0.9], median: 0.7, note: 'How early at-risk accounts are flagged [design].' },
      capacityMult: { traits: { conscientiousness: 0.4, craft: 0.3, agency: 0.3 }, range: [0.75, 1.3], median: 1.0, note: 'Multiplier on the number of accounts one CSM covers well [design].' },
      expansionMult: { traits: { domain: 0.3, craft: 0.3, communication: 0.2, agency: 0.2 }, range: [0.7, 1.5], median: 1.0, note: 'Multiplier on expansion they surface [design].' },
    },
    rampWeeks: { firstOutput: [3, 5], full: [8, 12] },
    performanceDistribution: { metric: 'net revenue retention delta vs median', p10: -0.06, p25: -0.03, p50: 0, p75: 0.03, p90: 0.07, sources: ['[design]'] },
    sampleQuestions: [
      { text: 'Tell me about the book of accounts you carried: how many, what ARR, and what happened to GRR and NRR over your last two years.', type: 'behavioral', probes: ['conscientiousness', 'domain', 'integrity'],
        strongAnswerSignals: ['exact accounts, ARR, GRR and NRR', 'names the saves and the losses', 'explains coverage tiers'],
        weakAnswerSignals: ['relationship talk only', 'no numbers', 'claims no churn on their watch'] },
      { text: 'A customer is using 20% of seats 3 months before renewal. Plan the next 90 days. Would you sell them more?', type: 'situational', probes: ['craft', 'integrity', 'domain'],
        strongAnswerSignals: ['adoption first, right-sizing offered honestly', 'sponsor engagement', 'no upsell before value'],
        weakAnswerSignals: ['pushes the add-on', 'discount as the only lever'] },
      { text: 'Work sample: build a health score and a 90-day plan for this book (data pack of 40 accounts).', type: 'work_sample', probes: ['craft', 'conscientiousness', 'gma'],
        strongAnswerSignals: ['triages by ARR and risk', 'leading indicators', 'tiers touch levels'], weakAnswerSignals: ['treats all accounts the same', 'NPS as health'] },
    ],
    workSample: { description: 'Triage a 40-account data pack into tiers and write the first 90 days (2 h).', hours: 2, validity: 0.33 },
    redFlags: ['relationship-only, no metrics', 'incentivised to upsell and proud of it', 'avoids hard renewal conversations', 'over-promises roadmap'],
  },

  am: {
    label: 'Account manager (expansion and renewals)',
    traitWeights: { craft: 0.18, communication: 0.15, empathy: 0.13, conscientiousness: 0.14, grit: 0.12, domain: 0.1, integrity: 0.1, coachability: 0.08 },
    outputs: {
      expansionMult: { traits: { craft: 0.3, communication: 0.25, grit: 0.2, domain: 0.25 }, range: [0.6, 1.6], median: 1.0, note: 'Multiplier on expansion deals they open and close [design].' },
      renewalMult: { traits: { empathy: 0.3, conscientiousness: 0.35, communication: 0.2, integrity: 0.15 }, range: [0.7, 1.4], median: 1.0, note: 'Multiplier on their renewal bonus [design].' },
      discountDepth: { traits: { craft: 0.5, conscientiousness: 0.2, integrity: 0.3 }, range: [0.25, 0.04], median: 0.1, note: 'Average concession at expansion and renewal [design].' },
      capacityMult: { traits: { conscientiousness: 0.4, craft: 0.3, agency: 0.3 }, range: [0.75, 1.3], median: 1.0, note: 'Multiplier on the number of accounts covered [design].' },
    },
    rampWeeks: { firstOutput: [4, 6], full: [10, 14] },
    performanceDistribution: { metric: 'expansion ARR vs quota', p10: 0.35, p25: 0.65, p50: 0.95, p75: 1.15, p90: 1.45, sources: ['[design]'] },
    sampleQuestions: [
      { text: 'Walk me through an account you grew 3x. Where did the whitespace come from, who was the sponsor, and how did you price the expansion?', type: 'behavioral', probes: ['craft', 'communication', 'domain'],
        strongAnswerSignals: ['account map with departments', 'named exec sponsor', 'priced at list, not anchored on the land discount'], weakAnswerSignals: ['more seats to the same champion', 'discount-led'] },
      { text: 'Your champion just left. The renewal is in 70 days. What do you do this week?', type: 'situational', probes: ['grit', 'craft', 'empathy'],
        strongAnswerSignals: ['multi-thread map and an exec business review', 'follows the champion', 'honest risk call'], weakAnswerSignals: ['waits for the new person', 'sends a discount'] },
    ],
    workSample: { description: 'Account plan for a fictional $60K account with three whitespace departments (2 h).', hours: 2, validity: 0.33 },
    redFlags: ['pitches seats without a use case', 'renewals only by discount', 'cannot name the economic buyer on a past account'],
  },

  se: {
    label: 'Sales engineer',
    traitWeights: { craft: 0.2, communication: 0.16, domain: 0.14, gma: 0.12, empathy: 0.1, conscientiousness: 0.12, adaptability: 0.08, integrity: 0.08 },
    outputs: {
      technicalWinMult: { traits: { craft: 0.35, domain: 0.25, communication: 0.25, empathy: 0.15 }, range: [0.85, 1.25], median: 1.0, note: 'Multiplier on the technical-win effect (security review, POC, integrations) [design].' },
      cycleMult: { traits: { conscientiousness: 0.4, craft: 0.3, agency: 0.3 }, range: [1.1, 0.8], median: 1.0, note: 'Multiplier on how much they shorten enterprise cycles (lower is better) [design].' },
      demoQuality: { traits: { communication: 0.4, craft: 0.3, empathy: 0.3 }, range: [0.5, 0.95], median: 0.72, note: 'Demo and POC quality [design].' },
    },
    rampWeeks: { firstOutput: [4, 6], full: [12, 18] },
    performanceDistribution: { metric: 'technical win rate delta', p10: -0.08, p25: -0.04, p50: 0, p75: 0.04, p90: 0.09, sources: ['[design]'] },
    sampleQuestions: [
      { text: 'Describe a technical evaluation you won against a better-known competitor. What did the proof of concept prove, and what did you leave out?', type: 'behavioral', probes: ['craft', 'domain', 'integrity'],
        strongAnswerSignals: ['scoped POC to success criteria', 'security questionnaire handled quickly', 'honest about gaps'], weakAnswerSignals: ['feature tour', 'promised roadmap to close'] },
      { text: 'The AE promises a feature that does not exist. The buyer asks you on the call. What do you say?', type: 'situational', probes: ['integrity', 'communication', 'adaptability'],
        strongAnswerSignals: ['corrects honestly and reframes to what ships', 'debriefs the AE'], weakAnswerSignals: ['goes along', 'blames the AE publicly'] },
    ],
    workSample: { description: 'Run a 30-minute technical demo for a skeptical architect from a short brief, then answer five hard questions (90 min).', hours: 1.5, validity: 0.33 },
    redFlags: ['only knows the demo path', 'promises roadmap on calls', 'no security or integration experience'],
  },

  marketer: {
    label: 'Marketer / growth',
    traitWeights: { craft: 0.22, gma: 0.15, agency: 0.15, ai_fluency: 0.12, adaptability: 0.10, communication: 0.10, conscientiousness: 0.08, domain: 0.08 },
    outputs: {
      experimentsPerMonth: { traits: { agency: 0.35, ai_fluency: 0.25, conscientiousness: 0.2, craft: 0.2 }, range: [1, 8], median: 3.5, note: '[design]' },
      cacMult: { traits: { craft: 0.4, gma: 0.3, domain: 0.15, adaptability: 0.15 }, range: [1.5, 0.7], median: 1.0, note: 'Multiplier on blended CAC for channels they run [design].' },
      contentQuality: { traits: { craft: 0.4, communication: 0.3, domain: 0.3 }, range: [35, 90], median: 62, note: '0-100 [design].' },
    },
    rampWeeks: { firstOutput: [2, 4], full: [8, 16] },
    performanceDistribution: { metric: 'relative pipeline/signups per $', p10: 0.5, p25: 0.75, p50: 1.0, p75: 1.3, p90: 1.75, sources: [S.hunter1990, '[design]'] },
    sampleQuestions: [
      { text: 'Tell me about a channel you grew from zero. Starting numbers, ending numbers, spend, and what didn\'t work.', type: 'behavioral', probes: ['craft', 'gma', 'integrity'],
        strongAnswerSignals: ['before/after with CAC or conversion', 'failed experiments named', 'attribution caveats acknowledged'],
        weakAnswerSignals: ['vanity metrics (impressions)', 'took credit for brand or sales-led growth', 'no failures'] },
      { text: 'Organic traffic fell 35% after Google expanded AI Overviews in our category. What do you do in the next 30 days?', type: 'situational', probes: ['adaptability', 'craft', 'ai_fluency'],
        strongAnswerSignals: ['checks which queries/pages lost clicks vs rankings', 'GEO/citations plan', 'diversifies channels', 'sets measurable goals'],
        weakAnswerSignals: ['publish more blog posts', 'panic switch to paid without math'] },
      { text: 'Work sample: with a $3k/month budget and this product, write a 30-day growth plan with 3 experiments and success metrics (2 h).', type: 'work_sample', probes: ['craft', 'gma', 'communication'],
        strongAnswerSignals: ['ICP-specific', 'clear hypotheses and kill criteria', 'realistic numbers'],
        weakAnswerSignals: ['generic "do SEO, social, ads"', 'no metrics'] },
    ],
    workSample: { description: '30-day growth plan or landing-page + ad set for the real product (2-3 h), then a 30 min defense.', hours: 2.5, validity: 0.33 },
    redFlags: ['only vanity metrics', 'cannot explain attribution', 'tool-name dropping without results', 'big-budget-only experience for a $3k budget role'],
  },

  content_writer: {
    label: 'Content writer',
    traitWeights: { craft: 0.28, domain: 0.16, conscientiousness: 0.14, gma: 0.12, ai_fluency: 0.12, empathy: 0.10, coachability: 0.08 },
    outputs: {
      contentQuality: { traits: { craft: 0.45, domain: 0.25, empathy: 0.15, gma: 0.15 }, range: [30, 92], median: 60, note: '0-100; feeds SEO/GEO traffic and conversion [design].' },
      piecesPerWeekMult: { traits: { conscientiousness: 0.4, ai_fluency: 0.35, craft: 0.25 }, range: [0.5, 1.8], median: 1.0, note: '[design]' },
      factualErrorRate: { traits: { conscientiousness: 0.5, domain: 0.3, integrity: 0.2 }, range: [0.15, 0.01], median: 0.05, note: 'Share of pieces with a material error (AI hallucinations included) [design].' },
    },
    rampWeeks: { firstOutput: [1, 2], full: [3, 6] },
    performanceDistribution: { metric: 'content quality', p10: 40, p25: 50, p50: 60, p75: 70, p90: 80, sources: ['[design]'] },
    sampleQuestions: [
      { text: 'Show me a piece you are proud of. What was the brief, who did you interview, and how did it perform?', type: 'behavioral', probes: ['craft', 'domain', 'integrity'],
        strongAnswerSignals: ['original research or interviews', 'traffic/leads numbers', 'edits they accepted'],
        weakAnswerSignals: ['cannot share performance', 'generic listicles only', 'AI-written samples presented as their own'] },
      { text: 'Paid work sample: write a 700-word piece for our ICP from this 30-minute customer interview transcript (3 h).', type: 'work_sample', probes: ['craft', 'empathy', 'domain'],
        strongAnswerSignals: ['uses specific customer insight', 'clear structure', 'accurate', 'distinct voice'],
        weakAnswerSignals: ['generic AI tone', 'ignores the transcript', 'factual errors'] },
      { text: 'An editor rewrites half your draft. What do you do?', type: 'situational', probes: ['coachability', 'communication'],
        strongAnswerSignals: ['asks for the reasoning', 'applies the patterns next time'],
        weakAnswerSignals: ['takes it personally', 'ignores it'] },
    ],
    workSample: { description: 'Paid 2-3 h article from a real customer interview transcript; scored for insight, clarity and accuracy.', hours: 3, validity: 0.33 },
    redFlags: ['samples cannot be verified', 'no interest in the product or customer', 'pushes volume over insight'],
  },

  ops_generalist: {
    label: 'Ops / generalist (first business hire, chief of staff)',
    traitWeights: { gma: 0.18, agency: 0.17, conscientiousness: 0.17, ambiguity_tolerance: 0.14, adaptability: 0.12, communication: 0.08, integrity: 0.08, ai_fluency: 0.06 },
    outputs: {
      founderHoursSavedPerWeek: { traits: { agency: 0.3, gma: 0.25, conscientiousness: 0.25, ambiguity_tolerance: 0.2 }, range: [2, 16], median: 8, note: '[design]' },
      processErrorMult: { traits: { conscientiousness: 0.5, integrity: 0.3, gma: 0.2 }, range: [2.0, 0.5], median: 1.0, note: 'Errors in billing, payroll, vendor, compliance tasks [design].' },
      projectsShippedPerQuarter: { traits: { agency: 0.4, ambiguity_tolerance: 0.3, adaptability: 0.3 }, range: [1, 7], median: 3, note: '[design]' },
    },
    rampWeeks: { firstOutput: [1, 2], full: [4, 8] },
    performanceDistribution: { metric: 'relative output', p10: 0.5, p25: 0.75, p50: 1.0, p75: 1.3, p90: 1.7, sources: [S.hunter1990, '[design]'] },
    sampleQuestions: [
      { text: 'Tell me about a messy process you owned with no playbook. What did you build, and what broke?', type: 'behavioral', probes: ['agency', 'ambiguity_tolerance', 'conscientiousness'],
        strongAnswerSignals: ['clear before/after', 'documented system', 'fixes when it broke'],
        weakAnswerSignals: ['needed a manager to define it', 'no artifacts'] },
      { text: 'It is your first week. The founder hands you: payroll is late, a vendor contract renews tomorrow, and 40 support tickets are open. Prioritise out loud.', type: 'situational', probes: ['gma', 'ambiguity_tolerance', 'communication'],
        strongAnswerSignals: ['legal/financial deadlines first', 'quick triage with founder check-in', 'asks what authority they have'],
        weakAnswerSignals: ['does them in arrival order', 'tries to do everything perfectly'] },
      { text: 'Work sample: given our messy expenses CSV and calendar, propose a weekly ops cadence and fix 3 problems you find (2 h).', type: 'work_sample', probes: ['gma', 'conscientiousness', 'ai_fluency'],
        strongAnswerSignals: ['finds real anomalies', 'simple system', 'clear writeup'],
        weakAnswerSignals: ['misses obvious errors', 'over-engineered tooling'] },
    ],
    workSample: { description: 'Untangle a realistic ops mess (expenses, vendor list, calendar) and propose a cadence (2 h).', hours: 2, validity: 0.33 },
    redFlags: ['needs detailed instructions', 'big-company process heaviness', 'loose with money or confidential data'],
  },

  // Fractional executives (part-time, retainer or hourly). Rates: docs/research/hiring-global/international-part-time.md §4.
  // Outputs are [design]; there is no public benchmark for what a fractional exec delivers.
  fractional_cfo: {
    label: 'Fractional CFO / finance lead',
    traitWeights: { domain: 0.2, integrity: 0.18, conscientiousness: 0.17, gma: 0.15, communication: 0.12, craft: 0.1, agency: 0.08 },
    outputs: {
      founderHoursSavedPerWeek: { traits: { domain: 0.3, conscientiousness: 0.3, gma: 0.2, agency: 0.2 }, range: [0.5, 5], median: 2.5, note: 'Finance questions, board and investor reporting, close hygiene [design].' },
      processErrorMult: { traits: { conscientiousness: 0.5, integrity: 0.3, gma: 0.2 }, range: [1.6, 0.6], median: 1.0, note: 'Errors in forecasts, taxes, close [design].' },
    },
    rampWeeks: { firstOutput: [1, 2], full: [3, 6] },
    performanceDistribution: { metric: 'relative output', p10: 0.5, p25: 0.75, p50: 1.0, p75: 1.25, p90: 1.5, sources: ['[design]'] },
    sampleQuestions: [
      { text: 'Tell me about a startup you set up monthly close and a cash forecast for. What did you change in the first 60 days?', type: 'behavioral', probes: ['domain', 'conscientiousness', 'agency'],
        strongAnswerSignals: ['named cadence and artifacts', 'a forecast tied to actuals', 'what they stopped doing'], weakAnswerSignals: ['advice without deliverables', 'big-company reporting only'] },
      { text: 'We have 7 months of runway and revenue is flat. What do you bring me in your first two weeks and what do you need from me?', type: 'situational', probes: ['gma', 'communication', 'integrity'],
        strongAnswerSignals: ['asks for bank, Stripe and payroll data first', 'scenarios with triggers', 'honest about what is unknowable'], weakAnswerSignals: ['templates', 'only fundraising advice'] },
    ],
    workSample: { description: 'Review a messy 3-month P&L and cash export; write a one-page forecast and the 3 questions you would ask the founder (2 h).', hours: 2, validity: 0.33 },
    redFlags: ['unclear about how many clients they carry', 'no deliverables, only calls', 'cannot explain deferred revenue', 'wants access to everything on day one'],
  },
  fractional_cmo: {
    label: 'Fractional CMO / head of growth',
    traitWeights: { domain: 0.18, craft: 0.17, communication: 0.14, agency: 0.14, gma: 0.12, integrity: 0.1, coachability: 0.08, ai_fluency: 0.07 },
    outputs: {
      cacMult: { traits: { craft: 0.4, domain: 0.3, gma: 0.3 }, range: [1.25, 0.8], median: 1.0, note: 'Multiplier on blended CAC [design].' },
      founderHoursSavedPerWeek: { traits: { agency: 0.3, craft: 0.3, communication: 0.2, domain: 0.2 }, range: [0.5, 5], median: 2, note: '[design]' },
    },
    rampWeeks: { firstOutput: [2, 4], full: [6, 10] },
    performanceDistribution: { metric: 'relative output', p10: 0.5, p25: 0.75, p50: 1.0, p75: 1.25, p90: 1.5, sources: ['[design]'] },
    sampleQuestions: [
      { text: 'Walk me through a channel you took from zero at a company our size. What did you test first, what did you kill, and what was the CAC?', type: 'behavioral', probes: ['craft', 'domain', 'integrity'],
        strongAnswerSignals: ['kill rules and CAC numbers', 'one channel at a time', 'what failed'], weakAnswerSignals: ['brand talk', 'ten channels at once'] },
      { text: 'You have 10 hours a week and $5k a month. What do you do in the first 30 days?', type: 'situational', probes: ['gma', 'agency', 'craft'],
        strongAnswerSignals: ['picks one or two bets with a test plan', 'uses what the founder already owns', 'sets a review date'], weakAnswerSignals: ['audit then more audits', 'hires an agency'] },
    ],
    workSample: { description: 'Read our site and funnel numbers; write a 30-day test plan with kill rules (2 h).', hours: 2, validity: 0.33 },
    redFlags: ['strategy decks, no execution', 'cannot name a CAC they owned', 'sells their agency on the side'],
  },
  fractional_vp_sales: {
    label: 'Fractional VP Sales / sales coach',
    traitWeights: { domain: 0.18, craft: 0.17, communication: 0.15, coachability: 0.12, empathy: 0.12, agency: 0.1, integrity: 0.1, gma: 0.06 },
    outputs: {
      winRateMult: { traits: { craft: 0.4, domain: 0.3, communication: 0.3 }, range: [0.95, 1.2], median: 1.05, note: 'Lift on founder-led and rep win rate from coaching and deal reviews [design; no public benchmark].' },
      founderHoursSavedPerWeek: { traits: { agency: 0.3, craft: 0.3, communication: 0.2, domain: 0.2 }, range: [0.5, 4], median: 2, note: '[design]' },
    },
    rampWeeks: { firstOutput: [2, 4], full: [6, 10] },
    performanceDistribution: { metric: 'relative output', p10: 0.5, p25: 0.75, p50: 1.0, p75: 1.25, p90: 1.5, sources: ['[design]'] },
    sampleQuestions: [
      { text: 'Tell me about the first sales process you built at a company under $2M ARR. What did the founder keep, and what did you hand to reps?', type: 'behavioral', probes: ['craft', 'domain', 'coachability'],
        strongAnswerSignals: ['stage definitions and exit criteria', 'a deal review cadence', 'what quota they set and why'], weakAnswerSignals: ['playbook templates', 'wants a team first'] },
      { text: 'Here is a stalled $40k deal. Walk me through how you would coach me through the next two weeks.', type: 'situational', probes: ['empathy', 'communication', 'craft'],
        strongAnswerSignals: ['asks about the economic buyer', 'a specific next step with a date', 'candid about the risk'], weakAnswerSignals: ['generic urgency tactics'] },
    ],
    workSample: { description: 'Review 3 anonymised deals and write the coaching notes plus a stage-exit checklist (2 h).', hours: 2, validity: 0.33 },
    redFlags: ['has never carried a number', 'only enterprise playbooks', 'promises pipeline'],
  },
  fractional_head_cs: {
    label: 'Fractional Head of Customer Success',
    traitWeights: { empathy: 0.16, domain: 0.16, conscientiousness: 0.16, communication: 0.14, craft: 0.12, agency: 0.12, integrity: 0.08, gma: 0.06 },
    outputs: {
      churnMult: { traits: { empathy: 0.25, domain: 0.25, conscientiousness: 0.25, agency: 0.25 }, range: [1.1, 0.85], median: 1.0, note: 'Multiplier on churn from playbooks and escalation handling [design].' },
      founderHoursSavedPerWeek: { traits: { agency: 0.3, conscientiousness: 0.3, communication: 0.2, domain: 0.2 }, range: [0.5, 4], median: 2, note: '[design]' },
    },
    rampWeeks: { firstOutput: [2, 4], full: [6, 10] },
    performanceDistribution: { metric: 'relative output', p10: 0.5, p25: 0.75, p50: 1.0, p75: 1.25, p90: 1.5, sources: ['[design]'] },
    sampleQuestions: [
      { text: 'Tell me about the customer success playbook you built from nothing. What health signals did you use and did they predict churn?', type: 'behavioral', probes: ['domain', 'craft', 'conscientiousness'],
        strongAnswerSignals: ['usage-based signals checked against actual churn', 'tiers by ARR', 'what they stopped doing'], weakAnswerSignals: ['NPS as health', 'relationship talk'] },
    ],
    workSample: { description: 'Triage a 30-account data pack and write the 90-day playbook (2 h).', hours: 2, validity: 0.33 },
    redFlags: ['relationship-only', 'cannot show retention numbers', 'upsell-first'],
  },

  contractor: {
    label: 'Contractor / freelancer (any discipline)',
    overlayOn: ['engineer', 'designer', 'marketer', 'content_writer', 'ai_engineer'],
    traitWeights: { craft: 0.35, conscientiousness: 0.20, communication: 0.15, gma: 0.10, integrity: 0.10, ai_fluency: 0.10 },
    outputs: {
      onTimeRate: { traits: { conscientiousness: 0.6, communication: 0.4 }, range: [0.5, 0.95], median: 0.78, note: '[design]' },
      qualityMult: { traits: { craft: 0.6, gma: 0.2, conscientiousness: 0.2 }, range: [0.5, 1.5], median: 1.0, note: 'Uses the base role\'s quality output scaled by this [design].' },
      coordinationHoursPerWeek: { traits: { communication: 0.6, conscientiousness: 0.4 }, range: [6, 1], median: 3, note: 'Founder time spent managing [design].' },
    },
    rampWeeks: { firstOutput: [0.5, 1], full: [1, 3] },
    performanceDistribution: { metric: 'quality multiplier', p10: 0.55, p25: 0.75, p50: 1.0, p75: 1.2, p90: 1.45, sources: ['[design]'] },
    sampleQuestions: [
      { text: 'Show me a similar project you delivered. What was the scope, the timeline, and did it slip?', type: 'behavioral', probes: ['craft', 'conscientiousness', 'integrity'],
        strongAnswerSignals: ['real artifact and client reference', 'honest about a slip and why'],
        weakAnswerSignals: ['NDA for everything', 'never slipped (implausible)'] },
      { text: 'Paid trial: a 1-2 day scoped milestone at your normal rate.', type: 'work_sample', probes: ['craft', 'communication', 'conscientiousness'],
        strongAnswerSignals: ['delivers on time with notes', 'asks clarifying questions early'],
        weakAnswerSignals: ['silent for days', 'scope creep surprises'] },
    ],
    workSample: { description: 'Paid 1-2 day milestone with clear acceptance criteria.', hours: 12, validity: 0.4 },
    redFlags: ['bait-and-switch (someone else does the work)', 'refuses IP assignment', 'asks for large upfront payment with no milestone', 'subcontracts silently'],
  },
};

// ---------------------------------------------------------------------------------------------
// METHODS: assessment methods and their operational validity
// ---------------------------------------------------------------------------------------------
export const METHODS = {
  structuredInterview: {
    label: 'Structured interview (same questions, anchored 1-5 scoring, notes)',
    validity: 0.42, validitySd: 0.19, executionRange: [0.2, 0.5], polishWeight: 0.15,
    costHours: { design: 3, perCandidate: 1.25 }, candidateDropoff: 0.05,
    notes: 'Best single common predictor. Validity falls toward .20 if questions are not job-related, scoring is not anchored, or the interviewer drifts into chat. Behavioural + situational + 2-3 levels of probing.',
    sources: [S.sackett2022, S.barrick2009],
  },
  unstructuredInterview: {
    label: 'Unstructured interview / "culture fit" chat',
    validity: 0.19, validitySd: 0.16, polishWeight: 0.45,
    costHours: { design: 0, perCandidate: 1 }, candidateDropoff: 0.03,
    notes: 'Heavily driven by impression management and similarity; interviewers stay confident even with random answers. Lowers accuracy when added to good data.',
    sources: [S.sackett2022, S.dana2013, S.rivera2012],
  },
  workSample: {
    label: 'Work sample (short, job-realistic, live or with live walkthrough)',
    validity: 0.33, validitySd: 0.09,
    costHours: { design: 4, perCandidate: 1, candidateHours: 2.5 }, candidateDropoff: 0.15,
    notes: 'Most job-relevant; perceived as fair. Keep under ~3 h and pay if longer than ~4 h. Measures craft directly; reduces polish bias.',
    sources: [S.sackett2022],
  },
  jobKnowledgeTest: {
    label: 'Job knowledge questions/test',
    validity: 0.40, validitySd: 0.13,
    costHours: { design: 3, perCandidate: 0.5 }, candidateDropoff: 0.05,
    notes: 'Good for experienced hires in technical domains; less useful for juniors or generalists.',
    sources: [S.sackett2022],
  },
  takeHome: {
    label: 'Unsupervised take-home (2026)',
    validity: 0.2, validityRange: [0.15, 0.25], validityWithWalkthrough: 0.32,
    costHours: { design: 3, perCandidate: 1, candidateHours: 4 }, candidateDropoff: 0.38,
    notes: '~62% completion (interviewing.io). In 2026 unsupervised output is often AI-generated; validity recovers only with a live walkthrough/extension. Long unpaid take-homes drive away employed senior candidates. [design] validity.',
    sources: [S.ivTakehome, S.fabric2026, '[design]'],
  },
  paidTrial: {
    label: 'Paid trial project / job tryout (1-5 days)',
    validity: 0.4, validityRange: [0.35, 0.45],
    costHours: { design: 3, perCandidate: 6, candidateHours: 16 }, candidateDropoff: 0.35, cashCostDays: [1, 5],
    notes: 'S&H 1998 job tryout .44 (not re-estimated by Sackett 2022). Highest realism but costly; many employed candidates cannot do it. Needs a contractor agreement with IP assignment.',
    sources: [S.sh1998, '[design]'],
  },
  gmaTest: {
    label: 'Cognitive ability test',
    validity: 0.31, validityModern: 0.23, validitySd: 0.14,
    costHours: { design: 0.5, perCandidate: 0.25, candidateHours: 0.5 }, candidateDropoff: 0.1,
    notes: 'Revised down from .51. Largest adverse impact of common predictors; dropping it from a composite costs only ~.05 validity. Objective sales: ~.04 (Vinchur).',
    sources: [S.sackett2022, S.sackett2023, S.vinchur1998],
  },
  integrityTest: {
    label: 'Integrity test',
    validity: 0.31, validitySd: 0.20,
    costHours: { design: 0.5, perCandidate: 0.2, candidateHours: 0.3 }, candidateDropoff: 0.05,
    notes: 'Wide variability across studies. Rarely used by startups; backchannel is the practical substitute.',
    sources: [S.sackett2022],
  },
  personalityTest: {
    label: 'Personality questionnaire (conscientiousness)',
    validity: 0.19, validityContextualized: 0.25,
    costHours: { design: 0.5, perCandidate: 0.2, candidateHours: 0.3 }, candidateDropoff: 0.05,
    notes: 'Fakeable in high-stakes use. Contextualised (at-work) items do better. Grit and EI scales add little beyond conscientiousness/personality.',
    sources: [S.sackett2022, S.crede2017, S.joseph2010],
  },
  sjt: {
    label: 'Situational judgment test',
    validity: 0.26,
    costHours: { design: 4, perCandidate: 0.3, candidateHours: 0.5 }, candidateDropoff: 0.05,
    notes: 'Good for support/CS judgment; questions must be job-specific.',
    sources: [S.sackett2022],
  },
  referenceCheck: {
    label: 'Reference check (candidate-supplied)',
    validity: 0.26, validityStructured: 0.3,
    costHours: { design: 0.5, perCandidate: 1 }, candidateDropoff: 0.02,
    notes: 'Lenient: candidates choose referees. Structured questions ("would you rehire?", "1-10 vs peers") help. [design] structured value bounded by the .29-.32 estimates.',
    sources: [S.references],
  },
  backchannel: {
    label: 'Backchannel reference (people the candidate did not name)',
    validity: 0.3, validityRange: [0.25, 0.35],
    costHours: { design: 0, perCandidate: 1.5 }, candidateDropoff: 0,
    notes: '[design] No validity study. Strongest for red flags (integrity, toxicity, inflated numbers). Never contact a current employer without consent; legal/ethical risk if done carelessly.',
    sources: ['[design]', '[Q] VC/startup practice'],
  },
  yearsExperience: {
    label: 'Years-of-experience filter',
    validity: 0.07,
    costHours: { design: 0, perCandidate: 0.05 }, candidateDropoff: 0,
    notes: 'Near-zero validity. Good as a minimum-competence screen only.',
    sources: [S.sackett2022],
  },
  educationFilter: {
    label: 'Degree / GPA / pedigree filter',
    validity: 0.1,
    costHours: { design: 0, perCandidate: 0.05 }, candidateDropoff: 0,
    notes: 'S&H 1998 years of education .10. Google stopped asking for GPAs except for recent graduates. Raises polish more than performance.',
    sources: [S.sh1998, S.bock2013],
  },
  brainteaser: {
    label: 'Brainteaser questions',
    validity: 0.02,
    costHours: { design: 0, perCandidate: 0.3 }, candidateDropoff: 0.05,
    notes: 'Obsolete. "A complete waste of time" (Google, 2013). [design] near-zero validity, small candidate-experience penalty.',
    sources: [S.bock2013, '[design]'],
  },
};

// ---------------------------------------------------------------------------------------------
// ILLEGAL_TOPICS: US interview questions the game penalises (federal + common state rules)
// examplePatterns are case-insensitive regex source strings.
// ---------------------------------------------------------------------------------------------
export const ILLEGAL_TOPICS = [
  { topic: 'age', examplePatterns: ['how old are you', '\\byour age\\b', 'what year were you born', 'when were you born', 'when did you graduate (high school|college)', 'graduation year', 'near(ing)? retirement', 'digital native'], note: 'ADEA protects 40+. Allowed: "Are you at least 18?" if legally required.' },
  { topic: 'religion', examplePatterns: ['what religion', 'are you religious', 'go to church', 'church|mosque|synagogue|temple', 'religious holidays', 'do you pray', 'christian|muslim|jewish|hindu'], note: 'Title VII. Allowed: "Can you work the required schedule (including weekends if the job needs it)?"' },
  { topic: 'national_origin_citizenship', examplePatterns: ['where are you (really |originally )?from', 'where were you born', 'is that accent', 'native language', 'what nationality', 'are you a (us )?citizen', 'your (ethnic|ethnicity)', 'green card'], note: 'Title VII / IRCA. Allowed: "Are you legally authorised to work in the US? Will you now or in future require sponsorship?"' },
  { topic: 'race_color', examplePatterns: ['what race are you', 'what is your race', 'skin colou?r'], note: 'Title VII. Never ask; voluntary EEO self-ID is separate from hiring decisions.' },
  { topic: 'marital_family_status', examplePatterns: ['are you married', 'your (husband|wife|spouse|partner) do', 'do you have (any )?(kids|children)', 'planning (to have|on having) (kids|children|a family)', 'childcare', 'single parent', 'maiden name'], note: 'Sex/family-status discrimination risk (federal + many states). Allowed: "Can you meet the travel/schedule requirements?"' },
  { topic: 'pregnancy', examplePatterns: ['are you pregnant', 'plan(ning)? to get pregnant', 'maternity leave plans', 'expecting a baby'], note: 'Pregnancy Discrimination Act; Pregnant Workers Fairness Act (accommodation).' },
  { topic: 'disability_health', examplePatterns: ['do you have (a|any) disabilit', '(any|your) health (problems|issues|conditions)', 'how is your health', 'medical condition', 'what medications', 'your mental health', 'how many sick days', 'ever been injured', 'workers.? comp', 'are you in therapy', 'do you have (adhd|autism|depression|anxiety)'], note: 'ADA bans pre-offer disability/medical inquiries. Allowed: "Can you perform the essential functions of this job, with or without reasonable accommodation?"' },
  { topic: 'genetic_info', examplePatterns: ['family (medical|health) history', 'runs in your family', 'genetic test'], note: 'GINA.' },
  { topic: 'sex_orientation_gender_identity', examplePatterns: ['\\bare you (gay|straight|lesbian|bisexual)\\b', 'sexual orientation', 'are you trans', 'gender identity', '\\b(boyfriend|girlfriend)\\b'], note: 'Title VII (Bostock 2020).' },
  { topic: 'salary_history', examplePatterns: ['what (are|were) you (making|paid|earning)', 'current salary', 'previous salary', 'last salary', 'salary history', 'how much do you make', 'current (comp|compensation)'], note: 'Banned in ~20+ states + DC and many cities (game: treat as illegal everywhere). Allowed: "What are your salary expectations for this role?"' },
  { topic: 'arrest_conviction_record', examplePatterns: ['ever been arrested', 'criminal record', 'ever been convicted', 'been to (jail|prison)'], note: 'Arrests: EEOC disfavours. Convictions: ban-the-box/fair-chance laws in many states/cities restrict asking before a conditional offer.' },
  { topic: 'military_discharge', examplePatterns: ['type of discharge', 'dishonou?rabl(e|y) discharg'], note: 'Allowed: relevant skills from military service.' },
  { topic: 'financial_credit', examplePatterns: ['credit score', 'own (or rent )?your home', 'do you rent', 'bankrupt', 'personal debts?', 'how much debt do you'], note: 'Credit checks restricted in several states and NYC; home ownership can proxy for protected traits.' },
  { topic: 'appearance_height_weight', examplePatterns: ['how tall are you', 'how much do you weigh', 'your weight', 'send (me )?a photo'], note: 'Protected in some jurisdictions (e.g. Michigan, NYC). EEOC: no photos before an offer.' },
  { topic: 'affiliations', examplePatterns: ['what clubs', 'organi[sz]ations? (do|are) you (belong|a member)', 'union member', 'political (party|views)', 'who did you vote'], note: 'EEOC: memberships can reveal protected traits. Allowed: professional memberships relevant to the job.' },
];

// ---------------------------------------------------------------------------------------------
// CANDIDATE_POOL: hidden-trait distribution of applicants to an early-stage startup (open market)
// mean/sd on the 0..100 scale. Agencies/channels shift these (see AGENCIES).
// ---------------------------------------------------------------------------------------------
const BASE_TRAIT = { mean: 50, sd: 15 };

export const CANDIDATE_POOL = {
  _notes: {
    scale: 'Open applicant market: each trait mean 50, SD 15, unless overridden per role. [design]',
    correlations: [
      'grit ~ conscientiousness r ≈ .7 (true-score .84, Credé 2017)',
      'craft ~ gma r ≈ .35; craft ~ yearsExperience r ≈ .3 up to ~8 years, flat after [design]',
      'polish ~ true composite r ≈ .15 (Barrick 2009 IM-performance .15)',
      'agency ~ ambiguity_tolerance r ≈ .4; adaptability ~ ambiguity_tolerance r ≈ .4 [design]',
      'empathy ~ communication r ≈ .3 [design]',
      'integrity ~ conscientiousness r ≈ .3 [design]',
    ],
    talkerDoer: 'strongTalkerWeakDoerShare = share of applicants with polish ≥ +1 SD and role composite ≤ -0.5 SD. They give fluent, generic, metric-light answers that collapse under 3rd-level probes.',
    bigCompanyBackground: 'Applicants whose experience is mainly big-company: craft/domain +4, agency -4, ambiguity_tolerance -6, polish +4 [design].',
    salaryLinkage: 'askMultiple = 1 + 0.06·z(craft) + 0.04·z(domain) + 0.05·z(polish) + noise(sd 0.08), applied to the role median salary in salaryBand. Polish raises the ask about as much as craft does, so price is a weak quality signal. Strong but low-polish candidates are the market\'s bargains. [design]',
    aiFraud: 'Remote technical applicant pools include 3-7% identity/stand-in fraud and 30-50% who would use undisclosed AI in unsupervised screens (Gartner 2025; Fabric 2026) [S/V].',
  },
  engineer: {
    traits: { ...defaults(), craft: { mean: 48, sd: 16 }, ai_fluency: { mean: 52, sd: 16 }, polish: { mean: 45, sd: 15 }, empathy: { mean: 46, sd: 14 } },
    strongTalkerWeakDoerShare: 0.1, fraudShareRemote: 0.05,
    salaryBand: { median: 170000, range: [140000, 200000], source: S.hrLegal },
  },
  ai_engineer: {
    traits: { ...defaults(), craft: { mean: 47, sd: 17 }, ai_fluency: { mean: 60, sd: 14 }, gma: { mean: 54, sd: 14 }, polish: { mean: 48, sd: 15 } },
    strongTalkerWeakDoerShare: 0.18, fraudShareRemote: 0.06,
    salaryBand: { median: 195000, range: [160000, 240000], source: S.hrLegal + '; AI/ML premium fastest-rising (Carta) [design] level' },
  },
  designer: {
    traits: { ...defaults(), craft: { mean: 50, sd: 16 }, empathy: { mean: 54, sd: 14 }, polish: { mean: 52, sd: 15 } },
    strongTalkerWeakDoerShare: 0.12, fraudShareRemote: 0.03,
    salaryBand: { median: 125000, range: [105000, 145000], source: S.hrLegal },
  },
  account_executive: {
    traits: { ...defaults(), polish: { mean: 60, sd: 13 }, communication: { mean: 55, sd: 14 }, grit: { mean: 53, sd: 15 }, craft: { mean: 50, sd: 16 } },
    strongTalkerWeakDoerShare: 0.22, fraudShareRemote: 0.02,
    salaryBand: { median: 100000, ote: 200000, range: [85000, 120000], source: S.bridge2026 + '; base ~50-55% of OTE' },
  },
  sdr: {
    traits: { ...defaults(), polish: { mean: 55, sd: 14 }, craft: { mean: 44, sd: 14 }, domain: { mean: 42, sd: 13 }, grit: { mean: 52, sd: 15 } },
    strongTalkerWeakDoerShare: 0.18, fraudShareRemote: 0.02,
    salaryBand: { median: 54000, ote: 80000, range: [48000, 62000], source: S.hrLegal + ' (Bridge 2025 OTE $80k, 68:32)' },
  },
  support: {
    traits: { ...defaults(), empathy: { mean: 53, sd: 14 }, communication: { mean: 50, sd: 15 }, polish: { mean: 47, sd: 14 } },
    strongTalkerWeakDoerShare: 0.08, fraudShareRemote: 0.03,
    salaryBand: { median: 55000, range: [45000, 65000], source: S.hrLegal },
  },
  customer_success: {
    traits: { ...defaults(), empathy: { mean: 54, sd: 14 }, polish: { mean: 54, sd: 14 } },
    strongTalkerWeakDoerShare: 0.15, fraudShareRemote: 0.02,
    salaryBand: { median: 85000, range: [70000, 110000], source: '[design] between support and AE base' },
  },
  founding_ae: {
    traits: { ...defaults(), polish: { mean: 58, sd: 13 }, agency: { mean: 52, sd: 15 }, grit: { mean: 53, sd: 15 }, craft: { mean: 48, sd: 16 } },
    strongTalkerWeakDoerShare: 0.24, fraudShareRemote: 0.02,
    salaryBand: { median: 105000, ote: 190000, range: [90000, 120000], source: '[unverified] founding-AE postings $125-150K base, $250-300K OTE; seed-stage cash-light level is [design]' },
  },
  csm: {
    traits: { ...defaults(), empathy: { mean: 54, sd: 14 }, polish: { mean: 54, sd: 14 } },
    strongTalkerWeakDoerShare: 0.15, fraudShareRemote: 0.02,
    salaryBand: { median: 84000, ote: 105000, range: [70000, 105000], source: '[design]; variable 15-25% of total pay [secondary, unverified]' },
  },
  am: {
    traits: { ...defaults(), polish: { mean: 57, sd: 14 }, communication: { mean: 53, sd: 14 }, craft: { mean: 49, sd: 16 } },
    strongTalkerWeakDoerShare: 0.2, fraudShareRemote: 0.02,
    salaryBand: { median: 100000, ote: 135000, range: [85000, 115000], source: '[design] no usable AM benchmark' },
  },
  se: {
    traits: { ...defaults(), craft: { mean: 52, sd: 15 }, domain: { mean: 50, sd: 15 }, polish: { mean: 53, sd: 14 } },
    strongTalkerWeakDoerShare: 0.12, fraudShareRemote: 0.03,
    salaryBand: { median: 120000, ote: 170000, range: [105000, 140000], source: '[design] no usable SE benchmark' },
  },
  marketer: {
    traits: { ...defaults(), polish: { mean: 56, sd: 14 }, ai_fluency: { mean: 55, sd: 15 }, craft: { mean: 48, sd: 16 } },
    strongTalkerWeakDoerShare: 0.2, fraudShareRemote: 0.03,
    salaryBand: { median: 115000, range: [90000, 150000], source: '[design] seed-stage growth marketer' },
  },
  content_writer: {
    traits: { ...defaults(), craft: { mean: 50, sd: 16 }, ai_fluency: { mean: 55, sd: 15 }, domain: { mean: 45, sd: 15 } },
    strongTalkerWeakDoerShare: 0.1, fraudShareRemote: 0.04,
    salaryBand: { median: 75000, range: [55000, 100000], source: '[design]; freelancers usually priced per piece' },
  },
  ops_generalist: {
    traits: { ...defaults(), gma: { mean: 53, sd: 14 }, polish: { mean: 54, sd: 14 } },
    strongTalkerWeakDoerShare: 0.14, fraudShareRemote: 0.02,
    salaryBand: { median: 95000, range: [75000, 130000], source: '[design]' },
  },
  fractional_cfo: { traits: { ...defaults(), domain: { mean: 56, sd: 14 }, integrity: { mean: 54, sd: 14 }, polish: { mean: 56, sd: 14 } }, strongTalkerWeakDoerShare: 0.15, fraudShareRemote: 0.02, salaryBand: { median: 52000, range: [36000, 96000], source: 'EagleRock 2025 $4-8k/mo [secondary]; $150-450/hr [secondary]' } },
  fractional_cmo: { traits: { ...defaults(), domain: { mean: 55, sd: 14 }, craft: { mean: 50, sd: 15 }, polish: { mean: 58, sd: 14 } }, strongTalkerWeakDoerShare: 0.24, fraudShareRemote: 0.02, salaryBand: { median: 78000, range: [60000, 120000], source: '$200-350/hr, $5-10k/mo [secondary]' } },
  fractional_vp_sales: { traits: { ...defaults(), domain: { mean: 55, sd: 14 }, polish: { mean: 60, sd: 13 }, communication: { mean: 55, sd: 14 } }, strongTalkerWeakDoerShare: 0.26, fraudShareRemote: 0.02, salaryBand: { median: 70000, range: [48000, 110000], source: '[design] no rate data found for fractional VP Sales' } },
  fractional_head_cs: { traits: { ...defaults(), empathy: { mean: 55, sd: 14 }, domain: { mean: 53, sd: 14 }, polish: { mean: 55, sd: 14 } }, strongTalkerWeakDoerShare: 0.18, fraudShareRemote: 0.02, salaryBand: { median: 52000, range: [36000, 84000], source: '[design]' } },
  contractor: {
    traits: { ...defaults(), craft: { mean: 50, sd: 18 }, conscientiousness: { mean: 48, sd: 17 }, integrity: { mean: 48, sd: 16 } },
    strongTalkerWeakDoerShare: 0.15, fraudShareRemote: 0.06,
    salaryBand: { hourlyUS: [60, 150], hourlyOffshore: [25, 80], source: S.offshore + '; ' + S.marketplaces },
  },
};

function defaults() {
  const out = {};
  for (const id of Object.keys(TRAITS)) out[id] = { ...BASE_TRAIT };
  return out;
}

// ---------------------------------------------------------------------------------------------
// AGENCIES: recruiting agencies, marketplaces and sourcing channels
// qualityShift: mean shift (0..100 points) on role-composite traits vs the open market (SD 15).
// polishShift: shift on the `polish` trait (agency coaching / AI-polished applications).
// qualitySdMult: spread of quality vs the open market.
// candidatesPerWeek: qualified-looking candidates reaching the founder.
// ---------------------------------------------------------------------------------------------
export const AGENCIES = [
  { id: 'contingency_recruiter', label: 'Contingency recruiting agency', kind: 'contingency',
    roles: ['engineer', 'ai_engineer', 'account_executive', 'sdr', 'designer', 'marketer', 'customer_success'],
    costModel: { type: 'pct_first_year_base', pct: 0.20, pctRange: [0.15, 0.25], payableOn: 'offer acceptance' },
    guaranteeDays: 90, guaranteeRange: [30, 90], guaranteeType: 'replacement search (sometimes pro-rated refund)',
    daysToFirstCandidate: [5, 14], daysToHire: [30, 60], candidatesPerWeek: [2, 6],
    qualityShift: 2, qualitySdMult: 1.0, polishShift: 8, founderHoursPerHire: 12,
    pitfalls: ['6-12 month candidate ownership: you owe the fee if you hire someone they submitted, even via a later direct application', 'fee disputes when two sources submit the same person', 'incentive to close fast and push higher offers (fee is a % of salary)', 'one-role startups get low priority; niche roles deprioritised', 'candidates coached to interview well'],
    sources: [S.dover2026, S.recruitbpm, S.ownership] },
  { id: 'retained_search', label: 'Retained executive search', kind: 'retained',
    roles: ['account_executive', 'marketer', 'ops_generalist'], seniorityOnly: 'VP / C-level',
    costModel: { type: 'pct_first_year_cash_comp', pct: 0.33, pctRange: [0.25, 0.35], schedule: 'thirds: signing / ~30 days / ~60 days or shortlist', refundable: false },
    guaranteeDays: 365, guaranteeRange: [180, 365], guaranteeType: 'replacement search for the role [S/V, varies]',
    daysToFirstCandidate: [21, 40], daysToHire: [60, 120], candidatesPerWeek: [0.5, 2],
    qualityShift: 6, qualitySdMult: 0.8, polishShift: 6, founderHoursPerHire: 20,
    pitfalls: ['paid even if you do not hire', 'overkill before Series A', 'firm cannot recruit from its other clients (off-limits)'],
    sources: [S.retained] },
  { id: 'embedded_recruiter', label: 'Embedded / RPO recruiter', kind: 'embedded',
    roles: ['engineer', 'ai_engineer', 'designer', 'account_executive', 'sdr', 'support', 'customer_success', 'marketer', 'content_writer', 'ops_generalist'],
    costModel: { type: 'monthly', monthly: 11000, monthlyRange: [8000, 15000], minMonths: 3 },
    guaranteeDays: 0, daysToFirstCandidate: [7, 14], daysToHire: [30, 55], candidatesPerWeek: [3, 8],
    qualityShift: 2, qualitySdMult: 1.0, polishShift: 2, founderHoursPerHire: 8,
    pitfalls: ['only worth it at ~15-25+ hires/year', 'volume commitments in RPO contracts', 'you pay even in slow months'],
    sources: [S.rpo] },
  { id: 'fractional_recruiter', label: 'Fractional / hourly recruiter', kind: 'embedded',
    roles: ['engineer', 'ai_engineer', 'designer', 'account_executive', 'sdr', 'support', 'customer_success', 'marketer', 'content_writer', 'ops_generalist'],
    costModel: { type: 'hourly', hourly: 100, hourlyRange: [75, 125], perHireEstimate: [2000, 7000] },
    guaranteeDays: 0, daysToFirstCandidate: [7, 14], daysToHire: [30, 60], candidatesPerWeek: [2, 5],
    qualityShift: 1, qualitySdMult: 1.0, polishShift: 1, founderHoursPerHire: 12,
    pitfalls: ['quality varies by individual recruiter', 'you still run the interview loop'],
    sources: [S.recruitbpm, S.dover2026] },
  { id: 'recruiter_marketplace', label: 'Recruiter marketplace (e.g. Paraform)', kind: 'marketplace',
    roles: ['engineer', 'ai_engineer', 'account_executive', 'designer', 'marketer'],
    costModel: { type: 'pct_first_year_base', pct: 0.22, pctRange: [0.20, 0.25], plusListingFee: 'reported historically' },
    guaranteeDays: 90, daysToFirstCandidate: [3, 10], daysToHire: [25, 50], candidatesPerWeek: [4, 12],
    qualityShift: 1, qualitySdMult: 1.2, polishShift: 7, founderHoursPerHire: 16,
    pitfalls: ['many recruiters → many submittals to screen', 'ownership disputes between recruiters', 'pricing not public'],
    sources: [S.paraform] },
  { id: 'staffing_agency', label: 'Staffing agency (temp / contract)', kind: 'staffing',
    roles: ['support', 'ops_generalist', 'sdr', 'content_writer'],
    costModel: { type: 'markup', markupPct: 0.45, markupRange: [0.25, 0.75] },
    guaranteeDays: 0, guaranteeType: 'replace a temp quickly on request', daysToFirstCandidate: [2, 7], daysToHire: [5, 14], candidatesPerWeek: [2, 5],
    qualityShift: -2, qualitySdMult: 1.1, polishShift: 2, founderHoursPerHire: 5,
    pitfalls: ['markup paid for as long as they work', 'conversion fee if you hire them', 'little startup context'],
    sources: [S.staffing] },
  { id: 'contract_to_hire', label: 'Contract-to-hire agency', kind: 'contract_to_hire',
    roles: ['engineer', 'support', 'ops_generalist', 'designer', 'marketer'],
    costModel: { type: 'markup', markupPct: 0.5, markupRange: [0.25, 0.85], conversionFeePct: [0.15, 0.20], conversionFeeWaivedAfterHours: 640 },
    guaranteeDays: 0, daysToFirstCandidate: [5, 10], daysToHire: [10, 25], candidatesPerWeek: [1, 4],
    qualityShift: 0, qualitySdMult: 1.1, polishShift: 3, founderHoursPerHire: 8,
    pitfalls: ['conversion fee disputes; agree terms before placement', 'best candidates often won\'t accept contract-first'],
    sources: [S.staffing] },
  { id: 'offshore_dev_agency', label: 'Offshore / nearshore dev agency or staff augmentation', kind: 'offshore_agency',
    roles: ['engineer', 'ai_engineer', 'designer'],
    costModel: { type: 'hourly', hourly: 50, hourlyByRegion: { easternEurope: [35, 80], latinAmerica: [25, 65], india: [15, 50] } },
    guaranteeDays: 14, guaranteeType: 'swap the developer on request', daysToFirstCandidate: [3, 10], daysToHire: [7, 21], candidatesPerWeek: [2, 6],
    qualityShift: 0, qualitySdMult: 1.3, polishShift: 3, founderHoursPerHire: 10, ongoingCoordinationHoursPerWeek: [3, 8],
    pitfalls: ['bait-and-switch: senior on the sales call, junior on the work', 'time-zone and spec overhead', 'IP assignment must flow through the agency contract', 'hidden QA/PM costs'],
    sources: [S.offshore] },
  { id: 'vetted_marketplace', label: 'Vetted talent marketplace (Toptal, Arc, Turing, Gun.io, Braintrust, A.Team)', kind: 'marketplace',
    roles: ['engineer', 'ai_engineer', 'designer', 'marketer'],
    costModel: { type: 'hourly', hourly: 110, hourlyRange: [60, 200], platformFeePct: [0.10, 0.50], fullTimePlacementPct: 0.20, deposit: [300, 500] },
    guaranteeDays: 14, guaranteeType: 'trial period / replacement', daysToFirstCandidate: [2, 7], daysToHire: [5, 20], candidatesPerWeek: [2, 5],
    qualityShift: 6, qualitySdMult: 0.8, polishShift: 3, founderHoursPerHire: 6,
    pitfalls: ['vetting tests craft, not agency or startup fit', 'conversion buy-outs and non-competes (e.g. Andela reported)', 'platform margin can be large'],
    sources: [S.marketplaces] },
  { id: 'freelance_platform', label: 'Open freelance platform (Upwork, Contra, Fiverr-style)', kind: 'freelance_platform',
    roles: ['designer', 'content_writer', 'marketer', 'engineer'],
    costModel: { type: 'platform_fee', pct: 0.05, pctRange: [0.03, 0.10], perContractFee: [0.99, 29] },
    guaranteeDays: 0, guaranteeType: 'escrow / milestone payments', daysToFirstCandidate: [1, 3], daysToHire: [3, 10], candidatesPerWeek: [10, 40],
    qualityShift: -3, qualitySdMult: 1.35, polishShift: 6, founderHoursPerHire: 8,
    pitfalls: ['flood of AI-written proposals', 'portfolio fraud', 'quality variance is huge; paid trial milestone is essential'],
    sources: [S.upwork, S.contra] },
  { id: 'fractional_exec', label: 'Fractional executive (CMO / CFO / VP Sales)', kind: 'fractional',
    roles: ['marketer', 'account_executive', 'ops_generalist'],
    costModel: { type: 'monthly', monthly: 10000, monthlyRange: [5000, 15000], daysPerWeek: [1, 3], hourlyRange: [150, 500] },
    guaranteeDays: 0, daysToFirstCandidate: [3, 14], daysToHire: [10, 30], candidatesPerWeek: [1, 3],
    qualityShift: 4, qualitySdMult: 1.1, polishShift: 10, founderHoursPerHire: 8,
    pitfalls: ['strategy decks without execution capacity', 'split attention across clients', 'fractional VP Sales benchmarks are thin [design]'],
    sources: [S.fractional] },
  { id: 'linkedin_jobs', label: 'LinkedIn Jobs + Recruiter Lite', kind: 'job_board',
    roles: ['engineer', 'ai_engineer', 'designer', 'account_executive', 'sdr', 'support', 'customer_success', 'marketer', 'content_writer', 'ops_generalist'],
    costModel: { type: 'subscription', monthly: 170, plusPayPerClickPosts: true },
    guaranteeDays: 0, daysToFirstCandidate: [1, 3], daysToHire: [30, 60], candidatesPerWeek: [20, 150],
    qualityShift: -4, qualitySdMult: 1.2, polishShift: 5, founderHoursPerHire: 30, screeningMinutesPerApplicant: [1, 3],
    pitfalls: ['AI-mass-applied flood (applications/recruiter 146→746, 2022-2025)', 'fake profiles in remote roles', 'InMail reply ~5% measured'],
    sources: [S.linkedin, S.greenhouse, S.noon] },
  { id: 'wellfound', label: 'Wellfound (ex-AngelList Talent)', kind: 'job_board',
    roles: ['engineer', 'ai_engineer', 'designer', 'marketer', 'ops_generalist', 'account_executive', 'customer_success'],
    costModel: { type: 'subscription', monthly: 0, paidSeatRange: [250, 499], autopilot: { monthlyPerRole: 500, pct: 0.10 } },
    guaranteeDays: 0, daysToFirstCandidate: [1, 5], daysToHire: [25, 50], candidatesPerWeek: [10, 60],
    qualityShift: -1, qualitySdMult: 1.15, polishShift: 3, founderHoursPerHire: 22,
    pitfalls: ['volume of low-fit applicants', 'pricing tiers change; verify'],
    sources: [S.wellfound] },
  { id: 'yc_work_at_a_startup', label: 'YC Work at a Startup (YC companies only)', kind: 'job_board', requires: 'YC-backed',
    roles: ['engineer', 'ai_engineer', 'designer', 'marketer', 'ops_generalist', 'account_executive'],
    costModel: { type: 'free' }, guaranteeDays: 0, daysToFirstCandidate: [1, 5], daysToHire: [20, 45], candidatesPerWeek: [5, 25],
    qualityShift: 3, qualitySdMult: 1.0, polishShift: 1, founderHoursPerHire: 15,
    pitfalls: ['only for YC companies', 'candidates compare many YC offers'], sources: ['[Q] YC; [design] shifts'] },
  { id: 'hn_who_is_hiring', label: 'Hacker News "Who is hiring?" thread', kind: 'job_board',
    roles: ['engineer', 'ai_engineer'], costModel: { type: 'free' }, guaranteeDays: 0,
    daysToFirstCandidate: [1, 7], daysToHire: [25, 50], candidatesPerWeek: [3, 20],
    qualityShift: 3, qualitySdMult: 1.15, polishShift: -2, founderHoursPerHire: 18,
    pitfalls: ['monthly cadence', 'technical audience only; a good post needs specifics (stack, salary range, remote policy)'], sources: ['[Q]; [design] shifts'] },
  { id: 'we_work_remotely', label: 'We Work Remotely', kind: 'job_board',
    roles: ['engineer', 'designer', 'support', 'marketer', 'content_writer', 'customer_success'],
    costModel: { type: 'one_time', oneTime: 299, perDays: 30 }, guaranteeDays: 0,
    daysToFirstCandidate: [1, 3], daysToHire: [25, 50], candidatesPerWeek: [20, 100],
    qualityShift: -3, qualitySdMult: 1.2, polishShift: 4, founderHoursPerHire: 25,
    pitfalls: ['global volume, many low-fit applicants', 'fraud risk in remote roles'], sources: [S.wwr] },
  { id: 'employee_referral', label: 'Referrals (network, team, investors)', kind: 'referral',
    roles: ['engineer', 'ai_engineer', 'designer', 'account_executive', 'sdr', 'support', 'customer_success', 'marketer', 'content_writer', 'ops_generalist'],
    costModel: { type: 'bonus', oneTime: 3000, oneTimeRange: [1000, 5000] }, guaranteeDays: 0, bonusPaidAfterDays: 90,
    daysToFirstCandidate: [3, 21], daysToHire: [14, 40], candidatesPerWeek: [0.3, 2],
    qualityShift: 5, qualitySdMult: 0.85, polishShift: 0, founderHoursPerHire: 10, hireRateVsBoard: [4, 10],
    pitfalls: ['low volume', 'homogeneous network reduces diversity', 'harder to reject a friend\'s friend; still run the structured loop'],
    sources: [S.referrals] },
  { id: 'ai_sourcing_outbound', label: 'Founder outbound sourcing with AI tools (Juicebox/PeopleGPT, Gem, LinkedIn)', kind: 'sourcing_tool',
    roles: ['engineer', 'ai_engineer', 'designer', 'account_executive', 'marketer', 'ops_generalist'],
    costModel: { type: 'subscription', monthly: 300, monthlyRange: [100, 600] },
    guaranteeDays: 0, daysToFirstCandidate: [3, 10], daysToHire: [30, 60], candidatesPerWeek: [2, 8],
    replyRate: { perCandidateSequence: 0.166, coldInMail: 0.055, founderPersonalised: [0.15, 0.30] },
    qualityShift: 3, qualitySdMult: 1.0, polishShift: 0, founderHoursPerHire: 25,
    pitfalls: ['generic AI messages get ignored', '65% of replies come after a follow-up', 'engineers reply less than average'],
    sources: [S.noon, '[design] tool prices'] },
];

// ---------------------------------------------------------------------------------------------
// Helpers (pure, deterministic given inputs)
// ---------------------------------------------------------------------------------------------
export const z = (v) => (v - 50) / 15;

/** Weighted z-composite of a candidate's traits ({traitId: 0..100}) under weights ({traitId: w}). */
export function composite(traits, weights) {
  let s = 0, wsum = 0;
  for (const [id, w] of Object.entries(weights)) { s += w * z(traits[id] ?? 50); wsum += w; }
  return wsum ? s / wsum : 0;
}

/** Map a composite (in SD units) to an output value using range [at -2, at +2] and median (at 0). */
export function mapComposite(c, { range, median }) {
  const [lo, hi] = range;
  const t = Math.max(-2, Math.min(2, c));
  return t < 0 ? median + (median - lo) * (t / 2) : median + (hi - median) * (t / 2);
}

/** Output value for a role/output given a candidate's traits. */
export function outputValue(roleId, outputId, traits) {
  const o = ROLES[roleId]?.outputs?.[outputId];
  if (!o) throw new Error(`Unknown output ${roleId}.${outputId}`);
  return mapComposite(composite(traits, o.traits), o);
}

/** Observed assessment score (SD units) given the true composite, method validity and a N(0,1) draw. */
export function observedScore(trueComposite, validity, normalDraw) {
  return validity * trueComposite + Math.sqrt(1 - validity * validity) * normalDraw;
}

/** First illegal topic matched by a question, or null. */
export function findIllegalTopic(question) {
  const q = String(question || '').toLowerCase();
  for (const t of ILLEGAL_TOPICS) {
    for (const p of t.examplePatterns) if (new RegExp(p, 'i').test(q)) return t;
  }
  return null;
}

export const SOURCES = S;
