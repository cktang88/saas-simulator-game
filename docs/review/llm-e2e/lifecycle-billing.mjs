// Live end-to-end check of the lifecycle / billing / customer LLM tasks (not part of npm test).
// Needs the local proxy (node server.js) on http://localhost:3000 with an OpenRouter key.
//   node docs/review/llm-e2e/lifecycle-billing.mjs            all tasks
//   node docs/review/llm-e2e/lifecycle-billing.mjs dunning    only tasks whose name contains "dunning"
// Prints a pass/fail table; raw outputs go to docs/review/llm-e2e/out/lifecycle-billing.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as llm from '../../../public/core/llm.js';
import { newState } from '../../../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../../../public/core/stripe.js';
import { ensureMarket } from '../../../public/core/market.js';
import { seedDefaultStack, post } from '../../../public/core/bank.js';
import { judgeEmail } from '../../../public/apps/lifecycle/judge.js';
import { aiDraft } from '../../../public/apps/lifecycle.js';
import { lintEmail, candidateEvents, nodeQuality } from '../../../public/apps/lifecycle/model.js';
import { judgeUpgrade } from '../../../public/apps/plg.js';
import { judgeDunningSteps, judgePriceNotice, judgeDisputeEvidence } from '../../../public/apps/stripe.js';
import { migrationChurnMultiplier } from '../../../public/apps/money/judge.js';
import customersApp, { runPanel, requestExitInterview, holdExitInterview } from '../../../public/apps/customers.js';
import { interviewQuality } from '../../../public/apps/customers/rubric.js';
import { revealChance, exitInterviewQuality } from '../../../public/apps/retention/interview.js';
import { runLlmSurvey, jevBuyCheck } from '../../../public/apps/pricing.js';
import { surveyPrices } from '../../../public/apps/channels/pricing-sim.js';
import { newThread, addMessage } from '../../../public/core/mail.js';
import { customersSlice } from '../../../public/apps/product/store.js';
import { vanWestendorp, gaborGranger } from '../../../public/apps/channels/stats.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLY = process.argv[2] ?? '';
const usage = [];
llm.configure({ base: 'http://localhost:3000', onUsage: (u) => usage.push(u) });
if (!(await llm.checkServerKey()) || !llm.isLive()) { console.error('Proxy not live at localhost:3000'); process.exit(1); }

// Record every LLM call so the table can say live/mock and whether Jev answered.
const calls = [];
const rec = {
  ...llm,
  ask: async (o) => { const r = await llm.ask(o); calls.push({ task: o.task, mock: r.mock, jev: Boolean(r.jev), error: r.error ?? null }); return r; },
  panel: async (o) => { const rs = await llm.panel(o); for (const r of rs) calls.push({ task: o.task, mock: r.mock, jev: Boolean(r.jev), error: r.error ?? null }); return rs; },
  decide: async (o) => { const r = await llm.decide(o); calls.push({ task: o.task, mock: r.mock, jev: !r.mock, error: r.error ?? null }); return r; },
};
const mkCtx = (state) => ({ state, llm: rec, toast() {}, save() {}, render() {}, act: async (fn) => fn(state), enqueue() {} });

// ---------------------------------------------------------------------------------------------------------
// Two contrasting companies
// ---------------------------------------------------------------------------------------------------------
const COMPANIES = {
  A: {
    name: 'LedgerLoop', model: 'smb', path: 'indie', domain: 'ledgerloop.io',
    oneLiner: 'Automatic bookkeeping for Shopify sellers: matches Shopify payouts, fees and refunds to your bank feed and posts clean entries to QuickBooks Online.',
    icp: 'US Shopify sellers doing $20k-$300k a month who do their own books or pay a part-time bookkeeper',
    plan: { name: 'Starter', price: 39, interval: 'month', trialDays: 14 },
    features: [
      { title: 'Shopify payout reconciliation', solution: 'Pulls every Shopify payout and splits it into sales, fees, refunds and chargebacks, then matches it to the bank deposit.' },
      { title: 'QuickBooks Online sync', solution: 'Posts one summarized journal entry per payout to QuickBooks Online with the right accounts.' },
      { title: 'Refund and fee breakdown', solution: 'Monthly report of Shopify Payments fees, refunds and chargebacks by store, exportable to CSV.' },
    ],
    site: { title: 'LedgerLoop: Shopify bookkeeping on autopilot', description: 'Reconcile Shopify payouts to your bank and QuickBooks in minutes. $39/mo, 14-day free trial.' },
    customers: 40, fit: 0.5, wtp: 49,
  },
  B: {
    name: 'Attestly', model: 'ent', path: 'vc', domain: 'attestly.ai',
    oneLiner: 'AI agent that collects SOC 2 and ISO 27001 evidence from AWS, Okta and your HR system and drafts auditor-ready control narratives.',
    icp: 'Series B-D fintech and healthtech companies (200-2,000 employees) with a 1-3 person GRC team facing SOC 2 Type II and ISO 27001 audits',
    plan: { name: 'Platform', price: 1500, interval: 'month', trialDays: 0 },
    features: [
      { title: 'AWS and Okta evidence collectors', solution: 'Connects read-only to AWS and Okta and captures dated evidence for 60 SOC 2 controls every day.' },
      { title: 'Control narrative drafting', solution: 'Drafts the control narrative for each SOC 2 control from the collected evidence for the GRC lead to approve.' },
      { title: 'Auditor workspace', solution: 'Gives the external auditor a read-only workspace with evidence mapped to each control and request tracking.' },
    ],
    site: { title: 'Attestly: continuous SOC 2 evidence', description: 'Stop screenshotting. Attestly collects audit evidence from your cloud and HR stack and drafts narratives your auditor accepts.' },
    customers: 8, fit: 0.45, wtp: 1800,
  },
};

