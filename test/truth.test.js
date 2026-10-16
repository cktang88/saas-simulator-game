import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket, landingConversion, wtpOf, priceFactor } from '../public/core/market.js';
import { truthOf, icpFocus, drawPerson, featureValue, segmentMatch, pmfTruth, judgeKey } from '../public/core/truth.js';
import { classifyChange, registerChange, snapshotOf, PIVOT_TYPES } from '../public/core/pivots.js';
import { trueFit, featureValue as fitValue, evidenceStrength } from '../public/apps/product/fit.js';

function mk(seed = 5, demand = 1, model = 'smb') {
  const s = newState({ companyName: 'X', model, path: 'indie', founderName: 'P', seed });
  ensureMarket(s).flags = { fixedDemand: demand };
  s.company.oneLiner = model === 'b2c' ? 'Meal planning app for busy families' : 'Invoice reminders for plumbers and HVAC contractors';
  s.company.icp = '';
  return s;
}
const strength = (g) => g.painPrevalence * g.intensity;
const best = (t) => t.segments.find((g) => g.id === t.bestSegmentId);
const FEAT = { id: 'f', title: 'Auto invoice reminders', user: 'contractor owner', problem: 'Customers pay late and I chase invoices by hand in a spreadsheet', solution: 'Sends payment reminders by text and email and matches payments to the invoice', status: 'shipped' };

test('truth is deterministic per seed and idea, and differs across ideas', () => {
  const a = truthOf(mk(7)), b = truthOf(mk(7));
  assert.deepEqual(a.segments, b.segments);
  const s2 = mk(7); s2.company.pivots = 1;
  assert.notDeepEqual(truthOf(s2).segments.map((g) => g.painPrevalence), a.segments.map((g) => g.painPrevalence));
  assert.ok(a.segments.length >= 4 && a.segments.length <= 7);
});

test('a decent idea has one concentrated hair-on-fire segment, a weak idea has none', () => {
  for (const seed of [1, 2, 3, 4]) {
    const t = truthOf(mk(seed, 1));
    const top = best(t);
    assert.ok(top.painPrevalence >= 0.5 && top.intensity >= 0.65, `seed ${seed}`);
    assert.ok(t.segments.filter((g) => g.painPrevalence >= 0.5 && g.intensity >= 0.65).length === 1);
    const w = truthOf(mk(seed, 0.1));
    assert.ok(w.segments.every((g) => g.painPrevalence < 0.4 && g.intensity < 0.6), `weak seed ${seed}`);
  }
});

test('B2C ideas get persona segments', () => {
  const t = truthOf(mk(3, 1, 'b2c'));
  assert.ok(t.segments.every((g) => g.kind === 'b2c'));
  assert.ok(t.segments.length >= 4);
});

test('ICP on the strong segment beats a broad or wrong ICP with identical specs', () => {
  const s = mk(5, 1);
  const t = truthOf(s);
  const top = best(t), weak = t.segments.slice().sort((a, b) => strength(a) - strength(b))[0];
  const kw = (g) => g.keywords.find((k) => !g.subKeywords.includes(k) && k.length > 3);
  const run = (icp) => { const x = mk(5, 1); x.company.icp = icp; const v = featureValue(x, FEAT).value; const c = landingConversion; return { v, f: icpFocus(x) }; };
  const right = run(`${kw(top)} ${top.subKeywords[0] ?? ''}`);
  const wrong = run(`${kw(weak)} ${weak.subKeywords[0] ?? ''}`);
  const broad = run('everyone who runs a business');
  assert.ok(right.v > broad.v && broad.v > 0 && right.v > wrong.v, JSON.stringify([right.v, broad.v, wrong.v]));
  assert.ok(right.f.demandMult > broad.f.demandMult && broad.f.demandMult > wrong.f.demandMult || right.f.demandMult > wrong.f.demandMult);
  assert.ok(right.f.churnMult < wrong.f.churnMult);
});

