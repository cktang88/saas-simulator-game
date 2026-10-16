# Cold-email alternatives for B2B SaaS founders (2026)

Research for the SaaS founder simulator, compiled 2026-10-16. Companion to `sales-and-research.md` (cold email, deliverability, AI SDRs, LinkedIn limits basics) and `channels-partnerships-pricing.md` (affiliates, marketplaces); this file does not repeat those. Scope: the motions a solo or small-team founder can use instead of, or alongside, cold email: ABM, signal-based outreach, LinkedIn, warm intros and referrals, events, and the long tail (communities, partnerships, calls, video, mail and gifting, PQLs).

**How to read the numbers.** Almost every number below comes from a vendor that sells the motion (Expandi, UserGems, Crossbeam, RB2B competitors, event-software firms). Denominators differ (per send vs per contact vs per engaged prospect), samples skew to the vendor's own users, and many "2026" stats are re-cited 2022-2024 studies. No independent study isolating job-change or funding triggers against a cold control was found. Ranges are therefore given; items marked **[design]** are game choices derived from those ranges, not measured statistics. Items marked **[unverified]** were found only as secondary claims. Search method: web searches only (no primary reports opened); verify any number before quoting it as real.

---

## 1. Account-based marketing (ABM) for small teams

**How it works (the skills).**
1. Build a tiered account list from the ICP: tier 1 (1:1, about 5-10 accounts, bespoke), tier 2 (1:few, clusters of 20-50 sharing an angle), tier 3 (1:many, hundreds, programmatic ads/content).
2. Map the buying committee per account (champion, economic buyer, user, blocker, security/finance) and multi-thread: 2-4 contacts per account.
3. Personalize at the tier's depth: custom landing page, tailored ad audience (LinkedIn matched accounts), a researched note referencing the account's own initiative, optional gift or mailer.
4. Use intent to prioritise, not to qualify (see section 2): Bombora, G2 buyer intent, 6sense, website de-anonymization (RB2B, Warmly, Clearbit/Breeze Reveal).
5. Measure account engagement (multiple people, repeat visits), meeting booked per account, pipeline per account, not leads.

