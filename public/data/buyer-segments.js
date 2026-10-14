// Buyer-segment data: who buys, who can block, how long it takes and what paperwork a small vendor must produce.
// Pure data plus four small sampling helpers (segmentFor, committeeFor, cycleDaysFor, paperworkFor). No DOM, no state.
// Research notes and full dated sources: docs/research/buyer-segments.md (synthesis) and
// docs/research/buyer-segments/g1..g9 (raw notes, compiled 2026-10-14).
//
// Conventions
// - Every number is either sourced (see `sourced` on the segment / `sources` on CROSS_SEGMENT, each with URL and date)
//   or a [design] estimate from the research notes. Most cycle, committee, win-rate and churn figures are [design]:
//   no independent source publishes them for these verticals. Never show a [design] value to players as a real statistic.
// - Ranges are [min, max] and always ordered. `NEVER` (1e9) means "no such threshold" so `acv >= threshold` is false.
// - Months are 1..12. Money is US dollars. Probabilities and influence are 0..1.
// - Sampling helpers take `rand` (a () => [0,1) function, default Math.random) so callers can pass the seeded rng.
// - Committee `presentProb` is the chance a role joins a deal at or above its `minAcv` (0 = any size); below minAcv the
//   chance ramps down, so bigger deals add roles. `count` is the head-count range and grows with ACV (committeeFor()).
// - Methodology element ids reuse the scorecard.js MEDDICC-lite keys where they exist
//   (metrics, economicBuyer, decisionCriteria, decisionProcess, pain, champion) and add paperProcess, competition.
// - `revealedOnCall` is true when a call transcript can show the element. Metrics and economicBuyer are usually only
//   partly visible and need a follow-up (docs/research/buyer-segments/g9 §A).

export const NEVER = 1e9;

// ---------------------------------------------------------------------------------------------
// METHODOLOGIES
// ---------------------------------------------------------------------------------------------
const el = (id, label, revealedOnCall, ...probeQuestions) => ({ id, label, probeQuestions, revealedOnCall });

export const METHODOLOGIES = {
  meddpicc: {
    label: 'MEDDPICC',
    elements: [
      el('metrics', 'Metrics', false, 'If this works, what number moves, by how much, by when?', 'What does this problem cost you per month today?'),
      el('economicBuyer', 'Economic buyer', false, 'If you and the team agree, what else is needed to sign? Who signs?', 'Who can release budget without asking anyone else?'),
      el('decisionCriteria', 'Decision criteria', true, 'What must the solution do to be shortlisted?', 'What would make you drop a vendor?'),
      el('decisionProcess', 'Decision process', true, 'Walk me through the last software purchase you made here, step by step.', 'Which meetings or committees sit between now and signature, and when do they meet?'),
      el('paperProcess', 'Paper process', true, 'What do security, legal and procurement need from us, and how long does each take?', 'Is there a vendor portal, insurance minimum or questionnaire we should start now?'),
      el('pain', 'Identify pain', true, 'What does this cost you per month today?', 'Tell me about the last time this went wrong.'),
      el('champion', 'Champion', true, 'Would you introduce me to the person who signs?', 'What happens to you personally if this does not get fixed?'),
      el('competition', 'Competition', true, 'What happens if you do nothing for another year?', 'Who else are you looking at, including building it in-house?'),
    ],
    whenToUse: 'Deals above roughly $25k ACV or any deal with a procurement, security or legal step. Add a mutual action plan with dates. Overkill below $5k. [design from vendor explainers: scratchpad.com/blog/meddpicc, exec.com/learn/meddpicc-the-complete-guide]',
  },
  meddicc: {
    label: 'MEDDICC',
    elements: [
      el('metrics', 'Metrics', false, 'If this works, what number moves, by how much, by when?'),
      el('economicBuyer', 'Economic buyer', false, 'Who signs, and what else is needed besides your agreement?'),
      el('decisionCriteria', 'Decision criteria', true, 'What must the solution do to be shortlisted?'),
      el('decisionProcess', 'Decision process', true, 'Walk me through the last time you bought software here.'),
      el('pain', 'Identify pain', true, 'What does this cost you per month today?'),
      el('champion', 'Champion', true, 'Who would sell this for us when we are not in the room?'),
      el('competition', 'Competition', true, 'What happens if you do nothing, and who else are you talking to?'),
    ],
    whenToUse: 'MEDDPICC without the paper-process letter: $10k-$50k deals with one real approver and little security or legal paperwork (small agencies, practices, plants, hotels). Matches the six-flag MEDDICC-lite in scorecard.js.',
  },
  bant: {
    label: 'BANT',
    elements: [
      el('budget', 'Budget', true, 'Is there money set aside for this, or would it come out of an existing line?'),
      el('authority', 'Authority', false, 'Who besides you has to say yes?'),
      el('need', 'Need', true, 'What is the problem you are trying to fix, and what does it cost you?'),
      el('timeline', 'Timeline', true, 'When do you want this live, and what is driving that date?'),
    ],
    whenToUse: 'Single-decision-maker deals under about $5k (mom-and-pop shops, solo practitioners, owner-operators). Ignores the buying group, so it fails on committees. [design]',
  },
  spin: {
    label: 'SPIN Selling',
    elements: [
      el('situation', 'Situation', true, 'How do you handle this today? Who touches it?'),
      el('problem', 'Problem', true, 'Where does that break down? What is the hardest part?'),
      el('implication', 'Implication', true, 'What does that cost you when it happens? What else does it hold up?'),
      el('needPayoff', 'Need-payoff', true, 'If that were fixed, what would change for you and your team?'),
    ],
    whenToUse: 'Consultative discovery with users and champions where the seller must build the size of the problem (faculty, agents, front-desk managers). Mistake: long situation questions and no implication questions. [design]',
  },
  challenger: {
    label: 'Challenger',
    elements: [
      el('teach', 'Teach (commercial insight)', true, 'Did you know teams like yours lose X when Y? How does that compare with your numbers?'),
      el('tailor', 'Tailor to the stakeholder', true, 'What does the CFO / the owner / the compliance officer care about most here?'),
      el('takeControl', 'Take control of the process', true, 'What is the next step and who needs to be in the room for it?'),
    ],
    whenToUse: 'Buyers who think the status quo is fine, or a first meeting with an economic buyer (broker who believes tech is a checkbox, quality leader after a bad inspection, executive after an exam finding). Too aggressive for privacy-fearful principals. [design]',
  },
  sandler: {
    label: 'Sandler',
    elements: [
      el('upfrontContract', 'Up-front contract', true, 'Let us agree what a good outcome of this call is, including a no.'),
      el('painFunnel', 'Pain funnel', true, 'Tell me more about that. How long has it been going on? What have you tried?'),
      el('budget', 'Budget', true, 'What do you expect to invest to solve this?'),
      el('decision', 'Decision', false, 'How will you and the others decide, and when?'),
      el('fulfillment', 'Fulfillment', true, 'If we do this, what would you need to see in the first 30 days?'),
      el('postSell', 'Post-sell', true, 'What could make you regret this decision in 60 days?'),
    ],
    whenToUse: 'Owners who need to talk through the problem themselves and distrust being sold to; outbound-heavy mid-market and SMB. Mistake: negative reverse selling on buyers who want to be sold. [design]',
  },
  value_selling: {
    label: 'Value selling',
    elements: [
      el('pain', 'Business issue and pain', true, 'Which part of the week or the P&L does this hurt most?', 'Tell me about the last time this went wrong. What did it cost?'),
      el('metrics', 'Quantified value', false, 'Hours per week x hourly cost, or no-shows per month x ticket value: what is the number?'),
      el('buyerValidated', 'Buyer-validated numbers', true, 'Does that number look right to you? What would you change?'),
      el('economicBuyer', 'Power (who signs)', false, 'Who else has to say yes, and what do they care about?'),
      el('champion', 'Champion / day-to-day user', true, 'Who will use this daily, and would they push for it?'),
      el('decisionProcess', 'Decision process', true, 'What has to happen, and by when, for you to start?'),
      el('paperProcess', 'Paperwork and approvals', true, 'Is there a form, a security check, a board meeting or an insurance certificate we should start now?'),
      el('priceAnchor', 'Price vs value', true, 'How does the price compare with one saved job, one recovered booking or one saved hour a day?'),
      el('mutualPlan', 'Mutual plan', true, 'What has to be true by what date for you to start?'),
    ],
    whenToUse: 'Default for owner-led and SMB segments with a simple before/after (hours saved, no-shows, missed calls, food cost); extend with the owner/champion/paperwork elements when more than one person is involved. A calculator the buyer never validated is the common mistake. [design]',
  },
  command_of_message: {
    label: 'Command of the Message',
    elements: [
      el('requiredCapabilities', 'Required capabilities', true, 'What would a solution have to do for this to be worth switching?'),
      el('positiveOutcomes', 'Positive business outcomes', true, 'What does success look like in 12 months?'),
      el('metrics', 'Metrics', false, 'How would you measure that, and what is the baseline?'),
      el('proofPoints', 'Proof points', true, 'Which reference customer or pilot result would convince your CFO / board?'),
      el('differentiators', 'Differentiators', true, 'Where do the alternatives fall short for your use case?'),
    ],
    whenToUse: 'Enterprise and regulated deals where one consistent value story must survive several stakeholders and a board packet. Needs reference customers a day-one founder lacks. [design]',
  },
  gap_selling: {
    label: 'Gap selling',
    elements: [
      el('currentState', 'Current state', true, 'Describe how it works today, step by step. Who does what?'),
      el('futureState', 'Future state', true, 'Describe how you want it to work. What is different?'),
      el('rootCause', 'Root cause and impact', true, 'Why does it work this way today, and what does the gap cost in time, money and risk?'),
      el('gap', 'Gap', false, 'So the distance between the two is about X per month. Is that fair?'),
    ],
    whenToUse: 'Workflow and process tools (permits, compliance filings, scheduling, back-office). Mistake: a "future state" the buyer never described. [design]',
  },
  solution_selling: {
    label: 'Solution selling',
    elements: [
      el('pain', 'Pain', true, 'What is the most expensive problem in this area right now?'),
      el('power', 'Power', false, 'Who feels this pain most and who can fund a fix?'),
      el('vision', 'Vision', true, 'If you could redesign this process, what would it look like?'),
      el('value', 'Value', false, 'What is the fix worth per year to you?'),
      el('control', 'Control', true, 'What are the agreed steps from here to a pilot, and who owns each?'),
    ],
    whenToUse: 'Technical or integration-heavy products (manufacturing/OT, utilities, pharma quality) where diagnosis must precede any demo. Mistake: demoing before diagnosis. [design]',
  },
};

// ---------------------------------------------------------------------------------------------
// PAPERWORK (what a small vendor must produce). hours = vendor/founder effort first time; repeatHours = reuse effort.
// costUsd = one-off out-of-pocket; days = elapsed calendar days (including waiting on the buyer); recurringAnnualUsd = ongoing.
// Sources: g9-methods-committees-paperwork.md §C (2025-2026 vendor and consultant pages; hours mostly [design]).
// ---------------------------------------------------------------------------------------------
export const PAPERWORK = {
  w9: { label: 'W-9 (tax form)', hours: [0.1, 0.5], costUsd: [0, 0], days: [0, 2], note: 'One page, under 15 minutes. Keep a signed copy and the insurance certificate in a shared folder. [design]' },
  coi_insurance: { label: 'Certificate of insurance (GL, E&O, cyber)', hours: [1, 4], costUsd: [0, 500], days: [1, 5], recurringAnnualUsd: [2500, 10000], note: 'Seed-stage SaaS: about $1k-$3k/yr for $1M GL and $1.5k-$4k for $1M-$2M E&O/cyber; certificate 1-5 business days after binding [design]. Public-sector example: $1M/$2M GL, $1M E&O, $1M cyber (Larimer County). Large buyers ask $5M+ cyber (Morgan Lewis, Sep 2025).' },
  vendor_portal: { label: 'Supplier portal registration (Ariba, Coupa, city/state portal)', hours: [1, 4], costUsd: [0, 0], days: [5, 28], note: '1-4 h of data entry then 1-3 weeks waiting for buyer approval; one Ariba customer reports 7 days, down from 3 months. Coupa not researched. [design]' },
  security_questionnaire: { label: 'Custom security questionnaire', hours: [8, 30], costUsd: [0, 0], days: [5, 15], repeatHours: [2, 6], note: '12-18 h average (Wolfia 2025-26) and 20-40 h manual (Secureframe 2025) are vendor figures [unverified]. Buyers set 5-10 business day deadlines.' },
  sig_lite: { label: 'SIG Lite questionnaire', hours: [12, 20], costUsd: [0, 0], days: [5, 10], repeatHours: [2, 4], note: 'About 126-200 questions depending on version. First time 12-20 h; repeat with a trust center or SOC 2 report and an answer library 2-4 h [design].' },
  sig_core: { label: 'SIG Core questionnaire', hours: [30, 60], costUsd: [0, 0], days: [10, 25], repeatHours: [6, 12], note: '627 questions in the 2025 version, about 850 in older ones (sources differ). Asked by banks and large enterprises touching customer data. Hours [design].' },
  caiq: { label: 'CAIQ (Cloud Security Alliance)', hours: [8, 16], costUsd: [0, 0], days: [5, 10], repeatHours: [2, 4], note: 'About 260-300 yes/no questions [unverified vendor descriptions]. First time 8-16 h [design].' },
  soc2_bridge_letter: { label: 'SOC 2 status / bridge letter', hours: [1, 3], costUsd: [0, 500], days: [1, 5], note: 'Stop-gap while Type II is in progress; accepted by many mid-market buyers, rejected by strict TPRM teams. [design]' },
  soc2_type1: { label: 'SOC 2 Type I', hours: [60, 120], costUsd: [15000, 40000], days: [90, 120], recurringAnnualUsd: [7500, 15000], note: 'Platform (Vanta/Drata) about $7.2k-$15k/yr; auditor $5k-$25k; kickoff to report 3-4 months; readiness 4-8 weeks. Startup Defense, Scrut, Petronella, TraceLayer 2025-26 [vendor guides, unverified]. Founder hours [design].' },
  soc2_type2: { label: 'SOC 2 Type II', hours: [120, 300], costUsd: [30000, 80000], days: [180, 365], recurringAnnualUsd: [20000, 50000], note: 'Auditor $15k-$50k; whole program $30k-$80k (Startup Defense); observation window 3-12 months, 6 typical for a first audit; 2-4 h/week ongoing evidence [design]; renewals +20-30% [unverified].' },
  iso27001: { label: 'ISO 27001 certification', hours: [200, 500], costUsd: [20000, 60000], days: [180, 365], recurringAnnualUsd: [8000, 25000], note: 'Asked by some manufacturers and European buyers. Not researched in the notes. [design]' },
  pen_test: { label: 'Penetration test letter', hours: [15, 50], costUsd: [5000, 30000], days: [21, 56], recurringAnnualUsd: [5000, 20000], note: '$5k-$10k tight single app, $15k-$35k web + API (Autonoma 2026); 1-3 weeks of testing plus 2-6 weeks to book and remediate. Founder hours [design].' },
  vpat: { label: 'VPAT / Accessibility Conformance Report', hours: [20, 60], costUsd: [350, 6000], days: [28, 56], note: '4-8 weeks with an outside firm (accessible.org); $350 for the ACR itself plus an audit fee [unverified]; remediation can add 40-120 h. WCAG 2.1 AA is the usual ask. Audit fee [design].' },
  hipaa_baa: { label: 'HIPAA Business Associate Agreement', hours: [2, 6], costUsd: [0, 3000], days: [7, 84], note: '1-2 weeks from your own template, 4-12 weeks if the customer paper is negotiated [design]. Must be signed before any PHI flows. Security Rule update (NPRM Jan 2025) not final as of 2026-10.' },
  dpa: { label: 'Data processing agreement', hours: [1, 6], costUsd: [0, 1500], days: [7, 28], repeatHours: [1, 3], note: 'Standard DPA and sub-processor list: 1-3 h once; customer-paper review 2-6 h and 1-4 weeks per deal; SCCs add 1-2 weeks. [design]' },
  sdpc_ndpa: { label: 'Student data privacy agreement (SDPC NDPA)', hours: [4, 10], costUsd: [0, 0], days: [3, 90], repeatHours: [1, 3], note: 'Registry holds 130,000+ signed DPAs across 12,000+ districts and 6,674 providers; v2.2 published 2025-11-19. Template days, custom edits weeks to months. One signature can extend within a state alliance. Hours [design].' },
  hecvat: { label: 'HECVAT (higher-ed security assessment)', hours: [15, 30], costUsd: [0, 0], days: [28, 84], repeatHours: [2, 6], note: 'Full 15-30 h, Lite 6-12 h [design]; reuse across schools; campus review 5-10 business days to 4-12 weeks (Montclair, Toledo, USNH).' },
  govramp: { label: 'GovRAMP (formerly StateRAMP) status', hours: [40, 100], costUsd: [3000, 25000], days: [90, 365], recurringAnnualUsd: [1500, 7500], note: 'PMO fees effective 2025-01-01: snapshot $1k-$2.5k, annual review $500-$7.5k, monitoring from $250/month; third-party gap analysis $10k-$150k [unverified]. No reliable authorization timeline. NC requires it from 2026-04-01 (full 2027-04-01); AZ renewals from 2026-07-01.' },
  tx_ramp: { label: 'TX-RAMP certification', hours: [30, 80], costUsd: [2000, 15000], days: [90, 270], note: 'Texas state agencies and public higher ed; reciprocity with GovRAMP under review (secondary). Cost and time [design].' },
  fedramp: { label: 'FedRAMP authorization (Moderate)', hours: [1500, 6000], costUsd: [250000, 1500000], days: [365, 1095], recurringAnnualUsd: [100000, 400000], note: 'Sources conflict: $250k-$1M+ (g8, design), $250k-$2M and $500k-$4M (g9, consultants, unverified); 12-36 months. 20x/CR26 may cut this; verify at fedramp.gov. Not a priority for a founder without a federal pipeline. Chosen range: $250k-$1.5M.' },
  sam_registration: { label: 'SAM.gov registration (UEI, NAICS)', hours: [3, 10], costUsd: [0, 0], days: [7, 30], note: 'Required to be paid by federal agencies; renew yearly. [design]' },
  gsa_schedule: { label: 'GSA Multiple Award Schedule', hours: [60, 200], costUsd: [0, 10000], days: [120, 365], note: 'Cost to obtain a schedule was not found in the notes; a reseller (Carahsoft-style) is the realistic path for 1-3 people. [design]' },
  coop_contract: { label: 'Cooperative contract award (Sourcewell, OMNIA, NASPO ValuePoint)', hours: [40, 120], costUsd: [0, 2000], days: [120, 270], feePctOfSales: [0.01, 0.02], note: 'Solicitation to award 4-9 months [design]; proposal 40-120 h [design]; Sourcewell admin fee 1-1.5% of sales, 1-2% elsewhere [unverified]; OMNIA fee not found. Bid cycles can be years apart.' },
  sole_source_justification: { label: 'Sole-source / no-bid justification', hours: [2, 8], costUsd: [0, 0], days: [7, 30], note: 'The champion writes it with vendor help; needed when the buy is above the informal threshold but there is no competitive bid. [design]' },
  rfp_response: { label: 'RFP / formal bid response', hours: [20, 120], costUsd: [0, 5000], days: [14, 60], repeatHours: [8, 40], note: 'Reuse a standard packet. Decline when the evaluation criteria favour incumbents or large vendors. Cooperative-contract proposals take 40-120 h. [design]' },
  msa_redlines: { label: 'MSA / contract redlines', hours: [4, 30], costUsd: [0, 5000], days: [14, 45], repeatHours: [1, 4], note: 'First enterprise deal about six weeks of legal back-and-forth; follow-on order forms under the MSA 2-3 days (anecdote, rework.com). Liability-cap fallback: 12 months of fees with a data-breach super-cap.' },
  board_packet: { label: 'Board / council one-page packet', hours: [2, 6], costUsd: [0, 0], days: [7, 45], note: 'Summary, cost, sunset clause and endorsing leader. Wait for the next scheduled meeting (monthly to quarterly). [design]' },
  bcp_dr_summary: { label: 'Business continuity / disaster recovery summary', hours: [4, 16], costUsd: [0, 0], days: [3, 14], note: 'Banks, hospitals and critical-vendor reviews ask for BCP, exit plan and data export. [design]' },
  pci_attestation: { label: 'PCI DSS attestation (via processor)', hours: [2, 8], costUsd: [0, 1000], days: [3, 14], note: 'Scope sits with the payment processor for card-billed tools; groups, hotels and giving platforms ask for it. [design]' },
  ftc_safeguards_wisp: { label: 'FTC Safeguards Rule / WISP summary', hours: [8, 30], costUsd: [0, 3000], days: [7, 30], note: 'Tax preparers and CPA firms are financial institutions under 16 CFR 314; vendor oversight is mandatory. Sources conflict on small-firm exceptions; cite the rule text. [design]' },
  cjis_addendum: { label: 'CJIS security addendum (police data)', hours: [4, 20], costUsd: [0, 2000], days: [14, 60], note: 'Needed when police records are in scope; background checks for staff with access. [design]' },
  mls_data_use_review: { label: 'MLS / association data-use review', hours: [4, 12], costUsd: [0, 0], days: [14, 42], note: 'Licensed-data-use review for tools touching MLS or IDX data; 2-6 weeks of delay. [design]' },
  epic_vendor_review: { label: 'Epic integration / Showroom security review', hours: [100, 400], costUsd: [0, 25000], days: [56, 112], note: 'Showroom listing 8-16 weeks (nirmitee, undated); other blogs 3-9 months and 6-18 months for bidirectional integration; each hospital still runs its own review. Hours and cost [design].' },
  supplier_audit: { label: 'Pharma supplier qualification audit', hours: [16, 60], costUsd: [0, 3000], days: [30, 120], note: 'Supplier questionnaire (100-300 questions) plus remote or on-site audit; 2-6 months for a startup [design]; must finish before purchase (ISPE-style guidance via IntuitionLabs).' },
  quality_agreement: { label: 'Quality agreement (right to audit, change notification)', hours: [10, 40], costUsd: [0, 5000], days: [30, 120], note: 'Standard in GxP buying. [design]' },
  csv_validation_package: { label: 'Validation package (URS traceability, Part 11 evidence, release notes)', hours: [80, 300], costUsd: [5000, 40000], days: [60, 180], note: 'FDA CSA guidance is risk-based; issue date unconfirmed (secondary says 2026-02-03); verify on fda.gov. Cost and hours [design].' },
  cip013_supplier_review: { label: 'NERC CIP-013 supplier risk review', hours: [20, 80], costUsd: [0, 0], days: [30, 120], note: 'Triggered for products touching BES Cyber Systems; a written scope/boundary statement avoids it for non-OT products. CIP-013-4 draft in ballot Oct 2026; verify status. [design]' },
  ot_security_questionnaire: { label: 'OT network / remote-access questionnaire', hours: [10, 40], costUsd: [0, 0], days: [14, 60], note: 'Plant IT and controls engineers ask for network diagrams and an outbound-only collector story. [design]' },
  franchisor_vendor_approval: { label: 'Franchisor / brand approved-vendor application', hours: [20, 80], costUsd: [0, 5000], days: [60, 180], note: 'Often 60+ days; may need FDD Item 8 disclosure, additional-insured certificate, data-access and audit-rights clauses. [design]' },
  child_safety_policy: { label: 'Child-data and safety policy', hours: [2, 8], costUsd: [0, 0], days: [3, 14], note: 'Churches and children\'s ministry ask who can see child records and how data is deleted. [design]' },
  nonprofit_verification: { label: '501(c)(3) letter / TechSoup verification', hours: [0.5, 2], costUsd: [0, 0], days: [3, 14], note: 'For nonprofit pricing; many funders restrict software spend. [design]' },
};

