// Operator readers (fundraising, investor_relations) and the mistakes this app logs to the shared ledger.
// The Scorecard ships default readers for both functions (outcomes/readers.js: warm share, outreach quality,
// parallel outreach, pitch performance; update quality and cadence). As the owner, this module registers
// readers that keep that read as the base and add what only the fundraising slice knows: runway at the start of
// the raise, market talk from spraying, data-room readiness at the first meeting, competing term sheets at
// signing (blended 50/50 once a raise exists), and for IR quietly changed metric definitions and surprised
// insiders (each costs 0.1 of score).

import { registerOperatorReader, logMistake, tierFromScore, TIER_RANK } from '../../core/operator.js';
import { OPERATOR_TIERS } from '../../data/operator-tiers.js';
import { readFundraising as baseFundraising, readInvestorRelations as baseIr } from '../outcomes/readers.js';
import { fundraisingRead, irRead } from './process.js';

const traps = (id) => OPERATOR_TIERS?.[id]?.traps ?? [];
const merge = (a = [], b = [], n = 6) => [...new Set([...a, ...b])].slice(0, n);

export function readFundraising(state) {
  const base = baseFundraising(state);
  const fr = state.apps.fundraising;
  if (!fr?.raise && !(fr?.raises ?? []).length) return base;
  const mine = fundraisingRead(state, { traps: traps('fundraising') });
  if (mine.tier === 'unknown') return base;
  const score = base.tier === 'unknown' || base.score == null ? mine.score : 0.5 * base.score + 0.5 * mine.score;
  return { ...base, tier: tierFromScore(score), score: +score.toFixed(3), process: mine.parts, evidence: merge(base.evidence, mine.evidence.slice(2), 8), coaching: merge(mine.coaching, base.coaching, 5) };
}

export function readInvestorRelations(state) {
  const base = baseIr(state);
  if (base.tier === 'unknown') return base;
  const mine = irRead(state, { traps: traps('investor_relations') });
  const redefs = mine.parts ? (state.apps.fundraising?.ir?.updates ?? []).filter((u) => u.redefined).length : 0;
  const surprised = Boolean(state.apps.fundraising?.ir?.surprised);
  if (!redefs && !surprised) return { ...base, evidence: merge(base.evidence, mine.evidence?.slice(0, 1) ?? [], 5) };
  const score = Math.max(0, (base.score ?? 0.5) - 0.1 * Math.min(2, redefs) - (surprised ? 0.1 : 0));
  let tier = tierFromScore(score);
  if (TIER_RANK[tier] > TIER_RANK[base.tier]) tier = base.tier;
  return { ...base, tier, score: +score.toFixed(3), evidence: merge(base.evidence, mine.evidence, 7), coaching: merge(mine.coaching, base.coaching, 5) };
}

// The owner's reader wins over the Scorecard default (core/operator.js replaces on register).
registerOperatorReader('fundraising', readFundraising);
registerOperatorReader('investor_relations', readInvestorRelations);

// Every fundraising mistake carries the app, and its uid is kept for the app's own Raise review.
export function frMistake(state, functionId, id, label, cost, detail, extra = {}) {
  const e = logMistake(state, { functionId, id, label, cost, detail, app: 'fundraising', ...extra });
  const fr = state.apps.fundraising;
  if (fr && e) { fr.mistakeIds ??= []; fr.mistakeIds.push(e.uid); if (fr.mistakeIds.length > 100) fr.mistakeIds.shift(); }
  return e;
}
