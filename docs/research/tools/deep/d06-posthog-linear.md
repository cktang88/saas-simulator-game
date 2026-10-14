# D06 Deep Dive: PostHog and Linear

Research date: 2026-10-14. Tags: [unverified] = only secondary sources; [design] = my estimate for the simulator. Pricing was fetched from the live pages on the research date, but third-party aggregators disagree on several numbers, so treat exact prices as a snapshot.

---

# Part 1: PostHog

## 1. Summary

PostHog is an open-source-friendly product OS for engineers and product teams: product analytics, session replay, feature flags, experiments, surveys, web analytics, a data warehouse with SQL, workflows (email, push), LLM analytics, and an AI assistant (PostHog AI, with "Max" as its in-app agent). Founders use it as a single tool in place of Mixpanel plus FullStory plus LaunchDarkly plus Optimizely plus Typeform. Positioning in 2026 is "start free, scale when you need" with an AI-agent-first direction. Sacra estimates about $58M ARR in February 2026 (analyst estimate, not company data) [unverified].

Pricing (small team, usage-based, no seat fees on the free plan):
- Free: 1M product analytics events per month, 5K session recordings, 1M feature flag requests, 1,500 survey responses, 100K error-tracking exceptions, 50 GB logs, unlimited team members, 1 project, 1-year retention. Source: aggregators (costbench, toolradar) [unverified]. Verify on posthog.com/pricing.
- Paid: usage-based per unit beyond the free allowances. Aggregators quote about $0.00005 per event after the free limit, with volume discounts [unverified]. Enterprise and "Scale" tiers conflict across sources ($450 to $750/month base) [unverified].
- AI credits: the PostHog AI docs page says each org gets 500 AI credits free per month, 100 credits = $1, with a 20% markup on LLM cost. Default billing limit $150 per month. One aggregator cites 2,000 free credits, so the official page is the one to trust [design: use 500]. Source: posthog.com/docs/posthog-ai/pricing (fetched 2026-10-14).

A caution from the changelog: PostHog restructured plans around 2026-02-04 (Free, Usage-Based, Enterprise) per a tracker [unverified].

## 2. Data model

PostHog organizes around these objects (project-scoped):
- **Project / Environment**: data partition with its own API key. One org has many projects.
- **Event**: `{event name, timestamp, distinct_id, properties{}, $set/$set_once person props, $session_id, $window_id, $current_url, $autocapture elements}`.
- **Person**: identified by `distinct_id`; holds person properties. Anonymous users merge into a person on identify.
- **Group**: company or org-level object (`group_type`, `group_key`, properties). Used for B2B analytics.
- **Session**: has `$session_id`, duration, start URL; the basis for replay.
- **Session recording**: a replay object tied to a session, with snapshots, console logs, network entries, and optional "playlists" (collections).
- **Insight**: saved query. Types: trends, funnels, retention, paths, stickiness, lifecycle, SQL. Has filters, breakdowns, date range, and a sharing link.
- **Dashboard**: a grid of insight tiles, with subscriptions (email or Slack).
- **Cohort**: a saved filter over persons (static or dynamic). Can be used as a funnel breakdown and as a flag target.
- **Feature flag**: key, rollout percentage, release conditions (groups of property filters, each with a rollout %), variants (multivariate), and a status (active/inactive). Flag evaluation counts as a "feature flag request" for billing.
- **Experiment**: wraps a feature flag (key, variants `control` plus up to 19 test variants), primary and secondary metrics, inclusion criteria, duration, and stats engine (Bayesian by default; frequentist optional).
- **Survey**: type (popover, API, widget, external link), questions (open, rating, NPS, single/multi choice), targeting (URL, cohort, event trigger), response records.
- **Data warehouse source**: external table synced from Stripe, HubSpot, Postgres, GitHub, App Store, etc. Synced into PostHog's warehouse and queryable with HogQL SQL. The changelog shows 54+ new sources added in August 2026 alone (changelog, 2026-08-28).
- **Workflow**: trigger plus steps (email, Slack, push, webhook), used for lifecycle messaging and broadcasts (Oct 2026 email broadcasts).
- **Person/organization AI credit ledger**: monthly allowance and spend.

## 3. Main workflows (what a founder clicks)

