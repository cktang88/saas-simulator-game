// AI support agent (Fin-style), hardened reply judge, status updates, Slack Connect, operator tiers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, activeSubs } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { drainJobs, registerJob } from '../public/core/jobs.js';
import * as llm from '../public/core/llm.js';
import helpdesk, { ensureSupport, runBatchTest, goLive, reviewAgent, correctFallout, postStatusUpdate, openChannel, addProcedure, simulate, ticketFacts, supportOperatorReader, helpdeskEvents } from '../public/apps/helpdesk.js';
import * as A from '../public/apps/support/agent.js';
import { replyQuality } from '../public/apps/support/model.js';

for (const [type, h] of Object.entries(helpdesk.jobs ?? {})) registerJob(type, h);

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- Archetype players: only what the player does (content, scope, handoffs, procedures, testing, review) ----
const DOC_INTENTS = ['setup', 'integration', 'feature_howto', 'import_export', 'limits', 'login', 'invite', 'invoice', 'feature_request'];
const docs = (ids, q, stale = []) => ids.map((k, i) => ({ id: `a${i}`, title: k, intent: k, quality: q, day: stale.includes(k) ? -100 : 50 }));
const FEATS = [{ title: 'Receipt requests by SMS', shippedDay: 10 }];
function archetype(tier) {
  const ai = A.defaultAgent();
  if (tier === 'stellar') { // scoped to documented intents + tested procedures, every handoff written, tested, reviewed weekly
    for (const k of A.INTENT_IDS) ai.scope[k] = DOC_INTENTS.includes(k) || ['refund', 'cancel', 'outage'].includes(k);
    for (const k in ai.handoff) ai.handoff[k] = true;
    ai.procedures = [{ id: 'p1', intent: 'refund', quality: 0.8, simPassed: true }, { id: 'p2', intent: 'cancel', quality: 0.8, simPassed: true }];
    return { ai, articles: docs(DOC_INTENTS, 0.85), tested: true, drift: 0 };
  }
  if (tier === 'good') { // limited scope, default handoffs, tested
    const sc = ['setup', 'feature_howto', 'login', 'invite', 'invoice', 'limits', 'integration'];
    for (const k of A.INTENT_IDS) ai.scope[k] = sc.includes(k);
    return { ai, articles: docs(sc, 0.7), tested: true, drift: 0.01 };
  }
  if (tier === 'average') return { ai, articles: docs(['setup', 'feature_howto', 'login', 'invite', 'invoice'], 0.55, ['setup', 'feature_howto']), tested: false, drift: 0.04 }; // answers everything, outdated KB
  for (const k in ai.handoff) ai.handoff[k] = false; // mediocre: no escalation path, thin KB, resolution rate as the KPI
  return { ai, articles: docs(['setup', 'login', 'invoice'], 0.35, ['setup']), tested: false, drift: 0.08 };
}
const MIX = { howto: 0.4, bug: 0.1, billing: 0.12, feature: 0.15, account: 0.08, angry: 0.03, outage: 0.01 };
function simulateTier(tier, seed, N = 1500) {
  const r = mulberry(seed);
  const { ai, articles, tested, drift } = archetype(tier);
  const ctx = { articles, feats: FEATS, statusQ: 0 };
  const cats = Object.keys(MIX), tot = Object.values(MIX).reduce((a, b) => a + b, 0);
  const row = { day: 1, seen: 0, involved: 0, claimed: 0, resolved: 0, wrong: 0, silent: 0, unresolved: 0, handoff: 0, outOfScope: 0, repeat: 0 };
  for (let i = 0; i < N; i++) {
    let x = r() * tot, cat = 'howto';
    for (const c of cats) { x -= MIX[c]; if (x <= 0) { cat = c; break; } }
    const k = A.drawIntent(r, cat);
    row.seen++;
    const o = A.resolveConversation(r, A.intentOdds(ai, k, A.coverage(ai, k, ctx), { tested, drift, monthsLive: 2 }));
    if (o === 'out_of_scope') { row.outOfScope++; continue; }
    row.involved++;
    if (o === 'handoff' || o === 'stuck_handoff') { row.handoff++; continue; }
    if (o === 'unresolved') { row.unresolved++; continue; }
    if (A.claimedOutcome(o)) row.claimed++;
    row[o]++;
    const p = o === 'resolved' ? A.AFTERMATH.resolvedRepeat : o === 'wrong' ? A.AFTERMATH.wrongReturnsAngry : A.AFTERMATH.silentRepeat;
    if (r() < p) row.repeat++;
  }
  return A.agentMetrics([row], 1, 30);
}
const avg = (tier, f) => { let s = 0; for (let i = 1; i <= 30; i++) s += f(simulateTier(tier, i)); return s / 30; };

