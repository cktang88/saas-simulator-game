# Sales and CS compensation: sourced benchmarks for the simulator

Status key: **[verified]** = read on the source page during this research. **[secondary]** = taken from a vendor or aggregator that cites a report we could not open. **[unverified]** = a single vendor claim, a job posting, or a number that conflicts across sources. **[design]** = our assumption, not a statistic.

Research date: October 2026. Most primary benchmark reports are paywalled or gated, so treat the numbers below as ranges, not point estimates.

## 1. Headline numbers by role

| Role | OTE (US) | Base:variable | Quota or pay driver | Ramp | Attainment | Source status |
|---|---|---|---|---|---|---|
| SDR/BDR | Median $80K (Bridge 2025); RepVue Dec 2025 median $85K | 68:32 (Bridge: $55K base / $25K variable) | Stage-0 meetings held, Stage-1 conversions, pipeline | 3.0 months avg (Bridge 2025) | 60% of SDRs at quota (Bridge 2025, lowest in study history) | [verified] Bridge; RepVue [secondary] |
| AE, SMB | ~$105K-$130K [unverified] | ~50:50 to 60:40 [secondary] | New ARR/ACV | Not verified | 45-68% of AEs at quota, sources conflict [unverified] | [unverified] |
| AE, mid-market | Not verified | Not verified | New ARR | Not verified | Not verified | [unverified] |
| AE, enterprise | ~$210K-$247K [unverified] | Not verified | New ARR/TCV | Longer, up to ~9 months for draws [unverified] | Not verified | [unverified] |
| Founding AE | $100K-$300K range, mostly $250K-$300K in US postings | Postings cluster at $125K-$150K base [unverified] | Founder-led sales plus own pipeline | Not applicable | Not applicable | [unverified], job postings and one recruiter guide |
| Account manager (AM) | Not verified | Not verified | Expansion ARR, renewals | Not verified | Not verified | No usable source found |
| CSM | Variable share typically 15-25% of total pay [unverified] | 70:30 to 80:20 as design guidance [secondary, CaptivateIQ] | NRR, GRR, renewals, expansion | Not verified | Not verified | [secondary] |
| Sales engineer (SE) | Not verified | Not verified | Team quota share | Not verified | Not verified | No usable source found |
| First sales leader / manager | SDR manager OTE $146K; Director $189K; VP $240K (Bridge 2025) | Not verified | Team quota | Not verified | Not verified | [verified] for SDR-side leadership only |

**AE quota-to-OTE:** One secondary article citing Bridge's 2024 AE data gives a median quota-to-OTE of about 4.2x and a median commission of about 11.5% of bookings at full attainment [unverified]. This is consistent with the 4-6x rule of thumb in the brief, but we have not verified it against the Bridge report.

**AE median OTE, quota, cycle:** An aggregator attributes to Bridge's 31st annual SaaS AE Metrics Report (n=453, fielded Q4 2025) a median AE OTE of $182K, a median quota of $1.05M ARR, and a 91-day sales cycle [unverified]. Treat as a candidate anchor only until the report is checked.

## 2. Ramp, draws and attainment

- **SDR ramp:** 3.0 months average, the lowest since 2010 (Bridge 2025) [verified].
- **AE ramp:** Secondary sources cite Bridge's 2024 AE ramp at 4.7, 5.3 or 5.7 months. The series conflicts [unverified]. For the simulator, use 4-6 months for SMB/mid-market and 6-9 months for enterprise [design].
- **Draws:** Vendor guides say most SaaS AE draws run 3-6 months, with enterprise draws stretching to about 9 months [unverified]. A typical shape is a non-recoverable draw of 75-100% of target variable for months 1-3, stepping down until commission carries the pay by months 4-7 [unverified]. Non-recoverable is described as the common default; the "80%+" figure is unverified.
- **Recoverable vs non-recoverable:** Recoverable draws are repaid from future commission. Non-recoverable draws are kept by the rep, and the company absorbs the shortfall. Hybrids are common (non-recoverable early, recoverable later) [unverified].
- **Attainment:** Bridge 2025 puts 60% of SDRs at quota, and 67% of companies report 50-89% of reps at quota [verified]. For AEs, sources say 45-48% of reps hit quota and that average attainment hovers around 67-68%. These conflict [unverified]. For the simulator, use roughly 50-60% of AEs at quota in a given year [design], and label it as such.
- **SDR productivity (verified, Bridge 2025):** Median 10 Stage-0 meetings held per month against quota (16 introductory, 10.4 semi-qualified, 9 fully qualified by motion). Stage-1 conversions median 6 per month. Raw pipeline per SDR $3.78M per year, driven mostly by higher ASPs ($44K in 2024 vs $27K in 2022), not more meetings.

