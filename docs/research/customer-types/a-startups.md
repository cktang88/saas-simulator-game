# Customer type A: selling SaaS to startups / VC-backed tech companies

Research date: 2026-10-16. Scope: 5-200 employee VC-backed tech companies (SF/NYC style).
Status legend: primary = original publisher; secondary = blog/aggregator quoting data; [unverified] = vendor or unsourced claim; [design] = our assumption, NOT a real statistic.

**Honesty note on evidence quality.** Web search in this session returned mostly secondary/vendor blogs. Hard primary data exists for Carta/PitchBook funding and shutdown counts and Brex/Ramp spend rankings. Most benchmarks for conversion, churn, win rate and CAC payback are secondary and conflict; treat as directional. Where no source was found the row is marked [design] with reasoning. Dates are "n/d" where the page showed none.

## 1. Acquisition channels

| Claim | Value | Source (URL, date) | Status |
|---|---|---|---|
| B2B cold email total reply rate (all replies incl. negative) | ~5.8% in 2024, down from 6.8% in 2023 (Belkins, 16.5M emails) | https://www.apollo.io/insights/what-is-a-good-benchmark-for-reply-rates-in-cold-outreach (n/d, 2026) | secondary |
| Cold email reply, general range | 3-6% broad B2B; 1-5% in other sources; one outlier 1.4% | https://instantly.ai/blog/cold-email-reply-rate-benchmarks (upd. 2026-07-01); https://cleverly.co/blog/cold-email-response-rate (2025-09-18); https://www.getboomerang.ai/glossaries/cold-email-reply-rate-benchmarks-2026 | secondary |
| Positive replies as share of total replies | 40-60% | https://cleverly.co/blog/cold-email-response-rate (2025-09-18) | secondary |
| Small targeted sends (<50 recipients) vs large | 5.8% vs 2.1% reply | https://www.cleverly.co/blog/cold-email-benchmarks-by-industry (2026-04-16) | secondary |
| IT services audience reply rate | 3.5% (lowest of industries listed) | same Cleverly page | secondary |
| Cold email to founders/engineers specifically | No source found. Technical buyers are inbox-saturated by AI-SDR spam; assume below the 3-6% average | n/a | [design] |
| Free-to-paid, PLG blended | ~8-9% median/avg; freemium-only 2-5%; 15-20% "good" | https://productled.com/blog/product-led-growth-benchmarks (n/d); https://www.getmonetizely.com/articles/freemium-conversion-rate-the-key-metric-that-drives-saas-growth-3588c (n/d) | secondary |
| Free-to-paid, developer tools | 1-3% typical; "top devtools 7%+" | https://www.getmonetizely.com/articles/whats-the-right-ratio-of-free-to-paid-users-in-developer-saas (n/d) | [unverified] |
| Trial-to-paid, opt-in (no card) vs opt-out (card) | 18.2% vs 48.8% (First Page Sage, 86 SaaS cos, Q1 2022-Q3 2025); other study 25.2% vs 60.4%; Flint median 18.5% | https://userpilot.com/blog/free-trial-conversion-rate/ (n/d); https://visionary-marketing.co.uk/blog/saas-free-trial-conversion-statistics-2026 (2026-05); https://www.flint.com/blog/b2b-saas-free-trial-conversion-rate-statistics (n/d) | secondary (levels disputed; 2-3x gap consistent) |
| Product Hunt B2B signup conversion | ~1-2% of visitors; traffic falls 90-95% within 48h; audience skews marketers/founders over developers | https://daily.dev/blog/best-product-hunt-alternatives-for-developers/ (n/d) | secondary |
| Show HN conversion for technical products | 5-12% | same daily.dev page | [unverified] |
| Product Hunt launch volume | Most launches draw 500-1,000 PH users; about half of founders see a signup increase | https://www.usertour.io/blog/product-hunt-gain (n/d) | secondary |
| HN gives the most concrete technical feedback; front page hard to earn; some HN spikes bring weak paid conversion | qualitative | https://www.hexa.com/blog/news/what-we-learned-about-product-hunt-after-4-startup-launches-and-more-than-4000-upvotes (n/d) | secondary |
| YC/Bookface deal perks | YC staff say 100+ discounts for YC companies, gated by YC email | https://posthog.com/handbook/marketing/startups (n/d) | secondary |
| Accelerator perks bundle value | "over $1M in credits and discounts" | https://beancount.io/blog/2026/03/12/startup-founder-perks-programs-save-money (2026-03-12) | [unverified] |
| Paid ads / LinkedIn ads CAC for startup buyers | No source found; LinkedIn CPCs high, startup buyers (engineers) distrust ads | n/a | [design] |
| Conferences, GitHub, Slack communities, dev docs/SEO CAC | No sourced numbers found | n/a | [design] |

