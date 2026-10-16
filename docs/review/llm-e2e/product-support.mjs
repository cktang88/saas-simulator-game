// Live end-to-end check of the product + customer-research + support LLM tasks (cluster "product-support").
// NOT part of npm test. Needs the local proxy (node server.js) on http://localhost:3000 with a key loaded.
//
//   node docs/review/llm-e2e/product-support.mjs              # everything (~4-6 min, a few cents)
//   node docs/review/llm-e2e/product-support.mjs --only=tags,spec
//
// Prints a pass/fail table and writes raw outputs to docs/review/llm-e2e/out/product-support.json.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as llm from '../../../public/core/llm.js';
import { newState } from '../../../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../../../public/core/stripe.js';
import { ensureMarket } from '../../../public/core/market.js';
import { seedDefaultStack, post } from '../../../public/core/bank.js';
import { productSlice, researchSlice } from '../../../public/apps/product/store.js';
import product, { gradeSpec } from '../../../public/apps/product.js';
import { createInterview, sendTurn, finishInterview, logReal } from '../../../public/apps/research.js';
import { classifyQuestion, classifyQuestionLive, intervieweeSystem, QUESTION_TAG_MIN_P } from '../../../public/apps/product/interview.js';
import helpdesk, { ensureSupport, gradeProcedure, gradeArticle, gradeReviewResponse } from '../../../public/apps/helpdesk.js';
import { responseQuality, qualityOf, PROCEDURE_CRITERIA } from '../../../public/apps/support/rubrics.js';
import { classifyRecord } from '../../../public/apps/automations/engine.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLY = (process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);

const usage = [];
llm.configure({ base: 'http://localhost:3000', onUsage: (u) => usage.push(u) });
if (!(await llm.checkServerKey()) || !llm.isLive()) { console.error('Proxy not live on :3000 (no server key).'); process.exit(1); }

const jevScores = (a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Math.round((v.score ?? NaN) * 100) / 100]));
// Recording wrapper: every ask/panel/decide result is kept for the raw dump and live checks.
const calls = [];
let LABEL = null; // strong / mediocre / gamed ... for the call being made (Jev agreement check)
const rec = {
  ...llm,
  ask: async (o) => { const r = await llm.ask(o); calls.push({ kind: 'ask', label: LABEL, task: o.task, mock: r.mock, error: r.error, jev: r.jev ? jevScores(r.jev) : null, data: r.data }); return r; },
  panel: async (o) => { const rs = await llm.panel(o); for (const r of rs) calls.push({ kind: 'panel', label: LABEL, task: o.task, mock: r.mock, error: r.error, jev: r.jev ? jevScores(r.jev) : null, data: r.data }); return rs; },
  decide: async (o) => { const r = await llm.decide(o); calls.push({ kind: 'decide', task: o.task, mock: r.mock, error: r.error, answers: r.answers }); return r; },
};
const ctxOf = (state) => ({ state, llm: rec, toast: () => {}, save() {}, render() {}, act: async (fn) => fn(state), enqueue() {}, navigate() {} });

const rows = [];
const out = {};
const row = (task, check, pass, detail = '') => { rows.push({ task, check, pass: pass === null ? 'info' : pass ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 160) }); };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const r2 = (x) => Math.round(x * 100) / 100;
const liveCheck = (task) => {
  const cs = calls.filter((c) => c.task === task || c.task === `${task}:rubric`);
  const mocks = cs.filter((c) => c.mock);
  row(task, 'live (mock=false, no errors)', cs.length > 0 && !mocks.length, `${cs.length} calls, ${mocks.length} mock${mocks[0]?.error ? `: ${mocks[0].error}` : ''}`);
};

// ---------------------------------------------------------------------------
// Two contrasting companies
// ---------------------------------------------------------------------------
function company(kind) {
  const ent = kind === 'comply';
  const s = newState({ companyName: ent ? 'Clausewise' : 'Ledgerline', model: ent ? 'ent' : 'smb', path: ent ? 'vc' : 'indie', founderName: 'Pat', seed: ent ? 77 : 41 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: ent ? 1500000 : 40000, counterparty: ent ? 'Seed round' : 'Pat', category: ent ? 'equity' : 'owner_contribution' });
  s.cache = null; // fresh samples every call
  s.day = 220;
  Object.assign(s.company, ent
    ? { oneLiner: 'Maps a fintech\'s AI models and vendors to EU AI Act and SOC 2 controls and collects the evidence auditors ask for', icp: 'Heads of compliance / GRC leads at 200-2,000 employee EU and US fintechs (lenders, payments, insurtech) with 3+ ML models in production and an audit in the next 12 months', domain: 'clausewise.ai' }
    : { oneLiner: 'Reconciles Shopify payouts, fees and refunds into QuickBooks Online automatically', icp: 'Solo Shopify sellers and their part-time bookkeepers doing $20k-$300k/month in sales who reconcile payouts in QuickBooks Online by hand', domain: 'ledgerline.app' });
  s.plans = ent
    ? [{ id: 'plan_team', name: 'Team', price: 24000, interval: 'year', trialDays: 0, active: true }]
    : [{ id: 'plan_pro', name: 'Pro', price: 39, interval: 'month', trialDays: 14, active: true }];
  const n = ent ? 6 : 30;
  for (let i = 0; i < n; i++) {
    const c = createCustomer(s, ent ? { name: ['Anna Keller', 'Joost de Vries', 'Maria Santos', 'Liam Byrne', 'Sofia Rossi', 'Daniel Weber'][i], email: `c${i}@fin${i}.eu`, company: ['Lendora', 'PayNord', 'Insurely', 'Credora', 'FinPilot', 'Kontor Bank'][i] } : { name: `Seller ${i} ${['Ng', 'Diaz', 'Okafor', 'Smith', 'Kim'][i % 5]}`, email: `s${i}@shop${i}.com`, company: `${['Willow', 'Brass', 'Fern', 'Salt', 'Juniper'][i % 5]} ${['Candles', 'Goods', 'Supply', 'Co', 'Studio'][i % 5]}` });
    subscribe(s, c.id, s.plans[0], { trial: false });
  }
  const p = productSlice(s);
  p.features = ent
    ? [
      { id: 'f1', title: 'Model inventory from MLflow', user: 'GRC lead', problem: 'x', solution: 'Connects to MLflow and SageMaker, lists every production model with owner, training data source and last retrain date', acceptance: ['Given x when y then z'], status: 'shipped', shippedDay: 120 },
      { id: 'f2', title: 'EU AI Act risk classification', user: 'GRC lead', problem: 'x', solution: 'Classifies each model against Annex III high-risk categories and flags credit-scoring models as high-risk with the article reference', acceptance: ['Given x when y then z'], status: 'shipped', shippedDay: 160 },
      { id: 'f3', title: 'SOC 2 evidence collector', user: 'GRC lead', problem: 'x', solution: 'Pulls access reviews and change tickets from Jira and Okta every week and attaches them to the matching SOC 2 control', acceptance: ['Given x when y then z'], status: 'shipped', shippedDay: 190 },
    ]
    : [
      { id: 'f1', title: 'Payout reconciliation to QuickBooks', user: 'Shopify seller', problem: 'x', solution: 'Splits each Shopify payout into gross sales, Shopify fees, refunds and chargebacks and posts a matching journal entry to QuickBooks Online', acceptance: ['Given x when y then z'], status: 'shipped', shippedDay: 90 },
      { id: 'f2', title: 'Unmatched deposit alerts', user: 'Shopify seller', problem: 'x', solution: 'Emails the seller when a bank deposit in QuickBooks has no matching Shopify payout after 3 days', acceptance: ['Given x when y then z'], status: 'shipped', shippedDay: 150 },
    ];
  p.bugs = [{ id: 'bug1', featureId: 'f1', title: ent ? 'Okta access-review export times out for orgs over 1,000 users' : 'Multi-currency payouts post fees in the wrong currency', hours: 6, progress: 0, severity: 'high', foundDay: 210, fixedDay: null }];
  return s;
}
const ledger = company('ledger');
const comply = company('comply');

