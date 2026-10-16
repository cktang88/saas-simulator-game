// LLM work for the Market app: map the competitor landscape from the player's niche, write each world event as a
// concrete news item / email about the player's niche (WORLD_EVENTS promptHint), and judge battlecards and
// alternatives pages. Every call has a deterministic fallback.

import { notify } from '../../core/state.js';
import { newThread, addMessage } from '../../core/mail.js';
import { fmtDate } from '../../core/util.js';
import { ensureWorld, eventById } from './engine.js';
import { pageHeuristic, pageScore } from './model.js';
import { averageField, REALISM } from '../../core/llm.js';
import { bizBlock } from '../context.js';
import { rubricText } from '../../core/rubric.js';
import { rubricSchema, cleanRubric, to5, to10 } from '../../core/rubric-schema.js';
import { PAGE_RUBRIC } from './rubric.js';

const business = (s) => `Company: ${s.company.name}. One-liner: ${s.company.oneLiner || '(none)'}. ICP: ${s.company.icp || '(not set)'}. Model: ${s.company.model}. Price: ${s.plans.filter((p) => p.active).map((p) => `$${p.price}/${p.interval}`).join(', ')}.`;

// ---------------- News ----------------

// Events that arrive as an email/message in Mail rather than (only) as public news.
const MAIL = {
  competitor_price_cut: { kind: 'vendor', from: (r) => (r?.real ? { name: `${r.name} (simulated)`, email: 'simulated-competitor@example.com' } : { name: r ? `${r.name} Team` : 'Competitor', email: r ? `news@${r.domain}` : 'news@example.com' }) },
  llm_price_cut: { kind: 'vendor', from: () => ({ name: 'LLM provider', email: 'updates@llm-provider.example' }) },
  llm_model_deprecation: { kind: 'vendor', from: () => ({ name: 'LLM provider', email: 'deprecations@llm-provider.example' }) },
  llm_free_tier_or_limit_cut: { kind: 'vendor', from: () => ({ name: 'LLM provider', email: 'api@llm-provider.example' }) },
  meta_ad_account_restricted: { kind: 'vendor', from: () => ({ name: 'Meta for Business', email: 'noreply@business.facebook.example' }) },
  app_store_rejection: { kind: 'vendor', from: () => ({ name: 'App Store Connect', email: 'no_reply@appstore.example' }) },
  marketplace_policy_change: { kind: 'vendor', from: () => ({ name: 'Partner Program', email: 'partners@marketplace.example' }) },
  enterprise_budget_freeze: { kind: 'customer', from: () => ({ name: 'Procurement, a customer', email: 'procurement@customer.example' }) },
  saas_sentiment_shift: { kind: 'investor', from: () => ({ name: 'Your lead investor', email: 'partner@fund.example' }) },
  fake_review_temptation: { kind: 'vendor', from: () => ({ name: 'Top Reviews Agency', email: 'growth@5star-reviews.example' }) },
  review_site_badge: { kind: 'vendor', from: () => ({ name: 'Review site', email: 'badges@reviews.example' }) },
  ios_link_out_opportunity: { kind: 'vendor', from: () => ({ name: 'Payments provider', email: 'updates@payments.example' }) },
};

export const NEWS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['headline', 'source', 'body'],
  properties: { headline: { type: 'string', description: 'Max 14 words' }, source: { type: 'string', description: 'Publication, blog or sender name (fictional).' }, body: { type: 'string', description: '60-180 words.' } },
};

