## Targets vs measured (policy = average)

| cell | metric | target | measured | in/out |
|---|---|---|---|---|
| indie b2c | pctAnyRevenueBy12mo | 35.0%–60.0% | 96.0% | HIGH |
| indie b2c | pctReach1kMrrBy12mo | 10.0%–15.0% | 20.0% | HIGH |
| indie b2c | pctReach1kMrrBy24mo | 17.0%–19.0% | 26.0% | HIGH |
| indie b2c | pctReach10kMrrBy12mo | 2.0%–3.5% | 0.0% | LOW |
| indie b2c | pctReach10kMrrBy24mo | 4.6%–5.3% | 6.0% | HIGH |
| indie b2c | pctReach100kMrrBy36mo | 0.3%–0.8% | 0.0% | LOW |
| indie b2c | medianMrrAt12mo | 50–100 | 60 | in |
| indie b2c | bottomQuartileMrrAt12mo | 0–19 | 20 | HIGH |
| indie b2c | p95MrrAt24mo | 6,000–12,000 | 8,761 | in |
| indie b2c | medianDaysTo1kIfReached | 45–90 | 92 | HIGH |
| indie b2c | annualPlanYear1CancelRate | 1–1 | not measurable | – |
| indie b2c | pctStillActiveAt36mo | 25.0%–45.0% | 18.0% | LOW |
| indie smb | pctAnyRevenueBy12mo | 40.0%–60.0% | 52.0% | in |
| indie smb | pctFirstCustomerWithin30dOfLaunch | 15.0%–25.0% | 22.0% | in |
| indie smb | pctReach1kMrrBy12mo | 10.0%–18.0% | 2.0% | LOW |
| indie smb | pctReach10kMrrBy24mo | 3.0%–6.0% | 0.0% | LOW |
| indie smb | pctReach100kMrrBy36mo | 0.2%–0.5% | 0.0% | LOW |
| indie smb | medianMrrAt12moAllStarters | 0–50 | 0 | in |
| indie smb | medianMrrAt24moRevenueEarners | 100–300 | 98 | LOW |
| indie smb | pctFlatOrShrinkingAmongEstablished | 25.0%–35.0% | not measurable | – |
| indie smb | pctStillActiveAt36mo | 30.0%–50.0% | 4.0% | LOW |

## Policy expectations

| cell | metric | target | measured | in/out |
|---|---|---|---|---|
| indie-b2c | eliteMedianMrrAt24moMultiple | 3–10 | 5.20× (elite 156 / avg 30) | in |
| indie-b2c | eliteP90MrrAt24moMultiple | 3–5 | 0.99× (elite 6,040 / avg 6,094) | LOW |
| indie-b2c | elitePctStillBelow10kMrrAt24moIndie | 30.0%–50.0% | 96.0%  | HIGH |
| indie-b2c | elitePctReach100kMrrBy36moIndie | 1.0%–3.0% | 0.0%  | LOW |
| indie-smb | eliteMedianMrrAt24moMultiple | 3–10 | ∞ (avg = 0) (elite 600 / avg 0) | n/a |
| indie-smb | eliteP90MrrAt24moMultiple | 3–5 | 41.92× (elite 6,162 / avg 147) | HIGH |
| indie-smb | elitePctStillBelow10kMrrAt24moIndie | 30.0%–50.0% | 96.0%  | HIGH |
| indie-smb | elitePctReach100kMrrBy36moIndie | 1.0%–3.0% | 0.0%  | LOW |

## Distributions per cell

