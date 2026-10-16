// Live end-to-end check of the marketing cluster's LLM judges (NOT part of npm test).
// Run: node docs/review/llm-e2e/marketing.mjs [group ...]   groups: ads ugc post community seo aso landing news geo comp
// Needs the local proxy (node server.js) on http://localhost:3000 with an OpenRouter key. Default runs every group
// except `comp` (competitor discovery uses web search, ~$0.02+/call): pass `comp` explicitly.
// Prints a pass/fail table; raw outputs go to docs/review/llm-e2e/out/marketing.json.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as llm from '../../../public/core/llm.js';
import { newState } from '../../../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../../../public/core/stripe.js';
import { ensureMarket } from '../../../public/core/market.js';
import { seedDefaultStack } from '../../../public/core/bank.js';
import { policyCheck, judgeCreative, judgeBrief, judgePost, judgeCommunityPost, judgeArticle, judgeAso } from '../../../public/apps/growth/judges.js';
import { winnerProbability } from '../../../public/apps/growth/delivery.js';
import { communityOutcome } from '../../../public/apps/growth/organicModel.js';
import { reviewCheck } from '../../../public/apps/growth/aso.js';
import { runPanel } from '../../../public/apps/website.js';
import { judgeIssue } from '../../../public/apps/audience/judge.js';
import { judgePromptSet, classifyAnswer } from '../../../public/apps/searchtools/judge.js';
import { savePromptSet } from '../../../public/apps/searchtools/geo.js';
import { discoverCompetitors } from '../../../public/apps/marketworld/competitors.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ALL = ['ads', 'ugc', 'post', 'community', 'seo', 'aso', 'landing', 'news', 'geo'];
const args = process.argv.slice(2);
const groups = args.length ? args : ALL;
const SAMPLES = Number(process.env.SAMPLES ?? 2);

const usage = [];
llm.configure({ base: 'http://localhost:3000', onUsage: (u) => usage.push(u) });
if (!(await llm.checkServerKey())) { console.error('Proxy at :3000 has no key / is not running.'); process.exit(1); }

// ---------------- Companies ----------------

function company({ name, model, path, oneLiner, icp, domain, price, interval = 'month', trialDays = 14, customers = 0, seed }) {
  const s = newState({ companyName: name, model, path, founderName: 'Sam Rivera', seed });
  ensureStripe(s); seedDefaultStack(s); ensureMarket(s);
  delete s.cache; // every call live, no cache reuse between samples
  Object.assign(s.company, { oneLiner, icp, domain, website: null });
  s.plans = [{ id: 'plan_main', name: 'Pro', price, interval, trialDays, active: true }];
  s.day = 160;
  for (let i = 0; i < customers; i++) { const c = createCustomer(s, { name: `Customer ${i}`, email: `c${i}@ex.com`, country: 'US' }); subscribe(s, c.id, s.plans[0], { trial: false }); }
  return s;
}
const A = () => company({ name: 'LedgerLoop', model: 'smb', path: 'indie', seed: 11, domain: 'ledgerloop.app', price: 39, customers: 23,
  oneLiner: 'Reconciles Shopify payouts, fees, refunds and chargebacks into QuickBooks Online automatically, so sellers close the month in minutes.',
  icp: 'US Shopify sellers doing $20k-$300k a month who do their own bookkeeping in QuickBooks Online' });
const B = () => company({ name: 'Attestly', model: 'ent', path: 'vc', seed: 12, domain: 'attestly.ai', price: 1500, trialDays: 0, customers: 4,
  oneLiner: 'AI agent that collects SOC 2 and ISO 27001 evidence from AWS, Okta and Jira and drafts auditor-ready control narratives.',
  icp: 'Heads of security and compliance at 200-2,000 person fintech and healthtech companies running two or more audits a year' });
const C = () => company({ name: 'ReadNest', model: 'b2c', path: 'indie', seed: 13, domain: 'readnest.app', price: 4.99, trialDays: 7, customers: 0,
  oneLiner: 'Kids\' reading log app: parents snap the book cover, ReadNest logs minutes and builds a reading streak the school teacher can see.',
  icp: 'Parents of 5-9 year-olds whose school asks for a signed daily reading log' });

const ctxFor = (state) => ({ state, llm, toast: () => {}, save() {}, render() {}, act: async (fn) => fn(state), enqueue() {} });

// ---------------- Reporting ----------------

const rows = [];
const raw = {};
const r2 = (x) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 100) / 100);
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
function check(task, name, pass, detail) { rows.push({ task, check: name, pass: Boolean(pass), detail }); }
function save(task, key, val) { (raw[task] ??= {})[key] = val; }
async function samples(n, fn) { const out = []; for (let i = 0; i < n; i++) out.push(await fn(i)); return out; }
// Jev-vs-chat agreement: for each case, the mean Jev criterion score (0-based → +1) and chat-only mean.
const jevMean = (jev) => (jev ? mean(Object.values(jev).filter((a) => Number.isFinite(a?.score)).map((a) => a.score + 1)) : null);
const ordered = (a, b, c, gap = 0.05) => a > b + gap && b > c + gap * 0.5;

// Strong / mediocre / gamed triple with SAMPLES samples each; returns means of `metric`.
async function triple(task, cases, run, metric, { gap = 0.08, gamedTest = null } = {}) {
  const res = {};
  for (const [label, input] of Object.entries(cases)) {
    const outs = await samples(SAMPLES, () => run(input));
    res[label] = { scores: outs.map(metric), mean: mean(outs.map(metric)), outs };
    save(task, label, outs);
  }
  const live = Object.values(res).every((r) => r.outs.every((o) => o.mock === false));
  check(task, 'live (mock=false)', live, live ? 'all calls live' : 'fallback used');
  const jevOk = Object.values(res).every((r) => r.outs.every((o) => (o.results ?? [o]).some((x) => x.jev || x._jev)));
  const s = res.strong.mean, m = res.mediocre.mean, g = res.gamed.mean;
  check(task, 'strong > mediocre', s > m + gap, `${r2(s)} vs ${r2(m)} (samples ${res.strong.scores.map(r2)} / ${res.mediocre.scores.map(r2)})`);
  check(task, gamedTest ? 'gamed caught' : 'mediocre > gamed', gamedTest ? gamedTest(res.gamed) : m > g, `gamed ${r2(g)} (samples ${res.gamed.scores.map(r2)})`);
  return { res, jevOk };
}

