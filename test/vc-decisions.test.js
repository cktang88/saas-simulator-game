// VC decisions wired into the fundraising sim: fund-returner math and thesis fit on meeting odds and passes,
// ownership minimums and pedigree/mega-seed sizing in offerTerms, the returner-misfit and profile-inflation
// mistakes, and that WHO you pitch separates operator tiers. Short: no long sims, seconds in total.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { post } from '../public/core/bank.js';
import { advance } from '../public/core/clock.js';
import fundApp from '../public/apps/fundraising.js';
import { ensureFr, beginOutreach, meetingOdds, offerTerms, lensOf, raiseContext } from '../public/apps/fundraising/sim.js';
import { companyVcRead, investorVcRead, vcContext } from '../public/apps/fundraising/vcread.js';
import { searchInvestors } from '../public/apps/fundraising/universe.js';
import { generateInvestors, personaSystem, realInvestor, parseInvestorCsv, archetypesReady } from '../public/apps/fundraising/investors.js';
import { weightedScore } from '../public/apps/fundraising/rubric.js';
import { incorporate } from '../public/apps/legal/sim.js';
import { FUND_TIERS } from '../public/data/vc-universe.js';
import { rng } from '../public/core/util.js';

const ELITE = 'Co-founder and CTO of Ledgerly (acquired by Stripe in 2023). Stanford CS. Previously research engineer at OpenAI working on agents for finance workflows. Before that, early engineer at a fintech unicorn.';
const PLAIN = 'Product manager for 6 years at a regional bank and then a payroll startup. Built and sold nothing yet; I talk to freelancers every week and shipped this product myself over nights and weekends. Bachelor in economics.';

// One company, seeded: what it sells, how it prices, the evaluation panel's criteria and the founder profile.
function company({ seed = 1, oneLiner, icp = '', model = 'smb', price = 49, interval = 'month', market = 3, traction = 3, mrr0 = 0, profile = PLAIN, stage = 'seed' } = {}) {
  const s = newState({ companyName: 'X', model, path: 'vc', founderName: 'P', seed });
  s.founder.network.linkedin = 900;
  s.company.oneLiner = oneLiner; s.company.icp = icp;
  s.plans[0].price = price; s.plans[0].interval = interval;
  s.founder.linkedinText = profile;
  ensureStripe(s); ensureMarket(s);
  post(s, { amount: 300000, counterparty: 'P', category: 'owner_contribution' });
  incorporate(s, { provider: 'atlas', operatingState: 'CA' });
  s.company.entity = 'ccorp'; s.company.incorporated = true;
  const fr = ensureFr(s);
  const sc = { founder_market_fit: 3.5, execution: 3.5, traction, market_why_now: market, defensibility: 3, business_model: 3, narrative: 3.5 };
  fr.evaluations.push({ id: 'ev', day: 0, stage, S: weightedScore(sc, stage), criteria: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, { avg: v, min: v, max: v }])), hardFlags: [], softFlags: [], disagreement: 0 });
  for (let left = mrr0; left > 0; left -= 1000) { const c = createCustomer(s, { name: 'c', email: `c${left}@x.com`, country: 'US' }); subscribe(s, c.id, { id: 'p', price: Math.min(1000, left), interval: 'month', trialDays: 0 }); }
  return { s, fr };
}
const openRaise = (fr, o = {}) => { fr.raise = { id: 'r', stage: 'seed', instrument: 'safe', target: 1.5e6, cap: 15e6, discount: 0, mfn: false, proRataMin: Infinity, startDay: 0, deadlineDay: 180, raised: 0, status: 'active', ...o }; return fr.raise; };
let nid = 0;
const add = (fr, inv) => { const x = { id: `i${nid++}`, addedDay: 0, status: 'researching', log: [], ...inv }; fr.investors.push(x); return x; };
const fundInv = (tier, o = {}) => {
  const T = FUND_TIERS[tier];
  const kind = tier === 'top' || tier === 'established' ? 'seed_fund' : tier === 'cvc' || tier === 'family_office' ? tier : 'micro_vc';
  return { name: `${tier} partner`, firm: `${tier} Fund`, kind, leads: true, checkMin: T.firstCheck.seed[0], checkMax: T.firstCheck.seed[1], capMin: 5e6, capMax: 200e6, fund: { tier, size: Math.sqrt(T.fundSize[0] * T.fundSize[1]), number: 'III', ownership: { ...T.ownership }, reserveRatio: T.reserveRatio }, ...o };
};
const angel = (o = {}) => ({ name: 'Ann Gel', firm: 'Ann Gel (individual)', kind: 'angel', angelTier: 'operator', leads: false, checkMin: 10e3, checkMax: 50e3, capMax: 25e6, coldReplyRate: 0.06, warmMeetingRate: 0.55, ...o });

