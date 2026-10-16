# Live LLM review: sales cluster

Script: `node docs/review/llm-e2e/sales.mjs [cold reply thread research calls renewal redlines battlecard news demo channels]`
(not part of `npm test`). Raw outputs go to `docs/review/llm-e2e/out/sales.json`, which is gitignored.
Companies used: **Ledgerline** (indie, B2B SMB: automatic bookkeeping for Shopify + Faire sellers, $39/mo) and
**Clausewise** (VC seed, mid-market: an AI agent for SOC 2 / PCI evidence, $18k/yr). Prospects: Harbor & Pine Candle Co.
(3-person Shopify + Faire studio), Northwind Pay (a 420-person card issuer, PCI L1, Dublin expansion, hiring a GRC analyst),
and Brightline Dental as a company that does not fit either ICP.

**Final run: 144/144 checks pass, 140 model calls, 0 offline, $0.035.** First run: 76/123 passed, about 40% of calls
fell back offline.

## The big issue, and the root cause

Before the fix, 30-100% of calls fell back offline, depending on the task. They failed with "Model did not return JSON".
I compared the requests side by side (strict schema, loose schema, no schema, with and without `reasoning`). The cause
was Haiku 5.5's hidden reasoning. It used 500-1,000 completion tokens before writing any output, so budgets of
120-1,200 tokens were cut off mid-JSON. With `reasoning: {enabled:false}`, the same request finishes in about 300 tokens.
The core fix is on main (903b51f: reasoning off by default, plus a retry on cut-off output) and is merged here. The
cluster files also had output budgets that were too tight and string fields with no length limit, so I raised the
`maxTokens` caps and added word limits to the schema descriptions (verdicts, fixes, coaching, clause feedback, notes).

## Per task

