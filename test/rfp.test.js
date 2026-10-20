// Formal RFP workflow (sales/rfp.js): wired cap, overclaiming, disqualification, Q&A, debrief window, BAFO,
// content library, operator tiers and automation catalog coverage. Short, targeted: no multi-year sims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator, TIER_RANK } from '../public/core/operator.js';
import { ensureCrm, addContact, ensureDeal, declineRfp, closeWon } from '../public/apps/sales/model.js';
import { dealsDay, rfpMult } from '../public/apps/sales/engine.js';
import { salesEvents } from '../public/apps/sales/automation.js';
import { SALES_ACTIONS } from '../public/apps/sales/automation.js';
import * as R from '../public/apps/sales/rfp.js';
import { TRIGGERS, ACTIONS } from '../public/apps/automations/model.js';
import { SALES } from '../public/apps/sales/params.js';
import { ensureCalendar } from '../public/core/calendar.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';
import { bidsView, bidsBadge, dealBidBox } from '../public/apps/sales/rfp-view.js';

const FEATURES = [
  ['f1', 'SSO and login', 'single sign-on with SAML for staff', 'staff share passwords'],
  ['f2', 'Role permissions', 'role based access control with three levels', 'everyone sees everything'],
  ['f3', 'Audit log', 'audit log of admin actions', 'no history of changes'],
  ['f4', 'CSV export and API', 'bulk export and a documented API', 'locked-in data'],
  ['f5', 'Reporting dashboards', 'standard reports for administrators', 'manual reports'],
  ['f6', 'Notifications', 'email notifications and reminders', 'missed deadlines'],
  ['f7', 'Workflow approvals', 'configurable workflows and approvals', 'paper approvals'],
  ['f8', 'Bulk import', 'bulk import and onboarding of records', 'slow onboarding'],
];

