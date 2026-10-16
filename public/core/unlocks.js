// Progressive disclosure: the founder's to-do tree. A new company sees a handful of core apps; each business function
// appears in the sidebar when the founder actually runs into it (a to-do becomes available) or asks for it ("Set it
// up" / "Expand now"). Completing a to-do is auto-detected from real game state and reveals the next to-dos, like a
// skill tree. Pure: no DOM, no rng, no Date. Simulation never depends on this: every app's onDay keeps running
// whether or not the app is visible; only rendering is gated (public/main.js).
//
// state.progress = {
//   v, unlocked: { apps: { id: day }, tabs: { 'app/tab': day } },
//   done: [{ id, step?, day }]          completion history (node and sub-step checkboxes), oldest first
//   avail: { id: { day, by } }          when each to-do became available (and which completion revealed it)
//   requested: { id: day }              "Set it up" / "Expand now" requests
//   checked: { 'node/step': day }       manually ticked sub-steps (steps with no detector)
//   skipped: { id: day }                "Skip for now": counts as done for unlocking what comes next, listed apart
//                                       until the founder brings it back or actually does it. Only the to-do list
//                                       changes: the simulation still plays out the cost of not doing the work.
//   seen: { 'app:x': day, 'node:x': day }
//   queue: [{ kind, id, day, by }]      fresh unlocks the shell announces (toast + sidebar pulse), then clears
// }

export const ALWAYS_VISIBLE = ['home', 'todos', 'mail', 'calendar', 'bank', 'settings', 'help'];

export const CATEGORIES = [
  { id: 'foundations', label: 'Foundations', icon: '🧭' },
  { id: 'product', label: 'Customers & product', icon: '🛠️' },
  { id: 'sales', label: 'Sales', icon: '🤝' },
  { id: 'growth', label: 'Marketing & growth', icon: '📣' },
  { id: 'money', label: 'Money', icon: '💵' },
  { id: 'legal', label: 'Legal & company', icon: '⚖️' },
  { id: 'team', label: 'Team', icon: '👥' },
  { id: 'fundraising', label: 'Fundraising', icon: '💰' },
  { id: 'ops', label: 'Operations & automation', icon: '⚙️' },
];

// ---- state readers (defensive: old saves and lazily created slices) ----
const A = (s, k) => s.apps?.[k] ?? {};
const n = (x) => (Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : 0);
const seen = (id) => (s) => Boolean(s.progress?.seen?.[`app:${id}`]);
const realIv = (s) => (A(s, 'research').interviews ?? []).filter((i) => i.real && i.status === 'done').length;
const practiced = (s) => (A(s, 'research').interviews ?? []).some((i) => !i.real && (i.status === 'done' || i.grade));
const features = (s) => A(s, 'product').features ?? [];
const shipped = (s) => features(s).some((f) => f.status === 'shipped') || A(s, 'outcomes').firstShipDay != null;
const charged = (s) => A(s, 'outcomes').firstChargeDay != null || (s.stripe?.charges ?? []).some((c) => c.status === 'succeeded' || c.paid)
  || Object.values(s.stripe?.archive ?? {}).some((m) => (m?.charges ?? 0) > 0);
const legal = (s) => A(s, 'legal');
const contacts = (s) => (A(s, 'crm').contacts ?? []).filter((c) => !c.hidden).length;
const deals = (s) => A(s, 'crm').deals ?? [];
const tickets = (s) => A(s, 'support').tickets ?? [];
const humans = (s) => (A(s, 'people').members ?? []).filter((m) => m.kind && !['ai_agent', 'cofounder'].includes(m.kind) && !['gone', 'terminated'].includes(m.status)); // people/sim.js marks leavers 'gone'
const lastMetric = (s, k) => s.metrics?.daily?.at?.(-1)?.[k] ?? 0;
const org = (s) => A(s, 'organic');
const channelsUsed = (s) => { const C = A(s, 'channels'); return n(C.stats) > 0 || Boolean(C.affiliates?.program) || n(C.monthlyFees) > 0 || n(C.judged) > 0; };
const pricingUsed = (s) => n(A(s, 'pricing')) > 0 || (s.plans ?? []).length > 1;
const step = (id, title, done, extra = {}) => ({ id, title, done, ...extra });
const seenStep = (app, title) => step('open', title, seen(app));

const SMB_ENT = ['smb', 'ent'];

