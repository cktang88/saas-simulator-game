// Regression tests from the adversarial People / Co-founder / Legal bug hunt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ensurePeople, terminate } from '../public/apps/people/sim.js';
import { payrollLines } from '../public/apps/people/payroll.js';
import { ensureCf, sign, partWays } from '../public/apps/cofounder/sim.js';
import { ensureFr } from '../public/apps/fundraising/sim.js';
import { incorporate, signFounderDocs, legalDay, ensureLegal, payFranchiseTax, ASSESS_AFTER_DAYS } from '../public/apps/legal/sim.js';
import { dayFor, buildCalendar } from '../public/apps/legal/deadlines.js';

function fresh(seed = 7) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 300000, counterparty: 'Pat', category: 'owner_contribution' });
  return s;
}

function signedCofounder(s, salary = 8000) {
  ensurePeople(s);
  const cf = ensureCf(s);
  const c = { id: 'cfc_1', name: 'Sam Reyes', skill: 'technical', memberRole: 'engineer', commitment: 'full-time now', quality: 0.6, interest: 0.7, chat: [], log: [], offers: [], status: 'negotiating' };
  cf.candidates.push(c);
  sign(s, c, { pct: 0.3, vesting: 'standard', salary, title: 'CTO' });
  return c;
}

test('a salaried co-founder who breaks up leaves payroll', () => {
  const s = fresh();
  const c = signedCofounder(s);
  const p = ensurePeople(s);
  const m = p.members.find((x) => x.id === c.signed.memberId);
  assert.ok(m && m.engagement === 'employee');
  s.day += 40;
  assert.ok(partWays(s, c.id));
  assert.equal(m.status, 'gone');
  const lines = payrollLines(s, p.members, { start: s.day + 10, end: s.day + 24 });
  assert.equal(lines.filter((l) => l.memberId === m.id).length, 0, 'no salary after the breakup');
});

test('letting a co-founder go in People runs the co-founder exit (repurchase, cap table)', () => {
  const s = fresh();
  const c = signedCofounder(s, 0);
  const p = ensurePeople(s);
  s.day += 60; // before the cliff: every share is repurchased
  terminate(s, c.signed.memberId, { reason: 'let go' });
  assert.equal(c.status, 'departed');
  assert.equal(ensureFr(s).cap.founders.some((f) => f.cofounderId === c.id), false, 'unvested shares came back');
  assert.equal(p.members.find((x) => x.id === c.signed.memberId).status, 'gone');
});

test('an ignored Delaware franchise tax is assessed with penalties instead of costing nothing', () => {
  const s = fresh();
  incorporate(s, { provider: 'atlas', operatingState: 'DE' });
  for (let i = 0; i < 3; i++) { s.day++; legalDay(s); }
  assert.equal(s.company.incorporated, true);
  signFounderDocs(s, {});
  ensureLegal(s).founderStock.filed83b = true;
  const due = dayFor(s, '2027-03-01');
  s.day = due + ASSESS_AFTER_DAYS - 1;
  legalDay(s);
  assert.equal(ensureLegal(s).paidFilings['de-franchise-2027'], undefined, 'not yet assessed');
  s.day++;
  const before = s.bank.txns.length;
  legalDay(s);
  const paid = ensureLegal(s).paidFilings['de-franchise-2027'];
  assert.ok(paid?.assessed, 'assessed after the grace period');
  const bill = s.bank.txns.slice(before).filter((t) => t.category === 'taxes').reduce((a, t) => a - t.amount, 0);
  assert.ok(bill > 200 + 50, `penalty on top of the tax: ${bill}`);
  assert.equal(buildCalendar(s).find((i) => i.key === 'de-franchise-2027')?.status ?? 'done', 'done');
  assert.ok((s.mistakes ?? []).some((m) => m.id === 'filing_ignored'));
  assert.throws(() => payFranchiseTax(s, 'de-franchise-2027', { method: 'billed' }));
});

test('rescinding an accepted offer is a logged, charged mistake (not free)', () => {
  const s = fresh();
  const p = ensurePeople(s);
  const m = { id: 'mem_r1', name: 'Riley Offer', role: 'engineer', kind: 'employee', engagement: 'employee', region: 'us', status: 'offer', startDay: s.day + 14, salary: 150000, hoursPerWeek: 40 };
  p.members.push(m);
  const used = s.founder.hoursUsed;
  terminate(s, m.id, { reason: 'contract ended' });
  assert.equal(m.status, 'gone');
  assert.ok((s.mistakes ?? []).some((x) => x.id === 'offer_rescinded'));
  assert.ok(s.founder.hoursUsed > used, 'founder hours charged');
});

