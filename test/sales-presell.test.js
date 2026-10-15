// AI SDR review modes, pre-selling (Mom Test), founder-led variants, and the paid-pilot / RFP path. Short, targeted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { completeEvent } from '../public/core/calendar.js';
import { APPS } from '../public/apps/registry.js';
import { ensureLegal } from '../public/apps/legal/sim.js';
import { TIER_RANK } from '../public/core/operator.js';
import { ensureCrm, ensureOutreach, addContact, ensureDeal, workPaperwork, createMeeting, nextSlot, proposePilot, declineRfp } from '../public/apps/sales/model.js';
import { outreachDay, startAiSdr, applyCallOutcome } from '../public/apps/sales/engine.js';
import { heuristicScorecard } from '../public/apps/sales/scorecard.js';
import { callQuality } from '../public/apps/sales/deals.js';
import * as SDR from '../public/apps/sales/sdr.js';
import * as PS from '../public/apps/sales/presell.js';
import { tagDeal, variantStats, founderWinRate, hybridDay } from '../public/apps/sales/variants.js';
import { SALES_ACTIONS, salesEvents } from '../public/apps/sales/automation.js';
import { researchSlice } from '../public/apps/product/store.js';
import { SALES } from '../public/apps/sales/params.js';
import { analyzeCopy } from '../public/apps/sales/copy.js';

function fresh(model = 'smb', seed = 7) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'vc', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 2e6, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Automated payout reconciliation for Shopify stores';
  s.apps.product = { features: [{ id: 'f1', title: 'Nightly payout matching', status: 'shipped' }] };
  s.market.fit.product.score = 0.6;
  return s;
}
const mistakes = (s, id) => (s.mistakes ?? []).filter((m) => m.id === id).length;

// ---------------------------------------------------------------------------
// AI SDR review modes
// ---------------------------------------------------------------------------

const rewrite = (d) => ({ subject: `${d.person.company} month-end`, body: `Hi ${d.person.name.split(' ')[0]},\n\n${d.person.company} lists three service lines on your site, so reconciling payouts probably eats your week.\n\nWe built payout reconciliation for Shopify stores. Worth a look at a two-line example?\n\nIf this isn't relevant, tell me and I won't follow up.\n\nPat` });
const POLICY = {
  // reads every draft, rewrites generic ones, rejects flagged wrong-persona/made-up facts, tight limits
  stellar: { limits: { dailyCap: 25, personas: 'owner, founder, operations', blockedClaims: ['funding', 'customers', 'revenue'], requirePersonalization: true }, decide(s, d) { const f = SDR.draftFlags(d).map((x) => x.id); if (f.includes('wrong_persona')) return SDR.rejectDraft(s, d.id); if (f.includes('generic')) SDR.editDraft(s, d.id, rewrite(d)); const r = SDR.approveDraft(s, d.id, { dwellSec: 30 }); if (!r.ok) SDR.rejectDraft(s, d.id); } },
  // reads, fixes flagged things, does not rewrite generic copy
  good: { limits: { dailyCap: 25 }, decide(s, d) { const f = SDR.draftFlags(d).map((x) => x.id); if (f.includes('wrong_persona') || f.includes('hallucination')) return SDR.rejectDraft(s, d.id); if (f.includes('generic')) SDR.editDraft(s, d.id, rewrite(d)); const r = SDR.approveDraft(s, d.id, { dwellSec: 25 }); if (!r.ok) SDR.rejectDraft(s, d.id); } },
  // review mode but approves everything in seconds
  mediocre: { limits: { dailyCap: 25 }, decide(s, d) { SDR.approveDraft(s, d.id, { dwellSec: 3 }); } },
};
function runReview(name, days = 18) {
  const s = fresh('smb', 11);
  ensureOutreach(s);
  startAiSdr(s, { mode: 'review' });
  SDR.setLimits(s, POLICY[name].limits);
  let hours = 0;
  for (let i = 0; i < days; i++) {
    s.day++;
    outreachDay(s);
    for (const d of [...s.apps.outreach.aiSdr.queue]) { POLICY[name].decide(s, d); hours += SDR.decisionHours('approve', name === 'mediocre'); }
  }
  s.day++; outreachDay(s); // send the last approvals
  return { s, st: SDR.sdrReviewStats(s), hours };
}

