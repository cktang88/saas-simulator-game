// Operator readers for ai_cost_management and startup_perks (data/operator-tiers.js). They read what the player DID:
// budgets and alerts, caching/routing/model swaps backed by evals, rate limits and abuse controls, pass-through pricing,
// seat right-sizing and key hygiene; and for perks: applying only where eligible, planning for the credit cliff and
// keeping the stack lean on credits. Not volume of spend or number of applications.

import { registerOperatorReader, unknownRead, tierFromScore, shrink, tierBehaviours } from '../../core/operator.js';
import { round2 } from '../../core/util.js';
import { aiSlice, perksSlice } from './model.js';
import { aiFeatures, inferenceModel, marginPicture, requestCost, featureCfg } from './inference.js';
import { codingPicture, engineers } from './coding.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mistakesOf = (state, fn) => (state.mistakes ?? []).filter((m) => m.functionId === fn);

export function readAiCost(state) {
  const S = state.apps.aicost;
  const feats = aiFeatures(state);
  const eng = engineers(state);
  const histN = (S?.inf?.hist?.length ?? 0) + (S?.coding?.hist?.length ?? 0);
  if (!S || (!feats.length && !eng.length) || (histN < 1 && !S.coding?.audits)) return unknownRead('Ship an AI feature or add AI-coding engineers and let a month close to get a read.');
  const inf = S.inf, c = S.coding;
  const parts = [], evidence = [], coaching = [];
  const add = (w, v) => parts.push([w, clamp01(v)]);

  if (feats.length) {
    const model = inferenceModel(state);
    const mp = marginPicture(state, model);
    // Spend controls: a budget with alerts (and a ceiling on dev seats).
    add(0.2, (inf.budget.usd != null ? 0.5 : 0) + (inf.budget.alerts ? 0.5 : 0));
    evidence.push(inf.budget.usd != null ? `AI budget ${Math.round(inf.budget.usd)} USD/mo, alerts ${inf.budget.alerts ? 'on' : 'off'}` : 'no AI budget or alerts');
    // Unit economics: AI cost share of revenue and users under water on their plan.
    const share = mp.aiShare;
    const pass = inf.pricing.mode !== 'absorb' || inf.limits.perUserMult != null;
    const econ = (share <= 0.2 ? 1 : share <= 0.35 ? 0.7 : share <= 0.55 ? 0.4 : 0.15) * (mp.underwaterLoss > Math.max(50, 0.04 * mp.revenue) && !pass ? 0.45 : 1) + (inf.pricing.mode !== 'absorb' ? 0.1 : 0);
    add(0.25, econ);
    evidence.push(`AI inference is ${Math.round(share * 100)}% of revenue (AI-native margins run 45-60%, classic SaaS 75-80%); pass-through ${inf.pricing.mode}`);
    // Efficiency without hurting quality: savings vs an all-frontier, uncached build, discounted if quality dropped without evals.
    const naive = feats.reduce((a, f) => { const cfg = featureCfg(state, f); return a + cfg.reqs * requestCost(cfg.type, 'frontier'); }, 0);
    const actual = feats.reduce((a, f) => a + featureCfg(state, f).reqs * requestCost(featureCfg(state, f).type, featureCfg(state, f).model, featureCfg(state, f)), 0);
    const savings = naive > 0 ? clamp01(1 - actual / naive) : 0;
    const swaps = inf.swaps;
    const risky = swaps.filter((s) => s.dq < -0.04);
    const unevaled = risky.filter((s) => !s.evaled).length;
    const evalScore = risky.length ? 1 - unevaled / risky.length : (swaps.length || inf.evals.length ? 1 : 0.6);
    add(0.2, 0.5 * clamp01(savings / 0.5) + 0.5 * evalScore - (model.quality < 0.8 ? 0.2 : 0));
    evidence.push(`${Math.round(savings * 100)}% below an all-frontier uncached baseline; ${unevaled} quality-losing swap(s) without evals, ${inf.evals.length} eval run(s)`);
    // Guardrails: per-user limits, free-tier controls, agent token caps.
    const hasAgent = model.feats.some((x) => x.cfg.type === 'agent');
    const free = inf.freeTier;
    const guard = (inf.limits.perUserMult != null ? 0.45 : 0) + (free.enabled ? ((free.capReqs != null ? 0.2 : 0) + (free.abuseGuard ? 0.1 : 0) + (free.model === 'small' ? 0.05 : 0)) : 0.3) + (hasAgent ? (inf.limits.agentTokenCap ? 0.2 : 0) : 0.2);
    add(0.2, guard);
    evidence.push(`per-user limit ${inf.limits.perUserMult != null ? 'set' : 'none'}${free.enabled ? `, free tier cap ${free.capReqs ?? 'none'}` : ', no free AI tier'}`);
    if (share > 0.35) coaching.push('AI inference is eating margin: route easy requests to a small model after an eval, turn on prompt caching, and pass cost through (credits or an add-on).');
    if (!inf.budget.alerts) coaching.push('Set a monthly AI budget with alerts at 75% and 90%.');
    if (inf.limits.perUserMult == null) coaching.push('Add a per-user fair-use cap: a few heavy users otherwise cost more than they pay.');
    if (unevaled) coaching.push('Run an eval on your own traffic before switching models or turning on routing.');
  }
  if (eng.length) {
    const pic = codingPicture(state);
    const waste = pic.total > 0 ? pic.waste / pic.total : 0;
    const audited = c.audits > 0;
    const keys = c.keyMode === 'scoped' ? 1 : 0;
    add(0.2, 0.35 * (1 - clamp01(waste / 0.4)) + 0.2 * keys + 0.2 * (c.alerts ? 1 : 0) + 0.15 * (c.capUsd != null || c.hardLimit ? 1 : 0) + 0.1 * (audited ? 1 : 0));
    evidence.push(`${eng.length} engineer seat(s): ${Math.round(waste * 100)}% overspend vs the cheapest fitting seat; keys ${c.keyMode}, alerts ${c.alerts ? 'on' : 'off'}, cap ${c.capUsd ?? 'none'}`);
    if (waste > 0.15) coaching.push('Right-size seats from per-engineer usage: heavy users belong on a power seat, light ones on the cheap one; API overage costs far more than a bigger seat.');
    if (c.keyMode === 'shared') coaching.push('Use scoped per-environment API keys with a prepaid hard limit; a shared key that leaks is abused within hours.');
  }
  const wsum = parts.reduce((a, [w]) => a + w, 0) || 1;
  let raw = parts.reduce((a, [w, v]) => a + w * v, 0) / wsum;
  const ms = mistakesOf(state, 'ai_cost_management');
  raw = clamp01(raw - Math.min(0.3, 0.07 * ms.length));
  const score = round2(shrink(raw, histN + 1, 0.5, 1.5));
  const tier = tierFromScore(score, { cuts: { stellar: 0.78, good: 0.6, average: 0.42 } });
  if (ms.length) evidence.push(`${ms.length} AI-cost mistake(s) logged`);
  if (tier !== 'stellar') coaching.push(...tierBehaviours('ai_cost_management').slice(0, 1));
  return { tier, score, n: histN, evidence, coaching };
}

