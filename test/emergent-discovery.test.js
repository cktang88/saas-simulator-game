// Bad discovery technique hurts only through what the simulated people say and what the player then does with it.
// No question label (leading, hypothetical, pitch) changes a score or charges a cost; the persona answers it with
// politeness, the player forms a belief, and the market (hidden truth) fails to confirm it later, with the measured cost.
// Short, targeted sims on the seed-5 market of test/discovery.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket } from '../public/core/market.js';
import * as llm from '../public/core/llm.js';
import { truthOf, featureValue } from '../public/core/truth.js';
import { recruitBatch } from '../public/apps/research/recruit.js';
import { startSim, sendSimTurn, finishSim } from '../public/apps/research/sim.js';
import { boardOf } from '../public/apps/research/synthesis.js';
import { addHypothesis, editCriteria, decideHypothesis } from '../public/apps/research/hypotheses.js';
import { adoptRequest, priceFromWtp, flushPending } from '../public/apps/research/debrief.js';
import { traceFeatureOutcome, settleBets, recordBet } from '../public/apps/research/consequences.js';
import { disc } from '../public/apps/research/store.js';
import { productSlice, newFeature } from '../public/apps/product/store.js';
import { gradeTranscript } from '../public/apps/product/interview.js';
import { offlineAnswer, settleReply, planTurn } from '../public/data/persona-prompts.js';
import { heuristicScorecard } from '../public/apps/sales/scorecard.js';
import { callQuality } from '../public/apps/sales/deals.js';
import { positiveShare } from '../public/apps/sales/replies.js';
import { renderScript } from './helpers/founder-scripts.js';

const TARGET = 'HVAC company operations managers across several locations';
const SCREENER = 'When did you last chase a late invoice, and how many were open in the last month?\nWhat tool do you use to track them?\nHow many locations and employees does your company have?';

function mk(seed = 5) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'P', seed });
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = 'Invoice reminders for plumbers and HVAC contractors';
  s.company.icp = TARGET;
  s.founder.network.friends = 600;
  return s;
}
const ctxOf = (s) => ({ state: s, llm });
const recruit = (s, o) => recruitBatch(s, { sends: 40, ...o }).booked;
async function hold(s, iv, steps) {
  s.day = Math.max(s.day, iv.day);
  iv.confirmedDay = iv.day - 1;
  startSim(s, iv.id);
  if (iv.status !== 'live') return iv;
  for (const st of steps) await sendSimTurn(ctxOf(s), iv, st.q);
  return finishSim(ctxOf(s), iv);
}
const discoveryMistakes = (s) => (s.mistakes ?? []).filter((m) => m.functionId === 'customer_discovery');
const stranger = (over = {}) => ({ name: 'Dana Ruiz', role: 'Operations manager', relationship: 'stranger', politeness: 0.25, hasPain: false, isBuyer: true, budgetAuthority: true, painIntensity: 0, frequency: 'rare', workaround: 'the accounting tool we already have', workaroundCostMonthly: 0, wtpTrue: 0, statedWtpMult: 1.4, competingPriorities: ['hiring'], jobsRanked: [], ...over });

