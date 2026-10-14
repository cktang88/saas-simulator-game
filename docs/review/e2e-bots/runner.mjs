import * as L from './lib.mjs';
// Generic runner: policy(g, dow) is called before each day's tick.
export async function run({ name, seeds = 20, days = 1095, game = {}, init = async () => {}, policy, extra = () => ({}) }) {
  const out = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const g = L.makeGame({ ...game, seed: seed * 7919 });
    const s = g.state;
    const t0 = Date.now();
    await init(g);
    const yearMs = [];
    let ty = Date.now();
    for (let d = 0; d < days && s.status === 'playing'; d++) {
      await policy(g, L.util.dayOfWeek(s));
      await L.day(g);
      if (s.day % 365 === 0) { yearMs.push(Date.now() - ty); ty = Date.now(); }
    }
    const r = g.rec;
    const res = { seed, ms: Date.now() - t0, yearMs, firstShip: r.firstShipDay, mvp: r.mvpDay, firstPaid: r.firstPaidDay, d1k: r.d1k, d10k: r.d10k, death: r.deathDay, burnouts: r.burnouts,
      mrr6: r.monthly[5]?.mrr, mrr12: r.monthly[11]?.mrr, mrr24: r.monthly[23]?.mrr, mrr36: r.monthly[35]?.mrr, custEnd: r.monthly.at(-1)?.cust,
      energyEnd: Math.round(s.founder.energy), job: s.personal.job, jobDay: g.jobDay, personal: Math.round(s.personal.liquidSavings), fico: s.personal.fico, cash: Math.round(L.balance(s)), size: JSON.stringify(s).length,
      hours: Object.fromEntries(Object.entries(g.hoursByLabel).map(([k,v])=>[k,Math.round(v)])), lostLog: L.hoursSummary(g), ...extra(g), monthly: r.monthly };
    // MRR drift check: sum of MRR movement events vs live MRR.
    const evSum = (s.stripe.events ?? []).reduce((a, e) => a + e.amount, 0);
    res.mrrDrift = Math.round((evSum - L.stripe.mrr(s)) * 100) / 100;
    out.push(res);
    process.stderr.write(`${name} seed ${seed}: ${res.ms}ms mrr12=${res.mrr12} mrr24=${res.mrr24} mrr36=${res.mrr36} death=${res.death} drift=${res.mrrDrift}\n`);
  }
  return { bot: name, game, errors: [...new Set(L.errors)].slice(0, 15), runs: out };
}
