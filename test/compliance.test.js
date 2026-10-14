// SOC 2 compliance-automation workflow, AI security questionnaires with review, and the legal_hygiene reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator, TIER_RANK } from '../public/core/operator.js';
import peopleApp from '../public/apps/people.js';
import legalApp from '../public/apps/legal.js';
import { soc2Status } from '../public/apps/legal/api.js';
import { ensureLegal, incorporate } from '../public/apps/legal/sim.js';
import { hasSoc2 } from '../public/apps/sales/model.js';
import { addAsk } from '../public/apps/success/engine.js';
import {
  ensureCompliance, INTEGRATIONS, TESTS, COMMITMENTS, choosePlatform, connectIntegration, fixTest, generatePolicies, reviewPolicies,
  approvePolicies, runControlAction, sendPersonnelOnboarding, completeOwnTasks, chooseAuditor, startSoc2, readiness, importQuestionnaire,
  questionnaireInbox, aiDraft, reviewAnswer, submitQuestionnaire, legalEvents,
} from '../public/apps/legal/compliance.js';

const APPS = [peopleApp, legalApp];
const TIERS = ['stellar', 'good', 'average', 'mediocre'];

function fresh(seed = 3, { demand = true } = {}) {
  const s = newState({ companyName: 'Acme', model: 'ent', path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 600000, counterparty: 'Pat', category: 'owner_contribution' });
  s.founder.hoursPerWeek = 70;
  incorporate(s, { provider: 'atlas', operatingState: 'DE' });
  advance(s, 3, APPS);
  s.apps.people.payrollSetup.gusto = true;
  if (demand) {
    const c = createCustomer(s, { name: 'Big Co', email: 'cto@big.co', company: 'Big Co', country: 'US' });
    const sub = subscribe(s, c.id, { id: 'p', price: 60000, interval: 'year', trialDays: 0 }, { invoiceManually: true });
    addAsk(s, { kind: 'security_questionnaire', target: 'account', refId: sub.id, companyId: null, dueDay: s.day + 30 });
  }
  return s;
}

const fixAll = (s) => {
  const c = ensureCompliance(s);
  for (const [id, t] of Object.entries(c.tests)) {
    if (t.status !== 'fail' || TESTS[id].external || t.hidden) continue;
    if (TESTS[id].scopeOut) fixTest(s, id, { scopeOut: true, reason: 'Sandbox account holds no customer data; isolated VPC and separate billing' });
    else fixTest(s, id);
  }
};
const connectAll = (s, keys = Object.keys(INTEGRATIONS)) => { for (const k of keys) { let r = connectIntegration(s, k); if (r.status === 'error') r = connectIntegration(s, k); } };
const required = () => Object.keys(COMMITMENTS).filter((k) => COMMITMENTS[k].required);

/** Archetype SOC 2 programmes (inputs only). Returns { s, report, days, hours }. */
function runProgramme(tier, seed) {
  const s = fresh(seed, { demand: tier !== 'mediocre' && tier !== 'average' });
  const t0 = s.day;
  choosePlatform(s, tier === 'good' ? 'drata' : 'vanta');
  if (tier === 'mediocre') connectAll(s, ['cloud', 'idp']); else connectAll(s);
  if (tier === 'stellar' || tier === 'good') fixAll(s);
  generatePolicies(s, tier === 'mediocre' || tier === 'average' ? 'ai' : 'template');
  if (tier === 'stellar') reviewPolicies(s, required());
  else if (tier === 'good') reviewPolicies(s, [...required()]);
  else approvePolicies(s);
  if (tier !== 'mediocre') { sendPersonnelOnboarding(s); completeOwnTasks(s); }
  if (tier === 'stellar') for (const k of required()) if (COMMITMENTS[k].action) runControlAction(s, k);
  if (tier === 'good') for (const k of ['access_review', 'vendor_review', 'ir_tabletop']) runControlAction(s, k);
  if (tier === 'average') { runControlAction(s, 'access_review'); }
  // Stellar waits until readiness is high; the others start the audit right away.
  const wait = { stellar: 21, good: 14, average: 0, mediocre: 0 }[tier];
  advance(s, wait, APPS);
  if (tier === 'stellar') fixAll(s);
  chooseAuditor(s, 'boutique');
  startSoc2(s, 'type1');
  const L = ensureLegal(s);
  const fixEvery = { stellar: 7, good: 14, average: 35, mediocre: 0 }[tier];
  for (let d = 0; d < 200 && L.soc2 === 'type1_in_progress'; d++) {
    advance(s, 1, APPS);
    if (fixEvery && d % fixEvery === 0) fixAll(s);
  }
  const hours = (s.founder.timeLog ?? []).filter((x) => /SOC 2/.test(x.label)).reduce((a, x) => a + x.hours, 0);
  return { s, report: L.soc2Report, days: s.day - t0, hours };
}

