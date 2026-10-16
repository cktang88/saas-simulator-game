# The world around the founder: competition, platforms, support, ops, investors, life and co-founders (research, October 2026)

Compiled 2026-10-14 for the simulator. This file covers the systems that the other research files leave out:
competitors and market events, platform and AI-lab risk, customer support and reviews, product analytics,
operations and security, investor relations and governance, founder wellbeing and life events, co-founder
search, and five further systems (security questionnaires, renewals, accessibility, localization and
usage-based billing operations). Machine-readable values are in `public/data/world.js`.

**Not repeated here** (see the earlier files): AI Overviews CTR loss and SEO ramp (`marketing-and-ads.md` §SEO),
Stripe fees, disputes and Radar pricing (`finance-and-payments.md` §1), AI support-agent pricing and burnout
headline (`hr-legal-product.md` §1.1, §1.6), calendar load and inbound (`inbound-network-calendar.md`), fundraising
climate and SAFE terms (`fundraising.md`, `angels-and-landscape-2026.md`).

**Evidence labels.** [P] primary source (regulator, court, official docs, the study itself). [S] reputable secondary
summary of a primary source. [V] vendor data or vendor-sponsored survey; it is self-interested and its methods are
often unpublished. [Q] qualitative, anecdotal or practitioner consensus. [design] my own game estimate, built from
the evidence nearby; it is not a measured statistic. Several primary pages (Carta, Sifted, Gartner) blocked direct
fetches in this session, so some numbers come from search-engine summaries of those pages. They are marked [S].

---

## 1. Competitors and market dynamics

### 1.1 How crowded a niche is
- I found **no survey measuring how many direct competitors a typical new SaaS faces**. Treat any number as [design].
- Signals of crowding [V]: G2 lists 100,000+ products in 2,000+ categories (G2, 2025). That averages ~50 per category,
  but the distribution is very skewed (my arithmetic). Collaboration/productivity had 7,036 listed products in G2's
  2025 awards and customer service software had 3,453. In G2's Fall 2025 reports, "Agentic AI" added 22 products in one
  quarter and "AI Agents" added 18.
- SaaStr's analysis of IPO'd SaaS (qualitative) found ~70% were new versions of existing categories, so most startups
  enter markets that already have rivals [Q].
- **Game model [design]:** at niche creation, draw direct competitors as follows. Vertical B2B niche: 2–6. Horizontal SMB
  tool: 5–15. B2C consumer app: 10–40 look-alikes, of which 3–6 matter. Enterprise category: 3–8 incumbents plus 1–3
  funded startups. AI-native horizontal categories (notes, writing, agents, search) get ×2 entrants per year.

### 1.2 Competitor event rates
- **Pricing and packaging changes.** Kyle Poyar's PricingSaaS 500 index logged 339 changes in 2025: 126 pricing
  updates (increases, decreases, discounts) and 213 packaging updates [S, Growth Unhinged 2025]. That is ~0.7 changes per
  tracked company per year if the window is one year. An unattributed blog line says 57% of SaaS businesses had not
  changed pricing in the last year [V, unverifiable]. **Game [design]:** each active competitor makes ~0.5–0.8
  pricing/packaging moves per year. About 20–30% of those are cuts, free tiers or discounts that hurt you. The rest are
  increases or AI add-ons, which can help you.
- **Funding announcements.** I found no study of the effect of a rival's round on a small SaaS. Academic work covers VC
  market competition, not product competition [P, various]. **Game [design]:** in a niche with 3–6 venture-backed rivals,
  expect ~1 funding announcement a year. Effects: the rival's paid CAC tolerance rises (your paid CPC +10–25% for 3–6
  months in shared keywords), their outbound volume rises, and investors ask "why you vs X" in every meeting. There is
  also an upside: category validation (+5–10% inbound for B2B for ~60 days).
- **Well-funded competitor (qualitative pattern) [Q].** They can underprice or give a free tier for 12–24 months, outspend
  on ads and buy review-site placement. Indie founders usually win by niching down (a segment the funded player ignores),
  by service quality and by price stability. Venture-backed founders usually win by speed and narrative.
- **Exits.** Rivals get acquired or shut down. Under [design] rates of ~0.1–0.2 per rival per year, a niche of 5 rivals
  produces one exit roughly every 1–2 years. This is an opportunity (migrations, "switch from X" pages).

### 1.3 "Sherlocking" by AI labs and platforms, 2023–2026 (dated examples)
| Date | What shipped | Who it hit | Evidence |
|---|---|---|---|
| Late 2022–2023 | ChatGPT (free) | Jasper: internal valuation cut ~20%, 2023 revenue forecast cut ≥30%, layoffs July 2023, CEO change Sept 2023 | [S] Maginative 2023 |
| 2023 | ChatGPT PDF upload, Enterprise | "Chat with PDF" wrappers | [Q] newsletters |
| 2025-06-04 | ChatGPT **Record mode** (meeting notes, Team on macOS) plus connectors (Drive, SharePoint and others) | Meeting-notes tools (Granola, Otter) and enterprise search (Glean, Guru) faced overlap | [S] TechRepublic, ITPro 2025-06 |
| 2025-06-10 | OpenAI cut o3 price **80%** ($10/$40 → $2/$8 per M tokens) | A margin windfall for AI apps, and a lower moat for anyone who resold access | [S] Simon Willison, VentureBeat |
| 2025-10-06 | OpenAI DevDay: AgentKit and Agent Builder, Apps SDK | Speculation of pressure on agent builders and workflow tools (n8n, Zapier, Lindy). No documented losses | [Q] |
| 2025-10-21 | **ChatGPT Atlas** browser (macOS first, Agent Mode) | AI browser startups and browser extensions | [P] openai.com |
| 2025-11 | Claude Opus 4.5 at $5/$25 per M tokens (a cut from the $15/$75 Opus tier) | AI apps on top-tier models | [S] pricing aggregators |
| 2025-12-06/07 | Google cut Gemini API **free-tier** limits (2.5 Flash 250→20 requests/day per one tracker; 2.5 Pro free access removed) | Apps running on free quotas got sudden 429 errors | [S] agentdeals, dev.to (figures vary) |
| 2026-01-12 → early Feb 2026 | **Claude Cowork**, then Cowork plugins for legal, finance, sales, marketing and support | S&P 500 software & services index −~8% (~$1T) from Jan 28. Thomson Reuters −18%, RELX −14%, Wolters Kluwer −13%. Morgan Stanley SaaS index −15% YTD (as of Feb) | [S] Fortune 2026-02-06, Cyber Daily, Bloomberg summary |

What these imply for the game [design]:
- Sherlock risk depends on **how much of the value is a model capability** versus proprietary data, workflow depth,
  integrations, compliance and distribution. A thin wrapper on a horizontal task (notes, summarizing, writing, chat
  with docs, browsing) has the highest risk. A vertical workflow with proprietary data and integrations has the lowest.
- Lab launches also cut *your* costs (price drops) and add *capabilities* you can ship. Not every event is negative.

### 1.4 LLM price and model lifecycle
- **Price decline.** Epoch AI (Mar 2025) estimates that the price to reach a fixed capability level falls **9×–900× per
  year** depending on the benchmark threshold (e.g., GPT-4-level PhD science: ~40×/yr). The fastest declines were
  recent and may not persist [P, Epoch]. a16z frames it as ~10×/yr for equivalent performance [Q].
