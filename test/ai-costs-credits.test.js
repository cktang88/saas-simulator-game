// AI cost management (coding spend + in-product inference), startup credits and perks, and spec autofill.
// Short targeted checks: one system each, no multi-year runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post, totalCash } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, mrr } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { APPS } from '../public/apps/registry.js';
import { readOperator } from '../public/core/operator.js';
import { productSlice, researchSlice, newFeature } from '../public/apps/product/store.js';
import { lintSpec, heuristicGrade, combineGrades } from '../public/apps/product/spec.js';
import { project } from '../public/apps/money/forecast.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';
import { SEAT_PLANS, CODING_USAGE } from '../public/data/ai-costs.js';
import {
  requestCost, inferenceModel, marginPicture, setFeature, runEval, setFreeTier, setLimits, setBudget, setPricing, setRouting,
  migrateDeprecation, applyQualityEffects, featureCfg, qualityDeficit, inferenceMonthEnd, inferenceDay,
} from '../public/apps/aicost/inference.js';
import { usageEq, codingMonthEnd, codingPicture, setCodingPolicy, auditCoding, rightSizeAll, bestSeat } from '../public/apps/aicost/coding.js';
import { aiSlice, perksSlice } from '../public/apps/aicost/model.js';
import {
  eligibility, applyToProgram, creditsDay, cliffSchedule, planCliff, totalBalance, creditsLedger, grossSpend, adoptTool, setFootprint, moveCloud,
} from '../public/apps/aicost/credits.js';
import { autofillSpec, gatherEvidence, draftFromEvidence, capAutofillGrade, isUneditedAutofill, AUTOFILL_CAP } from '../public/apps/aicost/autofill.js';
import { aiEvents } from '../public/apps/aicost/index.js';
import { TRIGGERS } from '../public/apps/automations/model.js';

function fresh({ model = 'smb', seed = 7, cash = 80000 } = {}) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: cash, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Receipt collection for bookkeepers';
  s.company.icp = 'Solo bookkeepers with 10–30 small-business clients in QuickBooks';
  return s;
}
const customers = (s, n, price = 49) => { for (let i = 0; i < n; i++) { const c = createCustomer(s, { name: `C${i}`, email: `c${i}@x.com` }); subscribe(s, c.id, { id: 'p', price, interval: 'month', trialDays: 0 }); } };
const shipAi = (s, level = 'moderate', extra = {}) => { const f = { ...newFeature(s), id: `f_ai_${productSlice(s).features.length}`, title: 'AI assistant', status: 'shipped', shippedDay: 0, ai: { enabled: true, level }, ...extra }; productSlice(s).features.push(f); return f; };
const engineers = (s, n) => { s.apps.people = { members: Array.from({ length: n }, (_, i) => ({ id: `eng${i}`, name: `Eng ${i}`, role: 'engineer', kind: 'employee', status: 'active' })) }; };
const mistakeIds = (s, fn) => (s.mistakes ?? []).filter((m) => !fn || m.functionId === fn).map((m) => m.id);
const mod = (s, kind, key) => s.market.modifiers[kind][key];

// ---------------------------------------------------------------------------------------------------------
// In-product inference
// ---------------------------------------------------------------------------------------------------------

test('per-user inference cost math: tokens x price, caching and batch', () => {
  // chat on the mid tier: 3,000 in at $2/M + 600 out at $10/M
  assert.ok(Math.abs(requestCost('chat', 'mid') - (3000 * 2 + 600 * 10) / 1e6) < 1e-9);
  // agent task on the frontier tier: 300k in at $5/M + 8k out at $25/M = $1.70
  assert.ok(Math.abs(requestCost('agent', 'frontier') - 1.7) < 1e-9);
  // prompt caching: cache reads ~10% of input, 90% hit rate, 1.25x on the misses
  const cached = requestCost('agent', 'frontier', { cache: 'prompt' });
  assert.ok(cached < requestCost('agent', 'frontier') * 0.45 && cached > requestCost('agent', 'frontier') * 0.3, `${cached}`);
  assert.ok(requestCost('chat', 'mid', { cache: 'aggressive' }) < requestCost('chat', 'mid', { cache: 'prompt' }));
  // batch: 50% off the async share (extraction is fully async; chat is not batchable)
  assert.ok(Math.abs(requestCost('extract', 'mid', { batch: true }) - requestCost('extract', 'mid') / 2) < 1e-9);
  assert.equal(requestCost('chat', 'mid', { batch: true }), requestCost('chat', 'mid'));
  // tier order
  assert.ok(requestCost('rag', 'frontier') > requestCost('rag', 'mid') && requestCost('rag', 'mid') > requestCost('rag', 'small'));
  // the model: accounts x users x requests x cost per request (smb = 3 users per account)
  const s = fresh();
  customers(s, 10);
  shipAi(s, 'moderate'); // chat on mid, 200 requests per user per month
  const m = inferenceModel(s);
  assert.ok(Math.abs(m.total - 10 * 3 * 200 * requestCost('chat', 'mid')) < 0.01, `${m.total}`);
  assert.ok(Math.abs(m.perActiveUser - 200 * requestCost('chat', 'mid')) < 0.01);
});

