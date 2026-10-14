// True (hidden) product fit. The market reacts to what you actually shipped, whether or not you run a
// panel; the panel is only a noisy readout of this (docs/review/product-support-life.md P1/P2).
//
// Per shipped feature, value u ∈ [0,1] = relevance to the ICP × capability (does it remove the stated
// workaround, or just display data?), lightly adjusted by spec quality (≤10%). An LLM judges each feature
// once at ship (cached on the feature) and is blended with the heuristic.
//
// Evidence and customer contact decide how much of that value is real (operator-tiers-audit fix 5,
// calibration.md free mistakes 1/3/6, R3):
//  - evidence factor 0.6 + 0.4 × strength of the REAL insights the spec links (verified 1, self-reported ½,
//    commitments extra), so a fluent spec that mirrors ICP words no longer scores like a validated one;
//  - features shipped without evidence risk being unwanted (value × 0.3), drawn once at ship;
//  - real interviews in the 8 weeks before ship lift a feature's value by up to 1.3×;
//  - an "everyone" ICP caps relevance at 0.6;
//  - fit is capped by the quality of your best features (shipping 40 weak features does not reach 0.95)
//    and decays when you stop talking to customers.
// Fit has diminishing returns: trueFit = min(ceiling, 1 − Π(1 − 0.35·u_i)) × bug and contact factors.
// All constants are [design], not measured statistics.

import { clamp } from '../../core/util.js';
import { ACTION, isStuffed, verbObjectHits } from './spec.js';

export const FIT = {
  perFeature: 0.35, bugPenaltyPerHour: 1 / 300, maxBugPenalty: 0.25, commoditized: 0.6, llmWeight: 0.6, max: 0.95,
  evidenceFloor: 0.6, // value multiplier with zero real evidence (audit fix 5: 0.6 + 0.4 × strength)
  unwantedMult: 0.3, unwantedBase: 0.35, // P(unwanted) = 0.35 × (1 − strength) at ship [design, calibration R3b]
  contactBoostMax: 0.3, contactInterviews: 6, contactWindow: 56, // up to 1.3× with ≥6 real interviews in 8 weeks
  broadIcpCap: 0.6,
  ceilingTop: 5, ceilingRef: 0.6, // fit ≤ max × mean(top-5 values)/0.6
  decayGraceDays: 45, decayDays: 120, decayFloor: 0.65, // fit × 0.65 after ~5.5 months without customer contact
  bloatPer: 0.02, bloatMax: 0.2, // kept features that failed their metric / were unwanted add clutter
};

const STOP = new Set(['with', 'that', 'this', 'their', 'they', 'them', 'from', 'into', 'each', 'every', 'when', 'what', 'have', 'about', 'than', 'then', 'there', 'which', 'users', 'user', 'customers', 'people', 'small', 'business', 'businesses', 'company', 'companies']);
export const toks = (s) => new Set(String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.replace(/s$/, '')));
const DISPLAY = /\b(show|shows|list|lists|display|displays|view|views|see|sees|dashboard|chart|charts|overview|page)\b/gi;
const AUTOMATE = /\b(send|sends|sync|syncs|match|matches|attach|attaches|import|imports|generate|generates|remind|reminds|schedule|schedules|reconcile|reconciles|notify|notifies|flag|flags|text|texts|email|emails|fill|fills|prefill|categori[sz]es?|extract|extracts|route|routes|assign|assigns|charge|charges|invoice|invoices|book|books|draft|drafts|chase|chases|collect|collects|retry|retries|approve|approves|post|posts|export|exports)\b/gi;
const TOOLS = /\b(quickbooks|qbo|xero|shopify|gmail|outlook|google (sheets|calendar|drive)|sheets|excel|jobber|stripe|salesforce|hubspot|slack|notion|airtable|zapier|whatsapp|square|toast|clio|epic|ga4|google analytics|freshbooks|wave|gusto|calendly|zoom|teams)\b/gi;
const WORKAROUND = /(spreadsheet|excel|sheet|manually|by hand|copy|paste|email|phone|paper|whatsapp|screenshot|chase|chasing|notes app|pinterest)/i;

