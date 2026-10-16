// Warm intros and referrals (apps/sales/warm-intros.js): scripted stellar / good / average / mediocre intro askers on
// the same world separate in the operator read and in meetings per founder hour; goodwill decays with over-asking and
// unclosed loops; asking an at-risk customer backfires; the blurb judge rewards forwardability, not length.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureNetwork, addPerson } from '../public/core/network.js';
import { addSource } from '../public/core/advice.js';
import { ensureCrm } from '../public/apps/sales/model.js';
import { judgeBlurb } from '../public/core/intro-blurb.js';
import {
  connectors, ledgerOf, mapMutuals, knownTies, prequalify, requestIntro, closeLoop, returnFavor, warmDay, warmStats,
  readWarmIntros, momentOf, asksWithin, ensureWarm, tiesOf, WI,
} from '../public/apps/sales/warm-intros.js';
import { readOperator } from '../public/core/operator.js';

function world(seed) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'vc', founderName: 'Dana Reyes', seed });
  s.day = 100;
  s.company.icp = 'Finance leads at 20-200 person Shopify brands';
  ensureNetwork(s);
  const rel = [['ex_colleague', 0.5, ['customer']], ['former_manager', 0.55, ['customer']], ['friend', 0.8, []], ['founder_peer', 0.4, ['customer', 'partner']], ['acquaintance', 0.15, []], ['ex_colleague', 0.45, ['customer']]];
  rel.forEach(([relation, strength, knows], i) => addPerson(s, { name: `Contact ${i} Person${i}`, relation, strength, knows }));
  // An investor on the cap table, an advisor, two customers (one right after a win, one at risk).
  s.apps.fundraising = { investors: [{ id: 'inv1', name: 'Priya Angel', firm: 'Angel (individual)' }], cap: { safes: [{ invId: 'inv1', amount: 50000 }], preferred: [] } };
  addSource(s, { kind: 'advisor', name: 'Sam Advisor', expertise: 'gtm', quality: 'good' });
  const crm = ensureCrm(s);
  crm.companies.push({ id: 'coA', name: 'Acme Goods' }, { id: 'coB', name: 'Bolt Supply' });
  crm.contacts.push({ id: 'ctA', companyId: 'coA', firstName: 'Ana', lastName: 'Lopez' }, { id: 'ctB', companyId: 'coB', firstName: 'Ben', lastName: 'Okafor' });
  s.apps.success = { accounts: {
    subA: { subId: 'subA', companyId: 'coA', contactId: 'ctA', health: 82, lastQbrDay: 95, drift: 0, createdDay: 10 },
    subB: { subId: 'subB', companyId: 'coB', contactId: 'ctB', health: 38, drift: 0, createdDay: 10 },
  } };
  return s;
}

const CRISP = (t) => `Hi ${t.name.split(' ')[0]}, I'm Dana, founder of Ledgerly. We cut month-end close for 40-person Shopify brands from 9 days to 3, and since ${t.company} is hiring a controller I thought it might be timely. Open to a 15-minute call next week? No worries at all if it's not a fit.`;
const DECENT = (t) => `Dana runs Ledgerly, which automates the month-end close for Shopify brands. I think ${t.company} would get a lot out of it, given their team. Would they be open to a quick call?`;
const SLOPPY = 'Ledgerly is an innovative AI-powered platform that leverages cutting-edge technology to revolutionise finance operations for modern brands with seamless integrations, robust reporting, real-time dashboards and a world-class onboarding experience that our customers love, plus a lot more features that we are shipping every single week, see our deck attached and book a demo on our calendly.';

const PLAIN = 'Ledgerly helps Shopify brands close their books faster with automated reconciliation and clean reporting. We would love to talk to finance leads at growing brands about how they handle month-end today. Could you introduce us to anyone relevant?';

