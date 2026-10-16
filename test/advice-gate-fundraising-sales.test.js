// Sweep: automatic coaching and hidden-truth reveals in Fundraising, Negotiation, RFP and Sales sit behind the advice gate
// (docs/design/advice-sources.md). With no recruited source the screens show facts only; learning mode returns the true lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack } from '../public/core/bank.js';
import { setLearningMode } from '../public/core/advice.js';
import { ensureFr } from '../public/apps/fundraising/sim.js';
import { renderCrm } from '../public/apps/fundraising/view-crm.js';
import { renderRoom } from '../public/apps/fundraising/view-room.js';
import { renderReview } from '../public/apps/fundraising/view-termsheet.js';
import { ensureCrm } from '../public/apps/sales/model.js';
import { bidsView } from '../public/apps/sales/rfp-view.js';

const LEAKS = /Likely pass reason|Stellar founder here|Why this odds|VC read|What a stellar|stellar operator|stellar founder/i;

function world(seed = 8) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  s.company.entity = 'ccorp'; s.company.incorporated = true;
  const fr = ensureFr(s);
  fr.raise = { id: 'r1', stage: 'seed', instrument: 'priced', target: 3e6, status: 'active', startDay: 0, deadlineDay: 120, raised: 0 };
  const inv = { id: 'invA', name: 'Alder Partners', firm: 'Alder Capital', kind: 'seed_fund', leads: true, raiseId: 'r1', status: 'researching', log: [], source: 'generated', thesis: 'Healthcare infrastructure only', fund: { tier: 'established', size: 20e6, number: 2 } };
  fr.investors.push(inv);
  return { s, fr, inv };
}

test('investor CRM: fit verdict, pass reason and odds multipliers are hidden truth, shown only via a source or learning mode', () => {
  const { s, inv } = world();
  const bare = String(renderCrm({ state: s }, inv.id));
  assert.ok(!LEAKS.test(bare), 'no coaching or hidden truth without a source');
  assert.ok(!/×0\.|×1\./.test(bare.split('Fund:')[1] ?? ''), 'no odds multipliers');
  setLearningMode(s, true); // document: learning mode returns every true line, tagged Coach (learning mode)
  const coached = String(renderCrm({ state: s }, inv.id));
  assert.match(coached, /Coach \(learning mode\)/);
});

test('raise review, term-sheet review and RFP bid discipline give facts without a source', () => {
  const { s } = world(9);
  assert.ok(!LEAKS.test(String(renderRoom({ state: s }))), 'data room raise review');
  const rv = { tier: 'average', rounds: 2, asks: 3, fixed: 1, offMarketAtOpen: 2, counsel: false, coaching: ['Have startup counsel mark up the first draft.'] };
  const bare = String(renderReview(rv, 'Negotiation so far', s));
  assert.match(bare, /2 round\(s\), 3 ask\(s\)/); assert.ok(!/counsel mark up|average/.test(bare));
  setLearningMode(s, true);
  assert.match(String(renderReview(rv, 'Negotiation so far', s)), /counsel mark up/);
  setLearningMode(s, false);
  ensureCrm(s);
  assert.ok(!LEAKS.test(String(bidsView(s))), 'bids page');
});
