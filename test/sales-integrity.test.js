// Loophole blockers in B2B sales, security reviews, customers and payments (docs/research/verification/*).
// A claim is recorded when told, passes early sometimes, and is caught where the real world checks it (security
// review asking for the report, pilot, procurement, reference calls, real usage after go-live, issuer record
// checks, the processor's dispute-ratio review, FTC / competitor complaints), with odds rising with the gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, riskDay, ensureRisk, RISK, vampThreshold, subscriptionById } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { rng } from '../public/core/util.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { capabilityClaims, socialProofClaims, claimGap, detectP, recordClaims, verify, openLies, ensureIntegrity, isCapabilityMetric } from '../public/core/integrity.js';
import { addContact, ensureDeal, closeWon, hasSoc2, soc2ReportOnHand, offerBridgeLetter } from '../public/apps/sales/model.js';
import { recordSalesClaims, securityClaimsReview, pilotClaimsCheck, claimsDay, claimsWinMult, buyerTrustMult, capabilityTruth } from '../public/apps/sales/claims.js';
import { referenceProfile, referenceCall, REF, rfpReferencePoints } from '../public/apps/sales/references.js';
import { conditionedMix, hazard } from '../public/core/churn.js';
import { CHURN_REASONS } from '../public/data/churn-reasons.js';
import { ensureLegal } from '../public/apps/legal/sim.js';
import { factTrue } from '../public/apps/legal/compliance.js';
import { evidenceContradictions, disputeFacts } from '../public/apps/stripe.js';
import { recordSiteClaims, siteClaimsDay } from '../public/apps/website/social-proof.js';

function fresh(model = 'ent', seed = 7) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 500000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Bank feed reconciliation', status: 'shipped' }, { id: 'f2', title: 'Salesforce sync', status: 'shipped' }] };
  return s;
}
let n = 0;
function buyer(s, amount = 12000) {
  n++;
  const { contact } = addContact(s, { firstName: `B${n}`, email: `cfo${n}@buyer${n}.com`, title: 'CFO', company: `Buyer ${n}`, domain: `buyer${n}.com` }, { source: 'network' });
  const deal = ensureDeal(s, { companyId: contact.companyId, contactId: contact.id, stage: 'proposal' });
  deal.amount = amount;
  return deal;
}
const LIE = 'We have SSO and a native Salesforce integration, we are SOC 2 Type II and offer 99.99% uptime.';
const HONEST = 'SSO is on our roadmap for next quarter. We integrate with Salesforce today. We are working toward SOC 2: the audit kicks off next month.';

test('capability claims: present-tense claims are judged against the product, roadmap talk and questions are not claims', () => {
  const truth = { features: [{ text: 'salesforce sync', status: 'shipped' }], soc2: { report: false, type2: false }, pentest: false, uptime: 0.995 };
  const c = capabilityClaims(LIE, truth);
  const by = Object.fromEntries(c.map((x) => [x.metric, x]));
  assert.equal(by['feature:sso'].truth, false);
  assert.equal(by['int:salesforce'].truth, true, 'a shipped integration is a true claim');
  assert.equal(by.soc2_type2.truth, false);
  assert.ok(claimGap('uptime', by.uptime.claimed, 0.995) > 0.9, '99.99% claimed vs 99.5% real is a big overstatement');
  assert.equal(claimGap('uptime', 0.999, 0.9988), 0, 'rounding is not lying');
  assert.deepEqual(capabilityClaims(HONEST, truth).map((x) => [x.metric, x.truth]), [['int:salesforce', true]], 'roadmap SSO and an audit that has not started are not claims');
  assert.deepEqual(capabilityClaims('Do you need SSO? We do not have a mobile app yet.', truth), []);
  const sp = socialProofClaims('Rated 4.9/5 from 1,200 reviews', { rating: 0, reviews: 3 });
  assert.ok(sp.every((x) => claimGap(x.metric, x.claimed, x.truth) > 1));
  assert.ok(isCapabilityMetric('feature:sso') && isCapabilityMetric('uptime') && !isCapabilityMetric('mrr'));
  // Check strengths: evidence request >> questionnaire; pilot ~80%; detection rises with the gap.
  assert.ok(detectP(1, 'security_evidence') > 0.9 && detectP(1, 'questionnaire') < 0.3 && detectP(1, 'poc') > 0.75);
  assert.ok(detectP(0.2, 'poc') < detectP(1, 'poc'));
});

