# D08: Lifecycle email and social scheduling tools (deep dive, 2026)

Research date: 2026-10-14. Confidence tags: [official] = fetched from vendor page or docs this session; [secondary] = aggregator or vendor blog, verify before relying on it; [unverified] = only secondary sources, or a vendor claim with no method; [design] = my estimate for the simulator.

Scope: Loops, Customer.io, Kit, Typefully, Buffer, plus lifecycle sequences (welcome, activation, trial ending, dunning, win-back).

Caveat on confidence: Loops, Customer.io and Buffer prices were read from vendor pages. Kit prices are from aggregators. Typefully's official pricing page could not be read (no plan content came back), so its tiers are unverified. Several Customer.io and Kit feature details are also secondary.

---

## 1. Loops (loops.so)

**Summary.** Loops is a transactional-plus-marketing email platform for SaaS founders, aimed at product-led companies that want to send onboarding, lifecycle and newsletter email from one place with a developer-friendly API. The automation feature was renamed from "Loops" to "Workflows" (changelog, undated [secondary]). Official pricing [official, loops.so/pricing, accessed 2026-10-14]: Free is $0 with up to 1,000 subscribed contacts, 4,000 marketing plus transactional sends per rolling 30 days (to the first 1,000 contacts), 10 emails per second, and a "Powered by Loops" footer. Growth is $49/month for up to 5,000 contacts, with unlimited sends, no branding, and 1,000 emails per second. Enterprise is custom, for 1.5M+ contacts. Unsubscribed contacts do not count on paid plans, and seats are not charged. One aggregator reports a September 2026 change to free-tier limits [secondary]. This conflicts with the official page, so trust the official page.

**Data model.**
- Contact: email (key), subscribed flag, default properties (firstName, userGroup, source), custom properties (typed: string, number, date, boolean), and an event history.
- Contact property vs event: properties are current state; events are timestamped actions sent via the API that can trigger workflows.
- Audience filter: a boolean rule over contact properties and campaign or workflow activity (sent, opened, clicked). A saved filter is a segment, reusable across workflows and campaigns.
- Workflow: a trigger (event, contact property change, or API entry) plus a graph of nodes: email, delay, branch, and audience filter. Branch nodes route each contact to the first filter it matches; a contact that matches none exits.
- Campaign: a one-off broadcast to a filter or segment, with optional split testing (split testing was announced to all users with no extra charge, changelog dated 2025-06-03).
- Transactional: an API-triggered single send with a template. It shares the free-tier quota.

**Main workflows.**
1. Setup: Sign up, add the domain and verify DNS (SPF/DKIM). Install the snippet or send contacts via the API. Create a custom property or two.
2. Import or sync: Send contacts from the app via API when a user signs up, with an event such as signed_up and properties such as plan and userGroup.
3. Build a workflow: Click New Workflow, choose the trigger (event signed_up), add an email node with a template, a 1-day delay, a branch on "has done activated_project event", and an email in each branch. Save and publish. The workflow then enrolls contacts as events arrive.
4. Build a segment: Open Audience, add filters (userGroup = trial AND NOT clicked "upgrade" in last 14 days), save as a segment, and reuse it in a campaign.
5. Broadcast campaign: Compose the email, pick a segment, set an A/B split on subject, send or schedule.
6. Daily loop: Check workflow stats (enrolled, sent, opened, clicked per node), fix broken templates, and review unsubscribes. There is little daily work beyond this.
7. Aha moment: Watching a contact fall into the right branch in the workflow inspector after a real event fires.

**Automation and AI.** Automation is event and property driven, not AI-driven. The CLI and API can create workflows programmatically (changelog [secondary]). I found no published AI-writing or AI-routing feature [unverified]. Human review points are the template and the segment rules.

**Time saved and impact.** Approximately 1 to 3 hours per week for a solo founder that would otherwise hand-send onboarding emails. [design]. Cost is effectively zero until 1,000 contacts on Free, then $49/month up to 5,000 [official].

