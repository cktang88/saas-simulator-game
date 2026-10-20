import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { drainJobs, registerJob } from '../public/core/jobs.js';
import { addMessage } from '../public/core/mail.js';
import { ensureCalendar } from '../public/core/calendar.js';
import * as llm from '../public/core/llm.js';
import { APPS } from '../public/apps/registry.js';
import { lintSpec, heuristicGrade, combineGrades, heuristicAgentHours, isThinWrapper } from '../public/apps/product/spec.js';
import { applyBuildHours, speedMultiplier, makeBugs, monthlyInference, toEffortHours } from '../public/apps/product/build.js';
import { aggregatePanel, heuristicTrial, cancelCategory, heuristicReplyQuality } from '../public/apps/product/panel.js';
import { classifyQuestion, gradeTranscript, fallbackReply, makeFacts, extractFromNotes } from '../public/apps/product/interview.js';
import product, { build, queueFeature, founderBuildLeftToday } from '../public/apps/product.js';
import customers from '../public/apps/customers.js';
import { productSlice, customersSlice } from '../public/apps/product/store.js';
import { throughputFactor } from '../public/apps/product/agent.js';

const GOOD = {
  id: 'f_good',
  title: 'Receipt requests by SMS for month-end close',
  user: 'Solo bookkeepers managing 10–30 small-business clients in QuickBooks Online',
  problem: 'At month-end close, 6 of 9 bookkeepers I interviewed spend 2–3 hours chasing missing receipts by email; today they track missing items in a spreadsheet and send reminders manually.',
  solution: 'Each client gets an SMS link to snap a photo of a receipt; the app attaches it to the matching QuickBooks bank transaction and flags unmatched ones for the bookkeeper.',
  acceptance: [
    'Given a client opens the SMS link, when they upload a photo, then it is attached to the transaction with the same amount within 1 minute.',
    'If no transaction matches, the receipt is listed under Unmatched and the bookkeeper is notified.',
    'If the QuickBooks token has expired, the bookkeeper gets an email to reconnect and no receipts are lost.',
  ],
  metric: 'Receipts matched before close rises to 75% within 30 days for accounts that enable it',
  baseline: '40% today across 3 pilot accounts',
  nonGoals: 'OCR of line items; Xero support',
  ai: { enabled: false, level: 'light' },
};
const BAD = { title: 'Add a killer AI feature to increase session length by 50%', user: 'users', problem: '', solution: 'AI-powered', acceptance: [], metric: 'increase session length by 50%', baseline: '' };

function fresh(model = 'smb') {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat', seed: 7 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 30000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Receipt collection for bookkeepers';
  s.company.icp = 'Solo bookkeepers with 10–30 small-business clients in QuickBooks';
  return s;
}

test('genericity blocker: "killer feature that increases session length by 50%" is blocked', () => {
  const lint = lintSpec(BAD);
  const rules = lint.blockers.map((b) => b.rule);
  for (const r of ['buzzword', 'vanity', 'baseline', 'user', 'acceptance', 'length']) assert.ok(rules.includes(r), `missing ${r}: ${rules}`);
  const g = combineGrades([heuristicGrade(BAD)], lint);
  assert.equal(g.pass, false);
  assert.equal(g.verdict, 'generic');
});

test('blocker catches problem-as-solution, vague AC and missing window', () => {
  const f = { ...GOOD, problem: 'Users need a dashboard so they can see their receipts in one place every month.', acceptance: ['It works well'], metric: 'Receipts matched 75%', baseline: '40%' };
  const rules = lintSpec(f).blockers.map((b) => b.rule);
  assert.ok(rules.includes('problem-as-solution'));
  assert.ok(rules.includes('acceptance'));
  assert.ok(rules.includes('window'));
});

