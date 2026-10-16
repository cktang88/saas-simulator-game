// Term-sheet redlines (fundraising/termsheet.js): multi-round markup, investor responses on the timing engine,
// counsel flags, walk risk, re-trades, and a behaviour-tier test (same term sheets, four ways of negotiating them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { post } from '../public/core/bank.js';
import { advance } from '../public/core/clock.js';
import fundApp from '../public/apps/fundraising.js';
import { ensureFr, acceptTerms, counterTerms } from '../public/apps/fundraising/sim.js';
import { prepareItem, ROOM_ITEMS } from '../public/apps/fundraising/dataroom.js';
import { archetypesReady } from '../public/apps/fundraising/investors.js';
import { weightedScore, tractionAnchor } from '../public/apps/fundraising/rubric.js';
import { incorporate, ensureLegal } from '../public/apps/legal/sim.js';
import { waterfall, founderPct } from '../public/apps/fundraising/captable.js';
import { vestingForfeit } from '../public/apps/negotiate/gov.js';
import {
  submitRedline, requestCounsel, counselFlags, offMarket, clauseValue, clauseOptions, tsOf, negotiationReview, HIRING_PLAN_POOL, CLAUSES,
} from '../public/apps/fundraising/termsheet.js';

function company(seed) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'vc', founderName: 'P', seed });
  s.founder.network.linkedin = 900;
  s.company.oneLiner = 'SOC 2 evidence collection for mid-market fintech security teams';
  ensureStripe(s); ensureMarket(s);
  post(s, { amount: 400000, counterparty: 'P', category: 'owner_contribution' });
  incorporate(s, { provider: 'atlas', operatingState: 'CA' });
  s.company.entity = 'ccorp'; s.company.incorporated = true;
  const Lg = ensureLegal(s); Lg.docs.ipAssignment = true; Lg.dpaReady = true;
  const fr = ensureFr(s);
  const p = [4, 3.5, 3, 2.5, 2.5, 3.5];
  const tr = tractionAnchor({ mrr: 30000, customers: 0, lois: 5 }, 'seed');
  const sc = { founder_market_fit: p[0], execution: p[1], traction: tr, market_why_now: p[2], defensibility: p[3], business_model: p[4], narrative: p[5] };
  fr.evaluations.push({ id: 'ev', day: 0, stage: 'seed', S: weightedScore(sc, 'seed'), criteria: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, { avg: v, min: v, max: v }])), hardFlags: [], softFlags: [], disagreement: 0 });
  for (let left = 30000; left > 0; left -= 1000) { const c = createCustomer(s, { name: 'c', email: `c${left}@x.com`, country: 'US' }); subscribe(s, c.id, { id: 'p', price: 1000, interval: 'month', trialDays: 0 }); }
  fr.raise = { id: 'r', stage: 'seed', instrument: 'priced', target: 3e6, cap: null, discount: 0, mfn: false, proRataMin: Infinity, startDay: 0, deadlineDay: 180, raised: 0, status: 'active', runwayAtStart: 14 };
  for (const it of ROOM_ITEMS) prepareItem(s, it.id);
  return { s, fr };
}

// A lead in diligence that issues its term sheet on day 1; odd seeds also have a real competing lead.
function withTermSheet(seed) {
  const { s, fr } = company(seed);
  const kind = seed % 3 === 0 ? 'multistage' : 'seed_fund';
  const lead = { id: 'L', name: 'Lea', firm: 'Fund', kind, leads: true, checkMin: 1e6, checkMax: 3e6, raiseId: 'r', status: 'diligence', evalMrr: 30000, pending: { type: 'diligenceDone', day: s.day }, log: [], outreach: { channel: 'warm' } };
  fr.investors.push(lead);
  advance(s, 1, [fundApp]);
  if (lead.status !== 'term_sheet') return null;
  let competing = false;
  if (seed % 2) {
    competing = true;
    fr.investors.push({ id: 'C', name: 'Cal', firm: 'Other', kind: 'seed_fund', leads: true, raiseId: 'r', status: 'term_sheet', termExpiresDay: s.day + 60, log: [], terms: { ...lead.terms, redline: undefined } });
  }
  return { s, fr, lead, competing };
}

