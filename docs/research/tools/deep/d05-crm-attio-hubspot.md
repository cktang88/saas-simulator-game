# D05: CRM deep dives, Attio and HubSpot (Starter/Pro for startups)

Research date: 2026-10-14. Primary pages fetched are cited with their stated date. Where a primary page did not render or disagreed with a secondary source, the conflict is noted. [unverified] means only secondary sources were found. [design] marks my own estimates.

---

## Part 1: Attio

### 1. Summary

Attio is a flexible, relationship-first CRM aimed at small and growing B2B teams that want a database they can reshape. Its pitch is "a CRM you build yourself": objects, lists and attributes are configurable, and email and calendar sync fill the database automatically. Its 2026 positioning leans on AI: Ask Attio (a chat assistant over the workspace), AI attributes that fill fields, and a workflow builder with a custom AI agent block. Pricing (attio.com/pricing, footer "© 2026", no update date, fetched 2026-10-14): Free, $0, up to 3 seats, 100 seat credits per user per month and 250 workspace credits per month, 50,000 records, 3 objects. Plus, $44 per user per month monthly or $35 billed annually, up to 10 seats, 500 seat credits and 1,500 workspace credits, 250,000 records, 5 objects. Pro, $99 monthly or $79 annually, unlimited seats, 1,000 and 10,000 credits, 1 million records, 12 objects, 14-day trial. Enterprise is custom. Annual billing is 20% off on Plus and Pro. Secondary blogs quote older prices ($29 and $69 per seat, marketbetter.ai; tldv.io cites $35/$79 annually), so treat the primary table as authoritative and recheck before shipping. Credits are the metered unit for AI attributes, enrichment and Ask Attio.

### 2. Data model

- **Workspace**: the tenant. Holds members, objects, lists, workflows, credits.
- **Object**: a type of thing, roughly a table. People and Companies are on by default. Deals, Users and Workspaces are optional. Custom objects are allowed (Plus allows 5, Pro 12).
- **Record**: one instance of an object (one person, one company). Roughly a row.
- **Attribute**: a field on an object or list. Types: Text, Number, Currency, Date and timestamp, Checkbox, Select and Multi-select (up to 5,000 options), Status (required for kanban), Rating (1 to 5), Location, Phone, User, Record (reference to another record, can allow multiple values), Relationship (bidirectional, Pro and Enterprise only), Formula (Pro and Enterprise only). Text, Select and Multi-select can also use AI Autofill.
- **System attributes** are built in (name, email, domain). They cannot be deleted or archived, and their slugs are fixed. **Enriched attributes** are system fields on People and Companies that Attio populates automatically; a manually entered value stops future enrichment for that field.
- **List**: a pipeline or segment, such as a Sales list. Each **list entry** points at one record and carries its own list attributes (deal stage, next step, value) plus the parent record's attributes.
- **Object attribute vs list attribute**: an object attribute applies across lists; a list attribute only exists within one list.
- Rules that catch people: custom "required" attributes exist only on custom objects, and custom "unique" attributes only on custom objects and Deals, Users and Workspaces. Uniqueness is case-sensitive.
- Source: docs.attio.com/docs/objects-and-lists (fetched); attio.com/help/reference/managing-your-data/attributes/create-manage-attributes (fetched).

### 3. Main workflows

**A. Setup and onboarding (about 30 to 60 minutes).**
1. Sign up, name the workspace, and invite teammates. Plan limits apply to seats.
2. Connect email and calendar: click the workspace name (top left), then Account settings, then Email and calendar accounts, then Connect Account. Choose Google or Microsoft and authorize. Private calendar events are excluded.
3. Choose the contact-creation mode. The default is "Selective contact creation": people are created only when your team has emailed or met them. Company records are created from non-public domains (gmail.com is excluded). Company auto-creation is on by default.
4. Import existing data by CSV or a migration service (migration help is sales-assisted on Plus and up).
5. Check the default sharing setting. Metadata (timestamps, participants) and subject lines are shared with the team by default; bodies stay private unless you opt in.

**B. Build the pipeline.**
1. Click Lists, then New list, and name it "Deals" or "Sales."
2. Add a Status attribute with stages (it drives kanban view). Add list attributes such as Value (Currency), Close date (Date), Owner (User), Next step (Text).
3. Add a Record attribute to link a deal to a company.
4. Add entries by dragging records into the list or from a record page (Add to list). Each entry gets its own row and its own list-level fields.
5. Switch between table and kanban views. Filter, sort and save views; views are the working surface for most users.

