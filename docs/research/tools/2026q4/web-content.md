# Q4 2026 tools: website builders, SEO research, product video/demos (web-content)

Researched 2026-10-16. Tags: [verified: URL] = primary page fetched; [vendor]; [third-party] = comparison/affiliate blogs (prices conflict, re-check); [unverified]. Builds on docs/research/tools/t2-marketing.md (Framer/Webflow basics), tools/t10-vc-founders.md (Lovable ARR), seo/indie.md (Ahrefs/Semrush prices). Not repeated in depth.

## 0. Items that could not be verified
- **Bfaviero thread (x.com/Bfaviero/status/1391455629622001669, May 2021):** x.com returns HTTP 402, web.archive.org blocked, search found no copy. [unverified] Its list could NOT be extracted. Do not invent it. Action: caller should paste the thread text, or treat the AngelList-era 2021 stack generically (see section 6).
- **angellist.com/stack:** page now only lists AngelList's own products (RUVs/Rollups, cap table only for RUV/CV companies, fund admin: venture/rolling/scout funds, SPVs; data room; digital subscriptions; "AngelList Link"; related brands USVC, Meridian, Rollups). No startup-perks/tool-stack list remains. [verified: https://www.angellist.com/stack]. Verdict: the "stack" perks page is DEAD/repurposed; AngelList is now fund/SPV infrastructure, not a tool directory.

## 1. Website builders

