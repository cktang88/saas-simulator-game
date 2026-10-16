# Term-sheet negotiation: market terms, redline rounds, counsel (2025-2026)

Feeds `public/apps/fundraising/termsheet.js` (multi-round redlines) and complements `docs/research/negotiation/vc-terms.md` (the fuller sourced fact base). Tags: **[S]** sourced primary, **[V]** vendor/platform data, **[unverified]** secondary or practitioner only, **[design]** our game assumption. Never show a [design] number to players as a statistic.

## 1. Market-standard terms (what counsel flags as off-market)

| Clause | Market standard | Off-market in the game | Source |
|---|---|---|---|
| Liquidation preference | 1x non-participating | participating, or any multiple >1x | Cooley quarterly reports 2025: 94-98% of deals at 1x and 95-97% non-participating (Q1 94%/95%, Q2 98%/95%, Q3 95%/97%, Q4 98%/96%) [S]; Q1 2026 96.4% non-participating, 98.2% at 1x [S per vc-terms.md] |
| Option pool | sized to a 12-18 month hiring plan; pools are set post-money but created in the pre-money (the "shuffle") | more than ~2.5 points above a hiring-plan pool (we use 8% seed, 10% Series A [design]) | practitioner guides recommend sizing to the hiring plan rather than a round 10-15% [unverified]; Carta 2026 median seed pool 12.1% (outcomes.js) [V] |
| Board | seed: 3 seats, 2 founders + 1 investor (or 1-1-1 with a mutual independent); Series A: 2-2-1 | seed 2-2-1 or investor majority; Series A investor majority | CRV, Octopus, NVCA model voting agreement (5 seats) [unverified, see vc-terms.md] |
| Protective provisions | NVCA standard list: new senior securities, sale of the company, charter changes | "broad": budget, hiring and debt vetoes | NVCA model [design for prevalence; no sourced figure] |
| Founder vesting | existing vesting kept, or a partial re-vest with credit for time served; double-trigger acceleration | full 4-year re-vest with a cliff and no acceleration | MoFo / practitioner guides [unverified]; standard 4-year/1-year cliff vesting for new founders |
| Information rights | quarterly financials + annual budget to major investors | monthly packages + budget approval + inspection | NVCA model [design for prevalence] |
| Pro rata | major investors only | every investor regardless of size | Osler 2025 (Canada): 94.7% of financings give pro rata to some preferred holders, 5.3% to all [S] |
| No-shop | 30-60 days | 90 days | practitioner sources 30-60 days; sample term sheets use 30 days [unverified] |
| SAFE discount | none (cap only) or 20% | above 20% | Carta 2024, 8,762 SAFEs: cap-only 61%, cap + discount 30%, discount-only 8%, uncapped/undiscounted ~1%; discounts usually 20% [V] (via Carta data posts and Crunchbase News) |
| SAFE MFN / pro rata side letter | both common, especially from funds | not off-market | Carta 2024: a significant share of fund-signed SAFEs carry a side letter, most often MFN, pro rata and information rights [V]; YC moved pro rata to an optional one-page side letter in 2018 [unverified] |
| SAFE terms in general | the YC post-money SAFE is a standard form; negotiation is mostly the cap | anything beyond cap/discount/MFN/pro rata | YC SAFE documents [S, not fetched]; CRV estimates ~72% of 2025 SAFEs were cap-only [unverified] |

**Signed vs first-draft terms [design].** The prevalence figures above describe *signed* deals. First drafts are more investor-friendly; founders and counsel negotiate them back. The game's lead adds draft anchors (`draftTermSheet`): a pool 1-4 points above its own base (60% of drafts, x investor hardness), monthly information rights (30%), broad protective provisions (15%), a 60-90 day no-shop (35%), participation (10%), a 2-2-1 seed board (12%), a full re-vest (8%), more for multistage and CVC leads. These rates are design assumptions, not data.

## 2. How the negotiation moves

- **Rounds:** two to three markups is typical; by a fourth the partner calls it best and final [design; practitioner accounts]. SAFEs: one or two exchanges [design].
- **Turnaround:** a lead partner and fund counsel return a markup in about 2-5 business days (median 3, p90 8 business days in the game), faster when competing term sheets exist [design; practitioner accounts]. Startup counsel review: median 2, p90 5 business days [design].
- **What moves:** anchors and off-market terms come back to market readily when asked for with a reason; price moves 2-10% without leverage and 5-15% per credible competing lead (`vc-terms.md` §2, [design] lift; the 10-20% figure online is unsourced). Market-standard positions (1x non-participating, standard protective provisions, major-investor pro rata) rarely move further.
- **Red flags:** re-trading agreed points, bluffing a competing offer, pushing price far past market without a second term sheet, and markups on an exploding offer all raise the odds the lead walks [design; practitioner accounts, VC Beast]. Losing a lead mid-raise costs 4-8 weeks to replace [design].
- **Trades:** giving something the investor values (a longer no-shop within market, monthly reporting, pro rata for everyone, an extra point of pool) buys goodwill on the asks that matter, but each trade has its own cost [design].

