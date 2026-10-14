// Founder AI assistant (Claude / ChatGPT Work style): plans, connectors, task templates, failure rates and hours.
// Sources: docs/research/tools/deep/d12-ai-assistants-ops.md (§1 Claude Projects, connectors, scheduled tasks;
// §2 ChatGPT Work metering; cross-cutting hallucination / wrong actions / prompt injection), t8-ops-productivity.md
// (Claude/ChatGPT ~$20/mo individual; Claude Team; Torii adoption), docs/research/operators/o5 §5 (automation and
// AI-tool leverage tiers), docs/review/tool-gap-analysis.md item 1. [design] = game estimate, never a statistic.
//
// Operator tiers (CLAUDE.md principle 7), what the player does and the expected effect over a quarter:
// - stellar: writes project instructions with reader, metrics, thresholds and "say unknown, cite sources"; starts
//   every task draft-only or ask-first; opens each run and clicks two or more source chips (reconciles them with
//   the source app); keeps tasks that read untrusted text (mail, web, tickets) read-only; reconnects expired
//   connectors from the run log. Wrong numbers reaching a report or decision < 2%; zero incidents; real saving.
// - good: templates, reads outputs, verifies now and then. ~5% of used outputs carry an unnoticed wrong number.
// - average: one-line prompts, trusts totals, auto mode on "trusted" connectors. 8-15% wrong numbers used.
// - mediocre: auto mode with write scope on mail, scheduled competitor scan with write scope, never opens the run
//   log. Injection or wrong-recipient incidents every 6-8 weeks, overage, net time saved at or below zero.
// Separation metric: share of used outputs built on a wrong number; incidents per 100 sim days.
// Neither Anthropic nor OpenAI publishes task accuracy (d12 §1-2), so the game never shows an accuracy figure.

// ---- Plans (USD/month). Usage is metered as an opaque weekly allowance shown as a % meter, like the real apps.
export const PLANS = {
  claude_pro: { vendor: 'Anthropic', name: 'Claude Pro', price: 20, weeklyUnits: 50, note: 'About $20/mo (t8 §1; claude.com/pricing [unverified exact]). Projects, connectors and scheduled tasks on all paid plans (d12 §1).' },
  claude_max: { vendor: 'Anthropic', name: 'Claude Max (5x)', price: 100, weeklyUnits: 250, note: 'About $100/mo for ~5x Pro usage (gap analysis item 1; [unverified]).' },
  chatgpt_plus: { vendor: 'OpenAI', name: 'ChatGPT Plus', price: 20, weeklyUnits: 40, note: '$20/mo (d12 §2 [unverified]). ChatGPT Work has no public rate card; scheduled runs count against the cap.' },
  chatgpt_pro: { vendor: 'OpenAI', name: 'ChatGPT Pro', price: 200, weeklyUnits: 400, note: 'Sources conflict: $100 or $200/mo (d12 §2 [unverified]). Priced here at $200.' },
};
export const EXTRA_USAGE_USD_PER_UNIT = 0.5; // [design] pay-as-you-go extra usage once the weekly allowance is gone
export const UNITS = { chat: 1, chatPerConnector: 0.5, run: 2, runPerConnector: 1, web: 3 }; // [design] usage weights