test('AI SDR review: stellar / good / mediocre (rubber-stamp) operators separate on quality, bad sends and mistakes', () => {
  const r = { stellar: runReview('stellar'), good: runReview('good'), mediocre: runReview('mediocre') };
  const bad = (x) => (x.st.slipped.hallucination + x.st.slipped.wrongPersona) / Math.max(1, x.st.sent);
  assert.ok(r.stellar.st.sent > 100 && r.good.st.sent > 100 && r.mediocre.st.sent > 100);
  assert.ok(r.stellar.st.avgQuality >= r.good.st.avgQuality - 0.02, `quality ${r.stellar.st.avgQuality} vs ${r.good.st.avgQuality}`);
  assert.ok(r.good.st.avgQuality > r.mediocre.st.avgQuality + 0.1, `quality ${r.good.st.avgQuality} vs ${r.mediocre.st.avgQuality}`);
  assert.ok(r.stellar.st.expRepliesPer100 > 1.4 * r.mediocre.st.expRepliesPer100 && r.good.st.expRepliesPer100 > 1.2 * r.mediocre.st.expRepliesPer100, 'expected replies per 100 sent');
  assert.ok(r.stellar.st.edited <= r.good.st.edited, 'tight limits mean fewer drafts to rewrite');
  // rubber-stamping behaves like autopilot: ~12-20% hallucinated + ~12% wrong persona go out
  assert.ok(r.mediocre.s.apps.outreach.aiSdr.hallucinations / r.mediocre.st.sent > 0.08, 'mediocre sends made-up facts');
  assert.ok(bad(r.mediocre) > 3 * bad(r.stellar) && bad(r.mediocre) > 2 * bad(r.good), `bad sends ${bad(r.mediocre)} vs ${bad(r.good)} vs ${bad(r.stellar)}`);
  assert.ok(r.mediocre.st.rubber && !r.stellar.st.rubber, 'rubber-stamp detected');
  assert.ok(mistakes(r.mediocre.s, 'sdr_rubber_stamp') >= 1 && mistakes(r.mediocre.s, 'sdr_hallucination_sent') > mistakes(r.stellar.s, 'sdr_hallucination_sent'));
  assert.ok(r.stellar.hours > 0, 'review costs founder hours');
});

test('AI SDR review: edits are judged by the copy judge; a careful read can catch what the checker missed; limits change the agent', () => {
  const s = fresh('smb', 5);
  startAiSdr(s, { mode: 'review' });
  for (let i = 0; i < 6; i++) { s.day++; outreachDay(s); }
  const q = s.apps.outreach.aiSdr.queue;
  const generic = q.find((d) => d.quality < 0.5);
  assert.ok(generic, 'a generic draft exists');
  const before = generic.quality;
  const r = SDR.editDraft(s, generic.id, rewrite(generic));
  assert.ok(r.quality > before + 0.3, `${before} → ${r.quality}`);
  assert.ok(r.quality > analyzeCopy({ subject: 'x', body: generic.original }, 0).score);
  const hall = q.find((d) => d.claimKey && !d.flagSeen);
  if (hall) {
    const res = SDR.approveDraft(s, hall.id, { dwellSec: 40 });
    if (hall.catchRoll < SDR.REVIEW.carefulCatch) assert.deepEqual([res.ok, !!res.caught], [false, true]);
    else assert.equal(res.ok, true);
  }
  const wp = q.find((d) => d.wrongPersona);
  if (wp) { SDR.editDraft(s, wp.id, rewrite(wp)); assert.ok(SDR.hiddenIssues(wp).wrongPersona, 'editing cannot fix who it goes to'); }
  // limits
  const base = SDR.limitEffects();
  const tight = SDR.limitEffects({ dailyCap: 30, personas: 'owner', segments: ['trades'], blockedClaims: ['funding', 'headcount', 'tech', 'customers', 'revenue'], requirePersonalization: true });
  assert.ok(tight.hallP < base.hallP * 0.3 && tight.wrongP < base.wrongP * 0.5 && tight.cap === 30 && tight.vol < 0.5 && tight.genericP === 0);
  assert.equal(SDR.autopilotMult(base), 1);
});