// Offline bodies for events that arrive as an EMAIL from a sender (MAIL above). These used to fall back to the event's
// design description, so "Meta for Business" wrote "Most cases resolve in 3-21 days; 10-20% are permanent. (No published
// base rate.)" and the review-selling agency's pitch warned that buying reviews is illegal under the FTC rule. Each is
// now written in its sender's voice from the effects drawn for this instance (dates, error rates, sizes).
const mid = (v) => (Array.isArray(v) ? (v[0] + v[1]) / 2 : v);
const MAIL_FALLBACK = {
  llm_price_cut: (s, e) => ['A cheaper model with the same quality is now available', 'LLM provider', `We have released a new model version that matches the current one on our evaluations at about ${Math.round((1 - (mid(e.inferenceCostMult) ?? 0.6)) * 100)}% lower cost per token. Your existing model keeps working at its current price. To switch, update the model name in your API calls; we recommend re-running your own evaluations first, since outputs can differ in format and length.`],
  llm_model_deprecation: (s, e) => [`Deprecation notice: a model you use retires in ${Math.round(mid(e.noticeDays) ?? 90)} days`, 'LLM provider', `You are receiving this because your organization made requests to a model that is scheduled for retirement in ${Math.round(mid(e.noticeDays) ?? 90)} days. After that date requests to it will fail. We recommend migrating to the current model and testing your prompts before the retirement date; its behaviour, formatting and refusal patterns differ from the retiring version.`],
  llm_free_tier_or_limit_cut: (s, e) => ['Changes to free-tier rate limits', 'LLM provider', `Starting this week, free-tier projects have lower request and token limits. Requests above the new limits return HTTP 429. In your project we currently see about ${Math.round((mid(e.errorRate) ?? 0.2) * 100)}% of requests exceeding them. To keep production traffic running, enable billing or add retry with backoff.`],
  meta_ad_account_restricted: () => ['Your ad account has been restricted', 'Meta for Business', 'Your ad account has been restricted from advertising because of activity that does not follow our Advertising Standards. Ads in this account have stopped delivering. If you think this is a mistake, you can request a review in Account Quality. Creating new ad accounts to get around this restriction may result in further restrictions.'],
  app_store_rejection: (s, e) => ['Your app submission was rejected', 'App Store Connect', `We reviewed your latest submission and found that it does not comply with the App Review Guidelines (metadata, in-app purchase wording or privacy details). Reply in Resolution Center once you have made the changes. A re-review usually takes ${Math.max(1, Math.round(mid(e.releaseDelayDays) ?? 3))} day(s) after you resubmit.`],
  marketplace_policy_change: () => ['Upcoming changes to the partner program', 'Partner Program', 'We are updating listing requirements and how apps are ranked in the marketplace. Existing listings must meet the new review requirements before the deadline in the partner portal or they will be hidden from search. Fees for new installs change at the same time. Details and the migration guide are in your partner dashboard.'],
  enterprise_budget_freeze: (s) => [`Vendor spend review at ${(s.stripe?.customers ?? []).slice(-1)[0]?.company || 'a customer'}`, 'Procurement, a customer', 'Hi, as part of a company-wide cost review we are pausing new software purchases this quarter and reviewing every renewal. Please send your best renewal pricing and usage data for our account by the end of the month. Tools without clear usage will not be renewed.'],
  saas_sentiment_shift: () => ['Quick note on the funding market', 'Your lead investor', 'Hi, a heads-up from our side: after the recent selloff in public software, our partners and other funds are asking every portfolio company the same question, which is what stops an AI agent from doing what you sell. If you were planning to raise in the next two quarters, expect a longer process and lower valuations than we discussed.'],
  fake_review_temptation: (s) => [`Get ${s.company.name} to 50 five-star reviews this month`, 'Top Reviews Agency', `Hi, we help SaaS companies build social proof fast: 50 verified 5-star reviews on G2, Capterra and Trustpilot within 30 days, written by real accounts in your target market. Fully safe, natural pacing, no ties to ${s.company.name}. Packages from $490. Want a sample?`],
  review_site_badge: (s) => [`${s.company.name} earned a seasonal badge`, 'Review site', `Congratulations! Based on recent reviews, ${s.company.name} qualifies for this season's badge in your category. Download it from your vendor portal for your website and sales materials. Badges are recalculated each season from new reviews.`],
  ios_link_out_opportunity: () => ['You can now link US iOS users to web checkout', 'Payments provider', 'Following the recent court order, apps on the US App Store may link to an external web checkout without paying the App Store commission on those purchases. Our docs show how to add a payment link and keep subscriptions in sync. Conversion on web checkout can be lower than in-app purchase, so test it on a share of users first.'],
};

