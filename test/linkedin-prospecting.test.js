// LinkedIn prospecting (sales/linkedin.js): scripted stellar / good / average / mediocre operators on the same company
// and seeds over four weeks, restriction risk from automation and reports, engager quality from content quality, the
// message judge (true vs false references, pitch, template), and the operator reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { readOperator } from '../public/core/operator.js';
import { publishPost } from '../public/apps/growth/organicEngine.js';
import { idealProfile } from '../public/apps/sales/prospector.js';
import * as LI from '../public/apps/sales/linkedin.js';
import '../public/apps/sales/linkedin-reader.js';
import { OPERATOR_TIERS } from '../public/data/operator-tiers.js';
import outreach from '../public/apps/outreach.js';

function fresh(seed = 7) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Automated payout reconciliation for Shopify stores';
  s.company.icp = 'Shopify store owners with 5-50 employees who are hiring a bookkeeper';
  s.founder.network.linkedin = 1500;
  s.apps.outreach = {};
  LI.ensureLinkedin(s);
  return s;
}

const GOOD_POST = 'Shopify store owners: payout reconciliation eats 6 hours a month. Three things we learned from 40 stores about matching payouts, refunds and fees before hiring a bookkeeper.';
const BAD_POST = 'We just launched our new feature! Our platform is the best. Sign up for a free trial, link in comments.';
const PITCH = 'Hi {{firstName}}, we help companies like {{company}} automate reconciliation with our platform. Book a 15 min demo?';

function buyerLike(s, p) {
  const ideal = idealProfile(s);
  return !p.synthetic && ideal.segments.has(p.segId) && ideal.buyer.includes(p.seniority);
}

const run = (s, fn, ...a) => { try { const r = fn(s, ...a); s._h = (s._h ?? 0) + (r?.hours ?? 0); return r; } catch { return null; } };

function topicLine(s, p) {
  const prof = LI.profileOf(s, p);
  return prof?.topic ?? null;
}

// A careful operator writes each message for the person; the script varies wording the way a person would.
const vary = (p, openers, asks) => { const h = [...p.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); return `${openers[h % openers.length]} ${asks[(h >> 3) % asks.length]}`; };
function stellarDm(p, topic, engaged) {
  const openers = engaged
    ? [`Thanks for connecting, ${p.first}. You reacted to my post on payout reconciliation, so I am guessing refunds and fees eat time at ${p.companyName} too.`, `Glad you liked my post on payout reconciliation, ${p.first}.`, `Thanks for engaging with my post about reconciliation and refunds.`, `Saw you reacted to my post on matching payouts. Appreciate it.`]
    : [`Thanks for connecting, ${p.first}. Your post on ${topic ?? 'running the store'} stuck with me.`, `Your post on ${topic ?? 'the store'} made me think, ${p.first}.`, `I keep coming back to your post on ${topic ?? 'operations'}.`, `Really liked what you wrote on ${topic ?? 'ops'}.`];
  const asks = ['How do you handle payout matching today?', 'Is month-end matching still manual for you?', 'Who owns reconciliation on your team right now?', 'What did you try before hiring help for the books?'];
  return vary(p, openers, asks);
}

