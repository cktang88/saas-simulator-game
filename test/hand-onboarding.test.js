import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ensureCalendar } from '../public/core/calendar.js';
import { APPS } from '../public/apps/registry.js';
import { bookSetup, holdSetup, scoreNotes, setups, productizeOnboarding } from '../public/apps/customers/setup.js';
import { researchSlice } from '../public/apps/product/store.js';
import services, { servicesSlice, makeOffer, acceptOffer, servicesTier } from '../public/apps/services.js';
import { heuristicDemo, recordDemo, demoLift, scriptQuality } from '../public/apps/website/demo.js';

function fresh(model = 'smb', seed = 5) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Invoice reconciliation', status: 'shipped' }], bugs: [] };
  s.company.icp = 'bookkeepers at small accounting firms';
  return s;
}
function newSub(s, i = 0) {
  const c = createCustomer(s, { name: `Ana ${i}`, email: `a${i}@x${i}.com`, company: `Firm ${i}` });
  return subscribe(s, c.id, s.plans[0], { trial: true, source: 'network' });
}
const GOOD = 'She exports invoices to a spreadsheet every Friday and spends 3 hours matching them by hand. She said "I never trust the totals". She got stuck on the bank connect step because she expected a CSV upload. She asked for a way to flag duplicates before month end.';

test('white-glove setup: book, calendar event, attendance, notes, outcome', () => {
  const s = fresh();
  const sub = newSub(s);
  const r = bookSetup(s, sub.id, { hours: 2 });
  assert.ok(r.ok);
  const ev = ensureCalendar(s).events.find((e) => e.id === r.rec.eventId);
  assert.equal(ev.kind, 'onboarding_setup');
  assert.equal(ev.duration, 120);
  assert.equal(bookSetup(s, sub.id).ok, false); // no double booking
  advance(s, r.rec.day - s.day, APPS);
  const used0 = s.founder.hoursUsed;
  assert.equal(ev.status, 'scheduled');
  assert.ok(ev.charged, 'calendar charged the 2h meeting');
  const h = holdSetup(s, r.rec.id, GOOD);
  assert.ok(h.ok);
  assert.equal(sub.onboarded, 'held');
  assert.ok(sub.forceConvert > 0);
  assert.equal(ev.status, 'done');
  const real = researchSlice(s).insights.filter((i) => i.real && i.theme === 'Onboarding');
  assert.ok(real.length >= 2, 'real insights for the backlog');
  assert.ok(s.founder.hoursUsed >= used0);
});

test('missed setup hurts: no-show logs a mistake and kills the conversion boost', () => {
  const s = fresh();
  const sub = newSub(s);
  const r = bookSetup(s, sub.id, { hours: 1 });
  advance(s, r.rec.day - s.day + 3, APPS);
  assert.equal(setups(s)[0].status, 'no-show');
  assert.equal(sub.onboarded, 'no_show');
  assert.ok(s.mistakes.some((m) => m.id === 'setup_no_show'));
});

test('note quality separates tiers; stuffing and blank notes do not pay', () => {
  const stellar = scoreNotes(GOOD);
  const average = scoreNotes('They seemed happy with the product and it went fine, we looked at the dashboard together for a while.');
  const stuffed = scoreNotes('stuck confused wanted wished missing stuck confused wanted wished missing stuck confused wanted wished missing');
  const blank = scoreNotes('');
  assert.ok(stellar.score >= 0.75 && stellar.insights.length >= 3);
  assert.ok(average.score < 0.5);
  assert.ok(stuffed.score < 0.25);
  assert.equal(blank.insights.length, 0);
  const s = fresh(); const sub = newSub(s);
  const r = bookSetup(s, sub.id);
  advance(s, r.rec.day - s.day, APPS);
  holdSetup(s, r.rec.id, '');
  assert.ok(s.mistakes.some((m) => m.id === 'setup_no_notes'));
});

test('premature productizing costs; after 8 sessions it is clean', () => {
  const s = fresh();
  productizeOnboarding(s);
  assert.ok(s.mistakes.some((m) => m.id === 'premature_playbook'));
});

test('services: offer, deposit, weekly hours, final payment, insight; agency drift logs a mistake', () => {
  const s = fresh('smb', 7);
  const sl = servicesSlice(s);
  const o = { ...makeOffer(s), hoursPerWeek: 30, weeks: 4, fixed: true, fee: 24000, rate: 200, inIcp: true };
  sl.offers.push(o);
  const cash0 = s.bank.accounts?.checking?.balance ?? null;
  assert.ok(acceptOffer(s, o.id).ok);
  assert.equal(s.bank.txns.filter((t) => t.category === 'services_revenue').length, 1);
  const used0 = s.founder.hoursUsed;
  for (let i = 0; i < 31; i++) { advance(s, 1, APPS); }
  const p = sl.projects[0];
  assert.equal(p.status, 'done');
  assert.equal(p.paid, 24000);
  assert.ok(p.hoursDone > 100, 'hours charged to the founder');
  assert.ok(s.founder.timeLog.some((t) => /Client work/.test(t.label)));
  // Agency: 3 consecutive months over 50% of hours.
  const s2 = fresh('smb', 9);
  const sl2 = servicesSlice(s2);
  for (let m = 0; m < 3; m++) { sl2.monthHours = 140; services.onMonthEnd(s2); }
  assert.ok(s2.mistakes.some((x) => x.id === 'becoming_agency'));
});

test('services tiers separate: priced well with deposits beats underpriced no-deposit', () => {
  const mk = (rate, deposit) => { const s = fresh(); servicesSlice(s).projects.push({ status: 'done', realRate: rate, deposit, fixed: true }); return servicesTier(s).tier; };
  assert.equal(mk(170, true), 'stellar');
  assert.ok(['mediocre', 'average'].includes(mk(45, false)));
});

test('demo video: good script lifts landing modestly; bad converts slightly worse than no video; long does less; polish cannot rescue', () => {
  const GOODS = 'Bookkeepers at small accounting firms waste hours every week matching invoices by hand. Watch this. Open the app, click import, and select your bank CSV. Now click reconcile: invoice reconciliation matches 94% of lines in 3 minutes instead of 3 hours. Next, flag the duplicates, click export, and open the report. Then I type the client name and press send, so the owner gets a clean summary without a call. Last, connect your accounting system and select the accounts you want synced; it runs in the background. That is your month end done in under 10 minutes. Start a free trial at the link below. It takes five minutes to set up and you can import last month today to see the numbers on your own data. Reply to the email if you get stuck and I will help you personally.';
  const BAD = 'Our revolutionary all-in-one cutting-edge AI-powered platform leverages seamless synergy to empower your team with robust, effortless, best-in-class transformation.';
  const lift = (script, style) => { const s = fresh(); const judge = heuristicDemo(s, script); recordDemo(s, { script, style, judge }); return { s, l: demoLift(s) }; };
  const g = lift(GOODS, 'standard'), b = lift(BAD, 'polished'), long = lift((GOODS + ' ').repeat(8), 'standard');
  assert.ok(g.l.landing > 1.02 && g.l.landing <= 1.1);
  assert.ok(b.l.landing < 1 && b.l.landing >= 0.96 && b.l.sales < 1, `a weak demo costs a little trust (${b.l.landing})`); // [design] penalty
  assert.ok(b.s.mistakes.some((m) => m.id === 'weak_demo_published'));
  assert.ok(b.s.mistakes.some((m) => m.id === 'polished_bad_demo'));
  assert.ok(long.l.landing < g.l.landing);
  assert.equal(g.s.market.modifiers.landing['demo-video'], +g.l.landing.toFixed(4));
});
