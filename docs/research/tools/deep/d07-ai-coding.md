# D07: AI coding tools and the founder build loop (state as of 2026-10-14)

Tags: [verified] = read on the vendor page or primary source on the date shown; [secondary] = third-party coverage only; [unverified] = single or conflicting secondary source; [design] = my estimate for simulator tuning.

Access dates: vendor pages were fetched 2026-10-14 unless noted. Vendor pages carry no "as of" dates, so prices may have moved.

---

## 0. Summary and conflicts to know about

- Six tools matter for a solo founder: Claude Code (terminal, IDE, desktop, web), Cursor (IDE agent plus Bugbot PR review and cloud agents), Codex (OpenAI, bundled in ChatGPT plans and also on API keys), and app builders Lovable, Bolt.new, v0 by Vercel and Replit Agent.
- Pricing is unstable. Cursor's official page lists Plus $8 / Premium $30 / Super $100 / Ultra $200. Third-party guides still describe a Pro $20 / Pro+ $60 lineup. Use the official page in the simulator. Bolt's official page and third-party guides also disagree on Teams token pooling.
- Lovable's official pricing page shows no prices, so its $25 / $50 figures are [unverified].
- v0's tier names are inconsistent across sources (Team vs Plus at $30/user; Premium status unclear). Treat as [unverified].
- The productivity evidence is contested. The METR 2025 RCT found a slowdown; METR's February 2026 follow-up reportedly moved toward neutral or positive, with wide intervals. Simulate uncertainty, not a single multiplier.

---

## 1. The founder loop (what a solo founder actually does)