test('AI SDR: autopilot keeps its consequences, limits cap it, and automations need approval to approve drafts', () => {
  const s = fresh('smb', 9);
  startAiSdr(s);
  SDR.setLimits(s, { dailyCap: 10 });
  for (let i = 0; i < 14; i++) { s.day++; outreachDay(s); }
  const a = s.apps.outreach.aiSdr;
  assert.equal(a.mode, 'autopilot');
  assert.ok(a.sent > 0 && a.sent <= 10 * 14, `capped sends ${a.sent}`);
  assert.ok(a.hallucinations >= 0 && a.queue.length === 0);
  startAiSdr(fresh()); // idempotent on a fresh state
  const t = fresh('smb', 3);
  startAiSdr(t, { mode: 'review' });
  for (let i = 0; i < 3; i++) { t.day++; outreachDay(t); }
  const d = t.apps.outreach.aiSdr.queue[0];
  assert.ok(salesEvents(t, { types: ['sdr_drafts_ready'] }).length >= 1);
  assert.equal(SALES_ACTIONS.sdr_approve_draft.run(t, { draftId: d.id }).error, 'needs approval');
  assert.equal(SALES_ACTIONS.sdr_set_mode.run(t, { mode: 'autopilot' }).error, 'needs approval');
  assert.ok(SALES_ACTIONS.sdr_set_mode.run(t, { mode: 'review' }).ok);
  assert.ok(SALES_ACTIONS.sdr_approve_draft.run(t, { draftId: d.id }, { dryRun: true, approved: true }).ok && t.apps.outreach.aiSdr.queue.length > 0);
  assert.ok(SALES_ACTIONS.sdr_approve_draft.run(t, { draftId: d.id }, { approved: true }).ok);
  assert.equal(t.apps.outreach.aiSdr.review.bulk, 1, 'an automation approving is an unread approval');
  void SALES;
});

// ---------------------------------------------------------------------------
// Pre-selling
// ---------------------------------------------------------------------------

function presellWorld(seed, n = 30) {
  const s = fresh('smb', seed);
  s.apps.product = { features: [{ id: 'f9', title: 'Missed refund alerts', status: 'queued' }] }; // nothing shipped
  const deals = [];
  for (let i = 0; i < n; i++) {
    const { contact, company } = addContact(s, { firstName: `P${i}`, lastName: 'X', email: `o${i}@shop${i}${seed}.com`, title: i % 5 === 0 ? 'Bookkeeper' : 'Owner', company: `Shop ${i}`, domain: `shop${i}${seed}.com` }, { source: 'network', warm: true });
    company.prospect = { fit: 0.3 + ((i * 37) % 70) / 100 };
    deals.push(ensureDeal(s, { companyId: company.id, contactId: contact.id, source: 'network', stage: 'meeting_held' }));
  }
  const offer = PS.createOffer(s, { title: 'Payout matching', description: 'Matches every Shopify payout to the bank deposit overnight so month-end close takes 1 hour instead of 2 days, without spreadsheets.', price: 99, interval: 'month', startDay: s.day + 45, promises: [{ text: 'Missed refund alerts', featureId: 'f9' }] });
  return { s, deals, offer };
}
function runPresell(kind, seed) {
  const { s, deals, offer } = presellWorld(seed);
  for (const d of deals) {
    const painKnown = (d.presell?.intent?.[offer.id] ?? PS.hiddenIntent(s, d, offer)) > 0.25; // a stellar operator confirms pain on the call first
    if (kind === 'stellar' && !painKnown) continue;
    const a = PS.askForCommitment(s, { offerId: offer.id, dealId: d.id, level: kind === 'stellar' ? 'deposit' : 'verbal' });
    PS.labelAsk(s, a.id, kind === 'stellar' ? PS.isCommitment(a) : a.outcome !== 'decline'); // mediocre: any friendly answer is "demand"
  }
  return { s, read: PS.presellRead(s) };
}

test('pre-sell: polite interest is not demand; commitments charge Stripe and feed real insights; tiers separate', () => {
  let st = 0, me = 0, inflatedM = 0, inflatedS = 0, realS = 0, mistS = 0, mistM = 0;
  for (const seed of [21, 22, 23]) {
    const a = runPresell('stellar', seed), b = runPresell('mediocre', seed);
    st += TIER_RANK[a.read.tier]; me += TIER_RANK[b.read.tier];
    inflatedS += a.s.apps.crm.presell.stats.inflated; inflatedM += b.s.apps.crm.presell.stats.inflated;
    realS += a.s.apps.crm.presell.asks.filter(PS.isCommitment).length;
    mistS += mistakes(a.s, 'compliments'); mistM += mistakes(b.s, 'compliments');
    for (const ask of a.s.apps.crm.presell.asks.filter(PS.isCommitment)) {
      assert.ok(ask.chargeId && a.s.stripe.charges.find((c) => c.id === ask.chargeId)?.status === 'succeeded');
    }
    assert.equal(b.s.apps.crm.presell.asks.filter(PS.isCommitment).length, 0, 'verbal asks never produce demand');
    const ins = researchSlice(a.s).insights.filter((i) => i.presellAskId);
    assert.ok(ins.every((i) => i.real === true && i.type === 'commitment'));
    assert.equal(ins.length, a.s.apps.crm.presell.asks.filter(PS.isCommitment).length);
  }
  assert.ok(realS >= 3, `${realS} real commitments`);
  assert.ok(st > me, `tiers ${st} vs ${me}`);
  assert.equal(inflatedS, 0);
  assert.ok(inflatedM >= 10 && mistM >= 10 && mistS === 0, `compliments counted ${inflatedM}, mistakes ${mistM}`);
});

