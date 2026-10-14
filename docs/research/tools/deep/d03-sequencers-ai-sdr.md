# D03: Cold-email sequencers and AI SDRs (2026 deep dive)

Research date: 2026-10-14. Pricing figures change often and third-party sources disagree; re-check vendor pages before use. Tags: [unverified] = secondary sources only; [design] = my estimate.

Scope: Instantly, Smartlead (sequencers with inbox rotation, warmup, unibox), then AI SDR products 11x Alice, Artisan Ava, and Apollo (database plus sequencer with AI features). Apollo is included as the "others" example because it is the most common alternative a founder reaches for.

---

## 1. Instantly

**Summary.** Instantly is a cold-email sending platform aimed at founders, agencies and small outbound teams. Its core is unlimited connected sending accounts with built-in warmup, sequences, a unified reply inbox (Unibox), and, since 2025, a lead database (Instantly Lead Finder) and an AI Reply Agent. Positioning in 2026 is "all-in-one outbound": sending, warmup, lead data and AI replies in one subscription plus credits. Price tiers (primary page, accessed 2026-10-14, https://instantly.ai/pricing): Outreach plans Growth $47/mo (5,000 emails, 1,000 contacts, unlimited accounts and warmup); Hypergrowth listed at $97 in one table and $358 in another (the page is internally inconsistent, 125k emails/25k contacts in the comparison table); Light Speed $358/mo (500k emails, 100k contacts, SISR system). Bundles: Starter $94/mo (5k emails, 1k contacts, 1,500 Instantly credits, lead database, AI Sales Agent); Scale $194/mo (100k emails, 25k contacts, 5,000 credits, AI Reply Agent, Unibox replies, advanced deliverability); Agency $555/mo; Enterprise custom. Credit-only plans: Growth Credits $47 (1,500 credits), Supersonic and Hyper Credits $197 each (5,000 and 10,000 credits). Annual prices run about 10-20% lower. Read the credit row as the real cost driver: AI features draw from credits, and the page gives no per-credit price.

**Data model.**
- Account → Workspace (plan, credits balance, SISR/deliverability settings).
- Email account (mailbox): provider (Google/Microsoft OAuth or SMTP), from name, daily send limit, warmup on/off, warmup ramp settings, health score.
- Campaign: name, status (draft/active/paused), sequence steps (subject, body with spintax and variables, delay in days, condition branches), schedule (timezone, send windows, days), sending accounts attached, daily limit, stop-on-reply/stop-on-bounce settings, A/B variants per step.
- Lead: email, first/last name, company, custom variables (`{{firstName}}`, `{{companyName}}`, custom fields), status (active, completed, bounced, unsubscribed, replied, interested), campaign membership, per-step history.
- Unibox thread: lead, campaign, sending account, messages (inbound and outbound), labels (interest status, unread, AI category), assignee.
- AI Reply Agent config: qualification criteria, response templates, escalation rules, mode (autopilot or human-in-the-loop), category → action mapping.
- Credit ledger: each AI reply draw (5 credits per generated response per vendor docs, whether or not sent).

**Main workflows.**
1. **Setup and onboarding.** Sign up → add a domain you own (usually a secondary domain such as getX.com, not the primary) → add DNS records (SPF, DKIM, DMARC; the app shows the values to paste) → connect mailboxes via OAuth or SMTP → turn on warmup on each mailbox → let warmup run 2-4 weeks [design] → import leads (CSV or Lead Finder) → build campaign. Aha moment: warmup graphs and the inbox health score turning green, and the first positive reply landing in Unibox.
2. **Mailbox rotation.** In campaign settings, select several connected mailboxes; the platform spreads sends across them under per-account daily limits, so one mailbox does not carry the whole volume. The admin screen shows each account's sends, warmup status, and health. Daily limits are set per mailbox (commonly 20-30/day when warm [design]).
3. **Build a sequence.** Campaign → Sequence tab → add step, subject and body (rich text, `{{firstName}}` tokens, spintax `{Hi|Hey}`), delay (e.g., Day 0, Day 3, Day 7), optional A/B variant per step (split shows open/reply stats). Conditions: stop on reply, skip if already contacted.
4. **Lead import and list hygiene.** Leads tab → upload CSV (column mapping screen) or Lead Finder search (filters: title, company size, industry, location, keyword; returns contacts with verified-email status; consumes credits). Duplicate and bounce handling runs on import. Users are expected to verify lists before sending.
5. **Launch and monitor.** Set schedule (send windows, timezone, weekdays), set daily cap per campaign, press Launch. Dashboard shows sent, opened, replied, bounced, unsubscribed, plus a warning banner if bounce rate climbs.
6. **Daily loop: Unibox triage.** Unibox → filter by unread or interest status → open thread → read reply → either reply by hand, mark label (interested, not interested, OOO, wrong person), or let AI Reply Agent draft/send. Labels feed back into lead status (replied, interested) and stop the sequence for that lead.
7. **AI Reply Agent.** Settings → AI Reply Agent → set qualification criteria (free text, e.g., "book meeting if they name a time; forward if they ask pricing"), add response templates or let it draft, set escalation rule (e.g., route "interested" to human), choose autopilot or human approval. Agent categorizes incoming reply, drafts response, sends (autopilot) or queues (review). Each generated response costs 5 credits [vendor blog; unverified against help center].
8. **Warmup and reputation check.** Email accounts → warmup panel shows sent/received/inbox-rate counts and health score; users pause a mailbox that drops and let it re-warm.

**Automation and AI features.** Automated: sending cadence, mailbox rotation, warmup network traffic (vendor claims a private network of 4.2M+ accounts; the basic-vs-advanced warmup comparison in third-party reviews calls it "more basic" than Smartlead's [unverified]), stop-on-reply, labeling, lead status updates. AI: AI Reply Agent (categorize, draft, send, book meetings, update CRM statuses per vendor marketing), AI email writer (Growth Credits tier), web researcher agent (Growth Credits tier), AI Sales Agent (Starter). Human review points: autopilot off means every reply is queued; most users keep review on for positive replies [design]. Published accuracy: none found. Vendor says the agent "handles objections"; no independent reply-classification accuracy figures were found.

**Time saved and impact.** [design] Initial setup (DNS, domains, warmup wait, first list) is 4-8 hours of active work spread over 3-4 weeks, most of it waiting. Ongoing: 30-60 min/day for a founder doing sequences and manual Unibox triage; AI Reply Agent can cut triage to 10-15 min/day if autopilot is trusted for info requests only. Costs: plan $47-$194/mo + credits (5 credits per AI reply means 1,000 AI replies ≈ 5,000 credits, roughly $197 on Supersonic Credits list price) + mailboxes (~$3-$5/mo each at typical registrars, [design]) + domains (~$12/yr each) + verification.

**Failure modes.**
- Deliverability decay: sending before warmup completes, ramping too fast, or unverified lists. Vendor's own blog says "if you send to unverified lists, use spammy copy, or ramp too fast, no infrastructure saves you." Frequency: no published rate; practitioner consensus is that most first-time users hit a bounce or spam spike in the first month [unverified].
- Mailbox suspension by Google/Microsoft after spam-like behavior. Shared IP pools on standard plans (noted in third-party review) [unverified].
- Credit burn: AI features silently consume credits; "credits expire" noted in reviews [unverified].
- Wrong AI replies: the reply agent can send a generic answer to a nuanced reply; escalation rules are the only safeguard. Frequency unknown.
- Lead Finder data: contacts with stale titles and emails; bounce rates depend on verification; expect to re-verify.
- Hidden costs: separate charges for mailboxes, domains, CRM sync and verification (reviews).
- Pricing pages contradict each other (Hypergrowth at $97 vs $358; credit terms), so budgets slip.

**Integrations.** Google Workspace and Microsoft 365 (mailboxes); HubSpot, Salesforce, Pipedrive, Zapier and Make (CRM and automation, webhooks); Slack (AI Reply Agent notifications, per vendor); Instantly Lead Finder (internal data source); bring-your-own LLM key on several plans (per pricing page). Typical flow: Lead Finder or CSV → sequence → Unibox → Slack/CRM on positive label.

**Sources.**
- https://instantly.ai/pricing (accessed 2026-10-14; primary; internally inconsistent figures)
- https://instantly.ai/blog/best-ai-sales-agents-small-teams/ (updated 2026-06-10; vendor blog, AI Reply Agent description)
- https://instantly.ai/blog/instantly-smartlead-user-feedback (vendor-authored user-review summary, 500+ reviews claimed; use with caution)
- https://instantly.ai/get-started-with-instantly/lesson-6 (Instantly Academy, AI Reply Agent)
- https://marketbetter.ai/blog/instantly-pricing-breakdown-2026/ (third-party pricing, [unverified] for add-ons)
- https://www.landbase.com/blog/instantly-ai-pricing (2026-04-07; third-party)
- https://feedback.instantly.ai/changelog/unibox-optimization-ai-label-classification-system-update (2025-03-03 changelog)

---

## 2. Smartlead

**Summary.** Smartlead is a cold-email sequencer that competes directly with Instantly, positioned at agencies and high-volume senders. Its differentiators are unlimited mailbox connection, client workspaces, a master inbox across many accounts, and campaign-level AI lead categorization. Price tiers (primary source: https://www.smartlead.ai/pricing.md, as of 2026-07-28): Base $39/mo (2,000 contacts, 6,000 sends/mo, 2,000 verified emails at add-on $59/mo); Pro $94/mo (30,000 contacts, 90,000 sends); Unlimited Smart $174/mo (150,000 sends, 50k verified emails included); Unlimited Prime $379/mo (500,000 sends, 170k verified emails included). Annual billing is about 17% off. Mailboxes connect free and unlimited; buying mailboxes is a separate add-on (SmartSenders, roughly $4.50-$9 per mailbox per month plus domain fees). Warmup is included on every plan at different tiers (Foundation, Growth, Premium). Earlier third-party guides said warmup costs $59/mo; the current primary page does not support that, so treat as resolved in favor of "included" but check at purchase.

**Data model.**
- Workspace/client (agency sub-accounts, client workspaces at $29/mo each on the pricing page).
- Email account: provider, daily send limit, warmup profile (Foundation/Growth/Premium), reputation status.
- Campaign: sequence steps (subject, body, delay, A/B variants), schedule, sending accounts, settings including "Intelligent AI Lead Categorization" toggle.
- Lead (contact): email, custom fields, campaign status (in progress, completed, paused, blocked), category.
- Master inbox (unibox): threads across all campaigns and inboxes, with AI category labels, assignee, notes.
- Category: name, description, custom prompt for AI classification, sample-reply test set.
- Verification credits: separate ledger for email verification.

**Main workflows.**
1. **Setup.** Sign up → workspace → add mailboxes (Google/Microsoft OAuth or SMTP; the page says connections are unlimited) → set DNS for sending domains → warmup on each mailbox (choose profile) → wait 2-4 weeks [design]. Aha moment: warmup reaching target daily volume and the master inbox showing first replies.
2. **Create a campaign.** Campaigns → New → name → add leads (CSV upload or paste) → sequence builder (steps, subject, body with `{{first_name}}`, spintax, delay, A/B) → schedule (timezone, send windows) → email accounts (select mailboxes, daily limit each) → settings.
3. **Lead import.** Upload CSV with column mapping; duplicate detection; verification can run before send (credits). Lists land in the lead table with status column.
4. **Enable AI categorization.** Campaign → settings → General → toggle "Intelligent AI Lead Categorization" (help center article 150). Replies are parsed and assigned a category (interested, not interested, OOO, etc.). Custom categories: create category, write prompt, test with sample replies before saving (help center article 190). A third-party guide claims a 5-category cap on Pro and 10 on Custom with a GPT-4 key [unverified].
5. **Master inbox triage.** Master inbox → filter by category or campaign → open thread → reply inline, assign, add note, or change category. Replying from the inbox pauses the lead in that sequence.
6. **Launch and monitor.** Start campaign → dashboard with per-campaign sent, open, reply, bounce rates and per-mailbox health. Pause a mailbox if bounce or spam signals rise.
7. **Agency loop.** Client workspaces: each client gets a separate workspace with its own mailboxes and leads; shared master inbox lets the agency see all. Reports can be shared with clients.
8. **Deliverability test.** SmartDelivery (add-on from $49/mo, per primary pricing page) shows inbox placement per sending domain and flags drops. No official methodology page found [unverified].

**Automation and AI features.** Automated: sending, rotation, warmup, bounce handling, stop-on-reply, lead status, AI categorization (ML engine that parses every reply; campaign-level setting). AI-driven: lead categorization with custom prompts; "placement optimised copy" in SmartDelivery (add-on). The primary pricing page does not list a general AI reply writer or autonomous agent; the vendor's own "SmartAgents" page (https://www.smartlead.ai/smartlead-101/smartagents) describes agents but I did not verify their current scope. Human review: every reply is sent by a human or by a template unless the user adds automation (Smartlead has less autonomous sending than the Instantly AI Reply Agent based on the sources I checked [design]). Published accuracy numbers: none.

**Time saved and impact.** [design] Setup and warmup 4-8 hours active over 3-4 weeks. Triage with categories: 20-40 min/day for a solo founder with 50-100 replies/week. Agencies: largest value is multi-client inbox management, which saves hours per client per week, but no published figures.

**Costs.** Base $39 + verified emails add-on $59 + mailboxes (~$4.50-$9 each via SmartSenders, or bring your own) + domains + SmartDelivery $49 if wanted. Realistic setup for 10 mailboxes plus one client workspace: roughly $100-$150/mo on top of mailboxes and domains [design]. Third-party estimate: real spend 3-5x the sticker price [unverified].

**Failure modes.**
- Fair-use caps on "unlimited" mailboxes: a third-party review says Smartlead caps mailbox counts by tier (100/300/800) [unverified]. Check the terms.
- Shared IP pools on standard plans (third-party) [unverified]; deliverability hit when a neighbor is spammy.
- Mis-categorization by AI on sarcastic or ambiguous replies; accuracy not published.
- Category caps tied to plan (unverified).
- Verification credits run out mid-campaign, leaving leads unverified.
- Feature set changes frequently (SmartDelivery shipped April 2026 per a review [unverified]); help-center articles may lag.

**Integrations.** Google Workspace and Microsoft 365 (mailboxes), Zapier and Make (triggers on categories), webhooks and REST API (Pro and up per third-party summary [unverified]), CRM sync with HubSpot/Pipedrive through Zapier, Slack notifications. Typical flow: lead list (CSV or enrichment tool) → Smartlead sequence → master inbox → Zapier to CRM on "interested".

**Sources.**
- https://www.smartlead.ai/pricing.md (primary; as of 2026-07-28)
- https://helpcenter.smartlead.ai/en/articles/150-what-is-ai-categorization-and-how-does-it-work-with-smartlead (primary help center)
- https://helpcenter.smartlead.ai/en/articles/190-how-to-use-ai-to-categorize-leads-reply (primary help center)
- https://www.smartlead.ai/smartlead-101/smartagents (primary; scope unverified)
- https://www.joinvalley.co/blog/smartlead-pricing-explained-2026 (third-party; warmup add-on claim, superseded by primary)
- https://www.landbase.com/blog/smartlead-pricing (2026-04-25; third-party)
- https://bouncezero.io/smartlead-vs-instantly-2026 (third-party comparison)

---

## 3. 11x Alice (AI SDR)

**Summary.** 11x (founded 2022, backed by a16z and Benchmark per TechCrunch) sells "digital workers": Alice, an AI SDR that finds prospects, writes and sends multi-channel outreach (email and LinkedIn), and books meetings. Positioning: autonomous pipeline generation, replacing an SDR. Pricing is not public. Third-party figures conflict: one source lists Alice Growth at $3,750/mo (annual) for 2,000 prospects/mo; another says contracts typically start near $90,000/yr [unverified, sources disagree]. Contracts are annual; reviews report a required full annual commitment before validation [unverified]. Leadership changed in 2025: founder-CEO Sukkar stepped down (sources differ on timing) and CTO Prabhav Jain became CEO (per techannouncer and others [unverified]).

**Data model.**
- Workspace, ICP definition (industries, titles, company size, geos, tech stack).
- Prospect list (contacts + company, sourced from 11x's database and enrichment).
- Campaign/sequence: steps by channel (email, LinkedIn touch), timing, persona/voice settings.
- Message: draft, sent, opened, replied, status; approval queue if human review is enabled.
- Meeting: booked via calendar link, linked to CRM opportunity.
- Sending domains and mailboxes (customer-owned, connected to Alice's sending).
- CRM sync records (Salesforce/HubSpot).

**Main workflows.**
1. **Onboarding.** Kick-off call with 11x team (vendor-led); define ICP and value proposition; connect CRM; connect sending domains and mailboxes; set up domain and DNS; review first batch of drafts. Aha moment (per vendor pitch): Alice books a meeting without the founder doing outreach [design; unverified claim].
2. **Define ICP and sources.** Targeting screen: filter by title, industry, headcount, funding, tech. Alice builds a prospect list.
3. **Review first messages.** Approval queue shows Alice's drafted emails and LinkedIn messages with personalization fields; user approves, edits, or rejects. Reviewers note this step is where most quality control happens [unverified; Tomba review].
4. **Launch.** Start campaign; Alice sends within configured caps and send windows; LinkedIn actions run through connected accounts.
5. **Replies and meetings.** Alice classifies replies, answers common questions and books meetings to a calendar link; positive replies appear in the inbox for the rep.
6. **Weekly loop.** Review dashboard of meetings booked, reply rates, and deliverability; adjust ICP and messaging; approve new batches.

**Automation and AI features.** Automated: prospect sourcing, research and personalization, message drafting, multi-channel sequencing, reply handling, meeting booking, CRM logging. Human review: optional approval queue; many reviewers say the tool "rewards a hands-on operator" rather than running hands-off [unverified; reviews]. Published accuracy: none from 11x. Vendor-sourced: 11x disputed churn reporting and cited "79% retention" for recent cohorts (company-supplied, unverified).

**Time saved and impact.** Vendor pitch: replaces SDR headcount (roughly a $60-80k/yr salary). [design] Realistic time saved for a founder: setup and review can take several weeks; once running, perhaps 3-5 hours/week of review. Cost per meeting is not published.

**Failure modes.**
- Deliverability damage on customer domains, reported repeatedly in reviews [unverified frequency].
- Weak personalization and generic messaging; some outreach reaching wrong recipients. TechCrunch (2025-03-24) and secondary sources report automated emails sent to wrong customers [unverified detail].
- Customer-logo and ARR accuracy: TechCrunch reported 11x displayed logos of companies that said they were not customers, and counted full annual contract value as ARR even where customers had an approximately 90-day break clause. ZoomInfo and Airtable reportedly denied being customers [per TechCrunch snippet; not fully read].
- Churn: former employees told TechCrunch they were "losing 70-80% of customers that came through the door"; the company called figures "inaccurate and misleading" and cited 79% retention for recent cohorts. The churn number is second-hand and anonymous-sourced [unverified].
- Commitment risk: annual lock-in with limited validation period [unverified].
- Vague pricing and reported lack of transparency (Trustpilot reviewer quoted in a secondary source).
- Product reliability: a former engineer described product as "barely working" [unverified].

**Integrations.** Salesforce and HubSpot (CRM sync), Google and Microsoft mail, LinkedIn (via connected accounts), calendar tools (Google Calendar, Calendly-style links), Slack [design; not verified].

**Sources.**
- https://techcrunch.com/2025/03/24/a16z-and-benchmark-backed-11x-has-been-claiming-customers-it-doesnt-have (2025-03-24; primary report, only the lede and snippets were checked)
- https://sifted.eu/articles/11x-toxic-culture-ceo-working-nights-a16z (secondary, 2025)
- https://techannouncer.com/11x-faces-scrutiny-following-techcrunch-report-on-customer-claims/ (secondary summary)
- https://www.artisan.co/blog/11x-pricing-and-reviews (competitor blog; use with caution)
- https://tomba.io/blog/11x-pricing-reviews-pros-and-cons (2026 third-party)
- https://marketbetter.ai/blog/11x-ai-review-2026/ (2026 third-party)
- https://salesmotion.io/blog/turns-out-ai-sdrs-are-too-good-to-be-true-11x-might-face-legal-action (secondary)

---

## 4. Artisan Ava (AI SDR, "AI employee")

**Summary.** Artisan sells Ava, an "AI employee" for outbound: she builds prospect lists, writes and sends email and LinkedIn sequences, manages replies and books meetings. Positioning: BDR replacement with a "pipeline per dollar" pitch. Pricing is quote-based on the public page per most third-party sources; estimates range from about $500/mo (cited to Artisan's pricing page by one source) to $2,000-$5,000+/mo on higher tiers [unverified; figures conflict]. One source cites a $600/mo, $7,200/yr "Employee" package [via 11x blog, unverified]. Annual plans grant credits upfront; monthly plans roll unused credits forward [unverified].

**Data model.**
- Ava (agent) per workspace: ICP, persona, company context, brand voice.
- Prospect list (sourced from Artisan database; user imports CSV optional).
- Campaign: channels (email, LinkedIn), steps, timing, guardrails.
- Message and reply thread; review queue flag.
- Meeting booking records.
- Credits (usage metered; per-contact or per-action units [unverified]).
- Sending domains and mailboxes; LinkedIn accounts.

**Main workflows.**
1. **Onboarding.** Sales call with Artisan team; set up ICP, company knowledge base (website, product docs, case studies), voice and guardrails; connect mailboxes and LinkedIn; DNS and warmup handled with help of CS team (reviews praise hands-on CS [unverified]).
2. **Review first batch.** Ava drafts first emails; user reads and approves or edits; this is the step where teams catch "AI slop" tone.
3. **Launch.** Activate Ava; she sends on schedule within caps.
4. **Replies.** Ava responds to replies, handles FAQ-type replies and routes meeting-ready ones; positive replies appear for human follow-up.
5. **Weekly loop.** Dashboard: contacts reached, replies, meetings; adjust ICP and copy with CS team.

**Automation and AI features.** Automated: list building, personalization, sequencing across email and LinkedIn, reply handling, scheduling. Human review: approval mode during early weeks; reviewers say output quality is inconsistent and some campaigns need manual review before sending [Dashly G2 summary, unverified]. Published results: Artisan blog cites "pipeline at one-fifth the cost of a human BDR" and SaaStr 3.55% positive response rate after deploying Ava [vendor-sourced, unverified]. Independent index: 26 G2 reviews at 4.0/5 (small sample).

**Time saved and impact.** Vendor claim: one-fifth the cost of a BDR. [design] For a founder, setup involves the vendor team, so the founder's time is 3-6 hours over the first weeks, then 2-4 hours/week reviewing. Cost is far above Instantly/Smartlead; it only makes sense if the alternative is a human SDR.

**Failure modes.**
- Generic, machine-written emails; reviewers quote prospects spotting them immediately. A Reddit user quoted by a third-party blog said 1,000-1,400 emails produced zero replies [unverified, anecdotal].
- Poorly qualified meetings booked (review summary) [unverified].
- Deliverability and Outlook safe-sender issues in early campaigns [unverified].
- LinkedIn temporary restriction around December 2025 reported in one review, not verified against TechCrunch [unverified].
- Price opacity and annual contract commitment.
- Reliance on vendor CS; if CS changes, ramp is slow [design].

**Integrations.** Email (Gmail, Outlook), LinkedIn (connected accounts), CRM (Salesforce, HubSpot) for meeting logging, calendar tools for booking [design; not verified on primary page].

**Sources.**
- https://www.11x.ai/guides/artisan-review (competitor blog; 2026)
- https://www.11x.ai/guides/artisan-pricing (competitor blog; pricing claim)
- https://marketbetter.ai/blog/artisan-ai-pricing-2026/ (third-party; 2026)
- https://landbase.com/blog/artisan-ai-pricing (2026-04-07; third-party)
- https://www.dashly.io/tools/comparisons/artisan-vs-11x/ (aggregator, G2 summary)
- https://www.artisan.co/blog/the-best-ai-sdrs (vendor blog; SaaStr figure)
- https://theaiagentindex.com/agents/artisan-ava (independent index, G2 count)
- https://ghost.bitscale.ai/artisan-ai-review/ (competitor review)

---

## 5. Apollo.io (database + sequencer with AI features)

**Summary.** Apollo is a B2B contact database (275M+ contacts per vendor claim [unverified]) with built-in sequences, dialer and AI writing features. It is the most common "cheap AI SDR" substitute: a rep or founder uses Apollo for list and sequences, with AI assist. Positioning in 2026: all-in-one sales intelligence. I did not find a confirmed named Apollo "AI SDR" autonomous agent product in 2026; treat any claim of one as unverified. Price tiers per third-party sources (inconsistent, verify on apollo.io): Basic $49/mo annual or $59 monthly per user; Professional $79 annual or $99 monthly per user; Organization $119 annual or $149 monthly per user (3-user minimum) [unverified]. Credits: free tier credit amounts conflict across sources (50 to 100 to 720 per month reported) [unverified]. Mobile credit allotments more consistent: 75/100/200 per month per tier [unverified].

**Data model.**
- Account → users (seats) → saved searches → lists (contacts + accounts).
- Contact: name, title, company, email (verified status), phone, enrichment fields, owner, stage.
- Account (company): domain, size, industry, funding, tech stack.
- Sequence: steps (email, call task, LinkedIn task), delays, templates, owner, enrollment list.
- Task and activity log (calls, emails, meetings).
- Credits: email reveal and enrichment consume credits.

**Main workflows.**
1. **Setup.** Sign up → connect Gmail or Outlook → import or sync CRM (Salesforce/HubSpot) → set email signature and sending settings → install Chrome extension for LinkedIn enrichment.
2. **Search prospects.** Search → People or Companies → filters (title, seniority, company size, industry, location, technology, funding) → add to list. Aha: a list of 200 verified contacts in minutes.
3. **Reveal and verify.** Reveal email/phone (credits); verified status shown; bulk enrich.
4. **Build a sequence.** Sequences → New → steps (auto email, manual email, call, LinkedIn task), delays, templates with variables, AI writer for drafts.
5. **Enroll and send.** Enroll lists; sequence sends from connected mailbox with daily limits; tasks appear in the rep's queue.
6. **Daily loop.** Tasks view: calls, LinkedIn tasks, replies; reply handling in inbox; move opportunities through CRM stages.

**Automation and AI features.** Automated: list building, enrichment, email sends in sequences, task creation, CRM sync. AI: AI email writer, personalization snippets, call summaries, and AI-assisted sequence drafts [unverified scope]. Humans still build and manage sequences, per third-party comparisons. Published accuracy: none found.

**Time saved and impact.** [design] Setup 2-4 hours; list building from hours to minutes; daily task loop 30-60 min. Cost per user is low relative to AI SDRs, but credit overages can push active outbound teams to $150-$400/user/mo (third-party estimate, not official [unverified]).

**Failure modes.**
- Stale contact data; verified status is not a guarantee of deliverability.
- Credit exhaustion mid-campaign, especially when enrichment is bulk.
- Sending from a primary domain: deliverability damage (user responsibility, common [design]).
- Free-tier changes and reduced credits reported by users [unverified].
- Sequence sends from one mailbox are not rotated the way Instantly/Smartlead do it [design; verify].

**Integrations.** Salesforce, HubSpot, Gmail, Outlook, Zapier, LinkedIn Sales Navigator (via extension), Slack [design].

**Sources.**
- https://www.11x.ai/guides/apollo-io-pricing (competitor blog; pricing)
- https://www.joinvalley.co/blog/apollo-pricing-and-credits-explained-2026 (third-party)
- https://www.zeliq.com/blog/apolloio-pricing (third-party, 2026)
- https://www.marketbetter.ai/blog/apollo-io-pricing-breakdown-2026/ (third-party)
- https://prospeo.io/s/apolloio-pricing (competitor; pricing)
- https://costbench.com/compare/aisdr-vs-apollo/ (comparison; autonomy claim)

---

## Cross-tool synthesis

**Churn and complaints about AI SDRs (2026).**
- A figure of 50-70% annual churn for AI SDR tools is repeated across many vendor blogs, attributed to "UserGems 2026 tracking" [unverified; the originating report was not located]. Treat as a commonly repeated but unverified claim.
- 11x: TechCrunch (2025-03-24) reported churn of 70-80% claimed by former staff; 11x called these figures inaccurate and cited 79% cohort retention. Unresolved.
- Artisan Ava: reviews cite generic "AI slop" emails, zero-reply campaigns, and poorly qualified meetings. Aggregator rating 3.9/5 from 122 reviews (Dashly) [unverified].
- Reply-rate trend: one vendor source reports industry cold-email reply rates falling from 4.7% to 2.9% [unverified]. Vendor blog ranges for "signal-personalized" outreach are 15-25% [unverified, vendor claim].
- Most complaints cluster around: handoff quality (AI books a meeting but context is missing for the rep), generic personalization, deliverability decay, and unpredictable credit or contract costs. One vendor article cites $30k-$100k/yr contracts with unpredictable credits as hard to justify to CFOs [unverified].
- Reddit: I did not access primary r/sales or r/coldemail threads for these tools. Reddit evidence in this report is second-hand, so it is not usable as firm data.

**Sequencers vs AI SDRs.** Instantly and Smartlead are tools where the founder owns the list, copy and reply logic; the AI features are assists. 11x, Artisan and similar products sell outcomes, with the vendor running the setup. The sequencer path costs roughly $100-$300/mo plus mailboxes; the AI SDR path is quote-based and reportedly $7k-$100k+/yr. The deliverability risk is the same in both, and the vendor cannot fix a bad list or an unwarmed domain.

**Game-design notes for the clone (design).**
- Model warmup as a timed progress bar with a health score; a shortcut that ramps too fast should cause visible bounce spikes and mailbox suspension events.
- Credits should be a visible ledger on every AI action (AI reply = 5 credits).
- AI SDR "approval queue" should show drafts with a quality flag; a player who approves without reading should see a rising complaint/unsubscribe rate.
- Churn and results should be shown as cohort curves with ambiguity, not single numbers.

**Gaps.** No primary data on suspension rates for either sequencer. No independent reply-rate dataset. Apollo's AI scope is unconfirmed. Smartlead's SmartAgents scope unverified. Pricing for every tool needs a live check before use.
