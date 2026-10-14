// Pure model for the market & world-event engine: the player's exposure profile (model, stage, path,
// AI dependence, exposure flags), effective event rates per docs/research/world-ops-support-life.md
// conventions, drawing effect values, interpreting player-response hints, competitor-landscape templates
// and the competitive-pressure multiplier. No state mutation except reading; randomness passed as `rand`.

import { companyStage } from '../../core/network.js';
import { shippedFeatures } from '../../core/market.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The categories this app owns. life/security/ops events belong to core wellbeing and the Helpdesk/Insights apps.
export const HANDLED_CATEGORIES = ['competitor', 'platform', 'ai_lab', 'macro', 'reputation'];

// ---- Exposure profile ----

const VERTICAL_WORDS = /\b(dental|dentist|clinic|medical|health ?care|law ?firm|lawyer|legal|accountant|bookkeep|shopify|restaurant|salon|plumb|hvac|contractor|real ?estate|realt|construction|church|school|teacher|insurance|logistics|trucking|fleet|veterinar|pharma|hotel|gym|fitness studio|nonprofit|agency|agencies|ecommerce store|farm|manufactur|property manag|mortgage|recruit)\w*/i;
const HORIZONTAL_WORDS = /\b(notes?|note-taking|writing|summar|chat with|search|productivity|to-?do|task|calendar|email|meeting|transcri|crm|project management|docs|documents|browser|assistant|agent|workflow automation|scheduling|forms?)\b/i;

export function nicheType(state) {
  const t = `${state.company.oneLiner} ${state.company.icp}`;
  if (state.company.model === 'b2c') return 'consumer';
  if (state.company.model === 'ent') return 'enterprise';
  if (VERTICAL_WORDS.test(t)) return 'vertical';
  return 'horizontal';
}

// none | feature | core | wrapper — share of shipped features that run AI at runtime.
export function aiDependence(state) {
  const f = shippedFeatures(state);
  if (!f.length) return 'none';
  const ai = f.filter((x) => x.ai?.enabled);
  const share = ai.length / f.length;
  if (share === 0) return 'none';
  if (share < 0.34) return 'feature';
  if (share >= 0.8 && nicheType(state) !== 'vertical' && f.length <= 3) return 'wrapper';
  return 'core';
}

export function exposureFlags(state) {
  const A = state.apps;
  const meta = A.ads?.accounts?.meta;
  const ch = A.channels ?? {};
  const listings = [ch.listings, ch.marketplaces, ch.integrations].filter(Array.isArray).flat();
  const helpdesk = A.helpdesk ?? A.support ?? null;
  const reviews = A.reviews?.items ?? A.helpdesk?.reviews ?? [];
  const nt = nicheType(state);
  return {
    usesSEO: (A.organic?.articles?.length ?? 0) > 0,
    runsMetaAds: Boolean(meta && (meta.lifetime > 0 || (A.ads.campaigns ?? []).some((c) => c.p === 'meta' && c.status === 'active'))),
    hasIOSApp: state.company.model === 'b2c' && shippedFeatures(state).length > 0, // the B2C model is a subscription app
    selfServeCheckout: state.company.model !== 'ent',
    usesLLMApi: shippedFeatures(state).some((f) => f.ai?.enabled),
    hasInvestors: state.bank.txns.some((t) => t.category === 'investment'),
    marketplaceDependent: listings.some((l) => l && !['draft', 'removed', 'rejected'].includes(l.status)),
    horizontalProduct: nt === 'horizontal' || (nt === 'consumer' && !VERTICAL_WORDS.test(state.company.oneLiner)),
    verticalProduct: nt === 'vertical',
    proprietaryData: Boolean(state.apps.world?.proprietaryData),
    verifiedBusiness: Boolean(state.apps.world?.verifiedBusiness),
    usesAdAutomationAgent: false,
    slowSupport: Boolean(helpdesk && (helpdesk.medianFrtHours ?? 0) > 24),
    recentOutage: Boolean(helpdesk?.lastOutageDay != null && state.day - helpdesk.lastOutageDay < 30),
    reviews20Recent: reviews.filter((r) => state.day - (r.day ?? -999) < 365).length >= 20,
  };
}

export function profile(state) {
  return { model: state.company.model, stage: companyStage(state), path: state.company.path, aiDependence: aiDependence(state), flags: exposureFlags(state) };
}

// ---- Rates ----

// Effective events per year: base × model × stage × path × aiDependence × Π exposure; requires = hard gates.
export function eventRate(ev, p, rateMult = 1) {
  const c = ev.conditions ?? {};
  if ((c.requires ?? []).some((f) => !p.flags[f])) return 0;
  let r = ev.baseRatePerYear ?? 0;
  r *= c.model?.[p.model] ?? 1;
  r *= c.stage?.[p.stage] ?? 1;
  r *= c.path?.[p.path] ?? 1;
  r *= c.aiDependence?.[p.aiDependence] ?? 1;
  for (const [k, m] of Object.entries(c.exposure ?? {})) if (p.flags[k]) r *= m;
  return Math.max(0, r * rateMult);
}

