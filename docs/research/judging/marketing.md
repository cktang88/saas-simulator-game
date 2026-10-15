# Judging rubrics: marketing and growth content

Scope: `ad_creative_review`, `ugc_brief_review`, `social_post_review`, `community_post_review`, `seo_article_review`, `aso_listing_review` (public/apps/growth/judges.js), `landing_page_review` (public/apps/website.js), `newsletter_issue_judge` (public/apps/audience/judge.js). Criteria with 1/3/5 anchors live in `public/apps/growth/rubrics.js`; the model scores 1-5 per criterion and quotes evidence, the game applies fixed weights (`core/rubric.js`). Existing holistic fields are kept (consumers read them); the final skill blends holistic and rubric (40-50% rubric) so one odd number cannot swing an outcome. Offline fallbacks return the same per-criterion fields.

Marking: [verified] = read at a primary or near-primary source this session; [secondary] = vendor or agency blog, directional; [unverified] = could not confirm; [design] = game assumption.

## Shared anti-gaming rules
- Length, repeated keywords, buzzwords, emoji/hashtag stacks and pasted ICP descriptions never raise a score; each rubric names the cap in its anchors and each prompt says "earns nothing".
- Every low score must quote the offending words or name the missing element (`evidence` field).
- Policy-risk copy (guaranteed results, "are you [personal attribute]") caps credibility at 1-2 (existing `policyCheck`).
- Mistakes carry consequences: generic or stuffed copy lowers skill, which lowers CTR/ranking/reach; stuffed ASO takes a flat -0.4; salesy posts and stealth ads lower reach and raise report risk.

## 1. Ad creative (`ad_creative_review`)
What it judges: a Meta/TikTok-style ad, read from the scroller's seat (hook, primary text, headline, button). Gap before: "judge it as you would in real life" with four unanchored 1-10 numbers.
Criteria (weights): hook_stop .25, icp_match .20, concrete_promise .20, clarity_offer .20, credibility .10, cta_fit .05. Audience persona stays in character: "what makes me stop / tap".
Benchmarks: hook rate (3-second plays / impressions) weak under 20-25%, solid 25-35%, strong above 35%; hold rate (15s plays / 3s plays) 40-50% typical, over 60% strong. Agencies disagree and none are platform-official, so use them for direction only [secondary]: https://motionapp.com/blog/key-creative-performance-metrics (2025), https://billo.app/blog/hook-rate-to-hold-rate (2025), https://jetfuel.agency/creative-performance-metrics-for-dtc-video-ads-hold-rate-thumbstop-and-thruplay-benchmarks-2026/ (2026). Already in docs/research/marketing-and-ads.md.
Anti-gaming: ICP keyword density above 30% is "pasted audience" and caps hook/relevance (existing `icpDensity`); buzzword hits cut credibility; a hook with no verb is capped.

## 2. UGC brief (`ugc_brief_review`)
What it judges: the brief a founder hands a creator, scored by the creator who must film it.
Criteria: hook_options .20, viewer_pain .20, talking_points .15, shots_format .15, dos_donts .15, deliverables_cta .15.
Evidence from practitioner templates [secondary]: three or more distinct hooks, one per video, differing by pain or angle, each with a visual action plus an opening line; 3-5 talking points, not a word-for-word script (scripts sound read); must-say items (product name, offer) marked separately; dos and don'ts incl. banned claims and competitors and required disclosure (#ad / paid-partnership label); deliverables (count, ratio, length, raw vs final, revision rounds, usage rights). Sources: https://www.cinerads.com/blog/ugc-creator-brief-template (2026), https://collabstr.com/blog/how-to-brief-a-ugc-creator, https://insense.pro/blog/ugc-brief, https://www.influentials.com/knowledge/for-brands/what-to-put-in-a-brief-and-what-to-let-go. These are vendor blogs; the exact numbers (3 hooks, 3-5 points) are one reasonable convention, not a standard [design for the thresholds].
Anti-gaming: a long brief of 8+ claims scores low on talking_points; buzzwords reduce hook_options and viewer_pain.

## 3. Social post (`social_post_review`)
What it judges: founder posts on LinkedIn/X (build in public, launch, release, Show HN, Product Hunt copy), scored by a feed reader.
Criteria: hook_line .20, specific_story .25, founder_voice .15, reader_value .20, promo_balance .10, platform_fit .10.
Evidence: Van der Blom's Just Connecting LinkedIn algorithm research (2020 edition, primary [verified]): dwell time rewards documents (+40-60%) and video (+20-40%); under three lines lost about 20%; posts with 2 links lost ~25% reach and 3+ links ~40%; add a link by editing after posting, avoid first-comment links; a comment carries about double a like. Source: https://www.slideshare.net/RichardvdBlom/linkedin-algorithm-research-2020-by-just-connecting . Later editions' figures (hashtags -29%, one external link -68%, comments within 5 minutes 4.2x) are [unverified], not used for thresholds. "Dwell time outranks likes" in 2026 is third-party inference [unverified]. Engagement bait ("comment YES") and formulaic posts are penalised in promo_balance/founder_voice [design].
Anti-gaming: hashtag stacks, emoji, bait phrases and link count lower scores; length alone does not raise reader_value.

