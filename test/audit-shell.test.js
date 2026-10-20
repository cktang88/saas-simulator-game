// Shell honesty audit: the shell must not claim more than the code does. The "AI judges" indicator reports what calls
// actually did (not just that a key exists), assistant "hours saved" counts only hours other apps really stopped
// charging, automation health notes keep prescriptions behind the advice
// gate, the Scorecard labels [design] luck numbers, and the setup copy names no model identifiers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { setLearningMode } from '../public/core/advice.js';
import * as llm from '../public/core/llm.js';
import { createHealth, recordCall, judgeStatus, HEALTH_WINDOW } from '../public/core/llm-health.js';
import { ensureAssistant, choosePlan, grantConnector, createTask, reviewRun, approveRun, claimAssistant } from '../public/apps/assistant/engine.js';
import { APPS } from '../public/apps/registry.js';
import automations from '../public/apps/automations.js';
import scorecard from '../public/apps/outcomes.js';
import { choosePlatform, createAutomation, templateSpec, coaching, ensureAutomations } from '../public/apps/automations/engine.js';
import { TEMPLATES } from '../public/apps/automations/model.js';

const stubRoot = () => ({ innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; } });
const ctxFor = (s, params = '') => ({ state: s, params, save() {}, act() {}, render() {}, navigate() {}, enqueue() {}, toast() {}, llm: null });
const draw = (app, s, params = '') => { const r = stubRoot(); app.render(r, ctxFor(s, params)); return r.innerHTML; };
function world(model = 'smb', seed = 7) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 80000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Receipt collection for bookkeepers';
  return s;
}

test('AI judges indicator: Offline, Ready, Failing, partly offline and Live follow what calls did', () => {
  const h = createHealth();
  assert.equal(judgeStatus(h, false).label, 'Offline');
  assert.equal(judgeStatus(h, true).label, 'Ready', 'a connection alone is not proof the judges are live');
  recordCall(h, { mock: true, error: null }); // offline by choice: not a live attempt
  assert.equal(h.recent.length, 0);
  for (let i = 0; i < 3; i++) recordCall(h, { mock: true, error: 'User not found.' });
  const failing = judgeStatus(h, true);
  assert.equal(failing.label, 'Failing');
  assert.equal(failing.tone, 'neg');
  assert.match(failing.title, /User not found/);
  recordCall(h, { mock: false });
  assert.match(judgeStatus(h, true).label, /^Live · 3\/4 offline$/);
  for (let i = 0; i < HEALTH_WINDOW; i++) recordCall(h, { mock: false });
  assert.equal(judgeStatus(h, true).label, 'Live');
  assert.equal(judgeStatus(h, true).tone, 'pos');
});

test('a live call that fails reports its error to the usage sink, so the shell can say Failing', async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (String(url).endsWith('/api/status')
    ? { ok: true, json: async () => ({ serverKey: false }) }
    : { ok: false, status: 401, json: async () => ({ error: { message: 'User not found.' } }) });
  try {
    llm.configure({ onUsage: (u) => seen.push(u) });
    llm.setSettings({ apiKey: 'sk-or-v1-bogus', enabled: true });
    assert.equal(llm.isLive(), true);
    const r = await llm.ask({ task: 'audit_probe', prompt: 'x', fallback: () => ({ ok: false }) });
    assert.equal(r.mock, true);
    const d = await llm.decide({ task: 'audit_probe', questions: { q: { type: 'noul', instructions: 'x', criteria: { true: 'a', false: 'b' } } }, fallback: () => ({ q: { type: 'noul', noul: 0.5 } }) });
    assert.equal(d.mock, true);
    assert.equal(seen.length, 2);
    assert.ok(seen.every((u) => u.mock && /User not found/.test(u.error)), JSON.stringify(seen));
    const h = createHealth();
    for (const u of seen) recordCall(h, u);
    assert.equal(judgeStatus(h, llm.isLive()).label, 'Failing');
    // Without a key the fallback is offline by choice: no error, and the bar says Offline.
    seen.length = 0;
    llm.setSettings({ apiKey: '' });
    await llm.ask({ task: 'audit_probe2', prompt: 'x', fallback: () => ({}) });
    assert.equal(seen[0].error, null);
    assert.equal(judgeStatus(createHealth(), llm.isLive()).label, 'Offline');
  } finally {
    globalThis.fetch = realFetch;
    llm.setSettings({ apiKey: '', enabled: true });
    llm.configure({});
  }
});

test('assistant: approving a run is not counted as hours saved; only work another app stops charging is', () => {
  const s = world();
  for (let i = 0; i < 20; i++) { const c = createCustomer(s, { name: `C${i}`, email: `o${i}@f${i}.com`, company: `F${i}` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 }); }
  choosePlan(s, 'claude_pro');
  grantConnector(s, 'stripe', 'read'); grantConnector(s, 'analytics', 'read');
  createTask(s, { templateId: 'weekly_metrics', mode: 'ask', schedule: 'weekly' });
  advance(s, 8, APPS.filter((a) => ['assistant', 'calendar', 'mail'].includes(a.id)));
  const A = ensureAssistant(s);
  const r = A.runs.find((x) => x.status === 'ok');
  assert.ok(r, 'a weekly run finished');
  reviewRun(s, r.id); approveRun(s, r.id);
  assert.equal(A.stats.savedHours, 0, 'approval alone saves nothing yet');
  assert.ok(A.stats.paperHours > 0, 'the estimate is kept separately');
  const charged = claimAssistant(s, 'metrics_digest', 0.5);
  assert.ok(charged < 0.5);
  assert.equal(A.stats.savedHours, Math.round((0.5 - charged) * 100) / 100, 'saved = exactly what the review no longer charged (no double count)');
  const html = draw(APPS.find((a) => a.id === 'assistant'), s, 'plan');
  assert.match(html, /Hours saved/);
  assert.doesNotMatch(html, /Hours saved \(on paper\)/);
});

test('Automations health notes are facts; prescriptions reach the player only through an advice source', () => {
  const s = world();
  choosePlatform(s, 'zapier_pro');
  const tpl = TEMPLATES[0];
  const a = createAutomation(s, templateSpec(tpl.id));
  a.status = 'on'; a.tested = true; a.alerts = true;
  const A = ensureAutomations(s);
  A.held.push({ id: 'h1', autoId: a.id, day: s.day });
  const notes = coaching(s);
  const held = notes.find((n) => /held over the plan limit/.test(n.text));
  assert.ok(held && held.advice, 'held runs: fact plus a separate prescription');
  assert.doesNotMatch(held.text, /replay|upgrad/i);
  setLearningMode(s, false);
  const off = draw(automations, s);
  assert.match(off, /<h2>Health<\/h2>/);
  assert.doesNotMatch(off, /Upgrade and replay/);
  setLearningMode(s, true);
  assert.match(draw(automations, s), /Upgrade and replay/);
});

test('Scorecard labels the luck model and reference founder as game assumptions', () => {
  const s = world();
  setLearningMode(s, true);
  const html = draw(scorecard, s);
  assert.match(html, /reference values are game assumptions \[design\]/);
  assert.match(html, /luck model \[design\]/);
  assert.doesNotMatch(html, /what a typical founder does/);
});

test('shell copy names no model identifiers and does not promise AI judges without a key', () => {
  const main = fs.readFileSync(new URL('../public/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /Haiku|Claude \w+ \d|Jev via/);
  assert.match(main, /without one, deterministic offline heuristics stand in/);
  const settings = fs.readFileSync(new URL('../public/apps/settings.js', import.meta.url), 'utf8');
  assert.doesNotMatch(settings, /every judgment is asked to each/);
});
