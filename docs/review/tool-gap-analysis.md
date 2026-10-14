# Tool gap analysis: what real 2026 founders use vs. what the simulator lets you practise

Date: 2026-10-14. Inputs: the 22 research notes now in `docs/research/tools/` (`t1`-`t10`, `deep/d01`-`d12`, copied unchanged), `CLAUDE.md`, `docs/ARCHITECTURE.md` (principle 7, operator tiers), and a survey of every app in `public/apps/` (31 registered apps plus their subfolders). No code was changed.

How the survey was done: for each app I read the header contract, the tab list, every `ctx.act` label (these are the player's actions and their hour costs) and the engine files that decide outcomes, and grepped for named real tools. "Full" means the key founder workflow can be practised at roughly real fidelity with an outcome that depends on player skill. "Partial" means part of the workflow exists, or it exists without the failure modes or decisions that make it teach. "Missing" means no counterpart. File paths are relative to `public/apps/` unless they start with `core/`. References such as "sales review S17" are finding ids in `docs/review/sales-network.md`.

## Key findings

1. **Coverage is strong where the money and the customer are, and thin where 2026 changed the most.** Money (Finance 81%), Analytics (87%) and Support/CS, Legal/HR and Fundraising (75% each) are close to real tools. Product/Eng (45%), Ops/Productivity (25%) and AI agents (10%) are the weak spots.
2. **The biggest absence is the founder's own AI assistant layer.** Claude and ChatGPT are the most-adopted tools in the 2026 stack (T8, Torii June 2026), and AI agents (Lindy, Superhuman AI, scheduled tasks) are where founders now recover 2-4 hours a week (D12). The sim has AI as a judge and as a hireable seat, but not as a tool the player must configure, audit and govern.
3. **Three whole functions that every SaaS founder touches weekly have no app**: lifecycle email (welcome, trial-ending, dunning, win-back; T2, D08), meeting notes pushed to the CRM (D04) and spend management with receipts (D11).
4. **Several existing apps model the outcome without the workflow**: cancel flows (one toggle, fixed 20% save), AI support (a switch and a percentage), SOC 2 (a progress bar), prospecting (no database, credits or enrichment), AI coding (a velocity multiplier with no plan/review/test decisions). These are where operator tiers cannot currently separate, because there is nothing to do well.
5. **Where we are better than the real tools** (section 3): buying committees and procurement, Mom Test grading, the spec grader, reported-vs-actual ROAS, investor rubric panel, founder energy. Keep nearly all of them.

## Coverage summary (counts by function)

| Function | Rows | Full | Partial | Missing | Coverage (full + half of partial) |
|---|---|---|---|---|---|
| Sales | 14 | 6 | 5 | 3 | 60% |
| Marketing | 12 | 4 | 5 | 3 | 54% |
| Product/Eng | 12 | 3 | 5 | 4 | 45% |
| Analytics | 4 | 3 | 1 | 0 | 87% |
| Support/CS | 8 | 5 | 2 | 1 | 75% |
| Finance | 11 | 7 | 4 | 0 | 81% |
| Legal/HR/Compliance | 12 | 7 | 4 | 1 | 75% |
| Fundraising | 8 | 5 | 2 | 1 | 75% |
| Ops/Productivity | 6 | 0 | 3 | 3 | 25% |
| AI agents | 5 | 0 | 1 | 4 | 10% |
| **Total** | 92 | 40 | 32 | 20 | 60% |

Reading the table: "Coverage" weights partial as half. The Automations app (row O5) is counted as missing because it is not merged yet; it is excluded from the build list. Without it the totals are 40 full / 32 partial / 19 missing out of 91.

## 1. Coverage matrix

Columns: function, real tool(s), the key workflow a founder does weekly, our app and feature (file), coverage, what is missing concretely. The first column is a row id used elsewhere in this document.

| ID | Function | Real tool(s) | Key workflow | Our app and feature (file) | Coverage | What's missing |
|---|---|---|---|---|---|---|
| S1 | Sales | HubSpot (31% of startups, Zero Aug 2026), Attio, Pipedrive | Add companies and contacts, move deals through stages, log activity, set the next step | CRM (`crm.js`, `sales/model.js`): companies, contacts, kanban of buyer-action stages, activity timeline, tasks, "deals without a dated next step" list, inbound triage tab (`sales/crm-api.js addInboundLead`) | full | Custom properties and objects, saved views, dedupe against suppression list. Email/calendar sync is moot because all mail is in-app, but "selective contact creation" noise (Attio) is not modelled |
| S2 | Sales | Apollo (credits, ~88% US email accuracy), Clay (waterfall, Claygent), Sales Navigator | Filter by ICP, reveal emails/phones with credits, waterfall providers, AI research column, CSV import and verify | CRM add-prospect, CSV import with column mapping and verification (`crm.js`, `sales/csv.js`), account research from the real website (`crm.js`), Sales Nav cost (`sales/params.js`) | partial | No searchable lead database (founder must already know the people), no credits or plan meter, no waterfall, no match-rate or bounce-by-source learning, no AI research column |
| S3 | Sales | Clay signals, Apollo intent, job-change alerts | Monitor job changes, hiring, funding and news; start outreach on a trigger | Company research hypotheses only (`crm.js`) | missing | Signals feed, signal-based first lines, false-positive signals (D02) |
| S4 | Sales | Instantly, Smartlead, Apollo sequences | Secondary domains, SPF/DKIM/DMARC, mailboxes, warmup, caps, multi-step sequences, A/B, placement test | Outreach (`outreach.js`, `sales/deliverability.js`): domains, auth, inboxes, warmup ramp, ~30/inbox cap, sequences, placement test, reply-not-open metrics | full | Mailbox health-score screen, per-step A/B variants, cross-sequence suppression and cool-down (sales review S20) |
| S5 | Sales | Instantly Unibox and AI Reply Agent (5 credits per reply), Smartlead AI categories | Triage replies by label (interested, OOO, wrong person, objection), draft or autopilot, escalate | Replies arrive as Mail threads answered by a persona (`mail.js`, `reply:` jobs); no unified reply inbox | missing | Reply inbox with categories, category prompts tested on sample replies, autopilot vs review, credit ledger, misclassification failure mode |
| S6 | Sales | Sales Navigator, Lemlist, La Growth Machine | Connection notes and DMs, weekly caps | Outreach LinkedIn tab (`outreach.js`) | full | Note cap on free accounts and profile-view throttling (sales review S21) |
| S7 | Sales | 11x Alice, Artisan Ava, AiSDR, Apollo AI Assistant | Define ICP, review the approval queue of drafts, watch meetings and deliverability, cancel before the annual lock-in | Outreach AI SDR tab (`outreach.js`), AI SDR seats in `people/catalog.js` (sdr_11x, sdr_artisan) | partial | No draft approval queue (the main quality-control step, D03), no per-contact credits, no annual contract commitment or early-cohort churn story |
| S8 | Sales | Gong, Chorus | Run discovery, get scorecard, MEDDICC coverage | Calls (`calls.js`): live persona chat on the real prospect website, Gong-style scorecard, Mom Test violations | full | Founder's own recorded calls are out of scope |
| S9 | Sales | Granola, Fathom (free), Fireflies | Auto notes, action items, push fields to HubSpot/Attio, pre-call brief | `calls.js` charges "Post-call notes" hours; scorecard only | missing | Summary and action-item artifact, template choice, CRM field write-back (review vs auto-share), pre-call brief, wrong-speaker and invented-next-step failures (D04) |
| S10 | Sales | Calendly, Cal.com, SavvyCal | Event types, availability, buffers, routing forms, reschedule links | Calendar booking link (`calendar.js`), automatic reminders (`calls.js`) | partial | Multiple event types, buffers, qualifying/routing form, prospect-side reschedule and time zones (sales review S22) |
| S11 | Sales | PandaDoc, HubSpot Quotes, DocuSign | Quote with line items and discount, send, track views, e-sign | CRM proposal/pilot stages and "contract sent / redlines" (`crm.js`), redlines (`legal/sim.js`), e-sign tool cost (`legal/catalog.js`) | partial | No quote artifact (line items, validity, terms), no view tracking, no signature step before closed-won (sales review S17), no discount-approval flow |
| S12 | Sales | HubSpot forecasts, Gong deal and forecast boards | Weekly pipeline review, forecast categories, stage conversion, cycle length | CRM stat tiles: open ACV, weighted pipeline, win rate (`crm.js`) | partial | Forecast categories (commit/best case), stage-to-stage conversion, cycle and cost-per-meeting reports, stale-deal alerts, review ritual |
| S13 | Sales | MEDDPICC, Salesforce, procurement portals | Multi-thread a buying committee, security review, RFP, paperwork | `sales/segments.js`, `crm.js` buying process, `success.js` procurement asks | full | Exceeds the real tools; no gap |
| S14 | Sales | Cold calling, direct mail | Call lists, scripts, mail drops | `channels.js` cold calling and direct-mail tabs | full | None material |
| M1 | Marketing | Framer, Webflow, Carrd | Edit sections, publish to a domain, SEO fields, CMS | Website (`website.js`): fetch a real URL or upload HTML, persona panel sets landing conversion | partial | No builder, publish, page tree, CMS, SEO fields, mobile preview or page-speed check; edits happen outside the sim |
| M2 | Marketing | VWO, Convert, Framer variants | Variant, traffic split, goal event, significance | A/B only for prices (`pricing.js`, `channels/stats.js`) | missing | Landing-page variant tests and the low-traffic power trap (T2 section 5) |
| M3 | Marketing | Ahrefs, Semrush, Google Search Console | Keyword research, position tracking, query/CTR report | Organic content tab (`organic.js`, `growth/organicEngine.js`): write articles, judged, visits ramp | partial | No keyword research or difficulty, GSC-style query table, backlinks, content-gap or rank decay |
| M4 | Marketing | Otterly ($29), Peec, Profound | Track prompts across engines, share of voice, cited URLs | AI-search prompts and answer check (`channels.js` AI tab), LLM-cited flag (`organic.js`) | partial | Time series of share of voice per engine, citation table, sample-size noise, AI-referred signups panel |
| M5 | Marketing | Typefully, Buffer, Hypefury | Draft threads, queue and calendar, per-post analytics | Build-in-public posts judged (`organic.js`) | partial | Queue, cadence consistency, multi-channel adaptation, per-post analytics, voice drift of AI drafts |
| M6 | Marketing | Loops, Customer.io, Kit, Resend/Postmark (transactional) | Event-triggered welcome/activation/trial-ending/dunning/win-back flows, segments, broadcasts, DNS and logs | None (Outreach is cold only; Stripe has a dunning-email toggle, `stripe.js`) | missing | The whole function: activation event, flows, segments, complaint and unsubscribe, shared-quota transactional risk, delivery logs |
| M7 | Marketing | Beehiiv, Kit, Substack | Write issues, grow an owned list, sell sponsorships | Newsletter sponsorship buying only (`organic.js`) | missing | Owned newsletter, cadence, growth loops, selling ads |
| M8 | Marketing | Meta Ads Manager (Advantage+), Google PMax/AI Max, TikTok, LinkedIn, Apple Search Ads | Campaigns, creative testing, budgets, learning phase, cohort truth vs reported ROAS | Ads Manager (`ads.js`, `growth/*`): five platforms, creative library judged by a panel, cohorts and truth tab | full | Google AI Max auto-expansion detail; tracking-break failures |
| M9 | Marketing | Billo, Insense, Arcads, HeyGen | Brief a creator or AI avatar, review draft, approve | UGC creator marketplace (`ads.js`) | partial | AI-avatar option (cheap, uncanny, claim rejections), revision loop |
| M10 | Marketing | Rewardful, FirstPromoter, Tolt, PartnerStack, AppSumo, G2, marketplaces, PR | Commission rules, approvals, listings, pitches, reviews | Channels (`channels.js`, 15 tabs, `data/channels.js`) | full | MCP-server-as-product listing depth |
| M11 | Marketing | Product Hunt, Reddit, communities, personal network launch | Prepare assets, launch sequence, reply to comments | Organic (`organic.js`): network launch, PH, communities, referral, newsletters | full | None material |
| M12 | Marketing | Crayon-style monitors, Google alerts | Watch competitors and market moves, write battlecards | Market (`market.js`, `marketworld/*`): real competitive set, simulated moves, battlecards | full | Page-diff monitor that the Assistant could run (see build item 1) |
| P1 | Product/Eng | Linear, Notion, RICE | Write a testable spec, prioritise | Product spec grader with genericity blocker (`product.js`, `product/spec.js`) | full | None |
| P2 | Product/Eng | Linear (Triage Intelligence, cycles), GitHub Issues | Triage inbox, duplicates, cycles, roadmap, customer requests | Build queue, bugs/tech debt, changelog (`product.js`) | partial | Triage inbox with duplicates, cycles and roadmap view, request counts linked to issues |
| P3 | Product/Eng | Claude Code, Cursor (+ Bugbot), Codex | Plan, agent build, review diff, tests, PR, automated review | Build sessions and velocity model (`product.js`, `product/build.js`), agent seats (`people/catalog.js`) | partial | Plan mode vs one-shot, permission modes, diff-review depth, tests, usage windows and overage bills, secrets in prompts, tests-written-by-agent trap |
| P4 | Product/Eng | Lovable, Bolt, v0, Replit Agent | Prompt-to-app, Supabase and RLS, publish, export | None | missing | Non-technical-founder path: credits, RLS and secret exposure, lock-in, rebuild decision (D07) |
| P5 | Product/Eng | Vercel, Railway, Supabase, Sentry | Deploy, roll back, env vars, error triage, hosting cost | Hosting appears as a recurring bill (`bank.js` catalog); incidents are random events (`insights.js`) | missing | Deployments, rollback, error issue list with events and releases, hosting scale costs |
| P6 | Product/Eng | Better Stack, Instatus, Statuspage; MFA, key rotation | Uptime alerts, status page, security hygiene, backups | Insights Ops tab (`insights.js`): paging, status page, MFA, secret scanning, restore test, spend caps, incident log | full | None |
| P7 | Product/Eng | PostHog feature flags and experiments | Rollout %, cohort rules, experiment with significance | None | missing | Flags, experiments, peeking and exposure-bias failures (D06) |
| P8 | Product/Eng | PostHog replay, FullStory | Watch drop-off sessions, AI summary | None | missing | Replays, rage clicks, AI summaries and credits |
| P9 | Product/Eng | Canny, Featurebase, Linear customer requests | Merge duplicates, status, notify voters when shipped | Customer feedback inbox (`customers.js`), changelog (`product.js`) | partial | Voting board, duplicate merge, status loop closure, MRR-weighted request counts |
| P10 | Product/Eng | Dovetail, Mom Test, Maze | Interviews, synthesis, insights board | Research (`research.js`): AI rehearsal, real interview log, graded transcripts, insights board | full | None |
| P11 | Product/Eng | Userflow, Appcues | Tours, checklists | Onboarding mode self/call/concierge (`customers.js`) | partial | In-app tours and checklists (MAU-priced, usually skipped pre-PMF) |
| P12 | Product/Eng | Langfuse, Braintrust, OpenRouter | Trace cost and latency per call, eval sets | Inference cost presets (`product.js`), AI credits margin check (`pricing.js`), COGS in Books | partial | Per-feature traces, model routing and caching decisions, evals |
| A1 | Analytics | PostHog, Mixpanel, Amplitude | Funnels, retention, event explorer | Insights (`insights.js`): activation funnel, feature adoption, retention by activation, explorer, funnel builder | full | identify() and ad-blocker data-loss failures (20-40%) |
| A2 | Analytics | ChartMogul, Baremetrics, Stripe Dashboard | MRR waterfall, cohorts, churn, CAC payback, weekly flags | Analytics (`analytics.js`): weekly dashboard with benchmark flags, MRR movements, cohorts, churn, CAC | full | Push digest to Slack/email (belongs to Automations) |
| A3 | Analytics | Metabase, HogQL | Ad-hoc SQL over subs, charges, events | Query builder (`analytics.js`) | full | None |
| A4 | Analytics | PostHog surveys, Delighted, Survicate | NPS/CSAT/PMF (Sean Ellis) with targeting | Churn survey and feedback (`customers.js`), CSAT (`helpdesk.js`) | partial | NPS, in-app survey targeting, PMF 40% test filtered to activated users |
| C1 | Support/CS | Help Scout, Front, Crisp, Zendesk | Triage shared inbox, macros, SLAs | Helpdesk (`helpdesk.js`, `support/*`): tickets from what you shipped and broke, priorities, SLAs, macros, CSAT, first-response to churn | full | None |
| C2 | Support/CS | Mintlify, GitBook, Intercom articles | Write docs from repeated questions | Help center articles (`helpdesk.js`) deflect tickets | full | Zero-result search queries report |
| C3 | Support/CS | Intercom Fin ($0.99), HubSpot Customer Agent ($0.50), Decagon, Sierra | Scope intents, procedures, test, handoff rules, review resolutions | AI agent toggle and resolution share (`helpdesk.js`, `support/model.js`, `people/catalog.js` support_ai): 30-55% y1, 8% confidently wrong, $0.99 billing | partial | No scope/procedure config, batch tests or simulations, escalation rules, repeat-contact metric, KB-gap queue, resolution-definition inflation (72h rule) |
| C4 | Support/CS | Plain, Pylon | B2B support from shared Slack channels with tiers and SLAs | None | missing | Per-tier SLAs, channel threads, bug-to-issue link (B2B ent only) |
| C5 | Support/CS | Churnkey, ProsperStack, Stripe cancel flow | Reason survey, matched offer, pause, A/B, save rate | One retention-offer toggle with fixed 20% save (`stripe.js` RETENTION_SAVE) | partial | Reason-specific offers, pause wall, segments, A/B, save rate by reason, saved-customer retention, dark-pattern risk |
| C6 | Support/CS | Stripe Smart Retries, Churnkey dunning | Retries, dunning emails, card-expiry emails | Billing settings and Revenue recovery (`stripe.js`, `core/stripe.js`) | full | Custom email sequence content (build item 4) |
| C7 | Support/CS | Vitally, Planhat, Gainsight | Health scores, renewals, QBRs, expansion | Customer success (`success.js`, `success/engine.js`) for B2B CRM accounts | full | No self-serve health list for B2C/SMB-monthly accounts (usage-based at-risk list) |
| C8 | Support/CS | G2, Capterra, Trustpilot, App Store | Ask for reviews, reply to bad ones, FTC rule | Reviews tab (`helpdesk.js`) | full | None |
| F1 | Finance | Mercury, Relay (+ Treasury) | Accounts, ACH/wire, statements, sweep idle cash | Bank (`bank.js`, `core/bank.js`): ledger, payees, statements, Treasury tiers, pre-incorporation personal account | full | None |
| F2 | Finance | Ramp (Free/Plus $15), Brex (Essentials $0) | Virtual cards, receipt capture by SMS/email, memos, approvals, policy | One debit-style card with spend by vendor and cashback (`bank.js` Cards) | partial | Multiple cards and limits, receipts and missing-receipt locks, memos, approvals, policy and AI categorization (D11) |
| F3 | Finance | Mercury bill pay, BILL, Ramp bill pay | Bill inbox, approval, schedule, duplicate check | Send money to payees, W-9 collection (`bank.js`) | partial | Bill inbox, due dates, approval chain, duplicate detection |
| F4 | Finance | Torii, Ramp, Cledara-style audits | List every subscription, unused seats, renewals, overlap | Recurring bills with add/cancel from a tool catalog and decline/suspend logic (`bank.js`) | partial | Seats vs active users, overlapping tools, renewal calendar, trial-to-paid traps |
| F5 | Finance | Stripe Billing, Checkout, Paddle/Lemon Squeezy/Polar (MoR) | Products, prices, coupons, disputes, payouts, MoR fee math | Payments (`stripe.js`, `core/stripe.js`): all of these plus grandfathering and price migration | full | None |
| F6 | Finance | Stripe invoices, Mercury invoicing | Invoice, net terms, reminders, AR aging | Invoices and AR view (`stripe.js`) | full | None |
| F7 | Finance | Stripe Tax, Anrok, Numeral; VAT OSS | Nexus, registration, filing calendar | Tax & compliance (`books.js`, `money/compliance.js`) | full | None |
| F8 | Finance | Pilot, Digits, Puzzle, Kick, QuickBooks | Review AI categories, reconcile, monthly close, deferred revenue | Books (`books.js`, `money/ledger.js`): feed review with confidence, services with error rates, close checklist, P&L/BS tie-outs | full | None |
| F9 | Finance | Gusto, Rippling | Run payroll, taxes, 1099s | People Payroll tab (`people.js`, `people/payroll.js`) | full | None |
| F10 | Finance | cfo.ai (ex-Runway), Fathom, spreadsheets | 13-week cash forecast, scenarios, hiring plan, budget vs actual | Runway widget with debt service (`bank.js`), fundraising metrics sheet (`fundraising/metrics.js`) | partial | Scenario planner, hiring-plan toggle, forecast vs actual error, trigger rules (raise at 9 months) |
| F11 | Finance | Stripe Capital, Lighter, Pipe, SBA, HELOC | Compare financing offers | Financing (`financing.js`), RBF/grants (`fundraising.js`) | full | None |
| L1 | Legal/HR/Compliance | Stripe Atlas, Clerky, Doola | Incorporate, founder stock, 83(b), IP assignment | Legal Entity and Founder docs (`legal.js`, `legal/sim.js`) | full | None |
| L2 | Legal/HR/Compliance | Carta, Pulley, 409A | Grants, vesting, pool, round modelling | Cap table (`fundraising/captable.js`), equity/409A (`people.js`) | full | None |
| L3 | Legal/HR/Compliance | Termly, iubenda, Common Paper DPA | Policies, GDPR/CCPA, DPA, data-subject requests | Privacy tab (`legal.js`) | full | None |
| L4 | Legal/HR/Compliance | Common Paper, DocuSign, Spellbook | Templates, e-sign, redline a counterparty draft | Contracts and redlines from customers (`legal.js`, `legal/redlines.js`) | partial | Upload a counterparty draft, clause risk flags, NDA/MSA generator, signature tracking |
| L5 | Legal/HR/Compliance | Vanta, Drata, Secureframe | Connect integrations, triage failing tests, personnel tasks, evidence, auditor | SOC 2 section (`legal.js`, `legal/api.js soc2Status`) | partial | Integration phases, failing-test triage, personnel tasks, evidence, auditor request list, Trust Center |
| L6 | Legal/HR/Compliance | Vanta AI, Drata AI questionnaires | Upload questionnaire, AI drafts, approve each | Security questionnaire asks (`success.js`, `crm.js`) | partial | Answer library, AI draft with approval, quota, stale-KB failure |
| L7 | Legal/HR/Compliance | USPTO, EU AI Act timeline | Knockout search, filing, AI Act duties | Trademark and AI Act tabs (`legal.js`) | full | None |
| L8 | Legal/HR/Compliance | Ashby, Workable, Wellfound | Job post, sourcing, screen, scorecard interviews, offer | People hiring (`people.js`, `people/*`): LLM candidate interviews on the calendar, assessments, offers | full | None |
| L9 | Legal/HR/Compliance | Ashby AI criteria, Workable AI | Criteria per job, bulk evaluation, EEO validation, opt-outs | Manual screening and assessments (`people/assess.js`) | partial | Criteria evaluation with credits, EEO warnings, opt-out candidates |
| L10 | Legal/HR/Compliance | Checkr, Certn | Consent, report, FCRA adverse action | None | missing | Whole flow |
| L11 | Legal/HR/Compliance | Deel, Remote, Justworks; offboarding | Contractors, EOR, benefits, performance, severance | People (`people.js`, `people/performance.js`) | full | None |
| L12 | Legal/HR/Compliance | YC Co-Founder Matching | Search, trial project, equity split | Co-founder app (`cofounder.js`, `cofounder/*`) | full | None |
| R1 | Fundraising | Signal, OpenVC, Foundersuite, Visible | Target list, kanban pipeline, activity log | Investor CRM (`fundraising.js`, `fundraising/investors.js`, `view-crm.js`) | full | None |
| R2 | Fundraising | Foundersuite Get Intro, Signal Gmail link | Show the intro path through your contacts | Intros tab (`messages.js`), warm flag in the CRM | partial | Intro-path graph per target investor, double opt-in forwardable, delay and decline |
| R3 | Fundraising | DocSend, Papermark | Tracked link, per-page time, NDA gate, data room folders | Profile and data room with deck/LinkedIn upload and panel (`fundraising.js`, `view-profile.js`) | partial | Shareable tracked links, viewer log, folders and permissions, "views are not intent" lesson |
| R4 | Fundraising | Pitch practice, investor calls | Pitch to AI partner personas with a research rubric | Investor panel and live meetings (`fundraising/rubric.js`, `view-eval.js`) | full | None |
| R5 | Fundraising | YC SAFE, Carta | SAFE/priced modelling, dilution, closing | Rounds and instruments, dilution modeler (`fundraising/instruments.js`, `view-rounds.js`) | full | None |
| R6 | Fundraising | Visible, email | Monthly update, board prep, bad news | Investor relations (`fundraising/ir.js`, `view-ir.js`) | full | None |
| R7 | Fundraising | AngelList, Allocations | Set up SPV, LP commitments, fees | Syndicate leads exist only as investor archetypes (`fundraising/investors.js`) | missing | Running an SPV ($8k + $2k state, $80k min, 20% carry) |
| R8 | Fundraising | YC, SBIR, Acquire.com, Flippa | Applications, grants, exits | Accelerators, grants, exit marketplace (`fundraising/sim.js`, `view-exit.js`) | full | None |
| O1 | Ops/Productivity | Gmail, Superhuman (Split Inbox, AI) | Triage, snooze, send later, follow-up reminders, AI drafts | Mail (`mail.js`, `core/mail.js`): threads answered by personas | partial | Splits/labels, snooze, send later, follow-up reminders, AI drafts, misfile failure |
| O2 | Ops/Productivity | Google Calendar, Reclaim ($10-15), Motion ($19-29) | Focus blocks, habits, auto-scheduling tasks, booking | Calendar (`calendar.js`, `core/calendar.js`): week view, Join links, focus blocks, work hours, booking link | partial | Task auto-scheduling, habits, meeting-load report, thrash and over-blocking failures |
| O3 | Ops/Productivity | Notion, Linear, OKR sheets | Weekly plan, priorities tied to goals | Home next-steps and goal (`home.js`) | partial | Weekly plan, OKR key results with auto progress, Friday review, planned vs done |
| O4 | Ops/Productivity | Slack, Discord, Notion wiki | Team chat, docs, notes | None (messages are network DMs, `messages.js`) | missing | Low value for 0-3 person teams; defer |
| O5 | Ops/Productivity | Zapier, Make, n8n | Trigger and action workflows, run logs | Being built by another agent | missing | Excluded from the build list; see the exposure section |
| O6 | Ops/Productivity | 1Password, Bitwarden | Shared vault, offboarding revocation, 2FA | MFA checklist flag only (`insights.js`) | missing | Shared-credential incidents; low value |
| G1 | AI agents | Claude (Projects, connectors, Cowork, scheduled tasks), ChatGPT Work | Connect tools, run tasks with sources, review, schedule | Settings configures AI judges only (`settings.js`) | missing | The most-adopted 2026 tool (Claude 89%, ChatGPT 85% org adoption, Torii June 2026) has no counterpart |
| G2 | AI agents | Claude scheduled tasks, ChatGPT tasks | Weekly report, competitor page diff, digest | None | missing | Scheduled runs with run log and stale-auth failure |
| G3 | AI agents | Lindy, Superhuman AI | Email triage and calendar agents with preview runs | None | missing | Preview-on-10 audit, misclassification, credit pool |
| G4 | AI agents | Approval modes, preview runs, run logs, credit caps | Govern agents against wrong sends and prompt injection | None | missing | Governance skills (D12 cross-cutting) |
| G5 | AI agents | MCP servers, ChatGPT apps, Claude connectors (Postiz, Apollo) | Ship an MCP/agent interface as a growth channel | Directory listing in `channels.js`; no "build an MCP server" feature in Product | partial | Agent-readable product surface as a spec/feature with a distribution effect |

## 2. Prioritized build list (top 25)

How to read this. Citations: `T1`–`T10` are `docs/research/tools/t*.md` and `D01`–`D12` are `docs/research/tools/deep/d*.md` (section numbers follow each note). `O1`–`O5` are `docs/research/operators/o*.md` (operator-tier notes written in parallel, still untracked; use them for tier spreads, and re-check once merged). Anything marked [design] is a game estimate, not a measured statistic, and the UI must label it that way (ARCHITECTURE principle 3). Hours are founder hours in sim time.

Ranking score = how often real founders do it (F) x how much practising it teaches (T) x how much it automates or simplifies work (A), each 1-5. Ties are broken by how much the missing piece distorts the existing sim.

| Rank | Workflow | Target app | F | T | A | Score |
|---|---|---|---|---|---|---|
| 1 | Founder AI assistant with connectors and scheduled tasks | New app `assistant` | 5 | 4 | 5 | 100 |
| 2 | Prospect database, enrichment waterfall and signals | CRM (new Prospects tab) | 4 | 5 | 4 | 80 |
| 3 | Lifecycle email (welcome, activation, trial-ending, win-back) | New app `lifecycle` | 4 | 4 | 4 | 64 |
| 4 | AI-coding workflow: plan, permissions, review, tests, limits | Product | 5 | 4 | 3 | 60 |
| 5 | Meeting notetaker to CRM | Calls + CRM | 4 | 3 | 5 | 60 |
| 6 | Cards, receipts, approvals and SaaS-stack audit | Bank | 5 | 4 | 3 | 60 |
| 7 | Cancel-flow and retention builder | Stripe app | 4 | 4 | 3 | 48 |
| 8 | Reply inbox and AI reply agent | Outreach | 3 | 4 | 4 | 48 |
| 9 | AI support agent: scope, tests, handoff, review | Helpdesk | 3 | 4 | 4 | 48 |
| 10 | Runway and cash-forecast scenario planner | Bank + Books | 4 | 4 | 3 | 48 |
| 11 | Compliance automation and AI security questionnaires | Legal + Success | 3 | 4 | 4 | 48 |
| 12 | AI inbox triage and follow-up reminders | Mail | 4 | 3 | 4 | 48 |
| 13 | Vibe-coding builder path for non-technical founders | Product | 3 | 4 | 4 | 48 |
| 14 | Deploys, error tracking and rollback | Product (Releases tab) | 4 | 3 | 3 | 36 |
| 15 | Session replay and NPS/PMF surveys | Insights | 3 | 4 | 3 | 36 |
| 16 | Quotes, proposals and e-sign | CRM | 3 | 3 | 4 | 36 |
| 17 | Feature flags and experiments | Insights | 3 | 5 | 2 | 30 |
| 18 | Weekly plan, OKRs and AI time-blocking | Home + Calendar | 4 | 2 | 3 | 24 |
| 19 | Pipeline review and forecast reports | CRM | 4 | 3 | 2 | 24 |
| 20 | Landing-page builder and A/B variants | Website | 3 | 4 | 2 | 24 |
| 21 | Social scheduler and per-post analytics | Organic | 4 | 2 | 3 | 24 |
| 22 | Feedback board and request-to-changelog loop | Customers + Product | 3 | 3 | 2 | 18 |
| 23 | Keyword research, Search Console view, AI-visibility tracker | Organic | 3 | 3 | 2 | 18 |
| 24 | Tracked deck links, data room, intro-path finder | Fundraising | 3 | 3 | 2 | 18 |
| 25 | Background checks and AI application criteria | People | 2 | 3 | 3 | 18 |

Not on the list, deliberately: the Automations app (another agent), B2B Slack-channel support (Plain/Pylon, narrow to ent-model founders), SPV setup (rare below Series A), team chat, wiki/notes, password vault (low practice value for 0-3 person teams), auth providers.

Test requirement for every item (CLAUDE.md, principle 7): add a test that runs the four operator profiles below over 20-30 seeds on the named separation metric and asserts stellar > good > average > mediocre with the stated rough gap, and that no profile is reachable by volume or keyword stuffing alone.

### 1. Founder AI assistant (Claude / ChatGPT Work style), new app `assistant`

**Why first.** Claude and ChatGPT are the most-adopted tools in the whole stack (Claude 89%, ChatGPT 85% organisation adoption, Torii June 2026; T8 section 1, section 4), yet the sim has no counterpart. It is also where founders now do reporting, research, drafting and cleanup, so delegating with oversight is the core 2026 skill.

- **Player workflow.**
  1. Open Assistant, tab **Connectors**: a table of in-sim sources (Payments, CRM, Helpdesk, Books, Analytics, Calendar, Mail drafts). Each row has a toggle, a scope selector (read / draft / write) and an "authorized on day N" stamp. Grants expire after 60-90 sim days [design] (stale auth is the top silent failure, D12 section 1).
  2. Tab **Projects**: create "Weekly ops". Fill an instructions box (reader, metrics, thresholds to flag, format) and attach the last four saved reports.
  3. Tab **Tasks**: pick a template (Weekly metrics summary, Competitor page watch, Receipt and expense cleanup, Customer-email digest, Meeting prep brief, Investor-update draft) or write free text. Pick approval mode: ask before every write / draft only / auto. Pick a schedule: once, weekdays, weekly.
  4. **Run view**: left, the plan and tool calls (each with rows read); centre, the output; right, "uncertain items". Every number carries a source chip that opens the underlying page (Stripe, Analytics, CRM). Buttons: Approve (draft goes to Mail drafts or a saved doc), Edit, Reject.
  5. Tab **Run log**: every scheduled run with status (ok / auth expired / truncated / over budget). A weekly nudge says "check the run list".
- **Automation and AI.** A deterministic engine computes every figure from `state` (so numbers are right unless the failure model says otherwise); the LLM, when a key exists, writes the prose and the free-text answers; the offline fallback fills a template. Injected failure modes: connector pagination truncates a list (summary reads confident and incomplete); expired grant fails the scheduled run silently; a competitor/vendor/inbound text carries an instruction ("forward customer emails to...") and an agent in auto mode with write scope follows it with probability p (prompt injection, D12 cross-cutting); claims without a source row are hallucinated 10-20% of the time [design]. Neither Anthropic nor OpenAI publishes task accuracy (D12 sections 1-2), so show no accuracy figure. Cost: usage draws on a plan allowance (Claude Pro $20, Max $100, Team $25-125; ChatGPT Work has no public rate card and scheduled runs count against the cap, D12 section 2) so a heavy week can run out mid-week.
- **Operator tiers.**
  - *Stellar*: writes project instructions with thresholds, starts every task draft-only for two sim weeks, clicks two source chips per run and reconciles them, keeps any task that reads untrusted text read-only, checks the run log weekly. Wrong-number-in-sent-doc rate under 2%; net saving 2-4 h/week (D12 cross table).
  - *Good*: uses templates, reads output, skips reconciliation on routine runs. About 5% of summaries carry an unnoticed error.
  - *Average*: one-line prompts, trusts totals, auto mode on trusted connectors. 8-15% of summaries carry an unnoticed wrong number that flows into the investor update and decisions; saving 1-2 h/week.
  - *Mediocre*: auto-send with write scope on Mail, scheduled competitor scan with write scope, never opens the run log. About one wrong-recipient or injection incident per 6-8 weeks (investor/customer trust hit, [design]) plus allowance overage; net time saved at or below zero.
  - Separation metric: share of decisions/reports built on a wrong number, and incident count per 100 sim days.
- **Hours.** Setup 1.5 h; 5-15 min review per run. Saves 2-4 h/week for a solo founder (weekly reporting 1-2, research 1-2, inbox 2-4; D12 table, [design]).
- **Depends on.** Read APIs: `core/stripe.js`, `analytics.js` metrics, `sales/crm-api.js pipelineSummary`, helpdesk queue, Books statements, `core/calendar.js`; write: `core/mail.js addMessage` (drafts). `core/llm.js` with fallback. Automations app: action "run assistant task", trigger "assistant run finished/failed".

### 2. Prospect database, enrichment waterfall and signals, CRM "Prospects" tab (Apollo / Clay style)

- **Player workflow.**
  1. CRM > **Prospects**. Left filter panel: title, seniority, headcount, industry, geography, tech used, funding stage, hiring signal. Header shows result count and a credit meter for the chosen plan (Free / Apollo Basic ~$49 / Pro ~$79; Clay Launch ~$167-185 with 2,500 Data Credits and 15,000 Actions; D02 Parts A and B, T1).
  2. Result rows show masked emails and an "accuracy" hint. Select rows, click **Reveal** (email 1 credit, phone ~8 credits [unverified, D02]).
  3. Optional **Waterfall**: ordered provider list (A then B then C), toggles per provider, "run on 5 rows first" button, credit estimate before confirm; misses cost nothing (Clay).
  4. Optional **AI research column**: write a prompt ("does this company hire SDRs? yes/no/unknown plus one-line reason"), model reads the real company website via `/api/site`, returns an answer with a confidence dot; costs 1-10 credits per row.
  5. Tab **Signals**: monitor job change, hiring, funding, news at daily/weekly/monthly cadence (credits per result). A signal writes a note and suggests a first line.
  6. Save as list, verify, then enroll into a sequence (Outreach).
- **Automation and AI.** Prospect pool is generated deterministically from the player's ICP and seed, and can be mixed with real CSV rows (existing import). Data truth model: US email accuracy about 88%, international about 60-73% [unverified, D02 section 6]; unverified exports reported at 15-25% bounce [unverified]; stop-and-inspect threshold 5% bounce (Clay's own guidance, D02 Part A section 3). Signal false positives (board/advisor roles read as job changes) are modelled at a small rate. Failure modes: credit burn on long prompts over thousands of rows, stale data, plan gates (phone and signals are paid), credits expire monthly (Apollo).
- **Operator tiers (O1 section 1).**
  - *Stellar*: 3-5 filters including a trigger, one-line "why this account" per row, 5-row test before any run, verifies, keeps 50-150 accounts per week, drops failures. Positive-reply rate 2-3x broad lists at equal volume [design]; bounce under 2%.
  - *Good*: firmographics plus enrichment plus verify, monthly refresh.
  - *Average*: title and size only, exports 1,000+, sends to all.
  - *Mediocre*: bulk export of 5,000 unverified, waterfall on every row. Bounce 15-25%, domain reputation burnt (existing deliverability model), credits wasted.
  - Separation metric: positive replies per 100 sends and domain reputation after 30 days.