**W1. Setup and first event (aha: first live event shows up in Live Events).**
1. Sign up at posthog.com, pick a project name and region (US or EU cloud). Choose which products to turn on in the onboarding wizard.
2. Copy the snippet or install the SDK (`posthog-js` for web, `posthog-node` for backend). Paste the project API key and host.
3. Open Activity > Live events. Load the site. Events stream in within seconds. This is the aha moment.
4. Autocapture records clicks and pageviews with no code. Add `posthog.capture('signup_completed', {plan})` for custom events.

**W2. Build a funnel (the most common founder analysis).**
1. Product analytics > New insight > Funnel.
2. Step 1: pick `$pageview` with a URL filter (e.g. `/pricing`). Step 2: `signup_started`. Step 3: `subscription_started`.
3. Set the funnel to Strict order or Any order if steps can happen out of sequence. Add exclusion steps if needed (e.g. exclude internal users).
4. Breakdown by `$browser` or a UTM property. Attribution: first touch, last touch, or all steps.
5. Read the Conversion steps chart: overall vs relative conversion; the lowest relative step is the leak.
6. Click a step's drop-off bar. The people list opens; open a person's recording (the replay icon next to each person).
7. Save as cohort ("users who dropped at step 2") for a later email or flag.

**W3. Watch session replays (the weekly "why" loop).**
1. Session replay > Recordings. Filter by URL, event, person property, or "has error," or by flag variant.
2. Click a recording. The player shows timeline, rage clicks and dead clicks, console logs, network requests, and exceptions synced to the timeline.
3. Use "Replay Vision" (2026) or PostHog AI summaries: AI summarises session behaviour and cites timestamps (changelog July 24, 2026 "trusted summary citations").
4. Add to a playlist. Share a link with the team.

**W4. Ship a feature flag (the release loop).**
1. Feature flags > New flag. Key (`new-onboarding`), release conditions (e.g. 10% of users; or cohort = beta testers; or `plan = pro`), then Save and enable.
2. In code: `if (posthog.isFeatureEnabled('new-onboarding')) {...}`. Add a fallback value for when flags have not loaded (changelog July 2026).
3. Monitor Usage: flag request count (billing-relevant).
4. Roll out: edit the percentage up from 10 to 50 to 100, then delete the flag and its code once it is fully shipped.

**W5. Run an experiment (the A/B loop).**
1. Experiments > New experiment. Step 1 Description: name, hypothesis, flag key (the wizard creates the flag).
2. Step 2 Variant rollout: `control` and `test` split (50/50 by default), rollout percentage (e.g. 100% of eligible users).
3. Step 3 Analytics: inclusion criteria, primary metric (e.g. `subscription_started` conversion), secondary metrics (retention, error rate). Metrics can be shared across experiments.
4. Save as draft, then Launch. Results appear after data arrives: significance, win probability, confidence intervals.
5. End experiment and choose the winning variant. The flag then serves that variant to everyone.
Note for simulator: the docs recommend predetermined duration and sample size, but the UI gives no sample size calculator on the free path [unverified].

**W6. Surveys (the NPS or "why did you cancel" loop).**
1. Surveys > New survey. Type: popover on site, or external link (email).
2. Questions: open text, rating, NPS (0 to 10), single choice.
3. Targeting: URL match, event trigger (`subscription_cancelled`), or a cohort.
4. Launch and read responses in a list; AI summarises responses (costs credits, see section 5).

**W7. Ask the data warehouse (the "I want Stripe MRR in PostHog" loop).**
1. Data warehouse > Sources > Add source. Pick Stripe, enter the restricted key, choose tables (charges, subscriptions, invoices).
2. Sync frequency set per table (incremental where possible).
3. SQL editor: `SELECT ... FROM stripe.subscriptions`, join to events by email.
4. Save as an insight or a dashboard tile.

**W8. Weekly ritual (what good founders do).** Dashboard with 4 tiles: weekly active users (trends), signup funnel (conversion), retention (retention chart), and one experiment. Subscribe the dashboard to a weekly Slack digest.

## 4. Automation and AI

