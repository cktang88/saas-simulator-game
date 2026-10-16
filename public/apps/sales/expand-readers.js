// Operator reader for account_expansion (data/operator-tiers.js): reads the lands the player chose against the size
// of what was sold, discount on lands, account maps, multi-threading and QBR cadence, and the NRR achieved against
// the band. Behaviour carries 70% of the score; NRR 30%. Unknown until three accounts are 100+ days old.

import { registerOperatorReader, tierFromScore, unknownRead, trapCoaching } from '../../core/operator.js';
import { NRR_BANDS, EXPAND } from '../../data/gtm-comp.js';
import { clamp, round2 } from '../../core/util.js';
import { ensureSuccess, subById, acvOf } from '../success/engine.js';
import { landFit } from './expand-model.js';
import { retentionByBand } from './expand.js';

const MEDIAN_NRR = { smb: 0.96, mid: 1.03, ent: 1.12 }; // medians of the NRR bands [design]

export function expansionRead(state) {
  if (state.company.model === 'b2c' || !state.apps.success) return unknownRead();
  const cs = ensureSuccess(state);
  const accts = Object.values(cs.accounts).filter((a) => state.day - a.createdDay >= 100 && a.map);
  if (accts.length < 3) return unknownRead(['Land with a strategy that fits the segment, map the account and meet a second stakeholder in the first quarter. Reads once three accounts are 100 days old.']);
  const liveAcc = accts.filter((a) => !a.closed);
  const acvOfA = (a) => { const s = subById(state, a.subId); return s ? acvOf(s) : a.land?.landAcv ?? 0; };
  // 1. land fit (explicit choices only count above an unspecified land)
  const fit = accts.reduce((x, a) => x + (a.land?.strategy && a.land.strategy !== 'unspecified' ? landFit(a.land.strategy, a.land.landAcv ?? acvOfA(a)) : 0.4), 0) / accts.length;
  // 2. discount on the land
  const disc = accts.reduce((x, a) => x + (a.land?.discountPct ?? 0), 0) / accts.length;
  const discScore = disc <= 0.1 ? 1 : disc <= 0.15 ? 0.75 : disc <= 0.25 ? 0.4 : 0.1;
  // 3. map, 4. second thread, 5. QBR cadence
  const mapped = liveAcc.length ? liveAcc.filter((a) => a.map.mapped).length / liveAcc.length : 0;
  const threaded = liveAcc.length ? liveAcc.filter((a) => Math.max(a.map.threads ?? 1, a.threads ?? 1) >= 2 || a.map.execSponsor).length / liveAcc.length : 0;
  const big = liveAcc.filter((a) => acvOfA(a) >= 10000);
  const qbr = big.length ? big.filter((a) => a.lastQbrDay != null && state.day - a.lastQbrDay <= EXPAND.qbrDays + 20).length / big.length : (liveAcc.length ? 0.5 : 0);
  // 6. NRR against the band median
  const rb = retentionByBand(state, 365);
  let nrrScore = null, nrrText = null;
  const windowOk = state.day >= 120;
  if (windowOk) {
    let w = 0, s = 0;
    for (const [b, r] of Object.entries(rb)) { if (r.n < 2) continue; s += clamp(0.5 + (r.nrr - MEDIAN_NRR[b]) / 0.2, 0, 1) * r.n; w += r.n; }
    if (w) { nrrScore = s / w; nrrText = Object.entries(rb).filter(([, r]) => r.n >= 2).map(([b, r]) => `${b} NRR ${Math.round(r.nrr * 100)}% / GRR ${Math.round(r.grr * 100)}% (band ${Math.round(NRR_BANDS[b].nrr[0] * 100)}-${Math.round(NRR_BANDS[b].nrr[1] * 100)}%)`).join('; '); }
  }
  const mistakes = (state.mistakes ?? []).filter((m) => m.functionId === 'account_expansion' && state.day - m.day <= 365).length;
  const behaviour = 0.24 * fit + 0.16 * discScore + 0.16 * mapped + 0.2 * threaded + 0.24 * qbr;
  const score = clamp((nrrScore == null ? behaviour : 0.7 * behaviour + 0.3 * nrrScore) - 0.03 * Math.min(6, mistakes), 0, 1);
  const gaps = [];
  if (fit < 0.6) gaps.push('land_too_small');
  if (disc > 0.15) gaps.push('over_discounted_land');
  if (threaded < 0.5) gaps.push('single_threaded');
  if ((state.mistakes ?? []).some((m) => m.functionId === 'account_expansion' && m.id === 'upsell_before_value')) gaps.push('upsell_before_value');
  if ((state.mistakes ?? []).some((m) => m.functionId === 'account_expansion' && m.id === 'no_account_owner')) gaps.push('no_owner');
  if ((state.mistakes ?? []).some((m) => m.functionId === 'account_expansion' && m.id === 'oversized_land_shelfware')) gaps.push('oversized_land');
  const evidence = [
    `${accts.length} accounts 100+ days old: land fit ${Math.round(fit * 100)}%, average land discount ${Math.round(disc * 100)}%, ${Math.round(mapped * 100)}% mapped, ${Math.round(threaded * 100)}% multi-threaded, ${Math.round(qbr * 100)}% of $10k+ accounts with a QBR in ~4 months.`,
    nrrText,
    mistakes ? `${mistakes} traceable expansion mistake(s) in the last year.` : null,
  ];
  const coaching = gaps.map((id) => trapCoaching('account_expansion', id)).filter(Boolean);
  if (qbr < 0.5) coaching.push('Hold a QBR with usage data every quarter on accounts above $10k ACV: it is where expansion and the executive sponsor come from.');
  if (score < 0.8) coaching.push('A stellar operator lands near list for the segment, maps each account, meets a second stakeholder in the first quarter and expands where usage already hit the limit.');
  return { tier: tierFromScore(score, { cuts: { stellar: 0.8, good: 0.62, average: 0.42 } }), score: round2(score), n: accts.length, evidence: evidence.filter(Boolean), coaching: [...new Set(coaching)], raw: { fit, disc, mapped, threaded, qbr, nrrScore } };
}

registerOperatorReader('account_expansion', expansionRead);