## 4. Community post (`community_post_review`)
What it judges: Reddit/Discord/Slack posts by a founder, scored by a long-time member and part-time moderator.
Criteria: rules_fit .20, give_first .25, disclosure .15, promo_ratio .20, earned_experience .10, invites_discussion .10.
Evidence [secondary, Reddit's own help pages not reached]: "90/10" is a community convention drawn from reddiquette's spirit ("a redditor with a website, not a website with a Reddit account"), not a Reddit rule with a number; mods check profile history; some subreddits ban all promotion or enforce ~99/1; sitewide Content Policy rule 2 bans spam and vote manipulation. Sources: https://redship.io/blog/reddit-self-promotion-rules-2026 , https://gleam.io/faq/marketing-and-growth-strategies/promotion/reddit-90-10-rule-explained . Check each subreddit's sidebar rules [design: the game's `wouldReport` follows this].
Anti-gaming: link or product name does not equal helpfulness; undisclosed affiliation scores 1-2 on disclosure and raises report probability.

## 5. SEO / GEO article (`seo_article_review`)
What it judges: a page for a target query; outputs quality, slop, informational flag and citability.
Criteria: intent_match .20, first_hand_experience .25, depth_accuracy .15, citable_structure .15, trust_signals .15, no_filler .10.
Evidence: Google's Search Quality Rater Guidelines added "Experience" in Dec 2022 (E-E-A-T), with Trust as the most important member; raters judge whether content shows real use or a described personal experience; E-E-A-T is a rater concept, not a direct ranking signal [secondary, guidelines PDF not opened]: https://searchengineland.com/google-doubles-up-at-e-with-updated-search-quality-raters-guidelines-e-e-a-t-390343 (2022). GEO: Aggarwal et al., "GEO: Generative Engine Optimization", KDD 2024, GEO-bench of 10,000 queries: adding citations, quotations and statistics raised visibility in generative answers by up to ~40%, keyword stuffing did not help [verified at abstract level; per-tactic percentages unverified]: https://collaborate.princeton.edu/en/publications/geo-generative-engine-optimization/ . AI-chatbot traffic share (Ahrefs 0.28%) is already in marketing-and-ads.md.
Anti-gaming: query repeated more than 3 times per 100 words caps intent_match and no_filler; slop phrases (existing `SLOP`) cut no_filler; length without numbers is penalised.

## 6. App Store listing (`aso_listing_review`)
What it judges: title, subtitle, keyword field, description; outputs score and feedback.
Criteria: title_clarity .20, subtitle_benefit .20, keyword_field .25, description_hook .15, audience_match .10, guideline_safe .10.
Evidence [secondary; Apple pages not fetched]: name and subtitle 30 characters, keyword field 100 (bytes for some scripts), comma-separated, hidden but indexed; words already in the name/subtitle are indexed so repeating them wastes keyword characters; App Review Guideline 2.3.7 prohibits keyword stuffing, others' trademarks, popular app names and pricing in metadata. Sources: https://www.applaunchflow.com/blog/app-store-metadata-character-limits-2026 , https://phiture.com/asostack/app-store-introduces-50-character-limit-of-app-names-138477cbf92b/ (the 50-character name limit story is [unverified] and the game keeps 30). Description is not indexed on iOS [unverified, so it only feeds conversion criteria].
Anti-gaming: stuffing (4+ repeats, duplicates, over-length, competitor words, "#1") takes a flat -0.4 after the weighted blend.

## 7. Landing page (`landing_page_review`)
What it judges: the site as a skimming visitor persona; outputs clarity/relevance/credibility, trial probability, WTP, sets website fit.
Criteria: value_prop_5s .25, icp_relevance .15, proof .25, offer_cta .15, price_objections .10, specific_plain_copy .10. The old clarity/relevance/credibility fields remain; quality = 50% holistic + 50% rubric before the existing log-scale trial blend.
Evidence: Unbounce Conversion Benchmark Report (Q4 2024, ~41k pages): median 6.6% all industries, SaaS 3.8%, top quartile 11.4% (via ClickMinded) [secondary], already in marketing-and-ads.md and plg-email/p3. Practitioner consensus [secondary, no controlled study found]: one-sentence value prop above the fold, specific proof (named case studies with metrics) near the first CTA, one primary action repeated in the same place; the "single CTA" rule is contested, so the rubric rewards one primary action, not zero repeats. Sources found: https://testimonial.to/resources/landing-page-optimization-best-practices , https://clicksgeek.com/conversion-rate-optimization-for-landing-pages/ . CXL-specific studies not reached [unverified].
Anti-gaming: buzzwords cut specific_plain_copy; "trusted by thousands" without a named source scores 1-2 on proof; page length earns nothing.

## 8. Newsletter issue (`newsletter_issue_judge`)
What it judges: one issue (subject plus body), previously a single 0-1 score and a fix. Now six criteria; `score` is computed from the weights, `fix` is the editor's first change.
Criteria: one_idea .20, specific_evidence .25, voice_consistency .15, cta_discipline .20, subject_body_match .10, scannable_length .10.
Evidence: judge on clicks and click-to-open, not opens (Apple Mail Privacy Protection inflates opens): CTOR typical 10-15%, good 15-25%, excellent 25%+ [secondary: https://help.rasa.io/industry-benchmarks]; Omnisend 2025: 30.4% open, 0.74% click-through, 0.20% unsubscribe (already in p3-lists-newsletters.md). Single-CTA advice is common but no rigorous study was found [unverified]; the game keeps it as `cta_discipline` and the existing `lintIssue` pitch-ratio rule. No controlled study of subject-line length vs clicks was found [unverified]; the nine-word limit stays a [design] rule from `lintIssue`.
Anti-gaming: shouting, over-long subjects, and filler openers lower scores; a pitch ratio above 1 pitch per 150 words drops cta_discipline to 1.

## Open gaps
- Meta/TikTok/Apple/Reddit primary documents were not fetched (search results only); thresholds quoted as ranges.
- Weights are [design]; they put the criterion closest to the observed outcome driver (hook, proof, first-hand evidence, keyword field) highest.
