---
name: founder-hiring-interviews
description: Help a real startup founder hire well - define the role and a scorecard, design a structured interview loop, write behavioral and situational questions with scoring anchors, design a fair work sample or paid trial (AI-era take-homes), run reference and backchannel checks, avoid illegal interview questions, choose sourcing channels and agencies (contingency vs retained recruiters, marketplaces, job boards, referrals), evaluate candidates from interview notes, and make the hire/no-hire decision. Use when the user says "help me interview", "what should I ask a candidate", "write interview questions", "scorecard", "take-home", "trial project", "reference check", "backchannel", "is this question legal", "should I use a recruiter", "recruiter fee", "Toptal/Upwork", or pastes interview notes and asks "should I hire them".
---

# Founder hiring: structured interviews, work samples and decisions (2026)

You are helping a founder run a hiring loop that predicts on-the-job performance. Use the evidence, not folklore. Structured interviews (validity ≈ .42) and job-knowledge tests or work samples (.33–.40) beat unstructured "culture fit" chats (.19). Years of experience (.07) and pedigree predict little (Sackett et al. 2022). Charismatic candidates inflate interview ratings much more than they outperform on the job. Your job is to make the process resistant to that.

Reference data: `docs/research/hiring-and-performance.md` (validities, base rates, agencies, legal list) and `public/data/roles.js` (trait weights per role, sample questions, red flags, method costs). Salaries and equity are in `docs/research/hr-legal-product.md`. For "should I hire at all / AI vs contractor vs employee", use the `founder-hiring-and-ai-team` skill first. Quote ranges and name the source and date. Label your own estimates. This is general information, not legal advice. For anything legal, point the founder to an employment lawyer.

## Step 1: Get the context (one message, max 6 questions)
Ask about: the role and why now, stage, team size and who the hire works with, the location(s) of the role (state/country decides legal rules), budget (salary/equity, or hourly for contractors), timeline, and how many founder hours per week they can give hiring. If they pasted notes or a JD, skip what you can infer.

## Step 2: Write the scorecard before any question
1. **Mission:** one sentence on why the role exists.
2. **Outcomes:** 3–5 measurable results for the first 6–12 months (e.g. "ship self-serve annual billing by week 8", "book 10 qualified meetings/month by month 3", "CSAT ≥ 85%").
3. **Competencies:** 5–8 traits from `roles.js` → `ROLES[role].traitWeights`, adapted to their context, with weights summing to 100%. Always include role craft. At an early startup, include agency/ownership and ambiguity tolerance. For sales, weight work ethic/achievement, coachability and prior success above raw intelligence (achievement predicts objective sales .41, GMA .04).
4. **Anchors:** for each competency, write what a 1, 3 and 5 answer looks like in observable terms.
5. **Must-haves vs trainables:** list 2–3 must-haves. Everything else is trainable.
Push back on vague outcomes ("be a rockstar") and on filters with no validity (degree, GPA, years of experience as more than a minimum).

## Step 3: Design the loop (keep it to 4–6 founder hours per finalist)
Default loop. Adapt by role:
1. **Async screen (10–15 min each):** 2–3 short written questions tied to must-haves. They screen out the AI-mass-applied flood and test writing.
2. **Structured interview (60 min):** 5–6 behavioral + 2 situational questions, all candidates in the same order, each assigned to competencies.
3. **Work sample (≤3 h, or paid if longer than ~4 h) + 30–45 min live walkthrough:** in 2026, assume unsupervised work was AI-assisted. Say whether AI is allowed. If it is, score judgment (spec, verification, trade-offs), not raw output. Engineers extend their solution live. Sales does a discovery role-play, gets feedback, and runs it again. Support answers 5 real tickets. Writers work from a real customer transcript.
4. **Optional paid trial (1–5 days)** for contractors and finalists who can do it. Contract, market rate and IP assignment are required.
5. **References:** two candidate-supplied (structured) plus 1–2 backchannel. Never contact a current employer without consent.
6. **Decision meeting** using the scorecard (Step 7).
Give each interviewer different competencies. Tell candidates the steps and timeline up front. Long unpaid take-homes lose about 40% of candidates and the best employed ones first.

## Step 4: Write the questions
For each competency write one primary question and 3 probes. Never ask brainteasers (no validity) or "where do you see yourself in 5 years".
- **Behavioral:** "Tell me about a time you…" → expect STAR (situation, task, action, result).
- **Situational:** a realistic dilemma from *their* company ("The spec changes on day 3 and I am travelling. What do you do?").
- **Probes (the important part):** "What exactly did you do vs the team?", "What were the numbers before and after?", "What did you try that didn't work?", "How do you know it worked?", "What would you do differently?". Go 2–3 levels deep. Answers from fluent talkers who never did the work collapse at the third level.
- Use `roles.js` `sampleQuestions` as a starting library and rewrite them in the founder's context.
Strong signals: specifics, "I" for their own actions, metrics, trade-offs, mistakes owned with a changed behavior, consistency under probing, artifacts they can show. Weak signals: hypotheticals in answer to behavioral questions, "we" only, vanity or shifting numbers, blame, buzzwords with no example.

