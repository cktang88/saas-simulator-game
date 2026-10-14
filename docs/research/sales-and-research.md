# B2B sales, prospecting and customer research (2026)

Research for the SaaS founder simulator, compiled 2026-10-14. Scope: founder-led outbound (list building, enrichment, AI SDRs, LinkedIn), cold email mechanics and deliverability, sales-process conversion numbers, CRM pipelines, and customer discovery.

**How to read the numbers.** Almost every 2025–2026 cold-email and sales benchmark is published by a vendor that sells email, data or AI-SDR tooling. Those vendors define "reply" differently: some count auto-replies and opt-outs, some don't. Their samples skew toward their own users, and some pages contradict themselves. Headline reply rates for the same period run from 0.45% (Belkins, auto-replies excluded) to 4.5% (Saleshandy). Methodology accounts for that spread more than the actual state of the market does. The game therefore uses **ranges**, and every row in the parameter table names its source. Values marked *game synthesis* are design choices derived from the cited ranges, not measured statistics.

---

## 1. How solo founders prospect in 2026

### Founder-led sales is still the default for the first customers
- Before roughly the first $1M ARR, or the first 10–20 B2B customers, the founder sells. This applies to both bootstrapped and VC-backed companies. Nobody can sell a product with no references better than the person who built it, and early sales calls double as discovery. The game should make "hire an SDR/AE before you have a repeatable process" a known trap.
- **Indie vs VC.** Bootstrapped micro-SaaS founders usually sell low-ACV products (under $5k/yr). Cold outbound is one channel among several (communities, SEO, marketplaces, content, integrations), and sales is mostly self-serve plus founder demos. VC-backed founders selling mid-market or enterprise deals (over $15k ACV) depend more on outbound and multi-threaded deals. They are expected to show pipeline coverage and win rates, and they eventually hire SDRs or AEs, or try AI SDRs.

### List building and enrichment (the 2026 stack)
- **Databases.** Apollo is the default self-serve contact database with a built-in sequencer. ZoomInfo is the enterprise option. LinkedIn Sales Navigator supplies account and lead search plus job-change and "posted recently" signals.
- **Clay-style orchestration.** Clay pulls a target list (companies or people), then runs **waterfall enrichment** across many providers: it queries vendor A, and if A finds nothing it queries B, and so on. AI research steps then pull out custom fields, such as "do they use Stripe?", "are they hiring SDRs?" or a summary of the latest funding announcement. Vendor material says single-source email find rates plateau around 40–50% and that waterfalls reach roughly 75–80% coverage. These are vendor claims (LeadMagic and Prospeo guides, 2026). One agency case reports 51% coverage with Apollo alone, rising to 79% coverage and a 1.8% bounce rate after a three-provider stack plus verification.
- **Verification is mandatory.** Run every address through a verifier (catch-all detection) before sending. Saleshandy's 2026 data shows bounce rates of 1.21% for addresses verified "valid" and 10.58% for those flagged "bad". Unverified lists blow through bounce limits.
- **Signal-based / intent prospecting** has replaced static list blasting. Founders filter for triggers: a new funding round, hiring for a relevant role, a job change by a former champion, a tech-stack change, posts about the problem, website visits (de-anonymization tools), or G2 or Bombora intent. Intent data is noisy: one 2026 commentator estimates its precision at 30–40% (unsourced estimate). Treat it as a prioritisation signal, not proof of demand.
- **Scraping and LinkedIn.** In March 2025, LinkedIn removed or restricted the company pages of Apollo, Seamless.AI and others over scraping (reported by La Growth Machine and others, 2025). Scraped LinkedIn data and browser-automation tools risk account restrictions. In the game, scraping is a cheap but risky action.

### AI SDR tools: what they actually deliver
- **Two categories.** (a) Fully autonomous "AI SDR" agents (11x "Alice", Artisan "Ava", AiSDR and others) that research, write and send. (b) AI features inside sequencers (Instantly, Smartlead, lemlist, Apollo AI): AI copy variants, reply classification, AI reply agents, and inbox rotation.
- **Evidence on autonomous AI SDRs is weak and mostly negative.**
  - In March 2025, TechCrunch reported that 11x listed logos of companies that were not paying customers (ZoomInfo had run a one-month trial and churned, and said 11x underperformed its own SDRs). A former employee alleged 70–80% churn in some cohorts, and 11x said its retention was 79%. The founder-CEO stepped down in May 2025.
  - A 2026 practitioner analysis (LeadGen Economy, April 2026) estimates that 50–70% of managed AI SDR contracts are cancelled within 90 days. It cites hallucinated company facts in 12–18% of AI-written emails, and AI reply rates degrade to around 0.5–1.5% once deliverability slips. Most of these figures are the author's estimates or third-party tests, not audited data.
  - Vendor comparison pages (11x, Artisan) make claims such as "1.5x qualified meetings". These are marketing.
- **What works in practice** is a hybrid. AI handles research, enrichment, first drafts, reply triage and CRM hygiene. A human (the founder) chooses the ICP, writes or approves the angle, and handles every positive reply and call. Autonomous AI SDRs are priced at roughly $5k/month on annual contracts (reported for 11x), which a bootstrapped founder cannot justify. VC-backed founders are pitched them often.
- **Game rule.** AI SDRs raise volume and cut founder hours, but they lower reply quality, raise spam-complaint and hallucination risk, and produce meetings that convert to opportunities at a lower rate.

