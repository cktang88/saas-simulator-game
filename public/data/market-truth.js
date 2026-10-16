// Templates for the hidden market (core/truth.js): jobs per segment group, decoy jobs, B2C personas and sizes.
// Pure data. Research: docs/research/early-stage/*.md (misleading-feedback, discovery-by-segment, pmf-process).
// Numbers marked [design] are modelling assumptions, never real statistics; the sourced ones are tagged.

// Hypothetical-to-actual WTP ratio: median 1.35 with a severe positive skew (Murphy, Allen, Stevens and
// Weatherhead 2005 meta-analysis of 28 stated-preference studies; misleading-feedback.md). The log-normal sigma
// (0.45, cap 3.2) gives a long tail to about 3x [design].
export const STATED_WTP = { median: 1.35, sigma: 0.45, cap: 3.2 };

// Share of a person's interview answers that are courtesy, by relationship (Krumpal 2011 social desirability
// review; levels are [design]). Investors and founders have opinions about the idea, not their own pain.
export const POLITENESS = { friend: 0.85, warm: 0.6, stranger: 0.25, investor: 0.15, founder: 0.15 };

// Channel -> relationship of the person you get.
export const CHANNEL_RELATIONSHIP = { friends: 'friend', family: 'friend', warm: 'warm', community: 'stranger', cold: 'stranger', panel: 'stranger', investor: 'investor', founder: 'founder' };

// Response-rate style multipliers by channel for a segment [design]; the segment's own reach modifies these.
export const REACH_BASE = {
  b2c: { warm: 0.9, community: 1.1, cold: 0.8, panel: 1.0 },
  smb: { warm: 1.0, community: 0.9, cold: 0.6, panel: 0.8 },
  ent: { warm: 1.0, community: 0.5, cold: 0.3, panel: 0.4 },
};

const j = (id, label, keywords, need = 2) => ({ id, label, keywords, need });

