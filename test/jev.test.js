import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as llm from '../public/core/llm.js';
import { CRITERIA } from '../public/apps/fundraising/rubric.js';

const RUBRIC = [
  { key: 'clarity', label: 'Clarity', anchors: { 1: 'no clear ask', 3: 'one ask, some filler', 5: 'one specific ask in the first line' } },
  { key: 'proof', label: 'Proof', anchors: '1: no numbers. 3: one metric. 5: metric with timeframe and source.' },
];

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => { const body = JSON.parse(init.body); calls.push({ url, body }); return { ok: true, status: 200, json: async () => handler(url, body) }; };
  return calls;
}

test('chat models exclude Jev; Jev is the decision model', () => {
  llm.setSettings({ models: ['anthropic/claude-haiku-5.5', 'typesafe/jev-router'], decisionModel: '' });
  assert.deepEqual(llm.getSettings().models, ['anthropic/claude-haiku-5.5']);
  assert.equal(llm.getSettings().decisionModel, 'typesafe/jev-1.14');
  llm.setSettings({ models: ['typesafe/jev-router'] });
  assert.deepEqual(llm.getSettings().models, ['anthropic/claude-haiku-5.5'], 'never leaves the chat panel empty');
});

test('rubric anchors become 5-level Jev score questions (object and string anchors)', () => {
  const q = llm.rubricQuestions(RUBRIC);
  assert.equal(q.clarity.type, 'score');
  assert.equal(q.clarity.criteria.length, 5);
  assert.match(q.clarity.criteria[4], /^5: one specific ask/);
  assert.match(q.proof.criteria[0], /^1: no numbers/);
  assert.match(q.proof.criteria[2], /^3: one metric/);
  const f = llm.rubricQuestions(CRITERIA.slice(0, 1)).founder_market_fit.criteria;
  assert.ok(f[0].startsWith('1: no link') && f[4].startsWith('5: 5+ years'), 'parses the investor rubric anchors');
});

test('panel blends chat scores with Jev rubric scores; decide() hits the decisions endpoint', async () => {
  llm.setSettings({ apiKey: 'sk-or-test', models: ['anthropic/claude-haiku-5.5'], decisionModel: 'typesafe/jev-1.14', enabled: true });
  const calls = stubFetch((url) => url.endsWith('/api/decide')
    ? { model: 'typesafe/jev-1.14', answers: { clarity: { type: 'score', score: 4, confidence: 0.8 }, proof: { type: 'score', score: 0, confidence: 0.9 } }, usage: { cost: 0.00001 } }
    : { model: 'anthropic/claude-haiku-5.5', choices: [{ message: { content: JSON.stringify({ clarity: 3, proof: 3, feedback: 'quote' }) } }], usage: { cost: 0.001 } });
  const [r] = await llm.panel({ task: 't', system: 'You judge emails.', prompt: 'Hi, can we talk?', schema: { type: 'object' }, rubric: RUBRIC, fallback: () => ({ clarity: 1, proof: 1, feedback: '' }) });
  assert.equal(r.mock, false);
  assert.equal(r.data.clarity, 4); // (3 + Jev 5) / 2
  assert.equal(r.data.proof, 2); // (3 + Jev 1) / 2
  assert.equal(r.data.feedback, 'quote'); // prose comes from the chat model only
  const dec = calls.find((c) => c.url.endsWith('/api/decide'));
  assert.equal(dec.body.model, 'typesafe/jev-1.14');
  assert.equal(dec.body.questions.clarity.type, 'score');
  assert.ok(calls.filter((c) => c.url.endsWith('/api/llm')).every((c) => !/jev/i.test(c.body.model)), 'Jev never gets chat requests');

  const d = await llm.decide({ task: 'route', state: { ticket: 'I was charged twice' }, questions: { team: { type: 'choice', instructions: 'Which team owns this?', criteria: { billing: 'payments, charges', product: 'bugs, features' } } }, fallback: () => ({ team: { type: 'choice', choice: 'product', confidence: 0 } }) });
  assert.equal(d.mock, true, 'stub returned no answer for "team", so it falls back');
});

test('offline: decide and rubric panels fall back deterministically', async () => {
  llm.setSettings({ apiKey: '', enabled: true });
  const d = await llm.decide({ task: 'x', questions: { ok: { type: 'noul', instructions: '?', criteria: { true: 'a', false: 'b' } } }, fallback: () => ({ ok: { type: 'noul', noul: 0.2 } }) });
  assert.equal(d.mock, true); assert.equal(d.answers.ok.noul, 0.2);
  const [r] = await llm.panel({ task: 't', prompt: 'p', rubric: RUBRIC, fallback: () => ({ clarity: 2, proof: 1 }) });
  assert.deepEqual(r.data, { clarity: 2, proof: 1 });
});