test('inference posts monthly as COGS and heavy AI drops gross margin versus light AI', () => {
  const run = (level) => {
    const s = fresh();
    customers(s, 12, 49);
    shipAi(s, level);
    advance(s, 35, APPS);
    const tx = s.bank.txns.filter((t) => t.category === 'ai_inference');
    assert.ok(tx.length >= 1, 'a monthly ai_inference bill posted');
    const bill = -tx[0].amount;
    return { bill, share: bill / mrr(s), gm: 1 - bill / mrr(s), s };
  };
  const light = run('light'), mod_ = run('moderate'), heavy = run('heavy');
  assert.ok(light.bill < mod_.bill && mod_.bill < heavy.bill);
  assert.ok(light.gm > 0.9, `light AI barely moves margin: ${light.gm}`);
  assert.ok(mod_.gm < 0.9 && mod_.gm > 0.6, `moderate assistant: gm ${mod_.gm}`);
  assert.ok(heavy.gm < 0.3, `heavy agentic on a $49 plan crushes margin: ${heavy.gm}`);
  // classic SaaS 75-80% vs AI-native 45-60%: a moderate assistant on a priced plan lands in between
  assert.ok(heavy.s.apps.product.inferenceMonth > 0);
});

test('unlimited AI on a flat cheap plan puts heavy users under water; a cap or pass-through fixes it and the mistake is logged', () => {
  const s = fresh();
  customers(s, 40, 29);
  shipAi(s, 'heavy');
  const before = marginPicture(s);
  assert.ok(before.underwaterLoss > 0, `${before.underwaterLoss}`);
  advance(s, 35, APPS);
  assert.ok(mistakeIds(s, 'ai_cost_management').includes('negative_margin_ai_users'));
  const m = (s.mistakes ?? []).find((x) => x.id === 'negative_margin_ai_users');
  assert.ok(m.cost.usd > 0 && m.delayed);
  // a per-user fair-use cap shrinks the loss; credits shift it to the customer
  const capped = fresh(); customers(capped, 40, 29); shipAi(capped, 'heavy'); setLimits(capped, { perUserMult: 1.5 });
  assert.ok(marginPicture(capped).underwaterLoss < before.underwaterLoss);
  const credits = fresh(); customers(credits, 40, 29); shipAi(credits, 'heavy'); setPricing(credits, { mode: 'credits', includedUsd: 5 });
  advance(credits, 35, APPS);
  assert.ok((credits.apps.aicost.inf.passRevenue ?? 0) > 0, 'overage billed through Stripe');
  assert.ok(!mistakeIds(credits, 'ai_cost_management').includes('negative_margin_ai_users'));
});

test('rate limits and verification cap free-tier abuse', () => {
  const mk = () => { const s = fresh(); customers(s, 20, 49); shipAi(s, 'moderate'); setFreeTier(s, { enabled: true }); return s; };
  const open = inferenceModel(mk());
  assert.ok(open.freeUsers > 0 && open.bots > 0);
  const capped = mk(); setFreeTier(capped, { capReqs: 40 });
  const guarded = mk(); setFreeTier(guarded, { capReqs: 40, abuseGuard: true, model: 'small' });
  const mc = inferenceModel(capped), mg = inferenceModel(guarded);
  assert.ok(mc.bots < open.bots * 0.3, `cap: ${mc.bots} vs ${open.bots}`);
  assert.ok(mg.bots < mc.bots * 0.5, `guard + small model: ${mg.bots} vs ${mc.bots}`);
  assert.ok(open.bots > 0.25 * open.total, 'uncapped scripted accounts dominate the free tier cost');
  // the uncapped tier is a logged mistake when the bill lands
  const s = mk();
  advance(s, 35, APPS);
  assert.ok(mistakeIds(s, 'ai_cost_management').includes('free_tier_abuse'));
});

test('model swap without evals loses quality, churns customers and is logged; evals first avoid the hit', () => {
  const mk = () => { const s = fresh(); customers(s, 15, 99); const f = shipAi(s, 'heavy'); applyQualityEffects(s); return { s, f }; };
  // without evals: frontier -> small on agent tasks
  const a = mk();
  assert.equal(mod(a.s, 'churn', 'ai-quality'), undefined);
  const r = setFeature(a.s, a.f.id, { model: 'small' });
  assert.ok(r.dq < -0.3 && !r.evaled);
  assert.ok(mod(a.s, 'churn', 'ai-quality') > 1.3, `churn x${mod(a.s, 'churn', 'ai-quality')}`);
  assert.ok(mod(a.s, 'conversion', 'ai-quality') < 0.8);
  assert.ok(mistakeIds(a.s, 'ai_cost_management').includes('model_swap_without_evals'));
  assert.ok(inferenceModel(a.s).total < inferenceModel(mk().s).total / 5, 'the swap really is far cheaper');
  // with evals: the regression shows up before the switch and the player does not make it
  const b = mk();
  const ev = runEval(b.s, b.f.id, { model: 'small' });
  assert.equal(ev.pass, false);
  assert.ok(ev.ratio < 0.7);
  assert.equal(mod(b.s, 'churn', 'ai-quality'), undefined);
  assert.deepEqual(mistakeIds(b.s, 'ai_cost_management'), []);
  // a swap that holds up is fine with evals, and cheaper
  const c = fresh(); customers(c, 15, 99); const fc = shipAi(c, 'moderate');
  c.apps.aicost = undefined; // fresh slice
  featureCfg(c, fc).model = 'frontier'; featureCfg(c, fc).baseQ = 1;
  const ev2 = runEval(c, fc.id, { model: 'mid' });
  assert.equal(ev2.pass, true, `${ev2.ratio}`);
  const before = inferenceModel(c).total;
  const r2 = setFeature(c, fc.id, { model: 'mid' });
  assert.ok(r2.evaled);
  assert.ok(inferenceModel(c).total < before * 0.5);
  assert.deepEqual(mistakeIds(c, 'ai_cost_management'), []);
  // untuned routing is a quality risk too; tuned routing with evals holds quality
  const d = mk();
  setRouting(d.s, { enabled: true });
  assert.ok(mistakeIds(d.s, 'ai_cost_management').includes('model_swap_without_evals'));
  const e = mk();
  setRouting(e.s, { enabled: true, tuned: true });
  assert.deepEqual(mistakeIds(e.s, 'ai_cost_management'), []);
  assert.ok(inferenceModel(e.s).quality > inferenceModel(d.s).quality);
});

