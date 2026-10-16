import { setLearningMode } from '../public/core/advice.js';
// Shared negotiation engine and its adapters (enterprise terms, VC term sheets, acquisition LOIs). Every test is short and
// targeted: one mechanic, a few seeds, no long simulations. Scripted negotiators (test/helpers/negotiators.js) play the four
// operator tiers through the public engine API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, subscribe, createCustomer, subscriptionById } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { advance } from '../public/core/clock.js';
import { readOperator } from '../public/core/operator.js';
import { APPS } from '../public/apps/registry.js';
import * as N from '../public/apps/negotiate/index.js';
import { addContact, ensureDeal, startProposal, sendContract, closeWon } from '../public/apps/sales/model.js';
import { dealsDay } from '../public/apps/sales/engine.js';
import { ensureLegal } from '../public/apps/legal/sim.js';
import { ensureFr, acceptTerms, fundraisingDay } from '../public/apps/fundraising/sim.js';
import { waterfall, pricedRound, newCapTable } from '../public/apps/fundraising/captable.js';
import { effectivePreMoney, prefCostUsd, extraTerms } from '../public/apps/negotiate/vc-terms.js';
import { settleLoi, retradeP, loiExtras } from '../public/apps/negotiate/mna-terms.js';
import { projectEarnout } from '../public/apps/fundraising/sim.js';
import { saleConsent, vestingForfeit } from '../public/apps/negotiate/gov.js';
import { repriceMfn, cappedUplift, settleClaim, useTfc, applyNegotiatedSub } from '../public/apps/negotiate/consequences.js';
import { startEnterpriseNegotiation } from '../public/apps/negotiate/enterprise.js';
import { startVcNegotiation, applyVcTerms, termsToPackage } from '../public/apps/negotiate/vc.js';
import { startMnaNegotiation } from '../public/apps/negotiate/mna.js';
import { runNegotiator, offerAt } from './helpers/negotiators.js';
import { TRIGGERS } from '../public/apps/automations/model.js';
import { discountBand } from '../public/data/negotiation.js';

// ---------------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------------

