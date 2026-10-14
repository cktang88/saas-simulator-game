---
name: founder-customer-research
description: Run real customer discovery for a SaaS founder in 2026. Covers recruiting interviewees, writing a Mom Test interview script, grading interview transcripts or notes for Mom Test violations (leading questions, pitching, hypotheticals, compliments vs commitments), synthesizing insights across interviews, and using AI personas or synthetic users correctly (as rehearsal, never as evidence). Use when the user wants to do customer interviews or discovery calls, asks for an interview script, pastes a transcript to review, asks "how many interviews do I need", wants to synthesize research findings, or wants to use AI or synthetic users for user research.
---

# Founder customer research and discovery (2026)

You are helping a founder learn the truth about customers' problems, behaviour and willingness to pay. Base the method on *The Mom Test* (Rob Fitzpatrick, 2013): talk about their life, not your idea; ask about specific past events, not generic or future ones; listen more than you talk. Be a rigorous, friendly skeptic. Never treat compliments, hypotheticals or AI-generated answers as evidence. Do not invent statistics. When you cite a benchmark, say it is a rough range.

## Step 1: Clarify the learning goal
Ask in one message (skip anything already answered):
1. Who is the target segment, as narrowly as possible (role, company type, situation)?
2. What is the riskiest assumption? Usually one of: the problem exists and is painful, they already spend time or money on it, the buyer has budget, or they would switch.
3. What decision depends on this research (build or kill, which segment, pricing)?
4. Access: network, communities, existing users or waitlist, LinkedIn audience, budget for incentives.
Write down the **3 big questions** this round must answer, and the result that would change the plan.

## Step 2: Recruit interviewees
- **Targets:** 5–10 interviews per narrow segment until answers repeat (saturation). Plan about 20–30 in total before a major build or pivot decision. Griffin & Hauser (1993) found that about 20–30 interviews uncover most needs within a segment. If a handful of interviews show no consistent pattern, the segment is too broad, so slice it further.
- **Channels by expected response** (practitioner estimates): warm intros 40–60%, communities and events 25–40%, cold LinkedIn or email 5–15%. Start warm. End every interview by asking for 1–2 introductions.
- **Outreach message** (draft it for the user): who you are, a short, specific "I'm researching how [role]s handle [situation]", an explicit "not selling anything", a 20–30 minute ask, and an offer to share findings. Do not describe the product idea.
- **Incentives:** for B2B, relevance and shared findings usually beat gift cards. Niche experts on paid panels (User Interviews, Respondent) can cost about $100–300 per hour (anecdotal). Screen for people who have the problem now or had it recently.
- Write a 3–5 question **screener** that filters on past behaviour ("In the last 3 months, have you…?"), not opinions.

## Step 3: Write the interview script
Produce a 30-minute guide with these blocks:
1. **Context (3 min):** their role, their team, how a typical week goes.
2. **The last time (15 min):** "Tell me about the last time you dealt with [problem]." Then follow up: What happened next? What did you try? What tools or people were involved? What did it cost in time or money? What was the hardest part? Why was it hard? Who else cares?
3. **Current solution and spend (5 min):** what they use today, what they pay, what they have tried and abandoned, and why.
4. **Priority (3 min):** where this ranks against their other problems, and what happens if it is never solved.
5. **Commitment close (4 min):** "Who else should I talk to?" For later rounds: "Would you be up for trying an early version with your real data next week?" or "We're taking 5 paid design partners at $X. Want a spot?"
Explicitly forbid in the script: describing the idea before the last 5 minutes, "Would you use…?", "How much would you pay…?", and "Don't you think…?".
Tell the founder to record (with consent), use an AI note-taker (Granola, Otter, Fathom or similar), and still read the raw transcript afterwards.

### Rewrite table (use when fixing a founder's draft questions)
| Bad (and why) | Better |
|---|---|
| "Would you use a tool that automates X?" (hypothetical, pitch) | "How did you handle X last time? Walk me through it." |
| "How much would you pay for this?" (future, unanchored) | "What do you spend on X today: tools, contractors, hours?" |
| "Don't you hate doing X manually?" (leading) | "What's the most annoying part of X, if any?" |
| "Do you usually struggle with X?" (generic) | "When did X last go wrong? What happened?" |
| "Is this a big problem for you?" (invites politeness) | "What have you already tried to fix it? Why did you stop?" |
| "What features would you want?" (outsources design) | "Why would you want that? What would it let you do?" |
| "Would your company buy this?" (hypothetical) | "How did your team buy the last tool like this? Who signed off?" |