// ---- the tree ----
// kind: task nodes open their app/tabs as soon as they become available (you have run into this); expand nodes
// ("Set up X") open them only when the founder asks, or once real use shows up. `unlocks` arrive on completion.
export const NODES = [
  // Foundations
  { id: 'idea', category: 'foundations', title: 'Write your one-liner and ideal customer', go: 'settings',
    why: 'Where the company records what it makes and who it is for.',
    requires: [], steps: [step('oneliner', 'Write a one-liner: what you sell to whom', (s) => Boolean(s.company?.oneLiner?.trim())), step('icp', 'Describe your ideal customer profile (Settings → Company)', (s) => Boolean(s.company?.icp?.trim()))] },
  { id: 'discovery', category: 'foundations', title: 'Talk to potential customers (Mom Test)', go: 'research',
    why: 'Interview notes and call transcripts live here, with AI personas for practice calls.',
    requires: [], opens: { apps: ['research'] },
    steps: [step('practice', 'Rehearse an interview with an AI persona', practiced, { optional: true }), step('first', 'Log your first real customer conversation', (s) => realIv(s) >= 1), step('five', 'Reach 5 real conversations', (s) => realIv(s) >= 5, { optional: true })] },
  { id: 'market', category: 'foundations', title: 'Map your competitors', go: 'market',
    why: 'A list of the products your customers could choose instead of yours.',
    requires: ['idea'], opens: { apps: ['market'] },
    steps: [seenStep('market', 'Read the competitive landscape'), step('battlecard', 'Write a battlecard or comparison page', (s) => n(A(s, 'world').pages) > 0, { optional: true })] },
  { id: 'network', category: 'foundations', title: 'Tell your network what you are building', go: 'messages',
    why: 'Your personal network, kept as a list of people you could tell.',
    requires: ['idea'], opens: { apps: ['messages'] },
    steps: [seenStep('messages', 'Open Messages and see who is around'), step('intro', 'Ask for an intro or advice', (s) => n(s.network?.intros) > 0, { optional: true })] },
  { id: 'you', category: 'foundations', title: 'Know your limits: hours, energy and kill criteria', go: 'you',
    why: 'Working hours and energy tracking, plus a place to write your own stop or pivot criteria.',
    requires: [], appears: (s) => s.day >= 14 || (s.founder?.energy ?? 100) < 75, opens: { apps: ['you'] },
    steps: [seenStep('you', 'Look at where your hours and energy went')] },
  { id: 'scorecard', category: 'foundations', title: 'Check your founder scorecard', go: 'outcomes',
    why: 'Your record of mistakes, habits and criteria so far.',
    requires: ['discovery'], appears: (s) => s.day >= 30, opens: { apps: ['outcomes'] },
    steps: [seenStep('outcomes', 'Read the scorecard')] },

  { id: 'advisors', category: 'foundations', title: 'Find people to take advice from', go: 'advisors',
    why: 'Advisors, consultants, mentors and peer groups you can recruit and ask questions.',
    requires: ['idea'], appears: (s) => s.day >= 14, opens: { apps: ['advisors'] },
    steps: [seenStep('advisors', 'Open Advisors'), step('source', 'Recruit an advisor, consultant or peer group', (s) => (s.advice?.sources ?? []).length > 0, { optional: true })] },

  // Customers & product
  { id: 'mvp', category: 'product', title: 'Test demand (smoke test, concierge)', go: 'mvp',
    why: 'Run small demand experiments such as a smoke-test page or a manual concierge service.',
    requires: ['discovery'], opens: { apps: ['mvp'] },
    steps: [step('experiment', 'Design and run an MVP experiment', (s) => n(A(s, 'mvp').experiments) > 0)] },
  { id: 'spec', category: 'product', title: 'Spec your first feature', go: 'product/board',
    why: 'Write a feature spec in Product: problem, user, evidence and acceptance criteria.',
    requires: ['discovery'], opens: { apps: ['product'] },
    steps: [step('spec', 'Write a one-page feature spec', (s) => features(s).length > 0)] },
  { id: 'ship', category: 'product', title: 'Ship the first version', go: 'product/build',
    why: 'Build and release the first version customers can use.',
    requires: ['spec'], unlocks: { tabs: ['product/releases', 'product/decisions', 'product/changelog'] },
    steps: [step('ship', 'Build and ship a feature', shipped)] },
  { id: 'website', category: 'product', title: 'Put up a landing page', go: 'website',
    why: 'A page that visitors reach from ads, search and outbound links.',
    requires: ['idea'], opens: { apps: ['website'] },
    steps: [step('page', 'Add your landing page (URL, upload or paste)', (s) => Boolean(s.company?.website)), step('panel', 'Get it judged by the customer panel', (s) => Boolean(s.company?.website?.eval))] },
  { id: 'panel', category: 'product', title: 'Watch trial users try the product', go: 'customers',
    why: 'Session recordings and onboarding steps for people trying the product.',
    requires: ['ship'], opens: { apps: ['customers'] },
    steps: [step('panel', 'Run a trial panel', (s) => n(A(s, 'customers').panels) > 0)] },
  { id: 'pricing', category: 'product', title: 'Set your price and plans', go: 'pricing',
    why: 'Choose plans, prices and the free-trial setup in Pricing.',
    requires: ['ship'], opens: { apps: ['pricing'] },
    steps: [seenStep('pricing', 'Review the pricing model and tiers'), step('change', 'Publish tiers or change the price', pricingUsed, { optional: true })] },
  { id: 'insights', category: 'product', title: 'Set up product analytics', go: 'insights', expand: true,
    why: 'Event tracking and funnels for your product.',
    requires: ['panel'], opens: { apps: ['insights'] },
    steps: [seenStep('insights', 'Read the activation funnel'), step('pmf', 'Run a PMF survey', (s) => n(A(s, 'insights').pmf?.surveys) > 0, { optional: true })] },
  { id: 'experiments', category: 'product', title: 'Run experiments and feature flags', go: 'insights/experiments', expand: true,
    why: 'A tool for A/B tests and feature flags.',
    requires: ['insights', 'first_customer'], opens: { tabs: ['insights/experiments', 'insights/explorer', 'insights/plg'] },
    steps: [step('exp', 'Start an experiment', (s) => n(A(s, 'insights').experiments) > 0)] },
  { id: 'support', category: 'product', title: 'Answer your first support ticket', go: 'helpdesk',
    why: 'Your support inbox and the replies your customers are waiting on.',
    requires: [], appears: (s) => tickets(s).length > 0 || charged(s), opens: { apps: ['helpdesk'] }, unlocks: { tabs: ['people/support'] },
    steps: [step('reply', 'Reply to a ticket', (s) => tickets(s).some((t) => t.firstResponseDay != null)), step('kb', 'Write a help-center article or macro', (s) => n(A(s, 'support').articles) + n(A(s, 'support').macros) > 0, { optional: true })] },
  { id: 'support_scale', category: 'product', title: 'Scale support: AI agent and support ops', go: 'helpdesk/ai', expand: true,
    why: 'Set up an AI support agent and the help content it answers from.',
    requires: ['support'], opens: { tabs: ['helpdesk/ai', 'helpdesk/ops'] }, steps: [] },
  { id: 'reviews', category: 'product', title: 'Ask happy customers for reviews', go: 'helpdesk/reviews', expand: true,
    why: 'Request reviews on G2, Capterra and the app stores.',
    requires: ['support', 'first_customer'], opens: { tabs: ['helpdesk/reviews'] }, steps: [] },

  // Sales (B2B)
  { id: 'crm', category: 'sales', title: 'Build a prospect list in the CRM', go: 'crm/prospects', models: SMB_ENT,
    why: 'Companies and contacts you plan to sell to, kept in the CRM.',
    requires: ['discovery'], opens: { apps: ['crm'] },
    steps: [step('first', 'Add your first prospect', (s) => contacts(s) >= 1), step('ten', 'Get to 10 well-researched prospects', (s) => contacts(s) >= 10, { optional: true })] },
  { id: 'outbound', category: 'sales', title: 'Set up cold email', go: 'outreach/infra', expand: true, models: SMB_ENT,
    why: 'Domains, authentication records and mailbox warmup for outbound email.',
    requires: ['crm'], opens: { apps: ['outreach'] },
    steps: [step('domain', 'Buy a secondary sending domain', (s) => n(A(s, 'outreach').domains) > 0), step('sequence', 'Write a sequence', (s) => n(A(s, 'outreach').sequences) > 0), step('enroll', 'Enroll prospects', (s) => n(A(s, 'outreach').enrollments) > 0, { optional: true })] },
  { id: 'calls', category: 'sales', title: 'Run your first sales call', go: 'calls', models: SMB_ENT,
    why: 'Run a sales call in the simulator and log the outcome.',
    requires: ['crm'], appears: (s) => n(A(s, 'calls').meetings) > 0 || deals(s).length > 0, opens: { apps: ['calls'] },
    steps: [step('held', 'Hold a call', (s) => (A(s, 'calls').meetings ?? []).some((m) => ['done', 'held'].includes(m.status)))] },
  { id: 'deal', category: 'sales', title: 'Win your first deal', go: 'crm/pipeline', models: SMB_ENT,
    why: 'Move a deal through the CRM to closed-won.',
    requires: ['calls'], unlocks: { tabs: ['crm/forecast', 'crm/learning'] },
    steps: [step('won', 'Close a deal as won', (s) => deals(s).some((d) => d.stage === 'won'))] },
  { id: 'presell', category: 'sales', title: 'Pre-sell the product', go: 'crm/presell', expand: true, models: SMB_ENT,
    why: 'Ask prospects for a paid pilot or letter of intent before the product exists.',
    requires: ['crm'], opens: { tabs: ['crm/presell'] }, steps: [] },
  { id: 'aisdr', category: 'sales', title: 'Try an AI SDR', go: 'outreach/aisdr', expand: true, models: SMB_ENT,
    why: 'An AI sales-development tool that drafts and sends outreach.',
    requires: ['outbound'], opens: { tabs: ['outreach/aisdr'] }, steps: [] },
  { id: 'success', category: 'sales', title: 'Look after your accounts (customer success)', go: 'success', expand: true, models: SMB_ENT,
    why: 'Renewal dates, champions and account health for your customers.',
    requires: ['first_customer'], opens: { apps: ['success'] }, steps: [] },
  { id: 'land', category: 'sales', title: 'Land and expand', go: 'success/land', expand: true, models: SMB_ENT,
    why: 'Upsell and expansion plays for existing accounts.',
    requires: ['success', 'deal'], opens: { tabs: ['success/land', 'success/expansion'] }, steps: [] },
  { id: 'bids', category: 'sales', title: 'Bid on formal RFPs', go: 'crm/bids', expand: true, models: SMB_ENT,
    why: 'Find, review and answer formal requests for proposals.',
    requires: ['deal'], opens: { tabs: ['crm/bids'] }, steps: [] },

  // Marketing & growth
  { id: 'launch_network', category: 'growth', title: 'Launch to your network', go: 'organic/network',
    why: 'A launch post and messages to the people who already know you.',
    requires: ['website'], opens: { apps: ['organic'] },
    steps: [step('launch', 'Run a network launch', (s) => Boolean(org(s).launch)), step('post', 'Post a build-in-public update', (s) => n(org(s).posts) > 0, { optional: true })] },
  { id: 'seo', category: 'growth', title: 'Set up SEO and AI search (AEO/GEO)', go: 'searchtools', expand: true,
    why: 'Search and AI-answer visibility for your site content.',
    requires: ['website'], opens: { apps: ['searchtools'], tabs: ['organic/content', 'organic/seo', 'organic/writers'] },
    steps: [step('article', 'Publish your first article', (s) => n(org(s).articles) > 0), step('tools', 'Connect Search Console or an SEO tool', (s) => n(A(s, 'searchtools').subs) > 0, { optional: true })] },
  { id: 'community', category: 'growth', title: 'Show up in communities (Reddit, Slack groups)', go: 'organic/community', expand: true,
    why: 'Reddit and Slack communities where your customers talk.',
    requires: ['launch_network'], opens: { tabs: ['organic/community'] },
    steps: [step('post', 'Post in a community', (s) => n(org(s).community?.posts) > 0)] },
  { id: 'ph', category: 'growth', title: 'Plan a Product Hunt launch', go: 'organic/ph', expand: true,
    why: 'Prepare a Product Hunt launch page, assets and schedule.',
    requires: ['launch_network', 'ship'], opens: { tabs: ['organic/ph'] },
    steps: [step('ph', 'Schedule the launch', (s) => Boolean(org(s).ph))] },
  { id: 'referrals', category: 'growth', title: 'Turn on referrals and word of mouth', go: 'organic/referral', expand: true,
    why: 'Referral links and rewards for existing customers.',
    requires: ['first_customer'], opens: { apps: ['organic'], tabs: ['organic/referral'] },
    steps: [step('on', 'Enable a referral program', (s) => Boolean(org(s).referral?.enabled))] },
  { id: 'newsletters', category: 'growth', title: 'Sponsor a newsletter', go: 'organic/newsletters', expand: true,
    why: 'Sponsorship slots in niche newsletters, with Stripe-tracked signups.',
    requires: ['first_customer'], opens: { apps: ['organic'], tabs: ['organic/newsletters'] },
    steps: [step('buy', 'Book a sponsorship', (s) => n(org(s).sponsorships) > 0)] },
  { id: 'ads', category: 'growth', title: 'Test paid ads', go: 'ads', expand: true,
    why: 'Campaign setup on the ad platforms, with spend and results by channel.',
    requires: ['website'], opens: { apps: ['ads'] },
    steps: [step('campaign', 'Launch your first campaign', (s) => n(A(s, 'ads').campaigns) > 0)] },
  { id: 'ugc', category: 'growth', title: 'Work with UGC creators', go: 'ads/creators', expand: true,
    why: 'Briefs, creators and videos for ads and organic posts.',
    requires: ['ads'], opens: { tabs: ['ads/creators'] }, steps: [] },
  { id: 'audience', category: 'growth', title: 'Start a waitlist or newsletter', go: 'audience', expand: true,
    why: 'A signup list for people who want to hear when you launch.',
    requires: ['website'], opens: { apps: ['audience'] },
    steps: [step('platform', 'Pick a newsletter platform', (s) => Boolean(A(s, 'audience').platform))] },
  { id: 'transactional', category: 'growth', title: 'Set up transactional email', go: 'transactional', expand: true,
    why: 'Password resets, receipts and trial notices sent from your own domain.',
    requires: ['ship'], opens: { apps: ['transactional'] },
    steps: [step('provider', 'Choose a provider and authenticate the domain', (s) => Boolean(A(s, 'transactional').provider))] },
  { id: 'lifecycle', category: 'growth', title: 'Send onboarding and lifecycle emails', go: 'lifecycle', expand: true,
    why: 'Welcome, onboarding and trial-ending email sequences.',
    requires: ['ship'], opens: { apps: ['lifecycle'] },
    steps: [step('vendor', 'Pick a lifecycle tool', (s) => Boolean(A(s, 'lifecycle').vendor)), step('flow', 'Build your first flow', (s) => n(A(s, 'lifecycle').flows) > 0, { optional: true })] },
  { id: 'plg', category: 'growth', title: 'Build product-led growth loops', go: 'plg', expand: true,
    why: 'In-product loops such as usage limits, invites and templates.',
    requires: ['first_customer'], opens: { apps: ['plg'] },
    steps: [step('lever', 'Configure a growth lever', (s) => n(A(s, 'plg').levers) > 0)] },
  { id: 'channels', category: 'growth', title: 'Try partnerships, affiliates and marketplaces', go: 'channels', expand: true,
    why: 'Affiliate programs, marketplace listings and partner deals.',
    requires: ['first_customer'], opens: { apps: ['channels'] },
    steps: [step('start', 'Start a channel', channelsUsed)] },
  { id: 'more_channels', category: 'growth', title: 'Events, PR, sponsorships and lifetime deals', go: 'channels/events', expand: true,
    why: 'Conferences, press, sponsorships and lifetime-deal platforms.',
    requires: ['channels'], opens: { tabs: ['channels/partners', 'channels/comarketing', 'channels/events', 'channels/pr', 'channels/sponsors', 'channels/tools', 'channels/ltd', 'channels/direct'] }, steps: [] },
  { id: 'consumer', category: 'growth', title: 'Plan your consumer app launch', go: 'launch', models: ['b2c'],
    why: 'App Store review, paywall and creator-channel setup for a consumer app.',
    requires: ['idea'], opens: { apps: ['launch'], tabs: ['organic/appstore'] },
    steps: [step('stack', 'Pick your app stack', (s) => Boolean(A(s, 'consumer').app?.stack))] },

  // Money
  { id: 'first_customer', category: 'money', title: 'Get your first paying customer', go: 'stripe',
    why: 'The first successful subscription charge in Stripe.',
    requires: ['ship'], opens: { apps: ['stripe'] }, unlocks: { tabs: ['stripe/recovery', 'customers/setup', 'customers/churn'] },
    steps: [step('charge', 'Collect your first payment', charged)] },
  { id: 'analytics', category: 'money', title: 'Read your subscription metrics weekly', go: 'analytics',
    why: 'MRR, churn and trial conversion as Stripe reports them.',
    requires: ['first_customer'], opens: { apps: ['analytics'] },
    steps: [seenStep('analytics', 'Open the weekly dashboard')] },
  { id: 'deep_metrics', category: 'money', title: 'Cohorts, CAC payback and custom queries', go: 'analytics/cohorts', expand: true,
    why: 'Cohort tables, CAC payback and custom queries on your subscription data.',
    requires: ['analytics'], opens: { tabs: ['analytics/cohorts', 'analytics/acquisition', 'analytics/query'] }, steps: [] },
  { id: 'books', category: 'money', title: 'Set up bookkeeping', go: 'books',
    why: 'A chart of accounts, categorised transactions and the books.',
    requires: [['first_customer', 'incorporate']], opens: { apps: ['books'] },
    steps: [seenStep('books', 'Review the bank feed')] },
  { id: 'close', category: 'money', title: 'Run a month-end close', go: 'books/close', expand: true,
    why: 'The monthly close checklist: reconcile, categorise and review deferred revenue.',
    requires: ['books'], opens: { tabs: ['books/close', 'books/bs', 'books/coa', 'books/service'] },
    steps: [step('close', 'Close a month', (s) => n(A(s, 'books').closed) > 0)] },
  { id: 'dispute', category: 'money', title: 'Respond to a payment dispute', go: 'stripe/disputes',
    why: 'The disputes list in Stripe, with evidence submission and deadlines.',
    requires: ['first_customer'], appears: (s) => n(s.stripe?.disputes) > 0, opens: { tabs: ['stripe/disputes'] },
    steps: [step('respond', 'Submit evidence', (s) => (s.stripe?.disputes ?? []).some((d) => d.evidenceQuality != null || ['under_review', 'won'].includes(d.status)))] },
  { id: 'personal', category: 'money', title: 'Plan your personal runway', go: 'financing', expand: true,
    why: 'Your personal savings, income and monthly costs next to the company runway.',
    requires: ['idea'], opens: { apps: ['financing'] }, steps: [] },
  { id: 'treasury', category: 'money', title: 'Earn yield on idle cash (Treasury)', go: 'bank/treasury', expand: true,
    why: 'Move idle cash into a Treasury account that pays interest.',
    requires: [], appears: (s) => lastMetric(s, 'cash') >= 50000, opens: { tabs: ['bank/treasury'] }, steps: [] },
  { id: 'perks', category: 'money', title: 'Apply for startup credits', go: 'bank/perks', expand: true,
    why: 'Applications to cloud and AI providers for startup credits.',
    requires: ['incorporate'], opens: { tabs: ['bank/perks'] },
    steps: [step('apply', 'Apply for a credit program', (s) => n(A(s, 'perks').applications) > 0)] },
  { id: 'stack', category: 'money', title: 'Audit your software stack', go: 'bank/stack', expand: true,
    why: 'Your software subscriptions, seats and renewal dates.',
    requires: ['first_customer'], opens: { tabs: ['bank/stack'] }, steps: [] },
  { id: 'services', category: 'money', title: 'Take on consulting work (optional)', go: 'services', expand: true,
    why: 'Take paid consulting engagements alongside the company.',
    requires: [], appears: (s) => n(A(s, 'services').offers) > 0 || n(A(s, 'services').projects) > 0, opens: { apps: ['services'] }, steps: [] },

  // Legal & company
  { id: 'incorporate', category: 'legal', title: 'Incorporate the company', go: 'legal',
    why: 'File to form a company, open a business bank account and issue shares.',
    requires: ['idea'], opens: { apps: ['legal'] }, unlocks: { tabs: ['legal/spend'] },
    done: (s) => Boolean(s.company?.incorporated),
    steps: [step('file', 'File the incorporation', (s) => Boolean(legal(s).incorporation)), step('ein', 'Get an EIN', (s) => legal(s).ein?.status === 'done', { optional: true }), step('stock', 'Issue founder stock (and file the 83(b))', (s) => Boolean(legal(s).founderStock), { optional: true })] },
  { id: 'policies', category: 'legal', title: 'Publish terms and a privacy policy', go: 'legal/privacy',
    why: 'Publish terms of service and a privacy policy for your site and product.',
    requires: ['website', 'incorporate'], steps: [step('tos', 'Publish terms of service and a privacy policy', (s) => (legal(s).docs?.tos ?? 'none') !== 'none')] },
  { id: 'contracts', category: 'legal', title: 'Paper your B2B deals (MSA, DPA, e-sign)', go: 'legal/contracts', models: SMB_ENT,
    why: 'Master service agreement, data processing agreement and e-signature templates.',
    requires: ['deal', 'incorporate'], opens: { tabs: ['legal/contracts'] },
    steps: [step('msa', 'Set up an MSA or e-signature', (s) => (legal(s).docs?.msa ?? 'none') !== 'none' || Boolean(legal(s).docs?.esign))] },
  { id: 'security', category: 'legal', title: 'Handle security reviews and SOC 2', go: 'legal/soc2', expand: true, models: SMB_ENT,
    why: 'Security questionnaires from buyers and the SOC 2 audit process.',
    requires: ['deal'], opens: { apps: ['legal'], tabs: ['legal/soc2', 'legal/security'] }, steps: [] },
  { id: 'trademark', category: 'legal', title: 'Protect your brand name', go: 'legal/tm', expand: true,
    why: 'Trademark search and filing for your company or product name.',
    requires: ['incorporate'], opens: { tabs: ['legal/tm'] }, steps: [] },
  { id: 'aiact', category: 'legal', title: 'Check AI Act duties and AI costs', go: 'legal/ai', expand: true,
    why: 'EU AI Act categories and the inference cost of your AI features.',
    requires: ['ship'], appears: (s) => features(s).some((f) => f.ai?.enabled), opens: { apps: ['legal'], tabs: ['legal/ai', 'product/aicosts'] }, steps: [] },
  { id: 'cofounder', category: 'legal', title: 'Decide whether you need a co-founder', go: 'cofounder', expand: true,
    why: 'Co-founder search, matching and equity agreements.',
    requires: ['discovery'], opens: { apps: ['cofounder'] }, steps: [] },

  // Team
  { id: 'team', category: 'team', title: 'Decide who does the work: AI agents, contractors or a hire', go: 'people', expand: true,
    why: 'Compare AI agents, contractors and employees for a piece of work.',
    requires: ['ship'], opens: { apps: ['people'] }, steps: [] },
  { id: 'first_hire', category: 'team', title: 'Make your first hire', go: 'people/hiring',
    why: 'Job posting, interviews, an offer, payroll and onboarding.',
    requires: ['team'], unlocks: { tabs: ['people/payroll', 'people/onboarding', 'people/benefits', 'people/workplace', 'people/equity'] },
    steps: [step('job', 'Post a job', (s) => n(A(s, 'people').jobs) > 0), step('hire', 'Hire someone (employee or contractor)', (s) => humans(s).length > 0)] },
  { id: 'sales_hire', category: 'team', title: 'Design a sales comp plan', go: 'people/comp', expand: true, models: SMB_ENT,
    why: 'Quota, on-target earnings and accelerators for sales reps.',
    requires: ['first_hire', 'deal'], opens: { tabs: ['people/comp'] }, steps: [] },

  // Fundraising
  { id: 'raise', category: 'fundraising', title: 'Decide whether to raise', go: 'fundraising', expand: true,
    why: 'Fundraising: investor list, pipeline and the terms you could be offered.',
    requires: ['discovery'], opens: { apps: ['fundraising'] },
    steps: [step('panel', 'Get feedback from the investor panel', (s) => n(A(s, 'fundraising').evaluations) > 0)] },
  { id: 'first_safe', category: 'fundraising', title: 'Close your first SAFE', go: 'fundraising/rounds',
    why: 'Draft, negotiate and sign a SAFE with an investor.',
    requires: ['raise'], opens: { tabs: ['fundraising/rounds'] }, unlocks: { tabs: ['fundraising/cap', 'fundraising/ir'] },
    steps: [step('talk', 'Pitch an investor', (s) => n(A(s, 'fundraising').investors) > 0 || n(A(s, 'fundraising').meetings) > 0, { optional: true }), step('close', 'Close a SAFE or round', (s) => n(A(s, 'fundraising').cap?.safes) > 0 || n(A(s, 'fundraising').raises) > 0)] },
  { id: 'exit', category: 'fundraising', title: 'Explore selling the company', go: 'fundraising/exit', expand: true,
    why: 'Valuation, listings and buyer conversations for selling the company.',
    requires: ['first_customer'], appears: (s) => lastMetric(s, 'mrr') >= 2000 || n(A(s, 'fundraising').exit?.offers) > 0, opens: { apps: ['fundraising'], tabs: ['fundraising/exit'] }, steps: [] },

  // Operations & automation
  { id: 'assistant', category: 'ops', title: 'Set up an AI assistant', go: 'assistant', expand: true,
    why: 'An AI assistant that reads your connected apps and drafts digests and summaries.',
    requires: ['discovery'], opens: { apps: ['assistant'] },
    steps: [step('plan', 'Pick an assistant plan', (s) => Boolean(A(s, 'assistant').plan))] },
  { id: 'automations', category: 'ops', title: 'Automate repetitive work', go: 'automations', expand: true,
    why: 'Automations that run recurring tasks on a schedule or trigger.',
    requires: ['first_customer'], opens: { apps: ['automations'] },
    steps: [step('first', 'Build your first automation', (s) => n(A(s, 'automations').automations) > 0)] },
];

