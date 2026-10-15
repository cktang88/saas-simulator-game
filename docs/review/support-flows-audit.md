# Support flows audit and build (Helpdesk ticket types)

Scope: every support flow in `docs/research/support/s1-s4` against what the game did before this change (Helpdesk `public/apps/helpdesk.js` and `support/*`; Stripe disputes and refunds in `core/stripe.js` and `apps/stripe.js`; Legal data requests in `legal/*`; the cancel flow in `core/churn.js`; Product bugs in `product/tracker.js`; Insights incidents), then what was built.

Verdict scale: **full** (a player decision exists, hidden truth, real consequence, logged), **partial** (some of it exists), **missing**. "Today" is the state before this change; "Now" is after it. Numbers marked [design] are game estimates anchored on the research ranges, never real statistics (the research notes found no sourced share-of-tickets figure for any of these flows).

## 1. Audit

### Billing

| Flow | What the game did | Verdict | What was missing | Now |
|---|---|---|---|---|
| Invoices, VAT, PO | AI intent "invoice" (how-to only); enterprise invoices exist in Stripe | missing | No ticket with a VAT ID or entity decision, no merchant-of-record answer, no cost of a wrong invoice | `invoice_vat` case |
| Refund requests (web, policy, partial) | `core/stripe.js refund()`, first-charge refund rate, AI refund Procedure with `overRefund` | partial | No policy window, no reason code, no goodwill path, no learned-to-ask effect, player refunds not judged | `refund_request` case, refund window setting, `refundHabit` |
| Store refunds (Apple, Google) | Nothing | missing | Developer cannot refund store purchases; promising one is a chargeback | `refund_request` with channel apple/google |
| Charged after cancel | Nothing (core has no cancel failure) | missing | Cause (forgot, trial, cancel-path bug), logs check, Product escalation, regulator exposure | `charged_after_cancel` case, ROSCA-shaped legal bill |
| Disputes and chargebacks | Core opens disputes at research rates; Payments app writes an LLM-judged evidence packet; $15 plus $15 fees; win 35% x (0.5 + quality) | partial | No cause (own error vs friendly fraud), a lapsed dispute logged nothing, no ratio or network lines, no link from the ticket | `dispute` case (adopts the Payments packet), `disputeRatio`, network levels, `dispute_missed` etc. |
| Plan changes, cancel via support | Self-serve Churnkey-style cancel flow, save tactics and pauses (`core/churn.js`); AI cancel Procedure | partial | Support-handled downgrade, pause, annual switch, proration rule; blocking a cancel had no cost | `plan_change` case, `cancel_blocked` |
| Failed payment, card update | Dunning sequence in core | partial | No ticket; asking for card numbers by email (PCI) | `payment_failed` case |

### Account, data, security

| Flow | What the game did | Verdict | What was missing | Now |
|---|---|---|---|---|
| Lockouts, 2FA, SSO | AI intent "login" (how-to) | partial | Identity decision for a lost-2FA request; urgency and "big customer" pressure | `lockout_2fa` case |
| Ownership transfer, social engineering | Nothing | missing | Verification checklist, fraud share, takeover consequences | `ownership_transfer` case, breach task in Insights |
| GDPR and CCPA requests | Legal tracks requests with a 30-day clock; "Answer" is one click; a miss adds exposure 0.5; rate about 10x the research | partial | CCPA 45-day clock and acknowledgement, identity verification, export, deletion across processors, billing, extension notice, controller routing, impostors, complaint after a miss | Legal rate recalibrated, `dsr` case bridged to Legal's list, "just mark answered" flagged as a token answer |
| Deletion (incl. Apple/Google) | AI intent "sso/data deletion" (human) | missing | Cancel billing first (deleting an account does not stop store billing), processors, retention | Part of `dsr` deletion |
| Security reports, beg bounty | Random breach and leaked-key events in Insights only | missing | Real vs beg vs scanner, bounty policy, disclosure clock, security.txt | `security_report` case, `securityTxt` setting |
| Abuse and legal requests | Nothing | missing | Valid vs impostor "police", counsel, e-Evidence 10-day clock | `legal_request` case. UGC moderation not modelled (the game has no UGC) |

### Product issues

| Flow | What the game did | Verdict | What was missing | Now |
|---|---|---|---|---|
| How-to, onboarding, deflection | Help center articles graded, KB gaps from ticket themes, AI docs intents, onboarding emails | full | Nothing material | unchanged |
| Bug report to engineering to close the loop | Tickets quote open bugs; Product triage inbox exists (accept, decline, duplicate) | partial | No ticket-to-issue link, no report count, duplicate issues from tickets, no "tell the customer it is fixed" | `bug_report` case, `issue_fixed` notify, `loop_not_closed` |
| Feature requests, boards | "feature" tickets; Customers app feedback emails | partial | No log with votes and MRR that Product can read; promises; shipped notification | `feature_request` case, `featureRequestLog()` |
| Integration, API, webhook | AI intent "integration" (how-to) | missing | Cause (upstream, our bug, config, rate limit, auth), idempotent replay | `integration_issue` case |
| Outage and status page | Insights incidents, status update quality, silent-outage mistake, spike x0.6 | partial | SLA credits, VIP check-ins | `sla_credit` and `vip_checkin` cases from incidents |
| Data wrong, data loss | Insights data-loss event (8 h restore, no ticket) | partial | The customer ticket, snapshot-before-restore decision, near-certain churn | `data_wrong` case |

