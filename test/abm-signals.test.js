// Account-based marketing and signal-based outreach (apps/sales/abm.js): tier separation through the real model,
// signal precision / decay / false positives, the message judge against the hidden truth, traceable mistakes, the
// pre-deal buying group carried into the CRM deal, job changes that move a champion, readers and the UI tab.
// Short horizons and few seeds (CLAUDE.md iteration-velocity rule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play, mkState } from './helpers/abm-players.js';
import { readOperator } from '../public/core/operator.js';
import { universe, idealProfile } from '../public/apps/sales/prospector.js';
import {
  ensureAbm, addTargetAccount, subscribeSource, abmDay, inMarket, signalStrength, SIGNAL_TYPES, judgeMessage, sendTouch, findMember, researchAccount,
  targets, applyJobChange, accountById, pruneSource, replyOdds, ODDS, isAccountBurned, INITIATIVES, abmAdAudience, setAdsBudget, awareness, verifySignal,
} from '../public/apps/sales/abm.js';
import '../public/apps/sales/abm-readers.js';
import { committeeEffect } from '../public/apps/sales/segments.js';
import crm from '../public/apps/crm.js';

const SEEDS = [3, 4, 5];
const runs = Object.fromEntries(['stellar', 'good', 'average', 'mediocre'].map((t) => [t, SEEDS.map((seed) => play(t, { seed }))]));
const pooled = (tier) => {
  const r = runs[tier];
  const pos = r.reduce((a, x) => a + x.summary.positives, 0), res = r.reduce((a, x) => a + x.summary.resolved, 0);
  const opps = r.reduce((a, x) => a + x.summary.opportunities, 0), accts = r.reduce((a, x) => a + x.summary.targets, 0), hours = r.reduce((a, x) => a + x.summary.hours, 0);
  return { rate: pos / Math.max(1, res), perAccount: opps / accts, per10h: (opps / hours) * 10, pos, opps };
};

test('tier separation: stellar signal operators get 3x+ the positive replies of mediocre ones, from the hidden truth', () => {
  const P = Object.fromEntries(Object.keys(runs).map((t) => [t, pooled(t)]));
  console.log('# abm tiers', JSON.stringify(Object.fromEntries(Object.entries(P).map(([k, v]) => [k, { rate: +v.rate.toFixed(3), perAccount: +v.perAccount.toFixed(3), per10h: +v.per10h.toFixed(2) }]))));
  assert.ok(P.stellar.rate >= 3 * P.mediocre.rate, `stellar ${P.stellar.rate} vs mediocre ${P.mediocre.rate}`);
  assert.ok(P.stellar.rate > P.good.rate && P.good.rate > P.average.rate, 'stellar > good > average on reply rate');
  assert.ok(P.stellar.rate > 0.08 && P.stellar.rate < 0.3, `stellar positive reply ${P.stellar.rate} inside the 10-25% strong-signal band (roughly)`);
  assert.ok(P.mediocre.rate < 0.04, `mediocre ${P.mediocre.rate} near cold-email rates`);
  // ABM: pipeline per target account (doc: stellar about 2-3x average or better) and per founder hour vs mediocre.
  assert.ok(P.stellar.perAccount >= 2 * P.average.perAccount, `per account ${P.stellar.perAccount} vs ${P.average.perAccount}`);
  assert.ok(P.stellar.per10h > P.mediocre.per10h, 'stellar books more opportunities per founder hour than mediocre');
  // Emergent, not flat: stellar touches land on accounts that are really in market far more often.
  const prec = (t) => runs[t].flatMap((r) => r.state.apps.crm.abm.touches).filter((x) => x.inMarket).length / runs[t].flatMap((r) => r.state.apps.crm.abm.touches).length;
  assert.ok(prec('stellar') > prec('mediocre') + 0.15, `in-market precision ${prec('stellar')} vs ${prec('mediocre')}`);
});