test('(a) a leading/hypothetical interviewer collects agreement, forms false beliefs, and pays nothing until the market answers', async () => {
  const s = mk();
  // Polite strangers and friends without the problem: exactly who says "sounds great" to a pitch.
  const pool = [...recruit(s, { channel: 'friends', sends: 30, target: '', screener: '' }), ...recruit(s, { channel: 'community', target: 'small businesses', screener: '' })].filter((i) => !i.hidden.hasPain && !i.hidden.fraud).slice(0, 6);
  assert.ok(pool.length >= 4, `${pool.length} people without the problem`);
  const hoursBefore = s.founder.hoursUsed ?? 0;
  for (const iv of pool) await hold(s, iv, renderScript('mediocre'));
  const done = pool.filter((i) => i.status === 'done');
  assert.ok(done.length >= 4);
  // They were nice about it.
  const agreed = done.flatMap((iv) => iv.messages.filter((m) => m.from === 'them' && m.signal === 'agree'));
  assert.ok(agreed.length >= done.length, `${agreed.length} polite yeses`);
  // Written down, those are beliefs whose hidden truth is false.
  const beliefs = disc(s).insights.filter((i) => done.some((iv) => iv.id === i.interviewId) && i.belief);
  assert.ok(beliefs.length >= 3, `${beliefs.length} beliefs`);
  assert.ok(beliefs.every((i) => i._truth && i._truth.holds === false), 'no-pain people\'s agreement is never true');
  // No penalty for the questions themselves: no discovery mistake, no hours charged beyond what the calls took (none here).
  s.day += 20; flushPending(s); settleBets(s);
  assert.equal(discoveryMistakes(s).length, 0, JSON.stringify(discoveryMistakes(s).map((m) => m.id)));
  assert.equal(s.founder.hoursUsed ?? 0, hoursBefore);
  // Building on the beliefs: a feature citing them ships, misses its 30-day check, and only THEN the cost is logged,
  // at the build hours it actually took (not charged again).
  const f = Object.assign(newFeature(s), { title: 'AI late-payer prediction', user: 'small business owner', problem: 'people said they would use smart reminders', solution: 'predicts late payers', evidence: beliefs.map((i) => i.id), status: 'shipped', effortHours: 46, createdDay: s.day - 40, shippedDay: s.day - 30 });
  productSlice(s).features.push(f);
  f.check = { verdict: 'missed', text: '3% of accounts used it (target 30%).' };
  const used = s.founder.hoursUsed ?? 0;
  const m = traceFeatureOutcome(s, f);
  assert.ok(m && m.id === 'compliments', m?.id);
  assert.equal(m.cost.hours, 46);
  assert.equal(m.cost.days, 10);
  assert.equal(s.founder.hoursUsed ?? 0, used, 'already paid: not charged twice');
  // The same feature hitting its metric would have cost nothing, however it was justified.
  const g = Object.assign(newFeature(s), { title: 'x', evidence: beliefs.map((i) => i.id), status: 'shipped', effortHours: 20, createdDay: 0, shippedDay: 1, check: { verdict: 'hit', text: 'ok' } });
  assert.equal(traceFeatureOutcome(s, g), null);
});

test('(a) the market tests the need, not the interviews: replies, commitments and feature value follow the hidden truth', () => {
  const s = mk();
  const t = truthOf(s);
  const fam = (x) => x.id.split(':')[0];
  const weak = t.segments.filter((x) => fam(x) !== fam(t.segments.find((y) => y.id === t.bestSegmentId))).sort((a, b) => a.painPrevalence * a.intensity - b.painPrevalence * b.intensity)[0];
  // Cold email: positive replies come from people who have the problem; politeness lifts "sounds nice", not demand.
  assert.ok(positiveShare({ tier: 'researched', pain: true }) > 1.8 * positiveShare({ tier: 'researched', pain: false, politeness: 0.25 }));
  // A pre-order ask to a polite person without the problem gets nothing, however many questions came first.
  const hist = [];
  for (const q of ['Tell me about the last time invoices went wrong.', 'What do you use today?', 'How often does it come up?', 'What do you pay for it today?']) {
    const r = offlineAnswer(stranger({ relationship: 'warm', politeness: 0.6 }), q, hist, () => 0.3);
    hist.push({ from: 'me', text: q }, { from: 'them', text: r.reply, revealed: r.revealed });
  }
  const ask = offlineAnswer(stranger({ relationship: 'warm', politeness: 0.6 }), 'Would you pre-pay the first three months today?', hist, () => 0.3);
  assert.ok(!['pilot', 'loi', 'preorder', 'deposit'].includes(ask.commitment), ask.commitment); // at most "follow up with me"
  assert.equal(offlineAnswer(stranger(), 'Would you pre-pay the first three months today?', hist, () => 0.3).commitment, 'none');
  // A feature aimed at the job of a weak segment is worth little when the ICP targets it, however glowing the talks were.
  const best = t.segments.find((x) => x.id === t.bestSegmentId);
  const spec = (seg) => ({ title: seg.jobs[0].label, user: seg.label, problem: seg.jobs[0].label, solution: `automates ${seg.jobs[0].label}` });
  s.company.icp = weak.label; const vWeak = featureValue(s, spec(weak)).value;
  s.company.icp = best.label; const vBest = featureValue(s, spec(best)).value;
  assert.ok(vBest > vWeak, `${vBest} vs ${vWeak}`);
});