test('pre-sell: missing the date refunds everyone and logs a mistake; delivering with unbacked promises costs refunds', () => {
  const { s, deals, offer } = presellWorld(31, 40);
  for (const d of deals) { const a = PS.askForCommitment(s, { offerId: offer.id, dealId: d.id, level: 'preorder' }); if (a.outcome === 'committed') PS.labelAsk(s, a.id, true); }
  const paid = s.apps.crm.presell.asks.filter((a) => a.chargeId);
  assert.ok(paid.length >= 1, 'someone pre-paid');
  const before = s.stripe.refunds.length;
  s.day = offer.startDay + PS.PRESELL.graceDays + 1;
  PS.presellDay(s);
  assert.equal(offer.status, 'cancelled');
  assert.ok(s.stripe.refunds.length - before >= paid.length - 1 && paid.every((a) => a.status === 'refunded'));
  assert.equal(mistakes(s, 'missed_delivery_date'), 1);
  assert.ok(salesEvents(s, { types: ['offer_refunds_issued'] }).length === 1);
  // overpromising: an unbacked promise is delivered without
  const w = presellWorld(32, 40);
  const o2 = PS.createOffer(w.s, { title: 'Big', description: 'Matches every Shopify payout to the bank deposit overnight so month-end close takes 1 hour instead of 2 days, without spreadsheets.', price: 99, interval: 'month', startDay: w.s.day + 30, promises: [{ text: 'AI forecasting', featureId: null }, { text: 'Missed refund alerts', featureId: 'f9' }] });
  for (const d of w.deals) PS.askForCommitment(w.s, { offerId: o2.id, dealId: d.id, level: 'deposit' });
  w.s.apps.product.features[0].status = 'shipped';
  const res = PS.deliverOffer(w.s, o2.id);
  assert.equal(res.missing, 1);
  assert.equal(mistakes(w.s, 'overpromised_features'), res.refunded + res.converted > 0 ? 1 : 0);
  assert.throws(() => PS.deliverOffer(w.s, o2.id));
});

// ---------------------------------------------------------------------------
// Founder-led variants and AE timing
// ---------------------------------------------------------------------------

test('variants: win rate by variant, stability gate, and hiring an AE too early is a mistake', () => {
  const s = fresh('smb', 41);
  const crm = ensureCrm(s);
  const mk = (i, won, message) => {
    const { contact, company } = addContact(s, { firstName: `V${i}`, email: `v${i}@c${i}.com`, title: 'Owner', company: `C${i}` });
    const d = ensureDeal(s, { companyId: company.id, contactId: contact.id, stage: 'qualified' });
    d.history.push({ stage: 'qualified', day: i }, { stage: won ? 'won' : 'lost', day: i + 1 });
    d.stage = won ? 'won' : 'lost';
    tagDeal(s, d, { message, demo: 'live data first' });
    return d;
  };
  for (let i = 0; i < 10; i++) mk(i, i < 8, 'cost of month-end'); // 8/10
  for (let i = 10; i < 20; i++) mk(i, i < 11, 'save time'); // 1/10
  const st = variantStats(s, 'message');
  assert.equal(st.rows[0].variant, 'cost of month-end');
  assert.equal(st.clearWinner, 'cost of month-end');
  assert.equal(variantStats(s, 'demo').rows.length, 1);
  const wr = founderWinRate(s);
  assert.equal(wr.closed, 20);
  // hire an AE: only 16 deals but the recent half differs from the older half a lot -> not stable
  const mem = { id: 'ae_1', role: 'ae', kind: 'employee', status: 'active', monthlyCost: 9000 };
  s.apps.people = { members: [mem] };
  const stable = wr.stable;
  hybridDay(s);
  assert.equal(mistakes(s, 'ae_before_repeatable_sales'), stable ? 0 : 1);
  const t = fresh('smb', 42);
  t.apps.people = { members: [{ ...mem }] };
  hybridDay(t);
  assert.equal(mistakes(t, 'ae_before_repeatable_sales'), 1, 'no closed deals at all');
  hybridDay(t);
  assert.equal(mistakes(t, 'ae_before_repeatable_sales'), 1, 'logged once per hire');
  void crm;
});

