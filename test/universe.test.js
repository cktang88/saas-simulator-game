import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchInvestors, universeCount, searchHours, normalizeFilters, FILTERS } from '../public/apps/fundraising/universe.js';
import { FUND_TIERS, ANGEL_TIERS, SECTORS } from '../public/data/vc-universe.js';

const mk = (seed = 1234, linkedin = 500) => ({ seed, apps: {}, founder: { network: { linkedin } } });

test('universe: same game + filters → same firms; different game → different firms', () => {
  const f = { kind: 'vc', stage: 'seed', sector: 'devtools' };
  const a = searchInvestors(mk(), f, { page: 1 }), b = searchInvestors(mk(), f, { page: 1 });
  assert.deepEqual(a, b);
  const st = mk();
  const first = searchInvestors(st, f).map((r) => r.universeKey);
  st.seed = 999999; // the game's rng advances state.seed; the universe must not move with it
  assert.deepEqual(searchInvestors(st, f).map((r) => r.universeKey), first);
  assert.notDeepEqual(searchInvestors(mk(77), f).map((r) => r.firm), a.map((r) => r.firm));
  assert.equal(new Set(first).size, first.length, 'keys unique within a page');
});

test('universe: every filter narrows the population', () => {
  const st = mk();
  const steps = [{}, { kind: 'vc' }, { kind: 'vc', stage: 'seed' }, { kind: 'vc', stage: 'seed', sector: 'fintech' }, { kind: 'vc', stage: 'seed', sector: 'fintech', geo: 'europe_uk' }, { kind: 'vc', stage: 'seed', sector: 'fintech', geo: 'europe_uk', tier: 'established' }];
  const counts = steps.map((f) => universeCount(st, f));
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] < counts[i - 1], `${JSON.stringify(steps[i])}: ${counts[i]} < ${counts[i - 1]}`);
  assert.ok(counts[1] > 2000 && counts[0] > 100000, 'realistic base population (thousands of firms, hundreds of thousands of angels)');
  assert.ok(searchHours(steps.at(-1)) > searchHours({}), 'narrow searches cost more research time');
  // A tiny sub-universe runs out of results instead of inventing firms.
  const tiny = { tier: 'top', geo: 'latam', sector: 'edtech', stage: 'seed' };
  const n = universeCount(st, tiny);
  assert.ok(n < 10);
  assert.equal(searchInvestors(st, tiny).length, n);
});

test('universe: top-tier firms are rare in a broad search, reliable when filtered', () => {
  const st = mk();
  let top = 0, n = 0;
  for (let p = 0; p < 5; p++) for (const r of searchInvestors(st, { kind: 'vc' }, { page: p })) { n++; if (r.fund?.tier === 'top') top++; }
  assert.equal(n, 50);
  assert.ok(top / n < 0.05, `broad search top share ${top}/${n}`);
  const only = searchInvestors(st, { tier: 'top' }, { pageSize: 20 });
  assert.equal(only.length, 20);
  assert.ok(only.every((r) => r.fund.tier === 'top'));
  // Top tier is warm-intro-gated: even a big network rarely has a path.
  const big = mk(1234, 2500);
  const warmTop = searchInvestors(big, { tier: 'top' }, { pageSize: 60 }).filter((r) => r.warmPath).length;
  const warmMicro = searchInvestors(big, { tier: 'micro' }, { pageSize: 60 }).filter((r) => r.warmPath).length;
  assert.ok(warmTop < warmMicro, `${warmTop} < ${warmMicro}`);
});

test('universe: sector filter → thesis names the sector; fund size filter respected', () => {
  const st = mk();
  for (const sec of ['legal', 'climate', 'ai_agents']) {
    const label = SECTORS.find((s) => s.id === sec).label.toLowerCase();
    for (const r of searchInvestors(st, { kind: 'vc', sector: sec })) {
      assert.ok(r.thesis.toLowerCase().includes(label), r.thesis);
      assert.ok(r.sectors.includes(sec));
    }
  }
  for (const r of searchInvestors(st, { kind: 'vc', fundSize: 'micro' }, { pageSize: 30 })) assert.ok(r.fund.size >= 25e6 * 0.95 && r.fund.size <= 100e6 * 1.05, `${r.fund.size}`);
});

test('universe: records are drop-in CRM investors with consistent check/ownership math', () => {
  const st = mk();
  const recs = [...searchInvestors(st, { kind: 'vc' }, { pageSize: 40 }), ...searchInvestors(st, { kind: 'vc', stage: 'series-a' }, { pageSize: 20 })];
  for (const r of recs) {
    for (const k of ['name', 'firm', 'email', 'stage', 'kind', 'archetypeLabel', 'thesis', 'persona', 'universeKey']) assert.ok(r[k], `${k} missing`);
    assert.equal(r.source, 'generated');
    assert.match(r.email, /\.example$/);
    assert.ok(r.checkMin > 0 && r.checkMax >= r.checkMin);
    assert.ok(r.capMin > 0 && r.capMax > r.capMin);
    assert.ok(r.coldReplyRate > 0 && r.warmMeetingRate > 0 && r.decisionDaysMax >= r.decisionDaysMin);
    const t = FUND_TIERS[r.fund.tier];
    assert.ok(r.fund.size >= t.fundSize[0] * 0.95 && r.fund.size <= t.fundSize[1] * 1.05);
    const stage = r.stage.split(',')[0];
    const [ca, cb] = t.firstCheck[stage];
    assert.ok(r.checkMin >= ca * 0.95 && r.checkMax <= cb * 1.25, `${r.fund.tier} ${stage} ${r.checkMin}-${r.checkMax}`);
    const [omin] = r.fund.ownership[stage];
    if (r.leads) assert.ok(r.checkMax / r.capMax >= omin * 0.6, 'a lead can reach its minimum ownership at its max cap');
    assert.match(r.persona, /Fund [IVX]+ is \$/);
  }
  const angels = searchInvestors(st, { kind: 'angel' }, { pageSize: 20 });
  assert.ok(angels.every((a) => a.fund === null && ANGEL_TIERS[a.angelTier] && ['angel', 'syndicate', 'angel_group', 'scout'].includes(a.kind) && !a.leads));
  assert.ok(angels.some((a) => /\(individual\)/.test(a.firm)), 'individual angels have personal names');
});

test('universe: filters normalize and the module never uses Math.random/Date.now', () => {
  assert.deepEqual(normalizeFilters({ tier: 'operator', fundSize: 'mega' }), { kind: 'angel', tier: 'operator', fundSize: 'any', stage: 'any', sector: 'any', geo: 'any' });
  assert.equal(normalizeFilters({ kind: 'angel', tier: 'top' }).tier, 'any');
  assert.ok(FILTERS.tier.includes('top') && FILTERS.kind.includes('angel'));
  const src = readFileSync(new URL('../public/apps/fundraising/universe.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random|Date\.now/.test(src));
});
