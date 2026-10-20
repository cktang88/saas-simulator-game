// Platform wave-2 regressions: proxy client-IP trust, rate-limit eviction, in-flight budget holds, key privacy copy
// for a public "own server", setup waits for the connection before the first AI job, dossier URL sanitising, and
// imported-save validation. All offline and fast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ProxyGuard, guardConfig } from '../proxy-guard.js';
import * as T from '../public/core/transport.js';
import * as llm from '../public/core/llm.js';
import { keyPrivacyText } from '../public/core/keyui.js';
import { normalizeDossier, safeHttpUrl } from '../public/core/niche-research.js';
import { validateImportedSave, stripDangerousKeys } from '../public/core/store.js';

const req = (headers, addr = '10.0.0.9') => ({ headers, socket: { remoteAddress: addr } });

test('proxy-guard ip(): TRUST_PROXY decides which header names the client; spoofed headers are ignored otherwise', () => {
  const h = { 'fly-client-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2, 3.3.3.3' };
  assert.equal(new ProxyGuard(guardConfig({ TRUST_PROXY: 'fly' })).ip(req(h)), '1.1.1.1');
  assert.equal(new ProxyGuard(guardConfig({ TRUST_PROXY: 'fly' })).ip(req({ 'x-forwarded-for': '2.2.2.2' })), '10.0.0.9', 'fly mode never trusts XFF');
  assert.equal(new ProxyGuard(guardConfig({ TRUST_PROXY: 'xff' })).ip(req(h)), '2.2.2.2');
  assert.equal(new ProxyGuard(guardConfig({})).ip(req(h)), '10.0.0.9', 'unset: socket address');
  assert.equal(new ProxyGuard(guardConfig({ TRUST_PROXY: 'none' })).ip(req(h)), '10.0.0.9');
});

test('fly.toml sets TRUST_PROXY=fly', async () => {
  assert.match(await readFile(new URL('../fly.toml', import.meta.url), 'utf8'), /TRUST_PROXY\s*=\s*"fly"/);
});

test('proxy-guard: crossing the IP-map bound evicts stale IPs, not active counters', () => {
  let t = 1_000_000;
  const g = new ProxyGuard(guardConfig({ PUBLIC_PROXY: '1', IP_RPM: '2', DAILY_BUDGET_USD: '100', IP_DAILY_USD: '100' }), { now: () => t });
  g.check('active'); g.check('active');
  assert.equal(g.check('active')?.status, 429);
  t += 61_000;
  for (let i = 0; i < 50_001; i++) g.hits.set(`old${i}`, [t - 61_000]); // stale entries
  t += 1; g.check('active'); g.check('active');
  assert.ok(g.hits.size < 100, 'stale IPs dropped');
  assert.equal(g.check('active')?.status, 429, 'the active IP keeps its count');
});

test('proxy-guard: in-flight holds count against the IP and global budgets, and release on completion', () => {
  const g = new ProxyGuard(guardConfig({ PUBLIC_PROXY: '1', DAILY_BUDGET_USD: '0.05', IP_DAILY_USD: '0.03', RESERVE_EST_USD: '0.02', IP_RPM: '100' }));
  const a = g.reserve('a');
  assert.equal(g.budgetBlock('a'), null);
  const a2 = g.reserve('a');
  assert.equal(g.budgetBlock('a')?.status, 429, 'two concurrent calls hold 0.04 > the 0.03 IP cap');
  assert.equal(g.budgetBlock('b'), null);
  const b = g.reserve('b');
  assert.equal(g.budgetBlock('c')?.budget, true, 'global 0.05 held by in-flight calls');
  g.release(a); g.release(a); g.release(a2); g.release(b); // double release is a no-op
  assert.equal(g.held.total, 0);
  assert.equal(g.budgetBlock('a'), null);
  g.charge('a', 0.01);
  assert.equal(g.spend.byIp.a, 0.01);
  assert.equal(new ProxyGuard(guardConfig({})).reserve('a'), null, 'no holds on a private server');
});

