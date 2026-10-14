---
name: founder-support-and-reputation
description: Set up and run customer support and online reputation for a real SaaS or subscription app in 2026 - sizing ticket volume, response-time targets, AI support agents (Intercom Fin, Zendesk AI and home-made agents) and what they can really resolve, CSAT/NPS, status pages and outage communication, asking for reviews on G2/Capterra/Trustpilot/App Store, replying to bad reviews, and staying within the FTC fake-review rule. Use when the user asks how to handle support as a solo founder, how fast to reply, whether an AI agent can do support, what a good CSAT or NPS is, how to get more reviews, how to respond to a 1-star review, whether buying or incentivizing reviews is allowed, or how to communicate an outage.
---

# Founder support and reputation (2026)

You are advising a real founder. Use the numbers below and label each as measured, vendor-claimed or estimated. Never
invent benchmarks. Most published support benchmarks are vendor data with unpublished methods, so say so. Full data and
sources are in `docs/research/world-ops-support-life.md` §2 and `public/data/world.js` (`SUPPORT`, `REVIEWS`).

## Step 1: Size the support load

Ask for: business model (B2C, SMB, enterprise), paying customers, trial signups per month, release cadence, docs
quality, and current median first-response time.

Estimate monthly tickets with these ranges [estimates anchored on vendor blogs]:
- B2C: 0.08–0.2 per paying customer per month (vendor-cited 1.2–2.4 contacts per customer per year).
- SMB B2B: 0.25–0.6 per customer per month (blogs cite 0.2–0.5 for mature products with good docs).
- Enterprise: 1–4 per account per month (accounts have many users; blogs cite 4–8 contacts per year per customer).
- Multiply by 2–3 in a customer's first 30 days, 1.5 in a release week with breaking changes, and 3–10 during an outage.
- Good docs and in-app guidance give roughly 0.7.

Convert to hours: B2C ~6 min per ticket, SMB ~15, enterprise ~40 (game assumptions; ask the founder for their real
average). If support exceeds ~8 h a week, recommend the fixes in Step 3 before hiring.

## Step 2: Set response-time targets and explain why

- The 2025 software median first reply is about 47 minutes (Freshworks, vendor). The top 20% reply in under 3 minutes and
  the slow tier in about 6 hours. An older SuperOffice study averaged 12 hours for email.
- B2B targets: good under 12 h, better under 4 h, best under 1 h. Chat: under 2 minutes.
- Slower replies correlate with churn. One vendor dataset shows 71% retention when replying within an hour vs 48% at
  24 hours, but hard cases are both slow and churn-prone, so the effect is overstated. Present it as a correlation.
- For a solo founder, recommend: an auto-acknowledgement with an honest expected time, two fixed support blocks a day,
  and a same-day rule for paying customers. Enterprise cares more about resolution time and SLA terms than first reply.

## Step 3: Decide what AI should handle

- Vendor claims: Intercom Fin averaged ~67% resolution in 2025 and ~76% in mid-2026. Intercom says Fin resolves 81% of its
  own support. Case studies cluster at 42–50%, and an independent small-business test measured 38%. A "resolution"
  includes customers who simply stopped replying.
- Intercom's 2026 report says 82% of support leaders invest in AI but only 10% have reached mature deployment.
- Tell the founder to plan for 30–55% in year one and 55–70% only with strong docs plus actions (refunds, plan changes,
  account lookups). Pricing is about $0.99 per resolution, and some vendors have minimums (see `hr-legal-product.md`).
- Keep humans on: billing disputes, angry or churn-risk customers, bugs that need code, enterprise escalations, and
  anything legal or security-related.
- Require an easy path to a human. Review a sample of AI answers weekly, because wrong confident answers cost more CSAT
  than slow ones.

## Step 4: Measure satisfaction

- CSAT of 75–85% is "good" (vendor guides). NPS medians: B2B about 30–40 (Survicate 2025 B2B 38, software 30), B2C about
  49. Enterprise-focused products score higher than self-serve SMB tools.
- Track trends against the founder's own baseline, not a single industry number. Read every detractor comment. Tag
  tickets by cause (bug, how-to, billing, feature request) and fix the top cause each month.

## Step 5: Communicate incidents

- Set up a public status page and an in-app banner before the first outage. Post within 15 minutes, update every 30–60
  minutes, and publish a short postmortem for anything over an hour.
- Upstream outages happen to everyone (AWS us-east-1 in Oct 2025, Cloudflare in Nov 2025). Say what is affected, not
  whose fault it is.
- Proactive communication cuts ticket volume during an incident. Treat the 0.6× figure in the research file as an
  estimate.

## Step 6: Get reviews legally

- **Rules first.** The FTC rule on fake reviews has applied since 2024-10-21. It bans fake or AI-written reviews, buying
  positive reviews, sentiment-conditioned incentives, undisclosed employee or family reviews, and suppressing negative
  reviews. Civil penalties for knowing violations can reach $51,744 per violation (2024 figure, indexed annually).
  Incentives are allowed only if they are not tied to a positive rating and are disclosed. Refuse to help write fake
  reviews or to gate review requests to only happy customers in a way that suppresses negatives.
- **Where.** B2B: G2 and Capterra (buyers use them for shortlists, and AI chatbots cite them; in 2026, 51% of B2B buyers
  start research in a chatbot, per G2's vendor survey). B2C apps: App Store and Google Play. Consumer web: Trustpilot.
- **When to ask.** Right after an "aha" moment, a resolved ticket rated 5, a renewal or upgrade, or about 90 days in.
- **Expected yield** [estimates]: B2B email ask 4–10%, with a compliant incentive 15–25%, and a personal ask after a win
  20–35%. iOS allows the system prompt at most 3 times per user per year. Expect 1–3% of prompted users to rate.
- **Thresholds** [shape from e-commerce studies, magnitude estimated]: going from 0 to 5 reviews matters most (Spiegel
  2017: five reviews made purchase about 4× more likely in e-commerce). Twenty or more reviews from the last 12 months
  keep the listing credible. The best average is 4.2–4.7, because perfect 5.0 looks fake. For apps, below 4.0 hurts
  sharply (one vendor index puts 4★ at 0.83 and 3★ at 0.57 of 5★ conversion).

## Step 7: Handle negative reviews

1. Reply within 48 hours, publicly, short, without arguing. Acknowledge the issue, state the fix or next step, and offer a
   direct contact.
2. Fix the cause, then tell the reviewer. Many people update their rating.
3. Never offer money for removing or changing a review. That is review manipulation.
4. Report a review only if it breaks platform rules (wrong product, a competitor, abuse). Platforms remove about 7% of
   submissions as fake (Trustpilot 2024), so legitimate reports work.

## Output format

Give the founder:
1. A one-table support plan: expected tickets per week, hours per week, target first response, AI share, and the escalation list.
2. A review plan: platform, trigger moment, the exact ask text, a monthly target and a compliance note.
3. Two templates: an outage status update and a reply to a 1★ review.
4. A list of which numbers are estimates and what they should measure in their own data within 30 days.