### LinkedIn outreach
- LinkedIn does not publish its invitation limit. The community-observed limit is about **100 connection requests per rolling 7 days** for most accounts, and around 150–250 for mature or high-SSI Sales Navigator accounts (vendor guides, 2026). The limit drops if recipients ignore or report your invitations. Acceptance rate and spam reports matter more than the account tier.
- **Multichannel lifts results.** Saleshandy's 2026 data shows positive reply rates of 0.11% for email alone, 0.21% for email plus LinkedIn, 0.28% for email plus phone, and 0.88% for three or more channels. These use Saleshandy's own denominators, so the ordering matters more than the absolute values.
- **Founder-brand content** (posting on LinkedIn or X) warms prospects. One practitioner dataset of 8,423 LinkedIn messages found that prospects who had engaged with the sender's content replied 36.4% of the time, against 11.4% for cold prospects. This is anecdotal.

---

## 2. Cold email mechanics

### Mailbox-provider rules (hard constraints)
| Provider | Rule | Date |
|---|---|---|
| **Gmail, all senders** | SPF **or** DKIM, valid forward and reverse DNS, TLS, RFC 5322 formatting. Keep the spam rate in Postmaster Tools **below 0.3%**. Google's monitoring guidance says to stay **below 0.10%** and "avoid ever reaching" 0.30%. | Effective Feb 1, 2024 (Google Help, *Email sender guidelines*) |
| **Gmail, bulk senders (5,000+/day to Gmail)** | SPF **and** DKIM **and** DMARC (p=none is acceptable), From-domain alignment, **one-click unsubscribe** (RFC 8058 `List-Unsubscribe-Post` header) plus a visible unsubscribe link for marketing mail, unsubscribes honoured within 2 days. Bulk-sender status is reportedly permanent once reached. | Feb 2024; **"Starting November 2025, Gmail is ramping up its enforcement"**, meaning temporary (4xx) and permanent (5xx) rejections of non-compliant mail (Spam Resource, Nov 6, 2025) |
| **Yahoo** | Bulk threshold of 5,000/day to Yahoo consumer addresses, counted across the primary domain. SPF, DKIM and DMARC (p=none or stronger), RFC 8058 one-click unsubscribe, complaint rate at or below 0.3%. Yahoo looks at the complaint rate over weeks to months. | Feb 2024 |
| **Microsoft Outlook.com / Hotmail / Live (consumer)** | Domains sending more than 5,000/day must pass SPF and DKIM and publish DMARC of at least p=none, aligned with SPF or DKIM. Functional unsubscribe and list hygiene are "recommended". Non-compliant mail goes to junk at first, and rejection (`550 5.7.515`) was announced as a later step. Sources disagree on when rejection began. | Announced Apr 2, 2025; enforced from **May 5, 2025** |

**Practical consequence for cold email.** Cold outreach should stay far below 5,000/day per domain. Even so, authentication on every sending domain, low complaint rates and list hygiene are now required just to reach the inbox. Gmail's November 2025 ramp-up applies to everyone. Most cold-email teams also add an unsubscribe or opt-out line, which CAN-SPAM requires for commercial mail.

### Infrastructure
- **Secondary domains.** Never send cold email from the primary company domain. Buy lookalike domains (e.g. `getacme.com`, `tryacme.com`), ideally .com, with no hyphens or numbers (Instantly help center). Redirect them to the main site.
- **Inboxes per domain.** 2–3 (Instantly help center). Some practitioners run 3–5 per domain at high volume (Instantly blog). Topo allows 3–10. The game uses 2–3 as "safe" and 4–5 as "aggressive".
- **Daily sends per inbox.** Warmed Google Workspace or Microsoft 365 inboxes handle about 25–30 cold emails per day before inbox placement falls (LeadHaste, 2026). Instantly's 2026 guidance caps campaign sends at 30 per inbox per day. Some sources say 30–50 is acceptable on domains older than 90 days. Vendors citing 50–100 are outliers. To scale, add inboxes and domains rather than sending more from each inbox.
- **Warmup.** New domains and inboxes need **3–6 weeks** before cold volume (Topo and Unify: at least 3 weeks; Instantly 2026: 4–6 weeks; LeadHaste: full production by week 8). The ramp starts at 5–10 per day, then goes to about 15, then about 30. Keep warmup running at low volume afterwards.
- **Bounce rate.** Keep it **under 2%**. Instantly warns above 2% and auto-pauses a campaign at 5% after 200 or more sends. Lemlist's roundup cites under 3% as healthy, under 1.5% as best in class, and a 5.1% average. Above about 5% reputation degrades fast.
- **Spam complaints.** Target **under 0.1%**, hard ceiling **0.3%** (Google). Cold email gets complaints at a higher rate than opted-in mail, so irrelevance gets punished quickly.
- **Open tracking.** Opens are unreliable. Apple Mail Privacy Protection (since iOS 15, 2021) pre-fetches tracking pixels, corporate security scanners "open" mail automatically, and Gmail proxies images. Vendors estimate opens are inflated by 15–30 percentage points. Many practitioners turn off open and click tracking for cold email, partly because tracking pixels and links may hurt placement (unverified claim). **Measure replies, positive replies and meetings, not opens.** A very low open rate (under about 15%) is still useful as a crude spam-placement alarm.
- **Cost.** A solo founder can stand up 3 domains and 6–9 inboxes plus a sequencer for roughly $100–300/month. This is a game estimate: about $10–15 per domain per year, about $6–8 per Google Workspace or M365 seat per month, and a $40–100/month sequencer. Instantly's own entry stack is listed at about $141/month.