export function newsFallback(state, inst, ev, rival) {
  const niche = (state.company.oneLiner || `${state.company.name}'s market`).split(/[:,;(]/)[0].slice(0, 60).trim();
  const r = rival?.name ?? 'A rival';
  const T = {
    competitor_new_entrant: [`${r} launches: "the faster way" for ${niche.split(' for ')[1] ?? 'teams like yours'}`, 'Launch post', `Today we're launching ${r}. It does the core job you know, with a cleaner setup and a price around $${rival?.priceMonthly ?? 29}/mo. Early users praise the onboarding; a few note it lacks integrations and exports.`],
    competitor_raise: [`${r} raises $${((rival?.lastRound ?? 4e6) / 1e6).toFixed(1)}M to expand in ${niche}`, 'Startup news', `${r} announced a new round led by a specialist B2B fund. The company plans to grow its sales team and spend on paid acquisition. Expect more ads on shared keywords and more outbound to the same prospects.`],
    competitor_price_cut: [`${r}: new pricing${rival?.freeTier ? ' and a free plan' : ''}`, `${r} newsletter`, `We're making ${r} more accessible: ${rival?.freeTier ? 'a free plan for individuals' : `plans now start at $${rival?.priceMonthly}/mo`}. Existing customers keep their current pricing.`],
    competitor_feature_copy: [`${r} ships a feature that looks a lot like yours`, `${r} changelog`, `New in ${r}: the workflow your customers bought you for. It is rougher, but it removes a reason to choose you in side-by-side comparisons.`],
    competitor_exit: [`${r} ${rival?.status === 'shut_down' ? 'is shutting down' : 'has been acquired'}`, 'Industry news', rival?.status === 'shut_down' ? `${r} will stop service in about 90 days and is asking customers to export their data. Its users are looking for alternatives now.` : `${r} was acquired by a larger platform. Customers worry about price increases and a slower roadmap.`],
  };
  const [headline, source, body] = T[ev.id] ?? MAIL_FALLBACK[ev.id]?.(state, inst?.effects ?? {}) ?? [ev.label, 'Newswire', ev.effects.text];
  return { headline, source, body };
}

// Game-state facts an item must stay consistent with: what happened (the event's direction), the rival's drawn numbers,
// and the real customers, tickets and bugs when the item comes from a customer. Without them the model invents a customer
// that does not exist, a round size the Market app contradicts, or a "price cut" that raises the price.
export function newsFacts(s, ev, rival) {
  const out = [`What happened (the item must match this): ${ev.label}. ${ev.effects?.text ?? ''}`];
  if (rival && ev.id === 'competitor_price_cut') out.push(`${rival.name} charges $${rival.priceMonthly}/mo today: the new price must be LOWER than that, or a new free plan.`);
  if (rival?.lastRound && ev.id === 'competitor_raise') out.push(`Round size (game state, use exactly): $${(rival.lastRound / 1e6).toFixed(1)}M.`);
  if (['enterprise_budget_freeze', 'negative_public_review', 'self_inflicted_outage', 'security_questionnaire'].includes(ev.id)) {
    const subs = new Map((s.stripe?.subscriptions ?? []).filter((x) => x.status === 'active' || x.status === 'past_due').map((x) => [x.customerId, x]));
    const cus = (s.stripe?.customers ?? []).filter((c) => subs.has(c.id)).slice(-6).map((c) => c.company || c.name).filter(Boolean);
    out.push(cus.length ? `Paying customers in the game (an item from a customer must come from one of these): ${[...new Set(cus)].join(', ')}.` : 'The company has no paying customers yet: an item from a customer must come from a trial user or prospect.');
    const tickets = (s.apps?.support?.tickets ?? []).filter((t) => t.createdDay > s.day - 30);
    if (tickets.length) out.push(`Support tickets in the last 30 days: ${tickets.length} (${[...new Set(tickets.map((t) => String(t.category ?? 'other').replace(/_/g, ' ')))].slice(0, 3).join(', ')}).`);
    const bugs = (s.apps?.product?.bugs ?? []).filter((b) => !b.fixedDay).slice(0, 3).map((b) => b.title ?? b.text).filter(Boolean);
    if (bugs.length) out.push(`Open bugs: ${bugs.join('; ')}.`);
  }
  return out.join('\n');
}

export async function writeNews(ctx, newsId) {
  const s = ctx.state;
  const W = ensureWorld(s);
  const n = W.news.find((x) => x.id === newsId);
  if (!n || !n.pending) return;
  const inst = W.active.find((i) => i.id === n.instId);
  const ev = eventById(n.eventId);
  const rival = inst?.rivalId ? W.rivals.find((c) => c.id === inst.rivalId) : null;
  const names = W.rivals.filter((c) => c.status === 'active').map((c) => c.name).join(', ');
  // Who is speaking: an email from a vendor/platform/customer/investor TO the founder, or third-party news. Never the player's own company.
  const mailFrom = MAIL[ev.id]?.from(rival);
  const voice = mailFrom ? `This arrives in the founder's inbox as an email from ${mailFrom.name}${MAIL[ev.id].kind === 'vendor' ? ' (a vendor or platform the player uses or competes with)' : ''}. Write it in that sender's voice, addressed to the player's company as one recipient among many; "source" is the sender name.` : 'This is third-party news (trade press, a blog, a launch post), not written by the player\'s company.';
  const res = await ctx.llm.ask({
    task: 'world_news_item',
    system: `You write realistic in-game news, emails and notices for a startup simulator set in ${fmtDate(s)}. Never invent statistics or real company facts; use only fictional company names unless the hint names a major platform (Google, Meta, Apple, OpenAI, Anthropic) or the competitor is one of the game's competitors listed below (events about real companies are simulated and must be framed as such).`,
    prompt: `${ev.promptHint}\n${voice} Never write as ${s.company.name} and never announce changes to ${s.company.name}'s own product or prices.${rival?.real ? `\n\nIMPORTANT: ${rival.name} is a real company, but this is a SIMULATED event in a business game that did not happen. Write it as an in-game scenario, do not cite real sources, and do not state it as fact.` : ''}\n\nPlayer: ${business(s)}\n${newsFacts(s, ev, rival)}\nCompetitors in the game: ${names || 'none yet'}${rival ? `\nThe competitor in this event: ${rival.name} (${rival.positioning}; ${rival.funding}; $${rival.priceMonthly}/mo${rival.freeTier ? ', free tier' : ''})` : ''}\nDrawn effect sizes (do not quote as statistics): ${JSON.stringify(inst?.effects ?? {})}.`,
    schema: NEWS_SCHEMA, temperature: 0.8, maxTokens: 1700,
    fallback: () => newsFallback(s, inst, ev, rival), cache: s.cache,
  });
  // Real companies only appear in SIMULATED events: never present them as something that really happened.
  // The same for an item that names a real AI lab or platform product (e.g. a launch "from Anthropic"): it is a scenario.
  if (!n.simulated && !res.mock && ['ai_lab', 'platform'].includes(ev.category) && /\b(OpenAI|ChatGPT|Anthropic|Claude|Google|Gemini|Meta|Apple)\b/.test(`${res.data.headline} ${res.data.source}`)) n.simulated = true;
  if (n.simulated) res.data.headline = `Simulated: ${String(res.data.headline).replace(/^simulated:\s*/i, '')}`;
  Object.assign(n, { headline: res.data.headline, source: res.data.source, body: res.data.body, pending: false, mock: res.mock });
  const m = MAIL[ev.id];
  if (m) {
    const t = newThread(s, { subject: n.headline, with: m.from(rival), kind: m.kind, app: 'market', refId: n.instId });
    addMessage(s, t.id, { from: 'them', body: n.body });
    n.threadId = t.id;
  }
  const bad = ['competitor', 'ai_lab', 'macro'].includes(ev.category) && ev.id !== 'llm_price_cut' && ev.id !== 'competitor_exit';
  notify(s, `${n.headline}${ev.playerResponses?.length > 1 ? ' (decide how to respond in Market)' : ''}`, { type: bad ? 'bad' : 'info', app: 'market' });
}

// ---------------- Battlecards / alternatives pages ----------------

export const PAGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['rubric', 'trashTalk', 'feedback'],
  properties: {
    rubric: rubricSchema(PAGE_RUBRIC),
    trashTalk: { type: 'boolean', description: 'true if it mocks or insults the competitor' },
    feedback: { type: 'string', description: 'Max 60 words in the voice of a skeptical buyer reading the page: your reaction, quoting the passage that lost you. React, do not coach.' },
  },
};

