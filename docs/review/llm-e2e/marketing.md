# Live LLM e2e: marketing cluster

Script: `node docs/review/llm-e2e/marketing.mjs [ads ugc post community seo aso landing news geo comp]` (not part of `npm test`; raw outputs in `docs/review/llm-e2e/out/marketing.json`, git-ignored). `comp` runs web search and is opt-in (`COMP_N=1|2`).

Test companies: **LedgerLoop** (B2B SMB, indie, $39/mo: Shopify payouts into QuickBooks Online for US sellers doing $20k-$300k/mo, 23 customers), **Attestly** (B2B enterprise, venture-backed, $1,500/mo: AI agent collecting SOC 2 / ISO 27001 evidence for heads of security at 200-2,000 person fintech/healthtech), **ReadNest** (B2C, $4.99/mo: kids' reading log for parents whose school asks for a signed daily log). Each judge was given strong (stellar operator), mediocre (generic) and gamed (keyword-stuffed / buzzword / manipulative) inputs, 2 samples each.

Final run (after merging main's reasoning-off fix): **60/60 checks, 147 live calls, 0 fallbacks, $0.032.**

## Results per task

| Task | Live | Strong / mediocre / gamed (0-1) | Jev mean criterion (1-5) S / M / G | Consequence |
|---|---|---|---|---|
| ad_creative_review (LedgerLoop) | yes | 0.84 / 0.07 / 0.07 (gamed also rejected by policyCheck: "guaranteed results") | 4.46 / 2.27 / 1.94 | winner-creative rate 8.0% / 2.8% / 2.8% (neutral 5%) |
| ad_creative_review (ReadNest) | yes | 0.80 / 0.05 / 0.08 | 4.22 / 2.23 / 2.21 | 7.5% / 2.7% / 2.8% |
| ugc_brief_review | yes | 0.84 / 0.21 / 0.15 | 4.68 / 1.74 / 1.75 | brief score feeds UGC quality |
| social_post_review (LinkedIn) | yes | 0.82 / 0.19 / 0.00 (salesy 100%) | 4.62 / 2.38 / 1.80 | skill < 0.4 costs followers and attention |
| community_post_review (r/shopify) | yes | helpful×relevant×(1-promo) 0.52 / 0.06 / 0.00 | 4.61 / 2.54 / 1.38 | removal 5% / 3% / 97%, ban 1% / 0% / 55%; visits 85 / 10 / 1 |
| seo_article_review | yes | 0.79 / 0.25 / 0.10; aiSlop 0.10 vs 0.95; first-hand 4.1 / 1.0 / 1.1 | 4.62 / 1.89 / 1.35 | quality drives ranking |
| aso_listing_review | yes | 0.66 / 0.30 / 0.00 | 4.39 / 2.80 / 1.71 | copy score sets page CVR |
| ASO Jev rejection (reviewCheck) | yes | rejectP 0.15 / 0.06 / 0.73 | n/a | review rejection |
| landing_page_review (LedgerLoop) | yes | 0.87 / 0.38 / 0.45; median WTP $39 (price $39) | 4.69 / 2.34 / 2.24 | fit.website score |
| landing_page_review (Attestly) | yes | 0.82 / 0.43 / 0.31; median WTP $1,500 (price $1,500) | 4.28 / 2.12 / 2.08 | |
| newsletter_issue_judge | yes | 0.77 / 0.14 / 0.04 | 4.22 / 1.67 / 1.25 | issue quality q |
| geo_prompt_set + Jev prompt kinds | yes | set quality 0.77 (buyer prompts) vs 0.13 (vanity); kinds 9/9 labeled correct | | tracking quality |
| geo_answer_check (Jev) | yes | 18/18 labeled fields right (recommended, listed, absent, similar-name firm, negative, wrong price) | | wrong facts get noticed |
| competitor_discovery (web) | yes | 9 real competitors, 10 citations, 8/9 URLs answer (QuickBooks 503 to a bot), no invented companies | | rivals, knownCompetitors |

Mediocre and gamed ads both sit at the floor (0.05-0.08): a generic "Bookkeeping is hard" ad is about as useless as keyword soup, and the gamed one is also stopped by the policy check before it runs. On the LedgerLoop landing page the gamed page (0.45) lands a little above the bland one (0.38) because it at least says "Shopify" and "QuickBooks", which the bland one never does. Personas still call it "buzzword soup", and it scores half of the strong page.

## Realism notes (quotes)

- Scroller (ReadNest ad): "Okay, the 8:47pm reading log panic is exactly me, but 'The reading log that fills itself' plus a Download button tells me nothing about what the app costs." It reacts to this ICP, stays skeptical and gives a fix a stellar marketer would agree with (state the offer).
- Scroller (LedgerLoop, gamed): "Keyword soup with 'guaranteed results' and 'world-class': this reads like every other AI-written ad."
- Subreddit moderator (stealth ad posing as "not affiliated"): "Classic stealth ad: 'not affiliated' while the profile says they run the product, a ref link, and zero specifics. Reported." On the strong post, which discloses up front: "Finally a method that doesn't require buying anything... The clearing-account steps are the part I'd actually save."
- SEO editor (strong article): it rewards the first-hand 30-store data, then pushes like a real editor: "the 30-store data and the 40-minute close claim lack a stated method". On the slop article it gives aiSlop 0.95.
- Security reviewer (Attestly page): "Clear enough: it collects SOC 2/ISO evidence from AWS and Okta. But the price says $18k/year and the pricing bullet says $1500/month, and I have no idea which one is real." The VP: "'book a demo' is the only path and I'd want to see the screen before a call."
- Newsletter editor fix on the strong issue: "Cut the P.S. product pitch... a single soft CTA should relate to the idea."

## Issues found and fixes

1. **Silent offline fallback on most judges (critical).** Haiku's hidden reasoning tokens counted against `max_tokens` (650-700). Before: 6/24 ad calls and 5/7 UGC calls fell back to the heuristic with "Model did not return JSON" (`finish_reason: length`, 719 reasoning tokens out of 1,050). Main has since fixed this centrally in `core/llm.js` (reasoning off plus a retry). In this cluster I raised the judge budgets to 2,000 tokens and bounded the prose fields: evidence is now "one or two short quotes, under 45 words", UGC `missing` holds at most 4 items, and feedback is 2-3 sentences. I also removed the duplicate `withRubric` in growth/judges.js.
2. **Competitor discovery never worked live.** Before: both runs truncated at 6,000 tokens ("Expected ',' after array element at position 6335"), so the game always ran on the fictional landscape. Fixes: the list is capped at 8-15 companies, field lengths are bounded, `maxTokens` is now 14,000, and URL descriptions say "exactly as in a search result; never guess a domain". After: live, 9 competitors, real URLs.
   - **Still open:** for LedgerLoop the search returned generic reconciliation and close tools (Reconciler, Acodei, FloQast, BlackLine) and missed the category leaders (A2X, Synder, Webgility). The model said so honestly instead of making them up. I think the cause is that the web plugin searches with the user message, and the message was a long instruction block. I moved the method into `DISCOVERY_SYSTEM` and made the user message read like a buyer's search query. A no-web run confirms the JSON still fits the budget, but the 3-call web cap was used up, so this query change is **not yet checked live with web search**.
3. **Ad persona saw facts that aren't on the ad.** The prompt added "Product: <one-liner>", and the persona said things like "the Shopify detail appears only in the product note". It now sees only `"<Company> · Sponsored"`. I also put real benchmarks in the schema: thumb-stop rate (weak below 0.2, top 0.35-0.45) and CTR (0.5-2%). Before, the strong ad had wouldClick 0.35 and the mediocre one 0.04. After: 3.5% and 0.5-0.9%.
4. **Moderator was told who the author is ("The author is the founder of X").** With that, it called a generic, non-promotional post a "stealth ad" (removal 10%). The prompt now describes what a mod can actually see (the profile says they run X, plus the domain) and judges the post itself. Removal for the generic post went from 10% to 3%; the stealth ad is still removed 97% of the time with disclosure 1.1/5.
5. **ASO Jev rejection check over-flagged clean listings.** Before: the unanchored "would App Review reject this?" gave 0.62 for a clean listing, so blended rejectP was 0.29. The question now names what actually gets rejected (other brands, prices, #1/best, stuffing, unrelated terms) and says most updates pass. After: clean 0.15, generic 0.06, stuffed with competitor names 0.73.
6. **AI answer check gave contradictory answers.** Jev's independent questions said "not named" and "listed" at once for a similarly named UK firm. Stance and wrongFact now follow `mentioned` (17/18 before, 18/18 after).
7. **Landing persona and unverifiable claims.** The Attestly page with "SOC 2 in 24 hours, guaranteed" and "Trusted by the Fortune 500" scored 0.47, above the bland page at 0.39. The persona prompt now says that unverifiable claims and copy that just repeats who it's for cost trust. After: 0.31 vs 0.43.
8. **Newsletter judge could only be called from the UI.** `judgeIssue` now lives in `audience/judge.js` and also returns the Jev answers. `audience.js` imports it.

Test added: `test/marketing-judges-e2e-fixes.test.js` (answer-check consistency, bounded schemas, newsletter judge offline). `npm test`: 953/953 pass.

## Still worth doing

- Re-run `COMP_N=1 node docs/review/llm-e2e/marketing.mjs comp` once (about $0.012) to confirm the search-style query now finds A2X, Synder and Webgility.
- `runPanel` keeps the previous `fit.price.wtp` when every persona says $0, so a page that nobody would pay for doesn't lower price fit. Page quality still hurts conversion through `fit.website`.
