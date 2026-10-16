// VC lens: fund-returner math, ownership minimums, venture scale, pedigree, thesis fit, herding, and that
// targeting quality (who you pitch) separates operator tiers. Pure functions; runs in milliseconds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ventureScale, pedigree, fundReturner, ownershipCheck, lensFor, matchSummary } from '../public/apps/fundraising/vclens.js';

const microSaas = () => ventureScale({ oneLiner: 'Invoice reminders for freelancers', icp: 'freelance designers', model: 'smb', price: 19, marketScore: 3, arr: 1.5e6, yoyGrowth: 0.2 });
const moonshot = () => ventureScale({ oneLiner: 'Autonomous agents that replace finance teams at enterprises', icp: 'CFOs at Fortune 500 companies', model: 'enterprise', isAI: true, marketScore: 4.6 });
const median = () => ventureScale({ oneLiner: 'Customer onboarding software for B2B SaaS companies', icp: 'heads of customer success at 50-500 person SaaS companies', model: 'smb', price: 199, marketScore: 3.2 });
const INV = {
  top: { name: 'Top Fund', kind: 'multistage', leads: true, fund: { tier: 'top', size: 1.2e9, number: 'IV' } },
  established: { name: 'Est Fund', kind: 'seed_fund', leads: true, fund: { tier: 'established', size: 400e6, number: 'III' } },
  micro: { name: 'Micro Fund', kind: 'micro_vc', fund: { tier: 'micro', size: 40e6 } },
  nano: { name: 'Nano Fund', kind: 'micro_vc', fund: { tier: 'nano', size: 8e6 } },
  indie: { name: 'Indie Fund', kind: 'micro_vc', fund: { tier: 'indie', size: 20e6 } },
  angel: { name: 'Op Angel', kind: 'angel', angelTier: 'operator', checkMin: 10e3, checkMax: 50e3 },
};