## 3. What variable pay is based on

- **SDR:** Meetings held, qualified opportunities, sourced pipeline, or closed-won sourced revenue. Bridge 2025 shows meetings held and Stage-1 conversions as the standard quota units [verified]. The simulator should reward Stage-1 conversion over raw meetings to avoid the junk-meeting failure mode.
- **AE:** New ARR or ACV is the common base. Multi-year deals are usually credited on first-year ACV or on TCV, and the split is set by plan. Bookings vs cash collection is a real policy choice; we found no reliable survey share for it [unverified].
- **AM:** Expansion ARR plus renewal retention, often with a renewal-rate gate.
- **CSM:** NRR or GRR, renewals, expansion ARR. Usually a bonus or a small commission on a book of business, not a full commission plan [secondary, CaptivateIQ, RepVue company pages].
- **SE:** Team-based quota share, not individual. We found no reliable source with a percentage. Use team-based bonuses [design].

## 4. Plan mechanics and typical values

- **Commission rate:** About 11.5% of bookings at full attainment (AE median) [unverified].
- **Accelerators:** QuotaPath says 80% of comp plans use accelerators, typically 2-4 tiers, with multipliers around 1.5x-2x [vendor, unverified]. Example template: 5% under 50% attainment, 10% at 50-100%, 12% at 100-150%, 15% above 150% [illustrative, QuotaPath template, not survey data].
- **Caps:** Vendor sources say many SaaS plans cap accelerated earnings around 150% of quota, after which extra deals pay zero [unverified]. Caps are a common design, but we have no reliable prevalence number.
- **Decelerators:** Used below a threshold (often 70-80% of quota); prevalence unverified.
- **Clawbacks:** QuotaPath's playbook puts the most common clawback window at 60-120 days after the sale [vendor, unverified]. Pulse RevOps says 90-180 days [vendor]. A CaptivateIQ 2026 trends claim, relayed secondhand, says 31% of plans include clawbacks for churn under 12 months, up from 12% in 2022 [unverified]. A "53% of SaaS companies" figure circulates without a survey source [unverified].
- **Multi-year and prepayment:** Vendors recommend holding back part of prepaid commission until year two, citing prepayment liquidity risk [unverified]. Do not hard-code this as fact.
- **Payment timing:** Commission on booking is the common default. Commission on cash collection is less common and not quantified in our sources [unverified].
- **Split credit and territory:** Common in enterprise, not quantified [design].
- **SPIFFs:** Short-term one-off bonuses, usually on a specific product or segment. Frequency unverified [design].

## 5. Behavioural effects