test('a real rubric judge (upgrade prompt) gets Jev scores on its own criteria, blended into the result', async () => {
  const { judgeUpgrade } = await import('../public/apps/plg.js');
  const { UPGRADE_CRITERIA } = await import('../public/apps/plg/rubric.js');
  const { newState } = await import('../public/core/state.js');
  const { ensureStripe } = await import('../public/core/stripe.js');
  const state = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed: 2 }); ensureStripe(state);
  llm.setSettings({ apiKey: 'sk-or-test', enabled: true });
  const chat = Object.fromEntries(UPGRADE_CRITERIA.map((c) => [c.key, 3]));
  const calls = stubFetch((url, body) => url.endsWith('/api/decide')
    ? { answers: Object.fromEntries(Object.keys(body.questions).map((k) => [k, { type: 'score', score: 4, confidence: 0.9 }])), usage: { cost: 0 } }
    : { choices: [{ message: { content: JSON.stringify({ ...chat, evidence: [], score: 0.5, fix: 'x' }) } }], usage: { cost: 0 } });
  const strong = await judgeUpgrade({ state, llm }, 'You have used 3 of 3 projects. Pro unlocks unlimited projects and shared workspaces for $29/mo.');
  const dec = calls.find((c) => c.url.endsWith('/api/decide'));
  assert.deepEqual(Object.keys(dec.body.questions).sort(), UPGRADE_CRITERIA.map((c) => c.key).sort());
  assert.ok(Object.values(dec.body.questions).every((q) => q.type === 'score' && q.criteria.length === 5));
  assert.ok(strong != null);
  llm.setSettings({ apiKey: '' });
});

test('Mom Test question tags: Jev yes/no per label when live, regex offline; thresholds applied', async () => {
  const { classifyQuestionLive, classifyQuestion, QUESTION_TAG_MIN_P } = await import('../public/apps/product/interview.js');
  llm.setSettings({ apiKey: '' });
  const q = "Wouldn't it be great if an app did this for you?";
  assert.deepEqual((await classifyQuestionLive(llm, q)).tags.sort(), classifyQuestion(q).sort());
  llm.setSettings({ apiKey: 'sk-or-test', enabled: true });
  // Paraphrased leading question the regex misses; Jev catches it, and a below-threshold label is dropped.
  stubFetch(() => ({ answers: { leading: { type: 'noul', noul: 0.9 }, hypothetical: { type: 'noul', noul: QUESTION_TAG_MIN_P - 0.05 }, pitch: { type: 'noul', noul: 0.1 }, generic: { type: 'noul', noul: 0.1 }, good: { type: 'noul', noul: 0.8 }, commitment: { type: 'noul', noul: 0 } } }));
  const r = await classifyQuestionLive(llm, 'I bet the month-end close is a nightmare for you, yeah?');
  assert.deepEqual(r.tags, ['leading'], '"good" is dropped when the question is leading');
  llm.setSettings({ apiKey: '' });
});

test('automation classify step is a Jev choice over the trigger\'s label set', async () => {
  const { classifyRecord } = await import('../public/apps/automations/engine.js');
  const { newState } = await import('../public/core/state.js');
  const state = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed: 3 });
  llm.setSettings({ apiKey: '' });
  const off = await classifyRecord({ state, llm }, 'support_ticket', 'I was charged twice this month');
  assert.equal(off.label, 'billing'); assert.equal(off.mock, true);
  llm.setSettings({ apiKey: 'sk-or-test', enabled: true });
  const calls = stubFetch(() => ({ answers: { route: { type: 'choice', choice: 'junk', confidence: 0.87, probabilities: { junk: 0.9 } } } }));
  const on = await classifyRecord({ state, llm }, 'crm_inbound_lead', 'Hi, we sell backlinks');
  assert.equal(on.label, 'junk'); assert.match(on.text, /87% confidence/);
  assert.deepEqual(Object.keys(calls[0].body.questions.route.criteria), ['strong_fit', 'possible_fit', 'poor_fit', 'junk']);
  assert.ok(calls[0].url.endsWith('/api/decide'));
  llm.setSettings({ apiKey: '' });
});
