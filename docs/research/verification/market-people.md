# Natural loophole blockers: market and people (research brief)

Scope: mechanisms in B2B sales, consumer/marketing law, ad/platform enforcement, press, hiring/employees and legal/IP that stop founders lying, gaming or cutting corners. A sibling file covers fundraising/debt/M&A/tax/payments/grants. Written 2026-10-16.

Evidence tags: **[S]** = backed by a source fetched/searched this session (URL listed in Sources); **[M]** = well-known from memory of primary law/policy, not re-verified this session (treat as [unverified] until checked); **[unverified]** = vendor blog, anecdote or no source; **[design]** = our own estimate for game calibration, never a real statistic.

Common design pattern for every mechanism (apply in code): a *check* is a process with (a) a trigger, (b) a duration in days, (c) a founder-hour and fee cost, (d) a detection probability that depends on what the founder did (claim-vs-reality gap, evidence quality), (e) delayed consequences that compound, and (f) a cheap smooth path for honest operators (pre-built artifacts, which also separate stellar/good/average/mediocre tiers per ARCHITECTURE principle 7).

---

## 1. B2B sales

### 1.1 Security questionnaire / request for SOC 2 report / pen test summary
- **Checked:** claimed controls (SSO, encryption, backups, incident response, subprocessors) vs evidence. Questionnaires (SIG Lite/Core, CAIQ, custom) of ~100-300 questions; a 200-400 question one can take 2-4 weeks to answer manually, 8+ hours of work for a single one [unverified, vendor blogs; Procurize, getagency]. Many enterprises state "SOC 2 or no deal" [unverified].
- **By whom / when:** buyer InfoSec/GRC, after champion says yes, before legal and signature (late-stage gate). Typically 1-4 weeks calendar; vendor claim that 72% of vendors see 2+ week delays from security review, attributed to Ponemon, attribution not verified [unverified].
- **Catches:** missing documents, evasive answers, claimed-but-absent certifications (they ask for the report/letter, a bridge letter, the pen test executive summary, the date). **Misses:** controls that exist on paper but not in practice; a Type I report with weak scope; stale reports (>12 months old) are the typical flag [M].
- **Detection odds [design]:** claiming SOC 2 you do not hold: ~90% caught when a report is requested (enterprise ~95%, SMB ~25% because SMB buyers rarely ask). Overstating a control (e.g. "all data encrypted at rest" when a bucket is not): ~25% caught at questionnaire, ~60% caught later via pen test/PoC or after an incident.
- **Founder cost:** first questionnaire 8-20 h; reuse from an answer library cuts to 1-3 h; trust center + pre-filled SIG cuts to under 1 h [design, anchored on above]. SOC 2 itself is a sibling/other-file topic (cost $15-60k first year [unverified]).
- **Consequence when caught:** deal dies or stalls 2-6 weeks; flagged in vendor risk platform (see 1.2) so other deals at that customer fail; if the false statement is in the signed security exhibit, it becomes a warranty breach (1.6). Reputation hit via champion and reference chatter.
- **Honest pass:** real controls, "in progress, audit window dates, auditor name" disclosure, compensating controls, pen test summary under NDA, trust center. Honest "not yet" costs a delay, but a lie costs the deal and trust.

### 1.2 Vendor risk platforms (OneTrust, Vanta/Drata trust exchange, SecurityScorecard, BitSight, Whistic, Prevalent)
- **Checked:** external attack-surface scan (open ports, TLS, DNS, SPF/DMARC, leaked creds), certificate uploads, questionnaire consistency across customers. **By buyer's TPRM team**, continuously after onboarding, annual reassessment [M].
- **Catches:** public-facing hygiene, breach history, claimed vs scanned posture contradictions. **Misses:** internal controls, process maturity.
- **Detection [design]:** external-hygiene contradictions ~70% at enterprise buyers with scoring tools; ~10% at SMB.
- **Consequence:** score below buyer threshold means remediation plan demanded in 30-90 days; repeated fail means offboarding at renewal (churn event, logo lost).
- **Honest pass:** fix SPF/DKIM/DMARC, patch, TLS A grade, publish trust page; cheap for good operators (2-6 h one-off).

### 1.3 Reference calls with existing customers
- **Checked:** claimed logos, results, usage, support quality. **By** buyer champion/economic buyer, at shortlist or final stage; 1-3 calls of 20-30 min [M].
- **Catches:** fake or stretched logos, pilots passed off as customers, unhappy customers. Customers answer candidly more often than founders expect; unprompted negative detail is typical [design].
- **Detection [design]:** if founder claims a logo that is only a free trial/ex-customer: 50% the reference is exposed when the buyer asks for a named contact; if the provided reference is a churn-risk account, 40% of calls leak a lukewarm answer; outright lies about customer count are discovered ~35% by diligence-minded buyers via LinkedIn backchannel.
- **Founder cost:** 1-2 h per reference to prep and 2-4 h of relationship care; offering credits/discounts for references is allowed but must be disclosed if it is a paid testimonial (see 2.2).
- **Consequence:** lost deal, plus quiet cross-buyer talk in small verticals (spread rate high in niche markets) [design]. Fabricated references can become misrepresentation (1.6).
- **Honest pass:** curated 3-5 happy customers with measurable outcomes, case-study with approved numbers.

### 1.4 Proof of concept / pilot that tests claims
- **Checked:** the actual product against claimed capability, integrations, performance, accuracy (AI features especially). **By** buyer users and technical evaluator; 2-8 weeks for mid-market, 2-6 months enterprise [M, typical]. Success criteria should be written in advance.
- **Catches:** demoware, "roadmap sold as shipped", AI accuracy claims, integration gaps. This is the strongest natural blocker: claim-to-reality gap is directly observed.
- **Detection [design]:** P(gap discovered in PoC) = 0.8 x (gap size / 1.0) x (PoC rigor 0.3-1.0). Large gap, rigorous PoC: ~80%.
- **Founder cost:** 20-80 founder hours per PoC (setup, hand-holding, readouts) [design]; engineering time diverted from roadmap; unpaid PoCs are the classic time sink.
- **Consequence:** PoC fail: deal lost, 4-8 weeks sunk, champion burned, negative reference. PoC passed on a hacked demo path means later production failure, churn and refunds (1.7).
- **Honest pass:** scoped success criteria, paid pilot (filters tire-kickers, converts at 2x unpaid [unverified]), honest limitations list in kickoff.