test('model deprecation forces a migration: ignore it and pay, plan it with evals and do not', () => {
  const mk = () => {
    const s = fresh(); customers(s, 10, 99); shipAi(s, 'moderate');
    inferenceMonthEnd(s); // creates the slice history
    const inf = aiSlice(s).inf;
    inf.deprecations.push({ id: 'dep1', tier: 'mid', noticeDay: s.day, retireDay: s.day + 90, migrated: false, forced: false });
    return s;
  };
  const ignored = mk();
  for (let i = 0; i < 95; i++) { ignored.day++; inferenceDay(ignored); }
  assert.ok(aiSlice(ignored).inf.deprecations[0].forced);
  assert.ok(mistakeIds(ignored, 'ai_cost_management').includes('model_deprecation_ignored'));
  assert.ok(mod(ignored, 'churn', 'ai-cutover') > 1);
  const planned = mk();
  const r = migrateDeprecation(planned, 'dep1', { withEvals: true });
  assert.ok(r.ok && r.hours >= 6);
  for (let i = 0; i < 95; i++) { planned.day++; inferenceDay(planned); }
  assert.ok(!mistakeIds(planned, 'ai_cost_management').includes('model_deprecation_ignored'));
  assert.equal(mod(planned, 'churn', 'ai-cutover'), undefined);
  // migrating without evals regresses the prompts and is logged
  const lazy = mk();
  migrateDeprecation(lazy, 'dep1', { withEvals: false });
  assert.ok(mistakeIds(lazy, 'ai_cost_management').includes('model_swap_without_evals'));
  // the notice reaches Automations
  const n = fresh(); customers(n, 5); shipAi(n, 'moderate');
  assert.ok(TRIGGERS.aicost_model_deprecation_notice?.ext);
});

test('budget alerts, spend spikes and no-alert mistakes', () => {
  const run = (alerts) => {
    const s = fresh(); customers(s, 30, 99); shipAi(s, 'heavy');
    setBudget(s, { usd: 400, alerts });
    advance(s, 70, APPS);
    return s;
  };
  const withAlerts = run(true), without = run(false);
  assert.ok(aiEvents(withAlerts).some((e) => e.type === 'ai_budget_exceeded'));
  assert.ok(!aiEvents(without).some((e) => e.type === 'ai_budget_exceeded'), 'no alert configured: no event');
  for (const t of ['ai_spend_spike', 'ai_budget_exceeded', 'credits_expiring', 'credits_exhausted', 'model_deprecation_notice', 'credit_application_approved']) assert.ok(TRIGGERS[`aicost_${t}`]?.ext, t);
});

// ---------------------------------------------------------------------------------------------------------
// AI coding spend
// ---------------------------------------------------------------------------------------------------------

test('coding spend per engineer is heavy-tailed: many $200-600, a tail past $1,000-5,000', () => {
  const s = fresh();
  const n = 600;
  const vals = Array.from({ length: n }, (_, i) => usageEq(s, { id: `eng${i}` }, '2026-11')).sort((a, b) => a - b);
  const median = vals[n >> 1], mean = vals.reduce((a, b) => a + b, 0) / n;
  const over1k = vals.filter((v) => v > 1000).length / n, under100 = vals.filter((v) => v < 100).length / n, over2k = vals.filter((v) => v > 2000).length / n;
  assert.ok(median > 250 && median < 520, `median ${median}`);
  assert.ok(over1k > 0.1 && over1k < 0.3, `>1000: ${over1k}`);
  assert.ok(under100 > 0.04 && under100 < 0.22, `<100: ${under100}`);
  assert.ok(over2k > 0.02, `>2000: ${over2k}`);
  assert.ok(vals[n - 1] > 3000, `max ${vals[n - 1]}`);
  assert.ok(mean > median * 1.4, 'right-skewed');
  assert.ok(vals.filter((v) => v >= 200 && v <= 600).length / n > 0.3, 'many sit at $200-600');
  // deterministic per person and month
  assert.equal(usageEq(s, { id: 'eng3' }, '2026-11'), usageEq(s, { id: 'eng3' }, '2026-11'));
});

test('team seats post to the bank each month, hit usage limits that slow work, and right-sizing cuts the overage', () => {
  const s = fresh(); engineers(s, 6);
  const pic = codingPicture(s);
  assert.equal(pic.rows.length, 6);
  assert.ok(pic.seatUsd === 6 * SEAT_PLANS.individual.price);
  assert.ok(pic.apiUsd > 0, 'light seats + API overage for agentic work');
  codingMonthEnd(s);
  const seats = s.bank.txns.find((t) => t.counterparty === 'AI coding seats');
  assert.ok(seats && seats.category === 'software' && -seats.amount === pic.seatUsd);
  assert.ok(s.bank.txns.some((t) => t.meta?.dev && t.amount < 0 && t.counterparty !== 'AI coding seats'), 'API usage posted');
  // waiting at the limit instead of paying API slows engineers
  const w = fresh(); engineers(w, 6); setCodingPolicy(w, { overage: 'wait' });
  assert.ok(codingPicture(w).limitedShare > 0.2);
  assert.ok(codingPicture(w).apiUsd === 0);
  // right-size: heavy users to power seats saves money versus API overage on individual seats
  auditCoding(s);
  const before = codingPicture(s).total;
  rightSizeAll(s);
  assert.ok(codingPicture(s).total < before, `${codingPicture(s).total} < ${before}`);
  assert.equal(bestSeat(3000).id, 'power200');
  assert.equal(bestSeat(60).id, 'individual');
});