test('SOC 2 workflow tiers separate: exceptions and opinion follow what the founder did; Sales still reads the status', () => {
  const agg = Object.fromEntries(TIERS.map((t) => [t, { exc: 0, qualified: 0, n: 0 }]));
  for (const seed of [1, 2, 3, 4]) for (const t of TIERS) {
    const r = runProgramme(t, seed);
    assert.ok(r.report, `${t} got a report`);
    agg[t].exc += r.report.exceptions.length / 4; agg[t].qualified += r.report.opinion === 'qualified' ? 1 : 0; agg[t].n++;
    assert.ok(['type1'].includes(soc2Status(r.s)) && hasSoc2(r.s));
  }
  assert.ok(agg.stellar.exc <= 1 && agg.stellar.exc < agg.average.exc && agg.average.exc < agg.mediocre.exc, JSON.stringify(agg));
  assert.ok(agg.good.exc <= agg.average.exc, JSON.stringify(agg));
  assert.equal(agg.stellar.qualified, 0);
  assert.ok(agg.mediocre.qualified >= 3, JSON.stringify(agg));
  const med = runProgramme('mediocre', 7);
  assert.ok(med.s.mistakes.some((x) => x.id === 'soc2_too_early') && med.s.mistakes.some((x) => x.id === 'soc2_qualified'));
  assert.ok(TIER_RANK[readOperator(runProgramme('stellar', 7).s, 'legal_hygiene').tier] > TIER_RANK[readOperator(med.s, 'legal_hygiene').tier]);
});

test('manual SOC 2 (no platform) costs far more founder hours than a platform programme', () => {
  const st = runProgramme('stellar', 5);
  const s = fresh(5);
  startSoc2(s, 'type1');
  advance(s, 120, APPS);
  const manual = s.founder.timeLog.filter((x) => /SOC 2/.test(x.label)).reduce((a, x) => a + x.hours, 0);
  assert.ok(manual > 80 && st.hours < manual / 2, `manual ${manual} platform ${st.hours}`);
  assert.ok(st.days < 120, `stellar Type I in ${st.days} days`);
});

test('failing tests name resources; a fix shows next day on Drata; the sandbox needs a scoped exclusion with a reason', () => {
  const s = fresh(8);
  choosePlatform(s, 'drata');
  connectAll(s, ['cloud']);
  const c = ensureCompliance(s);
  assert.equal(c.tests.cloud_sandbox.status, 'fail');
  assert.throws(() => fixTest(s, 'cloud_sandbox', { scopeOut: true, reason: 'x' }), /reason/);
  fixTest(s, 'cloud_sandbox', { scopeOut: true, reason: 'Sandbox has no customer data and separate credentials' });
  assert.equal(c.tests.cloud_sandbox.scoped, false);
  const failing = Object.entries(c.tests).find(([id, t]) => t.status === 'fail' && !TESTS[id].scopeOut);
  if (failing) { fixTest(s, failing[0]); assert.equal(c.tests[failing[0]].visibleDay, s.day + 1); }
  assert.ok(readiness(s).parts.integrations > 0);
  assert.ok(legalEvents(s, 'questionnaire_received').length >= 1);
});

test('AI questionnaire: reviewed answers are accurate and deliver the ask; unreviewed overclaims are logged and can surface later', () => {
  // Reviewed path.
  const s = fresh(2);
  choosePlatform(s, 'vanta');
  connectAll(s);
  generatePolicies(s, 'ai');
  approvePolicies(s);
  const key = questionnaireInbox(s)[0].sourceKey;
  const qn = importQuestionnaire(s, key);
  aiDraft(s, qn.id);
  let hours = 0.3;
  for (const a of qn.answers) hours += reviewAnswer(s, qn.id, a.qid, 'correct').hours;
  const r = submitQuestionnaire(s, qn.id);
  assert.equal(r.accuracy, 1);
  assert.ok(hours < 1.2, `review hours ${hours}`);
  assert.equal(s.apps.success.asks[0].status, 'done');
  assert.ok(Object.keys(ensureCompliance(s).library).length >= 8);
  // Unreviewed path with AI policies that overcommit.
  let overclaims = 0, caught = 0;
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const t = fresh(seed);
    choosePlatform(t, 'vanta');
    connectAll(t, ['cloud', 'idp']);
    generatePolicies(t, 'ai');
    approvePolicies(t);
    const q = importQuestionnaire(t, questionnaireInbox(t)[0].sourceKey);
    aiDraft(t, q.id);
    const out = submitQuestionnaire(t, q.id);
    assert.ok(out.accuracy < 0.95, `accuracy ${out.accuracy}`);
    overclaims += out.overclaims;
    if (out.overclaims) assert.ok(t.mistakes.some((x) => x.id === 'questionnaire_overclaim'));
    advance(t, 130, APPS);
    caught += ensureCompliance(t).detections.filter((d) => d.status === 'caught').length;
  }
  assert.ok(overclaims >= 12, `overclaims ${overclaims}`);
  assert.ok(caught >= 1, `caught ${caught}`);
  // By hand: truthful but slow.
  const m = fresh(4);
  const q2 = importQuestionnaire(m, questionnaireInbox(m)[0].sourceKey);
  const hand = submitQuestionnaire(m, q2.id, { mode: 'manual' });
  assert.ok(hand.accuracy === 1 && hand.hours >= 2);
});

test('legal hygiene reader is unknown before any legal action', () => {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed: 1 });
  assert.equal(readOperator(s, 'legal_hygiene').tier, 'unknown');
});
