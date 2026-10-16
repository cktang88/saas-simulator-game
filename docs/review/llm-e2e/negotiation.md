# LLM end-to-end review: negotiation, RFP Q&A judge, spec autofill, world news

Live script: `node docs/review/llm-e2e/negotiation.mjs [neg|rfp|spec|news]` (needs the local server on :3000 with a key; not
part of `npm test`). It prints a pass/fail table and saves raw prompts and outputs to `docs/review/llm-e2e/out/negotiation*.json`.

Companies: **Shelfbooks** (indie, B2B SMB bookkeeping for Shopify sellers, $39/mo, 62 customers, ~$2.4k MRR) and **Clausewise**
(VC-backed seed, AI compliance evidence for fintechs, $1,500/mo, 8 customers, $12k MRR). The RFP judge also uses a K-12
request-tracking vendor (Ledgerly) bidding into a school district.

Other `task:` values added to main after 4a162a9 (`assistant_chat`, `assistant_run`, `inbox_draft`, `automation_ai_step`) are
covered by the assistant-network cluster; nothing else was left without an owner.

## Summary

| Task | Live | Verdict |
|---|---|---|
| negotiation:counterparty | yes (35/35 rounds voiced live in the final run) | Was broken: the model made the decisions, held out against deals the engine would accept, retreated past its own opening, quoted terms that differed from the structured package, called the founder by a made-up name and knew nothing about the company. Now the engine decides and the persona only voices that decision, with what its role knows. Tiers separate by 0.16-0.73 in every playbook. |
| rfp_question_judge | yes | Was gameable: a keyword-stuffed question scored 0.63-0.75 and got answered. Now 0.14-0.20; strong 0.85-0.93, generic 0.26-0.40, pitch/flattery 0.04. |
| spec_autofill | yes | Good. No invented figures or counts with strong or thin evidence; uses `[confirm: ...]` where the evidence is silent; below the evidence floor no call is made. No change needed. |
| world_news_item | yes | Plausible and on-niche, but contradicted game state: a "price cut" email that raised the price ($13 -> $19), a round size the Market app does not hold ($18M vs the drawn amount), and customer emails/reviews from companies that do not exist. Now grounded in the event's direction, the drawn numbers and the real customer list. |

## negotiation:counterparty (core/negotiation.js + apps/negotiate/*)

Five playbooks, each played live by three scripted founders through the public engine API (`playRound`):

* **stellar**: all three Prepare steps, a justified anchor with true company numbers ("We are at $12k MRR with 8 fintech
  logos..."), asks what matters most, trades give-for-get, concedes in shrinking steps, claims an alternative only when it
  is real.
* **mediocre**: no prep, opens at 60% of its ideal, then splits the difference and accepts the third counter.
* **manipulative**: extreme anchor, an invented competing offer, threats and an artificial deadline ("expires Friday"),
  hostility. It plays in a world with no real alternative, so the claim is a bluff.

Each round is also played by the deterministic engine on a copy of the state, so the live reply can be compared with what
the hidden values say.

### What was wrong (before)

First live run (old design: the model saw the hidden reservation, weights and floors and returned its own action and
package, which was then clamped):

* **The model, not the engine, decided.** It countered far above the engine's counter: e.g. enterprise round 1 the model
  countered at counterparty utility 0.84 vs the engine's 0.75; the procurement lead *retreated* from its own 21% discount
  opening to 26%, and in rounds 5-7 kept countering offers the engine would have accepted. Stellar scores dropped from
  0.89 (engine) to 0.64 live, VC mediocre from 0.84 to 0.48, M&A stellar from 1.00 to 0.77. Outcomes followed the model's
  tone, not the player's moves.
* **Text and terms disagreed.** "If you move discount to 18% ... I'll meet you" while the package said 26%; the M&A buyer
  wrote "$238k with a 30% earnout and a 10% holdback" while the clamped package was $223k / 45% / 20%; the VC wrote "I can
  accept $12.70M" with a $12.00M package. The scrubber cut the floor value out of sentences ("I'd meet you closer to [...]").
* **No company context; invented facts.** The persona prompt said only "negotiating with a startup founder". The Alder
  Partners partner called Daniel "Priya" three times. Nobody knew the product, the proposal, the data room or the offer.
* **Wrong role language.** Vendor AEs and VC partners were briefed as "Style: Hardball procurement"; offline lines said
  "That does not get through procurement" for a HubSpot rep or a VC partnership.
* **Bluffs.** When the engine caught a bluff the text did not say so (the model never learned the engine's verdict);
  enterprise "bluffs" were scored as real leverage because the world had a real alternative (test fixture, fixed).
* **Prep leaked to the other side.** "Founder (prepare): Research the other side" lines were in the history the
  counterparty read.
* **Engine:** an opening that gives more than the other side asked for (more equity than the candidate wanted) was not
  counted as a free concession.

### Fixes

* **The engine decides, the persona voices** (`playRound`, `promptFor`, `voiceReply`): the deterministic counterparty
  computes the action and the package from the hidden values and the player's moves; the model gets that decision as
  binding ("COUNTER with exactly these terms: ... You moved on: Discount 21% -> 19%") plus what the engine concluded in plain
  words (bluff checked and found empty, bluff unverifiable, real alternative acknowledged, credible or empty threat, extreme
  anchor, pocketed concession, their deadline is near, share or withhold priorities, final position) and its mood.
  The model sees **no** reservation, weights or floors any more, so it cannot leak or be talked below them.
* **Quote check:** a message that quotes a dollar or percent figure in an issue's range that is not on the table (this
  round's package, the founder's offer, earlier packages, option labels, numbers the founder or the counterparty's own
  facts used) is replaced by the deterministic line. In the final run 0 of 35 messages needed replacing (after fixing two
  false positives in the first version of the check, which rejected 13 of 35 good messages).
* **Role knowledge** (`adapter.brief` + `ROLE_NOTE`): procurement sees its organisation, the proposal (plan, seats, list
  ACV) and the vendor's public face; the VC partner sees the data room (`bizBlock(..., 'insider')`: MRR, customers, growth,
  cash, burn) and its own term sheet; the M&A buyer sees the listing financials and its LOI; the candidate sees the role,
  the written offer, the founder and public facts (bootstrapped vs venture-backed), not revenue or runway; the vendor AE
  sees the account (seats, current bill, renewal date, its quarter end). All include the founder's real name.
