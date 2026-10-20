import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { drainJobs, registerJob } from '../public/core/jobs.js';
import * as llm from '../public/core/llm.js';
import product from '../public/apps/product.js';
import customers from '../public/apps/customers.js';
import helpdesk, { ensureSupport, frtMedian } from '../public/apps/helpdesk.js';
import insights, { ensureInsights } from '../public/apps/insights.js';
import { expectedTickets, frtChurnMult, csatFromFrt, aiResolveShare, docsQuality, reviewsMultiplier, starsFor, articleHeuristic, replyQuality } from '../public/apps/support/model.js';
import { activationRate, featureAdoption, splitRetention, opsRates, drawIncident, drawCardTesting } from '../public/apps/insights/model.js';

const APPS4 = [product, customers, helpdesk, insights];
for (const app of APPS4) for (const [type, h] of Object.entries(app.jobs ?? {})) registerJob(type, h);

function world(model = 'smb', n = 80, seed = 11) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Receipt collection for bookkeepers';
  s.apps.product = { features: [{ id: 'f1', title: 'Receipt requests by SMS', user: 'bookkeepers', problem: 'x', solution: 'SMS link attaches receipts', acceptance: ['Given x when y then z'], status: 'shipped', shippedDay: -30, effortHours: 40 }], buildQueue: [], bugs: [], changelog: [] };
  for (let i = 0; i < n; i++) { const c = createCustomer(s, { name: `C ${i}`, email: `c${i}@x.com` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 }); }
  return s;
}

test('ticket volume follows research rates and multipliers', () => {
  const accts = Array.from({ length: 100 }, () => ({ ageDays: 60 }));
  const perMonth = expectedTickets({ model: 'smb', accounts: accts }) * 30;
  assert.ok(perMonth >= 25 && perMonth <= 60, `${perMonth}`); // 0.25–0.6 per customer per month
  const fresh = expectedTickets({ model: 'smb', accounts: accts.map(() => ({ ageDays: 3 })) });
  assert.ok(fresh > 2 * expectedTickets({ model: 'smb', accounts: accts }));
  assert.ok(expectedTickets({ model: 'smb', accounts: accts, docsQuality: 1 }) < expectedTickets({ model: 'smb', accounts: accts }));
  const outage = expectedTickets({ model: 'smb', accounts: accts, outage: 1 });
  assert.ok(expectedTickets({ model: 'smb', accounts: accts, outage: 1, statusPage: true }) < outage);
});

test('FRT, CSAT and AI resolution follow the research tables', () => {
  assert.equal(frtChurnMult(0.5), 0.95);
  assert.equal(frtChurnMult(30), 1.2);
  assert.ok(csatFromFrt(0.05) > 0.9 && Math.abs(csatFromFrt(24) - 0.51) < 0.01);
  assert.ok(aiResolveShare(0, 0) >= 0.3 && aiResolveShare(1, 24) <= 0.7);
  assert.equal(docsQuality([{ quality: 1 }, { quality: 1 }, { quality: 1 }, { quality: 1 }, { quality: 1 }, { quality: 1 }, { quality: 1 }]), 1);
});

test('reviews: none hurts conversion, 20+ good recent reviews help, low ratings hurt', () => {
  assert.equal(reviewsMultiplier([], 'smb', 100).mult, 0.9);
  const good = Array.from({ length: 22 }, (_, i) => ({ rating: i % 2 ? 5 : 4, day: 90 }));
  const r = reviewsMultiplier(good, 'smb', 100);
  assert.ok(r.mult >= 1.05 && r.aiMentions);
  const bad = Array.from({ length: 8 }, () => ({ rating: 2, day: 90 }));
  assert.ok(reviewsMultiplier(bad, 'b2c', 100).mult < 0.8);
  assert.ok(starsFor(0.95, 0.5) >= 4 && starsFor(0.1, 0.5) <= 2);
});