test('runaway agent loop and a leaked shared key are billed and logged; scoped keys, caps and alerts bound them', () => {
  const stats = (cfg) => {
    const s = fresh({ cash: 1e9 }); engineers(s, 5); setCodingPolicy(s, cfg);
    let leaks = 0, loops = 0, worst = 0;
    for (let m = 0; m < 700; m++) {
      s.day += 30;
      const before = aiSlice(s).stats.leaks;
      const r = codingMonthEnd(s);
      if (aiSlice(s).stats.leaks > before) leaks++;
      if (r?.incident) loops++;
      worst = Math.max(worst, r?.extra ?? 0);
    }
    return { s, leaks, loops, worst };
  };
  const shared = stats({ keyMode: 'shared' });
  const scoped = stats({ keyMode: 'scoped', alerts: true, capUsd: 300, hardLimit: true });
  assert.ok(shared.leaks > 2 * Math.max(1, scoped.leaks), `leaks shared ${shared.leaks} vs scoped ${scoped.leaks}`);
  assert.ok(mistakeIds(shared.s, 'ai_cost_management').includes('shared_api_key_leak'));
  assert.ok(mistakeIds(shared.s, 'ai_cost_management').includes('unmonitored_agent_spend'));
  assert.ok(!mistakeIds(scoped.s, 'ai_cost_management').includes('shared_api_key_leak'));
  assert.ok(!mistakeIds(scoped.s, 'ai_cost_management').includes('unmonitored_agent_spend'));
  assert.ok(shared.worst > 5 * scoped.worst, `worst incident shared ${shared.worst} vs bounded ${scoped.worst}`);
  const leakM = shared.s.mistakes.find((m) => m.id === 'shared_api_key_leak');
  assert.ok(leakM.cost.usd > 300 && leakM.cost.hours > 0);
});

// ---------------------------------------------------------------------------------------------------------
// Credits and perks
// ---------------------------------------------------------------------------------------------------------

function ready(s) { productSlice(s).features.push({ ...newFeature(s), id: 'f_core', title: 'Receipts', status: 'shipped', shippedDay: 0 }); s.company.website = { url: 'https://ledgerly.test' }; s.company.domain = 'ledgerly.test'; s.founder.linkedinText = 'Founder of Ledgerly, ten years in bookkeeping software.'; return s; }
function approve(s, programId, tierId) {
  const r = applyToProgram(s, programId, tierId);
  assert.ok(r.ok, r.error);
  r.app.roll = 0; // the luck of the draw is tested separately
  s.day = r.app.decisionDay;
  creditsDay(s);
  return r.app;
}

test('credit eligibility is gated: self-serve works with a site, referral tiers need funding or an accelerator, ineligible applications waste hours', () => {
  const s = fresh();
  assert.equal(eligibility(s, 'aws_activate', 'founders').eligible, false, 'no site, domain or LinkedIn yet');
  ready(s);
  assert.equal(eligibility(s, 'aws_activate', 'founders').eligible, true);
  const portfolio = eligibility(s, 'aws_activate', 'portfolio_seed');
  assert.equal(portfolio.eligible, false);
  assert.ok(portfolio.failing.some((f) => /referral/i.test(f)));
  assert.equal(eligibility(s, 'google_cloud', 'ai_first').eligible, false);
  // funding unlocks the referral tier
  s.apps.fundraising = { rounds: [{ instrument: 'priced', amount: 1500000 }], accel: {} };
  assert.equal(eligibility(s, 'aws_activate', 'portfolio_seed').eligible, true);
  // an accelerator unlocks the pool-gated perks
  assert.equal(eligibility(s, 'posthog', 'yc').eligible, false);
  s.apps.fundraising.accel = { yc: { status: 'enrolled' } };
  assert.equal(eligibility(s, 'posthog', 'yc').eligible, true);
  // applying while ineligible: decided later, rejected, hours wasted, logged
  const t = ready(fresh());
  const r = applyToProgram(t, 'aws_activate', 'portfolio_top');
  assert.ok(r.ok && r.hours >= 3);
  t.day = r.app.decisionDay; creditsDay(t);
  assert.equal(r.app.status, 'ineligible');
  const m = t.mistakes.find((x) => x.id === 'applied_ineligible');
  assert.ok(m && m.cost.hours === r.hours);
  assert.equal(perksSlice(t).credits.length, 0);
  // the same underlying allocation cannot be claimed twice
  const u = ready(fresh()); approve(u, 'aws_activate', 'founders');
  assert.equal(eligibility(u, 'stripe_atlas', 'cloud').failing.some((f) => /allocation/.test(f)), true);
});

test('approvals are deterministic, delayed and can fail; denial blocks a quick re-apply', () => {
  const run = () => { const s = ready(fresh()); const r = applyToProgram(s, 'anthropic_startups', 'direct'); return { s, r }; };
  const a = run(), b = run();
  assert.equal(a.r.app.roll, b.r.app.roll);
  assert.equal(a.r.app.decisionDay, b.r.app.decisionDay);
  assert.ok(a.r.app.decisionDay > a.s.day, 'not instant');
  const s = ready(fresh());
  const r = applyToProgram(s, 'anthropic_startups', 'direct');
  r.app.roll = 0.999;
  s.day = r.app.decisionDay; creditsDay(s);
  assert.equal(r.app.status, 'denied');
  assert.equal(applyToProgram(s, 'anthropic_startups', 'direct').ok, false);
});

