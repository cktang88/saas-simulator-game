# MVP and first customers: sourced facts for the early-stage sim

Research brief for the SaaS Founder Simulator (early stage: MVP, first 10-100 customers, PMF).
Tags: **[sourced]** = read from a fetched primary or near-primary page; **[secondary]** = taken from a third-party summary or blog that cites the original; **[unverified]** = a claim I could not trace; **[design]** = a sim assumption, not a statistic.

Research note: many of the "Lenny's Newsletter" and YC claims below come from third-party summaries. The direct Lenny "first 10 B2B customers" page returned 404 and could not be read. Verify before quoting.

## 1. MVP types and what each tests

Ries's framing (Lean Startup): an MVP is the version that yields the most validated learning for the least effort. He stresses it is "not about creating minimal products" [secondary]. The usual working taxonomy:

| Type | What it tests | Typical cost/time (2026) | Notes |
|---|---|---|---|
| Landing page / smoke test (fake door) | Interest, message fit, willingness to give an email or card | Hours to 2 days [design] | Clicks are not commitment. Weak for complex products. |
| Explainer video / screencast | Whether a story sells the problem | 1-3 days [design] | Dropbox's 2007 screencast is the canonical example (see below). |
| Concierge | Whether the outcome is wanted, and what the real workflow is | Founder hours, no code [design] | Delivers value by hand. Founder's charm can bias results [secondary]. |
| Wizard of Oz | Whether an automated-looking experience is used and paid for | Days to weeks, human behind the curtain [design] | Cheap way to mimic a functioning system. |
| Single-feature MVP | The one job the buyer would pay for | 2-8 weeks with an AI coding agent [design] | The default for most SaaS. Ship one job, not a suite. |
| Piecemeal (no-code + existing tools) | Workflow value before building anything | Days, roughly $50-300/month of tools [design] | Zapier, Airtable, Typeform, Stripe Payment Links. |
| Pre-sale / paid pilot | Real willingness to pay | Days to build the offer, then selling time [design] | The strongest signal per dollar of cost. |

**Smoke-test conversion benchmarks (weak data):**
- The Unbounce all-industry landing-page median is about 6.6% (Q4 2024 dataset, more than 57M conversions) [secondary]. That is a median across all page types, not a target for a waitlist.
- Email opt-in pages are typically 5-20%, with cold traffic at the low end [secondary, Leadpages].
- Waitlist pages: one blog puts the average at 2-5% and top performers at 10-15% [unverified].
- Synthesis: for cold traffic to a waitlist, about 3-10% is a plausible band, and under roughly 3% suggests a message or friction problem [design]. The useful signal is comparing variants against each other, not hitting one number.
- Email signup is not payment intent. A card or pre-order click is a far stronger signal. Treat the email/card gap as a sim variable.

**The overbuilding trap.** Founders who skip the smoke test and build the full product spend months before learning whether anyone wants it. With AI coding agents the build cost has dropped, but the trap is the same: the speed makes it easy to build the wrong thing faster. [design: the sim should charge build hours for every feature and reward a test before a build.]

## 2. First customers by business model

### 2a. The core evidence on early channels (consumer)
Lenny Rachitsky's "how the biggest consumer apps got their first 1,000 users" study covered more than 100 consumer companies [sourced via search summary, primary article partly read]. He lists seven channels: friends and colleagues; cold outreach to targeted strangers; going where the audience already gathers; influencers; press; viral content; physical placement. Stated shares of startups using each (as summarized from the article):
- Where the audience gathers: "over 50%" of startups, the most common channel.
- Targeted strangers: important for about 30% of consumer startups.
- Friends and colleagues: about 20% of startups relied on it for a large share of early growth.
- Press: over 20% of the most successful consumer startups.
- Viral content: about 10% of startups, with only five of more than 100 companies growing that way.
- Physical placement: about 10%.

Examples in the article: Tinder pitched campus sororities and fraternities and printed flyers near SMU; Duolingo's CEO's TED talk brought more than 300,000 signups to a private beta; Cameo paid interns to DM talent; Lyft sent personal invites to friends first. The consistent pattern is that most early users come from one or two channels, not a balanced mix.

