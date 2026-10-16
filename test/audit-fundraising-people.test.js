// Audit: fundraising and people personas must not be one prompt or one canned answer wearing different names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PANEL_SEATS, seatWeights, rubricSystem, heuristicEval, aggregate, weightedScore, WEIGHTS, CRITERIA_KEYS } from '../public/apps/fundraising/rubric.js';
import { meetingPerformance, meetingPerformanceFor, MEETING_CRITERIA } from '../public/apps/fundraising/judge-rubrics.js';
import { FALLBACK_ARCHETYPES, fromArchetype } from '../public/apps/fundraising/investors.js';
import { cofounderChatFallback, candidateAgenda } from '../public/apps/cofounder/rubrics.js';
import { fallbackAnswer, gradeQuestion } from '../public/apps/people/interview.js';
import { runAssessment } from '../public/apps/people/assess.js';
import { newState } from '../public/core/state.js';

// An uneven company: a strong operator-founder profile, a thin deck, almost no revenue.
const UNEVEN = { stage: 'pre-seed', linkedinText: 'I spent 9 years as head of finance operations at a 400-person logistics company; I was the buyer for this software.', bio: 'Former director, ran AP for 12 years.', deckText: 'AI copilot for finance teams. Problem. Solution.', metrics: { mrr: 0, customers: 0, teamSize: 1, shippedFeatures: 1 } };

test('investor panel: two seats with their own prompt, weights, memo and question', () => {
  assert.equal(PANEL_SEATS.length, 2);
  for (const stage of Object.keys(WEIGHTS)) {
    for (const seat of PANEL_SEATS) assert.equal(Object.values(seatWeights(stage, seat)).reduce((a, b) => a + b, 0), 100, `${stage} ${seat.id}`);
    // The two lenses cancel: their average is the stage weights, so calibration is unchanged.
    for (const k of CRITERIA_KEYS) assert.equal((seatWeights(stage, PANEL_SEATS[0])[k] + seatWeights(stage, PANEL_SEATS[1])[k]) / 2, WEIGHTS[stage][k]);
  }
  assert.notEqual(rubricSystem('seed', PANEL_SEATS[0]), rubricSystem('seed', PANEL_SEATS[1]));
  const [a, b] = PANEL_SEATS.map((seat) => heuristicEval({ ...UNEVEN, seat }));
  assert.notEqual(a.one_line_memo, b.one_line_memo);
  assert.notEqual(a.top_question, b.top_question);
  assert.ok(a.weighted > b.weighted + 0.15, `founder-lens partner likes the founder more (${a.weighted} vs ${b.weighted})`);
  const agg = aggregate([{ model: 'm', seat: 'lead', data: a }, { model: 'm', seat: 'skeptic', data: b }], 'pre-seed', UNEVEN.metrics);
  assert.ok(agg.disagreement > 0.15, 'an uneven company splits the partners offline too');
  assert.ok(Math.abs(agg.S - weightedScore(agg.perModel[0].scores, 'pre-seed')) <= 0.015, 'panel score equals the stage-weighted score');
  assert.ok(agg.perModel.every((p) => p.seatTitle));
  // A balanced company does not split them.
  const even = Object.fromEntries(CRITERIA_KEYS.map((k) => [k, 3]));
  const e = aggregate(PANEL_SEATS.map((s) => ({ model: 'm', seat: s.id, data: { scores: even } })), 'seed', null);
  assert.equal(e.disagreement, 0);
});

test('investor panel view: seats are separate calls, the copy no longer claims two models', () => {
  const src = readFileSync(new URL('../public/apps/fundraising/view-eval.js', import.meta.url), 'utf8');
  assert.ok(src.includes('PANEL_SEATS.map((seat, i) => ctx.llm.ask('));
  assert.ok(!src.includes('Two AI investors (your panel models)'));
});

test('pitch meeting: what this investor weighs changes which answers count', () => {
  const inv = (id) => fromArchetype(FALLBACK_ARCHETYPES.find((a) => a.id === id));
  const uniform = Object.fromEntries(MEETING_CRITERIA.map((c) => [c.key, 3]));
  assert.equal(meetingPerformanceFor(uniform, inv('seed_fund')), 3);
  assert.equal(meetingPerformanceFor(uniform, null), meetingPerformance(uniform));
  // Great on numbers, weak on candor and directness.
  const numbers = { ...uniform, metrics_command: 5, candor: 1.5, directness: 2 };
  assert.ok(meetingPerformanceFor(numbers, inv('seed_fund')) > meetingPerformanceFor(numbers, inv('scout')) + 0.1);
});

