// Operator tiers: what a stellar / good / average / mediocre operator DOES in each business function, the outcome
// spreads between them, the traps that look productive, and how the simulator can detect the tier from player
// inputs. DATA ONLY: no logic. Source notes: docs/research/operators/o1..o5 (copied unchanged from the research
// pass). Audit and fixes: docs/review/operator-tiers-audit.md.
//
// Conventions
//  - outcomes: { metricId: value | [min, max] } per tier. Units live in `metrics[metricId].unit`.
//  - metrics[id].sourced: true  = the tier values trace to a cited report (see `source`), still often a vendor or
//                                  secondary summary; check `confidence`.
//                         false = [design]: a tuning estimate for the simulator, NEVER to be shown to players as a
//                                  real statistic (ARCHITECTURE principle 3).
//    confidence: 'primary' | 'secondary' (vendor / aggregator / secondhand, [unverified] in the notes) | 'design'.
//    A function can mix sourced and design metrics; every tier value for a metric inherits that metric's flag.
//  - detection[].gameable: 'no' | 'partly' | 'yes' is the notes' own judgement of how cheaply the signal can be
//    faked from the UI; `antiGaming` says what makes it hard to fake (usually: consistency over time, a hidden
//    state the claim must reconcile with, or per-recipient variation).
//  - traps[].costs is the delayed or compounding consequence a mediocre operator should EXPERIENCE in the game
//    (principle 7 addendum: bad play must always cost something that is realistic and traceable).

import { CONSUMER_APP_GROWTH } from './consumer-tiers.js'; // Launch playbook