// Keep Jev answers on panel results (llm.ask puts them on the result; judges spread r.data only).
const origPanel = llm.panel;
const wrapped = { ...llm, panel: async (opts) => { const out = await origPanel(opts); return out.map((r) => ({ ...r, data: { ...r.data, _jev: r.jev ? jevMean(r.jev) : null, _jevRaw: r.jev ?? null } })); } };
const ctxW = (state) => ({ ...ctxFor(state), llm: wrapped });
const jevAgree = (task, res) => {
  const j = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, mean(v.outs.flatMap((o) => (o.results ?? []).map((x) => x._jev).filter(Number.isFinite)))]));
  check(task, 'Jev rubric present + agrees (strong > gamed)', Number.isFinite(j.strong) && j.strong > j.gamed, `Jev mean criterion score strong ${r2(j.strong)} / mediocre ${r2(j.mediocre)} / gamed ${r2(j.gamed)}`);
};

// ================= ads =================
if (groups.includes('ads')) {
  for (const [label, mk, cases] of [
    ['A smb', A, {
      strong: { format: 'video_ugc', hook: 'Shopify paid out $8,412. QuickBooks says $9,030. Where did $618 go?', primaryText: 'It went to Shopify fees, two refunds and a chargeback that QuickBooks booked as income. LedgerLoop splits every payout into sales, fees, refunds and chargebacks and posts them to QuickBooks Online for you. Sellers using it close the month in about 15 minutes instead of a Sunday.', headline: 'Shopify payouts that match QuickBooks', cta: 'Start free trial', platformHint: 'Instagram' },
      mediocre: { format: 'static', hook: 'Bookkeeping is hard. We make it easier.', primaryText: 'LedgerLoop helps ecommerce businesses save time on accounting with smart automation. Try it today.', headline: 'Easier ecommerce accounting', cta: 'Learn more', platformHint: 'Instagram' },
      gamed: { format: 'static', hook: 'Shopify sellers QuickBooks Online bookkeeping Shopify payouts sellers bookkeeping', primaryText: 'The #1 revolutionary AI-powered all-in-one seamless solution for US Shopify sellers doing bookkeeping in QuickBooks Online. Supercharge your bookkeeping, unlock next-gen workflows and take your Shopify store to the next level. Guaranteed results. Best-in-class, world-class, cutting-edge.', headline: 'Best Shopify QuickBooks bookkeeping solution', cta: 'Learn more', platformHint: 'Instagram' },
    }],
    ['C b2c', C, {
      strong: { format: 'video_ugc', hook: 'It\'s 8:47pm and I just realised the reading log is due tomorrow. Again.', primaryText: 'I used to forge 5 days of "20 minutes" every Friday. Now I snap the book cover after bedtime story and ReadNest logs it; Ms. Patel sees the streak on Monday. My son is on day 41.', headline: 'The reading log that fills itself', cta: 'Download', platformHint: 'TikTok' },
      mediocre: { format: 'static', hook: 'Help your kids read more!', primaryText: 'ReadNest is a reading app for families. Track reading and build good habits.', headline: 'Reading made fun', cta: 'Learn more', platformHint: 'Instagram' },
      gamed: { format: 'static', hook: 'Parents reading log kids reading school reading log parents', primaryText: 'Are you a busy parent? The #1 best revolutionary AI-powered reading log for parents of 5-9 year-olds whose school asks for a signed daily reading log. Seamless, effortless, game-changing. Guaranteed results: your child will read 10x more.', headline: 'Best reading log app for parents', cta: 'Learn more', platformHint: 'Instagram' },
    }],
  ]) {
    const t = `ad_creative_review (${label})`;
    const pol = policyCheck(`${cases.gamed.hook} ${cases.gamed.primaryText} ${cases.gamed.headline}`);
    const { res } = await triple(t, cases, (c) => judgeCreative(ctxW(mk()), c), (o) => o.skill, { gap: 0.08, gamedTest: (g) => g.mean <= 0.15 });
    check(t, 'gamed ad rejected by policy review before delivery', Boolean(pol), pol ?? 'not rejected');
    const wp = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, r2(winnerProbability(v.mean) * 100)]));
    check(t, 'consequence: winner rate strong > mediocre', wp.strong > wp.mediocre, `winner probability % strong ${wp.strong} / mediocre ${wp.mediocre} / gamed ${wp.gamed} (neutral 5%)`);
    jevAgree(t, res);
    const click = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, r2(mean(v.outs.flatMap((o) => o.results.map((x) => x.wouldClick))) * 100)]));
    check(t, 'wouldClick realistic (strong <= 10%)', click.strong <= 10, `wouldClick % strong ${click.strong} / mediocre ${click.mediocre} / gamed ${click.gamed}`);
    save(t, 'reactions', Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.outs.map((o) => o.results[0].reaction)])));
  }
}

