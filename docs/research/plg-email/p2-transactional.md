# P2: Transactional email for a SaaS or app (research, late 2026)

Research date: 2026-10-15. Labels: **[verified]** = read on the primary page (fetched today); **[secondary]** = from vendor or law-firm summaries found by search, not checked against the primary source; **[unverified]** = single source or conflicting figures; **[design]** = my estimate for the simulator, not a statistic.

---

## 1. Transactional vs marketing: law, practice, separation

**What it is.** Transactional (service) mail is triggered by a user action or account state: signup verification, login codes, magic links, password reset, receipts, invoices, payment failure, trial ending, security alerts. Marketing mail is anything whose primary purpose is promotion: onboarding tips, upsell, newsletters, win-back.

**Legal lines.**
- **CAN-SPAM (US).** The FTC guide says an email's primary purpose is transactional or relationship only if it consists only of content from a short list of categories (facilitating an agreed transaction, warranty or safety information, account or membership changes, and similar). Opt-outs for commercial mail must be honored within **10 business days**, and any opt-out mechanism must work for at least **30 days** after sending. The FTC page gives the per-email civil penalty as up to **$53,088** (page edited January 2024 for inflation adjustment) [verified, FTC business guide, retrieved 2026-10-15]. Mixed messages are the risk: a receipt with a large promo block can be reclassified as commercial [secondary].
- **UK PECR + UK GDPR.** PECR regulates only direct marketing email. Marketing needs consent, or the soft opt-in (you obtained the address during a sale to that person, you market similar products, and you offer an opt-out at collection and in every message) [secondary, ICO guidance via law-firm summaries; unverified against ICO page]. Service messages are outside PECR but still subject to UK GDPR lawful-basis and transparency duties.
- **EU/GDPR.** Transactional mail rests on contract necessity or legitimate interest. Marketing needs consent (or a national soft opt-in analogue). Keep a lawful basis record per email type.
- **Unsubscribe.** Only marketing needs an unsubscribe. Do not put a marketing footer on a password reset. Do not hide an upsell inside a security alert: the FTC has acted against "important account notice" emails that were promotional [secondary].

**Separation (practical).** Separate subdomains per stream (for example `mail.` for transactional and `updates.` or `news.` for marketing), each with its own SPF/DKIM/Return-Path. Separate IP pools for high volume. Postmark's support documentation describes separate infrastructure and IPs for its transactional and broadcast streams, and explicitly recommends separate subdomains per stream [secondary: postmarkapp.com support article, search summary]. Gmail's own bulk-sender guidance is per-domain reputation, so subdomain separation limits blast spillover but does not isolate a shared IP.

**Hours [design].** One-time separation setup: 2–4 hours. Ongoing: 15 minutes a week reading bounce and complaint reports per stream.

**Operator tiers (what a stellar founder does).**
- Stellar: separate transactional and marketing streams from day one, a template registry that tags every email as transactional or marketing, and a legal review of the 3–5 borderline cases (receipts with cross-sell, trial emails).
- Good: separate subdomains, but no tag system; borderline emails reviewed when a complaint happens.
- Average: one domain and one sending account; marketing "newsletter" added to the signup confirmation.
- Mediocre: marketing blasts from the same domain as login codes; no unsubscribe on marketing; no record of consent.

**Mistakes and consequences.** Blasting marketing from the auth domain drags login codes into spam (see section 5). Burying a promo in a receipt can convert it to commercial mail, which carries per-email penalty exposure (FTC) and an opt-out obligation. [design] Each unlabelled borderline template costs roughly one legal review (2–4 hours of founder or lawyer time) when it is later challenged.

**Sources.** FTC CAN-SPAM Compliance Guide for Business, https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business (fetched 2026-10-15, page edited Jan 2024). Postmark message streams, https://postmarkapp.com/message-streams (search summary, Oct 2026). ICO direct-marketing guidance summaries, Burges Salmon / Geldards / Shoosmiths law-firm notes, undated [secondary].