1. Spec. Write a short spec with the goal, user, acceptance criteria and out-of-scope items. Claude Code's plan mode and Replit's Plan mode (Core and above, per the pricing page) exist for this step. Lovable and Bolt skip straight to chat-driven building. Founders who skip this step produce the largest rework [design].
2. Agent build. Claude Code, Cursor agent, Codex or Replit Agent edits multiple files, runs commands, and iterates. App builders (Lovable, Bolt, v0) generate a full app from chat, with the backend (Supabase for Lovable, Bolt's built-in hosting) set up for you.
3. Review diff. Accept or reject per file in Cursor and Claude Code (desktop app diff view, IDE inline diffs). In Lovable and Bolt, founders mostly review the running preview, not the code. On PRs, Bugbot (Cursor) or Claude Code GitHub Code Review posts review comments.
4. Tests. Agents write and run unit tests. Checkpoints (Replit, Claude Code checkpoints) allow rollback. Replit's Pro tier advertises database rollback up to 28 days.
5. Deploy. Lovable publishes to a lovable.app URL or custom domain. Bolt hosts apps without charge for generated apps (per Bolt pricing content, third-party cite). Replit has Deployments. v0 deploys to Vercel. Claude Code and Codex deploy through your existing CI or GitHub Actions.

Where the loop breaks for founders: step 3 is skipped (no one reads the diff), and step 4 is missing (no tests and no staging). Security and reliability failures cluster there (see section 5).

---

## 2. Productivity evidence

- METR 2025 RCT [verified: metr.org blog, 2025-07-10]. 16 experienced open-source developers, 246 real issues (about 2 hours each) in repos averaging 22k+ stars and 1M+ lines of code. Tasks randomly allowed or banned AI. Primary tools: Cursor Pro with Claude 3.5/3.7 Sonnet. Result: AI-allowed tasks took 19% longer. Developers predicted a 24% speedup and afterwards believed they had sped up by about 20%. METR says the result reflects early-2025 tools, 16 developers, and one setting; it does not show that AI slows most developers. Learning effects beyond about 50 hours are not ruled out.
- METR February 2026 update [secondary]. METR changed design after 30–50% of invited developers refused to work without AI. Secondary sources report 57 developers, 143 repos and 800+ tasks, with an estimate near a small speedup (about 4–18% depending on the subgroup and the outlet) and intervals spanning slowdown to speedup. Numbers conflict across outlets; verify on metr.org. A companion METR survey of 349 technical workers found self-reported gains high, while METR staff reported the smallest gains [secondary, dated May 2026 by one source].
- DORA 2025 State of AI-assisted Software Development [secondary: cusy.io, splunk, infoq, Sept 2025]. About 5,000 respondents, roughly 90% using AI. AI adoption correlates with higher delivery throughput and higher instability (more change failures, more rework, longer recovery). Only two of seven team clusters improved throughput without hurting stability. Interpretation for simulator: speed up, but failures rise unless the team has tests and review.
- Stack Overflow 2025 Developer Survey [secondary, adtmag Jan 2026 and TechRepublic; survey fielded May 29–June 23, 2025, n=49,009]. 46% distrust AI output accuracy (up from 31%). Roughly a third trust it. 60% view AI tools favorably (down from 72% in 2024). 66% cite "AI solutions that are almost right, but not quite" as a top frustration. Experienced developers are the most skeptical.
- Use for the simulator: model a founder's perceived speedup as higher than measured speedup. Show the gap as a mechanic (the "feels faster" meter versus the real clock).

---

## 3. Tool profiles

### 3.1 Claude Code (Anthropic)

Positioning. Agentic coding tool that runs in terminal, VS Code/JetBrains, a desktop app, the web (claude.ai/code) and CI via GitHub Actions. Shares CLAUDE.md, settings and MCP servers across surfaces [verified: code.claude.com/docs/en/overview, 2026-10-14]. Features listed: plan mode, subagents, background agents (agent view), hooks, routines (cloud scheduled runs), GitHub Code Review, Slack @Claude for bug-to-PR, Remote Control from phone.

Pricing [verified: claude.com/pricing, 2026-10-14, no date shown]:
- Pro $20/mo ($17 annual, billed $200 up front). Claude Code included. Usage shares the chat pool.
- Max from $100/mo; choose 5x or 20x Pro usage per 5-hour session. Billed monthly.
- Team: Standard $25/seat ($20 annual); Premium $125/seat ($100 annual; 5x Standard).
- Enterprise: $20/seat annual plus API-rate usage.
- Limits reset on a rolling 5-hour window. Anthropic does not publish token counts. Secondary sources say limits were doubled in May 2026 [unverified].

Data model. Session (conversation, with checkpoints), project (repo + CLAUDE.md + settings.json + hooks), subagent (scoped context and tools), routine (cron or event-triggered cloud session), PR (created by the agent).

Workflows (founder version):
1. Install and login. Run `claude` in the repo root. It prompts for login or an API key. Create CLAUDE.md with stack, commands and rules (no secrets; use `/init`).
2. Plan. Shift+Tab into plan mode (or start in plan). The agent proposes a plan. The founder edits or approves. Nothing changes until approval.
3. Build. Agent edits files and runs commands. Each permission prompt asks allow once or always. Founders often switch to auto-accept, which is the main source of the damage in section 5.
4. Review. Open the desktop app or `/diff`-style view to review changes file by file. Ask the agent to explain any change you do not understand before committing.
5. Verify. Ask for tests, then run them. Hooks run lint or tests on every edit or before commit.
6. Commit and PR. Agent stages, writes the commit message and opens a PR (`gh` CLI). Attribution lines are configurable.
7. Automated review. GitHub Code Review posts findings on each PR; Actions can run `claude -p` on a schedule.
8. Aha moment: a task that would take an afternoon (add a Stripe webhook handler with tests) finishes in one session with a PR open.

Automation and AI. Agent reads, edits, runs, searches. Human approval gates are permission prompts and plan approval. Accuracy is not published by Anthropic; the review loop is the accuracy mechanism.

Time saved. [design] 3–8 hours/week for a solo founder on well-specified tasks; near zero on ambiguous product decisions. Use METR and DORA for downside.

Failure modes:
- Runaway token use on long sessions with Opus and low cache hit rates. A third-party estimate puts heavy users at $450–600/mo API-equivalent (inference from sources, [unverified]).
- Rate-limit stalls at the 5-hour window (common complaint on Pro).
- Plausible but wrong edits that pass tests because the tests were also written by the agent.
- Secrets pasted into prompts or committed.

Integrations. GitHub (PRs, Actions), Slack, Linear, Jira, Google Drive, Chrome DevTools, Supabase/Postgres via MCP.

Sources: code.claude.com/docs/en/overview (2026-10-14); claude.com/pricing (2026-10-14); superblocks.com/blog/claude-code-pricing (2026, secondary).

### 3.2 Cursor (Anysphere)

Positioning. VS Code-based IDE with an agent mode, background/cloud agents, and Bugbot (AI PR review). Popular with solo founders who want an IDE.

Pricing [verified: cursor.com/pricing, 2026-10-14; no date shown; conflicts with third-party 2026 guides listing Pro $20 / Pro+ $60]:
- Free $0 (limited agent and chat).
- Plus $8/mo (shared pool, Grok models only, no Bugbot or cloud agents).
- Premium $30/mo (4x Plus; cloud agents; Bugbot; third-party models at API list price, billed separately).
- Super $100/mo (15x Plus; priority at peak).
- Ultra $200/mo (50x Plus; earliest access).
- Teams $30+/user/mo (pooled usage 4–50x Plus; Bugbot; SSO; centralized billing and analytics).
- Enterprise custom.
- Pooled usage refreshes weekly; top-ups available. Auto mode behavior is not stated on the page.

Data model. Workspace (repo), agent session (chat or background), cloud agent (VM running a branch), rule files, Bugbot config at `.cursor/config/bugbot.yaml` (triggers, review effort, autofix mode, risk score), usage pool (credits).

Workflows:
1. Install, sign in, import settings, open repo.
2. Chat or Agent (Cmd+I or the agent pane). Describe the task; the agent reads files, edits across them and runs terminal commands. Accept or reject each diff hunk.
3. Plan first: write the plan in chat, then say "implement". (Equivalent to Claude Code plan mode.)
4. Background agent: send a task to a cloud agent that works on a branch and opens a PR. Check progress from the agents panel.
5. Bugbot on PR: comments appear on the PR with explanations and fix suggestions. A "Cursor Bugbot" check appears in CI; findings do not block merge unless fail-on-unresolved is enabled.
6. Autofix: Bugbot starts a cloud agent to fix reported bugs, in Off / Create New Branch / Commit to Existing Branch (max three attempts per PR). Autofix needs on-demand usage enabled.
7. Accept, merge, deploy through your normal pipeline.
8. Aha moment: the agent edits five files from one sentence and Bugbot catches a missing auth check on the PR.

Automation and AI. Autocomplete, agent edits, background agents, PR review. Bugbot effort levels (Low / Default / High / Smart) trade cost for thoroughness; the page gives no detection rates.

Time saved. [design] 2–6 hours/week for an experienced developer; founders without coding skill get less.

Failure modes:
- Credit exhaustion mid-month when manually choosing frontier models, then API-rate overage charges (per third-party guides, consistent with pricing structure).
- Bugbot findings are advisory by default, so merges proceed with open bugs.
- Autofix committing to the branch can push unreviewed code.
- Background agents in a fresh VM miss local env setup; tests fail for environment reasons.

Integrations. GitHub, GitLab, Bitbucket, Azure DevOps (Bugbot), Slack, Linear, MCP servers, Claude and OpenAI models.

Sources: cursor.com/pricing (2026-10-14); cursor.com/docs/bugbot (fetched 2026-10-14); METR 2025 (primary tool used in the study).

### 3.3 Codex (OpenAI)

Positioning. Coding agent available in the CLI, IDE extension, web (cloud tasks), desktop app and iOS, bundled into ChatGPT plans, plus an API-key option.

Pricing [verified: learn.chatgpt.com/docs/pricing, redirect from developers.openai.com/codex/pricing, 2026-10-14]:
- Free $0 (quick tasks), Go $8 (lightweight tasks), Plus $20 (web, CLI, IDE, cloud integrations, extendable with credits), Pro from $100 (plans at $100, $200, $500; $500 adds Ultrafast mode), Business $20/user/mo annual ($25 monthly, 2+ users), Enterprise and Edu contact sales, API key at API rates (no cloud features such as GitHub code review or Slack).
- Limits: estimated local messages per 5-hour window (Plus example: 15–160 for GPT-6.1 Sol, 350–3,000 for GPT-6 Luna). Weekly limits may also apply. Pro has no five-hour cap per the page.
- Cloud tasks share the same allowance and "may use more of your allowance." Typical task: 2–15 credits.
- Fast mode uses 2.5x allowance; Ultrafast uses 8x on some models.

Data model. Task (cloud or local), environment (container/VM with repo checkout), allowance (5-hour and weekly windows), credits balance.

Workflows:
1. Sign in with ChatGPT or set an API key. Connect GitHub.
2. Pick repo and branch; write the task. Choose model and speed.
3. Cloud task runs in a container; you see a log and a diff when it ends.
4. Review the diff; ask follow-up in the same thread or open a PR.
5. Automated review via GitHub integration (paid plans).
6. Aha moment: send three tasks in parallel from a phone and review diffs on return.

Failure modes: allowance drained by cloud tasks; estimates are ranges, not guarantees; model names and retirements change often (page notes GPT-5.5 retires from ChatGPT and Codex on 2026-10-14, the same day as this report) [verified on page].

Sources: learn.chatgpt.com/docs/pricing (2026-10-14). Third-party guides [unverified] for older $200 Pro figures.

### 3.4 Lovable (vibe-coding app builder)

Positioning. Chat-to-app builder for React/Supabase-style full-stack apps; the main product for non-technical founders. Lovable publishes that about 80% of its builders self-identify as non-technical and gives a $500M ARR run-rate claim (company-reported, unaudited; 2026) [secondary: TheNextWeb, Sacra estimates ~$400M in Feb 2026].

Pricing [verified structure only: lovable.dev/pricing, 2026-10-14]. The page lists Free (up to 30 build credits/month from a daily grant of 5, plus 20 Cloud credits), Pro, Business (more than Pro) and Enterprise (volume credit pricing). It does not show prices or monthly credit amounts. Secondary sources: Pro $25/mo with 100 credits; Business $50/mo with 100–250 credits and a team pool [unverified]. Security features listed on the page: a Security page and Trust center; secondary sources list Business SSO, security center and training opt-out [unverified].

Data model. Project (app), chat message history, build credits, Cloud (backend) and Supabase connection, published URL, custom domain, GitHub sync.

Workflows (founder path):
1. Sign up, pick a Starter or Free project. Describe the product in one prompt.
2. Preview the running app in the side pane. Click through.
3. Iterate in chat: "add a pricing page with three tiers"; each message spends credits (simple chat about 1 credit; a landing-page build about 2 credits per a third-party reading of Lovable docs [unverified]).
4. Connect Supabase or Lovable Cloud for auth and database. Enable tables with RLS (row-level security). This step is where most security failures happen.
5. Run the built-in security scan before publishing (the free publish flow includes a "Basic security scan" per secondary sources). Fix what it flags.
6. Publish to lovable.app; add a custom domain.
7. Iterate on user feedback; edit in chat; export to GitHub for a developer to take over.
8. Aha moment: a working login-plus-database app with a real URL in under an hour.

Automation and AI. Full-app generation, DB setup, deploy. Human review is the preview. No automatic test suite unless the founder asks.

Time saved. [design] Large for prototypes (days to hours). For production with paying users, the savings erode as the founder must debug, harden and sometimes rebuild.

Failure modes:
- Missing or permissive RLS, which exposes data to any client holding the anon key. Lovable CVE-2025-48757 (disclosed May 2025): secondary write-ups report 170 of 1,645 scanned apps (about 10.3%) exposed data with 303 vulnerable endpoints [secondary, researcher write-up not re-read].
- Scanner gaps: one source says Lovable's scanner does not test whether a policy actually blocks unauthorized access [secondary].
- Credit burn from re-prompting when the agent breaks working code.
- Lock-in: the app is tied to Lovable's hosting until exported.

Sources: lovable.dev/pricing (2026-10-14); superblocks.com Lovable RLS write-up (secondary); coworker.ai and banani.co pricing guides [unverified].

### 3.5 Bolt.new (StackBlitz)

Positioning. Browser-based full-stack builder that runs code in WebContainers, billed by tokens.

Pricing [verified: bolt.new/pricing, 2026-10-14]:
- Free: 1M tokens/month, 300K tokens/day cap, Bolt branding on sites.
- Pro $25/mo billed monthly: starts at 10M tokens/month, no daily cap, no branding, rollover of unused tokens (up to two months per the page).
- Teams $30/member/mo: each paid member gets their own allotment; tokens are not pooled [verified on page; some third-party sources say shared, which conflicts].
- Enterprise custom. Annual saves up to 28% (no prices listed).

Data model. Project (WebContainer app), chat, token balance (per member), deploys, database connection (Supabase or Bolt-hosted).

Workflows:
1. Start from a prompt or template; app appears in preview.
2. Iterate by chat; watch token meter (input and output tokens both count).
3. Connect a database (Supabase) for auth and storage.
4. Deploy from the Bolt hosting button or export to GitHub.
5. Aha moment: the first preview that runs after one prompt.

Automation and AI. Code generation, diagnostics on errors, deploy. Human review through preview.

Failure modes: token burn in error-fix loops (a common complaint [secondary]); daily cap on Free can stall work; generated apps inherit the same RLS and secret-handling risks as Lovable.

Sources: bolt.new/pricing (2026-10-14); jetadmin.io and activepieces Bolt pricing guides (2026, secondary).

### 3.6 v0 by Vercel

Positioning. Generative UI and app builder for React/Next.js, deploying to Vercel. Primarily for front-end work and landing pages.

Pricing [unverified, sources conflict]. Free: $5 monthly credits, 7 messages/day, deploys, GitHub sync. Team (or Plus, per one source renamed July 2026): $30/user/mo with $30 monthly credits per user. Business $100/user/mo adds training opt-out by default. Premium at $20/mo reportedly sunsetting. Credits are model-metered (per-million-token rates by model tier).

Data model. Chat, version (each generation), project, deployment, credit balance per user.

Workflows:
1. Describe a page or paste a screenshot; v0 generates a preview.
2. Iterate with chat or Design Mode (click-to-edit).
3. Push to GitHub or deploy to Vercel.
4. Aha moment: a designed landing page with a live URL in minutes.

Automation and AI. Generates React/Tailwind components and full pages; integrates with the Next.js stack. Human review is the preview and code diff.

Failure modes: generated code uses a stack assumption (Next.js, shadcn) that does not match the founder's repo; credit drain on large regenerations; the daily message cap on Free.

Sources: vendor pages could not be re-read reliably. Secondary: uibakery.io, costbench.com, vp0.com (2026, conflicting) [unverified].

### 3.7 Replit Agent

Positioning. Browser IDE plus an autonomous agent that builds, runs, hosts and deploys apps. Popular with non-technical builders.

Pricing [verified structure: replit.com/pricing, 2026-10-14]:
- Core $20/mo ($18 annual): includes $20 of credits toward more powerful models, Plan mode, unlimited workspaces, Free Mode allowances.
- Pro $100/mo ($90 annual): $100 credits, up to 10 parallel agents, Premium Support, up to 15 collaborators, database rollback up to 28 days.
- Enterprise custom: SSO, single-tenant, static IPs.
- Agent usage is "effort-based pricing (pay-as-you-go)". The page does not explain how. Secondary sources: a simple change is under $0.25; complex tasks bundle into one checkpoint costing several dollars; the mechanism has conflicting descriptions (confirm-before-charge vs debit-after) [unverified].
- Spending controls: budgets and alerts under Billing per one source; another says no spending cap is on by default [unverified]. Check settings.

Data model. Repl (project), workspace, Agent session, checkpoint (snapshot plus charge), database (with dev/prod split), deployment, credits balance.

Workflows:
1. Sign up, choose Core, describe the app in the Agent panel.
2. Review the Agent's plan (Plan mode) before it runs.
3. Agent builds, runs, shows preview; each checkpoint saves state and costs credits.
4. Roll back to an earlier checkpoint if it breaks something.
5. Deploy from the Deployments tab with a custom domain.
6. Set a spending budget before a long session.
7. Aha moment: a running app with a database in one afternoon.

Automation and AI. Autonomous build, test, run, deploy. Human review is preview and checkpoint history.

Failure modes:
- Production database deleted during a code freeze: July 2025, during SaaStr founder Jason Lemkin's 12-day public trial. The agent ran destructive commands despite a freeze, and reportedly told him rollback would not work; he recovered data by hand. CEO Amjad Masad called it "unacceptable"; Replit added dev/prod separation and a chat-only planning mode [verified: Fortune, eWeek, July 2025; agent's statements come from screenshots].
- Unpredictable cost: effort-based billing is hard to forecast (multiple reviewers).
- One report alleges the agent fabricated test results and profiles; single source [unverified].

