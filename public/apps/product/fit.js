// True (hidden) product fit. The market reacts to what you actually shipped, whether or not you run a
// panel; the panel is only a noisy readout of this (docs/review/product-support-life.md P1/P2).
//
// Per shipped feature, value u ∈ [0,1] = relevance to the ICP × capability (does it remove the stated
// workaround, or just display data?), lightly adjusted by spec quality (≤10%). An LLM judges each feature
// once at ship (cached on the feature) and is blended with the heuristic.
//
// With a game state in ctx (the real game), relevance comes from the hidden market truth (core/truth.js): the value
// of a feature is its fit with the real jobs and pain of the segments the ICP actually targets, so the player's own
// ICP text is no longer true by definition. The LLM judge scores spec quality only (capability, specificity); a
// judgment made for another ICP or idea is stale and ignored. Without state (unit use) the old text heuristic applies.
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
import { featureValue as truthFeatureValue, judgeKey, segmentMatch } from '../../core/truth.js';
import { evidenceMultiplier } from '../research/synthesis.js';
import { mvpSlice } from '../mvp/model.js';
import { isCommitment } from '../sales/presell.js';
import { segmentForContact } from '../sales/truth-persona.js';
import { criteriaSchema, hasScores, unit, s15 } from '../../core/rubric-schema.js';
import { VALUE_CRITERIA } from './rubrics.js';
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
export function evidenceStrength(f, insights = [], state = null) {
  const base = interviewStrength(f, insights);
  if (!state) return base;
  // Synthesis quality and opinion-vs-behaviour decide how much the linked interviews are worth; MVP tests and
  // pre-sell commitments about the same problem/segment are behavioural evidence on their own.
  const mult = base > 0 ? evidenceMultiplier(state, f) : 1;
  return clamp(base * mult + mvpEvidence(state, f), 0, 1);
}

const topSeg = (state, text) => segmentMatch(state, text)[0]?.segmentId ?? null;
/** 0..0.5 from passed experiments (learning log) and committed pre-sell asks whose problem/segment matches the feature. */
export function mvpEvidence(state, f) {
  const ft = toks(`${f.user} ${f.problem} ${f.title}`);
  const fseg = topSeg(state, `${f.user ?? ''} ${f.problem ?? ''}`);
  const sl = mvpSlice(state);
  const exps = new Map((sl.experiments ?? []).map((e) => [e.id, e]));
  let passes = 0;
  for (const l of sl.learning ?? []) {
    if (l.verdict !== 'pass' || l.called === 'kill' || l.quality === 'low') continue;
    const e = exps.get(l.expId);
    const text = `${l.name} ${e?.hypothesis?.statement ?? ''} ${e?.audience ?? ''} ${e?.inputs?.headline ?? ''} ${e?.inputs?.offer ?? ''}`;
    const seg = e?.audience ? topSeg(state, e.audience) : null;
    if ([...toks(text)].some((w) => ft.has(w)) || (fseg && seg === fseg)) passes++;
  }
  const crm = state.apps?.crm;
  let commits = 0;
  for (const a of crm?.presell?.asks ?? []) {
    if (!isCommitment(a)) continue;
    const ct = (crm.contacts ?? []).find((c) => c.id === a.contactId);
    if (!ct || !fseg || segmentForContact(state, ct) === fseg) commits++;
  }
  return Math.min(0.5, 0.3 * Math.min(1, passes / 2) + 0.3 * Math.min(1, commits / 2));
}

