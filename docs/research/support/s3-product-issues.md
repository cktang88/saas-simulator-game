# S3: Product issues and support flows for a 1-20 person SaaS / subscription app (2026)

Research accessed 2026-10-15. Labels: [design] = my estimate for the simulator, not a statistic. [unverified] = secondary or vendor claim I could not confirm against a primary source. Search coverage was thin for CSAT, Help Scout-specific data and per-model ticket volumes, so those figures are [design] or absent.

Global sources used:
- Stripe, "Respond to disputes", https://docs.stripe.com/disputes/responding (fetched 2026-10-15)
- Stripe, "Receive Stripe events in your webhook endpoint", https://docs.stripe.com/webhooks (fetched 2026-10-15)
- Apple, App Review Guideline 5.1.1(v), https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion (search snippet, not opened)
- ICO, SAR timing (2019 update, reported via Fieldfisher and Mondaq summaries): https://www.fieldfisher.com/en/services/privacy-security-and-information/privacy-security-and-information-law-blog/whatadifferenceadaymakes
- CCPA/CPRA 45-day rule via secondary summaries, https://www.clym.io/blog/ccpa-45-day-response-timeline (verify against the CA AG regulations)
- Zendesk, 2025 CX Trends Report (Nov 2024, ~5,100 consumers and 5,400 leaders), https://www.zendesk.com/newsroom/articles/2025-cx-trends-report
- Freshworks, Customer Service Benchmark Report 2025 (1.2bn tickets, 2024 data), cited via a search summary [unverified]
- Intercom Fin resolution-rate figures: https://createwith.com/tool/intercom/updates/intercom-ships-200-updates-in-2025-fin-3-reaches-67-average-resolution-rate (third-party, late 2025); https://aws.amazon.com/solutions/case-studies/intercom-anthropic/ (56% within 30 days); https://preferences.intercom.com/fin (54%); https://community.intercom.com/questions/3622 (30-50% "good" starting point)
- PagerDuty status page guide, https://www.pagerduty.com/resources/outages/learn/status-page-best-practices/ (vendor; $4,300/min average downtime cost, unverified methodology)
- Canny-style board practice and Forrester 2025 (27% of VoC/CX teams communicate insights back in time), cited via Enterpret, https://www.enterpret.com/guides/the-6-best-tools-to-tell-customers-the-feature-they-requested-shipped-in-2026 [unverified secondhand]

---

## Flow 1: "How do I..." questions and onboarding help (deflection)

**Trigger and volume.** This is the largest flow for most small SaaS companies. Setup, where-is-X, and "how do I export" questions dominate the first 30 days of a trial. [design] Assume 35-50% of all tickets at SMB, and 60%+ of tickets in the first two weeks of a new customer's life. Per 1,000 customers per month: B2C ~40-80 tickets, SMB ~15-30, enterprise ~5-10 (mostly implementation questions routed to a CSM). Volume rises after each feature release and each pricing change.

**Handling, step by step.**
1. The inbound question hits the help widget or email. A saved-reply search checks the help center first.
2. If a help article answers it, the agent or bot sends the article link plus one sentence of context. Tag `how-to`, and tag the article ID so you can see which articles are never found.
3. If no article answers it, reply in under the SLA, then add the answer as a new article draft. Do not answer from memory twice.
4. Repeat questions (3+ tickets in a week) become an in-app tooltip, a checklist step, or a product change. The tag goes to the product backlog, not just a macro.
5. Close with a one-question CSAT. Follow up only if the article was wrong.

**Time per case.** [design] 3-6 minutes per human reply on a known answer; 15-25 minutes when the answer must be written up as an article.

**Turnaround.** [design] Email: same business day for trial users, under 4 hours for paying SMB during business hours. Chat: under 2 minutes for the first reply, or a clear "we will reply by X" message. Industry medians are noisy: Freshworks reports a median first response of about 1 hour and a top-20% of 3 minutes 10 seconds across 32,000+ companies [unverified secondhand]. Use those as ranges, not targets.