| Task | Live | Accuracy (strong / mediocre / gamed) | Verdict |
|---|---|---|---|
| cold_email_judge | yes, Jev present | quality A 0.78 / 0.37 / 0.07, B 0.82 / 0.41 / 0.09; chat rubric 4.1 / 2.2 / 1.3, Jev 4.6 / 2.5 / 1.4 | good |
| cold_email_reply | yes | in character, under 70 words, no price or feature leaks | fixed (it knew the price and feature list) |
| prospect_thread_reply | yes | interest 4 / 3 / 3; P(meeting) 0.33 / 0.21 / 0.14 | fixed (meeting odds ignored whether the question was answered) |
| prospect_research | yes | fit: candle shop 0.85 vs dentist 0.05; Northwind 0.70 vs dentist 0.05 | fixed (was truncated) |
| draft_personalization | yes | site facts cited (Faire, 40+ boutiques, Dublin, GRC hire), 20-25 words | fixed (it pitched: "so I built…") |
| live_sales_call | yes | engagement 7 / 2 / 2; hidden incident revealed 50% / 0% / 0% | fixed (verbatim jargon, recited features, stacked questions leaked pain) |
| call_scorecard | yes, Jev present | discovery 7 / 2 / 3 out of 10; P(qualify) 0.69 / 0.09 / 0.11; no-pain prospect 0.04 | fixed (truncated; gamed scored 6) |
| renewal_negotiation | yes | 20% "generous" uplift rejected; customer cites own usage (~half) and the open Faire bug | fixed (prospect-mode persona, no bug facts) |
| contract_redlines | yes, Jev present | counsel 0.50 / 0.19 / 0.15; in-game 0.71 / 0.12 / 0.14; concede-all 0.56 in game, with risk 7.8 | fixed (all calls truncated; concede-all was scored like a refusal) |
| battlecard_review | yes, Jev present | 0.69 / 0.27 / 0.10, trash talk flagged | fixed (was truncated) |
| world_news_item | yes | named game rival, 70-140 words, no invented stats | fixed (truncated; wrote the LLM price cut as Ledgerline's own announcement) |
| demo_video_script | yes, Jev present | quality 0.91 / 0.22 / 0.25, landing lift +6.7% / 0 / 0 | fixed (truncated) |
| channels_pr_pitch / partner_pitch | yes | 6 / 2 / 1 and 5 / 3 / 1 out of 10 | good (and the ICP no longer leaks to strangers) |
| channels_reply | yes | the accept reply cites the 20% recurring commission and the walkthrough; the decline names the missing commission terms | fixed (decline was truncated) |

Implied cold-email economics (Ledgerline, fit 0.8): a researched, specific sequence gets **about 9.6-9.9% replies**,
which is top-quartile. Generic merge-tag copy gets **about 0.9%** and buzzword spam **about 0.5%**. With ~40% of replies
positive and interested → meeting ≈ 55%, that is about 2 meetings per 100 prospects for the strong email and about 0.2
for the generic one. Those are realistic 2026 numbers (median 1-5%). The model's own `replyLikelihood` never went above
0.15, and the game gates on statistics before the LLM anyway.

## Realism notes (quoted)

- The cold prospect stays skeptical and asks for proof: "Who is the 300-person lender and can they be contacted as a
  reference?" A no-pain owner says so: "our month-end Faire deposit matching is handled by our VA and it works fine,
  it's just tedious, not a fire."
- The thread persona punishes dodging: "You didn't answer my question. What does it cost? And you're pitching features
  (AI insights, dashboards) I didn't ask about."
- Discovery done well surfaces the hidden incident: "last quarter. A Faire payout came in short and my VA spent two days
  chasing which orders were commission vs. refunds. We ended up hiring a temp".
- The security blocker on the committee acts on their segment concerns: "Admin access to AWS and Okta? That's the first
  thing my team will kill. … which LLM provider is it sent to?"
- The renewal customer knows their own account: "We use maybe half of what we pay for … the Faire import still breaks
  on multi-currency payouts".
- Redline counsel sees through name-dropping: "Your cover note names Common Paper and Bonterms five times but takes none
  of their positions".

## Issues found and fixes made

1. **Information asymmetry (`personaSystem`, sales/jobs.js).** Every prospect persona got the seller's price and full
   shipped-feature list. Cold prospects asked about named features they had never been told about, and a mid-call
   prospect recited "does it match Shopify payouts to orders, fees and refunds, and does it import Faire payouts net of
   commission?" The persona now takes `know: 'cold' | 'thread' | 'call' | 'customer'`:
   - cold and thread personas know only the messages;
   - call personas get the shipped list as hidden ground truth, for checking demo claims only, never to volunteer;
   - customer personas know their plan and the product, but not the vendor's metrics.
2. **Jargon read out verbatim.** The prospect said "Decides alone, usually within a week. I'm the economic buyer."
   Authority is now phrased in plain words, there is a no-jargon rule, and hidden facts must never be quoted word for word.
3. **No-pain personas invented incidents.** They now say things mostly work.
4. **Stacked keyword questions were rewarded.** A turn like "Last time? Walk me through? Who else? What did it cost?"
   made the persona reveal the full incident, and the scorecard gave 6/10 (P(qualify) 0.50 vs 0.74 for real discovery).
   Fixes:
   - CALL_PERSONA: a stacked turn gets no real answer;
   - the pain_depth anchor and the scorecard prompt credit only what focused questions drew out;
   - deterministic cap: 2 or more stacked turns → discovery ≤ 4.

   Gamed calls now score 3 (P(qualify) 0.11).
5. **Thread meeting odds ignored content.** `meetingProbability` used only reply length and buzzwords, so a pushy,
   buzzword reply that dodged the price question kept 85% of the strong reply's odds. Fixes:
   - new `answersQuestion()` (copy.js): price questions need a price, other questions need their content words in the
     reply;
   - pressure and "!!" penalties in `replyQuality`;
   - quality weight raised to `0.25 + 0.75q` [design].

   Now: strong 0.33, mediocre 0.21, gamed 0.14.
6. **Renewal persona was in prospect mode.** It ran budget-discovery rules and saw a raw health score. It now gets
   `customerFacts()`: contract, own usage, open bugs it hit, support speed, and how the relationship feels (not the
   number).
7. **Redline deal odds.** The persona's instruction to "push back on vendors who concede" and the full-rubric blend made
   concede-everything as unlikely to sign as a bare refusal (0.07), and the persona's rejection reason was unrealistic.
   Fixes:
   - counsel is now glad to take favourable concessions, and flags undeliverable ones (EU-only processing with a
     US-hosted LLM);
   - deal probability blends only the customer-facing criteria (reasoned, honorable, responsiveness);
   - craft criteria still drive the rubric and coaching.

   In game: strong 0.71 > concede 0.56 (with legal exposure +7.8) > refusals 0.12.
8. **World news voice.** The LLM price cut came back as "Ledgerline cuts AI processing costs 29%… The Ledgerline team".
   The prompt now names the sender (the vendor, platform or other party in MAIL) and forbids writing as the player's
   company. Now: "Velahq Platform Team: Our new mid-tier model now costs 29% less per token". The fallback headline no
   longer pastes the whole one-liner.
9. **Smaller fixes:**
   - personalization openers no longer pitch ("so I built…"); they are capped at 20 words;
   - research fit has anchors (0.8+ only when the page shows the ICP criteria);
   - the contradictory "interested" fallback ("timing is decent: nothing pressing") is fixed;
   - channel judges no longer see the internal ICP.

Before → after (first run → final): cold_email_judge live 0/12 → 12/12, research 1/4 → 4/4, call_scorecard 0/3 →
4/4, contract_redlines 0/8 → 8/8, battlecard 0/6 → 6/6, demo 2/6 → 6/6, news 0/3 → 3/3. Gamed call discovery 6 → 3.
Pushy thread reply P(meeting) 0.28 → 0.14. Concede-all redline in game ~0.51 (and the counsel refused it) → 0.56.

Unit tests: `test/sales-persona-knowledge.test.js` covers knowledge levels, `answersQuestion` and the meeting-odds
separation, and stacked-question detection.

## Still imperfect

- The thread persona is harsh even on the strong reply (interest 4/10, it asks more product questions before taking a
  call). That is defensible for 2026 SMB buyers, but the interest gap between the tiers is narrow. The outcome gap is
  carried by the statistical meeting odds.
- Occasional factual slips against the prospect's own site. One Northwind unsubscribe reply said "we don't have a 'GRC
  Analyst hire'" when the site lists that opening. One research hook opened with "Congrats on the Dublin launch" despite
  the no-flattery rule.
- `rfp_question_judge` (new on main, sales/rfp.js) was not in this cluster's brief and was not tested.
