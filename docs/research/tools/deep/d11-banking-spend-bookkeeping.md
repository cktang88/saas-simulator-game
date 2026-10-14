# D11: Banking, spend and AI bookkeeping tools - deep dive

Research date: 2026-10-14. Tags: [unverified] = secondary sources only; [design] = my estimate.
Primary sources were the vendor pricing and help-center pages where they loaded. Several vendor pages returned 404 to the fetch tool (Brex expense page, Ramp AI product page, Brex/Pilot/Kick FAQ variants); those claims are marked accordingly.

Tools covered: Mercury, Ramp, Brex, Pilot, Digits, Puzzle, Kick.

---

## 1. Mercury

**Summary.** Mercury is a startup-focused business bank (banking is provided through partner banks; Treasury is a sweep product) for venture-backed and bootstrapped software companies. Its 2026 positioning is "banking plus operations": accounts, cards, invoicing, bill pay, Treasury, 1099s, and accounting sync in one dashboard. Admins and bookkeepers are the main users; founders use it as the single operating account. Pricing (mercury.com/pricing, fetched 2026-10-14): **Mercury $0/mo** (banking, unlimited invoices, unlimited bill pay, Treasury unlocked at a $250K balance, 1.5% cashback on corporate cards); **Mercury Plus $29.90/mo** (recurring invoices, ACH-debit invoicing at $1 per transaction, unlimited 1099 filings); **Mercury Pro $299/mo** (relationship manager, NetSuite categorization, ACH-debit invoicing at $0 per transaction). Annual billing shows a 15% discount. Mercury Books is listed at $35/mo, waived until Dec 31, 2026. Some pages and reviews quote Plus at $35 and the FAQ says paid plans start at $35; treat the $29.90 table figure as the one to verify. Treasury yield is quoted as "up to 4.05%" on the pricing page (reviews show lower figures, so use a range). Treasury is not FDIC-insured [unverified, from a review].

**Data model.**
- Organization: entity name, EIN, plan tier, users with roles (admin, bookkeeper, custom).
- Account: checking, savings, Treasury (balance, target, yield). Each account belongs to a partner bank.
- Transaction: id, date, amount, counterparty, description, memo, category/GL code, attachments (receipts), status (pending/posted), linked invoice or bill.
- Auto-transfer rule: type ("maintain a target account balance"), rule account, min/max balance, supporting Treasury account, schedule. Up to 20 receiving accounts per rule; admins only create or edit.
- Invoice: customer, line items, due date, branding, payment methods (card/Apple Pay/Google Pay via Stripe, ACH, wire, ACH debit, "pay with Mercury"), status (sent/paid/overdue/off-platform paid), recurrence.
- Bill (bill pay): payee, amount, date, funding account, approvals, GL codes (multiple GL codes on Plus per pricing page).
- Card: virtual or physical, owner, limit, merchant lock, receipt attachments.
- 1099 record: payee, tax form, filing status.

**Main workflows.**
1. **Setup and onboarding.** Sign up with company details, EIN, beneficial owners (KYC), upload formation docs; the app then provisions checking. Invite bookkeeper and set custom permissions (admins get access automatically; custom users can be granted "send invoices" or "create payment links"). Aha moment: first inbound ACH arrives with an auto-generated account number.
2. **Create and send an invoice.** Workflows > Invoicing tab. Set logo and color (branding is paid-plan only per help page, [unverified] which tier). Add customer and line items, choose payment methods, send. Customer pays by card/ACH/wire via a link. One-click reminder available on the invoice list. Filter by status; "mark as paid" for off-platform payments with date and method.
3. **Recurring invoices (Plus+).** Set repeat frequency on an invoice; the next send is generated automatically.
4. **Bill pay.** Pay bills from checking or savings. Help content available in-app described approvals, scheduling and ACH/check options only at a high level; the detailed flow was not verifiable [unverified].
5. **Treasury auto-transfer rule.** Accounts > Auto transfer rules > Create rule > "Maintain a target account balance" > choose rule account, set min and/or max, select Treasury as supporting account > Create rule. Transfers from Treasury are limited to two per month and dates must be at least seven calendar days apart. Rules run at 6:00 AM PT on business days; if underfunded the rule is skipped, the admin gets an email, and it retries on future dates.
6. **Monthly close handoff.** Paid invoices and bank transactions sync to QuickBooks, Xero or NetSuite through bank feeds; CSV export also available. The founder's job is to categorize exceptions and approve the books.
7. **Daily loop.** Open dashboard; check balances and pending items; approve bills; send reminders for overdue invoices. A few minutes a day for a solo founder [design].

