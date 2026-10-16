// PMF measurement on the hidden market truth: segmented Sean Ellis, retention by segment, false-PMF flags,
// calling PMF, operator tiers. Short, targeted scenarios (no long sims).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket, churnBeforeRenewal } from '../public/core/market.js';
import { ensureStripe } from '../public/core/stripe.js';
import { truthOf, pmfTruth } from '../public/core/truth.js';
import { launchSurvey, closeSurvey, callPmf, checkPmfCalls, surveyCaveats, recordCut, recordRetentionView, analyticsOperatorRead, ensureLab } from '../public/apps/insights/lab.js';
import { surveyCut, segmentVerdict, retentionByGroup, falsePmfFlags, tagOf, applySegmentRetention, pmfScorecard } from '../public/apps/insights/pmf.js';
import { signals } from '../public/apps/outcomes/engine.js';

const STRONG = 'trades:multi', WEAK = ['trades:solo', 'salons_fitness', 'agencies', 'general_contractors:solo'];

function world(seed = 5) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'P', seed });
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = 'Invoice reminders for plumbers and HVAC contractors';
  s.company.icp = '';
  ensureMarket(s).fit.product.score = 0.7;
  s.day = 200;
  return s;
}
let n = 0;
function add(s, seg, count, o = {}) {
  const st = ensureStripe(s);
  for (let i = 0; i < count; i++) {
    const k = ++n, start = o.start ?? 20 + ((k * 7) % 100);
    st.customers.push({ id: `c${k}`, name: `n${k}`, company: o.company ?? null, source: o.source ?? 'direct', meta: { truthSegmentId: seg, ...(o.meta ?? {}) } });
    st.subscriptions.push({ id: `s${k}`, customerId: `c${k}`, price: o.price ?? 49, interval: 'month', quantity: 1, discountPct: o.discount ?? 0, source: o.source ?? 'direct', status: 'active', startDay: start, firstPaidDay: start, paidMonths: o.paidMonths ?? 3, canceledDay: null });
  }
}
const survey = (s, target = 'activated') => closeSurvey(s, launchSurvey(s, { kind: 'pmf', target }));

test('truth fixture: one strong segment, the blended number is far below 40%', () => {
  const s = world();
  assert.equal(truthOf(s).bestSegmentId, STRONG);
  assert.ok(pmfTruth(s, STRONG).veryDisappointed >= 0.4 && pmfTruth(s).veryDisappointed < 0.2);
});

test('segmented survey finds >=40% in the strong segment while the overall number is below the line', () => {
  const s = world();
  add(s, STRONG, 260, { source: 'organic:seo' });
  for (const w of WEAK) add(s, w, 220, { source: 'organic:seo' });
  const sv = survey(s);
  assert.ok(sv.result.n >= 40 && sv.result.share < 0.4, `overall ${sv.result.share} n=${sv.result.n}`);
  const segs = surveyCut(s, sv, 'segment');
  const strong = segs.find((g) => g.key === STRONG);
  assert.ok(strong.enough && strong.share >= 0.4 && strong.meets, JSON.stringify(strong));
  assert.ok(segs.filter((g) => g.key !== STRONG && g.enough).every((g) => g.share < 0.4));
  const v = segmentVerdict(s, sv);
  assert.ok(v.narrow && v.strong.key === STRONG && /Narrow the ICP/.test(v.text));
  // roles and activation are cuttable too; surveying everyone dilutes
  assert.ok(surveyCut(s, sv, 'role').length >= 2 && surveyCut(s, sv, 'activation').length >= 1);
  const all = survey(s, 'all');
  assert.ok(all.result.share < sv.result.share - 0.03, `all ${all.result.share} vs activated ${sv.result.share}`);
});

test('a network-heavy customer base inflates the survey and is flagged', () => {
  const clean = world(), friends = world();
  for (const w of [clean, friends]) { for (const seg of WEAK) add(w, seg, 120, { source: w === friends ? 'network' : 'organic:seo' }); }
  const a = survey(clean), b = survey(friends);
  assert.ok(b.result.share > a.result.share + 0.2, `friends ${b.result.share} vs organic ${a.result.share}`);
  assert.ok(surveyCaveats(b).some((c) => /your own network/.test(c)));
  const bySource = surveyCut(friends, b, 'source');
  assert.equal(bySource[0].key, 'friends / network');
  assert.ok(falsePmfFlags(friends).some((f) => f.id === 'friends_network_revenue'));
  assert.ok(!falsePmfFlags(clean).some((f) => f.id === 'friends_network_revenue'));
});