**Failure modes.**
- Free-tier cap: the 4,000-send quota is shared with transactional mail, so password resets can stop when a broadcast runs [official-derived, design].
- Branch misreads: a contact matching two filters goes down only the first match, so ordering matters [official, docs].
- Missing events: if the app does not send the event, the contact sits idle and nobody gets the email. This is the most common failure [design].
- Deliverability: bad DNS or a cold domain sends mail to spam.

**Integrations.** Typical data flows: app to Loops via API or the snippet for events and contact properties; Stripe, Segment and webhook tools for billing and product events; Zapier and Make for no-code sync [secondary].

**Sources.**
- https://loops.so/pricing (accessed 2026-10-14) [official]
- https://loops.so/docs/workflows/branching (accessed 2026-10-14) [official]
- https://loops.so/docs/contacts/filters-segments (accessed 2026-10-14) [official]
- https://loops.so/changelog/introducing-workflows (rename; undated) [official]
- https://pricingsaas.com/companies/loops/diffs/2026W39 (free-tier change, Sep 2026) [secondary]

---

## 2. Customer.io

**Summary.** Customer.io is an event-driven messaging platform for product and growth teams that already track behavior, with email, push, SMS and in-app messages. It is strongest for behavior-based journeys and is priced by profiles. Official pricing [official, customer.io/pricing, accessed 2026-10-14]: Essentials starts at $100/month for 5,000 profiles and 1M emails/month, with profile tiers of $145 (10k), $235 (20k), $325 (30k), $415 (40k) and $505 (50k+). Premium starts at $1,000/month billed yearly. Enterprise is custom. Overage is $0.009 per extra profile and $0.12 per extra 1,000 emails on Essentials. AI credits are $10 per 100K on Essentials and Premium. Essentials includes journeys, segments, unlimited API calls under fair use, and A/B and multivariate testing.

**Data model.**
- Person (profile): identifier (id or email), attributes (key-value, typed), and a subscription state.
- Event: name, timestamp, and data. Events drive triggers and segments, and are central to the model.
- Segment: a saved rule over attributes and events (has done X in last N days). Event-based segments are native and update in real time [secondary].
- Campaign: a triggered or broadcast message, or a journey.
- Journey (campaign or workflow): a visual graph of steps (send message, wait, branch on attribute or event, goal, exit). Each message has a channel (email, push, SMS, in-app, WhatsApp).
- Message template: Liquid-templated content with a from-address and a subject.
- Transactional message: API-triggered, separate from marketing.

**Main workflows.**
1. Setup: Install the JavaScript or server SDK. Send identify and track calls. Add a sending domain. Connect from-addresses.
2. Create a trigger campaign: New Campaign, choose Event trigger (user_signed_up), add an Email step with a Liquid template, add a Wait step (until attribute activated = true or 2 days), add a Branch, and add Goal (user_completed_setup).
3. Build a segment: Segments, Add rule "has done event project_created" with a time window, or an attribute filter. Use it as an audience.
4. Broadcast: New Broadcast, select a segment, compose, set an A/B test, and schedule.
5. Monitor: Campaign dashboard shows sent, delivered, opened, clicked and converted per step.
6. Daily loop: Look for failed sends and bounces, and check conversion goals.
7. Aha moment: Seeing a live profile's journey history, with each step and branch decision shown.

**Automation and AI.** Customer.io has added AI features. The docs reference agent skills and "AI Suggest" for segments [secondary, AI Indigo tutorial, unverified]. A release banner references AI-powered intelligence and an AI Agent [official banner, snippet only]. I could not verify transactional-specific AI features. Human review: templates and segment logic.

**Time saved and impact.** About 2 to 4 hours per week once journeys are built, mostly on setup [design]. Monthly cost is about $100 at 5k profiles, rising to about $325 at 30k [official].

**Failure modes.**
- Profile counting: every identified person counts, including anonymous or legacy users, so bills climb unexpectedly [design; pricing is per profile].
- Event-name drift: renaming an event in code silently empties segments and stops journeys [design].
- Liquid errors in templates produce broken sends.
- Overage math surprises at 1M sends.

**Integrations.** Segment, RudderStack and Snowflake for data sync; Stripe, Shopify and Salesforce for behavioral data; Zapier [secondary].