const waitFor = (s, cond, max = 30) => { for (let i = 0; i < max && !cond(); i++) advance(s, 1, [fundApp]); };
// The market position nearest the current one (what a stellar operator asks for: standard, not greedy).
function marketAsk(t, id, stage) {
  if (id === 'pool') return HIRING_PLAN_POOL.seed;
  const opts = clauseOptions(id, stage);
  const cur = opts.findIndex((o) => String(o.value) === String(clauseValue(t, id)));
  for (let i = cur - 1; i >= 0; i--) if (opts[i].market) return opts[i].value;
  return opts[0].value;
}

const STRATEGIES = {
  // Counsel first, asks spent on the off-market structure (pool, preference, control) with reasons, one trade, price only
  // with a real second term sheet; one follow-up round on what is still off-market, then sign.
  stellar(ctx) {
    const { s, lead, competing } = ctx;
    requestCounsel(s, lead);
    waitFor(s, () => counselFlags(s, lead) != null);
    let flags = counselFlags(s, lead) ?? [];
    for (let round = 0; round < 2 && lead.status === 'term_sheet'; round++) {
      const ts = tsOf(lead);
      const marks = {};
      // Round 2 only chases what still matters (control, preference, pool) and never reopens an agreed point.
      for (const f of flags) if (!ts.clauses[f.id]?.agreed && (round === 0 || f.severity === 'high')) marks[f.id] = { action: 'push', value: marketAsk(lead.terms, f.id, 'seed') };
      if (round === 0 && competing) marks.preMoney = { action: 'push', value: lead.terms.preMoney * 1.1 };
      if (round === 0 && !marks.noShop && clauseValue(lead.terms, 'noShop') <= 45) marks.noShop = { action: 'trade' };
      if (!Object.values(marks).some((m) => m.action === 'push')) break;
      const note = `We want to keep a standard seed structure: the pool sized to our 18-month hiring plan, 1x non-participating, two founders on a three-seat board, market protective provisions.${competing ? ' We do have another term sheet, and we would rather do this with you.' : ''} In exchange we can live with a longer no-shop.`;
      if (submitRedline(s, lead, { marks, note }).error) break;
      waitFor(s, () => !tsOf(lead)?.pending);
      flags = offMarket(lead.terms, 'seed');
    }
  },
  // Counsel once, fixes the flagged terms but also pushes price +12% (with or without leverage); signs after one round.
  good(ctx) {
    const { s, lead, competing } = ctx;
    requestCounsel(s, lead);
    waitFor(s, () => counselFlags(s, lead) != null);
    const marks = { preMoney: { action: 'push', value: lead.terms.preMoney * 1.12 } };
    for (const f of counselFlags(s, lead) ?? []) marks[f.id] = { action: 'push', value: marketAsk(lead.terms, f.id, 'seed') };
    submitRedline(s, lead, { marks, note: `Market standard terms please.${competing ? ' We have another term sheet.' : ''}` });
    waitFor(s, () => !tsOf(lead)?.pending);
  },
  // No counsel: pushes price +20% and nudges the pool, accepts everything else as drafted.
  average(ctx) {
    const { s, lead } = ctx;
    const marks = { preMoney: { action: 'push', value: lead.terms.preMoney * 1.2 }, pool: { action: 'push', value: Math.max(0.05, lead.terms.poolTargetPost - 0.02) } };
    submitRedline(s, lead, { marks, note: 'Can you do better on valuation?' });
    waitFor(s, () => !tsOf(lead)?.pending);
  },
  // No counsel: haggles valuation only, +35% every round for four rounds, claims other interest; re-trades what was agreed.
  mediocre(ctx) {
    const { s, lead } = ctx;
    const pre0 = lead.terms.preMoney;
    for (let round = 0; round < 4 && lead.status === 'term_sheet'; round++) {
      const marks = { preMoney: { action: 'push', value: Math.max(pre0 * 1.35, lead.terms.preMoney * 1.05) } };
      if (submitRedline(s, lead, { marks, note: 'Other investors are interested at a much higher price. Need more.' }).error) break;
      waitFor(s, () => !tsOf(lead)?.pending);
    }
  },
};