// Real jobs by buyer-segment group (data/buyer-segments.js `group`). keywords are matched against a feature's
// title + problem + solution; `need` = keyword hits for a full match.
export const GROUP_JOBS = {
  owner_smb: [
    j('get_paid', 'Get paid faster and chase fewer invoices', ['invoice', 'payment', 'collect', 'overdue', 'deposit', 'receivable', 'chase', 'pay online']),
    j('scheduling', 'Keep the schedule full and dispatch the right person', ['schedule', 'booking', 'appointment', 'dispatch', 'calendar', 'route', 'reminder']),
    j('no_shows', 'Stop no-shows and late cancellations', ['no-show', 'no show', 'cancel', 'reminder', 'text message', 'sms', 'confirm']),
    j('payroll_hours', 'Get hours, tips and payroll right', ['payroll', 'timesheet', 'hours', 'shift', 'tips', 'overtime']),
    j('bookkeeping', 'Close the books and file taxes without a weekend of cleanup', ['bookkeep', 'reconcil', 'sales tax', 'receipt', 'expense', 'quickbooks', 'xero']),
    j('stock', 'Know what to reorder before running out', ['inventory', 'stock', 'reorder', 'supplier', 'purchase order']),
  ],
  professional: [
    j('intake', 'Intake and engage new clients without back-and-forth', ['intake', 'onboarding', 'engagement', 'form', 'e-sign', 'signature', 'questionnaire']),
    j('billing_wip', 'Capture billable time and bill on time', ['billable', 'time entry', 'timekeeping', 'invoice', 'retainer', 'trust account', 'wip', 'bill']),
    j('document_work', 'Draft and review documents faster with fewer errors', ['document', 'draft', 'template', 'contract', 'review', 'redline', 'clause']),
    j('deadlines', 'Never miss a filing deadline', ['deadline', 'filing', 'compliance', 'calendar', 'statute', 'due date', 'reminder']),
    j('client_comms', 'Keep clients informed without fielding status calls', ['client portal', 'status update', 'message', 'follow up', 'follow-up', 'portal']),
    j('lead_flow', 'Turn referrals and inquiries into signed work', ['lead', 'referral', 'pipeline', 'inquiry', 'listing', 'proposal']),
  ],
  company: [
    j('pipeline', 'Keep pipeline moving and follow up on every lead', ['lead', 'pipeline', 'crm', 'outreach', 'follow up', 'follow-up', 'deal']),
    j('handoffs', 'Stop work falling between teams', ['handoff', 'approval', 'workflow', 'onboarding', 'ticket', 'task', 'routing']),
    j('finance_close', 'Close the month and control spend', ['reconcil', 'close', 'expense', 'invoice', 'budget', 'accrual']),
    j('support_load', 'Answer customers quickly with a small team', ['support', 'ticket', 'response', 'helpdesk', 'inbox', 'customer question']),
    j('data_entry', 'Stop re-keying data between tools', ['sync', 'integrat', 'import', 'data entry', 'copy', 'spreadsheet', 'export']),
    j('hiring_people', 'Hire, onboard and schedule people without admin pile-up', ['hiring', 'candidate', 'onboard', 'shift', 'roster', 'payroll']),
  ],
  regulated: [
    j('audit_evidence', 'Collect audit evidence without a quarterly scramble', ['audit', 'evidence', 'control', 'soc 2', 'policy', 'attestation']),
    j('compliance_reports', 'File required reports correctly and on time', ['regulatory', 'report', 'filing', 'compliance', 'submission', 'exam']),
    j('kyc_onboarding', 'Onboard customers through KYC and verification faster', ['kyc', 'aml', 'verification', 'onboarding', 'identity', 'underwrit']),
    j('doc_processing', 'Extract data from documents and claims', ['extract', 'document', 'claims', 'intake', 'ocr', 'scan']),
    j('vendor_risk', 'Assess and monitor vendor risk', ['vendor', 'third-party', 'risk', 'questionnaire', 'due diligence']),
    j('asset_maintenance', 'Plan maintenance and inspections before failures', ['maintenance', 'work order', 'asset', 'inspection', 'downtime', 'sensor']),
  ],
  health: [
    j('sched_recall', 'Fill the schedule and recall patients', ['schedule', 'no-show', 'reminder', 'recall', 'waitlist', 'appointment']),
    j('claims', 'Get claims paid and denials fixed', ['claim', 'insurance', 'billing', 'denial', 'eligibility', 'prior auth', 'coding']),
    j('documentation', 'Finish notes and charts without after-hours work', ['note', 'chart', 'documentation', 'dictation', 'scribe', 'transcri']),
    j('patient_comms', 'Handle patient messages, forms and intake', ['patient', 'intake', 'forms', 'portal', 'message', 'check-in']),
    j('staffing', 'Cover shifts and credentials', ['staffing', 'shift', 'credential', 'coverage', 'roster']),
  ],
  public: [
    j('permits_records', 'Process permits and records requests', ['permit', 'records', 'request', 'case', 'license', 'application']),
    j('procurement_grants', 'Manage procurement, grants and budgets', ['procurement', 'grant', 'budget', 'council', 'agenda', 'bid']),
    j('resident_service', 'Handle resident service requests', ['311', 'resident', 'service request', 'citizen', 'complaint', 'ticket']),
    j('field_ops', 'Dispatch field crews and inspections', ['work order', 'inspection', 'fleet', 'crew', 'dispatch']),
    j('public_reporting', 'Publish required reporting', ['reporting', 'open data', 'transparency', 'dashboard', 'audit']),
  ],
  education: [
    j('grading_admin', 'Cut grading and administrative load', ['grading', 'gradebook', 'assignment', 'feedback', 'attendance', 'rubric']),
    j('family_comms', 'Reach parents and families reliably', ['parent', 'family', 'communication', 'notice', 'translation', 'newsletter']),
    j('compliance_ed', 'Meet IEP, student-data and reporting rules', ['iep', 'student data', 'reporting', 'compliance', '504']),
    j('scheduling_ed', 'Schedule rosters, rooms and substitutes', ['schedule', 'roster', 'substitute', 'room', 'timetable']),
    j('student_support', 'Spot and support students who are slipping', ['tutoring', 'intervention', 'advising', 'at-risk', 'early warning']),
  ],
  nonprofit: [
    j('donor_mgmt', 'Track donors and send receipts and thank-yous', ['donor', 'gift', 'giving', 'receipt', 'pledge', 'fundrais', 'donation']),
    j('volunteers', 'Fill volunteer shifts without calling everyone', ['volunteer', 'shift', 'signup', 'sign-up', 'roster']),
    j('members', 'Keep members informed and renewing', ['member', 'newsletter', 'renewal', 'dues', 'event']),
    j('grant_reports', 'Report outcomes to funders', ['grant', 'outcomes', 'report', 'funder', 'impact']),
    j('event_reg', 'Run event registration and ticketing', ['event', 'registration', 'ticket', 'rsvp', 'check-in']),
  ],
};