// A capped, profitable micro-SaaS: invoice reminders for freelancers, $1.5M ARR.
const microSaas = (o = {}) => company({ oneLiner: 'Invoice reminders for freelancers', icp: 'freelance designers and developers', price: 19, traction: 4, mrr0: 125000, ...o });
// A pre-revenue AI moonshot.
const moonshot = (o = {}) => company({ oneLiner: 'Autonomous agents that replace finance teams at enterprises', icp: 'CFOs at Fortune 500 companies', model: 'ent', price: 60000, interval: 'year', market: 4.6, traction: 1.5, profile: ELITE, ...o });

test('capped micro-SaaS: top/established funds see a returner pass and far lower odds; indie and angels are fine', async () => {
  await archetypesReady;
  const { s, fr } = microSaas();
  openRaise(fr);
  const read = companyVcRead(s);
  assert.ok(['micro', 'lifestyle'].includes(read.scale.cls), read.scale.cls);
  assert.ok(read.fundFit.filter((f) => ['top', 'established'].includes(f.tier)).every((f) => f.verdict === 'cannot return'), JSON.stringify(read.fundFit));
  assert.ok(read.advice.some((a) => /angels and indie funds|indie funds/.test(a)));
  const top = add(fr, fundInv('top')), est = add(fr, fundInv('established')), indie = add(fr, fundInv('indie', { kind: 'micro_vc', leads: false })), ang = add(fr, angel());
  const ctx = raiseContext(s);
  for (const big of [top, est]) {
    const l = lensOf(s, ctx, big);
    assert.match(l.passReason, /can't return the fund/);
    assert.equal(l.passAt, 'partner');
  }
  assert.equal(lensOf(s, ctx, indie).passReason, null);
  assert.equal(lensOf(s, ctx, ang).passReason, null);
  const warm = (inv) => meetingOdds(s, inv, true);
  // Associates still take warm meetings with a company that has real revenue (≥2.5x lower odds); the gap is at the
  // partnership, where fund math kills it.
  assert.ok(warm(indie) > 2.5 * warm(est) && warm(ang) > 2.5 * warm(top), `indie ${warm(indie)} est ${warm(est)} angel ${warm(ang)} top ${warm(top)}`);
  for (const big of [top, est]) assert.ok(lensOf(s, ctx, big).partnerMult < 0.1 * lensOf(s, ctx, indie).partnerMult);
  // The fund-math pass carries coaching; the deal from indie/angels goes through.
  const tt = offerTerms(s, top);
  assert.ok(tt.passLens && /indie|angels/.test(tt.stellar), JSON.stringify(tt));
  const ti = offerTerms(s, indie), ta = offerTerms(s, ang);
  assert.ok(ti.instrument === 'safe' && ti.amount > 0 && !ti.passCap, JSON.stringify(ti));
  assert.ok(ta.instrument === 'safe' && ta.amount > 0 && !ta.passCap, JSON.stringify(ta));
  // The persona knows its fund math and the ceiling it perceives.
  const sys = personaSystem(est, { company: 'X', stage: 'seed', REALISM: '', ceiling: vcContext(s).scale });
  assert.match(sys, /Fund math: Fund III, \$\d+M; you want 10-15% ownership at seed, so a core bet must plausibly reach a \$[\d.]+B\+ outcome/);
  assert.match(personaSystem(ang, { company: 'X', stage: 'seed', REALISM: '' }), /No fund-returner math/);
});

test('pitching a fund you cannot return is a traceable mistake; the pass email carries stellar coaching', async () => {
  await archetypesReady;
  const { s, fr } = microSaas({ seed: 3 });
  openRaise(fr);
  const est = add(fr, fundInv('established'));
  beginOutreach(s, est, { warm: true, judge: { quality: 4 } });
  beginOutreach(s, add(fr, fundInv('top')), { warm: true, judge: { quality: 4 } });
  const ms = s.mistakes.filter((m) => m.id === 'returner_misfit');
  assert.equal(ms.length, 1, 'logged once per raise');
  assert.match(ms[0].detail, /needs a \$[\d.]+B\+ outcome/); // the detail is factual; the prescription sits on the lesson (shown only via advice)
  assert.match(ms[0].lesson, /(angels|indie)/);
  assert.equal(ms[0].circles, true);
  assert.equal(fr.raise.returnerMisfit, true);
  assert.ok(est.lens && est.lens.passReason, 'lens trace on the investor');
  // Partner stage: the partnership applies fund math, the pass is logged with what a stellar founder would do.
  est.status = 'partner_meeting'; est.pending = { type: 'afterPartner', day: s.day };
  for (let i = 0; i < 120 && est.status !== 'passed'; i++) advance(s, 1, [fundApp]);
  assert.equal(est.status, 'passed');
  assert.match(est.passReason, /can't return the fund/);
  // The coaching is hidden truth: kept on the investor for the advice gate, never written to the visible log.
  assert.match(est.passStellar, /(angels|indie)/);
  assert.ok(!est.log.some((l) => /stellar founder would do/i.test(l.text)), JSON.stringify(est.log));
});

test('elite founder + AI moonshot gets a mega-seed from a top-tier lead; a solid micro-SaaS founder gets median terms elsewhere', async () => {
  await archetypesReady;
  const { s, fr } = moonshot();
  openRaise(fr, { instrument: 'priced', target: 8e6, cap: null });
  const read = companyVcRead(s);
  assert.equal(read.scale.cls, 'moonshot');
  assert.equal(read.pedigree.tier, 'elite');
  assert.equal(read.megaSeedEligible, true);
  assert.ok(read.fundFit.find((f) => f.tier === 'top').verdict === 'returnable');
  const top = add(fr, fundInv('top'));
  top.pedigreeAtOutreach = null;
  const xs = [];
  for (let i = 0; i < 6; i++) xs.push(offerTerms(s, top));
  for (const t of xs) {
    assert.ok(t.lead && t.megaSeed, JSON.stringify(t));
    assert.ok(t.roundSize >= 8e6 && t.postMoney >= 40e6 && t.postMoney <= 150e6, `round ${t.roundSize} post ${t.postMoney}`);
    assert.ok(t.roundSize / t.postMoney <= 0.25 && t.amount / t.postMoney >= 0.12, JSON.stringify(t)); // lead hits its ownership
  }
  // Same top firm, same company, no pedigree: still a real round, but not a mega-seed.
  const { s: s2, fr: fr2 } = moonshot({ seed: 2, profile: PLAIN });
  openRaise(fr2, { instrument: 'priced', target: 4e6, cap: null });
  const plain = offerTerms(s2, add(fr2, fundInv('top')));
  assert.ok(plain.lead && !plain.megaSeed && plain.postMoney < xs[0].postMoney * 0.8, JSON.stringify(plain));
  // Solid micro-SaaS founder: a pass from that top fund, an ordinary deal from capital whose math works.
  const { s: s3, fr: fr3 } = microSaas({ seed: 4 });
  openRaise(fr3, { instrument: 'safe', target: 750e3, cap: 10e6 });
  const tp = offerTerms(s3, add(fr3, fundInv('top')));
  assert.ok(tp.passLens && /can't return the fund/.test(tp.reason), JSON.stringify(tp));
  const indie = offerTerms(s3, add(fr3, fundInv('indie', { kind: 'micro_vc', leads: true, checkMin: 100e3, checkMax: 500e3 })));
  assert.ok(indie.instrument === 'safe' && indie.amount >= 100e3 && indie.amount <= 500e3 && indie.cap >= 7e6 && indie.cap <= 10e6, JSON.stringify(indie));
  const ang = offerTerms(s3, add(fr3, angel()));
  assert.ok(ang.instrument === 'safe' && ang.amount >= 10e3 && ang.cap >= 7e6, JSON.stringify(ang));
  // An indie fund can't lead a $5M priced round: its check can't reach its ownership target.
  openRaise(fr3, { instrument: 'priced', target: 1e6, cap: null });
  const big = offerTerms(s3, add(fr3, fundInv('indie', { kind: 'micro_vc', leads: true, checkMin: 100e3, checkMax: 1e6 })));
  assert.ok(big.passOwnership || big.amount / big.postMoney >= 0.05, JSON.stringify(big));
});

test('ownership minimum: a cap far above the lead\'s implied post is passed; a moderate one is countered there', async () => {
  await archetypesReady;
  const { s, fr } = company({ oneLiner: 'SOC 2 evidence collection for mid-market fintech security teams', price: 400, traction: 3.5, mrr0: 40000 });
  const est = add(fr, fundInv('established', { checkMax: 3e6 }));
  openRaise(fr, { cap: 60e6, target: 2e6 });
  const far = offerTerms(s, est);
  assert.ok(far.passCap && /ownership: they need 10%/.test(far.ownNote), JSON.stringify(far));
  assert.ok(far.acceptable <= 2e6 / 0.15 + 250000);
  openRaise(fr, { cap: 21e6, target: 2e6 }); // $2M buys 9.5% < their 10% minimum
  const near = offerTerms(s, est);
  assert.ok(!near.passCap && near.countered && near.cap <= 13.5e6 && near.cap >= 12e6 && /ownership/.test(near.ownNote), JSON.stringify(near));
  openRaise(fr, { cap: 18e6, target: 2e6 }); // 11% ≥ minimum: no ownership counter
  assert.ok(!offerTerms(s, est).ownNote);
  // An angel has no minimum: same 16M cap is fine for them (no ownership counter).
  assert.ok(!offerTerms(s, add(fr, angel())).ownNote);
});

test('operator tiers: a fund-size-matched list gets ≥3x the expected first meetings of a top-fund spray', async () => {
  await archetypesReady;
  const { s, fr } = microSaas({ seed: 9 });
  openRaise(fr);
  const st = { seed: 4242, apps: {}, founder: { network: { linkedin: 500 } } };
  const page = (f, n) => { const out = []; for (let p = 0; out.length < n && p < 10; p++) out.push(...searchInvestors(st, f, { page: p })); return out.slice(0, n); };
  // Stellar: angels and indie/nano capital for a capped profitable business (what companyVcRead advises).
  const stellar = [...page({ kind: 'angel', stage: 'seed' }, 18), ...page({ tier: 'indie' }, 6), ...page({ tier: 'nano', stage: 'seed' }, 6)];
  // Mediocre: sprays top-tier and established seed funds with the same company.
  const mediocre = [...page({ tier: 'top', stage: 'seed' }, 15), ...page({ tier: 'established', stage: 'seed' }, 15)];
  assert.equal(stellar.length, 30); assert.equal(mediocre.length, 30);
  const expected = (list) => list.reduce((a, r) => a + meetingOdds(s, add(fr, { ...r }), false, 3.5), 0);
  const eS = expected(stellar), eM = expected(mediocre);
  assert.ok(eS >= 3 * eM, `expected first meetings per 30 cold contacts: stellar ${eS.toFixed(2)} vs mediocre ${eM.toFixed(2)}`);
  // and the mediocre list's meetings end at the partnership on fund math
  const ctx = raiseContext(s);
  const why = mediocre.map((r) => lensOf(s, ctx, { ...r }));
  const returner = why.filter((l) => /can't return the fund/.test(l.passReason ?? '')).length, offThesis = why.filter((l) => l.passAt === 'reply').length;
  assert.ok(returner + offThesis >= 27, `${returner} fund-math + ${offThesis} off-thesis of 30 mediocre targets`);
  assert.ok(returner >= 9, `${returner} fund-math passes`);
});

test('profile inflation mid-raise is logged once and buys no meeting odds', async () => {
  await archetypesReady;
  const { s, fr } = company({ oneLiner: 'SOC 2 evidence collection for mid-market fintech security teams', price: 400, traction: 3, mrr0: 20000 });
  openRaise(fr, { cap: 12e6, target: 1.5e6 });
  const a = add(fr, fundInv('micro')), b = add(fr, fundInv('micro', { name: 'b' })), c = add(fr, fundInv('micro', { name: 'c' }));
  beginOutreach(s, a, { warm: true, judge: { quality: 3 } });
  const before = meetingOdds(s, b, true), aBefore = meetingOdds(s, a, true);
  s.founder.linkedinText = `${PLAIN} ${ELITE}`; // suddenly an exit, Stanford and OpenAI
  assert.ok(Math.abs(aBefore - meetingOdds(s, a, true)) < 1e-9, 'an investor already contacted keeps the profile they read');
  beginOutreach(s, b, { warm: true, judge: { quality: 3 } });
  beginOutreach(s, c, { warm: true, judge: { quality: 3 } });
  assert.equal(fr.raise.profileInflated, true);
  assert.equal(b.pedigreeAtOutreach.tier, a.pedigreeAtOutreach.tier);
  assert.ok(Math.abs(meetingOdds(s, b, true) - before) < before * 0.02 + 1e-6, `${meetingOdds(s, b, true)} vs ${before}`);
  const hits = s.mistakes.filter((m) => m.id === 'profile_inflated');
  assert.equal(hits.length, 1, 'logged once');
  assert.match(hits[0].detail, /Prior exit|Elite school|Ex-AI-lab/);
  assert.ok(fr.reputation < 0);
  // Filling an EMPTY profile mid-raise is not inflation (but earlier investors keep the empty read).
  const { s: s2, fr: fr2 } = company({ seed: 5, oneLiner: 'SOC 2 evidence collection for mid-market fintech security teams', price: 400, profile: '' });
  openRaise(fr2);
  const x = add(fr2, fundInv('micro'));
  beginOutreach(s2, x, { warm: true, judge: { quality: 3 } });
  s2.founder.linkedinText = ELITE;
  const y = add(fr2, fundInv('micro', { name: 'y' }));
  beginOutreach(s2, y, { warm: true, judge: { quality: 3 } });
  assert.ok(!fr2.raise.profileInflated);
  assert.equal(y.pedigreeAtOutreach.tier, 'elite');
  assert.equal(x.pedigreeAtOutreach.tier, 'none');
});

test('legacy lists, manual and CSV investors get funds; investorVcRead explains the fit', async () => {
  await archetypesReady;
  const { s, fr } = microSaas({ seed: 6 });
  openRaise(fr);
  const list = generateInvestors(s, { count: 40, stage: 'seed', rand: () => rng(s) });
  for (const inv of list) {
    if (['angel', 'syndicate', 'angel_group', 'scout'].includes(inv.kind)) assert.ok(!inv.fund);
    else assert.ok(inv.fund?.tier && inv.fund.size > 1e6 && FUND_TIERS[inv.fund.tier], JSON.stringify(inv));
  }
  const [row] = parseInvestorCsv('name,firm,stage,check_size,fund_size,tier\nJane Roe,Roe Capital,seed,$1M-$3M,$400M,established');
  const real = realInvestor(row);
  assert.equal(real.fund.tier, 'established'); assert.equal(real.fund.size, 400e6);
  assert.ok(realInvestor({ name: 'No Size', stage: 'seed', check: '$2M-$4M' }).fund.tier === 'established');
  const rd = investorVcRead(s, add(fr, real));
  assert.match(rd.summary, /^Fund .*\$400M · needs ~\$[\d.]+B outcomes .*poor fit/);
  assert.ok(rd.passReason && rd.stellar && rd.parts.length);
});