| cell | n | any rev 12 | $1k@12 | $1k@24 | $10k@24 | $100k@36 | MRR12 p25/p50 | MRR24 p50/p90/p95 | MRR36 p50/p95 | dead 24/36 | quit 24/36 | active 36 | raised>0 / ≥250k | forced job | burnout | ms/run |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| indie-b2c-average | 50 | 96.0% | 20.0% | 26.0% | 6.0% | 0.0% | 20/60 | 30/6,094/8,761 | 0/7,343 | 2.0%/24.0% | 62.0%/62.0% | 18.0% | 0.0%/0.0% | 14.0% | 32.0% | 27264 |
| indie-b2c-elite | 50 | 100.0% | 22.0% | 26.0% | 4.0% | 0.0% | 39/182 | 156/6,040/8,807 | 39/8,820 | 2.0%/10.0% | 52.0%/60.0% | 32.0% | 0.0%/0.0% | 18.0% | 64.0% | 36878 |
| indie-smb-average | 50 | 52.0% | 2.0% | 4.0% | 0.0% | 0.0% | 0/0 | 0/147/245 | 0/294 | 2.0%/2.0% | 92.0%/94.0% | 4.0% | 0.0%/0.0% | 4.0% | 14.0% | 7036 |
| indie-smb-elite | 50 | 100.0% | 26.0% | 34.0% | 6.0% | 0.0% | 237/474 | 600/6,162/9,870 | 553/12,400 | 0.0%/2.0% | 20.0%/24.0% | 74.0% | 0.0%/0.0% | 0.0% | 84.0% | 22712 |

## Luck events: mean per run (share of runs with ≥1)

| cell | acquisition_interest | capability_tailwind | category_heat | clone_after_viral | creator_mention | hn_front_page | investor_inbound | press_feature | product_hunt_top3 | viral_post | whale_churn | whale_inbound |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| indie-b2c-average | 0.02 (2%) | 0.44 (38%) | 0.28 (24%) | 0 | 0.42 (36%) | 0.02 (2%) | 0.2 (14%) | 0.12 (12%) | 0.04 (4%) | 0.48 (34%) | 0 | 0 |
| indie-b2c-elite | 0.02 (2%) | 0.62 (48%) | 0.34 (30%) | 0.04 (4%) | 0.56 (40%) | 0.2 (18%) | 0.2 (16%) | 0.16 (16%) | 0.26 (26%) | 1.48 (64%) | 0 | 0 |
| indie-smb-average | 0 | 0.42 (38%) | 0.34 (26%) | 0 | 0.16 (14%) | 0.04 (4%) | 0 | 0.16 (16%) | 0.08 (8%) | 0.22 (12%) | 0 | 0.06 (4%) |
| indie-smb-elite | 0.06 (4%) | 0.68 (56%) | 0.38 (28%) | 0.04 (4%) | 0.32 (22%) | 0.58 (46%) | 0.3 (22%) | 0.24 (22%) | 0.12 (12%) | 1.02 (60%) | 0.08 (8%) | 0.12 (10%) |

## Scorecard habits met at month 6 (share of runs alive then; activity columns are medians)

| cell | customer_contact | ship_fast | many_shots | build_in_public | charge_early | unscalable_concierge | pmf_measurement | default_alive | conv/wk | ships/mo | posts/wk | launches/yr |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| indie-b2c-average | 0% | 42% | 0% | 0% | 22% | 0% | 0% | 100% | 1.5 | 1 | 0.28 | 1 |
| indie-b2c-elite | 80% | 82% | 100% | 0% | 78% | 0% | 0% | 94% | 5.25 | 1.33 | 2.1 | 6.25 |
| indie-smb-average | 0% | 56% | 0% | 0% | 0% | 0% | 0% | 100% | 1.75 | 1 | 0.31 | 1 |
| indie-smb-elite | 64% | 90% | 100% | 0% | 44% | 86% | 0% | 100% | 5.25 | 1.33 | 1.97 | 5.75 |

## Acquisition (mean subs started / paid ≥1 month per run) and hours per year

