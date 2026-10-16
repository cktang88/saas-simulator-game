# VC negotiation terms: sourced facts for the counterparty LLM (2025-2026)

Status: first pass. Tags: **[unverified]** = found only in secondary or vendor sources, or not found in primary data. **[design]** = our simulation assumption, not a statistic. Primary sources were often blocked (Carta 403, Fenwick and NVCA PDFs not readable), so several figures are secondary.

## 1. Market terms by stage

**Valuation and SAFE caps**
- Carta SAFE post-money caps, 2025 medians: about $10M for $250K-$1M rounds, about $15M for $1M-$2.5M rounds ([Carta pre-seed 2025](https://carta.com/data/state-of-pre-seed-2025/)). Carta Q2 2025: under $250K median $7.5M; $250K-$500K median $10M ([Carta Q2 2025](https://carta.com/data/state-of-pre-seed-q2-2025-full-report/)). Earlier LinkedIn benchmark: $12.5M for $1M-$1.9M, $15M for $2M-$2.9M ([Carta SAFE benchmarks](https://carta.com/data/linkedin-safe-benchmarks-2025-valuation-caps/)). No 2026 Carta cap figure found [unverified].
- Seed pre-money: PitchBook-NVCA Q1 2026 median about $18.4M, seed deal size $3.0M, per a secondary article ([GamesBeat summary](https://gamesbeat.com/?p=321004); [PitchBook-NVCA Q1 2026](https://nvca.org/wp-content/uploads/2026/04/Q1-2026-PitchBook-NVCA-Venture-Monitor.pdf)) [unverified: secondary].
- Series A pre-money: Cooley Q1 2025 median $52.5M ([Cooley Q1 2025](https://www.cooley.com/news/insight/2025/q1-2025-venture-financing-report)). PitchBook-NVCA Q1 2026 about $62M (secondary) [unverified].
- Carta's post-money numbers (about $24M seed, $78.7M Series A, Q4 2025) come from a secondary blog and conflict with the above. Do not mix bases. Carta and PitchBook use different methodologies [unverified].
- Trend: Cooley Q1 2026 reports 86% of rounds were up rounds, down from a high of 79.7% in Q4 2025 (rising). Down rounds were 11.4% in Q1 2026 ([Cooley Q1 2026](https://cooley.com/news/insight/2026/2026-04-29-q1-2026-venture-financing-report)). Q1 2026 deal count was 165, the lowest since Q3 2016 (same source).

**Dilution per round:** typical seed dilution of about 20% and Series A of about 20-25% is a practitioner rule of thumb [unverified; no sourced 2025 median found]. Use [design] ranges in the sim.

**Option pool and the pool shuffle**
- A pool is usually set pre-money, so existing holders absorb the top-up.
- Worked example (our math, $000s): headline pre-money $12M; $3M new money for 20% post; post-money $15M; 10% post-money pool ($1.5M). Existing holders keep 70% = $10.5M. Effective pre-money is $10.5M, which is 12.5% below the $12M headline.
- Sources give pool sizes of about 10-15% post-money as common [unverified].

**Liquidation preference**
- 1x non-participating is the standard: 96.4% of U.S. deals in Q1 2026 and 96% in Q4 2025 ([Cooley Q1 2026](https://cooley.com/news/insight/2026/2026-04-29-q1-2026-venture-financing-report); [Cooley Q4 2025](https://www.cooley.com/news/insight/2026/2026-02-09-q4-2025-venture-financing-report)). 98.2% of deals had a 1x preference (same source).
- Participating: about 5% of U.S. financings (Osler, citing U.S. studies) and 3.2% of Canadian 2025 financings ([Osler 2025 Deal Points](https://www.osler.com/en/insights/reports/2025-deal-points-report-venture-capital-financings/financing-terms-intelligence-preferred-share-financings/)). It is less common in hot markets: HSBC notes that competition pushed investors toward founder-friendly terms ([HSBC 2026 guide](https://www.hsbcinnovationbanking.com/en/resources/venture-capital-term-sheet-guide-2026)) [unverified: survey of 29 law firms and 711 term sheets, not isolated to founder-side data].

**Anti-dilution:** broad-based weighted average is the U.S. standard. Osler reports 100% of 2025 Canadian financings and cites Wilson Sonsini at 100% for U.S. ([Osler](https://www.osler.com/en/insights/reports/2025-deal-points-report-venture-capital-financings/financing-terms-intelligence-preferred-share-financings/)). Full ratchet is not measured in these sources and is rare in practice [unverified].

**Redemption, dividends, pay-to-play**
- Redemption: 1.8% (Q4 2025) to 6.1% (Q1 2026) of deals, which is noisy across quarters ([Cooley Q1 2026](https://cooley.com/news/insight/2026/2026-04-29-q1-2026-venture-financing-report)).
- Accruing dividends: 2.4-3.6% of deals ([same](https://cooley.com/news/insight/2026/2026-04-29-q1-2026-venture-financing-report)).
- Pay-to-play: 6.3% (Q4 2025) and 7.3% (Q1 2026). 9.9% in Q3 2025 ([Cooley Q4 2025](https://www.cooley.com/news/insight/2026/2026-02-09-q4-2025-venture-financing-report)).
- Recapitalizations: 0.9-1.8% of deals (Cooley).

**Board**
- Seed: typically 3 seats, 2 founders plus 1 investor or preferred director. Seed investors asking for a full board seat go beyond norms, since SAFEs rarely carry board rights ([CRV board seat](https://www.crv.com/content/vc-board-seat); [Octopus](https://octopusventures.com/guides/what-to-consider-when-choosing-your-board-members/)) [unverified: practitioner sources].
- Series A: 2-2-1 (2 founders, 2 investors, 1 independent) is the most common configuration ([CRV](https://www.crv.com/content/vc-board-seat)). The NVCA Model Voting Agreement defaults to 5 seats, and the October 2025 update kept this ([Foley on NVCA 2025](https://www.foley.com/insights/publications/2025/10/breaking-down-the-nvca-what-founders-and-vcs-need-to-know/)) [unverified: secondary].
- Osler (Canada 2025): 58.9% of financings gave the CEO a board seat; average board size 4.9 ([Osler](https://www.osler.com/en/insights/reports/2025-deal-points-report-venture-capital-financings/financing-terms-intelligence-preferred-share-financings/)).

**Pro rata, information rights, protective provisions**
- Pro rata: 94.7% of Canadian 2025 financings gave pro rata rights to some preferred holders. 5.3% gave them to all ([Osler](https://www.osler.com/en/insights/reports/2025-deal-points-report-venture-capital-financings/financing-terms-intelligence-preferred-share-financings/)).
- Information rights and protective provisions: no sourced prevalence found [unverified]. Protective provisions are standard in the NVCA model: consent for new senior securities, sale of company, and charter changes [design].
- Drag-along thresholds: 77.1% single preferred threshold, 22.9% multiple (Osler, Canada 2025).

**Founder vesting**
- Double-trigger acceleration is the norm, with 50-100% of unvested shares accelerating ([Orrick, via search summary](https://scaleup.mofo.com/guidance/equity-fundamentals-single--vs-double-trigger-acceleration-explained)) [unverified: secondary]. Single-trigger is uncommon; partial single-trigger of 25-50% is sometimes negotiated [unverified].
- Founder re-vesting: no 2025 prevalence found. Gunderson's April 2025 founder equity report exists but was not readable ([Gunderson](https://www.gunder.com/a/web/tcrpquDMkoQwUmZob1TeFr/gunderson-founder-equity-split-report-apr2025-final.pdf)).

**No-shop and closing:** no-shop 30-60 days, with 45-60 common [unverified]. Term sheet to close: 4-8 weeks, sometimes faster for standardized seed docs [unverified].

**SAFE mechanics**
- YC replaced pre-money SAFEs with post-money SAFEs in 2018. The investor's ownership percentage is fixed against post-money capitalization ([YC SAFE](https://www.ycombinator.com/documents)) [unverified: secondary summaries].
- YC forms include cap-only, discount-only, uncapped MFN, and a separate pro rata side letter ([summary](https://waveup.com/blog/what-is-safe-note/)) [unverified].

## 2. What is negotiable, and what moves

- **Negotiable:** valuation or cap within market band (investor pushback above the Carta band), option pool size and sizing basis (the sizing basis is a real lever), board seats at A, pro rata scope, vesting and acceleration (single-trigger partial), no-shop length, investor counsel fee caps [design], SAFE MFN, side letter extras.
- **Rarely moved:** 1x non-participating preference, broad-based weighted average anti-dilution, standard protective provisions, pay-to-play when the lead insists.
- **Competitive tension:** no founder-side dataset found that measures valuation lift from multiple term sheets. The 10-20% figure circulating online is unsourced [unverified]. Use a [design] lift of 5-15% with a second credible term sheet.
- **Exploding term sheets:** practitioners treat 24-72 hour deadlines as a tactic. Common responses are asking for a 5-day extension and getting a competing offer. Some sources say they are now less common [unverified: VC Beast].
- **Investor counsel fees:** no 2025 data found [unverified]. NVCA term sheets include a company expenses clause. Model a [design] cap of $15-30K for seed-stage counsel.

## 3. Bad-term consequences (worked examples, our math)

**Participating preferred vs non-participating.** Series A: $10M for 20% at $40M pre ($50M post). Exit at $100M:
- 1x non-participating: investor converts (20% = $20M) or takes its $10M preference, so it gets $20M. Common gets $80M.
- 1x participating: $10M preference, then 20% of the remaining $90M = $18M, total $28M. Common gets $72M. Investor gains $8M (+40%).
- 2x participating: $20M preference, then 20% of $80M = $16M, total $36M. Common gets $64M, a 20% cut versus non-participating.

**Pool shuffle.** Above: a $12M headline pre-money becomes $10.5M effective, a 12.5% cut on the founder's stake.

**Full ratchet.** A down round at half the prior price with full ratchet resets the earlier investor's conversion price to the new price. Under broad-based weighted average the reset is much smaller. Full ratchet is rare [unverified] and should be simulated as a low-probability disaster [design].

**Investor board control.** A 2-1 or 3-2 investor-majority board at Series A can replace the CEO. Mitigation is an independent seat chosen jointly [design].

**Founder re-vesting.** A full 4-year re-vest with a 1-year cliff at a new round resets founder equity and creates exit-time retention pressure. Double-trigger acceleration limits the downside [design].

## 4. Negotiation behaviour

- Walk-away rates from overly aggressive asks: no source found [unverified]. Simulate with [design] rates.
- Reputational effects: founders who shop term sheets widely and blacklist firms are reported to get more respect in competitive rounds, and firms that use exploding term sheets have been blacklisted [unverified: VC Beast].
- Timing: term sheet to close about 4-8 weeks; no-shop 30-60 days [unverified].
- Retrades in diligence: common in practitioner sources, but no prevalence found [unverified]. Model as a [design] probability of 10-15% for a material diligence finding.

## Gaps and next steps
- Carta's primary report was blocked (403). A 2025-2026 Carta valuation table needs a direct pull.
- The Fenwick survey is dated (2005) in the sources found. The NVCA PDFs were not readable.
- Pro rata, information rights, protective provisions, and counsel fee caps have no sourced prevalence.
