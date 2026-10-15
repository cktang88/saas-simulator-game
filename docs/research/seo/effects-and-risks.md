# SEO mechanics, effects and risks (2025-2026)

Scope: quantified effects of SEO independent of company stage, for the simulator. Compiled late 2026 from web searches (snippets and summaries; primary pages were mostly NOT opened). Confidence tags: **H** = vendor/primary dataset with stated method, **M** = vendor study reported via secondary source or conflicting numbers, **L** = anecdote or unverified. `[unverified]` = no primary or data-backed source found. `[design]` = our own estimate, not a real statistic.

Caveat on all vendor numbers: Ahrefs, Semrush, Seer, Amsive, etc. publish studies that favor their product narrative; their traffic numbers are estimates; most are correlations.

---

## 1. Ranking dynamics

- **Time to rank (Ahrefs, 2M random pages first seen a year earlier):** only **5.7%** of new pages reached Google top 10 for at least one keyword within 1 year. Of those that did, most took about **61-182 days**. Only 0.3% hit top 10 for a high-volume keyword inside a year. Pages on high-DR domains did far better than low-DR. Ahrefs warns the 61-182 day figure is survivorship-biased (it covers only the 5.7%). Source: ahrefs.com/blog/how-long-does-it-take-to-rank/. Conf H (old study, ~2017). A secondary blog cites a newer Ahrefs 2025 figure of 1.74% in top 10 within a year, [unverified].
- **Share of pages with traffic (Ahrefs Content Explorer, ~14B pages, Dec 2023):** **96.55%** get zero Google traffic, 1.94% get 1-10 visits/month, ~3.45% get any meaningful traffic. Ahrefs notes its sample leans toward the "quality side" of the web and traffic is estimated. Source: ahrefs.com/blog/search-traffic-study/. Conf H.
- **Authority and links:** Ahrefs' links studies and later correlation work show backlinks/DR correlate with rankings but weakly versus content relevance; in AI visibility, DR (0.326) and backlinks (0.218) correlate less than branded mentions (see section 5). Ahrefs' own disavow experiments (below) indicate links still matter causally for specific pages. Conf M.
- **Rank volatility after publish:** new pages commonly bounce (initial placement, drop, settle) over weeks; no clean quantified primary source found. `[unverified]`; model as [design].
- **Topical authority and internal linking:** no controlled study with effect size found; widely held practice, Google confirms internal links aid discovery and context. `[unverified]` for magnitude. SE Ranking (Nov 2025, 129k domains) found domains with >32K referring domains ~3.5x as likely to be cited by ChatGPT as those with <=200, so scale of authority matters for LLM visibility too (M).

## 2. Content decay and refresh

- **Decay onset:** Visionary Marketing (vendor, 18,400 refreshes, Jun 2026) reports measurable decay at 6-12 months, accelerating after 18; 67% of pages aged 18-24 months decaying. Conf L-M (vendor blog, method unclear).
- **Refresh lift:**
  - Raptive (103,000 refreshes; publisher network): refreshed pages beat matched non-refreshed pages by ~**19 percentage points** of Google pageview growth; substantive refreshes (>10% word-count change) ~9 pp better than light edits; no guarantee, seasonality matters. Conf M-H (large N, matched control). raptive.com/blog/refresh-analysis-and-google-traffic-growth/
  - Visionary Marketing: median lift **+47%**; 47% of refreshed pages >+30%, 14% flat (+1%), ~10% declined (median -21%); date-only republish ~flat. Conf L-M.
  - Workshop Digital (273 refreshes, May 2026): very large net lift (~554%), looks inflated vs others. Conf L.
  - Vendor claims such as "+106%" (HubSpot) or "+260% in 14 days" (Backlinko) are anecdotal. Conf L.
- **Takeaway for game:** substantive update (facts, structure, intent match) gives the lift; date-bumping gives nothing; roughly 1 in 10 refreshes backfires.
- **Cannibalization/consolidation:** merging overlapping pages + 301 pools links and signals. Ahrefs cautions overlap is a problem only if it hurts overall performance; merging can lose other keyword rankings. One anecdote (87 posts into 12, +156% in 90 days) is L. No controlled data; effect magnitude `[design]`.

## 3. Google updates, spam policy and penalties