export const OPERATOR_TIERS = {
  // Consumer subscription-app playbook (data/consumer-tiers.js)
  consumer_app_growth: CONSUMER_APP_GROWTH,

  // ======================================================================================================
  // O1: SALES AND CUSTOMER SUCCESS
  // ======================================================================================================

  prospecting: {
    label: 'Prospecting and list building',
    apps: ['crm', 'outreach', 'research'],
    tiers: {
      stellar: {
        behaviours: [
          'ICP written with 3-5 firmographic/trigger filters (recent raise, hiring SDRs, uses competitor X)',
          'one-line reason per account on the list; drops accounts that fail the trigger check',
          'works 50-150 best accounts per week; verifies emails and checks bounce/wrong-persona rate before volume',
          'tests one new segment per sprint against a control',
        ],
        outcomes: { positiveReplyMultVsBroadList: [2, 3], bounceRatePct: [0, 2], wrongPersonaSharePct: [0, 10] },
      },
      good: {
        behaviours: ['ICP with firmographics and sometimes a trigger', 'enriches (Apollo/Clay/Sales Navigator), segments by persona, cleans bounces, refreshes monthly'],
        outcomes: { positiveReplyMultVsBroadList: [1.5, 2], bounceRatePct: [1, 3], wrongPersonaSharePct: [10, 20] },
      },
      average: {
        behaviours: ['ICP is job title + company size', 'exports a broad list and sends to everyone with the title', 'rarely removes dead accounts; list grows faster than it is worked'],
        outcomes: { positiveReplyMultVsBroadList: 1, bounceRatePct: [3, 5], wrongPersonaSharePct: [25, 40] },
      },
      mediocre: {
        behaviours: ['"anyone in SaaS"; bought list with no enrichment', 'uploads thousands of unverified contacts into a sequencer', 'never learns who the ICP is; re-hits non-responders'],
        outcomes: { positiveReplyMultVsBroadList: [0.3, 0.7], bounceRatePct: [5, 12], wrongPersonaSharePct: [40, 60] },
      },
    },
    metrics: {
      positiveReplyMultVsBroadList: { label: 'Positive-reply rate vs a broad list at equal volume', unit: 'x', source: 'o1 s1 [design]; Bridge Group 2025 gives no list-quality tiers', sourced: false, confidence: 'design' },
      bounceRatePct: { label: 'Bounce rate', unit: '%', source: 'o1 s1: under 2% healthy, above 5% = list problem (deliverability vendor guidance, [unverified]); Saleshandy Oct 2026 verified 1.21% vs bad 10.58% is already in sales/params.js', sourced: true, confidence: 'secondary' },
      wrongPersonaSharePct: { label: 'Share of list that is the wrong persona', unit: '%', source: 'o1 s1 example (40% wrong-persona blast) [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'volume_as_pipeline', label: 'Volume as a proxy for pipeline', looksLike: 'Sending 2,000 a week looks like activity', costs: 'Sender reputation falls, domain flagged, reply rate drops for every later campaign', coaching: 'Work your best 100 accounts before adding 1,000.' },
      { id: 'bought_list', label: 'List bought with no signal', looksLike: 'Instant 5,000-contact pipeline', costs: 'First 3 months spent learning who the ICP is; bounces above 5%', coaching: 'Bounces above 5% mean you do not have a copy problem. Verify before you send.' },
      { id: 'never_prune', label: 'Never removing non-responders', looksLike: 'A big, growing list', costs: 'Sequences keep re-hitting the same people; complaint rate rises', coaching: 'Your list has a title per row. Add one trigger and drop anyone who fails it.' },
    ],
    detection: [
      { signal: 'Written ICP: number of filters, presence of a trigger/timing signal, a reason-per-account field', howInGame: 'Parse company.icp and the CRM company notes/research summary', gameable: 'partly', antiGaming: 'A fluent paragraph is cheap; judge by the subsequent list: do added accounts actually match the stated triggers?' },
      { signal: 'Accounts researched vs accounts added; accounts removed/disqualified; parallel segment tests', howInGame: 'CRM activities and sequence enrolment history', gameable: 'no', antiGaming: 'Needs sustained behaviour across weeks, not one action' },
      { signal: 'Verification before sending; bounce rate by list source', howInGame: 'Verify action before enrolment; bounced share per import batch', gameable: 'no', antiGaming: 'Bounces are drawn from hidden true address status' },
    ],
  },

  cold_outreach: {
    label: 'Cold email and LinkedIn outreach',
    apps: ['outreach', 'crm', 'mail'],
    tiers: {
      stellar: {
        behaviours: [
          '60-120 word email, one researched observation in line 1 that could not go to another company',
          'single low-friction ask; 4-6 touches over 2-3 weeks, each with a new angle',
          'A/B tests with at least 100 sends per arm; reads replies for objections and rewrites weekly',
          'LinkedIn: no pitch in the connect note, short message after acceptance',
        ],
        outcomes: { emailReplyRatePct: [8, 11], liMessageReplyRatePct: [10, 14], touchesPerProspect: [4, 6] },
      },
      good: {
        behaviours: ['personalised first line from a trigger, one ask, 3-4 touches', 'measures reply rate per sequence', 'uses LinkedIn for profile check not pitch'],
        outcomes: { emailReplyRatePct: [5, 7], liMessageReplyRatePct: [9, 11], touchesPerProspect: [3, 4] },
      },
      average: {
        behaviours: ['name + company merge tags only', 'long feature-list emails, 2 touches then stops', 'judges by open rate'],
        outcomes: { emailReplyRatePct: [3, 4], liMessageReplyRatePct: [5, 7], touchesPerProspect: 2 },
      },
      mediocre: {
        behaviours: ['same template to 500 people', '"I hope you are well" opener, pitch in paragraph two', 'same email 7 times to one person; pitch in the LinkedIn connect note', 'unreviewed AI SDR output; cold email from the primary domain'],
        outcomes: { emailReplyRatePct: [0.5, 1.5], liMessageReplyRatePct: [3, 5], touchesPerProspect: [1, 7] },
      },
    },
    metrics: {
      emailReplyRatePct: { label: 'Cold email reply rate (all replies)', unit: '%', source: 'o1 s2: Instantly 2026 via Mailshake summary (platform avg 3.4%, top quartile 5.5%, top tier above 10.7%) [unverified]; Lavender 30 Mar 2026: A-graded copy ~58-79% lift; definitions differ by vendor (Belkins 0.45% for positive replies)', sourced: true, confidence: 'secondary' },
      liMessageReplyRatePct: { label: 'LinkedIn message reply rate', unit: '%', source: 'o1 s2: Expandi LinkedIn Outreach Benchmarks 2026 (13.2M requests, May 2025-Apr 2026): acceptance 28.5%, note reply 3.0%, message reply 10.4%; tier splits [design]', sourced: true, confidence: 'secondary' },
      touchesPerProspect: { label: 'Touches per prospect', unit: 'count', source: 'o1 s2 behaviours [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'ninth_touch', label: 'Adding touches with the same message', looksLike: 'Persistence', costs: 'No extra replies, more spam complaints, domain health falls', coaching: 'Three touches with the same ask is one touch repeated. Give each touch a new reason.' },
      { id: 'small_sample_winner', label: 'Declaring a subject-line winner on 20 sends', looksLike: 'Data-driven testing', costs: 'Locks in noise; stops learning', coaching: 'Stellar operators are identifiable over 3 or more sequences, not one.' },
      { id: 'open_rate', label: 'Treating opens as engagement', looksLike: 'A dashboard number going up', costs: 'Optimises the wrong metric after Apple Mail privacy changes', coaching: 'Judge by replies and meetings booked.' },
      { id: 'generic_ai_personalisation', label: 'AI-written fake personalisation', looksLike: 'Personalised at scale', costs: 'Prospects recognise it; reply rate near generic; burns domain', coaching: 'Your first line could be sent to any company. Replace it with something only this company would recognise.' },
      { id: 'primary_domain', label: 'Cold sending from the primary domain', looksLike: 'No setup needed', costs: 'One bad week damages the company main email', coaching: 'Use secondary domains and warm them.' },
    ],
    detection: [
      { signal: 'Draft quality: word count, specific nouns tied to the prospect, single ask, generic opener, link in email 1', howInGame: 'analyzeCopy + specificity() on the rendered email, not the template', gameable: 'partly', antiGaming: 'Keyword lists are beatable; also check that the first line is grounded in the fetched site text and varies per recipient' },
      { signal: 'Touch count, days between touches, response to replies/bounces', howInGame: 'Sequence log and Mail thread timestamps', gameable: 'no', antiGaming: 'Behaviour over weeks' },
      { signal: 'Same body repeated across recipients (template-only personalisation)', howInGame: 'Hash of the body after removing merge values', gameable: 'no', antiGaming: 'Per-recipient diff is computed by the engine, not declared by the player' },
    ],
  },

  discovery_demo: {
    label: 'Discovery calls and demos',
    apps: ['calls', 'crm', 'research'],
    tiers: {
      stellar: {
        behaviours: [
          'opens with what they learned from research and a one-sentence purpose',
          '11-14 targeted questions spread through the call; asks the cost of the problem in dollars/hours and what happens if nothing changes',
          'asks who else must agree, the timeline and what would stop the deal; follow-ups reference earlier answers',
          'founder talk share low; ends with a dated next step; recap email within 24h quoting the prospect',
        ],
        outcomes: { questionsPerCall: [11, 14], founderTalkSharePct: [35, 45], nextStepSecuredPct: [70, 90], winRateVsAveragePct: 40 },
      },
      good: {
        behaviours: ['pre-written question set covering pain, process, timeline', 'demos only the features tied to the stated pain', 'asks for next step but accepts vague ones'],
        outcomes: { questionsPerCall: [7, 10], founderTalkSharePct: [45, 55], nextStepSecuredPct: [45, 65], winRateVsAveragePct: 15 },
      },
      average: {
        behaviours: ['company intro and 10-minute walkthrough first', '"what are your pain points?" then writes it down', 'demos every feature; ends with "let us stay in touch"'],
        outcomes: { questionsPerCall: [3, 6], founderTalkSharePct: [57, 62], nextStepSecuredPct: [20, 40], winRateVsAveragePct: 0 },
      },
      mediocre: {
        behaviours: ['demo in the first call with no discovery', 'talks most of the call; never asks budget, timeline or stakeholders', 'generic "just checking in" follow-up', 'lets the prospect set the demo agenda unqualified'],
        outcomes: { questionsPerCall: [0, 2], founderTalkSharePct: [65, 80], nextStepSecuredPct: [0, 15], winRateVsAveragePct: -50 },
      },
    },
    metrics: {
      questionsPerCall: { label: 'Targeted discovery questions per call', unit: 'count', source: 'o1 s3: Gong Labs 519k calls, modified 4 Mar 2026 (11-14 optimum; too many hurts C-suite calls)', sourced: true, confidence: 'primary' },
      founderTalkSharePct: { label: 'Founder share of talk time', unit: '%', source: 'o1 s3: won ~57% vs lost ~62% (326k-call analysis, secondary [unverified]); tier values [design]', sourced: false, confidence: 'design' },
      nextStepSecuredPct: { label: 'Calls ending in a dated next step', unit: '%', source: 'o1 s3 behaviours [design]; no public benchmark', sourced: false, confidence: 'design' },
      winRateVsAveragePct: { label: 'Relative win-rate vs average operator', unit: '% relative', source: 'o1 s3: pricing raised on call 1 reported 42% vs 5% win (Gong secondary [unverified]); demo-to-close ~20% planning figure (vendor blogs [unverified]); tier deltas [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'demo_first', label: 'Demo-first sales', looksLike: 'Showing value fast', costs: 'Prospect never states a problem worth solving; deal stalls at stage 1', coaching: 'You asked 3 questions before the demo. Ask 11 to 14 and let the prospect talk.' },
      { id: 'interrogation', label: 'Over-asking beyond ~14 questions', looksLike: 'Thoroughness', costs: 'C-suite buyers disengage', coaching: 'Spread questions through the call and react to answers.' },
      { id: 'product_recap', label: 'Recap that restates the product', looksLike: 'Professional follow-up', costs: 'Prospect does not reply; next step lost', coaching: 'A recap that says "great call" gets no reply. Quote their timeline back and propose a dated next step.' },
      { id: 'soft_next_step', label: 'Taking "circle back in Q1" as a next step', looksLike: 'A deal in pipeline', costs: 'Dead deal inflates pipeline coverage', coaching: 'No dated commitment, no stage change.' },
    ],
    detection: [
      { signal: 'Question count and the share about money, timeline, stakeholders, status quo; a dollar figure requested', howInGame: 'heuristicScorecard / LLM scorecard on the transcript', gameable: 'partly', antiGaming: 'A pasted question list is caught if later questions do not reference earlier answers; hidden persona facts only surface for past-specific questions' },
      { signal: 'Talk ratio from transcript word counts', howInGame: 'talkRatio in the scorecard', gameable: 'partly', antiGaming: 'Silence earns nothing: credit requires at least 3 questions (callQuality)' },
      { signal: 'Recap latency and whether it quotes the prospect; dated next step on the calendar', howInGame: 'Mail thread after the call; CRM next-step date', gameable: 'no', antiGaming: 'Calendar/CRM state, not text claims' },
    ],
  },

  deal_management: {
    label: 'Deal management, negotiation, closing (MEDDPICC, multi-threading)',
    apps: ['crm', 'calls', 'pricing', 'legal'],
    tiers: {
      stellar: {
        behaviours: [
          'MEDDPICC record on every deal with a named person or date per field and the gap named',
          'multi-threads to 3+ stakeholders (economic buyer, champion, technical/security) by stage 2',
          'mutual close plan with buyer-agreed dates; pre-sets walk-away and discount authority; discounts only for term/case study after the buyer names a number',
          'pulls deals out of forecast when a stage exit criterion is missed',
        ],
        outcomes: { winRatePct: [35, 40], stakeholdersEngagedEarly: [3, 6], forecastErrorPct: [5, 15], cycleSpeedVsLowPerformers: 11 },
      },
      good: {
        behaviours: ['CRM with stage exit criteria; knows champion and economic buyer', 'discounts with a reason (term length, case study)'],
        outcomes: { winRatePct: [25, 32], stakeholdersEngagedEarly: 2, forecastErrorPct: [15, 25], cycleSpeedVsLowPerformers: 3 },
      },
      average: {
        behaviours: ['stage set by feeling; one friendly user contact per deal', 'early discount when the buyer pushes', 'gut forecast'],
        outcomes: { winRatePct: [20, 25], stakeholdersEngagedEarly: 1, forecastErrorPct: [25, 40], cycleSpeedVsLowPerformers: 1 },
      },
      mediocre: {
        behaviours: ['100% of pipeline in commit; one contact for 90 days', 'proposal before any economic-buyer conversation', '20% discount to close this week', 'never removes stalled deals'],
        outcomes: { winRatePct: [5, 12], stakeholdersEngagedEarly: 1, forecastErrorPct: [40, 80], cycleSpeedVsLowPerformers: 0.5 },
      },
    },
    metrics: {
      winRatePct: { label: 'Qualified-opportunity win rate', unit: '%', source: 'o1 s4: average B2B 20-30%, best-in-class 35-40%+ (secondary [unverified]); Ebsta/Pavilion 2025 GTM Benchmarks Apr 2025: 78% of sellers missed quota; decision-maker in first two stages +55% win rate (vendor press release)', sourced: true, confidence: 'secondary' },
      stakeholdersEngagedEarly: { label: 'Stakeholders engaged by stage 2', unit: 'count', source: 'o1 s4: podcast summary 12% vs 40%+ win with 6+ stakeholders [unverified]; tier counts [design]', sourced: false, confidence: 'design' },
      forecastErrorPct: { label: 'Forecast error', unit: '%', source: 'o1 s4 "forecast ends up 40% wrong" trap description [design]', sourced: false, confidence: 'design' },
      cycleSpeedVsLowPerformers: { label: 'Deal velocity vs low performers', unit: 'x', source: 'o1 s3/s4: Ebsta/Pavilion Apr 2025 top performers close ~11x faster (8.9x in 2024); good/average/mediocre points [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'commit_inflation', label: '"Commit" inflation', looksLike: 'A big forecast', costs: 'Forecast 40% wrong; hiring and spend planned on phantom revenue', coaching: 'Move the deal out of commit until the economic buyer agrees a close date.' },
      { id: 'early_discount', label: 'Discounting before the buyer names a number', looksLike: 'Closing momentum', costs: 'Margin given away; trains the buyer that price is soft', coaching: 'Ask what they are prepared to pay before you discuss a discount.' },
      { id: 'single_thread', label: 'Champion dependency', looksLike: 'A friendly warm deal', costs: 'Champion leaves; deal dies; no economic-buyer relationship', coaching: 'You have one contact on a 90-day deal. Who signs? Have you spoken to them?' },
      { id: 'proposal_first', label: 'Proposal before pain/metrics/criteria', looksLike: 'Moving fast', costs: 'Comparison with the cheapest vendor', coaching: 'Know pain, metric and decision criteria before pricing.' },
      { id: 'zombie_pipeline', label: 'Keeping stalled deals open', looksLike: 'Healthy coverage ratio', costs: 'Hides the real gap; late-stage slip drops win rate steeply', coaching: 'Remove deals that missed an exit criterion.' },
    ],
    detection: [
      { signal: 'Named economic buyer, distinct contacts, written decision criteria, dated mutual plan', howInGame: 'Deal committee, MEDDPICC panel fed by call scorecards, CRM next-step date', gameable: 'partly', antiGaming: 'Headings with vague content: require each field to reference a specific named contact or date that exists in the CRM' },
      { signal: 'Discount offered before a buyer-stated number; stage moves without exit criteria', howInGame: 'startProposal discountPct vs budget revealed on a call', gameable: 'no', antiGaming: 'Compared with hidden buyer budget' },
      { signal: 'Days since last buyer contact per late-stage deal', howInGame: 'CRM activities', gameable: 'no', antiGaming: 'Time-based' },
    ],
  },

  customer_success: {
    label: 'Customer success, renewals and expansion',
    apps: ['success', 'customers', 'calendar'],
    tiers: {
      stellar: {
        behaviours: [
          'success metric (number + date) agreed in writing in the first 30 days',
          'quarterly business review with the economic buyer; weekly usage tracking, acts on drops within 7 days',
          'renewal conversation starts 90-120 days out with usage data; expansion pitched when a usage limit is hit with a dollar value case',
          'monthly risk list; spends time on at-risk large accounts, not the smallest',
        ],
        outcomes: { nrrPct25to50kAcv: [108, 111], grrPct: [92, 95], renewalStartDaysBefore: [90, 120] },
      },
      good: {
        behaviours: ['onboarding checklist, monthly check-in', 'renewal starts ~60 days out; tracks NRR and GRR', 'opportunistic expansion ask'],
        outcomes: { nrrPct25to50kAcv: [102, 107], grrPct: [88, 92], renewalStartDaysBefore: [60, 75] },
      },
      average: {
        behaviours: ['check-ins when the customer emails', 'renewal 2-4 weeks before the date; discounts when the customer threatens to leave'],
        outcomes: { nrrPct25to50kAcv: [97, 102], grrPct: [84, 88], renewalStartDaysBefore: [14, 28] },
      },
      mediocre: {
        behaviours: ['no success metric; account hears from you when the invoice is sent', 'renewal is a price negotiation the week before', 'never tracks usage; churn is a surprise', 'tracks logo count instead of NRR/GRR'],
        outcomes: { nrrPct25to50kAcv: [88, 97], grrPct: [75, 84], renewalStartDaysBefore: [0, 7] },
      },
    },
    metrics: {
      nrrPct25to50kAcv: { label: 'Net revenue retention, $25-50k ACV band', unit: '%', source: 'o1 s5: SaaS Capital 2025 B2B Retention Benchmarks, Sep 2025, 1,000+ private B2B SaaS: median 102%, top quartile 111%, bottom quartile 97% (quartiles read from a secondary summary [unverified]); good/average/mediocre splits and the below-bottom-quartile range are [design]', sourced: true, confidence: 'secondary' },
      grrPct: { label: 'Gross revenue retention', unit: '%', source: 'o1 s5: growth-stage median ~87-90%, top 93%+ (aggregator [unverified]); o3 s4 SaaS Capital GRR medians 90-95%; tier points [design]', sourced: false, confidence: 'design' },
      renewalStartDaysBefore: { label: 'Days before renewal that the conversation starts', unit: 'days', source: 'o1 s5 behaviours [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'renewal_discount', label: 'Renewal as a discount negotiation', looksLike: 'Saving the account', costs: 'Customers learn to wait for a discount; NRR falls', coaching: 'You offered a discount before they asked. Ask what outcome they are not getting yet.' },
      { id: 'seat_pitch', label: 'Expansion pitched as "more seats" without usage evidence', looksLike: 'Growth effort', costs: 'Declines make the account harder to expand later', coaching: 'Pitch expansion where usage has already hit the limit.' },
      { id: 'nps_as_health', label: 'Treating NPS/CSAT as health', looksLike: 'A green score', costs: 'A 9 from a champion who is leaving does not predict renewal', coaching: 'Track usage, champion status and economic-buyer contact.' },
      { id: 'overserve_small', label: 'High-touch on the smallest accounts', looksLike: 'Being responsive', costs: 'At-risk large accounts churn unnoticed', coaching: 'Spend QBR time where ACV and risk are highest.' },
    ],
    detection: [
      { signal: 'Written success metric with a number and a date; named economic buyer; QBR date; renewal start relative to renewal date', howInGame: 'Account plan fields, calendar QBR events, renewal pipeline checkpoints', gameable: 'partly', antiGaming: 'Generic metric ("increase value") rejected; require a number and a date' },
      { signal: 'Expansion proposals reference a usage trigger', howInGame: 'pitchExpansion tied to seatRoom/limit hit', gameable: 'no', antiGaming: 'Compared with the simulated usage state' },
      { signal: 'Time to respond to a usage drop', howInGame: 'Account health history vs touch events', gameable: 'no', antiGaming: 'Time-based' },
    ],
  },

  // ======================================================================================================
  // O2: MARKETING AND GROWTH
  // ======================================================================================================

  positioning_landing: {
    label: 'Positioning and landing pages / website conversion',
    apps: ['website', 'market', 'analytics'],
    tiers: {
      stellar: {
        behaviours: [
          'positioning = specific buyer + specific pain + specific outcome, tested on 5 real customers before publishing',
          'names the category and the alternative the buyer uses today',
          'one primary CTA matched to traffic temperature; price findable without a form',
          'baseline and analytics before traffic; one test at a time with a hypothesis and sample floor; conversion target per source',
        ],
        outcomes: { selfServeVisitorToSignupPct: [12, 15], demoPageConversionPct: [4.8, 8], topVsMedianMultiple: [3, 4] },
      },
      good: {
        behaviours: ['clear headline and proof above the fold, one CTA', 'one test every 2 weeks; knows conversion by source'],
        outcomes: { selfServeVisitorToSignupPct: [8, 12], demoPageConversionPct: [3, 4.8], topVsMedianMultiple: [1.5, 2] },
      },
      average: {
        behaviours: ['copies a competitor homepage', 'feature-list hero ("AI-powered workflow platform")', 'three CTAs; anonymous testimonials; tests button colour'],
        outcomes: { selfServeVisitorToSignupPct: [4, 8], demoPageConversionPct: [1.5, 3], topVsMedianMultiple: 1 },
      },
      mediocre: {
        behaviours: ['writes for "everyone who needs productivity"', 'no price or next step; demo gate on a $29 product', 'judges by feel or a full redesign; no analytics on the form'],
        outcomes: { selfServeVisitorToSignupPct: [1, 4], demoPageConversionPct: [0.5, 1.5], topVsMedianMultiple: [0.3, 0.6] },
      },
    },
    metrics: {
      selfServeVisitorToSignupPct: { label: 'Self-serve / free-trial page visitor-to-signup', unit: '%', source: 'o2 s1: SaaSHero updated 11 Jul 2026: median ~8%, top quartile 12%+; a second SaaSHero table (27 Jul 2026) says 4-10% median, so ranges disagree [unverified]', sourced: true, confidence: 'secondary' },
      demoPageConversionPct: { label: 'Demo page conversion', unit: '%', source: 'o2 s1: SaaSHero 11 Jul 2026: median 1.5-4%, top quartile ~4.8%; Unbounce Q4 2024 SaaS median 3.8% (cited secondhand [unverified])', sourced: true, confidence: 'secondary' },
      topVsMedianMultiple: { label: 'Conversion vs median on the same traffic', unit: 'x', source: 'o2 s1: "3-4x gap between median and top quartile is common" [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'blended_cr', label: 'Judging on blended conversion', looksLike: 'One clean number', costs: 'Hides a source converting at 0.5%; budget stays in the worst channel', coaching: 'Report conversion by traffic source before you change anything.' },
      { id: 'full_redesign', label: 'Redesigning the whole site', looksLike: 'Bold action', costs: 'Cannot attribute any lift; resets learning', coaching: 'Change one thing, run it two weeks, keep what moved the number.' },
      { id: 'sales_gate_cheap', label: 'Sales-call gate on a cheap product', looksLike: 'High-touch qualification', costs: 'A $29 buyer will not schedule a meeting', coaching: 'Put the price and a self-serve path next to the demo button.' },
      { id: 'feature_hero', label: 'Feature-list or "AI-powered" hero', looksLike: 'Modern positioning', costs: 'Buyer learns nothing; bounce', coaching: 'Say who it is for and what they stop doing, in the first line.' },
    ],
    detection: [
      { signal: 'Hero names a buyer, a pain and a measurable outcome; CTA count; pricing findable', howInGame: 'Website judge (panel / heuristic) on the fetched or pasted page', gameable: 'partly', antiGaming: 'Claim must match shipped product capability; stored score is kept for an unchanged page (no re-roll)' },
      { signal: 'One test at a time with a hypothesis and sample floor; per-source analysis', howInGame: 'Edit history of the page vs traffic volume by source', gameable: 'no', antiGaming: 'A claimed test result must be consistent with the traffic that actually arrived' },
      { signal: 'Analytics and baseline in place before traffic', howInGame: 'Timestamp of tracking set-up vs first visits', gameable: 'no', antiGaming: 'Time-based' },
    ],
  },

  paid_ads: {
    label: 'Paid ads (creative testing, budgets, attribution)',
    apps: ['ads', 'analytics', 'stripe'],
    tiers: {
      stellar: {
        behaviours: [
          'sets a cost-per-qualified-outcome ceiling from LTV and payback before spending',
          '5-10% of budget on new concepts in separate test ad sets with hypotheses (hook, offer, format)',
          'pre-set kill rules (e.g. 2x target CPA with no conversion); scales in 20% steps; holds budgets steady',
          'holdout or geo test for incrementality; treats platform ROAS as an upper bound; separates retargeting/brand',
        ],
        outcomes: { cpaVsAverage: [0.4, 0.5], winnerCreativeSharePct: [10, 10], inLearningChurnEditsPerWeek: [0, 1] },
      },
      good: {
        behaviours: ['3-5 creative variants per concept; reads CTR and CVR by creative; scales the winner', 'tracks CPA by channel; no holdout'],
        outcomes: { cpaVsAverage: [0.6, 0.8], winnerCreativeSharePct: [6, 8], inLearningChurnEditsPerWeek: [1, 2] },
      },
      average: {
        behaviours: ['single image campaign', 'changes budget daily from yesterday CPA; turns off ads after one bad day', 'reports platform "ROAS 4x"'],
        outcomes: { cpaVsAverage: 1, winnerCreativeSharePct: 5, inLearningChurnEditsPerWeek: [3, 5] },
      },
      mediocre: {
        behaviours: ['boosts posts; brand awareness with no conversion goal', 'changes targeting, bid, creative and budget in the same week', 'spends on retargeting to show high ROAS; scales 3x in one day', 'optimises to signups that never activate'],
        outcomes: { cpaVsAverage: [1.5, 2.5], winnerCreativeSharePct: 2.5, inLearningChurnEditsPerWeek: [5, 10] },
      },
    },
    metrics: {
      cpaVsAverage: { label: 'CPA for the same product vs an average operator', unit: 'x', source: 'o2 s2: "CPA can vary 2-3x between stellar and average through creative and offer alone" [design]; the repo already encodes winner share by skill in growth/delivery.js (Motion 2026: ~5% winners)', sourced: false, confidence: 'design' },
      winnerCreativeSharePct: { label: 'Creatives that are winners', unit: '%', source: 'growth/delivery.js qualityFromDraw comment (Motion 2026 ~5% winners neutral, ~10% excellent, ~2.5% generic); not in the o2 note', sourced: true, confidence: 'secondary' },
      inLearningChurnEditsPerWeek: { label: 'Budget/creative edits per ad set per week', unit: 'count', source: 'o2 s2 traps: Meta learning-phase thresholds secondhand [unverified]; tier counts [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'retargeting_roas', label: 'Retargeting / brand ROAS presented as acquisition', looksLike: 'ROAS 4x', costs: 'Spend captures demand that already existed; true CPA on new audiences is 2-3x worse', coaching: 'Show CPA on new-audience prospecting only.' },
      { id: 'learning_churn', label: 'Editing every 1-2 days', looksLike: 'Active optimisation', costs: 'Ad sets never exit learning; delivery efficiency stays low', coaching: 'Pick a budget and a 2-week window, then judge the window.' },
      { id: 'scale_3x', label: 'Scaling 3x after one good week', looksLike: 'Riding a winner', costs: 'Re-enters learning; CPA spikes; creative fatigues', coaching: 'Raise the budget 20% at a time and watch CPA hold.' },
      { id: 'signup_conversion', label: 'Optimising to signup, not activation/paid', looksLike: 'Cheap CPA', costs: 'Algorithm finds signups that never use the product', coaching: 'Optimise to activation or first paid.' },
    ],
    detection: [
      { signal: 'CPA ceiling set from unit economics before first dollar; written kill rules', howInGame: 'targetCpa vs LTV/payback at campaign creation', gameable: 'partly', antiGaming: 'The ceiling must be consistent with the margin and churn actually observed' },
      { signal: 'Edit cadence per ad set; concurrent creative tests; results logged per creative', howInGame: 's.edits[], relearn events, creative entities', gameable: 'no', antiGaming: 'Near-identical copy joins the same entity and shares its wear, so re-pasting buys no lottery ticket' },
      { signal: 'Reports cost per paying/activated customer rather than per click', howInGame: 'Cohort ROAS view from Stripe vs platform-reported conversions', gameable: 'no', antiGaming: 'Reconciles to Stripe cash' },
    ],
  },

  content_seo_geo: {
    label: 'Content, SEO/GEO and building in public',
    apps: ['organic', 'channels', 'outcomes'],
    tiers: {
      stellar: {
        behaviours: [
          '10-20 buyer-question topics from sales calls and tickets; one deep sourced piece a month with original data',
          'repurposes into 5-8 posts; comparison and "alternative to X" pages',
          'monthly check whether ChatGPT/Perplexity/AI Overviews cite them; build-in-public with numbers and failures',
        ],
        outcomes: { qualifiedPipelinePerPieceVsAverage: [3, 5], signupsFromContentTracked: 1 },
      },
      good: {
        behaviours: ['weekly keyword-led posts with sound on-page SEO', 'tracks organic traffic and signups; posts several times a week'],
        outcomes: { qualifiedPipelinePerPieceVsAverage: [1.5, 2], signupsFromContentTracked: 1 },
      },
      average: {
        behaviours: ['generic AI-written "ultimate guides" with no original data', 'hustle updates without numbers; measures impressions'],
        outcomes: { qualifiedPipelinePerPieceVsAverage: 1, signupsFromContentTracked: 0 },
      },
      mediocre: {
        behaviours: ['5 unedited AI posts a week, no intent match', 'buys backlinks; posts once a quarter; reports follower counts as progress'],
        outcomes: { qualifiedPipelinePerPieceVsAverage: [0, 0.3], signupsFromContentTracked: 0 },
      },
    },
    metrics: {
      qualifiedPipelinePerPieceVsAverage: { label: 'Qualified pipeline per unit of content work vs average', unit: 'x', source: 'o2 s3 [design]: "3-5x, not a sourced number"', sourced: false, confidence: 'design' },
      signupsFromContentTracked: { label: 'Operator attributes signups to content by page (1 = yes)', unit: 'flag', source: 'o2 s3 detection [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'volume_without_intent', label: 'Volume without intent', looksLike: '40 posts shipped', costs: 'Traffic that never buys; thin pages ignored or de-indexed', coaching: 'Write for the three questions a buyer asks before they pay, then stop.' },
      { id: 'impressions', label: 'Impressions and followers as progress', looksLike: 'Rising charts', costs: 'Signups stay flat while effort grows', coaching: 'Track signups from content, by page.' },
      { id: 'ai_slop', label: 'Unedited AI articles', looksLike: 'Free scale', costs: 'Rank worse; lower citation odds', coaching: 'Add a number, a customer quote or an opinion to every post or do not publish it.' },
      { id: 'bip_no_point', label: 'Building in public without a point', looksLike: 'Consistent posting', costs: 'No audience growth that converts', coaching: 'Share one metric and one lesson per update.' },
    ],
    detection: [
      { signal: 'Specific numbers, named customers, a stated opinion, a failure', howInGame: 'Post/article judge (postHeuristic / panel)', gameable: 'partly', antiGaming: 'Claimed numbers must match the simulated company metrics; generic text flagged by lack of product-specific content' },
      { signal: 'Topics drawn from customer language; repurposing chain', howInGame: 'Overlap between article queries and ticket/call/interview themes', gameable: 'partly', antiGaming: 'Themes come from the player real logged interviews and tickets' },
      { signal: 'Posts shipped vs plan; citation / ranking checks', howInGame: 'Organic slice: posts, articles, citations over months', gameable: 'no', antiGaming: 'Sustained cadence' },
    ],
  },

  launch_community_referral: {
    label: 'Launches, community and word of mouth / referrals',
    apps: ['organic', 'channels', 'messages'],
    tiers: {
      stellar: {
        behaviours: [
          'waitlist/early-user group 4-8 weeks before launch with a specific ask',
          'sequence: personal network, then a niche community (rules read), then broad launch; replies to every comment in 24h',
          'referral loop with a real reward and measured k-factor; asks customers for named intros after a result',
        ],
        outcomes: { first30DaySignupsVsSingleBroadLaunch: [3, 10], referralJoinRatePctOfCustomers: [5, 15], referralShareOfNewPct: [10, 15] },
      },
      good: {
        behaviours: ['Product Hunt plus a few communities, launch-day plan', 'simple referral/affiliate link'],
        outcomes: { first30DaySignupsVsSingleBroadLaunch: [1.5, 2.5], referralJoinRatePctOfCustomers: [3, 5], referralShareOfNewPct: [5, 8] },
      },
      average: {
        behaviours: ['launches once to everyone at the same time', 'posts in communities without reading rules (removed)', 'affiliate programme with no tracking'],
        outcomes: { first30DaySignupsVsSingleBroadLaunch: 1, referralJoinRatePctOfCustomers: [2, 3], referralShareOfNewPct: [2, 5] },
      },
      mediocre: {
        behaviours: ['buys upvotes/reviews', 'launches before the product is usable', 'cold-DMs strangers with a link; never follows up with first users'],
        outcomes: { first30DaySignupsVsSingleBroadLaunch: [0.1, 0.5], referralJoinRatePctOfCustomers: [0, 2], referralShareOfNewPct: [0, 2] },
      },
    },
    metrics: {
      first30DaySignupsVsSingleBroadLaunch: { label: 'First-30-day signups vs a single broad launch', unit: 'x', source: 'o2 s4 [design]: 3-10x from pre-launch list size', sourced: false, confidence: 'design' },
      referralJoinRatePctOfCustomers: { label: 'Referral join rate (% of active customers)', unit: '%', source: 'o2 s4: vendor blogs 2025-2026, 2-8% (5-15% startups) [unverified]', sourced: true, confidence: 'secondary' },
      referralShareOfNewPct: { label: 'Share of new customers from referrals', unit: '%', source: 'o2 s4: median 2-5%, top quartile 10%+ (vendor blogs) [unverified]', sourced: true, confidence: 'secondary' },
    },
    traps: [
      { id: 'single_launch_day', label: 'One launch day as the whole GTM', looksLike: 'A big spike', costs: 'Spike decays; 89.6% of Product Hunt launches never pass 10 votes (indie tally [unverified])', coaching: 'Treat launch day as the one spike in a 6-week sequence.' },
      { id: 'buy_upvotes', label: 'Buying upvotes, reviews or fake referrals', looksLike: 'Social proof', costs: 'Platform bans and FTC exposure', coaching: 'Do not. The platform and the buyer both notice.' },
      { id: 'link_in_ten_communities', label: 'Same link in ten communities', looksLike: 'Reach', costs: 'Removed and banned', coaching: 'Post one useful thing per community and link only where rules allow.' },
      { id: 'untracked_referral', label: 'Referral reward nobody wants or tracks', looksLike: 'A programme exists', costs: 'Never measured; k stays near the no-programme baseline', coaching: 'Give a reward the referrer wants, then count referred signups for 30 days.' },
    ],
    detection: [
      { signal: 'Pre-launch list built; communities chosen by rule-reading and fit', howInGame: 'Network size and early-user logs at launch; community post judge (helpfulness vs promotional)', gameable: 'partly', antiGaming: 'Signup counts follow the simulated audience size, not the claim' },
      { signal: 'Follow-up within 48h; launch sequencing', howInGame: 'Timestamps of replies vs launch event', gameable: 'no', antiGaming: 'Time-based' },
      { signal: 'Referral reward and k-factor consistent with the economics', howInGame: 'kFactor from configured reward and product factor', gameable: 'no', antiGaming: 'k is computed, not declared' },
    ],
  },

  pricing_packaging: {
    label: 'Pricing and packaging',
    apps: ['pricing', 'stripe', 'channels'],
    tiers: {
      stellar: {
        behaviours: [
          'prices from the value metric and the buyer alternative, not cost',
          'Van Westendorp then live A/B or new-cohort test; launches at a price that can be raised later',
          'raises existing prices with notice and grandfathering; tracks annual mix; reviews twice a year',
          'reprices after AI cost or competitor moves with a plan for affected customers',
        ],
        outcomes: { priceVsUntestedPct: [20, 50], priceIncreaseChurnPctOfAffected: [2, 5], reviewsPerYear: 2 },
      },
      good: {
        behaviours: ['three tiers with a recommended plan, annual discount', 'yearly review; policy-based discounts'],
        outcomes: { priceVsUntestedPct: [10, 20], priceIncreaseChurnPctOfAffected: [4, 8], reviewsPerYear: 1 },
      },
      average: {
        behaviours: ['copies competitor pricing, set once never changed', 'unlimited free plan that cannibalises paid', 'discounts on request'],
        outcomes: { priceVsUntestedPct: 0, priceIncreaseChurnPctOfAffected: [8, 15], reviewsPerYear: 0 },
      },
      mediocre: {
        behaviours: ['prices below the cost of support and AI inference', 'discounts every deal', 'surprise price changes with no grandfathering', 'hides price behind "contact us" on a self-serve product'],
        outcomes: { priceVsUntestedPct: [-30, -10], priceIncreaseChurnPctOfAffected: [15, 30], reviewsPerYear: 0 },
      },
    },
    metrics: {
      priceVsUntestedPct: { label: 'Tested price vs untested price for the same product', unit: '%', source: 'o2 s5 [design]: "20-50% above an untested one"', sourced: false, confidence: 'design' },
      priceIncreaseChurnPctOfAffected: { label: 'Churn spike among customers hit by a price increase', unit: '%', source: 'o2 s5: McKinsey-cited 15%+ spikes for poorly executed increases (Monetizely May 2025, no link [unverified]); the repo models it in channels/stats.js priceIncreaseChurn; tier values [design]', sourced: true, confidence: 'secondary' },
      reviewsPerYear: { label: 'Pricing reviews per year', unit: 'count', source: 'o2 s5: Paddle survey twice-yearly reviewers see 13% lower churn (secondhand [unverified]); [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'price_from_cost', label: 'Pricing from cost', looksLike: 'Safe margin maths', costs: 'Leaves the value surplus; or underprices vs inference cost', coaching: 'Start from what the buyer pays today to solve this, then check costs fit under that.' },
      { id: 'surprise_increase', label: 'Surprise increase with no grandfathering', looksLike: 'Quick revenue', costs: 'Churn follows the surprise, plus public backlash', coaching: 'Give 60 days notice, grandfather for a period, say why.' },
      { id: 'unlimited_free', label: 'Unlimited free plan', looksLike: 'Growth', costs: 'Cannibalises paid; support cost', coaching: 'Put the limit where the paying customer gets value.' },
      { id: 'discount_everything', label: 'Discounting every enterprise deal', looksLike: 'Winning deals', costs: 'Trains buyers to wait; margin gone', coaching: 'Discount for term or case study only.' },
    ],
    detection: [
      { signal: 'Price set from buyer alternative and value metric; tested before launch', howInGame: 'Pricing lab: survey/A-B evidence present and sample size at decision time', gameable: 'partly', antiGaming: 'Claimed "tested" requires a real sample or cohort result; price judged against the hidden willingness-to-pay distribution' },
      { signal: 'Increase workflow: notice days, grandfather months, communication quality', howInGame: 'scheduleIncrease parameters and notice judge', gameable: 'no', antiGaming: 'Churn drawn from the parameters, with backlash modifier' },
      { signal: 'Pricing review date and annual mix tracked', howInGame: 'Pricing history timestamps; annual share in Stripe', gameable: 'no', antiGaming: 'Time-based' },
    ],
  },

  lifecycle_activation: {
    label: 'Lifecycle email and activation',
    apps: ['insights', 'customers', 'analytics', 'mail'],
    tiers: {
      stellar: {
        behaviours: [
          'defines one activation event and measures time-to-activation weekly',
          '4-6 onboarding emails, each with one action, triggered by behaviour not the clock',
          'splits signup by intent; changes the flow from the drop-off step, not email open rates; reads cohort activation monthly',
        ],
        outcomes: { activationRatePctOfSignups: [45, 60], activationLiftPointsPerQuarter: [10, 20], onboardingEmailOpenRatePct: [50, 56] },
      },
      good: {
        behaviours: ['welcome sequence and a few behaviour triggers', 'tracks open and click; activation reviewed quarterly'],
        outcomes: { activationRatePctOfSignups: [35, 45], activationLiftPointsPerQuarter: [3, 8], onboardingEmailOpenRatePct: [40, 50] },
      },
      average: {
        behaviours: ['generic newsletter to everyone, welcome email plus monthly update', 'judges by open rate; no activation definition'],
        outcomes: { activationRatePctOfSignups: [25, 35], activationLiftPointsPerQuarter: [0, 2], onboardingEmailOpenRatePct: [21, 30] },
      },
      mediocre: {
        behaviours: ['weekly discount blasts to the full list', '"we miss you" to users who never activated; upsells to non-activated users', 'uses unsubscribes as the churn metric'],
        outcomes: { activationRatePctOfSignups: [10, 25], activationLiftPointsPerQuarter: [-3, 0], onboardingEmailOpenRatePct: [15, 21] },
      },
    },
    metrics: {
      activationRatePctOfSignups: { label: 'Activation rate', unit: '%', source: 'o2 s6: 2022 survey median 25% overall / 30% SaaS; Userpilot roundup 37.5% across 62 companies; definitions differ [unverified]; the 41.7% 2026 claim excluded', sourced: true, confidence: 'secondary' },
      activationLiftPointsPerQuarter: { label: 'Activation gain per quarter from flow fixes', unit: 'points', source: 'o2 s6 [design]: "10-20 points in a quarter through flow fixes; email tweaks alone rarely"', sourced: false, confidence: 'design' },
      onboardingEmailOpenRatePct: { label: 'Onboarding email open rate', unit: '%', source: 'o2 s6: PostHog own flow 56% open / 7.4% CTR (floors 40/4); SaaS average 21.5% open / 7.2% click (2025 planning report, no methodology) [unverified]', sourced: true, confidence: 'secondary' },
    },
    traps: [
      { id: 'optimise_open_rate', label: 'Optimising open rate', looksLike: 'Subject-line wins', costs: 'Opens rise, activation flat', coaching: 'Open rate tells you the subject line worked; activation tells you the product did.' },
      { id: 'upsell_non_activated', label: 'Upselling users who have not activated', looksLike: 'Monetising the list', costs: 'Burns trial users; unsubscribes', coaching: 'Get them to the first useful action first.' },
      { id: 'no_activation_metric', label: 'No activation metric', looksLike: 'Moving fast', costs: 'Every change judged by feel', coaching: 'Pick the one action that predicts a user staying and measure it weekly.' },
      { id: 'one_drip', label: 'One drip for every signup', looksLike: 'Simple', costs: 'Wrong message to specific-use-case users', coaching: 'Split signup by intent on the form.' },
    ],
    detection: [
      { signal: 'Activation event named and measured; segmentation by signup intent', howInGame: 'Insights app activation definition and funnel views opened over time', gameable: 'partly', antiGaming: 'Activation numbers come from the modelled product flow; a claimed lift without a changed flow step is flagged' },
      { signal: 'Behaviour-triggered vs clock-triggered sends; monthly cohort reading', howInGame: 'Email/onboarding config and view timestamps', gameable: 'no', antiGaming: 'Over months' },
      { signal: 'Emails with one action vs multi-link newsletters', howInGame: 'Judge on the player-written sequence', gameable: 'partly', antiGaming: 'Same as other copy judges' },
    ],
  },

  // ======================================================================================================
  // O3: PRODUCT AND SUPPORT
  // ======================================================================================================

  customer_discovery: {
    label: 'Customer discovery and interviews (Mom Test)',
    apps: ['research', 'product', 'calls'],
    tiers: {
      stellar: {
        behaviours: [
          'opens with the last real instance of the problem; asks what they tried and what it cost',
          'asks for something the customer must give up (slot, intro, pilot, LOI); ends every call with a next step or a clear no',
          'talks under 30%; tallies commitments vs compliments; recruits strangers, not friends',
        ],
        outcomes: { interviewsEndingInNextStepPct: [30, 50], sameProblemOutOf20: [12, 15], pastToFutureQuestionRatio: 2 },
      },
      good: {
        behaviours: ['past-behaviour questions with "why" / "what happened next"', 'pitches only after the problem is confirmed; gets some commitments but does not push'],
        outcomes: { interviewsEndingInNextStepPct: [15, 30], sameProblemOutOf20: [8, 12], pastToFutureQuestionRatio: [1.5, 2] },
      },
      average: {
        behaviours: ['mixes past and hypothetical ("would you pay")', 'records praise as validation; pitches in the first ten minutes; rarely asks a next step'],
        outcomes: { interviewsEndingInNextStepPct: [5, 15], sameProblemOutOf20: [4, 8], pastToFutureQuestionRatio: 1 },
      },
      mediocre: {
        behaviours: ['leads with the product, "would you use this?"', 'counts friends/family as interviews; interview count high, commitments zero'],
        outcomes: { interviewsEndingInNextStepPct: [0, 5], sameProblemOutOf20: [0, 3], pastToFutureQuestionRatio: [0, 0.5] },
      },
    },
    metrics: {
      interviewsEndingInNextStepPct: { label: 'Interviews ending in a concrete next step', unit: '%', source: 'o3 s1 [design]: no public benchmark; Mom Test gives a qualitative standard only (mtlynch.io, undated)', sourced: false, confidence: 'design' },
      sameProblemOutOf20: { label: 'Interviewees describing the same painful recent problem (of 20)', unit: 'count', source: 'o3 s1 [design]', sourced: false, confidence: 'design' },
      pastToFutureQuestionRatio: { label: 'Past-tense to hypothetical question ratio', unit: 'ratio', source: 'o3 s1 detection [design]: "well above 2:1"', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'validated_with_friends', label: 'Declared validated on friendly evidence', looksLike: 'Hitting your own bar', costs: 'Weeks of building on politeness, then no buyers', coaching: 'Count only screened strangers against the criteria you wrote first.' },
      { id: 'adopted_outsider_request', label: 'Built what an outsider asked for', looksLike: 'Listening to customers', costs: 'A feature nobody in the segment pays for', coaching: 'Check the asker is a buyer or user in your target segment before it enters a spec.' },
      { id: 'overfit_single_customer', label: 'Overfit to one customer\'s ask', looksLike: 'Customer-led product', costs: 'Custom work worth about nothing to the rest of the segment', coaching: 'Wait for the same ask from three or more target customers.' },
      { id: 'hypothetical_wtp_as_pricing', label: 'Priced from what people said they would pay', looksLike: 'Research-based pricing', costs: 'Weak conversion and a discount scramble', coaching: 'Price from what they pay today for the workaround, or from deposits.' },
      { id: 'panel_fraud_unscreened', label: 'Unscreened panel recruits', looksLike: 'Fast, cheap interviews', costs: 'Paid fakes and professional respondents polluting the board', coaching: 'Screen on a past incident and verify before paying or counting.' },
      { id: 'no_screener_wrong_people', label: 'No screener on cold or community recruiting', looksLike: 'High interview count', costs: 'Interviews with people who never had the problem', coaching: 'Ask one screening question about the last time the problem happened.' },
      { id: 'moved_goalposts', label: 'Loosened the criteria after seeing the data', looksLike: 'Flexibility', costs: 'A conclusion the evidence did not support', coaching: 'Write thresholds first; change them only before the data exists.' },
      { id: 'opinion_as_validation', label: 'Treated an opinion as validation', looksLike: 'Positive signal', costs: 'Building on investor, founder or friend opinion rather than customer behaviour', coaching: 'Tag opinions as opinions; only past behaviour and payments count.' },
      { id: 'hypotheticals', label: 'Hypotheticals as evidence', looksLike: 'Asking about price', costs: 'Noise treated as demand; wrong feature bets', coaching: 'Ask what they did last time, not what they would do.' },
      { id: 'compliments', label: 'Compliments as signal', looksLike: 'Positive feedback', costs: 'False validation, then no buyers', coaching: 'Count the commitments, not the compliments.' },
      { id: 'warm_only', label: 'Friends and warm network only', looksLike: 'Easy interviews', costs: 'Inflated positives', coaching: 'Find people who have no reason to be polite.' },
      { id: 'no_ask', label: 'Interviewing 40 people with no commitment logged', looksLike: 'Research volume', costs: 'No changed decision', coaching: 'Every call ends with a specific next step or a clear no.' },
    ],
    detection: [
      { signal: 'Past vs future question types; player talk share; a specific ask in the last two turns and its outcome', howInGame: 'classifyQuestion / gradeTranscript on the live transcript', gameable: 'partly', antiGaming: 'Hidden persona facts (cost, workaround) only appear for past-specific questions; follow-ups must be consistent' },
      { signal: 'Logged real interviews vs claimed interviews', howInGame: 'research.interviews with real=true; specs citing more interviews than logged are blocked', gameable: 'no', antiGaming: 'Claim reconciled with the log' },
    ],
  },

  product_prioritization: {
    label: 'Product prioritization and specs',
    apps: ['product', 'research', 'customers'],
    tiers: {
      stellar: {
        behaviours: [
          'problem, user, evidence (count of customers asking/churning) and measurable outcome with baseline before any solution',
          'says no to most requests and records why; kills features against a stated metric',
          'cuts scope to the smallest version that tests the assumption; revisits monthly against new evidence',
        ],
        outcomes: { shippedFeaturesMovingMetricPct: [40, 60], rejectedRequestsLogged: 1 },
      },
      good: {
        behaviours: ['RICE/ICE with real reach data', 'acceptance criteria written; sometimes lets loud customers move the roadmap'],
        outcomes: { shippedFeaturesMovingMetricPct: [25, 40], rejectedRequestsLogged: 0.5 },
      },
      average: {
        behaviours: ['priorities follow the last sales call or intuition', 'specs are feature lists; vague acceptance; measures by shipping'],
        outcomes: { shippedFeaturesMovingMetricPct: [15, 25], rejectedRequestsLogged: 0 },
      },
      mediocre: {
        behaviours: ['"killer features", copies competitors, adds settings instead of removing friction', 'outcome like "increase engagement 50%" with no baseline'],
        outcomes: { shippedFeaturesMovingMetricPct: [0, 10], rejectedRequestsLogged: 0 },
      },
    },
    metrics: {
      shippedFeaturesMovingMetricPct: { label: 'Shipped features that move their target metric', unit: '%', source: 'o3 s2 [design]: no primary benchmark; Pavilion product data not found', sourced: false, confidence: 'design' },
      rejectedRequestsLogged: { label: 'Operator logs what they said no to and why (1 = yes)', unit: 'flag', source: 'o3 s2 detection [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'overfit_to_loud_customer', label: 'Built a feature only one account needs', looksLike: 'Responsive to the biggest customer', costs: 'Build hours spent, plus clutter the rest of the segment never uses', coaching: 'Ask how many target accounts hit the same job before building.' },
      { id: 'custom_feature_bloat', label: 'Custom feature bloat', looksLike: 'Shipped what was asked', costs: 'Maintenance and clutter that slow every later release', coaching: 'Kill or isolate custom work that no one else adopts.' },
      { id: 'feature_count', label: 'Feature-count productivity', looksLike: 'Many shipped items', costs: 'Flat retention; debt', coaching: 'Write the outcome before the feature.' },
      { id: 'request_volume', label: 'Roadmap by request volume', looksLike: 'Customer-driven', costs: 'Loud customers rarely representative', coaching: 'Your roadmap is a list of requests you said yes to. Write down what you said no to.' },
      { id: 'build_whole_spec', label: 'Building the whole spec before testing the riskiest assumption', looksLike: 'Completeness', costs: 'Weeks of rework when the assumption fails', coaching: 'Ship the smallest version that tests the assumption.' },
      { id: 'settings_for_friction', label: 'Adding settings when onboarding is the problem', looksLike: 'Flexibility', costs: 'Bloat; activation unchanged', coaching: 'Fix the friction instead of adding options.' },
    ],
    detection: [
      { signal: 'Spec names a user, baseline number and acceptance test; kills recorded with reasons', howInGame: 'Spec lint + rubric (product/spec.js) and decision log', gameable: 'partly', antiGaming: 'Evidence only counts if linked to REAL logged insights; keyword-stuffed solutions are detected' },
      { signal: 'Sequence: cites evidence for item A but builds item B first', howInGame: 'Build-queue order vs linked evidence', gameable: 'no', antiGaming: 'Order of actions is visible' },
      { signal: 'Priorities re-ranked after new evidence', howInGame: 'Queue edits vs new research insights', gameable: 'no', antiGaming: 'Time-based' },
    ],
  },

  ai_building: {
    label: 'Building with AI coding agents (speed vs quality, tests, review, debt)',
    apps: ['product', 'people'],
    tiers: {
      stellar: {
        behaviours: [
          'writes spec and acceptance tests before prompting; tasks small enough to review in one sitting; reads every diff',
          'requires tests that fail before and pass after; refactors duplicated code on purpose; keeps a short known-debt list with owners',
        ],
        outcomes: { defectRateVsBaseline: 1, reworkHoursPerShippedHour: 0.15, velocityAfter3MonthsVsMediocre: 1.2 },
      },
      good: {
        behaviours: ['agents for well-defined tasks; reviews diffs; runs tests and linters; sometimes accepts large diffs when tests pass'],
        outcomes: { defectRateVsBaseline: 1.1, reworkHoursPerShippedHour: 0.2, velocityAfter3MonthsVsMediocre: 1.1 },
      },
      average: {
        behaviours: ['prompts whole features at once, skims diffs, relies on the agent own tests, ships when the demo works'],
        outcomes: { defectRateVsBaseline: 1.3, reworkHoursPerShippedHour: 0.3, velocityAfter3MonthsVsMediocre: 1 },
      },
      mediocre: {
        behaviours: ['long unsupervised sessions, accepts diffs unread, skips tests, treats a green build as proof'],
        outcomes: { defectRateVsBaseline: [1.3, 3.4], reworkHoursPerShippedHour: [0.4, 0.8], velocityAfter3MonthsVsMediocre: 1 },
      },
    },
    metrics: {
      defectRateVsBaseline: { label: 'Bug/incident rate vs pre-AI baseline', unit: 'x', source: 'o3 s3: Faros Acceleration Whiplash Mar 2026 (vendor): bugs per PR +29%, incidents per PR +243% low to high adoption; Faros 2025 bugs per dev +9% [unverified]; tier points [design]', sourced: false, confidence: 'design' },
      reworkHoursPerShippedHour: { label: 'Rework hours per shipped hour', unit: 'ratio', source: 'repo product/build.js reworkShare 0.15 (reviewed AI code); higher tiers [design]; GitClear Feb 2025: duplicated blocks ~8x in 2024, refactored lines 25% to under 10% [unverified]', sourced: false, confidence: 'design' },
      velocityAfter3MonthsVsMediocre: { label: 'Shipping velocity after 3 months', unit: 'x', source: 'o3 s3 [design]: mediocre ships faster for 2-4 weeks then rework grows; METR 2025 RCT: experienced devs 19% slower while believing 20% faster (16 devs, caveats)', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'demo_driven', label: 'Demo-driven shipping', looksLike: 'Fast progress', costs: 'Edge cases fail in production; later incidents', coaching: 'A green build tells you the tests pass, not that the feature works.' },
      { id: 'huge_diffs', label: 'Large unreviewed diffs', looksLike: 'High throughput', costs: 'Review time grows faster than output (Faros: median review time +441%)', coaching: 'Keep the diff small enough to read in one sitting.' },
      { id: 'copy_paste_gen', label: 'Generating instead of reusing', looksLike: 'Speed', costs: 'Duplicated code; silent debt', coaching: 'Ask the agent to find existing code before writing new code.' },
      { id: 'self_graded_tests', label: 'Tests written by the same agent', looksLike: 'High coverage', costs: 'Tests the implementation, not behaviour', coaching: 'Write the failing test first, then let the agent make it pass.' },
    ],
    detection: [
      { signal: 'Prompts name acceptance criteria and failure cases vs one-line "build X"', howInGame: 'Build-session brief text and spec acceptance list', gameable: 'partly', antiGaming: 'Later rework hours and incident rate expose a hollow brief' },
      { signal: 'Review and refactor choices; PR size', howInGame: 'Review toggle per build, size of queued feature, refactor sessions', gameable: 'no', antiGaming: 'Incident and bug rates over later sprints' },
      { signal: 'Returns to fix known debt', howInGame: 'Open bug hours vs bug-fix share of build hours', gameable: 'no', antiGaming: 'Open bug hours slow velocity (debtFactor)' },
    ],
  },

  analytics_pmf: {
    label: 'Analytics, experiments and PMF measurement',
    apps: ['analytics', 'insights', 'customers', 'outcomes'],
    tiers: {
      stellar: {
        behaviours: [
          'defines activation and retention before launch; reads cohort retention monthly and checks the curve flattens',
          'Sean Ellis survey only on users who reached the core action; pre-registers hypothesis, sample size and stop rule; reports losses',
          'tracks GRR and NRR separately',
        ],
        outcomes: { experimentsPerMonth: [2, 4], experimentWinRatePct: [10, 20], falseWinnerSharePct: [0, 10], seanEllisVeryDisappointedPct: 40 },
      },
      good: {
        behaviours: ['tracks MRR, churn and activation weekly', 'A/B tests but sometimes stops early; survey occasional and unsegmented'],
        outcomes: { experimentsPerMonth: [1, 3], experimentWinRatePct: [12, 25], falseWinnerSharePct: [10, 20], seanEllisVeryDisappointedPct: 40 },
      },
      average: {
        behaviours: ['dashboards nobody reads; vanity metrics (signups, page views)', 'declares winners after a few days; PMF survey on all users'],
        outcomes: { experimentsPerMonth: [3, 6], experimentWinRatePct: [25, 35], falseWinnerSharePct: [30, 50], seanEllisVeryDisappointedPct: 40 },
      },
      mediocre: {
        behaviours: ['changes experiments mid-test, reports only winners', 'uses NPS as PMF; reads a launch-week spike as product-market fit'],
        outcomes: { experimentsPerMonth: [0, 8], experimentWinRatePct: [30, 60], falseWinnerSharePct: [50, 80], seanEllisVeryDisappointedPct: 40 },
      },
    },
    metrics: {
      experimentsPerMonth: { label: 'Experiments run per month (small startup)', unit: 'count', source: 'o3 s4 [design]', sourced: false, confidence: 'design' },
      experimentWinRatePct: { label: 'Reported experiment win rate (inflated by peeking)', unit: '%', source: 'o3 s4: Optimizely ~127k experiments 12% win (secondary); ~20% elsewhere; Kohavi ~8% (podcast summary) [unverified]; "reported 30% from early stops" [design]', sourced: true, confidence: 'secondary' },
      falseWinnerSharePct: { label: 'Declared winners that are noise', unit: '%', source: 'o3 s4 traps [design]', sourced: false, confidence: 'design' },
      seanEllisVeryDisappointedPct: { label: 'Sean Ellis threshold ("very disappointed")', unit: '%', source: 'o3 s4: 40% cutoff from ~100 startups, Koji 2026 guide (secondary [unverified]). A threshold, identical for all tiers; the tier difference is who is surveyed', sourced: true, confidence: 'secondary' },
    },
    traps: [
      { id: 'premature_scaling_false_pmf', label: 'Scaled spend on a false PMF signal', looksLike: 'Growth after a good survey', costs: 'Cash burned on customers who churn', coaching: 'Read Sean Ellis and retention by segment before scaling.' },
      { id: 'false_pmf_signal', label: 'False PMF signal (network signups, one segment, small n)', looksLike: 'Looks like traction', costs: 'Calling PMF early and scaling into churn', coaching: 'Check that the signal comes from strangers in the strong segment and holds on retention.' },
      { id: 'peeking', label: 'Peeking and stopping early', looksLike: 'Fast learning', costs: 'False winners compound; organisational memory wrong', coaching: 'Write the stop rule before you launch the test.' },
      { id: 'only_winners', label: 'Reporting only winners', looksLike: 'A good track record', costs: 'The failures are where learning is', coaching: 'Report the losing tests.' },
      { id: 'nps_as_pmf', label: 'NPS or signups as a PMF proxy', looksLike: 'A score', costs: 'Wrong strategic call (scale too early)', coaching: 'Run the PMF survey on people who used the core feature.' },
      { id: 'spike_as_pmf', label: 'Launch spike read as PMF', looksLike: 'Growth', costs: 'Premature scaling', coaching: 'A flat retention curve matters more than one good week.' },
    ],
    detection: [
      { signal: 'Experiment log: hypothesis, sample size, stop rule; losses reported', howInGame: 'Pricing A/B tests, panel runs; (no general experiment log exists today)', gameable: 'partly', antiGaming: 'Hidden true effect: peeking early yields false winners the game later reveals in cohort revenue' },
      { signal: 'Metric choice: activation and retention vs top-of-funnel', howInGame: 'Which analytics views the player uses and decides on', gameable: 'no', antiGaming: 'Over time' },
      { signal: 'PMF called without a flattening curve', howInGame: 'Cohort curve from the hidden model vs the player claim', gameable: 'no', antiGaming: 'Hidden retention model' },
    ],
  },

  support: {
    label: 'Customer support (speed, quality, AI agent setup, knowledge base)',
    apps: ['helpdesk', 'people', 'insights'],
    tiers: {
      stellar: {
        behaviours: [
          'answers inside the target window on every channel; weekly review of the 20 worst tickets',
          'help articles written from ticket themes; AI agent scoped to the 10-15 common intents, tested on past tickets, with a handoff rule',
          'CSAT checked by intent; tells customers about outages early',
          'verifies identity before any ownership, 2FA or data change (callback to the owner on file) and VIPs get the same checks; refunds before a dispute is filed and contests only winnable ones with full evidence; finishes data requests in 10-14 days; answers real security reports in days and pays nothing to beg bounties; one calm public reply, then private',
        ],
        outcomes: { firstResponseHoursEmail: [0, 1], aiResolutionSharePct: [50, 65], csatVsBaseline: [0, 5], repeatContactPct: [5, 10] },
      },
      good: {
        behaviours: ['fast replies, knowledge base, personalised templates', 'AI agent with limited scope; handoff exists but untuned', 'follows the identity checklist but skips the audit log; answers disputes and data requests on time with most of the evidence'],
        outcomes: { firstResponseHoursEmail: [1, 4], aiResolutionSharePct: [40, 55], csatVsBaseline: [-3, 0], repeatContactPct: [10, 15] },
      },
      average: {
        behaviours: ['replies within a working day; outdated knowledge base', 'AI agent answers everything including edge cases; CSAT measured but not acted on', 'refunds whatever is asked, files disputes late, tags are blank and notes empty; macros answer the wrong question'],
        outcomes: { firstResponseHoursEmail: [4, 12], aiResolutionSharePct: [30, 45], csatVsBaseline: [-5, -2], repeatContactPct: [15, 25] },
      },
      mediocre: {
        behaviours: ['slow replies, canned answers, AI agent with no escalation path', 'closes tickets without answering; resolution rate as the only KPI', 'changes the owner because the requester sounds senior, pays beg bounties, misses data-request deadlines, replies defensively in public threads'],
        outcomes: { firstResponseHoursEmail: [12, 48], aiResolutionSharePct: [20, 30], csatVsBaseline: [-15, -8], repeatContactPct: [25, 40] },
      },
    },
    metrics: {
      firstResponseHoursEmail: { label: 'First response time, email', unit: 'hours', source: 'o3 s5: Zendesk tiers via StealthAgents aggregator 2025: under 1h best, under 4h good, under 12h acceptable [unverified]; Freshworks 2025 median ~1h, top 20% ~3 min 10 s [unverified]', sourced: true, confidence: 'secondary' },
      aiResolutionSharePct: { label: 'AI agent resolution rate', unit: '%', source: 'o3 s5: Intercom Fin avg ~66% across 6,000+ customers (Oct 2025), product page 54% (vendor-reported); tier split [design]; Intercom warns resolution is not share of work automated', sourced: true, confidence: 'secondary' },
      csatVsBaseline: { label: 'CSAT change after AI deployment vs baseline', unit: 'points', source: 'o3 s5 [design]: mediocre CSAT falls after deployment; Liveops Dec 2025: 55% escalated an AI issue to a human, 54% say humans better (holiday sample)', sourced: false, confidence: 'design' },
      repeatContactPct: { label: 'Customers contacting again within 48h', unit: '%', source: 'o3 s5 detection idea [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'deflection_as_resolution', label: 'Counting deflection as resolution', looksLike: 'High resolution rate', costs: 'Frustrated customers churn (Klarna 2025 reversal)', coaching: 'Measure repeat contact, not just resolution.' },
      { id: 'no_handoff', label: 'AI agent with no human handoff', looksLike: 'Full automation', costs: 'Stuck customers churn; wrong answers return as angry tickets', coaching: 'Write the handoff rule before you deploy the agent.' },
      { id: 'founder_view_kb', label: 'Knowledge base from the founder view', looksLike: 'Documentation exists', costs: 'Does not match ticket themes; low deflection', coaching: 'Turn the top five question themes into help articles this week.' },
      { id: 'fast_and_wrong', label: 'Speed targets met by closing without answering', looksLike: 'Great response time', costs: 'CSAT falls, repeat contacts rise', coaching: 'Fast and wrong is worse than a little slower and right.' },
      { id: 'unverified_handover', label: 'Handing over an account on a story', looksLike: 'Helpful, fast service to a "new owner" or a "big customer"', costs: 'Account takeover, a chargeback on the attacker\'s card, data exposure and a 72-hour breach clock', coaching: 'Never change an owner, admin or 2FA on a support message: call the owner on file, ask what only they know, and refuse politely with the path forward. VIPs get the same checks.' },
      { id: 'beg_bounty_paid', label: 'Paying a beg bounty', looksLike: 'Making a researcher go away', costs: 'Wasted money and more of the same for months; real researchers learn you pay for noise', coaching: 'Ask for a proof of concept of real impact; pay only through a clear policy, never to a "pay or I publish" demand. Fix and credit real reports within days.' },
      { id: 'real_vuln_ignored', label: 'A real vulnerability ignored or dismissed', looksLike: 'Beg-bounty noise filtered out', costs: 'Public disclosure after 30-45 days, possible exploitation and a breach notice', coaching: 'Read the proof of concept before dismissing anything; publish security.txt so real reports reach you; acknowledge in two business days.' },
      { id: 'dsr_missed', label: 'Missed data-subject request deadline', looksLike: 'A quiet inbox request', costs: 'A data-protection-authority complaint, counsel time and a review', coaching: 'Log the clock on receipt; GDPR is one month (extension notice inside it), CCPA 45 days. Finish in 10-14 days.' },
      { id: 'dispute_missed', label: 'Card disputes lapsing or conceded', looksLike: 'Not worth the time for $29', costs: 'The charge, a $15 fee and a rising dispute ratio toward network programmes', coaching: 'Refund real errors before the dispute; contest friendly fraud with the usage log, terms, reminder and device match inside the window.' },
      { id: 'refund_leak', label: 'Refunding without checking channel, window or cause', looksLike: 'Happy customers', costs: 'A revenue leak that teaches customers to ask; promised store refunds become chargebacks', coaching: 'Identify the channel first (store refunds are Apple or Google), apply the written window, log a reason code.' },
      { id: 'cancel_blocked', label: 'Blocking or pressuring a cancellation', looksLike: 'A retention win', costs: 'Disputes, posts and regulator exposure (ROSCA, California auto-renewal law)', coaching: 'Offer saves once, in order, then cancel at period end and log the reason.' },
      { id: 'viral_complaint', label: 'A public complaint mishandled', looksLike: 'Defending the company', costs: 'Screenshots, a churn and trial hit for a month', coaching: 'Acknowledge within the hour, own the specific error, move it to a private ticket, fix first, follow up in 24-48 h. Never delete or reply as a fake customer.' },
      { id: 'ai_flow_scope', label: 'AI agent allowed to decide high-stakes cases', looksLike: 'Full automation', costs: 'Approved out-of-policy refunds, ownership transfers on a good story, data released to the wrong person', coaching: 'Keep the agent off refunds, ownership and access changes, data requests, security reports and legal requests; Draft for the rest.' },
    ],
    detection: [
      { signal: 'Reply quality: answers the question asked, cites the next step', howInGame: 'replyQuality / panel on the sent reply vs the ticket', gameable: 'yes', antiGaming: 'Keyword heuristics are stuffable; require the reply to reference facts from the ticket and the customer account' },
      { signal: 'Weekly worst-ticket review; knowledge base updated after repeated question', howInGame: 'Article creation vs ticket theme counts', gameable: 'no', antiGaming: 'Themes are drawn from real simulated tickets' },
      { signal: 'AI setup: scope list size, test against historical tickets, handoff trigger', howInGame: 'AI agent configuration (today: only an on/off toggle)', gameable: 'no', antiGaming: 'Wrong-answer rate depends on scope and docs coverage' },
      { signal: 'Response-time distribution (tails), CSAT by intent, repeat-contact within 48h', howInGame: 'frtLog, csatLog, deflected customers who return', gameable: 'no', antiGaming: 'Outcome-based' },
    ],
  },

  // ======================================================================================================
  // O4: FINANCE, LEGAL, HIRING AND PEOPLE
  // ======================================================================================================

  cash_runway: {
    label: 'Cash management, runway and forecasting',
    apps: ['bank', 'analytics', 'fundraising', 'financing'],
    tiers: {
      stellar: {
        behaviours: [
          '13-week cash forecast updated weekly with named line items (payroll dates, processor payouts, annual prepay timing, tax dates)',
          'rolling months-of-runway at current burn and at planned hires; hard floor (e.g. 6 months) with a pre-set action',
          'models base, churn-shock and -20% revenue scenarios and writes down cuts; asks burn multiple before approving a hire',
        ],
        outcomes: { runwayMonthsWhenRaiseStarts: [9, 14], forecastError3MonthPct: 10, burnMultiple: [0, 1] },
      },
      good: {
        behaviours: ['monthly spreadsheet forecast; knows runway number and date', 'separates committed from discretionary spend; thinks about a raise at ~9 months'],
        outcomes: { runwayMonthsWhenRaiseStarts: [8, 10], forecastError3MonthPct: [10, 20], burnMultiple: [1, 2] },
      },
      average: {
        behaviours: ['looks at the bank balance; forecasts by extending last month', 'counts deferred revenue or unpaid invoices as cash; no burn trend'],
        outcomes: { runwayMonthsWhenRaiseStarts: [5, 8], forecastError3MonthPct: 25, burnMultiple: [2, 3] },
      },
      mediocre: {
        behaviours: ['does not know net burn to the nearest $5k', 'hires assuming the next round closes; raises under 6 months of runway', 'mixes annual prepayments into MRR-based runway'],
        outcomes: { runwayMonthsWhenRaiseStarts: [0, 5], forecastError3MonthPct: [40, 80], burnMultiple: [3, 6] },
      },
    },
    metrics: {
      runwayMonthsWhenRaiseStarts: { label: 'Runway when the raise starts', unit: 'months', source: 'o4 s1 [design]: no source found', sourced: false, confidence: 'design' },
      forecastError3MonthPct: { label: '3-month cash forecast error', unit: '%', source: 'o4 s1 [design]: stellar +-10%, average +-25%, mediocre +-40%', sourced: false, confidence: 'design' },
      burnMultiple: { label: 'Burn multiple (net burn / net new ARR)', unit: 'x', source: 'o4 s1: top quartile under 1x, median 1-2x, bottom above 3x, via VCBeast secondary (S15), date not given [unverified]', sourced: true, confidence: 'secondary' },
    },
    traps: [
      { id: 'deferred_as_cash', label: 'Counting unbilled or deferred revenue as cash', looksLike: 'Healthy for months', costs: 'Cash cliff on a payroll date', coaching: 'Your runway counts receivables that have not been paid. Remove them and tell me the real date.' },
      { id: 'hire_on_forecast', label: 'Hiring against forecast growth', looksLike: 'Investing in growth', costs: 'Burn locked in when growth slips', coaching: 'Make each hire conditional on a metric you can name.' },
      { id: 'wait_for_round', label: 'Waiting for the next round to fix cash', looksLike: 'Optimism', costs: 'Cuts decided under 4 months when every option is worse; weak raise leverage', coaching: 'Start the raise at 9 months and have a cut plan ready.' },
      { id: 'cut_payback_marketing', label: 'Cutting marketing with positive payback while keeping unowned tools', looksLike: 'Frugality', costs: 'Growth stalls', coaching: 'Cut spend with no owner and no payback first.' },
    ],
    detection: [
      { signal: 'Forecast exists, cadence of updates, includes payroll dates', howInGame: 'A forecast artefact in Bank/Books with timestamped versions (does not exist today)', gameable: 'partly', antiGaming: 'Forecast must reconcile with later simulated bank balances' },
      { signal: 'Runway question answered with a number and a date', howInGame: 'Investor/board update numbers vs ledger truth', gameable: 'no', antiGaming: 'Ledger truth' },
      { signal: 'Pre-registered trigger ("if runway under 6 months I will...") and whether it was honoured', howInGame: 'Stored trigger vs later action', gameable: 'no', antiGaming: 'Checked against later state' },
    ],
  },

  bookkeeping_close_tax: {
    label: 'Bookkeeping, monthly close, taxes and compliance deadlines',
    apps: ['books', 'legal', 'bank', 'stripe'],
    tiers: {
      stellar: {
        behaviours: [
          'chart of accounts with deferred revenue; close checklist with owners and due days; closes in ~5 business days',
          'compliance calendar (Delaware franchise tax Mar 1, estimates, 1099s Jan 31, sales tax, payroll) with a reminder each',
          'hires an outside bookkeeper/accountant before the first filing deadline',
        ],
        outcomes: { closeBusinessDays: [3, 5], missedFilingsPerYear: 0, misclassifiedTxnSharePct: [0, 2] },
      },
      good: {
        behaviours: ['outsourced bookkeeper with monthly reconciliation', 'knows the big deadlines (shared calendar)'],
        outcomes: { closeBusinessDays: [8, 10], missedFilingsPerYear: [0, 0.3], misclassifiedTxnSharePct: [2, 5] },
      },
      average: {
        behaviours: ['books caught up at tax time; revenue recognised on cash receipt', 'bank feed used without reconciling; nexus discovered by state letter'],
        outcomes: { closeBusinessDays: [15, 30], missedFilingsPerYear: [0.3, 1], misclassifiedTxnSharePct: [5, 10] },
      },
      mediocre: {
        behaviours: ['has already missed a filing and paid a penalty', 'mixes personal and business cards; unsure of Delaware standing; books 60+ days behind'],
        outcomes: { closeBusinessDays: [60, 120], missedFilingsPerYear: [1, 3], misclassifiedTxnSharePct: [10, 20] },
      },
    },
    metrics: {
      closeBusinessDays: { label: 'Business days to close the month', unit: 'days', source: 'o4 s2: Consero 2025 via Ledge/ChatFin: only 7% close under 3 days, 62% within 9 [unverified]; vendor target 5 days (Maxio); APQC 2018 top quartile 4.8 days, bottom 10+ (cited via Orb, dated [unverified])', sourced: true, confidence: 'secondary' },
      missedFilingsPerYear: { label: 'Missed filings per year', unit: 'count', source: 'o4 s2 [design] penalty model; filing dates to be checked against IRS/state calendars', sourced: false, confidence: 'design' },
      misclassifiedTxnSharePct: { label: 'Transactions booked to the wrong category', unit: '%', source: 'books.js: DIY AI guesses ~10% wrong (repo design assumption); tier values [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'cash_basis_annual', label: 'Revenue recognised at cash receipt on annual plans', looksLike: 'A strong month', costs: 'Restatement or tax surprise', coaching: 'Put annual prepay into deferred revenue and recognise it monthly.' },
      { id: 'bank_feed_is_books', label: 'Bank feed as the books', looksLike: 'Up to date', costs: 'Missing accruals make margin look good until year-end', coaching: 'Reconcile and accrue before you read the P&L.' },
      { id: 'no_revenue_no_tax', label: '"No revenue, no tax"', looksLike: 'Common sense', costs: 'Sales-tax nexus and VAT exposure from the first sale in some states', coaching: 'Check nexus and registrations as sales start.' },
      { id: 'deadline_in_head', label: 'Deadlines in one head', looksLike: 'Under control', costs: 'Missed Delaware filing blocks banking and fundraising', coaching: 'Put March 1 on the calendar with an owner and a reminder 60 days before.' },
    ],
    detection: [
      { signal: 'Close checklist, owner and due day; deferred revenue handled for annual plans', howInGame: 'Books close items completed with tie-outs to bank and Stripe', gameable: 'no', antiGaming: 'Ledger tie-outs fail if wrong' },
      { signal: 'Calendar items filed on time over several simulated years', howInGame: 'Compliance records vs due dates', gameable: 'no', antiGaming: 'Penalties are computed' },
      { signal: 'Books reconcile to the bank', howInGame: 'tieOuts() and stripeRecon()', gameable: 'no', antiGaming: 'Hidden truth ledger' },
    ],
  },

  payments_dunning: {
    label: 'Payments, billing and dunning operations',
    apps: ['stripe', 'analytics', 'books'],
    tiers: {
      stellar: {
        behaviours: [
          'automatic retries plus a multi-step dunning sequence (email, in-app notice, card-update link, pause/downgrade) timed to decline reasons',
          'card updater on; recovery tracked by cohort and decline code; involuntary churn its own line in the MRR bridge',
          'dunning emails from a person name; fast card-update page',
        ],
        outcomes: { failedPaymentRecoveryPct: [70, 85], involuntaryShareOfChurnPct: [10, 20] },
      },
      good: {
        behaviours: ['processor default retry schedule and one dunning email', 'looks at failed-payment counts monthly'],
        outcomes: { failedPaymentRecoveryPct: [55, 70], involuntaryShareOfChurnPct: [20, 30] },
      },
      average: {
        behaviours: ['retries on but recovery untracked; one generic dunning email', 'failed payments counted as churn only when the customer cancels'],
        outcomes: { failedPaymentRecoveryPct: [40, 55], involuntaryShareOfChurnPct: [30, 40] },
      },
      mediocre: {
        behaviours: ['failed customers never contacted; involuntary churn counted as voluntary', 'repeated failures from pricing/invoice errors nobody investigates', 'discounts to win back failed-card customers'],
        outcomes: { failedPaymentRecoveryPct: [20, 35], involuntaryShareOfChurnPct: [40, 55] },
      },
    },
    metrics: {
      failedPaymentRecoveryPct: { label: 'Failed-payment recovery', unit: '%', source: 'o4 s3: Recurly 30 Apr 2026 (enterprise optimised retries 53% to 71%); Recurly median ~47.6% via Slicker/Orb; layered programmes 70-85% (Yuno); Stripe ~55% avg claim; B2C vendor audit 25-35% [unverified, definitions differ: compare like with like]', sourced: true, confidence: 'secondary' },
      involuntaryShareOfChurnPct: { label: 'Involuntary share of total churn', unit: '%', source: 'o4 s3: 20-40% plausible range (secondary [unverified]); tier values [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'one_email', label: 'Dunning with one email at day 0', looksLike: 'A reminder was sent', costs: 'Recovers little and blames the customer', coaching: 'Send four over 14 days, with a card-update link in each.' },
      { id: 'same_retry', label: 'Retrying the same card on the same schedule', looksLike: 'Persistence', costs: 'Same decline reasons repeat', coaching: 'Use smart retry logic by decline reason.' },
      { id: 'involuntary_as_voluntary', label: 'Counting involuntary churn as "customer decided to leave"', looksLike: 'Normal churn', costs: 'Hides the lever the operator controls', coaching: 'Involuntary churn is a billing problem you can fix this month.' },
      { id: 'discount_winback', label: 'Discounting to win back failed cards', looksLike: 'Saving a customer', costs: 'Trains customers to fail on purpose', coaching: 'Fix the payment method, not the price.' },
    ],
    detection: [
      { signal: 'Dunning sequence configured with timings in days', howInGame: 'Stripe Billing settings (today: boolean toggles only)', gameable: 'yes', antiGaming: 'A toggle is cheap; recovery curves must respond to the retry and reminder choices with noise' },
      { signal: 'Recovery tracked by cohort and decline reason', howInGame: 'Recovery view opened; decisions on cohorts', gameable: 'no', antiGaming: 'Behavioural' },
      { signal: 'Asks for decline reason not just count', howInGame: 'Past-due list drill-in by reason', gameable: 'no', antiGaming: 'Behavioural' },
    ],
  },

  legal_hygiene: {
    label: 'Legal hygiene (entity, IP, contracts, 83(b), privacy, SOC 2 timing)',
    apps: ['legal', 'cofounder', 'people', 'fundraising'],
    tiers: {
      stellar: {
        behaviours: [
          'forms the entity before the first customer or commit; signs founder IP assignment in writing',
          'files 83(b) within 30 days and keeps proof; MSA and DPA template before the first paid customer',
          'privacy policy matches what the product collects; starts SOC 2 Type 1 before enterprise cycles need it',
        ],
        outcomes: { filed83bOnTimePct: 100, diligenceRedFlags: 0, enterpriseDealsLostToSoc2Pct: [0, 5] },
      },
      good: {
        behaviours: ['incorporation service and standard founder agreement', 'knows the 83(b) deadline but files late or with help; generic ToS/privacy; SOC 2 when the first large prospect asks'],
        outcomes: { filed83bOnTimePct: [85, 95], diligenceRedFlags: [0, 1], enterpriseDealsLostToSoc2Pct: [5, 15] },
      },
      average: {
        behaviours: ['templates with no review; click-through customer contracts', 'contractors sign nothing or a one-line NDA; SOC 2 discovered in a sales call'],
        outcomes: { filed83bOnTimePct: [50, 70], diligenceRedFlags: [2, 3], enterpriseDealsLostToSoc2Pct: [15, 30] },
      },
      mediocre: {
        behaviours: ['does not know the 83(b) rule; code written before incorporation owned by a person', 'privacy policy describes a product that no longer exists', 'signs an enterprise DPA without reading the subprocessor list'],
        outcomes: { filed83bOnTimePct: [0, 30], diligenceRedFlags: [4, 8], enterpriseDealsLostToSoc2Pct: [30, 60] },
      },
    },
    metrics: {
      filed83bOnTimePct: { label: '83(b) filed within 30 days', unit: '%', source: 'o4 s4: Carta and Harness guidance (30 days; Harness: deadline ties to transfer, so assume the earlier date); binary outcome, tier shares [design]', sourced: false, confidence: 'design' },
      diligenceRedFlags: { label: 'Legal red flags at investor diligence', unit: 'count', source: 'o4 s4 [design]; mirrors legalIssues() in legal/sim.js', sourced: false, confidence: 'design' },
      enterpriseDealsLostToSoc2Pct: { label: 'Enterprise deals lost for lack of SOC 2', unit: '%', source: 'o4 s4 [design]: "no source found"; Drata SOC 2 timelines (Type 1 3-6 months, Type 2 6-15) and costs are vendor claims [unverified]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'no_ip_assignment', label: 'Founders not assigning IP to the company', looksLike: 'Saves a step', costs: 'Cap-table or acquisition problem years later', coaching: 'Get the IP assignment signed before you take any money.' },
      { id: 'miss_83b', label: 'Missing the 83(b) and assuming it is optional', looksLike: 'Nothing happens', costs: 'Irreversible: taxed at each vesting event at a higher value', coaching: 'The 83(b) is 30 days from issuance. File today or accept the risk.' },
      { id: 'soc2_in_deal', label: 'Starting SOC 2 during a deal', looksLike: 'Reactive', costs: 'Adds months to the sales cycle; costlier audit', coaching: 'Start SOC 2 before the first deal asks for it.' },
      { id: 'dpa_unread', label: 'DPA template without checking subprocessors', looksLike: 'Paperwork done', costs: 'A privacy claim the company cannot honour', coaching: 'Read the subprocessor list before you sign.' },
    ],
    detection: [
      { signal: 'Entity, IP assignment and 83(b) before the first customer or hire', howInGame: 'Dates in the Legal app vs first customer/hire day', gameable: 'no', antiGaming: 'Dates are in the player own record' },
      { signal: 'Contracts signed by customers and contractors; DPA before enterprise sales', howInGame: 'legalIssues() list at diligence and at enterprise proposals', gameable: 'no', antiGaming: 'Document state, not claims' },
    ],
  },

  hiring: {
    label: 'Hiring (sourcing, interviewing, closing candidates)',
    apps: ['people', 'cofounder'],
    tiers: {
      stellar: {
        behaviours: [
          'role scorecard with 3-5 outcomes and a work sample before the first interview',
          'sources from referrals and a named target list; structured loop with same questions and written anchors',
          'calls references ("what would make you not hire them again?"); offer within 48h of the final interview with the reason',
        ],
        outcomes: { structuredInterviewValidity: 0.51, offerAcceptancePct: [88, 92], timeToOfferDaysAfterFinal: [1, 2], hireReplacedWithin12MonthsPct: [5, 10] },
      },
      good: {
        behaviours: ['job description; same questions most of the time', 'one or two job boards plus referrals; calls one reference'],
        outcomes: { structuredInterviewValidity: 0.45, offerAcceptancePct: [82, 88], timeToOfferDaysAfterFinal: [3, 7], hireReplacedWithin12MonthsPct: [10, 20] },
      },
      average: {
        behaviours: ['hires to the next urgent gap; whatever questions come to mind', 'offer takes ~2 weeks; recruiter by default'],
        outcomes: { structuredInterviewValidity: 0.38, offerAcceptancePct: [75, 82], timeToOfferDaysAfterFinal: [10, 14], hireReplacedWithin12MonthsPct: [20, 35] },
      },
      mediocre: {
        behaviours: ['hires the most likeable candidate; skips references', 'verbal offers then renegotiates', 'pays a retained recruiter for a role a referral could fill'],
        outcomes: { structuredInterviewValidity: 0.2, offerAcceptancePct: [55, 75], timeToOfferDaysAfterFinal: [14, 30], hireReplacedWithin12MonthsPct: [40, 60] },
      },
    },
    metrics: {
      structuredInterviewValidity: { label: 'Predictive validity of the selection method used', unit: 'r', source: 'o4 s5: Schmidt, Oh and Shaffer 2016 (via secondary table): structured 0.51, work sample 0.48, unstructured 0.38; Sackett 2021 revision structured 0.42 / work sample 0.33 [unverified coefficients; ranking stable]; stellar=structured+work sample; mediocre point [design]', sourced: true, confidence: 'secondary' },
      offerAcceptancePct: { label: 'Offer acceptance', unit: '%', source: 'o4 s5: Gem 2025 benchmarks 84% (81% in 2021) via secondary coverage [unverified]; tier splits [design]', sourced: true, confidence: 'secondary' },
      timeToOfferDaysAfterFinal: { label: 'Days from final interview to offer', unit: 'days', source: 'o4 s5 behaviours [design]; Gem time-to-hire 41 days avg in 2024 (secondary)', sourced: false, confidence: 'design' },
      hireReplacedWithin12MonthsPct: { label: 'Hires replaced within 12 months', unit: '%', source: 'o4 s5 [design]: "no source found"', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'culture_fit', label: 'Unstructured "culture fit" interviews', looksLike: 'Good conversations', costs: 'Weak validity; bias; likeable-but-wrong hires', coaching: 'Write three outcomes for the role and score every candidate against them.' },
      { id: 'recruiter_first', label: 'Recruiter-first sourcing', looksLike: 'Outsourced effort', costs: 'Fee plus the same candidate list as everyone', coaching: 'Start with referrals and a named target list.' },
      { id: 'verbal_offers', label: 'Verbal offers then renegotiation', looksLike: 'Speed', costs: 'Burns trust and time; declines', coaching: 'Make the decision in 48 hours and send the offer the same day.' },
      { id: 'role_undefined', label: 'Hiring before the role is defined', looksLike: 'Urgency', costs: 'Mismatch in six months; re-hire', coaching: 'Define outcomes first.' },
    ],
    detection: [
      { signal: 'Scorecard/outcomes written before posting; structured questions; scoring anchors', howInGame: 'createScorecard, gradeQuestion, interviewExecution', gameable: 'partly', antiGaming: 'Evidence accuracy depends on question quality; fake structure still yields noisy observations' },
      { signal: 'References called with specific questions; timing from final interview to offer', howInGame: 'Candidate events and offer day', gameable: 'no', antiGaming: 'Time-based' },
      { signal: 'Work-sample scores', howInGame: 'runAssessment with the simulator scoring a real work product', gameable: 'no', antiGaming: 'Scored from hidden traits' },
    ],
  },

  global_hiring: {
    label: 'Global and part-time hiring (regions, time zones, English, vetting, classification, IP)',
    apps: ['people', 'legal', 'bank'],
    tiers: {
      stellar: {
        behaviours: [
          'matches role to region: support in the Philippines with a handoff runbook and a second shift; engineers in LatAm or Eastern Europe with 3-4 hours of overlap; enterprise sales and renewals in buyers\' hours (US, Canada, LatAm, UK)',
          'vets remote hires four ways before the offer: camera-on interview with a live ID check, a paid trial, backchannel or reference calls, and a background check with identity and employment verification',
          'reads English from a case interview and a written sample for any customer-facing role instead of trusting the resume; sets required overlap hours on the post and pays the night-shift premium when it needs them',
          'uses an EOR or Contractor of Record for staff-like work abroad, signs a local-law IP assignment before work starts, keeps part-time jobs to roles that suit part-time and to hours the role really needs',
        ],
        outcomes: { overlapShortfallCustomerRolesHours: 0, englishVerifiedBeforeOfferPct: [85, 100], fakeOrJ2HiresReachingPayrollPct: [0, 1], classificationAndIpGapsPerForeignContractor: 0, partTimeRolesOverloadedPct: [0, 10] },
      },
      good: {
        behaviours: [
          'sensible regions for each role; asks for overlap hours but not always planned coverage',
          'camera-on interviews and a trial or work sample; references but not always backchannel or a pro background check',
          'asks about English in the interview without a written sample; EOR for full-time staff abroad, contractor paper mostly right',
        ],
        outcomes: { overlapShortfallCustomerRolesHours: [0, 1], englishVerifiedBeforeOfferPct: [60, 85], fakeOrJ2HiresReachingPayrollPct: [1, 3], classificationAndIpGapsPerForeignContractor: [0, 0.3], partTimeRolesOverloadedPct: [10, 25] },
      },
      average: {
        behaviours: [
          'picks the cheapest region and a time zone that happens to work; no required overlap on the post',
          'a video call and a take-home; no backchannel; English judged by how pleasant the call felt',
          'full-time contractors abroad on a US contract template; part-time for whatever fits the budget',
        ],
        outcomes: { overlapShortfallCustomerRolesHours: [1, 3], englishVerifiedBeforeOfferPct: [25, 60], fakeOrJ2HiresReachingPayrollPct: [3, 7], classificationAndIpGapsPerForeignContractor: [0.3, 0.8], partTimeRolesOverloadedPct: [25, 50] },
      },
      mediocre: {
        behaviours: [
          'offshores customer-facing and quota roles to wherever pay is lowest, with no overlap and no check on English',
          'audio-only interviews, no trial, no references, no background check; pays a full-time contractor abroad with no IP assignment or EOR',
          'hires a 15-hour SDR or on-call support person to save money and then piles on work',
        ],
        outcomes: { overlapShortfallCustomerRolesHours: [3, 6], englishVerifiedBeforeOfferPct: [0, 25], fakeOrJ2HiresReachingPayrollPct: [7, 15], classificationAndIpGapsPerForeignContractor: [0.8, 1], partTimeRolesOverloadedPct: [50, 90] },
      },
    },
    metrics: {
      overlapShortfallCustomerRolesHours: { label: 'Hours of daily overlap missing in customer-facing roles', unit: 'hours', source: 'No time-zone productivity study found; research section 3 gives 4+ overlap hours for same-day handoffs [design]', sourced: false, confidence: 'design' },
      englishVerifiedBeforeOfferPct: { label: 'Customer-facing hires whose English was assessed (interview or written) before the offer', unit: '%', source: 'EF English Proficiency Index 2025 shapes the pools [secondary]; tier bands [design]', sourced: false, confidence: 'design' },
      fakeOrJ2HiresReachingPayrollPct: { label: 'Remote hires who are fake candidates or working a second full-time job', unit: '%', source: 'Gartner 2025: 6% admit interview fraud; DOJ/Okta remote IT-worker schemes [secondary, counts conflict]; J2 share from self-selected surveys [unverified]; tier bands [design]', sourced: true, confidence: 'secondary' },
      classificationAndIpGapsPerForeignContractor: { label: 'Classification and IP-assignment gaps per foreign contractor', unit: 'count', source: 'EOR-vendor guidance on control/integration tests and permanent-establishment risk [secondary]; IP practice [design]', sourced: false, confidence: 'design' },
      partTimeRolesOverloadedPct: { label: 'Part-time hires whose role demands more than the contracted hours', unit: '%', source: 'No part-time productivity study found; 60-75% per paid hour is a game assumption [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'cheapest_region', label: 'Hiring customer-facing roles where pay is lowest', looksLike: 'A 70% saving on the offer letter', costs: 'Lower reply, win and CSAT rates from weaker English and no buyer-hours overlap; coordination hours; churn in the book', coaching: 'Put customer-facing roles in buyers\' hours with a professional English level; offshore async work (engineering, support with a runbook).' },
      { id: 'resume_english', label: 'Trusting the resume for English and identity', looksLike: 'A smooth video call', costs: 'A fake candidate, a stand-in or a second-job hire on payroll; code or data leaving; termination and re-hire cost', coaching: 'Camera on, a live ID check, a paid trial, backchannel calls and a background check with identity and employment verification.' },
      { id: 'contractor_staff', label: 'Full-time contractor abroad on a template contract', looksLike: 'No EOR fee', costs: 'Reclassification, back contributions, permanent-establishment questions and an IP gap in diligence', coaching: 'Use an EOR or Contractor of Record for staff-like work; sign a local-law IP assignment before the first task.' },
      { id: 'part_time_full_job', label: 'Part-time hours for a full-time job', looksLike: 'Half the payroll', costs: 'Overwork, attrition, and about two-thirds of the output per paid hour', coaching: 'Use part-time for bookkeeping, design, content and fractional executives; keep on-call support and SDR volume full-time.' },
    ],
    detection: [
      { signal: 'Required overlap on the post, handoff plan for support, and the overlap of the people actually hired', howInGame: 'job.requiredOverlap / allowShift, state.apps.people.global.handoffPlanned, member.overlapHours', gameable: 'no', antiGaming: 'Overlap is computed from the hire\'s real time zone against your core hours' },
      { signal: 'Vetting steps before the offer: camera interview, trial or work sample, references or backchannel, background check', howInGame: 'candidate.interview.camera, assessments, backgroundCheck', gameable: 'no', antiGaming: 'Hidden fraud and J2 flags are caught by these methods only' },
      { signal: 'English read before the offer and the hire\'s true level; contract type and IP hygiene; part-time fit', howInGame: 'candidate.english reads, member.english, member.ipLocal, cor, loadHours', gameable: 'no', antiGaming: 'Reads are noisy and judged against the hidden level' },
    ],
  },

  people_management: {
    label: 'Managing people and contractors (onboarding, feedback, performance, firing)',
    apps: ['people'],
    tiers: {
      stellar: {
        behaviours: [
          '30/60/90 plan with three measurable outcomes before day 1; weekly 1:1 with a fixed agenda; quarterly written feedback',
          'raises performance gaps within two weeks with a dated example and written expectation',
          'contractors on a milestone SOW with acceptance criteria and classification checked; documents before firing and moves fast when it is not working',
        ],
        outcomes: { engagementVsAnnualFeedback: 2.7, attritionVsAverage: [0.5, 0.7], daysToAddressPerformanceGap: [0, 14] },
      },
      good: {
        behaviours: ['one-on-ones and an onboarding doc; feedback at review time', 'waits one or two quarters before addressing performance; hourly contractors with rough scope'],
        outcomes: { engagementVsAnnualFeedback: 1.8, attritionVsAverage: [0.7, 0.9], daysToAddressPerformanceGap: [60, 120] },
      },
      average: {
        behaviours: ['onboarding is "here is the Slack channel"; feedback positive by default', 'performance problems discussed with a manager, not the person; contractors used as employees for months'],
        outcomes: { engagementVsAnnualFeedback: 1, attritionVsAverage: 1, daysToAddressPerformanceGap: [120, 240] },
      },
      mediocre: {
        behaviours: ['no one-on-ones; feedback via a third party', 'problem employee kept a year; contractors misclassified and told they are family; fires without documentation'],
        outcomes: { engagementVsAnnualFeedback: 0.7, attritionVsAverage: [1.5, 2.5], daysToAddressPerformanceGap: [270, 400] },
      },
    },
    metrics: {
      engagementVsAnnualFeedback: { label: 'Engagement likelihood vs annual-only feedback', unit: 'x', source: 'o4 s6: Gallup 2019 via 100hires: weekly feedback 2.7x more likely engaged [unverified, 2019]; Lattice 2021 (vendor): quarterly > semi-annual > annual; other points [design]', sourced: true, confidence: 'secondary' },
      attritionVsAverage: { label: 'Attrition vs average', unit: 'x', source: 'o4 s6 [design]; Lattice 2024: eNPS fell 33.3 to 24.8 (2022 to 2023) [unverified]', sourced: false, confidence: 'design' },
      daysToAddressPerformanceGap: { label: 'Days from noticing a gap to a written conversation', unit: 'days', source: 'o4 s6 behaviours [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'avoid_hard_conversation', label: 'Avoiding the hard conversation for a year', looksLike: 'Kindness', costs: 'Best people leave; the team absorbs the problem', coaching: 'Name the specific example and the change you need by a date.' },
      { id: 'positive_only', label: 'Positive-only feedback', looksLike: 'Good morale', costs: 'First negative review feels like a surprise', coaching: 'Give specific, timely feedback weekly.' },
      { id: 'disguised_employee', label: 'Contractor as a disguised employee', looksLike: 'Flexible staffing', costs: 'Misclassification penalties, back taxes, often triggered at exit', coaching: 'Put the contractor on a milestone SOW.' },
      { id: 'fire_without_notes', label: 'Firing without documentation', looksLike: 'Decisive', costs: 'Disputes are harder', coaching: 'Write what you saw, what you asked, and what changed.' },
    ],
    detection: [
      { signal: '30/60/90 plan and measurable outcomes; 1:1 cadence; written feedback', howInGame: 'Per-member plan and 1:1 log (does not exist today; only fixed management hours)', gameable: 'partly', antiGaming: 'Compare stated feedback with the member simulated engagement and retention' },
      { signal: 'Performance issue raised with a dated example and written expectation', howInGame: 'PIP workflow content and timing vs the monthly performance read', gameable: 'no', antiGaming: 'Time-based' },
      { signal: 'Contractor SOW with acceptance criteria; set hours or a manager as classification risk', howInGame: 'misclassRisk(member)', gameable: 'no', antiGaming: 'Risk factors computed from member state' },
    ],
  },

  people_ops: {
    label: 'People ops: offer negotiation, onboarding, benefits and time off, workplace',
    apps: ['people', 'legal', 'bank', 'calendar'],
    tiers: {
      stellar: {
        behaviours: [
          'posts a good-faith salary range where the law requires one, prices the offer at the market midpoint and answers a counter within a day with a reasoned yes or a menu (cash-heavy vs equity-heavy) instead of a haggle',
          'sets a deadline long enough for a candidate with other offers to compare; never lowballs; checks the offer against the people already doing the same job before sending it',
          'before day one: laptop ordered with lead time, accounts ready, welcome call, a buddy, a measurable 30/60/90 plan, onboarding meetings on the calendar, I-9 done inside three business days; same-day access removal when someone leaves',
          'offers a real employee-only health plan (QSEHRA, ICHRA, small group or PEO sized to headcount), a PTO policy that meets state sick-leave mandates, tracks the accrued liability, approves time off with a handoff, writes runbooks or keeps an on-call contractor for single-person functions',
          'stays remote or in flexible coworking until the team justifies a lease; asks for the office only for roles that truly need it; short terms, no personal guarantee',
        ],
        outcomes: { offerAcceptancePct: [86, 92], paidVsAskPct: [97, 105], earlyExit90Pct: [4, 8], rampWeeksVsRole: 0.8, i9OnTimePct: 100, vacationDaysTakenPerYear: [10, 13], singlePersonGapDays: 0 },
      },
      good: {
        behaviours: [
          'posts ranges, offers near the ask, answers counters in two or three days',
          'orders the laptop and sets up accounts, writes a plan and sets a buddy for most hires; I-9 on time',
          'an employee-only health plan and a PTO policy, some attention to coverage; denies a request now and then with a reason',
          'coworking or remote; a lease only when the team is already big',
        ],
        outcomes: { offerAcceptancePct: [80, 86], paidVsAskPct: [94, 108], earlyExit90Pct: [8, 14], rampWeeksVsRole: 0.9, i9OnTimePct: [90, 100], vacationDaysTakenPerYear: [9, 13], singlePersonGapDays: [0, 2] },
      },
      average: {
        behaviours: [
          'leaves the range out of the post; offers somewhere below the ask and splits the difference when countered; a counter can sit for days',
          'onboarding is "here is the Slack channel": the laptop is bought on the first morning, the plan is written in week three; the I-9 is a day or two late',
          'default benefits, nothing designed; PTO decisions are ad hoc and some requests go unanswered; nobody covers for the only support person',
          'signs the lease because the founder wants an office',
        ],
        outcomes: { offerAcceptancePct: [74, 80], paidVsAskPct: [88, 112], earlyExit90Pct: [22, 28], rampWeeksVsRole: 1.0, i9OnTimePct: [60, 90], vacationDaysTakenPerYear: [7, 12], singlePersonGapDays: [2, 7] },
      },
      mediocre: {
        behaviours: [
          'lowballs to save money or pays whatever it takes to close and tells nobody; sets a 48-hour exploding deadline on a candidate with another offer; ignores counters',
          'no onboarding plan, no I-9, no access removal when someone leaves; a new hire finds out on day one they have no laptop',
          'no health benefit, a PTO policy below the state mandate, repeated vacation denials, a one-person team with no cover',
          'five-year lease with a personal guarantee for a team of three; office-required roles that halve the applicant pool',
        ],
        outcomes: { offerAcceptancePct: [55, 70], paidVsAskPct: [0, 88], earlyExit90Pct: [28, 40], rampWeeksVsRole: 1.25, i9OnTimePct: [0, 50], vacationDaysTakenPerYear: [0, 6], singlePersonGapDays: [7, 20] },
      },
    },
    metrics: {
      offerAcceptancePct: { label: 'Offer acceptance rate', unit: '%', source: 'Ashby ~78% (230K offers, 2021-24), Gem ~82%, SmartRecruiters 79%; business roles ~20 points above technical [secondary]; tier spreads [design]', sourced: true, confidence: 'secondary' },
      paidVsAskPct: { label: 'Base salary paid vs the candidate\'s ask', unit: '%', source: 'Candidates who negotiate gain ~11-20% of comp (Levels.fyi 2024, UCLA Anderson 12.45%) [sourced]; bands for fair vs lowball vs overpay [design]', sourced: false, confidence: 'design' },
      earlyExit90Pct: { label: 'New hires who leave inside 90 days', unit: '%', source: '~28% (Jobvite 2018) to ~33% leave within 90 days without structure [secondary, dated]; Work Institute: 40% of year-one quits happen in 90 days [secondary]; structured onboarding values [design]', sourced: true, confidence: 'secondary' },
      rampWeeksVsRole: { label: 'Ramp time vs the role\'s research ramp', unit: 'x', source: 'DX: engineers with daily AI tools reached their 10th PR in 49 vs 91 days [sourced]; the rest [design]', sourced: false, confidence: 'design' },
      i9OnTimePct: { label: 'Form I-9 Section 2 done within 3 business days', unit: '%', source: 'Employer completes Section 2 within three business days of the start [secondary, USCIS M-274 not opened]; bands [design]', sourced: false, confidence: 'design' },
      vacationDaysTakenPerYear: { label: 'Vacation days taken per employee per year', unit: 'days', source: 'Namely 2018/2022: ~12 (unlimited) vs ~11-15 (limited) [secondary]; BLS: small firms ~10 days after a year [secondary]; bands [design]', sourced: true, confidence: 'secondary' },
      singlePersonGapDays: { label: 'Working days a one-person function was uncovered', unit: 'days', source: 'Game mechanic: each absence day adds a day of backlog [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'lowball_offer', label: 'Lowballing a candidate who said yes', looksLike: 'A bargain hire', costs: 'Higher quits for 12-18 months, a morale drag, and a replacement that costs two months of pay plus another ramp', coaching: 'Offer the market midpoint and let the candidate counter; a hire at 85% of their ask is a resignation you have scheduled.' },
      { id: 'exploding_offer', label: 'An exploding offer or a counter left unanswered', looksLike: 'Pressure that closes', costs: 'The candidate with other offers takes one; the search restarts (3-4 weeks); counters expire in about a week', coaching: 'Give two weeks when they hold another offer, answer a counter within a day, and trade on terms (equity, sign-on, start date) before you trade on base.' },
      { id: 'overpay_new_hire', label: 'Paying a new hire far above the team', looksLike: 'Winning the candidate', costs: 'Teammates find out, morale falls, quits rise, and parity raises cost the difference every year', coaching: 'Check the offer against everyone doing the same job at the same level before sending it; use equity or a sign-on, not base, to close a gap.' },
      { id: 'no_range', label: 'Posting without a salary range', looksLike: 'Keeping options open', costs: 'Complaints and fines where ranges are required (CO, CA, NY, WA, the EU directive), weaker applicant quality', coaching: 'Put a good-faith range in every posting; many multistate startups use the strictest rule everywhere.' },
      { id: 'here_is_slack', label: '"Here is the Slack channel" onboarding', looksLike: 'Trusting a self-starter', costs: 'About a quarter of new hires leave inside 90 days, ramp runs 25% long, an I-9 gets missed, and a laptop is bought on day one at retail', coaching: 'Order the laptop and provision accounts a week ahead, call them before day one, name a buddy, put the meetings on the calendar and write the 30/60/90 plan; do the I-9 inside three business days.' },
      { id: 'access_left_on', label: 'Leaving an ex-employee\'s access on', looksLike: 'Nobody is worried', costs: 'A leaked repo, a deleted database, a credential used after the exit: tens of thousands to clean up', coaching: 'Revoke SSO, GitHub, cloud, password manager, Stripe and email the day someone leaves, with a written checklist.' },
      { id: 'no_health_plan', label: 'No health benefit', looksLike: 'Saving $700 a month a head', costs: 'Candidates with families decline, offers get harder to close, and quits rise', coaching: 'A QSEHRA or ICHRA costs a few hundred dollars a head and works under 50 staff; a PEO or small-group plan pays 80-90% of the employee-only premium.' },
      { id: 'deny_and_hope', label: 'Denying time off and having no cover', looksLike: 'Protecting the deadline', costs: 'Morale and quits, then a burnout leave that takes more days than the vacation would have; the only support person out means a growing queue', coaching: 'Approve with a handoff or offer other dates; write runbooks and keep an on-call contractor for functions with one person.' },
      { id: 'lease_before_team', label: 'A long lease before the team exists', looksLike: 'A real company', costs: 'Fixed rent for 3-5 years, a personal guarantee that follows you, a sunk build-out, and sublets at a loss; office-required roles cut the applicant pool to a quarter', coaching: 'Stay remote or on a month-to-month coworking desk until the team is around eight people and the runway is long; never guarantee a lease personally if a bigger deposit will do.' },
    ],
    detection: [
      { signal: 'Offer against the candidate\'s ask, counters answered, deadlines, pay-equity against peers, salary range in the post', howInGame: 'member.ops.askRatio and .overpaid, c.negotiation history, offer.deadlineDays, job pay range vs state law', gameable: 'no', antiGaming: 'Ratios are computed from the hidden ask; equity is compared with real peers' },
      { signal: 'Onboarding checklist complete before day one, I-9 timing, plan score, access removal at exit', howInGame: 'member.onboarding items and dates, state.apps.people.ops.offboard', gameable: 'no', antiGaming: 'Dates are compared with the start day; exits are matched to revoke actions' },
      { signal: 'Package score, state sick-leave compliance, denied requests, cover for single-person roles', howInGame: 'ops.benefits, member.abs.denied, absence records, ops.coverage', gameable: 'partly', antiGaming: 'Denials and gaps are recorded as they happen over months' },
      { signal: 'Workplace mode against headcount; lease term and guarantee; office-required roles', howInGame: 'ops.workplace, headcount, job.workMode', gameable: 'no', antiGaming: 'Compared with live headcount and runway' },
    ],
  },

  // ======================================================================================================
  // O5: FUNDRAISING, OPS AND FOUNDER
  // ======================================================================================================

  fundraising: {
    label: 'Fundraising (targeting, warm intros, deck, pitch meetings, process, negotiation)',
    apps: ['fundraising', 'financing', 'cofounder', 'messages'],
    tiers: {
      stellar: {
        behaviours: [
          '40-60 investor target list segmented by stage, check size and comparable deals; warm intro with a forwardable note for most first meetings',
          'deck after a first call or with a one-line ask; parallel meetings in a tight window; tracks stage per investor; sets a close date',
          'asks "what would make you lead?"; negotiates cap/pro-rata/MFN; runs a competitive process for 4-6 weeks',
        ],
        outcomes: { warmIntroSharePct: [70, 90], monthsToClose: [1, 2], competingTermSheets: [2, 3], runwayAtStartMonths: [9, 14] },
      },
      good: {
        behaviours: ['30-40 meetings, mostly warm; deck with traction and use of funds; follows up in 48h', 'spreadsheet tracking with slipping timeline; accepts lead terms with light pushback'],
        outcomes: { warmIntroSharePct: [55, 70], monthsToClose: [2, 3], competingTermSheets: [1, 2], runwayAtStartMonths: [7, 9] },
      },
      average: {
        behaviours: ['cold emails many VCs, full deck to everyone', 'pitches the product not the metric trajectory; sequential meetings over months; accepts the first offer'],
        outcomes: { warmIntroSharePct: [20, 40], monthsToClose: [4, 6], competingTermSheets: [0, 1], runwayAtStartMonths: [4, 7] },
      },
      mediocre: {
        behaviours: ['pitches anyone including non-investors and wrong-check-size funds', '25-slide deck with no metrics; "what do you think?" with no next step; no record of no and why; lets one investor set the pace'],
        outcomes: { warmIntroSharePct: [0, 15], monthsToClose: [6, 12], competingTermSheets: 0, runwayAtStartMonths: [0, 5] },
      },
    },
    metrics: {
      warmIntroSharePct: { label: 'Share of first meetings from warm intros', unit: '%', source: 'o5 s1: PitchBook H1 2025 reportedly 68% of seed deals, up from 55% (via Metal, secondary [unverified])', sourced: true, confidence: 'secondary' },
      monthsToClose: { label: 'Months to close a seed round', unit: 'months', source: 'o5 s1: sources conflict (Carta 56 vs 142 days); range 2-5 months is [design]', sourced: false, confidence: 'design' },
      competingTermSheets: { label: 'Competing term sheets', unit: 'count', source: 'o5 s1 [design]', sourced: false, confidence: 'design' },
      runwayAtStartMonths: { label: 'Runway when the raise starts', unit: 'months', source: 'o4 s1 [design] (no source); lower runway = lost leverage', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'meeting_count', label: 'Confusing meeting count with progress', looksLike: '40 first meetings', costs: 'No second meetings = a bad funnel; stale raise', coaching: 'Pick 40, get intros, and ask each investor what would make them lead.' },
      { id: 'deck_before_call', label: 'Sending the deck before a conversation', looksLike: 'Efficient', costs: 'Turns the investor into a reader', coaching: 'Always end the first meeting with a specific ask.' },
      { id: 'series_not_parallel', label: 'Letting one soft yes stop the process', looksLike: 'Momentum', costs: 'Running in series adds months', coaching: 'Run parallel meetings in a tight window.' },
      { id: 'first_term_sheet', label: 'Accepting terms before a second term sheet exists', looksLike: 'Closing', costs: 'Worse cap and terms', coaching: 'Run the process for 4-6 weeks so you have a choice.' },
    ],
    detection: [
      { signal: 'Warm-intro language and forwardable intro requests; closing question at the end of a pitch', howInGame: 'Outreach channel flag (warm/cold) and intro blurb quality; pitch transcript', gameable: 'partly', antiGaming: 'Warm path must exist in the player real network' },
      { signal: 'Timeline with dates per investor; follow-up cadence', howInGame: 'Investor CRM timestamps', gameable: 'no', antiGaming: 'Consistency over weeks' },
      { signal: 'Competing leads before accepting', howInGame: 'competingCount at acceptTerms', gameable: 'no', antiGaming: 'Price responds to actual competing leads' },
    ],
  },

  investor_relations: {
    label: 'Investor updates and relations',
    apps: ['fundraising', 'mail'],
    tiers: {
      stellar: {
        behaviours: [
          'monthly update on a fixed day: headline paragraph, 3-5 metrics with trend, a named lowlight with the response, a specific ask',
          'stable metric definitions; follows up privately on asks; gives bad news within 24 hours',
        ],
        outcomes: { updatesPerYear: 12, lowlightIncludedPct: 100, insiderIntroOrReplyPerUpdate: 0.33 },
      },
      good: {
        behaviours: ['monthly with metrics and highlights; vague lowlights ("some churn"); generic asks'],
        outcomes: { updatesPerYear: [10, 12], lowlightIncludedPct: 50, insiderIntroOrReplyPerUpdate: 0.15 },
      },
      average: {
        behaviours: ['quarterly or irregular; mostly highlights; metric dump; no specific asks'],
        outcomes: { updatesPerYear: [3, 5], lowlightIncludedPct: 10, insiderIntroOrReplyPerUpdate: 0.05 },
      },
      mediocre: {
        behaviours: ['silent until something goes wrong, or weekly wins with no numbers', 'surprises investors with bad news; update emails that ask for money with no context'],
        outcomes: { updatesPerYear: [0, 2], lowlightIncludedPct: 0, insiderIntroOrReplyPerUpdate: 0 },
      },
    },
    metrics: {
      updatesPerYear: { label: 'Investor updates per year', unit: 'count', source: 'o5 s2: Visible (vendor, 3.5M+ updates): monthly 65% of structured sends, quarterly 22%, weekly 13%; page contradicts itself in places, directional only', sourced: true, confidence: 'secondary' },
      lowlightIncludedPct: { label: 'Updates containing a named lowlight', unit: '%', source: 'o5 s2: Visible: lowlights block used in only 10% of updates, highlights in 23% [vendor]', sourced: true, confidence: 'secondary' },
      insiderIntroOrReplyPerUpdate: { label: 'Replies or intros per update', unit: 'rate', source: 'o5 s2 [design]: "1 in 3 updates is a plausible target"', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'all_highlights', label: 'All-highlights updates', looksLike: 'Positivity', costs: 'Investors find out later; trust drops more than the bad number would have', coaching: 'Add the lowlight and what you did about it.' },
      { id: 'broad_ask', label: 'Asks too broad to act on ("any intros")', looksLike: 'Asking', costs: 'No intros', coaching: 'Ask for two intros to CFOs at $10M ARR SaaS companies.' },
      { id: 'metric_redefinition', label: 'Quietly changing metric definitions', looksLike: 'Better numbers', costs: 'Credibility loss at the raise', coaching: 'Keep definitions stable and flag changes.' },
      { id: 'wait_for_next_update', label: 'Waiting for the next update to share urgent news', looksLike: 'Tidy cadence', costs: 'Surprise bad news at the raise', coaching: 'Same-day email for same-day news.' },
    ],
    detection: [
      { signal: 'Headline, metrics, a named lowlight with an explanation', howInGame: 'heuristicUpdate / panel judge (candor, clarity, asks specificity, accuracy)', gameable: 'partly', antiGaming: 'Metrics checked against ledger truth (accuracy)' },
      { signal: 'Cadence on the same day each month; consistent definitions', howInGame: 'Update dates across the timeline', gameable: 'no', antiGaming: 'A good single update does not make a cadence' },
      { signal: 'Specific ask with a name or segment', howInGame: 'Asks parsed to fulfillable network leads', gameable: 'partly', antiGaming: 'Fulfilled asks create real leads only if specific' },
    ],
  },

  partnerships_channels: {
    label: 'Partnerships, integrations and channel sales',
    apps: ['channels', 'market', 'organic'],
    tiers: {
      stellar: {
        behaviours: [
          '1-2 partner types with a clear reason (integration with an ICP tool or an agency serving the ICP)',
          'builds to the partner listing standards; partner sales on a shared pipeline target with a review date',
          'tracks partner-sourced vs influenced separately; kills partners with no pipeline after 90 days',
        ],
        outcomes: { partnerSourcedRevenueSharePct: [15, 30], activePartners: [1, 2], referralsPerPartnerPerQuarter: 3 },
      },
      good: {
        behaviours: ['lists on a marketplace or launches an integration; affiliate programme', 'tracks installs, not revenue'],
        outcomes: { partnerSourcedRevenueSharePct: [5, 15], activePartners: [2, 4], referralsPerPartnerPerQuarter: 1 },
      },
      average: {
        behaviours: ['many MOUs that never generate pipeline; lists on every marketplace', 'no partner owner'],
        outcomes: { partnerSourcedRevenueSharePct: [0, 5], activePartners: [5, 12], referralsPerPartnerPerQuarter: 0.2 },
      },
      mediocre: {
        behaviours: ['says yes to every request; free licences with no shared goal', 'counts logos as success; builds an integration nobody uses; gives away rev share before sourcing'],
        outcomes: { partnerSourcedRevenueSharePct: 0, activePartners: [8, 20], referralsPerPartnerPerQuarter: 0 },
      },
    },
    metrics: {
      partnerSourcedRevenueSharePct: { label: 'Share of new revenue from partners', unit: '%', source: 'o5 s3: glossary (Reditus, undated): young programmes single digit, mature channel-led 20-30% [unverified]; ICONIQ 60-80% is pipeline not closed ARR; the Crossbeam 41% figure is dated 2027 and must not be used', sourced: true, confidence: 'secondary' },
      activePartners: { label: 'Partners with live referrals', unit: 'count', source: 'o5 s3 behaviours [design]', sourced: false, confidence: 'design' },
      referralsPerPartnerPerQuarter: { label: 'Referrals per partner per quarter', unit: 'count', source: 'o5 s3 feedback example ("three introductions this quarter") [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'logo_collecting', label: 'Logo collecting', looksLike: '12 partnerships announced', costs: 'Zero referrals; time and rev-share terms spent', coaching: 'Pick two partners whose customers are your ICP and ask for three introductions.' },
      { id: 'wrong_icp_integration', label: 'Integration built for the wrong ICP', looksLike: 'Shipped integration', costs: 'Near-zero usage; maintenance cost', coaching: 'Find out what the users of that tool are trying to do first.' },
      { id: 'influenced_revenue', label: 'Counting "influenced" revenue', looksLike: 'Bigger channel numbers', costs: 'Misallocated effort', coaching: 'Track sourced and influenced separately.' },
      { id: 'early_rev_share', label: 'Revenue share before the partner has sourced anything', looksLike: 'Incentive', costs: 'Margin given away', coaching: 'Pay on closed sourced revenue only.' },
    ],
    detection: [
      { signal: 'Partner plans with a shared pipeline target and review date', howInGame: 'Partner records in Channels', gameable: 'partly', antiGaming: 'Partner behaviour (referrals per month) is not in the player control' },
      { signal: 'Asks the partner what its customers need before co-marketing', howInGame: 'Pitch text judged for partner-specific content', gameable: 'partly', antiGaming: 'Generic pitches judged generic' },
    ],
  },

  founder_time: {
    label: 'Founder time management, prioritisation, calendar and inbox',
    apps: ['calendar', 'mail', 'messages', 'you', 'home'],
    tiers: {
      stellar: {
        behaviours: [
          'blocks maker time in half-day chunks; weekly planning with three outcomes; Friday calendar vs goals review',
          'declines most meetings with a short template; meetings at 25 minutes; "not to do" list; delegates one founder-only task a week',
        ],
        outcomes: { protectedMakerHoursPerWeek: [15, 20], meetingsDeclinedSharePct: [50, 70], fragmentedDaysPerWeek: [0, 1] },
      },
      good: {
        behaviours: ['some blocked time but meetings creep in', 'writes weekly priorities but does not check them'],
        outcomes: { protectedMakerHoursPerWeek: [8, 14], meetingsDeclinedSharePct: [25, 45], fragmentedDaysPerWeek: [1, 2] },
      },
      average: {
        behaviours: ['reactive calendar; accepts most invites', 'priority is whatever the inbox pushes'],
        outcomes: { protectedMakerHoursPerWeek: [5, 8], meetingsDeclinedSharePct: [5, 20], fragmentedDaysPerWeek: [2, 3] },
      },
      mediocre: {
        behaviours: ['no calendar or entirely meetings; answers every message same day', 'accepts every intro call as a favour; treats busy as progress'],
        outcomes: { protectedMakerHoursPerWeek: [0, 3], meetingsDeclinedSharePct: [0, 5], fragmentedDaysPerWeek: [4, 5] },
      },
    },
    metrics: {
      protectedMakerHoursPerWeek: { label: 'Protected maker time per week', unit: 'hours', source: 'o5 s4 [design]: Graham 2009 "Maker schedule, manager schedule" is qualitative; SavvyCal 2021 tweet poll (OpenView) unusable as a benchmark', sourced: false, confidence: 'design' },
      meetingsDeclinedSharePct: { label: 'Inbound requests declined', unit: '%', source: 'o5 s4 [design]', sourced: false, confidence: 'design' },
      fragmentedDaysPerWeek: { label: 'Days with 3+ meetings and no focus block', unit: 'count', source: 'core/calendar.js CONTEXT_SWITCH [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'busy_work', label: 'Hiding behind inbox/Slack/admin', looksLike: 'Busy', costs: 'The week that should be sales or product is lost', coaching: 'Your Monday plan has nine items. Pick the top three.' },
      { id: 'every_intro_call', label: 'Accepting every intro call as a favour', looksLike: 'Networking', costs: 'Calendar drain for little return', coaching: 'Keep the one that moves a deal or a hire and send a 3-line decline to the rest.' },
      { id: 'bad_batching', label: 'Batching meetings badly', looksLike: 'Efficiency', costs: 'Every afternoon broken', coaching: 'Stack meetings; protect half-days.' },
      { id: 'same_review', label: 'Weekly review that changes nothing', looksLike: 'Process', costs: 'No behaviour change', coaching: 'End each review with one thing you will stop.' },
    ],
    detection: [
      { signal: 'Time allocation against stated priorities; sequence of actions over weeks', howInGame: 'founder.timeLog by label vs the stated weekly outcomes', gameable: 'no', antiGaming: 'Hard to fake for many turns' },
      { signal: 'Frequency of declines and explicit deferrals', howInGame: 'Inbound decline vs engage decisions and their resolved outcomes', gameable: 'no', antiGaming: 'Outcome of engaged waste/scam vs declined valuable' },
      { signal: 'Focus blocks that are actually used for deep work', howInGame: 'Output per focus hour (does not exist today)', gameable: 'partly', antiGaming: 'Blocks must be followed by the matching work' },
    ],
  },

  automation_ai: {
    label: 'Automation and AI-tool leverage',
    apps: ['people', 'outreach', 'helpdesk', 'product'],
    tiers: {
      stellar: {
        behaviours: [
          'automates repetitive rules-based work (CRM hygiene, notes, data pulls, first drafts) and keeps a human on customer, investor and hiring touchpoints',
          'measures whether automation saves time without lowering quality; reviews AI output before sending; retires tools that did not earn their cost',
        ],
        outcomes: { founderHoursSavedPerWeek: [5, 10], customerFacingQualityIncidentsPerQuarter: 0, unusedToolsPaidFor: 0 },
      },
      good: {
        behaviours: ['AI for drafts and summaries', 'some automation set up but not measured'],
        outcomes: { founderHoursSavedPerWeek: [3, 6], customerFacingQualityIncidentsPerQuarter: [0, 0.5], unusedToolsPaidFor: [0, 1] },
      },
      average: {
        behaviours: ['buys many AI tools, uses few', 'automates before understanding the workflow'],
        outcomes: { founderHoursSavedPerWeek: [1, 4], customerFacingQualityIncidentsPerQuarter: [0.5, 1], unusedToolsPaidFor: [2, 4] },
      },
      mediocre: {
        behaviours: ['automates customer-facing work first (support bot, cold email at scale, auto-replies to investors)', 'sends AI output unreviewed; does not measure quality'],
        outcomes: { founderHoursSavedPerWeek: [3, 8], customerFacingQualityIncidentsPerQuarter: [1, 3], unusedToolsPaidFor: [4, 8] },
      },
    },
    metrics: {
      founderHoursSavedPerWeek: { label: 'Founder hours saved per week (on paper)', unit: 'hours', source: 'o5 s5 [design]', sourced: false, confidence: 'design' },
      customerFacingQualityIncidentsPerQuarter: { label: 'Customers or deals lost to unreviewed output per quarter', unit: 'count', source: 'o5 s5 [design]: "loses one customer or deal per quarter". Klarna 2025 reversal (Entrepreneur, date approximate); Gartner 25 Jun 2025: over 40% of agentic AI projects cancelled by end of 2027 (Jan 2025 webinar poll n=3,412, weak evidence)', sourced: false, confidence: 'design' },
      unusedToolsPaidFor: { label: 'Paid AI tools not used', unit: 'count', source: 'o5 s5 feedback example [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'ai_cold_email_scale', label: 'Cold email at scale with AI copy', looksLike: 'Productive', costs: 'Lowers reply rates and burns the domain', coaching: 'Automate the data pull, write the first line yourself.' },
      { id: 'replace_human_loop', label: 'Replacing the human in the investor or customer loop', looksLike: 'Leverage', costs: 'Investors ask if you are OK; customers escalate', coaching: 'You automated the investor update. Write it yourself and automate the data pull.' },
      { id: 'tool_stacking', label: 'Stacking tools with overlapping features', looksLike: 'Capability', costs: 'Subscription burn; no owner', coaching: 'You have six AI tools and use two. Cancel four.' },
    ],
    detection: [
      { signal: 'Generic phrasing or the same template across many outbound messages', howInGame: 'Per-recipient diff on AI SDR and outreach sends', gameable: 'no', antiGaming: 'Computed from sent messages' },
      { signal: 'Player describes a review step; errors caught', howInGame: 'Review toggles on AI SDR/support agent; hallucination flags and caught-error counts', gameable: 'partly', antiGaming: 'The simulator injects occasional errors that only a reviewer catches' },
    ],
  },

  founder_sustainability: {
    label: 'Personal sustainability and decision quality (pivots, persistence vs quitting)',
    apps: ['you', 'outcomes', 'home', 'financing'],
    tiers: {
      stellar: {
        behaviours: [
          'sets explicit kill criteria before starting a bet ("if MRR under $X by month 9, pivot or stop") and reviews them on schedule',
          'takes time off, sleeps, has an outside support system; asks for outside opinions before big decisions; pivots from evidence not mood',
        ],
        outcomes: { killCriteriaSetBeforeBet: 1, daysPastCriteriaBeforeDecision: [0, 14], weeksAbove60HoursPerQuarter: [0, 2] },
      },
      good: {
        behaviours: ['has criteria but reviews them late', 'takes some breaks'],
        outcomes: { killCriteriaSetBeforeBet: 1, daysPastCriteriaBeforeDecision: [30, 90], weeksAbove60HoursPerQuarter: [2, 5] },
      },
      average: {
        behaviours: ['persists or pivots on the last bad week', 'works every day with no recovery'],
        outcomes: { killCriteriaSetBeforeBet: 0, daysPastCriteriaBeforeDecision: [90, 240], weeksAbove60HoursPerQuarter: [5, 9] },
      },
      mediocre: {
        behaviours: ['never sets criteria; quits after one bad month or continues for years unchanged', 'ignores burnout signs until health or relationships break; sunk-cost reasoning'],
        outcomes: { killCriteriaSetBeforeBet: 0, daysPastCriteriaBeforeDecision: [365, 1000], weeksAbove60HoursPerQuarter: [9, 13] },
      },
    },
    metrics: {
      killCriteriaSetBeforeBet: { label: 'Kill criteria written before the bet (1 = yes)', unit: 'flag', source: 'o5 s6 [design]', sourced: false, confidence: 'design' },
      daysPastCriteriaBeforeDecision: { label: 'Days between a missed criterion and a persist/stop decision', unit: 'days', source: 'o5 s6 [design]', sourced: false, confidence: 'design' },
      weeksAbove60HoursPerQuarter: { label: 'Weeks above 60 hours per quarter', unit: 'weeks', source: 'o5 s6 [design]; burnout prevalence is sourced: Sifted Feb 2025, 54% of 138 founders reported burnout in 12 months, 75% anxiety; CB Insights post-mortems: no market need 42%, ran out of cash 29% (secondary, counts differ across sources [unverified])', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'persistence_as_inaction', label: 'Persistence confused with inaction', looksLike: 'Grit', costs: 'Six months with no change; walking dead', coaching: 'Either hit the criterion or stop, and pick a date now.' },
      { id: 'pivot_every_90', label: 'Pivoting every 90 days', looksLike: 'Agility', costs: 'No customer ever sees a product twice; rebuilds', coaching: 'Stay with one hypothesis until you have 20 customer conversations.' },
      { id: 'pivot_without_evidence', label: 'Pivoting on a hunch', looksLike: 'Decisiveness', costs: 'The new direction rests on the same untested guesses; rebuilt twice', coaching: 'Have about 15 real customer conversations on the problem before changing direction.' },
      { id: 'thrash_pivoting', label: 'Three or more pivots in six months', looksLike: 'Agility', costs: 'Learning, goodwill and runway reset each time; nothing is ever tested long enough to read', coaching: 'Give a direction 4-8 weeks and a written kill criterion before the next pivot.' },
      { id: 'ignore_health', label: 'Ignoring health signals', looksLike: 'Dedication', costs: 'Decisions degrade; energy below 30 slows output', coaching: 'Take two days off before the next pivot call.' },
      { id: 'sunk_cost', label: 'Sunk-cost reasoning', looksLike: 'Loyalty to the work', costs: 'Burn continues past the point of evidence', coaching: 'Decide from the metrics, not from the time already spent.' },
    ],
    detection: [
      { signal: 'Explicit thresholds and dates vs "we will see"; later check of criteria against metrics', howInGame: 'A stored kill-criteria record (does not exist today) compared with MRR and runway', gameable: 'no', antiGaming: 'Criteria are checked against later metrics' },
      { signal: 'Pivot frequency against evidence cited', howInGame: 'ICP / plan / product changes vs logged interviews', gameable: 'no', antiGaming: 'Evidence must be real logged data' },
      { signal: 'Rest signals across turns (time off, weekends)', howInGame: 'founder.hoursPerWeek, energy, personal events', gameable: 'no', antiGaming: 'Behaviour over months' },
    ],
  },

  // ======================================================================================================
  // PLG, TRANSACTIONAL EMAIL AND OWNED AUDIENCE (docs/research/plg-email/p1, p2, p3)
  // ======================================================================================================

  rfp_bids: {
    label: 'Formal RFPs and bids (go/no-go, Q&A, compliance matrix, evaluation, BAFO, debrief)',
    apps: ['crm', 'legal', 'success'],
    tiers: {
      stellar: {
        behaviours: [
          'builds the relationship before the RFP is issued and calls the buyer to ask whether it is a formality; no-bids wired, poor-fit or uncertified bids and bids on a few',
          'submits specific written questions (budget, evaluation weights, one numbered requirement, the incumbent) before the question deadline, reads and signs every addendum',
          'answers the compliance matrix honestly (comply only on what is live, roadmap only when it is planned), runs the one-hour compliance check and submits a day early',
          'writes a buyer-specific executive summary, lists paying references in their segment, and keeps a content library that cuts hours on every later bid',
          'prepares the scripted demo around their scenarios, trades term for price in the BAFO and never offers below cost; always requests the debrief and changes the next response',
        ],
        outcomes: { winRateOnBidsTakenPct: [55, 75], bidsTakenOfOpenedPct: [25, 45], disqualificationRatePct: [0, 2], hoursPerBid: [18, 35], debriefRequestRatePct: [95, 100] },
      },
      good: {
        behaviours: [
          'checks fit and certifications before bidding and skips the obvious mismatches; occasionally misses that an RFP was wired',
          'asks a couple of questions, signs addenda, completes every form, answers the matrix honestly',
          'bids at the buyer\'s budget; sends a BAFO with a modest cut and stays above cost',
          'requests most debriefs',
        ],
        outcomes: { winRateOnBidsTakenPct: [42, 55], bidsTakenOfOpenedPct: [40, 60], disqualificationRatePct: [2, 4], hoursPerBid: [28, 45], debriefRequestRatePct: [70, 90] },
      },
      average: {
        behaviours: [
          'bids on most RFPs that arrive; checks only the headline requirements',
          'answers "comply" on a few items that are "nearly done"; one form or addendum slips on some bids',
          'generic questions ("can you extend the deadline?") or none; writes the summary from a previous bid with the name swapped',
          'asks for a debrief only after an upsetting loss',
        ],
        outcomes: { winRateOnBidsTakenPct: [28, 40], bidsTakenOfOpenedPct: [60, 85], disqualificationRatePct: [5, 10], hoursPerBid: [35, 65], debriefRequestRatePct: [20, 50] },
      },
      mediocre: {
        behaviours: [
          'bids on everything, including RFPs wired for an incumbent and ones needing certifications they lack, and burns 20-40+ hours on each',
          'claims "comply" on features that are not built to raise the score; claims a certification they do not hold',
          'misses an addendum or a form, uploads on the last day, exceeds the page limit',
          'drops price below cost in the BAFO to "win"; boilerplate summary; never requests a debrief and loses the same way again',
        ],
        outcomes: { winRateOnBidsTakenPct: [5, 22], bidsTakenOfOpenedPct: [90, 100], disqualificationRatePct: [12, 25], hoursPerBid: [30, 80], debriefRequestRatePct: [0, 10] },
      },
    },
    metrics: {
      winRateOnBidsTakenPct: { label: 'Win rate on bids actually submitted', unit: '%', source: 'research/rfp/enterprise.md §2: Loopio 2025 average ~45% (secondary, unverified); a state-government team claims 25% -> 80%+ after bidding on fewer RFPs (vendor claim, public-sector.md §4); the 55-75% stellar band and 5-22% mediocre band are [design]', sourced: false, confidence: 'secondary' },
      bidsTakenOfOpenedPct: { label: 'Share of RFPs that arrive which get a bid decision of "bid"', unit: '%', source: 'research/rfp/enterprise.md §2: 72-83% of teams run go/no-go; top teams use it more [unverified]; the bands are [design]', sourced: false, confidence: 'design' },
      disqualificationRatePct: { label: 'Responses disqualified or rejected unread', unit: '%', source: 'research/rfp/public-sector.md §3: Euna analysis of 6,000+ public RFPs, ~15% disqualified in 2014 falling to ~4% by 2018 (dated; trend)', sourced: true, confidence: 'secondary' },
      hoursPerBid: { label: 'Founder hours per submitted bid', unit: 'hours', source: 'research/rfp/enterprise.md §2: ~25-33 h writing effort per RFP for a team (secondary); public-sector.md §7: 20-60 h small SaaS standard RFP [design]; library and SOC 2 cut security work from 20-40 h to 1-8 h (Success model)', sourced: false, confidence: 'design' },
      debriefRequestRatePct: { label: 'Share of lost bids with a debrief requested in time', unit: '%', source: 'research/rfp/public-sector.md §6: FAR 15.505 requires the request within 3 days; enterprise.md §5: ask within 48-72 hours. The rates are [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'bid_everything', label: 'Bidding on every RFP', looksLike: 'More shots on goal', costs: '20-60 founder hours per bid on RFPs that were wired or never winnable, lost deals and a burned buyer list', coaching: 'Run the go/no-go checklist: relationship before issue, fit to mandatory items, budget against your price, certifications you lack, and capacity. Call the buyer and ask whether it is a formality.' },
      { id: 'comply_on_roadmap', label: '"Comply" on features that are not built', looksLike: 'A higher compliance score', costs: 'Service credits, rework hours, a buyer that terminates at kickoff and in some cases a misrepresentation claim; a false certification claim is disqualified outright', coaching: 'Answer comply only on what is live today; use roadmap only for work that is planned and dated; say no when the product cannot do it.' },
      { id: 'last_day_submission', label: 'Missing forms, addenda or the cutoff', looksLike: 'Saving time on paperwork', costs: 'The response is rejected unread and every hour spent is lost', coaching: 'Run the one-hour compliance check, sign every addendum and submit a day early with a 4:30 pm buffer.' },
      { id: 'boilerplate_summary', label: 'Boilerplate executive summary', looksLike: 'Reusing a good answer', costs: 'Lower technical and experience scores and a response evaluators remember as generic', coaching: 'Name the buyer, echo their stated problem, give numbers and an implementation timeline.' },
      { id: 'bafo_below_cost', label: 'Cutting the BAFO below cost', looksLike: 'Winning on price', costs: 'A contract that loses money every year, locked in for the term', coaching: 'Know your cost floor. Trade multi-year term, prepayment or scope for price instead of cutting.' },
      { id: 'no_debrief', label: 'Never asking for the debrief', looksLike: 'Moving on', costs: 'The next response repeats the same mistake and loses the same way', coaching: 'Request the debrief in writing within three days, keep the attendee list small and ask about your scores against the stated criteria.' },
    ],
    detection: [
      { signal: 'Go/no-go decisions against the hidden truth (wired flag, fit to mandatory items, certifications, price against the buyer\'s budget)', howInGame: 'CRM -> Bids: each decision is reconciled with the bid\'s hidden state when the evaluation lands', gameable: 'no', antiGaming: 'Wired and fit flags are hidden; only investigating the buyer or a good Q&A question reveals them' },
      { signal: 'Compliance matrix honesty: answers against shipped, planned and absent features', howInGame: 'Matrix answers compared with Product feature status at submission and again at kickoff', gameable: 'no', antiGaming: 'Truth comes from the Product app and Legal; overclaims are billed later' },
      { signal: 'Disqualifications, late submissions, missing forms and addenda', howInGame: 'Screening of the submitted response', gameable: 'no', antiGaming: 'The screen reads the actual response, not a self-reported checklist' },
      { signal: 'Debrief requests inside the window and repeated causes of loss', howInGame: 'Debrief window per lost bid; repeats flagged as going in circles', gameable: 'no', antiGaming: 'Time-based window' },
    ],
  },

  plg: {
    label: 'Product-led growth (limits, PQLs, loops, content)',
    apps: ['plg', 'insights', 'product', 'crm'],
    tiers: {
      stellar: {
        behaviours: [
          'finds the activation event first, instruments it, then adds one lever at a time',
          'limit sits where active users hit it in weeks 2-4 on a value metric; prompts follow a success moment, warn at 75% and 100%, never block export; measures lift with a 10-20% holdout',
          'PQL rule built from activation data and checked against which accounts closed; same-day useful first touch with account context',
          'pages carry data nobody else has and are pruned when they get no impressions; staged access is released in qualified cohorts that are debriefed',
        ],
        outcomes: { promptConversionLiftPct: [15, 25], pqlCloseRatePct: [15, 25], viralKShareOfTypeCeilingPct: [70, 100] },
      },
      good: {
        behaviours: ['limit prompt with a clear unlock list, two copy variants tested', 'PQL rule from activation data, 1-2 day follow-up', 'invite at a collaboration moment, measured weekly'],
        outcomes: { promptConversionLiftPct: [8, 14], pqlCloseRatePct: [10, 15], viralKShareOfTypeCeilingPct: [45, 70] },
      },
      average: {
        behaviours: ['prompts on every login; limit blocks the whole product', 'every company-domain signup goes to sales', '"invite friends" button in settings', '2,000 near-duplicate pages with swapped city names'],
        outcomes: { promptConversionLiftPct: [0, 6], pqlCloseRatePct: [5, 8], viralKShareOfTypeCeilingPct: [15, 35] },
      },
      mediocre: {
        behaviours: ['countdown timers and stacked promos on the out-of-credits screen; blocks export at the limit', 'emails every free user within an hour; auto-invites from imported contacts', 'asks for referrals during a failed action', 'opens signup to everyone and lets support and onboarding absorb it, or never releases the waitlist'],
        outcomes: { promptConversionLiftPct: [-12, 0], pqlCloseRatePct: [2, 5], viralKShareOfTypeCeilingPct: [0, 15] },
      },
    },
    metrics: {
      promptConversionLiftPct: { label: 'Relative lift in upgrade conversion from the limit prompts', unit: '%', source: 'p1 §2: no independent lift figure exists; 10-25% good vs average is [design]', sourced: false, confidence: 'design' },
      pqlCloseRatePct: { label: 'PQL-to-close rate', unit: '%', source: 'p1 §3: PQL-driven conversion ~25% (30-39% at $1-5k ACV) [vendor, ProductLed via Userpilot]; 5-8% vs 15-25% by rule quality [design]', sourced: false, confidence: 'secondary' },
      viralKShareOfTypeCeilingPct: { label: 'Viral K as a share of the product type ceiling', unit: '%', source: 'p1 §4: typical SaaS 0.15-0.25, good 0.5-0.7 [vendor]; no collaboration-tool data [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'prompt_every_login', label: 'Upgrade prompt on every login', looksLike: 'More chances to convert', costs: 'People learn to dismiss it; the accounts that would have upgraded are annoyed', coaching: 'Prompt after a success moment, say what the next tier unlocks, and warn before the limit.' },
      { id: 'export_blocked', label: 'Blocking export at the limit', looksLike: 'Strong upgrade pressure', costs: 'Lock-in complaints, 3-8% more 90-day churn, a data-portability angle', coaching: 'Never block access to people\'s own data at the limit.' },
      { id: 'thin_pseo_demoted', label: 'Thin programmatic pages', looksLike: 'Thousands of pages for free', costs: 'A Google core update demotes the pages and the whole site\'s organic traffic for months', coaching: 'Publish only pages that carry data no other site has; prune what gets no impressions in 90 days.' },
      { id: 'contact_import_invites', label: 'Invites from imported contacts', looksLike: 'A viral loop', costs: 'Spam complaints land on the sending domain; flagged domain, bad reviews', coaching: 'Invite at the moment a second person is needed, one confirmed recipient at a time.' },
      { id: 'release_flood', label: 'Releasing the waitlist all at once', looksLike: 'Growth', costs: 'Onboarding and support overload, worse activation, nothing learned from a 100-person wave', coaching: 'Release in cohorts your onboarding can serve and debrief each one.' },
      { id: 'waitlist_never_released', label: 'A waitlist that is never released', looksLike: 'Scarcity', costs: 'People forget they signed up; the list goes cold', coaching: 'Set a release cadence and keep it; a waitlist is a queue, not a trophy.' },
      { id: 'pql_blanket_email', label: 'Sales emails every free user', looksLike: 'Aggressive follow-up', costs: 'Feels like surveillance; complaints and lost trials', coaching: 'Hand over only accounts whose behaviour shows intent, with context and a useful first touch.' },
    ],
    detection: [
      { signal: 'Lever configuration quality and which traps are on', howInGame: 'Growth loops lever settings (meter, placement, holdout, rule, data source)', gameable: 'partly', antiGaming: 'The effect comes from a hidden quality score; copy is judged and pressure language is penalised' },
      { signal: 'Measurement: instrumentation built, holdout used, PQL rule validated against closed deals', howInGame: 'Lever state and validation history', gameable: 'no', antiGaming: 'Validation reads hidden intent of won accounts' },
      { signal: 'Weekly review of live levers', howInGame: 'Founder hours charged on Mondays; missed weeks decay the effect', gameable: 'no', antiGaming: 'Time-based' },
    ],
  },

  transactional_email: {
    label: 'Transactional email (login, receipts, notices)',
    apps: ['transactional', 'lifecycle', 'helpdesk'],
    tiers: {
      stellar: {
        behaviours: [
          'separate transactional and marketing streams on their own subdomains from day one; SPF, DKIM, DMARC aligned and DMARC tightened after reports',
          'every required email written and tested: verification, magic link, reset, receipt with legally required fields, trial and renewal notices 3-21 days ahead, failed payment, security alert; a lawyer reads receipts and trial notices',
          'seed tests in four inboxes after each change; complaint alert at 0.1%; fallback provider for login codes',
        ],
        outcomes: { inboxDeliveryPct: [95, 98], lockoutTicketsPer1000Signups: [2, 8], surpriseChargeDisputeSharePct: [0, 1] },
      },
      good: {
        behaviours: ['one provider, dashboards checked weekly', 'separate subdomains but no template registry', 'core flows work, legal fields checked once at launch'],
        outcomes: { inboxDeliveryPct: [90, 95], lockoutTicketsPer1000Signups: [8, 20], surpriseChargeDisputeSharePct: [1, 3] },
      },
      average: {
        behaviours: ['default provider from a tutorial, one domain for everything', 'receipts left to the payment tool defaults; no trial-end notice', 'magic links valid for 24 hours'],
        outcomes: { inboxDeliveryPct: [82, 90], lockoutTicketsPer1000Signups: [20, 45], surpriseChargeDisputeSharePct: [3, 6] },
      },
      mediocre: {
        behaviours: ['marketing blasts from the domain that carries login codes', 'no failed-payment email, so expired cards churn silently', 'invoices missing VAT numbers; a promo block in every receipt', 'copy edited live with no test send'],
        outcomes: { inboxDeliveryPct: [55, 80], lockoutTicketsPer1000Signups: [45, 120], surpriseChargeDisputeSharePct: [6, 15] },
      },
    },
    metrics: {
      inboxDeliveryPct: { label: 'Share of transactional mail reaching the inbox', unit: '%', source: 'p2 §5: no rigorous public study; Validity global inbox placement ~84-87% [secondary]; vendor targets 95%/90% [unverified]', sourced: false, confidence: 'secondary' },
      lockoutTicketsPer1000Signups: { label: 'Login-related support tickets per 1,000 signups', unit: 'count', source: 'p2 §5 impact model [design]; password and login issues are a large share of IT tickets (HDI, old) [secondary]', sourced: false, confidence: 'design' },
      surpriseChargeDisputeSharePct: { label: 'Card-required trial conversions ending in a refund or dispute', unit: '%', source: 'p1 §1: budget 5-10% of first-charge revenue for refunds and disputes without a reminder [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'blast_hit_login_mail', label: 'Marketing blast on the login domain', looksLike: 'One domain, simple', costs: 'Complaints pull login codes into spam within a day: lower activation, lockout tickets', coaching: 'Give transactional mail its own subdomain and reputation.' },
      { id: 'auto_renewal_exposure', label: 'Trials convert with no compliant notice', looksLike: 'Higher conversion', costs: 'Refunds, disputes and auto-renewal legal exposure (California ARL, ROSCA)', coaching: 'Send a trial-ending notice 3-21 days ahead with the amount, date and an online cancel link.' },
      { id: 'invoice_missing_fields', label: 'Receipts without legally required fields', looksLike: 'A receipt goes out', costs: 'Tax and accountant bounces; retroactive fixes are expensive', coaching: 'Seller address, sequential number, tax line and VAT IDs on every invoice; have counsel confirm.' },
      { id: 'promo_in_service_email', label: 'Promotional block inside a service email', looksLike: 'Free cross-sell', costs: 'Can reclassify the email as commercial: opt-out duty, penalty exposure, Promotions tab', coaching: 'Keep service mail free of promotions.' },
      { id: 'untested_template_broke', label: 'Template edited live without a test send', looksLike: 'Fast iteration', costs: 'A broken link takes out new signups for days', coaching: 'Seed-test every change in four inboxes.' },
    ],
    detection: [
      { signal: 'Streams separated, authentication complete, DMARC tightened', howInGame: 'Transactional setup state', gameable: 'no', antiGaming: 'Delivery is computed from the records, reputation and provider' },
      { signal: 'Templates written with required fields and legal read', howInGame: 'Lint of the player-written text against the checklist', gameable: 'partly', antiGaming: 'Merge fields must appear in context; promotional text is penalised' },
      { signal: 'Seed tests and monitoring', howInGame: 'Test history and the monitoring flag', gameable: 'no', antiGaming: 'Over time' },
    ],
  },

  owned_audience: {
    label: 'Owned audience (waitlist, newsletter, lists)',
    apps: ['audience', 'lifecycle', 'organic'],
    tiers: {
      stellar: {
        behaviours: [
          'explicit consent with a stated purpose and a record per subscriber; postal address, one-click unsubscribe, opt-outs honored automatically',
          'one promise, one fixed send day, issues with real numbers and at most one soft call to action; sells on click data',
          'a lead magnet that solves the job the product solves; double opt-in where deliverability matters; sunsets silent subscribers at 90-180 days',
          'launches to the list in waves, with a founding price or deposit, writing to top referrers personally',
        ],
        outcomes: { listToTrialPct: [4, 8], clickRatePct: [2, 4], complaintRatePct: [0, 0.05] },
      },
      good: {
        behaviours: ['consent checkbox and an address, weekly-ish sending', 'magic with a specific title; occasional list clean-up', 'launch email plus a reminder'],
        outcomes: { listToTrialPct: [2, 4], clickRatePct: [1, 2], complaintRatePct: [0.05, 0.1] },
      },
      average: {
        behaviours: ['consent added after the fact, no sunset', 'irregular sending; optimises for opens and list size', 'a generic "ultimate guide" PDF', 'one launch blast to everyone'],
        outcomes: { listToTrialPct: [0.5, 2], clickRatePct: [0.4, 1], complaintRatePct: [0.1, 0.2] },
      },
      mediocre: {
        behaviours: ['buys a list "to test" and ships it', 'pitches the product in every issue, or blasts three times a week', 'handles unsubscribes by hand a week later', 'undisclosed sponsorships; abandons the newsletter after six issues'],
        outcomes: { listToTrialPct: [0, 0.5], clickRatePct: [0, 0.4], complaintRatePct: [0.3, 1] },
      },
    },
    metrics: {
      listToTrialPct: { label: 'Subscribers who start a trial within 30 days', unit: '%', source: 'p3 §6: nurture 3-8% for a consumer product with a trial [design]; waitlist-to-paid 3-5% median, 10-15% top [unverified blog ranges]', sourced: false, confidence: 'design' },
      clickRatePct: { label: 'Click rate per issue (delivered)', unit: '%', source: 'p3 §2: Omnisend 2025 0.74% average click-through; specific newsletters 2-4% [design]', sourced: true, confidence: 'secondary' },
      complaintRatePct: { label: 'Spam complaint rate', unit: '%', source: 'p3 §4: Google: keep under 0.10%, never reach 0.30% [official]', sourced: true, confidence: 'primary' },
    },
    traps: [
      { id: 'purchased_list', label: 'A purchased list', looksLike: 'Instant 5,000 subscribers', costs: 'Spam traps, 8-10% bounces, account suspension; unlawful without consent under GDPR and CASL', coaching: 'Never buy a list. Build one with explicit consent and a magnet that solves your buyer\'s problem.' },
      { id: 'no_consent_send', label: 'Mailing people with no consent on record', looksLike: 'A big existing list', costs: 'Regulator and complaint exposure (GDPR, CASL, PECR)', coaching: 'Record consent with the purpose, time, source and wording.' },
      { id: 'ignored_unsubscribes', label: 'Opt-outs handled by hand', looksLike: 'Personal touch', costs: 'CAN-SPAM requires honoring opt-outs within 10 business days; per-email penalty exposure', coaching: 'Honor unsubscribes automatically and suppress across tools.' },
      { id: 'blasting', label: 'Three or more issues a week', looksLike: 'Staying top of mind', costs: 'Unsubscribes and spam complaints rise with frequency', coaching: 'Change cadence only in a segmented test and watch the spam rate for four weeks.' },
      { id: 'cadence_gap', label: 'Long silence, then a send', looksLike: 'Saving it for a good one', costs: 'Subscribers forgot you: unsubscribes and complaints spike', coaching: 'Pick one day a week and keep it.' },
      { id: 'undisclosed_sponsor', label: 'Undisclosed sponsorship', looksLike: 'Easy revenue', costs: 'FTC endorsement exposure and reader trust', coaching: 'Label every sponsored placement and refuse sponsors your readers would hate.' },
    ],
    detection: [
      { signal: 'Consent record, address, one-click unsubscribe, automatic opt-outs', howInGame: 'Compliance settings', gameable: 'no', antiGaming: 'Cohort consent flags decide complaint and legal exposure' },
      { signal: 'Cadence consistency, issue quality and pitch ratio', howInGame: 'Issue history, judged text', gameable: 'partly', antiGaming: 'Numbers and specifics are required; pitch ratio is penalised' },
      { signal: 'List hygiene and complaint rate', howInGame: 'Sunset history, engaged share, 30-day complaints', gameable: 'no', antiGaming: 'Rolling windows' },
    ],
  },

  // App Store Optimization (Apple App Store + Google Play), B2C apps. Source: docs/research/seo/aso.md.
  app_store_optimization: {
    label: 'App Store Optimization (App Store + Google Play)',
    apps: ['organic', 'ads'],
    tiers: {
      stellar: {
        behaviours: [
          'researched long-tail terms first; distinct words across name, subtitle and a 90-100 character keyword field, no spaces after commas; revisits them every release and waits for ranks to settle',
          'screenshots tell a benefit story; tests icon and screenshots once the traffic exists and ships only significant winners; CPPs per paid theme',
          'asks for a rating right after a success moment (the OS caps it at 3 a year), replies to low reviews within 48 h, keeps 4.5+',
          'localizes the top markets properly; runs Apple Search Ads on generic terms and measures how much brand bidding cannibalizes',
        ],
        outcomes: { organicInstallsVsMedian: [2.5, 4], pageCvrLiftPct: [25, 40] },
      },
      good: {
        behaviours: ['good terms with a few duplicates', 'one creative test a quarter', 'prompts on a success trigger, some replies'],
        outcomes: { organicInstallsVsMedian: [1.5, 2], pageCvrLiftPct: [10, 20] },
      },
      average: {
        behaviours: ['brand plus generic words, wasted keyword characters', 'default screenshots, never tested', 'prompts on a timer or not at all', 'English only'],
        outcomes: { organicInstallsVsMedian: 1, pageCvrLiftPct: 0 },
      },
      mediocre: {
        behaviours: ['stuffed metadata, competitor names, pricing claims: rejected updates', 'developer screenshots, no tests', 'prompts on open, no replies, below 4.0', 'buys or rewards reviews'],
        outcomes: { organicInstallsVsMedian: [0.3, 0.6], pageCvrLiftPct: [-20, -10] },
      },
    },
    metrics: {
      organicInstallsVsMedian: { label: 'Organic store installs vs the median operator at equal product quality', unit: 'x', source: 'research seo/aso.md stellar/average/mediocre table [design]', sourced: false, confidence: 'design' },
      pageCvrLiftPct: { label: 'Product-page conversion vs the median', unit: '%', source: 'research seo/aso.md: no independent lift distribution; testing a year +15-35% [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'competitor_names', label: 'Competitor names in the metadata', looksLike: 'Free traffic from a big brand', costs: 'Guideline 2.3.7 rejection: days in review lost, a resubmission, and a rank penalty on repeat', coaching: 'Never use other apps\' names or trademarks; rank for what your app does.' },
      { id: 'wasted_keyword_field', label: 'Wasted keyword characters', looksLike: 'A full keyword field', costs: 'Spaces, repeats of name/subtitle words, plurals and "app/free" buy no extra searches', coaching: 'Fill 90-100 characters with distinct relevant words not already in the name or subtitle, comma-separated without spaces.' },
      { id: 'prompt_on_open', label: 'Rating prompt on open (or never)', looksLike: 'More ratings', costs: 'Lower stars, a conversion hit below 4.0, and a weaker ranking signal', coaching: 'Ask right after a success moment; the OS caps it at 3 prompts per user per year anyway.' },
      { id: 'never_test', label: 'Never testing the page', looksLike: 'Saving time', costs: 'Conversion stays where the first draft put it', coaching: 'Once the page gets a few hundred views a day, test screenshots and the icon and ship only significant winners.' },
      { id: 'fake_reviews', label: 'Bought or incentivized reviews', looksLike: 'Social proof fast', costs: 'Purged ratings, demotion, app removal or account termination; FTC exposure', coaching: 'Never buy or reward reviews: removal and FTC exposure.' },
      { id: 'metadata_churn', label: 'Changing metadata every few days', looksLike: 'Iterating', costs: 'Ranks never settle, so nothing is measured: going in circles', coaching: 'Change metadata once per release and give ranks 2-4 weeks before judging.' },
      { id: 'premature_agency', label: 'ASO agency before there is traffic', looksLike: 'Professional help', costs: 'Retainers for tests that cannot reach significance', coaching: 'Hire ASO help after the traffic exists; below ~1,000 installs a day founder time plus a $79 tool wins.' },
    ],
    detection: [
      { signal: 'Keyword field usage, waste, word fit, other brands', howInGame: 'Live/pending metadata through the validator', gameable: 'partly', antiGaming: 'Volume comes from real query matches and rank, not character count; irrelevant words convert badly' },
      { signal: 'Creative tests run, significant wins shipped', howInGame: 'PPO / listing experiment history', gameable: 'no', antiGaming: 'Hidden true effects; shipping a non-winner applies its real (often negative) effect' },
      { signal: 'Prompt timing, replies, stars, policy record', howInGame: 'Rating plan, reply weeks, rejections, fake-review flags', gameable: 'no', antiGaming: 'Stars follow product fit; manipulation is detected later' },
    ],
  },

  // ======================================================================================================
  // GTM COMPENSATION AND ACCOUNT EXPANSION (docs/research/gtm-comp/)
  // ======================================================================================================

  gtm_comp_design: {
    label: 'GTM compensation plans (SDR, AE, AM, CSM, SE): what the plan pays for',
    apps: ['people', 'crm', 'bank'],
    tiers: {
      stellar: {
        behaviours: [
          'pays the SDR on qualified opportunities (Stage-1 conversions), not meetings held; pays the CSM on gross retention and the AM on expansion gated by a healthy book',
          'keeps a 60-120 day clawback on churn or non-payment, pays on cash for invoiced deals, and caps discount authority so reps cannot buy quota with price',
          'uncapped with accelerators (or a cap well above what the best rep can reach), a decelerator for the bottom, a draw during ramp and OTE near the role market',
          'one-page plan, set at the start of a period with notice; changes it at most once a year, at a boundary',
        ],
        outcomes: { sdrQualifiedSharePct: [55, 70], pctRepsAtQuota: [50, 65], repAttritionPct: [15, 30], newCustomerChurn6moPct: [4, 8], planChangesPerYear: [0, 1] },
      },
      good: {
        behaviours: [
          'qualified-opportunity SDR plan or meetings with a qualification gate; clawback present but short, or cash-basis without a clawback',
          'a cap at 200% or a flat rate with no accelerator; discount authority around 15-20%',
          'OTE within 15% of market; one mid-year tweak in a year',
        ],
        outcomes: { sdrQualifiedSharePct: [45, 58], pctRepsAtQuota: [42, 55], repAttritionPct: [28, 38], newCustomerChurn6moPct: [7, 11], planChangesPerYear: [1, 2] },
      },
      average: {
        behaviours: [
          'copies a template without checking what it rewards: meetings held for SDRs, bookings for AEs, no clawback',
          'a 150% cap "to control cost"; discount authority 20-30% because reps asked',
          'OTE a little under market to save cash; a plan change when numbers look bad',
        ],
        outcomes: { sdrQualifiedSharePct: [35, 48], pctRepsAtQuota: [35, 48], repAttritionPct: [35, 48], newCustomerChurn6moPct: [10, 15], planChangesPerYear: [2, 3] },
      },
      mediocre: {
        behaviours: [
          'pays per meeting held and per booking with no clawback, a hard cap and 30% discount authority',
          'OTE well under market, then changes the plan mid-quarter when a rep earns "too much" or too little',
          'a plan with six moving parts nobody can explain; CSM paid on upsell',
        ],
        outcomes: { sdrQualifiedSharePct: [15, 35], pctRepsAtQuota: [20, 38], repAttritionPct: [45, 70], newCustomerChurn6moPct: [15, 28], planChangesPerYear: [3, 6] },
      },
    },
    metrics: {
      sdrQualifiedSharePct: { label: 'Share of SDR-held meetings that qualify', unit: '%', source: 'Bridge Group 2025: 10 Stage-0 held and 6 Stage-1 conversions per month median [verified] (~60%); per-meeting pay lowering the share is practitioner observation, not a measured study [design]; tier bands [design]', sourced: false, confidence: 'design' },
      pctRepsAtQuota: { label: 'Share of reps at or above quota', unit: '%', source: 'Bridge Group 2025: 60% of SDRs at quota [verified]; AE sources conflict at 45-68% [unverified]; tier bands [design]', sourced: false, confidence: 'design' },
      repAttritionPct: { label: 'Annual attrition of quota-carrying reps', unit: '%', source: 'Bridge Group 2025: SDR median 40% (25th-75th pct 21-57%) [verified]; vendor 35% [unverified]; tier bands [design]', sourced: true, confidence: 'secondary' },
      newCustomerChurn6moPct: { label: 'New customers churning within six months', unit: '%', source: 'No quantified source on clawbacks and poor-fit closes [design]', sourced: false, confidence: 'design' },
      planChangesPerYear: { label: 'Material plan changes per year', unit: 'count', source: 'Practitioner guidance: change plans at period boundaries [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'pays_for_meetings', label: 'Paying SDRs per meeting held', looksLike: 'Rewarding activity, more pipeline', costs: 'More meetings but lower qualified share; AE hours burned on junk; commission paid for nothing', coaching: 'Pay the SDR on qualified opportunities (Stage-1 conversions) and let AEs reject a meeting that does not qualify.' },
      { id: 'no_clawback', label: 'No clawback on churned or unpaid deals', looksLike: 'A generous, simple plan', costs: 'Reps close poor-fit customers who churn within months; you pay the commission and lose the logo', coaching: 'Add a 60-120 day clawback on churn and non-payment, and pay on cash for invoiced deals.' },
      { id: 'hard_cap', label: 'Capping top performers', looksLike: 'Cost control', costs: 'Top reps hold deals for the next period or leave; attrition of your best sellers', coaching: 'Cap nothing, or set the cap above what your best rep can reach; use accelerators and a decelerator instead.' },
      { id: 'wide_discount_authority', label: 'Wide discount authority at period end', looksLike: 'Closing faster', costs: 'Discount at quarter end, deals pulled forward, customers anchored on the low price', coaching: 'Cap discount authority around 10-15% and require approval above it.' },
      { id: 'midyear_change', label: 'Changing the plan mid-period', looksLike: 'Fixing a problem quickly', costs: 'Morale drops, resignations rise for months, reps stop trusting the next plan', coaching: 'Change plans at the start of a quarter or year with notice; test the idea on paper against last year first.' },
      { id: 'under_market_ote', label: 'OTE below the market', looksLike: 'Saving cash', costs: 'Offers get declined or reps leave; recruiting and ramp cost more than the saving', coaching: 'Benchmark OTE and the split against role medians; trade equity only for a founding-AE seat.' },
    ],
    detection: [
      { signal: 'Plan metric and guardrails against what the role should produce', howInGame: 'The saved plan per role: SDR metric, clawback days, cap, pay timing, discount authority', gameable: 'no', antiGaming: 'The reader scores the plan that is actually paying reps, not a description' },
      { signal: 'Qualified share of SDR meetings, early churn of new customers, attrition', howInGame: 'Deals sourced by each SDR/AE and their later churn; People attrition', gameable: 'no', antiGaming: 'Outcomes come from the simulation, not from the plan text' },
      { signal: 'Plan stability and complexity', howInGame: 'Plan change log and complexity score', gameable: 'no', antiGaming: 'Time-based log' },
    ],
  },

  account_expansion: {
    label: 'Land and expand: land strategy, account maps, QBRs, multi-threading, NRR',
    apps: ['success', 'crm', 'people'],
    tiers: {
      stellar: {
        behaviours: [
          'picks the land to fit the segment (departmental or single team for mid-market, a paid pilot for enterprise) and lands near list price',
          'maps every account (whitespace by department, executive sponsor), meets a second stakeholder before the champion can leave',
          'quarterly business review with usage data; pursues expansion where usage already hit the limit, not before adoption',
          'someone owns every renewal (CSM or AM), starts it 90-120 days out; true-ups and step-ups are in the contract',
        ],
        outcomes: { nrrPct25to50kAcv: [108, 115], landDiscountPct: [0, 10], accountsMultiThreadedPct: [70, 95], qbrWithin120DaysPct: [70, 100], accountsMappedPct: [80, 100] },
      },
      good: {
        behaviours: ['sensible land for the segment, some discount; QBRs for the largest accounts', 'maps the top accounts; expands when asked', 'renewals started ~60 days out'],
        outcomes: { nrrPct25to50kAcv: [102, 108], landDiscountPct: [8, 15], accountsMultiThreadedPct: [40, 70], qbrWithin120DaysPct: [40, 70], accountsMappedPct: [40, 80] },
      },
      average: {
        behaviours: ['lands whatever the buyer asks for; 15-25% discount to win', 'QBRs when the customer asks; one champion per account', 'renewals handled when the invoice goes out'],
        outcomes: { nrrPct25to50kAcv: [96, 102], landDiscountPct: [15, 25], accountsMultiThreadedPct: [15, 40], qbrWithin120DaysPct: [15, 40], accountsMappedPct: [5, 40] },
      },
      mediocre: {
        behaviours: ['lands too small to matter or oversizes into shelfware; 25%+ discount to close', 'pushes upsell before value is shown; paid on upsell', 'no owner for renewals; one contact per account'],
        outcomes: { nrrPct25to50kAcv: [82, 96], landDiscountPct: [25, 45], accountsMultiThreadedPct: [0, 15], qbrWithin120DaysPct: [0, 15], accountsMappedPct: [0, 5] },
      },
    },
    metrics: {
      nrrPct25to50kAcv: { label: 'Net revenue retention (mid-market, $25-50k ACV band)', unit: '%', source: 'SaaS Capital 2025 B2B Retention Benchmarks: median 102%, top quartile 111%, bottom quartile 97% at $25-50k ACV [secondary, from a search extract; the PDF did not render]; tier splits [design]', sourced: true, confidence: 'secondary' },
      landDiscountPct: { label: 'Discount on the land', unit: '%', source: 'Founder-stage advice: avoid deep first-year discounts; Alexander Group directional [design]', sourced: false, confidence: 'design' },
      accountsMultiThreadedPct: { label: 'Accounts with a second relationship or an executive sponsor', unit: '%', source: 'Practitioner consensus [design]', sourced: false, confidence: 'design' },
      qbrWithin120DaysPct: { label: 'Accounts above $10k ACV with a QBR in the last 120 days', unit: '%', source: 'World-ops research: QBR every quarter above $10k ACV [design]', sourced: false, confidence: 'design' },
      accountsMappedPct: { label: 'Accounts with a whitespace map', unit: '%', source: 'Account mapping and whitespace [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'land_too_small', label: 'Landing too small to matter', looksLike: 'An easy yes', costs: 'Never expands, churns at the first renewal, little revenue for the cost of the sale', coaching: 'Land a team with a real budget and a use case that matters; use a paid pilot to size the rest.' },
      { id: 'over_discounted_land', label: 'Over-discounting the land', looksLike: 'Winning the logo', costs: 'The price anchors: uplifts are refused and every expansion sells at the low number', coaching: 'Land near list; trade term, scope or a reference instead of price.' },
      { id: 'upsell_before_value', label: 'Pushing upsell before value', looksLike: 'Growth effort', costs: 'Trust drops and churn risk rises; the seats become shelfware', coaching: 'Fix adoption first, then expand where usage already hit the limit.' },
      { id: 'oversized_land', label: 'Oversizing the land', looksLike: 'A big contract', costs: 'Shelfware, contraction at renewal, a buyer who resents the commit', coaching: 'Seat what they will use in 90 days and ramp the rest in the contract.' },
      { id: 'single_threaded', label: 'One champion, no second thread', looksLike: 'A good relationship', costs: 'When the champion leaves, expansion stalls and the renewal is at risk', coaching: 'Meet a second stakeholder and get an executive sponsor in the first quarter.' },
      { id: 'no_owner', label: 'No owner for renewals', looksLike: 'Everyone is responsible', costs: 'Renewals slide to the last week and churn; surprises at the invoice', coaching: 'Name a CSM or account manager for every account and start the renewal at 90-120 days.' },
    ],
    detection: [
      { signal: 'Land strategy against the account size band; discount on the land', howInGame: 'Deal land strategy and the signed discount', gameable: 'no', antiGaming: 'The reader compares the choice with the size of what was actually sold' },
      { signal: 'Account map, second thread, executive sponsor, QBR within 120 days', howInGame: 'Account map state and the QBR log', gameable: 'no', antiGaming: 'Actions cost hours and need a held meeting' },
      { signal: 'Net and gross revenue retention by band, and shelfware contraction', howInGame: 'Stripe MRR movements (expansion, contraction, churn) on CRM accounts', gameable: 'no', antiGaming: 'Money movements from real subscription changes' },
    ],
  },

  // ======================================================================================================
  // AI COST MANAGEMENT AND STARTUP PERKS (docs/research/ops-2026/llm-spend.md, startup-credits.md)
  // ======================================================================================================

  ai_cost_management: {
    label: 'AI cost management: coding spend, in-product inference, margin, pass-through pricing',
    apps: ['product', 'bank', 'pricing'],
    tiers: {
      stellar: {
        behaviours: [
          'sets a monthly AI budget with alerts at 75% and 90%, scoped per-environment keys and a prepaid hard limit; reads the spend by feature and model every month',
          'right-sizes coding seats from per-engineer usage (heavy users on power seats, light ones on the cheap seat) instead of letting API overage pay for it',
          'routes easy requests to a small model, turns on prompt caching and batch for async work, but runs evals on their own traffic before every swap',
          'caps usage per user and on the free tier, verifies signups, and passes cost through (credits, an AI add-on or usage pricing) so heavy users never sit under water',
        ],
        outcomes: { aiGrossMarginPct: [52, 62], inferenceSharePctRev: [12, 22], unevaledSwapsPct: [0, 5], heavyUsersUnderWaterPct: [0, 3] },
      },
      good: {
        behaviours: ['a budget and sometimes alerts; caching on; a model chosen once and revisited after a bill shock', 'a per-user cap but no pass-through; seats mostly sensible', 'runs an eval for the big swap, skips it for the small ones'],
        outcomes: { aiGrossMarginPct: [47, 55], inferenceSharePctRev: [20, 30], unevaledSwapsPct: [5, 25], heavyUsersUnderWaterPct: [3, 8] },
      },
      average: {
        behaviours: ['one frontier model for everything, no caching, no routing; no budget; reads the invoice at month end', 'unlimited AI on the flat plan; a free tier with no cap', 'engineers each buy their own seat and a shared API key covers the overage'],
        outcomes: { aiGrossMarginPct: [38, 48], inferenceSharePctRev: [30, 45], unevaledSwapsPct: [25, 60], heavyUsersUnderWaterPct: [8, 18] },
      },
      mediocre: {
        behaviours: ['swaps to the cheapest model to hit a margin number, without evals, and watches activation and retention fall', 'agents run with no token cap and no alerts; a leaked shared key is found on the invoice', 'unlimited AI on a cheap plan with a free tier open to scripts; no pass-through; ignores the retirement notice until the model is cut'],
        outcomes: { aiGrossMarginPct: [-10, 38], inferenceSharePctRev: [45, 90], unevaledSwapsPct: [60, 100], heavyUsersUnderWaterPct: [18, 40] },
      },
    },
    metrics: {
      aiGrossMarginPct: { label: 'Gross margin of an AI product', unit: '%', source: 'ICONIQ State of AI (secondary write-ups): AI-native ~41% (2024), ~45% (2025), ~52% projected 2026; Bessemer healthy 50-60% (secondary). Classic SaaS 75-85%. Tier splits [design]', sourced: true, confidence: 'secondary' },
      inferenceSharePctRev: { label: 'Inference as a share of revenue', unit: '%', source: 'ICONIQ: ~23% of revenue at scaling AI B2B companies (secondary); seed-stage share 10-30% [design]', sourced: true, confidence: 'secondary' },
      unevaledSwapsPct: { label: 'Quality-losing model swaps made without an eval', unit: '%', source: 'Practitioner consensus: evals before any switch to a cheaper model [design]', sourced: false, confidence: 'design' },
      heavyUsersUnderWaterPct: { label: 'Users who cost more in inference than their plan pays', unit: '%', source: 'Heavy-tail usage on flat plans; no sourced rate [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'negative_margin_ai_users', label: 'Unlimited AI on a flat cheap plan', looksLike: 'A simple, generous plan that converts well', costs: 'The heaviest decile costs more than it pays; margin falls as the best users arrive', coaching: 'Add a fair-use cap, an included credit pool with paid top-ups, or an AI add-on priced above cost.' },
      { id: 'free_tier_abuse', label: 'A free AI tier open to scripts and heavy users', looksLike: 'Growth and a big top of funnel', costs: 'Bots and resellers burn inference money with no path to revenue', coaching: 'Cap free requests, verify signups and route free users to a small model.' },
      { id: 'model_swap_without_evals', label: 'Switching to a cheaper model without evals', looksLike: 'An instant 5-10x cost cut', costs: 'Quality drops on hard cases; activation and retention fall weeks later and the cost is hard to trace', coaching: 'Run evals on your own traffic first; swap only where the ratio holds, and route the hard cases up.' },
      { id: 'no_rate_limits', label: 'No per-user rate limits on AI endpoints', looksLike: 'Nothing to configure', costs: 'One scripted account turns into a four-figure invoice', coaching: 'Per-user and per-IP limits plus a daily token cap turn a spike into a 429.' },
      { id: 'unmonitored_agent_spend', label: 'Agents running with no token cap or alert', looksLike: 'Autonomy and speed', costs: 'A retry loop burns a month of budget in a day; the bill arrives before the alert would have', coaching: 'Cap tokens per task and per seat, alert at 75%/90% and revoke first, investigate second.' },
      { id: 'shared_api_key_leak', label: 'One shared, unscoped API key', looksLike: 'Less setup', costs: 'A leaked key is resold within hours; tens of thousands of dollars of abuse', coaching: 'Scoped per-environment keys, rotation, secret scanning and a prepaid hard limit.' },
      { id: 'no_spend_alerts', label: 'No spend alerts', looksLike: 'One less thing to set up', costs: 'You learn about a spike from the invoice, a month late', coaching: 'Budget alerts at 75% and 90%; providers leave them off by default.' },
      { id: 'model_deprecation_ignored', label: 'Ignoring a model retirement notice', looksLike: 'It still works today', costs: 'The provider cuts you over with errors and regressions on its date', coaching: 'Plan the migration the week the notice lands and eval the replacement.' },
    ],
    detection: [
      { signal: 'Budget, alerts, key scoping and hard limits set before an incident', howInGame: 'AI costs panel settings against incident timing', gameable: 'no', antiGaming: 'Settings take founder hours and are compared with incidents that already happened' },
      { signal: 'Swaps and routing backed by an eval run on the same config', howInGame: 'Eval log vs the swap log and the quality delta', gameable: 'no', antiGaming: 'An eval is tied to a specific model/cache config and expires; quality is hidden state the eval samples' },
      { signal: 'Margin: inference share of revenue, users under water on their plan, pass-through mode', howInGame: 'Bank COGS (ai_inference) vs Stripe MRR and the per-user usage distribution', gameable: 'no', antiGaming: 'Cost and revenue come from the books, not from a setting' },
      { signal: 'Coding seats matched to per-engineer usage', howInGame: 'Seat plan vs the engineer usage distribution after an audit', gameable: 'partly', antiGaming: 'Usage is invisible until the admin consoles are audited, and it drifts monthly' },
    ],
  },

  startup_perks: {
    label: 'Startup credits and perks: eligibility, applications, credit planning and the cliff',
    apps: ['bank', 'fundraising', 'product'],
    tiers: {
      stellar: {
        behaviours: [
          'checks the eligibility list first and applies only where eligible; sequences self-serve tiers while building the referral (accelerator, VC, partner) for the big ones',
          'puts every credit expiry and exhaustion date in the forecast and decides ahead: right-size, migrate or budget the cash bill',
          'keeps the stack lean while credits last (no over-provisioned footprint, no tools adopted only because they are free) and knows what switching providers will cost',
          'keeps credits out of runway and cash; books them as a contra-expense against the gross vendor bill',
        ],
        outcomes: { creditsCapturedUsd: [30000, 150000], ineligibleApplicationsPct: [0, 5], cliffsPlannedPct: [80, 100], expiredUnusedPct: [0, 15] },
      },
      good: {
        behaviours: ['reads the requirements for the big programs, applies to a few extra on a hunch', 'notes expiry dates and reacts a month before', 'some over-provisioning, cleaned up when the bill lands'],
        outcomes: { creditsCapturedUsd: [15000, 60000], ineligibleApplicationsPct: [5, 15], cliffsPlannedPct: [50, 80], expiredUnusedPct: [15, 30] },
      },
      average: {
        behaviours: ['applies to everything in a list; several are rejected for missing a website, a referral or an accelerator', 'counts the headline amount as runway', 'learns about the expiry from the invoice'],
        outcomes: { creditsCapturedUsd: [5000, 30000], ineligibleApplicationsPct: [15, 35], cliffsPlannedPct: [10, 50], expiredUnusedPct: [30, 55] },
      },
      mediocre: {
        behaviours: ['applies to programs it cannot qualify for, again and again, and treats a denied application as a reason to apply to ten more', 'builds a big multi-region footprint and adopts a dozen free tools because credits cover them', 'forecast shows no cliff; the bill triples the month the credits end'],
        outcomes: { creditsCapturedUsd: [0, 5000], ineligibleApplicationsPct: [35, 80], cliffsPlannedPct: [0, 10], expiredUnusedPct: [55, 100] },
      },
    },
    metrics: {
      creditsCapturedUsd: { label: 'Credits actually applied to bills over the program life', unit: 'USD', source: 'startup-credits.md: most founders without referrals capture $5k-$30k; referred top tiers $100k-$350k nominal over 1-2 years, often only partly used [design, from unverified aggregator tier structures]', sourced: false, confidence: 'design' },
      ineligibleApplicationsPct: { label: 'Applications rejected for a missing requirement', unit: '%', source: 'Eligibility traps: parked domain, no paid account, no referral, prior credits (startup-credits.md) [design rates]', sourced: false, confidence: 'design' },
      cliffsPlannedPct: { label: 'Credit expiries or exhaustions planned for ahead of time', unit: '%', source: 'Credit cliff behaviour [design]', sourced: false, confidence: 'design' },
      expiredUnusedPct: { label: 'Credit value that expired unused', unit: '%', source: 'Microsoft first credits reported 90 days, forfeited if unused; low-usage startups let credits lapse [unverified]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'applied_ineligible', label: 'Applying where you cannot qualify', looksLike: 'Free money for 30 minutes of effort', costs: 'Hours of founder time, a rejection, sometimes a cooldown before you can re-apply', coaching: 'Read the checklist: website, domain, LinkedIn, a funded or accelerator referral for the big tiers, no prior credits from the same allocation.' },
      { id: 'credit_cliff_surprise', label: 'No plan for when credits end', looksLike: 'Free hosting and inference for a year', costs: 'The bill jumps to cash overnight; the forecast never showed it', coaching: 'Put each expiry in the forecast, then right-size or migrate before the date.' },
      { id: 'overprovisioned_on_credits', label: 'Building big because it is free', looksLike: 'Managed everything, multi-region, every tool', costs: 'The over-provisioned footprint and the free tools become cash bills at the cliff, and the provider lock-in raises the cost of leaving', coaching: 'Size for the load you have; adopt a tool because you need it, not because a perk covers it.' },
    ],
    detection: [
      { signal: 'Applications against the public eligibility checklist', howInGame: 'Application log vs the founder state at the time (website, domain, funding, accelerator, prior credits)', gameable: 'no', antiGaming: 'Rejections for missing requirements are logged with the hours wasted' },
      { signal: 'Cliff plan recorded before the credit ends', howInGame: 'Plan action on the credit vs its end date; the forecast line', gameable: 'no', antiGaming: 'The plan must exist before the cliff, and right-sizing costs hours' },
      { signal: 'Footprint and tool adoption while credits last', howInGame: 'Cloud footprint and tools tagged as adopted for a perk', gameable: 'no', antiGaming: 'Bills reappear in cash at expiry' },
    ],
  },
  // ======================================================================================================
  // NEGOTIATION (shared engine: enterprise deals, VC term sheets, acquisition LOIs, vendors, offers)
  // ======================================================================================================

  negotiation: {
    label: 'Negotiation (enterprise terms, term sheets, acquisition offers, vendors, offers)',
    apps: ['crm', 'fundraising'],
    tiers: {
      stellar: {
        behaviours: [
          'prepares before the first offer: maps the real alternatives (competing term sheets, other pipeline deals, other candidates), looks up the market norms and researches what the other side cares about',
          'opens with a precise, defensible anchor just beyond the counterparty\'s likely reservation, with a reason, never an insulting extreme',
          'concedes in shrinking steps and only as a trade ("I can do X if you can do Y"); gives up the issues the other side values most and that cost little, and holds the ones that matter to the business',
          'mentions an alternative only when it is real and can be shown; never bluffs; walks when the package falls below the alternative and stays when it does not',
          'reads the debrief and changes the next negotiation',
        ],
        outcomes: { surplusCapturedPct: [60, 80], jointValueEfficiencyPct: [85, 100], discountVsListPctAbove100kAcv: [8, 14], unreciprocatedConcessions: [0, 0], bluffsCaught: [0, 0] },
      },
      good: {
        behaviours: [
          'checks the alternatives or the norms (not both); opens with a reasonable ask',
          'trades most concessions and keeps them small; occasionally gives a minor point for free',
          'mentions alternatives honestly; walks only when clearly right',
        ],
        outcomes: { surplusCapturedPct: [42, 60], jointValueEfficiencyPct: [65, 85], discountVsListPctAbove100kAcv: [14, 19], unreciprocatedConcessions: [0, 1], bluffsCaught: [0, 0] },
      },
      average: {
        behaviours: [
          'skips preparation, opens at list or at a round number, concedes when pushed and gets something back about half the time',
          'splits the difference early without checking whether the middle is good for them',
          'treats it as one-issue haggling on price and misses the cheaper-for-you, valuable-for-them trades',
        ],
        outcomes: { surplusCapturedPct: [25, 42], jointValueEfficiencyPct: [45, 65], discountVsListPctAbove100kAcv: [19, 24], unreciprocatedConcessions: [1, 2], bluffsCaught: [0, 1] },
      },
      mediocre: {
        behaviours: [
          'goes in unprepared, opens inside the counterparty\'s acceptable zone or so far out that trust is gone',
          'concedes big and early (especially near a quarter end or runway deadline) without asking for anything, and signs liability, MFN, payment-term and board terms they did not understand',
          'invents a competing offer, makes empty walk-away threats, or walks from a deal that beat their alternative',
          'accepts a package worse than their alternative because the negotiation felt like a loss otherwise',
        ],
        outcomes: { surplusCapturedPct: [0, 25], jointValueEfficiencyPct: [20, 45], discountVsListPctAbove100kAcv: [24, 35], unreciprocatedConcessions: [2, 6], bluffsCaught: [1, 3] },
      },
    },
    metrics: {
      surplusCapturedPct: { label: 'Share of the zone of agreement captured (player utility above their alternative over the best attainable)', unit: '%', source: 'Textbook ZOPA / BATNA framing (Raiffa; Fisher and Ury) [unverified standard framing]; the tier bands are [design]', sourced: false, confidence: 'design' },
      jointValueEfficiencyPct: { label: 'Joint value created relative to the best logrolled deal', unit: '%', source: 'Integrative negotiation produces higher joint outcomes when interests are discussed (Warsitzka et al. 2024, quasi-meta-analysis, summary only); tier bands [design]', sourced: false, confidence: 'design' },
      discountVsListPctAbove100kAcv: { label: 'Average discount off list on $100K+ enterprise deals', unit: '%', source: 'Vendr: ~11% average saving, 4.2% when the seller prepares vs 11.4% for unprepared [unverified, sales-training page]; $200K+ deals average ~22% (GrowthSpree, vendor marketing); working band 15-25% for $100K+ [design]', sourced: false, confidence: 'secondary' },
      unreciprocatedConcessions: { label: 'Concessions pocketed without anything given back', unit: 'count per negotiation', source: 'Reciprocity norm in negotiation research [unverified]; counts are [design]', sourced: false, confidence: 'design' },
      bluffsCaught: { label: 'Invented alternatives the counterparty caught', unit: 'count', source: 'Bluffs are detected over repeated rounds [unverified standard literature]; rates [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'no_prep', label: 'Negotiating without preparing', looksLike: 'Saving the hours and "reading the room"', costs: 'An anchor inside their zone or out of the game, a walk-away you cannot justify, and value left on the table you never see', coaching: 'Spend the Prepare hours: map your alternatives, look up the market norms and research the other side before the first offer.' },
      { id: 'free_concessions', label: 'Conceding without a trade', looksLike: 'Building goodwill', costs: 'The concession is pocketed, they learn you have room, and the next ask comes harder; the price lands in the renewal anchor', coaching: 'Every concession is a trade: "I can do X if you can do Y". Give what costs you little and they value most.' },
      { id: 'bluff', label: 'Inventing a competing offer', looksLike: 'Free leverage', costs: 'Caught: trust collapses, the terms harden and the story follows you (an investor network reputation hit); not caught: a delayed discovery before signing', coaching: 'Only mention alternatives you can show. Build real ones (a second term sheet, another pipeline deal) before you need them.' },
      { id: 'bad_anchor', label: 'A weak or extreme first offer', looksLike: 'Being reasonable, or being bold', costs: 'Inside their zone: they accept at once and you never learn what you left. Far outside it: trust drops and they may walk', coaching: 'Anchor with a precise number just beyond their likely reservation and give the reason. First offers pull the whole negotiation toward them.' },
      { id: 'walk_discipline', label: 'No walk-away discipline', looksLike: 'Closing the deal', costs: 'Signing worse than your alternative, or walking from a deal that beat it', coaching: 'Know your alternative before you start. Walk below it, stay above it, and do not threaten what you will not do.' },
      { id: 'quarter_end', label: 'Discounting because the quarter is ending', looksLike: 'Hitting the number', costs: 'Buyers know your calendar; quarter-end discounts run 60-110% deeper than mid-quarter [sourced, vendor marketing]; the low price anchors the renewal and spreads to other accounts', coaching: 'Close earlier or trade term, prepay and references for price; never reveal that the clock is yours.' },
    ],
    detection: [
      { signal: 'Preparation before the first offer (alternatives, norms, counterparty research)', howInGame: 'Prepare steps recorded on the negotiation before round 1; each costs founder hours', gameable: 'partly', antiGaming: 'The steps cost hours and only inform; the score reads what you do with them (anchor, trades, walk decisions)' },
      { signal: 'Surplus captured against the hidden zone of agreement', howInGame: 'The deal compared with the best attainable package given the counterparty\'s hidden reservation and your real alternatives', gameable: 'no', antiGaming: 'Hidden reservation and weights; alternatives are read from the game state (term sheets, pipeline, candidates), not from what you claim' },
      { signal: 'Concession pattern: shrinking steps, trades, pocketed concessions, free gives', howInGame: 'Per-round package movement versus what you asked and what they gave', gameable: 'no', antiGaming: 'Computed from the package history, not from the message text' },
      { signal: 'Claimed alternatives against real alternatives; walk decisions against the alternative', howInGame: 'The BATNA read from competing term sheets, pipeline deals and candidates at the time of each claim', gameable: 'no', antiGaming: 'A bluff is checked against the hidden state and can be found now or at signing' },
    ],
  },

  // ======================================================================================================
  // EARLY STAGE: MVP and pre-product experiments (apps/mvp; reader apps/mvp/readers.js)
  // ======================================================================================================

  mvp_experiments: {
    label: 'MVP and pre-product experiments',
    apps: ['mvp', 'website', 'crm', 'product'],
    tiers: {
      stellar: {
        behaviours: [
          'writes the hypothesis and a pass/fail number before the page goes live; never moves it afterwards',
          'runs the cheapest test first (a smoke test with a price and a deposit button) before any manual service or build',
          'takes the test to the narrow segment with the sharpest pain and compares like with like (same audience, one change)',
          'reads paid intent separately from email signups and discounts network traffic for politeness',
          'time-boxes concierge to about a month, charges from week three, apologises to fake-door clickers within days',
          'builds only what two or more design partners share and converts partners to paid at the end',
        ],
        outcomes: { experimentsBeforeFirstBuildHours: [2, 4], payingSignalWithinWeeks: [2, 4], wastedBuildHoursPct: [0, 10] },
      },
      good: {
        behaviours: ['sets thresholds most of the time and tests cheap first', 'asks for money in the second test, not the first', 'right audience most of the time; sometimes reads a friendly list as demand'],
        outcomes: { experimentsBeforeFirstBuildHours: [1, 2], payingSignalWithinWeeks: [4, 8], wastedBuildHoursPct: [10, 25] },
      },
      average: {
        behaviours: ['runs a waitlist page and counts signups as demand', 'broad audience ("small businesses"); thresholds decided after the numbers come in', 'concierge for months with no price; builds what the loudest partner asked for'],
        outcomes: { experimentsBeforeFirstBuildHours: 1, payingSignalWithinWeeks: [8, 16], wastedBuildHoursPct: [25, 45] },
      },
      mediocre: {
        behaviours: [
          'builds a Wizard of Oz UI or the full product before any test or real interview',
          'no threshold; calls a winner on a few dozen visits or on friends and family signups',
          'pitches the network, gets compliments, and treats them as validation',
          'leaves fake-door clickers unanswered; keeps the manual service running indefinitely',
        ],
        outcomes: { experimentsBeforeFirstBuildHours: 0, payingSignalWithinWeeks: [16, 40], wastedBuildHoursPct: [45, 80] },
      },
    },
    metrics: {
      experimentsBeforeFirstBuildHours: { label: 'Validation experiments run before the first 40 build hours', unit: 'count', source: 'Lean Startup / YC Startup School guidance: test before building, with AI agents the build is cheap but the trap is the same (docs/research/early-stage/mvp-first-customers.md) [secondary]; tier counts [design]', sourced: false, confidence: 'design' },
      payingSignalWithinWeeks: { label: 'Weeks to the first real payment signal (deposit, pre-order, paid pilot)', unit: 'weeks', source: 'YC: charge from the start; free use does not validate (mvp-first-customers.md s3) [secondary]; bands [design]', sourced: false, confidence: 'design' },
      wastedBuildHoursPct: { label: 'Share of early build hours spent on things the market did not want', unit: '%', source: 'CB Insights / Startup Genome premature-scaling and no-market-need failure shares (docs/research/outcomes) as direction only; bands [design]', sourced: false, confidence: 'design' },
    },
    traps: [
      { id: 'ignored_failed_test', label: 'Went ahead after your own test failed', looksLike: 'Momentum', costs: 'Weeks of building on a rejected hypothesis', coaching: 'Honour the threshold you set, or iterate and re-test.' },
      { id: 'no_success_criteria', label: 'Running a test with no threshold', looksLike: 'Staying flexible', costs: 'Any number can be argued either way; days lost deciding what the result means', coaching: 'Write the metric and the pass/fail number before the page goes live, and keep it.' },
      { id: 'called_on_tiny_n', label: 'Calling a winner on a few dozen visits', looksLike: 'Moving fast', costs: 'Ranges overlap luck; a wrong build or a good idea killed, then a re-test', coaching: 'Look at the range, not the rate. Under ~150 visits or ~8 people is a direction, not a verdict.' },
      { id: 'email_signup_as_demand', label: 'Treating email signups as demand', looksLike: 'A growing list', costs: 'Network and curious visitors sign up for free; the launch converts a fraction of the list', coaching: 'Ask for a deposit or pre-order on the same audience and read the paid-intent rate.' },
      { id: 'fake_door_no_apology', label: 'Fake door with no follow-up', looksLike: 'Saving a message', costs: 'People who tried to pay and heard nothing talk; reputation in the community you posted in', coaching: 'Tell clickers it was a test within 72 hours, offer first access or a refund.' },
      { id: 'stayed_concierge_too_long', label: 'Concierge for months', looksLike: 'Close to customers', costs: 'Founder hours go into delivery, not learning; the answer was clear by week four', coaching: 'Time-box to about a month: charge from week three, then automate or stop.' },
      { id: 'overfit_to_design_partner', label: 'Building one partner\'s request', looksLike: 'Listening to customers', costs: 'A custom project worth little to the rest of the segment; weeks of build', coaching: 'Build what two or more partners share and that matches a job of the segment.' },
      { id: 'overbuilt_before_validation', label: 'Building before testing', looksLike: 'Progress', costs: 'Weeks of build on an unvalidated idea (same failure as the outcomes warning)', coaching: 'A smoke test with a price takes a day. Run it before the first 40 build hours.' },
    ],
    detection: [
      { signal: 'Hypothesis and threshold stored before the experiment starts', howInGame: 'The experiment record is created with the threshold; it cannot be edited afterwards', gameable: 'no', antiGaming: 'Thresholds are fixed at launch; a missing one logs a mistake' },
      { signal: 'Audience matches the segment with the sharpest hidden pain', howInGame: 'Audience text is matched to the hidden market segments at launch (core/truth.js)', gameable: 'partly', antiGaming: 'Matching uses truth keywords the player cannot see; naming a segment helps only if it is a real one' },
      { signal: 'Paid intent read apart from signups, and calls made with enough sample', howInGame: 'CTA type per smoke test; calls checked against sample size and the player\'s own threshold', gameable: 'no', antiGaming: 'Rates are drawn from per-visitor hidden facts; politeness inflates only signups' },
      { signal: 'Concierge time-boxing, apology sent, requests shared by 2+ partners', howInGame: 'Weeks delivered, apology timestamp, supporters per request', gameable: 'no', antiGaming: 'Time-based and counted from the feedback the partners actually gave' },
    ],
  },
};

// Convenience lookups kept as plain data derivations of the table above (no game logic).
export const OPERATOR_FUNCTION_IDS = Object.keys(OPERATOR_TIERS);
export const OPERATOR_TIER_ORDER = ['stellar', 'good', 'average', 'mediocre'];
