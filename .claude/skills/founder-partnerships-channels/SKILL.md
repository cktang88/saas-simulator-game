---
name: founder-partnerships-channels
description: Choose and run acquisition channels beyond paid ads and cold outbound for a real SaaS in 2026 - affiliate programs (Rewardful/FirstPromoter/Tolt/PartnerStack), customer referral programs, integration marketplaces and app stores (Shopify, HubSpot, AppExchange, Atlassian, Zapier, Chrome, ChatGPT apps, Claude connectors/MCP directories), resellers/agencies/MSPs, co-marketing swaps, strategic partnerships, webinars, events, PR, podcast/newsletter/YouTube sponsorships, review sites, AppSumo, PLG loops and AI search visibility. Use when the user asks "which channel should I try next", how to set up affiliates or referrals, whether to list on a marketplace or build an integration, how to work with partners or resellers, whether to sponsor a newsletter/podcast/creator, whether to hire a PR firm, buy a conference booth, do an AppSumo deal, or get recommended by ChatGPT/Claude/Perplexity.
---

# Founder partnerships and non-ad channels (2026)

You are helping a founder pick and run the channels that are neither paid ads (use `founder-paid-ads`) nor cold outbound (use `founder-outbound-sales`) nor pure SEO/launch/build-in-public (use `founder-organic-growth`). Benchmarks with sources and dates are in `docs/research/channels-partnerships-pricing.md` and the per-channel numbers in `public/data/channels.js`. Quote ranges, say when a number is vendor data or an estimate, and never invent statistics. Many of these channels have no rigorous public benchmarks; say so instead of guessing precisely.

## Step 1: Gather inputs (one message, only what is missing)

1. Product, buyer (B2C, B2B SMB self-serve, mid-market, enterprise) and ACV/price.
2. Current customers, MRR, monthly signups, free→paid rate, churn. A channel needs a converting funnel to pour into.
3. Which platforms the product already integrates with or could (Shopify, HubSpot, Salesforce, Jira, Slack, Google, Microsoft, Zapier, Chrome, MCP).
4. Founder assets: email list size, audience, network of agencies/consultants, speaking/writing comfort.
5. Hours per week and cash per month available; indie (profit now) or VC-backed (speed).
6. Channels already tried, with numbers.

## Step 2: Shortlist by fit, then pick at most two

Use this map; justify each pick in one sentence tied to their inputs.

| Situation | Try first | Avoid for now |
|---|---|---|
| Product extends a platform its users already pay for (Shopify, Jira, HubSpot) | That platform's marketplace + agency partners in its ecosystem | Generic directories |
| B2C or prosumer, creators already talk about the category | Affiliate program, YouTube/creator sponsorships, referral program | Trade shows, PR retainers |
| B2B SMB self-serve, ACV < $2k | Integrations/Zapier, comparison pages, review sites, newsletter sponsorships, AI search, affiliates | Resellers, booths, strategic BD |
| B2B mid-market/enterprise, ACV > $15k | Agency/consultant partners, co-webinars, speaking, targeted events (meetings, not booths), direct mail to named accounts, AppExchange/Microsoft marketplace | AppSumo, influencers |
| Collaborative or output-sharing product | PLG loops: invites, share links, "made with" badge | Paying for awareness before the loop works |
| Has a happy base of 50+ active customers | Double-sided referral program, review collection | Referral program before retention is proven |
| Developer or AI-native product | MCP server + ChatGPT apps/Claude connectors directories, docs, Chrome extension, GitHub | PR firms |

Rules:
- One primary channel for 90 days plus at most one cheap experiment. Two channels at half effort usually means neither ramps.
- Distrust any channel whose time to first result exceeds the founder's runway.
- Indie founders: prefer channels paid on success (affiliates, referral rewards, marketplace rev share) over fixed spend (retainers, booths).

## Step 3: Give the realistic economics before they commit

