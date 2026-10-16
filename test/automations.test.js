import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { dayOfWeek } from '../public/core/util.js';
import { drainJobs, registerJob } from '../public/core/jobs.js';
import * as llm from '../public/core/llm.js';
import { addInboundLead } from '../public/apps/sales/crm-api.js';
import { ensureCalls } from '../public/apps/sales/model.js';
import automationsApp from '../public/apps/automations.js';
import { APPS } from '../public/apps/registry.js';
import {
  ensureAutomations, choosePlatform, createAutomation, setStatus, testAutomation, fixFindings, reconnect, repairAutomation,
  templateSpec, summary, coaching, isAutomated, claimAutomated, deflectTickets, collectEvents, replayHeld, platformHours,
} from '../public/apps/automations/engine.js';
import { automationsDay } from '../public/apps/automations/engine.js';
import { callExternal } from '../public/apps/automations/integrations.js';
import { emitSalesEvent } from '../public/apps/sales/events.js';
import { productSlice, newFeature } from '../public/apps/product/store.js';
import { ensureSpend } from '../public/apps/money/spend.js';
import { ensureForecast } from '../public/apps/money/forecast.js';
import { PEOPLE_TRIGGERS } from '../public/apps/people/readers.js';
import { LEGAL_TRIGGERS } from '../public/apps/legal/compliance.js';
import { PRODUCT_TRIGGERS } from '../public/apps/product/api.js';
import { SALES_TRIGGERS, SALES_NEW_TRIGGERS } from '../public/apps/sales/automation.js';
import { ACTIONS } from '../public/apps/automations/model.js';
import { PLATFORMS, TEMPLATES, TRIGGERS, unitsFor, setupHours, emailCopyScore, validateSpec, capabilitiesOf } from '../public/apps/automations/model.js';

for (const [type, h] of Object.entries(automationsApp.jobs ?? {})) registerJob(type, h);
const APPS1 = [automationsApp];

function world(seed = 7, n = 60) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 80000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Receipt collection for bookkeepers';
  s.company.website = { source: 'paste', text: 'Ledgerly' }; // a business with 60 paying customers has a site (inbound spam reach)
  for (let i = 0; i < n; i++) { const c = createCustomer(s, { name: `Customer ${i}`, email: `owner${i}@firm${i}.com`, company: `Firm ${i}` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 }); }
  return s;
}

// Real work arriving every day, plus what the founder does by hand in other apps (and the hours those apps charge).
const MANUAL = { callNotes: 0.09, triage: 0.1, weeklyReview: 0.5 }; // calls.js post-call notes, crm.js HOURS.triage, analytics.js review
function dayOfWork(s, d, ledger) {
  const biz = d % 4 !== 0;
  const c = createCustomer(s, { name: `Trial ${d}`, email: biz ? `ops${d}@shop${d}.com` : `trial${d}@gmail.com`, company: biz ? `Shop ${d}` : null });
  subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 14 });
  const lead = addInboundLead(s, { name: `Lead ${d}`, email: d % 3 ? `cto${d}@startup${d}.io` : `lead${d}@gmail.com`, company: `Startup ${d}`, source: 'inbound' });
  if (d % 2 === 0 && lead) {
    const m = { id: `mtg_${d}`, contactId: lead.id, companyId: lead.companyId, day: s.day, status: 'held', kind: 'discovery', source: 'inbound' };
    ensureCalls(s).meetings.push(m);
    ledger.charged += claimAutomated(s, 'crm_log_meeting', MANUAL.callNotes, { ref: m.id }); ledger.base += MANUAL.callNotes;
  }
  // Yesterday's inbound leads get triaged today.
  for (const q of s.apps.crm.inboundQueue.filter((x) => x.status === 'new' && x.day < s.day)) { q.status = 'accepted'; ledger.charged += claimAutomated(s, 'crm_inbound_triage', MANUAL.triage, { ref: q.id }); ledger.base += MANUAL.triage; }
  if (dayOfWeek(s) === 2) { ledger.charged += claimAutomated(s, 'metrics_digest', MANUAL.weeklyReview); ledger.base += MANUAL.weeklyReview; }
}

