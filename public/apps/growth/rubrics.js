// Scoring rubrics for the marketing and growth content judges (docs/research/judging/marketing.md).
// Each criterion is something observable on the page with 1/3/5 anchors; the LLM scores and quotes evidence,
// the GAME applies the fixed weights (core/rubric.js). Pure data plus two tiny helpers; no DOM.

import { weighted } from '../../core/rubric.js';

/** JSON-schema properties for a criteria list: one integer 1-5 per criterion (strict schema friendly). */
export function criteriaProps(criteria) {
  return Object.fromEntries(criteria.map((c) => [c.key, { type: 'integer', minimum: 1, maximum: 5, description: `1-5: ${c.label}` }]));
}
export const criteriaKeys = (criteria) => criteria.map((c) => c.key);

/** 0..1 skill from a panel of results that carry per-criterion scores; null when none do. */
export function rubricSkill(results, criteria) {
  const avg = {};
  for (const c of criteria) {
    const v = results.map((r) => Number(r?.[c.key])).filter(Number.isFinite);
    if (v.length) avg[c.key] = v.reduce((a, b) => a + b, 0) / v.length;
  }
  const w = weighted(avg, criteria);
  return w == null ? null : Math.min(1, Math.max(0, (w - 1) / 4));
}
export const to5 = (x10) => Math.min(5, Math.max(1, Math.round(x10 / 2)));

// --- Paid social ad, scored from the scroller's seat ("what makes you stop / tap") ---
export const AD_CRITERIA = [
  { key: 'hook_stop', label: 'what makes me stop: first 3 seconds / first line', weight: 0.25,
    anchors: { 1: 'opens with a logo, "Introducing", a generic question or a feature list; nothing here is about me', 3: 'a relevant claim or question, but it could open any ad in the category', 5: 'opens on a specific moment, number or pain I recognise ("23 books with two toddlers", a visible problem on screen); a pattern interrupt, not a slogan' } },
  { key: 'icp_match', label: 'is this for someone like me', weight: 0.2,
    anchors: { 1: 'could be anyone; or the audience description is pasted in ("busy parents who want to read more books")', 3: 'names my role or situation once', 5: 'shows my exact situation in my own words, with details only my kind of person would say' } },
  { key: 'concrete_promise', label: 'concrete outcome or proof', weight: 0.2,
    anchors: { 1: 'vague benefit words (better, easier, smarter), no number, no example', 3: 'one outcome or number, no proof it happens', 5: 'a number tied to a unit and a situation, a named result, a demo or a real customer line I can check' } },
  { key: 'clarity_offer', label: 'in one read: what it is, who for, what happens if I tap', weight: 0.2,
    anchors: { 1: 'after reading it all I cannot say what the product does', 3: 'I get the category but not the difference or the offer', 5: 'product, user and offer (trial, price, next step) are clear within the hook plus headline' } },
  { key: 'credibility', label: 'believable and policy-safe', weight: 0.1,
    anchors: { 1: 'guaranteed results, "are you [personal attribute]?", buzzwords, stock-ad tone', 3: 'plausible but polished like an ad', 5: 'native and plain-spoken, claims I would believe from a friend; nothing a reviewer would reject' } },
  { key: 'cta_fit', label: 'one clear next step that matches the offer', weight: 0.05,
    anchors: { 1: 'no next step, or the button contradicts the copy', 3: 'a default button (Learn More) with a vague ask', 5: 'one action named in the copy and matched by the button (Start free trial, Get the template)' } },
];