// Competitor events scale mildly with how many active rivals you have (reference niche ≈ 5) [design].
export const RIVAL_SCALED = ['competitor_raise', 'competitor_price_cut', 'competitor_feature_copy', 'competitor_exit'];
export const rivalFactor = (n) => clamp(Math.sqrt(Math.max(0, n) / 5), 0.4, 2);

// ---- Effects ----

// Keys where a higher value hurts the player.
export const BAD_HIGH = new Set(['churnMult', 'voluntaryChurnMult', 'paidCpcMult', 'ticketsMult', 'salesCycleMult', 'discountRequests', 'errorRate', 'investorConcern', 'inferenceCostMult', 'requiresMigrationHours', 'migrationHours', 'releaseDelayDays', 'rebuildHours', 'inferenceCostIncreaseUSDPerMonth', 'durationHours']);
// Numeric multipliers we apply or expose (everything else in `effects` is narrative or a one-off).
export const MULT_KEYS = ['conversionMult', 'signupMult', 'organicShareMult', 'organicTrafficMult', 'churnMult', 'voluntaryChurnMult', 'paidCpcMult', 'b2bInboundMult', 'salesCycleMult', 'expansionMult', 'paidMetaSpendMult', 'inferenceCostMult', 'raiseOddsMult', 'valuationMult', 'aiReferralMult', 'marketplaceLeadsMult', 'ticketsMult', 'checkoutConversionMult', 'errorRate', 'discountRequests', 'investorConcern'];

// Draw every ranged effect. resilience 0..1 (website/product fit, content quality) pushes draws toward the
// better end of each range; noise keeps outcomes uncertain.
export function drawEffects(ev, resilience, rand) {
  const out = {};
  for (const [k, v] of Object.entries(ev.effects ?? {})) {
    if (k === 'text' || k === 'durationDays') continue;
    if (Array.isArray(v) && typeof v[0] === 'number') {
      const t = clamp(0.5 * resilience + 0.5 * rand(), 0, 1);
      const good = BAD_HIGH.has(k) ? 1 - t : t;
      out[k] = +(v[0] + (v[1] - v[0]) * good).toFixed(3);
    } else if (typeof v === 'number') out[k] = v;
  }
  return out;
}

// Apply one response hint to the current effects. Returns a short note when the hint is narrative only.
export function applyHint(effects, key, hint, rand) {
  if (hint === 'keep' || hint == null) return null;
  const cur = effects[key];
  if (typeof hint === 'number') { effects[key] = hint; return null; }
  if (Array.isArray(hint) && typeof hint[0] === 'number') { effects[key] = +(hint[0] + (hint[1] - hint[0]) * rand()).toFixed(3); return null; }
  if (typeof hint === 'string') {
    const m = hint.match(/^([+\-×x*])\s*([\d.]+)/);
    if (m) {
      const n = parseFloat(m[2]);
      if (m[1] === '+' || m[1] === '-') {
        const base = cur ?? (key.endsWith('Mult') ? 1 : 0);
        effects[key] = +(base + (m[1] === '+' ? n : -n)).toFixed(3);
      } else effects[key] = +((cur ?? 1) * n).toFixed(3);
      return null;
    }
    return `${key}: ${hint}`;
  }
  return null;
}

export const resilienceOf = (state) => {
  const f = state.market?.fit ?? {};
  const w = f.website?.score ?? 0.35, pr = f.product?.score ?? 0.3;
  return clamp((w + pr) / 2, 0, 1);
};

// ---- Competitor landscape ----

const PRE = ['Tally', 'Ledger', 'Pilot', 'North', 'Brisk', 'Clear', 'Orbit', 'Nimbus', 'Kite', 'Harbor', 'Lumen', 'Sprout', 'Beacon', 'Quill', 'Atlas', 'Mosaic', 'Relay', 'Cobalt', 'Juniper', 'Vela'];
const SUF = ['ly', 'hq', 'flow', 'loop', 'stack', 'base', 'wise', 'kit', 'desk', 'hub', 'io', 'labs', 'works', 'ify'];
const FUNDING = { bootstrapped: [0, 0], seed: [1.5e6, 6e6], series_a: [8e6, 25e6], series_b_plus: [30e6, 120e6], public_incumbent: [0, 0] };

// Research §1.1 [design]: vertical B2B 2–6; horizontal SMB 5–15; B2C 10–40 (3–6 matter); ent 3–8 + 1–3 funded.
export function landscapeSize(nt, rand) {
  const r = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  if (nt === 'vertical') { const n = r(2, 6); return { total: n, notable: n }; }
  if (nt === 'horizontal') { const n = r(5, 15); return { total: n, notable: Math.min(n, 7) }; }
  if (nt === 'consumer') return { total: r(10, 40), notable: r(3, 6) };
  const n = r(3, 8) + r(1, 3);
  return { total: n, notable: Math.min(n, 8) };
}

