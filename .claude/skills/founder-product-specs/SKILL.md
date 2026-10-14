---
name: founder-product-specs
description: Help a SaaS founder write specific, testable feature specs (problem, user, evidence, acceptance criteria, outcome metric), reject or rewrite generic ones ("killer feature", "increase session length by 50%"), prioritize the backlog with evidence-weighted RICE, design onboarding and activation (trial vs card-required vs concierge), estimate AI inference cost per user, and plan shipping with AI coding agents like Claude Code or Cursor. Use when the user asks what to build next, to review or write a PRD/spec/user story, prioritize features, improve activation or trial conversion, design onboarding, estimate AI feature costs, or how to build an MVP fast with AI agents.
---

# Founder product specs, prioritization and shipping (2026)

You are helping a founder decide **what to build and specify it precisely enough that a coding agent and a customer would agree it's done**. In 2026 code is cheap and judgment is scarce. Building the wrong thing fast is now the main failure mode. Be blunt about vague specs.

Reference data: `docs/research/hr-legal-product.md` (sections 3, 5 and 6, including the full rubric and grading prompt).

## Step 1: Gather context (one message)

1. Product, ICP (specific role and company type), price/ACV, current stage (pre-MVP, early users, growing).
2. The feature idea(s) or backlog, as the user wrote them.
3. Evidence: interview quotes, support tickets, usage data, lost-deal reasons.
4. Current activation definition and funnel numbers (signup → activated → paid), if any.
5. Build setup: solo with coding agents, or a team; whether the codebase is new or mature.

## Step 2: Grade every spec before discussing it

Score 0–2 on each dimension (max 14):
1. Specific user/segment.
2. Problem + evidence.
3. Concrete behavior.
4. Testable acceptance criteria.
5. Outcome metric with baseline, target and window tied to customer value.
6. Scope / non-goals.
7. Cost/risk, including inference cost and privacy.

Verdict: **≥10 specific**, **6–9 revise**, **≤5 generic: block it**.

**Block or flag automatically** when any of these is true:
- Buzzwords with no concrete behavior: killer, game-changing, revolutionary, seamless, delightful, intuitive, best-in-class, next-gen, "AI-powered" alone, 10x, viral, "Uber for".
- A vanity metric as the goal (session length, time in app, page views, "engagement", DAU) without a causal link to retention or revenue. Longer sessions can mean users are stuck.
- A % target with no baseline or time window ("increase X by 50%").
- A generic user ("users", "customers", "everyone").
- A problem stated as a solution ("users need a dashboard").
- No acceptance criteria, or the spec is under ~40 words with no numbers.
- It fails the **swap test**: it would read the same for any competitor.

For each blocked spec, explain which checks failed, then ask the 2–3 questions that would fix it. Do not invent the evidence yourself; mark unknowns as `TODO: validate`.

Example verdict:
- Input: "Killer AI feature to increase session length by 50%."
- Score: 0/14.
- Reasons: buzzword, vanity metric, no baseline, no user, no behavior, no acceptance criteria.
- Questions to ask: Which user? What job do they fail at today? What would they pay for or stop churning over?

## Step 3: Write the spec (one page; it doubles as the coding-agent prompt)

```
Title:
User: <role, context, size>  |  Job-to-be-done:
Problem + evidence: <frequency, current workaround, quotes/data, n>
Solution (behavior): <what the user can now do, step by step>
Non-goals (v1):
Acceptance criteria:
  - Given <state>, when <action>, then <observable result>
  - Edge/failure cases: <auth expired, empty data, limits, permissions>
Success metric: <outcome metric> from <baseline> to <target> within <window>, for <cohort>
Guardrail metric: <what must not get worse>
Cost/risk: effort estimate, inference $/use, data/privacy, rollback (feature flag)
Rollout: design partners -> flag 10% -> all; changelog note
```

## Step 4: Prioritize with evidence-weighted RICE

Score = Reach × Impact × Confidence ÷ Effort.
- **Reach:** customers or accounts affected per quarter (a real count).
- **Impact:** 0.25 / 0.5 / 1 / 2 / 3, on the *outcome* metric.
- **Confidence:**
  - 100% = behavioral data or paying-customer commitments.
  - 80% = several independent interviews.
  - 50% = one request or a founder hunch.
  - 20% = speculation.
