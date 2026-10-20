import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket } from '../public/core/market.js';
import { truthOf } from '../public/core/truth.js';
import { BUYER_SEGMENTS } from '../public/data/buyer-segments.js';
import { segmentJobs, SEGMENT_JOBS } from '../public/data/market-truth.js';

function mk(seed, oneLiner) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'P', seed });
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = oneLiner;
  s.company.icp = '';
  return s;
}
const SALES_JOB = /pipeline|every lead/i;
const realJobs = (g) => g.jobs.filter((j) => !j.decoy && j.id !== 'core').sort((a, b) => b.importance - a.importance);

test('e-commerce and startup segments never get a sales-pipeline job, and their top job is their own', () => {
  const ideas = ['Bookkeeping reconciliation for Shopify stores', 'Returns portal for DTC brands', 'Board reporting and investor updates for seed-stage startups', 'Security questionnaire answers for B2B startups'];
  let seen = 0;
  for (const idea of ideas) for (const seed of [1, 2, 3, 4]) {
    for (const g of truthOf(mk(seed, idea)).segments) {
      if (g.baseId !== 'ecommerce' && g.baseId !== 'startup_smb') continue;
      seen++;
      for (const jb of realJobs(g)) assert.ok(!SALES_JOB.test(jb.label), `${idea} seed ${seed} ${g.id}: ${jb.label}`);
      assert.ok(SEGMENT_JOBS[g.baseId].some((t) => t.id === realJobs(g)[0].id), `${g.id} top job comes from its own list`);
    }
  }
  assert.ok(seen >= 8, `the ideas reach both segments (${seen})`);
  // The auditor's case: a Shopify bookkeeping idea's e-commerce segments rank payout reconciliation first.
  for (const seed of [1, 2]) for (const g of truthOf(mk(seed, ideas[0])).segments.filter((x) => x.baseId === 'ecommerce')) assert.equal(realJobs(g)[0].id, 'payout_recon');
});

test("every B2B segment's jobs fit its buyers (no other industry's work)", () => {
  // Words that only make sense for some segments: a job label with them anywhere else is a template mismatch.
  const ONLY = [
    [/patient|claims paid|charts/i, ['health_practices', 'hospitals', 'pharma']],
    [/IEP|parents/i, ['k12']],
    [/donor|funders/i, ['nonprofits']],
    [/KYC|AML/i, ['banks']],
    [/guest|OTA/, ['hotels']],
    [/franchisee/i, ['franchise_systems']],
    [/billable time|filing deadline/i, ['law_firms', 'accounting_firms']],
    [/no-shows/i, ['restaurants', 'salons_fitness', 'trades', 'retail_shops']],
    [/tips/i, ['restaurants', 'salons_fitness', 'trades']],
    [/resident service|permits/i, ['local_gov', 'state_gov']],
    [/maintenance and inspections before failures/i, ['manufacturing', 'utilities']],
  ];
  // Only segments whose own business is winning deals or leads: companies with a sales team, agencies (new business),
  // real estate (buyer and seller leads) and franchisors (franchise development).
  const SALES_TEAM_OK = new Set(['mid_market', 'enterprise', 'agencies', 'real_estate', 'franchise_systems']);
  for (const seg of BUYER_SEGMENTS) {
    const jobs = segmentJobs(seg.id, seg.group);
    assert.ok(jobs.length >= 5, `${seg.id} has jobs`);
    assert.equal(new Set(jobs.map((x) => x.id)).size, jobs.length, `${seg.id} job ids unique`);
    for (const jb of jobs) {
      assert.ok(jb.keywords.length >= 3, `${seg.id}/${jb.id} keywords`);
      for (const [rx, ok] of ONLY) assert.ok(!rx.test(jb.label) || ok.includes(seg.id), `${seg.id} has "${jb.label}"`);
      if (SALES_JOB.test(jb.label)) assert.ok(SALES_TEAM_OK.has(seg.id), `${seg.id} has a sales-pipeline job`);
    }
  }
  for (const id of Object.keys(SEGMENT_JOBS)) assert.ok(BUYER_SEGMENTS.some((s) => s.id === id), `SEGMENT_JOBS.${id} is a real segment`);
});

test('generated truth uses the segment job list (wiring), and stays deterministic', () => {
  const idea = 'Load board and dispatch for owner-operator truckers';
  const a = truthOf(mk(3, idea)), b = truthOf(mk(3, idea));
  assert.deepEqual(a.segments.map((g) => g.jobs), b.segments.map((g) => g.jobs));
  for (const g of a.segments) {
    const ids = new Set(segmentJobs(g.baseId, g.group).map((t) => t.id));
    for (const jb of realJobs(g)) assert.ok(ids.has(jb.id), `${g.id}: ${jb.id}`);
  }
  assert.ok(a.segments.some((g) => g.baseId === 'trucking'));
});