- **Frontier pricing does not fall that fast.** The newest top models launch at high list prices. The big savings come
  from moving the same task to a cheaper model tier.
- **Deprecations.** Anthropic publishes retirement dates and a deprecation policy (its docs mention ≥6 months' notice for
  publicly released models; third-party trackers cite ≥60 days historically, so check the current page) [P/S].
  Google's preview Gemini models can be deprecated with ~2 weeks' notice. Stable models get earliest-shutdown dates [S].
  OpenAI publishes a deprecations page. Its Assistants API shut down on 2026-08-26 after a one-year deprecation
  window [S, trackers].
- **Game [design]:** an AI-dependent product faces 1–2 forced model migrations a year (8–30 founder hours each: eval set,
  prompt retune, regression checks) and 2–4 notable price changes a year from major providers, mostly cuts of 30–80% on
  some tier.

### 1.5 Platform risk
- **Google Search.** Google confirmed ~3.3 core updates per year in 2022–2025 (13 in total). 2025 had March, June and
  December. 2026 so far: March (27 Mar–8 Apr) and May (21 May–2 Jun). Rollouts take ~2 weeks [S, SEJ, trackers]. AI
  Overviews effects are in `marketing-and-ads.md`.
- **Meta ads.** The NYT (2025) documented wrongful automated bans of business accounts and AI-handled appeals. Meta says its
  newer systems make 13% fewer mistakes than humans [S]. In 2026 practitioners report permanent Business Manager
  disables after unsupervised AI agents with write access bulk-edited ads through the API [Q, Porter Metrics, Jon Loomer].
  **No published base rate exists.** Game [design]: 10–25% chance per year of a restriction for an active advertiser.
  Use ×2 for health, finance, weight-loss or "AI that makes money" claims, ×2 for unpaced API automation, and ×0.5 with
  verified Business Manager and two-factor admins. Most restrictions resolve in 3–21 days. ~10–20% are permanent.
- **App stores.** Apple rejected ~25% of 7.77M submissions in 2024 and ~23% in 2025. Google Play rejected ~8–10%
  [S, Apple App Store Transparency Report via iClarified and Surfshark]. Apple terminated 146,747 developer accounts in
  2024, almost all for fraud, and reinstated 225 of 8,132 appeals [S]. A legitimate SaaS app faces review rejections,
  not terminations.
- **US iOS link-outs.** On 2025-04-30 the court in *Epic v. Apple* barred Apple from charging commission on purchases made
  through external links in US apps. Apple appealed. The commission question is still being litigated [P/S]. Effect: a B2C
  app can steer US users to web checkout and save the ~15–30% store fee, at some conversion cost.
- **Marketplaces.** Atlassian ended Server app sales and updates on 2024-02-15, so vendors had to rebuild for Cloud or Data
  Center [P, Atlassian]. Shopify, Salesforce and HubSpot marketplaces change review, ranking and revenue-share rules from
  time to time. Game [design]: for marketplace-dependent products, 0.2–0.4 material policy changes a year.

### 1.6 Macro (as of 2026-10-14)
- Fed funds target is **3.50–3.75%**, held for four meetings through 2026-06-17. The next decision is 2026-10-28
  [S, Advisor Perspectives]. Rates are no longer near zero, so the cost of capital and buyer caution stay moderate.
- Buyers in late 2025 [Q, Inside Software CIO survey 2025-11]: renewals are not rubber-stamped, expansions face tougher
  questions, and there is more discount pressure. 80% expect AI spend to rise in 2026. ~8% are cutting back after
  failed pilots. One summary puts public-SaaS NRR at ~108% (down from ~116%) and GRR at ~94% [S].
- 2023 CFO mandates cut software spend 10–30% (CloudEagle) [V, dated]. Use them as the "budget freeze" severity anchor.
- Game [design]: an enterprise budget-freeze wave is 0.2–0.35/yr (lasts 2–3 quarters: sales cycle ×1.3–1.6, expansion
  ×0.7). SMB "consolidation" pressure appears as +10–20% voluntary churn for "nice-to-have" tools in that period.

---

## 2. Customer support and reputation

### 2.1 Ticket volume
- I found no primary 2025 Zendesk per-customer figure. Zendesk's 2012 software benchmark (625 tickets/month per company,
  148 per agent) is obsolete [S].
- Repeated blog benchmarks [V/S, likely one shared origin, unverified]: **B2B SaaS 0.2–0.5 tickets per customer per
  month**, high-touch enterprise **0.5–1.0** per account, self-serve **<0.2** (Fullview, Callin). A Zendesk CX Trends
  2025 figure, as cited by a blog: B2B enterprise **4–8 contacts per customer per year**, B2C SaaS **1.2–2.4 per year**
  [S, unverified].
- **Game [design]:** tickets per paying customer per month: B2C 0.08–0.2, SMB 0.25–0.6, enterprise 1–4 per account
  (accounts have many users). Multiply by ×2–3 in the first 30 days after signup, ×1.5 for a week after a release with
  breaking changes, and ×3–10 during an outage. Good docs and in-app guidance give ×0.7. The existing
  `public/apps/people/support.js` SMB value (0.25 per week ≈ 1.1 per month) sits above this range. Consider 0.08–0.12
  per week.

### 2.2 Response time
- Freshworks 2025 benchmark (32,000+ companies) [V, via thisandthat.chat]: software/internet median first reply to a
  ticket ~**47 minutes**, top 20% <3 min, slowest tier ~6 h. Messaging channel median ~32 s.
- SuperOffice (1,000 companies, older) average email first response **12 h 10 min** [V/S].
- Typical B2B targets [Q]: good <12 h, better <4 h, best <1 h. Chat median ~1.5 min (Comm100 2025) [V].
- **Effect on churn.** timetoreply data [V]: 71% retention with replies in under 1 h vs 48% at 24 h. The vendor itself
  notes the confounding (hard cases are slow *and* churn-prone). CSAT 92% for replies in under 5 min vs 51% at 24 h [V].
  **Game [design]:** churn multiplier by median first response. <1 h: 0.95. 1–8 h: 1.0. 8–24 h: 1.08. 24–72 h: 1.2.
  >72 h or backlog growing: 1.35–1.5 (matches `maxChurnMult` 1.5). Enterprise customers weigh *resolution* time and SLA
  breaches more than first response.

### 2.3 AI resolution (2025–2026)
- Intercom Fin: vendor average ~67% (2025) and **76% across 12,000+ customers (June 2026)**. Intercom says Fin resolves
  81% of its own support [V]. Case studies cluster at **42–50%**. An independent 60-day SMB test across 4 clients
  measured **38%** [Q]. "Resolution" includes conversations where the customer stopped replying.
- Intercom 2026 Customer Service Transformation Report (2,400+ support professionals, published 2026-01-28): 82% of senior
  leaders invest in AI for support, but **only 10% have reached mature deployment** [V].
- Gartner prediction (2025-03-05): agentic AI will resolve 80% of common issues without humans by 2029 [P, a prediction].
- **Game [design]:** first-year AI resolution share 30–55%, scaled by docs quality. Mature (docs + actions such as
  refunds and plan changes): 55–70%. AI never resolves billing disputes, angry churn-risk customers, bugs or enterprise
  escalations. Bad AI answers produce a CSAT penalty and occasionally a public complaint.

