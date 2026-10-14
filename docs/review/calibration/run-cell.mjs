// One calibration cell: node run-cell.mjs <path indie|vc> <model b2c|smb|ent> <policy average|elite|mistakes> <seedFrom> <seedTo> [days=1095]
// Prints JSON { cell, runs: [...] } to stdout. Seeds are seed*7919 like the e2e bots.
import * as L from './lib.mjs';
import * as S from './sales.mjs';

const [path = 'indie', model = 'smb', policy = 'average', from = 1, to = 10, DAYS = 1095] = process.argv.slice(2);
const { MODELS } = await import((process.env.SIM_ROOT ?? '/home/user/saas-simulator-game/public') + '/core/state.js');
const { util, market, stripe } = L;
const dow = (s) => util.dayOfWeek(s);
const weekNo = (s) => Math.floor(s.day / 7);

// ---- price per policy (median = the game's default list price for the model) ----
const PRICE = {
  average: { b2c: MODELS.b2c.defaultPrice, smb: MODELS.smb.defaultPrice, ent: MODELS.ent.defaultPrice },
  elite: { b2c: 12.99, smb: 79, ent: 18000 },
  mistakes: { b2c: 2.99, smb: 15, ent: 4000 },
}[policy];
const ICPS = { average: L.ICP_BROAD, elite: L.ICP, mistakes: L.ICP_EVERYONE }[policy];

// Founder pay (same rule for every policy): indie pays itself half of MRR up to living costs once MRR > $1k;
// VC pays a salary once ≥$150k is raised (elite keeps it frugal).
function founderPay(g) {
  const s = g.state;
  if (s.day % 30 !== 1) return;
  const m = stripe.mrr(s);
  const living = s.personal.monthlyLivingCosts + (s.personal.monthlyDebtPayments ?? 0);
  let pay = m > 1000 ? Math.min(living, m * 0.5) : 0;
  if (path === 'vc' && (g.raised ?? 0) >= 150000) pay = Math.max(pay, policy === 'elite' ? 4500 : policy === 'mistakes' ? 9000 : 6000);
  s.founder.salary = Math.round(pay / 100) * 100;
}

async function init(g) {
  const s = g.state;
  s.plans[0].price = PRICE[model];
  s.company.icp = ICPS[model];
  if (policy === 'mistakes') L.setOnboarding(g, 'self', false);
  if (policy === 'elite') { L.setOnboarding(g, model === 'b2c' ? 'call' : 'concierge', true); if (model !== 'ent') s.plans[0].trialDays = 7; }
  // Every 2026 founder codes with an AI agent seat (People → AI agents, 0.25h setup); elite pays for the top tier.
  const seat = policy === 'elite' ? 'code_max' : 'code_pro';
  if (L.tryHours(g, L.PCAT.AI_AGENTS[seat].setupHours ?? 0.25, 'People: AI coding seat')) L.PE.hireAgent(s, seat);
  await L.setupWebsite(g);
  if (path === 'vc') await L.incorporate(g);
}

async function obligations(g) {
  const s = g.state;
  L.holdOnboarding(g);
  await L.logInterviews(g);
  if (s.apps.outreach?.sequencer && dow(s) !== 6) { S.runCalls(g, policy === 'elite' ? 'good' : policy === 'mistakes' ? 'bad' : 'mixed'); S.workInbox(g); S.proposals(g); }
  L.workRaise(g);
  L.workHiring(g);
  if (path === 'vc') L.legalFollowUp(g);
  founderPay(g);
}

// ------------------------------- policies -------------------------------
async function average(g) {
  const s = g.state, d = dow(s);
  const shipped = market.shippedFeatures(s).length;
  // 1–2 customer conversations a week.
  if (d === 1 || (d === 4 && weekNo(s) % 2 === 0)) L.bookInterview(g, 'warm');
  if (shipped >= 3 && !g.paneled) g.paneled = await L.customerPanel(g);
  if (g.paneled) {
    await L.networkLaunch(g); // the one launch
    if (model === 'b2c' && !g.adset) L.startAds(g, path === 'vc' && (g.raised ?? 0) >= 250000 ? 60 : 30, { pool: [0, 1, 2] });
    if ((model === 'smb' || model === 'ent') && !s.apps.outreach?.sequencer) S.setupOutbound(g, { inboxes: 2 });
    if (s.apps.outreach?.sequencer && d !== 6 && d !== 0) { const add = []; for (let i = 0; i < 3; i++) { const c = S.addProspect(g, { icpRate: 0.5 }); if (c) add.push(c); } S.enroll(g, add); }
  }
  L.runAds(g, { minCash: 5000, resumeCash: 15000 });
  if (d === 3 && weekNo(s) % 2 === 1 && weekNo(s) > 1) await L.bipPost(g, 'linkedin'); // posts rarely
  if (path === 'vc') {
    if (shipped >= 3 && !g.raiseTries) await L.startRaise(g);
    else if (g.raiseTries === 1 && !(g.raised > 0) && s.apps.fundraising?.raise?.status !== 'active' && s.day - g.raiseStart > 180) await L.startRaise(g);
    if ((g.raised ?? 0) >= 250000 && !g.jobs) L.openContractorJob(g, 'engineer', 'latam');
  }
  await L.fillProduct(g, s.founder.hoursPerWeek / 6 - (g.dayStart - L.hoursLeft(s)), { newSpecOk: g.lastSpecDay == null || s.day - g.lastSpecDay >= 30 });
}

