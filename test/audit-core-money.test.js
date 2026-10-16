// Audit of core simulation + money/legal apps for things that claimed more than they did:
// identical offline "panels", one inbound template per category, persona-blind price-notice readers, keyword-stuffable
// redline cover notes, services blame for change orders the player could not write, and design notes posing as emails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as llm from '../public/core/llm.js';
import { newState } from '../public/core/state.js';
import { archetypes } from '../public/core/network.js';
import { offlineInbound, offlineNetworkReply, TELL_SHARE } from '../public/core/inbound-text.js';
import { noticeHeuristic } from '../public/apps/money/judge.js';
import { scoreRedlines, heuristicRedlineFeedback, noteReasons, CLAUSES } from '../public/apps/legal/redlines.js';
import { weighted } from '../public/core/rubric.js';
import { REDLINE_RUBRIC } from '../public/apps/legal/rubric.js';
import services, { servicesSlice, makeOffer, acceptOffer, counterOffer, sendChangeOrder, servicesTier } from '../public/apps/services.js';
import { newsFallback } from '../public/apps/marketworld/llm.js';
import { WORLD_EVENTS } from '../public/data/world.js';

const fresh = (seed = 7, model = 'smb') => {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat Doe', seed });
  s.company.oneLiner = 'invoice reconciliation for small accounting firms';
  return s;
};

test('llm.panel offline: identical fallbacks from several models collapse to one answer; differing ones are kept', async () => {
  llm.setSettings({ apiKey: '', enabled: false, models: ['a/one', 'b/two', 'c/three'] });
  const same = await llm.panel({ task: 'audit_same', prompt: 'x', fallback: () => ({ score: 3, comment: 'ok' }) });
  assert.equal(same.length, 1, 'three word-for-word identical offline cards were shown under three model names');
  assert.equal(same[0].mock, true);
  const diff = await llm.panel({ task: 'audit_diff', prompt: 'x', fallback: ({ model }) => ({ score: model.length, who: model }) });
  assert.equal(diff.length, 3, 'a fallback that varies by model keeps every answer');
  assert.deepEqual(llm.dedupeOffline([{ mock: false, data: { a: 1 } }, { mock: false, data: { a: 1 } }]).length, 2, 'live answers are never merged');
  llm.setSettings({ models: ['anthropic/claude-haiku-5.5'] });
});

test('offline inbound: each archetype has its own voice; a fake investor no longer reads like lead-gen spam', () => {
  const s = fresh();
  const A = archetypes();
  const msgs = A.map((a, i) => offlineInbound(s, a, { id: `inb_${i}`, outcome: a.valueOutcomes[0].outcome, channel: a.channel }, { first: 'Jordan', last: 'Hale' }).message);
  const distinct = new Set(msgs);
  assert.ok(distinct.size >= A.length - 1, `${distinct.size} distinct messages for ${A.length} archetypes`);
  const byId = (id) => offlineInbound(s, A.find((a) => a.id === id), { id: 'x1', outcome: 'scam', channel: 'email' }, { first: 'Jordan', last: 'Hale' });
  assert.match(byId('fake_investor').message, /invest|term sheet/i);
  assert.doesNotMatch(byId('fake_investor').message, /leads/i);
  assert.notEqual(byId('seo_link_seller').senderCompany, byId('offshore_dev_shop').senderCompany);
});

test('offline inbound: hidden outcome shows through tells the way a real inbox does (careful reading pays, not perfectly)', () => {
  const s = fresh();
  const a = archetypes().find((x) => x.id === 'vc_associate_checkin');
  const tells = (outcome) => {
    let n = 0;
    for (let i = 0; i < 400; i++) if (/deck, metrics and roadmap/.test(offlineInbound(s, a, { id: `t${i}`, outcome, channel: 'email' }, { first: 'Jordan', last: 'Hale' }).message)) n++;
    return n / 400;
  };
  const bad = tells('waste'), good = tells('investor_meeting');
  assert.ok(Math.abs(bad - TELL_SHARE.bad) < 0.1, `waste tell rate ${bad}`);
  assert.ok(good < 0.2 && good > 0, `genuine senders sometimes look like waste too (${good})`);
});

test('offline inbound: a genuine customer lead matches the company customer type', () => {
  const a = archetypes().find((x) => x.id === 'inbound_demo_qualified');
  const s1 = fresh(); s1.company.customerType = 'local_smb';
  const s2 = fresh(9, 'ent'); s2.company.customerType = 'enterprise';
  const m1 = offlineInbound(s1, a, { id: 'c1', outcome: 'customer_lead', channel: 'email' }, { first: 'Lena', last: 'Kim' }).message;
  const m2 = offlineInbound(s2, a, { id: 'c1', outcome: 'customer_lead', channel: 'email' }, { first: 'Lena', last: 'Kim' }).message;
  assert.match(m1, /owner|office|bakery|firm/i);
  assert.match(m2, /\d,\d{3}-person|global|insurer|manufacturer/i);
});

test('offline replies: genuine senders answer a specific question concretely; worthless ones stay vague', () => {
  const s = fresh();
  const a = archetypes().find((x) => x.id === 'inbound_demo_qualified');
  const q = 'Thanks for reaching out. What are you using today and how many people would use it?';
  const good = offlineNetworkReply(s, { id: 'r1', engaged: 1, outcome: 'customer_lead' }, a, q);
  const bad = offlineNetworkReply(s, { id: 'r1', engaged: 1, outcome: 'waste' }, a, q);
  assert.match(good.reply, /spreadsheet|two people/i);
  assert.doesNotMatch(bad.reply, /spreadsheet/i);
  assert.notEqual(good.reply, bad.reply);
});

