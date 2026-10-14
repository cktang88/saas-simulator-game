# Angels, investor archetypes and the late-2026 fundraising landscape (research for the simulator)

Researched 2026-10-14. This document extends `docs/research/fundraising.md`. That file covers round sizes, the evaluation rubric and the funnel, and this one does not repeat them. It goes deeper on **who the investors are, how each type behaves, and what moves them**, and it corrects that file where newer data exists (see §0). The game data lives in `public/data/investor-archetypes.js`.

**Source quality key (same as fundraising.md).** **[P]** primary (PitchBook-NVCA, Carta, UNH CVR, ACA, YC, a law firm's reading of a statute, the provider's own page). **[S]** secondary summary of a primary source that could not be opened (Carta pages return HTTP 403 to automated fetches). **[V]** vendor or marketing content, used only when nothing better exists. **[design]** an estimate or game-design choice of mine. It is not an observed statistic.

---

## 0. Corrections and updates to `fundraising.md`

| fundraising.md says | Newer / better data | Source |
|---|---|---|
| Median SAFE cap for rounds under $250K: $7.5M (Q2 2025) | **$8M median** in Q2 2026 (25th pct $4.2M, 90th pct $22M). One other summary says $10M, so use **$8–10M**. | Kruze, citing Carta State of Pre-Seed Q2 2026 (updated 2026-08-26) [S]; Finro 2026 [V] |
| Median cap for SAFE rounds above $2.5M: $30–35M | **$30M median**, 25th pct $20M, **90th pct about $100M** (AI-driven) | Kruze/Carta Q2 2026 [S] |
| Seed median $3.0M at $18.4M pre (Q1 2026) | Through Q3 2026: **seed median deal $3.0M** (down from $3.4M in 2025), **median seed pre-money $18.3M** (up from $16.0M). It is the only series whose median deal size fell. | PitchBook-NVCA Venture Monitor Q3 2026 (2026-10) [P] |
| Series A $19.6M at $62M pre (Q1 2026) | Through Q3 2026: **median A deal $17.4M, median A pre-money $60.3M** (2025: $13.7M at $48.1M) | PitchBook-NVCA Q3 2026 [P] |
| AI was 86% of H1 2026 dollars | Year to date through Q3 2026, AI was **82.7% of deal value**, falling each quarter (88.4% Q1, 84.1% Q2, 65.9% Q3). Its **share of deal count is stable at about 44–46%**. | PitchBook-NVCA Q3 2026 [P] |
| "Angels: no reliable 2026 conversion data" | Two datasets now exist. **UNH CVR: angels fund 22.6% of opportunities they see** (yield rate, 2024). **ACA 2026: median investment per angel-group member is $22K**, and the average group investment per deal is $267K. | UNH CVR Dec 2025 [P]; ACA via SSTI 2026-08-05 [S] |
| SAFE structure not quantified | **81% of SAFEs are post-money. 72% are cap-only, 21% cap plus discount, 7% discount-only, and 93% carry a cap** (2025). Kruze/Carta Q2 2026 gives a similar split: 73% cap-only, 21% cap plus discount. | Wilson Sonsini FY2025 Entrepreneurs Report via Causo [S]; Kruze [S] |
| Raise duration 3–6 months | Sources still disagree. A "56 days from first partner meeting to wire" figure is attributed to Carta in one blog, and **3–6 months from first outreach** remains the consensus. The game should keep 3–6 months for the whole process and 4–8 weeks once a lead engages [design]. | vcbeast [V]; CRV via Waveup [S] |
| Deck read time 2.5–4 min | DocSend's own guides (updated Feb–Mar 2026) say **pre-seed decks get 4:10 and seed decks 3:44, with 58% of seed decks read to the end**. Papermark (2024 data) measured **23 s on the first page and about 15 s per later page**. | via HummingDeck 2026-09 [S] |

---

## 1. Market climate, Q3 2026

- **Record dollars, concentrated.** US VC deal value reached **$515.8B in the first nine months of 2026**, about 44% above the 2021 full-year record. Q3 alone was **$98.4B across about 5,012 deals**. Deals of $100M+ (about 5% of deals) took **75% of Q3 value**. [P, PitchBook-NVCA Q3 2026; SiliconANGLE 2026-10-08]
- **Company formation is up, so competition for early money is up.** **8,625 first-time financings ($34.3B)** through Q3 2026 already exceed 2021's full-year record of 8,507. PitchBook: AI "lower[s] barriers to entry," which "only intensified competition for the funding available." [P]
- **Fundraising is barbelled, and the middle of the market is gone.** **$108.5B raised across 699 funds** YTD. Megafunds of $500M+ took 78.1% of capital while being 6% of funds. Established managers took a record 88.2% of capital. **Median fund size is $10M** (five straight years of decline), while the average is $165.4M. **Emerging firms closing a fund fell from 927 (2022) to 440 (2025) to 211 (2026 YTD)**. First-time funds raised $4.9B across 81 vehicles. Funds of $100–500M are now only about 10% of closes. [P, PitchBook-NVCA Q3 2026] **Game implication:** pre-seed and seed money comes from two places, many tiny funds and solo GPs on one side and multistage giants' seed programs on the other. Mid-size "classic seed funds" are scarcer.
- **No fresh dry-powder figure** was found in the Q3 2026 Monitor text. Do not invent one. Use fundraising totals instead.
- **Liquidity is flowing back to individuals, mostly via tenders and M&A, not IPOs.** Carta: **16,538 employees sold in tenders in 2025**, a record, and about 20% were former employees [S, Carta]. Carta H1 2026: **71 tenders, about $3B, transaction value up 200% YoY** [S, Carta headline]. OpenAI employees sold **about $6.6B** at a $500B valuation in Oct 2025 [S, Reuters via several outlets]. Anthropic arranged an employee tender at **≥$350B** in Feb 2026 [S, Bloomberg 2026-02-04]. Q3 2026 exits included **SpaceX's ~$60B all-stock acquisition of Anysphere (Cursor)**, 53% of Q3 exit value, and Stripe's acquisition of OpenRouter [P, PitchBook-NVCA Q3 2026]. **Game implication:** a new cohort of AI-lab and AI-unicorn employees has fresh cash and is writing angel checks. This is the "AI-lab angel" archetype.
- **Older private companies are under water.** On Forge, companies that last raised in 2021 trade at a **median 59% discount**, and 2023-vintage companies at 45%. Bending Spoons bought Airtable and Miro at nearly 90% below peak marks. [P, PitchBook-NVCA Q3 2026] This is the macro reason late-stage-heavy investors pressure early founders on efficiency.
- **Down rounds and bridges.** Carta Q1 2026: down rounds were **11.4%** of priced rounds, back to 2019–2020 levels (about 17% in Q3 2025) [S, Carta via secondary]. Bridges were **16.6% of cash raised in Q2 2025**. No 2026 bridge figure was found. Median time between rounds was **696 days** (all stages, Q2 2025) [S].
- **CVC is retreating.** Corporate investors participated in **20.7% of US deals in 2026** but **80.1% of deal value**: fewer, bigger, AI-infrastructure deals [P, PitchBook-NVCA Q3 2026]. Several CVC units closed in 2026, including Fidelity International Strategic Ventures, PayPal Ventures (wind-down) and others [S, Sifted 2026-05; Crunchbase News].
- **"AI-safe" diversification.** PitchBook reports some VCs are now prioritising sectors "more insulated from AI disruption" [P]. A J.P. Morgan commentary in the same report says investors are "cautious about durable IP differentiation and defensible moats in the application layer" [P]. **Game implication:** the anti-wrapper question is now universal, and some non-AI investors actively like a boring SaaS with a moat.

