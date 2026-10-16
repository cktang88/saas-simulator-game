// Real 2026 tools a solo SaaS founder pays for, at monthly list prices (billed monthly, per seat where noted).
// Sources: docs/research/finance-and-payments.md §2.3 (Cursor, Claude, Workspace, hosting, bookkeeping) and the
// vendors' public pricing pages as of 2025–2026 (marked "vendor list price"; prices change, verify live pages).

export const TOOL_CATALOG = [
  // AI coding & assistants (R&D tools → software)
  { id: 'cursor_pro', vendor: 'Cursor', plan: 'Pro', amount: 20, category: 'software', group: 'AI coding', source: 'Cursor plans, 2026 third-party summaries (research §2.3)' },
  { id: 'cursor_pplus', vendor: 'Cursor', plan: 'Pro+', amount: 60, category: 'software', group: 'AI coding', source: 'Cursor plans, 2026 (research §2.3)' },
  { id: 'cursor_ultra', vendor: 'Cursor', plan: 'Ultra', amount: 200, category: 'software', group: 'AI coding', source: 'Cursor plans, 2026 (research §2.3)' },
  { id: 'claude_pro', vendor: 'Claude Pro', plan: 'Pro (monthly)', amount: 20, category: 'software', group: 'AI coding', source: 'claude.com/pricing, 2026-10 (research §2.3)' },
  { id: 'claude_max5', vendor: 'Claude Max', plan: 'Max 5x', amount: 100, category: 'software', group: 'AI coding', source: 'claude.com/pricing, 2026-10 (research §2.3)' },
  { id: 'claude_max20', vendor: 'Claude Max', plan: 'Max 20x', amount: 200, category: 'software', group: 'AI coding', source: 'claude.com/pricing, 2026-10' },
  { id: 'copilot_pro', vendor: 'GitHub Copilot', plan: 'Pro', amount: 10, category: 'software', group: 'AI coding', source: 'github.com/features/copilot/plans (vendor list price)' },
  { id: 'copilot_pplus', vendor: 'GitHub Copilot', plan: 'Pro+', amount: 39, category: 'software', group: 'AI coding', source: 'github.com/features/copilot/plans (vendor list price)' },
  { id: 'chatgpt_plus', vendor: 'OpenAI ChatGPT', plan: 'Plus', amount: 20, category: 'software', group: 'AI coding', source: 'openai.com/chatgpt/pricing (vendor list price)' },
  // Workspace & productivity
  { id: 'gws_starter', vendor: 'Google Workspace', plan: 'Business Starter (1 user, flexible)', amount: 8.4, category: 'software', group: 'Workspace', source: 'Workspace list price (research §2.3: $7–8.40)' },
  { id: 'gws_standard', vendor: 'Google Workspace', plan: 'Business Standard (1 user, flexible)', amount: 16.8, category: 'software', group: 'Workspace', source: 'Workspace list price (research §2.3: $14–17)' },
  { id: 'notion_plus', vendor: 'Notion', plan: 'Plus (1 seat)', amount: 12, category: 'software', group: 'Workspace', source: 'notion.com/pricing (vendor list price)' },
  { id: 'linear_basic', vendor: 'Linear', plan: 'Basic (1 seat)', amount: 10, category: 'software', group: 'Workspace', source: 'linear.app/pricing (vendor list price)' },
  { id: 'slack_pro', vendor: 'Slack', plan: 'Pro (1 seat, monthly)', amount: 8.75, category: 'software', group: 'Workspace', source: 'slack.com/pricing (vendor list price)' },
  { id: 'figma_pro', vendor: 'Figma', plan: 'Professional full seat (monthly)', amount: 20, category: 'software', group: 'Workspace', source: 'figma.com/pricing (vendor list price)' },
  { id: 'calendly', vendor: 'Calendly', plan: 'Standard (monthly)', amount: 12, category: 'software', group: 'Workspace', source: 'calendly.com/pricing (vendor list price)' },
  { id: 'zapier', vendor: 'Zapier', plan: 'Professional (monthly)', amount: 29.99, category: 'software', group: 'Workspace', source: 'zapier.com/pricing (vendor list price)' },
  { id: 'canva', vendor: 'Canva', plan: 'Pro (monthly)', amount: 15, category: 'software', group: 'Workspace', source: 'canva.com/pricing (vendor list price)' },
  // Hosting & infrastructure (production → COGS)
  { id: 'vercel_pro', vendor: 'Vercel', plan: 'Pro (1 seat)', amount: 20, category: 'hosting', group: 'Hosting', source: 'vercel.com/pricing (research §2.3: $20–25 tiers)' },
  { id: 'supabase_pro', vendor: 'Supabase', plan: 'Pro', amount: 25, category: 'hosting', group: 'Hosting', source: 'supabase.com/pricing (research §2.3)' },
  { id: 'railway_pro', vendor: 'Railway', plan: 'Pro (min. usage)', amount: 20, category: 'hosting', group: 'Hosting', source: 'railway.com/pricing (vendor list price)' },
  { id: 'cf_workers', vendor: 'Cloudflare', plan: 'Workers Paid', amount: 5, category: 'hosting', group: 'Hosting', source: 'cloudflare.com/plans (vendor list price)' },
  { id: 'sentry', vendor: 'Sentry', plan: 'Team', amount: 26, category: 'software', group: 'Hosting', source: 'sentry.io/pricing (vendor list price)' },
  // Analytics
  { id: 'plausible', vendor: 'Plausible Analytics', plan: 'Starter (10k pageviews)', amount: 9, category: 'software', group: 'Analytics', source: 'plausible.io (vendor list price)' },
  { id: 'fathom', vendor: 'Fathom Analytics', plan: 'Starter', amount: 15, category: 'software', group: 'Analytics', source: 'usefathom.com (vendor list price)' },
  { id: 'stripe_sigma', vendor: 'Stripe Sigma', plan: 'SQL on Stripe data', amount: 15, category: 'software', group: 'Analytics', source: 'stripe.com/pricing, 2026-10-14 (research §1.1)' },
  { id: 'stripe_revrec', vendor: 'Stripe Revenue Recognition', plan: 'Monthly plan', amount: 25, category: 'accounting', group: 'Finance', source: 'stripe.com/pricing, 2026-10-14 (research §1.1)' },
  // CRM & sales
  { id: 'hubspot', vendor: 'HubSpot', plan: 'Starter Customer Platform (1 seat, monthly)', amount: 20, category: 'software', group: 'CRM & sales', source: 'hubspot.com/pricing (vendor list price)' },
  { id: 'attio', vendor: 'Attio', plan: 'Plus (1 seat, monthly)', amount: 36, category: 'software', group: 'CRM & sales', source: 'attio.com/pricing (vendor list price)' },
  { id: 'apollo', vendor: 'Apollo.io', plan: 'Basic (1 seat, monthly)', amount: 59, category: 'marketing', group: 'CRM & sales', source: 'apollo.io/pricing (vendor list price)' },
  { id: 'instantly', vendor: 'Instantly', plan: 'Growth (outbound)', amount: 37, category: 'marketing', group: 'CRM & sales', source: 'instantly.ai/pricing (vendor list price)' },
  // Email sending
  { id: 'resend', vendor: 'Resend', plan: 'Pro (50k emails)', amount: 20, category: 'hosting', group: 'Email', source: 'resend.com/pricing (vendor list price)' },
  { id: 'postmark', vendor: 'Postmark', plan: 'Basic (10k emails)', amount: 15, category: 'hosting', group: 'Email', source: 'postmarkapp.com/pricing (vendor list price)' },
  { id: 'loops', vendor: 'Loops', plan: 'Starter (lifecycle email)', amount: 49, category: 'marketing', group: 'Email', source: 'loops.so/pricing (vendor list price)' },
  // Support
  { id: 'intercom', vendor: 'Intercom', plan: 'Essential (1 seat, monthly)', amount: 39, category: 'software', group: 'Support', source: 'intercom.com/pricing (vendor list price, plus per-resolution AI fees)' },
  // Legal & compliance
  { id: 'termly', vendor: 'Termly', plan: 'Pro+ (policies + cookie consent)', amount: 20, category: 'legal', group: 'Legal & compliance', source: 'termly.io/pricing (vendor list price)' },
  { id: 'reg_agent', vendor: 'Registered agent (Delaware)', plan: '$125/yr, amortized', amount: 10.42, category: 'legal', group: 'Legal & compliance', source: 'research §4.2: $50–$300/yr (designer estimate)' },
  { id: 'vanta', vendor: 'Vanta', plan: 'SOC 2 automation (~$10k/yr, quote-based)', amount: 833, category: 'software', group: 'Legal & compliance', source: 'quote-based; ~$10k/yr typical for startups (designer estimate)' },
  // Finance
  { id: 'mercury_plus', vendor: 'Mercury', plan: 'Plus', amount: 29.9, category: 'software', group: 'Finance', source: 'deep/d11: Mercury Plus $29.90/month (BOF §2)' },
  { id: 'stripe_tax_complete', vendor: 'Stripe Tax Complete', plan: 'Registration + filing', amount: 90, category: 'accounting', group: 'Finance', source: 'stripe.com/pricing, 2026-10-14 (research §1.1)' },
  { id: 'qbo', vendor: 'QuickBooks Online', plan: 'Simple Start', amount: 38, category: 'accounting', group: 'Finance', source: 'Simple Start ~$38 after the Aug 1, 2026 increase [third-party, conflicting] (BOF §3)' },
  // Personal / other
  { id: 'health', vendor: 'Health insurance (marketplace plan)', plan: 'Founder, individual (moves out of your personal living costs)', amount: 600, category: 'other', group: 'Other', personalOffset: true, source: 'research §2.3: $400–$900 (designer estimate)' },
];