test('verify: filter, per-claim check and rigor are generic and leave existing callers unchanged', () => {
  const s = fresh();
  recordClaims(s, { audience: 'customer', recipientId: 'co1', claims: [{ metric: 'feature:sso', claimed: true, truth: false }, { metric: 'soc2', claimed: true, truth: false }] });
  const r = verify(s, { audience: 'customer', recipientId: 'co1', filter: (c) => c.metric === 'soc2', check: 'document', roll: () => 0.5 });
  assert.equal(r.caught.length, 1);
  assert.equal(openLies(s, { recipientId: 'co1' })[0].metric, 'feature:sso', 'the filtered-out claim stays open');
  const weak = verify(s, { audience: 'customer', recipientId: 'co1', check: 'poc', pMult: 0.1, roll: () => 0.5 });
  assert.equal(weak.caught.length, 0, 'a loose pilot misses what a rigorous one would catch');
});

test('SOC 2 state is real: an audit in progress is not a report; a Type I during the Type II window is', () => {
  const s = fresh();
  const L = ensureLegal(s);
  L.soc2 = 'type2_in_progress';
  assert.equal(hasSoc2(s), false, 'a Type II window without an earlier Type I is no report');
  assert.equal(soc2ReportOnHand(s), null);
  assert.equal(factTrue(s, 'soc2_any'), false, '"have you completed any SOC 2 audit?" is no');
  L.compliance ??= {}; L.compliance.reports = [{ id: 'r1', type: 'type1', day: 0, opinion: 'clean', exceptions: [] }];
  assert.equal(hasSoc2(s), true);
  assert.equal(soc2ReportOnHand(s).type, 'type1');
  assert.equal(capabilityTruth(s).soc2.type2, false);
  L.compliance.reports[0].opinion = 'qualified';
  assert.equal(hasSoc2(s, { strict: true }), false, 'strict TPRM rejects a qualified opinion');
});

test('security review: a false SOC 2 "yes" is caught ~90%+ when strict buyers ask for the report, ~25% at a light review; honest answers pass', () => {
  const s = fresh();
  let strictCaught = 0, lightCaught = 0, honestCaught = 0;
  const N = 120;
  for (let i = 0; i < N; i++) {
    const d1 = buyer(s, 60000);
    recordClaims(s, { audience: 'customer', recipientId: d1.companyId, channel: 'questionnaire', claims: [{ metric: 'soc2_type2', claimed: true, truth: false }] });
    if (securityClaimsReview(s, d1) === 'lost') strictCaught++;
    const d2 = buyer(s, 9000);
    recordClaims(s, { audience: 'customer', recipientId: d2.companyId, channel: 'questionnaire', claims: [{ metric: 'soc2_type2', claimed: true, truth: false }] });
    if (securityClaimsReview(s, d2) === 'lost') lightCaught++;
    const d3 = buyer(s, 60000);
    recordSalesClaims(s, { companyId: d3.companyId, text: HONEST });
    if (securityClaimsReview(s, d3) === 'lost') honestCaught++;
  }
  assert.ok(strictCaught / N > 0.85, `strict ${strictCaught}/${N}`);
  assert.ok(lightCaught / N > 0.12 && lightCaught / N < 0.4, `light ${lightCaught}/${N}`);
  assert.equal(honestCaught, 0);
  assert.ok(s.mistakes.some((m) => m.id === 'security_claim_caught' && m.delayed));
  assert.ok(buyerTrustMult(s) < 1, 'buyers talk: new deals start with less trust');
});

test('pilot: sold-but-not-built features are observed directly; a scoped paid pilot catches more than a loose design partnership', () => {
  const s = fresh();
  const rate = (type) => {
    let caught = 0;
    for (let i = 0; i < 100; i++) {
      const d = buyer(s, 20000);
      d.pilot = { type, status: 'active' };
      recordSalesClaims(s, { companyId: d.companyId, text: 'We have SSO and a full audit log.' });
      if (pilotClaimsCheck(s, d) === 'lost') caught++;
    }
    return caught / 100;
  };
  const paid = rate('paid_pilot'), dp = rate('design_partner');
  assert.ok(paid > 0.75, `paid ${paid}`);
  assert.ok(dp < paid && dp > 0.4, `design partner ${dp}`);
  const d = buyer(s, 20000); d.pilot = { type: 'paid_pilot', status: 'active' };
  recordSalesClaims(s, { companyId: d.companyId, text: 'We sync with Salesforce natively.' });
  assert.equal(pilotClaimsCheck(s, d), null, 'a true claim passes the pilot');
  assert.ok(s.mistakes.some((m) => m.id === 'pilot_exposed_overclaim' && m.cost.hours >= 20));
});

