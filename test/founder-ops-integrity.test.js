// Loophole blockers for lending, legal self-attestation, people/hiring, marketing/platform enforcement and books:
// a misstatement is recorded when made, can pass early, is caught where the real world checks (credit pull,
// underwriting documents, processor KYC, diligence, backchannels, platform sweeps, CPA review), and costs something
// traceable. Honest play passes cheaply. Short, few-seed sims only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { post, seedDefaultStack } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { detectP, ensureIntegrity, openLies, reputationMult } from '../public/core/integrity.js';
import { ensurePersonal, setStatedProfile, statedGap, contributeToCompany, takePersonalLoan, personalMonth, askFamily } from '../public/core/personal.js';
import { lenderProfile, applyForFinancing, recheckApplications, ensureDebt, misstatedFor } from '../public/core/debt.js';
import * as L from '../public/data/lenders.js';
import { ensureLegal, completeKyc, legalDay, veilExposure, legalDiligenceFindings, runLegalDiligence, setupDpa, KYC } from '../public/apps/legal/sim.js';
import { ciiaaSigned } from '../public/apps/legal/api.js';
import { collectCiiaa, startOnboarding } from '../public/apps/people/onboarding.js';
import { rangeQuality, recordCandidateClaims, believedRunway, candidateBackchannel, extractEquityClaims } from '../public/apps/people/integrity.js';
import { payTransparencyCheck, hasGoodFaithRange } from '../public/apps/people/negotiation.js';
import { interviewVerified } from '../public/apps/research.js';
import { recordFakeReviews, rollPlatformDetection, onDetected, fakeReviewsDay, ensureFake, FAKE } from '../public/core/fakereviews.js';
import { buyFakeReviews } from '../public/apps/helpdesk.js';
import { respond } from '../public/apps/marketworld/engine.js';
import { policyScan, submissionReview, adPolicyDay, appealBan } from '../public/apps/growth/adpolicy.js';
import { ensureAds, createAccount, deliveryState } from '../public/apps/growth/adsEngine.js';
import { naContradiction, recordNaClaim, falseNaItems, closeState } from '../public/apps/money/ledger.js';
import { cpaQuote } from '../public/apps/money/compliance.js';
import { monthOf } from '../public/apps/money/common.js';