// ---- Connectors (MCP-style). scopes: what the grant allows. untrusted: content written by outsiders (inbound
// email, web pages, customer tickets) that can carry instructions (prompt injection).
export const CONNECTORS = {
  stripe: { label: 'Payments (Stripe)', app: 'stripe', scopes: ['read', 'write'], pageSize: 100, writeDesc: 'refunds and coupons' },
  analytics: { label: 'Analytics', app: 'analytics', scopes: ['read'], pageSize: Infinity },
  crm: { label: 'CRM', app: 'crm', scopes: ['read', 'write'], pageSize: 100, writeDesc: 'update deals and contacts' },
  helpdesk: { label: 'Helpdesk', app: 'helpdesk', scopes: ['read', 'draft', 'write'], pageSize: 50, untrusted: true, writeDesc: 'reply to tickets' },
  books: { label: 'Bank & Books', app: 'books', scopes: ['read', 'write'], pageSize: 250, writeDesc: 'recategorize transactions' },
  calendar: { label: 'Calendar', app: 'calendar', scopes: ['read', 'write'], pageSize: Infinity, writeDesc: 'create and move events' },
  mail: { label: 'Mail', app: 'mail', scopes: ['read', 'draft', 'write'], pageSize: 50, untrusted: true, writeDesc: 'send email as you' },
  web: { label: 'Web (competitor pages)', app: 'market', scopes: ['read'], pageSize: Infinity, untrusted: true },
};
export const SCOPE_RANK = { read: 0, draft: 1, write: 2 };
export const AUTH_DAYS = [60, 90]; // [design] OAuth grants silently expire 60-90 sim days after consent (d12 §1 "stale connector auth")

// ---- Failure model [design] ----
export const FAIL = {
  truncate: 0.5, // a list longer than the connector page is read as the first page only (d12 §1 "partial pages")
  wrongSourced: 0.03, // a sourced number transcribed or period-mixed wrong
  wrongSourcedGoodInstr: 0.015, // with instructions that define metrics and periods
  unsourced: 0.15, // states a number anyway when it has no source (gap item 1: 10-20%)
  unsourcedGoodInstr: 0.05, // instructions say "say unknown when you have no source"
  injectionWebPerRun: 0.06, // a watched page carries an instruction aimed at AI agents
  followInjection: 0.35, // the agent acts on an injected instruction when it can write without asking
  wrongAction: 0.05, // auto write goes to the wrong recipient / wrong category (d12 cross-cutting "wrong actions")
  draftUnsupported: 0.08, // a drafted reply contains a date, price or commitment nobody agreed (d12 §4: 6-10%)
};

// ---- Founder hours [design; d12 §1 time saved] ----
export const HOURS = {
  plan: 0.25, connector: 0.1, reconnect: 0.1, project: 0.25, task: 0.15,
  chat: 0.05, review: 0.15, verify: 0.05, approve: 0, reject: 0.02,
};

// Facts the engine can compute from game state. connector: which grant is needed. kind: 'money'|'count'|'months'|
// 'hours'|'days'|'pct'. list: the fact is derived from a paginated list (truncation applies).
export const FACTS = {
  mrr: { label: 'MRR', connector: 'stripe', kind: 'money', list: true, route: 'stripe' },
  active_customers: { label: 'Paying customers', connector: 'stripe', kind: 'count', list: true, route: 'stripe' },
  new_customers_7d: { label: 'New paying customers (7 days)', connector: 'stripe', kind: 'count', route: 'stripe' },
  churned_30d: { label: 'Cancellations (30 days)', connector: 'stripe', kind: 'count', route: 'stripe' },
  trials: { label: 'Trials in progress', connector: 'stripe', kind: 'count', list: true, route: 'stripe' },
  mrr_change_7d: { label: 'MRR change vs last week', connector: 'analytics', kind: 'pct', route: 'analytics' },
  cash: { label: 'Cash in bank', connector: 'books', kind: 'money', route: 'bank' },
  burn_30d: { label: 'Net burn (30 days)', connector: 'books', kind: 'money', route: 'bank' },
  runway: { label: 'Runway', connector: 'books', kind: 'months', route: 'bank' },
  uncategorized: { label: 'Uncategorized transactions', connector: 'books', kind: 'count', list: true, route: 'books' },
  open_deals: { label: 'Open deals', connector: 'crm', kind: 'count', list: true, route: 'crm' },
  pipeline_value: { label: 'Open pipeline value', connector: 'crm', kind: 'money', list: true, route: 'crm' },
  open_tickets: { label: 'Open support tickets', connector: 'helpdesk', kind: 'count', list: true, route: 'helpdesk' },
  oldest_ticket: { label: 'Oldest open ticket', connector: 'helpdesk', kind: 'days', route: 'helpdesk' },
  meetings_week: { label: 'Meeting hours this week', connector: 'calendar', kind: 'hours', route: 'calendar' },
  focus_week: { label: 'Focus-block hours this week', connector: 'calendar', kind: 'hours', route: 'calendar' },
  unread_mail: { label: 'Unread email threads', connector: 'mail', kind: 'count', list: true, route: 'mail' },
  customer_threads: { label: 'Customer emails awaiting reply', connector: 'mail', kind: 'count', list: true, route: 'mail' },
  rival_price: { label: 'Top competitor price', connector: 'web', kind: 'money', route: 'market' },
};

