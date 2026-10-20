// Wave-2 regression checks: channel spend lands under the source its customers get (Analytics CAC by channel),
// refunds net against their channel, channel fit for leftover sources, the positioning/landing operator reader,
// validation that cannot be dodged by abandoning a test, decaying reply goodwill, consumer hours and waste ledger,
// and keyword-stuffing guards. Short, offline, a few seeds; no long sims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { post, seedDefaultStack } from '../public/core/bank.js';
import { ensureStripe, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { setCustomerType, channelFit, channelOf } from '../public/core/customer-type.js';
import { readOperator, logMistake } from '../public/core/operator.js';
import { cacByChannel } from '../public/apps/money/metrics.js';
import { spend } from '../public/apps/channels/sim.js';
import { searchAgencies, engage } from '../public/apps/channels/agencies.js';
import { ensureOrganic, bookSponsorship } from '../public/apps/growth/organicEngine.js';
import { buyLinks } from '../public/apps/growth/seoDynamics.js';
import { buyPlacement } from '../public/apps/searchtools/geo.js';
import { launchCampaign as launchClip, closeCampaign } from '../public/apps/consumer/clipping.js';
import { setWebsite, runPanel } from '../public/apps/website.js';
import { buildSite, iterateSite } from '../public/apps/website/sitebuild.js';
import { hasAnyValidation, copyScore } from '../public/apps/mvp/model.js';
import { renewalCallScore } from '../public/apps/success/model.js';
import { applyReplyHelp, expireReplyHelp } from '../public/apps/customers.js';
import { FEEDBACK } from '../public/apps/product/panel.js';
import { ensureConsumer } from '../public/apps/consumer/state.js';
import { postBrief, hireCreators, hireCount, rosterActive, briefHours, setMarketplace } from '../public/apps/consumer/creators.js';
import { CREATORS } from '../public/apps/consumer/params.js';

function fresh(model = 'smb', seed = 7) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'bootstrap', founderName: 'F', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'F', category: 'owner_contribution' });
  s.company.oneLiner = 'Bookkeeping that closes the month for small agencies';
  s.company.icp = 'operations leads at small marketing agencies';
  return s;
}
const row = (s, ch) => cacByChannel(s).rows.find((r) => r.channel === ch);
const unattributed = (s) => (row(s, 'marketing (unattributed)')?.spend ?? 0) + (row(s, 'advertising (unattributed)')?.spend ?? 0);

// ---------------- 1. CAC by channel ----------------

test('CAC by channel: each tagged channel shows its own spend, nothing lands as unattributed', () => {
  const s = fresh();
  // Newsletter sponsorship (organic newsletter placements) -> 'newsletter'
  const O = ensureOrganic(s);
  const nl = O.newsletters[0];
  bookSponsorship(s, { newsletterId: nl.id, headline: 'h', body: 'b', cta: 'c', skill: 0.5 });
  assert.equal(row(s, 'newsletter')?.spend, nl.price, 'newsletter sponsorship');
  // SEO link buys / retainers -> 'organic:seo'
  const lb = buyLinks(s, { pack: 'cheap' });
  assert.equal(row(s, 'organic:seo')?.spend, lb.usdCost, 'link buy');
  // Paid "best tools" listicle -> answer-engine traffic
  const before = row(s, 'organic:llm')?.spend ?? 0;
  buyPlacement(s, { disclosed: true });
  assert.ok((row(s, 'organic:llm')?.spend ?? 0) > before, 'listicle placement');
  // Channels app spend: sponsorships, events/hosted dinners, review-site PPC, AppSumo, PR firm
  for (const [key, src] of [['sponsor_podcast', 'sponsorship'], ['events', 'events'], ['hosted', 'events'], ['review_sites', 'review_sites'], ['ltd', 'ltd'], ['pr_firm', 'pr']]) {
    const b = row(s, src)?.spend ?? 0;
    spend(s, key, 300, { counterparty: 'x', description: key, category: key === 'review_sites' ? 'advertising' : 'marketing' });
    assert.equal(round(row(s, src)?.spend), round(b + 300), `${key} -> ${src}`);
  }
  assert.equal(unattributed(s), 0, 'no unattributed marketing spend');
});

