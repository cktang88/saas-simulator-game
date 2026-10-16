// Progressive disclosure (core/unlocks.js): fresh games start small, completing to-dos reveals the next ones and opens
// functions, "Expand now" works, old saves keep every app they use, and the tree / help catalogue cover every app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPS } from '../public/apps/registry.js';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { seedDefaultStack } from '../public/core/bank.js';
import { advance } from '../public/core/clock.js';
import {
  ALWAYS_VISIBLE, NODES, NODE_BY_ID, GATED_TABS, CATEGORIES, ensureProgress, evaluate, isAppUnlocked, isTabUnlocked,
  requestNode, expandKey, nodeStatus, toggleStep, providersOf, takeQueue, history, appOfKey,
} from '../public/core/unlocks.js';
import { HELP } from '../public/data/help-catalog.js';

function mk(model = 'smb', { day0 = true } = {}) {
  const s = newState({ companyName: 'X', model, path: 'indie', founderName: 'P', seed: 7 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  s.company.oneLiner = '';
  if (day0) { ensureProgress(s); evaluate(s); }
  return s;
}
const visible = (s) => APPS.filter((a) => (!a.models || a.models.includes(s.company.model)) && isAppUnlocked(s, a.id)).map((a) => a.id);

test('a fresh game shows only the core apps plus the first to-do\'s app', () => {
  for (const model of ['b2c', 'smb', 'ent']) {
    const s = mk(model);
    const v = visible(s).sort();
    assert.deepEqual(v, [...ALWAYS_VISIBLE, 'research'].sort(), `${model}: ${v.join(',')}`);
    const open = NODES.filter((x) => nodeStatus(s, x) === 'available').map((x) => x.id).sort();
    assert.deepEqual(open, ['discovery', 'idea']);
    // Every gated tab starts hidden.
    for (const k of GATED_TABS) assert.equal(isTabUnlocked(s, k), false, k);
  }
});

test('completing a to-do reveals its children and opens their apps, with a history entry', () => {
  const s = mk('smb');
  takeQueue(s);
  s.company.oneLiner = 'Invoice reminders for plumbers';
  s.company.icp = 'Owner-operated plumbing firms, 2-10 techs';
  s.day = 3;
  const r = evaluate(s);
  assert.ok(r.completed.includes('idea'));
  for (const id of ['market', 'network', 'website', 'incorporate']) assert.equal(nodeStatus(s, NODE_BY_ID[id]), 'available', id);
  for (const app of ['market', 'messages', 'website', 'legal']) assert.ok(isAppUnlocked(s, app), app);
  assert.equal(isAppUnlocked(s, 'crm'), false, 'CRM waits for customer discovery');
  const P = ensureProgress(s);
  assert.equal(P.avail.website.by, 'idea', 'the new bullet records what revealed it');
  const q = takeQueue(s);
  assert.ok(q.some((x) => x.kind === 'app' && x.id === 'website'), 'fresh unlocks are queued for the sidebar toast');
  const h = history(s);
  assert.equal(h[0].day, 3);
  assert.ok(h.some((x) => x.id === 'idea' && !x.step) && h.some((x) => x.id === 'idea' && x.step === 'icp'));

  // First real interview → discovery done → CRM, Product, MVP open.
  s.apps.research = { interviews: [{ id: 'iv1', real: true, status: 'done' }] };
  evaluate(s);
  assert.equal(nodeStatus(s, NODE_BY_ID.discovery), 'done');
  for (const app of ['crm', 'product', 'mvp']) assert.ok(isAppUnlocked(s, app), app);
  // Shipping unlocks completion-only tabs.
  s.apps.product = { features: [{ id: 'f', status: 'shipped' }] };
  evaluate(s);
  assert.equal(nodeStatus(s, NODE_BY_ID.ship), 'done');
  assert.ok(isTabUnlocked(s, 'product/changelog'));
  assert.ok(isAppUnlocked(s, 'stripe'), 'first-customer to-do opens Payments');
});

test('expand nodes open only on request; Expand now unlocks a locked app or tab', () => {
  const s = mk('smb');
  s.company.oneLiner = 'x'; s.company.icp = 'y';
  s.company.website = { source: 'paste', text: 'hi', eval: { score: 50 } };
  evaluate(s);
  assert.equal(nodeStatus(s, NODE_BY_ID.seo), 'available');
  assert.equal(isAppUnlocked(s, 'searchtools'), false, 'SEO tools stay hidden until asked for');
  requestNode(s, 'seo');
  assert.ok(isAppUnlocked(s, 'searchtools'));
  assert.ok(isTabUnlocked(s, 'organic/content'));
  assert.notEqual(nodeStatus(s, NODE_BY_ID.seo), 'done', 'asking opens it; publishing an article completes it');
  s.apps.organic = { articles: [{ id: 'a' }] };
  evaluate(s);
  assert.equal(nodeStatus(s, NODE_BY_ID.seo), 'done');

  // Expand now from a locked page / Help, far ahead of the tree.
  assert.equal(isAppUnlocked(s, 'automations'), false);
  expandKey(s, 'automations');
  assert.ok(isAppUnlocked(s, 'automations'));
  expandKey(s, 'books/close');
  assert.ok(isAppUnlocked(s, 'books') && isTabUnlocked(s, 'books/close'));
  expandKey(s, 'research');
  assert.ok(isAppUnlocked(s, 'research'));
});

test('detector sub-steps cannot be ticked by hand', () => {
  const s = mk('smb');
  assert.throws(() => toggleStep(s, 'discovery', 'first'), /ticks itself/);
});

test('old saves keep every app they already use', () => {
  const s = mk('smb', { day0: false });
  advance(s, 5, APPS); // progress is created by the Todos onDay at day 1 (no real activity yet)
  delete s.progress;   // now pretend this is an old save made before progress existed
  s.day = 200;
  s.apps.outreach = { domains: [{ id: 'd1' }] };
  s.apps.crm = { ...(s.apps.crm ?? {}), contacts: [{ id: 'c1' }] };
  s.apps.ads.campaigns = [{ id: 'cmp' }];
  s.company.incorporated = true;
  s.apps.legal.incorporation = { status: 'done' };
  s.apps.research.interviews = [{ id: 'i', real: true, status: 'done' }];
  s.apps.fundraising.cap.safes = [{ id: 'sf' }];
  ensureProgress(s);
  for (const app of ['outreach', 'crm', 'ads', 'legal', 'research', 'fundraising']) assert.ok(isAppUnlocked(s, app), app);
  assert.ok(isTabUnlocked(s, 'outreach/aisdr'), 'a used app keeps all its tabs');
  assert.ok(isTabUnlocked(s, 'fundraising/cap'));
  assert.equal(nodeStatus(s, NODE_BY_ID.incorporate), 'done');
  assert.equal(takeQueue(s).length, 0, 'migration is silent');
  assert.equal(isAppUnlocked(s, 'plg'), false, 'unused apps still start hidden');
});

test('simulation keeps running for hidden apps, and the daily hook evaluates the tree', () => {
  const s = mk('smb', { day0: false });
  advance(s, 20, APPS);
  assert.ok(s.progress, 'Todos onDay creates progress');
  assert.equal(isAppUnlocked(s, 'insights'), false);
  assert.ok((s.apps.insights?.daily ?? []).length >= 20, 'product analytics simulated while hidden');
});

test('tree integrity: gated tabs belong to real apps, go links are reachable, no orphan apps', () => {
  const ids = new Set(APPS.map((a) => a.id));
  for (const k of GATED_TABS) assert.ok(ids.has(appOfKey(k)), `gated tab ${k} names a real app`);
  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const n of NODES) {
    assert.ok(cats.has(n.category), `${n.id} category`);
    assert.ok(ids.has(appOfKey(n.go)), `${n.id} go → ${n.go}`);
    for (const r of (n.requires ?? []).flat()) assert.ok(NODE_BY_ID[r], `${n.id} requires unknown ${r}`);
    for (const a of [...(n.opens?.apps ?? []), ...(n.unlocks?.apps ?? [])]) assert.ok(ids.has(a), `${n.id} opens ${a}`);
    // Where you do it must be visible by the time the to-do is: always visible, opened by this node or by an ancestor.
    const goApp = appOfKey(n.go);
    const anc = new Set();
    const walk = (id) => { for (const r of (NODE_BY_ID[id].requires ?? []).flat()) if (!anc.has(r)) { anc.add(r); walk(r); } };
    walk(n.id);
    const opened = (x) => [...(x.opens?.apps ?? []), ...(x.unlocks?.apps ?? [])].includes(goApp);
    assert.ok(ALWAYS_VISIBLE.includes(goApp) || n.opens?.apps?.includes(goApp) || [...anc].some((id) => opened(NODE_BY_ID[id])), `${n.id}: ${goApp} not reachable`);
  }
  for (const a of APPS) assert.ok(ALWAYS_VISIBLE.includes(a.id) || providersOf(a.id).length > 0, `app ${a.id} is an orphan`);
});

test('help catalogue covers every app id and every gated tab', () => {
  const byApp = Object.fromEntries(HELP.map((e) => [e.app, e]));
  for (const a of APPS) assert.ok(byApp[a.id], `help entry for ${a.id}`);
  for (const k of GATED_TABS) {
    const [app, tab] = k.split('/');
    assert.ok(byApp[app].features.some((f) => f.tab === tab), `help describes gated tab ${k}`);
  }
});