// --- UGC creator brief, scored by the creator who has to film it ---
export const BRIEF_CRITERIA = [
  { key: 'hook_options', label: 'hook options for the first 3 seconds', weight: 0.2,
    anchors: { 1: 'no hook, or "grab attention"', 3: 'one hook line', 5: 'three or more distinct hooks that differ in pain point or angle, each with a visual action and an opening line, so each video tests one' } },
  { key: 'viewer_pain', label: 'one specific viewer with one specific pain', weight: 0.2,
    anchors: { 1: 'targets "everyone" or lists features', 3: 'names the audience but the pain is generic', 5: 'one named viewer, a concrete situation and the before/after the creator can speak to from experience' } },
  { key: 'talking_points', label: '3-5 talking points, not a script', weight: 0.15,
    anchors: { 1: 'a word-for-word script, or nothing to say', 3: 'a long list of 8+ claims or a loose paragraph', 5: '3-5 short points with the must-say items (product name, offer) marked separately; tone left to the creator' } },
  { key: 'shots_format', label: 'format, length and shots', weight: 0.15,
    anchors: { 1: 'no length, aspect ratio or shots', 3: 'length or format given, no shots', 5: 'length, 9:16 or other ratio, product on screen in the first seconds, screen-record or demo moments, lighting/setting notes' } },
  { key: 'dos_donts', label: "dos and don'ts, claims and disclosure", weight: 0.15,
    anchors: { 1: 'none; creator may invent claims', 3: 'generic ("be authentic")', 5: 'banned claims and competitor names, required disclosure (#ad or platform paid-partnership label), what proof the creator may and may not state' } },
  { key: 'deliverables_cta', label: 'deliverables, rights and call to action', weight: 0.15,
    anchors: { 1: 'no count, deadline, rights or CTA', 3: 'count and CTA, rights or revisions missing', 5: 'number of videos, raw vs final, revision rounds, deadline, usage rights and paid-ads whitelisting terms, one CTA' } },
];

// --- Founder social post (LinkedIn / X / launch announcement), scored by a reader in the feed ---
export const POST_CRITERIA = [
  { key: 'hook_line', label: 'first line makes me read on', weight: 0.2,
    anchors: { 1: '"I\'m thrilled to announce", "Here are 5 lessons", a throat-clear', 3: 'a clear topic line with no tension', 5: 'a specific claim, number or turning point in the first line that is cut off before the answer' } },
  { key: 'specific_story', label: 'real numbers, names and events', weight: 0.25,
    anchors: { 1: 'abstract advice with no event behind it', 3: 'one real detail', 5: 'a dated event with numbers (price, MRR, hours, count), what was tried, what failed' } },
  { key: 'founder_voice', label: 'sounds like one person who did it', weight: 0.15,
    anchors: { 1: 'AI-sounding or LinkedIn-bro formula ("Let that sink in", broetry, hashtags stack)', 3: 'plain but interchangeable', 5: 'first-person, opinionated, admits what went wrong, phrases only this founder would write' } },
  { key: 'reader_value', label: 'useful to a reader who does not care about the product', weight: 0.2,
    anchors: { 1: 'only useful to the author', 3: 'a takeaway the reader has seen many times', 5: 'one transferable lesson, number or template the reader can use today' } },
  { key: 'promo_balance', label: 'ask is earned and small', weight: 0.1,
    anchors: { 1: 'sells in every line, "link in bio", discount codes, engagement bait ("comment YES")', 3: 'one clear link or ask, but it dominates', 5: 'no ask or one soft ask after value was delivered; at most one link' } },
  { key: 'platform_fit', label: 'fits the feed it is in', weight: 0.1,
    anchors: { 1: 'wall of text with no line breaks, or one line on LinkedIn; thread pasted as an essay on X', 3: 'readable, a little long or short for the feed', 5: 'scannable breaks, length that suits the platform, nothing that needs a click to make sense' } },
];

// --- Community post (Reddit / Discord / Slack), scored by a long-time member and part-time moderator ---
export const COMMUNITY_CRITERIA = [
  { key: 'rules_fit', label: 'fits this community\'s rules and topic', weight: 0.2,
    anchors: { 1: 'off-topic or breaks the stated promo rules (link-first post, wrong flair, wrong day)', 3: 'on topic, rules not visibly considered', 5: 'on topic, uses the right format/flair/thread, and shows the author read the rules' } },
  { key: 'give_first', label: 'useful with no click and no purchase', weight: 0.25,
    anchors: { 1: 'nothing here for me unless I open the link or buy', 3: 'a partial answer that teases the rest elsewhere', 5: 'a complete, specific answer or resource inside the post that I would save even if the product vanished' } },
  { key: 'disclosure', label: 'honest about who the author is', weight: 0.15,
    anchors: { 1: 'poses as an unconnected user or hides the affiliation', 3: 'affiliation findable in the profile only', 5: 'says plainly "I make X" where relevant and mentions the product only if it answers the question' } },
  { key: 'promo_ratio', label: 'self-promotion proportion', weight: 0.2,
    anchors: { 1: 'link or product name is the point; an account that only posts about its product', 3: 'one link or mention among real content', 5: 'no link needed; the product, if named, takes under 10% of the text' } },
  { key: 'earned_experience', label: 'first-hand specifics', weight: 0.1,
    anchors: { 1: 'generic advice anyone could paste', 3: 'some detail', 5: 'numbers, mistakes, named tools and trade-offs from doing it' } },
  { key: 'invites_discussion', label: 'asks a real question and engages', weight: 0.1,
    anchors: { 1: 'broadcast; no question', 3: 'a generic "thoughts?"', 5: 'a specific question the author does not know the answer to; ready to answer replies without pitching' } },
];