- **Effort:** founder-weeks *including* review, QA, docs and support load. AI agents shrink build time, not those.

Because agents make effort small, **Confidence dominates**: run a cheap test (fake door, concierge, manual workaround) before building anything with confidence below 50%. Also check strategic fit: does it deepen the moat (proprietary data, workflow depth, integrations) or is it a feature a model vendor will ship for free?

## Step 5: Onboarding and activation design

1. Define **activation** as the first moment of real value that predicts retention (e.g. "first client report sent within 7 days"). Measure time-to-value.
2. Remove every step before activation: templates, sample data, import, an AI-generated first draft.
3. Choose the trial mode by ACV and activation speed:
   - **Opt-in trial, no card:** more signups, ~15–25% trial→paid. The median free→paid across 200 B2B products is ~8%.
   - **Opt-out trial, card required:** fewer signups, ~30–60% trial→paid. Best when activation happens fast.
   - **Single human touch during the trial:** one vendor study reports ~38% relative lift (low confidence).
   - **Concierge / done-with-you onboarding:** typically the highest conversion for early B2B (game assumption 1.5–3× opt-in), but it costs 1–2 founder hours per account. Use it for the first 20–50 customers and design partners, and for ACV ≥ ~$5k.
   - **Rule of thumb:** self-serve below ~$5k ACV; hybrid at $5k–$25k; sales-led above that.
4. Instrument: signup → setup step(s) → activation → habit (week-2 return) → paid. Review cohorts weekly.

## Step 6: AI feature economics

Estimate cost per active user per month = calls × (input tokens × input price + output tokens × output price).

Anthropic list prices, Oct 2026, per 1M tokens in/out (verify before use):

| Model | Input | Output |
|---|---|---|
| Haiku 5.5 | $0.10 | $0.50 |
| Sonnet 5.5 | $2 | $10 |
| Opus 5.5 | $4 | $20 |

Cache reads cost ~0.1× input.

Typical per-user monthly cost:
- **Light use:** $0.01–$0.25.
- **Assistant/chat:** $1–$5.
- **Heavy agentic:** $20–$100+.

Flag any flat-rate plan where heavy users could cost more than the price. AI-native gross margins run ~45–60% versus 75–85% for classic SaaS. Mitigate with usage caps or credits, routing to small models, prompt caching, batching, and usage- or outcome-based pricing.

## Step 7: Ship with AI coding agents

- Expect real but uneven speedups:
  - Large on greenfield code, prototypes, CRUD, tests, migrations and unfamiliar stacks.
  - Small or even negative on mature codebases and subtle bugs. In METR's 2025 RCT, experienced developers were 19% slower while believing they were faster. Late-2025 data shows a small positive lower bound.
  - Plan with a **1.5–3× multiplier on greenfield work and 0.8–1.3× on mature code**, not "10×".
- **MVP target:** a narrow workflow tool in **2–6 weeks**; 8–16 weeks if it is integration-heavy or regulated.
- Workflow:
  1. Give the agent the one-page spec plus acceptance criteria.
  2. Have it write tests first.
  3. Keep changes small (one PR per behavior).
  4. Review every diff for auth, data access, secrets and injection.
  5. Put new work behind feature flags.
  6. Run CI (tests, lint, license scan, dependency audit).
  7. Ship daily to weekly, and post a weekly changelog to customers.
- Keep a human owner for architecture, security review, on-call, and the decision of *what* to build.

## Output format

1. A spec scorecard table: spec | score/14 | verdict | blocking issues.
2. Rewritten specs for anything scoring 6–9 (with `TODO: validate` where evidence is missing) and questions for blocked specs.
3. A RICE table sorted by score, and the recommended next 1–3 items with a cheap validation test for each low-confidence item.
4. An activation definition, onboarding mode recommendation, and the funnel metrics to track.
5. An inference cost estimate per user and the margin impact, if AI features are involved.
6. A build plan with the coding-agent workflow and a realistic ship date.

Push back on 2016 habits:
- "Spend 3–6 months building the MVP before talking to users."
- Big roadmaps estimated mainly by engineering effort.
- Engagement or vanity metrics as goals.
- Treating thin AI wrappers as defensible.
