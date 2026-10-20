# Q4 2026 tools: back office, finance, legal-ops (formation, bank, books, billing, cap table, contracts)

Research date: 2026-10-16. Tags: [verified: URL] = primary or multi-source confirmed; [vendor] = vendor page; [third-party] = aggregator/competitor/blog; [unverified]. Builds on docs/research/tools/t5-finance.md, t6-legal-hr.md, t7-fundraising.md, deep/d11-banking-spend-bookkeeping.md (not repeated; only deltas and new facts). Prices conflict a lot across aggregators; confirm vendor pages before hard-coding.

## 0. Biggest changes since the repo's earlier research (what the game must reflect)

1. **Pulley is shutting down, confirmed.** Announced ~Sep 15-16, 2026; last day of service **Dec 8, 2026** (not "Dec 2026 in the future": it is ~7 weeks away). Customers are handed to **Carta** via assisted migration: Carta matches Pulley pricing for year 1 and credits unused Pulley subscription; cutoff for the assisted path is **Nov 30, 2026**; migrating means signing a new Carta contract (monthly Pulley payers must go annual/quarterly); Pulley will not assist moves to other vendors; self-serve export ends Dec 8, limited data access reportedly to Jan 31, 2027 [third-party]. Reason not given; ex-employee speculation: competing with AI-maintained spreadsheets. Raised $50M+ (General Catalyst, Stripe, Founders Fund); founder Yin Wu says team will build again. [verified: https://techcrunch.com/2026/09/16/pulley-a-carta-rival-is-shutting-down/ ; pricing-tracker notice: https://pricingsaas.com/companies/pulley/diffs/2026W39 ; Startup Fortune / BPM / Qapita / EquityList coverage via search]
2. **Brex acquired by Capital One**, closed **Apr 7, 2026**, ~$5.15B headline (SEC 10-Q: ~$4.5B = $2.6B cash + 10.6M shares); Pedro Franceschi stays CEO. [verified: https://www.capitalone.com/about/newsroom/capital-one-completes-acquisition-of-brex/ ; SEC 10-Q FY2026]
3. **Both big usage-billing startups were bought:** **Metronome -> Stripe** (announced Dec 2, 2025, ~$1B reported; closed by early 2026), now Stripe's advanced usage-billing tier; **Orb -> Adyen** ($335M cash, announced Jun 11, 2026, closed ~early Jul 2026; stays standalone for now). [verified: https://stripe.com/newsroom/news/stripe-completes-metronome-acquisition ; https://thefinancialtechnologyreport.com/adyen-agrees-to-acquire-enterprise-billing-platform-orb-for-335-million/ ; third-party corroboration]
4. **Bench**: shut down abruptly Dec 27, 2024 (platform inaccessible), "acquired" by Employer.com (announced Dec 30, 2024; Employer.com said it would revive/port data), Canadian bankruptcy filing Jan 2025 with $65M+ debts per Wikipedia. ~35k customers (sources vary 11k-35k). Treat as DEAD as a standalone brand. [verified: https://techcrunch.com/2024/12/30/bench-to-be-acquired-after-abruptly-shutting-down ; https://www.accountingtoday.com/news/bench-acquired-by-employer-com-after-sudden-shutdown ; https://en.wikipedia.org/wiki/Bench_Accounting]
5. **AngelList standalone cap table closed to new customers (Aug 2026)**; being rebuilt around RUVs/consolidation vehicles. [third-party: startupowl.com, rfp.wiki; unverified by AngelList primary page]
6. **Crosby is real and big:** an AI-native *law firm* (PLLC, barred attorneys, malpractice insurance), not CLM software. $5.8M seed (Sequoia, Jun 2025), $20M Series A (Index, Bain Cap Ventures; Oct 2025), ~$60M Series B (Lux, Index; ~Mar-Apr 2026, ~$400M valuation [third-party]). [verified: https://techcrunch.com/2025/06/17/sequoia-backed-crosby-launches-a-new-kind-of-ai-powered-law-firm ; https://www.crosby.ai ; https://www.artificiallawyer.com/2025/10/08/hybrid-ai-law-firm-crosby-raises-20m-cooley-invests/]
7. **Mercury got OCC preliminary conditional approval for a national bank charter (Apr 27, 2026)**; still needs FDIC/Fed; until then partner banks. Mercury ~$650M annualized revenue, ~$3.5B valuation; Ramp ~$1B annualized revenue, ~$32B valuation [third-party: Sacra]. [verified: https://www.businesswire.com/news/home/20260427949683/en/Mercury-Receives-OCC-Conditional-Approval-to-Establish-Mercury-Bank-N.A. ; https://sacra.com/research/post-brex-ramp-vs-mercury/]
8. **Agent-first formation exists:** Meow (bank) offers entity formation + bank + card + invoice via an MCP server in one agent conversation [vendor claim, Meow's own blog; unverified independently: https://www.meow.com/blog/stripe-atlas-alternatives-2026].
9. **Price moves:** Xero US $27/$59/$97 from Oct 1, 2026 [third-party]; QBO renewal list prices rose Aug 1, 2026 (Simple Start $38) [third-party, conflicting]; Chargebee restructured plans mid-2026 [third-party, conflicting].

## 1. Incorporation and formation

### Stripe Atlas
- Status: active, KEEP (default for venture-track Delaware C-corp). 
- Price [vendor: https://stripe.com/atlas]: **$500 one-time** incl. gov fees and first year registered agent; **$100/yr** renewal. Includes next-day Delaware filing, EIN, founder stock issuance, 83(b) filing, templates, **$2,500 Stripe credits**, $50K+ partner discounts. Atlas fee refunded if you fund a Stripe Treasury account with $5K within 90 days. Incorporated within ~2 business days (SignalFire's 2024 "about a week" is stale).
- Workflow: one web form (founders, shares, par value, address) -> Atlas files in Delaware -> issues EIN -> generates stock purchase agreements/board consents/IP assignment for e-sign -> founders mail/file 83(b) (Atlas handles) -> open Stripe Treasury/Mercury/etc. ~1-2 hrs founder time; days elapsed 2-7.
- Gotchas: default par value/authorized shares drive Delaware franchise tax (authorized-shares method can bill $85K+; assumed-par-value method fixes it) [see founder-finance skill; kruze articles]; Atlas is not a law firm; registered-agent auto-renews; no ongoing compliance/bookkeeping; foreign-tax issues for non-US founders (Form 5472 if foreign-owned).
### Clerky
- Status: active, KEEP-ALT (lawyer-built docs; the VC-preferred document set; used when you want Cooley/Gunderson-grade docs and pair with a separate bank). Pricing is not clearly public: ~$427 one-time incorporation, ~$819 package/"lifetime", ~$799 standard C-corp quoted elsewhere, plus post-incorporation plan ~$299 [third-party; conflicting: toolradar, rho.co, flowjam]. Also sells SAFE/option-plan/board-consent paperwork at the financing stage.
### doola
- Status: active, KEEP-ALT for **non-US founders / LLC-first / ecommerce**. Plans [vendor: https://www.doola.com/pricing]: Starter **$297/yr** (LLC or C-corp formation, EIN, operating agreement, registered agent, virtual address; state fees extra); Pulse $300/yr (automated bookkeeping); Tax & Compliance $1,999/yr; Business-in-a-Box $2,999/yr (~$329/mo; bookkeeper, monthly close, quarterly estimates). 
- Paradigm: formation + ongoing compliance/bookkeeping subscription for non-US operators vs Atlas = one-shot fundraising-ready Delaware C-corp.
### Firstbase
- Status: active but uncertain. Pricing [third-party, Rho, checked Aug 2026]: Start $399 one-time; registered agent "Agent Autopilot" $299/yr/state; Mailroom Premium $350/yr; Firstbase One $2,388/yr. CB Insights shows an "Acquired" entry dated Dec 10, 2025 with no acquirer [unverified]. Verdict: KEEP-ALT/declining for non-US founders; check before modeling as a growth brand.
### Gust Launch (not requested, adjacent)
- ~$450/yr Start plan [third-party]; incorporates plus cap table + compliance; KEEP-ALT.
### Meow (new)
- Agent/MCP formation + bank [vendor claim]; treat as emerging, not yet proven.
### Paradigm
- **Atlas**: Stripe ecosystem bundle (credits, Treasury, Stripe-fast). **Clerky**: legal-document engine, you assemble banking/equity elsewhere. **doola/Firstbase**: foreign founder + LLC + recurring compliance subscription, includes virtual address/RA. Game choices: C-corp vs LLC path, speed (2d vs 5-7d), 83(b) done for you vs missed, franchise tax mistake risk, non-US founder fees (5472, ITIN, bank KYC friction).
### Virtual mailing address: UseStable (Stable)
- Status: active, YC company, KEEP (startup-focused virtual mailroom). [vendor: https://www.usestable.com/pricing] Grow **$59/mo ($49 annual)**, 30 pieces/mo, 1 user (+$20/user, 3 max); Scale **$99/mo ($83 annual)**, 50 pieces/mo (+$30/user); Custom (AI routing, SSO, HIPAA BAA). Overage **$3/piece**; registered agent add-on **$25/mo/state**; check deposits from $3; postage extra; open/scan/shred/junk filter free. **50% off Grow for 1 year** if revenue <$1M or incorporating with a Stable address. 37 street locations (NY, SF, Chicago, DC...). Mail kept 30 days, packages 15 days.
- Workflow: pick address -> use for IRS/state/bank/EIN -> mail scanned to dashboard -> request open/scan, forward, shred, deposit checks. Switching address compliantly (IRS Form 8822-B, state, bank, payroll) is a ~1-2 hr task. [vendor claim; no independent reviews found]
- Gotchas: CMRAs get rejected by some banks/Stripe/state agencies [third-party general knowledge, unverified here]; missed legal mail (service of process goes to registered agent, not mailbox); overage fees. Alternatives: Earth Class Mail, Anytime Mailbox, iPostal1, doola/Firstbase bundled addresses, Traveling Mailbox [unverified].
- Stage fit: remote solo to seed; replaces home address (privacy) and coworking mailbox.

## 2. Banking and spend: Mercury vs Ramp vs Brex

Repo d11 already documents Mercury plans (Free/Plus $29.90/Pro $299, Treasury, Books). Deltas:
- **Mercury**: charter pending (OCC conditional Apr 2026); partner banks (Choice/Column after Evolve/Synapse fallout) [third-party Sacra]; now sells itself as bank + spend + bill pay + invoicing + Books. KEEP (default operating account for startups).
- **Ramp**: KEEP (spend-management software layer, not a bank; Marqeta/Stripe issuing, Increase for banking [Sacra]). Pricing [third-party, Ramp page not reached]: **Free $0/user** (card, 1.5% cashback, basic expense mgmt, QBO/Xero sync, receipts/OCR), **Plus $15/user/mo + platform fee by team size**, Enterprise custom, procurement add-on, 1099s $0.65/filing; platform fee not published; some mid-market renewals reported $5-10K/mo [unverified]. **Accounting Agent launched Feb 2026** (auto-codes transactions, on by default for Plus) [vendor docs: https://support.ramp.com/ramp-accounting-agent-enablement-daily-use-admin-guide ; https://www.cpapracticeadvisor.com/?p=177952].
- **Brex**: acquired by Capital One (closed Apr 2026), independent CEO; known for high limits underwritten on cash balances, tiered points, multi-currency [third-party]. Verdict: KEEP-ALT but with acquisition-integration risk; fewer new-startup signals vs Ramp. Product-line changes post-acquisition not verified.
- **Paradigms**: Mercury = bank-first account (where money lives, ACH/wires/invoices/treasury; card is a feature). Ramp = software-first spend control (card -> receipts -> approvals -> bill pay -> auto-coding -> close), sits on top of whichever bank; wins on automated close and savings insights. Brex = credit-limit-on-cash-balance enterprise-lite card + travel/global; moving into Capital One's balance sheet. Common startup stack: **Mercury (cash) + Ramp or Brex (card/spend)** [third-party]. Game levers: setup hours, cashback % (1.5% flat), credit limit vs balance, interest on idle cash (Treasury yield ~4%, not FDIC-insured sweep), receipt-chasing time saved by Ramp agent, bank-risk event (partner bank failure, e.g. Synapse) as a possible shock.

## 3. Accounting, bookkeeping, tax

| tool | status | pricing (2026) | notes |
|---|---|---|---|
| QuickBooks Online | active, KEEP (default; accountants/investors expect it) | Simple Start ~$38/mo, Essentials ~$75-85, Plus ~$115 after Aug 1 2026 increase [third-party, conflicting]; payroll from $88+$7/emp | auto-categorization + bank feeds, required by many bookkeeping services |
| Xero | active, KEEP-ALT (simpler, unlimited users) | $27/$59/$97 from Oct 1 2026 [third-party]; Xero Payroll (Gusto) $36+$6/emp | weaker US accountant base |
| Pilot | active, KEEP (human bookkeeping + tax + CFO) | AI "Essentials" from ~$99/mo (AI only); Core human bookkeeping ~$349-849/mo by expense band, ~$499 seed [third-party Eightx, Capterra]; fractional CFO add-on $1,750-5,250/mo; QBO billed separately | recalculates on trailing 3-mo expenses; 4.9/5 Capterra (29 reviews) |
| Fondo | active, YC, KEEP-ALT (startup-specialist accounting, tax, R&D credits) | ~$299-599/mo bookkeeping, tax from ~$950/yr [third-party, conflicting]; R&D credit reportedly ~20% contingency [unverified] | 21K avg R&D refund = vendor marketing claim |
| Rivet | **unverified; no results found.** Do not model as a named vendor; use a generic "startup tax prep CPA" (Kruze, Fondo, Pilot tax) | -- | search returned nothing |
| Bench | DEAD (see section 0) | -- | models the "vendor collapses, books locked" shock |
| Kick | active, AI bookkeeping; Bench's recommended successor | free to 250 txns/yr; Basic ~$40/mo annual [third-party, mixed dates] | AI + accountant review; FreshBooks distribution |
| Puzzle | active, AI-native GL, "Puzzle 2.0" software+services (Sep 2026), new CEO Ozgur Uzuner; $50M raised (2024) | $25-$300+/mo, sources conflict (free until $20K txn volume per one tracker) | AI Close GA to firms Jul 2026 [vendor] |
| Digits | active, "autonomous general ledger", MCP server (Apr 2026), ~$97.5M raised [CB Insights via repo]; 2026 Top New Product for Accountants | ~$65-250+/mo, conflicting | aimed at accounting firms and startups |

- **Paradigms**: QBO/Xero = traditional GL where *you or a bookkeeper* categorize and reconcile (cost is hours or $/mo, quality depends on operator). Pilot/Fondo = people-plus-software service: you answer a few questions monthly, they close the books; quality varies by assigned bookkeeper. Kick/Puzzle/Digits = AI-first GL: transactions categorized on arrival, human only on exceptions; cheaper, but errors compound silently (miscategorized R&D, sales-tax nexus, deferred revenue not modeled) unless reviewed. Ramp's agent now codes at the card swipe. Game levers: monthly close hours (solo QBO ~4-8 hrs [design]; Pilot ~0.5-1 hr [design]); error rate; catch-up bookkeeping cost; tax bill surprises; late filing penalties; R&D credit (Sec. 174 capitalization changed in 2025 law; verify) ; export-books-monthly insurance against vendor death.
- Switching: QBO->Xero requires history conversion; Pilot requires QBO; Bench-style proprietary software was the lock-in trap (customers lost tax docs). [verified: TechCrunch Dec 27 2024]

## 4. Billing

- **Stripe Billing**: KEEP (default). 0.7% of billed volume pay-as-you-go on top of processing (2.9%+30c US cards); Stripe Tax 0.5%/txn where registered [third-party: erpresearch, usagepricing]. Basic metering inside Billing (to ~100M events/mo reported); advanced usage/AI pricing now via **Metronome** (Startup plan: US$100K billing allotment, 10M events) [third-party]. Objects: customer, product, price (flat/tiered/metered/per-seat), subscription, invoice, meter, credit grant, dunning (Smart Retries), customer portal.
- **Metronome**: ACQUIRED by Stripe (Dec 2025 announce, ~$1B reported); now "Stripe's enterprise usage billing"; customers OpenAI, Anthropic, NVIDIA. Verdict: KEEP-ALT inside Stripe; for startups, only if pricing is truly usage/credit-based with sales-led contracts.
- **Orb**: ACQUIRED by Adyen ($335M, Jun-Jul 2026); standalone for now; customers Vercel, Replit, Supabase, Glean. Verdict: KEEP-ALT with roadmap risk (acquirer wants it in payments stack); prior funding $44M Series B (Mayfield, Sep 2024).
- **Chargebee**: active; pricing opaque and in flux (reports of Starter/Performance replaced by a "Flow" plan Aug 2026, or Starter $0->$250 Jun 2026; ~0.8% of billing [Flexprice, competitor]); finance-led subscription management, revenue recognition, multi-gateway. Verdict: KEEP-ALT for B2B with invoicing/rev-rec; OVERKILL for Stripe-only sub-$1M ARR. [all third-party/unverified]
- **Lago**: active, open source (AGPLv3), self-host free; managed tiers quote-only (Premium plan reportedly replaced by "Business" May 2026) [third-party]. Verdict: KEEP-ALT for engineering-led usage-based startups wanting no take-rate.
- **Paradigms**: Stripe Billing = billing welded to payments (one data model for charge, invoice, tax, dunning, portal), cheapest setup, weakest for complex usage/credits. Orb/Metronome = event-stream-first metering + pricing-as-code with plan versioning, real-time usage and prepaid credits (AI products), payment-processor-agnostic (until acquired). Chargebee = finance-ops subscription mgmt, multi-gateway, rev-rec. Lago = open-source metering/invoicing you run. Game levers: engineering hours to integrate, take rate (0.7%-0.8%), ability to run credits/usage pricing (AI inference cost pass-through), invoice errors/disputes, failed-payment recovery rate, vendor-acquisition migration event.

## 5. Cap table and equity

- **Carta**: KEEP (leader, now absorbing Pulley). Plans Launch/Build/Grow/Scale, list prices unpublished; CostBench: Launch $2,988/yr, Build $5,988, Grow $11,988 [third-party]; other sources: free Launch tier up to 25 stakeholders / ~$1M raised via law-firm partners [third-party, conflicting]; 409A bundled in Build+ or ~$2,500-4,000 separately [third-party]. Renewal-increase complaints [competitor-sourced].
- **Pulley**: DEAD as of Dec 8, 2026 (see section 0). Last published prices: Startup $1,200/yr, Growth $3,500/yr [third-party]. Model as a forced-migration event (hours, new contract, billing-cadence change, data-export deadline) for any Pulley player.
- **captable.io**: low-confidence. Old free cloud cap-table/round modeling tool (2017 sources; SignalFire lists it with a free tier); no 2026 pricing or status found. Verdict: UNVERIFIED/legacy; use spreadsheet or Cake/Eqvista/Ledgy/Fidelity Private Shares as free-tier alternates. [third-party; unverified]
- **AngelList Stack**: standalone cap table closed to new customers (Aug 2026) [third-party]; legacy list $133/$267/$467/mo (CostBench) or $1,600-5,600/yr (StartupOwl), conflicting. **RUVs** (rolled-up vehicles that collapse many angel SAFEs into one line) now the product center; SPVs ~ $8K setup + $2K state fee, $80K minimum raise, leads ~20% carry (repo t7) [third-party].
- **Alternatives with evidence**: Ledgy, Eqvista, Cake Equity (409A $1,500 separate), Fidelity Private Shares (409A $1,229-3,199), EquityList, Qapita [third-party].
- **Paradigm**: Carta = system of record for investors, 409A, option management; priced per stakeholder/tier; the gravity well. Pulley was price/UX challenger. AngelList = syndicate/RUV vehicles that keep the cap table clean (few holders) vs managing every angel as a stakeholder. Spreadsheet/AI-maintained cap table (the reason Pulley cited) works pre-seed but fails at priced round / 409A / audit. Game levers: stakeholder count and cost, 409A timeliness (option grants without a 409A = tax penalty risk), cap-table errors discovered in diligence, RUV vs 20 individual SAFE holders.

## 6. Contracts

- **Crosby**: ACTIVE, rapidly growing; KEEP (new category leader for startups who need real lawyers fast). Product: Slack-based intake; send NDA/MSA/order form/DPA; AI agents research and draft, **human barred attorneys review all work**; fixed per-document price (no public price list); median turnaround ~58 min; clients incl. Cursor, Clay, Unify; "negotiated against 76% of the Fortune 100" [vendor]; "custom memory" per client. 1,000+ contracts in first ~5 months [TechCrunch Jun 2025]. Funding see section 0. Co-founder John Sarihan (CTO, ex-Ramp), Ryan Daniels. Workflow: paste contract in Slack -> choose playbook/risk tolerance -> redlines + summary within the hour -> negotiate counterparty -> sign. Gotchas: not CLM/e-sign; pricing opaque; volume-dependent. [verified: https://www.crosby.ai ; TechCrunch]
- **PandaDoc**: active, KEEP for sales proposals/quotes + e-sign; entry ~$19/seat/mo (G2) [third-party]; AI is review/clause suggestion, not legal-grade.
- **Juro**: active, KEEP-ALT for startups wanting browser-native contract creation, templates, approvals, repository; quote-based, estimates $15K-75K/yr [third-party; conflicting]; likely too expensive pre-seed.
- **Ironclad**: active, OUTDATED for small startups (shelfware); quote-based $30K-250K+/yr (Vendr est.); Aug 2026 AI launch aimed at procurement/obligations. [third-party]
- **Paradigms**: Crosby = *outsourced lawyer-in-the-loop* (you buy outcomes per document; the legal judgment is the product). PandaDoc = document generation/e-signature for sales. Juro/Ironclad = in-house CLM software (you or counsel still do the negotiation). Game levers: cost per contract, turnaround hours, risk caught (uncapped liability, IP assignment, auto-renewal, data-use clauses), deal cycle time; mistakes: signing paper unread, missing DPA/MSA terms, enterprise deal stalls at redlines.
- Adjacent: DIY with GPT/Claude + template is the cheap-and-risky path [design].

## 7. SignalFire "Back-Office Adulting Guide" (Elaine Zelby): what it says and whether it is current

Source: https://coda.io/@elaine-zelby/signalfire-back-office-adulting-guide (now also on docs.superhuman.com; Coda was acquired by Grammarly/Superhuman) plus SignalFire blog posts dated **Apr 30, 2024** (incorporation, banking, equity) and **Jul 22, 2024** (accounting). Claims "initial stack covers ~90% of startups." [verified: signalfire.com/blog/startup-incorporation-guide ; /startup-accounting-guide ; docs.superhuman.com resource list]

| Category | Guide pick | Q4 2026 status |
|---|---|---|
| Incorporation | Stripe Atlas (~$500, ~a week); Clerky (<$1,000, <1 wk) | Still current; Atlas now ~2 business days, $500 + $100/yr RA |
| Banking | Mercury; SVB, First Republic, Citizens, JPM Innovation | Mercury current; **First Republic dead (2023)**; SVB now First Citizens/SVB brand; Mercury charter pending |
| Credit card | Brex (no PG), Ramp (1.5% cash back), Amex | Brex now Capital One; Ramp leader; Divvy was acquired by Bill (2021) so "free Divvy" is BILL Spend & Expense [unverified] |
| Equity | Carta (pick), Pulley (cheaper, free version), captable.io | **Pulley dead Dec 8 2026**; captable.io unverified |
| Bookkeeping | Pilot (pick), Bench | **Bench dead**; Pilot/Fondo/Kick/Puzzle now |
| Accounting | QuickBooks, Xero, NetSuite (Series A) | Current; price increases 2026 |
| AP / expense | Ramp, Brex, BILL, Expensify | Current; Ramp has AI accounting agent |
| AR/billing | Stripe Checkout, BILL, QuickBooks; Zuora/Recurly/Lago for subs | Stripe Billing + Metronome; Orb/Chargebee/Lago alternates |
| Payroll/HR | Gusto, Rippling, Zest, Papaya Global | Gusto/Rippling current (other agent's area); Zest status unverified |
| Benefits/perks | Zestful | unverified |
| Insurance | Embroker | unverified |
| Legal contracts | none listed | now Crosby etc. |
| Office | none listed | see below |
- Sequence the guide teaches (still sound): incorporate before taking money -> bank when revenue/fundraise/payroll -> cap table when first hire/investor -> outsource bookkeeping once affordable -> expenses not handled personally. 

## 8. Office management as a service

- Thin market. Managed by Q (cleaning/maintenance, Staples tie; older), Service Partner One (EU), and **Codi** (a16z-backed AI office-manager agent, launched Oct 2025; says in-house office admin costs ~$80K/yr) [verified: https://techcrunch.com/2025/10/21/a16z-backed-codi-launches-ai-agent-office-manager]. For a remote SaaS startup the modern equivalent is: virtual address (Stable) + coworking day passes (WeWork/Regus/local) + Pilot-style outsourced back office + AI agents for scheduling/vendor admin. Verdict: model as optional low-weight "office" line item; no need for physical-office management until ~10+ in-person staff. No evidence found for a coworking-plus-virtual-office bundle player.

## 9. Newer 2025-2026 entrants displacing older picks
- Ramp Accounting Agent (Feb 2026), Puzzle 2.0, Digits agentic GL + MCP, Kick (AI bookkeeping) displace Bench/classic bookkeeping.
- Crosby displaces generic "startup law firm hourly" for commercial contracts.
- Carta absorbing Pulley; Ledgy/Eqvista/Cake/Fidelity Private Shares as cheaper options.
- Meow agent-formation (claim), Gust Launch.
- Stripe+Metronome and Adyen+Orb consolidate usage billing into payment processors.

## 10. Summary table

| tool | status | verdict | price (startup tier) | paradigm (one line) | key workflows | stage fit |
|---|---|---|---|---|---|---|
| Stripe Atlas | active | KEEP | $500 + $100/yr RA; $2.5K Stripe credits | Stripe-bundled Delaware C-corp in ~2 days | form -> EIN -> stock/83(b) -> bank | pre-seed, VC-track |
| Clerky | active | KEEP-ALT | ~$427-819 (conflicting) | law-firm-grade docs, bring own bank | incorporate, SAFE/option docs | pre-seed to seed |
| doola | active | KEEP-ALT | $297/yr+ (to $2,999 BiaB) | formation + compliance subscription, non-US/LLC | form, RA, address, bookkeeping/tax | non-US solo |
| Firstbase | active, status uncertain | KEEP-ALT | $399 + $299/yr RA | foreign-founder formation + mailroom | form, RA, mail | non-US solo |
| Stable (UseStable) | active (YC) | KEEP | $49-59/mo Grow; 50% off yr 1 if <$1M rev | virtual mailroom with scan/forward/deposit | address, scan, forward | solo remote to seed |
| Mercury | active, charter pending | KEEP | $0 / Plus $29.90 / Pro $299 | bank-first operating account | invoices, bill pay, treasury, feeds | pre-seed to Series A |
| Ramp | active | KEEP | Free; Plus $15/user + platform fee | spend software layer, AI coding/close | cards, receipts, approvals, bill pay | seed to growth |
| Brex | acquired (Capital One, Apr 2026) | KEEP-ALT | custom/low published | high limits on cash, travel, global | cards, expenses | VC-backed, post-seed |
| QuickBooks Online | active | KEEP | ~$38-115/mo | traditional GL, you/bookkeeper categorize | feeds, categorize, reconcile, close | all |
| Xero | active | KEEP-ALT | $27/$59/$97 (Oct 2026) | simpler GL, unlimited users | same | solo, intl |
| Pilot | active | KEEP | AI ~$99; human ~$349-849/mo | people+software closes books | monthly close, tax, CFO add-on | seed to Series A |
| Fondo | active | KEEP-ALT | ~$299-599/mo | startup tax/R&D specialist | bookkeeping, 1120, R&D credit | seed-stage VC-backed |
| Rivet | unverified | UNVERIFIED | n/a | n/a | n/a | n/a |
| Bench | shut down Dec 2024 | DEAD | n/a | n/a | n/a | n/a |
| Kick | active | KEEP-ALT | free <250 txns; ~$40/mo | AI bookkeeping + accountant review | auto-categorize, review | solo/micro |
| Puzzle | active | KEEP-ALT | ~$25-300+/mo | AI-native GL, 2.0 software+services | AI Close, reports | seed |
| Digits | active | KEEP-ALT | ~$65-250+/mo | agentic GL + MCP | auto-close, reports | seed to A |
| Stripe Billing | active | KEEP | 0.7% of billed volume | billing welded to payments | subs, invoices, dunning, portal | all |
| Metronome | acquired (Stripe) | KEEP-ALT | Startup plan ($100K allotment) | event metering, pricing-as-code | usage plans, credits | AI/usage cos |
| Orb | acquired (Adyen, Jul 2026) | KEEP-ALT (roadmap risk) | quote | event-stream usage billing | metering, plan versions | AI/usage cos |
| Chargebee | active, plans in flux | KEEP-ALT | unclear (~0.8%) | finance-ops subscription mgmt | invoicing, rev-rec | B2B $1M+ ARR |
| Lago | active | KEEP-ALT | OSS free; managed quote | self-hosted open-source billing | metering, invoices | eng-led usage |
| Carta | active | KEEP | free-tier(?) / ~$3K+/yr | investor-standard system of record | cap table, 409A, grants | seed to growth |
| Pulley | shut down Dec 8, 2026 | DEAD | $1,200/yr (last) | n/a | migrate to Carta by Nov 30 | n/a |
| captable.io | unverified/legacy | UNVERIFIED | free (old) | basic web cap table | model rounds | pre-seed |
| AngelList Stack/RUV | cap table closed to new (Aug 2026) | KEEP-ALT for RUVs/SPVs | SPV ~$8K+$2K | vehicles collapse angels into one line | RUV, SPV | seed |
| Crosby | active, $60M Series B | KEEP | per-document fixed (unpublished) | lawyer-in-loop AI law firm via Slack | send contract, redline in ~1 hr | pre-seed to growth |
| PandaDoc | active | KEEP | ~$19/seat/mo | proposals + e-sign | quote, send, sign | sales-led |
| Juro | active | KEEP-ALT | quote ($15K+/yr est) | in-house browser CLM | templates, approvals | seed+ with counsel |
| Ironclad | active | OUTDATED for small teams | $30K+/yr est | enterprise CLM | workflows | enterprise |
| Codi / office mgmt | active (new) | optional | n/a | AI office manager agent | scheduling, vendor admin | 10+ staff |

## 11. Open items (not verified)
Rivet; captable.io current status; Firstbase acquisition; Ramp/Chargebee/Lago/Clerky official prices; Brex post-acquisition product changes; AngelList primary notice; Zest/Zestful/Embroker status; Digits and Puzzle current price pages.
