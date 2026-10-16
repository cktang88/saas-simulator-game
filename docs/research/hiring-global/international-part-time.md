# International and part-time hiring: sourced facts for the simulator

Scope: 2023-2026 sources where found. Labels: **[sourced]** = read in a source; **[secondary]** = vendor blog or aggregator, directional only; **[unverified]** = seen only in a search snippet or conflicting; **[design]** = our assumption, not a statistic. Gaps are listed at the end.

## 1. Regions: pay, English, and pool

Engineering pay is the best-sourced role. Other roles mostly lack per-country data, so the % of US figures below for them are [design].

| Region | Engineer salary (2026 median) | vs US | Contract rate (monthly) | EF EPI 2025 | Notes |
|---|---|---|---|---|---|
| US | not stated on Terminal page; LeadDev/Terminal 2025 snippet gives $182,500 [unverified] | 100% | n/a | n/a | Reference |
| Canada | $121,124 [sourced: Terminal 2026] | ~63% (37% lower) | $11,631 | not stated | Near-US English and time zone |
| Latin America | $103,075-$106,918 [sourced: Terminal 2026] | ~54-56% (44-46% lower) | $9,789-$10,642 | not stated per country | Costa Rica highest in region per Terminal |
| Western Europe / UK | $77,646-$93,521 for Europe overall [sourced] | ~40-49% (51-60% lower) | $7,048-$10,540 | Netherlands #1, Germany #4 [sourced] | Europe-wide figure; UK and Western EU are higher |
| Eastern Europe | Poland median $89,183 [sourced: Terminal 2026, in Europe range] | ~48% | in Europe range | Romania listed in top 15 [secondary] | Hungary highest in Europe per Terminal |
| India | Levels.fyi median total comp $33,768 (2025) [secondary; includes equity/bonus] | ~20-30% base [design] | Index.dev senior full-stack $34-52/hr [secondary] | 74th [sourced] | Huge pool; quality variance high |
| Pakistan | Plane median remote SWE $43,163 base [secondary]; Ruby on Remote avg $116,197 (n=114) [unverified] | wide, ~25-45% [design] | Parhlai mid-level remote $2,000-8,000/mo [secondary] | not stated [unverified] | P@SHA 2024-25 salary survey exists; read the primary report |
| Philippines | Engineers not sourced; BPO agent PHP 20,000-27,000/mo [secondary] | support/BPO roles only | n/a | 28th [sourced] | Oyster: top hiring destination by share (9% of 2024 hires) [sourced] |
| SE Asia (e.g., Malaysia) | not sourced | n/a | n/a | Malaysia 24th, highest Asian [sourced] | Not researched further |
| Nigeria | Startup Genome 2025 Lagos avg dev $7,500/yr local [secondary] | local pay very low; remote mid-senior $36k-96k/yr [secondary] | n/a | not stated | Power and infrastructure risk not sourced |
| Kenya | Nairobi $14,700/yr local [secondary] | similar | n/a | not stated | Strong remote-talent community [secondary] |
| Egypt | no USD figure found | n/a | n/a | not stated | Gap |

