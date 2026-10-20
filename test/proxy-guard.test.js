// The hosted proxy (server.js with PUBLIC_PROXY=1, deployed on Fly) spends the operator's OpenRouter key for players
// without one, so it must not be an open relay: CORS allowlist, model allowlist, clamped requests, per-IP rate and
// spend caps, a daily budget, no client writes to the shared cache, and server-side reply caching. All offline:
// OpenRouter is stubbed in-process.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProxyGuard, guardConfig } from '../proxy-guard.js';
import { LLM, webPlugin } from '../public/core/params.js';

const ORIGIN = 'https://player.github.io';
let dir, base, mod, upstream = [];
const realFetch = globalThis.fetch;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'proxy-'));
  Object.assign(process.env, { PUBLIC_PROXY: '1', ALLOWED_ORIGINS: ORIGIN, OPENROUTER_API_KEY: 'sk-operator', IP_DAILY_USD: '0.05', DAILY_BUDGET_USD: '1', IP_RPM: '100', NICHE_CACHE_DIR: dir });
  // OpenRouter stub: every upstream call costs $0.02. Local calls to the test server go through the real fetch.
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://openrouter.ai')) {
      upstream.push({ url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"n":1}' }, finish_reason: 'stop' }], usage: { cost: 0.02 } }), { status: 200 });
    }
    return realFetch(url, init);
  };
  mod = await import('../server.js');
  await new Promise((r) => mod.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${mod.server.address().port}`;
});
after(async () => {
  mod.server.close(); globalThis.fetch = realFetch;
  for (const k of ['PUBLIC_PROXY', 'ALLOWED_ORIGINS', 'OPENROUTER_API_KEY', 'IP_DAILY_USD', 'DAILY_BUDGET_USD', 'IP_RPM', 'NICHE_CACHE_DIR']) delete process.env[k];
  await rm(dir, { recursive: true, force: true });
});

const call = (path, { body, headers = {}, method = 'POST', ip = '203.0.113.7' } = {}) => realFetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'Fly-Client-IP': ip, ...headers }, body: body ? JSON.stringify(body) : undefined });
const chat = (extra = {}) => ({ model: LLM.defaultModels[0], messages: [{ role: 'user', content: 'hi' }], max_tokens: 100, ...extra });

test('public proxy: CORS allowlist and preflight; status reports the public allowance', async () => {
  const pre = await realFetch(`${base}/api/llm`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-disk-cache' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(pre.headers.get('access-control-allow-headers'), /X-Disk-Cache/);
  assert.equal((await call('/api/llm', { body: chat(), headers: { Origin: 'https://evil.example' } })).status, 403, 'another site cannot use the proxy');
  const st = await (await call('/api/status', { method: 'GET' })).json();
  assert.equal(st.serverKey, true); assert.equal(st.public, true); assert.equal(st.limits.ipDailyUsd, 0.05);
});

test('public proxy: only the game\'s models; requests are clamped; web search is forced onto Exa', async () => {
  upstream = [];
  const bad = await call('/api/llm', { body: chat({ model: 'openai/o1-pro' }), ip: '198.51.100.1' });
  assert.equal(bad.status, 403); assert.equal(upstream.length, 0, 'an expensive model never reaches OpenRouter');
  const ok = await call('/api/llm', { body: chat({ max_tokens: 999_999, plugins: [{ id: 'web', engine: 'native', max_results: 50 }, { id: 'evil' }], tools: [{ type: 'function' }] }), ip: '198.51.100.1' });
  assert.equal(ok.status, 200);
  const sent = upstream[0].body;
  assert.equal(upstream[0].auth, 'Bearer sk-operator');
  assert.equal(sent.max_tokens, 16000);
  assert.deepEqual(sent.plugins, [{ id: 'web', engine: 'exa', mode: 'auto', max_results: 10 }]);
  assert.equal(sent.tools, undefined);
});

test('public proxy: per-IP daily spend cap uses the real reported cost; a player\'s own key bypasses it and is used', async () => {
  upstream = [];
  const ip = '192.0.2.50';
  for (let i = 0; i < 3; i++) assert.equal((await call('/api/llm', { body: chat({ seed: i }), ip })).status, 200); // 3 × $0.02 = $0.06 ≥ $0.05
  const capped = await call('/api/llm', { body: chat({ seed: 9 }), ip });
  assert.equal(capped.status, 429);
  const j = await capped.json();
  assert.equal(j.budget, true); assert.match(j.error, /own OpenRouter key/);
  assert.equal((await call('/api/llm', { body: chat({ seed: 9 }), ip: '192.0.2.51' })).status, 200, 'another player still has an allowance');
  const own = await call('/api/llm', { body: chat({ model: 'openai/o1-pro', seed: 10 }), ip, headers: { 'X-OpenRouter-Key': 'sk-player' } });
  assert.equal(own.status, 200, 'own key: no cap, any model');
  assert.equal(upstream.at(-1).auth, 'Bearer sk-player');
});

test('public proxy: clients cannot write the shared cache; the server caches X-Disk-Cache replies itself', async () => {
  assert.equal((await call('/api/cache/abcdef0123456789', { method: 'PUT', body: { data: 'poison' } })).status, 403);
  upstream = [];
  const body = chat({ seed: 777, plugins: [webPlugin('research', 10)] });
  const a = await (await call('/api/llm', { body, headers: { 'X-Disk-Cache': '1' }, ip: '192.0.2.90' })).json();
  await new Promise((r) => setTimeout(r, 30));
  const b = await (await call('/api/llm', { body, headers: { 'X-Disk-Cache': '1' }, ip: '192.0.2.91' })).json();
  assert.equal(upstream.length, 1, 'the second identical request is served from the server cache');
  assert.equal(a.usage.cost, 0.02); assert.equal(b.usage.cost, 0); assert.equal(b.cached, true);
});

test('ProxyGuard: global daily budget and per-minute rate; a new UTC day resets spend; local mode is unrestricted', () => {
  let t = Date.parse('2026-10-20T10:00:00Z');
  const g = new ProxyGuard({ ...guardConfig({ PUBLIC_PROXY: '1', DAILY_BUDGET_USD: '0.10', IP_DAILY_USD: '1', IP_RPM: '2' }) }, { now: () => t });
  assert.equal(g.check('a'), null); assert.equal(g.check('a'), null);
  assert.equal(g.check('a').status, 429, 'third request in a minute');
  t += 61_000;
  g.charge('b', 0.1);
  assert.match(g.check('c').error, /today's budget/);
  t = Date.parse('2026-10-21T00:00:01Z');
  assert.equal(g.check('c'), null, 'the budget resets at UTC midnight');
  const local = new ProxyGuard(guardConfig({}));
  assert.equal(local.check('x'), null);
  assert.equal(local.sanitizeLlm({ model: 'anything', max_tokens: 99999 }), null);
});