### Response rates in 2025–2026 (with method caveats)
| Metric | Range | Notes and source |
|---|---|---|
| Average reply rate | **~3.4–4.5%** (auto-replies included); **~0.45%** strict | Instantly 2026 report (2025 data): 3.43% average, top quartile 5.5%, top 10% 10.7%+. Saleshandy (Oct 2026): 4.5% average, typical 3–5%. Belkins (via lemlist): 0.45% excluding auto-replies. |
| SaaS/software as a vertical | often **under 2%** | Cleverly via lemlist (2026). SaaS buyers are the most over-prospected. |
| Trend | Declining | Secondary citations of Belkins: about 8.5% (2019), about 5% (2024), about 3–5% (2025). Instantly-adjacent sources: about 7% (2023), 5.1% (2024), 3.43% (2025). |
| Positive share of replies | **~25–50%** (as low as ~14% in some datasets) | Saleshandy: 25–50% among strong campaigns. Another dataset reports 14.1%. |
| Meetings per 100 emails | **0.5–2.5**, top campaigns **2–3** | Cleverly via lemlist; Saleshandy. Instantly assumes 15% of replies become meetings, which gives about 5 meetings per 1,000 sends at a 3.43% reply rate. |
| Small, targeted batches | 2–4x higher reply rate | Saleshandy: under 200 prospects 15–20%, 500–1,000 prospects 8% (their definition). Belkins via secondary sources: about 5.8% for under 50 recipients, about 2.1% for 500+. |
| Personalization | Roughly 2x | Belkins study (16.5M emails, via secondary sources): about 7% with personalization against about 3% without. The exact lift is quoted inconsistently, as 133% or 142%. |

### Sequence design
- **4–7 steps over about 3 weeks.** Instantly recommends 4–7 steps of under 80 words each, spaced 3–4 days apart, or 7 days for enterprise. Saleshandy finds successful sequences run 4–6 follow-ups over 20–21 days.
- **The first email carries the most weight.** Instantly finds 58% of replies come from step 1. Saleshandy finds follow-ups produce about 57% of positive replies. Datasets disagree, but both conclude that follow-ups matter and that one email is not enough.
- **Soft, interest-based CTAs** ("worth a look?") beat a hard ask for 30 minutes. Saleshandy reports 78% more positive replies with a single soft CTA. Use plain text, include no images, and put at most one link (or none) in email 1.
- **Timing.** Tuesday to Thursday mornings in the recipient's local time. Consistent daily volume yields 15–20% more replies than erratic volume (Instantly).
- **AI-generated spam changed the game.** By 2025–26, prospects receive many LLM-written "I noticed you…" emails, so first-name and company merge fields now read as automation (lemlist, 2026). What still works is a specific, verifiable trigger, a narrow segment, a real point of view, short copy and an easy reply. No independent study isolates the effect of AI volume on reply rates. The decline in averages is consistent with more automated volume, but that link is inference.

### Compliance (not legal advice)
- **US (CAN-SPAM):** opt-out based. It applies to B2B, requires a physical address, honest headers and subject lines, and an opt-out honoured within 10 business days.
- **UK (PECR):** unsolicited email to corporate subscribers is allowed with clear identity and an opt-out.
- **EU (GDPR):** B2B prospecting usually relies on legitimate interest with a documented Legitimate Interest Assessment. **Germany (UWG §7)** is treated as consent-required even for B2B.
- **Game rule:** a high-complaint campaign aimed at the EU or Germany carries a small legal-risk event chance.

---

## 3. Sales process numbers

### Funnel (from booked meeting to closed deal)
| Stage | Range | Source |
|---|---|---|
| Show rate (booked to held) | **70–80%** average, 85–90% at the top. Equivalently, a **no-show rate of 20–30%** (over 40% possible for cold outbound booked more than a week out). Meetings booked 1–3 days out see about 12–15% no-shows, against about 24.5% for 7+ days out. SMB no-shows run higher (35–45%), enterprise lower (15–20%). | Vendor roundups citing Chili Piper 2025 and Reply.io 2025 (Naoma, Feb 2026; Komo glossary). Directional. |
| Held meeting to qualified opportunity | **~50–60%** | Bridge Group 2025 implied ratio (median SDR quota of 10 held meetings to 6 opportunities, my derivation); TOPO 58%; Prospeo about 50%. |
| Opportunity to closed-won (win rate) | Under $50k ACV **25–35%**; $50k–250k **18–28%**; over $250k **12–22%**; over $1M 10–18% | "Optifai study of 847 B2B SaaS companies" via Landbase (Apr 2026), not independently verified. Gong 2025 State of Revenue (via SaaStr): about 25% for enterprise customers, with 15–20% typical for scaling startups. Gong 2024 (via The Starr Conspiracy): median of 21%. |
| Pipeline coverage needed | **3–4x** quota (SMB 2.5–3x, mid-market 3–4x, enterprise 4–6x). The better rule is **coverage ≈ 1 / qualified win rate**. | Vendor glossaries (2025–26). Above about 5x usually signals junk pipeline. |

