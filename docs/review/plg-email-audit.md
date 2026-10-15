# PLG, transactional email and owned-audience audit

Research: `docs/research/plg-email/p1-plg-levers.md`, `p2-transactional.md`, `p3-lists-newsletters.md` (copied unchanged).
Status column: **full** = modelled with realistic numbers, hours and consequences; **partial** = exists but misses part of the lever; **missing** = nothing in the game.
"Before" is what the game had before this change; "Now" is after (new modules listed at the end).

## PLG levers (p1)

| Lever / strategy | Before | Now |
|---|---|---|
| Free trial vs freemium vs reverse trial vs card-required (Pricing app `channels/pricing-model.js` `TRIAL_MODES`, core `trialConversion`, `landingConversion`) | full: five modes with landing and conversion multipliers sourced to ChartMogul/Poyar | unchanged (full) |
| Activation event, onboarding emails, activation lift (Lifecycle, Insights `activationRate`) | full | unchanged; lifecycle sends now feed `L.txn` delivery loss |
| Usage limits, paywall placement, in-app upgrade prompts | missing | full: `plg` lever `limits` (value vs cost-proxy meter, week-to-limit, placement, warnings, smaller step, holdout, copy lint/LLM judge), conversion lift 10-25% good vs average, export-block and countdown churn and mistakes |
| Hard paywall at signup (RevenueCat) | partial (card-required trial only) | full: `on_signup` placement cuts landing 35%, lifts conversion 45% |
| Product-qualified leads to the CRM | missing | full: `pql` lever, signal-rule quality (hidden intent), SLA, first touch, privacy notice, validation against closed deals, `addInboundLead` with hidden fit, trial cancelled when sales wins |
| Viral loops: invites and collaboration | partial (Organic WOM/K, `kFactor`, referral program) | full: `invites` lever, K and cycle time by product type (collab / output / solo), invitee value, contact-import spam |
| Shared outputs and "Powered by" badge | missing | full: `sharing` lever (public links, CTA, badge off/subtle/loud, client-facing credibility cost) |
| In-product referral prompts | partial (Organic referral program, no prompt placement) | full: `referral_prompt` lever multiplies the existing program boost by trigger (post-aha vs every login vs during failure), fraud checks |
| Template gallery | missing | full: `templates` lever, hand-made vs near-duplicate pages, community moderation, slow ramp |
| Programmatic SEO from product data | partial (Organic SEO/GEO content engine, no pSEO) | full: `pseo` lever, uniqueness by data source, anonymisation, Google core update demotion for thin pages (hash schedule, ~3.3/yr), prune action |
| Free tools and calculators | missing | full: `free_tool` lever, gate position, tested maths, disclaimer, proprietary data, feeds the owned list |
| Self-serve onboarding (checklists, empty states) | partial (Customers onboarding mode, Lifecycle) | unchanged (partial); not rebuilt |
| Expansion: seats, usage, in-product upsell | partial (Pricing app `expansionMonth` by pricing model) | full: `expansion` lever adds extra monthly expansion by setup quality, bill-shock mistakes |
| PLG metrics (activation, PQL rate, free-to-paid, NRG, K, spam rate) | partial (Insights funnel, activation) | full: Insights "PLG metrics" tab, gated on the instrumentation lever; holdout-measured lift |
| Experiments and feature flags | full (Insights lab) | each live lever registers a kill-switch flag `plg-<lever>` |
| Staged access: waitlist vs invite-only cohorts (user addition) | missing | full: `plg/access.js` launch mode hooked into `growth/acquire.js` (`setAcquireGate`), qualification queue, invite codes, cohort capacity, decay, debriefs |

## Transactional email (p2)