function world(seed = 5, { features = FEATURES, customers = 2 } = {}) {
  const s = newState({ companyName: 'Ledgerly', model: 'ent', path: 'vc', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 2e6, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Request tracking and approvals for school districts';
  s.apps.product = { features: features.map(([id, title, spec, problem]) => ({ id, title, spec, problem, status: 'shipped' })) };
  s.market.fit.product.score = 0.6;
  s.plans[0].price = 400; s.plans[0].interval = 'month';
  ensureCrm(s);
  for (let i = 0; i < customers; i++) {
    const c = createCustomer(s, { name: `Customer ${i}`, email: `c${i}@x${i}.org`, company: `District ${i}`, source: 'outbound' });
    subscribe(s, c.id, s.plans[0], { trial: false, source: 'outbound' });
  }
  return s;
}

const req = (id, o = {}) => ({ ...(R.CORE_REQS.find((r) => r.id === id) ?? R.REQ_BANK.find((r) => r.id === id) ?? R.CERT_REQS[id]), weight: 2, mandatory: false, ...o });
const numbered = (reqs) => reqs.map((r, i) => ({ ...r, n: `R-${String(i + 1).padStart(2, '0')}` }));
// A bid the product fits: everything mandatory is live or buyable.
const goodReqs = () => numbered([req('core', { mandatory: true, weight: 3 }), req('encrypt', { mandatory: true, weight: 3 }), req('backup'), req('insurance', { mandatory: true }), req('sso'), req('rbac', { mandatory: true }), req('audit'), req('export'), req('report'), req('notify')]);
// A bid the product does not fit: SOC 2 and two unbuilt features are mandatory.
const poorReqs = () => numbered([req('core', { mandatory: true, weight: 3 }), req('encrypt', { mandatory: true, weight: 3 }), req('soc2', { mandatory: true }), req('a11y', { mandatory: true }), req('multi', { mandatory: true }), req('sso'), req('rbac')]);

function bid(s, o = {}) {
  return R.postPublicBid(s, { segmentId: 'k12', wired: false, reqs: goodReqs(), quantity: 100, budget: 1e9, budgetHint: true, evalFlaw: false, localPct: 0, weightsStated: true, ...o });
}
const SUMMARY = (b) => `${b.buyer} needs one place to track every request from intake to closure, with approvals that match your policies. Our platform replaced paper approvals for two districts and cut median request turnaround from 9 days to 3. We will migrate your records in 6 weeks, train all staff in one day and provide role permissions, an audit log and reports for administrators. Your team keeps single sign-on, bulk export and notifications from the first day. Implementation is led by the founder, who answers support within one business day. We priced the first year at your stated budget and will commit references from two districts you can call.`;

function fullResponse(s, b, { honest = true, summary = SUMMARY(b), forms = true, ack = true, security = true, price = null } = {}) {
  if (ack) for (const a of b.addenda) if (!a.acked) R.ackAddendum(s, b, a.id);
  if (forms) for (const f of b.forms) if (!f.done) { if (f.id === 'insurance_cert' && s.apps.crm.paperAssets?.coi_insurance == null) R.workCredential(s, 'insurance', 3, b); if (!f.optional) R.completeForm(s, b, f.id); }
  const answers = {};
  for (const r of b.reqs) answers[r.id] = honest ? R.honestAnswer(R.reqTruth(s, r)) : 'comply';
  R.answerMatrix(s, b, answers);
  if (security && b.securityRequired) R.workSecurity(s, b, 40);
  R.setPrice(s, b, price ?? Math.min(b.listPrice, b.budget));
  R.chooseReferences(s, b, R.referenceCandidates(s, b).map((c) => c.id));
  R.writeSummary(s, b, summary);
}
const tick = (s, n = 1) => { for (let i = 0; i < n; i++) { s.day++; dealsDay(s); } };
const runUntil = (s, fn, max = 260) => { for (let i = 0; i < max && !fn(); i++) tick(s); return fn(); };
const mistakes = (s, id) => (s.mistakes ?? []).filter((m) => m.id === id);
const withRfp = (patch, fn) => { const old = {}; for (const k of Object.keys(patch)) { old[k] = R.RFP[k]; R.RFP[k] = patch[k]; } try { return fn(); } finally { Object.assign(R.RFP, old); } };

// ---------------------------------------------------------------------------

test('procurement path: card, small purchase, quotes, RFP, co-op', () => {
  const seg = { procurement: { cardLimit: 2000, quoteThreshold: 25000, rfpThreshold: 100000, coopContracts: ['Sourcewell'] } };
  assert.equal(R.procurementPath(seg, 1500).path, 'card');
  assert.equal(R.procurementPath(seg, 10000).path, 'small_purchase');
  assert.equal(R.procurementPath(seg, 40000).path, 'quotes');
  assert.equal(R.procurementPath(seg, 150000).path, 'rfp');
  assert.equal(R.procurementPath(seg, 150000, { coop: true }).path, 'coop');
});

test('a wired bid scores at most the cap; the same response on an open bid scores higher', () => {
  const s = world();
  const a = bid(s, { wired: true }), b = bid(s, { wired: false });
  for (const x of [a, b]) { R.decideBid(s, x, 'bid'); fullResponse(s, x); }
  const sa = R.scoreBid(s, a), sb = R.scoreBid(s, b);
  assert.ok(sb.total > R.RFP.wiredCap, `open bid scores ${sb.total}`);
  assert.equal(sa.total, R.RFP.wiredCap);
  assert.ok(sa.capped && !sb.capped);
});

test('overclaiming raises the score now and logs a delayed mistake at kickoff', (t) => {
  const s = world(9, { features: FEATURES.slice(0, 3) }); // thin product: most requirements are not built
  const redline = SALES.redlineChance; SALES.redlineChance = 0; // Legal's redline flow is its own app; this test is about the bid
  t.after(() => { SALES.redlineChance = redline; });
  withRfp({ fieldMean: 35, fieldSd: 2, minorInformalityWaived: 0 }, () => {
    const mk = (honest) => { const b = bid(s, { reqs: numbered([req('core', { mandatory: true, weight: 3 }), req('encrypt', { mandatory: true, weight: 3 }), req('sso'), req('workflow'), req('multi'), req('mobile'), req('integr')]), securityRequired: false }); R.decideBid(s, b, 'bid'); fullResponse(s, b, { honest }); return b; };
    const honest = mk(true), over = mk(false);
    assert.ok(R.scoreBid(s, over).technical > R.scoreBid(s, honest).technical + 15, 'claiming comply buys technical points');
    assert.ok(R.overclaims(s, over).length >= 3 && R.overclaims(s, honest).length === 0);
    R.submitBid(s, over);
    assert.equal(mistakes(s, 'overclaimed_compliance').length, 0, 'nothing is logged on the day of the claim');
    assert.ok(runUntil(s, () => over.status === 'won' || ['lost', 'disqualified'].includes(over.status)), 'the bid resolves');
    assert.equal(over.status, 'won', `a weak field loses to the overclaimed response (status ${over.status}, cause ${over.cause})`);
    runUntil(s, () => mistakes(s, 'overclaimed_compliance').length > 0, 120);
    const m = mistakes(s, 'overclaimed_compliance')[0];
    assert.ok(m && m.delayed && m.cost.hours > 0 && m.cost.reputation > 0, 'delayed, with hours and reputation');
    assert.ok(m.day - over.wonDay >= 40, 'billed at implementation kickoff, weeks after the win');
    assert.ok(m.detail.includes('R-'), 'traceable to the requirements');
  });
});

test('shipping the feature before kickoff turns an optimistic answer into an honest one', () => {
  const s = world(9, { features: FEATURES.slice(0, 3) });
  const r = numbered([req('core', { mandatory: true, weight: 3 }), req('workflow')]);
  const b = bid(s, { reqs: r, securityRequired: false });
  assert.equal(R.reqTruth(s, r[1]), 'none');
  R.decideBid(s, b, 'bid');
  assert.ok(R.overclaimSeverity('comply', R.reqTruth(s, r[1])) === 1);
  s.apps.product.features.push({ id: 'fw', title: 'Workflow approvals', spec: 'approvals', problem: 'x', status: 'shipped' });
  assert.equal(R.overclaimSeverity('comply', R.reqTruth(s, r[1])), 0);
});

test('a missing form disqualifies the response and logs the cost', () => {
  const s = world();
  withRfp({ minorInformalityWaived: 0 }, () => {
    const b = bid(s);
    R.decideBid(s, b, 'bid');
    tick(s, b.answerDay - s.day + 1);
    fullResponse(s, b, { forms: false });
    R.completeForm(s, b, 'w9');
    assert.ok(R.complianceProblems(s, b).some((p) => p.id === 'forms'), 'the compliance check finds it');
    R.submitBid(s, b);
    runUntil(s, () => b.status === 'disqualified');
    assert.equal(b.status, 'disqualified');
    assert.equal(b.cause, 'forms');
    const m = mistakes(s, 'disqualified_missing_form')[0];
    assert.ok(m && m.cost.hours > 5, 'the hours spent are written off');
  });
});

test('late submission: the bid you started and never submitted is rejected and costs the hours', () => {
  const s = world();
  const b = bid(s);
  R.decideBid(s, b, 'bid');
  tick(s, b.answerDay - s.day + 1);
  R.completeForm(s, b, 'w9');
  runUntil(s, () => b.status === 'disqualified', 80);
  assert.equal(b.cause, 'late');
  assert.equal(mistakes(s, 'late_submission').length, 1);
});

test('an unacknowledged addendum is non-compliance; acknowledging it is not', () => {
  const s = world();
  const mk = (ack) => { const b = bid(s); R.decideBid(s, b, 'bid'); tick(s, Math.max(0, b.answerDay - s.day + 1)); fullResponse(s, b, { ack }); return b; };
  withRfp({ minorInformalityWaived: 0 }, () => {
    const a = mk(false);
    assert.ok(a.addenda.length >= 1 && R.unackedAddenda(a).length >= 1);
    assert.ok(R.complianceProblems(s, a).some((p) => p.id === 'addenda'));
  });
});

test('good specific questions reveal evaluation weights, loosen a requirement and hint at the incumbent; generic ones do not', () => {
  const s = world();
  const b = bid(s, { wired: true, weightsStated: false });
  R.decideBid(s, b, 'bid');
  const loose = b.reqs.find((r) => r.id === 'rbac');
  loose.loosenable = true;
  const generic = R.judgeQuestion('Can you extend the deadline for everybody please?', b);
  assert.ok(generic.score < 0.4);
  const w = R.askQuestion(s, b, 'How will the evaluation committee weight price against technical merit, and what are the points per criterion in the scoring rubric?');
  const l = R.askQuestion(s, b, `Requirement ${loose.n} asks for role-based access control as mandatory; would an equivalent permission model with two levels be acceptable?`);
  const i = R.askQuestion(s, b, 'Is the current vendor contract expiring this year, and will the district replace the existing system?');
  const g = R.askQuestion(s, b, 'Can you extend the deadline for everybody please?');
  assert.ok(w.score >= 0.55 && l.score >= 0.55 && i.score >= 0.55 && g.score < 0.4);
  assert.equal(b.weightsKnown, false);
  tick(s, b.answerDay - s.day + 1);
  assert.equal(b.weightsKnown, true, 'weights revealed');
  assert.equal(loose.mandatory, false, 'requirement loosened by the addendum');
  assert.ok(b.clue, 'incumbent clue');
  assert.equal(g.reveal, null);
  assert.ok(b.addenda[0].text.includes('Answers to written questions'));
  assert.throws(() => R.askQuestion(s, b, 'Is there anything else about the project timeline we should know now?'), /deadline has passed/);
  assert.ok(R.unackedAddenda(b).length >= 1);
});

test('a well-posed budget question can reveal the budget; a pitch cannot', () => {
  const s = world();
  let revealed = 0;
  for (let i = 0; i < 6; i++) {
    const b = bid(s, { budget: 123000 });
    R.decideBid(s, b, 'bid');
    R.askQuestion(s, b, `What is the anticipated annual budget or not-to-exceed amount for ${b.reqs[3].n} and the contract as a whole?`);
    tick(s, b.answerDay - s.day + 1);
    if (b.budgetKnown) revealed++;
  }
  assert.ok(revealed >= 3, `budget revealed on ${revealed}/6 bids`);
  const b = bid(s);
  assert.ok(R.judgeQuestion('Our platform is the best and we offer the leading solution; what is your budget?', b).score < R.judgeQuestion('What is the anticipated annual budget for this contract?', b).score);
});

test('a keyword-stuffed Q&A question scores below a sharp one, and the live officer\'s read outweighs the keyword heuristic', async () => {
  const s = world();
  const b = bid(s);
  const stuffed = 'Regarding R-01 R-02 R-03 R-04, what is the budget, the evaluation weights, the scoring rubric points, the incumbent contract expiration and is every mandatory requirement acceptable as equivalent?';
  const sharp = `${b.reqs[3].n} is mandatory; would an equivalent permission model with two levels be acceptable?`;
  assert.ok(R.judgeQuestion(stuffed, b).score < 0.55, 'stuffing every lever into one line is not a good question');
  assert.ok(R.judgeQuestion(sharp, b).score >= 0.55);
  const llm = (score) => ({ ask: async () => ({ mock: false, data: { score, feedback: 'Ask one thing.' } }) });
  const low = await R.judgeQuestionLlm(llm(0), s, b, sharp);
  assert.ok(low.score <= 0.2 + 1e-9, `a zero from the officer caps the score (${low.score})`);
  assert.equal(low.issues[0], 'Ask one thing.');
  const offline = await R.judgeQuestionLlm({ ask: async (o) => ({ mock: true, data: o.fallback() }) }, s, b, sharp);
  assert.equal(offline.score, R.judgeQuestion(sharp, b).score, 'offline the heuristic stands');
});

test('the debrief window: ask in time and see the real scores; miss it and the cost is logged', () => {
  const s = world();
  const mk = () => { const b = bid(s, { wired: true }); R.decideBid(s, b, 'bid'); tick(s, b.answerDay - s.day + 1); fullResponse(s, b); R.submitBid(s, b); runUntil(s, () => ['lost', 'disqualified'].includes(b.status)); return b; };
  const a = mk();
  assert.ok(['lost', 'disqualified'].includes(a.status) && a.cause);
  const d = R.requestDebrief(s, a);
  assert.equal(d.cause, 'wired');
  assert.ok(d.scores && d.scores.total <= R.RFP.wiredCap && d.reason && d.advice.length);
  assert.throws(() => R.requestDebrief(s, a), /already/);
  const b = mk();
  tick(s, R.RFP.debriefDays + 2);
  assert.throws(() => R.requestDebrief(s, b), /closed/);
  assert.equal(mistakes(s, 'no_debrief_requested').length, 1);
  assert.equal(mistakes(s, 'bid_on_wired_rfp').length, 2, 'wired bids are logged when the evaluation lands');
});

test('BAFO: a modest cut is fine, a cut below cost logs a mistake', () => {
  const s = world();
  const mk = () => { const b = bid(s); R.decideBid(s, b, 'bid'); b.response.price = b.listPrice * 0.8; b.status = 'bafo'; b.bafo = { invitedDay: s.day, dueDay: s.day + 5, price: null, cutPct: 0 }; return b; };
  const a = mk();
  const ok = R.submitBafo(s, a, { cutPct: 0.05, term: 'three-year term with annual prepay' });
  assert.equal(ok.belowCost, false);
  assert.equal(mistakes(s, 'bafo_below_cost').length, 0);
  const b = mk();
  const bad = R.submitBafo(s, b, { cutPct: 0.6 });
  assert.equal(bad.belowCost, true);
  const m = mistakes(s, 'bafo_below_cost');
  assert.equal(m.length, 1);
  assert.ok(m[0].cost.usd > 0 && m[0].detail.includes('loses roughly'));
});

test('the content library cuts hours on later bids and is not poisoned by overclaims', () => {
  const s = world();
  const b1 = bid(s);
  const before = R.estimateHours(s, b1);
  R.decideBid(s, b1, 'bid');
  tick(s, b1.answerDay - s.day + 1);
  fullResponse(s, b1);
  R.submitBid(s, b1);
  const lib = R.addToLibrary(s, b1);
  assert.ok(lib.added >= 15);
  const b2 = bid(s);
  const after = R.estimateHours(s, b2);
  assert.ok(after < before * 0.9, `${after} h vs ${before} h`);
  s.apps.crm.rfp.library.entries = 120;
  assert.ok(R.estimateHours(s, bid(s)) < before * 0.8, 'a mature library cuts the work by a fifth or more');
  assert.ok(R.libraryFactor(s) < 0.6);
});

test('forced RFP on a deal opens a bid, the bid process decides the deal, rfpMult uses the evaluated score, and calendar deadlines exist', () => {
  const s = world();
  const { contact, company } = addContact(s, { firstName: 'A', lastName: 'Lee', email: 'a@district.org', title: 'Director', company: 'Pine District', domain: 'district.org' });
  Object.assign(company, { segmentId: 'k12', segmentManual: true });
  const deal = ensureDeal(s, { companyId: company.id, contactId: contact.id, stage: 'qualified' });
  Object.assign(deal, { segmentId: 'k12', amount: 80000, quantity: 50 });
  deal.proc = { cardPay: false, rfp: true, coop: [], board: null, notes: [] };
  deal.stage = 'proposal'; deal.decisionDay = s.day;
  tick(s);
  assert.ok(deal.rfpBidId, 'bid opened');
  const b = R.bidById(s, deal.rfpBidId);
  assert.equal(deal.decisionDay, null);
  assert.ok(salesEvents(s, { types: ['rfp_issued'] }).length === 1);
  const cal = ensureCalendar(s).events.filter((e) => e.refId === b.id && e.kind === 'deadline');
  assert.equal(cal.length, 2, 'question deadline and due date');
  assert.ok(R.managedByBid(s, deal));
  const flat = rfpMult(s, deal);
  assert.ok(flat >= 0.5 && flat <= 0.8, 'flat multiplier before an evaluation');
  b.finalTotal = 90;
  assert.ok(rfpMult(s, deal) > 1, 'evaluated score replaces the flat multiplier');
  // no-bid through the process: the deal is lost cleanly and the decision is recorded
  R.decideBid(s, b, 'no_bid');
  assert.equal(deal.stage, 'lost');
  assert.equal(b.status, 'no_bid');
  assert.equal(ensureCalendar(s).events.filter((e) => e.refId === b.id && e.status === 'scheduled').length, 0, 'deadlines removed');
  assert.throws(() => declineRfp(s, deal));
});

test('events: issued, question deadline, due soon, addendum, lost', () => {
  const s = world();
  const b = bid(s);
  R.decideBid(s, b, 'bid');
  runUntil(s, () => b.status === 'disqualified', 80);
  const types = new Set(salesEvents(s).map((e) => e.type));
  for (const t of ['rfp_issued', 'rfp_question_deadline', 'rfp_due_soon', 'rfp_addendum_issued', 'rfp_lost']) assert.ok(types.has(t), t);
});

test('cooperative contract: months of review, then buyers can skip the RFP and the fee applies', () => {
  const s = world();
  const app = R.startCoop(s, 'naspo');
  assert.ok(app.needed >= 40 && app.needed <= 120);
  assert.throws(() => R.submitCoop(s, app.id), /needs about/);
  R.workCoop(s, app.id, app.needed);
  R.submitCoop(s, app.id);
  assert.ok(app.decisionDay - s.day >= 120);
  app.p = 1;
  runUntil(s, () => app.status !== 'submitted', 300);
  assert.equal(app.status, 'awarded');
  assert.ok(s.apps.crm.paperAssets.coop_contract != null);
  assert.ok(R.COOPS.find((c) => c.id === 'naspo').feePct === 0.0025);
});

test('public feed: nothing until you register on bid portals', () => {
  const s = world();
  tick(s, 60);
  assert.equal(R.bidsOf(s).length, 0);
  R.registerFeed(s);
  tick(s, 150);
  assert.ok(R.bidsOf(s).filter((b) => b.source === 'public').length >= 2);
  assert.throws(() => R.registerFeed(s));
});

// ---------------------------------------------------------------------------
// Operator tiers: scripted operators facing the same six bids
// ---------------------------------------------------------------------------

const PLAYBOOK = {
  stellar: { investigate: true, noBid: (b, q) => q.bad, questions: 'good', honest: true, forms: true, ack: true, check: true, early: true, library: true, debrief: 1, summary: 'specific' },
  good: { investigate: false, noBid: (b, q) => q.hardCert || q.fit < 0.6, questions: 'one', honest: true, forms: true, ack: true, check: false, early: true, library: false, debrief: 0.8, summary: 'specific' },
  average: { investigate: false, noBid: (b, q) => q.hardCert, questions: 'generic', honest: false, overclaims: 2, forms: 'most', ack: true, check: false, early: false, library: false, debrief: 0.3, summary: 'reused' },
  mediocre: { investigate: false, noBid: () => false, questions: 'none', honest: false, overclaims: 99, forms: false, ack: false, check: false, early: false, library: false, debrief: 0, summary: 'boilerplate' },
};
const BOILER = 'We are a leading provider of innovative, best-in-class, world-class solutions and we are pleased to submit our proposal. We look forward to a robust and seamless partnership that will transform your organization with cutting edge technology and a proven track record.';

function scriptedWorld(style, seed) {
  const s = world(seed);
  const p = PLAYBOOK[style];
  const plan = [
    { segmentId: 'k12', wired: false, reqs: goodReqs() },
    { segmentId: 'local_gov', wired: true, reqs: goodReqs() },
    { segmentId: 'higher_ed', wired: false, reqs: poorReqs() },
    { segmentId: 'k12', wired: false, reqs: goodReqs() },
    { segmentId: 'state_gov', wired: true, reqs: poorReqs() },
    { segmentId: 'local_gov', wired: false, reqs: goodReqs() },
  ];
  let lastSummary = null;
  const mine = [];
  const acted = new Set();
  for (let day = 0; day < 330; day++) {
    if (day % 8 === 0 && mine.length < plan.length) {
      const o = plan[mine.length];
      const b = bid(s, { ...o, budget: 1e9, key: `scripted|${mine.length}`, dueDay: s.day + 34 });
      mine.push(b);
      // decide
      const q = R.bidQuality(s, b);
      if (p.investigate) R.investigate(s, b);
      const skip = p.noBid(b, q);
      if (skip) { R.decideBid(s, b, 'no_bid'); continue; }
      R.decideBid(s, b, 'bid');
      if (p.questions === 'good') {
        R.askQuestion(s, b, 'How will the evaluation committee weight price against technical merit in the scoring rubric?');
        R.askQuestion(s, b, 'Is the current vendor contract expiring this year, and will the district replace the existing system?');
      } else if (p.questions === 'one') R.askQuestion(s, b, 'What is the anticipated annual budget for this contract?');
      else if (p.questions === 'generic') R.askQuestion(s, b, 'Can you extend the deadline for everybody please?');
    }
    for (const b of mine) {
      if (b.status === 'bidding' && !acted.has(b.id) && s.day >= (p.early ? b.dueDay - 2 : b.dueDay)) {
        acted.add(b.id);
        try {
          if (p.ack && !(style === 'average' && mine.indexOf(b) === 0)) for (const a of b.addenda) if (!a.acked) R.ackAddendum(s, b, a.id);
          for (const f of b.forms) {
            if (f.done || f.optional) continue;
            if (p.forms === false) continue;
            if (p.forms === 'most' && f.id === 'coi_disclosure' && mine.indexOf(b) === 3) continue;
            if (f.id === 'insurance_cert' && s.apps.crm.paperAssets?.coi_insurance == null) R.workCredential(s, 'insurance', 3, b);
            R.completeForm(s, b, f.id);
          }
          const answers = {};
          let over = p.overclaims ?? 0;
          for (const r of b.reqs) {
            const t = R.reqTruth(s, r);
            if (p.honest || t === 'full') answers[r.id] = R.honestAnswer(t);
            else if (over > 0 && !r.cert) { answers[r.id] = 'comply'; over--; } else answers[r.id] = R.honestAnswer(t);
            if (style === 'mediocre') answers[r.id] = 'comply';
          }
          R.answerMatrix(s, b, answers);
          if (b.securityRequired) R.workSecurity(s, b, 40);
          R.setPrice(s, b, b.listPrice);
          R.chooseReferences(s, b, R.referenceCandidates(s, b).map((c) => c.id));
          const text = p.summary === 'specific' ? SUMMARY(b) : p.summary === 'reused' ? (lastSummary ?? SUMMARY(b)) : BOILER;
          if (p.summary === 'reused') lastSummary = lastSummary ?? SUMMARY(b);
          R.writeSummary(s, b, text);
          if (p.check) R.runComplianceCheck(s, b);
          R.submitBid(s, b);
          if (p.library) R.addToLibrary(s, b);
        } catch (e) { /* an unfinished response is itself the behaviour */ }
      }
      if (['lost', 'disqualified'].includes(b.status) && b.submittedDay != null && !b.debrief && s.day <= b.debriefBy && !acted.has(`d${b.id}`)) {
        acted.add(`d${b.id}`);
        if (mine.indexOf(b) % 5 < p.debrief * 5) R.requestDebrief(s, b);
      }
    }
    tick(s);
  }
  return s;
}

test('tier separation: scripted stellar > good > average > mediocre bid operators on the same six RFPs', () => {
  for (const seed of [3, 11, 29]) {
    const reads = ['stellar', 'good', 'average', 'mediocre'].map((style) => ({ style, r: readOperator(scriptedWorld(style, seed), 'rfp_bids') }));
    for (const { style, r } of reads) assert.equal(r.tier, style, `seed ${seed}: ${style} reads ${r.tier} (score ${r.score}; ${r.evidence.join(' | ')})`);
    for (let i = 1; i < reads.length; i++) assert.ok(reads[i - 1].r.score > reads[i].r.score, `seed ${seed}: ${reads[i - 1].style} ${reads[i - 1].r.score} > ${reads[i].style} ${reads[i].r.score}`);
    assert.ok(reads[3].r.coaching.length > 1);
  }
});

test('mediocre play leaves a traceable bill of mistakes; stellar play leaves almost none', () => {
  const med = scriptedWorld('mediocre', 3), stel = scriptedWorld('stellar', 3);
  const cost = (s) => (s.mistakes ?? []).filter((m) => m.functionId === 'rfp_bids').reduce((a, m) => a + m.cost.hours + (m.cost.usd || 0) / 50 + m.cost.reputation * 4, 0);
  assert.ok(cost(med) > cost(stel) + 40, `${cost(med)} vs ${cost(stel)}`);
  const ids = new Set((med.mistakes ?? []).map((m) => m.id));
  assert.ok(ids.has('bid_on_wired_rfp') || ids.has('disqualified_missing_form') || ids.has('false_certification_claim') || ids.has('boilerplate_response'), [...ids].join(','));
});

test('reader is unknown on a fresh company and before three go/no-go calls', () => {
  const s = world();
  assert.equal(readOperator(s, 'rfp_bids').tier, 'unknown');
  const b = bid(s); R.decideBid(s, b, 'no_bid');
  assert.equal(readOperator(s, 'rfp_bids').tier, 'unknown');
  assert.ok(OPERATOR_TIERS.rfp_bids.tiers.stellar.behaviours.length && OPERATOR_TIERS.rfp_bids.traps.length);
  assert.equal(TIER_RANK.unknown, -1);
});

// ---------------------------------------------------------------------------
// Automations catalog coverage
// ---------------------------------------------------------------------------

test('automations: every RFP event is a catalog trigger and the actions exist, customer-facing ones need approval', () => {
  for (const t of ['rfp_issued', 'rfp_question_deadline', 'rfp_due_soon', 'rfp_addendum_issued', 'rfp_shortlisted', 'rfp_awarded', 'rfp_lost']) assert.ok(TRIGGERS[`sales_${t}`]?.ext, t);
  for (const a of ['rfp_no_bid', 'rfp_request_debrief']) { assert.ok(ACTIONS[`sales_${a}`]?.customer, a); assert.ok(SALES_ACTIONS[a]); }
  const s = world();
  const b = bid(s);
  assert.equal(SALES_ACTIONS.rfp_no_bid.run(s, { bidId: b.id }, { approved: false }).error, 'needs approval');
  assert.equal(b.status, 'issued');
  assert.equal(SALES_ACTIONS.rfp_no_bid.run(s, { bidId: b.id }, { approved: true, dryRun: true }).ok, true);
  assert.equal(b.status, 'issued', 'dry run writes nothing');
  assert.equal(SALES_ACTIONS.rfp_no_bid.run(s, { bidId: b.id }, { approved: true }).ok, true);
  assert.equal(b.status, 'no_bid');
});

test('investigating the buyer reveals the wiring most of the time, never perfectly', () => {
  const s = world();
  let right = 0, n = 40;
  for (let i = 0; i < n; i++) { const b = bid(s, { wired: i % 2 === 0, key: `inv${i}` }); R.investigate(s, b); if (b.clue.likelyWired === b.wired) right++; }
  assert.ok(right >= 26 && right < n, `${right}/${n} right`);
  assert.throws(() => R.investigate(s, R.bidsOf(s)[0]), /already/);
});


test('the Bids tab renders for every stage of a bid without throwing, and escapes buyer text', () => {
  const s = world();
  assert.ok(String(bidsView(s)).includes('Register'), 'registration prompt before the feed is on');
  const b = bid(s, { buyer: '<script>alert(1)</script> District' });
  const stages = ['issued', 'bidding', 'submitted', 'shortlisted', 'bafo', 'finalists', 'notice_of_intent', 'negotiation', 'board', 'awarded', 'won', 'lost', 'disqualified', 'no_bid', 'lapsed'];
  R.decideBid(s, b, 'bid');
  b.response.summary = { text: 'x', score: 0.2, boilerplate: true, issues: ['Never names the buyer.'], words: 1, pages: 1 };
  b.bafo = { invitedDay: s.day, dueDay: s.day + 5, price: null, cutPct: 0 };
  b.finalDay = b.oralsDay = b.boardDay = b.nextDay = b.evalDay = s.day + 3; b.debriefBy = b.protestBy = s.day + 2; b.submittedDay = s.day; b.cause = 'price';
  for (const st of stages) { b.status = st; const out = String(bidsView(s, b.id)); assert.ok(out.length > 200, st); assert.ok(!out.includes('<script>alert'), 'escaped'); }
  assert.ok(String(bidsView(s)).includes('Open to decide'));
  assert.ok(bidsBadge(s) >= 0);
  const deal = ensureDeal(s, { companyId: addContact(s, { firstName: 'A', email: 'a@z.org', title: 'Dir', company: 'Z', domain: 'z.org' }).company.id, stage: 'qualified' });
  deal.rfpBidId = b.id; b.status = 'bidding';
  assert.ok(String(dealBidBox(s, deal)).includes('Open the bid'));
});


test('deal RFP award on a monthly SMB deal bills the awarded annual price, not ~20% more', () => {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat Doe', seed: 11 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 2e6, counterparty: 'Pat', category: 'owner_contribution' });
  s.plans[0].price = 400; s.plans[0].interval = 'month';
  ensureCrm(s);
  const { contact } = addContact(s, { firstName: 'Ann', lastName: 'Lee', email: 'ann@district9.org', title: 'Director', company: 'District 9', domain: 'district9.org' });
  const deal = ensureDeal(s, { companyId: contact.companyId, contactId: contact.id, stage: 'proposal' });
  Object.assign(deal, { segmentId: 'k12', quantity: 10, annual: false, proc: { rfp: true, cardPay: false, notes: [] } });
  const b = R.openBidForDeal(s, deal);
  Object.assign(b, { status: 'negotiation', nextDay: s.day, public: false, finalPrice: Math.round(b.listPrice * 0.9) });
  R.rfpDay(s);
  assert.equal(b.status, 'awarded');
  assert.equal(deal.annual, true);
  closeWon(s, deal);
  const sub = s.stripe.subscriptions.find((x) => x.id === deal.subscriptionId);
  const billedYear = sub.price * (sub.quantity ?? 1) * (1 - (sub.discountPct ?? 0)) * (sub.interval === 'year' ? 1 : 12);
  assert.ok(Math.abs(billedYear - b.finalPrice) / b.finalPrice < 0.02, `billed ${billedYear} vs awarded ${b.finalPrice}`);
});