- **Core update cadence:** 2024: March (5 Mar - 19 Apr, ~45 days; Helpful Content system folded into core, and Google said it expected ~45% less unhelpful content in results [Google blog, from memory, not re-fetched this session]), Aug (15 Aug - 3 Sep), Nov (11 Nov - 5 Dec), Dec (12-18 Dec). 2025: March (13-27 Mar), June (30 Jun - 17 Jul), December (11-29 Dec, 18 days). 2026: Feb 2026 Discover-only update (first), March spam update (24-25 Mar, under 20 hours, shortest ever) then March core (27 Mar - ~8 Apr), a May 2026 core update is referenced by one source [unverified]. Net: about **2-4 core updates/year**, each rolling out **~2-3 weeks**, plus 1-2 spam updates/year. Sources: Search Status Dashboard via ppc.land, Search Engine Land, Ahrefs algorithm-update history. Conf H for dates.
- **Traffic swings:** Google publishes no figures. Third-party trackers report 40-70% losses on thin affiliate/AI-scaled sites in March 2026 (anecdotal, Conf L). Winners and losers swings of +/-20-50% on affected sites are commonly reported [unverified magnitude]; use [design] distributions.
- **Recovery:** Google's guidance: some recovery may appear between core updates, but the biggest recovery generally comes only at a later core update, i.e. months (typically 3-6+ months to the next one). Spam-policy hits (algorithmic) recover after fixing violations plus recrawl/next spam update; manual actions after a successful reconsideration request (weeks). Sites hit by the Sept 2023 HCU largely did not recover in 2024 (widely reported; Google acknowledged recovery was difficult). Conf M.
- **Spam policies (enforced from Mar 2024):** scaled content abuse (mass-produced pages with no added value, regardless of AI vs human), expired domain abuse, site reputation abuse (third-party content on a host's ranking signals; enforcement began 5 May 2024), plus link spam (paid/exchanged links), cloaking, etc. Source: Google Search Central spam policies, via Wordtracker summary.
- **Manual actions in March 2024 wave:** Originality.ai found ~2% of 79k sites sampled (1,446) got a manual action, half of those 90-100% AI-generated content; Ian Nuttall checked 49,345 sites and found 837 (**1.7%**) fully deindexed; only ~21 later reappeared. Conf M (vendor tools, but concrete N).
- **What triggers:** mass-produced thin pages, expired-domain flipping, paid link schemes, hosting third-party coupon/payday-type sections on a reputable domain, hidden text/cloaking.

## 4. AI Overviews / AI Mode

- **Prevalence:** Semrush ~**48%** of Google queries, Similarweb ~**43%** (Search Engine Roundtable, 30 Jul 2026; no methodology published); Conductor Q1 2026 (21.9M queries) **25%**. Informational queries higher than average (one roundup says ~58%, no primary source); branded/navigational rarely trigger. Shopping/product AIO rose 5% to 14% (2024 to early 2026, secondary). Conf M; range 25-48%.
- **CTR loss:**
  - Ahrefs Apr 2025: position-1 CTR **-34.5%** when AIO present. Ahrefs Feb 2026 update (300k keywords, Dec 2023 to Dec 2025): **-58%** for the top result (7.3% to 1.6% on AIO keywords vs informational non-AIO falling 7.6% to 3.9%); roughly -51% at position 2, -19% at position 10 (secondary summary). Conf M.
  - Seer Interactive (Sep 2025; 3,119 informational queries, 25.1M impressions): organic CTR **1.76% to 0.61% (-61%)** with AIO; paid CTR -68%. Conf M-H.
  - Pew (Mar 2025, 900 US adults, 68,879 searches): clicked a traditional result in **8%** of visits with AI summary vs **15%** without; clicks on links inside the summary ~1%; session ended on 26% vs 16%. Conf H.
  - Amsive (700k keywords): B2B SaaS non-branded informational CTR **-20%**, SaaS overall -15.5% (secondary). Conf M.
- **B2B SaaS traffic:** Schwartz Marketing Lab press release (Aug 2026; 118 SaaS companies, Jan 2025 - Jun 2026): pages held rank while losing up to 99% of clicks (press release only, Conf L). HubSpot customers -27% YoY organic (Apr 2026, vendor); review sites G2 -84.5%, Capterra -89%, TrustRadius -92% organic 2024 to end 2025 (SE Ranking, secondary, Conf M). Gartner "-25% search volume by 2026" is a forecast, not a measurement.
- **Zero-click:** SparkToro/Datos 2024 figure ~59.7% (EU) / ~58.5% (US) zero-click is from memory, not verified this session; mark [unverified].

## 5. GEO / LLM citations

- **Drivers:** Ahrefs (75k brands, May 2025 and Dec 2025 follow-up): branded web mentions correlate strongest with AI Overview visibility (**0.664**), vs branded anchors 0.527, branded search volume 0.392, DR 0.326, backlinks 0.218; Dec 2025 update across ChatGPT/AI Mode/AIO: web mentions 0.656-0.709, **YouTube mentions ~0.737**. Correlation, not causation. Conf M-H. (ahrefs.com/blog/ai-brand-visibility-correlations)
- SE Ranking (Nov 2025): llms.txt had no measurable effect; brand mentions on Reddit/Quora and large referring-domain counts mattered. Reddit one of the most-cited domains (7.7% of cited pages per a secondary post, L).
- **Listicles/comparison pages:** heavily cited but volatile; Seer tracking of 2M+ ChatGPT citations showed listicle citations -30% Dec to Jan (secondary). Citation sets churn heavily month to month. Freshness: Seer Interactive ran a recency test; fresher content tends to be favored (details not verified).
- **Volume:** AI referrals typically **~1% of site traffic** (Scrunch 1.1% of publisher visits Feb-Jun 2026; Visionary 1.84% of organic, vendor). GA4 lumps AI referrals into Referral, so undercounted. Conf M.
- **Conversion vs organic:** highly variable: Ahrefs own B2B SaaS case: AI 0.5% of traffic, **12.1% of signups (23x)**; Semrush 4.4x; Similarweb 2.15x (11.4% vs 5.3%); ecommerce study 1.81% vs 1.39% (1.3x); Clarity publishers 1.66% vs 0.15%. By engine (Seer via secondary): ChatGPT ~15.9%, Perplexity ~10.5%, Claude ~5%, Gemini ~3% vs Google organic 1.76%. Use 1.3x-4.4x as the central band, 23x as a single-company outlier. Conf M.

## 6. Technical SEO

- **JS indexing:** Vercel/MERJ (37k pages): median render delay ~10 s after crawl, p99 ~18 hours; noindex in initial HTML is never rendered; Google renders JS fine. Older Onely claims of heavy indexing failure (e.g. "42% of JS content never indexed") are vendor claims, L. Net: CSR works but is slower to index and fragile; SSR/SSG safer.
- **Crawl budget:** Google says its guide matters for sites with **1M+ pages** changing weekly, **10K+ pages** changing daily, or many "Discovered - currently not indexed" URLs; others need not worry (Search Central, via search results; verify live page). Irrelevant for most startups.
- **Core Web Vitals:** Google calls page experience one of many signals, mostly tie-breaker when relevance is similar; Mueller later said "more than a tie-breaker" but no replacement for relevance. Field data (CrUX p75) used. Effect size small; the one stat (#1 pages 10% likelier to pass CWV than #9) is unsourced, L. Treat as <=2-5% rank-effect [design].
- **Migrations:** SEJ analysis of 892 domain migrations (estimated traffic from third-party tools): average **~523 days** to regain pre-move traffic, **17%** never recovered after 1,000 days (reported via DreamHost and others, not opened; Conf M). A separate salt.agency dataset (1,052 migrations): 59.5% recovered at 1 year, 86.1% at 3 years, mean 489 days, 13.9% not recovered. An Ahrefs analysis reportedly found ~60% of migrations lose measurable traffic [unverified]. Well-run migrations: typical 10-25% dip in first weeks (consultancy estimate, L); sloppy ones 50%+ (single case: -50% week 1, full recovery in 4 months).
- **Accidental noindex/robots disallow:** no case-study data found. Mechanism is certain: noindex in HTML drops pages once recrawled (days to weeks); traffic returns only after re-crawl/reindex (weeks). Magnitude [design].

## 7. Link building economics

- Ahrefs outreach experiment: only 12.6% of sites approached would sell a link; link insertion average ~**$361**; guest post ~$78 per one secondary source (unconfirmed). Conf M.
- BuzzStream 2025: guest post direct from site ~**$365**, via vendor ~**$1,459**. Digital PR: ~**$597** per earned link (UK ~$818, US ~$350), retainers ~$5,458/month. SEO survey (n=518): acceptable price of a quality link ~$509. Marketplace dataset (22k placements): mean $161, median $112. Sellers list at ~£695 but buyers pay ~£155 (Adsy). Conf M.
- **Risk of paid links:** violates Google link spam policy; consequences range from links being ignored (most common) to manual action when patterns are obvious. Google SpamBrain neutralizes most. Disavow: Google says use only with many spammy links that caused or may cause a manual action; Ahrefs' tests show disavowing "toxic" links cost traffic (-7.1% in 20 days in one test, tiny N), and Stox says Google mostly ignores bad links already. Conf M.

## 8. SEO tools as measurement

- **Search Console** = Google-only, first-party, exact clicks/impressions (anonymized queries excluded); the reference.
- **Third-party estimates:** Ahrefs 2022 study vs GSC across 1,635 sites: median deviation **~50%** for Ahrefs, **~68%** for Semrush (self-published, conf M). Varn (30 sites, Jan 2025): Semrush overestimated 15 sites by avg 152%, underestimated 15 by avg 51%. Small sites overshoot 6-10x in practitioner tests. Promodo (184 sites, 2024) exists but figures not retrieved.
- **Costs:** Ahrefs/Semrush plans start roughly $99-130/month (from memory; verify), rank trackers extra. [unverified]

---

## Game-ready parameters

| Parameter | Value / range | Source | Confidence |
|---|---|---|---|
| New page reaches top 10 within 1 year | 5.7% (baseline); 1.7% low-DR [design] | Ahrefs how-long-to-rank | M |
| Time to top 10 for those that make it | 60-180 days median; high-volume kw ~1 year | Ahrefs | M |
| Pages with any meaningful traffic | ~3.5% of indexed pages | Ahrefs 2023 | H |
| High-DR domain multiplier on rank odds | 3-5x vs low DR [design] | Ahrefs (direction only) | L |
| Content decay onset / fast decay | 6-12 mo onset, steep after 18 mo | Visionary Mktg | L-M |
| Substantive refresh effect | +19 pp growth vs control; median ~+30-47%; 10% backfire | Raptive; Visionary | M |
| Date-only "refresh" | ~0% | Visionary | L-M |
| Core updates per year | 2-4, each 2-3 weeks | Search Status Dashboard | H |
| Spam updates per year | 1-2, hours to ~3 weeks | same | H |
| Core-update swing, affected low-quality site | -30% to -70%; winners +20-50% [design] | trackers, anecdotal | L |
| Recovery after core hit | 3-6+ months, next core update; often partial/never for scaled-content sites | Google guidance | M |
| Manual action/deindex rate in spam wave | ~1.7% of sites deindexed (Mar 2024); 2% manual actions | Nuttall; Originality.ai | M |
| AIO prevalence (all queries) | 25-48%; informational higher; branded ~0 | Conductor; Semrush; Similarweb | M |
| CTR loss with AIO, position 1 | -35% (2025) to -58% (2026); Seer -61% informational | Ahrefs; Seer | M |
| Click rate with vs without AI summary | 8% vs 15% | Pew | H |
| B2B SaaS non-branded informational CTR loss | ~-20% (Amsive); worst case far higher | Amsive; Schwartz | M-L |
| Review-site organic loss 2024-25 | -85% to -92% | SE Ranking | M |
| AI referrals share of site traffic | ~1-2% | Scrunch; Visionary | M |
| AI referral conversion multiple vs organic | 1.3x-4.4x central; 23x outlier | Semrush; Similarweb; Ahrefs | M |
| Brand-mention correlation with AI visibility | r ~0.65-0.74 vs backlinks 0.22 | Ahrefs | M-H |
| Citation set churn | high, ~30% monthly swing in listicle citations | Seer | L-M |
| Crawl budget relevance | only >=10K pages daily / >=1M weekly | Google | H |
| CWV rank effect | small, tie-breaker; <=2-5% [design] | Google docs | M |
| Domain migration traffic outcome | mean ~500 days to recover; 14-17% never; 10-25% early dip if well run | SEJ/salt.agency | M |
| JS render delay | median ~10 s, p99 ~18 h | Vercel/MERJ | M |
| Cost per link | insertion ~$360; guest post ~$110-365 (direct) up to ~$1,460 (vendor); digital PR ~$350-600/earned link; only 12.6% of sites sell | Ahrefs; BuzzStream | M |
| Disavow | rarely needed; harmful if misused (~-7% in one test) | Google; Ahrefs | M |
| Third-party traffic estimate error | median ~50-68% vs GSC; small sites 6-10x over | Ahrefs 2022; Varn | M |

## Sources (as retrieved via search)
- ahrefs.com/blog/how-long-does-it-take-to-rank/ ; ahrefs.com/blog/search-traffic-study/ ; ahrefs.com/blog/ai-overviews-reduce-clicks/ ; ahrefs.com/blog/ai-brand-visibility-correlations ; ahrefs.com/blog/toxic-backlink-disavowal/ ; ahrefs.com/google-algorithm-updates
- raptive.com/blog/refresh-analysis-and-google-traffic-growth/ ; visionary-marketing.co.uk (refresh, AI referral)
- Pew via ppc.land/aiweekly ; Seer Interactive AIO CTR study (via summaries) ; seranking.com/blog/chatgpt-seo/
- ppc.land and Search Engine Land (update dates) ; Wordtracker (Mar 2024 manual actions) ; developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget
- vercel.com/blog/how-google-handles-javascript-throughout-the-indexing-process ; salt.agency migration study ; buzzstream.com link pricing