// ================= ugc =================
if (groups.includes('ugc')) {
  const t = 'ugc_brief_review';
  const cases = {
    strong: { hook: '1) Hold up a crumpled paper reading log: "This is due tomorrow and I filled in zero days." 2) Phone camera on a book cover, beep: "That\'s Monday logged." 3) Show the teacher view: "Ms. Patel can see he read 6 days in a row."', keyMessage: '- You snap the cover, ReadNest logs minutes\n- The teacher sees the streak, no signed paper\n- Kids care about the streak flame\nMUST SAY: "ReadNest", "7-day free trial"', notes: 'Viewer: a parent of a 6-year-old whose school sends a paper log home. 20-30 seconds, 9:16 vertical, product on screen by second 3, screen-record the snap-to-log flow, film at home in the evening light. Don\'t: claim it improves reading scores, mention other apps, show your child\'s full name or school. Use the paid-partnership label and #ad. Deliverables: 3 videos (one per hook), raw + edited, 1 revision round, due in 10 days, 90-day paid usage rights with whitelisting. CTA: "Start the 7-day free trial, link below."' },
    mediocre: { hook: 'Something catchy about reading', keyMessage: 'ReadNest is an app that helps kids read more and parents track reading. It has streaks, a teacher view, book scanning, stats, badges, reminders and more.', notes: 'Make it fun and authentic. Show the app.' },
    gamed: { hook: 'Hook hook hook: parents reading log kids reading log app viral hook', keyMessage: 'Revolutionary seamless all-in-one AI-powered next-gen reading solution that empowers parents to unlock their kids\' potential and elevate reading to the next level. Best-in-class, world-class, game-changing, effortless, robust, innovative.', notes: 'Be authentic, be viral, be engaging, go viral, 100% authentic, trending audio, viral viral viral. Length: whatever. CTA: download.' },
  };
  const { res } = await triple(t, cases, (b) => judgeBrief(ctxW(C()), b), (o) => o.score);
  jevAgree(t, res);
  save(t, 'feedback', Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.outs.map((o) => o.results[0].feedback)])));
}

// ================= post =================
if (groups.includes('post')) {
  const t = 'social_post_review';
  const cases = {
    strong: `I priced LedgerLoop at $19/mo for the first 4 months. Biggest mistake so far.\n\n31 Shopify sellers signed up. 9 churned in month two, all saying the same thing: "QuickBooks still doesn't match."\n\nThe bug wasn't the price. Chargebacks were booked as income, so the books never tied out.\n\nI fixed the chargeback mapping, raised the price to $39, and the next 23 customers have a 3% monthly churn.\n\nLesson I'd give anyone selling to small merchants: they don't pay for "saves time". They pay when the number at the bottom finally matches the bank.`,
    mediocre: `Building in public update: this week we worked hard on LedgerLoop and shipped some improvements. Growth is going well and we're learning a lot from customers. Consistency is key when you're a founder. Excited for what's next!`,
    gamed: `I'm thrilled to announce something HUGE 🚀🚀🚀\n\nHere are 7 lessons I learned building an AI-powered startup:\n1. Consistency is key\n2. Listen to customers\n3. Ship fast\n4. Never give up\n5. Leverage AI\n6. Embrace failure\n7. Unlock your potential\n\nLet that sink in. 💡\n\nComment YES if you agree and I'll DM you a free trial! Link in bio 👉 ledgerloop.app #startup #founder #buildinpublic #SaaS #AI #growth #hustle`,
  };
  const { res } = await triple(t, cases, (text) => judgePost(ctxW(A()), text, 'linkedin'), (o) => o.skill);
  jevAgree(t, res);
  const salesy = mean(res.gamed.outs.flatMap((o) => o.results.map((x) => (x.salesy ? 1 : 0))));
  check(t, 'gamed flagged salesy', salesy >= 0.5, `salesy share ${salesy}`);
  save(t, 'reactions', Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.outs.map((o) => o.results[0].reaction)])));
}

// ================= community =================
if (groups.includes('community')) {
  const t = 'community_post_review';
  const base = { community: 'r/shopify', kind: 'Reddit', size: 'large' };
  const cases = {
    strong: { ...base, title: 'Why your Shopify payouts never match QuickBooks (and the 4 journal lines that fix it)', body: 'I spent most of last year reconciling payouts for my own store and then for about 30 other sellers, so here is the whole method, no tool needed.\n\nA Shopify payout is NOT your sales. Each payout = gross sales - Shopify Payments fees - refunds - chargebacks and chargeback fees + adjustments. If you deposit it as one "sales" line in QuickBooks, revenue is understated by your fees and refunds land nowhere.\n\nWhat works:\n1. Create a clearing account "Shopify Clearing".\n2. Book each day\'s gross sales from the Finances summary to Clearing.\n3. Book fees to Merchant Fees, refunds to Refunds (contra revenue), chargebacks to their own account (they are not income).\n4. When the payout lands, transfer Clearing -> Bank. Clearing should go to $0 per payout; if it doesn\'t, the difference is almost always a chargeback or a currency conversion.\n\nThe chargeback one bit me: I had $1,140 of "income" in March that was actually disputed orders.\n\nDisclosure: I now make a small app (LedgerLoop) that automates this, but the method above works fine by hand in about 20 minutes a week. How are the rest of you handling multi-currency payouts? That\'s the part I still find messy.' },
    mediocre: { ...base, title: 'Bookkeeping tips?', body: 'Bookkeeping is important for every Shopify store. Make sure you keep your records up to date, reconcile regularly and use good accounting software. It saves a lot of headaches at tax time. Hope this helps someone!' },
    gamed: { ...base, title: 'Finally found a tool that fixed my books!!', body: 'Not affiliated, just a happy user. I was struggling with Shopify and QuickBooks for months and then a friend told me about LedgerLoop and it is honestly a game changer. It does everything automatically and saved me 10 hours a week. You should definitely check it out: https://ledgerloop.app?ref=reddit they have a free trial and the support is amazing. Best tool ever, highly recommend!!' },
  };
  const rand = (seed) => { let x = seed; return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); };
  const { res } = await triple(t, cases, (p) => judgeCommunityPost(ctxW(A()), p), (o) => o.helpfulness * o.relevance * (1 - o.promotional), {
    gamedTest: (g) => mean(g.outs.map((o) => o.report)) >= 0.5,
  });
  jevAgree(t, res);
  const outc = Object.fromEntries(Object.entries(res).map(([k, v]) => {
    const j = v.outs[0];
    const rr = rand(7); let removed = 0, banned = 0, visits = 0;
    for (let i = 0; i < 400; i++) { const o = communityOutcome({ size: 'large', helpfulness: j.helpfulness, relevance: j.relevance, promotional: j.promotional, report: j.report, hasLink: /https?:/.test(cases[k].body) }, rr); removed += o.removed; banned += o.banned; visits += o.visits; }
    return [k, { removed: r2(removed / 400), banned: r2(banned / 400), visits: Math.round(visits / 400), promo: r2(j.promotional), report: j.report, help: r2(j.helpfulness) }];
  }));
  check(t, 'consequence: stealth ad removed often, strong rarely', outc.gamed.removed >= 0.5 && outc.strong.removed <= 0.25, JSON.stringify(outc));
  const disc = mean(res.gamed.outs.flatMap((o) => o.results.map((x) => x.disclosure)));
  check(t, 'stealth "not affiliated" scores disclosure <= 2', disc <= 2, `disclosure ${r2(disc)}`);
  save(t, 'outcomes', outc);
  save(t, 'reactions', Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.outs.map((o) => o.results[0].reaction)])));
}

