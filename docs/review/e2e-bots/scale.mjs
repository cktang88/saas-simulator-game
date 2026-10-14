// Scale/perf + money reconciliation: inject N trials/day via the growth acquire() path for D days.
import * as L from './lib.mjs';
const AQ = await import((process.env.SIM_ROOT ?? '/home/user/saas-simulator-game/public') + '/apps/growth/acquire.js');
const [model = 'b2c', perDay = 30, days = 730] = process.argv.slice(2);
const g = L.makeGame({ model, seed: 4242, savings: 100000 }); const s = g.state;
await L.setupWebsite(g);
while (L.market.shippedFeatures(s).length < 3) { if (L.util.dayOfWeek(s)!==0){let k=0; while(L.hoursLeft(s)>1 && k++<5){ if(!(await L.productWork(g,8)))break;}} await L.day(g); }
let t = Date.now(); const yr = [];
for (let d = 0; d < +days && s.status === 'playing'; d++) {
  AQ.acquire(s, { source: 'organic:seo', n: L.util.poisson(s, +perDay) });
  await L.day(g);
  if ((d + 1) % 365 === 0) { yr.push(Date.now() - t); t = Date.now(); }
}
const st = s.stripe;
const arch = Object.values(st.archive);
const gross = st.charges.filter((c) => c.status !== 'failed').reduce((a, c) => a + c.amount, 0) + arch.reduce((a, x) => a + x.gross, 0);
const fees = st.charges.reduce((a, c) => a + (c.fee || 0), 0) + arch.reduce((a, x) => a + x.fees, 0);
const refunds = st.refunds.reduce((a, r) => a + r.amount, 0);
const paidOut = s.bank.txns.filter((x) => x.category === 'stripe_payout').reduce((a, x) => a + x.amount, 0);
const inTransit = st.payouts.filter((p) => p.status !== 'paid').reduce((a, p) => a + p.amount, 0);
const pend = st.pending.reduce((a, p) => a + p.amount, 0);
const disputes = st.disputes.length;
const ev = st.events.reduce((a, e) => a + e.amount, 0);
const t0 = Date.now(); const json = JSON.stringify(s); const ser = Date.now() - t0;
const t1 = Date.now(); JSON.parse(json); const par = Date.now() - t1;
console.log(JSON.stringify({ model, perDay, days, yearMs: yr, customers: st.customers.length, subs: st.subscriptions.length, active: L.stripe.activeSubs(s).length, mrr: L.stripe.mrr(s), mrrFromEvents: Math.round(ev), sizeMB: +(json.length / 1e6).toFixed(2), stringifyMs: ser, parseMs: par,
  recon: { gross: Math.round(gross), fees: Math.round(fees), refunds: Math.round(refunds), expectedNet: Math.round(gross - fees - refunds), paidOutToBank: Math.round(paidOut), inTransit: Math.round(inTransit), pending: Math.round(pend), available: Math.round(st.available), gap: Math.round(gross - fees - refunds - paidOut - inTransit - pend - st.available), disputes, bankTxns: s.bank.txns.length },
  slices: Object.entries({ ...s.apps, stripe: s.stripe, network: s.network, mail: s.mail, bank: s.bank }).map(([k, v]) => [k, Math.round(JSON.stringify(v).length / 1000)]).sort((a, b) => b[1] - a[1]).slice(0, 8), errors: [...new Set(L.errors)].slice(0, 5) }));
