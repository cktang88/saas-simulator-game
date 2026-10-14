# Hiring, interviewing and on-the-job performance (research for the hiring system)

Compiled 2026-10-14 for the SaaS founder simulator. It feeds `public/data/roles.js` (traits, roles, methods, illegal topics, candidate pools, agencies) and the skill `.claude/skills/founder-hiring-interviews/SKILL.md`.

**Evidence labels.** [P] peer-reviewed primary study or meta-analysis. [G] government or statute. [S] secondary summary of a primary source. [V] vendor or vendor blog (commercial interest). [Q] practitioner opinion or anecdote. **[design]** marks game estimates I made, bounded by the cited evidence. They are not measured statistics and must not be shown to players as facts.

Related files: salaries, ramp, equity and employer burden are in `docs/research/hr-legal-product.md` §1. Support benchmarks (CSAT, first response) are in `docs/research/world-ops-support-life.md` §2. Outbound and SDR funnel numbers are in `docs/research/sales-and-research.md`.

---

## 0. The 10 findings that matter most for the game

1. **Structured interviews are the best single common predictor, and unstructured interviews are poor.** In Sackett, Zhang, Berry & Lievens (2022), corrected operational validity is **.42 for structured interviews and .19 for unstructured ones** (Schmidt & Hunter 1998 had .51 and .38) [P].
2. **The old validity numbers were inflated by range-restriction over-correction.** Most estimates fell by .10–.20. GMA fell from .51 to **.31** (and **.23** in 21st-century data). Work samples fell from .54 to **.33**. Years of experience fell from .18 to **.07** [P].
3. **Job-specific methods beat generic ones.** The top five are structured interviews, job-knowledge tests (.40), empirically keyed biodata (.38), work samples (.33) and GMA (.31). Contextualised personality ("at work" wording) beats generic personality. Conscientiousness is .25 contextualised vs .19 generic [P].
4. **Variance matters as much as the mean.** The SD of structured-interview validity is .19, giving an 80% credibility interval of about .18–.66. A badly run "structured" interview can be close to useless. The game should let question quality and scoring discipline change validity [P].
5. **Charisma inflates interview ratings much more than it predicts performance.** Impression management correlated **.47 with interview ratings but .15 with job performance** (Barrick et al. 2009, via Peck & Levashina 2017) [P/S]. Interviewers stay confident even when the answers are random (Dana et al. 2013) [P].
6. **Grit is mostly conscientiousness.** It correlates **ρ = .84** with conscientiousness and only about .18–.21 with performance. Only the perseverance facet adds anything (Credé et al. 2017) [P]. Model grit as a facet, not a separate super-trait.
7. **Sales is different.** Achievement (a conscientiousness facet) predicts objective sales at **.41** and potency (social dominance) at .26. GMA predicts supervisor ratings (.40) but **not objective sales (.04)** (Vinchur et al. 1998) [P/S]. Roberge's HubSpot hiring traits were coachability, curiosity, prior success, intelligence and work ethic [Q, book].
8. **Output varies a lot between people.** The SD of output is about 19% of the mean in low-complexity jobs, 32% in medium and 48% in high-complexity jobs, and higher in sales (Hunter, Schmidt & Judiesch 1990) [P/S]. In 2026 only **48% of AEs hit quota**, median AE ramp is **6.2 months** and median quota is **$960k** (Bridge Group, 2026-06-22) [V/P].
9. **AI broke unsupervised assessments.** One vendor flagged 38.5% of 19,368 AI-run interviews for cheating, 48% in technical roles (Fabric, 2025–26) [V]. Gartner found 6% of candidates admitted interview fraud and predicts that 1 in 4 candidate profiles could be fake by 2028 (2025-07) [S]. Applications per recruiter rose from 146 to 746 between 2022 and 2025 (Greenhouse) [V]. Take-homes need a live walkthrough, and some firms now *require* AI use in coding rounds (Canva, Meta pilot) [Q].
10. **Agencies trade money for time and send polished candidates.** Contingency fees are typically 15–25% of first-year base with a 30–90-day guarantee [V]. Retained search is about 25–35% (often one-third), paid in thirds [V]. Agency candidates are coached for interviews, so a structured process matters even more. Referrals convert to hires at roughly 4–10x the rate of job-board applicants [V].

---

## 1. Predictors of job performance

### 1.1 Validity table: Schmidt & Hunter (1998) vs Sackett et al. (2022)

Operational validity is the correlation with overall job performance, corrected for criterion unreliability and (where appropriate) range restriction. Source: Sackett, Zhang, Berry & Lievens (2022), *J. Applied Psychology* 107(11), 2040–2068, doi 10.1037/apl0000994, Table 3 (read from the author preprint) [P].

| Selection procedure | S&H 1998 | Sackett 2022 ρ | SD ρ | Lower 80% CV | Game method |
|---|---|---|---|---|---|
| Structured interview | .51 | **.42** | .19 | .18 | `structuredInterview` |
| Job knowledge test | .48 | **.40** | .13 | .23 | `jobKnowledgeTest` |
| Empirically keyed biodata | .35 | **.38** | .09 | .26 | (not modelled) |
| Work sample test | .54 | **.33** | .09 | .21 | `workSample` |
| Cognitive ability (GMA) | .51 | **.31** (.23 with 21st-century data, Griebe et al., cited in Sackett et al. 2023) | .14 | .13 | `gmaTest` |
| Integrity test | .41 | **.31** | .20 | .05 | `integrityTest` |
| Personality-based ("mixed") EI | – | .30 | .17 | .08 | – (fakeable self-report) |
| Assessment centre | .37 | .29 | .09 | .17 | – |
| SJT (knowledge / behavioural tendency) | – | .26 / .26 | .10 / .12 | .13 / .11 | `sjt` |
| Conscientiousness, contextualised | – | .25 | .00 | .25 | `personalityTest` |
| Interests | .10 | .24 | .25 | −.08 | – |
| Emotional stability, contextualised | – | .23 | .10 | .10 | – |
| Ability-based EI | – | .22 | .05 | .16 | – |
| Extraversion, contextualised | – | .21 | .08 | .11 | – |
| Conscientiousness, overall | .31 | **.19** | .15 | .02 | `personalityTest` |
| Unstructured interview | .38 | **.19** | .16 | −.01 | `unstructuredInterview` |
| Agreeableness / openness, contextualised | – | .19 / .12 | | | – |
| Extraversion / agreeableness / emotional stability / openness, overall | – | .10 / .10 / .09 / .05 | | | – |
| Job experience (years) | .18 | **.07** | .11 | −.07 | `yearsExperience` |
| Reference checks | .26 | not re-estimated ("insufficient information") | | | `referenceCheck` |
| Job tryout (paid trial) | .44 | not re-estimated | | | `paidTrial` |
| Years of education | .10 | not re-estimated | | | `educationFilter` |
| Graphology / age | .02 / −.01 | not re-estimated | | | – |

