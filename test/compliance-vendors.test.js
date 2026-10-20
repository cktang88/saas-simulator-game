// SOC 2 vendor paradigms (legal/compliance.js): Vanta vs Drata (SafeBase trust center) vs Secureframe (experts,
// per-framework fee) vs Oneleet (pentest + vCISO + partner auditor), the retired Delve and the templated-report trap
// wired into core/integrity.js. Short targeted tests. Research: docs/research/tools/2026q4/support-people-compliance.md §4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ensureIntegrity } from '../public/core/integrity.js';
import { readOperator, TIER_RANK } from '../public/core/operator.js';
import peopleApp from '../public/apps/people.js';
import legalApp from '../public/apps/legal.js';
import { ensureLegal, incorporate } from '../public/apps/legal/sim.js';
import { hasSoc2, upsertCompany, ensureDeal } from '../public/apps/sales/model.js';
import { addAsk } from '../public/apps/success/engine.js';
import {
  ensureCompliance, PLATFORMS, AUDITORS, TESTS, choosePlatform, connectIntegration, fixTest, generatePolicies, approvePolicies, chooseAuditor,
  startSoc2, publishTrustCenter, deflectQuestionnaire, questionnaireInbox, addFramework, exposeTemplated, complianceVendorScore, ACTIVE_PLATFORMS,
} from '../public/apps/legal/compliance.js';
import { soc2View } from '../public/apps/legal/views-compliance.js';

const APPS = [peopleApp, legalApp];

function fresh(seed = 3, { sub = true } = {}) {
  const s = newState({ companyName: 'Acme', model: 'ent', path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 600000, counterparty: 'Pat', category: 'owner_contribution' });
  s.founder.hoursPerWeek = 70;
  incorporate(s, { provider: 'atlas', operatingState: 'DE' });
  advance(s, 3, APPS);
  s.apps.people.payrollSetup.gusto = true;
  if (sub) {
    const c = createCustomer(s, { name: 'Big Co', email: 'cto@big.co', company: 'Big Co', country: 'US' });
    const sb = subscribe(s, c.id, { id: 'p', price: 60000, interval: 'year', trialDays: 0 }, { invoiceManually: true });
    addAsk(s, { kind: 'security_questionnaire', target: 'account', refId: sb.id, companyId: null, dueDay: s.day + 30 });
  }
  return s;
}
function strictDeal(s, { amount = 80000, checked = false } = {}) {
  const co = upsertCompany(s, { name: `Bank ${s.day}`, domain: `bank${s.day}.com` });
  const d = ensureDeal(s, { companyId: co.id, stage: 'proposal' });
  d.amount = amount;
  d.paperwork = [{ id: 'soc2_type1', label: 'SOC 2 Type I report', status: 'open', hours: 1, progress: 0 }];
  if (checked) d.secClaimsChecked = true;
  return d;
}
const mistakes = (s, id) => (s.mistakes ?? []).filter((x) => x.id === id);

test('Delve is retired with a dated note; the live catalogue has five vendors including the trap', () => {
  const s = fresh();
  assert.throws(() => choosePlatform(s, 'delve'), /not available.*YC cut ties/);
  assert.deepEqual(ACTIVE_PLATFORMS, ['vanta', 'drata', 'secureframe', 'oneleet', 'templated']);
  assert.ok(PLATFORMS.drata.trustCenter.deflect > PLATFORMS.vanta.trustCenter.deflect, 'Drata owns SafeBase');
  assert.equal(PLATFORMS.secureframe.frameworkFee, 7500);
});

test('templated shop: a clean "report" in ~3 weeks with nothing fixed, recorded as a latent false claim', () => {
  const s = fresh();
  choosePlatform(s, 'templated');
  const c = ensureCompliance(s);
  assert.equal(c.auditor, 'sham');
  startSoc2(s, 'type1');
  const L = ensureLegal(s);
  const t0 = s.day;
  for (let d = 0; d < 40 && L.soc2 === 'type1_in_progress'; d++) advance(s, 1, APPS);
  assert.equal(L.soc2, 'type1');
  assert.ok(s.day - t0 <= 30, `report in ${s.day - t0} days`);
  assert.equal(L.soc2Report.opinion, 'clean');
  assert.ok(L.soc2Report.templated);
  assert.ok(hasSoc2(s), 'it passes a light check');
  const claim = ensureIntegrity(s).claims.find((x) => x.id === c.templated.claimId);
  assert.equal(claim.truth, false);
  assert.equal(claim.status, 'open');
});

test('a strict security review exposes the templated report; the cost is traceable (deals, re-audit, reputation)', () => {
  let exposed = 0, light = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = fresh(seed);
    choosePlatform(s, 'templated');
    startSoc2(s, 'type1');
    advance(s, 25, APPS);
    const d = strictDeal(s, { checked: true });
    advance(s, 2, APPS);
    if (ensureCompliance(s).templated.exposed) {
      exposed++;
      const L = ensureLegal(s);
      assert.equal(L.soc2, 'none');
      assert.equal(d.stage, 'lost');
      const m = mistakes(s, 'soc2_templated_report')[0];
      assert.ok(m && m.cost.usd >= AUDITORS.established.type1, 'a real re-audit is the bill');
      assert.ok(ensureIntegrity(s).reputation.customer > 0, 'buyers talk');
    }
    const t = fresh(seed + 20);
    choosePlatform(t, 'templated');
    startSoc2(t, 'type1');
    advance(t, 25, APPS);
    strictDeal(t, { amount: 5000, checked: true }).segmentId = 'smb';
    advance(t, 2, APPS);
    if (ensureCompliance(t).templated.exposed) light++;
  }
  assert.ok(exposed >= 3, `strict reviews caught ${exposed}/8`);
  assert.ok(exposed > light, `strict ${exposed} vs light ${light}`);
});