export const NODE_BY_ID = Object.fromEntries(NODES.map((x) => [x.id, x]));

// Every tab key the tree gates. Tabs not listed here are always visible.
export const GATED_TABS = new Set(NODES.flatMap((x) => [...(x.opens?.tabs ?? []), ...(x.unlocks?.tabs ?? [])]));

// Real use of an app in an old save (before this system existed): never hide something a player already uses.
export const USED = {
  messages: (s) => n(s.network?.threads) > 0 || n(s.network?.intros) > 0,
  assistant: (s) => Boolean(A(s, 'assistant').plan),
  stripe: (s) => charged(s) || n(s.stripe?.customers) > 0,
  books: (s) => n(A(s, 'books').closed) > 0 || (A(s, 'books').service ?? 'diy') !== 'diy',
  analytics: (s) => n(A(s, 'analytics').saved) > 0 || A(s, 'analytics').lastReviewDay != null,
  crm: (s) => contacts(s) > 0 || deals(s).length > 0,
  outreach: (s) => n(A(s, 'outreach').domains) > 0 || n(A(s, 'outreach').sequences) > 0,
  calls: (s) => n(A(s, 'calls').meetings) > 0,
  success: (s) => n(A(s, 'success').qbrs) + n(A(s, 'success').calls) + n(A(s, 'success').asks) > 0,
  ads: (s) => n(A(s, 'ads').campaigns) > 0 || n(A(s, 'ads').accounts) > 0,
  organic: (s) => Boolean(org(s).launch || org(s).ph) || n(org(s).posts) + n(org(s).articles) + n(org(s).community?.posts) + n(org(s).sponsorships) > 0,
  launch: (s) => Boolean(A(s, 'consumer').app?.stack),
  searchtools: (s) => n(A(s, 'searchtools').subs) > 0 || Boolean(A(s, 'searchtools').robots?.edited || A(s, 'searchtools').llmsTxt),
  transactional: (s) => Boolean(A(s, 'transactional').provider),
  lifecycle: (s) => Boolean(A(s, 'lifecycle').vendor) || n(A(s, 'lifecycle').flows) > 0,
  audience: (s) => Boolean(A(s, 'audience').platform),
  plg: (s) => n(A(s, 'plg').levers) > 0,
  channels: channelsUsed,
  pricing: pricingUsed,
  market: (s) => n(A(s, 'world').pages) > 0,
  website: (s) => Boolean(s.company?.website),
  product: (s) => features(s).length > 0,
  customers: (s) => n(A(s, 'customers').panels) > 0,
  research: (s) => n(A(s, 'research').interviews) > 0,
  mvp: (s) => n(A(s, 'mvp').experiments) > 0,
  helpdesk: (s) => Boolean(A(s, 'support').active) || tickets(s).some((t) => t.firstResponseDay != null),
  insights: (s) => n(A(s, 'insights').pmf?.surveys) > 0 || n(A(s, 'insights').experiments) > 0,
  fundraising: (s) => { const f = A(s, 'fundraising'); return n(f.evaluations) + n(f.investors) + n(f.cap?.safes) + n(f.raises) > 0; },
  financing: (s) => n(s.personal?.loans) > 0,
  services: (s) => n(A(s, 'services').projects) > 0,
  people: (s) => humans(s).length > 0 || n(A(s, 'people').jobs) > 0,
  cofounder: (s) => n(A(s, 'cofounder').candidates) > 0 || Boolean(A(s, 'cofounder').me?.profile),
  legal: (s) => Boolean(legal(s).incorporation) || (legal(s).docs?.tos ?? 'none') !== 'none',
  automations: (s) => n(A(s, 'automations').automations) > 0 || Boolean(A(s, 'automations').platform),
};
// Gated tabs of always-visible apps (never in USED): an old save that already uses one keeps it.
export const TAB_USED = {
  'bank/treasury': (s) => Boolean(A(s, 'bank').treasury?.enabled) || (s.bank?.accounts ?? []).some((a) => a.id === 'treasury' && a.balance > 0),
  'bank/perks': (s) => n(A(s, 'perks').applications) > 0 || n(A(s, 'perks').credits) > 0,
};

