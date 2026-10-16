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

// Segments whose real jobs differ from their group's (data/buyer-segments.js ids). A segment listed here uses
// only these jobs; the others fall back to GROUP_JOBS[group]. The group lists fit their core members
// (owner_smb: shops/restaurants/salons/trades; company: mid-market and enterprise; regulated: none fully;
// health: practices/hospitals; public: local/state; education: K-12; nonprofit: nonprofits and associations).
// The jobs are the recurring workflows described per segment in docs/research/buyer-segments/g1-g8 and
// docs/research/customer-types/ (a-startups, c-ecommerce); the lists themselves and which job a segment ranks
// first (drawn per game in core/truth.js) are [design].
export const SEGMENT_JOBS = {
  retail_shops: [
    j('stock', 'Know what to reorder before running out', ['inventory', 'stock', 'reorder', 'supplier', 'purchase order', 'stockout']),
    j('pos_sync', 'Keep store and online stock and sales in sync', ['pos', 'point of sale', 'online store', 'sync', 'shopify', 'square', 'catalog']),
    j('staff_sched', 'Schedule staff around busy days', ['schedule', 'shift', 'staff', 'roster', 'timesheet', 'hours']),
    j('repeat_customers', 'Bring customers back and fill quiet days', ['loyalty', 'repeat', 'promotion', 'email', 'sms', 'text message', 'marketing']),
    j('bookkeeping', 'Close the books and file taxes without a weekend of cleanup', ['bookkeep', 'reconcil', 'sales tax', 'receipt', 'expense', 'quickbooks', 'xero']),
    j('shrink', 'Cut shrink, markdowns and dead stock', ['shrink', 'theft', 'markdown', 'dead stock', 'margin', 'pricing']),
  ],
  trucking: [
    j('loads', 'Find good loads and keep trucks from running empty', ['load', 'load board', 'deadhead', 'broker', 'lane', 'freight', 'rate']),
    j('dispatch', 'Dispatch drivers and track where every truck is', ['dispatch', 'route', 'tracking', 'gps', 'eta', 'driver']),
    j('get_paid_freight', 'Get paid on delivered loads without waiting 60 days', ['invoice', 'factoring', 'proof of delivery', 'pod', 'rate confirmation', 'payment', 'collect']),
    j('compliance_hos', 'Stay compliant on hours of service, ELD, IFTA and DOT audits', ['hours of service', 'eld', 'ifta', 'dot', 'fmcsa', 'compliance', 'audit', 'logbook']),
    j('fleet_maint', 'Keep trucks maintained and inspected before breakdowns', ['maintenance', 'inspection', 'repair', 'dvir', 'breakdown', 'tire']),
    j('fuel_driver', 'Control fuel cost and keep drivers from quitting', ['fuel', 'fuel card', 'mpg', 'driver pay', 'settlement', 'retention', 'recruit']),
  ],
  general_contractors: [
    j('bids', 'Win bids with accurate estimates and takeoffs', ['bid', 'estimate', 'takeoff', 'quote', 'proposal', 'tender']),
    j('change_orders', 'Track change orders and get paid for them', ['change order', 'rfi', 'scope', 'extra work', 'approval']),
    j('subs_schedule', 'Coordinate subs and keep the job schedule on track', ['subcontractor', 'schedule', 'crew', 'gantt', 'site', 'delay']),
    j('pay_apps', 'Get pay applications approved and lien waivers collected', ['pay app', 'progress billing', 'lien waiver', 'retainage', 'invoice', 'aia']),
    j('job_costing', 'Know job cost and margin while the job is running', ['job cost', 'budget', 'margin', 'cost code', 'overrun', 'reconcil']),
    j('site_safety', 'Keep daily logs, safety and inspection paperwork done', ['daily log', 'safety', 'osha', 'inspection', 'punch list', 'photo']),
  ],
  pharma: [
    j('gxp_docs', 'Control GxP documents and SOPs without a validation backlog', ['sop', 'document control', 'gxp', 'validation', 'csv', 'part 11', 'controlled document']),
    j('deviations', 'Close deviations and CAPAs before the inspection', ['deviation', 'capa', 'quality event', 'investigation', 'root cause', 'qms']),
    j('trial_ops', 'Run clinical trials on time and enroll patients faster', ['clinical trial', 'trial', 'site', 'enrollment', 'recruit', 'edc', 'protocol']),
    j('submissions', 'Assemble regulatory submissions and answer agency questions', ['submission', 'regulatory', 'fda', 'ema', 'dossier', 'ectd', 'filing']),
    j('pv', 'Process adverse-event cases and safety reports on time', ['adverse event', 'pharmacovigilance', 'safety report', 'case intake', 'signal']),
    j('supplier_qual', 'Qualify suppliers and CROs and keep audits current', ['supplier', 'cro', 'vendor', 'qualification', 'audit', 'third-party']),
  ],
  real_estate: [
    j('leads_re', 'Follow up on every buyer and seller lead fast', ['lead', 'follow up', 'follow-up', 'crm', 'inquiry', 'zillow', 'sphere']),
    j('listing_mktg', 'Market listings and get them shown', ['listing', 'photo', 'description', 'mls', 'open house', 'showing', 'flyer']),
    j('transaction', 'Keep every deal on track from contract to close', ['transaction', 'closing', 'contract', 'escrow', 'contingenc', 'deadline', 'coordinator']),
    j('client_comms_re', 'Keep clients updated without constant calls and texts', ['client', 'update', 'status', 'text', 'portal', 'message']),
    j('past_clients', 'Stay in touch with past clients for referrals', ['referral', 'past client', 'nurture', 'newsletter', 'anniversary', 'sphere']),
    j('commissions', 'Track commission splits, fees and agent payouts', ['commission', 'split', 'payout', 'agent fee', 'brokerage', 'cap']),
  ],
  agencies: [
    j('client_reporting', 'Build client reports without a day of copy-paste each month', ['report', 'reporting', 'client report', 'dashboard', 'ga4', 'looker', 'kpi']),
    j('utilization', 'Track hours, utilization and profit per client', ['timesheet', 'time track', 'utilization', 'billable', 'profitab', 'margin']),
    j('scope_creep', 'Stop scope creep and bill for extra work', ['scope', 'retainer', 'change request', 'overservic', 'invoice', 'estimate']),
    j('approvals', 'Get creative reviewed and approved without email chains', ['approval', 'proof', 'feedback', 'review', 'revision', 'creative']),
    j('new_biz', 'Keep a pipeline of new clients so revenue is not lumpy', ['new business', 'pitch', 'proposal', 'lead', 'pipeline', 'referral']),
    j('resourcing', 'Staff projects with the right people and freelancers', ['resourc', 'freelancer', 'capacity', 'staffing', 'project', 'workload']),
  ],
  ecommerce: [
    j('inventory_ec', 'Avoid stockouts and overstock across channels', ['inventory', 'stockout', 'stock', 'reorder', 'forecast', 'purchase order', 'overstock']),
    j('payout_recon', 'Reconcile payouts, fees and sales tax across Shopify, Amazon and Stripe', ['reconcil', 'payout', 'fees', 'sales tax', 'shopify', 'amazon', 'stripe', 'bookkeep', 'cogs']),
    j('ads_roas', 'Know which ad spend actually pays back', ['ad spend', 'roas', 'attribution', 'meta ads', 'google ads', 'cac', 'campaign']),
    j('fulfillment', 'Ship orders on time and cut shipping cost', ['fulfillment', 'shipping', 'label', '3pl', 'warehouse', 'carrier', 'pick']),
    j('returns', 'Handle returns and exchanges without losing the margin', ['return', 'exchange', 'refund', 'rma', 'restock']),
    j('support_peaks', 'Answer "where is my order" at peak season without hiring', ['support', 'ticket', 'wismo', 'where is my order', 'helpdesk', 'gorgias', 'inbox', 'chat']),
  ],
  startup_smb: [
    j('ship_faster', 'Ship faster with a small engineering team', ['deploy', 'ci', 'code review', 'release', 'engineering', 'developer', 'bug', 'ship']),
    j('tool_sprawl', 'Stop re-keying data across too many tools', ['integrat', 'sync', 'tool sprawl', 'saas', 'api', 'data entry', 'zapier']),
    j('board_reporting', 'Report metrics to investors and the board without a week of spreadsheets', ['investor', 'board', 'investor update', 'metrics', 'mrr', 'kpi', 'reporting', 'runway']),
    j('hiring_onboarding', 'Hire and onboard people without dropping the ball', ['hiring', 'candidate', 'recruit', 'onboard', 'offer', 'interview']),
    j('security_reviews', 'Pass customer security reviews and SOC 2', ['security questionnaire', 'security review', 'soc 2', 'compliance', 'vendor assessment', 'trust center']),
    j('cloud_ai_spend', 'Keep cloud and AI spend from eating the margin', ['cloud cost', 'aws', 'gpu', 'llm cost', 'inference', 'spend', 'finops', 'billing']),
  ],
  hotels: [
    j('rates_occupancy', 'Set rates to fill rooms without leaving money on the table', ['rate', 'pricing', 'occupancy', 'revpar', 'revenue management', 'demand']),
    j('direct_bookings', 'Win direct bookings and pay OTAs less commission', ['direct booking', 'booking engine', 'ota', 'booking.com', 'expedia', 'commission', 'website']),
    j('guest_comms', 'Answer guest messages and requests fast, day and night', ['guest', 'message', 'concierge', 'chat', 'text', 'request', 'check-in']),
    j('housekeeping', 'Turn rooms on time and track housekeeping and maintenance', ['housekeeping', 'room status', 'turnover', 'maintenance', 'work order', 'cleaning']),
    j('staffing_hotel', 'Schedule and keep front-desk and housekeeping staff', ['schedule', 'shift', 'staff', 'roster', 'payroll', 'labor']),
    j('reviews', 'Get more good reviews and answer the bad ones', ['review', 'tripadvisor', 'reputation', 'rating', 'feedback', 'survey']),
  ],
  franchise_systems: [
    j('brand_standards', 'Check every location meets brand and ops standards', ['audit', 'inspection', 'checklist', 'brand standard', 'compliance', 'field visit']),
    j('unit_opening', 'Open new units on schedule', ['opening', 'onboard', 'training', 'new location', 'launch', 'construction']),
    j('royalty_reporting', 'Collect sales reports and royalties from franchisees', ['royalt', 'sales report', 'franchisee reporting', 'fees', 'reconcil', 'pos']),
    j('local_marketing', 'Run local marketing that stays on brand', ['local marketing', 'co-op', 'ad fund', 'brand', 'campaign', 'social']),
    j('franchisee_comms', 'Keep franchisees informed and trained', ['franchisee', 'communication', 'training', 'intranet', 'announcement', 'lms']),
    j('franchise_sales', 'Qualify franchise candidates and keep development moving', ['franchise sales', 'candidate', 'lead', 'discovery day', 'pipeline', 'fdd']),
  ],
  banks: [
    j('audit_evidence', 'Collect audit evidence without a quarterly scramble', ['audit', 'evidence', 'control', 'soc 2', 'policy', 'attestation']),
    j('compliance_reports', 'File required reports correctly and on time', ['regulatory', 'report', 'filing', 'compliance', 'submission', 'exam', 'call report']),
    j('kyc_onboarding', 'Onboard customers through KYC and verification faster', ['kyc', 'aml', 'verification', 'onboarding', 'identity', 'account opening']),
    j('loan_processing', 'Process loan files and underwriting faster', ['loan', 'underwrit', 'origination', 'credit memo', 'document', 'extract']),
    j('fraud_aml', 'Catch fraud and clear AML alerts without false-positive overload', ['fraud', 'aml', 'alert', 'sar', 'transaction monitoring', 'false positive']),
    j('vendor_risk', 'Assess and monitor vendor risk', ['vendor', 'third-party', 'risk', 'questionnaire', 'due diligence']),
  ],
  insurance: [
    j('quote_bind', 'Quote, compare carriers and bind policies faster', ['quote', 'rating', 'bind', 'carrier', 'comparative rater', 'application', 'underwrit']),
    j('claims_ins', 'Take in and settle claims faster', ['claim', 'fnol', 'adjust', 'settlement', 'intake', 'extract', 'document']),
    j('renewals', 'Keep renewals from slipping and clients from shopping', ['renewal', 'retention', 'remarket', 'expiring', 'policy', 'cross-sell']),
    j('compliance_reports', 'File required reports and keep licenses current', ['regulatory', 'report', 'filing', 'compliance', 'license', 'continuing education']),
    j('commissions_ins', 'Reconcile carrier commissions and statements', ['commission', 'statement', 'reconcil', 'carrier', 'producer']),
    j('doc_processing', 'Extract data from applications, policies and loss runs', ['extract', 'document', 'loss run', 'acord', 'ocr', 'scan']),
  ],
  manufacturing: [
    j('asset_maintenance', 'Plan maintenance and inspections before failures', ['maintenance', 'work order', 'asset', 'inspection', 'downtime', 'sensor', 'cmms']),
    j('quality', 'Catch defects and close quality issues fast', ['quality', 'defect', 'ncr', 'inspection', 'capa', 'spc', 'scrap', 'iso']),
    j('production_sched', 'Schedule production to hit ship dates', ['production', 'schedule', 'capacity', 'shop floor', 'job', 'throughput', 'mes']),
    j('materials', 'Have the right materials and parts without excess stock', ['inventory', 'material', 'mrp', 'erp', 'purchase order', 'supplier', 'bom']),
    j('quotes_mfg', 'Quote custom jobs quickly and accurately', ['quote', 'rfq', 'estimate', 'costing', 'cad', 'bid']),
    j('safety_mfg', 'Keep safety, training and compliance records audit-ready', ['safety', 'osha', 'training', 'compliance', 'audit', 'incident']),
  ],
  utilities: [
    j('asset_maintenance', 'Plan maintenance and inspections before failures', ['maintenance', 'work order', 'asset', 'inspection', 'downtime', 'sensor', 'gis']),
    j('outages', 'Respond to outages and keep customers informed', ['outage', 'restoration', 'storm', 'customer notification', 'alert', 'sms']),
    j('field_crews', 'Dispatch field crews and track work', ['crew', 'dispatch', 'field', 'work order', 'mobile', 'fleet']),
    j('compliance_reports', 'File required regulatory reports correctly and on time', ['regulatory', 'report', 'filing', 'compliance', 'puc', 'nerc', 'epa']),
    j('billing_util', 'Read meters and bill accurately with fewer complaints', ['meter', 'billing', 'ami', 'usage', 'bill', 'payment']),
    j('vegetation', 'Manage vegetation and inspection cycles along lines and pipes', ['vegetation', 'right-of-way', 'line', 'pipeline inspection', 'patrol', 'drone']),
  ],
  federal: [
    j('case_backlog', 'Clear case and benefits-claim backlogs', ['case', 'backlog', 'claim', 'adjudicat', 'benefit', 'application']),
    j('foia', 'Answer FOIA and records requests on time', ['foia', 'records', 'request', 'redact', 'disclosure']),
    j('ato_security', 'Get and keep an authority to operate (ATO) and FedRAMP controls', ['ato', 'fedramp', 'fisma', 'nist', 'control', 'security', 'compliance']),
    j('acquisition', 'Run acquisitions and contracts without delays', ['acquisition', 'procurement', 'contract', 'solicitation', 'rfp', 'far']),
    j('public_reporting', 'Publish required reporting and oversight answers', ['reporting', 'oversight', 'gao', 'inspector general', 'audit', 'dashboard']),
    j('legacy_mod', 'Modernize legacy systems and data without breaking the mission', ['legacy', 'moderniz', 'migration', 'mainframe', 'data', 'integrat']),
  ],
  higher_ed: [
    j('enrollment', 'Hit enrollment targets and convert admitted students', ['enrollment', 'admission', 'applicant', 'recruit', 'yield', 'inquiry']),
    j('retention_he', 'Spot and support students at risk of dropping out', ['retention', 'advising', 'at-risk', 'early warning', 'student success', 'intervention']),
    j('course_sched', 'Schedule courses, rooms and sections', ['course', 'schedule', 'section', 'room', 'timetable', 'registration']),
    j('accreditation', 'Collect evidence for accreditation and assessment reports', ['accreditation', 'assessment', 'learning outcome', 'evidence', 'report', 'ipeds']),
    j('grading_he', 'Cut grading and course admin for faculty', ['grading', 'gradebook', 'assignment', 'feedback', 'lms', 'canvas', 'rubric']),
    j('student_services', 'Answer student questions without long lines and email queues', ['student services', 'financial aid', 'registrar', 'chatbot', 'ticket', 'question', 'help desk']),
  ],
  churches: [
    j('giving', 'Make giving easy and send giving statements', ['giving', 'donation', 'tithe', 'offering', 'statement', 'pledge', 'receipt']),
    j('volunteers', 'Fill volunteer and serving teams without calling everyone', ['volunteer', 'serving', 'team', 'signup', 'sign-up', 'roster', 'schedule']),
    j('member_care', 'Follow up with visitors and care for members', ['visitor', 'member', 'follow up', 'follow-up', 'prayer', 'care', 'directory']),
    j('kids_checkin', 'Check children in safely', ['check-in', 'children', 'kids', 'childcare', 'security', 'label']),
    j('church_comms', 'Get announcements and livestreams to the congregation', ['announcement', 'newsletter', 'text', 'app', 'livestream', 'communication']),
    j('events_groups', 'Run events, small groups and registrations', ['event', 'small group', 'registration', 'rsvp', 'class']),
  ],
};

/** The job templates for a B2B buyer segment: its own list if it has one, else its group's. */
export const segmentJobs = (baseId, group) => SEGMENT_JOBS[baseId] ?? GROUP_JOBS[group] ?? GROUP_JOBS.company;

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