- **AI assistant (Max / PostHog AI)**: answers analytics questions in plain English, builds insights and funnels, writes SQL, and finds replays. Third-party description of Max as a "plain English analytics agent" [unverified]. No official 2026 launch note found.
- **Replay Vision** (changelog, July 2026): AI scanner that reviews replays for issues, with access controls, bulk scanning, and on-demand summaries that can be saved as cohorts.
- **Natural-language replay search**, **experiment result summaries**, **survey response summaries**, **AI summaries in dashboard subscriptions**, and **LLM analytics** (cost, latency, evals on AI features; changelog Sept/Oct 2026).
- **Workflows**: triggers (event, cohort entry) plus actions (email, Slack, push). Broadcasts for one-off or scheduled emails (Oct 5, 2026).
- **MCP server**: 32 tools added in one week (August 2026), including experiment recalculation and replay vision actions. Developers drive PostHog from Claude or Cursor.
- **Human review points**: AI summaries have no published accuracy metric. Experiment significance is statistical, and PostHog recommends predetermining duration to avoid peeking.
- **Accuracy**: no published numbers for Max or replay summaries [unverified].

## 5. Time saved and cost

- [design] Solo founder saves 2 to 4 hours per week by replacing a manual CSV-and-spreadsheet analytics routine with saved insights and a weekly digest. Real evidence is anecdotal, so no citation.
- [design] Session replay triage saves an estimated 1 to 2 hours per week, where one user session takes about 2 minutes to watch.
- Cost units:
  - Event (free to 1M/month, then about $0.00005 per event [unverified]).
  - Replay recording (free to 5K/month).
  - Flag request (free to 1M/month).
  - AI credit: 100 credits = $1 after 500 free per month (official docs). A survey summary or a SQL write is a few credits [design].
- Budget tip: a 1M-event/month startup likely stays free; a 10M-event B2C app with replay at 50K recordings likely pays about $100 to $300 per month [design].

## 6. Failure modes

- **Event volume explosion**: a loop that captures on every render burns events and bills. Happens often in early setups [design].
- **Missing identify()**: anonymous events never join to person records. Funnels show zero conversion for logged-in users.
- **Autocapture noise**: element-based filters break on CSS class changes. Use `data-attr` names instead.
- **Ad blockers** drop events. Reverse proxy fixes it, but many founders skip it and see 20 to 40 percent data loss [design, widely reported].
- **Replay masking leaks**: text is masked by default for inputs, but custom fields need explicit masking. Privacy incidents are a real risk.
- **Flag staleness**: flags left in code after 100% rollout. Clutter and a hidden variant-dependent code path.
- **Experiment peeking**: checking significance daily inflates false positives. The Bayesian default reduces this but does not remove it.
- **Experiment exposure bias**: events must carry the variant property on every capture, including server-side captures, or the experiment shows no data.
- **HogQL timeouts**: large warehouse queries time out or cost time; failing models are auto-suspended after repeated failures (Sept 2026 changelog).
- **Warehouse source drift**: a Stripe key rotation silently stops syncs.
- **AI credits pause**: when credits run out, AI features pause until the billing period resets. Subscriptions keep sending without AI summaries.

## 7. Integrations

- Data in: Stripe, HubSpot, Postgres, BigQuery, Firestore, GitHub deployments, App Store Connect, WorkOS, Gainsight, Metronome (warehouse sources, changelog Aug to Sept 2026).
- Data out: Slack (alerts, subscriptions), email (broadcasts and workflows), webhooks, push (iOS and Android, Sept 2026).
- Dev tools: GitHub (flag and experiment code), Cursor and Claude (MCP), Next.js, React Native, Flutter, Elixir, Go, Ruby SDKs.
- Typical flow: web app sends `posthog-js` events and a flag check. Stripe syncs to the warehouse. A cohort built in PostHog from the warehouse drives a Workflow email.

## 8. Sources

- PostHog pricing page, https://posthog.com/pricing (fetched 2026-10-14; content truncated, no figures extracted)
- PostHog AI pricing, https://posthog.com/docs/posthog-ai/pricing (fetched 2026-10-14)
- PostHog changelog 2026, https://posthog.com/changelog/2026 (fetched 2026-10-14; entries through Oct 5, 2026)
- PostHog experiments: creating an experiment, https://posthog.com/docs/experiments/creating-an-experiment.md (fetched 2026-10-14)
- PostHog session replay overview, https://posthog.com/docs/session-replay (fetched 2026-10-14)
- PostHog funnels, https://posthog.com/docs/product-analytics/funnels (fetched 2026-10-14)
- Free-tier aggregators [unverified]: https://costbench.com/software/product-analytics/posthog/free-plan/, https://toolradar.com/tools/posthog/pricing, https://usercall.co/post/posthog-pricing
- Plan restructure, Feb 2026 [unverified]: https://costbench.com/changelog/posthog-plans-renamed-2026-02/
- Sacra ARR estimate [unverified]: https://sacra.com/research/58m-year-hedgehog-of-product-analytics/

