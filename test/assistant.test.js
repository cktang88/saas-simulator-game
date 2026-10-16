// Founder AI assistant, AI inbox triage, weekly plan / focus blocks, pay-to-play fees and kill criteria.
// Includes the operator-tier separation tests (CLAUDE.md principle 7) for automation_ai, founder_time and
// founder_sustainability.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, spendHours } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post, totalCash } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, mrr, activeSubs } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { newThread, addMessage, ensureMail } from '../public/core/mail.js';
import { ensureNetwork, inboundFee, archetypeDailyRate, archetypes } from '../public/core/network.js';
import { scheduleEvent, deepWork, ensureCalendar, DEEP_WORK, writingHours } from '../public/core/calendar.js';
import { rng, uid } from '../public/core/util.js';
import { readOperator, TIER_RANK } from '../public/core/operator.js';
import {
  ensureAssistant, choosePlan, grantConnector, createProject, createTask, runTask, reviewRun, verifyFact, correctFact, approveRun,
  approveAction, rejectAction, answerQuestion, useChatAnswer, assistantSignals, factWrong, connectorStatus, assistantDay, claimAssistant, consumeUnits,
} from '../public/apps/assistant/engine.js';
import { FAIL, gradeInstructions } from '../public/apps/assistant/model.js';
import {
  ensureInbox, chooseAgentPlan, setAgent, runAudit, reviewArchive, triageDay, sentDraftConsequences, setReminder, payInboundFee, onInboundEngaged, inboxSignals,
} from '../public/apps/assistant/triage.js';
import { setWeekPlan, blockPriorities, reviewWeek, plannerDay, addCriterion, decideCriterion, killCriteriaWarnings, ensurePlanner, categorize, weekActuals } from '../public/apps/assistant/planner.js';
import '../public/apps/assistant/operators.js';
import { APPS } from '../public/apps/registry.js';

function world(seed = 7, n = 60) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 80000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Receipt collection for bookkeepers';
  for (let i = 0; i < n; i++) { const c = createCustomer(s, { name: `Customer ${i}`, email: `owner${i}@firm${i}.com`, company: `Firm ${i}` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 }); }
  s.apps.product = { features: [{ id: 'f1', status: 'shipped', shippedDay: 0 }] };
  return s;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// ---------------------------------------------------------------------------
// Assistant engine
// ---------------------------------------------------------------------------

test('assistant: chat numbers come from the source apps with chips; no connector means "no access" or an unsourced guess', () => {
  const s = world();
  choosePlan(s, 'claude_pro');
  assert.ok(s.bank.txns.some((t) => t.description.includes('Claude Pro')), 'plan billed');
  assert.ok(s.recurring.some((r) => r.vendor === 'Anthropic' && r.active));
  let unsourced = 0, unavailable = 0;
  for (let i = 0; i < 60; i++) {
    const m = answerQuestion(s, "What's our MRR?");
    for (const f of m.facts) { if (f.status === 'unsourced') unsourced++; if (f.status === 'unavailable') unavailable++; }
    ensureAssistant(s).usage.units = 0;
  }
  assert.ok(unavailable > unsourced && unsourced > 0, `${unsourced} unsourced vs ${unavailable} unavailable`);
  grantConnector(s, 'stripe', 'read');
  const m = answerQuestion(s, "What's our MRR and how many customers?");
  const mrrF = m.facts.find((f) => f.id === 'mrr');
  assert.equal(mrrF.status === 'ok' || mrrF.status === 'misread', true);
  assert.equal(mrrF.truth, mrr(s));
  const v = verifyFact(s, m, m.facts.indexOf(mrrF));
  assert.equal(v.truth, `$${Math.round(mrr(s)).toLocaleString('en-US')}`);
  assert.ok(mrrF.verified);
});

