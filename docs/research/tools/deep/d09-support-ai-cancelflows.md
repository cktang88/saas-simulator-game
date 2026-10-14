# D09: Support AI and cancel flows (Intercom Fin, Plain + Pylon, Churnkey)

Research date: 2026-10-14. Tags: [unverified] = secondary sources only; [design] = my estimate for the simulator.

---

## 1. Intercom Fin (AI agent inside Intercom)

**Summary.** Fin is Intercom's AI agent that answers customer chats and emails from the help center, guidance, connected data and "Procedures" (AI-run instruction flows). Used by B2B and B2C SaaS support teams that already run Intercom's inbox. 2026 positioning: an outcome-priced agent ("you pay when Fin resolves"), sold alongside a seat-based Intercom plan. Pricing (official pricing page, fetched 2026-10): $0.99 per resolution; $0.99 per Procedure handoff; $0.99 per disqualification; $9.99 per qualification; $0.99 per self-serve routing outcome. Only one outcome is billed per conversation. A 14-day free trial needs a payment method to continue. Hard usage limits and a "turn Fin off" stop accrual are available. Seat plans and Copilot (agent-assist) pricing are third-party figures, roughly $35/seat/mo for Copilot [unverified]. Sources: https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-pricing (fetched 2026-10).

**Data model.**
- Conversation: the thread with a customer (chat or email). Has channel, status, assignee (Fin or a teammate), attributes.
- Resolution (outcome): recorded after Fin's last answer when the customer confirms it helped or goes quiet. Greetings don't count. If the customer comes back to the same conversation, the resolution is reversed and not charged.
- Handoff / escalation: a Fin-to-human transfer. Default escalations (customer asks for a human, frustration, loops) are free; a configured Procedure ending in @handoff is billed $0.99.
- Ticket: a conversation converted to a ticket by a Procedure step "Handoff to Ticket" (not available on standalone Fin).
- Procedure: named instruction document with trigger text ("When to use" ≤256 characters, plus "When NOT to use" examples), Steps (Instruction, Condition IF/ELSE, Run sub-procedure, Call data connector, Read/Update attribute, Handoff to team, Handoff to workflow, End, Wait for Webhook [open beta]), Guidance, audience and channel targeting.
- Attributes: customer or conversation fields Fin reads and writes. Data Connectors: live calls to external apps, whose outputs are step-local unless saved to an attribute.
- Workflow: a visual, canvas-based builder with fixed reply buttons, used for routing and triage. Task: legacy Procedure precursor; new Task creation was disabled 2026-03-12.

**Main workflows.**
1. Setup. Fin AI Agent > Train > Content. Sync help center sources and enable articles for Fin. Set General guidance (tone, style). Confirm Fin's built-in escalation rules. Set audience targeting (Web, Email, WhatsApp).
2. Build a Procedure. Fin AI Agent > Train > Procedures > "+ New procedure" (needs "can manage workspace data"). Either describe the process or paste an SOP and let AI draft it (Keep / Clear / Try again), or create from scratch. Name it (avoid "|"). Fill "When to use" and "When NOT to use", and click "Train Fin on examples" with sample messages.
3. Add steps. Type @ on a new line to insert a step. Type @ inside an instruction to add a tool or data connector. Put a Condition step after every connector call to handle empty responses. Use @Look up content to search the help center.
4. Set end messages. Default is "Anything else I can help you with?". Customize per End step or in Settings > End message.
5. Test. Preview shows the customer-facing experience and must not be used on a live procedure. Simulations (Test > Simulations tab) run an AI customer through the procedure. Setup: pick "Simulate as" (a user or brand), write the opening message, add "Additional details", choose Messenger or Email, set simulation time, and add pass criteria (Fin reply, attribute set/equal, data connector triggered N times, instruction outcome finished/handed off). Click Run or Run all. Results show Passed, Failed, Queued, with a "See conversation" transcript and Fin's thoughts. Re-run after a fix without recreating.
6. Batch test. Up to 50 questions per test group, each answer rated Good / Acceptable / Poor. Free. Works for all Fin setups, not only Procedures.
7. Go live. Click "Set live" once tests pass. Optional Agentic Switch lets Fin move a customer to another live Procedure if intent changes.
8. Daily loop. Open the inbox. Read Fin conversations with a resolution or handoff. Review low-rated answers. Add or edit content, guidance or Procedures. Watch resolution and handoff reports. Check the usage limit.
9. Aha moment. A customer asks a question, Fin answers from the help center, the outcome is marked resolved, and the dashboard shows $0.99 accrued.