test('CAC by channel: agency retainers land under the source their customers get (marketing, PR, data)', () => {
  const s = fresh();
  s.company.oneLiner = 'Practice software for dentists'; s.company.icp = 'office managers at dental practices';
  for (const [kind, q, src] of [['marketing', 'marketing agency for dental practices in Texas', 'organic:agency'], ['pr', 'PR firm for dental practices in Texas', 'pr'], ['data', 'data vendor for dental practices in Texas', 'outbound']]) {
    const r = searchAgencies(s, { kind, query: q });
    assert.ok(r.listings.length, `${kind}: a roster`);
    engage(s, r.listings[0].id, { brief: 'Office managers at dental practices of 3-15 chairs who chase insurance claims by phone.' });
    assert.ok((row(s, src)?.spend ?? 0) > 0, `${kind} spend under ${src}`);
  }
  assert.equal(unattributed(s), 0);
});

test('CAC by channel: list buys / audience spend land under organic:list', async () => {
  const { ensureAudience, purchaseList } = await import('../public/apps/audience/model.js');
  const s = fresh();
  const A = ensureAudience(s);
  A.platform = A.platform ?? 'kit';
  const r = purchaseList(s, { n: 1000 });
  assert.notEqual(r?.ok, false, r?.error);
  assert.equal(row(s, 'organic:list')?.spend, 60);
});

test('CAC by channel: refunded unspent clipping budget nets out of clipping spend', () => {
  const s = fresh('b2c');
  const r = launchClip(s, { name: 'c', budget: 1000, content: 'demo_slideshow', hook: 'I stopped paying for 3 apps', rules: 'show the app' });
  assert.equal(r.ok, true, r.error);
  assert.equal(row(s, 'organic:clips')?.spend, 1000);
  const c = closeCampaign(s, r.campaign.id);
  assert.ok(c.refunded > 0);
  assert.equal(round(row(s, 'organic:clips')?.spend ?? 0), round(1000 - c.refunded), 'net of the refund');
});

const round = (x) => Math.round((x ?? 0) * 100) / 100;

// ---------------- 2. Channel fit for leftover sources ----------------

test('channel fit: apple search ads, owned list, newsletter and press map to channels; inbound stays neutral', () => {
  assert.equal(channelOf('ads:apple'), 'ads_google');
  assert.equal(channelOf('organic:list'), 'content');
  assert.equal(channelOf('newsletter'), 'content');
  assert.equal(channelOf('press'), 'content');
  assert.equal(channelOf('inbound'), null);
  assert.equal(channelOf('competitor-switch'), null);
  const s = fresh('smb');
  setCustomerType(s, 'local_smb');
  assert.notEqual(channelFit(s, 'ads:apple'), 1, 'apple search ads now use the search-ads fit');
});

// ---------------- 3. positioning_landing operator reader ----------------

const STRONG = { title: 'Ledgerly: bookkeeping for small agencies', description: 'Close the month in 2 hours, not 2 days.', headings: ['Month-end close in 2 hours for agencies of 5-50 people', 'How it works', 'Pricing', 'FAQ', 'Security'], text: 'Ledgerly does bookkeeping for small agencies. Connect QuickBooks or Xero and Stripe in 5 minutes; we reconcile every transaction and flag the odd ones. "We cut our close from 3 days to 4 hours" - Maria Lopez, COO at Brightside Agency (22 people). 340 agencies, 4.8 stars from 120 reviews. Pricing: $49/month per company, cancel anytime, no contract. FAQ: Is my data safe? SOC 2 Type II, SSO on the Team plan, data encrypted, hosted in the US. Integrations: QuickBooks, Xero, Stripe, Slack, API docs. Need help? Call us or live chat, a real person sets it up with you. Works on your phone. Start a 14-day free trial, no credit card.' };
const WEAK = { title: 'Solution', description: '', headings: ['Revolutionize your finance'], text: 'Our seamless, cutting-edge, AI-powered all-in-one platform will supercharge and unlock your potential. Robust and effortless. Contact us.' };
const STRONG_BRIEF = `Month-end close for small agencies who do their own books.
Tired of spending 3 days every month matching Stripe payouts to invoices in a spreadsheet?
Instead of exporting CSVs, Ledgerly reconciles every transaction and flags the odd ones.
"We cut our close from 3 days to 4 hours" - an agency COO.
Start a free trial: connect QuickBooks in 5 minutes.`;
const GENERIC_BRIEF = `The AI-powered all-in-one platform for modern businesses.
Seamless, effortless and robust. Supercharge your finance workflow and unlock growth with next-gen automation today.`;
const offline = { panel: async (o) => [{ data: o.fallback(), mock: true, model: 'offline' }] };