**C. The daily loop.**
1. Open the inbox-like Activity or the Lists view.
2. Open a record. The record page shows the timeline (email, calendar, notes, call recordings on paid plans), attributes, list memberships and tasks.
3. Log a note or task directly from the record.
4. Move the list entry's status by changing its stage. Kanban drag is the fast path.
5. Use Ask Attio (chat over the workspace, e.g. "which deals have not had a reply in 14 days?") to build a quick view.

**D. AI attributes (the "aha" for many users).**
1. Add an attribute, and under AI Autofill pick a type: Summarize record, Web agent (researches public web sources for a question, writes the answer with confidence dots), Prompt completion (custom prompt, sees only referenced attributes), or Classify record (select or multi-select tags; can create new options).
2. Attio does not run these automatically. Trigger them per cell (hover, Run AI autofill icon), on selected cells (right-click, Recalculate with AI), or on a whole column (column header, Run AI autofill, which shows the credit count to confirm).
3. Cost: one credit per record for most types; Web agent costs 10 credits per record. Blank outputs are not charged. Classify still charges when no option matches.
4. Review: confidence dots (green, yellow, red) with hover reasoning. Vague prompts leave cells blank. Filter and save the view to skip records; "skip these" in the prompt does not work.
- Source: attio.com/help/reference/managing-your-data/attributes/ai-attributes (fetched).

**E. Workflows (automation builder).**
1. Open Workflows, then New workflow. Pick a trigger.
2. Triggers (from the block library): Record created, Record updated, Attribute value changed, List entry created or updated, Record added to list, Task created, Note created, Call recording created, Webhook received, Manual run, Recurring schedule.
3. Steps: Create or update record, Update record, Find records, Add record to list, Update list entry, Create task, Create note, Enroll in sequence, Exit from sequence, Filter, If, Switch, Delay, Delay until, Round robin, Send HTTP request, Loop, Parse JSON, Execute code, Formula, Custom agent (AI), Classify record, Summarize record, Save AI block outputs.
4. The editor now validates variable names as you build (changelog 2026-09-23).
5. Typical recipe: trigger "Record added to list: Deals" then Filter (value greater than 10k) then Round robin (assign owner) then Create task (due +2 days). The "Send email" action is not in the block list; email goes through sequences or the mail client.
- Source: attio.com/help/reference/automations/workflows/workflows-block-library (fetched); changelog 2026-09-23 (fetched). The custom agent block appears in that changelog, so it exists, but its configuration screen was not fetched.

**F. Reporting.** Reports are built on lists and objects (Free up to 3, Plus up to 15, Pro up to 100). Build a bar or funnel chart by stage, grouped by owner. [design] Reports are a common place for first-time users to hit the report-count limit.

### 4. Automation and AI features

- **Email and calendar sync**: automatic. Gmail must be Google Mail; Outlook must be Microsoft 365 (on-prem Exchange and third-party-hosted accounts are not supported). Only Inbox and Sent folders sync for Outlook. Plan limits: Free and Plus one synced account per member, Pro two, Enterprise unlimited. Email body sharing is opt-in.
- **Enrichment**: system fields on People and Companies are filled automatically; the source and refresh cadence were not verified (help page 404). Credits are consumed. [unverified]
- **Ask Attio**: conversational assistant over the workspace. Since 2026-09-23 it displays the credit cost of each thread. Model picker includes Claude Opus 5.5, GPT 6 Sol and Gemini Flash 3.8 (changelog 2026-09-23, fetched).
- **AI attributes**: described above. Human review point: the cell itself, before any workflow writes the value.
- **Workflow AI steps**: custom agent, classify, summarize, save outputs to a regular attribute. These can run on record creation, so one new contact can burn credits unattended.
- **MCP server**: Attio exposes an MCP server so AI assistants can read and write the workspace. [unverified date; secondary sources only]
- Published accuracy numbers: none found for Attio's AI features.

### 5. Time saved and impact

- [design] Manual CRM hygiene for a solo founder (logging emails, creating contacts, updating stages) is often 3 to 5 hours per week. Automatic sync removes most of the logging. Realistic saving: 2 to 3 hours per week, less if the founder never reviews the pipeline.
- Credit cost, from the primary pages: 1 credit per AI-attribute record, 10 per Web agent record. At Plus (1,500 workspace credits plus 500 per seat), 1,000 Web agent records would consume 10,000 credits, so Web agent use on a large list needs Pro or extra credit packs. Extra workspace credit packs are listed at $85 to $595 per month monthly (+5,000 to +50,000 credits per month), $70 to $475 annual. [design] Model cost per 1,000 prospects enriched with a Web agent column on Plus as roughly 10,000 credits.

