# 2026 Q4 tool research: GTM (CRM, lifecycle, data, signals, inbound, call intel, local leads)

Research date 2026-10-16. Builds on docs/research/tools/deep/d02 (Clay, Apollo), d03 (sequencers, AI SDRs), d04 (Granola, Fathom, Gong), d05 (Attio, HubSpot), d08 (Loops, Customer.io). Not repeated here except where 2026 facts changed. Tags: [vendor] vendor page, [third-party] review/aggregator/competitor blog, [unverified] single or conflicting sources. I fetched only a few vendor pages directly; most prices below come from search summaries and conflict, so treat all as ranges and re-verify before hard-coding.

## 0. Corrections to the brief (headline findings)
- **Octolane "~$1k/mo minimum": NOT supported.** Octolane's pricing page (fetched) lists Pro $39/seat/mo (max 3 seats), Business $79/seat/mo, Team and Enterprise custom, no stated minimum, "billed yearly, saves 20%" [vendor: https://octolane.com/pricing]. Other snapshots: docs say $10/$19 per seat [vendor docs, stale?], a 2025 interview said flat $200/mo unlimited seats [third-party: pulse2.com], Toolradar $39-$160/seat [third-party]. A done-for-you CRM audit starts at $2,500 one-time [vendor]. The $1k figure probably conflates this or an enterprise quote. YC-backed, $2.6M seed Apr 2025, "self-driving CRM", claims 1,000+ companies [third-party].
- **Rox is not enterprise-only.** Pricing page (fetched): Individual $100/mo (10k agent actions), Teams $255/mo (15k actions, unlimited seats, CRM sync and writeback), Enterprise custom (SSO, warehouse sync) [vendor: https://rox.com/pricing]. Docs show a different, older Starter free / Core $20 [vendor docs, stale]. Not positioned as a CRM replacement: it syncs with Salesforce/HubSpot and does research, monitoring, contact discovery, outreach, meeting briefs ("agent operating system"). Reported ~$1.2B valuation (General Catalyst, Mar 2026, unconfirmed by company), ~$8M ARR projected end 2025, $50M raised before that [third-party: TechCrunch via Yahoo/Dealroom]. Adoption evidence at seed stage is thin; it is sold to teams with reps.
- **Primer (sayprimer.com) is NOT a lead source.** It is a B2B ad targeting and measurement platform (build ICP audiences from its B2B data, CRM and website visitors, sync to LinkedIn/Meta/Google/Reddit/DV360, holdout-group lift measurement). Pricing not on page; an embedded assistant link suggests Grow from $1,000/mo, Scale $20,000/yr [unverified]. Customers named: Cyberhaven, Superside, KlientBoost [vendor: https://sayprimer.com]. Belongs in paid/ABM, not local-lead sourcing.
- **Openmart**: AI-built database of local/SMB businesses (maps, filings, reviews) with owner name and contact; prompt-to-list; Clay integration and public API; YC, $2.75M seed (Kathryn Wu, Richard He, ex-Pinterest); size claims 1M+ SMBs (YC launch) vs 200M+ records (directory) [third-party: TechCrunch 2024-08-21, YC launches, thegtmdirectory]. Sources all use openmart.com; openmart.ai unconfirmed. Pitched as "ZoomInfo alternative" for local businesses. Pricing unpublished [unverified].
- **Resquared (re2.ai)**: YC, $5M seed (VentureBeat, Jul 2024); ~11-12M local businesses; radius and category filters; playbooks for email AND Facebook/Instagram DM outreach (CEO claims ~20% reply via social page, vendor claim); pricing custom [third-party]. Differs from Openmart: workflow (data + outreach playbooks, CRM-lite) rather than data/API only.
- **Common Room was acquired**: Zoom announced July 2, 2026 it will buy Common Room (terms undisclosed, close expected within weeks; Common Room raised $52M, founded 2020) [verified: https://www.zoom.com/en/blog/zoom-to-acquire-common-room/ via search]. Apollo acquired Pocus (Mar 2026 per one source) [unverified, no primary]. Consolidation theme: signal tools being absorbed by suites.
- **"Attio + Loops > HubSpot + Salesforce"**: no source found for the claim itself. Evidence for the pattern: Attio is used by AI-native startups (reported 5,000+ customers incl. Lovable, Granola, Modal; $52M Series B led by GV in 2025 [unverified, single German source]). Counter-evidence: Attio lacks built-in marketing automation, reporting is thin (cohorts, forecasting), integration catalog smaller; one vendor-adjacent source says many B2B teams migrate Attio to HubSpot at $5M-$15M ARR [unverified]. Verdict: true for sub-$2M ARR PLG/founder-led teams who want a clean data model plus separate Loops for email; false for teams needing marketing attribution, ticketing, forecasting, quoting.

## 1. CRM

### Attio (KEEP, leader for startups)
- Status: active, ~Series B. 2026 pricing (third-party tldv checked 2026-10-05, July 2026 repricing): Free $0 (3 seats), Plus $35/seat/mo annual ($44 monthly), Pro $79 annual ($99 monthly), Enterprise custom [third-party, conflicts with older $29/$69; see d05]. Verify.
- Paradigm: custom objects and lists (Postgres-like records, attributes, relationship graph auto-built from Gmail/Calendar), AI attributes (credits; web agent 10 credits/record), workflows builder, sequences, call recording on Pro. See d05 for workflows.
- Gotchas: credits meter AI use; no native marketing email; reporting limits; data import migration is sales-assisted.
### HubSpot (KEEP-ALT; wins when marketing + service in one tool)
- Free CRM, Starter ~$9-20/seat, Pro ~$90/seat plus onboarding fee; Breeze agents priced per outcome (Prospecting $1/lead, Customer Agent ~$0.50/resolution) [see d05, vendor]. Paradigm: contact/company/deal pipeline plus marketing hub (forms, email, landing pages, attribution); lock-in through tier and hub upsells [third-party edana 2026].
### Salesforce (KEEP-ALT for enterprise; OUTDATED for seed)
- Starter Suite ~$25/user/mo; Agentforce 1 Sales ~$550/user/mo; Agentforce add-on ~$125/user/mo [third-party: tech.co, zeeg, 2026; unverified bundle eligibility]. Paradigm: configurable enterprise platform with admin, objects, flows, ecosystem; needs an admin; startups rule it out early [third-party revgenius thread]. Fits Series B+ with SEs, CPQ, territories, compliance.
### Octolane (KEEP-ALT/experimental): AI-native "self-driving" CRM; auto-captures email/calls, drafts updates and actions; $39-$79/seat; AI credits. Adoption evidence limited (seed, 1,000+ companies claim).
### Rox (KEEP-ALT as agent layer, not a CRM): see section 0; sits on top of Salesforce/HubSpot; per-action pricing; more rep-team oriented.
### folk (KEEP-ALT for relationship/agency/network selling)
- Lightweight contact-centric CRM with LinkedIn/Gmail capture, groups, sequences, AI "Magic Fields". Pricing conflicting: roughly $19-30 entry, $39-60 AI tier, $80-100 top; CostBench noted a change on 2026-06-16 [third-party, unverified]. Free plan existence disputed.
### Twenty (KEEP-ALT for dev-heavy teams)
- Open source (AGPLv3) CRM, 44k GitHub stars [third-party], cloud ~$9-19/user/mo; $5M seed Nov 2024 (Runa), later round figures conflict ($106M total, Series B Jun 2026 appears on Caplight only; unverified). Paradigm: Attio-like objects, self-host, build-your-own; cost is engineering time and ops.
Also rising: Pipedrive and Close for classic pipeline sales, Lightfield (AI-native CRM that builds itself from email/calls, appears in Attio comparisons) [third-party]. Not verified in depth.

## 2. Lifecycle and email
- **Loops**: active, YC, ~$6.9M funded, no acquisition found. Free to 1,000 contacts; paid from ~$49/mo (1k-5k) per d08; third-party tiers disagree ($25, $149). Paradigm: contacts + events + loops (workflow canvas), SaaS-founder UX, transactional on paid plans. Fits <$1M ARR PLG.
- **Customer.io**: journey/event-driven across email, push, SMS, in-app, WhatsApp; priced by profiles, more expensive, needs data pipelines; fits when behavior-triggered multichannel and engineers exist (typically $500k-$5M ARR) [d08].
- **Resend**: developer email API (React Email). Free 3,000/mo, 100/day; Pro $20/mo for 50k; Scale ~$90 for 100k; marketing broadcasts billed separately (~$40/mo+ by contacts) [third-party, mid-2026, minor conflicts]. Paradigm: transactional-first API, code-defined templates; replaces SendGrid/Postmark for new builds; you still need Loops/Customer.io for lifecycle. KEEP for transactional.
- HubSpot marketing email is the all-in-one alternative; Kit for creators.

## 3. Data and enrichment
- **Apollo** (KEEP): free tier (reported 10k email credits/mo), database + sequencer; acquired Pocus 2026 [unverified]. See d02. Cheap default source, quality varies.
- **Clay** (KEEP for outbound-heavy): March 2026 repricing to Free/Launch ($167-185)/Growth ($446-495)/Enterprise; failed lookups free; CRM sync moved down to Growth (Sacra, d02). Funding: $100M Series C $3.1B (Aug 2025), $5B tender (Jan 2026), reported $7.1B Series D Sept 2026 [unverified aggregators]; ARR ~$150M May 2026 (Sacra estimate) to ~$200M [unverified]. Paradigm: spreadsheet rows with waterfall enrichment + Claygent research columns, vs Apollo's contact DB + sequencer.
- **ZoomInfo** (OUTDATED for seed/Series A; KEEP for enterprise): no published prices; est. $15k/yr entry, 3-seat minimum, median contract ~$32k, extra seats $1.5-2.5k, renewals +10-20%, credits expire [third-party, Vendr-based]. Free Lite tier. Paradigm: large proprietary DB, annual contract, rep-sold. Startups replaced it with Apollo + Clay.

## 4. Signal-based outbound
- **Unify**: founded Jan 2023, ~$59M raised (Battery, OpenAI Startup Fund, Thrive, Emergence) [third-party]. ~25 signal types (site visitors, hiring, funding, G2, intent) routed to "Plays" that research and send; credit-based. Price conflict: Growth $700/mo annual (marketbetter) vs $1,740/mo (Landbase); credit burn complaints [third-party]. Fits $2M+ ARR with a rep or founder running volume.
- **Common Room**: person-level signals + RoomieAI; Essential ~$2,500/mo for 5 seats (older $1,700-2,100), median contract ~$27-30k/yr, no free tier [third-party]; Zoom acquiring. Fits companies with community/OSS/product signals; too expensive pre-$2M.
- Cheaper signal alternatives: RB2B (site visitors, free tier), Clay Web Intent/signals (Growth tier), Pocus (now Apollo).

## 5. Inbound orchestration
- **Default**: lead routing, enrichment, scheduling, form-to-meeting. Own blog: Startup $750/mo, Growth/Enterprise custom, $45/user; SyncGTM review: $500/mo platform + $20-45 seats [third-party conflict]. Fits teams with 100+ inbound leads/month and an SDR/AE; below that a form + Calendly/Cal.com ($12/user) is enough.
- **Chili Piper**: older incumbent; $30/user + platform fee $150 (<100 leads), $400 (101-1,000), $1,000 (1,000+) [third-party, Default blog]; narrower. Alternatives: RevenueHero $25-45/user, LeanData for Salesforce, HubSpot meetings.
- Paradigm: Default = whole inbound workflow (enrich, qualify, route, book, follow-up) with a platform fee; Chili Piper = book-on-form-submit routing; Calendly = personal scheduling.

## 6. Meeting notes and call intel (see d04)
- **Granola**: Series C $125M at $1.5B, Mar 2026 (Index lead), total ~$192M [third-party: TNW, Dealroom]. Bot-free, user notes + transcript; Business $14/user. KEEP (the default founder notepad; Attio customer).
- **Fathom**: bot, generous free tier, Team $15-19, Business $25-34. KEEP-ALT for sales teams who want CRM field sync.
- **Gong**: no published price; ~$28k yr one for 10 users (third-party). OUTDATED for startups below ~10 reps; KEEP for mid-market and enterprise with managers and forecast.
- Paradigm: Granola = private personal memory, you decide what goes to CRM; Fathom = team recorder + auto CRM writes; Gong = manager coaching and forecast system of record.

## 7. Local-business lead sources (summary)
| Tool | What it is | Output | Fit |
|---|---|---|---|
| Openmart | AI-built SMB/local database, prompt to list, API, Clay integration | owner name, contact, business data | selling to restaurants, trades, clinics etc. at low volume |
| Resquared | local-business prospecting + email/social playbooks | lists in radius, DM/email outreach | founders doing hands-on local outbound |
| Primer | B2B ad audiences and measurement | NOT leads | paid/ABM, $1k+/mo |
| Google Maps + Apollo/Clay scrape | baseline free alternative | rough lists | pre-revenue testing |

Gameplay implication: local-business ICPs lack LinkedIn presence, so LinkedIn and Apollo lists perform poorly; phone, Facebook/Instagram DMs and walk-ins work, and Openmart/Resquared data is rated by claim, not verified accuracy. Data staleness (closed businesses, wrong owners) is the failure mode [design].

## 8. Stage-based stack hypothesis: verdict
Evidence quality is poor: results are vendor blogs and listicles, no real founder survey. Closest data: a 2026 stack survey of companies past $1M revenue reports Clay in 71% of stacks, n8n 48%, HubSpot 39%, Attio 32% [third-party: intempt.com, unverified methodology]. A "$0 stack" guide recommends Attio free (3 seats) + Apollo free + RB2B [third-party].

**Holds up**
- $0-500k ARR: Attio (free, 3 seats) + Apollo (free) + Granola is the most commonly recommended and affordable. HubSpot Free is the credible alternative. Adding PostHog (free to 1M events), Intercom (note: Intercom/Fin is costly for solo founders; Fin is $0.99/resolution per vendor earlier research, verify) and Stripe is reasonable. Add Loops (free to 1,000 contacts) or Resend for emails; the hypothesis omits any email tool, which is a gap.
- $500k-$2M: adding Clay (Launch ~$170-185/mo) is well supported. Customer.io ($100s/mo) makes sense once behavior-triggered flows matter; Loops is sufficient until multichannel or complex branching is needed.
**Needs correction**
- Default: gate on inbound volume (about 100+ qualified leads/month) and having someone to take meetings; at $500-750/mo plus seats it is wasted at $500k-$2M for most. Calendly/Cal.com/HubSpot meetings first.
- Unify at $2M-$5M: plausible but $700-1,740+/mo with credit burn; works only with a defined ICP and enough volume. Cheaper path: Clay signals + Apollo sequences. Treat as optional.
- Rox as alternative: Rox is an agent layer (research, signals, outbound) not a replacement for Customer.io, PostHog or Intercom; it substitutes for Clay + Unify + parts of an SDR, not the CRM. Reasonable pick for a 3-10 person sales team; unproven at this ARR for founders. Its $100-255/mo entry price is actually cheap.
- Octolane/Rox should not be listed as "enterprise-only/$1k minimum" in the game.
- Don't assume Attio at $2-5M: expect migration pressure toward HubSpot or Salesforce around $5-15M ARR [unverified], or earlier if marketing attribution and forecasting are needed.
**Missing**
- Outbound sender: Instantly/Smartlead plus secondary domains (d03) is how startups actually send cold email; Apollo's sequencer or Clay Sequencer are the bundled options.
- AI SDRs (11x Alice, Artisan Ava): vendor-adjacent reviews say they stop at the meeting-booked stage, need an AE behind them, price from ~$250 to $5-10k/mo (all [unverified]); 11x had customer-logo and ARR accuracy issues (TechCrunch, see d03). Model as high-variance, brand-risk tools, not stage defaults.
- LinkedIn: Sales Navigator (official, safe), HeyReach (~$199/mo unlimited senders) and Expandi (cloud, claims <1% bans) for automation; limits ~100 connection requests per week, 20-30 per day; automation carries ban risk; reports of LinkedIn removing HeyReach's company page in March 2026 are unconfirmed [third-party]. Browser extensions are highest risk.
- Site-visitor identification (RB2B, Clay Web Intent), enrichment-to-CRM sync, e-signature/quotes, a scheduling link for founders, and a reviews/referral channel.
- Ads/ABM (Primer, LinkedIn Ads) appear only above $2M with a marketer.

## 9. Paradigm summary for game mechanics
- CRM: Attio = auto-captured relationship graph, you shape objects; HubSpot = marketing-led funnel, forms and attribution; Salesforce = admin-built, heavy; AI-native (Octolane/Rox) = system writes the updates, you review. Mechanical effects: setup hours, data-entry hours/week, data hygiene decay, reporting depth, marketing capabilities, migration cost.
- Data: Apollo = cheap DB, mixed accuracy, sequencer included; Clay = per-row waterfall and AI research, higher accuracy and personalization but setup time and credit spend; ZoomInfo = big DB, annual contract.
- Signals: Unify/Common Room turn activity into timed outreach (higher reply rate, high cost); static lists produce lower reply rates [design].
- Meetings: Granola private, Fathom team, Gong manager-oriented.

## 10. Table
| tool | status | verdict | price (startup tier) | paradigm (one line) | key workflows | stage fit |
|---|---|---|---|---|---|---|
| Attio | active, Series B (unverified) | KEEP | Free (3 seats); Plus ~$35/seat | flexible objects, auto relationship graph | pipeline lists, AI attributes, workflows, sequences | $0-$5M |
| HubSpot | active | KEEP-ALT | Free; Starter ~$9-20/seat; Pro ~$90/seat | marketing-led funnel suite | forms, email, deals, Breeze agents | $0.5M-$50M |
| Salesforce | active | KEEP-ALT (enterprise) | Starter ~$25; Agentforce $125-550 | configurable enterprise platform | admin-built flows, CPQ | Series B+ |
| Octolane | active, seed | KEEP-ALT | $39-79/seat (no $1k minimum) | AI writes CRM updates | auto-capture, AI actions | seed, small teams |
| Rox | active, ~$1.2B reported | KEEP-ALT (agent layer) | $100 / $255 per month | agents on top of your CRM | research, signals, outreach, briefs | 3+ reps |
| folk | active | KEEP-ALT | ~$19-60/user (conflicting) | contact-centric, LinkedIn/Gmail capture | groups, sequences | agencies, relationship selling |
| Twenty | active, open source | KEEP-ALT | free self-host; ~$9-19 cloud | self-host Attio-like | custom objects | dev-heavy teams |
| Customer.io | active | KEEP | from ~$100/mo (profiles) | event-driven multichannel | journeys, segments | $0.5M-$10M |
| Loops | active, YC | KEEP | free to 1k; ~$49/mo | SaaS-founder lifecycle email | event loops, broadcasts | $0-$2M |
| Resend | active | KEEP (transactional) | free 3k; $20/50k | developer email API | transactional sends | all |
| Apollo | active; bought Pocus (unverified) | KEEP | free; paid ~$49+/user | contact DB + sequencer | search, enrich, sequence | $0-$2M |
| Clay | active, ~$7B reported | KEEP | $167-185/mo Launch | rows + waterfall + AI research | list build, enrich, signals | $0.5M-$10M |
| ZoomInfo | active | OUTDATED for startups | ~$15k/yr min (est) | proprietary DB, annual contract | search, intent | enterprise |
| Unify | active, ~$59M | KEEP-ALT | $700-1,740/mo (conflict) | signal-triggered plays | visitor ID, plays | $2M+ |
| Common Room | being acquired by Zoom | KEEP-ALT / declining independence | ~$2,500/mo | person-level signals + agents | signal scoring | $5M+ |
| Default | active | KEEP-ALT | $500-750/mo + seats | inbound routing + booking | form-to-meeting | 100+ leads/mo |
| Chili Piper | active | KEEP-ALT | $30/user + $150-1,000/mo | book-on-submit router | routing | inbound teams |
| Granola | active, $1.5B | KEEP | free; ~$14/user | private bot-free notepad | meeting notes, recipes | all |
| Fathom | active | KEEP-ALT | free; $15-34/user | bot recorder + CRM sync | auto summaries | small sales teams |
| Gong | active | KEEP (mid-market) | ~$28k/yr 10 users | manager revenue intelligence | coaching, forecast | 10+ reps |
| Openmart | active, YC seed | KEEP-ALT | unpublished | AI local-business DB + API | prompt-to-list | local ICPs |
| Resquared | active, YC seed | KEEP-ALT | custom | local DB + social/email playbooks | radius lists, DMs | local ICPs |
| Primer | active | not a lead tool | ~$1k/mo (unverified) | B2B ad audiences | audience sync, lift | ABM/paid |

Open verification list: Octolane, Default, Unify, Rox, folk, Attio current prices (all conflicting); Attio funding and customers; Apollo-Pocus; Twenty funding; openmart.ai domain; Fin per-resolution price.