test('credits offset matching vendor bills before cash, only for the right provider', () => {
  const s = ready(fresh());
  approve(s, 'aws_activate', 'founders'); // $1,000 on AWS hosting and inference
  const cash0 = totalCash(s);
  post(s, { amount: -300, counterparty: 'AWS', description: 'Hosting', category: 'hosting', method: 'card', meta: { provider: 'aws' } });
  assert.equal(totalCash(s), cash0, 'a fully covered bill costs no cash');
  assert.equal(totalBalance(s), 700);
  // a different provider is not covered
  post(s, { amount: -100, counterparty: 'Google Cloud', category: 'hosting', method: 'card', meta: { provider: 'google' } });
  assert.equal(totalCash(s), cash0 - 100);
  assert.equal(totalBalance(s), 700);
  // a bill larger than the balance is split: credit first, cash for the rest
  post(s, { amount: -1000, counterparty: 'AWS Bedrock', category: 'ai_inference', method: 'card', meta: { provider: 'aws' } });
  assert.equal(totalCash(s), cash0 - 100 - 300);
  assert.equal(totalBalance(s), 0);
  assert.equal(perksSlice(s).credits[0].status, 'exhausted');
  assert.ok(aiEvents(s).some((e) => e.type === 'credits_exhausted'));
  // SaaS perks match recurring vendors by name (the default stack has Vercel)
  const t = ready(fresh()); approve(t, 'vercel', 'standard');
  advance(t, 40, APPS);
  const vercel = t.bank.txns.filter((x) => x.counterparty === 'Vercel');
  assert.ok(vercel.length >= 1 && vercel.every((x) => x.amount === 0 && x.meta.creditApplied === 20), JSON.stringify(vercel[0]));
});

test('credits are a contra-expense: net cash, gross on the transaction, no income, never cash or runway', () => {
  const s = ready(fresh());
  approve(s, 'aws_activate', 'founders');
  const incomeBefore = s.bank.txns.filter((t) => t.amount > 0).length;
  const cash0 = totalCash(s);
  const t = post(s, { amount: -1400, counterparty: 'AWS', category: 'hosting', method: 'card', meta: { provider: 'aws' } });
  assert.equal(t.amount, -400, 'cash moves by the net amount');
  assert.equal(t.meta.gross, 1400);
  assert.equal(t.meta.creditApplied, 1000);
  assert.equal(grossSpend(t), 1400);
  assert.equal(s.bank.txns.filter((x) => x.amount > 0).length, incomeBefore, 'no income transaction');
  assert.equal(totalCash(s), cash0 - 400);
  const led = creditsLedger(s);
  assert.equal(led.gross, 1400); assert.equal(led.credits, 1000); assert.equal(led.net, 400);
  // an unused balance is not cash
  const u = ready(fresh()); const c0 = totalCash(u); approve(u, 'aws_activate', 'founders');
  assert.equal(totalCash(u), c0); assert.equal(totalBalance(u), 1000);
});

test('the credit cliff shows up in the forecast and a plan avoids the mistake', () => {
  const mk = () => {
    const s = ready(fresh({ cash: 200000 }));
    approve(s, 'aws_activate', 'founders_plus'); // $5,000 over 12 months
    for (let i = 0; i < 40; i++) { // ~$600/month of AWS inference for two months
      s.day += 1;
      if (i % 10 === 0) post(s, { amount: -200, counterparty: 'AWS', category: 'ai_inference', method: 'card', meta: { provider: 'aws' } });
    }
    return s;
  };
  const s = mk();
  const steps = cliffSchedule(s);
  assert.equal(steps.length, 1);
  assert.ok(steps[0].monthlyUsd > 100 && steps[0].day > s.day);
  const withCliff = project(s, { method: 'line_items' });
  assert.equal(withCliff.cliffs.length, 1);
  perksSlice(s).credits[0].recent = []; // same books without the cliff step for comparison
  const without = project(s, { method: 'line_items' });
  assert.ok(withCliff.endCash < without.endCash - 1000, `${withCliff.endCash} vs ${without.endCash}`);
  // exhaust it with no plan: logged. With a plan: not.
  const unplanned = mk();
  post(unplanned, { amount: -9000, counterparty: 'AWS', category: 'ai_inference', method: 'card', meta: { provider: 'aws' } });
  assert.ok(mistakeIds(unplanned, 'startup_perks').includes('credit_cliff_surprise'));
  const planned = mk();
  planCliff(planned, perksSlice(planned).credits[0].id, 'forecast');
  post(planned, { amount: -9000, counterparty: 'AWS', category: 'ai_inference', method: 'card', meta: { provider: 'aws' } });
  assert.ok(!mistakeIds(planned, 'startup_perks').includes('credit_cliff_surprise'));
  // expiry with unused balance also ends the credit
  const e = mk();
  perksSlice(e).credits[0].expiryDay = e.day + 5; // still being used when it lapses
  post(e, { amount: -250, counterparty: 'AWS', category: 'ai_inference', method: 'card', meta: { provider: 'aws' } });
  e.day += 6; creditsDay(e);
  assert.equal(perksSlice(e).credits[0].status, 'expired');
  assert.ok(mistakeIds(e, 'startup_perks').includes('credit_cliff_surprise'));
});