// One working day of each archetype.
const SCRIPTS = {
  stellar(s, d) {
    if (d % 7 === 0) publishPost(s, { platform: 'linkedin', text: GOOD_POST, skill: 0.85, judge: { skill: 0.85 } });
    const L = LI.ensureLinkedin(s);
    if (d === 0) LI.setSalesNav(s, true);
    // 1. warm list first: ICP engagers of your posts
    const warm = LI.yourPosts(s).flatMap((x) => x.engagers).map((e) => LI.personOf(s, e.id)).filter((p) => p && buyerLike(s, p) && L.people[p.id]?.requestedDay == null);
    const search = LI.searchPeople(s, { ...LI.LI_FILTERS, segment: [...idealProfile(s).segments][0], seniority: idealProfile(s).buyer, posted: true }, { limit: 12 }).people;
    let n = 0;
    for (const p of [...warm, ...search]) {
      if (n >= 6) break;
      if (L.people[p.id]?.requestedDay != null) continue;
      run(s, LI.viewProfile, p.id);
      const topic = topicLine(s, p);
      const eng = LI.truthOf(s, p).engaged;
      if (topic) run(s, LI.commentOn, p.id, vary(p, [`Interesting point on ${topic}.`, `This matches what I see on ${topic}.`, `Good take on ${topic}.`], ['We saw the same with stores your size: weekly beat monthly for us. Curious what you tried first?', 'The teams that fixed it moved the work earlier in the week, not later. What worked for you?', 'Most owners I talk to underestimate how much time this eats every single month. Did you measure it?']));
      const note = eng && !eng.competitor ? vary(p, [`Thanks for reacting to my post on payout reconciliation, ${p.first}.`, `Glad my post on reconciliation resonated, ${p.first}.`], ['Curious how you handle it today?', 'Is it still a monthly chore for you?']) : topic ? vary(p, [`Enjoyed your post on ${topic}, ${p.first}.`, `Your take on ${topic} was spot on.`], ['Would be good to connect.', 'Happy to swap notes.']) : '';
      run(s, LI.sendConnect, p.id, note);
      n++;
    }
    for (const [id, r] of Object.entries(L.people)) {
      if (!r.connected || r.dms) continue;
      const p = LI.personOf(s, id);
      const topic = topicLine(s, p);
      const eng = LI.truthOf(s, p).engaged;
      const body = stellarDm(p, topic, eng && !eng.competitor);
      run(s, LI.sendDm, id, body);
    }
  },
  good(s, d) {
    const goodDm = (p) => { const t = topicLine(s, p); return t ? vary(p, [`Thanks for connecting, ${p.first}. Your post on ${t} matched what we hear from store owners.`, `Appreciate the connect. I read your post on ${t}.`], ['How long does matching Shopify payouts take each month?', 'Who handles reconciliation today?']) : vary(p, [`Thanks for connecting, ${p.first}.`, 'Appreciate the connect.'], ['How long does matching Shopify payouts take each month?', 'Who handles reconciliation today?']); };
    const L = LI.ensureLinkedin(s);
    if (d === 0) LI.setSalesNav(s, true);
    const search = LI.searchPeople(s, { ...LI.LI_FILTERS, segment: [...idealProfile(s).segments][0], seniority: idealProfile(s).buyer, posted: true }, { limit: 10 }).people;
    let n = 0;
    for (const p of search) {
      if (n >= 7) break;
      run(s, LI.viewProfile, p.id);
      const topic = topicLine(s, p);
      run(s, LI.sendConnect, p.id, topic ? vary(p, [`Saw your post on ${topic}, ${p.first}.`, `Read your post on ${topic}.`], ['Would be good to connect.', 'Happy to swap notes on it.']) : '');
      n++;
    }
    for (const [id, r] of Object.entries(L.people)) {
      if (!r.connected || r.dms) continue;
      const p = LI.personOf(s, id);
      run(s, LI.sendDm, id, goodDm(p));
    }
  },
  average(s, d) {
    const L = LI.ensureLinkedin(s);
    const search = LI.searchPeople(s, { ...LI.LI_FILTERS, segment: [...idealProfile(s).segments][0] }, { limit: 10 }).people;
    for (const p of search.slice(0, 10)) run(s, LI.sendConnect, p.id, '');
    for (const [id, r] of Object.entries(L.people)) {
      if (!r.connected || r.dms) continue;
      const p = LI.personOf(s, id);
      run(s, LI.sendDm, id, `Hi ${p.first}, thanks for connecting! Would love to learn more about what you do at ${p.companyName} and share what we are building.`);
    }
  },
  mediocre(s, d) {
    const L = LI.ensureLinkedin(s);
    if (d % 7 === 0) publishPost(s, { platform: 'linkedin', text: BAD_POST, skill: 0.3, judge: { skill: 0.3 } });
    if (d === 0) LI.setAutomation(s, { on: true, perDay: 40, note: PITCH, filters: { ...LI.LI_FILTERS } });
    for (const e of LI.yourPosts(s).flatMap((x) => x.engagers)) {
      if (L.people[e.id]?.requestedDay != null) continue;
      const p = LI.personOf(s, e.id);
      run(s, LI.sendConnect, e.id, PITCH.replace('{{firstName}}', p.first).replace('{{company}}', p.companyName));
    }
    for (const [id, r] of Object.entries(L.people)) {
      if (!r.connected || r.dms) continue;
      const p = LI.personOf(s, id);
      run(s, LI.sendDm, id, `Hi ${p.first}, congrats on the new role! We help companies like ${p.companyName} automate reconciliation with our platform. Book a 15 min demo: https://cal.com/pat`);
    }
  },
};