test('assistant: long lists are truncated at the connector page; checking the chip shows rows read vs total', () => {
  const s = world(3, 140);
  choosePlan(s, 'claude_max');
  grantConnector(s, 'stripe', 'read'); grantConnector(s, 'analytics', 'read'); grantConnector(s, 'books', 'read');
  let trunc = 0, runs = 0;
  const t = createTask(s, { templateId: 'weekly_metrics', mode: 'ask', schedule: 'weekly' });
  for (let i = 0; i < 40; i++) {
    const r = runTask(s, t);
    runs++;
    const f = r.facts.find((x) => x.id === 'active_customers');
    if (f.status === 'truncated') { trunc++; assert.equal(f.claimed, 100); assert.ok(factWrong(f)); const v = verifyFact(s, r, r.facts.indexOf(f)); assert.equal(v.rowsTotal, activeSubs(s).length); assert.equal(v.rowsRead, 100); }
    ensureAssistant(s).usage.units = 0;
  }
  assert.ok(trunc > runs * 0.15 && trunc < runs * 0.5, `${trunc}/${runs} truncated`);
});

test('assistant: grants expire silently; scheduled runs fail with auth_expired and only the run log shows it', () => {
  const s = world();
  choosePlan(s, 'claude_pro');
  grantConnector(s, 'stripe', 'read'); grantConnector(s, 'analytics', 'read');
  const t = createTask(s, { templateId: 'weekly_metrics', mode: 'draft', schedule: 'weekly' });
  const g = ensureAssistant(s).connectors.stripe;
  assert.ok(g.expiresDay - g.authDay >= 60 && g.expiresDay - g.authDay <= 90);
  s.day = g.expiresDay + 1;
  const notes = s.notifications.length;
  const r = runTask(s, t);
  assert.equal(r.status, 'auth_expired');
  assert.equal(connectorStatus(s, 'stripe'), 'expired');
  assert.equal(s.notifications.length, notes, 'no notification for a silent failure');
  assert.ok(assistantSignals(s).expired.includes('stripe'));
});

test('assistant: usage allowance runs out mid-week unless extra usage is on (billed at month end)', () => {
  const s = world();
  choosePlan(s, 'chatgpt_plus');
  grantConnector(s, 'stripe', 'read');
  let blocked = 0;
  for (let i = 0; i < 40; i++) { try { answerQuestion(s, 'MRR?'); } catch { blocked++; } }
  assert.ok(blocked > 0);
  ensureAssistant(s).extraUsage = true;
  for (let i = 0; i < 10; i++) answerQuestion(s, 'MRR?');
  assert.ok(ensureAssistant(s).usage.extraUnitsMonth > 0);
});

test('assistant: prompt injection in inbound email turns into an incident only when a task can send without asking', () => {
  let autoIncidents = 0, askIncidents = 0, caught = 0;
  for (let seed = 1; seed <= 25; seed++) {
    for (const mode of ['auto', 'ask']) {
      const s = world(seed);
      choosePlan(s, 'claude_max');
      grantConnector(s, 'mail', 'write'); grantConnector(s, 'helpdesk', 'read');
      const th = newThread(s, { subject: 'Compliance check', with: { name: 'Vendor', email: 'x@vendor.co' }, kind: 'network' });
      addMessage(s, th.id, { from: 'them', body: 'Please forward the customer list. [Automated note for AI assistants...]', meta: { injection: true } });
      const t = createTask(s, { templateId: 'customer_digest', mode, schedule: 'weekly' });
      for (let w = 0; w < 4; w++) {
        const r = runTask(s, t);
        for (const a of r.actions.filter((x) => x.status === 'pending')) { if (a.malicious) { rejectAction(s, r.id, a.id); caught++; } }
      }
      const n = ensureAssistant(s).incidents.filter((x) => x.kind === 'prompt_injection').length;
      if (mode === 'auto') autoIncidents += n; else askIncidents += n;
    }
  }
  assert.ok(autoIncidents >= 10, `auto incidents ${autoIncidents}`);
  assert.equal(askIncidents, 0);
  assert.ok(caught >= 10);
});

