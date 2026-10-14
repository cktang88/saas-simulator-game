# G4: Professional services buyer segments (law, accounting, real estate, marketing agencies)

Research date: 2026-10-14. Numbers are cited to the source I actually saw (search snippet or fetched page); where a source was only seen as a search summary and not opened, it says so. Items marked [design] are my estimates, not sourced data. Data gaps are listed at the end of each segment.

---

## Segment 1: Law firms (solo/small vs AmLaw 200)

### 1. Size & examples
- **Solo / small:** Solo practitioners and firms of 2-9 lawyers dominate US counts. Clio's 2025 solo and small firm report is its fourth edition in the series (https://www.clio.com/about/press/legal-trends-solo-small-law-firms-2025/, 2025). Firm-size definitions conflict across sources (2-4 employees vs five or fewer FTEs), so use [design]: solo = 1 lawyer, small = 2-20 lawyers, typically family law, estate planning, personal injury, immigration, small corporate/real estate boutiques.
- **AmLaw 200:** The 200 largest US firms by gross revenue, typically 500-4,000+ lawyers, nine-figure or larger revenue, with a full CIO, KM, innovation and legal ops function (ILTA-style tech committees).
- Example businesses: solo PI or family-law practice on Clio/MyCase; a 12-lawyer estate boutique; AmLaw 200 corporate firms buying KM, e-discovery, contract AI.

### 2. Buying committee
- **Solo/small:** The owner is the user, champion, economic buyer and signer. Typical count 1. Influence 1.0. Concerns: time to value, data migration, price per user. Blocking power is total. Bookkeeper or office manager (0.2-0.4 influence, count 0-1) can block on billing integration. Present: 100% of the decision. IT is usually an outside MSP or none [design].
- **AmLaw 200 (typical, [design]):**
  - User: associates and paralegals, count 50-500+, influence 0.2, present 100%.
  - Champion: practice group leader or director of innovation/KM, count 1-3, influence 0.6, present 100%.
  - Economic buyer: COO or CFO, or a managing partner for enterprise deals, count 1, influence 0.8, can block, present ~60%.
  - IT/technical: CIO/CISO office, count 1-3, influence 0.7, can block, present ~90%.
  - Security: infosec or vendor risk team, count 1-2, influence 0.7, can block, present ~50% (asked for the security questionnaire).
  - Legal/risk: general counsel's office, conflicts/risk partner, count 1, influence 0.5, can block on data terms, present ~30%.
  - Procurement: count 0-1, influence 0.4, present ~30%.
  - Finance: count 1, influence 0.5, can block, present ~40%.
  - Partner committee: count 3-7 partners, influence 0.6, can block on firm-wide tools, present ~20%.
- **Buyer is not the user:** Solo: almost never (under 10%). AmLaw 200: almost always (80%+ at enterprise scale) [design].