Takeaway: channels with credibility among builders (HN, GitHub, docs, product itself, peer/investor intros) beat interruption channels; PH gives volume but low-intent traffic.

## 2. Sales motion

| Claim | Value | Source | Status |
|---|---|---|---|
| Win rate, qualified opps, deals <$10K ACV | ~25-35% (<$25K: 25-40%) | https://hub.causo.ai/guides/h1-2026-b2b-saas-gtm-report (2026); https://getboomerang.ai/glossaries/win-rate-benchmarks-by-acv-2026 | secondary, [unverified] methodology |
| Median B2B SaaS qualified win rate | 21% (Gong 2024, as cited) | https://thedigitalbloom.com/learn/pipeline-performance-benchmarks-2025/ (2025) | secondary |
| Cycle, SMB deals <$5K | median ~40 days, range 30-90; target for <$10K 14-30 days | https://hub.causo.ai/guides/h1-2026-b2b-saas-gtm-report; https://getboomerang.ai/glossaries/b2b-sales-cycle-benchmarks-2026 | secondary |
| Enterprise >$100K median cycle | 84 days (as cited) | https://thedigitalbloom.com/learn/pipeline-performance-benchmarks-2025/ | secondary |
| Startup buyer = founder/engineering lead/head of ops; paid by company card (Brex/Ramp); decision in hours-days for <$500/mo | qualitative | n/a | [design] |
| Card-limit approvals: tools under ~$500-1,000/mo bought without procurement | threshold | n/a | [design] |
| Startups prefer self-serve/trial over demos; demo only after usage or for >$20K ACV | qualitative | n/a | [design] |
| Fastest-growing vendors on startup cards are AI coding/infra tools (Cursor #1 on Brex 2025, +1,000% YoY spend; Windsurf, Replit, CodeRabbit in top 40) | Brex 50 fastest-growing, >35,000 customers | https://finance.yahoo.com/news/ai-investors-fret-over-roi-103646919.html (Fortune syndication, 2025-12-23); https://www.brex.com/journal/brex-benchmark-may-2025 | primary-ish (Brex data) |
| Startups (Brex def. <250 employees) top AI spend is Anthropic; enterprises OpenAI | ranking | https://www.brex.com/journal/brex-benchmark-august-2025 (2025-08) | primary (Brex) |

## 3. Pricing and willingness to pay

| Claim | Value | Source | Status |
|---|---|---|---|
| Startup programs: PostHog YC program | $50,000/yr credit, auto-renewing while <$25M raised | https://posthog.com/handbook/marketing/startups (n/d) | primary (vendor page) |
| Typical startup-plan discount 50-90% year one (Stripe, Notion, Figma etc. have startup tiers; terms not verified) | 50-90% | https://beancount.io/blog/2026/03/12/startup-founder-perks-programs-save-money (2026-03-12) | [unverified] |
| SSO gating: ~150 vendors catalogued at sso.tax (June 2026); 104 with computable markup; 44 "contact sales" | catalog | https://clerk.com/articles/the-real-cost-of-enterprise-sso-per-connection-vs-per-mau-p-2 (2026) | secondary |
| GitHub SAML from $4 to $21/user/mo (425%) | ratio | same Clerk page | secondary |
| 57% (16 of 28) tools lock SSO behind top tier; dev/security infra vendors mostly include it, productivity/AI charge | share | https://dev.to/topickz/the-sso-tax-report-2026-dfk (2026) | secondary, small sample |
| Annual vs monthly mix, seat expansion with hiring, usage-based expectation | No sourced figure. Startups expect usage-based and monthly; annual only for a discount and when runway is secure | n/a | [design] |

## 4. Churn and retention

| Claim | Value | Source | Status |
|---|---|---|---|
| Startup shutdowns on Carta | 966 in 2024 vs 769 in 2023 (+25.6%); Carta says undercount | https://techcrunch.com/2025/01/26/2025-will-likely-be-another-brutal-year-of-failed-startups-data-suggests (2025-01-26) | secondary reporting Carta data |
| Q1 2024 Carta shutdowns | 254 | https://carta.com/data/startup-shutdowns-q1-2024/ (2024) | primary |
| AngelList wind-downs | 364 in 2024 vs 233 in 2023 | TechCrunch link above | secondary |
| Series A share of shutdowns rose ~6% to ~14% (SimpleClosure 2025) | share | https://voxbooster.com/blog/startup-failure-statistics-2026 (2026) | [unverified] |
| Funding climate: Carta 2025 startups raised $119.5B (+16.9% YoY); 4,859 rounds, lowest in 6+ years, -41% vs 2021 peak; Q4 2025 $36.1B | numbers | https://carta.com/data/state-of-private-markets-q4-2025/ (2026-Q1) | primary |
| AI share of VC: 64% of deal value Q3 2025; 39.5% of deal count; >50% of 2025 total | shares | https://siliconangle.com/2025/10/03/ai-drives-record-share-venture-deal-value-third-quarter-fundraising-slump-continues/ (2025-10-03); PitchBook-NVCA Q3 2025 https://www.pitchbook.com/news/reports/q3-2025-pitchbook-nvca-venture-monitor | primary/secondary |
| SMB-focused SaaS annual logo churn (ChartMogul 2025, as cited) | 10-14%; mid-market 5-8%; enterprise 2-5% | https://stealthagents.com/research/saas-churn-rate-statistics-2026 (2026) | [unverified] (cites by name only) |
| SMB NRR | 85-95% good / 95-105% strong (ACV <$10K) | https://directiveconsulting.com/blog/blog-b2b-saas-retention-benchmarks/ (n/d) | secondary |
| Median private SaaS NRR | ~104% (SaaS Capital 2025) drifting from ~105% (2021) to ~101% (2024-25) | https://www.stackmatix.com/blog/net-revenue-retention-benchmarks (n/d) | secondary |
| Startup-specific annual logo churn | Startups sit above SMB baseline because of death (a Carta-tracked shutdown is only a floor), pivots, post-raise tool consolidation, and in-house rebuilds. Planning ~22% [design] | n/a | [design] |
| Churn drivers (startup dies, acquired, pivot, rebuild in house, consolidation, budget cut after failed raise) | qualitative, no share data found | n/a | [design] |
| 2022-23 winter: tools tied to startup spend saw heavy churn and seat cuts after SVB (Mar 2023) | no figure retrieved | n/a | [design] |

## 5. Support and success

| Claim | Value | Source | Status |
|---|---|---|---|
| Channels: shared Slack/Discord, GitHub issues, in-app chat; expect engineer-level answers | qualitative | n/a | [design] |
| First-response expectation: ~1-4 business hours chat, same-day email; incidents minutes | qualitative | n/a | [design] |
| Docs/API quality is a purchase criterion; bad docs = no signup | qualitative | n/a | [design] |
| NPS norms for dev tools | no sourced figure | n/a | [design] |

## 6. Product expectations

| Claim | Value | Source | Status |
|---|---|---|---|
| Must-have integrations: Slack, GitHub, Linear, Google Workspace; SSO (Okta/Google) increasingly asked by Series B+ | qualitative | n/a | [design] |
| SSO tax resented; vendors defending as "sunroof" feature | qualitative | https://1password.com/blog/explaining-the-backlash-to-the-sso-tax (n/d) | secondary |
| API-first, public changelog, weekly shipping cadence, AI features expected by AI-boom cohort | qualitative | Brex/Ramp AI spend data above | [design] |

## 7. Legal, compliance, payments

| Claim | Value | Source | Status |
|---|---|---|---|
| Series A/B startups routinely asked for SOC 2 in procurement of their own enterprise deals; Type II increasingly expected | qualitative | https://www.brightdefense.com/resources/soc-2-for-startups (n/d) | [unverified] (vendor) |
| "77% of orgs cite SOC 2/ISO as top vendor requirement" (ISC2 2025 as cited) | 77% | https://sprinto.com/soc-2/ | [unverified] |
| "83% of enterprise buyers require SOC 2" | 83% | Bright Defense | [unverified], no source; do not use |
| Startups buying tools rarely require vendor SOC 2 below ~Series A or ~30 employees; Series B+ and security-conscious fintech/health startups do. DPA requests rise with customers' own enterprise deals | threshold | n/a | [design] |
| Payment: corporate card (Brex/Ramp) default for <$1-2K/mo; invoices/ACH via bill pay for annual; Ramp added Bill Pay to its vendor rankings in June 2025 | qualitative | https://marketplace.afponline.org/company/934491/news/3645806/top-saas-vendors-on-ramp-june-2025 (2025-06) | secondary |

## 8. Reputation, reviews, word of mouth

| Claim | Value | Source | Status |
|---|---|---|---|
| Word spreads via X, founder Slack/WhatsApp groups, YC Bookface, investor portfolio channels; bad outage or pricing change spreads within hours | qualitative | n/a | [design] |
| G2 relevance low for dev-first tools, moderate for ops/sales/HR tools bought by non-engineers | qualitative | n/a | [design] |
| Hiring-driven viral loop: employee brings tool to next startup; PostHog runs YC program with $50K credits to seed it | qualitative + vendor page | https://posthog.com/handbook/marketing/startups | [design] + primary |

## 9. Macro sensitivity

| Claim | Value | Source | Status |
|---|---|---|---|
| Funding is concentrated: 2025 rounds lowest in 6+ years while dollars up; AI takes >50% | see section 4 | Carta, PitchBook | primary |
| Shutdowns up 25.6% in 2024 | see section 4 | TechCrunch/Carta | secondary |
| Twilio bought Segment for $3.2B all-stock, ~20,000 customers (announced Oct 2020, closed 2020-11-02) | example of selling to startups then moving upmarket | https://www.businesswire.com/news/home/20201102005287/en/Twilio-Completes-Acquisition-of-Segment-the-Market-leading-Customer-Data-Platform | primary |
| Linear, Vercel, Mercury, Stripe, Brex "grew with customers" | no verified figures retrieved in this session | n/a | [unverified] |
| VCs discount "sell to startups" TAM due to correlated churn; investors favor those that show upmarket path | qualitative | n/a | [design] |

## 10. Stellar vs mediocre operator (all [design])

| Behavior | Stellar | Mediocre |
|---|---|---|
| Entry | Free tier or card-required trial, great docs, 10-minute time to value | Gated "book a demo" form |
| Channel | Builder credibility: HN/GitHub/docs, YC and investor-portfolio deals, founder content | Cold email blasts; PH-only launch spike with no retention |
| Pricing | Startup plan with graduation trigger, usage/seat pricing that grows with headcount | Flat enterprise price; no startup discount; SSO paywalled at tiny scale |
| Retention | Tracks customer runway, funding news; offers pause/downgrade rather than losing logo | Surprised by shutdown churn; ignores post-raise reconsolidation |
| Support | Shared Slack with engineers, same-day fixes, public changelog | Ticket queue, canned replies |
| Upmarket | Ships SSO/SOC 2 when customers cross ~Series B | Builds enterprise features too early or never |
| Common mistakes | Enterprise sales motion on startups; no free tier; ignoring dev experience; concentration in one funding cohort | |

## Planning values for the simulator

All values are planning assumptions informed by the sources above; most are [design].

| Parameter | Value |
|---|---|
| Monthly logo churn | 2.0% (range 1.5-3.0%; spikes to 4% in a funding-winter macro shock) |
| Annual NRR | ~100% (range 90-115%; 108%+ only if seat-based and customers keep hiring; 90% in winter) |
| ACV range | $600-$12,000 typical; $12-60K for Series B+ |
| Cycle days by ACV | <$1K: 0-7 (self-serve); $1-5K: 7-30; $5-25K: 30-60; >$25K: 60-120 |
| Cold reply rate (total) | 3% base (1.5% untargeted AI-spam-looking, 6% highly personalized); positive share ~50% |
| Free-to-paid | 3% freemium base (range 1-7%) |
| Trial-to-paid | 15% opt-in; 40% card-required |
| Share paying by card | 80% below $2K/yr; ~55% overall |
| Share wanting annual | 25% (60% if offered 15-20% discount and customer funded) |
| Support first-response expectation | 2 hours business hours (24h hard fail) |
| CAC payback months | 10 typical (SMB benchmark median 8-12; top quartile 2-6; bottom 15-18) |
| Macro shock sensitivity | High: funding index drop of 30% raises churn x1.8, cuts new signups x0.6, cuts expansion to 0 |

Channel effectiveness multipliers (0-2, 1 = neutral):

| Channel | Multiplier |
|---|---|
| seo | 1.3 |
| content | 1.4 |
| community | 1.6 |
| product_hunt | 0.8 (spike, low retention) |
| ads_google | 0.8 |
| ads_meta | 0.3 |
| ads_linkedin | 0.6 |
| outbound_email | 0.7 |
| outbound_phone | 0.2 |
| partners/resellers | 0.6 |
| marketplace/app store | 1.2 |
| referral | 1.8 |
| events | 0.7 |
| local/door-to-door | 0.0 |

Churn-reason mix (sums to 1.00): business_closed 0.28, acquired 0.07, budget_cut 0.15, switched_competitor 0.10, built_in_house 0.08, price 0.07, not_using 0.10, missing_feature 0.06, support 0.03, outgrew 0.06.

## Gaps to fill if more rigor is wanted
Carta 2025 full-year shutdown count; Linear/Vercel/Mercury growth sources; primary ChartMogul/OpenView churn by segment; any vendor-published startup-segment NRR; cold-email reply specific to technical founders.