### 2.4 Satisfaction benchmarks
- CSAT "good" 75–85% [V, Sobot]. SaaS ~80 on a 0–100 scale (aggregator) [V]. A 68% figure circulates but dates to 2022.
- NPS: Survicate 2025 B2B median 38, B2C 49, software 30 (B2B software 29) [V]. Userpilot B2B SaaS average 35.7 [V].
  Others put the B2B SaaS median ~36 [V]. Enterprise-focused products score higher than self-serve SMB tools [Q].

### 2.5 Reviews
- **Rules.** The FTC final rule on fake reviews and testimonials took effect **2024-10-21**. It bans fake or AI-generated
  reviews, buying reviews conditioned on sentiment, undisclosed insider reviews, review suppression and fake
  social-media indicators. Civil penalties of up to **$51,744 per violation** (2024 figure, adjusted annually for
  inflation) apply to knowing violations [P, FTC 2024-08-14]. Incentives are allowed only if not conditioned on positive
  sentiment and if disclosed. G2 and Capterra run gift-card campaigns on that basis.
- **Platform enforcement.** Trustpilot removed 4.5M fake reviews in 2024, which is 7.4% of submissions (6.1% in 2023), 90%
  of them automatically. It removed 7.8M in 2025 [V, Trustpilot Trust Report].
- **Response to review requests.** Automated email asks get 10–15% and personal in-person asks 30–45% in service
  businesses [V, Focus Digital; methodology unclear]. G2 advises asking after milestones (renewal, upgrade, 90 days) with
  up to 2 reminders [Q]. iOS caps the system rating prompt at 3 per user per 365 days [P, Apple docs].
  **Game [design]:** B2B SaaS email ask to a happy customer converts 4–10% (15–25% with an incentive allowed under the
  FTC rule), a personal ask after a win 20–35%, and an in-app B2C prompt 1–3% of prompted users.
- **Effect on conversion.**
  - Spiegel Research Center (Northwestern, 2017, e-commerce): a product with 5 reviews was ~4× (≈+270%) more likely to be
    purchased than one with none. Purchase likelihood peaks at **4.2–4.5 stars** and falls toward 5.0 (PowerReviews +
    Spiegel 2015, consumer goods) [P/S]. These are old non-SaaS studies. Treat them as shape, not magnitude.
  - App stores: NP Digital (Apr 2024, 49 companies) relative conversion 5★ = 1.00, 4★ = 0.83, 3★ = 0.57 [V]. Alchemer: 46%
    of consumers need ≥4 stars to consider an app [V].
  - B2B software: reviews were voted the most influential shortlist source in Capterra's 2025 Tech Trends survey (3,500
    respondents, 9 countries) [V]. In Capterra's 2023 SMB survey, 52% of decision makers said reviews significantly
    influence purchase, and 89% value verified reviews. Reviews under 1 year old convert best [V]. G2 2025 Buyer Behavior
    (~1,100 decision makers): AI chatbots (17%) and review sites (15%) were the top shortlist influences. G2 2026 (1,076
    buyers): **51% start research in an AI chatbot** more often than in Google, and 69% switched vendor based on chatbot
    guidance [V]. Reviews now matter partly because LLMs cite them.
  - **Game [design] thresholds:** 0 reviews: B2B trial-start ×0.9, B2C install ×0.8. 5+ reviews: ×1.0. 20+ recent (<12
    months): ×1.05, and LLM answers start mentioning you (organic AI-referral ×1.2). Rating 4.2–4.7 is best. Below 4.0:
    B2C install ×0.6–0.75, B2B ×0.85. A single 1★ review is visible but does little once n > 20.

---

## 3. Product analytics and operations

### 3.1 Activation, adoption, retention
- Userpilot benchmark (B2B SaaS; report dated 2024/2025 inconsistently) [V]: **activation 37.5% average (median 37%,
  n=62)**, **time-to-value 1 day 12 h**, onboarding checklist completion 19.2%, one-month retention 46.9%, **core feature
  adoption 24.5%**, NPS 35.7. By vertical: AI/ML tools 54.8% activation, FinTech 5%, healthcare 23.8%.
- Amplitude 2025 Product Benchmark Report (2,600+ companies, Sep 2023–Sep 2024) [V]: **7% day-7 retention** puts a product
  in the top 25%. 69% of top day-7 performers are also top at 3 months. Top-quartile user acquisition has no relationship
  with top-quartile retention.
- Pendo (2019, 615 subscriptions) [V, old]: 80% of features are rarely or never used. 12% of features generate 80% of
  clicks.
- **Game [design]:** activated users keep a 2–3× higher month-3 retention than non-activated users. Each day added to
  time-to-value lowers activation by ~3–6% relative for self-serve. A new feature is adopted by 10–30% of active accounts
  within 90 days unless it is on the core path.

### 3.2 Reliability
- 99.9% monthly uptime allows ~43 min of downtime per 30 days (~8.8 h/yr) [P, SLA arithmetic].
- DORA 2024: elite teams (~19% of respondents) recover from failed deployments in **under 1 hour** [S]. Change failure
  rates in the reports run ~5–15% for good teams, and the 2025 AI report cites 0–2% for elite [S, conflicting tiers].
- Uptime Institute 2025 (data-center operators, not SaaS): outage frequency fell for the 4th year. 53% of operators had an
  outage in 3 years. Power causes ~54% of impactful outages and IT/network 23%. Only 9% were serious [P/S].
- **Upstream outages small SaaS inherit:** AWS us-east-1 on 2025-10-19/20 (DNS, ~15 h of elevated errors per AWS's
  window). Cloudflare on 2025-11-18 (~4.5–6 h, a bot-management config file, which took down X, ChatGPT, Canva, Shopify
  and others) [S].
- **Game [design]** for a solo founder on managed cloud: 6–12 user-visible incidents a year (bad deploys, expired certs or
  domains, DB connection limits, third-party API breaks, LLM provider errors, queue backlogs). 1–2 of these are major
  (>1 h). MTTR for a solo founder: 20–90 min when awake and alerted, 4–10 h overnight with no paging. 2–4 upstream
  outages a year beyond your control. A public status page and a fast update reduce ticket volume and churn from an
  incident (support ×0.6 vs silence) [Q].

### 3.3 Cost growth and surprise bills
- Hosting per user is usually small. AI inference dominates for AI products (see `hr-legal-product.md` §3.5). Price
  declines (§1.4) mean costs per task fall 30–80% a year *if you migrate tiers*.
- Bill shock [Q]: a Firebase user was reportedly billed ~$70k (Appwrite blog, Jan 2025). Google Cloud/Firebase spend caps
  pause a service at 100% (preview). AWS spend limits exist only for limited customers. Cursor's June 2025 credit-pool
  change led to a public apology and refunds [S]. "Denial of wallet" covers runaway loops, leaked keys and
  prompt-injected agents.
- **Game [design]:** for a product with metered AI or serverless, a surprise bill of 3–30× normal monthly infra happens
  0.15–0.4 times a year without caps and alerts, and 0.03–0.08 with them. Providers forgive 0–100% on request (one-time
  goodwill is common, not guaranteed).

