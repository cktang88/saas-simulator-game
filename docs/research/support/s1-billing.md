# S1: Billing support flows for a small SaaS / subscription app (2026)

Scope: six flows: (1) invoices, receipts, VAT, PO numbers; (2) refunds; (3) charged-after-cancel; (4) disputes and chargebacks; (5) plan changes and cancellations via support; (6) failed payments and card updates.

Source-quality legend: [src] = primary or official source; [secondary] = vendor or law-firm summary, checked but not against the primary text; [unverified] = seen in search snippets only; [design] = my estimate for the simulator.

Caveat on volumes: I did not find a sourced share-of-tickets figure for any of these flows. Frequencies below are [design] unless a source is named. Tier split: B2C = consumer app, SMB = self-serve B2B under about $1k/mo, Enterprise = invoiced accounts.

---

## Flow 1: Invoices, receipts, VAT invoices, PO numbers

**Trigger and frequency.** [design] In a self-serve SaaS, invoice and receipt requests are roughly 3-6% of tickets. Enterprise and SMB accounts with finance teams generate most of them, often as a finance-team request 2-4 weeks after the purchase. VAT-invoice corrections (wrong VAT ID, wrong legal name) are a subset, roughly 1% of tickets [design].

**Handling.** Self-serve receipts should come from the billing provider automatically. Support's job is to point the customer to the billing portal, then fix the exceptions.
1. Find the invoice in the billing system (Stripe, Paddle, Lemon Squeezy or Polar) and confirm the legal entity, country and tax ID on the customer record.
2. If the customer is in the EU and the merchant of record is the company itself, the invoice must carry the mandatory full-invoice fields from Article 226 of the VAT Directive 2006/112/EC: sequential number, issue date, supplier and customer details, VAT numbers, and description of supply, rate and amount [secondary: legislation.gov.uk copy; Stripe EU VAT invoice guide]. A simplified invoice (Article 226b) is allowed only for smaller amounts, generally up to EUR 100, and up to EUR 400 under Article 238 in some cases [secondary]. Confirm the national rules for the specific Member State before relying on the threshold.
3. If the merchant of record is Paddle, Lemon Squeezy or Polar, the MoR issues the VAT invoice and collects the VAT. Support must say so, and must not promise a company-issued invoice.
4. For a PO number or vendor form: add the PO number as a field on the invoice (most billing tools support custom fields), send a W-9 or the local equivalent, and set the net-30/60 terms on the account. Do not invent a PO process.
5. Tag `billing/invoice`, add an internal note with what was changed, and close with the portal link so the customer can self-serve next time.

**Time and SLA.** About 5-10 minutes per case [design]. Same business day for enterprise and finance requests, 24 hours for SMB, and first-response within the normal window for B2C.

**AI.** Safe for "where is my receipt" and resending PDFs, which should be automated. Not safe for editing legal entity names, VAT IDs or tax treatment. Those need a human with the billing system open.

**Stellar vs good vs average vs mediocre.**
- Stellar: fixes the invoice in one reply, sends the corrected PDF with the change explained, checks the VAT ID validity, and sets the customer record so the next invoice is right. Adds the PO field and a vendor-form checklist before the customer asks.
- Good: correct invoice, one follow-up.
- Average: sends the wrong document first, then a second one.
- Mediocre: says "we can't do VAT invoices," or issues a receipt that is not a valid invoice, which the customer's accountant rejects.

**Consequences.** A wrong VAT invoice blocks the customer's VAT reclaim and creates a tax-compliance issue for both sides. Repeated re-issues create reconciliation work for the customer's AP team, which is a common reason enterprise accounts churn at renewal [design]. A mis-issued invoice that changes a tax amount can create a sales-tax or VAT filing error that surfaces at your next filing.

**Sources.** Legislation: EU Council Directive 2006/112/EC, Articles 226, 226b, 238 (legislation.gov.uk copy, [secondary]). Stripe, "EU VAT invoice content requirements" (stripe.com, [secondary]). Vatupdate summary, Art. 226 (vatupdate.com, 2022, [secondary]).

---

## Flow 2: Refund requests (policy, partial, prorated, store refunds)

**Trigger and frequency.** [design] For subscription apps, refund requests are about 2-5% of tickets, and most arrive within 7 days of a renewal. Store-purchased subscriptions are a large share of B2C refund requests because the developer cannot issue the refund.