test('exposure voids the report, kills open SOC 2 deals and forces a restart', () => {
  const s = fresh();
  choosePlatform(s, 'templated');
  startSoc2(s, 'type1');
  advance(s, 25, APPS);
  const d = strictDeal(s);
  exposeTemplated(s, 'Test');
  const c = ensureCompliance(s);
  assert.equal(c.platform, null);
  assert.ok(c.reports.at(-1).invalid != null);
  assert.equal(d.stage, 'lost');
  assert.equal(complianceVendorScore(s).score, 0);
  choosePlatform(s, 'vanta'); // a real programme starts over
});

test('Oneleet: bundled partner auditor and pentest, slower onboarding, thinner integrations, faster fixes', () => {
  const s = fresh();
  choosePlatform(s, 'oneleet');
  const c = ensureCompliance(s);
  assert.equal(chooseAuditor(s, 'boutique'), 'partner', 'the bundle auditor runs the audit');
  assert.throws(() => connectIntegration(s, 'cloud'), /onboarding/);
  advance(s, 15, APPS);
  assert.throws(() => connectIntegration(s, 'hris'), /no HRIS/);
  let r = connectIntegration(s, 'cloud'); if (r.status === 'error') connectIntegration(s, 'cloud');
  advance(s, 16, APPS);
  assert.ok(c.actions.pentest != null, 'pentest ran inside the bundle');
  assert.ok(!s.bank.txns.some((t) => /Penetration test/.test(t.description)), 'no separate pentest bill');
  const fail = Object.entries(c.tests).find(([id, t]) => t.status === 'fail' && !TESTS[id].external && !TESTS[id].scopeOut);
  if (fail) assert.ok(fixTest(s, fail[0]).hours < TESTS[fail[0]].fixHours, 'vCISO guidance');
  generatePolicies(s, 'ai');
  assert.ok(!c.commitments.soc247 && !c.commitments.daily_logs, 'vCISO-sized policies, no overcommitments');
});

test('trust center deflection: Drata (SafeBase) self-serves more questionnaires than Vanta', () => {
  const rate = (platform) => {
    let ok = 0, n = 0;
    for (const seed of [1, 2, 3, 4]) {
      const s = fresh(seed, { sub: false });
      choosePlatform(s, platform);
      generatePolicies(s, 'template'); approvePolicies(s);
      publishTrustCenter(s);
      for (let i = 0; i < 40; i++) {
        const c = createCustomer(s, { name: `C${i}`, email: `a${i}@c${i}.com`, company: `C${i}`, country: 'US' });
        const sb = subscribe(s, c.id, { id: 'p', price: 12000, interval: 'year', trialDays: 0 }, { invoiceManually: true });
        addAsk(s, { kind: 'security_questionnaire', target: 'account', refId: sb.id, companyId: null, dueDay: s.day + 30 });
      }
      for (const q of questionnaireInbox(s)) { n++; if (deflectQuestionnaire(s, q.sourceKey).deflected) ok++; }
    }
    return ok / n;
  };
  const d = rate('drata'), v = rate('vanta');
  assert.ok(d > v, `Drata ${d} vs Vanta ${v}`);
});

test('Secureframe: visible per-framework fee; a framework no buyer asked for is a traceable mistake', () => {
  const s = fresh();
  choosePlatform(s, 'secureframe');
  const r = addFramework(s, 'iso27001');
  assert.equal(r.usd, 7500);
  assert.equal(mistakes(s, 'framework_unneeded').length, 1);
  generatePolicies(s, 'ai');
  assert.ok(!ensureCompliance(s).commitments.soc247, 'expert review: no 24/7 SOC promise');
  const o = fresh(4);
  choosePlatform(o, 'oneleet');
  assert.throws(() => addFramework(o, 'hipaa'), /one framework at a time/);
});

test('operator tiers separate on compliance vendor choice (fit, timing, the trap)', () => {
  const run = (tier, seed) => {
    const s = fresh(seed, { sub: tier !== 'average' });
    if (tier === 'stellar') { strictDeal(s); choosePlatform(s, 'oneleet'); }
    if (tier === 'good') choosePlatform(s, 'vanta');
    if (tier === 'average') choosePlatform(s, 'vanta'); // bought with no buyer asking
    if (tier === 'mediocre') { choosePlatform(s, 'templated'); startSoc2(s, 'type1'); advance(s, 25, APPS); exposeTemplated(s, 'A strict review'); }
    return { s, v: complianceVendorScore(s), rank: TIER_RANK[readOperator(s, 'legal_hygiene').tier] };
  };
  for (const seed of [2, 5]) {
    const r = Object.fromEntries(['stellar', 'good', 'average', 'mediocre'].map((t) => [t, run(t, seed)]));
    assert.ok(r.stellar.v.score > r.good.v.score && r.good.v.score > r.average.v.score && r.average.v.score > r.mediocre.v.score,
      Object.entries(r).map(([k, x]) => `${k} ${x.v.score}`).join(', '));
    assert.ok(r.stellar.rank >= r.good.rank && r.good.rank >= r.average.rank && r.average.rank > r.mediocre.rank,
      Object.entries(r).map(([k, x]) => `${k} ${x.rank}`).join(', '));
    assert.ok(r.mediocre.v.coaching.some((c) => /stellar operator/.test(c)));
  }
});

test('SOC 2 view renders for each live vendor', () => {
  for (const k of ACTIVE_PLATFORMS) {
    const s = fresh();
    choosePlatform(s, k);
    assert.ok(String(soc2View(s, ensureLegal(s))).length > 100);
  }
});