test('readers separate the tiers and mistakes are logged for the bad play, not the good', () => {
  const avg = (tier, fn) => runs[tier].reduce((a, r) => a + readOperator(r.state, fn).score, 0) / SEEDS.length;
  for (const fn of ['signal_outreach', 'account_based_marketing']) {
    const s = ['stellar', 'good', 'average', 'mediocre'].map((t) => avg(t, fn));
    assert.ok(s[0] > s[1] && s[1] > s[3] && s[2] > s[3], `${fn}: ${s.map((x) => x.toFixed(2)).join(' > ')}`);
    assert.equal(readOperator(runs.mediocre[0].state, fn).tier, 'mediocre', `${fn} mediocre`);
    assert.ok(['stellar', 'good'].includes(readOperator(runs.stellar[0].state, fn).tier), `${fn} stellar`);
    assert.ok(readOperator(runs.mediocre[0].state, fn).coaching.length > 0, 'coaching for mediocre');
  }
  const ids = (tier) => new Set(runs[tier].flatMap((r) => (r.state.mistakes ?? []).map((m) => m.id)));
  const med = ids('mediocre');
  for (const id of ['creepy_signal_reference', 'burned_account', 'tier1_generic_message', 'intent_platform_too_early', 'stale_signal_reference']) assert.ok(med.has(id), `mediocre logs ${id}`);
  const stellarCost = runs.stellar.reduce((a, r) => a + (r.state.mistakes ?? []).length, 0), medCost = runs.mediocre.reduce((a, r) => a + (r.state.mistakes ?? []).length, 0);
  assert.ok(stellarCost * 10 < medCost, `stellar ${stellarCost} vs mediocre ${medCost} mistakes`);
  for (const m of runs.mediocre[0].state.mistakes.slice(0, 20)) assert.ok(Object.values(m.cost).some((v) => v > 0), `${m.id} has a cost`);
});

test('readers read unknown before the player acts', () => {
  const s = mkState(9);
  assert.equal(readOperator(s, 'signal_outreach').tier, 'unknown');
  assert.equal(readOperator(s, 'account_based_marketing').tier, 'unknown');
});

function world(seed = 11, n = 80) {
  const s = mkState(seed);
  ensureAbm(s);
  const ideal = idealProfile(s);
  const cos = universe(s).companies.filter((c) => ideal.segments.has(c.segId) && c.employees >= 20).slice(0, n);
  for (const co of cos) addTargetAccount(s, co.key, { tier: 2, reason: 'fits' });
  return s;
}
const runDays = (s, n) => { for (let i = 0; i < n; i++) { s.day++; abmDay(s); } };

test('signals: precision by source, stacking raises it, lag, decay by half-life', () => {
  const s = world(11, 120);
  for (const id of ['third_party_intent', 'visitor_id', 'firmographic']) subscribeSource(s, id);
  runDays(s, 120);
  const sigs = ensureAbm(s).signals.filter((x) => x.delivered);
  const precision = (src) => { const x = sigs.filter((g) => g.source === src && g.factual); return x.filter((g) => g.inMarket).length / Math.max(1, x.length); };
  const intent = precision('third_party_intent'), visit = precision('visitor_id');
  assert.ok(intent > 0.15 && intent < 0.55, `third-party intent precision ${intent} (doc ~30-40%)`);
  assert.ok(visit > intent, `first-party visits ${visit} beat third-party intent ${intent}`);
  // Stacking: a signal at an account with a second source within 14 days is in market more often.
  const stacked = sigs.filter((g) => sigs.some((h) => h.accountId === g.accountId && h.source !== g.source && Math.abs(h.day - g.day) <= 14));
  const pS = stacked.filter((g) => g.inMarket).length / Math.max(1, stacked.length), pAll = sigs.filter((g) => g.inMarket).length / sigs.length;
  assert.ok(pS > pAll, `stacked ${pS} > all ${pAll}`);
  // False alarms exist at roughly the configured rate; visitor-ID person matches are wrong about half the time.
  const v = sigs.filter((g) => g.type === 'site_visit' && !g.companyLevel);
  const vFalse = v.filter((g) => !g.factual).length / Math.max(1, v.length);
  assert.ok(vFalse > 0.3 && vFalse < 0.7, `visitor ID wrong-person share ${vFalse}`);
  // Lag: intent arrives days after the event.
  assert.ok(sigs.filter((g) => g.type === 'category_surge').every((g) => g.seenDay - g.day >= SIGNAL_TYPES.category_surge.lag[0]));
  // Decay.
  const g = { type: 'site_visit', day: s.day - SIGNAL_TYPES.site_visit.halfLife };
  assert.ok(Math.abs(signalStrength(s, g) - 0.5) < 1e-9);
  assert.ok(signalStrength(s, { type: 'funding', day: s.day - 4 }) > signalStrength(s, { type: 'site_visit', day: s.day - 4 }), 'web signals decay faster than funding');
  // Verifying reveals the truth of a factual signal, for a cost.
  const one = sigs.find((x) => x.type === 'hiring');
  if (one) assert.ok(['confirmed', 'not_true'].includes(verifySignal(s, one.id).result));
});