**Handling.**
1. Identify the purchase channel first: web (Stripe, Paddle), Apple App Store, or Google Play. This decides everything else.
2. Web purchase, within the refund policy: refund or partial refund in the billing tool, then cancel future renewal. Use the policy text, not improvised judgment. Prorated refunds are a policy choice; state the rule and apply it the same way every time.
3. Web purchase, outside the window but with a real reason (outage, duplicate charge, bug): use the goodwill path, with a tag and a manager approval if the amount is above a threshold you set. Log it so you can measure goodwill abuse.
4. App Store purchase: developers generally cannot issue an Apple refund. Apple's request page is reportaproblem.apple.com; the customer must submit it, and Apple decides [secondary: developer help-center summaries]. Support should send the customer the link and the steps, and also cancel the renewal on the account if they ask. Do not promise a refund you cannot deliver.
5. Google Play purchase: developer-issued refunds are generally not available. The customer submits through Google's refund request flow. Google's refund is more likely within the first 48 hours, and older charges are reviewed case by case [secondary].
6. Close the ticket with the decision, the amount, the date the money should arrive, and what happens to access.

**Time and SLA.** 5 minutes for policy refunds, 10-20 minutes for store-refund explanations. Enterprise refunds go through an account owner.

**AI.** Good for policy questions and store-refund routing (show the Apple or Google steps). Not safe for approving exceptions or deciding goodwill. Mis-applying a refund policy through an AI agent is a common source of inconsistency complaints.

**Stellar vs good vs average vs mediocre.**
- Stellar: knows the channel before answering; for store purchases gives the exact steps and the expected timing; offers the next-best option (downgrade, pause) when a refund is not allowed; writes the refund into the record with a reason code, so the refund rate can be analysed by cause.
- Good: correct policy, correct channel.
- Average: refunds everything that is asked for, without checking the cause, which teaches customers to ask.
- Mediocre: promises an App Store refund it cannot process, then it fails and the customer escalates to a chargeback or a 1-star review.

**Consequences.** Refunds have a direct cost, and "refund because the cause was not fixed" repeats. Promising a store refund that doesn't happen turns a refund ticket into a chargeback (Flow 4) and a bad review. Over-refunding in the first 7 days is the easiest revenue leak to measure [design].

**Sources.** Apple and Google refund routing: developer help-center summaries (timeleft, Polycam, Circuit; [secondary]). Apple's own Report a Problem page and Google's refund request page are the primary sources to check; I did not fetch them for this brief.

---

## Flow 3: "I was charged after I cancelled" / forgot to cancel

**Trigger and frequency.** [design] This is one of the most common subscription complaints, roughly 4-8% of tickets in subscription B2C and 2-4% in SMB [design]. The cause is usually one of: cancellation done in the app but not on the web (or the reverse), cancellation at a store while the web plan still renews, a trial that converted, or a plan change that was not reflected.

**Legal context (affects how you handle it).**
- The FTC's Click-to-Cancel (Negative Option) rule was vacated in its entirety by the Eighth Circuit on 8 July 2025 [secondary: Alston & Bird, Cooley]. ROSCA (the federal Restore Online Shoppers' Confidence Act) still applies, and the FTC is still enforcing against cancellation practices. The FTC issued an ANPRM on the negative-option rule on 11 March 2026, with comments due 13 April 2026 [secondary: Gibson Dunn]. Treat the federal rule as unsettled.
- California's auto-renewal amendments (AB 2863) took effect 1 July 2025 [secondary: Cooley, Fenwick]. They cover free trials that convert to paid, require an online "click to cancel" button when the sign-up was online, require a cancellation route that matches the enrolment medium, require calls to be answered promptly for phone cancellation, require voicemails cancelling to be processed or returned within one business day, require annual reminders, require 7-30 days' notice of a fee change, and require consent records kept for at least 3 years (or 1 year after termination, whichever is longer) [secondary].
- EU consumers have a 14-day withdrawal right for distance contracts. Whether it applies to a digital service started immediately depends on the consent and waiver mechanics. A law-firm note reports a CJEU judgment in Case C-234/25 (9 July 2026) that streaming is a digital service, which could narrow the waiver route [unverified]. Directive (EU) 2023/2673 is reported to require a withdrawal function (a clearly labelled button) for online contracts from 19 June 2026 [unverified]. Check the primary texts before relying on either.

