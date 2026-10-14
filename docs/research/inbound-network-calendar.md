# Inbound, introductions and the founder calendar (2026)

Research for the SaaS founder simulator, compiled 2026-10-14. Scope: what lands in a founder's inbox, texts and LinkedIn at each stage; how warm introductions work and convert; how founders' calendars fill up; and which 2016-era advice is obsolete. The companion data file is `public/data/inbound-archetypes.js`. The companion skill is `.claude/skills/founder-network-and-time/SKILL.md`.

**How to read the evidence.** Nobody publishes a clean dataset of "messages a founder receives per week by stage". The hard numbers below come from a few kinds of source. Recipient surveys (Hunter, Gartner) and platform telemetry (Microsoft Work Trend Index, LinkedIn via the NYT) are the strongest. Vendor benchmarks (no-show and reply rates) are useful but self-interested. A few older academic and press studies (Kooti/Yahoo 2015, DocSend 2015, HBR 2018) fill gaps. Everything else is **qualitative**: founder blogs, Indie Hackers threads and investor newsletters. Those are labelled **[Q]**. Per-week rates per archetype are **game estimates**, labelled **[design]**, and calibrated so that the qualitative picture holds. Never quote a [design] number as a fact.

Tags: **[S]** survey or telemetry · **[V]** vendor benchmark · **[A]** academic or older study · **[Q]** qualitative, anecdotal or practitioner · **[design]** game estimate.

---

## 1. What lands in the inbox, by stage and visibility

### 1.1 The structural drivers (what makes contacts non-random)
Inbound is a function of **discoverability** × **signals that you have money or attention** × **network size**:

1. **Discoverability.** Contact data can be harvested only once a website, domain, LinkedIn page, Product Hunt or Indie Hackers profile, or public GitHub exists. Indie Hackers members report recurring low-effort cold pitches sent to addresses they published on their profile. Removing the address reduces them (IH thread, 2023–24) [Q]. Founder addresses are harvested from Product Hunt launch pages and mass-pitched. Example: an agency selling automated Reddit promotion "to every single person who launches on Product Hunt" (ziva.sh, 2025) [Q].
2. **Money signals.** A funding announcement is the strongest trigger for vendor, recruiter and agency outreach. Sales-tool vendors teach "recently funded" lists as a core prospecting signal (Artisan, VCBacked, gtm.ai "recently funded startups 90 days" lists, 2025–26) [V]. Their own advice says "every vendor emails a company the week its round is announced", so a well-timed pitch waits until weeks 4–8 (VCBacked, 2025) [V]. Read from the receiving side, this means a **2–8 week spike** after `funding_announced`.
3. **Attention signals.** Product Hunt, HN and viral posts. After a #2 Product Hunt finish, openstatus received "a lot" of LinkedIn messages selling upvotes, and got 687 visits, about 10 users and 0 paying customers (openstatus blog, 2025-10-22) [Q]. Indie Hackers posts warn that PH "experts and consultants flood LinkedIn" after launch (IH, 2024–25) [Q]. After an HN front-page post, one founder reported about 10k views and 60 signups, and Courtland Allen described an "inbox full of people who wanted to be interviewed" (IH, various) [Q]. An HN or PH spike decays within days.
4. **Network size.** Warm inbound (friends, ex-colleagues, peers) scales with the founder's real network, not with launches. LinkedIn once claimed that each connection exposes you to roughly 400 second-degree people (LinkedIn, 2017) [S, dated]. Third-party data puts the median user under about 1,400 connections (intotheminds, undated) [Q].