### Support operations

| Flow | What the game did | Verdict | Now |
|---|---|---|---|
| Channels (email, chat, Slack, social, phone) | Email, Slack Connect for B2B | partial | Live chat (expectations, coverage, time), social/Reddit as public complaints. Phone not modelled |
| SLAs and tiers by plan | SLA by priority; Slack tiers by MRR | partial | `TIER_SLA` starter/pro/enterprise x P1-P4, VIP half-target, enterprise double-miss escalation |
| Macros | 3+ macros = -30% time | partial | Macro quality, `for` matching, merge fields, wrong or robotic macros logged |
| Tags, priorities, notes | Priority by category | partial | Tag taxonomy, priority, internal note; scored and reported (tag rate) |
| VIP routing | None | missing | `isVip`, `vip_checkin`, "no verification bypass" in the fraud cases |
| Multilingual | None | missing | Language per customer, four policies, machine-translation error rates, CSAT by language |
| After-hours coverage | Weekend inbox check; Insights paging for incidents | partial | None / auto-reply / pager / AI-first for P1s, energy cost |
| Abusive customers, firing | None | missing | `abusive_customer` case, drain hours, firing well vs badly |
| Public complaints, viral risk | Reviews with public replies; FTC fake-review rule | partial | `public_complaint` case (X, Reddit, review), viral hazard, astroturf |
| Metrics | FRT, CSAT, backlog, AI repeat contact | partial | Reopen rate, tag rate, backlog age, dispute win rate and ratio, per-language CSAT |
| AI agent scope | Scope per intent, Procedures, handoff rules, batch test | partial | Per-case-type scope Off / Draft / Auto with the vendor default of Auto |

Summary: of 30 flows, 1 was full, 18 partial, 11 missing. All 29 non-full flows are now built as case types or Ops settings, except phone support and UGC moderation (not in the game).

## 2. What was built

Module `public/apps/support/` (state at `state.apps.support.flows`):

