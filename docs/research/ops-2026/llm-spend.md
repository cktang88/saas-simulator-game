# LLM spend, 2026: development and in-product inference

Research date: October 2026. Prices change often. Figures marked [unverified] come only from secondary sources. Figures marked [official] were read on a provider's own docs page. Anything marked [design] is a game assumption, not a statistic.

## 1. AI coding spend per developer

**Seat prices (sticker, USD/month)**

- Claude (Anthropic) [official, claude.com/pricing]: Pro $20 monthly or $17 annual. Max 5x from $100. Max 20x is listed as "from $100" on the official page, while third-party guides give $200 [unverified]. Team standard seat $25 monthly or $20 annual; Team premium seat $125 monthly or $100 annual, with 5x the standard usage. Source: https://claude.com/pricing
- Cursor [unverified, several third-party guides agree]: Hobby free, Pro $20, Pro+ $60, Ultra $200, Teams $40/user, Enterprise custom. Paid plans draw from a credit pool. Auto mode is effectively unlimited, but manually selecting frontier models spends credits, so overage can push the bill above the plan price. Annual billing reportedly saves about 20%. Source: https://dev.to/rahulxsingh/cursor-pricing-in-2026-hobby-pro-pro-ultra-teams-and-enterprise-plans-explained-4b89 ; https://www.jetadmin.io/blog/cursor-pricing-explained-plans-credit-system-and-real-costs-in-2026/
- OpenAI Codex, GitHub Copilot, Windsurf: not verified in this pass. Use the vendor pricing pages before setting a per-seat budget.

**Usage limits and what happens at the cap**

- Claude subscriptions use a rolling five-hour session window plus weekly limits [official]. Pro is "at least 5x Free" per session; Max 5x and 20x are 5x and 20x Pro's usage. Source: https://claude.com/pricing
- Third-party reports say the five-hour limits were doubled on May 6, 2026 and that peak-hour throttling was removed [unverified]. One source warns that hitting weekly limits can move a subscription to pay-per-token billing without warning [unverified]. Check the support FAQ before relying on either: https://support.claude.com/en/articles/11049741-claude-code-faq
- Cursor: when the credit pool runs out, manual frontier-model use is charged as overage [unverified].

**Typical spend per engineer**

- Georgian's benchmark (n=252 technical decision makers, Wave 3) [unverified, secondary write-up]: about a third spend $251-$1,000 per engineer per month, 23% spend over $1,000, and only about 9% spend under $100. 63% expect spend to at least double within 90 days. Source: https://benchmarks.georgian.io/the-agent-engineer
- DX's 2026 guide reportedly puts total spend (seats plus tokens) at $200-$600 per engineer per month on average [unverified].
- Gartner (quoted in The Register) described heavy agentic users jumping from $20-$100 to $2,000-$5,000 per developer per month [unverified].
- Uber reportedly caps each employee at $1,500 per month per agentic coding tool (reported via Bloomberg) [unverified].

Read these as a wide distribution with a fat tail. Most engineers sit in the low hundreds; a minority of agentic power users run into the thousands. For a solo founder [design], a reasonable 2026 planning figure is $200-$500 per month for one heavy agent seat plus API overage, with a hard ceiling set in advance.

## 2. In-product inference

**Official Claude API prices, per million tokens (USD)** [official, platform.claude.com/docs/en/about-claude/pricing; the page lists many more legacy models]

| Model | Input | Output | Cache read |
|---|---|---|---|
| Claude Opus 5.5 | $4 | $20 | $0.20 |
| Claude Opus 5 / 4.8 | $5 | $25 | $0.50 |
| Claude Sonnet 5.5 | $2 | $10 | $0.10 |
| Claude Sonnet 4.6 | $3 | $15 | $0.30 |
| Claude Haiku 5.5 (prompts up to 100k) | $0.10 | $0.50 | $0.01 |
| Claude Haiku 4.5 | $1 | $5 | $0.10 |

- Cache writes cost more than base input (about 1.25x for 5-minute caches). Cache reads cost about 10% of base input on most models.
- Batch API is 50% off for asynchronous work (the Batch price column on the same page).
- Long context: Claude 4.6 and later include the 1M-token window at standard pricing, except Haiku 5.5, which has a higher tier above 100k tokens [official].
- US-only inference (`inference_geo`) adds a 1.1x multiplier [official].
- Top-tier Fable/Mythos models are listed at $10 input / $50 output [official], limited availability.

**OpenAI** [unverified, several mid-2026 aggregators agree]: GPT-5.5 about $5 input / $30 output, cached input about $0.50; GPT-5.4 $2.50 / $15; GPT-5.4-nano $0.20 input. Cached input is about 10% of base. Batch is 50% off. Sources: https://morphllm.com/openai-api-pricing ; https://benchlm.ai/openai/api-pricing . Some aggregators contradict these; check platform.openai.com before use.