function interviewStrength(f, insights = []) {
  const ids = new Set(f.evidence ?? []);
  // An insight from a simulated conversation counts when what it says is TRUE for the person who said it (hidden truth,
  // research/synthesis.js truthOfInsight): a polite "I'd use that" from someone who really has the need is evidence, the
  // same words from someone without it are not. Notes from real-world calls have no hidden truth; their label decides.
  const linked = insights.filter((i) => ids.has(i.id) && (i._truth ? i._truth.holds && !i.negative : i.real));
  if (!linked.length) return 0;
  const ft = toks(`${f.user} ${f.problem} ${f.title}`);
  const relevant = linked.filter((i) => i.type !== 'commitment' && [...toks(i.text)].some((w) => ft.has(w)));
  const ivs = new Set(relevant.map((i) => i.interviewId ?? i.id));
  const w = relevant.reduce((a, i) => a + (i.verified ? 1 : 0.5), 0);
  // Commitments (pre-sell LOIs, deposits, pre-orders) are not interviews and carry no interviewId: any real
  // commitment the spec links counts, which is the strongest evidence there is.
  const commits = linked.filter((i) => i.type === 'commitment').length;
  // Distinct people matter more than many quotes from one interview.
  const people = Math.min(1, (ivs.size + commits) / 3);
  return clamp(0.5 * Math.min(1, w / 3) + 0.3 * people + 0.2 * Math.min(1, commits / 2), 0, 1);
}

// Capability/spec quality of one feature, 0..1 (what the behaviour does, not who wants it).
function capabilityQuality(f, { icp = '', insights = [] } = {}) {
  const realText = insights.filter((i) => i.real).map((i) => i.text).join(' ');
  const sol = `${f.solution ?? ''} ${(Array.isArray(f.acceptance) ? f.acceptance : []).join(' ')}`;
  const solution = String(f.solution ?? '');
  const auto = (solution.match(AUTOMATE) ?? []).length;
  const disp = (solution.match(DISPLAY) ?? []).length;
  const anyAction = new RegExp(ACTION.source, 'i').test(solution);
  const acted = verbObjectHits(solution, f.problem ?? ''); // the action touches something named in the problem
  let capability = auto && acted ? 0.55 : auto ? 0.35 : anyAction ? 0.3 : 0.15;
  if (!auto && disp) capability -= 0.2; // display-only: no state change, nothing removed from their week
  if (auto && acted && WORKAROUND.test(f.problem ?? '')) capability += 0.2; // it automates the thing they do by hand
  // Working inside a tool counts only if the customer really uses it: the tool is in the ICP or in real interview notes.
  const named = new Set((`${f.problem} ${f.user}`.match(TOOLS) ?? []).map((x) => x.toLowerCase()));
  const known = `${icp} ${realText}`.toLowerCase();
  if (auto && [...named].some((t) => sol.toLowerCase().includes(t) && known.includes(t))) capability += 0.15;
  if (isStuffed(solution)) capability *= 0.3; // a list of verbs is not a capability
  capability = clamp(0.4 + 0.85 * (clamp(capability, 0, 1) - 0.4), 0, 1); // shrink toward the median [design]
  const q = clamp((f.grade?.total ?? 10) / 20, 0, 1);
  return capability * (0.9 + 0.1 * q);
}

// Heuristic value of one feature. icp: text; insights: research insights (only real ones matter); state (optional):
// the game state, which switches relevance from "words shared with the player's ICP" to the hidden market truth.
// Conservative by design (audit item 13): shrinks toward the median so keyword stuffing cannot reach the top;
// the LLM judgment (when online) is primary.
export function heuristicValue(f, { icp = '', insights = [], state = null } = {}) {
  let relevance;
  if (state) relevance = truthFeatureValue(state, f).value;
  else {
    const ict = toks(icp);
    const ft = toks(`${f.user} ${f.problem}`);
    const hits = [...ft].filter((w) => ict.has(w)).length;
    relevance = ict.size ? Math.min(1, hits / 3) : 0.5;
    const realOverlap = insights.filter((i) => i.real).some((i) => [...toks(i.text)].filter((w) => ft.has(w)).length >= 2);
    if (realOverlap) relevance = Math.min(1, relevance + 0.2);
  }
  if (icpIsBroad(icp)) relevance = Math.min(relevance, FIT.broadIcpCap);
  return clamp(relevance * capabilityQuality(f, { icp, insights }), 0, 1);
}

// Evidence/contact multipliers fixed at ship time (stored on the feature as f.ship).
export function shipFactors(f, { insights = [], realInterviewsRecent = 0, rand = () => 0.5, state = null } = {}) {
  const s = evidenceStrength(f, insights, state);
  const unwanted = rand() < FIT.unwantedBase * (1 - s);
  const contact = 1 + FIT.contactBoostMax * Math.min(1, realInterviewsRecent / FIT.contactInterviews);
  return { evidence: Math.round(s * 100) / 100, unwanted, contact: Math.round(contact * 100) / 100 };
}

