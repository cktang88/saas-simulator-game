// Advice comes from people, not the dashboard: the advice gate (core/advice.js), sources, lessons and the Scorecard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { registerOperatorReader, readOperator, logMistake, splitLesson, trapCoaching } from '../public/core/operator.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';
import { adviceFor, addSource, setLearningMode, learningMode, ask, conflicts, followAdvice, inbox, lessonFor, BAD_ADVICE, reviewFor } from '../public/core/advice.js';
import { ensureFr } from '../public/apps/fundraising/sim.js';
import { ensureIr, generateAdvisors } from '../public/apps/fundraising/ir.js';
import { startAdvisorTrial, signAdvisorSource, syncSources } from '../public/apps/advisors/recruit.js';
import scorecard from '../public/apps/outcomes.js';

const mk = () => {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'vc', founderName: 'F', seed: 7 });
  ensureStripe(s); ensureMarket(s);
  post(s, { amount: 30000, counterparty: 'F', category: 'owner_contribution' });
  s.day = 100;
  return s;
};
const TRAPS = OPERATOR_TIERS.fundraising.traps.map((t) => t.coaching);
// A fundraising reader whose true lines are the first two traps (the hidden truth the gate must hide).
registerOperatorReader('fundraising', () => ({ tier: 'mediocre', evidence: ['pitched 3 investors, no intros'], coaching: [TRAPS[0], TRAPS[1], 'What a stellar operator does: run a time-boxed process.'] }));
const truthLines = () => readOperator(mk(), 'fundraising').coaching;

test('no sources: coaching is empty, but raw evidence and the tier exist internally', () => {
  const s = mk();
  const r = readOperator(s, 'fundraising');
  assert.equal(r.tier, 'mediocre');
  assert.ok(r.evidence.length && r.coaching.length, 'internal truth is kept');
  assert.ok(!Object.keys(r).includes('coaching'), 'coaching does not leak through spreads or JSON');
  assert.equal(JSON.stringify(r).includes(TRAPS[0]), false);
  assert.deepEqual(adviceFor(s, 'fundraising', r.coaching), []);
  assert.equal(learningMode(s), false);
});

test('learning mode returns every true line, tagged as the coach', () => {
  const s = mk();
  setLearningMode(s, true);
  const items = adviceFor(s, 'fundraising', truthLines());
  assert.equal(items.length, 3);
  assert.ok(items.every((i) => i.from === 'Coach (learning mode)'));
  assert.deepEqual(items.map((i) => i.text), truthLines());
});

test('operator quality of the source shapes what you hear', () => {
  const lines = truthLines();
  const say = (quality, extra = {}) => { const s = mk(); addSource(s, { kind: 'advisor', name: 'A', expertise: 'fundraising', quality, access: 'metrics', ...extra }); return adviceFor(s, 'fundraising', lines); };
  const great = say('great'), good = say('good'), avg = say('average'), med = say('mediocre'), bad = say('bad');
  assert.ok(lines.slice(0, 2).every((l) => great.some((i) => i.text === l)), 'great: the correct specific lines');
  assert.ok(good.length && good.every((i) => lines.some((l) => l.startsWith(i.text.replace(/\.$/, '').slice(0, 30)))), 'good: correct but less specific');
  assert.ok(good.every((i) => i.text.length <= lines.find((l) => l.startsWith(i.text.slice(0, 20)))?.length));
  assert.ok(avg.length === 1 && avg[0].truth === 'generic' && !lines.includes(avg[0].text));
  assert.ok(med.length === 1 && ['generic', 'offtarget'].includes(med[0].truth) && !lines.some((l) => med[0].text.includes(l.slice(0, 40))));
  assert.equal(bad[0].text, BAD_ADVICE.fundraising);
  assert.match(bad[0].text, /Raise now/);
  assert.ok(bad[0].confidence === 'high' || bad[0].confidence === 'medium');
  // no data access caps a great source at good
  const blind = say('great', { access: 'none' });
  assert.ok(blind.length <= 2 && blind.every((i) => i.truth === 'true') && blind[0].text.length <= great[0].text.length);
});

test('a biased investor pushes raise-now advice for fundraising even when good', () => {
  const s = mk();
  addSource(s, { kind: 'board', name: 'Lead investor', expertise: 'board', quality: 'good' });
  const items = adviceFor(s, 'fundraising', truthLines());
  const slanted = items.find((i) => i.biased);
  assert.ok(slanted && /raising now|raise/i.test(slanted.text));
  assert.ok(items.some((i) => i.truth === 'true'), 'still says the correct thing too');
  addSource(s, { kind: 'consultant', name: 'Firm', expertise: 'gtm', quality: 'average' });
  const gtm = adviceFor(s, 'cold_outreach', []);
  assert.ok(gtm.some((i) => /outside specialists/.test(i.text)), 'a consultant recommends more consulting');
});