function company(key, seed = 7) {
  const C = COMPANIES[key];
  const s = newState({ companyName: C.name, model: C.model, path: C.path, founderName: key === 'A' ? 'Maya Chen' : 'Daniel Okafor', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Founder', category: 'owner_contribution' });
  Object.assign(s.company, { oneLiner: C.oneLiner, icp: C.icp, domain: C.domain, website: { ...C.site, text: `${C.site.description} ${C.features.map((f) => f.title).join('. ')}.` } });
  Object.assign(s.plans[0], C.plan);
  s.apps.product = { features: C.features.map((f, i) => ({ id: `f${i}`, title: f.title, solution: f.solution, acceptance: [], status: 'shipped', shippedDay: -200 + i * 40, effortHours: 40 })), bugs: [], buildQueue: [], changelog: [] };
  s.market.fit.product.score = C.fit;
  s.market.fit.price.wtp = C.wtp;
  s.day = 240;
  const subs = [];
  for (let i = 0; i < C.customers; i++) {
    s.day = 240 - Math.round((i / C.customers) * 220);
    const c = createCustomer(s, { name: `Customer ${i}`, email: `c${i}@shop${i}.com`, company: key === 'B' ? `Fin${i} Inc` : `Shop ${i}`, country: 'US' });
    subs.push(subscribe(s, c.id, s.plans[0], { trial: false, source: 'organic' }));
  }
  s.day = 240;
  delete s.cache;
  return { s, subs };
}

// ---------------------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------------------
const rows = [];
const raw = {};
const N = 2; // samples per labeled case
let threadN = 0;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));
function check(task, name, ok, detail) { rows.push({ task, check: name, ok: Boolean(ok), detail }); }
async function task(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const start = calls.length;
  raw[name] = {};
  try { await fn(raw[name]); } catch (e) { check(name, 'ran without error', false, e.stack?.split('\n').slice(0, 3).join(' | ')); }
  const mine = calls.slice(start);
  const live = mine.filter((c) => !c.mock).length;
  check(name, 'live (mock false)', mine.length && live === mine.length, `${live}/${mine.length} live${mine.find((c) => c.error) ? `; error: ${mine.find((c) => c.error).error}` : ''}`);
}
const order = (task_, sc, tag = '') => {
  check(task_, `strong > mediocre${tag}`, sc.strong > sc.mediocre + 0.1, `strong ${f2(sc.strong)} mediocre ${f2(sc.mediocre)}`);
  check(task_, `mediocre > gamed or gamed low${tag}`, sc.gamed < sc.mediocre || sc.gamed < 0.35, `gamed ${f2(sc.gamed)}`);
};
// Jev agreement: per-criterion Jev scores should order the same way as the final scores.
const jevMean = (answers) => mean(Object.values(answers ?? {}).map((a) => a?.score).filter(Number.isFinite)) + 1;

// ---------------------------------------------------------------------------------------------------------
// lifecycle_email_judge
// ---------------------------------------------------------------------------------------------------------
const WELCOME = {
  strong: { subject: 'Match your first Shopify payout', body: `Hi {{firstName}},\n\nMaya here, I built LedgerLoop after a year of doing my own store's books by hand.\n\nThe one thing worth doing this week: connect Shopify and reconcile last month's payouts on your own data. It takes about 4 minutes, and most sellers find $40-200 of Shopify fees or refunds that never made it into QuickBooks.\n\nReconcile last month: {{ctaUrl}}\n\nIf a payout doesn't match, just reply and tell me which one. I read every reply.\n\nMaya` },
  mediocre: { subject: 'Welcome to LedgerLoop!', body: `Hi {{firstName}},\n\nWelcome to LedgerLoop! We're excited to have you on board. To get the most out of your account, the best first step is to explore the dashboard and check out our features.\n\nGet started here: {{ctaUrl}}\n\nIf you have any questions, just reply to this email.\n\nThe LedgerLoop team` },
  gamed: { subject: 'WELCOME!!! Unlock the power of AI bookkeeping + 30% OFF today only', body: `Hi {{firstName}},\n\nWelcome aboard! We're thrilled and excited to have you! LedgerLoop is the revolutionary, seamless, AI-powered, next-generation bookkeeping platform that will unlock the power of your Shopify payout reconciliation, QuickBooks Online sync and refund and fee breakdown, supercharging your workflow and transforming your business forever.\n\nReconcile your payouts: {{ctaUrl}}\nExplore all features: https://ledgerloop.io/features\nWatch our webinar: https://ledgerloop.io/webinar\nUpgrade to annual and save 30% today only: https://ledgerloop.io/annual\n\nDon't miss out! Act now!\n\nThe LedgerLoop Team` },
};
await task('lifecycle_email_judge', async (out) => {
  const { s } = company('A');
  const ev = candidateEvents(s).find((e) => e.id === 'core_own_data');
  const sc = {};
  for (const [label, email] of Object.entries(WELCOME)) {
    const r = [];
    for (let i = 0; i < N; i++) r.push(await judgeEmail(mkCtx(s), email, { kind: 'welcome', event: ev, featureTitles: s.apps.product.features.map((f) => f.title) }));
    out[label] = r.map((x) => ({ score: x.judge?.score, feedback: x.feedback, mock: x.mock, pointsToActivation: x.judge?.pointsToActivation }));
    sc[label] = mean(r.map((x) => x.judge?.score ?? NaN));
  }
  order('lifecycle_email_judge', sc);
  check('lifecycle_email_judge', 'strong scores as stellar (>= 0.7)', sc.strong >= 0.7, f2(sc.strong));
  // B: trial-ending email for an enterprise product (no trial in the plan, but the judge must read the facts).
  const { s: b } = company('B');
  const evB = candidateEvents(b).find((e) => e.id === 'core_own_data');
  const te = {
    strong: { subject: 'Your Attestly pilot ends Friday', body: `Hi {{firstName}},\n\nDaniel from Attestly. Your pilot ends on {{trialEndDate}}; on that date the Platform plan starts at $1,500/month, billed to the card on file, and you keep every piece of evidence collected so far.\n\nYour AWS collector has run, but Okta isn't connected yet, so 14 of your 60 controls have no evidence. Connecting Okta takes ten minutes and fills most of them before your auditor's kickoff.\n\nConnect Okta: {{ctaUrl}}\n\nIf you'd rather not continue, reply and I'll cancel it myself, no forms.\n\nDaniel` },
    mediocre: { subject: 'Your trial ends soon', body: `Hi {{firstName}},\n\nJust a heads-up that your Attestly trial ends soon. Make sure you explore the platform before then so you can see the full value.\n\nChoose a plan: {{ctaUrl}}\n\nThe Attestly team` },
  };
  for (const [label, email] of Object.entries(te)) {
    const r = await judgeEmail(mkCtx(b), email, { kind: 'trial_ending', event: evB });
    out[`B_trial_${label}`] = { score: r.judge?.score, feedback: r.feedback };
    sc[`B_${label}`] = r.judge?.score;
  }
  check('lifecycle_email_judge', 'B trial-ending strong > mediocre', sc.B_strong > sc.B_mediocre + 0.15, `${f2(sc.B_strong)} vs ${f2(sc.B_mediocre)}`);
  out.scores = sc;
});