// Scripted players. Each returns hours spent; the world advances day by day with warmDay.
function play(tier, seed, days = 160) {
  const s = world(seed);
  let hours = 0;
  const spend = (r) => { if (r?.hours) hours += r.hours; return r; };
  const cs = () => connectors(s);
  const followDelay = { stellar: 1, good: 2, average: 3, mediocre: 6 }[tier];
  const loopRate = { stellar: 1, good: 0.75, average: 0.3, mediocre: 0 }[tier];
  const asked = new Map();
  if (tier === 'stellar' || tier === 'good') for (const c of cs()) spend(mapMutuals(s, c.id));
  // Stellar pre-qualifies the two most promising targets per connector (worked together beats a LinkedIn connection).
  if (tier === 'stellar') for (const c of cs()) for (const t of knownTies(s, c).sort((a, b) => (a.how === 'LinkedIn connection') - (b.how === 'LinkedIn connection')).slice(0, 2)) spend(prequalify(s, t.id));
  for (let d = 0; d < days; d++) {
    // Ask cadence: stellar/good one considered ask every 9 days, average every 12, mediocre every 6.
    const every = { stellar: 9, good: 9, average: 12, mediocre: 6 }[tier];
    if (d % every === 0) {
      const list = cs();
      if (tier === 'stellar' || tier === 'good') {
        // Pick the connector not asked in 120 days with the best discovered target.
        const order = [];
        for (const c of list) {
          if (s.day - (asked.get(c.id) ?? -999) < 120) continue;
          if (c.kind === 'customer' && momentOf(s, s.apps.success.accounts[c.ref]) !== 'win') continue;
          const ties = knownTies(s, c).filter((t) => !ensureWarm(s).requests.some((r) => r.tieId === t.id));
          const rank = { strong: 3, possible: 2, null: 1, weak: 0 };
          const t = tier === 'stellar' ? ties.filter((x) => x.band !== 'weak').sort((a, b) => rank[b.band] - rank[a.band])[0] : ties[0];
          if (t) order.push({ c, t, r: tier === 'stellar' ? rank[t.band] : 1 });
        }
        order.sort((a, b) => b.r - a.r);
        const pickd = order[0];
        if (pickd) { asked.set(pickd.c.id, s.day); spend(requestIntro(s, { connectorId: pickd.c.id, tieId: pickd.t.id, blurb: (tier === 'stellar' ? CRISP : DECENT)(pickd.t) })); }
      } else if (tier === 'average') {
        // Investors, advisors and strong ties, a type of company typed in, a product-description blurb.
        const pool = list.filter((c) => ['investor', 'advisor'].includes(c.kind) || (c.kind === 'network' && c.strength >= 0.5));
        const c = pool[(d / every) % pool.length];
        if (c) spend(requestIntro(s, { connectorId: c.id, targetCompany: 'a Shopify brand', blurb: PLAIN }));
      } else {
        // "Who do you know?" to the same few people, no blurb, including the unhappy customer and the investor.
        const pool = list.filter((c) => c.kind !== 'advisor').slice(0, 3).concat(list.filter((c) => c.kind === 'customer' || c.kind === 'investor'));
        const c = pool[(d / every) % pool.length];
        if (c) spend(requestIntro(s, { connectorId: c.id, blurb: 'know anyone who could use this?' }));
      }
    }
    // Follow up on intros after the tier's delay, close loops, repay favours.
    const crm = ensureCrm(s);
    for (const r of ensureWarm(s).requests) {
      if (r.status === 'introduced' && r.contactId && s.day - r.outcomeDay >= followDelay) {
        const q = crm.inboundQueue.find((x) => x.contactId === r.contactId && x.status === 'new');
        if (q && (tier !== 'mediocre' || (parseInt(r.id.split('_')[1], 36) % 2 === 0))) { q.status = 'accepted'; hours += 0.75; }
      }
      const done = ['connector_declined', 'target_declined', 'introduced'].includes(r.status);
      if (done && !r.loopClosed && s.day - r.outcomeDay >= 3 && !r.loopDecided) {
        r.loopDecided = true;
        if ((parseInt(r.id.split('_')[1], 36) % 100) / 100 < loopRate) spend(closeLoop(s, r.id));
      }
      if (tier === 'stellar' && r.status === 'introduced' && !r.favored) { r.favored = true; spend(returnFavor(s, r.cid)); }
    }
    s.day++;
    warmDay(s);
  }
  return { s, hours, stats: warmStats(s), read: readWarmIntros(s) };
}