test('acting late on the same account: the window closes and the reply odds fall', () => {
  const s = world(12, 60);
  const acc = targets(s).find((x) => inMarket(s, x) && !inMarket(s, x, s.day + 60)) ?? targets(s).find((x) => inMarket(s, x));
  assert.ok(acc, 'an in-market account exists');
  const m = acc.members[0]; m.found = true;
  const j = judgeMessage(s, acc, m, `Hi ${m.first}, the revenue reporting usually breaks first at your size. Worth a 20-minute look next week?`);
  const now = replyOdds(s, acc, m, j).p, later = replyOdds(s, acc, m, j, { day: s.day + 60 }).p;
  assert.ok(now > later, `now ${now} > later ${later}`);
});

test('judge: true, false, stale, creepy and wrong-person references; initiative stuffing; template reuse', () => {
  const s = world(13, 40);
  subscribeSource(s, 'firmographic');
  subscribeSource(s, 'visitor_id');
  runDays(s, 60);
  const a = ensureAbm(s);
  const real = a.signals.find((g) => g.delivered && g.type === 'hiring' && g.factual);
  const fake = a.signals.find((g) => g.delivered && g.type === 'hiring' && !g.factual && !accountById(s, g.accountId).truth.hiring);
  const acc = accountById(s, real.accountId);
  const m = acc.members[0];
  const ok = judgeMessage(s, acc, m, `Hi ${m.first}, saw you are hiring for revenue roles. Worth a 20-minute look?`);
  assert.equal(ok.refs[0].type, 'hiring');
  assert.equal(ok.flags.falseRef, false);
  // Claiming a raise the account never had.
  if (!acc.truth.recentRaise) assert.ok(judgeMessage(s, acc, m, `Hi ${m.first}, congrats on the funding round you announced.`).flags.falseRef);
  if (fake) { const fa = accountById(s, fake.accountId); assert.ok(judgeMessage(s, fa, fa.members[0], 'Hi, saw you are hiring for revenue roles.').flags.falseRef, 'false alarm quoted'); }
  // Creepy.
  assert.ok(judgeMessage(s, acc, m, 'Hi, I saw you visited our pricing page yesterday. Want a demo?').flags.creepy);
  // Stale: an old signal written as news.
  const old = a.signals.find((g) => g.delivered && g.factual && g.type === 'hiring' && s.day - g.day > 2 * SIGNAL_TYPES.hiring.halfLife);
  if (old) { const oa = accountById(s, old.accountId); const later = a.signals.filter((g) => g.accountId === oa.id && g.type === 'hiring' && g.day > old.day); if (!later.length) assert.ok(judgeMessage(s, oa, oa.members[0], 'Hi, saw you just started hiring this week for revenue roles.').flags.staleRef); }
  // Initiative: the true one scores, naming everything is stuffing.
  const init = INITIATIVES[acc.truth.initiative].label.toLowerCase();
  const right = judgeMessage(s, acc, m, `Hi ${m.first}, with ${init} this year, the reporting usually breaks first. Worth a 20-minute look?`);
  const stuffed = judgeMessage(s, acc, m, 'Hi, whether you are consolidating tools, getting off spreadsheets, fixing churn, cutting costs, a compliance audit or opening a new location, we help. Worth a look?');
  assert.ok(right.q > stuffed.q && stuffed.flags.stuffing && right.priority);
  // Template reuse across accounts caps a 1:1 note.
  const accs = targets(s).slice(0, 3);
  const txt = (x, mm) => `Hi ${mm.first}, teams like ${x.name} usually lose hours every week on pipeline reporting and forecast prep in spreadsheets. We automate the weekly forecast end to end. Worth a 20-minute look next week?`;
  for (const x of accs.slice(0, 2)) { const mm = x.members[0]; mm.found = true; sendTouch(s, x.id, mm.key, { text: txt(x, mm) }); }
  const third = accs[2], tm = third.members[0];
  assert.ok(judgeMessage(s, third, tm, txt(third, tm)).flags.template);
});