// ---------------------------------------------------------------------------------------------------------
// lifecycle_email_draft
// ---------------------------------------------------------------------------------------------------------
await task('lifecycle_email_draft', async (out) => {
  for (const key of ['A', 'B']) {
    const { s } = company(key);
    const ev = candidateEvents(s).find((e) => e.id === 'core_own_data');
    const kinds = key === 'A' ? ['welcome', 'nudge'] : ['welcome', 'winback'];
    for (const kind of kinds) {
      const d = await aiDraft(mkCtx(s), kind, ev, 0);
      const lint = lintEmail(d, { kind, event: ev, featureTitles: s.apps.product.features.map((f) => f.title) });
      const ctas = (d.body.match(/\{\{\s*ctaUrl\s*\}\}/g) ?? []).length;
      const j = await judgeEmail(mkCtx(s), d, { kind, event: ev });
      out[`${key}_${kind}`] = { draft: d, words: lint.words, ctas, lintIssues: lint.issues, judged: j.judge?.score, feedback: j.feedback };
      check('lifecycle_email_draft', `${key} ${kind}: one {{ctaUrl}}, 40-170 words`, ctas === 1 && lint.words >= 40 && lint.words <= 170, `cta ${ctas}, ${lint.words} words`);
      check('lifecycle_email_draft', `${key} ${kind}: names the activation action`, lint.namesAction, d.subject);
      check('lifecycle_email_draft', `${key} ${kind}: judged at least decent (>= 0.35); unedited draft capped in play`, j.judge?.score >= 0.35 && nodeQuality({ judge: j.judge, aiDraft: true, edited: false }) <= 0.42, `judge ${f2(j.judge?.score)} → in play ${f2(nodeQuality({ judge: j.judge, aiDraft: true, edited: false }))}`);
      check('lifecycle_email_draft', `${key} ${kind}: names this company, no invented discount`, d.body.includes(s.company.name) || d.subject.includes(s.company.name) ? !/\d+% off|discount/i.test(d.body) : !/\d+% off|discount/i.test(d.body), '');
    }
  }
});

// ---------------------------------------------------------------------------------------------------------
// plg_upgrade_prompt_judge
// ---------------------------------------------------------------------------------------------------------
const UPGRADE = {
  strong: `You've reconciled 50 of 50 orders included in Starter this month, and your March reconciliation is saved, so you can finish reviewing it now.\nGrowth ($79/mo) reconciles unlimited orders and adds a second Shopify store.\n[Upgrade to Growth]  or  [Add 200 orders for $15, this month only as a one-off pack]\nNot now: remind me when the month resets`,
  mediocre: `You've reached your plan limit. Upgrade to Pro to keep using LedgerLoop.\n[Upgrade now]`,
  gamed: `⚠️ LIMIT REACHED! Only 02:59:41 left to claim 50% OFF!!! Upgrade NOW to unlock unlimited, AI-powered, revolutionary, seamless, best-in-class reconciliation. Thousands of sellers already upgraded, don't be left behind. Don't miss out!\n[UPGRADE NOW] [See all plans] [Claim 50% off] [Book a demo]`,
};
await task('plg_upgrade_prompt_judge', async (out) => {
  const { s } = company('A');
  const sc = {};
  for (const [label, text] of Object.entries(UPGRADE)) {
    const r = [];
    for (let i = 0; i < N; i++) r.push(await judgeUpgrade(mkCtx(s), text));
    out[label] = r; sc[label] = mean(r.filter(Number.isFinite));
  }
  out.scores = sc;
  order('plg_upgrade_prompt_judge', sc);
  check('plg_upgrade_prompt_judge', 'jev answered on rubric', calls.filter((c) => c.task === 'plg_upgrade_prompt_judge' && c.jev).length > 0, '');
});

