import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { dateOf } from '../public/core/util.js';
import { completeEvent } from '../public/core/calendar.js';
import { APPS } from '../public/apps/registry.js';
import { ensureLegal } from '../public/apps/legal/sim.js';
import { addContact, ensureCrm, ensureDeal, startProposal, workPaperwork, createMeeting, nextSlot, ensureCommittee } from '../public/apps/sales/model.js';
import { applyCallOutcome } from '../public/apps/sales/engine.js';
import { heuristicScorecard, scorecardSchema } from '../public/apps/sales/scorecard.js';
import { callQuality } from '../public/apps/sales/deals.js';
import { segmentIdOf, assignIcpSegment, committeeContacts, methodFor, getSegment, committeeEffect } from '../public/apps/sales/segments.js';

function fresh(model, seed, price) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'vc', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 2e6, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Core workflow', status: 'shipped' }] };
  s.market.fit.product.score = 0.6;
  if (price) s.plans[0].price = price;
  const L = ensureLegal(s); L.soc2 = 'type2'; L.dpaReady = true;
  return s;
}
const paperBot = { id: 'paperbot', onDay(state) { for (const d of state.apps.crm?.deals ?? []) for (const it of d.paperwork ?? []) if (it.status === 'open' && !/^soc2_type/.test(it.id)) { try { workPaperwork(state, d, it.id, 1000); } catch { /* cert */ } } } };
const APPS_P = [...APPS, paperBot];

function prospect(s, { segment, size, title = 'Owner', i = 0, industry = '' }) {
  const { contact, company } = addContact(s, { firstName: `Pat${i}`, lastName: 'Lee', email: `p${i}@co${i}${s.seed & 1023}.com`, title, company: `Co ${i}`, domain: `co${i}x.com`, industry });
  Object.assign(company, { size: String(size) });
  if (segment) Object.assign(company, { segmentId: segment, segmentManual: true });
  return { contact, company };
}
const engageAll = (s, d, { except = [] } = {}) => {
  for (const c of committeeContacts(s, d)) if (!except.includes(c.committee.role)) Object.assign(c.committee, { engaged: true, stance: 'support', addressed: true, discovered: true });
  if (d.method) for (const e of d.method.elements) d.method.known[e.id] = s.day;
};
const won = (d) => ['won', 'contract'].includes(d.stage);

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

test('segments: companies map to real buyer segments; synthetic prospects follow the ICP', () => {
  const s = fresh('smb', 1);
  const cases = [['Roofing contractor', 8, 'trades'], ['Lincoln Unified School District', 900, 'k12'], ['Family dental clinic', 12, 'health_practices'], ['Boutique florist', 3, 'retail_shops'], ['', 40, 'startup_smb']];
  for (const [industry, size, want] of cases) {
    const { company } = prospect(s, { industry, size, i: industry.length + size });
    assert.equal(segmentIdOf(s, company), want, industry);
  }
  s.company.icp = 'Owners of roofing and HVAC contractors with 5-30 field techs';
  const { company } = prospect(s, { size: 0, i: 99 });
  company.size = ''; company.industry = '';
  assignIcpSegment(s, company, () => 0.3);
  assert.equal(company.segmentId, 'trades');
});