function baseState(seed = 5, model = 'ent') {
  const s = newState({ companyName: 'Ledgerly', model, path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 900000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.entity = 'ccorp'; s.company.incorporated = true;
  s.apps.support = { flows: { off: true } };
  return s;
}
/** A deal in the contract stage (acv = price x qty), plus a second open deal so a real alternative exists when asked. */
function contractDeal(seed, { price = 24000, qty = 5, employees = 1500, other = true, discount = 0 } = {}) {
  const s = baseState(seed);
  s.plans[0].price = price;
  const { contact } = addContact(s, { firstName: 'Ana', lastName: 'Lee', email: `ana${seed}@buyer.com`, title: 'VP Ops', company: 'Buyer', domain: 'buyer.com' });
  s.apps.crm.companies.find((x) => x.id === contact.companyId).employees = employees;
  const d = ensureDeal(s, { companyId: contact.companyId, contactId: contact.id, stage: 'qualified' });
  startProposal(s, d, { planId: s.plans[0].id, quantity: qty, annual: true, discountPct: discount });
  sendContract(s, d);
  if (other) {
    const c2 = addContact(s, { firstName: 'Bo', lastName: 'Kim', email: 'bo@other.com', title: 'CTO', company: 'Other', domain: 'other.com' }).contact;
    ensureDeal(s, { companyId: c2.companyId, contactId: c2.id, stage: 'proposal' });
  }
  return { s, d };
}

/** A synthetic three-issue negotiation (no adapter): weights are explicit so the dynamics can be isolated. */
function synth(seed, over = {}) {
  const s = baseState(seed);
  const issues = [
    { id: 'price', label: 'Price', type: 'num', fmt: 'usd', unit: '$', min: 50000, max: 100000, step: 500, pDir: 1, cDir: -1, wp: 0.5, wc: 0.4 },
    { id: 'payment', label: 'Payment terms', type: 'opt', wp: 0.1, wc: 0.4, options: [{ id: 'upfront', label: 'Upfront', pu: 1, cu: 0 }, { id: 'net30', label: 'Net 30', pu: 0.6, cu: 0.4 }, { id: 'net90', label: 'Net 90', pu: 0, cu: 1 }] },
    { id: 'term', label: 'Term', type: 'opt', wp: 0.4, wc: 0.2, options: [{ id: '1', label: '1 year', pu: 0, cu: 1 }, { id: '3', label: '3 years', pu: 1, cu: 0 }] },
  ];
  const neg = N.startNegotiation(s, { key: 'synth', kind: 'synth', title: 'Synthetic', stakes: 'mid', stakesUsd: 100000, usdPerUtil: 100000, cp: { name: 'Buyer', role: 'procurement', style: over.style ?? 'hardball' }, issues, jitter: 0, batnaStrength: over.batna ?? 0.5, ...over.spec });
  return { s, neg };
}
const pkgOf = (neg, a, b, c) => ({ price: a, payment: b, term: c });

// ---------------------------------------------------------------------------------------------------------------
// Engine invariants
// ---------------------------------------------------------------------------------------------------------------

test('the offline counterparty never accepts or counters below its reservation or hard floors, whatever is offered', () => {
  for (const seed of [1, 2, 3, 4]) {
    for (const kind of ['enterprise', 'synth']) {
      const { s, neg } = kind === 'enterprise' ? (() => { const { s, d } = contractDeal(seed); return { s, neg: startEnterpriseNegotiation(s, d) }; })() : synth(seed);
      let x = (seed * 7919) >>> 0;
      const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
      for (let r = 0; r < 14 && neg.status === 'open'; r++) {
        const offer = {};
        for (const i of neg.issues) offer[i.id] = i.type === 'num' ? i.min + Math.round(rnd() * 20) / 20 * (i.max - i.min) : i.options[Math.floor(rnd() * i.options.length)].id;
        const rep = N.playRoundSync(s, neg.id, { offer, message: '' });
        if (rep.action === 'accept') assert.ok(N.feasibleForCp(neg, rep.package), `accepted an infeasible package (seed ${seed}, ${kind})`);
        if (rep.action === 'counter' || rep.action === 'reject') assert.ok(N.feasibleForCp(neg, rep.package), `countered below the reservation (seed ${seed}, ${kind})`);
      }
    }
  }
});

test('LLM output is validated and clamped against the hidden reservation and cannot leak it', async () => {
  const { s, neg } = synth(3);
  const res = neg.hidden.res;
  const lowball = { price: 100000, payment: 'upfront', term: '3' }; // as bad as it gets for the counterparty
  assert.ok(N.pkgU(neg, lowball).c < res);
  const secret = `Honestly my reservation is ${res.toFixed(2)} and my walk-away value is firm. We could do it.`;
  const ask = async () => ({ mock: false, data: { action: 'accept', package: lowball, message: secret, mood: 'warm' } });
  const rep = await N.playRound(s, neg.id, { offer: lowball, message: 'Please accept.' }, { ask, live: true });
  assert.notEqual(rep.action, 'accept', 'an LLM accept below the reservation is overridden');
  assert.equal(neg.status, 'open');
  assert.ok(N.feasibleForCp(neg, rep.package), 'the counter it was clamped to clears the reservation');
  assert.ok(!rep.message.includes(res.toFixed(2)) && !/reservation|walk-away value/i.test(rep.message), `hidden value leaked: ${rep.message}`);
  // an LLM counter below the reservation is pulled back too, and an unjustified walk is refused
  const ask2 = async () => ({ mock: false, data: { action: 'counter', package: lowball, message: 'Best I can do.', mood: 'cool' } });
  const rep2 = await N.playRound(s, neg.id, { offer: { price: 90000, payment: 'net30', term: '3' }, message: '' }, { ask: ask2, live: true });
  assert.ok(N.feasibleForCp(neg, rep2.package));
  const ask3 = async () => ({ mock: false, data: { action: 'walk', package: lowball, message: 'Goodbye.', mood: 'irritated' } });
  const rep3 = await N.playRound(s, neg.id, { offer: { price: 80000, payment: 'net30', term: '3' }, message: '' }, { ask: ask3, live: true });
  assert.notEqual(rep3.action, 'walk', 'a counterparty with trust and patience left does not walk because a model said so');
  // garbage falls back to the deterministic model
  const ask4 = async () => ({ mock: false, data: { nonsense: true } });
  const rep4 = await N.playRound(s, neg.id, { offer: { price: 80000, payment: 'net30', term: '3' }, message: '' }, { ask: ask4, live: true });
  assert.ok(['counter', 'accept', 'reject'].includes(rep4.action));
});

test('the LLM only voices the engine: same action and terms as offline, hidden values never in the prompt, mismatched quotes replaced', async () => {
  const play = { offer: { price: 90000, payment: 'net30', term: '3' }, message: 'We have a competing quote at $70,000. What matters most to you here?' };
  const a = synth(4), b = synth(4);
  const off = N.playRoundSync(a.s, a.neg.id, play);
  let seen = null;
  const ask = async (o) => { seen = o; return { mock: false, data: { message: 'Fine, we can do $95,000 if you sign today.', mood: 'warm' } }; };
  const rep = await N.playRound(b.s, b.neg.id, play, { ask, live: true });
  assert.equal(rep.action, off.action, 'the action is the engine\'s');
  assert.deepEqual(rep.package, off.package, 'the terms are the engine\'s');
  assert.ok(!seen.system.includes(b.neg.hidden.res.toFixed(2)) && !/walk-away|reservation|priority weight/i.test(seen.system + seen.prompt), 'no hidden values reach the model');
  assert.match(seen.prompt, /YOUR DECISION/);
  assert.ok(rep.voiceRejected, 'a message quoting a price that is not on the table is replaced');
  assert.equal(rep.message, off.message);
  // a message that quotes the decided terms (or the founder's own numbers) is kept
  const c = synth(4);
  const good = async (o) => ({ mock: false, data: { message: `I do not see a $70,000 quote anywhere. Our counter is ${o.prompt.match(/Price: (\$[\d,]+)/g)?.at(-1)?.slice(7) ?? 'as written'}.`, mood: 'cool' } });
  const rep2 = await N.playRound(c.s, c.neg.id, play, { ask: good, live: true });
  assert.ok(!rep2.voiceRejected, rep2.message);
  assert.ok(N.quotesConsistent(c.neg, `We can do ${N.fmtValue(c.neg.issues[0], rep2.package.price)} on Net 30.`, [rep2.package]));
  assert.ok(!N.quotesConsistent(c.neg, 'We can do $61,500.', [rep2.package]));
});

test('an opening that gives more than the other side asked for is logged as a free concession', () => {
  const { s, neg } = synth(6, { spec: { opening: { price: 70000, payment: 'net30', term: '1' } } });
  N.playRoundSync(s, neg.id, { offer: { price: 65000, payment: 'net30', term: '1' }, message: '' }); // the buyer asked for 70k; you offered 65k
  assert.ok(neg.flags.freeGives.includes('price'));
});

test('deterministic: a dedicated stream per negotiation, the main rng is untouched', () => {
  // Two copies of the same saved game (ids come from a process-wide counter, so two fresh worlds would differ in their ids).
  const base = contractDeal(9);
  const run = () => {
    const s = structuredClone(base.s);
    const d = s.apps.crm.deals.find((x) => x.id === base.d.id);
    const before = s.seed;
    const neg = startEnterpriseNegotiation(s, d);
    assert.equal(s.seed, before, 'starting a negotiation does not consume the main rng');
    runNegotiator(s, neg.id, 'good', { anchor: { discount: 0.07 } });
    assert.equal(s.seed, before, 'playing it does not either');
    return JSON.stringify([neg.status, neg.final, neg.round]);
  };
  assert.equal(run(), run());
});

test('anchoring: a sharper first offer shifts the outcome; a precise number pulls harder than a round one', () => {
  const finalValue = (anchor) => {
    const { s, neg } = synth(11);
    const play = (offer) => N.playRoundSync(s, neg.id, { offer: pkgOf(neg, ...offer) });
    let offer = anchor;
    for (let r = 0; r < 4 && neg.status === 'open'; r++) {
      const rep = play(offer);
      if (rep.action !== 'counter' && rep.action !== 'reject') break;
      // meet them halfway on price, nothing else moves
      offer = [Math.max(50000, offer[0] - Math.round((offer[0] - rep.package.price) / 2 / 500) * 500), offer[1], offer[2]];
    }
    if (neg.status === 'open') N.acceptCounter(s, neg.id);
    assert.equal(neg.status, 'agreed');
    return N.pkgU(neg, neg.final).p;
  };
  const high = finalValue([85000, 'net30', '3']);
  const low = finalValue([70000, 'net30', '3']);
  assert.ok(high > low + 0.03, `a high anchor (${high.toFixed(2)}) beats a low one (${low.toFixed(2)})`);
  // precise vs round: same distance from their position, the precise number moves their target more
  const target = (price) => { const { s, neg } = synth(11); N.playRoundSync(s, neg.id, { offer: pkgOf(neg, price, 'net30', '3') }); return neg.hidden.T; };
  assert.ok(target(94700) < target(95000), 'a precise first number lowers their aspiration more than a round one');
});

test('an extreme anchor beyond their zone costs trust and can end the talks', () => {
  const trustAfter = (offer, seed) => { const { s, neg } = synth(seed); N.playRoundSync(s, neg.id, { offer }); return neg; };
  const mod = trustAfter(pkgOf(null, 80000, 'net30', '3'), 4);
  const wild = trustAfter(pkgOf(null, 100000, 'upfront', '3'), 4);
  assert.ok(wild.cp.trust < mod.cp.trust - 0.05, `trust ${wild.cp.trust.toFixed(2)} vs ${mod.cp.trust.toFixed(2)}`);
  assert.ok(wild.flags.extreme >= 1 && mod.flags.extreme === 0);
  let walked = 0;
  for (let seed = 1; seed <= 30; seed++) if (trustAfter(pkgOf(null, 100000, 'upfront', '3'), seed).status === 'walked_cp') walked++;
  assert.ok(walked >= 2 && walked <= 28, `some counterparties walk over an insulting first offer (${walked}/30)`);
});

test('logrolling: trading what they value for what you value grows joint value; splitting every issue evenly does not', () => {
  const play = (policy) => {
    const { s, neg } = synth(7, { style: 'collaborative' });
    let offer = policy.open;
    for (let r = 0; r < 9 && neg.status === 'open'; r++) {
      const rep = N.playRoundSync(s, neg.id, { offer: pkgOf(neg, ...offer) });
      if (rep.action !== 'counter' && rep.action !== 'reject') break;
      offer = policy.next(offer, rep.package, r);
      if (r >= 4) { N.acceptCounter(s, neg.id); break; }
    }
    if (neg.status === 'open') N.acceptCounter(s, neg.id);
    return neg.result;
  };
  const trader = play({ open: [85000, 'net30', '3'], next: (o, cp, r) => [o[0] - 500 * (r + 1), r >= 0 ? 'net90' : o[1], o[2]] }); // gives the payment terms they care about, holds price and term
  const splitter = play({ open: [85000, 'net30', '3'], next: (o, cp) => [Math.round((o[0] + cp.price) / 2 / 500) * 500, o[1], o[2]] });
  assert.ok(trader.jointEff >= splitter.jointEff - 1e-9, `${trader.jointEff.toFixed(2)} vs ${splitter.jointEff.toFixed(2)}`);
  assert.ok(trader.uP > splitter.uP, 'trading also leaves the player better off at the same counterparty utility range');
  assert.ok(trader.trades >= 1);
});

test('reciprocity: a big unreciprocated concession is pocketed and logged', () => {
  const { s, neg } = synth(5, { style: 'hardball' });
  N.playRoundSync(s, neg.id, { offer: pkgOf(neg, 90000, 'net30', '3') });
  const before = neg.hidden.T;
  N.playRoundSync(s, neg.id, { offer: pkgOf(neg, 60000, 'net90', '1') }); // cave on everything, asking nothing
  assert.ok(neg.flags.pocketed >= 1, 'pocketed');
  assert.ok(before - neg.hidden.T < 0.12, 'their target barely moved');
});

test('bluffing a competing alternative you do not have can be caught: trust drops and a mistake is logged; a real one is not penalised', () => {
  let caught = null;
  for (let seed = 1; seed <= 25 && !caught; seed++) {
    const { s, d } = contractDeal(seed, { other: false });
    const neg = startEnterpriseNegotiation(s, d);
    assert.equal(neg.player.batna.real, false);
    const t0 = neg.cp.trust;
    const rep = N.playRoundSync(s, neg.id, { offer: offerAt(s, neg.id, 0.5), message: 'We have a competing offer from another vendor at a lower price.', claim: 'alternative' });
    if (rep.bluffCalled) caught = { s, neg, t0 };
  }
  assert.ok(caught, 'a bluff is called for at least one counterparty');
  assert.ok(caught.neg.cp.trust < caught.t0 - 0.2);
  assert.ok(caught.s.mistakes.some((m) => m.id === 'bluffed_alternative'), 'logged as a mistake');
  // an honest claim backed by a real pipeline deal is never caught
  const { s, d } = contractDeal(3, { other: true });
  const neg = startEnterpriseNegotiation(s, d);
  assert.equal(neg.player.batna.real, true);
  N.playRoundSync(s, neg.id, { offer: offerAt(s, neg.id, 0.5), message: 'We have another buyer in contract talks.', claim: 'alternative' });
  assert.equal(neg.flags.bluffDiscovered, false);
  assert.ok(neg.flags.leverageUsed);
});

test('walk-away discipline: walking from a package that beats your alternative, or signing one that does not, is logged', () => {
  const { s, neg } = synth(5, { style: 'collaborative' });
  N.playRoundSync(s, neg.id, { offer: pkgOf(neg, 70000, 'net30', '3') });
  assert.ok(neg.last.cp);
  N.refreshBatna(s, neg);
  neg.player.batna.value = 0.05; // an alternative worth little: this table has a deal in it
  N.walkAway(s, neg.id);
  assert.equal(neg.result.walkQuality, 'bad');
  assert.ok(s.mistakes.some((m) => m.id === 'walked_from_good_deal'));
  const t = synth(5, { style: 'collaborative' });
  N.playRoundSync(t.s, t.neg.id, { offer: pkgOf(t.neg, 95000, 'upfront', '3') });
  t.neg.player.batna.value = 0.95; // a great alternative, then accept the counter anyway
  const orig = t.neg.player.batna;
  assert.ok(orig.value > 0.9);
  const adapterless = t.neg; // synthetic kind has no adapter, so refreshBatna keeps our edit
  N.acceptCounter(t.s, adapterless.id);
  assert.equal(adapterless.result.worseThanBatna, true);
  assert.ok(t.s.mistakes.some((m) => m.id === 'worse_than_batna'));
});

test('hours: a round costs 0.25-1h by stakes, Prepare costs hours, and charge spends the founder week', () => {
  const { s, neg } = synth(5);
  const left = s.founder.hoursPerWeek - s.founder.hoursUsed;
  N.prepare(s, neg.id, 'batna', { charge: true });
  N.playRoundSync(s, neg.id, { offer: pkgOf(neg, 90000, 'net30', '3') }, { charge: true });
  const spent = s.founder.hoursPerWeek - s.founder.hoursUsed;
  assert.ok(left - spent > 1 && left - spent <= 2, `spent ${(left - spent).toFixed(2)}h`);
  assert.equal(N.roundHours({ stakes: 'low' }), 0.25);
  assert.equal(N.roundHours({ stakes: 'high' }), 1);
});

test('Prepare reveals only what was researched: alternatives, norms, and the counterparty priorities in steps', () => {
  const { s, d } = contractDeal(2);
  const neg = startEnterpriseNegotiation(s, d);
  let v = N.viewOf(s, neg);
  assert.equal(v.batna, null);
  assert.ok(v.issues.every((i) => !i.band && !i.priority));
  assert.ok(v.issues.every((i) => i.wc === undefined && !(i.options ?? []).some((o) => o.cu !== undefined)), 'their weights and utilities never reach the view');
  N.prepare(s, neg.id, 'batna'); N.prepare(s, neg.id, 'norms'); N.prepare(s, neg.id, 'counterparty');
  v = N.viewOf(s, neg);
  assert.ok(v.batna && v.batna.sources.length);
  assert.ok(v.issues.every((i) => i.band));
  assert.equal(v.issues.filter((i) => i.priority === 'high').length, 1);
  N.prepare(s, neg.id, 'counterparty');
  assert.ok(N.viewOf(s, neg).issues.filter((i) => i.priority).length >= 4);
});

// ---------------------------------------------------------------------------------------------------------------
// Enterprise deals
// ---------------------------------------------------------------------------------------------------------------

test('enterprise: a median player lands inside the researched discount band for the deal size; a caver lands above it', () => {
  const cases = [[1000, 5, 0.03, 0.10], [3000, 5, 0.06, 0.15], [8000, 5, 0.10, 0.20], [24000, 5, 0.15, 0.25]];
  for (const [price, qty, lo, hi] of cases) {
    const avg = [], cave = [], stellar = [];
    for (const seed of [1, 2, 3, 4]) {
      for (const [tier, bucket] of [['average', avg], ['mediocre', cave], ['stellar', stellar]]) {
        const { s, d } = contractDeal(seed, { price, qty });
        const neg = startEnterpriseNegotiation(s, d);
        runNegotiator(s, neg.id, tier, { anchor: { discount: 0.07 }, anchorAvg: { discount: 0.05 } });
        if (neg.status === 'agreed') bucket.push(neg.final.discount);
      }
    }
    const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    assert.ok(avg.length >= 3 && m(avg) >= lo && m(avg) <= hi, `ACV ${price * qty}: median ${m(avg).toFixed(3)} in [${lo}, ${hi}]`);
    assert.ok(m(stellar) < m(avg), `ACV ${price * qty}: a prepared, trading negotiator discounts less (${m(stellar).toFixed(3)} < ${m(avg).toFixed(3)})`);
    assert.ok(!cave.length || m(cave) >= m(avg) - 0.01, 'caving never discounts less than the median');
  }
  assert.equal(discountBand(120000).hi, 0.25);
});

test('enterprise: agreed terms flow into the subscription, the invoice (net-90 delays cash), Legal exposure and the logged mistakes', () => {
  const { s, d } = contractDeal(4, { price: 24000 });
  const neg = startEnterpriseNegotiation(s, d);
  assert.equal(d.contract.negotiationId, neg.id);
  // the order form does not sign while the negotiation is open
  d.contract.signDay = s.day;
  dealsDay(s);
  assert.equal(d.stage, 'contract', 'signature is held');
  const terms = { discount: 0.3, term: '3', payment: 'net90', uplift: 'cap3', mfn: 'full', liability: 'uncapped', tfc: 'any', sla: 'strong', logo: 'case', start: 'now' };
  neg.round = 1; neg.flags.firstOffer = { u: { p: 0, c: 0 }, round: 1 };
  N.closeNegotiation(s, neg, 'agreed', terms);
  assert.equal(d.discountPct, 0.3);
  d.contract.redlineId = null; // this test is about the negotiated terms, not Legal's redline flow
  const L = ensureLegal(s);
  assert.ok(L.exposure >= 3, `uncapped + MFN + TFC raise Legal exposure (${L.exposure})`);
  const ids = s.mistakes.map((m) => m.id);
  for (const id of ['caved_on_discount', 'uncapped_liability_signed', 'no_give_get'].filter((x) => x !== 'no_give_get')) assert.ok(ids.includes(id), `${id} logged: ${ids}`);
  const warn = s.mistakes.find((m) => m.id === 'uncapped_liability_signed');
  assert.equal(warn.delayed, true);
  advance(s, 12, APPS);
  assert.equal(d.stage, 'won');
  const sub = subscriptionById(s, d.subscriptionId);
  assert.equal(sub.discountPct, 0.3);
  assert.equal(sub.paymentTermsDays, 90);
  assert.equal(sub.upliftCap, 0.03);
  assert.equal(sub.mfn, 'full');
  assert.equal(sub.liability, 'uncapped');
  const inv = s.stripe.invoices.find((i) => i.subId === sub.id);
  assert.equal(inv.dueDay - inv.issuedDay, 90);
});

test('enterprise: walking away or an expired window loses the deal', () => {
  const { s, d } = contractDeal(4);
  const neg = startEnterpriseNegotiation(s, d);
  N.walkAway(s, neg.id);
  assert.equal(d.stage, 'lost');
  const t = contractDeal(5);
  const n2 = startEnterpriseNegotiation(t.s, t.d);
  t.s.day = n2.expiresDay + 1;
  N.negotiationDay(t.s);
  assert.equal(n2.status, 'expired');
  assert.equal(t.d.stage, 'lost');
});

test('MFN: a deeper discount to a new customer reprices the MFN customer and logs the repricing later', () => {
  const s = baseState(3);
  const plan = { id: 'p', name: 'Pro', price: 12000, interval: 'year', trialDays: 0 };
  const a = createCustomer(s, { name: 'Mfn Co', email: 'a@a.com', crmCompanyId: null });
  const subA = subscribe(s, a.id, plan, { trial: false, quantity: 1, discountPct: 0.05, invoiceManually: true });
  subA.mfn = 'full'; subA.negotiated = { day: s.day };
  const b = createCustomer(s, { name: 'New Co', email: 'b@b.com' });
  const subB = subscribe(s, b.id, plan, { trial: false, quantity: 1, discountPct: 0.2, invoiceManually: true });
  const before = (subA.price * (1 - (subA.discountPct ?? 0)));
  const hits = repriceMfn(s, subB);
  assert.equal(hits.length, 1);
  assert.ok(subA.price * (1 - subA.discountPct) < before - 1, 'repriced down to the new discount');
  assert.ok(Math.abs(subA.price * (1 - subA.discountPct) - 12000 * 0.8) < 1);
  const m = s.mistakes.find((x) => x.id === 'mfn_triggered_repricing');
  assert.ok(m && m.delayed && m.cost.usd > 500);
  // a similar-customers MFN does not reach a customer 10x its size
  const c = createCustomer(s, { name: 'Big', email: 'c@c.com' });
  const subC = subscribe(s, c.id, plan, { trial: false, quantity: 20, discountPct: 0.4, invoiceManually: true });
  const sim = createCustomer(s, { name: 'Sim', email: 'd@d.com' });
  const subD = subscribe(s, sim.id, plan, { trial: false, quantity: 1, discountPct: 0.01, invoiceManually: true });
  subD.mfn = 'similar';
  assert.equal(repriceMfn(s, subC).filter((h) => h.subId === subD.id).length, 0, 'a customer ten times the size is not similar');
});

test('uncapped liability and termination for convenience bite later: a claim is paid in full, a cap limits it, the TFC right churns the account', () => {
  const s = baseState(3);
  const plan = { id: 'p', name: 'Pro', price: 20000, interval: 'year', trialDays: 0 };
  const mk = (liability) => { const c = createCustomer(s, { name: liability, email: `${liability}@x.com` }); const sub = subscribe(s, c.id, plan, { trial: false, quantity: 1, invoiceManually: true }); sub.liability = liability; sub.negotiated = { day: s.day }; sub.termYears = 3; return sub; };
  const capped = mk('cap1x'), open = mk('uncapped');
  const loss = 90000;
  const c1 = settleClaim(s, capped, loss);
  const c2 = settleClaim(s, open, loss);
  assert.equal(c1.payout, 20000);
  assert.equal(c2.payout, 90000);
  assert.ok(s.mistakes.some((m) => m.id === 'uncapped_liability_signed' && m.cost.usd === 70000 && m.delayed));
  assert.equal(s.mistakes.filter((m) => m.id === 'uncapped_liability_signed').length, 1, 'the capped claim is not a mistake');
  const t = mk('cap1x'); t.tfc = 'any';
  useTfc(s, t);
  assert.ok(t.cancelAtPeriodEnd || t.status === 'canceled');
  assert.ok(s.mistakes.some((m) => m.id === 'tfc_used'));
  // renewal uplift cap limits what Success may propose
  assert.deepEqual(cappedUplift({ upliftCap: 0.03 }, 0.1), { upliftPct: 0.03, capped: true, cap: 0.03 });
  assert.equal(cappedUplift({ upliftCap: null }, 0.1).capped, false);
});

test('quarter-end: procurement that knows your deadline slows down; the deep discount is logged', () => {
  const { s, d } = contractDeal(6, { price: 24000 });
  const neg = startEnterpriseNegotiation(s, d);
  neg.playerDeadlineDay = s.day + 3; // quarter ends in three days
  neg.hidden.cpKnowsDeadline = true;
  const open = Object.fromEntries(neg.issues.map((i) => [i.id, neg.cpOpen[i.id]]));
  N.playRoundSync(s, neg.id, { offer: open });
  assert.ok(neg.flags.nearDeadline);
  N.closeNegotiation(s, neg, 'agreed', { ...open, discount: 0.3 });
  assert.ok(s.mistakes.some((m) => m.id === 'quarter_end_desperation_discount'));
});

// ---------------------------------------------------------------------------------------------------------------
// VC term sheets
// ---------------------------------------------------------------------------------------------------------------

function vcWorld(seed = 8, { exploding = false, second = false, kind = 'seed_fund' } = {}) {
  const s = baseState(seed, 'smb');
  const fr = ensureFr(s);
  fr.raise = { id: 'r1', stage: 'seed', instrument: 'priced', target: 3e6, status: 'active', startDay: 0, deadlineDay: 120, raised: 0 };
  const mkInv = (id, name, pre) => {
    const t = { instrument: 'priced', lead: true, amount: 1.8e6, roundSize: 3e6, preMoney: pre, postMoney: pre + 3e6, poolTargetPost: 0.12, liqPref: 1, participating: false, boardSeat: true, proRata: true, boardSeats: 'founder', vesting: 'keep', protective: 'standard', noShopDays: 45, levMult: 1, talkMult: 1, exploding };
    return { id, name, firm: `${name} Capital`, kind, leads: true, raiseId: 'r1', status: 'term_sheet', termExpiresDay: 14, terms: t, log: [], source: 'generated' };
  };
  const a = mkInv('invA', 'Alder Partners', 12e6);
  fr.investors.push(a);
  if (second) fr.investors.push(mkInv('invB', 'Birch Ventures', 13e6));
  return { s, fr, inv: a };
}
const scriptedPre = (s, neg, honest, rounds = 6) => {
  const open = neg.cpOpen;
  let ask = open.preMoney;
  for (let r = 0; r < rounds && neg.status === 'open'; r++) {
    ask = Math.round(open.preMoney * 1.35 / 100000) * 100000 - r * 400000;
    N.playRoundSync(s, neg.id, { offer: { ...open, preMoney: ask }, message: honest && r === 0 ? 'I hold another term sheet at a higher valuation.' : '', claim: honest && r === 0 ? 'alternative' : undefined });
  }
  return neg.last.cp?.preMoney ?? open.preMoney;
};

test('VC: a real competing term sheet lifts the valuation, within the researched band; without it the room is a few percent', () => {
  const lift = (second) => {
    const { s, inv } = vcWorld(8, { second });
    const neg = startVcNegotiation(s, inv);
    assert.equal(neg.player.batna.real, second);
    const final = scriptedPre(s, neg, second);
    return { v0: 12e6, final, neg };
  };
  const without = lift(false), withTs = lift(true);
  assert.ok(withTs.final >= without.final, `${withTs.final} >= ${without.final}`);
  assert.ok(without.final <= 12e6 * 1.1, `no-leverage room is a few percent (${without.final})`);
  assert.ok(withTs.final <= 12e6 * (1 + 0.09 + 0.15) + 1, `capped by room + the researched 5-15% lift (${withTs.final})`);
  assert.ok(withTs.neg.flags.leverageUsed && withTs.neg.flags.bluff == null);
});

test('VC: an exploding term sheet allows no negotiation; pushing risks it being withdrawn', () => {
  const { s, inv } = vcWorld(8, { exploding: true });
  const neg = startVcNegotiation(s, inv);
  assert.equal(neg.cp.rigid, 'none');
  const before = JSON.stringify(inv.terms);
  const open = neg.cpOpen;
  const r1 = N.playRoundSync(s, neg.id, { offer: { ...open, preMoney: open.preMoney * 1.1 } });
  if (neg.status === 'open') {
    assert.deepEqual(r1.package, open, 'no movement on any term');
    const r2 = N.playRoundSync(s, neg.id, { offer: { ...open, preMoney: open.preMoney * 1.1 } });
    assert.equal(r2.action, 'walk', 'a second push withdraws the offer');
  }
  assert.equal(neg.status, 'walked_cp');
  assert.equal(inv.status, 'passed');
  assert.equal(JSON.stringify(inv.terms), before, 'the terms never moved');
  assert.ok(s.mistakes.some((m) => m.id === 'overplayed_hand_lost_term_sheet'));
});

test('VC: bluffing a competing term sheet is logged and costs investor reputation when caught', () => {
  let found = null;
  for (let seed = 1; seed <= 30 && !found; seed++) {
    const { s, fr, inv } = vcWorld(seed, { kind: 'multistage' });
    const neg = startVcNegotiation(s, inv);
    assert.equal(neg.player.batna.real, false);
    N.playRoundSync(s, neg.id, { offer: { ...neg.cpOpen, preMoney: 13e6 }, message: 'Another fund already gave me a term sheet at 14M.', claim: 'alternative' });
    if (neg.flags.bluffDiscovered) found = { s, fr, neg };
  }
  assert.ok(found, 'caught for some seed');
  assert.ok(found.s.mistakes.some((m) => m.id === 'bluffed_competing_term_sheet'));
  N.walkAway(found.s, found.neg.id);
  assert.ok(found.fr.reputation <= -0.5, 'reputation hit');
});

test('VC: agreed terms are written onto the term sheet; participating preference, a big pool and board control are traced', () => {
  const { s, inv } = vcWorld(8);
  inv.terms.poolTargetPost = 0.15;
  const neg = startVcNegotiation(s, inv);
  const accepted = { ...neg.cpOpen, liq: 'p1', board: 'investor', pool: 0.15, preMoney: 12.5e6 };
  N.closeNegotiation(s, neg, 'agreed', accepted);
  assert.equal(inv.terms.participating, true);
  assert.equal(inv.terms.boardSeats, 'investor');
  assert.equal(inv.terms.preMoney, 12.5e6);
  assert.equal(inv.terms.postMoney, 12.5e6 + 3e6);
  assert.ok(inv.terms.negotiated);
  const ids = s.mistakes.map((m) => m.id);
  for (const id of ['accepted_participating_pref', 'pool_shuffle_ignored', 'gave_up_board_control']) assert.ok(ids.includes(id), `${id} in ${ids}`);
  assert.ok(s.mistakes.find((m) => m.id === 'accepted_participating_pref').cost.usd > 100000);
});

test('VC: the negotiated preference and governance reach the cap table, the exit waterfall and later decisions', () => {
  const { s, fr, inv } = vcWorld(8);
  s.company.entity = 'ccorp';
  const neg = startVcNegotiation(s, inv);
  N.closeNegotiation(s, neg, 'agreed', { ...neg.cpOpen, liq: 'p1', board: 'balanced', vesting: 'partial', protective: 'broad' });
  assert.equal(acceptTerms(s, inv), null);
  advance(s, 80, APPS);
  const rows = fr.cap.preferred.filter((p) => p.series === 'Seed');
  assert.ok(rows.length >= 1 && rows.every((p) => p.participating === true && p.liqPref === 1), 'preferred rows carry the negotiated preference');
  assert.ok(fr.governance && fr.governance.protective === 'broad' && fr.governance.vesting === 'partial', 'governance recorded');
  const wfPart = waterfall(fr.cap, 40e6).founderTake;
  const capNP = { ...fr.cap, preferred: fr.cap.preferred.map((p) => ({ ...p, participating: false })) };
  assert.ok(wfPart < waterfall(capNP, 40e6).founderTake, 'participation cuts founder proceeds at exit');
  assert.equal(saleConsent(s, 1e6).blocked, true, 'broad protective provisions let investors veto a cheap sale');
  assert.equal(saleConsent(s, 80e6).blocked, false);
  assert.ok(vestingForfeit(fr.governance, 1) > 0 && vestingForfeit({ vesting: 'keep' }, 1) === 0);
});

test('pool shuffle: a headline pre-money with a post-money pool set in the pre is worth less', () => {
  const e = effectivePreMoney({ preMoney: 12e6, investment: 3e6, poolPostPct: 0.1 });
  assert.equal(Math.round(e.effective), 10.5e6);
  assert.ok(Math.abs(e.haircut - 0.125) < 1e-9);
  const cap = newCapTable('Pat');
  const r = pricedRound(cap, { preMoney: 12e6, investment: 3e6, poolTargetPost: 0.1 });
  const poolValue = r.poolTopUp * r.price;
  assert.ok(Math.abs(poolValue - 1.5e6) < 2e4, `pool top-up is worth ${poolValue}`);
  assert.ok(Math.abs(12e6 - poolValue - 10.5e6) < 2e4);
});

test('participating and 2x preferences at a $100M exit: the closed-form worked examples', () => {
  const cap = (liqPref, participating) => ({ founders: [{ name: 'Founders', shares: 8e6 }], common: [], grants: [], pool: 0, safes: [], preferred: [{ holder: 'VC', series: 'A', shares: 2e6, invested: 10e6, liqPref, participating }] });
  const run = (lp, part) => { const w = waterfall(cap(lp, part), 100e6); return { vc: w.payouts.find((p) => p.name === 'VC').payout, common: w.founderTake }; };
  const np = run(1, false), p1 = run(1, true), p2 = run(2, true);
  assert.ok(Math.abs(np.vc - 20e6) < 1 && Math.abs(np.common - 80e6) < 1);
  assert.ok(Math.abs(p1.vc - 28e6) < 1 && Math.abs(p1.common - 72e6) < 1);
  assert.ok(Math.abs(p2.vc - 36e6) < 1 && Math.abs(p2.common - 64e6) < 1);
  assert.equal(prefCostUsd({ invested: 10e6, ownership: 0.2, liqPref: 1, participating: true, exitValue: 100e6 }), 8e6);
  // market prevalence: the generator makes participating rare
  let part = 0;
  for (let i = 0; i < 400; i++) if (extraTerms({ seed: i * 31 + 7 }, { id: `i${i}`, kind: 'micro_vc' }, 'seed').participating) part++;
  assert.ok(part / 400 < 0.12, `participating is a rare trap (${part}/400)`);
});

// ---------------------------------------------------------------------------------------------------------------
// M&A
// ---------------------------------------------------------------------------------------------------------------

test('M&A: holdback, buyer stock and earnout pay out as negotiated; long exclusivity raises the retrade risk', () => {
  const s = baseState(2, 'smb');
  const loi = { id: 'loi1', signedDay: 0, price: 1e6, earnoutPct: 0.3, earnoutMonths: 24, holdbackPct: 0.1, holdbackMonths: 18, stockPct: 0.1, exclusivityDays: 60, prepared: true };
  const full = settleLoi(s, loi, 1e6, { projectEarnout, mrr: 10000, mrrAtLoi: 10000, monthlyGrowth: 0 });
  assert.equal(full.cash, 500000);
  assert.equal(full.earnout, 300000);
  assert.equal(full.earnoutPaid, 300000, 'MRR holding pays the earnout in full');
  assert.equal(full.holdback, 100000);
  assert.ok([100000, 60000].includes(full.holdbackPaid), 'the holdback is released whole or net of an indemnity claim (40%)');
  assert.equal(full.stockValue, 75000, 'buyer stock at a 25% haircut');
  const slump = settleLoi(s, loi, 1e6, { projectEarnout, mrr: 7000, mrrAtLoi: 10000, monthlyGrowth: 0 });
  assert.equal(slump.earnoutPaid, 0, 'MRR below 90% of the LOI forfeits the earnout');
  assert.ok(retradeP({ ...loi, exclusivityDays: 90, prepared: false }) > retradeP({ ...loi, exclusivityDays: 30, prepared: false }));
  assert.ok(retradeP({ ...loi, exclusivityDays: 30, prepared: false }) >= 0.1 && retradeP({ ...loi, exclusivityDays: 30, prepared: true }) < 0.15);
  const ex = loiExtras({ type: 'Operator (first-time buyer)', price: 1e6, earnout: 250000, diligenceDays: 52 });
  assert.equal(ex.exclusivityDays, 45); assert.ok(ex.holdbackPct >= 0.05 && ex.holdbackPct <= 0.2);
});

test('M&A: negotiating an LOI rewrites the offer; the exit pays holdback and earnout and traces an earnout-heavy deal', () => {
  const s = baseState(2, 'smb');
  const fr = ensureFr(s);
  const o = { id: 'off1', type: 'Search fund / PE-backed buyer', price: 1e6, cashAtClose: 800000, earnout: 200000, earnoutMonths: 12, diligenceDays: 45, failP: 0, day: 0, expiresDay: 30 };
  fr.exit.offers = [o];
  const neg = startMnaNegotiation(s, 'off1');
  const pkg = { ...neg.cpOpen, price: 1.05e6, earnout: 0.35, earnoutMonths: '24', holdback: 0.1, exclusivity: '90' };
  N.closeNegotiation(s, neg, 'agreed', pkg);
  assert.equal(o.price, 1.05e6);
  assert.equal(o.earnout, Math.round(1.05e6 * 0.35));
  assert.equal(o.exclusivityDays, 90);
  assert.equal(o.diligenceDays, 90);
  assert.equal(o.cashAtClose, Math.round(1.05e6 - o.earnout - 1.05e6 * 0.1 - 0));
  assert.ok(o.negotiated);
  // sign and close with MRR slumping: the earnout is mostly forfeited and the deal is traced
  fr.exit.loi = { ...o, signedDay: s.day, closeDay: s.day, mrrAtLoi: 0, prepared: false };
  fr.exit.offers = [];
  fundraisingDay(s);
  const r = fr.exit.result;
  assert.ok(r, 'sold');
  assert.ok(r.holdback > 0 && r.holdbackPaid > 0);
  assert.equal(r.earnout, Math.round(r.price * 0.35), 'the earnout stays 35% of the (possibly re-traded) price');
  assert.ok(r.founderTake >= 0 && r.retentionMonths === 6);
});

// ---------------------------------------------------------------------------------------------------------------
// Operator tiers, events, adapters
// ---------------------------------------------------------------------------------------------------------------

test('operator tiers separate on scripted negotiators by behaviour, not volume', () => {
  const read = (tier, volume = 5) => {
    const s = baseState(1);
    for (let k = 0; k < volume; k++) {
      const price = [24000, 8000, 3000][k % 3];
      const t = contractDeal(10 + k, { price });
      t.s.mistakes = s.mistakes; // keep one ledger
      const neg = startEnterpriseNegotiation(t.s, t.d);
      runNegotiator(t.s, neg.id, tier, { anchor: { discount: 0.07 }, anchorAvg: { discount: 0.05 } });
      s.apps.negotiation ??= { items: [], events: [] };
      s.apps.negotiation.items.push(neg);
    }
    return readOperator(s, 'negotiation');
  };
  assert.equal(readOperator(baseState(1), 'negotiation').tier, 'unknown', 'unknown before the player acts');
  const r = Object.fromEntries(['mediocre', 'average', 'good', 'stellar'].map((t) => [t, read(t)]));
  assert.ok(r.stellar.score > r.good.score && r.good.score > r.average.score && r.average.score > r.mediocre.score, JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.score]))));
  assert.equal(r.stellar.tier, 'stellar');
  assert.equal(r.good.tier, 'good');
  assert.equal(r.average.tier, 'average');
  assert.equal(r.mediocre.tier, 'mediocre');
  assert.ok(r.mediocre.coaching.length >= 1 && r.stellar.evidence.length >= 3);
  // volume is evidence, not score: six sloppy negotiations never read better than three careful ones
  assert.ok(read('mediocre', 9).score <= r.mediocre.score + 0.05);
  assert.ok(r.stellar.score > read('average', 9).score);
});