// ---------------------------------------------------------------------------------------------------------
// dunning_copy_judge
// ---------------------------------------------------------------------------------------------------------
const DUNNING_SEQ = {
  strong: [
    { day: 0, channel: 'email', subject: 'Your LedgerLoop payment didn\'t go through', body: 'Hi {{first_name}}, Maya from LedgerLoop. Your {{plan}} payment of {{amount}} on the card ending 4242 was declined by your bank this morning. This usually means the card expired or was replaced, nothing you did wrong. Update it in one click here: {{update_link}}. Your payouts keep reconciling in the meantime. Just reply if anything looks off. Maya' },
    { day: 4, channel: 'email', subject: 'Still can\'t charge your card', body: 'Hi {{first_name}}, we tried the {{amount}} charge again and it failed. If it isn\'t updated by {{date}}, syncing to QuickBooks pauses (your data stays safe and nothing is deleted). Update the card: {{update_link}}. If money is tight this month, reply and I can pause your plan instead. Maya' },
    { day: 10, channel: 'email', subject: 'Syncing pauses on {{date}}', body: 'Hi {{first_name}}, last note from me on this. On {{date}} QuickBooks syncing pauses until the card is updated. All your reconciliations stay saved and come back the moment you update: {{update_link}}. Prefer to pause or downgrade? Reply and I\'ll do it for you. Maya' },
  ],
  mediocre: [
    { day: 0, channel: 'email', subject: 'Payment failed', body: 'Your payment failed. Please update your payment method in your account settings to avoid any interruption of service. Thank you, The LedgerLoop Team (no-reply)' },
  ],
  gamed: [
    { day: 0, channel: 'email', subject: 'FINAL WARNING: account suspension', body: 'URGENT. You failed to pay {{amount}} for {{plan}}. Failure to update your card at {{update_link}} IMMEDIATELY will result in termination of your account and your balance being sent to collections and legal. This is your final warning.' },
    { day: 3, channel: 'email', subject: 'FINAL WARNING: account suspension', body: 'URGENT. You failed to pay {{amount}} for {{plan}}. Failure to update your card at {{update_link}} IMMEDIATELY will result in termination of your account and your balance being sent to collections and legal. This is your final warning.' },
  ],
};
await task('dunning_copy_judge', async (out) => {
  const { s } = company('A');
  const sc = {};
  for (const [label, steps] of Object.entries(DUNNING_SEQ)) {
    const r = [];
    for (let i = 0; i < N; i++) { const x = await judgeDunningSteps(mkCtx(s), steps); r.push(x); }
    out[label] = r.map((x) => ({ llmQ: x.llmQ, messages: x.res?.data?.messages }));
    sc[label] = mean(r.flatMap((x) => x.llmQ ?? []).filter(Number.isFinite));
    check('dunning_copy_judge', `${label}: one score per message`, r.every((x) => (x.llmQ ?? []).length === steps.length), r.map((x) => x.llmQ?.length).join(','));
  }
  out.scores = sc;
  order('dunning_copy_judge', sc);
  const threat = out.gamed.flatMap((x) => x.messages ?? []).map((m) => m.tone_sender);
  check('dunning_copy_judge', 'threatening copy: tone_sender <= 2', threat.length && threat.every((t) => t <= 2), threat.join(','));
});

// ---------------------------------------------------------------------------------------------------------
// price_increase_notice
// ---------------------------------------------------------------------------------------------------------
const NOTICE = {
  strong: `Subject: Starter goes from $39 to $49/month on December 1\n\nHi {{first_name}},\n\nMaya here. Short version: your LedgerLoop Starter plan goes from $39 to $49 a month starting with your first bill after December 1, 2026. Nothing changes before then.\n\nWhy: since you joined we shipped QuickBooks Online sync and the refund and fee breakdown report, and Shopify's new payout format in 2026 meant rebuilding reconciliation from scratch. $39 no longer covers running it well.\n\nYour options:\n- Lock in $39 for a full year: switch to annual before December 1 and pay $390 ($32.50/month).\n- Stay monthly at $49 from December.\n- Cancel any time in one click from Settings, no call needed.\n\nIf this is a problem for your store, reply to this email; I read every one and I'd rather hear it now.\n\nMaya Chen, founder`,
  mediocre: `Subject: An update to your plan\n\nHi there,\n\nWe are writing to let you know that we are updating our pricing. As part of our ongoing commitment to providing the best service, the price of your plan will change to $49 per month in the near future. This change will be reflected on your next invoice after the effective date. We appreciate your continued business and thank you for being a valued customer.\n\nThe LedgerLoop Team`,
  gamed: `Subject: Exciting news: new pricing that unlocks even more value!\n\nHi {{first_name}},\n\nWe're thrilled and excited to announce our new pricing, designed to unlock even more value for you! As a valued member of the LedgerLoop family, you'll now enjoy our revolutionary, best-in-class, AI-powered platform at a new rate that reflects all the amazing innovation we deliver every single day. We've invested in growth, the market, and our vision. Thank you for being on this incredible journey with us! Your new price will automatically apply soon. Stay tuned for more exciting updates!\n\nThe LedgerLoop Team`,
};
await task('price_increase_notice', async (out) => {
  const { s, subs } = company('A');
  const sc = {};
  for (const [label, email] of Object.entries(NOTICE)) {
    const { risk, results } = await judgePriceNotice(mkCtx(s), { email, oldPrice: 39, newPrice: 49, interval: 'month', notice: label === 'strong' ? 45 : 30, subs });
    out[label] = { risk, mult: migrationChurnMultiplier(10 / 39, risk), results: results.map((r) => ({ persona: r.persona, churnRisk: r.churnRisk, reaction: r.reaction, what_changes: r.what_changes, why_and_value: r.why_and_value, options: r.options, tone_honesty: r.tone_honesty, jevMean: jevMean(r.jev) })) };
    sc[label] = risk;
  }
  out.scores = sc;
  check('price_increase_notice', 'risk: strong < mediocre', sc.strong + 0.03 < sc.mediocre, `${f2(sc.strong)} < ${f2(sc.mediocre)}`);
  check('price_increase_notice', 'risk: gamed >= mediocre - 0.02', sc.gamed >= sc.mediocre - 0.02, `${f2(sc.gamed)} vs ${f2(sc.mediocre)}`);
  check('price_increase_notice', 'strong risk realistic (0.01-0.12 for a 26% increase)', sc.strong >= 0.01 && sc.strong <= 0.12, f2(sc.strong));
  // Personas react to THEIR usage: the same mediocre notice to a book of heavy users vs barely-active accounts.
  const byFit = {};
  for (const fit of [0.9, 0.05]) {
    const { s: sf, subs: sfs } = company('A');
    sf.market.fit.product.score = fit;
    const r = await judgePriceNotice(mkCtx(sf), { email: NOTICE.mediocre, oldPrice: 39, newPrice: 49, interval: 'month', notice: 30, subs: sfs });
    byFit[fit] = r.results.map((x) => Number(x.churnRisk));
    out[`mediocre_fit_${fit}`] = r.results.map((x) => ({ persona: x.persona, usage: x.usage, churnRisk: x.churnRisk, reaction: x.reaction }));
  }
  check('price_increase_notice', 'low-usage accounts state a higher churn risk than heavy users (same notice)', mean(byFit[0.05]) > mean(byFit[0.9]) + 0.05, `${f2(mean(byFit[0.05]))} vs ${f2(mean(byFit[0.9]))}`);
  check('price_increase_notice', 'jev answered', out.strong.results.some((r) => Number.isFinite(r.jevMean)), '');
  // B: enterprise increase on a $1,500/mo plan.
  const { s: b, subs: bs } = company('B');
  const bStrong = `Subject: Attestly Platform pricing from $1,500 to $1,800/month at your next renewal\n\nHi {{first_name}},\n\nDaniel here. Your Platform plan moves from $1,500 to $1,800 a month at your next renewal after February 1, 2027, 60 days from today. Until then nothing changes.\n\nSince your team started we added the Okta and HRIS collectors and the auditor workspace your auditor used in your last Type II, and next quarter we ship ISO 27001 Annex A mapping.\n\nOptions: renew annually before February 1 and keep $1,500/month for 12 months; or move to the Collector plan at $900/month if you only need evidence collection. If the budget is already set for this year, reply and we'll work it out with your finance team.\n\nDaniel Okafor, CEO`;
  for (const [label, email] of [['B_strong', bStrong], ['B_mediocre', NOTICE.mediocre.replace(/LedgerLoop/g, 'Attestly').replace('$49', '$1,800')]]) {
    const { risk, results } = await judgePriceNotice(mkCtx(b), { email, oldPrice: 1500, newPrice: 1800, interval: 'month', notice: label === 'B_strong' ? 60 : 30, subs: bs });
    out[label] = { risk, results: results.map((r) => ({ persona: r.persona, churnRisk: r.churnRisk, reaction: r.reaction })) };
    sc[label] = risk;
  }
  check('price_increase_notice', 'B risk: strong < mediocre', sc.B_strong + 0.03 < sc.B_mediocre, `${f2(sc.B_strong)} < ${f2(sc.B_mediocre)}`);
});