const fresh = (seed = 7, { model = 'smb', path = 'indie' } = {}) => {
  const s = newState({ companyName: 'Acme', model, path, founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  return s;
};
const employed = (s, extra = {}) => Object.assign(ensurePersonal(s), { fico: 740, job: 'full_time', incomeType: 'w2', annualIncome: 130000, priorW2Income: 130000, liquidSavings: 30000, monthlyLivingCosts: 3500, ...extra });
const product = (id) => L.LENDER_PRODUCTS.find((p) => p.id === id);
const mistakes = (s, re) => (s.mistakes ?? []).filter((m) => re.test(m.id));

// Apply and run underwriting to the decision. Returns the application.
function applyAndDecide(s, id, amount, opts) {
  const p = product(id);
  const r = L.underwrite(lenderProfile(s), p);
  assert.ok(r.approved, `${id} prequalifies on the stated profile: ${r.reason}`);
  const app = applyForFinancing(s, p, r, Math.min(amount, r.maxAmount), opts);
  if (app.status !== 'pending') return app;
  s.day = app.fundDay;
  recheckApplications(s);
  return app;
}

// ---------------------------------------------------------------------------
// Lending
// ---------------------------------------------------------------------------

test('lending: the form changes what you STATE, not the truth; prequalification uses the statement', () => {
  const s = fresh();
  employed(s, { homeEquity: 0 });
  setStatedProfile(s, { homeEquity: 150000, fico: 790 });
  const p = ensurePersonal(s);
  assert.equal(p.homeEquity, 0, 'truth unchanged');
  assert.ok(statedGap(p, 'homeEquity') >= 1 && statedGap(p, 'fico') > 0);
  assert.equal(lenderProfile(s).homeEquity, 150000);
  assert.equal(lenderProfile(s, { truth: true }).homeEquity, 0);
  assert.deepEqual(misstatedFor(s, product('heloc')).sort(), ['fico', 'homeEquity']);
  setStatedProfile(s, { homeEquity: 0, fico: 740 });
  assert.equal(Object.keys(p.stated).length, 0, 'stating the truth clears the overrides');
});

test('lending: the hard pull shows the real score at once; a declined pull costs the inquiry and is logged', () => {
  const s = fresh(3);
  employed(s, { fico: 650 });
  setStatedProfile(s, { fico: 780 });
  const app = applyAndDecide(s, 'pl_prime_online', 20000);
  assert.equal(app.status, 'declined', 'prime lender minimum is 660');
  assert.ok(mistakes(s, /^misstated_credit_profile$/).length === 1);
  assert.equal(ensurePersonal(s).inquiries.length, 1, 'the hard inquiry still counts');
});

test('lending: honest applications pass without a misstatement trace; underwriting catches overstated assets (audit) and forged ones mostly (forensic)', (t) => {
  let honestFunded = 0, honestMistakes = 0, statedCaught = 0, forgedCaught = 0, forgedFunded = 0;
  const N = 40;
  for (let seed = 1; seed <= N; seed++) {
    const h = fresh(seed); employed(h, { homeEquity: 150000 });
    const a = applyAndDecide(h, 'heloc', 50000);
    if (a.status === 'funded') honestFunded++;
    honestMistakes += mistakes(h, /misstated|fraud/).length;

    const l = fresh(seed); employed(l, { homeEquity: 20000 }); setStatedProfile(l, { homeEquity: 150000 });
    const b = applyAndDecide(l, 'heloc', 50000);
    if (b.status === 'declined' && b.reason === 'misstatement found in underwriting') statedCaught++;

    const f = fresh(seed); employed(f, { homeEquity: 20000 }); setStatedProfile(f, { homeEquity: 150000 });
    const c = applyAndDecide(f, 'heloc', 50000, { forged: true });
    assert.equal(c.forged, true);
    if (c.reason === 'misstatement found in underwriting') { forgedCaught++; assert.ok(mistakes(f, /^loan_fraud_forged_docs$/).length === 1); assert.ok(f.bank.txns.some((t) => /fraud referral/.test(t.description))); }
    else if (c.status === 'funded') forgedFunded++;
  }
  t.diagnostic(JSON.stringify({ honestFunded, statedCaught, forgedCaught, forgedFunded, N }));
  assert.equal(honestMistakes, 0, 'honest operators leave no misstatement trace');
  assert.ok(honestFunded >= N * 0.6, `honest HELOCs mostly fund (${honestFunded}/${N})`);
  assert.ok(statedCaught >= N - 1, `an appraisal catches overstated equity (${statedCaught}/${N})`);
  assert.ok(forgedCaught / N > 0.55 && forgedCaught / N < 0.95, `forged documents are caught 60-80% of the time (${forgedCaught}/${N})`);
  assert.ok(forgedFunded > 0, 'some forgeries get through at first');
  assert.ok(detectP(0.2, 'forensic') < detectP(1, 'forensic'), 'odds rise with the size of the lie');
});

test('lending: a forged loan that funded is still found when the borrower defaults (audit at collections)', () => {
  let found = 0, tried = 0;
  for (let seed = 1; seed <= 40 && tried < 6; seed++) {
    const f = fresh(seed); employed(f, { homeEquity: 20000 }); setStatedProfile(f, { homeEquity: 150000 });
    const c = applyAndDecide(f, 'heloc', 50000, { forged: true });
    if (c.status !== 'funded') continue;
    tried++;
    const p = ensurePersonal(f);
    p.missedMonths = 2;
    personalMonth(Object.assign(f, { day: f.day + (30 - ((f.day) % 30)) })); // any month end; the review only needs delinquency
    if (mistakes(f, /^loan_fraud_forged_docs$/).length) found++;
  }
  assert.ok(tried > 0, 'some forged applications funded');
  assert.equal(found, tried, 'the default review re-pulls the documents and finds every one');
});

test('lending: personal-purpose loan money moved into the company is traced; review finds it, and delinquency makes it near certain', () => {
  const s = fresh(5); employed(s);
  takePersonalLoan(s, { productId: 'pl_prime_online', name: 'Online personal loan (prime lender)', kind: 'personal_loan', amount: 20000, apr: 11, feePct: 0, termMonths: 36 });
  const loan = ensurePersonal(s).loans[0];
  assert.equal(loan.purposeRestricted, true);
  contributeToCompany(s, 45000);
  assert.ok(loan.businessUse >= 14000, `traced ${loan.businessUse}`);
  assert.equal(openLies(s, { audience: 'lender', recipientId: `loan:${loan.id}` }).length, 1);
  // A clean borrower: ~1%/month routine reviews. A delinquent one: reference-strength each month.
  ensurePersonal(s).missedMonths = 1;
  for (let m = 0; m < 6 && !loan.accelerated; m++) { s.day += 30; personalMonth(s); ensurePersonal(s).missedMonths = Math.max(1, ensurePersonal(s).missedMonths ?? 1); }
  assert.ok(loan.accelerated, 'accelerated within a few delinquent months');
  assert.ok(mistakes(s, /^loan_purpose_breach$/).length === 1 && reputationMult(s, 'lender') < 1);
});

test('lending: family money is known by asking, not by typing a number', () => {
  const s = fresh(11); employed(s);
  const amt = askFamily(s);
  assert.equal(ensurePersonal(s).familyOfferAmount, amt);
  assert.throws(() => askFamily(s));
});

// ---------------------------------------------------------------------------
// Legal: KYC/commingling, CIIAA signatures, diligence, DPA promises
// ---------------------------------------------------------------------------

function incorporated(seed) {
  const s = fresh(seed, { path: 'vc' });
  s.company.incorporated = true; s.company.entity = 'ccorp';
  const Lg = ensureLegal(s);
  Lg.incorporation = { provider: 'atlas', status: 'done', entity: 'ccorp' };
  Lg.ein = { status: 'done', readyDay: 0 };
  Lg.kyc = { done: false, dueDay: s.day + 30 };
  const cu = createCustomer(s, { name: 'Buyer', email: 'b@x.com' });
  subscribe(s, cu.id, s.plans[0].id);
  return s;
}

test('KYC: an overdue update draws a payout hold most of the time within two months; doing it on time never does', () => {
  let held = 0, honestHeld = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = incorporated(seed);
    s.day += 31;
    for (let d = 0; d < 60; d++) { s.day++; legalDay(s); }
    if (ensureLegal(s).kyc.hold) held++;
    assert.ok(ensureLegal(s).commingledDays >= 60);
    const h = incorporated(seed);
    completeKyc(h);
    h.day += 31;
    for (let d = 0; d < 60; d++) { h.day++; legalDay(h); }
    if (ensureLegal(h).kyc.hold) honestHeld++;
  }
  assert.ok(held >= 8 && held < 12, `payout holds ${held}/12`);
  assert.equal(honestHeld, 0);
});

test('KYC: the hold really freezes payouts until the update, and commingling weakens the veil', () => {
  const s = incorporated(2);
  ensureLegal(s).kyc.dueDay = s.day - 40;
  ensureLegal(s).commingledDays = 40;
  ensureLegal(s).kyc.hold = { since: s.day, released: null };
  s.stripe.pending.push({ amount: 500, availableDay: s.day, chargeId: 't' });
  legalDay(s);
  assert.ok(s.stripe.pending.every((x) => x.availableDay >= s.day + KYC.releaseDays), 'pending funds pushed out');
  assert.equal(veilExposure(s).pierce, KYC.veilPierceP);
  completeKyc(s);
  assert.ok(ensureLegal(s).kyc.hold.released != null);
  const clean = incorporated(3);
  assert.equal(veilExposure(clean).pierce, 0);
});

test('CIIAA: a template in the offer is not a signature; diligence finds unsigned hires ~85% of the time; signing first costs nothing later', () => {
  let found = 0;
  const N = 20;
  for (let seed = 1; seed <= N; seed++) {
    const s = incorporated(seed);
    ensureLegal(s).docs.ipAssignment = true;
    s.apps.people = { members: [{ id: 'm1', name: 'Dev One', kind: 'employee', engagement: 'employee', region: 'us', status: 'active', startDay: s.day, ciiaa: true, ciiaaSigned: null }] };
    assert.equal(ciiaaSigned(s.apps.people.members[0]), false);
    const r = runLegalDiligence(s, { audience: 'investor', counterparty: `seed${seed}` });
    if (r.found.some((f) => f.id === 'hire_ciiaa')) { found++; assert.ok(r.usd > 0 && r.delayDays >= 14); }
  }
  assert.ok(found >= 13 && found <= 20, `found ${found}/${N}`);
  const ok = incorporated(1);
  ensureLegal(ok).docs.ipAssignment = true;
  const m = { id: 'm2', name: 'Dev Two', kind: 'employee', engagement: 'employee', region: 'us', status: 'active', startDay: ok.day + 5, ciiaa: true, ciiaaSigned: null };
  ok.apps.people = { members: [m] };
  startOnboarding(ok, m);
  assert.ok(m.onboarding.items.ciiaa, 'collecting the signature is an onboarding step');
  collectCiiaa(ok, 'm2');
  assert.equal(legalDiligenceFindings(ok).length, 0);
  const r = runLegalDiligence(ok, { counterparty: 'clean' });
  assert.equal(r.found.length + r.usd, 0, 'clean paperwork passes diligence at no cost');
});

test('DPA: signing promises records them; a privacy review asks for the evidence', () => {
  const s = incorporated(4);
  setupDpa(s, 'template');
  const lies = openLies(s, { audience: 'customer', recipientId: 'dpa' });
  assert.ok(lies.length >= 4, 'unbacked DPA promises are open claims to customers');
});

// ---------------------------------------------------------------------------
// People: pay ranges and what candidates were told
// ---------------------------------------------------------------------------

test('pay transparency: a meaningless range counts as no range', () => {
  assert.equal(rangeQuality({ payLo: 150000, payHi: 185000 }), 'typical');
  assert.equal(rangeQuality({ payLo: 60000, payHi: 250000 }), 'not_good_faith');
  assert.equal(hasGoodFaithRange({ payLo: 60000, payHi: 250000 }), false);
  const s = fresh(1);
  s.apps.people = { members: [], jobs: [], ops: { workplace: { state: 'CO' } } };
  payTransparencyCheck(s, { id: 'j1', title: 'Engineer', region: 'us', remote: true, payLo: 60000, payHi: 250000 });
  assert.ok(mistakes(s, /^bad_faith_salary_range$/).length === 1);
});

test('candidates: a runway claim is believed until the backchannel; senior candidates check harder; honest founders lose nothing', () => {
  let caughtSenior = 0, caughtJunior = 0;
  const N = 24;
  for (let seed = 1; seed <= N; seed++) {
    for (const senior of [true, false]) {
      const s = fresh(seed);
      post(s, { amount: -25000, counterparty: 'Gusto', description: 'Payroll', category: 'payroll', method: 'payroll' }); // ~$25k cash, ~$25k/mo burn
      const c = { id: `c${seed}${senior}`, name: 'Sam Lee', seniority: senior ? 'senior' : 'mid', offer: { equityPct: 0.5 } };
      const lies = recordCandidateClaims(s, c, 'We have 24 months of runway and the company is in great shape.');
      // fresh() has $50k and ~no burn, so check the truth first: only test when it is a lie
      if (!lies.length) continue;
      assert.equal(believedRunway(s, c, 3), 24);
      const r = candidateBackchannel(s, c, { runwayMonths: 3 });
      if (r.caught.length) { if (senior) caughtSenior++; else caughtJunior++; assert.ok(r.mult < 0.5); }
      else assert.equal(r.ctx.runwayMonths, 24, 'an unrefuted claim is what the candidate weighs');
    }
  }
  const honest = fresh(1);
  const c = { id: 'h', name: 'Ana', seniority: 'senior' };
  recordCandidateClaims(honest, c, 'Happy to walk you through the numbers and the cap table.');
  assert.equal(candidateBackchannel(honest, c, { runwayMonths: 10 }).mult, 1);
  assert.ok(caughtSenior > caughtJunior, `senior ${caughtSenior} vs junior ${caughtJunior}`);
  assert.ok(caughtSenior < N, 'not caught 100% instantly');
  assert.deepEqual(extractEquityClaims('Your 0.5% is worth $250k today').map((x) => x.value), [250000]);
  assert.deepEqual(extractEquityClaims('Your options could be worth $2M at exit'), []);
});

// ---------------------------------------------------------------------------
// Research: verified interviews need a held calendar booking
// ---------------------------------------------------------------------------

test('research: a typed transcript or an email address no longer verifies an interview', () => {
  const s = fresh(1);
  assert.equal(interviewVerified(s, null, { email: 'a@b.com', transcript: 'we talked a lot' }), false);
  assert.equal(interviewVerified(s, { email: 'a@b.com' }, {}), false, 'no calendar event');
});

// ---------------------------------------------------------------------------
// Fake reviews: one model for three sources
// ---------------------------------------------------------------------------

test('fake reviews: small entry at purchase, full cost at detection (~60% within 90 days on review sites)', () => {
  let detected = 0;
  const N = 30;
  for (let seed = 1; seed <= N; seed++) {
    const s = fresh(seed);
    const b = recordFakeReviews(s, { source: 'helpdesk', platform: 'g2', n: 20, usd: 300 });
    const first = mistakes(s, /^fake_reviews$/)[0];
    assert.ok(first && first.cost.reputation <= 0.5 && first.cost.usd === 300, 'purchase: you did this, here is what it cost');
    for (let d = 0; d < 90 && b.status === 'live'; d++) { s.day++; if (rollPlatformDetection(s, b)) onDetected(s, b, { label: 'caught', effects: 'removed' }); }
    if (b.status === 'detected') { detected++; assert.ok(s.mistakes.some((m) => m.id === 'fake_reviews_detected_helpdesk' && m.delayed && m.cost.reputation >= 1)); }
  }
  assert.ok(detected / N > 0.4 && detected / N < 0.85, `detected ${detected}/${N}`);
});

test('fake reviews: helpdesk purchases and the world event feed the same ledger; the FTC settlement lands with legal fees', () => {
  const s = fresh(2, { model: 'b2c' });
  buyFakeReviews(s, 20);
  assert.equal(ensureFake(s).batches[0].source, 'helpdesk');
  const W = s.apps.world ??= {};
  W.active = [{ id: 'fr1', eventId: 'fake_review_temptation', status: 'active', startDay: s.day, endDay: s.day + 1, effects: {} }];
  W.rateMult = {}; W.bursts = []; W.rivals = [];
  respond(s, 'fr1', 'buy');
  assert.equal(ensureFake(s).batches.length, 2, 'the world event records a real batch, not a no-op');
  const F = ensureFake(s);
  F.ftc = { openedDay: s.day, resolveDay: s.day, n: 40, batchIds: [], systematic: false, status: 'open' };
  const cash = s.bank.txns.length;
  fakeReviewsDay(s);
  assert.equal(F.ftc.status, 'resolved');
  assert.ok(F.ftc.legal >= FAKE.legalUsd[0] && F.ftc.settlement > 0 && s.bank.txns.length === cash + 2);
  assert.ok(mistakes(s, /^ftc_review_settlement$/).length === 1);
});

// ---------------------------------------------------------------------------
// Ad policy: submission review, sweeps, compounding strikes
// ---------------------------------------------------------------------------

test('ad policy: obvious violations are mostly (not always) rejected at submission; clean copy never is; sweeps and repeat strikes disable accounts', () => {
  assert.deepEqual(policyScan('Read 20 minutes a night').map((x) => x.id), []);
  assert.ok(policyScan('Are you broke? Earn $500 a day').length === 2);
  let rejected = 0, bans = 0;
  const N = 30;
  for (let seed = 1; seed <= N; seed++) {
    const s = fresh(seed, { model: 'b2c' });
    const A = ensureAds(s); createAccount(s, 'meta');
    const c = { id: `cr${seed}`, name: 'Hook', hook: 'Are you broke?', primaryText: 'Stop it.', headline: 'Budget app', status: 'in_review' };
    A.creatives.push(c);
    if (submissionReview(s, A, c)) rejected++;
    else c.status = 'approved';
    const clean = { id: `ok${seed}`, name: 'Clean', hook: 'Track every dollar in 2 minutes a day', primaryText: '', headline: '', status: 'in_review' };
    assert.equal(submissionReview(s, A, clean), null);
    // a second and third violating creative: strikes compound
    for (let k = 0; k < 2; k++) { const v = { id: `v${seed}${k}`, name: 'v', hook: 'Guaranteed income, get rich', primaryText: '', headline: '', status: 'in_review' }; A.creatives.push(v); if (!submissionReview(s, A, v)) v.status = 'approved'; }
    for (let d = 0; d < 60; d++) { s.day++; adPolicyDay(s, A, new Map(A.creatives.map((x) => [x.id, ['meta']]))); }
    if (A.accounts.meta.policyBan) { bans++; assert.equal(deliveryState(s, { p: 'meta', campaignId: null, status: 'active' }).ok, false); appealBan(s, A, 'meta'); }
  }
  assert.ok(rejected / N > 0.6 && rejected / N < 0.95, `rejected at submission ${rejected}/${N}`);
  assert.ok(bans > N * 0.3 && bans < N, `accounts disabled ${bans}/${N}`);
});

// ---------------------------------------------------------------------------
// Books: N/A reasons are checked by the CPA at filing
// ---------------------------------------------------------------------------

test('books: an N/A the bank feed contradicts is recorded and the CPA bills for it at filing', () => {
  const s = fresh(1);
  s.day = 40; // February
  post(s, { amount: -4000, counterparty: 'Gusto', description: 'GUSTO NET PAY', category: 'payroll', method: 'payroll' });
  const month = monthOf(s);
  s.day = 75; // the month has ended
  assert.ok(naContradiction(s, month, 'payroll'));
  closeState(s, month).na = { payroll: 'No payroll this month (no employees)' };
  recordNaClaim(s, month, 'payroll', 'No payroll this month (no employees)');
  assert.equal(openLies(s, { audience: 'cpa' }).length, 1);
  const items = falseNaItems(s, Number(month.slice(0, 4)));
  assert.equal(items.length, 1);
  const q = cpaQuote(s, Number(month.slice(0, 4)));
  assert.ok(q.falseNa.length === (items[0].caught ? 1 : 0));
});

// ---------------------------------------------------------------------------
// Operator tiers: honest stellar vs lying mediocre, short horizon, few seeds
// ---------------------------------------------------------------------------

test('tiers: lying is a losing strategy in expectation, but it is not caught 100% instantly', (t) => {
  const N = 12;
  const tally = { honest: { cost: 0, score: 0, rep: 0, caught: 0 }, liar: { cost: 0, score: 0, rep: 0, caught: 0, survivedSome: 0 } };
  const costOf = (s) => (s.mistakes ?? []).reduce((a, m) => a + (m.cost.usd ?? 0) + 150 * (m.cost.hours ?? 0) + 2000 * (m.cost.reputation ?? 0), 0);
  for (let seed = 1; seed <= N; seed++) {
    // Stellar: real numbers on the loan, clean ad copy, real reviews, transparent with candidates.
    const h = fresh(seed, { model: 'b2c' }); employed(h, { homeEquity: 60000 });
    applyAndDecide(h, 'heloc', 30000);
    const Ah = ensureAds(h); createAccount(h, 'meta');
    const ch = { id: 'c', name: 'c', hook: 'Track every dollar in 2 minutes a day', primaryText: '', headline: '', status: 'in_review' };
    submissionReview(h, Ah, ch);
    const cand = { id: 'k', name: 'Kim', seniority: 'senior' };
    recordCandidateClaims(h, cand, 'Here is our real runway and the cap table.');
    candidateBackchannel(h, cand, { runwayMonths: 8 });
    // Mediocre liar: inflated + forged loan documents, a violating ad, bought reviews, an inflated runway claim.
    const l = fresh(seed, { model: 'b2c' }); employed(l, { homeEquity: 20000 }); setStatedProfile(l, { homeEquity: 150000 });
    applyAndDecide(l, 'heloc', 30000, { forged: true });
    const Al = ensureAds(l); createAccount(l, 'meta');
    const cl = { id: 'c', name: 'c', hook: 'Are you broke? Guaranteed income', primaryText: '', headline: '', status: 'in_review' };
    Al.creatives.push(cl);
    if (!submissionReview(l, Al, cl)) cl.status = 'approved';
    const b = recordFakeReviews(l, { source: 'helpdesk', platform: 'g2', n: 20, usd: 300 });
    const candL = { id: 'k', name: 'Kim', seniority: 'senior' };
    recordCandidateClaims(l, candL, 'We have 30 months of runway.');
    candidateBackchannel(l, candL, { runwayMonths: 2 });
    for (let d = 0; d < 45; d++) { l.day++; adPolicyDay(l, Al, new Map([['c', ['meta']]])); if (rollPlatformDetection(l, b)) onDetected(l, b, { label: 'caught', effects: 'removed' }); }
    for (const [k, s] of [['honest', h], ['liar', l]]) {
      const I = ensureIntegrity(s);
      tally[k].cost += costOf(s); tally[k].score += I.score; tally[k].rep += 1 - reputationMult(s, 'lender');
      tally[k].caught += I.claims.filter((c) => c.status === 'caught').length;
    }
    if (ensureIntegrity(l).claims.some((c) => c.status === 'open')) tally.liar.survivedSome++;
  }
  t.diagnostic(JSON.stringify({ honestCost: Math.round(tally.honest.cost / N), liarCost: Math.round(tally.liar.cost / N), liarScore: +(tally.liar.score / N).toFixed(2), liarCaughtPerRun: +(tally.liar.caught / N).toFixed(2), liarRunsWithSurvivors: tally.liar.survivedSome }));
  assert.equal(tally.honest.caught, 0);
  assert.ok(tally.honest.score === N, 'honest integrity score stays clean');
  assert.ok(tally.liar.score / N < 0.6, `liar integrity ${tally.liar.score / N}`);
  assert.ok(tally.liar.cost > tally.honest.cost * 3 + 5000, `costs liar ${Math.round(tally.liar.cost)} vs honest ${Math.round(tally.honest.cost)}`);
  assert.ok(tally.liar.survivedSome > 0, 'some lies survive the first checks (latent liabilities)');
});