export function templateCompetitors(state, rand, n, nt) {
  const myPrice = state.plans?.find((p) => p.active)?.price ?? 49;
  const used = new Set();
  const out = [];
  for (let i = 0; i < n; i++) {
    let name;
    do { name = PRE[Math.floor(rand() * PRE.length)] + SUF[Math.floor(rand() * SUF.length)]; } while (used.has(name));
    used.add(name);
    const funding = nt === 'enterprise' && i < 3 ? (rand() < 0.5 ? 'public_incumbent' : 'series_b_plus')
      : rand() < (state.company.path === 'vc' || nt === 'enterprise' ? 0.55 : 0.4) ? (rand() < 0.6 ? 'seed' : 'series_a') : 'bootstrapped';
    const [lo, hi] = FUNDING[funding];
    out.push({
      name, domain: `${name.toLowerCase()}.${rand() < 0.5 ? 'com' : rand() < 0.5 ? 'io' : 'app'}`, funding,
      raisedUsd: hi ? Math.round((lo + rand() * (hi - lo)) / 1e5) * 1e5 : 0,
      priceMonthly: Math.round(myPrice * (0.5 + rand() * 1.5) * (state.plans?.[0]?.interval === 'year' ? 1 / 12 : 1)),
      freeTier: rand() < (nt === 'consumer' ? 0.5 : 0.25),
      positioning: funding === 'public_incumbent' || funding === 'series_b_plus'
        ? ['the long-standing incumbent most buyers already know', 'the enterprise-grade suite with SSO, audit logs and a sales team'][Math.floor(rand() * 2)]
        : ['the all-in-one option for teams that want everything in one place', 'the cheapest option, aimed at solo users', 'the AI-first newcomer promising automation', 'a niche specialist for one segment', 'the simple, opinionated tool with fast setup'][Math.floor(rand() * 5)],
      strengths: [['brand recognition', 'integrations', 'polished onboarding', 'low price', 'sales team', 'big template library'][Math.floor(rand() * 6)]],
      weaknesses: [['slow support', 'clunky UI', 'expensive add-ons', 'no mobile app', 'shallow reporting', 'frequent outages'][Math.floor(rand() * 6)]],
      founded: 2014 + Math.floor(rand() * 12),
    });
  }
  return out;
}

// Threat of one rival 0..1 [design]: funding and incumbency raise it, a free tier raises it for self-serve.
export function threatOf(c, model) {
  const f = { bootstrapped: 0.35, seed: 0.45, series_a: 0.6, series_b_plus: 0.75, public_incumbent: 0.7 }[c.funding] ?? 0.4;
  return clamp(f + (c.freeTier && model !== 'ent' ? 0.1 : 0) + (c.momentum ?? 0), 0.05, 1);
}

// Landing/deal multiplier from the whole landscape relative to a typical niche (baseline rates already assume
// competition): more, stronger rivals than usual → below 1; an empty niche → slightly above 1 [design].
export function pressureMult(rivals, model) {
  const active = rivals.filter((c) => c.status === 'active');
  const threat = active.reduce((a, c) => a + threatOf(c, model), 0);
  const expected = { b2c: 2.2, smb: 2.5, ent: 3 }[model] ?? 2.5;
  return clamp(1 - 0.03 * (threat - expected), 0.85, 1.08);
}

// ---- Battlecards / alternatives pages: offline judge ----

export function pageHeuristic(text, rivalName, myName) {
  const t = String(text ?? '');
  const lower = t.toLowerCase();
  const n = t.trim().split(/\s+/).filter(Boolean).length;
  const trash = /(terrible|garbage|scam|sucks|awful|worst|joke|overpriced trash)/i.test(t);
  const specifics = (t.match(/\d+(\.\d+)?\s?(%|\$|hours?|minutes?|days?|seats?)|\$\s?\d+/gi) ?? []).length;
  const mentionsRival = rivalName && lower.includes(rivalName.toLowerCase());
  const whenTheyWin = /(choose them|pick them|better fit|if you need|they are better|where they win|not a fit)/i.test(t);
  const structure = (t.match(/^\s*(#|-|\*|\d+\.)/gm) ?? []).length;
  const accuracy = clamp(5 + Math.min(3, specifics * 0.6) - (trash ? 3 : 0), 1, 10);
  const differentiation = clamp(3 + (mentionsRival ? 1.5 : 0) + Math.min(3, specifics * 0.5) + (lower.includes(String(myName).toLowerCase()) ? 1 : 0), 1, 10);
  const usefulness = clamp(2.5 + Math.min(4, n / 120) + Math.min(2, structure * 0.3) + (whenTheyWin ? 1.5 : 0), 1, 10);
  const fairness = clamp(6 + (whenTheyWin ? 3 : 0) - (trash ? 5 : 0), 1, 10);
  return {
    accuracy, differentiation, usefulness, fairness, trashTalk: trash,
    feedback: trash ? 'Trash-talking reads as insecure and gets screenshotted. State differences buyers can verify.' : whenTheyWin ? 'Honest about when the rival fits: buyers trust the rest more.' : 'Add where the rival is the better choice, and concrete, checkable differences (price, setup time, a workflow).',
  };
}
export const pageScore = (r) => clamp((r.accuracy + r.differentiation * 1.2 + r.usefulness + r.fairness * 0.8) / 40 - (r.trashTalk ? 0.15 : 0), 0, 1);