---

## 2. Angels in late 2026

### 2.1 Market size and base rates
- **US angel market 2024 (latest UNH data):** **$17.9B invested** (−3.1% YoY), **55,346 ventures funded**, **445,535 active angels** (+5.5%). Average deal size fell 4.2%. **Yield rate 22.6%**, meaning angels invest in about 1 in 4.4 opportunities that reach their attention. Seed and start-up stage were **59% of angel deals**. **Software was 20.2% of angel deals**, behind healthcare at 29.5%. The report is titled "A stable market before the AI frenzy". [P, UNH Center for Venture Research, Dec 2025]
  - [design] Implied dollars per funded venture is about $323K (all angels in a round combined). This is my arithmetic, not a published figure.
- **Angel groups (ACA 2026 Angel Funders Report, 2025 data):** **$491.3M** reported by groups (+12%), with deals −3%. **Average investment per deal is $267K.** **78% of group investments are under $300K.** **Median investment per member is $22K.** 60% of dollars go to pre-revenue companies, and 49% of dollars go to seed or earlier. Life sciences took **about 47% of dollars** (up from 31% in 2023). **Nearly two-thirds of groups made at least one AI investment**, favouring applied and vertical AI over foundational AI. Median exit multiple is 2.0x, and 85% of exits are M&A. [P, ACA 2026-07-13; S, SSTI 2026-08-05]
- **Individual check size.** The best primary benchmark is still the ACA/Wharton "American Angel" study (2017): **median check $25K**, a median of 2 new companies per year (mean 4), a median of 10 checks over a career, and an average portfolio of 11.4. Angels with entrepreneurial backgrounds write larger checks (avg $39K). **33% make follow-ons** (40% of experienced angels). [P, ACA/Wharton 2016–17; dated but not superseded] ACA's 2025 member median of $22K is consistent with it. Spain 2024: median €20K, mean €95.5K (IESE/AEBAN) [S].
  - **Game range [design]:** first-time and operator angels $5–25K; experienced angels $25–100K; super angels $100–500K. Vendor claims of a "$127K average" or "$250K minimum in AI" [V, Angel Investors Network] are unverified marketing and should not be used.

