// Operator tiers (ARCHITECTURE principle 7, docs/review/operator-tiers-audit.md 5.1-5.3): the shared reader
// registry and mistakes ledger in core/operator.js, a tier-separation harness driven by OPERATOR_TIERS for every
// function with a reader here, keyword-stuffing fixtures for the offline judges we can reach, and the Scorecard /
// Home read-outs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import {
  registerOperatorReader, readOperators, readOperator, logMistake, mistakesSummary, shrink, tierFromScore,
  MISTAKES_CAP, TIER_RANK, hasOperatorReader, trapCoaching,
} from '../public/core/operator.js';
import { OPERATOR_TIERS, OPERATOR_FUNCTION_IDS, OPERATOR_TIER_ORDER } from '../public/data/operator-tiers.js';
import { READERS } from '../public/apps/outcomes/readers.js';
import { activity, signals } from '../public/apps/outcomes/engine.js';
import { ensureLegal } from '../public/apps/legal/sim.js';
import { gradeTranscript } from '../public/apps/product/interview.js';
import { heuristicUpdate, updateQuality } from '../public/apps/fundraising/ir.js';
import { monthKey, hash } from '../public/core/util.js';
const stepKey = (step) => hash(`${step.subject}\n${step.body}`); // = sales/engine.js stepKey
import { ensureMarket } from '../public/core/market.js';
import { ensureStripe } from '../public/core/stripe.js';
import scorecard from '../public/apps/outcomes.js';
import { nextSteps } from '../public/apps/home.js';

const base = ({ model = 'smb', path = 'vc', day = 200 } = {}) => {
  const s = newState({ companyName: 'Ledgerly', model, path, founderName: 'F', seed: 7 });
  s.day = day;
  s.company.icp = 'Finance leads at 20-200 person Shopify brands';
  return s;
};
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const mix = (n, shares) => { const out = []; for (const [v, sh] of shares) for (let i = 0; i < Math.round(n * sh); i++) out.push(v); while (out.length < n) out.push(shares.at(-1)[0]); return out.slice(0, n); };

// ---------------- Archetype players: inputs a player of each tier would produce (tiers[*].behaviours) ----------------

