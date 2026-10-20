// GTM tool paradigms (sales/stack.js, AI SDR vendors, notetaker vendors): each vendor changes what happens, the
// traps cost something traceable, and stellar / good / average / mediocre operators separate. Short, few seeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import '../public/apps/registry.js';
import { SALES } from '../public/apps/sales/params.js';
import { TOOL_CATALOG } from '../public/apps/money/catalog.js';
import { addContact, ensureDeal, ensureCrm, ensureOutreach } from '../public/apps/sales/model.js';
import { addInboundLead } from '../public/apps/sales/crm-api.js';
import * as K from '../public/apps/sales/stack.js';
import { startAiSdr, stopAiSdr } from '../public/apps/sales/engine.js';
import { AISDR_VENDORS } from '../public/apps/sales/sdr.js';
import { NOTETAKER, ensureNotetaker, setNotetakerPlan } from '../public/apps/sales/notetaker.js';

function fresh(seed = 3, { icp = 'Independent restaurant owners with 1-3 locations', oneLiner = 'Shift scheduling and tip pooling for independent restaurants', model = 'smb' } = {}) {
  const s = newState({ companyName: 'Tablely', model, path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.icp = icp; s.company.oneLiner = oneLiner;
  s.day = 200;
  return s;
}
function withDeals(s, n) {
  const base = ensureCrm(s).contacts.length;
  for (let j = 0; j < n; j++) {
    const i = base + j;
    const { contact } = addContact(s, { fullName: `Buyer ${i} Person`, email: `buyer${i}@shop${i}x.com`, company: `Shop ${i}` }, { source: 'manual' });
    ensureDeal(s, { companyId: contact.companyId, contactId: contact.id, source: 'outbound', stage: 'qualified' });
  }
}
function withInbound(s, n, fit = 0.5) {
  for (let i = 0; i < n; i++) {
    addInboundLead(s, { name: `Lead ${i} Person`, email: `lead${i}@inb${i}co.com`, company: `Inbound ${i}`, source: 'organic:seo', fit: i % 3 === 0 ? 0.1 : fit });
    ensureCrm(s).inboundQueue.at(-1).day = s.day - (i % 25);
  }
}
const toolSpend = (s) => (s.recurring ?? []).filter((r) => r.active && Object.values(K.ensureStack(s).recurring).includes(r.id)).reduce((a, r) => a + r.amount, 0);
const mistakes = (s, id) => (s.mistakes ?? []).filter((m) => m.id === id).length;

test('Instantly price is one number: catalog matches the sequencer the game bills ($47 monthly per d03)', () => {
  const row = TOOL_CATALOG.find((r) => r.id === 'instantly');
  assert.equal(row.amount, SALES.sequencerMonthly);
  assert.equal(row.amount, 47);
});

test('CRM paradigms: auto-capture vs manual entry vs admin; HubSpot contact tiers and fixed objects', () => {
  const hours = {};
  for (const id of ['sheet', 'attio_free', 'hubspot_free', 'octolane', 'salesforce']) {
    const s = fresh();
    withDeals(s, 12);
    K.chooseCrm(s, id, { arr: 3e5 });
    hours[id] = K.upkeepHours(s, { arr: 3e5 }).total;
  }
  assert.ok(hours.attio_free < hours.hubspot_free && hours.hubspot_free < hours.sheet, JSON.stringify(hours));
  assert.ok(hours.octolane < hours.sheet / 2, 'AI-native writes updates (review time only)');
  assert.ok(hours.salesforce > hours.hubspot_free + 3, 'Salesforce carries admin hours');
  // HubSpot Starter: the bill jumps when marketing contacts pass the included tier.
  const s = fresh();
  const small = K.crmMonthly(s, 'hubspot_starter');
  for (let i = 0; i < 1200; i++) ensureCrm(s).contacts.push({ id: `c${i}`, email: `x${i}@y.com` });
  assert.ok(K.crmMonthly(s, 'hubspot_starter') > small);
  // Enterprise motion: HubSpot below Enterprise has no custom objects → workaround hours; Attio does not.
  const e1 = fresh(3, { model: 'ent', icp: 'Mid-market finance teams' }); withDeals(e1, 5); K.chooseCrm(e1, 'hubspot_starter');
  const e2 = fresh(3, { model: 'ent', icp: 'Mid-market finance teams' }); withDeals(e2, 5); K.chooseCrm(e2, 'attio_plus');
  assert.ok(K.upkeepHours(e1).parts.workarounds > 0 && !K.upkeepHours(e2).parts.workarounds);
});

test('Octolane: skipping the weekly review of AI updates leaves wrong facts on deals', () => {
  const run = (review) => {
    const s = fresh(5); withDeals(s, 20); K.chooseCrm(s, 'octolane');
    K.ensureStack(s).reviewAi = review;
    for (let w = 0; w < 6; w++) { s.founder.hoursUsed = 0; s.day += 7; K.stackWeek(s, { arr: 2e5 }); }
    return ensureCrm(s).deals.reduce((a, d) => a + (d.wrongFacts ?? 0), 0);
  };
  assert.equal(run(true), 0);
  assert.ok(run(false) >= 2);
});

test('migration pressure starts around $5M ARR on light CRMs; rushed and late migrations cost more', () => {
  const s = fresh(); withDeals(s, 40); K.chooseCrm(s, 'attio_plus', { arr: 1e6 });
  assert.equal(K.migrationPressure(s, 3e6).level, 0);
  assert.ok(K.migrationPressure(s, 8e6).level > 0.2);
  const hs = fresh(); withDeals(hs, 5); K.chooseCrm(hs, 'hubspot_pro', { arr: 8e6 });
  assert.equal(K.migrationPressure(hs, 8e6).level, 0, 'full reporting: no pressure');
  assert.ok(K.upkeepHours(s, { arr: 8e6 }).parts.reporting > 1);
  const planned = K.switchCost(s, 'hubspot_pro', { planned: true, arr: 8e6 });
  const late = K.switchCost(s, 'hubspot_pro', { planned: true, arr: 2e7 });
  assert.ok(late.hours > planned.hours * 1.15, `${late.hours} vs ${planned.hours}`);
  for (const d of ensureCrm(s).deals) d.fields = { budget: { value: '$200' } };
  const a = fresh(); withDeals(a, 40); K.chooseCrm(a, 'attio_plus', { arr: 1e6 }); for (const d of ensureCrm(a).deals) d.fields = { budget: { value: '$200' } };
  const rp = K.chooseCrm(s, 'hubspot_pro', { planned: true, arr: 8e6 });
  const rr = K.chooseCrm(a, 'hubspot_pro', { planned: false, arr: 8e6 });
  assert.ok(rr.lost > rp.lost, `rushed lost ${rr.lost} vs planned ${rp.lost}`);
  assert.ok(mistakes(a, 'rushed_crm_migration') === 1 && mistakes(s, 'rushed_crm_migration') === 0);
});

test('Rox is an agent layer: needs HubSpot/Salesforce, cuts research time, Teams for a solo founder is waste', () => {
  const s = fresh();
  K.chooseCrm(s, 'attio_free');
  assert.throws(() => K.startRox(s, 'individual'), /HubSpot or Salesforce/);
  K.chooseCrm(s, 'hubspot_free');
  assert.equal(K.researchHours(s, 0.25), 0.25);
  K.startRox(s, 'teams');
  assert.ok(K.researchHours(s, 0.25) < 0.1);
  assert.equal(mistakes(s, 'rox_teams_solo'), 1);
});

test('routing: Calendly books inbound itself; Default qualifies junk out; both below 100 leads/month Default is waste', () => {
  const runFor = (routing) => {
    const s = fresh(9); K.chooseCrm(s, 'attio_free'); K.setRouting(s, routing);
    for (let d = 0; d < 6; d++) {
      for (let i = 0; i < 5; i++) addInboundLead(s, { name: `Lead ${d}${i} Person`, email: `lead${d}${i}@inb${d}${i}co.com`, company: `Inbound ${d}${i}`, source: 'organic:seo', fit: i % 3 === 0 ? 0.1 : 0.5 });
      s.day++; K.stackDay(s);
    }
    for (let d = 0; d < 5; d++) { s.day++; K.stackDay(s); }
    return s;
  };
  const none = runFor('none'), cal = runFor('calendly'), def = runFor('default');
  const st = (s) => K.ensureStack(s).stats;
  assert.equal(st(none).routedBooked, 0);
  assert.ok(st(none).wentCold > 3, 'untriaged leads go cold');
  assert.ok(st(cal).routedBooked >= 5);
  assert.equal(st(cal).autoDismissed, 0);
  assert.ok(st(def).autoDismissed >= 5);
  def.day += 60; K.stackWeek(def, { arr: 2e5 });
  assert.equal(mistakes(def, 'routing_below_volume'), 1);
  assert.ok(toolSpend(def) > toolSpend(cal) * 30);
});

test('local lists: phone/DM after checking the listing beats email on a stale list; staleness grows with age', () => {
  const s = fresh(11); K.setLocalSource(s, 'openmart');
  const { list } = K.buildLocalList(s, { size: 400 });
  const closedAt = (day) => list.rows.filter((r) => K.rowTruth(list, r, day).closed).length;
  assert.ok(closedAt(list.day + 365) > closedAt(list.day) * 1.8);
  const work = (channel, verify, seed) => {
    const t = fresh(seed); K.setLocalSource(t, 'resquared');
    const { list: l } = K.buildLocalList(t, { size: 600 });
    t.day += 150; // a list built five months ago
    const r = K.workLocalList(t, l.id, { channel, verify, n: 600 });
    return { ...r, per100: (100 * r.meetings) / Math.max(1, r.worked + r.closedCaught), t };
  };
  let good = 0, bad = 0, wGood = 0, wBad = 0;
  for (const seed of [1, 2, 3]) {
    const g = work('phone', true, seed); const b = work('email', false, seed + 10);
    good += g.per100; bad += b.per100; wGood += g.wastedHours; wBad += b.closedHit;
    assert.equal(mistakes(b.t, 'email_first_local'), 1);
  }
  assert.ok(good > bad * 2, `phone+check ${good.toFixed(1)} vs email ${bad.toFixed(1)} meetings per 100 rows`);
  assert.ok(wBad > 10, 'emailing a stale list hits closed businesses');
  const blind = work('phone', false, 4);
  assert.equal(mistakes(blind.t, 'stale_local_list'), 1);
});

test('AI SDR vendors differ by workflow: 11x annual lock is owed on early stop; Instantly agent needs your inboxes', () => {
  const s = fresh();
  assert.throws(() => startAiSdr(s, { vendor: 'instantly_agent' }), /inboxes/);
  const cash0 = s.bank?.balance;
  startAiSdr(s, { vendor: 'alice_11x', mode: 'autopilot' });
  assert.equal(ensureOutreach(s).aiSdr.vendor, 'alice_11x');
  s.day += 45;
  stopAiSdr(s);
  assert.equal(mistakes(s, 'ai_sdr_annual_lock'), 1);
  const owed = (s.mistakes.find((m) => m.id === 'ai_sdr_annual_lock')).cost.usd;
  assert.equal(owed, AISDR_VENDORS.alice_11x.monthly * 10);
  const a = fresh(); startAiSdr(a, { vendor: 'ava_artisan' }); a.day += 45; stopAiSdr(a);
  assert.equal(mistakes(a, 'ai_sdr_annual_lock'), 0, 'monthly plan: no lock-in');
  void cash0;
});

test('notetakers: vendor sets bot vs bot-free; Fathom team plans bill 2 seats; legacy plan ids still load', () => {
  const s = fresh();
  const nt = ensureNotetaker(s); nt.mode = 'local';
  setNotetakerPlan(s, 'fathom_business');
  assert.equal(nt.mode, 'bot');
  assert.equal(nt.autoShare, true, 'Fathom field sync writes on every call');
  assert.equal(mistakes(s, 'notetaker_seat_minimum'), 1);
  setNotetakerPlan(s, 'granola_business');
  assert.equal(nt.mode, 'local');
  assert.equal(NOTETAKER.plans.granola_business.monthly, 14);
  assert.equal(NOTETAKER.plans.fathom_team.monthly, 38);
  assert.ok(NOTETAKER.plans.paid.push && NOTETAKER.plans.free.historyDays === 30);
});

// ---------------------------------------------------------------------------
// Operator tiers: same company (seed-stage, local-restaurant ICP, ~30 inbound leads/month), four ways to run it.
// ---------------------------------------------------------------------------
const OPERATORS = {
  stellar: { crm: 'attio_free', routing: 'calendly', signals: 'none', source: 'openmart', channel: 'phone', verify: true },
  good: { crm: 'hubspot_free', routing: 'calendly', signals: 'rb2b', source: 'maps', channel: 'phone', verify: false },
  average: { crm: 'hubspot_pro', routing: 'chilipiper', signals: 'none', source: 'openmart', channel: 'dm', verify: false },
  mediocre: { crm: 'salesforce', routing: 'default', signals: 'unify', source: 'openmart', channel: 'email', verify: false, zoominfo: true, rushedSwitch: true },
};
function play(tier, seed) {
  const o = OPERATORS[tier];
  const s = fresh(seed);
  const arr = 3e5;
  withDeals(s, 8);
  if (o.rushedSwitch) { K.chooseCrm(s, 'attio_free', { arr }); withDeals(s, 60); }
  K.chooseCrm(s, o.crm, { arr, planned: !o.rushedSwitch });
  K.setRouting(s, o.routing); K.setSignals(s, o.signals); K.setLocalSource(s, o.source);
  if (o.zoominfo) K.signZoomInfo(s);
  withInbound(s, 30);
  const { list, hours: buildHours } = K.buildLocalList(s, { size: 200 });
  list.day -= 60; // the list was built two months before this quarter
  let hours = buildHours, meetings = 0;
  for (let w = 0; w < 9; w++) {
    s.founder.hoursUsed = 0;
    s.day += 7;
    for (let d = 0; d < 7; d++) K.stackDay(s);
    hours += K.upkeepHours(s, { arr }).total;
    K.stackWeek(s, { arr });
    if (w === 5) { const r = K.workLocalList(s, list.id, { channel: o.channel, verify: o.verify, n: 200 }); hours += r.hours; meetings += r.meetings; }
  }
  return { read: K.stackRead(s, { arr }), spend: toolSpend(s) + (K.ensureStack(s).zoominfo ? 15000 / 12 : 0), hours, meetings, mistakes: (s.mistakes ?? []).length };
}

test('operator tiers separate on the GTM stack: read, spend, hours and meetings', () => {
  const order = ['stellar', 'good', 'average', 'mediocre'];
  const res = Object.fromEntries(order.map((t) => [t, [1, 2, 3].map((seed) => play(t, seed))]));
  const avg = (t, f) => res[t].reduce((a, r) => a + f(r), 0) / res[t].length;
  for (let i = 0; i < order.length - 1; i++) {
    assert.ok(avg(order[i], (r) => r.read.score) > avg(order[i + 1], (r) => r.read.score), `${order[i]} score > ${order[i + 1]}`);
  }
  assert.deepEqual(order.map((t) => res[t][0].read.tier), order, 'each operator reads as its own tier');
  // Real-world spreads: the stellar stack costs a fraction and returns more meetings for the same list.
  assert.ok(avg('mediocre', (r) => r.spend) > 10 * Math.max(1, avg('stellar', (r) => r.spend)));
  assert.ok(avg('mediocre', (r) => r.hours) > 2 * avg('stellar', (r) => r.hours));
  assert.ok(avg('stellar', (r) => r.meetings) > 2 * avg('mediocre', (r) => r.meetings));
  const perHour = (t) => avg(t, (r) => r.meetings) / avg(t, (r) => r.hours);
  assert.ok(perHour('stellar') > perHour('good') && perHour('good') > perHour('average'), 'meetings per founder hour fall with each tier');
  assert.ok(avg('mediocre', (r) => r.mistakes) > avg('stellar', (r) => r.mistakes));
  // Feedback names what a stellar operator would have done.
  assert.ok(res.mediocre[0].read.coaching.some((c) => /Stellar:/.test(c)));
});
