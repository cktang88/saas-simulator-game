// Deal pipeline rules (pure): stages, allowed moves, no-show odds, qualification, win rates and cycle length.
import { clamp } from '../../core/util.js';
import { SALES } from './params.js';

export const STAGES = [
  { id: 'lead', label: 'Lead', prob: 0.01 },
  { id: 'contacted', label: 'Contacted', prob: 0.02 },
  { id: 'replied', label: 'Replied', prob: 0.05 },
  { id: 'meeting_booked', label: 'Meeting booked', prob: 0.1 },
  { id: 'meeting_held', label: 'Meeting held', prob: 0.15 },
  { id: 'qualified', label: 'Qualified', prob: 0.25 },
  { id: 'proposal', label: 'Proposal / trial', prob: 0.4 },
  { id: 'contract', label: 'Contract sent / redlines', prob: 0.8 },
  { id: 'won', label: 'Closed won', prob: 1 },
  { id: 'lost', label: 'Closed lost', prob: 0 },
];
export const STAGE_IDS = STAGES.map((s) => s.id);
export const stageLabel = (id) => STAGES.find((s) => s.id === id)?.label ?? id;
export const stageIndex = (id) => STAGE_IDS.indexOf(id);
export const isOpen = (deal) => deal.stage !== 'won' && deal.stage !== 'lost';

// Stages the player can move a deal to by hand. Buyer actions (meetings, decisions) can't be faked:
// "meeting booked/held" come from Calls, "qualified" from a held call, "won" only from the buyer.
export function manualMoves(deal) {
  if (deal.stage === 'won') return [];
  if (deal.stage === 'lost') return ['lead'];
  const out = [];
  if (deal.stage === 'lead') out.push('contacted');
  if (deal.stage === 'contacted') out.push('lead', 'replied');
  if (['meeting_held', 'qualified', 'proposal', 'contract'].includes(deal.stage)) out.push('replied');
  out.push('lost');
  return out;
}

// Automatic transitions: only move forward (never drag a deal back because of a later, weaker signal).
export function advanceTo(current, target) {
  if (current === 'won' || current === 'lost') return current;
  return stageIndex(target) > stageIndex(current) ? target : current;
}

/** No-show probability for a booked meeting. */
export function noShowProbability({ leadDays, segment = 'smb', source = 'outbound', reminders = true }) {
  const n = SALES.noShow;
  let p = leadDays <= 3 ? n.short : leadDays < 7 ? n.mid : n.long;
  if (segment === 'smb') p += n.smbAdd;
  if (segment === 'ent') p += n.entAdd;
  if (source === 'outbound' && leadDays >= 7) p += n.coldLongAdd;
  if (source === 'ai_sdr') p += n.aiSdrAdd;
  if (source === 'inbound' || source === 'network' || source === 'referral') p -= 0.07;
  if (reminders) p *= n.reminderFactor;
  return clamp(p, 0.05, 0.6);
}

export function winRate(acv) {
  return SALES.winRates.find(([max]) => acv < max)[1];
}

export function cycleRange(acv) {
  const [, lo, hi] = SALES.cycles.find(([max]) => acv < max);
  return [lo, hi];
}
export function cycleDays(acv, r = 0.5, { responsive = false } = {}) {
  const [lo, hi] = cycleRange(acv);
  return Math.round((lo + (hi - lo) * r) * (responsive ? SALES.responseBonus.cycle : 1));
}

/** Score 0..1 from a call scorecard. Silence earns nothing: no-violation and talk-ratio credit need ≥3 questions. */
export function callQuality(card) {
  if (!card) return 0.5;
  const med = card.meddicc ? Object.values(card.meddicc).filter(Boolean).length / Math.max(1, Object.keys(card.meddicc).length) : 0;
  const engaged = (card.questionsAsked ?? 0) >= 3;
  const talk = !engaged ? 0 : card.talkRatio <= 0.45 ? 1 : card.talkRatio <= 0.6 ? 0.6 : 0.2;
  const clean = engaged ? 1 - Math.min(5, card.momTestViolations.length) / 5 : 0;
  const comp = card.competitiveHandling === 'handled' ? 0.06 : card.competitiveHandling === 'fumbled' ? -0.1 : 0;
  return clamp(comp + 0.35 * (card.discoveryQuality / 10) + 0.2 * (card.nextStepSecured ? 1 : 0) + 0.15 * clean + 0.15 * med + 0.15 * talk, 0, 1);
}