### Sales cycle by ACV (vendor tables; directional)
| ACV | Typical cycle | Source |
|---|---|---|
| Under $1k (self-serve or founder demo) | ~0–25 days | Prospeo 2026 (unsourced table) |
| $1k–5k | ~40 days | Prospeo |
| Under $10k "high-velocity SMB" | 15–30 days | Landbase Apr 2026 |
| $10k–50k (mid-market, 3–7 stakeholders) | 60–90 days (~75) | Landbase; Prospeo |
| $50k–100k | ~120 days | Prospeo |
| $100k+ (enterprise) | 90–180 days; Gong reports about **70 days** for $100k deals among its own customers | Landbase; SaaStr on Gong 2025 |
| $500k+ | 6–18 months (~270 days) | Landbase; Prospeo |

These sources conflict: Gong's 70-day figure for $100k deals comes from a skewed sample of well-run sales teams using Gong. The game uses ranges with randomness. Responding to prospect emails within 24 hours was associated with 14% higher win rates and 11% shorter cycles (Gong Labs, 2022), which is a good founder-responsiveness mechanic.

### CRM pipeline stages
- **HubSpot default pipeline** (with default probabilities): Appointment Scheduled (20%), Qualified to Buy (40%), Presentation Scheduled (60%), Decision Maker Bought-In (80%), Contract Sent (90%), Closed Won (100%), Closed Lost (0%). Practitioners almost always customise these and define stages by **buyer actions and exit criteria** (budget range, named decision-maker, documented pain, timeline), not by seller activity.
- **Salesforce defaults** are similar (Prospecting, Qualification, Needs Analysis, Value Proposition, Id. Decision Makers, Perception Analysis, Proposal/Price Quote, Negotiation/Review, Closed Won/Lost). **Attio** and other modern CRMs start from a blank, customisable object and pipeline, with AI enrichment and auto-logging from email and calendar.
- **A typical solo founder's pipeline** (game default): `Target account → Contacted → Replied (positive) → Meeting booked → Meeting held / discovery done → Trial or pilot (or proposal sent) → Verbal yes / procurement → Closed won | Closed lost | Nurture`. Each card carries the source channel, trigger, ICP fit score, pain, champion, economic buyer, next step with a date, and ACV. A founder's hygiene rule is that **every open deal has a dated next step**. Deals without one are counted as stalled.
- **Qualification frameworks still in use:** BANT (simple, good for SMB), MEDDIC or MEDDPICC (mid-market and enterprise: Metrics, Economic buyer, Decision criteria, Decision process, Paper process, Identify pain, Champion, Competition).

---

## 4. Customer discovery in 2026

### Mom Test principles (Rob Fitzpatrick, *The Mom Test*, 2013; still the standard)
1. Talk about **their life and past behaviour**, not your idea.
2. Ask about **specifics in the past** ("Tell me about the last time…"), not generics or the future ("Would you…?", "Do you usually…?").
3. **Talk less and listen more.** Do not pitch.
- **Bad data types:** compliments ("love it!"), fluff (generics, hypotheticals, future promises), and ideas or feature requests taken at face value. Dig for the motivation behind each request.
- **Good signals are commitments that cost something:** time (a follow-up meeting with the boss, a pilot), reputation (an introduction to a colleague or decision-maker), or money (a pre-order, letter of intent, deposit, or paid pilot). A meeting that ends with "keep me posted" and no commitment is a polite rejection.

### How many interviews and how to recruit
- **Count.** Griffin & Hauser (1993, *Marketing Science*) found that about 20–30 interviews within one homogeneous segment uncover roughly 90%+ of needs (figure from secondary summaries). The working rule: stop when interviews stop producing new needs, typically after **5–10 per narrow segment** before patterns repeat, and **20–30 overall** before major build decisions. A common Mom Test heuristic is that if a handful of conversations in a segment produce no consistent pattern, the segment is too broad and should be sliced further. Ongoing teams follow Teresa Torres's *Continuous Discovery Habits* (2021): at least one customer touchpoint per week.
- **Recruiting response rates** (practitioner estimates, 2025–26): warm network and intros about 40–60%, communities and events about 25–40%, cold outreach about 5–15%. Asking for advice or research ("I'm researching how X teams handle Y; not selling anything") gets far higher response than a pitch. End every interview by asking for 1–2 introductions. Incentives: B2B professionals respond to relevance more than gift cards, while niche experts on paid panels cost about $100–300 per hour (anecdotal). Paid platforms include User Interviews, Respondent and Prolific.
- **AI tooling that is legitimately useful in 2026:** recording, transcription and summarisation (Granola, Otter, Gong, Fathom), tagging and synthesis across transcripts, drafting interview guides, and finding where your ICP talks online. The founder must still read the raw transcripts. Summaries flatten emotion and smooth over contradictions.

### Synthetic users and AI personas: where they help and where they fail
- **Nielsen Norman Group, *Synthetic Users* (June 2024):** synthetic users give shallow, overly favourable feedback. They "idealise" behaviour: one claimed to have finished every course where the real user had finished three, and they claimed to use forums that real users ignore. They cannot prioritise needs and are unreliable on past experience. Acceptable uses are desk research, preparing for a new domain, and drafting hypotheses and interview guides. They should **never** be used for validation or prioritisation.
- **NN/G review of three studies (Aug 2025):** simulations are more accurate when grounded in rich interview data about real individuals ("digital twins") than when built from demographics or persona descriptions. Accuracy is worse for some socioeconomic and political groups.
- Other 2026 commentary describes "persona collapse": distinct profiles converge on the same answers. Vendors claiming 85–94% accuracy against real surveys are disputed.
- **Correct use:** rehearse an interview against an AI persona to catch leading questions, pressure-test the script, and generate hypotheses to check. **AI persona output is never evidence.** The game should give zero validation credit for synthetic interviews, apart from a small boost to interview-script quality.