### 1.2 What the volume feels like (recipient-side data)
- In the Hunter State of Email Outreach 2026 report (2025 data, US decision makers) [S/V]: **28%** say they *never* receive a valuable cold email, **40%** get something useful about weekly, **18%** about monthly. Top complaints are "too sales-focused" (65%), "irrelevant" (61%) and "generic" (48%). **69%** are bothered when AI wrote the email, unless it reads as genuinely human. **50.5%** prefer LinkedIn for outreach, versus 25% for email.
- Snov.io (updated 2026-09) says **37%** of decision makers get more than 10 cold emails a week, and "61% prefer email" [V, no stated sample]. *Its channel preference contradicts Hunter's.* The game treats channel preference as persona-dependent.
- In Gartner (June 2025, n=632, fielded Aug–Sep 2024) [S], **61%** of B2B buyers prefer a rep-free buying experience and **73%** actively avoid suppliers who send irrelevant outreach. The March 2026 follow-up (n=646) puts rep-free preference at **67%**, and 45% used AI during a recent purchase.
- Microsoft Work Trend Index (June 2025, M365 telemetry, 12 months to Feb 2025) [S] puts interruptions at about one every **2 minutes**, roughly **275/day**. Meetings after 8 pm are up **16%** year on year. About 29% of active workers are back in their inbox by 10 pm.
- LinkedIn job applications ran at about **11,000/minute**, up roughly 45% year on year, partly attributed to AI-generated applications (NYT via eWeek/Semafor, June 2025) [S]. A LinkedIn spokesperson elsewhere said about 9,500/min. A hiring post therefore triggers a flood of near-identical candidate messages.

### 1.3 Archetypes and how they change by stage (summary)
Rates per week are **[design]** at the reference founder: launched, website live, ~1,000 followers, B2B SMB, no round announced. Exact per-archetype numbers live in the JS file.

| Stage → | Idea / pre-launch | Launched (reference) | Traction ($5–50k MRR) | Funded (announced) |
|---|---|---|---|---|
| Total inbound/wk [design] | 3–8 | 12–25 | 25–45 | 50–120 in the 4–8 weeks post-announcement, then 30–60 |
| Share worth >5 min [design] | 40–60% (mostly friends, peers) | 15–25% | 15–25% | 5–15% |
| Dominant categories | friends & family, peer founders, students | dev shops, lead-gen agencies, SEO sellers, tool vendors, a few demo requests | demo requests, partners, VC associates, acquisition fishing, agency recruiters | vendors (finance, infra, recruiting), recruiters, VCs for next round, press follow-ups, event and award invites |

Patterns by founder type [Q, synthesised from the sources above]:
- **After a Product Hunt or HN launch:** upvote and "launch consultant" offers, directory-submission services, agencies, a burst of signups and feature requests. Sometimes 1–3 genuine demo requests, a podcast or newsletter invite, and peer founders. Little or no investor inbound unless the launch also produces visible traction.
- **After announcing a round:** the biggest vendor and recruiter spike. "Congrats on the raise" pitches (sometimes naming the wrong round or amount, a red flag VCBacked flags, 2026), plus agency recruiters, fractional executives, RBF and banking, office space, events and awards. Next-round VCs ask to "keep in touch".
- **After a viral post:** peer founders, "pick your brain" requests, podcast invites, some VC associates, job seekers, and a modest bump in signups if the post links to the product.
- **Indie hacker with an audience:** more peer, community and sponsorship inbound, micro-acquirer and broker approaches ("would you consider selling?"), indie-friendly funds, and fewer VC associates.