test('tier separation: scripted stellar > good > average > mediocre in the read, and stellar books 2x+ the meetings per hour of mediocre', () => {
  const seeds = [3, 11, 29];
  const agg = {};
  for (const tier of ['stellar', 'good', 'average', 'mediocre']) {
    const runs = seeds.map((sd) => play(tier, sd));
    agg[tier] = {
      tiers: runs.map((r) => r.read.tier), score: runs.reduce((a, r) => a + r.read.score, 0) / runs.length,
      meetings: runs.reduce((a, r) => a + r.stats.meetings, 0), opps: runs.reduce((a, r) => a + r.stats.expectedOpps, 0), hours: runs.reduce((a, r) => a + r.hours, 0),
      goodwill: runs.reduce((a, r) => a + Object.values(ensureWarm(r.s).ledger).reduce((x, l) => x + l.goodwill, 0) / Math.max(1, Object.keys(ensureWarm(r.s).ledger).length), 0) / runs.length,
    };
  }
  const per = (t) => agg[t].opps / Math.max(0.1, agg[t].hours);
  if (process.env.WI_DEBUG) console.log(JSON.stringify(agg, null, 1), ['stellar', 'good', 'average', 'mediocre'].map(per));
  assert.ok(agg.stellar.score > agg.good.score && agg.good.score > agg.average.score && agg.average.score > agg.mediocre.score, JSON.stringify(agg));
  for (const tier of ['stellar', 'good', 'average', 'mediocre']) assert.ok(agg[tier].tiers.filter((t) => t === tier).length >= 2, `${tier} reads ${agg[tier].tiers}`);
  assert.ok(agg.mediocre.tiers.every((t) => t === 'mediocre'), `mediocre reads ${agg.mediocre.tiers}`);
  assert.ok(agg.stellar.meetings >= 2 * Math.max(1, agg.average.meetings) * 0.9 && agg.stellar.meetings > agg.good.meetings, `meetings ${agg.stellar.meetings}/${agg.good.meetings}/${agg.average.meetings}/${agg.mediocre.meetings}`);
  assert.ok(per('stellar') > 2 * per('mediocre'), `opps/hour stellar ${per('stellar')} vs mediocre ${per('mediocre')}`);
  assert.ok(per('stellar') > per('average'), `opps/hour stellar ${per('stellar')} vs average ${per('average')}`);
  assert.ok(agg.stellar.goodwill > agg.mediocre.goodwill + 0.15, `goodwill ${agg.stellar.goodwill} vs ${agg.mediocre.goodwill}`);
});

test('reader is unknown until the player has asked three times', () => {
  const s = world(5);
  assert.equal(readWarmIntros(s).tier, 'unknown');
  assert.equal(readOperator(s, 'warm_intros').tier, 'unknown');
});