### Grading interview quality (rubric for the game and the skill)
Score each founder question and turn:
- **Leading question** ("Wouldn't it be great if…?", "Don't you hate…?"): penalty.
- **Hypothetical or future** ("Would you use / pay for…?"): penalty. Responses to it count as fluff.
- **Pitching** (describing the solution before the problem has been fully explored, or talking more than about 30% of the time): penalty.
- **Generic** ("Do you usually…?", "How often do you…?" with no concrete instance): minor penalty.
- **Good question** ("Tell me about the last time…", "What did you try?", "What did that cost?", "Who else was involved?", "What happens if you don't solve it?"): credit.
- **Evidence extracted:** past behaviour, existing workaround, money or time already spent, and a commitment or advancement at the end: strong credit.
- **Compliments recorded as validation:** penalty in the synthesis step.

---

## 5. Obsolete advice (2016 → 2026)

| 2016-era advice | Status in 2026 | Why |
|---|---|---|
| "Send cold email from your main domain or a single inbox, 200–500 per day." | **Obsolete and dangerous** | 2024 Gmail and Yahoo rules, Microsoft's May 2025 rules, and Gmail's Nov 2025 enforcement. Use secondary domains, 2–3 inboxes each, about 30/day per inbox, and warmup. |
| "Track opens and A/B test subject lines by open rate." | **Obsolete** | Apple MPP (2021), security scanners and image proxies inflate opens. Optimise for replies and meetings. Tracking pixels and links may hurt placement. |
| "Predictable Revenue / Cold Calling 2.0: mass email the CEO asking for a referral to the right person." | **Mostly obsolete at volume** | High complaint risk. Executives are flooded with AI sequences. Signal-based, narrowly segmented outreach replaced volume. |
| "Buy a static list from a data vendor and blast it." | **Obsolete** | Bounce rate above 2% and complaints above 0.3% now get you rejected. Use waterfall enrichment plus verification, and a fresh, trigger-based list. |
| "Merge-field personalization (first name, company) is enough." | **Obsolete** | Every AI tool does it, and it reads as automation. Specific, relevant triggers and a point of view are required. |
| "Average cold email reply rate is 5–10%." | **Outdated** | 2025–26 averages run about 1–4.5% depending on definition, and under 2% for SaaS buyers. |
| "Automate LinkedIn: 100+ invites per day with bots." | **Obsolete** | About 100 per week practical limit, an anti-automation crackdown (Apollo and Seamless pages removed, March 2025), and account restrictions. |
| "Hire SDRs early to scale outbound." | **Changed** | Founder-led sales comes first. AI tools now handle research and drafting. Autonomous AI SDRs show high churn and hallucination, so use them only after the founder has a working message. |
| "Build a pipeline in Salesforce from day one." | **Changed** | Lightweight AI-native CRMs (Attio, HubSpot free/Starter, Folk) auto-log email and calendar. Process matters more than the tool. |
| "Get out of the building and survey 100 people: 'Would you use this?'" | **Obsolete framing** | The Mom Test standard: past behaviour and commitments, not surveys of hypothetical intent. |
| "Ask an AI / survey panel instead of interviewing." (new 2024–26 temptation) | **Wrong** | NN/G: synthetic users are sycophantic and idealised. Use them for rehearsal and hypotheses only. |
| "Customer development: exactly N interviews, then build." | **Changed** | Continuous discovery (weekly touchpoints) plus saturation-based stopping. AI transcription makes interviews cheaper to run and synthesise, but no less necessary. |
| "Long, value-prop heavy cold emails with a calendar link." | **Obsolete** | Under about 80 words, plain text, soft interest CTA, no link in email 1. |

---

## 6. Simulation parameters