test('committees grow with ACV; owner-run deals stay 1–3 people; BANT for small owner deals, MEDDPICC for enterprise', () => {
  const size = (seg, acv, n = 30) => {
    let t = 0;
    for (let i = 0; i < n; i++) {
      const s = fresh(seg === 'trades' ? 'smb' : 'ent', 100 + i, acv / 12);
      s.plans[0].interval = 'month';
      const { contact, company } = prospect(s, { segment: seg, size: seg === 'trades' ? 8 : 20000, title: seg === 'trades' ? 'Owner' : 'Director of Operations', i });
      const d = ensureDeal(s, { companyId: company.id, contactId: contact.id, stage: 'qualified' });
      d.amount = acv;
      ensureCommittee(s, d);
      t += d.committee.members.length;
    }
    return t / n;
  };
  const small = size('enterprise', 3000), big = size('enterprise', 250000), trades = size('trades', 1500);
  assert.ok(big > small + 2, `enterprise committee ${small.toFixed(1)} → ${big.toFixed(1)}`);
  assert.ok(trades <= 3, `trades committee ${trades.toFixed(1)}`);
  assert.equal(methodFor(getSegment('trades'), 1500, 1).id, 'bant');
  assert.equal(methodFor(getSegment('enterprise'), 200000, 9).id, 'meddpicc');
  const schema = scorecardSchema(methodFor(getSegment('enterprise'), 200000, 9));
  assert.ok(schema.required.includes('methodElements') && schema.properties.methodElements.required.includes('paperProcess'));
  assert.equal(schema.properties.methodElements.additionalProperties, false);
});

test('enterprise: no economic-buyer access or an unaddressed security blocker closes far less', () => {
  const run = (mode, seeds = 60) => {
    let w = 0;
    for (let i = 0; i < seeds; i++) {
      const s = fresh('ent', 300 + i, 60000);
      const { contact, company } = prospect(s, { segment: 'enterprise', size: 20000, title: 'Director of Operations', i });
      const d = ensureDeal(s, { companyId: company.id, contactId: contact.id, stage: 'qualified' });
      d.callQuality = 0.8; d.hasPain = true;
      startProposal(s, d, { planId: s.plans[0].id });
      engageAll(s, d, { except: mode === 'noEB' ? ['economic_buyer'] : [] });
      if (mode === 'blocker') {
        let sec = committeeContacts(s, d).find((c) => ['security', 'technical'].includes(c.committee.role));
        if (!sec) continue;
        Object.assign(sec.committee, { stance: 'oppose', addressed: false, engaged: false });
      }
      advance(s, 420, APPS_P);
      if (won(d)) w++;
    }
    return w / seeds;
  };
  const good = run('good'), noEB = run('noEB'), blocker = run('blocker');
  assert.ok(good >= 0.08, `well-covered win ${good}`);
  assert.ok(noEB < good * 0.65, `no EB access ${noEB} vs ${good}`);
  assert.ok(blocker < good * 0.75, `unaddressed blocker ${blocker} vs ${good}`);
});

test('SMB trades: one good call with the owner closes fast, card payment, no committee burden', () => {
  let wins = 0, qualified = 0; const days = [];
  for (let i = 0; i < 200; i++) {
    const s = fresh('smb', 500 + i, 49);
    const { contact, company } = prospect(s, { industry: 'Roofing contractor', size: 8, title: 'Owner', i });
    const d = ensureDeal(s, { companyId: company.id, contactId: contact.id, stage: 'meeting_booked' });
    company.research = { fit: 0.85, pains: ['quotes stuck waiting for approval'] }; // a researched, in-ICP prospect
    const m = createMeeting(s, { contactId: contact.id, slot: nextSlot(s, { minLead: 1 }), source: 'outbound' });
    m.transcript = GOOD_CALL;
    m.status = 'held';
    completeEvent(s, m.eventId, 'done');
    const card = heuristicScorecard(GOOD_CALL);
    const out = applyCallOutcome(s, m, card, callQuality(card));
    assert.equal(d.segmentId, 'trades');
    assert.ok(d.committee.members.length <= 3);
    if (!out.qualified) continue;
    qualified++;
    const start = s.day;
    startProposal(s, d, { planId: s.plans[0].id });
    assert.ok(d.proc.cardPay, 'under the card limit');
    for (let k = 0; k < 60 && !won(d) && d.stage !== 'lost'; k++) advance(s, 1, APPS_P);
    if (won(d)) { wins++; days.push(s.day - start); }
  }
  days.sort((a, b) => a - b);
  assert.ok(wins / qualified >= 0.12, `${wins}/${qualified} qualified deals closed (trades qualified win rate ≈22%)`);
  assert.ok(days[Math.floor(days.length / 2)] <= 21, `median ${days[Math.floor(days.length / 2)]} days`);
});

