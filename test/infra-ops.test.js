// Hosting platforms, observability tools and SMS: each vendor's pricing shape and trap, and that operator tiers separate
// on what the player does (docs/research/tools/2026q4/dev-data.md §1-3). Short, targeted: a few seeds, at most a year
// of daily ticks on these modules only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator } from '../public/core/operator.js';
import { productSlice } from '../public/apps/product/store.js';
import { releasesSlice, deploy, resolveWithFix } from '../public/apps/product/releases.js';
import { HOSTS, HOST_IDS, hostBill, chooseHost, hostingSlice, hostingDay, hostingMonthEnd, migrationHours, setSpendCap, effectivePlatform } from '../public/apps/product/hosting.js';
import { chooseObs, obsSlice, obsDay, uploadSourcemaps, enableSeer, setDatadogControls, fixMultFor, seerMonthly, seerUsable } from '../public/apps/product/observability.js';
import '../public/apps/product/infra-operator.js';
import { smsSlice, smsTick, setSmsProvider, submitRegistration, setSmsTemplate, setEmailFallback, setGeoPermissions, segmentsOf, renderSms } from '../public/apps/emailops/sms.js';
import { setProvider, ensureTxn } from '../public/apps/emailops/model.js';

const TIERS = ['stellar', 'good', 'average', 'mediocre'];

function world(seed = 3, { accounts = 0, engineers = 0 } = {}) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 500000, counterparty: 'Pat', category: 'owner_contribution' });
  for (let i = 0; i < accounts; i++) s.stripe.subscriptions.push({ id: `sub${i}`, customerId: `c${i}`, status: 'active', price: 49, interval: 'month', startDay: -30 });
  s.apps.people = { members: Array.from({ length: engineers }, (_, i) => ({ id: `e${i}`, status: 'active', kind: 'human', role: 'engineer', startDay: 0 })) };
  return s;
}
const spent = (s) => -s.bank.txns.filter((t) => t.amount < 0 && t.category !== 'owner_contribution').reduce((a, t) => a + t.amount, 0);
// Run the infra ticks for n days; the founder's week resets every 7 days like the clock does.
function run(s, days, { busy = false } = {}) {
  let hours = 0;
  for (let d = 0; d < days; d++) {
    s.day++;
    if (s.day % 7 === 0) { hours += s.founder.hoursUsed; s.founder.hoursUsed = busy ? s.founder.hoursPerWeek : 0; }
    obsDay(s); hostingDay(s); smsTick(s);
    if (s.day % 30 === 0) hostingMonthEnd(s);
  }
  return hours + s.founder.hoursUsed;
}

// ---------------- Hosting: pricing shapes ----------------

test('hosting: each platform has its own cost curve', () => {
  const at = (id, a, extra = {}) => hostBill(id, { accounts: a, seats: 1, ...extra }).total;
  assert.equal(at('vercel', 0, { seats: 3 }), 60, 'Vercel bills per deploying seat');
  assert.ok(at('vercel', 5000) > at('railway', 5000) && at('vercel', 5000) > 1000, 'serverless backend usage grows faster than linear');
  assert.equal(at('render', 10, { size: 'standard' }), at('render', 250, { size: 'standard' }), 'Render is a fixed instance price');
  assert.ok(at('railway', 1000) > at('railway', 0) * 4, 'Railway tracks load');
  assert.ok(at('porter', 0) >= 200, 'Porter + EKS has a cost floor');
  assert.ok(hostBill('porter', { accounts: 0 }).cloud > hostBill('porter', { accounts: 0 }).platform, 'most of Porter\'s bill is your own (credit-eligible) AWS');
  assert.ok(at('aws', 5000) < at('railway', 5000) && at('aws', 5000) < at('vercel', 5000), 'raw AWS is cheapest at scale');
  assert.ok(HOSTS.aws.setupH >= 30 && HOSTS.aws.opsH >= HOSTS.railway.opsH * 4, 'raw AWS costs ops hours');
});

