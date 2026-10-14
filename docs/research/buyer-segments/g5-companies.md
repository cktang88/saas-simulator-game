# G5 buyer segments: companies

Research notes for the founder simulator. Numbers are either cited (URL plus publication date where known; "retrieved 2026-10-14") or marked [design]. Many cited figures come through secondary aggregators and vendor blogs. Those are flagged "secondary, unverified." Where I could not find a primary source, the number is [design].

---

## Segment 1: E-commerce / DTC brands (Shopify ecosystem)

### 1. Size & examples
- Typical team: 1–50 people; many run on 1–5 staff plus agencies and freelancers [design].
- Typical revenue: $0.5M–$30M per year for brands selling through Shopify; the long tail is far smaller [design].
- Examples: a skincare brand, a supplement brand, a pet-food or apparel label, a home-goods store on Shopify Plus, and a multi-brand operator running several Shopify stores.
- Shopify's own partner blog says the ecosystem is large and that merchants need email, SMS, reviews, fulfillment and returns apps (https://www.shopify.com/partners/blog/opportunities-for-shopify-partners-in-2025, 2025). It gives no merchant counts.

### 2. Buying committee
- **User (marketing or ops lead, or the founder):** 1–2 people; titles like "Head of Growth," "Marketing Manager," "Ops Manager." Influence 0.5. Concerns: setup time, whether it breaks the theme or slows the store, what it does to the rest of the stack (Klaviyo, Recharge, Triple Whale). Can block: no. Present: daily.
- **Champion (often the founder or the ops lead):** 1. Influence 0.6. Concern: ROI in plain numbers.
- **Economic buyer / signer (founder or owner):** 1. Influence 0.9. Concern: monthly cost versus revenue and the cash cushion. Can block: yes. Present: at signing. The founder usually also champions the purchase.
- **Agency or freelance partner (paid media, email, CRO):** 0–2. Influence 0.5–0.7 [design]. Often installs or recommends apps for the client, and sometimes sets up the account. Can block: yes, by refusing to support the app.
- **Shopify Plus developer or theme partner:** 0–1 for larger brands. Influence 0.4. Concern: conflicts with theme code and checkout extensibility. Can block: yes.
- **Finance (bookkeeper or fractional CFO):** 0–1. Influence 0.2–0.3. Concern: clean invoices and chargeable sales tax. Can block: rarely.
- **Spouse or co-owner:** common at very small brands, where the decision is a household one [design]. Influence 0.3. Can block: rarely.
- Buyer is not the user in roughly 30–50% of purchases. It is higher when an agency or developer is involved [design].