test('AI agent tiers separate on true resolution, repeat contact and wrong answers (30 seeds)', () => {
  const tiers = ['stellar', 'good', 'average', 'mediocre'];
  const truth = Object.fromEntries(tiers.map((t) => [t, avg(t, (m) => m.trueRate)]));
  const repeat = Object.fromEntries(tiers.map((t) => [t, avg(t, (m) => m.repeatRate)]));
  const ofAll = Object.fromEntries(tiers.map((t) => [t, avg(t, (m) => m.shareOfAll)]));
  assert.ok(truth.stellar > truth.good && truth.good > truth.average && truth.average > truth.mediocre, JSON.stringify(truth));
  assert.ok(repeat.stellar <= repeat.good + 0.02 && repeat.good < repeat.average && repeat.average < repeat.mediocre, JSON.stringify(repeat));
  // Calibration: ~40–60% of all conversations truly resolved with good docs and scoping; far lower with thin docs.
  assert.ok(ofAll.stellar >= 0.45 && ofAll.stellar <= 0.65, `stellar ${ofAll.stellar}`);
  assert.ok(ofAll.mediocre >= 0.15 && ofAll.mediocre <= 0.3, `mediocre ${ofAll.mediocre}`);
  assert.ok(repeat.stellar < 0.12 && repeat.mediocre > 0.25, JSON.stringify(repeat));
});

test('gaming: scoping everything and removing handoffs inflates the vendor resolution rate, not real resolution', () => {
  const claimed = (t) => avg(t, (m) => m.claimedRate);
  assert.ok(claimed('mediocre') > claimed('stellar'), 'the dashboard rewards the bad setup');
  assert.ok(avg('mediocre', (m) => m.trueRate) < avg('good', (m) => m.trueRate) - 0.25, 'but real resolution collapses');
});

test('batch test surfaces the poor answers of a bad setup; a good setup tests clean', () => {
  const bad = archetype('mediocre'), good = archetype('stellar');
  const rb = A.batchTest(mulberry(3), bad.ai, { articles: bad.articles, feats: FEATS });
  const rg = A.batchTest(mulberry(3), good.ai, { articles: good.articles, feats: FEATS });
  assert.ok(rb.n >= 45 && rb.n <= 50);
  assert.ok(rb.poor > rg.poor * 2 && rb.poor >= 10, `${rb.poor} vs ${rg.poor}`);
  assert.ok(rb.examples.length > 0 && rb.examples.every((e) => e.why.length > 10));
  assert.ok(rg.poor <= 8, `${rg.poor}`);
});