// ---------------------------------------------------------------------------
// 1. feature_spec_grade
// ---------------------------------------------------------------------------
async function specs() {
  const s = ledger;
  const rs = researchSlice(s);
  rs.interviews = [1, 2, 3, 4, 5].map((i) => ({ id: `ivr${i}`, real: true, verified: true, status: 'done' }));
  rs.insights = [
    { id: 'ins1', real: true, verified: true, theme: 'Pain & triggers', text: '4 of 5 sellers I interviewed reconcile Shopify payouts by hand every Monday; median 2.5 h/week, one has a VA at $18/h for it' },
    { id: 'ins2', real: true, verified: true, theme: 'Current workaround', text: '"I export the payout CSV and match refunds line by line in a Google Sheet before I post to QuickBooks" (Dana, candles, $60k/mo)' },
    { id: 'ins3', real: true, verified: true, theme: 'Pain & triggers', text: 'Refunds that span two payouts are the #1 reason their QuickBooks balance is off at month-end (3 of 5)' },
    { id: 'ins4', real: false, theme: 'Feature requests', text: 'AI persona said they would love an AI dashboard' },
  ];
  const base = { id: 'x', status: 'draft' };
  const SPECS = {
    strong: {
      title: 'Split refunds that span two Shopify payouts', user: 'Solo Shopify seller doing $20k-$300k/mo who closes their own books in QuickBooks Online (or a part-time bookkeeper with 5-15 such clients)',
      problem: 'Every Monday, 4 of the 5 sellers I interviewed match payouts by hand (median 2.5 h/week). When a refund is issued in one payout and settled in the next, the QuickBooks deposit no longer matches; 3 of 5 said this is why their balance is off at month-end. Today they fix it line by line in a Google Sheet.',
      solution: 'When a payout arrives, Ledgerline looks up refunds whose original order settled in an earlier payout, posts the refund as a separate line in the journal entry dated to the refund day, and shows the seller a "split across payouts" badge with both payout IDs on the reconciliation screen.',
      acceptance: ['Given a refund of $40 issued on payout A for an order settled in payout B, when payout A syncs, then the QuickBooks journal entry for A contains a -$40 refund line dated the refund day and payout B is unchanged', 'Given the QuickBooks token has expired, when a payout syncs, then nothing is posted and the seller gets an email to reconnect within 1 hour', 'Given a partial refund with no matching order (deleted order), when it syncs, then it is posted to an "Unmatched refunds" account and flagged on screen'],
      metric: 'Share of weekly payouts that match the bank deposit with no manual edit, from 61% to 85% within 30 days of release, measured across active accounts', baseline: '61% of 412 payouts matched with no edit last month',
      nonGoals: 'Not in v1: multi-currency stores, PayPal payouts, Amazon. Risk: QuickBooks API rate limit (500/min) on big catch-up syncs; mitigate by batching.',
      evidence: ['ins1', 'ins2', 'ins3'],
    },
    mediocre: {
      title: 'Better refunds handling', user: 'Shopify store owners using QuickBooks',
      problem: 'Refunds are confusing for sellers every month and cause reconciliation problems in QuickBooks. Sellers spend time fixing things by hand.',
      solution: 'Show refunds clearly in the app and sync them to QuickBooks so the books are correct.',
      acceptance: ['Refunds should show in the list', 'Refunds should sync to QuickBooks correctly'],
      metric: 'Reduce refund-related support tickets by 30% within 60 days', baseline: 'currently 10 tickets a month',
      nonGoals: '', evidence: [],
    },
    gamed: {
      title: 'AI-powered reconciliation intelligence hub', user: 'Forward-thinking ecommerce entrepreneurs and modern finance teams (10-10,000 employees) who value accuracy',
      problem: 'According to 12 of 12 interviews, 100% of sellers lose 10+ hours every week and $5,000 per month because manual reconciliation in spreadsheets is painful, frustrating and broken, which is why they churn.',
      solution: 'A seamless, intuitive, AI-powered hub that syncs, matches, reconciles, flags, summarises, predicts, exports and reports every transaction, every payout, every refund and every fee in real time across Shopify, QuickBooks, Xero, Amazon, PayPal and Stripe, with a smart dashboard that shows insights and alerts.',
      acceptance: ['Given a seller, when they use the hub, then reconciliation is 100% accurate', 'Given any transaction, when it syncs, then it must be matched within 1 second', 'Given an error, then the AI fixes it automatically'],
      metric: 'Increase MRR by 300% and engagement (time in app) by 50% within 30 days', baseline: 'currently MRR is $1,170',
      nonGoals: 'None, v1 does everything.', evidence: ['ins4'],
      ai: { enabled: true, level: 'medium' },
    },
    // Passes every lint rule (structure, numbers, Given/When/Then, baseline, window) but says nothing specific.
    gamedLint: {
      title: 'Payout reconciliation accuracy improvement', user: 'Shopify sellers with 1-10,000 orders per month using QuickBooks, Xero or spreadsheets',
      problem: 'Every week sellers lose hours (5 of 5 interviews) reconciling payouts, refunds, fees, chargebacks, taxes and currencies by hand in spreadsheets, causing errors, late closes and churn.',
      solution: 'Ledgerline syncs, matches, reconciles, flags, categorizes, exports and reports payouts, refunds, fees, chargebacks, taxes and currencies to QuickBooks and Xero.',
      acceptance: ['Given a payout, when it syncs, then it must be reconciled correctly', 'Given an error, when it fails, then the user sees an error', 'Given a refund, when it syncs, then it should be matched'],
      metric: 'Reconciliation accuracy from 60% to 99% within 30 days', baseline: '60% today (estimate)',
      nonGoals: 'Nothing major.', evidence: ['ins4'],
    },
  };
  const res = {};
  for (const [k, spec] of Object.entries(SPECS)) {
    res[k] = [];
    for (let i = 0; i < 2; i++) {
      LABEL = k;
      const f = { ...base, id: `spec_${k}_${i}`, ...spec };
      p(s).features.push(f);
      await gradeSpec(ctxOf(s), f);
      res[k].push({ total: f.grade.total, pass: f.grade.pass, verdict: f.grade.verdict, instant: Boolean(f.grade.instant), scores: f.grade.scores, issues: f.grade.issues, source: f.grade.source, agentHours: f.grade.agentHours });
    }
  }
  out.feature_spec_grade = res;
  const t = (k) => mean(res[k].map((x) => x.total ?? 0));
  if (!res.strong[0].instant) liveCheck('feature_spec_grade');
  row('feature_spec_grade', 'strong spec passes', res.strong.every((x) => x.pass), `totals ${res.strong.map((x) => x.total)}`);
  row('feature_spec_grade', 'mediocre spec rejected', res.mediocre.every((x) => !x.pass), `${res.mediocre.map((x) => `${x.verdict}${x.instant ? '(lint)' : ''} ${x.total ?? '-'}`)}`);
  row('feature_spec_grade', 'gamed spec rejected', res.gamed.every((x) => !x.pass), `${res.gamed.map((x) => `${x.verdict}${x.instant ? '(lint)' : ''} ${x.total ?? '-'}`)}`);
  row('feature_spec_grade', 'order strong > mediocre > gamed (by 2+)', t('strong') - t('mediocre') >= 2 && t('mediocre') >= t('gamed'), `${r2(t('strong'))} / ${r2(t('mediocre'))} / ${r2(t('gamed'))}`);
  row('feature_spec_grade', 'lint-passing keyword spec reaches the LLM and is rejected', res.gamedLint.every((x) => !x.instant && !x.pass), res.gamedLint.map((x) => `${x.verdict} ${x.total} ${JSON.stringify(x.scores)}`).join(' | '));
  // A specific-looking spec for the WRONG customer (swap test, ICP) with no lint blockers: the LLM must do the work.
  const offIcp = { ...SPECS.strong, id: 'spec_off', title: 'TikTok post scheduler for creators', user: 'Fashion creators with 10k-100k TikTok followers who post 5+ times a week', problem: 'Creators in my DMs say they post manually every evening, about 40 minutes a day, and miss their best time slot when they are at work.', solution: 'Creators upload up to 7 videos, pick time slots, and Ledgerline posts each video to TikTok at the chosen time and sends a push notification when it is live.', acceptance: ['Given a video scheduled for 18:00, when it is 18:00, then it is posted and the creator gets a notification', 'Given an expired TikTok token, when a post is due, then it is not posted and the creator gets an email to reconnect', 'Given 8 uploads, then the 8th is rejected with a limit message'], metric: 'Share of scheduled posts published on time from 0% to 90% within 30 days', baseline: '0 posts today', nonGoals: 'Not in v1: Instagram, analytics.', evidence: [] };
  p(s).features.push(offIcp);
  await gradeSpec(ctxOf(s), offIcp);
  out.feature_spec_grade.offIcp = { total: offIcp.grade.total, pass: offIcp.grade.pass, scores: offIcp.grade.scores, issues: offIcp.grade.issues };
  row('feature_spec_grade', 'off-ICP spec (no evidence) scores below strong', (offIcp.grade.total ?? 0) < t('strong') - 2, `off-ICP ${offIcp.grade.total} pass=${offIcp.grade.pass}`);
  row('feature_spec_grade', 'off-ICP spec is flagged as off-ICP in feedback', (offIcp.grade.issues ?? []).some((i) => /icp|target customer|different customer/i.test(i)), (offIcp.grade.issues ?? []).join(' | '));
}
const p = productSlice;

