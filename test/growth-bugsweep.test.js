// Regression tests for growth & marketing bug-sweep fixes: each mistake has to cost something and volume must not
// buy outcomes. Short, offline, seeded; no long simulations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post, chargeRecurring } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { dayOfMonth, isWeekend } from '../public/core/util.js';
import { ensureCalendar } from '../public/core/calendar.js';
import { addContact } from '../public/apps/sales/model.js';
import { productSlice } from '../public/apps/product/store.js';
import { publishArticle, ensureOrganic, organicDay } from '../public/apps/growth/organicEngine.js';
import { ensureSeo, refreshArticle } from '../public/apps/growth/seoDynamics.js';
import '../public/apps/channels.js';
import * as S from '../public/apps/channels/sim.js';
import * as H from '../public/apps/channels/hosted.js';
import * as E from '../public/apps/channels/events-model.js';
import { engage, agencyDay } from '../public/apps/channels/agencies.js';
import { smsSlice, setSmsProvider, setNumberType, SMS_PROVIDERS } from '../public/apps/emailops/sms.js';

function fresh(seed = 7, model = 'smb') {
  const s = newState({ companyName: 'Habitly', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  productSlice(s).features.push({ id: 'f_core', title: 'Core reconciliation', status: 'shipped', effortHours: 40, progressHours: 40, shippedDay: 0 });
  s.company.website = { source: 'paste', title: 'x', text: 'Bookkeeping for small agencies. $49/mo. Start free trial.' };
  s.company.oneLiner = 'Bookkeeping reconciliation for small agencies';
  s.company.icp = 'owners of 5-30 person marketing agencies';
  s.market.flags = { fixedDemand: 1 };
  s.founder.hoursPerWeek = 400;
  return s;
}
const paidTo = (s, re) => -s.bank.txns.filter((t) => t.amount < 0 && re.test(`${t.counterparty} ${t.description}`)).reduce((a, t) => a + t.amount, 0);
const text = (n, salt = 0) => Array.from({ length: n }, (_, i) => `w${(i * 7 + salt) % 9973}`).join(' ');

test('SEO: rapid repeated refreshes of one page cannot compound its traffic (was 20 rewrites in 20 days -> x3)', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const s = fresh(seed);
    ensureOrganic(s); ensureSeo(s);
    const a = publishArticle(s, { title: 't', query: 'reconciliation app for small agencies', body: text(600, seed), judge: { quality: 0.6, slop: 0.05, results: [], mock: true } });
    a.day = s.day - 400; a.freshDay = a.day;
    let body = text(600, seed);
    let firstMult = null;
    for (let i = 0; i < 20; i++) {
      body = body.split(' ').map((w, j) => (j % 5 === i % 5 ? `x${i}_${j}` : w)).join(' ');
      const r = refreshArticle(s, a.id, { title: 't', body, judge: { quality: 0.6, slop: 0.05 } });
      assert.equal(r.kind, 'substantive');
      if (i === 0) firstMult = a.refreshMult;
      else assert.ok(r.lift <= 1, `refresh ${i} on a just-refreshed page lifted it x${r.lift}`);
      s.day++;
    }
    assert.ok(a.refreshMult <= firstMult + 1e-9, `seed ${seed}: ${a.refreshMult} > first refresh ${firstMult}`);
  }
});

test('organic stats count the signups that really happened (after channel fit), not the pre-fit draw', () => {
  const s = fresh(3);
  s.company.customerType = 'enterprise'; // social posts barely reach enterprise buyers: channel fit thins signups
  s.company.model = 'smb';
  const O = ensureOrganic(s);
  O.schedule.push({ day: s.day, source: 'organic:social', visits: 4000, mult: 3 });
  const before = (s.stripe.subscriptions ?? []).filter((x) => x.source === 'organic:social').length;
  const leadsBefore = (s.apps.crm?.inboundQueue ?? []).length;
  organicDay(s);
  const subs = s.stripe.subscriptions.filter((x) => x.source === 'organic:social').length - before;
  const leads = (s.apps.crm?.inboundQueue ?? []).length - leadsBefore;
  const acq = Object.values(s.apps.segment?.acq ?? {}).reduce((a, x) => ({ n: a.n + x.n, kept: a.kept + x.kept }), { n: 0, kept: 0 });
  assert.ok(acq.n > acq.kept, `channel fit thinned the draw (${acq.kept} of ${acq.n})`);
  assert.ok(subs + leads > 0);
  assert.equal(O.stats['organic:social']?.signups ?? 0, subs + leads);
});

test('templates: duplicate titles count once and a gallery saturates (100 copies cannot out-earn the channel)', () => {
  const s = fresh(5);
  S.ensureChannels(s);
  const later = (st) => { st.day += 200; };
  S.publishTemplate(s, 'Agency month-end close checklist');
  later(s);
  const one = S.templateDailySignups(s);
  assert.ok(one > 0);
  s.day -= 200;
  for (let i = 0; i < 99; i++) S.publishTemplate(s, 'Agency month-end close checklist');
  later(s);
  assert.ok(Math.abs(S.templateDailySignups(s) - one) < 1e-9, 'copies of one title add nothing');
  s.day -= 200;
  for (let i = 0; i < 300; i++) S.publishTemplate(s, `Template number ${i} for agency ${i % 7} workflow`);
  later(s);
  const many = S.templateDailySignups(s);
  // 300 distinct templates: well below 300 x the single-template rate, under the saturation ceiling (~4/month x 30).
  assert.ok(many < one * 60, `${many} vs one ${one}`);
  assert.ok(many * 30 <= 4 * S.TEMPLATE_SAT * 1.2 + 1e-9, `${many * 30}/month`);
});