// "Everyone" ICPs (calibration free mistake 3): no role or segment narrower than "businesses/people".
const BROAD = /\b(everyone|everybody|anyone|anybody|all (businesses|companies|people|teams|users)|any (business|company|team)|businesses of all sizes|the general public|the mass market|people who|smbs?\b(?! (with|in|that)))/i;
export function icpIsBroad(icp) {
  const t = String(icp ?? '');
  if (!t.trim()) return true;
  if (BROAD.test(t)) return true;
  return toks(t).size < 3; // too few specific words to describe a segment
}

// Strength 0..1 of the REAL evidence a spec links. Only insights that overlap the spec's problem/user count
// (linking unrelated interviews is not evidence); commitments count when they come from an interview that
// also produced a relevant insight.
export function evidenceStrength(f, insights = []) {
  const ids = new Set(f.evidence ?? []);
  const linked = insights.filter((i) => ids.has(i.id) && i.real);
  if (!linked.length) return 0;
  const ft = toks(`${f.user} ${f.problem} ${f.title}`);
  const relevant = linked.filter((i) => i.type !== 'commitment' && [...toks(i.text)].some((w) => ft.has(w)));
  const ivs = new Set(relevant.map((i) => i.interviewId ?? i.id));
  const w = relevant.reduce((a, i) => a + (i.verified ? 1 : 0.5), 0);
  const commits = linked.filter((i) => i.type === 'commitment' && ivs.has(i.interviewId)).length;
  // Distinct people matter more than many quotes from one interview.
  const people = Math.min(1, ivs.size / 3);
  return clamp(0.5 * Math.min(1, w / 3) + 0.3 * people + 0.2 * Math.min(1, commits / 2), 0, 1);
}

// Heuristic value of one feature. icp: text; insights: research insights (only real ones matter).
// Conservative by design (audit item 13): shrinks toward the median so keyword stuffing cannot reach the top;
// the LLM judgment (when online) is primary.
export function heuristicValue(f, { icp = '', insights = [] } = {}) {
  const ict = toks(icp);
  const ft = toks(`${f.user} ${f.problem}`);
  const hits = [...ft].filter((w) => ict.has(w)).length;
  let relevance = ict.size ? Math.min(1, hits / 3) : 0.5;
  const realText = insights.filter((i) => i.real).map((i) => i.text).join(' ');
  const realOverlap = insights.filter((i) => i.real).some((i) => [...toks(i.text)].filter((w) => ft.has(w)).length >= 2);
  if (realOverlap) relevance = Math.min(1, relevance + 0.2);
  if (icpIsBroad(icp)) relevance = Math.min(relevance, FIT.broadIcpCap);

  const sol = `${f.solution ?? ''} ${(Array.isArray(f.acceptance) ? f.acceptance : []).join(' ')}`;
  const solution = String(f.solution ?? '');
  const auto = (solution.match(AUTOMATE) ?? []).length;
  const disp = (solution.match(DISPLAY) ?? []).length;
  const anyAction = new RegExp(ACTION.source, 'i').test(solution);
  const acted = verbObjectHits(solution, f.problem ?? ''); // the action touches something named in the problem
  let capability = auto && acted ? 0.55 : auto ? 0.35 : anyAction ? 0.3 : 0.15;
  if (!auto && disp) capability -= 0.2; // display-only: no state change, nothing removed from their week
  if (acted && WORKAROUND.test(f.problem ?? '')) capability += 0.2; // it automates the thing they do by hand
  // Working inside a tool counts only if the customer really uses it: the tool is in the ICP or in real interview notes.
  const named = new Set((`${f.problem} ${f.user}`.match(TOOLS) ?? []).map((x) => x.toLowerCase()));
  const known = `${icp} ${realText}`.toLowerCase();
  if ([...named].some((t) => sol.toLowerCase().includes(t) && known.includes(t))) capability += 0.15;
  if (isStuffed(solution)) capability *= 0.3; // a list of verbs is not a capability
  capability = clamp(0.4 + 0.85 * (clamp(capability, 0, 1) - 0.4), 0, 1); // shrink toward the median [design]

  const q = clamp((f.grade?.total ?? 10) / 20, 0, 1);
  return clamp(relevance * capability * (0.9 + 0.1 * q), 0, 1);
}