const GOOD_COPY = 'Hi {{first_name}},\n\nThanks for starting a trial of Ledgerly. One thing to do first: forward one receipt to your inbox address so the first match runs tonight: {{setup_url}}\n\nIf anything is confusing, reply to this email and I will help.\n\n{{founder_name}}';

function careful(s) {
  ensureAutomations(s);
  choosePlatform(s, 'make_core'); // cheapest plan that fits
  const specs = [
    { ...templateSpec('meeting_notes_crm') },
    { ...templateSpec('lead_enrich_score') },
    { ...templateSpec('weekly_digest') },
    { ...templateSpec('welcome_sequence'), actions: [{ type: 'email_customer', kind: 'onboarding', copy: GOOD_COPY }] },
    { ...templateSpec('dunning_alert') },
  ];
  for (const sp of specs) {
    const { auto } = createAutomation(s, { ...sp, dedupe: true, alerts: true }, { template: true });
    testAutomation(s, auto);
    fixFindings(s, auto);
    setStatus(s, auto, true);
  }
}
// Fixes what alerts surfaced, within a few days.
function maintainCareful(s) {
  const A = ensureAutomations(s);
  for (const [app, c] of Object.entries(A.connections)) if (c.status === 'expired' && s.day - c.expiredDay >= 1) reconnect(s, app);
  for (const a of A.automations) if (a.drift && a.errSince != null) repairAutomation(s, a);
}

function sloppy(s) {
  ensureAutomations(s);
  choosePlatform(s, 'zapier_pro');
  // Over-automates: every template, filters off, AI review off, no dedupe, no alerts, never tested...
  for (const t of TEMPLATES) {
    const sp = templateSpec(t.id);
    sp.filter = null;
    sp.actions = sp.actions.map((x) => (x.type === 'ai_step' ? { ...x, review: false } : x));
    const { auto } = createAutomation(s, sp, { template: true });
    setStatus(s, auto, true);
  }
  // ...plus a lead-capture Zap that writes the record that triggers it.
  const { auto } = createAutomation(s, { name: 'Lead → CRM → Slack', trigger: 'crm_inbound_lead', filter: null, actions: [{ type: 'crm_add_lead' }, { type: 'slack_post' }] });
  setStatus(s, auto, true);
}
// Ignores errors; only reacts to held runs by paying for a bigger plan.
function maintainSloppy(s) {
  const A = ensureAutomations(s);
  if (A.held.length && A.platform === 'zapier_pro') { choosePlatform(s, 'zapier_pro_2k'); replayHeld(s); }
}

function play(seed, setup, maintain, days = 150) {
  const s = world(seed);
  setup(s);
  const ledger = { charged: 0, base: 0 };
  for (let d = 0; d < days; d++) {
    dayOfWork(s, d, ledger);
    advance(s, 1, APPS1);
    if (dayOfWeek(s) === 1) maintain(s);
  }
  return { s, sum: summary(s), ledger, coach: coaching(s) };
}

test('platform catalog: real prices, limits and counting rules', () => {
  assert.equal(PLATFORMS.zapier_free.limit, 100);
  assert.equal(PLATFORMS.zapier_pro.price, 29.99);
  assert.equal(PLATFORMS.make_free.limit, 1000);
  assert.equal(PLATFORMS.n8n_starter.limit, 2500);
  const acts = [{ type: 'enrich' }, { type: 'ai_step' }, { type: 'slack_post' }];
  assert.equal(unitsFor('zapier_pro', { actions: acts }), 3); // successful actions only
  assert.equal(unitsFor('zapier_pro', { actions: acts, filteredOut: true }), 0); // filters are free
  assert.equal(unitsFor('make_core', { actions: acts }), 1 + 1 + 3 + 1); // trigger + modules, AI = 3
  assert.equal(unitsFor('make_core', { actions: acts, filteredOut: true }), 1); // trigger still runs
  assert.equal(unitsFor('n8n_pro', { actions: acts }), 1); // one execution per run
  assert.ok(validateSpec({ trigger: 'stripe_customer', actions: [{ type: 'crm_log' }, { type: 'slack_post' }] }, 'zapier_free').length, 'Zapier Free: two-step Zaps only');
  assert.ok(validateSpec({ trigger: 'stripe_customer', actions: [{ type: 'ai_step' }] }, 'zapier_free').length, 'no AI on Zapier Free');
});