test('hosting: Heroku is retired for new projects; SendGrid too for transactional email', () => {
  const s = world();
  assert.ok(!HOST_IDS.includes('heroku'));
  const r = chooseHost(s, 'heroku');
  assert.equal(r.ok, false); assert.match(r.error, /2022/);
  const t = setProvider(s, 'sendgrid');
  assert.equal(t.ok, false); assert.match(t.error, /May 2025/);
  assert.equal(ensureTxn(s).provider, null);
});

test('hosting: Porter and AWS bill the cloud part to AWS so AWS credits can pay it; leaving the default stack stops the Vercel row', () => {
  const s = world(3, { accounts: 50 });
  assert.equal(effectivePlatform(s), 'vercel', 'the default stack is Vercel');
  assert.ok(chooseHost(s, 'porter').ok);
  assert.equal(s.recurring.find((r) => r.vendor === 'Vercel').active, false);
  s.day = 30; hostingMonthEnd(s);
  const aws = s.bank.txns.filter((t) => t.counterparty === 'AWS');
  assert.ok(aws.length === 1 && aws[0].meta.provider === 'aws' && aws[0].category === 'hosting');
  assert.ok(s.bank.txns.some((t) => t.counterparty === 'Porter'));
});

test('hosting: migration hours grow with time on a platform, cutover month is double-billed', () => {
  const s = world(3, { accounts: 100 });
  chooseHost(s, 'railway');
  const early = migrationHours(s, 'render');
  s.day += 360;
  const late = migrationHours(s, 'render');
  assert.ok(late > early * 1.4, `${early} -> ${late}`);
  const before = spent(s);
  const r = chooseHost(s, 'render', { staged: true });
  assert.ok(r.ok && r.usd > 0 && spent(s) - before >= r.usd);
});

test('hosting: Vercel with no spend cap pays usage spikes; a cap turns them into a short pause', () => {
  const totals = (cap) => {
    let usd = 0;
    for (const seed of [1, 2, 3]) {
      const s = world(seed, { accounts: 400 });
      chooseHost(s, 'vercel'); if (cap) setSpendCap(s, true);
      const b = spent(s); run(s, 720); usd += spent(s) - b;
    }
    return usd;
  };
  const noCap = totals(false), cap = totals(true);
  assert.ok(noCap > cap + 300, `no cap ${noCap} vs cap ${cap}`);
});

test('hosting: raw AWS with no founder hours left builds ops debt and more outages than a PaaS', () => {
  let aws = 0, railway = 0, awsHours = 0, rwHours = 0;
  for (const seed of [1, 2, 3]) {
    const a = world(seed, { accounts: 200 }); chooseHost(a, 'aws'); a.founder.hoursUsed = a.founder.hoursPerWeek;
    awsHours += run(a, 365, { busy: false });
    aws += hostingSlice(productSlice(a)).incidents;
    const b = world(seed, { accounts: 200 }); chooseHost(b, 'railway');
    rwHours += run(b, 365);
    railway += hostingSlice(productSlice(b)).incidents;
    const c = world(seed, { accounts: 200 }); chooseHost(c, 'aws'); run(c, 365, { busy: true });
    aws += hostingSlice(productSlice(c)).incidents;
    assert.ok(hostingSlice(productSlice(c)).opsDebt > 0, 'skipped upkeep accrues');
  }
  assert.ok(awsHours > rwHours * 4, `ops hours aws ${awsHours} vs railway ${rwHours}`);
  assert.ok(aws > railway, `incidents aws ${aws} vs railway ${railway}`);
});

// ---------------- Observability ----------------