// ---- app metadata (registered by apps/registry.js so this module never imports the apps) ----
let META = {};
export function registerApps(apps) {
  META = Object.fromEntries(apps.map((a) => [a.id, { id: a.id, title: a.title, icon: a.icon, group: a.group, models: a.models ?? null }]));
}
export const appMeta = (id) => META[id] ?? null;

// ---- progress slice ----
export function ensureProgress(state) {
  if (state.progress) {
    const P = state.progress;
    P.unlocked ??= { apps: {}, tabs: {} }; P.unlocked.apps ??= {}; P.unlocked.tabs ??= {};
    P.done ??= []; P.avail ??= {}; P.requested ??= {}; P.checked ??= {}; P.skipped ??= {}; P.seen ??= {}; P.queue ??= [];
    return P;
  }
  const P = (state.progress = { v: 1, unlocked: { apps: {}, tabs: {} }, done: [], avail: {}, requested: {}, checked: {}, skipped: {}, seen: {}, queue: [] });
  if ((state.day ?? 0) > 0) migrate(state, P);
  return P;
}

// Old save: unlock every app with real activity (and its gated tabs), credit the to-dos already done, silently.
function migrate(state, P) {
  for (const [app, used] of Object.entries(USED)) {
    let u = false;
    try { u = used(state); } catch { u = false; }
    if (!u) continue;
    P.unlocked.apps[app] = state.day;
    P.seen[`app:${app}`] = state.day;
    for (const key of GATED_TABS) if (key.startsWith(`${app}/`)) P.unlocked.tabs[key] = state.day;
  }
  for (const [key, used] of Object.entries(TAB_USED)) {
    let u = false;
    try { u = used(state); } catch { u = false; }
    if (u) P.unlocked.tabs[key] = state.day;
  }
  // Credit work already done even where the tree would have ordered it differently (e.g. incorporated before an ICP).
  for (const node of NODES) {
    if (!nodeModelOk(state, node) || !nodeComplete(state, node)) continue;
    P.avail[node.id] ??= { day: state.day, by: null };
    P.done.push({ id: node.id, day: state.day, migrated: true });
    grantSet(state, P, node.opens, node.id, true);
    grantSet(state, P, node.unlocks, node.id, true);
  }
  evaluate(state, { silent: true });
  for (const id of Object.keys(P.unlocked.apps)) P.seen[`app:${id}`] ??= state.day;
  for (const id of Object.keys(P.avail)) P.seen[`node:${id}`] ??= state.day;
}