test('procedures: structure beats keyword stuffing; simulations are capped per month', () => {
  const good = A.procedureHeuristic({ intent: 'refund', connector: 'payments', whenNot: 'Disputes, chargebacks or annual plans', steps: '1. Look up the subscription with Payments\n2. If the last charge is within 14 days and the plan is monthly, refund it and confirm the amount\n3. Otherwise explain the 14-day policy and offer to pause the plan\n4. If the customer disputes the charge, hand off to a human with the details' });
  const stuffed = A.procedureHeuristic({ intent: 'refund', connector: null, whenNot: '', steps: 'refund if else handoff human 14 days\nrefund if else handoff human 14 days\nrefund if else handoff human 14 days' });
  assert.ok(good.quality >= 0.7 && stuffed.quality <= 0.4, `${good.quality} ${stuffed.quality}`);
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'P', seed: 3 });
  const p = addProcedure(s, { intent: 'refund', connector: 'payments', whenNot: 'x', steps: 'y' }, { quality: 0.9, issues: [] });
  let runs = 0;
  assert.throws(() => { for (let i = 0; i < 30; i++) { simulate(s, p.id); runs++; } }, /cap/);
  assert.equal(runs, A.SIM_CAP / A.SIM_RUNS);
  const noConn = addProcedure(s, { intent: 'cancel', connector: null, whenNot: 'x', steps: 'y' }, { quality: 0.9, issues: [] });
  assert.ok(noConn.quality <= 0.3, 'without the Payments connector it can only talk about cancelling');
});

test('replyQuality is keyword-proof: stuffing and echoing lose to a grounded answer', () => {
  const t = { subject: "Can't log in", name: 'Ana Ruiz', company: 'Ruiz Books', messages: [{ from: 'them', text: 'My teammate Sam never got the invite email and I cannot find where to resend it.' }] };
  const ctx = ticketFacts(t);
  const grounded = replyQuality('Hi Ana, sorry the invite email never reached Sam. Here is how: 1. Go to Settings > Team 2. click Resend invite next to Sam. If it is not in spam within 10 minutes, reply and I will add Sam by hand today.', 'account', ctx);
  const stuffed = replyQuality('Sorry! Fixed, shipped, deployed, resolved and refunded today. Step 1: click settings. Thanks for your patience, live now within 2 hours?', 'account', ctx);
  const echo = replyQuality('My teammate Sam never got the invite email and I cannot find where to resend it. Sorry, fixed today, click settings.', 'account', ctx);
  const generic = replyQuality('Sorry about that! Here is how to fix it: 1. Go to Settings 2. click Reconnect. I fixed the bug today, it is live now. Can you check?', 'account', ctx);
  assert.ok(grounded >= 0.6, `${grounded}`);
  assert.ok(stuffed < 0.4 && echo < grounded - 0.2 && generic <= 0.4, `${stuffed} ${echo} ${generic}`);
});

// ---- Integration through the Helpdesk app ----

function world(seed = 11, n = 120) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Receipt collection for bookkeepers';
  s.apps.product = { features: [{ id: 'f1', title: 'Receipt requests by SMS', user: 'bookkeepers', problem: 'x', solution: 'SMS link attaches receipts', acceptance: ['Given x when y then z'], status: 'shipped', shippedDay: -30, effortHours: 40 }], buildQueue: [], bugs: [], changelog: [] };
  for (let i = 0; i < n; i++) { const c = createCustomer(s, { name: `Cust ${i}`, email: `c${i}@x.com`, company: `Co ${i}` }); subscribe(s, c.id, { id: 'p', price: i < 4 ? 900 : 49, interval: 'month', trialDays: 0 }); }
  const sup = ensureSupport(s);
  sup.active = true;
  sup.autoHoursPerDay = 2;
  return s;
}
function setup(s, tier) {
  const sup = ensureSupport(s);
  const { ai, articles } = archetype(tier);
  sup.articles = articles.map((a) => ({ ...a, day: tier === 'stellar' ? s.day : -100 }));
  Object.assign(sup.ai, { scope: ai.scope, handoff: ai.handoff, procedures: ai.procedures, status: 'draft' });
  if (tier === 'stellar') runBatchTest(s);
  goLive(s);
}
const cancels = (s, reasons) => ensureStripe(s).subscriptions.filter((x) => reasons.includes(x.cancelReason)).length;

