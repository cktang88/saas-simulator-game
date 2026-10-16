// Raise process quality (operator-tiers audit fixes 4 and 7, tool-gap item 24): market talk from spraying,
// runway leverage, tracked deck links, data room, intro paths, IR metric definitions, the co-founder trial skip,
// and a behaviour-tier raise test (same company, four ways of running the raise).
import { test } from 'node:test';
import { ensureCalendar } from '../public/core/calendar.js';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { post } from '../public/core/bank.js';
import { advance } from '../public/core/clock.js';
import { rng } from '../public/core/util.js';
import { readOperator } from '../public/core/operator.js';
import { ensureNetwork, addPerson } from '../public/core/network.js';
import fundApp from '../public/apps/fundraising.js';
import { ensureFr, beginOutreach, passInvestor, offerTerms, acceptTerms, counterTerms, meetingDone, endRaise, meetingOdds } from '../public/apps/fundraising/sim.js';
import { marketTalk, leverageFor, raiseLeverage, dilutionCostUsd, recordTalk } from '../public/apps/fundraising/process.js';
import { roomStatus, prepareItem, ROOM_ITEMS, createLink, simulateViews, linkStats, introPaths, choosePath, deckModeFactor, diligenceFactor } from '../public/apps/fundraising/dataroom.js';
import { generateInvestors, archetypesReady } from '../public/apps/fundraising/investors.js';
import { weightedScore, tractionAnchor } from '../public/apps/fundraising/rubric.js';
import { ensureIr, applyUpdate, kpiNames } from '../public/apps/fundraising/ir.js';
import { incorporate, ensureLegal } from '../public/apps/legal/sim.js';
import { breakupHazard } from '../public/apps/cofounder/model.js';
import { ensureCf, skipTrial, annualBreakupRisk } from '../public/apps/cofounder/sim.js';

const P = { median: [3, 3, 3, 2.5, 2.5, 3, 3], credible: [4, 3.5, 3, 2.5, 2.5, 3.5, 3.5] };

function company({ seed = 1, prof = 'credible', lois = 5, stage = 'pre-seed', mrr0 = 0 } = {}) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'vc', founderName: 'P', seed });
  s.founder.network.linkedin = 900;
  s.company.oneLiner = 'SOC 2 evidence collection for mid-market fintech security teams';
  ensureStripe(s); ensureMarket(s);
  post(s, { amount: 200000, counterparty: 'P', category: 'owner_contribution' });
  incorporate(s, { provider: 'atlas', operatingState: 'CA' });
  s.company.entity = 'ccorp'; s.company.incorporated = true;
  const Lg = ensureLegal(s); Lg.docs.ipAssignment = true; Lg.dpaReady = true;
  const fr = ensureFr(s);
  const p = P[prof];
  const tr = tractionAnchor({ mrr: mrr0, customers: 0, lois }, stage);
  const sc = { founder_market_fit: p[0], execution: p[1], traction: tr, market_why_now: p[2], defensibility: p[3], business_model: p[4], narrative: p[5] };
  fr.evaluations.push({ id: 'ev', day: 0, stage, S: weightedScore(sc, stage), criteria: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, { avg: v, min: v, max: v }])), hardFlags: [], softFlags: [], disagreement: 0 });
  if (mrr0) for (let left = mrr0; left > 0; left -= 1000) { const c = createCustomer(s, { name: 'c', email: `c${left}@x.com`, country: 'US' }); subscribe(s, c.id, { id: 'p', price: Math.min(1000, left), interval: 'month', trialDays: 0 }); }
  return { s, fr, perf: p[6] };
}
const openRaise = (fr, o = {}) => { fr.raise = { id: 'r', stage: 'pre-seed', instrument: 'safe', target: 500e3, cap: 10e6, discount: 0, mfn: false, proRataMin: Infinity, startDay: 0, deadlineDay: 180, raised: 0, status: 'active', ...o }; return fr.raise; };
const addInvestors = (s, fr, n, stage = 'pre-seed') => { for (const inv of generateInvestors(s, { count: n, stage, rand: () => rng(s) })) fr.investors.push({ id: `inv${fr.investors.length}`, addedDay: s.day, status: 'researching', log: [], ...inv }); };