---

## 2. Providers: prices and limits (2026)

All figures are third-party summaries (Apr–Oct 2026). Check each vendor's pricing page before budgeting. Conflicts are noted.

- **Resend** [secondary: usecarly.com/blog/resend-pricing; nuntly.com/resend-pricing; costbench.com; date mid-2026]. Free: 3,000 emails/month, max 100/day, one domain. Pro: $20/mo for 50,000 (or $35 for 100,000). Scale: $90/mo for 100,000, up to $1,150/mo for 2.5M, with intermediate tiers (for example $160 for 200k, $350 for 500k). Enterprise above ~3M/month. Overage on paid plans (conflicting: $0.90 per 1k on Pro in one source, $0.40 in another). Dedicated IP: $30/mo add-on (eligibility conflicting). Logs retained 30 days (one outlier says 7). Marketing email is billed separately by contacts, starting around $40/mo for 5,000 [unverified].
- **Postmark** [secondary: automationatlas.io; emailsoftwareinsights.com; frontdeskreview.com, Sep 2026]. Free: 100 emails/mo, sending pauses when used up. Basic: $15/mo for 10,000 (one source says $10), overage $1.80 per 1k, 45-day retention. Pro: $16.50/mo for 10,000, overage $1.30 per 1k, up to 365-day retention. Platform: $18/mo for 10,000, overage $1.20 per 1k. Dedicated IPs $50/mo each, only on Pro and above, and recommended only above ~300,000 emails/mo [unverified]. No annual discount. Best known for fast transactional delivery and strict separation of streams.
- **Amazon SES** [secondary: dev.to and usecarly, Oct 2026]. À la carte about **$0.10 per 1,000** emails plus $0.12 per GB of data. Dedicated IPs about $24.95 per IP per month (one source says per 1,000 emails; discounted). Reported new bundled plans from July 2026 (Essentials about $0.16 per 1k; Pro $0.22 per 1k plus $105/mo; Enterprise $0.23 per 1k plus $500/mo, per region) [unverified, single source]. SES is the cheapest at scale but the most work: you own the reputation, bounce and complaint handling, and the SNS feedback wiring.
- **SendGrid** [secondary: sender.net, automationatlas.io, Jun–Oct 2026]. No permanent free tier (60-day trial, 100/day). Essentials from about **$19.95/mo**, shared IPs, base volume conflicting (40k, 50k or 100k per source; 50k has most support). Pro from $89.95/mo with a dedicated IP. Marketing Campaigns is a separate product. Overage penalties reported as steep [unverified].
- **Loops** [secondary: sequenzy.com pricing guide dated 2026-06-16; courier.com comparison]. Priced by subscriber count, not by send volume. Free: up to 1,000 contacts and 4,000 sends/mo with a branding footer. Paid from about **$49/mo** for 1k–5k subscribers, with unlimited sends and transactional support (one source says $79) [unverified]. Good fit when marketing and transactional sit in one tool and the list is small. Check its transactional stream separation before using it for auth mail.

**Pricing rule of thumb [design].** At 10,000 transactional emails per month, expect roughly $15–$35 per month on Postmark, Resend or SendGrid, and about $1–$5 on SES plus infrastructure time. At 100 to 3,000 sends a month, all of the free tiers work. The cost gap is small compared with one lost activation or one hour of support time, so choose on deliverability tooling and support, not on the lowest per-1k price.

**Operator tiers.**
- Stellar: picks a provider with separate transactional streams, watches complaint and bounce webhooks, and has a fallback provider configured for login codes.
- Good: one provider, dashboards checked weekly.
- Average: default provider from a tutorial; no alerts.
- Mediocre: a marketing tool used for login codes because it was already installed.