**What AI can do in 2026.** Intercom reports Fin's average resolution rate at 56% within 30 days for customers, 67% late 2025 (third-party), and 76% mid-2026 (AI Agent Index) [unverified]. Intercom's own community puts "good" at 30-50%. The resolution definition matters: a resolution is often counted when the customer goes quiet, which inflates the number. For a small app with a good help center, expect 30-50% deflection on how-to questions, and far less on billing or bugs. Failure modes: wrong answers from stale articles, looping when the product changed last week, and customers who ask for a human and get a bot.

**Stellar vs good vs average vs mediocre.**
- Stellar: fixes the article and the product the same day. Turns the top 10 repeat questions into in-app guidance. The next week's ticket count drops. Onboarding checklist is tuned to where new users stall (activation, not clicks). CSAT stays high because the reply includes the next step.
- Good: answers fast and links the right article. Articles are updated when the product changes. No repeat-question report.
- Average: answers correctly but slowly. Articles exist but are outdated. The same question arrives 40 times.
- Mediocre: answers from memory, sends long replies with no link, and never writes the article. Refund requests from trial users who never found the setup step.

**Consequences of mishandling.** [design] Trials that stall in week 1 convert at a lower rate; each unanswered setup question costs roughly one trial conversion in 20-50 (about 2-5% of trial starts lost per backlog of unanswered setup questions). Unanswered "how do I cancel" questions drive chargebacks (see Flow 6 and Stripe dispute rules). Public one-star reviews that say "support is useless" follow slow onboarding replies.