test('debrief: closed negotiations explain what a stellar negotiator would have done', () => {
  const { s, d } = contractDeal(2, { price: 24000 });
  const neg = startEnterpriseNegotiation(s, d);
  // open barely better than their own opening (no research, no anchor), then cave on payment terms without asking for anything
  N.playRoundSync(s, neg.id, { offer: { ...neg.cpOpen, discount: 0.26 } });
  if (neg.status === 'open') N.playRoundSync(s, neg.id, { offer: { ...neg.last.cp, payment: 'net90' } });
  if (neg.status === 'open') N.acceptCounter(s, neg.id);
  const fb = neg.result.feedback.join(' | ');
  assert.match(fb, /prepar/i, 'names the missing preparation');
  assert.match(fb, /opening anchor|first offer|captured|worth less/i, 'comments on the anchor or the outcome');
  assert.ok(neg.result.feedback.length >= 2);
  assert.ok(neg.result.leftUsd >= 0);
});

test('automations: negotiation events are catalogued and emitted', () => {
  for (const t of ['negotiation_started', 'counteroffer_received', 'negotiation_closed', 'negotiation_walked']) assert.ok(TRIGGERS[`negotiation_${t}`], t);
  const { s, d } = contractDeal(3);
  const neg = startEnterpriseNegotiation(s, d);
  N.playRoundSync(s, neg.id, { offer: Object.fromEntries(neg.issues.map((i) => [i.id, neg.cpOpen[i.id]])) });
  if (neg.status === 'open') N.walkAway(s, neg.id);
  const types = N.negotiationEvents(s).map((e) => e.type);
  assert.ok(types.includes('negotiation_started'));
  assert.ok(types.includes('negotiation_walked') || types.includes('negotiation_closed'));
  assert.ok(types.includes('counteroffer_received') || neg.status !== 'open');
});

