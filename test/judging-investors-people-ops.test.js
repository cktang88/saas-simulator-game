// Judges in the investors / people / ops cluster score researched criteria (docs/research/judging/investors-people-ops.md):
// rubric injected into the prompt, strict schemas, full-shape fallbacks, and stellar vs mediocre inputs separate offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { weighted } from '../public/core/rubric.js';
import * as FR from '../public/apps/fundraising/judge-rubrics.js';
import * as FB from '../public/apps/fundraising/judge-fallbacks.js';
import { heuristicOutreach, heuristicMeeting } from '../public/apps/fundraising/investors.js';
import { heuristicUpdate, updateQuality, heuristicBoard, UPDATE_SCHEMA, BOARD_SCHEMA } from '../public/apps/fundraising/ir.js';
import * as CF from '../public/apps/cofounder/rubrics.js';
import { PROFILE_SCHEMA, CALL_SCHEMA, heuristicProfile } from '../public/apps/cofounder/model.js';
import * as PP from '../public/apps/people/judge-rubrics.js';
import { heuristicPostJudge, POST_SCHEMA } from '../public/apps/people/hiring.js';
import { judgeJobPost } from '../public/apps/people/llm.js';
import * as SP from '../public/apps/money/spend-rubric.js';
import { policyHeuristic } from '../public/apps/money/spend.js';

const ALL_CRITERIA = { ...{ OUTREACH_COLD: FR.OUTREACH_COLD, OUTREACH_WARM: FR.OUTREACH_WARM, MEETING: FR.MEETING_CRITERIA, UPDATE: FR.UPDATE_CRITERIA, BOARD: FR.BOARD_CRITERIA, ACCEL: FR.ACCEL_CRITERIA, SBIR: FR.SBIR_CRITERIA, PROFILE: CF.PROFILE_CRITERIA, CALL: CF.CALL_CRITERIA, JOB: PP.JOB_POST_CRITERIA, POLICY: SP.POLICY_CRITERIA } };

test('every criterion has 1/3/5 observable anchors and a positive weight', () => {
  for (const [name, list] of Object.entries(ALL_CRITERIA)) {
    assert.ok(list.length >= 4 && list.length <= 7, `${name} has 4-7 criteria`);
    for (const c of list) {
      assert.ok(c.key && c.label, name);
      for (const k of [1, 3, 5]) assert.ok(String(c.anchors[k] ?? '').length > 8, `${name}.${c.key} anchor ${k}`);
      assert.ok((c.weight ?? 1) > 0);
    }
  }
});

function strict(schema, path = 'schema') {
  if (schema?.type === 'object') {
    assert.equal(schema.additionalProperties, false, `${path} additionalProperties`);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `${path} every property required`);
    for (const [k, v] of Object.entries(schema.properties)) strict(v, `${path}.${k}`);
  } else if (schema?.type === 'array') strict(schema.items, `${path}[]`);
}

test('schemas are strict and carry one integer per criterion', () => {
  const pairs = [[FR.outreachSchema(false), FR.OUTREACH_COLD], [FR.outreachSchema(true), FR.OUTREACH_WARM], [FR.MEETING_SCHEMA_R, FR.MEETING_CRITERIA], [UPDATE_SCHEMA, FR.UPDATE_CRITERIA], [BOARD_SCHEMA, FR.BOARD_CRITERIA], [FR.ACCEL_SCHEMA_R, FR.ACCEL_CRITERIA], [FR.SBIR_SCHEMA_R, FR.SBIR_CRITERIA], [PROFILE_SCHEMA, CF.PROFILE_CRITERIA], [CALL_SCHEMA, CF.CALL_CRITERIA], [POST_SCHEMA, PP.JOB_POST_CRITERIA], [SP.POLICY_SCHEMA_R, SP.POLICY_CRITERIA]];
  for (const [schema, crit] of pairs) {
    strict(schema);
    for (const c of crit) assert.equal(schema.properties[c.key]?.type, 'integer', c.key);
  }
  // fields the consumers read are still there
  for (const k of ['issues', 'reaction']) assert.ok(FR.outreachSchema(false).properties[k]);
  for (const k of ['strengths', 'concerns', 'summary']) assert.ok(FR.MEETING_SCHEMA_R.properties[k]);
  for (const k of ['candor', 'clarity', 'asks_specificity', 'accuracy', 'feedback', 'asks']) assert.ok(UPDATE_SCHEMA.properties[k], k);
  for (const k of ['feedback', 'questions']) assert.ok(BOARD_SCHEMA.properties[k]);
  for (const k of ['interest', 'concerns', 'summary']) assert.ok(CALL_SCHEMA.properties[k]);
  for (const k of ['firstImpression', 'payTransparency', 'issues', 'rewriteHint']) assert.ok(POST_SCHEMA.properties[k]);
});

