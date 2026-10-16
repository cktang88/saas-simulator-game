// Data integrity review: loads every module in public/data and checks the cross-references and numeric invariants the
// consuming code relies on (ids that must exist, shares that must sum to 1, probabilities in 0..1, ordered ranges,
// keys the consumer actually reads). Fast and static: no simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const DATA = path.join(PUB, 'data');

const MODS = {};
for (const f of fs.readdirSync(DATA).filter((f) => f.endsWith('.js'))) MODS[f] = await import(path.join(DATA, f));
const D = (f) => MODS[f];

function jsFiles(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) jsFiles(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
const CODE = jsFiles(PUB).filter((p) => !p.startsWith(DATA + path.sep)).map((p) => ({ p, src: fs.readFileSync(p, 'utf8') }));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const inRange01 = (x) => typeof x === 'number' && x >= 0 && x <= 1;
const ordered = (r) => Array.isArray(r) && r.length === 2 && r[0] <= r[1];
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('every data export is free of undefined and NaN values', () => {
  const bad = [];
  for (const [f, mod] of Object.entries(MODS)) {
    const seen = new Set();
    const walk = (o, at, d) => {
      if (o === undefined) { bad.push(`${f}:${at}`); return; }
      if (typeof o === 'number' && Number.isNaN(o)) { bad.push(`${f}:${at} NaN`); return; }
      if (o === null || typeof o !== 'object' || seen.has(o) || d > 12 || o instanceof Set || o instanceof Map) return;
      seen.add(o);
      for (const [k, v] of Object.entries(o)) walk(v, `${at}.${k}`, d + 1);
    };
    for (const [k, v] of Object.entries(mod)) walk(v, k, 0);
  }
  assert.deepEqual(bad, []);
});

test('every named import from public/data exists, and dotted paths the code reads off data objects resolve', () => {
  const missing = [], badPaths = [];
  const ARRAY_STOP = new Set(['find', 'map', 'filter', 'some', 'every', 'length', 'slice', 'includes', 'forEach', 'reduce', 'flatMap', 'indexOf', 'at', 'join', 'concat', 'sort']);
  for (const { p, src } of CODE) {
    const code = stripComments(src);
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*data\/([a-z0-9-]+\.js)'/g)) {
      const mod = MODS[m[2]];
      if (!mod) { missing.push(`${path.relative(ROOT, p)} -> ${m[2]}`); continue; }
      for (const spec of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        const [orig, alias] = spec.split(/\s+as\s+/).map((s) => s.trim());
        if (!(orig in mod)) { missing.push(`${path.relative(ROOT, p)}: ${orig} from ${m[2]}`); continue; }
        const val = mod[orig];
        if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
        const name = alias || orig;
        for (const mm of code.matchAll(new RegExp(`(?<![\\w.$])${name.replace(/\$/g, '\\$')}((?:\\??\\.[A-Za-z_$][\\w$]*)+)`, 'g'))) {
          let cur = val;
          for (const part of mm[1].split('.').filter(Boolean).map((s) => s.replace(/\?$/, ''))) {
            if (cur == null || typeof cur !== 'object' || cur instanceof Set || cur instanceof Map) break;
            if (Array.isArray(cur) && ARRAY_STOP.has(part)) break;
            if (!(part in cur)) { badPaths.push(`${path.relative(ROOT, p)}: ${name}${mm[1]}`); break; }
            cur = cur[part];
          }
        }
      }
    }
  }
  assert.deepEqual(missing, []);
  assert.deepEqual([...new Set(badPaths)], []);
});