// ---------------------------------------------------------------------------------------------
// CROSS_SEGMENT (applies to every segment unless the segment overrides it)
// status: primary | secondary | unverified | design.  Conflicts are resolved in docs/research/buyer-segments.md.
// ---------------------------------------------------------------------------------------------
export const CROSS_SEGMENT = {
  buyingGroup: {
    gartnerRange: [5, 16],
    forresterInternalExternal: [13, 9],
    starrBySize: { smb: 3.1, midMarket: 6.8, enterprise: 11.2 },
    gongWonDeal50kTo250kMinStakeholders: 10,
    // Planning size by ACV band [design], anchored on Starr by size and Gartner 5-16; collapsed for owner-led segments.
    byAcv: { lt5k: [1, 2], k5to25: [2, 4], k25to100: [4, 7], gt100: [7, 12] },
    genAiPurchaseMultiplier: 2,
    sources: [
      { claim: 'Buying groups range from 5 to 16 people across up to 4 functions (survey of 632 buyers, fielded Aug-Sep 2024)', url: 'https://www.gartner.com/en/newsroom/press-releases/2025-05-07-gartner-sales-survey-finds-74-percent-of-b2b-buyer-teams-demonstrate-unhealthy-conflict-during-the-decision-process', date: '2025-05-07', status: 'primary' },
      { claim: 'Average 13 internal stakeholders and 9 external participants per B2B purchase; GenAI features roughly double the group', url: 'https://www.forrester.com/report/the-state-of-business-buying-2026/RES186878', date: '2026', status: 'secondary' },
      { claim: 'SMB 3.1, mid-market 6.8, enterprise 11.2 people (attributed to Forrester 2024; conflicts with a 14-23 figure above $1M on the same site)', url: 'https://www.thestarrconspiracy.com/insights/benchmarks/b2b-buying-committee-benchmarks-2025', date: '2025', status: 'unverified' },
      { claim: 'A won $50K-$250K deal typically involves at least 10 stakeholders; won deals have at least 3 buyer participants in meetings', url: 'https://www.gong.io/blog/when-and-how-to-multi-thread-when-selling-to-executives', date: '2026', status: 'secondary' },
    ],
  },
  consensus: {
    unhealthyConflictShare: 0.74,
    consensusQualityLift: 2.5,
    sources: [{ claim: '74% of buyer teams show unhealthy conflict; consensus teams are 2.5x more likely to rate the deal high quality', url: 'https://www.gartner.com/en/newsroom/press-releases/2025-05-07-gartner-sales-survey-finds-74-percent-of-b2b-buyer-teams-demonstrate-unhealthy-conflict-during-the-decision-process', date: '2025-05-07', status: 'primary' }],
  },
  noDecisionRate: {
    planning: [0.4, 0.5], // [design] share of qualified opportunities that end without a purchase
    claims: [0.4, 0.5, 0.59], // Gartner ~40%, "roughly half", Forrester 59%: all secondary, none traced to a primary report
    sources: [
      { claim: 'About 40% of B2B buying journeys end in no decision (attributed to Gartner)', url: 'Mediafly blog', date: 'undated', status: 'unverified' },
      { claim: '59% of purchase processes end in no decision (attributed to Forrester)', url: 'Sproutworth blog', date: 'undated', status: 'unverified' },
      { claim: 'About 40% of considered deals abandoned for lack of group agreement (LinkedIn and Bain, via CB News)', url: 'https://www.cbnews.fr/node/99404', date: 'undated', status: 'unverified' },
    ],
  },
  multithreadWinLift: {
    reported: 1.3, // +130% win rate for multithreaded deals over $50K (Gong Labs, ~1.8M opportunities closed 2024), correlational
    wonVsLostContacts: 1.67, // closed-won deals show 67% more buyer contacts; some summaries say "2x", which conflicts
    wonDealSellingTeam: 6.7,
    // Simulator multiplier on close probability by number of distinct engaged buyer contacts. The reported +130% is a
    // correlation (selection: healthy deals attract more contacts), so the game uses a capped, discounted effect. [design]
    simWinMultByContacts: { 1: 0.7, 2: 1.0, 3: 1.15, 4: 1.25 },
    rejectedClaims: ['3x multiplier (no primary source)', '73% of champions fail to close (no traceable source)'],
    sources: [
      { claim: 'Multithreaded deals over $50K show about a 130% win-rate lift; closed-won deals show 67% more buyer contacts; won deals average 6.7 selling-team members by end of discovery', url: 'https://www.gong.io/resources/guides/the-data-backed-guide-to-multi-threading-and-team-selling', date: '2025', status: 'secondary' },
    ],
  },
  championLoss: {
    // No verified study. Notes give 10-25% per deal across segments; use a hazard per 90 days of cycle. [design]
    perNinetyDays: [0.06, 0.12],
    note: 'Treat a champion departure as a material risk in any deal longer than about 90 days; "second champion named" is the leading indicator.',
    sources: [{ claim: 'GrowthSpree claims 8% of churn comes from champion change (unknown source)', url: 'GrowthSpree blog', date: 'undated', status: 'unverified' }],
  },
  repFreePreference: {
    share: 0.61, // Gartner 2025: 61% prefer a rep-free experience; 2026 follow-up: 67% (646 buyers, Aug-Sep 2025)
    share2026: 0.67,
    irrelevantOutreachAvoid: 0.73,
    inconsistencyReported: 0.69,
    journeyBeforeSeller: 0.61, // 6sense 2025 [unverified, release returned 403]: first seller contact at 61% of the process, down from 69%
    preferredVendorWins: 0.8, // 6sense 2025 [unverified]: the vendor preferred before first contact wins ~80% of deals
    // Segments with low price and owner buyers are effectively rep-free already (card, trial, marketplace).
    sources: [
      { claim: '61% of B2B buyers prefer an overall rep-free buying experience; 73% avoid suppliers with irrelevant outreach', url: 'https://gartner.com/en/newsroom/press-releases/2025-06-25-gartner-sales-survey-finds-61-percent-of-b2b-buyers-prefer-a-rep-free-buying-experience', date: '2025-06-25', status: 'primary' },
      { claim: '67% rep-free preference in a later survey (646 buyers, Aug-Sep 2025)', url: 'https://www.digitalcommerce360.com/2026/03/17/gartner-b2b-buyers-rep-free-purchasing-ai-reshapes-sales/amp/', date: '2026-03-17', status: 'secondary' },
      { claim: 'Independent research 60/40 vs seller engagement; first seller contact at 61% of the process; preferred vendor wins ~80% (search summaries; release not fetchable)', url: 'https://www.businesswire.com/news/home/20251112018032/en', date: '2025-11-12', status: 'unverified' },
    ],
  },
  securityReviewDelay: {
    // Share of deals where a security review delays closing: Vanta 2025 cited secondhand (78%), unverified.
    reportedShare: 0.78,
    lostDealMissingCertification: 0.33, // unverified (Vanta via DEV Community)
    sources: [{ claim: '78% of companies have had security reviews delay deals; buyers spend about nine working weeks a year on vendor reviews', url: 'https://www.vanta.com/', date: '2025', status: 'unverified' }],
  },
  salesCycleBenchmarks: {
    // General B2B SaaS context, not segment-specific.
    medianDays: 84, // Optifai 939 companies via Ebsta/Pavilion; Bridge Group 91 days; 52 days expansion
    smbMedianDays: 38, midMarketMedianDays: 78,
    winRateMedian: 0.19, // Bridge Group 2024 (down from 23% in 2022), secondary; Gong 2024 ~21%
    sources: [
      { claim: 'Median win rate 19% in 2024, down from 23% in 2022 (Bridge Group, via Everstage)', url: 'https://www.everstage.com/sales-compensation/saas-sales-compensation-benchmarks', date: '2025', status: 'unverified' },
      { claim: 'SMB median cycle 38 days, mid-market 78 days (aggregated Pavilion, Bridge, SaaStr)', url: 'https://knowledgelib.io/business/sales-ops/sales-metrics-benchmarks/2026', date: '2026', status: 'secondary' },
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// BUYER_SEGMENTS
// Shape per segment: see docs/research/buyer-segments.md. Seasonality: `busy` = months with the most buying activity
// (good months to sell), `slow` = months when buyers are unreachable or frozen.
// Scenario `effect`: cycleMult x sampled cycle, winMult x close probability, needsRole = a committee role that must be
// engaged or the deal stalls/loses, paperwork = extra PAPERWORK ids, stallDays = extra idle days [min, max].
// ---------------------------------------------------------------------------------------------

/**
 * Committee role: R(role, titles, [min,max] count, influence, canBlock, presentProb, concerns, minAcv = 0).
 * minAcv: the role only joins deals of at least this ACV (presence ramps down below it); 0 = any deal size.
 */
const R = (role, titles, count, influence, canBlock, presentProb, concerns, minAcv = 0) => ({ role, titles, count, influence, concerns, canBlock, presentProb, minAcv });
/** Scenario: sc(id, label, prob, description, howToHandle, effect). */
const sc = (id, label, prob, description, howToHandle, effect = {}) => ({ id, label, prob, description, howToHandle, effect });
/** Paperwork requirement: pw(id, prob, minAcv) applies only to deals of at least minAcv. */
const pw = (id, prob, minAcv = 0) => ({ id, prob, minAcv });
/** Procurement with defaults for segments that buy on a card and have no formal process. */
const proc = (o = {}) => ({
  cardLimit: 0, quoteThreshold: NEVER, rfpThreshold: NEVER, coopContracts: [],
  boardApproval: { prob: 0, aboveUsd: NEVER }, fiscalYearStartMonth: 1, budgetSetMonths: [10, 11, 12],
  paymentTermsDays: 0, poRequired: false, paperwork: [], ...o,
});
const M = (primary, critical, why) => ({ primary, critical, why });

export const BUYER_SEGMENTS = [
  // ===== owner_smb ==========================================================================
  {
    id: 'retail_shops', label: 'Mom-and-pop independent retail', group: 'owner_smb', models: ['smb'], employees: [1, 15],
    keywords: ['retail', 'boutique', 'gift shop', 'shop', 'florist', 'bookstore', 'hardware store', 'pet store', 'bike shop', 'specialty food', 'home decor', 'apparel store', 'thrift', 'convenience store'],
    examples: ['boutique apparel shop', 'florist', 'bike shop', 'pet store', 'independent bookstore'],
    committee: [
      R('economic_buyer', ['Owner', 'Proprietor'], [1, 1], 0.9, true, 0.98, ['cash flow', 'setup time', 'does it replace something I already do']),
      R('champion', ['Store manager', 'Long-tenured employee'], [0, 1], 0.5, true, 0.25, ['is it easy for the floor staff', 'will I have to retrain people']),
      R('owner_spouse', ['Spouse', 'Business partner'], [0, 1], 0.6, true, 0.35, ['monthly cost above ~$100', 'risk of another subscription']),
      R('finance', ['Outside bookkeeper', 'CPA'], [0, 1], 0.4, true, 0.5, ['export and reconciliation', 'sales-tax reports']),
      R('user', ['Sales associate', 'Part-timer'], [0, 3], 0.2, false, 0.6, ['speed at the register', 'one more thing to learn']),
      R('technical', ['Owner (is the IT department)'], [0, 1], 0.1, false, 0.05, ['works out of the box']),
    ],
    buyerIsUserProb: 0.6,
    cycleDays: { lt5k: [1, 14], k5to25: [14, 45], k25to100: [45, 120], gt100: [120, 270] },
    winRateQualified: 0.27, acvRange: [200, 1500],
    procurement: proc({ cardLimit: 2000, budgetSetMonths: [11, 12, 1], paperwork: [pw('w9', 0.03)] }),
    channels: {
      works: ['in-person visits in quiet hours', 'chamber of commerce and Main Street merchant associations', 'peer referral from neighbouring shops', 'Shopify or Square app marketplace listing', 'local merchant Facebook groups'],
      fails: ['cold email', 'enterprise-style webinars', 'generic paid search', 'phone calls during open hours'],
    },
    bestContact: { channel: 'in_person', times: 'Tue-Thu 9:30-11:00 or 14:00-16:00; avoid Saturdays and the Nov-Dec rush' },
    methodology: M('value_selling', ['pain', 'metrics'], 'A $30/month decision needs three questions and a before/after number, not BANT. Price as less than a coffee a day; offer a trial or 30-day refund.'),
    scenarios: [
      sc('staff_user', 'Buyer is not the user', 0.35, 'Staff must live in the tool but the owner decides.', 'Demo for the employee on the floor for 15 minutes; ask the owner to commit to a 14-day trial with that employee.', { cycleMult: 1.3, winMult: 0.85, needsRole: 'user' }),
      sc('spouse_veto', 'Spouse or partner vetoes', 0.2, 'A partner objects to the spend.', 'Ask for a joint 15-minute call and send a one-page cost summary.', { winMult: 0.8, needsRole: 'owner_spouse', stallDays: [3, 10] }),
      sc('bookkeeper_block', 'Bookkeeper says the export breaks reconciliation', 0.15, 'Outside bookkeeper blocks on exports.', 'Get a sample export from the bookkeeper\'s tool before the trial; offer CSV or QuickBooks-compatible export; do not argue.', { winMult: 0.7, needsRole: 'finance', stallDays: [3, 14] }),
      sc('think_about_it', 'I\'ll think about it', 0.4, 'The owner goes silent.', 'One follow-up in 7 days with a specific ask; closed-lost after 21 days; revisit next season.', { winMult: 0.6, stallDays: [7, 21] }),
      sc('bottom_up', 'Employee started on a free tier', 0.1, 'An employee adopted a free tier and the owner must pay to upgrade.', 'Treat as a conversion: show usage they already have and price against saved time.', { cycleMult: 0.6, winMult: 1.4 }),
    ],
    objections: ['We already do this on paper or in Square.', 'Is this going to lock me in?', 'I can\'t afford another subscription.', 'My nephew can set it up.'],
    churnAnnual: 0.3,
    seasonality: { busy: [9, 10, 1], slow: [7, 8, 11, 12], note: 'Holiday rush freezes owners Nov-Dec; January tax-season cash crunch spikes churn; tourist towns are busy in Jul-Aug.' },
    soloFounderFit: 0.6,
    sourced: [
      'SBA: 36.2 million US small businesses, ~46% of private-sector employment (https://advocacy.sba.gov/?p=30239, 2025)',
      'Census 2022 nonemployer statistics published 2024-12-12 (https://www.census.gov/newsroom/press-releases/2024/2022-nonemployer-statistics.html)',
      'i2c/PYMNTS survey of 583 SMBs: nearly half say credit limit influences which card is top of wallet (https://www.i2cinc.com/smbs-rely-on-business-and-personal-credit-cards-for-growth/, 2025)',
    ],
  },
  {
    id: 'restaurants', label: 'Independent restaurants and small groups', group: 'owner_smb', models: ['smb'], employees: [3, 400],
    keywords: ['restaurant', 'cafe', 'coffee shop', 'bakery', 'bistro', 'pizzeria', 'pizza', 'taqueria', 'diner', 'bar and grill', 'food truck', 'brewery', 'catering', 'quick service', 'qsr', 'hospitality group'],
    examples: ['neighbourhood bistro', 'taqueria', 'pizza shop', 'three-restaurant hospitality group'],
    committee: [
      R('economic_buyer', ['Owner', 'GM'], [1, 1], 0.9, true, 0.97, ['downtime during service', 'hardware cost', 'reliability']),
      R('user', ['Chef', 'Kitchen lead'], [0, 1], 0.4, true, 0.5, ['KDS and inventory fit the line', 'will refuse to use it']),
      R('champion', ['Front-of-house manager'], [0, 1], 0.4, true, 0.6, ['scheduling, tips, reservations']),
      R('finance', ['Bookkeeper', 'CPA'], [0, 1], 0.5, true, 0.5, ['payroll and tip reporting', 'accounting integration']),
      R('group_ops', ['VP Operations', 'CFO'], [0, 1], 0.8, true, 0.12, ['standard stack across units', 'cost per unit']),
      R('technical', ['Director of IT'], [0, 1], 0.5, true, 0.1, ['POS and payments integration']),
      R('franchisor', ['Brand approval'], [0, 1], 0.8, true, 0.05, ['approved-vendor list']),
    ],
    buyerIsUserProb: 0.6,
    cycleDays: { lt5k: [1, 14], k5to25: [14, 45], k25to100: [45, 120], gt100: [120, 240] },
    winRateQualified: 0.22, acvRange: [1000, 6000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 10000, budgetSetMonths: [10, 11, 12],
      paperwork: [pw('w9', 0.4), pw('pci_attestation', 0.5), pw('coi_insurance', 0.2), pw('soc2_type2', 0.35, 25000), pw('dpa', 0.35, 25000)],
    }),
    channels: {
      works: ['in-person visits 14:00-16:00', 'state restaurant associations', 'regional trade shows', 'peer referral between owners', 'POS marketplaces (Toast, Square)', 'accounting and payroll integrations'],
      fails: ['cold email to owners', 'LinkedIn for independents', 'webinars', 'generic paid search'],
    },
    bestContact: { channel: 'in_person', times: 'Mon-Tue mornings or 14:00-16:00; never Fri/Sat evenings' },
    methodology: M('value_selling', ['economicBuyer', 'pain', 'metrics'], 'Anchor on food-cost or labour percentage. Find the owner before the demo, never demo to the GM and assume the owner agreed. MEDDPICC for groups.'),
    scenarios: [
      sc('gm_not_owner', 'Buyer is not the user', 0.4, 'GM or chef lives in the tool; owner or group decides.', 'Demo to both; let the user run a live scenario; ask the owner to set the trial.', { cycleMult: 1.25, winMult: 0.85, needsRole: 'economic_buyer' }),
      sc('corporate_no_new_vendor', 'Group corporate blocks', 0.15, 'Unit owner says yes, group says no new vendor.', 'Get the group IT or VP Ops contact early; offer a single-unit 60-day pilot.', { cycleMult: 1.5, winMult: 0.7, needsRole: 'group_ops', paperwork: ['security_questionnaire'] }),
      sc('pos_integration_missing', 'POS integration unsupported', 0.2, 'The existing POS cannot integrate.', 'Check the integration list before the first call; drop the deal early if missing.', { winMult: 0.3, stallDays: [7, 21] }),
      sc('franchisor_approval', 'Franchisor approval required', 0.05, 'Franchised unit needs brand approval (30% of franchisees).', 'Read the franchise agreement first; start the franchisor vendor-approval process (60+ days).', { cycleMult: 2, winMult: 0.5, paperwork: ['franchisor_vendor_approval'] }),
      sc('closes_or_sold', 'Restaurant closes or changes hands', 0.08, 'Business closes during the trial.', 'Put a closure clause in the order; re-pitch the new owner.', { winMult: 0.2 }),
    ],
    objections: ['Toast/Square already does this.', 'I can\'t be down during service.', 'Our POS vendor locked us in.', 'The corporate office decides.'],
    churnAnnual: 0.2,
    seasonality: { busy: [9, 10, 1, 2], slow: [6, 7, 8, 12], note: 'Independents fell 2.3% in 2025 (Technomic), so closure churn is structural. December service freezes buying.' },
    soloFounderFit: 0.5,
    sourced: [
      'Technomic: 412,498 independent restaurant locations at end of 2025 vs 422,001 in 2024 (-2.3%) (https://www.nrn.com/independent-restaurants/the-independent-restaurant-sector-shrunk-by-2-3-in-2025, 2026-02-24)',
      'BlueStar survey of 72 operators: >50% used their POS for 5+ years and nearly half would not consider changing; at least 12 said the POS decision was not theirs (https://nation.bluestarinc.com/articles/we-asked-72-restaurant-owners-about-their-point-of-sale-system, 2023-02-15)',
      'NRA: restaurant industry employs 15.9 million (https://restaurant.org/research-and-media/media/press-releases/restaurant-industry-poised-for-growth-in-2025-industry-expected-to-employ-15-9-million-people-and-r/, 2025-02-06)',
    ],
  },
  {
    id: 'salons_fitness', label: 'Salons, spas and boutique fitness studios', group: 'owner_smb', models: ['smb'], employees: [1, 30],
    keywords: ['salon', 'spa', 'barber', 'barbershop', 'nail', 'hair', 'beauty', 'med spa', 'massage', 'yoga', 'pilates', 'barre', 'boutique fitness', 'fitness studio', 'gym', 'cycling studio', 'tanning'],
    examples: ['2-chair hair salon', 'day spa', 'yoga studio', 'HIIT studio with 3 locations'],
    committee: [
      R('economic_buyer', ['Owner', 'Studio owner'], [1, 1], 0.9, true, 0.97, ['payments', 'cost per booking', 'switching risk']),
      R('champion', ['Front-desk manager', 'Receptionist'], [1, 2], 0.5, true, 0.85, ['booking UX', 'check-in', 'reports']),
      R('user', ['Lead stylist', 'Lead trainer', 'Studio manager'], [0, 1], 0.4, true, 0.5, ['runs the schedule', 'client lists']),
      R('end_user_group', ['Booth renters', 'Instructors'], [3, 20], 0.2, true, 0.35, ['will leave with their client lists', 'per-renter pricing']),
      R('finance', ['Bookkeeper', 'Accountant'], [0, 1], 0.4, true, 0.4, ['payroll and commission exports']),
      R('franchisor', ['Franchise corporate'], [0, 1], 0.8, true, 0.08, ['brand-approved vendor list']),
    ],
    buyerIsUserProb: 0.6,
    cycleDays: { lt5k: [1, 14], k5to25: [14, 45], k25to100: [45, 120], gt100: [120, 240] },
    winRateQualified: 0.25, acvRange: [300, 6000],
    procurement: proc({
      cardLimit: 3000, budgetSetMonths: [11, 12, 1],
      paperwork: [pw('w9', 0.2), pw('pci_attestation', 0.5), pw('security_questionnaire', 0.2, 25000), pw('dpa', 0.2, 25000)],
    }),
    channels: {
      works: ['Instagram and TikTok', 'regional owner networks and Facebook groups', 'in-person neighbourhood visits', 'regional beauty expos and fitness conventions', 'booking marketplace listings', 'product-supplier partnerships'],
      fails: ['cold email', 'LinkedIn', 'generic paid search for "salon software"', 'phone calls during appointment hours'],
    },
    bestContact: { channel: 'in_person', times: 'Mon-Tue 9:30-11:00; Sunday evenings for studios; avoid 10:00-19:00 for salons' },
    methodology: M('value_selling', ['metrics', 'pain', 'champion'], 'Revenue-per-chair or per-class and no-show counts make the number. SPIN works for the owner conversation. The front-desk manager\'s buy-in is a must.'),
    scenarios: [
      sc('desk_loves_owner_worries', 'Front desk loves it, owner worries about cost', 0.35, 'Manager champions, owner hesitates on price.', 'Quantify no-show savings; 30-day trial with the manager reporting one number.', { winMult: 0.85, needsRole: 'economic_buyer' }),
      sc('renters_refuse', 'Booth renters refuse to move clients', 0.25, 'Applies in booth-rental salons.', 'Offer per-renter plans or a shared calendar; do not sell to the owner until renters agree.', { winMult: 0.6, needsRole: 'end_user_group', stallDays: [7, 21] }),
      sc('contract_lock_in', 'Mindbody or Vagaro contract lock-in', 0.3, 'Incumbent contract has 12-24 months left.', 'Ask the end date; plan the switch for the renewal month; offer data-import help.', { cycleMult: 1.6, winMult: 0.7 }),
      sc('franchise_list', 'Franchise brand sets a vendor list', 0.1, 'Corporate approves tools.', 'Check the franchise manual first; go to vendor approval (60+ days) or sell to independents only.', { cycleMult: 2, winMult: 0.5, paperwork: ['franchisor_vendor_approval'] }),
      sc('seasonal_freeze', 'Seasonal spending pause', 0.2, 'Fitness in summer, salons after wedding season.', 'Time the trial for January or September; offer a seasonal pause instead of cancellation.', { cycleMult: 1.3, stallDays: [14, 45] }),
    ],
    objections: ['We\'re on Mindbody/Vagaro and it\'s fine.', 'Clients won\'t book online.', 'I can\'t afford another subscription.', 'Switching will confuse my staff.'],
    churnAnnual: 0.22,
    seasonality: { busy: [1, 2, 3, 8, 9], slow: [7, 11], note: 'Fitness resolutions in January; wedding planning Feb-Mar for salons; holiday rush freezes salons late Nov-early Dec. California AB 5 changed booth-renter status for nail techs from 2025-01-01.' },
    soloFounderFit: 0.6,
    sourced: [
      '84,176 employer salon establishments with 391,064 employees in 2023, plus 838,264 nonemployer businesses (https://startbusinessbystate.com/salon-industry-statistics/, undated, third-party Census compilation)',
      'DaySmart/Researchscape survey of 590+ owners: scheduling, automated communication and POS top priorities; budget and expertise top barriers (https://www.americanspa.com/business/study-shows-56-salons-spas-use-business-management-software, 2019)',
      'Mindbody-class tools quoted at $99-$699 per location per month, 24-month standard term (https://withorbital.com/data/software/mindbody/, undated, unverified)',
    ],
  },
  {
    id: 'trades', label: 'Trades and specialty subcontractors (roofing, HVAC, plumbing, electrical)', group: 'owner_smb', models: ['smb'], employees: [2, 50],
    keywords: ['roofing', 'roofer', 'hvac', 'plumbing', 'plumber', 'electrician', 'electrical contractor', 'heating and cooling', 'air conditioning', 'home services', 'field service', 'landscaping', 'lawn care', 'pest control', 'handyman', 'remodeling', 'garage door', 'painting contractor', 'cleaning service', 'construction', 'contractor', 'general trades'],
    examples: ['6-truck residential HVAC shop', '12-person roofing crew', '3-van plumbing company', '20-person electrical sub'],
    committee: [
      R('economic_buyer', ['Owner', 'President'], [1, 1], 0.9, true, 0.98, ['cash flow', 'will this pay for itself', 'ticket size']),
      R('champion', ['Office manager', 'Dispatcher', 'Service coordinator'], [1, 2], 0.5, true, 0.95, ['scheduling', 'invoicing', 'less double entry']),
      R('user', ['Technician', 'Estimator', 'Salesperson'], [2, 15], 0.2, true, 0.7, ['phone app friction', 'extra clicks']),
      R('finance', ['Outside bookkeeper', 'CPA'], [0, 1], 0.4, true, 0.3, ['QuickBooks sync', 'reconciling']),
      R('owner_spouse', ['Co-owner spouse who runs the books'], [0, 1], 0.3, true, 0.25, ['monthly cost', 'risk']),
      R('rollup_corporate', ['Platform CFO', 'Ops VP'], [0, 1], 0.7, true, 0.08, ['standard stack', 'security']),
    ],
    buyerIsUserProb: 0.35,
    cycleDays: { lt5k: [1, 21], k5to25: [14, 45], k25to100: [45, 120], gt100: [90, 180] },
    winRateQualified: 0.22, acvRange: [600, 5000],
    procurement: proc({
      cardLimit: 5000, budgetSetMonths: [10, 11, 12],
      paperwork: [pw('w9', 0.1), pw('coi_insurance', 0.05), pw('security_questionnaire', 0.5, 25000), pw('soc2_type2', 0.3, 25000), pw('dpa', 0.4, 25000)],
    }),
    channels: {
      works: ['peer referral in local trade groups and Facebook groups', 'QuickBooks / Jobber / Housecall Pro / ServiceTitan integration marketplaces', 'in-person demo at the shop', 'trade association events (PHCP, ACCA, state contractor groups)'],
      fails: ['cold email with generic copy', 'LinkedIn for owners of firms under 20 staff', 'big booths with no offer'],
    },
    bestContact: { channel: 'phone', times: 'Early morning before dispatch or late evening; avoid peak demand days' },
    methodology: M('value_selling', ['pain', 'economicBuyer', 'champion'], 'Light MEDDIC: owner is the economic buyer, office manager the champion. 20-minute owner demo tied to dollars per month; test the QuickBooks sync in the first demo.'),
    scenarios: [
      sc('office_yes_owner_no', 'Office manager loves it, owner says no', 0.35, 'Buyer is not the user.', 'Ask for a 20-minute owner session; show cost vs one saved lost call per month; offer month-to-month.', { winMult: 0.8, needsRole: 'economic_buyer', stallDays: [3, 10] }),
      sc('champion_dropped', 'Champion leaves or is dropped in a slow season', 0.12, 'Office manager is cut.', 'Multi-thread to the owner early; hold a second champion (lead tech or bookkeeper).', { winMult: 0.6, stallDays: [7, 30] }),
      sc('quickbooks_block', 'Bookkeeper blocks on QuickBooks sync', 0.15, 'Sync fails or is feared.', 'Demo the sync live; get the bookkeeper to confirm in writing before the trial ends.', { winMult: 0.7, needsRole: 'finance' }),
      sc('bottom_up_techs', 'Techs used a free tier; owner must convert', 0.2, 'Bottom-up adoption.', 'Convert with a usage report and a single-price plan.', { cycleMult: 0.6, winMult: 1.4 }),
      sc('rollup_acquires', 'PE roll-up buys the firm mid-deal', 0.1, 'Platform procurement takes over.', 'Expect a vendor form and security questionnaire; keep a SOC 2 status page and a standard DPA.', { cycleMult: 2, winMult: 0.6, needsRole: 'rollup_corporate', paperwork: ['security_questionnaire', 'dpa', 'w9'] }),
      sc('seasonal_stall', 'Seasonal stall', 0.3, 'Summer HVAC rush, storm season for roofing.', 'Book demos in shoulder months; offer a 60-day start.', { cycleMult: 1.3, stallDays: [14, 45] }),
    ],
    objections: ['We already use ServiceTitan / Jobber / Housecall Pro.', 'I\'m too busy to learn another system.', 'I can\'t afford another monthly fee.', 'My guys won\'t use it.', 'QuickBooks won\'t sync.', 'The last software was a waste.'],
    churnAnnual: 0.32,
    seasonality: { busy: [1, 2, 3, 9, 10], slow: [6, 7, 8, 12], note: 'HVAC search demand swings 250-600% peak to valley; owners are too busy in summer to buy; cash is tight in fall and winter after the busy season.' },
    soloFounderFit: 0.6,
    sourced: [
      'Costbench: median annual cost $699 for Jobber (46 deals) and $4,400 for Housecall Pro (11 deals), small samples (https://www.costbench.com/compare/housecall-pro-vs-jobber/, 2026)',
      'TechCrunch: many HVAC owners still use pen and paper and PE roll-ups are consolidating the trades (https://techcrunch.com/2024/09/30/airship-wants-to-build-better-sales-tools-for-hvac-contractors, 2024-09-30)',
      'WebFX via Stacker: HVAC search demand swings 250-600% peak to valley (https://krdo.com/stacker-small-business/2026/02/19/seasonal-search-shifts-in-home-services-demand-what-spikes-when-and-how-to-stay-booked-year-round/, 2026-02-19)',
    ],
  },
  {
    id: 'trucking', label: 'Trucking and logistics fleets (owner-operators to mid-size carriers)', group: 'owner_smb', models: ['smb'], employees: [1, 500],
    keywords: ['trucking', 'fleet', 'carrier', 'freight', 'logistics', 'owner-operator', 'owner operator', 'truck', 'hauling', 'dispatch', 'flatbed', 'reefer', 'towing', 'drayage', 'last mile delivery'],
    examples: ['single-truck flatbed owner-operator', '6-truck reefer carrier with a dispatcher', '40-truck dry van fleet with a safety manager'],
    committee: [
      R('economic_buyer', ['Owner-operator', 'Owner'], [1, 1], 0.9, true, 0.98, ['cash per week', 'compliance time']),
      R('champion', ['Dispatcher', 'Ops manager'], [1, 3], 0.5, true, 0.5, ['load tracking', 'sharing with drivers']),
      R('compliance', ['Safety manager', 'DQ-file clerk'], [0, 1], 0.5, true, 0.3, ['DOT', 'ELD', 'drug testing', 'audits']),
      R('end_user_group', ['Company drivers', 'Owner-op drivers'], [2, 100], 0.2, true, 0.6, ['app friction', 'pay']),
      R('finance', ['Bookkeeper', 'Controller'], [0, 1], 0.4, true, 0.3, ['payments', 'factoring', 'IFTA', 'tolls']),
      R('factor', ['Factoring onboarding team'], [0, 1], 0.4, true, 0.15, ['payee name and EIN match', 'payment flow']),
      R('technical', ['IT director'], [0, 1], 0.3, true, 0.05, ['data and integrations']),
      R('customer', ['Shipper or broker vendor team'], [0, 1], 0.5, true, 0.1, ['their portal and carrier requirements']),
    ],
    buyerIsUserProb: 0.6,
    cycleDays: { lt5k: [1, 14], k5to25: [14, 60], k25to100: [60, 150], gt100: [90, 240] },
    winRateQualified: 0.25, acvRange: [150, 6000],
    procurement: proc({
      cardLimit: 3000, budgetSetMonths: [10, 11, 12, 1], paymentTermsDays: 0,
      paperwork: [pw('w9', 0.3), pw('coi_insurance', 0.4, 10000), pw('security_questionnaire', 0.3, 25000), pw('dpa', 0.3, 25000)],
    }),
    channels: {
      works: ['owner-operator Facebook groups, trucking YouTube and podcasts, truck-stop forums', 'integrations with factoring companies, load boards, ELD and TMS products', 'peer referral through dispatch services', 'LinkedIn outreach to small-carrier owners and ops managers'],
      fails: ['enterprise-style demos to owner-operators', 'sponsored "best TMS" pages as the sole channel', 'paid search for single-truck owners'],
    },
    bestContact: { channel: 'phone', times: 'Slow freight months (Jan-Feb); avoid Q4 peak and holidays' },
    methodology: M('value_selling', ['pain', 'metrics', 'champion'], 'Simple dollar ROI (hours saved x rate); Sandler-style pain-first questions fit a fast-buying owner. MEDDIC-lite for mid-size fleets with safety and finance mapped on call one.'),
    scenarios: [
      sc('compliance_solved_elsewhere', 'Owner-op buys then churns', 0.2, 'One compliance issue resolved elsewhere ends the need.', 'Put the tool in the compliance calendar, not only the dispatch flow.', { winMult: 0.9 }),
      sc('safety_blocks', 'Mid-size safety director blocks on DQ-file or ELD integration', 0.25, 'Integration gap.', 'Map the integration on the first call; provide a sandbox.', { winMult: 0.7, needsRole: 'compliance', stallDays: [7, 30] }),
      sc('driver_adoption', 'Driver app adoption fails', 0.3, 'Small-fleet drivers will not use it.', 'Pilot with two drivers and a pay-linked feature; price per truck.', { winMult: 0.7, needsRole: 'end_user_group' }),
      sc('payee_mismatch', 'Factoring or payee-name mismatch stalls onboarding', 0.15, 'Legal name and EIN do not match FMCSA.', 'Collect the W-9 and factor letter early; match legal names.', { stallDays: [5, 21], paperwork: ['w9'] }),
      sc('shipper_portal', 'Shipper or broker mandates its portal', 0.15, 'Their portal may replace your tool.', 'Check before the demo; ask whether the portal replaces or adds to your tool.', { winMult: 0.5 }),
      sc('freight_downturn', 'Freight downturn cuts budgets', 0.2, 'ATA revenue down 10% in 2024.', 'Monthly pricing and a per-truck tier that scales down.', { winMult: 0.75, stallDays: [14, 45] }),
    ],
    objections: ['I\'m just one truck, I don\'t need software.', 'Excel and QuickBooks are fine.', 'Who pays for the driver app?', 'My last TMS was a waste.', 'I\'ll pay per load, not per month.'],
    churnAnnual: 0.3,
    seasonality: { busy: [1, 2], slow: [10, 11, 12], note: 'Freight peak in Q4 and the holidays leaves owners no time; evaluate in Jan-Feb. Owner-operators churn when freight drops.' },
    soloFounderFit: 0.6,
    sourced: [
      'ATA: 91.5% of carriers run 10 or fewer trucks, 99.3% under 100; industry revenue $906B in 2024 vs $1.004T in 2023 (https://www.truckersnews.com/news/article/15754113/briefly-atas-american-trucking-trends-report-now-available, 2025)',
      'Fleetworthy 2025 survey (300 respondents, vendor): 35% of owner-operators considered ceasing operations because of compliance workload; 22% spend 10+ hours a month on it (https://fleetworthy.com/?p=7333, 2025-01)',
      'Tech.co 2025: 48% of owner-operators changed their business model for new technology vs 63% of logistics managers (https://tech.co/article/logistics/logistics-report-2025, 2025)',
    ],
  },
  // ===== company: general contractors =======================================================
  {
    id: 'general_contractors', label: 'General contractors and mid-size construction firms', group: 'company', models: ['smb', 'ent'], employees: [50, 1000],
    keywords: ['general contractor', 'construction', 'construction firm', 'contractor', 'builder', 'homebuilder', 'civil contractor', 'mechanical contractor', 'preconstruction', 'site contractor', 'commercial builder'],
    examples: ['regional commercial GC with 200 staff and 30 active jobs', '400-person mechanical contractor', '600-person civil and site contractor'],
    committee: [
      R('economic_buyer', ['CEO', 'President', 'COO'], [1, 1], 0.7, true, 0.85, ['margin', 'job-cost control', 'rework']),
      R('champion', ['VP Operations', 'VP Preconstruction', 'Director of IT/Ops'], [1, 2], 0.7, true, 1.0, ['fixes a known project pain']),
      R('user', ['Project manager', 'Superintendent', 'Estimator'], [5, 50], 0.3, true, 0.9, ['field use', 'extra paperwork']),
      R('finance', ['CFO', 'Controller'], [1, 2], 0.6, true, 0.8, ['job-cost integration', 'payment terms']),
      R('technical', ['IT director'], [1, 1], 0.5, true, 0.9, ['SSO', 'data', 'integrations']),
      R('security', ['Security analyst'], [0, 1], 0.5, true, 0.5, ['SOC 2', 'questionnaire'], 25000),
      R('legal', ['GC counsel', 'Contracts manager'], [1, 1], 0.3, true, 0.7, ['MSA', 'liability', 'data terms']),
      R('safety', ['Safety director'], [0, 1], 0.4, false, 0.3, ['field-facing tools', 'incident data']),
      R('risk', ['Insurance or risk manager'], [0, 1], 0.3, false, 0.3, ['vendor COI']),
      R('procurement', ['Procurement manager'], [0, 1], 0.3, true, 0.35, ['vendor onboarding', 'PO'], 50000),
    ],
    buyerIsUserProb: 0.25,
    cycleDays: { lt5k: [14, 45], k5to25: [30, 90], k25to100: [90, 180], gt100: [150, 270] },
    winRateQualified: 0.2, acvRange: [10000, 60000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 25000, rfpThreshold: 100000, boardApproval: { prob: 0.1, aboveUsd: 250000 },
      fiscalYearStartMonth: 1, budgetSetMonths: [10, 11, 12], paymentTermsDays: 45, poRequired: true,
      paperwork: [pw('w9', 0.9), pw('coi_insurance', 0.6), pw('vendor_portal', 0.35, 25000), pw('security_questionnaire', 0.55, 25000), pw('sig_lite', 0.3, 25000), pw('soc2_type2', 0.4, 50000), pw('dpa', 0.45, 25000), pw('msa_redlines', 0.6, 25000)],
    }),
    channels: {
      works: ['founder-led sales to VP operations and preconstruction', 'reference customers and peer referral', 'integrations with Procore-class project platforms', 'single-project pilots'],
      fails: ['cold outreach to CEOs with generic pitches', 'trade-show booths without a pilot offer', 'reseller-only plans without a named champion'],
    },
    bestContact: { channel: 'email', times: 'Q4 and Jan-Mar planning season; avoid the first two weeks of December' },
    methodology: M('meddpicc', ['metrics', 'champion', 'decisionProcess', 'paperProcess'], 'Long multi-threaded deals: map economic buyer, champion, paper process and security criteria early; write a mutual action plan with a pilot and success criteria.'),
    scenarios: [
      sc('security_stalls_late', 'Security questionnaire stalls late', 0.35, 'IT gates after the champion is sold.', 'Prepare a security pack, SOC 2 status and DPA before the first demo.', { cycleMult: 1.3, winMult: 0.85, paperwork: ['security_questionnaire', 'dpa'], stallDays: [14, 45] }),
      sc('champion_leaves', 'VP Ops leaves mid-cycle', 0.15, 'Champion departs.', 'Keep a second champion from the project team; re-run the business case with the new owner.', { cycleMult: 1.4, winMult: 0.6, stallDays: [30, 75] }),
      sc('pilot_stalls', 'Pilot works but expansion stalls', 0.3, 'One-project success does not roll out.', 'Agree a success plan with the CFO and a multi-project rollout date.', { cycleMult: 1.3, needsRole: 'finance' }),
      sc('forced_rfp', 'Forced RFP above the company threshold', 0.2, 'Procurement requires a competitive process.', 'Answer once in a reusable template; push for criteria that favour your strengths.', { cycleMult: 1.5, winMult: 0.7, paperwork: ['rfp_response'] }),
      sc('starts_slowdown', 'Budget freeze after a starts slowdown', 0.15, 'Dodge/CMiC: 72% expect negative policy and cost impacts.', 'Offer a smaller initial scope or a deferred start.', { winMult: 0.6, stallDays: [30, 90] }),
    ],
    objections: ['Procore already does this.', 'Our PMs will never use it.', 'Send us your SOC 2 report.', 'We need a three-year price lock.', 'Let\'s revisit next quarter.'],
    churnAnnual: 0.11,
    seasonality: { busy: [10, 11, 1, 2, 3], slow: [6, 7, 8, 12], note: 'Budget and planning season Q4 to March; summer is slow in northern regions; Dec holidays.' },
    soloFounderFit: 0.25,
    sourced: [
      'Construction SaaS averages 147 days to close vs 67 days for general SaaS (https://saashero.net/strategy/construction-saas-pipeline-acceleration/, 2026-09-03, consultant claim, unverified)',
      'Dodge/CMiC: 72% of contractors expect negative impacts from policy and cost pressures (https://www.businesswire.com/news/home/20260504513164/en/New-Study-72-of-Contractors-Expect-Negative-Impacts-from-Policy-and-Cost-Pressures-Yet-Optimism-Holds-for-2026, 2026-05-04)',
      'Subcontractor insurance norms: GL $1M/$2M, auto $1M, umbrella $1M-$5M (https://construction.aca.alkemeins.com/construction/resources/subcontractor-insurance/, 2026-04); software-vendor use is [design]',
    ],
  },

  // ===== health ============================================================================
  {
    id: 'health_practices', label: 'Independent dental, medical and veterinary practices (and DSO sites)', group: 'health', models: ['smb'], employees: [2, 200],
    keywords: ['healthcare', 'health care', 'medical', 'dentist', 'dental', 'orthodontist', 'veterinary', 'veterinarian', 'vet clinic', 'animal hospital', 'medical practice', 'physician practice', 'family medicine', 'chiropractor', 'physical therapy', 'optometry', 'dermatology', 'pediatric', 'clinic', 'dso', 'urgent care'],
    examples: ['solo general dentist', '3-vet small-animal clinic', '2-physician family medicine group', '20-location DSO with central purchasing'],
    committee: [
      R('economic_buyer', ['Owner dentist', 'Owner doctor', 'Owner vet'], [1, 1], 0.9, true, 0.98, ['cost', 'lost revenue during a switch']),
      R('champion', ['Office manager', 'Practice administrator'], [1, 1], 0.7, true, 0.85, ['time to implement', 'staff training']),
      R('user', ['Hygienist', 'Front desk', 'Vet tech', 'MA'], [3, 15], 0.3, true, 0.9, ['speed', 'workflow change']),
      R('owner_spouse', ['Owner\'s spouse (often finance)'], [0, 1], 0.3, true, 0.2, ['cash', 'risk']),
      R('technical', ['Outside IT vendor (MSP)'], [0, 1], 0.4, true, 0.2, ['PMS integrations', 'backups', 'hardware']),
      R('finance', ['Billing coordinator', 'Outside bookkeeper'], [0, 1], 0.3, false, 0.3, ['payments', 'reconciliation']),
      R('dso_hq', ['VP Operations', 'CFO', 'Procurement', 'IT director'], [3, 6], 0.9, true, 0.14, ['standardization', 'cost', 'security questionnaire'], 25000),
    ],
    buyerIsUserProb: 0.35,
    cycleDays: { lt5k: [1, 14], k5to25: [14, 45], k25to100: [60, 150], gt100: [120, 270] },
    winRateQualified: 0.25, acvRange: [1500, 12000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 15000, boardApproval: { prob: 0.1, aboveUsd: 50000 }, budgetSetMonths: [10, 11, 12], paymentTermsDays: 15,
      paperwork: [pw('w9', 0.8), pw('hipaa_baa', 0.6), pw('coi_insurance', 0.3, 25000), pw('security_questionnaire', 0.5, 25000), pw('dpa', 0.2, 25000)],
    }),
    channels: {
      works: ['in-person demos at the practice', 'peer referral from a same-type practice', 'state and local dental/vet society events and study clubs', 'PMS integrations (Dentrix, Eaglesoft, Open Dental, Cornerstone, AVImark, ezyVet)', 'Henry Schein / Patterson / Benco partner programs', 'Facebook groups for dental office managers'],
      fails: ['cold email to office managers', 'LinkedIn to dentists', 'generic paid ads', 'trade-show booths (Chicago Midwinter) except for a strong DSO pipeline'],
    },
    bestContact: { channel: 'phone', times: 'About 7:30-9:30 before patients, or after 17:00' },
    methodology: M('value_selling', ['metrics', 'champion', 'economicBuyer'], 'Lead with the owner\'s money and time (no-shows, staff hours, collections); pilot with one hygienist. MEDDICC with a 2-3 site, 60-day pilot for DSOs.'),
    scenarios: [
      sc('office_yes_owner_no', 'Office manager loves it, owner won\'t sign', 0.35, 'Buyer is not the user.', 'Send an ROI sheet, offer a no-commitment 30-day trial, ask for 15 minutes with the owner.', { winMult: 0.8, needsRole: 'economic_buyer', stallDays: [3, 14] }),
      sc('trial_then_quiet', 'Two-week trial then silence', 0.3, 'Owner goes quiet.', 'Schedule training before the trial ends; ask what would have to be true to sign this week.', { winMult: 0.6, stallDays: [7, 21] }),
      sc('dso_hq_stalls', 'DSO pilot approved, HQ stalls on procurement', 0.2, 'Single-site pilot cannot become a contract.', 'Get the VP Ops to sponsor a security questionnaire early; expect 3-6 months.', { cycleMult: 2, winMult: 0.7, needsRole: 'dso_hq', paperwork: ['security_questionnaire', 'dpa', 'coi_insurance'] }),
      sc('practice_sold', 'Practice sells to a DSO mid-deal', 0.1, 'New owner swaps tools within 12 months.', 'Check contract assignment; re-pitch the DSO.', { winMult: 0.4 }),
      sc('bottom_up_staff', 'Staff use a free tier, owner doesn\'t pay', 0.15, 'Bottom-up adoption.', 'Convert with usage data; offer an annual deal in Q4.', { cycleMult: 0.7, winMult: 1.2 }),
    ],
    objections: ['Our current software is fine.', 'We can\'t afford the downtime.', 'The DSO will decide this.', 'I need to talk to my spouse.'],
    churnAnnual: 0.2,
    seasonality: { busy: [1, 2, 3, 10], slow: [7, 8, 12], note: 'Q4 is the best time to sell annual plans; holidays and summer vacations are slow. Churn spikes at practice sale or retirement.' },
    soloFounderFit: 0.65,
    sourced: [
      'ADA HPI: 72.5% of US dentists were practice owners in 2023 (84.7% in 2005); DSO affiliation 16% in 2024 vs 7.2% in 2015 (https://www.ada.org/resources/research/health-policy-institute/dental-practice-research)',
      'JAVMA via Biltmore Beacon: corporate groups held about half of US domestic vet revenue by 2023 (https://www.biltmorebeacon.com/news/private-equity-is-reshaping-asheville-s-vet-clinics-they-re-circling-me-like-a-vulture/article_b3429631-57fe-45dc-a65b-747d665cc547.html, 2025)',
      'Chicago Midwinter drew 21,000+ attendees in 2024 (https://www.cds.org/2026-midwinter-meeting/)',
      'HIPAA Security Rule update still a proposal; comment period closed 2025-03-07 (vendor article, https://konfirmity.com/blog/hipaa-what-changed-in-2026, 2026-07, unverified)',
    ],
  },
  {
    id: 'hospitals', label: 'Hospitals and health systems', group: 'health', models: ['ent'], employees: [100, 100000],
    keywords: ['hospital', 'healthcare', 'health care', 'health system', 'medical center', 'healthcare system', 'critical access hospital', 'health network', 'integrated delivery network', 'academic medical center', 'community hospital', 'ehr', 'epic integration'],
    examples: ['150-bed community hospital on Epic', '12-hospital regional system', 'academic medical center', '25-bed critical access hospital'],
    committee: [
      R('user', ['RN', 'Clinician', 'Coder', 'Scheduler', 'Nurse manager'], [3, 10], 0.4, true, 0.9, ['workflow', 'time']),
      R('champion', ['Director of operations', 'Service-line leader', 'CNO'], [1, 2], 0.8, true, 1.0, ['outcome for their unit']),
      R('clinical', ['VAC chair (physician)', 'Pharmacy', 'Nursing', 'Supply chain'], [6, 12], 0.9, true, 0.5, ['clinical evidence', 'cost', 'standardization'], 25000),
      R('economic_buyer', ['CFO', 'COO', 'CIO'], [1, 2], 1.0, true, 0.9, ['budget', 'ROI', 'capex vs opex']),
      R('security', ['CISO', 'Security analyst', 'Vendor risk manager'], [1, 3], 0.8, true, 0.95, ['security questionnaire', 'SOC 2', 'pen test']),
      R('privacy', ['Privacy officer', 'HIPAA compliance lead'], [1, 1], 0.7, true, 0.9, ['BAA', 'data flows']),
      R('legal', ['Contracts counsel'], [1, 2], 0.6, true, 0.8, ['indemnity', 'liability cap', 'BAA terms']),
      R('procurement', ['Supply chain director', 'Category manager', 'GPO rep'], [1, 3], 0.7, true, 0.7, ['contract', 'GPO pricing'], 25000),
      R('technical', ['Epic analyst', 'Integration engineer'], [1, 4], 0.7, true, 0.6, ['build effort', 'interface stability']),
      R('finance', ['Finance director', 'Capital committee'], [1, 2], 0.7, true, 0.5, ['capital vs operating budget'], 50000),
    ],
    buyerIsUserProb: 0.1,
    cycleDays: { lt5k: [30, 90], k5to25: [90, 180], k25to100: [180, 365], gt100: [365, 730] },
    winRateQualified: 0.2, acvRange: [20000, 100000],
    procurement: proc({
      cardLimit: 2500, quoteThreshold: 25000, rfpThreshold: 100000, coopContracts: ['Vizient', 'Premier'], boardApproval: { prob: 0.5, aboveUsd: 100000 },
      fiscalYearStartMonth: 7, budgetSetMonths: [3, 4, 5], paymentTermsDays: 45, poRequired: true,
      paperwork: [pw('w9', 1), pw('vendor_portal', 0.8), pw('hipaa_baa', 0.95), pw('coi_insurance', 0.9), pw('security_questionnaire', 0.85), pw('sig_lite', 0.5), pw('soc2_type2', 0.85, 25000), pw('pen_test', 0.6, 25000), pw('dpa', 0.5), pw('bcp_dr_summary', 0.6), pw('epic_vendor_review', 0.5, 25000), pw('msa_redlines', 0.8, 25000), pw('rfp_response', 0.25, 100000)],
    }),
    channels: {
      works: ['clinician champion who sits on the VAC', 'director referral from a peer system', 'single-unit pilot', 'Epic Showroom once listed', 'Epic-certified integration partners', 'state hospital association webinars', 'HIMSS and HFMA only for mature products'],
      fails: ['cold outreach to CIOs', 'whole-system free trials', 'going to the CEO without a champion', 'academic medical centers early'],
    },
    bestContact: { channel: 'email', times: 'Tue-Thu mornings; avoid late Dec and early Jan' },
    methodology: M('meddpicc', ['champion', 'decisionProcess', 'economicBuyer', 'paperProcess'], 'Map the VAC calendar on day one (a missed meeting costs 4-6 weeks), the security gate and the Epic analyst. Value selling for the CFO: payback under 12 months, written pilot success criteria.'),
    scenarios: [
      sc('champion_leaves', 'Champion leaves the hospital', 0.2, 'Sponsor departs.', 'Find a second champion within 2 weeks; re-map the VAC; send pilot results.', { cycleMult: 1.4, winMult: 0.6, stallDays: [30, 90] }),
      sc('security_stalls', 'Security questionnaire stalls', 0.4, '150-400 questions.', 'Send a pre-filled SIG Lite/HECVAT-style sheet with SOC 2; name a security contact; 2-week response SLA.', { cycleMult: 1.3, winMult: 0.85, paperwork: ['sig_lite', 'pen_test'], stallDays: [14, 60] }),
      sc('quarterly_vac', 'VAC meets only quarterly', 0.25, 'Calendar sets the pace.', 'Ask the champion to submit an agenda item; plan a 3-month timeline; pilot in another unit meanwhile.', { cycleMult: 1.4, needsRole: 'clinical', stallDays: [30, 90] }),
      sc('forced_rfp', 'Forced RFP above threshold', 0.2, 'Rubric may favour big vendors.', 'Respond with small effort; decline if scoring favours large vendors.', { cycleMult: 1.5, winMult: 0.6, paperwork: ['rfp_response'] }),
      sc('bottom_up_dept', 'One department uses it, system wants a contract', 0.15, 'Bottom-up adoption.', 'Build a system-wide business case; enterprise addendum with BAA in place.', { cycleMult: 1.2, winMult: 1.2, paperwork: ['hipaa_baa', 'msa_redlines'] }),
    ],
    objections: ['We need SOC 2 Type II.', 'We need Epic integration.', 'Your company is too small to be a critical vendor.', 'Put it in next fiscal year.'],
    churnAnnual: 0.045, // within SEGMENT_CHURN.hospitals.annualLogoChurn (public/data/churn-reasons.js) [design]
    seasonality: { busy: [3, 4, 5, 9, 10], slow: [7, 12, 1], note: 'July 1 fiscal-year freeze (design); capital planning early in the calendar year; late Nov to early Jan is dead.' },
    soloFounderFit: 0.25,
    sourced: [
      'L.E.K. 2025 survey: about half of health-system executives report constrained or high-risk finances; over half hold under 180 days cash (https://www.lek.com/insights/medtech/state-medtech-customer-base-insights-leks-2025-us-health-system-executive-survey, 2025)',
      'Health-system sales cycles 3-18 months (Rock Health roundup, https://rockhealth.com/top-quotes-lessons-digital-health-ceo/); 18-24 months from an executive interview [unverified]',
      'Epic Showroom listing takes 8-16 weeks; each hospital still runs its own review (https://nirmitee.io/blog/epic-vendor-security-review/, undated, blog)',
      'Premier acquired by Patient Square Capital, Sept 2025 [unverified, search summary]',
    ],
  },
  {
    id: 'pharma', label: 'Pharma, biotech and life-sciences companies (GxP)', group: 'health', models: ['ent'], employees: [20, 100000],
    keywords: ['pharma', 'pharmaceutical', 'biotech', 'biopharma', 'life sciences', 'cro', 'cdmo', 'clinical trial', 'clinical operations', 'gxp', 'drug manufacturer', 'generics maker', 'clinical stage'],
    examples: ['60-person clinical-stage biotech using a CRO', 'CDMO with 3 GMP sites', 'mid-size generics maker', 'top-20 pharma R&D quality group'],
    committee: [
      R('user', ['QA specialist', 'Validation specialist', 'Clinical ops manager', 'Lab tech'], [3, 10], 0.4, true, 0.9, ['usability', 'audit trail', 'workload']),
      R('champion', ['QA manager', 'Head of clinical operations', 'Director of quality systems'], [1, 2], 0.8, true, 1.0, ['audit readiness']),
      R('economic_buyer', ['VP Quality', 'VP Clinical Ops', 'CIO'], [1, 1], 0.9, true, 0.9, ['budget', 'risk']),
      R('quality', ['CSV lead', 'Computer systems validation specialist'], [1, 2], 0.8, true, 0.9, ['Part 11', 'CSA evidence', 'change control']),
      R('security', ['IT security', 'Cloud architect'], [1, 3], 0.7, true, 0.8, ['SOC 2', 'access', 'data residency']),
      R('supplier_quality', ['Supplier qualification lead', 'Vendor audit team'], [1, 2], 0.8, true, 0.85, ['vendor audit', 'quality agreement']),
      R('legal', ['Contracts', 'Privacy (GDPR for EU trials)'], [1, 2], 0.6, true, 0.7, ['quality agreement', 'liability']),
      R('procurement', ['Category manager', 'Strategic sourcing'], [1, 1], 0.6, true, 0.7, ['price', 'terms']),
      R('regulatory', ['Regulatory lead'], [0, 1], 0.5, true, 0.2, ['impact on filings']),
    ],
    buyerIsUserProb: 0.1,
    cycleDays: { lt5k: [14, 42], k5to25: [60, 120], k25to100: [180, 270], gt100: [270, 540] },
    winRateQualified: 0.2, acvRange: [15000, 80000],
    procurement: proc({
      cardLimit: 2500, quoteThreshold: 25000, rfpThreshold: 250000, boardApproval: { prob: 0.3, aboveUsd: 100000 },
      fiscalYearStartMonth: 1, budgetSetMonths: [9, 10, 11, 12], paymentTermsDays: 45, poRequired: true,
      paperwork: [pw('w9', 1), pw('vendor_portal', 0.6), pw('coi_insurance', 0.9), pw('security_questionnaire', 0.9), pw('supplier_audit', 0.8, 5000), pw('quality_agreement', 0.8, 25000), pw('csv_validation_package', 0.8, 5000), pw('soc2_type2', 0.85, 25000), pw('pen_test', 0.5, 25000), pw('dpa', 0.5), pw('msa_redlines', 0.7, 25000)],
    }),
    channels: {
      works: ['ISPE and PDA conferences and chapters', 'peer referral from a QA or CSV lead', 'validated reference customer', 'partnership with a validation consultancy', 'LinkedIn outreach to QA directors'],
      fails: ['cold email to VPs', 'free trials in a regulated environment', 'ads', 'general "AI" pitches'],
    },
    bestContact: { channel: 'email', times: 'Mid-week; avoid the week before quarter-end and the holidays' },
    methodology: M('meddpicc', ['paperProcess', 'decisionCriteria', 'champion', 'economicBuyer'], 'The supplier-qualification process is the paper process. Lead with the validation package and audit readiness; Challenger for quality leaders who have seen a bad inspection.'),
    scenarios: [
      sc('csv_rejects', 'CSV lead rejects on evidence grounds', 0.35, 'Insufficient validation evidence.', 'Send a validation pack and a 90-minute audit-trail walkthrough; agree a remediation plan.', { winMult: 0.6, needsRole: 'quality', paperwork: ['csv_validation_package'], stallDays: [14, 60] }),
      sc('supplier_audit_month4', 'Supplier audit scheduled for month 4', 0.4, 'Remote or on-site audit.', 'Keep an audit-ready folder; offer a remote audit; name a quality contact.', { cycleMult: 1.3, needsRole: 'supplier_quality', paperwork: ['supplier_audit'] }),
      sc('champion_moves', 'Champion moves to another company', 0.2, 'New owner re-qualifies vendors.', 'Re-run the stakeholder map; re-earn trust with pilot results.', { cycleMult: 1.5, winMult: 0.6, stallDays: [30, 90] }),
      sc('multi_year_tfc', 'Procurement pushes multi-year with termination for convenience', 0.15, 'Contract terms squeeze price.', 'Price a paid pilot; accept annual terms with a multi-year discount.', { cycleMult: 1.2, winMult: 0.85 }),
      sc('release_breaks_validation', 'A release breaks validation', 0.15, 'Change impact unclear.', 'Publish release notes with change impact; offer revalidation; sell change control as a feature.', { winMult: 0.9 }),
    ],
    objections: ['We need a validated system before we can use it.', 'Your company isn\'t big enough to audit.', 'We don\'t have budget until next year.', 'Can you guarantee Part 11 compliance?'],
    churnAnnual: 0.075,
    seasonality: { busy: [1, 2, 3, 7, 9], slow: [8, 12], note: 'Audit planning and budgets in Q1 and Q3; switching costs revalidation, so churn is low once live.' },
    soloFounderFit: 0.2,
    sourced: [
      'Agency page: 120-365 days and $60k-$800k ACV for pharma (https://www.devcommx.com/ai-sdr/durham/pharma, undated, vendor, unverified)',
      'Biopharma SaaS model: 6-18 months (https://businessmodels.compound.vc/model/saas-for-biopharma, undated)',
      'Supplier qualification must finish before purchase (https://intuitionlabs.ai/articles/gxp-saas-release-validation-index, undated, unverified)',
      'FDA CSA guidance issue date unconfirmed (secondary says 2026-02-03); verify on fda.gov',
    ],
  },

  // ===== professional ======================================================================
  {
    id: 'law_firms', label: 'Law firms (solo and small through AmLaw 200)', group: 'professional', models: ['smb', 'ent'], employees: [1, 5000],
    keywords: ['law firm', 'attorney', 'lawyer', 'legal practice', 'solicitor', 'personal injury', 'family law', 'estate planning', 'immigration law', 'law office', 'amlaw', 'boutique law', 'legal services'],
    examples: ['solo personal-injury practice on Clio', '12-lawyer estate boutique', 'AmLaw 200 corporate firm buying KM or contract AI'],
    committee: [
      R('economic_buyer', ['Managing attorney', 'Solo practitioner', 'Managing partner'], [1, 1], 1.0, true, 0.98, ['time to value', 'data migration', 'price per user']),
      R('user', ['Associate', 'Paralegal', 'Legal assistant'], [1, 8], 0.2, false, 0.6, ['billing workflow', 'learning curve']),
      R('finance', ['Office manager', 'Bookkeeper'], [0, 1], 0.3, true, 0.3, ['billing integration']),
      R('champion', ['Practice group leader', 'Director of innovation/KM'], [1, 3], 0.6, true, 0.8, ['AI pilots', 'billable-hour pressure'], 25000),
      R('technical', ['CIO office', 'CISO office', 'Outside MSP'], [1, 3], 0.7, true, 0.9, ['security', 'integrations'], 30000),
      R('security', ['Infosec', 'Vendor risk team'], [1, 2], 0.7, true, 0.5, ['security questionnaire', 'SOC 2'], 30000),
      R('finance', ['COO', 'CFO'], [1, 1], 0.8, true, 0.6, ['budget', 'approval'], 30000),
      R('legal', ['General counsel\'s office', 'Conflicts / risk partner'], [1, 1], 0.5, true, 0.3, ['data terms', 'Rule 1.6 confidentiality'], 50000),
      R('procurement', ['Procurement'], [0, 1], 0.4, true, 0.3, ['PO', 'vendor onboarding'], 50000),
      R('partner_committee', ['Partners'], [3, 7], 0.6, true, 0.2, ['ethics', 'confidentiality', 'adoption'], 50000),
    ],
    buyerIsUserProb: 0.85,
    cycleDays: { lt5k: [7, 30], k5to25: [30, 75], k25to100: [60, 150], gt100: [90, 270] },
    winRateQualified: 0.2, acvRange: [1500, 30000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 25000, rfpThreshold: 75000, boardApproval: { prob: 0.15, aboveUsd: 50000 },
      fiscalYearStartMonth: 1, budgetSetMonths: [9, 10, 11, 12], paymentTermsDays: 30,
      paperwork: [pw('w9', 0.8), pw('coi_insurance', 0.5, 25000), pw('security_questionnaire', 0.5, 25000), pw('sig_lite', 0.4, 25000), pw('soc2_type2', 0.7, 50000), pw('dpa', 0.3, 25000)],
    }),
    channels: {
      works: ['peer referral and state/local bar associations', 'ABA TECHSHOW, Clio Cloud Conference, ILTA (AmLaw)', 'free trial and demo', 'Clio App Marketplace and integrations'],
      fails: ['cold outbound to solos', 'generic LinkedIn to AmLaw partners without a legal ops or KM champion'],
    },
    bestContact: { channel: 'email', times: 'Avoid trial season and court deadlines and the first two weeks of the month; Q4 and January for AmLaw budgets' },
    methodology: M('value_selling', ['economicBuyer', 'paperProcess', 'champion', 'pain'], 'Value selling with a BANT-lite single call and a trial for solo and small firms; full MEDDPICC for AmLaw (champion in KM, COO/CFO buyer, security as decision criteria).'),
    scenarios: [
      sc('switching_cost', 'Solo has 3 years of Clio data', 0.3, 'Buyer is the user; switching cost dominates.', 'One-week data import test and a fixed-price migration offer.', { cycleMult: 1.3, winMult: 0.8 }),
      sc('amlaw_champion_leaves', 'AmLaw champion leaves after a pilot', 0.25, 'Per 12 months at large firms.', 'Multi-thread to COO and CIO before the pilot ends.', { cycleMult: 1.4, winMult: 0.6, stallDays: [30, 90] }),
      sc('security_after_yes', 'Security questionnaire arrives after a verbal yes', 0.5, 'At AmLaw.', 'Keep a pre-filled SIG Lite and a SOC 2 report ready.', { cycleMult: 1.25, paperwork: ['sig_lite', 'soc2_type2'], stallDays: [14, 45] }),
      sc('partner_committee_blocks', 'Partner committee blocks on ethics or confidentiality', 0.2, 'Firm-wide tool concerns.', 'Offer a data-residency statement and a Rule 1.6 cloud-confidentiality explainer.', { winMult: 0.7, needsRole: 'partner_committee' }),
      sc('bar_discount', 'Solo asks for a bar-association referral discount', 0.4, 'Price pressure.', 'Structure a referral partner programme rather than a price cut.', { cycleMult: 0.9 }),
      sc('slow_quarter_freeze', 'Small firm freezes after a slow quarter', 0.2, 'Budget freeze.', 'Offer annual-pay-monthly or a seat-reduction downgrade.', { winMult: 0.8, stallDays: [14, 45] }),
    ],
    objections: ['We already have Clio/MyCase.', 'We need this to pass our security review first.', 'Our partners won\'t learn another tool.', 'Is our client data in the cloud safe for privilege?', 'Can we just use ChatGPT for this?'],
    churnAnnual: 0.18,
    seasonality: { busy: [1, 2, 3, 10, 11], slow: [8, 12], note: 'Estate firms are busy Jan-Mar; AmLaw budgets in Q4/January; August and late December are dead. AmLaw churn happens at the procurement re-bid.' },
    soloFounderFit: 0.65,
    sourced: [
      'Clio 2025: 8% of solos and 4% of small firms use AI widely (https://www.clio.com/about/press/legal-trends-solo-small-law-firms-2025/, 2025)',
      'Smokeball 2025: 53% of small firms integrating gen AI vs 27% in 2023 (https://www.lawnext.com/2025/03/ai-adoption-nearly-doubles-among-small-law-firms-according-to-smokeballs-2025-state-of-law-report.html, 2025-03); conflicts with Clio on method',
      'ABA 2023 TechReport via PreVeil: 22% of firms asked by a client to complete a security questionnaire; 59% at firms of 50-99 lawyers (https://www.preveil.com/blog/law-firm-security-obligations-regulated-clients/, undated)',
      'ABA 2024 budgeting report: 41% of solos and 55% of 2-9 lawyer firms budget for technology (https://www.americanbar.org/groups/law_practice/resources/tech-report/2024/2024-budgeting-and-planning-techreport, ~2025-03, snippet only)',
    ],
  },
  {
    id: 'accounting_firms', label: 'Accounting and CPA firms', group: 'professional', models: ['smb', 'ent'], employees: [1, 1500],
    keywords: ['cpa', 'accounting firm', 'accountant', 'tax preparer', 'tax practice', 'bookkeeping firm', 'public accounting', 'tax and accounting', 'accounting practice', 'enrolled agent'],
    examples: ['3-person tax and bookkeeping practice', '40-person regional firm on CCH Axcess', 'PE-backed roll-up platform'],
    committee: [
      R('economic_buyer', ['Managing partner', 'Sole practitioner'], [1, 1], 0.9, true, 0.9, ['time', 'price', 'client migration']),
      R('user', ['Preparer', 'Staff accountant'], [2, 8], 0.3, false, 0.95, ['training during busy season']),
      R('technical', ['Office admin', 'Outsourced IT / MSP'], [0, 1], 0.5, true, 0.6, ['integrations', 'security']),
      R('champion', ['Tax manager', 'Practice leader'], [1, 1], 0.7, true, 0.8, ['missed deadlines', 'staff turnover'], 15000),
      R('security', ['Compliance lead (FTC Safeguards owner)'], [1, 1], 0.6, true, 0.7, ['WISP', 'SOC 2'], 40000),
      R('finance', ['Finance / accounting ops'], [0, 1], 0.5, false, 0.5, ['budget'], 40000),
      R('partner_committee', ['Partners'], [2, 5], 0.6, true, 0.5, ['adoption', 'cost'], 40000),
      R('board', ['PE operating partner', 'Platform board'], [0, 1], 0.7, true, 0.15, ['spend over ~$25k per year'], 25000),
    ],
    buyerIsUserProb: 0.8,
    cycleDays: { lt5k: [14, 30], k5to25: [30, 60], k25to100: [60, 120], gt100: [90, 240] },
    winRateQualified: 0.2, acvRange: [2000, 15000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 25000, boardApproval: { prob: 0.1, aboveUsd: 25000 }, fiscalYearStartMonth: 1, budgetSetMonths: [9, 10, 11], paymentTermsDays: 30,
      paperwork: [pw('w9', 0.8), pw('coi_insurance', 0.4, 15000), pw('ftc_safeguards_wisp', 0.6, 5000), pw('dpa', 0.4, 15000), pw('security_questionnaire', 0.4, 25000), pw('soc2_type2', 0.4, 40000)],
    }),
    channels: {
      works: ['peer referral within state CPA societies', 'state society and AICPA events, Accounting Today, Firm of the Future', 'integrations with Intuit, Thomson Reuters, CCH, Drake marketplaces'],
      fails: ['cold email Jan-Apr', 'generic LinkedIn to managing partners in tax season'],
    },
    bestContact: { channel: 'email', times: 'May-October (extension season); never January-April' },
    methodology: M('value_selling', ['pain', 'champion', 'paperProcess'], 'Sell in Q3 for go-live before January; live demo on their own client data (with consent). MEDDPICC for mid-size firms with a security review.'),
    scenarios: [
      sc('start_in_january', 'Buyer wants to start in January', 0.5, 'Go-live collides with busy season.', 'Hold the contract until Q2; offer a mid-year start with a parallel pilot.', { cycleMult: 1.5, stallDays: [30, 120] }),
      sc('tax_manager_leaves', 'Tax manager leaves before go-live', 0.2, 'Champion departs.', 'Keep the managing partner in every call; document the workflow.', { winMult: 0.7, stallDays: [14, 45] }),
      sc('security_review_stalls', 'IT provider or cyber insurer stalls the deal', 0.4, 'Mid-size firms.', 'Provide SOC 2 or a Safeguards-aligned WISP summary.', { cycleMult: 1.3, needsRole: 'technical', paperwork: ['ftc_safeguards_wisp', 'security_questionnaire'] }),
      sc('pe_acquires', 'PE-backed platform acquires the buyer', 0.1, 'Mid-cycle re-bid.', 'Ask who owns the firm in discovery; expect a re-bid.', { cycleMult: 1.8, winMult: 0.5, needsRole: 'board' }),
      sc('staff_revolt', 'Staff revolt on peak-season migration', 0.3, 'Cutover in busy season.', 'Scheduled cutover and training blackout dates.', { winMult: 0.8 }),
      sc('forced_rfp', 'Forced RFP from a mid-size firm', 0.15, 'Procurement packet.', 'Short standard security and pricing packet.', { cycleMult: 1.4, paperwork: ['rfp_response'] }),
    ],
    objections: ['We don\'t switch during tax season.', 'Our IT provider needs to approve this.', 'Do you have a SOC 2 report and a WISP?', 'We already use Intuit/CCH/Thomson Reuters; it\'s integrated.', 'We can\'t migrate 2,000 client files before April.'],
    churnAnnual: 0.12,
    seasonality: { busy: [6, 7, 8, 9], slow: [1, 2, 3, 4], note: 'Busy season January-April (peak); extension season May-October is the buying window. Intuit and Thomson Reuters (vendors) both recommend fall/Q3 onboarding.' },
    soloFounderFit: 0.45,
    sourced: [
      'CPA Trendlines deal tracker: 525 events and $49B transacted EV in PE consolidation (https://cpatrendlines.com/2025/11/23/pe-ma-will-consolidate-accounting-profession, 2025-11-23)',
      'Intuit (vendor): best time to onboard is extension season May-October (https://accountants.intuit.com/taxprocenter/practice-management/workflow-tools/upgrading-software-in-the-fall-smart-firms-dont-wait/, undated)',
      'Thomson Reuters (vendor): Q3 is the best time to purchase tax software (https://tax.thomsonreuters.com/blog/why-q3-is-the-best-time-for-firms-to-purchase-tax-software/, undated)',
      'FTC Safeguards Rule (16 CFR 314) covers tax preparers; secondary summaries conflict on small-firm exceptions',
    ],
  },
  {
    id: 'real_estate', label: 'Real estate agents and brokerages', group: 'professional', models: ['smb'], employees: [1, 1000],
    keywords: ['real estate', 'realtor', 'real estate brokerage', 'real estate agent', 'realty', 'brokerage', 'real estate team', 'property sales'],
    examples: ['solo agent', '15-agent independent brokerage', '300-agent regional brokerage', 'national brand franchise'],
    committee: [
      R('economic_buyer', ['Agent (owner of own business)'], [1, 1], 1.0, true, 0.98, ['lead cost', 'time', 'learning curve']),
      R('economic_buyer', ['Broker-owner', 'Managing broker'], [1, 1], 0.9, true, 0.85, ['agent adoption', 'brand standards', 'cost'], 6000),
      R('champion', ['Operations manager', 'Transaction coordinator', 'Top producer'], [1, 3], 0.6, true, 0.7, ['compliance', 'adoption'], 6000),
      R('end_user_group', ['Agents'], [5, 50], 0.3, true, 0.8, ['learning curve (63% cite it)', 'cost (59%)'], 6000),
      R('technical', ['Tech director', 'Outsourced IT'], [0, 1], 0.4, true, 0.4, ['MLS data', 'integrations'], 25000),
      R('legal', ['Compliance / legal'], [0, 1], 0.5, true, 0.5, ['consumer data use'], 25000),
      R('franchisor', ['Franchise tech approval'], [0, 1], 0.7, true, 0.3, ['approved tech stack'], 25000),
    ],
    buyerIsUserProb: 0.6,
    cycleDays: { lt5k: [1, 14], k5to25: [30, 75], k25to100: [60, 150], gt100: [180, 365] },
    winRateQualified: 0.18, acvRange: [600, 30000],
    procurement: proc({
      cardLimit: 3000, fiscalYearStartMonth: 1, budgetSetMonths: [11, 12], paymentTermsDays: 30,
      paperwork: [pw('w9', 0.4, 6000), pw('coi_insurance', 0.3, 6000), pw('mls_data_use_review', 0.3, 6000), pw('security_questionnaire', 0.4, 25000), pw('dpa', 0.3, 25000)],
    }),
    channels: {
      works: ['brokerage preferred-vendor programmes', 'local Realtor association events and MLS trainings', 'peer referral and top-producer endorsement', 'in-office demos', 'MLS, CRM (Follow Up Boss, kvCORE) and e-sign integrations'],
      fails: ['cold email to agents', 'trade-show booths without a demo', 'selling a brokerage without the broker'],
    },
    bestContact: { channel: 'in_person', times: 'Dec-Feb planning; avoid Mar-Jun spring selling season for brokerage pitches' },
    methodology: M('value_selling', ['economicBuyer', 'champion', 'metrics', 'paperProcess'], 'Value selling with SPIN discovery for agents (time saved per transaction); Challenger for the broker who thinks tech is a checkbox; MEDDIC for 100+ agent offices.'),
    scenarios: [
      sc('agents_refuse', 'Broker buys, agents refuse to adopt', 0.5, 'Buyer is not the user.', 'Build a top-producer pilot and run adoption metrics.', { winMult: 0.7, needsRole: 'end_user_group' }),
      sc('ops_lead_leaves', 'Ops lead or transaction coordinator leaves', 0.2, 'Champion departs.', 'Re-engage the broker quickly.', { winMult: 0.7, stallDays: [14, 45] }),
      sc('mls_review', 'MLS data-use approval', 0.3, 'For MLS-touching tools.', 'Plan 2-6 weeks of delay.', { cycleMult: 1.3, paperwork: ['mls_data_use_review'] }),
      sc('franchise_blocks', 'Franchise tech approval blocks a national-brand deal', 0.1, 'Over 100 agents.', 'Go for independents first.', { cycleMult: 2, winMult: 0.4, needsRole: 'franchisor' }),
      sc('agent_wants_discount', 'Agent wants a personal tool inside a brokerage that has one', 0.4, 'Overlap with the platform.', 'Agent-tier pricing with a per-agent contract.', { winMult: 0.85 }),
      sc('bottom_up_agents', 'Agents use a free tier, broker asked to pay', 0.3, 'Bottom-up adoption.', 'Team plan with a broker dashboard.', { cycleMult: 0.7, winMult: 1.25 }),
    ],
    objections: ['My brokerage already gives us a platform.', 'Agents won\'t learn another CRM.', 'Our commission split doesn\'t leave room for software.', 'Does this integrate with our MLS and our CRM?'],
    churnAnnual: 0.35,
    seasonality: { busy: [11, 12, 1, 2], slow: [3, 4, 5, 6], note: 'Spring selling season is slow for vendors; brokers prefer to switch in Q4 or January. Agent churn is 30-50% [design].' },
    soloFounderFit: 0.5,
    sourced: [
      'NAR 2025 Profile: 88% of buyers used an agent, 91% of sellers, 5% FSBO (https://www.nar.realtor/press-releases/first-time-home-buyer-share-falls-to-historic-low-of-21-median-age-rises-to-40, 2025-11-04)',
      'NAR tech survey: 34% of agents spend $50-250/month on tools; 24% spend over $500; barriers: learning curve 63%, cost 59%; 96% use MLS, 79% e-signature, 46% a CRM (https://www.nar.realtor/newsroom/realtors-embrace-ai-digital-tools-to-enhance-client-service-nar-survey-finds, 2025-09; report year conflicts between sources)',
      'TotalBrokerage (vendor): brokers calling tech "a checkbox" rose from 16.3% (2023) to about 30% (2024) (https://www.totalbrokerage.com/blog/state-of-brokerage-technology-2023-survey-results)',
    ],
  },
  {
    id: 'agencies', label: 'Marketing and creative agencies', group: 'professional', models: ['smb'], employees: [1, 200],
    keywords: ['marketing agency', 'digital agency', 'creative agency', 'advertising agency', 'ad agency', 'seo agency', 'pr agency', 'social media agency', 'performance marketing', 'design studio', 'branding agency', 'web design agency', 'content agency', 'media buying', 'growth agency', 'freelance designer'],
    examples: ['6-person Shopify growth agency', '20-person B2B content and paid agency', '80-person full-service agency'],
    committee: [
      R('economic_buyer', ['Founder', 'Owner'], [1, 1], 1.0, true, 0.98, ['margin', 'time saved on client work']),
      R('champion', ['Account lead', 'Delivery manager'], [1, 3], 0.4, false, 0.7, ['reporting speed']),
      R('user', ['Freelancer', 'Account manager', 'Analyst'], [0, 5], 0.1, false, 0.4, ['usability']),
      R('economic_buyer', ['COO', 'Managing director'], [1, 1], 0.9, true, 0.8, ['spend', 'standardization'], 6000),
      R('champion', ['Head of paid media', 'Head of SEO', 'Operations director'], [1, 2], 0.6, true, 0.8, ['workflow fit'], 6000),
      R('finance', ['Finance'], [0, 1], 0.4, true, 0.5, ['spend'], 12000),
      R('security', ['IT or security'], [0, 1], 0.5, true, 0.5, ['client data', 'client accounts'], 12000),
      R('legal', ['Legal', 'Procurement'], [0, 1], 0.3, true, 0.4, ['client-facing contracts'], 25000),
      R('client', ['Client approver'], [0, 1], 0.6, true, 0.25, ['tool touches client ad accounts'], 6000),
    ],
    buyerIsUserProb: 0.6,
    cycleDays: { lt5k: [7, 30], k5to25: [14, 45], k25to100: [60, 90], gt100: [90, 180] },
    winRateQualified: 0.2, acvRange: [600, 30000],
    procurement: proc({
      cardLimit: 5000, fiscalYearStartMonth: 1, budgetSetMonths: [10, 11, 12], paymentTermsDays: 30,
      paperwork: [pw('w9', 0.15), pw('coi_insurance', 0.25, 6000), pw('dpa', 0.3, 6000), pw('security_questionnaire', 0.3, 12000), pw('soc2_type2', 0.2, 25000)],
    }),
    channels: {
      works: ['peer referral in agency communities and local ad clubs', 'Google Ads, Meta, HubSpot, Shopify app marketplaces', 'case studies of time saved on client work', 'free trials'],
      fails: ['cold LinkedIn to agency founders (saturated)', 'generic webinar pitches', 'holding-company procurement'],
    },
    bestContact: { channel: 'email', times: 'Avoid the week of major client launches; Q1 and Q4 are busiest' },
    methodology: M('value_selling', ['metrics', 'champion', 'paperProcess'], 'Hours per client per month x billing rate. MEDDIC for 25-200 person agencies; client approval is the paper process when the tool touches client accounts.'),
    scenarios: [
      sc('am_refuse', 'Account managers refuse to adopt', 0.4, 'Buyer is not the user.', 'Pilot on one client account.', { winMult: 0.8, needsRole: 'champion' }),
      sc('media_lead_leaves', 'Media lead leaves to a client', 0.2, 'Champion departs.', 'Document the workflow and keep the owner engaged.', { winMult: 0.7, stallDays: [7, 30] }),
      sc('client_must_approve', 'Client must approve a tool touching its ad accounts', 0.3, 'Third party in the loop.', 'Client-facing security summary and read-only access option.', { cycleMult: 1.4, needsRole: 'client', paperwork: ['dpa'] }),
      sc('retainer_shrink', 'Budget cut as retainers shrink', 0.3, 'Per quarter in weak markets.', 'Per-client or usage plan.', { winMult: 0.75, stallDays: [14, 45] }),
      sc('white_label', 'Agency wants to resell or white-label', 0.25, 'Partner opportunity.', 'Structure a partner programme with margin rather than a direct sale.', { cycleMult: 1.2 }),
    ],
    objections: ['Our clients already give us access to their tools.', 'We build this in-house in a spreadsheet.', 'Who pays for this, us or the client?', 'We can\'t afford another monthly tool when margins are thin.'],
    churnAnnual: 0.3,
    seasonality: { busy: [1, 2, 3, 10, 11], slow: [7, 8], note: 'Q1 budgets and Q4 planning; retainer clients stay ~56 months vs 24 for project clients (Setup 2025 via Agiled) [secondary].' },
    soloFounderFit: 0.65,
    sourced: [
      'ANA/4As: average client-agency relationship about 7 years (vs 3.2 in 2016) (https://www.ana.net/content/show/id/pr-2025-04-tenure, 2025-04)',
      'GetApp 2025 (1,116 marketing decision-makers): 79% plan to raise software spend by 5%+; top buying difficulties: picking a tool and security, 37% each (https://www.businesswire.com/news/home/20250218836718/en, 2025-02-18; marketing teams, not agency owners)',
      'Focus Digital (vendor): annual client churn 33% performance-based, 28% hybrid, 18% retainer (https://focus-digital.co/?p=6135, 2025)',
    ],
  },
  // ===== company ===========================================================================
  {
    id: 'ecommerce', label: 'E-commerce and DTC brands (Shopify ecosystem)', group: 'company', models: ['smb'], employees: [1, 50],
    keywords: ['shopify', 'ecommerce', 'e-commerce', 'dtc', 'direct to consumer', 'online store', 'woocommerce', 'bigcommerce', 'amazon seller', 'online retailer', 'webshop', 'shopify plus', 'dropshipping', 'subscription box'],
    examples: ['skincare brand', 'supplement brand', 'pet-food label', 'Shopify Plus home-goods store', 'multi-brand store operator'],
    committee: [
      R('economic_buyer', ['Founder', 'Owner'], [1, 1], 0.9, true, 0.95, ['monthly cost vs revenue', 'cash cushion']),
      R('user', ['Head of Growth', 'Marketing manager', 'Ops manager'], [1, 2], 0.5, false, 0.8, ['setup time', 'store speed', 'fit with Klaviyo, Recharge, Triple Whale']),
      R('champion', ['Founder', 'Ops lead'], [1, 1], 0.6, false, 0.9, ['ROI in plain numbers']),
      R('agency', ['Paid-media / email / CRO agency', 'Freelancer'], [0, 2], 0.6, true, 0.3, ['will they support the app', 'client report']),
      R('technical', ['Shopify Plus developer', 'Theme partner'], [0, 1], 0.4, true, 0.1, ['theme conflicts', 'checkout extensibility']),
      R('finance', ['Bookkeeper', 'Fractional CFO'], [0, 1], 0.25, false, 0.15, ['clean invoices', 'sales tax']),
      R('owner_spouse', ['Co-owner'], [0, 1], 0.3, false, 0.15, ['household decision']),
    ],
    buyerIsUserProb: 0.6,
    cycleDays: { lt5k: [1, 14], k5to25: [14, 45], k25to100: [45, 120], gt100: [120, 270] },
    winRateQualified: 0.2, acvRange: [300, 3000],
    procurement: proc({
      cardLimit: 5000, budgetSetMonths: [8, 9, 10],
      paperwork: [pw('w9', 0.1, 5000), pw('dpa', 0.3, 5000), pw('security_questionnaire', 0.2, 5000)],
    }),
    channels: {
      works: ['Shopify App Store listing, search and reviews', 'integrations with Klaviyo, Recharge, Gorgias', 'Shopify agencies and freelancers', 'YouTube and creator content', 'Reddit r/shopify and merchant Facebook groups', 'operator podcasts', 'affiliate programmes'],
      fails: ['cold email with generic pitches', 'LinkedIn outreach', 'trade shows', 'paid ads for a low-ACV app'],
    },
    bestContact: { channel: 'in_product', times: 'US weekday mornings; avoid Nov-Dec (Black Friday freeze)' },
    methodology: M('value_selling', ['pain', 'metrics'], 'Self-serve trial that proves value in the first session; simple ROI. BANT-lite is enough at this ACV; MEDDPICC only for agencies and Plus brands.'),
    scenarios: [
      sc('agency_buyer', 'Buyer is an agency, not the merchant', 0.35, 'Agency says yes then ghosts once the client is live.', 'Give the agency a client-facing report and a rev-share or agency plan; ask for a reference client.', { cycleMult: 1.2, needsRole: 'agency' }),
      sc('install_uninstall', 'Bottom-up install then uninstall after the trial', 0.4, 'Trial does not convert.', 'Onboarding sequence keyed to first meaningful event; 15-minute setup call on day 3.', { winMult: 0.8 }),
      sc('plus_partner_blocks', 'Shopify Plus partner blocks the app', 0.1, 'Developer objects.', 'Technical summary, sandbox and theme-safe install steps.', { winMult: 0.6, needsRole: 'technical' }),
      sc('peak_freeze', 'Peak-season freeze (Oct-Dec)', 0.5, 'Merchants freeze changes before Black Friday.', 'Stop outreach before Black Friday; offer a Jan-Feb rebuild plan.', { cycleMult: 1.5, stallDays: [30, 75] }),
      sc('free_competitor', 'Competitor app is free or bundled', 0.3, 'Price anchor of zero.', 'Show the cost of the free app\'s limits (volume caps, branding, support SLA) with real numbers.', { winMult: 0.8 }),
    ],
    objections: ['We already use Klaviyo for this.', 'I don\'t want another monthly fee.', 'Will it slow down my store?', 'We\'ve got a developer. Let them decide.'],
    churnAnnual: 0.32,
    seasonality: { busy: [1, 2, 3, 8, 9], slow: [11, 12], note: 'Merchants freeze before Black Friday-Cyber Monday; monthly churn of 3-6% is common for small merchants [design].' },
    soloFounderFit: 0.8,
    sourced: [
      'Shopify partners blog: merchants need email, SMS, reviews, fulfillment and returns apps; gives no merchant counts (https://www.shopify.com/partners/blog/opportunities-for-shopify-partners-in-2025, 2025)',
      'Built for Shopify requirements: storefront performance, Polaris, webhooks, privacy (https://shopify.dev/apps/launch/built-for-shopify/requirements, retrieved 2026-10-14)',
      'Optifai 2026 (N=939): 14-30 day cycles under $15k (https://prospeo.io/s/sales-cycle-example, secondary)',
    ],
  },
  {
    id: 'startup_smb', label: 'Startups and tech SMBs (10-100 employees, PLG and self-serve)', group: 'company', models: ['smb'], employees: [1, 100],
    keywords: ['startup', 'saas', 'software company', 'software startup', 'tech startup', 'devtools', 'developer tools', 'fintech startup', 'ai startup', 'seed stage', 'series a', 'b2b saas', 'software'],
    examples: ['Series A dev-tools company', '40-person fintech', 'remote-first agency', 'B2B marketplace with a 30-person ops team'],
    committee: [
      R('user', ['Engineer', 'PM', 'Ops manager', 'Marketing manager'], [2, 10], 0.4, false, 0.95, ['does it work', 'how fast can I start']),
      R('champion', ['Team lead', 'Head of function'], [1, 1], 0.6, true, 0.95, ['team budget and pain']),
      R('economic_buyer', ['Founder', 'CEO', 'VP Eng'], [1, 1], 0.85, true, 0.95, ['burn', 'headcount vs tooling', 'uptime']),
      R('security', ['Head of engineering', 'Compliance lead (Vanta/Drata)', 'Outsourced IT'], [0, 1], 0.5, true, 0.5, ['SSO', 'SOC 2 status', 'data residency'], 25000),
      R('finance', ['Part-time controller', 'Fractional CFO'], [0, 1], 0.3, false, 0.4, ['annual prepay', 'invoice terms'], 25000),
      R('legal', ['Founder reviewing the order form'], [0, 1], 0.2, true, 0.3, ['DPA', 'order form'], 25000),
      R('board', ['Investors'], [0, 1], 0.3, false, 0.1, ['spend level'], 50000),
    ],
    buyerIsUserProb: 0.65,
    cycleDays: { lt5k: [1, 14], k5to25: [14, 45], k25to100: [45, 90], gt100: [90, 150] },
    winRateQualified: 0.25, acvRange: [3000, 30000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 25000, boardApproval: { prob: 0.05, aboveUsd: 100000 }, fiscalYearStartMonth: 1, budgetSetMonths: [11, 12, 1], paymentTermsDays: 30,
      paperwork: [pw('w9', 0.5, 5000), pw('coi_insurance', 0.3, 25000), pw('soc2_type1', 0.2, 25000), pw('soc2_type2', 0.3, 50000), pw('soc2_bridge_letter', 0.25, 25000), pw('security_questionnaire', 0.5, 25000), pw('caiq', 0.2, 25000), pw('dpa', 0.5, 25000), pw('msa_redlines', 0.3, 25000)],
    }),
    channels: {
      works: ['product-led growth with free tier or trial and in-product upgrade prompts', 'Product Hunt and Show HN launches', 'founder-led content on X, LinkedIn and blogs', 'Slack and Reddit communities', 'Zapier, Slack and GitHub Marketplace listings', 'G2 and Capterra reviews'],
      fails: ['cold calls to founders', 'broad outbound at under $5k ACV', 'paid display without a clear value message'],
    },
    bestContact: { channel: 'in_product', times: 'Tue-Thu 8:00-10:00 local' },
    methodology: M('meddpicc', ['champion', 'pain', 'decisionProcess', 'paperProcess'], 'PQL first, then a short value conversation; MEDDPICC-lite from $5k, adding the paper process once security or a DPA appears. No named champion means unqualified.'),
    scenarios: [
      sc('free_tier_upgrade', 'Free tier team wants a paid upgrade', 0.4, 'Bottom-up adoption.', 'Find the admin or budget owner from usage data; sales-assist call and a team plan with SSO.', { cycleMult: 0.6, winMult: 1.4 }),
      sc('champion_leaves', 'Champion leaves mid-deal', 0.17, 'Applies to $25k+.', 'Map other stakeholders in discovery; ask the economic buyer for a meeting in week one.', { winMult: 0.7, stallDays: [14, 45] }),
      sc('security_q_25k', 'Security questionnaire arrives at $25k', 0.5, 'Lightweight CAIQ or SIG Lite-style sheet.', 'Standard security pack ready; answer in 2-3 days; call with the head of engineering.', { cycleMult: 1.25, needsRole: 'security', paperwork: ['security_questionnaire', 'dpa'] }),
      sc('card_limit', 'Corporate card blocked by a per-transaction limit', 0.2, 'Spend limit.', 'Annual invoice net-30 with a W-9 and short order form in the same email.', { stallDays: [3, 10], paperwork: ['w9'] }),
      sc('funding_slowdown', 'Budget freeze or funding slowdown', 0.15, 'Burn control.', 'Smaller plan or a 90-day pilot with one success metric; do not discount without commitment.', { winMult: 0.75, stallDays: [14, 60] }),
      sc('finance_three_quotes', 'Finance asks for a three-quote comparison', 0.2, 'Buyer is not the user.', 'Send a compare-to-alternatives document with real numbers.', { cycleMult: 1.2, needsRole: 'finance' }),
    ],
    objections: ['We\'re fine on the free plan.', 'Send us your SOC 2 report.', 'We\'re cutting spend this quarter.', 'Can we pay by invoice?'],
    churnAnnual: 0.15,
    seasonality: { busy: [1, 2, 9, 10], slow: [7, 8, 12], note: 'Budget reset in Jan-Feb; Q4 budgets Sep-Oct. Monthly contracts churn 3-5x faster than annual (Recurly 2025, secondhand, unverified).' },
    soloFounderFit: 0.7,
    sourced: [
      'ChartMogul 2025 via aggregator: SMB (1-50 employees) annual logo churn 11-13% (https://stealthagents.com/research/saas-churn-rate-statistics-2026, secondary); another gives 10-14% (https://userjot.com/blog/saas-churn-rate-benchmarks)',
      'Ramp example policy: auto-approve under $1,000, manager $1k-$5k, director over $5k (https://ramp.com/answers/policy-enforcement/policy-rules-interact-with-spend-limits, undated; configuration example, not a survey)',
      'Ebsta/Pavilion 2025 via Webtonic: 91 days average new business, 52 days expansion (https://www.webtonic.io/blog/average-sales-cycle-length-by-industry, secondary)',
    ],
  },
  {
    id: 'mid_market', label: 'Mid-market companies (100-1,000 employees)', group: 'company', models: ['smb', 'ent'], employees: [100, 1000],
    keywords: ['mid-market', 'mid market', 'midmarket', 'distributor', 'wholesale', 'regional company', 'mid-size company', 'mid-sized company', 'family-owned company'],
    examples: ['regional distributor', 'multi-clinic healthcare group', 'franchise operator', 'professional-services firm', 'mid-size manufacturer'],
    committee: [
      R('user', ['Department manager', 'Ops', 'HR', 'Marketing', 'Finance analyst'], [3, 10], 0.4, false, 0.9, ['workflow fit', 'training', 'data import']),
      R('champion', ['Department head', 'Director'], [1, 1], 0.6, true, 1.0, ['team pain', 'own budget']),
      R('economic_buyer', ['VP', 'Director', 'CFO', 'COO'], [1, 2], 0.8, true, 0.95, ['budget', 'ROI']),
      R('technical', ['IT manager', 'Systems admin', 'Outsourced MSP'], [1, 3], 0.65, true, 0.8, ['SSO', 'Active Directory', 'where data lives']),
      R('security', ['Security or compliance lead'], [0, 1], 0.5, true, 0.5, ['SOC 2 status', 'pen testing', 'incident response'], 25000),
      R('legal', ['General counsel', 'Contract manager'], [0, 1], 0.5, true, 0.35, ['liability and data redlines'], 25000),
      R('procurement', ['Procurement'], [0, 1], 0.6, true, 0.3, ['vendor onboarding', 'terms'], 25000),
      R('finance', ['Controller', 'CFO'], [1, 1], 0.6, true, 0.7, ['budget line', 'payment terms']),
      R('board', ['Board', 'Owner'], [0, 1], 0.7, true, 0.1, ['multi-year or large commitment'], 250000),
    ],
    buyerIsUserProb: 0.45,
    cycleDays: { lt5k: [7, 21], k5to25: [30, 75], k25to100: [60, 120], gt100: [120, 240] },
    winRateQualified: 0.2, acvRange: [10000, 60000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 15000, rfpThreshold: 150000, boardApproval: { prob: 0.08, aboveUsd: 250000 }, fiscalYearStartMonth: 1, budgetSetMonths: [10, 11, 12], paymentTermsDays: 30, poRequired: true,
      paperwork: [pw('w9', 0.9), pw('coi_insurance', 0.6, 25000), pw('vendor_portal', 0.3, 25000), pw('soc2_type2', 0.55, 25000), pw('sig_lite', 0.4, 25000), pw('caiq', 0.2, 25000), pw('dpa', 0.5, 25000), pw('vpat', 0.1, 25000), pw('msa_redlines', 0.5, 25000), pw('rfp_response', 0.25, 100000)],
    }),
    channels: {
      works: ['customer referrals in the same vertical', 'industry associations and regional chapters', 'integrations with NetSuite, QuickBooks, Sage, Microsoft 365 and marketplaces (AppSource, SuiteApp)', 'partner webinars', 'LinkedIn to the champion followed by a call'],
      fails: ['cold email to the CEO alone', 'generic LinkedIn messaging', 'large trade-show booths for small deals'],
    },
    bestContact: { channel: 'phone', times: 'Tue-Thu 8:00-10:00 and 16:00-17:00; avoid late December' },
    methodology: M('meddpicc', ['economicBuyer', 'decisionProcess', 'paperProcess', 'champion'], 'Several stakeholders, a real paper process and a champion who needs coaching; mutual action plan with dates. Challenger for the first meeting with the economic buyer.'),
    scenarios: [
      sc('finance_says_no', 'Department head loves it, finance says no', 0.55, 'Buyer is not the user.', 'One-page business case with payback in months and a CFO-recognised number.', { winMult: 0.8, needsRole: 'finance' }),
      sc('champion_leaves', 'Champion leaves', 0.15, 'Single-threaded deal.', 'Multi-thread from the first call; name a second contact within two weeks.', { cycleMult: 1.3, winMult: 0.65, stallDays: [14, 45] }),
      sc('hidden_it_veto', 'Hidden IT veto', 0.2, 'SSO and a security review needed.', 'Ask IT for their checklist on day one; deliver SSO and a security pack before they ask.', { cycleMult: 1.3, winMult: 0.7, needsRole: 'technical', paperwork: ['security_questionnaire'] }),
      sc('forced_rfp', 'Forced RFP above a threshold', 0.2, 'Procurement policy.', 'Short RFP template and a reference call; ask whether the buyer already prefers a competitor.', { cycleMult: 1.5, winMult: 0.7, paperwork: ['rfp_response'] }),
      sc('q4_freeze', 'Q4 budget freeze', 0.15, 'Spending stops.', 'Smaller starter plan or a pilot inside the current budget line.', { winMult: 0.8, stallDays: [30, 90] }),
      sc('bottom_up_team', 'Team pilot to convert to a company licence', 0.25, 'Bottom-up adoption.', 'Count usage and propose a licence with an admin dashboard and fixed per-seat price.', { cycleMult: 0.8, winMult: 1.2 }),
    ],
    objections: ['It\'s not in the budget this year.', 'IT won\'t approve it.', 'We need three quotes.', 'Legal wants to change our liability cap.'],
    churnAnnual: 0.08,
    seasonality: { busy: [10, 11, 1, 2], slow: [7, 8, 12], note: 'Budget planning Oct-Dec; mid-year budget changes in Jul-Aug. Start renewal conversations 90-120 days out.' },
    soloFounderFit: 0.45,
    sourced: [
      'Mid-market buying groups average about 6-7 stakeholders (Influ2 2026, cited by https://komo.ai/glossary/mid-market-sales, unverified)',
      'Starr Conspiracy: 84-day median for >$100k, 42 days for $10k-$100k, 21 days under $10k (attribution unclear; https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025, 2025)',
      'Techaisle: IT controls about half of IT budget decisions in 100-999 employee firms (2021 survey; https://www.techaisle.com/blog/324-smb-and-midmarket-itdms-and-bdms-the-balance-of-purchase-authority)',
      'ChartMogul 2025 via aggregator: mid-market annual logo churn 6-8% (https://stealthagents.com/research/saas-churn-rate-statistics-2026, secondary)',
    ],
  },
  {
    id: 'enterprise', label: 'Fortune 500 and large enterprise', group: 'company', models: ['ent'], employees: [1000, 500000],
    keywords: ['fortune 500', 'fortune 100', 'enterprise', 'multinational', 'global enterprise', 'large enterprise', 'publicly traded', 'telecom', 'grocery chain', 'retail chain', 'conglomerate'],
    examples: ['national bank', 'regional insurer', 'pharma company', 'US telecom', 'global manufacturer'],
    committee: [
      R('user', ['Business-unit staff'], [10, 50], 0.3, false, 0.95, ['workflow change', 'training']),
      R('champion', ['VP', 'Director in the business unit'], [1, 2], 0.7, true, 1.0, ['business case', 'career risk']),
      R('economic_buyer', ['SVP', 'CIO', 'CMO', 'CFO'], [1, 1], 0.9, true, 0.95, ['budget', 'ROI']),
      R('procurement', ['Category manager'], [1, 2], 0.8, true, 0.9, ['pricing', 'supplier consolidation', 'preferred-vendor list']),
      R('security', ['InfoSec / TPRM analysts'], [2, 4], 0.9, true, 0.95, ['SOC 2 Type II', 'SIG/CAIQ', 'pen test', 'subprocessors']),
      R('privacy', ['Privacy office'], [1, 1], 0.6, true, 0.6, ['DPA', 'GDPR SCCs', 'data mapping']),
      R('legal', ['Commercial counsel'], [1, 2], 0.8, true, 0.95, ['liability cap', 'indemnity', 'IP', 'termination']),
      R('finance', ['FP&A'], [1, 1], 0.6, false, 0.7, ['capex vs opex', 'PO timing']),
      R('technical', ['Enterprise architect'], [1, 1], 0.6, true, 0.7, ['integration', 'SSO']),
      R('board', ['Board or audit committee'], [0, 1], 0.5, true, 0.1, ['large or unusual commitments'], 500000),
      R('union', ['Labor relations'], [0, 1], 0.3, true, 0.03, ['changes affecting staff']),
    ],
    buyerIsUserProb: 0.1,
    cycleDays: { lt5k: [14, 45], k5to25: [60, 120], k25to100: [120, 180], gt100: [180, 300] },
    winRateQualified: 0.15, acvRange: [25000, 250000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 100000, rfpThreshold: 150000, boardApproval: { prob: 0.2, aboveUsd: 500000 }, fiscalYearStartMonth: 1, budgetSetMonths: [9, 10, 11], paymentTermsDays: 60, poRequired: true,
      paperwork: [pw('w9', 1), pw('vendor_portal', 0.9), pw('coi_insurance', 0.95), pw('sig_lite', 0.5), pw('sig_core', 0.4, 50000), pw('caiq', 0.3), pw('soc2_type2', 0.9), pw('pen_test', 0.7), pw('iso27001', 0.2), pw('dpa', 0.8), pw('bcp_dr_summary', 0.5), pw('vpat', 0.2), pw('msa_redlines', 0.95), pw('rfp_response', 0.3, 100000)],
    }),
    channels: {
      works: ['partners and system integrators', 'cloud marketplaces (AWS, Azure) where buyers burn committed spend', 'executive briefings through a champion', 'analyst mentions and same-industry references', 'trust-centre documentation that TPRM teams can self-serve'],
      fails: ['cold outbound to CIOs', 'founder-led pitches without a champion', 'generic webinars', 'booths unless paired with a pilot'],
    },
    bestContact: { channel: 'email', times: 'Avoid late December and August; narrow Q4 windows' },
    methodology: M('meddpicc', ['paperProcess', 'decisionProcess', 'economicBuyer', 'champion'], 'The only method that fits the number of gates. Mutual action plan including the security review, legal redlines, procurement onboarding and the budget date.'),
    scenarios: [
      sc('type1_rejected', 'TPRM rejects SOC 2 Type I only', 0.3, 'Evidence gap.', 'Bridge letter, Type II timeline and a compensating-control memo; ask which controls they require.', { cycleMult: 1.4, winMult: 0.6, needsRole: 'security', paperwork: ['soc2_bridge_letter', 'soc2_type2'] }),
      sc('legal_redline', 'Legal redline stalls on liability or indemnity', 0.5, 'Contract terms.', 'Fallback in advance: cap at 12 months of fees with a data-breach super-cap; vendor counsel on a call.', { cycleMult: 1.3, needsRole: 'legal', paperwork: ['msa_redlines'], stallDays: [14, 45] }),
      sc('forced_rfp', 'Procurement forces an RFP', 0.3, 'Policy.', 'Ask whether it is a formality; decline if the preferred vendor is named, else respond fast with a standard packet.', { cycleMult: 1.5, winMult: 0.5, paperwork: ['rfp_response'] }),
      sc('champion_moves', 'Champion moves or the program is reorganised', 0.25, 'Single threaded.', 'Map a second champion before signing; keep a readable deal log.', { cycleMult: 1.4, winMult: 0.6, stallDays: [30, 90] }),
      sc('fiscal_freeze', 'Budget freeze or fiscal-year reset', 0.2, 'Timing.', 'Get the deal into next fiscal year\'s plan; smaller fixed-price pilot.', { cycleMult: 1.3, winMult: 0.8, stallDays: [30, 120] }),
      sc('shadow_spend', 'Shadow spend already exists', 0.15, 'Bottom-up adoption.', 'Find the users; use the usage data as the business case for an enterprise agreement.', { cycleMult: 0.8, winMult: 1.2 }),
    ],
    objections: ['We need a SOC 2 Type II report, not Type I.', 'We can\'t accept uncapped liability.', 'Please submit through our supplier portal.', 'We\'re going to RFP this.'],
    churnAnnual: 0.035,
    seasonality: { busy: [9, 10, 11, 1], slow: [8, 12], note: 'Q4 use-it-or-lose-it pushes in some companies; renewals are a re-procurement event; give 90-120 days notice on auto-renew.' },
    soloFounderFit: 0.12,
    sourced: [
      'Gartner 2024 abstract: a traditional RFP process can take more than six months to evaluate, select and contract a supplier (https://www.gartner.com/en/documents/6063463)',
      'Ebsta/Pavilion 2024 via Starr Conspiracy: a single $250k+ deal took 192 days from first touch to closed-won (https://www.thestarrconspiracy.com/insights/benchmarks/b2b-go-to-market-strategy-benchmarks-2025, secondhand)',
      'Questionnaire sizes: SIG Core ~850 (older) / 627 (2025), SIG Lite ~126-200, CAIQ ~260-300; a full questionnaire takes 20-40 vendor hours (https://rocketdocs.com/resources/blog/vendor-security-questionnaire, retrieved 2026-10-14, vendor)',
      'First enterprise deal about six weeks of legal back-and-forth; later order forms under an MSA 2-3 days (https://resources.rework.com/libraries/deal-closing/msa-development, anecdote)',
    ],
  },
  {
    id: 'hotels', label: 'Hotels and hospitality groups', group: 'company', models: ['smb', 'ent'], employees: [5, 1000],
    keywords: ['hotel', 'motel', 'resort', 'hospitality', 'lodging', 'bed and breakfast', 'inn', 'hotel group', 'boutique hotel', 'hotel management company'],
    examples: ['60-room independent hotel', 'owner-operated inn', 'hotel management company with 40 properties'],
    committee: [
      R('champion', ['Property GM'], [1, 1], 0.7, true, 0.95, ['guest experience', 'staff hours', 'P&L']),
      R('economic_buyer', ['Owner', 'Asset manager'], [1, 1], 0.8, true, 0.5, ['capex', 'ROI', 'brand standards']),
      R('group_ops', ['Director of operations', 'Regional VP'], [1, 1], 0.7, true, 0.3, ['standardization across properties'], 25000),
      R('user', ['Front desk', 'F&B staff'], [2, 10], 0.3, false, 0.9, ['extra steps per shift']),
      R('revenue', ['Director of revenue / sales'], [0, 1], 0.6, false, 0.3, ['group-sales CRM', 'RFP tools']),
      R('procurement', ['Group supply management'], [0, 1], 0.6, true, 0.25, ['price', 'preferred-vendor list'], 25000),
      R('technical', ['IT / brand technology'], [0, 1], 0.6, true, 0.3, ['PMS integration', 'PCI', 'data privacy'], 25000),
      R('finance', ['Controller'], [0, 1], 0.5, false, 0.3, ['budget']),
    ],
    buyerIsUserProb: 0.4,
    cycleDays: { lt5k: [14, 42], k5to25: [30, 90], k25to100: [90, 180], gt100: [180, 365] },
    winRateQualified: 0.22, acvRange: [3000, 25000],
    procurement: proc({
      cardLimit: 3500, quoteThreshold: 15000, rfpThreshold: 75000, boardApproval: { prob: 0.1, aboveUsd: 100000 }, fiscalYearStartMonth: 1, budgetSetMonths: [10, 11, 12], paymentTermsDays: 30,
      paperwork: [pw('w9', 0.7), pw('coi_insurance', 0.5), pw('pci_attestation', 0.5), pw('franchisor_vendor_approval', 0.25, 5000), pw('security_questionnaire', 0.3, 25000), pw('dpa', 0.35, 25000), pw('soc2_type2', 0.35, 50000)],
    }),
    channels: {
      works: ['HFTP, AH&LA and state hotel associations', 'hotel tech conferences', 'peer referral from a GM or regional VP', 'direct outreach to a management company operations leader', 'PMS marketplaces (Opera, Mews, Cloudbeds)'],
      fails: ['cold email to independents without a referral', 'generic SaaS marketplaces', 'paid social targeting "hotel managers"'],
    },
    bestContact: { channel: 'phone', times: 'Oct-Dec budget planning; avoid peak occupancy weeks' },
    methodology: M('value_selling', ['pain', 'economicBuyer', 'champion'], 'GM buys on operational pain (labour hours, complaints); group buys on standardisation and data. Short ROI based on labour saved per property; light MEDDIC for groups.'),
    scenarios: [
      sc('owner_not_gm', 'Buyer is the owner or asset manager, not the GM', 0.4, 'Managed hotels.', 'Give the GM a one-page ROI memo to forward.', { cycleMult: 1.3, winMult: 0.85, needsRole: 'economic_buyer' }),
      sc('brand_vendor_list', 'Brand-mandated preferred-vendor list blocks the purchase', 0.2, 'Branded property.', 'Check the approved-vendor list before the demo; pivot to independents or get a brand partner listing.', { cycleMult: 2, winMult: 0.4, paperwork: ['franchisor_vendor_approval'] }),
      sc('three_property_pilot', 'Management company wants a 3-property pilot', 0.3, 'Group deals.', 'Per-property rate with a rollout discount and a 90-day success metric.', { cycleMult: 1.5 }),
      sc('group_rfp', 'Procurement forces an RFP for a group deal', 0.2, 'Group procurement.', 'Get on the RFP list early; standard security and data packet; expect a price floor.', { cycleMult: 1.5, winMult: 0.6, paperwork: ['rfp_response', 'security_questionnaire'] }),
      sc('gm_leaves', 'GM leaves or property changes hands', 0.25, 'Managed properties, per year.', 'Add the regional VP as a second contact; watch news and LinkedIn.', { winMult: 0.6, stallDays: [14, 60] }),
      sc('q4_owner_freeze', 'Q4 budget freeze at owners', 0.2, 'Owner spending pause.', 'Propose a pilot now with a January start.', { winMult: 0.8, stallDays: [30, 75] }),
    ],
    objections: ['We already have a PMS with that feature.', 'The brand won\'t let us use outside vendors.', 'Labor is our main cost; we can\'t add another tool for staff.', 'We\'ll look at it next year.'],
    churnAnnual: 0.18,
    seasonality: { busy: [10, 11, 1], slow: [7, 8, 12], note: 'Q4 budget planning; avoid peak occupancy. Churn spikes when a property changes management or brand.' },
    soloFounderFit: 0.6,
    sourced: [
      'Hotel Interactive May 2026 panel on hotel procurement (Crescent Hotels & Resorts, Hilton Supply Management, Westmont Hospitality) (https://hotelinteractive.com/?p=35134, 2026-05)',
      'SaaSHero: Q4 is budget planning season and multi-stakeholder approvals are slowing in 2026 (https://www.saashero.net/uncategorized/hotel-tech-lead-gen-strategies/, 2026-06-23, marketing-informed)',
      'Protel opinion: sourcing, buying and deploying takes "many months" even with management backing (https://www.hotel-yearbook.com/article/4092737.html)',
    ],
  },
  {
    id: 'franchise_systems', label: 'Franchise systems (franchisors and franchisees)', group: 'company', models: ['smb', 'ent'], employees: [1, 500],
    keywords: ['franchise', 'franchisor', 'franchisee', 'franchised', 'franchise system', 'multi-unit operator', 'multi unit operator', 'qsr franchise'],
    examples: ['QSR brand with 2,000 franchised units', 'fitness franchise', 'home-services franchise', '12-unit franchisee'],
    committee: [
      R('economic_buyer', ['Franchisee owner-operator'], [1, 1], 0.7, true, 0.9, ['cost', 'labour', 'local customers']),
      R('user', ['Franchisee ops manager', 'Store manager'], [1, 3], 0.3, false, 0.8, ['shift workflow']),
      R('technical', ['Franchisor CIO / CTO'], [1, 1], 0.8, true, 0.6, ['integration', 'data access', 'cost to franchisees'], 25000),
      R('champion', ['Franchisor VP of franchise operations / support'], [1, 1], 0.7, true, 0.8, ['approved-supplier list'], 25000),
      R('procurement', ['Franchisor procurement / supply chain'], [1, 1], 0.6, true, 0.5, ['national-account pricing'], 25000),
      R('legal', ['Franchise counsel'], [1, 1], 0.6, true, 0.6, ['FDD Item 8', 'franchise agreement'], 25000),
      R('finance', ['Franchisor CFO'], [0, 1], 0.5, true, 0.4, ['tech-fee revenue', 'disclosure'], 25000),
      R('franchisee_council', ['Franchise advisory council'], [3, 10], 0.5, true, 0.25, ['tech-fee pushback'], 50000),
    ],
    buyerIsUserProb: 0.3,
    cycleDays: { lt5k: [7, 28], k5to25: [30, 90], k25to100: [90, 180], gt100: [180, 365] },
    winRateQualified: 0.2, acvRange: [1000, 50000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 15000, rfpThreshold: 100000, boardApproval: { prob: 0.15, aboveUsd: 250000 }, fiscalYearStartMonth: 1, budgetSetMonths: [9, 10, 11], paymentTermsDays: 30,
      paperwork: [pw('w9', 0.9), pw('coi_insurance', 0.8), pw('franchisor_vendor_approval', 0.5, 5000), pw('pci_attestation', 0.5), pw('security_questionnaire', 0.6, 25000), pw('dpa', 0.7, 25000), pw('msa_redlines', 0.6, 25000), pw('soc2_type2', 0.4, 50000)],
    }),
    channels: {
      works: ['IFA, Franchise Times and franchise expos', 'the franchisor\'s supplier-approval programme', 'franchise consultants', 'franchisee advisory councils', 'integrations with the franchisor\'s core system (POS, ordering)'],
      fails: ['direct cold outreach to franchisees across many brands', 'generic SaaS marketplaces', 'franchise-resale brokers'],
    },
    bestContact: { channel: 'email', times: 'Franchisors plan technology in Q3-Q4; franchisee buying clusters around renewals and new-unit openings' },
    methodology: M('meddpicc', ['paperProcess', 'decisionProcess', 'champion', 'economicBuyer'], 'Two motions: MEDDPICC with an approved-supplier focus for the franchisor (long and paper-heavy); value selling with a per-unit ROI and a 30-day pilot for franchisees.'),
    scenarios: [
      sc('sell_franchisor_first', 'The deal is really with the franchisor', 0.7, 'System-wide buys.', 'Get on the approved-supplier list first, then sell franchisees at a franchisor-negotiated price.', { cycleMult: 1.6, needsRole: 'champion', paperwork: ['franchisor_vendor_approval'] }),
      sc('mandated_other_vendor', 'Franchisee wants you but the franchisor mandates another vendor', 0.3, 'Mandated technology.', 'Check the agreement; request approval and propose a one-unit pilot.', { cycleMult: 1.5, winMult: 0.4 }),
      sc('single_supplier_loss', 'Franchisor approves a single supplier and you lose', 0.2, 'Mandated category.', 'Plan for the loss; negotiate a non-exclusive or regional listing.', { winMult: 0.5 }),
      sc('tech_fee_revolt', 'Franchisee tech-fee revolt', 0.12, 'Big systems, per year.', 'Make cost per unit transparent and tie to measured savings; expect the franchisor to want a cut.', { cycleMult: 1.3, winMult: 0.8, needsRole: 'franchisee_council' }),
      sc('legal_kills_data_terms', 'Franchisor legal kills the deal over data-access terms', 0.15, 'Audit rights and portability.', 'Pre-clear audit-rights and data-portability clauses with franchise counsel before the demo.', { winMult: 0.6, needsRole: 'legal', paperwork: ['dpa', 'msa_redlines'] }),
    ],
    objections: ['We can only buy from approved suppliers.', 'Our franchise agreement requires a specific system.', 'The tech fee is too high.', 'We won\'t pay for anything that isn\'t in the FDD.'],
    churnAnnual: 0.12,
    seasonality: { busy: [9, 10, 11, 1], slow: [12], note: 'Franchisor budgets Q3-Q4; franchisee budgets January.' },
    soloFounderFit: 0.3,
    sourced: [
      'McDonald\'s agreed to cut US technology fees by 62% after a third-party billing review (https://thespoon.tech/following-tensions-mcdonalds-cuts-tech-fees-for-franchisees-by-62-percent/, undated)',
      'FRANdata: 75% of franchisors expected to raise technology and innovation capital spending in 2025 (https://frandata.com/franchisors_are_doubling_down_on_technology, 2025-03)',
      'Software mandates (POS, CRM, booking) are routine if disclosed in the FDD (https://cfa.ca/start-me-up-considerations-for-franchisors-when-mandating-the-use-of-software-by-franchisees/, 2025-03); scope varies by state',
    ],
  },
  // ===== regulated =========================================================================
  {
    id: 'banks', label: 'Banks, credit unions and financial services', group: 'regulated', models: ['smb', 'ent'], employees: [5, 100000],
    keywords: ['bank', 'banking', 'credit union', 'community bank', 'financial institution', 'financial services', 'wealth management', 'broker-dealer', 'mortgage lender', 'lender', 'savings and loan', 'trust company', 'regional bank'],
    examples: ['$400M community bank with 60 staff', 'rural credit union with 15 staff', 'regional bank', 'small broker-dealer'],
    committee: [
      R('user', ['Loan officer', 'Teller lead', 'Ops analyst', 'BSA officer'], [2, 6], 0.4, false, 0.9, ['workflow', 'time saved']),
      R('champion', ['VP of operations', 'CIO / IT director', 'Innovation officer'], [1, 1], 0.7, false, 0.8, ['fit to exam findings']),
      R('economic_buyer', ['CEO / President', 'CFO'], [1, 1], 0.8, true, 0.85, ['cost', 'board optics']),
      R('technical', ['IT manager (often outsourced to the core provider)'], [1, 2], 0.6, true, 0.7, ['core integration', 'access']),
      R('security', ['Information security officer', 'Vendor manager'], [1, 1], 0.7, true, 0.95, ['SOC 2', 'pen test', 'data handling']),
      R('compliance', ['Compliance officer', 'BSA officer'], [1, 1], 0.5, true, 0.6, ['exam defensibility', 'BSA/AML']),
      R('legal', ['Outside counsel', 'GC'], [0, 1], 0.4, true, 0.4, ['contract', 'liability', 'DPA'], 25000),
      R('finance', ['Controller'], [0, 1], 0.4, false, 0.3, ['invoicing'], 25000),
      R('board', ['Board credit or audit committee'], [0, 1], 0.5, true, 0.3, ['material third-party risk'], 100000),
      R('core_provider', ['Fiserv', 'FIS', 'Jack Henry', 'Q2 partner'], [0, 1], 0.6, true, 0.4, ['integration rules', 'conflicts']),
    ],
    buyerIsUserProb: 0.25,
    cycleDays: { lt5k: [14, 45], k5to25: [45, 120], k25to100: [90, 240], gt100: [180, 540] },
    winRateQualified: 0.2, acvRange: [5000, 30000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 25000, rfpThreshold: 100000, boardApproval: { prob: 0.3, aboveUsd: 100000 }, fiscalYearStartMonth: 1, budgetSetMonths: [10, 11, 12], paymentTermsDays: 30,
      paperwork: [pw('w9', 1), pw('coi_insurance', 0.9), pw('vendor_portal', 0.3), pw('security_questionnaire', 0.5, 5000), pw('sig_lite', 0.7, 5000), pw('sig_core', 0.3, 100000), pw('soc2_type2', 0.8, 25000), pw('pen_test', 0.5, 25000), pw('dpa', 0.8), pw('bcp_dr_summary', 0.7, 5000), pw('msa_redlines', 0.6, 25000), pw('rfp_response', 0.3, 100000)],
    }),
    channels: {
      works: ['peer CIO / CEO referral at other community banks', 'state banker associations (ICBA affiliates) and credit-union leagues', 'core-provider marketplaces and app directories (Fiserv, Jack Henry)', 'state bankers conferences'],
      fails: ['cold email to bank executives', 'generic "AI" pitches', 'LinkedIn spam', 'booths without a referral'],
    },
    bestContact: { channel: 'phone', times: 'Mid-morning; avoid exam season and the last two weeks of each quarter; January for year-end' },
    methodology: M('meddpicc', ['paperProcess', 'economicBuyer', 'decisionCriteria', 'champion'], 'Many roles, a vendor-risk paper process and exam-defensible evidence. BANT-lite under $5k; Challenger for an exam finding or manual-work cost insight.'),
    scenarios: [
      sc('buyer_not_user', 'Buyer is not the user', 0.75, 'Risk and compliance sign, staff use.', 'Sell to the risk/compliance owner with a SIG and a risk-tiered review; give the loan officer a demo, not the pitch.', { cycleMult: 1.2, needsRole: 'compliance' }),
      sc('champion_leaves', 'Champion leaves mid-review', 0.2, 'Review file stalls.', 'Multi-thread early; keep the vendor-review file in your CRM.', { cycleMult: 1.3, winMult: 0.65, stallDays: [30, 90] }),
      sc('core_provider_blocker', 'Hidden core-provider blocker', 0.25, 'Core integration rules.', 'Ask in discovery which core and what integration rules apply; check the core\'s marketplace terms.', { cycleMult: 1.4, winMult: 0.6, needsRole: 'core_provider' }),
      sc('forced_rfp', 'Forced RFP at a regional or large bank', 0.3, 'Above $100k.', 'Qualify out unless you can meet it; respond with the SIG and references.', { cycleMult: 1.5, winMult: 0.5, paperwork: ['rfp_response'] }),
      sc('expense_freeze', 'Budget freeze or expense control', 0.1, 'Spending pause.', 'Smaller pilot or an annual prepay discount.', { winMult: 0.8, stallDays: [30, 90] }),
      sc('board_approval', 'Board approval needed', 0.3, 'Above $100k.', 'One-page risk and value summary; offer to present.', { cycleMult: 1.4, needsRole: 'board', paperwork: ['board_packet'] }),
    ],
    objections: ['We need a SOC 2 Type II before we can even start.', 'Our core provider handles that.', 'We can\'t put customer data in a new vendor.', 'Send us a formal proposal, we\'ll get back to you.'],
    churnAnnual: 0.075,
    seasonality: { busy: [10, 11, 12, 1], slow: [7, 8], note: 'Avoid exam windows and quarter-end; bank M&A (54 mergers in Q1 2026) drives churn; renewals repeat vendor review every 1-3 years, start 120 days ahead.' },
    soloFounderFit: 0.35,
    sourced: [
      '4,238 FDIC-insured institutions reporting Q2 2026 (https://www.fdic.gov/news/press-releases/2026/fdic-insured-institutions-reported-return-assets-126-percent-and-net, 2026-08-25)',
      '4,214 federally insured credit unions at 2026-06-30, down from 4,370 (https://ncua.gov/files/publications/analysis/quarterly-data-summary-2026-Q2.pdf, 2026)',
      'Interagency third-party risk guidance, OCC Bulletin 2023-17: due diligence scaled to risk and criticality (https://www.mofo.com/pdf/resources/insights/230620-banking-agencies-issue-joint-third-party, 2023-06)',
      'Procurement up to 18 months plus up to 18 months integration (Temenos via Chronicle.lu, vendor-cited, undated); RegTech to banks 8-18 months (https://www.saashero.net/strategy/marketing-regtech-to-banks/, 2026-08-06, consultancy)',
    ],
  },
  {
    id: 'insurance', label: 'Insurance agencies and carriers', group: 'regulated', models: ['smb', 'ent'], employees: [3, 10000],
    keywords: ['insurance', 'insurance agency', 'insurance broker', 'insurance carrier', 'independent agency', 'mga', 'wholesale broker', 'insurer', 'p&c', 'benefits broker', 'underwriter'],
    examples: ['9-person independent P&C agency', 'benefits brokerage', 'MGA', 'regional mutual carrier'],
    committee: [
      R('economic_buyer', ['Agency principal', 'Owner', 'Carrier SVP'], [1, 1], 0.9, true, 0.98, ['cost', 'carrier alignment']),
      R('user', ['Account manager', 'CSR', 'Producer'], [3, 15], 0.4, false, 0.9, ['speed', 'ease']),
      R('champion', ['Operations manager', 'AMS admin', 'VP operations'], [1, 1], 0.7, false, 0.8, ['renewal workload', 'retention']),
      R('technical', ['Outsourced MSP', 'Internal IT lead'], [0, 1], 0.4, true, 0.3, ['access', 'hosting']),
      R('security', ['Compliance officer', 'Carrier vendor manager'], [0, 1], 0.5, true, 0.3, ['NAIC data-security duties'], 25000),
      R('legal', ['Agency counsel', 'Carrier legal'], [0, 1], 0.3, false, 0.2, ['liability'], 50000),
      R('finance', ['Controller', 'Bookkeeper'], [0, 1], 0.3, false, 0.3, ['billing']),
      R('carrier', ['Carrier appointment or IT team'], [0, 1], 0.6, true, 0.4, ['approved-vendor status', 'integration']),
    ],
    buyerIsUserProb: 0.35,
    cycleDays: { lt5k: [7, 30], k5to25: [30, 90], k25to100: [60, 180], gt100: [180, 540] },
    winRateQualified: 0.25, acvRange: [1500, 12000],
    procurement: proc({
      cardLimit: 5000, fiscalYearStartMonth: 1, budgetSetMonths: [10, 11, 12], paymentTermsDays: 0,
      paperwork: [pw('w9', 0.6), pw('coi_insurance', 0.5), pw('dpa', 0.5, 5000), pw('security_questionnaire', 0.4, 12000), pw('sig_lite', 0.5, 25000), pw('soc2_type2', 0.6, 25000)],
    }),
    channels: {
      works: ['carrier and AMS integration marketplaces (Applied, Zywave, EZLynx)', 'agency associations (Big I, state associations, local groups)', 'peer referral among principals', 'Agency Universe Study and conference floors'],
      fails: ['cold outreach to principals without a referral', '"AI" pitches without an integration', 'email-only'],
    },
    bestContact: { channel: 'phone', times: 'Late Feb-May or summer; avoid Oct-Jan renewal season' },
    methodology: M('value_selling', ['pain', 'economicBuyer', 'paperProcess'], 'Quantify staff time on renewals and retention (Challenger angle); BANT is enough for small agency deals; MEDDPICC for carriers. Integration with the AMS or carrier is a decision criterion.'),
    scenarios: [
      sc('staff_dislike', 'Principal buys, staff don\'t like it', 0.3, 'Buyer is not the user.', 'Trial with 2 CSRs, measure time saved, one champion per office.', { winMult: 0.8, needsRole: 'user' }),
      sc('carrier_not_approved', 'Carrier integration required and not approved', 0.25, 'Approved-vendor gate.', 'Check the carrier vendor list early; offer a file-based workaround for the pilot.', { cycleMult: 1.5, winMult: 0.6, needsRole: 'carrier' }),
      sc('ams_lock_in', 'AMS vendor lock-in', 0.35, 'For AMS-adjacent products.', 'Position as an add-on reading from the AMS through an API, not a replacement.', { winMult: 0.75 }),
      sc('carrier_questionnaire', 'Carrier security questionnaire blocks', 0.2, 'For carrier sales.', 'SIG Lite and a SOC 2 bridge letter ready.', { cycleMult: 1.4, paperwork: ['sig_lite', 'soc2_bridge_letter'] }),
      sc('renewal_season_freeze', 'Stall during Oct-Jan renewals', 0.4, 'Workload peak.', 'Schedule starts for Feb-May.', { cycleMult: 1.4, stallDays: [30, 90] }),
      sc('bottom_up_producers', 'Producers adopted it, agency must buy', 0.2, 'Bottom-up adoption.', 'Convert at principal level with usage data.', { cycleMult: 0.7, winMult: 1.2 }),
    ],
    objections: ['Our AMS already does this.', 'We\'re not changing carriers\' systems.', 'Send me a security questionnaire.', 'Call me in January.'],
    churnAnnual: 0.08, // within SEGMENT_CHURN.insurance.annualLogoChurn (public/data/churn-reasons.js) [design]
    seasonality: { busy: [3, 4, 5, 6, 7, 8], slow: [10, 11, 12, 1], note: 'The notes list Q4 and January as agencies\' busiest workload, so sales windows are late February to summer. Agency M&A and AMS switches drive churn.' },
    soloFounderFit: 0.6,
    sourced: [
      'Future One 2026 Agency Universe Study: about 37,000 independent agencies (down from ~39,000), average headcount 9.9 (up from 8.2) (https://www.insurancejournal.com/news/national/2026/09/24/886639.htm, 2026-09-24)',
      'Forrester Wave AMS Q4 2025 names Zywave, Applied Systems, EZLynx Leaders (https://research.oz.spotlightar.com/reports/forrester-wave-insurance-agency-management-systems-q4-2025/market-definition)',
      'NAIC Insurance Data Security Model Law (2017) requires third-party oversight, breach notice and safeguards by contract; state adoption varies (https://www.daypitney.com/?p=11930)',
    ],
  },
  {
    id: 'manufacturing', label: 'Manufacturing plants', group: 'regulated', models: ['smb', 'ent'], employees: [20, 5000],
    keywords: ['manufacturing', 'manufacturer', 'plant', 'factory', 'job shop', 'fabrication', 'machine shop', 'food processing', 'plastics', 'assembly', 'oem', 'industrial', 'metal fabrication', 'cnc'],
    examples: ['50-500 person job shop', 'food and beverage plant', 'plastics maker', 'multi-plant mid-market manufacturer'],
    committee: [
      R('user', ['Shift supervisor', 'Production planner', 'Quality tech', 'Maintenance'], [5, 30], 0.4, false, 0.9, ['downtime', 'workload']),
      R('champion', ['Plant manager', 'Operations director', 'Continuous-improvement lead'], [1, 1], 0.8, false, 0.95, ['output', 'OEE', 'cost']),
      R('economic_buyer', ['Plant manager (under $50k)', 'VP Ops', 'Corporate CFO'], [1, 1], 0.8, true, 0.9, ['capex vs opex']),
      R('technical', ['Corporate IT', 'Plant IT lead', 'MSP'], [1, 3], 0.7, true, 0.75, ['network', 'access']),
      R('ot', ['Controls engineer', 'Automation lead', 'SCADA admin'], [1, 2], 0.7, true, 0.5, ['uptime', 'safety', 'PLC network'], 25000),
      R('security', ['CISO', 'OT security lead'], [0, 1], 0.6, true, 0.4, ['IEC 62443 posture', 'remote access'], 25000),
      R('quality', ['QA manager', 'Food-safety or FDA compliance'], [0, 1], 0.5, true, 0.3, ['validation', 'traceability']),
      R('procurement', ['Corporate procurement', 'Plant buyer'], [1, 1], 0.6, true, 0.5, ['vendor master', 'terms'], 25000),
      R('legal', ['Corporate counsel'], [0, 1], 0.3, false, 0.2, ['data', 'liability'], 50000),
      R('union', ['Union steward', 'HR / labor relations'], [0, 1], 0.5, true, 0.15, ['job impact', 'bargaining']),
    ],
    buyerIsUserProb: 0.2,
    cycleDays: { lt5k: [14, 45], k5to25: [45, 120], k25to100: [90, 180], gt100: [180, 365] },
    winRateQualified: 0.2, acvRange: [8000, 40000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 15000, rfpThreshold: 100000, boardApproval: { prob: 0.1, aboveUsd: 250000 }, fiscalYearStartMonth: 1, budgetSetMonths: [9, 10, 11, 12], paymentTermsDays: 45, poRequired: true,
      paperwork: [pw('w9', 0.9), pw('coi_insurance', 0.7), pw('vendor_portal', 0.4, 25000), pw('security_questionnaire', 0.6, 25000), pw('ot_security_questionnaire', 0.5, 25000), pw('soc2_type2', 0.5, 25000), pw('iso27001', 0.15, 50000), pw('dpa', 0.4, 25000), pw('msa_redlines', 0.4, 50000), pw('rfp_response', 0.2, 100000)],
    }),
    channels: {
      works: ['trade shows (Hannover Messe, Automate, IMTS, ProMat)', 'plant-manager peer groups (ASCM chapters, local manufacturing associations)', 'system integrators and machine vendors (OEM partner programmes)', 'MES and ERP integrations'],
      fails: ['IT-led cold outreach to plants', 'selling to corporate with no plant champion', 'purely digital outreach to plant managers'],
    },
    bestContact: { channel: 'phone', times: '6:00-7:00 or afternoon shift handover; avoid plant shutdown weeks and quarter-end' },
    methodology: M('meddpicc', ['pain', 'economicBuyer', 'decisionCriteria', 'paperProcess'], 'Solution-selling discipline (diagnose before demo); challenge with the cost of unplanned downtime or scrap. MEDDPICC from $25k or multi-plant; value selling for single-plant deals.'),
    scenarios: [
      sc('corporate_it_no', 'Plant manager loves it, corporate IT says no', 0.4, 'IT holds the OT decision.', 'Read-only, no-OT-network architecture with an IT-owned security review.', { cycleMult: 1.4, winMult: 0.6, needsRole: 'technical', paperwork: ['security_questionnaire'] }),
      sc('union_objection', 'Union objection', 0.1, 'Unionised plants.', 'Check the contract for bargaining obligations; bring HR and the steward into a pilot. Do not skip this step.', { cycleMult: 1.5, winMult: 0.6, needsRole: 'union' }),
      sc('ot_security_blocks', 'OT security blocks the cloud connection', 0.25, 'Inbound connections refused.', 'Edge agent or on-prem collector; outbound only.', { cycleMult: 1.3, winMult: 0.7, needsRole: 'ot', paperwork: ['ot_security_questionnaire'] }),
      sc('corporate_rfp', 'Corporate RFP for multi-plant', 0.2, 'Above $100k.', 'Respond with a SIG-equivalent and a plant reference.', { cycleMult: 1.5, winMult: 0.6, paperwork: ['rfp_response'] }),
      sc('capex_freeze', 'Capex freeze in a downturn', 0.15, 'Spend pause.', 'Convert to opex with a usage fee.', { winMult: 0.7, stallDays: [30, 120] }),
      sc('floor_adoption', 'Bottom-up adoption on the floor', 0.3, 'Needs conversion.', 'Document savings with plant data and take it to the plant manager.', { cycleMult: 0.7, winMult: 1.25 }),
    ],
    objections: ['IT owns this.', 'We don\'t connect the plant to the cloud.', 'The union has to approve.', 'Send me pricing next quarter.'],
    churnAnnual: 0.125,
    seasonality: { busy: [9, 10, 11, 1], slow: [7, 12], note: 'Capex planning in Q3-Q4; summer shutdown weeks and year-end are slow. Plant closures and corporate consolidation drive churn.' },
    soloFounderFit: 0.3,
    sourced: [
      'Manufacturing firms: 239,265 in 2022, about 98% under 500 employees (https://manufacturingleadgeneration.com/small-manufacturing-business-statistics/, 2026-03, secondary Census compilation)',
      'CDW 2025 manufacturing survey: IT makes the final decision for most OT technology (https://webobjects2.cdw.com/is/content/CDW/cdw/field-marketing/mkt80853-manufacturing-infographic.pdf, 2025); Connection e-book: IT holds 51% of purchase authority, operations 29% (undated)',
      'NIST SP 800-82 Rev. 3 expands OT scope to supply chain and cloud (https://www.nist.gov/node/1826641)',
    ],
  },
  {
    id: 'utilities', label: 'Utilities (electric, water, gas; co-ops and municipals)', group: 'regulated', models: ['ent'], employees: [10, 10000],
    keywords: ['utility', 'utilities', 'electric cooperative', 'electric co-op', 'municipal utility', 'water utility', 'gas utility', 'power company', 'rural electric', 'water district', 'electric utility', 'wastewater'],
    examples: ['rural electric co-op with 60 staff', 'city-run water utility', 'investor-owned regional utility'],
    committee: [
      R('user', ['Operations engineer', 'Field crew lead', 'Customer service rep', 'Billing'], [5, 50], 0.4, false, 0.9, ['workflow', 'reliability']),
      R('champion', ['Director of operations', 'IT manager', 'Regulatory affairs'], [1, 1], 0.7, false, 0.85, ['compliance', 'reporting']),
      R('economic_buyer', ['VP operations', 'CFO', 'CIO', 'GM (co-op/muni)'], [1, 1], 0.8, true, 0.9, ['rate recovery', 'budget']),
      R('compliance', ['CIP Senior Manager', 'Compliance manager'], [1, 1], 0.8, true, 0.3, ['CIP-013 supplier risk']),
      R('security', ['CISO', 'OT security lead'], [1, 1], 0.7, true, 0.5, ['CIP-005', 'CIP-007 access'], 25000),
      R('technical', ['IT director', 'Controls engineering'], [1, 2], 0.6, true, 0.6, ['integration']),
      R('regulator', ['Regulatory affairs', 'Rate analyst'], [0, 1], 0.5, true, 0.3, ['rate-case filings'], 100000),
      R('procurement', ['Supply chain manager'], [1, 1], 0.6, true, 0.6, ['vendor qualification'], 25000),
      R('legal', ['Corporate counsel'], [1, 1], 0.4, true, 0.6, ['liability'], 25000),
      R('board', ['Board of directors', 'Co-op board', 'State PUC'], [0, 1], 0.6, true, 0.4, ['approval of large contracts'], 100000),
      R('union', ['Local union', 'Labor relations'], [0, 1], 0.5, true, 0.2, ['job changes']),
    ],
    buyerIsUserProb: 0.2,
    cycleDays: { lt5k: [30, 60], k5to25: [60, 150], k25to100: [120, 270], gt100: [270, 540] },
    winRateQualified: 0.2, acvRange: [10000, 80000],
    procurement: proc({
      cardLimit: 3500, quoteThreshold: 25000, rfpThreshold: 50000, coopContracts: ['Sourcewell', 'NASPO ValuePoint'], boardApproval: { prob: 0.4, aboveUsd: 100000 },
      fiscalYearStartMonth: 7, budgetSetMonths: [4, 5, 6], paymentTermsDays: 30, poRequired: true,
      paperwork: [pw('w9', 1), pw('coi_insurance', 0.9), pw('vendor_portal', 0.6), pw('security_questionnaire', 0.7, 5000), pw('soc2_type2', 0.6, 25000), pw('cip013_supplier_review', 0.3), pw('vpat', 0.3, 25000), pw('dpa', 0.6), pw('msa_redlines', 0.6, 25000), pw('rfp_response', 0.4, 50000)],
    }),
    channels: {
      works: ['trade groups (APPA for munis, NRECA for co-ops, EEI for IOUs)', 'state association conferences', 'peer referrals', 'co-op purchasing programmes', 'integrations with SAP Utilities, Oracle, Esri'],
      fails: ['cold email to utility executives', 'generic AI SDR campaigns', 'booths without a referral'],
    },
    bestContact: { channel: 'phone', times: 'Around monthly co-op board cycles; Q2-Q3 budget planning; avoid storm and outage season' },
    methodology: M('meddpicc', ['paperProcess', 'decisionCriteria', 'economicBuyer', 'decisionProcess'], 'Extra weight on the paper process (RFP and PUC steps) and decision criteria (CIP compliance, reliability). Value selling for small co-ops: cost of manual work per member.'),
    scenarios: [
      sc('cip013_triggered', 'CIP-013 supplier review triggered', 0.3, 'OT-adjacent product.', 'Produce the supplier risk file early; state in writing with architecture that the product is outside BES Cyber Systems.', { cycleMult: 1.5, winMult: 0.6, needsRole: 'compliance', paperwork: ['cip013_supplier_review'] }),
      sc('public_rfp', 'Public RFP required above a threshold', 0.4, 'Above $25k.', 'Decide quickly whether to bid; meet the compliance checklist and references.', { cycleMult: 1.6, winMult: 0.5, paperwork: ['rfp_response'] }),
      sc('rate_case_timing', 'Rate-case timing delays budget', 0.2, 'Capital recovery.', 'Align the start date to the approved capital plan or propose an opex pilot.', { cycleMult: 1.4, stallDays: [30, 120] }),
      sc('coop_price_cap', 'Cooperative contract limits your price', 0.15, 'Purchasing programme terms.', 'Check the co-op\'s terms before proposing.', { winMult: 0.8, paperwork: ['coop_contract'] }),
      sc('incumbent_migration', 'Incumbent S/4HANA or GIS migration takes the budget', 0.25, 'Budget competition.', 'Integrate with the incumbent or position as an add-on.', { winMult: 0.7, stallDays: [30, 90] }),
      sc('storm_freeze', 'Storm or outage crisis freezes projects', 0.1, 'Weather.', 'Reschedule and keep the champion warm.', { stallDays: [14, 60] }),
    ],
    objections: ['CIP-013 says we have to review every supplier.', 'We need a formal RFP.', 'This should go through capital planning.', 'We\'re waiting on the S/4 migration.'],
    churnAnnual: 0.045, // within SEGMENT_CHURN.utilities.annualLogoChurn (public/data/churn-reasons.js) [design]
    seasonality: { busy: [4, 5, 10, 11], slow: [7, 8, 9, 12], note: 'Budget planning Q2-Q3, board approvals Q4; storm and hurricane season and year-end are slow. Renewals run 3-5 years.' },
    soloFounderFit: 0.2,
    sourced: [
      'EIA: 163.7 million ultimate electricity customers in 2024 (161.7 million in 2023) (https://www.eia.gov/electricity/annual/html/epa_02_01.html)',
      'BLS: utilities had the highest unionisation rate by industry in 2025 at 17.8% (https://www.bls.gov/news.release/archives/union2_02182026.htm, 2026-02-18)',
      'NERC draft CIP-013-4 posted 2026; ballot window ran to Oct 15 so the Oct 7 board date may have slipped (https://www.nerc.com/globalassets/standards/projects/2025-06/formal-posting-1/cip-013-4-standard-clean-final-04282026.pdf); verify with NERC',
      'Vendor blog: grid infrastructure software takes 6-18 months, compliance/analytics 3-9, SCADA/OT 12-36 (https://www.knowlee.ai/blog/ai-sdr-for-energy-utilities-2026, 2026, unverified marketing estimate)',
    ],
  },

  // ===== public ============================================================================
  {
    id: 'local_gov', label: 'City and county government', group: 'public', models: ['smb', 'ent'], employees: [3, 10000],
    keywords: ['city government', 'county government', 'county', 'municipal', 'municipality', 'city of', 'town of', 'village of', 'local government', 'parks and recreation', 'public works', 'city hall', 'township', 'sheriff', 'police department', 'fire department', 'county clerk', 'government'],
    examples: ['county records office', 'city parks and recreation department', 'public works department', 'police records unit', 'city clerk'],
    committee: [
      R('user', ['Dept staff', 'Clerks', 'Inspectors'], [3, 20], 0.3, false, 0.9, ['ease of use', 'replaces a spreadsheet or paper']),
      R('champion', ['Department head', 'Deputy director'], [1, 1], 0.7, true, 0.95, ['visible backlog', 'budget line']),
      R('economic_buyer', ['City manager', 'County administrator', 'Department director'], [1, 1], 0.8, true, 0.6, ['budget', 'liability', 'political optics']),
      R('technical', ['IT director', 'GIS or systems admin'], [1, 2], 0.6, true, 0.6, ['integration', 'hosting', 'SSO']),
      R('security', ['IT security officer', 'CISO'], [0, 1], 0.5, true, 0.25, ['data classification', 'CJIS'], 25000),
      R('legal', ['City attorney', 'County counsel'], [1, 1], 0.5, true, 0.4, ['indemnity', 'data ownership', 'governing law'], 25000),
      R('procurement', ['Purchasing agent'], [0, 1], 0.6, true, 0.3, ['bid compliance', 'sole-source justification'], 15000),
      R('finance', ['Finance director', 'Auditor'], [1, 1], 0.5, true, 0.5, ['appropriation', 'P-card rules']),
      R('board', ['Council', 'County commissioners'], [5, 7], 0.9, true, 0.6, ['public scrutiny', 'vendor relationships'], 30000),
      R('union', ['Residents / bargaining units'], [0, 1], 0.3, true, 0.05, ['job displacement', 'privacy']),
    ],
    buyerIsUserProb: 0.35,
    cycleDays: { lt5k: [1, 14], k5to25: [14, 56], k25to100: [60, 180], gt100: [180, 540] },
    winRateQualified: 0.28, acvRange: [3000, 30000],
    procurement: proc({
      cardLimit: 2000, quoteThreshold: 5000, rfpThreshold: 50000, coopContracts: ['Sourcewell', 'OMNIA Partners', 'NASPO ValuePoint', 'state contracts'], boardApproval: { prob: 0.5, aboveUsd: 50000 },
      fiscalYearStartMonth: 7, budgetSetMonths: [3, 4, 5, 6], paymentTermsDays: 30, poRequired: true,
      paperwork: [pw('w9', 1), pw('coi_insurance', 0.8), pw('vendor_portal', 0.5, 5000), pw('security_questionnaire', 0.5, 25000), pw('soc2_type2', 0.3, 50000), pw('vpat', 0.3, 25000), pw('dpa', 0.5, 5000), pw('sole_source_justification', 0.25, 5000), pw('rfp_response', 0.4, 50000), pw('cjis_addendum', 0.08, 5000)],
    }),
    channels: {
      works: ['direct calls and emails to department heads', 'in-person demos at the department', 'state municipal league and county association conferences', 'peer referral from another city', 'public-sector user groups', 'cooperative contracts'],
      fails: ['cold email to a generic procurement@ address', 'LinkedIn ads for "city government"', 'booths unless category leader', 'marketplaces with no buyer traffic'],
    },
    bestContact: { channel: 'phone', times: 'Jan-Mar for July-start budgets; avoid two weeks after the budget passes and the month before fiscal year end' },
    methodology: M('value_selling', ['decisionProcess', 'paperProcess', 'champion', 'metrics'], 'Value selling plus MEDDIC-lite: quantify backlog hours, find the budget line and map the approval path (threshold, council agenda deadlines). BANT is too weak because "budget" is a line item and fiscal-year timing.'),
    scenarios: [
      sc('manager_wont_sign', 'Dept head and user want it, city manager won\'t sign', 0.65, 'Buyer is not the user.', 'One-page memo the champion can present: cost, sunset clause, sole-source justification if needed.', { cycleMult: 1.3, winMult: 0.8, needsRole: 'economic_buyer', paperwork: ['sole_source_justification'] }),
      sc('champion_retires', 'Champion leaves or retires', 0.12, 'Per year.', 'Multi-thread early (two users and one signer); keep the contract in a renewal calendar.', { cycleMult: 1.4, winMult: 0.6, stallDays: [30, 90] }),
      sc('it_security_blocker', 'Hidden blocker in IT or security', 0.3, 'Above $25k.', 'Send the security packet before the demo; ask IT directly what would prevent approval.', { cycleMult: 1.3, winMult: 0.7, needsRole: 'technical', paperwork: ['security_questionnaire'] }),
      sc('forced_rfp', 'Forced RFP just above the formal threshold', 0.25, 'The $25k-$100k band.', 'Shape the RFP criteria through the champion or walk away if they favour an incumbent.', { cycleMult: 1.8, winMult: 0.45, paperwork: ['rfp_response'] }),
      sc('fiscal_slip', 'Budget freeze or fiscal-year slip', 0.15, 'Downturn.', 'Pilot under the informal threshold from another line (grant or P-card); convert next fiscal year.', { cycleMult: 1.5, winMult: 0.8, stallDays: [30, 150] }),
      sc('bottom_up_pcard', 'Staff on a P-card, then a conversion request', 0.15, 'Bottom-up adoption.', 'Convert to a department or county contract with a price step-up; PO-ready quote.', { cycleMult: 0.8, winMult: 1.2 }),
    ],
    objections: ['We have to go out to bid for anything over our threshold.', 'We\'re not allowed to pay for SaaS out of operating funds.', 'Our IT department has to approve every application.', 'We have no budget until July.'],
    churnAnnual: 0.1,
    seasonality: { busy: [1, 2, 3, 4], slow: [7, 12], note: 'Planning and council approvals Jan-Apr; renewals are a budget event and cancellation decisions happen 60-90 days before the fiscal year.' },
    soloFounderFit: 0.5,
    sourced: [
      'GovTech analysis of 97 large cities: 37 at a $50,000 no-bid threshold, 16 at $25,000, Colorado Springs highest at $200,000 (https://govtech.com/biz/data/finding-the-magic-line-below-which-cities-can-buy-stuff-easily.html, undated)',
      'Spokane P-card default $1,000 per transaction and $5,000 per month, ceiling $5,000 / $25,000 (https://static.spokanecity.org/documents/opendata/policies/2025/admin-5600-25-01.pdf, 2025); Martinsville VA $1,500 / $3,500; Los Altos CA $2,500',
      'Gunnison UT raised its no-bid limit from $500 to $5,000 in March 2026 (AI meeting summary, verify minutes: https://cpo.soar.com/articles/7701701/Gunnison/Sanpete-County/Utah/Council-raises-no-bid-procurement-ceiling-from-500-to-5000)',
    ],
  },
  {
    id: 'state_gov', label: 'State government agencies', group: 'public', models: ['ent'], employees: [1000, 100000],
    keywords: ['state government', 'state agency', 'state department', 'department of health', 'department of transportation', 'state dot', 'medicaid agency', 'state of', 'state procurement', 'state university system'],
    examples: ['state Department of Health', 'state DOT', 'state HR system', 'Medicaid case-management program'],
    committee: [
      R('user', ['Agency program staff'], [3, 20], 0.3, false, 0.9, ['workflow']),
      R('champion', ['Agency program director'], [1, 1], 0.7, true, 0.95, ['writes the requirements']),
      R('economic_buyer', ['Deputy director', 'Agency head'], [1, 1], 0.8, true, 0.85, ['appropriation', 'risk']),
      R('technical', ['Agency CIO / IT'], [1, 1], 0.6, true, 0.8, ['integration', 'hosting']),
      R('security', ['State CISO or security office'], [1, 1], 0.7, true, 0.8, ['GovRAMP status', 'external review']),
      R('procurement', ['State purchasing office'], [1, 2], 0.6, true, 0.85, ['solicitation rules', 'cooperative orders']),
      R('legal', ['Attorney General\'s office'], [1, 1], 0.5, true, 0.6, ['contract terms'], 100000),
      R('finance', ['OMB / State CFO'], [1, 1], 0.6, true, 0.6, ['funding'], 25000),
      R('accessibility', ['Accessibility office'], [0, 1], 0.4, true, 0.5, ['VPAT scrutiny'], 25000),
      R('board', ['Legislature / budget committee'], [0, 1], 0.3, true, 0.15, ['appropriations'], 500000),
    ],
    buyerIsUserProb: 0.25,
    cycleDays: { lt5k: [7, 28], k5to25: [30, 90], k25to100: [90, 270], gt100: [270, 540] },
    winRateQualified: 0.22, acvRange: [15000, 150000],
    procurement: proc({
      cardLimit: 5000, quoteThreshold: 25000, rfpThreshold: 50000, coopContracts: ['NASPO ValuePoint', 'Sourcewell', 'OMNIA Partners'], boardApproval: { prob: 0.1, aboveUsd: 500000 },
      fiscalYearStartMonth: 7, budgetSetMonths: [1, 2, 3, 4, 5, 6], paymentTermsDays: 35, poRequired: true,
      paperwork: [pw('w9', 1), pw('coi_insurance', 1), pw('vendor_portal', 0.9), pw('vpat', 0.8, 25000), pw('soc2_type2', 0.7, 25000), pw('govramp', 0.5, 25000), pw('tx_ramp', 0.1, 25000), pw('security_questionnaire', 0.8, 25000), pw('dpa', 0.7), pw('sole_source_justification', 0.1), pw('msa_redlines', 0.5, 50000), pw('rfp_response', 0.4, 50000)],
    }),
    channels: {
      works: ['cooperative contract listings (Sourcewell, OMNIA, NASPO)', 'state association conferences', 'in-person meetings with state program staff', 'partnerships with SIs that hold state contracts', 'a GovRAMP or TX-RAMP status letter sent early'],
      fails: ['cold outbound to an agency\'s central mailbox', 'booths with no state-level programme', 'marketplaces without a contract vehicle'],
    },
    bestContact: { channel: 'in_person', times: 'Legislative session January-June; avoid the final weeks of the fiscal year' },
    methodology: M('meddpicc', ['paperProcess', 'decisionProcess', 'champion', 'competition'], 'Long, formal decision and paper processes with the economic buyer often a deputy director or budget office; competition includes an existing cooperative contract.'),
    scenarios: [
      sc('forced_rfp', 'Forced RFP above the state threshold', 0.4, 'Over $25k.', 'Get into the requirements phase; ask the champion for measurable criteria; prepare a GovRAMP-ready package.', { cycleMult: 1.8, winMult: 0.5, paperwork: ['rfp_response'] }),
      sc('govramp_missing', 'GovRAMP status missing when the state requires it', 0.4, 'Common since 2026 deadlines.', 'Start the GovRAMP assessment now; if the state accepts "in progress", sign a letter with a date.', { cycleMult: 1.5, winMult: 0.5, needsRole: 'security', paperwork: ['govramp'] }),
      sc('coop_covers_category', 'A cooperative contract already covers the category', 0.3, 'Competition from a vehicle.', 'Find the co-op and participating-addendum state; sell as an order against an existing contract, which skips the RFP.', { cycleMult: 0.7, paperwork: ['coop_contract'] }),
      sc('state_budget_freeze', 'Budget freeze at the state level', 0.17, 'Downturn.', 'Pilot funded from a grant or existing contract line; plan for the next session.', { winMult: 0.75, stallDays: [60, 180] }),
      sc('agency_it_blocks', 'Agency IT blocks an integration', 0.25, 'IT approval.', 'No-integration first phase with SSO-only; security review in phase two.', { cycleMult: 1.3, winMult: 0.75, needsRole: 'technical' }),
      sc('appropriation_required', 'Legislative appropriation required for a large contract', 0.15, 'Big deals.', 'Align the pitch with the appropriation cycle; champion carries it to the budget committee.', { cycleMult: 2, needsRole: 'board', paperwork: ['board_packet'] }),
    ],
    objections: ['We have to use a cooperative contract.', 'Your product isn\'t GovRAMP authorized.', 'We need to see an RFP.', 'Our budget is set for next fiscal year.'],
    churnAnnual: 0.085,
    seasonality: { busy: [1, 2, 3, 4, 5, 6, 8, 9], slow: [7, 12], note: 'Legislative session sets budgets Jan-Jun; August-September is year-end spend in July-start states; missing an option-year notice can force a rebid.' },
    soloFounderFit: 0.25,
    sourced: [
      'North Carolina: GovRAMP required for the executive branch from 2026-04-01, full compliance 2027-04-01 (https://www.doa.nc.gov/pandc/understanding-govramp-agency-procurement-overview/download, secondary summary)',
      'Arizona: renewal contracts from 2026-07-01 carry GovRAMP or FedRAMP-aligned risk-assessment requirements (https://govramp.org/programs/arizona)',
      'NASPO ValuePoint is run by a lead state; other states join by participating addendum; no open enrolment (https://civiciq.com/blog/how-to-get-on-a-cooperative-purchasing-contract, secondary)',
      'Gartner public-sector cycle of about 22 months, secondhand and an upper bound only (https://pinerycapital.substack.com/p/not-on-the-panel-687)',
    ],
  },
  {
    id: 'federal', label: 'Federal government (civilian and defense)', group: 'public', models: ['ent'], employees: [1000, 2000000],
    keywords: ['federal agency', 'federal government', 'federal', 'department of defense', 'dod', 'army', 'navy', 'air force', 'nasa', 'veterans affairs', 'dhs', 'hhs', 'cdc', 'gsa', 'contracting officer', 'sbir', 'sam.gov'],
    examples: ['CDC or HHS program office', 'VA clinic system', 'Army or Air Force IT programme', 'NASA centre', 'DHS component'],
    committee: [
      R('user', ['Programme staff', 'Analysts'], [3, 20], 0.3, false, 0.9, ['workflow']),
      R('contracting_officer', ['Contracting Officer (CO)'], [1, 1], 0.8, true, 1.0, ['award compliance']),
      R('champion', ['Programme manager', 'COR'], [1, 1], 0.7, true, 1.0, ['manages the work after award']),
      R('security', ['ISSO / ISSM', 'FedRAMP / ATO review board', 'CISO'], [1, 2], 0.75, true, 0.85, ['ATO', 'FedRAMP status'], 15000),
      R('technical', ['Agency CIO'], [1, 1], 0.7, true, 0.6, ['architecture', 'hosting'], 25000),
      R('small_business_office', ['OSBP'], [0, 1], 0.5, false, 0.3, ['set-aside designation'], 25000),
      R('legal', ['General counsel'], [1, 1], 0.5, true, 0.5, ['terms'], 100000),
      R('economic_buyer', ['Programme-office budget holder', 'Requiring-activity director'], [1, 1], 0.8, true, 0.9, ['programme funds', 'fiscal-year obligation']),
      R('finance', ['Budget office'], [1, 1], 0.6, true, 0.6, ['fiscal year', 'appropriations']),
    ],
    buyerIsUserProb: 0.2,
    cycleDays: { lt5k: [3, 14], k5to25: [7, 45], k25to100: [30, 120], gt100: [90, 540] },
    winRateQualified: 0.15, acvRange: [25000, 200000],
    procurement: proc({
      cardLimit: 15000, quoteThreshold: 15000, rfpThreshold: 350000, coopContracts: ['GSA Multiple Award Schedule', 'GSA OneGov'], boardApproval: { prob: 0, aboveUsd: NEVER },
      fiscalYearStartMonth: 10, budgetSetMonths: [1, 2, 3], paymentTermsDays: 30, poRequired: true,
      paperwork: [pw('sam_registration', 1), pw('w9', 1), pw('coi_insurance', 0.9), pw('vpat', 0.8, 15000), pw('fedramp', 0.6, 15000), pw('security_questionnaire', 0.7, 15000), pw('gsa_schedule', 0.35, 50000), pw('msa_redlines', 0.3, 50000), pw('rfp_response', 0.5, 350000)],
    }),
    channels: {
      works: ['GSA schedule holders and resellers (Carahsoft-style)', 'SBIR topics aligned with an agency need', 'agency-specific conferences and industry days', 'prime contractor partnerships', 'Q4 timing for budget-ready programmes'],
      fails: ['cold email to federal officials without a sponsor', 'booths for unrelated agencies', 'general SaaS marketplaces', 'LinkedIn outbound to "federal IT"'],
    },
    bestContact: { channel: 'email', times: 'Jul-Sep (use-it-or-lose-it spend); Jan-Mar for new-fiscal-year budgets' },
    methodology: M('meddpicc', ['paperProcess', 'decisionCriteria', 'economicBuyer', 'competition'], 'Heavy paper-process focus: the CO, programme office and ISSO each hold a distinct gate. Help write the decision criteria in the solicitation; economic buyer is programme-office funds, not the CIO.'),
    scenarios: [
      sc('open_competition', 'Forced open competition above the SAT ($350k)', 0.5, 'Above $350k.', 'Get involved in the statement of work before the solicitation; prepare FedRAMP and VPAT packages.', { cycleMult: 2, winMult: 0.4, paperwork: ['rfp_response'] }),
      sc('micro_purchase', 'Micro-purchase on a government card', 0.3, 'Below $15k (threshold raised from $10k on 2025-10-01).', 'Make the card path easy and keep a schedule-ready price list.', { cycleMult: 0.3, winMult: 1.5 }),
      sc('fedramp_gap', 'FedRAMP or ATO gap blocks the award', 0.6, 'Cloud deals.', 'Ask whether a provisional ATO is acceptable; otherwise sell non-cloud or partner with a FedRAMP-authorized host.', { cycleMult: 1.5, winMult: 0.3, needsRole: 'security', paperwork: ['fedramp'] }),
      sc('q4_fund_expiry', 'Q4 fund expiry rush', 0.3, 'July-September awards.', 'Target the Q4 window with a fast schedule order; expect delivery within 60 days.', { cycleMult: 0.6, winMult: 1.2 }),
      sc('reseller_only', 'Reseller takes the deal', 0.4, 'Schedule-driven buys.', 'Register with the reseller\'s partner programme; accept a margin 15-30% below direct and ask for co-selling.', { winMult: 0.9, paperwork: ['gsa_schedule'] }),
      sc('sbir_proof_not_sale', 'SBIR award is a proof point but not a sale', 0.3, 'SBIR reauthorised 2026-04-13.', 'Use Phase I to build a Phase II pitch; expect 12-24 months to a production contract.', { cycleMult: 2 }),
    ],
    objections: ['We can only buy off the schedule.', 'Your product needs FedRAMP.', 'We\'re already under a OneGov agreement.', 'We don\'t have an ATO.'],
    churnAnnual: 0.1, // within SEGMENT_CHURN.federal.annualLogoChurn (public/data/churn-reasons.js) [design]
    seasonality: { busy: [7, 8, 9], slow: [12, 1], note: 'DoD obligated $93.4B in September 2025, $50.1B in the last five working days; about 32% of annual contract dollars fall in the last three months (2015 Bloomberg Government, dated).' },
    soloFounderFit: 0.2,
    sourced: [
      'FAR thresholds from 2025-10-01: micro-purchase $10,000 to $15,000; simplified acquisition threshold $250,000 to $350,000 (https://www.ncmbc.us/far-thresholds-are-changing-on-october-1-2025/); check FAR 2.101',
      'SBIR/STTR lapsed ~6 months after 2025-09-30; reauthorised through 2031-09-30 by P.L. 119-83 signed 2026-04-13 (https://www.everycrsreport.com/reports/IN12705.html)',
      'GSA OneGov launched April 2025 with 17 technology agreements claiming discounts up to 90%, self-reported (https://www.gsa.gov/blog/2026/01/12/restoring-common-sense-to-government-acquisition, 2026-01-12)',
      'FedRAMP CR26 dates (mandatory 2027-01-01) from Knox Systems conflict with FedRAMP milestones; verify (https://knoxsystems.com/resources/fedramp-news-2026, 2026-07)',
      'DoD obligated $93.4B in Sept 2025 (https://govintegrity.substack.com/p/washingtons-september-spending-spree, citing Open the Books)',
    ],
  },
  // ===== education =========================================================================
  {
    id: 'k12', label: 'K-12 school districts', group: 'education', models: ['smb', 'ent'], employees: [10, 20000],
    keywords: ['school district', 'k-12', 'k12', 'public school', 'charter school', 'charter network', 'school board', 'elementary school', 'middle school', 'high school', 'district office', 'school'],
    examples: ['rural district of 800 students', 'suburban district of 12,000 students', 'charter network of 5-20 schools'],
    committee: [
      R('user', ['Teachers'], [10, 100], 0.3, false, 0.9, ['time', 'fit to standards', 'usability']),
      R('champion', ['Instructional coach', 'Curriculum director', 'Tech integrator', 'Principal'], [1, 3], 0.6, true, 0.95, ['proof of learning', 'workload']),
      R('economic_buyer', ['Principal (under threshold)', 'Superintendent', 'CAO'], [1, 1], 0.8, true, 0.95, ['budget line', 'board risk']),
      R('board', ['Board of education'], [5, 9], 0.7, true, 0.5, ['public optics', 'budget'], 25000),
      R('technical', ['Director of technology', 'Data systems', 'Network admin'], [1, 3], 0.7, true, 0.85, ['SSO (Clever, ClassLink)', 'rostering', 'security']),
      R('privacy', ['Privacy / compliance (often part-time)'], [0, 1], 0.6, true, 0.6, ['NDPA', 'state exhibits', 'FERPA', 'COPPA']),
      R('legal', ['District counsel'], [0, 1], 0.4, true, 0.35, ['redlines on liability and data'], 25000),
      R('procurement', ['Purchasing director'], [0, 1], 0.6, true, 0.5, ['bid compliance', 'cooperative use'], 5000),
      R('finance', ['Chief business official'], [0, 1], 0.6, true, 0.5, ['fund source (general, Title, grant)'], 5000),
      R('special_programs', ['Special ed / ELL directors'], [0, 1], 0.3, false, 0.15, ['accommodations', 'language access']),
    ],
    buyerIsUserProb: 0.1,
    cycleDays: { lt5k: [14, 60], k5to25: [60, 150], k25to100: [150, 300], gt100: [270, 540] },
    winRateQualified: 0.21, acvRange: [4000, 35000],
    procurement: proc({
      cardLimit: 2500, quoteThreshold: 10000, rfpThreshold: 50000, coopContracts: ['Sourcewell', 'OMNIA Partners', 'TIPS', 'BuyBoard', 'state buying groups'], boardApproval: { prob: 0.5, aboveUsd: 25000 },
      fiscalYearStartMonth: 7, budgetSetMonths: [1, 2, 3, 4, 5], paymentTermsDays: 45, poRequired: true,
      paperwork: [pw('w9', 1), pw('coi_insurance', 0.8), pw('sdpc_ndpa', 0.85), pw('security_questionnaire', 0.6, 5000), pw('vpat', 0.5, 5000), pw('vendor_portal', 0.3), pw('soc2_type2', 0.3, 25000), pw('dpa', 0.3), pw('board_packet', 0.5, 25000), pw('rfp_response', 0.25, 50000)],
    }),
    channels: {
      works: ['free or cheap teacher-level use that converts to a school-level paid pilot', 'principal-to-principal referral', 'state and regional ed-tech conferences and CoSN', 'Clever and ClassLink app libraries', 'cooperative contract listings', 'NDPA listings in state registries'],
      fails: ['cold outreach to superintendents in Aug-Sep', 'mass demo requests from teachers with no admin sponsor', 'big trade-show booths for sub-$50k vendors'],
    },
    bestContact: { channel: 'email', times: 'Oct-Dec planning, Jan-Mar budget proposals, May spend-down; avoid late August and the last two weeks of June' },
    methodology: M('meddpicc', ['champion', 'economicBuyer', 'decisionProcess', 'paperProcess'], 'MEDDPICC with Process (board calendar, bid rule) and Paper (NDPA, security form, insurance) tracked from call one. SPIN for teacher discovery; Challenger is too aggressive for a privacy-fearful principal.'),
    scenarios: [
      sc('bottom_up_no_admin', 'Bottom-up adoption, no admin knows', 0.3, 'Teachers use it.', 'Pull usage by school, have the strongest teacher send it to the principal, offer a school PO under threshold, then bring in IT.', { cycleMult: 0.8, winMult: 1.1, needsRole: 'economic_buyer' }),
      sc('board_threshold', 'Deal crosses the board threshold', 0.25, 'Needs a vote.', 'Map the board calendar; board packet with budget line and an endorsing teacher leader; allow 8-12 weeks.', { cycleMult: 1.5, needsRole: 'board', paperwork: ['board_packet'], stallDays: [30, 84] }),
      sc('privacy_stalls', 'Privacy review stalls', 0.25, 'NDPA and state exhibits.', 'Pre-filled NDPA with the state exhibit, data map and one-page security summary; SOC 2 or pen-test letter ready.', { cycleMult: 1.4, winMult: 0.8, needsRole: 'privacy', paperwork: ['sdpc_ndpa', 'security_questionnaire'] }),
      sc('budget_cut', 'Budget cut or consolidation', 0.2, 'ESSER funds gone; 2026-27.', 'Position as the replacement for a duplicate tool; one-year term at lower price or per-school pricing under threshold.', { winMult: 0.7, stallDays: [30, 120] }),
      sc('forced_rfp', 'Forced RFP', 0.12, 'Over the bid limit.', 'Respond only if the fit is real; RFP scoring rewards breadth.', { cycleMult: 1.7, winMult: 0.4, paperwork: ['rfp_response'] }),
      sc('champion_transfers', 'Champion transfers mid-deal', 0.15, 'Single threaded.', 'Find a second sponsor in the same building; re-run the value case.', { cycleMult: 1.3, winMult: 0.65, stallDays: [30, 90] }),
    ],
    objections: ['We don\'t have budget until July.', 'Our board has to approve anything over $X.', 'Are you FERPA and COPPA compliant? Do you have our DPA?', 'Teachers already use free tools.', 'We\'re consolidating vendors.'],
    churnAnnual: 0.16,
    seasonality: { busy: [10, 11, 1, 2, 3, 5], slow: [6, 8, 12], note: 'About 80% of purchases close May-July (nationgraph, secondary); October is a planning window, not a close window; renewals are often not auto-renewals.' },
    soloFounderFit: 0.35,
    sourced: [
      'EdWeek Research Center (223 leaders, cited secondhand): 37% of purchases took 6-11 months, 22% took 12-17 months, 78% six months or longer (https://prospeo.io/s/edtech-go-to-market-strategy, undated, unverified)',
      'California district bid threshold $114,800 from 2025-01-01 (https://www.lcwlegal.com/news/bid-threshold-increased-to-114800-for-community-college-and-school-district-contracts/, 2025-01-06); NY model policy $20,000 for supplies (https://www.niskayunaschools.org/board-of-education/board-policies/board-of-education-policy-5400-purchasing-procurement-of-goods-and-services/)',
      'NCSL: 46 states start the fiscal year on July 1 (https://www.ncsl.org/state-legislatures-news/details/almost-all-states-began-new-fiscal-year-with-enacted-budgets, FY2025)',
      'Amended COPPA rule effective 2025-06-23, compliance due 2026-04-22 (https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm, 2025-04-22)',
      'ESSER funds are gone (https://edtechmagazine.com/k12/article/2026/08/esser-funds-are-gone-heres-how-k-12-it-leaders-replace-them-perfcon, 2026-08-07)',
      'SDPC registry: 130,000+ signed DPAs, 12,000+ districts, 6,674 providers; NDPA v2.2 published 2025-11-19 (https://www.wsipc.org/news/version-two-of-sdpcs-national-data-privacy-agreement-is-available)',
    ],
  },
  {
    id: 'higher_ed', label: 'Colleges and universities', group: 'education', models: ['smb', 'ent'], employees: [200, 50000],
    keywords: ['university', 'college', 'community college', 'campus', 'higher education', 'higher ed', 'provost', 'school of medicine', 'academic department', 'liberal arts'],
    examples: ['community college of 8,000 students', 'regional public of 15,000', 'private liberal-arts college of 2,000', 'R1 university with a medical school'],
    committee: [
      R('user', ['Faculty', 'Staff', 'Students'], [5, 50], 0.4, false, 0.9, ['usability', 'LMS fit', 'workload']),
      R('champion', ['Department chair', 'Program director', 'Teaching and learning center director'], [1, 2], 0.6, true, 0.95, ['pedagogy', 'student outcomes']),
      R('economic_buyer', ['Dean', 'Associate dean'], [1, 1], 0.7, true, 0.85, ['budget', 'accreditation']),
      R('technical', ['CIO', 'IT director', 'Enterprise architect'], [1, 2], 0.8, true, 0.85, ['integration', 'support load', 'shadow IT']),
      R('security', ['CISO', 'ISO'], [1, 1], 0.8, true, 0.8, ['HECVAT', 'SSO', 'pen tests'], 5000),
      R('privacy', ['FERPA officer', 'Registrar'], [0, 1], 0.6, true, 0.5, ['FERPA', 'student records'], 5000),
      R('accessibility', ['Accessibility coordinator'], [0, 1], 0.6, true, 0.6, ['VPAT', 'WCAG 2.1 AA'], 5000),
      R('procurement', ['Purchasing director'], [1, 1], 0.6, true, 0.6, ['bids', 'sole-source justification'], 10000),
      R('legal', ['General counsel', 'Contracts office'], [0, 1], 0.5, true, 0.4, ['liability', 'data indemnity', 'AI terms'], 25000),
      R('finance', ['Budget director', 'Bursar'], [0, 1], 0.5, true, 0.5, ['fund source', 'year-end']),
      R('union', ['Faculty senate committee', 'Grad-student union'], [0, 1], 0.3, false, 0.1, ['AI policy', 'surveillance', 'IP']),
    ],
    buyerIsUserProb: 0.3,
    cycleDays: { lt5k: [14, 45], k5to25: [45, 120], k25to100: [120, 240], gt100: [270, 540] },
    winRateQualified: 0.21, acvRange: [3000, 25000],
    procurement: proc({
      cardLimit: 3000, quoteThreshold: 15000, rfpThreshold: 100000, coopContracts: ['Sourcewell', 'OMNIA Partners'], boardApproval: { prob: 0.05, aboveUsd: 250000 },
      fiscalYearStartMonth: 7, budgetSetMonths: [1, 2], paymentTermsDays: 40, poRequired: true,
      paperwork: [pw('w9', 1), pw('coi_insurance', 0.8), pw('hecvat', 0.8, 5000), pw('vpat', 0.7, 5000), pw('security_questionnaire', 0.4, 5000), pw('soc2_type2', 0.5, 25000), pw('dpa', 0.6), pw('sole_source_justification', 0.2, 25000), pw('rfp_response', 0.25, 100000)],
    }),
    channels: {
      works: ['EDUCAUSE and IT conferences (usually fall)', 'faculty champions presenting at teaching-centre events', 'peer referral from other campuses', 'LTI integrations with Canvas, Blackboard, Brightspace', 'a published HECVAT sent before the first demo'],
      fails: ['cold email to provosts or CIOs', 'generic booths', 'sales calls during finals or holiday break'],
    },
    bestContact: { channel: 'email', times: 'Sep-Oct (fall start) and Jan-Mar (department budget requests); avoid December and finals' },
    methodology: M('meddpicc', ['paperProcess', 'economicBuyer', 'champion', 'decisionCriteria'], 'HECVAT, VPAT and FERPA treated as an early paper step, not a late hurdle. SPIN for faculty; value selling for deans framed around enrolment, retention or accreditation.'),
    scenarios: [
      sc('pcard_then_it_blocks', 'Department buys on P-card, central IT blocks later', 0.25, 'Shadow purchase.', 'Build the HECVAT before selling; offer a pilot on the department\'s own budget while the IT review runs.', { winMult: 0.8, needsRole: 'technical', paperwork: ['hecvat'] }),
      sc('hecvat_midway', 'HECVAT requested mid-deal and you don\'t have one', 0.3, 'Security gate.', 'Keep a full HECVAT and a lite version on file; answer within 5 business days.', { cycleMult: 1.4, needsRole: 'security', paperwork: ['hecvat'], stallDays: [14, 60] }),
      sc('lms_required', 'LMS integration required', 0.2, 'Canvas / LTI.', 'Show the LTI path and admin setup time; if not built, say so.', { cycleMult: 1.2, winMult: 0.8 }),
      sc('dean_leaves', 'Dean or champion leaves or goes on sabbatical', 0.15, 'Single threaded.', 'Second sponsor in the same department or teaching centre.', { cycleMult: 1.3, winMult: 0.65, stallDays: [30, 120] }),
      sc('purchasing_rfp', 'Forced purchasing RFP above a threshold', 0.15, 'Policy.', 'Respond only if the fit is real.', { cycleMult: 1.7, winMult: 0.45, paperwork: ['rfp_response'] }),
      sc('ai_training_clause', 'Student data used for AI training', 0.2, 'Counsel concern.', 'No-training clause in the DPA and a data-processing map.', { cycleMult: 1.2, needsRole: 'legal', paperwork: ['dpa'] }),
    ],
    objections: ['Do you have a HECVAT?', 'We already have a Microsoft or Google tool for this.', 'Does it integrate with Canvas?', 'Can we pay by P-card?', 'Our budget closed in February.'],
    churnAnnual: 0.115,
    seasonality: { busy: [1, 2, 3, 9, 10], slow: [5, 6, 7, 12], note: 'Departmental budget requests due Jan-Feb; renewals often need a fresh HECVAT each year; October-January is the window for next-year deals.' },
    soloFounderFit: 0.3,
    sourced: [
      'P-card limits: ASU $10,000/transaction (guide.pdf, 2025-02); Colorado $5,000 (up to $10,000), 2025-08; Montclair $3,000 (2025-12); GWU $3,000; Liberty $2,500; LMU $1,500 (https://www.asu.edu/purchasing/forms/guide.pdf; https://www.colorado.edu/cmdi/media/7953; https://inside.montclair.edu/documents/p-card-cardholder-approver-overview; https://procurement.gwu.edu/sites/g/files/zaxdzs4691/files/downloads/ProcurementCardFINAL.pdf; https://www.liberty.edu/finance-admin/procurement/wp-content/uploads/sites/135/P-Card-Policy.pdf; https://finance.lmu.edu/controller/accountspayable/pcard/)',
      'HECVAT reported at 4.1.5, released 2025-02-10; sources disagree on numbering (https://www.saltycloud.com/blog/what-is-the-hecvat, vendor)',
      'HECVAT review turnaround: 5-10 business days (Montclair), 4-12 weeks full assessments (Toledo), 4-6 weeks (USNH) (https://inside.montclair.edu/administration/information-technology-division/information-security/vendor-assessment-hecvat)',
      'Higher-ed purchase cycles 3-9 months (SaaSHero, unsourced) vs 6-18 months (getmonetizely, secondary) (https://www.saashero.net/strategy/edtech-marketing-school-cycles-2026/, 2026-07-11)',
    ],
  },

  // ===== nonprofit =========================================================================
  {
    id: 'nonprofits', label: 'Nonprofits and associations', group: 'nonprofit', models: ['smb'], employees: [1, 500],
    keywords: ['nonprofit', 'non-profit', 'not-for-profit', 'charity', 'foundation', 'association', 'food bank', 'ngo', '501(c)(3)', 'museum', 'community organization', 'trade association', 'housing nonprofit'],
    examples: ['food bank with 12 staff and 200 volunteers', 'community foundation with 5 staff', 'state trade association with 2,000 members', 'museum with 30 staff'],
    committee: [
      R('user', ['Programme staff', 'Development staff', 'Admin'], [3, 30], 0.4, false, 0.9, ['time saved', 'ease of use']),
      R('champion', ['Development director', 'Operations manager', 'Executive assistant'], [1, 1], 0.6, true, 0.9, ['donor data', 'reporting']),
      R('economic_buyer', ['Executive director', 'CFO / COO'], [1, 1], 0.8, true, 0.95, ['cash', 'mission fit']),
      R('board', ['Board / finance committee', 'Treasurer'], [7, 15], 0.7, true, 0.3, ['fiduciary duty', 'conflicts'], 5000),
      R('finance', ['Outsourced or part-time bookkeeper / controller'], [0, 1], 0.5, true, 0.4, ['coding', 'restricted funds']),
      R('technical', ['Outsourced MSP', 'Volunteer tech'], [0, 1], 0.5, true, 0.3, ['security', 'integration']),
      R('grant_compliance', ['Grants manager', 'Programme officer'], [0, 1], 0.4, true, 0.2, ['funder restrictions']),
      R('legal', ['Counsel (rare)'], [0, 1], 0.1, false, 0.05, ['liability']),
    ],
    buyerIsUserProb: 0.4,
    cycleDays: { lt5k: [1, 14], k5to25: [14, 56], k25to100: [60, 120], gt100: [120, 270] },
    winRateQualified: 0.22, acvRange: [500, 6000],
    procurement: proc({
      cardLimit: 3000, boardApproval: { prob: 0.4, aboveUsd: 10000 }, fiscalYearStartMonth: 1, budgetSetMonths: [10, 11, 12], paymentTermsDays: 30,
      paperwork: [pw('w9', 0.5), pw('nonprofit_verification', 0.5), pw('coi_insurance', 0.15, 5000), pw('dpa', 0.2, 5000), pw('board_packet', 0.3, 5000)],
    }),
    channels: {
      works: ['TechSoup listing', 'peer referrals within the sector', 'state and regional nonprofit associations', 'role-specific webinars (development director, ED)', 'affinity programmes and partner-led discounts'],
      fails: ['paid ads aimed at executive directors', 'enterprise-style demos that ask for a card', 'decks without an impact story'],
    },
    bestContact: { channel: 'email', times: 'Oct-Dec (year-end giving, calendar budgets) and January; summer is slow' },
    methodology: M('value_selling', ['champion', 'metrics', 'economicBuyer'], 'Impact framing (hours saved, donors kept, grant reports filed); light MEDDIC with champion and budget source critical. Check restricted funds and a donated-product alternative early.'),
    scenarios: [
      sc('ed_buys_board_asks', 'ED buys on card, board asks later', 0.25, 'Governance surprise.', 'One-page board summary before signing.', { winMult: 0.9, needsRole: 'board' }),
      sc('grant_restricts_software', 'Grant restricts software spend', 0.15, 'Funder rules.', 'Check grant terms first; offer a general-operating line or a shorter term.', { winMult: 0.7, needsRole: 'grant_compliance' }),
      sc('donated_competitor', 'Donated product competes with your paid tier', 0.3, 'Google/Microsoft nonprofit offers.', 'Compare total cost, support and migration time; offer an affordable nonprofit price.', { winMult: 0.75, paperwork: ['nonprofit_verification'] }),
      sc('no_tech_champion', 'No tech champion; volunteer-run IT', 0.25, 'Weak implementation.', 'White-glove onboarding or a template setup; budget the support hours.', { cycleMult: 1.2 }),
      sc('quarterly_board_vote', 'Board votes quarterly', 0.15, 'Calendar.', 'Conditional yes and plan the vote for the next meeting.', { cycleMult: 1.6, needsRole: 'board', stallDays: [30, 90] }),
    ],
    objections: ['We get this free from Google or Microsoft.', 'Can you apply a TechSoup or nonprofit discount?', 'Our board only meets quarterly.', 'We can\'t pay annual upfront.', 'Will you still exist in two years?'],
    churnAnnual: 0.2, // within SEGMENT_CHURN.nonprofits.annualLogoChurn (public/data/churn-reasons.js) [design]
    seasonality: { busy: [10, 11, 12, 1], slow: [7, 8], note: 'Renewals line up with grant cycles and fiscal years; staff turnover, grant endings and budget cuts drive churn.' },
    soloFounderFit: 0.6,
    sourced: [
      'Most nonprofits spend under 3% of budget on tech; only 13% spend above 5%; for-profits average about 6% (Clarion Research, 350+ leaders) (https://www.philanthropy.com/news/5-key-findings-from-our-nonprofit-technology-survey/, 2025-06-04)',
      'Microsoft 365 Business Basic donated up to 300 licences; Business Premium and Office 365 E1 stopped being donated 2025-07-01 (TechSoup guide, last verified 2026-05-17, secondary: https://techempower.notion.site/TechSoup-org-The-First-Step-to-Accessing-Technology-Grants-c5368a3c54164ff1920df252144b7457)',
      'Many funders do not fund technology and some restrict grant dollars for software or cybersecurity (same Chronicle of Philanthropy survey, 2025-06-04)',
    ],
  },
  {
    id: 'churches', label: 'Churches and religious organizations', group: 'nonprofit', models: ['smb'], employees: [1, 200],
    keywords: ['church', 'parish', 'congregation', 'ministry', 'diocese', 'synagogue', 'mosque', 'temple', 'worship', 'faith-based', 'pastor', 'religious organization'],
    examples: ['60-attendee Baptist church with one part-time admin', '400-member Catholic parish', '2,500-attendee multi-campus nondenominational church'],
    committee: [
      R('user', ['Ministry leaders', 'Volunteers', 'Staff'], [3, 30], 0.3, false, 0.9, ['time', 'check-in speed', 'familiarity']),
      R('champion', ['Church administrator', 'Office manager', 'Business administrator'], [1, 1], 0.7, true, 0.85, ['admin load', 'member data']),
      R('economic_buyer', ['Senior pastor', 'Priest and parish business manager'], [1, 1], 0.8, true, 0.9, ['ministry fit', 'cost', 'trust']),
      R('board', ['Elders', 'Vestry', 'Finance council'], [5, 12], 0.7, true, 0.5, ['stewardship', 'cost'], 3000),
      R('finance', ['Treasurer', 'Finance team volunteers'], [1, 3], 0.5, true, 0.4, ['giving and payments']),
      R('technical', ['Tech volunteer'], [0, 2], 0.5, true, 0.3, ['integrations', 'security']),
      R('children_ministry', ['Children\'s ministry lead'], [0, 1], 0.5, true, 0.4, ['child safety', 'check-in']),
      R('denomination', ['Denomination office'], [0, 1], 0.4, false, 0.08, ['preferred vendors', 'policy']),
    ],
    buyerIsUserProb: 0.35,
    cycleDays: { lt5k: [14, 90], k5to25: [90, 180], k25to100: [150, 270], gt100: [180, 365] },
    winRateQualified: 0.2, acvRange: [300, 3000],
    procurement: proc({
      cardLimit: 1000, boardApproval: { prob: 0.3, aboveUsd: 3000 }, fiscalYearStartMonth: 1, budgetSetMonths: [11, 12], paymentTermsDays: 0,
      paperwork: [pw('child_safety_policy', 0.4), pw('dpa', 0.3), pw('pci_attestation', 0.3), pw('coi_insurance', 0.1)],
    }),
    channels: {
      works: ['pastor and administrator peer networks', 'denominational events and regional gatherings', 'church-tech podcasts, Facebook and Reddit groups for administrators', 'app listings inside existing church platforms', 'referrals from consultants'],
      fails: ['cold email to pastors', 'enterprise sales motions', 'ads targeting "pastor"'],
    },
    bestContact: { channel: 'email', times: 'January-February (new budgets) and August-September (fall launch); avoid Holy Week and Christmas' },
    methodology: M('value_selling', ['champion', 'pain', 'economicBuyer'], 'Tie value to ministry outcomes (volunteers placed, first-time guests followed up, giving processed). Full MEDDIC is too heavy; the admin is the champion and the budget owner must be named.'),
    scenarios: [
      sc('admin_loyal_to_x', 'Pastor says yes, admin has used X for ten years', 0.3, 'Incumbent loyalty.', 'Offer a migration service and a parallel run.', { winMult: 0.75, needsRole: 'champion' }),
      sc('elders_vote', 'Elders or finance board must vote', 0.2, 'Governance.', 'One-page summary with cost per member and a 90-day trial.', { cycleMult: 1.5, needsRole: 'board', paperwork: ['board_packet'] }),
      sc('child_data_concern', 'Child-safety or data concern', 0.15, 'Child records.', 'Show access controls and deletion process; signed data-processing addendum.', { cycleMult: 1.2, needsRole: 'children_ministry', paperwork: ['child_safety_policy', 'dpa'] }),
      sc('staff_turnover', 'Staff turnover', 0.2, 'New admin.', 'Document setup so a new admin can run it; keep one named contact.', { winMult: 0.85, stallDays: [14, 45] }),
      sc('denomination_list', 'Denomination requires a preferred vendor', 0.1, 'Approved list.', 'Check the denominational list early; decline gracefully if not on it.', { winMult: 0.4 }),
      sc('giving_bundle', 'Giving or payments bundle required', 0.2, 'Platform lock-in.', 'Show how it works with the giving platform or add a referral.', { winMult: 0.8 }),
    ],
    objections: ['We\'re already on [big church platform].', 'We don\'t have budget until January.', 'Is our member and children\'s data secure?', 'Our volunteers do it manually and it\'s fine.', 'The board needs to see it first.'],
    churnAnnual: 0.2,
    seasonality: { busy: [1, 2, 8, 9], slow: [6, 7, 12], note: 'Avoid Holy Week and Christmas; renewals lapse when an annual meeting cuts the budget.' },
    soloFounderFit: 0.7,
    sourced: [
      'About 380,000-420,000 US congregations (https://ministrywatch.com/amp/are-100k-churches-closing-in-america/, undated estimate)',
      'Median weekly attendance fell from 137 to 65 between 2000 and 2020; about two-thirds of congregations under 100 people (Faith Communities Today 2020: https://hirr.hartfordinternational.edu/wp-content/uploads/2024/11/A-Portrait-of-the-2020-Faith-Communities-Today-Study-Article-Theology-Today.pdf)',
      'Pushpay study of 1,700+ church leaders: support and implementation guidance grew in importance versus price (https://www.religionunplugged.com/news/2025/4/30/new-study-reveals-key-tech-trends-shaping-the-us-church, 2025-04-30; vendor-linked)',
    ],
  },
];