async function landingTier(tier, seed) {
  const s = fresh('smb', seed);
  s.apps.product = { features: [{ id: 'f1', title: 'Payout reconciliation', status: 'shipped' }] };
  if (tier === 'stellar') {
    buildSite(s, { path: 'agent_repo', brief: STRONG_BRIEF, spec: true, review: 'every', checks: { ssr: true, meta: true, speed: true }, framework: 'astro' });
    setWebsite(s, { source: 'paste', ...STRONG });
    await runPanel({ state: s, llm: offline });
    iterateSite(s); // on data: the panel ran on this version
  } else {
    buildSite(s, { path: 'lovable', brief: GENERIC_BRIEF, review: 'none', checks: {} });
    setWebsite(s, { source: 'paste', ...WEAK });
    iterateSite(s); iterateSite(s); // blind redesigns
  }
  return readOperator(s, 'positioning_landing');
}

test('positioning_landing: unknown before acting, stellar vs mediocre separate, with evidence and coaching', async () => {
  assert.equal(readOperator(fresh(), 'positioning_landing').tier, 'unknown');
  for (const seed of [3, 11]) {
    const st = await landingTier('stellar', seed), md = await landingTier('mediocre', seed);
    assert.equal(st.tier, 'stellar', `stellar read ${st.tier} ${st.score}: ${st.evidence.join(' | ')}`);
    assert.equal(md.tier, 'mediocre', `mediocre read ${md.tier} ${md.score}: ${md.evidence.join(' | ')}`);
    assert.ok(st.score - md.score > 0.35);
    assert.ok(md.evidence.length >= 3 && md.coaching.length >= 2);
  }
});

test('positioning_landing: re-running the panel on a weak page does not move the tier (no fishing)', async () => {
  const s = fresh('smb', 5);
  setWebsite(s, { source: 'paste', ...WEAK });
  await runPanel({ state: s, llm: offline });
  const a = readOperator(s, 'positioning_landing');
  await runPanel({ state: s, llm: offline }); await runPanel({ state: s, llm: offline });
  const b = readOperator(s, 'positioning_landing');
  assert.equal(a.score, b.score);
  assert.notEqual(b.tier, 'stellar');
});

// ---------------- 4. MVP: abandoning a test is not validation ----------------

test('mvp: an abandoned experiment with no result does not count as validation; one with a result does', () => {
  const s = fresh();
  s.apps.mvp = { experiments: [{ id: 'e1', type: 'smoke', status: 'abandoned', results: null }] };
  assert.equal(hasAnyValidation(s), false);
  s.apps.mvp.experiments.push({ id: 'e2', type: 'concierge', status: 'abandoned', results: null, weeks: [{ w: 1 }] });
  assert.equal(hasAnyValidation(s), true, 'a served week is evidence');
  s.apps.mvp.experiments = [{ id: 'e3', type: 'smoke', status: 'running', results: null }];
  assert.equal(hasAnyValidation(s), true, 'a running test still counts');
});

// ---------------- 5. Reply goodwill combines and expires ----------------