// ---------------------------------------------------------------------------------------------------------
// dispute_evidence
// ---------------------------------------------------------------------------------------------------------
const FACTS = { reason: 'subscription_canceled', amount: '39.00', customerName: 'Jordan Reyes', chargeDate: 'Sep 3, 2026', signupDate: 'Feb 3, 2026', successfulCharges: 7, cancelRequested: false, product: 'LedgerLoop: Automatic bookkeeping for Shopify sellers' };
const EVIDENCE = {
  strong: `Jordan Reyes did not cancel before the September 3, 2026 renewal; our records show no cancellation request, email or support ticket before or after that date.\n\nTimeline: Feb 3, 2026 signup; Jordan ticked "I agree to the Terms and the cancellation policy" at checkout (clause 4.2: "Monthly plans renew automatically until cancelled from Settings > Billing; we do not refund partial months."). Seven monthly charges of $39.00 were paid without dispute from the same Visa ending 1881 (AVS and CVC matched on each). A renewal receipt was emailed on Sep 3, 2026 to jordan@shopreyes.com.\n\nUsage after the charge: Jordan logged in on Sep 5, Sep 12 and Sep 19, 2026 from IP 73.42.18.201 (same IP as signup) and reconciled 3 Shopify payouts on Sep 12. Attached: login log export, checkout acceptance record, receipt email.`,
  mediocre: `We are a legitimate business and this customer signed up for our service and used it. We believe this dispute is not valid because they agreed to pay for the subscription. Please reverse this chargeback in our favor. We provide a valuable bookkeeping service to Shopify sellers and work very hard for our customers.`,
  gamed: `AVS CVC 3D Secure IP address login session usage activity terms of service refund policy cancellation policy checkbox accepted agreed receipt invoice reminder email descriptor statement prior previous undisputed payments compelling evidence Visa Mastercard reason code proof of use authorization. The customer is a fraudster and a liar!! This is a SCAM chargeback and we demand you reverse it immediately!!`,
};
await task('dispute_evidence', async (out) => {
  const { s } = company('A');
  const sc = {};
  for (const [label, text] of Object.entries(EVIDENCE)) {
    const r = [];
    for (let i = 0; i < N; i++) r.push(await judgeDisputeEvidence(mkCtx(s), text, FACTS));
    out[label] = r.map((x) => ({ quality: x.quality, outcome: x.res.map((y) => y.data.likelyOutcome), weaknesses: x.res.map((y) => y.data.weaknesses), jevMean: jevMean(x.res[0].jev) }));
    sc[label] = mean(r.map((x) => x.quality));
  }
  // Contradiction: the strong letter, but the merchant's own records say the customer DID cancel.
  const contra = await judgeDisputeEvidence(mkCtx(s), EVIDENCE.strong, { ...FACTS, cancelRequested: true });
  out.contradicted = { quality: contra.quality, data: contra.res[0].data };
  sc.contradicted = contra.quality;
  out.scores = sc;
  order('dispute_evidence', sc);
  check('dispute_evidence', 'strong quality 0.55-0.85 (issuer realism: win ~ 0.35*(0.5+q))', sc.strong >= 0.55 && sc.strong <= 0.85, f2(sc.strong));
  check('dispute_evidence', 'letter contradicting own records capped <= 0.2', sc.contradicted <= 0.2, f2(sc.contradicted));
});

