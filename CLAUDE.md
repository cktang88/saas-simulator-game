# SaaS Founder Simulator: project rules

Read docs/ARCHITECTURE.md first (app contract, shared state slices, principles).

Non-negotiable design rules (apply to every change, by every agent):
- **Operator quality must show in every function** (ARCHITECTURE.md principle 7). Each business function and system must clearly separate stellar / good / average / mediocre operators through what the player actually does, never through difficulty settings, volume or keyword stuffing. Calibrate the outcome gaps to real top-quartile vs median spreads, give feedback on what a stellar operator would have done, and add a test that the tiers separate.
- Realistic, sourced numbers (docs/research/); mark design assumptions [design] and never present them as real statistics.
- Every action costs realistic founder hours. Everything works offline with deterministic fallbacks.
- Determinism: use rng(state) and uid() from core/util.js. Never use Date.now() or Math.random() in simulation code.
- Web research: use cheap subagents (Haiku/Sonnet), many in parallel, with shared briefs.
- Run `npm test` before reporting; commit and push after changes. No model identifiers in repo files.
