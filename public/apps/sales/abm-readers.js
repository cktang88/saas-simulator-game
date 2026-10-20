// Operator readers for account-based marketing and signal-based outreach (core/operator.js, ARCHITECTURE principle 7).
// Reads come from what the player DID, reconciled with the hidden truth in apps/sales/abm.js (was the account really
// in market when you acted, was the signal real, did the message name their real initiative), never from volume.
// Function ids: 'signal_outreach' and 'account_based_marketing' (data/operator-tiers.js).
import { registerOperatorReader, tierFromScore, unknownRead, trapCoaching, tierBehaviours } from '../../core/operator.js';
import { clamp } from '../../core/util.js';
import { reasonQuality } from './abm.js';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => { if (!xs.length) return null; const v = [...xs].sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
const mistakeCount = (state, id) => (state.mistakes ?? []).filter((m) => m.id === id).length;

/** Signal-based outreach: speed, precision against the hidden truth, stacking, reference accuracy, ICP filter, pruning. */
export function signalRead(state) {
  const a = state.apps?.crm?.abm;
  const T = (a?.touches ?? []).filter((t) => t.signalIds?.length);
  if (T.length < 8) return unknownRead('Act on at least 8 signals before your signal-based outreach can be read.');
  const lagDays = median(T.map((t) => t.signalAge ?? 0));
  const fresh = mean(T.map((t) => t.fresh ?? 0.5));
  const latency = 0.5 * clamp(1 - (lagDays - 1) / 10, 0, 1) + 0.5 * clamp((fresh - 0.2) / 0.6, 0, 1);
  const inMarket = T.filter((t) => t.inMarket).length / T.length;
  const precision = clamp((inMarket - 0.2) / 0.45, 0, 1);
  const stack = T.filter((t) => t.stack >= 2 || ['job_change', 'competitor_review'].includes(t.sigType)).length / T.length;
  const withRefs = T.filter((t) => t.refs?.length);
  const clean = withRefs.length ? withRefs.filter((t) => t.refs.every((r) => r.ok) && !t.flags.creepy && !t.flags.staleRef).length / withRefs.length : 0.5;
  const fit = clamp((mean(T.map((t) => t.fit)) - 0.35) / 0.4, 0, 1);
  const q = clamp((mean(T.map((t) => t.q)) - 0.3) / 0.45, 0, 1);
  const deadKept = mistakeCount(state, 'dead_source_kept');
  const prunedDead = Object.values(a.sources ?? {}).some((s) => s.pruned != null && s.prunedStats?.acted >= 8 && s.prunedStats.positives === 0);
  const score = clamp(0.18 * latency + 0.2 * precision + 0.12 * stack + 0.15 * clean + 0.1 * fit + 0.15 * q + 0.05 * (prunedDead ? 1 : 0) + 0.05 * (deadKept ? 0 : 1)
    - 0.02 * Math.min(5, mistakeCount(state, 'acted_on_false_signal')) - 0.02 * Math.min(5, mistakeCount(state, 'creepy_signal_reference') + mistakeCount(state, 'gdpr_visitor_outreach')), 0, 1);
  const done = T.filter((t) => t.outcome);
  const evidence = [
    `${T.length} touches on signals; median ${lagDays} day(s) from alert to action, signals ${Math.round(fresh * 100)}% fresh on average`,
    `${Math.round(stack * 100)}% acted on stacked or strong signals; ${Math.round(clean * 100)}% of signal references accurate and not creepy`,
    `positive replies ${done.length ? Math.round((100 * done.filter((t) => t.outcome === 'positive').length) / done.length) : 0}% of answered-or-expired touches`,
  ];
  if (deadKept) evidence.push(`kept paying for a source with no replies (${deadKept} month(s))`);
  const coaching = [];
  if (lagDays > 3) coaching.push(trapCoaching('signal_outreach', 'slow_signal_response'));
  if (clean < 0.7) coaching.push(trapCoaching('signal_outreach', 'acted_on_false_signal'));
  if (T.some((t) => t.flags.creepy)) coaching.push(trapCoaching('signal_outreach', 'creepy_signal_reference'));
  if (stack < 0.4 || inMarket < 0.35) coaching.push(trapCoaching('signal_outreach', 'untargeted_signal_blast'));
  if (deadKept) coaching.push(trapCoaching('signal_outreach', 'dead_source_kept'));
  coaching.push(`Stellar: ${tierBehaviours('signal_outreach', 'stellar')[0]}`);
  return { tier: tierFromScore(score), score: +score.toFixed(2), n: T.length, evidence, coaching };
}

/** ABM: tiering by fit, reasons, committee coverage on tier 1, research depth, personalization, burned accounts. */
export function abmRead(state) {
  const a = state.apps?.crm?.abm;
  const targets = (a?.accounts ?? []).filter((x) => x.status === 'target');
  const touched = targets.filter((x) => x.members.some((m) => m.touches > 0));
  if (targets.length < 5 || touched.length < 3) return unknownRead('Pick at least 5 target accounts and work 3 of them before your ABM can be read.');
  const t1 = targets.filter((x) => x.tier === 1);
  const t1Fit = t1.length ? mean(t1.map((x) => x.truth.fit)) : 0;
  const tierFit = clamp((t1Fit - 0.4) / 0.35, 0, 1) * (t1.length >= 3 && t1.length <= 12 ? 1 : t1.length > 20 ? 0.3 : 0.7);
  const reasons = mean(targets.map((x) => reasonQuality(x).score));
  const t1Touched = t1.filter((x) => x.members.some((m) => m.touches > 0));
  const coverage = t1Touched.length ? mean(t1Touched.map((x) => Math.min(1, x.members.filter((m) => m.touches > 0).length / Math.min(3, x.members.length)))) : 0;
  const researched = t1Touched.length ? t1Touched.filter((x) => x.research.deep > 0 || x.research.initiative).length / t1Touched.length : 0;
  const t1Msgs = (a.touches ?? []).filter((t) => t.tier === 1 && t.play === '1:1');
  const personal = t1Msgs.length ? clamp((mean(t1Msgs.map((t) => t.q)) - 0.35) / 0.4, 0, 1) : 0.3;
  const burned = targets.filter((x) => x.burnedUntil != null).length;
  const burnShare = burned / targets.length;
  const single = mistakeCount(state, 'single_threaded_enterprise');
  const generic = mistakeCount(state, 'tier1_generic_message');
  const score = clamp(0.2 * tierFit + 0.1 * reasons + 0.2 * coverage + 0.15 * researched + 0.2 * personal + 0.15 * clamp(1 - burnShare * 4, 0, 1)
    - 0.03 * Math.min(5, single) - 0.01 * Math.min(10, generic), 0, 1);
  const opps = targets.filter((x) => x.oppDealId);
  const evidence = [
    `${targets.length} target accounts (${t1.length} tier 1, ${targets.filter((x) => x.tier === 2).length} tier 2, ${targets.filter((x) => x.tier === 3).length} tier 3)`,
    `tier-1 accounts worked: ${t1Touched.length}; ${Math.round(coverage * 100)}% of their buying group reached, ${Math.round(researched * 100)}% researched first`,
    `${opps.length} opportunities from target accounts; ${burned} account(s) burned by over-touching`,
  ];
  const coaching = [];
  if (tierFit < 0.5) coaching.push(trapCoaching('account_based_marketing', 'tier_by_size'));
  if (coverage < 0.5 || single) coaching.push(trapCoaching('account_based_marketing', 'single_threaded_enterprise'));
  if (personal < 0.5 || generic) coaching.push(trapCoaching('account_based_marketing', 'tier1_generic_message'));
  if (burned) coaching.push(trapCoaching('account_based_marketing', 'burned_account'));
  coaching.push(`Stellar: ${tierBehaviours('account_based_marketing', 'stellar')[0]}`);
  return { tier: tierFromScore(score), score: +score.toFixed(2), n: targets.length, evidence, coaching };
}

let done = false;
export function registerAbmReaders() {
  if (done) return;
  done = true;
  registerOperatorReader('signal_outreach', signalRead);
  registerOperatorReader('account_based_marketing', abmRead);
}
registerAbmReaders();