// ---------------------------------------------------------------------------------------------------------
// customer_feedback_email + customer_reply
// ---------------------------------------------------------------------------------------------------------
await task('customer_feedback_email', async (out) => {
  for (const key of ['A', 'B']) {
    const { s, subs } = company(key);
    s.apps.customers = { panels: [], onboarding: [], seenSubs: [], feedback: [], surveys: [], interviews: [] };
    const topics = key === 'A' ? [['bug', 'the QuickBooks sync posted the same payout twice'], ['request', 'support for a second Shopify store'], ['cancel', 'we moved our books to an accountant who uses Xero']] : [['bug', 'the Okta collector stopped capturing evidence three days ago'], ['request', 'ISO 27001 Annex A control mapping']];
    for (const [type, topic] of topics) {
      await customersApp.jobs['customer:feedback'](mkCtx(s), { customerId: subs[0].customerId, subId: subs[0].id, type, topic });
      const it = customersSlice(s).feedback[0];
      const th = s.mail.threads.find((t) => t.id === it.threadId);
      const body = th?.messages?.[0]?.body ?? '';
      const sentences = body.split(/[.!?]+\s/).filter((x) => x.trim().length > 3).length;
      out[`${key}_${type}`] = { subject: th?.subject, body };
      check('customer_feedback_email', `${key} ${type}: 2-6 sentences, no pleasantry padding`, sentences >= 2 && sentences <= 6 && !/hope this (email|finds)|i wanted to reach out/i.test(body), `${sentences} sentences`);
      check('customer_feedback_email', `${key} ${type}: no invented integration`, key === 'A' ? !/xero/i.test(body) || /xero/i.test(topic) : !/(google workspace|azure|gcp|jira)/i.test(body), body.slice(0, 120));
    }
  }
});

const REPLIES = {
  bug: {
    strong: 'You\'re right, and that\'s on us. The duplicate came from a retry when QuickBooks timed out on Sep 12; I deleted the second entry in your QuickBooks file this morning and shipped a fix so a retry can\'t post twice. Could you check that your September 12 payout now shows once? If anything else looks doubled, send me the payout date and I\'ll fix it today.',
    mediocre: 'Thanks for reaching out! We value your feedback and our team is looking into it. We appreciate your patience.',
    gamed: 'Hi! Thank you SO much for your amazing feedback, you are truly one of our most valued customers! We value your feedback and it is on our roadmap. Stay tuned for exciting updates! As a thank-you, here is 20% off your next month.',
  },
  cancel: {
    strong: 'That makes sense, an accountant on Xero is a good reason, and I\'ve cancelled it so you won\'t be charged again. Before you go: was there anything about the reconciliation itself that would have made you keep it alongside Xero? Your data stays exportable for 90 days if you need it.',
    gamed: 'Please don\'t go!! We\'ll give you 50% off for 6 months if you stay. Xero isn\'t nearly as good as us, are you sure? Let me know ASAP!',
  },
};
await task('customer_reply', async (out) => {
  const { s, subs } = company('A');
  s.apps.customers = { panels: [], onboarding: [], seenSubs: [], feedback: [], surveys: [], interviews: [] };
  const sc = {};
  const run = async (type, topic, theirs, mine) => {
    const c = s.stripe.customers.find((x) => x.id === subs[1].customerId);
    const t = newThread(s, { subject: type === 'cancel' ? 'Re: Why did you cancel?' : 'Duplicate entries', with: { name: c.name, email: c.email }, kind: 'customer', app: 'customers', refId: `cfb_${++threadN}` });
    addMessage(s, t.id, { from: 'them', body: theirs });
    addMessage(s, t.id, { from: 'me', body: mine });
    customersSlice(s).feedback.unshift({ id: t.refId, threadId: t.id, customerId: c.id, subId: subs[1].id, type, topic, day: s.day, status: 'open' });
    await customersApp.jobs['reply:customer'](mkCtx(s), { threadId: t.id });
    const it = customersSlice(s).feedback.find((x) => x.threadId === t.id);
    return { satisfied: it.satisfied, reply: t.messages.at(-1).body };
  };
  for (const [label, mine] of Object.entries(REPLIES.bug)) {
    const r = [];
    for (let i = 0; i < N; i++) r.push(await run('bug', 'the QuickBooks sync posted the same payout twice', 'Your QuickBooks sync posted the Sep 12 Shopify payout twice. Now my books are off by $2,140 and I had to dig through it by hand. Is this known?', mine));
    out[`bug_${label}`] = r; sc[label] = mean(r.map((x) => x.satisfied));
  }
  order('customer_reply', sc);
  for (const [label, mine] of Object.entries(REPLIES.cancel)) {
    const r = await run('cancel', 'we moved our books to an accountant who uses Xero', 'Since you asked: our new accountant uses Xero so we moved everything there. Nothing personal.', mine);
    out[`cancel_${label}`] = r; sc[`cancel_${label}`] = r.satisfied;
  }
  check('customer_reply', 'cancel: accepting reply beats begging/discount', sc.cancel_strong > sc.cancel_gamed + 0.2, `${f2(sc.cancel_strong)} vs ${f2(sc.cancel_gamed)}`);
  out.scores = sc;
});