test('conversion follows the segment you reach', () => {
  const mkShip = (icp) => { const s = mk(5, 1); s.company.website = { text: 'x' }; s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] }; s.company.icp = icp; return s; };
  const t = truthOf(mk(5, 1));
  const top = best(t), weak = t.segments.slice().sort((a, b) => strength(a) - strength(b))[0];
  const kw = (g) => g.keywords.find((k) => !g.subKeywords.includes(k) && k.length > 3);
  assert.ok(landingConversion(mkShip(`${kw(top)} ${top.subKeywords[0] ?? ''}`)) > landingConversion(mkShip(`${kw(weak)} ${weak.subKeywords[0] ?? ''}`)));
});

test('stated WTP exceeds true WTP on average with a long tail; truth drives pricing', () => {
  const s = mk(9, 1);
  const seg = best(truthOf(s)).id;
  const ps = Array.from({ length: 400 }, (_, i) => drawPerson(s, { segmentId: seg, channel: 'community', seedKey: `w${i}` }));
  const mults = ps.map((p) => p.statedWtpMult).sort((a, b) => a - b);
  const median = mults[200];
  assert.ok(median > 1.2 && median < 1.5, `median ${median}`);
  assert.ok(mults[390] > 2.2 && mults.at(-1) <= 3.2);
  const payers = ps.filter((p) => p.wtpTrue > 0);
  assert.ok(payers.length > 100 && payers.every((p) => p.statedWtp > p.wtpTrue * 0.59));
  // A panel's stated number never overrides the truth.
  const m = ensureMarket(s); m.fit.price = { wtp: null, stated: 9999 };
  assert.ok(wtpOf(s) < 9999 && wtpOf(s) > 0);
  const s2 = mk(9, 1); s2.plans = [{ price: 5000, interval: 'month', active: true, trialDays: 14 }];
  assert.ok(priceFactor(s2) < 0.6);
});

test('politeness follows relationship: friend > warm > stranger; advisors have no pain', () => {
  const s = mk(4, 1);
  const seg = best(truthOf(s)).id;
  const avg = (rel) => { let t = 0; for (let i = 0; i < 40; i++) t += drawPerson(s, { segmentId: seg, channel: 'cold', relationship: rel, seedKey: `${rel}${i}` }).politeness; return t / 40; };
  assert.ok(avg('friend') > avg('warm') && avg('warm') > avg('stranger'));
  const inv = drawPerson(s, { segmentId: seg, channel: 'investor', seedKey: 'i' });
  assert.equal(inv.hasPain, false);
  assert.equal(drawPerson(s, { segmentId: 'outsider', channel: 'cold', seedKey: 'o' }).hasPain, false);
  assert.ok(drawPerson(s, { segmentId: seg, channel: 'cold', idiosyncratic: true, seedKey: 'z' }).idiosyncraticAsk);
});

test('pain does not depend on warmth; a screener raises the share with pain', () => {
  const s = mk(8, 1);
  const seg = best(truthOf(s)).id;
  const rate = (o) => Array.from({ length: 300 }, (_, i) => drawPerson(s, { segmentId: seg, seedKey: `r${i}`, ...o }).hasPain).filter(Boolean).length / 300;
  assert.ok(Math.abs(rate({ channel: 'warm' }) - rate({ channel: 'cold' })) < 0.12);
  assert.ok(rate({ channel: 'cold', screened: true }) >= rate({ channel: 'cold' }));
});