test('observability: no source maps makes fixes slower; LogRocket is strong on UI bugs only; Seer bills per contributor', () => {
  const s = world(3, { engineers: 2 });
  const rel = releasesSlice(productSlice(s));
  chooseObs(s, 'sentry');
  const f = { id: 'f1', title: 'Export' };
  const bad = deploy(rel, f, { day: 1, cfr: 1, rand: () => 0.9 }).error;
  uploadSourcemaps(s);
  const good = deploy(rel, f, { day: 1, cfr: 1, rand: () => 0.9 }).error;
  assert.ok(bad.fixHours > good.fixHours * 1.7, `${bad.fixHours} vs ${good.fixHours}`);
  // Seer: $40 x (founder + 2 engineers), only useful with source maps
  assert.ok(enableSeer(s).ok);
  assert.equal(seerMonthly(s), 120);
  assert.equal(s.recurring.find((r) => r.vendor === 'Sentry Seer').amount, 120);
  assert.ok(seerUsable(rel));
  rel.flags.sourcemaps = false; assert.ok(!seerUsable(rel));
  const lr = { obs: 'logrocket', flags: { sourcemaps: true } };
  assert.ok(fixMultFor(lr, { title: 'Hydration mismatch on the x page' }) < 1 && fixMultFor(lr, { title: '500 on POST /api/x' }) > 1.3);
  assert.ok(resolveWithFix(rel, good.id).ok);
});

test('observability: Datadog before Series A is logged as overkill and surprise-bills without usage controls', () => {
  const surprises = (controls) => {
    let n = 0;
    for (const seed of [1, 2, 3, 4]) { const s = world(seed, { accounts: 60 }); chooseObs(s, 'datadog'); if (controls) setDatadogControls(s); run(s, 360); n += obsSlice(s).surprises; if (!controls) assert.ok(s.mistakes.some((m) => m.id === 'datadog_overkill')); }
    return n;
  };
  assert.ok(surprises(false) > surprises(true), 'usage controls cut surprise invoices');
  const s = world(3); chooseObs(s, 'betterstack');
  assert.ok(s.apps.insights.flags.paging && s.apps.insights.flags.statusPage, 'Better Stack brings uptime paging and a status page');
});

test('observability: old saves with the generic Sentry-style monitoring keep working with source maps on', () => {
  const s = world();
  const rel = releasesSlice(productSlice(s));
  rel.flags.monitoring = true; delete rel.obs; delete rel.flags.sourcemaps;
  const r2 = releasesSlice(productSlice(s));
  assert.equal(r2.obs, 'sentry'); assert.equal(r2.flags.sourcemaps, true);
  assert.equal(obsSlice(s).vendor, 'sentry');
});

// ---------------- SMS ----------------

const signups = (s, n) => { for (let i = 0; i < n; i++) s.stripe.subscriptions.push({ id: `n${s.day}_${i}`, customerId: `nc${s.day}_${i}`, status: 'trialing', price: 49, interval: 'month', startDay: s.day }); };

test('sms: unregistered 10DLC traffic is blocked and loses signups; registration delivers', () => {
  const s = world(3, { accounts: 20 });
  setSmsProvider(s, 'twilio');
  s.day++; signups(s, 5);
  const r = smsTick(s);
  assert.ok(r.lossShare >= 0.5, 'codes never arrive');
  assert.ok(s.apps.lifecycle.txn.loss >= 0.5);
  assert.ok(s.mistakes.some((m) => m.id === 'sms_unregistered_blocked'));
  setEmailFallback(s, true);
  s.day++; signups(s, 5);
  assert.ok(smsTick(s).lossShare < 0.2, 'an email fallback saves most signups');
  submitRegistration(s, { optIn: true, privacy: true, samples: true });
  const S = smsSlice(s);
  while (S.reg.status === 'pending') { s.day++; smsTick(s); }
  if (S.reg.status === 'rejected') { submitRegistration(s, { optIn: true, privacy: true, samples: true }); while (S.reg.status === 'pending') { s.day++; smsTick(s); } }
  assert.equal(S.reg.status, 'approved');
  s.day++; signups(s, 5);
  assert.equal(smsTick(s).lossShare, 0);
  assert.equal(s.apps.lifecycle.txn, null, 'back to the email-only path once registered');
  assert.ok(S.stats.sent > 0);
});

