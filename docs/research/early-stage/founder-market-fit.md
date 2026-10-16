# Founder-market fit, idea sources, and how outsiders read early signals

Research brief for the early-stage simulator. Sources are secondary unless marked. Items marked [unverified] could not be confirmed against a primary source in this pass. Items marked [design] are simulator assumptions, not statistics.

## 1. Where good ideas come from

**Own pain beats brainstorming.** Paul Graham's essay "How to Get Startup Ideas" (Nov 2012) argues founders should look for problems rather than invent ideas, ideally problems they have themselves. Good ideas tend to meet three conditions: the founders want the product, can build it, and few others see that it is worth building. Source: https://paulgraham.com/startupideas.html

**Industry experience predicts growth.** Azoulay, Jones, Kim and Miranda ("Age and High-Growth Entrepreneurship", NBER w24489, 2018; AER: Insights 2020) use US Census administrative data. They find the average founder of the fastest-growing 1-in-1,000 new ventures was 45.0 years old, and that prior experience in the specific industry is strongly associated with success. The paper rejects youth as a required trait. Sources: https://www.nber.org/papers/w24489 and https://www.kellogg.northwestern.edu/faculty/jones-ben/htm/Age%20and%20High%20Growth%20Entrepreneurship.pdf. Effect sizes were not verified in this pass [unverified]. Treat the finding as correlational, not causal.

**Brainstormed "sitting around" ideas.** No primary source found showing these fail more often in general. The sim should model them as lower-prior, not as doomed. [design]

**Tarpit ideas.** A tarpit is a problem that looks easy and widespread but has resisted solutions for years. The standard check is to research who tried it, why it failed, and talk to those founders. Source (secondary, NFX-style framing): https://echai.ventures/startingup/founder-market-fit/what-are-the-warning-signs-that-i-have-weak-founder-market-fit-and-i-m-forcing-it. Tarpit status should be a visible, checkable property of an idea in the sim: prior attempts exist, and the player can learn why they failed. [design]

**Evidence on domain-expert success rates.** The Azoulay result is the best-sourced number here. A general "domain experts win X% vs Y%" figure was not found [unverified]. Do not hard-code a success multiplier without a source.

## 2. Founder-market fit signals

- **Origin.** Chris Dixon's post "Founder/market fit" (2011) credits David Lee with the phrase. Dixon argues fit is the best predictor of reaching product-market fit. Source: Dixon's blog, not fetched in this pass [unverified text]. Dixon later became a partner at a16z; no a16z-published definition was found.
- **NFX framing.** James Currier's "4 Signs of Founder-Market Fit" (NFX) treats fit as more than domain expertise. A co-founder pair can split fit: one supplies domain, the other supplies obsession, story, or personality. NFX's ideation writing defines fit through obsession: the founder would work on the idea in free time. Secondary summaries only [unverified wording].
- **Specificity.** "I love fintech" is a category, not a fit. Fit should be scored on a specific market (buyer, workflow, vocabulary). [design]

**Signals the sim can model:**
1. Years of work inside the target buyer's job (not just the industry).
2. Existing contacts who are buyers, not just peers.
3. Fluency in the buyer's vocabulary, which shows up in interviews and copy.
4. Sustained interest that survives a slow month. [design]

## 3. How domain knowledge speeds discovery

Domain experts reach the first ten paying or committed buyers faster for three reasons, which are simulator mechanics rather than sourced rates [design]:

- **Who to call.** Warm access shortens recruiting time for interviews.
- **Vocabulary.** Fewer mistranslated questions; the interview pitch lands.
- **Knowing the workaround.** The founder can spot what buyers already pay for (spreadsheets, consultants, a competitor's SKU), which is the real demand signal.

The sim should make these costs visible: an outsider spends more founder hours per qualified interview and misreads more objections.

## 4. Idea maze

Idea selection is path-dependent. Each choice opens or closes later options. Model this as a branching space where early choices (segment, wedge, channel) change which later problems are reachable. Ideas that look good in isolation can have no reachable path for a given founder. [design]

## 5. What investors expect, pre-seed and seed, 2025-2026

Numbers are vendor or secondary reports and are not audited.

- **Seed valuation and dilution.** Carta-sourced figures reported in a July 2026 Carta LinkedIn post: software seed median valuation $24.3M on $4.1M raised, median dilution 18%. Secondary summary of Carta Q4 2025: median seed post-money $24M, up from $18M a year earlier. Sources: https://carta.com/data/linkedin-startup-fundraising-benchmarks-2025-annual/ and secondary summaries [unverified for the 2026 post].
- **Seed-to-Series A interval.** Secondary summary cites 774 days median (Q4 2024) [unverified].
- **Pre-seed.** Vendor guidance says 10-15% dilution in 2025 pre-seed rounds, and a median valuation near $4M [unverified]. Investors weigh activation and letters of intent over raw signup counts. Waitlists of 100-1,000 engaged signups with organic growth are cited as a bar [unverified].
- **Seed ARR.** One VC-adjacent guide puts a strong B2B SaaS seed at roughly $0.5M-$1.5M ARR [unverified]. A Carta page titled "Seed Rounds Close at Zero ARR and at 3.6 Million ARR" was found, but its body text could not be retrieved, so its ARR claims are unverified. Pre-revenue founders are steered toward pre-seed.
- **Growth rate.** The common heuristic is 15-20% month-over-month early growth [design / unverified]. No primary source found in this pass. Use as a sim default only, labelled as such.
- **Retention.** Lenny's Newsletter ranks flattening cohort retention curves as the strongest PMF signal, ahead of qualitative signs. Method: group sign-ups by period and track share still active at set intervals. Source: https://www.lennysnewsletter.com/ (paid PMF section; summaries only).

## 6. Accelerators: acceptance and screening

- **Y Combinator.** YC's own blog reported Winter 2024: 260 companies from more than 27,000 applications, under 1%. Summer 2025 was estimated at about 0.6% by a third-party analysis; YC does not publish per-batch rates for 2025 [unverified]. Older guides cite about 1.5-2% from the two-batch era.
- **What they screen for.** No official criteria were found in this pass. Common public claims are founder quality, speed of progress, and traction growth [unverified]. Use as design hints, not facts.

## 7. How outsiders detect false PMF

No primary source was found for this section. These checks are simulator mechanics [design]:

- **Concentration.** One or two customers make up most revenue. Flag when top-3 customers exceed about half of MRR.
- **Friends and network revenue.** Revenue from founder-introduced buyers who never churn-test. Ask for a reference call.
- **Paid-growth dependence.** Growth that stops when spend stops. Check retention of paid versus organic cohorts.
- **Survey inflation.** Sean Ellis's rule: at least 40% of target users "very disappointed" to lose the product suggests PMF in that segment. The threshold came from comparing companies that struggled with those that grew. Source: https://pmfsurvey.com. Survey only engaged users and the score inflates; pair it with cohort data.

## 8. How PMF claims get checked in diligence

- **Cohort data.** Retention curves by sign-up month. Flattening curves are the key evidence (Lenny's ranking above).
- **Customer reference calls.** Investors ask for named customers who will describe the problem and what they pay. [design] Not sourced in this pass.
- **Design-partner logos.** Logos from pilots count only with paid conversion or usage evidence. [design]

## 9. Simulator implications

1. Idea sources: own pain gets a higher prior; tarpit status is discoverable through prior-attempt research.
2. Domain experts get lower discovery cost per interview. No numeric success multiplier is hard-coded until sourced.
3. Investors read concentration, cohort flattening, and paid-versus-organic growth. False PMF has a traceable cost (wasted build time, a later churn wave).
4. Benchmarks in the sim use the sourced ranges above, marked as [unverified] where applicable.

## Open gaps

- Primary text of Chris Dixon's 2011 post and NFX's signs article.
- Primary-source effect sizes for the Azoulay industry-experience finding.
- YC official selection criteria.
- Carta primary report for 2026 seed medians.
- Sources on fake-traction detection and reference-call practice.
