// One pivot detector for the whole game (Settings and the planner both use it). It classifies a change of the
// one-liner / ICP / model / pricing / channel into a pivot type, records {day, type, from, to, kept} in
// company.pivotLog, charges the founder hours, applies the truth side (core/truth.js onPivot) and logs the
// mistakes that go with careless pivoting. Pivot research: docs/research/early-stage/pivots.md.

import { logMistake } from './operator.js';
import { forceHours } from './state.js';
import { isPivot } from './market.js';
import { onPivot, segmentMatch } from './truth.js';
import { ensureMarket } from './market.js';

// Founder hours: segment/channel/pricing are quick, a full restart costs the most (3-6 months of runway at
// small-team burn in the research) [design]. customerLoss = share of the old promise that stops fitting: shows as extra
// churn that fades over 90 days [design].
export const PIVOT_TYPES = {
  segment: {
    label: 'Customer segment pivot', summary: 'Same problem and product, a different kind of customer.',
    keeps: ['Product and code', 'Audience and contacts', 'Interview insights about the problem', 'Existing customers'],
    loses: ['Positioning and landing page', 'Some marketing and channel work', 'Feature judgments made for the old ICP'],
    hours: 20, customerLoss: 0.1, truth: 'retained: the market is the same, only who you sell to changes',
  },
  problem: {
    label: 'Customer need (problem) pivot', summary: 'Same kind of customer, a different problem.',
    keeps: ['Customer relationships and audience', 'Team and infrastructure (auth, billing, deploy)'],
    loses: ['Roadmap and much of the feature code', 'Pain and jobs evidence (the market is re-drawn)', 'Some customers who bought the old story'],
    hours: 40, customerLoss: 0.35, truth: 're-drawn: pain, jobs and demand for the new problem are unknown again',
  },
  zoom_in: {
    label: 'Zoom-in pivot', summary: 'One feature becomes the whole product.',
    keeps: ['The code for that feature', 'Users who loved it', 'Brand energy'],
    loses: ['Every other feature', 'Users who came for the rest'],
    hours: 30, customerLoss: 0.2, truth: 'kept, jobs re-weighted toward the one that mattered',
  },
  zoom_out: {
    label: 'Zoom-out pivot', summary: 'The whole product becomes one feature of a bigger offer.',
    keeps: ['The core product', 'Customers'], loses: ['Focus', 'Simplicity of the pitch'],
    hours: 30, customerLoss: 0.1, truth: 'kept, jobs flattened across a wider offer',
  },
  business_model: {
    label: 'Business model pivot', summary: 'B2B vs B2C, self-serve vs sales, or a different buyer who pays.',
    keeps: ['Some technology', 'What you learned about the problem'],
    loses: ['Sales motion and pricing', 'Existing channel assumptions', 'Who pays and how much (willingness to pay is re-drawn)'],
    hours: 60, customerLoss: 0.3, truth: 'segments, willingness to pay and budget owners re-drawn',
  },
  channel: {
    label: 'Channel pivot', summary: 'Same product and customer, a different route to them.',
    keeps: ['Product, pricing and positioning'], loses: ['Channel relationships and the learning curve on the old channel'],
    hours: 16, customerLoss: 0, truth: 'untouched',
  },
  pricing: {
    label: 'Pricing / value capture pivot', summary: 'Same product, a different way or amount of charging.',
    keeps: ['Product and customers'], loses: ['Revenue predictability during the switch', 'Trust of customers who feel re-priced'],
    hours: 8, customerLoss: 0.05, truth: 'untouched (true willingness to pay is unchanged by your price list)',
  },
  full_restart: {
    label: 'Full restart', summary: 'New customer and new problem: a new company on the same team.',
    keeps: ['The team and its skills', 'Cash left', 'Generic infrastructure (auth, billing, deploy)'],
    loses: ['Most customers and channel state', 'Roadmap, positioning and landing page', 'Almost all hypotheses and evidence'],
    hours: 80, customerLoss: 0.6, truth: 'everything re-drawn',
  },
};
export const pivotTypeIds = Object.keys(PIVOT_TYPES);

// Pivot types that re-draw the market demand scalar (company.pivots feeds marketDemand's idea key).
const REDRAW_DEMAND = new Set(['problem', 'full_restart']);
// Substantive types that should rest on customer conversations (channel and pricing tests need none).
const NEEDS_EVIDENCE = new Set(['segment', 'problem', 'zoom_in', 'zoom_out', 'business_model', 'full_restart']);
export const MIN_CONVERSATIONS = 15; // real conversations since the last pivot (research: ~15-20 for a segment check [design])