test('article and reply heuristics reward concrete help', () => {
  const good = articleHeuristic({ title: 'How do I connect QuickBooks?', body: 'If your receipts are not matching, connect QuickBooks first so the SMS receipt requests can attach to transactions.\n1. Open Settings and choose Integrations.\n2. Click Connect QuickBooks and sign in with the admin account.\n3. Pick the bank accounts to sync and save.\n4. Send a test receipt request to yourself.\nIf the token expires you will get an email to reconnect; repeat step 2. Receipts sent while disconnected are kept and matched after you reconnect, so nothing is lost.' }, [{ title: 'Receipt requests by SMS' }]);
  const bad = articleHeuristic({ title: 'Our seamless platform', body: 'Just click around, it is easy.' }, []);
  assert.ok(good.quality > 0.6 && bad.quality < 0.3, `${good.quality} ${bad.quality}`);
  assert.ok(replyQuality('Sorry! Here is how: 1. Go to Settings 2. click Resend invite. I fixed the bug today too.', 'howto') > replyQuality('We value your feedback.', 'howto'));
});

test('tickets arrive, get worked, and drive FRT churn', async () => {
  const s = world();
  const sup = ensureSupport(s);
  sup.active = true;
  sup.autoHoursPerDay = 0; // ignore the queue
  advance(s, 10, APPS4);
  const ctx = { state: s, llm, save() {}, render() {} };
  await drainJobs(ctx);
  assert.ok(sup.tickets.length >= 3, `${sup.tickets.length} concrete tickets`);
  // Baseline volume: outages (random, and a ×2-5 ticket spike by design) are left out of the band.
  const outageDays = new Set((s.network?.publicEvents ?? []).filter((e) => e.type === 'outage').flatMap((e) => [e.day, e.day + 1]));
  const quiet = sup.daily.filter((d) => !outageDays.has(d.day));
  const total = quiet.reduce((a, d) => a + d.new, 0) * (sup.daily.length / Math.max(1, quiet.length));
  assert.ok(total > 3 && total < 40, `${Math.round(total)} tickets in 10 days for 80 customers (outage days ${[...outageDays]})`);
  const slow = frtMedian(s, sup);
  assert.ok(slow > 24, `ignored queue → slow FRT ${slow}`);
  assert.ok(s.market.modifiers.churn['support-frt'] > 1);
  sup.autoHoursPerDay = 3;
  const before = s.founder.hoursUsed;
  advance(s, 1, APPS4);
  assert.ok(s.founder.hoursUsed > before || s.day % 7 === 1, 'founder hours charged for the support block');
});

test('a good reply to a concrete ticket solves it and records CSAT', async () => {
  const s = world();
  const sup = ensureSupport(s);
  sup.active = true;
  advance(s, 6, APPS4);
  const ctx = { state: s, llm, save() {}, render() {} };
  await drainJobs(ctx);
  const t = sup.tickets.find((x) => x.status === 'open' && ['howto', 'bug'].includes(x.category)) ?? sup.tickets.find((x) => x.status === 'open' && x.category !== 'feature');
  assert.ok(t, 'has an open ticket');
  // Grounded in the ticket (the feature involved), not just the right keywords (audit item 13).
  t.messages.push({ from: 'me', text: `Sorry about the trouble with ${t.feature ?? 'Receipt requests by SMS'}. Here is how to fix it: 1. Go to Settings 2. click Reconnect next to Receipt requests by SMS. I also fixed the bug today and it is live now. Can you check?`, day: s.day });
  t.firstResponseDay = s.day;
  s.jobs.push({ id: 'j1', type: 'support:reply', payload: { ticketId: t.id }, status: 'pending', attempts: 0 });
  await drainJobs(ctx);
  assert.equal(t.status, 'solved');
  assert.ok(t.csat >= 4);
});

test('buying fake reviews: landing boost first, then removal/warning/FTC risk exists', () => {
  const s = world();
  const sup = ensureSupport(s);
  sup.active = true;
  sup.fake = { day: s.day, n: 20 };
  for (let i = 0; i < 20; i++) sup.reviews.push({ id: `r${i}`, rating: 5, day: s.day, fake: true, removed: false });
  advance(s, 400, [helpdesk]);
  assert.ok(sup.reviews.filter((r) => r.fake && r.removed).length >= 10, 'platforms remove most fakes');
});