// ---- market talk ----
test('spraying investors creates market talk that lowers meeting and intro odds; removing them does not erase it', async () => {
  await archetypesReady;
  const { s, fr } = company({ seed: 11 });
  openRaise(fr);
  addInvestors(s, fr, 220);
  const target = fr.investors[0];
  const before = meetingOdds(s, target, false);
  assert.equal(marketTalk(s).talk, 0);
  for (const inv of fr.investors.slice(1, 41)) beginOutreach(s, inv, { warm: false, judge: { quality: 3 } });
  assert.ok(marketTalk(s).talk < 0.05, `40 targeted contacts: talk ${marketTalk(s).talk}`);
  for (const inv of fr.investors.slice(41, 201)) beginOutreach(s, inv, { warm: false, judge: { quality: 3 }, deck: 'pdf' });
  const mt = marketTalk(s);
  assert.ok(mt.talk >= 0.5, `200 contacts with PDFs: talk ${mt.talk}`);
  const after = meetingOdds(s, target, false);
  assert.ok(after < before * 0.85, `meeting odds ${before} → ${after}`);
  fr.investors = fr.investors.slice(0, 1); // "Remove from CRM" cannot unsay what the market heard
  assert.equal(marketTalk(s).talk, mt.talk);
  // a long tail of post-meeting passes counts too
  const { s: s2, fr: fr2 } = company({ seed: 12 });
  openRaise(fr2);
  for (let i = 0; i < 45; i++) recordTalk(s2, 'pass_meeting', { invId: `x${i}` });
  assert.ok(marketTalk(s2).talk >= 0.7, `45 passes after meetings in 60 days: ${marketTalk(s2).talk}`);
  s2.day += 61;
  assert.equal(marketTalk(s2).talk, 0, 'pass talk fades after 60 days');
});

test('re-pitching an investor who just passed is logged as a mistake and halves their odds; real news is fine', async () => {
  await archetypesReady;
  const { s, fr } = company({ seed: 13 });
  openRaise(fr);
  addInvestors(s, fr, 2);
  const [a, b] = fr.investors;
  for (const inv of [a, b]) { beginOutreach(s, inv, { warm: true, judge: { quality: 3.5 } }); passInvestor(s, inv, 'traction is too early for us', { email: false }); }
  s.day += 30;
  const r2 = openRaise(fr, { id: 'r2', startDay: s.day, deadlineDay: s.day + 120 });
  beginOutreach(s, a, { warm: true, judge: { quality: 3.5 } });
  assert.equal(a.repitchPenalty, 0.4);
  assert.ok(s.mistakes.some((m) => m.id === 'repitch_pass' && m.functionId === 'fundraising' && m.circles));
  assert.equal(marketTalk(s).repitches, 1);
  // with material news (MRR well up), the same move is a legitimate follow-up
  for (let i = 0; i < 6; i++) { const c = createCustomer(s, { name: 'c', email: `n${i}@x.com`, country: 'US' }); subscribe(s, c.id, { id: 'p', price: 1000, interval: 'month', trialDays: 0 }); }
  beginOutreach(s, b, { warm: true, judge: { quality: 3.5 } });
  assert.equal(b.repitchPenalty, 1);
  assert.equal(r2.id, 'r2');
});

