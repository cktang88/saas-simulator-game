# S2: Account, data and security support flows (small SaaS / subscription app, 1-20 people, 2026)

Research date: 2026-10-15. Source tags: [sourced] = found in a search result (URL given), [design] = my estimate for the simulator, [unverified] = secondary or conflicting, check before citing, [memory] = statute or standard I know but did not re-check in this run.

Two corrections to the brief before the flows:
- GDPR is not "30/45 days". Art. 12(3): respond within one month of receipt, extendable by two further months for complex or numerous requests, and the requester must be told about the extension within the first month [sourced: https://www.convert.com/eu-gdpr/article-12-gdpr/ ; EDPB decision on a misfiled request: https://www.edpb.europa.eu/system/files/2026-01/frsa-2025-05-decisionpublic.pdf-1-redacted.pdf].
- CCPA is 45 days, extendable once by 45 days if the consumer is told within the first 45 days. Sources also say acknowledgement within 10 business days [sourced, secondary: https://pandectes.io/blog/ccpa-penalties-what-happens-if-you-dont-comply]. Penalty figures conflict: $2,663 / $7,988 (inflation-adjusted, from Jan 2025) versus $2,500 / $7,500 base; the 30-day cure period is described as gone in one source and as existing in another (Sophos) [unverified: https://www.clym.io/blog/ccpa-penalties-and-fines-what-businesses-need-to-know ; https://assets.sophos.com/X24WTUEQ/at/s5hf6547c49ksxh9t36xw5/sophos-ccpa-vs-gdpr.pdf]. Check Cal. Civ. Code 1798.155 and 1798.199.90 before quoting.

---

## Flow 1: Login and lockout (password resets, magic links in spam, lost 2FA, SSO misconfiguration)

1. **Trigger and frequency.** [design] Login and access tickets are typically the largest single category for B2B SaaS, roughly 15-30% of inbound tickets; for B2C apps, reset and magic-link issues run higher. Per 1,000 active users per month, expect 10-40 lockout tickets. No sourced share was found in this run.

2. **Handling.** Tier 1: confirm identity by the account's registered email and the last known billing detail, not by "the name on the account". Check auth logs (failed attempts, IP, device). Magic link not arriving: check suppression lists and bounce logs first (the sending tool often silently suppresses after a bounce), then ask the user to check spam and search for the sender domain. Lost 2FA: use the recovery codes or a second verified method; if none, go to the identity-verification path in Flow 2. SSO: check whether the IdP changed (a SAML certificate rotation or deleted app regenerates the signing cert, which breaks logins even when the IdP authenticates successfully [sourced, forum evidence only: https://forum.cursor.com/t/sso-lockout-after-idp-configuration-change/112908]). Escalate to engineering only with the IdP error code and a timestamp. Internal note: record the method used to verify.

3. **Time and SLA.** [design] 5-10 minutes for a standard reset, 20-40 for SSO or lost-2FA. Live chat median first response in cross-industry aggregates is about 1.5 minutes, email about 12 hours [unverified aggregator: https://stealthagents.com/research/first-response-time-benchmarks-2026]. Freshworks' 2025 benchmark reports a median first response of about one hour across 32,000 companies, with the top 20% at about 3 minutes [sourced via aggregator, Freshworks 2025: same URL].

4. **AI.** Safe for: sending the reset flow, explaining spam folders, reading error codes. Not safe for: any reset, 2FA reset or SSO change where the request comes from an identity claim the AI cannot check. Failure mode: the bot confirms an account exists, or resets a 2FA factor on a claim. [design]

5. **Stellar vs mediocre.** Stellar: diagnoses from logs in one reply (suppression list hit, DMARC failure on a custom domain), gives a permanent fix (sender domain authentication), and adds the admin backup-owner step so the next lockout is not a crisis. Good: correct first-response fix. Average: asks the user to "try again" several times. Mediocre: resets 2FA on a claim, or tells the user to "clear cookies" for an SSO error that is an IdP config change. Outcome gaps [design]: stellar cuts repeat tickets for the same account by roughly half; mediocre leads to churn in SMB admins who are locked out on a renewal day.

6. **Consequences.** A locked-out admin on a team of 25 can stop a whole team's work; [design] the typical result is a failed renewal and a chargeback or an angry review. Gmail and Yahoo sender rules: bulk senders (5,000+ messages/day to those providers) must authenticate SPF/DKIM/DMARC with alignment and stay under a 0.3% complaint rate; sources disagree on whether transactional magic links are in scope, so authenticate regardless [sourced, secondary: https://www.3mediaweb.com/blog/new-google-yahoo-bulk-email-requirements-now-in-effect/ ; https://bird.com/docs/knowledge-base/deliverability/gmail-yahoo-requirements]. Consequence of a broken DMARC setup: magic links land in spam for days, and the team blames the product.

7. **Sources.** Google Workspace lockout and recovery guidance (vendor/forum, low quality): https://workalizer.com/insights/admin/google-workspace-account-lockouts-admins-role-and-recovery-paths/ ; Freshworks benchmark (via aggregator) as above. No 2025 statistics for SSO lockouts were found.

---

## Flow 2: Account ownership transfers and access requests (identity verification, social engineering)

1. **Trigger and frequency.** [design] Ownership transfers: a few per 1,000 accounts per year for SMB; access requests ("I'm the new CFO, add me") weekly for a company with 1,000+ accounts. Fraud attempts on this path are a real share of account-recovery requests [design, no sourced figure].

2. **Handling.** Rule: never change the owner or add an admin on the strength of a support-channel message alone. Step 1: the requester must already be an admin, or the change must come from the current owner via a verified email on the account, or from a second admin. Step 2: for an ownership transfer, require the current owner's confirmation, the new owner's verified email on a company domain, and a billing-contact change confirmed to the old billing email. Step 3: check the account's last login and recent changes; hold 48-72 hours for high-value accounts [design]. Step 4: document the verification in an internal note. Tools: admin panel audit log, the billing system, a macro that lists exactly what was checked.

3. **Time.** [design] 15-30 minutes per transfer; 48-72 hour holds for disputed cases. No sourced figure.

4. **AI.** AI can collect the request, list the documents needed and explain policy. It must not approve a transfer or a new admin. Failure mode: a convincing story (a "new employee", a "lost access after a merger") that the AI accepts and grants.

5. **Stellar vs mediocre.** Stellar: asks one question that only the real owner can answer (last invoice amount, a project name, the admin who set up SSO), calls the current owner on a number already on file, and refuses politely with a path forward. Average: follows the checklist but skips the audit log. Mediocre: changes the owner because the requester "sounds senior", or uses a personal Gmail address from the "new owner" as verification.

6. **Consequences.** A social-engineered transfer gives an attacker the account, data and billing [design]. Realistic costs: data exfiltration, a chargeback or refund on the card the attacker moved to, and a breach-notification duty if personal data is exposed (see Flow 3 and GDPR Art. 33: 72 hours to notify the supervisory authority [memory]). Help-desk impersonation is a documented attack pattern: CrowdStrike reported a 442% rise in vishing in H1-H2 2024 tied to help-desk impersonation [unverified, secondary: https://www.stingrai.io/blog/sim-swap-statistics-2026].

7. **Sources.** Attack pattern: https://www.stingrai.io/blog/sim-swap-statistics-2026 (secondary). The sources in this run did not give verified SIM-swap loss totals; FBI IC3 totals conflict across sources [unverified: https://deepstrike.io/blog/sim-swap-scam-statistics-2025].

---

## Flow 3: GDPR / CCPA data subject requests (access, export, deletion, verification)

1. **Trigger and frequency.** [design] Per 1,000 users per month: 0.5-2 requests for a B2C app with EU/California users; B2B SaaS receives more from employees of customers, which should be routed to the customer (the controller) rather than answered directly.

2. **Handling.** Log the request on receipt (the clock starts then). Verify identity proportionately: match the request to the account email and one more data point; do not ask for a government ID unless the risk warrants it [design]. Acknowledge within the CCPA 10-business-day norm, and calendar: GDPR day 30 (one month, the extension notice must go out before it), CCPA day 45 (extension notice before it). Export: machine-readable (JSON or CSV), covering account data, usage logs where practical, and third-party processors you can reach. Deletion: delete from production and tell processors to delete; backups are typically put beyond use until overwritten and a soft-delete flag is not erasure [unverified practitioner guide: https://red-gate.com/simple-talk/data-security-privacy-compliance/how-to-delete-personal-data-gdpr-ccpa-compliance]. Keep a minimal record of the request itself. Tools: a DSR tracker, the admin "export user" and "delete user" functions, a processor list.

3. **Time.** [design] 30-60 minutes for a simple export; 2-4 hours for a deletion across processors; more for complex access requests.

4. **AI.** Good for: intake, status emails, locating the right account. Not for: deciding whether a request is valid, releasing data, or judging legal exemptions. Failure mode: an AI returns another user's data when names collide [design].

5. **Stellar vs mediocre.** Stellar: finishes on day 10-14 with a complete export, a deletion confirmation covering processors, and a note on what was retained and why (tax or fraud). Average: finishes on time but misses a processor. Mediocre: misses the GDPR one-month deadline with no extension notice, or sends a partial export.

6. **Consequences.** GDPR Art. 83: the top tier is up to EUR 20 million or 4% of worldwide turnover, and it covers data subject rights in Arts. 12-22 [sourced: https://advisera.com/gdpr/general-conditions-for-imposing-administrative-fines/]. For a 10-person company the practical fine is much lower, but a supervisory authority complaint and a public one-star review are the realistic outcomes. The EDPB has sanctioned a misfiled request answered only after regulator intervention [sourced: EDPB decision above]. CCPA: per-violation penalties (see the correction above), plus private damages only for data breaches [unverified].

7. **Sources.** https://www.convert.com/eu-gdpr/article-12-gdpr/ ; https://advisera.com/gdpr/general-conditions-for-imposing-administrative-fines/ ; https://www.clym.io/blog/ccpa-penalties-and-fines-what-businesses-need-to-know ; Cal. Civ. Code 1798.155 [memory].

---

## Flow 4: Account deletion requests and data retention

1. **Trigger and frequency.** [design] 1-3 deletion requests per 1,000 users per month for a B2C app; B2B deletions are rarer and come with a cancellation.

2. **Handling.** Two paths: in-app and web. App stores require both for apps that allow account creation. Apple guideline 5.1.1(v): deletion must be initiable in the app; a web hand-off is allowed if a direct link is given; requiring a phone call, email or chat is generally not allowed outside regulated apps; deactivation alone does not count [sourced: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion]. Google Play: in-app path plus a web link, declared in the Data safety form [sourced: https://support.google.com/googleplay/android-developer/answer/13327111]. Sign in with Apple users need token revocation through Apple's REST API on deletion [sourced: developer forum summary, https://developer.apple.com/forums/thread/681790]. Handling: confirm the request, check for active subscriptions (cancel and warn about refunds under the store's policy), delete or anonymise data, keep only what law requires (tax records, fraud flags, legal holds) and state the retention period. Tools: the admin delete path, the billing system, the processor list.

3. **Time.** [design] 15 minutes for the request; 1-2 hours for a full cascade including processors.

4. **AI.** Good for: the in-app flow and confirmations (Apple allows confirmation steps). Not for: deciding retention exceptions or refund amounts. Failure mode: the bot refuses deletion and sends the user to a "retention offer" loop, which Apple and Google both treat as a compliance problem [design].

5. **Stellar vs mediocre.** Stellar: deletes on request, cancels billing, sends a written confirmation with what was kept and for how long, and checks that the store link works. Average: works but keeps data longer than stated. Mediocre: deactivates instead of deleting, asks for an email to delete, or keeps charging.

6. **Consequences.** Google's own USENIX study found that of 494 apps with accessible deletion links, only 8.5% provided both in-app and web deletion, which is full compliance [sourced: https://www.usenix.org/conference/usenixsecurity25/presentation/yan-jingwen]. Non-compliance risks store enforcement (app removal or rejection) and, in the EU/California, a regulator complaint. Continued billing after deletion creates a chargeback and a refund dispute [design].

7. **Sources.** Apple and Google pages above; https://qawerk.com/blog/app-account-deletion-requirements/ (secondary).

---

## Flow 5: Security vulnerability reports from researchers (responsible disclosure, bounty, beg bounty)

1. **Trigger and frequency.** [design] A small SaaS gets 0-2 reports a year; a consumer app with a public security page gets several a month, most of them low-quality scanner output. "Beg bounty" messages (demanding payment for a non-issue) are common [design].

2. **Handling.** Acknowledge within 2 business days (the norm, [design]). Triage with reproduction steps: ask for a proof of concept, not a scanner dump. Severity: rate by actual impact on user data or money. Fix, then reply with a timeline. Pay only through a bounty programme or a clear policy; never negotiate a "pay or I publish" demand. Publish a security.txt and a disclosure policy with a safe-harbour line [memory: RFC 9116 defines security.txt]. Legal stance: the DOJ's May 19, 2022 CFAA charging policy says prosecutors should decline good-faith security research, defined as testing solely to fix a flaw, but it does not bind courts and "solely" leaves room for paid researchers [sourced: https://www.eff.org/node/106755 ; https://www.wsgrdataadvisor.com/2022/05/doj-acknowledges-limits-to-the-cfaa-but-questions-and-possible-civil-liability-remain-for-security-researchers-and-others/].

3. **Time.** [design] 1-3 hours triage per real report; 0.5 hours to dismiss a beg-bounty email.

4. **AI.** Good for: classifying incoming reports, drafting a neutral acknowledgement, asking for reproduction steps. Not for: deciding severity, promising payment or confirming a fix. Failure mode: AI generates a "we'll pay $500" promise.

5. **Stellar vs mediocre.** Stellar: acknowledges in a day, fixes a real critical in days, credits the researcher, and gives a bounty within a stated window. Average: fixes slowly with no reply. Mediocre: threatens the researcher, sues, or goes silent until the researcher publishes.

6. **Consequences.** Public disclosure of an unfixed flaw with user data at stake. Benchmarks are dated: HackerOne's 2019 report gives an average critical bounty of $3,384 [sourced, dated: https://cva.unifr.ch/system/files/artifacts/media/pdf/hacker-powered-security-report-2019_0.pdf]; a HackerOne blog gives an average of 27 business days from triage to bounty [sourced, undated: https://www.hackerone.com/blog/journey-100-responsive-programs]. Threatening a researcher can create legal exposure and a press story [design].

7. **Sources.** As above. HackerOne 2025 headline figures (about $81 million paid) are secondary and unverified [https://yespress.io/hackerone].

---

## Flow 6: Abuse, spam and fraud reports about users (B2C/UGC) and law-enforcement or legal requests

1. **Trigger and frequency.** [design] For a UGC app with 10,000 MAU, expect tens of abuse reports a week and a few law-enforcement or takedown requests a quarter. Spam and fraud signups are the largest volume.

2. **Handling.** Abuse: triage by harm (threats, child safety, self-harm go first and to a specialist queue), then by type. Action: remove content, suspend, notify the user with the reason. Preserve evidence. Child sexual abuse material: report to the relevant authority under your jurisdiction's rules [memory]. Law enforcement and legal requests: verify the requester's identity and authority through the official contact (not the phone number in the message); check the legal basis (subpoena, court order, or emergency request); log it; respond only to what the order covers; notify the user unless barred. DSA Art. 18 requires hosting providers to notify authorities when they learn of information giving rise to a threat to life or safety, for all hosting providers since 17 Feb 2024 [sourced: https://bka.de/EN/OurTasks/Remit/CentralAgency/DigitalServicesAct/FAQS/FAQS_node.html]. The EU e-Evidence Regulation became applicable on 18 August 2026: European Production Orders require data within 10 days, or 8 hours in emergencies; Preservation Orders keep data up to 60 days, extendable by 30; providers in the EU must designate an establishment and providers outside it must appoint a legal representative [sourced, secondary: https://www.potomaclaw.com/news-EU-e-Evidence-Rules-Become-Operational-on-August-18-2026-US-Companies-with-European-Operations-Should-Prepare-Now ; https://www.mccannfitzgerald.com/knowledge/disputes/e-evidence-regulation-a-guide-to-the-new-eu-production-and-preservation-order-regime]. Check your own status now.

3. **Time.** [design] 5 minutes per spam report with automation; 30-60 minutes per UGC abuse case; 2-4 hours per legal request with verification.

4. **AI.** Good for: spam and bot classification, first-pass triage, drafting notices. Not for: child-safety calls, legal-request responses, or account bans affecting paying users without human review. Failure mode: a false-positive ban on a paying user, or over-disclosure to a fake "police" request [design].

5. **Stellar vs mediocre.** Stellar: a 24-hour queue for severe harm, a written law-enforcement policy, a verified-requester check, a clear appeal path, and a transparency log. Average: handles the queue but has no legal-request log. Mediocre: discloses user data to an unverified email claiming to be police, or leaves a harmful post up for a week.

6. **Consequences.** Missed production deadlines under the e-Evidence Regulation and DSA; disclosure to an impostor is a data breach with GDPR notification duties; ignoring abuse drives app-store removal and press coverage [design]. Quantified fines were not verified in this run.

7. **Sources.** https://bka.de/EN/OurTasks/Remit/CentralAgency/DigitalServicesAct/FAQS/FAQS_node.html ; https://www.potomaclaw.com/news-EU-e-Evidence-Rules-Become-Operational-on-August-18-2026-US-Companies-with-European-Operations-Should-Prepare-Now ; https://lausen.com/en/the-digital-service-act-new-obligations-for-hosting-service-providers/. DSA Art. 10 (orders to provide information) and Art. 11 (single point of contact) text was not confirmed directly; a secondary summary says Art. 11 requires a findable contact [unverified].

---

## Cross-flow notes for the simulator [design]

- Every flow here has a verification step that is the cheapest place to fail. Simulate the attacker's story as a scenario card, and make the AI the wrong answer for any step that changes ownership, releases data or deletes.
- Deadlines (GDPR one month, CCPA 45 days, e-Evidence 10 days or 8 hours, DSA notices) should be live timers with visible cost of lateness.
- Remaining gaps: ticket-share data for each flow, the current Stripe and Visa/Mastercard dispute rules (not verified here), HackerOne 2025 medians, and the UK DUAA Art. 12A pause rules (a secondary source says in force 5 Feb 2026; unverified).