**Handling.**
1. Pull the full subscription history: channel of each charge, cancel timestamp, renewal date, any trial conversion, and any active store subscription.
2. If the customer cancelled before the renewal and the charge still went through, it is a system failure: refund the charge, fix the cancel path, and tag `billing/cancel-failure`. Open an engineering ticket if more than one customer has the same cause.
3. If the customer did not cancel but forgot, check the reminder history (required in CA for annual plans). If the reminder was not sent, the refund is more likely to be granted; if sent, the decision follows the policy, usually a refund within a short window plus a clear cancel step.
4. If the charge came from a store, the store is the path (Flow 2).
5. Cancel the renewal, confirm in writing, show where the cancel button is, and record the outcome.

**Time and SLA.** 10-15 minutes. Same day for an active charge, because the customer can call the card issuer and start a dispute (Flow 4) within hours.

**AI.** Good for checking the cancel state and explaining where to cancel. Refund decisions and "was the cancel path broken" need a human with logs.

**Stellar vs good vs average vs mediocre.**
- Stellar: checks logs before replying, admits a cancel-path failure, refunds without making the customer argue, cancels the renewal in the same reply, and sends a short note explaining how the cancel is now shown. Adds a reminder and the cancel path to the account page.
- Good: refund and cancel, clear steps.
- Average: refuses with policy language without checking the logs.
- Mediocre: says "you must have forgotten," after a cancel that actually failed. This is the complaint that becomes a chargeback, a BBB or AG complaint, and a viral post.

**Consequences.** A cancel-path bug that charges customers is a regulatory issue (ROSCA, state auto-renewal laws), not just a support issue. Each unwanted charge that is disputed costs the dispute fee and counts toward the chargeback ratio (Flow 4). Customers who are charged after cancelling churn and leave negative reviews [design].

**Sources.** Alston & Bird, "FTC Click-to-Cancel Rule Vacated" (July 2025, [secondary]); Cooley, "Eighth Circuit Vacates the FTC's Negative Option Rule" (July 2025, [secondary]); Gibson Dunn, FTC restarts negative option rulemaking (2026, [secondary]); Cooley, "California Automatic Renewal Law Amendments Take Effect on July 1, 2025" (4 June 2025, [secondary]); Fenwick, "California tightens requirements for automatically renewing subscriptions" ([secondary]).

---

## Flow 4: Card disputes and chargebacks

**Trigger and frequency.** [design] For a healthy SaaS, dispute rate should be well below 0.5% of transactions. Most disputes are "friendly fraud" (the cardholder does not recognise the merchant descriptor or forgets the charge) or real cancel-failure disputes. Secondary sources put friendly fraud at 60-75% of chargebacks [secondary: vendor blogs, unverified]. Treat as directional.

**Thresholds (the ones that get accounts flagged).**
- Visa's Acquirer Monitoring Program (VAMP): the merchant "excessive" ratio is reported to have dropped from 2.2% to 1.5% as of April 2026 for North America, EU and APAC, with a minimum of about 1,500 applicable transactions. The ratio combines fraud reports (TC40) and non-fraud disputes (TC15), divided by settled transactions. Disputes resolved through pre-dispute tools (Visa RDR, Verifi CDRN) are reported to be excluded [secondary: Chargeflow, Chargebackhelp]. Non-compliance fees of about $8 per dispute are cited [secondary]. Acquirers often set stricter internal thresholds that are not public.
- Mastercard's Excessive Chargeback Program: reported entry at 100 or more chargebacks in a month with a ratio of at least 1.5%, and a higher tier (HECM) at 300 or more and 3% [secondary: Chargebacks911, Chargeback.io]. Exit is reported as three compliant months [secondary]. Note that the sources disagree on the timing of the ratio calculation.
- Stripe does not impose its own rate limit; it reports to the networks and can suspend the account if the ratio is high [secondary: chargeback.io].