// Task templates (gap item 1). manualHours: what the work costs by hand (d12 §1-2 [design]).
export const TEMPLATES = {
  weekly_metrics: {
    label: 'Weekly metrics summary', manualHours: 1.25,
    connectors: ['stripe', 'analytics'], optional: ['helpdesk', 'books'],
    facts: ['mrr', 'mrr_change_7d', 'active_customers', 'new_customers_7d', 'churned_30d', 'trials', 'open_tickets', 'cash'],
    prompt: 'Pull last week\'s MRR, new and churned customers, trials and support load. Compare to the prior week and flag anything that moved more than 15%.',
    use: 'Feeds your Monday plan and decisions.',
  },
  competitor_watch: {
    label: 'Competitor page watch', manualHours: 0.6,
    connectors: ['web'], optional: ['mail'],
    facts: ['rival_price'],
    prompt: 'Check the top competitors\' pricing and changelog pages and report what changed since last week, with links.',
    use: 'Positioning and pricing decisions.', untrusted: true,
  },
  receipts_cleanup: {
    label: 'Receipt and expense cleanup', manualHours: 1,
    connectors: ['books'], optional: [],
    facts: ['uncategorized', 'burn_30d'],
    prompt: 'Categorize uncategorized transactions and list any you are unsure about.',
    use: 'Month-end close.', actions: 'recategorize',
  },
  customer_digest: {
    label: 'Customer-email digest', manualHours: 1,
    connectors: ['mail'], optional: ['helpdesk'],
    facts: ['customer_threads', 'open_tickets', 'oldest_ticket'],
    prompt: 'List new customer questions from the inbox and helpdesk, draft answers, do not send.',
    use: 'Faster replies to customers.', untrusted: true, actions: 'reply_drafts',
  },
  meeting_prep: {
    label: 'Meeting prep brief', manualHours: 0.5,
    connectors: ['calendar', 'crm'], optional: ['mail'],
    facts: ['meetings_week', 'open_deals', 'pipeline_value'],
    prompt: 'For this week\'s external meetings, summarize who they are, deal stage and value, and last contact.',
    use: 'Sales calls and investor meetings.', actions: 'agenda',
  },
  investor_update: {
    label: 'Investor-update draft', manualHours: 2,
    connectors: ['stripe', 'books'], optional: ['crm', 'analytics'],
    facts: ['mrr', 'mrr_change_7d', 'active_customers', 'cash', 'burn_30d', 'runway', 'pipeline_value'],
    prompt: 'Draft this month\'s investor update: highlights, lowlights, metrics, asks.',
    use: 'Monthly investor update.', actions: 'investor_send',
  },
};
export const SCHEDULES = { once: 'Once (now)', weekdays: 'Weekdays 8:00', weekly: 'Mondays 8:00' };
export const MODES = {
  ask: 'Ask before every write',
  draft: 'Draft only (never acts)',
  auto: 'Auto (acts without asking)',
};

// Unsupported claims an AI draft can slip into a reply (d12 §4 "hallucinated details": a date, price or
// commitment you never agreed). Shown verbatim so a reader can catch them.
export const UNSUPPORTED_CLAIMS = [
  'We can have that live for you by Friday at no extra cost.',
  'I have extended your plan by three months free as a thank-you.',
  'Our SOC 2 Type II report is attached for your security team.',
  'Annual plans are 40% off if you sign this week.',
  'That integration is already on our roadmap for next month.',
  'We guarantee 99.99% uptime with full refunds for any downtime.',
];

