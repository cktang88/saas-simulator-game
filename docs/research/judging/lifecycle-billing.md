# Judging rubrics: lifecycle, billing and customer communications

Scope: `lifecycle_email_judge`, `lifecycle_email_draft`, `plg_upgrade_prompt_judge`, `dunning_copy_judge`, `price_increase_notice`, `dispute_evidence`, `customer_feedback_email`, `exit_interview`, `product_trial_panel`, `customer_reply`.

Pattern (see `public/apps/fundraising/rubric.js`, `public/core/rubric.js`): the model scores each observable criterion 1/3/5 and quotes the words behind every low score; the game applies fixed weights (`weighted()`), so calibration is deterministic. Customer personas (dunning reader, price-notice reader, churned customer, ticket writer) score "what makes me act / tell the truth" and stay in character.

Source tags: [P] primary (vendor docs/network rules), [V] vendor blog or dataset, [U] unverified or contradictory, [design] game assumption, never shown to players as a statistic.

## Sources used

- Stripe, "Dispute evidence best practices" (https://docs.stripe.com/disputes/best-practices, read 2026) [P]: evidence must match the reason code; chronological, grouped by type, short summaries; submit only the relevant policy excerpt, not the full ToS; for digital goods, IP/system logs proving use; AVS/CVC/3DS/IP for fraud claims; Visa CE 3.0 uses prior undisputed transactions; email threads do not verify identity; "providing too little evidence is a problem, but overwhelming the issuer obscures your argument"; networks count disputes received, not won. Radar win-likelihood table: 5 dots = 60%, 4 = 40%, 3 = 25%, 2 = 15%, 1 = 5% ("even in the most favorable cases, it is very difficult to overturn a disputed payment").
- Baremetrics, "Improve dunning recovery rate" (https://baremetrics.com/blog/improve-dunning-recovery-rate, over 1M dunning emails) [V, measured]: recovery by email timing: day 0 13.25%, day 3 11.46%, day 7 11.51%, day 15 4.22%; open rates 41% / 34% / 33% / 28%. Advice: a sequence of several emails over up to 30 days, first on the day of failure, escalating urgency, name the specific consequence, send from a real person's name (up to 35% open-rate lift, the article's own claim [U]), monitored inbox not no-reply, include name, amount, billing period and last 4 digits, send to all billing-permission users, add in-app reminders, offer a downgrade for insufficient funds but not for expired cards.
- Flycode dunning guide 2026 (https://docs.flycode.com/docs/dunning-management-2026-guide) [V, untraceable numbers]: 40-55% typical recovery vs 70-91% optimized; 20-30% card-update completion with a one-click hosted page. Stripe: businesses recover 55% of failed payments on average (stripe.com/billing 2026 [P], already in `docs/research/finance-and-payments.md` 1.4).
- Price-increase practice (getmonetizely.com, userpilot.com, dodopayments.com, 2025-26) [V/U]: 30+ days notice (45-60 for annual renewals), grandfather 6-12 months, increases under ~15% with new value attached usually absorbed, tie the increase to value delivered, test on new customers first. Patrick Campbell's "price sensitivity is non-linear" and "30-50% revenue left on the table" appear only in secondary blogs [U]. Churn model in `docs/research/channels-partnerships-pricing.md` 3.5 [design]. Legal floor: US state auto-renewal laws (California AB 2863 from July 2025, see `docs/research/support/s1-billing.md`).
- Paywall/upgrade prompts: only generic CRO heuristics were retrievable (value before ask, behavioural triggers near limits, benefit-led headline not price-led, easy close, measure view-to-click) [U]. No RevenueCat/Appcues/OpenView conversion benchmark could be retrieved, so none is stated. Game levers and dark-pattern rules come from `docs/research/plg-email/p1-plg-levers.md`.
- Onboarding email: welcome emails open at ~50% (Klaviyo 2025 via vendor blogs; figures vary 50-91%) [V/U]; send immediately (first hour best, VerticalResponse via Zoho [V]); one goal per email, short, personal. In-code benchmarks: B2B SaaS activation average 37.5% (Userpilot, 62 companies); 60-150 words (lifecycle/model.js lint, operator notes [design]). No source found comparing plain text with designed email, so it is not a criterion.
- Exit surveys/interviews (specific.app, getperspective.ai, getmonetizely.com, 2025-26) [V]: email exit surveys 5-15% response, in-flow cancel surveys 70-90% [U]; the stated reason is not the real reason ("price" often means no perceived value); respondents skew mildly dissatisfied; keep surveys short. No rigorous study of leading questions in cancellation surveys found [U]; technique follows the Mom Test (past behaviour, not hypotheticals), already used in `retention/interview.js`. Acceptance rates in the game are [design].
- Support tone and speed: `docs/research/operators/o3-product-support.md`, `docs/research/support/s1-billing.md`.

## 1. lifecycle_email_judge (public/apps/lifecycle/judge.js)

Judges one onboarding, nudge, trial-ending, win-back or broadcast email as the recipient. Output feeds `nodeQuality` (score 0-1), `nodeClarity` (pointsToActivation) and caps (reads as AI 0.45, upsell before value 0.35).

Prompt gaps: "judge as reviewer" with a free 0-10 score; no anchors; no kind-specific expectations.

Criteria (weight):
1. `one_action` (3): 1 = three or more links, a list of things to try, or several asks; 3 = one main button but extra secondary links/asks; 5 = exactly one link and one ask.
2. `activation_target` (3): 1 = "get started / explore" or no ask; 3 = names a feature area but not the brief's activation action; 5 = names the exact activation action from the brief in the reader's words, with the reason it matters to them.
3. `value_before_ask` (2): 1 = discount/upgrade/"we miss you" before the first useful result (or win-back to someone who never activated); 3 = no pitch but nothing concrete; 5 = hands over a concrete shortcut, template, example or result toward first value; trial-ending states the date, price charged and what they keep or lose.
4. `relevance` (2): 1 = could go to anyone on any day; 3 = acknowledges the stage generically; 5 = refers to what this reader did or did not do and to kind-specific facts (trial end date, what they used before canceling).
5. `human_voice` (2): 1 = stock filler ("excited to have you on board", "unlock the power"), buzzwords; 3 = plain but template-like; 5 = sounds like one named person, one concrete detail, invites a reply.
6. `brevity_subject` (1): 1 = over 200 words or a shouting/vague subject; 3 = 60-200 words or subject over 9 words; 5 = 60-150 words, 3-7 plain-word subject.

Anti-gaming: the `activation_target` anchor needs the action explained, not the label pasted; existing caps stay; offline results remain shrunk toward the median and are not stored as judge scores.

## 2. lifecycle_email_draft (public/apps/lifecycle.js)

A generator. Gap: "Be concise." Now instructed toward the same six criteria. Drafts still carry the unedited-AI cap in `nodeQuality`, so a better starting point is not a free pass [design].

## 3. plg_upgrade_prompt_judge (public/apps/plg.js)

Judges the copy of the in-app prompt shown at a usage limit. Output `copyScore` feeds 16% of the limits lever quality.

Criteria (weight):
1. `names_unlock` (3): 1 = "Upgrade to Pro"; 3 = names the tier or a vague benefit; 5 = names exactly what unlocks, with a number or the feature name.
2. `shows_position` (2): 1 = no mention of where the user stands; 3 = says they hit a limit; 5 = "You have used 9 of 10 projects" plus what happens next.
3. `value_moment` (2): 1 = interrupts before value or blocks the task; 3 = at the limit but unrelated to the task; 5 = tied to what the user just did, lets them finish or keep their data.
4. `no_pressure` (2): 1 = countdown, stacked promos, guilt; 3 = urgency language; 5 = calm, honest, dismissing is obvious.
5. `one_action_alt` (1): 1 = several buttons/offers; 3 = one upgrade button; 5 = one primary action plus a lower-commitment alternative.
6. `benefit_led` (1): 1 = leads with price or brand; 3 = mixed; 5 = leads with the user's outcome.

Sources: p1-plg-levers.md, generic CRO heuristics [U].

## 4. dunning_copy_judge (public/apps/stripe.js; scoring in core/stripe.js dunningStepQuality)

A customer reads each failed-payment message. Output is blended 50/50 with the heuristic into step quality, which drives card-update probability.

Criteria, "what makes me update my card now" (weight):
1. `clear_what_happened` (2): 1 = "payment failed" with no plan/amount/card; 3 = says what failed; 5 = plan, amount, last 4 or date, and that it is a card problem.
2. `one_click_fix` (3): 1 = no way to fix, or "contact billing"; 3 = link buried in the text; 5 = one prominent update link to a hosted page.
3. `tone_sender` (2): 1 = threats ("final warning", "collections"), blame or no-reply; 3 = neutral corporate; 5 = a named person who takes replies, friendly, assumes an honest accident.
4. `consequence_dates` (2): 1 = no consequence or vague; 3 = says access may stop; 5 = exactly what happens and when (date access pauses, data kept).
5. `alternative` (1): 1 = none; 3 = "reply if you have questions"; 5 = pause or downgrade offered where it fits (not for expired cards).
6. `sequence_fit` (1): 1 = same text every step or tone mismatched to the day; 3 = slightly escalating; 5 = day 0 gentle and practical, middle step names the consequence, last step gives the exact date and a human fallback.

Benchmarks: Baremetrics recovery by timing [V]; Stripe 55% average [P]. Anti-gaming: urgency words do not score; `consequence_dates` needs a date or a concrete event.

## 5. price_increase_notice (public/apps/stripe.js, money/judge.js)

Two customer personas read the notice. Output `churnRisk` drives a 60-day churn multiplier.

Criteria, "what makes me stay or leave" (weight):
1. `what_changes` (3): 1 = vague ("pricing update"); 3 = new price but no old price or date; 5 = old price, new price, effective date and cadence in the first lines.
2. `notice_runway` (2): 1 = under 14 days; 3 = about 30 days; 5 = 45-60+ days.
3. `why_and_value` (3): 1 = no reason or "excited to announce"; 3 = generic cost reasons; 5 = names the specific things shipped since I signed up and what is next.
4. `options` (3): 1 = none; 3 = says I can cancel; 5 = a way to lock the old price (annual, grandfather window), a downgrade path and an easy cancel.
5. `tone_honesty` (2): 1 = spin, "thrilled", hides the number; 3 = corporate; 5 = direct, a named person who takes replies.

Benchmarks: 30+ days notice, grandfather 6-12 months [V]; under ~15% increases usually absorbed [U]. `churnRisk` is blended 50/50 with a criteria-derived risk [design] so a merely cranky persona cannot overrule the page.

## 6. dispute_evidence (public/apps/stripe.js, money/judge.js)

An issuer analyst scores the evidence letter. Output `quality` drives the chance of winning.

Criteria (weight):
1. `reason_match` (3): 1 = generic "we are legitimate"; 3 = addresses the claim, not the reason code; 5 = opens by refuting the exact claim for that reason code.
2. `proof_of_use` (3): 1 = none; 3 = says the customer used the product; 5 = dated logins/usage after the charge with IP or session detail.
3. `authorization_history` (2): 1 = none; 3 = one of AVS/CVC/3DS/IP/prior payments; 5 = several, including prior undisputed payments (CE 3.0 style).
4. `policy_disclosure` (2): 1 = none; 3 = names the policy; 5 = the relevant clause quoted plus proof it was accepted at checkout, with the date.
5. `timeline_receipts` (2): 1 = no dates/amounts; 3 = some dates; 5 = chronological: signup, acceptance, reminder and receipt emails, charge, usage, with amounts.
6. `consistent_concise` (2): 1 = contradicts the merchant's own records, emotional or padded; 3 = fine but long; 5 = factual, neutral, strongest proof first.

Calibration: Stripe's win table tops out at 60% with strong evidence [P], so weighted 1-5 maps to quality 0.05-0.85 [design]; a contradiction of the records caps quality at 0.2 in code.

## 7. customer_feedback_email (public/apps/customers.js)

A generator: a real customer writes to the founder. Realism criteria used as writing instructions: `specific_symptom`, `stakes_workaround`, `plain_voice`, `grounded` (only features that exist), `length` (2-5 sentences). Cancel emails give the stated reason, not the whole truth (stated vs real reason gap, churn-reasons.md).

## 8. customer_reply (public/apps/customers.js)

The customer rates the founder's reply. Output `satisfied` (0-1) drives resolved/saved/won-back.

Criteria, "what makes me feel helped" (weight):
1. `answers_my_issue` (3): 1 = ignores or restates; 3 = relevant but partial; 5 = answers my exact problem.
2. `concrete_next` (3): 1 = "we value your feedback", "on the roadmap"; 3 = vague promise; 5 = a fix done, a date, or a workaround I can use now.
3. `ownership_tone` (2): 1 = defensive, blames me, canned; 3 = polite template; 5 = owns it plainly, human.
4. `understands_me` (1): 1 = no question; 3 = generic question; 5 = one real question about my situation.
5. `cancel_handling` (2, cancel threads only): 1 = begs or leads with a discount; 3 = offers help; 5 = accepts the decision, asks what would have changed it, leaves the door open.

## 9. exit_interview (public/apps/retention/interview.js, customers.js)

The churned customer scores the founder's questions and decides whether to tell the truth. Output `questionQuality` feeds `revealChance`.

Criteria, "what makes me open up" (weight):
1. `open_questions` (2): 1 = yes/no; 3 = mixed; 5 = what/how/walk-me-through.
2. `past_event` (3): 1 = hypotheticals; 3 = general reasons; 5 = the specific week/moment, who was involved, what they use now.
3. `non_leading` (3): 1 = proposes the answer ("was it the price?"); 3 = a neutral list of options; 5 = no answer implied.
4. `no_pitch` (3): 1 = pitches, offers a discount or argues; 3 = mild defending; 5 = purely listening.
5. `scope_depth` (1): 1 = one question or an interrogation of 10+; 3 = 3-8 questions without follow-ups; 5 = 3-8 questions with a follow-up probe.

Sources: Mom Test technique; exit-survey practice [V]. Anti-gaming: duplicate openers earn nothing (existing de-dup).

## 10. product_trial_panel (public/apps/customers.js)

Personas who trialled the product decide activated / wouldPay / WTP. Decision criteria stated to the persona (no new output fields; the schema lives in product/panel.js): `time_to_value`, `replaces_workaround`, `fits_my_stack`, `trust_match`, `price_vs_value`, `switching_cost`. Rules: activated only if time_to_value >= 3 and replaces_workaround >= 3; wouldPay only if price_vs_value >= 3 after switching cost. Most trials fail (37.5% activation benchmark); synthetic users are over-agreeable (NN/g 2024), so the rubric pushes toward skepticism. Features not listed do not exist; website claims the product cannot back lower trust_match.