### 1.5 Procurement and legal review
- **Checked:** MSA/DPA redlines, insurance certificates (cyber/E&O $1-5M typical asks [M]), W-9, SOC 2, subprocessors, financial stability, SLA, liability caps, indemnities, data location. **By** procurement + legal, after security; 2-8 weeks mid-market, 3-6+ months large enterprise/government [M; see buyer-segments.md].
- **Catches:** missing insurance, shell entity, inconsistent corporate details, unacceptable terms. **Misses:** product truth (that is 1.4).
- **Detection [design]:** missing prerequisites ~100% (binary document checks); weak balance sheet flagged ~60% at enterprise (they ask for financials or escrow).
- **Founder cost:** 10-30 h per enterprise contract incl. lawyer ($2-10k) [design/typical]; insurance premium $1.5-6k/yr for early SaaS [unverified].
- **Consequence:** stall; concessions (uncapped liability, MFN, termination for convenience) that become later costs; walking away is an option the player should model.
- **Honest pass:** standard paper, pre-negotiated fallback positions, certificate of insurance on hand, DPA template; stellar operators close legal in half the time.

### 1.6 Contract warranties, indemnities and liability when claims are false
- **What:** MSAs contain warranties (conforms to documentation, security warranty), IP indemnity, data-breach indemnity, SLA credits; fraud/misrepresentation and gross negligence typically sit **outside** the liability cap [M]. Typical SMB SaaS caps: 12 months of fees; super-cap for data breach 2-5x fees [M]. 
- **By whom / when:** buyer counsel at contract; enforced after a dispute; resolution 3-18 months [design].
- **Catches/misses:** only enforced when the buyer notices and decides to act; most disputes settle via credits/termination rather than suits.
- **Detection/enforcement [design]:** P(claim asserted | material misstatement discovered) ~35% for ACV < $20k (credits/refund), ~70% for ACV > $100k. Fraud inducement claims rare (~3%) but uncapped.
- **Consequence:** refund of fees (often 12 months), SLA credits, termination for cause, legal fees $10-50k, indemnity payouts; E&O insurer may deny coverage for known false claims [M].
- **Honest pass:** claims only what documentation supports; roadmap items explicitly labelled non-binding; "entire agreement" clause and no reliance on sales statements.

### 1.7 Churn and refunds when the product does not do what was sold
- **Mechanism:** after onboarding, usage is the truth. Overselling shows as low activation in first 30-90 days, refund requests, and non-renewal at term. Annual contracts delay churn and make it lumpy, producing a "cliff" at month 12 [design].
- **Detection:** 100% eventual; timing depends on contract length. Early-warning: weekly active seats < 30% of purchased by day 45 [design].
- **Consequence:** refunds/credits, discounting to save renewals, negative reviews (1.8), higher CAC payback. Cost traceable to the sales promise via a "sold-vs-delivered gap" ledger.
- **Honest pass:** qualified deals, written success plan, onboarding call within 7 days, quarterly business reviews.
- See also churn-reasons.md.

### 1.8 Review sites (G2, Capterra, TrustRadius, Gartner Peer Insights)
- **Checked:** reviewer identity (work email/LinkedIn), duplicate/incentive detection, moderation by site (G2 states it verifies reviewers by LinkedIn/email and discloses incentives; typical moderation 2-5 business days) [M, G2/Capterra policies; not re-verified]. Gift cards up to a small value are permitted if disclosed and not conditioned on sentiment [M].
- **Catches:** same-IP/domain bursts, employee/competitor reviews, templated language, solicited positive-only funnels (review gating). **Misses:** genuine-looking coached reviews.
- **Detection [design]:** purchased/fake review batches: 60% removed within 90 days, 25% chance of a vendor penalty (badge removal/profile flagged); reputational spillover if reported by competitors.
- **Legal overlay:** FTC fake review rule (2.1) covers buying/selling reviews, review suppression and insider reviews.
- **Honest pass:** ask all customers at an NPS peak, one-click link, disclose incentives; 20-50 real reviews in 12 months is a good small-SaaS outcome [design].

---

## 2. Consumers and marketing law

### 2.1 FTC fake reviews and testimonials rule (16 CFR Part 465)
- Final rule issued Aug 14 2024, effective Oct 21 2024; bans fake/AI-generated reviews, buying/selling reviews, incentivised sentiment, undisclosed insider reviews, review suppression and fake social indicators; civil penalties up to about $51,744 per violation (inflation-adjusted yearly); no definition of a single violation, courts decide the count; proposed "review hijacking" ban dropped **[S: WSGR, Davis Wright Tremaine, Hunton, Kelley Drye]**.
- **By:** FTC (and state AGs under state UDAP laws), complaint- and sweep-driven; first warning letters 2025 [M]. Investigation to action 6-24 months [M].
- **Detection [design]:** small company, a few fake reviews: ~3%/yr; systematic review farm or public admission: ~25%/yr; competitor tips raise this.
- **Consequence:** consent order (20 years of reporting), civil penalties, platform delisting, customers' trust; legal fees $50-250k even if settled [design].
- **Honest pass:** ask-everyone systems, no gating, disclose incentives, never write your own.

### 2.2 Endorsements and influencer disclosure (16 CFR Part 255)
- Material connections (payment, free product, equity, affiliate links) must be clearly disclosed in the post itself; both advertiser and influencer liable [M]. FTC sends warning letters in batches; penalty possible per violation [M].
- **Detection [design]:** low per post (~1-2%) unless viral or competitor-reported; platforms also auto-check branded-content tags (Meta, TikTok, YouTube) [M].
- **Consequence:** takedown, warning letter, brand damage; repeat means order.
- **Honest pass:** `#ad` / partner labels and contract clause; trivial cost.

### 2.3 "Made in", "free" claims, substantiation
- "Made in USA" must be "all or virtually all" US content (FTC Made in USA Labeling Rule 2021, civil penalties) [M]. "Free" requires no hidden conditions (16 CFR 251) [M]. Performance/efficacy claims need competent and reliable evidence before they are made (FTC substantiation doctrine; "AI washing" cases against fake-AI claims 2024-2025) [M].
- **Detection [design]:** 2%/yr for small SaaS unless complaints or competitor challenge via NAD (National Advertising Division, 60-90 days, voluntary but publicized) [M].
- **Consequence:** NAD recommendation to modify/stop, FTC letter, state AG, class action (2.6); AI-washing claims also attract SEC attention if fundraising claims are false (sibling doc).
- **Honest pass:** keep a claims file with evidence per claim; disclose limitations.

