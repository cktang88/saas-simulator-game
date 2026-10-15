# Judging rubrics: investors, people and ops (research for the simulator)

Scope: the LLM judges for investor outreach and meetings, investor updates, board memos, accelerator and SBIR applications, co-founder profile and conversations, job posts, candidate interviews and emails, and the spend-policy reader. Pattern (same as `public/apps/fundraising/rubric.js`): the model scores observable criteria 1-5 against 1/3/5 anchors and quotes evidence; the GAME applies fixed weights (`public/core/rubric.js` `weighted()`), so outcomes stay deterministic. Criteria live in code: `public/apps/fundraising/judge-rubrics.js`, `public/apps/cofounder/rubrics.js`, `public/apps/people/judge-rubrics.js`, `public/apps/money/spend-rubric.js`. Offline scorers: `fundraising/judge-fallbacks.js` and the helpers next to each rubric.

Conventions: [S] = sourced (URL, year), [D] = design assumption (never shown to players as a statistic), [U] = unverified, found only in secondary or low-authority pages, or recalled and not re-fetched this session. Web research was a single pass of searches (October 2026); several vendor-blog pages were unvetted and are marked.

Why weights are fixed in the game: a model that outputs one holistic number drifts between runs and models. Per-criterion integers with quoted evidence are repeatable, the weights are testable, and the feedback shown to the player names the criterion that cost points.

---

## 1. Investor outreach (`investor_outreach_judge`): cold email and warm-intro blurb

**Judges:** one investor persona reading a cold email, or a forwarded intro blurb from a mutual contact. The score `quality` drives reply and meeting odds (`channelFactor`, `meetingOdds` in `sim.js`).

**Prompt gap before:** "rate how compelling it is for YOU (1-5)". No anchors; "compelling" rewarded length and flattery in practice.

**Criteria** (weights in parentheses; cold: hook 3, fit 2, ask 2, credibility 2, concision 1.5; warm swaps `fit` for `forwardable` 2):

| key | 1 | 3 | 5 |
|---|---|---|---|
| hook | greeting, flattery or backstory; no number in the first two lines | number present but vague or below the opening | line one: what it does + one hard metric matching the real metrics |
| fit (cold) | could go to any investor | names firm or sector generically | cites a portfolio company, post or thesis; stage and check size match |
| forwardable (warm) | needs the thread; introducer must rewrite | readable alone, needs edits | 2-4 sentences, third person, pasteable with zero edits |
| ask | none, "pick your brain", several asks | a call, no round context | one small ask (20-minute call or named intro) + round size, instrument, timing |
| credibility | hype adjectives or contradicts metrics | mostly factual | every claim checkable, matches metrics, one-line why-me |
| concision | over 200 words | 120-200 | under 120 (warm: 2-4 sentences) |

