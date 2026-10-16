// Regression tests for the fundraising / financing / co-founder bug review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { post } from '../public/core/bank.js';
import { advance } from '../public/core/clock.js';
import { APPS } from '../public/apps/registry.js';
import { ensureFr, acceptTerms, counterTerms, askInsiders, fundraisingDay, endRaise, companyDebt } from '../public/apps/fundraising/sim.js';
import { ensureIr, insiders } from '../public/apps/fundraising/ir.js';
import { ensureDebt } from '../public/core/debt.js';

function vcState(seed = 7) {
  const s = newState({ companyName: 'Test Co', model: 'smb', path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s);
  post(s, { amount: 30000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.entity = 'ccorp'; s.company.incorporated = true;
  return s;
}
const investmentIn = (s) => s.bank.txns.filter((t) => t.category === 'investment').reduce((a, t) => a + t.amount, 0);

test('signing the same SAFE term sheet twice (double click) wires the money once', () => {
  const s = vcState();
  const fr = ensureFr(s);
  fr.raise = { id: 'r1', stage: 'pre-seed', instrument: 'safe', target: 500000, cap: 10e6, status: 'active', startDay: 0, deadlineDay: 120, raised: 0 };
  const inv = { id: 'i1', name: 'Ann', firm: 'Ann (individual)', raiseId: 'r1', status: 'term_sheet', termExpiresDay: 14, terms: { instrument: 'safe', amount: 50000, cap: 10e6, discount: 0, mfn: false, proRata: false } };
  fr.investors.push(inv);
  assert.equal(acceptTerms(s, inv), null);
  assert.match(acceptTerms(s, inv), /no open term sheet/);
  advance(s, 60, APPS);
  assert.equal(investmentIn(s), 50000);
  assert.equal(fr.cap.safes.length, 1);
});

test('an expired / passed term sheet cannot be signed from a stale screen', () => {
  const s = vcState();
  const fr = ensureFr(s);
  fr.raise = { id: 'r1', stage: 'pre-seed', instrument: 'safe', target: 500000, cap: 10e6, status: 'active', startDay: 0, deadlineDay: 120, raised: 0 };
  const inv = { id: 'i1', name: 'Ann', raiseId: 'r1', status: 'passed', terms: { instrument: 'safe', amount: 50000, cap: 10e6 } };
  fr.investors.push(inv);
  assert.match(acceptTerms(s, inv), /no open term sheet/);
  assert.equal(fr.closings.length, 0);
});

test('a blank or lower counter does not zero the pre-money (no Infinity shares at close)', () => {
  const s = vcState();
  const fr = ensureFr(s);
  fr.raise = { id: 'r1', stage: 'seed', instrument: 'priced', target: 3e6, status: 'active', startDay: 0, deadlineDay: 120, raised: 0 };
  const inv = { id: 'L', name: 'Lea', raiseId: 'r1', status: 'term_sheet', terms: { instrument: 'priced', lead: true, amount: 2e6, roundSize: 3e6, preMoney: 15e6, postMoney: 18e6, poolTargetPost: 0.1 } };
  fr.investors.push(inv);
  assert.match(counterTerms(s, inv, 0), /Counter above/);
  assert.match(counterTerms(s, inv, 12e6), /Counter above/);
  assert.equal(inv.terms.preMoney, 15e6);
  assert.equal(inv.terms.countered, undefined); // the one counter is not used up by a typo
});

test('accelerator insiders that agree to follow on in a priced round actually wire their money at the close', () => {
  const s = vcState(11);
  const fr = ensureFr(s);
  fr.accel.yc = { status: 'done' };
  ensureIr(s).warmth = 1;
  fr.raise = { id: 'r1', stage: 'seed', instrument: 'priced', target: 3e6, status: 'active', startDay: 0, deadlineDay: 120, raised: 0 };
  let committed = 0;
  for (let k = 0; k < 40 && !committed; k++) {
    ensureIr(s).insiderAsked = {};
    fr.raise.insiderCommits = [];
    askInsiders(s);
    committed = fr.raise.insiderCommits.reduce((a, x) => a + x.amount, 0);
  }
  assert.ok(committed > 0, 'the insider said yes at least once in 40 tries');
  fr.closings.push({ id: 'cl', kind: 'priced', invId: null, raiseId: 'r1', day: s.day, amount: 2.9e6, terms: { roundSize: 3e6, preMoney: 12e6, poolTargetPost: 0.1 } });
  fundraisingDay(s);
  assert.equal(investmentIn(s), 2.9e6 + committed);
  assert.ok(fr.cap.preferred.some((p) => p.holder === 'Y Combinator' && p.invested === committed));
});

test('a CRM insider asked to follow on in a priced round stays an insider even if the round never closes', () => {
  const s = vcState(5);
  const fr = ensureFr(s);
  fr.investors.push({ id: 'ins', name: 'Old Angel', status: 'committed', closedDay: 0, terms: { amount: 100000 }, log: [] });
  ensureIr(s).warmth = 1;
  fr.raise = { id: 'r1', stage: 'seed', instrument: 'priced', target: 3e6, status: 'active', startDay: 0, deadlineDay: 120, raised: 0 };
  for (let k = 0; k < 40 && fr.investors[0].terms.followOn !== true; k++) { ensureIr(s).insiderAsked = {}; askInsiders(s); }
  assert.equal(fr.investors[0].terms.followOn, true);
  endRaise(s, 'abandoned');
  assert.equal(insiders(s).length, 1);
});

test('a Series A lead that closes after the founder stopped the raise keeps its stage and does not end a newer raise', () => {
  const s = vcState();
  const fr = ensureFr(s);
  fr.raise = { id: 'rA', stage: 'series-a', instrument: 'priced', target: 10e6, status: 'active', startDay: 0, deadlineDay: 120, raised: 0 };
  fr.closings.push({ id: 'cl', kind: 'priced', invId: null, raiseId: 'rA', day: s.day, amount: 10e6, terms: { roundSize: 10e6, preMoney: 50e6, poolTargetPost: 0.1 } });
  endRaise(s, 'abandoned');
  fr.raise = { id: 'rB', stage: 'seed', instrument: 'safe', target: 500000, cap: 10e6, status: 'active', startDay: 0, deadlineDay: 120, raised: 0 };
  fundraisingDay(s);
  assert.equal(fr.rounds.at(-1).label.startsWith('Series A'), true, fr.rounds.at(-1).label);
  assert.equal(fr.raise?.id, 'rB'); // the new raise is still open
  assert.equal(fr.raises.find((r) => r.id === 'rA').raised, 10e6);
});

test('company loans (SBA, lines, business cards) come off the top at an exit, not just RBF', () => {
  const s = vcState();
  const fr = ensureFr(s);
  fr.loans.push({ id: 'l1', remaining: 20000 });
  ensureDebt(s).loans.push({ id: 'd1', status: 'active', schedule: 'amortized', balance: 50000, apr: 10, payment: 1000, paid: 0 });
  assert.equal(companyDebt(s), 70000);
});

import { ensureCf, makeOffer as cfOffer, sign as cfSign } from '../public/apps/cofounder/sim.js';
test('a co-founder offer submitted twice after a yes does not sign them twice', () => {
  const s = vcState();
  ensureFr(s);
  const cf = ensureCf(s);
  const c = { id: 'cfc1', name: 'Alex Reyes', status: 'negotiating', interest: 1, quality: 0.6, salaryNeed: 0, flag: null, commitment: 'full-time now', memberRole: 'engineer', offers: [], log: [], chat: [] };
  cf.candidates.push(c);
  const offer = { pct: 0.5, vesting: 'standard', title: 'CTO', salary: 0 };
  for (let k = 0; k < 30 && c.status === 'negotiating'; k++) { c.offers = []; c.interest = 1; if (cfOffer(s, c, offer).accepted) cfSign(s, c, offer); }
  assert.equal(c.status, 'signed');
  assert.throws(() => cfOffer(s, c, offer), /no open equity negotiation/);
  assert.equal(ensureFr(s).cap.founders.filter((f) => f.cofounderId === 'cfc1').length, 1);
});
