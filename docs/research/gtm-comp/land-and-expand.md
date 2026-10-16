# Land and expand: strategies, motions, benchmarks, and failure modes

Research for the simulator's account-growth systems. Dates are 2025-2026 unless noted. Tags: **[sourced]** = read in a primary or filed source; **[secondary]** = vendor or third-party summary of a source; **[unverified]** = could not confirm the figure; **[design]** = simulator assumption, not a statistic.

## 1. Land strategies

| Land type | What the buyer commits | Typical land vs. eventual account | Time to first expansion |
|---|---|---|---|
| Free or freemium team plan | Nothing; upgrade on seats or limits | Very small; converts a fraction of teams | Event-driven (hitting a limit) [design] |
| Single-team / departmental | One team's seats, often under a manager's budget | Often 10-30% of eventual account [unverified] | Months, once a second team hears about it [design] |
| Paid pilot (scoped, 30-90 days) | Fee for a defined success test | Small, but gated on a production outcome | Ends in a convert-or-stop decision, not organic growth |
| Usage-based starter commit | Low commit, billed on consumption above it | Starts small; growth is automatic with usage | Continuous; no separate expansion event |
| Enterprise-wide top-down deal | Multi-year, large commit, often ramped | Large up front; under-adoption risk | Expansion is mostly renewal and add-on |

**Pilot conversion.** A SaaStr operator reports paid-pilot-to-annual conversion from about 60% to over 90%, highest when customers reached production during the pilot and lowest for products needing heavy process change [secondary, anecdotal]: https://www.saastr.com/what-is-the-typical-conversion-from-paid-pilot-to-annual-contract-in-b2b-saas

**Adjacent trial data.** Median B2B trial-to-paid is about 18.5%, top performers 35-45% [secondary, Flint compilation]. ICONIQ's 2025 survey reports 56% trial-to-paid for AI-native companies versus 32% for traditional SaaS [secondary]: https://www.saastr.com/the-age-of-ai-the-top-10-gtm-learnings-from-iconiqs-2025-b2b-saas-report

**Land size vs. eventual size.** I did not find a sourced ratio of land to mature account size. Use [design] values in the simulator and label them as such.

## 2. Expansion motions

| Motion | Driver | Best fit |
|---|---|---|
| Seat growth | More users in the same team | SMB and mid-market; per-seat pricing |
| Usage / consumption | Volume of API calls, hosts, data, or AI credits | Mid-market and enterprise; infra and data products |
| New department / use case (cross-sell) | Another buyer with a budget | Mid-market and enterprise; needs account mapping |
| Tier upgrade | Limits, admin features, SSO, compliance | SMB and mid-market; self-serve |
| Add-on module | Separate product or SKU | Mid-market and enterprise |
| Price increase at renewal | List-price changes or uplift clauses | All; only works with value |
| Multi-year | Discount for term commitment | Enterprise; protects against contraction |

Datadog's 10-K describes land-and-expand around per-host and per-product growth [sourced, via search summary] and Snowflake's growth is consumption-driven [sourced]. These are the clearest public examples of usage-based expansion.

## 3. Benchmarks

**Net and gross retention**

- SaaS Capital 2025 (1,000+ private B2B SaaS companies): NRR rises with ACV. One band, $25K-50K, is reported at median 102%, top quartile 111%, bottom quartile 97% [secondary, from the search extract of the PDF; the PDF itself did not render]: https://www.saas-capital.com/wp-content/uploads/2025/09/RB32WS1-2025-B2B-SaaS-Retention-Benchmarks.pdf
- Gross retention above $250K ACV is about 95% median versus about 91% below [secondary].
- KeyBanc/Sapphire 2025: gross retention near 90%, net retention above 100% [sourced, official summary]: https://info.sapphireventures.com/2025-keybanc-capital-markets-sapphire-ventures-saas-survey
- Blended private B2B median NRR is about 101% in 2025, down from around 109-117% in 2021 depending on the source [secondary; SuccessCOACHING reports 109% to 101%]: https://cfo.successcoaching.co/
- Snowflake FY2025 10-K: NRR 126% at Jan 31, 2025, down from 131% and 158% in prior years. 580 customers above $1M trailing product revenue [sourced]: https://www.sec.gov/Archives/edgar/data/1640147/000164014725000052/snow-20250131.htm
- Datadog FY2025 10-K: about 4,310 customers at $100K+ ARR, 90% of ARR. Dollar-based net retention about 120% at Dec 31, 2025 [sourced via search extract; verify the exact wording in the filing]: https://www.sec.gov/Archives/edgar/data/1561550/000162828026008819/ddog-20251231.htm

**Segment bands (working ranges)**

| Segment | NRR range | Source status |
|---|---|---|
| SMB | ~90-100% | [unverified]; no direct 2025 SMB figure found |
| Mid-market | ~100-110% | [secondary]; loosely consistent with the $25-50K band above |
| Enterprise | ~110-120%+ | [unverified] for the enterprise band |
| Top usage-based public companies | 120-150%+ | [sourced] for Snowflake (126%) and Datadog (~120%) |