## 3. Counsel cost and what skipping it costs

- Pilot (9,059 transactions): seed rounds average ~$17K of legal fees, pre-seed just under $10K [V]. Fixed-fee seed packages exist; investor counsel is typically paid by the company up to a cap [unverified].
- Game: one counsel review of a priced term-sheet draft $2,500 + 0.75 founder hours; a SAFE/side letter $750 + 0.5 h [design, ~2-4 partner hours]. Without a review, off-market terms are not flagged in the UI.
- Consequences of signed off-market terms (all traceable as delayed mistakes at signing): participation/multiples reduce founder proceeds in the exit waterfall (worked example in vc-terms.md §3); an oversized pre-money pool dilutes existing holders (effective pre-money); an investor-majority board or broad vetoes can block a sale (negotiate/gov.js `saleConsent`); a re-vest forfeits unvested stock at a sale (`vestingForfeit`); monthly information rights cost ~4 founder hours a month [design]; a 90-day no-shop slows the close (closing timeline pull) [design].

## 4. Operator tiers (expected behaviour and effect)

- **Stellar:** counsel reviews the first draft; asks are spent on the pool shuffle, preference and control, each with a reason; price pushed only with a real second term sheet (said plainly); one trade; 1-2 rounds; never re-trades. Keeps the deal (~100% in the tier test) and signs near-market terms.
- **Good:** counsel once, fixes the flagged control and preference terms but leaves the pool shuffle, and pushes price without leverage; one round.
- **Average:** no counsel; pushes price ~20% and nudges the pool; signs the rest as drafted (control and preference traps go through).
- **Mediocre:** no counsel; haggles valuation only (+35%) for four rounds while implying other interest; re-trades; or signs blind. Loses roughly half the term sheets in the tier test.
- Tier test (test/term-sheet.test.js, 12 seeds, same first drafts, exit value fixed from the first draft): survival 100% / 92% / 92% / 75%; expected founder proceeds per term sheet at a 1.5x exit ~$27.0M / $25.1M / $24.0M / $21.0M; founder board control 92% / 82% / 45% / 67% of signed deals [design calibration, not real statistics]. Legal-diligence findings from investor counsel (legal/sim.js) make the lead slightly firmer on every ask.

## Sources

- [Cooley Q1 2025 venture financing report](https://www.cooley.com/news/insight/2025/q1-2025-venture-financing-report)
- [Cooley Q2 2025 venture financing report](https://www.cooley.com/news/insight/2025/2025-08-12-q2-2025-venture-financing-report)
- [Cooley Q3 2025 venture financing report](https://cooley.com/news/insight/2025/2025-11-03-q3-2025-venture-financing-report)
- [Cooley Q4 2025 venture financing report](https://www.cooley.com/news/insight/2026/2026-02-09-q4-2025-venture-financing-report)
- [Carta: which SAFE types are most popular (2024)](https://carta.com/data/linkedin-safe-types-which-most-popular-2024/) (403 to our fetcher; figures via search summaries and [Crunchbase News](https://news.crunchbase.com/?p=89868))
- [Carta: complete breakdown on SAFEs by type and terms](https://carta.com/data/linkedin-preseed-safe-types-complete-breakdown/)
- [CRV: SAFE agreements for startups](https://www.crv.com/content/safe-agreements-for-startups)
- [Pilot: how much does it cost to raise a round](https://pilot.com/insights/how-much-does-it-cost-to-raise-a-round)
- [Osler 2025 deal points report](https://www.osler.com/en/insights/reports/2025-deal-points-report-venture-capital-financings/financing-terms-intelligence-preferred-share-financings/)
- [The option pool shuffle (Frontrun)](https://frontrun.substack.com/p/the-option-pool-shuffle) [unverified, practitioner]
- [VC Beast: SAFE side letter explained](https://vcbeast.com/safe-side-letter-explained) [unverified, practitioner]
- docs/research/negotiation/vc-terms.md (NVCA, CRV, MoFo, Foley, HSBC references)
