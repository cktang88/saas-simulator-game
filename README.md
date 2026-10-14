# SaaS Founder Simulator (2026)

A high-fidelity simulator for practicing the actual work of a solo SaaS founder in 2026, indie or venture-backed, for B2C, B2B SMB or enterprise. You use working clones of the real tools (a bank, Stripe, a CRM, a cold-email sequencer, Meta Ads Manager, a product tracker, a cap table, payroll, a legal and compliance hub). You feed them real inputs: your real LinkedIn profile and pitch deck, real prospects you found online, your real website. AI customers, prospects, candidates and investors (Claude Haiku 5.5 and TypeSafe Jev Router via OpenRouter) judge what you do.

## Run it

```sh
OPENROUTER_API_KEY=sk-or-... npm start   # http://localhost:3000
npm test
```

No dependencies, Node 20+. Without a key, the game runs with deterministic offline judges. You can also paste a key in **Settings**; it is stored only in your browser and sent only to your local server. Run the server locally: anyone who can reach a public deployment can spend your OpenRouter credits.

The previous, simpler game is still at `/classic/`.

## What you do

Everything costs **founder hours** from a weekly budget, and time moves in days.

| Function | Tool | What you practice |
|---|---|---|
| Banking | Bank (Mercury-style) | Cash, runway, payments, recurring tool spend, treasury |
| Payments | Payments (Stripe-style) | Pricing and plans, trials, failed payments and dunning, refunds, disputes, payouts, merchant-of-record trade-offs |
| Accounting | Books | Bank-feed review, accrual vs cash P&L, deferred revenue, balance sheet, monthly close, Delaware franchise tax and other deadlines |
| Data | Analytics | MRR movements, cohorts, churn, LTV/CAC/payback by channel, query builder with CSV export |
| Sales | CRM, Outreach, Calls | Real prospect lists (manual or CSV), deliverability (domains, warmup, SPF/DKIM/DMARC), writing sequences, AI SDR trade-offs, live discovery and demo calls with AI prospects, pipeline |
| Marketing | Ads Manager, Organic, Website | Meta, Google, TikTok, Apple Search Ads and LinkedIn campaigns: learning phase, creative fatigue, attribution gaps, seasonality. UGC creators, launch to your network, build in public, SEO/GEO, referrals. Your real landing page judged by AI customers |
| Product | Product, Customer panel, Interviews | Writing specific feature specs (generic ones get blocked), building with AI coding agents, onboarding modes, AI customers trying what you shipped, Mom Test interview practice |
| Capital | Fundraising | Your LinkedIn, bio and deck scored by an investor panel against a 2026 rubric, an investor CRM, live pitch meetings, SAFEs and priced rounds, accelerators, revenue-based financing, cap table, exits |
| People | People | Employees, contractors or AI agents; hiring and interviews; payroll; equity; support load |
| Legal | Legal | Entity, 83(b) deadline, IP assignment, ToS/privacy, DPAs, EU AI Act, SOC 2, trademarks, contract redlines, compliance calendar |

## Grounded in research

`docs/research/` has sourced 2025–2026 notes for every function: what has changed since the 2016 playbooks, and the numbers the simulation uses (tagged when they are design assumptions rather than measured data). Shared parameters live in `public/core/params.js`.

## Claude Code skills for your real company

`.claude/skills/` has skills for doing each function for real with Claude: `founder-outbound-sales`, `founder-customer-research`, `founder-paid-ads`, `founder-organic-growth`, `founder-fundraising`, `founder-exit-and-capital`, `founder-finance-accounting`, `founder-saas-analytics`, `founder-hiring-and-ai-team`, `founder-legal-compliance`, `founder-product-specs`, plus `saas-validate-idea`, `saas-unit-economics` and `saas-gtm-plan`.

## Architecture

See `docs/ARCHITECTURE.md`.
