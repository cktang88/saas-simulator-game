// DNS rebinding against the local server (npm start): a page on an attacker's domain that re-points its DNS at
// 127.0.0.1 is "same origin" to the browser, so CORS doesn't stop it. Its requests still carry the attacker's name in
// the Host header, so the server only answers names that can't be rebound by someone else. Offline: no upstream calls.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ProxyGuard, guardConfig } from '../proxy-guard.js';

const req = (host) => ({ headers: host == null ? {} : { host } });

test('hostAllowed: loopback names, IP literals, this machine and ALLOWED_HOSTS pass; other domains are refused', () => {
  const g = new ProxyGuard(guardConfig({ MACHINE_HOSTNAME: 'Studio', ALLOWED_HOSTS: 'game.lan, .home.example' }));
  for (const h of ['localhost:3000', 'LOCALHOST', 'app.localhost:3000', '127.0.0.1:3000', '192.168.1.20:3000', '[::1]:3000', '[fe80::1]', 'studio:3000', 'studio.local', 'game.lan', 'home.example', 'pc.home.example:8080']) {
    assert.equal(g.hostAllowed(req(h)), true, h);
  }
  for (const h of ['evil.example', 'evil.example:3000', 'localhost.evil.example', '127.0.0.1.nip.io', 'studio.evil.example', 'game.lan.evil.example', 'xhome.example', '[]']) {
    assert.equal(g.hostAllowed(req(h)), false, h);
  }
  assert.equal(g.hostAllowed(req(null)), true, 'no Host header: not a browser');
  const pub = new ProxyGuard(guardConfig({ PUBLIC_PROXY: '1' }));
  assert.equal(pub.hostAllowed(req('saas-founder-sim.fly.dev')), true, 'a public proxy answers its own public name');
});

let mod, port;
const realFetch = globalThis.fetch;
const upstream = [];
before(async () => {
  for (const k of ['PUBLIC_PROXY', 'ALLOWED_HOSTS', 'ALLOWED_ORIGINS']) delete process.env[k];
  process.env.OPENROUTER_API_KEY = 'sk-local-env-key';
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://openrouter.ai')) { upstream.push(String(url)); return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }], usage: { cost: 0 } }), { status: 200 }); }
    return realFetch(url, init);
  };
  mod = await import('../server.js');
  await new Promise((r) => mod.server.listen(0, '127.0.0.1', r));
  port = mod.server.address().port;
});
after(() => { mod.server.close(); globalThis.fetch = realFetch; delete process.env.OPENROUTER_API_KEY; });

// node:http (not fetch) so the test can set the Host header a rebound page would send.
const hit = (path, host, { method = 'GET', body = null, headers = {} } = {}) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, path, method, headers: { Host: host, ...(body ? { 'Content-Type': 'text/plain' } : {}), ...headers } }, (res) => {
    let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, body: data }));
  });
  r.on('error', reject);
  if (body) r.write(body);
  r.end();
});

test('local server: a rebound page (attacker Host, same-origin Origin) cannot spend the .env key or read the game', async () => {
  const llm = JSON.stringify({ model: 'anthropic/claude-haiku-5.5', messages: [{ role: 'user', content: 'hi' }] });
  const evil = await hit('/api/llm', 'evil.example:' + port, { method: 'POST', body: llm, headers: { Origin: `http://evil.example:${port}` } });
  assert.equal(evil.status, 403); assert.match(evil.body, /ALLOWED_HOSTS/);
  assert.equal((await hit('/api/status', 'evil.example')).status, 403);
  assert.equal((await hit('/', 'evil.example')).status, 403, 'static files too');
  assert.equal(upstream.length, 0, 'nothing reached OpenRouter');
  // The real game still works on localhost and by IP.
  assert.equal((await hit('/api/status', `localhost:${port}`)).status, 200);
  assert.equal((await hit('/api/status', `127.0.0.1:${port}`)).status, 200);
  const ok = await hit('/api/llm', `localhost:${port}`, { method: 'POST', body: llm, headers: { Origin: `http://localhost:${port}` } });
  assert.equal(ok.status, 200); assert.equal(upstream.length, 1);
});
