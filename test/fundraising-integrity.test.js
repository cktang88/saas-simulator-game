// Fundraising loophole blockers (verification brief; docs/research/verification/money-deals.md §1-4): claims told to
// investors, accelerators, boards, buyers and co-founder candidates are recorded when sent, mostly pass early checks,
// and are caught where the real world verifies them (references + Stripe/bank reconciliation in diligence, quarterly
// information rights, the next round, an acquirer's QoE), with odds rising by gap. Honest play passes; consequences
// land and are logged; lying loses in expectation without being caught 100% at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { post } from '../public/core/bank.js';
import { advance } from '../public/core/clock.js';
import { rng } from '../public/core/util.js';
import { openLies, reputationMult, ensureIntegrity, verify, penalize } from '../public/core/integrity.js';
import fundApp from '../public/apps/fundraising.js';
import { ensureFr, beginOutreach, meetingDone, acceptTerms, endRaise, meetingOdds, fileFormD } from '../public/apps/fundraising/sim.js';
import { tell, smellTest, diligenceVerdict, referenceCalls, postCloseDay, acquirerQoE, accelInterview, accelProgramCheck, cofounderSeesTruth, investorView } from '../public/apps/fundraising/claims.js';
import { roomStatus, prepareItem, ROOM_ITEMS } from '../public/apps/fundraising/dataroom.js';
import { settleLoi } from '../public/apps/negotiate/mna-terms.js';
import { generateInvestors, archetypesReady } from '../public/apps/fundraising/investors.js';
import { weightedScore, tractionAnchor } from '../public/apps/fundraising/rubric.js';
import { incorporate, ensureLegal } from '../public/apps/legal/sim.js';
import { signals } from '../public/apps/outcomes/engine.js';
import { monthOf } from '../public/apps/money/common.js';
import { computeMetrics } from '../public/apps/fundraising/metrics.js';
import { readOperator, TIER_RANK } from '../public/core/operator.js';
import '../public/apps/fundraising/operator.js';

// Claims relative to the company's real numbers (k = 1 is the truth).
const mrrSay = (s, k) => `MRR: $${Math.round(computeMetrics(s).mrr * k).toLocaleString('en-US')}`;
const custSay = (s, k) => `${Math.round(computeMetrics(s).customers * k)} paying customers`;

function company({ seed = 1, mrr0 = 10000, perCust = 1000 } = {}) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'vc', founderName: 'P', seed });
  s.founder.network.linkedin = 900;
  s.company.oneLiner = 'SOC 2 evidence collection for mid-market fintech security teams';
  ensureStripe(s); ensureMarket(s);
  post(s, { amount: 200000, counterparty: 'P', category: 'owner_contribution' });
  incorporate(s, { provider: 'atlas', operatingState: 'CA' });
  s.company.entity = 'ccorp'; s.company.incorporated = true;
  const Lg = ensureLegal(s); Lg.docs.ipAssignment = true; Lg.dpaReady = true;
  const fr = ensureFr(s);
  const p = [4, 3.5, 3, 2.5, 2.5, 3.5];
  const sc = { founder_market_fit: p[0], execution: p[1], traction: tractionAnchor({ mrr: mrr0, customers: mrr0 / perCust, lois: 0 }, 'pre-seed'), market_why_now: p[2], defensibility: p[3], business_model: p[4], narrative: p[5] };
  fr.evaluations.push({ id: 'ev', day: 0, stage: 'pre-seed', S: weightedScore(sc, 'pre-seed'), criteria: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, { avg: v, min: v, max: v }])), hardFlags: [], softFlags: [], disagreement: 0 });
  for (let left = mrr0, i = 0; left > 0; left -= perCust, i++) { const c = createCustomer(s, { name: `Cust${i}`, email: `c${i}@x.com`, country: 'US' }); subscribe(s, c.id, { id: 'p', price: Math.min(perCust, left), interval: 'month', trialDays: 0 }); }
  return { s, fr };
}
const openRaise = (fr, o = {}) => { fr.raise = { id: 'r', stage: 'pre-seed', instrument: 'safe', target: 500e3, cap: 10e6, discount: 0, mfn: false, proRataMin: Infinity, startDay: 0, deadlineDay: 180, raised: 0, status: 'active', ...o }; return fr.raise; };
const vc = (id = 'v') => ({ id, name: `Vera ${id}`, firm: 'Seed Fund', kind: 'seed_fund', leads: true, log: [] });
const rate = (n, f) => { let k = 0; for (let seed = 1; seed <= n; seed++) k += f(seed) ? 1 : 0; return k / n; };

