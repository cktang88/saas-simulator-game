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
  { id: 'pylon', vendor: 'Pylon', plan: 'Professional (1 seat; annual, 3-seat minimum)', amount: 89, category: 'software', group: 'Support', source: 'usepylon.com/pricing 2026-10 (verified; AI credits extra, seat minimum unverified). Helpdesk Platform tab bills the rest' },
  { id: 'plain', vendor: 'Plain', plan: 'Entry (1 seat)', amount: 35, category: 'software', group: 'Support', source: 'third-party comparison pages 2026 (d09; unverified at source)' },
  { id: 'zendesk', vendor: 'Zendesk', plan: 'Suite Professional (1 agent, annual)', amount: 115, category: 'software', group: 'Support', source: 'third-party Jul 2026 (research 2026q4 §1.4); verified resolutions billed extra' },
  // Legal & compliance
  { id: 'termly', vendor: 'Termly', plan: 'Pro+ (policies + cookie consent)', amount: 20, category: 'legal', group: 'Legal & compliance', source: 'termly.io/pricing (vendor list price)' },
  { id: 'reg_agent', vendor: 'Registered agent (Delaware)', plan: '$125/yr, amortized', amount: 10.42, category: 'legal', group: 'Legal & compliance', source: 'research §4.2: $50–$300/yr (designer estimate)' },
  { id: 'vanta', vendor: 'Vanta', plan: 'SOC 2 automation (~$10k/yr, quote-based)', amount: 833, category: 'software', group: 'Legal & compliance', source: 'quote-based; ~$10k/yr typical for startups (designer estimate)' },
  // Finance
  { id: 'mercury_plus', vendor: 'Mercury', plan: 'Plus', amount: 35, category: 'software', group: 'Finance', source: 'research §2.1: Mercury Plus about $35/month' },
  { id: 'stripe_tax_complete', vendor: 'Stripe Tax Complete', plan: 'Registration + filing', amount: 90, category: 'accounting', group: 'Finance', source: 'stripe.com/pricing, 2026-10-14 (research §1.1)' },
  { id: 'qbo', vendor: 'QuickBooks Online', plan: 'Simple Start', amount: 38, category: 'accounting', group: 'Finance', source: 'quickbooks.intuit.com/pricing (vendor list price)' },
  // Personal / other
  { id: 'health', vendor: 'Health insurance (marketplace plan)', plan: 'Founder, individual (moves out of your personal living costs)', amount: 600, category: 'other', group: 'Other', personalOffset: true, source: 'research §2.3: $400–$900 (designer estimate)' },
];

// Bookkeeping after the Bench shutdown (Dec 27, 2024). Research §3.5 / §7.
// errorRate: share of auto-categorizations that are wrong [design, calibrated to "~10% need fixing" for DIY AI tools].
// reviewMin: founder minutes per transaction reviewed. closeFactor: share of month-end close hours the founder still does.
export const BOOKKEEPING = {
  diy: { label: 'DIY (Kick free tier + bank rules)', vendor: null, price: 0, errorRate: 0.1, reviewMin: 1.5, closeFactor: 1, autoReview: false, note: 'Kick is free until about $15K/yr of business expenses (research §3.5). You review every transaction and do the close yourself.' },
  ai: { label: 'AI bookkeeping tool (Digits)', vendor: 'Digits', price: 79, errorRate: 0.07, reviewMin: 0.75, closeFactor: 0.6, autoReview: false, note: 'Autonomous general ledger, ~$65–$99/mo per third-party listings (research §3.5). Better guesses, faster review; you still confirm and close.' },
  aihuman: { label: 'AI bookkeeper + human review', vendor: 'AI bookkeeper (human-reviewed)', price: 199, errorRate: 0.025, reviewMin: 0.5, closeFactor: 0.3, autoReview: true, note: 'Research range $100–$300/mo. A human checks the AI\'s categories within ~3 days; you answer questions and approve the close.' },
  full: { label: 'Full-service startup bookkeeping (Pilot-style)', vendor: 'Pilot', price: 599, errorRate: 0.01, reviewMin: 0.5, closeFactor: 0.12, autoReview: true, note: 'Research: $400–$900/mo (Pilot Core commonly $499–$849). Accrual books and a monthly close done for you; year-end tax return still extra.' },
};

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
