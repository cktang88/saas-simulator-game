// Fractal niches in outbound prospecting and sales personas: niche filter, sub-universes, saved contacts, persona prompts.
// Short and offline (offline dossiers; no live calls).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket } from '../public/core/market.js';
import { nicheConfig, nicheFor, nicheKey, getNode, statsFor } from '../public/core/niche.js';
import { search, universe, ensureProspector, setPlan, reveal, saveList, rowById, syntheticSite, nicheUniverse, DEFAULT_FILTERS } from '../public/apps/sales/prospector.js';
import { personForContact, nicheBriefOf } from '../public/apps/sales/truth-persona.js';
import { prospectSystemPrompt } from '../public/data/persona-prompts.js';
import { addContact } from '../public/apps/sales/model.js';

function mk(icp = 'dental practices') {
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'P', seed: 5 });
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = 'Practice software for dentists'; s.company.icp = icp;
  return s;
}
const F = (o = {}) => ({ ...DEFAULT_FILTERS, ...o });
const companies = (rows) => new Map(rows.map((r) => [r.co.domain, r.co])).values();

test('niche filter creates and reuses a node; same search returns the same companies', () => {
  const s = mk();
  const a = search(s, F({ niche: 'multi-location dental practices in Texas' }));
  const node = Object.values(s.market.niches.nodes).find((n) => n.source === 'prospector' && n.level >= 3);
  assert.ok(node, 'a prospector node exists');
  assert.ok(a.length > 0);
  const hits = getNode(s, node.id).hits;
  const b = search(s, F({ niche: 'multi-location dental practices in Texas' }));
  assert.deepEqual(a.map((r) => r.id), b.map((r) => r.id), 'deterministic');
  assert.equal(getNode(s, node.id).hits, hits, 'a repeated render does not inflate hits');
  const t = mk();
  assert.deepEqual(search(t, F({ niche: 'multi-location dental practices in Texas' })).map((r) => r.id), a.map((r) => r.id), 'same across saves with the same seed');
});

test('narrower niche means fewer companies, and the sub-universe is not padded', () => {
  const s = mk();
  const n = (t) => new Set(search(s, F({ niche: t })).map((r) => r.co.domain)).size;
  const dental = n('dental practices'), mid = n('multi-location dental practices'), tx = n('multi-location dental practices in Texas'), dx = n('multi-location dental practices in Texas using Dentrix');
  assert.ok(dental >= mid && mid > tx && tx >= dx, `${dental} >= ${mid} > ${tx} >= ${dx}`);
  assert.ok(tx < dental * 0.2, 'a state is a small share of the segment');
});

test('deeper narrowing yields companies with the niche tools, titles and region', () => {
  const s = mk();
  const rows = search(s, F({ niche: 'multi-location dental practices in Texas using Dentrix' }));
  assert.ok(rows.length);
  assert.ok(rows.every((r) => r.co.techs.includes('Dentrix')), 'tool niche runs on that tool');
  assert.ok(rows.every((r) => r.co.geo === 'US' && /Texas/i.test(r.co.region)));
  assert.ok(rows.every((r) => r.co.nicheId && r.co.nichePath.length >= 4));
  const broad = search(s, F({ niche: 'dental practices' }));
  const share = (rs) => rs.filter((r) => r.co.techs.includes('Dentrix')).length / rs.length;
  assert.ok(share(rows) > share(broad), 'more specific than the broad niche');
  const site = syntheticSite(rows[0].co);
  assert.match(site.text, /Dentrix/);
  assert.ok(site.text.length > 80);
});

test('unfiltered search is unchanged and a level-1 segment keeps the old universe', () => {
  const s = mk();
  const before = search(s, F()).map((r) => r.id);
  search(s, F({ niche: 'multi-location dental practices in Texas' }));
  assert.deepEqual(search(s, F()).map((r) => r.id), before);
  assert.ok(before.length > 3000);
  const seg = search(s, F({ niche: 'dental practices' }));
  assert.ok(seg.length < before.length);
});

test('unmatched niche text falls back to a keyword filter and creates no node', () => {
  const s = mk();
  const rows = search(s, F({ niche: 'quantum yoga llamas' }));
  assert.equal(rows.length, 0);
  assert.equal(Object.keys(s.market?.niches?.nodes ?? {}).length, 0);
});