test('Capterra PPC clicks already delivered are billed even after PPC is switched off', () => {
  const s = fresh(9);
  const C = S.ensureChannels(s);
  C.reviews.claimed = true; C.reviews.claimedDay = s.day;
  C.reviews.ppcAccrued = 180;
  S.setReviewsPaid(s, { g2Paid: false, ppc: null });
  while (new Date(Date.parse(s.startDate + 'T12:00:00Z') + s.day * 86400000).getUTCDay() !== 1) s.day++;
  S.channelsDay(s);
  assert.equal(C.reviews.ppcAccrued, 0);
  assert.ok(paidTo(s, /Capterra/) >= 180);
});

test('lifetime deal: refunds landing after the final payout are clawed back', () => {
  const s = fresh(4);
  const C = S.ensureChannels(s);
  while (dayOfMonth(s) !== 1) s.day++;
  C.ltd = { deal: 'select', price: 59, cap: 1000, limits: true, quality: 0.5, status: 'ended', launchDay: s.day - 100, sold: 50, refunded: 10, users: 40, gross: 2950, net: 700, paidOut: 885, cohorts: [], upgrades: 0, buyers: 50 };
  const cash = s.bank.txns.filter((t) => /AppSumo/.test(t.counterparty)).reduce((a, t) => a + t.amount, 0);
  S.channelsDay(s);
  const after = s.bank.txns.filter((t) => /AppSumo/.test(t.counterparty)).reduce((a, t) => a + t.amount, 0);
  assert.ok(Math.abs(after - cash + 185) < 0.01, `clawback ${after - cash}`);
  assert.ok(Math.abs(C.ltd.paidOut - C.ltd.net) < 0.01);
});

test('hosting a dinner and not showing up still bills the guaranteed covers', () => {
  const s = fresh(11);
  S.ensureChannels(s);
  const ids = [];
  for (let i = 0; i < 20; i++) {
    const { contact, company } = addContact(s, { fullName: `Guest ${i}`, email: `g${i}@agency${i}.com`, title: 'Agency Owner', company: `Agency ${i}`, industry: 'Marketing agency', size: '11-50' }, { source: 'prospector' });
    company.prospect = { fit: 0.8 };
    ids.push(contact.id);
  }
  const J = (q, t = '') => ({ quality: q, score: q * 10, text: t, results: [], mock: true });
  const spec = { format: 'dinner', title: 'Closing the books in two days', agenda: J(0.8, 'Three agency owners share how they close the books; open discussion, no pitch.'), invite: J(0.8, 'Hi, dinner with 10 agency owners on Thursday at 7pm.'), guestIds: ids, anchorIds: [], budget: 'standard', day: s.day + 20, reminders: true };
  while (isWeekend(s, spec.day) || H.hostBlockers(s, spec).some((x) => /weekday/.test(x))) spec.day++;
  const ev = H.hostEvent(s, spec);
  const cal = ensureCalendar(s).events.find((x) => x.id === ev.eventId);
  assert.ok(cal, 'dinner on the calendar');
  cal.status = 'missed';
  s.day = ev.day;
  H.hostedDay(s);
  assert.equal(ev.status, 'missed');
  const F = E.HOSTED.dinner;
  const covers = Math.max(F.minGuests, ev.guests.filter((g) => g.rsvp).length);
  assert.ok(ev.spent >= F.budgets.standard.perGuest * covers - 0.01, `spent ${ev.spent} for ${covers} guaranteed covers`);
});

test('agency retainer with several months prepaid is not billed again for those months', () => {
  const s = fresh(6);
  s.agencyBook = {
    v: 1, rosters: {}, known: {}, engagements: [],
    listings: { ag_t: { id: 'ag_t', name: 'Test Growth Agency', kind: 'marketing', nicheId: null, nicheLabel: 'agencies', level: 1, specialty: 'generalist', priceUsd: 1000, minMonths: 6, upfrontPct: 0.5 } },
    hidden: { ag_t: { quality: 0.6, tier: 'average', scam: false, fit: 0.6 } },
  };
  const { engagement } = engage(s, 'ag_t', { units: 6, brief: '' });
  assert.equal(engagement.paid, 3000, 'three months up front');
  for (let d = 0; d < 170; d++) { s.day++; agencyDay(s); chargeRecurring(s); } // months 1-3 prepaid, 4 at day 90, 5-6 monthly
  assert.equal(paidTo(s, /Test Growth Agency/), 6000, 'six months of work cost six months of fees');
});

test('SMS: switching to a toll-free number bills the toll-free rent', () => {
  const s = fresh(8);
  smsSlice(s);
  setSmsProvider(s, 'twilio');
  const S2 = smsSlice(s);
  setNumberType(s, 'tollfree');
  const r = s.recurring.find((x) => x.id === S2.billId);
  assert.equal(r.amount, SMS_PROVIDERS.twilio.tollFree);
  setNumberType(s, '10dlc');
  assert.equal(r.amount, SMS_PROVIDERS.twilio.number);
});
