# Customer type C: online e-commerce SMBs (Shopify, Amazon, DTC)

Research date: 2026-10-16. Segment: $100k-$20M GMV merchants; vendors like Klaviyo, Gorgias, Recharge, Triple Whale, Okendo, Yotpo, ShipStation, Postscript, Loop Returns.

Status legend: primary = vendor/regulator/company filing; secondary = third-party article citing data; [unverified] = vendor or consultant claim with no traceable method; [design] = simulator assumption, not a real statistic.

Research gaps (be honest): no public Shopify-app uninstall benchmark, no sourced "share of Shopify stores that fail", no ecom-specific cold-email benchmark, no agency-influence survey, no CAC payback benchmark for app developers. Those rows are [unverified] or [design].

## 1. Acquisition channels

| Claim | Value | Source (URL, date) | Status |
|---|---|---|---|
| Shopify App Store revenue share | 0% on first $1M lifetime gross app revenue (counted from 2025-01-01, no yearly reset since 2025-06-16), 15% above; 15% on all if prior-year App Store earnings >= $20M or company revenue >= $100M | https://shopify.dev/docs/apps/launch/distribution/revenue-share (read 2026-10) | primary |
| Other App Store fees | 2.9% processing fee on all billing + sales tax; $19 one-time Partner registration; share computed on gross, refunds not deducted | same | primary |
| Built for Shopify (BFS) minimums | 50 net installs from paid-plan shops, 5 reviews, minimum recent rating (number unstated), admin LCP <=2.5s, CLS <=0.1, INP <=200ms, storefront Lighthouse drop <=10 pts | https://shopify.dev/docs/apps/launch/built-for-shopify/requirements (2026-10) | primary |
| BFS benefit | Badge on listing/search, preferential search ranking, eligibility for promotion; weights unpublished | https://shopify.dev/docs/apps/launch/built-for-shopify/achievement-criteria (2026-10) | primary |
| BFS install lift | ~49% more installs in 14 days; badged apps median 891 reviews vs 425, rating 4.8 vs 4.5 (correlational) | https://www.appjubilee.io/shopify-app-store-report-2026 (2026) | [unverified] |
| Rating threshold effect | Installs drop 40-50% below 4.0 stars; top-rated quarter captures >70% of installs | https://taylorsicard.com/blog/shopify-app-churn-90-day-save-playbook (2026, citing Craftberry) | [unverified] |
| Listing funnel | ~19% listing visit to install (Craftberry) vs 3-8% (consultant); ~30% of installs start a trial; ~2% of visits become paid | taylorsicard.com blog posts above and /shopify-app-listing-conversion (2026) | [unverified], conflicting |
| Ranking inputs | Shopify does not publish; vendors cite review recency/velocity, install rate, retention, relevance, BFS | https://blog.appjubilee.io/shopify-app-store-seo-rank-higher/ (2026) | [unverified] |
| Ecosystem size | 14,600-17,600+ apps; avg merchant runs ~6 apps; Shopify paid developers >$1.3B in 2025 | https://branvas.com/blogs/news/shopify-ecosystem-statistics (2026); Shopify statement as relayed | secondary |
| Average spend on apps | ~$58-67/month per merchant | taylorsicard.com churn post (2026, Craftberry) | [unverified] |
| Cold email reply (general B2B) | 0.45% reply per sent (Belkins, 7.5M emails, founders 0.57%); vendor claims 1.4-3.4% | https://somethinginc.com/blog/cold-email-response-rates-2026-data/ (2026) | secondary / [unverified] |
| Narrow targeting effect | Broad list 0.2% reply; narrowed list 2.3-3.3% | https://prospeo.io/s/cold-email-case-study (2026) | [unverified] |
| Shoptalk | Spring 2026 Las Vegas 24-26 Mar, >10,000 attendees; booth under $5k estimate; Fall ~4,000 | https://withorbital.com/conferences/shoptalk-2026 ; https://vendelux.com (2026) | [unverified] |
| Agencies/partners | Agencies recommend apps and often join app affiliate/partner programs for recurring commission; no survey data found | https://passionates.com/website-development-company/shopify-agency-partners (2026) | [unverified] |
| Channel mechanics (YouTube/ecom Twitter/podcasts, FB groups, integration ecosystems, LinkedIn) | No sourced conversion data found | n/a | [design] |

## 2. Sales motion