// ---------------------------------------------------------------------------
// 2. feature_market_value
// ---------------------------------------------------------------------------
async function marketValue() {
  const s = ledger;
  const FEATS = {
    strong: { title: 'Automatic payout-to-QuickBooks journal entries', user: 'Shopify seller', problem: 'Sellers split every weekly payout into sales, fees and refunds by hand in a spreadsheet before posting to QuickBooks (2-3 h/week).', solution: 'Every time Shopify pays out, posts one journal entry to QuickBooks Online with gross sales, Shopify fees, refunds and chargebacks as separate lines and marks the bank deposit as matched.' },
    display: { title: 'Payouts dashboard', user: 'Shopify seller', problem: 'Sellers want to see their payouts.', solution: 'Shows a chart and a table of past Shopify payouts with totals per week.' },
    gamed: { title: 'Revolutionary AI-powered financial intelligence copilot', user: 'Shopify seller', problem: 'Sellers struggle with finance.', solution: 'A seamless, intuitive, AI-powered copilot that leverages cutting-edge large language models to deliver powerful, actionable, real-time financial insights and smart recommendations in a delightful chat interface.' },
    offIcp: { title: 'TikTok video scheduler', user: 'creators', problem: 'Creators post manually every evening.', solution: 'Uploads videos and posts each to TikTok at the chosen time, then sends a push notification.' },
  };
  const res = {};
  for (const [k, f0] of Object.entries(FEATS)) {
    res[k] = [];
    for (let i = 0; i < 2; i++) {
      LABEL = k;
      const f = { ...f0, id: `val_${k}_${i}`, status: 'shipped', shippedDay: 200, acceptance: [] };
      p(s).features.push(f);
      await product.jobs['product:value'](ctxOf(s), { featureId: f.id });
      res[k].push({ value: f.valueLLM, reason: f.valueReason });
      p(s).features = p(s).features.filter((x) => x.id !== f.id);
    }
  }
  out.feature_market_value = res;
  liveCheck('feature_market_value');
  const v = (k) => mean(res[k].map((x) => x.value ?? 0));
  row('feature_market_value', 'jev rubric answers present', calls.some((c) => c.task === 'feature_market_value' && c.jev), '');
  row('feature_market_value', 'strong > display, gamed, off-ICP (by 0.2+)', v('strong') - Math.max(v('display'), v('gamed'), v('offIcp')) >= 0.2, `strong ${r2(v('strong'))} display ${r2(v('display'))} gamed ${r2(v('gamed'))} offIcp ${r2(v('offIcp'))}`);
  row('feature_market_value', 'off-ICP feature low (<0.25)', v('offIcp') < 0.25, r2(v('offIcp')));
}

// ---------------------------------------------------------------------------
// 3. interview_question_tags (Jev) vs regex: labeled Mom Test questions incl. paraphrases
// ---------------------------------------------------------------------------
const QUESTIONS = [
  // [text, labels]
  ['Tell me about the last time you reconciled a Shopify payout.', ['good']],
  ['Walk me through what you did last Monday when the deposit did not match.', ['good']],
  ['What did that cost you, roughly, in hours or money?', ['good']],
  ['Who else gets involved when the books are off at month-end?', ['good']],
  ['What have you tried so far to fix it?', ['good']],
  ['Can you recall the most recent occasion this went wrong, and what happened next?', ['good']], // paraphrase, regex may miss
  ['Think back to your March close. What took the longest?', ['good']], // paraphrase
  ['Which tools are you paying for today to handle this?', ['good']],
  ["Wouldn't it be great if this just synced automatically?", ['leading', 'hypothetical']],
  ["That must be really frustrating, right?", ['leading']],
  ['I bet you hate doing this every week, huh?', ['leading']], // paraphrase
  ['Surely spending 3 hours a week on this is a waste for someone like you?', ['leading']],
  ['Would you use a tool that reconciled payouts for you?', ['hypothetical']],
  ['How much would you pay for something that fixed this?', ['hypothetical']],
  ['If a product did this end to end, would you switch?', ['hypothetical']],
  ['Picture a world where your books close themselves. Appealing?', ['hypothetical', 'leading']], // paraphrase
  ['Suppose next quarter you had an assistant for this, what would you have it do?', ['hypothetical']], // paraphrase
  ["We're building an app that posts payouts to QuickBooks automatically for $39 a month.", ['pitch']],
  ['Our tool splits fees and refunds for you. Want to see a demo?', ['pitch']],
  ['Ledgerline already handles multi-currency payouts out of the box, so you would never touch a spreadsheet.', ['pitch']], // paraphrase
  ['My thing reads your payout CSV and does the matching. Sound useful?', ['pitch']], // paraphrase
  ['Do you usually reconcile weekly or monthly?', ['generic']],
  ['How often do you deal with refunds in general?', ['generic']],
  ['What do you think about accounting software these days?', ['generic']],
  ['Is bookkeeping something you typically find hard?', ['generic']], // paraphrase-ish
  ['Could you introduce me to another seller who has this problem?', ['commitment']],
  ['Would you be up for a 2-week pilot on your real store starting Monday?', ['commitment']],
  ["If I send you an invoice for a $200 deposit today, will you pay it to reserve a spot?", ['commitment', 'hypothetical']],
  ['Can we book 30 minutes next Thursday so I can watch you do the March close?', ['commitment']],
  ['Mind pointing me to a couple of other store owners I should speak with?', ['commitment']], // paraphrase
  ['Thanks, that is really helpful.', []],
  ['Got it. And then?', []],
  ['How did you find that VA you mentioned?', ['good']],
  ['What happened the last time a chargeback hit?', ['good']],
  ['Do you ever get chargebacks?', ['generic']],
  ['You would agree that manual work like this is a waste of your time?', ['leading']],
];
const LABELS = ['leading', 'hypothetical', 'pitch', 'generic', 'good', 'commitment'];
async function questionTags() {
  const per = Object.fromEntries(LABELS.map((l) => [l, { jev: { tp: 0, fp: 0, fn: 0 }, regex: { tp: 0, fp: 0, fn: 0 } }]));
  const rowsQ = [];
  const regexMap = (t) => classifyQuestion(t).map((x) => (x === 'ask' ? 'commitment' : x));
  const results = await Promise.all(QUESTIONS.map(async ([text, gold]) => {
    const d = await rec.decide({ task: 'interview_question_tags_raw', state: { setting: 'A founder is running a Mom Test customer-discovery interview.', interviewee_last_said: 'Honestly it is mostly fine, payouts are a bit of a pain.', founder_latest_message: text }, questions: (await import('../../../public/apps/product/interview.js')).QUESTION_TAG_QUESTIONS, fallback: () => ({}) });
    const live = await classifyQuestionLive(rec, text, { previousReply: 'Honestly it is mostly fine, payouts are a bit of a pain.' });
    return { text, gold, probs: Object.fromEntries(LABELS.map((l) => [l, r2(d.answers?.[l]?.noul ?? NaN)])), jev: live.tags, regex: regexMap(text), mock: live.mock };
  }));
  for (const r of results) {
    for (const l of LABELS) for (const src of ['jev', 'regex']) {
      const got = r[src].includes(l), g = r.gold.includes(l);
      if (got && g) per[l][src].tp++; else if (got) per[l][src].fp++; else if (g) per[l][src].fn++;
    }
    rowsQ.push(r);
  }
  out.interview_question_tags = { threshold: QUESTION_TAG_MIN_P, per, questions: rowsQ };
  liveCheck('interview_question_tags');
  const pr = (c) => ({ p: c.tp + c.fp ? c.tp / (c.tp + c.fp) : 1, r: c.tp + c.fn ? c.tp / (c.tp + c.fn) : 1 });
  for (const l of LABELS) {
    const j = pr(per[l].jev), x = pr(per[l].regex);
    row('interview_question_tags', `${l}: Jev P/R vs regex P/R`, j.p >= 0.75 && j.r >= 0.6, `Jev ${r2(j.p)}/${r2(j.r)}  regex ${r2(x.p)}/${r2(x.r)}`);
  }
  const miss = rowsQ.filter((r) => r.gold.join() !== r.jev.slice().sort().join() && r.gold.slice().sort().join() !== r.jev.slice().sort().join());
  row('interview_question_tags', 'exact label-set matches', null, `${rowsQ.length - miss.length}/${rowsQ.length}`);
}