### 1.4 Category notes (what is real, what is waste)
- **Dev shops, offshore devs, lead-gen and "we'll book you 15 meetings" agencies, SEO and link sellers, fractional CMOs.** The main noise in 2025–26. It is increasingly AI-written and "personalised" from scraped fields. Red flags: generic praise, merge-tag errors, wrong round or amount, a calendar link in the first email, and a sending domain that differs from the website (VCBacked 2026; Hunter 2026) [Q/V].
- **Scams.** Fake conference "speaker" invitations that later ask for fees, visas or travel payments (christianitytoday 2020; adamlevin 2022) [Q]. Pay-to-play podcast invitations with a "production fee", often from a Gmail address. Typical paid-guest fees run $200–2,000 (millionpodcasts 2026; podcastguests.com) [Q/V]. Fake award and recognition offers that charge for a plaque. "Funding brokers" asking for upfront fees.
- **Investors.** VC associates "would love to learn more" or "just catching up". This is often pipeline-building and data gathering. A real meeting with a partner is a minority outcome [Q; see fundraising.md for the funnel]. Scouts and angels arrive mostly through the founder's network.
- **Customers.** Inbound demo requests are high value but include tire-kickers, students and **competitors posing as prospects**. Proxies asking "unusually detailed" pricing, roadmap or integration questions are a known pattern in adjacent industries (flyingsolo forum; sectorlink 2025) [Q]. Business-email filtering and early budget and timeline questions help, but a determined competitor can get past both.
- **Acquirers and corp dev.** Early corp-dev calls are mostly fit screens and data collection. Revenue, growth and willingness to sell go into their CRM, and any number you say becomes an anchor (Windsor Drake; Value Add VC) [Q]. Paul Graham's "Don't Talk to Corp Dev" (2015) [Q] says don't take the call unless you're ready to sell. SaaStr argues for sharing selectively, since information flows both ways [Q]. Micro-SaaS founders get broker and micro-PE "is your SaaS for sale?" fishing, often lowball.
- **Press.** HARO/Connectively shut down on 2024-12-09. Requests moved to Qwoted, Featured and Source of Sources (inboundblogging, zapier, 2025) [Q]. Real journalist inbound is rare without news (a funding round, data, a controversy). Podcast and newsletter invites are commoner, and some are pay-to-play.
- **Advisors for equity.** Offers to "help with GTM or intros" for equity. The typical FAST-style range is **0.25–1%** pre-funding for a standard advisor and **0.1–0.5%** post-seed, vesting over 1–2 years (Founder Institute FAST via secondary guides) [Q]. Red flag: they ask for equity before doing anything specific.
- **Peer founders: "pick your brain".** Unstructured, often 30–60 min. Standard defence: answer specific questions async, or batch into a weekly 30-minute office-hours slot (onemonth, joshspector, fullfocus) [Q]. Some peers become the best source of customer and investor intros.
- **Friends and family.** Steady iMessage or WhatsApp check-ins ("how's the startup going?"). Low value on any single message, but they hold the first customer intros and emotional support.

### 1.5 Triage and time lost
- **Triage pattern [Q]:** (1) bulk filters and a separate inbox for vendors; (2) skim subject plus sender domain; (3) reply only to customers, investors you chose, existing relationships and specific asks; (4) saved "no" templates (Josh Spector; Glazer); (5) one weekly 30-minute slot for "help" requests.
- **Time cost [design, anchored on Gloria Mark]:** reading and deleting one vendor email costs about 0.5–1 min. Engaging with one wasted call costs 30–60 min plus about **25 min** of refocus. Mark's *Attention Span* (2023) gives 25 min 26 s to return to an interrupted project and about **47 s** average screen attention [A]. Untriaged, a funded founder can lose **3–6 h/week** to inbound [design].

---

## 2. Introductions

### 2.1 Etiquette (well established, qualitative)
- **Double opt-in.** The introducer privately asks the target whether they want the intro before connecting. Popularised by Fred Wilson (AVC, 2009) [Q]. Investors are strict because their reputation rides on every forward (Adamant Ventures newsletter) [Q].
- **Forwardable email.** The requester writes a short, self-contained blurb (who, traction in one line, the specific ask, why this person). The connector can then hit forward and add "see below". Making the connector rewrite it "plummets the chances" the intro happens (Adamant Ventures; Entrepreneur; Happenstance guide) [Q].
- **After yes:** one thread, clear subject ("Intro: A <> B"). The recipient moves the introducer to BCC on the first reply and replies within about 24 h. Close the loop: thank the connector and tell them the outcome.
- **Intro capital is finite [design].** Each intro a connector makes costs them a little credibility. Repeated asks of the same person, or intros that go badly, lower their willingness.

