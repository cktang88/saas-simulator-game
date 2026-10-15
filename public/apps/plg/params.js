// Product-led growth: numbers, lever catalogue and product-type classifier. Data only, no state.
//
// Research: docs/research/plg-email/p1-plg-levers.md (every figure below traces to a section there; most
// benchmarks are vendor roundups, so each is a RANGE the game spreads operators across). Tags: [design] = game
// estimate bounded by that research, never shown to players as a real statistic; [vendor] = vendor/secondary claim.

// ---- Product type: sets K and cycle time (p1 §4: no measured data for collaboration tools; vendor K ranges) ----
// k: [floor, ceiling] of the lifetime viral K from invites a player can reach by operator quality [design].
// Typical SaaS 0.15-0.25, good referral programs 0.5-0.7, strong 1.0-1.5 (rare) [vendor, p1 §4]: these stay below the
// vendor "good" band on purpose because the game also caps combined K (K_TOTAL_CAP).
export const PRODUCT_TYPES = {
  collab: { label: 'Collaboration / multi-user', invitesK: [0.1, 0.42], shareK: 0.06, badgeK: 0.03, cycleDays: 21, why: 'a second person is needed to get the value (teams, shared boards, approvals)' },
  output: { label: 'Shareable outputs', invitesK: [0.05, 0.22], shareK: 0.14, badgeK: 0.06, cycleDays: 30, why: 'the product makes things other people look at (booking pages, reports, forms, proposals)' },
  solo: { label: 'Single-user tool', invitesK: [0.02, 0.1], shareK: 0.03, badgeK: 0.01, cycleDays: 45, why: 'one person gets the value alone; invites are an afterthought' },
};
const RE_COLLAB = /\b(team|teams|collaborat\w*|workspace|shared|board|boards|approval|approvals|comment\w*|multiplayer|crew|staff|agency|agencies)\b/i;
const RE_OUTPUT = /\b(report|reports|invoice|invoices|booking|bookings|schedul\w*|form|forms|survey|surveys|page|pages|portfolio|proposal|proposals|quote|quotes|link|links|embed|widget|dashboard|dashboards|certificate|receipt|receipts)\b/i;
export function productType(state) {
  const text = `${state.company?.oneLiner ?? ''} ${state.company?.icp ?? ''}`;
  if (RE_COLLAB.test(text)) return 'collab';
  if (RE_OUTPUT.test(text)) return 'output';
  return 'solo';
}
export const clientFacing = (state) => /\b(agency|agencies|consultant|consultants|freelanc\w*|contractor|studio|studios)\b/i.test(`${state.company?.oneLiner ?? ''} ${state.company?.icp ?? ''}`);

// ---- Hours (founder time, in addition to the engineering effort that goes through the Product build queue) ----
// p1 gives build ranges per lever; "effort" is human-equivalent engineering hours (Product divides by the AI-agent
// multiplier). setup = founder hours to configure and launch; weekly = founder hours to keep it alive.
export const LEVER_ORDER = ['instrument', 'limits', 'pql', 'expansion', 'invites', 'sharing', 'referral_prompt', 'templates', 'pseo', 'free_tool'];