test('a pitch smell test lets most inflated numbers through; an angel check even more', () => {
  const smell = (angel) => rate(80, (seed) => { const { s } = company({ seed }); tell(s, { recipientId: 'v', text: mrrSay(s, 2) }); return smellTest(s, vc(), { angel }).length > 0; });
  const p = smell(false), a = smell(true);
  assert.ok(p > 0.15 && p < 0.55, `pitch catches a 2x lie ${p}`);
  assert.ok(a < p, `angels check less: ${a} vs ${p}`);
  const { s } = company({ seed: 3 });
  tell(s, { recipientId: 'v', text: `${mrrSay(s, 1)} with ${custSay(s, 1)}` });
  assert.equal(smellTest(s, vc()).length, 0, 'the truth always passes');
});

test('VC diligence catches lies with odds rising by gap; small gaps re-trade, big gaps kill the deal; honest is clean', () => {
  const verdict = (k, seed, cust = false) => { const { s } = company({ seed }); tell(s, { recipientId: 'v', text: `${mrrSay(s, k)}${cust ? ` and ${custSay(s, 1)}` : ''}` }); return diligenceVerdict(s, vc(), { kind: 'vc', diligenceDays: 30 }); };
  const caught = (k, cust) => rate(60, (seed) => verdict(k, seed, cust).outcome !== 'clean');
  const g10 = caught(1.1), g30 = caught(1.3), g100 = caught(2);
  assert.ok(g10 < g30 && g30 < g100 && g100 >= 0.85, `caught ${g10} / ${g30} / ${g100}`);
  assert.ok(g10 > 0.1, 'even a 10% overstatement is often found');
  assert.equal(caught(1, true), 0);
  const small = Array.from({ length: 40 }, (_, i) => verdict(1.1, i + 1)).find((v) => v.outcome !== 'clean');
  assert.equal(small.outcome, 'retrade');
  assert.ok(small.cut >= 0.1 && small.cut <= 0.3);
  const big = verdict(3, 2);
  assert.equal(big.outcome, 'dead');
});

test('a caught lie spreads: integrity reputation lowers fresh investors\' meeting odds; it is logged and traceable', async () => {
  await archetypesReady;
  const { s, fr } = company({ seed: 5 });
  openRaise(fr);
  for (const inv of generateInvestors(s, { count: 3, stage: 'pre-seed', rand: () => rng(s) })) fr.investors.push({ id: `inv${fr.investors.length}`, addedDay: 0, status: 'researching', log: [], ...inv });
  const fresh = fr.investors[0];
  const before = meetingOdds(s, fresh, false);
  tell(s, { recipientId: 'v', channel: 'deck', text: `${mrrSay(s, 4)}, ${custSay(s, 4)}` });
  const v = diligenceVerdict(s, vc(), { kind: 'vc', diligenceDays: 35 });
  assert.equal(v.outcome, 'dead');
  assert.ok(reputationMult(s, 'investor') < 0.8);
  assert.ok(meetingOdds(s, fresh, false) < before * 0.8, 'other investors hear');
  assert.ok(fr.reputation < 0);
  const m = s.mistakes.find((x) => x.id === 'diligence_caught_inflation');
  assert.ok(m && m.delayed && /mrr \$[\d,]+\/mo vs real \$[\d,]+\/mo/.test(m.detail), m?.detail);
});

test('through the sim: a small caught gap re-trades the cap at the term sheet; the deck SENT is what counts', async () => {
  await archetypesReady;
  // Edit-after-evaluation: the deck was evaluated honest, then an inflated one went out with the email.
  const { s: s0, fr: f0 } = company({ seed: 9 });
  openRaise(f0);
  f0.deck.text = 'We have $10K MRR from 10 customers.';
  const inv0 = { ...vc('d'), status: 'researching' };
  f0.investors.push(inv0);
  f0.deck.text = 'We have $35K MRR from 30 customers.';
  beginOutreach(s0, inv0, { warm: false, text: 'Short note, deck attached.', judge: { quality: 3 }, deck: 'pdf' });
  assert.ok(openLies(s0, { recipientId: 'd' }).some((c) => c.channel === 'deck' && c.claimed === 35000));
  assert.match(investorView(s0, inv0), /NOT seen any data export/);
  let retraded = null;
  for (let seed = 1; seed <= 30 && !retraded; seed++) {
    const { s, fr } = company({ seed });
    openRaise(fr);
    for (const it of ROOM_ITEMS) prepareItem(s, it.id);
    const lead = { ...vc('L'), checkMin: 2e5, checkMax: 3e5, raiseId: 'r', status: 'diligence', evalMrr: 10000, diligenceStart: 0, pending: { type: 'diligenceDone', day: s.day }, outreach: { channel: 'warm' } };
    fr.investors.push(lead);
    tell(s, { recipientId: 'L', text: mrrSay(s, 1.12) });
    advance(s, 1, [fundApp]);
    if (lead.terms?.retraded) retraded = { s, lead };
  }
  assert.ok(retraded, 'a re-trade happens within 30 seeds');
  assert.ok(retraded.lead.terms.cap < 10e6);
  assert.ok(retraded.s.mistakes.some((x) => x.id === 'diligence_retrade' && x.cost.usd > 0));
});