// ---------------------------------------------------------------------------
// Paid pilots and RFPs, end to end
// ---------------------------------------------------------------------------

const GOOD_CALL = [
  { from: 'me', text: 'Thanks for the time. Tell me about the last time a job got held up because of this?' },
  { from: 'them', text: 'Two weeks ago a roof job sat for three days because the quote never got approved and the crew went home.' },
  { from: 'me', text: 'What did that cost you, and how do you handle it today?' },
  { from: 'them', text: 'About $4,000 in lost days. My office manager tracks it on a whiteboard and calls me.' },
  { from: 'me', text: 'Who else besides you has to say yes to something like this, and is there money set aside for it?' },
  { from: 'them', text: 'Just me. If it pays for itself I just put it on the card.' },
  { from: 'me', text: 'When do you want it live? Could we start a trial with your office manager next Monday?' },
  { from: 'them', text: 'Sure, sounds good. Monday works.' },
];
const paperBot = { id: 'paperbot', onDay(state) { for (const d of state.apps.crm?.deals ?? []) for (const it of d.paperwork ?? []) if (it.status === 'open' && !/^soc2_type/.test(it.id)) { try { workPaperwork(state, d, it.id, 1000); } catch { /* cert */ } } } };

test('enterprise paid pilot -> conversion -> RFP award -> contract works end to end with one customer record', () => {
  let won = 0, converted = 0, rfp = 0;
  for (let i = 0; i < 140 && won < 1; i++) {
    const s = newState({ companyName: 'Ledgerly', model: 'ent', path: 'vc', founderName: 'Pat Doe', seed: 900 + i });
    ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
    post(s, { amount: 5e6, counterparty: 'Pat', category: 'owner_contribution' });
    s.apps.product = { features: [{ id: 'f1', title: 'Core', status: 'shipped' }] };
    s.market.fit.product.score = 0.6;
    s.plans[0].price = 200000;
    const L = ensureLegal(s); L.soc2 = 'type2'; L.dpaReady = true;
    const { contact, company } = addContact(s, { firstName: 'Pat', lastName: 'Lee', email: `p${i}@city${i}.gov`, title: 'Director of Operations', company: `City ${i}`, domain: `city${i}.gov` }, { source: 'network', warm: true });
    Object.assign(company, { size: '5000', segmentId: 'local_gov', segmentManual: true });
    const m = createMeeting(s, { contactId: contact.id, slot: nextSlot(s, { minLead: 1 }), source: 'network' });
    m.transcript = GOOD_CALL; m.status = 'held'; completeEvent(s, m.eventId, 'done');
    const card = heuristicScorecard(GOOD_CALL);
    applyCallOutcome(s, m, card, callQuality(card));
    const deal = ensureCrm(s).deals.find((d) => d.contactId === contact.id);
    if (!['meeting_held', 'qualified'].includes(deal.stage) || !proposePilot(s, deal, { type: 'paid_pilot', fee: 60000 }).ok) continue;
    assert.ok(deal.pilot.subId && deal.pilot.customerId);
    advance(s, 400, [...APPS, paperBot]);
    if (deal.pilot.status !== 'converted') continue;
    converted++;
    if (deal.proc?.rfp) { rfp++; if (deal.stage === 'won') assert.equal(deal.rfpAwarded, true, 'a pilot does not waive the bid'); }
    if (deal.stage === 'won') { won++; assert.equal(s.stripe.customers.filter((c) => c.crmCompanyId === company.id).length, 1, 'pilot customer reused'); assert.equal(deal.customerId, deal.pilot.customerId); }
  }
  assert.ok(converted >= 1 && rfp >= 1 && won >= 1, `converted ${converted}, rfp ${rfp}, won ${won}`);
});

test('RFP: no-bid declines cleanly', () => {
  const s = fresh('ent', 77);
  const { contact, company } = addContact(s, { firstName: 'A', email: 'a@b.gov', title: 'Director', company: 'Bee' });
  const d = ensureDeal(s, { companyId: company.id, contactId: contact.id, stage: 'qualified' });
  assert.throws(() => declineRfp(s, d));
  d.proc = { rfp: true };
  declineRfp(s, d);
  assert.equal(d.stage, 'lost');
  assert.match(d.lostReason, /No-bid/);
});