test('(b) a past-behaviour interviewer elicits true facts from people who live the problem', async () => {
  const s = mk();
  const pool = recruit(s, { channel: 'panel', target: TARGET, screener: SCREENER, incentive: 100 }).filter((i) => i.hidden.hasPain && !i.hidden.fraud).slice(0, 4);
  assert.ok(pool.length >= 3);
  for (const iv of pool) await hold(s, iv, renderScript('stellar'));
  const done = pool.filter((i) => i.status === 'done');
  for (const iv of done) assert.ok(iv.grade.factsElicited >= 3, `${iv.grade.factsElicited} facts`);
  const facts = disc(s).insights.filter((i) => done.some((iv) => iv.id === i.interviewId) && i._truth?.claim === 'has_problem');
  assert.ok(facts.length >= 3 * done.length - 1, `${facts.length} facts`);
  assert.ok(facts.every((i) => i._truth.holds), 'what they described is true of them');
});

test('(c) a person without the problem cannot be talked into specifics or commitments, live or offline', () => {
  const plain = stranger();
  const friend = stranger({ relationship: 'friend', politeness: 0.85, name: 'Sam' });
  for (const p of [plain, friend]) {
    const hist = [];
    for (const q of ['Tell me about the last time an invoice went unpaid. What happened?', 'Walk me through what you did about it.', 'What did that cost you last month?', 'Wouldn\'t it be great if that never happened again?', 'Would you use a tool that fixed it?']) {
      const r = offlineAnswer(p, q, hist, () => 0.4);
      assert.ok(!r.revealed.includes('lastIncident'), `no incident: ${r.reply}`);
      assert.ok(!/\$\d/.test(r.reply), `no spend figure: ${r.reply}`);
      hist.push({ from: 'me', text: q }, { from: 'them', text: r.reply, revealed: r.revealed });
    }
    for (const q of ['Would you pre-pay the first three months to get a seat?', 'Could we run a pilot with your team next month?']) {
      const r = offlineAnswer(p, q, hist, () => 0.4);
      assert.ok(!['pilot', 'loi', 'preorder', 'deposit'].includes(r.commitment), `${p.relationship}: ${r.commitment}`);
    }
  }
  // The LLM path is clamped by the same facts: a model that "remembers" an incident and offers a deposit is corrected.
  const q = 'Would you put down a deposit today?';
  const plan = planTurn(plain, q, []);
  const v = settleReply(plain, { reply: 'Yes! Last Tuesday we lost $900 on this, I will pay a deposit.', revealed: ['lastIncident'], commitment: 'deposit', statedWtp: null, sentiment: 'positive' }, [], plan, { question: q });
  assert.equal(v.commitment, 'none');
  assert.deepEqual(v.revealed, []);
  const inc = settleReply(plain, { reply: 'Last week it broke and ate four hours.', revealed: ['lastIncident'], commitment: 'none', statedWtp: null, sentiment: 'neutral' }, [], planTurn(plain, 'Tell me about the last time it went wrong.', []), { question: 'Tell me about the last time it went wrong.' });
  assert.deepEqual(inc.revealed, []);
});