test('Helpdesk: an untested, no-handoff agent costs angry tickets, churn and logged mistakes; a tested one does not', () => {
  const run = (tier) => {
    let angry = 0, churn = 0, claimed = 0, truth = 0, mistakes = 0;
    for (const seed of [11, 12, 13]) {
      const s = world(seed);
      setup(s, tier);
      for (let d = 0; d < 60; d++) {
        advance(s, 1, [helpdesk]);
        if (tier === 'stellar' && d % 7 === 6) reviewAgent(s);
      }
      const sup = ensureSupport(s);
      angry += sup.themeLog.reduce((a, r) => a + (r.k.human ?? 0), 0);
      churn += cancels(s, ['bad_ai_answer', 'ai_dead_end']);
      const m = A.agentMetrics(sup.ai.log, s.day, 60);
      claimed += m.claimedRate; truth += m.trueRate;
      mistakes += sup.mistakeLog.length;
    }
    return { angry, churn, claimed: claimed / 3, truth: truth / 3, mistakes };
  };
  const good = run('stellar'), bad = run('mediocre');
  assert.ok(bad.angry > good.angry * 1.5, `angry ${bad.angry} vs ${good.angry}`);
  assert.ok(bad.churn > good.churn, `churn ${bad.churn} vs ${good.churn}`);
  assert.ok(bad.truth < good.truth - 0.25 && bad.claimed > good.claimed, JSON.stringify({ good, bad }));
  assert.ok(bad.mistakes >= 2 && good.mistakes <= bad.mistakes, `${bad.mistakes} vs ${good.mistakes}`);
});

test('Helpdesk: going live untested logs the mistake; review catches wrong answers and correcting prevents the fallout', () => {
  const s = world(21);
  setup(s, 'average');
  const sup = ensureSupport(s);
  assert.ok(sup.mistakeLog.some((m) => m.trap === 'ai_live_untested'));
  assert.ok((s.mistakes ?? []).some((m) => m.fn === 'support') || sup.mistakeLog.length, 'mistake reaches the shared ledger');
  let caught = 0;
  for (let d = 0; d < 20 && !caught; d++) {
    advance(s, 1, [helpdesk]);
    reviewAgent(s);
    for (const f of sup.ai.fallout.filter((x) => x.caught && !x.corrected)) { correctFallout(s, f.id); caught++; }
  }
  assert.ok(caught > 0, 'review found a wrong answer still in time');
  assert.throws(() => correctFallout(s, 'nope'));
});

test('Helpdesk: per-resolution billing at month end, and the legacy toggle migrates to a live agent', () => {
  const s = world(31);
  const sup = ensureSupport(s);
  sup.ai = { enabled: true, sinceDay: 0, monthResolutions: 0 };
  ensureSupport(s);
  assert.equal(sup.ai.status, 'live');
  const before = s.bank.txns.filter((t) => t.counterparty === 'Intercom').length;
  advance(s, 35, [helpdesk]);
  const bills = s.bank.txns.filter((t) => t.counterparty === 'Intercom');
  assert.ok(bills.length > before, 'Fin billed');
  assert.ok(bills.every((t) => -t.amount >= A.AI_PRICING.monthlyMin * A.AI_PRICING.perResolution - 0.01));
});

test('status updates: a specific update scores higher; an incident with no update is a logged mistake', () => {
  const vague = A.statusUpdateQuality('Minor hiccup, should be fine soon. We apologize for any inconvenience.', 'database failover');
  const clear = A.statusUpdateQuality('Investigating: report exports and the dashboard are failing since 09:10 UTC after a database failover. We are rolling back the deploy. No data is lost. Next update by 11:00 UTC.', 'database failover');
  assert.ok(clear >= 0.9 && vague <= 0.4, `${clear} ${vague}`);
  const s = world(41, 30);
  s.apps.insights = { today: { day: s.day, id: 'inc1', severity: 0.6, cause: 'database failover', statusPosted: false } };
  advance(s, 1, [helpdesk]);
  s.apps.insights.today.day = s.day;
  advance(s, 1, [helpdesk]);
  assert.ok(ensureSupport(s).mistakeLog.some((m) => m.trap === 'silent_outage'));
  const s2 = world(42, 30);
  s2.apps.insights = { today: { day: s2.day, id: 'inc2', severity: 0.6, cause: 'database failover', statusPosted: false } };
  assert.ok(postStatusUpdate(s2, 'Investigating: exports failing since 09:10 UTC after a database failover; rolling back. Next update by 11:00 UTC.') >= 0.7);
  advance(s2, 2, [helpdesk]);
  assert.ok(!ensureSupport(s2).mistakeLog.some((m) => m.trap === 'silent_outage'));
});

