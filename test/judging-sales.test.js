// Rubric-based judging for the sales & customer-conversation cluster (docs/research/judging/sales.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { weighted } from '../public/core/rubric.js';
import { uid } from '../public/core/util.js';
import { ensureOutreach } from '../public/apps/sales/model.js';
import { judgeSequenceJob, heuristicJudge, judgeToQuality, JUDGE_SCHEMA } from '../public/apps/sales/jobs.js';
import { heuristicScorecard, SCORECARD_SCHEMA } from '../public/apps/sales/scorecard.js';
import { COLD_EMAIL_RUBRIC, SCORECARD_RUBRIC, THREAD_PERSONA, CALL_PERSONA, RENEWAL_PERSONA } from '../public/apps/sales/rubrics.js';
import { CLAUSES, REDLINE_SCHEMA, heuristicRedlineFeedback } from '../public/apps/legal/redlines.js';
import { REDLINE_RUBRIC } from '../public/apps/legal/rubric.js';
import { redlineFeedback, withRubric } from '../public/apps/legal/llm.js';
import { PAGE_SCHEMA, normalizePage, judgePage } from '../public/apps/marketworld/llm.js';
import { pageHeuristic } from '../public/apps/marketworld/model.js';
import { PAGE_RUBRIC } from '../public/apps/marketworld/rubric.js';
import { DEMO_SCHEMA, heuristicDemo, judgeDemo, scriptQuality } from '../public/apps/website/demo.js';
import { DEMO_RUBRIC } from '../public/apps/website/rubric.js';
import { personaReply } from '../public/apps/channels/judge.js';

function fresh() {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat Doe', seed: 3 });
  ensureStripe(s); ensureMarket(s);
  s.company.oneLiner = 'Automated bookkeeping reconciliation for dental clinics';
  s.company.icp = 'Owners of independent dental clinics with 2-10 dentists';
  return s;
}
// A fake ctx.llm that records the call and returns the offline fallback (mock: true).
function fakeCtx(s) {
  const calls = [];
  const run = (o) => { calls.push(o); return { data: o.fallback(), mock: true, model: 'fake' }; };
  return { calls, state: s, llm: { ask: async (o) => run(o), panel: async (o) => [run(o)] } };
}
const hasRubric = (text, criteria) => text.includes('SCORING RUBRIC') && criteria.every((c) => text.includes(c.key));
const strictSchema = (sc, keys) => { assert.equal(sc.additionalProperties, false); for (const k of keys) { assert.ok(sc.required.includes(k), k); assert.ok(sc.properties[k], k); } };

test('cold_email_judge: rubric in prompt, schema strict, strong email beats weak through the fallback', async () => {
  const s = fresh();
  const o = ensureOutreach(s);
  o.sequences.push({ id: uid('seq'), name: 't', status: 'active', steps: [{ subject: 'quick question', body: 'Hi {{firstName}},\n\n{{personalization}}\n\nDental clinics we work with cut month-end reconciliation from 6 hours to 40 minutes. Worth a quick look?\n\nNot relevant? Tell me and I will stop.' }], judge: {}, stats: {} });
  const ctx = fakeCtx(s);
  await judgeSequenceJob(ctx, { sequenceId: o.sequences[0].id });
  assert.ok(hasRubric(ctx.calls[0].system, COLD_EMAIL_RUBRIC));
  strictSchema(JUDGE_SCHEMA, ['rubric', 'replyLikelihood', 'verdict', 'fixes']);
  strictSchema(JUDGE_SCHEMA.properties.rubric, COLD_EMAIL_RUBRIC.map((c) => c.key));
  const contact = { personalization: 'Saw your page says you reconcile by hand every month.', title: 'Owner', email: 'a@b.com' };
  const company = { name: 'Smile Dental', site: { text: 'We reconcile accounts by hand every month' } };
  const good = { subject: 'month-end at Smile Dental', body: 'Hi {{firstName}},\n\n{{personalization}}\n\nDental clinics we work with cut reconciliation from 6 hours to 40 minutes. Worth a quick look?\n\nNot relevant? Tell me and I will stop.' };
  const weak = { subject: 'AMAZING opportunity!!!', body: 'Hello, I hope this finds you well. We are a revolutionary, cutting-edge, AI-powered all-in-one platform that will supercharge your business and leverage synergies. '.repeat(4) + 'Book 30 minutes: https://cal.com/x https://x.com Can we talk? Are you free? Why not?' };
  const g = heuristicJudge(good, 0, { ...contact }, company);
  const w = heuristicJudge(weak, 0, { personalization: '' }, company);
  for (const r of [g, w]) assert.deepEqual(Object.keys(r.rubric).sort(), COLD_EMAIL_RUBRIC.map((c) => c.key).sort());
  assert.ok(weighted(g.rubric, COLD_EMAIL_RUBRIC) - weighted(w.rubric, COLD_EMAIL_RUBRIC) >= 1.5, `${weighted(g.rubric, COLD_EMAIL_RUBRIC)} vs ${weighted(w.rubric, COLD_EMAIL_RUBRIC)}`);
  assert.ok(judgeToQuality(g) > judgeToQuality(w) + 0.15);
});

