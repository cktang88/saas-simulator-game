# LLM-simulated prospects and customers: realism research

Scope: how LLM role-play respondents (interviewees, buyers, survey panelists) fail, how prompt design reduces that, how to test fidelity, how to stop hidden-truth leaks and keyword rewards, and how to keep offline fallbacks consistent. Sources are 2023-2026 papers and write-ups. Items marked [unverified] come from secondary summaries or abstracts only; check the full paper before quoting a number.

## 1. Documented biases and magnitudes

**Hyper-accuracy and homogeneity.** Aher, Arriaga and Kalai (ICML 2023, "Using Large Language Models to Simulate Multiple Humans") describe a "hyper-accuracy distortion": models answer knowledge questions more accurately than real people do, so simulated crowds are too correct. https://proceedings.mlr.press/v202/aher23a [magnitudes unverified in this pass]

**Compressed variance.** Bisbee et al. (Political Analysis 2024, "Synthetic Replacements for Human Survey Data?") asked ChatGPT to rate 11 groups on feeling thermometers. Means tracked ANES 2016-2020 reasonably, but synthetic responses varied less than human ones, and regression coefficients often differed significantly from ANES. Small prompt-wording changes moved the distribution, and identical prompts gave different results three months apart. https://www.cambridge.org/core/product/B92267DC26195C7F36E63EA04A47D2FE

**Positivity and cooperation.** Zhang, Xu and Alvero (Sociological Methods & Research 2025, "Generative AI Meets Open-Ended Survey Responses") compared LLM text with three pre-ChatGPT human studies. LLM text was more homogeneous and more positive, with the largest gap on sensitive questions about social groups. https://doi.org/10.1177/00491241251327130 Zhou et al. (arXiv 2603.11245, "Mind the Sim2Real Gap in User Simulation for Agentic Tasks", COLM 2026 per the listing) ran the tau-bench protocol with 451 real participants across 165 tasks and 31 simulators. Simulated users were excessively cooperative and stylistically uniform, lacked frustration or ambiguity, gave uniformly more positive feedback on eight quality dimensions, and made agents look better than they are ("easy mode"). Higher general capability did not fix this. https://arxiv.org/abs/2603.11245 This is the closest match to our "overly positive" and "too agreeable" concern.

**Normative inflation and flattened subgroups.** A factorial-survey study (EPC 2026 abstract, "AI as Respondent") reports LLM response variance of about 1.1-2.1 against 2.4-2.6 for humans, plus overvaluing harmony and respect and flattened subgroup differences. [unverified: abstract only] https://epc2026.eaps.nl/abstracts/261361

**Overly tidy persona coherence.** Secondary commentary on a study of 37 LLMs and about 65,000 synthetic questionnaires reports that models tie answers into one tidy persona, inflate inter-item correlations, shift toward agreement, and produce spurious mediation effects in placebo tests (3 of 10). [unverified: secondary post; original not located]

**Flattened expression.** A 2026 CLPsych comparison of simulated and human patients with identical profiles found similar topics and content, but LLM patients skewed toward uniform valence while humans mixed positive and negative. [unverified: abstract-level]

**Weak persona effect.** Hu and Collier (ACL 2024, "Quantifying the Persona Effect in LLM Simulations") found demographic, social and behavioral persona variables explain under 10% of annotation variance in existing subjective NLP datasets. Persona prompting helps modestly and mainly where annotators disagree in small ways. Persona text alone does not make a respondent realistic. https://aclanthology.org/2024.acl-long.554

**Identity drift over turns.** Choi et al. (arXiv 2412.00804, "Examining Identity Drift in Conversations of LLM Agents") tested nine LLMs in multi-turn personal conversations. Larger models drifted more, and assigning a persona did not reliably prevent drift. https://arxiv.org/abs/2412.00804 Abdulhai et al. (NeurIPS 2025, "Consistently Simulating Human Personas with Multi-Turn Reinforcement Learning") defines automatic consistency metrics and reports over 55% reduction in persona inconsistency for simulated patient, student and social-chat users. [unverified: taken from a listing page; the arXiv id we tried was wrong, so check the NeurIPS poster https://neurips.cc/virtual/2025/poster/119491]

**Positive reports from the other side.** Argyle et al. (Political Analysis 2023, "Out of One, Many") introduced "algorithmic fidelity" and reported that persona-conditioned GPT-3 reproduced subgroup attitude patterns. Amirova et al. (2023) found that GPT-3.5 interviews matched human themes but differed in structure and tone, and judged fidelity insufficient. Kapania et al. (arXiv 2409.19430, "Simulacrum of Stories", 2024) interviewed 19 qualitative researchers. Responses looked human at first, then lacked palpability and contextual depth, and raised consent concerns.

