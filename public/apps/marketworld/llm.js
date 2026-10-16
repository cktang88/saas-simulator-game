// LLM work for the Market app: map the competitor landscape from the player's niche, write each world event as a
// concrete news item / email about the player's niche (WORLD_EVENTS promptHint), and judge battlecards and
// alternatives pages. Every call has a deterministic fallback.

import { notify } from '../../core/state.js';
import { newThread, addMessage } from '../../core/mail.js';
import { fmtDate, hash } from '../../core/util.js';
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
  enterprise_budget_freeze: { kind: 'customer', from: (r, s, inst) => { const c = s && customerFor(s, inst); const nm = c?.company || c?.name; return nm ? { name: s.company.model === 'ent' ? `Procurement, ${nm}` : `${String(c.name || nm).split(/\s+/)[0]} at ${nm}`, email: c.email || 'procurement@customer.example' } : { name: 'Procurement, a customer', email: 'procurement@customer.example' }; } },
  saas_sentiment_shift: { kind: 'investor', from: () => ({ name: 'Your lead investor', email: 'partner@fund.example' }) },
  fake_review_temptation: { kind: 'vendor', from: () => ({ name: 'Top Reviews Agency', email: 'growth@5star-reviews.example' }) },
  review_site_badge: { kind: 'vendor', from: () => ({ name: 'Review site', email: 'badges@reviews.example' }) },
  ios_link_out_opportunity: { kind: 'vendor', from: () => ({ name: 'Payments provider', email: 'updates@payments.example' }) },
};

// A real paying customer, stable per event instance (an item "from a customer" must come from one that exists).
export function customerFor(state, inst) {
  const live = new Set((state.stripe?.subscriptions ?? []).filter((x) => x.status === 'active' || x.status === 'past_due').map((x) => x.customerId));
  const custs = (state.stripe?.customers ?? []).filter((c) => live.has(c.id));
  return custs.length ? custs[parseInt(hash(`${inst?.id ?? ''}|c`), 36) % custs.length] : null;
}

export const NEWS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['headline', 'source', 'body'],
  properties: { headline: { type: 'string', description: 'Max 14 words' }, source: { type: 'string', description: 'Publication, blog or sender name (fictional).' }, body: { type: 'string', description: '60-180 words.' } },
};

