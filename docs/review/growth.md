# Realism review: growth (ads, organic, website judge, market model, market world, channels/pricing)

Reviewer pass 2026-10-14. Scope: `public/apps/ads.js`, `public/apps/organic.js`, `public/apps/growth/*`, `public/apps/website.js`, `public/core/market.js`, `public/core/params.js` (MARKET, ONBOARDING), `public/apps/market.js`, `public/apps/marketworld/*`, `public/data/world.js` (non-life events), and `public/apps/channels*` / `public/apps/pricing.js`. Note that channels and pricing exist but are **not registered** in `public/apps/registry.js`, so none of their code runs in the game yet. No code was changed.

## Summary

At a single ad set and moderate budget, paid media is well calibrated. A B2C Meta ad set at $50/day gives CPM ~$15, link CTR ~1.0–1.15%, CPC ~$1.35–1.50 and reported/true conversions ~0.77. An average app loses money on Meta, which is realistic: year-1 ROAS 0.30 and no payback inside a year. A good app pays back in about 6 months. Learning phase, seasonality, attribution loss, fatigue warnings, Google demand caps and the LinkedIn CPL (~$120–130) all behave sensibly.

The problems that matter are structural, and most of them inflate LTV or let a player get around the cost of scaling:

1. **B2C first-renewal churn is never applied** (a core index bug). Month-1 retention comes out at 0.70–0.89 when it should be ~0.52, which inflates year-1 B2C LTV by ~1.5×.
2. **Scaling is per ad set, not per account or audience.** Twenty copies of one $100 ad set spend $2,000/day at the same CPA as $100/day. One $2,000 ad set costs 4.4× more per payer. With good fundamentals this lets a player print money.
3. **An annual-only plan is priced as if it were a cheap monthly plan.** A $59.99/yr plan gets trial→paid of 83% and day-30 ROAS of 4.3×.
4. **Every creative is a fresh lottery draw at near-zero cost.** Identical copy re-rolls its hidden quality, so pasting the same ad N times buys more chances at a winner.
5. **Google Search demand grows with the number of keyword lines, even duplicates.** Six copies of the same 8 keywords give 6× the traffic at the same cost per trial.
6. **World events pile up for AI products.** A B2C product whose ≤3 features all use AI is classed as a "wrapper" and gets ~17 new competitors a year. Median landing conversion ends up ×0.55.
7. **SEO domain rating (DR) rises to 60 in about 9 months** from blogging alone, and referral rewards cost nothing.

## Findings

Severity: **H** breaks economics or can be exploited, **M** a number is off by 1.5× or more or misleading, **L** polish. File:line refers to the current tree.