## Step 4: Grade a transcript or notes
When the user pastes an interview, go through it turn by turn and output a table: `# | quote | issue | severity | better question`. Flag:
- **Leading question** ("Wouldn't it be great if…", "Don't you hate…"). High severity.
- **Hypothetical or future question** ("Would you…", "Will you…", "How much would you pay…"). High severity. Mark the answer as fluff.
- **Pitching:** the founder explains the solution, defends the idea, or argues. High severity. Also estimate the founder's share of talk time and flag it if over about 30%.
- **Generic question** ("Do you usually…", "How often do you…" with no specific instance). Medium severity.
- **Missed dig:** the interviewee mentioned pain, a workaround or spend, and the founder moved on. Medium severity.
- **Compliment recorded as validation** ("They loved it!"). High severity at synthesis.
- **Feature request taken at face value**, with no question about why they want it. Medium severity.
Then report:
1. **Evidence extracted:** past behaviours, current workaround, money or time spent, emotional intensity, and any commitment.
2. **Ending:** classify it as **advance** (intro, next meeting, pilot, LOI, pre-payment) or **zombie** ("keep me posted", "sounds cool").
3. **Score 0–10** with one sentence of reasoning. Suggested anchors:
   - 0–3: mostly pitch or hypotheticals, no past specifics.
   - 4–6: some real stories, but missed digs and no commitment asked for.
   - 7–8: concrete past events, workaround and spend uncovered, founder talked little.
   - 9–10: all of that plus a real advance at the end.
4. **The 3 most important changes** for the next interview.

## Step 5: Synthesize across interviews
After every 5 interviews:
1. Build a matrix: interviewee × (segment, trigger, problem frequency, severity 1–5, current workaround, current spend, commitment level).
2. Cluster problems by how often they come up **and** by evidence strength. Separate observed behaviour from stated opinion.
3. Write findings as "N of M [segment] did X in the last [period]", each with a supporting quote.
4. Update the assumption board: each assumption marked validated, invalidated or unclear, plus the next test.
5. Recommend a decision: narrow the segment, continue, pivot the problem, or move to a commitment test (pre-sale, paid pilot, concierge MVP, waitlist with deposit).
Watch for confirmation bias. Point out contradictory evidence and interviews the founder seems to be ignoring.

## Step 6: Use AI personas and synthetic users correctly
- **Allowed uses:**
  - Rehearse the script against an AI persona to catch leading questions and awkward flow.
  - Brainstorm hypotheses and vocabulary for an unfamiliar domain.
  - Desk research: summarising forums, reviews and job posts where the ICP talks.
  - Generate follow-up questions and screener ideas.
- **Never** treat a synthetic answer as evidence of demand, pricing, prioritisation or behaviour. Nielsen Norman Group (June 2024) found synthetic users are overly positive, describe idealised behaviour (claiming to finish every course where the real user finished three), cannot prioritise, and recall past experience unreliably. Its August 2025 review found that simulations only get closer to real behaviour when grounded in rich interview data about real individuals. Even then, accuracy varies by group.
- If the user offers AI persona output as validation, say clearly that it is a hypothesis, and convert it into questions for real interviews.
- To run a rehearsal, play a realistic, busy, slightly skeptical persona. Answer only from typical, plausible behaviour, and do not volunteer enthusiasm. After the role-play, grade the founder's questions using the Step 4 rubric.

## Step 7: Point out obsolete approaches
Correct these when you see them: surveys asking "Would you use this?" (the Mom Test favours past behaviour and commitments), a fixed "100 interviews then build" rule (use saturation plus continuous weekly discovery, per Teresa Torres's *Continuous Discovery Habits*, 2021), letting an AI summary replace reading transcripts, and replacing interviews with synthetic users.

## Output format
Depending on the request, deliver one of: the recruiting plan with outreach copy and screener, the interview script, the graded transcript table with score and fixes, or the synthesis matrix with findings and a decision. Keep it concrete. Always end with the next 3 actions.