Conflicts: free AI credits (500 official vs 2,000 aggregator); Scale or Enterprise base price ($450 vs $750, both unverified). Official pricing page could not be extracted; the figures above rely on the AI docs page and aggregators.

---

# Part 2: Linear

## 1. Summary

Linear is the issue tracker for software teams that want speed and keyboard-first UI: issues, projects, cycles, roadmaps, triage, customer requests, and in 2026 an AI "Linear Agent." Positioning: "the system for building products" with agents running alongside humans. Team sizes from 2-person startups to enterprises.

Pricing (per user per month, billed annually, per Linear's pricing page, fetched 2026-10-14):
- Free: $0. Unlimited members, 2 teams, 250 issues, agent platform, Linear Agent.
- Basic: $10 per user per month. 5 teams, unlimited issues, unlimited uploads, admin roles.
- Business: $16 per user per month. Unlimited teams, private teams and guests, Triage Intelligence, Triage rules, Loops, Code Intelligence (coming soon), Linear Insights, Asks, Zendesk and Intercom integrations.
- Enterprise: custom, annual only. SAML and SCIM, invoice billing, advanced org modelling, priority support.
- Beta note: all Agent features are free during public beta. At GA, chat stays in the seat price. Automations and Code Intelligence may move to usage-based pricing beyond a threshold; Linear promises advance notice [unverified: from a summary of Linear's agent announcement].

## 2. Data model

- **Workspace**: contains teams, members, labels, customers, and integrations.
- **Team**: has an identifier prefix (e.g. `ENG`), its own workflow (statuses), cycles, labels, and triage. Issues are numbered per team (`ENG-123`).
- **Issue**: title, description (Markdown-like rich text), status (from the team workflow: Triage, Backlog, Todo, In Progress, In Review, Done, Canceled, Duplicate), priority (No priority, Urgent, High, Medium, Low), assignee, labels, project, cycle, estimate, due date, parent and sub-issues, relations (blocks, blocked by, related, duplicate), customer requests, attachments, git branch name, and activity history.
- **Status types**: Triage, Backlog, Unstarted, Started, Completed, Canceled. Each status belongs to one type.
- **Cycle**: team-scoped time box (e.g. 2 weeks). Fields: number, name, start and end date, issues, progress, scope history. Auto-created on a schedule; upcoming cycles are generated.
- **Project**: cross-team outcome with a lead, members, target date, status (planned, started, paused, completed, canceled), milestones, and updates (health: on track, at risk, off track).
- **Initiative**: groups projects over time.
- **Roadmap**: timeline view of projects and initiatives.
- **Customer**: name, domain, owner, and linked requests.
- **Customer request**: a customer-raised need attached to one or more issues or projects, with an "important" flag and count of requests.
- **Asks**: form-like intake for non-members; submissions land in Triage.
- **Triage rule**: filter conditions plus actions (set team, status, assignee, label, project, priority). Ordered top to bottom.
- **Agent skill**: a saved conversation that can run from the menu or slash command.
- **Automation**: triggers (issue enters triage) plus agent actions (e.g. add customer-impact summary).

## 3. Main workflows

**W1. Setup and onboarding (aha: first issue created with a keyboard shortcut).**
1. Sign up at linear.app; create a workspace; invite members (Free plan unlimited members).
2. Create a team (e.g. "Product"); accept the default workflow or edit statuses.
3. Connect GitHub under Settings > Features > Integrations > GitHub (install the GitHub App on the org; each member links their GitHub account in Settings > Connected accounts).
4. Aha: press `C` anywhere to create an issue, type title, press Cmd+Enter. Linear is fast and keyboard-first.

**W2. Triage (the daily inbox).**
1. Issues from Slack, Sentry, Intercom, Zendesk, Asks, or members outside the team land in Triage.
2. Open the Triage view. Keys: `1` accept (moves to default status); `2` decline (moves to Canceled, with a comment); `3` or `MM` mark duplicate (pick canonical issue; attachments and requests move); `H` snooze until a time or new activity.
3. Triage Intelligence (Business plan) suggests assignee and labels, and surfaces likely duplicates.
4. Triage rules auto-route, e.g. "label contains bug, team = Product, set priority High."
5. Team setting can require priority before leaving triage.

**W3. Plan a cycle (the sprint loop).**
1. Team > Cycles. Set cycle length (1 or 2 weeks) and enable auto-creation (current plus next 15 cycles generated).
2. Assign issues to the upcoming cycle from the backlog view (`Shift+C`-style shortcut or the cycle field).
3. Start the cycle; watch the progress bar and burn-up chart.
4. At cycle end, unfinished issues are removed from the cycle. With a cooldown set, they move into the following cycle after cooldown; without one, they move straight to the current cycle [official docs, summarised; check exact wording].
5. Review completed scope in the cycle insights.

**W4. Projects and roadmaps (the outcome view).**
1. Projects > New project. Name, lead, members, target date, and milestones.
2. Add issues to the project from the issue view or the project's issue list.
3. Post a project update weekly: health (on track, at risk, off track), progress summary, and next steps. Linear Agent can draft the update [from Linear Agent announcement].
4. Roadmap view: timeline of projects grouped by initiative. Founders use it as a public-ish status for the team.

**W5. Customer requests (the "customers asked for X" loop).**
1. Intercom, Zendesk, Front, or Asks create a request when an issue is created from a conversation. Salesforce creates from cases. Slack can prefill from the sender's domain.
2. Manual: from an issue's Customers section, a customer page, or Cmd/Ctrl+R.
3. Mark important (a triangle). Sort views by customer count (e.g. issues with 20+ requests).
4. Customer page bell notifies on new request, important mark, completion, or cancellation.
5. Closing the loop: when the issue ships, the linked customer gets a status change.

**W6. GitHub-linked development (the daily dev loop).**
1. Copy the git branch name (Cmd/Ctrl+Shift+.) from the issue. Branch names link PRs automatically.
2. PR title or description: `Fixes ENG-123` (closing), `Refs ENG-123` (non-closing), `Relates to ENG-123` (link only), `skip ENG-123` (prevent linking).
3. Status automation per team: Draft, Open (default In Progress), Review requested, Ready for merge, Merged (default Done). Branch-specific rules for `staging` vs `main`.
4. Merge closes the issue to "On PR or commit merge" status.
5. GitHub Issues sync: one-way or two-way per repo-team pair.

**W7. Linear Agent (2026).**
1. Open the agent with Cmd/Ctrl+J, mention @Linear in any comment, or use Slack or Teams.
2. Ask it: "group the related issues in the backlog and draft a spec for the top group," or "what is at risk this cycle?"
3. It can create issues from a Slack thread, write a project update, or surface recurring backlog themes.
4. Save a successful conversation as a Skill; run it from the menu or let it apply automatically.

**W8. Weekly founder ritual (what the simulator should reward).** Monday: triage inbox to zero. Mid-week: check cycle progress and move at-risk issues. Friday: post project update. Monthly: read Insights for completion trend.

## 4. Automation and AI

- **Triage Intelligence** (Business): agentic AI compares a new triage issue against existing issues and history. Suggests assignee and labels, and flags likely duplicates. No formal review step: accept, decline, and duplicate actions are the human check.
- **Triage rules and Responsibility** (Business): deterministic automation on filters.
- **Linear Agent** (public beta, March 24, 2026): chat, Skills, Automations (Business and Enterprise). Automation example: when an issue enters triage, add a customer-impact summary.
- **Code Intelligence** (coming soon, Business and Enterprise): answers code questions like "how does this feature work" and "who owns this system," and helps write technical specs.
- **Intake agents**: Intercom and Zendesk integrations (Business), and Gong (Enterprise), turn customer conversations into issues.
- **Accuracy and resolution rates**: Linear publishes none. The Code Intelligence page claims "reliable responses" without evidence [unverified].
- **Human review points**: triage accept, decline, duplicate; Skill and Automation output before it is saved; project update drafts before posting.
- **Pricing risk**: Automations and Code Intelligence may move to usage-based at GA (Linear says it will give notice).

## 5. Time saved and cost

- Seat cost: Basic $10 and Business $16 per user per month, billed annually. A 5-person team on Business costs $80 per month ($960 per year) [design calculation].
- [design] Triage with Intelligence saves a solo founder or small team about 30 to 60 minutes per week on routing and duplicates.
- [design] Weekly project updates drafted by the agent save about 20 minutes per week.
- [design] Customer-request tracking replaces a spreadsheet that founders otherwise keep by hand, saving about 1 hour per week. Evidence is anecdotal.
- Cost unit: the agent is free in beta. Post-GA, usage pricing applies to heavy automation (no per-run price published) [unverified].

## 6. Failure modes

- **Duplicate proliferation**: Asks and Slack create issues faster than triage can clear. Teams end up with 200+ items in Triage.
- **Triage Intelligence wrong suggestions**: it can suggest a wrong assignee when labels are sparse. Accept without reading becomes a silent error [design].
- **Stale cycle rollover**: unfinished work rolls forward silently, so "velocity" looks fine while carry-over grows.
- **Branch name mismatch**: a branch not copied from Linear does not link. Commits link only with a magic word and the webhook set up.
- **Multi-PR confusion**: an issue with several PRs changes status only after the final PR reaches the required state. Teams report a stuck In Progress status [design].
- **Closing-word misuse**: a merged PR with `Refs` does not close the issue. Teams misread this.
- **Two-way GitHub sync conflicts**: only one repo per team can be two-way; custom GitHub Project statuses do not sync; only newly created issues sync (history needs the importer).
- **Enterprise Server gaps**: no commit linking or issue sync on GitHub Enterprise Server.
- **Agent beta pricing change**: Automations at GA may cost more than founders expect.
- **Agent hallucination on specs**: drafted specs are starting points. Teams that ship them unedited hit missed requirements.
- **Free plan limit**: 250 issues. A founder who logs everything hits the cap quickly and must upgrade or archive.

## 7. Integrations

- Source control: GitHub (PR linking, status automation, Issues sync). GitLab and Bitbucket also exist; not verified here.
- Support: Intercom, Zendesk, Front, Salesforce (customer requests); Gong (Enterprise).
- Chat: Slack (create issues, notifications, Agent); Microsoft Teams (Agent).
- Monitoring: Sentry (issues enter triage).
- Design and docs: Figma and Notion (attachments and embeds; not researched here).
- Typical data flow: Intercom conversation becomes an issue in Triage with a customer request. Triage Intelligence suggests a duplicate. Founder accepts, and the issue is assigned to a cycle. A branch named from the issue opens a PR. Merge closes it and notifies the customer request.

## 8. Sources

- Linear pricing page, https://linear.app/pricing (fetched 2026-10-14; no effective date shown)
- Linear Agent announcement, https://linear.app/changelog/2026-03-24-introducing-linear-agent (fetched 2026-10-14; dated March 24, 2026)
- Linear triage docs, https://linear.app/docs/triage (fetched 2026-10-14)
- Linear GitHub integration docs, https://linear.app/docs/github (fetched 2026-10-14)
- Linear customer requests docs, https://linear.app/docs/customer-requests (fetched 2026-10-14)
- Linear cycles, summarised from search snippets, https://linear.app/docs/use-cycles and https://linear.app/enablement/guide/cycles-guide [unverified; direct fetch of /docs/cycles returned 404]
- Linear changelog index, https://linear.app/changelog/timeline (not fetched in full)
- Third-party summary of Linear Agent and beta pricing [unverified]: https://releases.sh/linear/linear.md

Gaps: I could not fetch the Linear cycles and surveys doc pages (404). Roadmap and Asks details rely on the Agent announcement and triage docs. Linear's Asks page was not fetched directly.

---

# Cross-tool notes for the simulator

- Both products use a "ticket or event" core: PostHog's event stream and Linear's issue with states. Both have an AI layer that is still in beta or credit-limited, so the simulator should model metered AI as a cost that can run out, not as free.
- PostHog's free tier is generous and usage-priced. Linear's is capped by issue count (250) and gated by team count. Model the paywall at different points: PostHog at event volume, Linear at issue count and team count.
- Failure modes worth simulating: duplicate-issue backlog (Linear), event-volume spikes and missing identify (PostHog), and silently rolled-over cycle work (Linear).
