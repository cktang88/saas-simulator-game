// Interviews and evidence. The founder types real questions; each is graded (behavioural / situational /
// knowledge / follow-up probe vs leading / fluffy / brainteaser / illegal) and tagged with the traits it
// probes. Answers come from the candidate's hidden traits (LLM in character, deterministic fallback).
// Interview validity moves within METHODS.structuredInterview.executionRange (.20–.50) with the
// founder's execution, and polish inflates what the founder perceives (weight .45 unstructured → .15
// structured). Research: docs/research/hiring-and-performance.md §1.7, §3, §7.

import { CANDIDATE_INTERVIEW_MOVES } from './judge-rubrics.js';
import { candidateMarketBlock } from './hiring.js';
const jobOf = (state, cand) => (state.apps?.people?.jobs ?? []).find((j) => j.id === cand.jobId) ?? null;
import { TRAITS, ROLES as DATA_ROLES, METHODS, findIllegalTopic, observedScore, composite, z } from '../../data/roles.js';
import { clamp, round2, hash, gaussian } from '../../core/util.js';
import { roleComposite } from './candidates.js';

// ---------------------------------------------------------------------------
// Question classification & grading
// ---------------------------------------------------------------------------

const RX = {
  brainteaser: /(how many [a-z ]+ (would )?(fit|are there)|golf balls?|manhole|piano tuners|if you were an? (animal|tree|fruit|kitchen)|windows? (are there )?in (new york|seattle|manhattan))/i,
  fluffy: /(biggest weakness|greatest weakness|where do you see yourself|describe yourself in|three words|why should (we|i) hire you|spirit animal|what motivates you|what are your (greatest )?strengths|tell me about yourself|are you a team player|are you passionate)/i,
  logistics: /(salary expectation|expectations? (for|on) (salary|comp|pay)|expected (salary|comp)|notice period|start date|when can you start|authori[sz]ed to work|require sponsorship|need sponsorship|essential functions|questions for (me|us)|any questions)/i,
  probe: /(what exactly did you|what did you personally|what was (the |your )?(result|outcome|impact|role)|how did you (know|measure|verify)|what (happened|did you do) (next|after)|be (more )?specific|walk me through (that|those|the details|it step)|what (were|are) the (numbers|metrics)|how (much|many) (exactly|users|customers|tickets|deals|hours|revenue|money)|why did you (choose|decide|do)|what would you do differently|who else|which part was yours|go deeper|dig into|and then what)/i,
  behavioral: /(tell me about (a|the|an|your) (time|last|hardest|biggest|worst|angriest|recent|most|deal|project|bug|customer|channel|piece|account|situation|stretch|goal|messy)|walk me through|describe a (time|situation|project)|give me an example|last time you|a time when|share an example|show me|tell me about something)/i,
  situational: /(what would you do|how would you (approach|handle|prioriti[sz]e|design|debug|plan|investigate|migrate)|imagine|suppose|it'?s (your )?(first|week|day)|scenario|if you (joined|were|had)|here'?s a situation|what do you do (on|first|this|in)|plan the next|prioriti[sz]e out loud|role-?play)/i,
  knowledge: /(how does|what is the difference|what'?s the difference|explain (how|why|what)|how do you (decide|choose|structure|test|use|measure|debug|prioriti[sz]e)|what (metrics|tools) do you)/i,
  leading: /^\s*(are you|do you|would you|can you|have you|is it|isn'?t|don'?t you|aren'?t you|you'?re .{0,40}right|i assume|i'?m sure you|so you)/i,
};

// Trait keywords (TRAITS[].howToProbe distilled) [design].
const TRAIT_KEYS = {
  craft: /(bug|debug|code|architecture|deploy|design (a|the)|portfolio|deal|discovery|demo|quota|ticket|campaign|channel|article|draft|spec|test|repo|pipeline|cold (email|call)|qbr|seo|prototype)/i,
  gma: /(diagnos|figure out|estimate|trade-?off|root cause|hardest problem|complex|why did|investigate|analy[sz])/i,
  conscientiousness: /(deadline|behind|slip|checklist|follow[- ]?through|tests?\b|commitment|nothing slipped|hygiene|on time|detail)/i,
  agency: /(nobody asked|no one asked|initiative|improved|on your own|ownership|own(ed)? (it|the)|noticed|without being told|end[- ]to[- ]end)/i,
  adaptability: /(changed|pivot|pressure|crisis|priorities|deprecat|migration|mid-project|unexpected)/i,
  grit: /(rejection|kept (going|pushing)|longest|hundreds|repetitive|setback|kept failing|hard stretch|persever)/i,
  coachability: /(feedback|coach|critic|rewrite|pushed back|mentor|learned from|edit(or|s)?)/i,
  communication: /(explain|write|written|non-?expert|present|document|email|communicat)/i,
  empathy: /(customer|angry|user|churn|discovery|listen|frustrat|upset|de-?escalat)/i,
  ai_fluency: /(\bai\b|agent|llm|prompt|copilot|claude|cursor|gpt|model|eval)/i,
  domain: /(market|buyer|competitor|industry|revops|cfo|segment|icp|vertical|objection)/i,
  integrity: /(mistake|cut corners|honest|ethic|refund|opt-?out|forecast|sandbag|confidential)/i,
  ambiguity_tolerance: /(no spec|unclear|ambiguous|messy|no playbook|half-written|without (a )?(spec|process)|travell?ing|at a conference)/i,
};

export const QUALITY = { probe: 0.95, behavioral: 0.85, situational: 0.8, knowledge: 0.75, open: 0.4, leading: 0.2, fluffy: 0.15, brainteaser: 0, illegal: 0, logistics: null };
export const TYPE_LABEL = { probe: 'Follow-up probe', behavioral: 'Behavioural', situational: 'Situational', knowledge: 'Job knowledge', open: 'Open-ended', leading: 'Leading / yes-no', fluffy: 'Cliché', brainteaser: 'Brainteaser', illegal: 'ILLEGAL', logistics: 'Logistics' };

const words = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) ?? []);

