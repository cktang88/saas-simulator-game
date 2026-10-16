// llm.js plumbing (reasoning off, one retry on transient failures, cut-off replies) and the information each
// assistant / network prompt is allowed to see. Offline: fetch is stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as llm from '../public/core/llm.js';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureNetwork, archetypes } from '../public/core/network.js';
import { bizBlock } from '../public/apps/context.js';
import { ensureAssistant, choosePlan, grantConnector, answerQuestion } from '../public/apps/assistant/engine.js';
import { chatProse } from '../public/apps/assistant.js';
import messagesApp from '../public/apps/messages.js';

const SCHEMA = { type: 'object', additionalProperties: false, required: ['n'], properties: { n: { type: 'number' } } };
const reply = (content, extra = {}) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content }, finish_reason: extra.finish ?? 'stop' }], usage: { cost: 0.001 } }) });
function stub(responses) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); const r = responses[Math.min(calls.length - 1, responses.length - 1)]; if (r instanceof Error) throw r; return r; };
  return calls;
}
const live = () => llm.setSettings({ apiKey: 'sk-or-test', models: ['anthropic/claude-haiku-5.5'], enabled: true });

test('llm: hidden reasoning is off by default; a server error is retried once, a bad request is not', async () => {
  live();
  let calls = stub([{ ok: false, status: 502, json: async () => ({ error: 'upstream' }) }, reply('{"n": 4}')]);
  const r = await llm.ask({ task: 't', prompt: 'p', schema: SCHEMA, fallback: () => ({ n: -1 }) });
  assert.equal(r.mock, false); assert.equal(r.data.n, 4); assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].reasoning, { enabled: false });
  calls = stub([{ ok: false, status: 400, json: async () => ({ error: { message: 'bad model' } }) }, reply('{"n": 4}')]);
  const b = await llm.ask({ task: 't', prompt: 'p2', schema: SCHEMA, fallback: () => ({ n: -1 }) });
  assert.equal(b.mock, true); assert.equal(b.data.n, -1); assert.equal(calls.length, 1); assert.match(b.error, /bad model/);
});

test('llm: a reply cut off by max_tokens is retried with twice the budget; network errors fall back after two tries', async () => {
  live();
  let calls = stub([reply('{"n": ', { finish: 'length' }), reply('{"n": 9}')]);
  const r = await llm.ask({ task: 't', prompt: 'p3', schema: SCHEMA, maxTokens: 300, fallback: () => ({ n: -1 }) });
  assert.equal(r.data.n, 9); assert.equal(calls[1].max_tokens, 600); assert.equal(r.usd, 0.002, 'both attempts are paid for');
  const usage = [];
  llm.configure({ onUsage: (u) => usage.push(u) });
  calls = stub([new Error('ECONNRESET')]);
  const c = await llm.ask({ task: 't', prompt: 'p4', schema: SCHEMA, fallback: () => ({ n: -1 }) });
  assert.equal(c.mock, true); assert.equal(calls.length, 2); assert.equal(usage.at(-1).mock, true);
  llm.configure({});
});

function company() {
  const s = newState({ companyName: 'Clausewise', model: 'ent', path: 'vc', founderName: 'Daniel Okafor', seed: 3 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  Object.assign(s.company, { oneLiner: 'AI agent that maps fintech controls to SOC 2 and DORA evidence', icp: 'Heads of compliance at 200-2,000 person fintechs' });
  s.plans = [{ id: 'p1', name: 'Platform', price: 1500, interval: 'month', trialDays: 0, active: true }];
  post(s, { amount: 1800000, counterparty: 'Seed round', category: 'investment' });
  for (let i = 0; i < 8; i++) { const c = createCustomer(s, { name: `B${i}`, email: `b${i}@f${i}.com` }); subscribe(s, c.id, s.plans[0], { trial: false }); }
  s.apps.product = { features: [{ id: 'f1', title: 'DORA register export', status: 'shipped', shippedDay: 0 }] };
  return s;
}

test('assistant prose sees connector facts only: no true metrics in its context to contradict them', async () => {
  const s = company();
  choosePlan(s, 'claude_pro');
  grantConnector(s, 'stripe', 'read');
  const m = answerQuestion(s, "What's our MRR?");
  let seen = null;
  const ctx = { state: s, llm: { ask: async (o) => { seen = o; return { data: o.fallback(), mock: true }; } } };
  await chatProse(ctx, s, m, "What's our MRR?");
  assert.match(seen.context, /ICP/);
  assert.doesNotMatch(seen.context, /MRR \$|cash \$|runway/i);
  assert.match(bizBlock(s, 'insider'), /MRR \$12,000/, 'other insiders still get the numbers');
  assert.ok(ensureAssistant(s).chat.at(-1).text);
});

test('network inbound prompts: public facts only, template slots filled, friends write as friends', async () => {
  const s = company();
  const n = ensureNetwork(s);
  const prompts = [];
  const ctx = { state: s, llm: { ask: async (o) => { prompts.push(o); return { data: o.fallback(), mock: true }; } } };
  for (const id of ['leadgen_agency', 'friend_family_checkin', 'agency_recruiter']) {
    const a = archetypes().find((x) => x.id === id);
    const inb = { id: `inb_${id}`, archetypeId: id, category: a.category, channel: a.channel, day: s.day, outcome: 'waste', status: 'pending', engaged: 0 };
    n.inbound.push(inb);
    await messagesApp.jobs['network:inbound'](ctx, { inboundId: inb.id });
  }
  for (const p of prompts) {
    const all = `${p.system}\n${p.prompt}\n${p.context}`;
    assert.doesNotMatch(all, /\{\{/, 'no unfilled {{slots}}');
    assert.doesNotMatch(all, /funded|MRR \$|\$12,000|1,800,000|\$1\.80M/i, 'an unannounced raise and internal numbers stay private');
  }
  assert.match(prompts[0].system, /B2B enterprise software/);
  assert.match(prompts[1].system, /personally knows Daniel Okafor/);
});