export function featureValue(f, ctx = {}) {
  // Stub features with no spec text (saves/tests that mark a feature shipped directly) keep the old neutral
  // "unjudged" fit of ~0.3 for a single feature.
  if (!f.solution && !f.problem) return 0.86;
  const h = heuristicValue(f, ctx);
  const st = ctx.state;
  const llmFresh = typeof f.valueLLM === 'number' && (!st || f.valueKey === judgeKey(st));
  let v;
  if (st) {
    // Market truth decides WHO wants it; the judge (when fresh) only refines how well the spec delivers.
    const rel = truthFeatureValue(st, f).value;
    const cap = capabilityQuality(f, ctx);
    const q = llmFresh ? (1 - FIT.llmWeight) * cap + FIT.llmWeight * clamp(f.valueLLM / 0.7, 0, 1) : cap;
    v = clamp((icpIsBroad(ctx.icp) ? Math.min(rel, FIT.broadIcpCap) : rel) * q, 0, 1);
  } else v = llmFresh ? FIT.llmWeight * f.valueLLM + (1 - FIT.llmWeight) * h : h;
  const s = f.ship ? f.ship.evidence : evidenceStrength(f, ctx.insights ?? [], st);
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

export function trueFit(features, { icp = '', insights = [], bugHours = 0, contact = 1, state = null } = {}) {
  const shipped = features.filter((f) => f.status === 'shipped' && !f.system); // growth-lever builds (plg) are not product value
  if (!shipped.length) return 0;
  const vals = shipped.map((f) => featureValue(f, { icp, insights, state }));
  const miss = vals.reduce((a, v) => a * (1 - FIT.perFeature * v), 1);
  const top = vals.slice().sort((a, b) => b - a).slice(0, FIT.ceilingTop);
  const ceiling = FIT.max * clamp(top.reduce((a, v) => a + v, 0) / top.length / FIT.ceilingRef, 0, 1);
  const clutter = shipped.filter((f) => f.ship?.unwanted || (f.check?.verdict === 'missed' && f.decision !== 'kill')).length;
  const bloat = Math.min(FIT.bloatMax, clutter * FIT.bloatPer);
  const bug = Math.min(FIT.maxBugPenalty, bugHours * FIT.bugPenaltyPerHour);
  return clamp(Math.min(ceiling, 1 - miss) * (1 - bug) * (1 - bloat) * clamp(contact, 0, 1), 0, FIT.max);
}

export const VALUE_SCHEMA = criteriaSchema(VALUE_CRITERIA, { extra: { reason: { type: 'string', description: 'One or two sentences, under 50 words' } } });
// The game (not the model) derives relevance / removesWorkaround / displayOnly from the criterion scores.
// Old-shape judgments (relevance, removesWorkaround, displayOnly) still pass through unchanged.
export function judgmentFrom(d) {
  if (!hasScores(d, VALUE_CRITERIA)) return d;
  const u = (keys) => unit(d, VALUE_CRITERIA.filter((c) => keys.includes(c.key)));
  return { relevance: u(['icp_fit', 'problem_frequency']) ?? 0, removesWorkaround: u(['manual_work_removed', 'not_free_elsewhere']) ?? 0, displayOnly: Number(d.acts_on_data) <= 2 };
}
export const valueFromJudgment = (raw) => { const d = judgmentFrom(raw); return clamp((Number(d.relevance) || 0) * (0.3 + 0.7 * (Number(d.removesWorkaround) || 0)) * (d.displayOnly ? 0.6 : 1), 0, 1); };

// Deterministic fallback in the full judge shape: criterion scores from the heuristic value v in [0,1].
export function valueFallback(v) {
  const r = Math.sqrt(Math.max(0, Math.min(1, v)));
  const sc = s15(1 + 4 * r);
  return { icp_fit: sc, problem_frequency: sc, manual_work_removed: sc, acts_on_data: sc, not_free_elsewhere: sc, evidence: [], reason: 'heuristic' };
}