function simulate(tier, seed, days = 28) {
  const s = fresh(seed);
  for (let d = 0; d < days; d++) {
    if (d % 7 < 5) SCRIPTS[tier](s, d);
    s.day++;
    LI.linkedinProspectingDay(s);
  }
  // let the last requests and messages resolve
  for (let d = 0; d < 21; d++) { s.day++; LI.linkedinProspectingDay(s); }
  return s;
}

const SEEDS = [3, 7, 11];
const results = {};
function resultsFor(tier) {
  if (results[tier]) return results[tier];
  const out = SEEDS.map((seed) => {
    const s = simulate(tier, seed);
    const st = LI.liStats(s, 400);
    return { s, st, read: readOperator(s, 'linkedin_prospecting'), hours: s._h ?? 0, events: s.apps.outreach.linkedin.health.events.length };
  });
  const sum = (k) => out.reduce((a, x) => a + (x.st[k] ?? 0), 0);
  results[tier] = { out, accepted: sum('accepted'), decided: sum('decided'), replies: sum('replies'), answered: sum('answered'), positive: sum('positive'), hours: out.reduce((a, x) => a + x.hours, 0), events: out.reduce((a, x) => a + x.events, 0), score: out.reduce((a, x) => a + (x.read.score ?? 0), 0) / out.length };
  return results[tier];
}

test('tier separation: stellar > good > average > mediocre on acceptance, replies and the operator read', () => {
  const R = Object.fromEntries(['stellar', 'good', 'average', 'mediocre'].map((t) => [t, resultsFor(t)]));
  const acc = (t) => R[t].accepted / Math.max(1, R[t].decided);
  const rr = (t) => R[t].replies / Math.max(1, R[t].answered);
  for (const t of Object.keys(R)) {
    console.log(`# ${t}: ${R[t].out[0].read.evidence.join(' | ')}`);
    console.log(`# ${t}: acceptance ${(acc(t) * 100).toFixed(1)}% (${R[t].decided}), reply ${(rr(t) * 100).toFixed(1)}% (${R[t].answered}), positive ${R[t].positive}, hours ${R[t].hours.toFixed(1)}, restrictions ${R[t].events}, score ${R[t].score.toFixed(2)} tiers ${R[t].out.map((x) => x.read.tier).join('/')}`);
  }
  assert.ok(acc('stellar') >= 0.38 && acc('stellar') <= 0.62, `stellar acceptance ${acc('stellar')}`);
  assert.ok(acc('average') >= 0.18 && acc('average') <= 0.34, `average acceptance ${acc('average')}`);
  assert.ok(acc('mediocre') <= 0.2, `mediocre acceptance ${acc('mediocre')}`);
  assert.ok(acc('stellar') > acc('good') && acc('good') > acc('average') && acc('average') > acc('mediocre'));
  assert.ok(rr('stellar') >= 2.5 * rr('mediocre'), `reply rate stellar ${rr('stellar')} vs mediocre ${rr('mediocre')}`);
  assert.ok(rr('stellar') > rr('average'));
  assert.ok(R.stellar.positive > R.mediocre.positive, 'stellar books more positive replies than a 40/day automation blast');
  assert.ok(R.stellar.score > R.good.score && R.good.score > R.average.score && R.average.score > R.mediocre.score, 'reader scores ordered');
  assert.ok(R.stellar.out.every((x) => ['stellar', 'good'].includes(x.read.tier)), 'stellar reads stellar/good');
  assert.ok(R.mediocre.out.every((x) => x.read.tier === 'mediocre'), 'mediocre reads mediocre');
  assert.equal(R.stellar.events, 0, 'no restrictions for the hand-sent warm motion');
});