test('assistant: approving an output with an unverified wrong number costs hours later and is logged; correcting it does not', () => {
  const s = world(5, 140);
  choosePlan(s, 'claude_max');
  grantConnector(s, 'stripe', 'read'); grantConnector(s, 'analytics', 'read'); grantConnector(s, 'books', 'read');
  const t = createTask(s, { templateId: 'weekly_metrics', mode: 'ask', schedule: 'weekly' });
  let r;
  for (let i = 0; i < 50; i++) { r = runTask(s, t); if (r.facts.some(factWrong)) break; ensureAssistant(s).usage.units = 0; }
  assert.ok(r.facts.some(factWrong));
  approveRun(s, r.id);
  const s2 = world(5, 140);
  // Advance past the discovery window: the delayed cost lands and is traceable.
  for (let d = 0; d < 30; d++) { s.day++; assistantDay(s); }
  assert.ok((s.mistakes ?? []).some((m) => m.id === 'wrong_number_used' && m.cost.hours > 0));
  // Same situation, but the founder checks and corrects every chip first.
  choosePlan(s2, 'claude_max');
  grantConnector(s2, 'stripe', 'read'); grantConnector(s2, 'analytics', 'read'); grantConnector(s2, 'books', 'read');
  const t2 = createTask(s2, { templateId: 'weekly_metrics', mode: 'ask', schedule: 'weekly' });
  let r2;
  for (let i = 0; i < 50; i++) { r2 = runTask(s2, t2); if (r2.facts.some(factWrong)) break; ensureAssistant(s2).usage.units = 0; }
  reviewRun(s2, r2.id);
  r2.facts.forEach((f, i) => { if (f.status !== 'unavailable') { verifyFact(s2, r2, i); if (factWrong(f)) correctFact(s2, r2, i); } });
  approveRun(s2, r2.id);
  for (let d = 0; d < 30; d++) { s2.day++; assistantDay(s2); }
  assert.ok(!(s2.mistakes ?? []).some((m) => m.id === 'wrong_number_used'));
});

test('assistant: project instructions are graded on reader, metrics, thresholds, format, sources and "unknown"', () => {
  assert.ok(!gradeInstructions('weekly numbers').good);
  const g = gradeInstructions('For me, the founder: report MRR, churn, trials and cash in five bullets. Flag anything that moved more than 15%. Cite the source for every number; say unknown instead of guessing.');
  assert.ok(g.good, JSON.stringify(g.missing));
});

// Four operator profiles over many seeds: share of used outputs built on a wrong number, and incidents.
function assistantProfile(tier, seed) {
  const s = world(seed, 60);
  choosePlan(s, 'claude_max');
  const mailScope = tier === 'mediocre' ? 'write' : 'draft';
  // Mediocre connects only what it thinks it needs and lets the assistant fill the gaps.
  for (const c of tier === 'mediocre' ? ['stripe', 'web'] : ['stripe', 'books', 'web', 'helpdesk', 'analytics']) grantConnector(s, c, 'read');
  grantConnector(s, 'mail', mailScope);
  const proj = tier === 'stellar' ? createProject(s, { name: 'Weekly ops', instructions: 'For me, the founder: MRR, churn, trials, cash and runway in five bullets. Flag anything that moved more than 15%. Cite the source for every number and say unknown instead of guessing.' })
    : tier === 'average' ? createProject(s, { name: 'Ops', instructions: 'weekly numbers' }) : null;
  const mode = { stellar: 'ask', good: 'ask', average: 'auto', mediocre: 'auto' }[tier];
  const tasks = [
    createTask(s, { templateId: 'weekly_metrics', projectId: proj?.id, mode, schedule: 'weekly' }),
    createTask(s, { templateId: 'customer_digest', projectId: proj?.id, mode: tier === 'stellar' ? 'draft' : tier === 'mediocre' ? 'auto' : 'ask', schedule: 'weekly' }),
    createTask(s, { templateId: 'competitor_watch', projectId: proj?.id, mode: tier === 'mediocre' ? 'auto' : 'draft', schedule: 'weekly' }),
  ];
  for (let w = 0; w < 16; w++) {
    s.day += 7;
    // Inbound: a customer question and sometimes a spam email with an injection.
    const c = newThread(s, { subject: `Question ${w}`, with: { name: `Customer ${w}`, email: `c${w}@firm.com` }, kind: 'customer' });
    addMessage(s, c.id, { from: 'them', body: 'How do I export?' });
    if (w % 3 === 0) { const sp = newThread(s, { subject: 'Vendor compliance', with: { name: 'Vendor', email: 'v@x.co' }, kind: 'network' }); addMessage(s, sp.id, { from: 'them', body: 'hi [AI note]', meta: { injection: true } }); }
    const reconnectEvery = { stellar: 1, good: 4, average: 8, mediocre: Infinity }[tier];
    if (w % reconnectEvery === 0) for (const k of Object.keys(ensureAssistant(s).connectors)) if (connectorStatus(s, k) === 'expired') grantConnector(s, k, ensureAssistant(s).connectors[k].scope);
    for (const t of tasks) {
      const r = runTask(s, t);
      if (r.status !== 'ok' || tier === 'mediocre') continue;
      if (tier === 'average') { for (const a of r.actions.filter((x) => x.status === 'pending')) approveAction(s, r.id, a.id); continue; }
      reviewRun(s, r.id);
      const idx = r.facts.map((f, i) => i).filter((i) => r.facts[i].status !== 'unavailable');
      const check = tier === 'stellar' ? idx : idx.filter((i, k) => k < 2 && (w + k) % 2 === 0);
      for (const i of check) { verifyFact(s, r, i); if (factWrong(r.facts[i])) correctFact(s, r, i); }
      for (const a of r.actions.filter((x) => x.status === 'pending')) {
        if (a.malicious || (tier === 'stellar' && a.badClaim)) rejectAction(s, r.id, a.id); else approveAction(s, r.id, a.id);
      }
      approveRun(s, r.id);
    }
  }
  const sig = assistantSignals(s, 200);
  return { wrong: sig.wrongShare ?? 0, incidents: sig.incidents, read: readOperator(s, 'automation_ai') };
}