export const SEGMENT_GROUPS = ['owner_smb', 'professional', 'company', 'regulated', 'health', 'public', 'education', 'nonprofit'];

const BY_ID = new Map(BUYER_SEGMENTS.map((s) => [s.id, s]));
export const getSegment = (id) => BY_ID.get(id) ?? null;

/** ACV band key used by cycleDays: lt5k | k5to25 | k25to100 | gt100. */
export const acvBand = (acv) => (acv < 5000 ? 'lt5k' : acv < 25000 ? 'k5to25' : acv < 100000 ? 'k25to100' : 'gt100');

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerpRange = (rand, [lo, hi]) => lo + (hi - lo) * rand();

// ---- segmentFor ----

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Keyword weight: 1 for one word, +0.5 per extra word, so "school district" beats the bare word "school".
const KEYWORD_RX = new Map(BUYER_SEGMENTS.map((s) => [
  s.id,
  s.keywords.map((kw) => ({ rx: new RegExp(`(?:^|[^a-z0-9])${escapeRx(kw.toLowerCase())}(?:s|es)?(?![a-z0-9])`), w: 1 + 0.5 * (kw.split(/[\s-]+/).length - 1) })),
]));

// How well an employee count sits in a segment's band: +0.6 inside, increasingly negative outside.
function sizeFit(employees, [min, max]) {
  if (employees == null || !Number.isFinite(employees) || employees <= 0) return 0;
  if (employees >= min && employees <= max) return 0.6;
  const ratio = employees < min ? min / employees : employees / max;
  return -Math.min(2, 0.4 + 0.8 * Math.log10(ratio));
}