// Plausible-sounding jobs that do not drive purchases: building these gets polite interest and little revenue.
export const DECOYS = [
  j('dash', 'A dashboard of everything', ['dashboard', 'analytics', 'chart', 'insights', 'overview', 'visuali'], 1),
  j('ai_assist', 'An AI assistant / chatbot layer', ['ai assistant', 'chatbot', 'copilot', 'generative', 'ai-powered', 'smart suggestions'], 1),
  j('social', 'Sharing, badges and gamification', ['share', 'social', 'gamif', 'badge', 'leaderboard', 'streak'], 1),
  j('custom_ui', 'Theming, branding and white-label', ['theme', 'dark mode', 'branding', 'white-label', 'customiz'], 1),
  j('api_wish', 'Public API and a marketplace of integrations', ['public api', 'marketplace', 'webhook', 'zapier', 'plugin'], 1),
];

// B2B sub-segments by size / role of the person who feels the pain (added next to the top segment).
export const SIZE_SUBSEGMENTS = [
  { suffix: 'solo', label: 'owner-operated (1-10 people)', keywords: ['solo', 'owner', 'owner-operator', 'owner operator', 'one-person', 'freelance', 'self-employed', 'independent', 'small team', 'sole proprietor', 'founder'], shareFrac: 0.6, wtpMult: 0.7, budgetOwner: 'user', buyerIsUser: true },
  { suffix: 'multi', label: 'larger or multi-site operations (manager buys)', keywords: ['multi-location', 'multi-site', 'multiple locations', 'manager', 'operations manager', 'director', 'group', 'chain', '50+', '100+', 'regional', 'head of'], shareFrac: 0.4, wtpMult: 1.6, budgetOwner: 'manager', buyerIsUser: false },
];

// B2C personas: who the people are, within a category. affinity = how often this persona has the category's problem [design].
export const B2C_PERSONAS = [
  { id: 'students', label: 'Students', keywords: ['student', 'college', 'university', 'school', 'grad', 'undergrad', 'teen', 'exam', 'campus'], wtpMult: 0.55, retention: 0.9, budgetOwner: 'user' },
  { id: 'professionals', label: 'Working professionals', keywords: ['professional', 'worker', 'employee', 'office', 'remote', 'commuter', 'knowledge worker', 'busy', 'career', 'manager'], wtpMult: 1.4, retention: 1.05, budgetOwner: 'user' },
  { id: 'parents', label: 'Parents and families', keywords: ['parent', 'mom', 'dad', 'mother', 'father', 'family', 'families', 'kids', 'children', 'caregiver'], wtpMult: 1.1, retention: 1.1, budgetOwner: 'user' },
  { id: 'creators', label: 'Freelancers and creators', keywords: ['freelance', 'creator', 'influencer', 'artist', 'designer', 'photographer', 'youtuber', 'streamer', 'side hustle', 'solopreneur'], wtpMult: 1.0, retention: 1.0, budgetOwner: 'user' },
  { id: 'seniors', label: 'Older adults and retirees', keywords: ['senior', 'retire', 'older adult', 'elderly', 'boomer', '55+', '60+'], wtpMult: 0.9, retention: 1.15, budgetOwner: 'user' },
  { id: 'hobbyists', label: 'Enthusiasts and hobbyists', keywords: ['hobby', 'hobbyist', 'enthusiast', 'fan', 'gamer', 'runner', 'cyclist', 'cook', 'gardener', 'collector', 'amateur'], wtpMult: 0.95, retention: 1.1, budgetOwner: 'user' },
];