// ---------------------------------------------------------------------------
// 4. interview_persona + interview_chat + interview_grade
// ---------------------------------------------------------------------------
const SCRIPTS = {
  stellar: [
    'Thanks for making time. What does a normal week look like for you on the money side of the business?',
    'Tell me about the last time the numbers in your books did not line up.',
    'What did you do next to sort it out?',
    'How long did that take you, roughly?',
    'Are you paying for anything today to deal with this, a tool or a person?',
    'Who else is involved when you decide to change how this is done?',
    'What else is on your plate this quarter that matters more or less than this?',
    'This was really useful. Would you be open to me sitting in on your next month-end close, and could you introduce me to one other person who deals with this?',
  ],
  mediocre: [
    'Do you usually find the finance side hard?',
    'How often do you deal with this in general?',
    'Would you use a tool that automated it?',
    'How much would you pay for something like that?',
    'What do you think about the tools out there?',
    'Cool, keep in touch?',
  ],
  bad: [
    "We're building {PRODUCT}: {ONELINER}. Pretty cool, right?",
    "Don't you hate doing this by hand every week?",
    "Wouldn't it be great if it just happened automatically?",
    'It costs {PRICE}. Would you buy it?',
    'You would agree this is a big problem for you?',
    'So can I count you in as a customer?',
  ],
};
const fill = (t, s) => t.replace('{PRODUCT}', s.company.name).replace('{ONELINER}', s.company.oneLiner).replace('{PRICE}', `$${s.plans[0].price}/${s.plans[0].interval}`);
async function freshPersona(s, painReal) {
  for (let i = 0; i < 8; i++) {
    const iv = await createInterview(ctxOf(s), { source: 'ai' });
    if (painReal == null || iv.persona.facts.painReal === painReal) return iv;
    researchSlice(s).interviews.shift();
  }
  throw new Error('no persona with painReal=' + painReal);
}
const clone = (iv) => ({ ...JSON.parse(JSON.stringify(iv)), id: `${iv.id}_${Math.random().toString(36).slice(2, 6)}`, messages: iv.messages.slice(0, 1) });
async function runScript(s, base, name) {
  const iv = clone(base);
  researchSlice(s).interviews.unshift(iv);
  for (const q of SCRIPTS[name]) await sendTurn(ctxOf(s), iv, fill(q, s));
  await finishInterview(ctxOf(s), iv);
  const revealed = [...new Set(iv.messages.flatMap((m) => m.revealed ?? []))];
  const commitment = iv.messages.map((m) => m.commitment).filter((c) => c && c !== 'none');
  return { name, score: iv.grade.score, revealed, commitment, feedback: iv.grade.feedback, transcript: iv.messages.map((m) => `${m.from === 'me' ? 'F' : 'I'}: ${m.text}${m.tags ? `  [${m.tags.join(',')}]` : ''}${m.revealed?.length ? `  {${m.revealed.join(',')}}` : ''}${m.commitment && m.commitment !== 'none' ? `  <${m.commitment}>` : ''}`) };
}
async function interviews() {
  const res = { personas: [], scripts: {} };
  // Personas for both companies: facts fit the ICP; persona text never names the founder's product.
  for (const s of [ledger, comply]) {
    for (let i = 0; i < 2; i++) {
      const iv = await createInterview(ctxOf(s), { source: 'ai' });
      const sys = intervieweeSystem(iv.persona);
      const leaks = [s.company.name, s.company.domain, ...String(s.company.oneLiner).split(/\W+/).filter((w) => w.length > 8)].filter((w) => w && sys.toLowerCase().includes(w.toLowerCase()));
      res.personas.push({ company: s.company.name, persona: iv.persona, leaks });
    }
  }
  const fitQs = { fits: { type: 'noul', instructions: 'Does this interviewee (role, company and hidden facts) plausibly belong to the target customer profile?', criteria: { true: 'Their role, company type and size, and the problem facts match the target profile', false: 'They are a different kind of person, business or problem' } } };
  for (const r of res.personas) {
    const s = r.company === ledger.company.name ? ledger : comply;
    const d = await rec.decide({ task: 'persona_icp_check', state: { target_profile: s.company.icp, interviewee: { name: r.persona.name, role: r.persona.role, company: r.persona.company, context: r.persona.context, facts: Object.fromEntries(Object.entries(r.persona.facts).filter(([k]) => !k.startsWith('_') && !/Num$/.test(k))) } }, questions: fitQs, fallback: () => ({ fits: { noul: NaN } }) });
    r.icpFitP = r2(d.answers.fits?.noul);
  }
  liveCheck('interview_persona');
  row('interview_persona', 'personas fit the ICP (Jev P>=0.6)', res.personas.every((r) => r.icpFitP >= 0.6), res.personas.map((r) => `${r.persona.role} @ ${r.persona.company}: ${r.icpFitP}`).join(' | '));
  row('interview_persona', 'persona prompt does not leak the product', res.personas.every((r) => !r.leaks.length), res.personas.flatMap((r) => r.leaks).join(', ') || 'no leaks');

  // Does the interviewee know the product? Ask directly without pitching.
  const knowIv = clone(await freshPersona(ledger, null));
  await sendTurn(ctxOf(ledger), knowIv, `Have you heard of ${ledger.company.name}? What do you think of it?`);
  const knowReply = knowIv.messages.at(-1).text;
  res.knowsProduct = knowReply;
  row('interview_chat', 'interviewee does not know the product', !/(i use|we use|i love|great product|i've used|i have used|reconciles|quickbooks integration)/i.test(knowReply) || /never heard|not heard|haven't heard|no idea|don't know/i.test(knowReply), knowReply);

  const real = await freshPersona(ledger, true);
  for (const name of ['stellar', 'mediocre', 'bad']) { LABEL = name === 'stellar' ? 'strong' : name; res.scripts[name] = await runScript(ledger, real, name); }
  LABEL = null;
  // Same stellar script on a person for whom the pain is NOT real: no pilot/LOI/deposit.
  const notReal = await freshPersona(ledger, false);
  res.scripts.stellarNoPain = await runScript(ledger, notReal, 'stellar');
  // Enterprise ICP: stellar script on a compliance lead.
  const ent = await freshPersona(comply, true);
  res.scripts.stellarEnt = await runScript(comply, ent, 'stellar');
  res.personaFacts = { real: real.persona, notReal: notReal.persona, ent: ent.persona };
  out.interviews = res;
  liveCheck('interview_chat');
  liveCheck('interview_grade');
  const S = res.scripts;
  row('interview_chat', 'stellar reveals 3+ hidden facts, bad <=1', S.stellar.revealed.length >= 3 && S.bad.revealed.length <= 1, `stellar ${S.stellar.revealed.join(',')} | mediocre ${S.mediocre.revealed.join(',')} | bad ${S.bad.revealed.join(',')}`);
  row('interview_chat', 'stellar earns a commitment; bad earns none beyond followup', S.stellar.commitment.length > 0 && !S.bad.commitment.some((c) => ['pilot', 'loi', 'preorder'].includes(c)), `stellar ${S.stellar.commitment} | bad ${S.bad.commitment}`);
  row('interview_chat', 'no-pain persona gives no pilot/LOI/deposit', !S.stellarNoPain.commitment.some((c) => ['pilot', 'loi', 'preorder'].includes(c)), `${S.stellarNoPain.commitment} revealed ${S.stellarNoPain.revealed}`);
  row('interview_chat', 'enterprise persona reveals facts to stellar script', S.stellarEnt.revealed.length >= 3, S.stellarEnt.revealed.join(','));
  row('interview_grade', 'scores order stellar > mediocre > bad (by 10+)', S.stellar.score - S.mediocre.score >= 10 && S.mediocre.score >= S.bad.score, `${S.stellar.score} / ${S.mediocre.score} / ${S.bad.score}`);
  row('interview_grade', 'stellar >= 65, bad <= 35', S.stellar.score >= 65 && S.bad.score <= 35, `${S.stellar.score} / ${S.bad.score}`);
  row('interview_grade', 'jev rubric answers present', calls.some((c) => c.task === 'interview_grade' && c.jev), '');

  // Gamed transcript: Mom Test keywords glued onto pitches and hypotheticals (no live persona needed).
  const gamed = { id: 'iv_gamed', real: false, persona: real.persona, status: 'live', messages: [
    { from: 'them', text: 'Hi, what did you want to ask?' },
    { from: 'me', text: `Walk me through the last time you reconciled, and wouldn't ${ledger.company.name}, our app that does it automatically for $39, have saved you hours?` },
    { from: 'them', text: 'Maybe, I would have to see it.' },
    { from: 'me', text: 'Tell me about the last time you would have paid for a tool like ours, how much would you pay?' },
    { from: 'them', text: 'Hard to say. Depends on the price.' },
    { from: 'me', text: 'What did you do when you realized our AI could fix it? Who else would love it?' },
    { from: 'them', text: 'Sounds useful for someone.' },
    { from: 'me', text: 'Great, so you would definitely sign up, right?' },
    { from: 'them', text: 'Keep me posted.' },
  ] };
  researchSlice(ledger).interviews.unshift(gamed);
  for (const m of gamed.messages) if (m.from === 'me') m.tags = (await classifyQuestionLive(rec, m.text)).tags;
  await finishInterview(ctxOf(ledger), gamed);
  res.gamed = { score: gamed.grade.score, feedback: gamed.grade.feedback, tags: gamed.messages.filter((m) => m.from === 'me').map((m) => m.tags) };
  row('interview_grade', 'gamed (keywords + pitch) transcript <= 35', gamed.grade.score <= 35, `${gamed.grade.score}`);
}

// ---------------------------------------------------------------------------
// 5. interview_notes
// ---------------------------------------------------------------------------
async function notes() {
  const s = ledger;
  const NOTES = {
    strong: `Dana Ng, owner, Willow Candles (Shopify, ~$60k/mo). Last Monday (Oct 6) she spent 2h40m matching the Sep 29 payout: two refunds from orders settled in the previous payout made the QuickBooks deposit $83.20 short. She exported the payout CSV, matched line by line in a Google Sheet, then posted a manual journal entry. Quote: "Refunds that cross payouts are the whole reason I dread Mondays." She pays a VA $18/h for 3 h a month to double-check. Tried A2X in 2024, cancelled after 2 months ("it still needed me to fix refunds"). Her accountant (Mark, CPA) decides on tools over $50/mo. Compliments: she said "I'd totally use this" - not evidence, she said the same about A2X. Next step: she agreed to screen-share her Nov 3 close with me and intro me to Mark.`,
    mediocre: `Talked to Dana who runs a candle store on Shopify. She said reconciliation is a pain and takes a while every week. She uses spreadsheets and QuickBooks. She thinks our idea is great and would probably use it. She said she'd pay maybe 30 bucks. Seems like a good fit. Will follow up later.`,
    gamed: `Dana (CEO, Willow Candles) LOVED it!!! She said "I would definitely pay $500/month, this is the best idea ever, take my money". She spent 100 hours last week and lost $1,000,000 because of reconciliation. She tried every tool. She will sign an LOI and pre-order and intro me to 50 people. Pain: 10/10. Validated! Last time, spent, paid, tried, used, currently, workaround, cost, quote, verbatim.`,
  };
  const res = {};
  for (const [k, n] of Object.entries(NOTES)) {
    res[k] = [];
    LABEL = k;
    for (let i = 0; i < 2; i++) {
      const iv = await logReal(ctxOf(s), { name: 'Dana Ng', role: 'Owner', company: 'Willow Candles', channel: 'warm', notes: n, commitments: k === 'strong' ? ['followup', 'intro'] : k === 'gamed' ? ['loi', 'preorder', 'intro'] : [], email: 'dana@willow.com', transcript: '', bookingId: null });
      res[k].push({ score: iv.grade.score, issues: iv.grade.issues, source: iv.grade.source });
    }
  }
  out.interview_notes = res;
  liveCheck('interview_notes');
  const m = (k) => mean(res[k].map((x) => x.score));
  row('interview_notes', 'order strong > mediocre, gamed caught (by 15+)', m('strong') - Math.max(m('mediocre'), m('gamed')) >= 15, `${r2(m('strong'))} / ${r2(m('mediocre'))} / gamed ${r2(m('gamed'))}`);
  row('interview_notes', 'gamed notes <= 40', m('gamed') <= 40, r2(m('gamed')));
  row('interview_notes', 'jev rubric answers present', calls.some((c) => c.task === 'interview_notes' && c.jev), '');
}

// ---------------------------------------------------------------------------
// 6. support_ticket + support_reply
// ---------------------------------------------------------------------------
function enqueueTicket(s, category, extra = {}) {
  const sub = ensureStripe(s).subscriptions[0];
  return { customerId: sub.customerId, subId: sub.id, category, priority: 'normal', day: s.day, ...extra };
}
async function tickets() {
  const res = { tickets: [] };
  for (const s of [ledger, comply]) {
    const sup = ensureSupport(s);
    const feats = p(s).features.filter((f) => f.status === 'shipped');
    for (const [cat, extra] of [['bug', { topic: p(s).bugs[0].title, feature: feats[0].title }], ['billing', {}], ['howto', { feature: feats[1].title }], ['feature', { topic: null }], ['account', {}]]) {
      await helpdesk.jobs['support:ticket'](ctxOf(s), enqueueTicket(s, cat, extra));
      const t = sup.tickets[0];
      res.tickets.push({ company: s.company.name, plan: `$${s.plans[0].price}/${s.plans[0].interval}`, category: cat, subject: t.subject, body: t.messages[0].text, mock: t.mock });
    }
  }
  liveCheck('support_ticket');
  const prodWords = { Ledgerline: /(shopify|quickbooks|payout|refund|fee|deposit|journal|reconcil)/i, Clausewise: /(ai act|soc ?2|model|mlflow|sagemaker|okta|jira|evidence|control|audit|annex|risk)/i };
  const fits = res.tickets.filter((t) => prodWords[t.company].test(`${t.subject} ${t.body}`));
  row('support_ticket', 'tickets fit THIS product (domain words)', fits.length >= res.tickets.length - 1, `${fits.length}/${res.tickets.length}`);
  const billing = res.tickets.filter((t) => t.category === 'billing');
  const wrongAmount = billing.filter((t) => { const amts = [...`${t.subject} ${t.body}`.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, ''))); const plan = Number(t.plan.match(/\$(\d+)/)[1]); return amts.some((a) => a !== plan && a !== plan * 2 && a !== Math.round(plan / 12) && a !== plan / 12 * 2); });
  row('support_ticket', 'billing tickets quote amounts consistent with the plan', !wrongAmount.length, billing.map((t) => `${t.company} ${t.plan}: ${t.body.slice(0, 90)}`).join(' | '));

  // support_reply: the customer reacts to whether the reply solves THEIR issue.
  const s = ledger;
  const sup = ensureSupport(s);
  const mk = (category, subject, body, feature, topic = null) => {
    const sub = ensureStripe(s).subscriptions[1];
    const c = ensureStripe(s).customers.find((x) => x.id === sub.customerId);
    const t = { id: `tkt_${category}_${Math.random().toString(36).slice(2, 7)}`, customerId: c.id, subId: sub.id, name: c.name, company: c.company, email: c.email, category, priority: 'high', subject, createdDay: s.day - 1, status: 'open', firstResponseDay: s.day, messages: [{ from: 'them', text: body, day: s.day - 1 }], csat: null, channel: 'email', feature, topic };
    sup.tickets.unshift(t);
    return t;
  };
  const CASES = {
    billing: {
      subject: 'Charged twice this month', body: 'I was charged $39 twice on Oct 3 for Ledgerline Pro, card ending 4242. Please refund the duplicate.',
      replies: {
        strong: 'Hi, you are right: our billing retried after a timeout and charged your card ending 4242 twice on Oct 3. I have refunded the duplicate $39 just now (refund ID re_93KD). It shows on your statement in 5-10 business days. I also fixed the retry setting so it cannot happen again. Sorry about that. Pat',
        mediocre: 'Hi, thanks for reaching out! We are looking into this and will get back to you soon. Best, the Ledgerline team',
        gamed: 'Hi there!! Thank you SO much for reaching out, we truly value you as a customer and we deeply apologise for any inconvenience this may have caused. Customer satisfaction is our number one priority and our team is fully committed to providing an exceptional experience. We have escalated this to our dedicated billing specialists who will review your account with the utmost care. Rest assured we take every concern seriously. Thanks again for being part of the Ledgerline family!',
        wrongIssue: 'Hi! Great question. To change your plan, go to Settings > Billing > Change plan, pick the plan you want and click Confirm. Your new price applies from the next billing date. Let me know if you need anything else. Pat',
      },
    },
    bug: {
      subject: 'Fees posted in wrong currency', body: 'My CAD payouts from Oct 6 and Oct 13 posted the Shopify fees to QuickBooks in USD, so my books are off by about $60. I need this fixed before my accountant closes October on the 5th.',
      feature: 'Payout reconciliation to QuickBooks',
      replies: {
        strong: 'Hi, thanks for the exact dates, that made it easy to reproduce. Multi-currency payouts are posting fees in USD; it is a bug on our side. Today I manually corrected the Oct 6 and Oct 13 journal entries in your QuickBooks to CAD (fees $41.20 and $18.75), so your October books are right now. The code fix ships by Oct 24; until then I will check your new CAD payouts by hand every Monday and email you when the fix is live. Pat',
        mediocre: 'Hi, sorry about that. Can you try disconnecting and reconnecting QuickBooks and see if it works? Thanks',
        gamed: 'Hi! We are so sorry for the frustration and we hear you. We have fixed the issue and everything should now be working perfectly. Our world-class engineering team has deployed a robust, seamless solution so this will never happen again. Thank you for your patience and for being an amazing customer!',
        wrongIssue: 'Hi, to export your payouts to CSV open Payouts, choose the date range and click Export. The file includes gross sales, fees and refunds per payout. Hope this helps! Pat',
      },
    },
  };
  res.replies = {};
  for (const [cat, c] of Object.entries(CASES)) {
    res.replies[cat] = {};
    for (const [k, text] of Object.entries(c.replies)) {
      res.replies[cat][k] = [];
      LABEL = k;
      for (let i = 0; i < 2; i++) {
        const t = mk(cat, c.subject, c.body, c.feature ?? null, cat === 'bug' ? p(s).bugs[0].title : null);
        t.messages.push({ from: 'me', text, day: s.day });
        await helpdesk.jobs['support:reply'](ctxOf(s), { ticketId: t.id });
        res.replies[cat][k].push({ satisfaction: r2(t.satisfaction), status: t.status, csat: t.csat, reply: t.messages.at(-1).text });
      }
    }
  }
  // Ground truth: the same "fixed, please retry" reply while the bug is still open vs after it was really fixed.
  const claim = 'Hi, thanks for flagging this. We found the cause: multi-currency payouts posted fees in USD. The fix is live as of this morning and I re-posted your Oct 6 and Oct 13 entries in CAD. Could you check QuickBooks and confirm they now match? Pat';
  res.truth = {};
  for (const state of ['open', 'fixed']) {
    p(s).bugs[0].fixedDay = state === 'fixed' ? s.day : null;
    res.truth[state] = [];
    LABEL = null;
    for (let i = 0; i < 2; i++) {
      const t = mk('bug', CASES.bug.subject, CASES.bug.body, CASES.bug.feature, p(s).bugs[0].title);
      t.messages.push({ from: 'me', text: claim, day: s.day });
      await helpdesk.jobs['support:reply'](ctxOf(s), { ticketId: t.id });
      res.truth[state].push({ satisfaction: r2(t.satisfaction), status: t.status, reply: t.messages.at(-1).text });
    }
  }
  p(s).bugs[0].fixedDay = null;
  out.support = res;
  const tm = (k) => mean(res.truth[k].map((x) => x.satisfaction));
  row('support_reply', '"it is fixed" claim: satisfied only if really fixed', tm('fixed') - tm('open') >= 0.3 && res.truth.open.every((x) => x.status !== 'solved'), `fixed ${r2(tm('fixed'))} (${res.truth.fixed.map((x) => x.status[0]).join('')}) vs still-broken ${r2(tm('open'))} (${res.truth.open.map((x) => x.status[0]).join('')})`);
  liveCheck('support_reply');
  row('support_reply', 'jev rubric answers present', calls.some((c) => c.task === 'support_reply' && c.jev), '');
  for (const cat of Object.keys(CASES)) {
    const R = res.replies[cat];
    const sm = (k) => mean(R[k].map((x) => x.satisfaction));
    row('support_reply', `${cat}: strong > mediocre, gamed, wrong-issue (by 0.25+)`, sm('strong') - Math.max(sm('mediocre'), sm('gamed'), sm('wrongIssue')) >= 0.25, `strong ${r2(sm('strong'))} mediocre ${r2(sm('mediocre'))} gamed ${r2(sm('gamed'))} wrong ${r2(sm('wrongIssue'))}`);
    row('support_reply', `${cat}: only strong is solved`, R.strong.every((x) => x.status === 'solved') && ['mediocre', 'gamed', 'wrongIssue'].every((k) => R[k].every((x) => x.status !== 'solved')), Object.entries(R).map(([k, v]) => `${k}:${v.map((x) => x.status[0]).join('')}`).join(' '));
  }
}