| Parameter | Value or range used in game | Indie vs VC difference | Source (date) |
|---|---|---|---|
| Inboxes per sending domain | Safe 2–3; aggressive 4–5 (raises the reputation-hit chance) | None | Instantly Help Center, *secondary sending domains* (accessed Oct 2026); Instantly blog high-volume infra (2025–26) — https://help.instantly.ai/en/articles/6502027 |
| Secondary domains for a solo founder | 2–3 to start (about 4–9 inboxes) | VC teams scale to 10+ domains | Instantly blog; Unify cold email 2026 guide — https://www.unifygtm.com/explore/cold-email-2026-domain-setup-deliverability-sequences |
| Safe cold sends per inbox per day | 25–30 (warmed). 30–50 tolerated on aged domains with a growing penalty. Above 50 is high risk. | None | LeadHaste *Cold email sending limits 2026*; Instantly *AI Sales Agent Benchmarks 2026* (Sep 16, 2026): cap of 30 — https://leadhaste.com/blog/cold-email-sending-limits-2026 ; https://instantly.ai/blog/ai-sales-agent-benchmarks-2026-the-complete-performance-report/ |
| Warmup duration (new domain or inbox) | 3–6 weeks (default 4). Ramp of 5–10, then 15, then 30 per day. Skipping it gives a high chance of spam placement. | None | Topo / Unify (3 weeks min); Instantly (Sep 2026): 4–6 weeks; LeadHaste: 8 weeks to full volume |
| Bounce rate threshold | Healthy under 2%; warning 2–5%; auto-pause or reputation hit at 5% or more | None | Instantly (Sep 2026); lemlist *Cold Email Benchmarks 2026* (Aug–Sep 2026) — https://lemlist.com/blog/cold-email-benchmarks/ |
| Bounce by list quality | Verified 1.2%; unverified 2.1%; risky 2.2%; "bad" 10.6% | VC teams buy better data | Saleshandy *cold email statistics* (updated Oct 7, 2026) — https://saleshandy.com/blog/cold-email-statistics/ |
| Spam complaint threshold | Target under 0.1%; hard ceiling 0.3% (above it, deliverability collapses and Gmail rejects) | None | Google *Email sender guidelines* — https://support.google.com/a/answer/81126 (rules since Feb 2024; enforcement ramp Nov 2025 per https://www.spamresource.com/2025/11/google-warns-sender-requirements.html) |
| Bulk-sender threshold | 5,000/day to one provider means full SPF+DKIM+DMARC plus one-click unsubscribe (Gmail, Yahoo, Outlook) | None | Google (2024); Microsoft Outlook (Apr 2, 2025; enforced May 5, 2025) — https://techcommunity.microsoft.com/blog/outlook/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730 |
| Reply rate, generic AI/merge-field blast to a broad list | 0.5–1.5% | — | *Game synthesis* from Belkins strict 0.45% and SaaS under 2% (Cleverly via lemlist, 2026); AI-at-scale 0.5–1.5% (LeadGen Economy, Apr 2026) |
| Reply rate, segment-relevant, basic personalization | 2–4% | — | Instantly 2026 report average 3.43% (2025 data); Saleshandy typical 3–5% (Oct 2026) |
| Reply rate, signal-based plus researched first line, small batches | 5–10% | — | Instantly top quartile 5.5% / top 10% 10.7%; Belkins personalization about 7% against 3% (secondary sources) |
| Reply rate, 1:1 hand-written to warm or engaged prospects (under 50 per batch) | 10–20%+ | Indie founders with an audience reach this more often | Saleshandy small campaigns 15–20% (Oct 2026); LinkedIn engaged 36.4% against cold 11.4% (practitioner anecdote) |
| SaaS-buyer penalty | Multiply reply rate by about 0.6–0.8 when the ICP is software/SaaS | — | *Game synthesis* from Cleverly via lemlist (SaaS often under 2%) |
| Positive share of replies | 25–50% (default 35%); generic blasts 15–25% | — | Saleshandy (Oct 2026); 14.1% low-end dataset cited in search summaries |
| Meeting booked rate | 0.5–2.5 meetings per 100 contacts (default 1); about 15–40% of positive replies become meetings | VC-backed teams with SDRs can reach the top end | Cleverly via lemlist (2026); Instantly (Sep 2026) assumption of 15% of replies; Saleshandy top campaigns 2–3 per 100 |
| No-show rate | 20–30% baseline. +10–15 points for SMB or cold bookings 7+ days out. 12–15% if booked 1–3 days out with reminders. 15–20% enterprise. | SMB-focused indies see more no-shows | Naoma (Feb 2026) citing Chili Piper 2025 and Reply.io 2025; Komo glossary — https://naoma.ai/blog/article-01-demo-no-shows |
| Held meeting to qualified opportunity | 50–60% (founder-run). AI-SDR-booked meetings about 35–45%. | — | Bridge Group 2025 implied 10 to 6 (secondary sources); TOPO 58%; AI-set "mid-teens vs low-20s" opportunity conversion (LeadGen Economy, Apr 2026, unsourced) |
| Opportunity to close (win rate) by segment | SMB (under $15k ACV) 25–35%; mid-market ($15–100k) 18–28%; enterprise ($100k+) 12–22% | Indie SMB deals mostly sit at the top band | Optifai 847-company study via Landbase (Apr 10, 2026) — https://www.landbase.com/blog/win-rate-benchmarks-industry-deal-size-2026 ; Gong 2025 about 25% (SaaStr) |
| Held meeting to close (derived) | SMB about 12–20%; mid-market about 9–17%; enterprise about 6–13% | — | *Game synthesis* = (meeting to opportunity) × (win rate) |
| Sales cycle by ACV | Under $1k: 0–25 days; $1–10k: 15–45 days; $10–50k: 60–90 days; $50–100k: 90–120 days; $100k+: 90–180 days (σ wide); $500k+: 6–18 months | Enterprise largely VC territory; security review and procurement add 30–90 days | Prospeo *Close deals faster* (2026, unsourced table) — https://prospeo.io/s/close-deals-faster ; Landbase (Apr 2026); SaaStr on Gong 2025 ($100k ≈ 70 days) |
| Pipeline coverage needed | ≈ 1 / win rate (SMB 3x, mid-market 4x, enterprise 5x) | VC boards track this; indies rarely do | Vendor glossaries 2025–26, e.g. https://getboomerang.ai/glossaries/pipeline-coverage-ratio-benchmarks-2026 |
| Response-speed bonus | Replying to a prospect within 24h: +14% win rate, −11% cycle | — | Gong Labs (2022) via search summary |
| LinkedIn connection request weekly limit | 100 per rolling 7 days (standard); 150–200 for mature Sales Navigator or high-SSI accounts. Limit drops if acceptance is under about 30% or invites get reported. | VC teams pay for Sales Navigator | Vendor guides 2026 (Salesforge, LinkedFusion, Konnector); LinkedIn publishes no official number — https://linkedfusion.io/blogs/linkedin-limits-guide/ |
| LinkedIn automation risk | Bots or scrapers: restriction-event chance per week rises with volume | — | LinkedIn action against Apollo and Seamless pages (Mar 2025) — https://playground.lagrowthmachine.com/t/round-2-with-linkedin-what-really-happened-what-it-means-for-you/4455 |
| Multichannel multiplier | Email + LinkedIn about 2x positive replies; email + LinkedIn + calls about 3–8x over email alone | — | Saleshandy channel-mix data (Oct 2026) |
| Sequence length and timing | 4–7 steps over about 21 days, under 80 words, 3–4 day gaps (7 for enterprise). Step 1 brings about 40–60% of replies. | — | Instantly (Sep 2026); Saleshandy (Oct 2026) |
| Open-rate signal | Shown to the player as "unreliable" (inflated 15–30 points). Under 15% triggers a "possible spam folder" hint only. | — | BounceZero / Prospeo 2026 (vendor estimates); lemlist (2026) |
| AI SDR effectiveness | Volume ×3–5 and founder hours −70%. Reply rate degrades to 0.5–1.5% within about 4–8 weeks unless deliverability is managed. Hallucination in 12–20% of emails (each can cause a complaint or reputation hit). Meetings worth about 60% of founder-booked meetings. 50–70% of programs cancelled within 90 days. Cost $2–5k/month (managed). | Indie: rarely affordable. VC: frequently pitched, and boards may push it. | TechCrunch via secondary sources (Mar 24, 2025) on 11x; LeadGen Economy (Apr 18, 2026) — https://leadgen-economy.com/blog/ai-sdr-cancellation-wave-failure-forensics/ (mostly author estimates) |
| AI-assisted (human-in-loop) outbound | Research and drafting time −50–70% with no penalty to reply rate if the founder edits | — | *Game synthesis* from hybrid-model consensus (LeadGen Economy 2026; Instantly 2026) |
| Waterfall enrichment coverage | Single source 40–50% email find rate; waterfall 75–80% | VC teams afford Clay plus multiple providers | LeadMagic / Prospeo guides 2026 (vendor claims) |
| Outbound stack cost | Solo: $100–300/month (domains, inboxes, sequencer, Apollo). Plus Clay ($149+/month) and Sales Navigator (about $100/month). | Indie stays at the low end | Instantly entry stack about $141/month (Sep 2026); Clay $149 (LeadGen Economy 2026) |
| Interviews to saturation | 5–10 per narrow segment; 20–30 overall before a major decision | — | Griffin & Hauser (1993) via secondary sources; Fitzpatrick (2013) |
| Interview recruiting response rate | Warm 40–60%; community 25–40%; cold 5–15% | Indies with an audience get warm rates | Practitioner guides 2025–26 (search summary; anecdotal) |
| Synthetic persona evidence weight | 0 validation credit; +small script-quality bonus when used for rehearsal | — | NN/G *Synthetic Users* (Jun 21, 2024); NN/G three-study review (Aug 2025) — https://www.nngroup.com/articles/synthetic-users/ |
| Interview quality scoring | Each leading, hypothetical or pitching turn lowers the insight quality of that interview. A commitment at the end (intro, pilot, LOI, pre-pay) is the only "validation" signal. | — | Fitzpatrick, *The Mom Test* (2013) |