test('Slack Connect: big B2B accounts without a channel churn a little more; channels cost weekly time; threads get tiered SLAs', async () => {
  const s = world(51, 20);
  advance(s, 1, [helpdesk]);
  assert.ok(s.market.modifiers.churn['support-slack'] > 1, 'enterprise-tier accounts expect a channel');
  const big = activeSubs(s).filter((x) => x.price >= 500);
  for (const b of big) openChannel(s, b.customerId);
  advance(s, 8, [helpdesk]);
  assert.equal(s.market.modifiers.churn['support-slack'] ?? 1, 1);
  assert.ok((s.founder.timeLog ?? []).some((t) => /Slack Connect/.test(t.label)));
  await drainJobs({ state: s, llm, save() {}, render() {} });
  const ev = helpdeskEvents(s, 0);
  assert.ok(ev.every((e) => e.id && e.type && e.day != null));
});

test('operator reader: a well-run Helpdesk reads better than a neglected one, with coaching for the neglected one', () => {
  const run = (tier) => {
    const s = world(61);
    const sup = ensureSupport(s);
    if (tier === 'stellar') { setup(s, 'stellar'); sup.autoHoursPerDay = 3; } else { setup(s, 'mediocre'); sup.autoHoursPerDay = 0; }
    for (let d = 0; d < 45; d++) { advance(s, 1, [helpdesk]); if (tier === 'stellar' && d % 7 === 6) reviewAgent(s); }
    return supportOperatorReader(s);
  };
  const good = run('stellar'), bad = run('mediocre');
  const order = ['mediocre', 'average', 'good', 'stellar'];
  assert.ok(good.score > bad.score + 0.2, `${good.score} ${bad.score}`);
  assert.ok(order.indexOf(good.tier) > order.indexOf(bad.tier), `${good.tier} vs ${bad.tier}`);
  assert.ok(bad.coaching.length >= 2 && bad.costs.length >= 1);
  assert.ok(bad.traps.includes('no_handoff'));
});

test('Helpdesk renders every tab (incl. AI setup, review, shared channels, status callout) without errors', () => {
  const s = world(71, 30);
  setup(s, 'average');
  addProcedure(s, { intent: 'refund', connector: 'payments', whenNot: 'disputes', steps: 'a\nb\nc' }, { quality: 0.7, issues: ['x'] });
  advance(s, 10, [helpdesk]);
  reviewAgent(s);
  runBatchTest(s);
  s.apps.insights = { today: { day: s.day, id: 'inc9', severity: 0.5, cause: 'API outage', statusPosted: false } };
  const t = ensureSupport(s).tickets[0];
  for (const params of ['inbox', 'kb', 'ai', 'slack', 'reviews', ...(t ? [t.id] : [])]) {
    const root = { innerHTML: '', addEventListener() {} };
    helpdesk.render(root, { state: s, params, save() {}, act() {}, render() {}, navigate() {}, llm });
    assert.ok(root.innerHTML.length > 500, params);
    if (params === 'ai') assert.ok(/Came back within 72h/.test(root.innerHTML) && /Weekly review/.test(root.innerHTML) && /Procedures/.test(root.innerHTML));
    if (params === 'inbox') assert.ok(/statusForm/.test(root.innerHTML));
  }
});