**Automation and AI features.** Mercury's AI features are thin compared with bookkeeping tools. Documented automation: auto-transfer rules (Treasury sweeps), recurring invoices, bank-feed categorization into accounting tools, and bill-pay duplicate detection (aggregator claim [unverified]). No published categorization accuracy figure. Human review points: admin approval of rules and bills, categorization fixes in the accounting tool.

**Time saved and impact.** For a solo founder, roughly 1 to 2 hours per month saved on invoice chasing and transfers versus a traditional bank [design]. Costs: Plus $29.90/mo, Pro $299/mo; per-transaction costs: $1 per ACH-debit invoice on Plus; Stripe card fee passes through at about 2.9% + $0.30 per card payment; non-USD card transactions carry a 3% currency fee; non-USD wires 1%.

**Failure modes.**
- Auto-transfer skipped when the source is underfunded; the failure is silent except for an email, so founders miss sweeps [design, from documented behavior].
- Two-transfer-per-month Treasury cap can strand cash when payroll and tax dates collide.
- Invoices that customers pay by ACH debit need opt-in; reminders can look like spam if sent too often.
- Reviewers report 1099/tax-feature pricing confusion and inconsistent tier tables [unverified].
- Bookkeeper permission gaps: only admins can create rules, so bookkeepers must ask.

**Integrations.** QuickBooks Online, Xero (six months free on Plus/Pro per pricing page), NetSuite (categorization on Pro), Stripe (card-payment and payout flows), LegalZoom (compliance plan discount), Brex/Ramp (commonly connected cards via bank feeds). Typical flow: Stripe payouts > Mercury checking > bank feed > accounting tool.

**Sources.**
- https://mercury.com/pricing (fetched 2026-10-14)
- https://mercury.com/invoicing (fetched 2026-10-14)
- https://support.mercury.com/hc/en-us/articles/28768212621332-Setting-up-auto-transfer-rules (search result, read 2026-10-14)
- https://mercury.com/blog/cash-management-methods (search result, 2026-10-14)
- https://howtostartanllc.com/reviews/mercury-review and https://fitsmallbusiness.com/mercury-business-checking-review/ (secondary, [unverified] for yields and fees)

---

## 2. Ramp

**Summary.** Ramp is a corporate card and spend-management platform aimed at companies from seed to enterprise. In 2026 it positions as "agentic" finance: cards with automatic receipt matching, AI categorization, policy enforcement, bill pay, and accounting sync. The core user is the controller or finance lead; employees interact through SMS, email and the mobile app. Pricing (ramp.com/pricing, fetched 2026-10-14): **Free $0/user/mo** (auto-receipt collection and matching, bill pay by ACH/card/check/wire, QuickBooks Online and Xero sync, spend limits with preset accounting codes, unlimited cards at no extra cost); **Plus $15/user/mo** plus a team-size-based platform fee (not stated), with annual billing saving 20% (automated batch payments, payment release approvals, NetSuite/Sage Intacct sync, AI-driven expense reviews and policy insights, auto-lock cards when compliance is unmet); **Enterprise custom** (Workday, Oracle sync; custom policy/workflow configuration).

**Data model.**
- Card: owner, virtual or physical, limit, category/merchant restrictions, lock status.
- Transaction: amount, merchant, date, memo, accounting code(s), receipt(s), status, required-field flags ("(required)" red label).
- Receipt: image or emailed attachment, matched transaction id, match confidence, memo text.
- Policy/spend rule: scope (card, vendor, category, department), limit, approval requirement, auto-approve conditions.
- Reimbursement and bill: payee, approval chain, batch id, payment status.
- Accounting mapping: GL code, class, location, sync status.