function play(seed, tier) {
  const ctx = withTermSheet(seed);
  if (!ctx) return null;
  const { s, fr, lead } = ctx;
  const flagsAtOpen = offMarket(lead.terms, 'seed').length;
  STRATEGIES[tier](ctx);
  if (lead.status !== 'term_sheet') return { seed, survived: false, flagsAtOpen, mistakes: (s.mistakes ?? []).map((m) => m.id) };
  assert.equal(acceptTerms(s, lead), null);
  waitFor(s, () => fr.governance != null, 120);
  const g = fr.governance;
  assert.ok(g, 'the priced round closed');
  const exit = 1.5 * g.postMoney;
  const take = waterfall(fr.cap, exit).founderTake * (1 - vestingForfeit(g, 1));
  return {
    seed, survived: true, flagsAtOpen,
    own: founderPct(fr.cap), take, control: g.control === 'founder' && g.protective !== 'broad',
    review: negotiationReview(s, lead), offLeft: offMarket(lead.terms, 'seed').length, mistakes: (s.mistakes ?? []).map((m) => m.id),
  };
}

test('stellar / good / average / mediocre term-sheet negotiators separate on survival, control and exit proceeds', async () => {
  await archetypesReady;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = {};
  for (const tier of ['stellar', 'good', 'average', 'mediocre']) {
    const rs = seeds.map((sd) => play(sd, tier)).filter(Boolean);
    const alive = rs.filter((r) => r.survived);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    out[tier] = {
      n: rs.length, survival: alive.length / rs.length,
      take: mean(alive.map((r) => r.take)), own: mean(alive.map((r) => r.own)), control: mean(alive.map((r) => (r.control ? 1 : 0))),
      offLeft: mean(alive.map((r) => r.offLeft)), tiers: alive.map((r) => r.review.tier),
      // Expected founder proceeds per term sheet: a lost lead is worth nothing in this raise.
      ev: rs.reduce((a, r) => a + (r.survived ? r.take : 0), 0) / rs.length,
    };
  }
  const o = out;
  const msg = JSON.stringify(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { ...v, take: Math.round(v.take), ev: Math.round(v.ev), own: +v.own.toFixed(4) }])));
  assert.ok(o.stellar.n >= 6, msg);
  assert.ok(o.stellar.survival >= 0.85, `stellar keeps the deal: ${msg}`);
  assert.ok(o.mediocre.survival <= 0.75 && o.mediocre.survival < o.stellar.survival, `valuation-only haggling loses deals: ${msg}`);
  assert.ok(o.stellar.offLeft < o.average.offLeft && o.stellar.offLeft <= 1, `stellar signs market terms: ${msg}`);
  assert.ok(o.stellar.control >= o.average.control && o.stellar.control >= o.mediocre.control, `control: ${msg}`);
  assert.ok(o.stellar.ev > o.good.ev && o.good.ev > o.mediocre.ev && o.stellar.ev > o.average.ev, `expected founder proceeds per term sheet: ${msg}`);
  assert.ok(o.average.ev > o.mediocre.ev, `average beats mediocre: ${msg}`);
  const rank = { stellar: 3, good: 2, average: 1, mediocre: 0 };
  const avgRank = (t) => o[t].tiers.reduce((a, x) => a + rank[x], 0) / Math.max(1, o[t].tiers.length);
  assert.ok(avgRank('stellar') > avgRank('average') && avgRank('stellar') >= 2.4, `review tiers: ${msg}`);
  console.log('term-sheet tiers', msg);
});

