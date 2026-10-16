// Customer discovery on top of the hidden market truth: recruiting decides who shows up, simulated real interviews reveal
// facts only as earned, synthesis and hypotheses are graded on behaviour, and the operator tiers separate. Short, targeted sims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket } from '../public/core/market.js';
import * as llm from '../public/core/llm.js';
import { truthOf, featureValue } from '../public/core/truth.js';
import { recruitBatch, planBatch, screenerQuality, targetRead } from '../public/apps/research/recruit.js';
import { startSim, sendSimTurn, finishSim, confirmSim } from '../public/apps/research/sim.js';
import { boardOf, addClaim, claimQuality, claimAccuracy, personRows, enrichInsights, synthesisQuality } from '../public/apps/research/synthesis.js';
import { addHypothesis, editCriteria, evaluateHypothesis, decideHypothesis } from '../public/apps/research/hypotheses.js';
import { adoptRequest, priceFromWtp, flushPending, runDebrief, maybeDebrief } from '../public/apps/research/debrief.js';
import { disc } from '../public/apps/research/store.js';
import { settleBets, traceFeatureOutcome, buildHoursSince } from '../public/apps/research/consequences.js';
import { priceFactor } from '../public/core/market.js';
import { productSlice, newFeature } from '../public/apps/product/store.js';
import { readOperator } from '../public/core/operator.js';
import '../public/apps/outcomes/readers.js';
import { renderScript } from './helpers/founder-scripts.js';

const TARGET = 'HVAC company operations managers across several locations';
const SCREENER = 'When did you last chase a late invoice, and how many were open in the last month?\nWhat tool do you use to track them?\nHow many locations and employees does your company have?';
const LEADY = 'Do you struggle with late invoices?';

function mk(seed = 5) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'P', seed });
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = 'Invoice reminders for plumbers and HVAC contractors';
  s.company.icp = TARGET;
  s.founder.network.friends = 600;
  return s;
}
const ctxOf = (s) => ({ state: s, llm });
const best = (s) => truthOf(s).bestSegmentId;
const recruit = (s, o) => recruitBatch(s, { sends: 40, ...o }).booked;

async function hold(s, iv, steps) {
  s.day = Math.max(s.day, iv.day);
  iv.confirmedDay = iv.day - 1;
  startSim(s, iv.id);
  if (iv.status !== 'live') return iv;
  for (const st of steps) await sendSimTurn(ctxOf(s), iv, st.q);
  return finishSim(ctxOf(s), iv);
}
const script = (id) => renderScript(id);

test('a sharp target plus a real screener fills the calendar with in-segment people who have the problem', () => {
  let sharp = { n: 0, best: 0, pain: 0 }, vague = { n: 0, best: 0, pain: 0 };
  for (const seed of [3, 5, 8]) {
    const a = mk(seed); const b = mk(seed);
    const bs = best(a);
    a.company.icp = ''; b.company.icp = '';
    const tgt = seed === 5 ? TARGET : null;
    if (!tgt) continue; // target text is tuned to the seed-5 market
    for (const iv of recruit(a, { channel: 'panel', target: tgt, screener: SCREENER })) { sharp.n++; sharp.best += iv.hidden.segmentId === bs ? 1 : 0; sharp.pain += iv.hidden.hasPain ? 1 : 0; }
    for (const iv of recruit(b, { channel: 'panel', target: '', screener: '' })) { vague.n++; vague.best += iv.hidden.segmentId === bs ? 1 : 0; vague.pain += iv.hidden.hasPain ? 1 : 0; }
  }
  assert.ok(sharp.n >= 15, `${sharp.n} booked`);
  assert.ok(sharp.best / sharp.n >= 0.6, `in-segment share ${sharp.best}/${sharp.n}`);
  assert.ok(sharp.pain / sharp.n >= 0.7, `pain share ${sharp.pain}/${sharp.n}`);
  assert.ok(vague.best / vague.n < 0.3, `vague in-segment share ${vague.best}/${vague.n}`);
  assert.ok(screenerQuality(SCREENER) > 0.6 && screenerQuality(LEADY) < 0.2);
  assert.ok(targetRead(mk(), TARGET).sharp > 0.6 && targetRead(mk(), 'small businesses').vague);
});

