# D12: AI assistants and agents for founder operations (2026 deep dives)

Research date: 2026-10-14. Tags: [unverified] = only secondary or aggregator sources found; [design] = my estimate. Where sources conflict, both figures are given. Primary pages that returned 403/404 or only a title are noted; their content is taken from secondary sources.

Scope: Claude (Projects, connectors/MCP, Cowork, Claude Code for ops, scheduled tasks), ChatGPT (agent mode / ChatGPT Work, connectors, scheduled tasks), Lindy, Superhuman (Mail, AI, Go), Reclaim.ai, Motion.

---

## 1. Claude (Projects, connectors, Cowork, Claude Code, scheduled tasks)

**Summary.** Anthropic's assistant product for knowledge work. Four pieces matter for founder ops. (a) *Projects* are persistent workspaces that hold instructions and reference files, so every chat in a project starts with the same context. (b) *Connectors* are MCP-based integrations (Slack, Google Drive, Gmail, Calendar, CRM and similar) that let Claude read and, depending on the connector, write to your accounts. (c) *Cowork* is the agentic mode in the Claude desktop app that works on a local folder and on connected tools to finish multi-step tasks (rename and sort files, turn receipt screenshots into a sheet, draft a report or deck). (d) *Scheduled tasks* run a saved prompt on a cadence. Positioning in 2026: the "general assistant that does work," aimed at non-engineers, with Claude Code as the terminal sibling for scripting and data work. Price tiers: Pro, Max, Team and Enterprise. Scheduled tasks are available on all paid plans. Exact current prices were not verified in this pass; check claude.com/pricing [unverified]. Use cases for founders: weekly metrics summaries, investor-update drafts, research digests, competitor page monitoring, CSV and receipt cleanup, meeting prep from calendar plus CRM.

**Data model.**
- *Project*: name, custom instructions, knowledge files, chats, sharing. On Team/Enterprise, connectors are only available in private projects, and chats that include synced connector content cannot be shared (source: support.claude.com connectors article, accessed 2026-10-14).
- *Chat*: messages, attachments, the project it belongs to, and any tool calls with their results.
- *Connector*: provider, OAuth grant, scopes, on/off per chat or per task. Connectors use MCP.
- *Cowork task*: prompt, optional working folder on your computer, connectors, model, approval mode, and a session transcript.
- *Scheduled task*: name, prompt, approval mode, frequency (hourly, daily, weekly, weekdays or manual), model, optional working folder. Each *run* is its own Cowork session that you can review when it finishes.
- *Folder* (local): a path on your machine that Cowork can read and modify. Scheduled tasks cannot be tied to a local folder unless the task needs local files, in which case it runs only locally.

**Main workflows.**

1. **Create a Project for a recurring job.** Projects in the sidebar, New project, name it (e.g. "Weekly ops"). Paste standing instructions (who the reader is, the metrics you always want, the format, what to flag). Upload reference files (last four weekly reports, the metric definitions). Start chats inside the project so the context carries. [UI labels unverified; check the Projects help article, which did not load in this pass.]

2. **Connect a tool.** Settings, then Connectors, pick the service (e.g. Google Drive, Slack, Gmail, Calendar, a CRM), complete the OAuth consent screen, choose scopes. Enable the connector in the chat or task you want to use. Expect the first use to show a permission prompt for each tool call that writes.

3. **Create a scheduled task (new experience).** Describe the task and how often it should run in any conversation. Claude asks clarifying questions, shows a proposed name, schedule and instructions, and you confirm with the Schedule button.

4. **Create a scheduled task (Cowork).** Click Scheduled in the left sidebar, then New task. Option A, Create with Claude: answer its questions and confirm. Option B, Set up manually: enter name, prompt, approval mode, frequency, optional model and working folder, then Save.

5. **The weekly-report loop.** Scheduled for Monday 08:00 on weekdays: "Pull last week's signups, MRR, churn and top support themes from Stripe, Intercom and the CRM. Compare to the prior week. Write a 300-word summary and list any number that moved more than 15%." Each run appears in the Scheduled list. The founder opens the run, checks two numbers against the dashboard, and forwards or edits. The aha moment is seeing the run complete before standup with the numbers already checked against source.

6. **One-off Cowork cleanup.** Choose a folder (e.g. a downloads folder of receipts), describe the goal ("extract date, vendor, amount, category from each PDF and image into one CSV; list any I should check"). Cowork works through files and returns a sheet plus a list of uncertain rows. Review the list, not the whole sheet.

7. **Claude Code for ops (terminal).** For founders comfortable with a shell: point Claude Code at a folder of CSV exports, ask it to write and run a script that joins them, dedupes customers and flags anomalies. Output is a script the founder can rerun. [design: this is the realistic path for data cleanup at scale.]

8. **Phone-initiated tasks.** A third-party guide mentions "Dispatch" tasks started from a phone [unverified; not confirmed on the official site].

**Automation and AI features.** The model reads connector data, reasons over it and writes outputs. Automation is the scheduler plus approval modes: a task can run with approvals required (every write asks you) or with more autonomy. Human review points are the run review screen and any write-capable connector call. No published accuracy or resolution rates for Cowork or scheduled tasks. Anthropic does not publish a per-task credit cost for scheduled runs that I could find; usage draws against the plan's limits [unverified].