**Response deadlines and fees (Stripe, US).**
- Response window: set by the network and reason code; Stripe's guides say about 5-21 days, with third-party guides saying 7-21. Check the dashboard for each dispute. If no response is filed, the cardholder wins by default [secondary: Stripe guide, Redo].
- Issuer decision: Stripe's guide says 60-75 days after evidence is submitted [secondary].
- Fees: $15 "dispute received" fee, not refunded; a further $15 "dispute countered" fee charged when you submit evidence, refunded if you win; the countered fee applies to disputes opened from 17 June 2025 in the US [secondary: Redo, chargeback.io; confirm on Stripe's pricing page].

**Win rates.** I did not find a reliable 2025 primary benchmark for merchant win rates. Vendor estimates conflict: 15-20% on friendly fraud under standard evidence, versus 40-60% with Compelling Evidence 3.0 [secondary]; a roundup cites 42-54% for merchants who submit representment [unverified]. Use these as ranges with wide error bars, and track your own win rate by reason code.

**Handling.**
1. Triage the same day. Check the reason code, the transaction date, the amount, the matched customer and whether the charge was a renewal, a plan change or a refund that did not post.
2. If the cancel or refund was real and the issuer is wrong, respond with evidence: the customer's usage log, the cancel timestamp, the terms accepted at sign-up, the reminder email, and the IP and device data that match earlier undisputed transactions (required for Compelling Evidence 3.0 under condition 10.4: at least two matching data elements from prior undisputed transactions) [secondary: Chargeflow].
3. If the charge is a legitimate error (double charge, post-cancel charge), refund first and then accept the dispute. Refunding before disputing can reduce ratio impact where your processor permits [design; confirm with your acquirer].
4. Do not contact the cardholder to ask them to withdraw the dispute unless your processor's rules allow it; that is a common route to a flagged account.
5. Record outcome, reason code and cause in your billing log. A dispute with no internal cause is the signal to fix the product.

**AI.** Triage and evidence assembly can be assisted. Filing the response should be human-reviewed because the statement is legal-adjacent.

**Stellar vs good vs average vs mediocre.**
- Stellar: refunds real errors before the dispute is filed (preventing the dispute in most cases), responds within the window with a complete evidence packet, tracks win rate and ratio weekly by reason code, and fixes the root cause (for example, a clearer statement descriptor or a visible cancel button).
- Good: responds on time with complete evidence.
- Average: misses the deadline, or submits evidence without matching data.
- Mediocre: ignores disputes, so they are lost by default, or pushes the customer to withdraw them, which can count against the account.

**Consequences.** Each dispute costs the transaction amount plus $15 (and $15 more if contested and lost, in the US), so a $29/month customer disputed and lost costs roughly $44 plus the lost revenue. A ratio above a network threshold can lead to fines, monitoring programmes, higher reserves, or account termination. These are the consequences that take a company offline [design]. Chargeback volume rising from cancel failures is also the strongest evidence a regulator would use under ROSCA or state law.

**Sources.** Chargeflow, "What are Visa's new VAMP rules" (2025, [secondary]); Chargebackhelp, "Visa VAMP thresholds just got stricter in 2026" ([secondary]); Chargebacks911, "Mastercard chargeback threshold" ([secondary]); Stripe, "An introduction to payment disputes" (stripe.com/guides, [secondary]); Redo, "Stripe chargeback fees" ([secondary]); chargeback.io, "Stripe chargeback policy (2026)" ([secondary]). The Visa and Mastercard rulebooks are the primary sources and I did not fetch them.

---

## Flow 5: Plan changes, downgrades and cancellations via support

**Trigger and frequency.** [design] About 8-12% of SMB and B2C tickets, and most come through email or in-app chat. Common requests: downgrade to a cheaper plan, switch monthly to annual, pause, cancel at period end, or cancel now with a prorated refund.

**Handling.**
1. Confirm the account, the current plan, the billing date and any active discount.
2. Offer the save options in order: downgrade, pause (if you offer it), annual switch, then cancel. Do not block a cancel while offering saves; offer once.
3. For a downgrade, state the effective date. Usually this is the next renewal to avoid a surprise proration charge; if the customer wants it now, state the proration rule and the credit amount in writing.
4. For monthly-to-annual, state the charge amount now and the discount, and confirm the customer agrees in writing.
5. For cancel, cancel at the period end by default, confirm the access end date and the data retention period, and log the reason code (price, unused, competitor, missing feature, bug, support).
6. For CA customers, make sure the cancel route matches how they signed up (Flow 3). For phone cancels, answer promptly; for voicemails, process or return the call within one business day [secondary: AB 2863 summaries].

**Time and SLA.** 5-10 minutes. Same-day for cancel requests.

**AI.** Good for the downgrade, cancel and save flows if the agent can change the subscription through an audited tool and show the exact outcome. Risky if the agent can issue refunds or waive fees without a rule.

**Stellar vs good vs average vs mediocre.**
- Stellar: makes the cancel easy, offers one relevant save, records the reason, and sends a follow-up that asks for a win-back condition. Retained customers stay with a fix to the problem they raised.
- Good: complete, correct, respectful.
- Average: pushes three save offers, or refuses to cancel until the customer repeats the request.
- Mediocre: the cancel silently does not take effect, or a trapped customer files a chargeback (Flow 3).

**Consequences.** Trapped cancellations are a legal exposure under state auto-renewal and ROSCA rules, and a dispute source. Reason-code data is the cheapest signal you have on product fit; poor logging means the same churn repeats [design].

**Sources.** Cooley and Fenwick California summaries (July 2025, [secondary]); FTC ROSCA enforcement summaries (Gibson Dunn, 2026, [secondary]).

---

## Flow 6: Failed payments and card-update help

**Trigger and frequency.** Involuntary churn is reported at 20-40% of total churn in vendor sources, with one outlier at 53% [secondary; vendor marketing, unverified]. A 2025 Recurly report puts median B2B SaaS annual churn near 3.5%, split 2.6% voluntary and 0.8% involuntary [secondary]. These two figures conflict on the denominator, so treat both as directional. Expired or replaced cards are reported as the largest cause of failures, at about 40% [unverified]. [design] For support, failed payments are roughly 3-6% of SMB and B2C tickets, mostly "my card was declined" and "how do I update my card".

**Handling.**
1. Check the failure reason code: insufficient funds, expired card, do-not-honour, fraud block, or 3-D Secure not completed. Each has a different fix.
2. For expired or replaced cards, send the portal link to update the card. Do not ask for card numbers over email or chat; send the secure link.
3. If the card is blocked for fraud, tell the customer to check with their bank, and do not retry the card manually.
4. For a bank 3-D Secure issue, send the customer to complete the verification on the invoice page.
5. Confirm the new card has been charged and the subscription is active, and tell the customer about the grace period (how long before access is cut). Check the dunning schedule is actually sending the reminders.
6. Tag `billing/failed-payment` with the reason code. Repeated card-decline causes point to pricing or product issues (for example, a missing local payment method), not support issues.

**Dunning and card-updater baseline.** Recovery of failed recurring payments is reported at about 50-60% as a working baseline, with vendor claims up to 80% [secondary; vendor marketing]. Stripe Smart Retries and the Card Account Updater are the standard tools; Stripe says the updater refreshes expired or reissued cards in the US for most Visa, Mastercard, Amex and Discover cards [secondary: Stripe newsroom]. Stripe's claim that Smart Retries recovered $6.5 billion in 2024 is [unverified].

**Time and SLA.** 5 minutes. Most customers self-serve once given the portal link.

**AI.** Very safe for the update-card flow and reason-code explanations. Do not let AI request card details in chat.

**Stellar vs good vs average vs mediocre.**
- Stellar: explains the specific reason, sends the secure link, confirms recovery, and reports the cause pattern to product or billing, so the failure rate drops (for example, by enabling card updater, adding a second payment method, or fixing a 3-D Secure flow).
- Good: correct link and steps.
- Average: asks the customer to retry the same card again and again.
- Mediocre: asks for card numbers in a support email, which is a security and PCI problem, or lets access cut off with no notice.

**Consequences.** Each lost renewal is a churned customer unless the card is fixed within the grace period. Asking for card data in email creates a PCI scope issue and a security incident risk [design]. Repeated declines on one card look like card testing to the issuer and can hurt your ratio if the cards are being tested by fraudsters.

**Sources.** Stripe newsroom, "Stripe expands network tokens and card account updater to improve conversion" ([secondary]); Flycode, "Stripe Smart Retries: adaptive acceptance explained 2026" ([secondary]); Churnkey, "Stripe Smart Retries: FAQs and best practices" ([secondary]); Recurly Churn Report 2025 (as cited in secondary sources, [unverified]); Withorb, dunning and failed payment recovery statistics ([secondary]).

---

## Cross-flow notes

- The cancel path, the refund path and the card-update path all feed the chargeback ratio. A single cancel-path bug affects Flows 2, 3, 4 and 5 at once, so track by root cause, not by ticket type.
- Dispute ratio thresholds are the hard ceiling. Reported Visa VAMP (1.5%) and Mastercard ECP (1.5% with 100+ chargebacks) numbers are [secondary] and change; confirm with your acquirer.
- The FTC click-to-cancel rule is vacated, but ROSCA and state auto-renewal laws (CA in particular) are in force and enforced. Build the cancel path to the CA standard and it will pass most state rules.
- Items that I could not source and that the simulator should mark as [design]: all ticket-share frequencies, all time-per-case figures, SLA norms, and goodwill thresholds.