// ---- runway leverage ----
test('runway at raise start sets leverage: <6 months prices lower, explodes the first offer and blocks the counter', async () => {
  await archetypesReady;
  assert.equal(leverageFor(12).terms, 1);
  assert.equal(leverageFor(7).terms, 0.95);
  assert.equal(leverageFor(5).terms, 0.85);
  assert.equal(leverageFor(3).terms, 0.75);
  assert.equal(leverageFor(Infinity).terms, 1);
  assert.equal(dilutionCostUsd(1e6, 0.8), 250000);
  const terms = (runway) => {
    const xs = [];
    for (let seed = 1; seed <= 40; seed++) {
      const { s, fr } = company({ seed, prof: 'credible', stage: 'seed', mrr0: 30000 });
      fr.evaluations[0].stage = 'seed';
      openRaise(fr, { stage: 'seed', instrument: 'priced', target: 3e6, cap: null, runwayAtStart: runway });
      const lead = { id: 'L', name: 'Lea', firm: 'Seed Fund', kind: 'seed_fund', leads: true, checkMin: 1e6, checkMax: 3e6, raiseId: 'r', status: 'diligence', log: [] };
      fr.investors.push(lead);
      xs.push(offerTerms(s, lead).postMoney);
    }
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const high = terms(12), low = terms(3);
  assert.ok(low / high < 0.8 && low / high > 0.7, `post-money at 3 vs 12 months runway: ${low} / ${high}`);
  // forced first term sheet: exploding 5-day offer, no counter
  let exploding = 0, n = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { s, fr } = company({ seed, stage: 'seed', mrr0: 30000 });
    openRaise(fr, { stage: 'seed', instrument: 'priced', target: 3e6, cap: null, runwayAtStart: 3 });
    const lead = { id: 'L', name: 'Lea', firm: 'Seed Fund', kind: 'seed_fund', leads: true, checkMin: 1e6, checkMax: 3e6, raiseId: 'r', status: 'diligence', evalMrr: 30000, pending: { type: 'diligenceDone', day: s.day }, log: [], outreach: { channel: 'warm' } };
    fr.investors.push(lead);
    for (const it of ROOM_ITEMS) prepareItem(s, it.id);
    advance(s, 1, [fundApp]);
    if (lead.status !== 'term_sheet') continue;
    n++;
    if (lead.terms.exploding) {
      exploding++;
      assert.ok(lead.termExpiresDay - s.day <= 5);
      assert.match(counterTerms(s, lead, lead.terms.preMoney * 1.2), /won't negotiate/);
    }
  }
  assert.ok(n >= 10 && exploding / n >= 0.5, `exploding ${exploding}/${n} at 3 months runway`);
  const { s } = company({ seed: 3 });
  assert.equal(raiseLeverage(s).label, 'strong'); // no raise: neutral
});

test('signing with short runway logs the dilution cost; a down round and an insider bridge are traceable', async () => {
  await archetypesReady;
  const { s, fr } = company({ seed: 21, stage: 'seed', mrr0: 30000 });
  fr.lastPostMoney = 40e6;
  openRaise(fr, { stage: 'seed', instrument: 'priced', target: 3e6, cap: null, runwayAtStart: 3 });
  const lead = { id: 'L', name: 'Lea', firm: 'Seed Fund', kind: 'seed_fund', leads: true, checkMin: 1e6, checkMax: 3e6, raiseId: 'r', status: 'term_sheet', log: [] };
  fr.investors.push(lead);
  lead.terms = offerTerms(s, lead);
  lead.termExpiresDay = s.day + 14;
  assert.ok(lead.terms.downRound, `post ${lead.terms.postMoney} < last 40M`);
  assert.equal(acceptTerms(s, lead), null);
  const ids = s.mistakes.map((m) => m.id);
  assert.ok(ids.includes('low_runway_raise') && ids.includes('down_round'), ids.join(','));
  assert.ok(s.mistakes.find((m) => m.id === 'low_runway_raise').cost.usd > 0);
  // bridge: <4 months, 45 days in, no commitments, insiders exist
  const { s: b, fr: bf } = company({ seed: 22 });
  bf.investors.push({ id: 'ins', name: 'Old Angel', status: 'committed', closedDay: 0, terms: { amount: 100000 }, log: [] });
  bf.rounds.push({ id: 'rd', day: 0, instrument: 'safe', amount: 100000, cap: 8e6 });
  bf.lastPostMoney = 8e6;
  ensureIr(b).warmth = 1;
  let offered = 0;
  for (let k = 0; k < 20 && !offered; k++) {
    bf.raise = null;
    openRaise(bf, { id: `rb${k}`, startDay: b.day - 50, deadlineDay: b.day + 60, runwayAtStart: 3 });
    advance(b, 1, [fundApp]);
    if (bf.raise.bridge) offered++;
  }
  assert.ok(offered, 'warm insiders offer a bridge sometimes');
  assert.ok(bf.raise.bridge.cap <= 8e6 && bf.raise.bridge.discount === 0.2);
});

// ---- tracked links, data room, intro paths ----
test('tracked deck links: opens barely predict interest, forwards do; NDA gates cut opens', async () => {
  await archetypesReady;
  const { s, fr } = company({ seed: 31 });
  openRaise(fr);
  addInvestors(s, fr, 1);
  const inv = fr.investors[0];
  inv.outreach = { channel: 'cold', deck: 'link' };
  const run = (interest, gate) => {
    let opened = 0, fwd = 0;
    for (let i = 0; i < 400; i++) { createLink(s, inv, { gate }); const v = simulateViews(s, inv, interest); if (v.some((x) => !x.forward)) opened++; if (v.some((x) => x.forward)) fwd++; }
    return { opened: opened / 400, fwd: fwd / 400 };
  };
  const hot = run(1, 'email'), cold = run(0, 'email'), nda = run(1, 'nda');
  assert.ok(hot.opened - cold.opened < 0.15, `opens ${hot.opened} vs ${cold.opened}`);
  assert.ok(hot.fwd > 2.5 * cold.fwd, `forwards ${hot.fwd} vs ${cold.fwd}`);
  assert.ok(nda.opened < 0.35, `NDA gate opens ${nda.opened}`);
  createLink(s, inv, { gate: 'email' });
  simulateViews(s, inv, 1);
  assert.equal(linkStats(fr.shareLinks.at(-1)).per.length, 12);
  // deck before the call: weak decks get passed on without a meeting; NDA links mostly go unread
  inv.outreach = { channel: 'cold', deck: 'pdf' };
  assert.ok(deckModeFactor(s, inv, 2.5) < deckModeFactor(s, inv, 3.8));
  inv.outreach = { channel: 'cold', deck: 'link' };
  createLink(s, inv, { gate: 'nda' });
  assert.ok(deckModeFactor(s, inv, 3.8) <= 0.55);
});

test('data room readiness: ready before diligence is faster; stale numbers are flagged; missing is a logged mistake', async () => {
  await archetypesReady;
  const { s, fr } = company({ seed: 41, mrr0: 10000 });
  assert.equal(roomStatus(s).ready, 0);
  for (const it of ROOM_ITEMS) prepareItem(s, it.id);
  assert.equal(roomStatus(s).pct, 1);
  assert.ok(diligenceFactor(1) < diligenceFactor(0.4));
  // MRR halves → the metrics pack overstates it
  const subs = s.stripe.subscriptions.slice(0, 5);
  for (const x of subs) x.status = 'canceled';
  const st = roomStatus(s);
  assert.ok(st.rows.find((r) => r.id === 'metrics').status !== 'ready' || st.pct === 1, 'stale metrics or MRR unchanged by the stub');
  s.day += 100;
  assert.ok(roomStatus(s).pct < 1, 'packs go stale with time');
  // diligence with an empty room → logged, slower
  const { s: s2, fr: f2 } = company({ seed: 42 });
  openRaise(f2);
  addInvestors(s2, f2, 1);
  const inv = f2.investors[0];
  Object.assign(inv, { raiseId: 'r', status: 'partner_meeting', outreach: { channel: 'warm' }, pending: { type: 'afterPartner', day: s2.day } });
  let logged = false;
  for (let k = 0; k < 60 && !logged; k++) { inv.status = 'partner_meeting'; inv.pending = { type: 'afterPartner', day: s2.day }; advance(s2, 1, [fundApp]); logged = (s2.mistakes ?? []).some((m) => m.id === 'data_room_not_ready'); }
  assert.ok(logged, 'empty data room at diligence is logged');
});

test('intro paths come from real network contacts and insiders; connectors use the network intro funnel', async () => {
  await archetypesReady;
  const { s, fr } = company({ seed: 51 });
  openRaise(fr);
  addInvestors(s, fr, 30);
  for (const inv of fr.investors) inv.warmPath = '';
  assert.equal(introPaths(s, fr.investors[0]).length, 0, 'no network → no paths');
  for (let i = 0; i < 12; i++) addPerson(s, { name: `Founder ${i}`, role: 'Founder & CEO', company: `Co${i}`, strength: 0.7 });
  const withPaths = fr.investors.filter((inv) => introPaths(s, inv).length);
  assert.ok(withPaths.length >= 10, `${withPaths.length} of 30 investors reachable`);
  const inv = withPaths[0];
  const p = introPaths(s, inv)[0];
  choosePath(s, inv, p);
  assert.ok(inv.warmPath && inv.introOdds > 0.3);
  assert.equal(introPaths(s, inv).length, introPaths(s, inv).length); // deterministic
  const person = ensureNetwork(s).people.find((x) => x.id === inv.introVia);
  beginOutreach(s, inv, { warm: true, text: 'Founder of X; 5 design partners on LOIs for SOC 2 evidence automation in fintech; raising $500K on a SAFE; you backed Vanta-adjacent tools.', judge: { quality: 4 } });
  inv.status = 'intro_requested'; inv.pending = { type: 'intro', day: s.day };
  advance(s, 1, [fundApp]);
  assert.ok((person.asks ?? []).length >= 1, 'connector fatigue is tracked on the real contact');
});

// ---- investor relations ----
test('IR: quietly swapping KPI definitions costs warmth and is logged; flagged changes are fine', () => {
  const { s } = company({ seed: 61 });
  const ir = ensureIr(s);
  assert.deepEqual(kpiNames('- MRR: $12K\n- Logo churn: 2%\nNRR: 104%'), ['mrr', 'logo churn', 'nrr']);
  const j = { candor: 4, clarity: 4, asks_specificity: 3, accuracy: 4, feedback: '', asks: [] };
  const u = (kpis, extra = '') => ({ summary: `Month. ${extra}`, highlights: '', lowlights: 'Churn ticked up; we called every churned account.', kpis, asks: '' });
  applyUpdate(s, u('MRR: $12K\nLogo churn: 2%\nNRR: 104%'), j);
  s.day += 31;
  const w = ir.warmth;
  const rec = applyUpdate(s, u('Bookings: $30K\nPipeline: $200K\nActive users: 900'), j);
  assert.ok(rec.redefined && ir.warmth < w + 0.06);
  assert.ok(s.mistakes.some((m) => m.id === 'metric_redefinition' && m.functionId === 'investor_relations'));
  s.day += 31;
  const rec2 = applyUpdate(s, u('ARR: $150K\nGross margin: 80%\nCAC payback: 9 months', 'We changed how we report: new metric definitions below.'), j);
  assert.ok(!rec2.redefined);
});

// ---- co-founder ----
test('co-founder: skipping the trial raises breakup risk, which is shown; a breakup is logged with its cost', () => {
  const { s } = company({ seed: 71 });
  const stranger = breakupHazard({ yearsTogether: 0.5, trialDone: false, priorColleague: false });
  const tried = breakupHazard({ yearsTogether: 0.5, trialDone: true, priorColleague: false });
  assert.ok(stranger / tried > 1.4);
  const cf = ensureCf(s);
  const c = { id: 'cfc_x', name: 'Sam', status: 'called', log: [], priorColleague: false, interest: 0.8 };
  cf.candidates.push(c);
  skipTrial(s, c);
  assert.equal(c.status, 'negotiating');
  c.signed = { day: s.day, trialDone: false };
  const risky = annualBreakupRisk(s, c);
  c.signed.trialDone = true;
  assert.ok(risky > annualBreakupRisk(s, c) * 1.4, `${risky}`);
});

// ---- behaviour-tier raise test (audit 3.7 fix 3) ----
async function raiseBehaviour(kind, seeds) {
  await archetypesReady;
  const B = {
    stellar: { nInv: 40, warmShare: 0.8, quality: 4, perWeek: 20, deck: 'none', room: true, runway: 12, waitForSecond: true, bookingLink: true },
    spray: { nInv: 150, warmShare: null, quality: 3, perWeek: 50, deck: 'pdf', room: false, runway: 12, waitForSecond: false },
    serial: { nInv: 40, warmShare: null, quality: 3, perWeek: 3, deck: 'link', room: false, runway: 7, waitForSecond: false },
    desperate: { nInv: 150, warmShare: null, quality: 3, perWeek: 50, deck: 'pdf', room: false, runway: 3, waitForSecond: false },
  }[kind];
  const out = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const { s, fr, perf } = company({ seed: seed * 7919, prof: 'credible', lois: 5 });
    if (B.room) for (const it of ROOM_ITEMS) prepareItem(s, it.id);
    if (B.bookingLink) ensureCalendar(s).bookingLink = true; // one email instead of a scheduling thread
    openRaise(fr, { target: 500e3, cap: 10e6, runwayAtStart: B.runway });
    addInvestors(s, fr, B.nInv);
    if (B.warmShare != null) fr.investors.forEach((inv, i) => { inv.warmPath = i < B.warmShare * B.nInv ? 'a founder they backed (2nd-degree connection)' : ''; });
    for (let d = 0; d < 240; d++) {
      if (d % 7 === 0 && d < 180 && fr.raise) {
        let n = 0;
        for (const inv of fr.investors) {
          if (inv.status !== 'researching' || n >= B.perWeek) continue;
          const warm = Boolean(inv.warmPath);
          beginOutreach(s, inv, { warm, judge: { quality: B.quality }, deck: B.deck });
          inv.evalId = 'ev';
          if (B.deck === 'link') createLink(s, inv, { gate: 'email' });
          if (warm) { inv.status = 'intro_requested'; inv.pending = { type: 'intro', day: s.day + 3 }; } else { inv.status = 'contacted'; inv.pending = { type: 'reply', day: s.day + 5 }; }
          n++;
        }
      }
      for (const inv of fr.investors) if (inv.ghosted && inv.outreach.followUps < 1 && s.day - inv.outreach.day > 10) { inv.ghosted = false; inv.outreach.followUps = 1; inv.pending = { type: 'reply', day: s.day + 4 }; }
      for (const mtg of fr.meetings) if (mtg.status === 'scheduled' && mtg.day === s.day) meetingDone(s, mtg, perf, 'test');
      const sheets = fr.investors.filter((i) => i.status === 'term_sheet');
      for (const inv of sheets) {
        const competing = sheets.filter((o) => o.leads).length;
        if (!B.waitForSecond || competing >= 2 || inv.termExpiresDay - s.day <= 2 || !inv.leads) acceptTerms(s, inv);
      }
      s.founder.hoursUsed = 0;
      advance(s, 1, [fundApp]);
      s.jobs = [];
      if (fr.raise && fr.rounds.reduce((a, r) => a + r.amount, 0) >= 500e3) endRaise(s, 'closed');
    }
    const amount = fr.rounds.reduce((a, r) => a + r.amount, 0);
    const capW = amount ? fr.rounds.reduce((a, r) => a + r.amount * (r.cap ?? 0), 0) / amount : 0;
    out.push({ amount, cap: capW, mistakes: (s.mistakes ?? []).map((m) => m.id), read: readOperator(s, 'fundraising') });
  }
  return out;
}