test('mistakes: the mediocre motion leaves traceable costs (pitch notes, liker blasts, restriction)', () => {
  const R = resultsFor('mediocre');
  const ids = new Set(R.out.flatMap((x) => (x.s.mistakes ?? []).filter((m) => m.functionId === 'linkedin_prospecting').map((m) => m.id)));
  assert.ok(ids.has('pitch_in_connection_note'), [...ids].join());
  assert.ok(ids.has('mass_dm_likers') || ids.has('li_template_blast'), [...ids].join());
  assert.ok(R.events >= 1, 'automation + reports restricted at least one of three accounts');
  for (const x of R.out) for (const m of x.s.mistakes.filter((m) => m.functionId === 'linkedin_prospecting')) {
    const c = m.cost;
    assert.ok(c.hours + c.usd + c.days + c.reputation + c.customers > 0, `${m.id} has a cost`);
    assert.ok(OPERATOR_TIERS.linkedin_prospecting.traps.some((t) => t.id === m.id), `${m.id} is a trap`);
  }
});

test('restriction risk: automation and reports raise the hazard; a restricted account cannot send', () => {
  const s = fresh(5);
  assert.equal(LI.restrictionHazard(s), 0);
  LI.setAutomation(s, { on: true, perDay: 40, note: PITCH });
  const h1 = LI.restrictionHazard(s);
  assert.ok(h1 > 0.02, `automation hazard ${h1}`);
  const L = LI.ensureLinkedin(s);
  for (let i = 0; i < 12; i++) L.health.reports.push(s.day);
  assert.ok(LI.restrictionHazard(s) > h1 + 0.03);
  L.health.restrictedUntil = s.day + 7;
  const p = LI.searchPeople(s, { ...LI.LI_FILTERS }, { limit: 1 }).people[0];
  assert.throws(() => LI.sendConnect(s, p.id, ''), /restricted/);
  assert.equal(LI.liWindow(s).left, 0);
});

test('engagers: content quality and relevance decide how many buyers engage (hidden mix)', () => {
  const s = fresh(9);
  for (let i = 0; i < 3; i++) publishPost(s, { platform: 'linkedin', text: GOOD_POST, skill: 0.85, judge: { skill: 0.85 } });
  for (let i = 0; i < 3; i++) publishPost(s, { platform: 'linkedin', text: BAD_POST, skill: 0.25, judge: { skill: 0.25 } });
  const posts = LI.yourPosts(s);
  const share = (good) => { const e = posts.filter((x) => (x.post.text === GOOD_POST) === good).flatMap((x) => x.engagers); return { icp: e.filter((x) => x.kind === 'icp').length / Math.max(1, e.length), bots: e.filter((x) => x.kind === 'bot').length / Math.max(1, e.length), n: e.length }; };
  const g = share(true), b = share(false);
  console.log(`# engagers good post ${JSON.stringify(g)} bad post ${JSON.stringify(b)}`);
  assert.ok(LI.engagerMix(0.85, 1).icp > 3 * LI.engagerMix(0.25, 0.3).icp);
  assert.ok(g.icp > b.icp, `ICP share ${g.icp} vs ${b.icp}`);
  assert.ok(b.bots > g.bots);
  assert.ok(LI.postRelevance(s, GOOD_POST) > LI.postRelevance(s, BAD_POST));
});

