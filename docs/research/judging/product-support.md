# Judging rubrics: product, customer research and support

Pattern (gold standard: `public/apps/fundraising/rubric.js`, helper `public/core/rubric.js`): the model scores observable
criteria against anchors and quotes the page; the game applies fixed weights (`weighted()`), so calibration is
deterministic and testable. Code: `public/apps/product/rubrics.js`, `public/apps/support/rubrics.js`,
`public/core/rubric-schema.js` (strict schema builder + 1-5 to 0..1 / 0..100 mapping).
Anchors are written as things visible on the page. Weights, thresholds and the 0..1 mappings are [design] choices, not statistics.

## Sources used

- Shape Up ch. 6, "Write the pitch" (Basecamp): problem as a concrete story, appetite, solution, rabbit holes, no-gos. https://basecamp.com/shapeup/1.5-chapter-06 (fetched 2026).
- Existing repo research: `docs/research/hr-legal-product.md` §6 (spec rubric and swap test), `docs/research/sales-and-research.md` §4 (Mom Test rubric, NN/G synthetic users 2024/2025).
- Rob Fitzpatrick, *The Mom Test* (2013): past specifics, compliments and fluff are bad data, commitments that cost time, reputation or money are the signal. (Web search returned no primary page; relied on the repo's research file and the book. Marked: not re-verified this session.)
- Intercom Fin Procedures help article "How to write instructions in Fin Procedures": instruction steps as the default unit of work, `@Condition` for IF/ELSE, data connectors used sparingly (at most one per step), `@Handoff to team`. https://fin.ai/help/en/articles/13976256-how-to-write-instructions-in-fin-procedures (2026).
- Knowledge-Centered Service (Consortium for Service Innovation), article structure Issue / Environment / Resolution / Cause: https://library.serviceinnovation.org/KCS/KCS_v6/KCS_v6_Practices_Guide/030/030/020/010 (v6); environment statements separate similar issues with different fixes.
- Zendesk QA default scorecard categories (Comprehension, Solution offered, Tone of voice, Spelling and grammar, Closing): https://support.zendesk.com/hc/en-us/articles/7043712922522 (2026). "Empathy" and "next steps" are not default categories; they are custom in practice.
- Help-center writing practice (task-named titles, one topic per article, short scannable sections, annotated screenshots for UI steps): community Zendesk guides, e.g. https://ticketing.united-church.ca/hc/en-us/articles/9396528088845 and https://docs.commslayer.com/en/articles/1783702100-what-makes-a-good-help-article. Community advice, not a vendor standard.
- G2 "How to respond to reviews" one-pager and Trustpilot business blog: correct factual errors, lead with an apology for sound criticism then say what changes, personalise, move resolution details offline, do not engage a rude or vague review. https://sell.g2.com/hubfs/how-to-respond-to-reviews.pdf, https://ca.business.trustpilot.com/blog/learn-from-customers/how-to-respond-to-negative-reviews. Vendor guidance.
- FTC Rule on Consumer Reviews and Testimonials (16 CFR Part 465, effective Oct 2024), Q&A: no review suppression by intimidation, threats or knowingly false accusations against the reviewer (465.7); no incentives conditioned on sentiment (465.4); insider reviews need disclosure (465.5). https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers
- Unverified and NOT used as numbers: a "88% internal quality score" industry benchmark (third-party blog), "89% of consumers read business responses" (Trustpilot, secondhand), Help Scout "25% higher CSAT" (vendor marketing).

## Why the old prompts were handwavy

| Judge | Old prompt | Gap |
|---|---|---|
| feature_spec_grade | Rules list + 0-4 per dimension, no anchors | The model chose what "2" meant; a fluent spec could drift up. |
| feature_market_value | One sentence, three 0-1 floats | Relevance and workaround-removal were gut numbers. |
| interview_grade | Penalise / credit list, one 0-100 score | The model picked the number; the game's heuristic differed from the live path. |
| interview_notes | "rate quality 0-100" | No definition of a good note; compliments and invented detail could pass. |
| interview_chat | Behaviour bullets | No rule for when a real fact is revealed; model leaked facts or stonewalled inconsistently. |
| support_procedure_grade | One sentence | Quality 0-1 unanchored. |
| help_article_grade | One sentence | Same; product accuracy was not checked against shipped features. |
| review_response_grade | Prospect voice, 0-1 | No legal floor; a threatening reply could score well. |
| support_reply | Customer voice, `satisfied` 0-1 | The model chose satisfaction directly and could mark long apologetic non-fixes as solved. |
| customer_review | "consistent with N stars" | Reviews drifted from their rating. |

## 1. feature_spec_grade (scale 0-4, anchors at 0 / 2 / 4)

Judges: a one-page spec (title, user, problem, solution, acceptance criteria, metric + baseline, non-goals). Consumers: `spec.js combineGrades` (total /20, bar 12, core dims >= 2), evidence capped by linked REAL insights, effort bounded by heuristic. Scale kept 0-4 so stored grades and the pass bar are unchanged.

| Criterion | 0 | 2 | 4 |
|---|---|---|---|
| specificity | buzzwords, verb lists, vanity metric | one capability, metric lacks baseline/window | swap test fails; outcome metric with baseline, target, window |
| userClarity | "users", "everyone" | role or context only | role + size + context |
| testability | none / "works well" | happy-path Given/When/Then | 3+ criteria incl. failure case and a number |
| scopeRealism | no non-goals, SSO+mobile+compliance | non-goals but v1 oversized, no risk note | explicit not-in-v1, weeks-sized, named risk + mitigation (Shape Up appetite, rabbit holes, no-gos) |
| evidence | none, solution-as-problem, SYNTHETIC only | one REAL insight, no count | several REAL insights with count, frequency, cost, current workaround |

Benchmarks: Shape Up pitch ingredients; repo rubric §6 thresholds. Anti-gaming: instant lint blocklist stays first; evidence is capped in code by verified REAL insights; the prompt says length, tone and buzzwords never raise a score; low scores must quote the spec and say what a stellar spec would say there.

## 2. feature_market_value (1-5, game derives relevance / removesWorkaround / displayOnly)

Judges: a shipped feature's market value for the stated ICP. Consumers: `valueFromJudgment` -> `f.valueLLM` -> hidden true fit.

| Criterion (weight) | 1 | 3 | 5 |
|---|---|---|---|
| icp_fit | other customer / everyone | plausible, not daily work | squarely in weekly workflow |
| problem_frequency | rare | monthly | daily or weekly and costly |
| manual_work_removed (2) | displays data they have | speeds one step | eliminates a recurring manual task |
| acts_on_data | read-only | one action after viewing | does the action itself |
| not_free_elsewhere | prompt a free assistant does | some workflow advantage | needs their live data/integrations |

Derivation (game, fixed): relevance = unit(icp_fit, problem_frequency); removesWorkaround = unit(manual_work_removed, not_free_elsewhere); displayOnly = acts_on_data <= 2. Old-shape judgments still pass through.

## 3. interview_grade (rehearsal transcript, 1-5, mapped to 0-100)

Judges: transcript of a rehearsal with an AI persona (never evidence). Consumer: iv.grade.score, notifications, coaching text.

| Criterion (weight) | 1 | 3 | 5 |
|---|---|---|---|
| past_specifics (3) | generics, future | 1-2 "last time" questions, not followed | walks the last instance and digs |
| no_leading (2) | several leading | one | none |
| no_pitching (2) | early pitch / talks > 50% | late short pitch / 30-40% | no pitch / under 30% |
| digs_for_cost (2) | never asks cost/tool | one of cost, tool, who decides | number + workaround + decider |
| earns_commitment (2) | "keep me posted" | follow-up or intro | pilot / LOI / deposit after pain was found |

Score = (weighted - 1) / 4 x 100, computed by the game. Offline path: `gradeTranscript` keeps its original 0-100 heuristic and also returns the five integers (derived from question tags, revealed facts, talk ratio, commitment). Benchmarks: talk under ~30% (sales-and-research §4). Anti-gaming: repeated questions earn nothing (heuristic); the live judge is told only the transcript counts; coaching must quote the weakest question and give the better question.

## 4. interview_notes (real-call notes, 1-5, mapped to 0-100)

Judges: the founder's own notes of a REAL call (honor system; verification is separate). Consumer: iv.grade.score, insights extracted for spec evidence.

| Criterion (weight) | 1 | 3 | 5 |
|---|---|---|---|
| past_facts (3) | opinions, plans | facts but undated | last instance, dated, numbers |
| money_and_workaround (2) | neither | one | both + what they tried |
| quotes_vs_interpretation (2) | conclusions as quotes | paraphrase only | verbatim quotes, interpretation labelled |
| compliments_filtered (2) | "would definitely use it" = demand | noted equal to behaviour | flagged as non-evidence |
| commitment_signal (2) | none / polite no logged as yes | follow-up / intro | pilot, LOI, payment with exact words |

Anti-gaming: the prompt tells the judge round or invented-looking detail counts as missing; existing `notesProblem` still requires 40+ words, a number and a past-tense action; evidence stays capped by `verified` in the spec grader.

## 5. interview_chat (role-play, no grader voice)

Not scored. `INTERVIEWEE_RULES` gives the persona a decision rule for revealing a real past fact versus a polite non-answer: reveal one fact only after ONE open question about a specific past instance from a founder who showed they understood; go vague on generics or stacked questions; give compliments and shrugs to hypotheticals, leading questions and pitches; call out repeats; offer a next step only if the pain is real and the ask is specific. Mirrors `fallbackReply`. Basis: Mom Test (specifics vs fluff) and NN/G (synthetic users are too agreeable, so the persona is written to be less so). Ground truth (pain real, commitment caps, pre-order gating) is still enforced in code.

## 6. support_procedure_grade (1-5 -> quality 0..1)

Judges: an AI-agent Procedure the founder wrote (intent, steps, connector, when-not). Consumer: `addProcedure` quality (capped 0.3 without Payments for action intents), simulations and batch tests.

| Criterion (weight) | 1 | 3 | 5 |
|---|---|---|---|
| concrete_steps (2) | vague goals | ordered, some compound | one action per step: what to look up, do, say |
| branching_policy (3) | none | IF with one branch / no numbers | IF/otherwise with real days, dollars, plans |
| data_and_actions (2) | acts with no connector | connector named, unused | right connector, lookup step first, one call per step |
| handoff_exceptions (2) | none | "escalate if needed" | named triggers + what is passed |
| scope_guardrails | none | one exclusion | exclusions + what customer is told |

Source: Intercom Fin Procedures (conditions, data connectors, handoff). Anti-gaming: repeated or keyword-only steps penalised (heuristic) and called out in the prompt. Quality = (weighted - 1) / 4.

## 7. help_article_grade (1-5 -> quality 0..1)

| Criterion (weight) | 1 | 3 | 5 |
|---|---|---|---|
| task_title | feature name / slogan | topic noun | task or question in customer words, one topic |
| steps_followable (3) | prose | numbered, vague UI | one action per step, exact labels, expected result |
| product_accuracy (3) | describes what does not exist | general | real shipped features and limits |
| complete_selfserve (2) | no prereqs/failure | one of them | prereqs + failure path + next contact |
| scannable_concise | wall of text / 600+ words | padded | under ~300 words, numbered, visual placeholders |

Source: KCS structure, community help-center guidance. Anti-gaming: the judge gets the shipped feature list and is told confident steps naming absent features are wrong; marketing words lower the fallback score. The existing `articleStale` mechanic still decays quality when the product changes.

## 8. review_response_grade (1-5 -> quality 0..1, legal floor)

| Criterion (weight) | 1 | 3 | 5 |
|---|---|---|---|
| specific_acknowledgement (2) | generic | names topic | restates the specific complaint |
| ownership_no_defense (3) | defensive, blames | neutral | owns real fault; corrects a fact calmly |
| concrete_fix (3) | no action stated | "we'll improve" | what changed, with timing, or direct contact |
| tone_and_brevity | canned / wall of text | generic or long | human, 40-100 words |
| compliance (2) | accuses of faking, legal threats, pay-to-edit, private data | asks to update review | clean |

Game rule: compliance 1 caps quality at 0.15 (FTC 16 CFR 465.7 intimidation / false accusations; 465.4 sentiment-conditioned incentives). Source: G2 / Trustpilot guidance, FTC Q&A.

## 9. support_reply (customer role-play, 1-5 -> satisfaction 0..1)

The model stays the customer; it silently scores what it felt and answers in character.

| Criterion (weight) | 1 | 3 | 5 |
|---|---|---|---|
| addressed_my_issue (3) | different question / echo / template | on topic, misses a detail | uses my specifics |
| correct_resolution (3) | nothing changes / wrong | partial or workaround | fixes, exact steps, refund owed, or honest "can't" |
| next_step (2) | none | vague | numbered or dated, with an owner |
| honesty_timeline (2) | false "fixed" / overpromise | no timeline | honest timeline, acknowledges the wait |
| ownership_tone | canned, blames | polite template | personal, owns real fault once |

Game: satisfaction = unit(criteria); `solved` is overruled to false unless correct_resolution >= 3 and addressed_my_issue >= 3 (a warm non-fix cannot close the ticket). Maps to Zendesk QA Comprehension / Solution offered / Tone, plus next step and honesty as custom categories. Offline path keeps `replyQuality` (already hardened against keyword stuffing and echoing).

## 10. customer_review (writer)

Not a grader. `REVIEW_STAR_GUIDE` anchors what a 1/2/3/4/5-star review contains ([design] summary of public review-site patterns, not a statistic): low stars name one concrete failure, high stars name a concrete job done, no invented features, no marketing language, max 4 sentences. Prevents a 1-star review that praises or a 5-star that gushes.

## What was not changed or not sourced

- No numeric benchmark for "good" help-article length or reply length from a primary source; 300 words and 40-100 words are [design].
- Mom Test commitment ladder is from the book via the repo's research file, not re-fetched.
- Weights and the (w-1)/4 mapping are [design]. Live-vs-offline calibration of the new mappings against real model outputs was not run (offline only; rule: no long calibration).
