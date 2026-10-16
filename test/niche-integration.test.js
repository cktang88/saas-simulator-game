// Fractal niche engine wired into recruiting, ad audiences, communities and agency/vendor searches. Short, offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket } from '../public/core/market.js';
import * as N from '../public/core/niche.js';
import { recruitBatch, planBatch, targetRead, completionCost } from '../public/apps/research/recruit.js';
import { chatPerson } from '../public/apps/research/sim.js';
import { createCampaign, createAdSet, audienceSize, audienceModifiers } from '../public/apps/growth/adsEngine.js';
import { auctionDay } from '../public/apps/growth/delivery.js';
import { communitySuggestions, communityFit } from '../public/apps/growth/nicheUse.js';
import { communityPost } from '../public/apps/growth/organicEngine.js';
import { post } from '../public/core/bank.js';
import * as AG from '../public/apps/channels/agencies.js';

function mk(seed = 5, model = 'smb', oneLiner = 'Practice software for dentists') {
  const s = newState({ companyName: 'X', model, path: 'indie', founderName: 'P', seed });
  post(s, { amount: 500000, counterparty: 'Test', description: 'seed cash', category: 'funding', method: 'wire' });
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = oneLiner; s.company.icp = '';
  return s;
}
const BROAD = 'office managers at dental practices';
const NARROW = 'office managers at multi-location dental practices in Texas using Dentrix';
const MID = 'office managers at multi-location dental practices in Texas';

// ------------------------------------------------------------------ recruiting

test('recruit target text resolves to a niche; persons carry nicheId and dossier titles/tools', () => {
  const s = mk();
  const tr = targetRead(s, MID, { create: true });
  assert.ok(tr.nicheId && tr.nicheLevel >= 3, 'deep niche node');
  const booked = [];
  for (let i = 0; i < 3; i++) booked.push(...recruitBatch(s, { channel: 'community', sends: 40, target: MID, screener: 'When did you last fix your schedule?\nHow many locations do you run?' }).booked);
  const inNiche = booked.filter((iv) => iv.hidden.nicheId);
  assert.ok(inNiche.length >= 1, `some booked people are drawn from the niche (${booked.length} booked)`);
  for (const iv of inNiche) assert.ok(iv.hidden.nicheId.startsWith(tr.nicheRoot), 'niche id is below the target segment');
  const titles = new Set(N.dossierOf(s, tr.nicheId).roles.map((r) => r.title));
  assert.ok(inNiche.some((iv) => titles.has(iv.hidden.title)), 'titles come from the dossier');
  const pain = inNiche.find((iv) => iv.hidden.hasPain);
  assert.ok(pain, 'someone with pain');
  const cp = chatPerson(s, pain);
  assert.match(cp.role, /day to day you use/, 'niche brief is folded into the persona role line');
  assert.match(cp.workaround, /spreadsheet next to/, 'workaround names a niche tool');
});

test('narrower recruit niche: smaller pool, more in-niche, harder to reach, burns out', () => {
  const s = mk();
  const broad = targetRead(s, BROAD, { create: true });
  const narrow = targetRead(s, NARROW, { create: true });
  assert.ok(narrow.pool < (broad.pool ?? Infinity) || !broad.nicheId, 'pool shrinks');
  const mid = targetRead(s, MID, { create: true });
  assert.ok(narrow.pool < mid.pool, 'tool narrows the pool further');
  assert.ok(narrow.hard > mid.hard);
  const pb = planBatch(s, { channel: 'cold_email', sends: 20, target: mid.text });
  const pn = planBatch(s, { channel: 'cold_email', sends: 20, target: NARROW });
  assert.ok(pn.reply < pb.reply, 'hard-to-reach niche replies less');
  assert.ok(pn.leak < pb.leak, 'higher in-niche share');
  const panelB = planBatch(s, { channel: 'panel', sends: 5, target: mid.text, incentive: 0 });
  const panelN = planBatch(s, { channel: 'panel', sends: 5, target: NARROW, incentive: 0 });
  assert.ok(panelN.usdPerCompleted > panelB.usdPerCompleted, 'panel charges more to find rare titles');
  // exhausting a tiny niche burns the list
  const t = mk(7);
  let last = planBatch(t, { channel: 'cold_email', sends: 40, target: MID, create: true });
  const first = last.reply;
  for (let i = 0; i < 4; i++) recruitBatch(t, { channel: 'cold_email', sends: 40, target: MID });
  last = planBatch(t, { channel: 'cold_email', sends: 40, target: MID });
  assert.ok(last.reply < first * 0.8, `reply fell from ${first} to ${last.reply}`);
  assert.ok(last.warnings.some((w) => /already contacted|drying up/.test(w)));
});