/** Grade project instructions: does it name the reader, the metrics, thresholds, a format, sources and what to do
 *  when unsure? 0..1 plus the missing parts (coaching). Heuristic; its effect is bounded (it only halves error
 *  rates), so the real separation comes from what the player verifies. */
export function gradeInstructions(text = '') {
  const t = String(text).toLowerCase();
  const metricWords = ['mrr', 'churn', 'revenue', 'customers', 'trial', 'cash', 'runway', 'burn', 'pipeline', 'tickets', 'signups', 'activation', 'nrr'];
  const has = {
    reader: /\b(for (me|the founder|investors?|the board|my co-?founder|the team)|reader|audience)\b/.test(t),
    metrics: metricWords.filter((w) => t.includes(w)).length >= 3,
    thresholds: /(\d+\s*%|>\s*\$?\d|<\s*\$?\d|more than \$?\d|less than \$?\d|below \$?\d|above \$?\d|threshold)/.test(t),
    format: /(bullet|table|\d+\s*words|one page|one-page|format|headline|short)/.test(t),
    sources: /(source|cite|link|row count|rows|where each number)/.test(t),
    unsure: /(unknown|unsure|uncertain|do not guess|don't guess|never guess|flag (it|anything)|say so)/.test(t),
  };
  const missing = Object.entries(has).filter(([, v]) => !v).map(([k]) => ({
    reader: 'who reads it', metrics: 'the metrics you want (3+)', thresholds: 'thresholds to flag (e.g. "moved more than 15%")', format: 'the format', sources: 'cite a source for every number', unsure: 'say "unknown" instead of guessing',
  })[k]);
  const words = t.split(/\s+/).filter(Boolean).length;
  const score = Object.values(has).filter(Boolean).length / 6 * (words < 15 ? 0.5 : 1);
  return { score, has, missing, good: score >= 0.67 };
}

/** Pick a template for free text (the assistant asks clarifying questions in real life; here we map intent). */
export function templateForText(text = '') {
  const t = String(text).toLowerCase();
  if (/competitor|rival|pricing page|changelog/.test(t)) return 'competitor_watch';
  if (/receipt|expense|categor|bookkeep/.test(t)) return 'receipts_cleanup';
  if (/investor|update|board/.test(t)) return 'investor_update';
  if (/meeting|prep|brief|call/.test(t)) return 'meeting_prep';
  if (/customer|support|ticket|inbox|email/.test(t)) return 'customer_digest';
  return 'weekly_metrics';
}

/** Which facts a chat question asks for. */
export function factsForQuestion(q = '') {
  const t = String(q).toLowerCase();
  const out = new Set();
  if (/mrr|revenue|arr\b|money coming/.test(t)) { out.add('mrr'); out.add('mrr_change_7d'); }
  if (/customer|subscriber|paying|users?\b/.test(t)) { out.add('active_customers'); out.add('new_customers_7d'); }
  if (/churn|cancel/.test(t)) out.add('churned_30d');
  if (/trial|signup|sign-up/.test(t)) out.add('trials');
  if (/cash|bank|runway|burn|money left/.test(t)) { out.add('cash'); out.add('burn_30d'); out.add('runway'); }
  if (/pipeline|deal|crm|prospect|sales/.test(t)) { out.add('open_deals'); out.add('pipeline_value'); }
  if (/ticket|support|helpdesk/.test(t)) { out.add('open_tickets'); out.add('oldest_ticket'); }
  if (/meeting|calendar|focus|week look/.test(t)) { out.add('meetings_week'); out.add('focus_week'); }
  if (/email|inbox|mail/.test(t)) { out.add('unread_mail'); out.add('customer_threads'); }
  if (/competitor|rival/.test(t)) out.add('rival_price');
  if (/receipt|expense|categor/.test(t)) out.add('uncategorized');
  if (!out.size) { out.add('mrr'); out.add('cash'); out.add('runway'); }
  return [...out];
}