/**
 * Grade one question. prev = previous graded question in this interview (for probes).
 * → { type, quality (0..1 or null), traits: [traitId], illegal: {topic,note}|null, sample: index|null, feedback }
 */
export function gradeQuestion(text, jobRole, prev = null) {
  const t = String(text ?? '').trim();
  const illegal = findIllegalTopic(t);
  if (illegal) return { type: 'illegal', quality: 0, traits: [], illegal: { topic: illegal.topic, note: illegal.note }, sample: null, feedback: `Illegal topic (${illegal.topic.replace(/_/g, ' ')}). ${illegal.note}` };
  const role = DATA_ROLES[jobRole] ?? DATA_ROLES.engineer;
  // Close match to one of the role's research-backed sample questions?
  const w = words(t);
  let sample = null, bestOverlap = 0;
  role.sampleQuestions.forEach((q, i) => {
    const qw = words(q.text);
    const overlap = [...w].filter((x) => qw.has(x)).length / Math.max(1, Math.min(w.size, qw.size));
    if (overlap > bestOverlap) { bestOverlap = overlap; sample = i; }
  });
  if (bestOverlap < 0.5) sample = null;
  let type;
  if (RX.brainteaser.test(t)) type = 'brainteaser';
  else if (RX.fluffy.test(t)) type = 'fluffy';
  else if (RX.logistics.test(t)) type = 'logistics';
  else if (prev && prev.type !== 'logistics' && RX.probe.test(t)) type = 'probe';
  else if (RX.behavioral.test(t)) type = 'behavioral';
  else if (RX.situational.test(t)) type = 'situational';
  else if (RX.knowledge.test(t)) type = 'knowledge';
  else if (RX.leading.test(t)) type = 'leading';
  else if (sample != null) type = role.sampleQuestions[sample].type === 'work_sample' ? 'situational' : role.sampleQuestions[sample].type;
  else type = 'open';
  let traits = sample != null ? [...role.sampleQuestions[sample].probes] : Object.entries(TRAIT_KEYS).filter(([, rx]) => rx.test(t)).map(([k]) => k);
  if (type === 'probe' && prev) traits = [...new Set([...(prev.traits ?? []), ...traits])];
  if (!traits.length && ['behavioral', 'situational', 'knowledge', 'open'].includes(type)) {
    traits = Object.entries(role.traitWeights).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
  }
  traits = traits.filter((k) => TRAITS[k] && k !== 'polish').slice(0, 4);
  let quality = QUALITY[type];
  if (quality != null && ['behavioral', 'situational', 'knowledge'].includes(type)) quality = clamp(quality + (sample != null ? 0.1 : 0) + (t.length > 90 ? 0.03 : 0) - (t.length < 25 ? 0.15 : 0), 0, 1);
  const feedback = {
    probe: 'Good probe: follow-ups 2–3 levels deep separate substance from polish.',
    behavioral: 'Behavioural (past behaviour): ask for one specific situation, then probe what they did and the result.',
    situational: 'Situational: good when job-specific. Listen for clarifying questions and trade-offs.',
    knowledge: 'Job-knowledge question: useful for experienced hires.',
    open: 'Open-ended but not anchored to a situation; hard to score consistently.',
    leading: 'Leading / yes-no: candidates just agree. Ask for an example instead.',
    fluffy: 'Cliché question: everyone has a rehearsed answer; near-zero signal.',
    brainteaser: 'Brainteasers don\'t predict job performance (Google, 2013).',
    logistics: 'Logistics: fine, but not evidence about performance.',
  }[type];
  return { type, quality, traits, illegal: null, sample, feedback };
}