/** Size-only fallback: unknown small company, mid-size or large. */
function fallbackSegment(employees, model) {
  if (employees == null || !Number.isFinite(employees)) return model === 'ent' ? 'mid_market' : 'startup_smb';
  if (employees < 100) return 'startup_smb';
  if (employees < 1000) return 'mid_market';
  return 'enterprise';
}

/**
 * Best segment id for a prospect: keyword matches on industry + name, nudged by employee band and model; a segment
 * must match at least one keyword and score above zero, otherwise fall back by size.
 */
export function segmentFor({ industry = '', employees = null, name = '', model = 'smb' } = {}) {
  const text = ` ${industry} ${name} `.toLowerCase();
  let best = null;
  for (const seg of BUYER_SEGMENTS) {
    let kw = 0;
    for (const { rx, w } of KEYWORD_RX.get(seg.id)) if (rx.test(text)) kw += w;
    if (kw === 0) continue;
    const score = kw + sizeFit(employees, seg.employees) + (seg.models.includes(model) ? 0.15 : 0);
    if (!best || score > best.score) best = { id: seg.id, score };
  }
  return best && best.score > 0 ? best.id : fallbackSegment(employees, model);
}

// ---- samplers ----

const CORE_ROLES = new Set(['user', 'champion', 'economic_buyer']);