### 3. Cycle & deal size
- Most purchases are self-serve through the Shopify App Store, with a free trial and a monthly plan billed on the merchant's Shopify invoice. The sale is closed in-product, not in a sales cycle.
- <$5k annual (typically $10–$100/month): same day to 14 days from install to paid [design].
- $5–25k: 14–45 days [design]. This tier is usually an agency or larger brand adding a higher-tier plan.
- $25–100k: 45–120 days [design]. Rare in this segment.
- >$100k: 120–270 days [design]. Enterprise-scale Plus brands only.
- Anchors: Boomerang's 2026 glossary gives 30–60 days for SMB deals under $25k ACV (secondary, unverified; https://getboomerang.ai/glossaries/b2b-sales-cycle-benchmarks-2026). Optifai's 2026 study (N=939) gives 14–30 days under $15k (secondary; cited in the Prospeo write-up at https://prospeo.io/s/sales-cycle-example).
- Typical ACV a small vendor gets: $300–$3,000 per year [design].
- Win rate on qualified trials: 15–25% trial-to-paid, which is the general range in https://www.getmonetizely.com/articles/understanding-and-optimizing-trial-to-paid-conversion-rates-a-guide-for-saas-executives (secondary). The Shopify-specific rate is [design].

### 4. Procurement
- Payment: Shopify app billing on the merchant's Shopify invoice. There is no PO, no net-30 on app fees, and no P-card limit to consider [design]. Check Shopify's current app billing and revenue-share terms at partners.shopify.com before quoting them.
- Quote and RFP thresholds: none in practice.
- Fiscal year: most DTC brands use the calendar year. Budgets for the next peak season are set Aug–Oct [design].
- Paperwork: none for standard apps. Larger brands may ask for a W-9 for a vendor invoice, a DPA, and a security statement if the app touches customer PII (email, SMS, payment data). Shopify requires apps to pass its Built for Shopify criteria before the badge (https://shopify.dev/apps/launch/built-for-shopify/requirements, retrieved 2026-10-14). Storefront performance, Polaris adherence, webhooks and privacy handling are the review focus. The Shopify docs say the store rating is weighted to recent and useful reviews (https://shopify.dev/docs/apps/store/success/managing-app-reviews).
- No cooperative contracts, board approval, or insurance minimums apply.

### 5. Channels
- **Works:** the Shopify App Store listing itself (search and reviews drive most installs [design]); integrations with Klaviyo, Recharge, Gorgias and other apps that already sit in the stack; Shopify agencies and freelancers; Shopify partner and creator content on YouTube; Reddit (r/shopify, r/ecommerce) and Facebook merchant groups where answers are given for free; podcasts aimed at operators; affiliate or referral programs.
- **Fails:** cold email to founders with generic pitches (low response [design]); LinkedIn outreach; trade shows (high cost, few small brands); paid ads for a low-ACV app.
- Best times: weekday mornings in US time zones [design]. Avoid Nov–Dec, when merchants freeze changes ahead of Black Friday–Cyber Monday [design].
- Tech-savviness: medium to high for operators, low for founders who ran the shop themselves [design].

### 6. Methodology
- Value selling with a simple ROI calculation, plus a light mutual action plan. BANT-lite is enough at this ACV.
- Critical elements: the pain in dollars (ad spend wasted, hours per week, churn rate), the current stack, a free-trial path that proves value in the first session, and the decision date (whether it is before peak season).
- MEDDPICC is overkill below $25k. Use it only for agencies or Plus brands that look like bigger deals.

### 7. Scenarios
1. **Buyer is an agency, not the merchant (~35%) [design].** The agency says yes, then stops responding once the client goes live. Handle: give the agency a client-facing report and a rev-share or agency plan, and ask for a reference client.
2. **Bottom-up install, then uninstall after the trial (~40%) [design].** Handle: send an onboarding sequence keyed to the first meaningful event (first order synced, first flow sent). Ask for a 15-minute setup call on day 3.
3. **Shopify Plus partner blocks the app (~10%) [design].** Handle: send the partner a technical summary, a sandbox, and a list of theme-safe install steps.
4. **Peak-season freeze (Oct–Dec) (~high probability every year) [design].** Handle: stop outreach before Black Friday, offer a Jan–Feb rebuild plan, and do not push a switch during the freeze.
5. **Merchant asks for a Built-for-Shopify badge or a review count before buying.** Handle: offer a 30-day success guarantee and a visible changelog. Ask 5 happy merchants for reviews, without incentives.
6. **Competitor app is free or bundled [design].** Handle: show the cost of the free app's limits (volume caps, branding, support SLA) with real numbers.

### 8. Common objections
- "We already use Klaviyo for this." Reply: "Which flows are you running in Klaviyo today? Here is the one gap that costs you money."
- "I don't want another monthly fee." Reply: "What does one win-back flow recover per month? If it is under the fee, don't buy it."
- "Will it slow down my store?" Reply: "Here is our storefront impact measurement and a staging test you can run in 10 minutes."
- "We've got a developer. Let them decide." Reply: "Happy to send your developer the integration doc and a test store."

### 9. Churn & seasonality
- Annual logo churn for small merchant apps: 25–40% [design]. Store closures and tool consolidation drive most of it.
- Renewal is monthly or annual. Monthly churn of 3–6% is common for small merchants [design].
- Busy months for installs: January to March (new-year planning) and late August to September (pre-peak prep) [design]. Slow months: November to December (freeze).

### 10. Solo-founder fit
Score: **0.8.** A Shopify app built by one or two people is a classic fit. The App Store does the selling, and support can run on docs and a chat widget. The constraint is that Built for Shopify review and performance rules take real engineering time.

### 11. Sources
- https://www.shopify.com/partners/blog/opportunities-for-shopify-partners-in-2025 (2025, retrieved 2026-10-14)
- https://shopify.dev/apps/launch/built-for-shopify/requirements (retrieved 2026-10-14)
- https://shopify.dev/docs/apps/store/success/managing-app-reviews (retrieved 2026-10-14)
- https://help.shopify.com/en/manual/apps/choosing-apps (retrieved 2026-10-14)
- https://getboomerang.ai/glossaries/b2b-sales-cycle-benchmarks-2026 (2026, secondary)
- https://www.getmonetizely.com/articles/understanding-and-optimizing-trial-to-paid-conversion-rates-a-guide-for-saas-executives (secondary)
- https://pier39.ai/blog/posts/the-2025-dtc-landscape-9-trends-shopify-brands-cant-ignore (2025, secondary)

---

## Segment 2: Startups and tech SMBs (10–100 employees, PLG and self-serve)

### 1. Size & examples
- Team: 10–100 employees, with ARR roughly $1M–$20M [design].
- Examples: a Series A dev-tools company, a 40-person fintech, a remote-first agency, a B2B marketplace with a 30-person ops team, and a mid-size SaaS with 60 staff.
- The aggregator figure for "1–50 employees" SMB churn (ChartMogul 2025, as relayed secondhand) is the closest sourcing for this band. See section 9.

### 2. Buying committee
- **User (engineer, PM, ops or marketing manager):** 2–10 people. Influence 0.4. Concern: does it work and how fast can they start. Can block: no. Present: daily.
- **Champion (team lead or head of function):** 1. Influence 0.6. Concern: the team's own budget and pain. Present: most of the cycle.
- **Economic buyer (founder, CEO, or VP Eng):** 1. Influence 0.8–0.9. Concern: burn, headcount vs tooling, and whether the tool stays up. Can block: yes. Present: at signing above $5k.
- **IT or security:** 0–1, often the head of engineering, an outsourced IT provider, or a compliance lead using Vanta or Drata. Influence 0.5 when customer data is involved. Concern: SSO, SOC 2 status, data residency. Can block: yes, more often than the buyer expects.
- **Finance (part-time controller, bookkeeper, or fractional CFO):** 0–1. Influence 0.3. Can block: rarely, except at $25k+ and for annual prepay.
- **Legal:** 0–1, usually the founder reviewing a short order form. Influence 0.2. Can block: at $25k+ or when a DPA is needed.
- **Board or investors:** rare under $50k. Influence 0.3 at that level [design].
- The buyer is not the user in roughly 30–40% of deals [design], most often at $5k+.

### 3. Cycle & deal size
- <$5k: same day to 14 days, self-serve or card. Median about 1 day for PLG [design].
- $5–25k: 14–45 days [design]. Usually a champion plus a founder sign-off.
- $25–100k: 45–90 days [design]. Security review and DPA appear here.
- >$100k: 90–150 days [design]. Rare for this segment.
- Anchors: Webtonic cites Ebsta and Pavilion's 2025 GTM benchmarks at 91 days average for new business and 52 days for expansion (secondary, unverified; https://www.webtonic.io/blog/average-sales-cycle-length-by-industry). The Starr Conspiracy page cites an 84-day median for >$100k deals (https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025; attribution inconsistent with other pages).
- Typical ACV a small vendor gets: $3k–$30k [design].
- Win rate on qualified opportunities: 20–30% [design]. Self-serve trial-to-paid: 15–25% is typical (https://userpilot.com/blog/saas-conversion-rate/, secondary). Credit-card-required trials convert higher; figures range from 35–60% depending on source (secondary).

### 4. Procurement
- Corporate card or Ramp/Brex: the usual path under $5k. Per-transaction limits are often $1k–$10k [design]. Ramp's own policy examples are auto-approve under $1,000, manager approval at $1k–$5k, and director approval over $5k (https://ramp.com/answers/policy-enforcement/policy-rules-interact-with-spend-limits, undated; treat as an example configuration, not a survey).
- Quotes: one quote is enough below $10k. Three quotes are often asked for at $25k+ [design].
- RFP: almost never. Board approval: only for multi-year or large commitments, above $100k [design].
- Fiscal year: calendar year for most; budgets set in Nov–Jan [design].
- Payment terms: card, or annual invoice net-30. Net-45 is occasionally requested [design].
- Paperwork: W-9 (often requested before first invoice); COI at $25k+ (general liability, $1M–$2M typical [design]); SOC 2 Type II or Type I at $25k+ (secondary indicator: about a third of organizations report losing a deal over a missing certification, unverified: https://www.vanta.com/ via the DEV Community write-up at https://dev.to/instasla/how-to-use-vulnerability-sla-compliance-to-win-enterprise-b2b-deals-32fb); DPA, a lightweight security questionnaire (CAIQ-lite or a SIG Lite-style sheet), and an MSA or order form.

### 5. Channels
- **Works:** product-led growth with a free tier or trial; in-product upgrade prompts; Product Hunt and Hacker News Show HN launches; founder-led content on X, LinkedIn and blogs; communities (Slack groups, Reddit subreddits); integration listings (Zapier, Slack, GitHub Marketplace); referrals from users who are themselves founders; G2 and Capterra reviews.
- **Fails:** cold calls to founders; broad outbound at under $5k ACV; paid display ads without a clear value message.
- Best times: Tuesday to Thursday, 8–10am local time [design].
- Tech-savviness: high. Expect trials, docs, and a self-serve signup flow.

### 6. Methodology
- Product-qualified lead (PQL) first, then a short value conversation. For $5k+, use MEDDPICC-lite: Metrics, Economic buyer, Decision process, Champion, Pain. Add paper process once security or DPA appears.
- Challenger works for the $25k+ deals where the buyer needs a new view of their cost of doing nothing [design].
- Critical elements: the champion, the pain in dollars, the decision date, and the paper process. Without a named champion, the deal is not qualified.

### 7. Scenarios
1. **Bottom-up adoption of a free tier, then a team wants a paid upgrade (~40%) [design].** Handle: find the admin or budget owner from usage data, then offer a sales-assist call and a team plan with SSO.
2. **Champion leaves in the middle of a $25k+ deal (~15–20%) [design].** Handle: map the other stakeholders during discovery; ask the economic buyer for a meeting in week one.
3. **Security questionnaire arrives for a $25k deal (~50%) [design].** Handle: have a standard security pack ready (SOC 2 status, policies, data flow). Answer within 2–3 days. Offer a call with the head of engineering.
4. **Corporate card blocked by a per-transaction limit (~20%) [design].** Handle: offer an annual invoice, net-30, with a W-9 and a short order form in the same email.
5. **Budget freeze or funding slowdown (~15%) [design].** Handle: propose a smaller plan or a 90-day pilot with a clear success metric. Do not discount without a commitment.
6. **Buyer is not the user; a finance manager asks for a three-quote comparison (~20%) [design].** Handle: send a compare-to-alternatives document with real numbers.

### 8. Common objections
- "We're fine on the free plan." Reply: "What breaks first when your team hits the free-tier limit? Here is the upgrade path with numbers."
- "Send us your SOC 2 report." Reply: "Here is our current status, the bridge letter, and a 20-minute call with our engineering lead."
- "We're cutting spend this quarter." Reply: "Would a 60-day pilot tied to one metric make the case for next quarter?"
- "Can we pay by invoice?" Reply: "Yes, net-30 on an annual invoice with a discount of 10–15% [design]."

### 9. Churn & seasonality
- SMB (1–50 employees) annual logo churn: 11–13% per ChartMogul 2025 as relayed by an aggregator (secondary, unverified; https://stealthagents.com/research/saas-churn-rate-statistics-2026). Another aggregator gives 10–14% (https://userjot.com/blog/saas-churn-rate-benchmarks, secondary).
- Gross revenue retention: 80–88% for SMB-focused SaaS (secondary; Benchmarkit median 88%, https://stealthagents.com/research/startup-gross-retention-benchmarks).
- Monthly contracts churn at roughly 3–5x the rate of annual contracts, per a Recurly 2025 figure relayed secondhand (unverified).
- Busy months: January–February (budget reset) and September–October (Q4 budgets) [design]. Slow months: late December and July–August [design].

### 10. Solo-founder fit
Score: **0.75** for the self-serve and PLG tier, **0.5** if the company has to run sales-assisted deals above $25k with security reviews. A small team can do PQL-led sales alone. Once the security questionnaire and DPA arrive, one person needs help, which usually means a compliance tool and a part-time sales hire.

### 11. Sources
- https://www.webtonic.io/blog/average-sales-cycle-length-by-industry (2025, secondary)
- https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025 (2025)
- https://www.thestarrconspiracy.com/insights/benchmarks/b2b-buying-committee-benchmarks-2025 (2025)
- https://getboomerang.ai/glossaries/b2b-sales-cycle-benchmarks-2026 (2026, secondary)
- https://ramp.com/answers/policy-enforcement/policy-rules-interact-with-spend-limits (undated)
- https://stealthagents.com/research/saas-churn-rate-statistics-2026 (2026, secondary)
- https://stealthagents.com/research/startup-gross-retention-benchmarks (2026, secondary)
- https://userjot.com/blog/saas-churn-rate-benchmarks (2025, secondary)
- https://userpilot.com/blog/saas-conversion-rate/ (secondary)
- https://www.getmonetizely.com/articles/understanding-and-optimizing-trial-to-paid-conversion-rates-a-guide-for-saas-executives (secondary)
- https://promise.legal/startup-central/procurement-questionnaire-standing-answer-vendors-sell-enterprise/ (retrieved 2026-10-14)

---

## Segment 3: Mid-market companies (100–1,000 employees)

### 1. Size & examples
- Team: 100–1,000 employees; revenue roughly $20M–$1B [design].
- Examples: regional distributors, healthcare groups with several clinics, franchise operators, professional-services firms, mid-size manufacturers, school districts (note: public sector has its own rules, see section 4), and mid-market SaaS companies.

### 2. Buying committee
- **User (department manager, ops, HR, marketing, finance analyst):** 3–10 people. Influence 0.4. Concern: workflow fit, training, data import. Present: daily once live.
- **Champion (department head or director):** 1. Influence 0.6. Concern: their team's pain and their own budget.
- **Economic buyer (VP, director, CFO, or COO depending on size):** 1–2. Influence 0.8. Can block: yes. Present at signing.
- **IT manager or systems admin:** 1–3, often with an outsourced MSP. Influence 0.6–0.7. Concern: SSO, Active Directory integration, network policy, and where the data lives. Can block: yes, often quietly.
- **Security or compliance lead:** 0–1. Influence 0.5 at $25k+. Concern: SOC 2 status, pen testing, incident response. Can block: yes.
- **Legal (general counsel, contract manager, or paralegal):** 0–1, present in roughly 30–40% of deals above $25k [design]. Influence 0.5. Can block: yes, through redlines on liability and data terms.
- **Procurement:** 0–1. Often none; finance handles the purchase. Where a procurement team exists, influence 0.6. Can block: yes.
- **Finance (controller or CFO):** 1. Influence 0.6. Concern: budget line and payment terms. Can block: yes.
- **Board or owner:** rare under $250k or multi-year. Influence 0.7 when called in [design].
- Mid-market buying groups average about 6–7 stakeholders, per an Influ2 2026 survey cited in a secondary glossary (https://komo.ai/glossary/mid-market-sales, unverified). Buyer is not the user in roughly 50–60% of deals [design].

### 3. Cycle & deal size
- <$5k: 7–21 days [design].
- $5–25k: 30–75 days [design].
- $25–100k: 60–120 days [design].
- >$100k: 120–240 days [design].
- Anchors: The Starr Conspiracy page cites 84-day median for >$100k, 42 days for $10k–$100k, 21 days for under $10k (attribution unclear; https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025). A 2025 Ebsta and Pavilion average of 91 days for new business is cited secondhand (https://www.webtonic.io/blog/average-sales-cycle-length-by-industry). A secondary article puts mid-market cycles at about 6.2 months, with no year or median given (https://www.sci-tech-today.com/?p=28996). The Procurify 2026 mid-market benchmark covers requisition-to-PO time, not sales cycles (https://www.procurify.com/?p=30621).
- Typical ACV a small vendor gets: $10k–$60k [design].
- Win rate on qualified: 15–25% [design].

### 4. Procurement
- P-card or corporate card: per-transaction limits $2k–$10k [design]. Ramp's example thresholds (auto under $1k, manager $1k–$5k, director above $5k) show the typical pattern (https://ramp.com/answers/policy-enforcement/policy-rules-interact-with-spend-limits).
- Quote thresholds: three written quotes often required from $10k–$25k [design].
- RFP: commonly required from $100k–$250k [design]. Some companies require one at $50k+.
- Board approval: rare, above $250k or for multi-year commitments [design].
- Fiscal year: calendar year for about 60% of mid-market firms [design]. Budgets are set in Oct–Dec for the next year. Mid-year budget changes happen in Jul–Aug.
- Payment terms: net-30 standard; net-45 or net-60 for large mid-market buyers [design].
- Paperwork: W-9; certificate of insurance (typical general liability $1M–$2M and cyber $1M–$5M [design]); SOC 2 Type II at $25k+; SIG Lite or CAIQ questionnaire for anything touching customer or employee data; DPA; VPAT if the buyer is a school or government contractor [design]. A supplier-portal registration is needed when the buyer uses Ariba, Coupa or NetSuite procurement (see Campbell's guide: https://thecampbellscompany.com/resources/ariba-registration-process-guide). Vendor onboarding can add 1–4 weeks [design].
- Techaisle's research says IT controls about half of IT budget decisions in 100–999 employee firms, but the survey is from 2021 (https://www.techaisle.com/blog/324-smb-and-midmarket-itdms-and-bdms-the-balance-of-purchase-authority).

### 5. Channels
- **Works:** referrals from existing customers in the same vertical; industry associations (regional chapters, trade groups); integrations with the buyer's core systems (NetSuite, QuickBooks, Sage, Microsoft 365) and marketplace listings (Microsoft AppSource, NetSuite SuiteApp); webinars with a partner; regional events; LinkedIn for the champion, followed by a call.
- **Fails:** cold email to the CEO alone; generic LinkedIn messaging; large trade-show booths for small deals.
- Best times: Tuesday to Thursday, 8–10am and 4–5pm local time [design]. Avoid late December.
- Tech-savviness: mixed. Ops and finance are comfortable with SaaS; IT is cautious.

### 6. Methodology
- **MEDDPICC** (or a lighter MEDDIC) is the right fit. Mid-market deals have multiple stakeholders, a real paper process, and a champion who needs coaching.
- Critical elements: economic buyer access, the decision process (who signs off at each dollar tier), the paper process (security, legal, procurement steps), and a mutual action plan with dates.
- Challenger is useful for the first meeting with the economic buyer.

### 7. Scenarios
1. **User is not the buyer (~55%) [design].** The department head loves it; finance says no. Handle: build a one-page business case with payback in months and a number the CFO recognizes.
2. **Champion leaves (~15%) [design].** Handle: multi-thread from the first call. Name a second contact within two weeks.
3. **Hidden IT veto (~20%) [design].** IT says new SaaS needs SSO and a security review, or it is blocked on the network. Handle: ask IT for their checklist on day one; deliver SSO and a security pack before they ask.
4. **Forced RFP above a threshold (~20%) [design].** Handle: respond with a short RFP template and a reference call. Don't spend two weeks on it if the buyer already prefers a competitor (ask directly).
5. **Q4 budget freeze (~15%) [design].** Handle: offer a smaller starter plan or a pilot that fits the current budget line.
6. **Bottom-up team pilot that has to be converted to a company license (~25%) [design].** Handle: count the team's usage, then propose an enterprise license with an admin dashboard and a fixed price per seat.

### 8. Common objections
- "It's not in the budget this year." Reply: "What would it take to get it into next year's plan? Let's build the Q1 business case now."
- "IT won't approve it." Reply: "Here is our SOC 2 status, SSO setup, and a 30-minute security call with your IT lead."
- "We need three quotes." Reply: "Happy to send a comparison against the two alternatives we see most often."
- "Legal wants to change our liability cap." Reply: "Here is our standard fallback. What is the exposure you are protecting?"

### 9. Churn & seasonality
- Mid-market annual logo churn: 6–8% per ChartMogul 2025 as relayed by an aggregator (secondary, unverified; https://stealthagents.com/research/saas-churn-rate-statistics-2026).
- Gross revenue retention: 88–92% [design]. Benchmarkit's median of 88% is for the broader market (https://stealthagents.com/research/startup-gross-retention-benchmarks).
- Renewal dynamics: budget cuts show up at renewal. Start renewal conversations 90–120 days out. Auto-renew clauses need 60–90 days' notice.
- Busy months: October–December (budget planning), January–February (new budget). Slow months: late December and July–August [design].

### 10. Solo-founder fit
Score: **0.45.** One person can run a mid-market deal if the product is simple and the champion is strong. The paper process, IT review, and possible RFP need a second person, typically an account executive, a solutions engineer, or a partner who can handle security questions.

### 11. Sources
- https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025 (2025)
- https://www.thestarrconspiracy.com/insights/benchmarks/b2b-buying-committee-benchmarks-2025 (2025)
- https://www.webtonic.io/blog/average-sales-cycle-length-by-industry (2025, secondary)
- https://www.sci-tech-today.com/?p=28996 (undated, secondary)
- https://www.procurify.com/?p=30621 (2026)
- https://www.techaisle.com/blog/324-smb-and-midmarket-itdms-and-bdms-the-balance-of-purchase-authority (2021 survey)
- https://komo.ai/glossary/mid-market-sales (secondary)
- https://thecampbellscompany.com/resources/ariba-registration-process-guide (retrieved 2026-10-14)
- https://ramp.com/answers/policy-enforcement/policy-rules-interact-with-spend-limits (undated)
- https://stealthagents.com/research/saas-churn-rate-statistics-2026 (2026, secondary)

---

## Segment 4: Fortune 500 / large enterprise

### 1. Size & examples
- Team: 1,000 to 100,000+ employees; revenue above roughly $7B for Fortune 500 membership [design; verify the current cut-off].
- Examples: a national bank, a regional insurer, a pharma company, a US telecom, a grocery chain, a global manufacturer.

### 2. Buying committee
- **User (team of 10–50 across business units):** Influence 0.3 each. Concern: workflow change and training. Present: daily once live.
- **Champion (VP or director in the business unit):** 1–2. Influence 0.7. Concern: the business case and their career risk.
- **Economic buyer (SVP, CIO, CMO, or CFO depending on the category):** 1. Influence 0.9. Can block: yes. Present: at signing and budget review.
- **Procurement category manager:** 1–2. Influence 0.8. Concern: pricing, supplier consolidation, and the preferred-vendor list. Can block: yes.
- **InfoSec or third-party risk management (TPRM) analysts:** 2–4. Influence 0.9 for their gate. Concern: SOC 2 Type II, SIG or CAIQ answers, pen test results, data residency, subprocessors. Can block: yes, absolutely.
- **Privacy office:** 1. Influence 0.6. Concern: DPA, GDPR SCCs, data mapping. Can block: yes.
- **Legal / commercial counsel:** 1–2. Influence 0.8. Concern: liability cap, indemnity, IP, data ownership, termination. Can block: yes.
- **Finance / FP&A:** 1. Influence 0.6. Concern: capex vs opex, budget line, PO timing.
- **Enterprise architect:** 1. Influence 0.6. Concern: integration and SSO.
- **Board or audit committee:** rare; only for large or unusual commitments [design]. Unions: relevant in some sectors (telecom, healthcare, transit) for changes affecting staff; rare for software purchases [design].
- The buyer is not the user in roughly 90% of deals [design]. The committee size is consistent with secondary citations: Gartner's enterprise figure of 5–11 stakeholders (https://komo.ai/glossary/buying-committee, unverified), and Forrester's contested 13 internal plus 9 external (https://instantly.ai/blog/decision-maker-benchmarks-enterprise-buying-committee-size/). A planning range of 6–12+ is reasonable.

### 3. Cycle & deal size
- <$5k: 14–45 days, almost always through a P-card or shadow spend, which is rare at this size [design].
- $5–25k: 60–120 days [design].
- $25–100k: 120–180 days [design].
- >$100k: 180–300+ days [design]. A single $250k+ deal can take 192 days from first touch to closed-won (Ebsta and Pavilion 2024, cited secondhand at https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025).
- Typical ACV a small vendor gets when it lands: $25k–$250k [design].
- Win rate on qualified: 10–20% [design].

### 4. Procurement
- Payment: purchase order required; P-card rarely allowed above $5k–$10k [design]. Invoice terms net-60 to net-90 are common [design].
- Quote and RFP thresholds: formal RFP or RFI often mandatory above $100k–$250k [design]. Gartner's 2024 abstract says a traditional RFP process can take more than six months to evaluate, select and contract a supplier (https://www.gartner.com/en/documents/6063463, abstract only).
- Board approval: for multi-year or very large commitments.
- Fiscal year: varies (January, July or October starts are common). Budgets set in Q3–Q4 [design]. Q4 can see a use-it-or-lose-it spending push in some companies.
- Supplier registration: an SAP Ariba, Coupa or Oracle portal. Required documents from Northwestern Mutual's supplier page include a W-9, ACH banking details, a certificate of insurance and a DUNS number (https://www.northwesternmutual.com/suppliers/, retrieved 2026-10-14). Campbell's Ariba guide describes profile, W-9 and insurance upload (https://thecampbellscompany.com/resources/ariba-registration-process-guide). Registration can take 2–8 weeks [design].
- Insurance minimums: general liability $1M–$5M per occurrence and cyber $5M–$10M [design].
- Security paperwork: SOC 2 Type II; SIG Core or SIG Lite (SIG Core is around 850 questions and SIG Lite around 126 across 21 risk domains; sources vary, see https://blog.promise.legal/startup-central/procurement-questionnaire-standing-answer-vendors-sell-enterprise/); CAIQ (roughly 260–300+ questions; https://www.spendflo.com/blog/sig-questionnaire); pen test letter; ISO 27001 if asked; VPAT for accessibility (Section 508 when the buyer is a government contractor).
- Answering a full questionnaire takes 20–40 hours for a vendor, per a vendor guide (https://rocketdocs.com/resources/blog/vendor-security-questionnaire).
- Vanta's 2025 State of Trust report is cited secondhand as finding that 78% of companies have had security reviews delay deals, and that buyers spend about nine working weeks a year on vendor reviews. I could not retrieve the primary report, so treat both figures as unverified.
- Contracts: MSA plus order forms. A first enterprise deal took about six weeks of legal back-and-forth; later order forms under an MSA closed in two to three days (one company's anecdote, https://resources.rework.com/libraries/deal-closing/msa-development). The MSA cut negotiation time 60–80% for follow-on purchases (same source, anecdotal).

### 5. Channels
- **Works:** partners and system integrators (Accenture, Deloitte, regional SIs); cloud marketplaces (AWS and Azure), where buyers can burn committed cloud spend; executive briefings arranged through a champion; analyst mentions; reference customers in the same industry; security and compliance documentation pages that let TPRM teams self-serve.
- **Fails:** cold outbound to CIOs; founder-led pitches without a champion; generic webinars; trade-show booths unless paired with a pilot.
- Best times: avoid late December and August. Meeting windows are narrow in Q4 for calendar-year firms [design].
- Tech-savviness: high at the technical level; procurement and legal are process-driven.

### 6. Methodology
- **MEDDPICC** in full, with a mutual action plan that includes the security review, legal redlines, procurement onboarding and the budget date. This is the only method that fits the number of gates.
- Critical elements: economic buyer access, the decision process and its dates, the paper process (who reviews what, in what order), and a named champion who will carry the internal business case.
- Challenger helps when the buyer must change its view of the status quo.

### 7. Scenarios
1. **TPRM rejects because the vendor has SOC 2 Type I only (~30%) [design].** Handle: produce a bridge letter, a Type II timeline and a compensating-control memo. Ask the buyer which controls they require.
2. **Legal redline stalls on liability cap or indemnity (~50%) [design].** Handle: propose a fallback position in advance (for example, a cap at 12 months' fees, with a super-cap for data breach). Get the legal reviewer on a call with the vendor's counsel.
3. **Procurement forces an RFP (~30%) [design].** Handle: ask whether the RFP is a formality. If the preferred vendor is named, decline the RFP; if not, respond fast with a standard RFP packet.
4. **Champion moves to a new role or the program is reorganized (~25%) [design].** Handle: map a second champion before signing. Keep a deal log that the new owner can read.
5. **Budget freeze or fiscal-year reset (~20%) [design].** Handle: get the deal into the next fiscal year's plan before the freeze. Offer a smaller pilot with a fixed price.
6. **Bottom-up use already exists through shadow spend or a P-card (~15%) [design].** Handle: find the users, then build the case for a formal enterprise agreement. Use the usage data as the business case.

### 8. Common objections
- "We need a SOC 2 Type II report, not Type I." Reply: "Here is our current report, our bridge letter and our audit timeline, with a call with our security lead."
- "We can't accept uncapped liability." Reply: "We can offer a 12-month fee cap with a super-cap for data breaches. Here is our standard fallback."
- "Please submit through our supplier portal." Reply: "Happy to. Here is our W-9, certificate of insurance and the portal ID. Can you confirm the registration status?"
- "We're going to RFP this." Reply: "What criteria will the RFP use? We can answer the criteria in writing before you send the document."

### 9. Churn & seasonality
- Enterprise annual logo churn: 2–5% per ChartMogul 2025 as relayed by an aggregator (secondary, unverified; https://userjot.com/blog/saas-churn-rate-benchmarks).
- Gross revenue retention: 92–96% for enterprise-focused SaaS (secondary aggregator: https://stealthagents.com/research/saas-churn-rate-statistics-2026).
- Renewals: 90–120 days' notice for auto-renew. The renewal is a re-procurement event, so the TPRM and legal reviews may repeat.
- Busy months: Q3 and Q4 for budget decisions (September to November), with a second peak in Q1 for calendar-year firms [design]. Slow months: late December, August, and anywhere near a fiscal-year-end freeze [design].

### 10. Solo-founder fit
Score: **0.1–0.15.** A 1–3 person company cannot run a 180-day cycle with TPRM, legal and procurement gates. The realistic path is a cloud marketplace listing, a partner who carries the account, or a small number of mid-market references first. Do not start here.

### 11. Sources
- https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025 (2025)
- https://www.thestarrconspiracy.com/insights/benchmarks/b2b-buying-committee-benchmarks-2025 (2025)
- https://www.webtonic.io/blog/average-sales-cycle-length-by-industry (2025, secondary)
- https://www.gartner.com/en/documents/6063463 (2024 abstract)
- https://www.northwesternmutual.com/suppliers/ (retrieved 2026-10-14)
- https://thecampbellscompany.com/resources/ariba-registration-process-guide (retrieved 2026-10-14)
- https://blog.promise.legal/startup-central/procurement-questionnaire-standing-answer-vendors-sell-enterprise/ (retrieved 2026-10-14)
- https://www.spendflo.com/blog/sig-questionnaire (retrieved 2026-10-14)
- https://rocketdocs.com/resources/blog/vendor-security-questionnaire (retrieved 2026-10-14)
- https://resources.rework.com/libraries/deal-closing/msa-development (retrieved 2026-10-14)
- https://www.vertice.one/insights/procurement-cycle-time-contract-value (2026, unverified methodology)
- https://instantly.ai/blog/decision-maker-benchmarks-enterprise-buying-committee-size/ (2026, secondary)
- https://www.businesswire.com/news/home/20251112018032/en (6sense 2025 Buyer Experience report press release, 2025-11-12)

---

## Research gaps (cross-segment)
- The Bridge Group 2025 sales-cycle-by-ACV table was not found. The Bridge 2024 AE report (quota and comp only) is the nearest primary source (https://echai.ventures/gtm/from/the-bridge-group, secondary).
- No independent Shopify merchant-decision or install-count data was found.
- No 2025 survey of SMB or mid-market fiscal-year or budget timing was found.
- The Gartner stakeholder figures and the Vanta 2025 figures could not be verified against primary reports.
- Most churn numbers come from aggregators. Verify against the ChartMogul and Recurly originals before use.