// Offline writer: every event is written in the voice of whoever would really send or publish it (the MAIL sender for
// inbox items), filled from game state (company, niche, the rival, a real paying customer, the drawn effect sizes).
// It never falls back to the event's research note (that text is the designer's summary with citations, shown on the
// event card) and never quotes a statistic as fact.
export function newsFallback(state, inst, ev, rival) {
  const co = state.company.name || 'your company';
  const oneLiner = String(state.company.oneLiner || '').split(/[:;(]/)[0].trim();
  const niche = (oneLiner || `${co}'s market`).slice(0, 70);
  const nicheLc = niche.charAt(0).toLowerCase() + niche.slice(1);
  const audience = (oneLiner.match(/\bfor\s+(.{3,50})$/i)?.[1] ?? state.company.icp ?? 'teams like yours').replace(/\.$/, '');
  const r = rival?.name ?? 'A rival';
  const e = inst?.effects ?? {};
  const key = String(inst?.id ?? ev.id);
  const v = (n) => parseInt(hash(`${key}|v`), 36) % n; // stable variant per event instance
  const n0 = (x, d = 0) => (Number.isFinite(+x) ? (+x).toFixed(d) : '');
  const model = state.company.model;
  const cust = customerFor(state, inst);
  const custCo = cust?.company || cust?.name || (model === 'b2c' ? 'a trial user' : 'a trial account');
  const custFirst = String(cust?.name || 'Sam').split(/\s+/)[0];
  const from = MAIL[ev.id]?.from(rival, state, inst)?.name;
  const date = (days) => fmtDate(state, state.day + Math.max(1, Math.round(days)));
  const T = {
    competitor_new_entrant: [`${r} launches: a faster way for ${audience}`, 'Launch post', `Today we're launching ${r}. It does the core job you know, with a cleaner setup and a price around $${rival?.priceMonthly ?? 29}/mo. Early users praise the onboarding; a few note it lacks integrations and exports.`],
    competitor_raise: [`${r} raises $${((rival?.lastRound ?? 4e6) / 1e6).toFixed(1)}M for ${nicheLc}`, 'Startup news', `${r} announced a new round led by a specialist B2B fund. The company plans to grow its sales team and spend on paid acquisition. Expect more ads on shared keywords and more outbound to the same prospects.`],
    competitor_price_cut: [`${r}: new pricing${rival?.freeTier ? ' and a free plan' : ''}`, `${r} newsletter`, `We're making ${r} more accessible: ${rival?.freeTier ? 'a free plan for individuals' : `plans now start at $${rival?.priceMonthly}/mo`}. Existing customers keep their current pricing.`],
    competitor_feature_copy: [`${r} ships a feature that looks a lot like yours`, `${r} changelog`, `New in ${r}: the workflow your customers bought you for. It is rougher, but it removes a reason to choose you in side-by-side comparisons.`],
    competitor_exit: [`${r} ${rival?.status === 'shut_down' ? 'is shutting down' : 'has been acquired'}`, 'Industry news', rival?.status === 'shut_down' ? `${r} will stop service on ${date(75)} and is asking customers to export their data. Its users are looking for alternatives now.` : `${r} was acquired by a larger platform. Customers worry about price increases and a slower roadmap.`],
    ai_lab_feature_overlap: [`A major AI assistant adds a built-in mode for ${nicheLc}`, 'AI lab blog', `Introducing a new mode in the assistant your customers already pay for:\n- Connect your files and accounts in one click\n- Ask it to do the job end to end, then review the result\n- Included in existing plans at no extra cost\n- Available to all paid users this week\nIt covers the simple version of what ${co} does. Edge cases, audit trails and integrations are not mentioned.`],
    llm_price_cut: ['New model: same quality, lower price', from, `We're releasing a new mid-tier model with quality comparable to the one you use today, at about ${n0((1 - (e.inferenceCostMult ?? 0.6)) * 100)}% lower cost per million tokens. Your current model keeps its price. To switch, change the model id in your API calls; we recommend re-running your evaluations first, as output formatting may differ.`],
    llm_model_deprecation: [`Deprecation notice: a model you use retires on ${date(e.noticeDays ?? 60)}`, from, `This is a notice that the model version your organization called in the last 30 days will be retired on ${date(e.noticeDays ?? 60)}. After that date, requests to it will return an error. The recommended replacement is our current model in the same tier. Behaviour, latency and output formatting can differ; see the migration guide in your dashboard.`],
    llm_free_tier_or_limit_cut: ['Changes to free-tier rate limits, effective today', from, `Effective today, free-tier requests per minute and per day are reduced for all projects. Requests above the new limits return HTTP 429. To keep current throughput, enable billing on your project.\n\nForwarded from support: "${custFirst} here from ${custCo}. Half my requests failed this morning with an error. Is something down?"`],
    llm_provider_outage: ['Incident: elevated error rates on the API', 'Provider status page', `Investigating: we are seeing elevated error rates and latency on API requests.\nIdentified: a configuration change in one region; a fix is rolling out.\nResolved: error rates are back to normal after about ${n0(e.durationHours ?? 2, 1)} hours.\n\nSupport inbox: "Your AI feature just spins and then errors. Is it me?" (${custCo})`],
    google_core_update: ['Google confirms a core update is rolling out', 'Search industry blog', `Google confirmed this morning that a core update has started rolling out and will take about two weeks to complete. Expect rankings to move across many sites while it rolls out. Google repeated its usual line: there is nothing specific to fix, focus on helpful content.`],
    meta_ad_account_restricted: ['Your ad account has been restricted', from, `Your ad account has been restricted from advertising because it doesn't follow our Advertising Standards. Your ads have stopped running. If you think this is a mistake, you can request a review. We'll let you know when we have an update.\n\n[Request review]`],
    app_store_rejection: ['Submission rejected: Guideline 3.1.1 - In-App Purchase', from, `Hello,\n\nWe reviewed your app and found it does not comply with the App Review Guidelines.\n\nGuideline 3.1.1 - Business - Payments - In-App Purchase\nYour app includes buttons or text that direct customers to purchasing mechanisms other than in-app purchase.\n\nPlease revise your app and resubmit. You can reply to this message in App Store Connect.`],
    ios_link_out_opportunity: ['You can now link US iOS users to web checkout', from, `Following the court ruling in Epic v. Apple (an appeal is ongoing), apps can link users in the US App Store to an external web checkout. You can turn on a hosted checkout link from your dashboard. Store fees do not apply to purchases made on the web; conversion on web checkout can differ from in-app purchase, so we suggest testing it with part of your traffic.`],
    marketplace_policy_change: [`Partner program update: new listing requirements from ${date(90)}`, from, `We're updating our partner program. From ${date(90)}, listed apps must meet new review and security requirements, and ranking in search will weigh recent reviews and uninstalls more heavily. Apps that do not meet the requirements by then will be hidden from search. Details are in your partner dashboard.`],
    enterprise_budget_freeze: [`${custCo}: software spend review before renewal`, from, model === 'ent' ? `Hello,\n\nAs part of a company-wide review of software spend, we are reviewing all vendor renewals this quarter. Before we can renew ${co}, please send usage figures for our account, the outcome it delivers for our team, and your best renewal pricing. Budget owners have been asked to consolidate overlapping tools.\n\nRegards,\nProcurement` : `Hi, we're going through every subscription we pay for and cutting what we can. Before our renewal: what would it cost to stay on a smaller plan, or can we get a discount? Money is tight this quarter. - ${custFirst}`],
    saas_sentiment_shift: ['Software stocks slide on AI-agent fears', from, `Software stocks fell for a third day as investors bet that AI agents will replace seat-based tools.\n\nQuick one from your investor: "Are you seeing any of this with customers? I'd love a two-line answer on why ${co} gets stronger, not weaker, as agents get better. LPs are asking."`],
    startup_funding_winter: [`${custCo} is cutting tools after its raise fell through`, `${custFirst} at ${custCo}`, `Hey, bad news on our side: our round didn't close, so we're cutting burn hard. We have to drop every tool that isn't critical, and I'm afraid ${co} is on the list unless there's a much cheaper option. Sorry, this isn't about you.\n\nHeadline in the same week: "Seed funding slows as investors pull back."`],
    main_street_slowdown: [`${custFirst} (${custCo}): can we pause?`, `${custFirst} at ${custCo}`, `Hi, it's been really slow here, fewer customers in and everything costs more. Can I pause my account for a couple of months or cancel for now? I'll come back when things pick up. Thanks for understanding.`],
    dtc_cost_squeeze: [`${custCo} is cutting apps`, `${custFirst} at ${custCo}`, `Hi, our ad costs went up and the new import duties ate our margin, so I'm going through every app on the store and uninstalling what I can't tie to revenue. Can you show me what ${co} actually made or saved us last month? Otherwise it has to go.`],
    platform_native_feature: ['The platform adds a built-in version of your feature', 'Platform release notes', `New built-in feature, free on every plan: the basics of what ${co} does, right inside the admin.\n\nFrom ${custCo}: "Saw the announcement. Do I still need ${co}, or does the free one do the same thing?"`],
    card_testing_attack: ['Unusual spike in declined payments', 'Payments risk alert', `We detected an unusual spike in declined card payments on your account: about ${Math.round(e.attempts ?? 1000).toLocaleString('en-US')} authorization attempts in the last hours, most of them small amounts from new cards. This pattern usually means card testing. Review your checkout and consider adding verification.\n\nCustomer email: "There's a $1 charge from ${co} on my card that I didn't make?"`],
    leaked_secret: ['Exposed credential detected in a public repository', 'Secret-scanning alert', `We found a credential that appears to belong to your account in a public location: sk-****${String(hash(key)).slice(0, 4)}. If this credential is valid, anyone can use it.\n\nBilling alert a few hours later: usage on your account is far above its normal level (about $${Math.round(e.abuseCostUSD ?? 1000).toLocaleString('en-US')} so far).`],
    surprise_bill: ['Billing alert: forecast spend exceeded your budget', 'Cloud billing alert', `Your forecasted spend for this month is about ${n0(e.infraBillMult ?? 5)} times your usual bill and has exceeded the budget you set.\n\nLog excerpt: worker=sync status=failed retry=on_error ... worker=sync status=failed retry=on_error (repeating every 2 s since Tuesday)`],
    data_breach: [`Responsible disclosure: ${co} customer data may be exposed`, 'Security researcher', `Hi, I'm a security researcher. While testing I found that one of your endpoints returns other customers' records when the account id in the request is changed. I have not downloaded anything beyond confirming the issue. I'm reporting this privately and will wait 90 days before publishing. Please confirm you received this.`],
    security_questionnaire: [`Security review for the ${co} evaluation`, 'Prospect security team', `Hi, before we can move forward, our security team needs the attached vendor questionnaire completed (SIG Lite). Please return it within 10 business days. A few of the questions:\n1. Do you have a SOC 2 Type II report?\n2. Where is customer data hosted, and who can access it?\n3. Do you support SSO and enforce MFA?\n4. How do you handle subprocessors?\n5. What is your incident notification window?`],
    self_inflicted_outage: [`${co} is down for some customers`, 'Support inbox and monitoring', `Monitoring: ${co} health check failing (HTTP 500).\n\n"Is ${co} down? I can't log in." (${custCo})\n"Second time this month. What's going on?"\n"Nothing loads on my side either."`],
    upstream_outage: ['Widespread outage at a major cloud provider', 'Hosting provider status page', `Investigating: elevated errors in one region affecting compute, storage and networking. Many sites and apps that depend on it are slow or unavailable. We will post updates every 30 minutes. Expected duration is unknown.`],
    negative_public_review: [`New 2-star review of ${co}`, model === 'b2c' ? 'App Store review' : 'Review site', `"Liked it at first, but when something broke I waited days for an answer, and then I was billed again before anyone replied. Fine for simple cases; I'm looking at alternatives." - ${custFirst}${cust ? `, ${custCo}` : ''}`],
    fake_review_temptation: [`Get 50+ verified 5-star reviews for ${co} this week`, from, `Hello Sir/Madam,\n\nWe are a TOP reputation agency. We deliver 100% real verified 5-star reviews on G2, Trustpilot and the App Store from aged accounts, never dropped. Packages from $15 per review, money-back guarantee. Pay by crypto or gift card for discount. Reply YES to start today!!`],
    review_site_badge: [`${co} earned a seasonal badge in its category`, from, `Congratulations! Based on recent reviews from verified users, ${co} earned a seasonal badge in its category. Download the badge kit to add it to your website and emails. Keep collecting reviews to stay eligible next season.`],
    founder_illness: ['Woke up sick', 'Messages', `You: "Fever and I can barely stand. I have calls today."\nFriend: "Cancel them. Nobody wants you on a call like this. Drink something and go back to bed."`],
    family_care_crisis: ['A call from family', 'Phone call', `It's your sister. Dad is in hospital since last night; they're keeping him for tests and someone needs to be there to drive, talk to the doctors and handle the paperwork for the next few weeks.`],
    moving_home: [v(2) ? 'Your partner got a job offer in another city' : 'Lease renewal: new rent from next term', v(2) ? 'Text from your partner' : 'Landlord', v(2) ? `"They made the offer. It's the one I wanted, but it means moving next month. Can we talk tonight?"` : `Hello, your lease ends soon. If you'd like to renew, the new rent will be noticeably higher. If not, please let us know within 30 days so we can schedule viewings.`],
    burnout_episode: ['A note from a friend', 'Message from a friend', `"Hey, you've cancelled on me three times and you sound flat every time we talk. When did you last take a day off? I'm not saying quit, just that this doesn't look sustainable."`],
  };
  const [headline, source, body] = T[ev.id] ?? [ev.label, from ?? 'Industry news', `${ev.label}. This affects companies in ${nicheLc}.`];
  return { headline, source: source ?? from ?? 'Industry news', body };
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
  const mailFrom = MAIL[ev.id]?.from(rival, s, inst);
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
    const t = newThread(s, { subject: n.headline, with: m.from(rival, s, inst), kind: m.kind, app: 'market', refId: n.instId });
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