test('judge: true references help, false claims, pitches and templates are caught', () => {
  const s = fresh(4);
  LI.setSalesNav(s, true);
  const people = LI.searchPeople(s, { ...LI.LI_FILTERS, posted: true }, { limit: 30 }).people;
  const p = people.find((x) => !LI.truthOf(s, x).jobChanged90);
  LI.viewProfile(s, p.id);
  const topic = LI.profileOf(s, p).topic;
  const good = LI.judgeText(s, p, `Enjoyed your post on ${topic}. Curious what you tried first?`, 'note');
  const fake = LI.judgeText(s, p, 'Congrats on the new role! Would love to connect.', 'note');
  const pitch = LI.judgeText(s, p, 'Hi, we help companies like yours with our platform. Book a demo?', 'note');
  assert.ok(good.specific && !good.falseClaim && good.q > 0.7, JSON.stringify(good));
  assert.ok(fake.falseClaim && fake.q < 0.4);
  assert.ok(pitch.pitch && pitch.q < 0.3);
  // Stuffing every claim at once: the untrue ones are penalised, so it never beats the plain true reference.
  const stuffed = LI.judgeText(s, p, `Congrats on the new role, fellow alum! Thanks for liking my post. Your post on ${topic} was great.`, 'note');
  assert.ok(stuffed.q < good.q);
  // Template: the same text to several people is detected.
  for (const x of people.slice(0, 4)) LI.sendConnect(s, x.id, `Hi ${x.first}, I'd love to connect and expand my network.`);
  const t = LI.judgeText(s, people[5], `Hi ${people[5].first}, I'd love to connect and expand my network.`, 'note');
  assert.ok(t.template, JSON.stringify(t));
});

test('reader is unknown before acting; the CRM gets the people you reach', () => {
  const s = fresh(2);
  assert.equal(readOperator(s, 'linkedin_prospecting').tier, 'unknown');
  const p = LI.searchPeople(s, { ...LI.LI_FILTERS }, { limit: 1 }).people[0];
  const r = LI.sendConnect(s, p.id, '');
  assert.ok(r.request.contactId);
  assert.ok(s.apps.crm.contacts.some((c) => c.id === r.request.contactId && c.source === 'linkedin'));
  assert.throws(() => LI.searchPeople(s, { ...LI.LI_FILTERS, jobChange: true }), /Sales Navigator/);
});

test('UI: every LinkedIn sub-tab renders (guide, warm, search, leads, conversations, health, CRM) with empty states and no coaching leak', () => {
  const s = fresh(6);
  const stub = () => ({ innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; } });
  const draw = (params) => { const root = stub(); outreach.render(root, { state: s, params, save() {}, act() {}, render() {}, navigate() {}, enqueue() {}, toast() {}, llm: null }); return root.innerHTML; };
  const guide = draw('linkedin');
  assert.match(guide, /How to find high-intent buyers on LinkedIn/);
  for (const sub of ['warm', 'search', 'leads', 'convos', 'health', 'crm']) assert.match(draw(`linkedin:${sub}`), /linkedin:guide/, sub);
  assert.match(draw('linkedin:warm'), /No LinkedIn posts in the last 60 days/);
  assert.match(draw('linkedin:search'), /Sales Navigator/);
  publishPost(s, { platform: 'linkedin', text: GOOD_POST, skill: 0.85, judge: { skill: 0.85 } });
  LI.setSalesNav(s, true);
  const warm = draw('linkedin:warm');
  assert.match(warm, /Engaged with your posts/);
  for (const sub of ['guide', 'warm', 'search', 'health']) assert.doesNotMatch(draw(`linkedin:${sub}`), /stellar operator|Stellar:|What a stellar|Tip:|you should(?! have)/i, sub);
});

test('UI: the person panel shows why actions are disabled and renders after a send', async () => {
  const { personPanel } = await import('../public/apps/sales/linkedin-view.js');
  const s = fresh(8);
  const p = LI.searchPeople(s, { ...LI.LI_FILTERS }, { limit: 1 }).people[0];
  let h = String(personPanel(s, p.id));
  assert.match(h, /View profile/);
  assert.match(h, /Only connections can be messaged/);
  assert.match(h, /InMail needs Sales Navigator/);
  LI.viewProfile(s, p.id);
  LI.sendConnect(s, p.id, '');
  h = String(personPanel(s, p.id));
  assert.match(h, /Request pending/);
  assert.match(h, /Profile\./);
});