/** Normalise a judge result (rubric from the model, or legacy 1-10 fields from the offline heuristic) to both shapes. */
export function normalizePage(d) {
  if (d.rubric) {
    const rubric = cleanRubric(d.rubric, PAGE_RUBRIC);
    return { ...d, rubric, accuracy: to10(rubric.accuracy), differentiation: to10(rubric.differentiation), usefulness: to10(rubric.actionability), fairness: to10(rubric.fairness) };
  }
  const rubric = cleanRubric({ accuracy: to5(d.accuracy), differentiation: to5(d.differentiation), actionability: to5(d.usefulness), fairness: to5(d.fairness), proof: to5(d.accuracy) - 1 }, PAGE_RUBRIC);
  return { ...d, rubric };
}
export async function judgePage(ctx, { rival, kind, title, text }) {
  const s = ctx.state;
  const who = kind === 'battlecard' ? `a sales rep at ${s.company.name} about to get on a call where the buyer mentions ${rival.name}` : `a buyer comparing ${s.company.name} and ${rival.name}, skeptical of vendor-written comparison pages`;
  const res = await ctx.llm.panel({
    task: 'battlecard_review', rubric: PAGE_RUBRIC, context: bizBlock(ctx.state, 'insider'),
    system: `${REALISM}\nYou are ${who}. ${rival.name}: ${rival.positioning}; $${rival.priceMonthly}/mo${rival.freeTier ? ' with a free tier' : ''}.\n${rubricText(PAGE_RUBRIC)}\nCompetitor feature lists, length or repeated claims earn nothing without a buyer situation, a talk track or a proof point.`,
    prompt: `${business(s)}\n${kind === 'battlecard' ? 'Internal battlecard' : kind === 'vs' ? `Public "${s.company.name} vs ${rival.name}" page` : `Public "${rival.name} alternatives" page`}: ${title}\n---\n${String(text).slice(0, 6000)}\n---`,
    schema: PAGE_SCHEMA, temperature: 0.5, maxTokens: 1800,
    fallback: () => pageHeuristic(text, rival.name, s.company.name), cache: s.cache,
  });
  const results = res.map((r) => ({ model: r.model, mock: r.mock, ...normalizePage(r.data) }));
  const avg = (f) => averageField(results.map((d) => ({ data: d })), f) ?? 5;
  const score = pageScore({ accuracy: avg('accuracy'), differentiation: avg('differentiation'), usefulness: avg('usefulness'), fairness: avg('fairness'), trashTalk: results.some((r) => r.trashTalk) });
  return { score, results, mock: results.some((r) => r.mock) };
}
