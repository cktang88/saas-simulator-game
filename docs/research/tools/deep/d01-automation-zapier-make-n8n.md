# D01: Automation tools for founders - Zapier, Make, n8n (2026)

Research date: 2026-10-14. Tags: [verified] = read on a primary page during this research; [secondary] = third-party blog or forum only; [unverified] = not confirmed; [design] = my estimate or a recommended config for the simulator, not a documented fact.

Cross-tool note: prices and limits move often. Zapier's pricing page was read directly; Make's and n8n's price tables were only partly readable, so Make's per-plan prices are [secondary].

---

## PART 1: ZAPIER (Zaps, Paths, Tables, Interfaces/Forms, Agents)

### 1. Summary
Zapier is the default no-code "trigger plus actions" automation product for non-engineers, with about 9,000+ app integrations per its own agents page [verified]. Its 2026 positioning has moved from "app linking" toward a work hub: Zaps for deterministic automation, Tables (a database), Interfaces (forms and views over data), Zapier MCP, and Agents for AI-driven, chat-triggered work [secondary: a 2026 newsletter-style piece]. Zapier's help center says Tables, Interfaces and Zapier MCP are now included in Free, Pro and Team plans with no add-ons, and the article was updated 2026-08-21 [verified: help.zapier.com article 39645433045773]. Price tiers (USD, from zapier.com/pricing) [verified]:
- Free: $0, 100 tasks/mo, two-step Zaps only, 1 user, 400 agent activities/mo (10 per run), Tables 2,500 records per account and 3 per table, 10 form pages. No premium apps or AI fields.
- Professional: from $29.99/mo monthly or $19.99/mo annual at the 750-task tier. Tasks run 750 to 2,000,000 (e.g. 2,000 tasks = $73.50 monthly / $49 annual; 10,000 = $193.50 / $129). Unlimited premium apps, multi-step Zaps, 1,500 agent activities/mo (40 per run), 100,000 Tables records, 50 per table, 50 form pages, AI by Zapier and AI fields included, 1 user.
- Team: from $103.50/mo monthly or $69/mo annual at the 2,000-task tier (e.g. 10,000 tasks = $253.50 / $169). 25 users, 500,000 Tables records, 150 form pages, shared agent allowance (not stated).
- Enterprise: custom, unlimited users, custom task limit.
Small-team heuristic: 2,000 tasks/mo (~$49–73 on Pro) covers a solo founder running ~10 multi-step Zaps; 10,000 tasks covers a 3–5 person team.