test('delivered vs sold: after go-live the gap shows, with credits or a refund, termination risk and an oversold churn reason', () => {
  let gaps = 0, credited = 0, terminated = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = fresh('ent', seed);
    const d = buyer(s, 30000);
    recordSalesClaims(s, { companyId: d.companyId, text: 'We have SSO, role-based permissions and an audit log.' });
    closeWon(s, d);
    const chk = s.apps.crm.soldChecks?.[0];
    assert.ok(chk, 'a sold-vs-delivered check is scheduled');
    assert.ok(chk.day >= s.day + 30 && chk.day <= s.day + 90);
    const bank0 = s.bank.balance ?? 0;
    s.day = chk.day; claimsDay(s);
    const sub = subscriptionById(s, d.subscriptionId);
    if (chk.status === 'gap') gaps++;
    if (chk.result?.usd > 0) credited++;
    if (sub.cancelAtPeriodEnd || sub.status === 'canceled') terminated++;
    assert.ok(sub.soldGap > 0);
    const mix = conditionedMix(s, sub);
    assert.ok(mix.oversold > 0.3, 'the true reason behind an oversold account is mostly "oversold"');
    const before = sub.soldGap; sub.soldGap = 0; const h0 = hazard(s, sub); sub.soldGap = before;
    assert.ok(hazard(s, sub) > h0 * 1.5, 'oversold accounts churn faster at renewal');
    assert.ok(s.mistakes.some((m) => m.id === 'oversold_delivered_gap'), 'traceable');
    void bank0;
  }
  assert.equal(gaps, 12, 'usage reveals it (~100% eventual)');
  assert.ok(credited >= 2 && credited <= 10, `credits asserted ${credited}/12 (~35-55% at $30k ACV)`);
  assert.ok(terminated >= 2, `terminated ${terminated}/12`);
  assert.ok(CHURN_REASONS.oversold.label);
  // Honest sale: nothing to check.
  const s = fresh();
  const d = buyer(s, 30000);
  recordSalesClaims(s, { companyId: d.companyId, text: HONEST });
  closeWon(s, d);
  assert.equal((s.apps.crm.soldChecks ?? []).length, 0);
});

test('bridge letters: without an audit underway they rarely work, and an accepted letter is followed up by the promised date', () => {
  // Acceptance: audit underway vs not.
  let withAudit = 0, without = 0;
  for (let i = 0; i < 80; i++) {
    for (const underway of [true, false]) {
      const s = fresh('ent', 100 + i);
      const L = ensureLegal(s); L.soc2 = underway ? 'type2_in_progress' : 'none'; L.soc2Plan = underway ? { readyDay: 150, type: 'type2' } : null;
      const d = buyer(s, 30000);
      d.paperwork = [{ id: 'soc2_type2', label: 'SOC 2 Type II', status: 'open' }];
      if (offerBridgeLetter(s, d)) underway ? withAudit++ : without++;
    }
  }
  assert.ok(withAudit > without * 2, `with audit ${withAudit}/80, without ${without}/80`);
  // An accepted letter with no audit: the buyer comes back and the deal (or account) pays for it.
  let lapsed = 0;
  for (let seed = 1; seed <= 40 && !lapsed; seed++) {
    const s = fresh('ent', 300 + seed);
    ensureLegal(s).soc2 = 'none';
    const d = buyer(s, 30000);
    d.paperwork = [{ id: 'soc2_type2', label: 'SOC 2 Type II', status: 'open' }];
    if (!offerBridgeLetter(s, d)) continue;
    const f = s.apps.crm.bridgeFollowups[0];
    assert.equal(f.underway, false);
    s.day = f.dueDay; claimsDay(s);
    assert.equal(f.status, 'missed');
    assert.equal(d.stage, 'lost');
    assert.ok(s.mistakes.some((m) => m.id === 'bridge_letter_no_audit'), 'the "audit underway" claim is caught');
    lapsed++;
  }
  assert.equal(lapsed, 1);
  // Real audit that delivers: the follow-up is met.
  const s = fresh('ent', 9);
  const L = ensureLegal(s); L.soc2 = 'type2_in_progress'; L.soc2Plan = { readyDay: 60, type: 'type2' };
  let d, ok = false;
  for (let i = 0; i < 30 && !ok; i++) { d = buyer(s, 20000); d.paperwork = [{ id: 'soc2_type2', label: 'SOC 2 Type II', status: 'open' }]; ok = offerBridgeLetter(s, d); }
  assert.ok(ok);
  const f = s.apps.crm.bridgeFollowups.find((x) => x.dealId === d.id);
  L.soc2 = 'type2'; L.soc2Report = { type: 'type2', opinion: 'clean', day: 60 };
  s.day = f.dueDay; claimsDay(s);
  assert.equal(f.status, 'met');
});