test('legal hygiene reader: ignoring a filing until it is assessed lowers the tier', async () => {
  const { legalHygieneRead } = await import('../public/apps/legal/compliance.js');
  const s = fresh();
  incorporate(s, { provider: 'atlas', operatingState: 'DE' });
  for (let i = 0; i < 3; i++) { s.day++; legalDay(s); }
  const before = legalHygieneRead(s).score;
  s.mistakes = [...(s.mistakes ?? []), { functionId: 'legal_hygiene', id: 'filing_ignored', day: s.day, cost: {} }];
  assert.ok(legalHygieneRead(s).score < before);
});

test('option grants: a leaver keeps vested options on the cap-table export; unvested return to the pool', async () => {
  const { optionGrants } = await import('../public/apps/people/capacity.js');
  const { poolUsed } = await import('../public/apps/people/pool.js');
  const s = fresh();
  const p = ensurePeople(s);
  s.day = 800;
  p.members.push({ id: 'g1', name: 'Gone Eng', role: 'engineer', kind: 'employee', engagement: 'employee', region: 'us', status: 'gone', startDay: 0, endDay: 730, salary: 1, equityPct: 1, grant: { pct: 1, vestStart: 0, cliffDay: 365, vestYears: 4, status: 'granted' } });
  p.members.push({ id: 'g2', name: 'Early Leaver', role: 'engineer', kind: 'employee', engagement: 'employee', region: 'us', status: 'gone', startDay: 0, endDay: 200, salary: 1, equityPct: 1, grant: { pct: 1, vestStart: 0, cliffDay: 365, vestYears: 4, status: 'granted' } });
  const g = optionGrants(s);
  assert.equal(g.length, 1, 'pre-cliff leaver holds nothing');
  assert.equal(g[0].name, 'Gone Eng (departed)');
  assert.equal(g[0].pct, poolUsed(p));
  assert.ok(g[0].pct > 0.45 && g[0].pct < 0.55, `~half vested after two years: ${g[0].pct}`);
});

test('missed 83(b): credited vesting months are not taxed again at their later value', () => {
  const run = (creditMonths) => {
    const s = fresh();
    incorporate(s, { provider: 'atlas', operatingState: 'DE' });
    for (let i = 0; i < 3; i++) { s.day++; legalDay(s); }
    const fs = signFounderDocs(s, { creditMonths });
    fs.missed = true;
    s.apps.fundraising = { lastPostMoney: 12_000_000 }; // fmv $1/share
    const L = ensureLegal(s);
    for (const d of [30, 60, 390]) { s.day = fs.grantDay + d; legalDay(s); }
    return { fs, taxed: L.personalTax.map((x) => [x.day - fs.grantDay, x.shares]) };
  };
  const withCredit = run(12);
  const total = withCredit.fs.issued;
  // 12 credited months satisfy the cliff at grant: month 1 after grant is taxed, the credited 25% never is.
  const at60 = withCredit.taxed.find(([d]) => d === 60);
  assert.equal(at60[1], Math.round(total / 48));
  const sum = withCredit.taxed.reduce((a, [, n]) => a + n, 0);
  assert.equal(sum, Math.round((total * 12) / 48), 'month 12 after grant: 12 taxed months, the 12 credited months untaxed');
  const plain = run(0);
  assert.equal(plain.taxed.length, 1, 'no credit: nothing before the cliff');
  assert.equal(plain.taxed[0][1], Math.round((total * 12) / 48));
});

test('a random co-founder breakup runs the People exit steps (access-removal checklist)', async () => {
  const { ensureOps } = await import('../public/apps/people/ops-state.js');
  const s = fresh();
  const c = signedCofounder(s, 8000);
  s.day += 40;
  partWays(s, c.id);
  assert.ok(ensureOps(s).offboard.some((x) => x.memberId === c.signed.memberId));
});

test('re-selecting the assistant plan you already pay for does not charge again', async () => {
  const { choosePlan } = await import('../public/apps/assistant/engine.js');
  const s = fresh();
  choosePlan(s, 'claude_pro');
  const n = s.bank.txns.length, recs = s.recurring.filter((r) => r.active).length;
  choosePlan(s, 'claude_pro');
  assert.equal(s.bank.txns.length, n, 'no second charge');
  assert.equal(s.recurring.filter((r) => r.active).length, recs);
  choosePlan(s, 'claude_max');
  assert.equal(s.bank.txns.length, n + 1, 'a real plan change still bills');
});