test('mistakes: burned account, tier-1 generic note, intent platform on a short list, dead source kept', () => {
  const s = world(14, 10);
  subscribeSource(s, 'third_party_intent');
  assert.ok(s.mistakes.some((m) => m.id === 'intent_platform_too_early' && m.cost.usd === 1500));
  const acc = targets(s)[0];
  acc.tier = 1;
  const m = acc.members[0]; m.found = true;
  for (let i = 0; i < 5; i++) { try { sendTouch(s, acc.id, m.key, { text: `Hi ${m.first}, just following up on my last note about our platform. Any thoughts? ${i}` }); } catch { break; } s.day++; }
  assert.ok(isAccountBurned(s, acc), 'five unanswered touches in 30 days burn the account');
  assert.ok(s.mistakes.some((x) => x.id === 'burned_account' && x.cost.days === 180));
  assert.ok(s.mistakes.some((x) => x.id === 'tier1_generic_message'));
  assert.throws(() => sendTouch(s, acc.id, m.key, { text: 'Hi again, one more follow-up note here.' }), /burned/);
  // Dead source: many acted signals, no replies, still paying after 45 days, checked on the 1st of a month.
  const st = ensureAbm(s);
  st.stats.third_party_intent = { signals: 20, acted: 14, positives: 0, meetings: 0 };
  st.sources.third_party_intent.since = s.day - 60;
  for (let i = 0; i < 35; i++) { s.day++; abmDay(s); }
  assert.ok(s.mistakes.some((x) => x.id === 'dead_source_kept' && x.circles));
  pruneSource(s, 'third_party_intent');
  assert.equal(st.sources.third_party_intent.on, false);
});

test('pre-deal buying group carries into the CRM deal; single-threading a large account is logged', () => {
  const s = world(15, 60);
  const big = targets(s).filter((x) => x.members.length >= 3).sort((a, b) => b.employees - a.employees);
  // Multi-threaded: three people found and engaged before the opportunity.
  const A = big[0];
  for (const mm of A.members.slice(0, 3)) { mm.found = true; }
  for (const mm of A.members.slice(0, 3)) { const r = sendTouch(s, A.id, mm.key, { text: `Hi ${mm.first}, the revenue reporting usually breaks first at ${A.employees} people. Worth a 20-minute look next week?` }); r.touch.pending = 'positive'; r.touch.replyDay = s.day + 1; }
  // Single-threaded: one person only, at a big account.
  const B = big[1];
  B.employees = 400; // a large account (fixture)
  B.members[0].found = true;
  const keep = ODDS.meetingGivenPositive;
  ODDS.meetingGivenPositive = 1; // every positive reply books, so both paths are exercised
  const rb = sendTouch(s, B.id, B.members[0].key, { text: `Hi ${B.members[0].first}, the revenue reporting usually breaks first at your size. Worth a 20-minute look?` });
  rb.touch.pending = 'positive'; rb.touch.replyDay = s.day + 1;
  for (let i = 0; i < 4; i++) { s.day++; abmDay(s); }
  ODDS.meetingGivenPositive = keep;
  const dealA = s.apps.crm.deals.find((d) => d.id === A.oppDealId), dealB = s.apps.crm.deals.find((d) => d.id === B.oppDealId);
  assert.ok(dealA && dealB, 'both positive replies opened opportunities');
  {
    assert.ok(dealA.committee?.fromAbm && dealA.committee.members.length >= 3, 'committee seeded from the account map');
    const eA = committeeEffect(s, dealA), eB = committeeEffect(s, dealB);
    assert.ok(eA.mult > eB.mult, `multi-threaded ${eA.mult} > single ${eB.mult}`);
  }
  assert.ok(s.mistakes.some((x) => x.id === 'single_threaded_enterprise' && x.detail.includes(B.name)), 'single-threaded big account logged');
  assert.ok(!s.mistakes.some((x) => x.id === 'single_threaded_enterprise' && x.detail.includes(A.name)), 'the multi-threaded one is not');
});