### 3.4 Security
- **Card testing.** At the 2022 peak Stripe blocked 20M+ card-testing attempts a day, up 100× since 2019 [P, Stripe].
  Stripe later reported successful card testing down 80% while overall fraud rose 11% [P, Stripe blog, undated]. One
  merchant (Reddit, 2024) saw 12,590 screened attempts in one attack and a Radar bill of ~$11k vs an expected ~$250.
  Stripe waived fees in some reported cases [Q]. Costs: Radar screening fees, authorization fees on custom plans, disputes
  ($15 each, see finance doc), account risk flags and a lower auth rate.
  **Game [design]:** 0.3–1.0 attacks a year for self-serve checkout without CAPTCHA or rate limits, 0.1–0.3 with them,
  ~0 for invoice-only enterprise. An attack is 500–20,000 attempts over 1–48 h. Cost $50–$3,000 plus 2–8 founder hours.
- **Leaked secrets.** GitGuardian 2025: **23.8M secrets** leaked on public GitHub in 2024 (+25% YoY). **70% of secrets
  leaked in 2022 were still valid**. 35% of private repos contain plaintext secrets [V].
  **Game [design]:** 0.05–0.2 leaked-key incidents a year, higher with public repos and no secret scanning. An LLM API key
  leak costs $100–$20,000 of abuse in 1–3 days.
- **Breaches at SMBs.** Verizon DBIR 2025 (12,195 breaches): ransomware in **88% of SMB breaches** vs 39% at large orgs.
  Median ransom $115k. 64% of victims didn't pay. 54% of ransomware victims' domains appeared in infostealer logs
  [P/S]. Game [design]: a material breach at a tiny SaaS is 0.01–0.04 a year, ×2 for no MFA on admin accounts.
- **Notification duties.** GDPR: notify the regulator within **72 hours** of awareness when there's risk, and notify people
  without undue delay when the risk is high [P]. US: every state has a breach law. Resident notice is typically "without
  unreasonable delay", often 30–60 days, with AG notice above thresholds [S]. B2B DPAs often require notifying customers
  in 24–72 h. Budget: a lawyer at $5–25k for a small incident [design].
- **Backups.** Managed Postgres point-in-time recovery is typically 7 days by default on most providers [Q]. Untested
  backups are the common failure. Game: a 0.02/yr data-loss event when backups are untested [design].

---

## 4. Investor relations and governance
- **Cadence.** Monthly updates from pre-seed to Series A and quarterly after B is the dominant norm [Q/V, Visible]. Visible
  users send updates to 57 recipients on average [V]. The claim that updating founders are "3× more likely to raise
  follow-on" has no published method [V, unverified]. Do not use it as a coefficient.
- **Content consensus [Q]** (Visible, Mercury and practitioner guides): one-line summary, KPIs with stable definitions
  (MRR, growth, burn gross/net, runway, cash, customers, headcount), 3–5 highlights, lowlights told honestly, and up to
  ~3–4 specific asks (intros by name, hires, advice). Investors assume the worst when updates stop.
- **Game [design]:** writing an update takes 1–3 h a month (30–60 min with a template and live metrics). Effects: per
  update, a 5–15% chance that a specific ask is fulfilled (intro, candidate or customer). Investor "warmth" decays ~10% per
  missed month. Consistent updates for 6+ months give ×1.3 to insider pro-rata/bridge odds when a raise starts. A
  bad-news update sent early does *not* lower warmth, but surprise bad news at the raise does (−30%).
- **Board.** After a priced seed, boards are typically 3 seats (founder(s) + lead, or + independent) [Q, TechCrunch,
  Causo]. They meet every 6–8 weeks at seed or Series A (LSVP), or quarterly [Q]. SAFE rounds usually create no board seat and
  no information rights. Priced rounds give "major investors" information rights (annual financials, often quarterly
  unaudited statements and budget) [Q, NVCA model docs]. Game [design]: prep 6–12 h for the first meeting, then 3–6 h. A
  meeting lasts 1.5–3 h.
- **Advisors.** The FAST agreement (Founder Institute) template is free. Grants run **0.25–1%** at the idea/pre-seed stage
  (lower later), vest ~2 years monthly, and the cliff varies (0–3 months) [Q, secondary summaries]. Advice: work together
  for ~1 month before granting [Q]. Game [design]: an engaged advisor gives 1–2 h/month and 1–4 useful intros a year. ~50%
  of advisors go quiet within a year.

---

## 5. Founder wellbeing and life

### 5.1 Burnout, hours, mental health
- Sifted (Feb 2025, n=138, European founders) [S]: **54% burned out in the past 12 months**, 75% anxiety, 46% rated their
  mental health bad or very bad, **67% work >50 h/week**, and 49% said their workload grew.
- MaRS (Canada, 2025): burnout in 65% of women founders vs 42% of men [S].
- BII (India, Jul 2026, n=50): 88% work ≥50 h/week, and 71% are burned out at least a few times a year [S, small sample].
- Freeman et al. (2019, *Small Business Economics*, n=242 US entrepreneurs): 49% reported at least one lifetime mental
  health condition, 72% including family history [P, recalled; not re-fetched this session].
- Loneliness: 26.9% named loneliness as a struggle (Lonely Entrepreneur 2025, n=227) [V]. Other surveys report ~76%
  (Foundology 2024, unverified). Wording drives the gap. Solo founders lack a peer to share decisions with [Q].
- **Sleep and decisions.** One night without sleep blunts the brain's response to wins and losses (Penn/Ottawa, n=56).
  Chronic restriction is worse than one all-nighter (Salfi et al. 2020, n=74). Sleep-deprived people take more risk when
  they expect to succeed and are more confident in risky choices [P/S].
- **Game [design]:** energy 0–100. Each week over 55 h costs 3–6 points and each week under 45 h with a day off restores
  4–8. Sleep under 6 h costs 5. Below 40: decision noise (LLM-graded choices get a confidence bias, +10–20% chance of an
  overconfident pricing or hiring choice), feature velocity ×0.8, support tone worse (CSAT −5 pts). Below 20: a burnout
  episode (2–6 weeks at 30–50% capacity). Base annual burnout risk is ~50% at >60 h/wk (matches `hr-legal-product.md`),
  ~20% at 45–55 h with a peer group or therapy.
- Resources [Q]: founder peer groups (YC, On Deck-style, local), therapy/coaching (~$100–250 per session in the US), and
  the 988 crisis line (US). The game should surface these, not moralize.

### 5.2 Life events (annual frequency anchors)
| Event | Base rate | Source |
|---|---|---|
| Flu | ~8% of US population per season (3–11%) | CDC burden estimates via secondary summary [S] |
| Minor illness (cold, stomach bug) | 1–3 episodes/yr, 1–3 days lost each | [design]; no CDC figure verified this session |
| Moving home | 11.8% of US population moved in 2024 (ACS) | Census ACS via StartBusinessByState [S] |
| Family caregiving | 63M US adults (~24%) were caregivers in the past 12 months. ~1 in 4 of them give 40+ h/week | AARP/NAC, 2025-07-24 [P] |
| Wedding, new child, bereavement, injury, jury duty | 0.02–0.1 each per year depending on age and profile | [design] |