test('templates: 15+ from the research, each valid on a paid plan, setup hours in realistic bands', () => {
  assert.ok(TEMPLATES.length >= 15);
  for (const t of TEMPLATES) {
    const sp = templateSpec(t.id);
    assert.deepEqual(validateSpec(sp, 'zapier_pro'), [], t.id);
    assert.ok(TRIGGERS[t.trigger], t.id);
  }
  const simple = setupHours({ trigger: 'stripe_subscription', actions: [{ type: 'slack_post' }] }, 'zapier_pro');
  const multi = setupHours(templateSpec('meeting_notes_crm'), 'zapier_pro');
  assert.ok(simple >= 0.25 && simple <= 0.5, `simple ${simple}`);
  assert.ok(multi >= 1 && multi <= 3, `multi-step with AI ${multi}`);
  assert.ok(setupHours(templateSpec('meeting_notes_crm'), 'n8n_pro') > multi, 'n8n takes longer to build');
});

test('email copy grading rewards a specific single-next-step email and resists stuffing', () => {
  const good = emailCopyScore(GOOD_COPY, 'onboarding').score;
  const bland = emailCopyScore('Welcome aboard! Our seamless, cutting-edge platform will supercharge your workflow!!! Click here: https://x.co https://y.co https://z.co', 'onboarding').score;
  const stuffed = emailCopyScore('Hi {{first_name}} {{first_name}} {{first_name}} {{company}} {{company}} reply {{founder_name}} https://a.co', 'onboarding').score;
  assert.ok(good >= 0.75, `good ${good}`);
  assert.ok(bland < 0.4, `bland ${bland}`);
  assert.ok(stuffed < good, `stuffed ${stuffed}`);
  assert.ok(emailCopyScore('Hi {{first_name}}, your payment failed. Please fix it. {{founder_name}}', 'dunning').score < emailCopyScore('Hi {{first_name}}, your payment failed. Update the card here: {{update_card_url}}. Reply if you need an invoice. {{founder_name}}', 'dunning').score);
});

test('plan is billed through the bank as a recurring bill; switching vendors costs a rebuild', () => {
  const s = world(3, 5);
  ensureAutomations(s);
  const before = s.bank.txns.length;
  choosePlatform(s, 'zapier_pro');
  assert.equal(s.bank.txns.length, before + 1);
  assert.equal(s.bank.txns.at(-1).amount, -29.99);
  const rec = s.recurring.find((r) => r.vendor === 'Zapier' && r.active);
  assert.ok(rec && rec.amount === 29.99 && rec.category === 'software');
  createAutomation(s, templateSpec('meeting_notes_crm'));
  assert.ok(platformHours(s, 'make_core') > platformHours(s, 'zapier_pro_2k'), 'moving to Make means rebuilding');
  choosePlatform(s, 'make_core');
  assert.equal(rec.active, false);
  assert.ok(s.recurring.find((r) => r.vendor === 'Make' && r.active));
});

test('events come from real game state and each fires once', () => {
  const s = world(5, 10);
  ensureAutomations(s);
  choosePlatform(s, 'zapier_pro_2k');
  const { auto } = createAutomation(s, { name: 'x', trigger: 'crm_inbound_lead', filter: 'business_email', actions: [{ type: 'slack_post' }] });
  auto.latent = { filterBroken: false, mappingBroken: false }; // as if tested and fixed
  setStatus(s, auto, true);
  addInboundLead(s, { name: 'Dana', email: 'dana@acme.io', company: 'Acme', source: 'inbound' });
  addInboundLead(s, { name: 'Free', email: 'free@gmail.com', company: 'Nope', source: 'inbound' });
  assert.equal(collectEvents(s, 'crm_inbound_lead').length, 2);
  advance(s, 1, APPS1);
  advance(s, 1, APPS1);
  const runs = ensureAutomations(s).runs.filter((r) => r.autoId === auto.id && !r.dupOf && !/dedupe/.test(r.reason));
  assert.equal(runs.length, 2, 'one run per event, not repeated next day');
  assert.equal(runs.filter((r) => r.status === 'skipped').length, 1, 'gmail lead filtered out');
});

