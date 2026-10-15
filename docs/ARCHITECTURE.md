# Architecture & app contract

The simulator is a zero-dependency browser app (`public/`) served by `server.js` (static files + `/api/llm` OpenRouter proxy + `/api/site` page fetcher). Game state is one JSON object persisted in IndexedDB. Time advances in whole days.

## Principles

1. **Practice the real skill.** Each tool should look and behave like the tool a real founder uses in 2026 (Mercury, Stripe, HubSpot/Attio, Instantly/Smartlead, Meta Ads Manager, Linear, Carta, Gusto/Deel, Clerky…). The player does the actual work: writes the actual email, the actual feature spec, the actual pitch, picks the actual budget.
2. **Real inputs where possible.** Real prospects (manual or CSV), real websites (fetched via `/api/site`), the player's real LinkedIn/bio/deck (uploaded files), real copy. AI personas judge them.
3. **Realistic numbers.** Use `docs/research/*.md` (sourced 2025–2026 benchmarks). Shared numbers live in `public/core/params.js`; app-specific numbers go at the top of the app module with a source comment. Never present a `[design]`/`[A]` assumption to players as a real statistic.
4. **Time costs.** Every player action costs founder hours via `ctx.act(fn, { hours, label })`. Use realistic durations (writing a personalized cold email ≈ 6–10 min, a discovery call ≈ 45 min, a feature spec ≈ 30–60 min, etc.).
5. **2026, not 2016.** AI agents, AI SDRs, AI coding agents, AI search, Meta Advantage+, Stripe Billing, post-money SAFEs, solo founders, micro-SaaS. Call out outdated playbooks in UI copy where relevant.
6. **LLM = judgment, statistics = scale.** Use LLM personas for judging quality (an email, a page, a feature, a pitch, a call) on a *sample*; use the statistical model for volume. LLM output must be calibrated against real base rates (e.g. most cold emails get no reply — gate with deliverability/attention probabilities first, then let the persona decide).
7. **Operator quality must show, in every function.** Every business function and system (sales, marketing, product, support, success, finance, accounting, legal, hiring, fundraising, pricing, partnerships, ops, even calendar and inbox) must clearly separate a *stellar*, *good*, *average* and *mediocre* operator, with outcomes as realistic as the research allows. Quality comes from what the player actually does: the specificity of the email, the questions on the call, the spec, which metrics they watch, timing, follow-through, what they choose not to do. It never comes from a difficulty setting or clicking more. Each function needs (a) inputs that real skill changes (LLM judges plus heuristics that can't be gamed by keyword stuffing or volume), (b) outcome gaps calibrated to real spreads (e.g. top-quartile vs median reply rates, win rates, CAC, NRR, close times, hire quality), and (c) feedback that teaches what a stellar operator would have done differently. Mediocre play should look plausible but compound into worse outcomes; stellar play still faces luck and base rates. When adding or changing a feature, write down the stellar / good / average / mediocre behaviour and its expected effect size, and add a test that the tiers separate. **The asymmetry is deliberate: good play is necessary but not sufficient, and bad play reliably costs you.** Doing everything right raises your odds but doesn't guarantee a big outcome (market, timing and luck still decide most of it). Doing things wrong must always have realistic consequences: wasted hours and money, slower progress, going in circles (rebuilding, re-pitching, re-hiring, re-launching), burned lists and domains, churned customers, damaged reputation, legal or tax bills, burnout. Some come immediately; many compound or surface weeks later, as in real life. A mistake should never be free, and its cost should be traceable afterwards (Scorecard, coaching, post-mortem).
8. **Works offline.** Every LLM call supplies a deterministic heuristic `fallback`. Results are flagged `mock` and the UI says "offline".

## Files

```
server.js                 static + /api/llm (OpenRouter) + /api/site (fetch page text, SSRF-guarded)
public/main.js            shell, routing (#/appId/params), time controls, ctx
public/core/
  util.js     rng(state), poisson, chance, uid, hash, money/pct, dates (dateOf, fmtDate, isWeekend...), parseCsv/toCsv, escapeHtml, domainOf, words
  state.js    newState, ensure(state, key, init) for app slices, log, notify, spendHours/hoursLeft/OutOfHoursError, MODELS, PATHS
  params.js   shared realistic parameters (payments, market baselines, onboarding, company costs, LLM defaults)
  bank.js     post(state, {amount, counterparty, description, category, method}), balance, CATEGORIES, addRecurring, recurring bills
  stripe.js   createCustomer, subscribe, cancel, changePrice, refund, respondToDispute, mrr, activeSubs, trialingSubs, monthlyAmount, feeFor; daily billing/payout engine; MRR movement events in state.stripe.events
  churn.js    why customers leave: true reason per cancellation from the segment / B2C-category mix (data/churn-reasons.js) re-weighted by player actions, renewal intent decided ahead with leading SIGNALS, save tactics (reason-matched), Churnkey-style cancel flow, pauses; state.churn
  market.js   fit scores (website/product/price), landingConversion, trialConversion, churnBeforeRenewal, priceFactor, setModifier(state, 'churn'|'conversion'|'landing', key, mult), syntheticPerson, mainPlan, hasProduct, shippedFeatures
  llm.js      ask({task, model, system, prompt, files, schema, fallback, cache}), panel(opts) → one result per model, averageField, REALISM prompt, getSettings
  jobs.js     registerJob(type, handler) / enqueue — async LLM work after the daily tick
  mail.js     newThread, addMessage, findThread — the founder inbox
  clock.js    advance(state, days, APPS): per day → week reset of founder hours, recurring bills, Stripe, every app's onDay(state), month-end hooks, metrics snapshot, solvency
  ui.js       html`` (auto-escaping), raw, mount, on (delegation), formData, table, stat, badge, modal, toast, readFile, download, lineChart, barChart
  store.js    IndexedDB: saveState/loadState, putFile/getFile (uploaded files)
  operator.js operator tiers + consequences: registerOperatorReader(functionId, fn) → { tier, evidence, coaching }, readOperators, tierFromScore, shrink(score, n) for offline judges, logMistake(state, { functionId, id, label, cost: { hours, usd, customers, reputation, days }, circles, key }), mistakesSummary. Imports no app modules.
  calendar.js scheduleEvent/findSlots, calendarDay (meetings charge hours; overtime allowance), focus blocks: deepWork, writingHours, isFragmentedDay
  personal.js founder's personal finances: living costs, day job, cards, FICO, forced job search scaled by founder-pay coverage, payFounder (payroll vs owner draw), personalRunwayMonths
  debt.js     business debt products (Stripe Capital, RBF, SBA, lines, cards), applyForFinancing, monthlyDebtService, lenderProfile
  network.js  inbound email/iMessage driven by the company (archetypes), intros, publicEvents, visibility/audience, pay-to-play fees
  wellbeing.js energy, burnout hazard, life events, weekly overhead and capacity
  market.js also: marketDemand(state) — hidden per-idea demand (log-normal; re-drawn only on a recorded pivot, see isPivot)
public/data/              research-calibrated, data-only modules: outcomes (targets, elite behaviours, failure modes, luck events), operator-tiers (28 functions × 4 tiers), buyer-segments (30 B2B segments: committees, cycles, procurement, paperwork, methodologies), churn-reasons (reason mixes, signals, save tactics), roles (hiring traits, agencies), channels, world events, inbound archetypes, investor archetypes, lenders
public/apps/registry.js   APPS list (sidebar order)
public/apps/<id>.js       one module per app (may import helpers from public/apps/<id>/*.js)
public/styles/app.css     shared styles: .panel .grid-2/3/4 .stats .stat .tabs .table-wrap .badge(.good/.bad/.warn/.accent) .callout(.warn/.bad/.good) .kanban .col .card .chat .msg.me/.them .meter .list .inline .hint .app-head .app-actions .empty
```

## App module contract

```js
export default {
  id: 'crm', title: 'CRM', icon: '🗂️', group: 'Sales',
  models: ['smb', 'ent'],          // optional: only show for these business models
  badge: (state) => 3,             // optional sidebar badge
  render(root, ctx) {},            // draw into root (use mount + html``), wire events with on(root, ...)
  onDay(state) {},                 // optional: synchronous daily simulation (no awaits, no DOM)
  onMonthEnd(state) {},            // optional
  jobs: { 'reply:prospect': async (ctx, payload, job) => {} }, // optional async (LLM) handlers
};
```

`ctx` (in render and jobs): `state`, `params` (route string after `#/id/`), `act(fn, {hours, label})`, `save()`, `render()`, `navigate(appId, params)`, `enqueue(type, payload, {label})`, `llm` (core/llm.js module), `toast`.

Rules:
- `render(root, ctx)` is called on every state change with a **fresh** `root` element (the shell creates a new one each time), so it is safe to attach listeners with `on(root, ...)` inside render; they are discarded with the old element. Keep render fast. Charts: draw after mount (canvas inside root). Note re-render replaces inputs, so keep in-progress text in state or a module-level draft variable if an action can re-render mid-typing.
- `onDay(state)` must be synchronous and deterministic given `state.seed` (use `rng(state)` / `chance` / `poisson`, never `Math.random`).
- Enqueue LLM work from `onDay` with `enqueue(state, type, payload)` imported from `core/jobs.js` (the shell runs jobs after the tick). From UI actions use `ctx.enqueue` or await `ctx.llm.ask/panel` directly inside `ctx.act`.
- Money only moves through `bank.post` (bank) and `core/stripe.js` (customer payments). Use correct categories (`advertising`, `marketing`, `payroll`, `payroll_tax`, `contractors`, `software`, `ai_inference`, `hosting`, `legal`, `accounting`, `taxes`, `investment`, `loan`, `loan_repayment`, `owner_contribution`, ...).
- New paying customers: `createCustomer` + `subscribe(state, customerId, plan, { trial, source })`. `source` is a channel string used for attribution: `ads:meta`, `ads:google`, `ads:tiktok`, `ads:apple`, `organic:seo`, `organic:social`, `organic:community`, `network`, `referral`, `outbound`, `inbound`, `partner`, `product-hunt`. B2B deals won in the CRM pass `crmCompanyId` to `createCustomer`.
- Never edit files you don't own. If you need a core change, write it in your final report.
- Escape everything: always render untrusted text through `html``…```.
- Mobile: layouts must work at 390px wide (use the grid classes; they collapse).

## Cross-app hooks (use these instead of reaching into other apps)

- Operator tiers and mistakes: `core/operator.js` (see Files). Every function registers a reader; every consequential mistake calls `logMistake` with a cost so the Scorecard can show what it cost and which events were "going in circles".
- Automations: apps export `*Events(state, sinceDay)` (stable event ids) and action functions that support `{ dryRun }` and return `{ ok, error, hoursCost, usdCost }`; anything customer-facing requires `approved: true`. Hours an automation really saves are claimed with `claimAutomated(state, key, hours)` from `apps/automations/engine.js` (catch-up hours are charged later if a run fails).
- Founder assistant: `claimAssistant(state, key, hours)` (apps/assistant) for approved digests, investor updates and meeting prep.
- Focus: charge writing work through `writingHours(state, h)` and build work through `deepWork` (core/calendar.js).
- Runway: `runwayMonthsForecast(state)` (apps/money/common.js) is the line-item forecast other apps read.
- Activation: `activationLift(state)` from apps/insights/model.js (registered by Insights; Lifecycle email + onboarding experiments).

## Testing rule

Test mechanics with short, targeted tests (one system, a few seeds, the shortest horizon that shows the effect). Long multi-year bot grids (`docs/review/calibration/`) are not run unless explicitly requested.

## Shared state slices (owner → readers)

- `state.company` { name, model 'b2c'|'smb'|'ent', path 'indie'|'vc', oneLiner, icp, domain, website, incorporated, entity: 'none'|'llc'|'ccorp' } — legal sets `incorporated`/`entity`.
- `state.founder` { name, bio, linkedinText, linkedinFileId, network {friends, linkedin, x, newsletter}, hoursPerWeek, hoursUsed, energy, salary }.
- `state.plans` [{ id, name, price, interval 'month'|'year', trialDays, active }] — edited in the Payments (Stripe) app's Products tab.
- `state.market` (core) — fit scores; `market.onboarding` 'self'|'call'|'concierge', `market.cardRequired`.
- `state.apps.product` (product) — `features: [{ id, title, spec, problem, user, acceptance, status: 'draft'|'rejected'|'queued'|'building'|'shipped', effortHours, progressHours, grade, shippedDay }]`, `buildQueue`.
- `state.apps.people` (people) — `members: [{ id, name, role: 'engineer'|'designer'|'ae'|'sdr'|'support'|'marketer'|'ops', kind: 'employee'|'contractor'|'ai_agent', status: 'active'|'offer'|'gone', startDay, hoursPerWeek, monthlyCost, equityPct }]`. Product reads active engineers/AI coding capacity; support capacity reads support members/agents.
- `state.apps.crm` (sales) — `companies`, `contacts`, `deals` (stages), `activities`.
- `state.apps.ads` (growth) — campaigns, ad sets, ads/creatives, daily delivery stats (spend, impressions, clicks, trials, reported conversions).
- `state.apps.fundraising` (fundraising) — investors, rounds, SAFEs, cap table, evaluations, deck file id.
- `state.apps.legal` (company) — documents, filings, compliance tasks.
- `state.churn` (core/churn.js) — signals, save attempts, cancel-flow config/stats; per subscription `sub.churnEval` (renewal intent, hidden), `sub.churnReason` (hidden true reason), `sub.pause`, `sub.onboarded` (set by Customers). `state.company.b2cCategory` (B2C churn category, defaults from the one-liner). Dunning: `state.stripe.settings.dunning` (player-authored sequence), `cardUpdater`, `preExpiryEmails`, `state.stripe.dunningStats`.
- `state.apps.support.flows` (support/flows.js) — typed cases (`cases`: refund, dispute, ownership transfer, data request, security report, public complaint...), `pending` scheduled consequences, `requests` (feature-request log; Product reads `featureRequestLog(state)`), `ops` (chat, after-hours, language policy, refund window, security.txt), `aiScope` per case type, `network` (dispute-ratio level). DSR clocks live in `state.apps.legal.dsrs`; bugs filed from tickets land in `state.apps.product.bugs` (triage). See docs/review/support-flows-audit.md.
- `state.apps.plg` (plg) — `levers` (each a Product feature with `system: true`, `plgLever`), `pages`, `pqls`, `seo` (Google demotion), `access` (launch mode: waiting, cohorts, codes). Mistakes use functionId `plg`. Reads: Insights PLG tab.
- `state.apps.transactional` (emailops) — provider, subdomain, auth, `templates`, delivery; sets `state.apps.lifecycle.txn` (loss/external) each day and `stripe.settings.dunningDelivery`. Mistakes use functionId `transactional_email`.
- `state.apps.audience` (audience) — list cohorts, forms, magnets, issues, compliance; writes `state.founder.network.newsletter` = active list size. Mistakes use functionId `owned_audience`.
- `state.apps.books` (money) — recategorizations, closed months, journal adjustments.

## LLM usage pattern (see apps/website.js)

```js
const res = await ctx.llm.panel({
  task: 'cold_email_reply',                 // stable name, used for caching and fallback logging
  system: `${REALISM}\nYou are ${persona}…`,  // REALISM keeps personas skeptical and terse
  prompt: '…the actual artifact to judge…',
  schema: { type: 'object', additionalProperties: false, required: [...], properties: {...} }, // strict JSON schema
  fallback: () => heuristic(...),           // deterministic, same shape as schema
  cache: state.cache,                       // optional: identical inputs reuse results
});
// res = [{ data, mock, model, usd }, …] — one per panel model (default Claude Haiku 5.5 + TypeSafe Jev Router)
```

Use `ctx.llm.ask` for single-model role-play (e.g. a live chat with a prospect or investor). Keep prompts compact; cap uploaded text. Strict JSON schemas need `additionalProperties: false` and every property listed in `required`.