// ================= seo =================
if (groups.includes('seo')) {
  const t = 'seo_article_review';
  const q = 'how to reconcile shopify payouts in quickbooks online';
  const cases = {
    strong: { query: q, title: 'How to reconcile Shopify payouts in QuickBooks Online (the clearing-account method we use for 30 stores)', body: `By Sam Rivera, founder of LedgerLoop. Updated October 2026. Disclosure: LedgerLoop automates this; the manual method below works without it.\n\nShort answer: don't record a Shopify payout as one sales deposit. Book gross sales, fees, refunds and chargebacks to a "Shopify Clearing" account, then transfer the payout from Clearing to your bank. Clearing returns to $0 for every payout that is reconciled correctly.\n\n## Why the payout never matches\nA payout is net: gross sales minus Shopify Payments fees (2.5%-2.9% + 30¢ on Basic in the US), refunds, chargebacks and $15 chargeback fees. In our data from 30 stores (Jan-Sep 2026), the median gap between payout and booked sales was 4.1%, and 61% of unexplained differences were chargebacks.\n\n## Step by step\n1. Create an asset account: Shopify Clearing.\n2. Each day, journal gross sales from Shopify > Finances > Payouts > transactions export.\n3. Fees → Merchant Fees (expense). Refunds → Refunds and Allowances (contra revenue). Chargebacks → Chargebacks (not income).\n4. When the deposit lands, match it to a transfer Clearing → Checking.\n\n| Line | Account | Example payout #1182 |\n|---|---|---|\n| Gross sales | Clearing | $9,030.00 |\n| Fees | Merchant Fees | -$262.40 |\n| Refunds | Refunds | -$213.60 |\n| Chargeback + fee | Chargebacks | -$142.00 |\n| Payout | Checking | $8,412.00 |\n\n## When this method fails\nMulti-currency payouts: Shopify converts at its own rate; book the FX difference to a separate account. Shopify Balance accounts and PayPal payouts need their own clearing account. If you use an app that already posts daily summaries (A2X, LedgerLoop), don't also import bank feeds as income or you will double count.\n\nWe tested this on 30 stores: average month-end close went from 3.5 hours to 40 minutes once clearing reached $0 every payout.\n\nSources: Shopify Help Center, "Payouts" (2026); Intuit QuickBooks Online, "Record a journal entry" (2026).` },
    mediocre: { query: q, title: 'Reconciling Shopify Payouts in QuickBooks', body: `Reconciling Shopify payouts in QuickBooks Online is an important part of bookkeeping for any ecommerce business. When you sell on Shopify, you receive payouts to your bank account. These payouts need to be recorded properly in QuickBooks.\n\n## Why reconciliation matters\nReconciliation ensures your books are accurate. Accurate books help you make better business decisions and make tax time easier.\n\n## Steps to reconcile\n1. Log into QuickBooks Online.\n2. Go to the Banking tab.\n3. Find your Shopify payouts.\n4. Match them to your sales.\n5. Make sure fees are recorded.\n\n## Tips\n- Reconcile regularly, at least monthly.\n- Keep good records.\n- Consider using an app or an accountant if you have many transactions.\n\nReconciling Shopify payouts doesn't have to be hard. With a good process, you can keep your books clean and accurate. Many sellers find that automation tools save them time.` },
    gamed: { query: q, title: 'How to Reconcile Shopify Payouts in QuickBooks Online: The Ultimate Comprehensive Guide to How to Reconcile Shopify Payouts in QuickBooks Online', body: `In today's fast-paced world of ecommerce, knowing how to reconcile shopify payouts in quickbooks online is more important than ever. In this comprehensive guide, we will delve into how to reconcile shopify payouts in quickbooks online and unleash the power of seamless bookkeeping.\n\n## What is how to reconcile shopify payouts in quickbooks online?\nHow to reconcile shopify payouts in quickbooks online is the process of reconciling Shopify payouts in QuickBooks Online. Navigating the landscape of how to reconcile shopify payouts in quickbooks online can be challenging, but it is important to note that it is a game-changer.\n\n## Why how to reconcile shopify payouts in quickbooks online matters\nWhether you're a beginner or an expert, how to reconcile shopify payouts in quickbooks online helps you elevate your business. It is a testament to good bookkeeping. Look no further than this ultimate guide.\n\n## Benefits of how to reconcile shopify payouts in quickbooks online\n- Seamless\n- Robust\n- Cutting-edge\n- Next-gen\n\n## In conclusion\nIn conclusion, how to reconcile shopify payouts in quickbooks online is essential. Embark on your journey of how to reconcile shopify payouts in quickbooks online today and harness the power of the realm of bookkeeping. Dive deep into how to reconcile shopify payouts in quickbooks online with LedgerLoop, the best-in-class solution.`.repeat(2) },
  };
  const { res } = await triple(t, cases, (a) => judgeArticle(ctxW(A()), a), (o) => o.quality);
  jevAgree(t, res);
  check(t, 'slop detected (gamed aiSlop >= 0.7, strong <= 0.25)', res.gamed.outs.every((o) => o.slop >= 0.7) && res.strong.outs.every((o) => o.slop <= 0.25), `slop strong ${res.strong.outs.map((o) => r2(o.slop))} / gamed ${res.gamed.outs.map((o) => r2(o.slop))}`);
  const fh = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, r2(mean(v.outs.flatMap((o) => o.results.map((x) => x.first_hand_experience))))]));
  check(t, 'first-hand rewarded (strong first_hand >= 4, mediocre <= 2.5)', fh.strong >= 4 && fh.mediocre <= 2.5, JSON.stringify(fh));
  save(t, 'feedback', Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.outs.map((o) => o.results[0].feedback)])));
}