// --- SEO / GEO article, scored by an editor applying search-quality and AI-citation criteria ---
export const ARTICLE_CRITERIA = [
  { key: 'intent_match', label: 'answers exactly what the query wants', weight: 0.2,
    anchors: { 1: 'about the topic but not the question; query words stuffed into title and headings', 3: 'answers the query after a long preamble', 5: 'a direct answer in the first 100 words, then the detail; format matches intent (comparison, how-to, list)' } },
  { key: 'first_hand_experience', label: 'first-hand experience and original data', weight: 0.25,
    anchors: { 1: 'restates what the top 10 results say', 3: 'a few own examples', 5: 'we tested/ran/measured: own numbers, screenshots, method stated, opinions not found in competing pages' } },
  { key: 'depth_accuracy', label: 'depth and accuracy', weight: 0.15,
    anchors: { 1: 'thin or wrong; claims with no support', 3: 'covers the main points, shallow on trade-offs', 5: 'covers sub-questions and edge cases, states limits and when the advice fails; claims check out' } },
  { key: 'citable_structure', label: 'structure an answer engine can quote', weight: 0.15,
    anchors: { 1: 'wall of text, no headings or definitions', 3: 'headings, facts buried in paragraphs', 5: 'question-style headings, self-contained answer paragraphs, tables, dated statistics with named sources' } },
  { key: 'trust_signals', label: 'who wrote it, sources and bias disclosed', weight: 0.15,
    anchors: { 1: 'no author, no sources; affiliate or own-product bias hidden', 3: 'author named or some links', 5: 'named author with relevant experience, dated, sources linked, conflict of interest stated (it is our product)' } },
  { key: 'no_filler', label: 'no padding, stuffing or AI filler', weight: 0.1,
    anchors: { 1: 'repeats the keyword, filler openers ("In today\'s fast-paced world"), length for its own sake', 3: 'some padding', 5: 'every paragraph adds something; length follows the answer, not a word count' } },
];

// --- App Store listing (Apple limits: name 30, subtitle 30, keyword field 100) ---
export const ASO_CRITERIA = [
  { key: 'title_clarity', label: 'name carries brand plus the one search term', weight: 0.2,
    anchors: { 1: 'brand only with no hint of the category, or a string of keywords', 3: 'brand plus a generic category word', 5: 'distinct brand plus the highest-intent phrase, readable, within 30 characters' } },
  { key: 'subtitle_benefit', label: 'subtitle states the outcome for the user', weight: 0.2,
    anchors: { 1: 'empty, repeats the name, or a keyword list', 3: 'describes the feature set', 5: 'a plain sentence with a benefit and a second keyword phrase not already in the name, within 30 characters' } },
  { key: 'keyword_field', label: 'keyword field uses all 100 characters without waste', weight: 0.25,
    anchors: { 1: 'empty, or repeats words already in name/subtitle, spaces after commas, or competitor brands', 3: 'relevant terms but with duplicates or under 60 characters', 5: 'about 90-100 characters of distinct, relevant terms, comma-separated without spaces, nothing duplicated from name/subtitle' } },
  { key: 'description_hook', label: 'first lines of the description convert', weight: 0.15,
    anchors: { 1: 'blank or a feature dump; boilerplate', 3: 'says what the app is', 5: 'opens with the user problem and a concrete result before the fold; proof or numbers; no pricing or competitor claims' } },
  { key: 'audience_match', label: 'a searcher in the target group recognises it', weight: 0.1,
    anchors: { 1: 'wrong audience or terms nobody searches', 3: 'right category', 5: 'uses the words the target user types' } },
  { key: 'guideline_safe', label: 'follows store guidelines', weight: 0.1,
    anchors: { 1: 'competitor names, pricing, "#1", repeated terms, over-length fields (rejection or demotion risk)', 3: 'borderline term', 5: 'accurate, no trademarks of others, no stuffing' } },
];

