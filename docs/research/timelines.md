# How long things take: timeline distributions (checked 2026-10-16)

Used by `public/core/timing.js` (`TIMELINES`, `timeline`, `schedulingBackAndForth`) and `public/core/mail.js`
(`REPLY_DELAY`, `replyDay`). Every wait in the game is a lognormal draw (median, p90), never a fixed number.
**Where you land in the distribution comes from your company and the counterparty**: in z-units,
`z = 0.6·pull + 0.8·noise`, so context explains about a third of the variance and luck the rest [design]. Each draw
records its percentile and the factors that pulled it, so players can see why something took long.

Tags: [S] sourced study or official figure, [V] vendor or advisor blog (directional only), [design] our estimate.
Published data on reply latency for investors, executives, lawyers and procurement barely exists. Most rows below
are therefore [V] or [design] and must not be shown to players as statistics.

## 1. Investors

| Step | Median / p90 | What moves you in the distribution | Basis |
|---|---|---|---|
| Reply to a warm intro | 1 / 4 business days | company strength for this investor, round heat, season, stale round, investor type (solo GP fast, multistage slow) | [design] |
| Reply to a cold email (if any) | 3.5 / 12 business days | same, plus email quality; 70-90% never reply (odds live in `pMeeting`) | [design] |
| Connector forwards the intro | 3 / 10 business days | | [design] |
| First meeting → partner-meeting decision | 8 / 24 days | archetype decision pace, strong vs flat meeting, competing term sheet (−1.2σ), other funds in diligence (−0.5σ), round has been around (+0.6σ), solo founder ×1.15, round ≥ $3M ×1.15. Partner meetings are weekly. | [V] causo.ai 2026 guide: 1-2 weeks, 3 days-5 weeks |
| Angel decision after one meeting | 7 / 21 days | archetype pace, meeting, heat | [V] Holloway: 1-2 weeks on SAFE rounds |
| Yes after the partner meeting | 2 / 6 business days | | [V] positive decisions within 1-3 days |
| "Slow no": silence before the pass email | 9 / 28 days | the decision (and market talk) happens at once; you hear later | [V] silence beyond ~5 days usually means no |
| Pre-term-sheet diligence | 18 / 40 days | archetype pace, partners disagree (+0.8σ), data-room readiness (`diligenceFactor`) | [V] 1-3 weeks, up to 6 |
| Angel group, after the pitch | 55 / 110 days | monthly screening and vote | [V] application → funding 90-180 days; the pre-pitch wait already happened |
| Investor's next free slot | 4 / 12 business days | interest pulls, warm intro (−0.4σ), cold (+0.3σ), partnership ×1.3, your booking link ×0.6 | [design] |
| Term sheet window | 14 days; 7 when other funds are circling | | [design] |
| SAFE signed → wired | 9 / 20 days | data room ready (−0.6σ) or gaps (+0.8σ), legal clean-up items (+0.5σ each), international wire, committee investors ×1.3 | [V] Amplify: 1-2 weeks |
| SPV fill | 14 / 28 days | | [V]; LANDSCAPE 18-28 |
| Priced seed: signed → wired | 32 / 52 days | same, plus more than 3 investors to paper | [V] 2-6 weeks; Cooley 30-45 days |

Calibration anchors: DocSend (2015, small sample) [S]: whole raise median 12.5 weeks; 15% closed in 0-5 weeks; 17%
took 16+ weeks. About 40 meetings per successful raise (DocSend 2015 and 2019). Carta: median seed → A gap 616 days
(Q2 2025).

## 2. People, inboxes and scheduling

| Event | Median / p90 | Factors | Basis |
|---|---|---|---|
| Email reply, general | ~1 h when a reply comes; ~90% within 1-2 days | age, load, relationship | [S] Kooti et al. 2015 (arXiv:1504.00704), via secondary write-ups |
| Emails to book one meeting | ~8 counting both sides (3-8 round trips); 1-2 with a booking link | each extra party adds a round | [S] Calendar.help (arXiv:1703.08428); [V] Boomerang |
| One scheduling round trip | 0.4 / 1.5 business days | eagerness of the other side | [design] |
| Prospect's first free slot | 3 / 9 business days | exec title (+0.7σ, often via an assistant), director (+0.3σ), owner-operator (−0.3σ), eager (−0.6σ), lukewarm (+0.3σ), enterprise (+0.4σ), booking link ×0.7 | [design] |
| Reschedules | ~17% of meetings | | [V] Doodle |
| Sales meeting no-show | median 13.5%; 6.9% same-day bookings vs 23% when booked 8+ days out | | [V] RevenueHero, Focus Digital |
| Candidate replies (recruiting) | 2.8 days; p75 7.1, p90 14.2 | | [V] Noon 2026 |
| Candidate offer decision | 3 / 8 business days | strong offer (−0.7σ), borderline offer they shop around (+0.8σ) | [design] |
| Partnerships manager reply | 3 / 9 business days | pitch quality, partner much bigger than you (+0.5σ) | [design] |
| Reporter reply | 2 / 7 business days | wants the story (−0.8σ), tier-1 inbox (+0.3σ) | [design] |
| Investor and exec inbox replies (`thread.replyPull`, `thread.seniority`) | `REPLY_DELAY` × pull | interest in your deal; exec +0.7σ | [design] |

