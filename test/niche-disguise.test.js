// Niche dossier disguise hardening: aliased entities lose re-identifying attributes, market facts and real vendors /
// associations stay, aliases are unique, everything is deterministic and idempotent. Seconds, no live calls.
// The fixture is fabricated (no real people); company names are invented placeholders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disguise, looksLikePII, bucketCount, FUDGE_MIN, FUDGE_MAX } from '../public/core/niche-disguise.js';
import { normalizeDossier, RESEARCH_SYSTEM } from '../public/core/niche-research.js';

const RAW = {
  description: 'Multi-location dental practices in Texas run on practice-management platforms that cost $400-900 per location per month. The Texas Dental Association and the ADA publish the benchmarks.',
  archetypes: [{ name: 'DSO-backed group', sizeBand: '25-150 locations', employees: { lo: 200, hi: 900 }, revenueUsd: { lo: 20000000, hi: 90000000 }, countInRegion: { lo: 30, hi: 60 },
    note: 'Zephyr Dental Alliance is Carrollton-based with 180+ locations and has been Brentwood Associates-backed since March 2021.' }],
  exampleCompanies: [
    { name: 'Zephyr Dental Alliance', note: 'Headquartered in Carrollton, Texas with 180+ locations and 2,400 employees; moved to Denticon in April 2026. Owned by Brentwood Associates. Won the Dallas Business Journal Best Places to Work Award. See zephyrdental.com. Founded by Marcus Ellison.' },
    { name: 'Larkspur Smiles LLC', note: 'Frisco-based, 35 offices, launched the "SmileSync" app in June 2025.' },
  ],
  roles: [{ title: 'Regional operations director', cares: ['same-day scheduling'] }],
  workflows: ['Zephyr Dental Alliance moved all 180 offices to Denticon in April 2026 after the Carrollton team piloted it.', 'Front desk verifies insurance the day before each visit.'],
  tools: [{ name: 'Denticon', category: 'practice management' }, { name: 'Dentrix', category: 'practice management' }],
  vocabulary: ['production', 'hygiene recall'],
  painTriggers: ['Insurance claim backlog after a PMS migration'],
  incidents: ['Larkspur Smiles lost a week of claims during its 2025 migration; Priya Raman, DDS, fixed it. Reach her at priya@larkspurdental.com or 214-555-0187 at 4500 Preston Road, Suite 210, Dallas, TX 75205.', 'Dr. Okafor said the vendor outage cost the group $12,000.'],
  spend: { problemUsdPerMonth: { lo: 5000, hi: 15000 }, softwareUsdPerMonth: { lo: 8000, hi: 24000 }, budgetNorm: 'Regional director approves above $10,000' },
  buying: { process: 'Regional director signs after the operations team trials it. Founder Marcus Ellison approves large rollouts.', signers: ['Regional director'], cycleDays: { lo: 45, hi: 120 } },
  communities: [{ name: 'Texas Dental Association', kind: 'association', url: 'https://www.tda.org' }, { name: 'Dental Group Practice Summit', kind: 'event', url: '' }],
  objections: ['Migration downtime', 'Dana Whitfield - Chief Operating Officer at Zephyr Dental Alliance said switching costs are high.'],
  seasonality: 'Busy in Q4 before benefits reset.',
  agencies: [
    { name: 'Clearwater Media', kind: 'marketing', pricing: '$3,500 per month retainer', priceUsd: { lo: 3000, hi: 6000 }, unit: 'per month' },
    { name: 'Clearwater Creative', kind: 'marketing', pricing: '$5,000 per month for 12 clients', priceUsd: { lo: 4000, hi: 8000 }, unit: 'per month' },
    { name: 'Harbor Growth Partners', kind: 'marketing', pricing: '$2,500 per month', priceUsd: { lo: 2000, hi: 4000 }, unit: 'per month' },
  ],
  citations: [{ url: 'https://www.tda.org/resources', title: 'TDA resources' }],
};
const KEY = 'abcd1234abcd1234';
const mk = () => normalizeDossier(RAW);
const textOf = (d) => JSON.stringify({ ...d, citations: undefined });

test('re-identifying attributes next to aliased entities are scrubbed', () => {
  const d = disguise(mk(), { seedKey: KEY });
  const txt = textOf(d);
  for (const bad of ['Zephyr', 'Larkspur', 'Clearwater Media', 'Harbor Growth', 'Carrollton', 'Frisco', 'Brentwood', 'April 2026', 'March 2021', 'June 2025', 'zephyrdental.com', 'SmileSync', 'Best Places to Work Award', 'Dallas Business Journal', '180+', '2,400', 'Marcus', 'Ellison']) {
    assert.ok(!txt.includes(bad), `still contains "${bad}": ${txt.match(new RegExp(`.{0,60}${bad.replace(/[+.]/g, '\\$&')}.{0,60}`))?.[0]}`);
  }
  assert.match(d.exampleCompanies[0].note, /Texas/, 'state level stays');
  assert.match(d.exampleCompanies[0].note, /100-250 locations/, 'counts are bucketed');
  assert.match(d.exampleCompanies[0].note, /PE firm/);
  assert.match(d.archetypes[0].note, /regional/, 'HQ town dropped');
  assert.match(d.workflows[0], /Denticon/, 'the vendor stays named');
  assert.match(d.workflows[0], /recently/, 'dates tied to the entity become vague');
  assert.match(d.workflows[0], /100-250 offices/);
});