test('over-provisioning on credits becomes a cash bill at the cliff and is logged; right-sizing ahead avoids it', () => {
  const mk = (footprint) => {
    const s = ready(fresh({ cash: 200000 })); customers(s, 30, 49);
    approve(s, 'aws_activate', 'founders_plus');
    moveCloud(s, 'aws'); setFootprint(s, footprint);
    advance(s, 260, APPS);
    return s;
  };
  const s = mk('overbuilt');
  const cr = perksSlice(s).credits[0];
  assert.ok(cr.status === 'exhausted', `${cr.status} balance ${cr.balance}`);
  assert.ok(mistakeIds(s, 'startup_perks').includes('overprovisioned_on_credits'));
  const lean = mk('lean');
  assert.ok(!mistakeIds(lean, 'startup_perks').includes('overprovisioned_on_credits'));
  assert.ok(perksSlice(lean).credits[0].balance > perksSlice(s).credits[0].balance, 'a lean footprint makes the credits last longer');
  // a tool adopted only because it is free is also a cash bill at the end
  const t = ready(fresh({ cash: 200000 }));
  approve(t, 'mixpanel', 'startup');
  assert.equal(adoptTool(t, 'mixpanel').ok, true);
  advance(t, 400, APPS);
  assert.ok(mistakeIds(t, 'startup_perks').includes('overprovisioned_on_credits'));
});

// ---------------------------------------------------------------------------------------------------------
// Spec autofill
// ---------------------------------------------------------------------------------------------------------

function seedEvidence(s, n) {
  const R = researchSlice(s);
  R.interviews = Array.from({ length: n }, (_, i) => ({ id: `iv${i}`, real: true, status: 'done', channel: 'warm', doneDay: 5 + i }));
  const texts = [
    ['pain', 'Every month at close I chase 12 clients for missing receipts, about 3 hours of emails.'],
    ['workaround', 'They track missing receipts in a shared spreadsheet and send reminders by email by hand.'],
    ['spend', 'I lose roughly 6 hours a month and have paid a freelancer $200 to chase receipts.'],
  ];
  R.insights = [];
  for (let i = 0; i < n; i++) for (const [type, text] of texts) R.insights.push({ id: `ins${i}_${type}`, interviewId: `iv${i}`, theme: 'Receipts', type, text, real: true, verified: true, who: `Bookkeeper ${i}`, day: 5 + i });
}

test('autofill quality tracks the evidence: no evidence is generic and blocked, real evidence drafts a specific spec with citations', () => {
  const s = fresh();
  productSlice(s);
  const f0 = newFeature(s);
  const r0 = autofillSpec(s, f0);
  assert.equal(r0.hours, 0.2);
  assert.equal(r0.weak, true);
  const lint0 = lintSpec(f0);
  assert.ok(lint0.blockers.length >= 3, 'the generic draft is blocked instantly');
  assert.ok(lint0.blockers.some((b) => b.rule === 'buzzword'));
  const g0 = combineGrades([heuristicGrade(f0)], lint0);
  assert.equal(g0.pass, false);
  assert.equal(r0.cites.length, 0);
  // rich evidence
  const t = fresh();
  seedEvidence(t, 6);
  const f1 = newFeature(t);
  const ev = gatherEvidence(t);
  assert.ok(ev.strength > 0.5, `${ev.strength}`);
  const r1 = autofillSpec(t, f1);
  assert.equal(r1.weak, false);
  assert.ok(r1.cites.length >= 2 && r1.cites.every((c) => /Real interview/.test(c) || /ticket|request|cancel|Experiment/.test(c)));
  assert.ok(f1.evidence.length >= 2, 'linked to the real insights it used');
  assert.deepEqual(lintSpec(f1, { realInterviews: 6 }).blockers.map((b) => b.rule), [], `blockers: ${JSON.stringify(lintSpec(f1).blockers)}`);
  const g1 = heuristicGrade(f1, { insights: researchSlice(t).insights.filter((i) => f1.evidence.includes(i.id)), realInterviews: 6 });
  const tot = (g) => g.specificity + g.userClarity + g.testability + g.scopeRealism + g.evidence;
  assert.ok(tot(g1) > tot(heuristicGrade(f0)) + 5, `rich ${tot(g1)} vs generic ${tot(heuristicGrade(f0))}`);
  // thin evidence sits in between: one insight, no interviews, still blocked or weak
  const u = fresh(); seedEvidence(u, 1);
  const f2 = newFeature(u);
  autofillSpec(u, f2);
  assert.ok(gatherEvidence(u).strength < gatherEvidence(t).strength);
  assert.ok(lintSpec(f2).blockers.length >= 1 || tot(heuristicGrade(f2)) < tot(g1));
});

test('an unedited autofill draft cannot rate above good; editing it lifts the cap', () => {
  const s = fresh(); seedEvidence(s, 6);
  const f = newFeature(s);
  autofillSpec(s, f);
  assert.equal(isUneditedAutofill(f), true);
  const strong = { total: 19, issues: [], pass: true };
  assert.equal(capAutofillGrade(f, { ...strong }).total, AUTOFILL_CAP);
  assert.ok(capAutofillGrade(f, { ...strong }).autofillCapped);
  f.nonGoals = 'Mobile app; SSO; OCR of line items';
  f.problem += ' In 5 pilot accounts the median is 11 missing receipts per close.';
  assert.equal(isUneditedAutofill(f), false);
  assert.equal(capAutofillGrade(f, { ...strong }).total, 19);
});

test('autofilling with no evidence repeatedly is a logged mistake and weak specs cost extra build time', () => {
  const s = fresh(); productSlice(s);
  const a = newFeature(s), b = newFeature(s);
  autofillSpec(s, a);
  assert.ok(!mistakeIds(s, 'product_prioritization').includes('autofilled_generic_specs'), 'once is a try');
  autofillSpec(s, b);
  assert.ok(mistakeIds(s, 'product_prioritization').includes('autofilled_generic_specs'));
  assert.ok(a.autofill.weak && b.autofill.weak);
  // evidence-backed autofill is never logged
  const t = fresh(); seedEvidence(t, 6); productSlice(t);
  autofillSpec(t, newFeature(t)); autofillSpec(t, newFeature(t)); autofillSpec(t, newFeature(t));
  assert.deepEqual(mistakeIds(t, 'product_prioritization'), []);
  // filling only blank fields: the player's own words are kept
  const f = newFeature(t); f.title = 'My own title';
  autofillSpec(t, f);
  assert.equal(f.title, 'My own title');
});