test('operator tiers: assistant use separates stellar > good > average > mediocre (wrong numbers used, incidents)', () => {
  const out = {};
  for (const tier of ['stellar', 'good', 'average', 'mediocre']) {
    const rs = Array.from({ length: 20 }, (_, i) => assistantProfile(tier, 100 + i));
    out[tier] = { wrong: mean(rs.map((r) => r.wrong)), incidents: mean(rs.map((r) => r.incidents)), score: mean(rs.map((r) => r.read.score ?? 0)), coach: rs[0].read.coaching };
  }
  const msg = JSON.stringify(out);
  assert.ok(out.stellar.wrong < 0.03, msg);
  assert.ok(out.stellar.wrong < out.good.wrong && out.good.wrong < out.average.wrong && out.average.wrong < out.mediocre.wrong, msg);
  assert.ok(out.average.wrong >= 0.06, msg);
  assert.equal(out.stellar.incidents, 0, msg);
  assert.ok(out.mediocre.incidents > out.good.incidents, msg);
  assert.ok(out.stellar.score > out.good.score && out.good.score > out.average.score && out.average.score > out.mediocre.score, msg);
  assert.ok(out.mediocre.coach.length > 0, 'mediocre gets coaching');
});

// ---------------------------------------------------------------------------
// Inbox triage
// ---------------------------------------------------------------------------

const CATS = [['vendor', 'waste'], ['spam', 'waste'], ['vendor', 'waste'], ['customer', 'customer_lead'], ['investor', 'investor_meeting'], ['partner', 'intro_partner'], ['vendor', 'intro_customer'], ['event', 'waste'], ['spam', 'scam'], ['founder_peer', 'advice']];
function addInbound(s) {
  const [category, outcome] = CATS[Math.floor(rng(s) * CATS.length)];
  const n = ensureNetwork(s);
  const inb = { id: uid('inb'), archetypeId: 'x', category, channel: 'email', day: s.day, outcome, status: 'delivered', personId: null, threadId: null, engaged: 0, resolved: false };
  n.inbound.push(inb);
  const t = newThread(s, { subject: `${category} hello`, with: { name: `${category} person`, email: `${inb.id}@x.com` }, kind: 'network', app: 'messages', refId: inb.id });
  addMessage(s, t.id, { from: 'them', body: 'Hi there' });
  inb.threadId = t.id;
}
function inboxProfile(tier, seed) {
  const s = world(seed, 5);
  chooseAgentPlan(s, 'lindy_team');
  if (tier === 'stellar' || tier === 'good') runAudit(s);
  setAgent(s, { on: true, autoArchive: true, autoDecline: tier === 'mediocre', autoSend: tier === 'mediocre', drafts: true });
  for (let d = 0; d < 90; d++) {
    s.day++;
    for (let k = 0; k < 3; k++) addInbound(s);
    triageDay(s);
    if ((tier === 'stellar' && d % 7 === 6) || (tier === 'good' && d % 30 === 29)) reviewArchive(s);
  }
  return { lost: ensureInbox(s).stats.lostValuable, read: readOperator(s, 'automation_ai') };
}