## 3. Corporate buyers (already modelled in `apps/sales`; listed for reference)

| Event | Typical | Basis |
|---|---|---|
| B2B SaaS sales cycle by ACV (< $2K / $5-25K / $25-100K / $100-500K) | 14 / ~70 / ~135 / ~220 days | [V] Prospeo |
| By buyer headcount (1-10 / 51-200 / 1k-5k / 10k+) | 38 / 77 / 135 / 185 days | [V] Prospeo; HockeyStack via Boomerang |
| Security questionnaire with no answer library vs with one | 14-28 days vs 1-3 days | [V] GrowthSpree, Wolfia |
| Buyer-side vendor risk review | 31-60 days for 52% of companies; 61-90 for 38% | [V] Wolfia (unverified survey) |
| MSA on standard paper vs custom redlines | 7-21 days vs 28-84 days | [V] GrowthSpree |
| E-signature | 76-85% signed within 24 h | [V] DocuSign |
| US B2B payment | 45-day average terms; ~52% of invoices paid on time | [S, secondary] Atradius 2025 |
| Federal Prompt Payment Act | 30 days from a proper invoice | [S] |

## 4. Platforms, government and payment rails

| Event | Median / p90 | Basis |
|---|---|---|
| Card dispute filed after the charge | 18 / 45 days; fraud spotted sooner (−0.6σ) | [design]; networks allow up to 120 days |
| Dispute decision after evidence | 50 / 80 days | [design]; networks ~45-75 days |
| Merchant evidence window | Visa ~30 days, Mastercard 45, Stripe 7-21 | [V] chargeback.io, Stripe docs |
| EIN by fax (filing services) | 5 / 12 business days | [V] IRS says ~4 business days |
| EIN for foreign applicants (mail or phone) | 25 / 50 days | [V] ~4 weeks, 8+ at times |
| Stripe first payout, new account | 7-14 days | [S] Stripe support |
| Apple App Review | 90% within 24 h | [V] |
| USPTO trademark first action | 4.45 months (H1 FY2026) | [S] USPTO |
| SOC 2 Type II | 6-15 months from start | [V] Drata, Vanta |
| Mercury account approval | 1-2 business days | [V] |
| Gusto verification | 1-2 business days; state registrations 2-4 weeks | [V] |
| Email support first response | ~12 h median; 1 h best-in-class | [V] SuperOffice/Zendesk via aggregator |
| First-contact resolution | ~68% (SaaS) | [V] SQM/HDI |

## Sources

- https://arxiv.org/abs/1504.00704 (Kooti et al. 2015)
- https://arxiv.org/pdf/1703.08428 (Calendar.help)
- https://techcrunch.com/2015/06/08/lessons-from-a-study-of-perfect-pitch-decks-vcs-spend-an-average-of-3-minutes-44-seconds-on-them (DocSend 2015)
- https://techcrunch.com/2020/03/03/docsends-new-pre-seed-data-shows-how-many-founders-you-should-have-and-how-many-investors-you-should-meet/
- https://hub.causo.ai/guides/vc-fundraising-process-2026 , https://hub.causo.ai/guides/closing-seed-round-mechanics
- https://holloway.com/g/angel-investing/sections/the-process-of-an-angel-investment
- https://amplifypartners.com/blog-posts/safe-financing-overview-timelines-process-docs
- https://www.varnumlaw.com/?p=6856
- https://angelinvestorsnetwork.com/capital-raising/angel-investor-groups-near-me-2025-state-by-state-guide
- https://prospeo.io/s/sales-cycle-length , https://getboomerang.ai/glossaries/b2b-sales-cycle-benchmarks-2026
- https://www.growthspreeofficial.com/blogs/b2b-saas-procurement-engagement-timing-benchmarks-2026-contract-phase-compression-security-questionnaire
- https://www.revenuehero.io/blog/what-is-a-no-show-rate , https://focus-digital.co/average-no-show-rate-for-booked-sales-meetings-by-booking-channel/
- https://www.noon.ai/blog/articles/188-recruiting-outreach-benchmarks-2026
- https://support.stripe.com/questions/common-questions-about-payout-schedules
- https://www.uspto.gov/subscription-center/2026/reducing-trademark-pendency-improving-processing
- https://aws.amazon.com/premiumsupport/plans/

Not found (kept [design]): investor reply latency, exec reply latency, time to next free slot, redline turn counts,
lawyer and accountant turnaround, dispute decision time, Stripe account-review duration.