export const LEVERS = {
  instrument: {
    label: 'PLG instrumentation and dashboard', group: 'Measure', effort: 15, setup: 2, weekly: 1.5,
    blurb: 'Events for limit hits, prompts shown, invites, shared-page views and PQL signals, plus one dashboard. Without it you steer by total signups and open rates.',
    source: 'p1 §10: build 10-20 h, weekly 2-3 h [design]', models: ['b2c', 'smb', 'ent'], needs: [], fields: [],
  },
  limits: {
    label: 'Usage limits, paywall and in-app upgrade prompts', group: 'Convert', effort: 30, setup: 3, weekly: 2,
    blurb: 'Gate a meter that tracks value, warn before the limit, and prompt after a success moment. Every prompt is a trade between conversion and annoyance.',
    source: 'p1 §2: build 20-40 h, weekly 2 h [design]; lift 10-25% good vs average [design], no independent lift figure exists', models: ['b2c', 'smb', 'ent'], needs: [],
    fields: [
      { key: 'meter', label: 'Meter you limit', type: 'select', options: 'meters' },
      { key: 'weeksToLimit', label: 'Typical active user hits the limit in week', type: 'number', min: 1, max: 8, default: 3, help: 'Aim for weeks 2-4: after they have seen value, before they churn.' },
      { key: 'placement', label: 'Where the upgrade prompt appears', type: 'select', options: [['after_success', 'After a success moment (a delivered outcome)'], ['on_limit_hit', 'When they hit the limit'], ['every_login', 'On every login'], ['on_signup', 'Hard paywall at signup']] },
      { key: 'warn', label: 'Warn at 75% and 100% of the limit', type: 'checkbox', default: true },
      { key: 'smallerStep', label: 'Offer a smaller step (credit pack, annual switch) next to the upgrade', type: 'checkbox', default: false },
      { key: 'holdout', label: 'Hold out 10% of users to measure the lift', type: 'checkbox', default: false },
      { key: 'exportBlocked', label: 'Block export and data access at the limit', type: 'checkbox', default: false },
      { key: 'countdown', label: 'Countdown timers and stacked promos on the out-of-credits screen', type: 'checkbox', default: false },
      { key: 'copy', label: 'Upgrade prompt copy', type: 'textarea', default: '' },
    ],
  },
  pql: {
    label: 'Product-qualified leads handed to the CRM', group: 'Convert', effort: 22, setup: 2.5, weekly: 2.5,
    blurb: 'Pick the behaviours that mean buying intent, route those accounts to the CRM inbound queue with context, and learn from which ones close.',
    source: 'p1 §3: build 15-30 h, weekly 2-3 h [design]; PQL-driven conversion ~25% (30-39% at $1-5k ACV) [vendor]; trials using PQLs convert 2.8x [vendor, Gainsight 2022]', models: ['smb', 'ent'], needs: ['instrument'],
    fields: [
      { key: 'signals', label: 'Signals that make an account a PQL', type: 'signals' },
      { key: 'minSignals', label: 'Signals required', type: 'select', options: [[1, 'Any one'], [2, 'At least two']] },
      { key: 'sla', label: 'Follow-up promise', type: 'select', options: [['same_day', 'Same day'], ['two_day', 'Within 1-2 days'], ['weekly', 'Weekly batch']] },
      { key: 'firstTouch', label: 'First touch', type: 'select', options: [['offer', 'A useful offer (setup help, a teardown)'], ['pitch', 'A product pitch'], ['instant_all', 'Every free user gets a sales email within an hour']] },
      { key: 'noticeDisclosed', label: 'Privacy notice says we use product usage to contact you', type: 'checkbox', default: false },
    ],
  },
  expansion: {
    label: 'Expansion: seats, usage and in-product upsell', group: 'Convert', effort: 30, setup: 2.5, weekly: 2,
    blurb: 'Triggers that turn growth inside an account into revenue: seat limit hit, teammate invited, usage threshold, a feature a higher tier includes.',
    source: 'p1 §8: build 20-40 h, weekly 2 h [design]; NRR ~98% average vs 110%+ good [design from Benchmarkit/High Alpha, conflicting]', models: ['b2c', 'smb', 'ent'], needs: [],
    fields: [
      { key: 'triggers', label: 'Triggers', type: 'multi', options: [['seat_limit', 'Seat limit hit'], ['teammate_invited', 'Teammate invited'], ['usage_threshold', 'Usage crosses a threshold'], ['feature_gate', 'Uses a feature a higher tier includes']] },
      { key: 'showROI', label: 'Upgrade screen shows the ROI in the customer\'s own numbers', type: 'checkbox', default: false },
      { key: 'alertsToSales', label: 'Alert you (or a rep) on strong expansion signals', type: 'checkbox', default: false },
      { key: 'oneClickDowngrade', label: 'Downgrade is one click (keeps trust)', type: 'checkbox', default: true },
      { key: 'prorateAnnual', label: 'Annual upgrades get a prorated credit', type: 'checkbox', default: true },
      { key: 'surpriseOverage', label: 'Bill overages without a warning', type: 'checkbox', default: false },
    ],
  },
  invites: {
    label: 'Invites and collaboration loop', group: 'Viral', effort: 22, setup: 2, weekly: 2,
    blurb: 'Put the invite where a second person is needed, give the invitee value in their first session, and invite only with per-recipient opt-in.',
    source: 'p1 §4: build 15-30 h, weekly 2 h [design]; K typical 0.15-0.25, good 0.5-0.7 [vendor]', models: ['b2c', 'smb', 'ent'], needs: [],
    fields: [
      { key: 'placement', label: 'Where invites live', type: 'select', options: [['collab_moment', 'At the moment a second person is needed'], ['settings', 'An "Invite friends" button in settings'], ['contacts_import', 'Import contacts and invite automatically']] },
      { key: 'inviteeValue', label: 'The invitee lands inside the thing that was shared (value in the first session)', type: 'checkbox', default: false },
      { key: 'optIn', label: 'Each invite is sent only when the user confirms that recipient', type: 'checkbox', default: true },
    ],
  },
  sharing: {
    label: 'Shared outputs and "Powered by" badge', group: 'Viral', effort: 15, setup: 1.5, weekly: 1,
    blurb: 'Public pages and exports that carry a tracked link back to the product. A subtle badge works; a loud one on client-facing work costs credibility.',
    source: 'p1 §4: build 15-30 h [design]; no measured badge lift exists, the Calendly-style case is anecdotal [unverified]', models: ['b2c', 'smb', 'ent'], needs: [],
    fields: [
      { key: 'publicLinks', label: 'Shared outputs have public pages with a tracked link', type: 'checkbox', default: true },
      { key: 'cta', label: 'Shared pages show a signup call to action', type: 'checkbox', default: true },
      { key: 'badge', label: 'Badge', type: 'select', options: [['off', 'No badge'], ['subtle', 'Subtle "Made with" badge'], ['loud', 'Large "Powered by" banner']] },
      { key: 'removableOnPaid', label: 'Removable on paid plans', type: 'checkbox', default: true },
    ],
  },
  referral_prompt: {
    label: 'In-product referral prompts', group: 'Viral', effort: 15, setup: 1.5, weekly: 0.25,
    blurb: 'Ask at a success moment, with the referral program you set up in Organic. The program sets the reward; this lever sets who sees the ask and when.',
    source: 'p1 §9: build 10-20 h, monthly 1 h [design]; participation ~5% to 10-15% of actives with a post-aha prompt [vendor, unverified]', models: ['b2c', 'smb', 'ent'], needs: [], requiresReferral: true,
    fields: [
      { key: 'trigger', label: 'When the prompt appears', type: 'select', options: [['post_aha', 'After the activation moment or a delivered outcome'], ['every_login', 'On every login'], ['on_failure', 'During a failed action or an outage']] },
      { key: 'fraudChecks', label: 'Block same-device and same-card self-referrals', type: 'checkbox', default: false },
    ],
  },
  templates: {
    label: 'Template gallery', group: 'Content', effort: 30, setup: 2, weekly: 1.5,
    blurb: 'Hand-made starter templates, each tied to a real use case with a clear "use this" path into signup. Slow to rank, cheap once it works.',
    source: 'p1 §5: gallery 20-40 h, 20-50 hand-made templates; a few percent of pages produce most traffic [design]; no template-to-paid data exists', models: ['b2c', 'smb', 'ent'], needs: [],
    fields: [
      { key: 'count', label: 'Templates to publish', type: 'select', options: [[10, '10'], [20, '20'], [30, '30'], [50, '50']] },
      { key: 'curated', label: 'Each one hand-made for a real use case (otherwise near-duplicates of one base template)', type: 'checkbox', default: true },
      { key: 'community', label: 'Let users submit templates', type: 'checkbox', default: false },
      { key: 'moderation', label: 'Review every submission before it is published', type: 'checkbox', default: true },
    ],
  },
  pseo: {
    label: 'Programmatic SEO pages from product data', group: 'Content', effort: 60, setup: 6, weekly: 4,
    blurb: 'Pages generated from structured data. Only worth it when each page carries data no other site has. Thin pages get demoted at the next Google core update.',
    source: 'p1 §5: build 40-80 h, weekly 4-6 h [design]; thin pSEO demotion risk (check Google Search Central spam policies: scaled content abuse)', models: ['b2c', 'smb', 'ent'], needs: [],
    fields: [
      { key: 'pages', label: 'Pages to generate', type: 'select', options: [[50, '50'], [200, '200'], [500, '500'], [2000, '2,000']] },
      { key: 'dataSource', label: 'What makes each page different', type: 'select', options: [['product_data', 'Aggregated, anonymised data from our own product'], ['public_data', 'Public data reformatted'], ['swapped_names', 'The same text with the city or keyword swapped']] },
      { key: 'anonymised', label: 'Product data is aggregated and anonymised, with a privacy notice', type: 'checkbox', default: false },
      { key: 'review', label: 'Spot-check a sample of pages before publishing', type: 'checkbox', default: false },
    ],
  },
  free_tool: {
    label: 'Free tool or calculator', group: 'Content', effort: 30, setup: 4, weekly: 2,
    blurb: 'A free answer to a question your buyer already searches. Gate only the detailed report, show the method, and test the maths before launch.',
    source: 'p1 §6: build 20-40 h, weekly 2 h [design]; calculator visit to signup 2-8% [design]; no quantified benchmark exists', models: ['b2c', 'smb', 'ent'], needs: [],
    fields: [
      { key: 'kind', label: 'Kind of tool', type: 'select', options: [['calculator', 'Calculator'], ['grader', 'Grader or audit'], ['generator', 'Generator']] },
      { key: 'gate', label: 'Where the email gate sits', type: 'select', options: [['detail_report', 'Only the detailed report'], ['none', 'Nowhere (result is open)'], ['result', 'Before the result']] },
      { key: 'mathReviewed', label: 'Formulas tested against worked examples before launch', type: 'checkbox', default: false },
      { key: 'disclaimer', label: 'Disclaimer on results (not financial, tax or legal advice)', type: 'checkbox', default: false },
      { key: 'methodShown', label: 'The tool shows its method and assumptions', type: 'checkbox', default: false },
      { key: 'proprietaryData', label: 'The answer uses our own anonymised data', type: 'checkbox', default: false },
    ],
  },
};

