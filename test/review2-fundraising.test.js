// Regression tests for the second fundraising / financing / co-founder bug review (term-sheet redlines and friends).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { post } from '../public/core/bank.js';
import { advance } from '../public/core/clock.js';
import fundApp from '../public/apps/fundraising.js';
import financingApp from '../public/apps/financing.js';
import { ensureFr } from '../public/apps/fundraising/sim.js';
import { draftTermSheet, submitRedline, resolveRedline, requestCounsel, tsOf } from '../public/apps/fundraising/termsheet.js';

function leadWithTermSheet(seed, terms = {}) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'vc', founderName: 'P', seed });
  ensureStripe(s); ensureMarket(s);
  post(s, { amount: 400000, counterparty: 'P', category: 'owner_contribution' });
  const fr = ensureFr(s);
  fr.raise = { id: 'r', stage: 'seed', instrument: 'priced', target: 3e6, status: 'active', startDay: 0, deadlineDay: 180, raised: 0 };
  const inv = { id: `L${seed}`, name: 'Lea', firm: 'Fund', kind: 'seed_fund', leads: true, raiseId: 'r', status: 'term_sheet', termExpiresDay: s.day + 30, log: [],
    terms: { instrument: 'priced', lead: true, amount: 2e6, roundSize: 3e6, preMoney: 15e6, postMoney: 18e6, poolTargetPost: 0.1, liqPref: 1, participating: false, proRata: true, boardSeats: 'founder', vesting: 'keep', protective: 'standard', noShopDays: 45, ...terms } };
  inv.terms.redline = draftTermSheet(s, inv, inv.terms, 'seed', { anchors: false });
  fr.investors.push(inv);
  return { s, fr, inv };
}

test('a partial meet on round size stays inside the lead\'s ±15% band and moves toward the ask', () => {
  let partials = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const ask of [4.5e6, 0.3e6]) {
      const { s, inv } = leadWithTermSheet(seed);
      const [lo, hi] = tsOf(inv).clauses.roundSize.floor;
      assert.ok(submitRedline(s, inv, { marks: { roundSize: { action: 'push', value: ask } } }).ok);
      const round = resolveRedline(s, inv);
      if (inv.status !== 'term_sheet') continue;
      const rs = inv.terms.roundSize;
      if (round.responses.roundSize.out === 'partial') partials++;
      assert.ok(rs >= lo - 1 && rs <= hi + 1, `round size ${rs} outside the band [${lo}, ${hi}] (ask ${ask})`);
      assert.ok((rs - 3e6) * (ask - 3e6) >= 0, 'never moves away from the ask');
      assert.ok(Number.isFinite(inv.terms.amount) && inv.terms.amount > 0 && inv.terms.postMoney === inv.terms.preMoney + rs);
    }
  }
  assert.ok(partials > 0, 'the partial path was exercised');
});

test('a pool already below the lead\'s floor (e.g. after a negotiated call) is never pushed back up by a "partial meet"', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { s, inv } = leadWithTermSheet(seed);
    inv.terms.poolTargetPost = 0.06; // below the hiring-plan floor (8%) the redline draft holds
    assert.ok(submitRedline(s, inv, { marks: { pool: { action: 'push', value: 0.04 } } }).ok);
    resolveRedline(s, inv);
    if (inv.status !== 'term_sheet') continue;
    assert.ok(inv.terms.poolTargetPost <= 0.06 + 1e-9, `pool rose to ${inv.terms.poolTargetPost} after the founder asked for less`);
  }
});

test('counsel asked for on the last day of the offer: the lead holds it open instead of letting it expire', () => {
  const { s, inv } = leadWithTermSheet(3);
  inv.termExpiresDay = s.day; // today is the last day to respond
  assert.ok(requestCounsel(s, inv).ok);
  assert.ok(tsOf(inv).counsel.readyDay > s.day);
  advance(s, 1, [fundApp]);
  assert.equal(inv.status, 'term_sheet', 'still open the morning after');
  assert.ok(inv.termExpiresDay >= tsOf(inv).counsel.readyDay, 'held open until counsel is done');
  assert.equal(tsOf(inv).counsel.extended, tsOf(inv).version);
});

test('financing: a blank founder-loan repayment posts nothing', async () => {
  const s = newState({ companyName: 'X', model: 'smb', path: 'bootstrap', founderName: 'P', seed: 5 });
  ensureStripe(s);
  post(s, { amount: 5000, counterparty: 'P', description: 'Founder loan to company', category: 'loan', method: 'ach' });
  const handlers = [];
  const root = { innerHTML: '', addEventListener: (ev, fn) => handlers.push([ev, fn]), contains: () => true, querySelector: () => null };
  let error = null;
  const ctx = { state: s, params: 'overview', act: (fn) => { try { fn(s); } catch (e) { error = e; } }, render() {} };
  financingApp.render(root, ctx);
  const txns = s.bank.txns.length;
  const target = { id: 'repayForm', elements: [{ name: 'amount', type: 'number', value: '' }] };
  target.closest = (sel) => (sel === '#repayForm' ? target : null);
  for (const [ev, fn] of handlers) if (ev === 'submit') fn({ target, preventDefault() {} });
  assert.match(String(error?.message), /positive amount/);
  assert.equal(s.bank.txns.length, txns, 'no $0 repayment booked');
});

test('clauses left at accept in a submitted markup are agreed: pushing them next round is a re-trade', async () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { s, inv } = leadWithTermSheet(seed);
    // Round 1 pushes only the pool; info rights is left untouched (UI shows it as "accept").
    assert.ok(submitRedline(s, inv, { marks: { pool: { action: 'push', value: 0.08 } } }).ok);
    resolveRedline(s, inv);
    if (inv.status !== 'term_sheet') continue;
    const ts = tsOf(inv);
    assert.equal(ts.clauses.info.agreed, true, 'untouched clause agreed');
    assert.equal(ts.clauses.board.agreed, true);
    inv.terms.info = 'monthly'; // pretend it is now worth reopening
    assert.ok(submitRedline(s, inv, { marks: { info: { action: 'push', value: 'standard' } } }).ok);
    const round = resolveRedline(s, inv);
    assert.ok(ts.retrades >= 1, 'reopening an accepted clause counts as a re-trade');
    assert.ok(round.pWalk >= 0.3);
    return;
  }
  assert.fail('no seed kept the term sheet after round 1');
});

test('legal-DD firmness applies only to findings still open: fixing them in Legal helps', async () => {
  const { openLegalFindings } = await import('../public/apps/fundraising/termsheet.js');
  const { ensureLegal } = await import('../public/apps/legal/sim.js');
  const { s, inv } = leadWithTermSheet(4);
  s.company.incorporated = true;
  const L = ensureLegal(s);
  L.docs.ipAssignment = false;
  inv.legalDd = { day: s.day, found: 1, ids: ['founder_ip'], usd: 3000 };
  assert.equal(openLegalFindings(s, inv), 1);
  L.docs.ipAssignment = true; // fixed in Legal
  assert.equal(openLegalFindings(s, inv), 0);
  assert.ok(submitRedline(s, inv, { marks: { pool: { action: 'push', value: 0.09 } } }).ok);
  if (resolveRedline(s, inv)) assert.equal(tsOf(inv).rounds.at(-1).legalFound, 0);
  // Old saves without ids keep the count found.
  assert.equal(openLegalFindings(s, { legalDd: { found: 2 } }), 2);
});