test('recruiting niche resolution and plans are deterministic; vague targets stay un-niched', () => {
  const a = mk(3), b = mk(3);
  const pa = planBatch(a, { channel: 'cold_email', sends: 20, target: NARROW, create: true });
  const pb = planBatch(b, { channel: 'cold_email', sends: 20, target: NARROW, create: true });
  assert.deepEqual(pa, pb);
  assert.equal(targetRead(a, 'a vague person').nicheId, undefined);
  const r = recruitBatch(mk(3), { channel: 'warm', sends: 8, target: 'a vague person' });
  assert.ok(r.booked.every((iv) => !iv.hidden.nicheId));
});

// ------------------------------------------------------------------ ads

function adset(s, interests, type = 'interests', platform = 'meta') {
  const c = createCampaign(s, { p: platform, name: 'c', objective: 'sales' });
  return createAdSet(s, { campaignId: c.id, name: 'a', budget: 100, audience: { type, interests } });
}
test('ad audience size follows niche share; narrow niche raises CPM and under-delivers', () => {
  const s = mk();
  const broad = adset(s, 'dental practices');
  const mid = adset(s, 'multi-location dental practices in Texas');
  const narrow = adset(s, 'multi-location dental practices in Texas using Dentrix');
  const sizes = [broad, mid, narrow].map((x) => audienceSize(s, x));
  assert.ok(sizes[0] > sizes[1] && sizes[1] > sizes[2], `sizes shrink: ${sizes}`);
  const st = N.statsFor(s, narrow.audience.nicheId);
  const base = 200_000;
  assert.ok(Math.abs(sizes[2] - Math.max(300, Math.round(base * st.shareOfSegment))) <= 1, 'size = pool x share of segment');
  const m0 = audienceModifiers(s, broad), m2 = audienceModifiers(s, narrow);
  assert.ok(m2.cpm > m0.cpm, 'narrow B2B niche costs more per thousand');
  assert.ok(m2.ctr !== 1 || m2.cvr !== 1, 'CTR/CVR follow niche pain');
  const day = (size, mods) => auctionDay({ platform: 'meta', model: 'smb', date: new Date('2026-03-10T12:00:00Z'), budget: 100, audience: { type: 'interests', size, ...mods }, placement: 'advantage', objective: 'sales', optimization: 'trial', bid: { strategy: 'lowest_cost' }, status: 'active', imps6: 0, landingRate: 0.03, priceMonthly: 99, rand: () => 0.5, ads: [{ id: 'a', q: 0.5, format: 'static', lifeImps: 1000 }] });
  const big = day(sizes[0], {});
  const tiny = day(sizes[2], { cpmMult: m2.cpm });
  assert.ok(tiny.spend < big.spend * 0.4, 'a tiny audience cannot absorb the budget');
  assert.ok(tiny.cpm > big.cpm);
});

// ------------------------------------------------------------------ communities