// Value-tied vs cost-proxy meters for usage limits (p1 §2: define the meter that tracks value, not a proxy for cost).
export const METERS = {
  b2c: [['projects', 'Projects or items created', true], ['exports', 'Exports', true], ['ai_credits', 'AI credits', true], ['storage_gb', 'Storage (GB)', false]],
  smb: [['records', 'Records or contacts managed', true], ['runs', 'Runs or jobs per month', true], ['seats', 'Seats', true], ['storage_gb', 'Storage (GB)', false], ['api_calls', 'Raw API calls', false]],
  ent: [['seats', 'Seats', true], ['workspaces', 'Workspaces or business units', true], ['api_calls', 'Raw API calls', false], ['history_days', 'Days of history kept', false]],
};

// PQL signals (p1 §3: "define the PQL rule from your activation data"). p(intent) = chance the signal fires for an
// account whose hidden buying intent is `intent` (0..1); weights are [design].
export const PQL_SIGNALS = [
  { id: 'company_domain', label: 'Signed up with a company email domain', p: (i) => 0.5 + 0.1 * i },
  { id: 'invited_teammates', label: 'Invited two or more teammates', p: (i) => 0.04 + 0.78 * i },
  { id: 'hit_limit', label: 'Hit a usage limit', p: (i) => 0.06 + 0.62 * i, needs: 'limits' },
  { id: 'activated_core', label: 'Reached the activation event', p: (i) => 0.22 + 0.5 * i },
  { id: 'pricing_visits', label: 'Viewed the pricing page twice or more', p: (i) => 0.14 + 0.42 * i },
  { id: 'integration_connected', label: 'Connected an integration', p: (i) => 0.07 + 0.52 * i },
  { id: 'any_signup', label: 'Any signup', p: () => 1 },
];

