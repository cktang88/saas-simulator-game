// Audit of marketing and growth "fake variety": offline writers and judges must react to what the player wrote and who
// is reading it, not return one sentence for everybody. Short, targeted checks; no long simulations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { setCustomerType } from '../public/core/customer-type.js';
import { ensureWorld, seedLandscape, fireEvent } from '../public/apps/marketworld/engine.js';
import { writeNews } from '../public/apps/marketworld/llm.js';
import { WORLD_EVENTS } from '../public/data/world.js';
import { heuristicJudge, judgeArtifact, KINDS, stuffingOf } from '../public/apps/channels/judge.js';
import { postHeuristic, postSkill, judgePost, judgeCreative, creativeHeuristic } from '../public/apps/growth/judges.js';
import { launchPitchCampaign } from '../public/apps/channels/sim.js';
import { newsletterFit } from '../public/apps/growth/organicEngine.js';
import { creatorRating, creatorNicheMatch } from '../public/apps/growth/adsEngine.js';
import { recipientOf } from '../public/apps/lifecycle/judge.js';

function co({ model = 'smb', type = null, oneLiner = 'Automatic bookkeeping for Shopify sellers', icp = 'Shopify sellers doing $20k-$200k a month', seed = 11 } = {}) {
  const s = newState({ companyName: 'Shelfbooks', model, path: 'indie', founderName: 'Maya', seed });
  ensureStripe(s); ensureMarket(s);
  if (type) setCustomerType(s, type);
  s.company.oneLiner = oneLiner; s.company.icp = icp;
  return s;
}
const offline = (s) => ({ state: s, llm: { ask: async (o) => ({ mock: true, data: o.fallback() }), panel: async (o) => [{ model: 'm', mock: true, data: o.fallback() }] } });

// ---------------------------------------------------------------- world news offline writer