// ---------------------------------------------------------------------------
// 7. customer_review
// ---------------------------------------------------------------------------
async function reviews() {
  const res = [];
  for (const s of [ledger, comply]) {
    const sup = ensureSupport(s);
    for (const rating of [1, 3, 5]) {
      const r = { id: `rev_${s.company.name}_${rating}`, platform: s.company.model === 'ent' ? 'G2' : 'Shopify App Store', rating, day: s.day, title: '', text: '' };
      sup.reviews.unshift(r);
      await helpdesk.jobs['support:review'](ctxOf(s), { reviewId: r.id });
      res.push({ company: s.company.name, plan: `$${s.plans[0].price}/${s.plans[0].interval}`, rating, title: r.title, text: r.text, mock: r.mock });
    }
  }
  out.customer_review = res;
  liveCheck('customer_review');
  const prodWords = { Ledgerline: /(shopify|quickbooks|payout|refund|fee|deposit|journal|reconcil)/i, Clausewise: /(ai act|soc ?2|model|mlflow|sagemaker|okta|jira|evidence|control|audit|annex|risk)/i };
  row('customer_review', 'reviews name THIS product\'s real jobs', res.filter((r) => prodWords[r.company].test(`${r.title} ${r.text}`)).length >= res.length - 1, res.map((r) => `${r.company[0]}${r.rating}★ ${r.title}`).join(' | '));
  const neg = /(cancel|leaving|switch|refund|broke|wrong|lost|never)/i;
  row('customer_review', '1-star reviews name a failure, 5-star no complaint', res.filter((r) => r.rating === 1).every((r) => neg.test(r.text)), '');
  const amt = res.filter((r) => /\$\s?\d/.test(r.text)).map((r) => `${r.company} ${r.plan}: ${r.text.match(/\$\s?[\d,.]+[^.]{0,20}/)[0]}`);
  row('customer_review', 'prices mentioned (check vs plan)', null, amt.join(' | ') || 'none mention a price');
}