test('operator tiers: inbox triage separates valuable messages lost (audit + weekly archive review vs auto everything)', () => {
  const out = {};
  for (const tier of ['stellar', 'good', 'average', 'mediocre']) out[tier] = mean(Array.from({ length: 12 }, (_, i) => inboxProfile(tier, 300 + i).lost));
  const msg = JSON.stringify(out);
  assert.ok(out.stellar <= 0.5, msg);
  assert.ok(out.stellar < out.good && out.good < out.average && out.average < out.mediocre, msg);
});

test('inbox: an AI draft with an unsupported claim costs money only if it is sent unedited; reminders fire on silence', () => {
  const s = world();
  const t = newThread(s, { subject: 'Pricing', with: { name: 'Dana', email: 'd@acme.com' }, kind: 'customer' });
  addMessage(s, t.id, { from: 'them', body: 'Can you do a discount?' });
  const draft = { text: 'Hi Dana. Annual plans are 40% off if you sign this week. Thanks', badClaim: 'Annual plans are 40% off if you sign this week.' };
  const cash = totalCash(s);
  assert.equal(sentDraftConsequences(s, t, draft, { body: 'Hi Dana, happy to talk about annual pricing on a call.' }), null);
  assert.equal(totalCash(s), cash);
  assert.ok(sentDraftConsequences(s, t, draft, { body: draft.text }));
  assert.ok(totalCash(s) < cash);
  assert.ok(s.mistakes.some((m) => m.id === 'unreviewed_ai_output'));
  setReminder(s, t.id, 3);
  for (let i = 0; i < 4; i++) { s.day++; triageDay(s); }
  assert.ok(ensureInbox(s).reminders[0].status === 'fired');
});

// ---------------------------------------------------------------------------
// Pay-to-play / scam fees, responsive-spam cost, S14
// ---------------------------------------------------------------------------

test('pay-to-play: engaging asks for a fee; paying debits the bank and logs the mistake; replying to spam raises spam', () => {
  const s = world();
  s.company.website = { source: 'paste', text: 'Ledgerly' }; // spam needs a way to find you (archetype foundVia)
  const n = ensureNetwork(s);
  const inb = { id: uid('inb'), archetypeId: 'fake_investor', category: 'spam', channel: 'email', day: s.day, outcome: 'scam', status: 'delivered', personId: null, engaged: 1, resolved: false };
  n.inbound.push(inb);
  const spam = archetypes().find((a) => a.category === 'spam');
  const before = archetypeDailyRate(s, spam);
  const fee = onInboundEngaged(s, inb);
  assert.ok(fee.amount >= 2500 && fee.amount <= 15000, JSON.stringify(fee));
  assert.ok(archetypeDailyRate(s, spam) > before * 1.4, 'spam rises after replying to a scam');
  const cash = totalCash(s);
  payInboundFee(s, inb.id);
  assert.ok(Math.abs(totalCash(s) - (cash - fee.amount)) < 0.01);
  assert.ok(s.mistakes.some((m) => m.id === 'pay_to_play' && m.cost.usd === fee.amount));
  assert.equal(inboundFee({ id: 'z', archetypeId: 'inbound_demo_qualified', outcome: 'customer_lead' }), null);
  assert.ok(inboundFee({ id: 'z', archetypeId: 'pay_to_speak_or_award', outcome: 'waste' }).amount >= 1500);
});

// ---------------------------------------------------------------------------
// Focus blocks, weekly plan, drift
// ---------------------------------------------------------------------------