| id | sev | file:line | What's unrealistic | Evidence (sims below) | Real-world benchmark (source, date) | Concrete fix |
|---|---|---|---|---|---|---|
| G1 | H | `core/stripe.js:277` + `core/market.js:96` | `paidMonths` is incremented **before** `churnBeforeRenewal` reads `curve[paidMonths]`. The first renewal therefore uses `curve[1]=0.12` and the 48% month-1 churn (`curve[0]`) is never applied. The same happens for SMB (8% → 5%). | B2C monthly payers: M1 retention 0.70–0.89, M3 0.52–0.71, M12 0.09–0.22 (see S1). Research curve: M1 ~0.52, M3 ~0.43, M12 ~0.17. Year-1 revenue per payer comes out ~7.5 months of price instead of ~5.0. | Monthly first renewal 42–61% by category (RevenueCat, [renewal rates by category, 2026](https://www.revenuecat.com/blog/growth/average-subscription-renewal-rates-by-app-category)); 43% at D90, 17% at 1 yr (Adapty 2025, research §3). | `const base = curve[Math.min(curve.length-1, Math.max(0,(sub.paidMonths ?? 1) - 1))]`, or call churn before the increment. Re-run tests. Also use the subscriber's own plan in `priceFactor(state, planOf(sub))`, not `mainPlan`, so grandfathered subs are priced correctly. |
| G2 | H | `growth/delivery.js:141,167,171`; `growth/adsEngine.js:322,344` | Diminishing returns (`dim`), frequency (`imps6`), wear (`ad.lifeImps`) and learning are all computed **per ad set**. Duplicate ad sets on the same broad audience therefore scale linearly, with no auction overlap and no shared frequency. The same creative used in N ad sets wears N separate counters. | S2: 1×$1,000/day for 120d: CTR 0.29%, $218/trial. 10×$100/day: CTR 1.10%, $59/trial (same as 1×$100: $61). Good fundamentals over 60d: 20×$100 gives $56/payer, 1×$2,000 gives $246/payer. With good fundamentals, payer CAC ($56) is below year-1 revenue per payer (~$60), and that holds at any budget. | Same-account ad sets on overlapping audiences are de-duplicated: Meta enters one ad set per auction, and heavy overlap throttles delivery and raises costs ([Jon Loomer](https://www.jonloomer.com/?p=24907), 2025). Practitioners report that consolidating beats splitting (research §1.1). | Compute `dim` on **account-level spend per audience type per day**: `diminishing(Σ budget of live ad sets with same audience.type, model)`. Compute `imps7` and `freq7` from account-level impressions into that pool. Key wear on `creativeId` (sum `lifeImps` over all ads using the creative). Add an overlap penalty: for k ad sets with the same audience, per-ad-set CPM ×(1+0.08·(k−1)) and the learning threshold counts events per ad set (already true), so splitting causes "learning limited". |
| G3 | H | `core/market.js:62-66` (`priceFactor` uses `monthlyPrice`) | An annual plan is compared with **monthly** WTP at price/12, so a $59.99/yr plan looks like a $5/mo product: priceFactor 2.3, which raises landing ×1.5, trial→paid ×1.65 and lowers churn. `MARKET.*.annualShare`/`annualDiscount` (`params.js`) are unused by `acquire`, and every signup takes `mainPlan`. | S1 (good app, annual $59.99, 14-day trial): landing 11%, trial→paid **0.83**, CAC/payer $14, ROAS D30 **4.26×**. The same app on monthly $9.99: trial→paid 0.48, D30 0.28×. | Typical prices: monthly $10, yearly $30–35, about 3–3.5× monthly. Trial→paid is driven by trial length, not interval (RevenueCat SOSA 2026, research §3). Annual refunds run 4–7% (Adapty). | Compare like with like: `annualWtp = wtp*12*(1-0.4)` (B2C) or `*(1-0.17)` (SMB). `priceFactor = (plan.interval==='year' ? annualWtp/plan.price : wtp/plan.price)^elasticity`. In `acquire`, split signups between the monthly and annual plans using `annualShare` (or `predictedMix` once Pricing is registered). Make `PAYMENTS.refundRate` depend on interval: B2C annual 0.05, monthly 0.025. |
| G4 | H | `growth/adsEngine.js:106` (`u: rng(state)`) | Each creative gets an independent hidden draw `u`, while the judge result is cached by identical text. Pasting the same copy N times gives N independent winner chances at 0.5–0.75h each and $0 for static ads. Generic copy (skill 0) still has a 2.5% winner chance per paste. | Judge check (S5): generic copy skill 0.00 gives winner probability 2.5%. In S1, $1,000/day plus 4 new average creatives/month kept cost per trial at $35 versus $25 at $50/day. Volume alone beats the scaling curve. | Andromeda clusters near-identical ads into one "entity". Cosmetic edits don't create a new auction entry, and a similarity score above ~60% suppresses retrieval (vendor reports: [nikhil.pro](https://nikhil.pro/meta-ads-creative-similarity-explained/), [Segwise 2026](https://segwise.ai/blog/meta-andromeda-update-creative-strategy-2026); exact threshold unverified). Hit rate 3.8% for accounts under $10k/mo (Motion 2026-04). | Seed `u` from `hash(normalize(hook+primaryText+headline)+format)`. For copy whose token-Jaccard with an existing creative is ≥0.6, reuse that creative's `u` (plus ±0.05 noise) and share its `lifeImps` (same entity). Cap creatives reviewed per ad account at 50/day (mirrors Meta's per-ad-set limit of 50 ads). |
| G5 | H | `growth/delivery.js:216-221,242`; `growth/params.js:49,67` | Search demand = `demandPerKeyword` × number of keyword lines. There is no de-duplication, no overlap between phrase and broad match of the same root, and volume does not come from `keywordMetrics`. Duplicate lines multiply the available clicks. | S3 SMB Google: 8 phrase keywords at $1,000/day spend only ~$73/day (94% lost to demand, correct). The same 8 keywords pasted 6× spend $436/day at the same $137/trial. | Google de-duplicates identical keywords in an ad group and only one keyword triggers per query; demand is set by real query volume (Google Ads keyword match-type docs). | De-duplicate on `text.toLowerCase()+match`. Take per-keyword clicks/day from `keywordMetrics(text, model).volume/30 × matchVol × ctr`, and cap total demand at the volume of distinct roots (broad ⊇ phrase ⊇ exact on the same root count once). Show "Search impression share lost (rank/budget)" from this. |
| G6 | M | `growth/delivery.js:77-81` (`wearFatigue`) | Wear depends only on lifetime impressions and **never recovers**. The pocket is 5% of the pool (150k for B2C broad). An ad set at $200/day with no new creatives decays to CTR 0.29–0.32% and $240–400/trial by month 12, about 4–6× month 3. Paused creatives come back just as worn. | S1: $200/day average, no refresh: monthly cost per trial $62 → $241 → $403. $1,000/day: CTR 0.06–0.07%, $800–1,650/trial. | Fatigue shows as CTR −20–30% over 3–7 days and ads "die" in 2–3 weeks (Billo, Segwise; research §1.1). Practitioners report partial recovery after a 2–4 week pause [vendor/anecdotal]. CTR 0.06% is below any Meta benchmark (1.05% avg CTR, Q1–Q2 2026 US, [Creatify/AdRiseLab](https://creatify.ai/blog/what-is-a-good-cpc-cpm-and-ctr-for-meta-ads)). | Decay `lifeImps` daily: `lifeImps *= 0.5^(1/30)` (30-day half-life, [design]). Floor wear at 0.35 (CTR never below ~35% of fresh). Keep the frequency curve as the main short-term signal. |
| G7 | M | `marketworld/model.js:35` (`aiDependence` 'wrapper') + `data/world.js` rates | Any product with ≤3 features that all use AI is a "wrapper". Rates then multiply by 2.5 (new entrant) and 3 (AI-lab overlap). `competitor_new_entrant` events supersede each other but grow the rival list, and `pressureMult` sits at its 0.85 floor. `ai_lab_feature_overlap` keeps signups ×0.65 and churn ×1.4 almost continuously. | S6, B2C with one AI feature: 16.8 new entrants/yr, AI-lab overlap 2.5/yr, rivals 14 → 27 in 18 months, world landing multiplier **p50 0.55** (p10 0.50). Without AI: p50 0.88. SMB with AI: p50 0.86. | Sherlocking by a lab is a multi-year event per niche (cases: Jasper 2023, Record mode 2025-06, Atlas 2025-10, Cowork 2026-02; i.e. ~1–2 per year **across the whole market**, research world-ops). Baseline conversion rates already assume competition (code comment, `model.js:187`). | Classify "wrapper" only when there is no proprietary data and no integration and the product is horizontal, regardless of feature count. Cap `ai_lab_feature_overlap` at 0.3/yr effective and make it decay: signupMult recovers linearly to 1 over `durationDays`. Make the new-entrant effect depend on `rivals.length`: rate × `clamp(8/activeRivals,0.3,1)`. Retire bootstrapped rivals at 25%/yr so the landscape doesn't only grow. Clamp the product of all `world:*` landing modifiers to ≥0.75. |
| G8 | M | `growth/organicEngine.js:257`; `organicModel.js:39` | DR grows by +0.05/week per top-10 article older than 90 days, up to a cap of 60. DR then **triples** the top-10 odds (`1+dr/30`), a compounding loop with no backlinks. | S4: 52 long-tail articles over 6 months put DR at **60** by month ~9; 30/52 ranked top 10 (quality 0.6). | DR is a log-scale backlink metric (Ahrefs). New sites with content but no link building typically sit at DR 0–20 in year 1 ([Ahrefs DR](https://ahrefs.com/blog/domain-rating/)). ~1.7% of new pages reach the top 10 in a year (research §4). | DR gains only from link events: PH top-10 +8, cited community thread +0.3, guest post / PR +1–3, and articles +0.01/week each (not 0.05), with cap `20 + 10·log10(1+linkEvents)`. Change the ranking boost to `1 + dr/100`. |
| G9 | M | `growth/organicEngine.js:249-256`; `params.js:203-207` | The `free_month` and `credit` referral rewards add +0.2/+0.17 to K at **zero cost**; only cash is charged. The channels app (`channels/sim.js:31,69`) has a second customer-referral program on the same `referral` source, so K can be counted twice once it is registered. | K for B2C (pf 1.0) goes 0.15 → 0.35 with free_month at no cost (S5). | Referral programs add 0.05–0.3 to K (research §4 [design]). A free month costs one month of revenue per referred payer and per referrer. | When a referred subscription converts, set `discountPct=1` for one period on both the referrer's and the referred sub (two-sided), or post an equivalent contra-revenue entry. Make organic and channels share a single `state.market.referrals` program and compute the boost once. |
| G10 | M | `core/params.js:64-71` + `core/state.js:9` | Enterprise: the default plan is $1,500/**year** ($125/mo) but `refPrice` is $1,500/**month**, so `priceFactor` saturates at the 2.5 clamp. The demo-request rate of 0.4%/visitor makes website-route LinkedIn/Meta cost $1,800–$9,000 per demo. | S3/LI: LinkedIn lead form CPL $128 (fine). Website-demo optimization: $9,014 per lead (1 lead in 90d at $100/day); Meta to website demo: $1,793. | Enterprise demo cost $500–$2,000 (Redefine Web, research §1.3). SaaS landing median 3.8% (Unbounce 2024); demo forms 1–3% [design]. | Set the ent default plan to $15,000/yr (ACV $15k) and `refPrice` to $1,250/mo, or compare in the same unit. Raise `ent.trialStartRate` to 0.012. |
| G11 | M | `growth/params.js:101`, `SEASON.b2c[10]=1.15` | November is 1.15 but the research §6 table says Nov 1.25 (Oct→Nov +21%). The BFCM week (1.7) is correct. | Month-1 (Nov) CPM in S1 was $18 vs $13–15 in Jan–Mar, partly from BFCM. | Superads Oct→Nov +21% (research §1.2). Q1 2026 Meta median CPM ~$14 ([Synter Q1 2026](https://syntermedia.ai/benchmarks/2026-q1/meta-ads/cpm)), US $13–14 (Affect Group Q1 2026). | `SEASON.b2c[10] = 1.22` (BFCM handled separately). Base B2C CPM $14 is good. |
| G12 | M | `apps/website.js:97` | Website score = 0.55·quality + 0.45·clamp(trialProbability/0.25). LLM personas who say "25% chance I'd sign up" saturate the trial term, and real SaaS landing CVR is 3.8%. Re-runs with a one-character edit bypass the cache and re-roll at temperature 0.8. | Offline heuristic: a keyword-stuffed page gets 0.74 vs generic 0.15. A score of 0.7 → `websiteFactor` 1.28, and with product 0.7 the landing rate is 7.3% (2× the Unbounce SaaS median). | Unbounce SaaS median 3.8%, all-industry 6.6% (2024). | Map trialProbability on a log scale, `clamp(log(p/0.005)/log(0.25/0.005),0,1)`, and lower temperature to 0.3. Give the panel 2 fixed calibration pages (a generic page and a known-good page) and z-score against them. Keep `fit.website.score` as the mean of the last 2 runs so repeated rolls regress. |
| G13 | M | `growth/judges.js:17-23,59-62` (offline fallback) | The heuristic rewards echoing ICP words and any digits. "habit tracker busy parents read more books … 10 20 30" gets skill 0.94 (≈ a strong human hook). | S5. | n/a (judge calibration) | Count only numbers attached to a unit or outcome (`\d+ (books|minutes|%|\$)`). Penalise ICP-word density above 30% of tokens. Require a verb in the hook. |
| G14 | M | `apps/ads.js:511`; `params.js:150` | The AI UGC tier ($5/$15/$30) only changes the cost: glitch chance, CTR and CVR are the same, so the dominant strategy is to always pick basic. | Code. | RevenueCat test: a lip-sync glitch cost 68% of CTR; premium avatars glitch less (research §2). | glitchChance by tier: basic 0.2, pro 0.1, premium 0.04. cvr: basic 0.8, pro 0.9, premium 0.95. |
| G15 | M | `growth/adsEngine.js` (no learning reset on restriction) / `world.js` `meta_ad_account_restricted` 0.18/yr | Restriction risk is flat over time. In reality it is concentrated in new accounts and first spends, and new BMs get flagged far more. | S1 seed 11 hit a 21-day restriction on day 4, which is plausible, but the rate stays flat afterwards. | No published base rate (world-ops research). Practitioner consensus is that new accounts and fast spend ramps get flagged most. | Rate ×3 during the first 60 days or when spend rises >3× week-over-week, ×0.5 after 6 months of clean billing and `verifiedBusiness`. After restriction, set the ad set to `learning` (delivery reset). |
| G16 | L | `growth/params.js:21`; `adsEngine.js billAccount` | New-account daily limit $50 doubles per paid bill and is lifted after 4 bills. That is fine, but `thresholds` [25,50,250,500,750] means ~10 card charges in week 1 at $200/day. | Code. | Meta starts at ~$25 and raises the threshold after successful charges; agrees with the [design] value. | OK. Optionally show "Payment threshold $X" in Billing. |
| G17 | L | `growth/params.js:202` (`wom`) | K is applied to paying **active** subscriptions only, which is correct. The resulting WOM share of payers is 10–25%, in line with K 0.1–0.26. | S1: non-paid share of payers 0.10 (avg), 0.17–0.25 (good). | K typical 0.15–0.25 (Saxifrage). | No change. |
| G18 | L | `growth/organicModel.js:120-130` (`phOutcome`) | A skilled founder with a 3,000-person network reaches the top 3 35% of the time and the top 10 92%. | S5. | Top 3 <5% base rate (LaunchList 2026; research §6). | Pull `score` thresholds up by 0.06 (top-3 >0.88), or add daily competition noise ±0.25. |
| G19 | L | `core/params.js:54-56` (SMB) | Card-required SMB trial → 0.15×2.2 = 0.33 baseline and 0.63 at product 0.7. That is the top of the 30–60% range for an average-good product. | S3: trial→paid 0.35 (avg), 0.61 (good). | Card-required B2B trials 30–60% (research / ChartMogul×Poyar 2026). | Cap `trialConversion` for SMB card trials at 0.55 and use `productFactor^0.7`. |
| G20 | L | `channels.js`, `pricing.js` not in `apps/registry.js` | Channels and Pricing lab are built and tested but not registered, so tier/annual mix (`pricing-sim.js:172-180`) and channel volume never run. Until they are, plan mix (G3) has no remedy in the game. | `grep channels registry.js` → none. | n/a | Register both apps. Then make sure organic referral and channels referral share one program (G9). |
| G21 | L | performance (`acquire`/`stripe` linear scans) | At 2,000+ trials/month a 120-day run of 100 ad sets did not finish in 2 minutes. Exploit G2 also makes the game slow. | S2 (100×$100 timed out). | n/a | Fixing G2 removes the incentive. Also index charges by `subId` in `bookRevenue` (`acquire.js` currently `find`s per refund). |

## What is realistic (keep)

- **B2C Meta single ad set, $50/day:** CPM $14.8–15.5 (Q1 2026 median ~$14, Synter/Affect), link CTR 1.0–1.15%, CPC $1.35–1.52 (AdRiseLab Q1–Q2 2026: 1.05% CTR, $1.40 CPC). Cost per trial $25 (good) to $63 (avg); cost per payer $54–$255. The average app has year-1 LTV:CAC 0.3 and never pays back; the good app pays back in ~D180. This matches "median app ~$72/mo after a year" and the D7 15–30% / D30 40–70% ROAS targets that only good apps hit.
- **D7 ROAS = 0 with 14-day trials and 0.18 with 3-day trials.** This is exactly why apps use short trials (research §3). 3-day trial→paid of 0.32 vs 14-day 0.48 is in the right direction and size.
- **Learning:** $50/day never exits learning (≈9 trials/week, versus 50 needed), so the ad set stays "Learning limited". The minimum-budget hint (7× CPA) is shown.
- **Attribution:** reported/true 0.75–0.80 with pixel and CAPI; view-through claims of organic signups; SKAN-like delays on iOS. All match the research [design] ranges.
- **Google Search, SMB:** CTR 6.5–8.2%, CPC $5.1–6.1 (WordStream 2025/26 $5.26–5.42). Cost per trial $51–$138 (research $50–$200), cost per payer $91–$473. Demand caps correctly ("lost to demand 94%" at $1,000/day). That matches paid-search CAC ranges of $400–$2,000 for higher ACV ([SaaSHero 2026](https://saashero.net/google-ppc/saas-cac-benchmarks-2026/)).
- **LinkedIn, enterprise:** CPM $81–90, CTR 0.4–0.9%, CPC $9.3 at $100/day, lead-form CPL $128 (Metadata median $202; research range $75–$250). At $500/day CPL rises to $344 as the small job-title pool saturates, which is realistic.
- **Refunds:** 1.8–4.1% of first charges (US iOS median 2.7%).
- **SEO ramp:** first visits in month 3–5, slow compounding, AI-overview damping, and tiny long-tail volume. Network launch: ~15 signups and ~0.5 payers from a 50/300/100 network (research: 0–3). PH typical founder (skill 0.5, net 300): 13% top 10, ~2 payers.
- **World events without AI dependence:** B2C landing p50 ×0.88, SMB ×0.975, ENT ×0.95. Core updates ~3–5/yr (actual Google confirmed core updates: 3 in 2025). Competitor events ~1–3/yr.

## Reproducible sims

Scripts are in the session scratchpad (`…/scratchpad/review-growth/`). The essentials are below; run each from any directory with `node file.mjs`. World events are excluded with `APPS.filter(a=>a.id!=='market')` unless noted.

```js
// harness core
const R = '/home/user/saas-simulator-game/public';
const { newState } = await import(`${R}/core/state.js`);
const { advance } = await import(`${R}/core/clock.js`);
const { seedDefaultStack, post } = await import(`${R}/core/bank.js`);
const { ensureStripe } = await import(`${R}/core/stripe.js`);
const { ensureMarket } = await import(`${R}/core/market.js`);
const { APPS } = await import(`${R}/apps/registry.js`);
const E = await import(`${R}/apps/growth/adsEngine.js`);
const s = newState({ companyName: 'Growth Co', model: 'b2c', path: 'indie', founderName: 'Pat', seed: 11 });
ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
post(s, { amount: 3e6, counterparty: 'Pat', category: 'owner_contribution' });
s.apps.product = { features: [{ id: 'f1', title: 'core', status: 'shipped' }] };
s.company.website = { source: 'paste', title: 'x', text: 'x' };
s.company.oneLiner = s.company.icp = 'Habit tracker for busy parents who want to read more books';
s.market.fit.website.score = 0.7; s.market.fit.product.score = 0.7;         // "good"; 0.35/0.3 = default
const acct = E.createAccount(s, 'meta'); acct.payment = 'card'; acct.pixel = acct.capi = true; acct.dailyLimit = null;
const c = E.createCampaign(s, { p: 'meta', name: 'c', objective: 'sales' });
const set = E.createAdSet(s, { campaignId: c.id, budget: 50, audience: { type: 'broad' }, optimization: 'trial' });
for (let i = 0; i < 5; i++) { const cr = E.addCreative(s, { name: 'cr' + i, format: 'ugc_video', hook: 'h', skill: 0.75 }); cr.status = 'approved'; E.createAd(s, { adsetId: set.id, creativeId: cr.id }); }
// IMPORTANT: core prunes charges >120d and ad rows >365d. Advance 1 day at a time and copy
// s.stripe.charges into a Map (mark refunded from s.stripe.refunds) to compute D365 cohorts.
advance(s, 455, APPS.filter((a) => a.id !== 'market'));
```

**S1: B2C Meta matrix** (seed 11, $9.99/mo, 14-day card trial, spend days 1–365, cohort = signups on days 0–90, measured to day 455):

| config | CPM | CTR | CPC | $/trial | trial→paid | $/payer (cohort) | ROAS D30/90/180/365 | M1/M3/M6/M12 ret | non-paid share |
|---|---|---|---|---|---|---|---|---|---|
| $50 avg | 15.5 | 1.02% | 1.52 | 63 | 0.25 | 167 | .06/.14/.22/.30 | .70/.52/.33/.09 | 0.10 |
| $200 avg | 17.4 | 0.46% | 3.74 | 159 | 0.28 | — | — | .82/.57/.43/.21 | 0.08 |
| $1,000 avg | 18.7 | 0.11% | 17.7 | 630 | 0.27 | — | — | .79/.58/.42/.15 | 0.13 |
| $50 good | 15.4 | 1.14% | 1.36 | 25 | 0.48 | 33 | .28/.72/1.21/1.80 | .79/.63/.43/.17 | 0.18 |
| $200 good + 2 new creatives/mo | 15.1 | 1.20% | 1.26 | 24 | 0.51 | 37 | .26/.68/1.12/1.57 | .82/.62/.38/.16 | 0.17 |
| $1,000 good + 4/mo | 16.0 | 0.73% | 2.20 | 35 | 0.50 | — | — | .83/.65/.44/.17 | 0.18 |
| $50 good, 3-day trial | 15.4 | 1.14% | 1.35 | 26 | 0.32 | 53 | D7 .18, .19/.52/.90/1.41 | .89/.71/.55/.20 | 0.25 |
| $50 good, **annual $59.99** | 15.4 | 1.15% | 1.34 | 18 | **0.83** | **14** | **4.26**/4.29/4.29/4.29 | — | 0.17 |

The M1 column shows G1: real M1 should be ~0.52. The annual row shows G3. Comparing $50 → $200 → $1,000 without refresh shows G6.

**S2: split exploit (G2)**, 120 days, 5 shared creatives:

```
1 × $1000  CTR 0.29%  $/trial 218  $/payer 843
10 × $100  CTR 1.10%  $/trial 59   $/payer 253
1 × $100   CTR 1.11%  $/trial 61   $/payer 259
good, 60d: 20 × $100 → $/payer 56 ;  1 × $2000 → $/payer 246
```

**S3: search and LinkedIn** (180d / 90d):

```
SMB Google $100/d, 8 phrase kws   CPC 5.89 CTR 6.7% $/trial 111 trial→paid .37 $/payer 320 lost-to-demand 28%
SMB Google $1000/d, same 8 kws    spend ≈$73/d, lost-to-demand 94%
SMB Google $1000/d, 8 kws × 6 dup spend ≈$436/d at $137/trial          ← G5
SMB Google good (0.7/0.7, ad q .8) $/trial 51  trial→paid .61 $/payer 91
ENT LinkedIn $100/d lead form     CPM 81 CTR .87% CPC 9.29 CPL 128
ENT LinkedIn $100/d website demo  CPL 9,014 (1 lead)                    ← G10
ENT LinkedIn $500/d lead form     CPL 344 (job-title pool saturates)
```

**S4: SEO (G8):** 2 articles/week for 26 weeks, quality 0.6, SMB. 30/52 top 10. Cumulative SEO visits: month 6 = 8, month 12 = 70, month 19 = 189; 5 SEO signups and 8 LLM-referral signups. DR 2 → 60.

**S5: judges, PH and K:**

```
creativeHeuristic skill: generic 0.00 (winner p 2.5%) | specific 0.96 | keyword-spam 0.94   ← G13/G4
website heuristic score: generic 0.15 | stuffed/specific 0.74
PH top3/top10: skill .5 net 300 → 0%/13% ; skill .8 net 3000 → 35%/92%                      ← G18
K b2c: pf 0.7 .105 | 1.0 .150 | 1.3 .195 | 1.75 .263 ; +free_month referral ≈ +0.17–0.26 (no cost) ← G9
Network launch (50 friends/300 LI/100 X, skill .6): ~15.8 signups, 0.6 payers (b2c)
```

**S6: world events (G7)**, 6 seeds × 2 years, Meta $20/d and one article, unique event ids:

```
B2C, 1 AI feature (=> 'wrapper'): new_entrant 16.8/yr, ai_lab_overlap 2.5/yr, core_update 4.4/yr; landing mult p10/50/90 .50/.55/.72
B2C, no AI:                        new_entrant 3.1/yr, core_update 4.9/yr;                    landing mult .60/.88/.99
SMB, no AI: .89/.975/1.05   ENT, no AI: .86/.95/.99
```

## Workflow realism vs real tools (short)

- **Meta Ads Manager:** the Campaign → Ad set → Ad structure, learning labels, a 7-day-click attribution note, a billing-threshold ladder, a new-account limit and a "Cohorts & truth" tab are all good. Missing pieces: an Advantage+ campaign-budget toggle (campaign-level budget, which is the 2026 default), an account-level frequency/overlap warning (Audience Overlap tool, see G2), and Entity-ID-style "similar ads" grouping (G4).
- **Google Ads:** match types and demand caps are good. Missing: Keyword Planner volumes, which `keywordMetrics` from organic could drive (G5); negative keywords; search-term report; tCPA readiness (15–30 conv/30d) shown in UI.
- **TikTok:** CPM $10 and link CTR scale 0.6 sit inside the research ranges; fatigue is 1.6× faster. Spark Ads come only through UGC whitelisting, which is fine.
- **LinkedIn:** CPM/CPC/CPL are good and the small audience saturates. Lead-gen-form leads should carry lower downstream quality: as a [design] value, lower MQL→SQL by ×0.6 vs website demo requests in the CRM.
- **UGC marketplace:** rates $150–300 and premium $400–650, 7–14 day delivery, 15% late, whitelisting at 25% per 30 days. Realistic.
- **Product Hunt / SEO tool / communities:** realistic shape; see G8 and G18 for the numbers.

## Top 10 (priority order)

G1 churn index bug · G2 per-ad-set scaling exploit · G3 annual plan priced as monthly / no plan mix · G4 creative re-roll · G5 duplicate keywords · G7 AI-wrapper world event pile-up · G8 DR runaway · G9 free referral rewards / double referral · G10 enterprise price unit mismatch and 0.4% demo rate · G6 wear without recovery.
