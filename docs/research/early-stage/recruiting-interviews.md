# Recruiting people for customer interviews (early stage)

Scope: how early-stage founders get people to talk, response and show rates, incentives, screening, time cost, and segment differences, for the simulator's recruiting mechanics. Figures are marked by confidence. Vendor and competitor blogs dominate this topic, so treat their numbers as directional. [design] = design assumption for the sim, not a statistic.

## 1. Channels

| Channel | Typical reply/show behavior | Confidence |
|---|---|---|
| Warm intro (mutual contact, forwardable email) | Highest reply rates of any channel. No clean public benchmark found. | [unverified] reply rates, high |
| Existing users, waitlist, signups | Easiest. Vendor claim of 40-60% completion from own customer lists vs 7-15% for scheduled recruitment (Koji, self-reported). https://www.koji.so/docs/user-research-recruitment-email-templates | Vendor claim |
| Cold email to prospects | Generic cold email averages about 3.4% reply in 2026 (Woodpecker), down from 5.1% in 2024. Well-targeted B2B reaches about 10-18%. Relevance is the main driver: 71% of decision-makers cite lack of relevance. https://woodpecker.co/blog/ , https://hunter.io/the-state-of-cold-email-2025 | Vendor data, mixed |
| Cold email to founders for interviews | One anecdote: 50 emails, 20 replies (40%), 15 calls. Not a sample. https://www.sequenzy.com/blog/cold-email-sequence-examples | Anecdote |
| LinkedIn connection requests | Platform average acceptance about 28.5% over 13.2M requests (Expandi, May 2025-Apr 2026). Reply to the connection note about 3.0%. Personalized requests reportedly reach about 45% vs about 15% generic. https://expandi.io/blog/linkedin-outreach-benchmarks-2026/ | Vendor data |
| LinkedIn follow-up after accept | About 10.4% reply (Expandi). Recruiter sequences show 34% (Noon, single platform). https://www.noon.ai/blog/articles/192-linkedin-connection-acceptance-rate-benchmarks | Vendor data |
| Reddit / Slack / Discord / Indie Hackers | Depends on subreddit rules. Many communities restrict recruiting posts, and new accounts that only post links get flagged. Contribute before asking. No reliable reply benchmark found. | [unverified] |
| User panels (User Interviews, Respondent) | Use for hard-to-reach or segment-specific sampling. Costs and fraud are below. | See sections 2-3 |
| Competitor customer lists | Reach is high, but outreach is sensitive and some competitor customers may be contractually restricted. No benchmark found. | [design] |
| Conferences, meetups | Good for in-person conversations; low volume per hour. No benchmark found. | [unverified] |

Snowball referrals ("who else should I talk to?") suit discovery in a new segment, but they cluster: people refer people like themselves. Ask how well the interviewee knows each name and prioritize the least-known contact. No referral-rate benchmark was found. [design] Assume roughly one usable referral per three completed calls, and sim the cluster bias as a cost. https://www.koji.so/docs/snowball-sampling-guide

## 2. Costs: panels and incentives

**User Interviews (platform fees, vendor-blog figures):** about $49 per B2C session and $98 per B2B session pay-as-you-go, with B2B targeting adding $35-49 per session. Incentives are billed separately, with a 3% processing fee on the prepaid balance. All-in B2B estimates range from $150 to $300 per completed interview. https://usercall.co/post/user-interviews-pricing-in-2025-plus-faster-more-affordable-alternatives , https://www.koji.so/blog/user-interviews-pricing-2026 (Official pricing page not retrieved.)

**Respondent.io (CleverX blog):** a $30 platform fee per completed session, excluding no-shows and sessions you cancel. Credit bundles reportedly about 15% below pay-as-you-go. A user review claims the B2B credit price roughly doubled in early 2025 [unverified]. https://cleverx.com/blog/respondent-io-pricing-plans-and-costs-explained-2026

**Incentive levels (secondary):**
- B2C 60-minute interview: about $75 (Great Question, citing UI data). Consumer 30 min: $25-50. Consumer 60 min: $50-100 (various vendors).
- B2B senior professionals: $125-250/hour (CleverX), or $200-500/hour (Great Question, cited as UI data). These two disagree widely. Use the range, not a point.
- Professionals run 1.5-2x consumer rates (vendor claim) [unverified].

