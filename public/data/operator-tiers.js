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

export const OPERATOR_TIERS = {

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
      { id: 'ignore_health', label: 'Ignoring health signals', looksLike: 'Dedication', costs: 'Decisions degrade; energy below 30 slows output', coaching: 'Take two days off before the next pivot call.' },
      { id: 'sunk_cost', label: 'Sunk-cost reasoning', looksLike: 'Loyalty to the work', costs: 'Burn continues past the point of evidence', coaching: 'Decide from the metrics, not from the time already spent.' },
    ],
    detection: [
      { signal: 'Explicit thresholds and dates vs "we will see"; later check of criteria against metrics', howInGame: 'A stored kill-criteria record (does not exist today) compared with MRR and runway', gameable: 'no', antiGaming: 'Criteria are checked against later metrics' },
      { signal: 'Pivot frequency against evidence cited', howInGame: 'ICP / plan / product changes vs logged interviews', gameable: 'no', antiGaming: 'Evidence must be real logged data' },
      { signal: 'Rest signals across turns (time off, weekends)', howInGame: 'founder.hoursPerWeek, energy, personal events', gameable: 'no', antiGaming: 'Behaviour over months' },
    ],
  },
};

// Convenience lookups kept as plain data derivations of the table above (no game logic).
export const OPERATOR_FUNCTION_IDS = Object.keys(OPERATOR_TIERS);
export const OPERATOR_TIER_ORDER = ['stellar', 'good', 'average', 'mediocre'];
