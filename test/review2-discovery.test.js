// Review round 2, discovery area (research, MVP lab, negotiation views, AI costs): one regression test per fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket } from '../public/core/market.js';
import { ensureStripe } from '../public/core/stripe.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { rng } from '../public/core/util.js';
import * as llm from '../public/core/llm.js';
import { truthOf } from '../public/core/truth.js';
import { productSlice, researchSlice, newFeature } from '../public/apps/product/store.js';
import { bookReal, logReal, sendTurn, finishInterview, heldInterviews } from '../public/apps/research.js';
import { recruitBatch } from '../public/apps/research/recruit.js';
import { chatPerson } from '../public/apps/research/sim.js';
import { adoptRequest } from '../public/apps/research/debrief.js';
import { addHypothesis, decideHypothesis } from '../public/apps/research/hypotheses.js';
import { hypothesesView } from '../public/apps/research/views.js';
import { disc } from '../public/apps/research/store.js';
import * as M from '../public/apps/mvp/model.js';
import { aiSlice } from '../public/apps/aicost/model.js';
import { setRouting } from '../public/apps/aicost/inference.js';
import { gatherEvidence } from '../public/apps/aicost/autofill.js';
import { wireAiCosts, wirePerks } from '../public/apps/aicost/views.js';

function mk(seed = 5) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'P', seed });
  ensureStripe(s); ensureMarket(s).flags = { fixedDemand: 1 }; seedDefaultStack(s);
  post(s, { amount: 5e5, counterparty: 'P', category: 'owner_contribution' });
  s.company.oneLiner = 'Invoice reminders for plumbers and HVAC contractors';
  s.company.icp = 'HVAC company operations managers across several locations';
  s.founder.network.friends = 600;
  return s;
}
const ctxOf = (s) => ({ state: s, llm });
const NOTES = 'Last week they spent 6 hours chasing 14 late invoices by hand in a spreadsheet. They currently pay a bookkeeper $400 a month and tried two reminder tools that did not sync with QuickBooks. They lost one client over a billing mixup last quarter and would introduce us to their peer group.';

test('research: the "Real interviews" count is held calls only, not failed outreach or open bookings', () => {
  const s = mk();
  const sl = researchSlice(s);
  sl.interviews.push({ id: 'a', real: true, status: 'no-reply', persona: { name: 'A' } }, { id: 'b', real: true, status: 'scheduled', persona: { name: 'B' } },
    { id: 'c', real: true, status: 'canceled', persona: { name: 'C' } }, { id: 'd', real: true, status: 'done', persona: { name: 'D' } }, { id: 'e', real: false, status: 'done', persona: { name: 'E' } });
  assert.deepEqual(heldInterviews(sl).map((i) => i.id), ['d']);
});

test('research: notes cannot be logged against a booking that was canceled or already logged', async () => {
  const s = mk();
  let iv = bookReal(s, { name: 'Ann Lee', channel: 'warm', email: 'ann@x.com' });
  for (let i = 0; i < 30 && iv.status !== 'scheduled'; i++) iv = bookReal(s, { name: 'Ann Lee', channel: 'warm', email: 'ann@x.com' });
  assert.equal(iv.status, 'scheduled');
  iv.status = 'canceled';
  const before = researchSlice(s).insights.length;
  await assert.rejects(logReal(ctxOf(s), { name: 'Ann Lee', role: '', company: '', channel: 'warm', notes: NOTES, commitments: ['intro'], bookingId: iv.id }), /no longer open/);
  assert.equal(iv.status, 'canceled', 'a canceled call is not turned into a done interview');
  assert.equal(researchSlice(s).insights.length, before);
});

test('research: a rehearsal that is no longer live cannot take more questions or be graded again', async () => {
  const s = mk();
  const iv = { id: 'r1', real: false, status: 'abandoned', day: 0, persona: { name: 'Pat', facts: { painReal: true } }, messages: [{ from: 'them', text: 'Hi' }] };
  researchSlice(s).interviews.push(iv);
  await assert.rejects(sendTurn(ctxOf(s), iv, 'Tell me about the last time'), /not live/);
  await assert.rejects(finishInterview(ctxOf(s), iv), /not live/);
  assert.equal(iv.grade, undefined);
});