test('data room folders read ground truth: books closed, real customers, clean cap table', () => {
  const { s } = company({ seed: 2, mrr0: 0 });
  for (const it of ROOM_ITEMS) prepareItem(s, it.id);
  assert.equal(roomStatus(s).rows.find((r) => r.id === 'contracts').status, 'gap', 'no customers or LOIs: nothing to show');
  const { s: s2 } = company({ seed: 2, mrr0: 3000 });
  s2.day = 60;
  for (const it of ROOM_ITEMS) prepareItem(s2, it.id);
  const fin = () => roomStatus(s2).rows.find((r) => r.id === 'financials');
  assert.equal(fin().status, 'gap');
  assert.match(fin().why, /Books not closed/);
  assert.equal(roomStatus(s2).rows.find((r) => r.id === 'contracts').status, 'ready');
  s2.apps.books ??= {};
  s2.apps.books.closed ??= {};
  for (let d = 0; d < 60; d += 10) s2.apps.books.closed[monthOf(s2, d)] = { day: 60 };
  delete s2.apps.books.closed[monthOf(s2, 60)];
  assert.equal(fin().status, 'ready');
  const fr = ensureFr(s2);
  fr.cap.founders.push({ name: 'Sam (departed)', shares: Math.round(fr.cap.founders[0].shares * 0.3), departed: true });
  assert.equal(roomStatus(s2).rows.find((r) => r.id === 'captable').status, 'gap');
});

test('reference calls use real customers: the investor picks one too, and an unhappy one hurts', () => {
  const { s } = company({ seed: 4, mrr0: 3000 });
  const subs = s.stripe.subscriptions;
  subs[2].cancelAtPeriodEnd = true;
  s.apps.support = { tickets: [{ customerId: subs[2].customerId, status: 'open' }, { customerId: subs[2].customerId, status: 'open' }] };
  const r = referenceCalls(s, vc());
  assert.equal(r.refs.length, 3);
  assert.equal(r.refs.find((x) => x.by === 'investor').sentiment, 'unhappy');
  assert.ok(r.mult < 0.7);
  assert.ok(s.mistakes.some((x) => x.id === 'unhappy_reference'));
  const { s: h } = company({ seed: 4, mrr0: 3000 });
  assert.ok(referenceCalls(h, vc()).mult > 0.85, 'healthy customers make good references');
});

test('after the money moved: quarterly information rights surface a surviving lie; legal costs, rescission, integrity_failure', () => {
  let hit = null;
  for (let seed = 1; seed <= 20 && !hit; seed++) {
    const { s, fr } = company({ seed });
    fr.investors.push({ ...vc('A'), status: 'committed', closedDay: 0, terms: { amount: 100000 } });
    fr.cap.safes.push({ id: 'sf', invId: 'A', holder: 'Vera A', amount: 100000, cap: 8e6, status: 'outstanding' });
    fr.rounds.push({ id: 'rd', day: 0, instrument: 'safe', amount: 100000 });
    tell(s, { recipientId: 'A', text: mrrSay(s, 3) });
    for (let q = 1; q <= 8 && !fr.fraudFound; q++) { s.day = q * 91; postCloseDay(s); }
    if (fr.fraudFound) hit = { s, fr, q: s.day / 91 };
  }
  assert.ok(hit, 'found within two years in most seeds');
  const { s, fr } = hit;
  assert.ok(s.bank.txns.some((t) => /misrepresentation claim/.test(t.description) && t.amount <= -15000));
  assert.ok(s.mistakes.some((x) => x.id === 'post_close_misrepresentation' && x.delayed));
  assert.ok(signals(s).warnings.some((w) => w.id === 'integrity_failure'));
  assert.ok(fr.ir === undefined || fr.ir.warmth < 0.6);
  // Honest: nothing to find, no cost.
  const { s: h, fr: hf } = company({ seed: 1 });
  hf.investors.push({ ...vc('A'), status: 'committed', closedDay: 0 });
  hf.rounds.push({ id: 'rd', day: 0, instrument: 'safe', amount: 100000 });
  tell(h, { recipientId: 'A', text: mrrSay(h, 1) });
  for (let q = 1; q <= 8; q++) { h.day = q * 91; postCloseDay(h); }
  assert.ok(!hf.fraudFound && !(h.mistakes ?? []).length);
});

