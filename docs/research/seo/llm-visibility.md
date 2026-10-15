# LLM / AI search visibility (GEO / AEO / LLMO) for SaaS founders

Research for the SaaS Founder Simulator. Date: 2026-10-15. Prefer 2025-2026 sources.
Legend: **[P]** primary or data-backed (named study, vendor docs). **[S]** secondary write-up of a study (not re-verified against the original). **[unverified]** vendor-blog claim with no method. **[design]** our estimate, not a statistic.
Sources are linked inline. Most GEO "statistics" online are vendor marketing; where sources conflict the conflict is stated.

---

## PART A: Audit of what the game simulates today

### What exists

| Area | What it does | file:line |
|---|---|---|
| Citation counter | One scalar `O.citations` ("third-party mentions LLM answer engines can cite"), starts at 0, never decays, never per-engine, never per-prompt | `public/apps/growth/organicEngine.js:31` |
| Traffic formula | `geoDailyVisits(c) = 0.04 * c^0.8` visits/day. 5 citations = 0.15/day, 20 = 0.44/day, 100 = 1.6/day | `public/apps/growth/organicModel.js:63-64`, `public/apps/growth/params.js:209-210` |
| Conversion | Visits routed as source `organic:llm`, mult = `geo.convMult (3) * seo.commercialConv (0.6)` = 1.8x vs a base visitor | `organicEngine.js:372-373`, `params.js:206,210` |
| World modifiers | `aiReferralMult` and `demandMult('geo')` (exponent 0.6) scale it | `organicEngine.js:372`, `params.js:231`, `marketworld/model.js:104` |
| Citation source 1: articles | On publish, `rng < judge.citable` (x0.3 if slop>0.5) gives +1 citation. `citable` is an LLM-judge 0-1 score; rubric criterion `citable_structure` (15%) plus first-hand data (25%) | `organicEngine.js:152-161`, `public/apps/growth/judges.js:310`, `public/apps/growth/rubrics.js:89-107` |
| Citation source 2: community posts | Helpful (>=0.65) un-removed post gives +0.5 citation and +0.3 DR; also a long-tail visit stream | `organicEngine.js:176`, `organicModel.js:96-100` |
| Citation source 3: Product Hunt | Top-10 = +1, else +0.3 | `organicEngine.js:197` |
| Citation source 4: Show HN | Front page = +0.5 | `organicEngine.js:216` |
| AIO CTR hit | Informational queries x0.42 CTR, commercial x0.8 (Ahrefs 2025-12) | `params.js:204-205`, `organicModel.js:52-56` |
| World events | `review_site_badge` event (+10-30% aiReferralMult, 120 days); core-update response "diversify" (+15% aiReferralMult); >=20 recent reviews gives aiReferralMult 1.2 | `public/data/world.js:274, 503, 616` |
| Buyer data | `startResearchInChatbot2026 0.51`, `switchedVendorDueToChatbot2026 0.69` held as data, used only for event text/threshold, not for B2B pipeline | `world.js:~620` |
| UI | Overview stat "N LLM-citable mentions"; article table "LLM-cited" badge; explanatory bullets | `public/apps/organic.js:92, 334, 345, 396` |
| Competitors | Market app maps competitors by LLM (`discoverCompetitors`) and shares; **no notion of AI share of voice** | `public/apps/marketworld/competitors.js:98-163`, `llm.js` |

### What the game does NOT simulate (gaps)

