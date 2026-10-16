// Shared name bank (data/names.js) + core/names.js: big and diverse, unique full names across every system in one
// game, deterministic for a seed, and never moving a caller's random stream. Short, targeted tests only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { rng } from '../public/core/util.js';
import { POOLS, REGIONS, FIRST_NAMES, LAST_NAMES, BLOCKED } from '../public/data/names.js';
import { personName, claimName, drawName, regionMix, emailSlug, isNameTaken } from '../public/core/names.js';
import { syntheticPerson, ensureMarket } from '../public/core/market.js';
import { ensureStripe } from '../public/core/stripe.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { addPerson } from '../public/core/network.js';
import { generateInvestors } from '../public/apps/fundraising/investors.js';
import { searchInvestors } from '../public/apps/fundraising/universe.js';
import { generateAdvisors } from '../public/apps/fundraising/ir.js';
import { generateCandidate } from '../public/apps/cofounder/model.js';
import { makeCandidate } from '../public/apps/people/candidates.js';
import { ensurePeople, createJob } from '../public/apps/people/sim.js';
import { REGION_IDS } from '../public/data/regions.js';

const fresh = (seed = 7, model = 'smb') => {
  const s = newState({ companyName: 'Acme', model, path: 'vc', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 500000, counterparty: 'Pat', category: 'owner_contribution' });
  ensurePeople(s);
  return s;
};

test('names: the bank is large and spread across many regions', () => {
  assert.ok(FIRST_NAMES.length >= 400, `first names: ${FIRST_NAMES.length}`);
  assert.ok(LAST_NAMES.length >= 500, `last names: ${LAST_NAMES.length}`);
  assert.ok(Object.keys(POOLS).length >= 30, 'many cultural pools');
  for (const [id, p] of Object.entries(POOLS)) assert.ok(p.first.length >= 10 && p.last.length >= 10, `pool ${id} too small`);
  // Every hiring region resolves to real pools, and the default mix spans every continent's pools.
  for (const r of REGION_IDS) assert.ok(regionMix(r).length >= 1 && REGIONS[r], `region ${r}`);
  const global = new Set(regionMix(null).map(([id]) => id));
  for (const id of ['us', 'latam_es', 'brazil', 'uk_ie', 'poland', 'nigeria', 'east_africa', 'arab', 'india_north', 'pakistan', 'china', 'japan', 'korea', 'vietnam', 'philippines']) assert.ok(global.has(id), `global mix has ${id}`);
});

test('names: region and country requests stay culturally coherent', () => {
  const s = fresh(3);
  for (let i = 0; i < 30; i++) {
    const j = personName(s, { region: 'japan' });
    assert.ok(POOLS.japan.first.includes(j.first) && POOLS.japan.last.includes(j.last), j.name);
    const b = personName(s, { country: 'Brazil' });
    assert.ok(POOLS.brazil.first.includes(b.first) && POOLS.brazil.last.includes(b.last), b.name);
    const d = drawName(() => rng(s), { region: 'eeu' });
    assert.ok(['poland', 'ukraine', 'romania', 'balkans', 'czech_slovak', 'hungary', 'baltics'].includes(d.pool), d.pool);
  }
});

test('names: several hundred people across systems in one game share no full name', () => {
  const s = fresh(11);
  const names = [];
  for (let i = 0; i < 250; i++) names.push(syntheticPerson(s).name); // self-serve customers and AI-SDR prospects
  for (const g of generateInvestors(s, { count: 60, stage: 'seed', rand: () => rng(s) })) names.push(g.name);
  for (let p = 0; p < 6; p++) for (const r of searchInvestors(s, { kind: 'any', stage: 'seed' }, { page: p })) names.push(r.name.replace(' (screening chair)', ''));
  for (const a of generateAdvisors(s, 20)) names.push(a.name);
  for (let i = 0; i < 25; i++) names.push(generateCandidate({ model: 'smb', need: 'technical', rand: () => rng(s), state: s }).name);
  let n = 0;
  for (const region of REGION_IDS) {
    const job = createJob(s, { role: 'engineer', region, engagement: 'contractor', text: 'x' });
    for (let i = 0; i < 8; i++) names.push(makeCandidate(s, job, null, (p) => `${p}_${n++}`).name);
  }
  // Network contacts written by an LLM can repeat a name: addPerson disambiguates instead of duplicating.
  const dupe = names[0];
  const a = addPerson(s, { name: dupe, relation: 'acquaintance' }), b = addPerson(s, { name: dupe, relation: 'acquaintance' });
  names.push(a.name, b.name);
  assert.ok(names.length >= 450, `generated ${names.length}`);
  const seen = new Map();
  for (const nm of names) { const k = nm.toLowerCase(); assert.ok(!seen.has(k), `duplicate name: ${nm}`); seen.set(k, true); }
  assert.ok(!names.some((x) => x.toLowerCase() === 'pat doe'), "nobody gets the founder's name");
  assert.match(a.name, /^\S+ [A-Z]\. /, 'a namesake gets a middle initial');
});