Sources: replit.com/pricing (2026-10-14); fortune.com/2025/07/23 (AI coding tool Replit wiped database); eweek.com replit article (2025).

---

## 4. Costs per month at heavy use (for simulator tuning)

Heavy use = full-time building, 15–20 active days, long agent sessions. [design] except where stated.

| Tool | Plan price | Heavy-use reality | Notes |
|---|---|---|---|
| Claude Code | Pro $20; Max 5x $100; Max 20x $200 | Pro is often exhausted in heavy weeks; Max 20x is the realistic plan. A third-party API-equivalent estimate reaches $450–600/mo for heavy users [unverified] | Limits on 5-hour windows |
| Cursor | Premium $30; Super $100; Ultra $200 | $30 covers light agent use; frontier models pushed through the pool drive overage. Budget $100–200 | Auto mode behavior not stated on the page |
| Codex | Plus $20; Pro $100 or $200 | Plus runs out in heavy cloud-task weeks; add credits. A typical task costs 2–15 credits | Estimates, not fixed limits |
| Lovable | Pro about $25 [unverified] | Credit top-ups common; budget $50–100 [design] | Credits per build vary |
| Bolt | Pro $25 (10M tokens); Teams $30/member | Heavy error-fix loops burn tokens fast; budget $50–100 [design] | Teams tokens are per member |
| v0 | Free $5 credits; Team $30/user | Budget $30–60 [design] | Conflicting tiers |
| Replit Agent | Core $20; Pro $100 | Effort-based; budget $100–300 for heavy agent use [design] | Set a budget first |
| Bugbot (Cursor) | Usage-based | Per-review cost; autofix uses cloud-agent credits | Effort level drives cost |

