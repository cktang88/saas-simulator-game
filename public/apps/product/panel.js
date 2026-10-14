// Customer panel (AI trial users), onboarding economics, churn-reason survey and feedback helpers. Pure.
//
// Sources: docs/research/hr-legal-product.md §3.4 (onboarding/activation), core/params.js ONBOARDING.
// Booking shares and feedback rates below are [A] design assumptions, not statistics.

import { clamp, words } from '../../core/util.js';
import { acceptanceList } from './spec.js';

// Share of new trials that accept/book an onboarding slot [A]. "Optional kickoff call" is offered to
// everyone but most self-serve users skip it; concierge is the pitch, so most accept.
export const BOOKING_SHARE = { self: 0, call: 0.35, concierge: 0.75 };
// When a booked call is not held (founder never joined), the trial converts worse than self-serve [A].
export const UNATTENDED_PENALTY = 0.7;
// Customer feedback stream [A]: chance per active account per day of an unsolicited email.
export const FEEDBACK = { perAccountDaily: 0.004, maxPerDay: 1, ignoreDays: 5, cancelIfIgnored: 0.25, surveyResponse: 0.3, cancelEmailShare: 0.4, winBack: 0.25, churnMultIfHelped: 0.7 };

export const PANEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['activated', 'ahaMoment', 'wouldPay', 'willingnessToPayMonthly', 'missingMustHaves', 'featureVerdicts', 'churnRisk', 'quote'],
  properties: {
    activated: { type: 'boolean', description: 'Did you reach a moment of real value during the trial?' },
    ahaMoment: { type: 'string', description: 'The specific moment you got value, or "none"' },
    wouldPay: { type: 'boolean', description: 'Would you pay the stated price when the trial ends?' },
    willingnessToPayMonthly: { type: 'number', description: 'USD per month you would realistically pay, 0 if nothing' },
    missingMustHaves: { type: 'array', items: { type: 'string' }, description: 'Things you need before paying' },
    featureVerdicts: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['feature', 'verdict'], properties: { feature: { type: 'string' }, verdict: { type: 'string', enum: ['useful', 'meh', 'irrelevant'] } } },
    },
    churnRisk: { type: 'number', description: '0-1: probability you cancel within 3 months if you do pay' },
    quote: { type: 'string', description: 'One blunt sentence in your own voice' },
  },
};

const ARCHETYPES = {
  b2c: ['a busy person who signed up from an ad on their phone and gives apps 2 minutes', 'a price-sensitive user who already uses a free alternative', 'an enthusiast who has tried several similar apps this year'],
  smb: ['a small-business owner who deals with this problem themselves after hours', 'an operations manager at a 20-person company evaluating tools for the team', 'a skeptical owner who churned from a similar SaaS tool last year'],
  ent: ['a director who would champion a new tool internally', 'a hands-on team lead who would use it daily', 'an IT/security reviewer who must approve new vendors'],
};

// Personas from the ICP plus up to two real CRM companies (using their fetched website text if present).
export function buildPersonas(state) {
  const icp = state.company.icp || state.company.oneLiner || 'the company\'s target customer';
  const out = (ARCHETYPES[state.company.model] ?? ARCHETYPES.smb).map((role, i) => ({ id: `icp${i}`, source: 'icp', name: null, role, context: icp }));
  const crm = state.apps.crm;
  if (crm?.companies?.length) {
    const cos = crm.companies.slice().sort((a, b) => (b.website?.text || b.siteText ? 1 : 0) - (a.website?.text || a.siteText ? 1 : 0)).slice(0, 2);
    for (const c of cos) {
      const contact = (crm.contacts ?? []).find((p) => p.companyId === c.id);
      const site = c.website?.text ?? c.siteText ?? c.site?.text ?? '';
      out.push({
        id: `crm_${c.id}`, source: 'crm', name: c.name, crmCompanyId: c.id,
        role: `${contact?.title || 'the person who would buy'} at ${c.name}${c.industry ? ` (${c.industry})` : ''}${c.size || c.employees ? `, ~${c.size ?? c.employees} employees` : ''}`,
        context: `${icp}\nAbout ${c.name}: ${String(site || c.description || c.notes || '').slice(0, 1200)}`,
      });
    }
  }
  return out;
}

