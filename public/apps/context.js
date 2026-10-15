// Shared business facts for LLM prompts. Every judge and role-play should reason about THIS company, not a
// generic one, but only with what that person could realistically know:
//   'public'   – anyone: name, one-liner, what the website says, public pricing, kind of business.
//   'customer' – public + being a paying customer (they know the product and their plan; not your metrics).
//   'insider'  – you, your assistant, co-founder candidates you're courting, your team, investors with
//                information rights, and graders reviewing your own work: plus ICP, stage, traction, money, team.
// Cold prospects, interviewees and strangers judging an email or post get nothing from here beyond what the
// owning app already shows them (their own website, the message in front of them). That asymmetry is the game.

import { MODELS, PATHS } from '../core/state.js';
import { computeMetrics } from './fundraising/metrics.js';
import { CANCEL_CATEGORIES } from './product/panel.js';

const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (x) => `${Math.round(x * 1000) / 10}%`;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
// "a (3), b (2)" for the most common values, most frequent first.
const tally = (vals, n = 3) => Object.entries(vals.reduce((o, v) => ((o[v] = (o[v] ?? 0) + 1), o), {}))
  .sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k} (${c})`).join(', ');

function plansLine(state) {
  const plans = (state.plans ?? []).filter((p) => p.active !== false);
  if (!plans.length) return '';
  return plans.map((p) => `${p.name} ${usd(p.price)}/${p.interval === 'year' ? 'yr' : 'mo'}${p.trialDays ? ` (${p.trialDays}-day trial)` : ''}`).join('; ');
}

/** Plain-text facts block for a system prompt. Returns '' when there is nothing useful to say. */
export function bizContext(state, level = 'public', { maxChars = 1800 } = {}) {
  const c = state.company ?? {};
  const lines = [];
  lines.push(`Company: ${c.name}${c.domain ? ` (${c.domain})` : ''}, a ${MODELS[c.model]?.label ?? 'SaaS company'}.`);
  if (c.oneLiner) lines.push(`What it does: ${clip(c.oneLiner, 300)}`);
  const site = c.website;
  if (site && (site.title || site.description)) lines.push(`Website says: ${clip([site.title, site.description].filter(Boolean).join(' — '), 300)}`);
  const plans = plansLine(state);
  if (plans) lines.push(`Public pricing: ${plans}.`);

  if (level === 'customer') lines.push('You are a paying customer: you know the product from using it, not the company\'s internal numbers.');

  if (level === 'insider') {
    if (c.icp) lines.push(`Target customer (ICP): ${clip(c.icp, 300)}`);
    lines.push(`Path: ${PATHS[c.path]?.label ?? c.path}. Day ${state.day} of the company.${c.incorporated ? ` Incorporated (${c.entity ?? 'entity'}).` : ' Not incorporated yet.'}`);
    let m = null;
    try { m = computeMetrics(state); } catch { /* metrics are best-effort */ }
    if (m) {
      const t = [`MRR ${usd(m.mrr)}`, `${m.customers} paying customer${m.customers === 1 ? '' : 's'}`];
      if (m.momGrowth != null) t.push(`${pct(m.momGrowth)} MoM growth`);
      if (m.revenueChurn != null) t.push(`${pct(m.revenueChurn)} revenue churn (30d)`);
      if (m.grossMargin != null) t.push(`${pct(m.grossMargin)} gross margin`);
      lines.push(`Traction: ${t.join(', ')}.`);
      const money = [`cash ${usd(m.cash)}`];
      if (m.burn > 0) money.push(`burn ${usd(m.burn)}/mo`, `runway ${Number.isFinite(m.runwayMonths) ? `${m.runwayMonths.toFixed(1)} months` : 'n/a'}`);
      else money.push('not burning cash');
      lines.push(`Money: ${money.join(', ')}.`);
      lines.push(`Team: founder${m.teamSize > 1 ? ` + ${m.teamSize - 1} people` : ' only'}${m.aiAgents ? `, ${m.aiAgents} AI agent${m.aiAgents > 1 ? 's' : ''}` : ''}.`);
    }
    const shipped = (state.apps?.product?.features ?? []).filter((f) => f.status === 'shipped').slice(-5).map((f) => clip(f.title ?? f.name, 60)).filter(Boolean);
    if (shipped.length) lines.push(`Recently shipped: ${shipped.join('; ')}.`);
    // What the founder can see (stated reasons and ticket categories), never the hidden true churn reason.
    const tickets = (state.apps?.support?.tickets ?? []).filter((t) => t.createdDay > state.day - 30);
    if (tickets.length) lines.push(`Support (30d): ${tickets.length} ticket${tickets.length > 1 ? 's' : ''}; most common: ${tally(tickets.map((t) => String(t.category ?? 'other').replace(/_/g, ' ')))}.`);
    const exits = (state.apps?.customers?.surveys ?? []).filter((x) => x.day > state.day - 90 && !x.trial && x.category && x.category !== 'no_answer');
    if (exits.length) lines.push(`Cancellation reasons customers gave (90d): ${tally(exits.map((x) => CANCEL_CATEGORIES[x.category] ?? x.category))}.`);
  }
  const out = lines.join('\n');
  return out.length > maxChars ? `${out.slice(0, maxChars - 1)}…` : out;
}

/** The block, wrapped with a header that tells the model these are facts, not suggestions. */
export const bizBlock = (state, level, opts) => {
  const b = bizContext(state, level, opts);
  return b ? `\n\nBUSINESS FACTS (ground truth; do not invent other facts about this company):\n${b}` : '';
};