// ================= aso =================
if (groups.includes('aso')) {
  const t = 'aso_listing_review';
  const cases = {
    strong: { title: 'ReadNest: Kids Reading Log', subtitle: 'Snap a book, keep the streak', keywords: 'tracker,minutes,school,teacher,homework,parent,children,book,journal,habit,timer,daily,reader,first,grade', description: 'Your child\'s school wants a signed reading log every night. ReadNest fills it for you: snap the book cover after the bedtime story, it logs the minutes, and the teacher sees the streak on Monday. Parents in our beta logged 5.2 nights a week, up from 2.1 on paper.' },
    mediocre: { title: 'ReadNest', subtitle: 'Reading app for families', keywords: 'reading,app,kids,family,books', description: 'ReadNest is a reading app. Track reading, set goals and more. Download now!' },
    gamed: { title: 'Reading Log Kids Books Epic Reading', subtitle: '#1 Best Free Reading App Kids', keywords: 'reading, log, reading log, kids, kids reading, epic, beanstack, raz kids, reading, books, free, best', description: 'The #1 best free reading app, better than Epic and Beanstack! Only $4.99! Reading log reading log kids reading books reading.' },
  };
  const { res } = await triple(t, cases, (a) => judgeAso(ctxW(C()), a), (o) => o.score);
  jevAgree(t, res);
  // Jev App Review rejection check
  const rj = {};
  for (const [k, v] of Object.entries(cases)) {
    const r = await reviewCheck(ctxFor(C()), 'ios', { name: v.title, subtitle: v.subtitle, keywords: v.keywords, description: v.description });
    rj[k] = { rejectP: r2(r.rejectP), mock: r.mock, termFit: r.termFit };
  }
  save('aso_metadata_review (Jev)', 'reject', rj);
  check('aso_metadata_review (Jev)', 'live', Object.values(rj).every((x) => !x.mock), '');
  check('aso_metadata_review (Jev)', 'gamed rejectP >= 0.5, strong <= 0.2', rj.gamed.rejectP >= 0.5 && rj.strong.rejectP <= 0.2, `rejectP strong ${rj.strong.rejectP} / mediocre ${rj.mediocre.rejectP} / gamed ${rj.gamed.rejectP}`);
}

