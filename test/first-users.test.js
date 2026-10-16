// "Get your first users" (apps/home/first-users.js): the ordered early-customer checklist ticks itself from real game
// state, points at the next undone step, opens a closed tool only when the founder asks, and renders on Home.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/apps/registry.js'; // registers app metadata for core/unlocks.js
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { ensureProgress, evaluate, isAppUnlocked } from '../public/core/unlocks.js';
import { firstUsersPlan, openStepTool, firstUsersPanel } from '../public/apps/home/first-users.js';
import home from '../public/apps/home.js';

function mk(model) {
  const s = newState({ companyName: 'X', model, path: 'indie', founderName: 'P', seed: 3 });
  ensureStripe(s); ensureMarket(s);
  s.company.oneLiner = '';
  ensureProgress(s); evaluate(s);
  return s;
}

test('B2B plan: steps tick from state and "next" follows the first undone required step', () => {
  const s = mk('smb');
  let p = firstUsersPlan(s);
  assert.equal(p.next.id, 'who');
  assert.equal(p.complete, false);
  assert.deepEqual(p.steps.map((x) => x.id), ['who', 'network', 'discovery', 'list', 'page', 'reach', 'calls', 'commit', 'ship', 'paid']);
  s.company.oneLiner = 'Reconciliation for Shopify stores';
  s.company.icp = 'Finance leads at Shopify brands doing $1-10M';
  s.network = { ...(s.network ?? {}), intros: [{ kind: 'customer' }], people: s.network?.people ?? [] };
  p = firstUsersPlan(s);
  assert.equal(p.steps.find((x) => x.id === 'who').done, true);
  assert.equal(p.steps.find((x) => x.id === 'network').done, true);
  assert.equal(p.next.id, 'discovery');
  s.apps.research = { interviews: Array.from({ length: 5 }, () => ({ real: true, status: 'done' })) };
  s.apps.crm = { contacts: Array.from({ length: 10 }, (_, i) => ({ id: `c${i}` })), inboundQueue: [{ status: 'accepted' }], deals: [] };
  p = firstUsersPlan(s);
  assert.equal(p.next.id, 'calls', 'optional landing page is skipped for "next"; an accepted intro counts as reaching out');
  assert.equal(p.doneCount, 5);
});

test('B2C plan has its own path (launch, communities) and no CRM steps', () => {
  const s = mk('b2c');
  const ids = firstUsersPlan(s).steps.map((x) => x.id);
  assert.ok(ids.includes('launch') && ids.includes('community'));
  assert.ok(!ids.includes('list') && !ids.includes('reach'));
  s.apps.organic = { launch: { day: 1 }, community: { posts: [{}] } };
  const p = firstUsersPlan(s);
  assert.equal(p.steps.find((x) => x.id === 'launch').done, true);
  assert.equal(p.steps.find((x) => x.id === 'community').done, true);
});

test('a closed tool shows Open and opens only on request', () => {
  const s = mk('smb');
  const net = firstUsersPlan(s).steps.find((x) => x.id === 'network');
  assert.equal(net.locked, true);
  assert.equal(isAppUnlocked(s, 'messages'), false, 'rendering the plan opens nothing');
  assert.match(String(firstUsersPanel(s)), /data-fu-open="network"/);
  assert.equal(openStepTool(s, 'network'), 'messages/contacts');
  assert.equal(isAppUnlocked(s, 'messages'), true);
  assert.equal(firstUsersPlan(s).steps.find((x) => x.id === 'network').locked, false);
  openStepTool(s, 'reach');
  assert.equal(isAppUnlocked(s, 'outreach'), true);
});

test('Home renders the checklist until the first payment', () => {
  const s = mk('smb');
  const root = { innerHTML: '', addEventListener() {}, querySelector() { return null; } };
  try { home.render(root, { state: s, params: '', act() {}, navigate() {}, save() {}, render() {} }); } catch { /* charts need a real DOM; the markup is mounted first */ }
  assert.match(root.innerHTML, /Get your first users/);
  assert.match(root.innerHTML, /What it costs/);
});
