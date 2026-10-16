// Operator tiers for the consumer subscription-app playbook (Launch playbook app): hard paywall, store review, creator marketplace,
// clipping, Meta app ads. Imported by data/operator-tiers.js as function id consumer_app_growth. Source: docs/research/consumer-apps/.
// Outcome ranges are [design] bounded by RevenueCat base rates (17% of new subscription apps reach $1k MRR, 4.6% reach $10k) and the
// sourced medians; nothing here is a measured operator distribution.

export const CONSUMER_APP_GROWTH = {
  label: 'Consumer subscription app growth (paywall, creators, clipping, Meta app ads)',
  apps: ['launch', 'ads', 'organic', 'product'],
  tiers: {
    stellar: {
      behaviours: [
        'tests 5+ distinct hooks with cheap creator posts before spending on ads, reads views and installs per hook, and promotes only a proven break-out hook to Meta as a Partnership ad',
        'writes a paywall that states every price, period, trial end and the cancel path; no fake timers or toggles; offers annual next to weekly, runs a paywall test to significance and ships only winners; a 7-12 step quiz leads into it',
        'beta-tests, completes the privacy label and differentiates the listing before App Review; enrols in the Small Business Program; keeps the store commission in every ROAS target (net of fees)',
        'funds clipping campaigns with spot-check verification, original-content rules and content that is about the problem; requires #ad / branded content in every brief and audits disclosure',
        'raises ad budgets only after D7 ROAS on mature cohorts clears the target, and watches true revenue rather than late, low iOS reports',
      ],
      outcomes: { costPerInstallVsMedian: [0.5, 0.75], rejectionsPerLaunch: [0, 1], refundRatePct: [2, 4], boughtBotViewsPct: [0, 4], reachesTenKMrrPct: [10, 16] },
    },
    good: {
      behaviours: ['tests two or three hooks, promotes a good one', 'clear paywall copy with one gap; annual plan offered; one paywall test', 'basic clip verification via the platform; discloses in most briefs', 'scales spend after a week of data on gross revenue'],
      outcomes: { costPerInstallVsMedian: [0.75, 0.95], rejectionsPerLaunch: [1, 2], refundRatePct: [3, 5], boughtBotViewsPct: [3, 8], reachesTenKMrrPct: [6, 10] },
    },
    average: {
      behaviours: ['one hook, one brief, hires many creators for the same angle', 'a standard paywall with a thin disclosure, weekly-heavy mix, no test', 'clips paid on dashboard views; rules do not mention disclosure', 'raises budgets when the ads "feel" fine and the store fee is not in the target'],
      outcomes: { costPerInstallVsMedian: 1, rejectionsPerLaunch: [1, 3], refundRatePct: [4, 7], boughtBotViewsPct: [8, 18], reachesTenKMrrPct: [3, 6] },
    },
    mediocre: {
      behaviours: [
        'copies a creator video angle, buys volume without testing hooks, pays clippers for whatever views the dashboard shows',
        'a weekly-only paywall with a fake countdown or a trial toggle, price in small print, no cancel instructions: rejected under 3.1.2, refunds spike, a consumer-protection inquiry follows',
        'no beta, no privacy label, a look-alike of a saturated category: rejected, resubmitted, rejected again',
        'templated clip accounts that get banned in an enforcement wave; scales Meta spend before the first D7 read; undisclosed paid posts',
      ],
      outcomes: { costPerInstallVsMedian: [1.4, 2.5], rejectionsPerLaunch: [3, 6], refundRatePct: [8, 16], boughtBotViewsPct: [18, 40], reachesTenKMrrPct: [0, 2] },
    },
  },
  metrics: {
    costPerInstallVsMedian: { label: 'Blended cost per install relative to the median operator at equal product fit', unit: 'x', source: 'design; no sourced cost-per-install benchmark for UGC or clipping versus Meta (research gap)', sourced: false, confidence: 'design' },
    rejectionsPerLaunch: { label: 'App Review rejections before the first approval', unit: 'count', source: 'design on research: most submissions clear in 24-48 h; 2025 rejection counts cited secondhand (>2M of 9.1M) [unverified]', sourced: false, confidence: 'design' },
    refundRatePct: { label: 'First-charge refund rate', unit: '%', source: 'design; refund rates by paywall type were not found (research open item 4); store annual refunds 6-7.6% (Adapty) for context', sourced: false, confidence: 'design' },
    boughtBotViewsPct: { label: 'Share of clipping payouts that went to botted views', unit: '%', source: 'anecdotal only (research ugc-clipping.md section 2); design shares', sourced: false, confidence: 'design' },
    reachesTenKMrrPct: { label: 'Chance a new subscription app reaches $10k MRR', unit: '%', source: 'RevenueCat 2026: 4.6% reach $10k MRR, 17% reach $1k (secondary); tier spread is design', sourced: false, confidence: 'design' },
  },
  traps: [
    { id: 'app_review_rejected_paywall', label: 'A paywall that hides the price or the renewal', looksLike: 'A higher-converting paywall', costs: 'Rejection under 3.1.2: days in the review queue, a resubmission, and (if it ships) refunds, 1-star reviews and a ROSCA inquiry', coaching: 'State every plan price and period, what happens when the trial ends, that it auto-renews and how to cancel, in the paywall itself. No fake timers, no trial toggles.' },
    { id: 'saturated_category_copycat', label: 'Launching a look-alike into a saturated category', looksLike: 'A proven idea', costs: '4.3 spam / copycat rejections, worse ranking, higher CPI and fewer breakouts as the playbook saturates', coaching: 'Differentiate in function and in the listing; ship features beyond the template before you submit; pick a category with room.' },
    { id: 'paid_for_botted_views', label: 'Paying clippers on dashboard views', looksLike: 'Cheap reach', costs: 'Budget paid for fake views that stop just under the per-clip cap; a burned clipper pool', coaching: 'Verify: spot-check analytics and audience on clips, hold payouts, and compare views with installs.' },
    { id: 'views_without_installs', label: 'Reach that never becomes installs', looksLike: 'Big view counts', costs: 'High cost per install: the clips or hooks were not about the app\'s problem, so the wrong audience watched', coaching: 'Make every hook and clip about the specific problem the app solves; judge channels by installs per 1,000 views.' },
    { id: 'undisclosed_creator_posts', label: 'Paid creator posts without #ad or branded content', looksLike: 'More natural posts', costs: 'Platform strikes that cut reach for two weeks, takedown and re-brief costs, and FTC exposure for the brand and the creator', coaching: 'Require #ad / the paid-partnership label in the brief, audit the live posts, and fix them before a platform does.' },
    { id: 'clip_accounts_banned_policy', label: 'Templated, reused clips in an enforcement wave', looksLike: 'Scale through many accounts', costs: 'Accounts demoted or banned (YouTube inauthentic-content policy, TikTok enforcement) and views falling within a week', coaching: 'Ask for original voiceover or commentary on every clip; never ask for the same video on many accounts.' },
    { id: 'weekly_plan_refund_spike', label: 'A weekly plan with an aggressive paywall', looksLike: 'Maximum early cash', costs: 'A refund spike, 1-star reviews and the fastest churn of any plan length (weekly retention ~3% at one year)', coaching: 'Offer annual next to weekly, say what the weekly price is per week, and track the first-charge refund rate.' },
    { id: 'scaled_ads_before_payback', label: 'Scaling Meta spend before payback is proven', looksLike: 'Momentum', costs: 'Two weeks of committed spend before the first mature D7 read; learning resets on large edits', coaching: 'Raise budgets 20% at a time after D7 ROAS on mature cohorts clears your target; judge on true revenue, not delayed iOS reports.' },
    { id: 'store_fee_not_in_model', label: 'Targets that assume 100% of revenue', looksLike: 'ROAS above target', costs: 'The 15-30% store commission (and vendor fees) is the difference between profitable and not, paid on every scaled dollar', coaching: 'Set ROAS and payback targets on net revenue after the store commission; enrol in the Small Business Program.' },
    { id: 'misleading_auto_renew', label: 'Auto-renewal disclosure that would not survive a regulator', looksLike: 'Less friction at checkout', costs: 'A consumer-protection inquiry and legal bills (ROSCA still applies after the click-to-cancel rule was vacated in July 2025)', coaching: 'Make the renewal terms and the cancel path obvious in the paywall copy; no pre-checked or hidden terms.' },
  ],
  detection: [
    { signal: 'Distinct hooks tested, views and installs per hook, which hook gets promoted', howInGame: 'Creator posts per hook and the Ads-library promotions', gameable: 'no', antiGaming: 'Break-outs are heavy-tailed random draws; volume of posts on one hook does not count as testing' },
    { signal: 'Paywall disclosure score, dark patterns, review outcomes, refund rate', howInGame: 'Disclosure judged against the real configured prices and trial; App Review draws per guideline', gameable: 'partly', antiGaming: 'Copy must match the configured prices; dark patterns raise refunds and rejection odds' },
    { signal: 'Verification choice, fraud caught and paid, policy strikes', howInGame: 'Clipping campaign records', gameable: 'no', antiGaming: 'Fraud is hidden truth; only verification reveals it' },
    { signal: 'Scale decisions against true D7 ROAS, net of store fees', howInGame: 'Budget edits compared with mature cohort revenue', gameable: 'no', antiGaming: 'Revenue comes from the Stripe cohort ledger, not from the delayed platform reports' },
  ],
};