**Sources.**
- https://customer.io/pricing (accessed 2026-10-14) [official]
- https://www.dashly.io/tools/comparisons/customer-io-vs-segment/ (overage, G2 and Reddit citations) [secondary]
- https://aiindigo.com/blog/customer-io-summer-release-a-deep-dive-into-ai-driven-engagement [secondary, unverified]
- https://docs.customer.io/journeys/llm-actions (AI features; title only, page not read) [unverified]

---

## 3. Kit (formerly ConvertKit)

**Summary.** Kit is a creator-focused email platform, strong for newsletters, landing pages and tag-based automations, used by solo creators and course sellers. Plans are by subscriber count. Aggregator pricing [secondary; kit.com/pricing returned 403 and could not be read]: Newsletter is free up to 10,000 subscribers. Creator starts at $39/month for 1,000 subscribers ($33 annual), and Pro starts at $79/month ($66 annual), with Pro adding engagement scoring and an insights dashboard. A 10,000-subscriber Creator list is quoted at roughly $100 to $139/month, depending on source. Free-tier automation is disputed: one source says one basic visual automation, another says none. Paid tiers include unlimited visual automations and unlimited sequences. There are no overage fees and a 14-day trial, per aggregators.

**Data model.**
- Subscriber: email, first name, fields (custom), tags, and sequence and automation enrollments.
- Tag: a boolean label applied by forms, automations or manually. Tags are the main segmentation method.
- Segment: a saved filter on tags and fields.
- Form and landing page: the entry point that adds a subscriber and a tag.
- Broadcast: a one-off email to a segment.
- Email sequence: an ordered list of emails with send-day delays (hours or days). Subscribers exit at the last email unless the sequence is set to keep them, which is controlled in the sequence Settings tab [official help, help.kit.com].
- Visual automation: a graph of triggers (subscribes to form, tag added, purchase) and actions (add tag, add to sequence, wait, condition).

**Main workflows.**
1. Setup: Create an account, add a sender address and domain, and set up a default form.
2. Build a welcome sequence: Create Email Sequence, add emails with send-day delays (day 0, 1, 3, 5), and set Settings to keep subscribers after the sequence if you plan to append new emails.
3. Entry-point automation: Visual Automations, New, entry point = form "Newsletter signup", then action = Add to sequence "Welcome", then branch on tag "paid".
4. Landing page: Build a page, attach the form, and publish.
5. Broadcast: Compose, choose a segment, schedule.
6. Daily loop: Check new subscribers, unsubscribes and sequence performance.
7. Aha moment: Seeing a subscriber get tagged and dropped into a sequence after signing up on a form.

**Automation and AI.** Automations are rule-based. Send-day delays run on a 15-minute check cycle, so sends can be late by up to 15 minutes [official help]. Kit has AI features for copy, but I could not verify them [unverified]. Human review: sequence copy.

**Time saved and impact.** About 1 to 2 hours per week for a founder who uses it for a newsletter [design]. Costs step up at 1,000 subscribers ($39 Creator) and again at larger lists [secondary].

**Failure modes.**
- Tag sprawl: unused or conflicting tags make segments unreliable [design].
- Exit behavior: subscribers who exit a sequence will not get new emails added later unless the setting is changed [official].
- Plan limits: a free plan with visual automations may be restricted, and the sources disagree [secondary].
- Deliverability and list growth rate, which drive costs.

**Integrations.** Shopify, Stripe, Zapier, Webflow, Ghost, Gumroad and Teachable for signups and purchases [secondary].

**Sources.**
- https://help.kit.com/en/articles/2502629-creating-and-sending-an-email-sequence-in-kit (accessed 2026-10-14) [official]
- https://www.emailvendorselection.com/kit-pricing/ [secondary]
- https://automationatlas.io/answers/convertkit-pricing-explained-2026/ [secondary]
- https://kit.com/pricing (403, not read) [unverified]

---

## 4. Typefully