// ---------------------------------------------------------------------------------------------------------
// Operator tiers
// ---------------------------------------------------------------------------------------------------------

function aiArchetype(tier) {
  const s = fresh({ cash: 300000 });
  customers(s, 40, tier === 'mediocre' ? 29 : 79);
  const f = shipAi(s, 'moderate');
  const inf = aiSlice(s).inf;
  engineers(s, 4);
  const c = aiSlice(s).coding;
  if (tier === 'stellar') {
    featureCfg(s, f).model = 'frontier'; featureCfg(s, f).baseQ = 1;
    runEval(s, f.id, { model: 'mid', cache: 'prompt' });
    setFeature(s, f.id, { model: 'mid', cache: 'prompt' });
    setRouting(s, { enabled: true, tuned: true });
    setBudget(s, { usd: 600, alerts: true }); setLimits(s, { perUserMult: 3, agentTokenCap: true });
    setPricing(s, { mode: 'credits', includedUsd: 4 });
    setCodingPolicy(s, { policy: 'shadow', keyMode: 'scoped', alerts: true, capUsd: 400, hardLimit: true }); auditCoding(s); rightSizeAll(s);
  } else if (tier === 'good') {
    setFeature(s, f.id, { cache: 'prompt' });
    setBudget(s, { usd: 600, alerts: false }); setLimits(s, { perUserMult: 4 });
    setCodingPolicy(s, { policy: 'team_std', alerts: true });
  } else if (tier === 'average') {
    featureCfg(s, f).model = 'frontier'; featureCfg(s, f).baseQ = 1;
    setFreeTier(s, { enabled: true, capReqs: 200 });
  } else {
    featureCfg(s, f).model = 'frontier'; featureCfg(s, f).baseQ = 1;
    setFreeTier(s, { enabled: true });
    setFeature(s, f.id, { model: 'small' });
    f.ai.level = 'heavy'; inf.features[f.id].type = 'agent'; inf.features[f.id].reqs = 20; inf.features[f.id].model = 'small';
  }
  advance(s, 35, APPS);
  if (tier === 'mediocre') { codingMonthEnd(s); }
  return s;
}
function perksArchetype(tier) {
  const s = ready(fresh({ cash: 300000 })); customers(s, 20, 79);
  const apply = (p, t, ok = true) => { const r = applyToProgram(s, p, t); if (r.ok) { r.app.roll = ok ? 0 : 0.99; } return r; };
  const decide = () => { s.day += 70; creditsDay(s); };
  if (tier === 'stellar') {
    approve(s, 'aws_activate', 'founders'); approve(s, 'microsoft_hub', 'entry'); approve(s, 'mixpanel', 'startup');
    for (const c of perksSlice(s).credits) planCliff(s, c.id, 'forecast');
  } else if (tier === 'good') {
    approve(s, 'aws_activate', 'founders'); approve(s, 'cloudflare', 'startup'); apply('anthropic_startups', 'referred'); decide();
    planCliff(s, perksSlice(s).credits[0].id, 'forecast');
  } else if (tier === 'average') {
    approve(s, 'aws_activate', 'founders'); approve(s, 'supabase', 'team_free');
    apply('aws_activate', 'portfolio_seed'); apply('google_cloud', 'scale'); decide();
  } else {
    approve(s, 'vercel', 'standard');
    for (const [p, t] of [['aws_activate', 'portfolio_top'], ['google_cloud', 'ai_first'], ['anthropic_startups', 'nominated'], ['openai_startups', 'vc_partner'], ['posthog', 'yc']]) apply(p, t);
    decide();
    moveCloud(s, 'aws'); setFootprint(s, 'overbuilt');
  }
  return s;
}

test('tier separation: ai_cost_management and startup_perks separate stellar / good / average / mediocre', () => {
  for (const id of ['ai_cost_management', 'startup_perks']) assert.ok(OPERATOR_TIERS[id], id);
  assert.equal(readOperator(fresh(), 'ai_cost_management').tier, 'unknown');
  assert.equal(readOperator(fresh(), 'startup_perks').tier, 'unknown');
  const tiers = ['stellar', 'good', 'average', 'mediocre'];
  for (const [id, make] of [['ai_cost_management', aiArchetype], ['startup_perks', perksArchetype]]) {
    const reads = tiers.map((t) => ({ t, r: readOperator(make(t), id) }));
    for (let i = 1; i < reads.length; i++) assert.ok(reads[i - 1].r.score > reads[i].r.score, `${id}: ${reads[i - 1].t} ${reads[i - 1].r.score} > ${reads[i].t} ${reads[i].r.score}`);
    for (const { t, r } of reads) { assert.equal(r.tier, t, `${id}: ${t} archetype reads ${r.tier} (score ${r.score}; ${r.evidence.join(' | ')})`); assert.ok(r.evidence.length > 0); }
    assert.ok(reads[3].r.coaching.length > 0, `${id}: mediocre is coached`);
  }
});

test('the AI costs and Perks & credits views render for a populated company and escape text', async () => {
  const { renderAiCosts, perksView, aiSpendAudit } = await import('../public/apps/aicost/views.js');
  const s = ready(fresh({ cash: 300000 })); customers(s, 20, 79); engineers(s, 3);
  const f = shipAi(s, 'moderate'); f.title = '<script>alert(1)</script>';
  approve(s, 'aws_activate', 'founders');
  advance(s, 70, APPS);
  const a = String(renderAiCosts({ state: s }));
  assert.ok(a.includes('AI inference / month') && a.includes('AI coding spend') && !a.includes('<script>alert(1)</script>'));
  const p = String(perksView(s));
  assert.ok(p.includes('AWS Activate') && p.includes('contra-expense') && p.includes('reported'));
  assert.ok(String(aiSpendAudit(s)).includes('AI and LLM spend'));
});