- **Hours.** 30-60 min per 100-account list. Replaces 6-10 h/week of manual research and enrichment for ~200 leads (D02 section 5, [design]); net saving 4-8 h/week for outbound founders.
- **Depends on.** `sales/model.js addContact/upsertCompany`, `/api/site` research, Outreach enrollment and `sales/deliverability.js`, bank recurring bill for the subscription, `sales/params.js`. Fix sales review S6 (bounce re-roll per step) first or list-quality effects will be masked.

### 3. Lifecycle email, new app `lifecycle` (Loops / Customer.io / Kit style)

- **Player workflow.**
  1. **Setup**: sender domain and DNS checks (same SPF/DKIM/DMARC factors as Outreach). Free tier 1,000 contacts / 4,000 sends shared with transactional mail; Growth $49 at 5,000 contacts (Loops, D08 section 1); Customer.io starts $100 at 5,000 profiles (D08 section 2).
  2. **Activation event**: pick the one Insights event that predicts retention (required before any flow can use a goal).
  3. **Flows** (vertical node list): trigger (signup, trial start, Stripe `trial_will_end` at T-3, `payment_failed`, cancellation, "not activated by day N") then email node (subject/body with merge fields, "AI draft" button), delay, branch ("has activated?"), goal/exit. Templates: welcome (T+0, +1, +3, +7), activation nudges, trial-ending (T-7, T-3, T-1), dunning (day 0, 3, 7), win-back (day 0, 7, 30, 60, 90) (D08 section 6).
  4. **Segments and broadcasts**: attribute/event filters, A/B subject, schedule.
  5. **Stats per node**: sent, delivered, opened (flagged "inflated by Apple Mail Privacy Protection, 10-15% in B2B"), clicked, unsubscribed, complained, activations/conversions attributed.