const ARCHETYPES = {
  customer_discovery: (tier) => {
    const s = base();
    const P = { stellar: [14, 82, 0.6, 0.7, 0], good: [10, 66, 0.3, 0.4, 0], average: [8, 50, 0.1, 0.2, 1], mediocre: [8, 30, 0, 0, 3] }[tier];
    const [n, score, strong, strangers, hypo] = P;
    const commits = mix(n, [[['pilot'], strong], [['followup'], 0.3], [[], 1]]);
    const chans = mix(n, [['cold', strangers], ['warm', 1]]);
    s.apps.research = { interviews: range(n, (i) => ({ id: `iv${i}`, real: true, status: 'done', channel: chans[i], doneDay: 100 + i, grade: { score, commitments: commits[i], hypotheticals: range(hypo, () => 'would you'), source: 'LLM panel' } })) };
    return s;
  },
  cold_outreach: (tier) => {
    const s = base();
    const P = {
      stellar: { n: 120, tiers: [['researched', 0.7], ['warm', 0.3]], q: 0.85, sent: 400, bounced: 4, positive: 12, complaints: 0 },
      good: { n: 150, tiers: [['researched', 0.5], ['basic', 0.4], ['generic', 0.1]], q: 0.7, sent: 500, bounced: 10, positive: 8, complaints: 0 },
      average: { n: 300, tiers: [['basic', 0.5], ['generic', 0.5]], q: 0.55, sent: 900, bounced: 32, positive: 7, complaints: 1 },
      mediocre: { n: 800, tiers: [['generic', 1]], q: 0.3, sent: 2400, bounced: 216, positive: 4, complaints: 12 },
    }[tier];
    const tiersOf = mix(P.n, P.tiers);
    s.apps.crm = { companies: [], contacts: range(P.n, (i) => ({ id: `c${i}`, tier: tiersOf[i], personalization: tiersOf[i] === 'generic' ? '' : `Saw your team at shop ${i} moved month-end close to week ${i % 4 + 1}` })), deals: [], activities: [] };
    const step = { subject: 'month-end close', body: 'Hi {{firstName}}, {{personalization}}. Worth a look?' };
    s.apps.outreach = { domains: [], inboxes: [], enrollments: [], linkedin: { requests: [] }, sequences: [{ id: 'seq', status: 'active', steps: [step], judge: { [stepKey(step)]: { quality: P.q } } }], daily: [{ day: 150, sent: P.sent, bounced: P.bounced, positive: P.positive, complaints: P.complaints, aiSent: 0 }] };
    return s;
  },
  paid_ads: (tier) => {
    const s = base({ model: 'b2c' });
    const price = s.plans[0].price;
    const P = {
      stellar: { target: price * 2, cpaX: 0.7, edits: 1, ents: 5, skill: 0.8, mock: false, rt: 0.1, jump: false },
      good: { target: price * 3, cpaX: 1.0, edits: 2, ents: 3, skill: 0.65, mock: false, rt: 0.2, jump: false },
      average: { target: price * 8, cpaX: 1.6, edits: 4, ents: 2, skill: 0.5, mock: false, rt: 0.3, jump: false },
      mediocre: { target: price * 24, cpaX: 3, edits: 10, ents: 1, skill: 0.3, mock: true, rt: 0.6, jump: true },
    }[tier];
    const A = { accounts: { meta: { targetCpa: P.target } }, campaigns: [{ id: 'cmp', p: 'meta' }], adsets: [], ads: [], creatives: [], rows: [] };
    for (const [k, aud] of [['pros', 'broad'], ['rt', 'retargeting']]) A.adsets.push({ id: k, campaignId: 'cmp', p: 'meta', audience: { type: aud }, optimization: 'trial', edits: range(P.edits, (i) => ({ day: 180 + i, why: P.jump && i === 0 ? 'budget 50 → 200' : 'targeting change' })) });
    for (let e = 0; e < P.ents; e++) { A.creatives.push({ id: `cr${e}`, entity: null, skill: P.skill, judge: { mock: P.mock } }); A.ads.push({ id: `ad${e}`, adsetId: 'pros', creativeId: `cr${e}` }); }
    A.ads.push({ id: 'adrt', adsetId: 'rt', creativeId: 'cr0' });
    const cpa = P.target * P.cpaX;
    for (let d = 170; d < 200; d++) {
      const spend = 100;
      A.rows.push({ d, s: 'pros', a: `ad${d % P.ents}`, sp: spend * (1 - P.rt), tr: (spend * (1 - P.rt)) / cpa, pu: 0 });
      A.rows.push({ d, s: 'rt', a: 'adrt', sp: spend * P.rt, tr: (spend * P.rt) / cpa, pu: 0 });
    }
    s.apps.ads = A;
    return s;
  },
  pricing_packaging: (tier) => {
    const s = base();
    const P = {
      stellar: { ratio: 0.85, surveys: 2, test: { adopted: false, decided: 40 }, inc: { noticeDays: 60, grandfatherMonths: 6, comms: 0.8 }, disc: 0 },
      good: { ratio: 0.7, surveys: 1, test: null, inc: { noticeDays: 30, grandfatherMonths: 0, comms: 0.6 }, disc: 0.1 },
      average: { ratio: 0.5, surveys: 0, test: null, inc: null, disc: 0.3 },
      mediocre: { ratio: 0.3, surveys: 0, test: { adopted: true, decided: 8 }, inc: { noticeDays: 7, grandfatherMonths: 0, comms: 0.2 }, disc: 0.8 },
    }[tier];
    ensureMarket(s).fit.price.wtp = s.plans[0].price / P.ratio;
    s.apps.pricing = {
      history: [{ day: 50, what: 'set price' }], surveys: range(P.surveys, (i) => ({ id: `sv${i}`, status: 'done' })),
      abTests: P.test ? [{ id: 'ab', status: 'stopped', adopted: P.test.adopted, agg: { A: { decided: P.test.decided }, B: { decided: P.test.decided } } }] : [],
      increases: P.inc ? [P.inc] : [],
    };
    s.apps.crm = { deals: range(6, (i) => ({ id: `d${i}`, stage: 'won', discountPct: i < P.disc * 6 ? 0.3 : 0 })) };
    return s;
  },
  fundraising: (tier) => {
    const s = base();
    const P = { stellar: [45, 0.8, 4.5, 14, 4.3], good: [40, 0.55, 3.8, 30, 3.6], average: [40, 0.25, 3, 60, 3], mediocre: [120, 0, 2, 120, 1.8] }[tier];
    const [n, warm, q, spread, perf] = P;
    const ch = mix(n, [['warm', warm], ['cold', 1]]);
    s.apps.fundraising = {
      investors: range(n, (i) => ({ id: `inv${i}`, raiseId: 'r1', status: 'contacted', outreach: { channel: ch[i], day: 100 + Math.round((i / n) * spread), quality: q } })),
      meetings: range(8, (i) => ({ id: `m${i}`, status: 'done', perf })),
    };
    return s;
  },
  investor_relations: (tier) => {
    const s = base();
    const P = { stellar: [6, 4.5, false, 0], good: [5, 3.9, false, 0], average: [3, 3, false, 20, 60], mediocre: [1, 2, true, 150, 30] }[tier];
    const [count, q, hid, lastAgo, gap = 30] = P;
    const lastDay = s.day - lastAgo;
    const days = range(count, (i) => lastDay - (count - 1 - i) * gap);
    s.apps.fundraising = {
      investors: [{ id: 'inv', status: 'committed', closedDay: 20, terms: { amount: 250000 } }],
      cap: { safes: [] },
      ir: { updates: days.map((d) => ({ day: d, month: monthKey(s, d), quality: q, judge: { asks: [{ text: 'Intro to the CFO at Acme', specific: q >= 3 }] } })), hidBadNews: hid },
    };
    return s;
  },
  bookkeeping_close_tax: (tier) => {
    const s = base();
    const P = { stellar: [6, 0, 0, 'bookkeeper'], good: [5, 0.05, 0, 'diy'], average: [3, 0.12, 0, 'diy'], mediocre: [0, 0.25, 1, 'diy'] }[tier];
    const [closedN, misShare, missed, service] = P;
    s.bank.txns = range(40, (i) => ({ id: `t${i}`, day: 5 + i * 5, amount: -100, category: 'software', counterparty: 'Vendor' }));
    const months = [...new Set(s.bank.txns.map((t) => monthKey(s, t.day)))].filter((m) => m < monthKey(s));
    const recent = s.bank.txns.filter((t) => t.day > s.day - 120);
    const cats = Object.fromEntries(recent.map((t, i) => [t.id, { cat: i < Math.round(misShare * recent.length) ? 'advertising' : 'software', by: 'you' }]));
    s.apps.books = { service, cats, rules: {}, closed: Object.fromEntries(months.slice(-6).slice(0, closedN).map((m) => [m, { day: 1 }])), close: {}, compliance: missed ? { 'cest-2027-Q1': { status: 'missed' } } : {} };
    return s;
  },
  legal_hygiene: (tier) => {
    const s = base();
    const L = ensureLegal(s);
    s.company.incorporated = tier !== 'mediocre';
    s.company.entity = tier === 'mediocre' ? 'none' : 'ccorp';
    L.incorporation = s.company.incorporated ? { effectiveDay: tier === 'good' ? 80 : 10 } : null;
    L.founderStock = { grantDay: 12, filed83b: tier === 'stellar' || tier === 'good', missed: tier === 'mediocre' };
    L.docs.ipAssignment = tier !== 'mediocre' && tier !== 'average';
    L.dpaReady = tier === 'stellar' || tier === 'good';
    ensureStripe(s).subscriptions = [{ id: 'sub1', status: 'active', startDay: 60, price: 99, quantity: 1, interval: 'month', planId: 'plan_main' }];
    return s;
  },
  hiring: (tier) => {
    const s = base();
    const P = {
      stellar: { sc: true, exec: 0.85, sample: true, refs: true, post: 0.8, q: 0.8, fee: 0 },
      good: { sc: true, exec: 0.65, sample: true, refs: false, post: 0.65, q: 0.65, fee: 0 },
      average: { sc: false, exec: 0.5, sample: false, refs: true, post: 0.5, q: 0.5, fee: 0 },
      mediocre: { sc: false, exec: 0.2, sample: false, refs: false, post: 0.3, q: 0.3, fee: 24000 },
    }[tier];
    const assessments = { ...(P.sample ? { workSample: { day: 1 } } : {}), ...(P.refs ? { references: { day: 2 } } : {}) };
    s.apps.people = {
      jobs: [{ id: 'job', quality: P.post, scorecard: P.sc ? { outcomes: ['a', 'b', 'c'] } : null }],
      candidates: range(4, (i) => ({ id: `cand${i}`, jobId: 'job', stage: i === 0 ? 'hired' : 'declined', offer: { sentDay: 150 }, interview: { done: true, execution: P.exec }, assessments, quality: P.q })),
      members: P.fee ? [{ id: 'm', kind: 'employee', placement: { fee: P.fee } }] : [],
    };
    return s;
  },
};

