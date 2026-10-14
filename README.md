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
| Your day | Mail, Messages, Calendar | Email and iMessage inbound driven by what your company actually is and does (time-wasters, intros that go somewhere or nowhere, investors, candidates); asking for intros; planning your week and booking meetings |
| You | You, Financing | Energy, burnout, life events; personal runway, your day job, personal loans and lenders priced on your credit and net worth, bootstrapping vs raising |
| Customers | Success, Helpdesk, Insights | Support tickets and CSAT, onboarding, renewals and expansion, security reviews, PMF surveys and churn reasons |
| Go-to-market | Channels, Pricing, Market | Referrals, affiliates, partnerships, marketplaces and integrations, resellers; price tests and packaging; real competitors found by web search when you set your idea, and how buyers and investors react to them |
| Outcomes | Scorecard | The habits of top-1% founders, the warning signs before the common ways startups die, and luck. Lucky breaks (a viral post, the HN front page, a whale inbound, acquisition interest, an AI capability shift) arrive at researched base rates multiplied by your surface area: how much you ship, post, launch, sell and talk to customers |

Outcomes are calibrated to real distributions, not to make you win: most products earn little or nothing, about 1 in 6 subscription apps reaches $1k MRR, and roughly 70% of venture-backed failures run out of money. Elite play lifts your odds a lot but guarantees nothing. See `docs/research/outcomes-success-failure.md` and `public/data/outcomes.js`.

## Grounded in research

`docs/research/` has sourced 2025–2026 notes for every function: what has changed since the 2016 playbooks, and the numbers the simulation uses (tagged when they are design assumptions rather than measured data). Shared parameters live in `public/core/params.js`.

## Claude Code skills for your real company

`.claude/skills/` has skills for doing each function for real with Claude: `founder-outbound-sales`, `founder-customer-research`, `founder-paid-ads`, `founder-organic-growth`, `founder-fundraising`, `founder-exit-and-capital`, `founder-finance-accounting`, `founder-saas-analytics`, `founder-hiring-and-ai-team`, `founder-legal-compliance`, `founder-product-specs`, plus `saas-validate-idea`, `saas-unit-economics` and `saas-gtm-plan`.

## Architecture

See `docs/ARCHITECTURE.md`.