### 2b. B2B: network first, then outbound
- Secondary reading of Lenny's B2B series "How to find and win your first 10 B2B customers": the most common route to the first 10 customers is the founder's personal network, with cold outbound second [secondary, unverified against original].
- Caution from David Hsu (Retool), quoted secondhand: selling to people you know can make you think you have product-market fit when they are being polite and not paying [secondary].
- Cold email benchmarks (Woodpecker analysis, more than 20M cold emails, sampling and period not stated) [sourced via WebFetch of Lemlist's summary]:
  - Platform-wide average reply rate: 3.43%.
  - Tiers: standard 1-5%, good 5-10%, top performers above 10%.
  - List under 50 recipients: 5.8% average. Over 1,000: 2.1%.
  - Generic copy: about 7-9% reply. Context-specific personalization: about 17-18%.
  - Adding one follow-up raises total replies by roughly 66%. 42% of replies come from follow-ups; 48% of reps never send one.
  - Reply-rate benchmarks vary by up to 7.6x depending on methodology and denominator (roundup, [unverified]). Treat every reply-rate number as method-dependent.
- Touches per first customer: no reliable source found. [design] A first B2B win in the sim typically takes roughly 40-150 outbound touches including follow-ups and calls, at 1-5% reply and 10-25% meeting-to-next-step. Mark this clearly as an assumption.
- Design partners: widely described as a core early tactic, co-building with 3-5 early accounts in exchange for feedback and a discount [secondary, practitioner framing]. A design partner that never pays is a common failure mode [design].
- Narrow focus: starting with one persona and one use case (Snyk's early Node.js developers, cited secondhand) [secondary].

### 2c. Developer tools, marketplaces, B2C specifics
- Dropbox's April 2007 screencast, posted to Hacker News with a waitlist form, is repeatedly reported to have taken the beta waitlist from about 5,000 to about 75,000 in a day [secondary, several blogs repeat it; no primary source found]. The screencast used mockups; it was closer to a Wizard of Oz than a true fake door. Dropbox's referral program (500 MB to both sides, widely reported) is a second documented tactic.
- Notion's Reddit-driven 30k waitlist in six weeks is a listicle claim [unverified].
- Paul Graham's "Do Things That Don't Scale" (July 2013) is the origin of the "do unscalable things first" rule [secondary summaries]. Examples cited: Wufoo's handwritten thank-you notes; Airbnb's founders photographing listings themselves.
- YC Startup School guidance (talk summaries, Gustaf Alströmer) [secondary]: get the first customer by any means, even manual work that cannot scale beyond about ten; founders do the selling; charge from the start because free use does not validate the model; track the outreach-to-close funnel and avoid conclusions from tiny samples.
- Marketplaces and product launches (Product Hunt, Reddit, TikTok, communities) are real channels, but outcomes are heavily skewed. No reliable per-channel conversion data was found [unverified]. Sim should model them as high-variance, not average.

## 3. Pricing early

- The most consistent claim in the sources is that early founders underprice [secondary, YC lecture summaries]. A rule of thumb attributed to YC partners: if a 30% price increase draws no pushback, you are still too cheap [secondary, unverified].
- Charge from day one. Business customers expect to pay; a free pilot with no price is a weak signal [secondary, YC Startup School and Blomfield's B2B talk].
- Anchor on value rather than cost. A secondhand YC rule is roughly a third of the value delivered [unverified].
- Patrick Campbell's central claim: get the value metric right first [secondary, quote from a blog citing Lenny's Newsletter; verify].
- Discounts for design partners: common, but no reliable data on size or conversion to full price was found [unverified]. [design] Sim default: design partners pay a discount of 30-60% with a conversion-to-full-price-or-churn check at month 3.
- Payment rails: Lemon Squeezy is quoted at 5% + $0.50 per transaction, Polar at 4% + $0.40 (plus about 1.5% international, per one review), Gumroad at 10% for hobbyists [secondary, vendor comparison blogs; fees change, check vendor pages].

## 4. Early metrics that matter

- **Activation:** Lenny's SaaS data, as summarized from his activation post: average activation 36%, median 30% [secondary, snippet only]. His rule: pick an early milestone that correlates with retention, where users who reach it retain at least 2x those who do not [secondary].
- **Early retention:** Amplitude's 2025 report (more than 2,600 companies, vendor data) sets day-7 return of 7% of a cohort as the top-quartile threshold for activation [secondary, vendor]. No reliable week-1 or week-4 benchmark split by consumer/B2B was found [unverified].
- **Net revenue retention:** ChartMogul's aggregate figures, as quoted by secondary blogs: traditional B2B SaaS gross revenue retention about 82% and net about 106%, with a conflicting median of 82-101% for NRR elsewhere; AI-native products around 27-40% GRR in 2025 [secondary, conflicting] [unverified].
- **Revenue concentration:** flag if one customer is more than about 20-30% of MRR [design].
- **NPS at small n:** with fewer than about 30 respondents the score is noise. Use interview quotes and behavior [design].
- **When to start paid acquisition:** after the activation and retention signal is stable, not before [design; consistent with the channel advice above].
- **When to hire the first salesperson:** Lenny's practitioner threshold, as summarized by SaaStr, is after about 10 customers closed and when the founder spends more than 20% of time selling [secondary]. A third-party skill summary adds "50-100 at-bats with steady win rate" before hiring [unverified]. Hire after the motion is repeatable, not before [design].

## 5. Timelines

- **Stripe Atlas 2025 cohort (company data, incorporated through Atlas):** 20% of Atlas startups charged their first paying customer within 30 days of incorporation, up from 8% in 2020. Median time to first payment among startups that accepted payment in their first three months: 34 days (from 38 the year before). Median first-six-month revenue rose 39% year over year; the 90th percentile rose 52%. Average unique customers in the first six months: 242 [sourced, Stripe blog fetched]. Caveat: this is a self-selected population that incorporates through Atlas, and it is company-reported with no sample size given.
- **Solo founders:** one search summary reported median first-six-month revenue down 23% for solo Atlas founders, but the Stripe page does not contain that figure. Do not use it without checking the source [discrepancy].
- **Time to MVP:** no reliable distribution found. [design] Single-feature MVP: 2-8 weeks solo with AI coding agents; first paid pilot: 4-12 weeks from start; first paying B2B customer: 1-4 months for a founder with a warm network, 4-9 months from cold [design].
- **Time to $10k MRR:** no reliable survey or distribution was found. BetterLaunch (a launch platform) reports that about 50% of actively building indie hackers are at $0-1K MRR, but it does not name its surveys [unverified]. A calmops guide gives about 12 months average and 24+ months if slow for $10K MRR, unsourced [unverified]. [design] Sim starting prior: median 12-24 months, with a large mass that never reaches it.
- **Share that never get first revenue:** no reliable number found. The Stripe figure (20% charge within 30 days) is among the fastest-moving startups, not a survivorship-corrected base rate [unverified].

## Gaps and next steps

- The Lenny "first 10 B2B customers" page should be read directly before any touches-per-customer number is used in the sim.
- Indie Hackers and MicroConf have no public time-to-revenue distributions found here. Ask those communities or look for a published survey before stating a number.
- Every 2026 AI build-time and cost figure above is a [design] estimate. Replace with measured data when available.