test('a specific spec passes the blocker and the fallback grader', () => {
  const lint = lintSpec(GOOD);
  assert.deepEqual(lint.blockers, [], JSON.stringify(lint.blockers));
  assert.ok(lint.words >= 60 && lint.words <= 300, `${lint.words} words`);
  const g = combineGrades([heuristicGrade(GOOD)], lint);
  assert.ok(g.pass, JSON.stringify(g));
  assert.ok(g.total >= 12);
});

test('real interview evidence raises the evidence score; synthetic does not', () => {
  const real = [{ id: 'i1', real: true, theme: 'Pain', text: 'x' }, { id: 'i2', real: true, theme: 'Pain', text: 'y' }];
  const synth = real.map((i) => ({ ...i, real: false }));
  const plain = { ...GOOD, problem: 'At month-end close bookkeepers chase missing receipts by email for hours; they track them in a spreadsheet.' };
  assert.ok(heuristicGrade(plain, { insights: real }).evidence > heuristicGrade(plain, { insights: synth }).evidence);
  assert.equal(heuristicGrade(plain, { insights: synth }).evidence, heuristicGrade(plain).evidence);
});

test('effort heuristic scales with criteria and complexity keywords', () => {
  const simple = heuristicAgentHours({ ...GOOD, solution: 'Show a list of receipts sorted by date for the bookkeeper.', acceptance: ['Shows receipts'] });
  const hard = heuristicAgentHours({ ...GOOD, solution: GOOD.solution + ' Supports SSO, offline mode, multi-tenant workspaces and Stripe payments.' });
  assert.ok(hard > simple * 2, `${simple} vs ${hard}`);
  assert.equal(isThinWrapper({ ...GOOD, ai: { enabled: true, level: 'light' } }), false); // QuickBooks integration = moat
  assert.equal(isThinWrapper({ title: 'Rewrite text', solution: 'Paste text and get a rewrite.', ai: { enabled: true, level: 'light' } }), true);
});

test('speed: AI multiplier from People, slowed by bug debt and exhaustion', () => {
  assert.equal(speedMultiplier({ aiMult: 1 }), 1);
  assert.equal(speedMultiplier({ aiMult: 2 }), 2);
  assert.ok(speedMultiplier({ aiMult: 2, debt: 0.5 }) < 2);
  assert.ok(speedMultiplier({ aiMult: 2, energy: 10 }) < 2);
});

test('build progress respects capacity and queue order; bugs come first by share', () => {
  const slice = { features: [{ id: 'a', title: 'A', status: 'queued', effortHours: 10, progressHours: 0 }, { id: 'b', title: 'B', status: 'queued', effortHours: 10, progressHours: 0 }], buildQueue: ['a', 'b'], bugs: [{ id: 'x', hours: 4, progress: 0, severity: 'high', foundDay: 0 }] };
  let r = applyBuildHours(slice, 6, { bugShare: 0, day: 1 });
  assert.equal(slice.features[0].progressHours, 6);
  assert.equal(slice.features[0].status, 'building');
  assert.equal(slice.features[1].progressHours, 0);
  assert.equal(r.shipped.length, 0);
  r = applyBuildHours(slice, 10, { bugShare: 0.2, day: 2 }); // 2 h bugs, 8 h features
  assert.equal(slice.bugs[0].progress, 2);
  assert.equal(slice.features[0].status, 'shipped');
  assert.equal(slice.features[0].shippedDay, 2);
  assert.equal(slice.features[1].progressHours, 4);
  assert.deepEqual(slice.buildQueue, ['b']);
});