test('M&A: QoE catches open misstatements; the holdback claim follows what slipped through', () => {
  const { s } = company({ seed: 6 });
  tell(s, { recipientId: 'board', text: mrrSay(s, 1.3) });
  const q = acquirerQoE(s, { price: 1e6, type: 'Operator (first-time buyer)' });
  assert.ok(q.caught.length === 1 && q.outcome === 'retrade' && q.cut > 0.1);
  const claimRate = (latentGap) => rate(200, (i) => settleLoi({ seed: 7 }, { id: `l${i}`, signedDay: i, price: 1e6, holdbackPct: 0.1 }, 1e6, { projectEarnout: () => 0, latentGap }).holdbackClaimed);
  const honest = claimRate(0), liar = claimRate(0.3);
  assert.ok(honest < 0.25 && liar > 0.4, `${honest} vs ${liar}`);
  const r = settleLoi({ seed: 7 }, { id: 'x', signedDay: 1, price: 1e6, holdbackPct: 0.1 }, 1e6, { projectEarnout: () => 0, latentGap: 0.8 });
  if (r.holdbackClaimed) assert.ok(r.holdbackPaid < 0.2 * r.holdback && r.clawback > 0);
});

test('accelerators: the interview misses most inflation, office hours with the real Stripe numbers do not', () => {
  const run = (f) => rate(60, (seed) => { const { s } = company({ seed }); tell(s, { audience: 'accelerator', recipientId: 'yc', text: mrrSay(s, 2.5) }); return f(s).length > 0; });
  const interview = run((s) => accelInterview(s, 'yc', 'YC'));
  const program = run((s) => accelProgramCheck(s, 'yc', 'YC'));
  assert.ok(interview < 0.5 && program > interview + 0.2, `${interview} vs ${program}`);
});

test('co-founder candidates find out in the trial project', () => {
  const caught = rate(40, (seed) => { const { s } = company({ seed }); tell(s, { audience: 'cofounder', recipientId: 'c1', text: mrrSay(s, 2.5) }); return cofounderSeesTruth(s, { id: 'c1', name: 'Sam' }).length > 0; });
  assert.ok(caught > 0.85);
});

// ---- Operator tiers: same company, honest stellar vs lying mediocre over one raise ----
async function raise(kind, seed) {
  await archetypesReady;
  const { s, fr } = company({ seed: seed * 7919 });
  const liar = kind === 'liar';
  if (!liar) for (const it of ROOM_ITEMS) prepareItem(s, it.id);
  openRaise(fr, { runwayAtStart: 12 });
  for (const inv of generateInvestors(s, { count: 30, stage: 'pre-seed', rand: () => rng(s) })) fr.investors.push({ id: `inv${fr.investors.length}`, addedDay: 0, status: 'researching', log: [], ...inv, warmPath: 'a founder they backed' });
  // The liar's inflated hook earns a better first impression (quality 4 vs 3.5).
  const k = liar ? 3 : 1;
  const pitch = () => `SOC 2 evidence for fintech. ${mrrSay(s, k)}, ${custSay(s, k)}. Raising $500K on a SAFE.`; // current numbers at each send
  let meetingsHeld = 0;
  for (let d = 0; d < 150; d++) {
    if (d % 7 === 0 && fr.raise) {
      let n = 0;
      for (const inv of fr.investors) {
        if (inv.status !== 'researching' || n >= 10) continue;
        beginOutreach(s, inv, { warm: true, text: pitch(), judge: { quality: liar ? 4 : 3.5 } });
        inv.evalId = 'ev';
        inv.status = 'intro_requested'; inv.pending = { type: 'intro', day: s.day + 3 };
        n++;
      }
    }
    for (const mtg of fr.meetings) if (mtg.status === 'scheduled' && mtg.day === s.day) { meetingDone(s, mtg, 3.5, 'test'); meetingsHeld++; }
    for (const inv of fr.investors.filter((i) => i.status === 'term_sheet')) acceptTerms(s, inv);
    s.founder.hoursUsed = 0;
    advance(s, 1, [fundApp]);
    s.jobs = [];
    if (fr.raise && fr.rounds.reduce((a, r) => a + r.amount, 0) >= 500e3) endRaise(s, 'closed');
  }
  return { raised: fr.rounds.reduce((a, r) => a + r.amount, 0), integrity: ensureIntegrity(s).score, meetingsHeld, caught: ensureIntegrity(s).claims.filter((c) => c.status === 'caught').length, mistakes: (s.mistakes ?? []).map((m) => m.id), tier: readOperator(s, 'fundraising').tier };
}

