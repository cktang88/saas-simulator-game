// Wave-2 money/legal regressions: Delaware APVC issued shares, missed-83(b) per-share value, the R&D payroll-tax
// credit (Form 8974), SOC 2 platform renewal pricing, advisor signing guards, calendar-year vendor terms and the
// fundraising runway cache. Offline, short, no multi-year sims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { dateOf } from '../public/core/util.js';
import { APPS } from '../public/apps/registry.js';
import { buildCalendar, franchiseAPVC, delawareShares, dayFor } from '../public/apps/legal/deadlines.js';
import { incorporate, signFounderDocs, payFranchiseTax, ensureLegal, legalDay } from '../public/apps/legal/sim.js';
import { ensureCompliance, complianceDay } from '../public/apps/legal/compliance.js';
import { ensureFr } from '../public/apps/fundraising/sim.js';
import { generateAdvisors, signAdvisor, ensureIr } from '../public/apps/fundraising/ir.js';
import { currentRunway } from '../public/apps/fundraising/process.js';
import { fdShares } from '../public/apps/fundraising/captable.js';
import * as BO from '../public/apps/money/backoffice.js';
import { fileWithCpa } from '../public/apps/money/compliance.js';
import { yearOf, addYearsDay } from '../public/apps/money/common.js';

const LEGAL_APPS = APPS.filter((a) => a.id === 'legal');

function fresh(seed = 3) {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  return s;
}
function ccorp() {
  const s = fresh();
  incorporate(s, { provider: 'atlas', operatingState: 'DE' });
  advance(s, 3, LEGAL_APPS);
  ensureLegal(s).incorporation.effectiveDay = -400;
  return s;
}

test('Delaware APVC counts investor preferred and other common, not just founder stock', () => {
  const s = ccorp();
  signFounderDocs(s, {});
  const key = `de-franchise-${yearOf(s, 0)}`;
  assert.ok(buildCalendar(s).find((i) => i.key === key));
  const year = yearOf(s, 0) - 1, yearEnd = dayFor(s, `${year}-12-31`);
  const fr = ensureFr(s);
  fr.cap.common.push({ id: 'acc', name: 'Accelerator', shares: 100_000, note: 'Common (accelerator)' });
  fr.cap.preferred.push({ id: 'p1', series: 'Seed', holder: 'VC', shares: 3_000_000, invested: 2e6, price: 0.67, day: yearEnd - 10 });
  fr.cap.preferred.push({ id: 'p2', series: 'A', holder: 'VC2', shares: 5_000_000, invested: 1e7, price: 2, day: yearEnd + 30 }); // after Dec 31
  const sh = delawareShares(s, year);
  assert.equal(sh.issued, 13_100_000);
  assert.ok(sh.authorized >= sh.issued, 'charter authorizes at least the issued shares');
  s.metrics.daily.push({ day: yearEnd, cash: 20_000_000, stripeBalance: 0 });
  assert.throws(() => payFranchiseTax(s, key, { method: 'apvc', grossAssets: 20_000_000, issuedShares: 10_000_000 }), /preferred/);
  const paid = payFranchiseTax(s, key, { method: 'apvc', grossAssets: 20_000_000, issuedShares: 13_100_000 });
  assert.equal(paid.tax, franchiseAPVC({ grossAssets: 20_000_000, issuedShares: 13_100_000, authorized: sh.authorized }));
  assert.notEqual(paid.tax, franchiseAPVC({ grossAssets: 20_000_000, issuedShares: 10_000_000, authorized: 12_000_000 }));
});

test('missed 83(b): fallback per-share value is post-money / fully diluted shares, not authorized', () => {
  const s = ccorp();
  signFounderDocs(s, {});
  const L = ensureLegal(s);
  L.founderStock.missed = true;
  L.founderStock.grantDay = s.day - 390; // past the cliff, on a 30-day vesting tick
  const fr = ensureFr(s);
  fr.cap.preferred.push({ id: 'p1', series: 'Seed', holder: 'VC', shares: 3_000_000, invested: 3e6, price: 1, day: s.day });
  fr.lastPostMoney = 13_000_000;
  legalDay(s);
  const t = L.personalTax.at(-1);
  assert.ok(t, 'a vesting tax event was recorded');
  assert.ok(Math.abs(t.fmv - 13_000_000 / fdShares(fr.cap)) < 1e-9, `fmv ${t.fmv}`);
  assert.ok(Math.abs(t.fmv - 1) < 1e-9);
});