test('job change: a tracked champion moves, the new account is suggested with a warm contact; a false alarm leaves a ghost', () => {
  const s = world(16, 5);
  const c = s.apps.crm.contacts.find((x) => x.source === 'abm') ?? s.apps.crm.contacts[0];
  const acc0 = targets(s)[0];
  const m0 = acc0.members[0]; m0.found = true;
  const ct = s.apps.crm.contacts.find((x) => x.abm?.memberKey === m0.key) ?? (sendTouch(s, acc0.id, m0.key, { text: `Hi ${m0.first}, quick question about your reporting process this quarter?` }), s.apps.crm.contacts.find((x) => x.abm?.memberKey === m0.key));
  ct.status = 'customer';
  void c;
  const real = applyJobChange(s, { id: 'sigx', type: 'job_change', source: 'job_change', day: s.day, seenDay: s.day, factual: true, championId: ct.id });
  assert.equal(real.status, 'suggested');
  const champ = real.members.find((m) => m.warm);
  assert.ok(champ && champ.found && !champ.ghost);
  assert.equal(ct.movedTo, real.id);
  addTargetAccount(s, real.key, { tier: 1, reason: 'past champion joined' });
  const j = judgeMessage(s, real, champ, `Hi ${champ.first}, congrats on the new role at ${real.name}.`);
  const warmP = replyOdds(s, real, champ, j).p, coldP = replyOdds(s, real, real.members.find((m) => !m.warm), j).p;
  assert.ok(warmP > coldP, 'the past champion is far likelier to reply');
  const ghost = applyJobChange(s, { id: 'sigy', type: 'job_change', source: 'job_change', day: s.day, seenDay: s.day, factual: false, championId: ct.id });
  const gm = ghost.members.find((m) => m.warm);
  ensureAbm(s).signals.push({ id: 'sigy', accountId: ghost.id, type: 'job_change', source: 'job_change', day: s.day, seenDay: s.day, factual: false, personKey: gm.key, delivered: true });
  assert.ok(judgeMessage(s, ghost, gm, `Hi ${gm.first}, congrats on the new role at ${ghost.name}.`).flags.falseRef, 'a false job-change alert quoted backfires');
});

test('research reveals the initiative; finding people costs hours; 1:many audience hook and awareness', () => {
  const s = world(17, 12);
  const acc = targets(s)[0];
  let found = false;
  for (let i = 0; i < 4 && !found; i++) found = Boolean(researchAccount(s, acc.id, 'deep') && acc.research.initiative);
  assert.equal(acc.research.initiative, acc.truth.initiative);
  const role = acc.members.find((m) => !m.found)?.role;
  if (role) assert.ok(findMember(s, acc.id, role).hours > 0);
  assert.ok(ensureAbm(s).hours >= 1.5, "research and lookups are charged");
  const aud = abmAdAudience(s);
  assert.equal(aud.domains.length, targets(s).length);
  setAdsBudget(s, 3000);
  assert.ok(awareness(s) > 0.5 && abmAdAudience(s).monthly === 3000);
  assert.ok(s.recurring.some((r) => r.active && r.category === 'advertising' && r.amount === 3000));
});

test('UI: the Target accounts tab renders every route offline with no hidden truth or coaching leaks', () => {
  const s = runs.stellar[0].state;
  const acc = targets(s)[0];
  const leak = /stellar operator|Stellar:|What a stellar|Tip:|you should(?! have)|inMarket|in market now/i;
  for (const params of ['abm', 'abm:sources', 'abm:add', 'abm:cluster', `abm:${acc.id}`]) {
    const root = { innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; } };
    crm.render(root, { state: s, params, save() {}, act() {}, render() {}, navigate() {}, enqueue() {}, toast() {}, llm: null });
    assert.ok(root.innerHTML.includes('Target accounts'), params);
    const m = root.innerHTML.match(new RegExp(`.{0,60}(?:${leak.source}).{0,60}`, 'i'));
    assert.ok(!m, `${params} leaks: ${m?.[0]}`);
  }
  const fresh = mkState(21);
  const root = { innerHTML: '', addEventListener() {} };
  crm.render(root, { state: fresh, params: 'abm', save() {}, act() {}, render() {}, navigate() {}, enqueue() {}, toast() {}, llm: null });
  assert.match(root.innerHTML, /How ABM and signal-based outreach work here/);
  assert.match(root.innerHTML, /No target accounts yet/);
  assert.match(root.innerHTML, /No signal sources yet/);
});
