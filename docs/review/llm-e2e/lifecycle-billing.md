# Live LLM review: lifecycle, billing and customer tasks

Script: `node docs/review/llm-e2e/lifecycle-billing.mjs [filter]` (not part of `npm test`; raw outputs go to `docs/review/llm-e2e/out/lifecycle-billing.json`).
It uses two contrasting companies: **LedgerLoop**, an indie B2B SMB Shopify bookkeeping tool ($39/mo, 40 customers), and **Attestly**, a venture-backed seed-stage SOC 2 evidence agent for mid-market fintech ($1,500/mo, 8 customers). Every labeled case runs 2 samples.

| Run | Checks passed | LLM calls (mock) | Cost |
|---|---|---|---|
| Before (original code) | 69/95 | 154 (34 fell back offline) | $0.028 |
| After (this branch on top of main) | 97/97 (last full run 95/97; both flaky checks fixed and re-run) | 167 (0) | $0.037 |

Total live spend for the review was about $0.20.

## Cross-cutting finding (fixed on main, not here)
On OpenRouter, Haiku 5.5 thinks by default (about 1,000 reasoning tokens per call), and the thinking counts against `max_tokens`. The JSON then came back empty or cut off, and 22% of calls fell back to the offline heuristic without saying so. Hit hardest: dunning (4/6 calls), exit interview (6/6), trial panel (9/9), pricing VW (2/2). I confirmed `reasoning: { enabled: false }` fixes it, and main now does this in commit 903b51f. My local edit to llm.js was dropped in favour of main's.

## Per task

### lifecycle_email_judge: live, accurate
- Welcome email scores (0-1): strong 0.80, mediocre (stock "excited to have you on board") 0.25, gamed (buzzwords, 4 links, 30% off) 0.13. Enterprise trial-ending email: strong 0.83, mediocre 0.25. Jev answered on every call.
- The feedback reads like a real reviewer: "Cut the discount, the webinar and the feature tour, and send one email with a plain subject like 'Your first Shopify payout match'…"
- No change needed once the reasoning fix landed.

### lifecycle_email_draft: live, fine
- Drafts are 95-130 words with exactly one `{{ctaUrl}}`, name the activation action ("Match your first Shopify payout", "Run your first AWS and Okta collection") and contain no discount.
- The judge scores them 0.45-0.89. In play, an unedited AI draft is capped at 0.42 (`nodeQuality`), so the player still has to rewrite it. The check tests that cap.
- Made `aiDraft` exportable so the script can call it.

### plg_upgrade_prompt_judge: live, accurate
- Scores: strong (usage numbers, saved work, a one-off pack, "remind me") 0.91, mediocre ("Upgrade to Pro") 0.30, gamed (countdown, 50% off, four buttons) 0.23. Jev answered.

### dunning_copy_judge: fixed
- Before: 4 of 6 calls fell back offline because of the reasoning issue.
- After: strong 3-step sequence 0.86, single no-reply "payment failed" 0.14, threatening "FINAL WARNING / collections" 0.30. `tone_sender` scored 1 on every threatening message.
- Fixes:
  - The reader is now a real median-tenure subscriber ("You are on the Starter plan at $39/month and have paid for 4 months; you did not know the card had a problem"). The reader is also told that placeholders get filled when the email is sent.
  - The judge sometimes merged two identical messages into one entry. The prompt now asks for exactly N entries, and a merged step reuses its twin's score.
  - Refactored into an exported `judgeDunningSteps`.

### price_increase_notice: fixed (realism and calibration)
- Before: two fixed generic personas ("a small-business owner who relies on the product daily"…) gave *identical* churn risks (0.30/0.30), because they copied the anchors in the schema description. One persona invented the increase ("Forty percent more" when the real figure was 26%). Merge tags were called "sloppy".
- After: up to three real subscribers read the notice: the longest-tenure account, the newest and the least active. Each gets their tenure in months, their usage from the success app's `usageProxy`, their own price, the exact % increase and the customer-level business facts. The churn-risk description now asks for the risk to *you, given how much you rely on it*. Each reader's usage scales their risk from ×0.79 to ×1.12 [design].
- I also recalibrated `criteriaChurnRisk` to `inc × (1.2 − 1.05q)`. Before, even a flawless notice left a 1.65× churn spike. Now, for +26%: flawless ≈ 1.5×, mediocre ≈ 2.2×. The comment on `migrationChurnMultiplier` was fixed to match.
- Results:
  - Churn risk: strong 0.06, mediocre 0.28-0.32, gamed ("thrilled… unlocks value") 0.33. Enterprise: strong 0.05-0.06, mediocre 0.27.
  - The same mediocre notice sent to a book of heavy users vs barely-active ones: 0.23 vs 0.37.
  - Example readers: "I've used this every working day for seven months, so I'm annoyed, but I'll probably stay" vs "I barely log in anymore, so this is the push I needed to cancel."
- Refactored into exported `judgePriceNotice` and `noticePersonas`.