### 2.2 Conversion numbers
| Step | Range | Source |
|---|---|---|
| Cold email to investor → meeting | <1–2% (old study 1.2%) | [V] secondary blogs; see fundraising.md |
| Warm intro → first investor meeting | 20–50% (old study 15.8%) | [V]; fundraising.md |
| Warm outreach → first meeting (sales, generic) | 40–70% | Boomerang 2026, partly the author's own estimates [V] |
| Cold outreach → first meeting (sales) | 0.5–2% | Boomerang 2026 [V] |
| First investor meeting → term sheet | 2–8% | fundraising.md [V] |
| Seed raise: investors contacted / meetings | DocSend ~2015 study: ~40 meetings, ~12.5 weeks; closers contacted 77 → 40 meetings | DocSend [A, dated] |
| Intro requested → intro actually made | **No published data.** strong 0.75–0.9, medium 0.45–0.65, weak 0.15–0.3, cold-ask 0.03–0.1 | [design] |
| Business-card follow-up after events | <28% of cards exchanged are followed up | CIBTM 2013 via blog [Q, dated] |
| High-quality connections per conference worked actively | ~3–5 | career-advice opinion [Q] |

*The warm-intro numbers vary 3–4x between sources because "warm" is undefined.* The game models warmth explicitly through relationship strength and forwardable quality.

### 2.3 Channels in 2026: text vs email vs LinkedIn
- **Email** is still the system of record for intros (double opt-in threads, forwardables, deck links). NFX Signal also steers founders to mutual-connection email intros [Q].
- **WhatsApp, iMessage and Signal** are used for existing relationships. Investors run WhatsApp groups with portfolio founders, and deal-sharing and back-channelling happen in VC and founder WhatsApp groups (Sifted 2023; John Henderson Substack; Adamant "WhatsApp for investor comms") [Q]. Texting a person you've never met is a norm violation outside a few ecosystems (India, LatAm and EU founder WhatsApp culture are looser) [Q]. Sifted warns WhatsApp becomes "an extra, quickly filling inbox" [Q].
- **LinkedIn DMs** suit weak ties, recruiters, vendors and first touch with execs. Half of decision makers say they prefer LinkedIn for outreach (Hunter 2026) [S/V], but LinkedIn inboxes are also where upvote sellers and agencies pile in after a launch [Q].
- **Reply-time norms.** Email (Kooti et al., Yahoo, 2015, 2M users) [A]: median reply about **47 min**, mode about 2 min, ~90% of replies within a day. Older users reply slower. *Those are replies that happened; most cold email never gets one.* SMS is "about 90 s vs 90 min" in vendor folklore [V, unverified]. Use as norms: text 0–4 h, email 24–48 h for warm contacts, LinkedIn 1–7 days [design].

---

## 3. The founder calendar

### 3.1 Maker vs manager
Paul Graham, "Maker's Schedule, Manager's Schedule" (2009) [Q]: makers work in units of at least half a day, and a single meeting can blow an afternoon. Cal Newport notes that almost no organisations actually support maker schedules [Q]. Common founder practice [Q]: build in the mornings, batch calls into 1–2 afternoons or 2–3 "meeting days", and set no-meeting blocks of ≥3 h.

