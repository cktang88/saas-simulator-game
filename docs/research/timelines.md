# How long things take: timeline distributions (checked 2026-10-16)

Used by `public/core/timing.js` (`TIMELINES`, `timeline`, `schedulingBackAndForth`, `vendorSupportFactors`, `invoicePayFactors`) and `public/core/mail.js`
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

## 5. Support back-and-forth (`apps/helpdesk.js`: `awaitCustomer`, `customerWaitDay`, `nudgeCustomer`)

When you reply to a written ticket, the customer's next message is a draw, not instant. The ticket sits in
**pending** (waiting on the customer, Zendesk sense); their answer flips it back to **open** (your turn).

| Wait | Median / p90 | Factors | Basis |
|---|---|---|---|
| Business customer answers your reply (`support.customerReply.b2b`) | 0.6 / 3 business days (weekends skipped) | enterprise customer ×1.3 and +0.2σ (checks with the team); urgent −0.8σ, high −0.4σ, low +0.5σ; clear reply (judged ≥ 0.6) −0.4σ, vague (< 0.35) +0.6σ; shared Slack channel −0.5σ; your follow-up −0.3σ | [design]; no published customer-side reply latency found (Zendesk's "requester wait time" pauses while pending) |
| Consumer answers (`support.customerReply.consumer`) | 0.4 / 2.5 calendar days | same | [design] |
| Customer never answers | 12% + 35% × (1 − reply quality) | a follow-up revives half of them | [design] |
| Pending → auto-close | 7 days | silent after a clear reply = solved (no CSAT); after a vague reply = closed unresolved, low CSAT, 12% cancel at period end, logged mistake `customer_went_quiet` | [V] practice: nudge at ~24 h and ~72 h then solve (eesel/Zendesk guides); teams configure 4-20 days (Zendesk default closes 4 days after solved; GitLab ran 20) |
| Customer replied and you never got back | 7 days → abandoned, 20% cancel, mistake `followup_ignored` | same clock as unanswered first contact | [design] |

Operator tiers: a stellar operator writes the specific, grounded answer (fast reply, few silent customers), follows
up once on silent tickets and closes the loop on every customer reply; a mediocre one sends "we'll look into it",
never follows up and lets replies sit, which shows as auto-closed unresolved tickets, low CSAT and cancellations.

## 6. Vendor support (`core/timing.js` `vendorSupportFactors`; `apps/insights.js` `openVendorCase`; `apps/marketworld/engine.js` `metaAppeal`)

| Wait | Median / p90 | Factors | Basis |
|---|---|---|---|
| Cloud provider billing case (surprise bill credit, `vendor.cloud.billing`) | 2 / 7 business days | paid Business support ×0.35 (chat/phone, < 24 h target) vs Basic (no target); account ≥ $50k/mo −0.5σ, ≥ $5k −0.2σ, < $500 +0.3σ; bill ≥ 5× normal = high severity −0.4σ; email +0.2σ, chat −0.4σ | [V] AWS plans page: Business Support+/Enterprise human-response targets general guidance < 24 h, system impaired < 12 h, production impaired < 4 h, production down < 1 h, critical < 30/15 min; Basic lists 24/7 customer service but no target. Pricing: [V] historically greater of $100 or ~10% of usage for Business (verify current Business Support+ pricing) |
| Credit outcome | 60% grant 30-100%; +15 pts if caps/alerts were set before asking, −10 if not; unclaimed after 60 days = mistake | | [design] |
| Stripe support case (card-testing fee refund, `vendor.stripe.support`) | 1 / 4 business days | chat −0.4σ vs email +0.2σ; processing volume as account size; paid plans ×0.5 | [V] stripe.com/support-plans: all accounts get 24x7 phone, email and chat; Growth/Premium/Enterprise add priority access and a 15-minute critical-issue SLA. Fee-refund decision time [design] |
| Fee refund outcome | 40% refund 50-100%; +20 pts with CAPTCHA/rate limits in place; unclaimed after 45 days = mistake | | [design] |
| Meta ad-account appeal (`vendor.meta.appeal`) | 5 / 16 days | web-form appeal +0.3σ; verified business −0.5σ (else +0.3σ); new account < 60 days +0.4σ, > 1 year −0.2σ; 30-day spend before the restriction as account size. Permanent restrictions (~15%) wait for the review and then are denied | [V] practitioner guides only: "usually 48 h" (Leadsie), 3-7 business days, 5-14 business days (cropink); 180-day window to request review. No official Meta figure |

## 7. Getting paid on invoices (`core/stripe.js` `issueInvoice`, `invoicePayer`; `core/timing.js` `invoicePayFactors`, `INVOICE_PAYERS`)

Days from issue to payment are one draw from `invoice.pay` (net-30 base: median 40, p90 75 = due + 10 / due + 45,
the previous calibration). Net-N terms scale it by (N + 10) / 40. The buyer comes from the CRM deal that created the
customer (segment, terms, paperwork). Mean simulated medians (issue → paid): federal net-30 ≈ 21 days (83% on
time), startup ≈ 32, mid-market ≈ 42, state agency ≈ 47, hospital net-45 ≈ 63, university net-45 ≈ 62,
enterprise net-60 ≈ 78.

| Factor | Effect | Basis |
|---|---|---|
| US B2B baseline | ~45-day average terms; ~52% of invoice value paid on time, ~43% overdue, ~5% written off (2025 survey of 240 US firms) | [S, secondary] Atradius Payment Practices Barometer US 2025 via a secondary summary; Atradius 2026 North America: late payment affects 7 in 10 companies, overdue ≈ 23% of B2B receivables |
| Federal agency | ×0.7, −1.0σ | [S] Prompt Payment Act: pay within 30 days of a proper invoice or owe interest |
| State agency / city, county / K-12 | ×1.05, +0.3σ | [design]; state prompt-pay statutes typically 30-45 days; board-approved warrant runs |
| Higher ed | ×1.0, +0.3σ (on net-45 segment terms) | [design] university AP practice |
| Hospitals | ×1.0, +0.4σ (net-45) | [S, dated] AHA: median average payment period 51 days (2013; all current liabilities, not only vendors) |
| Large enterprise / pharma | ×1.0, +0.3σ (net-60 in segment data) | [design] |
| Mid-market / startup / owner-run SMB | ×1.0 +0.1σ / ×0.85 −0.3σ / ×0.9 −0.1σ | [design] |
| Vendor setup (W-9, supplier portal) done / unfinished | −0.2σ / +0.5σ | [design] |
| Cap | slow payers pay by due + 100 days; only the ~1% `never` share reaches the 120-day write-off | [design] |
| Invoices go through an AP portal (Coupa/Ariba) | +0.2σ | [design] |
| Reminder | re-draw with −0.9σ / n-th reminder (−0.2σ more before the due date); a second nudge within 5 days does nothing | [design] |

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
- https://stripe.com/support-plans
- https://www.leadsie.com/blog/recover-disabled-facebook-ad-account , https://cropink.com/facebook-ad-account-disabled-appeal
- https://www.eesel.ai/blog/zendesk-automation-recipe-stale-close , https://www.eesel.ai/blog/zendesk-pending-ticket-reminders-automation
- https://handbook.gitlab.com/handbook/security/customer-support-operations/zendesk/metrics-definitions/ , https://gitlab.com/gitlab-com/support/support-team-meta/-/issues/3125
- https://lonelyentrepreneur.com/founder-days-to-get-paid/ (secondary summary of Atradius US 2025) , https://atradius.us/knowledge-and-research/reports/b2b-payment-practices-trends-united-states-2024
- https://trustees.aha.org/node/140342 (AHA hospital financial indicators: average payment period)

Not found (kept [design]): investor reply latency, exec reply latency, time to next free slot, redline turn counts,
lawyer and accountant turnaround, dispute decision time, Stripe account-review duration, customer-side support reply
latency, official Meta appeal times, Stripe fee-refund decision times, US-only days-beyond-terms by buyer segment.