**Sources.** Resend pricing (third-party roundups: https://www.usecarly.com/blog/resend-pricing/, https://nuntly.com/resend-pricing, https://costbench.com/software/email-api/resend/ , accessed 2026-10-15). Postmark (https://automationatlas.io/answers/postmark-pricing-explained-2026/ ; https://frontdeskreview.com/software/transactional-email/postmark/ , Sep 2026). SES (https://dev.to/mr_manushukla/amazon-ses-pricing-plans-in-2026-essentials-vs-pro-vs-enterprise-and-when-a-la-carte-still-wins-1ohg ; https://www.usecarly.com/blog/amazon-ses-pricing/). SendGrid (https://www.sender.net/reviews/sendgrid/pricing ; https://automationatlas.io/answers/sendgrid-pricing-explained-2026/). Loops (https://www.sequenzy.com/pricing/loops ; https://www.courier.com/integrations/compare/loops-vs-resend). Verify all on the vendors' own pricing pages.

---

## 3. Setup: domain, SPF/DKIM/DMARC, bulk-sender rules

**Steps and hours [design].** Choose the sending subdomain, add provider DNS records, verify, publish DMARC, send test mail to Gmail, Outlook and Yahoo, check headers. About 3–4 hours the first time; 30 minutes for each new stream.

1. **Sending domain.** Use a subdomain such as `mail.yourdomain.com` for transactional and `news.yourdomain.com` for marketing. Do not send from a bare apex domain that also carries your corporate mail.
2. **SPF.** One TXT record per sending domain that lists the provider's include. Keep it under the 10-lookup limit.
3. **DKIM.** Provider-generated CNAME or TXT keys. Rotate when the provider asks.
4. **DMARC.** Start at `p=none` with `rua` reporting, move to `p=quarantine` and then `p=reject` after 2–4 weeks of clean reports. Gmail, Yahoo and Outlook each require at least `p=none`.
5. **Alignment.** The visible From domain must align with the SPF or DKIM domain. Misalignment is a common cause of rejections.
6. **List-Unsubscribe.** For marketing and subscribed mail, send `List-Unsubscribe` plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click` per RFC 8058, and a visible body link [verified, Gmail and Yahoo pages]. Transactional mail does not need it, but a support link is good practice.

**Bulk-sender rules (the ones that bite).**
- **Gmail** (verified, support.google.com/mail/answer/81126, retrieved 2026-10-15). Applies to senders above **5,000 messages/day** to Gmail addresses; effective **February 1, 2024**. Requires SPF, DKIM and DMARC aligned to the From domain, one-click unsubscribe for marketing and subscribed mail, and "keep spam rates reported in Postmaster Tools below **0.30%**", with the guidance to stay **below 0.10%** and never reach 0.30%. The 0.3% figure is the official ceiling, not a rumoured one.
- **Enforcement.** Secondary sources say Gmail moved from warnings and spam-folder filtering toward SMTP-level 5xx rejections for non-compliant senders in November 2025, and that Postmaster Tools was replaced by a v2 dashboard in October 2025 [secondary, unverified; sources disagree on how often rejection happens]. Treat the rule as real, enforcement as partly automatic.
- **Yahoo** (verified, senders.yahooinc.com/best-practices). Same 5,000-message scope in practice; SPF and DKIM both, DMARC at least `p=none` with DMARC passing; one-click unsubscribe; unsubscribe requests honored **within 2 days**; complaint rate "below 0.3%" measured on inbox-delivered mail. The page does not exempt transactional mail and recommends separate IPs for bulk versus transactional.
- **Microsoft Outlook.com** [secondary: efidem.com, resend.com blog, spamresource.com, Apr–May 2025]. Enforcement from **May 5, 2025** for high-volume senders to consumer Outlook/Hotmail: SPF and DKIM, DMARC at least `p=none`, aligned. Complaint ceiling 0.3% reported. Non-compliant mail is routed to Junk; sources disagree on rejection codes. Microsoft's unsubscribe requirement is looser than Gmail's (visible, working link) [unverified].

**Operator tiers.**
- Stellar: domain authenticated on day one, DMARC reports read weekly, complaint rate tracked per stream with an alert at 0.1%, one-click implemented before any marketing send.
- Good: authentication done, DMARC left at `p=none` for a year, complaint rate checked monthly.
- Average: DNS copied from a tutorial, SPF has too many lookups, DMARC never checked.
- Mediocre: sending from the root domain with no DKIM alignment, complaint rate unknown, unsubscribe requests handled by hand a week later.

**Consequences.** Failing authentication or sustained complaints at or above 0.3% can cut off inbox placement for the whole domain, which hits login codes first because they are the highest-volume "must arrive" mail. [design] A full domain reputation recovery takes weeks (Gmail's guidance on restoring access after a breach of the 0.3% level is roughly seven days below threshold, from one secondary source [unverified]).

**Sources.** Gmail sender guidelines, https://support.google.com/mail/answer/81126 (verified 2026-10-15). Yahoo sender best practices, https://senders.yahooinc.com/best-practices/ (verified 2026-10-15). Outlook requirements summary, https://www.efidem.com/en/microsoft-email-2025-requirements/ and https://resend.com/blog/microsoft-bulk-sending-requirements-2025 (Apr–May 2025) [secondary]. Gmail enforcement summaries, https://powerdmarc.com/gmail-enforcement-email-rejection/ and https://redsift.com/blog/gmails-enforcement-ramps-up-what-bulk-senders-need-to-know (late 2025) [secondary].

---

## 4. Which transactional emails a SaaS needs, and what they must contain

Per email: purpose, trigger, required content, timing, and legal flags. "Legal" items below are the ones a lawyer or auditor will check; have counsel confirm for your jurisdictions.

**Signup verification.** Trigger: account created. Include: the action, expiry, what happens if ignored, the product name and sender, a support contact. Send within 60 seconds. Legal: contract necessity basis; no marketing content.

**Magic links and login codes.**
- Expiry: 15 to 60 minutes; single use; token stored hashed, at least 128 bits of randomness [secondary: OWASP-aligned summaries, unverified against OWASP page].
- Build the link from a fixed, configured HTTPS origin, not the request Host header.
- Return the same generic message whether or not the address exists.
- Invalidate older tokens when a new one is issued; revoke sessions after a password reset.
- Keep third-party scripts off the landing page, and set a no-referrer policy so the token does not leak.
- Codes: 6 digits, 5–10 minute expiry, rate-limited per address and per IP.

**Password reset.** Same rules as magic links. Add a "this wasn't you" link that locks the account.

**Receipts and invoices.** A receipt is proof of payment; an invoice is a request for payment or a tax document. Stripe-style billing platforms can email finalized invoices automatically; check the defaults [secondary: Stripe docs on automatic collection].
- EU: Article 226 of Directive 2006/112/EC lists mandatory invoice content. Items confirmed in secondary sources: issue date, sequential invoice number unique within a series, supplier VAT identification number, customer VAT number where applicable (for reverse charge), names and addresses of supplier and customer, nature and quantity of the supply, supply date, taxable amount per VAT rate, VAT rate and VAT amount [secondary, partial list; verify the full list]. Full list also covers exemption references and currency rules.
- UK: VAT invoices must show the supplier's VAT number, a sequential number, the tax point, itemised supplies with rates and totals. Full list is in VAT Notice 700 paragraph 16.3 [unverified; not retrieved]. Simplified invoices apply up to £250.
- US: no federal invoice format; sales tax lines are required where you collect them, and state rules vary.
- Keep invoice PDFs retrievable for the tax-record retention period (commonly 6 to 7 years in many jurisdictions [design]).

**Trial-ending notices.** California's Automatic Renewal Law (Bus. & Prof. Code 17600 et seq.) applies to free trials that convert to paid. Secondary sources say a notice must be sent between **3 and 21 days** before the trial ends (from the 2021 amendment), and AB 2863 (effective **July 1, 2025**, for contracts formed, amended or extended on or after that date) requires the notice to state the amount or range of the charge and its frequency before billing details are taken, requires express affirmative consent, and requires a same-channel online cancellation path [secondary, law-firm summaries; statute text not checked]. Send trial notices at day −7 and day −1 for a 14-day trial as a safe design [design].

**Renewal reminders.** California requires annual reminders for certain subscriptions and clear notice of material price or service changes [secondary]. Renewal notices in other states follow their own statutes; federal ROSCA applies to all online subscriptions.

**Auto-renewal and cancellation rules (current state).**
- **FTC Click-to-Cancel rule:** vacated in its entirety by the Eighth Circuit on **July 8, 2025** [secondary, law-firm alerts]. The FTC restarted rulemaking with an advance notice on **March 11, 2026** (comments closed April 13, 2026) [secondary]. Enforcement continues under **ROSCA** and Section 5.
- **EU:** Directive (EU) 2023/2673 requires a withdrawal button on online contracting journeys from **19 June 2026** [secondary; this is withdrawal, not cancellation]. The Digital Fairness Act proposal is expected around Q4 2026 with cancellation-button provisions, not yet published [secondary forecast].
- **UK:** the DMCC Act subscription-contracts regime is expected to start **spring 2027** per most sources (one source says January 2027) [secondary, unverified date]. Cooling-off and renewal reminder details are still being set in secondary legislation.

**Failed payment.** Trigger: `invoice.payment_failed`-style webhook. Send on first failure with a one-click update-card link; send before final retry; send a final notice before access is cut. Stripe's billing settings include a toggle to send emails when card payments fail, and Smart Retries sets the retry timing [secondary, Stripe docs]. Legal: content must not threaten or mislead; state the amount and the date access ends.

**Usage alerts.** Trigger: 80% and 100% of plan limits. Transactional when the user needs the information to avoid service loss; marketing content (upgrade pitch) must be separate or absent.

**Security alerts.** Trigger: new device login, password change, email or 2FA change, API key created. Include time, approximate location, device, and a "not me" action. Never include the new password or a login link in the notice of a change.

**Operator tiers.**
- Stellar: every template has a written trigger, required fields, expiry, and a legal-check note; trial, renewal and failed-payment flows tested with dates in the past and future; invoices issued in the right currency and tax line.
- Good: the core flows work, legal fields checked once at launch.
- Average: receipts are generated by the payment tool with defaults; no trial-end notice; magic links valid for 24 hours.
- Mediocre: no failed-payment email at all, so churn from expired cards goes unnoticed; invoices missing VAT numbers; a promo in every receipt.

**Consequences.** A missing California trial notice or a cancellation path that needs a phone call creates exposure under state auto-renewal law and burns chargebacks and reputation [design]. A failed-payment flow that never sends means involuntary churn with no recovery attempt; involuntary churn is commonly a large share of SaaS churn (secondary estimates vary widely, so model it per product).

**Sources.** FTC Click-to-Cancel vacatur summaries, https://www.cooley.com/news/insight/2025/2025-07-11-click-to-cancel-just-got-cancelled-eighth-circuit-vacates-entirety-of-ftcs-negative-option-rule and https://www.gibsondunn.com/ftc-restarts-negative-option-rulemaking-after-eighth-circuit-vacatur-enforcement-under-rosca-continues/ (2025–2026) [secondary]. California AB 2863 summaries, https://www.cooley.com/news/insight/2025/2025-06-04-california-automatic-renewal-law-amendments-take-effect-on-july-1-2025 and https://fenwick.com/insights/publications/california-tightens-requirements-for-automatically-renewing-subscriptions (2024–2025) [secondary]. EU invoice content, https://stripe.com/resources/more/eu-vat-invoice-content-requirements (2026) [secondary]. UK DMCC timing, https://www.osborneclarke.com/insights/uk-digital-markets-competition-and-consumers-act-subscription-contracts-regime-take-shape (Apr 2026) [secondary]. Password reset guidance, https://tap-app-api.adeq.arkansas.gov/post/invalidate-and-expire-password-reset and https://pentesterlab.com/blog/password-reset-code-review-pentest-checklist [secondary, low quality; use OWASP Forgot Password Cheat Sheet as the reference].

---

## 5. Deliverability failure modes, frequency and impact

No rigorous public study measures magic-link or OTP delivery rates specifically. Figures below are directional.

**Benchmarks.**
- Validity's 2025 benchmark: global inbox placement about **84%** average; its 2026 report cites **87.2%** for 2025 [secondary]. Provider split for 2025 (Gmail 89.8%, Yahoo 87.3%, Apple 82.0%, Microsoft 77.4%) [secondary]. Seed-list measurements are not the same as real delivery and vary by sender.
- A vendor guide gives a transactional target of delivery above **95%** and inbox placement above **90%** [unverified, single vendor blog].
- Return Path's older research (several years old) found about **1 in 10** Gmail messages misclassified, with transactional receipts sometimes filed under Promotions [secondary, unverified currency]. Gmail's own category guidance puts automated confirmations under Updates [secondary].

**Failure modes, with rough frequency [design unless noted].**
1. **Magic links or codes land in spam** because of misalignment, a missing DKIM, or a shared IP with a bad neighbour. Likelihood: common on new domains in the first 2–6 weeks, rare after a clean setup. Impact: a signup that never completes; the user emails support.
2. **Shared-IP reputation problems.** Shared pools mean one sender's abuse can list the whole IP. Twilio documents that a Spamhaus listing on a shared IP may prevent moving your account to another pool [secondary, twilio.com]. Likelihood: a few times a year across the market; any one provider's pools are at risk [design]. Impact: a full-day outage of login mail is possible; recovery takes days.
3. **A marketing blast hurting transactional delivery.** Same domain, same IP, or a high complaint rate on the marketing stream. Postmark and others recommend separate streams and subdomains for this reason [secondary]. Likelihood: common among startups that send a launch newsletter from the app domain. Impact: login codes in spam within a day.
4. **Gmail Promotions misfiling** of receipts or transactional emails that look like offers. Likelihood: [unverified] roughly one in ten messages in older research. Impact: a missed receipt or a missed payment notice.
5. **Apple Mail Privacy Protection** inflates opens (pixel preloading). This does not hurt delivery but breaks open-based triggers. Early measurement showed little change in average open rate (Constant Contact, 2021) [secondary, old data]. Trigger on clicks and events, not opens.
6. **Blocklisting from invalid addresses or list misuse.** Bounces from unverified addresses raise the hard-bounce rate; providers penalise high bounce rates [design].

**Impact model [design].** Suppose 1,000 new signups a month, a 5% rate of login mail not reaching the inbox, and a 40% activation rate for signups who receive the verification. Then roughly 20 activations a month are lost, and each failed login generates a support ticket. A founder spending 10 minutes per ticket loses about 3 hours a month before the product cost. Password and login issues are a meaningful share of support tickets in IT support centres (an HDI survey puts it near 30% of tickets [secondary, older]). Vendor claims for B2B SaaS of 30–40% are unsourced [unverified], so use your own ticket tags.

**Operator tiers.**
- Stellar: seed tests across Gmail, Outlook, Yahoo and Apple after each template change; delivery and OTP latency dashboards (send-to-delivered time); failures tagged in support; a fallback provider or a second auth channel (passkey, SMS, or a code in the app) for lockouts.
- Good: monthly bounce and complaint check, manual seed test at launch.
- Average: no dashboard; support notices failures after weeks.
- Mediocre: marketing and auth share one IP and domain; no alerts; users told to "check spam" as a fix.

**Sources.** Validity benchmark via secondary roundups, https://www.validity.com (2025/2026 reports, not checked directly); Validity-cited summary, https://www.suprsend.com/post/transactional-email-delivery-inbox-placement (2026) [secondary]. Return Path Gmail misclassification research, cited via https://www.suped.com/knowledge/email-deliverability/technical/how-does-gmail-categorize-transactional-emails-for-tab-placement (undated) [secondary, old]. Shared-IP and Spamhaus behaviour, https://www.twilio.com/docs/email/concepts/deliverability/blocklists [secondary]. Apple MPP, https://www.litmus.com/blog/apple-mail-privacy-protection-for-marketers/ [secondary, 2021].

---

## 6. Templates, localization and testing

**Templates [design].**
- One template library with components (header, button, footer, legal block). Separate transactional and marketing templates even if they share a design system.
- Each template file records: trigger, recipients, required legal fields, expiry, language list, owner, last tested date.
- Plain text part on every email; a readable subject under about 60 characters; the action button and the raw link both visible.
- Dark mode and mobile width checked; no images required to understand the action.
- Do not put critical information only in an image.

**Localization [design].**
- Translate by template, not by string. Legal text (invoice wording, cancellation terms, the trial notice) needs a native-speaker and legal review in each market.
- Dates, currency and tax lines follow the recipient's locale; invoices use the seller's jurisdiction rules.
- Language detection from account setting, not from IP.
- Priority order for a small team: English plus the top two markets by revenue. Machine translation with a review pass is acceptable for security alerts only if the meaning is simple; legal text must be checked by a human.

**Testing [design].**
- Seed-mailbox tests: free personal accounts on Gmail, Outlook, Yahoo and iCloud, plus one work-domain account. Check inbox versus spam versus Promotions.
- Header check: SPF, DKIM and DMARC pass in the received headers.
- Link check: magic link opens once, expires on time, fails cleanly when reused.
- Render check: a paid previewing tool (Litmus lists a Core plan from about $500/mo [secondary, Aug 2025 change]) is not needed at small volume; use a free test-inbox tool or a local preview.
- Date-travel tests for trial-ending, renewal and failed-payment flows, using test clocks in your billing provider.
- Run these before every template change and once a month for the live set. Total cost: roughly 1–2 hours per template change [design].

**Operator tiers.**
- Stellar: template registry with owners; every change seed-tested in four inboxes; localized legal text reviewed; monthly link and expiry test; trial and renewal flows run on test clocks before launch.
- Good: templates reviewed at launch; seed test only for new templates.
- Average: templates hand-written in the provider's editor; no plain-text part; English only.
- Mediocre: copy edited live in production with no test send; the cancellation flow untested in months.

**Consequences.** An untested template that breaks a link can take out every new signup for a day [design]. A legal field missing from an invoice creates a tax and customer-support problem that is expensive to fix retroactively.

**Sources.** Litmus pricing summary, https://www.capterra.com/p/178360/Litmus/pricing (2026) [secondary]. Stripe test clocks and billing emails, https://docs.stripe.com/billing/automatic-collection (2026) [secondary]. Gmail sender guidelines (authentication and unsubscribe), https://support.google.com/mail/answer/81126 [verified].

---

## Summary of key corrections and open items

- Gmail's 0.3% spam-rate ceiling is official (verified on Google's support page), not a rumour. Google's stated target is below 0.10%.
- Yahoo's unsubscribe window is 2 days; CAN-SPAM's is 10 business days. Build to the shorter one for any shared list.
- Provider prices conflict across sources (Resend overage, Postmark entry price, SendGrid base volume, Loops entry price). Check the vendor pricing pages before use.
- Auto-renewal rules are moving: FTC rule vacated (July 2025), FTC rulemaking restarted (March 2026), California AB 2863 in force (July 2025), EU withdrawal button (June 2026), UK DMCC regime expected 2027.
- Deliverability frequencies have no rigorous public source; the impact model in section 5 is [design].
- Legal items (invoice fields, UK VAT notice paragraph, California statute text) were not verified against primary statute text. Have counsel confirm before launch.

## Sources (consolidated)

Primary (fetched 2026-10-15):
- https://support.google.com/mail/answer/81126 (Gmail bulk sender guidelines, effective 2024-02-01)
- https://senders.yahooinc.com/best-practices/ (Yahoo sender best practices)
- https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business (FTC CAN-SPAM guide, edited Jan 2024)

Secondary (search summaries, Apr–Oct 2026 unless noted):
- Resend: https://www.usecarly.com/blog/resend-pricing/ ; https://nuntly.com/resend-pricing ; https://costbench.com/software/email-api/resend/
- Postmark: https://automationatlas.io/answers/postmark-pricing-explained-2026/ ; https://frontdeskreview.com/software/transactional-email/postmark/ ; https://postmarkapp.com/message-streams
- Amazon SES: https://dev.to/mr_manushukla/amazon-ses-pricing-plans-in-2026-essentials-vs-pro-vs-enterprise-and-when-a-la-carte-still-wins-1ohg ; https://www.usecarly.com/blog/amazon-ses-pricing/
- SendGrid: https://www.sender.net/reviews/sendgrid/pricing ; https://automationatlas.io/answers/sendgrid-pricing-explained-2026/
- Loops: https://www.sequenzy.com/pricing/loops ; https://www.courier.com/integrations/compare/loops-vs-resend
- Outlook: https://www.efidem.com/en/microsoft-email-2025-requirements/ ; https://resend.com/blog/microsoft-bulk-sending-requirements-2025
- Gmail enforcement: https://powerdmarc.com/gmail-enforcement-email-rejection/ ; https://redsift.com/blog/gmails-enforcement-ramps-up-what-bulk-senders-need-to-know
- UK/EU consumer law: https://www.osborneclarke.com/insights/uk-digital-markets-competition-and-consumers-act-subscription-contracts-regime-take-shape ; https://www.gibsondunn.com/ftc-restarts-negative-option-rulemaking-after-eighth-circuit-vacatur-enforcement-under-rosca-continues/ ; https://connectontech.bakermckenzie.com/2026-regulatory-watch-upcoming-uk-eu-consumer-law-developments/
- California ARL: https://www.cooley.com/news/insight/2025/2025-06-04-california-automatic-renewal-law-amendments-take-effect-on-july-1-2025 ; https://fenwick.com/insights/publications/california-tightens-requirements-for-automatically-renewing-subscriptions ; https://blogs.mcguirewoods.com/2024/10/09/california-enacts-new-bill-to-strengthen-customer-protection-on-automatic-renewals/
- FTC click-to-cancel: https://www.cooley.com/news/insight/2025/2025-07-11-click-to-cancel-just-got-cancelled-eighth-circuit-vacates-entirety-of-ftcs-negative-option-rule
- Invoices: https://stripe.com/resources/more/eu-vat-invoice-content-requirements ; https://www.vatupdate.com/2022/05/12/eu-vat-directive-2006-112-ec-explained-art-226-content-of-an-invoice (2022)
- Stripe billing: https://docs.stripe.com/billing/automatic-collection
- Deliverability: https://www.suprsend.com/post/transactional-email-delivery-inbox-placement ; https://www.twilio.com/docs/email/concepts/deliverability/blocklists ; https://www.litmus.com/blog/apple-mail-privacy-protection-for-marketers/ (2021) ; https://www.suped.com/knowledge/email-deliverability/technical/how-does-gmail-categorize-transactional-emails-for-tab-placement
- Shared-IP / separation: https://emaillistvalidation.com/blog/subdomain-separation-transactional-vs-marketing-emails/ ; https://suped.com/email-deliverability/answers/should-marketing-and-transactional-emails-be-sent-from-separate-ips-or-subdomains
- Support tickets: https://www.thinkhdi.com/library/supportworld/2011/password-reset-practices (HDI, old) ; https://www.corbado.com/blog/passkeys-b2b-saas (vendor)
- Litmus / Mailtrap pricing: https://www.capterra.com/p/178360/Litmus/pricing

Not verified and not relied on for numbers: vendor claims of 94% or 91% inbox placement; the "Purchases tab" claim; the Gmail "7 days below threshold" recovery rule (single source).