**Summary.** Typefully is a writing and scheduling tool for X and LinkedIn creators. It is a drafting environment with a live tweet preview, threads, a scheduling calendar and analytics. The official homepage says it supports X, LinkedIn, Threads, Bluesky, Mastodon and Instagram [official homepage, accessed 2026-10-14]. Pricing could not be read from the official pricing page; the fetch returned navigation only. Directory sources say Free covers one social set, one user and 15 posts/month, Pro is $10 to $12.50/month (sources disagree), and Business is $20/month with teams, roles and 1,500 posts/month [secondary, unverified]. Annual billing is 20% off [secondary]. I could not verify AI writing limits, which are described in reviews only.

**Data model.**
- Social set: a group of connected accounts (one X, one LinkedIn, etc.). Free allows one set.
- Draft: a post or thread. A thread is an ordered list of posts, each with its own text and media.
- Schedule slot: a date and time on a calendar, with a queue.
- Published post: a record with an analytics snapshot (impressions, engagement, link clicks, follower delta) [secondary].
- Tag or channel filter (analytics, Pro and above) [secondary].

**Main workflows.**
1. Setup: Sign up, connect an X or LinkedIn account in Social sets, and set a default posting time.
2. Write a thread: New draft, type the hook, press Enter for a new post in the thread, and watch the preview update. Add media.
3. Schedule: Click Schedule, pick a slot on the calendar or use Smart Scheduling, and confirm. The queue then publishes.
4. AI assist: Select text and choose rewrite or expand. Reviews say the tool learns voice from past posts [unverified].
5. Analytics: Open Analytics to see impressions, engagement and best posts, and export CSV or PDF on paid plans [secondary].
6. Daily loop: Write one or two posts, check the queue, and review what got traction.
7. Aha moment: Seeing the thread preview exactly as it will render on X.

**Automation and AI.** Scheduling is calendar and queue-based, with optimal-time picking (vendor claim, unverified). AI is a writing assistant for rewriting and expansion. The API and MCP server let agents create and schedule drafts (official developer pages). Human review: every post, unless an agent is wired in.

**Time saved and impact.** About 2 to 4 hours per week for a founder who posts daily [design, based on drafting and scheduling time]. Cost is roughly $10 to $20/month [secondary].

**Failure modes.**
- Platform API changes: X pricing and API limits can break scheduled posts [design].
- Rendering differences: thread previews can differ from the live post.
- Analytics overclaims: reviews describe reader-drop-off analytics on threads that I could not confirm [unverified].
- Account rate limits and duplicate-post flags on X.

**Integrations.** X, LinkedIn, Threads, Bluesky, Mastodon; Zapier and the API for agents [official developer pages].

**Sources.**
- https://typefully.com (homepage, accessed 2026-10-14) [official]
- https://typefully.com/pricing (no content returned) [unverified]
- https://www.capterra.com/p/10015231/Typefully/ [secondary]
- https://aiindigo.com/blog/typefully-review-2026-still-the-gold-standard-for-x-twitter-growth [secondary]

---

## 5. Buffer

**Summary.** Buffer is a multi-channel scheduler for small teams and creators, now priced per connected channel. Official pricing [official, buffer.com/pricing, accessed 2026-10-14]: Free is $0 with up to 3 channels, 10 scheduled posts per channel, 100 ideas, 1 user, 3,000 API requests/month, and AI Assistant included. Essentials is $5/channel/month ($60/channel/year), with unlimited scheduled posts and ideas, 1 user, and 7,500 API requests. Team is $10/channel/month ($120/channel/year), with unlimited team members, 15,000 API requests and branded reports. Both paid plans have a 14-day trial. The annual math is inconsistent: the page says two months free, which does not match 12x pricing, and the FAQ says 20% off [official, internal inconsistency].

**Data model.**
- Channel: a connected social account (X, LinkedIn, Instagram, Facebook, etc.). Billing is per channel.
- Post: text, media, target channels, and a status (draft, queued, sent, error).
- Queue: an ordered list of posts per channel, with time slots.
- Idea: an unscheduled draft in the Ideas board (100 on Free).
- Analytics record: per post and per channel metrics, 30 days on Free, unlimited on paid [official].
- Team member and approval state on Team.