Sources for security asks: ABA 2023 Cybersecurity TechReport as summarised by PreVeil: 22% of firms said a client had asked them to complete a security questionnaire; 27% had been asked for security requirements; 59% at firms of 50-99 lawyers (https://www.preveil.com/blog/law-firm-security-obligations-regulated-clients/, date not shown, cited via search snippet).

### 3. Cycle & deal size
- Solo/small deal sizes: typically $1k-$10k/year (about $50-$300/user/month for Clio-class tools, per pricing guide dated June 2026: $39-$99/user/month, https://agiled.app/blog/best-contract-management-software-for-law-firms).
- Sales cycle by deal size (general SaaS benchmarks, not law-specific): under $5k 14-30 days; $5-25k 30-60 days; $25-100k 60-90 days; over $100k 84+ days. Sources: Emulent benchmark page (https://emulent.com/resources/trends/sales-cycle-length-benchmarks-by-industry-and-projections/, date not shown); syncgtm 2026 overview (https://syncgtm.com/blog/what-is-considered-a-short-b2b-sales-cycle, 2026). Optifai study of 939 B2B SaaS companies: median 84 days (2025, via a vendor blog summary). Law firms add 1-3 months for security review at the AmLaw end [design].
- Typical ACV a small vendor gets: $1.5k-$6k for solo/small; $30k-$250k for AmLaw [design].
- Win rate: not found for legal. Bridge Group (2024 report, secondary summary only, not opened): median ACV $47k, win rate 19% in 2024 down from 23% in 2022 (https://blog.bridgegroupinc.com; https://www.jiminny.com/blog/saas-sales-benchmarks). Use 15-25% qualified win rate as [design] default.

### 4. Procurement
- Solo/small: business credit card, no P-card program. Card limits are whatever the bank sets; no formal approval [design]. Annual billing is typical; monthly card billing common for under $100/mo.
- AmLaw 200: P-cards and PO systems; purchase approval thresholds commonly $5k-$25k for a second approver, and above $50k-$100k a formal RFP or legal ops review [design]. Fiscal year: most US firms run a calendar year, a minority use November or August start; budgets are set in Q3-Q4 [design].
- Payment terms: net-30 standard for enterprise, net-45 possible; POs required at AmLaw. Sales tax on SaaS varies by state [design].
- Paperwork that appears: W-9 (almost always), certificate of insurance (cyber liability, E&O, typically $1M-$5M), security questionnaire (SIG Lite or custom; Iris vendor blog, https://heyiris.ai/blog/iris-for-legal-big-law, undated), SOC 2 Type II (expected for AmLaw), DPA (EU clients), ACC Model Information Protection and Security Controls for Outside Counsel as the benchmark (https://docket.acc.com/print/pdf/node/3787, undated). No HIPAA BAA unless the firm handles health data; VPAT is rare outside government [design].
- Note: I found no published AmLaw 200 outside-counsel guidelines or vendor-form requirements. Treat the list above as [design] until verified.

### 5. Channels
- Works: peer referral from other lawyers and state/local bar associations; legal-specific conferences (ABA TECHSHOW, Clio Cloud Conference, ILTA for AmLaw); free trial and demo. Lawyers Weekly (AU) reports 3 in 4 firms say demos drive tech decisions (https://www.lawyersweekly.com.au/biglaw/42656-3-in-4-law-firms-say-demos-key-to-tech-decision-making, undated).
- Marketplaces: Clio App Marketplace and integrations are the main solo distribution route [design].
- Fails: cold outbound to solos (low response); generic LinkedIn to AmLaw partners without a legal ops or KM champion.
- Best times: avoid trial season and court deadlines; January and Q4 budget windows for AmLaw; solos anytime but avoid the first two weeks of the month [design].
- Tech savviness: solo/small low to medium; AmLaw high, with ILTA networking. ABA 2024 budgeting report (search snippet only): 41% of solos budget for technology, 55% of 2-9 lawyer firms, 65% of 10-49, 90% of 100+; average tech spend $13,991 (2022: $14,106); solos typically under $3,000/year (https://www.americanbar.org/groups/law_practice/resources/tech-report/2024/2024-budgeting-and-planning-techreport, published about March 2025). Note: a second snippet gave 55.4% of solos with no tech budget; the two figures do not reconcile, so use the 41% with caution.

### 6. Methodology
- Solo/small: value selling with a simple BANT-lite (budget, authority, need, timing). Keep it to one call and a trial.
- AmLaw 200: MEDDPICC. Critical elements: Champion (a KM or innovation lead), Economic Buyer (COO/CFO), Decision Criteria (security and integration), Paper Process (PO, vendor onboarding, insurance), and Identify Pain (billable hour pressure, AI pilots). Challenger works for pushing firms off an existing tool.

### 7. Scenarios
1. Solo wants a cheaper tool but has a 3-year Clio data history (buyer=user, switching cost). P 0.3. Handle with a one-week data import test and a fixed-price migration offer.
2. AmLaw champion leaves after a pilot (P 0.25 per 12 months [design]). Handle by multi-threading to COO and CIO before pilot end.
3. Security questionnaire arrives after verbal yes (P 0.5 at AmLaw [design]). Keep a pre-filled SIG Lite and a SOC 2 report ready.
4. Partner committee blocks on ethics or confidentiality (P 0.2). Offer a data-residency statement and a Rule 1.6 cloud-confidentiality explainer (ABA Model Rule 1.6(c); rule text from memory, verify).
5. Solo asks for a referral discount with their bar association (P 0.4). Structure a referral partner rather than a discount on price.
6. Budget freeze in a small firm after a slow quarter (P 0.2). Offer annual-pay-monthly or a seat-reduction downgrade.

### 8. Common objections
- "We already have Clio/MyCase." (solo, very common)
- "We need this to pass our security review first." (AmLaw)
- "Our partners won't learn another tool." (AmLaw change management)
- "Is our client data in the cloud safe for privilege?"
- "Can we just use ChatGPT for this?" (2025-26 AI objection)
- Clio's 2025 report: solo and small firms adopt AI more slowly due to time, cost and uncertainty; 8% of solos and 4% of small firms use AI widely (https://www.clio.com/about/press/legal-trends-solo-small-law-firms-2025/). Smokeball 2025 found 53% of small firms integrating gen AI, up from 27% in 2023 (https://www.lawnext.com/2025/03/ai-adoption-nearly-doubles-among-small-law-firms-according-to-smokeballs-2025-state-of-law-report.html, March 2025). These two numbers conflict on method; state both.

### 9. Churn & seasonality
- Solo practice software churn: [design] 15-25%/yr; practices close or merge.
- AmLaw renewal: high retention once live (annual 90%+ [design]); churn happens at the procurement re-bid.
- Busy: Jan-Mar for tax-adjacent and estate firms; litigation has no season. Slow: August, late December [design].

### 10. Solo-founder fit
- Solo/small: 0.7. Realistic through Clio-style marketplaces, bar-association partnerships and self-serve trials.
- AmLaw 200: 0.1. Needs security artifacts and a sales team.

### 11. Sources
- https://www.americanbar.org/groups/law_practice/resources/tech-report/2024/2024-budgeting-and-planning-techreport (about March 2025; search snippet)
- https://www.americanbar.org/news/abanews/aba-news-archives/2025/03/aba-survey-on-legal-tech-trends/ (March 2025)
- https://www.clio.com/about/press/legal-trends-solo-small-law-firms-2025/ (2025)
- https://www.clio.com/blog/solo-small-law-firms-highlights-2025-legal-trends-2025 (2025)
- https://canadianlawyermag.com/news/general/solos-and-small-firms-lag-with-ai-adoption-clio-report/392441 (2025)
- https://www.lawnext.com/2025/03/ai-adoption-nearly-doubles-among-small-law-firms-according-to-smokeballs-2025-state-of-law-report.html (March 2025)
- https://www.preveil.com/blog/law-firm-security-obligations-regulated-clients/ (undated)
- https://docket.acc.com/print/pdf/node/3787 (undated)
- https://heyiris.ai/blog/iris-for-legal-big-law (undated)
- https://www.abajournal.com/columns/article/the-affinipay-2025-legal-industry-report-shows-how-firms-use-ai-financial-and-remote-work-tech (2025)
- https://aceds.org/ella-sherman-6-things-we-found-interesting-from-the-2025-ilta-tech-survey/ (2025)
- https://emulent.com/resources/trends/sales-cycle-length-benchmarks-by-industry-and-projections/ (undated)
- https://syncgtm.com/blog/what-is-considered-a-short-b2b-sales-cycle (2026)
- https://www.jiminny.com/blog/saas-sales-benchmarks (undated)
- https://agiled.app/blog/best-contract-management-software-for-law-firms (June 2026)

**Gaps:** No 2025-26 law-specific sales cycle, win rate, P-card or AmLaw procurement data found. AmLaw items are [design].

---

## Segment 2: Accounting / CPA firms (including tax-season timing)

### 1. Size & examples
- US has tens of thousands of CPA firms; most are small. AICPA-linked data varies by source. Private equity is consolidating the upper market: CPA Trendlines' deal tracker follows 525 events and $49B transacted EV (https://cpatrendlines.com/2025/11/23/pe-ma-will-consolidate-accounting-profession, Nov 2025). Rosenberg MAP survey (2025) forecast 100-150 PE or PE-backed acquisitions in the next 12 months (same source). IFAC counts roughly 200 PE investments and ~900 follow-on deals in 2025 (secondary summary of IFAC data).
- Segments [design]: sole practitioner (1 CPA, 0-5 clients per tax preparer), small firm (2-10 partners/staff), mid-size regional (20-200 staff), Top 100 (1,000+).
- Examples: a 3-person tax and bookkeeping practice on Drake or Intuit ProConnect; a 40-person regional firm on CCH Axcess or UltraTax CS; a PE-backed roll-up platform.

### 2. Buying committee
- Sole practitioner: owner is user, champion, economic buyer, signer. Count 1, influence 1.0. Present 100%. Concern: time, price, client migration.
- Small firm (2-10) [design]: Managing partner (count 1, influence 0.9, can block, present 70%); staff preparers/users (count 2-8, influence 0.3, present 100%); office admin/IT (count 1, influence 0.5, can block on integrations); ~0.7 of decisions include an outsourced IT/MSP who can block security.
- Mid-size (20-200) [design]: managing partner or COO (influence 0.9, can block), practice/tax leader as champion (influence 0.7, present 100%), IT director (0.7, can block), security/compliance lead (0.6, can block; FTC Safeguards program owner), finance/accounting ops (0.5), HR for staff-facing tools (0.2), partner committee (0.6, can block).
- Buyer is not the user: under 20% at small firms; about 60% at mid-size and above [design].
- PE-backed platforms add a board or operating partner who signs off on any system over ~$25k/year [design].

### 3. Cycle & deal size
- Deal size: small firm tools $1k-$15k/year; mid-size $15k-$100k+ [design].
- Cycle, general benchmarks (not CPA-specific; see Segment 1 sources): under $5k 14-30 days; $5-25k 30-60 days; $25-100k 60-90 days; over $100k 84+ days. Tax-season alignment shifts this: a deal that reaches signature in January may slip to May-October for onboarding (Intuit guidance below).
- Typical ACV for small vendor: $2k-$8k [design].
- Win rate: no CPA-specific figure found. Use 15-25% qualified [design].

### 4. Procurement
- Cards: small firms use a business card with bank-set limits; no formal P-card program [design].
- Thresholds: firms commonly approve over $5k-$10k at partner level and formal review above $25k [design].
- Fiscal year: most firms run calendar or June 30 year-ends; partnership budgets are set in Q3-Q4 [design]. Note: many CPA firms run a fiscal year ending June 30 or December 31 [design].
- Payment: annual prepay or net-30; software vendors with tax-season contracts often bill in Q4 [design].
- Paperwork: W-9; certificate of insurance (cyber/E&O); FTC Safeguards Rule vendor oversight; SOC 2 Type II for larger firms; DPA for client data; no HIPAA BAA unless health clients. Note: FTC Safeguards Rule covers tax preparers as financial institutions (16 CFR 314; secondary summaries at https://www.preveil.com/blog/ftc-safeguards-rule-tax-accounting-firms/ and https://www.thesagenext.com/blog/ftc-safeguards-rule-a-cpa-firm-compliance-guide). Breach notice to the FTC within 30 days for 500+ consumers (rule in force since May 2024, from my knowledge; verify at eCFR).
- Summary sources conflict on the small-firm exception, so cite the rule text when a buyer asks.

### 5. Channels
- Works: peer referral within state CPA societies; state society and AICPA events; practice-management community (Accounting Today, Firm of the Future conferences); integrations with the incumbent tax or PM platform (Intuit, Thomson Reuters, CCH, Drake app marketplaces) [design].
- Fails: cold email in Jan-Apr; generic LinkedIn to managing partners in tax season.
- Best times: May-October for onboarding and buying (see timing below); Q3 for purchases (Thomson Reuters argues this, https://tax.thomsonreuters.com/blog/why-q3-is-the-best-time-for-firms-to-purchase-tax-software/, vendor view).
- Tax-season timing evidence: Intuit says the best time to fully onboard is extension season, May-October; a switch right after busy season leaves 6-7 months of interrupted training before the next busy season (https://accountants.intuit.com/taxprocenter/practice-management/workflow-tools/upgrading-software-in-the-fall-smart-firms-dont-wait/, undated). Intuit and AccountingWEB also recommend a parallel run before go-live (https://www.accountingweb.co.uk/node/205909, undated). These are vendor sources.
- Tech savviness: medium; tax preparers are self-taught on their software but resistant to change during season.

### 6. Methodology
- Value selling plus MEDDPICC for mid-size. Critical: Pain (missed deadlines, staff turnover), Champion (practice leader), Economic buyer (managing partner), Paper process (security review), Timing (sell in Q3 for go-live before January).
- Solo/small: value selling with a live demo on their own client data (with consent).

### 7. Scenarios
1. Buyer wants to start in January (P 0.5 [design]). Hold the contract until Q2; offer a mid-year start with a parallel pilot.
2. Champion (tax manager) leaves before go-live (P 0.2). Keep the managing partner in every call; document the workflow.
3. Security review from IT or cyber insurer stalls the deal (P 0.4 for mid-size). Provide SOC 2 or a Safeguards-aligned WISP summary.
4. PE-backed platform acquires the buyer mid-cycle (P 0.1 per deal [design]). Ask in discovery who the owner is; expect a re-bid.
5. Staff revolt on migration in peak season (P 0.3). Ship a scheduled cutover and training blackout dates.
6. Forced RFP from a mid-size firm (P 0.15). Respond with a short standard security and pricing packet.

### 8. Common objections
- "We don't switch during tax season."
- "Our IT provider needs to approve this."
- "Do you have a SOC 2 report and a WISP?"
- "We already use Intuit/CCH/Thomson Reuters; it's integrated."
- "We can't migrate 2,000 client files before April."
- "Why not wait until next year?"

### 9. Churn & seasonality
- Churn: [design] 10-15%/yr for small firms; tax-software switching concentrated after April-May and in Q4 budget reviews. The Journal of Accountancy and Tax Adviser surveys are AICPA-member product ratings, not churn data (https://www.journalofaccountancy.com/issues/2025/sep/2025-tax-software-survey, Sep 2025; survey run June 2-20, 2025, 2,011 respondents). The Tax Adviser 2026 edition: 1,808 respondents, June 1-19, 2026 (https://www.thetaxadviser.com/issues/2026/aug/2026-tax-software-survey.html, Aug 2026).
- Busy: January-April (the peak); extension season is May-October. Slow: late December and early January for some, so check your own data [design].

### 10. Solo-founder fit
- 0.5 for a small-firm vertical tool (sole practitioner and 2-10 staff). 0.2 for mid-size or PE-backed. Realistic with a product that integrates into an incumbent tax or practice platform and sells in Q3.

### 11. Sources
- https://www.journalofaccountancy.com/issues/2025/sep/2025-tax-software-survey (Sep 2025)
- https://www.thetaxadviser.com/issues/2026/aug/2026-tax-software-survey.html (Aug 2026)
- https://tax.thomsonreuters.com/blog/why-q3-is-the-best-time-for-firms-to-purchase-tax-software/ (undated)
- https://accountants.intuit.com/taxprocenter/practice-management/workflow-tools/upgrading-software-in-the-fall-smart-firms-dont-wait/ (undated)
- https://www.accountingweb.co.uk/node/205909 (undated)
- https://cpatrendlines.com/2025/11/23/pe-ma-will-consolidate-accounting-profession (Nov 2025)
- https://www.cfobrew.com/stories/2026/03/04/pe-backed-public-accounting-consolidation-picks-up-steam (Mar 2026)
- https://www.preveil.com/blog/ftc-safeguards-rule-tax-accounting-firms/ (undated)
- https://www.thesagenext.com/blog/ftc-safeguards-rule-a-cpa-firm-compliance-guide (undated)
- https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-314 (rule text; not opened)

**Gaps:** No independent data on when CPA firms buy software or on CPA-specific sales cycles or win rates. Most timing evidence is vendor-authored.

---

## Segment 3: Real estate brokerages and agents (agent vs broker buying)

### 1. Size & examples
- Agents: NAR's 2025 Profile (transactions July 2024-June 2025, released Nov 4, 2025): 88% of buyers used an agent or broker; 91% of sellers used an agent; 5% FSBO (https://www.nar.realtor/press-releases/first-time-home-buyer-share-falls-to-historic-low-of-21-median-age-rises-to-40, Nov 2025; https://nowbam.com/91-of-home-sellers-worked-with-an-agent-this-year-the-highest-on-record/, secondary).
- Brokerages: typically 5-500 agents in independent or boutique firms; large franchises and national brands are 1,000+ agents. Examples: a 15-agent independent in one metro; a 300-agent regional brokerage; Compass/eXp-scale national players.
- Solo agent: most agents are solo or in small teams, [design] 60-70% of licensees have fewer than 10 transactions per year.

### 2. Buying committee
- Solo agent: agent is user, champion, economic buyer and signer. Count 1, influence 1.0, can block alone. Pays out of pocket (commission). Present 100%. Concern: lead cost, time, learning curve. Brokerage may pay for some tools via a fee or a required platform.
- Brokerage (5-50 agents) [design]: broker-owner (economic buyer, count 1, influence 0.9, can block, present ~60%); operations/transaction coordinator (count 1, influence 0.6, can block on compliance, present 80%); top producer or team leader (champion/influence, count 1-3, influence 0.5); agent users (count 5-50, influence 0.3 each in aggregate, present 100%). IT/security is usually outsourced and rarely a blocker unless MLS data is involved (0.4).
- Brokerage (100+) [design]: CEO/COO (0.9), technology director (0.7), compliance/legal (0.5, blocks on consumer data use), finance (0.4), MLS/association liaison (0.3). Franchise brands add a franchisor tech approval (can block).
- Buyer is not the user: solo agent almost never; brokerage: about 70-80% of tool purchases are made by the broker [design]. Agents buy tools for themselves but often reimburse only through the brokerage's preferred vendor list.

### 3. Cycle & deal size
- Agent-level tools: $50-$250/month (NAR 2025 survey: 34% of agents spend $50-250/month; 24% spend more than $500/month; https://www.nar.realtor/newsroom/realtors-embrace-ai-digital-tools-to-enhance-client-service-nar-survey-finds, 2025 survey, released Sept 2025 per URL date; one search summary said 2026 — the source's own URL indicates 2025, so flag the year). 
- Brokerage platform: $500-$5k/month; 50-500 agent deals [design].
- Cycle: solo agent: same day to 14 days; brokerage 30-120 days; franchise/national 6-12 months [design]. General benchmark, not RE-specific: 14-30 days under $10k; 60-120 days mid-market (https://emulent.com/resources/trends/sales-cycle-length-benchmarks-by-industry-and-projections/).
- Win rate: not found. Use 10-20% for brokerage pitches [design].

### 4. Procurement
- Agent: personal or business credit card; no approval. Monthly billing common.
- Brokerage: owner approves; ACH or card; annual contracts with 30-day cancellation are typical [design]. Brokerages usually require a W-9, a certificate of insurance (E&O or cyber), a data-security questionnaire for MLS or consumer data, and sometimes a DPA.
- Brokerage approval thresholds: owner signs everything; no formal RFP below franchise level [design].
- MLS integration: MLS and association rules govern IDX/data feeds, so expect a licensed-data-use review (not a formal fiscal process). This can take weeks.
- Fiscal year: calendar year; budgets set in Q4 (November-December) [design].
- Payment: net-30 for brokerage contracts; agents pay on card.

### 5. Channels
- Works: brokerage-level preferred vendor programs; local association events (Realtor associations, MLS trainings); peer referral within brokerages; top-producer endorsement; in-office demos; integrations with the MLS, the CRM (Follow Up Boss, kvCORE), e-sign (DocuSign, Dotloop) [design].
- NAR 2026 Realtors Technology report (per the search summary) and the 2025 survey: transaction tools are entrenched (96% use MLS; 79% use e-signature; 68% scheduling; 59% CMA/pricing; only 46% use a CRM) (https://www.nar.realtor/newsroom/realtors-embrace-ai-digital-tools-to-enhance-client-service-nar-survey-finds). Agent priorities: saving time (81%, up from 66%), client experience (71%), closing more deals (57%), less manual work (54%). Barriers: learning curve (63%), cost (59%) (search summary of the NAR report; dates conflict as noted above).
- Fails: cold outreach to agents by email; generic trade-show booths with no demo; selling a brokerage without the broker.
- Best times: avoid peak spring selling season (March-June) for brokerage pitches; use the winter (December-February) for planning [design].
- Tech savviness: agents are high on consumer apps and low on back-office software. Brokers are medium.
- Brokerage tech sentiment (TotalBrokerage survey, 2023-2024; vendor with commercial interest): share calling tech a checkbox rose from 16.3% (2023) to about 30% (2024 per summary); share calling it integral fell from 39% to about 20% (https://www.totalbrokerage.com/blog/state-of-brokerage-technology-2023-survey-results; https://www.totalbrokerage.com/blog/brokerage-technology-strategy-2025-survey-roadmap). Brokers want fewer, integrated tools.

### 6. Methodology
- Agent-level: SPIN plus value selling. Ask about time saved per transaction and leads per month.
- Brokerage: Challenger for the broker who believes the status quo is fine; MEDDIC for 100+ agents. Critical: Economic buyer (broker), Champion (top producer or ops lead), Metrics (agent adoption rate, transactions per agent), Paper (MLS and data approval).

### 7. Scenarios
1. Buyer (broker) is not the user; agents refuse to adopt (P 0.5 [design]). Build a top-producer pilot and run adoption metrics.
2. Champion (ops lead or TC) leaves (P 0.2). Re-engage the broker quickly.
3. Brokerage requires MLS data-use approval (P 0.3 for MLS-touching tools). Plan 2-6 weeks of delay.
4. Franchise tech approval blocks a national-brand deal (P 0.1 for brokerage over 100 agents). Go for independents first.
5. Agent wants a discount, or to bring a personal tool into a brokerage that already has one (P 0.4). Offer agent-tier pricing with a per-agent contract.
6. Bottom-up adoption: agents use the free tier and the broker is asked to pay (P 0.3). Convert with a team plan and a broker-level dashboard.

### 8. Common objections
- "My brokerage already gives us a platform."
- "Agents won't learn another CRM." (63% cite learning curve)
- "Our commission split doesn't leave room for software."
- "Does this integrate with our MLS and our CRM?"
- "We had a bad experience with the last lead vendor."
- "Consumer data privacy: where is the lead data stored?"

### 9. Churn & seasonality
- Agent churn: [design] 30-50%/yr, since agents leave brokerages and the business is cyclical.
- Brokerage churn: [design] 10-20%/yr; switching is rare outside renewal.
- Busy: March-June (spring sales); slow: late December and January [design]. Brokers prefer to switch in Q4 or January.

### 10. Solo-founder fit
- Agent-level tool sold direct to agents: 0.6 (self-serve, low ACV, high churn, real demand).
- Brokerage-level sale: 0.25 (long MLS and broker cycles).

### 11. Sources
- https://www.nar.realtor/press-releases/first-time-home-buyer-share-falls-to-historic-low-of-21-median-age-rises-to-40 (Nov 4, 2025)
- https://virginiarealtors.org/2025/12/08/key-takeaways-from-nars-2025-profile-of-home-buyers-and-sellers (Dec 2025)
- https://nowbam.com/91-of-home-sellers-worked-with-an-agent-this-year-the-highest-on-record/ (secondary, date not shown)
- https://www.nar.realtor/newsroom/realtors-embrace-ai-digital-tools-to-enhance-client-service-nar-survey-finds (Sept 2025 per URL)
- https://www.totalbrokerage.com/blog/brokerage-technology-strategy-2025-survey-roadmap (undated)
- https://www.totalbrokerage.com/blog/state-of-brokerage-technology-2023-survey-results (2023)
- https://s205.q4cdn.com/544743641/files/doc_news/Reals-May-Agent-Survey-Market-Momentum-Slows-as-Buyer-Leverage-Grows-2025.pdf (June 2025)
- https://www.housingwire.com/articles/nar-2025-technology-survey-realtor-tech-usage-trends/ (2025)
- https://www.housingwire.com/articles/realtors-ai-use-2026 (2026)

**Gaps:** No data found on broker vendor-selection process, Inman-type brokerage surveys, or RE vendor sales cycles. The NAR tech-report year is inconsistent across sources (2025 per URL, 2026 per one summary). Brokerage-level numbers are [design].

---

## Segment 4: Marketing and creative agencies

### 1. Size & examples
- Agency sizes [design]: solo freelancer or 1-3 person studio; 5-25 person boutique (SEO, paid social, creative); 50-200 person full-service or performance agency; 200+ holding-company agency.
- Examples: a 6-person Shopify growth agency; a 20-person B2B content and paid agency; an 80-person full-service agency.

### 2. Buying committee
- Small agency (1-25): founder/owner is user, champion, economic buyer and signer. Count 1, influence 1.0, can block. Account lead or delivery manager (count 1-3, influence 0.4, present 100%). Freelancers may be users with no buying role.
- Mid agency (25-200) [design]: COO or managing director (0.9, can block); operations or project director (0.6, present 100%); head of paid media or SEO (champion, 0.6); finance (0.4, can block on spend); IT or security (0.4, rises to 0.8 when client data or client accounts are involved); legal/procurement (0.3, blocks on client-facing contracts).
- Clients: a major factor. Agency tools often must be approved by the client when the tool touches client accounts (Google Ads, Meta, Shopify) [design].
- Buyer is not the user: 30-50% of the time for small agencies, rising to 70%+ for mid-size [design].

### 3. Cycle & deal size
- Deal size: small agency tools $50-$500/month ($600-$6k/year); mid-size $500-$5k/month [design].
- Cycle: solo or small agency under $5k 14-30 days; mid-size $25-100k 60-90 days (general benchmarks; see Emulent, https://emulent.com/resources/trends/sales-cycle-length-benchmarks-by-industry-and-projections/).
- Win rate: not found for agencies. Use 15-25% for qualified [design].
- Agency tool buying is fast when it saves time on client work (reporting, call tracking). Expect a 1-2 week trial in small agencies.

### 4. Procurement
- Small agencies: card on file, monthly or annual billing, no approval.
- Mid-size: owner or COO approves; annual contracts with 30-60 day cancellation common [design]. Client-paid tool pass-throughs need client written approval.
- Paperwork: W-9 (rarely), agency E&O/cyber insurance certificate for client-facing tools, DPA if clients' personal data is handled, SOC 2 for larger or enterprise-client work [design]. HIPAA BAA only for health clients.
- Fiscal year: calendar; budget set in Q4 with client retainer planning [design].
- Market context: GetApp 2025 (1,116 marketing decision-makers in 9 countries) says 79% plan to increase software spend by at least 5%; marketing software is the top spend priority (41%) (https://www.businesswire.com/news/home/20250218836718/en, Feb 18, 2025). Top buying difficulty: picking a suitable tool (37%) and security (37%). Trust signals: reputation and personal experience (https://www.agilitypr.com/pr-agency-news/marketers-are-upping-their-software-spend-but-struggle-with-their-tech-decisions/, Feb 2025). These are marketing-team respondents, not agency owners.

### 5. Channels
- Works: peer referral in agency communities (Agency Hackers-type groups, local ad clubs, Facebook and Slack communities); partner and integration marketplaces (Google Ads, Meta, HubSpot, Shopify apps) [design]; case studies showing time saved on client work; free trials.
- Fails: cold outreach to agency founders on LinkedIn (saturated) [design]; generic webinar pitches; holding-company procurement.
- Best times: agencies are busiest in Q1 (budgets) and Q4 (year-end planning) [design]; avoid the week of major client launches.
- Tech savviness: high for paid media and SEO leads; low for owners doing ops.

### 6. Methodology
- Small agency: value selling with a time-saved calculation (hours per client per month x billing rate).
- Mid-size: MEDDIC. Critical: Metrics (hours saved, margin per client), Economic buyer (COO), Champion (head of paid media), Paper (client approval for tools touching client accounts).

### 7. Scenarios
1. Agency buyer is not the user; account managers refuse to adopt (P 0.4 [design]). Build a pilot on one client account.
2. Champion (media lead) leaves to a client (P 0.2). Document the workflow and keep the owner engaged.
3. Client must approve a tool that touches its ad accounts (P 0.3). Provide a client-facing security summary and read-only access option.
4. Budget cut as client retainers shrink (P 0.3 per quarter in weak markets [design]). Offer a per-client or usage plan.
5. Agency wants to resell or white-label the tool to clients (P 0.25). Structure as a partner program with a margin rather than a direct sale.
6. Freelancer on the team who buys tools for personal use (P 0.3). Offer a seat-based plan with an admin.

### 8. Common objections
- "Our clients already give us access to their tools."
- "We build this in-house in a spreadsheet."
- "Who pays for this, us or the client?"
- "We can't afford another monthly tool when margins are thin."
- "Does it work with Google Ads, Meta and our reporting tool?"

### 9. Churn & seasonality
- Agency client churn (the agency's own customer churn, not the agency's tool churn): ANA/4As April 2025: average client-agency relationship about 7 years (vs 3.2 in 2016); integrated 7.3 years; media-only 3.7 years (https://www.ana.net/content/show/id/pr-2025-04-tenure, Apr 2025).
- Focus Digital (2025 analysis, vendor): annual client churn 33% performance-based, 28% hybrid, 18% retainer (https://focus-digital.co/?p=6135). Setup 2025 survey (via Agiled 2026 summary): retainer churn 18%, project churn 42%; retainer clients stay about 56 months vs 24 for project clients (https://agiled.app/statistics/client-retention-statistics, 2026).
- CallRail 2026 Agency Marketing Outlook: only 3% of agencies expect client lifespans of 36 months or more; most expect 12-24 months. This is expectations, not measured tenure (https://cdn.mediavalet.com/usva/callrail/XgWRrshJhEWNQhju4is74g/GRI6z_RpNEOURtImvC_eQA/Original/CallRail_2026%20Agency%20Marketing%20Outlook%20Report.pdf, 2026).
- Tool churn for agencies [design]: 25-40%/yr for SMB agency tools; lower for tools tied to client reporting.
- Busy: Q1 and Q4; slow: July-August [design].

### 10. Solo-founder fit
- 0.7 for a tool that saves time on client work and sells self-serve to 1-25 person agencies. 0.2 for holding-company or enterprise agency deals.

### 11. Sources
- https://www.ana.net/content/show/id/pr-2025-04-tenure (Apr 2025)
- https://focus-digital.co/?p=6135 (2025)
- https://agiled.app/statistics/client-retention-statistics (2026)
- https://cdn.mediavalet.com/usva/callrail/XgWRrshJhEWNQhju4is74g/GRI6z_RpNEOURtImvC_eQA/Original/CallRail_2026%20Agency%20Marketing%20Outlook%20Report.pdf (2026)
- https://www.businesswire.com/news/home/20250218836718/en (Feb 18, 2025)
- https://www.agilitypr.com/pr-agency-news/marketers-are-upping-their-software-spend-but-struggle-with-their-tech-decisions/ (Feb 2025)
- https://www.marketingprofs.com/charts/2025/52878/how-marketing-decision-makers-evaluate-software-vendors (2025)
- https://everything-pr.com/the-cmo-agency-trust-gap-2026-why-clients-leave-and-why-agencies-dont-see-it-coming (2026)

**Gaps:** No agency-owner tool-selection or client-paid-tool survey found. Agency tool churn and win rates are [design].