| Claim | Value | Source | Status |
|---|---|---|---|
| Dominant motion | Install-and-try self-serve via App Store; billing via Shopify | https://shopify.dev/docs/apps/launch/distribution/revenue-share | primary |
| Typical app cost | ~$58-67/mo avg per app; Gorgias from $10/mo (50 tickets) up to thousands | https://sacra.com/c/gorgias/ (2025); taylorsicard (2026) | secondary / [unverified] |
| Install to trial-to-paid | Median 15-20% of trial installs pay; top quartile 35-50% (consultant); strong-onboarding apps 60-75% of billed trials | https://taylorsicard.com/blog/shopify-app-free-to-paid-calculator ; /shopify-app-economics-one-chart (2026) | [unverified], conflicting |
| Generic SaaS bands | Billed trial 25-35% good, 50-60% great; freemium 3-5% good, 8-12% great | ChartMogul 2026 conversion report as relayed by taylorsicard | secondary |
| Sales-assist for Plus / larger | Klaviyo customers >$50k ARR grew 37% to 3,912 (upmarket); 193k+ customers total | https://www.businesswire.com/news/home/20260210069244/en (2026-02-10) | primary |
| Cycle lengths | Self-serve: minutes to 14 days; sales-assist $500-2,000/mo: 2-6 weeks | n/a | [design] |
| Agencies as gatekeepers | Agencies influence stack for Plus and mid-size merchants | passionates.com above | [unverified] |

## 3. Pricing and willingness to pay

| Claim | Value | Source | Status |
|---|---|---|---|
| Gorgias pricing unit | Per ticket tiers, not per seat; overage ~$0.32-0.40/ticket; AI Agent $0.90-1.00 per resolution | https://sacra.com/c/gorgias/ ; https://www.ringly.io/blog/gorgias-pricing-2025-shopify-helpdesk (2025; Ringly is a competitor) | secondary / [unverified] |
| Triple Whale pricing | Tiered by annual GMV and package; <$250k GMV ~$219/mo (Foundation) up to ~$549/mo at $1-2.5M; page now hides prices; one reported mid-term hike $329 to $549 | https://venon.io/blog/triple-whale-pricing ; https://www.conjura.com/blog/triple-whale-pricing-in-2025-costs-features-and-best-alternatives (2025-26) | secondary |
| Billing API | Merchants pay via Shopify invoice; recurring app subscription plus usage charges with merchant-approved cap; optional trialDays (e.g. 14); GraphQL-only for new public apps since 2025-04-01 | https://shopify.dev/docs/api/shopify-app-remix/latest/apis/billing.md ; https://www.shopify.com/partners/blog/shopify-app-billing-cycle | primary |
| GMV pricing norm | GMV or order-volume tiers align price with merchant revenue; per-seat is a mismatch (owner-operated teams of 1-10) | https://www.sana-commerce.com/blog/gmv-pricing-software/ | secondary; seat mismatch [design] |
| Annual plans | Rare; Shopify billing supports annual app charges but most merchants stay monthly | n/a | [design] |
| Price sensitivity | Merchants run ~6 apps and cut ones not showing attributed revenue | Shopify via branvas (2026) | secondary |

## 4. Churn and retention

| Claim | Value | Source | Status |
|---|---|---|---|
| Store-wide monthly install churn | 2.8% (~452k install/uninstall events a month) | StoreLeads via Craftberry via taylorsicard (2026) | [unverified] |
| App monthly churn | 3-5% while finding fit; 1-2% mature; >5-7% a product problem | https://taylorsicard.com/blog/shopify-app-economics-one-chart (2026-06, "directional") | [unverified] |
| Early uninstalls | ~14% in 24h, ~35% remain at day 90 (one vendor); other claims 20-25% day-one | https://marmeto.com/blogs/elevate/shopify-app-customer-lifetime-value (2026) | [unverified], conflicting |
| General SMB SaaS | 3-7% monthly (30-58% annual); 3-5% monthly in narrower source | https://venasolutions.com/blog/saas-churn-rate (2025) | secondary |
| NRR: Klaviyo | 110% at 2025-12-31 (up 2 pts); 109% Q3 | https://www.businesswire.com/news/home/20260210069244/en (2026-02-10) | primary |
| NRR: strong small apps | >100%; strongest 110-130% | taylorsicard (2026) | [unverified] |
| NRR: SMB-heavy books | high 90s | taylorsicard citing Optifai (2025) | [unverified] |
| Store failure | "~90% fail in year one" has no traceable source; SBA general: ~20% of new businesses fail year one; ecom-specific rate unknown | https://gropulse.com/shopify-success-rate/ (2026); shipaid | [unverified] |
| 90-day effect | 60-70% of annual churn set in first 90 days; first value in <7 days halves churn | taylorsicard citing Shno (2026) | [unverified] |
| Seasonality | BFCM 2025: $14.6B, +27% YoY; Shopify FY2025 GMV $378.4B (+29%); January churn spike and Q4 install surge are widely assumed, not sourced | https://www.newsfilecorp.com/release/276618 (2025-12-02); https://www.sec.gov/Archives/edgar/data/1594805/000159480526000007/shop-20251231.htm | primary (BFCM/GMV); [design] (Jan churn) |
| Sherlocking | Shopify Magic and Sidekick are included in plans; Shopify Email/Flow are native; no documented list of apps killed found | https://dev.to/eliofbm/shopify-sidekick-vs-shopify-magic-what-each-one-actually-does-after-spring-26-52e8 (2026) | secondary |
| Churn reasons mix | No public ecom-specific data | n/a | [design] |