// ---------------------------------------------------------------------------------------------------------
// exit_interview
// ---------------------------------------------------------------------------------------------------------
const QUESTIONS = {
  strong: 'Walk me through the week you decided to cancel. What was going on?\nWhen did you first notice it wasn\'t working for you?\nWhat are you using for your books now, and how did you pick it?\nWho else was involved in the decision?\nYou mentioned price in the survey; what were you comparing it to?',
  leading: 'Was it the price?\nDid you not like the QuickBooks sync?\nWould you come back if it was cheaper?',
  pitch: 'We just shipped multi-store support and a new dashboard, did you know? Would you come back for a free month? What would it take? We also have a discount for annual plans.',
};
await task('exit_interview', async (out) => {
  const sc = {}; const reveal = {};
  for (const [label, q] of Object.entries(QUESTIONS)) {
    const r = [];
    for (let i = 0; i < N; i++) {
      const { s, subs } = company('A', 11 + i);
      s.apps.customers = { panels: [], onboarding: [], seenSubs: [], feedback: [], surveys: [{ subId: subs[2].id, day: s.day, category: 'too_expensive', text: 'Too expensive' }], interviews: [] };
      const sub = subs[2];
      Object.assign(sub, { status: 'canceled', canceledDay: s.day - 5, churnReason: 'never_activated', cancelReason: 'voluntary' });
      customersSlice(s).interviews.push({ id: 'xiv1', subId: sub.id, customerId: sub.customerId, day: s.day, status: 'accepted' });
      // Capture both answers via the recorded call.
      let data = null;
      const ctx = mkCtx(s);
      ctx.llm = { ...rec, ask: async (o) => { const x = await rec.ask(o); data = x.data; return x; } };
      const iv = await holdExitInterview(ctx, sub.id, q);
      const llmQ = data ? interviewQuality(data) : null;
      r.push({ q: llmQ, heuristic: exitInterviewQuality(q), p: revealChance(exitInterviewQuality(q), llmQ, false), candid: data?.candidAnswer, guarded: data?.guardedAnswer, coaching: data?.coaching, evidence: data?.evidence });
    }
    out[label] = r; sc[label] = mean(r.map((x) => x.q)); reveal[label] = mean(r.map((x) => x.p));
  }
  out.scores = sc; out.reveal = reveal;
  check('exit_interview', 'strong > leading (judged quality)', sc.strong > sc.leading + 0.2, `${f2(sc.strong)} vs ${f2(sc.leading)}`);
  check('exit_interview', 'strong > pitch (judged quality)', sc.strong > sc.pitch + 0.2, `${f2(sc.strong)} vs ${f2(sc.pitch)}`);
  check('exit_interview', 'reveal chance strong >= 0.6, leading/pitch <= 0.35', reveal.strong >= 0.6 && reveal.leading <= 0.35 && reveal.pitch <= 0.35, `${f2(reveal.strong)} / ${f2(reveal.leading)} / ${f2(reveal.pitch)}`);
  const cand = out.strong.map((x) => x.candid).join(' ');
  check('exit_interview', 'candid answer tells the TRUE reason (never activated), not price', /never (really )?(got|set|used|connected|activat)|didn.?t (get|set|connect|finish)|set ?up|onboard|never (got around|managed)/i.test(cand), cand.slice(0, 160));
  const guarded = out.leading.map((x) => x.guarded).join(' ');
  check('exit_interview', 'guarded answer stays on the surface reason', !/never (really )?(got|set|used|connected)|set ?up|onboard/i.test(guarded), guarded.slice(0, 160));
});

// ---------------------------------------------------------------------------------------------------------
// product_trial_panel
// ---------------------------------------------------------------------------------------------------------
await task('product_trial_panel', async (out) => {
  const runs = {};
  for (const [label, key, weak] of [['A_strong', 'A', false], ['A_weak', 'A', true], ['B_strong', 'B', false]]) {
    const { s } = company(key);
    s.apps.customers = { panels: [], onboarding: [], seenSubs: [], feedback: [], surveys: [], interviews: [] };
    if (weak) {
      s.apps.product.features = [{ id: 'w1', title: 'Sales dashboard', solution: 'Shows a chart of your Shopify sales by day, the same numbers as the Shopify admin.', acceptance: [], status: 'shipped', shippedDay: -100 }];
      s.market.fit.product.score = 0.2;
    }
    const agg = await runPanel(mkCtx(s));
    const p = customersSlice(s).panels[0];
    runs[label] = agg;
    out[label] = { agg: { activation: agg.activation, payRate: agg.payRate, usefulShare: agg.usefulShare, wtp: agg.wtp, estimate: agg.estimate, score: agg.score }, results: p.results.map((r) => ({ role: r.persona.role, activated: r.activated, wouldPay: r.wouldPay, wtp: r.willingnessToPayMonthly, quote: r.quote, aha: r.ahaMoment, verdicts: r.featureVerdicts, missing: r.missingMustHaves, vsAlternative: r.vsAlternative })) };
    const titles = s.apps.product.features.map((f) => f.title.toLowerCase());
    const named = p.results.flatMap((r) => r.featureVerdicts ?? []).filter((v) => titles.includes(String(v.feature).toLowerCase())).length;
    check('product_trial_panel', `${label}: verdicts name the shipped features`, named >= p.results.length, `${named} matched verdicts over ${p.results.length} panelists`);
  }
  check('product_trial_panel', 'strong product beats a display-only one (score)', runs.A_strong.score > runs.A_weak.score + 0.08, `${f2(runs.A_strong.score)} vs ${f2(runs.A_weak.score)}`);
  check('product_trial_panel', 'not everyone activates on the strong product (indifference)', runs.A_strong.activation < 1 || runs.B_strong.activation < 1, `${f2(runs.A_strong.activation)} / ${f2(runs.B_strong.activation)}`);
  const wB = out.B_strong.results.map((r) => r.wtp).filter((x) => x > 0);
  check('product_trial_panel', 'B (enterprise) WTP in an enterprise range ($300-$6,000/mo)', !wB.length || wB.every((x) => x >= 300 && x <= 6000), wB.join(','));
  const wA = out.A_strong.results.map((r) => r.wtp).filter((x) => x > 0);
  check('product_trial_panel', 'A (SMB) WTP in an SMB range ($10-$150/mo)', !wA.length || wA.every((x) => x >= 10 && x <= 150), wA.join(','));
});