test('(d) no question label changes a score: the grade is what was revealed, the call quality is what was learned', () => {
  const them = [
    { from: 'them', text: 'Last Tuesday it ate three hours.', revealed: ['lastTime'], commitment: 'none' },
    { from: 'them', text: 'We use a spreadsheet.', revealed: ['workaround'], commitment: 'none' },
    { from: 'them', text: 'Sure, introduce yourself to my colleague.', revealed: [], commitment: 'intro' },
  ];
  const clean = ['Tell me about the last time it went wrong.', 'What do you use today?', 'Who else should I talk to?'];
  const loaded = ['Wouldn\'t it be great if this never went wrong, right?', 'Would you use our AI tool that fixes it? It is pretty cool.', 'If we built it, how much would you pay?'];
  const mk2 = (qs) => qs.flatMap((q, i) => [{ from: 'me', text: q }, them[i]]);
  const a = gradeTranscript(mk2(clean), { facts: {} });
  const b = gradeTranscript(mk2(loaded), { facts: {} });
  assert.ok(b.leadingQuestions.length + b.hypotheticals.length + b.pitching.length >= 2, 'the labels are still there for coaching');
  assert.equal(a.score, b.score);
  assert.match(b.feedback, /leading|hypothetical/i);
  // Sales call: same disclosures, different question craft -> same discovery quality and call quality.
  const callA = [{ from: 'me', text: 'Tell me about the last time an invoice slipped?' }, { from: 'them', text: 'Two weeks ago, a $4k invoice went 60 days late.', revealed: ['lastIncident'] }, { from: 'me', text: 'What do you use today?' }, { from: 'them', text: 'QuickBooks and reminders by hand.', revealed: ['workaround'] }, { from: 'me', text: 'Who signs off on tools?' }, { from: 'them', text: 'I do.', revealed: ['decision'] }];
  const callB = callA.map((t) => (t.from === 'me' ? { from: 'me', text: `Wouldn't it be great if our AI fixed this, right? Would you use it? ${t.text}` } : t));
  const ca = heuristicScorecard(callA), cb = heuristicScorecard(callB);
  assert.ok(cb.momTestViolations.length > ca.momTestViolations.length);
  assert.equal(ca.discoveryQuality, cb.discoveryQuality);
  assert.equal(callQuality({ ...ca, momTestViolations: [] }), callQuality({ ...ca, momTestViolations: ['a', 'b', 'c', 'd', 'e'] }));
});

test('(d) labelled "mistakes" no longer charge on the label: tagging, adopting, loosening criteria and pricing are bets', async () => {
  const s = mk();
  const bs = truthOf(s).bestSegmentId;
  const cands = recruit(s, { channel: 'panel', target: TARGET, screener: SCREENER, incentive: 100 }).filter((i) => i.hidden.segmentId === bs && i.hidden.hasPain && !i.hidden.fraud);
  let iv = null;
  for (const c of cands) { s.day = Math.max(s.day, c.day); c.confirmedDay = c.day - 1; c.hidden.idiosyncraticAsk = 'a custom SAP export with our own cost-centre codes'; startSim(s, c.id); if (c.status === 'live') { iv = c; break; } }
  assert.ok(iv, 'someone showed up');
  await sendSimTurn(ctxOf(s), iv, 'Tell me about the last time an invoice went unpaid. What happened?');
  await sendSimTurn(ctxOf(s), iv, 'What features would you want in a tool like this?');
  await sendSimTurn(ctxOf(s), iv, 'How much would you pay for a tool that fixed that?');
  await finishSim(ctxOf(s), iv);
  const ask = disc(s).insights.find((i) => i.evidenceType === 'feature_wish');
  const r = adoptRequest(s, ask.id);
  assert.equal(r.verdict, 'single');
  assert.equal(r.feature.discoveryBasis.kind, 'single');
  const h = addHypothesis(s, { customer: TARGET, problem: 'late invoices are chased by hand and cash arrives late', criteria: { minDescribing: 5, outOf: 6, minCommits: 3, commitLevel: 'pilot' } });
  s.day += 1;
  if (disc(s).insights.some((i) => i.stated)) priceFromWtp(s, 'stated');
  s.day += 15; flushPending(s); settleBets(s);
  assert.equal(discoveryMistakes(s).length, 0, JSON.stringify(discoveryMistakes(s).map((m) => m.id)));
  decideHypothesis(s, h.id, 'validated');
  assert.ok(disc(s).bets.some((b) => b.kind === 'validated'));
  // The overfit feature ships and misses: now it is logged, with the build hours it took.
  Object.assign(r.feature, { status: 'shipped', effortHours: 30, shippedDay: s.day, check: { verdict: 'missed', text: 'nobody else used it' } });
  const m = traceFeatureOutcome(s, r.feature);
  assert.equal(m?.id, 'overfit_single_customer');
  assert.equal(m.cost.hours, 30);
  // The hypothesis was about the best segment: it really has the problem, so calling it early costs nothing.
  s.day += 60; settleBets(s);
  assert.ok(!discoveryMistakes(s).some((x) => x.id === 'validated_with_friends'));
  assert.equal(disc(s).bets.find((b) => b.kind === 'validated').status, 'confirmed');
  editCriteria(s, h.id, { minDescribing: 1, minCommits: 0 });
  assert.ok(!discoveryMistakes(s).some((x) => x.id === 'moved_goalposts'));
});