### 2.4 Dark patterns, ROSCA, click-to-cancel, state auto-renewal laws
- FTC click-to-cancel (Negative Option) rule was **vacated by the Eighth Circuit on 8 July 2025** (procedural: missing preliminary regulatory analysis); ROSCA (statute) still enforced: Amazon Prime settlement Sept 2025: $1B civil penalty (largest ever for an FTC rule violation) plus $1.5B refunds **[S: GT Law, Alston, Goodwin, Jurist, KH Law]**. States fill the gap: California auto-renewal law (amended, effective July 2025) and New York moves [S partially: JD Supra summary; details M].
- **By:** FTC, state AGs, plaintiff class actions; also Apple/Google/Stripe rules.
- **Checked:** clear disclosure of terms, express consent, simple cancellation (same medium as signup), reminders before annual renewals (state laws, typically 3-21 days notice) [M].
- **Detection [design]:** cancellation friction produces measurable complaints and chargebacks (2.8); enforcement chance 2-4%/yr for small, 15%/yr when complaint volume is high. Class action risk more likely than FTC.
- **Consequence:** refunds of all charges, penalties up to $53k per violation (ROSCA is treated as a rule violation) [M], consent orders, forced UX change. Short-term MRR boost from friction is offset by chargebacks, refunds, reputation.
- **Honest pass:** easy self-serve cancel, pause option, pre-renewal emails; also lower chargebacks.

### 2.5 State AGs and data/privacy statutes
- State AGs enforce UDAP, privacy (CCPA/CPRA via CPPA, Texas TDPSA, etc.) and auto-renewal laws, often multistate. **Detection [design]:** consumer complaints -> CIDs (civil investigative demands); 3%/yr for consumer-facing SaaS with dark patterns; consequence settlements $100k-multimillion, injunctive relief. [M]

### 2.6 Class actions
- Triggers: false advertising, auto-renewal, privacy wiretapping (CIPA session replay/pixel suits), TCPA texts, ADA website accessibility. Plaintiff firms scan sites with scripts; demand letters arrive without warning [M].
- **Detection [design]:** for a US consumer app with pixel/chat-widget tracking and no consent banner, demand-letter hit ~8-15%/yr; settlement or defence $25-150k typical for small firms [unverified/design].
- **Honest pass:** consent management, accessible site, clear terms with arbitration clause (reduces but does not remove).

### 2.7 App-store review, refund behavior
- Apple App Review (typically ~90% of submissions within 24h, [M Apple stats]) checks metadata accuracy, payments rules (IAP vs external links, rules shifted after Epic v. Apple 2025), privacy labels, demo accounts; rejections with Guideline 2.3 (accurate metadata), 3.1 (payments), 5.1 (privacy). Repeated or deceptive violations lead to account termination [M]. Google Play: policy strikes, developer account termination, 2025 requirement for identity verification/20-tester testing for new personal accounts [M].
- Refunds: Apple handles refunds at its discretion; high refund ratio and negative ratings lower rankings; Apple/Google can claw back revenue [M].
- **Detection [design]:** misleading screenshots or hidden features ~50% caught in review; privacy label mismatch ~20% caught.
- **Consequence:** delay 2-14 days per rejection, forced resubmits; account termination (rare, catastrophic) 1-2%.
- **Honest pass:** accurate metadata, demo credentials, privacy manifest.

### 2.8 Chargebacks as consumer check
- Cardholders dispute 120 days (often up to 540 days for non-delivery) [M]. Fee $15-25 per dispute from the processor plus lost sales [M]. Card networks monitor ratios: Visa VAMP (from 2025) merchants above about 1.5-2.2% combined fraud+dispute ratio enter excessive programs; Mastercard ECM at 1.5% and 100 chargebacks/month; Stripe may raise reserves or terminate [M; details in sibling payments doc].
- **Detection:** automatic and measurable; ratio is a direct function of deceptive billing (trial-to-paid surprises, hidden renewals).
- **Consequence:** fees, reserve holdbacks, processor termination (can freeze 90+ days of balance) [M].
- **Honest pass:** descriptor clarity, renewal reminders, easy refunds (cheaper than chargebacks).

---

## 3. Ad and platform enforcement

### 3.1 Meta / Google / TikTok / LinkedIn ad review
- **Process:** automated review at submission (minutes to 24h), re-review on edits, plus later sampling and user reports. Restricted categories: health, finance/crypto, "before/after", personal attributes, unrealistic earnings claims, misleading "AI" claims [M].
- **Google Ads Misrepresentation policy:** violations lead to suspension "upon detection and without prior warning"; reinstatement only in compelling circumstances; fixing site/Merchant feeds is needed [S: Google policy, Search Engine Land].
- **Meta:** disabled ad accounts: identity verification 24-48h; standard appeals 2 days to a week; complex policy reviews 2-3 weeks; automated bot appeals often stall; claimed 90% recovery rate is an agency marketing claim [unverified]. Appeal on wrong asset wastes limited attempts [unverified].
- **Detection [design]:** policy-violating claim in creative: 60% rejected at submission (ad disapproved), 20% passes and later flagged; accounts with repeated rejections or circumventing (cloaking, text-in-image tricks) escalate to account level ban ~35% within 90 days.
- **Consequence:** ad disapproval (lost 1-3 days), spend limits, ad account disabled (lose pixel history/learning; 1-3 weeks to restore or rebuild; business manager ban), payment method blacklisted.
- **Honest pass:** substantiated claims, landing page matches ad, verified business/domain, small test spends, avoiding restricted terms.
- See competition-and-platform-risk skill for founder playbook.

### 3.2 Google Merchant Center / Shopping
- Feed disapprovals for mismatched price/availability, missing policies (returns/shipping), misrepresentation (missing contact info). Suspension with 7-day or longer review for appeal [M]. Relevant to ecommerce SaaS merchants rather than pure SaaS; low priority.

### 3.3 Email deliverability as a check on spam
- Gmail/Yahoo bulk-sender rules (Feb 2024): senders above ~5,000 messages/day to Gmail need SPF, DKIM, DMARC (aligned), one-click unsubscribe (RFC 8058) honored within ~2 days, and spam complaint rate under 0.3% (recommended under 0.10%); Microsoft Outlook added similar requirements for 5,000+/day senders in 2025 **[S: Sender, Bird, Mailgun, Warmy summaries; vendor pages, check Google/Yahoo official]**.
- **Mechanism:** mailbox providers measure engagement, complaint rates (Gmail Postmaster Tools), authentication, domain age, list quality (spam traps, bounces > 2% hurts). Throttling then spam-foldering then rejection (5xx) then blocklisting (Spamhaus, etc.) [M].
- **Detection [design]:** automatic, high; complaint rate = f(list quality, relevance, volume). Cold list of purchased contacts: 0.3-1% complaints plausible; bounce > 5%.
- **Consequence:** reply rate decay within 1-3 weeks; domain reputation damage takes 4-12 weeks to rebuild; burned primary domain (so secondary domains are used); ESP (Instantly, Smartlead, Google Workspace) can suspend account.
- **Honest pass:** secondary domains, warmup 2-4 weeks, small daily volumes (30-50/mailbox/day), verified lists, relevance, easy unsubscribe.
- See founder-outbound-sales skill and docs/research/plg-email.