async function elite(g) {
  const s = g.state, d = dow(s);
  const shipped = market.shippedFeatures(s).length;
  const m = stripe.mrr(s);
  // Customer conversations: ≥5/week pre-$5k MRR (interviews + sales calls), ≥3 after.
  const salesCalls = (s.apps.calls?.meetings ?? []).filter((x) => x.status === 'held' && x.day > s.day - 7).length;
  const ivPerWeek = Math.max(model === 'b2c' ? 3 : 2, (m >= 5000 ? 3 : 6) - salesCalls);
  if (d >= 1 && d <= 6 && d <= ivPerWeek) L.bookInterview(g, 'warm');
  // Ship weekly with evidence-backed specs (spec loop runs in fillProduct).
  if (shipped >= 1) {
    if (!g.paneled || s.day - g.paneledDay >= 90) { if (await L.customerPanel(g)) { g.paneled = true; g.paneledDay = s.day; } }
    await L.networkLaunch(g); // launch at first ship, charge from day one
    if (!s.apps.organic?.ph && s.day - (g.launchDay ?? s.day) >= 45 && d === 2) await L.productHunt(g);
    if (d === 4) await L.communityPost(g);
    if (d === 2 && weekNo(s) % 2 === 0) await L.seoArticle(g);
    if ((model === 'smb' || model === 'ent') && !s.apps.outreach?.sequencer) S.setupOutbound(g, { inboxes: 2 });
    if (s.apps.outreach?.sequencer && d !== 6) { const add = []; for (let i = 0; i < 3; i++) { const c = S.addProspect(g, { icpRate: 0.85 }); if (c) add.push(c); } S.enroll(g, add); }
    // Concierge for the first customers, then a lighter touch once volume would eat the week.
    const held = (s.apps.customers?.onboarding ?? []).filter((r) => r.status === 'held').length;
    const trialsWk = s.stripe.subscriptions.filter((x) => x.startDay > s.day - 7).length;
    if (held >= 20 || trialsWk > 8) L.setOnboarding(g, trialsWk > 8 || model === 'b2c' ? 'self' : 'call');
    // Retention before scale: B2C paid only after 60 days live, small budget, scaled only while CAC pays back.
    if (model === 'b2c' && !g.adset && s.day - (g.launchDay ?? 1e9) >= 60 && L.balance(s) > 12000) L.startAds(g, 20, { pool: [3, 4, 5] });
    if (g.adset && s.day % 30 === 0) {
      const spend = (s.bank.txns ?? []).filter((t) => t.category === 'advertising' && t.day > s.day - 60).reduce((a, t) => a - t.amount, 0);
      const paid = s.stripe.subscriptions.filter((x) => String(x.source).startsWith('ads:') && x.startDay > s.day - 60 && (x.paidMonths ?? 0) >= 2).length;
      const cac = paid ? spend / paid : Infinity;
      const ok = cac < market.monthlyPrice(market.mainPlan(s)) * 4;
      L.AE.editBudget(s, g.adset.id, Math.max(10, Math.min(path === 'vc' ? 150 : 80, g.adset.budget * (ok ? 1.4 : 0.7))));
    }
  }
  L.runAds(g, { minCash: 8000, resumeCash: 15000 }); // default alive
  if ([1, 3, 5].includes(d)) await L.bipPost(g, d === 3 ? 'linkedin' : 'x'); // 3 posts a week from week 1
  if (path === 'vc') {
    if (!g.raiseTries && (m >= 1000 || (s.day >= 180 && shipped >= 3))) await L.startRaise(g, { target: 500000, cap: 8000000 });
    else if (g.raiseTries === 1 && !(g.raised > 0) && s.apps.fundraising?.raise?.status !== 'active' && s.day - g.raiseStart > 150) await L.startRaise(g);
    if ((g.raised ?? 0) > 0 && m >= 5000 && !g.jobs) L.openContractorJob(g, 'engineer', 'latam');
  }
  await L.fillProduct(g, s.founder.hoursPerWeek / 6 - (g.dayStart - L.hoursLeft(s)), { newSpecOk: true, evidence: true });
}