**Main workflows.**
1. Setup: Sign up, connect channels with OAuth, and set posting times per channel.
2. Compose: New post, choose channels, write, add media, and use the AI Assistant to rewrite or adapt the text per channel.
3. Queue: Add to queue. The post publishes at the next free slot.
4. Schedule: Set a specific date and time.
5. Ideas: Save drafts to the Ideas board and move them to the queue later.
6. Analytics: Open per-channel analytics, filter by date, and export branded PDF on Team [official].
7. Daily loop: Check queue gaps, respond in the community inbox, and read weekly analytics.
8. Aha moment: Seeing the queue fill across all channels in one calendar.

**Automation and AI.** AI Assistant rewrites and generates post copy, included on all plans [official]. Queue timing is automatic. There is no published AI accuracy metric. Human review: each post before it queues, unless an approval workflow on Team is used.

**Time saved and impact.** About 2 to 3 hours per week across 3 to 4 channels [design]. Cost is $15 to $20/month for three channels on Essentials, or $30/month on Team [official arithmetic].

**Failure modes.**
- Per-channel billing: upgrading from Free charges for every connected channel, including the three you already had [secondary].
- Platform outages and OAuth token expiry, which silently stop posts.
- Queue gaps when slots are full.
- AI copy that sounds generic.

**Integrations.** Instagram, Facebook, LinkedIn, X, Pinterest, TikTok and Google Business Profile [secondary]; Zapier and the API for automation [official].

**Sources.**
- https://buffer.com/pricing (accessed 2026-10-14) [official]
- https://napoleoncat.com/blog/buffer-pricing/ (August 2026 pricing analysis) [secondary]
- https://www.socialchamp.com/blog/?p=44200 [secondary]

---

## 6. Lifecycle sequences (SaaS)

These are the standard sequences the simulator should model. Rates are typical ranges. Confidence is low for most of them, so treat them as game balance and not as facts.

### 6.1 Welcome (signup to first value)
- **Timing [design]:** T+0 (within 5 minutes): welcome plus one next step. T+1 day: setup help or the single most important action. T+3 days: a social proof or use-case email. T+7 days: "still stuck?" check-in, or a pause if activated.
- **Stop rule:** exit when the activation event fires.
- **Typical open rate:** over 50% for the welcome email, then declining to 40% to 50% for the second email [secondary, vendor blog; unverified]. A 2026 cross-industry average is 31.4% opens and 3.8% clicks across all email [secondary].
- **Typical click rate:** over 20% for the welcome email, with top performers at 30% to 40% [secondary, unverified].
- **Conversion to activation:** median 41.7% of signups activate within 7 days; top quartile 71%; bottom quartile 19% [secondary, single dataset, unverified].

### 6.2 Activation nudges
- **Timing [design]:** Day 2 if no key action, Day 5 with a specific feature tip, Day 10 with a human offer (reply to this email) for high-ACV accounts.
- **Typical open and click:** open rates fall with each nudge. Plan for roughly 25% to 35% opens and 2% to 5% clicks on nudges [design, unverified].
- **Conversion to activation:** the nudge plus in-app prompt lifts activation; expect 5% to 15% of nudged non-activators to act [design].

### 6.3 Trial ending
- **Timing [official Stripe defaults]:** Stripe's `customer.subscription.trial_will_end` event fires 3 days before trial end by default, configurable in the Dashboard. Stripe-hosted reminder emails go out 7 days before trial end. Design the in-house sequence around these: T-7 (value recap), T-3 (card or plan CTA), T-1 (last chance), T+0 (converted or ended).
- **Trial-to-paid, opt-out (card required):** median 31.4% (ChartMogul via Fungies); 48.8% in First Page Sage's 2022 to 2025 sample of 86 companies [secondary]. Successful trials typically convert 12 to 18 days in [secondary].
- **Trial-to-paid, opt-in (no card):** 8.9% to 18.5% median [secondary].
- **Email lift:** a vendor study claims trial drips lift conversion by 22% [unverified, one vendor].
- **Open and click for trial-ending email:** no reliable benchmark found [unverified]. Plan for 35% to 50% opens on T-3 and T-1 [design].