const J = j;
// Category jobs (b2cCategoryOf ids in data/churn-reasons.js B2C_CHURN).
export const B2C_JOBS = {
  health_fitness: [J('plan_fit', 'A plan that fits my schedule and level', ['plan', 'workout', 'routine', 'schedule', 'personaliz']), J('stay_on_track', 'Stay consistent when motivation drops', ['habit', 'reminder', 'streak', 'accountab', 'coach', 'check-in']), J('see_progress', 'See measurable progress', ['progress', 'track', 'weight', 'steps', 'calorie', 'log'])],
  productivity: [J('capture', 'Capture everything without friction', ['capture', 'note', 'quick add', 'inbox', 'voice', 'clip']), J('plan_day', 'Decide what to do today and finish it', ['task', 'plan', 'priorit', 'calendar', 'schedule', 'focus']), J('remember', 'Never forget the thing that matters', ['reminder', 'remind', 'recurring', 'notification', 'follow up'])],
  education_language: [J('learn_stick', 'Make it stick and keep going', ['flashcard', 'spaced', 'review', 'practice', 'streak', 'quiz', 'memor']), J('exam_pass', 'Pass a specific exam or milestone', ['exam', 'test prep', 'mock', 'score', 'syllabus', 'past paper']), J('speak', 'Speak or write with confidence', ['speak', 'conversation', 'pronunc', 'writing', 'tutor', 'feedback'])],
  photo_video: [J('quick_edit', 'Get a good-looking result in minutes', ['edit', 'template', 'filter', 'preset', 'auto', 'one tap', 'enhance']), J('export_share', 'Export and post in the right format', ['export', 'resolution', 'format', 'share', 'watermark', 'reels']), J('organize', 'Find and organize my media', ['organize', 'album', 'library', 'search', 'backup'])],
  finance: [J('see_money', 'See where my money goes without effort', ['budget', 'spending', 'categor', 'bank sync', 'transactions', 'expense']), J('save_more', 'Save toward a goal automatically', ['saving', 'goal', 'round up', 'automat', 'net worth']), J('bills_taxes', 'Handle bills and taxes without surprises', ['bill', 'tax', 'subscription', 'invoice', 'due date'])],
  dating_social: [J('meet_people', 'Meet the right people nearby', ['match', 'nearby', 'meet', 'profile', 'compatib', 'introduc']), J('conversation', 'Start and keep real conversations going', ['chat', 'conversation', 'icebreaker', 'message', 'prompt']), J('safety_trust', 'Feel safe and trust who I meet', ['verif', 'safety', 'report', 'trust', 'privacy'])],
  ai_tools: [J('save_time_writing', 'Get a first draft done in minutes', ['draft', 'write', 'summar', 'generate', 'rewrite', 'email']), J('answers', 'Get reliable answers on my own material', ['answer', 'search', 'document', 'chat with', 'cite', 'knowledge']), J('workflow', 'Plug AI into what I do every day', ['workflow', 'automate', 'template', 'integration', 'batch'])],
  meditation_wellness: [J('calm_now', 'Calm down or sleep tonight', ['sleep', 'calm', 'breath', 'anxiety', 'meditat', 'sound']), J('routine', 'Build a lasting daily practice', ['daily', 'routine', 'streak', 'reminder', 'journal', 'mood']), J('guidance', 'Guidance that fits my situation', ['guided', 'program', 'course', 'therap', 'personaliz'])],
  games_entertainment: [J('fun_now', 'Something engaging for a few minutes', ['level', 'puzzle', 'play', 'challenge', 'daily', 'score']), J('social_play', 'Play with friends', ['friends', 'multiplayer', 'leaderboard', 'invite', 'co-op']), J('progression', 'Feel progress and collect things', ['unlock', 'collect', 'progress', 'reward', 'achievement'])],
  generic: [J('core_task', 'Get the main thing done faster', ['faster', 'easy', 'simple', 'automat', 'save time']), J('remember_track', 'Keep track of things', ['track', 'log', 'reminder', 'history', 'organize']), J('personal', 'Make it fit me', ['personaliz', 'recommend', 'custom', 'preference'])],
};

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'rare'];
// Days since the last incident, by frequency (exponential mean) [design].
export const INCIDENT_MEAN_DAYS = { daily: 3, weekly: 12, monthly: 45, rare: 150 };

// Idiosyncratic asks: what a loud account wants that nobody else does.
export const CUSTOM_ASKS = [
  'a custom integration with their in-house system',
  'a bespoke report in their exact internal format',
  'single sign-on with their legacy directory',
  'a white-labelled version under their own brand',
  'an on-premise deployment',
  'a custom approval chain that matches their org chart',
];

export const STOPWORDS = new Set(['with', 'that', 'this', 'their', 'they', 'them', 'from', 'into', 'each', 'every', 'when', 'what', 'have', 'about', 'than', 'then', 'there', 'which', 'users', 'user', 'customers', 'customer', 'people', 'small', 'business', 'businesses', 'company', 'companies', 'app', 'tool', 'software', 'platform', 'help', 'helps', 'for', 'and', 'the', 'who', 'make', 'makes', 'easy', 'easier', 'using', 'based', 'built', 'simple']);