State setup hours, cost model, days to first result, ramp and failure modes from `public/data/channels.js`. Key anchors:
- **Affiliates:** 20–30% recurring for 12 months is standard; tools $29–$149/mo (PartnerStack ~$800+/mo). Most recruited affiliates never make a sale; top ~10% drive most revenue. First sale typically 1–4 months [estimate].
- **Referrals:** participation 2–15% of active customers; a new program adds roughly 5–15% of new customers; best-in-class 20–30% (vendor data). Double-sided credits beat cash.
- **Marketplaces:** Shopify 0% on first $1M lifetime then 15%; Atlassian Forge 17% / Connect 25% from 2026-10 (0% first $1M Forge); Microsoft 3%; AppExchange ~$999 security review and 15–25% share; HubSpot certification needs 6 months + 60 active installs. Review queues: Shopify reported ~30 days in 2026. Cold start is near zero installs until ~10 reviews.
- **AI assistant directories:** free; ChatGPT apps cannot sell subscriptions in-chat at launch; no public install data exists. Treat as a high-variance bet.
- **Resellers/VARs:** 20–40% margin; first partner deal 3–9 months; most partners never close [estimate]. Only after the founder can sell it repeatably.
- **Strategic partnerships:** 6–18 months and usually stall. Treat as an option, never the plan.
- **Webinars:** 40–60% of registrants attend; registrations come from an existing list or a partner's.
- **Events:** 10x10 booth $15k–$50k all-in; ~80% of trade-show leads are never followed up. For seed stage, attend and pre-book meetings.
- **PR:** retainers $3.5k–$15k/mo with 3–6 month minimums; journalists answer ~3% of pitches. Pitch only with a real hook (funding, original data, notable customer).
- **Sponsorships:** newsletters B2B $50–$150 CPM; podcasts host-read ~$18–$40 CPM; YouTube tech/B2B $30–$60 CPM. Buy one test unit before a package.
- **Review sites:** profiles free; Capterra PPC $2 minimum bid, $20+ in crowded categories. Reviews also feed AI answers.
- **AppSumo:** platform revenue down ~50% (2024–2026); partner nets ~30–70% of gross; lifetime users carry support and AI cost forever. Cap usage and AI credits in the deal.
- **AI search:** ~84% of citations come from third-party pages; top 5 brands take ~2/3; answers change weekly. Earn mentions; do not buy "GEO" prompt packages.

Compute CAC with the founder's own numbers: (cash + founder hours × their hourly value) ÷ paying customers. Compare with LTV (use `saas-unit-economics`).

## Step 4: Write the execution plan

For the chosen channel produce:
1. **Setup checklist** with hours (from `requirements` and `interactions` in the data file).
2. **Assets to write now:** e.g. affiliate terms + partner kit; referral copy and trigger moment; marketplace listing (name with search keyword, 3 screenshots, 60-second demo); partner one-pager and deal-registration rule; sponsorship ad copy and landing page; pitch email under 150 words.
3. **Weekly quota:** e.g. recruit 20 affiliates/week for 6 weeks; ask every activated customer for a review; 10 partner conversations/week; one co-marketing swap/month.
4. **Attribution:** unique link, code or landing page per partner/sponsor; "How did you hear about us?" field on signup (essential for podcasts, PR and AI search).
5. **Kill/continue criteria with dates:** e.g. "No affiliate sale after 90 days with 50 recruits → stop recruiting, keep the program passive"; "Newsletter test CAC > 2× target → do not rebook"; "Partner with no pipeline after 2 quarters → drop".

## Step 5: Guard against the common failures

- **Affiliate fraud:** prohibit brand-keyword bidding and coupon sites unless approved; pay commission after the refund window; review new affiliates' first conversions.
- **Marketplace dependence:** keep direct signups and customer emails; expect the platform to ship competing features or change fees.
- **Partner channel conflict:** written rule for who owns a deal; do not undercut partners on price.
- **Founder time sink:** cap enablement, community and event time; log hours, not only dollars.
- **LTD and free-tier AI costs:** model inference cost per lifetime/free user before agreeing.

## Step 6: Review cadence

Monthly: leads, paid conversions, CAC (cash + time) and payback per channel; double down on the best, cut the worst. Quarterly: re-run Step 2 because fit changes with stage (e.g. resellers become viable after repeatable sales; PR becomes viable at a funding round).

## Output format

1. Shortlist table (channel, why it fits, cost model, time to first result, main risk).
2. The 90-day plan for the chosen one or two channels with weekly quotas.
3. Drafted assets (terms, listing, pitch or ad copy) ready to use.
4. Kill/continue criteria with dates and numbers.
5. Which numbers are estimates versus sourced benchmarks.

## Do not

- Do not recommend more than two new channels at once to a solo founder.
- Do not promise marketplace, AI-directory, PR or partnership volume; these are high-variance.
- Do not present vendor statistics (affiliate or referral platforms, GEO vendors) as neutral facts; label them.
- Do not redo paid ads, cold email or SEO planning here; hand off to the matching skill.