test('a markup is answered on the timing engine a few business days later, per clause', async () => {
  await archetypesReady;
  let ctx;
  for (let sd = 2; !ctx && sd < 20; sd += 2) ctx = withTermSheet(sd);
  const { s, lead } = ctx;
  const ask = lead.terms.preMoney * 1.05;
  const r = submitRedline(s, lead, { marks: { preMoney: { action: 'push', value: ask }, info: { action: 'accept' } }, note: 'Market price for our traction, because of our runway plan.' });
  assert.ok(r.ok && r.responseDay > s.day && r.responseDay - s.day <= 25, JSON.stringify(r));
  assert.match(submitRedline(s, lead, { marks: { preMoney: { action: 'push', value: ask } } }).error, /still with them/);
  assert.ok(lead.termExpiresDay >= r.responseDay, 'the offer stays open while they read it');
  waitFor(s, () => !tsOf(lead).pending);
  const round = tsOf(lead).rounds[0];
  assert.ok(round, 'answered');
  if (lead.status === 'term_sheet') assert.ok(['accept', 'partial', 'hold'].includes(round.responses.preMoney.out));
  // wrong-direction pushes are refused without using up a round
  if (lead.status === 'term_sheet') assert.match(submitRedline(s, lead, { marks: { pool: { action: 'push', value: lead.terms.poolTargetPost + 0.05 } } }).error, /better for you/);
});

test('counsel review costs money and hours and flags the off-market terms; skipping it is logged at signing', async () => {
  await archetypesReady;
  let found = null;
  for (let sd = 1; sd < 40 && !found; sd++) {
    const c = withTermSheet(sd);
    if (c && offMarket(c.lead.terms, 'seed').length) found = c;
  }
  assert.ok(found, 'some first drafts carry off-market anchors');
  const { s, lead } = found;
  const cash = s.bank.txns.reduce((a, t) => a + t.amount, 0);
  const r = requestCounsel(s, lead);
  assert.ok(r.ok && r.usdCost > 0 && r.hoursCost > 0);
  assert.ok(s.bank.txns.reduce((a, t) => a + t.amount, 0) < cash);
  assert.equal(counselFlags(s, lead), null, 'flags arrive later');
  waitFor(s, () => counselFlags(s, lead) != null);
  assert.ok(counselFlags(s, lead).length >= 1);
  // A blind signature on another seed: the off-market terms and the skipped review are traceable mistakes.
  let blind = null;
  for (let sd = 1; sd < 40 && !blind; sd++) {
    const c = withTermSheet(sd);
    if (c && offMarket(c.lead.terms, 'seed').length) blind = c;
  }
  assert.equal(acceptTerms(blind.s, blind.lead), null);
  const ids = (blind.s.mistakes ?? []).map((m) => m.id);
  assert.ok(ids.includes('signed_term_sheet_blind'), ids.join(','));
  const rv = blind.lead.terms.redline.review;
  assert.ok(rv && rv.coaching.some((c) => /counsel/i.test(c)), 'feedback explains what a stellar operator would have done');
});