**Benchmarks.**
- Win rate by tier, attributed to ITSMA/Momentum ABM benchmarking and re-cited by vendor blogs (WebTonic, "78% of B2B teams use ABM", accessed 2026-10; https://www.webtonic.io/blog/account-based-marketing-statistics): 1:1 about 38%, 1:few about 24%, 1:many about 14%, versus a non-ABM baseline about 9%. **[unverified]**, directional only; the primary report was not checked.
- Account engagement rate by tier from the same tables: 78% / 54% / 31% versus 8-12% for non-ABM outreach. **[unverified]**.
- Pipeline-to-closed-won: 26-34% for ABM programs with a defined ICP list (n=235, 2024 industry study cited in the search results) versus 18-23% for general enterprise B2B. **[unverified]**.
- Vendor-case claim of about $12 pipeline per $1 spent; treat as marketing.
- Website de-anonymization: person-level US match rates are quoted 5-20% of traffic in practice (vendors claim 20-30%); person-level is US-only because of GDPR (Knock2, Warmly, Abmatic, 2026; https://www.knock2.ai/blog/rb2b-match-rate-how-to-verify, https://warmly.ai/p/blog/visitor-identification-match-rates). A March 2026 vendor press release citing an unverified "Gartner auditor" scored RB2B 5.2/10 overall, contact relevance 4/10, and noted identified profiles often do not match those same visitors' later form fills (https://www.barchart.com/story/news/993089/gartner-auditor-tests-rb2b-leadpipe-warmly-clearbit-6sense-leadfeeder-accuracy-results-vary-widely). RB2B discontinued its free plan; paid starts around $149/month per that source. Treat identification precision as roughly 30-60% **[design]** (the existing `sales-and-research.md` already cites 30-40% for intent precision).

**Cost.** Founder time: tier-1 account about 1.5-3 h each (research, committee map, custom asset); tier-2 about 20-40 min each plus 3-4 h per cluster asset; tier-3 about 2 h/week of ad/content upkeep **[design]**. Money: LinkedIn matched-account ads $25-60 CPM (see section 3); de-anonymization $149-500/month; intent data (Bombora/6sense/G2) is typically five-figure annual contracts, i.e. out of reach for a bootstrapped solo founder **[design]**.

**Lag.** 3-6 months to first ABM-sourced pipeline for mid-market ACV; shorter if the founder already has a relationship with the account.

**Decay / burn.** Account fatigue: hitting the same 10 accounts with five bespoke touches that get no reply burns that account for 6-12 months **[design]**. Tiers decay: a 1:1 asset for an account that went dark is sunk cost.

**Common mistakes and consequences.**
- Tiering by company size instead of fit: hours spent on accounts that cannot buy (no budget owner, wrong tooling).
- Single-threading to one champion who leaves or lacks budget: deal stalls.
- Treating a visitor-ID hit or one G2 category view as intent: personalised outreach to the wrong person (privacy-creepy "I saw you visited our pricing page" messages burn trust; GDPR/CCPA exposure outside the US).
- Buying six-figure intent/ABM platforms with a list of 40 accounts.

---

## 2. Signal-based / intent-based outreach

**How it works (the skills).**
1. Choose signals tied to the product's trigger (not generic): new funding, hiring for the role the product replaces/augments, champion or past-user job change, tech-stack change, competitor-page or pricing-page visit, G2 category research, post engagement on competitor/own content, leadership change, expansion/layoffs.
2. Capture them with tools: Clay (waterfall enrichment and triggers), Common Room, Trigify (LinkedIn engagement signals), Sales Navigator alerts (job change, posted recently), UserGems (job-change tracking), Koala (product/web intent for PLG), Warmly/RB2B (visitor ID).
3. Stack and score: one weak signal rarely justifies outreach, three stacked usually do (vendor guidance, Autobound/Koka Sexton, 2026).
4. Act fast: within 24-48 h (sooner for high-commitment signals), reference the signal specifically and what it implies for the prospect's problem, then multi-thread to the champion plus buyer.
5. Close the loop: log which signals produce meetings and kill the ones that do not.

**Benchmarks.**
- Cold email baseline for comparison: 0.45% reply per send (Belkins, 7.53M emails, 2025) up to 3.43% (Instantly 2026) depending on definition; top 10% campaigns about 3x average (see `sales-and-research.md`).
- Signal-based reply claims: 15-25% for funding/leadership-change/hiring-surge triggers (Autobound, 2026; https://www.autobound.ai/blog/cold-email-guide-2026); 15-45% for signal-based LinkedIn (Valley, https://www.joinvalley.co/blog/how-to-use-signal-based-linkedin-outreach-to-book-more-meetings-profile-views-post-engagement-and-more); champion job change 20-25% in an unsourced table. All vendor claims with a different denominator (replies per contacted/engaged prospect), so the "5x" is not like-for-like. **[unverified]**
- Engagement-based: AiSDR single-company test, LinkedIn engagers gave about 3x the positive replies of cold (https://aisdr.com/blog/leadership-nuggets-signal-based-outreach/). A 150-day solo test: cold DMs booked 1 meeting, warm-first sequence 9 meetings, 42% reply rate (https://getfuzzy.ai/blog/linkedin-outreach-strategies-tested). Prospects who had engaged with the sender's content replied 36.4% vs 11.4% cold in an 8,423-message practitioner set (already cited in `sales-and-research.md`).
- Job-change tracking: UserGems customer case, 46 initial opportunities converted 80% versus a 55% baseline; vendor claims "114% more likely to win" when a past champion is involved (https://usergems.com/customers/gem, https://www.usergems.com/blog/improve-email-outreach-roi). Vendor comparison claims one competitor missed 40% of true job changes with 14% false alarms. G2 reviews: alerts accurate but lag a few weeks, many outside ICP.
- Speed: Optifai 2026 (939 B2B firms) average response to inbound is 47 hours, only 23% respond within 5 minutes (https://kokasexton.com/intent-decay-response-engine/). The "5 minutes, 21x" lead-response figure is attributed to HBR/MIT-InsideSales and is re-cited without the primary link **[unverified]**. Decay by signal type: demo request decays slowest, content download fastest; a vendor figure of about 30% decay over 30 days for demo requests vs 60% for downloads has no primary source (https://www.saber.app/glossary/intent-decay).
- Third-party intent (Bombora/G2) false positives: no independent accuracy data found. **[design]** treat precision as 30-40% (consistent with the figure cited in `sales-and-research.md`).

**Game values [design], consistent with the above:** untargeted cold 1-3% reply; single weak signal 3-6%; strong first-party signal (pricing-page visit, demo request, champion job change) 10-25% reply, decaying with a half-life of about 3-7 days for web/content signals and 2-3 weeks for job changes and funding.

**Cost.** Founder time: 20-40 min to set up each signal rule; reviewing alerts 15-30 min/day; 5-10 min per well-written signal-referencing message **[design]**. Money: Sales Navigator about $100/month; Clay $150-800/month; UserGems/Common Room/Trigify typically not solo-priced.

**Lag.** First replies within days; learning which signals work takes 4-8 weeks of logged sends.

**Decay / fatigue.** Signals go stale (see above); the same signal reaches every competitor who watches it, so competitive crowding is higher on funding announcements than on obscure ones **[design]**. Alert volume exceeding capacity means late action, which is worse than none.

**Common mistakes and consequences.** Reaching out 2-3 weeks late and still saying "saw you just..."; over-personal creepy references (visited page X on Tuesday); acting on every signal without ICP filter (low meeting yield, burned list); not logging outcomes so bad signals persist; AI-hallucinated signal claims (12-18% of AI-written emails per an April 2026 practitioner estimate in `sales-and-research.md`) which destroy credibility.

---

## 3. LinkedIn (organic, outbound and ads)

**How it works (the skills).** (a) Profile as landing page (clear who-for/outcome, proof). (b) Founder-led content 3-5 posts/week on the ICP's problem, not the product. (c) Strategic commenting on ICP/influencer posts to get seen, 10-20 min/day. (d) Targeted outreach via Sales Navigator filters, a short connection request, value-first follow-up, not a pitch-slap. (e) Engagement-based lists: people who engaged with your own posts, competitor posts, or events. (f) Optional ads: Conversation Ads, Thought Leader Ads (boost a founder's post) to matched accounts.

**Benchmarks.**
- Expandi, 13.2M connection requests across 13,302 accounts, May 2025-Apr 2026 (vendor data, https://expandi.io/blog/linkedin-outreach-benchmarks-2026/): connection acceptance 28.5% average (industry range 17.5%-40.1%; sender seniority moves it only about 3 points); connection-note reply rate 3.0%, falling from 3.5% to 2.2% over the period; message reply 10.4% (blended across welcome messages, follow-ups, InMails and emails, so no standalone InMail rate). Second follow-up helps more than the first.
- Healthy targeted B2B acceptance 30-45% (Cleverly 2026); Belkins 2025 multi-platform study 26.4%. A single vendor claims 45% personalized vs 15% generic acceptance (Gracker; **[unverified]**).
- Limits (see `sales-and-research.md`): about 100 invitations/week for most accounts, up to 150-250 for mature Sales Navigator accounts; falls with ignores/"I don't know this person" reports. Penalties escalate from temporary restriction (a week or more) to permanent restriction; automation tools raise risk (Surfe, La Growth Machine, 2025; https://www.surfe.com/blog/linkedin-limits-in-2025/). Numbers are vendor-observed, not LinkedIn policy.
- Ads (vendor guides 2025-2026, inconsistent): B2B sponsored content CPM about $25-60, cost per lead about $50-250; Conversation Ads CPM $150-500 or $0.50-3 per send with 50-60% open rate and 2-5% CTR (single source); Thought Leader Ads about $2.29 CPC and 2.68% CTR (single 2026 e-commerce roundup). Sources: https://dupple.com/learn/linkedin-ads-b2b-cost-2026, https://nav43.com/blog/linkedin-conversation-ads-benchmarks-the-complete-2025-guide-to-costs-high-converting-flows/. **[unverified]**
- Multi-channel lifts (Saleshandy 2026, already in `sales-and-research.md`): positive reply 0.11% email only, 0.21% email+LinkedIn, 0.88% with three or more channels.

**Cost.** Time: outbound 15 requests/day plus follow-ups about 30-45 min/day; content 5-8 h/week for 3-5 good posts with comments **[design]**. Money: Sales Navigator about $100/month; ads from $3-5k/month before data is meaningful.

**Lag.** Founder content typically takes 2-4 months before inbound DMs appear; ads 4-8 weeks of testing **[design]**.

**Decay / burn.** Acceptance and reply fall with repeated generic notes; account restriction freezes the channel for a week or more; over-posting pitchy content collapses reach.

**Common mistakes and consequences.** Pitch in the connection note (3% reply and falling); mass-automation (restriction); connecting to everyone who "liked a post" then pitching (low acceptance, reports, lower weekly limit); posting only product features (no audience); commenting with generic praise (invisible).

---

## 4. Warm intros and referrals

**How it works (the skills).** (a) Map who knows your ICP: past colleagues, investors, advisors, customers, super-connectors (agency owners, VC platform leads, community admins). (b) Ask specifically (one named target or segment, a forwardable 3-sentence blurb, easy to decline). (c) Use double opt-in: the connector asks the target first; you never go around. (d) Make it easy and repay the favour. (e) For customers: ask promoters right after a clear win, with a one-click path, and track referred-cohort conversion.

**Benchmarks (all vendor/aggregator, weak):**
- Referred B2B leads convert about 11% vs 1-3% for cold outreach; another aggregator says 26% vs 2-3%; referral deals close faster (30-69% quoted). Heinz Marketing/HBR attribution is repeated without a primary study. Referrals can be 50-70% of closed revenue while only 15-20% of leads (SyncGTM, 2026; https://syncgtm.com/blog/how-much-b2b-sales-happens-on-referral). **[unverified]**
- Customer referral programs: SaaS referral conversion 15-40% (Extole claim); program participation 15-30% of eligible customers; top programs 8-12% of new customers from referrals vs median 3-5%; each extra step in the referral flow cuts participation 10-30%; asks after a milestone convert 3-4x better (Gainsight attribution) (https://www.growthspreeofficial.com/blogs/customer-advocacy-referrals, https://www.saasfactor.co/blogs/the-best-time-to-ask-for-saas-referrals-data-backed-guide). **[unverified]**
- Asks per relationship before fatigue: no benchmark found. **[design]** a connector will make about 1-2 intros per year per relationship before goodwill falls unless the earlier intros went well and were reported back on.

**Game values [design]:** warm intro to meeting 40-70%; meeting to opportunity 25-40%; opportunity to close 25-40% for a well-qualified fit. Cold email meeting-to-win much lower.

**Cost.** Time: 1-2 h to prepare an ask list and blurbs; 20-30 min per intro request and follow-up. Money: near zero, plus gifts/thank-yous.

**Lag.** Days to weeks per intro; compounding after 6-12 months of relationship investment.

**Decay / burn.** Each poor intro (unqualified target, no follow-up, pitchy behaviour) costs the connector's reputation and the founder's future intros; asking too many too early burns the relationship. Ghosting after an intro is the most common reputational wound.

**Common mistakes and consequences.** "Who do you know?" (vague, no action); asking strangers for intros; not closing the loop; pushing a connector to intro a poor-fit target; paying referral bonuses to people who do not understand the product.

---

## 5. Event-led growth

**How it works (the skills).** (a) Pick a format by stage: webinar (scalable, low trust), roundtable/dinner of 8-20 senior buyers (high trust, small), attend conferences with pre-booked meetings (not booths), field events, virtual summits (co-hosted). (b) Promote through a partner, list or community; (c) deliver peer value, not a pitch; (d) follow up within 24 h personally, segmented by engagement; (e) track attendee-to-meeting and meeting-to-opportunity.

**Benchmarks.**
- Webinar registration-to-attendance: ON24 about 57% live+on-demand (2024) to about 60% (2025, secondary); Livestorm 2026 benchmark 47.7% live show-up; TwentyThree 2025: 58%, about 307 sign-ups per webinar; independent median live-attend about 41.6% (https://www.marketingprofs.com/charts/2025/52917/b2b-webinar-benchmarks-conversion-attendance-personalization, https://konabayev.com/blog/webinar-marketing-statistics-2026/). Definitions differ (live-only vs including on-demand).
- Webinar attendee/registrant to customer: about 1.2% attendee-to-customer for B2B SaaS (Focus Digital, 2023), 2-5% registrant-to-customer (Woodpecker); no reliable attendee-to-pipeline benchmark. Event leads: "73% go cold within 72 hours without follow-up" (Goldcast via Salesfuel, secondhand; **[unverified]**).
- Hosted dinners at major conferences: 5-12 senior-buyer conversations, 2-4 attributed opportunities, $3,500-8,000 for 12-20 guests (about $175-650 per guest, derived); dinner attendance 80-90% of confirmed; meeting-to-opportunity: executive dinner attendee 30-50%, pre-booked meeting 25-40%, booth hot 15-25%, booth warm 5-10%; booth meeting attendance 40-60% of booked (Vendelux, event-data vendor; https://vendelux.com/event-marketing/b2b-event-marketing-benchmarks/, https://vendelux.com/articles/hosted-dinner-vs-sponsored-event-which-has-better-roi). Sponsorships $50k-300k+ (same source). Single-vendor, likely optimistic. **[unverified]**
- Roundtable and virtual-summit benchmarks: none found. **[design]**

**Cost.** Webinar: 10-20 founder hours (topic, slides, promotion, rehearsal, follow-up), software $0-300/month, promotion via partner list free or $500-2,000 paid; roundtable/dinner: 6-12 h to curate and host, $200-650 per guest; conference ticket $500-2,500 plus travel, 3-5 days. A solo founder's booth is almost never worth it **[design]**.

**Lag.** Webinar leads: 1-3 months; dinners/conference meetings: 2-6 months, but deal quality higher.

**Decay / burn.** Follow-up decay: speed matters in the first 24-72 h. Repeating the same topic burns the audience; empty rooms (low attendance) harm brand and morale; weak invitations to senior buyers produce no-shows.

**Common mistakes and consequences.** Webinar that is a product demo (drop-off); inviting a poor-fit list (strong attendance, zero meetings, per Vantage Point example); booth with no pre-booked meetings (wasted five figures); no follow-up (leads die within days); dinner where host pitches (guests leave, no repeat).

---

## 6. Long tail: communities, partnerships, calls, video, mail/gifting, PQLs

**Communities (Slack/Discord/Reddit/forums).** Skills: pick 2-3 communities the ICP lives in; answer questions without links for weeks; share useful artifacts; promote only where rules allow (e.g., weekly self-promo threads). Evidence is anecdotal: a post-mortem of 500 removed Reddit posts claims r/startups removes about 96% of promotional posts vs r/SideProject 25% (small, non-authoritative; https://www.indiehackers.com/post/analyzed-500-reddit-posts-that-got-banned-73-failed-for-the-same-reason-and-it-s-not-what-you-think-Y5JloVysPICuN2rOliIT). No reliable conversion benchmark. **[design]** time 3-5 h/week, lag 2-4 months, consequence of spam: ban plus reputation loss that is visible to the whole community.

**Partnerships / co-marketing.** Vendor claims (Crossbeam, mostly customer case studies): partner-involved deals 53% more likely to close, 46% faster cycles; LeanData win rate up more than 120% on partner deals; Pigment 5-10% lift, 16% of new-logo revenue partner-sourced; suggested internal targets of 1.2x win rate on influenced deals, 35% partner attach (https://insider.crossbeam.com/entry/4-ways-partner-sourced-leads-outperform-cold-leads, https://www.crossbeam.com/case-study/how-leandata-makes-it-easy-for-reps-to-close-partner-sourced-revenue). Selection bias; dispersion large. For a solo founder, partnerships mean a few complementary-tool swaps, joint webinars and integration listings (see `channels-partnerships-pricing.md`). **[design]** lag 3-9 months; a lopsided partner who takes leads but sends none is the typical failure.

**Cold calling.** Belkins, 175,000+ dials (2025): 9.9% per-dial connect rate, 24.5% per prospect with repeats, 4.6% of conversations booked a meeting, about 1 meeting per 370 dials end-to-end; Apollo/Cognism dial-to-meeting 2-3% typical, 5-8% top performers; Gong via Voxbooster: average rep needs 19 dials per conversation, top quartile 8 (https://belkins.io/blog/cold-calling-benchmarks, https://apollo.io/insights/whats-the-average-conversion-rate-for-cold-prospecting). Calls plus email lift multichannel conversion about 70% (Instantly claim). Founder time: 2 h call block yields about 40-60 dials **[design]**. Mistake: no script, gatekeeper bluntness, calling outside buyer hours; consequence: burned accounts and founder avoidance.

**Video prospecting (Loom/Sendspark).** Only vendor claims: up to 2-3x reply lift over text (Sendspark; **[unverified]**, https://blog.sendspark.com/cold-calling-vs-video-prospecting). **[design]** 3-5 min to record a personalised 60-90 s video; a lift of 1.3-2x on already-targeted lists, none on generic ones.

**Direct mail and gifting.** Direct mail average response about 4.4% (2025 ANA/DMA; cold lists 2-4.4%, house lists 5-9%); gift-card mailers about 13.8%, dimensional mailers about 12.2%, postcards 2.8%; ABM direct-mail programs quote 5-15% response with 2-4 contacts per account; personalised letters $0.75-2 per piece excluding gifts; target cost per meeting for high-value accounts of $10-30k quoted by one vendor (https://prospeo.io/s/abm-direct-mail-strategy, https://firstsales.io/blog/b2b-direct-mail-outbound). No independent gifting-to-meeting benchmark exists. **[design]** gifts at $25-100 make sense only for ACV above about $15k; a gift without a relevant follow-up call is a pure cost.

**Product-qualified leads (PQLs).** Gainsight PLG Index 2022: trials using PQLs convert 2.8x those without (https://www.gainsight.com/resource/benchmark-product-qualified-lead-pql-conversion-rates/); vendor blogs: PQL-to-paid 25-39% vs MQL-to-close 1-7%, PQL-to-closed-won 15-25% vs MQL 2-5%; freemium free-to-paid 1-10%; an agency page quotes PQL-to-paid median 32%, top quartile 45%+, bottom under 18% (unverifiable). OpenView 2021: only one in four SaaS companies ran a PQL strategy. Founder skill: define the PQL from usage that actually predicts paid conversion (not just signing up), then reach out within a day with help tied to what the user did. Mistake: PQL defined by vanity events, causing sales outreach to non-buyers and annoyed free users.

---

## Summary table of benchmarks

| Motion | Metric | Typical / median | Top / stellar | Source quality |
|---|---|---|---|---|
| Cold email baseline (for reference) | Reply per send | 0.45%-3.4% | about 3x average for top 10% | Belkins 2025, Instantly 2026 |
| ABM | Win rate 1:1 / 1:few / 1:many | 38% / 24% / 14% vs 9% non-ABM | n/a | ITSMA via vendors, unverified |
| ABM | Visitor-ID person match (US) | 5-20% of traffic | up to 30% claimed | Vendor, contested |
| Signals | Reply rate with strong signal | 15-25% claimed | 20-45% claimed | Vendor, unverified |
| Signals | Response time to inbound | 47 h average, 23% within 5 min | within minutes | Optifai 2026 |
| LinkedIn | Connection acceptance | 28.5% (17.5-40.1% by industry) | 30-45% targeted | Expandi 13.2M, 2025-26 |
| LinkedIn | Connection-note reply | 3.0%, trending to 2.2% | n/a | Expandi |
| LinkedIn | Message reply after accept | 10.4% | 18.9% best segment | Expandi |
| LinkedIn | Invite limit | about 100/week | 150-250 mature | Vendor-observed |
| LinkedIn ads | B2B CPM / CPL | $25-60 / $50-250 | n/a | Vendor guides |
| Referrals | Lead conversion | 11-26% vs 1-3% cold | n/a | Aggregators, unverified |
| Customer referral | Participation / acquisition share | 15-30% / 3-5% | 8-12% share | Vendor |
| Webinar | Registration to attendance | 41.6-60% | about 60% | ON24, Livestorm, TwentyThree |
| Webinar | Attendee to customer | about 1.2% | 2-5% of registrants | Vendor |
| Dinner | Meeting to opportunity | 30-50% | n/a | Vendelux, optimistic |
| Booth | Hot / warm to opportunity | 15-25% / 5-10% | n/a | Vendelux |
| Cold calling | Dial to meeting | 2-3% (about 1 per 370 dials) | 5-8% | Belkins 2025, Apollo |
| Direct mail | Response | 2-4.4% cold list | 12-14% dimensional/gift | ANA/DMA via Prospeo |
| PQL | PQL to paid | 25-39% | 45%+ | Vendor/agency |

---

## Operator tiers per motion

Tiers separate by what the player does, not by difficulty. Effect sizes are **[design]**, calibrated to the ranges above; "multiplier" is vs the average tier's yield per founder hour.

| Motion | Mediocre | Average | Good | Stellar |
|---|---|---|---|---|
| ABM | Big list tagged "ABM", same template to all; no committee map | Tiers by size; 1-2 contacts per account | Tiers by fit and need; 3 contacts; custom page per cluster | 1:1 for top 5-10 accounts with researched insight, multi-threads champion + buyer + user, uses intent only to sequence; yields about 2-3x pipeline per account |
| Signals | Blasts everyone who "liked a post"; acts 2+ weeks late | Reacts to one signal type within a week | Stacks 2+ signals, acts within 48 h, ICP-filters | Acts within 24 h, references the signal specifically and its implication, multi-threads, logs outcomes and prunes dead signals; reply about 3-5x mediocre, false-positive spend cut by half |
| LinkedIn | Pitch in the note, automation at max limit; acceptance about 15%, restriction risk | Generic note, ICP-ish list; about 28% accept | Short specific note, value-first follow-up; about 40% | Consistent founder content plus commenting builds inbound; engagers lists with specific reference; about 40-50% accept, replies 3-5x and no restrictions |
| Warm intros | "Who do you know?" asks, no follow-up | Asks investors/advisors occasionally | Specific named asks with forwardable blurb, double opt-in | Maps connectors, pre-qualifies targets, closes the loop, repays; 60-70% intent-to-meeting, sustained connector goodwill |
| Events | Demo-heavy webinar, no segmentation, late follow-up | Webinar with fair content, 48-h follow-up | Curated roundtable, personal follow-up in 24 h | Peer-value format, pre-booked senior guests, follow-up within hours with a next step; meeting rate about 2x average |
| Communities | Drops links, gets banned | Posts occasionally | Helps for weeks first, shares artifacts | Becomes a known helper, mods and members refer prospects; slow compounding |
| Calls / video / mail / PQL | Generic script, gift to unqualified account, PQL by signup | Script plus email | Targeted list, research, right-time call | Calls signal-warm accounts, video/gift tied to a specific problem, PQL defined by predictive usage and contacted within a day |

Asymmetry: stellar execution raises odds (higher reply, meeting and win probabilities) but not guarantees. Each mistake has a persistent cost: restricted LinkedIn accounts (frozen 1+ weeks, lower limits later), burned accounts (6-12 months cooldown), banned community accounts, connector goodwill lost, wasted event fees, and GDPR/privacy exposure for de-anonymization outside the US.

---

## Simulation hooks

**State.**
- `accounts[]`: tier (1:1 / 1:few / 1:many), fit score, committee map (roles known, contacts engaged), `fatigue`, `lastTouchDay`, `burnedUntil`.
- `signals[]`: type, strength, `observedDay`, `decayHalfLife`, `isFalsePositive` (hidden), `actedOn`.
- `linkedin`: weekly invite count, acceptance rolling average, `restrictionLevel`, `restrictedUntil`, follower/engagement score, content streak.
- `relationships[]`: strength, `introsAsked`, `introsDelivered`, `lastReported` (closing the loop), goodwill 0-1.
- `events[]`: format, invited, registered, attended, follow-ups sent, 24 h flag, cost.
- `communities[]`: reputation 0-1, ban flag, rule-compliance.
- `tools`: subscription costs, de-anonymization match rate, intent-data precision.
- `pqlRule`: predictive quality of the definition.

**Inputs (player actions).** Choose tier and account list; research hours spent; signal rules to subscribe to; reaction latency; message specificity (generic / ICP-specific / signal-referencing); threads per account; request volume; post cadence and content quality; ask specificity for intros; event format, guest curation, follow-up latency; call blocks; gift spend; PQL definition.

**Outputs.** Reply, accept and meeting probabilities (with tier multipliers above, signal-decay factor `0.5^(age/halfLife)`); founder hours used; cash spent; list/account burn; restriction events; pipeline entries with source tags (for traceable mistakes); feedback text naming what a stellar operator would have done (e.g., "Signal was 19 days old; acting within 48 h would have tripled reply odds").

**Tests to add (per CLAUDE.md).** For each motion, a short seeded unit test that the four tiers separate on meetings per founder hour with a plausible median-vs-top-quartile spread (roughly 2-4x between mediocre and stellar, not guaranteed on a single seed), and that mistakes (late signal, generic engager blast, LinkedIn over-limit, spam in a community, no-follow-up event) produce a recorded, traceable cost.