// ================= landing =================
if (groups.includes('landing')) {
  const sites = {
    A: {
      strong: { url: 'https://ledgerloop.app', title: 'LedgerLoop: Shopify payouts that match QuickBooks Online', description: 'Splits every Shopify payout into sales, fees, refunds and chargebacks and posts it to QuickBooks Online.', headings: ['Your Shopify payout and QuickBooks finally match', 'How it works: connect Shopify, connect QuickBooks, pick your accounts', '"Month-end went from my whole Sunday to 15 minutes." Dana K., owner of Fernway Candles ($80k/mo)', 'Pricing: $39/month, 14-day free trial, no card', 'FAQ'], text: 'Your Shopify payout and QuickBooks finally match. LedgerLoop splits every payout into gross sales, Shopify fees, refunds, chargebacks and currency adjustments, and posts a summary journal to QuickBooks Online daily. Built for US Shopify sellers doing $20k-$300k a month who do their own books. Start 14-day free trial (no card). See a sample journal entry. How it works: 1) Connect Shopify (read-only). 2) Connect QuickBooks Online. 3) Map accounts once; we suggest a clearing-account setup your accountant will recognise. "Month-end went from my whole Sunday to 15 minutes." Dana K., Fernway Candles. 4.8 stars from 41 reviews on the Shopify App Store. Pricing: $39/month, one store, unlimited payouts. FAQ: Does it work with Shopify Payments and PayPal? Yes. Multi-currency? Yes, FX differences post to their own account. Can I cancel? Anytime, data export included. Is my data safe? Read-only Shopify scope, QuickBooks OAuth, SOC 2 Type I in progress. Start 14-day free trial.' },
      mediocre: { url: 'https://ledgerloop.app', title: 'LedgerLoop - Smart Accounting', description: 'Accounting automation for ecommerce.', headings: ['Smarter accounting for ecommerce', 'Features', 'Contact us'], text: 'Smarter accounting for ecommerce businesses. LedgerLoop helps online sellers save time on their bookkeeping with automation. Features: integrations, reports, dashboards, sync. Trusted by businesses. Contact us to learn more. Sign up.' },
      gamed: { url: 'https://ledgerloop.app', title: 'LedgerLoop | #1 AI-Powered Shopify QuickBooks Bookkeeping Solution', description: 'Revolutionary seamless all-in-one AI bookkeeping.', headings: ['Revolutionize your bookkeeping with next-gen AI', 'Unlock seamless, effortless, world-class accounting', 'Trusted by 10,000+ businesses worldwide', 'Supercharge your growth'], text: 'Revolutionize your Shopify QuickBooks bookkeeping with next-gen AI-powered automation. LedgerLoop is the all-in-one, seamless, cutting-edge, best-in-class solution that empowers US Shopify sellers doing bookkeeping in QuickBooks Online to unlock 10x productivity. Trusted by 10,000+ businesses worldwide. "Game-changing!" - A happy customer. Supercharge your growth and take your store to the next level. Book a demo. Start now. Sign up. Get started. Try free. Contact sales. Join the waitlist. Learn more.' },
    },
    B: {
      strong: { url: 'https://attestly.ai', title: 'Attestly: SOC 2 and ISO 27001 evidence collected for you', description: 'An AI agent that pulls audit evidence from AWS, Okta and Jira and drafts control narratives your auditor accepts.', headings: ['Stop screenshotting AWS for your auditor', 'Evidence from AWS, Okta, Jira and GitHub, mapped to SOC 2 and ISO 27001 controls', 'Northbeam Health (900 employees) cut audit prep from 11 weeks to 4', 'Security: SOC 2 Type II, data stays in your AWS region, read-only IAM role', 'Pricing from $18k/year'], text: 'Stop screenshotting AWS for your auditor. Attestly runs a read-only agent against AWS, Okta, Jira and GitHub, collects evidence for 140 SOC 2 and ISO 27001 controls and drafts the control narrative with links to every artifact. Your auditor reviews in our portal; A-LIGN and Prescient have accepted Attestly evidence. Northbeam Health (900 employees, SOC 2 + HITRUST) cut audit prep from 11 weeks to 4 and reused 70% of evidence across frameworks. "First audit where my team did not lose a quarter." Priya S., Head of Security. Security: SOC 2 Type II report on request, data residency in your region, SSO/SCIM, DPA and pentest summary available. Works alongside Vanta or Drata if you already use them. Pricing from $18,000/year for one framework; book a 30-minute technical demo with a security engineer.' },
      mediocre: { url: 'https://attestly.ai', title: 'Attestly - Compliance Automation', description: 'Compliance made simple.', headings: ['Compliance made simple', 'Features', 'Request a demo'], text: 'Attestly makes compliance simple with AI. Automate your audits, save time and stay compliant. Features: evidence collection, policies, dashboards, integrations. Request a demo.' },
      gamed: { url: 'https://attestly.ai', title: 'Attestly | Revolutionary AI Compliance Platform', description: 'Next-gen seamless AI-powered compliance.', headings: ['Transform your compliance with AI', 'The world\'s most innovative compliance solution', 'Trusted by Fortune 500'], text: 'Transform your compliance with revolutionary AI. Attestly is the world\'s most innovative, seamless, next-gen AI-powered compliance platform for heads of security and compliance at fintech and healthtech companies. Get SOC 2 in 24 hours, guaranteed. 100% automated. Trusted by the Fortune 500. Unlock effortless, robust, best-in-class compliance and supercharge your security posture. Request demo. Start now. Contact sales. Get started.' },
    },
  };
  for (const [co, mk] of [['A', A], ['B', B]]) {
    const t = `landing_page_review (${co})`;
    const scores = {}; const outs = {};
    for (const [label, site] of Object.entries(sites[co])) {
      const st = mk(); st.company.website = { ...site, source: 'fetch' };
      await runPanel(ctxW(st));
      const ev = st.company.website.eval;
      const flat = ev.results.flatMap((r) => r.results);
      scores[label] = ev.score;
      outs[label] = { score: r2(ev.score), wtp: st.market.fit.price.wtp, trial: r2(mean(flat.map((x) => x.trialProbability))), mock: flat.some((x) => x.mock), jev: r2(mean(flat.map((x) => x._jev).filter(Number.isFinite))), personas: ev.results.map((r) => ({ role: r.persona.role, first: r.results[0].firstImpression, wtp: r.results[0].willingnessToPayMonthly, trial: r.results[0].trialProbability })) };
    }
    save(t, 'runs', outs);
    check(t, 'live', Object.values(outs).every((o) => !o.mock), '');
    check(t, 'strong > mediocre > gamed', ordered(scores.strong, scores.mediocre, scores.gamed, 0.08) || (scores.strong > scores.mediocre + 0.08 && scores.strong > scores.gamed + 0.08), `score strong ${r2(scores.strong)} / mediocre ${r2(scores.mediocre)} / gamed ${r2(scores.gamed)}`);
    check(t, 'Jev agrees', outs.strong.jev > outs.gamed.jev, `Jev mean strong ${outs.strong.jev} / mediocre ${outs.mediocre.jev} / gamed ${outs.gamed.jev}`);
    const price = co === 'A' ? 39 : 1500;
    check(t, 'WTP in a sane band for the segment (strong page)', outs.strong.wtp >= price * 0.3 && outs.strong.wtp <= price * 4, `median WTP strong $${outs.strong.wtp} / mediocre $${outs.mediocre.wtp} / gamed $${outs.gamed.wtp} (price $${price}/mo)`);
    check(t, 'trial intent realistic (strong <= 0.35)', outs.strong.trial <= 0.35, `trial strong ${outs.strong.trial} / mediocre ${outs.mediocre.trial} / gamed ${outs.gamed.trial}`);
  }
}

