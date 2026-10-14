// Bot B: founder-led outbound B2B SMB with good personalization and good discovery calls.
import * as L from './lib.mjs';
import * as S from './sales.mjs';
import { run } from './runner.mjs';
const [seeds = 20, days = 1095, perDay = 6, callSkill = 'good', icpRate = 0.6] = process.argv.slice(2);
const res = await run({
  name: `B-outbound-${callSkill}`, seeds: +seeds, days: +days, game: { model: 'smb' },
  init: async (g) => { if (process.env.PRICE) g.state.plans[0].price = +process.env.PRICE; await L.setupWebsite(g); S.setupOutbound(g); },
  policy: async (g, dow) => {
    const s = g.state;
    if (dow === 0) return;
    if (L.market.hasProduct(s) && !g.paneled) { await L.customerPanel(g); g.paneled = true; }
    const target = s.founder.hoursPerWeek / 6;
    const start = L.hoursLeft(s);
    if (dow !== 6) {
      S.runCalls(g, callSkill);
      S.workInbox(g);
      S.proposals(g);
      const added = [];
      for (let i = 0; i < +perDay; i++) { const c = S.addProspect(g, { icpRate: +icpRate }); if (c) added.push(c); }
      S.enroll(g, added);
    }
    let guard = 0;
    while (start - L.hoursLeft(s) < target - 0.5 && L.hoursLeft(s) > 0.5 && guard++ < 6) { if (!(await L.productWork(g, target - (start - L.hoursLeft(s))))) break; }
  },
  extra: (g) => ({ funnel: S.funnel(g), callsHeld: g.callsHeld }),
});
console.log(JSON.stringify(res));