test('friends and family say yes and are polite, but have no more pain than strangers; hard channels cost more per call', () => {
  const s = mk();
  const friends = recruit(s, { channel: 'friends', sends: 30, target: TARGET });
  const strangers = recruit(mk(), { channel: 'linkedin', target: TARGET, screener: SCREENER });
  assert.ok(friends.length >= 15);
  const pol = friends.reduce((a, i) => a + i.hidden.politeness, 0) / friends.length;
  assert.ok(pol > 0.75, `politeness ${pol}`);
  const painRate = (l) => l.filter((i) => i.hidden.hasPain).length / Math.max(1, l.length);
  assert.ok(painRate(friends) < 0.35, `friends pain ${painRate(friends)}`);
  assert.ok(painRate(strangers) > painRate(friends) + 0.3, `strangers ${painRate(strangers)} vs friends ${painRate(friends)}`);
  const cold = planBatch(s, { channel: 'cold_email', sends: 20, target: TARGET, screener: SCREENER });
  const warm = planBatch(s, { channel: 'warm', sends: 20, target: TARGET });
  assert.ok(cold.hoursPerCompleted > warm.hoursPerCompleted * 1.5, `${cold.hoursPerCompleted} vs ${warm.hoursPerCompleted}`);
  assert.ok(planBatch(s, { channel: 'panel', sends: 10, target: TARGET, incentive: 100 }).usdPerCompleted >= 200);
});

test('a panel without a screener includes professional respondents; a good screener catches them', () => {
  let open = 0, screened = 0, nOpen = 0, nScr = 0, caught = 0;
  for (const seed of [2, 5, 9]) {
    const a = mk(seed), b = mk(seed);
    const o = recruit(a, { channel: 'panel', target: TARGET, screener: '' });
    const r = recruitBatch(b, { channel: 'panel', sends: 40, target: TARGET, screener: SCREENER });
    open += o.filter((i) => i.hidden.fraud).length; nOpen += o.length;
    screened += r.booked.filter((i) => i.hidden.fraud).length; nScr += r.booked.length; caught += r.batch.fraudCaught;
  }
  assert.ok(open >= 4, `${open} fraud in ${nOpen} unscreened`);
  assert.ok(screened / nScr < open / nOpen / 2, `screened ${screened}/${nScr} vs open ${open}/${nOpen}`);
  assert.ok(caught >= 1);
});

test('stellar interviewer in the right segment earns real commitments and accurate synthesis; the mediocre pitcher gets compliments and hypothetical WTP', async () => {
  const s = mk();
  const bs = best(s);
  const pool = recruit(s, { channel: 'panel', target: TARGET, screener: SCREENER, incentive: 100 }).filter((i) => i.hidden.segmentId === bs && i.hidden.hasPain && !i.hidden.fraud);
  assert.ok(pool.length >= 8, `${pool.length} right people`);
  const a = pool.slice(0, 4), b = pool.slice(4, 8);
  const stellar = []; const med = [];
  for (const iv of a) stellar.push(await hold(s, iv, script('stellar')));
  for (const iv of b) med.push(await hold(s, iv, script('mediocre')));
  const done = (l) => l.filter((i) => i.status === 'done');
  assert.ok(done(stellar).length >= 3 && done(med).length >= 3);
  const strong = (l) => done(l).filter((i) => ['intro', 'pilot', 'loi', 'preorder'].includes(i.grade.commitments[0])).length;
  assert.ok(strong(stellar) >= 2, `stellar strong commitments ${strong(stellar)}`);
  assert.equal(strong(med), 0);
  assert.ok(done(stellar).every((i) => i.grade.score > 55) && done(med).every((i) => i.grade.score < 45), `${done(stellar).map((i) => i.grade.score)} vs ${done(med).map((i) => i.grade.score)}`);
  enrichInsights(s);
  const ins = disc(s).insights;
  const of = (l) => ins.filter((i) => l.some((x) => x.id === i.interviewId));
  const behaviour = (l) => of(l).filter((i) => ['behaviour', 'workaround_cost', 'commitment'].includes(i.evidenceType) && !i.negative).length;
  assert.ok(behaviour(stellar) >= 3 * Math.max(1, behaviour(med)), `behaviour ${behaviour(stellar)} vs ${behaviour(med)}`);
  assert.ok(of(med).some((i) => i.evidenceType === 'hypothetical' || i.evidenceType === 'compliment' || i.evidenceType === 'opinion'));
  // Accurate synthesis: a segment-specific, behaviour-based claim is graded high and is true of the hidden market.
  const cite = of(stellar).filter((i) => i.real).map((i) => i.id);
  const claim = addClaim(s, { text: '4 of 4 ops managers at multi-site HVAC companies described chasing late invoices by hand in the last two weeks', segmentId: bs, kind: 'pain', insightIds: cite });
  assert.ok(claim.grade.q >= 0.75, `${claim.grade.q}`);
  assert.equal(claimAccuracy(s, claim), 1);
  const vague = addClaim(s, { text: 'Everyone we spoke to loves the idea and says they would use it', segmentId: null, kind: 'pain', insightIds: of(med).map((i) => i.id) });
  assert.ok(vague.grade.q < 0.35 && vague.grade.q < claim.grade.q - 0.4, `${vague.grade.q}`);
  // Pricing from what they said is a bet the market settles: nothing is logged when you set it; once the price has been
  // live for 30 days, it is logged with the customers it measurably lost if (and only if) it sits above true WTP.
  if (disc(s).insights.some((i) => i.stated)) {
    const p = priceFromWtp(s, 'stated');
    s.day += 11; flushPending(s); settleBets(s);
    assert.ok(!(s.mistakes ?? []).some((m) => m.id === 'hypothetical_wtp_as_pricing'), 'no cost on the label');
    productSlice(s).features.push({ id: 'f_core', title: 'Core', status: 'shipped', shippedDay: s.day, effortHours: 40 });
    s.plans = [{ id: 'p1', name: 'Pro', price: p.price, interval: 'month', active: true }];
    settleBets(s); s.day += 31;
    const logged = settleBets(s).find((m) => m.id === 'hypothetical_wtp_as_pricing');
    assert.equal(Boolean(logged), priceFactor(s) < 0.85, `priceFactor ${priceFactor(s)}`);
    if (logged) assert.ok(logged.cost.customers >= 1);
  }
  const bd = boardOf(s);
  assert.ok(bd.people >= 6 && bd.segments[0].describing >= 3, JSON.stringify(bd.segments[0]));
});