**Automation and AI.** Fin answers from help-center content and guidance, runs Procedures (multi-step, branching, tool calls), reads and writes attributes, calls data connectors, hands off to a team, ticket or workflow, and sets the conversation status. Human review points are the escalation rules, the handoff steps, and any Procedure end message. Published resolution rates vary by source. Intercom-attributed or Anthropic-cited figures are around 50–51% average [unverified, via Anthropic customer case study: https://claude.com/customers/intercom]. The AI Agent Index reports 76% across 12,000+ customers as of June 2026 [unverified, third-party]. An independent 60-day test by Builts AI on four small clients measured 38% [unverified, small sample: https://builts.ai/blog/intercom-fin-ai-review/]. Use 40–55% as the realistic band and show it as a range [design].

**Time saved and cost.** Cost per unit: $0.99 per resolution. At 1,000 resolutions/month that is $990 on top of seats [unverified, DEV Community/third-party pricing math]. For a solo founder with 200 chats/month and 50% resolution, Fin costs about $99/month and saves roughly 6–10 hours/week of repeat-question handling [design]. Note: each resolution costs the same as a human-minute of value only if the case would otherwise need a person.

**Failure modes.**
- Simulations need test data. Data connectors return only the values you define, so empty results usually mean missing test data. Use a dedicated test user with real data in the external system.
- Simulations have monthly run caps by workspace volume: 250 runs/month under 1K conversations, 1,000 at 1K–15K, 1,750 at 15K–100K, 5,000 at 100K–1M, 12,500 at 1M+. Run/Run all disable at 100% until the 1st of the next month [source: Intercom simulation article, updated 2026-02].
- Sub-procedures cannot be simulated on their own.
- Conditions cannot nest, mix code and natural language, or use date or decimal attributes.
- Special characters such as "|" in titles cause save errors.
- Connector calls run even when their output isn't used, which adds outcome cost and latency.
- Procedures are "managed availability" in some docs; some workspaces need an account manager [unverified].

**Integrations.** Customer systems and billing data via Data Connectors (the specific connectors available were not verified); Slack for internal handoff; help center sources; Messenger, WhatsApp and Email channels [design, from the Procedure step types and channel options above].

**Sources.**
- https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-pricing (pricing, fetched 2026-10)
- https://www.intercom.com/help/en/articles/12599517-run-simulations-for-fin-procedures (simulation UI and limits, updated 2026-02)
- https://www.intercom.com/help/en/articles/14077180-simulations-vs-batch-tests-vs-previews (testing comparison)
- https://www.intercom.com/help/en/articles/13449439-building-fin-procedures (build steps, billing note 2026-03-12)
- https://www.intercom.com/help/en/articles/14077835-procedures-vs-tasks-vs-workflows (Tasks disabled 2026-03-12)
- https://claude.com/customers/intercom (51% figure) [unverified]
- https://theaiagentindex.com/agents/intercom-fin (76% figure, verified 2026-06-26) [unverified]

---

## 2. Plain and Pylon (B2B support through Slack Connect)

Both tools are built for B2B teams whose customers live in shared Slack channels. They differ in how they present AI and pricing.

### 2a. Plain

**Summary.** Plain is a support platform where every message from every channel becomes a thread in one queue. It is aimed at small B2B SaaS teams with Slack-first customers. 2026 positioning: "autonomous support" through its agent Ari, plus Sidekick (team assistant) and Bring Your Own Agent via API. Pricing (vendor pricing page, fetched 2026-10 via comparison pages): from $35 per seat per month, free viewer seats, a 14-day trial with no card, an included monthly allowance of Sidekick AI credits. Plain's Slack integration in the entry tier is capped at 25 channels [unverified, Featurebase]. Higher tiers (about $299/mo) add custom AI credits [unverified]. Sources: https://www.plain.com/blog/best-slack-apps-b2b-support-customer-satisfaction-2026 and https://featurebase.app/blog/plain-pricing (2026, vendor-comparison).

**Data model.**
- Thread: the central object. Each Slack Connect message becomes a thread automatically. Fields include tier, priority, labels, status, assignee, SLA state, and linked issues.
- Customer / tenant: the company or person. Customer cards pull data from your systems into the thread.
- Tier: the customer segment, e.g. enterprise or standard. SLA policy: response and resolution targets per tier. Escalation path: what happens when a target is at risk or breached.
- Labels and priorities: queue controls. Business hours: when SLA clocks run.
- Workflow: triggers plus conditions for triage, routing and follow-ups.
- Agents: Ari (customer-facing autonomous agent), Sidekick (team assistant inside Plain or Slack), connected agents (your own, with a team-member identity).

**Main workflows.**
1. Connect Slack. Install the Plain Slack app. Add shared (Slack Connect) channels as intake sources. Each message becomes a thread with no manual ticket creation.
2. Set tiers and SLAs. Define tiers, then set first-response and resolution targets per tier (example: 15 minutes for enterprise, 2 hours for standard). Set business hours and escalation paths.
3. Triage and route. Let AI triage classify, route and prioritize threads (vendor claim about 92% accuracy [unverified]). Or write a Workflow with triggers and conditions. Threads get an assignee so nothing sits unowned.
4. Answer. A teammate replies in Plain, and the reply posts back into the Slack channel. Ari can reply to customers. Sidekick drafts or summarizes for the team.
5. Escalate to engineering. Create a Linear or Jira issue from a thread. The thread is linked back and updated when the issue closes.
6. Daily loop. Work the queue by priority and SLA risk. Check at-risk threads. Review Ari's answers and Sidekick drafts. Close threads.
7. Aha moment. A customer posts in a shared channel, a thread appears in the queue with the right tier and SLA timer, Sidekick suggests a reply, and the answer is sent back to Slack.

**Automation and AI.** Triage (classification, routing, priority), Workflows (rules), SLA automation (alerts and escalation), Ari (customer replies), Sidekick (team help), BYOA via GraphQL API. Human review points: assignment, Ari escalation, and approval of drafts. Published resolution figures for Ari are not given on the pages I could fetch [unverified].

**Time saved and cost.** Per-seat pricing has no per-resolution fee. AI credits are metered, so overage risk is the main cost driver [design]. For a 2-person team handling 150 Slack threads/month, triage and SLA automation may save 3–5 hours/week [design].

**Failure modes.** Slack Connect channel limits by tier. Mis-routed threads when rules overlap. SLA clocks wrong if business hours are unset. AI credits run out mid-month. Duplicate threads when the same customer posts across channels [design].

**Integrations.** Slack (including Connect), Microsoft Teams, Discord, email, chat, Linear, Jira, GraphQL API, customer-data systems through customer cards and connected agents.

**Sources.**
- https://www.plain.com/blog/best-slack-apps-b2b-support-customer-satisfaction-2026 (Slack Connect, SLA, pricing claims, fetched 2026-10)
- https://www.plain.com/docs/ (data model and workflows, fetched 2026-10; several linked docs pages returned 404 or were not fetched)
- https://featurebase.app/blog/plain-pricing (tier pricing, July 2026) [unverified]
- https://unthread.io/blog/plain-pricing/ [unverified]

### 2b. Pylon

**Summary.** Pylon is an agentic support platform for B2B teams, built around customer-facing shared channels (Slack Connect, Teams) and an internal Slack Agent. Its marketing claims 1,500+ B2B customers. Pricing: a third-party comparison lists $59/seat/mo, plus $50/seat/mo for AI features, with no free tier [unverified]. Another review says a 3-seat minimum at $89/seat for Slack Connect [unverified]. Pricing is sales-led. Sources: https://thegtmdirectory.com/tools/pylon (2026) [unverified]; https://www.plain.com/blog/best-slack-apps-b2b-support-customer-satisfaction-2026 (competitor comparison, biased).

**Data model.**
- Issue: the core object. A Slack Connect message or an email becomes an issue. Fields include priority, status, tier, product area, custom attributes, and an "Autofill with AI" option.
- Thread: the source conversation, with participants, account and channel context kept on the issue.
- Account: the customer company, with plan, tier and health.
- Assignment rule: routes by language, product area, account tier, region, skill, channel or custom rule.
- Trigger: an event rule (for example, notify on SLA risk). Macro: a saved reply. Training data: examples and documents used by AI.
- SLA: response and resolution targets per tier, priority, account, plan or issue type.
- Knowledge base: help content, with Notion and Confluence integrations.
- Agents: Assist Agent (personal, inside Pylon), Support Agent (answers or escalates customer questions), Slack Agent (shared Slack interface), Skills and Automations.

**Main workflows.**
1. Connect Slack Connect. Add a shared channel for a customer. Customer messages are tracked automatically as issues with channel context. Teammates reply in the thread.
2. Set assignment rules. Route by tier, product area or language. Set SLA targets per tier and priority. Turn on breach alerts.
3. Triage with AI. AI classifies the issue, extracts structured fields, scores priority and routes it per your rules [unverified; mostly from marketing and third-party write-ups].
4. Draft and send. The AI reads the thread, pulls from the knowledge base and training material, and drafts a reply. An agent reviews and sends it. Replies post back into the Slack thread [unverified].
5. Use Slack Agent. A teammate tags @Pylon in an internal channel to ask about an account, update an issue or draft a response. Actions depend on configured tools and permissions. Approvals gate sensitive actions.
6. Escalate. Link related incidents and trigger an investigation from an issue.
7. Daily loop. Work the at-risk SLA queue. Review AI drafts. Merge duplicate tickets. Update the knowledge base when an article is wrong.
8. Aha moment. A customer's message appears as a tracked issue with account context, Pylon proposes a draft citing a knowledge article, and the agent sends it back to the same Slack thread.

**Automation and AI.** Classification, field extraction, priority scoring and routing; AI ticket merging from one user's messages; reply drafting from the knowledge base; Support Agent resolution with escalation; Slack Agent actions with approvals. Published resolution figures are not available from the pages I could fetch [unverified].

**Time saved and cost.** Per-seat plus AI add-on, so cost scales with seats and AI usage [unverified]. For a 3-person team with 150 threads/month, drafting and routing might save 4–6 hours/week [design].

**Failure modes.** Slack Connect requires paid seats (3-seat minimum per one review) [unverified]. Routing rules overlap and send work to the wrong team. AI drafts cite outdated knowledge articles. Duplicate issues when messages arrive across channels before merge [design].

**Integrations.** Slack Connect and Slack Agent; Microsoft Teams; Discord; Telegram; WhatsApp; email; phone/SMS; Notion; Confluence; Linear and Jira (via Slack Agent actions) [unverified].

**Sources.**
- https://www.usepylon.com/help-desk (product overview, fetched 2026-10)
- https://www.usepylon.com/ticketing (routing, SLAs, fetched 2026-10)
- https://www.usepylon.com/ai-agents/slack (Slack Agent, fetched 2026-10)
- https://docs.usepylon.com (section list only, fetched 2026-10; the linked Slack Connect and Triggers pages were not retrieved)
- https://langfuse.com/handbook/support/using-pylon (AI ticket merging) [unverified]

---

## 3. Churnkey (cancel flows, offers, pause, dunning, reactivation for Stripe subscriptions)

**Summary.** Churnkey is retention software for subscription businesses, sold mostly to Stripe users (also Chargebee, Braintree, Paddle, Maxio, Recurly). It covers the cancel flow, offers, pausing, failed-payment recovery and win-back campaigns. Its 2026 positioning is "retention for Stripe subscriptions", with a no-code builder and a Stripe Preferred Partner badge. Pricing is by average monthly churned revenue, not by subscriber count (vendor pricing page, updated 2026): Starter $250/mo billed yearly ($300 monthly), under $5k churned/mo, 14-day trial without a card; Core $500–$1,300/mo yearly ($600–$1,560 monthly), up to $50k churned/mo, 14-day trial; Intelligence $625–$1,425/mo yearly ($750–$1,710 quarterly), quoted by a Retention Specialist; Enterprise custom at $100k+/mo. Cancel flows and dunning campaigns are unlimited on every plan. Third-party sources disagree on 2026 pricing (one says from $120/mo plus a percentage of recovered revenue) [unverified]. Sources: https://churnkey.co/pricing (fetched 2026-10); https://churnkey.co/ (page updated 2026-10-08).

**Data model.** The public pages describe the product and do not publish a schema. The following objects are [design], inferred from the feature list:
- Subscription: the Stripe subscription, with plan, price, status (active, canceling, paused, past due, canceled), and churn-propensity score.
- Cancel flow: a no-code multi-step journey. Steps include exit survey, reason, offer, pause option and confirm. Segments: churn propensity, product usage, spoken language.
- Offer: a discount, cross-sell or seat handoff. Variants: Adaptive Offers and Dynamic Offers. Attributes: duration, percent off, eligibility.
- Pause: a temporary hold with a "Pause Wall" that blocks app features until resume.
- Failed payment: an invoice in dunning with retry schedule (Precision Retries layered on Stripe retries), channel (SMS, email, in-app), and a "Payment Wall" that blocks access until the card is fixed.
- Dunning campaign: an ordered sequence of messages per failed-payment state.
- Win-back: a Customer Return Campaign matched to the cancellation reason, with a one-click link that restores access.
- Metrics: churn metrics (updated daily), Feedback AI themes, customer health.

**Main workflows.**
1. Connect Stripe. Connect the Stripe account in a no-code step. Churnkey says setup takes about 15 minutes [vendor claim].
2. Build a cancel flow. Open the cancel flow builder and add steps: exit survey (reason), then a branch by reason (price, not using, too expensive, missing feature). Attach an offer (discount for 2–3 months, pause, or downgrade). Set segments by churn propensity and language. Set the confirm step.
3. Set up offers. Create discount and pause offers. Choose Adaptive Offers (picked from churn context) or Dynamic Offers. Set eligibility and unlimited A/B tests on Core and Intelligence (Starter limited) [primary pricing page].
4. Set up pause. Offer a 1–3 month pause as an alternative to cancel. Turn on the Pause Wall for paused accounts. Set resume behavior.
5. Set up dunning. Enable Precision Retries. Build a campaign sequence (email, SMS, in-app), with a Payment Wall that gates features until the card is fixed.
6. Set up win-back. Build a Customer Return Campaign tied to cancel reasons, with one-click reactivation links.
7. Daily loop. Check churn metrics and the cancel-reason mix. Review Feedback AI themes. Check failed-payment recovery rate. Adjust offers and flow steps. Run A/B tests.
8. Aha moment. A customer clicks cancel, picks "too expensive", sees a 30% discount offer, accepts it, and the subscription stays active; the churn metric and saved-revenue number update the same day.

**Automation and AI.** Adaptive Offers choose an offer from churn propensity and context. Feedback AI groups free-text cancel reasons. Churn metrics run daily. Automated dunning campaigns and retries run without a human. Human review points: offer amounts, pause length, Payment Wall rules, and campaign copy. Vendor-claimed results (not independently verified, undated for most): 32% voluntary churn drop, 14% average LTV increase, 72% of failed payments recovered, top performers save about 54% of cancelling customers and recover up to 89% of failed payments [vendor claim: churnkey.co]. Stripe alone is claimed to recover about 51% of failed payments in 5.5 days, and Precision Retries about 55% in 4.8 days [vendor claim]. Industry guides cite a rough 20–30% discount for 2–3 months as the sweet spot and a 1–3 month pause cap [unverified rule of thumb].

**Time saved and cost.** Starter at $250–$300/month fits a business churning under $5k/month. For a founder with $3k/month churned revenue, saving 10% of cancellations is about $300/month, so Starter pays back at about break-even [design]. Time saved: setup around 1–2 days and about 1 hour/week of tuning [design].

**Failure modes.**
- Dunning is a secondary module layered on Stripe's own retries. A competitor argues it can underperform dedicated recovery tools [unverified, FlyCode competitor post].
- Stripe announced a native cancellation survey and retention offer builder called Managed Operations, which could replace a paid cancel-flow tool for some teams [unverified, not confirmed from Stripe docs].
- Pause Walls and Payment Walls can frustrate customers. Test them on a small segment first [design].
- Offers can teach customers to cancel for a discount. Watch repeat-saves [design].
- Starter excludes unlimited A/B tests and segmentation, so tests may be capped [primary pricing page].
- Trustpilot reviews are mostly 2023 and self-selected [unverified].

**Integrations.** Stripe (native, no-code, Preferred Partner). Chargebee, Braintree, Paddle, Maxio, Recurly. Slack for alerts. A React SDK and MCP server for custom flows [primary page].

**Sources.**
- https://churnkey.co/ (product features, claimed results, fetched 2026-10-14; page updated 2026-10-08)
- https://churnkey.co/pricing (pricing tiers, fetched 2026-10)
- https://churnkey.co/dunning (dunning claims, fetched 2026-10; the page returned 404 when fetched directly, so the figures come from the main page)
- https://fungies.io/best-dunning-software-saas/ (third-party pricing and feature summary) [unverified]
- https://www.flycode.com/blog/churnkey-alternatives-2026-payment-recovery-cancel-flows (competitor critique, Managed Operations claim) [unverified]
- https://www.flowjam.com/blog/churnkey-vs-baremetrics-2024-which-cuts-saas-churn-best (older pricing, 2024) [unverified]