test('revenue concentration over 30% of MRR is flagged, with the numbers', () => {
  const s = world();
  add(s, STRONG, 10, { price: 50 });
  add(s, STRONG, 1, { price: 450, company: 'BigCo Plumbing' });
  const f = falsePmfFlags(s).find((x) => x.id === 'revenue_concentration');
  assert.ok(f && /BigCo/.test(f.detail) && f.evidence.share > 0.3, JSON.stringify(f));
  const even = world(); add(even, STRONG, 12, { price: 50 });
  assert.ok(!falsePmfFlags(even).some((x) => x.id === 'revenue_concentration'));
});

test('paid-driven growth without organic or referral pull is flagged; pull clears it', () => {
  const paid = world(), mixed = world();
  add(paid, STRONG, 24, { source: 'ads:meta', start: 170 });
  add(mixed, STRONG, 12, { source: 'ads:meta', start: 170 }); add(mixed, STRONG, 12, { source: 'referral', start: 172 });
  assert.ok(falsePmfFlags(paid).some((f) => f.id === 'paid_no_pull'));
  assert.ok(!falsePmfFlags(mixed).some((f) => f.id === 'paid_no_pull'));
  // the Outcomes warning carries the same trace
  assert.ok(signals(paid).warnings.some((w) => w.id === 'false_pmf_paid_no_pull' && /paid acquisition/.test(w.detail)));
});

test('launch spike that decayed, discount-driven sales and design partners are flagged', () => {
  const s = world();
  add(s, STRONG, 30, { start: 120, source: 'organic:launch' }); // one big week ~11 weeks ago
  add(s, STRONG, 2, { start: 195 });
  assert.ok(falsePmfFlags(s).some((f) => f.id === 'launch_spike_decay'));
  const d = world(); add(d, STRONG, 12, { discount: 0.4, start: 180 });
  assert.ok(falsePmfFlags(d).some((f) => f.id === 'discount_driven'));
  const p = world(); add(p, STRONG, 3, { meta: { designPartner: true } }); add(p, STRONG, 2, {});
  assert.ok(falsePmfFlags(p).some((f) => f.id === 'design_partners_as_pmf'));
});

test('founder-led sales that stop winning are flagged', () => {
  const s = world();
  const deals = [];
  const mk = (won, decided) => deals.push({ id: `d${deals.length}`, stage: won ? 'won' : 'lost', createdDay: decided - 30, history: [{ stage: won ? 'won' : 'lost', day: decided }] });
  for (let i = 0; i < 6; i++) mk(i < 3, 30 + i * 5); // prior window (90-180 days ago): 50% win
  for (let i = 0; i < 8; i++) mk(i < 1, 130 + i * 8 > 195 ? 195 : 130 + i * 8); // recent window: ~12% win
  s.apps.crm = { deals, companies: [] };
  s.day = 200;
  const f = falsePmfFlags(s).find((x) => x.id === 'founder_led_no_repeat');
  assert.ok(f && f.evidence.recent < f.evidence.prior / 2, JSON.stringify(f));
});

// Retention shapes: simulate each segment's customers through the real renewal hazard with the segment factor applied.
function simulateRetention(s, seg, count) {
  const st = ensureStripe(s);
  let seed = 12345 + seg.length;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < count; i++) {
    const k = ++n, first = s.day - 8 * 30 - 5;
    const sub = { id: `s${k}`, customerId: `c${k}`, price: 49, interval: 'month', quantity: 1, discountPct: 0, source: 'organic:seo', status: 'active', startDay: first, firstPaidDay: first, paidMonths: 1, canceledDay: null };
    st.customers.push({ id: `c${k}`, name: `n${k}`, company: null, source: 'organic:seo', meta: { truthSegmentId: seg } });
    st.subscriptions.push(sub);
    for (let t = 1; t <= 8; t++) {
      sub.paidMonths = t;
      applySegmentRetention(s, sub);
      if (rand() < churnBeforeRenewal(s, sub)) { sub.status = 'canceled'; sub.canceledDay = first + t * 30; break; }
    }
  }
}

test('retention flattens for the strong segment only', () => {
  const s = world();
  simulateRetention(s, STRONG, 300);
  simulateRetention(s, 'salons_fitness', 300);
  const rows = retentionByGroup(s, 'segment');
  const strong = rows.find((r) => r.key === STRONG), weak = rows.find((r) => r.key === 'salons_fitness');
  assert.equal(strong.state, 'flattening', JSON.stringify(strong));
  assert.equal(weak.state, 'decaying', JSON.stringify(weak));
  assert.ok(strong.floor > weak.floor + 0.15, `${strong.floor} vs ${weak.floor}`);
  const sc = pmfScorecard(s);
  assert.equal(sc.retention.length, 2);
});