### 6. Failure modes

- **Sync noise**: default contact creation can add many people and companies from a busy inbox, polluting lists. The fix is to reduce the sync scope or delete records in bulk. [design]
- **Outlook restrictions**: non-M365 or on-prem accounts fail to connect; only Inbox and Sent sync, so archived or custom-folder threads do not show. Documented.
- **Sharing confusion**: help pages disagree on whether the default is metadata only or metadata plus subject lines. The primary page says metadata and subject lines. Check the workspace setting.
- **AI attributes**: blank cells when prompts are vague; Web agent misses private or login-protected sites; Classify may force-tag when unsure. Documented on the help page.
- **Credit burn**: a workflow with an AI step on Record created runs for every new record, which can exhaust credits. Ask Attio credit display (2026-09-23) only helps once you look at it. [design]
- **Locked fields**: manually entering an enriched field stops future enrichment for it. Documented.
- **Plan gates**: Relationship and Formula attributes, and workflow features in some tiers, are Pro or Enterprise only. Users who build on Plus hit these limits. Documented on the attributes page.
- Frequency of these failures: not published. [unverified]

### 7. Integrations

- Gmail and Google Calendar (sync), Outlook and Microsoft 365 calendar (sync).
- Automation platforms: Zapier, Make, Relay and viasocket connect Attio to Slack, HubSpot, Stripe, Notion and Typeform through their own Attio app connectors. [unverified detail]
- Typical data flows: a form or signup tool posts to a webhook, a workflow creates or updates the person and company, and a list entry is added; Slack receives a notification.
- REST API with attribute and list endpoints (developers.attio.com); the API's scopes differ by object vs list.
- Lead capture from a website typically goes through a form tool and the API, since there is no native form builder as far as found. [unverified]

### 8. Sources

- attio.com/pricing (fetched 2026-10-14; "© 2026", no update date)
- docs.attio.com/docs/objects-and-lists (fetched)
- developers.attio.com/docs/data-model (search result)
- attio.com/help/reference/managing-your-data/attributes/create-manage-attributes (fetched)
- attio.com/help/reference/managing-your-data/attributes/ai-attributes (fetched)
- attio.com/help/reference/email-and-calendar/email-and-calendar-syncing (fetched)
- attio.com/help/reference/automations/workflows/workflows-block-library (fetched)
- attio.com/changelog/2026/changelog-september-23-2026 (fetched 2026-10-14)
- attio.com/help/reference/attio-ai (fetched; index page only)
- Secondary, price conflicts: marketbetter.ai/blog/attio-crm-pricing-breakdown-2026/ and tldv.io/blog/attio-crm/ [unverified]

---

## Part 2: HubSpot Starter and Professional for startups

### 1. Summary

HubSpot is a broad suite (Marketing, Sales, Service, Operations, CMS, Commerce) with a free CRM. Its small-business tier is the Starter edition of each hub, and Professional is the step up for real sales and automation work. The 2026 positioning centers on Breeze, HubSpot's AI layer, with outcome-priced agents (Customer Agent, Prospecting Agent) and metered HubSpot Credits. The startup discount (HubSpot for Startups) is the most commonly quoted lever for early-stage companies. Small-team list prices: Sales Hub Starter is $9 per seat per month billed annually ($15 monthly) with a base platform fee; Sales Hub Professional is $90 per seat per month annually ($100 monthly) plus a $1,500 one-time onboarding fee. Source: hubspot.com/pricing/sales (blog "Updated 09/09/26" comparison, see sources). The official pricing table did not render in the fetch, and one secondary summary quotes Starter at $7. Treat exact figures as [unverified] until checked on the live page.

### 2. Data model

- **Contacts** (people), **Companies**, **Deals**, **Tickets**, **Products** and line items, **Quotes** (Revenue Hub), **Activities** (emails, calls, meetings, notes, tasks).
- **Properties**: typed fields on each object (text, dropdown, number, date, currency, multi-checkbox). Custom properties are free on Starter and Pro; custom objects are Enterprise. [unverified]
- **Associations**: typed links between objects (contact to company, contact to deal). A contact can belong to several companies and deals; this is the core model.
- **Pipelines and stages**: each deal belongs to one pipeline and sits in one stage. Each stage has a probability and a closed-won or closed-lost flag. Starter caps the number of pipelines; Professional allows many more.
- **Seats**: each user holds a seat type. Core seats (Starter) unlock Starter features; Sales seats (Professional and Enterprise) unlock Sales Hub features at that tier. View-only seats are free. (knowledge.hubspot.com/account-management/manage-seats, last updated 2026-08-28, fetched.)
- **Workflows**: triggered automations on records. Starter gets basic workflows; Professional gets customizable ones (count disputed, see below).
- **Sequences**: multi-step email and task cadences enrolled from contacts.