**Sources.** Intercom Fin figures and community note above; Zendesk 2025 CX Trends report (https://www.zendesk.com/newsroom/articles/2025-cx-trends-report, vendor survey, retention claims for "trendsetters" are unverified as causal); benchmark ranges as above.

---

## Flow 2: Bug reports (reproduction, info gathering, escalation, closing the loop, workarounds)

**Trigger and volume.** [design] Bugs are 10-20% of tickets for a B2B app in its first year, rising after releases. Per 1,000 customers per month: SMB ~5-12 bug tickets, enterprise ~3-8 but more severe. Most are not reproducible on the first message.

**Handling, step by step.**
1. Acknowledge within the SLA with a specific question set, not "please try again". Ask for: what they did, what they expected, what happened, the account or workspace ID, browser and OS, the time (with timezone), and a screenshot or screen recording.
2. Try to reproduce on a test account using the exact plan and settings. Record the steps in a bug template with a severity tag (data loss, blocked, degraded, cosmetic).
3. If reproduced: create the engineering issue with the template, link the support thread, and tell the customer it is confirmed and what the next step is. If not reproduced: ask for a HAR file, console log, or a screen recording, and say so explicitly.
4. Offer a workaround in the same message if one exists. Mark it as a workaround, not a fix.
5. Escalate by severity: data loss goes to on-call immediately; blocked paying customers go same day; cosmetic goes to backlog.
6. Close the loop: when the fix ships, reply to every linked ticket with the version, what changed, and what to check. Do not use a generic "fixed" macro.

**Time per case.** [design] 10-15 minutes for the first triage with reproduction attempt; 30-90 minutes for a reproduced bug including the issue write-up. Total engineer interruption per escalation ~15 minutes.

**Turnaround.** [design] Severity-1 (data loss, paying customers blocked): acknowledge within 1 hour during business hours; workaround within 24 hours. Severity-2: acknowledge same day; fix date set within 3 business days. Severity-3: acknowledge within 1 business day; fix in backlog.

**What AI can do.** AI agents can triage, ask the right questions, search known issues, and draft the bug write-up. They should not declare a bug "not a bug" or promise a fix date. [design] Expect AI to handle the intake and duplicate search well; it fails on intermittent bugs and on bugs where the customer's description is wrong.

**Stellar vs good vs average vs mediocre.**
- Stellar: reproduces 60%+ of bugs on the first pass. Includes a workaround in the first reply. Closes the loop on every linked ticket. Tracks duplicates; a bug with 12 reports gets a status page or banner before it gets 40.
- Good: asks for the right info; escalates with a clean template; tells the customer when it ships.
- Average: asks for info in three rounds; closes tickets silently after a fix ships.
- Mediocre: tells the customer "we cannot reproduce" with no request for more data; leaves tickets open for months; the same bug is reported by 30 customers.

**Consequences of mishandling.** [design] A data-loss bug that is mishandled for 48 hours is the highest-cost case in this flow (see Flow 6). Paying customers blocked for more than a week: churn of the affected account is likely, and a public complaint on X or Reddit is possible. Each unanswered bug thread is a likely one-star review at G2 or Capterra [design].

**Sources.** Support benchmark ranges (Freshworks 2025 [unverified secondhand]); no primary source on bug-triage time was found. Treat the time and volume numbers as [design].

---

## Flow 3: Feature requests (logging, voting boards, closing the loop, saying no)

**Trigger and volume.** [design] Feature requests are 5-15% of tickets, and they arrive as sales asks, support asks, and public board votes. Enterprise accounts send the most, and their requests are the least likely to be general.

**Handling, step by step.**
1. Thank the customer and restate the problem they are solving, not the feature. Ask one question: what are you doing today instead?
2. Log the request once, with the problem, the customer's segment and plan, and the ticket link. Merge duplicates into an existing board item.
3. Put the request on a public board (Canny-style or similar) with voting. Do not promise delivery.
4. Set a status: under review, planned, in progress, shipped, not planned. Each status change notifies voters and linked requesters. Requests from support tickets and sales calls often do not notify on the board by default, so link them.
5. When shipped, reply to each linked request with the release note and a one-line "this is what changed for your problem".
6. Saying no: give the real reason (scope, strategy, cost of maintenance), offer the workaround that exists, and log the request as "not planned" with the reason visible. Keep the thread open for the record.

**Time per case.** [design] 3-5 minutes to log and reply; 10 minutes for a thoughtful "no".

**Turnaround.** [design] Acknowledge within 1 business day. Status update within 2 weeks of a request being reviewed. Shipped notification within 1 week of release.

**What AI can do.** AI can cluster requests, merge duplicates, and draft notifications. It cannot decide what to build. Failure modes: it may treat every vote as demand, and it may promise features to keep a customer happy.

**Stellar vs good vs average vs mediocre.**
- Stellar: separates "I want X" from "I need to do Y". Says no with a reason and a workaround. Ships a visible change at least monthly and tells every linked requester when it lands. Tracks which shipped features reduced repeat requests.
- Good: logs, merges, and notifies on ship. Does not overcommit.
- Average: logs requests but never updates the board; the board is a graveyard; shipped features are not announced.
- Mediocre: promises features on calls, then ignores them; treats the loudest enterprise account as the roadmap; closes requests with no reason.

**Consequences of mishandling.** [design] Promises that are not kept are a churn driver for the promised account and a credibility problem on public boards. One widely voted request that is ignored for a year becomes a public complaint and a support-volume spike. Reporting insight back is rare: a Forrester 2025 survey (cited via Enterpret [unverified]) found only 27% of VoC and CX teams communicate insights back in a timely way. A team that does this well gains a visible advantage with its users.

**Sources.** Canny-style practice from vendor guides (Upvoty, ProductLift, Enterpret; all vendor content, [unverified]). Forrester 2025 figure as above [unverified secondhand].

---

## Flow 4: Integration and API problems (third-party outages, webhooks, rate limits)

**Trigger and volume.** [design] Integration tickets are 5-10% of tickets at an API-heavy app, and they are the most technical. Typical causes: a third-party outage (Stripe, Google, Slack, a CRM), a customer's webhook endpoint returning errors, a rate limit hit during a bulk import, or an OAuth token that expired.

**Handling, step by step.**
1. Ask for the integration name, the failing endpoint or event, the request ID, the time, and the error body. Do not guess.
2. Check the third party's status page and your own event log. If the third party is down, say so and link their status page. Do not promise a fix time you do not control.
3. For webhooks: check the delivery log on the sender side. Stripe, for example, retries failed deliveries for up to 3 days in live mode with exponential backoff, shows delivery status in Workbench, and allows manual resend for 15 days in the dashboard (30 days via CLI). Confirm the customer's endpoint returns 2xx quickly and is publicly reachable with HTTPS. Redirects count as failures.
4. For rate limits: show the limit and the retry-after header. Suggest batching or backoff. Offer to raise the limit only after checking the plan.
5. For your own bug: follow Flow 2.
6. Close with a confirmation that the sync caught up, and a note on what to monitor.

**Webhook design facts (Stripe docs, fetched 2026-10-15).** Events are not guaranteed to arrive in order; duplicates can happen; track event IDs; verify signatures using the raw body; the default signature tolerance is 5 minutes; return 2xx before complex processing. Stripe's guidance on duplicates and ordering is the template the simulator should use.

**Time per case.** [design] 15-30 minutes for triage with logs; 1-2 hours when the cause is in the customer's system and a call is needed.

**Turnaround.** [design] Same business day for paying customers with a broken sync. Immediate status-page note for a third-party outage that affects many customers.

**What AI can do.** AI can read logs, match error codes to docs, and draft a reply. It cannot safely re-run a payment sync or change a customer's data without a human check. Failure modes: it may blame the customer's code when the app is wrong, and it may retry actions that are not idempotent.

**Stellar vs good vs average vs mediocre.**
- Stellar: asks for the request ID on the first reply. Distinguishes "their outage" from "our bug" within 15 minutes. Gives the customer a checklist for their endpoint. Writes an internal note so the next person can find the pattern. Tracks rate-limit hits and changes the limits for the affected plans.
- Good: diagnoses correctly, links the third-party status, and confirms the fix.
- Average: asks for logs three times; never checks the third party's status page; closes the ticket when the customer stops replying.
- Mediocre: tells the customer "it's a Stripe problem" with no evidence; runs a bulk resync that double-charges; ignores repeated webhook failures.

**Consequences of mishandling.** [design] A double-processed webhook can double-credit or double-charge a customer. A wrong resync can corrupt billing records (see Flow 6). Repeated failed webhooks for a paying customer's integration are a churn driver at enterprise tier.

**Sources.** Stripe webhook docs (https://docs.stripe.com/webhooks, fetched 2026-10-15). Other values are [design].

---

## Flow 5: Performance and outage complaints, and the status page

**Trigger and volume.** [design] Performance complaints ("it's slow", "it's down") are 3-8% of tickets in normal weeks and 30-60% of tickets during an incident. Customers often report an outage before your monitoring does.

**Handling, step by step.**
1. Verify the incident in your own monitoring within minutes. Post to the status page as "investigating" before the first ticket wave, not after.
2. Acknowledge in support with a single canned reply that links the status page and states the next update time. Do not write a new reply per ticket.
3. Update the status page at the stated intervals, even when nothing has changed ("still investigating, next update in 30 minutes").
4. For a performance complaint with no incident: ask for the page, time, region, and browser. Compare to monitoring. Do not say "it's fine" without checking.
5. After resolution: publish the status update, and a post-incident note with root cause, impact, and what changes. Send a short email to affected customers, with credits if the SLA says so.
6. Close the loop on each ticket that asked about the incident with a link to the post-incident note.

**Time per case.** [design] Outage: 2-3 minutes per ticket with the canned reply; 20-40 minutes for the post-incident email and credit calculation.

**Turnaround.** [design] First status-page post within 15 minutes of verified impact. Updates every 30 minutes during a major incident. Post-incident summary within 1-3 business days.

**Downtime cost and churn.** PagerDuty's status-page guide cites an average unplanned downtime cost above $4,300 per minute [unverified; vendor, methodology not stated]. I did not find an independent study that quantifies downtime-driven churn for SMB SaaS. Treat any churn figure you use in the simulator as [design].

**What AI can do.** AI can draft status updates and classify tickets as "incident-related". It must not decide root cause or the credit amount. Failure modes: it can keep answering "we are investigating" after the incident is over, and it can promise a time to fix.

**Stellar vs good vs average vs mediocre.**
- Stellar: status page first, every 30 minutes. Post-incident note with real root cause and a change. Credits applied automatically per SLA. Monitoring alerts before customers do. Post-incident reviews lead to a monitoring or code change that the customer can see.
- Good: status page within 30 minutes; honest post-incident summary; credits when asked.
- Average: status page updated only at the end; customers report the outage first; post-incident note is vague.
- Mediocre: no status page; support replies individually with conflicting facts; blames the customer's network; no credits; a customer posts the outage on Reddit or Hacker News before you do.

**Consequences of mishandling.** [design] A long, poorly communicated outage is the main reason SMB customers cancel after a single incident, and public posts drive trial sign-ups down for the next weeks. Failing to honour SLA credits is a contract breach for enterprise accounts. A breach that exposes data is a different category (Flow 6, and GDPR/CCPA breach-notice clocks).

**Sources.** PagerDuty status page guide (https://www.pagerduty.com/resources/outages/learn/status-page-best-practices/, vendor); Atlassian Statuspage incident communication guidance (vendor); no independent churn study found.

---

## Flow 6: Data-loss and "my data is wrong" escalations

**Trigger and volume.** [design] Rare but expensive: 1-3% of tickets, and a far larger share of the complaints that reach the founder. Causes: a sync overwrote data, a deleted record cannot be restored, a report uses the wrong currency or time zone, a customer deleted their account and wants data back, or a data-subject request (GDPR/CCPA) is late.

**Handling, step by step.**
1. Stop and classify: is data missing, wrong, or was it deleted by the customer, by a bug, or by a migration? Check the audit log before replying.
2. Freeze risky operations for that account (bulk imports, syncs) and say so.
3. Preserve evidence: export the affected records, take a snapshot if backups allow, and record the timestamps. Do not overwrite the current state.
4. Escalate to the founder or on-call within the hour for any data-loss case. Involve legal if personal data is exposed or a deletion request is involved.
5. Restore from backup where possible; confirm the restored data with the customer before saying the issue is closed.
6. Data-subject requests: GDPR Article 12 requires a response without undue delay and within one month of receipt, extendable by two months for complex or multiple requests if you tell the individual within the first month. The ICO counts from the day of receipt (2019 guidance, reported by Fieldfisher and Mondaq). CCPA/CPRA: confirm receipt of a request to know or delete within 10 business days; respond within 45 days, extendable once by 45 days with notice in the first 45 days (secondary summaries; verify against the California AG regulations).
7. Write a post-incident note on the account and the cause. Tie it to a product or process change.

**Time per case.** [design] 30-60 minutes for triage and export; 2-6 hours for restore and verification; a data-subject request is 2-4 hours of work spread over the statutory window.

**Turnaround.** [design] Acknowledge data-loss reports within 1 hour. Restore decision within 4 hours. Data-subject request acknowledgment within 1-2 business days; full response well inside the statutory clock.

**What AI can do.** AI can read audit logs and summarise changes. It must not decide what counts as "lost" or restore data without a human. Failure modes: it may claim data is intact when a sync is still running, and it may suggest a fix that overwrites newer data.

**Stellar vs good vs average vs mediocre.**
- Stellar: freezes the account before investigating, preserves evidence, restores with a verified checklist, and tells the customer the exact timeline. Data-subject requests are handled on a calendar with reminders. A post-mortem changes the system (e.g., soft delete, sync guardrails).
- Good: classifies quickly, restores what backups allow, is honest about what cannot be recovered, and meets the GDPR/CCPA deadlines.
- Average: investigates for days before freezing the account; restores without confirming; misses a deadline and apologises late.
- Mediocre: tells the customer the data is "probably fine"; deletes the audit trail while investigating; ignores a deletion request; does not tell the customer that data was exposed.

**Consequences of mishandling.** [design] Lost customer data is usually the single largest churn event for an account: expect near-certain cancellation of the affected account and a public review or post. A missed GDPR Article 12 deadline is a complaint to the ICO; fines for late SARs are rare for small firms but the complaint and the reputational cost are real. Failing to notify a breach within 72 hours (GDPR Article 33) is a separate, larger exposure. Card disputes from customers who see wrong charges are handled under the card-network rules: Stripe's dispute response window is 7 to 21 days depending on the network, and an unanswered dispute is lost automatically; the response can be submitted once and cannot be edited; a countered dispute costs a fee and can take up to 3 months to decide (Stripe docs, https://docs.stripe.com/disputes/responding, fetched 2026-10-15).

**Sources.** Stripe dispute docs (above); ICO SAR guidance via Fieldfisher summary (2019 update) and Mondaq; CCPA timeline via clym.io (secondary, verify); GDPR Article 33 breach-notification rule (general knowledge, [design] for the simulator; check the official text before using in content).
