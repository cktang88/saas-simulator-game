// Niche agencies feeding the real systems: People recruiter search and sourcing, marketing/PR/dev/data outcomes, recruit "Check niche".
// Short, offline, deterministic. Hidden quality is set directly on the roster so each tier is tested without hunting for seeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { ensureMarket } from '../public/core/market.js';
import { ensureStripe } from '../public/core/stripe.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import * as AG from '../public/apps/channels/agencies.js';
import { createJob, applyJudge, openJob, peopleDay, searchRecruiters, hireRecruiter } from '../public/apps/people/sim.js';
import { agencyOf, channelsFor, placementFee } from '../public/apps/people/sourcing.js';
import { organicDay, ensureOrganic } from '../public/apps/growth/organicEngine.js';
import { ensureSeo } from '../public/apps/growth/seoDynamics.js';
import { vendorBuildToday } from '../public/apps/channels/agencyEffects.js';
import { outreachDay } from '../public/apps/sales/engine.js';
import product from '../public/apps/product.js';
import { productSlice } from '../public/apps/product/store.js';
import { toEffortHours } from '../public/apps/product/build.js';
import { planBatch, targetRead } from '../public/apps/research/recruit.js';

function mk(seed = 5) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'P', seed });
  ensureStripe(s); seedDefaultStack(s);
  post(s, { amount: 500000, counterparty: 'Test', description: 'seed cash', category: 'funding', method: 'wire' });
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = 'Practice software for dentists'; s.company.icp = 'office managers at dental practices';
  return s;
}
const JUDGE = { firstImpression: '', clarity: 8, specificity: 8, payTransparency: true, issues: [], rewriteHint: '' };
/** Search, force the first listing's hidden truth, return its id. */
function pickFirm(s, kind, query, quality, { scam = false, fit = 1 } = {}) {
  const r = AG.searchAgencies(s, { query, kind });
  const l = r.listings[0];
  Object.assign(s.agencyBook.hidden[l.id], { quality, scam, fit, tier: scam ? 'scam' : 'forced' });
  return l.id;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const skill = (c) => mean(Object.entries(c.traits).filter(([k]) => k !== 'polish').map(([, v]) => v));

// ------------------------------------------------------------------ People hiring

const REC_Q = 'recruiters for senior iOS engineers in Austin fintech';
function sourced(quality, seed = 5, days = 70) {
  const s = mk(seed);
  const job = createJob(s, { role: 'engineer', region: 'us', engagement: 'employee', text: 'Senior iOS engineer for an Austin fintech.', payLo: 150000, payHi: 190000 });
  applyJudge(job, JUDGE);
  const r = searchRecruiters(s, job.id, REC_Q);
  assert.ok(r.listings.length >= 6, 'a roster of niche recruiters comes back');
  const id = r.listings[0].id;
  Object.assign(s.agencyBook.hidden[id], { quality, fit: 1, scam: false });
  hireRecruiter(s, job.id, id);
  const eng = s.agencyBook.engagements[0];
  for (let d = 0; d < days; d++) { s.day++; peopleDay(s); }
  const cands = s.apps.people.candidates.filter((c) => c.channel === eng.id);
  return { s, job, eng, cands };
}

test('People recruiter search returns niche agencies and sourced candidate quality tracks agency quality', () => {
  const hi = sourced(0.92), lo = sourced(0.12);
  assert.ok(hi.cands.length >= 8 && lo.cands.length >= 3, `both send candidates (${hi.cands.length} vs ${lo.cands.length})`);
  assert.ok(hi.cands.length > lo.cands.length, 'a great recruiter sends more');
  assert.ok(mean(hi.cands.map(skill)) > mean(lo.cands.map(skill)) + 2, `skill ${mean(hi.cands.map(skill)).toFixed(1)} vs ${mean(lo.cands.map(skill)).toFixed(1)}`);
  assert.ok(hi.s.apps.people.jobs[0].channels.includes(hi.eng.id), 'the engagement is the job channel');
  const aH = agencyOf(hi.s, hi.eng.id), aL = agencyOf(lo.s, lo.eng.id);
  assert.ok(aH.daysToFirstCandidate[0] < aL.daysToFirstCandidate[0], 'a great recruiter is faster');
  assert.equal(aH.kind, 'contingency');
  // fee is a share of first-year base with the listed guarantee
  const l = AG.listing(hi.s, hi.eng.listingId);
  assert.equal(placementFee(aH, 160000).fee, Math.round(aH.costModel.pct * 160000 * 100) / 100);
  assert.ok(aH.costModel.pct >= 0.12 && aH.costModel.pct <= 0.3);
  assert.equal(aH.guaranteeDays, l.guaranteeDays);
});

test('a scam recruiter takes a deposit, sends junk, then nobody; the generic catalog still works', () => {
  const s = mk(9);
  const job = createJob(s, { role: 'engineer', region: 'us', engagement: 'employee', text: 'Engineer.' });
  applyJudge(job, JUDGE);
  const id = searchRecruiters(s, job.id, REC_Q).listings[0].id;
  Object.assign(s.agencyBook.hidden[id], { quality: 0.02, fit: 1, scam: true });
  s.agencyBook.listings[id].upfrontPct = 0.8;
  const cash = s.bank.accounts[0].balance;
  hireRecruiter(s, job.id, id);
  assert.ok(s.bank.accounts[0].balance < cash, 'a deposit left the bank');
  for (let d = 0; d < 60; d++) { s.day++; peopleDay(s); AG.agencyDay(s); }
  const eng = s.agencyBook.engagements[0];
  assert.equal(eng.status, 'ghosted');
  assert.ok(s.mistakes.some((m) => m.id === 'agency_scam'));
  assert.deepEqual(agencyOf(s, eng.id).candidatesPerWeek, [0, 0]);
  // fallback: the old catalog is untouched
  const j2 = createJob(s, { role: 'engineer', region: 'us', engagement: 'employee', text: 'Another engineer.' });
  applyJudge(j2, JUDGE);
  assert.ok(channelsFor(s, j2).some((a) => a.id === 'contingency_recruiter'));
  openJob(s, j2.id, ['contingency_recruiter']);
  assert.ok(agencyOf(s, 'contingency_recruiter').costModel.pct === 0.2);
  assert.equal(agencyOf(s, 'nope'), null);
});

// ------------------------------------------------------------------ marketing / PR

function marketing(q, days = 40, opts = {}) {
  const s = mk(11);
  ensureOrganic(s);
  const id = pickFirm(s, 'marketing', 'marketing agency for dental practices in Texas', q, opts);
  AG.engage(s, id, { units: 3, brief: 'dental practice management software Texas office managers scheduling' });
  for (let d = 0; d < days; d++) { s.day++; organicDay(s); }
  const O = s.apps.organic;
  return { s, visits: O.stats['organic:agency']?.visits ?? 0, drafts: ensureSeo(s).drafts.filter((x) => String(x.source).startsWith('niche_agency')) };
}
test('marketing agency output raises organic traffic and content in proportion to quality; scam produces nothing', () => {
  const hi = marketing(0.9), mid = marketing(0.55), lo = marketing(0.25);
  assert.ok(hi.visits > mid.visits && mid.visits > lo.visits && lo.visits > 0, `${hi.visits} > ${mid.visits} > ${lo.visits}`);
  assert.ok(hi.visits / lo.visits > 2.2, 'a great agency brings several times the traffic of a mediocre one');
  assert.ok(hi.drafts.length >= 2);
  assert.ok(mean(hi.drafts.map((d) => d.quality)) > mean(lo.drafts.map((d) => d.quality)), 'content quality follows the agency');
  const scam = marketing(0.02, 60, { scam: true });
  assert.equal(scam.visits, 0, 'a ghosting agency produces nothing');
  assert.ok(scam.s.mistakes.some((m) => m.id === 'agency_scam'), 'and the loss is logged');
});

function pr(q, opts = {}) {
  const s = mk(13);
  ensureOrganic(s);
  const id = pickFirm(s, 'pr', 'PR firm for dental practices in Texas', q, opts);
  AG.engage(s, id, { units: 6 });
  for (let d = 0; d < 190; d++) { s.day++; organicDay(s); }
  const O = s.apps.organic;
  return { s, links: ensureSeo(s).links.earned, dr: O.dr, citations: O.citations };
}
test('PR firm adds earned links, domain rating and citable mentions; scam adds none', () => {
  const hi = pr(0.9), lo = pr(0.3);
  assert.ok(hi.links > lo.links && lo.links >= 1, `${hi.links} vs ${lo.links}`);
  assert.ok(hi.dr > lo.dr && hi.citations > lo.citations);
  const sc = pr(0.02, { scam: true });
  assert.equal(sc.links, 0);
  assert.ok(sc.s.mistakes.some((m) => m.id === 'agency_scam'));
});

// ------------------------------------------------------------------ dev shop

function devShop(q) {
  const s = mk(17);
  s.apps.people = { members: [] };
  const sl = productSlice(s);
  sl.features.push({ id: 'f1', title: 'Weekly digest', user: 'office managers', problem: 'p', solution: 'a digest email', acceptance: ['a'], acceptanceText: 'a', metric: 'm', baseline: 'b', status: 'queued', effortHours: toEffortHours(400), progressHours: 0, evidence: [] });
  sl.buildQueue.push('f1');
  const id = pickFirm(s, 'dev', 'software dev shop for dental practices in Texas', q);
  AG.engage(s, id, { units: 80 });
  const day1 = vendorBuildToday((s.day++, s));
  for (let d = 0; d < 20; d++) { product.onDay(s); s.day++; }
  return { s, day1, f: sl.features[0] };
}
test('dev shop adds build capacity with a bug rate set by quality', () => {
  const hi = devShop(0.9), lo = devShop(0.25);
  assert.ok(hi.day1.hours > lo.day1.hours, 'better shops deliver more of the scope');
  assert.ok(hi.day1.bugMult < lo.day1.bugMult, `bug multiplier ${hi.day1.bugMult} < ${lo.day1.bugMult}`);
  assert.ok(hi.f.builtBy.vendor > lo.f.builtBy.vendor && lo.f.builtBy.vendor > 0, 'vendor hours landed in the product');
  assert.ok(hi.f.builtBy.vendorW / hi.f.builtBy.vendor < lo.f.builtBy.vendorW / lo.f.builtBy.vendor, 'weighted bug rate follows quality');
  const sc = (() => { const s = mk(19); const id = pickFirm(s, 'dev', 'software dev shop', 0.02, { scam: true }); AG.engage(s, id, { units: 80 }); s.day = 30; AG.agencyDay(s); return vendorBuildToday(s); })();
  assert.equal(sc.hours, 0, 'a vanished shop builds nothing');
});

// ------------------------------------------------------------------ data vendor

function vendor(q, opts = {}) {
  const s = mk(23);
  const id = pickFirm(s, 'data', 'data vendor for dental practices in Texas', q, opts);
  AG.engage(s, id, { units: 8 });
  for (let d = 0; d < 12; d++) { s.day++; AG.agencyDay(s); outreachDay(s); }
  const list = s.apps.crm?.prospector?.lists?.[0];
  return { s, list, contacts: list ? list.contactIds.map((cid) => s.apps.crm.contacts.find((c) => c.id === cid)) : [] };
}
test('data vendor list quality changes the bounce rate; a scam vendor delivers no list', () => {
  const hi = vendor(0.92), lo = vendor(0.2);
  assert.ok(hi.contacts.length >= 50 && lo.contacts.length >= 50, 'both deliver contacts');
  const bad = (v) => v.contacts.filter((c) => c.truth === 'invalid').length / v.contacts.length;
  assert.ok(bad(lo) > bad(hi) + 0.15, `invalid share ${bad(lo).toFixed(2)} vs ${bad(hi).toFixed(2)}`);
  const sc = vendor(0.02, { scam: true });
  assert.equal(sc.list, undefined, 'no list from a vanished vendor');
  assert.ok(sc.s.mistakes.some((m) => m.id === 'agency_scam'));
});

// ------------------------------------------------------------------ recruit preview

test('recruit preview resolves the niche only on an explicit create, then estimates are niche-specific', () => {
  const s = mk(3);
  const T = 'office managers at multi-location dental practices in Texas using Dentrix';
  const before = planBatch(s, { channel: 'cold_email', sends: 20, target: T });
  assert.equal(before.target.nicheId, undefined, 'typing alone does not create nodes');
  targetRead(s, T, { create: true }); // what the "Check niche" button does
  const after = planBatch(s, { channel: 'cold_email', sends: 20, target: T });
  assert.ok(after.target.nicheId && after.target.nicheLevel >= 3);
  assert.ok(after.reply < before.reply, 'a hard-to-reach niche replies less than the broad estimate showed');
});