**Time saved and impact.** [design] A weekly metrics summary that takes 60 to 90 minutes by hand becomes 10 minutes of checking a run: about 1 to 1.5 hours saved per week. Receipt and expense cleanup on a quarter's worth of files: about 3 to 5 hours saved, plus the check. Competitor monitoring that replaces a Friday skim of 5 pages: about 30 minutes per week. Total for a solo founder who uses all three: 2 to 4 hours per week, and the saving depends on whether the checks are done properly.

**Failure modes.**
- *Prompt injection.* Content from emails, web pages or documents can carry instructions that the model may follow. Per a secondary write-up citing TechCrunch (January 2026), Anthropic itself warns about prompt injection and accidental file deletion or overwriting [unverified; check Anthropic's Cowork safety page].
- *Destructive file actions.* Cowork can rename, move, overwrite or delete in a folder you grant. Keep a copy of the folder before a bulk operation.
- *Stale connector auth.* A scheduled run fails silently if an OAuth grant has expired or lost scope. Check the run list weekly.
- *Local-only tasks.* A task that needs local files runs only on your machine, so it does not run when the computer is off [support article].
- *Plausible wrong numbers.* If a connector returns partial pages (pagination limits), the summary is confident and incomplete. Always reconcile one number against the source.
- *Hallucinated sources or names* in research summaries. Demand links per claim.
- *Shared-chat leakage.* Connector content in a shared Team project cannot be shared, but a copied summary can be. Treat connector-derived text as internal.

**Integrations.** Slack, Google Drive and Gmail, Google Calendar, Notion, Salesforce and HubSpot, Stripe and analytics tools via connectors or custom remote MCP servers [unverified exact list]. Typical flow: connector reads metrics or messages, Claude computes and summarizes, output goes to a doc, a chat thread or a draft email. Writes to outside tools usually need approval.

**Sources.**
- Support article, "Schedule recurring tasks in Claude Cowork": https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork (fetched 2026-10-14; the article's own date notes say pre-October-6 local tasks keep running locally; no year given)
- Support article on connectors in Claude: https://support.claude.com/en/articles/11724452-using-the-claude-desktop-app-with-connectors (fetched 2026-10-14; project rules for Team/Enterprise)
- Claude Cowork guide, clickforest (secondary, cites TechCrunch Jan 2026): https://www.clickforest.com/en/blog/claude-cowork-explained (accessed 2026-10-14) [unverified]
- Sandlabs Cowork business guide: https://sandlabs.com.au/blog/claude-cowork-business-guide (accessed 2026-10-14) [unverified]
- Projects help article: not retrieved (404 in this pass) [unverified]

---

## 2. ChatGPT (agent mode / ChatGPT Work, connectors, scheduled tasks)

**Summary.** OpenAI's assistant with three relevant pieces. *Agent mode* (a cloud browser and tool environment that takes multi-step actions) was the 2025 feature. The OpenAI help page as cached in search now states that ChatGPT agent "is no longer available" and points users to *ChatGPT Work* for multi-step tasks and finished deliverables [search snippet of help.openai.com/en/articles/11752874; direct fetch returned 403]. ChatGPT Work is sold as part of the plan, not separately, and its usage is metered against the plan's allowance. Secondary sources say it launched in early July 2026 (earliest post Jul 10, 2026) and has more than 1,400 connectable apps. Founder use: research briefs, competitor scans, spreadsheet cleanup, drafting and sending follow-up emails through Gmail or Outlook, recurring briefs via scheduled tasks. Tiers: Plus, Pro, Business, Enterprise. Prices conflict across sources. One review gives Plus $20 and Pro from $100; an older guide gives Pro $200 with 400 agent tasks [unverified]. Check openai.com/chatgpt/pricing. Business and Enterprise on flexible pricing are token-credit based and were scheduled to move to credits around July 6, 2026 per an OpenAI help note [unverified].

**Data model.**
- *Chat / conversation*: messages, files, the task run it spawned.
- *Task run*: prompt, plan usage charged, connectors used, steps, output files, status.
- *Connector*: app account, read and act permissions (reading and acting need different permissions, per a secondary source). Several have one-account limits: one Gmail and one Outlook account per Teams post (Aug 18), one Google identity for Drive, one Slack workspace at a time (Aug 14 secondary posts; accounts conflict, so verify).
- *Scheduled task*: prompt, schedule, connectors, output destination. Each scheduled run counts as a new invocation against the limit.
- *Workspace Agent* (Business/Enterprise): shared agent with first-party connectors such as Slack, Salesforce and Google Drive [secondary].

**Main workflows.**

1. **Start a multi-step task.** In the composer, describe the deliverable ("A one-page brief on the three competitors that launched in September, with pricing, positioning and links"). Choose the task option if your app shows one. The agent proposes steps or asks clarifying questions, then runs and returns a file or a summary. Exact UI labels [unverified].

2. **Connect apps.** Settings, then Connectors (or Apps), authorize each app, and check which permissions it has. Confirm the account is the one you want, because the account limits above make wrong-account connections easy.

3. **Set up a scheduled task.** Open Scheduled tasks, write the prompt and choose a time. Example: "Every Monday 07:00, read the inbox label 'Customers', list new questions, draft answers in Gmail drafts, do not send." Keep sends out of scheduled tasks at first.

4. **Email follow-up with confirmation.** Ask the assistant to draft a follow-up to a named contact, using a thread from Gmail. Read the draft in the app, edit, then approve the send. A secondary source says ChatGPT Work can now send email from Gmail and Outlook, constrained by the permission model and shared-mailbox rules (Aug 7) [unverified].

5. **Competitor scan.** Scheduled weekly: check three pricing pages and a changelog, compare with last week's saved snapshot, return the diff. The founder reads the diff and the source links.

6. **Spreadsheet cleanup.** Upload a CSV, ask for dedupe, standard formatting and a list of rows that look wrong. Download the cleaned file. Check a sample of 20 rows against the original.

7. **Admin on Business/Enterprise.** Admins set connector allow-lists and workspace usage, and the credit balance is shown for the team. [unverified detail]

**Automation and AI features.** Browsing and tool use, file generation, scheduled runs and connector reads and writes. Human review points: clarification questions, approval before sending or acting on a sensitive app, and reading the output. No published task success rate for ChatGPT Work. Agent mode used to publish monthly caps: Plus 40 agent messages per month, Pro 400, Business and Enterprise 40 or flexible credits (cached help page, date not shown). Only the initial request counts toward the cap, while clarification and authentication steps do not, and scheduled runs do count.

**Time saved and impact.** [design] Competitor scan from 45 minutes to 10 minutes of review: about 35 minutes per week. Research brief for a sales call: 30 to 60 minutes saved per brief. Spreadsheet cleanup on a 2,000-row export: 2 to 3 hours saved. Email follow-up drafting for 20 leads a week: about 1 hour per week. Solo-founder total: 2 to 4 hours per week, lower if usage limits block the scheduled runs.

**Failure modes.**
- *Opaque metering.* One source says there is "no published rate card" for ChatGPT Work tasks (Jul 10, 2026, secondary). A founder can run out of allowance mid-week.
- *Wrong account connected.* Multi-account limits mean a task can read the wrong inbox or calendar.
- *Plausible wrong facts.* Competitor summaries can mix up pricing tiers or dates. Verify the price and date on the source page.
- *Sending wrong emails.* If the approval step is relaxed, a draft can go to the wrong contact. Keep a human send step.
- *Prompt injection.* Web pages and documents read during research can carry instructions. Do not give write access to a task that reads untrusted pages.
- *Silent truncation.* Large CSVs may be partially processed. Check row counts.
- *Pricing churn.* Plans and limits changed several times in 2026 (agent mode retired in favor of Work). Budget with a buffer.

**Integrations.** Gmail, Google Calendar, Google Drive, Outlook and Microsoft 365, Slack, Salesforce, Notion, and roughly 1,400 other apps (secondary count) [unverified]. Common flow: read a source (inbox, CRM, drive), generate a file or draft, return it to the founder or write a draft to an app.

**Sources.**
- OpenAI help, ChatGPT agent (cached search snippet, limits and retirement note; direct fetch 403): https://help.openai.com/en/articles/11752874-chatgpt-agent (accessed 2026-10-14)
- OpenAI help, ChatGPT Work (direct fetch 403): https://help.openai.com/en/articles/11752874-chatgpt-work (accessed 2026-10-14)
- OpenAI help, ChatGPT Business/Enterprise/Edu models and limits (search result): https://help.openai.com/en/articles/11752874-chatgpt-business-enterprise-edu-and-teams-models-limits (accessed 2026-10-14)
- UseCarly ChatGPT Work posts (Jul 10, Jul 28, Aug 7, Aug 14, Aug 18, Sep 2, 2026; publisher sells a competing product): https://www.usecarly.com/blog/tags/chatgpt-work/ (accessed 2026-10-14) [unverified]
- Pricing comparison, aggregator: https://www.usecarly.com/blog/tags/ai-email/ (search result, accessed 2026-10-14) [unverified]
- ChatGPT agent review, unite.ai (2025): https://www.unite.ai/how-to-use-openais-chatgpt-agent-a-step-by-step-guide (search result) [unverified]

---

## 3. Lindy (AI employees)

**Summary.** A no-code platform for building "AI employees": agents that run on triggers (new email, schedule, Slack message, form) and take steps across connected apps. Positioning in 2026 is "AI employees for teams," with templates such as an email triager, a meeting scheduler and a support-queue triager. Pricing (official pricing page, fetched 2026-10-14): Free at $0, with $50 in one-time credits that last 7 days and need no card. Team is $49.99 per month for 5,000 credits per seat, billed per active user, with credits pooled across the workspace. Higher monthly credit tiers run from 6,000 credits ($59.99) to 1,750,000 credits ($9,999.50). Enterprise is custom, with HIPAA, SSO/SCIM and audit logs. Top-ups cost $10 per 1,000 credits; monthly credits do not roll over, but top-ups do not expire until used. Secondary aggregators list older tier names (Plus $29.99 with 3,000 credits, Pro $99.99 with 15,000, Max $199.99 with 35,000) and an older $49.99 Plus figure; the official page is the one to trust [conflict noted]. Lindy's credit guide: everyday asks 2 to 250 credits, deep work 250 to 1,000, big builds 1,000 to 2,500.

**Data model.**
- *Agent* (called an AI employee): name, instructions (system prompt), tools and integrations, knowledge, model, status.
- *Trigger*: email received, schedule, Slack message, form submit, webhook.
- *Step / action*: a tool call or AI step with inputs and outputs; can be conditional.
- *Run / log*: trigger payload, every step, outputs, credits consumed.
- *Credit ledger*: per-seat allowance, pooled balance, top-ups, usage per agent.
- *Template*: marketplace starting point (e.g. Email Triager).
- *Seat*: a paid active user, the billing unit.

**Main workflows.**

1. **Set up email triage from a template.** In the template gallery, open the Email Triager. Connect Gmail or Outlook. Describe the categories (e.g. "Action needed", "Customer", "Investor", "Vendor", "Newsletter", "Receipts", "Other"). Filters are optional, since the agent classifies every incoming email. Sources say it applies seven in-inbox labels and auto-archives calendar invites and promotions (ZoomInfo vendor description). [Vendor claim]

2. **Audit before enabling.** An AI Indigo tutorial recommends running the agent in preview on your last 10 emails, checking each decision, then fixing instructions. This is the only verification step found in sources. Do this before any auto-archive rule is switched on.

3. **Turn it live.** Enable the trigger so new mail is processed. Watch the run log for the first two days. Check the "Action needed" label daily.

4. **Weekly support-queue triage.** Trigger on a schedule, pull open tickets from the help desk or inbox, tag priority, draft replies, post a digest to Slack. Pricing page example for deep work: "triaging a day's support queue."

5. **Competitor research report.** A deep-work run: describe the competitors, list sources, ask for a report. Pricing page lists "researching a competitor and writing a report" as a 250 to 1,000 credit task.

6. **Slack team onboarding.** A teammate who joins through Slack gets a 7-day trial before seat billing. Direct signups are billed immediately. Useful for a co-founder or first hire to try the agent before paying.

7. **Cancel and retain.** Cancellation keeps the workspace active through the paid cycle with no mid-cycle proration (pricing page). Export agent definitions before cancelling.

**Automation and AI features.** Trigger-based automation with AI judgment steps: an LLM classifies, extracts, drafts or decides which branch to take. Review points are the preview run, the run log, and any step configured to ask before acting. Accuracy: no published classification accuracy for the email triager. A StackSheriff review (3.5 out of 5) calls Lindy a "judgment-first agent rather than a deterministic one" and recommends against it for predictable high-volume pipelines [unverified; review, not a test]. No independent hallucination study found in this pass.

**Time saved and impact.** [design] Email triage for 80 to 150 messages a day: 30 to 45 minutes saved per day if the labels are trusted, which at most is 2 to 4 hours per week, but only once the first audit is done. Support-queue digest: 1 hour per week. Competitor report: 2 to 3 hours of research per report. Cost per unit: a triage run is cheap in credits [design]; a weekly deep-work report is 250 to 1,000 credits per seat, i.e. roughly $2.50 to $10 at the top-up rate. Pooled seats mean one heavy user can burn the team's allowance.

**Failure modes.**
- *Misclassification.* An important customer or investor email filed as "Newsletter" or auto-archived as "promotion" is the top risk. Check the archived label weekly.
- *Credit burn.* Big builds use 1,000 to 2,500 credits each. A loop that retries can drain the pool.
- *Duplicate runs.* A trigger that fires on both thread updates and new messages can reply twice. Check the run log.
- *Non-determinism.* The same email can get different labels on re-run. Use stable category definitions and examples.
- *Connector scope changes.* Gmail or Outlook re-consent can silently stop triggers.
- *Pricing and tier churn.* Multiple tier structures in aggregators; the official page should be checked on purchase.
- *Privacy.* Email bodies are sent to the model provider and Lindy's servers. Check its data-processing terms before connecting a customer inbox [unverified].

**Integrations.** Gmail, Outlook, Slack, Google Calendar, Google Sheets, HubSpot and Salesforce, Notion, webhooks and HTTP steps [unverified exact list]. Typical flow: trigger (email or schedule), AI classify or extract, write a label or a row, post a Slack digest.

**Sources.**
- Lindy pricing page (fetched 2026-10-14): https://www.lindy.ai/pricing
- Lindy pricing, aggregator summaries (conflicting tier names): https://www.jetadmin.io/blog/lindy-pricing/ ; https://www.layer3labs.io/guides/lindy-ai-pricing ; https://usagepricing.com/blueprint/lindy [unverified]
- Dupple, "Create an email triager": https://dupple.com/tutorial/create-an-email-triager (search result) [unverified]
- ZoomInfo, "Lindy AI features" (vendor-sourced): https://pipeline.zoominfo.com/sales/lindy-ai-features [unverified]
- AI Indigo, "Getting started with Lindy: inbox triage and meeting scheduling": https://aiindigo.com/tutorials/getting-started-with-lindy-automate-inbox-triage-and-meeting-scheduling [unverified]
- StackSheriff review: https://stacksheriff.com/tools/lindy-ai-review/ [unverified]

---

## 4. Superhuman (Mail, AI, Go)

**Summary.** Superhuman started as a fast keyboard-driven email client. It is now a suite: Superhuman Mail (the client), Superhuman AI (inbox assistant), and Superhuman Go (an assistant that runs inside your other tools). The product page for AI describes it as "your AI-powered inbox assistant" that organizes your inbox, tracks follow-ups, drafts emails and can send them "if you want." Split Inbox triages incoming mail into views by sender or tool (for example, VIPs, your team, Google Docs, Notion, Asana). Follow-up reminders fire if there is no reply by a time you pick (say 2 days); the page does not explain how replies are detected. Send Later schedules sends. Instant Reply is named but not described. Positioning for founders: the fastest way to get to inbox zero on a Gmail or Outlook account, with AI as an add-on. Pricing (secondary sources, conflicting): Starter about $30 per month or $25 per month billed annually; Business about $40 per month or $33 per month annual. Mail appears only from the Business tier in suite pricing, bundled with Grammarly, Docs and Go. Enterprise is custom. No free plan for Mail [unverified]. The official pricing page returned only its title in this pass.

**Data model.**
- *Account*: Gmail or Outlook mailbox, identity, signatures.
- *Thread / message*: standard email objects with labels, read state, snooze, send-later time.
- *Split* (view): rule set using sender, domain, team, VIP list or tool link (Google Docs, Notion, Asana).
- *Reminder*: thread, chosen follow-up time, status (pending, fired, replied).
- *Scheduled send*: message, send time.
- *Auto label* (Business: custom auto labels; Starter: preset categories only, per a secondary source).
- *AI draft / reply*: generated text, linked to the thread, requires a send action.
- *Go session* (beta): browser-extension context, the request, the agent's suggestions and actions. [design]

**Main workflows.**

1. **Connect the mailbox.** Install Superhuman, sign in with Gmail or Outlook, grant access. Onboarding asks for your VIPs and team domains. [UI detail unverified]

2. **Set up Split Inbox.** Create splits by sender list (investors, customers, team), by tool (Docs, Asana) or by domain. Put the investor and customer splits at the top. The aha moment is seeing the "Investors" split with a count, and no other mail there.

3. **Triage with keyboard.** Process the Important split first, then Other. Use reply, archive, snooze and Send Later. Keyboard shortcuts are a core part of the product [unverified exact keys].

4. **Set a follow-up reminder.** After sending, pick a reminder time. If there is no reply at that time, a reminder shows in the inbox. Check how it detects replies on a test thread before relying on it.

5. **Send Later.** Write now, pick a morning send time for a recipient in another time zone. Use for investor updates and cold outreach.

6. **AI draft and summarize.** Ask Superhuman AI to draft a reply from thread context, edit, and send. Summarize long threads before a call.

7. **Go in the browser.** Install the Superhuman Go extension for Chrome or Edge (beta; access is by approval request). Hover the right edge of the browser to open the Go panel. Ask it to pull context from a doc or thread while you work. A mobile Go help article describes assigning a task and connecting apps from iPhone [unverified].

**Automation and AI features.** Triage via Split Inbox rules (deterministic rules, not AI, based on the descriptions), AI summaries and drafts, follow-up reminders, Send Later, and Go's suggestions and actions. Go is described as orchestrating a team of agents that give suggestions "when and where they're useful," so it can propose next steps without you asking. Human review points are send and any action Go proposes. No published triage accuracy or reply-detection rate.

**Time saved and impact.** [design] A founder who receives 100 to 200 emails a day and spends 60 to 90 minutes in email could save 20 to 40 percent of that with Split Inbox plus drafts: about 3 to 5 hours per week. Follow-up reminders reduce forgotten follow-ups; value depends on sales volume. Go saves context-switching time in a browser session; no hard figure.

**Failure modes.**
- *Wrong splits.* A VIP sender with a new address drops into Other. Review Other weekly.
- *Reminder false positives.* If a reply lands in a different thread or from a different address, the reminder fires anyway [design; verify on a test].
- *Draft tone.* AI drafts sound generic and can miss context from earlier thread messages. Read before sending.
- *Hallucinated details.* A draft can include a date, price or commitment that you never agreed. Check every number.
- *Go beta and availability.* Desktop app "coming soon"; access by approval [search result]. Do not plan a launch around it.
- *Privacy.* Email content goes to model providers. Check the data-processing terms, and do not run AI on customer inboxes without the right internal policy [unverified].
- *Account limits.* Some features depend on plan tier (Starter vs Business).
- *Price confusion.* Annual and monthly prices are listed on separate lines in aggregators [unverified].

**Integrations.** Gmail, Google Workspace (Docs), Outlook and Microsoft 365, Grammarly (suite), HubSpot and Salesforce on Business tier (secondary), Notion and Asana (split by tool), Slack [unverified]. Typical flow: mail arrives, Split routes it, AI drafts a reply, the founder edits and sends, CRM records the thread [unverified].

**Sources.**
- Superhuman Mail pricing page: https://superhuman.com/pricing (fetched 2026-10-14; returned only the title, so prices are from secondary sources)
- Superhuman AI features page: https://superhuman.com/products/mail (fetched 2026-10-14; the product copy quoted above)
- Superhuman Go product page: https://superhuman.com/apps/superhuman-go (search result) and https://superhuman.com/products/go-ai-assistant (search result)
- Superhuman Go iOS help article: https://help.superhuman.com/hc/en-us/articles/48093779871117-Get-started-with-Superhuman-Go-for-iOS (search result, accessed 2026-10-14)
- Capterra Superhuman pricing: https://www.capterra.com/p/199278/Superhuman/ (accessed 2026-10-14) [unverified]
- UseCarly Superhuman pricing: https://www.usecarly.com/blog/superhuman-pricing/ [unverified]
- Superhuman suite press (Grammarly rebrand): https://www.reworked.co/collaboration-productivity/grammarly-rebrands-as-superhuman-introduces-unified-ai-suite/ [unverified]

---

## 5. Reclaim.ai (AI calendar)

**Summary.** An AI calendar layer that sits on top of Google Calendar or Outlook. It automatically defends time for focus work, habits (recurring blocks such as exercise or deep-work hours), buffers and "Smart Meetings" that move within a window to fit attendees. It syncs tasks from Todoist, Asana, ClickUp, Jira and Linear, and offers scheduling links for external booking. Owned by Dropbox since August 2024 (secondary). Positioning in 2026: "the calendar that protects your focus time for makers and managers." Pricing (official pricing page, fetched 2026-10-14; period toggle shows yearly and monthly per-seat rates): Lite is free for 1 user. Starter is $10 per seat per month billed yearly ($12 monthly), up to 10 seats. Business is $15 yearly ($18 monthly), up to 100 seats, labeled "Most Popular." Enterprise is $22 yearly, over 100 seats, with SSO and SCIM. Secondary aggregators list different numbers (Starter $8, Business $12, Enterprise $18 per user per month) [conflict noted; trust the official page]. The official page advertised a discount and an "AUs free through July 31" launch promo; both are time-limited and likely expired by 2026-10-14 [unverified].

**Data model.**
- *Calendar* (synced): Google or Outlook, one or more, with two-way sync.
- *Agent* (called features): Focus Time, Habits, Buffer Time, Smart Meetings, Meeting Quality. Limits per seat: Lite 5 total, Starter 10 per seat, Business 100 per seat, Enterprise unlimited.
- *Habit*: title, target duration, weekly frequency, time window, flexibility.
- *Focus block*: weekly target hours, days, protected flag.
- *Smart Meeting*: attendees, duration, window (e.g. "this week, 2 to 4 pm"), flexibility, status.
- *Task*: synced from task tool, with duration and due date; scheduled into the calendar.
- *Scheduling link*: owner, rules, duration, buffer, scheduling range (Lite 1 week, Starter 8 weeks, Business and Enterprise 12 weeks).
- *Attendee User (AU)*: an attendee of a 3-plus-person Smart Meeting who has no paid seat; add-on packs sold per plan.

**Main workflows.**

1. **Connect calendars.** Sign in, choose Google or Outlook, grant access, select calendars to sync (Lite allows 2 connected calendars). Set working hours and time zone.

2. **Set focus time.** Open Focus Time, set a weekly target (e.g. 12 hours), days, and whether it is protected. Reclaim places focus blocks around meetings and moves them when new meetings arrive.

3. **Add habits.** Create a habit with a duration, frequency and window ("deep work, 90 min, 3 times a week, mornings"). Reclaim finds slots and reschedules when needed.

4. **Smart Meetings.** Create a meeting with a window and attendees. The meeting can move within the window as calendars change. Use for 1:1s that should happen this week but not at a fixed time.

5. **Sync tasks.** Connect Todoist, Asana, ClickUp, Jira or Linear (paid tiers; Lite is limited). Tasks are scheduled into free time with their durations. Check the due date rules once.

6. **Scheduling link.** Create a link with meeting type, duration and buffer. Share in email signatures. Lite allows 1 link, Starter 3, Business and Enterprise unlimited.

7. **Weekly review.** Look at the calendar for the week; check focus hours achieved against target; delete habits that never land.

**Automation and AI features.** Constraint-based scheduling: the agent solves for free slots given rules and priorities, and reschedules when calendars change. Smart Meetings use attendee availability from synced calendars. Human review points are the calendar itself (you can lock events and set protected blocks) and the scheduling-range settings. No published success rate for slot-finding; the value is in reschedules.

**Time saved and impact.** [design] Scheduling back-and-forth: 2 to 4 emails per meeting, about 3 minutes each; a founder booking 5 external meetings a week saves about 30 minutes. Focus time automatically defended: hard to quantify; a target of 12 hours of focus per week vs a typical founder calendar with 2 to 3 focus hours. Total: 1 to 3 hours per week for a meeting-heavy founder, with the caveat that reclaimed time is only useful if meetings are cut.

**Failure modes.**
- *Smart Meetings move unexpectedly.* An attendee sees a time change and is confused. Tell external attendees the link is scheduled, not fixed.
- *Sync lag.* Reclaim may overbook a slot for a few minutes after a manual change.
- *Overblocking.* A large focus target can block out all afternoons, which makes scheduling with customers fail.
- *Task sync overload.* A task list with 300 items floods the calendar with blocks; keep the synced list to active work.
- *AU cost surprises.* Attendees of 3-plus-person Smart Meetings without a seat count against AU allowance; check packs before a team roll-out.
- *Promo expiry.* The free-AU promo appears to have ended (July 31) [unverified].
- *Tier limits.* Task integrations are restricted on Lite; scheduling range is 1 week on Lite.

**Integrations.** Google Calendar, Outlook, Todoist, Asana, ClickUp, Jira, Linear, Slack, Zoom and Google Meet (Lite has a limited set). Typical flow: calendar events read in, tasks read in, Reclaim writes focus and habit blocks back out, and scheduling links book into the same calendar.

**Sources.**
- Reclaim.ai pricing page (fetched 2026-10-14; features and seat limits from the page): https://reclaim.ai/pricing
- Subger aggregator (conflicting prices; the feature list there is generic and unreliable): https://subger.com/en/service/reclaim-ai [unverified]
- Pricing tracker (free tier and 1-week range; last discovered April 2026): https://saas.apppricinglab.com/product/reclaim-ai/ [unverified]

---

## 6. Motion (AI calendar and task manager)

**Summary.** An AI planner that combines a task list with a calendar. You enter tasks with durations and deadlines; Motion finds slots and schedules them, reschedules when meetings move, and offers AI chat, a task planner that turns a brain dump into tasks, AI calendar and meeting features, and AI docs and notes. Team-level Business AI adds capacity planning, Gantt and timeline views, time tracking and permissions. Positioning in 2026: "AI project and calendar manager for individuals and teams." Pricing (official usemotion.com/pricing, fetched 2026-10-14): Pro AI is $19 per seat per month and Business AI is $29 per seat per month, with annual pay saving 33%. The page shows "This plan is not available" next to both prices, so the displayed numbers may be stale. Monthly AI credits are 7,500 on Pro (listed at $0.25 per 100 credits) and 15,000 on Business (listed at $0.19 per 100 credits). Trial: "Start your free trial. Risk free. Cancel anytime"; length and card requirement not stated. Secondary sources conflict: a competitor (Morgen) gives Individual $49 monthly or $29 annual and Teams $29 or $19 per seat; Dupple says pricing is by quote [unverified]. Morgen is a rival, so its framing is biased.

**Data model.**
- *Task*: name, duration, deadline, priority, project, status, auto-schedule flag, recurrence, assignee (team).
- *Project*: name, tasks, optional timeline (Business).
- *Calendar event*: synced from Google or Outlook; blocks slots.
- *Schedule*: auto-generated placement of tasks into free blocks; changes with calendar updates.
- *Meeting*: event with notes and AI summary (AI Calendar and Meetings).
- *Credit meter*: monthly allowance per seat; overage per 100 credits.
- *Workspace/team* (Business): members, capacity (hours per week), permissions, central billing.

**Main workflows.**

1. **Connect calendar.** Sign in, connect Google or Outlook, choose calendars. Set working hours and time zone.

2. **Add a task.** Type a task, set duration and deadline, pick a project, and set priority. Motion places it in the next free block before the deadline. The aha moment: a task with a 2-hour estimate appears in your calendar as a block, and moves on its own when a meeting is added.

3. **Brain dump to plan.** Use AI Task Planner: paste a list of notes ("Investor update, hire recruiter, fix onboarding bug, prep board deck") and it proposes tasks with durations. Review and accept.

4. **Daily plan.** Each morning, open the day view. Motion shows the scheduled blocks. Mark done, or drag to move. Overflow tasks shift to tomorrow.

5. **Meetings and notes.** Use AI Calendar and Meetings to attach notes and get a summary after a call (feature names from the pricing page; exact flow unverified).

6. **Team capacity (Business).** Set each person's weekly hours; see planned vs available capacity; move tasks between people. Gantt and timeline views for projects.

7. **Weekly review.** Look at overdue and rescheduled tasks; delete or push deadlines. Frequent rescheduling is a signal to change estimates.

**Automation and AI features.** Auto-scheduling (constraint-based slotting), AI task planning from notes, AI chat over tasks and docs, AI calendar and meeting features, and team capacity. Human review points: the proposed plan (accept or edit), manual drags, and the daily plan. No published scheduling accuracy or task completion rates. Credits fund AI features; heavy AI use draws down the allowance.

**Time saved and impact.** [design] Manual weekly planning of 30 to 45 minutes replaced by a 10-minute review: 20 to 35 minutes per week. Auto-scheduling removes some manual calendar blocking, about 15 minutes per day for a founder who blocks time by hand: up to 1 to 1.5 hours per week. Net for a solo founder: 1 to 2 hours per week, and it can turn negative when the plan thrashes (see failure modes). Reviewer sentiment (mixed, from a rival's review) praises the core scheduling engine but cites price rises, feature bloat and uneven support [unverified].

**Failure modes.**
- *Reschedule thrash.* A task can move every day when meetings are added. Founders then stop trusting the plan. Set realistic durations and cap daily planned hours.
- *Overconfident deadlines.* Motion will schedule to the deadline, even when a deadline was a guess.
- *Credit overage.* Heavy AI use can add overage charges. The pricing sources disagree on how fast credits deplete [unverified].
- *Price and tier confusion.* Multiple sources give different per-seat prices and free-trial terms. Confirm on the purchase page.
- *Calendar noise.* Synced calendar blocks from other tools can be scheduled over; set focus rules.
- *Team permissions.* On Business, capacity numbers are only as good as the hours entered.
- *Support variability.* Reviewers report uneven support [unverified].

**Integrations.** Google Calendar, Outlook, Slack, Zoom and Google Meet, Notion and Gmail (for task capture) [unverified exact list]. Typical flow: calendar events read in, tasks entered by the founder or captured from notes, Motion writes scheduled blocks back to the calendar.

**Sources.**
- Motion pricing page (fetched 2026-10-14; per-seat prices and credit listings): https://www.usemotion.com/pricing
- Morgen, "Motion pricing plans in 2026" (rival, biased): https://morgen.so/blog-posts/motion-pricing [unverified]
- Morgen, "Motion review (2026)" (rival): https://www.morgen.so/blog-posts/motion-review [unverified]
- Dupple Motion pricing (last updated 2026-05-28; says pricing by quote): https://dupple.com/pricing/motion [unverified]
- Lindy blog "Motion app pricing" (competitor): https://www.lindy.ai/blog/motion-app-pricing [unverified]

---

## Cross-cutting: founder use cases, hours saved, failure modes

These are the tools' realistic places in a founder week. Hours are [design], for a solo founder, based on the workflows above.

| Use case | Best-fit tool(s) | Hours saved per week (design) | Main risk |
|---|---|---|---|
| Inbox triage | Superhuman (Split Inbox), Lindy (email triager), Claude or ChatGPT Work via connector | 2 to 4 | Misfiled investor or customer mail; auto-archive |
| Drafting replies | Superhuman AI, ChatGPT Work, Claude | 1 to 2 | Invented facts or commitments in draft; wrong tone |
| Research and competitor monitoring | Claude scheduled task, ChatGPT Work scheduled task | 1 to 2 | Plausible wrong pricing or dates; prompt injection from pages |
| Weekly reporting | Claude scheduled task with Stripe/CRM connectors; Lindy scheduled deep-work task | 1 to 2 | Partial connector pagination; stale auth |
| Data cleanup (one-off) | Claude Cowork on a folder; Claude Code script; ChatGPT Work spreadsheet | 3 to 5 once | Silent truncation; destructive overwrite |
| Scheduling and calendar | Reclaim, Motion | 1 to 3 | Thrash; overblocking; Smart Meeting moves |

**Hallucination.** Every tool here generates text from a model. The failures seen in sources: wrong pricing tier, invented date, a summary that drops a row, a citation that does not support the claim. Rule for the simulator: any number an AI output states should show its source row or URL, and the run should flag "unverified" when no source is found.

**Wrong actions.** The concrete risks are sending an email to the wrong person, auto-archiving an investor thread, overwriting a folder, and burning a credit pool with a retry loop. The mitigations in the tools are approval modes, preview runs on 10 emails, clarification steps, run logs and per-seat credit caps. Default to read-only or draft-only for the first two weeks.

**Privacy.** Connectors grant read access to inbox, drive and CRM. Team and Enterprise tiers offer admin controls (Claude: connectors only in private projects; OpenAI: admin connector allow-lists on Business and Enterprise [unverified]; Lindy: SSO and audit logs on Enterprise). Check each vendor's data-processing terms and whether inputs train models on your plan. Most of these terms were not verified in this pass [unverified].

**Prompt injection.** Any tool that reads email or web pages can be steered by text inside them. Keep write permissions off for research tasks that read untrusted pages, and keep send steps human-approved.

---

## Sources (consolidated)

- https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork (fetched 2026-10-14)
- https://support.claude.com/en/articles/11724452-using-the-claude-desktop-app-with-connectors (fetched 2026-10-14)
- https://www.clickforest.com/en/blog/claude-cowork-explained (accessed 2026-10-14) [unverified]
- https://sandlabs.com.au/blog/claude-cowork-business-guide (accessed 2026-10-14) [unverified]
- https://help.openai.com/en/articles/11752874-chatgpt-agent (search snippet; direct fetch 403, 2026-10-14)
- https://help.openai.com/en/articles/11752874-chatgpt-work (direct fetch 403, 2026-10-14)
- https://www.usecarly.com/blog/tags/chatgpt-work/ (accessed 2026-10-14) [unverified]
- https://www.lindy.ai/pricing (fetched 2026-10-14)
- https://www.jetadmin.io/blog/lindy-pricing/ ; https://www.layer3labs.io/guides/lindy-ai-pricing ; https://usagepricing.com/blueprint/lindy [unverified]
- https://dupple.com/tutorial/create-an-email-triager [unverified]
- https://pipeline.zoominfo.com/sales/lindy-ai-features [unverified]
- https://aiindigo.com/tutorials/getting-started-with-lindy-automate-inbox-triage-and-meeting-scheduling [unverified]
- https://stacksheriff.com/tools/lindy-ai-review/ [unverified]
- https://superhuman.com/pricing (title only, 2026-10-14)
- https://superhuman.com/products/mail (fetched 2026-10-14)
- https://superhuman.com/apps/superhuman-go ; https://superhuman.com/products/go-ai-assistant (search results)
- https://help.superhuman.com/hc/en-us/articles/48093779871117-Get-started-with-Superhuman-Go-for-iOS (search result)
- https://www.capterra.com/p/199278/Superhuman/ [unverified]
- https://www.usecarly.com/blog/superhuman-pricing/ [unverified]
- https://reclaim.ai/pricing (fetched 2026-10-14)
- https://subger.com/en/service/reclaim-ai [unverified]
- https://saas.apppricinglab.com/product/reclaim-ai/ [unverified]
- https://www.usemotion.com/pricing (fetched 2026-10-14)
- https://morgen.so/blog-posts/motion-pricing [unverified; rival]
- https://dupple.com/pricing/motion [unverified]
- https://www.lindy.ai/blog/motion-app-pricing [unverified; rival]