test('K-12: unbudgeted deals wait for the new fiscal year and the NDPA gates the decision', () => {
  let ndpa = 0, waited = 0, unbudgeted = 0, lostForNdpa = 0, n = 40;
  for (let i = 0; i < n; i++) {
    const s = fresh('ent', 700 + i, 20000);
    const { contact, company } = prospect(s, { industry: 'Lincoln Unified School District', size: 900, title: 'Director of Technology', i });
    const d = ensureDeal(s, { companyId: company.id, contactId: contact.id, stage: 'qualified' });
    d.callQuality = 0.8; d.hasPain = true;
    startProposal(s, d, { planId: s.plans[0].id });
    assert.equal(d.segmentId, 'k12');
    const hasNdpa = d.paperwork.some((p) => p.id === 'sdpc_ndpa');
    if (hasNdpa) ndpa++;
    if (d.proc.unbudgeted) {
      unbudgeted++;
      if (dateOf(s, d.decisionDay).toISOString().slice(0, 10) >= '2027-07-01') waited++; // FY starts July 1
    }
    if (hasNdpa && i % 2 === 0) { // nobody delivers the paperwork
      engageAll(s, d);
      advance(s, 300, APPS);
      if (/privacy agreement/i.test(d.lostReason ?? '') || d.stage === 'lost') lostForNdpa++;
    }
  }
  assert.ok(ndpa / n >= 0.65, `NDPA required in ${ndpa}/${n}`);
  assert.ok(unbudgeted >= 10 && waited === unbudgeted, `${waited}/${unbudgeted} unbudgeted deals pushed to the July 1 fiscal year`);
  assert.ok(lostForNdpa >= 5, `${lostForNdpa} lost without the NDPA`);
});

test('deal-level MEDDPICC panel fills in from call scorecards and surfaces hidden stakeholders', () => {
  const s = fresh('ent', 900, 80000);
  const { contact, company } = prospect(s, { segment: 'enterprise', size: 20000, title: 'Director of Operations', i: 1 });
  const d = ensureDeal(s, { companyId: company.id, contactId: contact.id, stage: 'meeting_booked' });
  d.amount = 80000;
  const m = createMeeting(s, { contactId: contact.id, slot: nextSlot(s, { minLead: 1 }), source: 'outbound' });
  const t = [
    { from: 'me', text: 'Walk me through the last software purchase you made here, step by step. Who signs?' },
    { from: 'them', text: 'Our VP signs, IT security reviews it, procurement runs the vendor onboarding.' },
    { from: 'me', text: 'What do security, legal and procurement need from us, and how long does each take?' },
    { from: 'them', text: 'A SIG Lite questionnaire, our MSA and a vendor portal registration. Usually six weeks.' },
    { from: 'me', text: 'What does this problem cost you per month today? Tell me about the last time it went wrong.' },
    { from: 'them', text: 'Last quarter we lost two weeks of analyst time reconciling vendor data, roughly $30,000.' },
  ];
  m.transcript = t;
  const card = heuristicScorecard(t);
  assert.equal(card.meddicc.paperProcess, true);
  ensureCommittee(s, d);
  const hiddenBefore = committeeContacts(s, d).filter((c) => c.hidden).length;
  applyCallOutcome(s, m, card, callQuality(card));
  const k = d.method.known;
  assert.equal(d.method.id, 'meddpicc');
  for (const el of ['decisionProcess', 'paperProcess', 'pain']) assert.ok(k[el] != null, `${el} known`);
  assert.ok(committeeContacts(s, d).filter((c) => c.hidden).length < hiddenBefore, 'asking about the process reveals stakeholders');
  const eff = committeeEffect(s, d);
  assert.ok(eff.notes.some((n) => /economic buyer/i.test(n)) || eff.mult < 1);
});
