# SaaS Founder Simulator: project rules

Read docs/ARCHITECTURE.md first (app contract, shared state slices, principles).

Non-negotiable design rules (apply to every change, by every agent):
- **Operator quality must show in every function** (ARCHITECTURE.md principle 7). Each business function and system must clearly separate stellar / good / average / mediocre operators through what the player actually does, never through difficulty settings, volume or keyword stuffing. Calibrate the outcome gaps to real top-quartile vs median spreads, give feedback on what a stellar operator would have done, and add a test that the tiers separate.
- **Asymmetry:** doing everything right improves your odds but doesn't guarantee a big outcome. Doing things wrong must ALWAYS have realistic consequences: wasted time and money, slower progress, going in circles, burned lists or reputation, churn, legal or tax bills, burnout. Some are immediate and many compound later. No mistake is free, and its cost should be traceable afterwards.
- Realistic, sourced numbers (docs/research/); mark design assumptions [design] and never present them as real statistics.
- Every action costs realistic founder hours. Everything works offline with deterministic fallbacks.
- Determinism: use rng(state) and uid() from core/util.js. Never use Date.now() or Math.random() in simulation code.
- Web research: use cheap subagents (Haiku/Sonnet), many in parallel, with shared briefs.
- Code search (user rule): delegate to many parallel subagents (Explore or general-purpose), one per area, instead of grepping and reading files yourself; keep your own context for decisions and edits.
- Run `npm test` before reporting; commit and push after changes. No model identifiers in repo files.
- **Iteration velocity over exhaustive calibration (user rule):** NEVER run long calibration grids or multi-hour simulations. Test a mechanic with short, targeted sims: one function or system, a few seeds, the shortest horizon that shows the effect (seconds to a couple of minutes), usually as a unit or scenario test. Full multi-year bot grids are banned unless the user explicitly asks for one.