test('buyer segments: committees, paperwork, scenarios and methodologies reference real ids; ranges ordered', () => {
  const B = D('buyer-segments.js');
  const ids = B.BUYER_SEGMENTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate segment id');
  for (const s of B.BUYER_SEGMENTS) {
    assert.ok(B.SEGMENT_GROUPS.includes(s.group), `${s.id} group`);
    const meth = B.METHODOLOGIES[s.methodology.primary];
    assert.ok(meth, `${s.id} methodology`);
    for (const c of s.methodology.critical) assert.ok(meth.elements.some((e) => e.id === c), `${s.id} critical ${c}`);
    assert.ok(s.acvRange[0] < s.acvRange[1], `${s.id} acvRange (committeeFor divides by its log width)`);
    for (const band of ['lt5k', 'k5to25', 'k25to100', 'gt100']) assert.ok(ordered(s.cycleDays[band]), `${s.id} cycleDays.${band}`);
    const roles = new Set(s.committee.map((r) => r.role));
    assert.ok(roles.has('economic_buyer'), `${s.id} economic buyer`);
    for (const r of s.committee) assert.ok(ordered(r.count) && inRange01(r.influence) && inRange01(r.presentProb) && r.titles.length, `${s.id} ${r.role}`);
    for (const p of s.procurement.paperwork) assert.ok(B.PAPERWORK[p.id] && inRange01(p.prob), `${s.id} paperwork ${p.id}`);
    const p = s.procurement;
    assert.ok(p.cardLimit <= p.quoteThreshold && p.quoteThreshold <= p.rfpThreshold, `${s.id} procurement thresholds`);
    for (const sc of s.scenarios) {
      assert.ok(inRange01(sc.prob), `${s.id} ${sc.id} prob`);
      if (sc.effect.needsRole) assert.ok(roles.has(sc.effect.needsRole), `${s.id} ${sc.id} needsRole ${sc.effect.needsRole}`);
      for (const x of sc.effect.paperwork ?? []) assert.ok(B.PAPERWORK[x], `${s.id} ${sc.id} paperwork ${x}`);
    }
    for (const k of ['winRateQualified', 'churnAnnual', 'buyerIsUserProb', 'soloFounderFit']) assert.ok(inRange01(s[k]), `${s.id} ${k}`);
    for (const m of [...s.seasonality.busy, ...s.seasonality.slow, ...p.budgetSetMonths]) assert.ok(Number.isInteger(m) && m >= 1 && m <= 12);
  }
  for (const [k, p] of Object.entries(B.PAPERWORK)) for (const f of ['hours', 'costUsd', 'days']) assert.ok(ordered(p[f]), `${k}.${f}`);
  // Mixed units fixed: the Gong figure is a ratio like its sibling wonVsLostContacts (+130% = 2.3x).
  const mt = B.CROSS_SEGMENT.multithreadWinLift;
  assert.ok(mt.reported > 1 && mt.wonVsLostContacts > 1);
  assert.equal(mt.reported, 2.3);
});

test('churn reasons: mixes sum to 1 over real reasons; signals, tactics and aliases resolve; segment churn brackets the segment figure', () => {
  const C = D('churn-reasons.js'), B = D('buyer-segments.js');
  const checkMix = (id, mix) => {
    assert.ok(Math.abs(sum(Object.values(mix)) - 1) < 1e-6, `${id} mix sums to ${sum(Object.values(mix))}`);
    for (const k of Object.keys(mix)) assert.ok(C.CHURN_REASONS[k], `${id} mix reason ${k}`);
  };
  for (const [id, r] of Object.entries(C.CHURN_REASONS)) {
    for (const s of r.signals) assert.ok(C.SIGNALS[s], `${id} signal ${s}`);
    assert.ok(Math.abs(sum(r.surveyLabels.map((l) => l.w)) - 1) < 0.011, `${id} survey weights`);
    for (const v of Object.values(r.saveable)) assert.ok(inRange01(v));
  }
  for (const v of Object.values(C.GAME_REASON_ALIASES)) if (v) assert.ok(C.CHURN_REASONS[v], `alias ${v}`);
  for (const [id, t] of Object.entries(C.SAVE_TACTICS)) for (const a of t.appliesTo) assert.ok(C.CHURN_REASONS[a], `${id} appliesTo ${a}`);
  for (const [id, e] of Object.entries({ ...C.SEGMENT_CHURN, ...C.B2C_CHURN })) {
    checkMix(id, e.reasonMix);
    for (const s of e.signals) assert.ok(C.SIGNALS[s.id] && ordered(s.leadDays), `${id} signal ${s.id}`);
    for (const t of e.saveTactics) assert.ok(C.SAVE_TACTICS[t.id] && inRange01(t.rate), `${id} tactic ${t.id}`);
  }
  for (const s of B.BUYER_SEGMENTS) {
    const sc = C.SEGMENT_CHURN[s.id];
    assert.ok(sc, `${s.id} has churn data`);
    assert.ok(s.churnAnnual >= sc.annualLogoChurn[0] - 1e-9 && s.churnAnnual <= sc.annualLogoChurn[1] + 1e-9, `${s.id} churnAnnual inside SEGMENT_CHURN range`);
  }
  for (const m of ['smb', 'ent', 'b2c']) checkMix(`default ${m}`, C.CROSS.defaultMix[m]);
});