1. **No prompt/answer layer.** Nothing models "when a buyer asks ChatGPT for the best X, who gets named". Citations are a global scalar, not share-of-voice across a prompt set vs competitors.
2. **No third-party listicle / review-site / comparison-page actions.** Biggest real lever (see section 2); the only entry is the random `review_site_badge` event and the >=20 reviews threshold.
3. **No Reddit/Quora-specific model** beyond a generic community post (+0.5). No astroturfing detection beyond promo-score ban; no "brand account flagged / thread screenshot backlash".
4. **No citation decay / recency.** `O.citations` only goes up. Real: AI-cited content skews fresher (Ahrefs), engines change sources (ChatGPT Reddit citations reportedly fell ~86% Aug 2026 [S]).
5. **No volatility.** Real answers rarely repeat (SparkToro): the player should see visibility as a % over N runs, not a fixed rank.
6. **No crawler/technical layer** (robots.txt for OAI-SearchBot/PerplexityBot/Googlebot, JS-rendered content, schema, llms.txt, sitemap freshness). A founder who blocks AI crawlers or ships a JS-only site loses silently.
7. **No measurement/attribution layer.** No tools (Peec, Otterly, Semrush, HubSpot grader), no cost, no hours, no "direct" traffic misattribution or "how did you hear about us: ChatGPT" self-report. Player cannot see their AI visibility without an oracle.
8. **No wrong-facts problem.** LLMs misquote pricing/features/discontinued plans; no negative-sentiment or hallucination events, no correction action.
9. **No model/training-vs-retrieval split.** Brand cold-start (not in training data, retrieval fires only on comparison prompts) is the core reason new products are invisible.
10. **No cost for mistakes in this function.** Paid listicles undisclosed, AI-slop pages, hidden-text injection: only the slop multiplier (x0.3) exists. No FTC/disclosure, no Google demotion, no "ChatGPT now says you are a scam" tail.
11. **Operator-quality separation is weak.** Tier spread comes only from one LLM `citable` score on articles; a stellar vs mediocre operator cannot differ in strategy (listicle outreach vs spam). Tiers likely need a test.
12. **Scale is possibly too small.** 100 citations -> 1.6 visits/day. Real: AI referrals ~0.3-3% of sessions; a site with 300 organic visits/day would see 1-9/day. Fine early, but the conversion multiplier (1.8x) is below most measurements (see 3).
13. **B2B influence not modeled.** The 51% start-in-chatbot figure exists as data but does not shift shortlist/pipeline (unattributed influence).
14. **Series A / seed difference absent**: budgets for PR/Digital PR, analyst/G2 programs, tool stack.

---

## PART B: Research

### 1. How LLM answers pick brands

**Two mechanisms.**
- *Parametric (training data)*: brand recognized only if enough text about it existed before the cutoff. Semrush reported a ~June 2024 training cutoff for the default ChatGPT model as of Jan 2026 [S]. New products mostly are not in it.
- *Live retrieval (search-augmented)*: engines fan a prompt out into sub-queries, fetch results (Bing/Google-style index), and cite pages. **How often retrieval fires**: Semrush clickstream: ChatGPT used web search on **34.5%** of queries in Feb 2026, down from 46% in late 2024 [S]; Profound: ~**18%** of 700k+ conversations triggered >=1 search [S]; Metricus B2B SaaS test: **79% of answers from training data, 21% search**; only tool-comparison prompts reliably triggered search [S, small test]. Implication: for generic "what tool should I use" prompts the brand must exist in the model's memory (third-party mentions pre-cutoff); for explicit "X vs Y / best X tools" prompts, retrieval decides and listicles/comparison pages win.
- Perplexity and Google AI Overviews / AI Mode always retrieve; AIO leans on Google's top-10 (Ahrefs Mar 2026: **37.1%** of AI-cited URLs ranked top-10 for the same query [S]; AirOps/Zyppy similar for AIO [S]).