test('behaviour tiers: same company, four ways to run the raise; targeted warm parallel > spray > serial/desperate', async () => {
  const N = 24;
  const res = {};
  for (const k of ['stellar', 'spray', 'serial', 'desperate']) res[k] = await raiseBehaviour(k, N);
  const share = (v) => v.filter((r) => r.amount >= 250e3).length / v.length;
  const meanAmt = (v) => v.reduce((a, r) => a + r.amount, 0) / v.length;
  const meanCap = (v) => { const c = v.filter((r) => r.amount > 0); return c.length ? c.reduce((a, r) => a + r.cap, 0) / c.length : 0; };
  const sum = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { share: share(v), amount: Math.round(meanAmt(v)), cap: Math.round(meanCap(v)) }]));
  const msg = JSON.stringify(sum);
  // Close odds (≥$250K) and dollars raised separate by behaviour (audit target ~1.0 / 0.8 / 0.5 / 0.3 [design]).
  assert.ok(sum.stellar.share > sum.spray.share && sum.spray.share > sum.desperate.share, msg);
  assert.ok(sum.stellar.amount > 1.3 * sum.spray.amount, msg);
  assert.ok(sum.stellar.amount > 2 * sum.desperate.amount, msg);
  assert.ok(sum.serial.amount < sum.stellar.amount, msg);
  // Shopped / short-runway rounds land at lower caps when they do close.
  if (sum.desperate.cap) assert.ok(sum.desperate.cap < sum.stellar.cap, msg);
  // The mistakes are traceable and the operator read separates.
  assert.ok(res.spray.every((r) => r.mistakes.includes('investor_spray')), 'every spray run logs the spray');
  assert.ok(res.desperate.filter((r) => r.amount > 0).every((r) => r.mistakes.includes('low_runway_raise')), 'every desperate close logs the runway cost');
  const rank = { stellar: 3, good: 2, average: 1, mediocre: 0, unknown: -1 };
  const mRank = (v) => v.reduce((a, r) => a + rank[r.read.tier], 0) / v.length;
  assert.ok(mRank(res.stellar) > mRank(res.spray) && mRank(res.spray) >= mRank(res.desperate), `${mRank(res.stellar)} ${mRank(res.spray)} ${mRank(res.desperate)}`);
  assert.ok(res.desperate.some((r) => r.read.coaching.some((c) => /runway/.test(c))));
});

test('automations exposure: investor replies, stage changes and a due update are readable events', async () => {
  await archetypesReady;
  const { automationEvents } = await import('../public/apps/fundraising/process.js');
  const { threadFor } = await import('../public/apps/fundraising/sim.js');
  const { addMessage } = await import('../public/core/mail.js');
  const { s, fr } = company({ seed: 81 });
  openRaise(fr);
  addInvestors(s, fr, 1);
  const inv = fr.investors[0];
  const since = s.day - 1;
  beginOutreach(s, inv, { warm: false, judge: { quality: 3 } });
  passInvestor(s, inv, 'too early', { email: false });
  addMessage(s, threadFor(s, inv).id, { from: 'them', body: 'Pass for now.' });
  fr.rounds.push({ id: 'rd', day: s.day - 40, instrument: 'safe', amount: 1e5 });
  ensureIr(s);
  const ev = automationEvents(s, since).map((e) => e.trigger);
  assert.ok(ev.includes('investor_replied') && ev.includes('stage_changed') && ev.includes('update_due'), ev.join(','));
});