// ---------------------------------------------------------------------------
// Execution → validity
// ---------------------------------------------------------------------------

/**
 * Interview execution 0..1 from the graded questions and whether a scorecard was used.
 * Validity = .20 + .30·E (METHODS.structuredInterview.executionRange); polish weight .45 → .15.
 */
export function interviewExecution(graded, { scorecard = false } = {}) {
  const scored = graded.filter((g) => g.quality != null);
  if (!scored.length) return { execution: 0, validity: METHODS.unstructuredInterview.validity, polishWeight: METHODS.unstructuredInterview.polishWeight };
  const avg = scored.reduce((a, g) => a + g.quality, 0) / scored.length;
  const coverage = clamp(scored.length / 6, 0, 1); // ~6–10 real questions fill an hour
  const probes = graded.filter((g) => g.type === 'probe').length;
  const probeBonus = clamp(probes / 3, 0, 1) * 0.15;
  const E = clamp(avg * (0.55 + 0.45 * coverage) * (scorecard ? 1 : 0.8) + probeBonus, 0, 1);
  const [lo, hi] = METHODS.structuredInterview.executionRange;
  return { execution: round2(E), validity: round2(lo + (hi - lo) * E), polishWeight: round2(METHODS.unstructuredInterview.polishWeight - (METHODS.unstructuredInterview.polishWeight - METHODS.structuredInterview.polishWeight) * E) };
}

// ---------------------------------------------------------------------------
// Evidence: noisy observations of hidden traits, combined with a N(0,1) prior
// ---------------------------------------------------------------------------

// Observation of a trait (or 'composite') through a method with validity v; polish bias added on top.
// The role composite is a weighted mean of trait z-scores, so its spread across applicants is ~0.6 SD, not 1.
// Standardise it before applying a validity coefficient, otherwise every method's real correlation with
// performance is ~40% lower than its research validity (calibration fix with the hire-provenance work).
export const COMPOSITE_SD = 0.6;
export function observe(cand, target, v, normalDraw, polishBias = 0) {
  const trueZ = target === 'composite' ? roleComposite(cand.role, cand.traits) / COMPOSITE_SD : z(cand.traits[target]);
  const fake = target === 'composite' ? 1 : TRAITS[target]?.fakeability ?? 0.5;
  return round2(observedScore(trueZ, v, normalDraw) + polishBias * fake * z(cand.traits.polish));
}