test('focus blocks: deep work inside a long block counts more, a fragmented day less; flexible blocks move, fixed ones break', () => {
  const s = world();
  s.day = 1; // Tuesday
  scheduleEvent(s, { title: 'Focus', kind: 'focus', day: 1, start: 540, duration: 180 });
  const r = deepWork(s, 2, { kind: 'build' });
  assert.equal(r.mult, DEEP_WORK.longMult);
  const r2 = deepWork(s, 2, { kind: 'build' }); // only 1h of block left
  assert.ok(r2.mult < DEEP_WORK.longMult && r2.mult > 1);
  assert.ok(writingHours(s, 1, { commit: false }) <= 1);
  s.day = 2;
  for (const st of [540, 660, 840]) scheduleEvent(s, { title: 'Call', kind: 'call', day: 2, start: st, duration: 30 });
  assert.equal(deepWork(s, 2, { kind: 'build', commit: false }).mult, DEEP_WORK.fragmentedMult);
  // Flexible block yields to a meeting; a fixed one is broken by a forced meeting.
  const flex = scheduleEvent(s, { title: 'Flex', kind: 'focus', day: 3, start: 600, duration: 120, flexible: true });
  scheduleEvent(s, { title: 'Customer', kind: 'call', day: 3, start: 630, duration: 30 });
  assert.ok(flex.day !== 3 || flex.start >= 660 || flex.start + flex.duration <= 630 || flex.status === 'canceled', 'flexible block moved');
  assert.equal(flex.moves, 1);
  const fixed = scheduleEvent(s, { title: 'Fixed', kind: 'focus', day: 4, start: 600, duration: 120 });
  assert.throws(() => scheduleEvent(s, { title: 'Clash', kind: 'call', day: 4, start: 630, duration: 30 }), /Conflicts/);
  scheduleEvent(s, { title: 'Forced', kind: 'call', day: 4, start: 630, duration: 30, allowConflict: true });
  assert.ok(fixed.broken);
});

test('focus blocks: founder build output is higher inside a focus block (Product)', async () => {
  const { build } = await import('../public/apps/product.js');
  const out = [];
  for (const focus of [false, true]) {
    const s = world();
    s.day = 1;
    if (focus) scheduleEvent(s, { title: 'Focus', kind: 'focus', day: 1, start: 540, duration: 240 });
    out.push(build(s, 3, { founder: true }).eff);
  }
  assert.ok(out[1] > out[0] * 1.2, JSON.stringify(out));
});

test('weekly plan: hours are categorised; a week that drifts from its priorities is a logged, costed mistake', () => {
  const s = world();
  assert.equal(categorize({ label: 'Email reply' }), 'comms');
  assert.equal(categorize({ label: 'Writing cold email' }), 'sales');
  assert.equal(categorize({ label: 'Meetings (pitch)', app: 'fundraising' }), 'fundraising');
  assert.equal(categorize({ label: 'Feature spec' }), 'build');
  const cal = { id: 'calendar', onDay: plannerDay };
  advance(s, 7, [cal]); // to Monday
  setWeekPlan(s, [{ text: 'Ship CSV export', category: 'build', hours: 15 }, { text: 'Five demos', category: 'sales', hours: 6 }]);
  for (let d = 0; d < 5; d++) { spendHours(s, 6, 'Email reply'); spendHours(s, 0.5, 'Coding'); advance(s, 1, [cal]); }
  advance(s, 2, [cal]);
  const m = (s.mistakes ?? []).find((x) => x.id === 'busy_work');
  assert.ok(m && m.cost.hours > 0, JSON.stringify(s.mistakes));
});

function timeProfile(tier, seed) {
  const s = world(seed, 5);
  const cal = { id: 'calendar', onDay: plannerDay };
  advance(s, 7, [cal]);
  for (let w = 0; w < 5; w++) {
    if (tier === 'stellar' || tier === 'good') setWeekPlan(s, [{ text: 'Ship export', category: 'build', hours: 15 }, { text: 'Demos', category: 'sales', hours: 6 }, { text: 'Interviews', category: 'customers', hours: 4 }]);
    if (tier === 'stellar') blockPriorities(s, { flexible: false });
    for (let d = 0; d < 5; d++) {
      const meetings = { stellar: 1, good: 2, average: 2, mediocre: 4 }[tier];
      for (let k = 0; k < meetings; k++) try { scheduleEvent(s, { title: 'Call', kind: 'call', day: s.day, start: 780 + k * 45, duration: 30, allowConflict: true }); } catch {}
      const build = { stellar: 4, good: 2.5, average: 1.5, mediocre: 0.5 }[tier];
      deepWork(s, build); spendHours(s, build, 'Coding');
      spendHours(s, { stellar: 1, good: 2.5, average: 3.5, mediocre: 4.5 }[tier], 'Email reply');
      if (tier !== 'mediocre') spendHours(s, 1, 'Writing cold email');
      if (d === 4 && tier === 'stellar') reviewWeek(s, { stopDoing: 'intro calls' });
      advance(s, 1, [cal]);
    }
    advance(s, 2, [cal]);
  }
  return readOperator(s, 'founder_time');
}