---

## Sources

Dates are publication or last-updated dates where shown. "Accessed" means no date was visible on the page. Vendor sources are marked (V).

**Mailbox-provider rules**
- Google Workspace Admin Help, *Email sender guidelines*, https://support.google.com/a/answer/81126 (requirements effective Feb 1, 2024; accessed Oct 2026)
- Spam Resource (Al Iverson), *Google warns: sender requirements enforcement ramping up*, Nov 6, 2025, https://www.spamresource.com/2025/11/google-warns-sender-requirements.html
- Microsoft Tech Community, *Strengthening Email Ecosystem: Outlook's New Requirements for High-Volume Senders*, Apr 2, 2025, https://techcommunity.microsoft.com/blog/outlook/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730
- dmarcian, *Microsoft enforces SPF, DKIM, DMARC*, 2025, https://dmarcian.com/microsoft-enforces-spf-dkim-dmarc/
- Mailgun, *Yahoo requirement insights with Marcel Becker*, 2024, https://mailgun.com/blog/deliverability/yahoo-requirement-insights-with-marcel-becker
- Close Help, *Requirements for bulk email senders*, https://help.close.com/docs/requirements-for-bulk-email-senders (accessed Oct 2026)

**Cold email benchmarks and infrastructure**
- Instantly (V), *AI Sales Agent Benchmarks 2026*, updated Sep 16, 2026 (data Jan–Dec 2025), https://instantly.ai/blog/ai-sales-agent-benchmarks-2026-the-complete-performance-report/
- Instantly Help Center (V), *Scale your cold email campaigns with secondary sending domains*, https://help.instantly.ai/en/articles/6502027 (accessed Oct 2026)
- Instantly (V), *The Cold Email Infrastructure That Gets Us 10–20+ Positive Replies A Day*, https://instantly.ai/blog/more-positive-replies-with-more-sending-inboxes/ (accessed Oct 2026)
- Saleshandy (V), *Cold email statistics*, updated Oct 7, 2026, https://saleshandy.com/blog/cold-email-statistics/ (internal inconsistencies noted above)
- lemlist (V), *Cold Email Benchmarks 2026*, Aug 17, 2026 (updated Sep 28, 2026), https://lemlist.com/blog/cold-email-benchmarks/
- LeadHaste (V), *Cold email sending limits 2026*, https://leadhaste.com/blog/cold-email-sending-limits-2026 ; *Outbound sales benchmarks 2026*, https://www.leadhaste.com/blog/outbound-sales-benchmarks-2026
- Topo (V), *Email warm up*, https://www.topo.io/blog/email-warm-up (accessed Oct 2026)
- Unify (V), *Cold email 2026: domain setup, deliverability, sequences*, https://www.unifygtm.com/explore/cold-email-2026-domain-setup-deliverability-sequences
- BounceZero (V), *Email Open Rate Guide 2026*, https://bouncezero.io/email-open-rate-guide-2026
- Prospeo (V), *Email Open Tracking 2026*, https://prospeo.io/s/open-tracking ; *Personalized Outbound Email 2026*, https://prospeo.io/s/personalized-outbound-email
- Postmark, *How Apple's Mail Privacy changes affect email open tracking*, https://postmarkapp.com/blog/how-apples-mail-privacy-changes-affect-email-open-tracking (2021)
- LeadMagic (V), *Waterfall enrichment guide*, https://leadmagic.io/blog/waterfall-enrichment-guide (2026)