const modelOf = (state) => state.company?.model ?? 'smb';
export function nodeModelOk(state, node) {
  const m = modelOf(state);
  if (node.models && !node.models.includes(m)) return false;
  const app = appOfKey(node.go);
  const meta = META[app];
  return !meta?.models || meta.models.includes(m);
}
export const appOfKey = (key) => String(key ?? '').split('/')[0];

// A completion entry (not a sub-step, nor a 'request' / 'skip' / 'unskip' event).
const isCompletion = (d) => !d.step && !d.kind;
function doneIndex(P) {
  const ix = {};
  for (const d of P.done) if (isCompletion(d) && ix[d.id] == null) ix[d.id] = d.day;
  return ix;
}
// What later to-dos wait on: done, or skipped for now.
function reqIndex(P) {
  const ix = doneIndex(P);
  for (const [id, day] of Object.entries(P.skipped)) ix[id] ??= day;
  return ix;
}
export const isNodeDone = (state, id) => ensureProgress(state).done.some((d) => d.id === id && isCompletion(d));

function reqMet(r, ix) { return Array.isArray(r) ? r.some((x) => ix[x] != null) : ix[r] != null; }
function rawAvailable(state, node, ix) {
  if (!nodeModelOk(state, node)) return false;
  if (!(node.requires ?? []).every((r) => reqMet(r, ix))) return false;
  if (node.appears) { try { if (!node.appears(state)) return false; } catch { return false; } }
  return true;
}