test('reference calls: what the buyer hears comes from the account\'s real health; unhappy references hurt the deal', () => {
  const s = fresh('ent', 21);
  const mk = (name) => { const d = buyer(s, 20000); closeWon(s, d); const cus = s.stripe.customers.find((c) => c.id === d.customerId); cus.company = name; return { d, cus }; };
  const happy = mk('Happy Co'), sad = mk('Sad Co');
  s.apps.success = { accounts: { [happy.d.subscriptionId]: { usage: 0.9, health: 85 }, [sad.d.subscriptionId]: { usage: 0.2, health: 30 } } };
  const tally = (cid) => { const out = {}; for (let i = 0; i < 200; i++) { const p = referenceProfile(s, cid); p.recent = 0; const r = referenceCall(s, p).outcome; out[r] = (out[r] ?? 0) + 1; } return out; };
  const h = tally(happy.cus.id), b = tally(sad.cus.id);
  const bad = (t) => (t.lukewarm ?? 0) + (t.negative ?? 0);
  assert.ok(bad(h) < 20, `happy reference rarely hurts: ${JSON.stringify(h)}`);
  assert.ok(bad(b) > 70, `an at-risk account leaks (~40%+): ${JSON.stringify(b)}`);
  assert.ok(REF.mult.negative < REF.mult.lukewarm && REF.mult.lukewarm < 1 && REF.mult.glowing > 1);
  // RFP: listed references are called before the award.
  const pts = (ids) => { const bid = { id: `b${ids.join()}`, buyer: 'City', response: { refs: ids } }; return rfpReferencePoints(s, bid); };
  let ph = 0, pb = 0;
  for (let i = 0; i < 40; i++) { ph += pts([happy.cus.id]); pb += pts([sad.cus.id]); }
  assert.ok(ph > pb + 100, `RFP points happy ${ph} vs unhappy ${pb}`);
  // Customer-count claims made to a buyer get checked on those calls.
  const d = buyer(s, 30000);
  recordSalesClaims(s, { companyId: d.companyId, text: 'We have 400 customers.' });
  assert.equal(openLies(s, { recipientId: d.companyId })[0]?.metric, 'customers');
});

test('dispute evidence: claims about usage, reminders and terms are checked against the records', () => {
  const s = fresh('b2c', 5);
  const facts = { usedProduct: false, reminderSent: false, tosAccepted: false, cancelRequested: false };
  const lie = 'The customer logged in 14 times after the charge and accepted our terms at checkout. We sent a reminder email before renewal.';
  assert.deepEqual(evidenceContradictions(lie, facts).map((x) => x.id), ['usage', 'reminder', 'tos']);
  assert.deepEqual(evidenceContradictions(lie, { usedProduct: true, reminderSent: true, tosAccepted: true }), [], 'true statements are fine');
  assert.deepEqual(evidenceContradictions('The charge was authorized with 3DS and matches prior undisputed payments.', facts), []);
  // disputeFacts carries the ground truth.
  const st = ensureStripe(s);
  st.customers.push({ id: 'cu_x', name: 'X', createdDay: 0, card: {} });
  st.charges.push({ id: 'ch_x', customerId: 'cu_x', subId: null, day: 1, amount: 20, status: 'disputed' });
  const f = disputeFacts(s, { id: 'dp_x', chargeId: 'ch_x', customerId: 'cu_x', amount: 20, reason: 'subscription_canceled' });
  assert.equal(typeof f.usedProduct, 'boolean');
  assert.equal(f.reminderSent, false, 'no live trial or renewal notice');
  assert.equal(f.tosAccepted, false, 'no terms published');
});

