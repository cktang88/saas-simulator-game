// Live end-to-end checks for the SALES cluster's LLM tasks (cold email judge/reply, prospect thread, research,
// personalization, live sales call + scorecard, renewal negotiation, contract redlines, battlecards, world news,
// demo script, channels judges + replies). Needs the local proxy (npm start) with a key loaded.
// Run: node docs/review/llm-e2e/sales.mjs [section ...]   (not part of npm test; ~2-4 minutes, a few cents)
// Prints a pass/fail table and saves raw outputs to docs/review/llm-e2e/out/sales.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as llm from '../../../public/core/llm.js';
import { newState } from '../../../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../../../public/core/stripe.js';
import { seedDefaultStack } from '../../../public/core/bank.js';
import { ensureMarket } from '../../../public/core/market.js';
import { ensureCrm, ensureOutreach, addContact, createMeeting, nextSlot, ensureCommittee } from '../../../public/apps/sales/model.js';
import { judgeSequenceJob, coldReplyJob, prospectReplyJob, researchCompany, draftPersonalization } from '../../../public/apps/sales/jobs.js';
import { replyProbability, meetingProbability, tierFor, personaFor } from '../../../public/apps/sales/replies.js';
import { analyzeCopy, replyQuality, answersQuestion } from '../../../public/apps/sales/copy.js';
import { stepKey } from '../../../public/apps/sales/engine.js';
import { sayTurn, endCall } from '../../../public/apps/calls.js';
import { customerSays } from '../../../public/apps/success.js';
import { ensureSuccess, syncAccounts } from '../../../public/apps/success/engine.js';
import { redlineFeedback } from '../../../public/apps/legal/llm.js';
import { scoreRedlines } from '../../../public/apps/legal/redlines.js';
import { redlineCtx } from '../../../public/apps/legal/sim.js';
import { seedLandscape, fireEvent, eventById, ensureWorld } from '../../../public/apps/marketworld/engine.js';
import { writeNews, judgePage } from '../../../public/apps/marketworld/llm.js';
import { judgeDemo, scriptQuality, demoLift, DEMO } from '../../../public/apps/website/demo.js';
import { judgeArtifact, personaReply } from '../../../public/apps/channels/judge.js';
import { newThread, addMessage } from '../../../public/core/mail.js';
import { words } from '../../../public/core/util.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const usage = [];
// Keep the raw text of chat responses that fail to parse (truncation, prose), so failures are diagnosable.
const rawFailures = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const r = await realFetch(url, init);
  if (!String(url).endsWith('/api/llm')) return r;
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content;
  try { JSON.parse(String(content).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); } catch {
    const body = JSON.parse(init.body);
    rawFailures.push({ task: body.response_format?.json_schema?.name, finish: j.choices?.[0]?.finish_reason, maxTokens: body.max_tokens, completionTokens: j.usage?.completion_tokens, tail: String(content).slice(-200), len: String(content).length, head: String(content).slice(0, 300), reasoning: String(j.choices?.[0]?.message?.reasoning ?? "").length });
  }
  return { ok: r.ok, status: r.status, json: async () => j };
};
llm.configure({ base: 'http://localhost:3000', onUsage: (u) => usage.push(u) });
const live = await llm.checkServerKey();
if (!live || !llm.isLive()) { console.error('Proxy at localhost:3000 has no key; start the server first.'); process.exit(1); }

// ---------------------------------------------------------------------------
// Recording LLM wrapper + ctx
// ---------------------------------------------------------------------------
const calls = [];
const rec = {
  ...llm,
  ask: async (o) => { const r = await llm.ask(o); calls.push({ task: o.task, mock: r.mock, error: r.error, data: r.data, jev: r.jev ?? null, system: o.system?.slice(0, 4000), context: o.context, prompt: o.prompt?.slice(0, 3000) }); return r; },
  panel: async (o) => { const rs = await llm.panel(o); for (const r of rs) calls.push({ task: o.task, mock: r.mock, error: r.error, data: r.data, jev: r.jev ?? null, system: o.system?.slice(0, 4000), context: o.context, prompt: o.prompt?.slice(0, 3000) }); return rs; },
};
const ctxFor = (state) => ({ state, llm: rec, toast() {}, save() {}, render() {}, act: async (fn) => fn(state), enqueue() {} });
const lastCalls = (task, n = 1) => calls.filter((c) => c.task === task).slice(-n);