// ---------------- Core: registry, shrink, ledger ----------------

test('operator core: unknown without a reader, broken readers read unknown, tiers from scores', () => {
  const s = base();
  assert.equal(readOperator(s, 'no_such_function').tier, 'unknown');
  registerOperatorReader('test_broken', () => { throw new Error('boom'); });
  assert.equal(readOperator(s, 'test_broken').tier, 'unknown');
  registerOperatorReader('test_ok', () => ({ tier: 'good', evidence: ['x'], coaching: ['y'] }));
  assert.equal(readOperators(s).test_ok.tier, 'good');
  assert.equal(tierFromScore(0.85), 'stellar');
  assert.equal(tierFromScore(0.65), 'good');
  assert.equal(tierFromScore(0.45), 'average');
  assert.equal(tierFromScore(0.2), 'mediocre');
  assert.equal(tierFromScore(0.9, { n: 1, minN: 3 }), 'unknown');
});

test('shrink: small samples and offline judgments are pulled toward the median', () => {
  assert.equal(shrink(1, 0), 0.5);
  assert.ok(Math.abs(shrink(1, 5, 0.5, 5) - 0.75) < 1e-9);
  assert.ok(shrink(1, 100) > 0.97);
  assert.ok(shrink(0, 3) > 0.25 && shrink(0, 3) < 0.5);
  assert.equal(shrink(null, 10), 0.5);
});