### 3. Main workflows

**A. Startup program onboarding.**
1. Check eligibility at hubspot.com/startups (questionnaire).
2. Tier 1 requires that you have raised pre-seed, seed or Series A (not Series B or later) and are affiliated with an approved HubSpot for Startups partner or have verified funding (Crunchbase, Harmonic; PitchBook mentioned).
3. Tier 2 is for members of approved entrepreneurial organizations: 30% off year one, 15% in year two.
4. Tier 1 is 90% off year one, 50% in year two, 25% in year three (per the page). The FAQ says the discount is typically two years; the schedule conflicts. Check the terms.
5. The discount applies to new Professional or Enterprise products. An annual commitment is required.
6. Import contacts, deals and data during setup. (hubspot.com/startups fetched 2026-10-14; undated.)

**B. Sales Hub setup.**
1. Create the account, choose a Starter or Professional seat, and invite users.
2. Connect Gmail or Outlook (Starter and Pro both include the email integration).
3. Import contacts from CSV; map columns to properties; associate contacts with companies.
4. Settings, then Objects, then Deals, then Pipelines: name the pipeline, add stages with probabilities, mark closed won and closed lost.
5. Create the first deal from a contact record, pick the pipeline, and set amount, close date and owner.

**C. Daily loop.**
1. Open the Deals board (kanban by stage) or the Tasks list.
2. Open a deal: timeline shows emails, calls, meetings and notes; the sidebar shows associated contacts and companies.
3. Log a call or send a sequence step. Professional users enroll contacts in sequences from the contact record.
4. Drag a deal to the next stage; the probability and forecast update.
5. Review the forecast dashboard (Professional).

**D. Sequences (Pro).**
1. Settings, then Sequences, then New sequence. Add email and task steps with wait days.
2. Enroll contacts individually or from a list. Sequences pause when a reply arrives.
3. Limits: up to 5,000 sequences per account, and a per-user daily send cap (secondary source: 500 per user per day; unverified).

**E. Workflows.**
1. Automations, then Workflows, then Create workflow. Choose contact-based or deal-based.
2. Set enrollment triggers (e.g. deal stage becomes Proposal Sent).
3. Add actions: send internal notification, create task, set property, assign owner, enroll in sequence, webhook.
4. Starter's workflow actions and triggers are restricted; Professional gets the full set.
5. Turn on, then check enrollment history.

**F. Breeze agents and HubSpot Credits.**
1. Breeze Assistant is the chat help inside the product.
2. Customer Agent (website and inbox chat): enable Generative AI features, CRM data, conversion data and files data in AI settings; connect a Facebook, WhatsApp or live-chat channel; sync knowledge base articles. Editing requires the Customer agent editor permission and an assigned seat. (knowledge.hubspot.com/customer-agent/understand-the-customer-agent, updated 2026-08-10, fetched.)
3. Prospecting Agent: described as producing leads recommended for outreach from a target segment. Breeze can set up a play from a description (September 2026 update, secondary).
4. Knowledge Base Agent (beta): 200 credits per generated article (product catalog, secondary).

**G. Reporting.** Standard dashboards and custom reports on deals and activities. Forecasting dashboards (revenue forecasts) are Professional-only. Conversation intelligence is listed as Enterprise. (blog.hubspot.com comparison.)

### 4. Automation and AI features

