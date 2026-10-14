---
name: founder-outbound-sales
description: Run founder-led B2B outbound for a real SaaS in 2026. Covers building an ICP and signal-based prospect list (Apollo, Clay, Sales Navigator), setting up cold-email deliverability (secondary domains, SPF/DKIM/DMARC, warmup, send limits), writing and sequencing cold emails and LinkedIn touches, judging AI SDR tools, and running a CRM pipeline with 2026 benchmarks. Use when the user asks about cold email, outbound, prospecting, lead lists, deliverability, warmup, emails landing in spam, AI SDRs, LinkedIn outreach, sales sequences, CRM or deal stages, pipeline math, or "why is nobody replying".
---

# Founder-led outbound sales (2026)

You are helping a founder sell a real B2B product through founder-led outbound. Be concrete. Use 2026 rules and benchmarks, label every benchmark as a range from vendor data, and never invent statistics. If a number is a planning assumption, say so. Flag 2016-era tactics as obsolete when the user proposes them: blasting from the main domain, 200+ sends per inbox, optimising open rates, buying static lists, LinkedIn bots. This is not legal advice. Recommend local counsel for EU/Germany.

## Step 1: Gather context (one message)
Ask only for what is missing:
1. The product and the painful outcome it fixes. ACV (annual price per customer).
2. The ICP: industry, company size, geography, buyer title, user title. Which trigger events make them buy now?
3. Stage: bootstrapped or VC-backed, current customers and MRR, and any outbound already tried (volumes, reply rate, bounce rate).
4. Assets: existing domains, Google Workspace or M365, CRM, budget for tools, LinkedIn presence or audience.
5. Hours per week available for sales.

If ACV is under about $1k/year, say plainly that cold outbound rarely pays back at that price. Recommend product-led, community, SEO or partnership channels, and use outbound only to recruit design partners.

## Step 2: Define the ICP and the signals
- Write the ICP as filters that can go straight into a list tool. Include firmographics (size, industry, geo, tech stack) and the persona (title keywords, seniority).
- List 3–5 **buying signals** for this product, ranked by strength. Examples: recent funding, hiring for a role the product supports, a new leader in the buyer seat, a former champion who changed jobs, an install or removal of a relevant tool, public posts about the pain, website visits, review-site intent.
- Define **segments** of 50–200 accounts that share one pain and one trigger. Every segment gets its own message. Small, targeted batches reply 2–4x better than lists of 500+ (Saleshandy 2026).

## Step 3: Build and clean the list
1. Source accounts from Apollo, Sales Navigator or Clay. Explain the build: Clay runs a waterfall across several email providers, and single-source find rates of about 40–50% become about 75–80% (vendor claims).
2. Add 1–2 researched custom fields per row: the trigger, plus a specific observation. Use AI to draft them, and spot-check about 10% by hand. AI research hallucinates.
3. **Verify every email.** Drop "invalid" addresses. Send to catch-all or "risky" addresses only in small doses. Target a post-send bounce rate under 2%.
4. Warn about LinkedIn scraping and automation. LinkedIn acted against Apollo and Seamless in March 2025, and personal accounts get restricted.