test('processor risk: dispute ratio breaches step from warning to reserve to termination and MATCH; clean months recover', () => {
  const s = fresh('b2c', 3);
  const st = ensureStripe(s);
  const month = (disputes, charges = 200) => {
    for (let i = 0; i < charges; i++) st.charges.push({ id: `ch_${s.day}_${i}`, customerId: 'c', day: s.day - 1 - (i % 25), amount: 10, status: 'succeeded', method: 'card' });
    for (let i = 0; i < disputes; i++) st.disputes.push({ id: `dp_${s.day}_${i}`, chargeId: 'x', customerId: 'c', day: s.day - 1 - (i % 25), amount: 10, status: 'lost', reason: 'fraudulent' });
    riskDay(s);
    s.day += 30;
  };
  ensureRisk(s); s.day += 30;
  assert.equal(vampThreshold(s) <= 0.022, true);
  month(2); assert.equal(st.risk.level, 'ok', 'two disputes on 200 charges is 1% but below the minimum count');
  month(1); month(0);
  month(3, 300); assert.equal(st.risk.level, 'warning', '1% once (above Stripe 0.75%, under the network threshold): warning and remediation plan');
  month(4); assert.equal(st.risk.level, 'excessive', 'twice above the network threshold');
  assert.ok(st.risk.reservePct >= 0.1 && st.risk.payoutDelay > 0);
  assert.ok(s.bank.txns.some((t) => /excessive-dispute program fees/.test(t.description)), 'network program fees are charged');
  month(0); month(0);
  assert.equal(st.risk.level, 'review', 'two clean months step it down');
  month(0); month(0); month(0); month(0);
  assert.equal(st.risk.level, 'ok');
  // Persistent breach: termination, frozen funds, MATCH.
  for (let i = 0; i < 4 && st.risk.level !== 'terminated'; i++) month(6);
  assert.equal(st.risk.level, 'terminated');
  assert.ok(st.risk.match && st.risk.match.untilDay - st.risk.match.day === RISK.matchYears * 365);
  assert.ok(st.risk.payoutHoldUntil > s.day);
  assert.ok(s.mistakes.some((m) => m.id === 'processor_terminated' && m.cost.hours >= 20));
});

test('website social proof: inflated counts and fake ratings are recorded, not judged on publish, and caught later at research odds', () => {
  let caught = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = fresh('smb', seed);
    s.company.website = { title: 'Ledgerly', text: 'Trusted by 5,000 teams. Rated 4.9/5 from 1,200 reviews.' };
    const lies = recordSiteClaims(s, s.company.website.text);
    assert.equal(lies.length, 3, 'customers, rating and reviews are all overstated');
    assert.equal(recordSiteClaims(s, s.company.website.text).length, 0, 'the same page is recorded once');
    for (let d = 0; d < 365; d++) { s.day++; siteClaimsDay(s); }
    if (ensureIntegrity(s).claims.some((c) => c.recipientId === 'website' && c.status === 'caught')) caught++;
  }
  assert.ok(caught >= 2 && caught <= 16, `caught within a year in ${caught}/20 (not instant, not never)`);
  const s = fresh('smb', 4);
  s.company.website = { title: 'Ledgerly', text: 'Reconcile insurance deposits in minutes. Book a demo.' };
  assert.equal(recordSiteClaims(s, s.company.website.text).length, 0, 'an honest page has nothing to catch');
});

test('operator tiers: honest stellar vs lying mediocre over a short horizon: lying wins a few deals early and loses in expectation', () => {
  const run = (seed, liar) => {
    const s = fresh('ent', 700 + seed);
    let won = 0, lostAtReview = 0, earlyPass = 0;
    const deals = [];
    for (let i = 0; i < 10; i++) {
      const d = buyer(s, i % 3 === 0 ? 60000 : 15000);
      recordSalesClaims(s, { companyId: d.companyId, text: liar ? LIE : HONEST });
      if (d.amount >= 50000 && securityClaimsReview(s, d) === 'lost') { lostAtReview++; continue; }
      const p = 0.3 * claimsWinMult(s, d) * buyerTrustMult(s);
      if (rng(s) >= p) continue;
      if (liar && openLies(s, { recipientId: d.companyId }).length) earlyPass++;
      closeWon(s, d); won++; deals.push(d);
    }
    s.day += 100; claimsDay(s);
    let arr = 0, credits = 0;
    for (const d of deals) { const sub = subscriptionById(s, d.subscriptionId); if (sub && !sub.cancelAtPeriodEnd && sub.status !== 'canceled') arr += d.amount * (1 - Math.min(0.9, sub.soldGap ?? 0) * 0.5); }
    for (const c of s.apps.crm.soldChecks ?? []) credits += c.result?.usd ?? 0;
    return { net: arr - credits, won, lostAtReview, earlyPass, score: ensureIntegrity(s).score };
  };
  const honest = [], liar = [];
  for (let seed = 1; seed <= 6; seed++) { honest.push(run(seed, false)); liar.push(run(seed, true)); }
  const mean = (a, k) => a.reduce((x, r) => x + r[k], 0) / a.length;
  assert.ok(mean(liar, 'earlyPass') > 0, 'some lies pass the early stages (not caught 100% instantly)');
  assert.ok(mean(liar, 'won') > 0);
  assert.ok(mean(honest, 'net') > mean(liar, 'net') * 1.3, `honest net $${Math.round(mean(honest, 'net'))} vs liar $${Math.round(mean(liar, 'net'))}`);
  assert.ok(mean(liar, 'score') < mean(honest, 'score'), 'integrity record');
  assert.equal(mean(honest, 'lostAtReview'), 0);
});