- **SDRs paid per meeting:** Junk meetings rise when pay is per meeting held. Bridge 2025 shows activity volume tied to pay-for-performance: median 112 daily activities, 4.1 quality conversations per day [verified]. The link between per-meeting pay and junk-meeting share is practitioner observation, not a measured study [design].
- **End-of-quarter discounting and deal delay:** Practitioner sources describe reps holding deals to the next period once they hit an accelerator cap, and discounting near quarter-end to close [vendor, unverified]. We found no peer-reviewed study of pull-forward or sandbagging in SaaS. Economics work on commission kinks and bunching at thresholds exists, but we did not retrieve a specific paper.
- **Caps and top performers:** Practitioner commentary says top performers leave over caps and ratcheting quotas [anecdotal]. The one academic reference we found: Misra and Nair (2011), an optical products company where removing caps and ratcheting quotas raised sales about 8%, with a reported 9% rise afterwards. This was reported in a blog summary of the work; we have not read the paper. The study did not measure turnover [unverified].
- **Renewals neglected by AEs:** Plans that pay only new ARR tend to leave renewals to CSMs. We found no quantified source [design].
- **CSMs pushing upsell over retention:** If CSM pay includes expansion, retention can suffer. No quantified source found [design].
- **Clawbacks and selling to poor-fit customers:** With no clawback, reps have an incentive to close poor-fit deals. No quantified source found [design].
- **Attrition:** Bridge 2025 gives SDR median annual attrition of 40% for 2024 (25th-75th percentile 21%-57%; involuntary 13%, voluntary 11%, promotions 16%) [verified]. HubSpot's figure of 35% average rep turnover, cited by Maptive, and SPOTIO's 2026 finding that 41% of field teams see 50%+ turnover are both vendor-sourced [unverified]. The brief's 30-35% is consistent with the vendor figures but not with the Bridge SDR figure.
- **Plan complexity:** Vendor sources say complex plans reduce motivation. No quantified source found [design].

## 6. Founder-stage specifics

- **First sales hire:** Founding AE postings cluster at $125K-$150K base and $250K-$300K OTE in US listings, plus equity [unverified, job postings]. Recruiter guides give equity of 0.05%-0.5% for early AEs [unverified]. Use this range for the simulator with a [design] label.
- **Founder-sourced leads:** Pay commission on founder-sourced deals at a reduced rate, or not at all, to avoid rewarding the founder for work they do anyway [design]. We found no survey on this.
- **SDR vs AE vs CSM timing:** No reliable source. Common founder rule of thumb is to hire the first AE before the first SDR, and the first CSM when renewal and churn risk becomes material [design].
- **CSM coverage ratios:**
  - One 2025-dated source gives accounts per CSM of about 110 (SMB), 35 (mid-market), and 10.5 (enterprise), and ARR per CSM of $1.2M, $1.6M, and $2.5M [unverified].
  - Gainsight's older benchmark (URL dated 2016) gives median ARR per CSM of $1M-$2M (SMB), $2M-$5M (enterprise and mid-market) [older, unverified for today].
  - Practitioner ranges: 10-25 accounts per CSM for high-touch, 30-80 for mid-touch, several hundred for low-touch [secondary, MeltingSpot].
  - Use ARR per CSM of roughly $1.5M-$2.5M for mid-market and $2.5M+ for enterprise as the game default [design], and label it.
- **Cost of a bad comp plan:** No reliable quantified source. Model the cost as lost quota, rep attrition (a replacement cost in time and ramp months), and a churned or discounted book [design].

## 7. Design rules for the simulator

1. Use SDR metrics from Bridge 2025: 10 Stage-0 held per month, 6 Stage-1 conversions, 60% at quota, 3-month ramp, 40% attrition [verified where cited].
2. Mark every AE number as [unverified] or [design] in the UI until a primary report is checked.
3. Clawbacks should exist, be optional, and bite on churn within 60-120 days [design, vendor-informed]. Mistakes should carry visible cost: lost commission, a churned book, and rep attrition.
4. Caps and decelerators should create the sandbagging and end-of-quarter pattern, so the player sees the trade-off [design].
5. Do not present vendor percentages as survey statistics.

## Items to check before shipping

- Bridge Group 2024 and 2025 AE Metrics & Compensation reports (gated).
- Pavilion State of Sales Compensation reports.
- RepVue company pages for role-level medians.
- CaptivateIQ 2026 trends report (clawback share).
- Misra and Nair (2011) on caps and quota ratchets.
- Gainsight current CS benchmark (the one we found is from 2016).

Sources consulted (all accessed October 2026): bridgegroupinc.com 2025 SDR models report; repvue.com SDR salary page; founderpath.com SaaS benchmark pages; multiplier.captivateiq.com CSM comp article (redirected, not fully read); quotapath.com templates and clawback playbook landing page; maptive.com (HubSpot turnover citation); activatedscale.com founding AE guide; meltingspot.io and statisfy.com CSM ratio pages; cfo.successcoaching.co coverage page; gainsight.com 2016 benchmark.