### 5.3 Long hours, sleep and overwork (accessed 2026-10-16)
- **Output per hour falls past ~50 h/week.** Pencavel (2014/2015, *The Economic Journal*, "The Productivity of Working
  Hours", 1916 British munitions data, 122 weekly observations): output is proportional to hours up to ~49 h/week, rises
  at a decreasing rate above that, and output at 70 h barely differs from output at 56 h [P, via The Economist, GovExec,
  Big Think summaries]. Caveat: observational, one industry; a 2026 review (Soon) notes the elasticity above 49 h is not
  clearly different from zero and a modern call-centre panel found no threshold [S].
- **55 h+ weeks harm health.** WHO/ILO (17 May 2021, Pega et al., *Environment International*): working ≥55 h/week vs
  35–40 h is associated with a **35% higher risk of stroke** and **17% higher risk of dying from ischemic heart
  disease**; 745,000 deaths in 2016 (398k stroke, 347k heart disease) [P].
- **12 h+ days mean more mistakes.** Dembe et al. (2005, *Occup. Environ. Med.*, NLSY, 10,793 people, 110,236 job
  records): overtime schedules **+61% injury hazard**, ≥12 h/day **+37%**, ≥60 h/week **+23%**, with a dose-response by
  hours per day [P; observational, later rated low certainty].
- **Chronic short sleep builds deficits you don't feel.** Van Dongen et al. (2003, *Sleep* 26(2):117–126, n=48): 14
  nights of 6 h or 4 h in bed caused cumulative, dose-dependent cognitive deficits while subjective sleepiness
  plateaued after a few days. Secondary summaries equate 14 nights at 6 h with roughly one night of total sleep
  deprivation [P, equivalence via secondary sources]. Recovery is slow: three recovery nights did not restore
  performance after a week of restriction (Belenky et al. 2003), nor did one 10 h night after five 4 h nights
  (Banks et al. 2010) [P, recalled, not re-fetched this session].
- **Short sleep → more colds.** Prather et al. (2015, *Sleep*, n=164, rhinovirus challenge): <5 h sleep OR 4.50 and
  5–6 h OR 4.24 for developing a cold vs >7 h; 6–7 h not significantly different [P]. Cohen et al. (2009): <7 h ≈ 2.9x
  [P, recalled].
- **Game model (core/overwork.js, core/wellbeing.js)** — all [design] unless cited:
  - Planned hours (founder.hoursPerWeek spread over the days) are a plan, not a limit. The player can work past it,
    on weekends and on the protected day off. The day ends on End day or at 18 h of work (physical ceiling, carries
    over); 120 h/week is refused.
  - Fatigue: each hour past 10 h in a day counts 0.9, past 12 h 0.75, past 14 h 0.6, past 16 h 0.5; each hour past
    60 h in a week 0.85, past 70 h 0.7, past 80 h 0.5 (shape from Pencavel and Dembe; the game starts at 60 h because
    the default plan is 55 h). The missing efficiency is charged as extra hours ("Fatigue: slower work, mistakes &
    redo"). Sleep debt multiplies it: −1% per hour of debt, floor 0.6 (Van Dongen magnitude).
  - Sleep ≈ 24 − work − 4 h of life, capped at 8. Debt = 8 − sleep per night; a ≤10 h day repays 1.5 h, a rest day
    3 h (slow recovery per Belenky/Banks). Debt caps at 40 h.
  - Each hour past 12 in a day costs 1 energy; each hour past 80 in a week costs 0.3 more on top of the weekly drain.
    Weekly burnout hazard × (1 + debt/20). With ≥10 h of debt, colds/flu come 3x as often (Prather/Cohen, rounded).
  - Working more than 0.5 h on the protected day off forfeits its weekly recovery.
  - Each week with a day past 12 h, more than 80 h, real fatigue or a worked day off is logged as a founder_time
    mistake with the fatigue hours as its cost, so the bill is traceable on the Scorecard and in You.

---

## 6. Co-founder search
- **Solo is common.** 36% of new startups are solo-led (Carta 2025), and YC 2026 batches are 11–19% solo (see `fundraising.md`).
- **Equity split.** Carta: two-founder teams split **exactly equally 45.9% of the time (2024)**, up from 31.5% in 2015.
  2025 estimates are 44–46%. Median split 51/49. Ten-year average 38.8% [S, Carta data posts]. Larger teams split less
  equally.
- **Breakups.** Carta (Dec 2024, 13,133 founders): **~25% of VC-backed startups lose a co-founder by year 4**. Departures
  cluster in years 1–3 (17.1% gone after 3 years for the Q1 2017 cohort) [S]. April 2025 data showed slightly rising
  rates, while March 2026 (18,920 startups) shows recent cohorts edging lower. Shut-down companies are excluded, so true
  rates are higher. Wasserman: 65% of failures of high-potential startups are due to "people problems" (broad, not only
  co-founder conflict) [S].
- **Matching platforms.** YC Co-Founder Matching (launched publicly July 2021): 16,000+ profiles, 130k invites, **25%
  acceptance**, 33k matches in the first ~3 months. 55% of matches were in the same country and 61% within 3 time zones
  [P, YC blog 2021]. **No 2024–2026 outcome data is published.** Platform matches happen in days or weeks. Converting to
  a real partnership takes months and often doesn't happen [Q].
- **Time to find:** 3–6 months when run like an executive search, 3–12 months through the network [Q]. Practitioners
  recommend a **1–3 month paid or unpaid trial project** before formalizing [Q].
- **Vesting.** Standard 4 years with a 1-year cliff. A new co-founder joining an existing company usually gets a new 4-year
  schedule. At a priced round, investors may ask founders to re-vest. Credit of ~10–25% (sometimes 25%) vested is typical
  [S, CMS, Holloway, Entrepreneur].
- **Game [design]:** search funnel per month of active effort (10 h/month): 15–40 profiles viewed, 4–10 intro calls, 1–2
  deep conversations, 0.15–0.35 trial starts. Trial success (both want to continue) is 35–55%. After signing, annual
  breakup hazard is ~8–10% in years 1–3 and ~3% after, ×1.5 for strangers met online without a trial, ×0.7 for prior
  colleagues. A breakup costs 4–12 weeks of disruption and a repurchase of unvested shares. Without vesting it causes a
  cap-table problem (dead equity) that venture investors flag.

---

## 7. Other systems a realistic founder sim needs (top 5)
1. **Enterprise security reviews and trust center.** CAIQ v4 has ~261 questions (17 domains). SIG Lite has ~150–200 and the
   full SIG 800+. A first manual questionnaire takes **20–40 h**. With an answer library it takes 2–8 h, and with SOC 2
   plus a trust center it takes near 0. The average enterprise sends 150+ assessments a year (Prevalent 2025), and 74% accept
   a pre-completed standard (Whistic 2025) [V]. Game: each enterprise deal past the demo stage triggers one questionnaire.
   No SOC 2 means a 20–40% deal-loss risk at mid-market+ (see `hr-legal-product.md` §2.5).
2. **Renewals and customer success.** Annual contracts commonly carry 5–10% uplifts, negotiated down to caps of ~5%.
   Average negotiated discounts were 15–20% in CostBench deal data for two CS tools [V]. Zendesk pushed ~15% unit-rate
   increases at renewal (SaaStr) [S]. Game [design]: a renewal event at T−90 days for annual accounts, a QBR every
   quarter for >$10k ACV (2–4 h prep), and a price-increase acceptance of 70–90% at ≤7% uplift and 50–70% at 15%+.
3. **Accessibility.** The European Accessibility Act's service obligations apply from **2025-06-28** (WCAG-based EN 301 549).
   Microenterprises (<10 staff and ≤€2M turnover or balance sheet) are exempt for services. Existing services have
   transition periods to 2030. Public tenders require conformance regardless [S, multiple]. US enterprise and public buyers
   ask for a VPAT/ACR. Game: an "accessibility request" event for enterprise/public deals (0.5–2 a year once selling
   up-market). Remediation takes 20–80 h for a typical web app [design].
4. **Internationalization and localized pricing.** Claims of +25–30% conversion from local currency or local payment
   methods trace to Paddle/ProfitWell blog posts I could not verify [V, unverified]. Game [design]: local currency ×1.05–1.15
   conversion in non-US markets, local payment methods ×1.1–1.3 in markets where cards are weak, and UI translation 10–40 h
   per language plus ongoing support load in that language. VAT/MoR implications are in the finance doc.
5. **Usage-based and AI-credit billing operations.** Usage-based pricing adoption was 85% among 100 surveyed SaaS companies
   (Metronome/Greyhound, Jan 2025, not market-wide) [V]. Stripe reportedly acquired Metronome (Jan 2026) [S, one source].
   Operational load: metering accuracy, invoice disputes, spend caps and alerts for customers, and credit pools (Cursor June
   2025 backlash). Game [design]: each month with usage billing, 2–5% of usage-billed customers question an invoice. A
   pricing change without grandfathering gives a 10–30% chance of a public backlash event.

Honorable mentions for later: weekly planning and OKR rituals (the calendar already exists), domain and brand (domain
renewal lapse risk, trademark conflict letters, see the legal doc), and partner/integration maintenance when an
upstream API changes.

---

## 8. Simulation parameters
| Parameter | Value / range | Conditioning | Source + date |
|---|---|---|---|
| Direct competitors at start | vertical B2B 2–6; horizontal SMB 5–15; B2C 10–40 (3–6 matter); ent 3–8 + 1–3 funded | niche type, AI-native ×2 entrants/yr | [design]; G2 counts 2025 [V] |
| New direct entrant | 1–4/yr (AI horizontal 3–8) | category heat, aiDependence | [design]; G2 Fall 2025 AI categories +18–22/quarter [V] |
| Competitor pricing/packaging move | 0.5–0.8 per rival/yr; 20–30% hurt you | rival count | PricingSaaS 500 via Growth Unhinged 2025 [S]; [design] |
| Rival funding announcement | ~1/yr in a VC-heavy niche | path, model ent ×1.5 | [design] |
| AI-lab overlapping launch | 0.3/yr base; ×3 thin horizontal wrapper; ×0.3 deep vertical | aiDependence, horizontal vs vertical | dated examples 2023–2026 [S]; [design] |
| LLM price cut on a tier you use | 2–4/yr, −30–80% | aiDependence | o3 −80% 2025-06-10 [S]; Epoch 2025-03 [P] |
| Forced model migration | 1–2/yr, 8–30 h each | aiDependence, provider | Anthropic/OpenAI/Google deprecation pages [P/S] |
| Google core update | ~3.3/yr; ~2-week rollout | SEO share of acquisition | SEJ/trackers 2022–2026 [S] |
| Meta ad account restriction | 10–25%/yr active advertisers; 10–20% permanent | category, automation, verification | NYT 2025 [S]; [design] |
| App review rejection | Apple ~23–25% of submissions; Google ~8–10% | per submission | Apple transparency 2024/2025 [S] |
| Enterprise budget freeze | 0.2–0.35/yr; 2–3 quarters; cycle ×1.3–1.6 | model ent/smb, macro | CloudEagle 2023 [V]; CIO survey 2025-11 [Q]; [design] |
| Tickets / customer / month | B2C 0.08–0.2; SMB 0.25–0.6; ent 1–4 per account; ×2–3 first month | docs quality, release, outage | Fullview/Callin/Zendesk-via-blog [V]; [design] |
| First response median (software) | ~47 min (top 20% <3 min, slow tier ~6 h) | channel | Freshworks 2025 [V] |
| Churn multiplier by first response | <1h 0.95; 1–8h 1.0; 8–24h 1.08; 24–72h 1.2; >72h 1.35–1.5 | model (ent weighs SLA) | timetoreply [V, confounded]; [design] |
| AI resolution share | 30–55% yr 1; 55–70% mature | docs quality, actions | Intercom 67%→76% [V]; independent 38% [Q]; [design] |
| CSAT good / NPS median | CSAT 75–85%; NPS B2B ~30–40, B2C ~49 | model | Survicate 2025, Userpilot [V] |
| Review request → review | email 4–10% (B2B), incentive 15–25%, personal 20–35%, in-app 1–3% | happiness, timing | Focus Digital [V]; [design] |
| Rating → conversion | 5★ 1.00, 4★ 0.83, 3★ 0.57 (apps); peak 4.2–4.5 | B2C stronger than B2B | NP Digital 2024 [V]; Spiegel 2015/2017 [P] |
| Review count threshold | 0: ×0.8–0.9; 5+: ×1.0; 20+ recent: ×1.05 + AI-answer mentions | recency <12 months | Spiegel 2017 [P]; Capterra [V]; [design] |
| FTC fake-review penalty | up to $51,744 per violation (2024, indexed) | knowing violations | FTC 2024-08-14 [P] |
| Activation rate | 37.5% avg (AI tools ~55%, fintech ~5%) | product type, TTV | Userpilot [V] |
| Time to value | ~1.5 days avg | onboarding | Userpilot [V] |
| Core feature adoption | ~24.5%; new feature 10–30% in 90 days | placement | Userpilot [V]; [design] |
| Day-7 retention top quartile | ≥7% (D7 median far lower) | — | Amplitude 2025 [V] |
| Activated vs non-activated M3 retention | 2–3× | — | [design] from Amplitude 69% overlap [V] |
| User-visible incidents | 6–12/yr; 1–2 major; 2–4 upstream | stack, deploy hygiene | [design]; AWS/Cloudflare 2025 [S] |
| MTTR solo | 20–90 min awake; 4–10 h overnight | alerting | DORA elite <1 h [S]; [design] |
| Surprise cloud/AI bill | 0.15–0.4/yr no caps; 0.03–0.08 with caps; 3–30× monthly infra | metered usage | Appwrite/Firebase anecdote [Q]; [design] |
| Card-testing attack | 0.3–1.0/yr exposed checkout; 0.1–0.3 protected; $50–3,000 + 2–8 h | checkout type | Stripe 2022 [P]; Reddit 2024 [Q]; [design] |
| Leaked secret | 0.05–0.2/yr; $100–20,000 abuse | public repos, scanning | GitGuardian 2025 [V]; [design] |
| Breach | 0.01–0.04/yr; ×2 without admin MFA | data sensitivity | Verizon DBIR 2025 [P]; [design] |
| Breach notification | GDPR 72 h; US 30–60 days typical | jurisdiction | GDPR Art. 33 [P]; state laws [S] |
| Investor update time / effect | 1–3 h/mo; 5–15% ask fulfilled per update; warmth −10%/missed month | path vc | Visible [V]; [design] |
| Board cadence / prep | every 6–8 wks to quarterly; prep 6–12 h first, 3–6 h later | priced round | LSVP, Causo [Q]; [design] |
| Advisor equity | 0.25–1% over ~2 yrs | stage | FAST via secondary [Q] |
| Burnout prevalence | ~54% founders/yr (EU sample) | hours, peer support, gender | Sifted 2025-02 [S]; MaRS 2025 [S] |
| Hours | 67% work >50 h/wk | stage | Sifted 2025 [S] |
| Flu / moving / caregiving | 8%/season; 11.8%/yr; 24% adults/yr | age, family | CDC [S]; ACS 2024 [S]; AARP 2025 [P] |
| Equal split (2 founders) | ~44–46% (2024–2025) | — | Carta 2024–2026 [S] |
| Co-founder departure | ~25% of VC-backed lose one by yr 4 | met-how, trial | Carta 2024-12 [S] |
| Co-founder search time | 3–6 months (network 3–12) | effort | practitioner guides [Q] |
| YC matching acceptance | 25% of invites (2021) | — | YC blog 2021 [P] |
| Vesting credit at reset | 10–25% vested | leverage | CMS, Entrepreneur [S] |
| Security questionnaire | 20–40 h first; 2–8 h with library | SOC 2, trust center | Wolfia etc. [V] |
| Renewal uplift acceptance | 70–90% at ≤7%; 50–70% at ≥15% | ACV, switching cost | CostBench [V]; [design] |

---

## 9. Obsolete advice (2016–2022 → 2026)
| Old advice | 2026 reality |
|---|---|
| "Ignore competitors, just build." | Still mostly right for strategy, but AI labs and platforms now ship overlapping features several times a year. Track lab roadmaps and keep the value in data, workflow and distribution, not the model. |
| "Build on GPT and your moat is the prompt." | The 2023–2026 record (Jasper; record mode; Atlas; Cowork plugins) shows thin wrappers get commoditized. Model prices also fall 10×+ a year for fixed capability, so resold access is not a moat. |
| "Rank on Google and traffic compounds." | Core updates ~3×/yr, AI Overviews and chatbot-first research (51% of B2B buyers in 2026) shift effort toward being cited and reviewed. |
| "Buy a few reviews to get started." | Illegal under the FTC rule since 2024-10-21, with penalties per violation. Platforms remove ~7% of submissions as fake. Incentives are allowed only if not conditioned on sentiment and if disclosed. |
| "Hire support person #1 at ~100 customers." | AI agents resolve 30–70% of tier-1 depending on docs. The founder handles escalations longer. Only 10% of support orgs report mature AI deployment, so quality varies. |
| "Reply to support within 24 h, it's fine." | The software median is under an hour. Slow replies correlate with churn (confounded but consistent). |
| "Card testing is Stripe's problem." | You pay the screening, authorization and dispute fees and take the risk flags. Add CAPTCHA, rate limits and Radar rules before launch. |
| "Investor updates quarterly, if at all." | Monthly at pre-seed and seed is the norm. Consistent updates are the cheapest way to keep insiders warm for a bridge. |
| "Find a co-founder before you start." | 36% of startups are solo-led, and AI coding agents cover much of what a technical co-founder used to. If you add a co-founder, run a 1–3 month trial and use vesting: ~1 in 4 VC-backed teams loses a co-founder by year 4. |
| "Accessibility only matters for government." | The EAA applies to EU services since 2025-06-28 (microenterprises exempt), and enterprise buyers ask for VPATs. |

---

## 10. Data gaps (do not fake these in the game)
- No published base rate for: Meta ad account restrictions, direct competitor count, effect of a rival's funding round,
  small-SaaS incident frequency, card-testing frequency per merchant, YC matching outcomes after 2021, co-founder trial
  success rates. All game values for these are [design].
- Ticket-per-customer benchmarks circulate without a traceable primary source.
- Review-count thresholds for B2B software come from e-commerce studies (Spiegel). B2B magnitude is unmeasured.

## Sources (accessed 2026-10-14 unless noted)
- G2 report pages 2025: https://company.g2.com/news/g2-fall-2025-reports ; awards via https://userguiding.com/blog/g2-best-software-awards-2025
- G2 Buyer Behavior 2025: https://company.g2.com/news/buyer-behavior-in-2025 ; Answer Economy 2026: https://company.g2.com/news/g2-research-the-answer-economy
- PricingSaaS 500 (Kyle Poyar, 2025): https://kylepoyar.substack.com/p/saas-pricing-changes-2025
- SaaStr on category novelty: https://www.saastr.com/dear-saastr-do-vcs-prefer-startups-with-no-competiton-or-those-disrupting-competitive-spaces
- Jasper 2023: https://www.maginative.com/article/jasper-cuts-internal-valuation-as-ai-growth-slows/
- ChatGPT record mode, 2025-06-04: https://www.techrepublic.com/article/news-openai-chatgpt-connectors-record-mode/ ; https://itpro.com/technology/artificial-intelligence/chatgpt-update-record-cloud-connectors
- ChatGPT Atlas, 2025-10-21: https://openai.com/blog/introducing-chatgpt-atlas
- o3 price drop, 2025-06-10: https://www.simonwillison.net/2025/Jun/10/o3-price-drop ; https://venturebeat.com/ai/openai-announces-80-price-drop-for-o3-its-most-powerful-reasoning-model
- Claude Cowork selloff, 2026-02: https://fortune.com/2026/02/06/anthropic-claude-opus-4-6-stock-selloff-new-upgrade/ ; https://www.cyberdaily.au/culture/13195-anthropics-latest-products-cause-stock-market-slump-as-traditional-saas-offerings-questioned
- Epoch AI inference price trends (2025-03): https://epoch.ai/data-insights/llm-inference-price-trends
- Anthropic deprecations: https://docs.anthropic.com/en/docs/resources/model-deprecations ; tracker https://hidekazu-konishi.com/entry/ai_model_deprecation_and_lifecycle_calendar.html
- Gemini free-tier cut, 2025-12: https://agentdeals.dev/digest/2025-w49
- Google core updates: https://www.searchenginejournal.com/google-begins-rolling-out-may-2026-core-update/575589/ ; https://coalitiontechnologies.com/blog/google-algorithm-updates-by-the-numbers-frequency-duration-and-impact-2026-update
- Meta wrongful bans (NYT via): https://aiweekly.co/alerts/metas-ai-moderation-wrongly-deleted-business-accounts-nyt-finds ; https://portermetrics.com/en/tutorial/meta-ads-ban/
- Apple/Google app review: https://www.iclarified.com/97465/apples-2024-app-store-report-129m-accounts-terminated-82k-apps-removed-19m-rejected/comments ; https://surfshark.com/research/chart/removed-apps-2025
- Epic v. Apple 2025-04-30: https://adapty.io/blog/new-us-ruling-on-external-ios-payments/ ; https://www.courthousenews.com/apples-fight-over-commissions-for-linked-out-app-store-purchases-continues-in-federal-court/
- Atlassian Server apps end: https://developer.atlassian.com/platform/marketplace/knowledge-base/end-of-sale-and-support-for-server-apps
- Fed funds 2026-06-17: https://advisorperspectives.com/dshort/updates/2026/06/18/feds-interest-rate-decision-june-17-2026
- CIO FY26 spend: https://insidesoftware.substack.com/p/inside-software-112325-what-200-cios ; CloudEagle 2023: https://www.nasdaq.com/press-release/report:-companies-have-cut-software-spend-up-to-30-as-it-hits-$3500-per-employee
- Ticket volume: https://www.fullview.io/blog/customer-support-metrics ; https://stealthagents.com/research/customer-support-contact-rate-statistics-2026
- Response time: https://www.thisandthat.chat/blog/b2b-saas-first-response-time-benchmarks/ ; https://cosupport.ai/articles/hidden-cost-slow-support-response-time-csat-revenue-impact
- Intercom Fin: https://theaiagentindex.com/agents/intercom-fin ; https://builts.ai/blog/intercom-fin-ai-review/ ; https://superframeworks.com/articles/best-ai-customer-support-tools ; report https://community.intercom.com/product-updates/customer-service-transformation-report-2026-13729
- Gartner 2025-03-05: https://www.gartner.com/en/newsroom/press-releases/2025-03-05-gartner-predicts-agentic-ai-will-autonomously-resolve-80-percent-of-common-customer-service-issues-without-human-intervention-by-20290
- NPS: https://survicate.com/nps-benchmarks/ ; CSAT: https://www.sobot.io/article/what-is-csat-score-good-csat-score-benchmarks-2025/
- FTC rule: https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials ; https://dwt.com/insights/2024/08/ftc-finalizes-rule-banning-fake-consumer-reviews
- Trustpilot Trust Report 2025: https://press.trustpilot.com/trust-report-2025
- Review response rates: https://focus-digital.co/average-review-response-rate/
- Spiegel: https://spiegel.medill.northwestern.edu/wp-content/uploads/sites/2/2021/04/Online-Reviews-Whitepaper.pdf
- App ratings: https://neilpatel.com/marketing-stats/app-downloads-vs-ratings/ ; https://www.alchemer.com/resources/blog/mobile-ratings-good-bad-ugly/
- Capterra: https://www.businesswire.com/news/home/20250204877890/en/Capterra-Survey-Reveals-Secrets-of-Satisfied-UK-Software-Buyers ; https://gcom.pdo.aws.gartner.com/en/digital-markets/insights/impact-recent-customer-reviews-product-visibility
- Userpilot benchmarks: https://userpilot.com/saas-product-metrics/
- Amplitude 2025: https://amplitude.com/blog/7-percent-retention-rule ; https://amplitude.com/blog/b2b-technology-product-benchmarks
- Pendo 2019: https://www.pendo.io/resources/the-2019-feature-adoption-report/
- DORA summaries: https://www.flagsmith.com/blog/dora-metrics ; https://rdel.substack.com/p/rdel-115-what-are-the-2025-benchmarks
- Uptime Institute 2025: https://uptimeinstitute.com/about-ui/press-releases/uptime-announces-annual-outage-analysis-report-2025
- AWS/Cloudflare 2025: https://www.tomsguide.com/computing/internet/the-10-most-impactful-outages-of-2025 ; https://www.softwareseni.com/the-2025-aws-and-cloudflare-outages-explained
- Spend caps / bill shock: https://appwrite.io/blog/post/budget-caps-stop-unexpected-cloud-bills.md ; https://firebase.google.cn/docs/projects/billing/spend-caps ; https://usagepricing.com/blueprint/trends/bill-shock-governance
- Stripe card testing: https://stripe.com/ie/newsroom/news/card-testing-surge ; https://stripe.com/de/blog/how-stripe-radar-responded-to-a-new-wave-of-card-testing ; https://docs.stripe.com/card-testing
- GitGuardian 2025: https://blog.gitguardian.com/the-state-of-secrets-sprawl-2025/
- Verizon DBIR 2025: https://verizon.com/about/news/2025-data-breach-investigations-report ; https://infosecurity-magazine.com/news/verizon-dbir-smb-ransomware-attacks
- Breach notification: https://consently.net/blog/data-breach-notification
- Visible investor updates: https://visible.vc/investor-updates/ ; Mercury: https://mercury.com/blog/how-to-write-an-effective-investor-update
- Boards: https://lighthouse.lsvp.com/resources/board-meetings ; https://hub.causo.ai/guides/first-board-meeting-prep-seed
- FAST/advisors: https://www.allied.vc/guides/how-much-equity-for-startup-advisors ; https://www.growthmentor.com/blog/startup-advisor-compensation
- Sifted 2025: https://sifted.eu/articles/founders-mental-health-2025 ; BII 2026: https://yourstory.com/2026/07/bii-startup-wellness-survey-cost-of-building-companies
- Loneliness: https://lonelyentrepreneur.com/founder-isolation-curve/
- Sleep: https://neurosciencenews.com/sleep-loss-decision-making-25287/ ; https://pmc.ncbi.nlm.nih.gov/articles/PMC7261660/
- Long hours and overwork (5.3): https://www.govexec.com/management/2014/12/you-really-can-work-longer-hours-without-killing-your-productivity/101394 ; https://soon.works/research/do-longer-hours-produce-more-output ; https://www.who.int/news/item/17-05-2021-long-working-hours-increasing-deaths-from-heart-disease-and-stroke-who-ilo ; https://pmc.ncbi.nlm.nih.gov/articles/PMC1741083 ; https://pubmed.ncbi.nlm.nih.gov/12683469/ ; https://www.healio.com/news/infectious-disease/20151014/sleep-duration-influences-infection-susceptibility
- AARP 2025: https://www.aarp.org/press/releases/2025-07-24-new-report-reveals-crisis-point-for-americas-63-million-family-caregivers.html
- CDC flu burden: https://cdc.gov/flu-burden/php/data-vis/index.html ; ACS movers: https://startbusinessbystate.com/?p=20077
- Carta equity splits: https://carta.com/data/two-founder-teams/ ; https://carta.com/data/founder-ownership-full-report/
- Carta departures: https://carta.com/data/linkedin-cofounder-departure-1-in-4-by-year-4/ ; https://carta.com/data/linkedin-cofounder-departure-rates-by-year/ ; https://carta.com/data/linkedin-cofounder-breakups-declining-data/
- Wasserman: https://builtin.com/articles/noam-wasserman-visits-techstars-boulder-shines-light-made-data-founding-pitfalls-can-kill-your-
- YC matching 2021: https://www.ycombinator.com/blog/co-founder-matching/
- Co-founder search time: https://onlook.substack.com/p/how-to-find-a-cofounder ; https://www.launchrock.com/library/expert-advice/cofounder-dating
- Vesting resets: https://cms.law/en/gbr/publication/reducing-friction-the-evolution-of-term-sheets-in-early-stage-venture-investments ; https://holloway.com/g/venture-capital/sections/vesting ; https://entrepreneur.com/article/231044
- Security questionnaires: https://www.wolfia.com/blog/security-questionnaires-complete-guide
- Renewals: https://costbench.com/compare/gainsight-vs-vitally/ ; https://www.saastr.com/the-great-price-surge-of-2025-a-comprehensive-breakdown-of-pricing-increases-and-the-issues-they-have-created-for-all-of-us
- EAA: https://sota.io/blog/european-accessibility-act-2019-882-saas-web-app-compliance-guide-2026 ; https://www.buildmvpfast.com/blog/european-accessibility-act-saas-decision-tree-2026
- Localization: https://geotargetly.com/blog/pricing-localization-saas
- Usage-based pricing: https://www.withorb.com/blog/saas-pricing-statistics ; https://dodopayments.com/blogs/metronome-alternatives