Bessemer-style bands (100% good, 110% better, 120%+ best) are widely quoted but I could not confirm them in the primary report [unverified].

**Share of new ARR from expansion**

- Benchmarkit 2025: expansion reached about 40% of new ARR in 2024 and passes 50% above $50M ARR [secondary, citing Benchmarkit]: https://blog.abmatic.ai/expansion-revenue-vs-new-logos-2026
- Third-party analysis of the KeyBanc/Sapphire data: pooled expansion share about 52% in 2024, with the median company below half [secondary; not verified against KeyBanc]: https://cfo.successcoaching.co/
- ICONIQ 2022 deck (older): expansion share about 30-35% for smaller companies, rising to 46-49% at $100M+ [secondary, dated].
- ICONIQ's top-quartile venture B2B benchmark at about $25M ARR: 100% growth and 110% NRR [secondary]: https://www.saastr.com/iconiq-top-quartile-b2b-companies-are-growing-100-at-25m-arr-but-are-planning-to-grow-35-faster-in-2025

**Cost of expansion vs. new logo**

- Benchmarkit New CAC Ratio rose from $1.76 (2023) to $2.00 (2024). The blended ratio of $1.40 hides that rise because it includes expansion ARR [secondary].
- Alexander Group estimates expansion costs $0.20-0.69 per $1 of new ARR versus $1.50-3.00 for new logos [secondary consultancy, directional]: https://www.alexandergroup.com/insights/technology-stop-overpaying-for-growth-the-expansion-first-playbook/
- Payback: expansion pays back faster than new logos because the account is already known. I did not find a sourced payback figure for expansion alone [unverified].

## 4. What enables expansion

- **Account mapping and whitespace.** Map every department and product use case; track unpenetrated whitespace per account [design].
- **Executive sponsor.** A named sponsor above the champion is the usual unlock for cross-sell [design, practitioner consensus].
- **QBRs / EBRs.** Business reviews with outcome data are the main venue for expansion conversations [design].
- **Health and usage signals.** Seat utilization, feature breadth, and login trends predict both expansion and churn [design].
- **Ownership.** CSM handles adoption and retention; AM handles expansion. Shared owners without a quota often stall [design].
- **Champion departure.** A departing champion is a common cause of stalled expansion and a churn risk [design].
- **Signing authority.** Buyers approve a commit within a signing threshold. A land that stays under the threshold needs a second approval to grow [design].
- **Vendor consolidation.** Buyers consolidate vendors at renewal. Expansion can be cannibalized by a rationalization review [design].

## 5. Failure modes and consequences

| Failure | Consequence |
|---|---|
| Landing too small to matter | Never expands; churns at first renewal; little revenue to show for the cost |
| Landing in the wrong department | Budget owner is not the one who buys more; expansion stalls |
| Over-discounting the land | Anchors future price; renewal uplift is refused; discount is hard to remove |
| Pushing upsell before value | Early upsell triggers churn; trust is lost |
| No owner for the account | No expansion motion; renewal surprises |
| Champion leaves | Expansion stalls; account may churn at renewal |
| Overly large land, under-adopted | Shelfware; contraction at renewal; the buyer resents the commit |

**Shelfware.** A widely cited figure puts wasted SaaS spend at 20-25% of total spend [unverified; vendor marketing]. Treat it as an illustration only.

## 6. Founder-stage advice

- **Land-and-expand is right** when the product spreads inside an account (seats, usage, or teams), the first buyer can prove value in weeks, and the founder can reach a second buyer. Usage-based and self-serve products fit this best.
- **Sell big upfront** when the product needs a business process change, the buyer will not adopt piecemeal, or the founder needs a large, predictable contract to fund the company. Pilots in this case should be scoped to a production outcome.
- **How many seats or what price to land.** Land at a level the first buyer can approve without a second signature, and at a price the founder can raise later [design]. Avoid deep first-year discounts.
- **Pilot structure.** Define success criteria, a production date, a conversion price set before the pilot starts, and a decision date [design].
- **Ramped deals.** A ramp fixes step-ups at signing, so the buyer commits to the full schedule. Ramps support expansion but make ARR reporting less clear; report contracted and current ARR separately [secondary]: https://dealhub.io/glossary/ramp-pricing
- **True-ups and true-downs.** A true-up bills overage above the committed quantity. A true-down lets the buyer reduce seats at a reconciliation point. Founders should include a true-down or low opening minimum to avoid shelfware-driven churn [secondary]: https://www.cloudnuro.ai/blog/saas-true-up

## Gaps

- No sourced land-size-to-account ratio or time-to-first-expansion figure. The simulator should use [design] values.
- SMB and enterprise NRR bands are not confirmed in primary 2025 data.
- The SaaS Capital PDF did not render; the ACV table should be re-checked against the PDF before any band is used as a hard number.