test('re-trading an agreed point and bluffing a competing offer are red flags; exploding offers do not move', async () => {
  await archetypesReady;
  let ctx;
  for (let sd = 2; !ctx && sd < 30; sd += 2) ctx = withTermSheet(sd);
  const { s, lead } = ctx;
  submitRedline(s, lead, { marks: { noShop: { action: 'push', value: 30 } }, note: 'Market no-shop is 30-45 days.' });
  waitFor(s, () => !tsOf(lead).pending);
  if (lead.status === 'term_sheet') {
    // force the agreed flag on a clause and re-open it
    tsOf(lead).clauses.vesting.agreed = true;
    const cur = clauseValue(lead.terms, 'vesting');
    const better = clauseOptions('vesting', 'seed').map((o) => o.value).find((v, i, a) => i < a.indexOf(cur));
    if (better) {
      submitRedline(s, lead, { marks: { vesting: { action: 'push', value: better } }, note: 'We have a competing term sheet at a higher price.' });
      waitFor(s, () => !tsOf(lead).pending);
      const ids = (s.mistakes ?? []).map((m) => m.id);
      assert.ok(ids.includes('retraded_term_sheet'), ids.join(','));
      assert.ok(ids.includes('bluffed_competing_term_sheet'), ids.join(','));
      assert.ok(tsOf(lead).rounds.at(-1).pWalk >= 0.3);
    }
  }
  // exploding: the legacy counter refuses; a markup only adds walk risk and never moves a clause
  const ex = withTermSheet(4);
  ex.lead.terms.exploding = true;
  assert.match(counterTerms(ex.s, ex.lead, ex.lead.terms.preMoney * 1.2), /won't negotiate/);
  const pre = ex.lead.terms.preMoney;
  submitRedline(ex.s, ex.lead, { marks: { preMoney: { action: 'push', value: pre * 1.05 } } });
  waitFor(ex.s, () => !tsOf(ex.lead).pending);
  assert.equal(ex.lead.terms.preMoney, pre);
  assert.ok(tsOf(ex.lead).rounds[0].pWalk >= 0.4);
});

test('clause catalogue: SAFEs carry only cap, discount, MFN and the pro rata side letter', () => {
  assert.deepEqual(['cap', 'discount', 'mfn', 'safeProRata'].map((id) => Boolean(CLAUSES[id])), [true, true, true, true]);
  const t = { instrument: 'safe', amount: 100000, cap: 10e6, discount: 0.25, mfn: true, proRata: false };
  assert.deepEqual(offMarket(t, 'pre-seed').map((f) => f.id), ['discount']);
});

test('UI: the redline panel renders clauses, counsel flags, rounds and the review, and escapes the note', async () => {
  await archetypesReady;
  let ctx;
  for (let sd = 1; !ctx && sd < 40; sd++) { const c = withTermSheet(sd); if (c && offMarket(c.lead.terms, 'seed').length) ctx = c; }
  const { s, lead } = ctx;
  const { renderCrm } = await import('../public/apps/fundraising/view-crm.js');
  let out = String(renderCrm({ state: s }, lead.id));
  assert.match(out, /Redline the term sheet/);
  assert.match(out, /Nobody has reviewed this draft/);
  requestCounsel(s, lead);
  waitFor(s, () => counselFlags(s, lead) != null);
  out = String(renderCrm({ state: s }, lead.id));
  assert.match(out, /off-market/);
  submitRedline(s, lead, { marks: { noShop: { action: 'push', value: 30 } }, note: '<img src=x onerror=alert(1)>' });
  out = String(renderCrm({ state: s }, lead.id));
  assert.match(out, /is with Lea/);
  waitFor(s, () => !tsOf(lead).pending);
  out = String(renderCrm({ state: s }, lead.id));
  assert.ok(!out.includes('<img src=x'), 'note is escaped');
  if (lead.status === 'term_sheet') assert.match(out, /Markup 1/);
});

test('SAFE markups are light: at most two rounds, then best and final', async () => {
  await archetypesReady;
  const { s, fr } = company(5);
  fr.raise = { ...fr.raise, stage: 'pre-seed', instrument: 'safe', target: 500000, cap: 12e6 };
  const inv = { id: 'A', name: 'Ann', firm: 'Ann Ventures', kind: 'micro_vc', leads: true, raiseId: 'r', status: 'term_sheet', termExpiresDay: s.day + 14, log: [], terms: { instrument: 'safe', amount: 250000, cap: 10e6, discount: 0.25, mfn: false, proRata: true } };
  fr.investors.push(inv);
  for (let i = 0; i < 2 && inv.status === 'term_sheet'; i++) {
    const marks = i === 0 ? { discount: { action: 'push', value: 0.2 } } : { cap: { action: 'push', value: inv.terms.cap * 1.05 } };
    const r = submitRedline(s, inv, { marks, note: 'A 20% discount is market standard on a capped SAFE.' });
    assert.ok(r.ok, JSON.stringify(r));
    waitFor(s, () => !tsOf(inv).pending);
  }
  if (inv.status === 'term_sheet') assert.equal(tsOf(inv).final, true);
});