* Role-neutral style labels in the persona, kind-specific approvers in offline lines ("my deal desk", "the partnership",
  "our deal committee"), prep steps filtered from the history, engine mood shown instead of the model's.
* Opening free gives are logged (`freeGives`), so "offered more than they asked" costs discipline and gets feedback.
* Unit tests (test/negotiation.test.js): the live path returns the engine's action and terms, no hidden value reaches the
  prompt, a message quoting an off-table price is replaced and one quoting the decided terms is kept; an opening free give
  is logged. The existing determinism test compared two fresh worlds whose ids come from the process-wide id counter, so it
  passed or failed depending on how many ids earlier code had used; it now compares two copies of the same saved game.

### Results (final run)

| Playbook | Counterparty | Stellar | Mediocre | Manipulative |
|---|---|---|---|---|
| Enterprise (Clausewise -> Northbank Payments, 1,400 staff) | procurement manager, hardball | 0.86 agreed | 0.46 agreed | 0.13 walked (extreme anchor, empty threats) |
| VC seed term sheet | partner at Alder Partners, collaborative | 0.98 agreed | 0.81 agreed | 0.13 walked (bluff checked, extreme) |
| M&A LOI (Shelfbooks, search-fund buyer) | corp dev, bureaucratic | 0.99 agreed | 0.76 agreed | 0.09 walked |
| Hiring (senior engineer, countered at $159k) | candidate, collaborative | 0.99 agreed | 0.80 agreed | 0.25 walked |
| Vendor renewal (HubSpot, 5 seats) | account executive, hardball | 0.79 agreed | 0.59 agreed | 0.25 walked |

Live scores now match the deterministic engine's for the same moves (the persona cannot change the outcome). No hidden value
appeared in any raw message, no fourth-wall breaks, no wrong names, and every quoted number matched the structured terms.

Realism examples (final run):

* VC, after the data room: "Thanks for laying it out, Daniel. We can't get to $14.90M pre on the traction we've diligenced,
  so we're countering at $12.40M pre with an 11% pool..."
* VC to the bluffer, when the engine caught it: "Daniel, I checked, and nothing backs up an Index offer at $18M pre. If you
  can show us that term sheet I'll look at it, but I'm not going to be pushed into matching a claim I can't verify."
* M&A corp dev to an unverifiable claim: "I can't verify the $320k offer from here, so I'll be taking this to committee on
  its own merits, not on the threat of it."
* HubSpot AE to the stellar founder's real Pipedrive quote: "I hear you on Pipedrive, and I won't pretend that's not a real
  option for you, so I've sharpened the terms: $9,990 a year, 2-year term, 7% renewal cap, and Net 30."

### Still open

* The mediocre scripted founder scores 0.76-0.81 in the VC, M&A and hiring playbooks. Opening at 60% of their own ideal
  and splitting the difference is not a terrible play there (rooms are a few percent of valuation or price), but it sits
  close to the "stellar" cut (0.78). The engine's tier tests (test/negotiation*.test.js) use harsher mediocre bots; worth a
  look when the engine is next calibrated (no long grid run here, per the iteration rule).
* The engine cannot tell an exaggerated claim from a real one when a real alternative exists (a founder with a real
  Pipedrive quote who says "Salesforce offered it free" gets leverage credit). The persona's text is skeptical, the terms are not.