test('rubric text renders every criterion for each judge', () => {
  const texts = { outreach: FR.outreachRubric(false), warm: FR.outreachRubric(true), meeting: FR.meetingRubric(), update: FR.updateRubric(), board: FR.boardRubric(), accel: FR.accelRubric(), sbir: FR.sbirRubric(), profile: CF.profileRubric(), call: CF.callRubric(), job: PP.jobPostRubric(), policy: SP.policyRubric() };
  const lists = { outreach: FR.OUTREACH_COLD, warm: FR.OUTREACH_WARM, meeting: FR.MEETING_CRITERIA, update: FR.UPDATE_CRITERIA, board: FR.BOARD_CRITERIA, accel: FR.ACCEL_CRITERIA, sbir: FR.SBIR_CRITERIA, profile: CF.PROFILE_CRITERIA, call: CF.CALL_CRITERIA, job: PP.JOB_POST_CRITERIA, policy: SP.POLICY_CRITERIA };
  for (const [k, t] of Object.entries(texts)) {
    assert.match(t, /SCORING RUBRIC/);
    for (const c of lists[k]) assert.ok(t.includes(`- ${c.key} (`), `${k}:${c.key}`);
  }
});

test('every judge call site injects its rubric into the prompt (source guard)', () => {
  const sites = [
    ['public/apps/fundraising/view-crm.js', 'investor_outreach_judge', 'outreachRubric('],
    ['public/apps/fundraising/view-crm.js', 'investor_meeting_judge', 'meetingRubric('],
    ['public/apps/fundraising/view-crm.js', 'investor_pitch_meeting', 'INVESTOR_MOVES'],
    ['public/apps/fundraising/view-ir.js', 'investor_update_review', 'updateRubric('],
    ['public/apps/fundraising/view-ir.js', 'board_memo_review', 'boardRubric('],
    ['public/apps/fundraising/view-rounds.js', 'accelerator_application', 'accelRubric('],
    ['public/apps/fundraising/view-rounds.js', 'sbir_review', 'sbirRubric('],
    ['public/apps/cofounder.js', 'cofounder_profile_review', 'profileRubric('],
    ['public/apps/cofounder.js', 'cofounder_call_judge', 'callRubric('],
    ['public/apps/cofounder.js', 'cofounder_chat', 'CHAT_MOVES'],
    ['public/apps/people/llm.js', 'job_post_review', 'jobPostRubric('],
    ['public/apps/people/llm.js', 'candidate_email', 'CANDIDATE_MAIL_MOVES'],
    ['public/apps/money/view-spend.js', 'spend_policy_read', 'policyRubric('],
  ];
  for (const [file, task, needle] of sites) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const i = src.indexOf(`task: '${task}'`);
    assert.ok(i >= 0, `${task} found`);
    assert.ok(src.slice(i, i + 1800).includes(needle), `${task} injects ${needle}`);
  }
  const iv = readFileSync(new URL('../public/apps/people/interview.js', import.meta.url), 'utf8');
  assert.ok(iv.includes('${CANDIDATE_INTERVIEW_MOVES}'));
});