// ================= newsletter =================
if (groups.includes('news')) {
  const t = 'newsletter_issue_judge';
  const cases = {
    strong: { subject: 'The $1,140 of "income" that was chargebacks', body: `Last month I helped a candle seller close March. Her P&L said $61,200 in sales. Her bank said otherwise.\n\nThe gap was $1,140, and all of it was chargebacks QuickBooks had booked as income because the payout deposit was recorded as one sales line.\n\n**The one idea this week: never book a Shopify payout as sales.** Book it through a clearing account.\n\nHere is the worked example from her payout #1182:\n\n- Gross sales: $9,030.00 to Clearing\n- Shopify fees: -$262.40 to Merchant Fees\n- Refunds: -$213.60 to Refunds\n- Chargeback + $15 fee: -$142.00 to Chargebacks\n- Payout to bank: $8,412.00\n\nClearing goes to $0. If it doesn't, 6 times out of 10 in the 30 stores I've looked at, the leftover is a chargeback.\n\nTry it on one payout this week. It takes about 20 minutes by hand.\n\nNext week: why multi-currency payouts never tie out, and the FX account that fixes it.\n\nSam\n\nP.S. If you'd rather not do it by hand, LedgerLoop does this every day for $39/month.` },
    mediocre: { subject: 'LedgerLoop Monthly Newsletter - October Edition', body: `Hi everyone,\n\nIt's been a while! Sorry we haven't written in a few months. Here's what's new.\n\nBookkeeping tips: reconcile often, keep receipts, and talk to your accountant.\n\nWe also shipped some product updates, improved performance and fixed bugs.\n\nIn other news, tax season is coming, so get organized early.\n\nThanks for reading and see you next time!\n\nThe LedgerLoop Team` },
    gamed: { subject: '🚨🚨 LAST CHANCE!!! 50% OFF LEDGERLOOP ENDS TONIGHT - DON\'T MISS OUT ON THIS INCREDIBLE DEAL', body: `In today's fast-paced world, LedgerLoop is the game-changer you need!!! Unlock seamless bookkeeping! Try LedgerLoop now: https://ledgerloop.app\n\nLedgerLoop LedgerLoop LedgerLoop. Supercharge your books with LedgerLoop! Buy LedgerLoop today: https://ledgerloop.app/buy\n\nOnly 3 spots left!!! Use code SAVE50. Hurry! Upgrade now: https://ledgerloop.app/upgrade\n\nExciting news: we're thrilled to announce LedgerLoop is the best! Sign up: https://ledgerloop.app/signup\n\nStay tuned!!!` },
  };
  const res = {};
  for (const [k, v] of Object.entries(cases)) {
    const outs = await samples(SAMPLES, () => judgeIssue(ctxFor(A()), v.subject, v.body));
    res[k] = { outs, mean: mean(outs.map((o) => o?.score ?? NaN)) };
    save(t, k, outs);
  }
  check(t, 'live', Object.values(res).every((r) => r.outs.every(Boolean)), '');
  check(t, 'strong > mediocre', res.strong.mean > res.mediocre.mean + 0.1, `${r2(res.strong.mean)} vs ${r2(res.mediocre.mean)}`);
  check(t, 'mediocre > gamed', res.mediocre.mean > res.gamed.mean, `gamed ${r2(res.gamed.mean)}`);
  const j = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, r2(mean(v.outs.map((o) => jevMean(o?.jev)).filter(Number.isFinite)))]));
  check(t, 'Jev present + agrees', j.strong > j.gamed, JSON.stringify(j));
}

// ================= geo (Search & AI visibility) =================
if (groups.includes('geo')) {
  const t = 'geo_prompt_set';
  const sets = {
    strong: ['best app to reconcile shopify payouts with quickbooks online', 'why doesn\'t my shopify payout match my quickbooks deposit', 'how do I record shopify fees and refunds in quickbooks online', 'A2X vs Synder for a small shopify store', 'alternatives to A2X for shopify quickbooks', 'is there a cheaper alternative to a bookkeeper for a $50k/month shopify store', 'how much does A2X cost per month', 'shopify chargebacks showing as income in quickbooks how to fix', 'tool that posts shopify payouts to quickbooks as journal entries', 'should I use a clearing account for shopify in QBO', 'best shopify accounting app for a 2-person store on quickbooks', 'Webgility vs A2X vs LedgerLoop', 'shopify multi currency payouts quickbooks reconciliation', 'do I need an app or can I reconcile shopify in a spreadsheet', 'cheapest way to automate shopify bookkeeping 2026'],
    vanity: ['what is LedgerLoop', 'is LedgerLoop good', 'LedgerLoop reviews', 'LedgerLoop pricing', 'who founded LedgerLoop', 'LedgerLoop features', 'LedgerLoop login', 'best accounting software', 'best software', 'bookkeeping', 'how to bake sourdough bread', 'LedgerLoop vs nothing', 'accounting', 'LedgerLoop app', 'is LedgerLoop legit'],
  };
  const res = {};
  for (const [k, texts] of Object.entries(sets)) {
    const st = A();
    const j = await judgePromptSet(ctxFor(st), texts);
    const saved = savePromptSet(st, { texts, kinds: j.kinds, rubric: j.rubric, feedback: j.feedback, mock: j.mock });
    res[k] = { quality: r2(saved.quality), rubric: r2(j.rubric), kinds: j.kinds, feedback: j.feedback, mock: j.mock };
  }
  save(t, 'sets', res);
  check(t, 'live', !res.strong.mock && !res.vanity.mock, '');
  check(t, 'strong set quality > vanity by 0.25', res.strong.quality > res.vanity.quality + 0.25, `quality strong ${res.strong.quality} (rubric ${res.strong.rubric}) / vanity ${res.vanity.quality} (rubric ${res.vanity.rubric})`);
  // Jev prompt classification on labeled prompts
  const expected = { 0: 'generic', 3: 'comparison', 4: 'comparison', 11: 'comparison', 1: 'generic' };
  const expV = { 0: 'vanity', 1: 'vanity', 2: 'vanity', 10: 'off_target' };
  const hitsS = Object.entries(expected).filter(([i, k]) => res.strong.kinds[i] === k).length;
  const hitsV = Object.entries(expV).filter(([i, k]) => res.vanity.kinds[i] === k).length;
  check('geo_prompt_kind (Jev)', 'labeled prompt kinds', hitsS + hitsV >= 8, `${hitsS}/5 strong-set labels, ${hitsV}/4 vanity-set labels; kinds strong ${res.strong.kinds.join(',')} | vanity ${res.vanity.kinds.join(',')}`);

  // Jev answer check on labeled pasted answers
  const t2 = 'geo_answer_check (Jev)';
  const answers = {
    recommended: { want: { mentioned: true, stance: 'recommended', wrongFact: false }, prompt: 'best app to reconcile shopify payouts with quickbooks online', answer: 'For a small Shopify store on QuickBooks Online, my top pick is **LedgerLoop** ($39/month): it splits each payout into sales, fees, refunds and chargebacks and posts a daily journal. A2X is the established option and works well for higher volume, and Synder suits multi-channel sellers. If you only want one recommendation for a solo seller, go with LedgerLoop.' },
    listed: { want: { mentioned: true, stance: 'listed', wrongFact: false }, prompt: 'alternatives to A2X', answer: 'Popular alternatives to A2X include Synder, Webgility, Bookkeep, LedgerLoop and Link My Books. Each connects Shopify to QuickBooks or Xero; compare pricing tiers and the number of orders per month you process before choosing.' },
    absent: { want: { mentioned: false, stance: 'absent', wrongFact: false }, prompt: 'best shopify accounting app', answer: 'The most commonly recommended Shopify accounting integrations are A2X, Synder and Webgility. A2X is best for accrual summaries, Synder for transaction-level sync, and Webgility for inventory-heavy stores. Many sellers also hire a bookkeeper familiar with ecommerce.' },
    similar_name: { want: { mentioned: false, stance: 'absent', wrongFact: false }, prompt: 'best shopify accounting app', answer: 'Consider A2X or Synder. Some stores also use Ledger Loop Consulting, a UK bookkeeping firm, or the LedgerLink bank-feed tool. For hardware wallets, Ledger is unrelated to accounting.' },
    negative: { want: { mentioned: true, stance: 'negative', wrongFact: false }, prompt: 'is LedgerLoop good', answer: 'LedgerLoop is a newer Shopify-to-QuickBooks tool. Several Reddit users complain that its multi-currency handling is buggy and support is slow; some recommend avoiding it until it matures and using A2X instead.' },
    wrong_price: { want: { mentioned: true, stance: 'listed', wrongFact: true }, prompt: 'how much does LedgerLoop cost', answer: 'LedgerLoop costs $149 per month on its Starter plan and $399 per month for Pro, with a free plan for stores under 50 orders. A2X starts at $19/month.' },
  };
  const got = {};
  let right = 0, total = 0;
  for (const [k, a] of Object.entries(answers)) {
    const r = await classifyAnswer(ctxFor(A()), a);
    got[k] = r;
    for (const f of ['mentioned', 'stance', 'wrongFact']) { total++; if (r[f] === a.want[f] || (k === 'wrong_price' && f === 'stance' && ['listed', 'negative'].includes(r.stance))) right++; }
  }
  save(t2, 'answers', got);
  check(t2, 'live', Object.values(got).every((r) => !r.mock), '');
  check(t2, 'labeled answers correct (>= 16/18)', right >= 16, `${right}/${total}; ${Object.entries(got).map(([k, r]) => `${k}: named=${r.mentioned}(${r2(r.pMentioned)}) ${r.stance} wrong=${r.wrongFact}`).join(' | ')}`);
}