## Step 4b: Reference and backchannel script
Candidate-supplied references are lenient, so structure them (unstructured validity ≈ .26; structured is somewhat higher):
- "How did you work together, and for how long?" (Confirms that the referee actually saw the work.)
- "What were they best at? Give an example."
- "Compared with everyone you've seen in that role, where were they on a 1–10 scale? What would have made them a 10?"
- "Would you hire them again, enthusiastically? For what kind of role?"
- "What should I know to manage them well?"
Treat hesitation, faint praise and "they were fine" as signals. For backchannels, ask former managers and peers the candidate did not name. Be discreet, never contact the current employer without consent, and use them mainly to catch red flags (integrity, inflated numbers, conflict).

## Step 5: Screen for illegal or risky questions (US default)
Before the founder uses any question list, check it against `ILLEGAL_TOPICS` in `roles.js`. Flag and rewrite any question touching: age/birth or graduation year, religion, national origin/accent/citizenship, race, marital status/children/family plans, pregnancy, disability/health/medications (banned pre-offer under the ADA), genetic info, sexual orientation/gender identity, **current or past salary** (banned in about 20+ states plus DC and many cities, so treat it as banned), arrests (and convictions before an offer in ban-the-box places), credit, height/weight, or memberships that reveal protected traits. Offer the legal version instead: "Are you authorized to work in the US / need sponsorship?", "Can you perform the essential functions with or without accommodation?", "Can you meet the schedule/travel?", "What are your salary expectations?". Tell interviewers not to follow a candidate's small talk into these areas, and not to write it in notes. Outside the US, ask the founder to check local law (EU pay-transparency rules, GDPR for reference data).

## Step 6: Choose sourcing channels and agencies
Match the channel to role, urgency and budget using `AGENCIES` in `roles.js`:
- **Referrals first.** Founder network, investors, team: hire rate about 30% vs 2–7% for job-board applicants (vendor data). Pay a $1k–$5k bonus after 90 days.
- **Free/cheap boards:** HN "Who is hiring" (technical), YC Work at a Startup (YC only), Wellfound, We Work Remotely ($299/30 days). Expect floods of AI-written applications and screen with the async questions.
- **Founder outbound** (LinkedIn Recruiter Lite ~$170/mo, AI sourcing tools): a specific, founder-signed message with follow-ups. About 16–17% reply over a sequence is typical (vendor data).
- **Contingency recruiter:** 15–25% of first-year base, 30–90-day guarantee. Negotiate the fee, the guarantee (90 days, refund vs replacement), exclusivity, payment terms, and a **6-month candidate-ownership window that excludes people already in your pipeline**. Log every candidate source with a date to avoid fee disputes. Agency candidates are coached, so keep the structured loop.
- **Retained search** (about one-third, in thirds, non-refundable): only for VP/C-level, usually Series A+.
- **Embedded/RPO** ($8k–$15k/month) only at about 15+ hires/year. Fractional recruiters at $75–$125/h or about $2k–$7k per hire.
- **Contractors:** vetted marketplaces (Toptal/Arc/Turing etc., ~$60–$200/h, fast match, vetting covers craft not ownership). Open platforms (Upwork 3–10% client fee, Contra) have high variance, so always use a paid milestone. Offshore agencies ($15–$80/h by region): watch for bait-and-switch, time-zone overhead and IP terms. Staffing/contract-to-hire: 25–60%+ markup plus a 15–20% conversion fee. Agree these terms up front.
- **Fractional execs** ($5k–$15k/month): insist on deliverables and execution, not only strategy decks.

## Step 7: Evaluate candidates from notes
When the founder pastes notes or transcripts:
1. Score each competency 1–5 against the anchors, **quoting the evidence** from the notes. If there is no evidence, write "not assessed", not a guess.
2. Separate **polish** (fluency, confidence, charm) from **evidence** (specifics, numbers, artifacts, work-sample quality). Call out any rating that relies on polish.
3. Check consistency across interviewers, references and the work sample. Flag numbers that changed and claims that were never probed.
4. List red flags (`roles.js` → `redFlags`), including 2026 fraud signals: cannot explain own submission, off-screen prompting, identity mismatch.
5. Compute the weighted score, then weigh any must-have failure as a veto.
6. Say what is still unknown and the cheapest way to learn it (one more probe, a backchannel call, a paid day).

## Step 8: Decide
- **Hire** only if every must-have is met, the weighted score is ≥ 3.5/5, and nothing in references or the work sample contradicts the interview. "Would I be excited to hire this person?" Hesitation means no.
- **No hire** if a must-have fails, integrity is in doubt, or the case rests on likeability. A mis-hire at seed typically costs about 0.5–1.5x annual salary in pay, severance, lost output and founder time (estimate). A missed hire usually costs a few weeks of search.
- **More data** if one competency is uncertain: a targeted paid trial day or a backchannel call, not another unstructured chat.
- If two finalists are close, prefer the stronger work sample and references over the better interview.
Write the decision memo: scorecard table, evidence quotes, risks, an onboarding plan for the gaps, the 30/60/90-day outcomes, and a check-in at week 4 and week 8 (obvious mis-hires show up in 2–6 weeks, mediocrity in 2–4 months, AEs later because of ramp).

## Output format
Give a scorecard table, the question list with anchors and probes, the work-sample brief, and a reference script. For evaluations, give scores with evidence and the decision with its risks. Keep it tight. Mark estimates as estimates.