test('general market facts, vendors, associations and events are kept', () => {
  const d = disguise(mk(), { seedKey: KEY });
  assert.equal(d.description, RAW.description, 'market-level sentence untouched (no alias in it)');
  assert.equal(d.workflows[1], RAW.workflows[1]);
  assert.equal(d.seasonality, RAW.seasonality);
  assert.deepEqual(d.tools.map((t) => t.name), ['Denticon', 'Dentrix']);
  assert.deepEqual(d.communities.map((c) => c.name), ['Texas Dental Association', 'Dental Group Practice Summit']);
  assert.match(d.description, /Texas Dental Association/);
  assert.deepEqual(d.citations, mk().citations);
  assert.match(d.exampleCompanies[0].note, /Denticon/);
});

test('aliases are unique, not near-duplicates, not real names, stable per (key, real name)', () => {
  const d = disguise(mk(), { seedKey: KEY });
  const names = [...d.exampleCompanies, ...d.agencies].map((x) => x.name);
  assert.equal(new Set(names).size, names.length);
  const firsts = names.map((n) => n.split(' ')[0]);
  assert.equal(new Set(firsts).size, firsts.length, `shared first word: ${names}`);
  const src = JSON.stringify(RAW).toLowerCase();
  for (const n of names) assert.ok(!src.includes(n.toLowerCase()), `${n} is a real name in the source`);
  assert.notEqual(d.agencies[0].name, d.agencies[1].name);
  // same (key, real name) -> same alias even when the list order / other names change
  const solo = disguise({ ...mk(), exampleCompanies: [mk().exampleCompanies[1]], agencies: [] }, { seedKey: KEY });
  assert.equal(solo.exampleCompanies[0].name, d.exampleCompanies[1].name);
  assert.notEqual(disguise(mk(), { seedKey: 'ffff0000ffff0000' }).exampleCompanies[0].name, undefined);
  // the alias is used consistently across the dossier
  assert.ok(d.workflows[0].includes(d.exampleCompanies[0].name) && d.incidents[0].includes(d.exampleCompanies[1].name));
});

test('numbers: ranges fudged within bounds, leftover numbers in entity notes fudged, bucket edges stable', () => {
  const raw = mk(), d = disguise(raw, { seedKey: KEY });
  for (const [x, y] of [[d.archetypes[0].employees.lo, 200], [d.spend.problemUsdPerMonth.hi, 15000], [d.buying.cycleDays.hi, 120], [d.agencies[0].priceUsd.lo, 3000]]) {
    assert.ok(x / y >= FUDGE_MIN * 0.97 && x / y <= FUDGE_MAX * 1.03, `${x} vs ${y}`);
  }
  assert.ok(!d.agencies[1].pricing.includes('$5,000'), 'agency price text moves with its range');
  assert.equal(bucketCount(180), '100-250'); assert.equal(bucketCount(35), '25-50'); assert.equal(bucketCount(2400), '1,000-2,500'); assert.equal(bucketCount(3), '3');
});

test('people, emails, phones and street addresses never survive', () => {
  const d = disguise(mk(), { seedKey: KEY });
  const txt = textOf(d);
  assert.ok(!looksLikePII(txt), 'looksLikePII');
  for (const bad of ['priya@', 'larkspurdental', '555-0187', '4500 Preston', 'Suite 210', '75205', 'Priya', 'Raman', 'Okafor', 'Dana Whitfield', 'Whitfield']) assert.ok(!txt.includes(bad), `still contains ${bad}`);
});

test('deterministic and idempotent', () => {
  const a = disguise(mk(), { seedKey: KEY }), b = disguise(mk(), { seedKey: KEY });
  assert.deepEqual(a, b);
  assert.deepEqual(disguise(a, { seedKey: 'other' }), a, 'a disguised dossier is returned unchanged');
  assert.notDeepEqual(disguise(mk(), { seedKey: '1111222233334444' }).archetypes[0].employees, a.archetypes[0].employees);
  assert.ok(a.disguised && /multiplied/.test(a.fudge));
  const before = JSON.stringify(mk()); disguise(mk(), { seedKey: KEY }); assert.equal(JSON.stringify(mk()), before, 'input untouched');
});

test('research prompt asks for primary sources, market-level facts, no addresses or person names', () => {
  assert.match(RESEARCH_SYSTEM, /primary/i);
  assert.match(RESEARCH_SYSTEM, /regulator|government/i);
  assert.match(RESEARCH_SYSTEM, /market-level/i);
  assert.match(RESEARCH_SYSTEM, /street address/i);
  assert.match(RESEARCH_SYSTEM, /person names|names of people/i);
});