test('team dev hours build over days in onDay and shipping creates bugs + changelog', () => {
  const s = fresh();
  s.apps.people = { members: [{ id: 'm', role: 'engineer', kind: 'employee', status: 'active', hoursPerWeek: 40, startDay: -100, morale: 100 }] };
  const sl = productSlice(s);
  sl.features.push({ ...GOOD, acceptanceText: GOOD.acceptance.join('\n'), status: 'queued', effortHours: toEffortHours(10), progressHours: 0, evidence: [] });
  sl.buildQueue.push(GOOD.id);
  advance(s, 1, [product]);
  const f = sl.features[0];
  assert.ok(f.progressHours > 4 && f.progressHours < 40 / 7 * 2.3, `progress ${f.progressHours}`);
  advance(s, 10, [product]);
  assert.equal(f.status, 'building', 'code done, but SMS (A2P 10DLC) and the QuickBooks listing gate going live');
  assert.ok(f.awaiting && f.awaiting.untilDay > s.day);
  advance(s, 22, [product]);
  assert.equal(f.status, 'shipped');
  assert.ok(sl.changelog.length === 1);
  assert.ok(sl.bugs.length >= 1);
});

test('founder build session without a coding agent is slower', () => {
  const s = fresh();
  const mk = () => ({ id: 'z', title: 'Z', status: 'queued', effortHours: 100, progressHours: 0 });
  productSlice(s).features.push(mk()); productSlice(s).buildQueue.push('z');
  build(s, 4, { founder: true, bugShare: 0 });
  const withAgent = productSlice(s).features[0].progressHours;
  s.recurring.forEach((r) => { r.active = false; });
  productSlice(s).features[0].progressHours = 0;
  productSlice(s).buildDay = null; // new day
  build(s, 4, { founder: true, bugShare: 0 });
  // Without an agent only the review/test overhead of the workflow applies (product/agent.js throughputFactor).
  assert.ok(Math.abs(productSlice(s).features[0].progressHours - 4 * throughputFactor(productSlice(s).agent.workflow, { agent: false })) < 1e-6);
  assert.ok(withAgent > productSlice(s).features[0].progressHours * 1.5);
  assert.ok(withAgent >= 7.9, `${withAgent}`);
});