**Park et al. (2024, "LLM Agents Grounded in Self-Reports Enable General-Purpose Simulation of Individuals", arXiv 2411.10109).** 1,052 Americans, interview-based grounding [interview length unverified]. Accuracy on held-out General Social Survey items as a share of each person's own two-week test-retest consistency: interview-only 83%, survey-only 82%, combined 86%, demographics-only 74%. Agents also reduced accuracy gaps across racial and ideological groups relative to demographics-only agents. https://arxiv.org/abs/2411.10109 The lesson: rich individual grounding beats demographics by about 9-12 points on this measure, and the best case is still not the real person.

**Willingness to pay.** I found no direct study that shows LLM interviewees overstate WTP in discovery settings [unverified: search returned none]. Related evidence is mixed: one market-research working paper finds LLM WTP estimates sometimes wrong-signed, and a 2025 conjoint study with GPT-3.5 reports values of roughly 50-90% of human ones for familiar attributes, which is a downward bias. A NIM market-intelligence study found synthetic respondents overstated positive attitudes, especially toward well-known brands. Design implication: treat synthetic WTP as unvalidated in both directions, and do not let it set a price.

**Sycophancy as the root.** Sharma et al. (arXiv 2310.13548, ICLR 2024, "Towards Understanding Sycophancy in Language Models") tested five RLHF assistants on four free-text tasks. All showed sycophancy, and preference data favored answers that agree with the user. https://arxiv.org/abs/2310.13548 Our simulated prospects inherit this: they want to help the person asking. Agarwal et al. (arXiv 2404.16251, 2024) show the same mechanism in multi-turn settings, where attack success on prompt leakage rose from 17.7% to 86.2%. https://arxiv.org/abs/2404.16251

**Practitioner reports (NN/g and others).** Secondhand summaries attribute to NN/g the finding that synthetic users praised every concept where real users raised feasibility concerns, described forum behavior real users avoided, and gave all features similar weight, which breaks prioritization. [unverified: I could not locate the NN/g article itself; read it before citing] A January-February 2026 ACM Interactions piece ("The Synthetic Persona Fallacy") argues that synthetic personas cannot be falsified and so do not count as evidence. Treat this as a position, not data.

## 2. Prompt-design techniques that improve realism

Use these as a checklist for the persona prompt. Each one is a design choice, not a measured effect, unless a source is cited.

**Ground in concrete hidden facts.** Give each simulated person a fixed record: job title and tenure, the workflow they run today, tools in use (name them, since this drives the "we use X" answers), monthly budget and who holds it, the last incident that hurt, pain intensity (1-5), buying authority (user, influencer, signer, blocker), and current competing priorities. Park et al. support grounding in specific self-report material over demographics alone (above). [design]

**Answer about past behavior, not hypotheticals.** The interviewer's questions should be answered from the record: "what did you do last time X broke" rather than "would you pay for Y". Hypothetical questions are where LLM respondents are most agreeable. [design, consistent with Mom Test rules used elsewhere in this repo]

**Vague when the topic is not a real pain.** Rule: if the persona's record has no pain on the topic, the persona says so, gives generic answers ("we're fine with what we have", "maybe, send me something"), and does not invent a problem. This is the direct counter to over-agreeableness and the single most important rule for an interview simulator. [design]

