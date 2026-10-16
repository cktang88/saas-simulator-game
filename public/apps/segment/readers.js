// Operator reader for "Selling to your customer type" (data/operator-tiers.js customer_fit). The read comes from what
// the player did for the customer type they chose: where acquisition came from, onboarding mode, support speed against
// the type's tolerance, table stakes shipped, plan shape and price level, and how ready an upmarket move was.
// Unknown until there is evidence on at least two of these.

import { registerOperatorReader, tierFromScore, unknownRead } from '../../core/operator.js';
import { ensureMarket, hasProduct, mainPlan, cfg } from '../../core/market.js';
import { profileOf, customerTypeOf } from '../../core/customer-type.js';
import { CHANNELS, UPMARKET } from '../../data/customer-types.js';
import { tableStakes, FUNCTION_ID } from './engine.js';
import { clamp, round2 } from '../../core/util.js';

export function readCustomerFit(state) {
  const p = profileOf(state);
  if (!p || customerTypeOf(state) === 'consumers') return unknownRead('Pick who you sell to in Who you sell to.');
  const S = state.apps.segment ?? {};
  const parts = [], evidence = [], coaching = [];
  const add = (id, score, ev, tip) => { parts.push({ id, score: clamp(score, 0, 1) }); if (ev) evidence.push(ev); if (score < 0.6 && tip) coaching.push(tip); };

  // 1. Channel mix: signup-weighted fit of the channels you actually used.
  const acq = Object.entries(S.acq ?? {}).filter(([c]) => c !== 'other');
  const n = acq.reduce((a, [, x]) => a + x.n, 0);
  if (n >= 10) {
    const fit = acq.reduce((a, [c, x]) => a + (p.channels[c] ?? 1) * x.n, 0) / n;
    const worst = acq.filter(([c]) => (p.channels[c] ?? 1) < 0.6).map(([c]) => CHANNELS[c] ?? c);
    add('channels', (fit - 0.3) / 1.2, `Channel fit for ${p.short.toLowerCase()}: ${round2(fit)}x on ${n} signups`, worst.length ? `${worst.join(', ')} barely reach ${p.label.toLowerCase()}. ${p.playbook[0] ?? ''}` : null);
  }
  // 2. Onboarding mode.
  if (hasProduct(state)) {
    const ob = ensureMarket(state).onboarding ?? 'self';
    const r = (p.onboarding[ob] ?? 1) / Math.max(0.01, p.onboarding[p.onboarding.best] ?? 1);
    add('onboarding', (r - 0.4) / 0.6, `Onboarding "${ob}" (best for ${p.short.toLowerCase()}: "${p.onboarding.best}")`, `${p.label} activate best with "${p.onboarding.best}" onboarding.`);
    // 3. Table stakes.
    const st = tableStakes(state);
    if (st.length) {
      const share = st.filter((t) => t.shipped).length / st.length;
      add('stakes', share, `Table stakes shipped: ${st.filter((t) => t.shipped).length}/${st.length}`, `Ship ${st.filter((t) => !t.shipped).map((t) => t.label).join(' and ')}.`);
    }
    // 4. Plan shape and price level against what this customer expects.
    const plan = mainPlan(state);
    const ref = cfg(state).refPrice;
    const monthly = plan.interval === 'year' ? plan.price / 12 : plan.price;
    const ratio = monthly / Math.max(1, ref);
    const priceOk = ratio >= 0.4 && ratio <= 2.5 ? 1 : ratio < 0.4 ? 0.3 : 0.4;
    const wantsAnnual = (cfg(state).annualShare ?? 0.25) >= 0.6;
    const annualOn = state.plans.some((x) => x.active && x.interval === 'year');
    const monthlyOn = state.plans.some((x) => x.active && x.interval === 'month');
    const shape = wantsAnnual ? (annualOn ? 1 : 0.3) : (cfg(state).annualShare ?? 0.25) <= 0.15 && !monthlyOn ? 0.2 : 1;
    add('pricing', (priceOk + shape) / 2, `Main plan ${plan.interval === 'year' ? `$${plan.price}/yr` : `$${plan.price}/mo`} (${round2(ratio)}x what ${p.short.toLowerCase()} typically pay)`, wantsAnnual ? `${p.label} buy annual contracts on invoice; publish an annual plan.` : `${p.label} pay monthly by card; keep a monthly plan and price near what they pay.`);
  }
  // 5. Support speed against this customer's tolerance.
  const med = state.apps.support?.metrics?.medianFrtHours;
  if (med != null && (state.apps.support?.tickets ?? []).length >= 5) {
    const tol = p.support.frtToleranceHours ?? 4;
    add('support', med <= tol ? 1 : 1 - Math.log(med / tol) / Math.log(10), `Median first response ${round2(med)} h vs ~${tol} h ${p.short.toLowerCase()} expect`, `${p.label} expect ${p.support.expects}.`);
  }
  // 6. Upmarket timing.
  const last = (S.history ?? []).at(-1);
  if (last) add('upmarket', last.readiness / UPMARKET.readyAt, `Moved upmarket at ${Math.round(last.readiness * 100)}% readiness`, 'Close the readiness gaps (SOC 2, SSO, references, a contract plan) before moving upmarket.');

  if (parts.length < 2) return { ...unknownRead(coaching.length ? coaching : p.playbook.slice(0, 2)), evidence };
  const mistakes = (state.mistakes ?? []).filter((m) => m.functionId === FUNCTION_ID).length;
  const score = clamp(parts.reduce((a, x) => a + x.score, 0) / parts.length - Math.min(0.3, 0.08 * mistakes), 0, 1);
  if (mistakes) evidence.push(`${mistakes} customer-type mistake(s) logged`);
  // Cuts [design]: pricing shape is right for most players, so the bar sits higher than the default.
  return { tier: tierFromScore(score, { cuts: { stellar: 0.88, good: 0.68, average: 0.45 } }), score: round2(score), n: parts.length, parts, evidence, coaching: coaching.length ? coaching : ['Keep doing what fits this customer; luck and the market still decide a lot.'] };
}

registerOperatorReader(FUNCTION_ID, readCustomerFit);