**Nielsen Norman Group (primary, dated):** the recruiting article (https://www.nngroup.com/articles/recruiting-test-participants-for-usability-studies/) reports 2003 survey data, updated in 2013 with a note that figures run about 20% higher. Key figures:
- External participants: 63% got monetary pay; internal participants: 10%.
- Average external incentive: $64/hour (West Coast $81). Professionals $118/hour vs $32 for nonprofessional users.
- Average agency fee: $107 per participant (consumers about $84, high-end professionals $161).
- Average participant no-show: 11%.
- In-house recruiting: 1.15 staff hours per participant recruited, and 24% of respondents spent more than two hours per participant.

These numbers are old. Adjust upward for inflation and the 2013 note.

**Incentive response effect:** A PLOS ONE meta-analysis reportedly finds monetary incentives raise response rates by 8-10 points [unverified; check the original]. A 2024 JMIR Formative Research study is reported at 50.6% cooperation with incentives vs 26.6% without [secondhand; verify]. A vendor table attributed to Singer & Ye (2013) shows diminishing returns: $10-25 gives about 1.5-2x, $50-75 gives 2-3x, $100+ gives 3-4x [unverified].

**No-shows:** NNG reports 11% (2003). Other planning guides use 10% for B2C and 15% for B2B [unverified]. One guide puts a 5% no-show rate across 958 participants in 24 studies, but the source is unclear.

## 3. Screening and fraud

- Professional survey takers and bots are the main threat. Professional respondents know the right answers, so their responses look high quality, which makes them harder to catch than bots. This matters most for interviews and usability work.
- Fraud rates are reported very differently: 30-50% for panel-sourced surveys (Accelerant, not methodologically documented), up to 40% low-quality responses (Suzy), and 1-5% for managed B2B panels with quality controls (CleverX). Treat all as [unverified].
- A 2025 lab study (Dr. Gargi Sawhney, Auburn University, presented at ReDem Quality Day) reports AI bots passed 11 of 12 standard fraud checks, including attention questions. https://redem.io/recap-redem-quality-day-1-2025/
- In B2B, small samples mean a few fraudulent completes rewrite conclusions, and fraudsters target senior roles.
- Screener design: ask for specific recent behavior ("when did you last buy X, what did you pay?") rather than yes/no qualifiers. Verify job title and company on a call before paying. Pay only completed calls. Check for identical free-text answers across screeners.

[design] Sim rule: a panel-recruited participant has a 10-20% chance of being unqualified or fraudulent (detectable only with a good screener); a warm intro has about 2%.

## 4. Time cost per completed interview

Components (founder hours, [design] unless noted):
- Recruiting (sourcing, messaging, follow-ups): 0.5-1.5 hours per completed call. NNG reports 1.15 staff hours per recruited participant (2003) [dated].
- Scheduling and reminders: 0.2-0.4 hours (more with timezone and no-shows).
- Call: 0.5-1 hour (30-60 min plus buffer).
- Notes and synthesis: 0.5-1 hour per interview.
- Total: about 2-3.5 hours per completed interview, more for B2B or hard-to-reach segments.

A solo founder doing discovery alongside building can sustain about 3-5 completed calls per week [design]. A reasonable first sprint is 10-20 interviews over 3-5 weeks. This is consistent with a cold-outreach course advice of "at least 10-20 interviews" [unverified, single course]. No benchmark found for founders' interviews per week.

Follow-up sequencing: a three-message cap is common advice for interview requests, after which move on. [unverified, single source]

## 5. Segment differences

The searches covered channels and costs, not segment-specific response rates. The following is directional.

- **Easy (developers, indie hackers, consumers, prosumers):** high reply rates from communities, and low incentives (gift card $25-50 for 30-60 min consumer; $50-100 for dev/professional) [design/unverified]. Fraud risk is higher on open panels.
- **Mid-market and B2B SMB owners:** reachable via LinkedIn and cold email; incentives around $75-150 per hour [unverified]. Relevance is critical (71% cite it).
- **Hard-to-reach (doctors, enterprise execs, government):** warm intros are essential; panel incentives run $200-500/hour for senior professionals; no-show and screener failure rates are higher [design]. Government and regulated buyers often cannot accept gifts, so use a donation or decline the payment [design, check local rules].

## 6. Sim implications

- Warm intros, existing users and waitlists should have the highest reply rates, with cost in founder time, not dollars.
- Cold email and LinkedIn should show low base rates that improve with personalization and relevance.
- Panels cost per completed call plus a platform fee and carry a fraud/unqualified risk.
- Incentives should raise show rates with diminishing returns.
- Each interview costs founder hours, and a solo founder caps out at a few per week.
- Referral snowballs should cluster and drift toward similar people.

## Sources

- User Interviews pricing (vendor summary): https://usercall.co/post/user-interviews-pricing-in-2025-plus-faster-more-affordable-alternatives
- Koji User Interviews pricing 2026: https://www.koji.so/blog/user-interviews-pricing-2026
- Respondent.io pricing 2026 (CleverX): https://cleverx.com/blog/respondent-io-pricing-plans-and-costs-explained-2026
- NNG recruiting test participants: https://www.nngroup.com/articles/recruiting-test-participants-for-usability-studies/
- Great Question incentives guide: https://greatquestion.co/blog/the-complete-guide-to-research-incentives
- Expandi LinkedIn benchmarks 2026: https://expandi.io/blog/linkedin-outreach-benchmarks-2026/
- Woodpecker cold email reply rates: https://woodpecker.co/blog/
- Hunter.io state of cold email 2025: https://hunter.io/the-state-of-cold-email-2025
- Sequenzy cold email examples: https://www.sequenzy.com/blog/cold-email-sequence-examples
- Koji snowball sampling: https://www.koji.so/docs/snowball-sampling-guide
- ReDem Quality Day 2025 recap: https://redem.io/recap-redem-quality-day-1-2025/

Gaps: no Mom Test, YC, First Round, or Lenny's source on recruiting was retrieved. No referral-rate benchmark and no segment-level response data were found. Next step: fetch those primary sources and check the PLOS ONE and JMIR figures against the originals.