test('customers: a helpful reply multiplies into churnMult, does not stack, and expires', () => {
  const s = fresh();
  const sub = { id: 'sub_x', churnMult: 1.4, status: 'active' };
  ensureStripe(s).subscriptions.push(sub);
  applyReplyHelp(s, sub);
  assert.equal(round(sub.churnMult), round(1.4 * FEEDBACK.churnMultIfHelped), 'combined, not overwritten');
  applyReplyHelp(s, sub);
  assert.equal(round(sub.churnMult), round(1.4 * FEEDBACK.churnMultIfHelped), 'no stacking');
  s.day += FEEDBACK.helpedDays + 1;
  expireReplyHelp(s);
  assert.equal(round(sub.churnMult), 1.4, 'expired back to the other effects');
  assert.equal(sub.replyHelp, undefined);
});

// ---------------- 6. Consumer: hours, roster cap, waste ledger ----------------

test('consumer creators: roster cap applies across hires; UI hours match the engine', () => {
  const s = fresh('b2c');
  const C = ensureConsumer(s);
  const b = postBrief(s, { hooks: ['I stopped paying for 3 apps', '', 'POV: my budget in 2 minutes'], message: 'm', fee: 100 });
  assert.equal(b.hours, briefHours(['I stopped paying for 3 apps', '', 'POV: my budget in 2 minutes']));
  const max = CREATORS.subs[C.creators.sub].rosterMax;
  const r1 = hireCreators(s, { briefId: b.brief.id, count: max });
  assert.equal(r1.posts.length, max);
  assert.equal(hireCount(s, 5), 0);
  const r2 = hireCreators(s, { briefId: b.brief.id, count: 5 });
  assert.equal(r2.ok, false, 'roster full');
  assert.equal(rosterActive(C), max);
  setMarketplace(s, 'pro');
  assert.equal(hireCount(s, 100), CREATORS.subs.pro.rosterMax - max);
});

test('consumer paid: spend before the store listing is live accumulates on one traceable mistake', async () => {
  const { launchCampaign: launchMeta, addAppCreative, paidDay } = await import('../public/apps/consumer/paid.js');
  const s = fresh('b2c');
  const C = ensureConsumer(s);
  C.app.stack = 'expo';
  const cr = addAppCreative(s, { hook: 'I stopped paying for 3 apps', message: 'Budget in 2 minutes' });
  const lc = launchMeta(s, { name: 'pre', objective: 'install', geo: 't1', budget: 50, creativeIds: [cr.creative?.id ?? cr.id].filter(Boolean) });
  assert.notEqual(lc?.ok, false, lc?.error);
  for (let d = 0; d < 3; d++) { paidDay(s); s.day++; }
  const ms = s.mistakes.filter((m) => m.id === 'spent_before_store_live');
  assert.equal(ms.length, 1);
  assert.ok(ms[0].cost.usd >= 100, `accumulated ${ms[0].cost.usd}`);
  assert.equal(s.mistakeTotals.byFunction[ms[0].functionId].usd >= ms[0].cost.usd, true);
});

// ---------------- 7. Keyword stuffing ----------------

test('mvp copyScore: a keyword list does not score like a real offer', () => {
  const real = copyScore({ headline: 'Close your agency books in 2 hours', offer: 'Ledgerly reconciles every Stripe payout against your invoices so you stop spending three days a month in spreadsheets.', audience: 'agency operations leads', price: 49, cta: 'deposit' });
  const stuffed = copyScore({ headline: 'Close your agency books in 2 hours', offer: 'stop save cut no more without instead of never minutes hours per week fewer faster save cut stop hours minutes faster', audience: 'agency operations leads', price: 49, cta: 'deposit' });
  assert.ok(real - stuffed >= 0.3, `${real} vs ${stuffed}`);
});

test('renewalCallScore: keyword lists earn nothing; a real value recap still scores', () => {
  const real = renewalCallScore([{ from: 'me', text: 'Since you started, your team saved about 12 hours a month on reconciliation.' }, { from: 'me', text: 'What are your plans for next year? Would a two-year term that locks the price help?' }]);
  const stuffed = renewalCallScore([{ from: 'me', text: 'saved hours roi usage 12 two-year multi-year lock in plans next year team grow?' }, { from: 'me', text: 'results adoption reduced cut faster errors 3 year' }]);
  assert.ok(real >= 0.06);
  assert.ok(stuffed <= 0, `${stuffed}`);
});