- **indie-b2c-average**: organic:appstore 1499/772, organic:wom 274/179, ads:meta 143/67, competitor-switch 22/7, creator 22/11, network 14/0, press 10/2, organic:social 5/2, product-hunt 2/0, hacker-news 1/0; ad spend $14,670; interviews 117; shipped 19. Hours/yr: Product: build 468; Research: recruiting 21; Ads: monitoring 13; Ads: creative 13; Organic: build in public 11; Research: interview notes 10; Product: spec 5; Ads: account setup 2
- **indie-b2c-elite**: organic:appstore 1569/636, product-hunt 648/11, organic:wom 338/167, organic:seo 55/20, creator 40/12, competitor-switch 39/10, ads:meta 35/14, organic:social 23/9, organic:llm 17/6, network 15/1, press 15/3, organic:community 8/3, hacker-news 6/1, organic:hn 2/1; ad spend $5,884; interviews 372; shipped 24. Hours/yr: Product: build 812; Research: recruiting 69; Organic: build in public 48; Research: interview notes 32; Organic: SEO article 30; Organic: community 23; Organic: Product Hunt 19; Ads: monitoring 14
- **indie-smb-average**: network 15/0, press 7/1, creator 2/1, organic:wom 1/1, product-hunt 1/0, hacker-news 1/0, organic:social 1/1, outbound 0/0, competitor-switch 0/0; ad spend $0; interviews 83; shipped 13. Hours/yr: Product: build 294; Sales: prospecting & research 125; Research: recruiting 14; Sales: enrollment 9; Organic: build in public 7; Research: interview notes 7; Product: spec 5; Sales: email replies 3
- **indie-smb-elite**: product-hunt 504/14, hacker-news 36/4, organic:seo 31/13, organic:wom 25/12, network 14/0, organic:llm 10/4, press 9/2, organic:social 5/2, organic:community 5/2, competitor-switch 2/2, organic:hn 1/0, outbound 1/1, creator 1/0; ad spend $0; interviews 469; shipped 27. Hours/yr: Product: build 995; Research: recruiting 86; Organic: build in public 62; Research: interview notes 39; Organic: SEO article 38; Product: spec 33; Organic: community 28; Organic: Product Hunt 25

## Mistakes ledger per run (mean): count / going-in-circles / hours / $ / customers / reputation / days lost; top mistakes

| cell | count | circles | hours | $ | customers | reputation | days | top mistakes (mean per run) |
|---|---|---|---|---|---|---|---|---|
| indie-b2c-average | 194 | 0 | 95 | 13205 | 109.84 | 0.4 | 40 | one_email 53.5, missing_receipts_at_close 31, silent_outage 19.7, kept_missed_feature 15.6, tool_stacking 7.4, ignored_backlog 2.1 |
| indie-b2c-elite | 46 | 5 | 90 | 4303 | 2.28 | 0.26 | 37 | silent_outage 15.3, missing_receipts_at_close 12.1, going_in_circles 4.8, tool_stacking 4.6, ignored_backlog 4.4, unvalidated_feature 2 |
| indie-smb-average | 82 | 0 | 315 | 16566 | 2.83 | 0.96 | 7 | missing_receipts_at_close 34.6, tool_stacking 14.7, kept_missed_feature 12.7, silent_outage 8.6, unvalidated_feature 7.4, missed_signal 1.5 |
| indie-smb-elite | 58 | 6 | 98 | 22805 | 9.72 | 0.92 | 26 | silent_outage 12.2, missed_signal 7.5, ignored_backlog 5.8, wrong_save_tactic 5.5, going_in_circles 5.4, tool_stacking 5.3 |

## Personal runway (forced job search / job by month, quit-or-forced-or-dead by 24)

| cell | job search by 12 | by 24 | in forced job by 24 | median search month | quit/forced/dead by 24 | median hidden demand | median stars |
|---|---|---|---|---|---|---|---|
| indie-b2c-average | 2.0% | 88.0% | 88.0% | 14 | 88.0% | 0.508 | 4.23 |
| indie-b2c-elite | 8.0% | 86.0% | 84.0% | 14 | 84.0% | 0.897 | 4.55 |
| indie-smb-average | 10.0% | 100.0% | 98.0% | 14 | 100.0% | 0.345 | — |
| indie-smb-elite | 4.0% | 98.0% | 92.0% | 14 | 92.0% | 0.397 | — |