test('research: a simulated interviewee tells the same story on every turn, even after other draws', () => {
  const s = mk();
  const booked = recruitBatch(s, { channel: 'panel', sends: 20, target: s.company.icp, screener: 'When did you last chase a late invoice?\nHow many locations does your company have?' }).booked;
  const iv = booked.find((x) => x.hidden.hasPain && x.hidden.lastIncident != null) ?? booked[0];
  s.day = iv.day; iv.confirmedDay = iv.day - 1;
  const a = chatPerson(s, iv);
  for (let i = 0; i < 7; i++) rng(s); // anything else in the game advancing the main stream between two questions
  const b = chatPerson(s, iv);
  assert.equal(b.workaround, a.workaround);
  assert.equal(b.lastIncident, a.lastIncident);
});

test('research: "Keep testing" leaves the verdict buttons available for a later call', () => {
  const s = mk();
  const h = addHypothesis(s, { customer: 'operations managers at multi-site HVAC companies', problem: 'late invoices get chased by hand every week' });
  decideHypothesis(s, h.id, 'continue');
  assert.match(String(hypothesesView({ state: s })), /data-decide="killed\|/);
  decideHypothesis(s, h.id, 'killed');
  assert.doesNotMatch(String(hypothesesView({ state: s })), /data-decide=/);
});

test('research: drafting a feature from the same request twice is refused', () => {
  const s = mk();
  const d = disc(s);
  d.interviews.push({ id: 'iv1', real: true, status: 'done', persona: { name: 'Bo', role: 'Ops manager' } });
  d.insights.push({ id: 'ins1', interviewId: 'iv1', text: 'Export to our ERP', evidenceType: 'feature_wish', ask: 'Export to our ERP' });
  adoptRequest(s, 'ins1');
  const n = productSlice(s).features.length;
  assert.throws(() => adoptRequest(s, 'ins1'), /already drafted/);
  assert.equal(productSlice(s).features.length, n);
});

test('MVP lab: a partner request cannot be queued in Product twice', () => {
  const s = mk();
  const t = truthOf(s);
  const g = t.segments.find((x) => x.id === t.bestSegmentId);
  const cands = [M.syntheticCandidate(s, 'friend'), M.syntheticCandidate(s, 'friend'), M.syntheticCandidate(s, 'friend')];
  const e = M.startPartners(s, { audience: g.keywords.join(' '), price: 40, candidates: cands, hypothesis: null });
  e.partners.push(...e.declined.splice(0));
  let fb = null;
  for (let i = 0; i < 20 && !fb; i++) { M.holdSession(s, e.id); fb = e.feedback.find((f) => f.kind !== 'compliment'); }
  assert.ok(fb, 'some request came up');
  M.adoptRequest(s, e.id, fb.id);
  const n = productSlice(s).features.length;
  assert.throws(() => M.adoptRequest(s, e.id, fb.id), /Already queued/);
  assert.equal(productSlice(s).features.length, n);
});

test('AI costs: tuning the router returns real hours and is charged once', () => {
  const s = mk();
  const cash0 = s.bank.txns.length;
  const r = setRouting(s, { enabled: true, tuned: true });
  assert.ok(Number.isFinite(r.hours) && r.hours > 1, `hours ${r.hours}`);
  const evals1 = s.bank.txns.length - cash0;
  const r2 = setRouting(s, { enabled: true, tuned: true }); // the checkbox stays checked (and disabled) after tuning
  assert.equal(r2.hours, 0.5);
  assert.equal(s.bank.txns.length - cash0, evals1, 'no second eval charge');
  assert.equal(aiSlice(s).inf.routing.tuned, true);
});

test('AI costs: spec autofill ignores insights from conversations the founder set aside', () => {
  const s = mk();
  const sl = researchSlice(s);
  sl.insights.push({ id: 'i1', real: true, verified: true, text: 'Spent 5 hours last week', type: 'pain', theme: 'Invoices' }, { id: 'i2', real: true, verified: true, excluded: true, text: 'Professional respondent story', type: 'pain', theme: 'Invoices' });
  const ev = gatherEvidence(s);
  assert.deepEqual(ev.real.map((i) => i.id), ['i1']);
});

// Drive a delegated handler without a DOM: the fake root records listeners; ctx.act mirrors main.js (throw = rejected, nothing charged).
function fakeRoot() {
  const ls = {};
  return { addEventListener: (ev, fn) => (ls[ev] ??= []).push(fn), contains: () => true, fire(ev, sel, el) { for (const fn of ls[ev] ?? []) fn({ target: { closest: (q) => (q === sel ? el : null) }, preventDefault() {} }); } };
}
function fakeCtx(s) {
  const out = [];
  return { state: s, out, act: (fn, opts = {}) => { try { fn(s); out.push({ ok: true, hours: opts.hours ?? 0 }); } catch (e) { out.push({ ok: false, error: e.message }); } } };
}

test('AI costs UI: a stale "migrate" or "adopt tool" click is rejected (no hours charged) instead of toasting an error', () => {
  const s = mk();
  const root = fakeRoot(); const ctx = fakeCtx(s);
  wireAiCosts(root, ctx);
  root.fire('click', '[data-aimig]', { dataset: { aimig: 'dep_missing', evals: '0' } });
  assert.equal(ctx.out.at(-1).ok, false);
  assert.match(ctx.out.at(-1).error, /Nothing to migrate/);
  const root2 = fakeRoot(); const ctx2 = fakeCtx(s);
  wirePerks(root2, ctx2);
  root2.fire('click', '[data-adopt]', { dataset: { adopt: 'no_such_program' } });
  assert.equal(ctx2.out.at(-1).ok, false);
  assert.match(ctx2.out.at(-1).error, /Nothing to adopt/);
});

test('research: incident timing reads the number of days (drawPerson keeps spoken text in lastIncident)', async () => {
  const { insightsFromSim } = await import('../public/apps/research/synthesis.js');
  const s = mk();
  const booked = recruitBatch(s, { channel: 'panel', sends: 30, target: s.company.icp, screener: 'When did you last chase a late invoice?\nHow many locations does your company have?' }).booked;
  const iv = booked.find((x) => x.hidden.hasPain && !x.hidden.fraud);
  assert.ok(iv, 'someone with the problem was recruited');
  assert.equal(typeof iv.hidden.lastIncidentDays, 'number');
  const p = chatPerson(s, iv);
  assert.doesNotMatch(p.lastIncident, /NaN/);
  iv.messages = [{ from: 'them', text: 'Hi' }, { from: 'me', text: 'Tell me about the last time it went wrong', qtype: 'past_specific' }, { from: 'them', text: p.lastIncident, revealed: ['lastIncident'], commitment: 'none' }];
  const ins = insightsFromSim(s, iv).find((i) => i.type === 'pain');
  assert.equal(ins.incidentDays, iv.hidden.lastIncidentDays, 'a number the board and hypotheses can compare with their day windows');
  const fraud = booked.find((x) => x.hidden.fraud);
  if (fraud) assert.doesNotMatch(chatPerson(s, fraud).lastIncident ?? '', /NaN/);
});

test('MVP lab: a concierge week can be delivered only once per 7 game days', () => {
  const s = mk();
  const t = truthOf(s);
  const g = t.segments.find((x) => x.id === t.bestSegmentId);
  const e = M.startCohort(s, { type: 'concierge', audience: g.keywords.join(' '), recruit: 'outreach', n: 6, hoursPerCustomer: 1, price: 30, hypothesis: null });
  e.cohort.members.forEach((m) => { m.active = true; });
  M.deliverWeek(s, e.id);
  e.cohort.members.forEach((m) => { m.active = true; });
  assert.throws(() => M.deliverWeek(s, e.id), /takes a week/);
  s.day += 6;
  assert.throws(() => M.deliverWeek(s, e.id), /1 day/);
  s.day += 1;
  M.deliverWeek(s, e.id);
  assert.equal(e.weeks.length, 2);
});

test('a deal agreed on the call supersedes the written redline (new version, agreed clauses, no pending reply)', async () => {
  const { applyVcTerms } = await import('../public/apps/negotiate/vc.js');
  const { newState } = await import('../public/core/state.js');
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed: 2 });
  const inv = { id: 'i1', log: [], terms: { instrument: 'priced', preMoney: 8e6, amount: 2e6, roundSize: 2e6, redline: { version: 2, pending: { day: 5 }, clauses: { pool: { agreed: false }, board: { agreed: false } } } } };
  applyVcTerms(s, inv, { preMoney: 9e6, pool: 0.1, liq: 'np1', board: 'founder', proRata: 'major', vesting: 'keep', protective: 'standard', round: 'base', noShop: 'd45' });
  const ts = inv.terms.redline;
  assert.equal(ts.version, 3);
  assert.equal(ts.pending, null);
  assert.ok(Object.values(ts.clauses).every((c) => c.agreed));
});