### 3.4 CAN-SPAM / GDPR / CASL for cold email
- CAN-SPAM (US): no consent needed for B2B cold email but requires truthful headers, physical address, opt-out honored within 10 business days; civil penalties about $53k per email (inflation-adjusted; amount [M], not re-verified) enforced by FTC (rare against small firms).
- GDPR/ePrivacy (EU/UK): B2B to corporate addresses allowed in some member states under legitimate interest, but needs lawful basis, Article 14 notice, opt-out; some countries (Germany UWG) require prior consent even for B2B [M]. CASL (Canada): express or implied consent; penalties up to CAD 10M per violation for organisations; CRTC enforcement and private right of action (delayed/suspended) [M].
- **Detection [design]:** regulator action against a small cold emailer: <1%/yr; practical enforcement is by mailbox providers (3.3) and complaint-driven (domain suspension). Data-subject complaint to DPA -> letter in 1-3 months.
- **Consequence:** letters, warnings, rare fines; larger: platform account suspension.

### 3.5 LinkedIn automation detection
- LinkedIn prohibits automation software; detection is behavioral (rate, timing regularity, device/IP fingerprint, browser extension footprints). Escalation: warning, temporary restriction (days) then permanent ban; vendor sources cite 20-25 connection requests/day as safe for established accounts, not confirmed to LinkedIn's docs, and recovery rates on permanent bans are anecdotal [unverified].
- **Detection [design]:** daily volume above 100 invitations/day or 24/7 activity: ~30%/week of restriction; cloud-based tools with shared IPs: higher. Restricted accounts lose 3-14 days of outbound; permanent ban kills network and signal (founder's profile is an asset, so ban is expensive).
- **Honest pass:** manual, personalised, low-volume (20/day), use Sales Navigator, content-first.

### 3.6 Reddit / Hacker News moderation, vote rings
- HN: voting-ring and brigading detection, flagging by users, shadow-penalties, "Show HN" rules (must be real, usable product; no fake accounts); mods (dang) down-weight/kill posts and ban accounts; HN guidelines prohibit asking for upvotes [M]. Reddit: self-promo 9:1 norms, subreddit rules, site-wide spam filters, shadowbans, new-account karma/age gates [M].
- **Detection [design]:** vote solicitation outside the site (Slack/DM) ~60% detected for HN front-page attempts; astroturf comments on Reddit ~50% flagged by mods or users within a week; brand domain may be banned from a subreddit or site-wide.
- **Consequence:** post killed (loses launch window, which is one-shot), account/domain ban, public callout thread (reputation negative and searchable).
- **Honest pass:** genuine technical story, founder answers comments, disclosure of affiliation.

### 3.7 Product Hunt fake-upvote detection
- PH uses algorithmic weighting (account age/activity), hides suspicious votes, may remove from homepage or ban makers; coordinated "upvote me" campaigns discouraged [M; PH rules; not re-verified]. 
- **Detection [design]:** purchased or ring votes ~70% discounted/removed; maker flagged ~30%.
- **Honest pass:** genuine community, prelaunch audience, launch-day engagement.

### 3.8 Marketplace and app-directory reviews
- **Salesforce AppExchange Security Review:** one-time $2,700 for most paid/freemium solutions ($2,550 review fee + $150 first-year listing), annual $150 listing; free solutions waived; periodic re-reviews; refund request within 180 days **[S: Salesforce docs, older release versions; current price to be checked]**. Review process includes automated scans (Code Analyzer, Chimera/Burp), manual testing; failure reports list findings; resubmit loop typical 2-8 weeks total [unverified/design].
- **Shopify App Store:** automated checks + manual review for listing requirements (OAuth correctness, GDPR webhooks, billing API use, Built for Shopify tier); review queue typically days-weeks [M, unverified].
- **Chrome Web Store:** automated + manual review, permissions justification, single-purpose policy, privacy disclosures; reviews 1-3 days up to weeks for broad host permissions; developers with extensions removed lose publisher standing [M].
- **ChatGPT app directory / Claude connector & MCP directories:** submission review for policy compliance, security, auth, tool accuracy; early review criteria and times evolving 2025-2026 [unverified].
- **Detection [design]:** hidden functionality, excessive permissions, off-platform billing: 70-85% caught at review for rigorous marketplaces (Salesforce ~85%), 50% others; rest caught later by user reports/telemetry scans.
- **Consequence:** rejection with resubmission (1-4 weeks per loop), delisting, developer account strikes, lost install base; billing-circumvention risk of ban.
- **Founder cost:** 20-60 h for a first Salesforce security review prep incl. fixing findings [design]; fee as above.
- **Honest pass:** least-privilege scopes, documented data flows, secure coding checks pre-submit. Stellar: first-time pass.

---

## 4. Press and PR

### 4.1 Journalist fact-checking, retractions
- **Process:** reporter asks for data/proof (ARR, customer counts, funding), contacts customers/competitors/investors; outlets such as Bloomberg, WSJ, TechCrunch, The Information verify numbers; fabricated figures are rare to survive for mainstream tech press when the story is notable [M, practice]. Small trade press often runs releases unchecked.
- **Detection [design]:** inflated ARR/customer claims in a top-tier story: ~65% challenged before publication (asks for screenshot/Stripe proof/customer name); in trade press ~10%. After publication, short-seller/competitor/ex-employee corrections can follow (Forbes/Bloomberg exposés of inflated startups) at ~10-20%/yr for high-profile companies.
- **Consequence:** story pulled or softened; correction/retraction (permanent record); investor and customer fallout; possible securities-fraud exposure if tied to fundraising (see sibling doc).
- **Honest pass:** share verifiable figures, off-record vs on-record clarity, supply customer contacts, round numbers with stated definitions (ARR vs MRR x 12).

### 4.2 Embargo breaks
- Embargoed information given to reporters is honoured by convention; breaking one (by the reporter) or leaking early (by you) damages relationships; outlets can blacklist sources that jump embargo or promise "exclusive" to several [M].
- **Consequence [design]:** double-promised exclusive: 70% chance the second outlet finds out; the burned journalist ignores pitches for 6-12 months (relationship penalty -0.5 trust).
- **Honest pass:** one exclusive, clear date/time/time zone, brief with data room.

### 4.3 Awards and "best of" lists pay-to-play
- Many awards (e.g., "Top 100 startups", "Inc"-style paid lists, "Best of" badges) are pay-to-enter or pay-to-feature; the FTC treats endorsement-like badges the same as testimonials: paid placements must be disclosed and not misrepresent (2.2) [M]. Real value: close to zero in B2B buyer decisions apart from G2/Gartner/Forrester recognition [design].
- **Detection [design]:** buyers/journalists recognise pay-to-play ~50%; reputational cost small but nonzero; money spent $500-$15k and 5-15 h.
- **Honest pass:** use awards sparingly, state who awarded and the basis.

---

## 5. Hiring and employees

### 5.1 Reference checks and backchannels (both directions)
- **Candidate -> founder (the missing check in most games):** candidates check Glassdoor/Blind/LinkedIn for former employees, ask about runway, last round, cap table/option terms, and talk to current team. Senior hires ask about burn, runway months and investor names; evasive founders lose offers [M, practice]. Glassdoor/Blind reviews of small startups can be removed only if they violate guidelines.
- **Founder -> candidate:** structured reference calls (2-3 references with at least one manager), backchannel via shared contacts; resume fraud estimated at 30-50% inaccuracies in various vendor surveys [unverified]; references catch behavioural issues about 40% of the time [design].
- **Cost:** 1-2 h per candidate reference round; backchannel is free but risks bias.
- **Consequence of skipping:** bad hire costs 1-3x salary in time and churn [M, commonly quoted; Dept of Labor 30% of first-year earnings is a widely cited but unverified]; of lying to candidates: early attrition within 6 months (design 50% of misled hires), bad Glassdoor posts, offer reneging.
- **Honest pass:** transparent runway/equity numbers (offer letter with strike price, share count, % ownership, latest 409A).

### 5.2 Background checks and FCRA
- US employers using third-party background checks must give a standalone disclosure, get written authorization, and run the pre-adverse and adverse action process (copy of report + summary of rights, reasonable wait typically 5 business days) under FCRA [M]; state "ban-the-box"/fair chance laws (e.g., California, NYC) add steps. Turnaround 1-5 business days for criminal/identity; education 2-7 days; fee $30-100 per check [M/typical]. Noncompliance: class actions with statutory damages $100-$1,000 per consumer + punitive [M].
- **Catches:** identity, criminal record, employment/education falsification. **Misses:** non-US history, recent offences, dishonest-but-clean candidates.
- **Detection [design]:** falsified degree/employer: 80% caught when verified; only about 20% of early-stage hires are verified.
- **Honest pass:** use a compliant vendor, run only job-relevant checks, follow adverse action steps.

### 5.3 Credential verification and work samples / trials
- Credential verification (National Student Clearinghouse for degrees, license boards) is cheap; work samples/paid trials directly test skill (strongest predictors of job performance in selection research; structured interviews and work samples about r=0.5 [M, Schmidt & Hunter-based, updated Sackett 2022]).
- **Cost:** paid trial 4-20 h of candidate time at $50-150/h and 2-6 founder hours; unpaid long take-homes are unfair and increase dropout (design). AI-era: take-homes can be AI-completed, so live pairing session needed [design].
- **Detection of skill gaps [design]:** work sample catches 70% of weak engineers vs 25% for resume + casual interview. This is the main separator between stellar and mediocre hiring operators.
- See founder-hiring-interviews skill.

### 5.4 I-9 / E-Verify
- Employer completes Form I-9 within 3 business days of start (employee Section 1 by day one) and retains it (3 years after hire or 1 year after termination, whichever later); ICE audits via Notice of Inspection with 3 business days to produce forms; paperwork penalties per form roughly $288 to $2,861 (2025 adjusted) and knowing-hire penalties are higher [M]. E-Verify mandatory in some states (e.g., Florida for 25+ employees, as of 2023 [M]) and for federal contractors.
- **Detection [design]:** audit odds 0.5-1%/yr for small firms; errors found on 50-70% of forms when audited (common errors).
- **Consequence:** fines in the thousands to tens of thousands; no-match letters; remote-hire complexities (remote document verification only if E-Verify-enrolled).
- **Honest pass:** I-9 within 3 days, calendar for reverification, remote hires via authorized rep.

### 5.5 Misclassification (contractor vs employee): IRS, state, DOL
- Tests: IRS common-law (behavioral/financial/relationship), DOL economic-reality (the 2024 six-factor rule; on 1 May 2025 the DOL stopped applying it in WHD investigations and reverted to the 2008 Fact Sheet #13/2019 opinion letter, but the 2024 rule still applies in private lawsuits and is under reconsideration) **[S: ASA, GB Law, Whiteford, OneDigital]**; ABC test in California (AB5), Massachusetts, New Jersey etc. [M].
- **Triggers:** unemployment claim by the contractor (most common), workplace injury, IRS Form SS-8 filing, state audit, payroll audit; detection about 1-3%/yr per misclassified worker but rises sharply when a contractor files for unemployment or leaves angry [design from M].
- **Consequence:** back payroll taxes (employer + employee share, IRC 3509 reduced rates for non-intentional cases), penalties and interest, unpaid overtime/minimum wage, state penalties (California up to $5k-$25k per violation for willful [M]), benefits claims, and equity/IP complications. Typical cost to fix: 20-40% of contractor pay plus legal fees [design].
- **Honest pass:** clean contractor agreements (project-based, own tools, multiple clients), use EOR (Deel/Remote) for foreign long-term workers, convert full-time roles to W-2. Founder cost: payroll setup 4-10 h and 25-40% more total compensation burden.

### 5.6 Wage and hour
- FLSA overtime and minimum wage; state meal/rest and pay-frequency rules; exempt classification depends on salary threshold (federal $684/week after the 2024 rules were vacated in Nov 2024 [M]; state thresholds higher, e.g., California ~$68k in 2025 [M]) and duties. Detection: employee complaints to DOL/state labor boards, class/collective actions; consequences back wages + equal liquidated damages + attorney fees [M]. Detection [design]: 2-4%/yr for small firms with non-exempt workers paid salary with no tracking.

### 5.7 Non-competes
- FTC Non-Compete Rule was set aside nationwide (Ryan LLC v. FTC, N.D. Tex., Aug 2024) and the FTC abandoned its appeal in Sept 2025, shifting to case-by-case enforcement [M, to be verified]. States: California, Minnesota, North Dakota, Oklahoma (and others increasingly) void non-competes; many states cap or require notice/consideration [M].
- **Effect on game:** non-competes largely unenforceable for early-stage startups; use NDAs, non-solicit, CIIAA instead. Overreaching non-compete clauses can taint offers and be used against the company (some states penalize).
- **Detection/enforcement [design]:** rarely enforced by an early startup (cost $20-100k in litigation).

### 5.8 IP assignment and invention disclosure
- Without a signed CIIAA (Confidential Information and Invention Assignment Agreement), a contractor or employee's work may not belong to the company (contractor IP is owned by the creator under copyright law unless assigned in writing; work-made-for-hire for contractors applies only to certain categories) [M]. Investors, acquirers and enterprise buyers ask for IP chain-of-title in diligence; missing assignments trigger "cure" letters or deal delays [M].
- **Detection [design]:** at financing/M&A diligence 85% found if missing; otherwise invisible until dispute (ex-contractor claim) ~2%/yr.
- **Consequence:** fix cost: re-paper with consideration ($500-$5,000/person or equity); deal slip 2-6 weeks; worst-case ownership dispute.
- **Honest pass:** CIIAA on day one for everyone including co-founders; prior-invention schedule.

### 5.9 Equity: 409A, option paperwork
- Option strike price must be at least FMV; a 409A valuation (independent, ~$1.5-5k early stage; valid 12 months or until a material event such as a priced round) gives safe harbor; missing/stale 409A leads to discounted options being taxed at vesting plus 20% additional federal tax and premium interest (+ California 5%) on the employee [M]. Board approval of grants, Section 83(b) for early-exercise/restricted stock, Rule 701 limits, state blue-sky filings [M].
- **Detection [design]:** at financing or acquisition diligence ~80% found; IRS audit odds low (~1%/yr) but impact lands on employees, producing trust damage.
- **Honest pass:** 409A before first grant, board consent, grant paperwork within 30 days, clear communication on vesting and strike.

### 5.10 Co-founder protections: vesting, cliff, 83(b), founder agreement
- Standard: 4-year vesting, 1-year cliff, monthly thereafter, with acceleration negotiated; 83(b) election must be filed with the IRS within **30 days** of stock grant and cannot be extended; missing it can create ordinary income tax as the stock vests at higher value [M, IRC 83(b); Clerky/Stripe Atlas guidance].
- Founder agreement (roles, IP, decision rights, buy-back, leaver terms) prevents deadlock; investors will require vesting at the seed if not already in place (resetting vesting is common) [M].
- **Detection [design]:** missing 83(b) emerges at diligence (70%) or at tax time; unvested equity disputes at departure: ~35% of co-founder breakups within 4 years [unverified, widely quoted; Noam Wasserman's research finds roughly 65% of high-potential startup failures cite team conflict; verify before use].
- **Consequence:** fixing costs lawyer time $1-5k and potential tax; no vesting means a departed co-founder keeps full equity ("dead equity"), harming fundraising.
- **Honest pass:** vest from day one, file 83(b) with certified mail and proof, written agreement.

---

## 6. Legal / IP and compliance

### 6.1 Trademark search and opposition
- Clearance search before adopting a name (USPTO TESS replaced by Trademark Search; common-law and state, domain, app stores). USPTO application ($350 per class base fee since Jan 2025 [M]) - first examiner action roughly 6-8 months after filing; publication then 30-day opposition window (extendable up to 180 days); registration ~12-18 months total if unopposed [M]. Likelihood-of-confusion refusals (Section 2(d)) are the common block.
- **Detection [design]:** infringement claim against a conflicting-name small SaaS: ~10-15% within 3 years if same class/overlapping market; cease-and-desist letter from a larger incumbent triggers rebrand cost of $10-60k + SEO/brand loss.
- **Opposition/cancellation:** TTAB proceedings 2-3 years, $50-150k [M]. 
- **Honest pass:** knockout search, attorney search for core mark, file ITU early, avoid descriptive/generic names.

### 6.2 Open-source license compliance in diligence
- Enterprise buyers and acquirers run SCA scans (Black Duck, FOSSA, Snyk) and ask for SBOMs; red flags: AGPL/GPL in distributed or network-served code, missing notices, license-incompatible combos [M]. Enterprise customers increasingly request SBOMs (EO 14028 and EU CRA, in force with reporting obligations from Sept 2026 and full application Dec 2027 [M, verify]).
- **Detection [design]:** at M&A / Series A diligence 90% found if present; at enterprise sales 15% (SBOM requests). 
- **Consequence:** rewrite/replace the component (1-8 weeks founder-eng time), indemnity escrow, price chip, rarely litigation (SFC, others).
- **Honest pass:** dependency policy, license allowlist, auto-scan in CI (1-2 h setup).

### 6.3 Privacy regulators: GDPR DPAs, CCPA/CPRA
- GDPR: fines up to €20M or 4% of global turnover; DLA Piper Jan 2026 survey: about €1.2B in fines in 2025 (flat vs 2024), cumulative €7.1B since May 2018, 443 breach notifications per day (+22%) across 31 countries, Irish DPC largest fine in 2025 (€530M social platform) **[S: DLA Piper survey, Jan 2026]**. Small companies mostly face warnings, orders and fines of thousands to hundreds of thousands (Art. 83 considers size); enforcement is complaint-driven (e.g., noyb) [M].
- CCPA/CPRA: administrative fines per violation $2,663 / $7,988 for intentional or minors' data (2025 CPI-adjusted) [M]; CPPA and AG enforcement actions grew 2024-2026 (e.g., Honda, Todd Snyder, Healthline settlements [M]); right-to-delete/opt-out signals (GPC) required [M].
- **Detection [design]:** small SaaS with proper privacy policy and DPA: <1%/yr; missing cookie consent and trackers in the EU: 2-4%/yr via complaint or automated scans; a breach multiplies this 10x.
- **Consequence:** corrective orders, fines, mandatory audit, customer DPAs flow-down liabilities; enterprise deals blocked by lack of DPA/SCCs (more likely than fines).
- **Honest pass:** privacy policy that matches reality, data inventory, DSAR process (30-45 days to answer), DPA/SCC templates, subprocessors list.

### 6.4 Data breach notification
- US: all 50 states have breach laws (timelines 30-60 days or "without unreasonable delay"; some AG notification thresholds) [M]; GDPR: notify DPA within 72 hours of awareness, individuals without undue delay if high risk [M]; HIPAA/BAAs: 60 days (customers' contracts often require 24-72 h) [M]; SEC 4-business-day rule applies only to public companies [M].
- **Detection:** breaches are discovered via the attacker's ransom note, customers, researchers or monitoring; concealing is itself a violation and scandal driver (Uber 2022 criminal conviction of CSO [M]).
- **Detection of concealment [design]:** 50% eventually surfaces via the attacker or customer logs; consequence multiplier 3-5x on top of breach cost.
- **Cost:** forensic firm $20-100k, legal $10-50k, notification and credit monitoring; 20-60 founder-hours in the first week; customer churn and contractual indemnities [design/typical]. IBM Cost of a Data Breach ~ $4.4M global average 2025 [M, unverified for small SaaS].
- **Honest pass:** incident response plan, logging, cyber insurance (also gives breach coach), prompt honest notices; honest handling often retains customers.

### 6.5 Export controls and sanctions screening
- OFAC (strict liability; civil penalties up to about $377k per violation or twice the transaction value, adjusted yearly [M]) and BIS EAR (encryption items: mass-market SaaS usually EAR99 or 5D992 with self-classification; US-embargoed regions Cuba, Iran, North Korea, Syria, Crimea/DNR/LNR regions). Check: IP geoblocking, customer name screening against SDN/Consolidated lists (tools $0-$500/month), payment processors screen automatically (Stripe) and may freeze payouts [M].
- **Detection [design]:** processor-level screening catches ~70% of SDN-hit payments; OFAC enforcement against tiny SaaS ~0.5%/yr but voluntary self-disclosure cuts penalties ~50% [M, base penalty halving].
- **Consequence:** frozen funds, penalties, account termination from cloud provider/processor.
- **Honest pass:** block sanctioned geos, screen enterprise and reseller customers, keep logs; cost 2-6 h setup.

### 6.6 EU AI Act
- In force Aug 2024; prohibitions and AI-literacy duties since Feb 2025; GPAI obligations since Aug 2025; the Digital Omnibus provisional agreement (May 2026) postpones high-risk Annex III obligations from 2 Aug 2026 to 2 Dec 2027 and Annex I product-embedded to 2 Aug 2028; transparency (labeling/watermarking) obligations for systems already on market have until 2 Dec 2026; formal publication in the Official Journal must be confirmed **[S: Gibson Dunn, OneTrust, CASRAI]**. Fines up to €35M or 7% for prohibited practices; €15M/3% for most other obligations; lower for SMEs (the lesser of the two caps) [M].
- **Enforcement path:** national market surveillance authorities; early on guided by complaints; B2B buyers ask for AI Act classification statements and usage policy in questionnaires [design/unverified].
- **Detection [design]:** formal enforcement against small non-EU SaaS in 2026: ~0.5%/yr; but buyer questionnaires (1.1) and procurement make it a de facto check (30% of EU enterprise questionnaires ask).
- **Honest pass:** AI use inventory, risk classification, human oversight, disclosure of AI interactions, vendor model cards; 8-20 h setup.

---

## Cross-cutting game rules (suggested)
1. **Claim ledger:** every public/sales/marketing claim carries a `truth` score (0-1) and `evidence` flag. Checks sample claims, not the whole ledger; detection prob = base x (1 - truth) x rigor(check).
2. **Delay not instant:** consequences enter a queue (discovery lag + resolution time) so cheating pays short-term and costs later, traceable via ledger entries ("lost deal X because claim C").
3. **Honest path is cheaper over time:** prebuilt artifacts (trust center, claims file, CIIAA, 409A, DPA) amortise: first use costs hours; reuse nearly free.
4. **Rigor is tiered by buyer/regulator size:** SMB buyers rarely check (low detection, low reward), enterprise checks everything (high detection, high ACV). Tier separation: stellar operators pre-build evidence, mediocre ones scramble, cheaters pay once caught.
5. **Reputation graph:** being caught in a niche spreads (flag on vertical/network) with decay over 6-18 months.

---

## Summary table

| Mechanism | Stage / timing | Detection odds | Consequence | Game parameter suggestions |
|---|---|---|---|---|
| Security questionnaire + SOC 2 report request | Late-stage gate, 1-4 wks | False SOC 2 claim 90% (ent) / 25% (SMB); overstated control 25% | Deal lost, flagged in VRM, warranty exposure | `secQ.hours` 8-20 first / 1-3 reuse; `soc2Claim.catchEnt=.9`; stall 7-28 days |
| Vendor risk platform scan | Pre-signature + continuous | 70% ent / 10% SMB for external hygiene | Remediation 30-90 d, offboard at renewal | `vrm.score`; fix 2-6 h |
| Reference calls | Shortlist/final, 20-30 min | Fake logo 50%; weak reference leak 40% | Lost deal; niche word-of-mouth | `ref.pool` size; trust -0.2 per lukewarm call |
| PoC / pilot | 2-8 wks (mid) to 6 mo (ent) | 0.8 x gap x rigor (up to ~80%) | Deal lost, 20-80 h sunk; hacked demo leads to churn later | `poc.hours` 20-80; paid-pilot filter |
| Procurement + legal | 2-8 wks mid, 3-6 mo ent | Missing documents ~100% | Stall, concessions (caps, MFN) | `legal.days`, `insurance.required`; $2-10k legal |
| Warranties/indemnity | After dispute, 3-18 mo | Claim asserted 35% (small ACV) / 70% (large) | Refund 12 mo fees, fees $10-50k, fraud uncapped | `warranty.claimProb`; refund ledger |
| Churn/refund from overselling | Day 30-90, renewal | ~100% eventual | Refunds, discounts, bad reviews | `soldVsDelivered` gap drives early churn hazard |
| Review-site verification | 2-5 d moderation; 90 d sweeps | Fake batch removed 60%, penalised 25% | Badge/profile penalty + FTC exposure | `reviews.real` vs `fake`; ask rate |
| FTC fake-review rule | Complaint/sweep, 6-24 mo | 3%/yr small, 25%/yr systematic | ~$52k/violation, consent order, $50-250k legal | `ftc.fakeReview.p`; fine per count |
| Influencer disclosure / substantiation / NAD | Post-launch, 60-90 d NAD | 1-2%/post; 2%/yr claims | Takedown, order, brand damage | claims-file bonus |
| Dark patterns / ROSCA / auto-renewal | Complaints, AG, class action | 2-4%/yr, 15% with high complaints | Full refunds + penalties (Amazon $2.5B scale), state fines | `cancelFriction` raises chargebacks and enforcement hazard |
| Class actions (pixels, ADA, TCPA) | Demand letter, any time | 8-15%/yr risky site | $25-150k settle/defend | consent banner flag |
| App-store review | Days; 2-14 d per rejection | 50% misleading metadata; 1-2% termination | Delay, resubmits, termination | `appReview.days` |
| Chargebacks | 120-540 d window | Automatic, ratio-based | $15-25 fee each, reserves, termination at 1.5%+ | `chargebackRatio` thresholds 0.9/1.5% |
| Ad review + account bans | Minutes-24 h; later sampling | 60% disapproved, 35% account ban if repeat | Lost 1-3 wk, pixel history | `adRisk.claimGap`; appeal 2-21 d |
| Email deliverability (Gmail/Yahoo/MS) | Continuous; weeks to recover | Automatic | Spam-foldering, 4-12 wk rebuild | complaint >0.3% triggers throttle; domain rep state |
| CAN-SPAM/GDPR/CASL | Complaint-driven | <1%/yr regulators | Letters, rare fines; ESP suspension | `coldEmail.legalBasis` flag |
| LinkedIn automation | Behavioural, weekly | 30%/wk at >100 invites/day | 3-14 day restriction; permanent ban | daily cap 20-25 safe |
| HN/Reddit/PH vote manipulation | Hours-days | 60-70% | Post killed, domain/account ban, callout | one-shot launch window flag |
| Marketplace security/app reviews | 1-8 wks, resubmit loops | 70-85% | Rejection, delisting; fee $2,700 AppExchange | `market.review.days`, `fee` |
| Journalist fact-check / retraction | Pre-publication; post-hoc | Top-tier 65%, trade 10% | Pulled story, correction, investor fallout | claim verifiability; relationship trust |
| Embargo break / double exclusive | Day of | 70% | Burned journalist 6-12 mo | `press.trust` |
| Pay-to-play awards | Immediate | 50% recognised | Small rep cost, $0.5-15k wasted | low value factor |
| Candidate backchannels / Glassdoor | Offer stage | High for senior hires | Offer declined, early attrition | runway disclosure honesty |
| Background check/FCRA | Offer stage, 1-7 d | 80% if verified | FCRA class action $100-1,000 per person if botched | process compliance flag |
| Work sample / trial | Interview | 70% weak hires caught vs 25% | Bad hire 1-3x salary | `hire.method` tiers |
| I-9/E-Verify | Day 1-3; ICE audits | 0.5-1%/yr audit; 50-70% errors | $288-$2,861 per form + | `i9.done` |
| Misclassification (IRS/state/DOL) | Trigger events | 1-3%/yr; spikes on UI claim | Back taxes + penalties 20-40% of pay | `contractor.fullTime` hazard |
| Wage and hour | Complaints | 2-4%/yr | Back wages x2 + fees | exempt/overtime tracking |
| Non-competes | Departure | Rarely enforced | Unenforceable CA etc.; litigation $20-100k | use CIIAA/non-solicit |
| IP assignment (CIIAA) | Diligence | 85% found at diligence | Re-paper $0.5-5k, deal slip 2-6 wks | `ciiaa.signed` |
| 409A/option paperwork | Pre-grant; diligence | 80% at diligence | 20% extra tax on holders, trust loss | `409a.date` expiry 12 mo / round |
| Vesting/83(b)/founder agreement | 30-day 83(b) deadline | 70% at diligence | Tax bill, dead equity | `83b.filed` flag |
| Trademark | 6-8 mo exam, 30 d opposition | 10-15%/3yr conflict | Rebrand $10-60k | `tm.search` quality |
| OSS license compliance | Diligence / SBOM request | 90% (M&A), 15% (sales) | Rewrite 1-8 wks, price chip | `oss.scan` flag |
| GDPR/CCPA regulators | Complaint-driven | <1%/yr clean; 2-4% sloppy; x10 after breach | Orders, fines, blocked deals | `privacy.complete` |
| Breach notification | 72 h GDPR; 30-60 d US | Concealment surfaces 50% | 3-5x cost multiplier; forensic $20-100k | `breach.disclosedOnTime` |
| Export/sanctions screening | Signup / payment | 70% by processor | Funds frozen, penalties | geo-block flag |
| EU AI Act | 2025-2028 phases | 0.5%/yr formal; 30% via questionnaires | Fines up to 7%; lost EU deals | `aiAct.classified` |

## Ten most important for a SaaS-founder game
1. **PoC / pilot testing claims** (strongest claim-vs-reality blocker; delayed churn if it is gamed).
2. **Security questionnaire + SOC 2 report request** (binary gate at enterprise, huge time sink).
3. **Overselling -> churn/refund ledger** (traceable cost of every sales promise).
4. **Email deliverability + domain reputation + unsubscribe/complaint thresholds** (burns lists, 4-12 week recovery).
5. **Ad review and account bans** (lost learning/pixel history; platform dependence).
6. **FTC fake reviews + review-site moderation** (fines scale per violation; real separation between ask-all and buy).
7. **Dark patterns / ROSCA / chargebacks** (short-term MRR vs refunds, reserves, processor termination).
8. **Misclassification + I-9/payroll basics + CIIAA/IP chain** (silent liabilities triggered by events and diligence).
9. **409A / 83(b) / vesting** (diligence-time reveal, tax impact, dead equity).
10. **Privacy/breach notification (GDPR 72 h, DPA for B2B) and concealment penalty** (breach cost multiplied by hiding).

Honourable mentions: marketplace security reviews (AppExchange $2,700), LinkedIn automation limits, HN/PH vote rings, trademark conflict, candidate backchannels on runway.

---

## Sources (fetched/searched this session)
- FTC fake reviews rule: https://wsgr.com/en/insights/ftc-issues-final-rule-banning-fake-and-misleading-consumer-reviews-and-testimonials.html ; https://dwt.com/insights/2024/08/ftc-finalizes-rule-banning-fake-consumer-reviews ; https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/ftc-finalizes-rule-on-fake-reviews
- Click-to-cancel vacated; Amazon ROSCA: https://www.gtlaw.com/en/insights/2025/7/eighth-circuit-vacates-ftcs-click-to-cancel-rule ; https://www.goodwinlaw.com/en/insights/blogs/2025/09/ftc-settles-with-amazon-over-enrollment-and-cancellation-processes-for-prime-memberships ; https://www.jurist.org/news/2025/09/ftc-settles-amazon-prime-deceptive-practices-suit-for-2-5b/
- Gmail/Yahoo bulk sender rules (vendor summaries; check official): https://bird.com/docs/knowledge-base/deliverability/gmail-yahoo-requirements ; https://www.sender.net/help/deliverability-compliance/gmail-and-yahoo-sender-rules/
- Salesforce AppExchange fees: https://developer.salesforce.com/docs/atlas.en-us.244.0.packagingGuide.meta/packagingGuide/security_review_fees.htm
- DOL contractor enforcement pause: https://www.gblaw.com/legal-alert-dol_pauses_enforcement_of_2024_independent_contractor_rule_amid_ongoing_review/ ; https://www.asaonline.com/2026/01/22/asa-monitors-dols-independent-contractor-rule-enforcement/
- GDPR fines 2025: https://www.dlapiper.com/en/insights/publications/2026/01/dla-piper-gdpr-fines-and-data-breach-survey-january-2026
- EU AI Act omnibus: https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/
- Google Ads misrepresentation: https://support.google.com/adspolicy/answer/6020955
- Security questionnaire effort (vendor blogs, weak): https://blog.procurize.ai/how-security-questionnaires-are-slowing-down-deals
- LinkedIn automation / Meta appeals: vendor blogs only [unverified].

Gaps to verify before hard-coding numbers: current CAN-SPAM and OFAC penalty figures, I-9 penalty range, Visa VAMP/Mastercard thresholds, Shopify/Chrome/ChatGPT/Claude directory review times, G2/Capterra verification policies, FTC non-compete appeal status, EU AI Act omnibus publication in the Official Journal, share of buyers requesting SOC 2.