test('silent auth expiry: runs fail until reconnect; reconnect costs hours incl. backfill', () => {
  const s = world(9, 10);
  ensureAutomations(s);
  choosePlatform(s, 'zapier_pro_2k');
  const { auto } = createAutomation(s, { name: 'notes', trigger: 'meeting_held', filter: 'sales_calls', actions: [{ type: 'crm_log' }] });
  auto.latent = { filterBroken: false, mappingBroken: false };
  setStatus(s, auto, true);
  const A = ensureAutomations(s);
  A.connections.crm.status = 'expired'; A.connections.crm.expiredDay = s.day;
  const lead = addInboundLead(s, { name: 'Sam', email: 'sam@co.io', company: 'Co', source: 'inbound' });
  for (let i = 0; i < 3; i++) { ensureCalls(s).meetings.push({ id: `m${i}`, contactId: lead.id, companyId: lead.companyId, day: s.day, status: 'held' }); claimAutomated(s, 'crm_log_meeting', 0.09, { ref: `m${i}` }); }
  advance(s, 1, APPS1);
  assert.ok(auto.stats.error >= 3, 'runs error while the connection is expired');
  assert.ok(A.incidents.some((x) => x.kind === 'lost_note'));
  assert.ok(coaching(s).some((n) => /has failed \d+ time/.test(n.text)));
  advance(s, 6, APPS1);
  assert.ok(summary(s).debugHours > 0.2, 'skipped call notes the automation never logged are caught up later');
  const h = reconnect(s, 'crm');
  assert.ok(h > 0.25, `reconnect + backfill ${h}`);
  assert.equal(A.connections.crm.status, 'ok');
});

test('testing with sample data catches a misconfigured filter and a loop', () => {
  const s = world(11, 5);
  ensureAutomations(s);
  choosePlatform(s, 'zapier_pro_2k');
  const { auto } = createAutomation(s, { name: 'loop', trigger: 'crm_inbound_lead', filter: 'business_email', actions: [{ type: 'crm_add_lead' }] });
  auto.latent.filterBroken = true;
  const r = testAutomation(s, auto);
  assert.ok(r.findings.some((f) => f.kind === 'filter'));
  assert.ok(r.findings.some((f) => f.kind === 'loop'));
  fixFindings(s, auto);
  assert.equal(auto.latent.filterBroken, false);
  assert.equal(auto.dedupe, true);
});

test('over the plan limit: Zapier holds runs, Make stops unless auto-buy (billed as overage)', () => {
  const s = world(13, 5);
  ensureAutomations(s);
  choosePlatform(s, 'zapier_free');
  const { auto } = createAutomation(s, { name: 'lead ping', trigger: 'crm_inbound_lead', filter: null, actions: [{ type: 'slack_post' }] });
  auto.latent = { filterBroken: false, mappingBroken: false };
  setStatus(s, auto, true);
  for (let i = 0; i < 130; i++) addInboundLead(s, { name: `L${i}`, email: `l${i}@co${i}.io`, company: `Co${i}`, source: 'inbound' });
  advance(s, 1, APPS1);
  const A = ensureAutomations(s);
  assert.ok(A.held.length > 0, 'runs held over 100 tasks');
  assert.ok(A.usage.units <= 100);
  assert.ok(s.notifications.some((n) => /held/.test(n.text)));
  // Make Core: stops at the limit unless auto-buy is on; extra credits are billed at month end.
  choosePlatform(s, 'make_core');
  A.usage.units = 9999;
  for (let i = 0; i < 5; i++) addInboundLead(s, { name: `M${i}`, email: `m${i}@mk${i}.io`, company: `Mk${i}`, source: 'inbound' });
  advance(s, 1, APPS1);
  assert.ok(A.runs.some((r) => /Out of credits/.test(r.reason)), 'Make stops when out of credits');
  A.autoBuy = true;
  A.usage.units = 9999;
  for (let i = 0; i < 5; i++) addInboundLead(s, { name: `N${i}`, email: `n${i}@nk${i}.io`, company: `Nk${i}`, source: 'inbound' });
  advance(s, 1, APPS1);
  assert.ok(A.usage.overage > 0);
  advance(s, 35, APPS1);
  assert.ok(summary(s).overageUsd > 0, 'overage billed');
});