- **Automation and AI.** Flows are deterministic multipliers on activation, trial conversion, dunning recovery and win-back reactivation, calibrated to D08 section 6: trial-to-paid opt-in 8.9-18.5% median vs opt-out about 31% (existing market model); trial drip lift "22%" is a single-vendor claim [unverified], so use +10-20% relative as [design]; dunning recovery 25-40% (Stripe's 55% is across all its tools); win-back 2-5% reactivation per campaign [design]; welcome opens above 50% and clicks above 20% are vendor figures [unverified]. AI drafts are generic by default and carry a "reads as AI" penalty unless edited. Failure modes: event never sent so the flow idles (the most common failure), shared quota blocks password resets when a broadcast runs, per-profile billing surprises, same drip to every intent, upsell to non-activated users.
- **Operator tiers (O2 section 6).**
  - *Stellar*: names the activation event, measures time-to-activation weekly, 4-6 behaviour-triggered emails with one action each, reads cohort activation monthly. Activation up 10-20 points in a quarter through flow fixes; trial conversion up ~15-25% relative [design].
  - *Good*: welcome sequence plus a few behaviour triggers, judges by clicks.
  - *Average*: generic newsletter, judges by opens; activation flat.
  - *Mediocre*: weekly blasts with discounts, "we miss you" to never-activated users. Unsubscribes and complaints rise, spam placement hits transactional mail, activation flat or lower.
  - Separation metric: activation rate and trial-to-paid after 90 sim days; complaint rate.
- **Hours.** Build 4-6 h (welcome 4-6 emails, trial-ending 3, dunning 3, win-back 3), then 1 h/week. Replaces hand-sending onboarding mail, 1-3 h/week saved (D08 section 1, [design]) plus the revenue lift.
- **Depends on.** `core/stripe.js` events, `insights.js` events and activation, `customers.js` onboarding mode, bank for the subscription. Automations: triggers (contact entered flow, goal reached) and actions (enrol contact, send broadcast).

### 4. AI-coding workflow realism, Product build sessions (Claude Code / Cursor / Codex)

- **Player workflow.** The build session dialog gains: tool seat (from People); **mode** (plan first, 30-60 min / one-shot); **permissions** (ask / auto-accept); **diff review** (read every diff / skim / none); **tests** (failing test first / agent-written / none); **PR size cap**; optional PR-review bot (Bugbot-style, advisory by default). A "feels faster" meter sits beside the measured velocity, reproducing the METR gap (perceived +20%, measured -19% in 2025; D07 section 2). A usage meter shows the 5-hour window and monthly allowance; overage can reach 3-10x the headline plan in a bad month (D07 section 4). Each session reports shipped hours, rework hours, diff size and a post-merge incident-risk score.
- **Automation and AI.** Keeps the existing velocity model (1.5-3x greenfield, 0.8-1.3x mature, ~15% rework, unreviewed bug rate +10-30%, `product/build.js`). Adds: tests written by the same agent pass without covering behaviour; secrets pasted into prompts or committed (breach-duty event via Insights Ops and Legal); destructive action under auto-accept against production (Replit July 2025, D07 section 5). Evidence for the mediocre end: DORA 2025 (throughput up, instability up), Faros March 2026 (incidents per PR +243%, bugs per PR +29%, review time +441%, vendor data, secondary; O3 section 3), Stack Overflow 2025 (66% say "almost right but not quite"; D07 section 2). METR's 2026 follow-up is closer to a small speedup with wide intervals, so show uncertainty, not a point value.
- **Operator tiers (O3 section 3).**
  - *Stellar*: spec and acceptance tests first, small PRs, reads every diff, failing test then pass. Defect rate near baseline (rework ~15%), sustained 1.5x greenfield speed.
  - *Good*: well-defined tasks, reviews diffs, runs tests; sometimes accepts large diffs.
  - *Average*: whole features at once, skims, ships when the demo works; rework 25-35%.
  - *Mediocre*: auto-accept, no tests. Ships 1.3-2x faster for 2-4 weeks, then bug rate +30%, incident chance x2-3, churn slope from the bug backlog (existing `churnPerBugHour`), plus a leaked-key event.
  - Separation metric: open bug hours and incidents at day 90, features shipped at day 30 vs day 90.
- **Hours.** Plan/test/review adds 20-40% founder hours per feature versus unreviewed. Net saving vs hand-coding 3-8 h/week on well-specified tasks, about zero on ambiguous ones (D07 section 3.1, [design]).
- **Depends on.** `product/build.js`, `people/capacity.js` seats, `insights.js` incidents and breach duty, bank category `ai_inference`.

### 5. Meeting notetaker to CRM, Calls + CRM (Granola / Fathom style)

- **Player workflow.**
  1. Calls > Settings: capture mode **bot joins** (Fathom-style, can reduce prospect comfort) or **bot-free local** (Granola-style); note template (sales discovery, MEDDICC, customer interview); toggle "auto-share to CRM" (off by default).
  2. After "End call and score", a **Notes** tab appears: summary, decisions, action items with owners, and **proposed CRM updates** (budget, timeline, champion, competitor, next step). Each proposal has a confidence dot and a link to the supporting transcript line.
  3. Founder clicks **Review and push** (2-5 min) or edits first. Pre-call brief for the next call appears from earlier notes.
  4. Free tier hides notes older than 30 days (Granola Basic); paid is $14/seat (Granola Business) or $15-34 (Fathom Team/Business, 2-user minimum) (D04).
- **Automation and AI.** Transcript quality 85-95% (about 87% on accents, jargon, overlap) [unverified, D04 section 4]; 5-10% of action items on noisy calls are wrong or unsupported [design, D04]; wrong record when the invite email differs from the CRM email (Granola documents this); mapped fields overwrite on every matching call (Fathom Business); links shared in chat are lost. Recording consent rules vary by state (one-party vs all-party) and the sim raises the notice when a bot is used. Post-call notes today charge extra hours in `calls.js`; the notetaker replaces that cost with review time.
- **Operator tiers.**
  - *Stellar*: reviews each proposed field against the transcript, pushes only agreed next steps, sends a recap within 24 h. Next-step capture accuracy near 98%; deal progression gets a small continuity bonus (+0.03-0.05 on call quality carry-over [design]).
  - *Good*: reviews the summary, skips the field check.
  - *Average*: pushes everything; about 7% of recorded next steps are wrong.
  - *Mediocre*: folder auto-share with no review, acts on an invented next step (sends the proposal at a wrong price or to a wrong contact). Close probability x0.8 on affected deals, one trust incident per ~20 calls [design].
  - Separation metric: wrong CRM fields per 20 calls and win rate of deals with notes.
- **Hours.** Post-call work 20-30 min becomes ~5 min; saves 2-4 h/week for a founder with 8-10 calls (D04 [design]).
- **Depends on.** `calls.js` transcript, `sales/model.js addActivity` and deal fields, calendar, `sales/scorecard.js`. Automations: trigger "notes ready", action "push notes".

### 6. Cards, receipts, approvals and SaaS-stack audit, Bank "Cards and spend" (Ramp / Brex style)

- **Player workflow.**
  1. Cards tab: **Issue card** (virtual, purpose, monthly limit, merchant lock). Today there is one debit-style card.
  2. Each card charge creates a **Needs receipt** task in a queue and a Mail notification. Founder attaches a receipt (some vendors auto-generate one, others must be found in Mail) and a memo. After 7 days a weekly reminder; after the threshold the card locks until fixed (Ramp behaviour, D11 section 2).
  3. **Policy**: category limits, blocked merchants, approval needed above $X. AI categorization suggests a GL category with confidence; it feeds the Books feed review queue.
  4. Tab **Stack audit**: one row per tool with cost, seats bought vs active (from People headcount), last used, renewal date and an overlap flag (two notetakers, two planners, two password managers, T8 section 5). Actions: cancel, downgrade, move to annual.
- **Automation and AI.** Receipt matching has occasional errors [unverified]; auto-coding mistakes propagate to Books when sync is automatic; "99% approval accuracy" is Ramp's own unverified figure (D11 section 2). Plans: Ramp Free $0 / Plus $15; Brex Essentials $0 / Premium $12; Mercury $0 / $29.90 (D11). Small companies spend about $8,000 per employee per year on software (Cledara via T10 section 4, [unverified]); AI coding alone can reach $450-600/month (D07).
- **Operator tiers.**
  - *Stellar*: one card per vendor class, receipts attached within 48 h, a monthly seat audit, cancels trials before conversion. Cuts SaaS spend 20-30% [design]; Books review queue near zero at close.
  - *Good*: receipts weekly, audit quarterly.
  - *Average*: receipts at month end, auto-renewals.
  - *Mediocre*: shared card, about 40% of receipts missing at close, six overlapping tools. "Over-tooling" burn of $600+/month before the first customer (T1 section 5), larger Books errors, higher CPA cost at tax time.
  - Separation metric: SaaS spend per head, missing-receipt share at close, Books error rate.
- **Hours.** Setup 1.5 h; 15 min/week; month-end saves 1-2 h (receipts are the main pain, D11 cross-tool notes).
- **Depends on.** `core/bank.js post`, `bank.js` recurring bills, `books.js reviewQueue/guessCategory`, People headcount, Legal (1099/W-9 collection).

### 7. Cancel-flow and retention builder, Stripe app "Retention" (Churnkey / ProsperStack style)

- **Player workflow.** Billing > Retention: (1) choose survey reasons (price, not using, missing feature, switched competitor, temporary, other); (2) map each reason to an offer: discount (5-50% for 1-6 months), pause (1-3 months, optional Pause Wall), downgrade, concierge call, roadmap link; (3) segment by plan, tenure, activation; (4) A/B variants; (5) portal preview with a linter that flags hidden cancel buttons; (6) report: attempts, saves by reason, saved MRR vs discount cost, 90-day retention of saved vs unsaved, repeat-cancel rate. Today this is one toggle with a fixed 20% save (`stripe.js RETENTION_SAVE`).
- **Automation and AI.** Vendors claim 20-30% of cancel attempts saved, top performers 54%, "32% voluntary churn drop" [vendor claims, D09 section 3]. Replace the flat 20% by a per-reason matrix [design]: price with a matched discount 35-45%, temporary with pause 40-55%, missing feature 10-20%, not using about 10%. Saved customers pay less (contraction) and 25-40% cancel again within six months when the offer was a blanket discount [design]. Dark patterns raise chargebacks and review penalties. Paid tools cost $250/month (Starter, under $5k churned MRR/month) and Stripe may ship a native version [unverified, D09].
- **Operator tiers.**
  - *Stellar*: reason-matched offers, 20-30% for 2-3 months, pause capped at 3 months, A/B tests, reviews the 90-day cohort, feeds reasons into specs. Voluntary churn down 15-30% relative net of discount cost [design].
  - *Good*: reason survey plus one offer per reason.
  - *Average*: single 25% discount for everyone; ~20% saved, ~10% net revenue effect.
  - *Mediocre*: blanket 50% for 6 months, hidden cancel link. Saves ~25% of attempts but gives away half the revenue for six months, many re-cancel, chargebacks and review hits; net negative.
  - Separation metric: net retained MRR after discounts at 180 days.
- **Hours.** 2-4 h build, 1 h/week tuning. Value is revenue, not time.
- **Depends on.** `core/stripe.js cancel/changePrice`, coupons, `customers.js` churn survey, `analytics.js` churn reasons, Lifecycle win-back.

### 8. Reply inbox and AI reply agent, Outreach "Replies" tab (Instantly Unibox / Smartlead categories)

- **Player workflow.** (1) A unified inbox of all replies across sequences, filterable by label: interested, meeting request, not now, wrong person, OOO, unsubscribe, objection (price/competitor/security). (2) Settings: turn on AI categorization, write each category's prompt, **test it on 10 sample replies** before saving (Smartlead, D03 section 2). (3) Reply Agent: qualification criteria text, response templates, escalation rules, mode autopilot or human approval; 5 credits per generated response, whether sent or not (Instantly, D03 section 1). (4) Credits ledger with plan and top-up. (5) "Interested" rows have a one-click convert to deal + proposed calendar slots.
- **Automation and AI.** No vendor publishes classification accuracy (D03). Use [design]: 85-92% correct on clear replies, 60-70% on sarcasm and ambiguity; show a confusion matrix after 100 replies. Failure modes: interested filed as OOO; autopilot sends a generic answer to a nuanced reply; credits burn silently; repeated asks push opt-outs (fix sales review S5 in the same change).
- **Operator tiers.**
  - *Stellar*: defines 4-5 categories, tests on old replies, uses autopilot only for FAQ/pricing questions, answers positives himself within 1 h. Converts 25-40% of positive replies to meetings (research band 15-40%, sales review).
  - *Good*: categories on, reviews every draft.
  - *Average*: default categories, autopilot for everything but "interested".
  - *Mediocre*: autopilot for all, never audits labels. 10-15% of positives mishandled, more unsubscribes from pushy follow-ups.
  - Separation metric: meetings per 100 positive replies and unsubscribe rate.
- **Hours.** Setup 1-2 h; triage drops from 30-60 min/day to 10-15 min (D03 [design]).
- **Depends on.** `sales/replies.js`, `mail.js`, CRM deal creation, `core/calendar.js findSlots`, bank for credits.

### 9. AI support agent: scope, tests, handoff and review, Helpdesk AI tab (Intercom Fin Procedures style)

- **Player workflow.** (1) **Content**: choose which help articles the agent may use. (2) **Scope**: toggle 10-15 intents. (3) **Handoff rules**: angry, billing dispute, bug, "ask for human". (4) **Procedures**: e.g. "Refund request" with steps, conditions and a data connector to Payments. (5) **Test**: batch test 50 past tickets rated Good/Acceptable/Poor, plus simulations (250 runs/month cap under 1K conversations, D09 section 1). (6) **Go live**, then a weekly **Review** screen: conversations by outcome (resolved / handed off / unresolved), repeat-contact rate, CSAT by intent, a KB-gap queue of unanswered questions, and the bill ($0.99 per resolution, 50/month minimum; HubSpot Customer Agent $0.50).
- **Automation and AI.** Keep the current game band (30-55% year one, 55-70% mature, 8% confidently wrong; `support/model.js`) and show it against the sources: vendor 66-76%, practitioner 41% median tier-1 and about 59% top quartile, independent small-sample 38% (T4 section 4, D09). Add the "resolution inflation" trap: a conversation counts as resolved if the customer does not return within 72 h (HubSpot definition, D05), so repeat contact is the honest metric. Failure modes: stale docs after a ship, silent customers counted as resolved, looping with no handoff, cost rising faster than deflection.
- **Operator tiers (O3 section 5).**
  - *Stellar*: scopes 10-15 intents, tests on past tickets, writes handoff before go-live, reviews the 20 worst tickets weekly, writes articles from ticket themes. Real resolution 50-65% with CSAT at or above baseline.
  - *Good*: limited scope, handoff exists but is untuned.
  - *Average*: agent answers everything, outdated KB, CSAT measured not acted on; resolution 35-45% with a repeat-contact tail.
  - *Mediocre*: no handoff, resolution rate as the only KPI. Real resolution 20-30%, CSAT falls after deployment, churn from bad answers.
  - Separation metric: repeat-contact rate and CSAT delta after go-live.
- **Hours.** Setup 6 h (existing) plus 2 h testing; weekly review 1 h; saves 6-10 h/week at ~200 chats/month (D09 [design]).
- **Depends on.** `helpdesk.js`, `support/*`, `core/stripe.js refund`, Product changelog (stale-doc detection), People support seats.

### 10. Runway and cash-forecast scenario planner, Bank + Books (cfo.ai / Fathom / spreadsheet)

- **Player workflow.** Bank > **Forecast**: a 13-week table seeded from bank balance, scheduled Stripe payouts, recurring bills, payroll dates and tax dates, with editable assumption rows (new MRR, churn, hires). Scenario toggles: base, churn shock, revenue -20%, hire an engineer in month 3, round closes in month 6. Each shows runway months, cash-out date, burn multiple and a default-alive flag. Trigger rules ("start the raise at 9 months, cut plan at 6") raise Home alerts. Monthly: forecast vs actual error.
- **Automation and AI.** Deterministic from state; the player's assumptions decide accuracy. An AI "forecast agent" (cfo.ai Ari) may be offered but assumes flat burn by default, the known failure (T5 section 4). Real tools: spreadsheets are most common; cfo.ai $295+/month; Fathom ~$53/month (T5).
- **Operator tiers (O4 section 1).**
  - *Stellar*: 13-week forecast updated weekly with payroll and tax dates, a second runway at planned hires, a hard floor with a pre-set action. Forecast error within ±10%; starts raising at 9+ months and closes in weeks.
  - *Good*: monthly spreadsheet, knows the date, waits to 9 months before thinking about a raise.
  - *Average*: looks at the balance, extends last month's costs (±25%).
  - *Mediocre*: counts deferred revenue as cash, hires against the next round, starts raising under 6 months (±40%+).
  - Separation metric: months of runway at raise start, forecast error, and terms quality in `fundraising` (leverage penalty for short runway [design]).
- **Hours.** 1.5 h first build, 20 min/week; saves 1-2 h/month vs a hand spreadsheet.
- **Depends on.** `bank.js` runway, `core/debt.js`, `people/payroll.js`, `books.js` deferred revenue and tax calendar, `core/stripe.js` payouts, `fundraising/metrics.js`.

### 11. Compliance automation and AI security questionnaires, Legal SOC 2 + Success asks (Vanta / Drata style)

- **Player workflow.** (1) Pick a tool (Vanta ~$10-20k/yr; Drata from ~$7.5k with medians of $25-38k; Secureframe; all quote-only with renewal jumps; D10 sections 1-2, [unverified]). (2) **Integrations in phases**: cloud + identity first, then device and code, then HR and tickets. (3) **Tests** list: each failing test names the resource (MFA off on admin, unscoped sandbox account, stale user after a contractor left). Fix actions cost 15-30 min and re-test nightly (Drata) or within an hour (Vanta scope lag). (4) **Personnel tasks** per team member from People (policy acceptance, training, device agent). (5) Policies from templates plus an AI generator; evidence marked ready for audit. (6) **Audit**: choose an auditor ($15-50k), Type I (3-6 months total) then Type II window (3-12 months). (7) **Questionnaires**: upload from a deal, AI drafts answers from the answer library (25/yr Plus, 144/yr Professional), founder approves each; stale library answers are wrong.
- **Automation and AI.** Vendor claims "80% automated, up to 95% accepted" and "375+ hours saved per year" are unverified marketing (D10). Controls can show green because an integration is connected, not because the control works (T6 section 4). Hours: 3-6 h/week for 6-8 weeks of setup, 1-2 h/week steady state; a questionnaire takes 2-4 h by hand and 20-40 min with a reviewed AI draft [design].
- **Operator tiers.**
  - *Stellar*: buys only when a real deal needs it (about $50-100k ACV, sales review S16), scopes out sandbox, fixes red tests weekly, approves every AI answer, runs Type I then Type II. Deal-loss risk from missing SOC 2 (20-40% at mid-market and up) removed at about month 3.
  - *Good*: starts at first questionnaire, fixes tests in batches.
  - *Average*: buys early, lets tests sit red for weeks; audit slips a quarter.
  - *Mediocre*: buys at $0 MRR ($10-20k wasted), ignores red tests, pastes unreviewed AI answers. Inaccurate answers cause deal loss or a contract breach claim.
  - Separation metric: months to Type I, wasted spend, questionnaire accuracy score.
- **Hours.** As above; replaces `legal/sim.js` single-progress bar.
- **Depends on.** `legal/api.js soc2Status`, People members, `success.js` asks, `crm.js` paperwork, Insights Ops flags (MFA, backups), bank.

### 12. AI inbox triage and follow-up reminders, Mail (Superhuman Split Inbox / Lindy Email Triager)

- **Player workflow.** Mail gains **Splits**: VIP (investors, customers, team), Candidates, Vendors/cold, Receipts, Other, built from sender lists and thread `kind`. Optional **triage agent**: an **audit mode** that runs on the last 10 emails showing each decision before it goes live (D12 section 3); then it labels, auto-archives promotions and invites, and drafts replies (send is always manual). **Follow-up reminders**: set "remind me if no reply in N days"; reply detection works by thread. Snooze and Send later. A weekly prompt: "review Other and Archived".
- **Automation and AI.** No published triage accuracy; Lindy is described as "judgment-first, non-deterministic" (D12 section 3). Use [design]: 92-96% on clear categories, 5-8% misfiled on ambiguous mail, 6-10% of drafts contain an unsupported date, price or commitment. Failure modes: investor email filed as newsletter, reminders firing on replies in a different thread, credit pool burn, privacy (customer mail sent to a model provider). Fix sales review S14 (valuable inbound dropped by the daily cap) in the same pass.
- **Operator tiers.**
  - *Stellar*: audit on 10, VIP split on top, weekly review of Other/Archived, edits every draft, never auto-sends. VIP response under 4 h; nothing valuable lost.
  - *Good*: audits once, checks monthly.
  - *Average*: turns on auto-label, skips the audit.
  - *Mediocre*: auto-archive and auto-send from day one. One to two valuable messages per month lost (investor intro, customer warning), a wrong-number commitment every few months.
  - Separation metric: valuable messages missed per month, VIP response time.
- **Hours.** Setup 1 h; triage time cut 40-60% (100-200 mails/day founders: 2-4 h/week, D12 [design]).
- **Depends on.** `core/mail.js`, `core/network.js` inbound archetypes, CRM contacts, Fundraising investor list, `core/calendar.js`. Automations: trigger "VIP mail arrived".

### 13. Vibe-coding builder path, Product "Build with an app builder" (Lovable / Bolt / v0 / Replit)

- **Player workflow.** Available when no engineer and no coding seat exist. (1) Choose a builder (Lovable ~$25 [unverified], Bolt $25 with 10M tokens, Replit Core $20 / Pro $100, v0 $30/user; D07 section 3). (2) Per feature, write a prompt; each prompt spends credits/tokens and shows a live preview. (3) **Backend panel**: Supabase tables with an RLS toggle each, a `service_role` key warning if the key is in frontend code, a **security scan** before publish (the basic scanner does not test whether policies really block access). (4) Publish; **export to GitHub**; optional "hire a senior reviewer" (People contractor). (5) Rebuild-or-harden prompts appear when auth edge cases, payment webhooks, load or an enterprise security review hit.
- **Automation and AI.** Prototype in hours instead of the 80 agent-hours foundation in `product/build.js` [design]. Security truth: samples range from about 11% to 98% of vibe-coded apps with issues depending on method; use "most have some issue and a meaningful minority leak data" (D07 section 5: SupaExplorer 11% exposing credentials; Lovable CVE-2025-48757 about 10% of scanned apps exposed data; vendor scan 1,046 of 1,072 with a vulnerability). Failure modes: credit loops after the agent breaks working code, Replit-style destructive actions, hosting lock-in.
- **Operator tiers.**
  - *Stellar*: spec first, RLS on every table, scan before publish, budget cap, early export, senior review before charging. Leak chance under 5%; hardening cost 20-30 h.
  - *Good*: scans and locks RLS, skips the review.
  - *Average*: publishes after a preview click-through; leak chance ~15%.
  - *Mediocre*: `service_role` in the frontend, no scan, no export. Leak chance 40%+, breach notification duty, refunds and churn, forced rebuild.
  - Separation metric: data-leak events per 20 runs, rebuild cost at day 120.
- **Hours.** MVP 8-20 h vs 80 agent-hours; hardening 20-60 h later [design].
- **Depends on.** `product/build.js`, `insights.js` Ops (breach), `legal.js` (GDPR/breach), People (contractor).

### 14. Deploys, error tracking and rollback, Product "Releases" tab (Vercel / Sentry)

- **Player workflow.** Each shipped feature creates a **deployment** (preview then production) with checks that depend on the build-session settings (item 4). **Errors**: an issue list with title, event count, users affected, first/last seen and release, sorted by events; actions assign (creates a Product bug), resolve with a fix commit (hours), or ignore. **Rollback** button on a bad release (cost and migration risk). Hosting plan and usage with cost that scales with customers (Vercel Hobby forbids commercial use; Supabase Pro ~$25; T3 section 1, [unverified]). Staged rollout through flags (item 17).
- **Automation and AI.** Error grouping is deterministic. An AI root-cause suggestion (Sentry Seer, $40 per active contributor) is useful about 60-70% of the time [design, unverified]. Failure modes: deploy on Friday with no monitoring, alerts muted, free tier limits.
- **Operator tiers.**
  - *Stellar*: staging plus 10% canary, alert on error rate, rollback inside 15 min, weekly error triage. Mean time to recover about 20 min.
  - *Good*: monitors, rolls back within an hour.
  - *Average*: learns of errors from tickets; MTTR a few hours.
  - *Mediocre*: no monitoring, hot-fixes forward. MTTR 4+ h, each incident adds the existing downtime churn bump.
  - Separation metric: incident minutes per 100 deploys and churn attributed to incidents.
- **Hours.** 15 min overhead per deploy, 30 min/week triage; saves incident cost.
- **Depends on.** `insights.js` incidents and status page, `product.js` bugs, item 4 and item 17.

### 15. Session replay and NPS/PMF surveys, Insights (PostHog)

- **Player workflow.** From a funnel step's drop-off bar, **Watch replays**: a list of anonymised sessions (5,000 free recordings/month) with a player showing timeline, rage clicks, dead clicks and errors. Optional AI summary with citations (500 free AI credits/month, 100 credits = $1; D06 Part 1). Tag a finding to create a spec draft in Product or a macro in Helpdesk. **Surveys**: NPS popover, cancel survey, and the Sean Ellis PMF question targeted only at users who reached the core action; responses list with an AI summary.
- **Automation and AI.** Sessions are generated from a hidden friction model (confusing step, bug); a replay reveals a real cause only if watched, and watching 5-10 sessions finds the top issue with high probability [design]. Failure modes: ad blockers drop 20-40% of events, masking leaks, AI summaries miss the cause, PMF survey sent to everyone (O3 section 4), NPS used as PMF, launch spike read as fit.
- **Operator tiers.**
  - *Stellar*: watches 5-10 drop-off replays weekly, writes specs from them, runs PMF only on activated users, reads the retention curve shape. Activation +5-10 points over a quarter [design].
  - *Good*: weekly dashboard, occasional replays.
  - *Average*: dashboards nobody reads, PMF survey on everyone.
  - *Mediocre*: NPS as PMF, builds from the loudest request.
  - Separation metric: correct PMF call vs hidden truth, activation change after fixes.
- **Hours.** 30-60 min/week (about 2 min per session); saves 1-2 h/week of guessing [design].
- **Depends on.** `insights/model.js` funnel, Product specs, `customers.js`, Helpdesk.

### 16. Quotes, proposals and e-sign, CRM (PandaDoc / HubSpot Quotes)

- **Player workflow.** From a qualified deal, **Create quote**: line items from `state.plans` (seats, annual prepay, onboarding fee), discount % (guardrails from `pricing.js`, approval needed above policy), validity date, terms (net 30, auto-renew, 5% uplift), attach MSA/DPA (readiness from Legal). Preview, send. The prospect's **view** events arrive with timestamps and a follow-up prompt; counters create versions. The signature step (e-sign tool, ~$20/month, or HubSpot Quotes free) is required before closed-won; closed-won then creates the Stripe subscription with `crmCompanyId`. This fixes sales review S17 (money before contract).
- **Automation and AI.** View tracking is deterministic. The buyer persona judges the quote's content (price vs budget stance, security docs attached, complexity). Cycle times for negotiation-to-close: 2-5 days SMB, 10-20 mid-market, 30-60 enterprise (Prospeo via sales review). Failure modes: quote before champion and economic buyer align, discounting without getting something, oversized seat counts (sales review S4).
- **Operator tiers.**
  - *Stellar*: 2-3 options, trades discount for term, attaches MSA/DPA, follows up within 24 h of a view. Cycle 20-30% shorter.
  - *Good*: single clear quote with validity.
  - *Average*: discount on request, no security attachments.
  - *Mediocre*: 30% off to close, oversized seats, no docs. Stalls or churns after signing.
  - Separation metric: days from proposal to signature and discount given per win.
- **Hours.** 20-40 min per quote; saves 1-2 h per deal vs ad-hoc documents [design].
- **Depends on.** `pricing.js` guardrails, `legal/sim.js` redlines, `core/stripe.js subscribe`, `core/calendar.js`.

### 17. Feature flags and experiments, Insights (PostHog)

- **Player workflow.** **Flags**: key, rollout %, release conditions (cohort/plan), kill switch. **Experiment wizard**, three steps: hypothesis and flag; variant split; primary and secondary metrics, minimum detectable effect and a required sample/duration calculator (reported absent from PostHog's free-path UI, D06 [unverified], so the sim teaches it) and a mandatory stop rule. Launch; the results panel shows Bayesian win probability and a banner "only 212 exposures, unreliable". End experiment, ship the winner, and a reminder to delete the stale flag. Experiments are gated until weekly visitors reach a minimum.
- **Automation and AI.** True effects are hidden and mostly zero: win rate 8-20% (Kohavi ~8%, Optimizely ~12-20%; O3 section 4, [unverified]). Failure modes: peeking, missing variant property on server events (no data), tests on tiny traffic (T2 section 5: calling winners at 200 visitors).
- **Operator tiers.**
  - *Stellar*: pre-registers hypothesis, effect size, sample and duration; reports losses; 2-4 tests per month. Compounds +3-8%/quarter on conversion [design].
  - *Good*: tests with a stop rule, sometimes stops early.
  - *Average*: declares winners after a few days; 30% of reported wins are noise.
  - *Mediocre*: changes the test mid-run, reports only winners. Net conversion effect around zero or negative after regression.
  - Separation metric: realised conversion change per quarter and share of shipped "winners" that were noise.
- **Hours.** 1-2 h to set up each test, 15 min/week to check.
- **Depends on.** `core/market.js landingConversion/setModifier`, `insights.js` events, `channels/stats.js` significance code, items 14 and 20.

### 18. Weekly plan, OKRs and AI time-blocking, Home + Calendar (Reclaim / Motion / Notion)

- **Player workflow.** Monday **planning card**: last week's wins (auto), set three priorities linked to goals and key results (progress from MRR, activations, meetings), time-block them. An AI scheduler (Reclaim $10-15/seat, Motion $19-29 [unverified]) places tasks with duration and deadline around meetings, defends focus hours (target 12 h/week), moves blocks when meetings land. Friday review: planned vs done, focus hours achieved, meeting load.
- **Automation and AI.** Constraint solver, deterministic. Failure modes: reschedule thrash when estimates are wrong, over-blocking afternoons so customer meetings fail, task-sync flooding the week (D12 sections 5-6).
- **Operator tiers.**
  - *Stellar*: fixed planning slot, three priorities tied to a metric, protects maker blocks, cuts low-value meetings. Effective hours up (no 0.85 focus penalty beyond 6 coding hours, existing rule).
  - *Good*: plans most weeks.
  - *Average*: reactive.
  - *Mediocre*: 60% of the week in low-value meetings; hours leak shown in `you.js`.
  - Separation metric: share of hours on the stated priorities.
- **Hours.** 30 min Monday + 15 min Friday; saves 1-3 h/week (D12 [design]).
- **Depends on.** `core/calendar.js`, `home.js` goals, `you.js` energy, Product hours.

### 19. Pipeline review and forecast reports, CRM (HubSpot forecasts / Gong boards)

- **Player workflow.** CRM > **Reports**: stage-to-stage conversion, win rate by source and segment, median cycle days, cost per meeting (Outreach spend / meetings), a **forecast board** with Commit / Best case / Pipeline categories (close date, amount) versus realised, and a 30-minute weekly review: stale deals (no activity 14 days, single-threaded, no champion), set next step, record loss reasons. Forecast accuracy history.
- **Automation and AI.** Deterministic. Gong's "20% more precision" is a vendor claim (D04); no AI needed. Failure modes: optimistic dates, spreadsheet-style neglect.
- **Operator tiers.**
  - *Stellar*: weekly review, every deal has a dated next step, multi-threads, forecast within ±20%.
  - *Good*: weekly, mostly dated.
  - *Average*: monthly, optimistic.
  - *Mediocre*: stale deals pile up, forecast misses by 50%+.
  - Separation metric: forecast error and win rate of deals worked weekly vs untouched.
- **Hours.** 30-45 min/week; saves forecast surprises. **Depends on.** CRM deals and activities, Outreach spend, Calls.

### 20. Landing-page builder and A/B variants, Website (Framer / VWO)

- **Player workflow.** Alternative to fetching a URL: a section-based editor (hero, proof, features, pricing, FAQ, CTA) with a live clarity lint, SEO fields (title, description, OG), mobile preview and a speed budget; publish. **Variants**: duplicate a page, traffic split, goal event, significance, ship the winner. AI "first draft" produces generic copy the player must rewrite.
- **Automation and AI.** Persona panel scores as today plus noise; B2B demo pages convert 1.5-4% median, 4.8% top quartile; self-serve about 8% median, 12%+ top (SaaSHero 2026, O2 section 1, [unverified]). A 3-4x gap between median and top quartile is mostly copy and offer.
- **Operator tiers (O2 section 1).**
  - *Stellar*: specific buyer, pain and outcome; one CTA matched to traffic temperature; reads replays weekly; one test every two weeks.
  - *Good*: clear headline and proof, one CTA.
  - *Average*: copies a competitor, three CTAs.
  - *Mediocre*: writes for everyone, no analytics. Conversion in the bottom quartile.
  - Separation metric: visitor-to-trial rate on identical traffic.
- **Hours.** 3-6 h build; 1 h per test. **Depends on.** `core/market.js`, Insights traffic, Ads/Organic traffic, item 17.

### 21. Social scheduler and per-post analytics, Organic (Typefully / Buffer)

- **Player workflow.** Composer with per-platform character counts, thread editor, "rewrite in my voice" (voice profile from past posts; unedited AI text is penalised), a **queue** with time slots and calendar, drafts, and per-post analytics (impressions, engagement, follower delta, signups by UTM). Cadence streak. Per-channel pricing (Buffer $5/channel, Typefully $10-20; D08 sections 4-5).
- **Automation and AI.** Reach ramps with consistency and engagement quality (existing `organicEngine`); platform algorithms penalise obvious AI spam [design]. Failure modes: OAuth token expiry silently stops posts, queue gaps, per-channel billing creep.
- **Operator tiers.**
  - *Stellar*: one repeatable format (value-first video, weekly essay; T9 section 5), five posts per week, repurposes, tracks signups.
  - *Good*: steady, mixed quality.
  - *Average*: bursts then silence.
  - *Mediocre*: 5 unedited AI posts a day, follower counts as progress. Reach throttled.
  - Separation metric: signups per post-hour over 90 days.
- **Hours.** 2-4 h/week (D08 [design]). **Depends on.** `growth/organicEngine.js`, `founder.network`, Ads creatives; Automations: trigger "feature shipped" to draft a post.

### 22. Feedback board and request-to-changelog loop, Customers + Product (Canny / Linear customer requests)

- **Player workflow.** A **Requests** board auto-fed from tickets, interviews and emails, each with requester count and MRR; merge duplicates; statuses Open / Planned / In progress / Shipped; link a request to a spec; on ship, **Notify requesters** plus a changelog entry; sort by MRR-weighted frequency; public-roadmap toggle. Canny's free tier tracks 25 users and Growth costs $400/month (T3), so the choice between a board and a spreadsheet is itself a lesson.
- **Automation and AI.** Closing the loop lifts requesters' retention and review scores [design]. Failure mode: building the top-voted request from non-customers; vote count over evidence (the spec grader already caps evidence by real insights).
- **Operator tiers.** *Stellar*: weights by segment and MRR and by problem frequency, closes the loop every time. *Good*: tracks and notifies. *Average*: keeps a list. *Mediocre*: builds the loudest request. Separation metric: retention of requesters and shipped-feature adoption.
- **Hours.** 20 min/week; saves ~1 h/week of spreadsheet upkeep [design]. **Depends on.** Product features and changelog, Helpdesk tickets, `customers.js`, Research insights, Lifecycle.

### 23. Keyword research, Search Console view and AI-visibility tracker, Organic (Ahrefs / GSC / Otterly)

- **Player workflow.** A Search Console-style table (query, impressions, clicks, CTR, position) per page; keyword research from a seed with volume, difficulty and intent; a rank tracker; backlink count; an AI-visibility panel: tracked prompts (15 on Otterly Lite $29) by engine (ChatGPT, Perplexity, Gemini, AI Overviews) with mention yes/no, cited URL and share of voice, plus "AI-referred sessions and signups" to prevent confusing citations with revenue (T2 sections 4-5).
- **Automation and AI.** Position-1 CTR falls about 58% under an AI Overview (Ahrefs Dec 2025, O2 section 3, [unverified wording]); citation share is volatile and sample-dependent, so show a noise band. Failure modes: buying Ahrefs, Semrush and an AI tool before traffic (T2 section 5).
- **Operator tiers (O2 section 3).** *Stellar*: picks topics from sales calls and tickets, one deep sourced piece a month with original data, comparison pages. *Good*: weekly keyword-led posts. *Average*: generic AI guides. *Mediocre*: five AI posts a week, bought backlinks. Separation metric: qualified signups per article-hour (stellar 3-5x average, [design]).
- **Hours.** 2-3 h per article for research, 30 min/week review. **Depends on.** `growth/organicEngine.js`, `website.js`, `channels.js` AI tab.

### 24. Tracked deck links, data room and intro-path finder, Fundraising (DocSend / Papermark / Foundersuite)

- **Player workflow.** Create a **share link** per investor (email capture, optional NDA gate, expiry) and read the viewer log (per-page time); a nudge says "opened twice is not a term sheet". **Data room** folders (cap table, financials from Books, contracts, IP assignments from Legal) with permissions, download log and a readiness checklist using `legalIssues`. **Intro paths**: for each target investor, a graph over `messages.js` contacts and the uploaded LinkedIn showing "Alice to Bob to investor"; draft a forwardable blurb (judged on who/traction/specific ask, 40-120 words); the intermediary answers after a 1-5 day double opt-in delay and may decline.
- **Automation and AI.** Keep existing meeting rates (warm about 35%, cold about 2%). View analytics are noisy intent signals. Failure modes: stale data room, cold-emailing thousands (T7 section 5).
- **Operator tiers.** *Stellar*: 30-50 matched investors, warm paths first, data room ready before meeting one. *Good*: some warm intros. *Average*: mostly cold. *Mediocre*: spam 3,000 and treat opens as intent. Separation metric: meetings per 100 investor touches and diligence days.
- **Hours.** 2-4 h data room, 15 min per intro; saves 3-5 h versus ad-hoc. **Depends on.** `messages.js` network, `legal/api.js`, Books statements, `fundraising/view-crm.js`.

### 25. Background checks and AI application criteria, People (Checkr / Ashby AI)

- **Player workflow.** Offer stage: **Order background check** (package, $30-80 per check; D10, T6), candidate consent step, report (clear / consider), and the FCRA adverse-action steps (pre-adverse notice, wait, final). For screening: per-job **criteria** (meets / does not meet / undecided), an EEO validator that warns about proxy criteria, bulk evaluation costing 1 credit per candidate per job (Ashby pool 1,500/month at $400/month), opt-out candidates skipped, results shown as reasoning, never as a score.
- **Automation and AI.** No published accuracy (D10 section 3); Ashby itself says results "may be inaccurate". Failure modes: no resume so nothing to read, form-question criteria only check that text was entered, ignored EEO warnings, auto-reject from the AI list.
- **Operator tiers.** *Stellar*: validated criteria from the scorecard, reads reasoning for borderline cases, background check after a contingent offer with consent, follows FCRA. *Good*: criteria plus human review. *Average*: filters by the percent-met column. *Mediocre*: auto-reject, wrong package, skips adverse action (legal event). Separation metric: quality-of-hire proxy and compliance events.
- **Hours.** Criteria 45 min per role; triage 3-5 h per role becomes 45-90 min (D10 [design]). **Depends on.** `people/candidates.js`, `people/assess.js`, Legal, bank fees.

## 3. Things our apps do that real tools don't (keep or cut?)

| Feature (file) | Why it differs from real tools | Verdict |
|---|---|---|
| Customer trial panel: AI personas try what you shipped (`customers.js`) | No real tool offers this; the research is explicit that synthetic users are rehearsal, never evidence (`docs/research/sales-and-research.md` section 4, citing NN/G; O3 section 1). | **Keep**, but keep the on-screen label "rehearsal, not evidence" and never let panel results satisfy the spec grader's evidence requirement (already capped). |
| Website persona panel sets landing conversion (`website.js`) | Closest real analogue is paid user-testing panels. It is the reference LLM-judge pattern. | **Keep.** Calibrate against the 3-4x median-to-top-quartile spread (O2 section 1). |
| Investor panel with a research rubric and live pitch (`fundraising/rubric.js`) | Real founders practise on friends; nothing grades them. | **Keep.** |
| Spec grader with an instant genericity blocker (`product/spec.js`) | No real tool grades specs. It is the main training signal for "decide what to build". | **Keep.** |
| Mom Test interview rehearsal and graded transcripts (`research.js`) | Dovetail synthesises; nothing grades your questions. | **Keep.** |
| Reported vs actual ROAS and Stripe cohort truth (`ads.js` Cohorts tab) | Real ad managers hide this; founders rebuild it in a sheet or DataFast. | **Keep** and label it "in real life you assemble this yourself". |
| Weekly dashboard with sourced benchmark flags (`analytics.js`) | ChartMogul does not tell you what is wrong. | **Keep.** Make the flags a feedback layer shown after the player has looked, not a to-do list. |
| Hidden stakeholders, buying committees, segment procurement (`sales/segments.js`) | Real CRMs record this only if you type it. | **Keep**; it is the best tier separator in sales. |
| Market events and simulated competitor moves (`market.js`) | Crayon-style tools monitor real competitors; the sim adds a shock generator. | **Keep.** Make sure shocks carry the "what a stellar operator would have done" line. |
| Co-founder trial projects and equity negotiation (`cofounder.js`) | YC matching introduces; it does not simulate trials. | **Keep.** |
| Founder energy, hours ledger, life events (`you.js`, `core/wellbeing.js`) | Reclaim and Motion schedule time; nothing models energy. | **Keep.** It is the central constraint behind principle 4. |
| Founder scorecard: elite habits, warning signs, luck surface area (`outcomes.js`) | Not a tool. | **Keep**, but read from outcomes, never let it become a checklist players farm (operator quality must come from actions). |
| Home "Next steps" list (`home.js`) | Real tools do not tell founders what to do next. | **Cut or soften**: it tells a mediocre operator exactly what a stellar one would decide, which defeats principle 7. Replace with questions ("what is your riskiest assumption?") or show it only after a long idle period. |
| Personal financing and day-job decision (`financing.js`) | Not a SaaS tool. | **Keep**, low priority; it is genuinely part of founding and well sourced. |
| AI SDR that books 0 meetings for $12k (`sales/engine.js`) | Real AI SDRs underperform but not to zero (sales review S18). | **Fix**, do not cut. |
| Free "Add a real contact" with self-declared closeness (`messages.js`) | Real CRMs never convert self-declared closeness into intros (sales review S12). | **Fix.** |

## 4. What other apps should expose to the Automations app

The Automations app (Zapier/Make/n8n style, cross-app triggers and actions) is being built separately and is not planned here. Real founder automations (D01 Part 4, 15 recipes) map to a small set of events and actions per app. For the Automations app to work, each owning app should expose the following. Event names are suggestions; the stable parts are payload ids and idempotency keys.

Contract the apps should follow so failures stay realistic (D01 failure modes): every event carries a stable `id` (so duplicates can be dropped), a `day`, and the ids needed to fetch records; every action returns `{ ok, error?, hoursCost, usdCost }`, supports a dry run, and routes anything that sends to a customer or investor through an approval flag the Automations app can set. Actions cost founder hours only when a human would have done them.

| App | Triggers to emit | Actions to expose | Real recipe from D01 it enables |
|---|---|---|---|
| Payments (`stripe.js`, `core/stripe.js`) | payment_succeeded, payment_failed (with attempt count), subscription_created / changed / canceled, trial_will_end (T-3), dispute_opened, refund_issued, payout_paid | refund, apply coupon, change price, pause subscription, send invoice reminder, create invoice | 1 payment to CRM and Slack, 2 cancel to exit survey, 3 failed-payment alert, 4 paid invoice to books |
| CRM (`crm.js`) | contact_created, deal_stage_changed, deal_won / lost, inbound_lead_created, task_due, deal_stale (14 days) | create/update contact, company or deal, add activity or note, create task, add to inbound queue, enroll in sequence | 5 form lead to enriched, scored CRM record, 6 routing, 13 reply to stage update |
| Outreach (`outreach.js`) | reply_received (with category), meeting_booked, bounce_rate_over_threshold, domain_reputation_drop, sequence_finished | enroll / pause / unenroll contact, pause inbox, label reply, send approved reply | 13 prospect reply to CRM stage |
| Calls (`calls.js`) | call_scheduled, call_held, call_no_show, notes_ready (build item 5) | book or reschedule call, send recap, push notes | 7 booked demo to prep brief, 8 meeting to summary, 9 action items to tasks |
| Mail (`mail.js`) | new_thread (by kind), unread_vip_over_n_hours, reply_sla_breached | draft reply, send reply (approval), archive, label, snooze | 12 support email to AI triage and draft |
| Helpdesk (`helpdesk.js`) | ticket_created (category, plan, MRR), sla_at_risk, csat_low, review_posted, ai_handoff | reply with macro, tag, assign, escalate to bug, request review | 12 support triage, 14 usage limit to sales task |
| Success (`success.js`) | health_dropped, renewal_t90 / t60 / t30, qbr_due, procurement_ask_opened | schedule QBR, open expansion, start renewal | 14 usage limit hit to expansion task |
| Insights (`insights.js`) | activation_event, funnel_dropoff_alert, incident_started / resolved, spend_cap_hit | post status update, run saved funnel, toggle flag (build item 17) | 10 signup to welcome, 11 trial inactivity nudge |
| Analytics (`analytics.js`) | weekly_flags_ready, metric_crossed_threshold (MRR, churn, runway) | snapshot metrics to text or table | 15 Monday metrics digest |
| Books (`books.js`) | review_queue_over_n, month_close_due, filing_due, tie_out_failed | accept AI categories, create journal entry, mark filing | 4 invoice to ledger |
| Bank (`bank.js`) | balance_below, runway_below, bill_declined, transaction_posted | send payment, transfer to Treasury, add or cancel recurring | cash-floor alerts |
| Product (`product.js`) | spec_graded, feature_shipped, bug_found | create spec draft, queue feature, add changelog entry | feature shipped to social post draft |
| People (`people.js`) | candidate_applied, offer_accepted, payroll_due, member_left | send template reject, schedule interview, run payroll | hiring routing |
| Legal (`legal.js`) | filing_due, redline_arrived, soc2_milestone | answer DSR, pay filing | compliance-calendar reminders |
| Fundraising (`fundraising.js`) | investor_replied, stage_changed, update_due | send investor update, log activity | monthly update draft |
| Growth (`ads.js`, `organic.js`, `channels.js`) | campaign_budget_exhausted, ad_rejected, roas_below_threshold, post_published | pause campaign, publish scheduled post | ad-guardrail rules |
| Calendar (`calendar.js`) | event_starting, focus_block_broken | create event, find slots, block focus | meeting prep |
| New apps from this list | Assistant: run_finished / run_failed. Lifecycle: contact_entered_flow, goal_reached, unsubscribed, complaint. Prospector: list_verified, bounce_over_threshold | Assistant: run_task. Lifecycle: enrol_contact, send_broadcast. Prospector: enrich_row | AI step in recipes 5, 8, 12 |

Design notes for the Automations owner, taken from the research: task or operation counts must be a cost meter (Zapier 100 free tasks, Pro 750 for $19.99; Make 1,000 credits free; n8n 2,500 executions on €20; D01 section 1), loops and duplicate triggers must burn quota, auth expiry must fail silently until the run log is read, and an AI step must show its output for review before any customer-facing action.