**How the range-restriction correction changed things.** Older meta-analyses corrected every predictor for range restriction using artifact distributions. These often came from small subsets of studies, from predictive designs applied to concurrent studies, or from national norms used as the "unrestricted" group. Sackett et al. argue that this overcorrects, especially for concurrent validation studies (incumbents tested at the same time as performance is rated), where restriction on the predictor is usually small. They apply no correction or only a modest one in that case. The result: most predictors fell by .10–.20. Rank order changed (GMA dropped from top to about 5th, or 12th on 21st-century data). Composites fell less: a six-predictor composite is .61 with GMA and .56 without it (Sackett et al. 2023, *IOP* 16(3), doi 10.1017/iop.2023.24) [P]. The structured-interview figure is .45 instead of .42 if you apply a full indirect correction (Table 4). The ranking is robust to that choice.

**Design implications.**
- Treat each method's `validity` as the correlation between the method's score and the hidden composite that drives performance. Observed score = `r·z_true + sqrt(1−r²)·noise` **[design]**.
- Validity depends on the player's execution. A structured interview with job-relevant questions, anchored scoring and notes reaches about .40–.50. A "structured" interview that drifts into chat falls to about .20 **[design, bounded by SD .19]**.
- Combining methods helps, with diminishing returns. A structured interview plus a work sample plus a reference check gives roughly .45–.55 **[design; composite logic from Sackett 2023]**.

### 1.2 Big Five, facets and narrow traits

- **Conscientiousness** is the most generalisable personality predictor: .19 overall and .25 contextualised [P]. Its **achievement** and **dependability** facets add prediction beyond the global trait. The size of the gain depends on the criterion and occupation (Dudley, Orvis, Lebiecki & Cortina 2006, *JAP* 91(1)) [P/S]. Achievement striving matters most in sales and autonomous roles.
- **Extraversion** matters mostly through **potency/assertiveness**, in sales and management. Vinchur et al. (1998) found potency correlated .28 with sales ratings and .26 with objective sales. Achievement correlated .25 and .41 [P/S]. Sociability alone is a weak predictor.
- **Emotional stability** is a small predictor overall (.09 overall, .23 contextualised). It is the strongest Big Five predictor of **reactive adaptive performance**. Ambition predicts **proactive adaptation**. Openness does not predict adaptive performance (Huang, Ryan, Zabel & Palmer 2014, *JAP*, 71 samples, N = 7,535) [P/S].
- **Agreeableness** helps in team-heavy and service roles (.19 contextualised) and has near-zero validity otherwise.
- Personality tests are **fakeable** in high-stakes use. Contextualised ("at work") items are both more valid and harder to game on face value, but applicants can still inflate scores [P, general literature]. The game gives self-report traits high `fakeability`.

### 1.3 Grit (Credé, Tynan & Harms 2017)