const CAND = (o) => ({ id: 'cfc_x', name: 'X', skill: 'technical', commitment: 'full-time now', salaryNeed: 0, tzDiff: 0, priorStartup: false, flag: null, quality: 0.6, interest: 0.5, ...o });

test('co-founder chat offline: each candidate asks about their own concerns, not one script', () => {
  const paid = CAND({ salaryNeed: 8000 });
  const far = CAND({ tzDiff: 9, commitment: 'part-time first' });
  const ceo = CAND({ flag: 'wants the CEO title' });
  const first = [paid, far, ceo].map((c) => cofounderChatFallback(c, [{ from: 'me', text: 'Hi! Great to connect. I am building an AP automation tool.' }]).reply);
  assert.equal(new Set(first).size, 3, first.join(' | '));
  assert.match(first[0], /\$8,000/);
  assert.match(first[2], /CEO/);
  // A topic the founder already covered is not asked.
  const log = [{ from: 'me', text: 'I have 14 months of personal runway and work 50 hours a week. I expect 4-year vesting with a 1-year cliff for both of us.' }];
  const r = cofounderChatFallback(CAND({}), log);
  assert.ok(!/runway|vesting/i.test(r.reply), r.reply);
});

test('co-founder chat offline: answering their question beats dodging it', () => {
  const c = CAND({ salaryNeed: 6000 });
  const q = cofounderChatFallback(c, [{ from: 'me', text: 'Hi, I am building AP automation for logistics companies.' }]).reply;
  const base = [{ from: 'me', text: 'Hi, I am building AP automation for logistics companies.' }, { from: 'them', text: q }];
  const answer = cofounderChatFallback(c, [...base, { from: 'me', text: 'Yes: I can pay $6,000 a month from our seed money starting in month two, and we would revisit after the round.' }]);
  const dodge = cofounderChatFallback(c, [...base, { from: 'me', text: 'Let us not worry about that, the product is going to be huge.' }]);
  assert.ok(answer.interest_change > dodge.interest_change + 0.3, `${answer.interest_change} vs ${dodge.interest_change}`);
  assert.match(dodge.reply, /didn't really answer/);
  assert.ok(candidateAgenda(CAND({ quality: 0.3 })).some((a) => /figure that out later/.test(a.q)), 'weak candidates sound weak');
});

const TRAITS = ['craft', 'gma', 'conscientiousness', 'agency', 'adaptability', 'grit', 'coachability', 'communication', 'empathy', 'ai_fluency', 'domain', 'integrity', 'ambiguity_tolerance', 'polish'];
const person = (role, v, id = role) => ({ id: `c_${id}`, role, traits: Object.fromEntries(TRAITS.map((k) => [k, v])), interest: 0.6, persona: { concern: 'compensation', style: 'plain' }, expectation: 120000, name: 'Sam' });

test('interview offline: strong answers speak to the trait asked, in the job\'s own terms', () => {
  const q1 = 'Tell me about a time you got critical feedback on your work.';
  const q2 = 'Tell me about the hardest bug you debugged.';
  const ae = fallbackAnswer(person('account_executive', 90), q1, gradeQuestion(q1, 'account_executive'), 1).reply;
  const eng = fallbackAnswer(person('engineer', 90), q2, gradeQuestion(q2, 'engineer'), 1).reply;
  assert.notEqual(ae, eng);
  assert.ok(!/requests affected/.test(ae), ae);
  assert.match(ae, /feedback|tore up|lead/i);
  assert.match(ae, /ACV|CFO|deal|closed/i);
  assert.match(eng, /test|fix|error/i);
  // Weak candidates still sound weak.
  const weak = fallbackAnswer(person('engineer', 10), q2, gradeQuestion(q2, 'engineer'), 1).reply;
  assert.ok(!/\d+%/.test(weak), weak);
});

test('structured references: what referees say follows the evidence, not a constant', () => {
  const said = (v) => {
    const out = [];
    for (let i = 0; i < 40; i++) {
      const s = newState({ companyName: 'A', model: 'smb', path: 'indie', founderName: 'P', seed: 100 + i });
      const c = person('engineer', v, `${v}_${i}`);
      const r = runAssessment(s, c, 'references', { scorecard: true });
      if (r.ok) out.push(Number(/about (\d+) out of 10/.exec(r.text)?.[1]));
    }
    return out;
  };
  const strong = said(92), weakOnes = said(8);
  assert.ok(strong.length > 10 && weakOnes.length > 10);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(strong) > mean(weakOnes) + 1.5, `${mean(strong)} vs ${mean(weakOnes)}`);
  assert.ok(new Set([...strong, ...weakOnes]).size >= 3, 'not one canned number');
});