// What a panelist is allowed to see: shipped specs, website text, price, onboarding mode. Nothing else.
export function trialBrief(state, features) {
  const site = state.company.website;
  const siteTxt = site ? [site.title, site.description, (site.headings ?? []).join(' | '), site.text].filter(Boolean).join('\n').slice(0, 4000) : '(no website)';
  const plans = state.plans.filter((p) => p.active).map((p) => `${p.name}: $${p.price}/${p.interval}${p.trialDays ? `, ${p.trialDays}-day trial` : ''}`).join('; ');
  const ob = { self: 'self-serve (no human help)', call: 'self-serve with an optional 30–45 min kickoff call with the founder', concierge: 'concierge: the founder sets it up with you (~2 hours)' }[state.market?.onboarding ?? 'self'];
  const feats = features.map((f, i) => `${i + 1}. ${f.title}\n   For: ${f.user}\n   Does: ${f.solution}\n   Details: ${acceptanceList(f).slice(0, 4).join(' / ')}`).join('\n');
  return `=== WEBSITE ===\n${siteTxt}\n=== PRICE ===\n${plans}${state.market?.cardRequired ? ' (card required to start the trial)' : ' (no card needed for the trial)'}\n=== ONBOARDING ===\n${ob}\n=== WHAT THE PRODUCT ACTUALLY DOES (shipped features only) ===\n${feats}`;
}

const tokens = (s) => new Set(String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const seedOf = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; };

// Deterministic offline panelist (same shape as PANEL_SCHEMA).
export function heuristicTrial(state, persona, features, { openBugHours = 0, refPrice = 79, priceMonthly = 79 } = {}) {
  const ctxT = tokens(`${persona.context} ${persona.role} ${state.company.oneLiner}`);
  const jitter = seedOf(persona.id + features.map((f) => f.id).join());
  const verdicts = features.map((f) => {
    const ft = tokens(`${f.user} ${f.problem} ${f.solution}`);
    const overlap = [...ft].filter((w) => ctxT.has(w)).length;
    const q = (f.grade?.total ?? 10) / 20;
    const u = 0.45 * q + 0.45 * Math.min(1, overlap / 4) + 0.1 * jitter - Math.min(0.2, openBugHours / 400);
    return { feature: f.title, verdict: u > 0.55 ? 'useful' : u > 0.38 ? 'meh' : 'irrelevant', u };
  });
  const useful = verdicts.filter((v) => v.verdict === 'useful').length;
  const usefulShare = features.length ? useful / features.length : 0;
  const ob = state.market?.onboarding ?? 'self';
  const skeptic = /skeptical|price-sensitive|security|churned/.test(persona.role);
  // Most trials never activate: calibrated so a decent single feature activates roughly a third of panelists [A].
  const pAct = clamp(0.1 + 0.4 * usefulShare + { self: 0, call: 0.1, concierge: 0.2 }[ob] - (state.company.website ? 0 : 0.1) - openBugHours / 400 - (skeptic ? 0.15 : 0) + Math.min(0.1, (useful - 1) * 0.05), 0.02, 0.85);
  const activated = useful > 0 && jitter < pAct;
  const wtp = Math.round(refPrice * (0.25 + 0.9 * usefulShare) * (0.6 + 0.6 * jitter) * (persona.role.includes('price-sensitive') ? 0.5 : 1) * (activated ? 1 : 0.5));
  const all = features.map((f) => `${f.solution} ${acceptanceList(f).join(' ')}`).join(' ').toLowerCase();
  const missing = [
    !/integrat|sync|import|connect|api/.test(all) && 'Works with the tools I already use (import/sync)',
    !/team|invite|share|role|permission/.test(all) && state.company.model !== 'b2c' && 'A way to share it with my team',
    !/export|csv|pdf|report/.test(all) && 'Export or a report I can show someone',
    openBugHours > 40 && 'It needs to stop breaking',
  ].filter(Boolean).slice(0, 2);
  return {
    activated,
    ahaMoment: activated ? `When "${verdicts.find((v) => v.verdict === 'useful')?.feature}" worked on my own data.` : 'none',
    wouldPay: activated && wtp >= priceMonthly && seedOf(persona.id + 'pay') < 0.7,
    willingnessToPayMonthly: wtp,
    missingMustHaves: missing,
    featureVerdicts: verdicts.map(({ feature, verdict }) => ({ feature, verdict })),
    churnRisk: clamp(0.75 - 0.5 * usefulShare + openBugHours / 500 - (activated ? 0.15 : 0), 0.05, 0.95),
    quote: activated ? 'It did one thing I need. Not sure yet it is worth the price.' : 'I poked around and did not see how this fits my week.',
  };
}