/**
 * Held meeting → qualified opportunity. Rolled ONCE per deal (see engine.applyCallOutcome).
 * founderTurns/founderWords: a near-empty call can't qualify; painUncovered: MEDDICC "pain" is required.
 */
export function qualifyProbability({ quality = 0.5, hasPain = true, intensity = null, hasProduct = true, source = 'outbound', productFit = null, founderTurns = 5, founderWords = 200, painUncovered = true }) {
  if (founderTurns < 3 || founderWords < 60) return 0.02;
  let p = (source === 'ai_sdr' ? SALES.aiSdr.meetingToOpp : SALES.meetingToOpp) * (0.5 + quality);
  if (!hasPain) p *= 0.2;
  else if (intensity != null) p *= 0.6 + 0.6 * intensity; // hair-on-fire pain qualifies far more often than a mild annoyance
  if (!painUncovered) p *= 0.3;
  if (!hasProduct) p *= 0.5;
  if (productFit != null) p *= 0.7 + 0.6 * productFit;
  return clamp(p, 0.02, 0.92);
}

/**
 * Budget fit [design]: budgetRatio = buyer's monthly budget / this proposal's monthly cost.
 * At or under budget: ×1–1.2. Up to 2× over budget: falls with the square (needs an exec to find money).
 * Beyond 2× over: steeply cubic — such deals almost never close. Puts the revenue-maximizing price near the
 * buyer's typical budget instead of rewarding 20× overpricing.
 */
export function budgetFit(r) {
  if (!Number.isFinite(r)) return 1;
  if (r >= 1) return Math.min(1.2, Math.pow(r, 0.25));
  if (r >= 0.5) return r * r;
  return 0.25 * Math.pow(Math.max(0, r) / 0.5, 3);
}

/** Opportunity → closed won at the decision date. */
export function closeProbability({ acv, quality = 0.5, productFit = null, budgetRatio = 1, responsive = false, hasPain = true, intensity = null, discountPct = 0, penalties = 1, baseWin = null }) {
  // baseWin: the buyer segment's qualified win rate (already nets out no-decision), else the ACV band rate.
  let p = (baseWin ?? winRate(acv)) * (0.6 + 0.8 * quality);
  if (productFit != null) p *= 0.6 + 0.8 * productFit;
  p *= budgetFit(budgetRatio); // the buyer's budget, not your price, decides; over-budget deals mostly stall
  if (responsive) p *= SALES.responseBonus.win;
  if (!hasPain) p *= 0.3;
  else if (intensity != null) p *= 0.6 + 0.6 * intensity;
  p *= 1 + Math.min(0.3, discountPct) * 0.5;
  return clamp(p * penalties, 0.001, 0.85);
}

export function dealAcv(plan, { quantity = 1, annual = false, discountPct = 0, annualDiscount = 0 } = {}) {
  const base = plan.interval === 'year' ? plan.price : plan.price * 12 * (annual ? 1 - annualDiscount : 1);
  return Math.round(base * quantity * (1 - discountPct));
}

// Pipeline coverage ≈ 1 / win rate; weighted pipeline uses stage probabilities.
export function weightedPipeline(deals) {
  return deals.filter(isOpen).reduce((a, d) => a + (d.amount ?? 0) * (STAGES.find((s) => s.id === d.stage)?.prob ?? 0), 0);
}

const band = (table, acv) => table.find(([max]) => acv < max);
export const securityReviewChance = (acv) => band(SALES.securityReview.byAcv, acv)[1];
export const dpaChance = (acv) => band(SALES.dpaRequest.byAcv, acv)[1];
export function contractDays(acv, r = 0.5) {
  const [, lo, hi] = band(SALES.contractDays, acv);
  return Math.round(lo + (hi - lo) * r);
}