test('names: deterministic for the same seed, different across seeds', () => {
  const run = (seed) => {
    const s = fresh(seed);
    const out = [];
    for (let i = 0; i < 40; i++) out.push(syntheticPerson(s).name);
    out.push(...generateInvestors(s, { count: 10, stage: 'pre-seed', rand: () => rng(s) }).map((g) => g.name));
    out.push(...searchInvestors(s, { kind: 'vc', stage: 'seed' }).map((r) => r.name));
    return out;
  };
  assert.deepEqual(run(42), run(42));
  assert.notDeepEqual(run(42), run(43));
});

test("names: a collision never moves the caller's stream; heavy reuse still yields unique names", () => {
  const s = fresh(5);
  let calls = 0;
  const stuck = () => { calls++; return 0.37; }; // the same draw every time: every call after the first collides
  const out = new Set();
  for (let i = 0; i < 300; i++) {
    const before = calls;
    out.add(personName(s, { rand: stuck }).name.toLowerCase());
    assert.equal(calls - before, 2, 'exactly two draws per name, collision or not');
  }
  assert.equal(out.size, 300, 'all unique (re-draws, then middle initials)');
  const before = calls;
  personName(s, { rand: stuck, oneDraw: true });
  assert.equal(calls - before, 1, 'oneDraw uses a single draw');
});

test('names: keyed names are stable, claimName disambiguates, blocked names never appear', () => {
  const s = fresh(9);
  const r1 = () => 0.61, a = personName(s, { rand: r1, key: 'u_1' }), b = personName(s, { rand: r1, key: 'u_1' });
  assert.equal(a.name, b.name, 'same key, same person');
  assert.notEqual(personName(s, { rand: r1, key: 'u_2' }).name, a.name, 'another key gets another name');
  assert.equal(claimName(s, a.name, { key: 'u_1' }), a.name);
  const other = claimName(s, a.name, { key: 'x' });
  assert.notEqual(other, a.name);
  assert.ok(other.startsWith(a.first) && other.endsWith(a.last), other);
  assert.equal(claimName(s, 'sec_researcher_7'), 'sec_researcher_7', 'handles are left alone');
  assert.equal(claimName(s, a.name, { keep: true }), a.name, "the player's own contacts are never renamed");
  // Force the draw onto a blocked pairing.
  const pk = POOLS.pakistan, fi = pk.first.indexOf('Imran'), li = pk.last.indexOf('Khan');
  const u = [(fi + 0.5) / pk.first.length, (li + 0.5) / pk.last.length];
  let k = 0;
  const forced = personName(s, { region: 'pakistan', rand: () => u[k++ % 2] });
  assert.ok(BLOCKED.has('imran khan') && forced.name.toLowerCase() !== 'imran khan', forced.name);
  assert.ok(isNameTaken(s, forced.name));
});

test('names: email slugs are ASCII', () => {
  assert.equal(emailSlug('Müller'), 'muller');
  assert.equal(emailSlug("O'Brien"), 'obrien');
  assert.equal(emailSlug('Łukasz'), 'lukasz');
  assert.equal(emailSlug('Yılmaz'), 'yilmaz');
  const s = fresh(2, 'b2c');
  for (let i = 0; i < 50; i++) assert.match(syntheticPerson(s).email, /^[a-z]+\.[a-z]+\d+@gmail\.com$/);
});