test('saved contacts keep nicheId; persona draws from niche stats; site uses dossier words', () => {
  const s = mk();
  s.apps.crm = { companies: [], contacts: [], ...(s.apps.crm ?? {}) };
  setPlan(s, 'apollo_basic');
  const rows = search(s, F({ niche: 'multi-location dental practices in Texas using Dentrix' })).slice(0, 6);
  reveal(s, rows.map((r) => r.id));
  const list = saveList(s, rows.map((r) => r.id), 'tx', { addContact });
  assert.ok(list.contactIds.length);
  const ct = s.apps.crm.contacts.find((c) => c.id === list.contactIds[0]);
  const co = s.apps.crm.companies.find((c) => c.id === ct.companyId);
  assert.ok(ct.nicheId && co.nicheId === ct.nicheId);
  assert.ok(co.site.synthetic && /Dentrix/.test(co.site.text));
  const person = personForContact(s, ct, co);
  assert.equal(person.nicheId, ct.nicheId);
  assert.equal(person.segmentId, statsFor(s, ct.nicheId).rootId);
  // a researched dossier arriving later does not change what was saved
  const snap = JSON.stringify(co.site);
  nicheUniverse(s, ct.nicheId);
  assert.equal(JSON.stringify(co.site), snap);
  // plain base contacts are untouched by niche code
  const plain = personForContact(s, { id: 'c_x', email: 'a@b.com' }, { industry: 'dental practice', size: '5' });
  assert.equal(plain.nicheId, undefined);
});

test('new pages use a researched dossier; revealed pages and saved contacts keep theirs', () => {
  const s = mk();
  const id = nicheFor(s, 'small dental practices', { source: 'prospector' }).id;
  setPlan(s, 'apollo_basic');
  const before = nicheUniverse(s, id);
  assert.ok(before.N > 60, `enough companies for several pages (${before.N})`);
  const first = before.rows[0];
  reveal(s, [first.id]);
  const orig = JSON.stringify(first.co);
  const lastBefore = JSON.stringify(before.rows.at(-1).co);
  const researched = { ...before.dossier, source: 'research', researchedLevel: 4, tools: [{ name: 'OpenDental Pro', category: 'practice management' }], vocabulary: ['hygiene recall', 'insurance verification'] };
  nicheConfig.cache.lru.set(nicheKey(s, id), researched);
  const after = nicheUniverse(s, id);
  assert.ok(after.dossier.tools.some((t) => t.name === 'OpenDental Pro'));
  assert.equal(JSON.stringify(rowById(s, first.id).co), orig, 'the page with a revealed row is frozen');
  assert.equal(after.N, before.N, 'same number of companies');
  assert.equal(after.rows.at(-1).co.domain, before.rows.at(-1).co.domain, 'same companies, same ids');
  assert.notEqual(JSON.stringify(after.rows.at(-1).co), lastBefore, 'a later page uses the researched dossier');
  assert.ok(after.rows.some((r) => r.co.techs.includes('OpenDental Pro')));
  nicheConfig.cache.lru.map.delete(nicheKey(s, id));
});

test('ICP niche changes fit: target pocket up, sibling pocket down, no ICP niche no change', () => {
  const s = mk('dental practices in Texas');
  nicheFor(s, 'dental practices in Texas', { source: 'icp' });
  const tx = search(s, F({ niche: 'dental practices in Texas' }));
  nicheFor(s, 'dental practices in Ohio', { source: 'icp' });
  const oh = search(s, F({ niche: 'dental practices in Ohio' }));
  const avg = (rs) => rs.reduce((a, r) => a + r.fit, 0) / rs.length;
  assert.ok(tx.every((r) => r.nicheAdj === 0.1) && oh.every((r) => r.nicheAdj === -0.15));
  assert.ok(avg(tx) > avg(oh) + 0.1);
  const p = mk('practice software');
  assert.ok(search(p, F({ niche: 'dental practices in Texas' })).every((r) => r.nicheAdj === 0));
});

test('persona prompt carries a niche brief (<= 600 chars) and no hidden numbers', () => {
  const s = mk();
  const id = nicheFor(s, 'multi-location dental practices in Texas using Dentrix', { source: 'prospector' }).id;
  const brief = nicheBriefOf(s, id);
  assert.ok(brief.length > 40 && brief.length <= 600);
  assert.match(brief, /Dentrix/);
  assert.doesNotMatch(brief, /\$\s?\d|\d\s?%/);
  const person = { name: 'Pat Doe', role: 'Practice Manager', segmentId: 'health_practices', isBuyer: true, budgetAuthority: true, hasPain: true, painIntensity: 0.6, wtpMonthly: 123 };
  const withBrief = prospectSystemPrompt(person, { channel: 'email', nicheBrief: brief });
  assert.ok(withBrief.includes(brief));
  assert.ok(!prospectSystemPrompt(person, { channel: 'email' }).includes('Your corner of the market'));
  const long = prospectSystemPrompt(person, { channel: 'email', nicheBrief: 'x'.repeat(2000) });
  assert.ok(!long.includes('x'.repeat(601)));
  assert.ok(!/share|wtpMonthly|painPrevalence/.test(brief));
});