**Google Gemini** [unverified]: Gemini 3.5 Flash about $1.50 / $9; Gemini 3.1 Pro about $2 / $12-18 depending on context tier; Gemini 3.1 Flash-Lite $0.25 / $1.50. Source: https://www.morphllm.com/gemini-api-pricing . Sources disagree on newer model names, so confirm at ai.google.dev.

**Open-weight via hosts** (Together, Fireworks, Groq): not checked in this pass. Typically much cheaper per token than frontier APIs, with a quality gap that must be measured with evals.

**Tokens per task [design, rough]**

- Chat turn: 1-5k input (with history), 300-1,000 output.
- RAG answer: 5-30k input, mostly retrieved context, which caching can reduce.
- Agent task: 100k to 1M+ input across tool loops; a single unbounded loop can exceed the cost of a month of chat for one user.

**Margins**

- ICONIQ State of AI (secondary write-ups, not the report itself) [unverified]: AI-native gross margin about 41% (2024), 45% (2025), projected about 52% for 2026. Traditional SaaS 75-85%. Inference averages about 23% of revenue at scaling AI B2B companies. Source: https://www.saastr.com/iconiqs-latest-state-of-ai-report-the-10-most-important-data-points-for-saas-founders
- Bessemer [unverified]: healthy AI-native gross margin about 50-60%, mature SaaS 70-90%. Its fastest-scaling cohort reportedly ran near 25% margin, sometimes negative.
- Use 50-60% gross margin for AI apps and 75-80% for classic SaaS as the game's benchmark ranges [design, from the above].

## 3. Pricing responses

- Nalpeiron 2026 State of B2B Software Monetization (243 vendors, vendor-run survey, June 2026) [unverified, self-reported]: 44% absorb inference cost fully in existing price, 42% partly pass it through via credits or tokens, 13% fully pass it through. 66% use usage-based pricing, 52% use credit or token bundles. Source: https://nalpeiron.com/resources/program/2026-state-of-b2b-software-monetization/ai-inference-cost-handling/
- Reported buyer friction: customers avoided AI features even with free credits, fearing unpredictable bills [unverified, secondhand from Metronome].
- Common pass-through pattern [design]: a seat fee that includes a monthly AI credit pool, overage at cost plus margin, a hard cap per user, and a model router that sends easy tasks to cheap models.
- Inference share at seed stage: no reliable source found. Use [design] 10-30% of revenue for an AI-first product at seed, falling as routing and caching mature.

## 4. Spend controls and runaway bills

**Incidents (secondary reports, not provider post-mortems)** [unverified]
- A three-person startup in Mexico reportedly got an $82k Google Cloud bill from a leaked Gemini key, against normal spend of about $180/month. The Register is cited as the source.
- Unit 42 reports criminals routing stolen AI keys into gray-market proxies within minutes of theft. One response case reportedly ran close to $1M in charges before containment.
- Real-time spend caps reportedly did not stop some of these, because billing lags.

**Provider controls**
- Anthropic Console: prepaid credit balance, workspaces with per-workspace limits, and usage alerts. Alerts are often off by default. Rate limits are token-bucket maximums set per organization [official docs, partly; detailed tier thresholds not verified]. Sources: https://docs.anthropic.com/claude/reference/rate-limits
- A third-party report says Claude Enterprise added org and user spend caps with admin alerts at 75% and 90% in July 2026 [unverified]; unclear whether API accounts are covered.

**Mitigations for the game (design rules)**
- Per-user rate limits and daily token caps in the product.
- Scoped, per-environment keys; rotate on any anomaly; revoke first, investigate second.
- Caching for repeated prompts and system prompts.
- Model routing, with an eval suite run before any switch to a cheaper model (quality drops are common on hard cases).
- Budget alerts plus a prepaid hard limit so a runaway loop hits a wall.

**Deprecations**: Anthropic lists retired models (Opus 4 and 4.1, Sonnet 4, Haiku 3.5) as "retired, except on Bedrock and Google Cloud" [official], forcing migration. Plan a migration budget for every pinned model [design].

## Gaps

- No official ICONIQ or Bessemer report read directly.
- No independent per-engineer survey with a clean average.
- Codex, Copilot and Windsurf pricing not verified.
- Open-weight host pricing not verified.
- Google Gemini pricing needs an official check.

Sources used: https://claude.com/pricing ; https://platform.claude.com/docs/en/about-claude/pricing ; https://benchmarks.georgian.io/the-agent-engineer ; https://www.saastr.com/iconiqs-latest-state-of-ai-report-the-10-most-important-data-points-for-saas-founders ; https://nalpeiron.com/resources/program/2026-state-of-b2b-software-monetization/ai-inference-cost-handling/ ; https://morphllm.com/openai-api-pricing ; https://www.morphllm.com/gemini-api-pricing