### dispute_evidence: fixed
- Quality (0-1): strong (reason-matched, dated logins and IP, accepted clause, prior AVS-matched charges) 0.78-0.79, generic "we are legitimate" 0.14, keyword-stuffed and abusive 0.10. Win chance in the game is 0.35 × (0.5 + q), so the best letter wins about 45% of the time, which is realistic for issuers.
- Before: when the merchant's records showed the customer *had* cancelled, the strong letter still scored 0.70-0.71. The judge wrote "no contradiction with the merchant's records was found", and blending with Jev pulled `consistent_concise` above the cap.
- After:
  - A deterministic check (`contradictsRecords`) caps such letters at 0.20.
  - The prompt now spells out that a denial contradicts the log.
- Refactored into exported `judgeDisputeEvidence`, and `disputeFacts` is exported.

### customer_feedback_email: live, fine
- Customers write 3-5 sentences in a plain voice about one symptom, with a detail only a real user would know: "Last Tuesday's Shopify payout got posted to QuickBooks Online twice… so my bank rec is off". They mention no features the company doesn't have. A cancelling customer gives the reason they would say out loud.

### customer_reply: fixed
- Before: 3 of 8 calls fell back offline (`maxTokens: 250` cut the JSON off).
- After: `maxTokens: 600`, all calls live.
- Satisfaction (0-1): strong (owns it, says what was fixed, asks a question) 0.85-0.86, canned "we value your feedback" 0.10-0.14, flattering with a 20% discount 0.10-0.22. Cancel thread: accepting the decision 0.73-0.80 vs begging with 50% off 0.12-0.45.
- The customer stays in character: "Thanks, but the accountant has already set us up on Xero… a discount won't change that."

### exit_interview: fixed
- Before: 6 of 6 calls (then 4 of 6) fell back offline (`maxTokens: 500`).
- After: `maxTokens: 900`, all calls live.
- Judged question quality (0-1): open "walk me through the week" questions 0.87-0.88, leading ("was it the price?") 0.14-0.25, pitching 0.13-0.15. Chance of revealing the true reason: 0.81 / 0.18 / 0.14.
- The true reason in the test is "never activated", while the survey said "too expensive":
  - The candid answer gives the real story: "Honestly, I never got it working. I signed up on a Tuesday, connected Shopify and QuickBooks, and the payouts… just s[at unmatched]".
  - The guarded answer stays on price: "It was mostly the cost for what we were using".

### product_trial_panel: fixed (major bug)
- Bug: `runPanel` declared `const brief = trialBrief(...)`, and inside the persona loop `const brief = competitionBrief(...)` shadowed it. Panelists never saw the website, price, onboarding mode or *any shipped feature*. They judged a blank product, so verdicts named no real features, and a strong product scored the same as a display-only one (0.21 vs 0.21).
- After: the loop variable is renamed. Panelists now quote the real features and catch any website/product mismatch ("the homepage promises payout reconciliation and QuickBooks sync… the only thing it actually ships is a 'Sales dashboard'").
- Strong product vs display-only one: 0.34 vs 0.20.
- Panelists are realistically unwilling to pay: activation 0.33-1.0 and pay rate 0 on 3-person panels. The enterprise panel balks at $1,500/mo without ISO 27001 (the ICP needs both). Willingness to pay: $300-400/mo for the enterprise product, $25 for the SMB one.

### pricing_vw: live, fine
- 12 respondents, 11-12/12 with correctly ordered answers.
- Acceptable range: $22-110/mo for the Shopify tool, $1,071-4,717/mo for the enterprise agent. Both are in line with each ICP's budget.

### pricing_gg and pricing_gg_buy (Jev): fixed
- Before: Jev answered a separate yes/no per price, which came back almost flat:
  - $150k/month seller: 0.76 / 0.72 / 0.75 / 0.73 / 0.72 from $20 to $78.
  - GRC lead with budget: 0.55-0.57 from $750 to $3,000.
  
  Separate questions can't see each other, so Jev never compared prices. The blended stated demand at 2× the list price was more than half the demand at 0.5×.
- After: Jev gets one `score` question that places the respondent's real maximum price on the survey's price ladder. P(buy at $X) = the probability mass at or above $X, so the curve falls with price by construction (`maxPriceLevels`, `buyCurveFromScore`).
- Results (P(buy) from lowest to highest survey price):

  | Persona | P(buy) |
  |---|---|
  | Side-hustle seller ($800/mo in sales) | 0.18 → 0.02 → 0.00 |
  | $150k/mo seller | 1.00 → 0.96 (at list price) → 0.75 |
  | $25k/mo seller, does own books | 0.99 → 0.61 (at list price) → 0.05 |
  | GRC lead with a $120k budget | 0.99 → 0.84 (at list price) → 0.54 |
  | Pre-seed founder | 0.02 → 0.00 |

  The ambiguous $25k seller is uncertain at the list price, as intended.
- Survey curves now fall properly: 0.61 → 0.14 (SMB) and 0.61 → 0.11 (enterprise).

## Still imperfect
- Personas compress probabilities. Readers who say "I'll probably stay" still state a 0.35 churn risk, and the usage multiplier only partly corrects this.
- On 3-person trial panels, activation swings between 0.33 and 1.0 from run to run. The game blends the panel 50/50 with the market's true fit, so this is noise, not bias.
- Dispute letters can still claim usage the game never recorded: there are no per-customer usage logs to check against.
- The issuer judge can't verify attachments. The contradiction check covers cancellation only.