### 2. Data model
- **Zap**: one trigger + ordered actions (steps) + optional Filters (a step that stops the run unless conditions hold) + optional **Paths** (conditional branches, each with its own filter, plus a fallback path) + Storage by Zapier key/value store for state across runs [verified: Storage help article; 500 keys per account; Storage actions don't use tasks].
- **Run/Zap history**: each execution has status, step-by-step data in/out, and the task count.
- **Task**: one successful action step. Triggers aren't counted. Filters and Paths don't count [secondary: Zapier blog; the fallback path counting is not confirmed, so treat as unverified]. Failed steps generally aren't counted [secondary].
- **Table**: a spreadsheet-like database. Fields 100 per table; rows are records; each Table has views and can be a trigger/action target [verified limits in pricing table].
- **Form (listed as Interfaces in the help article, Forms on the pricing page)**: a public page with fields that writes a Table record or fires a Zap [secondary on the naming conflict; the help article keeps the name "Interfaces"].
- **Agent**: a named AI worker with instructions, tools (connected apps), knowledge sources (FAQs, docs, public links), chat access and trigger(s). Built with Zapier Copilot [verified: zapier.com/agents describes this, but not the step-by-step UI].
- **Connection**: an authenticated account per app (e.g. Stripe live vs test are separate connections [secondary]).

### 3. Main workflows (step by step)
**W1. Setup and onboarding (about 10 minutes):** Sign up, pick a plan (Free is enough to start). Click "Create" > "Zap". The editor shows a left "Trigger" card and a "+" to add an action. Click the trigger card, search the app (e.g. "Stripe"), choose the event (e.g. "New Payment"), click "Sign in" to create a connection, then "Test trigger" to pull a real sample record. Each step has "Set up action" with mapped fields: click a field, pick a token from the sample data (e.g. "Customer Email") in a dropdown. Then "Publish" (or "Turn on").

**W2. Aha moment (first real run):** Make a real Stripe test payment. The Zap history shows the run within seconds (Stripe is an instant trigger [secondary]), with the sample data mapped into HubSpot and Slack. The first aha is seeing the same field appear in the destination.

**W3. Adding logic with Paths:** In the editor, click "+" after a step and choose "Paths". Each path has a "Filter" condition (field, operator such as "Text Exactly" or "Greater than", value). Add a fallback path with no condition for everything else. Each path then has its own actions.

**W4. Daily/weekly loop:** Check the Zap history for "Error" rows (red). Click "Replay" to re-run a failed step after fixing auth or mapping. Check Tasks usage on the account page. Founders usually only touch this when a Slack alert stops.

**W5. Build a Table and Form (lead capture):** Open the "Tables" tab, click "New table", add fields (Name, Email, Company, Source, Status as single-select). Then "Forms" (or "Interfaces") > "New" > choose the Table as the destination, drag fields onto the page, "Publish" to get a public URL. Each submission creates a Table row and can trigger a Zap through a "New record" trigger [secondary on exact labels].

**W6. Build an Agent:** From "Agents" > "New agent", describe the job in plain language (Zapier Copilot writes the first instructions), add tools by connecting apps, add knowledge (paste FAQ text or a URL), choose where it runs (chat, Slack, or a trigger), then run a test chat. [design for exact labels; verified only at feature level]

**W7. Scale-up and maintenance:** When tasks run out, the account shows a warning and steps stop. Upgrade tier or reduce steps. Storage keys cost nothing in tasks.

### 4. Automation and AI features
- Deterministic automation: triggers (instant webhook-based or polling at 1–15 min depending on app [secondary]) plus actions.
- AI by Zapier and AI fields: one-step AI actions on Pro/Team; on Free they're not included [verified]. AI actions consume tasks [secondary].
- Agents: chat-invoked or triggered; activity limits 400/1,500 per month and "per run" caps (10 on Free, 40 on Pro) [verified]. There is no published accuracy or resolution rate.
- Human review points: a Zap sends to Slack for approval; Agents can be set to ask before acting [design].
- Published accuracy numbers: none found.

### 5. Time saved and impact
[design] A solo founder who runs 5–10 Zaps (Stripe, form, support, onboarding) typically saves 2–5 hours/week in data entry; the saving is mostly copy-paste between CRM, Slack, and email. Cost per unit: one task. A 5-step Zap that runs 300 times a month uses 1,500 tasks (~$49 annual on Pro at 2,000 tasks). Agent activity is a separate counter.

### 6. Failure modes
- Auth expiry: a connection (e.g. Google, HubSpot) silently needs re-sign-in. Zap turns into "Error" rows. [design, common]
- Mapping drift: a renamed field in the destination app. Zap says "required field missing" [design].
- Duplicate triggers: Stripe "New Charge" with "Ignore payments intents" not set to True can fire on the same sale as "New Payment" [secondary].
- Task burn: a loop (Zap writes a row that triggers itself) burns tasks fast. Use a filter or a Storage key [design].
- Polling lag on some apps [secondary].
- Free plan caps: 100 tasks and two-step Zaps only [verified].

### 7. Integrations (common founder data flows)
Stripe to HubSpot to Slack; Typeform or Tally to HubSpot; Google Calendar to Slack/Notion; Gmail to HubSpot; Fireflies/Otter to Notion/HubSpot; Google Sheets to Slack digest; Intercom/Help Scout to Slack.

### 8. Sources
- zapier.com/pricing (read 2026-10-14) [verified]
- zapier.com/agents (read 2026-10-14) [verified, feature level only]
- help.zapier.com/hc/en-us/articles/39645433045773 "Zapier plan updates: Tables, Interfaces, and MCP now included" (updated 2026-08-21) [verified]
- help.zapier.com/hc/en-us/articles/8496293271053 Storage by Zapier (read 2026-10-14) [verified]
- Stripe triggers "New Payment", "New Customer", "New Subscription": help.zapier.com/hc/en-us/articles/8496161863693 (search snippet) [secondary]
- jetadmin.io Zapier pricing 2026 and eesel.ai Zapier subscription 2026 [secondary]

---

## PART 2: MAKE (scenarios, routers, operations and credits)

### 1. Summary
Make (formerly Integromat) is the visual, branching automation tool: scenarios are canvases of modules with routers, iterators, aggregators and error handlers. It is popular with agencies and technical-leaning founders who want branching and data arrays. In 2026 Make is also pushing AI: Make AI Agents, Make AI Toolkit, and AI modules, with extra credits for some AI features [verified: help.make.com/credits]. Tiers [verified plan names; prices secondary]: Free (1,000 credits/mo), Core, Pro, Teams (each includes 10,000 credits/mo as the entry allotment [secondary]), Business (named on the pricing page, 50% off for under 20 employees for start-ups [verified]), and Enterprise (contact sales). Third-party prices for the 10,000-credit tier, annual: Core $9, Pro $16, Teams $29 per month; monthly billing $10.59 / $18.82 / $34.12 [secondary; conflicting figures $12/$21/$38 appear in other sources]. Make's own help says Core is the first tier with unlimited active scenarios, one-minute scheduling and API access; Pro adds priority execution, custom variables and full-text log search; Teams adds team roles and shared templates [secondary; from a third-party guide].

### 2. Data model
- **Organization > Team > Scenario**: a scenario is a flowchart of modules connected by lines. Each has a schedule (on demand, interval, or instant webhook trigger).
- **Module**: one app action or trigger (e.g. "Stripe > Watch Events", "HubSpot > Create a Contact"). Each has a connection, inputs mapped with `{{1.field}}` tokens, and outputs (bundles).
- **Bundle**: a set of data flowing between modules. A trigger returning 50 items produces 50 bundles; each downstream module runs 50 times unless aggregated.
- **Router**: splits into routes. Each route has a filter (conditions). Make's help recommends a fallback route for unmatched data.
- **Iterator / Aggregator**: array to bundles and back.
- **Error handler**: Rollback, Break, Resume, Commit, Ignore [verified: help.make.com/credits says these and Router consume no credits].
- **Data store / data structure** (Make's built-in tables) [design: exists in Make; limits per plan: 1 MB data storage on Free].
- **Run/execution log**: each run lists module status and bundles; full-text search on Pro [secondary].

### 3. Main workflows (step by step)
**W1. Setup and onboarding:** Sign up, click "Create a new scenario" (+). A blank canvas with a large "+" circle. Click "+", search the app (e.g. "Stripe"), select the trigger "Watch Events" [secondary], click "Add" to create a connection with a Stripe API key, select the event type (e.g. "invoice.paid"), click "OK". Then click "Run once" at the bottom bar and trigger a real Stripe test event to get sample data (the module shows "Bundles" count).

**W2. Aha moment:** After the Stripe run, the output panel shows the object tree; the user clicks a field (e.g. `customer_email`) and it is inserted as `{{1.customer_email}}` in the next module's input. The first aha is that the whole canvas runs live.

**W3. Build a router (branching):** Click the line between two modules, choose "Add a router" [secondary]. Each route gets a label, filter (click the filter circle, set the first operand, operator such as "Greater than", second operand e.g. `50`). Add a route with no filter as the fallback. Ordering routes matters; overlapping filters send items to multiple routes [secondary].

**W4. Lead enrichment with HTTP/AI modules:** Add "HTTP > Make a request" to call an enrichment API (e.g. Apollo or Clearbit-style) with a header `Authorization: Bearer {{key}}` and a body mapped from the form's email field; then "Parse JSON" to read the result. Add an AI module (Make AI or a connected OpenAI/Anthropic account) for scoring. [design for exact labels]

**W5. Scheduling and loop:** Set the scenario's schedule dropdown to "Every 15 minutes" (or "Every 1 minute" on Core and up [secondary]) or "On demand". "Turn on" activates it. The bottom bar shows the next run time.

**W6. Daily loop:** Open "Scenarios" list, check status dots (green = last run OK, red = error). Click the scenario, open "History" to see runs and credit usage. Fix errors through the error route or "Resume" [design].

**W7. Scale and cost control:** Check the Usage/Credits page, set up auto-purchase of extra credits (available on Core/Pro/Teams [verified]), or upgrade plan.

### 4. Automation and AI features
- Triggers: instant webhook, scheduled polling, app-specific instant triggers (e.g. Stripe "Watch Events" described as instant [secondary]).
- AI: Make AI Agents and AI Toolkit use Make's AI Provider (billed in credits by tokens and operations); a custom provider connection bills Make for operations and the provider for tokens; the automatic provider connection (e.g. AI Web Search, AI Content Extractor) bills credits by tokens, operations and other factors [verified: help.make.com/credits]. Some AI modules cost more than one credit per operation [verified].
- Human review: no native approval step in the core product [design]; use a Gmail or Slack module with a human reply step, or a scenario that waits on a webhook.
- Published accuracy: none found.

### 5. Time saved and impact
[design] Similar to Zapier: 2–5 hours/week for a founder with 5–8 scenarios. Credits are the cost unit: a module action costs 1 credit by default, regardless of data size [verified]. A 6-module scenario that runs 1,000 times a month uses 6,000 credits (fits Core's 10,000 entry allotment [secondary]). Routers and error handlers are free [verified].

### 6. Failure modes
- Bundle explosion: a trigger returns 500 items, and each downstream module runs 500 times; credit burn spikes [design, common].
- Overlapping router filters: items land in the wrong route [secondary].
- Scenario stops at a router when no route matches and no fallback exists [secondary].
- Mapping `{{1.object.invoice_pdf}}` fails when the field is nested under "object" in Stripe's payload; the fix is to use a second module that fetches the object by ID [secondary, community forum].
- Stripe Watch Events don't always expose all fields; use a Custom Webhook as an alternative [secondary].
- Credit exhaustion before the cycle ends stops execution; users must buy extra credits [verified].

### 7. Integrations
Stripe to Slack or HubSpot; Typeform or Google Forms to HubSpot/Sheets; Gmail to Notion; Airtable/Sheets as a lightweight database; HTTP (any REST API) for enrichment; OpenAI or Anthropic modules for scoring and summaries.

### 8. Sources
- help.make.com/credits (read 2026-10-14) [verified]
- make.com/en/pricing (read 2026-10-14; plan names and free 1,000 credits verified, prices not in the rendered page) [partly verified]
- help.make.com/router.md (search snippet) [secondary]
- jetadmin.io/blog/make-pricing (September 2026) [secondary]
- community.make.com "Stripe Watch Events Module and Webhook Data Configuration" [secondary]

---

## PART 3: N8N (self-hosted vs cloud, AI agent nodes)

### 1. Summary
n8n is a fair-code workflow automation tool that is strongest for developers and technical founders. Its differentiator is self-hosting: the Community Edition is free to run on your own server with unlimited executions and workflows, though it lacks SSO, SAML, LDAP, audit logs, external secrets, log streaming and commercial support [secondary: Arahi, Coworker]. Cloud pricing is per workflow execution (not seats), in euros on n8n's pricing page [verified]:
- Starter: €20/mo (annual), 2,500 executions/mo, unlimited active workflows, 1,600 Assistant credits/mo, 5 concurrent executions.
- Pro: €50/mo (annual), 10,000 executions/mo, up to 9,600 Assistant credits/mo, 20 concurrent (50 listed as a second figure).
- Business: €667/mo (annual), 40,000 executions/mo, self-hosted only per the page; a cloud-hosted version is on a waitlist [verified].
- Enterprise: custom (SSO, SAML, log streaming, on-prem).
- Community Edition: free, self-hosted [verified: name and existence on the page; feature list secondary].
Note that the pricing page lists Business and Enterprise but its executions figures conflict with a secondary source that reports Pro at $120/mo for 50,000 executions. Treat that as an outlier.

### 2. Data model
- **Workflow**: a graph of nodes connected by wires. Each has settings, an "Active" toggle, tags, a folder and version history.
- **Node**: trigger, action, or logic node (IF, Switch, Merge, Loop Over Items, Code, Wait, HTTP Request). Each node gets its input as an array of items: `[{ json: {...}, binary: {...} }]`.
- **Item**: the basic unit; a node processes items one by one or all at once.
- **Expression**: `{{ $json.email }}` or `{{ $('Stripe Trigger').item.json.data.object.customer_email }}` to reference other nodes.
- **Credential**: stored secret for an app (Stripe, HubSpot, Slack). Shared across workflows.
- **Execution**: a run record with per-node data; retained per settings.
- **Data table** (n8n's built-in table) [design: exists in recent versions; verify].
- **AI nodes**: AI Agent node with a chat model sub-node, memory sub-node, and tool sub-nodes; each tool is a node connected to the agent [design: verify exact sub-node names].

### 3. Main workflows (step by step)
**W1. Setup (self-hosted, about 20 minutes):** Install with Docker: `docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n` [design: verify image name against docs.n8n.io]. Open localhost:5678, create the owner account. Or sign up for cloud Starter at n8n.io.

**W2. Stripe trigger to HubSpot (first workflow):** Click "+" on the canvas, search "Stripe Trigger", select the Stripe credential, set the Event list (e.g. `payment_intent.succeeded`, `checkout.session.completed`), and copy the webhook URL if not auto-created [secondary; n8n docs say the webhook is handled by the node]. Add "HubSpot" action "Create or update contact"; map `email` from `{{ $json.data.object.customer_details.email }}` (the Stripe path for Checkout sessions) [design]. Then "Slack" "Send a message" to a channel, with text using expressions.

**W3. Aha moment:** Click "Execute workflow" (the test button), then trigger a Stripe test event from the Stripe dashboard. The node panel shows the event JSON, and the user sees their own data flowing node to node.

**W4. Security step (required for production):** In the Stripe credential, set the Signature Secret. Without it, the trigger accepts unsigned requests from anyone with the URL. With it, the node checks `Stripe-Signature` and rejects requests older than five minutes with 401 [verified: docs.n8n.io trigger page; available from n8n 2.25.7 and 2.26.2].

**W5. Lead form to enrich to CRM (AI-optional):** Webhook node (or Typeform trigger) > HTTP Request to enrichment API > IF node (`{{ $json.employees }} > 50`) > HubSpot create/update in each branch > Slack. Optional: AI Agent node with a chat model to score the lead from the enrichment text, using a Structured Output Parser [design].

**W6. AI agent workflow:** Add "AI Agent" node. Connect a chat model sub-node (e.g. Anthropic or OpenAI), a memory sub-node (Window Buffer Memory), and tool sub-nodes (e.g. HubSpot tool, Gmail tool, a custom Workflow tool). Set the system prompt in "Options > System message". Test with the "Chat" trigger [design].

**W7. Daily loop:** Open "Executions" in the sidebar to see failed runs (red). Click one to see the node that failed and its input. Fix the expression or credential, then "Retry". Check the monthly execution count against the plan.

### 4. Automation and AI features
- Triggers: Webhook, Schedule, Stripe Trigger, app-specific triggers (poll or webhook).
- AI: AI Agent node with sub-nodes for model, memory and tools. Cloud plans include Assistant credits (1,600 Starter, 9,600 Pro) [verified]. Self-hosted lets you bring your own API keys with no per-token billing from n8n [design].
- Human review: a Wait node with "Resume on form submission" or webhook, or a Slack approval step [design].
- Published accuracy: none found.

### 5. Time saved and impact
[design] The cost advantage is execution-based: a self-hosted founder pays only for the server (secondary estimate $30–300/mo at scale [secondary: Arahi]), while cloud is €20–50/mo for 2,500–10,000 executions. A 4-node workflow that runs 1,000 times a month uses 1,000 executions (each run counts as one execution, not per node [design: verify]). Time saved is similar to Zapier, but the setup cost is higher (days, not hours) for non-developers.

### 6. Failure modes
- Self-hosting maintenance: upgrades, backups of the database and encryption key, and a stopped container all stop workflows [design, common].
- Webhook URLs change if the instance's base URL is not set correctly [design, common].
- Signature verification missing on Stripe Trigger: forged events accepted [verified].
- Expression errors: `$json` referencing the wrong item after a Merge [design, common].
- AI hallucination in agent tools: an agent calls the wrong HubSpot contact if the search is loose [design].
- Community Edition missing SSO, audit logs and commercial support for teams [secondary].

### 7. Integrations
Stripe, HubSpot, Slack, Gmail, Google Sheets, Notion, Typeform, Calendly, Airtable, OpenAI/Anthropic, and HTTP for everything else.

### 8. Sources
- n8n.io/pricing (read 2026-10-14; plan names, prices in EUR, executions, Assistant credits) [verified]
- docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.stripetrigger.md (read 2026-10-14; signature verification) [verified]
- jetadmin.io/blog/n8n-pricing (September 2026) [secondary]
- arahi.ai/blog/n8n-pricing-explained-2026 (April 2026) [secondary]
- coworker.ai/blog/n8n-pricing [secondary]

---

## PART 4: THE 15 MOST COMMON FOUNDER AUTOMATIONS

Each entry: trigger, then steps with exact config per tool. Zapier names are from its Stripe and Forms docs [secondary]. Make and n8n configs are [design] unless noted.

### A. Revenue and billing

**1. Stripe payment, to CRM, to Slack**
- Trigger: Stripe "New Payment" (Zapier) | "Watch Events", event `invoice.paid` (Make) | Stripe Trigger, event `checkout.session.completed` (n8n).
- Filter: amount > 0; skip test mode.
- Step 1: HubSpot "Create or Update Contact" (Zapier) or "Create a Contact" then "Search" (Make) or "HubSpot > Create or update contact" (n8n). Email = customer email; lifecycle stage = customer.
- Step 2: Slack "Send Channel Message" to #revenue. Text: `New payment: {{amount}} from {{email}} ({{plan}})`.
- Failure: dedupe on payment ID; retry if HubSpot fails.

**2. Stripe subscription cancelled, to churn tag, to exit survey**
- Trigger: Stripe event `customer.subscription.deleted` [documented Stripe event name; handling per sample apps, secondary].
- Steps: HubSpot update contact (`churn_date` = today; `lifecycle` = churned), Slack post to #churn, Gmail sends an exit survey with a Typeform link (delay 1 hour).
- Filter: skip if the subscription was switched to a new plan (check `previous_attributes`) [design].

**3. Failed payment, to dunning alert**
- Trigger: `invoice.payment_failed`. Handling varies by app [secondary].
- Steps: Slack alert to #billing with customer email and `attempt_count`; Gmail to customer after Delay 1 day: "Your card didn't go through; update here: {{hosted_invoice_url}}" [design].
- Filter: only when `attempt_count` = 1 (avoid re-emailing on each retry) [design].

**4. Paid invoice to accounting ledger**
- Trigger: Stripe `invoice.paid`.
- Steps: QuickBooks or Xero "Create Invoice" or "Create Payment" (depends on the accountant's setup) [design]. Store the Stripe invoice ID in the memo.
- Note: founders often use a MoR (Paddle, Lemon Squeezy) instead; then the trigger is the MoR's webhook [design].

### B. Leads and sales

**5. Form lead, to enrichment, to CRM, to Slack (scored)**
- Trigger: Typeform "New Entry" (Zapier) | Typeform "Watch Responses" (Make) | Typeform Trigger (n8n).
- Step 1: enrichment (Apollo "Enrich Person" or Clearbit/Clay HTTP call) using `email`. Map `company`, `employees`, `title`.
- Step 2 (scoring): Code or Formatter step: score = +20 if employees > 50, +20 if title contains "CEO|CTO|Founder", +10 if `use_case` filled. Use n8n Code node or Zapier Formatter "Numbers" [design].
- Step 3: HubSpot "Create or Update Contact" with `hs_lead_status` = NEW, custom property `lead_score` = score.
- Step 4: Slack post to #leads only if score >= 40. Text: `{{score}} | {{name}} | {{company}} | {{use_case}}`.
- Human review: Slack post is the review point.
- Accuracy: enrichment match rate is not published by any vendor I could verify [unverified].

**6. Form routing (Paths or Router)**
- Trigger: same as #5.
- Zapier: Paths. Path A filter `employees` greater than 200 > route to HubSpot owner "Enterprise". Path B `employees` less than or equal to 200 > route to "SMB". Fallback path > owner "Founder".
- Make: Router with the same filters. Route 3 without filter is the fallback [secondary guidance: always include a fallback].
- n8n: IF node then Switch node [design].

**7. Booked demo, to CRM meeting, to prep brief**
- Trigger: Calendly "Invitee Created" | Google Calendar "Event Start" (if the founder uses calendar) [design].
- Steps: HubSpot "Create meeting" or log a note. Slack DM to founder with the lead's form answers and their company's last 5 news items from an AI step (Zapier AI by Zapier, Make AI, or n8n AI Agent with a web search tool) [design].
- Human review: founder reads the brief before the call.

### C. Calls, notes and follow-up

**8. Meeting recorded, to AI summary, to CRM note**
- Trigger: Fireflies "New Transcript" (Zapier) | Fireflies webhook or Otter "New Transcript" [design; verify app name].
- Step 1: AI action with prompt: "Summarize in 5 bullets. List decisions and action items with owners. Do not infer facts not in the transcript." Input: `{{transcript}}`.
- Step 2: HubSpot "Create Note" associated to the contact found by attendee email.
- Step 3: Slack DM to founder with the summary and a "Review" link.
- Known failure: the summary invents an attendee or a number [design, common]; the human review step is the check.

**9. Action items, to task manager**
- Trigger: same as #8.
- AI step extracts `[{task, owner, due}]` as JSON.
- Steps: Asana, Notion or Linear "Create Task" per item; filter owner equals the founder's name so only their tasks go in [design].

### D. Onboarding and activation

**10. New signup, to welcome email sequence**
- Trigger: a webhook from the app (Zapier "Webhooks by Zapier > Catch Hook"; Make "Custom webhook"; n8n "Webhook" node) with body `{ "email": "...", "name": "...", "plan": "trial" }`.
- Steps: Loops or Customer.io or Gmail "Send Email" with subject "Welcome to {{product}}, {{first_name}}". Delay 1 day > Gmail "Send Email" "Did you connect your first {{integration}}?". Delay 3 days > conditional email if no activation event.
- Zapier: Delay By Zapier action. Make: "Sleep" module. n8n: Wait node [verify].
- Filter: skip if email domain is `test.com` or `example.com` [design].

**11. Trial inactivity nudge**
- Trigger: Schedule (daily 09:00 in user's timezone). Zapier "Schedule by Zapier"; Make "Schedule"; n8n "Schedule Trigger".
- Step 1: query the app database or Stripe customers with `trial_end` < 3 days and `last_active` > 3 days (use Airtable/Sheets or an HTTP call).
- Step 2: Loop/iterator over each row; Gmail send nudge.
- Failure: sends the same email every day to the same user; store `nudged_at` in a Storage key (Zapier Storage by Zapier, Make data store, n8n data table) [design].

### E. Support and retention

**12. Support email, to AI triage, to ticket**
- Trigger: Gmail "New Email Matching Search" with search `to:support@...` | Help Scout "New Conversation" [design].
- Step 1: AI action: classify into `bug | billing | how_to | feature | spam` and draft a reply using the FAQ text, marked "DRAFT".
- Step 2: filter: `category` = billing > Slack #billing with the draft; else Slack #support.
- Step 3: Gmail draft (not send) into the founder's drafts folder for review.
- Human review: founder approves each send.
- Accuracy: no vendor-published accuracy in this flow [unverified]; Fin resolution rates belong to Intercom (outside this report).

**13. Prospect reply, to CRM stage update**
- Trigger: Gmail "New Email" filtered by label or `from:` a known contact list [design].
- Step 1: HubSpot "Find Contact" by sender email.
- Step 2: HubSpot "Update Deal Stage" to "Replied". Filter: only if deal stage is "Contacted" (prevents overwriting later stages).
- Step 3: Slack DM "{{name}} replied" [design].

### F. Product and data

**14. Usage limit hit, to CRM property, to sales task**
- Trigger: webhook from the app when a usage limit is reached `{ "user_email", "limit": "seats", "used": 10 }`.
- Steps: HubSpot update contact `usage_limit_hit` = true; Asana or HubSpot task "Call {{name}}: hit seat limit" due in 1 business day; Slack #expansion.
- Filter: only on the first event per user per month (use Storage key) [design].

**15. Monday metrics digest**
- Trigger: Schedule, every Monday 08:00 (Zapier "Schedule by Zapier"; Make "Schedule" set to weekly; n8n "Schedule Trigger" with cron `0 8 * * 1`).
- Step 1: Stripe "List Customers" or "Get Subscriptions" for MRR. If using Sheets, "Get Many Rows" from the metrics sheet.
- Step 2: Formatter or Code step computes last week's MRR, new, churned, using the previous row stored in Storage or a data table.
- Step 3: AI summary (optional, with a fixed template).
- Step 4: Slack post to #founders; Google Sheets "Create Row" to log the week.
- Failure: Stripe pagination (only first 100 customers) if the code doesn't loop [design, common].

---

## Cross-tool comparison (for the simulator)
- Zapier: fastest to first working automation; task-based billing; Paths for branching; best app coverage.
- Make: best for branching and array data; credit-based with router and error handling free; visual canvas with bundles.
- n8n: best for developers and self-hosting; execution-based billing; code nodes and AI Agent node; highest maintenance burden.

## Gaps (not verified)
- Make's per-plan prices and Business tier cloud/self-host details.
- Zapier Interfaces vs Forms naming conflict (help article says Interfaces; pricing page says Forms).
- Exact Stripe event handling per app (checkout.session.completed mode behavior).
- Time-saved estimates are [design], not measured.
- Fireflies, Calendly, Help Scout and Apollo node names in Make and n8n are [design] until checked in each tool's app list.