export function stepDone(state, node, st) {
  const P = ensureProgress(state);
  if (P.checked[`${node.id}/${st.id}`] != null) return true;
  if (!st.done) return false;
  try { return Boolean(st.done(state)); } catch { return false; }
}

function nodeComplete(state, node) {
  if (node.done) { try { return Boolean(node.done(state)); } catch { return false; } }
  const req = (node.steps ?? []).filter((x) => !x.optional);
  if (!req.length) return node.expand ? ensureProgress(state).requested[node.id] != null : false;
  return req.every((x) => stepDone(state, node, x));
}

function grant(state, P, kind, id, by, silent) {
  const map = kind === 'app' ? P.unlocked.apps : P.unlocked.tabs;
  if (kind === 'app' && ALWAYS_VISIBLE.includes(id)) return false;
  if (kind === 'tab' && !GATED_TABS.has(id)) return false;
  if (map[id] != null) return false;
  if (kind === 'app') { const meta = META[id]; if (meta?.models && !meta.models.includes(modelOf(state))) return false; }
  map[id] = state.day ?? 0;
  if (silent) { if (kind === 'app') P.seen[`app:${id}`] = state.day ?? 0; } else P.queue.push({ kind, id, day: state.day ?? 0, by });
  return true;
}
function grantSet(state, P, set, by, silent) {
  let ch = false;
  for (const a of set?.apps ?? []) ch = grant(state, P, 'app', a, by, silent) || ch;
  for (const t of set?.tabs ?? []) ch = grant(state, P, 'tab', t, by, silent) || ch;
  return ch;
}