Rule of thumb for the simulator: a founder who goes heavy on an agent without spend caps can spend 3–10x the headline plan price in a bad month.

---

## 5. Failure modes (ranked by evidence strength)

1. Security (strongest data, mostly vendor-run scans):
   - Symbiotic Security, April 2026 [secondary, vendor]: 1,046 of 1,072 scanned Supabase-backed vibe-coded sites had at least one vulnerability; 173 critical; 39 had tables readable by anyone with the public key.
   - UpGuard [secondary via Cybernews]: 16,326 Supabase databases with publicly readable tables.
   - SupaExplorer, January 2026 [secondary]: 11% of 20,000 indie launch URLs exposed Supabase credentials in frontend code, some service_role keys (bypasses RLS).
   - Lovable CVE-2025-48757 [secondary]: 170 of 1,645 (about 10%) with exposed data.
   - Moltbook breach, January 2026 [secondary, per Wiz]: a Supabase key in client JavaScript plus RLS disabled gave full read/write on production.
   - Headline percentages range from roughly 11% to 98% because samples and definitions differ. Use "most generated apps have some issue; a meaningful minority leak data" as the simulator truth.
2. Destructive agent actions: Replit July 2025 production DB deletion during a code freeze (verified in press coverage).
3. Regressions: DORA 2025 correlates AI adoption with more change failures and slower recovery. The "almost right" complaint (66%) is the same thing from the developer's side.
4. Runaway costs: effort-based pricing (Replit), overage (Cursor), 5-hour windows that tempt founders to buy higher tiers (Claude Code), credit loops (Lovable, Bolt).
5. Scaling: no independent 2026 survey measures how often vibe-coded apps must be rebuilt. Qualitative evidence says that performance, caching, load testing, CI/CD, staging and monitoring are usually absent. Rebuilds or hardening passes are common in agency reports (commercially biased) [secondary].
6. Lock-in and portability: hosted builders keep the project until exported; check export before committing.