test('adopting one account\'s idiosyncratic ask logs overfit and its feature value is near zero', async () => {
  const s = mk();
  const bs = best(s);
  const iv = recruit(s, { channel: 'panel', target: TARGET, screener: SCREENER, incentive: 100 }).find((i) => i.hidden.segmentId === bs && i.hidden.hasPain && !i.hidden.fraud);
  iv.hidden.idiosyncraticAsk = 'a custom SAP export with our own cost-centre codes';
  s.day = iv.day; iv.confirmedDay = iv.day - 1; startSim(s, iv.id);
  assert.equal(iv.status, 'live');
  await sendSimTurn(ctxOf(s), iv, 'Tell me about the last time an invoice went unpaid. What happened?');
  await sendSimTurn(ctxOf(s), iv, 'What features would you want in a tool like this?');
  await finishSim(ctxOf(s), iv);
  const ask = disc(s).insights.find((i) => i.evidenceType === 'feature_wish');
  assert.ok(ask, 'the ask was voiced');
  const r = adoptRequest(s, ask.id);
  assert.equal(r.verdict, 'single');
  assert.ok(r.idiosyncratic && r.value < 0.12, `value ${r.value}`);
  const good = featureValue(s, { title: 'Chase late invoices', user: 'ops manager', problem: 'get paid faster and chase fewer invoices by hand', solution: 'sends reminders and matches payments to invoices' });
  assert.ok(good.value > 3 * r.value, `${good.value} vs ${r.value}`);
  // Nothing on adoption; the feature carries its discovery basis and the market answers at its 30-day check.
  s.day += 6;
  assert.ok(!flushPending(s).some((m) => m.id === 'overfit_single_customer'));
  assert.equal(r.feature.discoveryBasis?.kind, 'single');
  Object.assign(r.feature, { status: 'shipped', effortHours: 28, shippedDay: s.day + 14, check: { verdict: 'missed', text: '1 account used it.' } });
  const m = traceFeatureOutcome(s, r.feature);
  assert.equal(m?.id, 'overfit_single_customer');
  assert.equal(m.cost.hours, 28);
  assert.ok(s.mistakes.some((x) => x.id === 'overfit_single_customer' && x.functionId === 'customer_discovery'));
});

test('friends\' enthusiasm counted as validation is debriefed and lands as a delayed mistake', async () => {
  const s = mk();
  const friends = recruit(s, { channel: 'friends', sends: 30, target: '', screener: '' }).slice(0, 6);
  for (const iv of friends) await hold(s, iv, script('mediocre'));
  s.day += 3;
  const d = maybeDebrief(s, { force: true });
  assert.ok(d && d.friends >= 2 && d.real <= 1, JSON.stringify({ f: d?.friends, r: d?.real }));
  s.day += 6;
  const ids = flushPending(s).map((m) => m.id);
  assert.ok(ids.includes('validated_with_friends') || ids.includes('no_screener_wrong_people'), ids.join());
});

