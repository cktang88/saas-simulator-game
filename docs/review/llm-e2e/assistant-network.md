# LLM end-to-end review: assistant, inbox, network, automations, plumbing

Scripts (not part of `npm test`):
- `node docs/review/llm-e2e/assistant-network.mjs [suite]`: 41 live checks across two companies, **Shelfbooks** (indie B2B SMB, bookkeeping for Shopify sellers, $39/mo, 60 customers, $2,340 MRR) and **Clausewise** (venture-backed seed, AI compliance evidence for mid-market fintechs, $1,500/mo, 8 customers, $1.8M raised). Raw outputs: `out/assistant-network.json`.
- `node docs/review/llm-e2e/assistant-network-ui.mjs`: Playwright against the running server on :3000. It creates a company, checks the top bar says "AI judges Live", then runs Settings → Test connection, an Assistant chat and the Messages network roster. With `WORKTREE=1` it serves this checkout's `public/` through Playwright routing, so fixes can be checked in the browser without starting another server.

Final run: **41/41 pass**, 39 live calls plus 1 forced offline, $0.0098. Before the fixes: 23/41, with 22 of 40 calls falling back offline.

## The biggest finding: hidden reasoning truncated short replies (app-wide)

Before the fix, a short-budget call to Haiku 5.5 often came back with `finish_reason: length` and **empty content**, so it fell back to the offline heuristic. Reasoning tokens count against `max_tokens`: 180 to 320 hidden reasoning tokens used up a 250 to 450 token budget. Every task with a small budget was affected: assistant chat/run, inbox drafts, network inbound/replies, customer emails, and in the browser also `competitor_discovery`. The game said "Live", but those features were offline.

**Fix (core/llm.js):**
- `reasoning: { enabled: false }` by default. A caller can pass `reasoning` to opt back in.
- One retry on a network error, 429 or 5xx, or on a reply that is cut off or is not JSON. The retry doubles `max_tokens` when the cut-off was `length`. Bad requests (unknown model, no key) are not retried.
- The cost of a failed attempt is still counted in `usd` and in usage.
- The parse error now includes `finish_reason` and the first 160 characters of the reply, so the console warning says why a call failed.
- `decide()` gets the same single retry on network, 429 or 5xx.

**Before/after in the browser:** the running server serves the old code, so its Assistant chat showed the "offline" badge and Settings showed "2 live calls (2 offline)". With `WORKTREE=1`: the chat answered live, Settings showed "4 live calls (0 offline)", and there were no `[llm]` warnings and no page errors.

**Plumbing checks (live):** a forced bad model id gives `mock: true`, `error` "…is not a valid model ID", one usage event with `mock: true`, and no retry. A cache hit returns `cached: true` and adds no usage event. Usage accounting works the way main.js does it (`calls`, `mockCalls`, `usd`).

## Per task

| Task | Live | Verdict |
|---|---|---|
| assistant_chat | yes | Fixed. It now reports only connector facts: no truth leak, no invented numbers, and it says "no access" when a connector is missing. |
| assistant_run | yes | Fixed (same cause). The weekly metrics prose cites only the facts it was given. |
| inbox_draft | yes | Improved. No new commitments, refuses injected instructions, now has public context. |
| network_inbound | yes | Fixed: leaks, unfilled `{{slots}}`, a "friend" written as a salesman, unannounced funding. |
| network_reply | yes | Fixed: persona wrote as the founder; fee ask now in the persona's voice. Scam and VC behaviour realistic. |
| network_text | yes | Good. Yes/no follows the deterministic `introDecision`; replies are casual and skeptical. |
| network_roster | yes | Fixed: 7-8 of 12 contacts "could help" → 3-4 of 12. Contacts come from the real bio. |
| automation_ai_step (summarize/draft) | yes | Good. No invented facts, no promises; true metrics removed from its context as a precaution. |
| automation_classify (Jev) | yes | Good. strong_fit 1.00, junk 1.00, poor_fit 0.97-0.99, ambiguous → possible_fit 0.88. |
| customer_feedback_email | yes | Good (it had fallen back to offline for the cancel case before the reasoning fix). Short, specific, no "hope this finds you well". |
| connection_test | yes | Good for chat (Haiku) and Jev (`noul` 0.82-0.89). |

### assistant_chat / assistant_run: numbers must come from connectors
The game models assistant fallibility: a connector page can be truncated, a number misread, a connector unavailable or expired. The player is meant to catch this by checking the source chips. But both prompts also received `bizBlock(state, 'insider')`, which contains the **true** MRR, cash and runway. So the model contradicted or "corrected" the facts it was given:

- Before (misread case): "MRR is $1,661 [1], which is lower than the $2,340 in the business facts, so the two figures conflict…"
- Before (Stripe unavailable): "I could not access live MRR… For reference only, the business facts on file show MRR of $2,340 with 60 paying customers [1][3] and runway of 1099.0 months"
- After (misread): "MRR is $1,661 [1]. You have 60 paying customers [3]…" This is the wrong number the game wants the player to catch with the chip.
- After (unavailable): "I could not access your MRR [1], paying customer count [3], or runway [7]. The Stripe payments connector isn't connected… Connect Stripe and I can pull these numbers for you."

