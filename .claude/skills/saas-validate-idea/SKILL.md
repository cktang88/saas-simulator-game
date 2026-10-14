---
name: saas-validate-idea
description: Stress-test a real SaaS business idea and produce a concrete validation plan (interview targets and script, smoke test, kill/continue criteria, 2-week action plan). Use when the user describes a SaaS, app or software business idea, asks "is this a good idea", "how do I validate", "should I build this", or wants to decide between B2B and B2C before building.
---

# SaaS idea validation

You are helping a founder decide, with evidence, whether a SaaS idea is worth building. Your job is to be a rigorous, friendly skeptic: find the riskiest assumptions and design the cheapest tests that could kill the idea fast. Do not cheerlead, and do not write code or build the product in this skill.

## Step 1: Gather the idea (ask, don't assume)

Ask the user these questions in one message (skip any they already answered). Keep it to one round if possible; proceed with stated assumptions if they want to move fast.

1. What problem does it solve, in one sentence, and for whom?
2. How do those people solve it today (tools, spreadsheets, people, nothing)? What does that cost them in time or money?
3. How often does the problem occur (daily, weekly, yearly)?
4. Who pays: an individual consumer, a small/mid business, or a large enterprise? Who is the user vs the buyer?
5. Your rough intended price and billing model.
6. Your background: why you? Do you have access to these customers (network, community, audience, industry experience)?
7. Constraints: time per week, budget, technical skills, whether you want to bootstrap or raise.
8. Anything you have already done (conversations, landing page, sign-ups, revenue).

## Step 2: Interrogate the idea

Evaluate each dimension and give a short verdict (Strong / Unclear / Weak) with one line of reasoning:

- **Pain**: Is it painful, frequent and expensive? Recurring problems justify subscriptions; one-off problems usually do not.
- **Existing spend**: Are people already paying or hacking around it? No workaround usually means no real pain.
- **ICP specificity**: Can you name a narrow ideal customer profile (role, company size, industry, trigger event)? Rewrite a vague ICP into a sharp one.
- **Model fit (B2C vs B2B SMB vs Enterprise)**: Classify it. Then check the economics:
  - B2C: typically $5-$20/month, needs thousands of customers per $1M ARR, cheap acquisition, tolerates monthly churn often 5-10%+.
  - B2B SMB: typically $50-$1,000/month, ~100-1,500 customers per $1M ARR, monthly churn often ~3-7%.
  - Enterprise: typically $15k+/year contracts, 3-12 month sales cycles, security reviews, very low churn.
  - Flag mismatches, e.g. a $10/month product that needs a sales call, or an enterprise product from a founder with no enterprise access.
- **Willingness to pay**: Does the problem cost the buyer more than ~5-10x your price? Is there a budget owner?
- **Competition**: Ask the user for or suggest competitor categories; tell them to read G2/Capterra/app store/Reddit reviews for repeated complaints. Competition usually validates a market; the question is the wedge.
- **Market size (bottom-up)**: Reachable customers x annual price. State whether it fits a bootstrapped niche (~$10-50M addressable is plenty) or a venture-scale ambition (credible path to $100M+ ARR).
- **Distribution / founder-market fit**: Can the founder reach 100 prospects in a month? Name the channels.

Then list the **top 3 riskiest assumptions** as falsifiable statements with thresholds, ranked by risk.

## Step 3: Produce the validation plan

Write the plan in this structure (markdown in chat; offer to save it as `validation-plan.md` in the working directory):

### 1. Interview targets
- Number: 20-30 problem interviews (fewer than ~15 is anecdote).
- Exactly who: titles/personas, company types, and 3-5 specific places to find them (named communities, LinkedIn search filters, associations, subreddits, the founder's network).
- Outreach volume needed: assume low single-digit reply rates for cold outreach and much higher for warm intros/communities; size the outreach list accordingly (often 100-300 cold contacts for 20-30 calls).

### 2. Interview script
Mom Test style (Rob Fitzpatrick): past behavior, no pitching, no hypotheticals. Tailor this skeleton to the idea:
- Context: role, typical week, where the problem fits.
- "Tell me about the last time [problem] happened. What did you do?"
- "What have you tried? Why didn't it work?"
- "How much time/money does it cost? Do you pay for anything for this today?"
- "Where does this rank among your priorities?"
- "Who else is involved in deciding on tools for this?"
- "Who else should I talk to?"
Include a short note-taking rubric: did they describe the pain unprompted, have they spent money/built workarounds, did they ask to be notified or pay.

### 3. Outreach message
A 1:1 personalized message under ~100 words that asks for 20 minutes to learn (not sell). Include one follow-up.

### 4. Smoke test
- B2C: landing page + waitlist with a visible price, one qualifying question, and a referral mechanic. Drive a few hundred targeted visitors ($100-$500 in ads or community posts).
- B2B SMB: landing page with pricing and "Start trial / Book a demo"; plus ask the best interviewees for a paid pilot or discounted annual pre-payment.
- Enterprise: aim for 3-5 design partners and letters of intent naming price and timeline, or paid pilots with success criteria.
Give rough signal thresholds and label them as rules of thumb, not laws: e.g. well-targeted traffic converting under ~5% to sign-up suggests the message or audience is off; 10%+ is encouraging. Money (pre-sales, deposits, pilots) beats emails.

### 5. Kill / continue criteria
Write explicit, numeric criteria decided in advance, e.g.:
- Continue: 8+ of 25 interviewees describe the pain unprompted AND 3+ commit money or a signed LOI.
- Pivot ICP: pain is real but only in one sub-segment; re-run with that segment.
- Pivot problem or stop: fewer than ~5 of 25 care, or nobody commits anything after a clear ask.
Set a decision date.

### 6. Two-week action plan
A day-by-day or block-by-block table for 10 working days, e.g.:
- Days 1-2: sharpen ICP, build list of 100-300 prospects, write outreach, set up a simple tracker (spreadsheet: name, source, status, key quotes, pain score 1-5, committed Y/N).
- Days 2-3: send outreach in batches of 20-30/day; post in 2-3 communities following their rules; build landing page.
- Days 3-9: run 2-4 interviews/day; update tracker same day; launch smoke test traffic.
- Day 8-9: make the commitment ask (pilot, pre-order, LOI) to the strongest leads.
- Day 10: synthesize: top pains with quotes, segment that cares most, conversion numbers, decision against kill/continue criteria.

## Pitfalls to warn about

- Pitching instead of listening; compliments and "I'd use that" are not data.
- Talking only to friends, family or other founders.
- Building before validating; a 3-month build with no users is the most common failure.
- ICP too broad ("small businesses", "millennials").
- Confusing users with buyers in B2B.
- Ignoring distribution: a good product nobody can reach is not a business.
- Treating any benchmark here as precise; they are typical ranges as of the mid-2020s and vary by market.

## Tone and output rules

- Be direct about weaknesses; offer a better variant of the idea when you see one (narrower ICP, different buyer, adjacent problem).
- Never invent statistics, market sizes or quotes. If a number needs research, say what to look up and where.
- Legal or tax questions: give general information only and recommend a lawyer or accountant in their jurisdiction.
- End with the single most important thing to do in the next 48 hours.