test('hooks are no-ops without the app (other apps stay deterministic)', () => {
  const s = world(15, 3);
  const seed = s.seed;
  assert.equal(isAutomated(s, 'crm_log_meeting'), false);
  assert.equal(claimAutomated(s, 'crm_log_meeting', 0.09, { ref: 'x' }), 0.09);
  assert.equal(deflectTickets(s, 5, 6), 5);
  assert.equal(s.seed, seed, 'no rng consumed');
  assert.equal(s.apps.automations, undefined);
  assert.ok(APPS.some((a) => a.id === 'automations'), 'registered');
  assert.ok(capabilitiesOf(templateSpec('meeting_notes_crm')).includes('crm_log_meeting'));
});

test('AI step job writes an output (offline fallback)', async () => {
  const s = world(17, 5);
  ensureAutomations(s);
  choosePlatform(s, 'zapier_pro_2k');
  const { auto } = createAutomation(s, templateSpec('ticket_triage'));
  auto.latent = { filterBroken: false, mappingBroken: false };
  setStatus(s, auto, true);
  s.apps.support = { tickets: [{ id: 't1', createdDay: s.day, messages: [{ from: 'them', text: 'charged twice' }], category: 'billing', priority: 'high', subject: 'Charged twice?', name: 'Kim' }] };
  advance(s, 1, APPS1);
  await drainJobs({ state: s, llm, save() {}, render() {} });
  assert.ok(ensureAutomations(s).runs.some((r) => r.aiOutput), 'AI output attached to a run');
});

test('operator tiers: a careful setup saves hours with few incidents; a sloppy one costs hours, money and customers', () => {
  const agg = { careful: { net: 0, ongoing: 0, harm: 0, complaints: 0, cost: 0, saved: 0, lost: 0 }, sloppy: { net: 0, ongoing: 0, harm: 0, complaints: 0, cost: 0, saved: 0, lost: 0 } };
  for (const seed of [21, 22, 23]) {
    for (const [k, setup, maintain] of [['careful', careful, maintainCareful], ['sloppy', sloppy, maintainSloppy]]) {
      const { sum, ledger } = play(seed, setup, maintain);
      agg[k].net += sum.netHours; agg[k].ongoing += sum.hoursSaved - sum.reviewHours - sum.debugHours - sum.monitorHours; agg[k].harm += sum.harm; agg[k].complaints += (sum.incidents.complaint ?? 0) + (sum.incidents.cancel ?? 0);
      agg[k].cost += sum.costUsd; agg[k].saved += sum.hoursSaved; agg[k].lost += (sum.incidents.lost_note ?? 0) + (sum.incidents.missed_lead ?? 0);
      assert.ok(ledger.charged <= ledger.base + 1e-9);
    }
  }
  const c = agg.careful, b = agg.sloppy;
  if (process.env.AUTOMATIONS_DEBUG) console.log(JSON.stringify(agg));
  // Five months, three seeds. Setup is a one-off; a careful setup pays it back and keeps saving.
  assert.ok(c.ongoing > 0 && c.net > 0, `careful: ongoing ${c.ongoing.toFixed(1)} h, net ${c.net.toFixed(1)} h after setup`);
  assert.ok(c.net > b.net + 15, `careful ${c.net.toFixed(1)} h vs sloppy ${b.net.toFixed(1)} h`);
  assert.ok(b.lost > 5 * Math.max(1, c.lost), `lost notes + missed leads: careful ${c.lost} vs sloppy ${b.lost}`);
  assert.ok(b.harm > 3 * Math.max(1, c.harm), `incidents: careful ${c.harm} vs sloppy ${b.harm}`);
  assert.ok(b.complaints > c.complaints, `complaints/cancels: careful ${c.complaints} vs sloppy ${b.complaints}`);
  assert.ok(b.cost > c.cost, `cost: careful $${c.cost} vs sloppy $${b.cost}`);
  // Coaching names the sloppy habits.
  const { coach } = play(24, sloppy, maintainSloppy, 60);
  const text = coach.map((n) => n.text).join(' | ');
  assert.ok(/never tested/.test(text), text);
  assert.ok(/without review/.test(text), text);
});