**Most-cited sources.**
- Peec AI, 30M sources, Mar 2026, US: top domains Reddit, YouTube, LinkedIn, Wikipedia, Forbes, G2, Yelp, Facebook, Medium, TechRadar; Reddit and YouTube top-5 in all five engines; Wikipedia strong in ChatGPT/Perplexity, absent from Google's top 5 [P: [Peec docs](https://docs.peec.ai/research/most-cited-domains-in-ai-search)].
- Everything-PR index (680M+ citations, Apr-Jun 2026): Reddit #1, Wikipedia #2; top 15 domains ~68% of citation share [S, aggregator]. Perplexity-only (LLM Pulse): YouTube ~7% leads, Reddit <1% [S]. **Engines differ a lot**; any single "Reddit is #1" claim is engine-dependent.
- **Volatility of the source mix**: ChatGPT reportedly cut Reddit citations ~86% in Aug 2026 (Promptwatch-sourced) with no public cause [S, unverified causation]. Treat citation source weights as time-varying [design].
- Listicles: Peec analysis of 232k citations / 13k listicles (Dec 2025-Feb 2026, software niche): ~**11%** of cited listicles were self-promotional (vendor ranks itself); ChatGPT ~**4%** vs ~10-11% for AI Mode/Perplexity [P: [Peec](https://peec.ai/blog/self-promotional-listicles-analysis-from-232k-citations)]. Seer reports listicle citations in ChatGPT dropped ~30% [S]. Lily Ray / Search Engine Land: several SaaS brands that ranked themselves #1 saw 30-50% Google visibility drops; Google has not confirmed a cause, and SEL later noted 62% of vendor listicles gained traffic [S].

**Mentions vs links.** Semrush/Growth Memo: ChatGPT cites brand domains in 87% of appearances but names the brand in only **20.7%** [S] (a citation is not a recommendation). Ahrefs 75k-brand study (May 2025): AI Overview mentions correlate with **branded web mentions (r=0.664)**, branded anchors (0.527), branded search volume (0.392), all stronger than backlinks/DR; correlations, not causation [P: [Ahrefs](https://ahrefs.com/blog/ai-overview-brand-correlation/)]. Seer: page-1 Google ranking correlates strongly with ChatGPT brand mentions; backlinks little [S].

**Recency.** Ahrefs, 17M citations (Jul 2025): AI-cited URLs average **1,064 days** since publication vs 1,432 for organic (25.7% fresher); by last-update 909 vs 1,047 days (13.1%). ChatGPT skews newest, AIO oldest [P: [Ahrefs](https://ahrefs.com/blog/do-ai-assistants-prefer-to-cite-fresh-content/)]. Freshness is a mild preference, not a rule.

**Run-to-run volatility and model variance.** SparkToro/Gumshoe (Jan-Feb 2026; 600 volunteers, 12 prompts, ~3,000 runs, 60-100 runs per prompt/platform): probability of the identical brand list twice is **<1%** for ChatGPT and Google AI; identical order **<0.1%**; Claude slightly more repeatable. Top-3 brands' **visibility (% of runs mentioning)** was 73% Claude, 68% Google AI, 64% ChatGPT, so visibility rate is a usable metric, rank is not [P-ish, not peer reviewed: [SEL](https://searchengineland.com/ai-recommendation-lists-rarely-repeat-study-468076)]. Game consequence: report share-of-answers over N runs with noise, never a single rank.

### 2. Tactics and effect sizes

| Tactic | Evidence | Effect | Confidence |
|---|---|---|---|
| Third-party "best X tools" listicles, comparison/"alternatives" pages, G2/Capterra | Peec/Seer listicle data above; G2: review sites (38%) now the top source for shortlisting, ahead of AI chatbots (37%) [S: [G2](https://company.g2.com/news/g2-research-the-answer-economy)] | Largest lever for "best X" prompts; **no clean lift number published** | Medium (direction), Low (size) |
| Branded web mentions (digital PR, reviews, podcasts, community) | Ahrefs r=0.664 | Strongest correlate of AIO mentions | Medium (correlational) |
| Statistics, quotations, cited sources on your own page | GEO paper, Aggarwal et al. KDD 2024 (GEO-bench, 10k queries; DOI 10.1145/3637528.3671900): Quotation Addition and Statistics Addition best, ~**+30-40%** relative on position-adjusted word count, +15-30% on subjective impression; keyword stuffing ~no gain or worse [S: [liner review](https://liner.com/review/geo-generative-engine-optimization)] | Relative lift on an *already retrieved* source; does not get you retrieved | Medium; benchmark was a research setup, 2023 engines |
| Ranking in Google top 10 | Ahrefs 37.1% of cited URLs in top 10; Seer page-1 correlation | Prerequisite for AIO/AI Mode and much of ChatGPT retrieval | Medium |
| Reddit / Quora authentic presence | Reddit top domain in Peec, but ChatGPT reportedly slashed Reddit citations Aug 2026 [S]; Reddit/mods hostile to seeding | Real but engine- and time-dependent; high downside | Medium |
| Wikipedia / Wikidata | Wikipedia = 26-48% of ChatGPT top-10 citations [S, aggregator]; notability rules mean a seed-stage SaaS usually cannot have an article (needs independent significant coverage) [design, Wikipedia policy] | Not available to most indies; a Wikidata item is cheap but low evidence | Low |
| Clear entity/positioning statement (who it is for, price, category on homepage, About, G2, LinkedIn consistently) | Vendor/practitioner advice; mechanism is consistency of third-party descriptions [unverified] | Reduces misclassification and wrong-fact answers | Low |
| Structured data (Organization, Product, FAQ schema) | No independent controlled study found proving citation lift [unverified]; helps rich results and entity clarity | Likely small | Low |
| **llms.txt** | SE Ranking, ~300k domains: 10.13% had it; **no relationship** to citations, model got *better* without the variable [P: [SEJ](https://www.searchenginejournal.com/llms-txt-shows-no-clear-effect-on-ai-citations-based-on-300k-domains/)]; Otterly crawler logs: no preferential crawling [S]; Google says no effect [S] | **~0** | Medium-high |
| Allow AI crawlers | OpenAI docs: **OAI-SearchBot** controls inclusion in ChatGPT search results; **GPTBot** is training only; **ChatGPT-User** is user-initiated fetches; settings are independent; ~24h to take effect [P: [OpenAI bots](https://developers.openai.com/docs/bots)]. Blocking OAI-SearchBot = not shown in ChatGPT search answers. Google-Extended affects Gemini training/grounding only, not Search/AIO [S, from Google docs, not re-fetched]. PerplexityBot controls Perplexity index [S] | Binary gate: blocked = ~0 visibility on that engine | High (OpenAI), Medium (others) |
| Fresh updates | Ahrefs 13% fresher by update date | Small; updating dated stats/pricing pages is cheap | Medium |
| PR | Digital-PR trade claims AI "prefers PR writing style" [unverified]; mechanism = branded mentions on authority domains | Fits Ahrefs correlation | Low-Medium |

### 3. Traffic and conversion

- **Share of traffic**: SE Ranking sample: AI referrals 0.02% (2024), 0.24% (2025), **0.32% (2026)** of all web traffic [S]. Conductor benchmark (domains sampled May-Sep 2025): ~**1.08%** average across 10 industries, **IT/software 2.80%** [S]. Opollo (B2B tech firms): <1% Jan 2025 to **6.4%** Jan 2026 [S, single vendor dataset, conflicts with Conductor growth]. Ahrefs own site (Jun 2025): AI = **0.5%** of traffic, **12.1%** of signups [P, n=1 B2B SaaS]. Working range for a SaaS site: **0.5-3%** of sessions, long tail to 6% for dev-tool/AI-adjacent brands [design synthesis].
- **Engine mix of AI referrals**: ChatGPT ~63-75%, Claude ~5-18% (sources differ: Data-Mania 18.5% vs Visionary 4.7%), Gemini ~10%, Perplexity small [S].
- **Conversion vs organic**: Ahrefs **23x** signups-per-visit (n=1; treat as ceiling); Similarweb ChatGPT-referral ecommerce conversion 11.4% vs organic 5.3% (~2.2x) [S]; Semrush ~4.4x cross-industry [S]; Data-Mania B2B SaaS 14.2% vs 2.8% (5x) [S, vendor]; Adobe retail +42% [S]. **Working range: 2-5x organic, ceiling 20x+** [design]. Game currently uses 1.8x vs commercial-intent organic, 3x vs blog visitor: conservative end.
- **Growth**: share roughly 3-10x/yr from a tiny base; Claude.ai referral 12.8x YoY in Dec 2025 (Previsible via secondary) [S].
- **B2B influence**: G2 2026: **51%** of B2B software buyers start research in an AI chatbot (29% in 2025); 82% sourced recommendations from a chatbot in last 24 months; a reported 69% changed vendor vs initial plan based on chatbot [S; the 69% only in third-party coverage]. Most influence is dark: people read the answer, then Google your brand name or type the URL.
- **Attribution**: A cohort study claims median 34% of GA4 "Direct" is AI-referred (41% for B2B SaaS) [S, [unverified] method]. Many AI clients strip referrers. Practical: add "How did you hear about us?" free-text on signup; expect ChatGPT/Claude mentions to exceed analytics-measured AI sessions by ~2-3x [design].

### 4. Tooling and 2026 prices (verify before use; sources are mostly vendor-authored and conflicting)

| Tool | Reported price | Measures | Who uses |
|---|---|---|---|
| HubSpot AEO / AI Search Grader | Free, one-time, no account | 5 dims (sentiment, presence, recognition, share of voice, market position), 0-100, on ChatGPT/Perplexity/Gemini; Leader/Challenger/Niche | Everyone, first look |
| Manual prompt testing | $0; ChatGPT/Claude/Perplexity free tiers | 20-50 prompts x several runs | Indie |
| Otterly.AI | ~$29/mo (15 prompts), higher ~$189/$489, Enterprise $1,000+ | Mentions, citations, link coverage, 4 engines | Indie to seed |
| Peec AI | ~EUR70-95/mo entry (50 prompts), up to ~EUR199+; annual vs monthly differ | Visibility %, position, sentiment, sources/domains | Seed, agencies |
| Semrush AI Visibility Toolkit | ~$99/mo per domain (25 prompts; +$60 per 50) | Share of voice, sentiment, prompts | Teams already on Semrush |
| Ahrefs Brand Radar | Custom Prompts included with Ahrefs plans (5/10/20 on Lite/Standard/Advanced); standalone AI index reported $99-199/mo | Mentions, citations, share of voice across indexes | SEO-led teams |
| AthenaHQ | ~$295-499/mo | Visibility, citations, action recommendations | Seed to Series A |
| Scrunch AI | ~$250-500/mo; Sitecore announced acquisition Jun 2026 | Monitoring + AI-optimized site serving | Series A+ |
| Profound | Self-serve reportedly $99 (ChatGPT only, 50 prompts) / $399; pricing page changed ~Sep 2026; enterprise custom (often 4-5 figures/mo) | Largest prompt data, conversations, agent analytics, share of voice | Series A+/enterprise |
| BrightEdge | Enterprise contract [unverified] | AI Overview tracking inside SEO suite | Enterprise |

Sources for prices: [DataDab comparison](https://www.datadab.com/research/profound-vs-hubspot-aeo-vs-scrunch-vs-otterly-vs-peec-vs-athenahq), [Eclincher](https://www.eclincher.com/articles/profound-alternatives-8-ai-visibility-tools-after-profounds-pricing-change), [Rework](https://resources.rework.com/tools/aeo-ai-visibility/semrush-ai-toolkit-vs-ahrefs-brand-radar). Confidence: Low-Medium; use ranges.

Stage fit [design]: indie $0-30/mo (grader + manual sheet + maybe Otterly); seed $100-400/mo (Peec/Semrush/Ahrefs add-on); Series A $400-2,000+/mo (Profound/AthenaHQ + agency).

Key measurement limits: tools sample prompts you choose, run each N times, and report visibility %; with <1% list repetition, tracking fewer than ~10 runs per prompt is noise (SparkToro open question on runs needed).

### 5. Hours (all [design] unless noted; no primary data exists)

| Task | Indie founder | Notes |
|---|---|---|
| GEO baseline audit (grader + 20-30 manual prompts x 3 runs on 3 engines + robots.txt/render check) | 4-8 h | One-off, repeat quarterly 2-3 h |
| Build a real prompt set (30-50 buyer prompts from sales calls, support, Search Console, "People also ask"; by funnel stage; competitor names) | 3-6 h | Quality of prompts drives usefulness |
| Fix technical gates (robots.txt, SSR/static HTML, sitemap, pricing/feature page plain text, schema) | 3-10 h | Often a one-off, high value if blocked |
| Own comparison / "alternatives" / pricing / FAQ pages (each, with real data) | 6-12 h each | Same as quality SEO pages |
| Listicle outreach (find 20-40 relevant "best X" pages, personalised pitch, provide data/free account, follow up) | 10-20 h for a campaign, 5-15% reply, 2-6 inclusions; some lists pay or want links [design from outreach practice] | Slow, 2-8 weeks per reply cycle |
| Review-site programme (G2/Capterra: ask 20 real customers, 15-25% respond) | 8-15 h to reach ~20 reviews | Also lifts aiReferralMult in game |
| Authentic Reddit/community presence | 2-4 h/week for 3-6 months before any payoff | Disclose affiliation; answer questions, rarely link |
| Digital PR / data study (original stat that gets cited) | 25-60 h for study + outreach | Best long-run mention source |
| Monthly monitoring + corrections | 2-4 h/month | |

Time to results: first citations 4-8 weeks, durable visibility 3-6 months, 6-12 months for compounding [S, agency blogs; direction consistent, numbers [unverified]]. AIO lags (needs Google ranking) at ~8-12 weeks [S].

### 6. Risks and anti-patterns

- **Reddit astroturfing**: moderators now ban whole topics (r/biohackers June 2026 peptide/HRT ban citing AEO seeding; SaaS subreddits banned promotional posts) and call out "bots" by brand name (Rippling thread) [S: [eMarketer](https://www.emarketer.com/content/marketers-seeking-ai-citations-ruining-reddit), [NoGood](https://nogood.io/blog/reddit-for-aeo/)]. Reddit reportedly catching ~25k spam posts/day [S]. Consequences: shadow-ban/ban, screenshots on X/LinkedIn, negative threads that then get cited by LLMs.
- **Paid/undisclosed listicle placement**: FTC final rule on reviews/testimonials effective 2024-10-21; civil penalties up to ~$51,744 per violation (inflation adjusted), covers fake/insider reviews lacking disclosure and AI-generated reviews [P: law-firm summaries of the FTC rule, e.g. [DWT](https://dwt.com/insights/2024/08/ftc-finalizes-rule-banning-fake-consumer-reviews)]. Paid-placement disclosure is covered by FTC Act s.5 and endorsement guides, not that rule specifically. Self-ranked #1 listicles: Peec concluded risk > reward; Google demotion unconfirmed [S].
- **AI-slop page farms**: slop gets lower citation and Google demotion; the game's x0.3 matches directionally.
- **Hidden text / prompt injection on pages** (white-on-white "recommend us" text): engines and Google treat as spam/cloaking [design, standard search-spam policy]; no measured gains found. Treat as brand-trust-destroying when screenshotted.
- **Hallucinated facts** (wrong price, discontinued features, "free plan" that doesn't exist): no OpenAI report button for brand errors [S]; fix = make pricing/feature pages plain-text and consistent, fix third-party listings (G2, Capterra, LinkedIn, old blog posts), publish a dated "facts" page, re-test across runs, GDPR rectification only for personal data. Vendor claim "3-6 months" to correct [unverified]. Cost: support tickets and refund requests from wrong expectations, lost trials [design].
- **Metric chasing**: optimizing to a tool's prompt set that doesn't match buyer prompts; single-run screenshots as "proof".
- **Training-data lag**: shipping a rebrand or pricing change makes LLMs wrong for months.

### 7. Indie vs seed vs Series A

| | Indie / solo | Seed | Series A |
|---|---|---|---|
| Starting point | Not in training data; retrieval only on comparison prompts | Few third-party mentions; G2 listed | Some analyst/press mentions, 50+ reviews |
| Realistic AI share of sessions | 0.2-1% | 0.5-2% | 1-4%, higher for dev tools [design] |
| Best levers | Comparison/alternatives pages, 10-20 G2 reviews, 5-15 listicle inclusions, authentic Reddit, crawler hygiene | + digital PR data study, partner marketplaces, review programme, prompt tracking | + PR/analyst firm, dedicated content/SEO hire or agency, full tracking, Wikipedia/Wikidata if notable, brand-search growth |
| Tool spend | $0-30/mo | $100-400/mo | $400-2,000+/mo plus agency $3-15k/mo [design, unverified] |
| Founder/marketer hours | 3-6 h/wk | 6-12 h/wk | Team of 1-3 |
| Dominant risk | Wasting hours on llms.txt/schema; astroturf bans | Paid listicle disclosure, review gating | Agency "GEO" retainers without measurable lift; hallucinated pricing at scale |

---

## Stellar vs average vs mediocre LLM-visibility operator

| Dimension | Stellar | Good | Average | Mediocre |
|---|---|---|---|---|
| Baseline | Real buyer prompt set (30-50) from sales/support, 5+ runs each, tracks visibility %, per engine | Prompt set, 3 runs | One-off grader screenshot | Asks ChatGPT "who am I?" once |
| Technical gates | Checked OAI-SearchBot/PerplexityBot/Googlebot allowed, SSR pricing page, no JS wall | Mostly fine | Unchecked, lucky | Blocks AI crawlers via CDN default or copy-pasted robots.txt, or adds llms.txt and calls it done |
| Third-party mentions | Earns inclusion in 10+ relevant "best X" lists, 25+ fresh G2 reviews, original data study cited by others | 5 lists, 20 reviews | 1-2 lists, few reviews | Pays undisclosed placements or posts self-ranked #1 listicles |
| Own content | Comparison/alternatives pages with real numbers, quotes, dated stats, plain-text pricing, updated quarterly | Good comparison page | Generic blog posts | AI-generated bulk pages, keyword stuffing, hidden text |
| Community | Months of disclosed, useful answers; mods welcome it | Some | Occasional link drops | Sockpuppets, multi-account seeding, banned, screenshotted |
| Wrong-fact handling | Monitors monthly, fixes sources, dated facts page | Fixes when noticed | Never checks | Argues with the chatbot, ignores, refunds pile up |
| Attribution | Signup free-text + direct-traffic AI estimate + branded search trend | Self-report field | GA4 referrals only (undercount 2-3x) | Concludes "AI doesn't work" from referral report |
| Plausible outcome (12 mo, stage-normalised) | Named in 40-70% of runs for 3-5 core "best X" prompts; AI ~2-4% sessions, 3-5x organic conv | 20-40% | 5-15% | 0-5%, or negative sentiment/wrong facts, ban penalties |
| Asymmetry | Still no guarantee: answers <1% repeatable, sources shift (Reddit cut) | | | Costs: wasted 40-80 h, reputation hit, FTC exposure on paid fake reviews |

---

## Game-ready parameters

| Name | Value / range | Source | Confidence |
|---|---|---|---|
| AI referral share of sessions (mature SaaS site) | 0.5-3%, dev-tool/AI-adjacent up to 6% | SE Ranking 0.32% overall; Conductor 1.08% / IT 2.80%; Opollo 6.4% | Medium-Low |
| AI referral conversion multiple vs organic | 2-5x median, 23x ceiling (draw lognormal, cap 10x for ordinary SaaS) | Similarweb, Semrush, Data-Mania, Ahrefs n=1 | Medium-Low |
| Annual growth of AI referral volume | 2-4x/yr 2026-27, slowing [design] | Opollo, Previsible | Low |
| ChatGPT / Claude / Gemini / Perplexity share of AI referrals | 63-75 / 5-18 / 10 / 3 | Data-Mania, SE Ranking, Visionary | Medium-Low |
| Share of buyer prompts that trigger retrieval | generic "what tool" 10-20%; explicit comparison 70-85%; overall 20-35% | Semrush 34.5%, Profound 18%, Metricus | Medium-Low |
| Identical answer repeat probability | <1% list, <0.1% order; visibility % per prompt per run is the metric | SparkToro 2026 | Medium |
| Top-3 brand visibility (category leaders) | 64-73% of runs | SparkToro | Medium |
| Mention vs citation | cited-but-unnamed 79% of ChatGPT brand-domain citations | Semrush/Growth Memo | Low-Medium |
| Self-promotional listicle citation share | ChatGPT ~4%, AI Mode/Perplexity ~10-11% | Peec 232k | Medium |
| GEO content rewrite lift (stats + quotes + sources) | +15-40% relative visibility of an already-retrieved page; keyword stuffing 0 to negative | Aggarwal KDD 2024 | Medium |
| llms.txt effect | 0 | SE Ranking 300k domains | Medium-High |
| Blocking OAI-SearchBot / PerplexityBot / Googlebot | removes visibility on that engine (x0) after ~24h-weeks | OpenAI docs | High (OpenAI) |
| Freshness | cited pages ~13-26% younger than organic; update stale stats yearly | Ahrefs 17M | Medium |
| Time to first citation / durable visibility | 4-8 wk / 3-6 mo; AIO lag 8-12 wk | Agency blogs | Low |
| Reddit/community citation weight | engine-time-varying, 0.2-1.0 of baseline; can drop sharply | Peec, Promptwatch | Low-Medium |
| Brand-mention correlation with AIO mentions | r = 0.66 (web mentions) vs 0.39 (branded search) | Ahrefs 75k | Medium |
| B2B buyers starting in AI chatbot | 51% (2026), 29% (2025) | G2 | Medium |
| Review sites vs chatbots as shortlist source | 38% vs 37% | G2 2026 | Medium |
| Unattributed AI influence on direct | +2-3x measured AI sessions | cohort study [unverified] | Low |
| Tool costs per month | grader $0; Otterly ~$29-189; Peec ~EUR70-200; Semrush ~$99; Ahrefs Brand Radar $0-199; Athena ~$295-499; Scrunch ~$250-500; Profound ~$99-399+ | vendor comparisons | Low-Medium |
| FTC penalty ceiling for fake/undisclosed reviews | ~$51,744 per violation | FTC rule 2024 | High |
| Hours | audit 4-8; prompt set 3-6; tech fixes 3-10; comparison page 6-12; listicle campaign 10-20; reviews 8-15; Reddit 2-4/wk; data study 25-60 | [design] | Low |
| Hallucinated-fact correction time | 2-6 months [design] | vendor claims | Low |

---

## Gap list from Part A, ranked by realism impact

1. **Replace scalar citations with a prompt-set share-of-voice model** (per engine, visibility % across N noisy runs, vs competitor shares from the Market app); drives everything else.
2. **Add third-party earned-mention actions**: listicle outreach, G2/Capterra review programme, comparison pages, digital PR; with hours, reply rates, and costs. Highest real lever and currently absent.
3. **Penalties/asymmetry**: Reddit astroturf bans and backlash, undisclosed paid listicles (FTC exposure), AI-slop and hidden-text, wasted hours on llms.txt/schema with logged `logMistake` entries.
4. **Measurement layer**: oracle-free visibility (player must run prompts or buy a tool), tool prices, "direct" under-attribution, signup free-text; avoid showing true state for free.
5. **Technical gates**: crawler allow/block, JS rendering, plain-text pricing page; silent failure with traceable cost.
6. **Training vs retrieval cold-start**: new brands invisible for generic prompts until third-party mentions pre-date the next model; retrieval only on comparison prompts.
7. **Decay and source volatility**: citations age out, engine source mixes shift (Reddit cut), core updates; require refresh work.
8. **Wrong-facts events and correction actions** (pricing/features), with support-ticket and trial-loss consequences.
9. **B2B pipeline influence**: use the 51% chatbot-first buyer stat to shape unattributed inbound/branded search and sales-cycle shortlist odds, not only `organic:llm` visits.
10. **Recalibrate scale**: conversion multiple 1.8x is low versus 2-5x; traffic exponent should key off share-of-voice rather than raw count; add stage tiers (indie/seed/Series A) and operator-tier separation test (articles judged citable vs listicle-and-review operators vs spammers).
11. **Quality signal depth**: make `citable` depend on stats/quotes/sources + freshness (GEO paper) rather than only an LLM judge; add recency decay.