test('operator tiers: one definition per function id (the consumer-app playbook comes from consumer-tiers.js), complete tiers, consumer trap ids exist', () => {
  const O = D('operator-tiers.js');
  // A duplicate object key silently shadows the imported CONSUMER_APP_GROWTH: edits to consumer-tiers.js would be ignored.
  assert.equal(O.OPERATOR_TIERS.consumer_app_growth, D('consumer-tiers.js').CONSUMER_APP_GROWTH);
  const src = fs.readFileSync(path.join(DATA, 'operator-tiers.js'), 'utf8');
  for (const id of O.OPERATOR_FUNCTION_IDS) assert.ok((src.match(new RegExp(`^  ${id}:`, 'gm')) ?? []).length <= 1, `${id} defined twice`);
  for (const [id, f] of Object.entries(O.OPERATOR_TIERS)) {
    for (const t of O.OPERATOR_TIER_ORDER) assert.ok(f.tiers?.[t]?.behaviours?.length, `${id}.${t}`);
    const keys = O.OPERATOR_TIER_ORDER.map((t) => Object.keys(f.tiers[t].outcomes ?? {}).sort().join());
    assert.equal(new Set(keys).size, 1, `${id} outcome keys differ by tier`);
    for (const k of Object.keys(f.tiers.stellar.outcomes ?? {})) assert.ok(f.metrics?.[k], `${id} metric ${k}`);
    const traps = (f.traps ?? []).map((t) => t.id);
    assert.equal(new Set(traps).size, traps.length, `${id} duplicate trap`);
  }
  // functionId literals used by readers and the mistakes ledger
  const ids = new Set();
  for (const { src: s } of CODE) for (const m of s.matchAll(/(?:registerOperatorReader\(|functionId: )'([a-z_]+)'/g)) ids.add(m[1]);
  for (const id of ids) assert.ok(O.OPERATOR_TIERS[id], `functionId ${id}`);
  for (const [fn, list] of Object.entries({ legal_hygiene: ['dpa_unread', 'miss_83b', 'no_ip_assignment', 'soc2_in_deal'], hiring: ['culture_fit', 'recruiter_first', 'role_undefined', 'verbal_offers'], people_management: ['avoid_hard_conversation', 'disguised_employee', 'fire_without_notes', 'positive_only'] })) {
    for (const t of list) assert.ok(O.OPERATOR_TIERS[fn].traps.some((x) => x.id === t), `${fn} trap ${t}`);
  }
});

test('inbound archetypes: outcomes are ones network.js resolves, every public event the code records boosts some archetype', () => {
  const I = D('inbound-archetypes.js');
  const handled = new Set(['waste', 'scam', 'advice', 'hire', 'press', 'intro_customer', 'customer_lead', 'intro_investor', 'investor_meeting', 'intro_partner']);
  const triggers = new Set();
  for (const a of I.INBOUND_ARCHETYPES) {
    assert.ok(Math.abs(sum(a.valueOutcomes.map((o) => o.p)) - 1) < 1e-9, `${a.id} outcome p`);
    for (const o of a.valueOutcomes) assert.ok(handled.has(o.outcome), `${a.id} outcome ${o.outcome}`);
    for (const t of Object.keys(a.triggerBoostByEvent ?? {})) assert.ok(a.triggers.includes(t), `${a.id} boost ${t} not a trigger`);
    a.triggers.forEach((t) => triggers.add(t));
  }
  const emitted = new Set();
  for (const { src } of CODE) for (const m of src.matchAll(/recordPublicEvent\(\s*\w+,\s*'([a-z_]+)'/g)) emitted.add(m[1]);
  assert.ok(emitted.has('press_coverage'));
  for (const e of emitted) assert.ok(triggers.has(e), `public event '${e}' is recorded but no archetype listens for it`);
  assert.ok(!triggers.has('press_mention'), 'press_mention is never recorded; the event is press_coverage');
  const ids = I.INBOUND_ARCHETYPES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('credit programs: every requires/needs key is one eligibility() checks; the OpenAI card/bank perk needs a business account', async () => {
  const P = D('credit-programs.js');
  const src = fs.readFileSync(path.join(PUB, 'apps/aicost/credits.js'), 'utf8');
  const body = src.slice(src.indexOf('export function eligibility'), src.indexOf('export function approvalOdds'));
  const reqKeys = new Set([...body.matchAll(/if \(r\.(\w+)\)/g)].map((m) => m[1]));
  const needKeys = new Set([...body.matchAll(/if \(need\.(\w+)\)/g)].map((m) => m[1]));
  for (const p of P.PROGRAMS) {
    for (const k of Object.keys(p.requires ?? {})) assert.ok(reqKeys.has(k), `${p.id} requires.${k} is never checked`);
    for (const t of p.tiers) {
      for (const k of Object.keys(t.needs ?? {})) assert.ok(needKeys.has(k), `${p.id}.${t.id} needs.${k} is never checked`);
      assert.ok(ordered(t.delay) && inRange01(t.odds) && t.months > 0, `${p.id}.${t.id}`);
    }
  }
  const { newState } = await import('../public/core/state.js');
  const { seedDefaultStack } = await import('../public/core/bank.js');
  const { eligibility } = await import('../public/apps/aicost/credits.js');
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed: 3 });
  seedDefaultStack(s);
  s.company.website = { url: 'https://ledgerly.test' }; s.company.domain = 'ledgerly.test';
  const pre = eligibility(s, 'openai_startups', 'partner_offer');
  assert.equal(pre.eligible, false, 'personal checking cannot claim a business-bank perk');
  assert.ok(pre.failing.some((f) => /business bank/i.test(f)));
  s.bank.accounts.find((a) => a.id === 'checking').personal = false;
  assert.equal(eligibility(s, 'openai_startups', 'partner_offer').eligible, true);
});

test('outcomes and world events: luck surface keys, follow-ons and world condition keys resolve', () => {
  const O = D('outcomes.js'), W = D('world.js');
  const luck = new Set(O.LUCK_EVENTS.map((e) => e.id)), world = new Set(W.WORLD_EVENTS.map((e) => e.id));
  assert.equal(luck.size, O.LUCK_EVENTS.length);
  assert.equal(world.size, W.WORLD_EVENTS.length);
  for (const e of O.LUCK_EVENTS) {
    for (const k of Object.keys(e.surfaceArea ?? {})) assert.ok(k in O.SURFACE_AREA_REFS, `${e.id} surface ${k}`);
    for (const f of e.followOns ?? []) assert.ok(luck.has(f) || world.has(f), `${e.id} followOn ${f}`);
    const base = e.baseRatePerYear * (e.models?.smb ?? 1);
    assert.ok(Math.abs(O.luckRate(e, { ...O.SURFACE_AREA_REFS }, { model: 'smb' }) - base) < 1e-9, `${e.id}: the reference founder gets 1.0`);
    assert.ok(Number.isFinite(O.luckRate(e, {}, { model: 'b2c' })));
  }
  const K = W.WORLD_CONDITION_KEYS, flags = new Set(K.flags);
  for (const e of W.WORLD_EVENTS) {
    const c = e.conditions ?? {};
    for (const dim of ['model', 'stage', 'path', 'aiDependence']) for (const k of Object.keys(c[dim] ?? {})) assert.ok(K[dim].includes(k), `${e.id} ${dim}.${k}`);
    for (const k of [...Object.keys(c.exposure ?? {}), ...(c.requires ?? [])]) assert.ok(flags.has(k), `${e.id} flag ${k}`);
    const rids = e.playerResponses.map((r) => r.id);
    assert.equal(new Set(rids).size, rids.length, `${e.id} responses`);
    for (const r of e.playerResponses) assert.ok(typeof r.hours === 'number' && typeof r.cost === 'number', `${e.id}.${r.id}`);
  }
});

test('lenders: FICO bands sorted and covering each product minimum; underwriting returns finite numbers', () => {
  const L = D('lenders.js');
  for (const p of L.LENDER_PRODUCTS) {
    const b = p.aprByFico ?? [];
    for (let i = 1; i < b.length; i++) assert.ok(b[i].minFico < b[i - 1].minFico, `${p.id} band order`);
    if (b.length) assert.ok(b.at(-1).minFico <= (p.minFico ?? 0), `${p.id}: a FICO at the product minimum has no band`);
    for (const x of b) assert.ok(x.aprMin <= x.aprMax && x.feePct != null, `${p.id} band`);
  }
  for (const fico of [560, 680, 790]) for (const incomeType of ['none', 'w2', 'self_employed']) for (const biz of [0, 4000, 40000]) {
    const prof = { fico, incomeType, annualIncome: incomeType === 'none' ? 0 : 90000, homeEquity: 120000, monthlyDebtPayments: 900, liquidSavings: 30000, retirementVested: 60000, brokerage: 40000, businessMonthlyRevenue: biz, businessAgeMonths: biz ? 18 : 0, familyOfferAmount: 10000 };
    for (const r of L.underwriteAll(prof)) {
      for (const v of [r.maxAmount, r.apr, r.feePct, r.monthlyPaymentAtMax, ...Object.values(r.details ?? {})]) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${r.id} ${JSON.stringify(prof)}`);
      if (r.approved) assert.ok(r.maxAmount > 0, r.id);
    }
  }
});

test('negotiation, investors, regions, comp plans, market truth, niche seeds and channels: cross-references hold', () => {
  const N = D('negotiation.js'), B = D('buyer-segments.js');
  for (const g of B.SEGMENT_GROUPS) assert.ok(N.STYLES[N.SEGMENT_STYLE[g]], `negotiation style for ${g}`);
  for (const k of ['ENTERPRISE_ISSUES', 'VC_PRICED_ISSUES', 'VC_SAFE_ISSUES', 'MNA_ISSUES', 'VENDOR_ISSUES', 'HIRING_ISSUES']) {
    assert.equal(new Set(N[k].map((i) => i.id)).size, N[k].length, k);
    for (const i of N[k]) {
      if (i.type === 'opt') for (const o of i.options) assert.ok(inRange01(o.pu) && inRange01(o.cu), `${k}.${i.id}.${o.id}`);
      else { assert.equal(i.type, 'num'); assert.equal(i.pDir, -i.cDir, `${k}.${i.id}`); if (i.min != null) assert.ok(i.min < i.max); }
    }
  }
  for (const a of D('investor-archetypes.js').INVESTOR_ARCHETYPES) {
    assert.ok(Math.abs(sum(Object.values(a.weights)) - 1) < 1e-6, `${a.id} weights`);
    assert.ok(a.checkMin <= a.checkMax && a.capMin <= a.capMax && a.decisionDaysMin <= a.decisionDaysMax && inRange01(a.coldReplyRate) && inRange01(a.warmMeetingRate), a.id);
  }
  const G = D('regions.js');
  for (const [id, r] of Object.entries(G.REGION_DATA)) { assert.equal(r.english.length, 5); assert.ok(Math.abs(sum(r.english) - 1) < 1e-6, `${id} english`); }
  for (const id of Object.keys(G.PAY_SHARE)) assert.ok(G.REGION_DATA[id], `PAY_SHARE region ${id}`);
  const R = D('roles.js');
  for (const id of Object.keys(G.ROLE_CLASS)) assert.ok(R.ROLES[id] && R.CANDIDATE_POOL[id], `role ${id}`);
  for (const [id, r] of Object.entries(R.ROLES)) for (const t of Object.keys(r.traitWeights ?? {})) assert.ok(R.TRAITS[t], `${id} trait ${t}`);
  const GC = D('gtm-comp.js');
  for (const [k, r] of Object.entries(GC.COMP_ROLES)) {
    assert.ok(r.metrics.includes(r.metric), k);
    for (const m of r.metrics) assert.ok(r.quotas[m] != null, `${k} quota ${m}`);
    assert.ok(R.ROLES[r.jobRole], `${k} jobRole ${r.jobRole}`);
  }
  for (const m of GC.COMP_ROLES.sdr.metrics) assert.ok(GC.BEHAVIOR.sdr[m], `sdr behaviour ${m}`);
  for (const [k, t] of Object.entries(GC.PLAN_TEMPLATES)) for (const key of Object.keys(t.apply)) assert.ok(key in GC.PLAN_DEFAULTS, `${k}.${key}`);
  const M = D('market-truth.js'), C = D('churn-reasons.js');
  for (const g of B.SEGMENT_GROUPS) assert.ok(M.GROUP_JOBS[g]?.length, `jobs for ${g}`);
  for (const id of Object.keys(C.B2C_CHURN)) assert.ok(M.B2C_JOBS[id]?.length, `b2c jobs for ${id}`);
  for (const rel of Object.values(M.CHANNEL_RELATIONSHIP)) assert.ok(rel in M.POLITENESS, rel);
  assert.ok(Math.abs(sum(M.SIZE_SUBSEGMENTS.map((s) => s.shareFrac)) - 1) < 1e-9);
  const NS = D('niche-seeds.js');
  for (const id of Object.keys(NS.TOOLS_BY_SEGMENT)) assert.ok(B.getSegment(id), `tools for unknown segment ${id}`);
  for (const g of B.SEGMENT_GROUPS) for (const t of ['REVENUE_PER_EMPLOYEE', 'NATIONAL_COUNT', 'TOOLS_BY_GROUP', 'VOCAB_BY_GROUP', 'GROUP_AGENCY_MULT']) assert.ok(NS[t][g] != null, `${t}.${g}`);
  assert.ok(Math.abs(sum(NS.SIZE_BANDS.map((b) => b.share)) - 1) < 1e-9);
  const CH = D('channels.js');
  const chIds = new Set(CH.CHANNELS.map((c) => c.id));
  assert.equal(chIds.size, CH.CHANNELS.length);
  for (const c of CH.CHANNELS) for (const k of ['b2c', 'smb', 'ent']) assert.ok(inRange01(c.fit[k]), `${c.id} fit`);
  const used = new Set();
  for (const { p, src } of CODE) {
    for (const m of src.matchAll(/channelById\('([a-z_]+)'\)/g)) used.add(m[1]);
    if (p.includes(`${path.sep}channels${path.sep}`)) for (const m of src.matchAll(/\b(?:ch|channel): '([a-z_]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size > 10);
  for (const id of used) assert.ok(chIds.has(id), `channel id ${id}`);
});
