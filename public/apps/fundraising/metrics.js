// Metrics sheet built from the real simulation (bank, Stripe, people, product, market). Pure (no DOM).
// This is what investors see as GAME_TRACTION; it overrides anything the deck claims.

import { mrr as stripeMrr, activeSubs } from '../../core/stripe.js';
import { totalCash } from '../../core/bank.js';
import { legalIssues } from '../legal/sim.js';
import { landscape } from './world.js';

const FINANCING = ['investment', 'owner_contribution', 'loan', 'loan_repayment', 'grant'];

function mrrAt(state, daysAgo) {
  const d = state.metrics?.daily ?? [];
  if (!d.length) return null;
  const target = state.day - daysAgo;
  if (d[0].day > target) return null;
  let best = d[0];
  for (const x of d) if (x.day <= target) best = x; else break;
  return best.mrr;
}

export function teamMembers(state) {
  return (state.apps.people?.members ?? []).filter((m) => m.status === 'active');
}

export function computeMetrics(state) {
  const mrr = state.stripe ? stripeMrr(state) : 0;
  const customers = state.stripe ? activeSubs(state).length : 0;
  const m30 = mrrAt(state, 30), m90 = mrrAt(state, 90), m365 = mrrAt(state, 365);
  let momGrowth = null;
  if (m90 != null && m90 > 0) momGrowth = Math.pow(mrr / m90, 1 / 3) - 1;
  else if (m30 != null && m30 > 0) momGrowth = mrr / m30 - 1;
  const yoyGrowth = m365 != null && m365 > 0 ? mrr / m365 - 1 : momGrowth != null ? Math.pow(1 + momGrowth, 12) - 1 : null;

  // MRR movements over the last 30 days (Stripe events).
  const ev = (state.stripe?.events ?? []).filter((e) => e.day > state.day - 30);
  const by = (t) => ev.filter((e) => e.type === t).reduce((a, e) => a + e.amount, 0);
  const churned = -by('churn'), contraction = -by('contraction'), expansion = by('expansion'), newMrr = by('new');
  const base = m30 ?? mrr;
  const revenueChurn = base > 0 ? churned / base : null;
  const logoChurn = base > 0 ? ev.filter((e) => e.type === 'churn').length / Math.max(1, customers + ev.filter((e) => e.type === 'churn').length - ev.filter((e) => e.type === 'new').length) : null;
  const nrrMonthly = base > 0 ? (base + expansion - contraction - churned) / base : null;
  const nrr = nrrMonthly != null ? Math.pow(Math.max(0, nrrMonthly), 12) : null;

  // Burn: net cash change over ~30 days excluding financing flows.
  const since = state.day - 30;
  const txns = (state.bank?.txns ?? []).filter((t) => t.day > since);
  const opNet = txns.filter((t) => !FINANCING.includes(t.category) && t.category !== 'owner_draw').reduce((a, t) => a + t.amount, 0);
  const draws = txns.filter((t) => t.category === 'owner_draw').reduce((a, t) => a + t.amount, 0);
  const burn = -(opNet + draws); // > 0 means burning
  const cash = state.bank ? totalCash(state) : 0; // checking + Treasury: idle cash swept to Treasury is still runway
  const runwayMonths = burn > 0 ? cash / burn : Infinity;

  // Gross margin: Stripe revenue (30d) minus fees, inference and hosting.
  const charges = (state.stripe?.charges ?? []).filter((c) => c.day > since && c.status === 'succeeded');
  const revenue30 = charges.reduce((a, c) => a + c.amount, 0);
  const fees = charges.reduce((a, c) => a + (c.fee ?? 0), 0);
  const cogs = -txns.filter((t) => t.category === 'ai_inference' || t.category === 'hosting').reduce((a, t) => a + t.amount, 0);
  const grossMargin = revenue30 > 0 ? (revenue30 - fees - cogs) / revenue30 : null;
  const netNewArr = (mrr - (m30 ?? mrr)) * 12;
  const burnMultiple = burn > 0 && netNewArr > 0 ? burn / netNewArr : burn <= 0 ? 0 : null;

  const members = teamMembers(state);
  const humans = members.filter((m) => m.kind !== 'ai_agent');
  const teamSize = 1 + humans.length;
  const fte = 1 + humans.reduce((a, m) => a + Math.min(1, (m.hoursPerWeek ?? 40) / 40), 0);
  const aiAgents = members.filter((m) => m.kind === 'ai_agent').length;
  const shippedFeatures = (state.apps.product?.features ?? []).filter((f) => f.status === 'shipped').length;
  // Late-stage B2B pipeline from the CRM: paid pilots/trials and contracts out count as LOI-grade evidence at pre-seed.
  const deals = (state.apps.crm?.deals ?? []).filter((d) => d.stage === 'proposal' || d.stage === 'contract');
  const pilots = deals.filter((d) => d.stage === 'proposal').length, lois = deals.filter((d) => d.stage === 'contract').length;
  const fit = state.market?.fit ?? {};
  // Solo unless someone holds co-founder-sized equity (≥10%).
  const solo = !members.some((m) => m.kind === 'cofounder') && !humans.some((m) => (m.equityPct ?? 0) >= 10);
  const cofounders = members.filter((m) => m.kind === 'cofounder').length;
  return {
    mrr, arr: mrr * 12, customers, momGrowth, yoyGrowth, revenueChurn, logoChurn, nrr, newMrr, expansion, churned,
    burn, cash, runwayMonths, grossMargin, burnMultiple, revenue30,
    teamSize, fte, aiAgents, revenuePerFte: (mrr * 12) / fte, shippedFeatures,
    websiteFit: fit.website?.score ?? null, productFit: fit.product?.score ?? null, wtp: fit.price?.wtp ?? null,
    ageMonths: state.day / 30.4, solo, cofounders, pilots, lois,
    model: state.company.model, entity: state.company.entity ?? 'none',
    landscape: landscape(state),
    legal: (() => { try { return legalIssues(state); } catch { return []; } })(),
    isAI: /\b(ai|agent|llm|gpt|model|copilot|automat)/i.test(`${state.company.oneLiner} ${state.company.icp}`),
  };
}