// ================= competitor discovery (web search) =================
if (groups.includes('comp')) {
  const t = 'competitor_discovery';
  for (const [co, mk] of [['A', A], ['B', B]].slice(0, Number(process.env.COMP_N ?? 1))) {
    const st = mk();
    const C0 = await discoverCompetitors(ctxFor(st), { reason: 'e2e' });
    const list = C0.list ?? [];
    // URL check: does each competitor's domain resolve and answer (any HTTP status)?
    const urlOk = [];
    for (const c of list) {
      let ok = false, status = null;
      try { const r = await fetch(c.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) }); status = r.status; ok = r.status < 500; } catch (e) { status = String(e.cause?.code ?? e.message).slice(0, 40); }
      urlOk.push({ name: c.name, url: c.url, ok, status, kind: c.kind, awareness: c.awareness, share: c.marketShare, conf: c.confidence });
    }
    save(t, co, { category: C0.category, statusQuo: C0.statusQuo, statusQuoShare: C0.statusQuoShare, usd: C0.usd, citations: C0.citations?.length, reasoning: C0.reasoning, urls: urlOk, error: C0.error });
    check(`${t} (${co})`, 'live with web results', !C0.mock && list.length >= 5, `${list.length} competitors, ${C0.citations?.length ?? 0} citations, $${r2(C0.usd)}`);
    const okShare = urlOk.filter((u) => u.ok).length / Math.max(1, urlOk.length);
    check(`${t} (${co})`, 'competitor URLs resolve (>= 80%)', okShare >= 0.8, `${Math.round(okShare * 100)}% ok; ${urlOk.map((u) => `${u.name}=${u.status}`).join(', ')}`);
    const totalShare = list.reduce((a, c) => a + c.marketShare, 0) + (C0.statusQuoShare ?? 0);
    check(`${t} (${co})`, 'shares sum <= 1, awareness conservative', totalShare <= 1.001 && list.filter((c) => c.awareness > 0.5).length <= 3, `sum ${r2(totalShare)}; >0.5 awareness: ${list.filter((c) => c.awareness > 0.5).map((c) => c.name).join(', ') || 'none'}`);
  }
}

// ---------------- Output ----------------

const live = usage.filter((u) => !u.mock);
const cost = live.reduce((a, u) => a + (u.usd ?? 0), 0);
mkdirSync(join(HERE, 'out'), { recursive: true });
writeFileSync(join(HERE, 'out', 'marketing.json'), JSON.stringify({ groups, rows, raw, usage: { calls: usage.length, live: live.length, mock: usage.length - live.length, usd: cost } }, null, 2));
const w = Math.max(...rows.map((r) => r.task.length));
for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.task.padEnd(w)}  ${r.check}${r.detail ? `  — ${r.detail}` : ''}`);
console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} checks passed · ${live.length} live calls (${usage.length - live.length} fallback) · $${cost.toFixed(4)}`);