- `flow-types.js`: 19 case types, each with arrival rate by model, hidden facts, actions, checks, a pure `decide` (how right the action is given the facts) and `apply` (real consequences).
- `flows.js`: generation (carved out of the day's ticket volume, so load is conserved), `handleCase`, hours, scoring, pending consequences, dispute scan and ratio, Legal DSR bridge, incident hooks, researcher arrivals, request log, AI handling, Automations events.
- `flow-lib.js`: shared helpers (tiers, VIP, language, scheduled disputes, cancels, fines). `flowstats.js`: pure metrics for the operator reader. `flows-ui.js`: the Cases and Support ops tabs.

### Case types, frequency and handling (all frequencies [design])

| Type | Arrives | Real handling (stellar) | Mishandling costs |
|---|---|---|---|
| invoice_vat | 4% of SMB tickets (1% B2C, 6% enterprise) | Validate VAT ID, fix the customer record, re-issue once; say plainly when a merchant of record issues it | Reissue loop, AP-friction churn at renewal, VAT filing correction bill |
| refund_request | 5% B2C / 2.5% SMB | Identify channel; apply the written window; goodwill only for real causes; reason code | Over-refund leak (and rising refund requests), promised store refund becomes a dispute and review, wrongful denial becomes a $15 chargeback |
| charged_after_cancel | 6% B2C / 3% SMB | Check logs, admit a cancel failure, refund and cancel in one reply, file the failure with Product | Dispute, public post, review; 3 unfixed failures in 60 days bring a regulator inquiry bill |
| plan_change | 8% | Confirm account, state the rule, offer saves once, cancel at period end, log the reason | Blocking or hard-selling is a dispute, post and logged dark pattern |
| payment_failed | 3% (needs a past-due sub) | Secure update link; extend the retry | Card details by email: PCI clean-up |
| dispute | from Stripe | Accept own errors, contest friendly fraud with usage log, terms, reminder, device match; or write the packet in Payments | Lapsed = lost plus $15; contesting own error; conceding a winnable one; ratio levels (watch 0.5%, warning 0.75%, excessive 1.5% with 5+), per-dispute program fee, payout hold after 8 weeks |
| lockout_2fa | 5% | Email on file plus a second factor or admin approval | Fraud 4%: takeover (admin = breach task) |
| ownership_transfer | 0.02-0.1 per 100 customers a month, 20% fraud | Callback to the owner on file, owner-only question, audit log, 48 h hold; refuse with a path | Takeover: breach clock, chargeback, churn, $2.5-6k |
| dsr | via Legal: 1.25 per 1,000 B2C users a month; GDPR 30 days, CCPA 45 plus 14-day acknowledgement | Log clock, verify, export or delete including processors, cancel billing, retention note, extend inside the window if complex, route B2B employees to the controller | Impostor = breach; partial deletion and token answers = authority complaint risk; missed deadline = complaint, counsel, review |
| security_report | real 1.5 a year, beg 8, scanner 4 (scaled by customers) | Reproduce, rate by impact, escalate with a timeline, credit, no macro; pay nothing to beg bounties | Beg bounty paid = money wasted and more arrive for 90 days; real ignored = public disclosure in 30-45 days and exploitation risk; threats = press story |
| legal_request | 0.01-0.03 per 100 a month; 30% impostor | Verify through the official channel, counsel, minimum scope | Impostor = breach; ignoring a valid order = penalty |
| bug_report | 4-6% | Search first, link or file once with steps, workaround, close the loop when fixed | Duplicate issues, thin issues, closed real bugs, fixed-but-silent |
| feature_request | 4-6% | Search the log so votes add up, record MRR, honest status, notify when shipped | Fragmented votes, broken promised dates cancel the promised account |
| integration_issue | 1-6% | Read logs, check upstream, replay with idempotency | Double processing, blamed customers |
| data_wrong | 0.6-1% plus Insights data-loss events | Snapshot first, audit log, restore and verify, credit | Blind restore overwrites; near-certain churn, public post |
| sla_credit | after incidents of 43+ min, enterprise tier | Compute uptime, read the contract, credit proactively | Contract breach churn |
| vip_checkin | after severe incidents | Personal outreach | VIP churn |
| abusive_customer | 0.3-1.5% | Heated: de-escalate (short, specific, a time). Abusive or threat: warn once, document, fire with notice, pro-rata refund | Argue or ignore = 2 h a month drain and energy; firing abruptly or firing a valid complaint = dispute and post |
| public_complaint | 0.02-0.15 per 100 a month, plus from mishandled cases | Acknowledge fast, once, private route, fix first | Defensive, delete, ignore, or astroturf: viral hazard (churn x1.1, landing x0.88 for 30 days), reviews, FTC exposure |

### Operator tiers (principle 7)

A case score is 0.4 decision (vs the hidden facts) + 0.3 required checks run + 0.15 reply grounded in the ticket (or macro quality) + 0.15 record discipline (tag, priority, a note that survives hand-off), minus SLA and chat penalties. `test/support-flows.test.js` plays four scripted operators on the same 21 forced-truth cases: stellar 0.93, good 0.71, average 0.35, mediocre 0.05; mediocre play logs about 6x the mistakes of stellar and about 20x the cost after 60 days. Time is not the lever: stellar handling spends more minutes (verification takes 3-30 min a check) than mediocre.

Hours: base minutes per type plus the minutes of each check run, a written reply (up to 8 min), macros -30% when good, live chat +25%, language policy (machine +10%, reviewed +40%, native -10%), AI draft -50%. The UI shows the estimate before sending; `ctx.act` charges it.

### AI-agent scope (per case type; default is the vendor's "answer everything")

| Level | Types | What goes wrong if allowed to decide |
|---|---|---|
| safe (Auto) | plan_change, payment_failed, feature_request | About 3-5% wrong |
| assist (Draft) | invoice_vat, refund_request, charged_after_cancel, lockout_2fa, bug_report, integration_issue, dispute | Refund: approves out-of-policy and store "refunds" (5% + 30% x procedure gap); cancel-failure: says "you forgot" 40%; lockout fraud: resets 30%. Draft halves the time and lets 20% of its errors through |
| never (Off) | ownership_transfer (35% approves fraud), dsr (25%: returns another user's data, misses the clock), security_report (30%: promises a bounty or dismisses a real one), legal_request (40% complies with impostors), data_wrong, sla_credit, abusive_customer, public_complaint, vip_checkin | Wrong decisions run the same consequence code as a human mistake, logged as `ai_flow_wrong` (and `ai_flow_scope` once while the default is untouched) |

## 3. Honest limits

- Customer text is deterministic templates (works offline); there is no LLM persona reply loop for cases. The score is a function of decision, checks, grounded-reply heuristic (`replyQuality`, `deescalation`) and record discipline.
- Phone support and UGC abuse moderation are not modelled. The EU e-Evidence deadline is modelled as a 10-day clock; penalties were not quantified in the research and are [design].
- Product reads the request log through `featureRequestLog(state)`; Product's own UI does not display it yet (a Product-side change).
- `state.apps.support.flows.off = true` is a sandbox switch for tests that study one other system (used by `test/success.test.js`).
- The Legal "Just mark answered" button remains but is flagged as `dsr_token`.