test('pivot types: segment keeps truth, problem re-draws pain, full restart re-draws all', () => {
  const s = mk(6, 1);
  const before = JSON.parse(JSON.stringify(truthOf(s).segments));
  const ids0 = before.map((g) => g.id);
  // segment pivot: same idea, different ICP
  s.company.icp = 'plumbers owners';
  const prev0 = snapshotOf(s.company); prev0.icp = 'dentists in solo practice';
  const e1 = registerChange(s, prev0, snapshotOf(s.company), { type: 'segment' });
  assert.equal(e1.type, 'segment');
  assert.deepEqual(truthOf(s).segments, before);
  // problem pivot: new one-liner, same customer
  const prev1 = snapshotOf(s.company);
  s.company.oneLiner = 'Scheduling and dispatch software for field crews';
  const e2 = registerChange(s, prev1, snapshotOf(s.company), { type: 'problem' });
  const t2 = truthOf(s);
  assert.deepEqual(t2.segments.map((g) => g.id), ids0);
  assert.notDeepEqual(t2.segments.map((g) => g.painPrevalence), before.map((g) => g.painPrevalence));
  assert.equal(s.company.pivots, 1);
  // full restart
  const prev2 = snapshotOf(s.company);
  s.company.oneLiner = 'Clinic intake forms for dentists'; s.company.icp = 'dental practice managers';
  registerChange(s, prev2, snapshotOf(s.company), { type: 'full_restart' });
  assert.notDeepEqual(truthOf(s).segments.map((g) => g.id), ids0);
  assert.equal(s.company.pivotLog.length, 3);
  assert.deepEqual(s.company.pivotLog.map((p) => p.type), ['segment', 'problem', 'full_restart']);
  assert.ok(s.company.pivotLog.every((p) => p.day != null && p.from != null && p.to != null && Array.isArray(p.kept)));
  assert.ok(s.mistakes.some((m) => m.id === 'pivot_without_evidence'));
  assert.ok(s.mistakes.some((m) => m.id === 'thrash_pivoting'));
});

test('one detector classifies the change', () => {
  const s = mk(6, 1); s.company.icp = 'plumbers';
  const p = snapshotOf(s.company);
  assert.equal(classifyChange(s, p, { ...p, oneLiner: 'Invoice reminders for plumbers and HVAC contractors in Ohio' }).type, null);
  assert.equal(classifyChange(s, p, { ...p, oneLiner: 'Restaurant inventory forecasting', icp: 'restaurant owners' }).type, 'full_restart');
  assert.equal(classifyChange(s, p, { ...p, oneLiner: 'Restaurant inventory forecasting' }).type, 'problem');
  assert.equal(classifyChange(s, p, { ...p, model: 'b2c' }).type, 'business_model');
  assert.equal(classifyChange(s, p, { ...p, icp: 'dental practice managers' }).type, 'segment');
  assert.ok(Object.values(PIVOT_TYPES).every((t) => t.keeps.length && t.loses.length && t.hours > 0));
});

test('stale LLM feature value is ignored after an ICP change; fresh one counts', () => {
  const s = mk(5, 1);
  const top = best(truthOf(s));
  s.company.icp = `${top.keywords[0]} ${top.subKeywords[0] ?? ''}`;
  const f = { ...FEAT, valueLLM: 1, valueKey: judgeKey(s) };
  const fresh = fitValue(f, { state: s, icp: s.company.icp });
  s.company.icp = 'something else entirely about gardening clubs';
  const stale = fitValue(f, { state: s, icp: s.company.icp });
  const none = fitValue({ ...FEAT }, { state: s, icp: s.company.icp });
  assert.equal(stale, none);
  assert.notEqual(fresh, stale);
});

test('a linked presell commitment counts as evidence', () => {
  const f = { ...FEAT, evidence: ['ins_1'] };
  const ins = [{ id: 'ins_1', interviewId: null, presellAskId: 'a1', type: 'commitment', real: true, verified: true, text: 'Acme paid a $99 deposit for "Invoice reminders" before it exists' }];
  assert.ok(evidenceStrength(f, ins) > 0);
  assert.equal(evidenceStrength(f, []), 0);
});

test('segmentMatch and pmfTruth are sane', () => {
  const s = mk(5, 1);
  const top = best(truthOf(s));
  const m = segmentMatch(s, `${top.keywords[0]}`);
  assert.ok(m.length && m[0].score > 0);
  s.market.fit.product.score = 0.8;
  const hi = pmfTruth(s, top.id);
  s.market.fit.product.score = 0.1;
  assert.ok(hi.veryDisappointed > pmfTruth(s, top.id).veryDisappointed);
  assert.ok(pmfTruth(s, top.id).veryDisappointed < hi.veryDisappointed);
  assert.ok(trueFit([{ ...FEAT }], { state: s, icp: top.keywords[0] }) >= 0);
});