test('mistakes ledger: records costs, keeps complete totals past the cap, dedupes by key, counts circles', () => {
  const s = base();
  const e = logMistake(s, { functionId: 'legal_hygiene', id: 'miss_83b', label: 'Missed the 83(b)', cost: { usd: 4200 }, detail: 'Vesting taxed as income', delayed: true, app: 'legal' });
  assert.equal(e.cost.usd, 4200);
  assert.equal(e.day, s.day);
  logMistake(s, { functionId: 'product_prioritization', id: 'rebuild', label: 'Rebuilt a killed feature', cost: { hours: 30, days: 14 }, circles: true });
  assert.equal(logMistake(s, { functionId: 'x', id: 'once', cost: { usd: 1 }, key: 'k1' }).id, 'once');
  assert.equal(logMistake(s, { functionId: 'x', id: 'once', cost: { usd: 1 }, key: 'k1' }), null, 'same key is ignored');
  for (let i = 0; i < MISTAKES_CAP + 50; i++) logMistake(s, { functionId: 'cold_outreach', id: 'spam', label: 'Blast', cost: { hours: 1, customers: 0.01 } });
  assert.equal(s.mistakes.length, MISTAKES_CAP);
  const m = mistakesSummary(s);
  assert.equal(m.count, MISTAKES_CAP + 53);
  assert.equal(m.hours, 30 + MISTAKES_CAP + 50);
  assert.equal(m.usd, 4201);
  assert.equal(m.circles, 1);
  assert.equal(m.delayed, 1);
  assert.ok(m.byFunction.find((f) => f.functionId === 'legal_hygiene').usd === 4200);
  assert.ok(m.byMistake.length >= 1 && m.recent.length > 0);
  // A ledger restored without totals is rebuilt from the list.
  const t = base();
  t.mistakes = [{ functionId: 'hiring', id: 'bad_hire', label: 'Bad hire', cost: { usd: 30000, days: 60 }, circles: true, day: 10 }];
  const r = mistakesSummary(t);
  assert.equal(r.usd, 30000);
  assert.equal(r.circleEvents.length, 1);
});

// ---------------- Tier-separation harness, driven by OPERATOR_TIERS ----------------

test('every reader registered here has archetype fixtures and reads unknown before the player acts', () => {
  for (const id of Object.keys(READERS)) {
    assert.ok(OPERATOR_TIERS[id], `${id} is a function in data/operator-tiers.js`);
    assert.ok(ARCHETYPES[id], `${id} has archetype fixtures`);
    assert.ok(hasOperatorReader(id), `${id} registered`);
    assert.equal(readOperator(base(), id).tier, 'unknown', `${id} unknown on a fresh company`);
  }
});