### 3.2 Load and durations
- **Large-company CEOs** (Porter & Nohria, HBR 2018, 27 CEOs, ~60k hours) [A]: about **62.5 h/week**, ~37 meetings a week taking about 72% of work time (secondary figures; another summary says 61% face-to-face), and about 36% of time spent reacting. This is the upper bound of the manager's schedule, not a solo founder.
- **Founders' hours:** Sifted 2025 founder survey (~138 founders, mostly early stage, via secondary summary) [S]: ~54% burned out in the past year, ~75% had anxiety, ~67% work >50 h/week. Aggregator claims of "63 h average" are unverified; don't use them.
- **Solo founder budget example** (routine.co, 30-hour week) [Q]: 12 h build, 8 h growth, 6 h customers, 2 h finance, 2 h admin.
- **Typical weekly meeting load [design, from the qualitative pattern above]:** idea or discovery stage 5–15 calls; launched 4–10 (demos, support, peers); traction 8–20 (sales, partners, hiring); active raise 8–20 investor meetings a week for 3–8 weeks (consistent with ~40 meetings over ~12 weeks in DocSend's older data); hiring push 5–12 interviews.
- **Durations:** discovery 30 min; demo 30–45; investor first meeting 30 (pre-seed and seed calls are often 25–30) to 45–60 for a partner meeting; peer coffee 30–60; candidate screen 30; candidate deep dive 60–90; partner and corp dev 30–45. One guide argues most meetings need 15–20 min or 2 h, not the default hour [Q].

### 3.3 No-shows and reschedules
- All B2B meetings: **6.5%** no-show (RevenueHero, Dec 2024, n=6,428) [V].
- Demos: **20–40%** commonly quoted for mid-funnel and outbound-booked demos (Naoma 2026 citing Reply.io 2025; Chili Piper 2025 cited at 20–24%, not verified) [V]. Booking lead time matters: 1–3 days out gives **12–15%**, 7+ days out about **24.5%** (Naoma 2026) [V]. "High performers keep no-shows under 15%" (RevenueHero) [V].
- Reschedules: a Reclaim survey (2024, ~1,300 professionals, via secondary summary) reports about **4.2 rescheduled meetings per employee per week** [S, secondary].
- Investor meetings and warm-intro meetings: no-shows are rare, but reschedules are common. **[design]**: no-show 2–5%, reschedule 15–25%.

### 3.4 Tools in 2026
- Booking links (Calendly, Cal.com, Google Calendar appointment schedules) are standard for sales. Sending one to a senior person on a first touch reads as presumptuous [Q].
- **AI scheduling.** Gmail "Help me schedule" (Gemini, rolled out Oct 2025) suggests 1:1 slots from a thread, with no group scheduling at launch. Outlook Copilot schedules from threads. CC-able assistants (Howie; Calendly's "Callie", reported May 2026 by Sacra, unverified) coordinate without links [V/Q]. **Clockwise shut down on 2026-03-27** after a Salesforce acquihire, and user data was deleted (Doodle, Cal.com, usecarly, 2026) [Q]. Lesson for the game: tool risk exists, so keep the calendar portable.
- **Time zones.** For an EU↔US-West founder, overlap is roughly 1–3 h of business day. Calls land early morning or evening, which feeds the "infinite workday" (Microsoft WTI 2025: after-8 pm meetings up 16%) [S].

### 3.5 How fundraising and sales cycles eat calendars
During an active raise, investor calls, follow-ups, data-room requests and partner meetings push building close to zero for 4–12 weeks [Q, consistent with fundraising.md raise durations of 3–6 months]. Enterprise sales cycles add multi-stakeholder calls (security review, procurement), each of which reschedules at least once [design]. Burnout signals to model [design, anchored on Sifted 2025 and Microsoft WTI 2025]: more than 25 meetings a week sustained, after-hours meetings more than 2 days a week, no maker block for over 2 weeks, inbox backlog growing, and declining sleep or exercise events.

---

## 4. Obsolete advice (2016 → 2026)

| 2016 advice | 2026 reality |
|---|---|
| "Answer every email; inbox zero." | Inbound is now heavily AI-generated and personalised from scraped data (Hunter 2026: 69% are bothered by AI-written email). Filter first, and reply only to people you'd meet. Use saved no-templates. |
| "Personalised first line = real human." | AI SDRs mass-produce "personalised" first lines. Look for *specificity that cost effort* (a real use of your product, a mutual connection who confirms) and treat a wrong fact (round size, product name) as an automation tell. |
| "Get on HARO to get press." | HARO/Connectively closed 2024-12-09. Use Qwoted, Featured, Source of Sources, or real news. |
| "Launch on PH and investors will come." | PH launches bring upvote sellers and agencies, and often little revenue (openstatus 2025). Investors respond to traction, not upvotes. |
| "Send your Calendly link." | Fine for inbound demos. With senior or warm contacts, propose 2–3 times or let an AI scheduler handle it. Gmail and Outlook now do this natively. |
| "Use Clockwise or X to auto-optimise your calendar." | Clockwise shut down in March 2026. Depend on native calendar features plus simple rules (maker blocks, meeting days). |
| "Go to every networking event; collect cards." | Fewer than 28% of cards ever get a follow-up (old data). Pick fewer events, set 3–5 target conversations, follow up within 48 h–1 week. Speaking slots you pay for are usually sponsorship or scams. |
| "Cold-email VCs at volume." | Warm intros convert about 10–20x better (fundraising.md). Investors and founders coordinate in WhatsApp groups. Ask for forwardable double opt-in intros. |
| "Take every corp-dev call." | It's a data-gathering fit screen. Don't share financials or name a price without an NDA and a real process (PG 2015; Windsor Drake). |
| "Post a job and wait for applicants." | Applications are flooded by AI-written resumes (LinkedIn ~11k applications/min, 2025). Use referrals, work samples and screening questions. |
| "Bulk email from your main domain is fine." | Gmail and Yahoo bulk-sender rules (Feb 2024: SPF, DKIM, DMARC, one-click unsubscribe, spam rate <0.3%) and Microsoft enforcement (May 2025) penalise it. This also explains why vendor spam now comes from look-alike domains. |

---

## 5. Simulation parameters

| Parameter | Value / range | Source + date |
|---|---|---|
| Reference founder for base rates | launched, site live, ~1k followers, B2B SMB, no round | [design] |
| Total inbound per week by stage | idea 3–8; launched 12–25; traction 25–45; funded 50–120 (post-announce spike), 30–60 steady | [design], qualitative anchors §1 |
| Share of inbound worth >5 min | idea 40–60%; launched/traction 15–25%; funded 5–15% | [design]; Hunter 2026 (28% never get valuable cold email) [S/V] |
| Funding-announcement vendor spike | ×3–8 for 2–8 weeks; best vendor timing weeks 4–8 | [design]; VCBacked 2025 [V] |
| PH/HN launch spike | ×5–15 for spam-adjacent archetypes, decays in 3–10 days | [design]; openstatus 2025, IH [Q] |
| Visibility multiplier | rate × v^(log10(audience) − 3), v per archetype 1.0–1.8 | [design] |
| Read/delete cost per junk message | 0.5–1 min | [design] |
| Refocus cost after interruption | ~25 min | Gloria Mark, *Attention Span*, 2023 [A] |
| Interruption frequency (knowledge workers) | ~every 2 min; ~275/day | Microsoft WTI, June 2025 [S] |
| Hiring-post candidate flood | ×10–30 candidate inbound for 2 weeks | [design]; LinkedIn ~11k applications/min, NYT June 2025 [S] |
| Intro made given requested | strong 0.75–0.9; medium 0.45–0.65; weak 0.15–0.3; cold-ask 0.03–0.1 | [design] |
| Warm intro → first investor meeting | 0.20–0.50 | [V] (fundraising.md) |
| Warm outreach → first sales meeting | 0.40–0.70 | Boomerang 2026 [V, partly estimates] |
| Cold → meeting | 0.005–0.02 | Boomerang 2026; fundraising.md [V] |
| First investor meeting → term sheet | 0.02–0.08 | [V] (fundraising.md) |
| Forwardable-email quality multiplier | ×0.5 (none) to ×1.3 (crisp forwardable) on intro made | [design]; Adamant Ventures [Q] |
| Connector intro fatigue | −10–20% willingness per additional ask within 90 days | [design] |
| Event follow-up rate (NPC side) | <28% | CIBTM 2013 via blog [Q, dated] |
| Quality contacts per actively worked event | 3–5 | career-advice opinion [Q] |
| Email reply median (when replied) | ~47 min; 90% within a day | Kooti et al., Yahoo, 2015 [A] |
| Expected reply window, warm | text 0–4 h; email 24–48 h; LinkedIn 1–7 d | [design] |
| No-show: all B2B meetings | ~6.5% | RevenueHero, Dec 2024 [V] |
| No-show: demos | 12–15% (booked 1–3 d out) to ~25% (7+ d); outbound 20–40% | Naoma 2026; Reply.io 2025 via Naoma [V] |
| No-show: investor / warm intro | 2–5% | [design] |
| Reschedules | ~4.2 per employee per week (corporate); founder meetings 10–25% rescheduled | Reclaim 2024 via secondary [S]; [design] |
| Maker block | ≥3–4 h (half day) | Paul Graham 2009 [Q] |
| Default work hours | 09:00–18:00 local; founders exceed 50 h/week (~67% in Sifted 2025) | [design]; Sifted 2025 [S, secondary] |
| Burnout prevalence | ~54% of founders burned out in past 12 months | Sifted 2025, ~138 founders [S, secondary] |
| Meeting load during raise | 8–20 investor meetings/week for 3–8 weeks; ~40 total | [design]; DocSend ~2015 [A] |
| Large-company CEO meetings | ~37/week, ~72% of time; 62.5 h/week | Porter & Nohria, HBR 2018 [A] |
| Advisor equity offers | 0.25–1% pre-funding; 0.1–0.5% post-seed; 1–2 yr vest | FAST via secondary guides [Q] |
| Pay-to-play podcast fee asks | $200–2,000 | millionpodcasts 2026 [V/Q] |

---

## 6. Sources (dated)

- Hunter, *State of Email Outreach 2026* (2025 data) — https://hunter.io/the-state-of-cold-email
- Snov.io, Cold email statistics (updated 2026-09-21) — https://snov.io/blog/cold-email-statistics/
- Gartner press releases, 2025-06-25 (61% rep-free) and 2026-03-09 (67%) — https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-sales-survey-finds-61-percent-of-b2b-buyers-prefer-a-rep-free-buying-experience ; https://www.gartner.com/en/newsroom/press-releases/2026-03-09-gartner-sales-survey-finds-67-percent-of-b2b-buyers-prefer-a-rep-free-experience
- Microsoft Work Trend Index special report, June 2025 (via Axios 2025-06-17, HR Executive) — https://www.axios.com/2025/06/17/microsoft-remote-work-meetings
- NYT via eWeek / Semafor, LinkedIn applications, June 2025 — https://www.eweek.com/news/ai-job-applications-linkedin/ ; https://www.semafor.com/article/06/24/2025/recruiters-swamped-with-ai-generated-job-applications
- VCBacked, post-funding outreach timing and founder outreach mistakes (2025–26) — https://www.vcbacked.co/blog/best-time-to-reach-out-after-funding ; https://www.vcbacked.co/blog/founder-outreach-mistakes-2026
- openstatus, "Our Product Hunt launch: brutal reality" (2025-10-22) — https://www.openstatus.dev/blog/our-producthunt-launch-brutal-reality
- Indie Hackers threads [Q]: https://www.indiehackers.com/post/cold-email-spammers-are-now-targeting-ihers-d8c8aad6bf ; https://www.indiehackers.com/post/why-launching-on-product-hunt-might-not-be-worth-it-for-you-e78f256ae3 ; https://www.indiehackers.com/post/what-happens-when-youre-on-the-front-page-of-hacker-news-6d803e7bb3
- ziva.sh, "Don't post on Product Hunt" (2025) — https://ziva.sh/blogs/dont-post-on-product-hunt
- Double opt-in: Happenstance guide; Waseem Substack; Adamant Ventures newsletter; Entrepreneur (forwardable email) — https://happenstance.ai/how-to/double-opt-in-intro ; https://waseem.substack.com/p/double-opt-in-intro ; https://adamant.beehiiv.com/p/warm-introduction-mistakes ; https://www.entrepreneur.com/article/247692 (original idea: Fred Wilson, AVC, 2009)
- Boomerang, "Honest math of a warm-intro pipeline" (2026) — https://www.getboomerang.ai/post/honest-math-warm-intro-pipeline
- DocSend fundraising research (~2015, via TechCrunch/SlideShare) — https://www.slideshare.net/slideshow/docsend-fundraising-research-49480890/49480890
- Kooti et al., "Evolution of Conversations in the Age of Email Overload" (arXiv, 2015) — https://arxiv.org/abs/1504.00704
- LinkedIn 500M announcement (2017) via ITPro — https://itpro.com/careers/28556/linkedin-hits-500-million-members ; intotheminds LinkedIn stats — https://www.intotheminds.com/blog/en/linkedin-statistics/
- WhatsApp and messaging for VCs: Sifted 2023; John Henderson; Adamant — https://sifted.eu/articles/whatsapp-groups-that-run-tech ; https://johnhenderson.substack.com/p/email-sucks-for-building-a-working-relationship-cad548e83210 ; https://adamantventures.substack.com/p/whatsapp-for-investor-comms
- NFX Signal FAQ — https://signal.nfx.com/faq
- Paul Graham, "Maker's Schedule, Manager's Schedule" (2009) — https://paulgraham.com/makersschedule.html ; "Don't Talk to Corp Dev" (2015) — https://paulgraham.com/corpdev.html ; Cal Newport, "Why are maker schedules so rare?" — https://calnewport.com/why-are-maker-schedules-so-rare/
- Gloria Mark, *Attention Span* (2023), via Steelcase transcript — https://www.steelcase.com/research/articles/our-47-second-attention-span-with-gloria-mark-s5-ep3-transcript/
- Porter & Nohria, "How CEOs Manage Time" (HBR 2018), via McKinsey/Fast Company — https://www.mckinsey.com/about-us/new-at-mckinsey-blog/how-do-ceos-manage-their-time-the-winners-of-the-60th-annual-hbr-mckinsey-award-explain
- Sifted, founders' mental health 2025 (not directly retrievable; figures via secondary summary) — https://sifted.eu/articles/founders-mental-health-2025
- RevenueHero no-show analysis (Dec 2024) — https://www.revenuehero.io/blog/what-is-a-no-show-rate ; Naoma demo no-shows (2026) — https://naoma.ai/blog/article-01-demo-no-shows
- Reclaim 2024 survey via secondary — https://stealthagents.com/research/ai-scheduling-automation-statistics-2026
- routine.co, 30-hour solo founder week — https://routine.co/blog/posts/design-30-hour-workweek
- Gmail "Help me schedule" (Oct 2025) — https://www.techrepublic.com/article/google-gemini-schedule-meetings-from-gmail/ ; Sacra on Howie (2026) — https://sacra.com/c/howie/
- Clockwise shutdown (Mar 2026) — https://doodle.com/en/clockwise-is-shutting-down-what-to-do-next-in-2026/ ; https://www.usecarly.com/blog/clockwise-shut-down
- Connectively (HARO) shutdown 2024-12-09 — https://inboundblogging.com/?p=8410 ; https://zapier.com/de/blog/haro-alternatives/
- Pay-to-play podcasts — https://podcastguests.com/watch-out-for-podcast-scams-what-to-know-and-how-to-stay-safe/ ; https://www.millionpodcasts.com/blog/?p=7463
- Conference speaker scams — https://adamlevin.com/2022/04/08/how-to-spot-a-conference-scam ; https://christianitytoday.com/2020/01/uk-church-conference-email-scam-big-things-speaker-invites
- Corp dev: SaaStr; Windsor Drake; Value Add VC; Chris Dixon (2012) — https://www.saastr.com/what-to-do-when-a-bigco-says-they-want-to-build-buy-or-partner ; https://valueaddvc.com/blog/corporate-development-vs-investment-banking-what-founders-need-to-know ; https://cdixon.org/2012/09/10/notes-on-the-acquisition-process/
- Advisor equity (FAST via secondary) — https://www.allied.vc/guides/how-much-equity-for-startup-advisors ; https://www.growthmentor.com/blog/startup-advisor-compensation
- Saying no: Josh Spector; onemonth; Robert Glazer — https://joshspector.com/how-to-say-no-template/ ; https://learn.onemonth.com/how-to-say-no ; https://robertglazer.substack.com/p/saying-no-decline-templates
- Event follow-up (CIBTM 2013 via blog) and conference ROI pages [Q] — https://www.conferences.m13.co/03-post-conference
- Fake prospects / competitor proxies [Q] — https://www.sectorlink.com/article/the-lazy-prospect-scam-how-fake-sales-inquiries-are-becoming-a-new-reconnaissance-tool ; https://www.flyingsolo.com.au/forums/topic/competitors-requesting-bogus-quotes/
- Bulk-sender rules (Google/Yahoo Feb 2024; Microsoft May 2025) — https://egressif.io/resources/sender-requirements/provider-rule-tracker
- SMS response time (vendor folklore) — https://www.salesmessage.com/sms-marketing-statistics-2026
