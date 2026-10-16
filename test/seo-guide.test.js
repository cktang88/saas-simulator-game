// SEO step guide (public/apps/growth/seoGuide.js): the current step follows what the founder has actually done, and
// each published page explains why it has no traffic yet. Pure reads, no simulation horizon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket } from '../public/core/market.js';
import { publishArticle, ensureOrganic } from '../public/apps/growth/organicEngine.js';
import { ensureSeo, technicalSetup } from '../public/apps/growth/seoDynamics.js';
import { ensureSearch } from '../public/apps/searchtools/geo.js';
import { subscribe } from '../public/apps/searchtools/tools.js';
import { seoSteps, articleLag } from '../public/apps/growth/seoGuide.js';

function fresh() {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed: 3 });
  ensureMarket(s); ensureOrganic(s); ensureSeo(s); ensureSearch(s);
  return s;
}
const J = { quality: 0.7, slop: 0.05, informational: true, citable: 0, results: [], mock: true };
const body = Array.from({ length: 300 }, (_, i) => `w${i}`).join(' ');
const cur = (s) => seoSteps(s).steps[seoSteps(s).current].id;

test('current SEO step follows setup, keyword tool, publishing, indexing and ranking', () => {
  const s = fresh();
  assert.equal(cur(s), 'setup');
  technicalSetup(s, { gsc: true, sitemap: true });
  assert.equal(cur(s), 'keyword');
  subscribe(s, 'planner');
  assert.equal(cur(s), 'write');
  const a = publishArticle(s, { title: 'Reconcile Stripe payouts in QuickBooks', query: 'reconcile stripe payouts in quickbooks', body, judge: J });
  a.stuck = false;
  assert.equal(cur(s), 'index');
  assert.match(articleLag(s, a), /Waiting for Google/);
  s.day += a.indexLag; // indexed, too young to rank
  assert.equal(cur(s), 'rank');
  assert.match(articleLag(s, a), /not ranking/);
  a.position = 35; s.day += 400; // settled deep
  assert.equal(cur(s), 'rank');
  assert.match(articleLag(s, a), /#\d+ \(page \d\)/);
  a.position = 4;
  assert.equal(cur(s), 'traffic');
  a.signups = 2;
  assert.equal(cur(s), 'compound');
});

test('publishing without setup keeps step 1 current; a stuck page says how to fix it', () => {
  const s = fresh();
  const a = publishArticle(s, { title: 'X', query: 'accounting software', body, judge: { ...J, slop: 0.9 } });
  const r = seoSteps(s);
  assert.equal(r.steps[r.current].id, 'setup');
  assert.ok(r.steps.find((x) => x.id === 'write').done);
  a.stuck = true;
  assert.match(articleLag(s, a), /not indexed.*request indexing/);
  assert.match(articleLag(s, a), /AI slop/);
});