test('operator tiers: honest stellar raises more than a lying mediocre founder; lies are not all caught at once', async () => {
  const seeds = [1, 2, 3, 4, 5, 6];
  const honest = [], liar = [];
  for (const k of seeds) { honest.push(await raise('honest', k)); liar.push(await raise('liar', k)); }
  const avg = (xs, f) => xs.reduce((a, x) => a + f(x), 0) / xs.length;
  if (process.env.TIER_DEBUG) console.log(JSON.stringify({ honest: honest.map((x) => [x.raised, x.meetingsHeld, x.tier]), liar: liar.map((x) => [x.raised, x.meetingsHeld, x.tier, x.caught, +x.integrity.toFixed(2), x.mistakes.filter((id) => /caught|smell|post_close|retrade|discrep/.test(id))]) }));
  const hr = avg(honest, (x) => x.raised), lr = avg(liar, (x) => x.raised);
  assert.ok(hr > lr * 1.3, `honest $${Math.round(hr)} vs liar $${Math.round(lr)}`);
  assert.ok(avg(liar, (x) => x.integrity) < avg(honest, (x) => x.integrity));
  assert.ok(avg(honest, (x) => TIER_RANK[x.tier]) > avg(liar, (x) => TIER_RANK[x.tier]), `tiers ${honest.map((x) => x.tier)} vs ${liar.map((x) => x.tier)}`);
  assert.ok(honest.every((x) => x.integrity === 1 && x.caught === 0), 'honest founders are never "caught"');
  assert.ok(avg(liar, (x) => x.meetingsHeld) > 2, 'the inflated pitch still gets meetings (not caught instantly)');
  assert.ok(liar.some((x) => x.raised > 0) || liar.some((x) => x.meetingsHeld > 3), 'some lies survive the early stages');
  assert.ok(liar.some((x) => x.mistakes.some((id) => /diligence_caught_inflation|inflated_pitch_smelled|post_close/.test(id))), 'the cost is traceable');
});

test('core/integrity extensions: verify can be limited to some metrics; penalize weight scales the hit', () => {
  const { s } = company({ seed: 12 });
  tell(s, { recipientId: 'z', text: `${mrrSay(s, 3)} and ${custSay(s, 3)}` });
  const r = verify(s, { recipientId: 'z', metrics: ['customers'], check: 'audit' });
  assert.ok(r.caught.every((c) => c.metric === 'customers') && openLies(s, { recipientId: 'z' }).some((c) => c.metric === 'mrr'));
  const { s: a } = company({ seed: 12 }), { s: b } = company({ seed: 12 });
  const lie = [{ gap: 1, metric: 'mrr', claimed: 2, truth: 1, id: 'x' }];
  penalize(a, lie, { audience: 'investor' });
  penalize(b, lie, { audience: 'investor', weight: 0.25 });
  assert.ok(ensureIntegrity(b).reputation.investor < ensureIntegrity(a).reputation.investor / 2 && ensureIntegrity(b).score > ensureIntegrity(a).score);
});

test('Form D: first sale of a round starts a 15-day clock; late is logged, on time is free', () => {
  for (const fileIt of [false, true]) {
    const { s, fr } = company({ seed: 8 });
    openRaise(fr);
    fr.closings.push({ id: 'cl1', kind: 'safe', holder: 'Angel', raiseId: 'r', day: s.day, amount: 50000, terms: { cap: 8e6 } });
    advance(s, 1, [fundApp]);
    assert.equal(fr.formD.length, 1);
    if (fileIt) assert.equal(fileFormD(s, fr.formD[0].id), null);
    advance(s, 17, [fundApp]);
    assert.equal((s.mistakes ?? []).some((m) => m.id === 'form_d_late'), !fileIt);
  }
});