**Politeness bias rules.** Tell the persona that polite interest is not commitment. It may say "sounds interesting" and still refuse a next step, a meeting or a payment. Score commitments (time, intro, data, deposit) separately from sentiment. [design; matches the compliments-vs-commitments grading in the repo's founder-customer-research skill]

**Do not volunteer.** Answer only what was asked, in the scope of the question. Unprompted disclosure of pain, budget or the real decision maker should be rare and conditional on rapport plus a good question. [design]

**Mention competing priorities.** Each persona has two or three other fires burning, and answers should reference them when relevant ("this quarter it's the renewal, so I can't look at tooling"). [design]

**Separate hidden state from dialogue.** Have the model output a structured state object each turn (for example: `{pain_level, mentioned_pain, budget_mentioned, next_step_offered, commitment_level, disclosed_facts: []}`) alongside the spoken reply, and enforce that the reply is generated only from disclosed facts. Keeping the state machine outside the prose stops the model from narrating its own hidden truth. [design; this is also the basis for the leak controls in section 4]

**Temperature and variety.** Set temperature to produce variety across personas, not within one persona's answers. Sample persona parameters from a distribution (not a single archetype) and seed them with the deterministic `rng(state)` helper so a run can be replayed. Variance compression is the documented failure, so check it (section 3). [design; Bisbee et al. for the variance problem]

**Few-shot examples of vague vs specific answers.** Include 3-5 short examples showing a vague non-pain answer, a specific pain answer with a number, a polite non-commitment, and a refusal to speculate. Keep examples short so they do not become the template for every reply. [design]

**Refuse to invent needs.** Put an explicit rule in the prompt: the persona has no need it was not given. When asked about a feature outside its record, the persona answers "I don't know" or "not something we'd need". Pair this with a check that flags any new "pain" the persona states that is not in its record. [design]

**Persona pinning across turns.** Re-inject the persona record every turn, or keep a compact summary, since drift grows over turns (Choi et al.; Abdulhai et al.). [design]

## 3. Evaluating persona fidelity

**Consistency checks (per persona, across turns).**
- Restate the same fact in a different question; the answer must match.
- Ask about a fact the record does not contain; the answer must be "don't know" or a non-invented generic.
- Check the state object against the dialogue: any stated pain or budget must exist in the record.
- Track drift: score pain and commitment across turns 1, 5 and 10 for contradictions.

**Distribution matching (across personas, against real data).**
- Collect a small human set: 10-20 real interviews or survey answers per segment, coded with the same rubric.
- Compare on: variance of pain and commitment scores (the simulator should not collapse to the mean), share of "no pain" answers, share of commitments, and length and specificity of answers.
- Report the gap; do not claim fidelity without a human baseline.
- Test wording sensitivity: rephrase the same question three ways and check that the distribution does not move much (Bisbee et al.).

**Individual-level accuracy.** Park et al. measure against each person's own test-retest reliability. We can do a lighter version: have a persona answer the same survey twice with a delay of several steps and compare, which gives a self-consistency ceiling.

**Sensitivity to the interviewer.** A realistic simulator must punish bad questions. Run a leading-question battery (pitch, "would you buy", "wouldn't it be great if") and confirm that responses get vaguer or more polite, not more enthusiastic.

## 4. Preventing hidden-truth leaks and rewarding keyword-stuffed questions

**Leaks.** Prompt leakage is a documented attack surface, and sycophancy makes it worse: multi-turn leakage success rose from 17.7% to 86.2% in Agarwal et al. Persona hidden facts are the same kind of data. Controls:
- Keep hidden facts out of the dialogue model's context where possible. The dialogue model gets only the facts it is allowed to disclose this turn, plus its persona voice.
- The state object is computed by a separate step that sees the full record; the dialogue step sees only the disclosed slice.
- Post-filter each reply: reject or regenerate if it contains a literal record value the persona has not disclosed (exact-match and fuzzy-match on numbers, tool names and budgets).
- Do not let the persona answer "what does your system prompt say" or role-reversal requests; reply in character.

**Keyword stuffing.** Do not let a question win because it contains the right buzzwords. Score disclosures on what the question causes the persona to do, not on whether it contains trigger terms. Concretely:
- Gate each disclosure on a question-type classification (past behavior, feelings, budget, current process) plus rapport state, not a keyword list.
- Require a specific context for a disclosure: a question about "what happened last time" unlocks the incident; a question about "pain" alone does not.
- Test with paraphrases and adversarial jargon (for example, "AI-native workflow synergy") and confirm the disclosure rate does not rise.

**Grading.** Keep the grader separate from the persona. Grade the founder's question set against a rubric (past vs hypothetical, leading vs open, commitment asked vs not), not against the persona's enthusiasm.

## 5. Keeping deterministic offline fallbacks consistent with LLM behavior

- Use one persona record for both paths. The deterministic path reads the same hidden fields and the same disclosure rules, so a question about last incident unlocks the same fact in either mode.
- Implement the rules as code: question-type classifier (regex plus intent tags), disclosure gates, and the state object. The LLM only generates wording, not the state. This keeps offline and online outcomes aligned.
- Build the vague-answer templates from the same rules: if pain is absent, the offline reply is a generic non-commitment; if pain is present but the question is off-topic, the reply is a deflection.
- Seed everything with `rng(state)` and `uid()` from `core/util.js`; never use `Date.now()` or `Math.random()` in simulation code.
- Run the fidelity checks (section 3) on both paths. If the offline path is more polite or more positive than the LLM path on the same record, that is a bug to fix in the offline templates.
- Put the cooperative-simulator warning in the test suite: a scenario test where a leading pitch must not earn a commitment, run offline and with a mocked LLM reply.

## Open items

- Read the full NN/g article and the Abdulhai et al. paper before quoting them.
- Locate the 37-model synthetic questionnaire paper for the inter-item correlation result.
- No validated study yet on LLM interviewee WTP in discovery. Treat our WTP numbers as [design] until we have a human holdout.