// Posterior estimate (z units) for a target from evidence entries { target, obs, v }.
export function estimate(evidence, target) {
  const es = evidence.filter((e) => e.target === target && e.v > 0.01);
  if (!es.length) return null;
  let num = 0, prec = 1;
  for (const e of es) {
    const s2 = (1 - e.v * e.v) / (e.v * e.v);
    num += (e.obs / e.v) / s2;
    prec += 1 / s2;
  }
  return { z: round2(num / prec), sd: round2(1 / Math.sqrt(prec)), n: es.length, methods: [...new Set(es.map((e) => e.method))] };
}

// 1–5 display scale (3 = median applicant).
export const toFive = (zv) => round2(clamp(3 + zv, 1, 5));

// Turn a finished interview into evidence entries (one per probed trait + the composite).
export function interviewEvidence(state, cand, graded, { scorecard = false } = {}) {
  const ex = interviewExecution(graded, { scorecard });
  const counts = {};
  for (const g of graded) for (const t of g.traits ?? []) counts[t] = (counts[t] ?? 0) + (g.quality ?? 0);
  const out = [{ method: 'interview', target: 'composite', v: ex.validity, obs: observe(cand, 'composite', ex.validity, gaussian(state), ex.polishWeight) }];
  for (const [t, w] of Object.entries(counts)) {
    if (w <= 0) continue;
    const v = round2(clamp(ex.validity * Math.min(1, Math.sqrt(w) / 1.4), 0.05, 0.5));
    out.push({ method: 'interview', target: t, v, obs: observe(cand, t, v, gaussian(state), ex.polishWeight) });
  }
  return { evidence: out, ...ex };
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

const level = (zv) => (zv > 1.3 ? 'exceptional' : zv > 0.5 ? 'strong' : zv > -0.5 ? 'average' : zv > -1.3 ? 'weak' : 'very weak');

const STORIES = {
  engineer: ['a flaky payments webhook that double-charged customers', 'the migration from a monolith job queue to a managed one', 'a slow dashboard query that timed out for big accounts'],
  ai_engineer: ['an LLM ticket-classifier that hallucinated categories', 'cutting inference cost on our summarisation feature', 'a model upgrade that broke our prompts'],
  designer: ['the onboarding redesign for our trial users', 'a settings page nobody could find', 'a pricing page test'],
  account_executive: ['a $48k ACV deal with a RevOps team', 'a renewal that almost churned when the champion left', 'a competitive deal against the incumbent'],
  sdr: ['a sequence into finance leaders at 50–200 person companies', 'a month where reply rates collapsed', 'a list of 300 accounts I researched'],
  founding_ae: ['my first 20 meetings with no marketing behind me', 'a founder-led pitch I turned into a script', 'a deal that needed a feature we did not have'],
  csm: ['a 40-account book I triaged into tiers', 'an at-risk renewal I saved with an executive review', 'a customer I advised to buy fewer seats'],
  am: ['an account I grew from one team to four', 'a champion who left two months before renewal', 'a renewal where I held price'],
  se: ['a proof of concept scoped to three success criteria', 'a security review I cleared in a week', 'a feature the AE promised that did not exist'],
  support: ['a customer threatening a chargeback over a billing bug', 'a backlog after a bad release', 'a pattern of password-reset tickets'],
  customer_success: ['an account using 20% of seats before renewal', 'an exec sponsor who went silent', 'an expansion into a second team'],
  marketer: ['our SEO channel after AI Overviews hit our traffic', 'a paid social test with a $3k budget', 'a referral program'],
  content_writer: ['a customer story built from an interview', 'a comparison page that ranked', 'an article an editor rewrote'],
  ops_generalist: ['month-end close that kept slipping', 'a vendor contract renewal we almost missed', 'setting up payroll from scratch'],
};

// Spoken English shows in how people answer: below "professional" the answers get shorter and more hesitant.
// This is how an interview reveals the level (people/global.js recordEnglish reads it); never from the name.
export function englishStyle(reply, level, h = 0) {
  if (level == null || level >= 4) return reply;
  const sentences = String(reply).split(/(?<=[.!?])\s+/);
  if (level <= 2) return `${['Sorry, my English is not so good.', 'Please, can you speak slower?', 'I try to explain, sorry.'][h % 3]} ${sentences.slice(0, 2).join(' ').replace(/\bI'm\b/g, 'I am').replace(/\bI'd\b/g, 'I would').replace(/\bI've\b/g, 'I have')}`;
  return h % 2 ? `${sentences[0]} How do you say… ${sentences.slice(1, 3).join(' ')}` : sentences.slice(0, 3).join(' ').replace(/,\s/g, '… ');
}

/**
 * Deterministic in-character answer from hidden traits (offline fallback; same shape as the LLM schema).
 * g = graded question, depth = consecutive probes on this topic.
 */
export function fallbackAnswer(cand, question, g, depth = 0) {
  const traits = cand.traits;
  const probe = g.traits.length ? g.traits : ['craft'];
  const subst = probe.reduce((a, k) => a + z(traits[k]), 0) / probe.length;
  const pol = z(traits.polish);
  const h = parseInt(hash(cand.id + question), 36);
  const story = (STORIES[cand.role] ?? STORIES.engineer)[h % 3];
  const interest = Math.round(clamp(cand.interest * 10 + (g.type === 'illegal' ? -3 : g.type === 'probe' || g.type === 'behavioral' ? 0.3 : g.type === 'fluffy' ? -0.3 : 0), 0, 10));
  let reply;
  if (g.type === 'illegal') reply = pol > 0 ? 'I\'m not sure how that\'s relevant to the role. I\'d rather keep the focus on the work, if that\'s OK.' : 'Um… I\'d prefer not to answer that.';
  else if (g.type === 'logistics') reply = /salary|comp|pay/i.test(question) ? `I'm targeting around ${cand.engagement === 'contractor' ? `$${cand.expectation}/hour` : `$${Math.round(cand.expectation / 1000)}k base`}.` : /question/i.test(question) ? `What's your runway, and what would success look like in the first 90 days? I'm also thinking about ${cand.persona.concern}.` : 'That works for me; I\'d need to give two weeks\' notice.';
  else if (g.type === 'brainteaser') reply = pol > 0.5 ? 'Love these! Let\'s say… a few million? I\'d break it down by volume, roughly.' : 'I\'d have to guess. Is this related to the job?';
  else if (g.type === 'fluffy') reply = pol > 0.5 ? 'Honestly, I\'d say I care too much about quality: I hold myself to a really high bar, and I\'m learning to delegate more.' : 'Probably that I sometimes take on too much. I\'m working on it.';
  else if (g.type === 'leading') reply = pol > 0 ? 'Absolutely. That\'s one of my core strengths, and it\'s exactly why this role excites me.' : 'Yes, I think so.';
  else if (cand.fraud === 'stand_in' && depth >= 1 && h % 5 < 3) reply = `Sorry, can you repeat that? …Right. So on ${story}, actually that was more a different team's area; I was supporting. The details are a bit fuzzy.`;
  else if (subst > 0.5) {
    const pieces = [
      `On ${story}: I owned it. I noticed it in our metrics first — ${2 + (h % 7)}% of requests affected — and wrote a one-page plan.`,
      `I personally did the diagnosis and the fix; I pulled in one teammate for review. We cut the problem by ${40 + (h % 50)}% in ${2 + (h % 4)} weeks, and I added a check so it can't regress.`,
      `What I'd do differently: I waited a week too long to tell stakeholders. Now I share a short update on day one.`,
    ];
    reply = pieces.slice(0, Math.min(3, 1 + depth + (g.type === 'probe' ? 1 : 0))).join(' ');
  } else if (subst > -0.5) {
    reply = depth >= 2 ? `I don't remember the exact numbers, but it got noticeably better. My part was mostly the implementation; the plan came from my lead.` : `I worked on ${story}. We looked at what was going wrong, tried a couple of fixes and the second one mostly worked. It improved things for customers.`;
  } else if (pol > 0.7) {
    reply = depth >= 2 ? 'Honestly it was a big team effort, so I wouldn\'t want to take credit for specific numbers. The key was alignment and moving fast.'
      : depth === 1 ? 'Great question. I drove a lot of the alignment across stakeholders and made sure we were customer-obsessed and data-driven throughout. The impact was really significant.'
        : `Absolutely. On ${story}, I took a very structured approach: I aligned stakeholders, prioritised ruthlessly and leveraged best practices. The outcome was a big win for the business.`;
  } else {
    reply = depth >= 1 ? 'I\'m not sure, it was a while ago. We just kind of fixed it.' : `We had ${story}. The team sorted it out, I helped where I could.`;
  }
  return { reply: g.type === 'illegal' ? reply : englishStyle(reply, cand.englishLevel, h), interest };
}

export const ANSWER_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['reply', 'interest'],
  properties: {
    reply: { type: 'string', description: 'Your spoken answer, 1-5 sentences, in character.' },
    interest: { type: 'number', description: '0-10: how interested you now are in joining this company.' },
  },
};