/**
 * Sample a concrete buying committee for a deal of this ACV. Presence of each role uses presentProb, ramped down for
 * roles whose minAcv is above the deal size and nudged up for deals above the segment's usual range. Head-counts
 * grow with ACV. A group role (users, board, council) is represented by up to 3-4 individuals; `headcount` is the real
 * size. Always includes an economic buyer. Returns [{ role, title, influence, canBlock, concerns, headcount }].
 */
export function committeeFor(segmentId, acv, rand = Math.random) {
  const seg = BY_ID.get(segmentId);
  if (!seg) return [];
  const [lo, hi] = seg.acvRange;
  const u = clamp01((Math.log10(Math.max(acv, 1)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)));
  const over = acv > hi ? clamp01(Math.log10(acv / hi)) : 0;
  const people = [];
  const add = (r) => {
    const frac = clamp01(0.5 * (u + over) + 0.5 * rand());
    const n = Math.max(1, Math.round(r.count[0] + (r.count[1] - r.count[0]) * frac));
    const shown = Math.min(n, ['user', 'end_user_group'].includes(r.role) ? 3 : 4);
    const start = Math.floor(rand() * r.titles.length);
    for (let i = 0; i < shown; i++) {
      people.push({ role: r.role, title: r.titles[(start + i) % r.titles.length], influence: +(r.influence * Math.pow(0.85, i)).toFixed(2), canBlock: r.canBlock, concerns: r.concerns, headcount: n });
    }
  };
  for (const r of seg.committee) {
    let p = r.presentProb;
    if (r.minAcv && acv < r.minAcv) p *= Math.pow(acv / r.minAcv, 1.2);
    else if (over > 0) p = Math.min(1, p * (1 + 0.3 * over));
    // Gatekeepers (security, legal, procurement, board...) mostly skip deals below the segment's usual range.
    if (acv < lo && r.canBlock && !CORE_ROLES.has(r.role)) p *= Math.max(0.15, Math.pow(acv / lo, 0.8));
    if (rand() < p) add(r);
  }
  if (!people.some((x) => x.role === 'economic_buyer')) {
    const eb = seg.committee.find((r) => r.role === 'economic_buyer') ?? seg.committee[0];
    if (eb) add(eb);
  }
  return people.sort((a, b) => b.influence - a.influence);
}