// Bookkeeping and accounting ledgers, Q4 2026 (docs/research/tools/2026q4/back-office-finance.md §3, "BOF").
// errorRate: share of auto-categorizations that are wrong; reviewMin: founder minutes per transaction reviewed;
// closeFactor: share of the DIY month-end close hours the founder still does [design, calibrated to "~10% need fixing"
// for DIY tools and "solo QBO close ~4-8 h, Pilot ~0.5-1 h" (BOF §3 [design])].
// Paradigm fields: ledger = the general ledger the books live in (switching ledger family means a history migration);
// accrual = the ledger keeps accrual books (deferred revenue, ASC 606) that investors and acquirers expect;
// metrics = investor-ready startup metrics (ARR, burn, runway) without a spreadsheet; requiresQbo = the service works
// inside a QuickBooks file billed separately (Pilot). bookkeepingPrice() handles tiered prices.
export const BOOKKEEPING = {
  diy: { label: 'Spreadsheet + bank feed (DIY)', vendor: null, price: 0, errorRate: 0.1, reviewMin: 1.5, closeFactor: 1, autoReview: false, ledger: 'sheet', accrual: false, metrics: false, paradigm: 'gl', note: 'You categorize every transaction and do the close yourself. Cash basis only: deferred revenue lives in your head.' },
  kick: { label: 'Kick (AI + accountant review)', vendor: 'Kick', price: 40, freeTxnsPerYear: 250, errorRate: 0.04, reviewMin: 0.5, closeFactor: 0.5, autoReview: true, ledger: 'kick', accrual: false, metrics: false, paradigm: 'ai', note: 'Bench\'s recommended successor: AI categorizes on arrival, an accountant reviews exceptions. Free to 250 transactions a year, then ~$40/mo [third-party]. Cash-basis small-business books [design].' },
  qbo: { label: 'QuickBooks Online (you run it)', vendor: 'QuickBooks Online', price: 38, errorRate: 0.08, reviewMin: 1.2, closeFactor: 1, autoReview: false, ledger: 'qbo', accrual: true, metrics: false, paradigm: 'gl', note: 'The traditional GL accountants and investors expect. Bank feeds and auto-categorization; you (or a freelancer) review, reconcile and post accruals. Simple Start ~$38/mo after the Aug 1, 2026 increase [third-party, conflicting].' },
  xero: { label: 'Xero Standard (you run it)', vendor: 'Xero', price: 59, errorRate: 0.08, reviewMin: 1.2, closeFactor: 1, autoReview: false, ledger: 'xero', accrual: true, metrics: false, cpaMult: 1.1, paradigm: 'gl', note: 'Simpler GL with unlimited users; $27 / $59 / $97 from Oct 1, 2026 [third-party]. Weaker US accountant base, so year-end CPA work runs a little higher [design].' },
  puzzle: { label: 'Puzzle (AI-native GL + startup metrics)', vendor: 'Puzzle', price: 50, errorRate: 0.06, reviewMin: 0.6, closeFactor: 0.5, autoReview: false, ledger: 'puzzle', accrual: true, metrics: true, paradigm: 'ai', note: 'AI-native ledger built for startups: cash and accrual side by side, Stripe revenue booked automatically, ARR, burn and runway out of the box. Puzzle 2.0 adds services (Sep 2026). $25-300+/mo, sources conflict [third-party].' },
  ai: { label: 'Digits (autonomous GL)', vendor: 'Digits', price: 79, errorRate: 0.07, reviewMin: 0.75, closeFactor: 0.6, autoReview: false, ledger: 'digits', accrual: true, metrics: true, paradigm: 'ai', note: '"Autonomous general ledger" with an MCP server (Apr 2026). ~$65-250+/mo, conflicting [third-party]. Errors compound silently unless you review the exceptions.' },
  pilot_ai: { label: 'Pilot Essentials (AI tier)', vendor: 'Pilot', price: 99, requiresQbo: true, errorRate: 0.05, reviewMin: 0.6, closeFactor: 0.45, autoReview: false, ledger: 'qbo', accrual: true, metrics: true, paradigm: 'ai', note: 'Pilot\'s AI-only tier from ~$99/mo; no human bookkeeper. Works in a QuickBooks file billed separately [third-party].' },
  full: { label: 'Pilot Core (human bookkeeping)', vendor: 'Pilot', price: 499, priceBands: [[15000, 349], [50000, 499], [100000, 649], [Infinity, 849]], requiresQbo: true, errorRate: 0.01, reviewMin: 0.5, closeFactor: 0.12, autoReview: true, ledger: 'qbo', accrual: true, metrics: true, paradigm: 'service', note: 'People plus software: you answer a few questions, they close accrual books monthly. $349-849/mo by trailing 3-month expenses (~$499 at seed) [third-party; band edges design]; QuickBooks billed separately; tax is extra.' },
  fondo: { label: 'Fondo (startup bookkeeping + tax)', vendor: 'Fondo', price: 299, priceBands: [[30000, 299], [Infinity, 599]], errorRate: 0.015, reviewMin: 0.5, closeFactor: 0.15, autoReview: true, ledger: 'qbo', accrual: true, metrics: true, paradigm: 'service', note: 'YC startup-specialist bookkeeping, tax and R&D credits; ~$299-599/mo [third-party, conflicting]. Quality depends on the assigned bookkeeper.' },
  aihuman: { label: 'AI bookkeeper + human review (legacy plan)', vendor: 'AI bookkeeper (human-reviewed)', price: 199, errorRate: 0.025, reviewMin: 0.5, closeFactor: 0.3, autoReview: true, ledger: 'qbo', accrual: true, metrics: false, paradigm: 'ai', legacy: true, note: 'Older generic plan kept for saved games. Research range $100-300/mo.' },
  bench: { label: 'Bench', vendor: 'Bench', price: 0, dead: true, errorRate: 0.02, reviewMin: 0.5, closeFactor: 0.2, autoReview: true, ledger: 'bench', accrual: false, metrics: false, paradigm: 'service', note: 'DEAD: shut down overnight on Dec 27, 2024 (proprietary ledger; customers lost access to their books and tax documents), then sold to Employer.com.' },
};
// Monthly price of a bookkeeping option given trailing 3-month average monthly expenses and transactions per year.
export function bookkeepingPrice(key, { monthlyExpenses = 0, txnsPerYear = 0 } = {}) {
  const v = BOOKKEEPING[key];
  if (!v || v.dead) return 0;
  let p = v.price;
  if (v.priceBands) p = v.priceBands.find(([lim]) => monthlyExpenses < lim)[1];
  if (v.freeTxnsPerYear && txnsPerYear < v.freeTxnsPerYear) p = 0;
  return p + (v.requiresQbo ? BOOKKEEPING.qbo.price : 0);
}
// Moving books between ledgers (BOF §3: QBO->Xero needs a history conversion; Pilot requires QBO; leaving an AI GL
// means a cleanup). [design] founder hours per month of history and the cleanup fee per wrong category.
export const BOOKS_MIGRATION = { onboardingHours: 2, perMonthHours: 0.5, maxMonths: 18, conversionFee: 300, cleanupPerError: 15, circleWindowDays: 180 };

// Mercury Treasury: requires $250K across accounts; net yield 3.01–3.81% by tier (Rho comparison citing
// mercury.com, 2026-08-02). The split of the range into tiers below is a game interpolation [design].
export const TREASURY = {
  minimum: 250000,
  tiers: [
    { from: 0, apy: 0.0301 },
    { from: 1000000, apy: 0.0341 },
    { from: 5000000, apy: 0.0381 },
  ],
  defaultOperatingTarget: 50000,
};
export const treasuryApy = (balance) => TREASURY.tiers.filter((t) => balance >= t.from).at(-1).apy;