test('price-notice readers: offline reactions depend on the reader (usage, tenure) and on what the email left out', () => {
  const weak = 'Hi, we are excited to announce our new pricing. Thanks for being a customer, more details soon.';
  const strong = 'Hi, on March 1 your plan moves from $49 to $59/month because we added the reporting and sync features you asked for. Lock $49 for a year by switching to annual before March 1, or downgrade or cancel from settings any time. Questions? Just reply. Sam';
  const p = { oldPrice: 49, newPrice: 59, noticeDays: 45 };
  const heavy = noticeHeuristic(weak, { ...p, usage: 0.9, months: 20 }).reaction;
  const idle = noticeHeuristic(weak, { ...p, usage: 0.2, months: 2 }).reaction;
  assert.notEqual(heavy, idle);
  assert.match(heavy, /20 months/); assert.match(idle, /cancel/i);
  assert.match(heavy, /reason|current price|what I will pay/);
  const good = noticeHeuristic(strong, { ...p, usage: 0.9, months: 20 });
  assert.match(good.reaction, /told me what changes/);
  assert.ok(good.churnRisk < noticeHeuristic(weak, p).churnRisk);
});

test('redline cover note: keyword stuffing earns nothing; reasons per contested clause separate the tiers', () => {
  const clauses = Object.keys(CLAUSES);
  const std = { liability: 'standard', indemnity: 'ip_only', autorenew: 'keep_notice', residency: 'scc_dpf' };
  const stuffed = 'standard standard cap cap market market because insur subprocessor scc dpf region notice reminder bonterms common paper';
  const stellar = 'We keep the cap at 12 months of fees because that is the Common Paper standard and our cyber insurance covers it. IP indemnity is what we can stand behind, since infringement is the risk we control. Auto-renewal stays, with a reminder 60 days ahead so nobody is surprised. Our LLM provider runs in the US today, so we offer SCCs under the Data Privacy Framework and the subprocessor list.';
  const average = 'These are our standard terms because we are a small company. Thanks for understanding.';
  assert.equal(noteReasons(stuffed, clauses).share, 0);
  assert.equal(noteReasons(stellar, clauses).share, 1);
  const deal = (n) => scoreRedlines(clauses, std, n, { model: 'ent' }).dealProbability;
  assert.ok(deal(stellar) > deal(average) && deal(average) >= deal(stuffed) - 0.001, `${deal(stellar)} ${deal(average)} ${deal(stuffed)}`);
  const r = (n) => weighted(heuristicRedlineFeedback(clauses, std, n, {}).rubric, REDLINE_RUBRIC);
  assert.ok(r(stellar) - r(stuffed) >= 0.5, `${r(stellar)} vs ${r(stuffed)}`);
  assert.match(heuristicRedlineFeedback(clauses, std, average, {}).coaching, /no reason on/);
});

test('services: counters and change orders are real choices; the operator who uses them realises a higher rate', () => {
  const run = (seed, stellar) => {
    const s = fresh(seed);
    const sl = servicesSlice(s);
    const o = { ...makeOffer(s), kind: 'build', fixed: true, weeks: 6, hoursPerWeek: 15, rate: 110 };
    o.fee = o.rate * o.weeks * o.hoursPerWeek;
    sl.offers.push(o);
    if (stellar) counterOffer(s, o.id);
    if (!sl.offers.find((x) => x.id === o.id)) return null; // the client walked
    acceptOffer(s, o.id);
    const p = sl.projects.at(-1);
    for (let d = 0; d < 70 && p.status === 'active'; d++) {
      s.day++;
      services.onDay(s);
      if (stellar && p.creepPending) sendChangeOrder(s, p.id);
    }
    return p.realRate;
  };
  const mean = (xs) => { const v = xs.filter((x) => x != null); return v.reduce((a, b) => a + b, 0) / v.length; };
  const seeds = Array.from({ length: 24 }, (_, i) => i + 1);
  const st = mean(seeds.map((x) => run(x, true))), md = mean(seeds.map((x) => run(x, false)));
  assert.ok(st > md * 1.08, `stellar ${st.toFixed(0)}/h vs mediocre ${md.toFixed(0)}/h`);
  const s = fresh(3);
  servicesSlice(s).projects.push({ status: 'done', realRate: 150, deposit: true, fixed: true }, { status: 'done', realRate: 150, deposit: true, fixed: true });
  const t1 = servicesTier(s).tier;
  const s2 = fresh(3);
  servicesSlice(s2).projects.push({ status: 'done', realRate: 60, deposit: false, fixed: true });
  assert.notEqual(t1, servicesTier(s2).tier);
});

test('world mail offline: senders write in their own voice, not the designer notes', () => {
  const s = fresh();
  for (const id of ['fake_review_temptation', 'meta_ad_account_restricted', 'llm_model_deprecation', 'llm_free_tier_or_limit_cut']) {
    const ev = WORLD_EVENTS.find((e) => e.id === id);
    const n = newsFallback(s, { effects: { noticeDays: 90, errorRate: 0.3 } }, ev, null);
    assert.notEqual(n.body, ev.effects.text, id);
    assert.doesNotMatch(n.body, /\[design\]|No published base rate|FTC rule|\(cf\./, id);
  }
  assert.match(newsFallback(s, { effects: { noticeDays: 90 } }, WORLD_EVENTS.find((e) => e.id === 'llm_model_deprecation'), null).body, /90 days/);
});