test('call_scorecard: rubric schema + fallback separates a stellar discovery call from a pitch-first call', () => {
  strictSchema(SCORECARD_SCHEMA, ['rubric']);
  strictSchema(SCORECARD_SCHEMA.properties.rubric, SCORECARD_RUBRIC.map((c) => c.key));
  const T = (arr) => arr.map(([from, text]) => ({ from, text }));
  const stellar = heuristicScorecard(T([
    ['me', 'Tell me about the last time month-end close ran late. What happened?'], ['them', 'In March we spent about three weekends reconciling because the bank feed broke and our bookkeeper quit mid-close, it cost us roughly $2,400 in overtime.'],
    ['me', 'What did you try after the bank feed broke, and what did that cost?'], ['them', 'We tried a spreadsheet macro and a temp accountant, around $1,800 for the temp and it still had errors in the feed.'],
    ['me', 'What happens if the feed breaks again in April?'], ['them', 'Taxes get filed late, we got a penalty last year. Our owner gets nervous about that.'],
    ['me', 'Who else decides on a tool like this, and how do you usually buy?'], ['them', 'Dr. Lee signs off, I evaluate. We need security review, usually a couple of weeks.'],
    ['me', 'How do you currently handle the alternatives, or do nothing?'], ['them', 'We compared two other tools last year but did nothing.'],
    ['me', 'Can we set a follow-up next Tuesday with Dr. Lee to look at a pilot?'], ['them', 'Sure, sounds good, send a calendar invite for next Tuesday.'],
  ]));
  const pitch = heuristicScorecard(T([
    ['me', 'Our platform is an all-in-one product with features like automatic reconciliation, our pricing is cheap, let me show you a demo of every feature we built and how our tool lets you do everything automatically with our integrations and dashboards and reports and more features coming soon for you.'], ['them', 'ok'],
    ['me', 'Wouldn\'t it be great if you could do this? Would you pay for it? Do you think you\'d use it?'], ['them', 'Maybe.'],
  ]));
  assert.ok(weighted(stellar.rubric, SCORECARD_RUBRIC) - weighted(pitch.rubric, SCORECARD_RUBRIC) >= 1.5, `${weighted(stellar.rubric, SCORECARD_RUBRIC)} vs ${weighted(pitch.rubric, SCORECARD_RUBRIC)}`);
  assert.equal(Object.keys(stellar.rubric).length, SCORECARD_RUBRIC.length);
});

test('role-play personas carry "what makes me respond" criteria and stay in character', () => {
  for (const [t, kw] of [[THREAD_PERSONA, 'reply'], [CALL_PERSONA, 'next step'], [RENEWAL_PERSONA, 'concede']]) {
    assert.ok(t.includes(kw) && /never mention scores/.test(t) && !t.includes('SCORING RUBRIC'));
  }
  const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  assert.match(src('../public/apps/sales/jobs.js'), /\$\{THREAD_PERSONA\}/);
  assert.match(src('../public/apps/calls.js'), /\$\{CALL_PERSONA\}/);
  assert.match(src('../public/apps/calls.js'), /rubricText\(SCORECARD_RUBRIC\)/);
  assert.match(src('../public/apps/success.js'), /\$\{RENEWAL_PERSONA\}/);
});