test('community suggestions come from the dossier; unrelated rooms get low relevance', () => {
  const s = mk();
  s.company.icp = NARROW;
  const sug = communitySuggestions(s);
  assert.ok(sug.length >= 1);
  const node = N.nicheFor(s, NARROW, { source: 'community' });
  const names = new Set(N.pathOf(s, node.id).flatMap((n) => N.dossierOf(s, n.id).communities.map((c) => c.name)));
  for (const c of sug) assert.ok(names.has(c.name), `${c.name} is in a dossier`);
  const good = communityFit(s, sug[0].name);
  const generic = communityFit(s, 'r/entrepreneur');
  assert.ok(good.fit > 0.7 && generic.fit < 0.5 && good.fit > generic.fit);
  const judge = { helpfulness: 0.8, relevance: 0.9, promotional: 0.05, report: 0 };
  const a = mk(11); a.company.icp = NARROW;
  const b = mk(11); b.company.icp = NARROW;
  const pa = communityPost(a, { community: sug[0].name, kind: 'Forum', size: 'medium', title: 't', body: 'b', judge });
  const pb = communityPost(b, { community: 'Random Gaming Subreddit', kind: 'Reddit', size: 'medium', title: 't', body: 'b', judge });
  assert.ok(pa.fit > pb.fit && pa.listed && !pb.listed);
});

// ------------------------------------------------------------------ agencies

test('agency search is niche specific, priced, has hidden quality, and is deterministic', () => {
  const s = mk(); s.company.icp = NARROW;
  const r = AG.searchAgencies(s, { query: 'recruiters for dental office managers in Texas', kind: 'recruiting' });
  assert.ok(r.listings.length >= 6 && r.level >= 2);
  for (const l of r.listings) { assert.ok(l.priceUsd > 0 && l.unit && l.pricing); assert.equal(l.hidden, undefined); assert.equal(l.quality, undefined); }
  const dossier = N.dossierOf(s, r.nicheId);
  const entry = dossier.agencies.find((a) => a.kind === 'recruiting');
  assert.ok(r.listings.some((l) => l.name === entry.name), 'dossier agency appears (disguised name)');
  const t = mk(); t.company.icp = NARROW;
  const r2 = AG.searchAgencies(t, { query: 'recruiters for dental office managers in Texas', kind: 'recruiting' });
  assert.deepEqual(r.listings.map((l) => [l.name, l.priceUsd, l.specialty]), r2.listings.map((l) => [l.name, l.priceUsd, l.specialty]));
  const r3 = AG.searchAgencies(s, { query: 'recruiters for dental office managers in Texas', kind: 'recruiting' });
  assert.deepEqual(r3.listings.map((l) => l.id), r.listings.map((l) => l.id), 'same roster, no free re-rolls');
  // deeper query = deeper node, different roster
  const deeper = AG.searchAgencies(s, { query: 'recruiters for dental office managers in Texas using Dentrix', kind: 'recruiting' });
  assert.ok(deeper.level > r.level && deeper.nicheId !== r.nicheId);
  for (const k of AG.KIND_IDS) assert.ok(AG.searchAgencies(s, { query: 'dental practices in Texas', kind: k }).listings.length >= 6, k);
  assert.equal(AG.inferKind('PR firm for dentists'), 'pr');
});

test('agency market has few great, many mediocre, some scams; references and trials reveal quality; scams ghost', () => {
  let tiers = { great: 0, good: 0, average: 0, mediocre: 0, scam: 0 };
  for (let seed = 1; seed <= 12; seed++) {
    const s = mk(seed);
    const r = AG.searchAgencies(s, { query: 'marketing agency for multi-location dental practices in Texas', kind: 'marketing' });
    for (const l of r.listings) tiers[s.agencyBook.hidden[l.id].tier]++;
  }
  const tot = Object.values(tiers).reduce((a, b) => a + b, 0);
  assert.ok(tiers.mediocre / tot > 0.25 && tiers.great / tot < 0.2 && tiers.scam > 0, JSON.stringify(tiers));
  const s = mk(2); s.bank ??= s.bank;
  const r = AG.searchAgencies(s, { query: 'marketing agency for dental practices in Texas', kind: 'marketing' });
  const l = r.listings[0];
  const q = s.agencyBook.hidden[l.id];
  assert.equal(AG.listing(s, l.id).estimate, null, 'hidden until checked');
  AG.checkReferences(s, l.id, { backchannel: true });
  const withBack = AG.runTrial(s, l.id);
  assert.ok(withBack.estimate != null && Math.abs(withBack.estimate - q.quality * q.fit) < 0.35);
  assert.ok(withBack.estimateSd < 0.1);
});