test('tier separation: stellar > good > average > mediocre for every function with a reader', () => {
  for (const id of OPERATOR_FUNCTION_IDS) {
    if (!ARCHETYPES[id] || !hasOperatorReader(id)) continue;
    const reads = OPERATOR_TIER_ORDER.map((tier) => ({ tier, r: readOperator(ARCHETYPES[id](tier), id) }));
    for (const { tier, r } of reads) assert.equal(r.tier, tier, `${id}: ${tier} archetype reads ${r.tier} (score ${r.score}, raw ${r.raw}; ${r.evidence.join(' | ')})`);
    for (let i = 1; i < reads.length; i++) assert.ok(reads[i - 1].r.score > reads[i].r.score, `${id}: ${reads[i - 1].tier} ${reads[i - 1].r.score} > ${reads[i].tier} ${reads[i].r.score}`);
    for (const { r } of reads) assert.ok(r.evidence.length > 0, `${id}: evidence shown`);
  }
});

test('coaching: every mediocre archetype gets at least one trap coaching line from OPERATOR_TIERS, stellar gets no stellar nag', () => {
  for (const id of Object.keys(ARCHETYPES)) {
    const med = readOperator(ARCHETYPES[id]('mediocre'), id);
    const trapLines = OPERATOR_TIERS[id].traps.map((t) => t.coaching);
    assert.ok(med.coaching.some((c) => trapLines.includes(c)), `${id}: mediocre coaching ${JSON.stringify(med.coaching)}`);
    assert.ok(med.coaching.some((c) => /stellar operator/.test(c)), `${id}: says what stellar looks like`);
    const st = readOperator(ARCHETYPES[id]('stellar'), id);
    assert.ok(!st.coaching.some((c) => /What a stellar operator does/.test(c)), `${id}: stellar is not told to be stellar`);
  }
  assert.equal(trapCoaching('hiring', 'culture_fit'), OPERATOR_TIERS.hiring.traps.find((t) => t.id === 'culture_fit').coaching);
});

test('volume is evidence, not score: a 2,400-send generic blast never beats a 120-prospect researched list', () => {
  const blast = readOperator(ARCHETYPES.cold_outreach('mediocre'), 'cold_outreach');
  const careful = readOperator(ARCHETYPES.cold_outreach('stellar'), 'cold_outreach');
  assert.ok(careful.score > blast.score);
  // Ten times more of the same mediocre behaviour reads worse (more evidence of it), never better.
  const s = ARCHETYPES.cold_outreach('mediocre');
  s.apps.outreach.daily[0].sent *= 10;
  assert.ok(readOperator(s, 'cold_outreach').score <= blast.score + 1e-9);
});

// ---------------- Keyword-stuffing fixtures for the offline judges ----------------

test('stuffing: the same "personal" line pasted to every prospect is capped at average', () => {
  const s = ARCHETYPES.cold_outreach('stellar');
  for (const c of s.apps.crm.contacts) c.personalization = 'Saw your recent growth and congrats on scaling your team';
  const r = readOperator(s, 'cold_outreach');
  assert.ok(TIER_RANK[r.tier] <= TIER_RANK.average, `template personalisation reads ${r.tier}`);
  assert.ok(r.coaching.includes(trapCoaching('cold_outreach', 'generic_ai_personalisation')));
});

test('stuffing: a discovery transcript stuffed with Mom Test phrases but no commitment stays below an honest good interviewer', () => {
  const stuffed = [];
  for (let i = 0; i < 8; i++) {
    stuffed.push({ from: 'me', text: `Last time it happened, walk me through who else was involved, what happens if, how much did it cost you ${i}?` });
    stuffed.push({ from: 'them', text: 'Hm, hard to say really.', revealed: [], commitment: 'none' });
  }
  const g = gradeTranscript(stuffed, { facts: {} });
  const s = base();
  s.apps.research = { interviews: range(10, (i) => ({ id: `iv${i}`, real: true, status: 'done', channel: 'warm', doneDay: 120 + i, grade: { ...g, source: 'offline heuristic' } })) };
  const stuffedRead = readOperator(s, 'customer_discovery');
  const honest = readOperator(ARCHETYPES.customer_discovery('good'), 'customer_discovery');
  assert.ok(stuffedRead.score < honest.score, `stuffed ${stuffedRead.score} < honest ${honest.score}`);
  assert.ok(TIER_RANK[stuffedRead.tier] <= TIER_RANK.average, `stuffed reads ${stuffedRead.tier}`);
});

