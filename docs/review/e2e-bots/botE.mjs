// Bot E: indie with a part-time job (game caps startup hours at 40/wk). SMB micro-SaaS at $29/mo.
// Network launch at MVP, build in public on LinkedIn+X 2x/week, one SEO article every 2 weeks, one community post a month.
import * as L from './lib.mjs';
import { run } from './runner.mjs';
const OE = await import((process.env.SIM_ROOT ?? '/home/user/saas-simulator-game/public') + '/apps/growth/organicEngine.js');
const JG = await import((process.env.SIM_ROOT ?? '/home/user/saas-simulator-game/public') + '/apps/growth/judges.js');
const [seeds = 20, days = 1095, job = 'part_time', price = 29, model = 'smb'] = process.argv.slice(2);
const POSTS = [
  'Week 6 of building a payout reconciliation tool for Shopify stores. Talked to 9 bookkeepers: 7 match payouts to orders by hand every month, about 6 hours each. Shipped nightly matching this week. What does your month-end look like?',
  'Lesson from 20 customer calls: nobody asked for AI. They asked for the refund that went missing in March to show up in the report. Shipping boring fixes > shiny features.',
  'Numbers update: 14 trials, 3 paying, $87 MRR. Biggest drop-off is connecting Shopify. Rewriting onboarding this week.',
  'A bookkeeper told me she keeps a sticky note of payouts she could not match. That sticky note is my product roadmap.',
];
const ARTICLE = (i) => ({ query: `how to reconcile shopify payouts ${['with stripe', 'refunds', 'fees', 'month end', 'quickbooks', 'paypal'][i % 6]}`, title: `How to reconcile Shopify payouts (${['Stripe', 'refunds', 'fees', 'month-end', 'QuickBooks', 'PayPal'][i % 6]}): a step-by-step guide from 9 bookkeepers`,
  body: Array.from({ length: 9 }, (_, k) => `Step ${k + 1}: We interviewed 9 bookkeepers who reconcile 2,000+ orders a month. Export the payout report, match each payout line to orders, check refunds and fees, and flag anything unmatched. In our data, 7 of 9 missed at least one refund a quarter, costing $300-1,200. Here is the exact spreadsheet formula and the screenshot of the report.`).join('\n\n') });
const res = await run({
  name: `E-indie-${job}-${model}-$${price}`, seeds: +seeds, days: +days, game: { model, job, network: { friends: 50, linkedin: 500, x: 300, newsletter: 0 } },
  init: async (g) => { g.state.plans[0].price = +price; await L.setupWebsite(g); },
  policy: async (g, dow) => {
    const s = g.state;
    if (dow === 0) return;
    if (L.market.shippedFeatures(s).length >= 3 && !g.paneled) { await L.customerPanel(g); g.paneled = true; }
    const O = OE.ensureOrganic(s);
    if (g.paneled && !O.launch && L.tryHours(g, 2 + 0.75 + 0.5, 'Organic: network launch')) {
      const msg = 'After 9 interviews with Shopify bookkeepers I built a tool that matches payouts to orders every night and flags missed refunds. It is live today with a 14-day free trial. If you or someone you know closes the books for a store, I would love feedback.';
      const j = await JG.judgePost(g.ctx, msg, 'linkedin', 'launch announcement to personal network');
      OE.launchToNetwork(s, { channels: { friends: true, linkedin: true, x: true }, message: msg, skill: j.skill });
      g.launchDay = s.day;
    }
    if (g.paneled) {
      if ((dow === 2 || dow === 4)) {
        const plat = dow === 2 ? 'linkedin' : 'x';
        if (L.tryHours(g, plat === 'x' ? 0.5 : 0.75, 'Organic: build in public')) { const text = POSTS[(g.np = (g.np ?? 0) + 1) % POSTS.length]; const j = await JG.judgePost(g.ctx, text, plat); OE.publishPost(s, { platform: plat, text, skill: j.skill, judge: j }); }
      }
      if (dow === 3 && Math.floor(s.day / 7) % 2 === 0) {
        const a = ARTICLE(g.na = (g.na ?? 0) + 1);
        const h = Math.min(10, Math.max(2, 1 + L.util.words(a.body) / 600));
        if (L.tryHours(g, h, 'Organic: SEO article')) { const j = await JG.judgeArticle(g.ctx, a); OE.publishArticle(s, { ...a, judge: j }); }
      }
      if (dow === 5 && s.day % 28 < 7) {
        const p = { community: ['r/shopify', 'r/bookkeeping', 'Shopify Community forum', 'Indie Hackers'][Math.floor(s.day / 28) % 4], kind: 'forum', size: 'medium', title: 'How do you reconcile payouts with 2,000+ orders a month?', body: 'I interviewed 9 bookkeepers about month-end. 7 match payouts to orders by hand (about 6 hours a month). The trick that helped most: export the payout report and match by payout ID, then check refunds separately. Happy to share the spreadsheet template. What do you do?' };
        if (L.tryHours(g, 1, 'Organic: community')) { try { const j = await JG.judgeCommunityPost(g.ctx, p); OE.communityPost(s, { ...p, judge: j }); } catch {} }
      }
    }
    const target = s.founder.hoursPerWeek / 6, start = L.hoursLeft(s);
    let guard = 0;
    while (start - L.hoursLeft(s) < target - 0.5 && L.hoursLeft(s) > 0.5 && guard++ < 6) { if (!(await L.productWork(g, target - (start - L.hoursLeft(s))))) break; }
  },
  extra: (g) => {
    const s = g.state;
    const O = s.apps.organic ?? {};
    return { launchDay: g.launchDay ?? null, stats: Object.fromEntries(Object.entries(O.stats ?? {}).map(([k, v]) => [k, [Math.round(v.visits), v.signups]])), sourceMix: Object.entries(s.stripe.subscriptions.reduce((a, x) => { a[x.source] = (a[x.source] ?? 0) + 1; return a; }, {})), x: s.founder.network.x, li: s.founder.network.linkedin };
  },
});
console.log(JSON.stringify(res));