Sources: Terminal 2026 report (https://www.terminal.io/guide/remote-software-engineer-salary-insights-report); EF EPI 2025 press release (https://www.ef.com/ca/about-us/press/articles/2025/ef-english-proficiency-index-2025-launched/) and Nippon.com table (https://www.nippon.com/en/japan-data/h02620/); Index.dev rates (https://www.index.dev/blog/remote-developer-rates); Levels.fyi Deel/India (https://www.levels.fyi); Plane (https://plane.com/salaries/software-engineer/pakistan); Startup Genome 2025 via search summary; Oyster 2025 report (https://www.oysterhr.com/library/2025-global-hiring-trends-and-impact-report).

**Other roles, by region [design].** Use these as starting multipliers, not facts: designer 45-70% of US in Canada/Europe, 35-55% in LatAm/Eastern Europe, 20-40% in India/Pakistan/Africa. SDR and AE pay offshore is mostly quoted as a base at 25-50% of US with commission structures that rarely transfer. Customer support in the Philippines: about 25-35% of US fully loaded cost. CSM and marketer: use the engineer ratios minus 5-10 points. Calibrate once a real role source is found.

**US baseline [secondary/sourced].** Bridge Group 2025 (351 B2B companies): SDR median OTE $80K, base $55K / variable $25K; SDR manager OTE $146K [sourced: https://www.bridgegroupinc.com/research/sdr-tenure-and-ramp-time]. AE OTE: $105-130K SMB, $210-247K enterprise, base/variable split 44:56 [secondary, unverified]. Sources for AE: none primary.

**Vetting difficulty.** No public study found comparing senior vs junior fill times by region. Platform marketplaces (Toptal, Arc.dev, Turing, Lemon.io, Index.dev) publish no official regional rate cards; their numbers are vendor estimates [secondary]. Arc.dev 2024 average freelance rate: US and Australia/NZ tie at $70/hr [secondary]. Lemon.io median global contract rate $44.9/hr across 71+ countries [unverified snippet].

## 2. Which roles offshore well

- **Engineering:** async-friendly, widest global pool, and the best-sourced pay data. Quality variance is the main problem, so vetting time is the real cost [design].
- **Customer support / BPO:** the Philippines norm. Oyster finds admin and support roles "have long been outsourced to extend coverage across time zones" [sourced]. IBPAP headcount about 1.7M FTE in 2024 [secondary, vendor-cited].
- **SDR and AE (US buyers):** **no outcome study found** linking accent, location or time zone to conversion. Vendor claims (e.g., offshore SDRs up to 73% cheaper) are not independent [secondary]. Practitioner views conflict: some say business acumen matters more than accent; others cite time-zone and cultural friction [secondary, opinion]. Treat as an open question and keep the simulator's effect a [design] assumption with a visible cost to bad fits.
- **CSM:** requires US-hours overlap for renewals and escalations. Not sourced. [design]
- **Marketers and designers:** async-compatible, but brand-voice and cultural-fit quality varies. Not sourced.

## 3. Time-zone effects

No sourced study was found on time-zone overlap and team productivity. The Bloom/Trip.com Nature study (2024; 1,600+ employees, hybrid vs in-office) found no productivity penalty from hybrid work and a 33% drop in resignations for hybrid staff [sourced: https://news.stanford.edu/stories/2024/06/hybrid-work-is-a-win-win-win-for-companies-workers]. It does not test overlap hours. Working-hours tradeoffs (night shifts add about 10% to BPO base pay in Manila [secondary]) are the only sourced cost. Use [design]: 4+ overlap hours needed for same-day handoffs; each lost overlap hour adds a day to a feedback loop.

## 4. Part-time

- **ACA:** full-time = 30+ hrs/week or 130+ hrs/month; applicable large employers have 50+ FTE and must offer coverage to 95% of full-time staff [secondary; verify on IRS.gov, Section 4980H].
- **Fractional executives:** Fractional CFO $4,000-8,000/mo for part-time support [vendor survey, EagleRock 2025]; $150-450/hr range [secondary]. Fractional CMO $200-350/hr, $5-10k/mo retainers [secondary]. Fractional COO $150-300/hr [secondary]. Early-stage strategic finance $3-5k/mo [secondary]. **Fractional VP Sales: no data found.**
- **Productivity per hour of part-timers vs full-time:** not sourced. [design]: ramp time and context-switch overhead make a 20-hour person roughly 60-75% as productive per paid hour as a full-timer in the same role.
- **Upwork/Contra part-time share and premium:** not found. Upwork reports a 40%+ hourly premium for AI-related freelance work (Q1 2025 results, https://finviz.com/news/47088/upwork-reports-first-quarter-2025-financial-results) [sourced], which is not a part-time premium.

## 5. Risks and consequences

**Contractor vs employee and permanent establishment.** Regulators look at control, tools and integration, not the contract label [secondary, EOR-vendor sources]. Permanent-establishment risk arises when a remote person signs contracts, is under direct control, or exclusively represents the company abroad [secondary]. Liabilities in parts of the EU and Latin America can reach back across the whole relationship [secondary]. An EOR removes the most common triggers but not every one [secondary]. Get local advice.

**EOR and contractor costs.** Deel EOR list $599/mo ($499 annual) [secondary: costbench]; Remote EOR $599-699 [conflicting]. Deel contractor management $49/mo; Remote $29/mo [secondary]. Deel Contractor of Record (misclassification cover) $325/contractor/mo [secondary]. Employer taxes and statutory costs add 13-40% on top of gross pay by country [secondary]. Visa sponsorship about $300-500/mo [secondary, unverified].

**IP assignment.** Not researched. Standard practice: local assignment clause in contracts. [design]

**FX and payment fees.** Skydo (a competitor) says Deel's FX markup is roughly 0.5-2% and withdrawals are free [unverified, competitor]. Banks and cards typically mark up 1.5-4% [secondary]. Model as 1-3% per payout [design].

**Fake candidates and North Korean IT workers.**
- DOJ action, 30 June 2025: one arrest, two indictments, laptop-farm searches. Reported counts conflict: 29 laptop farms in 16 states [GlobalSecurity summary of DOJ] vs 21 locations in 14 states [other coverage] [sourced, conflicting].
- Reported scale: compromised identities of 80+ US citizens used at 100+ US companies, $3M+ in costs [secondary summary of DOJ].
- Okta: 130+ identities linked to 6,500+ interviews across 5,000+ companies up to mid-2025 [secondary summary; primary not read].
- Amazon reported blocking 1,800+ suspected operatives (December 2025) [secondary, unverified].
- Mitigation patterns cited: camera on with lighting, IP-to-phone location match [secondary].

**Moonlighting / overemployment.** BLS: about 5.3% of US workers hold multiple jobs (about 8.5M in May 2025) [secondary, BLS via blog]. A ResumeBuilder survey of 1,272 remote workers found nearly 8 in 10 had worked two jobs at once in the past year, 36% two full-time [self-selected, unverified in method]. Official figures likely undercount rotating or project work (IZA review). Treat self-reported surveys as high upper bounds.

**Attrition.** Bridge Group 2025: median SDR annual attrition 40% (IQR 21-57%) in US B2B [sourced]. Regional attrition: not found. Oyster 2025 documents a 46% rise in contractor engagements (2023-24) and a median new-hire salary of $74,700 [sourced].

**Currency.** Salaries are quoted in USD in most sources; local currency pay drives retention in Pakistan, Nigeria and Egypt [design].

## Gaps (not found; do not fill without a source)

- Remote.com and Deel country salary tables (the cited search returned third-party pages only).
- Upwork/Contra part-time premiums and share of part-time roles.
- Time-to-fill and candidate pool depth by region and seniority.
- Notice periods, public holidays, power/internet risk by country.
- Regional attrition for remote hires.
- Fractional VP Sales rates.
- Any time-zone-overlap productivity study.
- Offshore SDR/AE conversion outcomes.
- Egypt pay data; Nigeria/Kenya power and infrastructure risk.
- Okta primary report and DOJ press release (read the originals before using counts).

## Simulator implications

1. Engineering regional multipliers can use Terminal 2026 medians (the most current sourced set).
2. Keep offshore SDR/AE effects as explicit [design] parameters with visible costs when poorly matched.
3. Use the DOJ/Okta figures as flavor and risk, citing them only as reported.
4. Apply EOR and contractor fee values as ranges, not single numbers.