| Item | Before | Now |
|---|---|---|
| Marketing vs transactional separation, shared domain reputation | partial: Lifecycle `transactionalLoss` from its own domain reputation | full: `emailops` with a transactional subdomain and its own reputation; shared domain inherits marketing complaints (Lifecycle and the newsletter) |
| Provider choice with real prices and limits (Resend, Postmark, SES, SendGrid, Loops) | partial: Loops/Customer.io for marketing only | full: five providers, volume-based plan and monthly bill, free-tier caps, SES wiring, incident rates |
| SPF/DKIM/DMARC, DMARC policy progression | partial: Lifecycle domain flags | full: per-stream records, policy tightening gated on 14 days of reports; provider switch resets keys |
| Loops free quota shared with transactional mail | full | kept; a separate provider removes transactional from that quota |
| Verification, magic link, reset, receipt, trial-ending, renewal, failed payment, security alert templates the player reviews | missing | full: eight templates with a checklist lint (legal items double-weighted), starter text, lawyer read, promo-in-service-email penalty |
| Receipts with legally required fields | missing | full: invoice-field lint, tickets for weak receipts, retroactive-fix cost for international customers |
| Trial-ending and renewal notices, auto-renewal exposure | missing | full: send-timing lint (3-21 days), refunds, disputes, an auto-renewal demand letter after repeated misses |
| Failed-payment email and dunning delivery | partial (Stripe dunning steps in Payments) | full: template and delivery scale `settings.dunningDelivery` in Stripe dunning |
| Lockout tickets in the Helpdesk | missing | full: aggregate tickets pushed to `support.queue` |
| Seed tests, monitoring, fallback provider, provider incidents | missing | full |
| Delivery monitoring (Postmaster spam rate) | partial (Lifecycle complaint rate) | full: stream complaint rate and reputation per stream |

## Mailing lists and newsletter (p3)

| Item | Before | Now |
|---|---|---|
| `founder.network.newsletter` | partial: a number set in Settings, read by Organic network launch, Channels and inbound archetypes | full: equals the owned list size; a Settings edit is absorbed |
| Newsletter sponsorships as a buyer (Organic) | full | unchanged |
| Owned list: waitlist, newsletter, forms, lead magnets with opt-in rates | missing | full: `audience` cohorts, forms (type, fields, single vs double opt-in), magnets with a relevance lint, promote action |
| Consent capture, CAN-SPAM, GDPR/CASL exposure | missing | full: consent record, postal address, one-click, honoring opt-outs (automatic vs manual) with fine events |
| List hygiene and sunsetting | missing | full: engagement decay, re-engagement sunset, trade-off against list size |
| Newsletter cadence and content (LLM with offline fallback) | missing | full: issue lint + optional LLM judge, cadence consistency, frequency and gap penalties |
| Growth tactics: referrals, swaps, paid per subscriber | missing | full: referral program with quality check, recommendation swaps with fit, paid subscribers at researched CACs |
| Converting subscribers to customers: nurture and launches | missing | full: nurture quality, `launchToList` waves/deposit/founding price, acquisition via `acquire()` |
| Sponsorship revenue at researched CPMs | missing | full: CPM by B2C/B2B, engaged-reader minimum, disclosure, fit; income category `sponsorship_income` |
| Purchased lists, spam rate over 0.3%, blasting, ignored opt-outs | partial (Lifecycle blasts) | full: suspension, traps, mistakes ledger |

## Operator tiers and automations

- New functions in `data/operator-tiers.js`: `plg`, `transactional_email`, `owned_audience` (4 tiers, traps, detection). Readers registered by the apps.
- Automations: families `plg`, `transactional`, `audience`; events `lever_live`, `pql_created`, `seo_penalty`, `cohort_released`, `deliverability_alert`, `provider_incident`, `template_published`, `issue_sent`; actions for queueing a build, pruning, kill switch, PQL validation, seed test, publish template (approval), fallback, send issue (approval), sunset (approval), process opt-outs.

## New files

`public/apps/plg.js`, `plg/{params,model,access,penalty}.js`, `transactional.js`, `emailops/model.js`, `audience.js`, `audience/model.js`, `test/plg-email.test.js`.
Small additive edits: `growth/acquire.js` (gate hook), `lifecycle/model.js` (`L.txn`, `h01` export), `core/stripe.js` (`dunningDelivery`), `product/fit.js`, `core/market.js`, `product.js` (system features), `organicEngine.js` (SEO penalty), `sales/crm-api.js` (audience fit), `core/bank.js` and `money/ledger.js` (`sponsorship_income`), `insights.js` (tab), Automations model/integrations.

## Known simplifications [design]

- PQL deals duplicate the trial customer; the trial is cancelled when sales wins.
- Audience is cohort-level, not per-person.
- Provider prices, template legal items and all conversion rates beyond the research bands are design estimates; coaching says "confirm with counsel".