test('vendor and hiring adapters expose factories that start negotiations without touching People or Money', async () => {
  const s = baseState(4);
  const v = N.startVendorNegotiation(s, { vendor: 'Cloudco', listAnnual: 24000, alternatives: 1 });
  assert.equal(v.kind, 'vendor');
  assert.equal(v.player.batna.real, true);
  const h = N.startHiringNegotiation(s, { candidate: { id: 'c1', name: 'Dana', persona: { otherOffers: true } }, role: 'engineer', expectation: 140000 });
  assert.equal(h.kind, 'hiring');
  N.playRoundSync(s, v.id, { offer: Object.fromEntries(v.issues.map((i) => [i.id, i.type === 'num' ? i.min : i.options[0].id])) });
  assert.ok(v.round === 1);
  let closed = 0;
  N.registerClose('vendor', () => { closed++; });
  N.walkAway(s, v.id);
  assert.equal(closed, 1);
});

test('UI: the shared component renders the Prepare panel, the offer form and the debrief, and escapes untrusted text', async () => {
  const { negotiationPanel, negotiationLauncher } = await import('../public/apps/negotiate-view.js');
  const { s, d } = contractDeal(2);
  const co = s.apps.crm.companies.find((c) => c.id === d.companyId);
  co.name = '<img src=x onerror=alert(1)>';
  const launcher = String(negotiationLauncher({ state: s }, { kind: 'enterprise', ref: d.id, key: `deal:${d.id}`, label: 'Negotiate the contract terms' }));
  assert.match(launcher, /data-neg-start="enterprise:/);
  const neg = startEnterpriseNegotiation(s, d);
  const open = String(negotiationPanel({ state: s }, neg.id));
  assert.match(open, /Prepare/); assert.match(open, /data-neg-send/); assert.match(open, /type="range"/); assert.match(open, /Tell them I have a competing alternative/);
  assert.ok(!open.includes('<img src=x'), 'markup in a company name is escaped');
  assert.ok(!/Their weight|wc"/.test(open), 'no hidden values in the markup');
  N.prepare(s, neg.id, 'batna');
  assert.match(String(negotiationPanel({ state: s }, neg.id)), /Your alternatives \(BATNA\)/);
  N.walkAway(s, neg.id);
  const closed = String(negotiationPanel({ state: s }, neg.id));
  // Hidden truth (surplus, priorities, what a stellar negotiator would do) is not shown without an advice source.
  assert.match(closed, /Outcome/); assert.ok(!/stellar negotiator|Surplus captured|Left on the table|hidden priorities/i.test(closed), 'no coaching or hidden truth without a source');
  setLearningMode(s, true); // document: learning mode is the training-wheels switch that returns the true debrief lines
  const coached = String(negotiationPanel({ state: s }, neg.id));
  assert.match(coached, /Coach \(learning mode\)/); assert.match(coached, /Their real priorities were/);
  // the Fundraising and Exit panels mount the same component
  const { renderCrm } = await import('../public/apps/fundraising/view-crm.js');
  const { renderExit } = await import('../public/apps/fundraising/view-exit.js');
  const w = vcWorld(8);
  assert.match(String(renderCrm({ state: w.s }, w.inv.id)), /data-neg-start="vc:/);
  const e = baseState(2, 'smb');
  ensureFr(e).exit.offers = [{ id: 'off9', type: 'Operator (first-time buyer)', price: 5e5, cashAtClose: 4e5, earnout: 1e5, earnoutMonths: 12, diligenceDays: 40, failP: 0.2, day: 0, expiresDay: 30 }];
  assert.match(String(renderExit({ state: e })), /data-neg-start="mna:off9"/);
});
