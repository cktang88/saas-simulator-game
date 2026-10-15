# SEO and GEO for indie / bootstrapped SaaS founders (research, Oct 2026)

Scope: solo and tiny-team founders. Feeds the simulator's SEO/GEO system.
Legend: **[src]** = data-backed or primary/near-primary source (link given); **[unverified]** = vendor/agency/blog claim without a traceable primary source; **[design]** = our own estimate for the sim, not a statistic.
Research limits: web search returned mostly agency/vendor blogs. Pieter Levels, Marc Lou and Tony Dinh SEO specifics could NOT be sourced (searches returned nothing usable); they are known mainly for launch/audience-driven distribution, not SEO, and nothing here should be attributed to them. Prices come from aggregator sites, not vendor pages; re-check before hard-coding.

## 1. What indies publish, and in what order

Typical indie sequence (synthesis of practitioner guides; ordering is [design] unless noted):

| Order | Asset | Why it comes there | Evidence |
|---|---|---|---|
| 0 | Technical basics: Search Console + Bing verified, sitemap, indexable pages, fast static site, analytics | Nothing else is measurable without it | Practitioner consensus [unverified] |
| 1 | Launch directories / Product Hunt / HN / Reddit, a handful of relevant directories | Fast referring domains and branded queries; not a customer channel by itself | PH links are reportedly nofollow, value is indirect: [SEOJuice](https://seojuice.com/glossary/growth/product-led-growth/product-hunt-launch/), [DEV](https://dev.to/anuj_shashimal/your-product-hunt-launch-dies-in-24-hours-heres-the-post-launch-seo-most-founders-ignore-13i3) [unverified, sources conflict on dofollow] |
| 2 | Bottom-of-funnel pages: "[Competitor] alternative", "X vs Y", use-case/pricing-intent pages | Smallest volume but highest intent; works with little authority | Conversion claims below [unverified] |
| 3 | Free tool / calculator tied to the product's job | Earns links and captures mid-funnel; costs engineering time, which indies have | A 2025 vendor-cited study of 300 B2B SaaS sites: free tools -> 80% faster organic growth, referring domains 3.5x faster ([Stacc](https://thestacc.com/blog/free-tools-traffic-case-study/)) [unverified, original not found] |
| 4 | Programmatic pages (template x data: integrations, locations, use cases, timer/preset pages) | Only when real unique data exists per page | Stagetimer case below |
| 5 | Integration pages, docs/help centre indexed | Cheap, brand-adjacent; docs rank for "how to X in <tool>" | [unverified] |
| 6 | Long-tail blog posts (problem-aware, low-competition) and glossary | Slow; works only after some authority; glossary is thin-content risk if scaled | [design] |

Real data points (few exist at primary quality):
- **Stagetimer** (founder-led timer SaaS, agency-assisted): 40-50 visitors/month in early 2022 -> ~2,700 by Sept-Oct 2022 -> 8,838/month by Feb 2023. Up to ~3,000 indexable programmatic pages from one timer template; pages began ranking July-Sept 2022; average ~3 months to rank; growth turned exponential from ~June 2022 (about 5 months after work began). No cost, hours or signup figures were published. Source: [Embarque case study](https://embarque.io/case-studies/significantly-growing-the-organic-traffic-of-a-saas-from-scratch) (agency-authored; page headline "3x" contradicts its own figures) [unverified].
- Larger-brand programmatic references (Zapier integration pages, TextCortex 2.73M clicks in 13 months per [Omnius](https://omnius.so/case-studies)) are agency/secondhand, not indie-scale, do not use as indie baselines [unverified].
- "73% of successful indie hackers get over half their traffic from organic" ([Superframeworks](https://superframeworks.com/guides/best-seo-tools-for-indie-hackers)) has no methodology [unverified]; do not use.
- A sourced indie counter-example: a maker reports $15k MRR in 4 months driven by niche launch platforms, not SEO ([BetaBoard](https://betaboard.beehiiv.com/p/product-hunt-alternatives-for-indie-makers-2025-my-15k-mrr-story)), first-person [unverified]. Indie reality is that launches and communities pay in weeks, SEO pays in quarters.

## 2. Tooling stack and 2026 prices (per month)

| Tool | Price | Note |
|---|---|---|
| Google Search Console, Bing Webmaster Tools | Free | Day-0 setup; GSC reports indexing and queries |
| Ahrefs Webmaster Tools | Free (own verified site only: site audit, backlinks, organic keywords) | [design]: standard indie tool; not verified in this pass |
| Ahrefs paid | Lite $129 ($108 annual), Standard $249 ($208), Advanced $449 ($374); Brand Radar (AI visibility) add-on from $199 | Capterra/aggregators spring 2026 [src, secondary](https://www.capterra.com/p/176340/Ahrefs/pricing/) |
| Semrush paid | ~$117-139 entry, ~$208-249 mid, ~$417-499 top (names differ by source) | Aggregators disagree; 7-day trial exists [src, secondary](https://capterra.com/p/151962/SEMrush/pricing) |
| Screaming Frog | Free to 500 URLs; paid about GBP 199/year (~$17/mo) | Aggregator figures conflict [unverified](https://toolradar.com/guides/cheapest-seo-tools) |
| Surfer SEO | ~$49-99/mo entry (sources conflict); top tier cut to $359 in Mar 2026 | [CostBench](https://www.costbench.com/compare/surfer-seo-vs-clearscope/) [unverified] |
| Clearscope | Essentials $129/mo; Business $399 (cut Feb 2026) | CostBench [unverified] |
| Plausible analytics | ~$9/mo entry | single secondary source [unverified]; Umami/GA4 free alternatives |
| Hosting/CMS | Vercel Pro $20/user (Hobby free but non-commercial); Framer ~$10-30/site; Webflow Premium ~$25 annual (May 2026 restructure); Ghost Pro ~$15-29 | Aggregators conflict [unverified](https://siter.io/framer-pricing), [Webflow alternatives](https://devtoolpicks.com/blog/best-webflow-alternatives-indie-hackers-2026) |
| Qwoted / Featured.com / Source of Sources | Qwoted free tier, Pro ~$99+ (or $195, sources differ); Featured from ~$49 or free tier; Source of Sources free. HARO/Connectively shut Dec 9 2024; Featured acquired the HARO brand Apr 2025 | [unverified, vendor blogs](https://everything-pr.com/haro-business-media) |

Realistic indie monthly SEO spend [design]: mediocre $0-30 (free tools + hosting); good $50-150 (one keyword tool, analytics, Surfer-class optional); stellar often the same or less, because they spend hours not dollars, and add Ahrefs Lite/Standard only after traffic exists. Paying $249+ for Ahrefs at 0 revenue is a classic waste.

## 3. Founder hours [design unless cited]

Cited anchors: Orbit Media's annual blogger survey: average post ~1,300 words, ~4h10m in 2022 falling to ~3h20m by 2026 (fourth straight decline), via secondary sites ([Neil Patel summary](https://neilpatel.com/marketing-stats/time-spent-creating-blog-post/), [Addlly](https://addlly.ai/blog/how-long-does-it-take-to-write-a-blog-post/)) [unverified secondary]. NP Digital March 2026 (n=300): ~2h average [unverified]. No source breaks out AI-assisted time.

Sim values [design], founder hours per unit:

| Unit | Mediocre (AI dump, publish) | Average | Stellar |
|---|---|---|---|
| Long-tail blog post | 0.5-1h | 3-4h (hand-written, no research) | 5-8h with real product data, screenshots, original angle; AI used for outline/edit only |
| Comparison / alternatives page | 1h (thin, biased copy) | 4h | 6-10h: honest feature table, real testing of competitor, pricing math, switching guide, update cadence |
| Free tool / calculator | 10-15h, generic | 20-30h | 30-60h with a genuinely useful tool plus embedded CTA and shareable output |
| Programmatic build (template + data) | 8h, scraped/duplicated data | 25-40h | 40-80h; unique per-page data, quality gate, pruning of weak pages |
| Technical setup (GSC, sitemap, schema, internal links) | skipped | 4h | 6-10h incl. crawl audit and fixing |
| Monthly maintenance (refresh, tracking, pruning) | 0 | 2h | 6-10h |

Output cadence [design]: mediocre 8-12 posts/month for ~6 weeks then abandons; average 2-4/month; stellar 2-4 high-quality pieces/month sustained 12+ months, mostly bottom/mid funnel.

## 4. Results

- **Most pages never get traffic.** Ahrefs (Dec 2023, ~14B pages): 96.55% of pages get zero Google traffic, 1.94% get 1-10 visits/month; earlier 2018 study: 55% of pages had no referring domains. [Ahrefs](https://ahrefs.com/blog/search-traffic-study/) [src]
- **Time to rank.** Ahrefs: only 5.7% of new pages reach top 10 within a year (of the winners most do so in 2-6 months); only 0.3% reached top 10 for high-volume keywords within a year. A later update cited via a secondary site puts first-year top-10 share at 1.74% [unverified]. [Ahrefs](https://ahrefs.com/blog/how-long-does-it-take-to-rank/) [src for 5.7%]
- **Zero-click headwind.** Ahrefs (Dec 2025 update): AI Overviews cut position-1 CTR ~58% (0.073 -> 0.016, modeled) ([Ahrefs](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update)) [src]. Seer Interactive: organic CTR on AIO informational queries 1.76% -> 0.61%; brands cited in AIOs got 35% more organic clicks (correlation); by Feb 2026 CTR on AIO queries recovered 1.3% -> 2.4%, a levelling off ([Seer](https://www.seerinteractive.com/blog/aio-impact-on-google-ctr-september-2025-update)) [src].
- **Typical indie trajectory [design, anchored on Ahrefs time-to-rank and Stagetimer]:** month 0-3: indexation and a few impressions, ~0-50 clicks/month; month 4-6: first long-tail clicks, 50-500/month for a competent operator; month 12: 500-5,000/month for good, 5k-30k for stellar with several winning page types; month 24: compounding, but 1-in-5 or fewer indie SaaS get >5k/month [design, no sourced share exists]. Mediocre operators sit at <100/month at 12 months. Asymmetry: even a stellar operator can land at the median due to niche volume, a core update or an AI Overview eating the SERP.
- **Share of indie SaaS with meaningful organic traffic:** no primary data found. [design] ~15-25% of indie SaaS ever exceed 1,000 organic visits/month.
- **Conversion by page type** (all vendor/agency numbers, definitions differ; treat as ranges) [unverified]:
  - Comparison "X vs Y": 3-8% visitor-to-trial (SEO agency audit of 70+ SaaS sites, [TripleDart](https://tripledart.com/blog/competitor-comparison-landing-pages)); another table 8-15%.
  - "Alternative to" pages: 5-10% / 6-12%. "vs/alternative" keywords average 8.43% ([Grow and Convert](https://www.growandconvert.com/?p=9117)).
  - Pricing page 12-20% (table, [Owlclaw](https://owlclaw.com/benchmarks/saas-seo-benchmarks)); educational blog 0.5-1.5%; overall organic 2-5%.
  - Sim recommendation [design]: use conservative haircut, blog 0.3-1%, comparison 2-5%, alternatives 2-6%, pricing/use-case 5-10%, tool 1-3% (email capture higher). Bottom-of-funnel volume is typically 10-100 searches/month per keyword, so ten pages give hundreds of visits, not thousands.
- **AI-referred visitors:** claims of 14.2% vs 2.8% conversion (500+ B2B SaaS sites, [AirOps](https://airops.com/blog/ai-referral-traffic-conversion-rates)) and "Ahrefs: 0.5% of sessions, 12.1% of signups" are secondhand [unverified]; a counter-study says gap narrows with segmentation; ecommerce data: 1.81% vs 1.39% (small gap). Volumes are tiny and referrers often stripped.

## 5. Link building indies do

| Tactic | Cost | Effect/risk |
|---|---|---|
| Launch directories, Product Hunt, HN, "Show IH" | $0, 4-15h per launch [design] | Spike, some referring domains, mostly nofollow; low lasting rank effect |
| Free tool / calculator / data study | 30-60h | Best organic link earner for indies; claim of faster domain growth [unverified] |
| HARO-style (Featured.com, Qwoted, Source of Sources) | $0-100/mo + 2-4h/week | Slow; typically 1-3 links/month at good hit rates [design] |
| Guest posts | $164-461 per post bought via vendor/direct; BuzzStream 2025 (26k sites): direct ~$365, vendor ~$1,459; link insertion ~$141; digital-PR avg cost per link ~$597 | [BuzzStream](https://www.buzzstream.com/blog/digital-pr-costs/), [Whito](https://whito.co.uk/research/uk-link-building-statistics/) [src, secondary]; Ahrefs outreach test: only 12.6% of sites would sell, avg ask $361 [unverified]. Only ~7.6% of opportunities meet quality bars [unverified] |
| Reddit/communities | Hours, no cash | Brand mentions + AI-citation fuel; self-promo gets banned |
| Bought links / PBNs / expired-domain repurposing / mass AI pages | $50-500 each | Policy-violating: Google's March 2024 spam policies named scaled content abuse, expired-domain abuse and site reputation abuse; Google targeted ~40% reduction of unhelpful content ([Google](https://developers.google.com/search/blog/2024/03/core-update-spam-policies)) [src]. An Aug 2026 case: a programmatic thin affiliate site lost 14K+ queries after the spam update ([GSQI](https://gsqi.com/marketing-blog/august-2026-google-spam-update-case-studies/)) [unverified, one anecdote] |

## 6. GEO / AI search tactics

- Brand mentions beat links: a 75,000-brand analysis reports 0.664 correlation of web mentions with AI Overview visibility vs 0.218 for backlinks; JSON-LD added to 1,885 pages produced no lift in ChatGPT/AI Mode (secondhand LinkedIn summary of Ahrefs) [unverified]. Brand search volume correlation 0.334 ([5W PR](https://5wpr.com/research/state-of-ai-citations-2026)) [unverified, PR firm].
- Platform divergence: Reddit is a big Perplexity source in vendor data (46.7% of top citations per Profound, secondhand) but ~0% for ChatGPT/Claude in a 72-question B2B test; only ~11% of domains are cited by both ChatGPT and Perplexity ([Orbit Media, 13,184 citations](https://www.orbitmedia.com/blog/ai-citation-sources/)) [unverified, small sample].
- llms.txt: ~0.1% of AI crawler requests touch it; no controlled study shows a citation effect [unverified]. Sim: llms.txt gives approximately zero effect.
- What indies actually do [design]: (1) be listed in "best X tools" roundups and comparison pages on third-party sites, (2) honest comparison/alternatives pages with explicit facts (pricing, limits), (3) genuine Reddit/community presence, (4) clear product pages answering "what is X / who is it for", (5) free-tier monitoring only (paid Brand Radar from $199 is a luxury below ~$5k MRR).
- Effects are small and noisy; AI referrals are typically low single-digit percent of sessions [unverified]. Budget GEO as upside, not as a plan.

## 7. Common indie mistakes and costs [design costs unless cited]

| Mistake | Observable cost |
|---|---|
| Writing for zero-volume or impossible head terms | Months of hours, 0 clicks; 96.55% zero-traffic baseline [src] |
| Top-of-funnel only | Traffic with 0.5-1.5% conversion and many non-buyers; vanity metrics |
| No tracking/GSC | Cannot find winners; repeats losers; indexation bugs unseen for months |
| AI slop at scale | Possible spam-policy demotion (scaled content abuse) [src policy]; brand damage; refresh cost to rewrite |
| Technical neglect (noindex, JS-only rendering, duplicate templates, slow pages) | Pages never indexed; whole programmatic build wasted |
| Expecting results in weeks / quitting at month 3 | Sunk cost; only ~5.7% of pages top-10 in year one [src] |
| Buying links / PBN | Wasted $, possible manual action; recovery takes months |
| Paying for $249+ tools at zero traffic | Cash burn with no output change |
| Programmatic without unique data | Thin pages, deindexing, wasted 25-80h |
| Never updating comparison pages | Stale pricing -> lost trust, errors cited by AI answers |

## What a stellar vs average vs mediocre indie operator does in SEO

| Dimension | Stellar | Average | Mediocre |
|---|---|---|---|
| Setup | GSC + Bing + analytics + crawl audit before publishing; fixes indexation week 1 | GSC only | Nothing; wonders why nothing ranks |
| Keyword choice | Intent-first: bottom-funnel and mid-funnel keywords in own niche; checks SERP and difficulty; mixes few high-intent pages with long tail | Blog topics from a tool, mixed intent | Head terms, or zero-volume "keywords" from AI |
| Content | Comparison/alternatives with real testing, original data, screenshots; AI as assistant, human edit | Hand-written generic posts | AI dumps, 10-30 posts/month |
| Assets | Free tool + comparison pages + selective programmatic with unique data | Blog only | Programmatic duplicates |
| Links | Tool/data earns links, helpful community presence, a few quality directories, HARO-type responses 2-4h/week | A launch + a few directories | Buys links or spams directories |
| GEO | Gets into third-party listicles, Reddit mentions, clear facts on page | Adds schema / llms.txt hoping | Ignores or buys "AI SEO" packages |
| Measurement | Weekly GSC review, prunes/refreshes losers, tracks signups per page type | Looks at total traffic monthly | No tracking |
| Patience | Commits 12+ months; ships steadily | Quits ~month 6-9 | Quits month 2-3 or pivots strategy monthly |
| Hours/month [design] | 25-45 steady | 10-20, erratic | Bursts of 40 then 0 |
| Spend/month [design] | $0-150 | $50-300 | $0-500 (tools/links) |
| Outcome @12 months [design] | 2k-30k organic visits/month, 3-6% of that on bottom-funnel converting at 2-6%; organic = 20-40% of signups; but ~25% of stellar runs still land near median | 200-2,000 visits, conversion ~0.5-1%; organic <10% of signups | <100 visits; possible spam demotion; $1-3k wasted and 150+ hours sunk |
| Outcome @24 months [design] | Compounding; 10k-80k visits/month possible; durable channel | Plateau of 1k-5k | Abandoned or penalized site |