test('conflicting advice: both sources are returned and flagged', () => {
  const s = mk();
  addSource(s, { kind: 'advisor', name: 'Careful', expertise: 'fundraising', quality: 'great', access: 'full' });
  addSource(s, { kind: 'advisor', name: 'Loud', expertise: 'fundraising', quality: 'bad' });
  const items = adviceFor(s, 'fundraising', truthLines());
  assert.deepEqual([...new Set(items.map((i) => i.from))].sort(), ['Careful', 'Loud']);
  const c = conflicts(items);
  assert.ok(c.length >= 1 && c.every((p) => p.true.from === 'Careful' && p.wrong.from === 'Loud'));
});

test('sources only speak to what they cover; learning mode off hides the AI too until recruited', () => {
  const s = mk();
  addSource(s, { kind: 'advisor', name: 'Sales', expertise: 'gtm', quality: 'great' });
  assert.deepEqual(adviceFor(s, 'fundraising', truthLines()), []);
  addSource(s, { kind: 'ai', name: 'AI Assistant', quality: 'mediocre' });
  const ai = adviceFor(s, 'fundraising', truthLines());
  assert.equal(ai.length, 1);
  assert.match(ai[0].text, /no experience with your segment/);
  assert.equal(ai[0].confidence, 'low');
});

test('ask(): offline answer is grounded in shared data only and never leaks hidden truth unless great AND shared', async () => {
  const hint = 'HIDDEN: your best segment is dental practices.';
  const run = async (quality, share) => {
    const s = mk();
    s.metrics.daily.push({ day: 99, mrr: 4200, customers: 31, cash: 18000 });
    const src = addSource(s, { kind: 'advisor', name: 'Ola', expertise: 'fundraising', quality });
    const before = s.founder.hoursUsed;
    const a = await ask(s, src.id, 'Should I raise now? Our runway is short.', { share, truth: [hint] });
    assert.ok(s.founder.hoursUsed > before, 'costs founder hours');
    assert.equal(a.mock, true);
    return { a, s };
  };
  const none = (await run('great', 'none')).a;
  assert.doesNotMatch(none.text, /dental/);
  assert.doesNotMatch(none.text, /\$4,200/);
  assert.match(none.text, /Without seeing your numbers/);
  const shared = (await run('great', 'metrics')).a;
  assert.match(shared.text, /dental/);
  assert.match(shared.text, /\$4,200/);
  const mediocre = (await run('mediocre', 'metrics')).a;
  assert.doesNotMatch(mediocre.text, /dental/);
  assert.equal(mediocre.functionId, 'fundraising');
  assert.ok(mediocre.readyDay >= mediocre.day);
  // answers land in the inbox
  const { s } = await run('bad', 'metrics');
  assert.ok(inbox({ ...s, day: s.day + 10 }).some((x) => x.kind === 'answer'));
});

test('ask(): a source has limited time each month', async () => {
  const s = mk();
  const src = addSource(s, { kind: 'mentor', name: 'Mentor', expertise: 'general', quality: 'good', hoursPerMonth: 1 });
  await ask(s, src.id, 'raise?', { hours: 0.5 });
  await ask(s, src.id, 'raise again?', { hours: 0.5 });
  await assert.rejects(() => ask(s, src.id, 'one more?', { hours: 0.5 }), /no time left/);
});

test('following wrong advice is a traceable, delayed mistake; true advice is free', () => {
  const s = mk();
  addSource(s, { kind: 'advisor', name: 'Loud', expertise: 'fundraising', quality: 'bad' });
  const [w] = adviceFor(s, 'fundraising', truthLines());
  const r = followAdvice(s, w.id);
  assert.ok(r.mistake && r.mistake.delayed && /Loud/.test(r.mistake.detail));
  assert.equal(s.mistakes.length, 1);
  assert.equal(s.advice.followed[0].sourceId, w.sourceId);
  assert.equal(followAdvice(s, w.id).mistake, null, 'only once');
  const t = mk();
  addSource(t, { kind: 'advisor', name: 'Careful', expertise: 'fundraising', quality: 'great' });
  const [g] = adviceFor(t, 'fundraising', truthLines());
  assert.equal(followAdvice(t, g.id).mistake, null);
});