**Benchmarks:** generic cold email reply 1-5%, opt-in cold list 5-15% (existing `angels-and-landscape-2026.md` rows, [S] DocSend/OpenVC-type figures as cited there); deck-to-meeting at pre-seed 1-2% (DocSend, Feb 2026, cited in `angels-and-landscape-2026.md`). Practitioner consensus from a web pass: keep it under roughly 80-120 words, open with a hard number or a specific investor affinity, make one small ask, send one follow-up after 5-7 days that adds news, forwardable blurb of 2-4 sentences written so the introducer looks good for sending it ([S-weak] https://startupfortune.com/how-to-write-a-cold-email-to-an-investor-that-actually-gets-a-reply/ 2026, https://echai.ventures/startingup/mentors-network/how-do-i-write-a-cold-email-to-a-founder-or-investor-i-admire-that-actually-gets-a-reply; word counts are rules of thumb [U]; the forwardable-blurb template guidance comes from one skills repo and its mirrors [U]).

**Anti-gaming:** the judge sees the real metrics, so inflated numbers score 1 on credibility. Offline scorer counts a number only next to a metric noun, caps repeated keywords, and a keyword-list "email" (function-word share under 12%) caps every criterion at 2. Doing it wrong costs: burned warm paths (the intro is spent) and lower reply odds that compound via the follow-up decay already in `sim.js`.

## 2. Investor meeting: live investor (`investor_pitch_meeting`) and private notes (`investor_meeting_judge`)

**Judges:** the investor role-play stays in character (no grader voice) and gets "what moves you" guidance (`INVESTOR_MOVES`): warm up at first-sentence answers, exact numbers matching the sheet, owning weaknesses; cool down at vagueness, mismatched numbers, buzzwords, dodges; probe a vague answer once; ask for the ask if never given. The notes judge scores six criteria; `performance` = weighted average, then the existing cap (fewer than 3 answers cannot exceed 2.5) stays.

**Prompt gap before:** "reward specific numbers... penalize vagueness" with no anchors; one holistic `performance`.

**Criteria** (weights): metrics_command 3, candor 2.5, insight_moat 2.5, ask_milestones 2, directness 1.5, control 1. Anchors in `judge-rubrics.js` `MEETING_CRITERIA` (1 = vague or contradicts the sheet; 5 = volunteers MRR, growth, churn, burn, payback including unflattering ones; names the weakest part before asked; a non-obvious insight and a specific shift in the last 18 months; amount, instrument, runway and the milestones that reach the next round's bar).

**Grounding:** the next-round bar and the "why now / defensibility / founder-market fit" tests are the ones already in `fundraising.md` §3 and §6 (Series A bar about $1-3M ARR at 2-3x growth; wrapper test). Candor as a signal: investors repeatedly say they back founders who surface problems first (practitioner consensus; see §3 sources). [D] the 1/3/5 thresholds for numbers volunteered.

**Anti-gaming:** the model is told contradictions with the REAL METRICS score 1; offline, a metric counts only as number + noun. Answers over about 160 words lose directness. Short meetings stay capped.

## 3. Monthly investor update (`investor_update_review`)

**Judges:** an investor panel scoring a founder update. Output keys `candor`, `clarity`, `asks_specificity`, `accuracy` are unchanged (consumed by `ir.js`, the Scorecard and `applyUpdate` hid-bad-news logic); new `progress`. `updateQuality` is now the fixed-weight average (candor 3, accuracy 3, clarity 2, asks 2, progress 1.5).

**Criteria anchors:** see `UPDATE_CRITERIA`. Sources for structure (summary/TL;DR, KPIs compared with the prior period, highlights, lowlights, asks; same day each month; 3-5 highlights tied to metrics; each lowlight paired with cause and fix; narrow, time-boxed, named asks): Visible's copy of the format YC recommends ([S-weak] https://resources.btov.vc/strategy/board-and-investor-matters/investor-updates, https://waveup.com/blog/investor-update-template/ 2026, https://echai.ventures/startingup/investor-relations/how-do-i-write-a-great-monthly-investor-update). I did not retrieve YC's own page [U]. Existing game rules kept: unflagged KPI redefinition costs warmth, hiding a decline is punished at the next raise (`ir.js`).

**Anti-gaming:** `accuracy` is checked against the authoritative metric sheet (offline: MRR claim more than 15% off scores 1-2). Asks are typed and "specific" only with a name, company or role. Highlights count only with numbers and a comparison.

## 4. Board memo (`board_memo_review`)

**Judges:** the lead investor on a 3-person board. `quality` = weighted average over: plan_vs_actual 3, decisions 3, risks_candor 2.5, cash_runway 2, concision 1. Consumers read `quality`, `feedback`, `questions` (unchanged).

**Prompt gap before:** a single "candid memo" wish list, one number.

**Sources:** pre-read 2-4 days ahead (24h minimum), actuals versus plan with explained variances on a stable dashboard, 1-3 explicit decisions, risks up front, short text memo over slides ([S-weak] https://articles.sequoiacap.com/preparing-a-board-deck, https://gtm.stage2.capital/p/board-meeting-best-practices-for, https://slidepeak.com/blog/saas-board-presentation; Sequoia notes Qualtrics, Domino and Thumbtack use Amazon-style memos). I could not retrieve Brad Feld / Fred Wilson text this pass [U]; the criteria do not depend on them.

**Anti-gaming:** a decision counts only with the words approve/vote/recommend and a deadline; risk counts need mitigation language; length floors and ceilings (a 40-word memo or a 1,500-word dump both score low on concision).

## 5. Accelerator application (`accelerator_application`)

**Judges:** a partner reading YC / Techstars / speedrun answers. The model scores five criteria; the game maps `score` (1-10 versus the pool) = 2 x weighted, which feeds `acceleratorOdds` as before (median applicant about 6, strong about 9).

**Criteria** (weights): progress 3, insight 2.5, velocity 2, plain_answer 1.5, ambition_team 1.5.

**Sources:** YC's own advice (Paul Graham, [S] https://www.ycombinator.com/howtoapply.html): put the answer in the first sentence in the simplest terms, no marketing language; partners separate accomplishments from plans. Secondary: founders first, then traction, then idea; zero traction is the most common reason not to reach interview; address being solo head-on ([S-weak] https://standuply.com/blog/yc-application-advice/, https://sifted.eu/articles/y-combinator-yc-batch-apply-tips, https://www.stackmatix.com/blog/what-yc-looks-for-in-startups; the "zero traction" claim is [U]). Acceptance rates are in `fundraising.md` §1 and `instruments.js`. I did not fetch Techstars-specific criteria [U]; the rubric is program-agnostic.

**Anti-gaming:** progress counts only metric-noun + number; "we plan / will build" with no numbers subtracts; hype words cap plain_answer; stuffed text caps all criteria at 2.

## 6. SBIR/STTR Phase I (`sbir_review`)

**Judges:** a panel reviewer. Five criteria (technical_risk 3, approach 2.5, innovation 2, commercial 2, team 1.5); `score` (1-10) = 2 x weighted; `deep_tech` retained and feeds `grantOdds`.

**Sources:** NSF America's Seed Fund merit review: Intellectual Merit (potential to advance knowledge; overcoming technical risk with science/engineering methods), Broader Impacts (societal benefit), Commercial Impact (market potential, competitive advantage, team's ability to commercialize); at least three external reviews plus a program director review; panel decision typically 1-3 months after the deadline ([S] https://seedfund.nsf.gov/apply/review-decision, https://seedfund.nsf.gov/resources/awardees/phase-1/merit-review/, summary at https://brisa.arizona.edu/node/1451; criterion labels vary across years [U]). NIH uses Significance, Investigator(s), Innovation, Approach, Environment scored 1-9 [U, recalled, not re-fetched]; the game's `team`, `innovation`, `approach` criteria mirror those. Reauthorization through 2031 is in `buyer-segments.md` (P.L. 119-83). Key calibration: most ordinary SaaS is not R&D, so the first criterion anchors "ordinary software build or integration" at 1.

**Anti-gaming:** `technical_risk` falls with routine-engineering words (web app, dashboard, CRUD, integrations) and rises only with hypothesis/uncertainty/benchmark language; `deep_tech` is derived from it offline. Writing a proposal for a non-R&D product wastes the 8 writing hours and the submission with a low odds payout.

## 7. Co-founder profile (`cofounder_profile_review`)

**Judges:** a strong candidate skimming matching-platform profiles. Criteria: accomplishment 3, the_ask 2.5, commitment 2.5, traction_proof 2, working_style 1.5. `cf.me.quality` = weighted, as before.

**Sources:** YC Co-Founder Matching guidance: complete, detailed profile showing one specific accomplishment that shows how you think, say clearly what you want in a partner, then a quick video call and a trial project ([S-weak] https://www.ycombinator.com/blog/what-do-people-want-in-a-co-founder 2021; startupschool.org/faq). From YC's 2021 analysis: 79% of profiles want the co-founder to commit to a number of hours for a few weeks, though only about 15% and 13% see these as must-haves [S-weak, as reported by search summary; verify against the YC post]. Settle money and equity conversations early ([S-weak] YC Startup Library).

**Anti-gaming:** accomplishment counts numbers next to a noun; clichés ("passionate", "visionary") subtract; traction claims are shown to the judge beside the real MRR.

## 8. Co-founder call (`cofounder_call_judge`) and chat (`cofounder_chat`)

**Judges:** a potential co-founder in character. The chat gets `CHAT_MOVES` (what raises or lowers interest: specific hours/start date/runway, clear role split, reasoned equity with 4-year vesting and 1-year cliff for both, a real past disagreement, honest weak spots, questions about the other person; down: pressure to decide, "50/50, figure it out later", evasions, claims that do not match visible traction). After the call, private notes score six "what moves you" criteria (commitment_alignment 2.5, equity_vesting 2.5, honesty 2.5, roles_decisions 2, conflict_handling 1.5, curiosity 1); the game computes `interest` = round(weighted), capped at 3 if the founder spoke fewer than three times.

**Sources:** vesting mechanics and the 4-year / 1-year cliff standard, trial projects, breakup hazard and equal-split data are already in the game's `cofounder/model.js` (`CF` params) and `docs/research/world-ops-support-life.md` §6. YC recommends a trial project before committing ([S-weak] YC Startup School). I did not find sourced conversation scripts or conflict-handling research beyond practitioner advice; the conflict criterion is [D].

**Anti-gaming:** offline `interest` mixes 75% rubric-from-text with 25% the candidate's hidden prior, so keyword stuffing cannot overturn a bad fit, and an inflated claim ("guaranteed", "cannot fail") lowers honesty. Wrong play costs: a passed candidate (lost search weeks) or a weak partner chosen with no trial, which raises the breakup hazard (existing `breakupHazard`).

## 9. Job post (`job_post_review`)

**Judges:** a strong, employed candidate skimming posts. Six criteria with a group tag: clarity group (ownership 2.5, requirements 2, process 1.5) and specificity group (outcomes 3, pay 3, company_context 2). The game derives `clarity` and `specificity` (1-10) = 2 x weighted of each group; `payTransparency` and `postQuality` are unchanged downstream.

**Sources:** pay transparency: EU Pay Transparency Directive 2023/970 must be transposed by 7 June 2026 and requires a pay figure or genuine range in postings and bans salary-history questions ([S-weak] https://assessio.com/articles/eu-pay-transparency-directive-guide/ 2026, https://www.workday.com/en-gb/topics/hr/eu-pay-transparency-directive.html); US state posting laws exist in a growing list of states (Colorado, California, New York, Washington, Illinois and others) with mostly coaching-style enforcement so far ([S-weak] https://www.littler.com/news-analysis/asap/pay-transparency-laws-know-2025-united-states-and-beyond 2025; the per-state list changes yearly [U]; `hr-legal-product.md` holds the game's own treatment). Gendered wording: Gaucher, Friesen and Kay, Journal of Personality and Social Psychology 101(1), 2011: masculine-coded wording lowered women's anticipated belonging and job appeal, not perceived ability ([S] https://gap.hks.harvard.edu/evidence-gendered-wording-job-advertisements-exists-and-sustains-gender-inequality; a later replication found the effect in start-ups but not established firms [S-weak]). Outcome-based posts and 30/60/90 framing: structured-hiring practice already summarized in `hiring-and-performance.md`; the 1.35x / 1.6x range-spread anchors are [D] (wide ranges read as no range per the EU guidance).

**Anti-gaming:** pay scores from a real range or entered pay fields (not the word "competitive"); outcomes need timeline words plus numbers; the cliché list subtracts; word count floors stop one-liners. Wrong play costs applicants: `postQuality` shrinks the applicant flow and quality (existing hiring funnel), and repeating a cliché post wastes weeks of posting time.

## 10. Candidate interview (`candidate_interview`) and candidate email (`candidate_email`)

**Judges:** role-plays; no grader voice. `interest` (0-10) and `sentiment` (-1..1) stay as the outputs consumers read. They now get "what moves you" guidance: interview (up: specific behavioural questions with follow-ups, honest answers about runway, pay, role, a clear process; down: yes/no and leading questions, brainteasers, clichés, dodges, protected-topic questions) and email/offer (up: a fast reply that answers the specific question, concrete terms: base, equity percent and vesting, start date, a deadline of several days, honesty on runway, movement on the stated main concern; down: no answer, vague "competitive", exploding deadlines or pressure, silence).

**Sources:** structured interviews have the highest or near-highest validity: Schmidt & Hunter (1998) structured .51, unstructured .38, work sample .54, GMA .51; Sackett et al. (2022, Journal of Applied Psychology) re-estimated structured .42, unstructured .19, work sample .33 and GMA .31, so structured interviews rank first ([S-weak, via summaries] https://master-hr.com/insights/new-study-providing-updated-validity-estimates/, https://www.noon.ai/blog/articles/356-structured-interview-validity; check the original papers before quoting numbers in-game [U]); the game already uses a .20-.50 execution range (`hiring-and-performance.md` §1.7). Offer practice: send offers within about 5-6 days of the final interview, keep contact between interview and offer, candidates counter 10-20% and weigh equity, scope and base ([S-weak] https://builtin.com/job-interview/counter-offer, https://underdog.io/blog/offer-letter-negotiation 2026; recruiter-side closing advice was thin [U]); offer-acceptance benchmarks (Ashby, Gem) are in `acceptProbability`.

**Anti-gaming:** the question grader in `interview.js` (behavioural vs leading vs illegal) stays the objective part; the LLM candidate only answers from hidden traits. The email sentiment fallback rewards specific numbers, concern-matched content and fair deadlines, and penalizes pressure; an exploding deadline lowers `offerSentiment`, which feeds `acceptProbability`.

## 11. Spend policy (`spend_policy_read`)

**Judges:** a controller reading a policy an AI expense agent will enforce. The six clauses (receipts, approval, software, travel, prohibited, split) are now scored 1/3/5 for enforceability, with quoted evidence for any score under 4; the game counts a clause as covered only at 4+ and still requires the topical regex (`savePolicy`).

**Sources:** Ramp's policy builder FAQ: core elements are expense categories, dollar limits, receipt rules, submission deadlines, approval workflows and prohibited items; only 48% of policies specify a submission deadline and 66% a daily meal cap; sample prohibited list: personal expenses, cash advances, donations, gambling, luxury car rentals, gift cards for employees, travel for non-employees; 3-5 categories had the lowest violation rate ([S-weak, as reported by search summary] https://www.ramp.com/expense-policy-builder, https://ramp.com/blog/what-is-an-expense-reimbursement-policy 2026). IRS receipt rule: expenses of $75 or more need a receipt, lodging always ([S-weak] secondary guide; confirm in IRS Pub. 463 [U]). Brex-branded guidance: pre-approval thresholds commonly $100-$250, airfare booking windows of 14-21 days, per-night lodging limits that vary by location ([S-weak] syndicated Brex article). Exact deadline day counts and meal caps are not sourced; anchors say "a stated number" and "a cap", not a value.

**Anti-gaming:** unchanged anti-stuffing (one sentence can establish at most two clauses); the offline heuristic requires a topical word plus a specific (amount/deadline). Weak policies cost real money later (missing receipts, split purchases, forgotten trials), which `spend.js` already simulates.

---

## Not sourced or deliberately left out

- YC's own investor-update template, Brad Feld / Fred Wilson board guidance, Techstars criteria, NIH scoring details: [U] (not retrieved this pass).
- Co-founder conflict-handling research: criterion is [D].
- Exact per-state pay-transparency list: left to `hr-legal-product.md`; the judge only checks that a real range is present.
- The 1/3/5 numeric thresholds (word counts, 1.35x range spread, number-of-metrics buckets) are [D] calibration to practitioner guidance, not statistics, and are not shown to players as such.