test('regression: market price events (inferenceCostMult) scale the in-product inference bill', () => {
  const s = fresh();
  customers(s, 10);
  shipAi(s, 'moderate');
  const base = inferenceModel(s).total;
  s.apps.world = { active: [{ status: 'active', effects: { inferenceCostMult: 1.5 } }] };
  const hiked = inferenceModel(s);
  assert.ok(Math.abs(hiked.total - base * 1.5) < 0.05, `${base} -> ${hiked.total}`);
  const byModel = Object.values(hiked.byModel).reduce((a, x) => a + x, 0);
  assert.ok(Math.abs(byModel - hiked.total) < 0.05, `byModel ${byModel} sums to the total ${hiked.total}`);
});

test('regression: a fair-use cap is applied once in the per-user margin picture', () => {
  const s = fresh();
  customers(s, 10, 5); // cheap plan so heavy users are underwater
  shipAi(s, 'heavy');
  const open = marginPicture(s);
  setLimits(s, { perUserMult: 50 }); // a cap so high it binds on almost nobody
  const capped = marginPicture(s);
  assert.ok(Math.abs(capped.avgCost - open.avgCost) / open.avgCost < 0.02, `uncapped mean cost per user is unchanged: ${open.avgCost} vs ${capped.avgCost}`);
  assert.ok(capped.underwaterLoss > open.underwaterLoss * 0.9, `${open.underwaterLoss} vs ${capped.underwaterLoss}`);
  setLimits(s, { perUserMult: 1.5 });
  const tight = marginPicture(s);
  assert.ok(Math.abs(tight.avgCost - open.avgCost) / open.avgCost < 0.02, `the cap is applied to usage, not folded into the mean too: ${open.avgCost} vs ${tight.avgCost}`);
  assert.ok(tight.underwaterLoss < open.underwaterLoss, 'a binding cap cuts the loss');
});

test('regression: with overage off, a runaway loop stalls the seat (lost pace, no API bill); an alert shortens it', async () => {
  const { CODING } = await import('../public/data/ai-costs.js');
  const { codingLimitFactor, RUNAWAY_STALL_DAYS } = await import('../public/apps/aicost/coding.js');
  const keep = { run: CODING.runawayMonthly, leakS: CODING.leakMonthlyShared, leakC: CODING.leakMonthlyScoped };
  Object.assign(CODING, { runawayMonthly: 1, leakMonthlyShared: 0, leakMonthlyScoped: 0 });
  try {
    const run = (alerts) => {
      const s = fresh(); engineers(s, 1); setCodingPolicy(s, { overage: 'wait', alerts, policy: 'power200' }); // a big seat: usage alone does not hit the limit
      s.day = 10; // early in the month: usage alone has not hit the limit yet
      const base = codingLimitFactor(s);
      const r = codingMonthEnd(s);
      const api = s.bank.txns.filter((t) => t.meta?.dev && t.counterparty !== 'AI coding seats');
      s.day += 1;
      return { s, r, api, base, stalled: codingLimitFactor(s), stallUntil: aiSlice(s).coding.stalls.eng0 };
    };
    const quiet = run(false), alerted = run(true);
    assert.equal(quiet.api.length, 0, 'no API overage billed under "wait"');
    assert.equal(quiet.r.incident.kind, 'runaway_stall');
    assert.ok(quiet.stalled < quiet.base, `pace ${quiet.base} -> ${quiet.stalled}`);
    assert.equal(quiet.stallUntil - (quiet.s.day - 1), RUNAWAY_STALL_DAYS[1]);
    assert.equal(alerted.stallUntil - (alerted.s.day - 1), RUNAWAY_STALL_DAYS[0]);
    const m = (quiet.s.mistakes ?? []).find((x) => x.id === 'unmonitored_agent_spend');
    assert.ok(m && m.cost.hours > 0 && !m.cost.usd, 'logged as lost time, not money');
    assert.ok(!(alerted.s.mistakes ?? []).some((x) => x.id === 'unmonitored_agent_spend'));
  } finally { Object.assign(CODING, { runawayMonthly: keep.run, leakMonthlyShared: keep.leakS, leakMonthlyScoped: keep.leakC }); }
});

test('regression: free-tier and model-migration actions charge the hours they compute', async () => {
  const { freeTierHours, migrationHours, ABUSE_GUARD_HOURS } = await import('../public/apps/aicost/inference.js');
  const s = fresh(); customers(s, 5); shipAi(s, 'moderate'); shipAi(s, 'moderate');
  const p = { enabled: true, capReqs: null, abuseGuard: true, model: 'same' };
  const h = freeTierHours(s, p);
  assert.equal(h, 0.5 + ABUSE_GUARD_HOURS);
  assert.equal(setFreeTier(s, p).hours, h);
  assert.equal(freeTierHours(s, p), 0.5, 'already verified: no repeat charge');
  const tier = featureCfg(s, productSlice(s).features[0]).model;
  aiSlice(s).inf.deprecations.push({ id: 'dep1', tier, noticeDay: s.day, retireDay: s.day + 90, migrated: false, forced: false });
  const est = migrationHours(s, 'dep1', { withEvals: true });
  assert.ok(est > migrationHours(s, 'dep1'), 'evals add time');
  assert.equal(migrateDeprecation(s, 'dep1', { withEvals: true }).hours, est);
});