test('server.js holds a reservation around the upstream call', async () => {
  const src = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(src, /guard\.reserve\(ip/);
  assert.match(src, /finally \{ guard\.release\(hold\); \}/);
});

test('keyui: a "your own server" that says public:true gets copy saying the key is withheld', async () => {
  llm.setSettings({ apiKey: 'sk-x', connection: 'selfhost', enabled: true, serverUrl: 'https://pub.example' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ serverKey: true, public: true }) });
  try {
    await llm.applyConnection({ search: '' });
    assert.equal(T.getConnection(), 'selfhost');
    assert.match(keyPrivacyText(), /NOT sent/);
    assert.doesNotMatch(keyPrivacyText(), /your own server, which forwards/);
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ serverKey: false, public: false }) });
    await llm.applyConnection({ search: '' });
    assert.match(keyPrivacyText(), /your own server/);
  } finally {
    globalThis.fetch = realFetch;
    llm.setSettings({ apiKey: '', connection: 'auto', serverUrl: '' });
    T.setMode('server');
  }
});

test('main.js setup: the first competitors job is enqueued only after applyConnection resolves', async () => {
  const src = await readFile(new URL('../public/main.js', import.meta.url), 'utf8');
  const i = src.indexOf('const connReady = llm.applyConnection()');
  const j = src.indexOf("enqueue(state, 'world:competitors'");
  assert.ok(i > 0 && j > i, 'enqueue after the probe starts');
  assert.match(src.slice(i, j), /connReady\.then\(async \(\) => \{/);
});

test('niche dossiers keep only http(s) URLs', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpUrl(' https://ok.example/x '), 'https://ok.example/x');
  assert.equal(safeHttpUrl('data:text/html,hi'), '');
  assert.equal(safeHttpUrl('//evil.example'), '');
  const d = normalizeDossier({
    communities: [{ name: 'A', kind: 'forum', url: 'javascript:alert(1)' }, { name: 'B', kind: 'forum', url: 'https://b.example' }],
    citations: [{ url: 'JavaScript:x', title: 'bad' }, { url: 'http://c.example', title: 'ok' }],
  });
  assert.deepEqual(d.communities.map((c) => c.url), ['', 'https://b.example']);
  assert.deepEqual(d.citations.map((c) => c.url), ['http://c.example']);
});

const goodSave = () => ({ v: 3, day: 12, seed: 7, idCounter: 40, company: { name: 'Acme' }, founder: {}, apps: { crm: {} }, log: [], notifications: [] });

test('import save: shape is validated with clear errors', () => {
  assert.equal(validateImportedSave(goodSave()).company.name, 'Acme');
  const bad = [[null, /JSON object/], [[], /JSON object/], [{ ...goodSave(), v: 2 }, /version/], [{ ...goodSave(), day: 'x' }, /day/],
    [{ ...goodSave(), company: 'Acme' }, /company/], [{ ...goodSave(), apps: [] }, /apps/], [{ ...goodSave(), log: {} }, /log/],
    [{ ...goodSave(), founder: undefined }, /founder/], [{ ...goodSave(), idCounter: -1 }, /idCounter/]];
  for (const [d, re] of bad) assert.throws(() => validateImportedSave(d), (e) => /^Not a valid save file/.test(e.message) && re.test(e.message));
  const withFiles = validateImportedSave({ ...goodSave(), files: [{ id: 'f1', name: 'deck.pdf' }, null, { name: 'no id' }] });
  assert.deepEqual(withFiles.files.map((f) => f.id), ['f1']);
});

test('import save: __proto__ / constructor / prototype keys are stripped at every depth', () => {
  const data = JSON.parse('{"v":3,"day":1,"company":{"name":"A","__proto__":{"polluted":1}},"founder":{},"apps":{"x":{"constructor":{"prototype":{"bad":1}},"deep":[{"__proto__":{"p":1}}]}},"__proto__":{"isAdmin":true}}');
  const clean = validateImportedSave(data);
  assert.equal(Object.hasOwn(clean, '__proto__'), false);
  assert.equal(Object.hasOwn(clean.company, '__proto__'), false);
  assert.equal(Object.hasOwn(clean.apps.x, 'constructor'), false);
  assert.equal(Object.hasOwn(clean.apps.x.deep[0], '__proto__'), false);
  const target = {};
  Object.assign(target, clean);
  assert.equal(target.isAdmin, undefined);
  assert.equal(Object.getPrototypeOf(target), Object.prototype);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(stripDangerousKeys({ a: 1 }), { a: 1 });
});