test('vendor vetting tiers separate: stellar > good > average > mediocre in delivered effectiveness', () => {
  const results = { stellar: [], good: [], average: [], mediocre: [] };
  for (let seed = 1; seed <= 14; seed++) {
    for (const tier of Object.keys(results)) {
      const s = mk(seed);
      const deepQ = 'recruiting agency for office managers at multi-location dental practices in Texas using Dentrix';
      const genQ = 'recruiting agency';
      const r = AG.searchAgencies(s, { query: tier === 'stellar' || tier === 'good' ? deepQ : genQ, kind: 'recruiting' });
      let pick;
      const L = r.listings;
      if (tier === 'stellar') {
        const cand = [...L].sort((a, b) => b.claims.years - a.claims.years).slice(0, 5).filter((x) => x.upfrontPct < 0.5);
        for (const c of cand) { AG.checkReferences(s, c.id, { backchannel: true }); AG.checkReferences(s, c.id); }
        const top = cand.map((c) => AG.listing(s, c.id)).sort((a, b) => (b.estimate ?? 0) - (a.estimate ?? 0)).slice(0, 2);
        for (const c of top) AG.runTrial(s, c.id);
        pick = top.map((c) => AG.listing(s, c.id)).sort((a, b) => (b.estimate ?? 0) - (a.estimate ?? 0))[0];
      } else if (tier === 'good') {
        const cand = L.filter((x) => x.upfrontPct < 0.5).slice(0, 4);
        for (const c of cand) AG.checkReferences(s, c.id);
        pick = cand.map((c) => AG.listing(s, c.id)).sort((a, b) => (b.estimate ?? 0) - (a.estimate ?? 0))[0];
      } else if (tier === 'average') pick = [...L].filter((x) => x.upfrontPct < 0.6).sort((a, b) => b.claims.years - a.claims.years)[0]; // generic search, picks the most experienced, no vetting
      else pick = [...L].sort((a, b) => a.priceUsd - b.priceUsd)[0];
      const { engagement } = AG.engage(s, pick.id, { brief: tier === 'stellar' ? 'Hire office managers who run multi-location dental practices in Texas on Dentrix; scheduling and insurance verification' : '' });
      results[tier].push(engagement.ghostDay != null ? 0 : engagement.effectiveness);
    }
  }
  const m = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
  assert.ok(m.stellar > m.good && m.good > m.average && m.average > m.mediocre, JSON.stringify(m));
});

test('a scammy firm paid up front ghosts and the cost is logged; early exit costs a fee', () => {
  let found = null;
  for (let seed = 1; seed <= 40 && !found; seed++) {
    const s = mk(seed);
    const r = AG.searchAgencies(s, { query: 'PR firm for dental practices in Texas', kind: 'pr' });
    const sc = r.listings.find((l) => s.agencyBook.hidden[l.id].scam);
    if (sc) found = { s, sc };
  }
  assert.ok(found, 'a scam exists somewhere');
  const { s, sc } = found;
  const before = s.mistakes?.length ?? 0;
  const { engagement, lessons } = AG.engage(s, sc.id, {});
  assert.ok(lessons.length >= 1, 'feedback on what a stellar operator would have done');
  for (let i = 0; i < 60; i++) { s.day++; AG.agencyDay(s); }
  assert.equal(s.agencyBook.engagements[0].status, 'ghosted');
  assert.ok(s.mistakes.length > before && s.mistakes.some((m) => m.id === 'agency_scam'));
  assert.equal(AG.outcomeOf(s, engagement.id).effectiveness, 0);
});
