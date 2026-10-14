# SaaS Founder Simulator

A realistic simulator of starting a SaaS company, built to teach the skills you need to start one for real. Pick **B2C**, **B2B SMB**, or **B2B Enterprise**, then go from idea to $10M ARR before the cash runs out.

![Screenshot](screenshot.png)

## Run it

```sh
npm start        # http://localhost:3000  (set PORT to change)
npm test         # engine, decision and content tests
```

No dependencies. Needs Node 18+.

## What makes it realistic

- **Three business models with different physics.** B2C: cheap prices, high churn, viral loops, app-store fees. SMB: trials plus inside sales, expansion revenue. Enterprise: 3–12 month sales cycles, design partners, SOC 2, and annual contracts.
- **Founder time is the scarcest resource.** Split two founders between building, selling, customer discovery and fundraising.
- **Customer discovery drives product–market fit.** Features built without customer insight mostly miss. PMF (shown as a Sean Ellis "very disappointed" score) drives churn, conversion and word of mouth.
- **Real funnels.** Visitors, signups, trial-to-paid conversion (opt-in trial vs card-required vs freemium) and sales capacity. Paid ads get more expensive as you scale, SEO compounds slowly, and seasonality is modeled.
- **Real money.** Fully-loaded salaries, recruiting fees, hiring ramp-up, sales commissions, payment-processing fees, hosting costs, annual prepay cash flow, failed-payment churn and dunning, grandfathered pricing, and price-increase churn.
- **Real funding.** A pre-seed SAFE, then Seed, Series A and B rounds with traction bars that move with the VC climate. Term sheets come with liquidation-preference tradeoffs, plus revenue-based financing and acquisition offers paid out through a proper waterfall.
- **Unit economics dashboard.** CAC, LTV, LTV:CAC, payback, NRR, logo churn, gross margin, burn multiple, Rule of 40, the P&L and the cap table, all graded against benchmarks for your model.

## How it teaches

- **Decision cards.** Real founder dilemmas: incorporation and vesting, how to launch, custom features for a big prospect, freemium, rewrites, an early VP of Sales, security questionnaires, burnout, competitors, and price pressure. Each choice has consequences and ends with a real-world lesson.
- **Mentor.** Advice that reacts to your metrics, with benchmark reasoning.
- **Real-world playbook.** An 11-stage, 80-step checklist for starting an actual SaaS company, with benchmarks, templates (interview script, cold email) and a unit-economics calculator for your real idea.
- **Claude Code skills** in `.claude/skills/` for working on a real company with Claude:
  - `saas-validate-idea`: stress-tests an idea and produces a validation plan
  - `saas-unit-economics`: models your real numbers against benchmarks
  - `saas-gtm-plan`: a go-to-market plan for your first 100 customers

Benchmarks are typical mid-2020s ranges and vary widely. Legal and financial content is general information, not advice.

## Code

- `public/engine.js`: pure, seeded simulation (no DOM), shared by the UI and the tests
- `public/decisions.js`: scenario cards with outcomes and lessons
- `public/coach.js`: the mentor's rules
- `public/playbook.js`: real-world playbook content
- `public/ui.js`, `index.html`, `style.css`: the interface
- `server.js`: tiny static file server