test('(d) a compliment counted as demand costs the hours spent chasing it, measured when it fails to commit', () => {
  const s = mk();
  const crm = (s.apps.crm ??= {});
  crm.deals = [{ id: 'd1', stage: 'meeting_held', contactId: 'c1' }];
  crm.activities = [];
  crm.presell = { offers: [], asks: [], stats: {} };
  const b = recordBet(s, { kind: 'demand', askId: 'a1', dealId: 'd1', contactId: 'c1', who: 'Dana', response: 'Love it, sounds great!' });
  for (const [d, type] of [[3, 'email'], [9, 'call'], [20, 'email']]) crm.activities.push({ id: `x${d}`, day: d, type, dealId: 'd1' });
  s.day = 30; assert.deepEqual(settleBets(s), []);
  s.day = 46;
  const [m] = settleBets(s);
  assert.equal(m.id, 'compliments');
  assert.ok(Math.abs(m.cost.hours - 1.05) < 0.06, `${m.cost.hours}`); // two emails + one call
  assert.equal(b.status, 'failed');
});

test('(e) tiers separate emergently: the people a past-behaviour interviewer believes in really have the problem and answer the market', async () => {
  const sum = { good: { prec: 0, reply: 0, n: 0 }, bad: { prec: 0, reply: 0, n: 0 } };
  for (const seed of [5, 6, 7]) {
    for (const [tier, script] of [['good', 'stellar'], ['bad', 'mediocre']]) {
      const s = mk(seed);
      // The same mixed pool for both: friends (polite, mostly no problem) and screened strangers from the target.
      const pool = [...recruit(s, { channel: 'friends', sends: 20, target: '', screener: '' }).slice(0, 4), ...recruit(s, { channel: 'panel', target: TARGET, screener: SCREENER, incentive: 100 }).filter((i) => !i.hidden.fraud).slice(0, 4)];
      for (const iv of pool) await hold(s, iv, renderScript(script));
      const ins = disc(s).insights;
      // What each player can SEE and acts on: the good one counts people who described the problem (past behaviour),
      // the bad one counts people who said yes (agreement, "would pay").
      const believed = pool.filter((iv) => iv.status === 'done' && ins.some((i) => i.interviewId === iv.id && (tier === 'good' ? i.evidenceType === 'behaviour' && i.type === 'pain' && !i.negative : i.belief)));
      if (!believed.length) continue;
      // The market test: a researched cold email to each believed customer. Replies follow their real need.
      sum[tier].prec += believed.filter((iv) => iv.hidden.hasPain).length / believed.length;
      sum[tier].reply += believed.reduce((a, iv) => a + positiveShare({ tier: 'researched', pain: iv.hidden.hasPain, politeness: iv.hidden.politeness }), 0) / believed.length;
      sum[tier].n++;
    }
  }
  const g = { prec: sum.good.prec / sum.good.n, reply: sum.good.reply / sum.good.n }, b = { prec: sum.bad.prec / sum.bad.n, reply: sum.bad.reply / sum.bad.n };
  assert.ok(sum.good.n >= 2 && sum.bad.n >= 2);
  assert.ok(g.prec > b.prec + 0.25, `precision ${g.prec} vs ${b.prec}`);
  assert.ok(g.reply > 1.25 * b.reply, `positive replies per believed customer ${g.reply} vs ${b.reply}`);
});