## 5. Support and success expectations

| Claim | Value | Source | Status |
|---|---|---|---|
| Consumer chat expectation | 82% expect immediate live-chat reply; Comm100 2024 real queue wait 23.6s, response 44.8s | https://www.opensend.com/post/average-support-response-time-statistics-ecommerce (2025) | [unverified] |
| 24/7 | 74% of consumers expect round-the-clock availability (Zendesk 2026, relayed) | https://stealthagents.com/research/ecommerce-customer-support-response-time-statistics-2026 | [unverified] |
| Gorgias benchmark | Median first response 6.3h across all industries in March 2026 at the $10M GMV band | same stealthagents page | [unverified] |
| BFS support | No numeric support requirement; Shopify reviews expose slow support | https://shopify.dev/docs/apps/launch/built-for-shopify/requirements | primary |
| Merchant-facing app support | Merchants expect same-day (hours) response; BFCM week is critical | n/a | [design] |

## 6. Product expectations

| Claim | Value | Source | Status |
|---|---|---|---|
| Performance | Admin LCP<=2.5s, CLS<=0.1, INP<=200ms; storefront Lighthouse impact <=10 pts | Shopify BFS requirements (2026-10) | primary |
| Checkout / carrier apps | p95<=500ms, failure <=0.1%, 99.9% success on carrier services | same | primary |
| Fulfillment apps | 97% orders completed, tracking added in 1h for 80%, requests answered in 24h for 95% | same | primary |
| Payments depth | Shopify Payments penetration 65.6% of GMV in 2025 (checkout is Shopify-controlled) | Shopify 10-K FY2025 | primary |
| Integrations | Klaviyo (text/WhatsApp used by 29.6% of SMB+ customers), Gorgias, Recharge integrations expected | Klaviyo release (2026-02-10) | primary |
| Multi-channel (Amazon, TikTok Shop) | Expected by larger merchants; no sourced adoption | n/a | [design] |

## 7. Legal, compliance, payments

| Claim | Value | Source | Status |
|---|---|---|---|
| Mandatory privacy webhooks | customers/data_request, customers/redact, shop/redact must be subscribed before publishing; act within 30 days | https://shopify.dev/apps/build/privacy-law-compliance (2026) | primary |
| shop/redact timing | ~48 hours after uninstall (third-party claim) | lucentinnovation.com | [unverified] |
| Review incentives | Offering, unlocking or withholding features for reviews is now an App Store requirement (announced 2026-07-06); penalties: review removal, demotion/delisting, Partner termination | https://shopify.dev/changelog/strengthening-trust-in-app-store-reviews (2026-07) | primary |
| Review eligibility | Active installers or uninstalled within 45 days; Reviews API recommended | appjubilee / shopify.dev (2026) | secondary |
| Billing | Must use Shopify Billing for App Store apps; Shopify handles sales tax collection on billing | https://shopify.dev/docs/apps/launch/distribution/revenue-share | primary |
| Security review | Light compared with B2B enterprise; no SOC 2 required to list | n/a | [design] |

## 8. Reputation and reviews

| Claim | Value | Source | Status |
|---|---|---|---|
| Rating drives installs | <4.0 stars cuts install success 40-50%; <4.5 hurts clicks | taylorsicard / appjubilee (2026) | [unverified] |
| AI review summary threshold | >=100 text reviews and >=4.0 rating | appjubilee (2026) | [unverified] |
| Review pace | Recency/velocity valued over raw count | https://blog.appjubilee.io/how-reviews-affect-shopify-app-rankings/ | [unverified] |
| Trust filtering | Shopify unpublishes reviews failing trust signals; genuine reviews sometimes caught | Shopify changelog (2026-07) | primary |
| Outage reviews | 1-star reviews cluster in outages, esp. BFCM | n/a | [design] |

## 9. Macro sensitivity and platform risk