test('job_post_review: prompt carries the rubric and criterion scores drive clarity/specificity', async () => {
  const seen = [];
  const job = { role: 'engineer', region: 'us', engagement: 'employee', text: 'x'.repeat(200), payLo: 0, payHi: 0 };
  const good = { ownership: 5, requirements: 5, process: 5, outcomes: 5, pay: 5, company_context: 5, firstImpression: '', payTransparency: true, issues: [], rewriteHint: '' };
  const bad = { ...good, ownership: 1, requirements: 1, process: 1, outcomes: 1, pay: 1, company_context: 1, payTransparency: false };
  const run = async (data) => {
    const ctx = { state: { company: { name: 'Co', oneLiner: 'x' }, cache: {} }, llm: { panel: async (o) => { seen.push(o); return [{ data, mock: false, model: 'm' }]; } } };
    return judgeJobPost(ctx, job);
  };
  const hi = await run(good), lo = await run(bad);
  assert.match(seen[0].system, /SCORING RUBRIC/);
  assert.match(seen[0].system, /outcomes/);
  assert.equal(hi.clarity, 10); assert.equal(lo.clarity, 2);
  assert.ok(hi.specificity > lo.specificity + 5);
});

// ---- tiers separate offline ----
const inv = { name: 'Dana', firm: 'Northwind Capital', thesis: 'vertical SaaS workflow automation for clinics' };
const STELLAR_COLD = 'Clinic-scheduling SaaS at $18K MRR, up 14% MoM, 140 paying clinics, 2.1% monthly churn. I saw your Northwind post on vertical workflow automation. Raising a $750K post-money SAFE closing in November. Could we do a 20-minute call next week?';
const MEDIOCRE_COLD = 'Hi Dana, I hope you are doing well! I am passionate about revolutionizing the way businesses work with our world-class AI platform that disrupts the market. We are a game-changing startup with a huge vision and would love to explore synergies and pick your brain about opportunities whenever you have time. Looking forward to connecting and hearing your thoughts on how we can work together to build something great in the future.';

test('investor_outreach_judge: stellar cold email beats a mediocre one by a wide margin; warm blurb forwardability counts', () => {
  const s = heuristicOutreach(STELLAR_COLD, inv, { warm: false }), m = heuristicOutreach(MEDIOCRE_COLD, inv, { warm: false });
  assert.ok(s.quality >= 3.8, `stellar ${s.quality}`);
  assert.ok(m.quality <= 2.2, `mediocre ${m.quality}`);
  assert.ok(m.issues.length > s.issues.length);
  for (const k of ['hook', 'fit', 'ask', 'credibility', 'concision']) assert.ok(Number.isInteger(s[k]), k);
  const blurb = 'Pat is building clinic-scheduling SaaS: $18K MRR, 14% MoM growth, 140 paying clinics. They are raising a $750K SAFE and your vertical SaaS thesis fits. Open to a 20-minute call?';
  const rambling = 'See below for the thread. ' + MEDIOCRE_COLD + ' ' + MEDIOCRE_COLD;
  const w1 = heuristicOutreach(blurb, inv, { warm: true }), w2 = heuristicOutreach(rambling, inv, { warm: true });
  assert.ok(Number.isInteger(w1.forwardable) && w1.forwardable > w2.forwardable);
  assert.ok(w1.quality > w2.quality + 1.5);
});

test('keyword stuffing does not rescue an outreach email', () => {
  const stuffed = 'mrr $ customers 100% growth raising round safe call intro 20-minute northwind vertical saas workflow automation clinics mrr customers churn';
  assert.ok(heuristicOutreach(stuffed, inv, { warm: false }).quality < heuristicOutreach(STELLAR_COLD, inv, { warm: false }).quality - 0.8);
});