// Aggregate panelist results → product fit (0..1), median WTP of activated panelists, top must-haves.
export function aggregatePanel(results, priceMonthly) {
  const n = results.length;
  if (!n) return null;
  const rate = (fn) => results.filter(fn).length / n;
  const activation = rate((r) => r.activated);
  const payRate = rate((r) => r.wouldPay);
  const verdicts = results.flatMap((r) => r.featureVerdicts ?? []);
  const usefulShare = verdicts.length ? verdicts.filter((v) => v.verdict === 'useful').length / verdicts.length : 0;
  const churnRisk = results.reduce((a, r) => a + clamp(Number(r.churnRisk) || 0.5, 0, 1), 0) / n;
  const missingAvg = results.reduce((a, r) => a + (r.missingMustHaves?.length ?? 0), 0) / n;
  const score = clamp((0.3 * activation + 0.3 * usefulShare + 0.25 * payRate + 0.15 * (1 - churnRisk)) * clamp(1 - 0.08 * missingAvg, 0.6, 1), 0, 1);
  const wtps = results.filter((r) => r.activated && r.willingnessToPayMonthly > 0).map((r) => r.willingnessToPayMonthly).sort((a, b) => a - b);
  const wtp = wtps.length ? wtps[Math.floor(wtps.length / 2)] : null;
  const counts = {};
  for (const r of results) for (const m of r.missingMustHaves ?? []) { const k = String(m).trim(); if (k) counts[k] = (counts[k] ?? 0) + 1; }
  const mustHaves = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([text, count]) => ({ text, count }));
  const perFeature = {};
  for (const v of verdicts) { const p = (perFeature[v.feature] ??= { useful: 0, meh: 0, irrelevant: 0 }); p[v.verdict] = (p[v.verdict] ?? 0) + 1; }
  return { score, activation, payRate, usefulShare, churnRisk, wtp, mustHaves, perFeature, n, priceMonthly, useful: usefulShare >= 0.4 };
}

// ---- Churn-reason survey ----
export const CANCEL_CATEGORIES = {
  too_expensive: 'Too expensive for the value',
  missing_feature: 'Missing a feature I need',
  not_using: 'Didn\'t use it enough / never set it up',
  bugs: 'Bugs or reliability',
  switched: 'Switched to another tool (or a free AI feature)',
  no_longer_needed: 'No longer need it (business changed)',
  felt_ignored: 'Support didn\'t respond',
  payment_failed: 'Payment failed (involuntary)',
};
// Weighted reason for a cancellation given the current state of the product. rand: () => [0,1).
export function cancelCategory(rand, { reason, priceRatio = 1, productScore = 0.4, bugHours = 0, onboarding = 'self', wrapper = false }) {
  if (reason === 'felt_ignored') return 'felt_ignored';
  if (/payment|fail|past_due|declin/i.test(reason ?? '')) return 'payment_failed';
  const w = {
    too_expensive: 1 + 2 * Math.max(0, priceRatio - 1),
    missing_feature: 1 + 2 * (1 - productScore),
    not_using: (reason === 'trial_not_converted' ? 2.5 : 1) * (onboarding === 'self' ? 1.4 : 0.7),
    bugs: 0.3 + bugHours / 60,
    switched: 0.6 + (wrapper ? 1.5 : 0),
    no_longer_needed: 0.6,
  };
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
  return 'no_longer_needed';
}

// ---- Replies to customers (fallback judge for reply:customer) ----
export function heuristicReplyQuality(body, type) {
  const t = String(body ?? '').toLowerCase();
  const n = words(t);
  let s = 0.2;
  if (n >= 25) s += 0.15;
  if (n > 250) s -= 0.1;
  if (/\b(fixed|shipped|deployed|live now|patched|resolved)\b/.test(t)) s += 0.25;
  if (/\b(today|tomorrow|this week|by (monday|tuesday|wednesday|thursday|friday)|within \d+|in \d+ (hours|days))\b/.test(t)) s += 0.15;
  if (/\?/.test(t)) s += 0.1; // asks to understand
  if (/\b(sorry|apolog|my fault|our fault|thanks for)\b/.test(t)) s += 0.05;
  if (/\b(workaround|in the meantime|for now you can)\b/.test(t)) s += 0.1;
  if (type === 'cancel' && /\b(refund|discount|free month|credit|pause)\b/.test(t)) s += 0.15;
  if (/\b(we value your feedback|we will consider|on our roadmap|stay tuned)\b/.test(t) && n < 40) s -= 0.2; // canned
  return clamp(s, 0, 1);
}
