// Contracts between apps and core that no single app owns: bank categories, app ids used for links, automation
// connection ids, job types. Static scans of public/ plus the live registries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '../public/core/bank.js';
import { APPS } from '../public/apps/registry.js';
import { TRIGGERS, ACTIONS, APPS as CONNECTIONS } from '../public/apps/automations/model.js';
import { hasJob } from '../public/core/jobs.js';
import '../public/core/niche.js';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(PUBLIC);
const sources = files.map((f) => ({ f: f.slice(PUBLIC.length + 1), src: readFileSync(f, 'utf8') }));
const lineOf = (src, i) => src.slice(0, i).split('\n').length;

test('every literal bank category passed to post/addRecurring exists in CATEGORIES', () => {
  const bad = [];
  for (const { f, src } of sources) for (const line of src.split('\n')) {
    if (!/\b(post|addRecurring)\(/.test(line)) continue;
    for (const m of line.matchAll(/category: ?'([a-z_]+)'/g)) if (!CATEGORIES[m[1]]) bad.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(bad, []);
});

test('notify / logMistake app ids are registered apps (Home and Outcomes link to #/<app>)', () => {
  const ids = new Set(APPS.map((a) => a.id));
  const bad = [];
  for (const { f, src } of sources) for (const m of src.matchAll(/\b(notify|logMistake)\([^;]*?\bapp: ?'([a-z0-9_-]+)'/g)) if (!ids.has(m[2])) bad.push(`${f}:${lineOf(src, m.index)} ${m[2]}`);
  assert.deepEqual(bad, []);
});

test('every automation trigger and action names a known connection (labels are read without a guard)', () => {
  const bad = [...Object.entries(TRIGGERS), ...Object.entries(ACTIONS)].filter(([, t]) => t.app && !CONNECTIONS[t.app]).map(([id, t]) => `${id}: ${t.app}`);
  assert.deepEqual(bad, []);
});

test('every literal job type enqueued has a registered handler', () => {
  const jobs = new Set(APPS.flatMap((a) => Object.keys(a.jobs ?? {})));
  const bad = [];
  for (const { f, src } of sources) for (const m of src.matchAll(/enqueue\((?:state, )?'([a-z]+:[A-Za-z]+)'/g)) if (!jobs.has(m[1]) && !hasJob(m[1])) bad.push(`${f}:${lineOf(src, m.index)} ${m[1]}`);
  assert.deepEqual(bad, []);
});

test('creator spend is attributed to the organic:ugc channel in CAC by channel (same string the subs carry)', async () => {
  const { newState } = await import('../public/core/state.js');
  const { post, seedDefaultStack } = await import('../public/core/bank.js');
  const { ensureStripe } = await import('../public/core/stripe.js');
  const { ensureMarket } = await import('../public/core/market.js');
  const { ensureConsumer } = await import('../public/apps/consumer/state.js');
  const Cre = await import('../public/apps/consumer/creators.js');
  const { cacByChannel } = await import('../public/apps/money/metrics.js');
  const s = newState({ companyName: 'Nookly', model: 'b2c', path: 'indie', founderName: 'Pat', seed: 7 });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 100000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Habit tracker for busy parents who want to read more books with their kids';
  const C = ensureConsumer(s);
  Object.assign(C.app, { stack: 'expo', built: true, builtDay: 0, status: 'live', liveDay: 0, live: { ios: true, play: false } });
  const b = Cre.postBrief(s, { hooks: ['I read 12 books in 60 days with my 4 year old by doing this 10 minute bedtime thing'], message: 'Track the books you read to your kids', notes: '15-30 s vertical. Add #ad label.', fee: 100, bonusPer1k: 2 }).brief;
  Cre.hireCreators(s, { briefId: b.id, count: 3 });
  for (const p of C.creators.posts) p.postDay = s.day;
  Cre.creatorsDay(s);
  assert.ok(s.bank.txns.some((t) => /UGC post fee/.test(t.description)), 'creator fees were posted');
  const row = cacByChannel(s).rows.find((r) => r.channel === 'organic:ugc');
  assert.ok(row && row.spend > 0, 'creator fees land on organic:ugc, not "marketing (unattributed)"');
});