const T = (...xs) => xs.map((text, i) => ({ from: i % 2 ? 'them' : 'me', text }));
const mine = (arr) => arr.map((text) => ({ from: 'me', text }));
test('investor_meeting_judge: specific, candid answers beat vague ones', () => {
  const strong = heuristicMeeting(mine([
    'We do clinic scheduling. MRR is $18K, growing 14% a month, 140 paying clinics, churn 2.1% monthly.',
    'Honestly our weakest part is churn in small clinics at 4% and I am solo, so my first hire is support.',
    'The insight is that front desks keep a paper backup. Our data on no-shows is a feedback loop, and why now: payers changed rules in the last 12 months.',
    'We are raising $750K on a SAFE; runway 20 months and the milestone is $50K MRR to reach the seed bar. What would you need to see for a partner meeting? I will send the cohort data tomorrow.',
  ]));
  const weak = heuristicMeeting(mine(['We are doing great and the market is huge.', 'AI is going to disrupt everything, we are revolutionary.', 'We have a lot of traction.', 'Whatever you want to invest is fine.']));
  assert.ok(strong.performance >= 3.8, `strong ${strong.performance}`);
  assert.ok(weak.performance <= 2.2, `weak ${weak.performance}`);
  for (const c of FR.MEETING_CRITERIA) assert.ok(Number.isInteger(strong[c.key]), c.key);
  assert.ok(Array.isArray(strong.strengths) && Array.isArray(weak.concerns) && weak.concerns.length > 0 && typeof strong.summary === 'string');
});

test('investor_update_review: candor, accurate KPIs, specific asks beat a vague update', () => {
  const m = { mrr: 18000, momGrowth: 0.02 };
  const good = heuristicUpdate({ summary: 'TL;DR: MRR $18.0K, up 2% on September; churn is the problem.', kpis: 'MRR: $18,000 (+2%)\nCustomers: 140 (+3)\nChurn: 4% (was 3%)\nRunway: 20 months', highlights: '- Shipped dunning rework: recovered $1,200 MRR (vs $0 last month)\n- Intro from Sam closed Acme pilot: +$900 vs plan', lowlights: 'Churn rose to 4% from 3% because two clinics closed; we are adding annual plans and a save flow by Nov 15.', asks: '- Intro to Maria Lopez at Acme Dental Group (VP Ops)\n- Looking for a support contractor, ideally with Dentrix experience' }, m);
  const bad = heuristicUpdate({ summary: '', kpis: 'MRR $50k', highlights: 'great month, had many meetings', lowlights: '', asks: 'any help appreciated' }, m);
  assert.ok(updateQuality(good) >= 3.6, `good ${updateQuality(good)}`);
  assert.ok(updateQuality(bad) <= 2.3, `bad ${updateQuality(bad)}`);
  assert.ok(good.progress > bad.progress);
});

test('board_memo_review: plan-vs-actual, decisions, risks and cash beat a status blurb', () => {
  const good = heuristicBoard('Plan vs actual: MRR $18K vs $20K plan (variance: churn of two clinics, due to closures). Cash $210K, burn $9K, runway 23 months; downside case if growth stalls is 18 months. Top risks: churn in small clinics (mitigation: annual plans), single point of failure (me). Decisions needed by Nov 15: 1) approve a $40K support hire (recommend yes) 2) approve raising a bridge SAFE. ' + 'Detail on cohorts follows. '.repeat(8), { burn: 9000 });
  const bad = heuristicBoard('Things are going well. We shipped some features and talked to customers. Excited for next quarter and the opportunities ahead for the company and the product roadmap and everything else that we are working on.', { burn: 9000 });
  assert.ok(good.quality >= 3.6, `good ${good.quality}`);
  assert.ok(bad.quality <= 2.2, `bad ${bad.quality}`);
  for (const c of FR.BOARD_CRITERIA) assert.ok(Number.isInteger(good[c.key]), c.key);
  assert.ok(Array.isArray(good.questions));
});

test('accelerator_application: progress, insight and plain answers beat hype; score is 1-10 via game weights', () => {
  const strong = FB.accelScoresFallback(['We turn clinic no-shows into booked visits. We launched in March and have 140 paying clinics at $18K MRR, growing 14% a month.', 'I talked to 60 front-desk managers; they told me paper backups are why software fails, so I built an SMS-first flow in two weeks. I shipped weekly since.', 'I am solo because I worked at a dental group for six years; I will hire a support lead first. The market is every outpatient clinic, billions in no-show losses.']);
  const weak = FB.accelScoresFallback(['We are a revolutionary AI platform that will disrupt healthcare and change the world as a game-changing solution.', 'We plan to build it and hope to find customers going forward.', 'We will be huge.']);
  assert.ok(FR.accelScore10(strong.scores) >= 7.5, `strong ${FR.accelScore10(strong.scores)}`);
  assert.ok(FR.accelScore10(weak.scores) <= 4, `weak ${FR.accelScore10(weak.scores)}`);
  assert.ok(FR.accelScore10({ plain_answer: 5, progress: 5, insight: 5, velocity: 5, ambition_team: 5 }) === 10);
});