test('world news offline: every event is written in its sender\'s voice, never the research note', async () => {
  const s = co();
  for (let i = 0; i < 3; i++) { const c = createCustomer(s, { name: `Owner ${i}`, email: `o${i}@shop${i}.com`, company: `Shop ${i}` }); subscribe(s, c.id, s.plans[0], { trial: false }); }
  seedLandscape(s);
  const W = ensureWorld(s);
  const bodies = new Set();
  for (const ev of WORLD_EVENTS) {
    const inst = fireEvent(s, ev);
    if (!inst) continue;
    const n = W.news.find((x) => x.instId === inst.id);
    await writeNews(offline(s), n.id);
    assert.notEqual(n.body, ev.effects.text, `${ev.id} fell back to the research note`);
    assert.doesNotMatch(n.body, /\bcf\.|No published base rate|\(Sifted|\(G2 20|per violation/, `${ev.id} quotes research notes`);
    assert.notEqual(n.source, 'Newswire', `${ev.id} is attributed to a generic newswire`);
    assert.notEqual(n.headline, ev.label, `${ev.id} headline is the design label`);
    bodies.add(n.body);
    if (n.threadId) {
      const t = s.mail.threads.find((x) => x.id === n.threadId);
      assert.ok(t, `${ev.id} thread`);
    }
  }
  assert.ok(bodies.size >= WORLD_EVENTS.length - 1, 'each event reads differently');
  const scam = W.news.find((x) => x.eventId === 'fake_review_temptation');
  assert.doesNotMatch(scam.body, /illegal|FTC/i, 'the scam agency does not warn you it is illegal');
  const freeze = W.news.find((x) => x.eventId === 'enterprise_budget_freeze');
  assert.match(`${freeze.source} ${freeze.body} ${freeze.headline}`, /Shop \d/, 'a customer email comes from a real paying customer');
});

// ---------------------------------------------------------------- channels judge

const GOOD = {
  pr_pitch: 'Hi Dana, your piece on Shopify sellers losing margin to app fees stuck with me. We looked at anonymized books from 412 Shopify stores and found the median seller pays $311 a month in apps, 9% of gross margin, and 38% of it goes to apps nobody opened in 60 days. Happy to share the full dataset first, plus two sellers who cut $2,400 a year. Would that work for a story next week?',
  affiliate_outreach: 'Hi Jo, your post on Shopify bookkeeping (the 3-hour month-end close) was spot on. We pay 30% recurring commission for 12 months with a 60-day cookie; your audience of Shopify sellers is exactly who we serve. Would you be open to a demo account and a custom link?',
  referral_email: 'You have been closing your Shopify books with us for 3 months. If a friend who sells on Shopify signs up with your link, you both get one month free credit. Share the link with one colleague who still reconciles payouts by hand.',
};
const salad = (k) => `${KINDS[k].keys.join(' ')} ${KINDS[k].keys.join(' ')} ${KINDS[k].keys.join(' ')} Shopify sellers month would you? ${'and the of '.repeat(12)}`;

test('channels judge: a list of the words the judge looks for scores below a real draft, for every kind', () => {
  const s = co();
  for (const k of Object.keys(KINDS)) {
    const st = heuristicJudge(s, k, salad(k), {});
    assert.ok(st.score <= 3.5, `${k}: keyword salad scored ${st.score}`);
    assert.equal(st.accept, false, `${k}: keyword salad accepted`);
    assert.ok(stuffingOf(salad(k), KINDS[k].keys).stuffed, `${k} stuffing detected`);
  }
  for (const [k, t] of Object.entries(GOOD)) {
    const g = heuristicJudge(s, k, t, { recipient: t.match(/^Hi (\w+)/)?.[1] });
    assert.ok(g.score >= 4.5 && g.score >= heuristicJudge(s, k, salad(k)).score + 1.5, `${k}: real draft ${g.score}`);
    assert.equal(stuffingOf(t, KINDS[k].keys).stuffed, false, `${k}: real prose flagged as stuffing`);
  }
});

test('channels judge: each reader answers in their own voice and the outlet changes the bar', () => {
  const s = co();
  const verdicts = new Set(), replies = new Set();
  for (const k of Object.keys(KINDS)) {
    for (const t of [GOOD.pr_pitch, 'Revolutionize your workflow with our seamless all-in-one solution. Unlock synergy today!']) {
      const r = heuristicJudge(s, k, t, {});
      verdicts.add(r.verdict);
      if (r.reply) replies.add(r.reply);
    }
  }
  assert.ok(verdicts.size >= 20, `only ${verdicts.size} distinct verdicts across ${Object.keys(KINDS).length} readers`);
  assert.ok(![...replies].includes('Interesting — send me more details.'));
  const product = 'Hi Sam, we just launched a new dashboard for Shopify sellers that shows payouts and fees in one place. It took us 4 months to build and early customers like it. Would you cover the launch this week?';
  const t1 = heuristicJudge(s, 'pr_pitch', product, { tier: 'tier1', recipient: 'Sam' });
  const tr = heuristicJudge(s, 'pr_pitch', product, { tier: 'trade', recipient: 'Sam' });
  assert.ok(t1.score < tr.score - 1, `tier-1 desk ${t1.score} vs trade ${tr.score} on product news`);
  const pitchy = 'In this talk I will demo Shelfbooks, show how Shelfbooks reconciles payouts, and explain why Shelfbooks is the best tool for sellers. Attendees can sign up for Shelfbooks with a discount after the session. We will learn how Shelfbooks works step by step and see a live demo of our product.';
  const practitioner = 'We tried three ways to reconcile Shopify payouts across 412 stores and two of them failed. This talk covers the data: 38% of refund mismatches came from partial refunds split across payouts, what we measured, the mistakes we made with currency rounding, and a checklist attendees can apply to their own month-end close the next day. Lessons are tool-agnostic.';
  assert.ok(heuristicJudge(s, 'talk_abstract', practitioner).score > heuristicJudge(s, 'talk_abstract', pitchy).score + 1.5);
});

test('channels judge: stellar > good > average > mediocre pitches separate, and offline results are labelled offline', async () => {
  const s = co();
  const tiers = [
    GOOD.pr_pitch,
    'Hi Dana, we analysed 400 Shopify stores and found sellers spend about 9% of margin on apps they rarely use. Happy to share the numbers. Would this fit your coverage?',
    'Hi, we are a bookkeeping app for Shopify sellers. We help sellers save time on bookkeeping and we have some customers. Would you write about us?',
    'Revolutionize your finance with our seamless, cutting-edge, AI-powered all-in-one solution. Unlock synergy and supercharge growth!',
  ].map((t) => heuristicJudge(s, 'pr_pitch', t, { tier: 'trade', recipient: 'Dana' }).score);
  for (let i = 1; i < tiers.length; i++) assert.ok(tiers[i - 1] > tiers[i], `tier ${i - 1} ${tiers[i - 1]} vs ${i} ${tiers[i]}`);
  const j = await judgeArtifact(offline(s), 'pr_pitch', GOOD.pr_pitch, { tier: 'trade' });
  assert.equal(j.mock, true);
});

// ---------------------------------------------------------------- launch audiences

test('Show HN and Product Hunt are judged by their own audiences, not an X follower', async () => {
  const s = co();
  const hnGood = 'Show HN: Shelfbooks – reconciles Shopify payouts against bank deposits\n\nI built this after spending 6 hours a month matching payouts by hand. It pulls payouts from the Shopify API, splits fees and refunds, and matches them to bank transactions with a small rules engine (Postgres + TypeScript). The hard part was partial refunds; it gets 94% of 3,000 test payouts right. Demo works without signup. I would love feedback on the matching rules.';
  const hnHype = 'Show HN: Shelfbooks – the revolutionary AI-powered bookkeeping game-changer 🚀\n\nWe\'re thrilled to launch the future of bookkeeping! Seamless and effortless. Sign up now and use code HN20 for 20% off, limited time!! Join the waitlist and book a demo.';
  const g = postSkill([postHeuristic(s, hnGood, 'hn')]), b = postSkill([postHeuristic(s, hnHype, 'hn')]);
  assert.ok(g > b + 0.4, `HN technical ${g} vs hype ${b}`);
  assert.ok(postSkill([postHeuristic(s, hnHype, 'hn')]) < postSkill([postHeuristic(s, hnHype, 'x')]), 'HN punishes hype harder than X');
  assert.match(postHeuristic(s, hnHype, 'hn').reaction, /HN|Flagged/);
  const phGood = 'Bookkeeping that reconciles your Shopify payouts\n\nShelfbooks matches every payout to your bank deposit.\n\nHey hunters! I built Shelfbooks because I spent 6 hours a month doing this by hand. Product Hunt community: 3 months free with code PH. What is the worst part of your month-end?';
  const phVague = 'The revolutionary all-in-one AI-powered platform to supercharge your seamless finance journey forever\n\nUnlock next-gen bookkeeping.\n\nSign up now!';
  assert.ok(postSkill([postHeuristic(s, phGood, 'product_hunt')]) > postSkill([postHeuristic(s, phVague, 'product_hunt')]) + 0.3);
  const systems = {};
  for (const p of ['x', 'hn', 'product_hunt', 'friends']) {
    await judgePost({ state: s, llm: { panel: async (o) => { systems[p] = o.system; return [{ model: 'm', mock: true, data: o.fallback() }]; } } }, hnGood, p);
  }
  assert.match(systems.hn, /Hacker News/);
  assert.match(systems.product_hunt, /Product Hunt/);
  assert.match(systems.friends, /friend/);
  assert.equal(new Set(Object.values(systems)).size, 4);
});

test('the ad audience and lifecycle recipient follow the customer type', async () => {
  const sys = {};
  for (const [model, type] of [['smb', 'startups'], ['smb', 'local_smb'], ['smb', 'ecommerce'], ['ent', 'enterprise'], ['b2c', 'consumers']]) {
    const s = co({ model, type });
    await judgeCreative({ state: s, llm: { panel: async (o) => { sys[type] = o.system; return [{ model: 'm', mock: true, data: o.fallback() }]; } } }, { format: 'static', hook: 'Still matching payouts by hand at midnight?', primaryText: 'Shelfbooks reconciles them in 5 minutes.', headline: 'Close the month in 1 hour', cta: 'Start free trial' });
    assert.ok(creativeHeuristic(s, { hook: 'x', primaryText: '', headline: '', cta: '' }).reaction.length > 5);
    sys[`r_${type}`] = recipientOf(s);
  }
  assert.equal(new Set(['startups', 'local_smb', 'ecommerce', 'enterprise', 'consumers'].map((t) => sys[t])).size, 5);
  assert.match(sys.local_smb, /local business/);
  assert.match(sys.enterprise, /procurement/);
  assert.notEqual(sys.r_startups, sys.r_local_smb);
});

// ---------------------------------------------------------------- PR replies

test('PR replies depend on the outlet and hook, and come from the reporter\'s own address', () => {
  const run = (tier, hook) => {
    const s = co({ seed: 3 });
    const camp = launchPitchCampaign(s, { tier, hook, listSize: 150, personalized: true, judged: { quality: 0.9, words: 120 } });
    assert.ok(camp.replies >= 1);
    return s.apps.channels.mail.filter((m) => m.refId === camp.id);
  };
  const t1 = run('tier1', 'product'), tr = run('trade', 'data');
  for (const m of [...t1, ...tr]) assert.equal(m.email.split('@')[0], m.from.split(' ')[0].toLowerCase(), 'sender and address match');
  assert.ok(t1.every((m) => !/funding rounds above/.test(m.body)), 'a product pitch does not get a funding-only rejection');
  const b1 = new Set(t1.map((m) => m.body)), b2 = new Set(tr.map((m) => m.body));
  assert.ok([...b2].some((x) => !b1.has(x)), 'a trade data pitch hears different replies than a tier-1 product pitch');
});

// ---------------------------------------------------------------- newsletters and UGC creators

test('newsletter fit follows the readers\' niche, not a coin flip', () => {
  const s = co({ model: 'b2c', oneLiner: 'A budgeting app that tracks your spending', icp: 'young adults paying off debt' });
  const fin = newsletterFit(s, { niche: 'personal finance', fit: 0.7 });
  const fitness = newsletterFit(s, { niche: 'fitness', fit: 0.7 });
  const broad = newsletterFit(s, { niche: 'general consumer', fit: 0.7 });
  assert.ok(fin > broad && broad > fitness, `${fin} ${broad} ${fitness}`);
  assert.ok(newsletterFit(s, { niche: 'fitness', fit: 1 }) < fin, 'a highly engaged wrong list still loses to the right one');
});

test('creator posts: a hook stuffed with ICP keywords does not out-install a specific hook', async () => {
  const { viewToInstall, hookSkill } = await import('../public/apps/consumer/creators.js');
  const s = co({ model: 'b2c', oneLiner: 'A budgeting app for young adults paying off student debt', icp: 'young adults paying off student loans and credit card debt' });
  const installs = (hook) => {
    const eff = Math.min(1, 0.6 * hookSkill(s, hook, '') + 0.2) * 0.85;
    return (0.6 + 0.8 * eff) * viewToInstall(s, { hook, creator: { match: 0.7 } }, { message: '' });
  };
  const good = installs('I paid off $4,200 of credit card debt in 7 months with one rule');
  const stuffed = installs('budgeting young adults paying student debt budgeting app student loans credit card debt young adults');
  const generic = installs('This app changed my life, you need it');
  assert.ok(good > stuffed * 1.4, `good ${good} vs stuffed ${stuffed}`);
  assert.ok(stuffed < generic * 1.2, `stuffed ${stuffed} vs generic ${generic}`);
});

test('UGC creator ratings track skill (weakly) and niche match matters', () => {
  const lo = creatorRating(0.35, 0.5, 200), hi = creatorRating(0.9, 0.5, 200);
  assert.ok(hi > lo + 0.2, `${hi} vs ${lo}`);
  assert.ok(creatorRating(0.35, 1, 200) >= 4.3 && creatorRating(0.95, 1, 200) <= 5);
  const s = co({ model: 'b2c', oneLiner: 'A budgeting app that tracks your spending', icp: 'young adults' });
  assert.ok(creatorNicheMatch(s, 'personal finance') > creatorNicheMatch(s, 'ASMR / aesthetic'));
});