test('signing a FAST advisor posts equity to the cap table and the source exists from the trial', () => {
  const s = mk();
  s.company.entity = 'ccorp';
  const ir = ensureIr(s);
  ir.advisorProspects = generateAdvisors(s, 1);
  const src = startAdvisorTrial(s, ir.advisorProspects[0].id);
  assert.equal(src.kind, 'advisor');
  assert.equal(syncSources(s).length, 1, 'sync is idempotent');
  const fr = ensureFr(s);
  const before = fr.cap.common.length;
  assert.throws(() => signAdvisorSource(s, src.id, { level: 'deep' }), /trial month/, 'no equity before the trial month is over');
  assert.equal(fr.cap.common.length, before);
  ir.advisors[0].status = 'trial_done'; // irDay flips it when the trial month ends
  signAdvisorSource(s, src.id, { level: 'deep' });
  assert.equal(fr.cap.common.length, before + 1);
  assert.throws(() => signAdvisorSource(s, src.id, { level: 'deep' }), /already/, 'a second signature would post a second block of shares');
  assert.match(fr.cap.common.at(-1).note, /FAST/);
  assert.ok(src.cost.equityPct >= 0.1 && src.cost.equityPct <= 1);
  assert.equal(src.hoursPerMonth, 4);
});

test('logMistake splits the lesson from the facts; the lesson is gated', () => {
  assert.deepEqual(splitLesson('Replaced after 4 months. A stellar operator checks references first.'), { fact: 'Replaced after 4 months.', lesson: 'A stellar operator checks references first.' });
  assert.equal(splitLesson('Next time ask for three quotes.').lesson, '');
  assert.equal(splitLesson('You overpaid by $3,000. Next time ask for three quotes.').lesson, 'Next time ask for three quotes.');
  assert.equal(splitLesson('Plain facts only.').lesson, '');
  const s = mk();
  const m = logMistake(s, { functionId: 'hiring', id: 'bad_hire', label: 'Bad hire', cost: { usd: 9000 }, detail: 'Replaced after 4 months. A stellar operator checks references first.' });
  assert.equal(m.detail, 'Replaced after 4 months.');
  assert.match(m.lesson, /stellar operator/);
  assert.deepEqual(lessonFor(s, m), []);
  setLearningMode(s, true);
  assert.equal(lessonFor(s, m)[0].text, m.lesson);
  const e = logMistake(s, { functionId: 'hiring', id: 'x', detail: 'Facts.', lesson: 'Explicit lesson.' });
  assert.equal(e.lesson, 'Explicit lesson.');
});

test('review: only a source that sees your data and judges well reveals the tier', () => {
  const s = mk();
  assert.equal(reviewFor(s, 'fundraising').covered, false);
  addSource(s, { kind: 'advisor', name: 'Meh', expertise: 'fundraising', quality: 'mediocre' });
  assert.equal(reviewFor(s, 'fundraising').tier, null);
  addSource(s, { kind: 'board', name: 'Board', expertise: 'board', quality: 'good' });
  const r = reviewFor(s, 'fundraising');
  assert.equal(r.tier, 'mediocre');
  assert.equal(r.reviewer, 'Board review');
});

test('Scorecard shows raw data only without a source; reviews and coaching appear with one or in learning mode', () => {
  const withMistake = () => { const st = mk(); logMistake(st, { functionId: 'fundraising', id: 'x', label: 'Pitched the wrong funds', cost: { usd: 1200, hours: 9 }, detail: 'Spent a month on funds that cannot return. A stellar operator checks fund size first.' }); return st; };
  const s = withMistake();
  const render = (st) => { const root = { innerHTML: '' }; scorecard.render(root, { state: st }); return root.innerHTML; };
  let h = render(s);
  assert.match(h, /Pitched the wrong funds/);
  assert.match(h, /\$1,200/);
  assert.match(h, /Activity|Audience|Your surface area/i);
  assert.doesNotMatch(h, /stellar/i);
  assert.doesNotMatch(h, /mediocre/);
  assert.ok(!h.includes(TRAPS[0].slice(0, 30)));
  assert.doesNotMatch(h, /Odds of a lucky break|typical<|× typical/);
  assert.doesNotMatch(h, /How this usually ends/);
  addSource(s, { kind: 'board', name: 'Your board', expertise: 'board', quality: 'great' });
  h = render(s);
  assert.match(h, /Board review/);
  assert.match(h, /mediocre/);
  assert.match(h, /Odds of a lucky break/);
  const t = withMistake();
  setLearningMode(t, true);
  h = render(t);
  assert.match(h, /Coach \(learning mode\)/);
  assert.match(h, /stellar operator checks fund size first/);
  void trapCoaching;
});