test('sms: Unicode and long templates multiply segments; incomplete registrations are rejected more often', () => {
  const s = world();
  assert.equal(segmentsOf('Your code is 123456').segments, 1);
  assert.equal(segmentsOf(`Your code is 123456 ${'x'.repeat(60)} 🎉`).segments, 2, 'one emoji: 70-char segments');
  assert.equal(segmentsOf('a'.repeat(161)).segments, 2);
  setSmsTemplate(s, '{{brand}} code {{code}} 🔐');
  assert.equal(segmentsOf(renderSms(s, smsSlice(s).template)).gsm, false);
  const rejects = (items) => {
    let n = 0;
    for (let seed = 1; seed <= 12; seed++) { const w = world(seed); setSmsProvider(w, 'twilio'); submitRegistration(w, items); const S = smsSlice(w); while (S.reg.status === 'pending') { w.day++; smsTick(w); } n += S.reg.status === 'rejected' ? 1 : 0; }
    return n;
  };
  assert.ok(rejects({}) > rejects({ optIn: true, privacy: true, samples: true }));
});

// ---------------- Operator tiers ----------------

function archetype(tier, seed = 3) {
  const s = world(seed, { accounts: 40 });
  if (tier === 'stellar') { chooseHost(s, 'railway'); chooseObs(s, 'sentry'); uploadSourcemaps(s); s.apps.insights = { flags: { paging: true, statusPage: true } }; setSmsProvider(s, 'twilio'); setEmailFallback(s, true); setGeoPermissions(s, true); submitRegistration(s, { optIn: true, privacy: true, samples: true }); }
  if (tier === 'good') { chooseHost(s, 'render'); chooseObs(s, 'sentry'); uploadSourcemaps(s); s.apps.insights = { flags: { paging: true } }; }
  if (tier === 'average') { chooseHost(s, 'vercel'); chooseObs(s, 'sentry'); }
  if (tier === 'mediocre') { chooseHost(s, 'aws'); chooseObs(s, 'datadog'); setSmsProvider(s, 'twilio'); }
  return s;
}

test('infra_ops: tiers separate on the read and on outcomes (hours, money, incidents, lost signups)', () => {
  assert.equal(readOperator(world(), 'infra_ops').tier, 'unknown', 'unknown before the player acts');
  const reads = TIERS.map((t) => readOperator(archetype(t), 'infra_ops'));
  reads.forEach((r, i) => assert.equal(r.tier, TIERS[i], `${TIERS[i]} reads ${r.tier} (${r.score}; ${r.evidence.join(' | ')})`));
  for (let i = 1; i < 4; i++) assert.ok(reads[i - 1].score > reads[i].score);
  assert.ok(reads[3].coaching.some((c) => /stellar operator/.test(c)), 'mediocre gets the stellar playbook');
  // Outcomes over half a year, three seeds: the mediocre setup costs more hours, money and outages.
  const out = Object.fromEntries(['stellar', 'mediocre'].map((t) => [t, [1, 2, 3].reduce((acc, seed) => {
    const s = archetype(t, seed); const b = spent(s);
    const hours = run(s, 180) ;
    for (let d = 0; d < 10; d++) { s.day++; signups(s, 2); smsTick(s); }
    return { hours: acc.hours + hours, usd: acc.usd + spent(s) - b, inc: acc.inc + hostingSlice(productSlice(s)).incidents, lost: acc.lost + (smsSlice(s).stats.lostSignups ?? 0) };
  }, { hours: 0, usd: 0, inc: 0, lost: 0 })]));
  assert.ok(out.mediocre.hours > out.stellar.hours * 3, `hours ${out.mediocre.hours} vs ${out.stellar.hours}`);
  assert.ok(out.mediocre.usd > out.stellar.usd, `usd ${out.mediocre.usd} vs ${out.stellar.usd}`);
  assert.ok(out.mediocre.lost > out.stellar.lost, `lost signups ${out.mediocre.lost} vs ${out.stellar.lost}`);
});