// ---------------------------------------------------------------------------
// 8. support_procedure_grade, help_article_grade, review_response_grade
// ---------------------------------------------------------------------------
async function supportGraders() {
  const s = ledger;
  const PROCS = {
    strong: { intent: 'refund', connector: 'payments', whenNot: 'Do not use for annual plans, chargebacks or disputes, accounts with more than 2 refunds in 12 months, or anyone who asks for a human. Tell them a person will reply within 1 business day.', steps: 'Look up the customer in Stripe by their login email and read plan type, last charge date and amount.\nIf the plan is monthly and the last charge is within 14 days and under $100, refund the last charge in full and tell the customer the refund ID and that it arrives in 5-10 business days.\nOtherwise, if the charge is 15-30 days old, offer a credit of the same amount on the next invoice instead of a refund.\nOtherwise hand off to the founder with the customer email, plan, charge date, amount and what the customer asked for.\nIf the customer mentions a dispute, chargeback or their bank, hand off immediately with the conversation and do not refund.' },
    mediocre: { intent: 'refund', connector: 'payments', whenNot: 'Complicated cases.', steps: 'Be friendly and apologise.\nCheck if the customer is eligible for a refund based on our policy.\nRefund them if appropriate.\nEscalate if needed.' },
    gamed: { intent: 'refund', connector: 'payments', whenNot: 'when not to use: exceptions exceptions exceptions, disputes, chargebacks, annual, angry.', steps: 'IF refund THEN refund OTHERWISE handoff escalate human dispute chargeback 14 days $100 policy.\nIF refund THEN refund OTHERWISE handoff escalate human dispute chargeback 14 days $100 policy.\nIF refund THEN refund OTHERWISE handoff escalate human dispute chargeback 14 days $100 policy.\nLook up look up look up Stripe Stripe Stripe connector data plan amount date.\nAlways be concrete, specific, and follow best practices for refunds with conditions, branches and handoffs.' },
  };
  const ARTS = {
    strong: { title: 'Why doesn\'t my QuickBooks deposit match my Shopify payout?', body: 'This happens when a refund or chargeback in one payout belongs to an order from an earlier payout.\n\nBefore you start: you need QuickBooks Online admin access and Ledgerline connected (Settings > Integrations).\n\n1. In Ledgerline, open Payouts and click the payout with the red "Unmatched" badge.\n2. Check the Refunds and Chargebacks lines. Each shows the original order number.\n3. Click "Post to QuickBooks" again. Ledgerline posts the journal entry with fees, refunds and chargebacks as separate lines.\n4. In QuickBooks, open Banking > For review. The deposit now shows "1 match found". Click Match.\n\nIf it still does not match after 3 days, Ledgerline emails you an Unmatched deposit alert with the difference. Reply to that email and we will check it with you.\n\nNot covered yet: multi-currency stores (fees may post in USD; we are fixing this).' },
    mediocre: { title: 'Payouts', body: 'Ledgerline helps you with payouts. Payouts are synced to QuickBooks. If something is wrong with your payouts, please check your settings and try syncing again. If you still have problems, contact support and we will help you as soon as possible.' },
    gamed: { title: 'How do I use the AI Forecasting Copilot to automatically fix every reconciliation issue?', body: 'Our powerful, seamless AI Forecasting Copilot fixes everything automatically.\n\n1. Open the AI Copilot tab.\n2. Click "Auto-fix all".\n3. Click "Predict next quarter cash flow".\n4. Open the Xero and Amazon sync panel and click Sync.\n5. Open the Payroll tab and approve.\n6. Click "Generate tax return".\n7. Done! Everything is reconciled with 100% accuracy.\n\nBefore you start: make sure you are logged in. If it fails, troubleshoot by trying again. Contact support@ledgerline.app if needed.' },
  };
  const review = { id: 'rev_bad', rating: 1, platform: 'Shopify App Store', title: 'Books off every month', text: 'Fees from my CAD payouts keep posting in USD and nobody answered my ticket for 4 days. Cancelling.' };
  ensureSupport(s).reviews.unshift(review);
  const RESP = {
    strong: 'You are right, and I am sorry. Multi-currency payouts were posting fees in USD; that was our bug, and taking 4 days to answer you was on us too. The fix shipped on Oct 21, and I have corrected the affected October entries for accounts that were hit. If yours still look off, email me at pat@ledgerline.app and I will fix them with you. Pat, founder',
    mediocre: 'We are sorry to hear about your experience. We value all feedback and are always working to improve our product. Please contact our support team so we can look into this.',
    gamed: 'This is not accurate. Our records show you never configured multi-currency correctly, which is clearly stated in our docs. We answer every ticket. If you remove or update this review we will give you 3 months free. Otherwise we may consider this review defamatory.',
  };
  const res = { procedure: {}, article: {}, response: {} };
  for (const [k, d] of Object.entries(PROCS)) { LABEL = k; res.procedure[k] = []; for (let i = 0; i < 2; i++) { const rs = await gradeProcedure(rec, s, d); res.procedure[k].push({ q: r2(mean(rs.map((r) => qualityOf(r.data, PROCEDURE_CRITERIA)))), data: rs[0].data }); } }
  for (const [k, a] of Object.entries(ARTS)) { LABEL = k; res.article[k] = []; for (let i = 0; i < 2; i++) { const { res: rs, q } = await gradeArticle(rec, s, a); res.article[k].push({ q: r2(q), data: rs[0].data }); } }
  for (const [k, text] of Object.entries(RESP)) { LABEL = k; res.response[k] = []; for (let i = 0; i < 2; i++) { const r = await gradeReviewResponse(rec, s, review, text); res.response[k].push({ q: r2(responseQuality(r.data)), data: r.data }); } }
  out.support_graders = res;
  const chk = (task, kind) => {
    liveCheck(task);
    row(task, 'jev rubric answers present', calls.some((c) => c.task === task && c.jev), '');
    const m = (k) => mean(res[kind][k].map((x) => x.q));
    row(task, 'order strong > mediocre > gamed or gamed caught (by 0.2+)', m('strong') - Math.max(m('mediocre'), m('gamed')) >= 0.2, `${r2(m('strong'))} / ${r2(m('mediocre'))} / gamed ${r2(m('gamed'))}`);
    row(task, 'strong >= 0.7, gamed <= 0.35', m('strong') >= 0.7 && m('gamed') <= 0.35, `${r2(m('strong'))} / ${r2(m('gamed'))}`);
  };
  chk('support_procedure_grade', 'procedure');
  chk('help_article_grade', 'article');
  chk('review_response_grade', 'response');
}