// Re-evaluate the whole tree. Returns { completed, revealed } (node ids). Cheap: run daily and on every render.
export function evaluate(state, { silent = false } = {}) {
  const P = ensureProgress(state);
  const day = state.day ?? 0;
  const completed = [], revealed = [];
  const done = doneIndex(P);
  const ix = reqIndex(P);
  let lastDone = null;
  for (let pass = 0, changed = true; changed && pass < 12; pass++) {
    changed = false;
    for (const node of NODES) {
      if (done[node.id] != null) continue;
      if (!nodeModelOk(state, node)) continue;
      if (!P.avail[node.id] && rawAvailable(state, node, ix)) {
        const by = (node.requires ?? []).flat().filter((r) => ix[r] != null).sort((a, b) => ix[b] - ix[a])[0] ?? null;
        P.avail[node.id] = { day, by: by ?? lastDone };
        revealed.push(node.id);
        if (!node.expand) grantSet(state, P, node.opens, node.id, silent);
        changed = true;
      }
      const reachable = P.avail[node.id] || P.requested[node.id] != null;
      if (!reachable) continue;
      for (const st of node.steps ?? []) {
        if (!st.done || P.checked[`${node.id}/${st.id}`] != null) continue;
        if (P.done.some((d) => d.id === node.id && d.step === st.id)) continue;
        let ok = false;
        try { ok = Boolean(st.done(state)); } catch { ok = false; }
        if (ok) P.done.push({ id: node.id, step: st.id, day });
      }
      if (nodeComplete(state, node)) {
        P.done.push({ id: node.id, day });
        delete P.skipped[node.id]; // did it after all
        done[node.id] = day;
        ix[node.id] = day;
        lastDone = node.id;
        completed.push(node.id);
        grantSet(state, P, node.opens, node.id, silent);
        grantSet(state, P, node.unlocks, node.id, silent);
        changed = true;
      }
    }
  }
  return { completed, revealed };
}