Meta-analysis of 88 samples, N = 66,807, *J. Personality & Social Psychology* 113, doi 10.1037/pspp0000102 [P]:
- Grit and conscientiousness: **ρ = .84** (perseverance .83, consistency .61). Grit and self-control: .72.
- Grit and overall academic performance: ρ = .18. Grit and performance in non-academic domains: **ρ = .21** (k = 7). Grit and retention: .12–.18.
- Perseverance of effort beats consistency of interest (.26 vs .10 with academic performance). The higher-order grit structure was not confirmed.
- Grit and cognitive ability: .05 (independent of GMA).
- **Game:** model `grit` as a perseverance facet strongly correlated with conscientiousness (r ≈ .7 in the candidate generator **[design]**). It matters in high-rejection roles (SDR, AE, founders' first hires) and adds little elsewhere.

### 1.4 Proactive personality / agency

- Fuller & Marler (2009), 107 studies: proactive personality and overall job performance **ρ = .38** (corrected for unreliability and range restriction), task performance .23, contextual performance .41 [P/S, via *J. Work & Org. Psych.* 2013 review].
- Thomas et al. (2010): ρ = .26 overall, **.38 supervisor ratings vs .16 objective measures** [P/S]. Part of the "proactivity" effect is supervisors liking proactive people.
- A 2015 meta-analysis (122 studies) found incremental validity over the Big Five and GMA [S].
- **Game:** `agency` is a strong driver of founder-visible outcomes in startups: self-directed work, fewer founder hours spent managing, initiating fixes. Its effect on hard output is smaller than on ratings. Weight it for startups and generalists **[design]**.

### 1.5 Adaptability, ambiguity tolerance and learning ability

- Adaptive performance is predicted by emotional stability (reactive) and ambition (proactive) [P, Huang 2014]. GMA predicts **learning speed** (training performance), which is why GMA matters more for complex and new jobs. The quantified GMA validity has been revised down (§1.1).
- **Ambiguity tolerance** has no selection meta-analysis I could find. I use it as a **[design]** startup-fit trait, probed with situational questions ("the spec changes on day 3"). It is related to emotional stability and openness.

### 1.6 Emotional intelligence: why it is weak

- Ability EI: ρ = .22 (SD .05). Personality-based (mixed) EI: .30, but mixed EI overlaps heavily with Big Five, self-efficacy and GMA, and it is self-report and fakeable (Sackett 2022 Table 3) [P].
- Joseph & Newman (2010, *JAP* 95(1)): EI facets form a cascade (perception → understanding → regulation). Ability EI predicts performance **positively in high emotional-labour jobs and negatively in low emotional-labour jobs** [P/S]. A later meta-analysis (Joseph, Jin, Newman & O'Boyle 2015) questions mixed EI's construct validity [S].
- **Game:** no "EI" trait. Use `empathy` (perspective-taking, de-escalation), which matters only in high-emotional-labour roles (support, CS, sales discovery).

### 1.7 Interviews, impression management and the charismatic talker

- **Impression management (IM):** Barrick, Shaffer & DeGrassi (2009) found IM correlated **.47 with interview ratings and .15 with job performance** [P, via Peck & Levashina 2017]. Peck & Levashina's own meta-analysis gives smaller corrected values (.17 with both). Self-focused tactics (self-promotion) work better in interviews, and other-focused tactics (ingratiation) work better on the job [P].
- In structured interviews, self-promotion still correlates .26 with ratings (Levashina et al. 2014) [P/S]. Structure reduces IM effects but does not remove them.
- **Faking is common.** In student samples, 85–99% reported slight image creation and 77–99% ingratiation (Levashina & Campion 2007) [P/S].
- **Illusion of validity:** Dana, Dawes & Peterson (2013, *Judgment and Decision Making* 8(5)) gave interviewers random answers. They were just as confident, their predictions got *worse* than using background data alone, and they still preferred a random interview to no interview [P].
- **Game [design]:** each candidate has a hidden `polish` trait (verbal fluency, confidence, IM skill). In unstructured interviews the LLM judge's impression = 0.45·polish + 0.25·true composite + noise. In structured interviews with anchored scoring it is 0.15·polish + 0.55·true composite + noise. These weights are calibrated so that validities land near .19 and .42.

---

## 2. Role-specific success factors

Weights are **[design]**. They sum to 1 per role and are grounded in the evidence cited per role. Trait definitions are in `roles.js` → `TRAITS`. `integrity` works as a gate: low integrity creates incident risk (fraud, data misuse, fake activity logging) in every role, and it is also weighted where access to money or customers is high.

### 2.1 Software engineer (full-stack / founding)
| Trait | Weight | Maps to |
|---|---|---|
| craft (code quality, debugging, system design) | .25 | velocity, bug rate |
| gma (learning, problem solving) | .18 | velocity on novel work, bug rate |
| conscientiousness (tests, review, follow-through) | .15 | bug rate, on-time delivery |
| agency / ownership | .12 | founder hours saved, velocity |
| ai_fluency (agents, review of AI output) | .10 | velocity multiplier, AI-introduced bug risk |
| communication (written specs, PRs) | .08 | estimate accuracy, coordination cost |
| adaptability | .07 | velocity after pivots |
| ambiguity_tolerance | .05 | early-stage fit |

Evidence: job knowledge and work samples are the strongest predictors of technical performance [P]. AI-tool productivity effects are mixed. METR's RCT found experienced open-source developers were **19% slower** with early-2025 tools (CI +2% to +39%), while believing they were 20% faster (2025-07-10). METR's 2026 follow-up estimates an **18% speedup** for returning developers (CI −38% to +9%) and calls this weak evidence because of selection effects (2026-02-24). METR's survey of 349 technical workers found a self-reported median value change of 1.4–2x (2026-05-11) [P/V-research]. **Implication:** ai_fluency raises velocity only when paired with craft and conscientiousness. Unchecked AI output raises the bug rate **[design]**.

### 2.2 AI/ML engineer
craft .25, gma .20, ai_fluency .15, agency .12, conscientiousness .10, adaptability .08, communication .05, domain .05. Outputs: velocity, eval/quality of AI features (hallucination/regression rate), inference cost per user. Rationale: building evaluation sets and cost discipline are what separate AI engineers in 2026 (practitioner consensus [Q]). Salaries are rising fastest for this role (Carta, in `hr-legal-product.md`).

### 2.3 Product designer
craft .28 (interaction/visual design, portfolio depth), empathy .14 (user research), communication .14 (critique, rationale), gma .12, agency .10, conscientiousness .08, ai_fluency .07, adaptability .07. Outputs: design quality → landing and activation conversion multiplier, throughput. Portfolio review plus a work sample (redesign a real flow) is the core method [Q; work-sample validity P].

### 2.4 Account executive
| Trait | Weight | Evidence |
|---|---|---|
| craft (sales skill, prior success / track record) | .18 | Roberge "prior success" [Q]; biodata .38 [P] |
| conscientiousness (achievement, work ethic) | .18 | achievement → objective sales .41 (Vinchur 1998) [P/S] |
| coachability | .14 | Roberge [Q] |
| communication | .14 | discovery, demo, writing |
| grit (perseverance) | .10 | rejection-heavy role; Credé perseverance facet [P] |
| empathy / curiosity (discovery) | .10 | Roberge "curiosity" [Q] |
| gma | .08 | ratings .40 but objective sales .04 (Vinchur) [P/S] |
| polish (potency, presence) | .08 | potency → objective sales .26 [P/S] |

Base rates: 48% of AEs at quota in 2026 (51% in 2024), median quota $960k, OTE $200k, ramp 6.2 months, 3.7 years of experience required at hire (Bridge Group 2026-06-22) [V]. RepVue's Q2 2025 Cloud Sales Index averaged ~43% at quota across ~47k reps [S]. SalesCookie's 2025 commission-plan data shows median attainment 74.3%, p90 139%, 28.7% ≥100% (2026-06-08) [V].

### 2.5 SDR / BDR
conscientiousness .22, grit .18, coachability .16, communication .14, craft (prospecting, research, copy) .10, agency .08, ai_fluency .07 (Clay/AI research workflows), gma .05. Base rates: median quota 10 held meetings/month, ramp 3.0 months, attrition 40%/yr (Bridge Group 2025 via secondary) [S/V].

### 2.6 Customer support
empathy .20, communication .20 (written clarity, tone), conscientiousness .15, craft (troubleshooting, product knowledge) .13, gma .10, adaptability .08 (emotional stability under angry customers), integrity .07, ai_fluency .07 (supervising AI agents, writing help-centre content). Outputs: CSAT, tickets/day, first-response speed, escalation rate. Emotional labour is high, so this is the role where empathy/EI has positive validity (Joseph & Newman 2010) [P/S]. Benchmarks: CSAT "good" 75–85% [V] (see `world-ops-support-life.md`).

### 2.7 Customer success
empathy .17, communication .17, domain .14, conscientiousness .14, agency .12, craft (onboarding, QBRs, account planning) .10, gma .08, integrity .08. Outputs: churn multiplier on assigned accounts, expansion multiplier, health-score accuracy.

### 2.8 Marketer / growth
craft (channel skill: SEO, paid, lifecycle, analytics) .22, gma .15, agency .15, ai_fluency .12, adaptability .10, communication .10, conscientiousness .08, domain .08. Outputs: experiments per month, CAC multiplier, content/creative quality. In 2026 the AI-search shift (see `marketing-and-ads.md`) makes adaptability and ai_fluency more valuable than past channel playbooks [Q].

### 2.9 Content writer
craft (writing) .28, domain .16, conscientiousness .14, gma .12, ai_fluency .12, empathy (reader empathy) .10, coachability .08. Outputs: content quality (0–100) → SEO/GEO traffic multiplier, pieces per week. A writing work sample dominates. In 2026 a writer's value is original insight, interviews and data, not volume, because AI makes volume cheap [Q].

### 2.10 Ops / generalist ("chief of staff", first business hire)
gma .18, agency .17, conscientiousness .17, ambiguity_tolerance .14, adaptability .12, communication .08, integrity .08, ai_fluency .06. Outputs: founder hours saved per week, process error rate. Startups value range and bias to action [Q]. GMA predicts learning speed across many new tasks [P].

### 2.11 Contractor / freelancer (overlay on a base role)
craft .35, conscientiousness .20, communication .15, gma .10, integrity .10, ai_fluency .10. Outputs: on-time delivery rate, quality multiplier, founder coordination hours. Agency and cultural/ambiguity traits matter less because scope is fixed.

### 2.12 Early employee vs big-company fit
Big-company success leans on specialised craft inside a support structure: QA, design systems, sales ops, enablement. A first-10 hire must do without that support. **[design]** Candidates whose experience is mainly big-company get −5 to −10 points on `ambiguity_tolerance` and `agency` expectation in the generator and a stronger `domain`/`craft` mean. The interview has to find out which ones adapt (§3). Pedigree adds polish more than performance (years of experience .07 [P]).

---

## 3. Interviewing

### 3.1 What structure means (operationally)
1. Do a job analysis first. Write a **scorecard**: mission, 3–5 outcomes for the first 6–12 months, and 5–8 competencies (traits) with behavioural anchors (practitioner standard, e.g. Smart & Street, *Who* [Q]; structure components per Campion et al. 1997 [P, classic]).
2. Ask **every candidate the same questions** in the same order, with probes allowed but scripted.
3. Use **behavioural** questions ("Tell me about a time…", answered in STAR: Situation, Task, Action, Result) and **situational** questions ("What would you do if…"). Both are valid, and behavioural questions tend to be better for experienced hires [P, interview literature].
4. **Score each answer immediately on a 1–5 anchored scale** before discussing. Use multiple interviewers, each owning different traits. Make the decision from the scorecard, not from gut feel.
5. Take notes on evidence (what they did, numbers, names). Do not record impressions ("great energy").

### 3.2 Strong vs weak answer signals
| Strong | Weak |
|---|---|
| A specific situation with time, place and stakes | A generic "I usually…" or hypothetical answer to a behavioural question |
| "I" for their own actions, "we" for the team. Can say exactly which part was theirs | Only "we", or claims of solo credit for team outcomes |
| Numbers: before/after, size, time, money, % | No metrics, or round vague numbers ("huge growth") |
| Trade-offs considered and alternatives rejected | One-path story with no decisions |
| Admits mistakes and says what they changed (reflection) | Blames others. "Weakness" is a humble-brag |
| Consistent under follow-up probes (2–3 levels deep) | Details shift or evaporate when probed ("how did you know?", "what did you do next?") |
| Asks clarifying questions in situational items | Answers immediately with a polished framework that does not fit |
| Can show the artifact (PR, deck, ticket, doc) | No artifacts or refuses to share anything |

The LLM candidate should generate these signals as a function of hidden traits. High craft/agency produces specifics and ownership. High polish with low craft produces fluent, generic, metric-light answers that **fall apart under a third-level probe** **[design]**.

### 3.3 Faking and over-rating of talkers
- IM inflates interview ratings much more than it predicts performance (§1.7). Self-promotion survives structure (.26) [P/S].
- 2026: candidates use AI copilots live. Fabric flagged 38.5% of 19,368 AI-run interviews (Jul 2025–Jan 2026), 48% technical vs 12% sales, and says 61% of flagged candidates would still have advanced [V]. In a small interviewing.io survey of 67 FAANG interviewers, 81% suspected AI cheating [S]. Gartner (2025-07): 6% of ~3,000 candidates admitted interview fraud (impersonation or a stand-in), 39% used AI in applications, and Gartner predicts 1 in 4 candidate profiles could be fake by 2028 [S].
- **Countermeasures:** deep probing on the candidate's own past work, live walkthroughs of submitted work, camera-on video with identity checks, and backchannel references. Some companies ask for AI use openly and assess judgment over the output (Canva requires it in some coding interviews; Meta piloted an AI-enabled round from Oct 2025; Amazon and others ban it) [Q, techinterview.org tracker, 2026].

### 3.4 Work samples, paid trials and take-homes
- **Work samples:** ρ = .33 [P]. Most job-relevant, and candidates see them as fair. Keep them short (2–4 h) and close to real work.
- **Paid trial / job tryout:** S&H 1998 gave .44. Sackett 2022 did not re-estimate it. **[design] .35–.45** for a 1–5-day paid project, with high drop-off among employed candidates. Pay market rate. In the US, a paid trial as a contractor needs a contract and IP assignment (see `hr-legal-product.md`).
- **Take-homes:** take-home completion is about **62%** (interviewing.io) [V]. Wellfound advises paying if a take-home exceeds about 4 hours [V]. Unsupervised take-homes now measure AI-assisted output. **[design]** Effective validity is .15–.25 alone and .30–.35 when followed by a 30–45-minute live walkthrough where the candidate extends or defends the work.
- **AI in 2026:** decide whether AI is allowed and say so. If allowed, score judgment (spec, review of AI output, tests, trade-offs), not raw output.

### 3.5 References and backchannel
- Unstructured reference checks: .26 (S&H 1998) [P]. Structured reference reports perform better. One meta-analytic thesis estimates a fully corrected mean validity of .32 and finds structure explains much of the variance [S, Massey University]. Aamodt & Williams (2005) are cited at about .29 [S].
- Candidate-supplied references are pre-selected and lenient. **Backchannel references** (former managers or peers the candidate did not name) are standard VC/startup practice [Q]. No validity study exists. **[design] .25–.35**, and they detect severe red flags (integrity, toxicity) better than mediocre performance. Ask for permission or use discretion: never contact a current employer without consent.
- Good reference questions: "Would you hire them again, enthusiastically?", "On a 1–10 scale vs. others in that role, where were they? What would make them a 10?", "What should I know to manage them well?". Count hesitations and faint praise as signals [Q].

### 3.6 Red flags (cross-role)
Blaming previous teams for every failure. Vague on their own contribution. Numbers that don't reconcile. Badmouthing customers. No questions about the business. Inconsistent dates or titles (verify). Refusing any reference from a manager. Overselling AI skills that collapse when probed. Pushing to skip steps ("I have another offer tomorrow", used as pressure rather than information). Identity inconsistencies on video (2026 fraud). Disrespect toward junior staff, schedulers or support.

### 3.7 Legally prohibited and risky questions (US)
Federal law (Title VII, ADEA, ADA, PDA/PWFA, GINA, IRCA) protects race, colour, religion, sex (including pregnancy, sexual orientation and gender identity), national origin, age 40+, disability and genetic information. The EEOC advises limiting pre-employment inquiries to what is essential to judge qualifications. It says not to ask about memberships that reveal protected traits and not to request photos before an offer. The ADA prohibits **pre-offer disability or medical inquiries** (EEOC, "Prohibited Employment Policies/Practices") [G]. States add more:
- **Salary history bans:** about 20+ states plus DC bar private employers from asking about or relying on pay history (22 including DC per a Nov 2024 count), plus many cities. Virginia's private-employer ban starts 2026-07-01 per a 2026 guide [S, verify on state sites]. The game treats asking about current or past pay as illegal by default. Asking about **expectations** is allowed.
- **Ban-the-box / fair-chance laws** in many states and cities restrict criminal-history questions before a conditional offer [S].
- Credit history (several states and NYC), height/weight (e.g. Michigan, NYC) [S].
- **AI hiring tools:** NYC Local Law 144 requires bias audits and notice for automated employment decision tools. Illinois regulates AI-analysed video interviews [G, verify current rules].
- **Allowed alternatives:** "Are you legally authorised to work in the US? Will you need sponsorship?" (not "where are you from?"). "Can you perform the essential functions of the job, with or without reasonable accommodation?" (not "do you have any health issues?"). "Are you able to work the scheduled hours/travel X%?" (not "do you have kids?"). "Are you over 18?" if needed (not "how old are you?").
- **Game:** each illegal question gives a legal-risk event (probability of a complaint) and a candidate-experience penalty. It also biases the decision, because the founder now "knows" something they must not use **[design]**.

---

## 4. Base rates

### 4.1 Performance distributions
- **Output variability:** SDp is about 19% (low complexity), 32% (medium) and 48% (high complexity) of mean output in non-sales jobs. Sales is larger (life insurance about 110%). The top 10% in high-complexity jobs produce about 80% more than average (Hunter, Schmidt & Judiesch 1990, *JAP* 75(1)), via 80,000 Hours 2012 [P/S]. The distribution is right-skewed: O'Boyle & Aguinis (2012, *Personnel Psychology*) argue performance follows a heavy-tailed ("best and the rest") distribution rather than a normal one [P, title-level confirmation only].
- **Engineering [design]:** relative output p10/p50/p90 ≈ 0.45 / 1.0 / 1.7, bounded by SDp ≈ 48% and a right skew. The "10x engineer" claim is not supported as a typical spread.
- **AE quota attainment [design, anchored]:** p10 0.30, p25 0.60, p50 0.92, p75 1.12, p90 1.40. That puts about 45–50% at or above 100%, consistent with Bridge Group's 48% (2026), RepVue's ~43% (Q2 2025) and SalesCookie's p90 1.39 (2025, which has a lower median of 0.74).
- **SDR [design]:** held meetings/month p10/p50/p90 = 4 / 9 / 15 vs a quota of 10 (Bridge Group 2025 [S]).
- **Support [design]:** per-agent CSAT p10/p50/p90 = 0.72 / 0.85 / 0.94 (good band 75–85% [V]).

### 4.2 Mis-hires
- **How often:** Leadership IQ (2005, 5,247 hiring managers) reported **46% of new hires fail within 18 months**, attributing 89% of failures to "attitude" (coachability, emotional intelligence, motivation, temperament) [V, old, method thin]. No rigorous startup-specific rate exists. **[design]** For a founder hiring with unstructured interviews, the chance that a hire lands in the bottom performance quartile is about 30–35%. With a structured loop plus work sample it is about 15–20% (derived from validity → selection-accuracy logic).
- **Cost:** the "30% of first-year salary (US DoL)" figure cannot be traced to a primary DoL source [S]. SHRM 2025: average cost per hire $5,475 non-exec and $35,879 exec. Only 20% of organisations track quality of hire [S]. Vendor estimates range from 30–150% of salary [V]. **[design]** Startup mis-hire cost = recruiting cost + salary paid until exit (3–6 months) + severance (2–8 weeks) + founder hours (5–10 h/week while managing it) + lost output. At seed this totals roughly **0.5–1.5x annual salary**, more for sales and leadership roles (lost pipeline, customer damage).
- **Time to detect [design]:** obvious failures (no output, integrity) take 2–6 weeks. Mediocrity takes 8–16 weeks for engineers/support/content and 4–7 months for AEs (ramp masks it). Founders typically act 1–3 months after they know [Q].

### 4.3 Value of a great vs median hire [design]
At a 5–15-person startup, one hire is 7–20% of capacity. A p90 engineer (≈1.6–1.7x output, ≈0.5x bug rate, low management load) vs a p50 engineer is worth roughly one extra engineer at the same salary. A p90 AE produces about 1.5x the bookings of a median AE. Great hires also attract other great hires (referrals), which the game can model as a referral-quality bonus.

### 4.4 Ramp times
AE 6.2 months (Bridge 2026) [V]. SDR 3.0 months (Bridge 2025) [S]. Engineers 1.5–6 months depending on docs (see `hr-legal-product.md`) [S]. Support 3–6 weeks, CS 2–3 months, marketer 2–4 months, writer 3–6 weeks, ops 3–8 weeks, contractor 1–3 weeks **[design]**.

---

## 5. Hiring agencies and sourcing channels (2024–2026)

Most pricing data here comes from vendors who sell one of these services. Treat it as a range. Founder hours = founder time per successful hire, including screening and interviews **[design]**.

### 5.1 Recruiters
- **Contingency recruiters.** Fee **15–25% of first-year base** (some sources 15–30%). Specialised technical roles cluster at 18–25%. The fee is paid on acceptance. Guarantee **30–90 days** (replacement search, sometimes a pro-rated refund) (Dover 2026-07-13 [V]; RecruitBPM 2026 [V]; Pin 2026 [V]). Incentives favour speed and higher offers, and recruiters deprioritise hard niche roles [V]. Tiny startups with one role get lower priority than repeat clients **[Q]**. Contracts usually give the agency **6–12 months of candidate ownership**: if you hire someone they submitted within that window, you owe the fee, even if the person later applies directly. Disputes are common when two sources submit the same person (BountyJobs [V]; sample agency T&Cs). **[design]** Time to first candidates 5–14 days, 2–6 submittals/week, typical time-to-hire 30–60 days. Candidates are coached, so polish +8 and quality +2 vs the open market.
- **Retained executive search.** About **25–35% of first-year total compensation, commonly one-third**, billed in thirds (signing, ~30 days, ~60 days or shortlist), and non-refundable. Typical engagement 60–120 days [V/S, sample contracts]. Only for VP/C-level at Series A+. Usually overkill at seed.
- **Embedded / RPO / hourly recruiters.** **$8k–$15k per month per dedicated embedded recruiter** (2026 guides, vendors). RPO makes sense from about 15–25+ hires/year [V]. Fractional/hourly recruiters cost about **$75–$125/h** or about **$2k–$7k per hire** (Dover claims ~$4.8k per hire) [V]. You own the pipeline data.
- **Recruiter marketplaces** (e.g. Paraform). Many independent recruiters compete on your role. Success fee is reportedly about **20–25% of first-year salary**, with a historical listing fee. Paraform describes payment in instalments across a 90-day guarantee [V]. Fast volume, uneven quality.

### 5.2 Staffing, contract-to-hire and offshore
- **Staffing / temp-to-hire.** Bill rate = pay rate plus a **25–60% markup** (up to 75–85% in some specialised or Bay Area cases). Robert Half's public co-op contract shows 65% (admin) and 70% (IT) markups [V/S]. **Conversion fee** is usually 15–20% of salary minus credit for hours billed, sometimes zero after ~640 hours (OfficeTeam) [V].
- **Offshore / nearshore dev agencies and staff augmentation.** Typical 2026 rates: Eastern Europe **$35–$80/h**, Latin America **$25–$65/h** (seniors $55–$95), India **$15–$50/h** (senior $45–$80) [V]. Hidden costs are QA, coordination and time zones. Common pitfall [Q]: the senior engineer on the sales call is not the one doing the work ("bait and switch").

### 5.3 Talent marketplaces and freelance platforms
| Platform | Model (2026, vendor/secondary) | Notes |
|---|---|---|
| Toptal | ~$60–$200+/h. Refundable deposit reported (~$500). Claims "top 3%". Trial period | Margin reportedly high. Fast match [V/S] |
| Arc.dev | Freelance ~$60–$110/h. Claims ~2.3% acceptance. ~72 h freelance match, ~14 days full-time | [V/S] |
| Turing | ~$30–$200/h (sources conflict). Shortlist in 3–5 business days. ~2-week trial | [V/S] |
| Andela | ~$40–$100/h. Reported 12-month non-compete and conversion buy-out | Quality reported as less consistent [V/S] |
| Gun.io | ~$80–$200/h. ~20% fee on full-time placements. Avg ~13 days to match | [V/S] |
| Braintrust | Talent keeps its rate. Client fee ~10–15% (sources conflict) | [V/S] |
| A.Team | Senior product squads. No public pricing found | – |
| Upwork | Client marketplace fee ~5% (3% via US ACH). Business Plus 10%. Contract initiation fee $0.99–$14.99 | Huge variance in quality [S, 2026 guides] |
| Contra | 0% freelancer commission. Client-side fees (~$29/contract or per-contractor monthly; sources conflict) | Designers, marketers, writers [S] |

**[design]** Vetted marketplaces shift the craft mean up (+5 to +8) but not agency or ambiguity tolerance. Open freelance platforms have the market mean with a larger SD (1.3x) and more fraud/AI-polish.

### 5.4 Fractional executives
Fractional CMO **$5k–$15k/month** early stage (growth stage $10k–$25k+), often 1–3 days/week. Fractional CFO **$5k–$15k/month** for 8–30 h/month (range $1.4k–$20k+). Hourly $150–$500 [V, 2026 guides]. No reliable fractional VP Sales benchmark was found. **[design]** $8k–$15k/month at 2 days/week, often with a performance bonus. Pitfall: strategy decks without execution capacity. Insist on deliverables and an owner who does the work.

### 5.5 Job boards and inbound
- **LinkedIn Recruiter Lite** ~$170/month (annual ~$1,680–$2,040), 30 InMails/month [V]. LinkedIn job posts are pay-per-click or free-limited. LinkedIn processed ~11,000 applications/minute in 2025 [S, NYT].
- **Wellfound** (ex-AngelList Talent): free job posts. Paid recruiter seats ~$250–$499/month (sources conflict). "Autopilot" reportedly $500/month/role plus a 10% placement fee [V/S].
- **YC Work at a Startup:** free for YC companies only. **Hacker News "Who is hiring"**: free monthly thread, strong for technical roles at small startups [Q]. **We Work Remotely:** $299 per 30-day post (official support page) [V].
- **AI flood:** Greenhouse data show applications per job rising from 116 to 244 and per recruiter from 146 to 746 (2022→2025) [V]. Ashby: 300+ applications per hire [S]. **[design]** About 60–80% of inbound applications to a startup posting are low-fit or AI-mass-applied, and screening costs 1–3 minutes each.
- **Outbound sourcing / AI tools** (Juicebox/PeopleGPT, Gem, etc.): per-candidate reply rate over a multi-touch sequence is about **16.6%** (Noon, 844k sequences, 2025–26) [V]. Cold InMail ~5.5% measured (vendors claim 10–25%) [V]. 65% of replies come after a follow-up [V]. Software engineers reply less than average [V]. **[design]** Founder-signed, specific messages from a startup with traction: 15–30% reply.

### 5.6 Referrals
Referred applicants convert to hire at ~28–34% vs 2–7% for others (FMC Group 2026 [V]). Jobvite data via ERIN: ~30% vs 7% [V]. One-year retention 46% vs 33% (Talentally [V]). Startups fill 50–70% of roles via referrals [V]. Typical bonus $1k–$5k for professional roles (WorldatWork via Hyring [S]). **[design]** Referral quality +5. Referrals reduce polish bias because they come with a trusted prior. They also reduce diversity if the network is homogeneous.

---

## 6. Obsolete or harmful advice (call it out in UI copy)

| Practice | Why it is obsolete | Evidence |
|---|---|---|
| Brainteasers ("How many golf balls fit in a plane?") | "A complete waste of time... They don't predict anything" (Google's Laszlo Bock, NYT 2013). No validity evidence | [S] The Register 2013-06-20 |
| GPA/transcript filters for experienced hires | Google stopped requiring them except for recent graduates: "they don't predict anything" | [S] same |
| Unstructured "culture fit" chats / "beer test" | Validity .19. Elite firms often used fit, meaning similarity in lifestyle and background, above productivity (Rivera 2012, *ASR* 77(6)) | [P] |
| Years-of-experience requirements as a filter | ρ = .07 | [P] Sackett 2022 |
| "Trust your gut" after 30 minutes | Interviewers make sense of random answers. Confidence is not accuracy (Dana et al. 2013) | [P] |
| Hiring for grit/passion as a separate trait | Grit ≈ conscientiousness (.84). Weak incremental validity | [P] Credé 2017 |
| EI questionnaires as a hiring test | Self-report, fakeable, overlaps with personality | [P] |
| Long unpaid take-homes (8–20 h) | ~38% drop-off, unfair, and in 2026 measures AI output | [V] interviewing.io; [Q] |
| "Leetcode-only" puzzles for startup generalists | Low job relevance. Work samples on real tasks are better | [P] job-relevance principle |
| Asking for current salary | Illegal in many states. Anchors pay unfairly | [S] |
| Treating Schmidt & Hunter's .51 for GMA as settled | Revised to .31 (or .23 in modern data) | [P] Sackett 2022/2023 |

---

## 7. Simulation parameters

| Parameter | Value / range | Source + date |
|---|---|---|
| Trait scale | 0–100, applicant-market mean 50, SD 15 | [design] |
| Structured interview validity | .42 (SD .19). Player execution range .20–.50 | Sackett et al. 2022 [P]; range [design] |
| Unstructured interview validity | .19 (SD .16) | Sackett et al. 2022 [P] |
| Work sample validity | .33 | Sackett et al. 2022 [P] |
| Job knowledge test | .40 | Sackett et al. 2022 [P] |
| GMA test | .31 (modern data .23) | Sackett 2022; Sackett 2023 citing Griebe et al. [P] |
| Integrity test | .31 | Sackett 2022 [P] |
| Conscientiousness test (generic / contextualised) | .19 / .25 | Sackett 2022 [P] |
| SJT | .26 | Sackett 2022 [P] |
| Paid trial (job tryout) | .35–.45 (S&H .44, not re-estimated) | S&H 1998 [P]; [design] |
| Take-home, unsupervised (2026) | .15–.25 alone; .30–.35 with live walkthrough | [design] from work-sample .33 and AI-cheating data |
| Reference check (candidate-supplied) | .20–.26; structured .30 | S&H 1998 .26 [P]; structured .32 [S]; [design] |
| Backchannel reference | .25–.35 (better at red flags) | [design] no study |
| Years of experience | .07 | Sackett 2022 [P] |
| Years of education | .10 | S&H 1998 [P] |
| Brainteaser | 0–.05 | Bock/NYT 2013 [S]; [design] |
| Polish weight in interview impression | unstructured .45; structured .15 | [design] calibrated to IM .47 vs .15 (Barrick 2009) |
| Grit–conscientiousness correlation in generator | ~.7 (true-score .84) | Credé 2017 [P]; [design] |
| Share of "strong talker, weak doer" applicants (polish ≥ +1 SD, composite ≤ −0.5 SD) | 10–20% (AE/marketing ~20%) | [design] |
| Output SD as % of mean (engineer, PM, marketer) | 45–50% | Hunter et al. 1990 [P/S] |
| Output SD (sales) | 60–110% | Hunter et al. 1990 [P/S] |
| AE quota attainment p10/p25/p50/p75/p90 | 0.30/0.60/0.92/1.12/1.40 (≈48% ≥ 100%) | Bridge 2026 48% [V]; SalesCookie 2026 p90 1.39 [V]; [design] |
| AE ramp | 6.2 months (26–28 weeks) | Bridge Group 2026-06-22 [V] |
| SDR ramp / quota / attrition | 3.0 months / 10 held meetings/mo / 40% yr | Bridge Group 2025 via secondary [S] |
| Support CSAT per agent p10/p50/p90 | 0.72 / 0.85 / 0.94 | [design]; band 75–85% [V] |
| Take-home completion rate | ~62% | interviewing.io [V] |
| Paid-trial acceptance (employed candidates) | 50–75% | [design] |
| Candidate fraud (identity/stand-in) | 3–7% of remote technical applicants | Gartner 2025 6% [S]; [design] |
| AI-assisted cheating in unsupervised remote screens | 30–50% technical, 10–15% sales | Fabric 2026 [V] |
| New-hire failure within 18 months | 30–46% | Leadership IQ 2005 [V]; [design] |
| Mis-hire total cost at seed | 0.5–1.5x annual salary (sales/leadership up to 2x) | [design]; SHRM 2025 cost-per-hire [S] |
| Time to detect mis-hire | obvious 2–6 wk; mediocre 8–16 wk; AE 4–7 months | [design] |
| Contingency fee | 15–25% of base (default 20%); guarantee 30–90 d (default 90) | Dover 2026 [V]; RecruitBPM 2026 [V] |
| Retained search fee | 25–35% (default 33%) of first-year cash comp; 60–120 days | Talentfoot / Kitalent / sample contracts [V/S] |
| Embedded recruiter | $8k–$15k/month | 2026 RPO guides [V] |
| Hourly / fractional recruiter | $75–$125/h; $2k–$7k per hire | Pin/RecruitBPM [V]; Dover [V] |
| Staffing markup | 25–60% (specialised to 75–85%) | Upwork, Pin, Robert Half contract [V/S] |
| Conversion fee | 15–20% of salary minus billed-hour credit | Recruiterflow [V] |
| Offshore rates | E. Europe $35–$80/h; LatAm $25–$65/h; India $15–$50/h | 2026 outsourcing guides [V] |
| Upwork client fee | 5% (3% ACH), Business Plus 10% | 2026 guides [S] |
| Fractional CMO / CFO | $5k–$15k/month each (early stage) | 2026 guides [V] |
| Referral hire rate vs board | ~30% vs 2–7% | FMC 2026, Jobvite via ERIN [V] |
| Recruiting outreach reply rate | ~16.6% per candidate over sequence; cold InMail ~5.5% | Noon 2026 [V] |
| Applications per job | ~244 (2025); 300+ per hire | Greenhouse [V]; Ashby [S] |
| Illegal-question penalty | complaint probability 2–5% per incident; candidate withdraws 10–25% | [design] |

---

## 8. Sources

Peer-reviewed / primary
- Sackett, Zhang, Berry & Lievens (2022), Revisiting meta-analytic estimates of validity in personnel selection, *JAP* 107(11) 2040–2068, doi 10.1037/apl0000994. Preprint: https://www.gwern.net/doc/statistics/meta-analysis/2021-sackett.pdf ; repository: https://ink.library.smu.edu.sg/lkcsb_research/6894 (accessed 2026-10-14)
- Sackett, Zhang, Berry & Lievens (2023), Revisiting the design of selection systems…, *IOP* 16(3) 283–300, doi 10.1017/iop.2023.24: https://www.cambridge.org/core/product/A20984B138319E3D432E643978BF026D/core-reader
- Summary tables: Master HR, 2022-03-14: https://master-hr.com/insights/new-study-providing-updated-validity-estimates/ ; SIOP TIP (O'Shea & Luscombe): https://www.siop.org/tip-article/is-cognitive-ability-the-best-predictor-of-job-performance
- Schmidt & Hunter (1998), *Psychological Bulletin* 124(2) 262–274 (values as tabled in Sackett 2022)
- Credé, Tynan & Harms (2017), Much ado about grit, *JPSP* 113, doi 10.1037/pspp0000102: https://www.gwern.net/doc/psychology/personality/conscientiousness/2016-crede.pdf
- Fuller & Marler (2009), *J. Vocational Behavior* 75(3); Thomas et al. (2010), via *J. Work & Org. Psychology* 2013: https://journals.copmadrid.org/jwop/art/tr2013a4
- Huang, Ryan, Zabel & Palmer (2014), Personality and adaptive performance, *JAP*, doi 10.1037/a0034285: https://academicnewsletter.sufe.edu.cn/info/370786
- Dudley, Orvis, Lebiecki & Cortina (2006), *JAP* 91(1) 40–57: https://academicnewsletter.sufe.edu.cn/info/372264
- Joseph & Newman (2010), EI integrative meta-analysis, *JAP* 95(1): https://experts.illinois.edu/en/publications/emotional-intelligence-an-integrative-meta-analysis-and-cascading/
- Vinchur, Schippmann, Switzer & Roth (1998), predictors of salesperson performance, *JAP* (values via abstract/secondary): https://www.savilleassessment.com/wp-content/uploads/2021/02/Chapter-13-Sales.pdf
- Peck & Levashina (2017), Impression management and interview and job performance ratings, *Frontiers in Psychology* (cites Barrick et al. 2009; Levashina & Campion 2007; Levashina et al. 2014): https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.00201/full
- Dana, Dawes & Peterson (2013), Belief in the unstructured interview, *JDM* 8(5): https://dlab.sauder.ubc.ca/sjdm/journal/12/121130a/jdm121130a.html
- Hunter, Schmidt & Judiesch (1990), output variability, *JAP* 75(1), via 80,000 Hours (2012-09): https://80000hours.org/2012/09/how-good-are-the-best/
- Rivera (2012), Hiring as cultural matching, *ASR* 77(6): https://www.kellogg.northwestern.edu/academics-research/research/detail/2012/hiring-as-cultural-matching-the-case-of-elite-professional/
- METR: early-2025 RCT (2025-07-10) https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ ; design change/update (2026-02-24) https://metr.org/blog/2026-02-24-uplift-update/ ; survey (2026-05-11) https://metr.org/blog/2026-05-11-ai-usage-survey/
- Structured reference checks (meta-analytic thesis, Massey University): https://mro.massey.ac.nz/bitstreams/ecb0066b-6c3f-4465-a8fa-c1d71538cc3e/download

Government / legal
- EEOC, Prohibited Employment Policies/Practices: https://www.eeoc.gov/prohibited-employment-policiespractices (accessed 2026-10-14)
- Salary history bans: Paycor (2024-11): https://www.paycor.com/resource-center/articles/states-with-salary-history-bans/ ; Brightmine tracker: https://www.brightmine.com/us/?p=17461 ; Fit Small Business 2026: https://fitsmallbusiness.com/salary-history-ban/

Sales and role benchmarks
- Bridge Group, 2026 AE Models, Motions & Metrics (2026-06-22): https://www.bridgegroupinc.com/research/2026-ae-models-motions-metrics [V]
- SDR 2025 via Cirrus Insight: https://www.cirrusinsight.com/blog/sales-productivity-statistics [S]
- RepVue Q2 2025 via QuotaPath: https://www.quotapath.com/blog/saas-sales-reps-missed-quota/ [S]
- SalesCookie, quota attainment from ~1,000 commission plans (2026-06-08): https://blog.salescookie.com/2026/06/08/quota-attainment-real-data-from-1000-commission-plans/ [V]
- Roberge, *The Sales Acceleration Formula* (2015), traits via summaries: https://www.freshworks.com/crm/sales/resources/sales-acceleration-formula-summary-blog/ [Q]
- Leadership IQ, Why New Hires Fail (2005): https://www.leadershipiq.com/blogs/leadershipiq/35354241-why-new-hires-fail-emotional-intelligence-vs-skills [V]
- Cost of bad hire / SHRM 2025 (secondary): https://www.noon.ai/blog/articles/183-cost-of-a-bad-hire-2026 [V/S]

Interviewing, AI and fraud
- Google/Bock 2013 via The Register (2013-06-20): https://www.theregister.com/2013/06/20/google_hiring_procedures/
- Fabric, State of AI interview cheating 2026: https://fabrichq.ai/blogs/state-of-ai-interview-cheating-in-2026-insights-from-19-368-interviews [V]
- Gartner candidate fraud via HR Dive (2025-07/08): https://www.hrdive.com/news/fake-job-candidates-ai/757126/ [S]
- Pragmatic Engineer on in-person interviews: https://newsletter.pragmaticengineer.com/p/the-pulse-146 [S]
- AI tool policy tracker (2026): https://www.techinterview.org/post/3233474911/ai-tool-policy-tracker-tech-companies-2026/ [Q]
- interviewing.io on take-homes: https://interviewing.io/blog/why-engineers-dont-like-take-homes-and-how-companies-can-fix-them [V]
- Wellfound on take-homes: https://wellfound.com/blog/engineers-hate-your-take-home-project-heres-how-to-fix-it [V]
- Greenhouse recruiting benchmarks: https://greenhouse.com/recruiting-benchmarks [V]; AI-application flood summary: https://blog.theinterviewguys.com/the-quality-paradox/ [S]

Agencies and channels (mostly vendor)
- Dover, contingency incentives (2026-07-13): https://www.dover.com/blog/contingency-recruiting-placement-fee-incentives
- RecruitBPM recruiter cost 2026: https://recruitbpm.com/blog/how-much-does-a-recruiter-cost ; Pin negotiate fees: https://www.pin.com/blog/negotiate-recruiter-fees/
- Retained search: https://talentfoot.com/retained-vs-contingency-vs-engaged-executive-search/ ; https://kitalent.com/executive-search-fees.md ; https://hyring.com/free-hr-toolkit/hr-glossary/retained-search
- RPO/embedded: https://eorhq.com/guides/rpo-cost-guide/ ; https://www.1840andco.com/blog/rpo-pricing-models ; https://www.pin.com/blog/rpo-guide-recruiters/
- Paraform: https://www.herohunt.ai/blog/paraform-pricing-alternatives-2026/ ; https://www.paraform.com/insights/paraform-vs-recruiting-agencies
- Candidate ownership: https://blog.bountyjobs.com/candidate-ownership-terms-a-must-have-in-any-recruitment-agency-contract_ ; https://ere.net/articles/its-been-more-than-a-year-now-my-referral-gets-hired-can-i-collect
- Staffing markups: https://www.upwork.com/resources/how-much-do-staffing-agencies-charge ; https://www.secondtalent.com/resources/staffing-agency-fee-structures/ ; https://recruiterflow.com/blog/contract-staffing/
- Offshore rates: https://qarea.com/blog/worldwide-software-development-outsourcing-rates ; https://www.hireinsouth.com/post/software-developer-rates-by-country ; https://stealthagents.com/research/software-development-outsourcing-statistics-2026
- Talent marketplaces: https://codersera.com/blog/toptal-alternatives-2026/amp/ ; https://www.raftlabs.com/blog/toptal-alternatives ; https://acquaintsoft.com/hire-developers/alternatives/arcdev ; https://www.fast.io/resources/turing-ai-review-2026.md
- Upwork fees 2026: https://golance.com/blogs/upwork-fees-explained-2026 ; Contra/Braintrust: https://www.jobbers.io/which-freelance-platform-has-no-commission-in-2026-the-complete-guide-to-zero-fee-marketplaces/
- Fractional execs: https://marketful.com/fractional-cmo ; https://gofractional.com/blog/fractional-cmo-salary ; https://eightx.co/blog/average-fractional-cfo-engagement-size-by-stage ; https://fractionus.com/blog/fractional-executive-cost-us-2026
- LinkedIn Recruiter pricing 2026: https://www.pin.com/blog/linkedin-recruiter-pricing-2026/ ; Wellfound pricing: https://www.hireinsouth.com/post/wellfound-pricing ; WWR: https://support.weworkremotely.com/how-much-does-it-cost-to-post-at-we-work-remotely
- Outreach reply rates: https://www.noon.ai/blog/articles/188-recruiting-outreach-benchmarks-2026 ; https://www.novatalent.com/blog/why-passive-candidates-dont-reply-to-linkedin-inmails
- Referrals: https://fmcgroup.com/applicants-referred-to-hiring-manager/ ; https://erinapp.com/blog/employee-referral-statistics-you-need-to-know-for-2024-infographic ; https://talentally.com/resources/the-power-of-employee-referrals-in-todays-job-market ; https://hyring.com/free-hr-toolkit/hr-glossary/employee-referral-program