async function mistakes(g) {
  const s = g.state, d = dow(s);
  const stealth = s.day < 182;
  if (!stealth) {
    if (d === 2 && weekNo(s) % 2 === 0) L.bookInterview(g, 'warm');
    await L.networkLaunch(g);
    if (!g.adset && market.hasProduct(s)) L.startAds(g, path === 'vc' && (g.raised ?? 0) > 0 ? 150 : 100, { pool: [0, 1, 2] }); // scale before retention
    if (!g.jobs) { L.openContractorJob(g, 'engineer', 'latam'); L.openContractorJob(g, 'marketer', 'latam'); } // hires ahead of revenue
    if (path === 'vc' && !g.raiseTries) await L.startRaise(g, { target: 750000, cap: 10000000 });
    else if (path === 'vc' && g.raiseTries === 1 && !(g.raised > 0) && s.apps.fundraising?.raise?.status !== 'active' && s.day - g.raiseStart > 150) await L.startRaise(g, { target: 750000, cap: 10000000 });
    if (g.adset && path === 'vc' && (g.raised ?? 0) > 0 && g.adset.budget < 150) L.AE.editBudget(s, g.adset.id, 150);
  }
  L.runAds(g, { minCash: 1000, resumeCash: 3000 });
  await L.fillProduct(g, s.founder.hoursPerWeek / 6 - (g.dayStart - L.hoursLeft(s)), { newSpecOk: true });
}

const POLICY = { average, elite, mistakes }[policy];
const out = [];
for (let seed = +from; seed <= +to; seed++) {
  const g = L.makeGame({ model, path, seed: seed * 7919 });
  const s = g.state;
  const t0 = Date.now();
  await init(g);
  for (let d = 0; d < +DAYS && s.status === 'playing'; d++) {
    if (dow(s) !== 0 && !g.quit) {
      g.dayStart = L.hoursLeft(s);
      await obligations(g);
      await POLICY(g);
    }
    await L.day(g);
  }
  const r = g.rec;
  const mon = (k) => r.monthly[k - 1]?.mrr ?? (r.deathDay != null ? 0 : null);
  const subs = s.stripe.subscriptions;
  out.push({
    seed, ms: Date.now() - t0, days: s.day, firstShip: r.firstShipDay, mvp: r.mvpDay, firstPaid: r.firstPaidDay, d1k: r.d1k, d10k: r.d10k, d100k: r.d100k,
    death: r.deathDay, quit: r.quitDay, burnouts: r.burnouts, mrr6: mon(6), mrr12: mon(12), mrr18: mon(18), mrr24: mon(24), mrr30: mon(30), mrr36: mon(36),
    job: s.personal.job, personal: Math.round(s.personal.liquidSavings), cash: Math.round(L.balance(s)), raised: g.raised ?? 0, raisedDay: g.raisedDay ?? null, pitches: g.pitches ?? 0,
    interviews: g.interviewsDone ?? 0, specsRejected: g.rejected ?? 0, shipped: market.shippedFeatures(s).length, luck: g.luck, habits: g.habits,
    hires: (s.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent').length, hireErr: g.hireErr ?? null, raiseErr: g.raiseErr ?? null,
    adSpend: Math.round((s.bank.txns ?? []).filter((t) => t.category === 'advertising').reduce((a, t) => a - t.amount, 0)),
    sourceMix: Object.entries(subs.reduce((a, x) => { a[x.source] = (a[x.source] ?? 0) + 1; return a; }, {})),
    hours: Object.fromEntries(Object.entries(g.hoursByLabel).map(([k, v]) => [k, Math.round(v)])), monthly: r.monthly.map((x) => [x.m, x.mrr, x.cust, x.cash, x.job]),
  });
  process.stderr.write(`${path}-${model}-${policy} seed ${seed}: ${Date.now() - t0}ms mrr12=${mon(12)} mrr24=${mon(24)} mrr36=${mon(36)} death=${r.deathDay} quit=${r.quitDay}\n`);
}
console.log(JSON.stringify({ cell: { path, model, policy, days: +DAYS }, errors: [...new Set(L.errors)].slice(0, 15), runs: out }));