// ---- Built-in app triggers and actions (events and actions the other apps export) ----
function extWorld() { const s = world(3, 2); choosePlatform(s, 'zapier_pro'); return s; }
// Build a one-step alert on `trigger`, seed one event, run the day twice and again the next day.
function fires(trigger, seed, { filter = null } = {}) {
  const s = extWorld();
  const { auto } = createAutomation(s, { name: `t ${trigger}`, trigger, filter, dedupe: true, actions: [{ type: 'slack_post' }] });
  auto.latent = { filterBroken: false, mappingBroken: false };
  setStatus(s, auto, true);
  seed(s);
  automationsDay(s); automationsDay(s);
  const first = auto.stats.success;
  s.day += 1; automationsDay(s);
  return { first, after: auto.stats.success, ref: ensureAutomations(s).runs[0]?.ref, s };
}
const FAMILY_FIXTURES = {
  sales_deal_won: (s) => emitSalesEvent(s, 'deal_won', { dealId: 'deal_1', companyId: 'co_1', stage: 'won', amount: 900 }, 'won:deal_1'),
  product_feature_shipped: (s) => { const f = newFeature(s); Object.assign(f, { title: 'Reports', status: 'shipped', shippedDay: s.day }); productSlice(s).features.push(f); },
  lifecycle_goal_reached: (s) => { s.apps.lifecycle = { events: [{ id: 'lev_1', type: 'goal_reached', day: s.day }] }; },
  insights_activation_event: (s) => { s.apps.insights = { daily: [{ day: s.day, activated: 4 }] }; },
  helpdesk_ticket_created: (s) => { s.apps.support = { tickets: [{ id: 'tkt_1', createdDay: s.day, category: 'billing', priority: 'urgent', status: 'open', customerId: null, messages: [] }], ai: { log: [] }, reviews: [] }; },
  people_candidate_applied: (s) => { s.apps.people = { candidates: [{ id: 'cand_1', appliedDay: s.day, name: 'Jo', email: 'jo@example.org', role: 'eng', channel: 'referral' }], members: [], runs: [] }; },
  // People ops block: negotiation, onboarding, time off and workplace events come from state.apps.people.ops.events
  ...Object.fromEntries(['offer_countered', 'offer_declined', 'new_hire_start', 'onboarding_overdue', 'pto_requested', 'employee_out_sick', 'lease_renewal_due'].map((t) => [`people_${t}`, (s) => { s.apps.people = { candidates: [], members: [], runs: [], ops: { events: [{ id: `${t}:e1`, type: t, ref: `${t}:e1`, day: s.day, label: `${t} fixture` }] } }; }])),
  legal_dsr_received: (s) => { s.apps.legal = { dsrs: [{ id: 'dsr_1', day: s.day, type: 'access', name: 'Sam' }] }; },
  money_receipt_missing: (s) => { ensureSpend(s).receipts.txn_1 = { status: 'needed', day: s.day, firstReminder: s.day, amount: 240, vendor: 'AWS' }; },
  money_runway_below: (s) => { ensureForecast(s).triggers.push({ id: 'rt_1', kind: 'runway', threshold: 6, firedDay: s.day }); },
  fundraising_stage_changed: (s) => { s.apps.fundraising = { investors: [{ id: 'inv_1', name: 'Ada', firm: 'Seed Co', status: 'meeting', log: [{ day: s.day, text: 'Took the meeting' }] }], rounds: [], ir: null }; },
  assistant_run_finished: (s) => { s.apps.assistant = { events: [{ id: 'asst:run_1', type: 'run_finished', day: s.day, runId: 'run_1', taskId: 'task_1', status: 'ok' }] }; },
};
for (const [trigger, seed] of Object.entries(FAMILY_FIXTURES)) {
  test(`built-in trigger ${trigger}: fires once on a stable event id, not again`, () => {
    assert.ok(TRIGGERS[trigger]?.ext, 'declared in the catalog');
    const r = fires(trigger, seed);
    assert.equal(r.first, 1, 'fired for the event');
    assert.equal(r.after, 1, 'dedupe: the same event id does not fire again, same day or next');
    assert.ok(r.ref, 'run carries the stable ref');
  });
}