test('contract_redlines: rubric in prompt, fallback full shape, market-standard answers beat give-aways', async () => {
  strictSchema(REDLINE_SCHEMA, ['rubric']);
  strictSchema(REDLINE_SCHEMA.properties.rubric, REDLINE_RUBRIC.map((c) => c.key));
  const clauses = Object.keys(CLAUSES);
  const pick = (f) => Object.fromEntries(clauses.map((k) => { const es = Object.entries(CLAUSES[k].options); es.sort((a, b) => f(a[1]) - f(b[1])); return [k, es[0][0]]; }));
  const good = pick((o) => o.risk + (o.deal < -0.1 ? 1 : 0)); // lowest risk without bare refusals
  const bad = pick((o) => -o.risk);                            // biggest give-aways
  const note = 'Because this is market standard (Common Paper), we keep a cap tied to fees and a higher cap for data; subprocessor list and SCC notice attached, with a renewal reminder.';
  const g = heuristicRedlineFeedback(clauses, good, note, {});
  const b = heuristicRedlineFeedback(clauses, bad, 'ok', {});
  assert.ok(weighted(g.rubric, REDLINE_RUBRIC) - weighted(b.rubric, REDLINE_RUBRIC) >= 1.5, `${weighted(g.rubric, REDLINE_RUBRIC)} vs ${weighted(b.rubric, REDLINE_RUBRIC)}`);
  const s = fresh();
  const ctx = fakeCtx(s);
  const r = { clauses, customer: 'Acme' };
  const out = await redlineFeedback(ctx, r, good, note);
  assert.ok(hasRubric(ctx.calls[0].system, REDLINE_RUBRIC));
  assert.ok(out.rubric && out.dealProbability >= 0.05 && out.dealProbability <= 0.95);
  // live path blends the model estimate with the rubric
  const live = withRubric({ mock: false, data: { ...b, dealProbability: 0.9 } }, r, bad, 'ok', {});
  assert.ok(live.dealProbability < 0.9);
});

test('battlecard_review: rubric in prompt, normalized shape, specific fair card beats trash talk', async () => {
  strictSchema(PAGE_SCHEMA, ['rubric', 'trashTalk', 'feedback']);
  const s = fresh();
  const rival = { name: 'RivalCo', positioning: 'bookkeeping suite', priceMonthly: 99, freeTier: false };
  const good = 'RivalCo vs Ledgerly\n- Setup: RivalCo takes about 2 weeks; Ledgerly connects in 20 minutes.\n- Price: $99 vs $59 per month.\n- If you need payroll, choose RivalCo; they are the better fit there.\n- Ask the buyer: how many hours does reconciliation take now?\n' + 'Customer quote: "close dropped from 6 hours to 40 minutes" (Smile Dental, 2026). '.repeat(3);
  const bad = 'RivalCo is garbage, a scam and awful. We are better. '.repeat(20);
  const gh = normalizePage(pageHeuristic(good, rival.name, s.company.name));
  const bh = normalizePage(pageHeuristic(bad, rival.name, s.company.name));
  assert.ok(weighted(gh.rubric, PAGE_RUBRIC) - weighted(bh.rubric, PAGE_RUBRIC) >= 1);
  const ctx = fakeCtx(s);
  const j = await judgePage(ctx, { rival, kind: 'battlecard', title: 't', text: good });
  assert.ok(hasRubric(ctx.calls[0].system, PAGE_RUBRIC));
  assert.ok(j.results[0].rubric && j.score >= 0 && j.score <= 1);
});

test('demo_video_script: rubric in prompt, schema strict, specific script beats buzzword padding', async () => {
  strictSchema(DEMO_SCHEMA, ['rubric', 'notes']);
  strictSchema(DEMO_SCHEMA.properties.rubric, DEMO_RUBRIC.map((c) => c.key));
  const s = fresh();
  const good = 'Dental clinic owners spend six hours every month reconciling bank feeds by hand. Watch. I open Ledgerly, click Connect bank, select last month, then press Reconcile. Done in 40 minutes instead of six hours. Start your free trial at the link below.';
  const bad = 'Our revolutionary seamless all-in-one AI-powered platform empowers world-class synergy. '.repeat(8);
  const g = heuristicDemo(s, good), b = heuristicDemo(s, bad);
  assert.ok(g.rubric && b.rubric);
  assert.ok(weighted(g.rubric, DEMO_RUBRIC) - weighted(b.rubric, DEMO_RUBRIC) >= 1);
  assert.ok(scriptQuality(g, good) > scriptQuality(b, bad));
  const ctx = fakeCtx(s);
  const out = await judgeDemo(ctx, good);
  assert.ok(hasRubric(ctx.calls[0].system, DEMO_RUBRIC));
  for (const k of ['hook', 'problemFirst', 'showsProduct', 'outcome', 'cta', 'jargon']) assert.ok(Number.isFinite(out.judge[k]), k);
});

test('channels_reply: persona is told to cite a real reason from the proposal', async () => {
  const ctx = fakeCtx(fresh());
  await personaReply(ctx, { persona: 'Sam at a newsletter', situation: 'They proposed a swap.', decision: 'no, politely decline', fallback: () => ({ subject: '', body: '' }) });
  assert.match(ctx.calls[0].system, /ONE concrete thing/);
  assert.match(ctx.calls[0].system, /never invent/i);
});