- **Customer Agent**: answers visitor questions from synced content and can run configured actions (password reset, meeting booking). It hands off when confidence is low or on request. A conversation counts as **resolved** when the agent shares content or completes an action and the visitor does not request a qualifying human handoff within 72 hours of their last message. Lead qualification counts immediately. Pricing since 2026-04-14: $0.50 per resolution, 50 credits (was $1.00 per conversation). Required tier: Pro or Enterprise. (hubspot.com company news, 2026-04; KB page.)
- **Prospecting Agent**: $1.00 (100 credits) per lead recommended for outreach. A lead counts when qualified and handed to sales. Pro or Enterprise.
- **Data Agent**: about 10 credits per response (secondary, unverified).
- **Trial**: both outcome agents include a free trial. The company news says 28 days; the KB article for Customer Agent says new users get 14 days free with no credits used. The two conflict; check the current terms.
- **Published accuracy**: HubSpot's own announcement claims the Customer Agent resolves 65% of conversations and cuts resolution time 39%, based on more than 8,000 customers. This is vendor-reported. A reviewer cites 50% or more in practice. [unverified]
- **Human review**: handoff is automatic on low confidence or request, and the agent cannot reply past its credit allotment; when credits run out it stops taking new conversations.

### 5. Time saved and impact

- [design] A founder handling inbound chat questions spends about 1 to 2 hours a day on repeat answers. A Customer Agent resolving around half of chats (vendor claim 65%, conservative 50%) could save several hours per week, but only once the knowledge base is good.
- Cost per resolution: 50 credits at about $0.01 each equals $0.50 per resolution. A chat that gets 100 conversations per month with 50 resolved costs $25 in credits, before the seat and platform fees. [design]
- Prospecting: 100 credits ($1.00) per recommended lead. Enriching 300 leads a month costs $300 in credits. [design]
- Starter at $9 per seat annually for a two-person team is about $216 per year plus the platform fee; Professional at $90 per seat is about $2,160 per year plus $1,500 onboarding for the same two users. [design, from quoted list prices]

### 6. Failure modes

- **Resolution inflation**: the 72-hour window counts a conversation resolved even if the visitor later wanted a human, which can flatter the agent's numbers. Documented.
- **Credit exhaustion**: the agent stops taking conversations when credits run out, so chat can go silent mid-month. Documented.
- **Tracking code**: if the website is not hosted on HubSpot, the tracking code must be installed on each page, or chat does not appear. Documented.
- **Starter limits**: pipeline caps, basic workflows and no sequences make Starter a frustrating step for a founder who wants sales automation. Documented.
- **Seat confusion**: a Starter user without a Core seat cannot see Sales features; a Pro feature needs a Sales seat, and mixing seat types causes "why can't they see this" tickets. Documented.
- **Startup discount cliffs**: the program steps down over time and requires an annual commitment, so year two and three costs can jump. Documented.
- **Price-page drift**: published list prices changed several times in 2026 and third-party sites disagree. [unverified frequency]

### 7. Integrations

- Gmail and Outlook (email sync and logging), Google Calendar and Outlook calendar (meetings).
- Stripe and billing tools (deal and contact sync via marketplace apps).
- Slack (notifications from workflows and deal alerts).
- Typical data flows: a form on the website (HubSpot Forms, free on the CRM) creates or updates a contact and enrolls them in a workflow; a chat conversation creates a contact and a ticket; a deal stage change notifies Slack. [design, standard HubSpot patterns]
- Zapier and Make connect HubSpot to Attio and other tools for two-way syncing. [unverified]

### 8. Sources

- hubspot.com/pricing/sales (fetched 2026-10-14; did not render prices; the price summary comes from the blog below)
- blog.hubspot.com/sales/hubspot-sales-hub-pricing (fetched; page marked "Updated 09/09/26")
- knowledge.hubspot.com/account-management/manage-seats (fetched; updated 2026-08-28)
- hubspot.com/startups (fetched 2026-10-14; undated)
- hubspot.com/company-news/hubspots-customer-agent-and-prospecting-agent-now-you-pay-when-the-task-is-complete (fetched; April 2026 announcement)
- knowledge.hubspot.com/customer-agent/understand-the-customer-agent (fetched; updated 2026-08-10)
- hubspot.com/products/artificial-intelligence/credits (search result; fetch returned 404 for the knowledge-base credits URL)
- Secondary and conflicting: costbench.com, resonatehq.com, spotdev.co.uk, resolve247.ai, pricingsaas.com (2026W23) [unverified]

### Conflicts to resolve before the simulator ships
- Starter seat price: $9 annual (blog 09/09/26) vs $7 (search summary of the official page). Not confirmed.
- Pipeline caps: blog says Starter 2, Pro unlimited; search summary of the official page says 15 and 100. Not confirmed.
- Starter workflows: blog says basic only; search summary says 50 workflows on Starter and 300 on Pro. Not confirmed.
- Startup discount schedule: page says 90/50/25 over three years; FAQ says two years.
- Outcome agent trial: 28 days (company news) vs 14 days (KB article).