// --- Landing page, scored by the visitor persona skimming it ---
export const LANDING_CRITERIA = [
  { key: 'value_prop_5s', label: 'in 5 seconds: what it is, who for, why switch', weight: 0.25,
    anchors: { 1: 'headline is a slogan or buzzword ("Transform your workflow"); I cannot say what it does', 3: 'I get what it is but not why it beats what I use', 5: 'headline plus subhead name the user, the outcome and the mechanism; a product visual shows the real UI' } },
  { key: 'icp_relevance', label: 'speaks to my problem', weight: 0.15,
    anchors: { 1: 'generic for any customer', 3: 'names my industry or role', 5: 'uses my vocabulary, my job-to-be-done and a use case I recognise' } },
  { key: 'proof', label: 'specific proof above and near the CTA', weight: 0.25,
    anchors: { 1: 'no proof, or anonymous "trusted by thousands"', 3: 'logos or a generic testimonial', 5: 'named customer quote with a measured result, case study link, review count/rating, near the first CTA' } },
  { key: 'offer_cta', label: 'one primary action with low friction', weight: 0.15,
    anchors: { 1: 'no clear action, or five competing buttons', 3: 'a CTA, but vague ("Submit") or asks for too much', 5: 'one primary CTA repeated in the same place, says what happens next, a free trial or demo path without card or long form' } },
  { key: 'price_objections', label: 'pricing and objections answered', weight: 0.1,
    anchors: { 1: 'no price, no FAQ, no security/integration info', 3: 'price or FAQ', 5: 'pricing visible or the reason it is hidden, FAQ for switching/security/cancel, guarantee or trial terms' } },
  { key: 'specific_plain_copy', label: 'plain specific copy, not hype', weight: 0.1,
    anchors: { 1: 'buzzwords and superlatives with no number', 3: 'mixed', 5: 'numbers, nouns and verbs a customer would say' } },
];

// --- Newsletter issue, scored by a skeptical editor/reader ---
export const NEWSLETTER_CRITERIA = [
  { key: 'one_idea', label: 'one idea developed with an example', weight: 0.2,
    anchors: { 1: 'link dump or five topics; I cannot say what it was about', 3: 'a main idea plus tangents', 5: 'one idea, one worked example, a clear takeaway' } },
  { key: 'specific_evidence', label: 'real numbers, screenshots, teardown detail', weight: 0.25,
    anchors: { 1: 'generic advice anyone could write', 3: 'a couple of numbers', 5: 'own data, a named case, a teardown I could not get elsewhere' } },
  { key: 'voice_consistency', label: 'a human voice and a reason to open next week', weight: 0.15,
    anchors: { 1: 'corporate or AI-flavoured filler; apologises for gaps', 3: 'readable but interchangeable', 5: 'distinct opinionated voice; recurring section or promise that matches earlier issues' } },
  { key: 'cta_discipline', label: 'at most one soft call to action', weight: 0.2,
    anchors: { 1: 'sells the product throughout, several CTAs, urgency tricks', 3: 'one CTA that dominates the issue', 5: 'value first; one soft CTA at the end that relates to the idea' } },
  { key: 'subject_body_match', label: 'subject is plain, specific and honest', weight: 0.1,
    anchors: { 1: 'clickbait the body does not pay off, shouting, over nine words', 3: 'generic but fine', 5: 'specific promise under nine words that the first paragraph delivers' } },
  { key: 'scannable_length', label: 'length and layout fit a skim', weight: 0.1,
    anchors: { 1: 'under 120 words or a 2,000-word wall', 3: 'right length, dense paragraphs', 5: 'roughly 300-1,000 words, short paragraphs, headers or bold takeaway for skimmers' } },
];

/** Extend a strict JSON schema with the rubric's integer scores and an evidence field (all required). */
export function withRubric(schema, criteria) {
  return {
    ...schema,
    required: [...schema.required, ...criteriaKeys(criteria), 'evidence'],
    properties: { ...schema.properties, ...criteriaProps(criteria), evidence: { type: 'string', description: 'One or two short exact quotes behind your lowest scores (or name the missing element). Under 45 words.' } },
  };
}