### 6.4 Dunning (failed payment)
- **Timing [official Stripe defaults]:** Smart Retries recommended default is 8 tries within 2 weeks, with ML-chosen retry times. Custom schedules allow up to 3 retries. Hard declines (stolen card, lost card, etc.) are not retried and need a new payment method. Stripe doesn't retry Indian-issued cards.
- **Email timing [design]:** Day 0 (card failed, update link), Day 3 (retry happened or pending), Day 7 (last warning with a grace-period date), at the end of the retry window (account paused or canceled).
- **Recovery rate:** Stripe claims 55% of failed payments are recovered on average [Stripe marketing claim via Redux, unverified]. A vendor with 200+ B2C accounts reports 25% to 35% [secondary, unverified]. Use 30% to 40% in the simulator, with a higher share for B2B annual plans [design].
- **Open and click:** dunning emails get high opens on day 0. Plan for 50% to 60% opens and 10% to 15% clicks on the update-card link [design, unverified].

### 6.5 Win-back (cancelled or churned)
- **Timing [design]:** Day 0 exit survey (one question), Day 7 "what would bring you back", Day 30 offer (discount or extension), Day 60 feature-update email, Day 90 final notice.
- **Open rate:** 14% to 22% for win-back, against a 34% B2B SaaS median [secondary, one vendor; unverified].
- **Reply and reactivation:** reply rates of 1.8% to 4.5% for general B2B outreach, which overstates win-back [secondary]. Plan for 2% to 5% reactivation of the churned list per campaign [design].

### 6.6 Benchmark caveats
- Apple Mail Privacy Protection inflates open rates by 10% to 15% in B2B, more for executives [secondary]. Weight clicks and conversions above opens.
- Most figures are vendor blogs with unclear methods. Treat them as directional.

---

## Sources (consolidated, accessed 2026-10-14 unless noted)

- https://loops.so/pricing [official]
- https://loops.so/docs/workflows/branching [official]
- https://loops.so/docs/contacts/filters-segments [official]
- https://loops.so/changelog/introducing-workflows [official]
- https://pricingsaas.com/companies/loops/diffs/2026W39 [secondary]
- https://customer.io/pricing [official]
- https://www.dashly.io/tools/comparisons/customer-io-vs-segment/ [secondary]
- https://aiindigo.com/blog/customer-io-summer-release-a-deep-dive-into-ai-driven-engagement [secondary]
- https://help.kit.com/en/articles/2502629-creating-and-sending-an-email-sequence-in-kit [official]
- https://www.emailvendorselection.com/kit-pricing/ [secondary]
- https://automationatlas.io/answers/convertkit-pricing-explained-2026/ [secondary]
- https://typefully.com [official homepage]
- https://www.capterra.com/p/10015231/Typefully/ [secondary]
- https://aiindigo.com/blog/typefully-review-2026-still-the-gold-standard-for-x-twitter-growth [secondary]
- https://buffer.com/pricing [official]
- https://napoleoncat.com/blog/buffer-pricing/ [secondary]
- https://docs.stripe.com/billing/revenue-recovery/smart-retries [official]
- https://docs.stripe.com/billing/subscriptions/trials [official]
- https://www.flycode.com/benchmarks/stripe-failed-payment-recovery [secondary, vendor-maintained]
- https://www.reduxpayments.com/blog/stripe-smart-retries-explained (via search snippet; recovery claims) [secondary]
- https://visionary-marketing.co.uk/blog/saas-free-trial-conversion-statistics-2026 [secondary]
- https://fungies.io/saas-free-trial-vs-freemium-2026.md [secondary]
- https://visionary-marketing.co.uk/blog/customer-onboarding-statistics-2026 [secondary]
- https://generate.folderly.com/saas-email-marketing-report-2025 [secondary]
- https://www.growthspreeofficial.com/blogs/b2b-saas-b2b-email-nurture-benchmarks-2026-open-ctr-reply-conversion-by-sequence [secondary]
- https://www.sendx.io/blog/saas-onboarding-email [secondary]