test('R&D credit offsets employer FICA from the quarter after filing; no cash at filing; EOR payroll excluded', () => {
  const s = fresh(9);
  incorporate(s, { provider: 'atlas', operatingState: 'DE' });
  advance(s, 3, LEGAL_APPS);
  s.company.entity = 'ccorp';
  BO.setTaxService(s, 'fondo');
  const year = yearOf(s);
  for (let m = 0; m < 2; m++) {
    post(s, { amount: -20000, counterparty: 'Gusto', category: 'payroll', method: 'payroll' });
    post(s, { amount: -2000, counterparty: 'Gusto', category: 'payroll_tax', method: 'payroll' });
    s.day += 25;
  }
  BO.backofficeDay(s);
  const usable = BO.rdCredit(s, year).usable;
  assert.ok(usable > 0);
  const n0 = s.bank.txns.length;
  fileWithCpa(s, year);
  assert.ok(!s.bank.txns.slice(n0).some((t) => t.amount > 0 && /R&D/.test(t.description)), 'no cash refund at filing');
  assert.equal(BO.rdCreditBalance(s), usable);
  const b = BO.ensureBackoffice(s);
  const from = b.rdCredits[0].fromDay;
  assert.equal(dateOf(s, from).getUTCDate(), 1);
  assert.equal(dateOf(s, from).getUTCMonth() % 3, 0, 'first day of a calendar quarter');
  const credits = () => s.bank.txns.filter((t) => t.meta?.rdCreditApplied);
  // Same quarter as filing: nothing applied.
  s.day = from - 1;
  post(s, { amount: -20000, counterparty: 'Gusto', category: 'payroll', method: 'payroll' });
  BO.backofficeDay(s);
  assert.equal(credits().length, 0);
  // Next quarter: up to 7.65% of US wages, posted as a payroll_tax reduction.
  s.day = from;
  post(s, { amount: -20000, counterparty: 'Deel', category: 'payroll', method: 'payroll', meta: { app: 'people', eor: true } });
  post(s, { amount: -10000, counterparty: 'Gusto', category: 'payroll', method: 'payroll' });
  BO.backofficeDay(s);
  const c = credits();
  assert.equal(c.length, 1);
  assert.equal(c[0].category, 'payroll_tax');
  assert.equal(c[0].amount, Math.min(usable, 765));
  assert.equal(BO.rdCreditBalance(s), Math.round((usable - c[0].amount) * 100) / 100);
});

test('SOC 2 platform renews at the escalated price in year two and stays flat after', () => {
  const s = ccorp();
  const c = ensureCompliance(s);
  Object.assign(c, { platform: 'vanta', platformDay: s.day - 365, renewals: 0 });
  const renewals = () => s.bank.txns.filter((t) => /Vanta renewal/.test(t.description)).map((t) => -t.amount);
  complianceDay(s);
  s.day += 365;
  complianceDay(s);
  assert.deepEqual(renewals(), [14000, 14000]);
});

test('signAdvisor refuses during the trial and a second signature (no second share block)', () => {
  const s = fresh();
  s.company.entity = 'ccorp';
  const a = generateAdvisors(s, 1)[0];
  ensureIr(s).advisors.push({ ...a, status: 'trial', startDay: 0, trialEnds: 30 });
  const adv = ensureIr(s).advisors.at(-1);
  assert.throws(() => signAdvisor(s, adv, { pct: 0.5, cliffMonths: 0 }), /trial/);
  adv.status = 'trial_done';
  signAdvisor(s, adv, { pct: 0.5, cliffMonths: 0 });
  assert.throws(() => signAdvisor(s, adv, { pct: 0.5, cliffMonths: 0 }), /already/);
  assert.equal(ensureFr(s).cap.common.filter((x) => x.id === `adv_${adv.id}`).length, 1);
});

test('vendor contract terms run in calendar years (no drift across Feb 29)', () => {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed: 1 });
  const iso = (d) => dateOf(s, d).toISOString().slice(0, 10);
  const leap = dayFor(s, '2028-02-29');
  assert.equal(iso(addYearsDay(s, leap, 1)), '2029-02-28');
  assert.equal(iso(addYearsDay(s, dayFor(s, '2027-03-01'), 1)), '2028-03-01');
  assert.equal(iso(addYearsDay(s, dayFor(s, '2027-06-15'), 3)), '2030-06-15');
  const src = readFileSync(new URL('../public/apps/money/spend.js', import.meta.url), 'utf8');
  assert.ok(!/365 \* term/.test(src), 'spend.js term ends use calendar years');
});

test('fundraising runway cache refreshes when a wire lands the same day', () => {
  const s = fresh();
  ensureFr(s);
  post(s, { amount: -30000, counterparty: 'AWS', category: 'hosting', method: 'card' });
  const before = currentRunway(s);
  post(s, { amount: 2_000_000, counterparty: 'Seed VC', category: 'investment', method: 'wire' });
  const after = currentRunway(s);
  assert.ok(after > before || (after === Infinity && before !== Infinity), `${before} -> ${after}`);
});