// Evidence/contact multipliers fixed at ship time (stored on the feature as f.ship).
export function shipFactors(f, { insights = [], realInterviewsRecent = 0, rand = () => 0.5 } = {}) {
  const s = evidenceStrength(f, insights);
  const unwanted = rand() < FIT.unwantedBase * (1 - s);
  const contact = 1 + FIT.contactBoostMax * Math.min(1, realInterviewsRecent / FIT.contactInterviews);
  return { evidence: Math.round(s * 100) / 100, unwanted, contact: Math.round(contact * 100) / 100 };
}

export function featureValue(f, ctx = {}) {
  // Stub features with no spec text (saves/tests that mark a feature shipped directly) keep the old neutral
  // "unjudged" fit of ~0.3 for a single feature.
  if (!f.solution && !f.problem) return 0.86;
  const h = heuristicValue(f, ctx);
  let v = typeof f.valueLLM === 'number' ? FIT.llmWeight * f.valueLLM + (1 - FIT.llmWeight) * h : h;
  const s = f.ship ? f.ship.evidence : evidenceStrength(f, ctx.insights ?? []);
  v *= FIT.evidenceFloor + (1 - FIT.evidenceFloor) * s;
  if (f.ship?.unwanted) v *= FIT.unwantedMult;
  if (f.ship?.contact) v *= f.ship.contact;
  if (icpIsBroad(ctx.icp)) v = Math.min(v, FIT.broadIcpCap); // LLM value too: "everyone" is nobody's must-have
  return clamp(v * (f.commoditized ? FIT.commoditized : 1), 0, 1);
}

// Customer-contact factor: 1 while you talk to customers, decaying to decayFloor without contact.
// daysSinceContact: days since the last real interview or held customer call (null = never).
export function contactFactor(daysSinceContact, { daysSinceFirstShip = 0 } = {}) {
  const d = daysSinceContact == null ? daysSinceFirstShip : Math.max(0, daysSinceContact);
  const over = Math.max(0, d - FIT.decayGraceDays);
  return clamp(1 - (1 - FIT.decayFloor) * Math.min(1, over / FIT.decayDays), FIT.decayFloor, 1);
}

export function trueFit(features, { icp = '', insights = [], bugHours = 0, contact = 1 } = {}) {
  const shipped = features.filter((f) => f.status === 'shipped');
  if (!shipped.length) return 0;
  const vals = shipped.map((f) => featureValue(f, { icp, insights }));
  const miss = vals.reduce((a, v) => a * (1 - FIT.perFeature * v), 1);
  const top = vals.slice().sort((a, b) => b - a).slice(0, FIT.ceilingTop);
  const ceiling = FIT.max * clamp(top.reduce((a, v) => a + v, 0) / top.length / FIT.ceilingRef, 0, 1);
  const clutter = shipped.filter((f) => f.ship?.unwanted || (f.check?.verdict === 'missed' && f.decision !== 'kill')).length;
  const bloat = Math.min(FIT.bloatMax, clutter * FIT.bloatPer);
  const bug = Math.min(FIT.maxBugPenalty, bugHours * FIT.bugPenaltyPerHour);
  return clamp(Math.min(ceiling, 1 - miss) * (1 - bug) * (1 - bloat) * clamp(contact, 0, 1), 0, FIT.max);
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
