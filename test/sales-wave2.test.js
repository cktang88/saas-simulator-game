// Sales wave-2 regressions: AI SDR review mode goes through the same vendor / cap / domain / segment path as autopilot
// (sales/sdr.js sdrSendContext, sdrComplaints, sdrAddContact), and LinkedIn waits come from core/timing.js timeline()
// with context factors instead of state.day + a + rng*(b-a). Short, offline, few seeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import '../public/apps/registry.js';
import { ensureOutreach, ensureCrm } from '../public/apps/sales/model.js';
import { startAiSdr, recordReply } from '../public/apps/sales/engine.js';
import { ensureSdr, sdrReviewDay, sdrSendContext, sdrComplaints, bulkApprove } from '../public/apps/sales/sdr.js';
import { SALES_TIMELINES, salesTimeline } from '../public/apps/sales/params.js';
import * as LI from '../public/apps/sales/linkedin.js';

function fresh(seed = 5) {
  const s = newState({ companyName: 'Tablely', model: 'smb', path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.icp = 'Independent restaurant owners with 1-3 locations';
  s.company.oneLiner = 'Shift scheduling and tip pooling for independent restaurants';
  s.day = 200;
  return s;
}
function withInfra(s, inboxes = 1, reputation = 80) {
  const o = ensureOutreach(s);
  o.domains.push({ id: 'dom_t', name: 'trytablely.com', boughtDay: 100, auth: { spf: true, dkim: true, dmarc: true }, redirect: false, reputation, warmupDays: 14, log: [] });
  for (let i = 0; i < inboxes; i++) o.inboxes.push({ id: `ib_${i}`, domainId: 'dom_t', address: `pat${i}@trytablely.com`, createdDay: 100, warmupStartDay: 100, warmupDays: 14, dailyLimit: 'auto', paused: false, sentTotal: 0 });
  return o;
}
const reviewDay = (s) => { const today = { aiSent: 0 }; sdrReviewDay(s, ensureOutreach(s), today, { recordReply }); return today; };

test('review mode respects the Instantly agent inbox cap: drafts and sends never exceed 30 per warmed inbox', () => {
  const s = fresh();
  withInfra(s, 1);
  startAiSdr(s, { vendor: 'instantly_agent', mode: 'review' });
  const a = ensureSdr(s);
  assert.equal(sdrSendContext(s, ensureOutreach(s)).sendCap, 30);
  reviewDay(s);
  assert.ok(a.queue.length > 0 && a.queue.length <= 30, `day 1 drafts ${a.queue.length} <= 30`);
  s.day++; reviewDay(s);
  s.day++; reviewDay(s);
  const queued = a.queue.length;
  assert.ok(queued > 30, `backlog ${queued} above one day's cap`);
  bulkApprove(s, a.queue.map((d) => d.id));
  s.day++;
  const today = reviewDay(s);
  assert.equal(today.aiSent, 30, 'only 30 approved drafts leave per inbox per day');
  assert.equal(a.outbox.length, queued - 30, 'the rest wait in the outbox for tomorrow');
});

test('review mode uses the vendor domains: an 11x agent sending from your burned domain lands worse than from a healthy one', () => {
  const exp = (rep) => {
    const s = fresh(9);
    withInfra(s, 2, rep);
    startAiSdr(s, { vendor: 'alice_11x', mode: 'review' });
    const a = ensureSdr(s);
    for (let d = 0; d < 6; d++) { reviewDay(s); bulkApprove(s, a.queue.map((x) => x.id)); s.day++; }
    reviewDay(s);
    return a.review.expReplies / a.review.sent;
  };
  const healthy = exp(90), burned = exp(15);
  assert.ok(healthy > burned * 1.5, `expected replies per send ${healthy.toFixed(4)} (rep 90) vs ${burned.toFixed(4)} (rep 15)`);
});

test('complaints on a vendor that sends from your domains hurt YOUR domain reputation and are logged; a vendor pool does not', () => {
  const s = fresh();
  const o = withInfra(s, 1, 80);
  startAiSdr(s, { vendor: 'alice_11x', mode: 'review' });
  const a = ensureSdr(s);
  sdrComplaints(s, a, sdrSendContext(s, o, a), 3);
  assert.ok(o.domains[0].reputation < 80, `own domain reputation ${o.domains[0].reputation}`);
  assert.equal(s.mistakes.filter((m) => m.id === 'ai_sdr_your_domains').length, 1);

  const v = fresh();
  const ov = withInfra(v, 1, 80);
  startAiSdr(v, { vendor: 'managed', mode: 'review' });
  const av = ensureSdr(v);
  const rep0 = av.reputation;
  sdrComplaints(v, av, sdrSendContext(v, ov, av), 3);
  assert.equal(ov.domains[0].reputation, 80, 'managed vendor sends from its own pool');
  assert.ok(av.reputation < rep0);
});

test('review mode: vendor multipliers apply (Ava writes fewer drafts) and contacts it creates get an ICP segment', () => {
  const drafts = (vendor) => { const s = fresh(4); startAiSdr(s, { vendor, mode: 'review' }); reviewDay(s); return ensureSdr(s).queue.length; };
  assert.ok(drafts('ava_artisan') < drafts('managed'), 'Ava sendMult 0.8 means fewer drafts');
  const s = fresh(11);
  startAiSdr(s, { vendor: 'managed', mode: 'review' });
  const a = ensureSdr(s);
  for (let d = 0; d < 20 && a.replies < 2; d++) { reviewDay(s); bulkApprove(s, a.queue.map((x) => x.id)); s.day++; }
  const crm = ensureCrm(s);
  const sdrContacts = crm.contacts.filter((c) => c.source === 'ai_sdr');
  assert.ok(sdrContacts.length > 0, 'some approved drafts got replies');
  for (const c of sdrContacts) assert.ok(crm.companies.find((co) => co.id === c.companyId)?.segmentId, 'AI SDR contacts carry an ICP segment');
});

// ---- LinkedIn waits ----

function liState(seed = 7) {
  const s = fresh(seed);
  s.company.oneLiner = 'Automated payout reconciliation for Shopify stores';
  s.company.icp = 'Shopify store owners with 5-50 employees who are hiring a bookkeeper';
  s.founder.network.linkedin = 1500;
  s.apps.outreach = {};
  LI.ensureLinkedin(s);
  return s;
}

test('LinkedIn acceptance timing comes from timeline(): inactive members and pitches land later than active, warm, specific notes', () => {
  const t = { active: true, responsiveness: 1, inMarket: false };
  assert.equal(LI.liWaitFactors(t).filter((f) => f.speed).length, 0);
  assert.ok(LI.liWaitFactors({ ...t, active: false }).some((f) => f.speed > 1), 'rarely on LinkedIn slows the median');
  const pull = (fs) => fs.reduce((x, f) => x + (f.pull ?? 0), 0);
  assert.ok(pull(LI.liWaitFactors(t, ['commented_your_post'], { specific: true })) < pull(LI.liWaitFactors(t, [], { pitch: true })), 'warm + specific pulls faster than a cold pitch');
  // Mean days over many draws from the same key, as the sender uses it.
  const mean = (t2, sig, j) => {
    const s = fresh(21);
    let sum = 0;
    for (let i = 0; i < 400; i++) sum += salesTimeline(s, 'li.connect.decide', LI.liWaitFactors(t2, sig, j)).days;
    return sum / 400;
  };
  const fast = mean({ ...t, responsiveness: 1.4 }, ['commented_your_post'], { specific: true });
  const slow = mean({ ...t, active: false, responsiveness: 0.6 }, [], { pitch: true });
  assert.ok(slow > fast * 3, `inactive cold pitch ${slow.toFixed(1)}d vs warm specific ${fast.toFixed(1)}d`);
  assert.ok(SALES_TIMELINES['li.connect.decide'].src.startsWith('[design]'));

  // The real sender sets decideDay from the timeline: always at least tomorrow, spread rather than a fixed window.
  const s = liState();
  const people = LI.searchPeople(s, undefined, { limit: 40 }).people;
  const gaps = [];
  for (const p of people.slice(0, 30)) { try { const r = LI.sendConnect(s, p.id, ''); gaps.push(r.request.decideDay - s.day); } catch { /* limit */ } }
  assert.ok(gaps.length >= 10);
  assert.ok(gaps.every((g) => g >= 1), 'never decided the same day');
  assert.ok(new Set(gaps).size >= 4, `spread of waits ${[...new Set(gaps)].sort((x, y) => x - y)}`);
});