test('goodwill: over-asking and unclosed loops lower it and the yes rate; closing the loop and favours raise it', () => {
  const s = world(7);
  const c = connectors(s).find((x) => x.kind === 'network' && x.strength >= 0.5);
  mapMutuals(s, c.id);
  const t = knownTies(s, c)[0] ?? tiesOf(s, c)[0];
  const g0 = ledgerOf(s, c.id).goodwill;
  const first = requestIntro(s, { connectorId: c.id, tieId: t.id, blurb: CRISP(t) }).req;
  const second = requestIntro(s, { connectorId: c.id, tieId: t.id, blurb: CRISP(t) }).req;
  assert.ok(second.p < first.p, `second ask ${second.p} < first ${first.p}`);
  assert.ok(ledgerOf(s, c.id).goodwill < g0, 'over-asking cost goodwill');
  assert.ok(s.mistakes.some((m) => m.id === 'over_asked_connector'), 'over-ask logged');
  assert.equal(asksWithin(s, c.id, 30), 2);
  // Let both resolve and never close the loop.
  for (let d = 0; d < 60; d++) { s.day++; warmDay(s); for (const q of ensureCrm(s).inboundQueue) q.status = 'accepted'; }
  assert.ok(s.mistakes.some((m) => m.id === 'no_loop_closed'), 'unclosed loop logged');
  const gLow = ledgerOf(s, c.id).goodwill;
  // Repair: favour + closing late loops.
  returnFavor(s, c.id);
  assert.ok(ledgerOf(s, c.id).goodwill > gLow, 'favour raises goodwill');
  // A burned connector never says yes.
  ledgerOf(s, c.id).goodwill = 0.05; ledgerOf(s, c.id).burned = true;
  s.day += 200;
  const third = requestIntro(s, { connectorId: c.id, tieId: t.id, blurb: CRISP(t) }).req;
  assert.equal(third.p, 0);
});

test('asking an at-risk customer backfires: account health input drops, connector burned, mistake logged; a win-moment ask does not', () => {
  const s = world(9);
  const risky = connectors(s).find((c) => c.kind === 'customer' && c.ref === 'subB');
  const happy = connectors(s).find((c) => c.kind === 'customer' && c.ref === 'subA');
  assert.equal(momentOf(s, s.apps.success.accounts.subB), 'at_risk');
  assert.equal(momentOf(s, s.apps.success.accounts.subA), 'win');
  const r = requestIntro(s, { connectorId: risky.id, blurb: 'Would you know anyone else who might like Ledgerly? Happy to send a short note you can forward.' });
  assert.equal(r.req.status, 'backfired');
  assert.ok(s.apps.success.accounts.subB.drift < 0, 'account drift fell');
  assert.ok(ledgerOf(s, risky.id).burned, 'customer goodwill burned');
  const m = s.mistakes.find((x) => x.id === 'asked_at_risk_customer');
  assert.ok(m && m.cost.reputation > 0, 'traceable mistake with a cost');
  const ok = requestIntro(s, { connectorId: happy.id, blurb: 'Would you know anyone else who might like Ledgerly? Happy to send a short note you can forward.' });
  assert.equal(ok.req.status, 'asked');
  assert.ok(ok.req.p > 0.1);
});

test('blurb judge: forwardability beats length; stuffing and attachment walls do not pay', () => {
  const t = { name: 'Maya Chen', company: 'Northwind Goods' };
  const crisp = judgeBlurb(CRISP(t), { targetName: t.name, targetCompany: t.company });
  const long = judgeBlurb(SLOPPY, { targetName: t.name, targetCompany: t.company });
  const stuffed = judgeBlurb(`Maya at Northwind because their. No worries. No pressure. Totally fine. If not a fit, no worries. 15 min call. Cut 50% hours.`, { targetName: t.name, targetCompany: t.company });
  assert.equal(crisp.band, 'crisp');
  assert.ok(long.score < 0.5, `long product blurb ${long.score}`);
  assert.ok(stuffed.score <= 0.5, `stuffed ${stuffed.score}`);
  assert.equal(judgeBlurb('intro pls').band, 'none');
  // Without the target named, "why them" cannot score.
  assert.ok(judgeBlurb(CRISP(t)).score < crisp.score);
});

test('asks cost the documented founder hours', () => {
  assert.ok(WI.hours.ask >= 0.33 && WI.hours.ask <= 0.5, 'a 20-30 min intro request');
  const s = world(13);
  const c = connectors(s)[0];
  assert.equal(requestIntro(s, { connectorId: c.id, blurb: '' }).hours, WI.hours.vagueAsk);
});
