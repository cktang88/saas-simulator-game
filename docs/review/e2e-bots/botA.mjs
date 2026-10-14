// Bot A: builder who never sells. Website + continuous building, no launch/marketing/sales.
import * as L from './lib.mjs';
const SEEDS = +(process.argv[2] ?? 20), DAYS = +(process.argv[3] ?? 1095), MODEL = process.argv[4] ?? 'smb';
const out = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = L.makeGame({ model: MODEL, seed: seed * 7919 });
  const s = g.state;
  const t0 = Date.now();
  await L.setupWebsite(g);
  let paneled = false;
  for (let d = 0; d < DAYS && s.status === 'playing'; d++) {
    const dow = L.util.dayOfWeek(s);
    if (dow !== 0) {
      const target = s.founder.hoursPerWeek / 6;
      let used = 0, guard = 0;
      while (used < target - 0.5 && L.hoursLeft(s) > 0.5 && guard++ < 6) { const u = await L.productWork(g, target - used); if (!u) break; used += u; }
      if (!paneled && L.market.hasProduct(s)) { await L.customerPanel(g); paneled = true; }
    }
    await L.day(g);
  }
  const r = g.rec;
  out.push({ seed, ms: Date.now() - t0, firstShip: r.firstShipDay, mvp: r.mvpDay, firstPaid: r.firstPaidDay, death: r.deathDay, burnouts: r.burnouts, mrr12: r.monthly[11]?.mrr, mrr24: r.monthly[23]?.mrr, mrr36: r.monthly[35]?.mrr, cust36: r.monthly.at(-1)?.cust, shipped: L.market.shippedFeatures(s).length, energyEnd: Math.round(s.founder.energy), job: s.personal.job, personal: Math.round(s.personal.liquidSavings), cash: Math.round(L.balance(s)), size: JSON.stringify(s).length, hours: L.hoursSummary(g), monthly: r.monthly });
  process.stderr.write(`A seed ${seed} done ${Date.now() - t0}ms\n`);
}
console.log(JSON.stringify({ bot: 'A-builder', model: MODEL, errors: L.errors.slice(0, 10), runs: out }));