**Main workflows.**
1. **Setup and onboarding.** Connect the bank account for funding, add the accounting tool (QuickBooks/Xero/NetSuite), set a default chart-of-accounts mapping, issue cards to founders/employees, set spend limits. Aha moment: first card swipe triggers an SMS asking for a receipt, and the receipt is matched automatically.
2. **Card swipe, in person.** Charge posts; Ramp texts the cardholder that a receipt is needed. Reply to the text with a photo; any text becomes the memo.
3. **Card purchase, online.** Ramp emails the cardholder. Forward the receipt to Ramp's address and include `Memo: ...` in the body (exact format). Gmail users must enable the dynamic email setting.
4. **Missing receipt.** Open transaction > Options > "I don't have a receipt." Canceled transactions use the three-dot menu and need a short reason. Unsubmitted required items can lock the card or funds; the lock clears "up to an hour" after the items are complete.
5. **Controller review.** Review queue shows transactions with missing receipts, memos or codes; approve, request info, or set codes. Policy agent or rule-based approvals route the rest.
6. **Spend rules.** Set limits and restrictions by card, vendor, category or department; enforced at authorization.
7. **Monthly close.** Synced to accounting system; the controller exports or relies on sync. Ramp also offers bill pay and AP automation.

**Automation and AI features.**
- Receipt matching and request via SMS/email (documented in Ramp help center, primary).
- AI categorization: transactions are coded automatically from merchant and memo data [unverified details; secondary review sources].
- AI policy agents: first released July 10, 2025 for controllers. Per the CPA Practice Advisor report, agents enforce policy, approve low-risk expenses or recommend approval with rationale, flag suspicious receipts, answer employee policy questions, and suggest policy edits. Human approvers handle items the agent does not auto-approve. Escalation thresholds are not published.
- Accuracy claim: "Early customers reported 99% accuracy in expense approvals" (Ramp-stated, no method or sample size). A June 2026 secondary blog says a unified agent auto-codes about 60% of invoices and reports 99%+ on travel-policy checks [unverified; check Ramp newsroom].

**Time saved and impact.** Receipt chasing is the main saving; for a 20-person team a controller can save several hours per week, but this is [design] and depends on policy quality. Cost: Free tier is $0 for a solo founder; Plus at $15/user/mo means a 5-user team pays about $75/mo plus the platform fee [design math]. Card rewards are the main economic draw; interchange and cashback rates were not verified in this pass.

**Failure modes.**
- Receipt matching errors requiring manual fixes; a 2026 review calls it occasional [unverified].
- Missed or ignored SMS requests lead to card locks, which is the most disruptive failure for employees.
- Reviewers report slow support responses that can stretch to multiple days [unverified].
- Auto-coding mistakes (wrong GL or class) propagate to the accounting system if sync is automatic.
- Policy agent approvals are only as good as the policy text; gaps let bad spend through.

