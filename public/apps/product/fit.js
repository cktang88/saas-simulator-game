// True (hidden) product fit. The market reacts to what you actually shipped, whether or not you run a
// panel; the panel is only a noisy readout of this (docs/review/product-support-life.md P1/P2).
//
// Per shipped feature, value u ∈ [0,1] = relevance to the ICP × capability (does it remove the stated
// workaround, or just display data?), lightly adjusted by spec quality (≤10%). An LLM judges each feature
// once at ship (cached on the feature) and is blended with the heuristic. Fit has diminishing returns:
// trueFit = 1 − Π(1 − 0.35·u_i), then reduced by an ignored bug backlog. All constants are [design].

import { clamp } from '../../core/util.js';
import { ACTION, isStuffed, verbObjectHits } from './spec.js';

export const FIT = { perFeature: 0.35, bugPenaltyPerHour: 1 / 300, maxBugPenalty: 0.25, commoditized: 0.6, llmWeight: 0.6, max: 0.95 };

const STOP = new Set(['with', 'that', 'this', 'their', 'they', 'them', 'from', 'into', 'each', 'every', 'when', 'what', 'have', 'about', 'than', 'then', 'there', 'which', 'users', 'user', 'customers', 'people', 'small', 'business', 'businesses', 'company', 'companies']);
const toks = (s) => new Set(String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.replace(/s$/, '')));
const DISPLAY = /\b(show|shows|list|lists|display|displays|view|views|see|sees|dashboard|chart|charts|overview|page)\b/gi;
const AUTOMATE = /\b(send|sends|sync|syncs|match|matches|attach|attaches|import|imports|generate|generates|remind|reminds|schedule|schedules|reconcile|reconciles|notify|notifies|flag|flags|text|texts|email|emails|fill|fills|prefill|categori[sz]es?|extract|extracts|route|routes|assign|assigns|charge|charges|invoice|invoices|book|books|draft|drafts|chase|chases|collect|collects|retry|retries|approve|approves|post|posts|export|exports)\b/gi;
const TOOLS = /\b(quickbooks|qbo|xero|shopify|gmail|outlook|google (sheets|calendar|drive)|sheets|excel|jobber|stripe|salesforce|hubspot|slack|notion|airtable|zapier|whatsapp|square|toast|clio|epic|ga4|google analytics|freshbooks|wave|gusto|calendly|zoom|teams)\b/gi;
const TRIGGER = /(when|whenever|every|each|after|before|during|month[- ]end|weekly|daily|monthly|last (time|week|month)|per (week|month|day)|on (monday|friday|sunday))/i;
const WORKAROUND = /(spreadsheet|excel|sheet|manually|by hand|copy|paste|email|phone|paper|whatsapp|screenshot|chase|chasing|notes app|pinterest)/i;

// Heuristic value of one feature. icp: text; insights: research insights (only real ones matter).
export function heuristicValue(f, { icp = '', insights = [] } = {}) {
  const ict = toks(icp);
  const ft = toks(`${f.user} ${f.problem}`);
  const hits = [...ft].filter((w) => ict.has(w)).length;
  let relevance = ict.size ? Math.min(1, hits / 3) : 0.5;
  const realOverlap = insights.filter((i) => i.real).some((i) => [...toks(i.text)].filter((w) => ft.has(w)).length >= 2);
  if (realOverlap) relevance = Math.min(1, relevance + 0.2);

  const sol = `${f.solution ?? ''} ${(Array.isArray(f.acceptance) ? f.acceptance : []).join(' ')}`;
  const auto = (String(f.solution ?? '').match(AUTOMATE) ?? []).length;
  const disp = (String(f.solution ?? '').match(DISPLAY) ?? []).length;
  const anyAction = new RegExp(ACTION.source, 'i').test(f.solution ?? '');
  let capability = auto ? 0.5 : anyAction ? 0.35 : 0.15;
  if (!auto && disp) capability -= 0.25; // display-only: no state change, nothing removed from their week
  if (WORKAROUND.test(f.problem ?? '') && auto) capability += 0.25; // it automates the thing they do by hand
  if (TRIGGER.test(f.problem ?? '')) capability += 0.1;
  const named = new Set((`${f.problem} ${f.user}`.match(TOOLS) ?? []).map((x) => x.toLowerCase()));
  if ([...named].some((t) => sol.toLowerCase().includes(t))) capability += 0.15; // works inside the tool they already use
  if (isStuffed(f.solution ?? '')) capability *= 0.3; // a list of verbs is not a capability
  else if (auto && !verbObjectHits(f.solution ?? '', f.problem ?? '')) capability *= 0.7; // acts on nothing from the problem
  capability = clamp(capability, 0, 1);

  const q = clamp((f.grade?.total ?? 10) / 20, 0, 1);
  return clamp(relevance * capability * (0.9 + 0.1 * q), 0, 1);
}

export function featureValue(f, ctx) {
  // Stub features with no spec text (saves/tests that mark a feature shipped directly) keep the old neutral
  // "unjudged" fit of ~0.3 for a single feature.
  if (!f.solution && !f.problem) return 0.86;
  const h = heuristicValue(f, ctx);
  const v = typeof f.valueLLM === 'number' ? FIT.llmWeight * f.valueLLM + (1 - FIT.llmWeight) * h : h;
  return clamp(v * (f.commoditized ? FIT.commoditized : 1), 0, 1);
}

export function trueFit(features, { icp = '', insights = [], bugHours = 0 } = {}) {
  const shipped = features.filter((f) => f.status === 'shipped');
  if (!shipped.length) return 0;
  const miss = shipped.reduce((a, f) => a * (1 - FIT.perFeature * featureValue(f, { icp, insights })), 1);
  const bug = Math.min(FIT.maxBugPenalty, bugHours * FIT.bugPenaltyPerHour);
  return clamp((1 - miss) * (1 - bug), 0, FIT.max);
}

export const VALUE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['relevance', 'removesWorkaround', 'displayOnly', 'reason'],
  properties: {
    relevance: { type: 'number', description: '0-1: does the target customer actually have this problem, often enough to care?' },
    removesWorkaround: { type: 'number', description: '0-1: does the shipped behaviour remove the manual work they do today (vs. just showing data)?' },
    displayOnly: { type: 'boolean', description: 'true if it only shows/lists data the user already has, with no action or state change' },
    reason: { type: 'string' },
  },
};
export const valueFromJudgment = (d) => clamp((Number(d.relevance) || 0) * (0.3 + 0.7 * (Number(d.removesWorkaround) || 0)) * (d.displayOnly ? 0.6 : 1), 0, 1);