### tips.io
- Status: real but tiny, not in common founder use. Show HN (Nov 2024): "Tips.io - a Tailwind playground with AI, page management, and theming" [third-party: https://hn.svelte.dev/item/42173119]. VS Code-based editor with Tailwind autocomplete, 5 AI models, edit one element rather than regenerating a section, reusable "slices" (global footers), hosted on subdomains via Cloudflare for SaaS (Cloudflare "built with" case study https://workers.cloudflare.com/built-with/projects/tipsio). Freemium, ~$15-20/mo [third-party: alternativeto]. tips.io itself returned 403 to the fetcher; I could not confirm it is still maintained in Q4 2026 [unverified]. "Low-code" is not its own term; it is HTML-first with AI edits.
- Verdict: OUTDATED/NICHE. Not modelled; Framer + Lovable cover the same niche.

### Reweb
- Status: active but pivoted. reweb.so now describes itself as an AI UI design tool that generates/edits designs and exports to code or Figma, and cross-promotes a sibling mobile-design product "Sleek" [verified: https://reweb.so]. Earlier it was a Next.js + Tailwind + shadcn visual builder, lifetime $129 [third-party: https://tailkits.com/tools/reweb/]. Could not tie it to the x.com/mattiapomelli post (no source names him) [unverified].
- Verdict: PIVOTED / niche; not a founder-stack default.

### Framer (KEEP, default marketing-site pick in 2026)
- Pricing [verified: https://www.framer.com/pricing]: Free (500 AI credits to try, framer domain, 1 GB); Basic $10/mo (custom domain, 30 pages, 2 CMS collections, 1,000 CMS items, 50 GB, 1,000 AI credits/mo); Pro $30/mo (150 pages, 10 collections, 2,500 items, 100 GB, 3,000 credits, staging, branching, redirects); Enterprise custom. Extra editors $20/mo, content editors $10/mo, viewers free. Add-ons: translation $20/locale, Convert A/B testing $50 per 500k events, advanced hosting $200. Agents use shared workspace AI credits; external agents free in preview. Per-site billing. One third-party says a Scale tier ($100 + usage) and price cuts in Oct 2025 and Jun 2026 [third-party: siter.io]; not on the official page, treat as [unverified].
- Paradigm: design-canvas-first (Figma-like). You drag frames, components, variants, set animations/effects visually; CMS is bolted on as collections. Hosting, SEO, localization, A/B (Convert add-on) are built in. No full code export. Fast for a designer-founder (landing page in hours), weak for big content sites.

### Webflow (KEEP-ALT, content/CMS and class-system site)
- Pricing [third-party, May 2026 restructure; official page fetch failed]: Starter free; Basic ~$15/mo annual (no CMS); Premium $25/mo annual / $39 monthly, merging old CMS+Business plans, 20,000 CMS items, 40 collections, ~50 GB bandwidth; new Team plan between self-serve and Enterprise; ecommerce plans separate; AI credits added to Workspace plans from 13 May 2026, enforced from 29 Jun 2026 [third-party: brixtemplates, digidop, costbench]. Re-verify.
- Paradigm: class-based visual HTML/CSS (Designer exposes the box model, Style classes, interactions), CMS collections with templates and references, clean HTML/CSS/JS export, multi-editor workflow. Rewards operators who understand CSS/structure; pays off with 100s of CMS pages (programmatic SEO, blog, changelog). Steeper learning curve; slower first page than Framer.

### AI-native site/app builders (prompt-to-app)
- **Lovable** (KEEP): paid Pro from $25/mo; free plan 5 daily credits (cap 30/mo) + 20 Cloud credits [verified: https://lovable.dev/pricing]. Credit cost varies by task (0.5 button color, 1.2 auth, 1.7 landing page with images; Plan Mode 1/msg); monthly credits expire after 2 months, top-ups 12 months; no refunds; unlimited seats, shared credits; you own code. Reported ~$500M run-rate and $13.3B valuation (Series C $400M, Aug 2026) [third-party roundup: https://resources.rework.com/tools/ai-coding/best-lovable-alternatives]; conflicting older figures exist; repo t10 file has ARR path. Reported outages Apr and Jun 2026 [third-party]. Paradigm: chat describes the whole app; generates React/Supabase-style full-stack with auth/DB ("Cloud"), GitHub sync; you iterate by prompting and burning credits. Failure modes: credit burn loops on bugs, spaghetti code at scale, security gaps in AI-generated auth/RLS [design note].
- **Bolt.new** (KEEP-ALT): Pro ~$20-25/mo, token-based; V2 (Oct 2025) added Bolt Cloud (DB, auth, storage, hosting) [third-party]; StackBlitz $105M Series B at $700M (Jan 2025).
- **v0 (Vercel)**: Plus ~$30/user/mo [third-party]; strongest at UI/React+shadcn component and page generation deployed to Vercel; developer-leaning.
- **Replit**: Core ~$20-25/mo, new $100 Pro, usage billed in arrears; est. ~$525M annualised revenue Apr 2026 [third-party]; agent builds and hosts full apps in browser.
- Rule for game: prompt-to-app tools produce a product MVP fast; they are not marketing-site tools. Marketing site = Framer/Webflow.

## 2. SEO research tools (existing model: seo/indie.md has Ahrefs Lite $129 / Standard $249 / Advanced $449, Brand Radar add-on from $199, Semrush ~$117-139/$208-249/$417-499, Ahrefs Webmaster Tools free; seo/effects-and-risks.md has Ahrefs/Semrush estimate-error stats, median 50-68% off vs GSC)
- **Ahrefs** (KEEP, backlink-index-first; best link data, Site Audit, Content Explorer, Rank Tracker, Brand Radar for AI visibility). Lite $129/mo, no free trial of paid [third-party]. Daily workflow: keyword explorer -> SERP overview (DR of ranking pages) -> content gap vs competitor -> backlink gap -> outreach list; weekly rank tracker check.
- **Semrush** (KEEP-ALT, broad marketing suite: keyword magic, position tracking, content/social/PPC toolkits, AI visibility add-ons). SEO Toolkit ~$140/$250/$500; "Semrush One" bundle with AI visibility ~$199-549 [third-party, conflicting]. 7-day trial. Fits teams doing SEO + paid + content together.
- **Keysearch** (KEEP-ALT for solo/indie): Starter ~$20-24/mo, Pro ~$40-48/mo [third-party]; official /pricing URL 404'd, so [unverified]. "8x cheaper" claim is a marketing line (vs Ahrefs $129 it is about 5-6x on list price). Smaller keyword/backlink DB; keyword difficulty score, SERP checker, rank tracking, competitor analysis; "Foresight" only on Pro. Paradigm: cheap keyword-difficulty finder for low-competition long tails; weaker backlink data, so link strategy is guesswork.
- **Ubersuggest** (declining/low-end): ~$29/$49/$99 monthly or lifetime ~$120-400 [third-party, conflicting]; 3 free searches/day. Neil Patel brand, easy UI, least reliable data.
- Free baseline: Google Search Console, Ahrefs Webmaster Tools (own site only), Google Keyword Planner.
- Paradigm contrast for game: data quality tier (Ahrefs/Semrush estimate error ~50-68% already modelled) vs price tier. A cheap tool should give noisier KD and no real backlink gap, so link-building decisions are worse; a pricey tool saves hours but a pre-seed founder burning $129/mo without publishing content is a waste (cost traceable). Founder hours: keyword research session 2-4 h; competitor gap 1-2 h.
- Newer 2025-26 category: AI-visibility/GEO tracking (Ahrefs Brand Radar, Semrush AI visibility, plus Profound/Peec-type tools [unverified]); covered in seo/llm-visibility.md.

## 3. Product video / demos
- **Capsule** (capsule.video; ACTIVE): $12M Series A Apr 2025 led by Innovation Endeavors with HubSpot Ventures; ~$19M total; CEO Champ Bennett; customers HubSpot, Instacart, ServiceNow; enterprise focus [third-party: https://www.wilmerhale.com/en/insights/news/20250417-capsule-captures-12m-in-series-a-funding; Capsule blog]. Pricing: enterprise custom, free business tier "coming soon" per June 2026 comparison [third-party: airframe.ai]. Paradigm: brand-locked "motion design systems" (After Effects-built templates) that non-editors fill with footage/text; AI co-producer suggests footage, titles, graphics. Good for marketing teams producing many on-brand videos; overkill and too pricey for pre-seed. Descript comparison page is vendor-written [vendor]. Verdict: KEEP-ALT (Series A+/marketing teams only).
- **Descript** (KEEP-ALT): text-based editing (edit transcript, video follows), filler-word removal, Studio Sound, Underlord AI. Sept 2025 pricing overhaul into AI-credit pools; Hobbyist ~$16-24, Creator ~$24-35/user/mo; Free 60 media minutes [third-party: sonix.ai, competitor]. Best for founders making talk-based content/podcasts/webinar clips.
- **Screen Studio** (KEEP for demo clips): macOS app that auto-zooms/smooths cursor on screen recordings; no hosting/share link, you export MP4/GIF. Price reports conflict: $29/mo or ~$108/yr [third-party: trainn]; one-time licence reports [unverified]. Its pricing URL 404'd. Paradigm: produce one polished demo for the landing page/X in ~30-60 min.
- **Arcade** (KEEP for interactive demos): captures clicks into clickable step-by-step demos, embeds on site/emails, analytics; Free (1-3 demos), Pro ~$32/mo, Growth ~$50/seat/mo; conflicting [third-party]. Paradigm: interactive "tour" not video; shortens sales cycles on pricing/landing pages and feeds outbound.
- **Loom** (Atlassian-owned; KEEP as async messaging): free Starter capped at 25 videos and 5 min each [verified: https://support.atlassian.com/loom/docs/starter-plan-faq/ via search]; Business ~$18/user, +AI ~$24 [third-party]. Async explainers, bug reports, outbound personalization. Gotcha: 25-video cap forces paid or deletion.
- **Tella** (KEEP-ALT): Pro $13/user/mo, Premium $19 annual; unlimited videos, 3,000/6,000 agent credits, 4K, custom domain at Premium, top-ups 10k credits/$10 [verified: https://www.tella.com/pricing]. Stylised screen+camera clips edited in browser with hosted player; the indie Loom replacement.
- Paradigm summary: Loom = send-now async message; Tella = lightly produced hosted clip; Screen Studio = cinematic cursor-zoom file; Arcade = clickable demo; Descript = transcript editing for long-form; Capsule = enterprise template system for volume on-brand output.

## 4. Operator-quality hooks (for the game)
- Stellar website operator: ships landing page with one clear promise, speed, schema/SEO basics, A/B variant via Framer Convert; mediocre: redesigns repeatedly, AI-generated copy unedited, no analytics. Webflow/CMS operator wins only if they publish consistently (content volume x quality).
- Stellar SEO operator: picks KD-low long tails with real intent, uses GSC as ground truth, ignores tool vanity metrics; mediocre buys Ahrefs, exports keyword lists, publishes thin content (5.7% top-10 in a year baseline).
- Stellar demo operator: 60-90s demo on the activation moment, subtitled, on landing page + in outbound; mediocre: 10-minute rambling Loom, no CTA.

## 5. Displaced / newer tools
- Prompt-to-app builders (Lovable, Bolt, v0, Replit) replaced "no-code + freelancer" MVP path; Lovable on Ramp May 2026 fastest-growing list (see t10 file).
- Framer replaced Webflow as default for pre-seed marketing sites (t2-marketing.md; roundups [third-party]). Carrd for single page.
- Reweb/tips.io-style Tailwind AI builders displaced by v0 / Lovable.

## 6. 2021-thread / AngelList-era tools likely outdated in 2026 (generic, [unverified] as to thread contents)
Anything typical of 2021 stacks to mark outdated: Google Optimize (shut down Sept 2023, already in t2 file), Webflow-only landing pages vs Framer, Unbounce-style builders, Hotjar-only analytics, Calendly-era scheduling, Slack-only support, Mailchimp, Drift, Zapier-only automation, Notion wiki-only, Intercom classic chat (replaced by AI agents). Not verified against the thread.

## Summary table
| tool | status | verdict | price (startup tier) | paradigm | key workflows | stage fit |
|---|---|---|---|---|---|---|
| Framer | active | KEEP | Free; Basic $10; Pro $30/mo [verified] | design-canvas-first, built-in hosting/CMS | edit sections, publish, A/B via Convert | pre-seed to Series A marketing site |
| Webflow | active | KEEP-ALT | Basic ~$15; Premium $25/mo annual [third-party] | class-based HTML/CSS + CMS, code export | CMS content, templates, SEO scale | seed+ content-heavy sites |
| Lovable | active, hyper-growth | KEEP | Pro $25/mo credit-based [verified] | chat prompt-to-fullstack app | prompt, test, burn credits, GitHub sync | pre-seed MVP |
| Bolt.new | active | KEEP-ALT | ~$20-25/mo tokens [third-party] | token-metered prompt-to-app, framework choice | same | pre-seed |
| v0 | active | KEEP-ALT | ~$30/user/mo [third-party] | UI/React gen on Vercel | UI pages, components | dev-founders |
| Replit | active | KEEP-ALT | Core ~$20-25; Pro $100 [third-party] | in-browser agent + hosting | build/host apps | pre-seed |
| tips.io | tiny, status unconfirmed | OUTDATED | ~$15-20/mo [third-party] | HTML+Tailwind editor w/ AI | n/a | none |
| Reweb | pivoted to AI UI design + export | OUTDATED/niche | unclear | AI design to code/Figma | n/a | none |
| Ahrefs | active | KEEP | Lite $129/mo [third-party] | backlink-index-first SEO | keyword + gap + backlinks | seed+ |
| Semrush | active | KEEP-ALT | ~$140/mo [third-party] | broad marketing suite | SEO+PPC+content | teams |
| Keysearch | active | KEEP-ALT (indie) | ~$20-48/mo [third-party] | cheap KD finder, thin data | keyword research | solo/pre-seed |
| Ubersuggest | declining | KEEP-ALT (low) | $29/mo or lifetime [third-party] | simple, noisy | ideas | hobby |
| Capsule | active, Series A | KEEP-ALT | enterprise custom [third-party] | brand-locked motion templates | marketing video at volume | Series A+ |
| Descript | active | KEEP-ALT | ~$16-35/mo [third-party] | text-based editing | edit talks/podcasts | any |
| Screen Studio | active (macOS) | KEEP | ~$9/mo annual [third-party] | auto-zoom recordings | landing-page demo | pre-seed+ |
| Arcade | active | KEEP | free; Pro ~$32; Growth ~$50/seat [third-party] | interactive click demo | embed demo | seed+ |
| Loom | Atlassian | KEEP | free (25 videos/5min); ~$18/user | async instant video | explainers, outbound | any |
| Tella | active | KEEP-ALT | Pro $13/user [verified] | hosted lightly produced clips | demos, updates | pre-seed |
| AngelList stack page | repurposed | DEAD (as tool list) | n/a | fund/SPV infra | n/a | n/a |