### 2.2 Who angels are now (segments)
1. **Ex-founder operator angels** (exited founders and early employees of breakouts). They make the largest checks among individuals (ACA: entrepreneur-angels write bigger checks). They decide on the founder and the problem, and they value speed.
2. **AI-lab and AI-unicorn engineer angels.** This group is new in 2025–2026 because of tender liquidity (OpenAI ~$6.6B in Oct 2025, Anthropic ≥$350B tender in Feb 2026, the Cursor exit in Q3 2026). Some alumni became VCs: TechCrunch notes several OpenAI alums who did not found companies "decided to become an investor". Expect technical diligence (evals, model dependence) and deep skepticism of thin wrappers. [S, TechCrunch 2025; Bloomberg 2026] No dataset counts them, so check size is [design] $10–100K.
3. **Big-tech operator angels** (PMs, eng leads, sales leaders). They are mostly first-time or occasional angels writing small checks ($5–25K [design]). Their value is domain expertise and customer intros. They are slower and need a warm intro.
4. **Super angels / pro angels.** They write $100K–$500K and often lead or anchor a pre-seed. They are highly networked, give the round strong signal, have dozens to hundreds of portfolio companies, and decide fast. Many have converted into solo GPs.
5. **Syndicate leads** (AngelList, Sydecar, Allocations). They put in a small personal check and raise an SPV from their LP list. **Typical economics: 20% carry** (some 20%→30% after 3x), SPV setup fees in the low thousands to about $8K [S, AngelList pages]. **Sydecar Q1 2025: median SPV ~$795K from 8 LPs, closed in 18 days; median 28 days launch-to-wire** across 2023–25 [P, Sydecar press/guide]. Sydecar SPV count was 274 (2022) → 522 (2023) → 769 (2024), with over 35% at seed [P]. AngelList H1 2025: **41.5% of deals were AI/ML** [S].
6. **Angel groups** (regional, member-based). They are slow and process-driven (screening, then pitch meeting, then a diligence team, then individual commitments). They prefer lower caps and priced rounds, and they lean toward life sciences. Members invest individually (median $22K).
7. **Scouts** (operators given a firm's money). Checks are **$25K–$100K** per most sources, with some citing up to $250K [V, inconsistent]. They usually decide without a partner vote and are paid in carry (often reported at about 15%) [V]. A scout check is an option on the parent fund. The parent's later pass can be a negative signal.
8. **Solo GPs and micro-VCs** (often former super angels). Solo GPs led **61% of closed emerging funds** in one 2026 dataset [V, Decile Group]. The PitchBook median fund is $10M [P]. Check $100K–$500K [design]. They lead small pre-seeds and are thesis-specific.
9. **Rolling funds.** They still exist on AngelList (20% carry, quarterly subscriptions) but have faded as a category. No 2025–2026 growth data was found.
10. **International angels.** UK SEIS/EIS angels are driven by tax relief, which requires a qualifying UK company. India abolished its "angel tax" (s.56(2)(viib)) from FY2025-26, which removed a big friction for Indian angels. EU angels write smaller median checks (Spain median €20K). See §2.10.

### 2.3 How angels source deals (2026)
- **Warm intros from founders in their portfolio and from co-investors** remain the top channel (practitioner consensus; ACA 2026 Summit sessions on "relationship-driven access"). No 2026 survey quantifies channel shares.
- **X/Twitter and LinkedIn "build in public"** content is a real inbound channel for operator and AI angels, but all evidence is anecdotal. Many angels say they will answer a short, specific DM from a founder whose work they have seen [design, anecdotal].
- **Demo days and accelerators.** YC runs four batches a year (W26 had about 196 companies). Demo-day deals are fast and competitive.
- **Syndicate and SPV deal flow** and angel-group screening portals.
- **AI-assisted sourcing.** VCs and some pro angels use Harmonic, Specter, Affinity and similar tools to watch hiring, GitHub and social signals. One 2026 survey says **82% of firms use AI for sourcing research**, and another says **42% use it for first-pass screening** [V, Affinity 2026 via vendor blog]. **Game implication:** a founder's public footprint (site, changelog, LinkedIn, X) is screened before any meeting.

### 2.4 Decision speed
- **Individual angels: days to 2 weeks** after one or two calls [design, consistent with Sydecar's SPV timelines of 18–28 days, which include LP collection].
- **Syndicates: 2–4 weeks** (Sydecar median 18–28 days from launch to wire) [P].
- **Angel groups: 4–12 weeks** (screen, then pitch, then diligence, then commitments) [design, from the standard group process].
- **Scouts: 1–2 weeks.** **Accelerators (YC):** decisions come within days of the interview [P, YC process].

### 2.5 What angels ask and what makes them say yes or no
Practitioner consensus (no single dataset) combined with ACA and UNH evidence:
- **Yes drivers:** (1) founder quality and earned insight; (2) speed of shipping (Hustle Fund's Elizabeth Yin cites "speed or velocity... how quickly a team is iterating" [S, Sacra interview]); (3) early revenue or real usage (Yin: pre-seed rounds are now often expected to take a company to about $50K MRR [S, VC Minute summary]); (4) a reasonable cap; (5) a credible lead or a round that is "coming together" (social proof); (6) the angel can actually help.
- **No drivers:** a cap they think will not return the fund (rough rule: they need a plausible 10x+ on the cap); no lead and no momentum; a thin AI wrapper; a founder who cannot answer "why you"; a messy cap table; part-time founders; a heavily stacked SAFE pile; a slow or evasive founder; "send me your deck" with nothing behind it.
- **Common first-call questions** are listed per archetype in the JS file.

### 2.6 Follow-on behaviour
- **33% of angels make follow-on investments (40% of experienced angels)** [P, ACA/Wharton 2017]. ACA 2026 says groups are putting **more money into follow-ons** and fewer new companies [P].
- Most individual angels **do not take pro-rata** in priced rounds. NVCA and market practice limit pro-rata to "major investors" at a 1–2% threshold [S, CRV via Causo]. SPV leads often run a follow-on SPV only for winners.

### 2.7 AI-native startups, solo founders and tiny teams
- **AI dominates angel deal flow.** Nearly two-thirds of angel groups made an AI deal (ACA 2026). AI/ML was 41.5% of AngelList deals in H1 2025 (secondary). AI took **49% of pre-seed dollars in H1 2026**, flat from 50% in 2025 (Carta via Kruze) [S].
- **The angel skepticism is about defensibility, not AI itself.** At seed, AI diligence centres on (a) production reliability (evals, error rates), (b) defensibility beyond the model, and (c) **unit economics after inference cost** [V, Causo 2026]. Investors ask "what happens when the model provider ships this?"
- **Solo founders.** Solo founders were **36% of new Carta startups in 2025** but get a smaller share of dollars [S, Carta]. Angels are the friendliest capital for solo founders because they back people and need no partnership vote. Angel groups and seed funds remain warier [design]. Investors forgive solo status when there is revenue and visible velocity. Revenue per employee is now asked at seed [V, Foundra 2026].
- **Tiny teams with revenue.** These are attractive to angels and to seed-strappers. The risk angels see is "the SAFE never converts" if the company stays profitable and never prices a round [S, seed-strapping commentary]. Some angels now ask for a **conversion-on-dividend or conversion-at-sale clause**, or they simply accept it [design; check with counsel].

### 2.8 Caps and SAFE terms angels accept (2026)
- **Q2 2026 median post-money SAFE caps (Carta via Kruze):** <$250K round **$8M**; $250K–$999K **$10M**; $1M–$2.4M **$15M** (90th pct $40M); $2.5M+ **$30M** (90th pct ~$100M). **The average instrument is $276K.** [S]
- **Instrument mix:** SAFEs made up **93% of pre-priced rounds** in Q2 2026 (Carta via Finro/Kruze) [S]. **81% of SAFEs are post-money; 93% are capped; 72% cap-only; 21% cap plus discount** (WSGR FY2025) [S].
- **MFN:** standard on uncapped SAFEs (YC's $375K uncapped MFN SAFE, Techstars' $200K). A capped SAFE rarely needs an MFN. Angels writing early small checks before a cap is set often ask for one. [P, YC deal page; S]
- **Pro-rata:** this is a **separate YC side letter**, not in the SAFE. Founders usually grant it only to larger checks or leads. [P, YC docs; S]
- **Information rights:** not in the SAFE. Market practice is a **monthly or quarterly investor update** and an annual cap table [design/consensus]. Angel groups often request formal info rights and sometimes a board observer.
- **Priced seed terms (when they occur):** 95% use 1x non-participating preferred, and broad-based weighted-average anti-dilution is near universal [S, Cooley Q1 2025; WSGR].
- **Angel cap tolerance:** angels generally accept the stage median. **Fusion (Israel) found that 34% of angels would invest at $15M+ caps in 2025, up from 27% in 2024** [S, Calcalist]. ACA groups skew lower (priced, sub-$10–12M) [design].

### 2.9 Accredited-investor rules (US) — what changed 2025–2026
- **Current definition (unchanged law as of Oct 2026):** income over **$200K** ($300K joint) in each of the last two years, or net worth over **$1M** excluding the primary residence, or holding a **Series 7, 65 or 82** licence (added by the SEC's 2020 amendments), or a "knowledgeable employee" of a private fund, or a director or executive officer of the issuer. [P, Taft 2025-12-16]
- **INVEST Act** (House-passed **2025-12-11, 302–123**). It would let education, credentials and experience qualify, create a **free SEC/FINRA competency exam**, and **index the thresholds to inflation every 5 years**. It is **not law**: it was in Senate Banking as of mid-2026 [P, Taft; S]. The **Informed Investor Access Act (H.R. 9574)** was introduced 2026-07-02 [S].
- **SEC staff no-action letter (2025-03-12)** on Rule 506(c): issuers can treat **minimum investments of $200K (individuals) / $1M (entities)**, plus written representations, as reasonable verification of accredited status. This makes **general solicitation** (publicly announcing a raise) easier for larger checks. [P, Ropes & Gray, King & Spalding 2025-03]
- **Game rule [design]:** small angels ($5–25K) under Rule 506(b) self-certify. A founder who publicly posts "we're raising" must use 506(c) with verification. Non-accredited friends and family make a round harder and are a soft red flag for institutional investors.

### 2.10 QSBS after the 2025 OBBBA (verified against law firms)
- For stock **acquired/issued after July 4, 2025**: **50% gain exclusion after 3 years, 75% after 4 and 100% after 5**. The per-issuer cap rises from **$10M to $15M** (or 10x basis), and the gross-asset limit from **$50M to $75M**, both **inflation-indexed from 2027**. The non-excluded part of a 3- or 4-year gain is taxed at 28% (DWT). Pre-July-5-2025 stock keeps the old rules (100% at 5 years, $10M cap). [P, Orrick 2025-07-07; Davis Wright Tremaine 2025-07]
- **SAFEs are a grey area.** The IRS has not said whether a SAFE is "stock". Many advisers say the QSBS clock may only start at conversion. Some say only new stock issued after July 4–5, 2025 qualifies. [S, SeedLegals; Law of VC 2025] California does not conform.
- **Effect on angels [design, reasoned from the law]:** (a) exits in 3–4 years now carry a partial tax break, which makes earlier acqui-hires and small exits more attractive to angels; (b) the $75M gross-asset limit lets companies that raise more money still issue QSBS; (c) some angels prefer priced common or preferred over SAFEs to start the clock, and **"is this QSBS-eligible?" is a common angel question** for US C-corps. LLCs and non-US companies do not qualify.

### 2.11 International angels
- **UK:** the SEIS company cap is unchanged (**£250K raised** per company; investor relief 50% on up to £200K a year). From **April 2026** the EIS/VCT company limits doubled to **£10M per year (£20M for knowledge-intensive companies)**, with a lifetime limit of £24M (£40M), and the gross-asset test rose to £30M/£35M. VCT relief was cut from 30% to 20%. [S, Lewis Silkin 2025-12-02; SyndicateRoom] UK angels typically **require SEIS/EIS advance assurance** before investing.
- **India:** angel tax (s.56(2)(viib)) was abolished by the Finance Act 2024, effective from FY2025-26 [S, CA-firm explainers 2026].
- **Spain/EU:** median angel ticket €20K (2024) [S, IESE/AEBAN]. EBAN does not publish a representative Europe-wide check size.
- **Israel:** pre-seed valuations averaged about $13.5M in 2025 (+17%) [S, Fusion via Calcalist].

---

## 3. Institutional investors: how they run things in 2026

### 3.1 Funnel and timeline (adds to fundraising.md §3)
- **Deck-to-meeting rate at pre-seed is 1–2%** (DocSend pre-seed guide, Feb 2026) [S]. **Cold email reply rate is 1–5%**. Investors who **opt in to cold inbound** (e.g. OpenVC listings) report **10–20%** reply rates in a vendor dataset [V]. Follow-ups roughly triple replies (single email ~9% vs a 4–7 touch sequence ~27%, Woodpecker data for general cold email) [V].
- **Warm intro to meeting is 15–50%** (fundraising.md). A referred company is "13x more likely" to get funded [V, unverified].
- **Timeline:** 3–6 months from first outreach to cash (consensus). Seed diligence takes **2–6 weeks**, commonly 4–6, and **over 8 weeks signals a concern** [V, Causo, Pitchwise 2026].

### 3.2 First meetings (consensus practice, no dataset)
- **30 minutes, often on video, sometimes with an associate or scout first.** The investor has already seen the deck (or an AI summary of it) and the founder's LinkedIn and X.
- **Shape:** 2–3 minutes on the founder's story and "why you", then a demo (now expected for AI products, ideally live), then traction and retention, then "why now / why won't OpenAI do this", then the round (size, cap, who's in, timeline). The partner decides within about 48 hours whether to take a second meeting.
- **Questions they are known to ask in 2026:** inference cost per customer and gross margin after inference; evals and failure rates; model-provider dependency; revenue per employee and the hiring plan; month-1/3 logo retention; how customers were acquired (channel repeatability); what has been learned that others do not know; who else is in the round.
- **AI screening:** inbound decks are often first scored by AI tools against the fund's thesis. A clear one-liner, stage, traction numbers and team on the first three slides matter more than design [V, 2026 vendor commentary; consistent with DocSend's first-page attention data].

### 3.3 Diligence, data room and references
- **Seed data room (lean):** the deck, a metrics sheet (MRR waterfall, cohorts, churn), a cap table with the SAFE ledger, incorporation docs, IP assignments, a customer list or contracts, a financial model or budget, and founder backgrounds. Vendors cite about 40 documents, which is overkill at pre-seed.
- **References:** **customer reference calls** (2–5) and **founder backchannels** (former colleagues and managers, found via LinkedIn) are standard at seed. Backchannels are done without asking the founder. No 2026 dataset exists.
- **LinkedIn use:** to verify claims (titles, dates, employers), find mutual connections for backchannels, and pattern-match founders (PitchBook: "consensus" seed deals graduate to A at ~53% vs ~28% for non-consensus, per fundraising.md).

### 3.4 Decks in 2026
- **DocSend:** pre-seed decks get about 4:10 of viewing and seed decks about 3:44. **58% of seed decks are read to the end.** The first page gets about 2x the attention of any other (Papermark: 23 s vs 15 s per later page). **Financials, team and competition** slides get the longest dwell. [S, HummingDeck compiling DocSend/Papermark, 2026]
- **Slide count:** 9–16 pages is the most common range (49% of decks, Papermark 2024). DocSend's seed guide suggests up to 19–20 pages, which conflicts with the 10–12 slide advice. **Game rule [design]: 10–15 slides is neutral, over 20 is a penalty.**
- **Formats:** a PDF or tracked link (DocSend, Papermark, Peony), a 2–3 minute **Loom/demo video** (common for AI products), and a one-paragraph email blurb. A memo-style "deck" is acceptable for some angels and solo GPs.

### 3.5 Outreach channels (game modifiers [design] from the ranges above)
| Channel | Meeting rate | Notes |
|---|---|---|
| Warm intro from a portfolio founder | 35–60% | Best channel. Use a double opt-in forwardable blurb. |
| Warm intro from another investor | 30–50% | Signal depends on the referrer. A "pass-along" from a fund that declined is weaker. |
| Cold email to an investor who lists cold inbound as OK | 5–15% reply, ~3–8% meeting | OpenVC-type opt-in lists [V] |
| Generic cold email | 1–5% reply, 0.5–2% meeting | fundraising.md [V] |
| X/LinkedIn DM to an angel who knows the founder's public work | 5–20% reply | Anecdotal. Only works with an existing public footprint. |
| Accelerator application | ~1% acceptance (YC) | [S] |

---

## 4. Other capital types (brief, behaviour-focused)

- **Accelerators.** **YC: $500K** ($125K for 7% plus a $375K uncapped MFN SAFE), four batches a year, ~1% acceptance [P/S]. **Techstars: $220K** ($20K for 5% plus a $200K uncapped MFN) [S]. **South Park Commons Founder Fellowship: $400K for 7% plus $600K guaranteed in the next round**, no demo day [P, SPC 2024–2026]. **a16z speedrun: up to $1M**, $500K for 10% [P].
- **Multistage seed programs.** Multistage funds (a16z, Sequoia and similar) dominate LP commitments and write seed checks as options on future rounds. PitchBook describes VCs pursuing a "barbell": broad seed appetite while "doubling down as proof points (and ARR) materialize" [P]. The upside is brand and follow-on capacity. The risk is **signalling**: if they do not lead the next round, others ask why.
- **Corporate VC.** In 20.7% of deals, skewed to big AI rounds. Programs are closing. It is slow (strategic sign-off) and may ask for ROFR/ROFN or information rights a founder should resist [P/S].
- **Family offices.** **70% made at least one direct deal** in the past year (Citi 2025). **65% see AI as a core theme** (J.P. Morgan 2026). Most AI money went to frontier-model megarounds, not early-stage [S, Crain Currency 2026]. Behaviour is idiosyncratic and slow, often following a known lead.
- **Revenue-based financing.** Capchase Grow charges a ~10–12% flat discount fee with a **$150K ARR floor** [V, competitor page]. Lighter Capital lends $50K–$4M at a 1.35–1.5x repayment cap in 3–4 weeks [V]. Pipe funds in 2–5 days [V]. See fundraising.md §4 for more.

---

## 5. Investor archetypes for the game (summary; full data in JS)

There are 18 archetypes. Every numeric field is **[design]**, calibrated to the ranges above. `weights` map to the rubric in `public/apps/fundraising/rubric.js`: founder = founder_market_fit + execution; market = market_why_now; traction = traction; defensibility = defensibility; efficiency = business_model; deck = narrative.

| id | kind | Check | Cap tolerance | Leads? | Decision | Top weight | Solo stance |
|---|---|---|---|---|---|---|---|
| operator_exfounder | angel | $10–50K | $6–20M | no | 3–14 d | founder | + |
| ai_lab_angel | angel | $10–100K | $8–40M | no | 2–10 d | defensibility | + |
| bigtech_operator | angel | $5–25K | $5–15M | no | 7–30 d | founder | 0 |
| indie_angel | angel | $5–25K | $3–10M | no | 3–14 d | efficiency | ++ |
| super_angel | angel | $100–500K | $8–30M | yes | 1–7 d | founder | + |
| intl_angel_uk | angel | $10–60K | $3–12M | no | 14–45 d | traction | − |
| syndicate_lead | syndicate | $50K–1M | $8–30M | rarely | 7–28 d | traction | 0 |
| angel_group | angel_group | $50–500K | $3–12M | yes | 30–90 d | traction | − |
| vc_scout | scout | $10–100K | $8–30M | no | 3–14 d | founder | + |
| solo_gp | micro_vc | $100–500K | $6–20M | yes | 5–21 d | founder | + |
| preseed_fund | micro_vc | $250K–1.5M | $8–20M | yes | 14–35 d | founder | 0 |
| seed_fund | seed_fund | $1–4M | $15–35M | yes | 21–56 d | traction | − |
| multistage_seed | multistage | $1–6M | $20–80M | yes | 14–42 d | market | − |
| accel_top | accelerator | $500K (fixed) | standard deal | yes | 7–21 d | founder | 0 |
| accel_regional | accelerator | $150–400K | standard deal | yes | 14–45 d | founder | 0 |
| cvc | cvc | $250K–3M | $15–60M | no | 42–120 d | market | − |
| family_office | family_office | $100K–2M | $10–50M | no | 21–120 d | traction | − |
| rbf_lender | rbf | $50K–2M | n/a | n/a | 2–21 d | efficiency | 0 |

---

## 6. Simulation parameters

| Parameter | Value / range | Source + date |
|---|---|---|
| US active angels | ~445K (2024) | UNH CVR, Dec 2025 [P] |
| US angel dollars / ventures funded | $17.9B / 55,346 (2024) | UNH CVR, Dec 2025 [P] |
| Angel yield rate (invest ÷ opportunities seen) | 22.6% (2024); 20–25% historic | UNH CVR, Dec 2025 [P] |
| Median individual angel check | $22–25K | ACA 2026 ($22K/member); ACA/Wharton 2017 ($25K) [P/S] |
| Angel new deals per year | median 2, mean 4 | ACA/Wharton 2016–17 [P] |
| Angel follow-on propensity | 33% (40% experienced) | ACA/Wharton 2017 [P] |
| Angel-group investment per deal | avg $267K; 78% under $300K | ACA 2026 via SSTI, Aug 2026 [S] |
| Angel-group decision time | 30–90 days | [design] from the standard group process |
| Individual angel decision time | 2–14 days | [design] |
| SPV size / LPs / time to close | median ~$795K / 8 LPs / 18–28 days | Sydecar Q1 2025; 2023–25 guide [P] |
| Syndicate carry | 20% (some 20→30% after 3x) | AngelList fund pages [P] |
| Scout check | $25–100K (some sources up to $250K) | vendor blogs 2025–26 [V] |
| SAFE share of pre-priced rounds | 93% (Q2 2026) | Carta via Finro/Kruze [S] |
| Post-money / capped / cap-only SAFEs | 81% / 93% / 72% | WSGR FY2025 via Causo [S] |
| Median SAFE cap by round size (Q2 2026) | <$250K $8M (some say $10M); $250K–1M $10M; $1–2.4M $15M; $2.5M+ $30M | Carta via Kruze, Aug 2026 [S] |
| 90th pct SAFE cap | $22M (<$250K); $30M ($250K–1M); $40M ($1–2.4M); ~$100M ($2.5M+) | Carta via Kruze [S] |
| Average pre-seed instrument | $276K | Carta Q2 2026 [S] |
| AI share of pre-seed dollars | 49% (H1 2026) | Carta via Kruze [S] |
| Seed median deal / pre-money (2026 YTD) | $3.0M / $18.3M | PitchBook-NVCA Q3 2026 [P] |
| Series A median deal / pre-money (2026 YTD) | $17.4M / $60.3M | PitchBook-NVCA Q3 2026 [P] |
| AI share of US VC value / deal count | 82.7% YTD (65.9% in Q3) / ~45% | PitchBook-NVCA Q3 2026 [P] |
| First-time financings | 8,625 YTD Q3 2026 (record) | PitchBook-NVCA Q3 2026 [P] |
| VC funds closed / capital | 699 / $108.5B YTD; median fund $10M | PitchBook-NVCA Q3 2026 [P] |
| Emerging firms closing a fund | 927 (2022) → 440 (2025) → 211 (2026 YTD) | PitchBook-NVCA Q3 2026 [P] |
| CVC participation | 20.7% of deals, 80.1% of value | PitchBook-NVCA Q3 2026 [P] |
| Down-round share | ~11% (Q1 2026) | Carta via secondary [S] |
| Bridge share of cash | 16.6% (Q2 2025) | Carta via secondary [S] |
| Forge secondary discount (2021 vintage) | 59% median | PitchBook-NVCA Q3 2026 [P] |
| Tender participants / volume | 16,538 employees (2025); ~$3B, 71 tenders (H1 2026) | Carta [S] |
| Deck view time | 3:44 seed; 4:10 pre-seed; 58% read to end | DocSend guides 2026 via HummingDeck [S] |
| Per-slide attention | first page ~23 s; later ~15 s | Papermark 2024 [S] |
| Deck → meeting (pre-seed) | 1–2% | DocSend pre-seed guide 2026 [S] |
| Cold reply (generic / opt-in investors) | 1–5% / 10–20% | vendor data [V] |
| Seed diligence length | 2–6 weeks (>8 weeks = concern) | vendor guides 2026 [V] |
| Accredited thresholds | $200K/$300K income; $1M net worth; Series 7/65/82 | Taft Dec 2025 [P] |
| 506(c) verification via minimum check | $200K individual / $1M entity | SEC no-action 2025-03-12 via law firms [P] |
| QSBS (post-7/4/2025 stock) | 50%/75%/100% at 3/4/5 yrs; $15M cap; $75M assets; indexed 2027 | Orrick Jul 2025; DWT Jul 2025 [P] |
| UK EIS company limit (from Apr 2026) | £10M/yr (£20M KIC); SEIS £250K unchanged | Lewis Silkin Dec 2025 [S] |
| YC / Techstars / SPC deal | $500K (7% + MFN) / $220K (5% + MFN) / $400K for 7% + $600K next round | YC, SPC pages; coverage [P/S] |
| Solo founders, share of new startups | 36% (2025) | Carta [S] |
| Game: probability an angel asks for pro-rata | 0.15 (<$50K), 0.6 ($100K+) | [design] |
| Game: probability an angel asks for MFN when uncapped | 0.8 | [design] |
| Game: AI-lab angel penalty for "thin wrapper" | −1.0 on defensibility | [design] |
| Game: lead-present multiplier on follower commit probability | ×2.0 | [design] |

---

## 7. Obsolete advice (2016–2022 → late 2026)

| Old advice | 2026 reality |
|---|---|
| "Angels write $25K and anyone with money can be one." | Checks are still ~$22–25K median, but accreditation rules apply. Publicly announcing a raise requires 506(c) verification, which the 2025 SEC no-action letter eased for $200K+ checks. The INVEST Act is not law yet. |
| "QSBS needs 5 years, or nothing." | For stock issued after July 4, 2025: 50% at 3 years, 75% at 4, a $15M cap and a $75M asset limit. Whether a SAFE starts the clock is unresolved. |
| "Angel groups are the main angel channel for tech." | Angel groups are 2025's smallest, slowest and most life-science-heavy (47% of dollars) channel. Software founders mostly raise from individual operators, syndicates and solo GPs. |
| "Rolling funds are the future of angel investing." | The category has faded. SPVs (Sydecar, AngelList) and solo-GP funds took over. The median VC fund is now $10M. |
| "Go to a mid-size seed fund for your seed." | Funds of $100–500M are only about 10% of closes. Seed money comes from tiny funds and solo GPs or from multistage giants. |
| "Notes with a discount and a cap." | 81% of SAFEs are post-money and 93% are capped. Discount-only SAFEs fell to 7%. |
| "AI startup = hot = easy angel round." | AI is ~45% of deal count but faces universal "wrapper" diligence (evals, inference margin, model dependency). Some VCs now seek "AI-safe" sectors. |
| "Investors don't care about revenue per employee until growth stage." | It is asked at seed for AI-native tiny teams. |
| "A 20+ slide deck with an appendix is fine." | The first page gets 2x the attention and only 58% of seed decks are read to the end. Investors expect a demo video or a live demo. |
| "CVC money is strategic and patient." | CVC is in ~21% of deals, programs are closing (PayPal, Fidelity Intl), and it is slow. |
| "Liquidity for angels takes 10 years." | Tenders and secondaries reached record levels (Carta 2025–H1 2026). AI-lab employees have cash now. Angels can sometimes sell in secondaries, though 2021-vintage paper trades at ~59% discounts. |
| "UK SEIS/EIS limits are tiny." | EIS company limits doubled from April 2026. SEIS is unchanged at £250K. |

---

## 8. Data gaps (do not fake these in the game)
- No primary 2025/2026 data on **angel decision time**, **angel cold-DM reply rates**, or the **share of pre-seed dollars from individuals**. Carta's report does not break this out publicly.
- UNH's 2025 angel market report was not yet published as of this research. ACA's numbers cover groups only.
- No Q3 2026 **dry powder** number was found.
- Scout check sizes and carry splits vary widely across vendor sources.

---

## Sources (accessed 2026-10-14)
- PitchBook-NVCA Venture Monitor Q3 2026 (data as of 2026-09-30; published Oct 2026) — https://nvca.org/wp-content/uploads/2026/10/Q3-2026-PitchBook-NVCA-Venture-Monitor.pdf ; summary https://siliconangle.com/2026/10/08/us-venture-deal-value-reaches-record-515-8b-as-exits-fail-to-keep-pace/ (2026-10-08)
- UNH Center for Venture Research, "The Angel Market in 2024" (Dec 2025) — https://paulcollege.unh.edu/sites/default/files/media/2025-12/FY%202024%20Analysis%20Report%20Final.pdf
- ACA, 2026 Angel Funders Report announcement (2026-07-13) — https://angelcapitalassociation.org/blog/aca-publishes-2026-angel-funders-report/ ; SSTI takeaways (2026-08-05) — https://ssti.org/blog/takeaways-aca-angel-capital-report
- ACA/Wharton "American Angel" coverage (2016–2017) — https://wraltechwire.com/2016/07/01/survey-average-check-from-the-american-angel-is-25000/ ; https://www.rev1ventures.com/blog/american-angels-wharton-angel-capital-association-study-changes-perceptions-investors-behind-u-s-startup-economy/
- Kruze Consulting, Pre-Seed Funding Guide 2026–2027 (citing Carta Q2 2026; updated 2026-08-26) — https://kruzeconsulting.com/blog/preseed-funding/
- Finro, SAFE caps 2026 — https://www.finrofca.com/news/safe-valuation-caps-2026
- Causo, H1 2026 Seed Deal Terms (citing WSGR FY2025, Cooley; 2026-06-21) — https://hub.causo.ai/guides/h1-2026-seed-deal-terms-report
- Carta, tender offers 2025 — https://carta.com/data/linkedin-startup-tender-offers-employee-liquidity-2025/ ; H1 2026 — https://carta.com/data/tender-offer-update-h1-2026/
- Carta, State of Private Markets Q1 2026 (2026-05-29) — https://carta.com/data/state-of-private-markets-q1-2026/
- Carta, AI seed medians LinkedIn post (Oct 2025) and state of seed recap — https://cednc.org/what-seed-looks-like-now/ (Jan 2026)
- OpenAI $6.6B employee sale (Oct 2025) — https://the-decoder.com/openai-hits-500-billion-valuation-after-secondary-share-sale/ ; https://media.dealstreetasia.com/stories/openai-hits-500b-valuation-after-employees-share-sale-to-softbank-others-report-458448
- Anthropic tender at $350B (Bloomberg, 2026-02-04) — https://bloomberg.com/news/articles/2026-02-04/anthropic-plans-employee-tender-offer-at-350-billion-valuation
- TechCrunch, OpenAI mafia (2025-04-26) — https://techcrunch.com/2025/04/26/the-openai-mafia-15-of-the-most-notable-startups-founded-by-alumni
- Sydecar press and SPV speed guide (2025) — https://www.sydecar.io/press ; https://sydecar.io/guide/spv-fundraising-speed
- AngelList rolling-fund terms (example listing) — https://venture.angellist.com/v/back/sahil-lavingia ; AngelList carry policy — https://angel.co/blog/angellist-no-longer-charges-carry-on-your-own-lps
- Decile Group, solo GP data (2026) — https://decilegroup.com/articles/solo-gp
- Scout programs (vendor, 2025–26) — https://superscout.co/post/vc-scout-programs ; https://vcbeast.com/vc-scout-programs-how-they-work ; https://techcrunch.com/2019/06/07/a-peek-inside-sequoia-capitals-low-flying-wide-reaching-scout-program
- QSBS/OBBBA — Orrick (2025-07-07) https://www.orrick.com/en/Insights/2025/07/New-Law-Significantly-Expands-QSBS-Benefits ; Davis Wright Tremaine (2025-07) https://dwt.com/blogs/startup-law-blog/2025/07/qsbs-big-beautiful-bill-tax-code-upgrades ; SAFE question — https://seedlegals.com/us/resources/can-a-safe-qualify-as-qualified-small-business-stock.md ; https://lawofvc.substack.com/p/qsbs-qualified-small-business-stock-july-2025-exits-15-million-cap-one-big-beautiful-bill-act
- Accredited investor — Taft (2025-12-16) https://www.taftlaw.com/news-events/law-bulletins/u-s-house-of-representatives-passes-bill-to-expand-definition-of-accredited-investor/ ; Rich May on H.R. 9574 (2026) https://www.richmaylaw.com/broadening-access-to-private-markets-what-the-informed-investor-access-act-means-for-investors-and-fund-sponsors/ ; SEC 506(c) no-action — Ropes & Gray (2025-03) https://www.ropesgray.com/en/insights/alerts/2025/03/sec-issues-no-action-letter-clarifying-rule-506c-accredited-investor-verification ; King & Spalding https://www.kslaw.com/insights/articles/sec-staff-no-action-letter-eases-rule-506c-accredited-investor-verification
- UK EIS/VCT Budget 2025 — Lewis Silkin (2025-12-02) https://www.lewissilkin.com/insights/2025/12/02/budget-2025-what-founders-need-to-know-about-the-new-vct-and-eis-reforms ; SyndicateRoom https://www.syndicateroom.com/articles/autumn-budget-2025-changes
- India angel tax — https://www.incorpx.io/blog/angel-tax-abolished-startup-funding-fy-2026-27 (2026)
- Spain angels (IESE/AEBAN, 2024 data) — https://www.iese.edu/insight/articles/business-angels-private-investors-spain
- Israel pre-seed (Fusion via Calcalist, 2025) — https://www.calcalistech.com/ctechnews/article/sjxtowmsbe
- Deck analytics — HummingDeck (2026-04-12, updated 2026-09-20) https://hummingdeck.com/blog/pitch-deck-benchmarks-2026
- Cold outreach and opt-in investors (vendor) — https://www.vcbacked.co/blog/startup-outreach-statistics-2026 ; https://www.angelbacked.co/blog/cold-email-startup-funding-data-analysis
- VC AI tooling (vendor, 2026) — https://www.getspine.ai/blog/what-vcs-are-actually-using-ai-for-in-2026 ; Wharton https://wifpr.wharton.upenn.edu/blog/gpt-ai-vc/
- Seed diligence timing (vendor, 2026) — https://hub.causo.ai/guides/vc-due-diligence-checklist-seed-2026 ; https://www.pitchwise.se/blog/how-long-does-due-diligence-take
- AI agent seed diligence (2026) — https://hub.causo.ai/guides/raising-seed-for-ai-agent-startup-2026
- Hustle Fund / Elizabeth Yin — https://sacra.com/p/elizabeth-yin-hustlefund-interview/ ; https://vcminute.substack.com/p/the-evolving-pre-seed-and-seed-stage
- Revenue per employee at seed (2026, vendor) — https://www.foundra.ai/key-reads/revenue-per-employee-solo-founder-hiring-plan-2026-founder-playbook
- CVC closures — Sifted (2026-05) https://sifted.eu/articles/fidelity-shuts-down-vc-arm ; Crunchbase News https://news.crunchbase.com/venture/corporate-vc-splitting-paypal-fidelity-brotman-alpha/
- Family offices — Crain Currency (2026) https://www.craincurrency.com/investing/family-offices-are-firing-their-vcs-and-betting-directly-ai-just-bubble-talk-gets-loudest ; TechCrunch (2026-09-18) https://techcrunch.com/2026/09/18/family-offices-are-clamoring-for-ai-investments/
- RBF (vendor/competitor pages, 2026) — https://founderpath.com/compare/founderpath-vs-capchase ; https://unlike.net/best-revenue-based-financing-platforms/
- YC deal — https://www.ycombinator.com/deal ; YC batches — https://www.vcbacked.co/blog/yc-winter-2026-batch
- SPC Founder Fellowship (2024–2026) — https://blog.southparkcommons.com/spc-founder-fellowship-spring-2026/
- Seed-strapping commentary — https://henrythe9th.substack.com/p/seed-strapping ; https://seedlegals.com/resources/new-year-new-raise-how-to-get-ahead-in-2026/