**AI SDRs and LinkedIn**
- TechCrunch (Marina Temkin), 11x investigation, Mar 24, 2025, as summarised by https://usagepricing.com/blueprint/activity/2025-03-24-11x-customer-claims-controversy and https://salesmotion.io/blog/ai-sdr-claims-scrutiny-what-buyers-should-verify (original not retrieved)
- LeadGen Economy, *The AI SDR Cancellation Wave*, Apr 18, 2026, https://leadgen-economy.com/blog/ai-sdr-cancellation-wave-failure-forensics/ (many figures are author estimates)
- LinkedFusion (V), *The Reality of LinkedIn Limits in 2026*, https://linkedfusion.io/blogs/linkedin-limits-guide/ ; Salesforge (V), https://www.salesforge.ai/blog/linkedin-connection-request-limit
- La Growth Machine community, *Round 2 with LinkedIn*, 2025, https://playground.lagrowthmachine.com/t/round-2-with-linkedin-what-really-happened-what-it-means-for-you/4455

**Sales process**
- Landbase (V), *Win rate benchmarks by industry and deal size 2026*, Apr 10, 2026, https://www.landbase.com/blog/win-rate-benchmarks-industry-deal-size-2026
- SaaStr, *Gong: $100k deals take about 70 days to close* (Gong 2025 State of Revenue), https://www.saastr.com/gong-100k-deals-take-about-days-to-close
- Prospeo (V), *Close Deals Faster in 2026*, https://prospeo.io/s/close-deals-faster ; *SDR conversion rate benchmarks 2026*, https://prospeo.io/s/sdr-conversion-rate
- Naoma (V), *Demo no-shows*, Feb 1, 2026, https://naoma.ai/blog/article-01-demo-no-shows ; Komo glossary, https://komo.ai/glossary/product-demo
- Boomerang (V), *Pipeline coverage ratio benchmarks 2026*, https://getboomerang.ai/glossaries/pipeline-coverage-ratio-benchmarks-2026
- HubSpot deal stages explainers: https://www.sybill.ai/blogs/hubspot-deal-stages ; https://www.askelephant.ai/blog/hubspot-deal-stages-explained-default-stages-custom-stages-and-what-moves-deals-automatically

**Compliance**
- BounceZero (V), *Email GDPR Compliance Guide 2026*, https://bouncezero.io/email-gdpr-compliance-guide-2026 ; Overloop, *B2B cold email Germany GDPR compliance*, https://overloop.com/blog/b2b-cold-email-germany-gdpr-compliance

**Customer research**
- Rob Fitzpatrick, *The Mom Test* (2013), https://www.momtestbook.com/
- Griffin, A. & Hauser, J. R. (1993), "The Voice of the Customer," *Marketing Science* 12(1):1–27, doi:10.1287/mksc.12.1.1 (the 20–30 interviews / 90% figure is from secondary summaries)
- Teresa Torres, *Continuous Discovery Habits* (2021)
- Nielsen Norman Group, Rosala & Moran, *Synthetic Users: If, When, and How to Use AI-Generated "Research"*, Jun 21, 2024, https://www.nngroup.com/articles/synthetic-users/
- Nielsen Norman Group, Budiu, *Evaluating AI-Simulated Behavior: Insights from Three Studies on Digital Twins and Synthetic Users*, Aug 2025, https://www.nngroup.com/articles/ai-simulations-studies/
- CustomerThink, *Synthetic Personas are a Compass, Not a Map* (2026), https://customerthink.com/?p=1083159
- NYU Entrepreneurial Institute, *85 new ways to find customers for discovery*, Oct 3, 2025, https://entrepreneur.nyu.edu/blog/2025/10/03/85-new-ways-to-find-customers-for-discovery-sales/