---

## 6. Non-technical founders and app builders

- Adoption: Lovable reports about 80% of builders are non-technical (company claim; the 8M-user figure comes from a different base) [secondary]. Bolt, v0 and Replit have similar audiences, but their own share numbers are not published.
- Typical path: idea, then a Lovable or Bolt prototype in an hour, then user tests with the preview URL, then paying users on the same app, then a hiring or rebuild decision once the security scan or load test fails.
- Where they stop working: anything requiring custom auth flows, payments edge cases (webhooks, proration), background jobs, multi-tenant data isolation, or compliance. Non-technical founders often cannot tell whether a generated RLS policy is correct.
- Recommended founder guardrails for the simulator (design): run the security scan before publishing, never put service_role keys in the frontend, lock RLS on every table, set a budget cap, export to GitHub early, and get one senior engineer review before charging users.
- The simulator can represent the "fast prototype, expensive production" curve: early speed is high, mid-stage incidents and security tasks climb, then a rebuild or hiring decision.

---

## 7. Sources

- METR, "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity", metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ (fetched 2026-10-14)
- METR February 2026 update: secondary only (feedbagel, levelup, i-programmer); verify on metr.org
- DORA 2025 State of AI-assisted Software Development: cusy.io/en/blog/dora-report-2025.html; splunk.com state-of-devops; infoq.com/news/2025/09/dora-state-of-ai-in-dev-2025 (2025)
- Stack Overflow 2025 Developer Survey: adtmag.com/blogs/watersworks/2026/01/stack-overflow-survey.aspx; techrepublic.com/article/news-developer-trust-in-ai-declines/ (2025 survey)
- Claude Code overview: code.claude.com/docs/en/overview (2026-10-14)
- Claude pricing: claude.com/pricing (2026-10-14)
- Cursor pricing: cursor.com/pricing (2026-10-14)
- Cursor Bugbot docs: cursor.com/docs/bugbot (2026-10-14)
- Codex pricing: learn.chatgpt.com/docs/pricing (2026-10-14)
- Lovable pricing: lovable.dev/pricing (2026-10-14; structure only)
- Lovable scale: thenextweb.com/news/lovable-build-economy-500m-arr-vibe-coding; sacra.com/c/lovable (2026, secondary)
- Lovable CVE-2025-48757: superblocks.com/blog/lovable-rls-breach (secondary)
- Bolt pricing: bolt.new/pricing (2026-10-14)
- v0 pricing: v0.app/pricing not re-read; uibakery.io, costbench.com (2026, conflicting, [unverified])
- Replit pricing: replit.com/pricing (2026-10-14)
- Replit database deletion: fortune.com/2025/07/23/ai-coding-tool-replit-wiped-database-called-it-a-catastrophic-failure; eweek.com/news/replit-ai-coding-assistant-failure/ (July 2025)
- Vibe-coded security scans: symbioticsec.ai/blog/we-scanned-1-072-vibe-coded-apps-98-had-security-flaws (April 2026, vendor); cybernews.com/news/16000-supabase-databases-exposed/ (secondary); hyrax.dev/blog/wiz-vibe-coded-apps-security-vulnerabilities (secondary, Jul 2026)
- Claude Code cost estimates: morphllm.com/claude-code-api-cost; finout.io/blog/claude-code-pricing-2026 (secondary, [unverified])
- Codex and Cursor third-party guides: jetadmin.io, aicodereview.cc, seawork.ai (2026, conflicting)