export function readStartupPerks(state) {
  const p = state.apps.perks;
  const decided = (p?.applications ?? []).filter((a) => a.status !== 'pending');
  if (!p || !decided.length) return unknownRead('Apply to a credit program and wait for the decision to get a read on how you capture perks.');
  const inel = decided.filter((a) => a.status === 'ineligible').length;
  const eligibleShare = 1 - inel / decided.length;
  const credits = p.credits;
  const nearEnd = credits.filter((c) => !c.pct && (c.status !== 'active' || c.expiryDay - state.day <= 90 || c.balance < c.amount * 0.15));
  const planned = nearEnd.length ? nearEnd.filter((c) => c.planned).length / nearEnd.length : (credits.some((c) => c.planned) ? 0.9 : 0.55);
  const nominal = credits.reduce((a, c) => a + (c.pct ? 0 : c.amount), 0);
  const wasted = credits.reduce((a, c) => a + (c.wasted ?? 0), 0);
  const wasteShare = nominal > 0 ? wasted / nominal : 0;
  const cl = p.cloud;
  const lean = cl.footprint === 'overbuilt' ? 0 : 1;
  const adoptedForPerk = state.recurring.filter((r) => r.perkTool && r.active).length;
  const discipline = clamp01(1 - 0.3 * adoptedForPerk);
  const ms = mistakesOf(state, 'startup_perks');
  let raw = 0.34 * eligibleShare + 0.3 * planned + 0.14 * (1 - clamp01(wasteShare * 1.5)) + 0.12 * lean + 0.1 * discipline;
  raw = clamp01(raw - Math.min(0.25, 0.08 * ms.length));
  const score = round2(shrink(raw, decided.length, 0.5, 1.5));
  const tier = tierFromScore(score, { cuts: { stellar: 0.8, good: 0.62, average: 0.45 } });
  const evidence = [
    `${decided.length} decided application(s); ${inel} rejected as ineligible (wasted hours)`,
    `${credits.filter((c) => c.planned).length} of ${credits.length} credit(s) have a cliff plan; ${Math.round(wasteShare * 100)}% of credit value expired unused`,
    `cloud footprint ${cl.footprint}${adoptedForPerk ? `; ${adoptedForPerk} tool(s) adopted only for a perk` : ''}`,
  ];
  const coaching = [];
  if (inel) coaching.push('Read the eligibility checklist before applying: every rejected application is founder hours spent for nothing.');
  if (planned < 0.7 && nearEnd.length) coaching.push('Put the credit cliff in your forecast and decide ahead: right-size, migrate or budget the cash bill.');
  if (!lean) coaching.push('Do not build big because the cloud is free; the over-provisioned footprint is a cash bill at the cliff.');
  if (tier !== 'stellar') coaching.push(...tierBehaviours('startup_perks').slice(0, 1));
  return { tier, score, n: decided.length, evidence, coaching };
}

registerOperatorReader('ai_cost_management', readAiCost);
registerOperatorReader('startup_perks', readStartupPerks);
export { aiSlice, perksSlice };
