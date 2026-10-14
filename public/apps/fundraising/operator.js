// Operator readers (fundraising, investor_relations) and the mistakes this app logs to the shared ledger.
// Registered once at import; core/operator.js keeps the registry.

import { registerOperatorReader, hasOperatorReader, logMistake } from '../../core/operator.js';
import { OPERATOR_TIERS } from '../../data/operator-tiers.js';
import { fundraisingRead, irRead } from './process.js';

const traps = (id) => OPERATOR_TIERS?.[id]?.traps ?? [];

export const readFundraising = (state) => fundraisingRead(state, { traps: traps('fundraising') });
export const readInvestorRelations = (state) => irRead(state, { traps: traps('investor_relations') });

if (!hasOperatorReader('fundraising')) registerOperatorReader('fundraising', readFundraising);
if (!hasOperatorReader('investor_relations')) registerOperatorReader('investor_relations', readInvestorRelations);

// Thin wrapper so every fundraising mistake carries the app and also shows in the app's own "Raise review".
export function frMistake(state, functionId, id, label, cost, detail, extra = {}) {
  const e = logMistake(state, { functionId, id, label, cost, detail, app: 'fundraising', ...extra });
  const fr = state.apps.fundraising;
  if (fr && e) { fr.mistakeIds ??= []; fr.mistakeIds.push(e.uid); if (fr.mistakeIds.length > 100) fr.mistakeIds.shift(); }
  return e;
}