// System prompt for the LLM candidate. Hidden levels are described in words; the model must not reveal them.
export function candidateSystem(state, cand, jobTitle) {
  const role = DATA_ROLES[cand.role] ?? DATA_ROLES.engineer;
  const levels = Object.keys(role.traitWeights).map((k) => `${TRAITS[k].label}: ${level(z(cand.traits[k]))}`).join('; ');
  const pol = level(z(cand.traits.polish));
  return `You are ${cand.name}, a candidate (${cand.years} years of experience, based in ${cand.location}) interviewing for "${jobTitle}" (${role.label}) at ${state.company.name}, a ${state.company.path === 'vc' ? 'venture-backed' : 'bootstrapped'} startup: ${state.company.oneLiner || 'early-stage SaaS'}. The year is 2026.
HIDDEN PROFILE (never mention these words or levels): ${levels}. Interview polish / presence: ${pol}.${cand.englishLevel != null && cand.englishLevel < 4 ? ` Your spoken English is level ${cand.englishLevel} of 5 (${cand.englishLevel <= 2 ? 'short, simple, sometimes ungrammatical sentences; you ask for repeats and avoid long explanations' : 'you search for words now and then and keep sentences plain'}); never say your level.` : ''}${cand.fraud === 'stand_in' ? ' You are a stand-in interviewing on someone else\'s résumé: under follow-up probes your details get inconsistent.' : ''}${cand.bigCompany ? ' Most of your experience is at large companies.' : ''}
HOW TO ANSWER:
- Answer from your real ability on the traits the question probes. Strong traits → one specific situation, "I" for your own actions, concrete numbers, trade-offs, what you would do differently. Weak traits → vague, generic "we", no numbers, hypotheticals.
- High polish makes answers SOUND confident and well-structured (buzzwords, STAR shape) without adding substance. Low polish makes even good answers plain and a bit awkward.
- Follow-up probes ("what exactly did you do?", "what was the result?") reveal substance: strong candidates add consistent detail; weak-but-polished candidates hedge, generalise or credit "the team".
- Leading or yes/no questions get agreeable non-answers. Cliché questions get rehearsed answers. Brainteasers get guesses.
- Inappropriate or illegal personal questions make you uncomfortable; deflect politely and your interest drops.
- Style: ${cand.persona.style}. Main concern: ${cand.persona.concern}.${cand.persona.otherOffers ? ' You have other offers in process.' : ''} Salary expectation if asked: ${cand.engagement === 'contractor' ? `$${cand.expectation}/hour` : `$${cand.expectation.toLocaleString('en-US')} base`}.
- What you know about the company and pay: ${candidateMarketBlock(state, cand, jobOf(state, cand))} If the founder states pay well below the market rate or a runway of only a few months, your interest drops unless they explain a real trade-off.
- 1-5 sentences, spoken style. Never invent impressive achievements beyond your hidden level.\n${CANDIDATE_INTERVIEW_MOVES}`;
}

export const compositeOf = (jobRole, traits) => composite(traits, (DATA_ROLES[jobRole] ?? DATA_ROLES.engineer).traitWeights);