test('stuffing: an investor update padded to satisfy the offline heuristic cannot read stellar', () => {
  const s = ARCHETYPES.investor_relations('stellar');
  const u = { summary: 'Great month.', highlights: 'Everything up.', lowlights: 'some things were slightly slower than we hoped this month but overall we are fine and doing great really', kpis: 'MRR $1 1 2 3 4 5 6 7 8 9 10% 20% 30%', asks: '- Intro to VP Head of CFO at Acme Corp\n- Intro to VP Head of CTO at Beta Corp' };
  const j = heuristicUpdate(u, { mrr: 0, momGrowth: 0.05 });
  const q = updateQuality(j);
  for (const x of s.apps.fundraising.ir.updates) { x.quality = q; x.judge = { ...j, mock: true }; }
  const r = readOperator(s, 'investor_relations');
  assert.notEqual(r.tier, 'stellar', `offline-judged padded updates read ${r.tier} (quality ${q})`);
});

// ---------------- Luck surface area weights quality (audit item 9) ----------------

test('luck surface area: generic posts and merge-field emails count much less than judged-specific ones', () => {
  const mk = (n, skill) => { const s = base(); s.day = 120; s.apps.organic = { posts: range(n, (i) => ({ day: 100 + i, skill, judge: { mock: false } })), articles: [], community: { posts: [] }, daily: [], schedule: [] }; return s; };
  const spam = activity(mk(20, 0.2)).publicPostsPerWeek;
  const good = activity(mk(6, 0.8)).publicPostsPerWeek;
  assert.ok(good > spam, `6 strong posts (${good.toFixed(2)}/wk) beat 20 generic posts (${spam.toFixed(2)}/wk)`);
  const out = (tier) => {
    const s = base(); s.day = 120;
    s.apps.crm = { contacts: range(100, (i) => ({ id: `c${i}`, tier })) };
    const step = { subject: 's', body: 'b' };
    s.apps.outreach = { sequences: [{ id: 'q', steps: [step], judge: { [stepKey(step)]: { quality: tier === 'generic' ? 0.3 : 0.8 } } }], enrollments: range(100, (i) => ({ contactId: `c${i}`, sequenceId: 'q', enrolledDay: 110 })), daily: [{ day: 112, sent: 100, aiSent: 0 }], linkedin: { requests: [] } };
    return activity(s).outboundTouchesPerWeek;
  };
  assert.ok(out('researched') > 3 * out('generic'), `researched ${out('researched')} vs generic ${out('generic')}`);
});

test('PMF habit counts activated-user PMF survey responses only, never exit surveys', () => {
  const s = base();
  s.apps.customers = { surveys: range(60, (i) => ({ day: 100 + i, reason: 'too expensive' })) };
  const h = () => signals(s).habits.find((x) => x.id === 'pmf_measurement');
  assert.equal(h().met, false, 'exit surveys do not fill the PMF habit');
  s.apps.insights = { pmf: { responses: [...range(45, () => ({ activated: true })), ...range(30, () => ({ activated: false }))] } };
  assert.equal(h().met, true);
  assert.match(h().detail, /45 PMF/);
});

// ---------------- Read-outs: Scorecard and Home ----------------

test('Scorecard renders the per-function tier panel and the mistakes ledger', () => {
  const s = ARCHETYPES.hiring('mediocre');
  logMistake(s, { functionId: 'hiring', id: 'bad_hire', label: 'Hired without references', cost: { usd: 18000, hours: 40, days: 45 }, circles: true, detail: 'Replaced after 4 months', app: 'people' });
  const root = { innerHTML: '' };
  scorecard.render(root, { state: s });
  assert.match(root.innerHTML, /Operator quality by function/);
  assert.match(root.innerHTML, /mediocre/);
  assert.match(root.innerHTML, /What your mistakes cost/);
  assert.match(root.innerHTML, /\$18,000/);
  assert.match(root.innerHTML, /Going in circles/);
});

test('Home points to symptoms with a typical range instead of prescribing the decision', () => {
  const s = base({ model: 'smb' });
  ensureStripe(s).subscriptions = range(25, (i) => ({ id: `s${i}`, status: i === 0 ? 'active' : 'canceled', trialEndDay: 150 + i, startDay: 136 + i, cancelReason: i === 0 ? null : 'trial_not_converted', canceledDay: i === 0 ? null : 150 + i }));
  const steps = nextSteps(s).map(([t]) => t);
  const line = steps.find((t) => /Trial-to-paid is 4%/.test(t));
  assert.ok(line, steps.join(' / '));
  assert.match(line, /below the 15%–25% typical/);
  for (const t of steps) assert.doesNotMatch(t, /^(Talk to|Spec your|Ship your|Put up|Have the|Incorporate|Add real|Launch to|Upload)/, `no instruction: ${t}`);
});