test('moved goalposts are recorded; a validated call on them costs the build hours only if the segment lacks the problem', async () => {
  const s = mk();
  const h = addHypothesis(s, { customer: TARGET, problem: 'late invoices are chased by hand and cash arrives late', criteria: { minDescribing: 4, outOf: 5, minCommits: 2, commitLevel: 'pilot' } });
  assert.equal(editCriteria(s, h.id, { minDescribing: 3 }).movedGoalposts, false); // before any evidence
  s.day = 2;
  const pool = recruit(s, { channel: 'panel', target: TARGET, screener: SCREENER, incentive: 100 }).filter((i) => i.hidden.hasPain && !i.hidden.fraud && i.hidden.segmentId === best(s));
  for (const iv of pool.slice(0, 3)) await hold(s, iv, script('stellar'));
  assert.ok(evaluateHypothesis(s, h).qualifying >= 2);
  const r = editCriteria(s, h.id, { minDescribing: 1, minCommits: 0 });
  assert.equal(r.movedGoalposts, true);
  assert.ok(h.criteriaLog.some((l) => l.loosened));
  assert.ok(!(s.mistakes ?? []).some((m) => m.id === 'moved_goalposts'), 'recorded, not charged on the label');
  assert.equal(editCriteria(s, h.id, { minDescribing: 5, outOf: 8 }).movedGoalposts, false); // tightening is fine
  decideHypothesis(s, h.id, 'validated');
  const bet = disc(s).bets.find((b) => b.hypothesisId === h.id);
  assert.ok(bet && bet.loosened);
  // Build for it for 50 days. This hypothesis names the segment that really has the problem: no mistake.
  productSlice(s).features.push(Object.assign(newFeature(s), { title: 'Invoice chaser', status: 'building', progressHours: 30 }));
  s.day += 50; settleBets(s);
  assert.equal(bet.status, 'confirmed');
  // The same discipline aimed at a segment without the problem: the build hours are the mistake, when they are spent.
  const fam = (x) => x.id.split(':')[0];
  const weak = truthOf(s).segments.filter((x) => fam(x) !== fam({ id: best(s) })).sort((a, b) => a.painPrevalence * a.intensity - b.painPrevalence * b.intensity)[0];
  const h2 = addHypothesis(s, { customer: weak.label, problem: 'late invoices are chased by hand and cash arrives late', criteria: { minDescribing: 4, outOf: 5 } });
  h2.criteriaLog.push({ day: s.day, loosened: true, afterResults: true });
  decideHypothesis(s, h2.id, 'validated');
  productSlice(s).features.push(Object.assign(newFeature(s), { title: 'Weak-segment build', status: 'building', progressHours: 24 }));
  s.day += 46;
  const hit = settleBets(s).find((m) => m.id === 'moved_goalposts');
  assert.ok(hit, 'logged when the build meets a segment without the problem');
  assert.equal(hit.cost.hours, buildHoursSince(s, s.day - 46));
});

// ---- Operator tiers: same market, different behaviour ----
async function player(tier) {
  const s = mk();
  const bs = best(s);
  if (tier === 'stellar' || tier === 'good') {
    const h = tier === 'stellar' ? addHypothesis(s, { customer: TARGET, problem: 'late invoices are chased by hand and cash arrives late', criteria: { minDescribing: 3, outOf: 6, minCommits: 1, commitLevel: 'intro' } }) : null;
    s.day = 1;
    const pool = recruit(s, { channel: 'panel', target: TARGET, screener: tier === 'stellar' ? SCREENER : LEADY, incentive: 100 });
    for (const iv of pool.slice(0, 8)) await hold(s, iv, script(tier === 'stellar' ? 'stellar' : 'average'));
    const rows = personRows(s).filter((p) => p.segmentId === bs && p.behaviour);
    const cite = disc(s).insights.filter((i) => rows.some((p) => p.id === i.interviewId) && i.real).map((i) => i.id);
    if (cite.length) addClaim(s, { text: 'Ops managers at multi-site HVAC firms described chasing late invoices by hand recently', segmentId: tier === 'stellar' ? bs : null, kind: 'pain', insightIds: cite });
    if (h) decideHypothesis(s, h.id, evaluateHypothesis(s, h).status === 'pass' ? 'validated' : 'killed');
  } else if (tier === 'average') {
    const pool = recruit(s, { channel: 'community', target: 'small businesses', screener: '' });
    for (const iv of pool.slice(0, 8)) await hold(s, iv, script('average'));
  } else {
    const pool = recruit(s, { channel: 'friends', sends: 30, target: '', screener: '' });
    for (const iv of pool.slice(0, 8)) await hold(s, iv, script('mediocre'));
  }
  return readOperator(s, 'customer_discovery');
}

test('customer_discovery tiers separate by behaviour: who, how they asked, commitments, synthesis, discipline', async () => {
  const r = {};
  for (const t of ['stellar', 'good', 'average', 'mediocre']) r[t] = await player(t);
  const sc = (t) => r[t].score; if (process.env.DBG) console.log(JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [v.tier, v.score, v.evidence]]))));
  assert.ok(sc('stellar') > sc('good') && sc('good') > sc('average') && sc('average') > sc('mediocre'), JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, [v.tier, v.score]]))));
  const rank = { mediocre: 0, average: 1, good: 2, stellar: 3 };
  assert.ok(rank[r.stellar.tier] >= 2 && rank[r.mediocre.tier] <= 1, `${r.stellar.tier} / ${r.mediocre.tier}`);
  assert.ok(r.mediocre.coaching.length > 0);
});