test('sbir_review: R&D with aims and success criteria beats an ordinary SaaS pitch', () => {
  const rd = 'Hypothesis: a transformer fine-tuned on sparse sensor data can predict bearing failure with 95% accuracy, compared to existing threshold methods (state of the art 70%). Technical uncertainty: generalization across machines is unknown. Specific Aim 1: build a prototype and benchmark; success criteria: 90% recall at 5% false alarm in 6 months; go/no-go for Phase II. Our PhD engineers have published on this; university lab collaborators provide test rigs. Customer discovery: 30 plant managers interviewed, pilot LOIs from two; Phase II path via OEM partners and a revenue model per sensor.';
  const saas = 'We are building a SaaS dashboard web app with a nice UI and subscription pricing, integrating with popular tools. The market is huge and customers will love it. We plan to grow quickly.';
  const a = FB.sbirScoresFallback(rd), b = FB.sbirScoresFallback(saas);
  assert.ok(FR.sbirScore10(a.scores) >= 7.5, `rd ${FR.sbirScore10(a.scores)}`);
  assert.ok(FR.sbirScore10(b.scores) <= 3.5, `saas ${FR.sbirScore10(b.scores)}`);
  assert.equal(a.deep_tech, true); assert.equal(b.deep_tech, false);
});

test('cofounder_profile_review: specific profile beats a generic one', () => {
  const strong = heuristicProfile('I built and shipped a clinic-scheduling product to 140 paying clinics, $18K MRR, 14% MoM. Looking for a technical co-founder (CTO) who will own the platform and integrations while I own sales. I am full-time from January with 14 months of personal runway; I want a 4-year vest with a cliff and a paid 6-week trial project. We decide by data; disagreements go to an advisor.');
  const weak = heuristicProfile('Passionate visionary entrepreneur looking for a co-founder to build something great together.');
  assert.ok(strong.quality >= 3.8, `strong ${strong.quality}`);
  assert.ok(weak.quality <= 2, `weak ${weak.quality}`);
  for (const c of CF.PROFILE_CRITERIA) assert.ok(Number.isInteger(strong[c.key]), c.key);
});

test('cofounder_call_judge: commitment, vesting and honesty drive interest; short calls are capped', () => {
  const cand = { interest: 0.5 };
  const strong = CF.heuristicCall(mine([
    'I can start full-time on January 5 and have 14 months of runway, 40 hours a week for the trial.',
    'I would own engineering and you own sales; if we deadlock on product I decide, on money you decide. I would propose 40/60 reflecting 8 months of head start, 4-year vesting with a 1-year cliff for both of us, after a 6-week paid trial.',
    'Honestly our churn is 4% and that is not working; I do not know yet whether small clinics are the right segment. Last time I disagreed with a co-founder we agreed a rule: escalate to an advisor after two days. What are your goals for the next three years?',
  ]), cand);
  const weak = CF.heuristicCall(mine(['It will be huge, guaranteed.', 'We will figure out equity later, 50/50.', 'I need an answer today.']), cand);
  assert.ok(strong.interest >= 4 && weak.interest <= 2, `${strong.interest} vs ${weak.interest}`);
  assert.ok(CF.heuristicCall(mine(['I can start full-time January 5 with 14 months runway; vesting 4 years with cliff.']), cand).interest <= 3);
  assert.ok(Array.isArray(weak.concerns) && weak.concerns.length > 0);
  assert.equal(CF.callInterest({ commitment_alignment: 5, roles_decisions: 5, equity_vesting: 5, conflict_handling: 5, honesty: 5, curiosity: 5 }), 5);
});