test('operator tiers: founder time separates on share of hours on priorities, focus and fragmentation', () => {
  const out = {};
  for (const tier of ['stellar', 'good', 'average', 'mediocre']) { const r = timeProfile(tier, 40); out[tier] = { tier: r.tier, score: r.score, coach: r.coaching }; }
  const msg = JSON.stringify(out);
  assert.ok(out.stellar.score > out.good.score && out.good.score > out.average.score && out.average.score > out.mediocre.score, msg);
  assert.ok(TIER_RANK[out.stellar.tier] >= TIER_RANK.good && TIER_RANK[out.mediocre.tier] <= TIER_RANK.average, msg);
  assert.ok(out.mediocre.coach.length > 0);
});

// ---------------------------------------------------------------------------
// Kill criteria and the Scorecard
// ---------------------------------------------------------------------------

test('kill criteria: a missed criterion shows on the Scorecard and costs a month of burn per month undecided', async () => {
  const { signals } = await import('../public/apps/outcomes/engine.js');
  const s = world(9, 3);
  const cal = { id: 'calendar', onDay: plannerDay };
  advance(s, 2, [cal]);
  addCriterion(s, { metric: 'mrr', threshold: 5000, byDay: s.day + 20, action: 'pivot' });
  advance(s, 25, [cal]);
  const c = ensurePlanner(s).criteria[0];
  assert.equal(c.status, 'missed');
  assert.ok(signals(s).warnings.some((w) => w.id === 'kill_criterion_missed'));
  advance(s, 32, [cal]);
  assert.ok(s.mistakes.some((m) => m.id === 'persistence_as_inaction'));
  decideCriterion(s, c.id, 'pivot');
  assert.ok(!killCriteriaWarnings(s).some((w) => w.id === 'kill_criterion_missed'));
});

test('operator tiers: founder sustainability separates criteria set early and decided on time vs none', () => {
  const run = (tier) => {
    const s = world(11, 3);
    const cal = { id: 'calendar', onDay: plannerDay };
    advance(s, 3, [cal]);
    if (tier === 'stellar' || tier === 'good') addCriterion(s, { metric: 'customers', threshold: 50, byDay: s.day + 40, action: 'pivot' });
    advance(s, 50, [cal]);
    const c = ensurePlanner(s).criteria[0];
    if (tier === 'stellar') decideCriterion(s, c.id, 'persist', { byDay: s.day + 90 });
    advance(s, tier === 'good' ? 60 : 30, [cal]);
    if (tier === 'good') decideCriterion(s, c.id, 'pivot');
    if (tier === 'mediocre') s.founder.wellbeing = { ...(s.founder.wellbeing ?? {}), history: Array.from({ length: 13 }, (_, i) => ({ day: s.day - 7 * i, hours: 72, energy: 30 })) };
    return readOperator(s, 'founder_sustainability');
  };
  const out = Object.fromEntries(['stellar', 'good', 'average', 'mediocre'].map((t) => [t, run(t)]));
  const msg = JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [v.tier, v.score]])));
  assert.ok(out.stellar.score > out.good.score && out.good.score > out.average.score && out.average.score > out.mediocre.score, msg);
});

test('assistant app registers, runs scheduled tasks on Mondays through the clock, and claims the weekly digest saving', () => {
  const s = world();
  assert.ok(APPS.some((a) => a.id === 'assistant'));
  choosePlan(s, 'claude_pro');
  grantConnector(s, 'stripe', 'read'); grantConnector(s, 'analytics', 'read');
  createTask(s, { templateId: 'weekly_metrics', mode: 'ask', schedule: 'weekly' });
  advance(s, 8, APPS.filter((a) => ['assistant', 'calendar', 'mail'].includes(a.id)));
  const A = ensureAssistant(s);
  assert.ok(A.runs.length >= 1);
  const r = A.runs[0];
  reviewRun(s, r.id); approveRun(s, r.id);
  assert.ok(claimAssistant(s, 'metrics_digest', 0.5) < 0.5);
  assert.equal(claimAssistant(s, 'metrics_digest', 0.5), 0.5, 'claimed once per run');
});