const p = (v) => (v == null || !Number.isFinite(v) ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const usd = (v) => (v == null || !Number.isFinite(v) ? 'n/a' : `$${Math.round(v).toLocaleString('en-US')}`);

// opts.landscape=false omits the competitor list (for a single investor who only knows some of them).
export function metricsSheet(m, { landscape = true } = {}) {
  return [
    `MRR: ${usd(m.mrr)} (ARR ${usd(m.arr)}); paying customers: ${m.customers}`,
    `MRR growth (avg MoM, last 3 months): ${p(m.momGrowth)}; YoY: ${p(m.yoyGrowth)}`,
    `Revenue churn (last 30d): ${p(m.revenueChurn)}; annualized NRR: ${p(m.nrr)}`,
    `Gross margin after payment fees, inference, hosting: ${p(m.grossMargin)}`,
    `Net burn per month: ${m.burn > 0 ? usd(m.burn) : 'none (cash-flow positive)'}; cash: ${usd(m.cash)}; runway: ${Number.isFinite(m.runwayMonths) ? `${m.runwayMonths.toFixed(1)} months` : 'default alive'}`,
    `Burn multiple: ${m.burnMultiple == null ? 'n/a' : m.burnMultiple.toFixed(2)}`,
    `Team: ${m.teamSize} people (${m.solo ? 'solo founder' : `founding team of ${1 + (m.cofounders ?? 0)}`}), ${m.aiAgents} AI agents; revenue per FTE ${usd(m.revenuePerFte)}`,
    `Company age: ${m.ageMonths.toFixed(1)} months; features shipped: ${m.shippedFeatures}`,
    `Late-stage B2B pipeline (CRM): ${m.pilots ?? 0} in proposal/paid pilot, ${m.lois ?? 0} with contract/LOI out`,
    `Customer-panel fit (0-1, from simulated customers): website ${m.websiteFit == null ? 'not tested' : m.websiteFit.toFixed(2)}, product ${m.productFit == null ? 'not tested' : m.productFit.toFixed(2)}`,
    `Legal entity: ${m.entity}`,
    !landscape ? null : m.landscape?.competitors?.length ? `Competitive landscape (${m.landscape.real ? 'from web research' : 'game estimate'}; funding and share are ESTIMATES): ${m.landscape.competitors.map((c) => `${c.name} (${c.funding}, ~${Math.round(c.share * 100)}% share)`).join('; ')}. Crowdedness: ${m.landscape.crowdedness}; maturity: ${m.landscape.maturity}${m.landscape.statusQuo ? `; status quo: ${m.landscape.statusQuo}` : ''}.` : `Competitive landscape: not researched yet${m.landscape?.statusQuo ? `; status quo: ${m.landscape.statusQuo}` : ''}.`,
    `Legal diligence issues: ${m.legal?.length ? m.legal.join(' | ') : 'none found'}`,
  ].filter((x) => x != null).join('\n');
}

// Suggested stage from traction and history.
export function suggestStage(m, hasPricedSeed = false) {
  if (hasPricedSeed || m.arr >= 1e6) return 'series-a';
  if (m.mrr >= 10000) return 'seed';
  return 'pre-seed';
}