const snap = (c) => ({ oneLiner: c.oneLiner ?? '', icp: c.icp ?? '', model: c.model ?? '', pricing: c.pricingModel ?? null, channel: c.primaryChannel ?? null });
export const snapshotOf = snap;

const toks = (t) => new Set(String(t ?? '').toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
const jaccard = (a, b) => { const x = toks(a), y = toks(b); if (!x.size || !y.size) return 1; const i = [...x].filter((w) => y.has(w)).length; return i / (x.size + y.size - i); };

/**
 * Classify a change. prev/next: {oneLiner, icp, model, pricing?, channel?}. Returns { type|null, why, flags }.
 * type is null for re-wording or first-time filling in (nothing to pivot from).
 */
export function classifyChange(state, prev, next) {
  const flags = {
    oneLiner: !!prev.oneLiner?.trim() && !!next.oneLiner?.trim() && isPivot(prev.oneLiner, next.oneLiner),
    icp: false,
    model: !!prev.model && !!next.model && prev.model !== next.model,
    pricing: prev.pricing != null && next.pricing != null && prev.pricing !== next.pricing,
    channel: prev.channel != null && next.channel != null && prev.channel !== next.channel,
  };
  if (prev.icp?.trim() && next.icp?.trim() && prev.icp.trim() !== next.icp.trim()) {
    const a = segmentMatch(state, prev.icp)[0]?.segmentId ?? null, b = segmentMatch(state, next.icp)[0]?.segmentId ?? null;
    flags.icp = jaccard(prev.icp, next.icp) < 0.5 || (a && b && a !== b);
  }
  let type = null, why = '';
  if (flags.oneLiner && flags.icp) { type = 'full_restart'; why = 'Both the idea and the customer changed.'; }
  else if (flags.model) { type = 'business_model'; why = 'The business model changed.'; }
  else if (flags.oneLiner) {
    const a = toks(prev.oneLiner), b = toks(next.oneLiner);
    const inside = [...b].filter((w) => a.has(w)).length / Math.max(1, b.size);
    const back = [...a].filter((w) => b.has(w)).length / Math.max(1, a.size);
    if (inside >= 0.8 && b.size < a.size) { type = 'zoom_in'; why = 'The new idea is a part of the old one.'; }
    else if (back >= 0.8 && a.size < b.size) { type = 'zoom_out'; why = 'The old idea is now a part of a bigger one.'; }
    else { type = 'problem'; why = 'The problem you solve changed for the same kind of customer.'; }
  } else if (flags.icp) { type = 'segment'; why = 'Same idea, a different customer.'; }
  else if (flags.pricing) { type = 'pricing'; why = 'The way you charge changed.'; }
  else if (flags.channel) { type = 'channel'; why = 'The route to customers changed.'; }
  return { type, why, flags };
}

const realConversations = (state, sinceDay) => (state.apps.research?.interviews ?? []).filter((i) => i.real && i.status === 'done' && (i.day ?? i.createdDay ?? 0) >= sinceDay).length;

// Pivot rework is forced: charged in full past the weekly plan, on today's hours (core/state.js forceHours).
const chargeHours = (state, hours, label) => forceHours(state, hours, label);

/**
 * Record a (confirmed) change. Call AFTER the company fields hold the new values; prev is what they were.
 * type: the founder's confirmed type (defaults to the detector's). Returns the pivotLog entry, or null for a plain edit.
 */
export function registerChange(state, prev, next, { type = null, charge = true } = {}) {
  const c = state.company;
  const cls = classifyChange(state, prev, next);
  const t = type === 'none' ? null : type ?? cls.type;
  c.pivotSnap = snap(next);
  if (!t || !PIVOT_TYPES[t]) return null;
  const spec = PIVOT_TYPES[t];
  const log = (c.pivotLog ??= []);
  // Evidence and the "again within 90 days" check count from the last real direction change: a pricing or channel
  // tweak in between neither resets the conversation count nor makes the next pivot a repeat.
  const last = log.findLast((p) => NEEDS_EVIDENCE.has(p.type));
  const evidence = realConversations(state, last ? last.day : 0);
  const from = t === 'segment' ? prev.icp : t === 'business_model' ? prev.model : t === 'pricing' ? String(prev.pricing) : t === 'channel' ? String(prev.channel) : prev.oneLiner;
  const to = t === 'segment' ? next.icp : t === 'business_model' ? next.model : t === 'pricing' ? String(next.pricing) : t === 'channel' ? String(next.channel) : next.oneLiner;
  const entry = { day: state.day, type: t, from, to, kept: spec.keeps.slice(), evidence, hours: spec.hours };
  log.push(entry);
  if (REDRAW_DEMAND.has(t)) { c.pivots = (c.pivots ?? 0) + 1; c.b2cCategory = null; }
  if (t === 'business_model') c.b2cCategory = null;
  onPivot(state, { type: t });
  // A small pivot (channel, pricing) right after a big one must not wipe the big one's fading churn.
  if (1 + 0.5 * spec.customerLoss >= pivotChurnMult(state)) ensureMarket(state).lastPivot = { day: state.day, loss: spec.customerLoss };
  if (charge) chargeHours(state, spec.hours, `Pivot: ${spec.label}`);
  logPivotMistakes(state, entry, last);
  return entry;
}

function logPivotMistakes(state, entry, last) {
  const log = state.company.pivotLog;
  if (NEEDS_EVIDENCE.has(entry.type) && entry.evidence < MIN_CONVERSATIONS) {
    logMistake(state, { functionId: 'founder_sustainability', id: 'pivot_without_evidence', label: 'Pivoted without customer evidence', cost: { days: 14 }, circles: true, app: 'you', key: `pivot_noev:${entry.day}:${log.length}`,
      detail: `${PIVOT_TYPES[entry.type].label} on ${entry.evidence} real customer conversations since ${last ? 'the last pivot' : 'the start'} (about ${MIN_CONVERSATIONS} are needed to tell a bad segment from a bad idea). The new direction rests on a hunch, so expect to rebuild the same guesses.` });
  }
  if (last && entry.day - last.day < 90 && entry.evidence < 20 && NEEDS_EVIDENCE.has(entry.type)) {
    logMistake(state, { functionId: 'founder_sustainability', id: 'pivot_every_90', label: 'Pivoted again within 90 days', cost: { days: 30 }, circles: true, app: 'you', key: `pivot:${entry.day}:${log.length}`,
      detail: `New direction ${entry.day - last.day} days after the last change, on ${entry.evidence} real customer conversations. Stay with one hypothesis until you have about 20.` });
  }
  const recent = log.filter((p) => NEEDS_EVIDENCE.has(p.type) && entry.day - p.day <= 182);
  if (recent.length >= 3 && NEEDS_EVIDENCE.has(entry.type)) {
    logMistake(state, { functionId: 'founder_sustainability', id: 'thrash_pivoting', label: 'Thrash pivoting', cost: { days: 45 }, circles: true, delayed: true, app: 'you', key: `thrash:${entry.day}:${log.length}`,
      detail: `${recent.length} pivots in six months. Startups that pivot once or twice do better than ones that pivot more (Startup Genome, directional); each reset throws away learning, goodwill and runway.` });
  }
}

/**
 * Safety net for edits that bypass Settings (other apps, imports): compare the company with the last snapshot and
 * register any pivot found. Called by the planner daily; the first call only takes the snapshot.
 */
export function syncPivotSnapshot(state) {
  const c = state.company;
  const now = snap(c);
  if (!c.pivotSnap) { c.pivotSnap = now; return null; }
  const p = c.pivotSnap;
  if (p.oneLiner === now.oneLiner && p.icp === now.icp && p.model === now.model && p.pricing === now.pricing && p.channel === now.channel) return null;
  return registerChange(state, p, now);
}

/** Pivot entries that count as real direction changes (for scorecards). */
export const substantivePivots = (state) => (state.company.pivotLog ?? []).filter((p) => NEEDS_EVIDENCE.has(p.type));

/** Extra churn from the old promise fading after a pivot: 1 + loss/2 decaying to 1 over 90 days. */
export function pivotChurnMult(state) {
  const lp = ensureMarket(state).lastPivot;
  if (!lp) return 1;
  const age = (state.day ?? 0) - lp.day;
  return age >= 90 ? 1 : 1 + 0.5 * lp.loss * (1 - Math.max(0, age) / 90);
}