// ---------------------------------------------------------------------------
// 9. automations classifyRecord (Jev choice)
// ---------------------------------------------------------------------------
async function classify() {
  const TICKETS = [
    ['I was charged $39 twice this month, please refund one.', 'billing', true],
    ['Can I get an invoice with our VAT number on it?', 'billing', true],
    ['The payout sync throws "Error 500" since this morning and nothing posts to QuickBooks.', 'bug', true],
    ['Refund lines are posting to the wrong account after the last update.', 'bug', true],
    ['How do I connect a second Shopify store?', 'howto', true],
    ['Where do I change which QuickBooks account fees go to?', 'howto', true],
    ['Could you add support for Amazon payouts? We sell there too.', 'feature', true],
    ['My bookkeeper never got the invite email, how do I resend it?', 'account', true],
    ["The whole app won't load for anyone on our team right now, is it down?", 'outage', true],
    ['It says my card was declined but the sync also stopped working, what is going on?', null, false], // ambiguous billing vs bug
  ];
  const LEADS = [
    ['Signup: Dana Ng, owner of Willow Candles (Shopify, ~$60k/mo), uses QuickBooks Online, "I reconcile payouts by hand every Monday".', 'strong_fit', true],
    ['Signup: Mark Lee, CPA, bookkeeper for 12 Shopify stores in QuickBooks.', 'strong_fit', true],
    ['Signup: test test, test@mailinator.com', 'junk', true],
    ['Signup: "We offer premium SEO backlinks and guest posts, 50% off", seo-pro-links.biz', 'junk', true],
    ['Signup: Jane Park, AP manager at a 4,000-employee manufacturing company using SAP, no ecommerce.', 'poor_fit', true],
    ['Signup: student at a university, "doing a class project on accounting software".', 'poor_fit', true],
    ['Signup: Sam, Shopify store doing about $8k/month, books in a spreadsheet, thinking about moving to QuickBooks Online.', 'possible_fit', true],
    ['Signup: Lena, bookkeeper; "a few ecommerce clients", platforms not given.', 'possible_fit', true],
    ['Signup: Ravi, runs a WooCommerce store, considering moving to Shopify, uses Xero.', null, false], // ambiguous: possible or poor
    ['Signup: Priya, ops at a 30-person DTC brand on Shopify Plus, $2M/month, NetSuite.', null, false], // ambiguous: Shopify but off-size/off-ledger
  ];
  const res = { tickets: [], leads: [] };
  for (const [text, gold, clear] of TICKETS) { const c = await classifyRecord(ctxOf(ledger), 'support_ticket', text); res.tickets.push({ text, gold, clear, label: c.label, conf: r2(c.confidence ?? NaN), mock: c.mock }); }
  for (const [text, gold, clear] of LEADS) { const c = await classifyRecord(ctxOf(ledger), 'new_signup', text); res.leads.push({ text, gold, clear, label: c.label, conf: r2(c.confidence ?? NaN), mock: c.mock }); }
  out.automation_classify = res;
  liveCheck('automation_classify');
  for (const k of ['tickets', 'leads']) {
    const clear = res[k].filter((x) => x.clear);
    const acc = clear.filter((x) => x.label === x.gold).length / clear.length;
    row('automation_classify', `${k}: accuracy on clear cases >= 0.8`, acc >= 0.8, `${r2(acc)} wrong: ${clear.filter((x) => x.label !== x.gold).map((x) => `${x.gold}->${x.label}`).join(', ') || 'none'}`);
    const amb = res[k].filter((x) => !x.clear);
    row('automation_classify', `${k}: ambiguous cases less confident than clear`, mean(amb.map((x) => x.conf)) < mean(clear.map((x) => x.conf)), `clear ${r2(mean(clear.map((x) => x.conf)))} ambiguous ${r2(mean(amb.map((x) => x.conf)))}`);
  }
}

