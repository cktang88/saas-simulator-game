import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { EVENTS, eventRate, activity, signals } from '../public/apps/outcomes/engine.js';
import { OUTCOME_TARGETS, luckRate } from '../public/data/outcomes.js';

function founder(busy) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'F', seed: 3 });
  s.day = 120;
  s.apps.product = { features: [{ id: 'f', title: 'A', status: 'shipped', shippedDay: 10 }, ...(busy ? [100, 105, 110, 115].map((d, i) => ({ id: `g${i}`, title: 'B', status: 'shipped', shippedDay: d })) : [])], buildQueue: [], bugs: [] };
  s.apps.organic = { posts: busy ? Array.from({ length: 12 }, (_, i) => ({ day: 95 + i * 2 })) : [], articles: busy ? [{ day: 90 }, { day: 110 }] : [], community: { posts: busy ? [{ day: 100 }, { day: 112 }] : [] }, launch: busy ? { day: 60 } : null, ph: busy ? { day: 100 } : null, daily: [], schedule: [] };
  s.apps.research = { interviews: busy ? Array.from({ length: 16 }, (_, i) => ({ real: true, status: 'done', doneDay: 95 + i })) : [] };
  s.founder.network.x = busy ? 4000 : 200;
  return s;
}

test('luck: surface area from real activity raises the odds of positive luck, with caps', () => {
  const idle = founder(false), busy = founder(true);
  const a = activity(busy);
  assert.ok(a.publicPostsPerWeek >= 2.5 && a.customerConversationsPerWeek >= 3.5 && a.launchesPerYear === 2);
  for (const e of EVENTS.filter((x) => x.polarity === 'positive' && ['viral_post', 'hn_front_page', 'creator_mention'].includes(x.id))) {
    const ri = eventRate(idle, e), rb = eventRate(busy, e);
    assert.ok(rb > ri, `${e.id}: busy ${rb} > idle ${ri}`);
    assert.ok(rb <= e.baseRatePerYear * (e.maxMultiplier ?? 5) * 1.6, `${e.id} capped`);
  }
});

test('luck: diminishing returns and no luck without activity gates', () => {
  const e = EVENTS.find((x) => x.id === 'viral_post');
  const r = (n) => luckRate(e, { publicPostsPerWeek: n, audienceSize: 1000 });
  assert.ok(r(4) - r(2) < r(2) - r(0) + 1e-9);
  assert.equal(eventRate(founder(false), EVENTS.find((x) => x.id === 'hn_front_page')), 0); // never launched
});

test('scorecard: elite habits and failure warnings reflect behaviour', () => {
  const busy = signals(founder(true));
  assert.ok(busy.habits.find((h) => h.id === 'build_in_public'));
  const idle = signals(founder(false));
  assert.ok(idle.warnings.some((w) => w.id === 'no_market_need'), 'idle founder 110 days after ship with no customers is warned');
  assert.ok(idle.warnings.some((w) => w.id === 'no_distribution'));
  assert.ok(!busy.warnings.some((w) => w.id === 'no_distribution'));
  assert.ok(OUTCOME_TARGETS.indie.b2c.pctReach1kMrrBy24mo);
});
