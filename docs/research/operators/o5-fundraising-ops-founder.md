# O5: Fundraising, investor relations, partnerships, founder time, automation, and founder sustainability (2026, small startups)

Research date: 2026-10-14. Tags: [design] = my estimate for simulator tuning; [unverified] = secondary or vendor claim I could not trace to a primary report; untagged = primary source as cited.

**Source-quality warning.** Many searches returned only vendor blogs and aggregators. Where a primary report (Carta, DocSend, PitchBook, CB Insights, Gartner) was reachable, I cite it; otherwise the figure is tagged [unverified]. Carta's H1 2025 page returned HTTP 403 and was not read. Visible's investor-update report contradicts itself in several places, so only its more stable numbers are used below.

---

## 1. Fundraising (investor targeting, warm intros, deck, pitch meetings, process, negotiation)

**Tier behaviours**
- **Stellar:** Builds a target list of 40-60 investors and segments it by stage, check size, and recent comparable deals. Gets a warm intro for most first meetings, and asks the intro-giver for a forwardable note. Sends the deck only after a first call, or sends it with a clear one-line ask. Runs the raise like a sales funnel: runs parallel meetings in a tight window, tracks stage per investor, and sets a close date. Negotiates on terms (cap, pro-rata, MFN) and runs a competitive process rather than accepting the first term sheet. Asks "what would make you lead this?" and "what would you need to see by the next meeting?"
- **Good:** Meets 30-40 investors, mostly warm. Has a deck with traction and a clear use of funds. Follows up within 48 hours. Tracks the process in a spreadsheet, but the timeline slips. Accepts a lead's terms with light pushback.
- **Average:** Cold-emails many VCs, sends the full deck to everyone, and waits for replies. Pitches the product, not the metric trajectory. Runs meetings sequentially over months. Accepts the first offer because the cash is needed.
- **Mediocre:** Pitches to whoever will listen, including non-investors and pre-seed funds with the wrong check size. Sends a 25-slide deck with no metrics. Says "we're raising $X at $Y valuation, what do you think?" and never asks for a next step. Does not track which investors said no and why. Gives away control of the process by letting one investor set the pace.