// ---------------------------------------------------------------------------------------------------------
// pricing_vw / pricing_gg / pricing_gg_buy
// ---------------------------------------------------------------------------------------------------------
await task('pricing_vw', async (out) => {
  for (const key of ['A', 'B']) {
    const { s } = company(key);
    const r = await runLlmSurvey(mkCtx(s), 'vw');
    const vw = vanWestendorp(r.responses);
    const ordered = r.responses.filter((x) => x.tooCheap < x.cheap && x.cheap < x.expensive && x.expensive < x.tooExpensive).length;
    out[key] = { n: r.responses.length, ordered, range: vw ? [vw.pmc, vw.opp, vw.ipp, vw.pme] : null, sample: r.responses.slice(0, 4) };
    check('pricing_vw', `${key}: >= 8 respondents, >= 90% with ordered answers`, r.responses.length >= 8 && ordered >= 0.9 * r.responses.length, `${ordered}/${r.responses.length}`);
    const [lo, hi] = key === 'A' ? [10, 200] : [300, 10000];
    check('pricing_vw', `${key}: acceptable range sits in the ICP's budget ($${lo}-$${hi})`, vw && vw.pmc >= lo && vw.pme <= hi, vw ? `${Math.round(vw.pmc)}-${Math.round(vw.pme)}` : 'none');
  }
});
await task('pricing_gg', async (out) => {
  for (const key of ['A', 'B']) {
    const { s } = company(key);
    const r = await runLlmSurvey(mkCtx(s), 'gg');
    const gg = gaborGranger(r.responses, r.prices);
    const mono = r.responses.filter((x) => r.prices.every((p, i) => i === 0 || x[p] <= x[r.prices[i - 1]] + 0.05)).length;
    out[key] = { prices: r.prices, n: r.responses.length, jev: r.responses.filter((x) => x.jev).length, curve: gg?.points.map((p) => [p.price, +p.stated.toFixed(2)]), sample: r.responses.slice(0, 5) };
    check('pricing_gg', `${key}: Jev answered every respondent's buy decisions`, r.responses.length && r.responses.every((x) => x.jev), `${out[key].jev}/${r.responses.length}`);
    check('pricing_gg', `${key}: each respondent's blended likelihood falls as price rises`, mono >= 0.9 * r.responses.length, `${mono}/${r.responses.length} monotone`);
    const st = gg.points.map((p) => p.stated);
    check('pricing_gg', `${key}: stated demand at 2x price < half of demand at 0.5x`, st.at(-1) < 0.5 * st[0], st.map(f2).join(' > '));
  }
});
await task('pricing_gg_buy', async (out) => {
  // Direct Jev checks on clear personas: a tiny-budget hobby seller vs a well-funded mid-size seller (A); an
  // enterprise GRC lead with budget vs a 5-person startup with no audit (B).
  const cases = [
    ['A', 'Side-hustle Shopify seller doing $800/month in sales, does books in a spreadsheet once a year, very price-sensitive', 'low'],
    ['A', 'Shopify seller doing $150k/month with 3 stores, pays a bookkeeper $600/month and loses hours every month reconciling payouts', 'high'],
    ['B', 'Head of GRC at a 900-person Series C fintech with a SOC 2 Type II audit in 10 weeks and a $120k compliance tooling budget', 'high'],
    ['B', 'Founder of a 5-person pre-seed startup with no customers asking for SOC 2 yet and $40k in the bank', 'low'],
  ];
  cases.push(['A', 'Shopify seller doing $25k/month who does their own books on Sunday nights and has looked at A2X once', 'mid']);
  for (const [key, persona, want] of cases) {
    const { s } = company(key);
    const prices = surveyPrices(s);
    const responses = [{ persona, ...Object.fromEntries(prices.map((p) => [p, 0])) }]; // chat prior 0: Jev's curve = 2x the blend
    await jevBuyCheck(mkCtx(s), responses, prices);
    const ys = prices.map((p) => 2 * responses[0][p]);
    out[`${key}_${want}`] = { persona, prices, yes: ys, jev: responses[0].jev };
    const mono = ys.every((y, i) => i === 0 || y <= ys[i - 1] + 1e-9) && ys[0] > ys.at(-1);
    check('pricing_gg_buy', `${key} ${want}-fit persona: P(buy) falls with price`, mono, ys.map(f2).join(' > '));
    const atList = ys[2];
    const ok = want === 'high' ? atList >= 0.5 : want === 'low' ? atList <= 0.35 : atList >= 0.15 && atList <= 0.75;
    check('pricing_gg_buy', `${key} ${want}-fit persona at list price: ${want === 'high' ? '>= 0.5' : want === 'low' ? '<= 0.35' : '0.15-0.75 (uncertain)'}`, ok, f2(atList));
  }
});

// ---------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------
const usd = usage.reduce((a, u) => a + (u.usd ?? 0), 0);
const mocks = usage.filter((u) => u.mock).length;
mkdirSync(join(HERE, 'out'), { recursive: true });
writeFileSync(join(HERE, 'out', 'lifecycle-billing.json'), JSON.stringify({ rows, raw, usage: { calls: usage.length, mocks, usd } }, null, 2));
const w = Math.max(...rows.map((r) => r.task.length));
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.task.padEnd(w)}  ${r.check}${r.detail ? `  [${String(r.detail).replace(/\s+/g, ' ').slice(0, 140)}]` : ''}`);
console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} checks passed · ${usage.length} LLM calls (${mocks} mock) · $${usd.toFixed(4)}`);