test('profitable $1.5M ARR micro-SaaS fails fund-returner for a $400M fund but passes indie and angels', () => {
  const sc = microSaas();
  assert.ok(['micro', 'lifestyle'].includes(sc.cls), sc.cls);
  const big = fundReturner(INV.established, sc, 'seed');
  assert.equal(big.ok, false);
  assert.ok(big.ratio < 0.05, `ratio ${big.ratio}`);
  assert.ok(big.needExit > 3.5e9 && big.needExit < 5e9, `needExit ${big.needExit}`); // $400M / (15% × (1 − 50% × (1 − 0.5 × 55% reserves))) ≈ $4.2B
  assert.equal(fundReturner(INV.indie, sc, 'seed').ok, true);
  assert.equal(fundReturner(INV.angel, sc, 'seed').ok, true);
  const lens = lensFor(INV.established, { stage: 'seed', scale: sc, pedigree: 'none', traction: 4, profitable: true });
  assert.match(lens.passReason, /can't return the fund/);
  assert.equal(lens.passAt, 'partner');
  assert.match(lens.stellar, /\$400M fund needs a \$4\.2B\+ outcome.*angels, indie funds/);
  const indie = lensFor(INV.indie, { stage: 'seed', scale: sc, pedigree: 'none', traction: 4, profitable: true });
  assert.equal(indie.passReason, null);
  assert.ok(indie.meetingMult > 1.5 && indie.partnerMult > 1.5, JSON.stringify(indie));
});

test('a Chrome extension cannot exceed micro even with a perfect market score; traction lifts one class', () => {
  const s = ventureScale({ oneLiner: 'Chrome extension that summarizes your tabs', icp: 'knowledge workers', model: 'b2c', price: 5, marketScore: 5 });
  assert.equal(s.cls, 'micro');
  assert.ok(s.reasons.some((r) => /Capped/.test(r)));
  const t = ventureScale({ oneLiner: 'Chrome extension that summarizes your tabs', icp: 'knowledge workers', model: 'b2c', price: 5, marketScore: 5, arr: 2.5e6, yoyGrowth: 1.5 });
  assert.equal(t.cls, 'lifestyle'); // data beats slides, but only by one class
  assert.equal(moonshot().cls, 'moonshot');
  assert.ok(moonshot().exitValue > 10e9);
});

test('pedigree: elite signals parse, plain and aspirational text do not count', () => {
  const e = pedigree('Previously co-founded X (acquired by Stripe). Stanford CS. Ex-OpenAI research engineer.');
  assert.equal(e.tier, 'elite');
  assert.ok(['exit', 'elite_school', 'ai_lab'].every((id) => e.signals.some((s) => s.id === id)), JSON.stringify(e));
  assert.equal(pedigree('Product manager at a regional bank. I love building things.').tier, 'none');
  const asp = pedigree('I want to go to Stanford one day. Never worked at Google. Hoping to get into Y Combinator.');
  assert.equal(asp.points, 0, JSON.stringify(asp));
});

test('ownership check fails at a too-high cap and reports the post where their check hits target', () => {
  const hi = ownershipCheck(INV.established, { stage: 'seed', postMoney: 80e6, roundSize: 8e6 });
  assert.equal(hi.ok, false);
  assert.ok(hi.ownership < hi.minOwnership);
  assert.equal(hi.impliedPost, hi.maxCheck / hi.targetOwnership);
  assert.ok(hi.impliedPost < 80e6);
  assert.equal(ownershipCheck(INV.established, { stage: 'seed', postMoney: 20e6, roundSize: 4e6 }).ok, true);
  assert.equal(ownershipCheck(INV.angel, { stage: 'seed', postMoney: 80e6 }).ok, true);
  const lens = lensFor(INV.established, { stage: 'seed', scale: moonshot(), pedigree: 'none', traction: 3, postMoney: 80e6, roundSize: 8e6 });
  assert.ok(lens.valuationMult < lensFor(INV.established, { stage: 'seed', scale: moonshot(), pedigree: 'none', traction: 3 }).valuationMult);
  assert.match(lens.stellar, /post/);
});

test('elite founder × moonshot × top firm → mega-seed multipliers; a median founder sees ~1x terms', () => {
  const ped = pedigree('Previously co-founded X (acquired by Stripe). Stanford CS. Ex-OpenAI research engineer.');
  const mega = lensFor(INV.top, { stage: 'seed', scale: moonshot(), pedigree: ped, isAI: true, traction: 1 });
  const round = mega.roundMult * 3e6, post = mega.valuationMult * 21e6; // relative to seed medians
  assert.ok(round >= 8e6 && round <= 15e6, `round ${round}`);
  assert.ok(post >= 40e6 && post <= 80e6, `post ${post}`);
  assert.ok(mega.meetingMult >= 3);
  assert.ok(mega.megaSeed && mega.megaSeed.round >= 8e6);
  for (const k of ['established', 'micro', 'nano', 'angel']) {
    const l = lensFor(INV[k], { stage: 'seed', scale: median(), pedigree: 'none', traction: 3 });
    assert.ok(Math.abs(l.roundMult - 1) < 0.05 && Math.abs(l.valuationMult - 1) < 0.1, `${k} ${JSON.stringify(l)}`);
    assert.ok(l.meetingMult > 0.75 && l.meetingMult < 1.25, `${k} meeting ${l.meetingMult}`);
  }
});

test('thesis mismatch is a fast, specific pass', () => {
  const fintech = { name: 'Ledger Ventures', kind: 'micro_vc', sectors: ['fintech'], fund: { tier: 'micro', size: 40e6 } };
  const l = lensFor(fintech, { stage: 'seed', scale: median(), pedigree: 'none', sector: 'devtools', traction: 3 });
  assert.ok(l.meetingMult <= 0.3);
  assert.match(l.passReason, /^not our thesis: .*fintech/i);
  assert.equal(l.passAt, 'reply');
  assert.match(l.stellar, /thesis/);
  const stageMiss = lensFor(INV.micro, { stage: 'series-a', scale: median(), pedigree: 'none', traction: 3 });
  assert.match(stageMiss.passReason, /not our thesis: we don't do series-a/);
  assert.equal(lensFor(fintech, { stage: 'seed', scale: median(), pedigree: 'none', sector: 'fintech', traction: 3 }).passReason, null);
});

test('herding: a top-tier lead lifts followers; every lens carries a stellar line and specific pass reasons', () => {
  const base = lensFor(INV.micro, { stage: 'seed', scale: median(), pedigree: 'none', traction: 3 });
  const herd = lensFor(INV.micro, { stage: 'seed', scale: median(), pedigree: 'none', traction: 3, leadTier: 'top' });
  assert.ok(herd.meetingMult > base.meetingMult * 1.5 && herd.closeMult > base.closeMult * 1.5);
  assert.ok(lensFor(INV.angel, { stage: 'seed', scale: median(), pedigree: 'none', leadTier: 'top' }).closeMult > 1.2);
  for (const inv of Object.values(INV)) for (const sc of [microSaas(), median(), moonshot()]) {
    const l = lensFor(inv, { stage: 'seed', scale: sc, pedigree: 'none', traction: 3 });
    assert.ok(l.stellar && l.stellar.length > 40, `${inv.name} ${sc.cls}`);
    if (l.passReason) assert.ok(l.passReason.length > 30 && /\$|thesis/.test(l.passReason), l.passReason);
  }
  assert.match(matchSummary(INV.established, { stage: 'seed', scale: microSaas() }), /^Fund III, \$400M · needs ~\$4\.2B outcomes · your ceiling ~\$\d+M ARR: poor fit/);
  assert.match(matchSummary(INV.indie, { stage: 'seed', scale: microSaas() }), /strong fit/);
});

test('operator tiers separate: a well-targeted list for a micro-SaaS gets ≥3x the meeting odds of a top-fund spray', () => {
  const sc = microSaas();
  const ctx = { stage: 'seed', scale: sc, pedigree: 'none', traction: 4, profitable: true };
  const avg = (list) => list.reduce((a, inv) => a + lensFor(inv, ctx).meetingMult, 0) / list.length;
  const stellar = avg([INV.angel, INV.indie, INV.nano, { ...INV.angel, angelTier: 'first_time' }]);
  const mediocre = avg([INV.top, INV.established, { ...INV.established, fund: { tier: 'established', size: 700e6 } }, { ...INV.top, fund: { tier: 'top', size: 3e9 } }]);
  assert.ok(stellar >= 3 * mediocre, `stellar ${stellar.toFixed(3)} vs mediocre ${mediocre.toFixed(3)}`);
  // and the partner-stage gap is larger still (months lost in partner meetings that die on fund math)
  const pavg = (list) => list.reduce((a, inv) => a + lensFor(inv, ctx).partnerMult, 0) / list.length;
  assert.ok(pavg([INV.indie, INV.nano]) >= 5 * pavg([INV.top, INV.established]));
});

test('reserves: a venture-class company is a stretch (not a hard pass) for a top-tier seed program; moonshots fit; mid-market does not', () => {
  const venture = ventureScale({ oneLiner: 'System of record for logistics brokers', icp: 'freight brokers', model: 'enterprise', price: 2000, marketScore: 3 });
  const mid = ventureScale({ oneLiner: 'Customer onboarding software for B2B SaaS companies', icp: 'heads of customer success', model: 'smb', price: 49, marketScore: 3 });
  assert.equal(venture.cls, 'venture'); assert.equal(mid.cls, 'mid');
  for (const size of [1.2e9, 5e9, 12e9]) {
    const top = { kind: 'multistage', leads: true, fund: { tier: 'top', size } };
    const v = fundReturner(top, venture, 'seed');
    assert.ok(v.ratio >= 0.3 && v.ratio <= 0.85, `venture vs $${size / 1e9}B top: ${v.ratio}`);
    assert.equal(lensFor(top, { stage: 'seed', scale: venture, pedigree: 'none', traction: 3 }).passReason, null);
    assert.ok(fundReturner(top, moonshot(), 'seed').ratio >= 1.5);
    assert.ok(fundReturner(top, mid, 'seed').ratio < 0.3);
  }
  // Reserves halve dilution on the reserved share: kept = 1 − 50% × (1 − 0.5 × 55%) for a seed entry.
  assert.ok(Math.abs(fundReturner(INV.established, venture, 'seed').kept - 0.6375) < 0.002);
  assert.equal(fundReturner(INV.micro, venture, 'seed').kept, 0.5); // small funds can't defend pro-rata
  assert.ok(fundReturner(INV.established, mid, 'seed').ratio < 0.3);
  assert.equal(ventureScale({ oneLiner: 'Contract templates for law firms', icp: 'partners at mid-size law firms', model: 'smb', price: 400 }).cls === 'micro', false);
  assert.equal(ventureScale({ oneLiner: 'Notion templates for freelancers', model: 'b2c', price: 15 }).cls, 'micro');
});