test('cofounder_chat fallback: vesting and runway raise interest, pressure lowers it', () => {
  assert.ok(CF.chatInterestFallback('I have 12 months runway, can go full-time in January, and want 4-year vesting with a cliff. What do you want to own?') > 0.4);
  assert.ok(CF.chatInterestFallback('I need an answer today, 50/50 and we figure it out later') < 0);
});

test('job_post_review fallback: outcome-based, pay-transparent post beats a cliche post, wide range scores lower', () => {
  const good = heuristicPostJudge({ role: 'engineer', payLo: 150000, payHi: 175000, text: `We're a 2-person bootstrapped SaaS at $18k MRR serving 140 dental clinics, no outside funding. You will own our scheduling sync and billing integrations and report to the founder. In your first 30 days you'll ship the Stripe dunning rework; by month 3 you'll own on-call. Must have: 5 years shipping production SaaS. Nice to have: Postgres. Salary range $150k-$175k + 1% options. Interview process: 30-min call, paid take-home (4 hours), founder chat; decision within 5 days. We are an equal opportunity employer and provide accommodations.` });
  const bad = heuristicPostJudge({ role: 'engineer', text: 'Rockstar ninja wanted! Fast-paced family. Dominant, aggressive self-starter. Competitive pay.' });
  assert.ok(good.clarity >= 7 && good.specificity >= 8, `${good.clarity}/${good.specificity}`);
  assert.ok(bad.clarity <= 3 && bad.specificity <= 3);
  assert.equal(good.payTransparency, true); assert.equal(bad.payTransparency, false);
  for (const c of PP.JOB_POST_CRITERIA) assert.ok(Number.isInteger(good[c.key]), c.key);
  const wide = heuristicPostJudge({ role: 'engineer', payLo: 80000, payHi: 220000, text: 'Salary $80k-$220k. You will own the backend.' });
  const tight = heuristicPostJudge({ role: 'engineer', payLo: 150000, payHi: 170000, text: 'Salary $150k-$170k. You will own the backend.' });
  assert.ok(tight.pay > wide.pay);
});

test('candidate_email fallback: concrete terms and a fair deadline beat pressure', () => {
  const c = { persona: { concern: 'equity upside' } };
  const strong = PP.mailSentimentFallback('Thanks for the question. Here are the terms: $150k base, 1% equity (4-year vest, 1-year cliff), start Feb 1. We have 20 months of runway at $18K MRR. Take your time, decision by next Friday.', c);
  const weak = PP.mailSentimentFallback('We are competitive. Need an answer today.', c);
  assert.ok(strong > 0.1 && weak < 0, `${strong} vs ${weak}`);
});

test('spend_policy_read: enforceable clauses count, fallback matches heuristic, clause scores need 4+', () => {
  const POLICY = 'Receipts and a business-purpose memo are due within 5 business days. Any purchase over $500 needs approval from the founder before buying. New software and trials need an owner and approval. Travel: hotels up to $200 per night, meals $60 per day. Gift cards, cash advances and personal spend are prohibited. Do not split a purchase to avoid the approval limit.';
  const h = policyHeuristic(POLICY);
  assert.ok(h.coverage >= 0.8);
  assert.deepEqual(SP.clausesFromScores({ receipts: 5, approval: 3, software: 4, travel: 1, prohibited: 4, split: 5 }), { receipts: true, approval: false, software: true, travel: false, prohibited: true, split: true });
  assert.ok(policyHeuristic('Please be careful with money and use good judgment.').coverage < 0.2);
});

test('weights are applied by the game: weighted() of identical scores is stable', () => {
  const all5 = Object.fromEntries(FR.MEETING_CRITERIA.map((c) => [c.key, 5]));
  assert.equal(weighted(all5, FR.MEETING_CRITERIA), 5);
  assert.equal(FR.meetingPerformance(Object.fromEntries(FR.MEETING_CRITERIA.map((c) => [c.key, 1]))), 1);
});