export const PLG_PARAMS = {
  // Lift model for limits (p1 §2): relative change in trial/free to paid conversion from prompt quality q in 0..1.
  limitsLift: { slope: 0.3, offset: 0.25, min: -0.12, max: 0.22 }, // [design] good vs average 10-25% relative
  hardPaywall: { landing: 0.65, conversion: 1.45 }, // [design] RevenueCat: hard paywall converts far better, with fewer starts (p1 §1)
  limitsChurn: { exportBlocked: 0.06, countdown: 0.03, everyLogin: 0.025, week1: 0.02 }, // [design] p1 §2: +3-8% 90-day churn for hard blocks
  slaMult: { same_day: 1, two_day: 0.88, weekly: 0.65 }, // [design] speed-to-lead
  pqlSurveillanceConv: 0.96, // [design] "feels like surveillance" (p1 §3)
  expansionBase: 0.002, expansionPerQ: 0.011, // [design] extra monthly expansion rate; good ~+0.7%/mo, stellar ~+1.2%/mo => NRR gap ~10-12 pts a year
  viralConvMult: 1.15, // [design] invited users arrive with context
  K_TOTAL_CAP: 0.85, // sustained K above ~0.7-0.85 almost never happens (p1 §4); combined with the WOM cap
  contactImportK: 1.5, contactImportComplaint: 0.012, // [design] contact-import invites: more signups short term, spam complaints
  badge: { loudMult: 1.5, loudChurn: 1.03, removablePaidRevenue: 0.01 },
  referralPrompt: { post_aha: 2, every_login: 1.1, on_failure: 0.9 }, // participation multiplier on the existing program boost [design from p1 §9]
  // Content traffic: monthly search volume per page is log-uniform [min, max]; P(top 10) rises with page uniqueness.
  page: { volMin: 40, volMax: 1500, ctrTop10: 0.09, ctrTail: 0.004, rampDays: 120, p10Base: 0.06, p10Unique: 0.5, thinBelow: 0.4 }, // [design] ~1.7% of NEW pages reach top 10 in a year at scale (p1 §5), higher for curated niche pages
  pseoVol: [10, 300], // programmatic pages target long tails
  tool: { baseVisits: 20, qualityVisits: 60, rampDays: 90, signupBase: 0.02, signupQuality: 0.06, gatedCapture: 0.12, wrongMathPerMonth: 0.08 }, // [design] p1 §6: visit to signup 2-8%
  core: { updatesPerYear: 3.3, penaltyDays: 150, penaltyPseo: 0.1, penaltySite: 0.6, thinPenaltyChance: 0.7, uniqueGrowth: 0.04 }, // updates/yr: SEJ 2022-2025 (data/world.js)
  neglectDecay: 0.85, neglectFloor: 0.5,
  convVisitMult: { templates: 0.5, pseo: 0.35, tool: 0.8 }, // informational intent converts below the landing page
};
