// In-product LLM inference: every active user generates requests whose tokens depend on the feature type; the model
// tier, prompt caching, batching, routing, per-user limits and a free tier set the monthly bill, which posts as COGS
// (ai_inference) so gross margin drops realistically. Quality (activation / churn) moves with the model chosen
// unless the player ran evals first. Pure functions where possible; the day/month hooks are called from product.js.
//
// Numbers: data/ai-costs.js (prices from docs/research/ops-2026/llm-spend.md; [design] tags there).

import { notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { activeSubs, trialingSubs, mrr, charge, customerById } from '../../core/stripe.js';
import { setModifier, mainPlan } from '../../core/market.js';
import { monthKey, round2, money } from '../../core/util.js';
import {
  MODEL_TIERS, TIER_ORDER, CACHE, BATCH_DISCOUNT, FEATURE_TYPES, LEVEL_DEFAULTS, USAGE_SIGMA, FREE_TIER, PROVIDERS, QUALITY, EVALS, ROUTING,
  PASS_THROUGH, DEPRECATION, AGENT_LOOP, BUDGET,
} from '../../data/ai-costs.js';
import { USERS_PER_ACCOUNT } from '../product/build.js';
import { aiSlice, aiRng, PhiInv, meanCapped, shareAbove, hashU, pushEvent, aiMistake, usd0 } from './model.js';

export const accountsOf = (state) => activeSubs(state).length + trialingSubs(state).length;
export const usersPerAccount = (state) => USERS_PER_ACCOUNT[state.company?.model] ?? 1;

// ---------------------------------------------------------------------------------------------------------
// Cost math
// ---------------------------------------------------------------------------------------------------------

/** USD for one request. cache: 'off' | 'prompt' (provider prompt caching) | 'aggressive' (also a response cache). */
export function requestCost(type, tier, { cache = 'off', batch = false } = {}) {
  const t = FEATURE_TYPES[type], m = MODEL_TIERS[tier];
  if (!t || !m) return 0;
  let inShare = 1;
  if (cache !== 'off') inShare = (1 - t.cacheable) + t.cacheable * (CACHE.hitRate * CACHE.readShare + (1 - CACHE.hitRate) * CACHE.writePremium);
  let usd = (t.in * inShare * m.in + t.out * m.out) / 1e6;
  if (batch) usd *= 1 - t.batchable * BATCH_DISCOUNT;
  if (cache === 'aggressive') usd *= 0.75; // a quarter of requests answered from the response cache
  return usd;
}

/** Start configuration of a feature from its Spec "usage level" (or any later player choice). */
export function featureCfg(state, f) {
  const inf = aiSlice(state).inf;
  let c = inf.features[f.id];
  if (!c) {
    const d = LEVEL_DEFAULTS[f.ai?.level] ?? LEVEL_DEFAULTS.light;
    const type = detectType(f) ?? d.type;
    c = inf.features[f.id] = { type, model: d.model, reqs: d.reqs, cache: 'off', batch: false, sinceDay: state.day, penalty: 0, penaltyUntil: 0 };
    if (type !== d.type) { // a different type than the level assumed: scale the volume to the type's usual request count
      c.reqs = Math.round(d.reqs * (FEATURE_TYPES[type].reqs / FEATURE_TYPES[d.type].reqs));
      if (type === 'agent') c.model = d.model === 'small' ? 'mid' : d.model;
    }
    c.baseQ = qualityOf(c, inf.routing);
  }
  return c;
}
const detectType = (f) => {
  const t = `${f.title ?? ''} ${f.solution ?? ''}`;
  if (f.ai?.level === 'heavy' || /\b(agent|autonomous|autopilot|multi-step|workflow automation)\b/i.test(t)) return 'agent';
  if (/\b(summari[sz]|extract|classif|categori[sz]|tagging|parse|ocr)/i.test(t)) return 'extract';
  if (/\b(search|knowledge|docs?|answers?|rag|ask your)\b/i.test(t)) return 'rag';
  return null;
};

export const aiFeatures = (state) => (state.apps.product?.features ?? []).filter((f) => f.status === 'shipped' && !f.system && f.ai?.enabled);
export const aiEngineOn = (state) => aiFeatures(state).length > 0;

export function qualityOf(cfg, routing = {}) {
  const m = MODEL_TIERS[cfg.model];
  let q = m.quality[cfg.type];
  if (routing.enabled) {
    const small = MODEL_TIERS.small.quality[cfg.type];
    const gap = Math.max(0, q - small) * routing.share;
    q = q - gap * (routing.tuned ? 0.15 : 1) - (routing.tuned ? 0 : ROUTING.misroutePenalty);
  }
  if (cfg.cache === 'aggressive') q *= cfg.type === 'agent' ? 0.92 : 0.96;
  return Math.max(0, q - (cfg.penaltyUntil > 0 ? cfg.penalty ?? 0 : 0));
}

function costPerRequest(cfg, routing, { forceTier = null } = {}) {
  const tier = forceTier ?? cfg.model;
  const direct = requestCost(cfg.type, tier, cfg);
  if (!routing.enabled || forceTier) return { usd: direct, byTier: { [tier]: direct } };
  const small = requestCost(cfg.type, 'small', cfg);
  return { usd: (1 - routing.share) * direct + routing.share * small, byTier: { [tier]: (1 - routing.share) * direct, small: routing.share * small } };
}

/** The whole monthly picture from the current configuration and customer count (deterministic). */
export function inferenceModel(state) {
  const S = aiSlice(state), inf = S.inf;
  const feats = aiFeatures(state);
  const N = accountsOf(state), upa = usersPerAccount(state), paidUsers = N * upa;
  const sigma = USAGE_SIGMA;
  const addonMode = inf.pricing.mode === 'addon';
  const adoption = addonMode ? addonAdoption(inf.pricing.addonPrice) : 1;
  const out = { feats: [], total: 0, paid: 0, free: 0, bots: 0, byModel: {}, byFeature: {}, paidUsers, accounts: N, freeUsers: 0, adoption, perUserAvg: 0 };
  const ft = inf.freeTier;
  const capMult = inf.limits.perUserMult; // paid fair-use cap as a multiple of the average user
  let avgPerUser = 0;
  for (const f of feats) {
    const cfg = featureCfg(state, f);
    const cpr = costPerRequest(cfg, inf.routing);
    const perUserAvg = cfg.reqs * cpr.usd;
    const paidUsd = paidUsers * perUserAvg * meanCapped(sigma, capMult) * adoption;
    avgPerUser += perUserAvg * meanCapped(sigma, capMult);
    let freeUsd = 0, botUsd = 0;
    if (ft.enabled) {
      const freeUsers = N * FREE_TIER.ratio;
      out.freeUsers = freeUsers;
      const fcpr = ft.model === 'small' ? costPerRequest(cfg, { enabled: false }, { forceTier: 'small' }) : cpr;
      const casualReqs = cfg.reqs * FREE_TIER.casualUse;
      const cap = ft.capReqs;
      const casual = freeUsers * (1 - FREE_TIER.botShare) * casualReqs * (cap ? meanCapped(sigma, cap / casualReqs) : 1) * fcpr.usd;
      const botShare = FREE_TIER.botShare * (ft.abuseGuard ? 0.3 : 1);
      const botReqs = cap ? Math.min(cfg.reqs * FREE_TIER.botMult, cap) : cfg.reqs * FREE_TIER.botMult;
      botUsd = freeUsers * botShare * botReqs * fcpr.usd;
      freeUsd = casual;
    }
    const total = paidUsd + freeUsd + botUsd;
    out.feats.push({ id: f.id, title: f.title, cfg, perUser: perUserAvg, paid: paidUsd, free: freeUsd, bots: botUsd, total, q: qualityOf(cfg, inf.routing) });
    out.byFeature[f.id] = round2(total);
    out.paid += paidUsd; out.free += freeUsd; out.bots += botUsd; out.total += total;
    for (const [tier, share] of Object.entries(cpr.byTier)) {
      const denom = cpr.usd || 1;
      out.byModel[tier] = (out.byModel[tier] ?? 0) + (total * share) / denom;
    }
  }
  out.perUserAvg = avgPerUser;
  out.perActiveUser = paidUsers + out.freeUsers > 0 ? out.total / (paidUsers + out.freeUsers) : 0;
  out.total = round2(out.total);
  out.quality = qualityIndex(out.feats);
  return out;
}

const qualityIndex = (feats) => {
  const w = feats.reduce((a, x) => a + x.cfg.reqs, 0);
  return w ? feats.reduce((a, x) => a + x.q * x.cfg.reqs, 0) / w : 1;
};
/** Customers' disappointment: quality below what shipped (or terrible in absolute terms). 0 = none. */
export function qualityDeficit(feats) {
  const w = feats.reduce((a, x) => a + x.cfg.reqs, 0);
  if (!w) return 0;
  return feats.reduce((a, x) => a + (Math.max(0, (x.cfg.baseQ ?? x.q) - x.q) + Math.max(0, 0.7 - x.q)) * x.cfg.reqs, 0) / w;
}

export const addonAdoption = (price) => Math.max(0.02, PASS_THROUGH.addonAdoption * Math.exp(-price / (PASS_THROUGH.addonPriceRef * 1.5)));

/** Per-user margin picture: average cost vs revenue and the monthly loss from users whose own cost exceeds what they pay. */
export function marginPicture(state, model = inferenceModel(state)) {
  const S = aiSlice(state), inf = S.inf;
  const revenue = mrr(state);
  const upa = usersPerAccount(state);
  const paidUsers = model.paidUsers;
  const revPerUser = paidUsers ? revenue / paidUsers : 0;
  const c = paidUsers ? model.paid / paidUsers / Math.max(0.0001, model.adoption) : 0; // average cost per AI-using paid user
  const cap = inf.limits.perUserMult;
  let loss = 0;
  const K = 60;
  for (let k = 0; k < K; k++) {
    const x = Math.exp(-(USAGE_SIGMA ** 2) / 2 + USAGE_SIGMA * PhiInv((k + 0.5) / K));
    const cost = c * Math.min(x, cap ?? Infinity);
    const pays = inf.pricing.mode === 'addon' ? revPerUser + inf.pricing.addonPrice / upa : revPerUser;
    loss += Math.max(0, cost - pays);
  }
  loss = (loss / K) * paidUsers * model.adoption;
  const aiShare = revenue > 0 ? model.total / revenue : 0;
  return { revenue, revPerUser, avgCost: c, aiShare, gmImpact: aiShare, underwaterLoss: round2(loss), p90Cost: c * Math.exp(-(USAGE_SIGMA ** 2) / 2 + USAGE_SIGMA * 1.2816) };
}

// ---------------------------------------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------------------------------------

const cacheKey = (cfg, model = cfg.model) => `${model}|${cfg.cache}`;

/** Run an eval suite for a candidate configuration BEFORE switching. Returns { hours, usd, ratio, pass, measuredQ }. */
export function runEval(state, featureId, change = {}) {
  const S = aiSlice(state), inf = S.inf;
  const f = (state.apps.product?.features ?? []).find((x) => x.id === featureId);
  if (!f) return { ok: false, error: 'Unknown feature' };
  const cfg = featureCfg(state, f);
  const cand = { ...cfg, ...change, penaltyUntil: 0 };
  const cur = qualityOf(cfg, inf.routing);
  const routing = change.routing ? { ...inf.routing, ...change.routing } : inf.routing;
  const next = qualityOf(cand, routing);
  const noise = (aiRng(state) - 0.5) * 0.03; // an eval is a sample, not the truth
  const measured = Math.max(0, next + noise);
  const ratio = cur > 0 ? measured / cur : 1;
  const e = { id: `ev${inf.evals.length + 1}`, featureId, day: state.day, key: change.routing ? `route|${routing.tuned}` : cacheKey(cand), ratio: round2(ratio), measuredQ: round2(measured), pass: ratio >= EVALS.passRatio };
  inf.evals.push(e);
  if (inf.evals.length > 80) inf.evals.shift();
  post(state, { amount: -EVALS.usd, counterparty: PROVIDERS[inf.provider].counterparty, description: 'Eval run on a candidate model/config', category: 'software', method: 'card', meta: { provider: inf.provider, dev: true, app: 'aicost' } });
  return { ok: true, hours: EVALS.hours, usd: EVALS.usd, ratio: e.ratio, pass: e.pass, measuredQ: e.measuredQ, eval: e };
}
const evaledRecently = (state, featureId, key) => aiSlice(state).inf.evals.some((e) => e.featureId === featureId && e.key === key && state.day - e.day <= EVALS.ttlDays);

/** Change a feature's model / cache / batch / volume. A downgrade that costs quality without a prior eval is a mistake. */
export function setFeature(state, featureId, patch) {
  const S = aiSlice(state), inf = S.inf;
  const f = (state.apps.product?.features ?? []).find((x) => x.id === featureId);
  if (!f) return { ok: false, error: 'Unknown feature' };
  const cfg = featureCfg(state, f);
  const before = qualityOf(cfg, inf.routing);
  const was = { model: cfg.model, cache: cfg.cache };
  const next = { ...cfg, ...patch };
  const evaled = (patch.model == null && patch.cache == null) || evaledRecently(state, featureId, cacheKey(next));
  Object.assign(cfg, patch, { sinceDay: state.day });
  const after = qualityOf(cfg, inf.routing);
  inf.swaps.push({ day: state.day, featureId, from: was, to: { model: cfg.model, cache: cfg.cache }, evaled, dq: round2(after - before) });
  if (inf.swaps.length > 60) inf.swaps.shift();
  if (after < before - 0.04 && !evaled) {
    const accts = accountsOf(state);
    aiMistake(state, {
      functionId: 'ai_cost_management', id: 'model_swap_without_evals', label: `Swapped "${f.title || 'an AI feature'}" to a cheaper setup without evals`,
      cost: { hours: 6, customers: Math.max(1, Math.round(accts * (before - after) * 0.4)), reputation: 1 }, delayed: true,
      detail: `Quality fell about ${Math.round((before - after) * 100)} points (${was.model}/${was.cache} to ${cfg.model}/${cfg.cache}). Activation and retention drift down until you roll back or fix prompts; an eval run (about ${EVALS.hours} h, ${money(EVALS.usd)}) would have shown it first.`,
      key: `swap:${featureId}:${state.day}`,
    });
  }
  applyQualityEffects(state);
  return { ok: true, dq: round2(after - before), evaled, hours: 0.5 };
}

export function setRouting(state, { enabled, tuned }) {
  const inf = aiSlice(state).inf;
  const before = inferenceModel(state).quality;
  if (enabled != null) inf.routing.enabled = Boolean(enabled);
  let hours = 0.5;
  if (tuned && !inf.routing.tuned) { inf.routing.tuned = true; hours = EVALS.routeHours + EVALS.hours; post(state, { amount: -EVALS.usd, counterparty: PROVIDERS[inf.provider].counterparty, description: 'Eval run to tune the model router', category: 'software', method: 'card', meta: { provider: inf.provider, dev: true, app: 'aicost' } }); }
  const after = inferenceModel(state).quality;
  if (enabled && !inf.routing.tuned && after < before - 0.03) {
    aiMistake(state, { functionId: 'ai_cost_management', id: 'model_swap_without_evals', label: 'Turned on model routing without evals', cost: { hours: 4, customers: Math.max(1, Math.round(accountsOf(state) * (before - after) * 0.3)) }, delayed: true, detail: 'Untuned routing sends some hard requests to the small model; quality fell. Evaluate the router on your own traffic before shipping it.', key: `route:${state.day}` });
  }
  inf.routing.share = ROUTING.share;
  applyQualityEffects(state);
  return { ok: true, hours };
}

export function setLimits(state, patch) {
  const inf = aiSlice(state).inf;
  const hours = 1;
  if ('perUserMult' in patch) inf.limits.perUserMult = patch.perUserMult == null ? null : Math.max(1, Number(patch.perUserMult));
  if ('agentTokenCap' in patch) inf.limits.agentTokenCap = Boolean(patch.agentTokenCap);
  return { ok: true, hours };
}
export function setFreeTier(state, patch) {
  const ft = aiSlice(state).inf.freeTier;
  let hours = 0.5;
  for (const k of ['enabled', 'abuseGuard']) if (k in patch) { if (k === 'abuseGuard' && patch[k] && !ft.abuseGuard) hours += 3; ft[k] = Boolean(patch[k]); }
  if ('capReqs' in patch) { ft.capReqs = patch.capReqs == null ? null : Math.max(1, Number(patch.capReqs)); hours += 0.5; }
  if ('model' in patch) ft.model = patch.model === 'small' ? 'small' : 'same';
  return { ok: true, hours };
}
export function setBudget(state, { usd, alerts }) {
  const b = aiSlice(state).inf.budget;
  if (usd !== undefined) b.usd = usd == null ? null : Math.max(0, Number(usd));
  if (alerts !== undefined) b.alerts = Boolean(alerts);
  return { ok: true, hours: BUDGET.setupHours };
}
export function setPricing(state, patch) {
  const p = aiSlice(state).inf.pricing;
  if (patch.mode && ['absorb', 'credits', 'addon'].includes(patch.mode)) p.mode = patch.mode;
  for (const k of ['includedUsd', 'addonPrice', 'markup']) if (patch[k] != null) p[k] = Math.max(0, Number(patch[k]));
  return { ok: true, hours: PASS_THROUGH.hours };
}
/** Switching the inference provider: more work for cloud-marketplace endpoints (IAM, quotas, private networking). */
export function providerSwitchHours(state, provider) {
  const inf = aiSlice(state).inf;
  const n = aiFeatures(state).length;
  const months = inf.providerSince == null ? 0 : (state.day - inf.providerSince) / 30.4;
  return Math.round((4 + 2 * n + (PROVIDERS[provider]?.cloud || PROVIDERS[inf.provider].cloud ? 8 : 0) + Math.min(12, months * 0.5)) * 10) / 10;
}
export function setProvider(state, provider) {
  const inf = aiSlice(state).inf;
  if (!PROVIDERS[provider]) return { ok: false, error: 'Unknown provider' };
  if (inf.provider === provider) return { ok: false, error: 'Already on it' };
  const hours = providerSwitchHours(state, provider);
  inf.provider = provider; inf.providerSince = state.day; inf.providerMoves++;
  return { ok: true, hours };
}

// ---------------------------------------------------------------------------------------------------------
// Quality -> market effects, deprecations
// ---------------------------------------------------------------------------------------------------------

export function applyQualityEffects(state) {
  const feats = inferenceModel(state).feats;
  const def = qualityDeficit(feats);
  setModifier(state, 'churn', 'ai-quality', def > 0.005 ? round2(1 + QUALITY.churnPer * def) : null);
  setModifier(state, 'conversion', 'ai-quality', def > 0.005 ? round2(Math.max(0.3, 1 - QUALITY.conversionPer * def)) : null);
  aiSlice(state).inf.quality = round2(qualityIndex(feats));
  return def;
}

export function pendingDeprecations(state) {
  return aiSlice(state).inf.deprecations.filter((d) => !d.migrated && !d.forced);
}

/** Move the features pinned to a retiring tier to a supported one. withEvals avoids the migration regression. */
export function migrateDeprecation(state, depId, { withEvals = false, toModel = null } = {}) {
  const inf = aiSlice(state).inf;
  const d = inf.deprecations.find((x) => x.id === depId);
  if (!d || d.migrated || d.forced) return { ok: false, error: 'Nothing to migrate' };
  const feats = aiFeatures(state).filter((f) => featureCfg(state, f).model === d.tier);
  const [base, per] = DEPRECATION.migrateHours;
  let hours = base + per * feats.length + (withEvals ? EVALS.hours * Math.max(1, feats.length) * 0.5 : 0);
  for (const f of feats) {
    const cfg = featureCfg(state, f);
    cfg.sinceDay = state.day;
    if (toModel) cfg.model = toModel;
    if (!withEvals) { cfg.penalty = 0.06; cfg.penaltyUntil = state.day + 60; }
  }
  d.migrated = true; d.migratedDay = state.day; d.withEvals = withEvals;
  if (!withEvals && feats.length) {
    aiMistake(state, { functionId: 'ai_cost_management', id: 'model_swap_without_evals', label: 'Migrated off a retiring model without evals', cost: { hours: 5, customers: Math.max(1, Math.round(accountsOf(state) * 0.04)) }, delayed: true, detail: 'The replacement model answers differently; prompts tuned for the old one regressed for about two months.', key: `mig:${d.id}` });
  }
  applyQualityEffects(state);
  return { ok: true, hours: round2(hours), features: feats.length };
}

function deprecationMonth(state) {
  const inf = aiSlice(state).inf;
  const used = new Set(aiFeatures(state).map((f) => featureCfg(state, f).model));
  if (!used.size) return;
  const open = new Set(pendingDeprecations(state).map((d) => d.tier));
  const tiers = [...used].filter((t) => !open.has(t));
  if (!tiers.length) return;
  if (aiRng(state) >= DEPRECATION.monthly * tiers.length) return;
  const tier = tiers[Math.floor(aiRng(state) * tiers.length) % tiers.length];
  const [lo, hi] = DEPRECATION.noticeDays;
  const days = lo + Math.floor(aiRng(state) * (hi - lo + 1));
  const d = { id: `dep${inf.deprecations.length + 1}`, tier, noticeDay: state.day, retireDay: state.day + days, migrated: false, forced: false };
  inf.deprecations.push(d);
  const S = aiSlice(state);
  pushEvent(S, state, 'model_deprecation_notice', { tier, retireDay: d.retireDay, depId: d.id, text: `The ${MODEL_TIERS[tier].label.toLowerCase()} your features are pinned to retires in ${days} days.` });
  notify(state, `Model retirement notice: the ${MODEL_TIERS[tier].label.toLowerCase()} you are pinned to retires in ${days} days. Plan the migration (and run evals) in Product → AI costs.`, { type: 'warn', app: 'product' });
}

function forceDeprecations(state) {
  const inf = aiSlice(state).inf;
  for (const d of pendingDeprecations(state)) {
    if (state.day < d.retireDay) continue;
    d.forced = true; d.forcedDay = state.day;
    const feats = aiFeatures(state).filter((f) => featureCfg(state, f).model === d.tier);
    for (const f of feats) { const cfg = featureCfg(state, f); cfg.model = 'mid'; cfg.penalty = 0.08; cfg.penaltyUntil = state.day + 60; cfg.sinceDay = state.day; }
    setModifier(state, 'churn', 'ai-cutover', DEPRECATION.forcedChurn);
    d.cutoverUntil = state.day + DEPRECATION.forcedDays;
    state.founder.hoursUsed = (state.founder.hoursUsed ?? 0) + 8;
    aiMistake(state, { functionId: 'ai_cost_management', id: 'model_deprecation_ignored', label: 'A pinned model was retired under you', cost: { hours: 8, customers: Math.max(1, Math.round(accountsOf(state) * 0.05)), days: DEPRECATION.forcedDays }, delayed: true, detail: `The provider cut over ${feats.length} feature(s) on ${MODEL_TIERS[d.tier].label.toLowerCase()} with errors and degraded answers for ~2 weeks.`, key: `dep:${d.id}` });
    notify(state, `The model you were pinned to was retired. ${feats.length} AI feature(s) failed over to a mid-tier model with errors for about two weeks.`, { type: 'bad', app: 'product' });
    applyQualityEffects(state);
  }
  for (const d of inf.deprecations) if (d.cutoverUntil && state.day > d.cutoverUntil) { d.cutoverUntil = 0; setModifier(state, 'churn', 'ai-cutover', null); }
}

// ---------------------------------------------------------------------------------------------------------
// Daily / monthly engine (called from product.js)
// ---------------------------------------------------------------------------------------------------------

function mtdFor(state) {
  const inf = aiSlice(state).inf;
  const m = monthKey(state);
  if (inf.mtd.month !== m) inf.mtd = { month: m, usd: 0, byFeature: {}, byModel: {}, extra: 0, free: 0, bots: 0, budgetFired: false, spikes: 0 };
  return inf.mtd;
}

export function inferenceDay(state) {
  if (!aiEngineOn(state)) return null;
  const S = aiSlice(state), inf = S.inf;
  const mtd = mtdFor(state);
  const model = inferenceModel(state);
  const daily = model.total / 30;
  mtd.usd = round2(mtd.usd + daily);
  mtd.free = round2((mtd.free ?? 0) + model.free / 30);
  mtd.bots = round2((mtd.bots ?? 0) + model.bots / 30);
  for (const [k, v] of Object.entries(model.byFeature)) mtd.byFeature[k] = round2((mtd.byFeature[k] ?? 0) + v / 30);
  for (const [k, v] of Object.entries(model.byModel)) mtd.byModel[k] = round2((mtd.byModel[k] ?? 0) + v / 30);
  // Incidents: an exposed endpoint gets scripted (rate limits blunt it), an agent loop burns tokens (a per-task token cap blunts it).
  if (model.total > 20) {
    const capped = inf.limits.perUserMult != null || (inf.freeTier.enabled && inf.freeTier.capReqs != null);
    const pAbuse = (0.06 / 30) * (capped ? 0.2 : 1);
    if (aiRng(state) < pAbuse) {
      const excess = round2(model.total * (0.25 + 0.5 * aiRng(state)) * (capped ? 0.25 : 1));
      mtd.extra = round2(mtd.extra + excess); mtd.spikes++;
      mtd.lastSpike = { day: state.day, kind: 'abuse', usd: excess, capped };
      if (inf.budget.alerts) { pushEvent(S, state, 'ai_spend_spike', { usd: excess, kind: 'abuse', text: `AI spend spiked by ${usd0(excess)} (scripted traffic on a public endpoint).` }); notify(state, `AI spend spike: about ${usd0(excess)} of unusual traffic. Check rate limits and your free tier.`, { type: 'warn', app: 'product' }); }
    }
    const hasAgent = model.feats.some((x) => x.cfg.type === 'agent');
    if (hasAgent && !inf.limits.agentTokenCap && aiRng(state) < AGENT_LOOP.monthly / 30) {
      const agentUsd = model.feats.filter((x) => x.cfg.type === 'agent').reduce((a, x) => a + x.total, 0);
      const mult = AGENT_LOOP.mult[0] + aiRng(state) * (AGENT_LOOP.mult[1] - AGENT_LOOP.mult[0]);
      const days = inf.budget.alerts ? 1 : 3;
      const excess = round2((agentUsd / 30) * (mult - 1) * days);
      mtd.extra = round2(mtd.extra + excess); mtd.spikes++;
      mtd.lastSpike = { day: state.day, kind: 'agent_loop', usd: excess, capped: false };
      aiMistake(state, { functionId: 'ai_cost_management', id: 'unmonitored_agent_spend', label: 'A production agent looped on a task with no token cap', cost: { usd: excess, hours: 2 }, detail: `An agent retried a failing tool call for about ${days} day(s) at ${Math.round(mult)}x its normal token use. A per-task token cap and a budget alert end this in minutes.`, key: `loop:${state.day}` });
      if (inf.budget.alerts) { pushEvent(S, state, 'ai_spend_spike', { usd: excess, kind: 'agent_loop', text: `Agent loop: ${usd0(excess)} extra.` }); notify(state, `Agent loop detected: ${usd0(excess)} of extra tokens.`, { type: 'bad', app: 'product' }); }
    }
  }
  const total = mtd.usd + mtd.extra;
  if (inf.budget.usd != null && total > inf.budget.usd && !mtd.budgetFired) {
    mtd.budgetFired = true;
    if (inf.budget.alerts) { pushEvent(S, state, 'ai_budget_exceeded', { usd: round2(total), budget: inf.budget.usd, text: `AI spend ${usd0(total)} passed the ${usd0(inf.budget.usd)} budget.` }); notify(state, `AI spend this month (${usd0(total)}) passed your ${usd0(inf.budget.usd)} budget.`, { type: 'warn', app: 'product' }); }
  }
  inf.usd30.push(daily); if (inf.usd30.length > 30) inf.usd30.shift();
  forceDeprecations(state);
  for (const f of aiFeatures(state)) { const c = featureCfg(state, f); if (c.penaltyUntil && state.day > c.penaltyUntil) { c.penalty = 0; c.penaltyUntil = 0; } }
  return model;
}

export function inferenceMonthEnd(state) {
  if (!aiEngineOn(state)) return null;
  const S = aiSlice(state), inf = S.inf;
  const mtd = mtdFor(state);
  const model = inferenceModel(state);
  const prov = PROVIDERS[inf.provider];
  const base = mtd.usd;
  const total = round2(base + mtd.extra);
  const prev = inf.hist.slice(-3);
  const avg = prev.length ? prev.reduce((a, h) => a + h.total, 0) / prev.length : base;
  const slice = state.apps.product;
  if (slice) { slice.inferenceMonth = total; slice.inferenceAccrued = 0; }
  if (total >= 0.01) post(state, { amount: -total, counterparty: prov.counterparty, description: `LLM API usage (AI features in production${mtd.extra > 0 ? `, incl. ${usd0(mtd.extra)} unusual traffic` : ''})`, category: 'ai_inference', method: 'card', meta: { provider: inf.provider, app: 'aicost', usage: true } });
  const alerts = inf.budget.alerts;
  if (mtd.extra >= Math.max(300, 0.5 * avg) && !alerts) {
    aiMistake(state, { functionId: 'ai_cost_management', id: 'no_spend_alerts', label: 'No spend alert on AI usage', cost: { usd: Math.round(mtd.extra), hours: 1.5 }, delayed: true, detail: `The month closed ${usd0(mtd.extra)} above normal and you found out from the invoice. A budget with alerts at 75% and 90% flags it the same day.`, key: `nosa:${mtd.month}` });
  }
  const mp = marginPicture(state, model);
  const capped = inf.limits.perUserMult != null;
  const flat = inf.pricing.mode === 'absorb' && !capped;
  if (flat && mp.underwaterLoss >= Math.max(50, 0.04 * mp.revenue) && model.total > 0) {
    aiMistake(state, { functionId: 'ai_cost_management', id: 'negative_margin_ai_users', label: 'Unlimited AI on a flat plan: heavy users cost more than they pay', cost: { usd: Math.round(mp.underwaterLoss * 3) }, delayed: true, detail: `The heaviest decile of users costs about ${usd0(mp.underwaterLoss)}/month more in inference than their plan brings in. Add a fair-use cap, credits or an AI add-on.`, key: `neg:${Math.floor(state.day / 90)}` });
  }
  const ft = inf.freeTier;
  if (ft.enabled && mtd.bots >= Math.max(100, 0.15 * total) && !ft.abuseGuard && (ft.capReqs == null || ft.capReqs > 120)) {
    aiMistake(state, { functionId: 'ai_cost_management', id: 'free_tier_abuse', label: 'Free AI tier farmed by scripts and heavy users', cost: { usd: Math.round(mtd.bots) }, detail: `About ${usd0(mtd.bots)} of this month's inference went to scripted free accounts. Cap free requests, verify signups and route free users to a small model.`, key: `fta:${mtd.month}` });
  }
  if (mtd.spikes > 0 && !capped && mtd.lastSpike?.kind === 'abuse') {
    aiMistake(state, { functionId: 'ai_cost_management', id: 'no_rate_limits', label: 'No per-user rate limits on AI endpoints', cost: { usd: Math.round(mtd.lastSpike.usd) }, detail: 'Anyone with a session can run unlimited requests. Per-user and per-IP limits turn a $ spike into a 429.', key: `nrl:${mtd.month}` });
  }
  passThrough(state, model);
  inf.hist.push({ month: mtd.month, total, base, extra: mtd.extra, free: mtd.free, bots: mtd.bots, perActiveUser: round2(model.perActiveUser), quality: round2(model.quality), byFeature: { ...mtd.byFeature }, byModel: { ...mtd.byModel } });
  if (inf.hist.length > 36) inf.hist.shift();
  // Users adapt to a quality level after a month: the reference bar ratchets up.
  for (const f of aiFeatures(state)) { const c = featureCfg(state, f); if (state.day - (c.sinceDay ?? 0) >= 30) c.baseQ = Math.max(c.baseQ ?? 0, qualityOf(c, inf.routing)); }
  deprecationMonth(state);
  applyQualityEffects(state);
  mtd.month = null;
  return { total, model };
}

function passThrough(state, model) {
  const inf = aiSlice(state).inf;
  const p = inf.pricing;
  const subs = activeSubs(state);
  setModifier(state, 'churn', 'ai-credit-friction', null);
  if (p.mode === 'absorb' || !subs.length) return;
  const custIds = [...new Set(subs.map((s) => s.customerId))];
  let revenue = 0, perCustomer = 0;
  if (p.mode === 'addon') {
    perCustomer = p.addonPrice;
    const a = model.adoption;
    const adopters = custIds.filter((id) => hashU(`addon|${id}`) < a);
    const scale = adopters.length > 400 ? adopters.length / 400 : 1;
    for (const id of adopters.slice(0, 400)) if (customerById(state, id)) { charge(state, id, { amount: round2(p.addonPrice * scale), description: 'AI add-on' }); revenue += p.addonPrice * scale; }
  } else if (p.mode === 'credits') {
    const c = model.paidUsers ? model.paid / model.paidUsers : 0; // avg cost per paid user
    // E[(cX - incl)+] via the same quantile sample as marginPicture
    let e = 0; const K = 60;
    for (let k = 0; k < K; k++) e += Math.max(0, c * Math.exp(-(USAGE_SIGMA ** 2) / 2 + USAGE_SIGMA * PhiInv((k + 0.5) / K)) - p.includedUsd);
    e /= K;
    const overageBilled = e * p.markup * model.paidUsers;
    perCustomer = custIds.length ? overageBilled / custIds.length : 0;
    const scale = custIds.length > 400 ? custIds.length / 400 : 1;
    if (perCustomer * scale >= 0.5) for (const id of custIds.slice(0, 400)) { charge(state, id, { amount: round2(perCustomer * scale), description: 'AI usage above included credits' }); revenue += perCustomer * scale; }
    const hitShare = shareAbove(USAGE_SIGMA, c > 0 ? p.includedUsd / c : 99);
    setModifier(state, 'churn', 'ai-credit-friction', hitShare > 0.01 ? round2(1 + PASS_THROUGH.creditChurnFriction * hitShare) : null);
  }
  inf.passRevenue = round2((inf.passRevenue ?? 0) + revenue);
}

export { MODEL_TIERS, TIER_ORDER, FEATURE_TYPES, PROVIDERS, mainPlan };