// ---------------------------------------------------------------------------
// Two contrasting companies
// ---------------------------------------------------------------------------
function companyA(seed = 11) { // indie B2B SMB: bookkeeping for Shopify sellers
  const s = newState({ companyName: 'Ledgerline', model: 'smb', path: 'indie', founderName: 'Sam Ortiz', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  Object.assign(s.company, { oneLiner: 'Automatic bookkeeping for Shopify sellers: matches Shopify, Faire and Stripe payouts to orders, fees and refunds', icp: 'Owner-run Shopify stores doing $20k-$300k/month, 1-10 staff, US', domain: 'ledgerline.app' });
  s.plans[0] = { ...s.plans[0], name: 'Pro', price: 39, interval: 'month', trialDays: 14, active: true };
  s.apps.product = { features: [
    { id: 'f1', title: 'Shopify payout reconciliation', problem: 'match each payout to orders, fees and refunds', status: 'shipped', shippedDay: 0 },
    { id: 'f2', title: 'Faire wholesale import', problem: 'import Faire payouts net of commission', status: 'shipped', shippedDay: 0 },
    { id: 'f3', title: 'Monthly P&L export to QuickBooks', status: 'shipped', shippedDay: 0 },
    { id: 'f4', title: 'Amazon seller import', status: 'planned' },
  ], bugs: [] };
  s.day = 120;
  return s;
}
function companyB(seed = 22) { // VC-backed seed: AI compliance evidence for mid-market fintech
  const s = newState({ companyName: 'Clausewise', model: 'ent', path: 'vc', founderName: 'Priya Raman', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  Object.assign(s.company, { oneLiner: 'AI agent that collects SOC 2 and PCI DSS audit evidence from AWS, Okta and Jira and drafts control narratives', icp: 'Mid-market fintechs (200-1,000 staff) with a 1-3 person compliance team facing SOC 2 + PCI audits', domain: 'clausewise.ai' });
  s.plans[0] = { ...s.plans[0], name: 'Growth', price: 18000, interval: 'year', trialDays: 0, active: true };
  s.apps.product = { features: [
    { id: 'f1', title: 'AWS + Okta evidence collection', problem: 'screenshots and exports for access reviews', status: 'shipped', shippedDay: 0 },
    { id: 'f2', title: 'Jira change-management evidence', status: 'shipped', shippedDay: 0 },
    { id: 'f3', title: 'Control narrative drafts', status: 'shipped', shippedDay: 0 },
    { id: 'f4', title: 'ISO 27001 mapping', status: 'planned' },
  ], bugs: [] };
  s.day = 200;
  return s;
}

const SITE_CANDLE = { synthetic: true, title: 'Harbor & Pine Candle Co. | Hand-poured soy candles from Portland, Maine', description: 'Small-batch soy candles. Now stocked in 40+ boutiques via Faire. Free US shipping over $50.', headings: ['Hand-poured in Portland, Maine since 2019', 'Wholesale: find us on Faire', 'Now shipping to Canada', 'We are hiring: part-time fulfillment help'], text: 'Harbor & Pine is a three-person studio. We sell on our Shopify store and wholesale to 40+ independent boutiques through Faire. Holiday orders ship by Dec 15. Returns within 30 days. Now shipping to Canada (duties included at checkout).' };
const SITE_DENTAL = { synthetic: true, title: 'Brightline Dental | Family dentistry in Tulsa', description: 'Cleanings, crowns and Invisalign for families in Tulsa, OK.', headings: ['New patients welcome', 'We accept most PPO plans', 'Meet Dr. Alvarez'], text: 'Brightline Dental is a two-dentist practice. Book online. We accept Delta Dental, Cigna and MetLife PPO plans. Saturday hours available.' };
const SITE_FINTECH = { synthetic: true, title: 'Northwind Pay | Card issuing and spend management for logistics companies', description: 'Corporate cards and expense automation for 2,000+ freight and logistics firms.', headings: ['PCI DSS Level 1 service provider', 'SOC 2 Type II', 'Now live in the EU (Dublin)', 'Careers: GRC Analyst, Senior Security Engineer'], text: 'Northwind Pay issues corporate cards for trucking and logistics companies. 420 employees across Chicago and Dublin. We are a PCI DSS Level 1 service provider and SOC 2 Type II audited. We just expanded to the EU and are hiring a GRC Analyst to support our audit program.' };

function prospect(s, { first, last, title, email, company, domain, site, industry, size }) {
  const { contact, company: co } = addContact(s, { firstName: first, lastName: last, title, email, company, domain, industry, size }, { source: 'manual' });
  co.site = site;
  return { contact, co };
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------
const rows = [];
const out = {};
function check(task, name, pass, detail = '') { rows.push({ task, name, pass: Boolean(pass), detail: String(detail).slice(0, 160) }); }
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const r2 = (x) => Math.round(x * 100) / 100;
const lc = (x) => String(x ?? '').toLowerCase();

// ---------------------------------------------------------------------------
// 1. cold_email_judge (+ implied reply / meeting rates)
// ---------------------------------------------------------------------------
const EMAILS_A = {
  strong: { subject: 'Faire payouts in your books', body: '{{personalization}}\n\nFaire pays out net of its commission, so matching those deposits to orders in QuickBooks is usually a manual month-end job. Ledgerline matches Shopify and Faire payouts to orders, fees and refunds automatically; a 3-person ceramics shop on the same setup went from a full day of reconciling to about 40 minutes a month.\n\nWorth a 15-minute look next week? If bookkeeping isn\'t on your plate, tell me and I won\'t follow up.\n\nSam' },
  mediocre: { subject: 'Quick question', body: 'Hi {{firstName}},\n\nI hope this email finds you well. I\'m the founder of Ledgerline, an accounting tool for e-commerce businesses. We help businesses like {{company}} save time on bookkeeping and get better visibility into their finances.\n\nWould you be open to a 30-minute demo this week to see how we can help?\n\nBest,\nSam' },
  gamed: { subject: '🚀 Revolutionize {{company}} finances!!!', body: 'Hi {{firstName}}! {{company}} is truly an inspiring, world-class brand and I love what {{company}} is doing, {{firstName}}! As {{company}} scales, {{company}} deserves a revolutionary, AI-powered, seamless, cutting-edge, all-in-one bookkeeping platform that will 10x your efficiency and unlock game-changing synergies. Ledgerline leverages next-gen AI to supercharge every workflow, empower your team, and deliver best-in-class, robust, effortless results. Our customers say it is the best tool ever built. Industry-leading. Guaranteed ROI. Free trial! Limited time offer! Book a demo here: https://cal.com/ledgerline/30min or reply, or check our deck at https://ledgerline.app/deck, or call me. Looking forward to connecting and exploring synergies, {{firstName}}!\n\nSam' },
};
const PERSO_A = 'Saw Harbor & Pine now wholesales to 40+ boutiques through Faire alongside the Shopify store.';
const EMAILS_B = {
  strong: { subject: 'GRC analyst req + PCI evidence', body: '{{personalization}}\n\nWith SOC 2 Type II and PCI Level 1 audits on one small team, the screenshot-and-export work for access reviews usually eats most of the quarter. Clausewise pulls that evidence from AWS, Okta and Jira and drafts the control narratives; a 300-person lender cut its evidence collection from about 120 hours to 25 per audit.\n\nOpen to comparing notes for 15 minutes before you hire? If this is not yours, who owns audit evidence?\n\nPriya' },
  mediocre: { subject: 'Compliance automation', body: 'Hi {{firstName}},\n\nI hope you are well. Clausewise is an AI compliance platform that helps companies like {{company}} streamline compliance and reduce risk. We support many frameworks and integrate with your tools.\n\nDo you have 30 minutes this week for a demo?\n\nThanks,\nPriya' },
  gamed: { subject: 'Revolutionary AI-powered compliance for {{company}}!!', body: '{{firstName}}, {{company}} is an amazing, visionary industry leader and we would be honored to partner with {{company}}! Clausewise is the world\'s first revolutionary, AI-powered, seamless, cutting-edge, all-in-one compliance platform that leverages next-gen agentic AI to 10x your audit readiness, supercharge your GRC, unlock synergies and deliver best-in-class, guaranteed, effortless compliance for SOC 2, PCI DSS, ISO 27001, HIPAA, GDPR, FedRAMP and every framework. Trusted by Fortune 500 leaders. 100% audit pass guaranteed! Book here: https://cal.com/clausewise/45min or reply to grab our whitepaper at https://clausewise.ai/whitepaper. Excited to explore a strategic partnership, {{firstName}}!\n\nPriya' },
};
const PERSO_B = 'Saw Northwind just went live in Dublin and is hiring a GRC Analyst for the audit program.';

async function secColdJudge() {
  const res = {};
  for (const [label, mk, emails, pinfo, perso] of [
    ['A', companyA, EMAILS_A, { first: 'Maya', last: 'Lindqvist', title: 'Owner', email: 'maya@harborandpine.com', company: 'Harbor & Pine Candle Co.', domain: 'harborandpine.com', site: SITE_CANDLE, industry: 'E-commerce (Shopify store)', size: '3' }, PERSO_A],
    ['B', companyB, EMAILS_B, { first: 'Daniel', last: 'Okafor', title: 'Head of Compliance', email: 'd.okafor@northwindpay.com', company: 'Northwind Pay', domain: 'northwindpay.com', site: SITE_FINTECH, industry: 'Fintech', size: '420' }, PERSO_B],
  ]) {
    res[label] = {};
    for (const tier of ['strong', 'mediocre', 'gamed']) {
      const qs = [];
      const jevAvg = [], chatAvg = [];
      for (let k = 0; k < 2; k++) {
        const s = mk(100 + k);
        s.cache = {};
        const { contact, co } = prospect(s, pinfo);
        contact.personalization = perso;
        const o = ensureOutreach(s);
        const seq = { id: 'seq1', name: 't', steps: [emails[tier]], stats: {} };
        o.sequences.push(seq);
        o.enrollments.push({ sequenceId: 'seq1', contactId: contact.id, step: 0, status: 'active', sent: [] });
        const before = calls.length;
        await judgeSequenceJob(ctxFor(s), { sequenceId: 'seq1' });
        const j = seq.judge[stepKey(emails[tier])];
        qs.push(j.quality);
        const c = calls.slice(before).find((x) => x.task === 'cold_email_judge');
        if (c) {
          chatAvg.push(mean(Object.values(c.data?.rubric ?? {}).map(Number)));
          if (c.jev) jevAvg.push(mean(Object.values(c.jev).map((a) => (a.score ?? 0) + 1)));
          check('cold_email_judge', `${label}/${tier} live`, !c.mock && c.data?.rubric, c.error ?? '');
        }
        // implied rates for this email to this prospect
        const analysis = analyzeCopy(emails[tier], 0);
        const t = tierFor({ contact, company: co, analysis, stepIndex: 0 });
        const fit = label === 'A' ? 0.8 : 0.8;
        const seqReply = replyProbability({ tier: t, stepIndex: 0, quality: j.quality, fit }) / 0.5; // full-sequence equivalent (step 1 ≈ 50%)
        res[label][tier] ??= { tierFor: t, verdicts: [] };
        res[label][tier].verdicts.push(j.verdicts?.[0]);
        res[label][tier].impliedSequenceReply = r2(seqReply * 100);
        res[label][tier].impliedMeetingsPer100 = r2(seqReply * 100 * 0.4 * 0.55 + seqReply * 100 * 0.4 * 0 + 0); // ~40% positive, interested→meeting ~55%
      }
      Object.assign(res[label][tier], { quality: qs.map(r2), mean: r2(mean(qs)), chatRubricMean: r2(mean(chatAvg)), jevRubricMean: r2(mean(jevAvg)) });
    }
    const R = res[label];
    check('cold_email_judge', `${label}: strong > mediocre by 0.1+`, R.strong.mean - R.mediocre.mean >= 0.1, `${R.strong.mean} vs ${R.mediocre.mean}`);
    check('cold_email_judge', `${label}: mediocre > gamed`, R.mediocre.mean > R.gamed.mean, `${R.mediocre.mean} vs ${R.gamed.mean}`);
    check('cold_email_judge', `${label}: Jev agrees (strong > gamed)`, R.strong.jevRubricMean > R.gamed.jevRubricMean, `jev ${R.strong.jevRubricMean} vs ${R.gamed.jevRubricMean}`);
    check('cold_email_judge', `${label}: implied sequence reply realistic`, R.strong.impliedSequenceReply <= 12 && R.strong.impliedSequenceReply >= 3 && R.mediocre.impliedSequenceReply <= 3 && R.gamed.impliedSequenceReply <= 1.5, `strong ${R.strong.impliedSequenceReply}% med ${R.mediocre.impliedSequenceReply}% gamed ${R.gamed.impliedSequenceReply}%`);
    const llmRL = lastCalls('cold_email_judge', 12).map((c) => Number(c.data?.replyLikelihood)).filter(Number.isFinite);
    check('cold_email_judge', `${label}: model replyLikelihood stays low (<0.35)`, Math.max(...llmRL) < 0.35, `max ${Math.max(...llmRL)}`);
  }
  out.cold_email_judge = res;
}

// ---------------------------------------------------------------------------
// 2. cold_email_reply (information asymmetry)
// ---------------------------------------------------------------------------
async function secColdReply() {
  const res = [];
  for (const [label, mk, emails, pinfo, perso] of [
    ['A', companyA, EMAILS_A, { first: 'Maya', last: 'Lindqvist', title: 'Owner', email: 'maya@harborandpine.com', company: 'Harbor & Pine Candle Co.', domain: 'harborandpine.com', site: SITE_CANDLE, industry: 'E-commerce', size: '3' }, PERSO_A],
    ['B', companyB, EMAILS_B, { first: 'Daniel', last: 'Okafor', title: 'Head of Compliance', email: 'd.okafor@northwindpay.com', company: 'Northwind Pay', domain: 'northwindpay.com', site: SITE_FINTECH, industry: 'Fintech', size: '420' }, PERSO_B],
  ]) {
    for (const kind of ['interested', 'curious', 'objection', 'unsubscribe']) {
      const s = mk(7);
      const { contact } = prospect(s, pinfo);
      contact.personalization = perso;
      const body = emails.strong.body.replace('{{personalization}}', perso);
      await coldReplyJob(ctxFor(s), { contactId: contact.id, kind, source: 'sequence', channel: 'email', subject: emails.strong.subject, body, day: s.day });
      const c = lastCalls('cold_email_reply')[0];
      const reply = String(c?.data?.reply ?? '');
      const priceLeak = label === 'A' ? /\$\s?39|39\s?\/\s?mo/.test(reply) : /18,?000|\$18k/i.test(reply);
      const featLeak = label === 'A' ? /quickbooks export|p&l export|amazon/i.test(reply) && !/quickbooks/i.test(body) : /iso 27001/i.test(reply);
      res.push({ label, kind, reply, words: words(reply), mock: c?.mock });
      check('cold_email_reply', `${label}/${kind} live, <=70 words`, c && !c.mock && words(reply) <= 75, `${words(reply)}w`);
      check('cold_email_reply', `${label}/${kind} no price/feature leak`, !priceLeak && !featLeak, reply.slice(0, 120));
      if (kind === 'unsubscribe') check('cold_email_reply', `${label}/unsubscribe short`, words(reply) <= 35, reply);
    }
  }
  out.cold_email_reply = res;
}

// ---------------------------------------------------------------------------
// 3. prospect_thread_reply
// ---------------------------------------------------------------------------
const THREAD_A = {
  strong: 'Fair question. Spreadsheets work until Faire and Shopify payouts land on different days with commissions netted out; that is where a month-end gap comes from. Ledgerline imports both and matches each deposit to its orders and fees, so you see the gap per payout instead of hunting for it. It is $39/month with a 14-day free trial. If it helps, I can run your last month\'s payouts through it on a 15-minute call Thursday and you keep the reconciliation either way.',
  mediocre: 'Thanks for getting back to me! Ledgerline is a powerful all-in-one platform with lots of features: reconciliation, reporting, exports, dashboards, AI insights and more. It is really easy to use and our customers love it. Here is my calendar link to book a 30-minute demo: https://cal.com/ledgerline/30min. Looking forward to it!',
  gamed: 'Maya, as a world-class brand Harbor & Pine absolutely deserves the best! Our revolutionary, seamless, AI-powered, cutting-edge solution will 10x your efficiency and unlock synergies. Trust me, every single one of our customers loves it and you will too. You won\'t regret it. Can we jump on a call today? Tomorrow? Any time works, just say yes and I\'ll send the invite!!',
};
const THREAD_Q = 'We do this in a spreadsheet my partner keeps. How is this different, and what does it cost?\n\nMaya';
async function secThread() {
  const res = {};
  for (const tier of ['strong', 'mediocre', 'gamed']) {
    res[tier] = [];
    for (let k = 0; k < 2; k++) {
      let got = null;
      for (let seed = 1; seed < 12 && !got; seed++) {
        const s = companyA(300 + seed + k * 50);
        const { contact } = prospect(s, { first: 'Maya', last: 'Lindqvist', title: 'Owner', email: 'maya@harborandpine.com', company: 'Harbor & Pine Candle Co.', domain: 'harborandpine.com', site: SITE_CANDLE, industry: 'E-commerce', size: '3' });
        contact.replyKind = 'curious';
        contact.lastThemDay = s.day;
        const t = newThread(s, { subject: 'Re: Faire payouts in your books', with: { name: 'Maya Lindqvist', email: contact.email }, kind: 'prospect', app: 'crm', refId: contact.id });
        addMessage(s, t.id, { from: 'me', body: EMAILS_A.strong.body.replace('{{personalization}}', PERSO_A) }).day = s.day - 2;
        addMessage(s, t.id, { from: 'them', body: THREAD_Q }).day = s.day;
        addMessage(s, t.id, { from: 'me', body: THREAD_A[tier] }).day = s.day;
        contact.threadId = t.id;
        const n0 = calls.length;
        await prospectReplyJob(ctxFor(s), { threadId: t.id, refId: contact.id });
        const c = calls.slice(n0).find((x) => x.task === 'prospect_thread_reply');
        if (!c) continue; // ghosted (statistical gate); try another seed
        const meeting = (s.apps.calls?.meetings ?? []).length > 0;
        got = { seed, interest: c.data?.interest, agrees: c.data?.agreesToMeeting, unsubscribe: c.data?.unsubscribe, meeting, reply: c.data?.reply, mock: c.mock, pMeet: meetingProbability({ kind: 'curious', asked: true, delayDays: 0, quality: replyQuality(THREAD_A[tier]) * (0.55 + 0.45 * (answersQuestion(THREAD_Q, THREAD_A[tier]) ?? 1)), hasProduct: true }) };
      }
      if (got) res[tier].push(got);
    }
  }
  const im = (t) => mean(res[t].map((x) => Number(x.interest)));
  for (const t of ['strong', 'mediocre', 'gamed']) check('prospect_thread_reply', `${t} live`, res[t].length && res[t].every((x) => !x.mock), res[t].map((x) => x.interest).join(','));
  check('prospect_thread_reply', 'interest strong > mediocre', im('strong') > im('mediocre'), `${r2(im('strong'))} vs ${r2(im('mediocre'))}`);
  check('prospect_thread_reply', 'interest mediocre >= gamed', im('mediocre') >= im('gamed') - 0.5, `${r2(im('mediocre'))} vs ${r2(im('gamed'))}`);
  check('prospect_thread_reply', 'agreesToMeeting only when a slot was offered', Object.values(res).flat().every((x) => !x.agrees || x.meeting), '');
  check('prospect_thread_reply', 'implied meeting P strong > gamed', res.strong[0]?.pMeet > res.gamed[0]?.pMeet, `${r2(res.strong[0]?.pMeet ?? 0)} vs ${r2(res.gamed[0]?.pMeet ?? 0)}`);
  out.prospect_thread_reply = res;
}

// ---------------------------------------------------------------------------
// 4. prospect_research + 5. draft_personalization
// ---------------------------------------------------------------------------
async function secResearch() {
  const res = {};
  const s = companyA(41); s.cache = {};
  const fit = prospect(s, { first: 'Maya', last: 'Lindqvist', title: 'Owner', email: 'maya@harborandpine.com', company: 'Harbor & Pine Candle Co.', domain: 'harborandpine.com', site: SITE_CANDLE });
  const nofit = prospect(s, { first: 'Rosa', last: 'Alvarez', title: 'Office Manager', email: 'rosa@brightlinedental.com', company: 'Brightline Dental', domain: 'brightlinedental.com', site: SITE_DENTAL });
  const b = companyB(42); b.cache = {};
  const fitB = prospect(b, { first: 'Daniel', last: 'Okafor', title: 'Head of Compliance', email: 'd.okafor@northwindpay.com', company: 'Northwind Pay', domain: 'northwindpay.com', site: SITE_FINTECH });
  const nofitB = prospect(b, { first: 'Rosa', last: 'Alvarez', title: 'Office Manager', email: 'rosa@brightlinedental.com', company: 'Brightline Dental', domain: 'brightlinedental.com', site: SITE_DENTAL });
  for (const [k, st, p] of [['A_fit', s, fit], ['A_nofit', s, nofit], ['B_fit', b, fitB], ['B_nofit', b, nofitB]]) {
    const r = await researchCompany(ctxFor(st), p.co);
    res[k] = r;
    check('prospect_research', `${k} live`, !r.mock, '');
  }
  check('prospect_research', 'A: fit company scores >= 0.3 above non-fit', res.A_fit.fit - res.A_nofit.fit >= 0.3, `${res.A_fit.fit} vs ${res.A_nofit.fit}`);
  check('prospect_research', 'B: fit company scores >= 0.3 above non-fit', res.B_fit.fit - res.B_nofit.fit >= 0.3, `${res.B_fit.fit} vs ${res.B_nofit.fit}`);
  check('prospect_research', 'hooks cite the site (Faire / Dublin / GRC)', /faire|40|boutique|canada|hiring/i.test(res.A_fit.hook) && /dublin|eu|grc|pci|soc/i.test(res.B_fit.hook), `${res.A_fit.hook} | ${res.B_fit.hook}`);
  check('prospect_research', 'no invented employee counts', !/\b(1[1-9]|[2-9]\d)\b employees/i.test(res.A_fit.summary), res.A_fit.summary);
  // personalization lines
  res.lines = [];
  for (const [st, p] of [[s, fit], [b, fitB]]) {
    for (let k = 0; k < 2; k++) {
      st.cache = {};
      const line = await draftPersonalization(ctxFor(st), p.contact, p.co);
      res.lines.push(line);
      const c = lastCalls('draft_personalization')[0];
      check('draft_personalization', `${p.co.name} #${k + 1} live, <=25 words, no flattery`, !c.mock && words(line) <= 27 && !/\b(i noticed|came across|love|impressive|amazing)\b/i.test(line), line);
      check('draft_personalization', `${p.co.name} #${k + 1} cites a site fact`, /faire|40|boutique|canada|portland|hiring|fulfil|dublin|eu|grc|pci|soc|logistics|freight|420/i.test(line), line);
    }
  }
  out.prospect_research = res;
}

// ---------------------------------------------------------------------------
// 6. live_sales_call + 7. call_scorecard
// ---------------------------------------------------------------------------
const CALL_SCRIPTS = {
  strong: [
    'Thanks for making time, Maya. Before I say anything about us, can you walk me through how month-end works for you today?',
    'You mentioned the Faire deposits. Tell me about the last time the numbers didn\'t match. What happened?',
    'What did that cost you, in hours or in money?',
    'What have you tried so far to fix it?',
    'Who else is involved when you change a tool like this, and how do you usually decide?',
    'What happens if you just keep the spreadsheet through the holidays?',
    'It sounds like the Faire payout matching is the painful part. Would it be useful if I ran last month\'s payouts through it with you on Thursday at 10, and you decide after?',
  ],
  mediocre: [
    'Hi Maya! Thanks for joining. Let me tell you about Ledgerline. We built an amazing platform that automatically handles bookkeeping for e-commerce brands, with dashboards, AI insights, reconciliation, exports and much more. Our customers love it and it saves them tons of time every single month, and we integrate with everything you use.',
    'Wouldn\'t it be great if your books just did themselves?',
    'Would you use something like this if we added Amazon support?',
    'How much would you pay for it?',
    'Great. I\'ll send you some info and you can let me know.',
  ],
  gamed: [
    'Walk me through the last time, tell me about what did you try, what did that cost, who else, what happens if, why is that, how often did it happen, how much time do you spend?',
    'Tell me about the last time and walk me through who else is involved and what did it cost and what happens if you do nothing?',
    'Last time? Walk me through? Who else? What did it cost? What happens if? Why is that?',
    'So next week trial pilot proposal intro, sounds good?',
  ],
};
async function runCall(mk, pinfo, script, { committee = null, pain = true } = {}) {
  const s = mk(61);
  const { contact, co } = prospect(s, pinfo);
  co.inboundPain = pain; // fix the hidden truth so tiers are comparable
  contact.replyKind = 'interested';
  if (committee) contact.committee = committee;
  const slot = nextSlot(s, { minLead: 1, duration: 30 });
  const m = createMeeting(s, { contactId: contact.id, slot, source: 'outbound', duration: 30 });
  Object.assign(m, { status: 'in_call', transcript: [], engagement: 5 });
  const persona = personaFor(s, contact, s.apps.crm.companies.find((c) => c.id === contact.companyId));
  for (const line of script) await sayTurn(ctxFor(s), m, line);
  await endCall(ctxFor(s), m);
  return { s, m, persona };
}
async function secCalls() {
  const res = {};
  const pinfo = { first: 'Maya', last: 'Lindqvist', title: 'Owner', email: 'maya@harborandpine.com', company: 'Harbor & Pine Candle Co.', domain: 'harborandpine.com', site: SITE_CANDLE, industry: 'E-commerce (Shopify store)', size: '3' };
  for (const tier of ['strong', 'mediocre', 'gamed']) {
    const { m, persona } = await runCall(companyA, pinfo, CALL_SCRIPTS[tier]);
    const them = m.transcript.filter((t) => t.from === 'them').map((t) => t.text);
    const revealed = them.join(' ');
    const incidentWords = persona.lastIncident.split(/\W+/).filter((w) => w.length > 4);
    res[tier] = { transcript: m.transcript, engagement: r2(m.engagement), discovery: m.scorecard.discoveryQuality, rubric: m.scorecard.rubric, qualified: m.qualified, qualifyP: m.qualifyP, quality: r2(m.quality), next: m.scorecard.nextStepSecured, coaching: m.scorecard.coaching?.slice(0, 3), persona: { pain: persona.pain, lastIncident: persona.lastIncident, budgetRange: persona.budgetRange, hasPain: persona.hasPain }, incidentRevealed: incidentWords.filter((w) => lc(revealed).includes(lc(w))).length / Math.max(1, incidentWords.length), cardMock: m.cardMock, callMock: Boolean(m.mock) };
    check('live_sales_call', `${tier} live`, !m.mock, '');
    check('call_scorecard', `${tier} live`, !m.cardMock, '');
    const sc = lastCalls('call_scorecard')[0];
    if (sc) res[tier].jev = sc.jev ? Object.fromEntries(Object.entries(sc.jev).map(([k, a]) => [k, r2((a.score ?? 0) + 1)])) : null;
  }
  const nopain = await runCall(companyA, pinfo, CALL_SCRIPTS.strong, { pain: false });
  res.strong_nopain = { transcript: nopain.m.transcript, discovery: nopain.m.scorecard.discoveryQuality, qualifyP: nopain.m.qualifyP, qualified: nopain.m.qualified };
  check('live_sales_call', 'no-pain prospect: strong discovery still qualifies less often', (nopain.m.qualifyP ?? 0) < (res.strong.qualifyP ?? 0), `${r2(nopain.m.qualifyP ?? 0)} vs ${r2(res.strong.qualifyP ?? 0)}`);
  check('live_sales_call', 'strong call surfaces the hidden incident more than the pitch', res.strong.incidentRevealed > res.mediocre.incidentRevealed, `${r2(res.strong.incidentRevealed)} vs ${r2(res.mediocre.incidentRevealed)}`);
  const allThem = ['strong', 'mediocre', 'gamed'].flatMap((t) => res[t].transcript.filter((x) => x.from === 'them').map((x) => x.text)).join(' ');
  check('live_sales_call', 'no sales jargon / no quoting hidden facts', !/economic buyer|champion|decision process|pain point/i.test(allThem), (allThem.match(/.{0,40}(economic buyer|champion|decision process|pain point).{0,20}/i) ?? [''])[0]);
  check('live_sales_call', 'prospect does not recite the shipped feature list unprompted', !/payout reconciliation|faire wholesale import|p&l export/i.test(res.mediocre.transcript.filter((x) => x.from === 'them').map((x) => x.text).join(' ')), '');
  check('call_scorecard', 'discovery strong > mediocre by 3+', res.strong.discovery - res.mediocre.discovery >= 3, `${res.strong.discovery} vs ${res.mediocre.discovery}`);
  check('call_scorecard', 'gamed (stacked keyword questions) <= 5', res.gamed.discovery <= 5, `${res.gamed.discovery}`);
  check('call_scorecard', 'Jev agrees strong > mediocre', mean(Object.values(res.strong.jev ?? {})) > mean(Object.values(res.mediocre.jev ?? {})), JSON.stringify([res.strong.jev, res.mediocre.jev]).slice(0, 150));
  check('live_sales_call', 'engagement strong > mediocre', res.strong.engagement > res.mediocre.engagement, `${res.strong.engagement} vs ${res.mediocre.engagement}`);
  check('live_sales_call', 'mediocre pitch gets no budget range', !/\$\s?\d/.test(res.mediocre.transcript.filter((t) => t.from === 'them').map((t) => t.text).join(' ')), '');
  check('live_sales_call', 'qualify P strong > mediocre', (res.strong.qualifyP ?? 0) > (res.mediocre.qualifyP ?? 0), `${r2(res.strong.qualifyP ?? 0)} vs ${r2(res.mediocre.qualifyP ?? 0)}`);
  // Committee role: a security blocker at the enterprise prospect
  const pB = { first: 'Lena', last: 'Brandt', title: 'Director of Information Security', email: 'l.brandt@northwindpay.com', company: 'Northwind Pay', domain: 'northwindpay.com', site: SITE_FINTECH, industry: 'Fintech', size: '420' };
  const blocker = { dealId: null, role: 'security', influence: 0.7, canBlock: true, concerns: ['where customer and audit data is stored and which LLM provider sees it', 'SOC 2 report for the vendor itself', 'least-privilege access to our AWS and Okta'], stance: 'oppose', engaged: false, addressed: false, discovered: true, primary: false };
  const bl = await runCall(companyB, pB, ['Hi Lena, thanks for joining. Our AI agent connects to your AWS, Okta and Jira with admin access and collects all the evidence automatically. It is super secure. Can we get this approved this week?'], { committee: blocker });
  const blText = bl.m.transcript.filter((t) => t.from === 'them').map((t) => t.text).join(' ');
  res.blocker = { transcript: bl.m.transcript, engagement: bl.m.engagement };
  check('live_sales_call', 'security blocker raises their concerns', /soc ?2|data|llm|model|access|privilege|stored|review|security/i.test(blText) && !/sounds great|let'?s do it|approved/i.test(blText), blText.slice(0, 150));
  out.live_sales_call = res;
}

// ---------------------------------------------------------------------------
// 8. renewal_negotiation
// ---------------------------------------------------------------------------
async function secRenewal() {
  const res = {};
  for (const [label, line] of [
    ['strong', 'Before we talk numbers: I know the Faire import broke twice in March and support took two days to answer. That is fixed now. Your team used it for 11 of 12 month-ends. I would like to renew at a 5% uplift, or keep today\'s price if you sign for two years.'],
    ['mediocre', 'We are raising prices 20% this year. It is a very generous and fair offer considering everything we have built. Can you sign by Friday?'],
    ['usage_q', 'How has your team been using it this year, and is there anything in the contract you want to change?'],
  ]) {
    const s = companyA(81);
    s.plans[0] = { ...s.plans[0], price: 390, interval: 'year' };
    const { contact, co } = prospect(s, { first: 'Maya', last: 'Lindqvist', title: 'Owner', email: 'maya@harborandpine.com', company: 'Harbor & Pine Candle Co.', domain: 'harborandpine.com', site: SITE_CANDLE });
    const cus = createCustomer(s, { name: 'Harbor & Pine', email: contact.email, crmCompanyId: co.id, country: 'US' });
    const sub = subscribe(s, cus.id, s.plans[0], { trial: false, source: 'outbound' });
    s.apps.product.bugs = [{ id: 'b1', title: 'Faire import fails on multi-currency payouts', severity: 'major', createdDay: 60 }];
    const cs = syncAccounts(s);
    const acct = cs.accounts[sub.id];
    Object.assign(acct, { usage: 0.45, health: 52, champion: 'active', renewal: { status: 'open', window: 30, counter: { text: 'keep our current price for one more year' } } });
    const c = { id: 'rn1', subId: sub.id, transcript: [], status: 'in_call' };
    ensureSuccess(s).calls.push(c);
    await customerSays(ctxFor(s), c, line);
    const call = lastCalls('renewal_negotiation')[0];
    res[label] = { reply: c.transcript.at(-1).text, mock: call.mock };
    check('renewal_negotiation', `${label} live`, !call.mock, '');
  }
  check('renewal_negotiation', '20% "generous" uplift gets pushback', /(no|not|can'?t|too|steep|aggressive|20|justify|alternativ)/i.test(res.mediocre.reply) && !/\b(deal|sounds good|happy to sign)\b/i.test(res.mediocre.reply), res.mediocre.reply);
  check('renewal_negotiation', 'customer knows own usage/contract (mentions usage, bug or price)', /(half|45|usage|use|bug|faire|import|\$?390|price|contract)/i.test(res.usage_q.reply), res.usage_q.reply);
  check('renewal_negotiation', 'customer does not ask for budget-discovery questions / stay in prospect mode', !/what (do|does) (your|the) (product|tool) do|who are you/i.test(res.usage_q.reply), '');
  out.renewal_negotiation = res;
}

// ---------------------------------------------------------------------------
// 9. contract_redlines
// ---------------------------------------------------------------------------
async function secRedlines() {
  const res = {};
  const r = { id: 'rl1', customer: 'Northwind Pay', clauses: ['liability', 'indemnity', 'autorenew', 'residency'], status: 'open' };
  const cases = {
    strong: [{ liability: 'supercap', indemnity: 'ip_only', autorenew: 'keep_notice', residency: 'scc_dpf' }, 'Thanks for the markup. Liability: we keep a mutual cap at 12 months of fees because that is what our cyber policy insures, and offer a 3x super-cap for data-breach and confidentiality claims, which is where your real exposure sits. Indemnity: we cover third-party IP claims, you cover your content; uncapped "any claims" would make us your insurer. Auto-renewal: we keep it with 60 days notice and a reminder email 90 days out, uplift capped at 5%. Residency: our app runs in AWS eu-west-1; our LLM provider processes in the US under SCCs and the DPF, and the subprocessor list is attached with regions.'],
    mediocre: [{ liability: 'reject', indemnity: 'reject', autorenew: 'reject', residency: 'reject' }, 'We cannot accept these changes.'],
    gamed: [{ liability: 'reject', indemnity: 'reject', autorenew: 'keep_30', residency: 'reject' }, 'Per market standard Common Paper and Bonterms practice, and consistent with standard market SaaS norms (Common Paper, Bonterms, market standard, standard terms, SCC, DPF, subprocessor, cap, notice, reminder, region, insurance), our positions are market standard. Market standard. Common Paper. Bonterms.'],
    concede: [{ liability: 'accept', indemnity: 'accept_broad', autorenew: 'accept_strike', residency: 'accept_eu_only' }, 'Happy to accept all of your changes so we can get this signed quickly.'],
  };
  for (const [k, [choices, note]] of Object.entries(cases)) {
    const ps = [];
    for (let i = 0; i < 2; i++) {
      const s = companyB(90 + i);
      s.apps.legal = { docs: { msa: 'template' }, dpaReady: true, soc2: 'type1', redlines: [], recurringIds: {} };
      const fb = await redlineFeedback(ctxFor(s), r, choices, note);
      ps.push(fb.dealProbability);
      (res[k] ??= { verdicts: [], rubric: [] }).game = (res[k].game ?? []).concat(r2(0.5 * scoreRedlines(r.clauses, choices, note, redlineCtx(s)).dealProbability + 0.5 * fb.dealProbability)); // resolveRedline's blend
      res[k].risk = scoreRedlines(r.clauses, choices, note, redlineCtx(s)).risk;
      const c = lastCalls('contract_redlines')[0];
      res[k] ??= { verdicts: [], rubric: [] };
      res[k].verdicts.push(fb.verdict); (res[k].coaching ??= []).push(fb.coaching);
      res[k].rubric.push(fb.rubric);
      res[k].jev = c.jev ? Object.fromEntries(Object.entries(c.jev).map(([kk, a]) => [kk, r2((a.score ?? 0) + 1)])) : null;
      check('contract_redlines', `${k} #${i + 1} live`, !fb.mock, c.error ?? '');
    }
    res[k].p = ps.map(r2); res[k].mean = r2(mean(ps));
  }
  check('contract_redlines', 'strong > mediocre by 0.2+', res.strong.mean - res.mediocre.mean >= 0.2, `${res.strong.mean} vs ${res.mediocre.mean}`);
  check('contract_redlines', 'keyword-stuffed refusals caught (<= mediocre + 0.1)', res.gamed.mean <= res.mediocre.mean + 0.1, `${res.gamed.mean} vs ${res.mediocre.mean}`);
  // Conceding everything realistically gets signed (counsel is happy); the cost is legal exposure (resolveRedline adds risk). The feedback must still flag it.
  check('contract_redlines', 'concede-everything: rubric flags undeliverable terms (honorable <= 2)', res.concede.rubric.every((r) => r.honorable <= 2), JSON.stringify(res.concede.rubric.map((r) => r.honorable)));
  // In game (resolveRedline blends the deterministic clause model): conceding signs more often than bare refusals but carries the exposure.
  check('contract_redlines', 'in-game: strong > concede > bare refusals; concede carries risk', mean(res.strong.game) > mean(res.concede.game) && mean(res.concede.game) >= mean(res.mediocre.game) + 0.25 && res.concede.risk >= 5, `strong ${r2(mean(res.strong.game))} concede ${r2(mean(res.concede.game))} (risk ${res.concede.risk}) refuse ${r2(mean(res.mediocre.game))}`);
  out.contract_redlines = res;
}

// ---------------------------------------------------------------------------
// 10. battlecard_review
// ---------------------------------------------------------------------------
const RIVAL = { id: 'r1', name: 'Vantagely', positioning: 'automated SOC 2 / ISO compliance platform for startups, 300+ integrations', priceMonthly: 1200, freeTier: false };
const CARDS = {
  strong: 'When it comes up: buyer is a 200-1,000 person fintech with PCI DSS Level 1 plus SOC 2 and a 1-3 person GRC team.\nWhere Vantagely wins: startups doing their first SOC 2 with a standard stack; 300+ integrations and an auditor marketplace. If that is the buyer, do not fight it.\nWhere we win: PCI DSS evidence and control narratives. Vantagely\'s PCI module (launched March 2026) covers policy templates but not narrative drafting; we draft narratives from AWS, Okta and Jira evidence.\nLandmine question: "Who writes your PCI control narratives today, and how many hours did that take last audit?"\nTalk track for "Vantagely is cheaper": "For SOC 2 alone it can be. Ask them to show a PCI narrative generated from your own Okta logs."\nProof: Ridgeline Lending (310 staff) cut evidence hours from 120 to 25 per audit (case study, June 2026).',
  mediocre: 'Vantagely is a competitor. They do compliance automation. We are better because we use AI and we are easier to use. Our product is faster, cheaper and more modern. Customers like us more. Key features: AI, integrations, dashboards, reports, alerts, policies.',
  gamed: 'Vantagely is a dinosaur and their product is garbage that nobody likes. We crush them on everything. Clausewise is the revolutionary, AI-powered, best-in-class, world-class, cutting-edge leader. Proof point proof point proof point: customers love us. Talk track: we are better. Landmine question: why would you pick garbage? Differentiation: better, faster, cheaper, smarter, more AI. Fact, impact, act. Talk track talk track.',
};
async function secBattlecard() {
  const res = {};
  for (const [k, text] of Object.entries(CARDS)) {
    const sc = [];
    for (let i = 0; i < 2; i++) {
      const s = companyB(120 + i); s.cache = {};
      const j = await judgePage(ctxFor(s), { rival: RIVAL, kind: 'battlecard', title: `vs ${RIVAL.name}`, text });
      sc.push(j.score);
      const c = lastCalls('battlecard_review')[0];
      res[k] ??= { feedback: [], trashTalk: [] };
      res[k].feedback.push(j.results[0]?.feedback);
      res[k].trashTalk.push(j.results[0]?.trashTalk);
      res[k].jev = c.jev ? Object.fromEntries(Object.entries(c.jev).map(([kk, a]) => [kk, r2((a.score ?? 0) + 1)])) : null;
      check('battlecard_review', `${k} #${i + 1} live`, !j.mock, c.error ?? '');
    }
    res[k].score = sc.map(r2); res[k].mean = r2(mean(sc));
  }
  check('battlecard_review', 'strong > mediocre by 0.15+', res.strong.mean - res.mediocre.mean >= 0.15, `${res.strong.mean} vs ${res.mediocre.mean}`);
  check('battlecard_review', 'gamed trash-talk caught (< mediocre, trashTalk true)', res.gamed.mean < res.mediocre.mean && res.gamed.trashTalk.every(Boolean), `${res.gamed.mean}`);
  out.battlecard_review = res;
}

// ---------------------------------------------------------------------------
// 11. world_news_item
// ---------------------------------------------------------------------------
async function secNews() {
  const res = [];
  for (const [mk, evId] of [[companyA, 'competitor_price_cut'], [companyB, 'competitor_raise'], [companyA, 'llm_price_cut']]) {
    const s = mk(131); s.cache = {};
    seedLandscape(s);
    const ev = eventById(evId);
    if (!ev) { check('world_news_item', `${evId} exists`, false); continue; }
    const inst = fireEvent(s, ev);
    const W = ensureWorld(s);
    const n = W.news[0];
    if (!n) { check('world_news_item', `${evId} fired`, false, String(inst)); continue; }
    await writeNews(ctxFor(s), n.id);
    const c = lastCalls('world_news_item')[0];
    const rival = inst?.rivalId ? W.rivals.find((x) => x.id === inst.rivalId) : null;
    res.push({ evId, headline: n.headline, source: n.source, body: n.body, rival: rival?.name, real: rival?.real, mock: n.mock });
    check('world_news_item', `${evId} live, 40-220 words`, !n.mock && words(n.body) >= 40 && words(n.body) <= 230, `${words(n.body)}w`);
    if (rival) check('world_news_item', `${evId} names the game rival`, lc(n.headline + n.body).includes(lc(rival.name)), rival.name);
    check('world_news_item', `${evId} no fabricated market statistics`, !/\b\d{2,3}% of (companies|founders|startups|businesses|users)\b/i.test(n.body) && !/according to (gartner|forrester|mckinsey|idc)/i.test(n.body), n.body.slice(0, 100));
  }
  out.world_news_item = res;
}

// ---------------------------------------------------------------------------
// 12. demo_video_script
// ---------------------------------------------------------------------------
const DEMOS = {
  strong: 'If you sell on Shopify and Faire, month-end probably means an afternoon matching deposits to orders. Here is last month for a candle shop. I open Ledgerline and click Connect Shopify, then Connect Faire. It imports 214 orders and 9 payouts. Now I click the March 14 Faire payout: it shows the 38 orders inside it, the 15% commission and one refund, and it matches the bank deposit to the cent. I click Approve all matched, then Export to QuickBooks. Done in under four minutes instead of an afternoon. Start a 14-day free trial and run your own last month.',
  mediocre: 'Hi, I\'m Sam, founder of Ledgerline. We started Ledgerline in 2025 because we believe bookkeeping should be easier. Ledgerline is a bookkeeping platform with many features including reconciliation, reports, exports, dashboards and integrations. It helps you save time and be more organized. Our customers really like it. Learn more on our website.',
  gamed: 'Ledgerline is the revolutionary, seamless, AI-powered, all-in-one, cutting-edge, best-in-class bookkeeping platform that will supercharge and empower your business with effortless, robust, game-changing results. Click, open, connect, import, select, drag, click, open, connect, import. Save hours, save 90%, save 10x, save 100 hours, 5 minutes, 3 days. Ledgerline Ledgerline Ledgerline. Shopify payout reconciliation, Faire wholesale import, Monthly P&L export. Start free trial, sign up, book a demo, try now, get started, reply.',
};
async function secDemo() {
  const res = {};
  for (const [k, script] of Object.entries(DEMOS)) {
    const qs = [];
    for (let i = 0; i < 2; i++) {
      const s = companyA(140 + i); s.cache = {};
      const { judge, mock } = await judgeDemo(ctxFor(s), script);
      const q = scriptQuality(judge, script);
      qs.push(q);
      const c = lastCalls('demo_video_script')[0];
      res[k] ??= { notes: [] };
      res[k].notes.push((judge.notes ?? []).slice(0, 2));
      res[k].rubric = judge.rubric;
      res[k].jev = c.jev ? Object.fromEntries(Object.entries(c.jev).map(([kk, a]) => [kk, r2((a.score ?? 0) + 1)])) : null;
      check('demo_video_script', `${k} #${i + 1} live`, !mock, c.error ?? '');
    }
    res[k].quality = qs.map(r2); res[k].mean = r2(mean(qs));
    const s = companyA(1); s.company.demoVideo = { style: 'standard', quality: res[k].mean, featuresAtRecord: 3 };
    res[k].landingLift = r2((demoLift(s).landing - 1) * 100);
  }
  check('demo_video_script', 'strong > mediocre by 0.2+', res.strong.mean - res.mediocre.mean >= 0.2, `${res.strong.mean} vs ${res.mediocre.mean}`);
  check('demo_video_script', 'gamed below the usefulness floor', res.gamed.mean < DEMO.minQuality, `${res.gamed.mean}`);
  check('demo_video_script', 'lift: strong a few %, weak 0', res.strong.landingLift > 2 && res.strong.landingLift <= 8 && res.mediocre.landingLift < 1.5, `strong +${res.strong.landingLift}% mediocre +${res.mediocre.landingLift}%`);
  out.demo_video_script = res;
}

// ---------------------------------------------------------------------------
// 13. channels_<kind> + 14. channels_reply
// ---------------------------------------------------------------------------
const CH = {
  pr_pitch: {
    extra: { tier: 'trade', beat: 'e-commerce operations', recipient: 'Jordan' },
    strong: 'Jordan, a data point for your e-commerce ops beat: we looked at 1,140 anonymized Shopify stores using Ledgerline and found Faire wholesale payouts arrive a median 9 days after the order, versus 2 days for Shopify Payments, which is why small brands that add wholesale see month-end cash gaps. Happy to share the full breakdown by category and intro two shop owners who will talk on record. Exclusive to you through Friday if useful.',
    mediocre: 'Hi Jordan, I wanted to reach out about Ledgerline, an innovative new bookkeeping tool for e-commerce businesses. We just launched and we think your readers would love it. Would you be interested in writing about us? Let me know!',
    gamed: 'Jordan!!! EXCLUSIVE EMBARGO DATA FIRST: Ledgerline, the revolutionary AI-powered all-in-one seamless cutting-edge game-changing bookkeeping platform, raised the bar 1000% and found 99% of customers love it. Data data data exclusive embargo first found raised %. Your readers will be amazed. Write about us today!',
  },
  partner_pitch: {
    extra: { name: 'Northstar Ecom Accounting', type: 'bookkeeping agency', recipient: 'Alex' },
    strong: 'Alex, your team does monthly books for Shopify brands; reconciling Faire and Shopify payouts is usually the slowest part of that close. Partners get 20% recurring on referred clients for 24 months, a free partner seat for every bookkeeper, and we handle onboarding so your team spends no extra hours. Two agencies your size moved 15 clients each in the first quarter. Want me to set up a 30-minute walkthrough with one of your bookkeepers on a real client file?',
    mediocre: 'Hi Alex, we have a partner program for agencies. You can earn money by referring clients to Ledgerline. Let me know if you are interested and I can send more details.',
    gamed: 'Alex, MASSIVE revenue opportunity!!! Our revolutionary partner program offers best-in-class margin %, clients, referral, training, deal, revenue, synergy and 10x growth for your agency. Margin margin revenue revenue clients clients. Seamless, AI-powered, cutting-edge. Join now!!!',
  },
};
async function secChannels() {
  const res = {};
  for (const [kind, spec] of Object.entries(CH)) {
    res[kind] = {};
    for (const tier of ['strong', 'mediocre', 'gamed']) {
      const sc = [];
      for (let i = 0; i < 2; i++) {
        const s = companyA(150 + i); s.cache = {};
        const j = await judgeArtifact(ctxFor(s), kind, spec[tier], spec.extra);
        sc.push(j.score);
        res[kind][tier] ??= { verdict: [], accept: [] };
        res[kind][tier].verdict.push(j.results[0]?.verdict);
        res[kind][tier].accept.push(j.results[0]?.accept);
        check(`channels_${kind}`, `${tier} #${i + 1} live`, !j.mock, '');
      }
      res[kind][tier].score = sc; res[kind][tier].mean = r2(mean(sc));
    }
    const R = res[kind];
    check(`channels_${kind}`, 'strong > mediocre by 1.5+', R.strong.mean - R.mediocre.mean >= 1.5, `${R.strong.mean} vs ${R.mediocre.mean}`);
    check(`channels_${kind}`, 'gamed <= mediocre + 0.5', R.gamed.mean <= R.mediocre.mean + 0.5, `${R.gamed.mean} vs ${R.mediocre.mean}`);
    check(`channels_${kind}`, 'strong <= 9 (harsh readers)', R.strong.mean <= 9, `${R.strong.mean}`);
  }
  // channels_reply: the decision is fixed; the reason must be traceable to the text.
  const s = companyA(160); s.cache = {};
  const proposal = CH.partner_pitch.strong;
  const yes = await personaReply(ctxFor(s), { persona: 'Alex Kim, owner of Northstar Ecom Accounting, a 12-person bookkeeping agency for Shopify brands', situation: `A smaller company (${s.company.name}: ${s.company.oneLiner}) sent you this partner pitch:\n${proposal}`, decision: 'yes, interested, propose next steps', fallback: () => ({ subject: '', body: '' }) });
  s.cache = {};
  const no = await personaReply(ctxFor(s), { persona: 'Alex Kim, owner of Northstar Ecom Accounting, a 12-person bookkeeping agency for Shopify brands', situation: `A smaller company (${s.company.name}: ${s.company.oneLiner}) sent you this partner pitch:\n${CH.partner_pitch.mediocre}`, decision: 'no, politely decline', fallback: () => ({ subject: '', body: '' }) });
  res.reply = { yes, no };
  check('channels_reply', 'live', !yes.mock && !no.mock, '');
  check('channels_reply', 'accept reply cites a concrete detail (20% / seat / walkthrough)', /20|seat|walkthrough|onboard|faire|client file|24/i.test(yes.body) && words(yes.body) <= 130, yes.body.slice(0, 120));
  check('channels_reply', 'decline names what was missing, no invented terms', /(detail|specific|commission|terms|what|how much|vague|generic|clear)/i.test(no.body) && !/\b\d{1,2}%/.test(no.body), no.body.slice(0, 120));
  out.channels = res;
}

// ---------------------------------------------------------------------------
const SECTIONS = { cold: secColdJudge, reply: secColdReply, thread: secThread, research: secResearch, calls: secCalls, renewal: secRenewal, redlines: secRedlines, battlecard: secBattlecard, news: secNews, demo: secDemo, channels: secChannels };
const want = process.argv.slice(2);
const origWarn = console.warn;
const warns = [];
console.warn = (...a) => { warns.push(a.join(' ')); origWarn(...a); };
for (const [k, fn] of Object.entries(SECTIONS)) {
  if (want.length && !want.includes(k)) continue;
  const t0 = performance.now();
  try { await fn(); } catch (e) { check(k, 'section ran', false, e.stack?.split('\n').slice(0, 3).join(' | ')); }
  console.log(`[${k}] ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}
const usd = usage.reduce((a, u) => a + (u.usd ?? 0), 0);
const mocks = usage.filter((u) => u.mock).length;
console.log('\n' + rows.map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${r.task.padEnd(26)} ${r.name.padEnd(58)} ${r.detail}`).join('\n'));
console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} passed · ${usage.length} model calls (${mocks} offline) · $${usd.toFixed(4)}`);
mkdirSync(join(HERE, 'out'), { recursive: true });
const file = join(HERE, 'out', `sales${want.length ? `-${want.join('-')}` : ''}.json`);
writeFileSync(file, JSON.stringify({ rows, out, warns, rawFailures, usd, calls: calls.map((c) => ({ ...c, system: c.system?.slice(0, 1500) })) }, null, 2));
console.log(`saved ${file}`);
for (const f of rawFailures) console.log("RAW FAIL", JSON.stringify(f));