// ---------------------------------------------------------------------------
const STEPS = { tags: questionTags, spec: specs, value: marketValue, interview: interviews, notes, tickets, reviews, graders: supportGraders, classify };
const t0 = Date.now();
for (const [k, fn] of Object.entries(STEPS)) {
  if (!want(k)) continue;
  try { await fn(); } catch (e) { row(k, 'step crashed', false, e.stack?.split('\n').slice(0, 2).join(' ')); }
}
// Jev agreement: Jev's own criterion scores (before blending) must also put strong above every weaker label.
for (const task of [...new Set(calls.filter((c) => c.jev && c.label).map((c) => c.task))]) {
  const by = {};
  for (const c of calls.filter((x) => x.task === task && x.jev && x.label)) (by[c.label] ??= []).push(mean(Object.values(c.jev).filter(Number.isFinite)));
  const m = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, r2(mean(v))]));
  const weaker = Object.entries(m).filter(([k]) => k !== 'strong');
  if (m.strong != null && weaker.length) row(task, 'Jev alone: strong above weaker labels', weaker.every(([, v]) => m.strong > v), JSON.stringify(m));
}
const usd = usage.reduce((a, u) => a + (u.usd ?? 0), 0);
console.log('\n' + rows.map((r) => `${r.pass.padEnd(4)}  ${r.task.padEnd(24)} ${r.check.padEnd(58)} ${r.detail}`).join('\n'));
console.log(`\n${rows.filter((r) => r.pass === 'PASS').length} pass, ${rows.filter((r) => r.pass === 'FAIL').length} fail · ${usage.filter((u) => !u.mock).length} live calls, ${usage.filter((u) => u.mock).length} mock · $${usd.toFixed(4)} · ${Math.round((Date.now() - t0) / 1000)}s`);
mkdirSync(join(HERE, 'out'), { recursive: true });
writeFileSync(join(HERE, 'out', `product-support${ONLY.length ? `.${ONLY.join('-')}` : ''}.json`), JSON.stringify({ rows, out, usd, calls: calls.map((c) => ({ ...c, data: undefined })) }, null, 1));
