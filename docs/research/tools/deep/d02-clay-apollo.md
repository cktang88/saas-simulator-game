# Deep dive 02: Clay and Apollo

Research date: 2026-10-14. Primary sources were used where they could be fetched. Where only secondary sources were available, the claim is marked [unverified]. Estimates are marked [design].

---

## Part A: Clay

### 1. Summary

Clay is a data-enrichment and GTM workspace built around a spreadsheet-like "table." Each row is a lead, company or contact, and each column is either a data source, an enrichment (a lookup against third-party data providers), an AI column (Claygent), a formula, a waterfall, a signal monitor, or a send action. Its users are RevOps people, growth engineers and founder-led outbound teams. The 2026 positioning is "GTM data and orchestration": Clay supplies the data and the logic, and sending runs through its Sequencer or a CRM. In March 2026 Clay replaced its old Starter, Explorer and Pro plans with Free, Launch and Growth, and split usage into two meters: Data Credits (bought third-party data) and Actions (platform work).

Price tiers, from the pricing page (https://www.clay.com/pricing, fetched 2026-10-14):
- Free: $0. 500 Actions/mo, 100 Data Credits/mo, 200 rows per table. No phone enrichment, no signals, no CRM sync, no Sequencer email campaigns (FAQ and feature table disagree).
- Launch: $167/mo annual or $185/mo monthly. 15K Actions/mo (monthly-billed option starts at $60/mo for 15K) and 2.5K Data Credits/mo (monthly-billed option starts at $125/mo). Adds phone enrichment, job-change and other signals, scheduled enrichment, custom functions, email campaigns. Up to 50,000 rows per table (per FAQ).
- Growth: $446/mo annual or $495/mo monthly. 40K Actions and 6K Data Credits as the entry allotment. Adds CRM auto-sync, warehouse sync, HTTP API, web-intent signals, webhooks. Buying sending domains and mailboxes requires Growth or Enterprise (per Clay's Sequencer docs, cited below).
- Enterprise: custom, from roughly $30K/yr per one third-party source [unverified]. Adds SSO, RBAC, a dedicated CSM and 15-minute source sync.

Seats and tables are unlimited on every plan. Pricing shows discrepancies: the Launch card says "3K data credits/mo" while the option list starts at 2.5K. Legacy Starter ($149), Explorer ($349) and Pro ($800) still exist for existing customers only [unverified, third-party reports].

### 2. Data model

- **Workspace**: contains tables, Audiences, Sequencer campaigns, Claybooks (templates), credit budgets.
- **Table**: rows and columns. Row limit is 200 on Free and 50,000 on Launch. A table with phone or email waterfalls can raise the column cap (sources disagree: 60 in the French docs, 70 in the English guide [unverified]).
- **Row**: one entity (person, company, or both). Fields: input values, each enrichment's output, a status per column.
- **Column types**: source (imported CSV, CRM, Audience); enrichment (a provider lookup, such as work email or phone); waterfall (an ordered chain of providers, see workflow 3); Claygent / AI column (a prompt that does web research and writes a structured output, with a visible reasoning trace); formula (computed value, optionally AI); signal (monitor that writes new results to the row); action (send to CRM, HTTP API, webhook, Sequencer).
- **Run settings** on each column: auto-update, run conditions (when it fires), concurrency, per-request maximum cost.
- **Credits**: each column run is charged to one of the two meters. Data Credits are charged for marketplace data. Actions are charged for platform work. No charge if the enrichment returns no result. Bring-your-own API keys use no Data Credits (one Action per run). Variable AI models bill at token cost, shown with "~" estimates [Clay pricing page].
- **Rollover**: Actions reset each cycle. Data Credits roll over up to 2x monthly per the FAQ, while the feature table says "up to 1 month's credits". The sources conflict. Top-ups cost a 30% premium on Launch and Growth.

### 3. Main workflows

**Workflow 1: Setup and first table (onboarding).**
1. Sign up, pick a plan (Free to start). Create a new table or open a template from the template gallery.
2. Import a CSV, or add a source column (for example a saved Audience or a CRM list).
3. Click "Add enrichment" in the top-right of the table, search a data point (for example "work email"), pick a provider or a waterfall.
4. Map the input columns (name, company domain, LinkedIn URL).
5. Run on 5 rows first. Check the output columns and the credit estimate.

*Aha moment*: a single table where an enrichment fills in row by row, followed by a Claygent column that answers "does this company use Snowflake?" from live web research. [design]

**Workflow 2: Adding a single enrichment.**
Click "Add enrichment," search the data point, choose a provider. Set its input and optional run conditions, then Save. Results land as new columns. Clay shows the Action and Data Credit estimate before you confirm.

**Workflow 3: Building a waterfall.**
Two routes, documented at https://university.clay.com/docs/building-a-data-waterfall (fetched 2026-10-14):
- New waterfall column: "Add column", choose "Waterfall", rename it, pick a Data Type, add actions in order, Save.
- Pre-built waterfall: "Add enrichment", search (e.g. phone number), choose one under the "Waterfalls" heading. Set the "Waterfall sequence": reorder providers, add or delete, or switch off a provider's toggle to skip it. Enter the inputs (email or social URL). Optionally output the name of the provider that succeeded and hide the per-provider columns. Set Run settings (auto-update and conditions). Optional "Save as template".
The behavior is: providers run in order, and the first hit fills the final output. Clay's free-tier and pricing docs say you pay only for lookups that return something, so the cost of a waterfall is bounded by the first hit. Documentation of the run-condition syntax and the final-column location was not found in the fetched pages [unverified: the final value is in the last column per a community answer].

**Workflow 4: Claygent (AI research column).**
Add a column, choose Claygent, write a prompt that references other columns (for example "Read the company site and the last three job posts; does it hire SDRs? Answer yes, no or unknown with a one-line reason"). Set an output schema (text, yes/no, list). The prompt is shared by all rows, so editing it updates the whole column. Each decision comes with a reasoning trace. Clay positions Claygent for company research, lead qualification and signal detection (https://www.clay.com/claygent). Per-run cost is not published on the pricing page; third-party estimates say 3 to 10+ Actions [unverified], and a community post mentions a $0.50 default per-request cap that the user can change [unverified, predates the March 2026 pricing change].

**Workflow 5: Signals (monitoring).**
From Signals, or the table's Actions menu, choose a signal and set its identifier column. Signals documented at https://university.clay.com/docs/signals (fetched 2026-10-14): Topic intent (weekly minimum; company domain or profile URL), New hires, Promotions, Job change (person profile URL), Job postings, News and fundraising (company domain), and Web intent (Growth or Enterprise only). Run frequency is Quarterly, Monthly, Biweekly, Weekly or Daily; new signals default to Monthly. Each signal writes results into the table. Clay shows an estimate before you start. Per-record cost is not stated on the page (it is charged per result or per record checked). Job-change monitoring can be fed into a Claybook template that enriches email and posts to Slack or the CRM.

**Workflow 6: Sending through the Sequencer.**
Sequencer docs (https://university.clay.com/docs/sequencer-faqs-and-best-practices and https://university.clay.com/docs/getting-started-with-sequencer), fetched 2026-10-14:
1. Create a campaign from a table. Choose sender accounts: connect your own (Google or Microsoft admin authorization, or SMTP) on Launch, or buy domains and mailboxes on Growth and Enterprise.
2. Write up to four emails per sequence. Plaintext is the default; HTML unlocks tracking, which Clay advises against for cold sends. Use spintax and per-lead variables.
3. Set the schedule window and random spread across the working day. Per-account minimum gap is 20 minutes.
4. Set the per-inbox cap: about 20 emails a day per inbox at steady state, 3 inboxes per domain (5 at most).
5. Launch. Edit copy and timing while paused. Steps cannot be added or reordered after launch.
6. A reply ends that lead's sequence. Out-of-office replies are tagged neutral and push the next step past the return date.
7. Watch the bounce rate. Clay says a bounce rate at or above 5% is the point to stop and inspect the list and sender accounts. Add bad addresses to the Blocklist.

Clay says purchased accounts take about three weeks to warm up; warmup stays on permanently.

**Workflow 7: Daily or weekly loop.**
Open a table, check new rows and the Actions and Data Credits meters, review Claygent and waterfall outputs in a sample of 20 rows, fix any column that errors, push qualified rows to the Sequencer or CRM, and review replies and bounces. [design: 20 to 40 minutes a day for a steady-state outbound table.]

**Workflow 8: Templates and Claybooks.**
Claybooks are prebuilt tables with columns, signals and sends wired up (for example "monitor job movers across the entire market"). The founder picks a Claybook, connects the data source, and edits the prompts. This is the fastest route to a first working table.

### 4. Automation and AI features

- Automated: enrichments on new rows, scheduled re-runs, signals, waterfalls with fallback, Sequencer send scheduling, CRM and webhook sync (Growth), HTTP API calls.
- AI: Claygent (research and classification), AI formula columns, variable AI models billed at token cost.
- Human review points: the prompt is written by the user; the output column is visible; the Sequencer has a pause step; the blocklist is manual.
- Published accuracy figures: Clay does not publish enrichment match rates in the sources fetched. [unverified: vendor comparisons quote single-digit to high-double-digit match rates; treat all as unverified.]

### 5. Time saved and impact

- [design] A solo founder doing manual research and enrichment on 200 leads a week: about 6 to 10 hours a week by hand. A Clay table with waterfalls and a Claygent qualifier cuts that to about 1 to 2 hours a week of review.
- [design] Monthly cost at the Launch tier: about $167 to $185 plus top-ups. Data Credit spend on a 2,000-contact outbound list usually runs 2,000 to 6,000 Data Credits depending on how many providers the waterfall tries [design, based on the Launch allotment].
- Cost per unit: Data Credits per successful lookup (no charge for misses), Actions per run, Sequencer sends are included in the plan, Signal runs billed per result or per record checked.

### 6. Failure modes

- Credit burn: a waterfall with many providers that run on every row, or a Claygent column with a long prompt over 5,000 rows. Mitigation: a per-request cap, run conditions, a 5-row test.
- Stale or wrong data: enrichments returning an old employer after a job change. Clay's community reports false job-change signals from LinkedIn advisory or board role updates [community post].
- Column and row limits: the column cap changes when phone or email waterfalls are used, and the row limit on Free is 200.
- Sending: bounce rates at or above 5%, inbox warmup not finished, a sender account on the wrong daily cap. Clay's own guidance is the 5% stop threshold.
- Plan gates: phone enrichment, signals and email campaigns are missing on Free; buying mailboxes needs Growth.
- Rollover confusion: the FAQ and feature table disagree on how many Data Credits roll over.

### 7. Integrations

Common flows: CRM (HubSpot, Salesforce) to Clay for enrichment, then back as a sync (Growth). Clay to Sequencer for sending, with Smartlead as the sending infrastructure behind campaigns (per Clay's FAQ). Clay to Slack for signal alerts (Claybook templates). Warehouse sync (Snowflake, BigQuery) on Growth. Enrichment providers are inside the platform and billed through Data Credits. HTTP API and webhooks on Growth for custom flows.

### 8. Sources

- Clay pricing and plan limits: https://www.clay.com/pricing (fetched 2026-10-14)
- Clay waterfall guide: https://university.clay.com/docs/building-a-data-waterfall (fetched 2026-10-14)
- Clay signals: https://university.clay.com/docs/signals (fetched 2026-10-14)
- Clay Sequencer FAQ: https://university.clay.com/docs/sequencer-faqs-and-best-practices (fetched 2026-10-14)
- Clay Sequencer 2.0 changelog: https://www.clay.com/changelog/clay-sequencer-2-0 (search snippet, 2026-10-14)
- Claygent page: https://www.clay.com/claygent (search snippet, 2026-10-14)
- Table columns overview: https://university.clay.com/docs/table-columns-overview (search snippet)
- Third-party pricing comparisons used only for cross-checks [unverified]: landbase.com/blog/clay-pricing (March 31, 2026); gojiberry.ai/blog/clay-pricing.

---

## Part B: Apollo

### 1. Summary

Apollo.io is an all-in-one B2B sales platform: a contact and company database, search filters, enrichment, sequences (email and task steps), a dialer, a deliverability suite, and, since March 4, 2026, an AI Assistant that runs multi-step GTM workflows from a plain-language prompt. Its users are founder-led sales teams, SDR teams and small agencies. The 2026 positioning is "AI-native all-in-one GTM platform" (https://www.apollo.io/newsroom/announcements/apollo-launches-ai-assistant-powering-end-to-end-agentic-workflows-in-the-first-ai-native-all-in-one-gtm-platform, dated 2026-03-04).

Price tiers. The Apollo pricing page is mostly rendered client-side. The fetched text confirms plan names (Free, Basic, Professional, Organization/Custom) and says "all seats on an account must share the same plan". Per-user prices come from third-party 2026 blogs and are [unverified]: Basic about $49, Professional about $79, Organization about $119 per user per month on annual billing (monthly about 20% more). Organization needs at least 3 seats, so about $357 a month minimum on annual billing. Credit allotments per plan were not confirmed from primary sources and differ between blogs [unverified]. Free includes a small amount of credits, email sending on Gmail, and up to 2 sequences [unverified].

### 2. Data model

- **Contact**: person record with name, title, employer, verified email (work or personal), mobile or office phone, LinkedIn URL, custom fields, owner.
- **Account (company)**: domain, size, industry, funding, technologies, location, and linked contacts.
- **List**: a saved set of contacts or accounts; can be imported from CSV or a search.
- **Saved search / filter set**: the persisted criteria (job titles, seniority, headcount, location, technologies, funding, keywords, intent topics).
- **Sequence**: ordered steps. Each step is an email or a manual task (call, LinkedIn touch). Each contact is enrolled once. Has sending settings and an inbox per user.
- **Task and activity**: call, email and task records, linked to a contact.
- **Credits**: a pool of Email, Mobile (phone) and Export credits, granted at the start of each billing cycle, shared across the team. Admins can cap credits per user.
- **Deliverability settings**: sender accounts, inbox ramp-up schedule, warmup status.

### 3. Main workflows

**Workflow 1: Setup and first sequence (onboarding).**
1. Sign up, connect a Gmail or Microsoft mailbox, and import the calendar if wanted.
2. Set up a sender profile and a signature.
3. Run "Inbox Ramp Up" (help article https://knowledge.apollo.io/hc/en-us/articles/26772718460045-Use-Inbox-Ramp-Up): it gradually raises the sending volume. It applies only to automated or scheduled emails sent in Apollo, and Apollo says it can take around 2 weeks to finish.
4. Warmup is delivered through Warmbox.ai, a third party, and warmup emails are system-generated test messages between a private network of inboxes, not your sequence emails (per Apollo's help article). Apollo states it does not control or take responsibility for third-party warmup practices. A competitor review says warmup was discontinued in 2024, which conflicts with Apollo's help center [unverified].

*Aha moment*: a list built from a filtered search, a sequence with an AI-written first line, and the first 50 sends on a warmed inbox. [design]

**Workflow 2: Contact search.**
Open "Find people" (or the AI Assistant). Set filters: job title and seniority, company headcount, industry, location, technology used, funding stage, keywords, and intent topics. Results show a preview. Clicking "Save" adds the record to a list. Reveal emails and phones costs credits; email reveal costs 1 credit (verified only), phone numbers cost more (sources report 8 credits per phone [unverified]). Apollo says it never charges more than 1 email credit per contact, and each verified mobile number costs the same.

**Workflow 3: Enrichment (single or bulk).**
From a list, select contacts, then "Enrich". Apollo fills in company and contact fields and charges credits for new verified emails. Re-running on already-enriched records costs nothing for the same fields [design: Apollo's docs say you are charged only for net-new verified contacts].

**Workflow 4: Building a sequence.**
1. Create a sequence and name it.
2. Add steps: Email (with subject, body, variables) or Task (call, LinkedIn, manual step). Set day delays between steps.
3. Add personalization variables and, if the AI Assistant is used, AI-written first lines.
4. Enroll a list. Each contact enters once.
5. Review the deliverability panel and the sender's daily cap, then activate.
6. A reply stops the sequence for that contact.

**Workflow 5: AI Assistant.**
From the Apollo app, open the assistant and type a goal ("find VP Marketing at Series A SaaS companies in the UK hiring SDRs and draft a 3-step sequence"). The assistant builds and runs a multi-step workflow across prospecting, enrichment, outreach and reporting. Apollo says it uses a "human-in-the-loop approach" and users can throttle AI use and keep control over execution (source: the March 4, 2026 newsroom release). Free plans include up to 5 chats; the assistant was free as an introductory offer on Basic, Professional and Organization [per the release, pricing may change]. Vendor claims: nearly 20,000 weekly users after beta; beta users booked 2.3x more meetings; 36% more likely to book in the first 14 days. These are unverified vendor metrics.

**Workflow 6: Intent and signals.**
Apollo's intent feature surfaces accounts researching topics (vendor-reported). Within a list, the user can filter by intent topic and push matches into a sequence. Details of the intent data source were not confirmed [unverified].

**Workflow 7: Daily or weekly loop.**
Check the Tasks tab (calls and LinkedIn touches due today), reply to replies, review the sequence report (opens and replies, if tracking is on), check the deliverability panel and bounce count, and add a new list or a new filter set for the week. [design: 30 to 45 minutes a day.]

**Workflow 8: Credits check.**
Settings > Credits & AI Usage > About Credits (help text in Apollo). Credits are charged immediately when added and renew each cycle until removed. Unused credits expire at the end of each billing cycle and do not roll over. Annual plans unlock credits at the start of the annual cycle; quarterly or semi-annual billing releases on that schedule. The help center says that if purchased credits do not show within 24 hours, contact support.

### 4. Automation and AI features

- Automated: sequence scheduling and sending, reply detection that stops sequences, bulk enrichment, scheduled list refresh, CRM sync (Professional and above).
- AI: the AI Assistant (natural-language workflows); AI-written sequence copy; AI research (charged credits, per Apollo's "about credits" page, which says future features may consume credits and users are notified first).
- Human review: the user approves sequence copy and the audience before launch (per the release's human-in-the-loop framing). Apollo does not publish a human-approval gate for auto-sends in the fetched pages.
- Accuracy and resolution figures: Apollo states a US email accuracy of about 88% in several reviews and roughly 60% to 73% internationally in third-party tests [unverified; see Part B section 7].

### 5. Time saved and impact

- [design] Manual prospecting (search, copy to CSV, enrich in a second tool, write the sequence) takes about 3 to 5 hours a week for a solo founder. Apollo search, bulk enrichment and sequences cut that to about 1 to 2 hours a week, plus review time.
- Vendor claim: "about an hour per prospecting session" saved by one rep [vendor release, unverified].
- Cost per unit: Email credit (verified only, up to 1 per contact); Mobile credit (per verified number, phone heavier); Export credit (exporting company data). Overages are sold separately and third-party sources cite about $0.20 per credit with a 250-credit minimum [unverified]. Heavy users report $150 to $400 per user per month [unverified].

### 6. Failure modes

- Bad data: a common complaint in reviews and Reddit-derived summaries is high bounce rates on exported lists. Reported bounces of 15% to 25% on Apollo-sourced emails are cited in several vendor reviews (SyncGTM, Cleverly) [unverified, secondary and vendor-sourced]. An independent study by BounceZero found about 73% of 100,000 contacts valid [vendor study, unverified].
- International coverage is weaker: third-party estimates put accuracy outside North America at about 60% [unverified].
- Credits: they expire every cycle, so unused credits are lost. Admins may see credits burn fast on mobile lookups.
- Deliverability: warmup is third party, Inbox Ramp Up can take about 2 weeks, and the warmup status is not a guarantee.
- Support and billing: Trustpilot rating about 2.9/5 in a third-party summary, citing billing disputes, account suspensions and slow support on lower tiers [unverified].
- Plan changes: upgrades and downgrades take effect immediately with no refund for unused time; annual to monthly needs cancellation and waiting for the term to end (per Apollo's pricing FAQ).
- Feature gates: SSO, customizable reports and advanced security sit on the top tier; international dialing needs an add-on.

### 7. Integrations

Common flows: Gmail or Microsoft 365 for sending and reply detection; CRM (Salesforce, HubSpot) for two-way sync (Professional and above); Slack notifications; Zapier and other automation tools; Chrome extension for LinkedIn capture; in 2026, an Apollo app inside ChatGPT (beta, April 29, 2026) and a Perplexity Computer connector (June 3, 2026) that run GTM workflows through Apollo's MCP server (sources in newsroom and search snippets, unverified in detail).

### 8. Sources

- Apollo pricing FAQ and plan names: https://www.apollo.io/pricing (fetched 2026-10-14; figures not rendered)
- Apollo credits: https://www.apollo.io/pricing/about-credits (fetched 2026-10-14)
- Apollo "What are credits" help article: https://knowledge.apollo.io/hc/en-us/articles/9527776320781-What-Are-Credits (search snippet; fetch blocked)
- Apollo Inbox Ramp Up: https://knowledge.apollo.io/hc/en-us/articles/26772718460045-Use-Inbox-Ramp-Up (search snippet; fetch blocked)
- Apollo Outbound Overview: https://knowledge.apollo.io/hc/en-us/articles/41240585626253-Outbound-Overview (search snippet; fetch blocked)
- Apollo AI Assistant launch, March 4, 2026: https://www.apollo.io/newsroom/announcements/apollo-launches-ai-assistant-powering-end-to-end-agentic-workflows-in-the-first-ai-native-all-in-one-gtm-platform (fetched 2026-10-14)
- Apollo ChatGPT app and Perplexity connector: news snippets (April 29 and June 3, 2026) [unverified]
- Third-party pricing and accuracy comparisons, used only for cross-checks [unverified]: zeliq.com/blog/apolloio-pricing; landbase.com/blog/apollo-pricing (March 31, 2026); mailreach.co/blog/apollo-io-review; salesgear.io/blog/apollo-io-review; bouncezero.io/apollo-email-accuracy-study-2026; cleverly.co/blog/apollo-io-review (April 6, 2026); supergood.ai/api-report-card/apollo.