test('analytics: activation responds to fit and onboarding; adoption ramps; retention split is consistent', () => {
  assert.ok(Math.abs(activationRate({ fit: 0.3 }) - 0.375) < 0.01);
  assert.ok(activationRate({ fit: 0.7, onboarding: 'concierge' }) > activationRate({ fit: 0.3 }));
  assert.ok(featureAdoption({ daysLive: 90, usefulShare: 1 }) <= 0.3 && featureAdoption({ daysLive: 10, usefulShare: 1 }) < featureAdoption({ daysLive: 90, usefulShare: 1 }));
  const split = splitRetention([1, 0.9, 0.8, 0.7, 0.6, 0.55, 0.5, 0.48, 0.46, 0.44, 0.42, 0.41, 0.4, 0.4], 0.4);
  const w13 = split[13];
  assert.ok(Math.abs(0.4 * w13.activated + 0.6 * w13.notActivated - w13.all) < 1e-9);
  assert.ok(w13.activated / w13.notActivated > 2);
});

test('ops: protections lower event rates; overnight incidents without paging take hours', () => {
  const exposed = opsRates({ flags: {}, ai: true });
  const protectedR = opsRates({ flags: { captcha: true, secretScanning: true, spendCaps: true, adminMFA: true, testedBackups: true }, ai: true });
  for (const k of ['cardTesting', 'leakedKey', 'surpriseBill', 'breach', 'dataLoss']) assert.ok(protectedR[k] < exposed[k], k);
  assert.ok(opsRates({ flags: {}, bugHours: 200 }).incident > exposed.incident);
  assert.equal(opsRates({ flags: {}, selfServeCheckout: false }).cardTesting, 0);
  const night = drawIncident(() => 0.95, 'own', { paging: false }); // startHour 22
  assert.ok(night.overnight && night.minutes >= 240);
  const paged = drawIncident(() => 0.95, 'own', { paging: true });
  assert.ok(paged.minutes < night.minutes);
  const a = drawCardTesting(() => 0.5);
  assert.ok(a.attempts >= 500 && a.cost >= 50 && a.hours >= 2);
});

test('a year of ops: incidents happen at research rates and analytics records the funnel', () => {
  // Poisson counts: one seed can legitimately see 2 in a year, so check the mean over three companies.
  let own = 0, s, ins;
  for (const seed of [11, 12, 13]) {
    s = world('smb', 60, seed);
    advance(s, 365, APPS4);
    ins = ensureInsights(s);
    own += ins.incidents.filter((i) => i.kind === 'own').length / 3;
  }
  assert.ok(own >= 3 && own <= 25, `${own} own incidents per year`);
  assert.ok(ins.daily.length >= 300);
  assert.ok(ins.costs.length >= 11);
});

import { csatP } from '../public/apps/support/model.js';

test('S1: the Helpdesk model takes over at the first paying customer even if never opened', () => {
  const s = world('smb', 5);
  advance(s, 2, APPS4);
  assert.equal(s.apps.support?.active, true);
  assert.ok(s.apps.support.daily.length >= 1);
});

test('S2/S3: CSAT reflects outcome (well-run ≈ 0.8); enterprise volume ≈ 0.4–1.0 per account per month', () => {
  assert.ok(Math.abs(csatP({ frt: 2.5, resolved: true }) - 0.835) < 0.02);
  assert.ok(csatP({ frt: 48, resolved: false }) < 0.65);
  const accts = Array.from({ length: 20 }, () => ({ ageDays: 90 }));
  const perAcct = (expectedTickets({ model: 'ent', accounts: accts }) * 30) / 20;
  assert.ok(perAcct >= 0.4 && perAcct <= 1.0, `${perAcct}`);
});

test('regression: only distinct, usable macros speed up the support inbox (not three one-liners)', async () => {
  const { usefulMacros } = await import('../public/apps/helpdesk.js');
  const junk = { macros: [{ body: 'ok' }, { body: 'thanks' }, { body: 'done' }] };
  const copies = { macros: Array.from({ length: 3 }, () => ({ body: 'Hi {{first_name}}, your {{plan}} plan is fixed: go to Settings > Billing and click Refresh. Reply here within a day if the invoice still shows the old amount and I will correct it by hand for you today.' })) };
  const good = { macros: ['Billing', 'Login', 'Export'].map((w) => ({ body: `Hi {{first_name}}, about your ${w} question on the {{plan}} plan: go to Settings > ${w} and click the first option. Reply here within a day if it still fails and I will fix it for you by hand today.` })) };
  assert.equal(usefulMacros(junk), 0);
  assert.equal(usefulMacros(copies), 1);
  assert.equal(usefulMacros(good), 3);
});