/** Sampled sales-cycle length in days (right-skewed within the ACV band's [min, max]). */
export function cycleDaysFor(segmentId, acv, rand = Math.random) {
  const seg = BY_ID.get(segmentId);
  if (!seg) return 30;
  const [lo, hi] = seg.cycleDays[acvBand(acv)];
  return Math.round(lo + (hi - lo) * Math.pow(rand(), 1.3));
}

/**
 * Paperwork this deal will require: each procurement.paperwork entry applies when acv >= minAcv and a roll under its
 * prob succeeds. Returns [{ id, label, hours, costUsd, days, repeatHours?, recurringAnnualUsd? }] with sampled effort.
 */
export function paperworkFor(segmentId, acv, rand = Math.random, adjustProb = null) {
  const seg = BY_ID.get(segmentId);
  if (!seg) return [];
  const out = [];
  for (const req of seg.procurement.paperwork) {
    if (acv < req.minAcv || rand() >= (adjustProb ? adjustProb(req.id, req.prob) : req.prob)) continue;
    const p = PAPERWORK[req.id];
    if (!p) continue;
    out.push({
      id: req.id, label: p.label,
      hours: +lerpRange(rand, p.hours).toFixed(1), costUsd: Math.round(lerpRange(rand, p.costUsd)), days: Math.round(lerpRange(rand, p.days)),
      ...(p.repeatHours ? { repeatHours: p.repeatHours } : {}), ...(p.recurringAnnualUsd ? { recurringAnnualUsd: p.recurringAnnualUsd } : {}),
    });
  }
  return out.sort((a, b) => b.days - a.days);
}
