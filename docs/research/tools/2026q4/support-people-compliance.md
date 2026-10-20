# Q4 2026 tool stack: support / AI support, HR-payroll-global, ATS and recruiting AI, compliance and trust centers

Research date: 2026-10-16. Builds on (does not repeat) docs/research/tools/t4-support-cs.md, t6-legal-hr.md, deep/d09-support-ai-cancelflows.md (Fin, Plain, Pylon workflows) and deep/d10-compliance-ats.md (Vanta, Drata, Ashby workflows). Tags: [verified: URL] primary page fetched this session; [vendor]; [third-party] aggregator/blog; [unverified]; [design] simulator assumption, not a statistic.
Many price figures below are aggregator-sourced. Treat every third-party price as a range, and let the game roll price per run [design].

## 0. What changed since the repo's earlier research (headline deltas)

1. **Delve is effectively dead as a trusted vendor.** Whistleblower posts (Mar 2026) alleged templated/pre-filled SOC 2 reports and sham auditors; YC cut ties (early Apr 2026); customers (LiteLLM, Context AI, Lovable) moved to Vanta plus an independent auditor. Delve disputes the claims. [verified: https://techcrunch.com/2026/04/23/another-customer-of-troubled-startup-delve-suffered-a-big-security-incident/] A class action is reported by secondary outlets only [third-party: https://wemoral.com/whistleblower/delve-fake-compliance-scandal; not confirmed by TechCrunch]. This is a perfect "cheap compliance with fake audit" consequence event for the game.
2. **Zendesk bought Forethought** (announced 2026-03-11, close expected end of March, price undisclosed; Forethought still sold standalone; ~$115M raised) and **Unleash** (Dec 2025), and **HyperArc** (analytics, Jul 2025). [verified: https://techcrunch.com/2026/03/11/zendesk-acquires-agentic-customer-service-startup-forethought] Forethought = acquired, not an independent startup option any more.
3. **Decagon valued $4.5B (Jan 2026, ~$250M raise)** [third-party, citing Bloomberg: https://fin.ai/learn/decagon-ai-pricing]; **Sierra $15.8B post-money, $950M Series E (May 2026)**, ~$200M annualized revenue by May [third-party: https://cryptobriefing.com/sierra-200m-annualized-revenue-may/]. Both are enterprise sales-led and irrelevant to a sub-$1M ARR startup's buying choice, but they set the AI-agent paradigm.
4. **Pylon Series B $31M (Aug 2025, a16z + Bain Capital Ventures, total $51M), 750+ customers, 150+ switched from Zendesk/Intercom/Salesforce.** [third-party: https://pulse2.com/pylon-31-million-series-b-funding-secured-for-ai-based-b2b-support-market] Pylon now lists $89/$139 per seat plus credits for AI. [verified: https://usepylon.com/pricing]
5. **Ashby cut its entry price** (Foundations $400/mo for up to 100 employees [verified: https://www.ashbyhq.com/pricing]; a Feb 2026 repackaging per aggregator [third-party: https://costbench.com/changelog/ashby-price-decrease-2026-02/]). It leads named ATS share in one vendor's dataset (15.6% vs Greenhouse 5.2%, n=600+ teams, June 2026, skewed to that vendor's users) [third-party: https://www.pin.com/blog/ats-market-share-report]. Greenhouse restructured into Core/Plus/Pro with AI Notetaker and "Real Talent" fraud/spam features; MCP server shipped Jun 2026 [third-party: https://costbench.com/software/ai-recruiting/greenhouse/].
6. **Gusto's international employee product now routes to Remote** for new customers (change dated 1 May 2026, one source) [third-party: https://whichpayroll.com/reviews/gusto; verify]. Gusto contractor-only plan exists; international contractor payments to 120+ countries [vendor/third-party].
7. **AI recruiting newcomers are real money:** Juicebox $80M Series B at $850M (Mar 2026, DST-led) [third-party: https://salestools.io/report/juicebox-raises-36m-series-a and others]; Paraform $40M Series B (Mar 2026, total ~$65M) [third-party: https://pulse2.com/paraform-65-million-raised-for-agentic-hiring-platform-expanding-ai-driven-recruiting/amp/].
8. **Deel vs Rippling espionage litigation is unresolved** and sources conflict (Deel claims dismissals in Florida; Rippling says RICO/trade-secret claims proceed in California). Deel last priced at $17.3B (Series E, Oct 2025) and reported ~$1.4B ARR in 2026 [third-party: https://www.onlycfo.io/p/deel-raises-300m-at-173b-valuation ; https://www.descubre.vc/noticia/deel-alcanza-los-1-4-mil-millones-en-arr-y-mantiene-valoraci-n-de-17-3-mil-millones-2026-07-03]. Do not model it as a mechanic beyond flavor news.

---

## 1. AI customer support and helpdesk

### 1.1 Intercom Fin (KEEP, leader for self-serve startups)
- Status: active. Detail in d09. Delta: outcome price $0.99 per resolution, plus standalone Fin on other helpdesks reported at $49/mo base incl. 50 outcomes then $0.99 [third-party: https://www.dragapp.com/blog/ai-support-agents-compared/]. Resolution rates: vendor 67-76% average, case studies 42-50%, independent 500-ticket small-business test 38% [third-party]. Use 40-55% [design].
- Paradigm: **help-center-grounded answers + Procedures** inside an inbox you already run. Operator effort goes into content quality (articles, guidance, data connectors) and batch tests/simulations. Cost scales per outcome, visible before a sales call.

### 1.2 Decagon (KEEP-ALT, enterprise/high-volume consumer brands)
- Status: active, $4.5B valuation (Jan 2026) [third-party]. Prices not published: per-conversation (most customers per Decagon's own Dec 2024 post) or per-resolution; third-party guesses $0.99/conversation + ~$50K platform fee; Vendr median ACV ~$432K from only two buyers [third-party: https://fin.ai/learn/decagon-ai-pricing; https://coworker.ai/blog/decagon-pricing]. Fin's page is a competitor, discount accordingly.
- What it is: **Agent Operating Procedures (AOPs)**: natural-language, step-by-step workflows that compile to code; nodes combine tools, metadata and instructions; entry conditions pick the AOP. AOP Copilot (Sep 2025) drafts workflows from a prompt; **Duet** (Mar 2026) analyses transcripts and generates/tests/refines AOPs continuously. [vendor: https://decagon.ai/blog/why-we-built-decagon-duet-on-agent-operating-procedures ; https://decagon.ai/modules/aops]
- Daily work: write/own AOPs per intent (refund, address change, cancellation), connect action APIs (billing, order system), review failed conversations, accept Duet suggestions, watch resolution/CSAT. Needs an engineer or technical ops person; implementation is weeks, sales-led.
- Fit: not for a 3-person startup (ACV six figures). Appears to the player at Series A+/consumer-scale volume.
- Paradigm vs Fin: Fin answers from knowledge + a few Procedures; Decagon is **procedure-first, action-taking** (it does the refund, not just explains the policy). Costs are contract-negotiated, so the player cannot model a bill in advance.

### 1.3 Sierra (KEEP-ALT, enterprise only)
- Status: active; $15.8B post-money, $950M Series E, May 2026 [third-party: https://www.idlen.io/es/news/sierra-950-million-series-e-15-8-billion-valuation-bret-taylor-tiger-global-may-2026/]; Bret Taylor + Clay Bavor. Outcome-based pricing (rate figures like ~$1.50 per resolved interaction are single-source) [third-party].
- Paradigm: **build an agent with a developer SDK/"Agent OS" on top of the brand's own systems**, voice + text, heavy professional-services onboarding. Not self-serve. In the game: an enterprise-only unlock that is a distraction for early-stage players who try it too soon (long implementation, minimum contract) [design].

### 1.4 Zendesk (KEEP-ALT incumbent; moving to outcome pricing)
- Status: active, owned by PE since 2022; "Resolution Platform" (AI Summit 2025); acquisitions HyperArc, Unleash, Forethought (see section 0). Suite Team $55/agent/mo, Professional $115/agent/mo annual; Copilot add-on $50/agent/mo [third-party, Jul 2026: https://coworker.ai/blog/zendesk-ai-pricing]. AI agents: May 2026 tiering where only **Verified Resolutions** (AI resolved + LLM verification) draw down allowance; ~$1.20-2.00 per verified resolution above allowance [third-party; contract-quoted].
- Paradigm: **ticket queue (email/web form first), views, macros, triggers, SLAs**; AI sits on top of a mature admin-heavy system. Strong for multi-channel, SLA-bound teams, poor feel for Slack-native B2B.

### 1.5 Forethought (DEAD as independent; ACQUIRED by Zendesk, Mar 2026)
Previously a ticket-triage + agent product; still sold standalone for now. Verdict: OUTDATED for the game's startup tier; fold into Zendesk's AI.

### 1.6 Pylon (KEEP-ALT, becoming leader for B2B startups)
- Status: active, YC W23 [third-party]. Pricing [verified: https://usepylon.com/pricing]: Professional $89/seat, Advanced $139/seat (SAML SSO add-on $125/mo), Enterprise custom; view-only seats free on Professional; AI (Support Agent, Slack Agent, Assist Agent, Automations) runs on **credits**, 5,000-credit minimum, example 6,800-14,000 credits/month; Account Intelligence $10/account/mo; Phone $35/seat/mo; annual contracts; no stated startup discount; minimum seat count (unspecified). Detail workflows in d09.
- Paradigm: **account-centric, channel-first**: Slack Connect/Teams/Discord channels with each customer become the ticket surface; issues link to Linear/Jira; account health and tickets live on the account object. Day-to-day: you answer in the customer's channel, convert a thread to an "issue" with a click, assign to engineering, and the thread syncs back. Zendesk: you work a queue of tickets per requester email.
- Fit: seed to Series B B2B SaaS selling to engineering-minded buyers (Together AI, Cognition, Temporal, AssemblyAI named) [third-party].

### 1.7 Plain (KEEP-ALT)
API/Slack-first support for technical B2B, built for engineers (GraphQL, custom "customer cards"), seat-priced; see d09. Paradigm: developer-extensible, thread-centric, less account-health and AI-agent breadth than Pylon.

### Support paradigm table (for mechanics)
| Paradigm | What operator does weekly | Easy | Hard | Fits |
|---|---|---|---|---|
| Fin (KB-grounded + Procedures) | Fix articles, read low-rated answers, write 3-10 Procedures, set caps | Fast start, predictable $0.99 | Anything needing actions, bad docs = bad answers | B2C/B2B SMB with docs, 100-5000 chats/mo |
| Decagon (AOPs) | Own AOP library, wire APIs, review Duet suggestions | Actions (refund, change plan), high resolution on repeat intents | Needs engineers, six-figure contract | Series A+ consumer volume |
| Sierra (agent SDK) | Build/maintain a custom agent with vendor team | Deep brand-specific behavior, voice | Slow, expensive, opaque | Enterprise |
| Zendesk (queue + AI) | Triggers, macros, SLAs, QA, tune bot | Compliance/SLA, scale | Admin overhead, not Slack-native, AI bolted on | Mid-market, 5+ agents |
| Pylon (Slack-first) | Live in customer channels, escalate to Linear | B2B white-glove, account context, engineering handoff | Consumer volume, email-only buyers | B2B seed to Series B |
| Plain | Same as Pylon but build your own views via API | Dev-friendly | Fewer out-of-box AI/health | technical B2B teams |

---

## 2. HR, payroll, global employment

### 2.1 Gusto (KEEP, default US startup payroll)
- Status: active. Simple $49/mo + $6/person; Plus $80 + $12; Premium $180 + $22; Contractor-only $35 + $6/contractor [third-party: https://rivermate.com/blog/gusto-pricing ; https://www.vintti.com/blog/gusto-pricing-nearshore-finance]. Gusto's own pricing page returned 403 to fetch, so unverified at source. International contractors paid in 120+ countries (W-8BEN collection); same-day Wise/USDC option reported Mar 2026 [third-party]. Employees abroad: new customers referred to Remote (from 1 May 2026, one source) [unverified].
- Workflow: first hire onboarding (offer, I-9/W-4, state registrations), run payroll biweekly in ~10-20 minutes, auto tax filing, benefits enrollment add-on, 1099 year-end.
- Paradigm: **payroll-first**: the pay run is the center; HR features hang off it. Simple, transparent, US only.

### 2.2 Rippling (KEEP, for founders who expect to scale / IT-heavy)
- Status: active, large private (valuation not verified this session). Price: ~$8/user/mo plus platform fee ($35-$40) for base; real bills $20-35/employee/mo with modules; implementation fees and annual contracts common; Vendr median contract ~$40K (range $5K-$165K) [third-party: https://www.gloroots.com/blog/rippling-price ; https://www.pin.com/blog/rippling-pricing]. Global EOR quoted separately (~$500/mo cited) [third-party].
- Paradigm: **unified employee graph**: one employee record drives payroll, benefits, devices/apps (IT provisioning, SSO), spend, and workflows ("when hired, create Google/Slack/GitHub accounts, ship laptop, enroll in benefits"). A change is made once and propagates. Gusto: you do tasks in separate modules/integrations. Rippling shines at onboarding/offboarding automation and compliance (device + access evidence flows to Vanta/Drata); it is overkill and sometimes sold hard to teams under 10.

### 2.3 Deel (KEEP, global hiring leader)
- Status: active, $17.3B Series E (Oct 2025), ~$1.4B ARR 2026 [third-party]; litigation with Rippling pending. Pricing [verified: https://www.deel.com/pricing/]: contractors $49/mo; contractor of record $325/mo; EOR $599/employee/mo (130+ countries); US PEO $125/employee/mo with benefits. No startup discount on the page.
- Workflow: pick country, generate compliant contract (local law), candidate signs, Deel onboards and runs local payroll, benefits and equity handling; contractors: invoice or auto-pay monthly.
- Paradigm: **EOR-first, country-by-country compliance**: Deel is the legal employer; you gain speed (days not months, no entity) and lose cost (≈$7.2K/yr per head on top of salary) and control. Rippling/Gusto are your own entity payroll.

### 2.4 Remote and Oyster (KEEP-ALT, EOR)
- Remote EOR $599-$699/employee/mo (monthly vs annual) [third-party: https://www.costbench.com/compare/oyster-vs-remote/]; Oyster ~$699, benefits bundling disputed; Justworks international EOR $599 (add-on for Justworks customers) [third-party]. No acquisition or shutdown found for Remote or Oyster [unverified absence].
- Paradigm vs Deel: Remote leads on its own owned-entity model and developer/benefit quality reputation; Deel on breadth/speed and product bundle. In the game these are near-substitutes: price and reputation variance, not mechanics.

### 2.5 Justworks (KEEP-ALT for tiny US teams wanting benefits)
- PEO (co-employment): you share employer-of-record status for benefits, payroll tax and workers' comp; strong small-group benefits pricing, human support. Cost is per-employee per month. Worse once you outgrow it (migration friction) [design]. Deel also sells a US PEO at $125/employee/mo [verified].

### HR paradigm table
| Tool | Center of gravity | Operator does | Costs | Trap |
|---|---|---|---|---|
| Gusto | Pay run | Run payroll, onboard, 1099s | $49 + $6/p | No international employees |
| Rippling | Employee graph | Design workflows once, IT + HR + payroll | $20-35/emp real | Over-buying early, implementation fee |
| Deel | Local-law employer of record | Pick country, approve contract | $599/EOR hire, $49 contractor | Misclassification if you use contractors like employees; 12-mo cost |
| Remote/Oyster | Same as Deel | same | $599-699 | Quality varies by country |
| Justworks | PEO co-employment | Use their benefits plans | per-employee | Lock-in, price rises |

---

## 3. Hiring / ATS and AI recruiting

### 3.1 Ashby (KEEP, current startup leader)
- Pricing [verified: https://www.ashbyhq.com/pricing]: Foundations (up to 100 employees) $400/mo (10% annual discount; emerging-market pricing); Plus (101-1000) and Enterprise custom; AI credits 1,500/mo on Foundations; texting 1,000 messages/mo, +$90/1,000; SSO $100/mo; Advanced Scheduling and AI Notetaker are add-ons; 200 sourcing email lookups included, more is paid.
- Share: 15.6% of named ATS connections in one vendor's 600+ team sample, 27% among teams with 6+ seats [third-party: https://www.pin.com/blog/ats-market-share-report]. Vendor-skewed; "basically all startups use Greenhouse/Lever/Ashby" is directionally right, Ashby now first among startups. Workflows in d10.
- Paradigm: **all-in-one + analytics-first**: ATS, CRM/sourcing, scheduling, offers, reporting in one data model; pipeline reports (time in stage, source yield, interviewer load) are the daily dashboard.

### 3.2 Greenhouse (KEEP-ALT, "structured hiring" incumbent)
- Core/Plus/Pro, sales-led. Third-party medians: ~$27K/yr contract (711 purchases), entry from ~$6-6.5K/yr for small teams; top end $75.9K after April 2026 increase [third-party: https://costbench.com/software/ai-recruiting/greenhouse/]. Features: structured scorecards, kits, AI Notetaker (shipped ~Jul 2026, credit-metered, one source), Real Talent fraud/spam detection, MCP server (Jun 2026) [third-party].
- Paradigm: **process-first**: every interview has a scorecard, attribute list, and kit; rigour and compliance over speed. "Not great TBH" in the user's phrase: heavy admin, slower UX, pricier for small teams; strongest for 50+ employee orgs with consistent hiring.

### 3.3 Lever (KEEP-ALT, declining)
- Owned by Employ Inc. (JazzHR, Jobvite) [third-party]. Quote-only; ~$5-15K/yr startups, ~$12.2K median for 200-employee companies [third-party]. Paradigm: **CRM-style**: candidate relationship pipeline (nurture, sourcing sequences) first, evaluation second. Verdict KEEP-ALT with a downward trend; no major 2026 product news found.

### 3.4 AI recruiting that matters for small startups
- **Juicebox / PeopleGPT**: natural-language people search over 800M+ profiles, outreach, and "Agents" for autonomous sourcing. Pricing conflicts: Starter ~$79-139/seat/mo annual, Growth ~$179-199, Agents $199/agent/mo [third-party: https://www.herohunt.ai/blog/juicebox-pricing-2026-cost-and-alternatives/]. Paradigm: replaces LinkedIn Recruiter + a sourcer; you describe the candidate, review shortlist, send sequence. Key limit: bounded by reply rates and email-lookup credits [design].
- **Paraform**: two-sided marketplace of 10,000+ independent recruiters/boutique firms plus AI; startups post roles, recruiters submit candidates, pay on hire (pricing not verified) [third-party]. Paradigm: contingent "recruiter marketplace" rather than a seat tool; cost is a placement fee (assume 15-25% of first-year base [design, typical contingency range]).
- Others (not researched this session): Wellfound Recruit, LinkedIn Hiring Assistant, Gem [unverified].

### ATS paradigm table
| Tool | Philosophy | Daily action | Best for | Trap |
|---|---|---|---|---|
| Ashby | One system + analytics | Check pipeline report, schedule via self-serve links, send offers | 5-100 hires/yr startups | Add-on creep (texts, notetaker, SSO) |
| Greenhouse | Structured process | Fill scorecards, enforce kits | Larger orgs, compliance | Price, admin weight |
| Lever | Candidate CRM | Nurture sequences, sourcing | Outbound-heavy recruiters | Evaluation/reporting thinner |
| Juicebox | Search + outreach | Describe candidate, review, send | Founder sourcing own hires | Credits, reply rate not guaranteed |
| Paraform | Marketplace | Brief recruiters, review submissions | Hard-to-fill roles, no recruiter in house | Placement fees, candidate quality varies |

---

## 4. Compliance automation and trust centers

### 4.1 Vanta (KEEP, leader) and Drata (KEEP, strong second)
- Vanta: quote-only; Essentials/Plus/Professional/Enterprise; third-party range $10K-$80K/yr, median ~$20K; seed-stage example ~$14K/yr + $8-15K auditor [third-party: https://tech-insider.org/?p=19984 ; https://www.costbench.com/compare/secureframe-vs-vanta/]. Drata: median ~$24.6K (222 purchases), entry ~$7.5K; **Drata bought SafeBase (trust center) for ~$250M in Feb 2025** [third-party: https://wolfia.com/blog/best-trust-center-software-2026; single-source]. Details in d10.
- Paradigm: **continuous monitoring** via integrations; tests go green/red. Vanta ecosystem-wide, Drata engineering-rigour, both keep the auditor separate.

### 4.2 Secureframe (KEEP-ALT)
- $7.5K-$100K range, median ~$20K; ~$7.5K per additional framework; seed example ~$10K/yr + $8-12K Type 1 audit [third-party: https://trycomp.ai/secureframe-pricing ; https://www.costbench.com/compare/secureframe-vs-vanta/]. Paradigm: Vanta-like with a stronger multi-framework/customer-support (human) pitch.

### 4.3 Oneleet (KEEP-ALT, rising)
- $33M Series A (Oct 2025, Dawn Capital; YC, Arash Ferdowsi, Frank Slootman) [third-party: https://sacra.com/c/oneleet/]. Bundled in-house pentest + vCISO + partner CPA firm; est. $12-60K/yr; one framework at a time [third-party: https://www.complyjet.com/blog/oneleet-pricing-exposed]. Paradigm: **security-substance-first** (real pentest, real audit) rather than screenshots; slower to onboard, better evidence story for security-sensitive buyers.

### 4.4 Delve (DEAD / reputationally dead)
See section 0. Do not offer it as a normal option after mid-2026; offer it only as a trap whose cost shows up when a customer's security team (or a breach) exposes the report [design]. Game mapping: cheapest sticker price, fastest "certified" date, lowest auditor rigor; fallout: customer re-audit, lost deals, legal exposure, re-certification costs (LiteLLM, Context AI precedent) [verified: TechCrunch URL above].

### 4.5 Trust centers
- SafeBase (now Drata), Vanta Trust Center (included from Essentials), Conveyor (credit-metered portal + questionnaire drafting), Wolfia (competitor-authored comparison) [third-party: https://conveyor.com/blog/best-trust-center-software ; https://wolfia.com/blog/best-trust-center-software-2026]. No free tiers found. Function: publish policies/reports behind NDA gate, deflect security questionnaires (AI drafts answers from approved content; human approves). Vanta AI questionnaire claims 80% automation / 95% acceptance [vendor, d10] and quotas 25-144/yr by plan.

### Compliance paradigm table
| Tool | Philosophy | Operator does | Typical year-1 | Risk |
|---|---|---|---|---|
| Vanta | Integrations everywhere, continuous tests | Fix red tests, policies, personnel | $10-20K + audit | Renewal jumps (e.g. $8K to $18K), tool != audit |
| Drata | Rigorous engineering controls, trust center via SafeBase | same | ~$7.5-25K + audit | cost, setup depth |
| Secureframe | Multi-framework + human support | same | $10-20K | per-framework fees |
| Oneleet | Real pentest + vCISO + audit | Do remediation, run pentest | $15-50K | one framework at a time, less integration breadth |
| Delve | "AI does it" | Click through | cheap | Possible invalid report, YC cut ties |

---

## 5. Verdicts, by tool

| Tool | Status | Verdict | Price (startup tier) | Paradigm (one line) | Key workflows | Stage fit |
|---|---|---|---|---|---|---|
| Intercom Fin | Active | KEEP | $0.99/resolution + Intercom seats; standalone ~$49/mo base [third-party] | KB-grounded answers + Procedures in the inbox | Train content, build Procedures, batch tests/simulations, review resolutions | Pre-seed to Series A, B2C and SMB B2B |
| Decagon | Active, $4.5B | KEEP-ALT | Contract, ~$100K+ ACV [third-party] | Natural-language AOPs that take actions; Duet self-improves | Write AOPs, connect APIs, review Duet suggestions | Series A+ / consumer volume |
| Sierra | Active, $15.8B | KEEP-ALT (enterprise) | Outcome-based contract | Developer-built branded agent (Agent OS), voice+text | Build/maintain agent with vendor | Enterprise only |
| Zendesk (+AI) | Active; bought Forethought, Unleash, HyperArc | KEEP-ALT | Suite $55-115/agent + ~$1.20-2.00/verified resolution [third-party] | Email/ticket queue + SLAs + AI on top | Macros, triggers, SLAs, bot tuning | Mid-market, 5+ agents |
| Forethought | Acquired by Zendesk (Mar 2026) | OUTDATED (fold into Zendesk) | n/a | Triage + agent, now Zendesk tech | n/a | n/a |
| Pylon | Active, $51M raised | KEEP-ALT (B2B leader) | $89/seat Pro, $139 Advanced + AI credits (5K min) [verified] | Slack/Teams Connect channels as tickets; account-centric | Reply in customer channels, make issues, link Linear, account health | Seed to Series B B2B |
| Plain | Active | KEEP-ALT | seat-based (see d09) | API-first thread support for technical B2B | Customer cards, Slack threads, API workflows | Technical B2B, small team |
| Gusto | Active | KEEP | $49 + $6/p (Simple); contractors $35 + $6 | Payroll-first, US-only | Pay run, onboarding, 1099s | Pre-seed to Series A, US |
| Rippling | Active | KEEP | ~$8/user + $35-40 base; real $20-35/emp [third-party] | Unified employee graph drives HR, payroll, IT | Workflows on hire/leave, device + app provisioning | Seed+ scaling teams, 10+ employees |
| Deel | Active, $17.3B | KEEP | EOR $599, contractor $49, PEO $125 [verified] | EOR-first, local-law compliance | Contract per country, local payroll, contractor pay | Any stage hiring abroad |
| Remote | Active | KEEP-ALT | EOR $599-699 [third-party] | Owned-entity EOR | Same as Deel | Hiring abroad |
| Oyster | Active | KEEP-ALT | ~$699 [third-party] | EOR with benefits bundle | Same | Hiring abroad |
| Justworks | Active | KEEP-ALT | per-employee PEO; intl EOR $599 add-on [third-party] | PEO co-employment | Benefits, payroll, support | 2-30 employee US teams |
| Ashby | Active | KEEP (leader) | $400/mo up to 100 emp [verified] | All-in-one, analytics-first ATS | Pipeline review, scheduling, offers, sourcing | 5-100 hires/yr |
| Greenhouse | Active | KEEP-ALT | ~$6-27K/yr (est.) [third-party] | Structured hiring, scorecards | Kits, scorecards, approvals | 50+ employees |
| Lever | Active, Employ Inc. | KEEP-ALT (declining) | ~$5-15K/yr [third-party] | CRM-style candidate pipeline | Nurture, sequence, pipeline | Outbound recruiting |
| Juicebox | Active, $850M | KEEP-ALT new | ~$99-199/seat/mo [third-party] | NL search over 800M profiles + agents | Describe, shortlist, outreach | Founder-led hiring |
| Paraform | Active, $65M total | KEEP-ALT new | placement fee [unverified] | Recruiter marketplace + AI | Post role, review recruiter submissions | Seed to Series B, hard roles |
| Vanta | Active | KEEP | ~$10-20K/yr + audit [third-party] | Continuous monitoring with broad integrations | Connect, fix tests, policies, audit | Seed+ at first enterprise ask |
| Drata | Active; owns SafeBase | KEEP-ALT | ~$7.5-25K/yr [third-party] | Rigor + trust center | Same | Seed to Series B |
| Secureframe | Active | KEEP-ALT | ~$10-20K/yr + $7.5K per framework | Multi-framework + human support | Same | Seed+ |
| Oneleet | Active, $33M A | KEEP-ALT rising | ~$15-50K/yr [third-party] | Real pentest + audit bundle | Pentest, remediate, audit | Security-sensitive buyers |
| Delve | Collapsed (YC cut ties, Apr 2026) | DEAD | cheap [unverified] | "AI does compliance"; allegedly pre-filled reports | n/a | Do not use |
| Trust center (SafeBase/Vanta/Conveyor) | Active | KEEP | bundled; Conveyor entry-priced | Self-serve security docs + AI questionnaires | Publish, NDA-gate, approve AI answers | Once 1+ security questionnaire per month |

## 6. Game-mechanics suggestions [design]
1. **Support:** model Fin vs Pylon vs Zendesk as different hour/cost/outcome profiles: Fin = content-quality dependent resolution (40-55%), Pylon = higher CSAT and expansion for B2B but zero help for B2C email volume, Zendesk = admin hours. Decagon/Sierra unlock only past an ARR gate with a six-figure commit and an implementation delay.
2. **HR:** Gusto first US hire; Rippling pays off only when headcount x provisioning events justify it; Deel/Remote for the first foreign hire (cost ≈ $7.2K/yr per head), contractors via Deel $49; misclassification risk if the player treats contractors like staff.
3. **ATS:** Ashby default; Greenhouse reduces bad-hire rate via structured scorecards but costs hours and money; Juicebox/Paraform alter the sourcing funnel (Juicebox cheap per seat but needs reply-rate skill; Paraform pay-on-hire but placement fee).
4. **Compliance:** Vanta/Drata/Secureframe/Oneleet vary by first-year cost, auditor rigor and speed; **Delve-style shortcut = fast cheap "certified" but a latent liability event** (lost deal, re-audit, legal exposure) when a customer's review or a breach triggers scrutiny.
5. Operator quality: stellar support operators maintain KB gaps and AOPs/Procedures; stellar hiring operators use scorecards and measured pipeline conversion; stellar compliance operators scope narrowly and remediate real controls. Average operators leave AI untouched or let it hallucinate refunds.

## 7. Unverified / open items
- Gusto and Rippling official pricing pages were not retrievable (403 / not fetched); Rippling valuation not verified.
- Sierra pricing, Decagon AOP independent performance, Delve class-action status are single-source or vendor-only.
- Lever 2026 product news, Paraform pricing, Justworks list prices, Oyster ownership changes: not verified.
- Plain 2026 pricing and any Intercom "Fin 3" details: not verified this session.