function callWorld(flagged) {
  const s = world();
  add(s, STRONG, 30, { source: 'organic:seo' });
  for (const w of WEAK) add(s, w, 160, { source: flagged ? 'network' : 'organic:seo' });
  if (flagged) add(s, WEAK[0], 1, { price: 9000, source: 'network', company: 'Whale' }); // + concentration
  return s;
}
const scaleUp = (s, from) => { for (let i = 0; i < 4; i++) s.bank.txns.push({ day: from + 5 + i * 25, amount: -5000, category: 'advertising' }); };

test('calling PMF on a false signal and then scaling logs premature_scaling_false_pmf (delayed, traceable)', () => {
  const s = callWorld(true);
  const sv = survey(s);
  assert.ok(sv.result.n >= 40);
  const c = callPmf(s, { claim: true, surveyId: sv.id });
  assert.ok(c.falseFlags.length >= 2 && c.truth === false, JSON.stringify(c));
  scaleUp(s, s.day);
  s.day += 91;
  checkPmfCalls(s);
  const m = s.mistakes.find((x) => x.id === 'premature_scaling_false_pmf');
  assert.ok(m && m.delayed && m.cost.usd > 5000 && /friends|network|concentration/.test(m.detail), JSON.stringify(m));
  // same false call without scaling: the cost is the weaker 'premature_pmf', not the scaling mistake
  const t = callWorld(true); const tv = survey(t); callPmf(t, { claim: true, surveyId: tv.id }); t.day += 91; checkPmfCalls(t);
  assert.ok(!t.mistakes.some((x) => x.id === 'premature_scaling_false_pmf') && t.mistakes.some((x) => x.id === 'premature_pmf'));
});

test('calling PMF for the strong segment and scaling there is not a mistake', () => {
  const s = world();
  add(s, STRONG, 120, { source: 'organic:seo' });
  for (const w of WEAK) add(s, w, 60, { source: 'organic:seo' });
  const sv = survey(s);
  const c = callPmf(s, { claim: true, surveyId: sv.id, segmentId: STRONG });
  assert.equal(c.truth, true); assert.equal(c.segmented, true);
  scaleUp(s, s.day); s.day += 91; checkPmfCalls(s);
  assert.ok(!(s.mistakes ?? []).some((x) => x.functionId === 'analytics_pmf'));
});

test('operator tiers separate on segmenting, surveying the right users, retention and false PMF', () => {
  const clean = () => { const s = world(); add(s, STRONG, 200, { source: 'organic:seo' }); for (const w of WEAK) add(s, w, 150, { source: 'organic:seo' }); return s; };
  const read = (s) => analyticsOperatorRead(s);
  const stellar = clean();
  { const sv = survey(stellar); recordCut(stellar, 'segment', { surveyId: sv.id }); recordCut(stellar, 'source'); recordRetentionView(stellar); callPmf(stellar, { claim: true, surveyId: sv.id, segmentId: STRONG }); }
  const good = clean();
  { const sv = survey(good); recordRetentionView(good); callPmf(good, { claim: false, surveyId: sv.id }); }
  const average = clean();
  { survey(average); survey(average, 'all'); }
  const mediocre = callWorld(true);
  { const sv = survey(mediocre, 'all'); callPmf(mediocre, { claim: true, surveyId: sv.id }); }
  const r = { stellar: read(stellar), good: read(good), average: read(average), mediocre: read(mediocre) };
  assert.deepEqual(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.tier])), { stellar: 'stellar', good: 'good', average: 'average', mediocre: 'mediocre' }, JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.score]))));
  assert.ok(r.stellar.score > r.good.score && r.good.score > r.average.score && r.average.score > r.mediocre.score);
  assert.ok(r.mediocre.coaching.some((c) => /false-PMF/.test(c)) && r.average.coaching.some((c) => /Cut the Sean Ellis/.test(c)));
  assert.equal(ensureLab(stellar).pmf.calls[0].sawRetention, true);
});

test('without an idea nothing changes: legacy pooled survey, no tagging', () => {
  const s = world(); s.company.oneLiner = '';
  add(s, STRONG, 50);
  const sv = launchSurvey(s, { kind: 'pmf', target: 'activated', activation: 0.4 });
  assert.equal(sv.pool, undefined);
  assert.equal(tagOf(s, ensureStripe(s).subscriptions[0]), null);
});