test('AI features charge monthly inference that scales with active accounts', () => {
  const feats = [{ status: 'shipped', ai: { enabled: true, level: 'moderate' } }];
  assert.equal(monthlyInference(feats, 'smb', 10), 3 * 3 * 10);
  const s = fresh();
  productSlice(s).features.push({ ...GOOD, status: 'shipped', shippedDay: 0, effortHours: 10, ai: { enabled: true, level: 'heavy' } });
  for (let i = 0; i < 5; i++) { const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com` }); subscribe(s, c.id, { id: 'p', price: 200, interval: 'month', trialDays: 0 }); }
  advance(s, 31, [product]);
  const inf = s.bank.txns.filter((t) => t.category === 'ai_inference');
  assert.ok(inf.length >= 1 && inf[0].amount < -100, JSON.stringify(inf));
});

test('bugs: makeBugs is deterministic and sized by rework share', () => {
  let x = 0.3; const rand = () => (x = (x * 9301 + 49297) % 233280 / 233280);
  const bugs = makeBugs(rand, { id: 'f', title: 'T', effortHours: 100 }, { day: 3 });
  const h = bugs.reduce((a, b) => a + b.hours, 0);
  assert.ok(h > 5 && h < 40, `${h}`);
});

test('customer panel aggregation produces fit, WTP and must-haves', () => {
  const s = fresh();
  const feats = [{ ...GOOD, grade: { total: 16 } }];
  const res = [0, 1, 2].map((i) => heuristicTrial(s, { id: `p${i}`, role: 'a bookkeeper', context: s.company.icp }, feats, { refPrice: 79, priceMonthly: 49 }));
  const agg = aggregatePanel(res, 49);
  assert.ok(agg.score > 0 && agg.score <= 1);
  assert.ok(agg.usefulShare > 0.5, JSON.stringify(res.map((r) => r.featureVerdicts)));
  const bad = aggregatePanel([{ activated: false, wouldPay: false, featureVerdicts: [{ feature: 'x', verdict: 'irrelevant' }], churnRisk: 0.9, willingnessToPayMonthly: 0, missingMustHaves: ['Integrations'] }], 49);
  assert.ok(bad.score < agg.score);
  assert.equal(bad.mustHaves[0].text, 'Integrations');
});

test('cancel categories and reply quality heuristics', () => {
  let i = 0; const rand = () => [0.1, 0.5, 0.9][i++ % 3];
  assert.equal(cancelCategory(rand, { reason: 'felt_ignored' }), 'felt_ignored');
  assert.ok(heuristicReplyQuality('Sorry about that! I fixed the timezone bug this morning, it is live now. Could you check whether your Friday report looks right? If not, reply and I will look at it today.', 'bug') >= 0.6);
  assert.ok(heuristicReplyQuality('We value your feedback.', 'bug') < 0.4);
});

test('interview question classifier follows the Mom Test rubric', () => {
  assert.ok(classifyQuestion("Wouldn't it be great if receipts matched themselves?").includes('leading'));
  assert.ok(classifyQuestion('Would you pay $50 a month for this?').includes('hypothetical'));
  assert.ok(classifyQuestion("We're building an AI tool that matches receipts").includes('pitch'));
  assert.ok(classifyQuestion('Tell me about the last time you closed the books.').includes('good'));
  assert.ok(classifyQuestion('Do you usually do this on weekends?').includes('generic'));
});

test('good interview beats a pitchy one; fallback persona reveals facts only for past-specific questions', () => {
  let x = 0.1; const rand = () => (x = (x * 7 + 0.13) % 1);
  const persona = { name: 'Dana', facts: { ...makeFacts(rand, { model: 'smb' }), painReal: true, spendNum: 200 } };
  const run = (qs) => {
    const msgs = [];
    for (const q of qs) {
      const r = fallbackReply(persona, msgs, q);
      msgs.push({ from: 'me', text: q, tags: classifyQuestion(q) });
      msgs.push({ from: 'them', text: r.reply, revealed: r.revealed, commitment: r.commitment });
    }
    return gradeTranscript(msgs, persona);
  };
  const good = run(['Tell me about the last time you closed the books.', 'What do you use today to track receipts?', 'What does that cost you each month?', 'Who else is involved in deciding on tools?', 'Could you intro me to another bookkeeper who deals with this?']);
  const bad = run(["We're building an AI tool that matches receipts automatically, it's amazing and saves hours.", 'Would you use it?', "Wouldn't it be great to never chase receipts again?", 'How much would you pay for it?']);
  assert.ok(good.score >= 65, `good ${good.score}`);
  assert.ok(bad.score < 35, `bad ${bad.score}`);
  assert.ok(good.pastSpecifics.length >= 3);
  assert.deepEqual(good.commitments, ['intro']);
  assert.equal(bad.pastSpecifics.length, 0);
});

test('real-notes extraction keeps specifics and flags compliments', () => {
  const r = extractFromNotes('Last month she spent 6 hours chasing receipts. She uses a Google Sheet with 40 rows. She said she would love an app like this. Paid a VA $300/month to help.', ['intro']);
  assert.ok(r.insights.length >= 3);
  assert.ok(r.issues.some((i) => /compliment/.test(i)));
  assert.ok(r.insights.some((i) => i.type === 'commitment'));
});

test('onboarding calls are booked on the calendar; unattended ones hurt the trial', () => {
  const s = fresh();
  productSlice(s).features.push({ ...GOOD, status: 'shipped', shippedDay: 0, effortHours: 10 });
  ensureMarket(s).onboarding = 'concierge';
  for (let i = 0; i < 12; i++) { const c = createCustomer(s, { name: `T${i}`, email: `t${i}@x.com` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 14 }); }
  advance(s, 1, APPS);
  const recs = customersSlice(s).onboarding;
  assert.ok(recs.length >= 4, `${recs.length} booked`);
  assert.ok(ensureCalendar(s).events.some((e) => e.app === 'customers' && e.refId === recs[0].id));
  advance(s, 8, APPS);
  const noShows = customersSlice(s).onboarding.filter((r) => r.status === 'no-show');
  assert.ok(noShows.length >= 1);
  const sub = s.stripe.subscriptions.find((x) => x.id === noShows[0].subId);
  assert.ok(sub.forceConvert != null && sub.forceConvert < 0.5);
});

test('customer feedback emails arrive and reply:customer answers in character offline', async () => {
  const s = fresh();
  productSlice(s).features.push({ ...GOOD, status: 'shipped', shippedDay: 0, effortHours: 10 });
  for (const app of APPS) for (const [type, h] of Object.entries(app.jobs ?? {})) registerJob(type, h);
  for (let i = 0; i < 60; i++) { const c = createCustomer(s, { name: `C ${i}`, email: `c${i}@x.com` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 }); }
  advance(s, 25, [customers]);
  const ctx = { state: s, llm, save() {}, render() {} };
  await drainJobs(ctx);
  const items = customersSlice(s).feedback;
  assert.ok(items.length >= 1, 'some customer wrote in');
  const it = items[0];
  const t = s.mail.threads.find((x) => x.id === it.threadId);
  assert.equal(t.kind, 'customer');
  addMessage(s, t.id, { from: 'me', body: 'Sorry about that! I fixed it this morning and it is live now. Could you check your account today and tell me if anything still looks off?' });
  s.jobs.push({ id: 'j', type: 'reply:customer', payload: { threadId: t.id, refId: t.refId }, status: 'pending', attempts: 0 });
  await drainJobs(ctx);
  assert.equal(t.messages.at(-1).from, 'them');
  assert.ok(['resolved', 'replied'].includes(it.status));
});

// ---- Competition (Market app's knownCompetitors) ----
import { switchTargets, pickSwitchTarget, incumbentAlternative } from '../public/apps/product/panel.js';
import { knownCompetitors } from '../public/apps/marketworld/competitors.js';

const REAL = (s) => {
  s.apps.world = { competitors: { list: [
    { id: 'rc_a', name: 'Dext', url: 'https://dext.com', marketShare: 0.3, awareness: 0.6, momentum: 'flat', priceMonthlyUSD: 30, pricingText: '$30/mo', freeTier: false, strengths: [], weaknesses: [] },
    { id: 'rc_b', name: 'Hubdoc', url: 'https://hubdoc.com', marketShare: 0.15, awareness: 0.4, momentum: 'declining', priceMonthlyUSD: 0, pricingText: 'free with Xero', freeTier: true, strengths: [], weaknesses: [] },
    { id: 'rc_c', name: 'TinyRival', url: 'https://tiny.io', marketShare: 0.005, awareness: 0.02, momentum: 'rising', strengths: [], weaknesses: [] },
  ], statusQuo: 'spreadsheets and email', statusQuoShare: 0.4 } };
};

test('competition: churners only switch to competitors with meaningful share', () => {
  const s = fresh(); REAL(s);
  const t = switchTargets(s.apps.world.competitors.list);
  assert.deepEqual(t.map((x) => x.name), ['Dext', 'Hubdoc']);
  let i = 0; const rand = () => [0.1, 0.9][i++ % 2];
  assert.ok(['Dext', 'Hubdoc'].includes(pickSwitchTarget(rand, t)));
  assert.equal(pickSwitchTarget(rand, []), null);
});

test('competition: panelists who already use a cheaper tool pay less and name the parity gap', () => {
  const s = fresh(); REAL(s);
  const feats = [{ ...GOOD, grade: { total: 16 } }];
  const p = { id: 'icp0', role: 'a bookkeeper', context: s.company.icp };
  const known = [{ competitor: s.apps.world.competitors.list[0], relation: 'uses' }];
  const none = heuristicTrial(s, p, feats, { refPrice: 79, priceMonthly: 49 });
  const withAlt = heuristicTrial(s, p, feats, { refPrice: 79, priceMonthly: 49, known });
  assert.ok(withAlt.willingnessToPayMonthly < none.willingnessToPayMonthly);
  assert.match(withAlt.vsAlternative, /Dext/);
  assert.ok(withAlt.missingMustHaves.some((m) => /Dext/.test(m)) || withAlt.missingMustHaves.length === 2);
  assert.equal(none.vsAlternative, 'none');
  assert.equal(incumbentAlternative(known).name, 'Dext');
});

test('competition: knownCompetitors is deterministic per persona seed', () => {
  const s = fresh(); REAL(s);
  const a = knownCompetitors(s, { audience: 'prospect', seed: 'iv_1' });
  const b = knownCompetitors(s, { audience: 'prospect', seed: 'iv_1' });
  assert.deepEqual(a.map((k) => k.competitor.name), b.map((k) => k.competitor.name));
});

test('competition: interview personas use a real alternative as their workaround (consistent ground truth)', async () => {
  const { createInterview } = await import('../public/apps/research.js');
  const s = fresh(); REAL(s);
  const ctx = { state: s, llm };
  let found = 0;
  for (let i = 0; i < 6; i++) {
    const iv = await createInterview(ctx, { source: 'icp', channel: 'community' });
    const uses = iv.knows.find((k) => k.relation === 'uses');
    if (uses) { found++; assert.ok(iv.persona.facts.workaround.includes(uses.name), iv.persona.facts.workaround); }
  }
  assert.ok(found >= 2, `${found} personas use a known alternative`);
});

// ---- Realism review fixes (docs/review/product-support-life.md) ----
import { trueFit, heuristicValue } from '../public/apps/product/fit.js';
import { notesProblem } from '../public/apps/research.js';
import { gatesFor, FOUNDATION_AGENT_HOURS } from '../public/apps/product/build.js';

test('P1/P2: true fit comes from what was shipped; display-only and irrelevant features add little', () => {
  const icp = 'Solo bookkeepers with 10–30 small-business clients in QuickBooks';
  const good = { ...GOOD, status: 'shipped', grade: { total: 16 } };
  const display = { ...GOOD, id: 'd', status: 'shipped', solution: 'Shows a list of receipts the bookkeeper typed in by hand for each client.' };
  const dental = { ...GOOD, id: 'x', status: 'shipped', user: 'Dentists with 2 chairs', problem: 'Dentists forget to order gloves every month and run out.', solution: 'Sends a reorder email to the supplier when gloves run low.' };
  assert.ok(heuristicValue(good, { icp }) > 2 * heuristicValue(display, { icp }), `${heuristicValue(good, { icp })} vs ${heuristicValue(display, { icp })}`);
  assert.ok(heuristicValue(good, { icp }) > 2 * heuristicValue(dental, { icp }));
  const one = trueFit([good], { icp });
  assert.ok(one > 0.15 && one < 0.4, `${one}`);
  assert.ok(trueFit([good, { ...good, id: 'g2' }, { ...good, id: 'g3' }], { icp }) > one);
  assert.ok(trueFit([good], { icp, bugHours: 90 }) < one);
});

test('P3/P4: gaming patterns are caught; claimed interviews must be logged', () => {
  const stuffed = { ...GOOD, solution: 'It syncs, exports, imports, matches, flags, sends, generates, notifies, tracks and reports everything automatically.' };
  assert.ok(!combineGrades([heuristicGrade(stuffed)], lintSpec(stuffed)).pass);
  const lorem = { ...GOOD, user: 'Lorem ipsum dolor sit amet 12' };
  assert.ok(lintSpec(lorem).blockers.some((b) => b.rule === 'placeholder'));
  const lack = { ...GOOD, problem: 'Bookkeepers lack an automated receipt matching tool, so at month-end they waste 2–3 hours in spreadsheets.' };
  assert.ok(lintSpec(lack).blockers.some((b) => b.rule === 'problem-as-solution'));
  const claim = { ...GOOD, problem: 'At month-end close, 47 of 50 bookkeepers I interviewed spend 2–3 hours chasing receipts; today they use spreadsheets.' };
  assert.ok(lintSpec(claim, { realInterviews: 2 }).blockers.some((b) => b.rule === 'evidence-claim'));
  assert.equal(heuristicGrade(GOOD, { insights: [{ real: false }, { real: false }] }).evidence, 0);
  assert.equal(heuristicGrade(GOOD, { insights: [{ real: true, verified: true }, { real: true, verified: true }] }).evidence, 4);
  assert.equal(heuristicGrade(GOOD, { insights: [{ real: true }, { real: true }] }).evidence, 2); // self-reported counts half
  assert.ok(notesProblem('She liked it a lot and would buy it.'));
  assert.equal(notesProblem('Last month she spent 6 hours chasing 40 receipts by email. She pays a VA $300 a month and tried Dext but cancelled after 2 weeks because the QuickBooks matching missed half of the transactions. Her biggest client threatened to leave over a late close in March.'), null);
});

test('P6: non-goals add no effort; regulated and mobile work is expensive', () => {
  const base = heuristicAgentHours(GOOD);
  assert.equal(heuristicAgentHours({ ...GOOD, nonGoals: 'OCR, offline mode, iOS app, HIPAA' }), base);
  assert.ok(heuristicAgentHours({ ...GOOD, solution: 'Native iOS and Android app with offline capture of receipts.' }) >= 140);
  assert.ok(heuristicAgentHours({ ...GOOD, solution: 'HIPAA-compliant patient intake with SAML SSO for clinics.' }) >= 120);
});

test('P5: MVP foundation comes before the first ship; approvals gate going live', () => {
  const s = fresh();
  const sl = productSlice(s);
  const f = { ...GOOD, acceptanceText: GOOD.acceptance.join('\n'), status: 'draft', grade: { pass: true, agentHours: 5 }, evidence: [] };
  sl.features.push(f);
  queueFeature(s, f);
  assert.ok(sl.foundation && !sl.foundation.done);
  build(s, 4, { founder: true, bugShare: 0 });
  assert.equal(f.progressHours ?? 0, 0, 'features wait for the foundation');
  assert.ok(FOUNDATION_AGENT_HOURS >= 25);
  assert.ok(gatesFor('Client gets an SMS link').length === 1);
  assert.ok(gatesFor('Connects to Gmail to read receipts')[0].days[1] >= 50);
});

test('B2: founder coding is capped per day with a focus penalty', () => {
  const s = fresh();
  const sl = productSlice(s);
  sl.features.push({ id: 'z', title: 'Z', status: 'queued', effortHours: 500, progressHours: 0 });
  sl.buildQueue.push('z');
  build(s, 10, { founder: true, bugShare: 0 });
  const p10 = sl.features[0].progressHours;
  assert.ok(p10 < 10 * 2.0 * throughputFactor(sl.agent.workflow) - 1, `${p10} (hours beyond 6 run at 0.85)`);
  assert.equal(founderBuildLeftToday(s), 0);
});

test('fundraising slows founder build velocity to ×0.6', async () => {
  const { velocity, RAISE_FOCUS } = await import('../public/apps/product.js');
  const s = fresh();
  const v = velocity(s, { founder: true });
  s.apps.fundraising = { ...(s.apps.fundraising ?? {}), raise: { status: 'active' } };
  assert.ok(Math.abs(velocity(s, { founder: true }) - v * RAISE_FOCUS) < 1e-9);
  assert.equal(velocity(s), velocity(s, { founder: false }), 'team velocity unaffected');
});

test('regression: queue ETAs include the unfinished MVP foundation that is built first', async () => {
  const { queueEta, newFoundation } = await import('../public/apps/product/build.js');
  const slice = { foundation: newFoundation(), buildQueue: ['a'], features: [{ id: 'a', effortHours: 20, progressHours: 0, status: 'queued' }] };
  const rest = slice.foundation.effortHours;
  assert.equal(queueEta(slice, 10)[0].days, Math.ceil((rest + 20) / 10));
  slice.foundation.done = true;
  assert.equal(queueEta(slice, 10)[0].days, 2);
});
