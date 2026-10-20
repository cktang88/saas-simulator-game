# Q4 2026 tools: debugging, hosting, comms, analytics, BI

Research date: 2026-10-16. Builds on t3-product-eng.md and deep/d06-posthog-linear.md, d07-ai-coding.md (AI coding not repeated). Evidence tags: [verified: URL] = primary or multi-source with dated primary; [vendor]; [third-party] (aggregators, often disagree); [unverified]; [design] = game assumption. Most prices below are third-party aggregators because vendor pages were not reachable; re-check before hard-coding.

## Headline findings
- Verified shutdowns/acquisitions: June (analytics) wound down 8 Aug 2025, team joined Amplitude [verified: https://www.june.so/blog/a-new-chapter]. Heap bought by Contentsquare (announced 28 Sep 2023, closed 7 Dec 2023) [verified: https://www.businesswire.com/news/home/20230928042397/en]. Mode bought by ThoughtSpot for $200M (announced 26 Jun 2023, closed 19 Jul 2023) [verified: https://techcrunch.com/2023/06/26/thoughtspot-acquires-mode-analytics-a-bi-platform-for-200m-in-cash-and-stock]. Chartio bought by Atlassian 2021, service shut 1 Mar 2022 [third-party: https://www.basedash.com/blog/chartio-shut-down-alternatives]. Hosted Redash shut 2021 by Databricks; OSS Redash is near-dormant [third-party: https://www.knowi.com/blog/best-redash-alternatives/].
- SendGrid retired its permanent free plan (announced 28 May 2025, 60-day transition); new signups get a 60-day trial at 100/day, paid from about $19.95/mo [verified: https://www.twilio.com/en-us/changelog/changes-coming-to-sendgrid-s-free-plans]. Resend is the default for new startups.
- Claim "many YC startups use PostHog and Porter.run": PostHog+YC side is supported (PostHog is YC-backed, has a YC-specific founder program, up to about $50-55k credits [third-party/vendor handbook: https://posthog.com/handbook/words-and-pictures/startups]). Porter's YC link is real (YC company; 2024 CEO interview) but I found NO 2026 evidence of "many YC startups use Porter" [unverified]. Porter is real and active: deploys into your own AWS/GCP/Azure on Kubernetes, Standard plan about $6/GB RAM/mo + $13/vCPU/mo excluding cloud bill [vendor: https://www.porter.run/pricing].
- Claim "Ramp and Surge use Hex": Ramp yes, Notion, Lovable, Cursor, HubSpot listed as customers on a HumanX 2026 sponsor page (2,000+ customers) [third-party]; Ramp's vendor page shows Hex at 20% of Ramp orgs with a BI vendor, May 2026 [third-party: https://ramp.com/vendors/hex]. Surge: not found [unverified]. Hex Series C $70M May 2025 (Avra), about $172M total [third-party].
- TechRadar "best business intelligence platform of 2026" lists Microsoft Power BI first (best free); Dundas also named; full ranking not retrievable [third-party: https://www.techradar.com/news/best-business-intelligence-tool]. It is an enterprise-oriented list; startups rarely follow it (see BI section).

## 1. Debugging and observability

### Sentry — KEEP (leader for errors)
- Status: active. Now errors + tracing + replay + logs + metrics + crons/uptime + Seer AI debugging. Unlimited users on paid plans.
- Price [third-party, annual billing]: Developer free (about 5K errors); Team $26/mo (50K errors, 5M spans, 50 replays, 5GB logs); Business $80/mo (same quotas, higher overage, SAML, unlimited dashboards). Seer add-on $40 per active contributor/mo (contributor = opens 2+ PRs on a Seer repo); legacy $20 Seer plan closed to new buyers Jan 2026 [third-party: https://last9.io/blog/sentry-pricing/, https://toolradar.com/tools/sentry/pricing]. Startup program credits exist [unverified].
- Weekly workflows: (1) Slack alert on new issue (30 s). (2) Open issue, read stack trace, breadcrumbs, release, affected users (5-10 min). (3) Seer root-cause + suggested fix PR, review (10-20 min). (4) Resolve in next release / ignore / assign. (5) Set alert rules and release health after deploy (15 min). (6) Cron monitor for background jobs.
- Gotchas: event-quota overages and spike-protection tuning; noisy third-party/browser errors burn quota; replay at 50/mo on Team is a toy; sourcemap/release setup is the most common reason issues are unreadable.
- Paradigm: error-first, grouped by fingerprint, code-level (stack + release + commit). Developer triage queue. Versus PostHog: product-event-first, errors as a side feature. Versus Datadog: infrastructure-first, per-host metrics. Game: Sentry action = triage queue of grouped issues with fix-time; skipping setup (no sourcemaps/releases) makes issues unreadable and costs hours.

### PostHog (replay + error tracking bundle) — KEEP as bundled alternative
- Free monthly: about 1M events, 5K recordings, 100K exceptions, 1M flag requests, 1,500 survey responses; replay about $0.005/recording beyond [third-party: https://costbench.com/software/product-analytics/posthog/free-plan/, https://usercall.co/post/posthog-pricing]. Startup credits up to about $50k/12 months [third-party, unverified terms: https://innmind.com/startup-deals/posthog-startup-program-credits/]. Open source, self-hostable.
- Paradigm: one product, one event/person data model for analytics, replay, flags, experiments, surveys, errors, warehouse. Tradeoff: error tracking is shallower than Sentry (no deep release/commit workflow); each product metered separately so bills grow.
- Standard pairing in 2026 for seed teams: PostHog (product) + Sentry (errors). Pre-seed: PostHog alone.

### LogRocket — KEEP-ALT, declining relevance for startups
- Status: active; session replay with errors/perf and AI summaries. Pricing unstable across sources: Free (1,000 sessions), Team $69, Professional $295 [third-party: https://toolradar.com/tools/logrocket/pricing]; one Sept 2026 aggregator shows a $176/user "Core" plan and no free plan, conflicting [unverified]. Do not hard-code.
- Workflow: find the user's session via ID/email, scrub replay with console + network + Redux, share link to Linear/Jira ticket. Fits front-end heavy SaaS with complex UI. Replaced in practice by PostHog replay (cheaper, bundled) and Sentry replay.
- Verdict: KEEP-ALT; pick only if the product is front-end heavy and the player has budget.

### Better Stack — KEEP-ALT (cheap all-in-one: uptime + logs + incidents + status page)
- Free: 10 monitors/heartbeats, 1 status page, 100K exceptions/mo, 3GB logs (3-day retention) [third-party: https://toolradar.com/tools/betterstack/pricing]. Responder about $29/mo; add-ons (uptime $21, status pages $12); logs/traces usage-based. Competitors say real teams pay $80-150/mo [third-party competitor: https://hyperping.com/blog/betterstack-pricing]. Sources disagree on tiers.
- Workflow: monitor URL -> phone/Slack alert -> on-call ack -> incident timeline -> public status page update -> postmortem. Logs via Vector with SQL-like query.
- Paradigm vs Sentry/Datadog: Sentry = code errors; Datadog = infra/APM per host; Better Stack = "is it up, who is on call, what do logs say, tell customers" for 1-10 person teams. Modular billing is the gotcha.

### Datadog — KEEP for scaling teams, OVERKILL for seed
- Per-host, per-product, per-event billing; infra Pro about $15/host/mo annual, APM about $31/host/mo [third-party competitor-authored: https://www.dash0.com/comparisons/datadog-vs-new-relic]. Datadog for Startups credits program exists [unverified terms].
- Fit: Series A+ with Kubernetes/microservices and a platform engineer. Classic surprise-bill failure mode (custom metrics, log ingest/indexing, high-cardinality tags). Game: Datadog adoption by a pre-seed player = overspend + setup hours; no benefit.

### AppSignal — KEEP-ALT (niche)
- Flat tiers: free, Starter $23, Growth $59, Pro $139/mo [third-party: https://toolradar.com/tools/appsignal/pricing]. Errors + APM + host metrics + uptime, strongest in Ruby/Elixir/Node/Python; no per-host billing. Fit: small Rails/Phoenix shops. Few YC-style startups use it versus Sentry [unverified].

## 2. Deploy and hosting
Prices [third-party; vendors move often]: Vercel Pro $20/seat/mo + usage; Railway $5 Hobby / $20 Pro, usage-billed per GB-sec and vCPU-sec; Render fixed instance pricing from about $7/mo (Starter), free tier spins down; Fly.io per-second machine billing, no free compute for new accounts; Vercel free tier bars commercial use [third-party: https://agentdeals.dev/hosting-pricing, https://infratally.com/articles/heroku-alternatives-cost/, https://www.stackscored.com/pricing/dev-hosting/]. Worked example: always-on 512MB Node API about $10-15 on Railway vs $7 on Render [third-party]. Heroku described as effectively dead for startups (2026 commentary, third-party; verify) [unverified].

| Tool | Paradigm | Weekly workflow | Gotcha |
|---|---|---|---|
| Vercel | Frontend/Next.js, git push -> preview URL per PR -> promote | merge PR, check preview, promote, roll back via deployment list | per-seat + usage bills (bandwidth, functions, image optimization); backend cost unpredictable |
| Railway | Usage-metered containers + databases in one canvas, templates | git push, add Postgres/Redis service, set env vars, watch usage | bills climb under constant load; ephemeral-feel projects get messy |
| Render | Heroku-like, fixed instance prices, managed Postgres, blueprints | connect repo, pick instance size, deploy, scale | free tier cold starts; predictable but pricier at idle |
| Fly.io | Firecracker machines in many regions, CLI-first (fly deploy) | fly deploy, scale machines per region, volumes | more ops knowledge; multi-region data consistency is on you |
| Porter | PaaS UX on top of Kubernetes in YOUR AWS/GCP/Azure account | connect GitHub, define services/cron/workers, autoscale, preview envs | pay Porter AND the cloud bill; K8s concepts leak; needs AWS account setup [vendor: https://www.porter.run/pricing] |
| AWS (ECS/Lambda/Amplify) | Full primitives, IAM/VPC | Terraform/CDK, console | highest setup hours, best credits (AWS Activate) and scale ceiling |

- Stage fit [design]: pre-seed: Vercel + managed backend (Supabase/Neon) or Railway/Render; seed with backend needs: Render/Railway/Fly; Series A with SOC 2 or customer-owned-cloud needs: Porter or AWS. Porter's niche is "Heroku UX, own cloud, no devops hire" (also helps with AWS credits).
- Verdicts: Vercel KEEP (frontend), Railway KEEP, Render KEEP-ALT, Fly.io KEEP-ALT, Porter KEEP-ALT (real, but "many YC startups" unverified), AWS KEEP (scale/credits), Heroku OUTDATED.

## 3. Transactional email and comms
- Resend — KEEP (new-startup default). Free 3,000/mo (100/day); Pro $20/mo 50K; Scale $90/mo 250K [third-party: https://automationatlas.io/guides/resend-vs-sendgrid-vs-postmark-2026-comparison/]. Paradigm: API + React Email templates in code, DX-first; broadcasts and audiences included. Workflow: add domain -> publish SPF/DKIM/DMARC records -> send test -> watch deliverability dashboard and webhooks (bounce/complaint).
- Postmark — KEEP-ALT (deliverability specialist). Dev sandbox about 100/mo; paid from $15/mo for 10K [third-party]. Paradigm: strict separation of transactional vs broadcast message streams; fast inbox delivery, activity feed with per-message content, bounce handling; refuses marketing-style senders. Best when password-reset/receipt delivery speed matters.
- SendGrid — OUTDATED for new startups: free plan retired (above); reputation of shared-IP problems and Twilio-integrated support [verified: Twilio changelog]. Replace with Resend/Postmark/SES.
- Amazon SES — cheapest at volume (pennies per 1K), minimal UI; requires leaving sandbox approval [third-party]. Others: Mailgun (100/day free), SMTP2GO, Brevo.
- Twilio (SMS/voice) — KEEP for SMS/voice. US SMS about $0.0079-0.0083/segment plus carrier fees about $0.003-0.005 (all-in about $0.011-0.013), 10DLC brand/campaign registration required (fees vary $4.50 to $60 by source), numbers about $1.15/mo local, $2.15 toll-free [third-party; Twilio support page https://support.twilio.com/hc/en-us/articles/1260803965530]. Gotchas: 10DLC/toll-free verification takes days to weeks and unregistered traffic is blocked; segments multiply cost for Unicode/long text. Alternatives: Telnyx (cheaper), Vonage, Plivo [third-party].
- Game hooks [design]: domain auth steps (SPF/DKIM/DMARC) skipped -> spam folder -> lost activation/emails; SMS without 10DLC -> blocked sends; complaint rate above threshold -> sender reputation damage.

## 4. Product analytics
| Tool | Status / price | Paradigm |
|---|---|---|
| PostHog | Active, leader for startups. Usage-based, free 1M events; YC program credits | All-in-one: autocapture + events + replay + flags + experiments + surveys + warehouse; SQL (HogQL); self-host option |
| Mixpanel | Active. Free 1M events (reported 2026; sources disagree), Growth about $0.28/1K events after [third-party: https://www.stackscored.com/pricing/product-analytics/] | Event-based, polished funnels/retention/flows, you instrument carefully |
| Amplitude | Active, now also owns June team. Free about 10K MTU; Plus $49/mo reported; median Growth contract about $64.7K/yr (Vendr, via Fungies) [third-party] | Behavioral analytics + experimentation + AI agents; enterprise-leaning, MTU billing |
| Heap | Acquired by Contentsquare (closed 7 Dec 2023), now folded into Contentsquare Product Analytics; quote-only pricing, reported steep renewal hikes [verified: Businesswire; third-party pricing] | Autocapture-everything, retroactive "virtual events" definition; weakened as standalone for startups |
| Segment (Twilio) | Active. Free 1,000 MTU; Team $120/mo (10K MTU); Business custom [third-party: https://usehardal.com/blog/segment-pricing] | CDP: collect once, route to many tools; becomes unnecessary when PostHog is the hub; MTU costs bite |
| June | DEAD. Wound down 8 Aug 2025, team to Amplitude [verified] | B2B-SaaS templated reports on Segment events; replaced by PostHog/Amplitude/Mixpanel |

- Weekly workflow (PostHog/Mixpanel): define 5-10 named events (signup, activation, invite, payment) -> build signup-to-paid funnel -> read retention table -> watch 5 replays of dropped users -> ship fix behind a flag -> read the experiment. About 1-3 hours/week for a seed team.
- Failure modes: no event plan (empty funnel), ad blockers undercounting (use reverse proxy), identify/alias bugs splitting users, MTU/event spikes causing bills, instrumenting too early for 50 users.
- Verdict: PostHog KEEP, Mixpanel KEEP-ALT, Amplitude KEEP-ALT (Series A+), Heap OUTDATED (via acquisition), June DEAD, Segment KEEP-ALT (only at multi-tool scale).

## 5. BI and internal tools
- Hex — KEEP (modern leader for analyst-led startups). Notebook (SQL + Python) -> published data apps -> Threads conversational self-serve over a governed semantic layer, AI agents. Community free; Professional $36/editor/mo; Team $75/editor/mo; Enterprise custom; compute/AI usage extra; reported SMB average spend about $9.3K/yr and rising [third-party: https://querio.ai/articles/hex-pricing-explained-what-it-costs, https://www.spendhound.com/marketplace/hex-technologies-pricing]. Fit: Series A+ with a data person and a warehouse (Snowflake/BigQuery/Postgres). Customers: Ramp, Notion, Cursor, Lovable, HubSpot (HumanX 2026 page, third-party). Surge unverified.
- Metabase — KEEP (default for seed teams). Open source free (self-host, unlimited users); Starter about $100/mo (5 users, $6/extra); Pro about $575/mo (10 users, $12/extra); Enterprise custom, about $15-20K/yr [third-party: https://coefficient.io/metabase-pricing]. Paradigm: question builder (no-SQL GUI) + SQL editor + dashboards on top of your app DB. Workflow: connect read replica -> save question -> pin to dashboard -> email subscription weekly -> embed. Gotcha: querying production DB directly; no semantic layer in OSS; metric definitions drift.
- Retool — KEEP for internal tools (admin panels, support consoles), not BI. Paid about $50/user/mo [third-party: https://www.thebricks.com/resources/metabase-vs-retool, single source; free tier unconfirmed]. Paradigm: drag-and-drop UI components bound to queries/APIs with write actions (refund, ban user), plus AI app generation. Fit: seed+ with ops/support needing admin tooling; alternatives: Appsmith, Superblocks, plain dev-built admin.
- Mode — KEEP-ALT/declining: acquired by ThoughtSpot ($200M, closed July 2023) [verified: see above]; SQL+Python+R reports; ThoughtSpot has not clearly continued its startup positioning. Not recommended for new startups [unverified current state].
- Redash — OUTDATED. Hosted service ended 2021; OSS Redash slow, about one release a year, community forum reported read-only [third-party: https://www.knowi.com/blog/best-redash-alternatives/]. Replace with Metabase.
- Chartio — DEAD (Atlassian acquired 2021; shut 1 Mar 2022).
- Power BI / Tableau / Looker (enterprise): Power BI Pro about $10/user/mo, Tableau about $42/user/mo [third-party: https://costbench.com/best/best-business-intelligence-tools-2026/]. TechRadar's list is led by Power BI; startups outside Microsoft shops rarely use these; Looker needs LookML engineering. Newer AI-native BI: Sigma (spreadsheet interface on warehouse), Omni, Definite, Julius, Querio [third-party; adoption unverified], plus PostHog's SQL/HogQL for product-only teams.
- Paradigm contrast: Metabase = self-serve GUI questions for non-analysts; Hex = code-first notebooks to published apps plus AI chat on a semantic layer for a data team; Retool = operational apps that WRITE to systems; Power BI/Tableau = enterprise visualization with licensing and IT admin. Day to day: Metabase makes the CEO answer own questions in minutes but with wrong-metric risk; Hex yields deeper analysis but needs someone who writes SQL/Python; Retool saves engineer hours on admin tooling but is not for analysis.

## 6. AI coding (brief)
Already covered in docs/research/tools/deep/d07-ai-coding.md. For this area only: Sentry Seer ($40/active contributor) and PostHog AI/Amplitude AI agents are the observability-side AI features; Hex Threads and Metabase AI are the BI-side [vendor/third-party].

## 7. Newer 2025-2026 displacements
- Resend replaced SendGrid/Mailgun as default API email for new startups (SendGrid free plan gone) [verified].
- PostHog displaced Heap/Mixpanel/Amplitude for seed teams and absorbed replay/errors/flags (YC program) [third-party/vendor].
- Hex displacing Mode/Redash/Chartio for modern analyst workflows; Metabase displacing Redash for GUI BI.
- Railway/Render/Fly displaced Heroku; Porter targets teams leaving PaaS for own-cloud.
- Segment displaced by PostHog-as-hub and warehouse-first tooling (RudderStack, Hightouch) [unverified].

## 8. Summary table
| Tool | Status | Verdict | Startup-tier price | Paradigm (one line) | Key workflows | Stage fit |
|---|---|---|---|---|---|---|
| Sentry | active | KEEP | Team $26/mo (+Seer $40/contrib) [3p] | code-level grouped errors + release health | alert -> triage -> Seer fix -> resolve | pre-seed to Series B |
| PostHog | active | KEEP | free 1M events; YC credits up to ~$50k [3p] | one event model for analytics+replay+flags+errors | funnel -> replay -> flag -> experiment | pre-seed to Series A |
| LogRocket | active | KEEP-ALT | Free / $69 / $295 (unstable) [3p] | front-end session replay with console+network | find session -> debug -> ticket | seed, UI-heavy |
| Better Stack | active | KEEP-ALT | free; ~$29/mo+ [3p] | uptime + logs + on-call + status page | monitor -> page -> incident -> status post | pre-seed to seed |
| Datadog | active | KEEP (overkill early) | per host ~$15 infra [3p] | infra/APM per-host platform | dashboards, monitors, traces | Series A+ |
| AppSignal | active | KEEP-ALT | $23-139/mo [3p] | flat-priced APM+errors for Rails/Elixir | error + perf triage | small web shops |
| Vercel | active | KEEP | $20/seat + usage [3p] | git-push frontend, preview per PR | merge -> preview -> promote/rollback | pre-seed to Series A |
| Railway | active | KEEP | $5-20/mo + usage [3p] | usage-billed containers + DBs | push, add service, env vars | pre-seed/seed |
| Render | active | KEEP-ALT | ~$7/instance [3p] | fixed-price Heroku successor | deploy, scale instance | seed |
| Fly.io | active | KEEP-ALT | usage per second [3p] | multi-region machines via CLI | fly deploy, regions | seed, infra-savvy |
| Porter | active | KEEP-ALT | $6/GB + $13/vCPU + AWS bill [vendor] | PaaS UX over K8s in own cloud | connect repo, services, autoscale | seed to Series B |
| AWS | active | KEEP | credits (Activate) [unverified] | raw primitives | IaC, console | Series A+ |
| Resend | active | KEEP | free 3K/mo; Pro $20 [3p] | code-first email API + React templates | domain auth, send, webhooks | pre-seed+ |
| Postmark | active | KEEP-ALT | from $15/mo [3p] | transactional-only deliverability | streams, activity feed | seed+ |
| SendGrid | free plan retired | OUTDATED (new) | from ~$19.95 [verified] | legacy API + marketing suite | - | legacy |
| Twilio | active | KEEP | ~$0.011-0.013/SMS all-in [3p] | usage API for SMS/voice, carrier registration | register 10DLC, send, monitor | seed+ |
| Mixpanel | active | KEEP-ALT | free 1M events [3p] | event analytics polish | funnels, retention | seed |
| Amplitude | active | KEEP-ALT | free 10K MTU [3p] | behavioral analytics + experimentation | cohorts, experiments | Series A+ |
| Heap | acquired Dec 2023 | OUTDATED | quote only [3p] | autocapture + retroactive events | - | legacy |
| Segment | active (Twilio) | KEEP-ALT | free 1K MTU; $120 [3p] | CDP routing | route events | Series A+ |
| June | shut Aug 2025 | DEAD | - | B2B report templates | - | - |
| Hex | active | KEEP | Pro $36/editor [3p] | notebook -> apps -> AI chat | query, publish, Threads | Series A+ |
| Metabase | active | KEEP | OSS free; Starter ~$100 [3p] | GUI questions + dashboards | question -> dashboard -> email | pre-seed to Series B |
| Retool | active | KEEP (internal tools) | ~$50/user [3p, single source] | UI builder with write actions | build admin panel | seed+ |
| Mode | acquired 2023 | KEEP-ALT/declining | - | SQL/Python reports | - | legacy |
| Redash | OSS dormant | OUTDATED | free | SQL snippets dashboards | - | legacy |
| Chartio | shut Mar 2022 | DEAD | - | - | - | - |