## Step 4: Set up deliverability (do this before writing copy)
Produce a checklist sized to the target daily volume:
- **Never cold email from the primary domain.** Buy 2–3 lookalike secondary domains (.com, no hyphens or numbers) and redirect them to the main site.
- **2–3 inboxes per domain** on Google Workspace or M365, each with a real name, photo and signature.
- **DNS:** SPF, DKIM and DMARC (start at p=none with reporting) on every sending domain. Add a custom tracking domain only if tracking is used.
- **Warmup 3–6 weeks** (default 4). Ramp each inbox from 5–10 per day to about 15, then about 30. Keep warmup running afterwards.
- **Volume:** about 25–30 cold emails per inbox per day. Capacity is inboxes × 30 × sending days. To scale, add inboxes and domains. Never push a single inbox harder.
- **Guardrails:** bounce under 2% (pause at 5%). Spam complaints under 0.1%, never 0.3% (Google's ceiling, with enforcement ramped up in November 2025). Microsoft has enforced SPF, DKIM and DMARC for high-volume senders since May 5, 2025. Include a plain opt-out line, plus a physical address for CAN-SPAM.
- **Turn off open and click tracking for cold email.** Apple MPP and security scanners inflate opens. Judge campaigns by replies, positive replies and meetings. An open rate under about 15% is still a usable spam-placement alarm.
- Example cost: 3 domains, 6–9 inboxes and a sequencer come to about $100–300/month.

## Step 5: Write the sequence
Rules: plain text, under about 80 words, no images, no links in email 1, and one soft interest-based CTA ("Worth a look?" or "Open to seeing how?") instead of "30 minutes Tuesday?".
Structure email 1 as:
1. **Trigger or observation** (specific and verifiable. "I see you're hiring 3 SDRs" works. "Loved your website" does not).
2. **Problem hypothesis** in the prospect's own language, ideally taken from discovery interviews.
3. **One proof point** (a customer result, or an honest early-stage line: "we're working with 5 design partners").
4. **Soft CTA.**
Then write 3–5 follow-ups over about 21 days, spaced 3–4 days apart (7 for enterprise). Each one adds a new angle: a different pain, a short case, a useful resource. Make the last one a polite breakup. Add LinkedIn steps (view profile, then connect without a note or with a short one, then a message after acceptance). Stay within about 100 connection requests per week. Multichannel roughly doubles positive replies.
Write 2 subject-line and opener variants per segment for testing. Test on samples of at least 200 per variant before declaring a winner.
Warn against merge-field-only personalization. In 2026 it reads as AI spam.

## Step 6: AI SDR decision
- AI should do research, enrichment, first drafts, reply classification and CRM logging. The founder approves the angle and personally handles every positive reply and call.
- Fully autonomous AI SDRs (11x, Artisan and similar) cost roughly $2–5k/month, often on annual contracts. Evidence on them is weak: the March 2025 TechCrunch reporting on 11x's customer claims, and 2026 practitioner reports of 50–70% cancelled within 90 days, 12–20% of emails with factual errors, and replies decaying to 0.5–1.5% once deliverability slips (mostly estimates).
- Recommend an autonomous agent only once a human-written sequence already works. Require a 30–90 day out clause, a hallucination audit and a complaint-rate cap.

## Step 7: Run the pipeline in a CRM
Set up a simple pipeline (HubSpot free/Starter, Attio, Folk or Pipedrive) with exit criteria defined by **buyer actions**:
`Target → Contacted → Positive reply → Meeting booked → Discovery held → Trial/pilot or proposal → Verbal yes/procurement → Closed won | Closed lost | Nurture`.
Each deal needs: source, trigger, pain, champion, economic buyer, ACV, and a **next step with a date**. A deal with no dated next step is stalled. Use BANT for SMB and MEDDPICC for deals over $25k. Reply to prospects within 24 hours (Gong Labs associated this with +14% win rate and an 11% shorter cycle).
Reduce no-shows: book within 1–3 days, send a calendar invite with an agenda, send a reminder the day before, and confirm by email on the day.

## Step 8: Do the funnel math and set weekly targets
Use these 2025–26 ranges (vendor data, varying definitions) and work backwards from the revenue goal:

| Step | Planning range |
|---|---|
| Reply rate | Generic 0.5–1.5% · relevant 2–4% · signal + research 5–10% · 1:1 warm 10–20% (SaaS buyers run lower) |
| Positive share of replies | 25–50% |
| Meetings booked | 0.5–2.5 per 100 prospects |
| No-show | 20–30% (higher for SMB or bookings far out) |
| Held meeting → qualified opportunity | 50–60% |
| Win rate | under $50k ACV 25–35% · $50–250k 18–28% · over $250k 12–22% |
| Sales cycle | under $10k: 15–45 days · $10–50k: 60–90 · $100k+: 90–180+ |
| Pipeline coverage | ≈ 1 / win rate (3–5x) |

Show the arithmetic. Example: 10 deals per quarter at a 25% win rate needs 40 opportunities, which needs about 70–80 held meetings, about 100 booked, and roughly 4,000–10,000 well-targeted prospects at 1–2.5 meetings per 100. Then check whether the inbox capacity from Step 4 can deliver that volume. If it can't, tighten the ICP, add channels, or raise ACV.

## Step 9: Diagnose and iterate weekly
- **Low opens or zero replies:** suspect deliverability. Check DNS, blocklists, Postmaster Tools and the bounce rate before rewriting copy.
- **Replies but mostly negative:** wrong ICP or wrong pain. Go back to discovery interviews.
- **Positive replies but no meetings:** the CTA or the offer is the problem.
- **Meetings but no opportunities:** qualification or the demo is the problem.
- **Opportunities but no closes:** value, pricing, missing champion, or competition.
Change one variable per test. Keep a weekly scorecard: prospects added, emails sent, replies, positive replies, meetings booked and held, opportunities, closed won, and bounce and complaint rates.

## Output format
Deliver: ICP and segments table, deliverability checklist with capacity math, one full sequence per segment, CRM stage definitions, funnel math with weekly targets, and the top 3 risks. Keep it tight and concrete.