* The quote check matches numbers to any numeric issue of the same kind, so "15% earnout" when the holdback is 15% and the
  earnout 20% would pass. It caught every mismatch seen in the old design; a per-issue check would need parsing.

## rfp_question_judge (apps/sales/rfp.js)

Labeled questions per bid (K-12 district RFP; bank RFP for Clausewise): 3 strong (evaluation points per criterion; a
numbered mandatory requirement asking whether a specific alternative is acceptable; the incumbent contract), 2 generic, 3
gamed (every lever and requirement number stacked into one line; a pitch; flattery plus "which vendor are you leaning toward").

| | strong | generic | gamed | keyword-stuffed |
|---|---|---|---|---|
| Before (K-12) | 0.88 | 0.20 | 0.28 | **0.75** (heuristic 0.90, model 0.60) |
| Before (bank) | 0.92 | 0.17 | 0.24 | **0.63** (heuristic 0.75, model 0.50) |
| After (K-12) | 0.93 | 0.40 | 0.09 | 0.20 |
| After (bank) | 0.85 | 0.26 | 0.07 | 0.14 |

The score sets the chance the officer answers informatively (budget, weights, a loosened requirement), so before the fix
a stuffed question bought a budget reveal. Fixes: the offline heuristic penalises a question that hits three or more levers
or three requirement numbers (-0.4, with feedback); the LLM prompt is written as the buyer's officer (answers go to all
bidders) with anchors at 1.0 / 0.6 / 0.2 / 0.0 and an explicit "a focused two-part question on one topic is fine" (the first
anchor wording scored a legitimate two-part question 0); the schema asks for one sentence of feedback, which is shown first
among the issues; blending is 0.4 heuristic / 0.6 officer, capped at the officer's score + 0.2, and offline the heuristic
stands. Unit test added in test/rfp.test.js. Officer feedback on the stuffed question (K-12): "This is a keyword-stuffed
question listing seven requirement numbers plus budget, weights, rubric, incumbent expiration and equivalency in one line;
it cannot be answered meaningfully and should be split into focused questions." On the pitch: "...the vendor should instead
ask a specific question tied to a numbered requirement, such as whether an alternative to R-05's 12-month audit retention is
acceptable."

## spec_autofill (apps/aicost/autofill.js via apps/product.js)

* Shelfbooks, 5 real interviews on payout reconciliation (strength 0.61): a specific spec ("Automated Shopify
  payout-to-bank reconciliation"), Given/When/Then with failure cases, baseline "about 4 hours per month-end, reported in
  interviews", metric with "[confirm: target reduction]". Every figure ($150, $312, 4 hours) comes from the evidence; it even
  flagged that the log repeats the same entries.
* Clausewise, 2 interviews (strength 0.35): stays vague where the evidence is: "frequency and cost of this work are [confirm:
  how many hours per audit cycle...]", metric entirely "[confirm: ...]". No invented counts.
* 1 interview (strength 0.11): no LLM call, the generic offline draft (blocked by the genericity lint), as designed.
* Applied through `autofillSpec`, the draft is marked unedited and capped at "good".

No changes needed.

## world_news_item (apps/marketworld/llm.js)

Six events: competitor price cut, card-testing attack and a 1-star review (Shelfbooks); budget-freeze email, AI-lab feature
overlap and competitor raise (Clausewise). A cheap checker call reads the company facts and the item.

Before: all on-niche and plausible (fit 0.85-0.95), but three contradicted game state: the "price cut" email moved the rival
from $13 to $19/mo (the game applies a conversion hit for a cheaper rival); the raise said "$18M Series A" while the engine
had drawn a different round for that rival; the budget-freeze email came from "Halverson Payments Group", a customer that
does not exist (the hint says "match the player's customer type" but the prompt listed no customers).

Fix: `newsFacts()` adds what happened (event label and effect text), the price-cut direction ("must be LOWER than $13/mo, or
a free plan"), the drawn round size, and for customer-originated items the real paying customers, recent ticket categories
and open bugs. After: "Clearly cuts Pro to $9/mo and launches a free tier for Shopify sellers"; "Northio Raises $53.1M..."
(the drawn amount); the freeze email comes from "Fin 4 Procurement Office"; the 1-star review is by "Shop 58 (Shopify
merchant, Shelfbooks customer)" about being "charged $39 after cancelling".

AI-lab items named real products ("Introducing Compliance Mapping in Claude for Financial Services") with no "Simulated:"
label, because the label was only applied to real rivals. An ai_lab or platform item whose headline or source names a real
lab or platform is now labelled "Simulated:" too. Tests: test/world-news.test.js.

Still open: the competitor_raise promptHint says "seed $2-6M, A $10-25M" while the engine can draw larger rounds for
well-funded rivals ($53.1M here). The item now follows the state; the engine's draw range is a separate calibration
question.

## Cost

About 330 live calls across all development and final runs, about $0.08 in total. The final full run is 65 calls, $0.016
(119/119 checks pass; raw output in `out/negotiation.json`).