test('every exported trigger of the people, legal, product and sales apps is in the catalog', () => {
  for (const t of PEOPLE_TRIGGERS) assert.ok(TRIGGERS[`people_${t}`], t);
  for (const t of LEGAL_TRIGGERS) assert.ok(TRIGGERS[`legal_${t}`], t);
  for (const t of PRODUCT_TRIGGERS) assert.ok(TRIGGERS[`product_${t}`], t);
  for (const t of [...Object.keys(SALES_TRIGGERS), ...Object.keys(SALES_NEW_TRIGGERS)]) assert.ok(TRIGGERS[`sales_${t}`], t);
  for (const a of ['sdr_set_mode', 'tag_deal_variant', 'ask_commitment', 'deliver_offer']) assert.ok(ACTIONS[`sales_${a}`], a);
  for (const t of TEMPLATES) assert.deepEqual(validateSpec(templateSpec(t.id), 'zapier_pro'), [], t.id);
  assert.ok(TEMPLATES.filter((t) => TRIGGERS[t.trigger]?.ext).length >= 4, 'new templates use the built-in triggers');
});

test('approval contract: customer-facing actions refuse without approval; unattended runs count as unreviewed', () => {
  const s = extWorld();
  s.mail = { threads: [{ id: 'th_1', subject: 'Hello', with: 'Ada', kind: 'investor', messages: [], unread: false, lastDay: s.day, archived: false }] };
  s.apps.assistant = { events: [{ id: 'asst:run_1', type: 'run_finished', day: s.day, runId: 'run_1', taskId: 't', status: 'ok' }] };
  const weak = 'URGENT!!! CLICK HERE act now, limited time guaranteed!!!';
  const step = { type: 'assistant_queue_send_later', params: { threadId: 'th_1', body: weak } };
  // The action itself: no approval, no send (also in a dry run); approved sends once.
  assert.equal(callExternal(s, step, {}, { approved: false }).error, 'needs approval');
  assert.equal(callExternal(s, step, {}, { approved: false, dryRun: true }).ok, false);
  assert.equal(s.apps.inbox?.sendLater?.length ?? 0, 0);
  assert.equal(callExternal(s, step, {}, { approved: true, dryRun: true }).ok, true);
  assert.equal(s.apps.inbox?.sendLater?.length ?? 0, 0, 'dry run writes nothing');
  // In a flow: with a review step the weak copy is stopped (and the review costs time); without it, it goes out and is traced.
  const mk = (review) => { const { auto } = createAutomation(s, { name: review ? 'reviewed' : 'unattended', trigger: 'assistant_run_finished', dedupe: true, actions: [{ ...step, review }] }); auto.latent = { filterBroken: false, mappingBroken: false }; setStatus(s, auto, true); return auto; };
  const reviewed = mk(true), unattended = mk(false);
  const found = testAutomation(s, unattended).findings;
  assert.ok(found.some((f) => f.kind === 'review'), 'test flags the missing approval step');
  assert.ok(!testAutomation(s, reviewed).findings.some((f) => f.kind === 'review'));
  automationsDay(s);
  assert.equal(reviewed.stats.success, 1);
  assert.equal(s.apps.inbox.sendLater.length, 1, 'only the unattended flow sent it');
  const inc = ensureAutomations(s).incidents.filter((x) => x.kind === 'unreviewed_send');
  assert.equal(inc.length, 1);
  assert.equal(inc[0].autoId, unattended.id);
  assert.ok(ensureAutomations(s).today.review > 0, 'the approval step costs founder time');
  assert.ok(coaching(s).some((n) => /no approval step/.test(n.text)));
});