**Outcome spreads**
- Warm-intro share of seed deals: PitchBook H1 2025 reportedly 68%, up from 55% [unverified, secondhand via Metal, https://www.metal.so/collections/2025-seed-funding-warm-intro-trend-analysis-68-percent, accessed 2026-10-14].
- Median seed time to close: one secondary source cites 56 days from Carta's 2025 State of Private Markets; another cites Carta at 142 days, up from 68 in 2021 [both unverified; see https://vcbeast.com/vc-fundraising-timeline and https://www.presentations.ai/ja/blog/pitch-deck-statistics]. The two conflict. Treat the range 2-5 months as [design].
- Seed round size: FutureSight summary of Carta State of Seed 2025 reports $4.0M median raise and $20M median post-money valuation [unverified, secondary].
- Cold-email reply rate to VCs: 1-2% as an estimate [unverified]. A cited 2025 cold-email reply rate is 5.1% across B2B [unverified].
- Skill vs context: Warm-intro share, target-list quality, and metric trajectory are skill-driven. Market timing, valuation climate, and sector hype are context-driven. A stellar operator in a bad market still closes slower.

**Common mediocre traps**
- Confusing meeting count with progress: 40 first meetings with no second meetings is a bad funnel.
- Sending the deck before a conversation, which turns the investor into a reader instead of a buyer.
- Letting a single "soft yes" stop the process. Running the raise in series, not parallel, adds months.
- Accepting terms before a second term sheet exists.

**Detection**
- Count warm-intro language in player messages ("X introduced me", forwardable intro request).
- Check whether the player asks a closing question at the end of a pitch.
- Check whether the player keeps a timeline with dates per investor.
- Hard to game: a player who copies a good pitch template still cannot fake consistent follow-up cadence over time.

**Feedback (stellar to mediocre)**
- "You're sending your deck to 200 people. Pick 40, get intros, and ask each investor what would make them lead."
- "Your first meeting ended with no next step. Always end with a specific ask."
- "You accepted the first term sheet in 10 days. Run the process for 4-6 weeks so you have a choice."

**Sources**
- https://www.metal.so/collections/2025-seed-funding-warm-intro-trend-analysis-68-percent (2025, secondary)
- https://vcbeast.com/vc-fundraising-timeline (undated, secondary)
- https://carta.com/data/linkedin-fundraising-benchmarks-2025-h1-software/ (H1 2025; page not read, 403)

---

## 2. Investor updates and relations

**Tier behaviours**
- **Stellar:** Sends a monthly update on a fixed day, in the first week. Structure: one-paragraph headline, 3-5 metrics with trend and comparison, a named lowlight with the response, and a specific ask ("intros to heads of RevOps at 50-200 person companies"). Keeps the metric definitions stable across months. Follows up privately on the asks. Gives bad news within 24 hours, not in the next update.
- **Good:** Sends monthly, with metrics and highlights. Lowlights are vague ("some churn"). Asks are generic ("any intros appreciated").
- **Average:** Sends quarterly or irregular updates. Mostly highlights, with a metric dump. No specific asks.
- **Mediocre:** Sends no updates until something goes wrong. Or sends weekly photos and wins with no numbers. Surprises investors on bad news. Uses investor-update emails to ask for money with no context.

**Outcome spreads**
- Visible (vendor, 3.5M+ updates, 2026 page, undated): monthly is 65% of structured sends, quarterly 22%, weekly 13% [https://visible.vc/reports/investor-update-benchmarks/, accessed 2026-10-14].
- Open rates from the same source: board 78%, current investors 77%, team 77%, advisors 75%, prospective investors 64%. List size 1-5 gives 100%, 50+ gives 69% [vendor; the page contradicts itself on some values, so treat as directional].
- Lowlights block used in only 10% of updates, highlights in 23% [vendor, same source]. Stellar operators include the lowlight; many mediocre ones skip it.
- Reply rate: not reported by source. [design] Stellar ~ a reply or intro from 1 in 3 updates is a plausible target.

**Common mediocre traps**
- All-highlights updates that hide burn and churn. Investors find out later, and trust drops more than the bad number would have.
- Asks that are too broad to act on.
- Changing metric definitions quietly.
- Waiting for the next update to share news that needed a same-day email.

**Detection**
- Player text with a headline, a list of metrics, and a named lowlight with an explanation.
- A specific ask with a name or segment, not "any intros".
- Cadence: updates on the same day each month across the game timeline.
- Can't be gamed: a mediocre player who writes a good single update can't keep a month-by-month cadence and consistent metric definitions.

**Feedback**
- "You only shared wins. Add the lowlight and what you did about it."
- "Your ask is 'any intros.' Ask for 'two intros to CFOs at $10M ARR SaaS companies.'"
- "You went quiet for 4 months. Send even a short update monthly."

**Sources**
- https://visible.vc/reports/investor-update-benchmarks/ (2026, vendor; undated)

---

## 3. Partnerships, integrations, and channel sales

**Tier behaviours**
- **Stellar:** Picks 1-2 partner types with a clear reason (an integration with a tool the ICP already uses, or an agency that serves the ICP). Builds the integration to the partner's listing standards. Puts the partner's sales team on the hook with a shared pipeline, co-marketing plan, and a referral fee or rev share. Tracks partner-sourced and partner-influenced revenue separately. Kills partners that have no pipeline after 90 days.
- **Good:** Lists on a marketplace or launches an integration. Has an affiliate program. Tracks installs, not revenue.
- **Average:** Signs many partnership "MOUs" that never generate pipeline. Lists on every marketplace. No partner owner.
- **Mediocre:** Says yes to every partnership request. Offers free licences to partners with no shared goal. Counts logos on a partner page as success. Builds an integration nobody uses.

**Outcome spreads**
- Share of new revenue from partners: a glossary page says young programs usually source single-digit percent of new revenue, mature channel-led firms toward 20-30% [unverified, https://getreditus.com/resources/glossary/partner-sourced-revenue, undated].
- ICONIQ (via a 2026 affiliate page) reports channel-generated pipeline at 60-80% for high-growth firms [unverified; pipeline, not closed ARR].
- Pulse RevOps cites Crossbeam at 41% median net-new ARR share for $50-500M ARR vendors, attributed to reports dated 2027 [unverified; date impossible as of 2026-10-14, do not use].
- Skill vs context: Partner choice and partner management are skill-driven. Platform policy changes and marketplace rules are context-driven.

**Common mediocre traps**
- Logo collecting: a partner page with no referrals.
- Integrations built for the wrong ICP. Usage is near zero.
- Partner revenue counted as "influenced" to look bigger.
- Revenue-share deals that give away margin before the partner has sourced anything.

**Detection**
- Player plans name a partner with a shared pipeline target and a review date.
- Player asks the partner what its customers need, not just what it will co-market.
- Can't be gamed: a player can announce a partnership cheaply, but the partner's behaviour (referrals per month) is not in the player's control.

**Feedback**
- "You announced 12 partnerships and got zero referrals. Pick two partners whose customers are your ICP and ask for three introductions this quarter."
- "Your integration is on the marketplace but nobody installs it. Find out what the users of that tool are trying to do first."

**Sources**
- https://getreditus.com/resources/glossary/partner-sourced-revenue (undated, glossary)
- https://www.saashero.net/?p=12080 (updated 2026-07-23, vendor)

---

## 4. Founder time management, prioritisation, calendar and inbox

**Tier behaviours**
- **Stellar:** Blocks maker time in half-day chunks (Graham's point: hour blocks barely let you start). Has a weekly planning ritual with three outcomes. Says no to most meetings with a short template, and makes others 25 minutes. Uses a "not to do" list. Delegates founder-only tasks at a rate of at least one per week. Reviews the calendar against goals every Friday.
- **Good:** Has a calendar with some blocked time, but meetings creep in. Writes weekly priorities but does not check them.
- **Average:** Calendar is reactive. Accepts most meeting invites. Priority is whatever the inbox pushes.
- **Mediocre:** No calendar, or a calendar that is entirely meetings. Answers every message the same day. Treats "busy" as progress.

**Outcome spreads**
- Paul Graham's 2009 essay "Maker's Schedule, Manager's Schedule" argues that meetings break maker time in ways that matter, and that hour-long blocks are too short for hard work [secondary summaries; original at http://paulgraham.com/makersschedule.html, 2009].
- A 2021 informal tweet poll by SavvyCal's founder reported most founders spend a fourth or less of their week in deep work [anecdotal, cited by OpenView, https://openviewpartners.com/blog/startup-founder-productivity/, 2021]. Not usable as a benchmark.
- Reclaim.ai (2026, unsourced) claims 2.9 deep-work sessions per week [unverified].
- [design] Stellar: 15-20 hours per week of protected maker time. Average: 5-8. Mediocre: under 3.
- Skill vs context: Time allocation is skill. Investor and customer demands are context and can force a meeting-heavy week (for example, during a raise).

**Common mediocre traps**
- Hiding behind busy work (inbox, Slack, admin) during weeks that should be sales or product.
- Accepting every intro call as a favour. This drains the calendar and gives little back.
- Batching meetings badly so that every afternoon is broken.
- Doing the same weekly review without changing anything.

**Detection**
- Player time allocation (for example, "I spent Monday on inbox and Tuesday on pitch prep") against stated priorities.
- Frequency of "no" decisions and explicit deferrals in player text.
- Can be seen in the sequence of actions over time, which is hard to fake for many turns.

**Feedback**
- "You've said yes to every call for six weeks. Keep the one that moves a deal or a hire, and send a 3-line decline to the rest."
- "Your Monday plan has nine items. Pick the top three."

**Sources**
- http://paulgraham.com/makersschedule.html (2009); summaries via https://calnewport.com/why-are-maker-schedules-so-rare/ (undated)
- https://openviewpartners.com/blog/startup-founder-productivity/ (2021)

---

## 5. Automation and AI-tool leverage

**Tier behaviours**
- **Stellar:** Automates repetitive, rules-based work (CRM hygiene, meeting notes, data pulls, first drafts of updates) and keeps a human on anything that affects customers, investors, or hires. Measures whether automation saves time and does not lower quality. Reviews AI output before sending. Retires tools that did not earn their cost.
- **Good:** Uses AI for drafts and summaries. Some automation is set up, but not measured.
- **Average:** Buys many AI tools, uses few. Automates before understanding the workflow.
- **Mediocre:** Automates the customer-facing work first (support bot, cold email at scale, auto-replies to investors). Sends AI output unreviewed. Does not measure quality.

**Outcome spreads**
- Klarna (2025): CEO publicly said cost cuts drove automation that led to "lower quality" support, and the company began rehiring human staff [https://www.entrepreneur.com/business-news/klarna-ceo-reverses-course-by-hiring-more-humans-not-ai/491396, 2025, date approximate].
- Gartner (2025-06-25): more than 40% of agentic AI projects will be canceled by end of 2027 due to cost, unclear value, or weak risk controls. The underlying survey is a January 2025 webinar poll of 3,412 attendees, so it is weak evidence [https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027].
- [design] Stellar operator: AI saves 5-10 hours per week on admin and quality holds. Over-automator: saves hours on paper, loses one customer or deal per quarter to an unreviewed output.
- Skill vs context: Tool choice matters less than whether the operator measures output quality. This is skill.

**Common mediocre traps**
- Cold email at scale with AI copy and no personalisation. Looks productive, lowers reply rates, and burns the domain.
- Replacing the human in the investor or customer loop.
- Stacking tools with overlapping features.

**Detection**
- Text quality signals: generic phrasing across many outbound messages, or the same template across many recipients.
- Player says "I reviewed the output" or describes a check.
- Can't be gamed: a player can claim automation, but the simulator can check whether outputs vary and whether errors are caught.

**Feedback**
- "You automated the investor update. Two investors replied asking if you were OK. Write the update yourself and automate the data pull."
- "You have six AI tools and use two. Cancel four."

**Sources**
- https://www.entrepreneur.com/business-news/klarna-ceo-reverses-course-by-hiring-more-humans-not-ai/491396 (2025)
- https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027 (2025-06-25)

---

## 6. Personal sustainability and decision quality (pivots, persistence vs quitting)

**Tier behaviours**
- **Stellar:** Sets explicit kill criteria before starting a bet (for example, "if MRR is under $X by month 9, we pivot or stop"). Reviews those criteria on schedule. Takes time off, sleeps, has a support system outside the company. Asks for outside opinions before big decisions. Makes pivots from evidence, not mood.
- **Good:** Has criteria but reviews them late. Takes some breaks.
- **Average:** Persists or pivots based on the last bad week. Works every day with no recovery.
- **Mediocre:** Never sets criteria. Either quits after one bad month or continues for years with no change. Ignores signs of burnout until health or relationships break.

**Outcome spreads**
- Burnout: Sifted (Feb 2025) survey of 138 founders found 54% reported burnout in the past 12 months; 75% reported anxiety [https://sifted.eu/articles/founders-mental-health-2025, 2025]. Aggregators list 156 respondents; treat that as an error.
- Failure causes: CB Insights post-mortems (2024) report "no market need" at 42% and "running out of cash" at 29% of 483 analyses [secondary; the count and percentages differ across sources, unverified]. A 2026 piece reports running out of capital in 70% of closures, as a symptom, with poor PMF at 43% [unverified].
- [design] Stellar vs mediocre: stellar operators make an explicit persist-or-stop call on a fixed date. Mediocre operators make the call late, or never.
- Skill vs context: Decision quality (criteria, reviews, outside advice) is skill. Market shocks and funding climate are context.

**Common mediocre traps**
- Confusing persistence with inaction. Continuing without changing anything for 6+ months.
- Pivoting every 90 days, which means no customer ever sees a product twice.
- Ignoring health signals (sleep, relationships, drinking) until they affect the business.
- Sunk-cost reasoning in player text ("we've already spent 2 years").

**Detection**
- Player text with explicit thresholds and dates versus "we'll see".
- Frequency of pivot language against evidence cited.
- Signals of rest (time off, weekends) across turns.
- Hard to fake: the stated kill criteria are checked against later metrics.

**Feedback**
- "You set a kill criterion of 'MRR above $5k by March' and then ignored it. Either hit it or stop, and pick a date now."
- "You've pivoted three times in six months. Stay with one hypothesis until you have 20 customer conversations."
- "You've worked 90-hour weeks for four months. Your decisions are getting worse, so take two days off before the next pivot call."

**Sources**
- https://sifted.eu/articles/founders-mental-health-2025 (Feb 2025)
- CB Insights post-mortem reports, via https://makerstations.io/startup-failure-rate-statistics/ (undated; secondary, unverified)
- Foundology 2024 figure (93% strain), via https://blog.mean.ceo/?p=5705 (2024; unverified)

---

## Cross-cutting notes for the simulator
- The strongest evidence is for process and behaviour (warm intros, update structure, decline rates, kill criteria), not for exact outcome numbers. Use [design] values for tuning until primary reports are checked.
- Carta, PitchBook, and DocSend primary reports were not accessible in this session. Re-check before quoting any closing time or conversion figure.
- Known conflicts: seed time-to-close (56 vs 142 days), Visible's open-rate tables, and CB Insights post-mortem counts.