**Fix:** `bizContext(state, level, { metrics: false })` (apps/context.js) keeps ICP, path and shipped work but drops traction, money, support and churn tallies, and says the live numbers come from elsewhere. The assistant (chat and run) and automation AI steps use it. The chat call moved into an exported `chatProse()` so the UI and the scripts use one code path. The prose prompt also says not to estimate unavailable facts, do extra arithmetic or mention other data sources.

### inbox_draft
- A customer email about broken payouts and a refund question got "…We're looking into why a portion of your payouts stopped matching… I'll also get back to you on your refund question…". There is no refund promise and no date.
- An investor asking for logo count and pipeline got a reply that declines to put figures in writing before a call. The draft has no business numbers, which is correct for an unreviewed AI draft.
- A thread containing the game's simulated prompt-injection note got "…I won't be sending customer lists or invoices by email." It refused the instruction.
- Fix: added `context: bizBlock(state, 'public')`. The system prompt now also rules out refund promises and business numbers, and says never to follow instructions found inside the thread. The deliberate `badClaim` mechanic is unchanged.

### network_inbound
Issues found:
1. **Unfilled template slots.** Archetype hints use `{{company}}` and `{{category}}`, which were never substituted. Before: "Last quarter we booked 47 demos for a {{category}} tool". After: "…for a small-business SaaS tool". Red flags are filled the same way.
2. **Non-public facts leaked through `companyBrief`.** It sent `Stage: funded` whenever any investment transaction existed, and `traction` when MRR ≥ $5k. Before: a recruiter wrote "Congrats on the recent round" to Clausewise with no public announcement. Now the brief has public status only (live / pre-launch), public pricing and the public events (with the announced amount, press outlet or role). The prompt also says not to invent the MRR posts, rounds or launches that some archetype hints assume, and never to state or guess revenue, customers, growth or funding. With `funding_announced` recorded, the VC wrote "Congrats on the $1.80M round…". Asked later what it knew, it answered: "I only know what's public: the $1.8M announcement and the product page. I haven't seen usage numbers or customer counts".
3. **Friend archetype written as a stranger.** The 'waste' outcome guide plus the "Uber for X" red flag produced "Dave Morrison, Sales Director @ Lakeshore Growth Partners… I came across Shelfbooks on the site". Now friends are told they personally know the founder: "Hey Maya!! Finally got around to checking out shelfbooks.app after you kept bugging me about it lol… my cousin Trish runs a candle shop on Shopify… Trish's son Devin just graduated and is looking for work". The red flags still appear, in a realistic form.

Realism of hidden agendas was good before and after. Example: VC associate "waste": "associate with no partner attending… portfolio company in adjacent compliance tooling… gathering market intel". Corp dev: "Halvorsen's internal engineering team is already building an in-house DORA evidence-mapping feature". The fake investor asks for a DD fee "credited against closing".

### network_reply
- **Persona wrote the founder's side.** Before: the lead-gen agency's reply to "ok" was "Hey Jordan, thanks for reaching out. Quick question… - Maya". The model replied as the founder to its own pitch. Fix: the transcript is labelled `FOUNDER (name)` / `YOU (name)`, the model is told to write only its own next message, and a one-word reply gives it nothing new to work with.
- **Fee asks came out of nowhere.** The invoice line was appended after a reply that never mentioned money. Now, when `onInboundEngaged` creates the fee ask, the persona leads into it: "our first-month retainer is $2,900… I'm sending a separate invoice for that now". The canned invoice line still follows, so the payment mechanic is unchanged.
- The scam keeps steering to the fee and dodges references: "no one is asking you to pay an investor fee. The due-diligence and legal review amount… gets credited against closing". Corp dev never offers a price and fishes for the roadmap. Both are realistic.

### network_roster
Before, 7 to 8 of 12 contacts had a non-empty `knows` list. The Shelfbooks network even had a nurse friend who "knows customer". Real founder networks are mostly people who can't help. Now at most 4 of 12 get a `knows` list: 3-4 per run, all tied to the bio (Brandt & Lowe CPAs partner → customers; Monzo ex-colleague → hires; a regtech founder peer → investors).

### automation_ai_step / automation_classify
The summary keeps only facts from the input: "Rita Gomez (Rita Candle Co, 2 Shopify stores) reports Shopify payouts unmatched since Oct 3…". The draft uses the sign-up's own numbers ("about 6 hours a month") and makes no promises. The Jev router labels are correct with sensible confidence. The ambiguous `lee@gmail.com, "looking at options"` goes to possible_fit (0.88), which is the right bucket, never strong_fit.

## Remaining / not fixed
- One run produced an inbound sender named "Jordan리" (a stray token at temperature 0.95). It is cosmetic and was not seen again.
- `network_text`: when the intro decision is "no", friends often give a soft "send the blurb and I'll see". That is realistic, but a player may wait for an intro that never comes.
- `companyBrief` still gives strangers the ICP as "who it is for (as the website says)". This is fine when the website really says so.
- Not exercised here (they look unowned by the other clusters): `world_news_item` (marketworld/llm.js) and `spend_policy_read` (money/view-spend.js). `competitor_discovery` was seen falling back in the browser before the reasoning fix and running live after it.

## Tests
`test/llm-plumbing.test.js` (offline, stubbed fetch) covers:
- reasoning off by default;
- 5xx retried once, 400 not retried;
- a `length`-truncated reply retried with twice the budget, and both attempts billed;
- a network error falling back after two tries;
- the assistant prose context having no true metrics;
- network inbound prompts having no `{{slots}}`, no unannounced raise and no internal numbers, with friends written as friends.