// "Set it up" on an expand node (or "Expand now" on anything): the founder asks for this function.
export function requestNode(state, id) {
  const node = NODE_BY_ID[id];
  if (!node) throw new Error(`Unknown to-do ${id}`);
  const P = ensureProgress(state);
  if (P.requested[id] == null) { P.requested[id] = state.day ?? 0; P.done.push({ id, day: state.day ?? 0, kind: 'request' }); }
  P.avail[id] ??= { day: state.day ?? 0, by: null, early: true };
  grantSet(state, P, node.opens, id, false);
  // Expand nodes have nothing else to do: asking is the step. Task nodes keep their real detector.
  evaluate(state);
  return node;
}

// "Skip for now": the to-do moves to the Skipped list and stops blocking the ones after it. It still completes itself
// if the founder does the work later, and can be brought back to the open list.
export function skipNode(state, id) {
  const node = NODE_BY_ID[id];
  if (!node) throw new Error(`Unknown to-do ${id}`);
  const P = ensureProgress(state);
  if (nodeStatus(state, node) !== 'available') throw new Error('Only an open to-do can be skipped.');
  P.skipped[id] = state.day ?? 0;
  P.done.push({ id, day: state.day ?? 0, kind: 'skip' });
  evaluate(state);
  return node;
}

export function unskipNode(state, id) {
  const P = ensureProgress(state);
  if (P.skipped[id] == null) return;
  delete P.skipped[id];
  P.done.push({ id, day: state.day ?? 0, kind: 'unskip' });
}

// Nodes that open or unlock an app id or an 'app/tab' key (first = the natural one).
export function providersOf(key) {
  const isTab = key.includes('/');
  return NODES.filter((x) => {
    const sets = [x.opens, x.unlocks];
    return sets.some((s) => (isTab ? s?.tabs?.includes(key) : s?.apps?.includes(key)));
  });
}

// "Expand now" from a locked page or the Help catalogue: unlock exactly this key. If an expand node owns it as its
// function, that counts as the founder's request for the whole node.
export function expandKey(state, key) {
  const P = ensureProgress(state);
  const prov = providersOf(key).filter((x) => nodeModelOk(state, x));
  const own = prov.find((x) => x.expand && (key.includes('/') ? x.opens?.tabs?.includes(key) : x.opens?.apps?.includes(key)));
  if (own) { requestNode(state, own.id); if (!key.includes('/')) return; }
  if (key.includes('/')) {
    grant(state, P, 'app', appOfKey(key), own?.id ?? null, false);
    grant(state, P, 'tab', key, own?.id ?? null, false);
  } else grant(state, P, 'app', key, own?.id ?? null, false);
  P.requested[`key:${key}`] ??= state.day ?? 0;
}

export function isAppUnlocked(state, id) {
  if (ALWAYS_VISIBLE.includes(id)) return true;
  return ensureProgress(state).unlocked.apps[id] != null;
}
export const isTabGated = (key) => GATED_TABS.has(key);
export function isTabUnlocked(state, key) {
  if (!GATED_TABS.has(key)) return true;
  return ensureProgress(state).unlocked.tabs[key] != null;
}

export function toggleStep(state, nodeId, stepId) {
  const node = NODE_BY_ID[nodeId];
  const st = node?.steps?.find((x) => x.id === stepId);
  if (!st) throw new Error('Unknown step');
  if (st.done) throw new Error('This one ticks itself when you actually do it.');
  const P = ensureProgress(state);
  const k = `${nodeId}/${stepId}`;
  if (P.checked[k] != null) {
    delete P.checked[k];
    P.done = P.done.filter((d) => !(d.id === nodeId && d.step === stepId));
  } else {
    P.checked[k] = state.day ?? 0;
    P.done.push({ id: nodeId, step: stepId, day: state.day ?? 0 });
  }
  evaluate(state);
}

export function nodeStatus(state, node) {
  const P = ensureProgress(state);
  if (P.done.some((d) => d.id === node.id && isCompletion(d))) return 'done';
  if (P.skipped[node.id] != null) return 'skipped';
  if (P.avail[node.id] || P.requested[node.id] != null) return 'available';
  return 'locked';
}

export function markSeen(state, key) {
  const P = ensureProgress(state);
  if (P.seen[key] == null) { P.seen[key] = state.day ?? 0; return true; }
  return false;
}
export const isNewApp = (state, id) => !ALWAYS_VISIBLE.includes(id) && isAppUnlocked(state, id) && ensureProgress(state).seen[`app:${id}`] == null;

export function takeQueue(state) {
  const P = ensureProgress(state);
  const q = P.queue;
  P.queue = [];
  return q;
}

// Fresh to-dos the founder has not looked at yet (todos sidebar badge).
export function unseenCount(state) {
  const P = ensureProgress(state);
  return NODES.filter((x) => P.avail[x.id] && P.seen[`node:${x.id}`] == null && nodeStatus(state, x) === 'available' && nodeModelOk(state, x)).length;
}

// History rows, newest first: { day, id, step?, kind, node, stepTitle }
export function history(state) {
  const P = ensureProgress(state);
  return P.done.map((d, i) => ({ ...d, i, node: NODE_BY_ID[d.id], stepTitle: d.step ? NODE_BY_ID[d.id]?.steps?.find((x) => x.id === d.step)?.title : null }))
    .filter((r) => r.node)
    .sort((a, b) => b.day - a.day || b.i - a.i);
}
