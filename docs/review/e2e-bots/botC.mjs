// Bot C: B2C subscription app, Meta ads with average creatives at a fixed daily budget.
import * as L from './lib.mjs';
import { run } from './runner.mjs';
const AE = await import((process.env.SIM_ROOT ?? '/home/user/saas-simulator-game/public') + '/apps/growth/adsEngine.js');
const [seeds = 20, days = 1095, budget = 50, quality = 'avg'] = process.argv.slice(2);
const COPY = {
  avg: [['Struggling to find time to work out? Try our app', 'A 20-minute daily workout plan for busy parents. Start your free trial today.', 'Get fit in 20 minutes'],
        ['Busy parent? Workouts that fit your day', 'Short home workouts with a coach that adapts to your schedule. Free 14-day trial.', 'Home workouts for parents'],
        ['Your new favorite workout app', 'Simple workouts, a habit tracker and reminders. Join thousands of happy users.', 'Try it free']],
  good: [['Kids asleep at 8:40. You have 20 minutes.', 'Busy parents aged 30-45: a 20-minute home workout that adapts when the baby wakes up. 3 workouts a week, no gym, no equipment. 14 days free.', '20-minute workouts for parents']],
};
let k = 0;
function newCreative(g) {
  const s = g.state;
  const set = COPY[quality];
  const [hook, primaryText, headline] = set[k++ % set.length];
  if (!L.tryHours(g, 0.75, 'Ads: creative')) return null;
  const c = AE.addCreative(s, { format: 'static', hook: `${hook}`, primaryText, headline, cta: 'Start free trial', name: hook.slice(0, 40) });
  g.ctx.enqueue('ads:review', { id: c.id });
  return c;
}
const res = await run({
  name: `C-b2c-ads-${budget}-${quality}`, seeds: +seeds, days: +days, game: { model: 'b2c' },
  init: async (g) => {
    await L.setupWebsite(g);
    const s = g.state;
    L.tryHours(g, 0.5 + 0.1 + 1 + 3, 'Ads: account setup');
    const a = AE.createAccount(s, 'meta'); a.payment = 'card'; a.pixel = true; a.capi = true;
  },
  policy: async (g, dow) => {
    const s = g.state;
    if (dow === 0) return;
    const A = s.apps.ads;
    if (L.market.shippedFeatures(s).length >= 3 && !g.paneled) { await L.customerPanel(g); g.paneled = true; }
    if (g.paneled && !g.adset) {
      const crs = [newCreative(g), newCreative(g), newCreative(g)].filter(Boolean);
      const c = AE.createCampaign(s, { p: 'meta', name: 'Trials', objective: 'sales' });
      g.adset = AE.createAdSet(s, { campaignId: c.id, budget: +budget, audience: { type: 'broad' }, placement: 'advantage', optimization: 'trial' });
      for (const cr of crs) AE.createAd(s, { adsetId: g.adset.id, creativeId: cr.id });
      L.tryHours(g, 0.5, 'Ads: campaign setup');
      g.adsStart = s.day; g.nextRefresh = s.day + 21;
    }
    if (g.adset) {
      // Weekly 30 min checking the dashboard; refresh 2 creatives every 3 weeks.
      if (dow === 1) L.tryHours(g, 0.5, 'Ads: monitoring');
      if (s.day >= g.nextRefresh && g.adset.status === 'active') {
        g.nextRefresh = s.day + 21;
        for (const cr of [newCreative(g), newCreative(g)].filter(Boolean)) AE.createAd(s, { adsetId: g.adset.id, creativeId: cr.id });
      }
      // Average founder: stops ads when company cash drops under $5k; restarts above $15k.
      const cash = L.balance(s);
      if (g.adset.status === 'active' && cash < 5000) { g.adset.status = 'paused'; g.pausedDay ??= s.day; }
      else if (g.adset.status === 'paused' && cash > 15000) g.adset.status = 'active';
    }
    const target = s.founder.hoursPerWeek / 6, start = L.hoursLeft(s);
    let guard = 0;
    while (start - L.hoursLeft(s) < target - 0.5 && L.hoursLeft(s) > 0.5 && guard++ < 6) { if (!(await L.productWork(g, target - (start - L.hoursLeft(s))))) break; }
  },
  extra: (g) => {
    const s = g.state;
    const spend = (s.bank.txns ?? []).filter((t) => t.category === 'advertising').reduce((a, t) => a - t.amount, 0);
    const subs = s.stripe.subscriptions.filter((x) => String(x.source).startsWith('ads:'));
    const paid = subs.filter((x) => (x.paidMonths ?? 0) >= 1 || x._growthPaid).length;
    const ev = s.stripe.events;
    return { adSpend: Math.round(spend), adTrials: subs.length, adPaid: paid, cac: paid ? Math.round(spend / paid) : null, pausedDay: g.pausedDay ?? null,
      revenue: Math.round((s.bank.txns ?? []).filter((t) => /stripe/i.test(t.counterparty ?? '') && t.amount > 0).reduce((a, t) => a + t.amount, 0)),
      creatives: (s.apps.ads?.creatives ?? []).map((c) => +(c.q ?? 0).toFixed(2)).slice(0, 6), sourceMix: Object.entries(s.stripe.subscriptions.reduce((a, x) => { a[x.source] = (a[x.source] ?? 0) + 1; return a; }, {})) };
  },
});
console.log(JSON.stringify(res));