| Claim | Value | Source | Status |
|---|---|---|---|
| iOS 14 ATT | Meta said ATT cuts ~$10B from 2022; stock -26%; DTC spent ~35% of ad budget on Facebook pre-ATT | https://finance.yahoo.com/news/how-apple-app-tracking-transparency-works-162225922-220141435.html ; https://www.modernretail.co/marketing/three-years-after-apples-ios-14-changes-brands-find-meta-advertising-has-stabilized/ (2022, 2024-02-15) | secondary |
| Recovery | One agency: CPMs -22% YoY, ROAS +32% by end of 2023 | goprimer / modernretail | [unverified] |
| De minimis / tariffs | Executive order ended de minimis for China/HK from 2025-05-02; >1B de minimis shipments (~$55B) entered US in 2024; ~25% of largest Shopify stores used it partly | https://www.digitalcommerce360.com/2025/04/04/executive-order-de-minimis-ecommerce-china-tariffs/ ; https://www.modernretail.co/operations/how-trumps-suspension-of-de-minimis-will-impact-e-commerce-companies/ (2025) | secondary |
| Platform concentration | Shopify GMV +29% in 2025 to $378.4B; revenue $11.5B; Payments 65.6% | Shopify 10-K FY2025 | primary |
| Developer terms tightened | 2025 change made $1M tier lifetime (not yearly); developer backlash | https://www.businessinsider.nl/shopify-rolled-back-a-lifeline-it-extended-to-app-developers-during-the-pandemic (2025) | secondary |
| VC perception of Shopify-app businesses | Capped market, platform dependency; no sourced data | n/a | [design] |

## 10. Stellar vs mediocre operator

| Behavior | Stellar | Mediocre | Status |
|---|---|---|---|
| App Store | Chases BFS (perf budgets), steady review requests via Reviews API after first value, 4.8+ rating | Ignores listing, asks reviews with incentives (penalized), stays <4.0 | grounded in sources above; effect sizes [design] |
| Onboarding | First value in <7 days, setup call for Plus | Install-and-forget, 2x churn in first 90 days | [unverified]/[design] |
| BFCM | Code freeze from early Nov, scaled infra, 24/7 chat, status page | Ships during freeze, outage, 1-star reviews, mass uninstall in Jan | [design] |
| Pricing | Per order/GMV tiers aligned to merchant revenue, ROI framing via attributed revenue | Per-seat pricing | [design] |
| Distribution | Agency partner program with recurring commission, integration listings | Cold LinkedIn to DTC founders (they live on X, Shopify admin, communities) | [design] |
| Platform risk | Monitors Shopify roadmap, builds depth beyond native features, avoids features Shopify will bundle | Gets sherlocked | [design] |

## Planning values for the simulator

| Parameter | Value | Basis |
|---|---|---|
| Monthly logo churn | 5% (range 3-8%); month 1-3 cohorts 2x | [design] anchored to SMB 3-7% and consultant 3-5% |
| Annual NRR | 95% typical SMB; 105-115% for winners with GMV/usage pricing (Klaviyo 110%) | primary + [design] |
| ACV range | $240-$24,000/yr ($20-$2,000/mo); median ~$900/yr | [design], app spend $58-67/mo |
| Cycle days by ACV band | <$600: 0-3; $600-3k: 3-14; $3k-12k: 14-45; >$12k: 30-90 | [design] |
| Cold reply rate | 1% (positive ~0.3%); cold LinkedIn 0.5x | secondary |
| Free->paid (freemium) | 4% (3-8%) | ChartMogul via relay |
| Trial->paid | 20% median install-trial; 40% good; 60% stellar | [unverified] |
| Share paying by card | 100% via Shopify billing for App Store; 100% card/ACH outside | primary |
| Share wanting annual | 10% | [design] |
| Support first-response expectation | 2 hours business, 15 min chat, same day in BFCM | [design] |
| CAC payback | 6 months (range 3-12) | [design] |
| Channel multipliers (0-2) | seo 1.0, content 1.1, community 1.4, product_hunt 0.4, ads_google 0.9, ads_meta 1.0, ads_linkedin 0.3, outbound_email 0.6, outbound_phone 0.3, partners/resellers 1.6, marketplace/app store 2.0, referral 1.3, events 0.7, local/door-to-door 0.0 | [design] |
| Macro shock sensitivity | 1.3 (ad costs, tariffs; churn +30% in shock, installs -20%) | [design] |
| Churn-reason mix | business_closed 0.30, acquired 0.01, budget_cut 0.06, switched_competitor 0.17, built_in_house 0.05 (native Shopify feature), price 0.12, not_using 0.15, missing_feature 0.06, support 0.05, outgrew 0.03 (sum 1.00) | [design] |