**Integrations.** QuickBooks Online, Xero, NetSuite, Sage Intacct, Gusto, Rippling, Slack, Stripe, Puzzle (per Puzzle's integrations page). Typical flow: card transaction > receipt matched > category mapped > accounting sync; payroll from Gusto/Rippling for reimbursements.

**Sources.**
- https://ramp.com/pricing (fetched 2026-10-14)
- https://support.ramp.com/hc/en-us/articles/360042588454-Submitting-receipts-and-memos-for-your-Ramp-funds (fetched 2026-10-14)
- https://www.cpapracticeadvisor.com/?p=164684 (Ramp AI agents, July 10, 2025; fetched 2026-10-14)
- https://ai2.work/blog/ramp-hits-44b-valuation-agentic-ai-rewires-corporate-spend (secondary, [unverified])
- https://ramp.com/product/ai (404 at fetch time; not used)

---

## 3. Brex

**Summary.** Brex is a corporate card, spend and banking platform. Its 2026 positioning is a card for companies with cash (no personal guarantee, no hard credit pull for qualifying companies, credit limits marketed as 10 to 20 times a traditional bank card) plus expense policy, approvals and AI expense assistance. Users are finance leads and admins; employees use the app, push notifications, SMS/WhatsApp, and Slack. Pricing (brex.com/pricing, fetched 2026-10-14): **Essentials $0/user/mo** (AI-powered custom rules, multi-level approvals, automated bill pay with approval flows, accounting integrations, AI expense assistant, auto-filled expense reports); **Premium $12/user/mo** (multiple customizable expense policies, dynamic approval chains, spend-limit approval chains, AI compliance audit detection, AI-suggested accounting mapping, customizable ERP/HRIS integrations); **Enterprise** and **Smart Card** custom (unlimited entities, named account manager, admin center). A review site states a conflicting free-tier note; the vendor page is the one to trust. Card limits are not published on the pricing page; reviewers say qualification requires substantial cash balances and that some accounts had limit cuts or closures [unverified].

**Data model.**
- Account/entity: company, entities (multi-entity on Premium/Enterprise).
- Card: holder, virtual or physical, limit, purpose-tied spend limit, merchant restrictions.
- Transaction: amount, merchant, date, memo, receipt (uploaded, forwarded, auto-generated virtual receipt, or affidavit), accounting field mapping, policy status (compliant / violation type).
- Policy: rule type (category, role-based exception, auto-approval), approval chain (single or multi-level), spend limit.
- Expense report and reimbursement: items, approver, status.
- Bill: payee, approval flow, payment method.

**Main workflows.**
1. **Setup.** Admin connects bank accounts, accounting system, sets policies and approval chains, invites employees, and enables notifications (push, SMS, WhatsApp, Slack). Aha moment: the first swipe produces a text asking for a photo; the receipt matches with no manual step.
2. **Employee receipt capture.** Transaction creates a push alert or SMS (if enabled). Reply with a photo, or forward the receipt by email if the admin enabled it. Vendors that supply data get an auto-generated virtual receipt with an alert and no action.
3. **Missing documentation.** Reminders go out 2 to 7 days after the expense. If still missing, an email every Monday until resolved. An IRS-compliant affidavit is available when no receipt exists.
4. **Approver loop.** Approvers receive a Monday email of pending requests and policy flags; they approve or reject in the app.
5. **Policy enforcement.** Spend limits tied to purpose and out-of-policy purchases are blocked at point of sale; violations go to Slack threads if the Slack app is connected.
6. **Expense reports.** AI assistant auto-fills reports from transactions and receipts; employee reviews and submits.
7. **Beta MCP server (April 2026, secondary).** Approved AI assistants can query expenses, cards, limits and reimbursement timing with the same permissions as the user [unverified; single secondary source].

**Automation and AI features.** Auto-matched receipts, virtual receipts for supported vendors, AI expense assistant and auto-filled reports (all tiers), AI compliance audit detection and AI-suggested accounting rules (Premium). Published accuracy: none found for categorization. Human review points: approver decisions, policy exceptions, and any violation a finance person clears.

**Time saved and impact.** Similar to Ramp: a few hours per month for a finance lead in a 10 to 50 person team [design]. Cost: Essentials free per user; Premium $12/user/mo; interchange and rewards terms not verified here.

**Failure modes.**
- Missing receipts pile up and trigger Monday emails; approvers ignore them, creating audit gaps.
- Limit or account reviews without clear explanation (reviewer reports) [unverified].
- Auto-generated receipts can be wrong for some vendors; admins can turn the feature off.
- Notification fatigue: many SMS and Slack prompts per week for frequent spenders [design].
- Qualification and underwriting: sole proprietors are ineligible.

**Integrations.** NetSuite and QuickBooks/Xero (accounting), Slack (violation threads), HRIS for Premium (customizable), Gusto and similar payroll for reimbursements, Stripe and Mercury-style banks as funding sources, and the Brex MCP for AI assistants (beta).

**Sources.**
- https://www.brex.com/pricing (fetched 2026-10-14)
- https://www.brex.com/support/brex-notifications (fetched 2026-10-14)
- Brex receipt help pages (search results; https://www.brex.com/support/receipts-for-expenses and https://www.brex.com/support/how-do-i-auto-forward-my-receipts), read via search snippets only, [unverified] details
- https://www.brex.com/spend/expense-management (404 at fetch time; not used)
- Capterra and CostBench listings (secondary, conflicting free-tier note)

---

## 4. Pilot (Pilot Bookkeeping)

**Summary.** Pilot is a bookkeeping and tax service for startups and small companies. In February 2026 it launched an "AI Accountant" that the company says runs onboarding, historical cleanup, categorization, reconciliation and the monthly close end to end. The books live in QuickBooks Online; Pilot's portal is the front desk for reports and messages. Users are founders and finance leads who want a monthly close without hiring a bookkeeper. Pricing (pilot.com/pricing, fetched 2026-10-14): **Essentials $99/mo** (AI categorization, reconciliation and monthly close; up to $100K monthly expenses; AI answers about past transactions and cash flow); **Core from $0/mo billed annually** (US-based bookkeeper reviews books; reports by the 10th business day; $0 monthly-expense cap on the page, which looks like a placeholder [design]); **Custom, quote-based** (reports by the 6th business day). Tax plans: LLC from $1,000+/yr (from $750/yr for new businesses); S-Corp/partnership from $2,000+/yr; C-Corp from $2,450+/yr. CFO services from $1,750/mo. NerdWallet's review cites much higher earlier prices ($599/mo) and a one-time onboarding fee; the current page shows none, so verify.

**Data model.**
- Company: entity type, tax plan, expense band (monthly expense cap), QuickBooks connection, bank connections (Core includes four institutions).
- Transaction: date, payee, amount, AI category, bookkeeper status, notes/explanations.
- Reconciliation: account, period, status.
- Monthly close: period, due date (10th or 6th business day), deliverables (P&L, balance sheet, burn metrics on some plans [unverified]), status.
- Message/question thread: question about a transaction, answered by AI or bookkeeper.

**Main workflows.**
1. **Onboarding.** Connect bank and card accounts and QuickBooks; Pilot runs historical cleanup (in the AI Accountant version). Founder answers a few questions on entity and tax setup. Aha moment: a clean historical ledger appears without a manual cleanup project [unverified timing].
2. **Daily loop.** Mostly passive: transactions flow in and are categorized. Founder asks questions in the portal ("what did we spend on hosting last quarter?") and gets AI answers.
3. **Monthly close.** Pilot reconciles accounts and closes the books; report arrives by the 10th business day (Core) or 6th (Custom). Founder reviews the report in the portal.
4. **Founder review (what the founder reviews).** Flagged transactions, unusual spend, cash-flow answers, and the close summary. Pilot's pages do not describe a formal sign-off step [unverified].
5. **Tax filing.** Separate tax plan, billed annually, purchased with bookkeeping.

**Automation and AI features.** AI categorizes and reconciles at all tiers; the AI Accountant (Feb 4, 2026, company announcement) claims zero human intervention from onboarding to close, with logged decisions for audit. Pilot's own blog frames it as "a major leap"; the autonomy claim is company-reported and independently unverified. Human-in-the-loop: the Core and Custom tiers add a bookkeeper; Pilot does not publish a categorization accuracy rate.

**Time saved and impact.** A founder who would otherwise spend 4 to 8 hours a month on bookkeeping saves most of that [design]. Cost: Essentials $99/mo, or several hundred to thousands per month for managed plans; the tax plan is an extra annual charge.

**Failure modes.**
- Reviews say the close can take too long, especially on lower tiers [unverified].
- No real-time view: books are only reliable after the close, so the founder can be blind for weeks [unverified review].
- Autonomous categorization errors can persist across months if no one reviews them.
- Monthly-expense caps mean a spend spike can push a company into a higher tier mid-cycle.

**Integrations.** QuickBooks Online (primary), bank and card feeds, Stripe, Gusto and Brex/Ramp via QuickBooks [unverified mapping].

**Sources.**
- https://pilot.com/pricing (fetched 2026-10-14)
- https://pilot.com/founders (fetched 2026-10-14; close details thin)
- https://www.cpapracticeadvisor.com/2026/02/04/pilot-rolls-out-fully-autonomous-ai-accountant/177453/ (secondary, Feb 4, 2026)
- https://www.nerdwallet.com/article/small-business/pilot-bookkeeping (older prices, [unverified])
- https://beancount.io/blog/2026/08/22/pilot-ai-accountant-autonomous-bookkeeping-small-business-guide (secondary)

---

## 5. Digits

**Summary.** Digits is an "autonomous general ledger" for small businesses and firms that continuously categorizes and reconciles transactions, with human accountants on firm-partner features. Its 2026 pitch: "Books that keep themselves." Users are founders and accountants who want the ledger always up to date. Pricing: pricing page (fetched 2026-10-14) lists **Essentials $65/mo** (core accounting, 24/7 AI bookkeeping and reconciliation, 12,000+ bank/card/payroll connections); **Core $100/mo** (dimensional accounting, automated schedules); **Pro $250/mo** (budget vs actuals, custom reports and dashboards without a firm-partner requirement; marked "coming soon"). Third-party prices vary ($65 to $99) and reflect older tiers [unverified].

**Data model.**
- Business/entity: name, chart of accounts, dimensions (Core and up).
- Transaction: date, payee, amount, category, dimension tags, match status (matched to source, reconciled).
- Schedule: prepaid, accrual or amortization entry (Core and up).
- Financial statement: P&L, balance sheet, cash flow, dashboard, updated on sync.
- Quality check: flagged error or inconsistency (AI Quality Review; Advanced Quality Checks on all tiers).

**Main workflows.**
1. **Setup.** Connect banks, cards and payroll (claims 12,000+ connections); the ledger backfills. Aha moment: P&L and balance sheet render without a manual close.
2. **Daily loop.** Transactions arrive, are categorized and matched against source documents; founder glances at the dashboard.
3. **Quality review.** AI Quality Review flags errors and inconsistencies; founder clears flags.
4. **Schedules (Core+).** Detect recurring entries (prepaids, amortization) and post them.
5. **Month-end close.** The FAQ says reconciliations, accrual and amortization schedules and statement collection are automated; the tier mapping for close is firm-oriented and not verified per plan [unverified].
6. **Custom reports (Pro, or firm-partner on lower tiers).**

**Automation and AI features.** Categorization and reconciliation as transactions sync, auto-generated schedules, AI quality checks. Accuracy claims: Digits' comparison page says 97.8% categorization accuracy in its own benchmark, ahead of frontier models it tested; its launch release claims its models beat GPT-4o by 54%. Neither is independently verified; the pricing page itself gives no accuracy number. Testimonials: "What used to take me four hours a day now takes just 15-20 minutes" and "6 hours per client" (no methodology). Human review points: quality-check flags, tax judgments, unusual transactions, and anything touching firm-partner features.

**Time saved and impact.** For a founder with a simple SaaS ledger, 1 to 3 hours per month saved on categorization [design]. Cost: $65 to $100 per month per business.

**Failure modes.**
- Self-reported accuracy is not third-party tested; expect misclassification on unusual vendors and mixed-purpose card charges [design].
- Schedules (accruals, amortization) are only as good as the detected patterns; a wrong schedule posts wrong entries every month.
- Custom reports on lower tiers depend on firm partners, which can add delay.
- Reconciliation to source only works for connected accounts; cash or personal-card spend is invisible.

**Integrations.** Banks, cards and payroll providers (per pricing page, 12,000+); accounting export to QuickBooks-compatible views [unverified]; firm-partner accountants for reporting.

**Sources.**
- https://digits.com/pricing (fetched 2026-10-14)
- https://digits.com/accountants/compare/ (Digits' own comparison, search result, 97.8% claim, [unverified])
- https://www.cpapracticeadvisor.com/2025/03/11/digits-autonomous-general-ledger-will-take-on-quickbooks-company-says/157183/ (March 2025 launch, secondary)
- https://startupowl.com/setup/ai-bookkeeping-for-small-business (July 2026 price secondary, [unverified])

---

## 6. Puzzle

**Summary.** Puzzle is an AI-native accounting platform for startups and small businesses that replaces manual bookkeeping and month-end close, with an option for expert-reviewed books. Its user is a founder or a controller in a startup who wants Stripe, Brex, Ramp and payroll data to flow into a real ledger. Pricing (puzzle.io/pricing, fetched 2026-10-14): **Starter $30/mo** (1 seat, 25 lifetime AI credits, up to 98% auto-categorization, auto-drafted financial statements, unlimited connections); **Core $72/mo** (5 seats, 25 lifetime AI credits; "Core + Expert Reviewed" at $171/mo up to $10K monthly expenses, requires Puzzle subscription); **Complete $120/mo** (unlimited seats, 100 AI credits/month, AI-powered accuracy review and reconciliations, integrates with Stripe, Ramp, Mercury, Brex); **Scale $360/mo** (unlimited seats, 300 AI credits/month, no transaction limits). Annual billing shows "save 20%" and "starter is free for 2 months" (annual prices not listed). Secondary sites list conflicting tiers ($25 to $300) that appear outdated; Usagepricing notes at least five repricings since 2023 [unverified].

**Data model.**
- Company: entity, seats, AI credit balance, connections.
- Transaction: date, amount, counterparty, category, AI confidence, review status.
- Reconciliation: account, period, status.
- Financial statement: P&L, balance sheet, cash flow (drafted and updated).
- AI credit: consumed per action (categorization batches, accuracy review, chat).
- Close task list: per month, per account (AI Close).

**Main workflows.**
1. **Setup.** Connect Stripe, Mercury, Ramp, Brex and payroll (Gusto), and the accounting ledger. Choose a plan; Starter is free for two months annually. Aha moment: the drafted P&L appears before the founder has done any manual categorization.
2. **Daily loop.** Founder checks the dashboard; AI categorizes incoming transactions.
3. **Review.** Founder approves or corrects categorizations; corrections teach the model [unverified].
4. **AI Close.** Monthly reconciliations and draft statements; the founder approves the close. Paid add-on on the Usagepricing reading; included in Complete and Scale per the vendor's tier table.
5. **Expert Reviewed (Core).** A human accountant reviews the monthly books for up to $10K monthly expenses.
6. **Chat.** Ask questions about the books ("what's our burn?") in the AI Suite chat; credit cost applies.

**Automation and AI features.** AI categorization (Starter up to 98% claimed; no methodology), AI accuracy review and AI reconciliation (Complete+), auto-drafted statements, AI Chat and "Cowork" [unverified feature detail], AI Close. Human review: expert review on Core+; founder approval for close and categorization exceptions.

**Time saved and impact.** Likely 3 to 6 hours per month for a startup finance owner [design]. Cost: $30 to $360 per month; AI credits run out on lower tiers (25 lifetime on Starter and Core), so heavy users move up quickly.

**Failure modes.**
- AI credit exhaustion on lower tiers; actions stop until upgrade [design from published credit limits].
- Expert-reviewed close gated to a transaction-expense band; large spenders get pushed to Scale or Custom.
- Thin reviews (G2: three reviews, 3.8/5 per a secondary read) mean limited external evidence [unverified].
- Pricing and tier churn; plan names and limits change often.

**Integrations.** Stripe, Brex, Ramp, Mercury, Gusto, Rippling, QuickBooks Online, Xero (per Puzzle integrations page and secondary lists).

**Sources.**
- https://www.puzzle.io/pricing (fetched 2026-10-14)
- https://www.puzzle.io/integrations (listed in search results; primary page not fetched)
- https://usagepricing.com/blueprint/puzzle (secondary, [unverified])
- https://www.capterra.com/p/10028909/Puzzle/ (secondary, conflicting prices)
- https://www.g2.com/products/puzzle-financial-inc-puzzle/reviews (thin sample)

---

## 7. Kick

**Summary.** Kick is an AI-assisted bookkeeping and accounting service for small businesses and multi-entity operators, with a hybrid model: AI categorizes, humans (and firm partners) review. Its brand is "the only accounting software that does the work for you." Users are founders and small finance teams. Pricing (kick.co/pricing, fetched 2026-10-14): **Free** (up to $25K annual business expenses; categorization limit 250 transactions/year per the table; 1 entity); **Basic $40/mo** ($480 billed annually; unlimited categorization; 1 entity; new entities get 250 free transactions/year, then $50/mo); **Plus $100/mo** ($300 billed quarterly; unlimited entities); **Advanced $300/mo** (monthly billing only; "Book a call" to start). Close management ("automatically generated task list to close your books across accounts and entities each month") appears on all tiers per the table, though the flattened layout made per-tier checkmarks hard to confirm [unverified]. Kick's FAQ earlier described the free tier as "until you've hit $15,000 in business expenses" and paid plans from $49/mo; treat the current pricing table as authoritative.

**Data model.**
- Business and entities: entity count, tiers.
- Transaction: date, amount, payee, category, reviewer status, attachments.
- Close task: per account, per entity, per month; status.
- Financial statement: P&L, balance sheet, close package.
- Categorization limit: count per year on free plan.

**Main workflows.**
1. **Setup.** Connect banks and cards; choose entity; start on Free or Basic. Aha moment: the first monthly task list appears with reconciled accounts marked done.
2. **Daily loop.** AI categorizes incoming transactions; founder or bookkeeper reviews uncategorized items.
3. **Monthly close.** Work the generated task list across accounts and entities; close each account; marks the month complete.
4. **Review and sign-off.** Founder or accountant reviews categorized exceptions; the close is done when the task list is clear [design].
5. **Advanced (custom).** Book a call; custom close and firm-partner service.

**Automation and AI features.** AI categorization and reconciliation tasks; task-list generation; reviewers describe a hybrid model in which AI does the first pass and humans handle exceptions [unverified]. No published categorization accuracy figure located.

**Time saved and impact.** For a single-entity startup, probably 2 to 4 hours per month saved on close [design]. Cost: $0 to $300 per month depending on tier and entity count; Basic adds $50/mo per extra entity after its 250 free transactions.

**Failure modes.**
- Transaction caps on the Free plan (250/year) trigger quickly for active SaaS accounts.
- Pricing and feature claims conflict across pages and reviews (monthly close gating, $15K vs $25K thresholds, funding); verify before relying on them [unverified].
- Monthly close vs annual close: a Kick Medium post says the company narrowed focus to an annual close, which suggests the monthly product may have changed [unverified].
- Multi-entity counts grow cost quickly.

**Integrations.** Banks and cards via feeds; Stripe and payroll providers [unverified]; QuickBooks/Xero export [unverified].

**Sources.**
- https://kick.co/pricing (fetched 2026-10-14)
- https://kick.co/faq (fetch returned 404; FAQ content from search snippets only)
- https://toolradar.com/tools/kick (secondary, 4.4 from 63 reviews, checked Sept 17, 2026)
- https://dupple.com/reviews/kick (secondary, Sept 2026)
- https://softwareconnect.com/reviews/kick-accounting-software/ (secondary; notes monthly close gated behind a Custom tier, now conflicting)

---

## Cross-tool notes for the simulator

- **The shared loop:** card swipe > receipt prompt (SMS/push) > receipt matched > category/memo set > approver or controller queue > accounting sync > monthly close. Ramp and Brex implement this most fully; AI bookkeepers (Pilot, Digits, Puzzle, Kick) start at the sync step.
- **Biggest recurring pain for founders:** missing receipts and miscategorized card spend, not the close itself. Card-led tools reduce it; ledger-led tools only fix it after the fact.
- **Trust surface:** every vendor's accuracy and autonomy figures are self-reported. The simulator should show the founder reviewing exceptions, not trusting a headline percentage.
- **Pricing is volatile:** 2026 tier tables differ across vendor pages, aggregators and reviews for Pilot, Digits, Puzzle and Kick. Use the vendor page values above and keep the old figures as "competitor-reported" variations if the simulator needs them.
