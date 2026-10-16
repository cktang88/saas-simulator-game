// What the founder told investors, accelerators, boards, buyers and co-founder candidates, and the real-world checks
// that later compare it with the truth (core/integrity.js; research: docs/research/verification/money-deals.md §1-4).
// A claim is recorded when it is SENT (the email, the deck as attached, the words on the call), judged by its
// writing at that moment, and only verified where the real world verifies it:
//   pitch smell test (first meeting)           'pitch' (VCs) / 'angel' (angels): mostly passes
//   angel commit (1-2 calls, maybe a customer) 'angel'
//   VC diligence (Stripe/bank/books access)    customer reference calls ('reference', customer claims) then
//                                              'confirmatory' on everything; angel groups use 'reference'
//   after the money moved (info rights)        quarterly: 'angel'-strength per insider, 'reference' with a board;
//                                              next round's diligence 'confirmatory'; an acquirer's QoE 'audit'
// Caught before the money moves: a small, definitional gap is a re-trade; a material one kills the deal and the
// investor network hears. Caught after: legal costs, a rescission demand on SAFEs, board action. Pure logic
// (no DOM, no sim.js import, so sim.js can call it without a cycle).

import { extractClaims, recordClaims, verify, penalize, openLies, ensureIntegrity, fmtClaim, reputationMult, truthOf, claimGap } from '../../core/integrity.js';
import { notify } from '../../core/state.js';
import { rng, chance, clamp, money } from '../../core/util.js';
import { post } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { computeMetrics, metricsSheet } from './metrics.js';

const frOf = (state) => state.apps.fundraising;

// [design] calibration (money-deals.md §1.3, §1.5, §2, §4.2; all detection numbers there are [design] too).
export const CLAIMS = {
  retradeGapMax: 0.15, // below this a caught overstatement reads as a definitional "clarify": re-trade, not a dead deal
  retradeCut: [0.1, 0.3], // valuation cut on a re-trade (research: 10-30%)
  postCloseEveryDays: 91, // information-rights cadence: quarterly financials / board meeting
  legalUsd: [15000, 60000], // company counsel answering a misrepresentation claim, by severity [design; seed counsel $15-40k]
  rescissionP: [0.25, 0.75], // SAFE holder demands the money back, by severity [design]
  removalP: { investor: 0.7, balanced: 0.45, founder: 0 }, // × severity: board removes the CEO (HeadSpin) [design]
  integrityFailureScore: 0.45, // integrity.score below this shows the integrity_failure failure mode [design]
  postCloseIndemnityP: 0.5, // acquirer: lies diligence missed surface in integration within 12 months (Frank) [design]
};

// ---- Recording ----
/** Record the claims in `text` as told to one recipient. Repeating the same number to the same party is one claim. */
export function tell(state, { audience = 'investor', recipientId, channel = '', text = '' }) {
  const I = ensureIntegrity(state);
  const open = I.claims.filter((x) => x.audience === audience && x.recipientId === recipientId && x.status === 'open');
  const list = extractClaims(text).filter((c) => !open.some((x) => x.metric === c.metric && Math.abs(x.claimed - c.value) <= Math.abs(c.value) * 0.02 + 1e-9));
  if (!list.length) return [];
  return recordClaims(state, { audience, recipientId, channel, claims: list, truth: computeMetrics(state) });
}

/** Advisory only (no record): claims in `text` that overstate the truth `m`, as readable strings. */
export function claimGaps(text, m) {
  return extractClaims(text).map((c) => ({ c, t: truthOf(m, c.metric) })).filter(({ c, t }) => claimGap(c.metric, c.value, t) > 0)
    .map(({ c, t }) => `"${c.text}" vs real ${fmtClaim(c.metric, t)}`);
}

/** What this party has been told (latest claim per metric), for persona prompts. */
export function toldTo(state, recipientId, audience = 'investor') {
  const I = ensureIntegrity(state);
  const latest = {};
  for (const c of I.claims) if (c.recipientId === recipientId && c.audience === audience) latest[c.metric] = c;
  const parts = Object.values(latest).map((c) => `${c.metric === 'mrr' ? 'MRR' : c.metric} ${fmtClaim(c.metric, c.claimed)}`);
  return parts.length ? parts.join(', ') : '';
}

/** The data-room metrics pack (truth as of when it was prepared), if one is in the room and fresh. */
export function sharedExport(state) {
  const it = frOf(state)?.room?.items?.metrics;
  if (!it || (state.day ?? 0) - it.day > 45) return null;
  return { day: it.day, sheet: it.sheet ?? `MRR: $${Math.round(it.mrr ?? 0).toLocaleString('en-US')}` };
}

/** How the investor sees the company: shared export if any, otherwise only what the founder has said. */
export function investorView(state, inv) {
  const ex = sharedExport(state);
  const told = toldTo(state, inv.id);
  return ex
    ? `METRICS PACK the founder shared in the data room (prepared on day ${ex.day}, exported from Stripe and the bank):\n${ex.sheet}`
    : `You have NOT seen any data export. All you know is what the founder told you${told ? ` (so far: ${told})` : ''} plus the deck. You cannot verify numbers on a call; probe them (definitions, how they were counted, the trend), and note anything that sounds implausible.`;
}

// ---- Pitch and angel checks ----
/** Smell test after the first meeting. Returns the caught claims (empty = passed). Costs this relationship. */
export function smellTest(state, inv, { angel = false } = {}) {
  // One plausibility judgement per pitch, not one roll per number: a single draw, so the odds follow the biggest gap.
  if (!openLies(state, { audience: 'investor', recipientId: inv.id }).length) return []; // nothing to find: no roll
  const u = rng(state);
  const r = verify(state, { audience: 'investor', recipientId: inv.id, check: angel ? 'angel' : 'pitch', roll: () => u });
  if (!r.caught.length) return [];
  penalize(state, r.caught, { audience: 'investor', functionId: 'fundraising', id: 'inflated_pitch_smelled', label: 'An investor did not believe your numbers', app: 'fundraising', weight: 0.25, hours: 1, detail: `${inv.name} (${inv.firm || 'angel'}) found the traction implausible after the first meeting and passed without saying why.` });
  const fr = frOf(state);
  if (fr) fr.reputation = (fr.reputation ?? 0) - 0.5;
  return r.caught;
}

// ---- Customer reference calls ----
const live = (s) => s.status === 'active' || s.status === 'past_due';

/** 0-100 health of one paying customer: Success health if tracked, else product fit, tickets, cancel/dunning state. */
export function customerHealth(state, sub) {
  const acct = state.apps.success?.accounts?.[sub.id];
  const fit = state.market?.fit?.product?.score ?? 0.5;
  let h = acct?.health != null ? acct.health : 45 + 40 * fit;
  const open = (state.apps.support?.tickets ?? []).filter((t) => t.customerId === sub.customerId && t.status === 'open').length;
  h -= 8 * Math.min(3, open);
  if (sub.cancelAtPeriodEnd) h -= 35;
  if (sub.status === 'past_due') h -= 15;
  h -= 10 * clamp((sub.churnMult ?? 1) - 1, 0, 2);
  h += Math.min(6, Math.max(0, ((state.day ?? 0) - (sub.startDay ?? 0)) / 30.4) * 0.5);
  return clamp(Math.round(h), 0, 100);
}

// Reference effect on the close [design; money-deals.md §8: references catch 60-80% of unhappy customers].
const REF = { enthusiastic: { mult: 1.03, label: 'enthusiastic' }, lukewarm: { mult: 0.9, label: 'lukewarm' }, unhappy: { mult: 0.6, label: 'unhappy' } };
export const REF_HOURS = 1; // scheduling 2-3 reference calls and briefing customers [design]

/** The founder offers their 2 happiest customers; the investor adds 1 of its own from the list (3+ customers). */
export function referenceCalls(state, inv) {
  const subs = (state.stripe?.subscriptions ?? []).filter(live);
  if (!subs.length) return { refs: [], mult: 1, summary: 'No paying customers to call.' };
  const custName = (sub) => { const c = (state.stripe?.customers ?? []).find((x) => x.id === sub.customerId); return c?.company || c?.name || 'a customer'; };
  const ranked = subs.map((sub) => ({ sub, h: customerHealth(state, sub) })).sort((a, b) => b.h - a.h);
  const picks = ranked.slice(0, Math.min(2, ranked.length)).map((x) => ({ ...x, by: 'founder' }));
  const rest = ranked.slice(picks.length);
  if (rest.length) picks.push({ ...rest[Math.floor(rng(state) * rest.length)], by: 'investor' });
  const refs = picks.map((p) => {
    const s = p.h >= 65 ? 'enthusiastic' : p.h >= 45 ? 'lukewarm' : 'unhappy';
    return { name: custName(p.sub), health: p.h, sentiment: s, by: p.by, subId: p.sub.id };
  });
  const mult = refs.reduce((a, r) => a * REF[r.sentiment].mult, 1);
  const bad = refs.filter((r) => r.sentiment === 'unhappy');
  if (bad.length) logMistake(state, { functionId: 'fundraising', id: 'unhappy_reference', label: 'An unhappy customer reference', app: 'fundraising', delayed: true, cost: { reputation: 0.5 * bad.length }, detail: `${inv.name} called ${refs.map((r) => `${r.name} (${r.sentiment}${r.by === 'investor' ? ', their pick' : ''})`).join(', ')}. ${bad.map((r) => `${r.name} was unhappy (health ${r.health}/100)`).join('; ')}. Close odds ×${mult.toFixed(2)}. A stellar founder fixes at-risk accounts (open tickets, cancellations) before a raise; investors pick their own reference too.` });
  return { refs, mult, summary: refs.map((r) => `${r.name}: ${r.sentiment}`).join('; ') };
}

// ---- Diligence verdict (before the term sheet / commitment) ----
/**
 * kind: 'vc' (Stripe/bank/books access + references), 'angel_group' (diligence team: references), 'angel' (light).
 * → { outcome: 'clean'|'retrade'|'dead', cut, caught, refs, refMult, prior }
 */
export function diligenceVerdict(state, inv, { kind = 'vc', diligenceDays = 0 } = {}) {
  const fr = frOf(state);
  let refs = null, caught = [];
  if (kind !== 'angel') {
    refs = referenceCalls(state, inv);
    caught.push(...verify(state, { audience: 'investor', recipientId: inv.id, metrics: ['customers'], check: 'reference' }).caught);
  }
  const check = kind === 'vc' ? 'confirmatory' : kind === 'angel_group' ? 'reference' : 'angel';
  caught.push(...verify(state, { audience: 'investor', recipientId: inv.id, check }).caught);
  // Next-round diligence reads the board decks and updates you sent earlier investors (latent liabilities).
  const prior = kind === 'vc' ? checkPostClose(state, { check: 'confirmatory', source: `${inv.name}'s diligence for the new round` }) : [];
  const out = { outcome: 'clean', cut: 0, caught, refs, refMult: refs?.mult ?? 1, prior };
  if (!caught.length) return out;
  const maxGap = caught.reduce((a, c) => Math.max(a, c.gap), 0);
  const what = caught.map((c) => `${c.metric} ${fmtClaim(c.metric, c.claimed)} vs ${fmtClaim(c.metric, c.truth)}`).join('; ');
  if (maxGap < CLAIMS.retradeGapMax && kind !== 'angel') {
    const [lo, hi] = CLAIMS.retradeCut;
    out.outcome = 'retrade';
    out.cut = +(lo + (hi - lo) * Math.min(1, maxGap / CLAIMS.retradeGapMax)).toFixed(3);
    penalize(state, caught, { audience: 'investor', functionId: 'fundraising', id: 'diligence_discrepancy', label: 'Diligence found your numbers overstated', app: 'fundraising', weight: 0.25, detail: `${inv.name}'s reconciliation of Stripe, bank and books came out below what you told them. Treated as a definitional gap: valuation cut ${Math.round(out.cut * 100)}%.` });
    if (fr) fr.reputation = (fr.reputation ?? 0) - 0.25;
    return out;
  }
  out.outcome = 'dead';
  const sev = penalize(state, caught, { audience: 'investor', functionId: 'fundraising', id: 'diligence_caught_inflation', label: 'Diligence caught inflated traction', app: 'fundraising', hours: Math.round((diligenceDays / 7) * 8), detail: `${inv.name} ${kind === 'vc' ? 'reconciled Stripe, the bank and the books' : 'checked'} and walked: ${diligenceDays ? `${diligenceDays} days of diligence (and any exclusivity) wasted, ` : ''}other investors hear about it (fresh investors' meeting and intro odds fall).` });
  if (fr) fr.reputation = (fr.reputation ?? 0) - (1 + 2 * sev);
  out.what = what;
  return out;
}

// ---- After the money moved ----
// Who holds money from you: closed CRM investors plus the update list and the board.
function postCloseRecipients(state) {
  const fr = frOf(state);
  const ids = new Set((fr?.investors ?? []).filter((i) => i.closedDay != null).map((i) => i.id));
  ids.add('insiders'); ids.add('board');
  return ids;
}

/** Roll the open lies held by people who already invested. Caught → postCloseFraud. Returns the caught claims. */
export function checkPostClose(state, { check = null, source = 'quarterly financials' } = {}) {
  const fr = frOf(state);
  if (!fr) return [];
  const board = Boolean(fr.governance) || Boolean(fr.ir?.board);
  const recips = postCloseRecipients(state);
  const caught = [];
  for (const id of recips) {
    const c = check ?? (id === 'board' || board ? 'reference' : 'angel');
    if (!openLies(state, { audience: 'investor', recipientId: id }).length) continue;
    caught.push(...verify(state, { audience: 'investor', recipientId: id, check: c }).caught);
  }
  if (caught.length) postCloseFraud(state, caught, { source });
  return caught;
}

/** Quarterly information-rights check (called daily from the fundraising tick). */
export function postCloseDay(state) {
  const fr = frOf(state);
  if (!fr || !(fr.rounds ?? []).length) return;
  const first = Math.min(...fr.rounds.map((r) => r.day));
  fr.infoRights ??= {};
  const last = fr.infoRights.lastCheck ?? first;
  if ((state.day ?? 0) - last < CLAIMS.postCloseEveryDays) return;
  fr.infoRights.lastCheck = state.day;
  checkPostClose(state, { source: fr.governance || fr.ir?.board ? 'the quarterly board package (financials vs what you reported)' : 'quarterly financials under information rights' });
}

/** A pre- or post-close lie surfaced after investors wired money. */
export function postCloseFraud(state, caught, { source = '' } = {}) {
  const fr = frOf(state);
  const maxGap = caught.reduce((a, c) => Math.max(a, c.gap), 0);
  const sev = Math.min(1, maxGap / 0.5);
  const [lo, hi] = CLAIMS.legalUsd;
  const legal = Math.round((lo + (hi - lo) * sev) / 500) * 500;
  post(state, { amount: -legal, counterparty: 'Company counsel', description: 'Response to investor misrepresentation claim', category: 'legal', method: 'ach' });
  const rescinded = [];
  const [rl, rh] = CLAIMS.rescissionP;
  for (const invId of new Set(caught.map((c) => c.recipientId))) {
    const safes = (fr?.cap?.safes ?? []).filter((s) => s.invId === invId && s.status !== 'converted');
    for (const s of safes) {
      if (!chance(state, rl + (rh - rl) * sev)) continue;
      post(state, { amount: -s.amount, counterparty: s.holder, description: 'SAFE rescission: investment returned (investor was misled)', category: 'investment', method: 'wire' });
      fr.cap.safes = fr.cap.safes.filter((x) => x !== s);
      (fr.rescissions ??= []).push({ day: state.day, holder: s.holder, amount: s.amount });
      rescinded.push(s);
    }
  }
  const back = rescinded.reduce((a, s) => a + s.amount, 0);
  penalize(state, caught, { audience: 'investor', functionId: 'fundraising', id: 'post_close_misrepresentation', label: 'Investors found the numbers you reported were false', app: 'fundraising', usd: legal + back, detail: `Surfaced via ${source}. Legal response ${money(legal)}${rescinded.length ? `; ${rescinded.length} SAFE holder(s) demanded and got their ${money(back)} back` : ''}. After money has moved a misstatement is a securities-fraud exposure, not a negotiating point.` });
  if (fr) {
    fr.reputation = (fr.reputation ?? 0) - 2 * (0.5 + sev);
    if (fr.ir) fr.ir.warmth = clamp((fr.ir.warmth ?? 0.6) - 0.3 - 0.2 * sev, 0, 1);
    fr.fraudFound = { day: state.day, sev: +sev.toFixed(2), source };
  }
  // Board removes the CEO when investors control it (HeadSpin: the board found out) [design odds].
  const control = fr?.governance?.control ?? 'founder';
  if (state.status === 'playing' && chance(state, (CLAIMS.removalP[control] ?? 0) * sev)) {
    state.status = 'dead';
    state.flags ??= {};
    state.flags.endReason = 'removed_by_board';
    logMistake(state, { functionId: 'fundraising', id: 'removed_by_board', label: 'Removed as CEO by the board', app: 'fundraising', delayed: true, cost: { reputation: 3 }, detail: `The board (control: ${control}) removed you after the misreported numbers came out. Founders are personally liable for fraud; the corporate form does not shield it.` });
    notify(state, 'The board voted to remove you as CEO after the misreported numbers came to light.', { type: 'bad', app: 'fundraising' });
  }
  return { legal, rescinded, sev };
}

// ---- Accelerators ----
/** Interview at the decision: 'pitch' strength. Returns caught claims (caught = rejected). */
export function accelInterview(state, id, label) {
  if (!openLies(state, { audience: 'accelerator', recipientId: id }).length) return [];
  const u = rng(state); // one interview, one judgement
  const r = verify(state, { audience: 'accelerator', recipientId: id, check: 'pitch', roll: () => u });
  if (r.caught.length) penalize(state, r.caught, { audience: 'accelerator', functionId: 'fundraising', id: 'accelerator_inflated', label: `${label} interview exposed inflated numbers`, app: 'fundraising', weight: 0.6, hours: 8, detail: 'Partners probed the traction in the 10-minute interview and it did not hold up; the 8-hour application was wasted.' });
  return r.caught;
}
/** In the program partners see the real Stripe numbers in office hours ('reference' strength). */
export function accelProgramCheck(state, id, label) {
  const r = verify(state, { audience: 'accelerator', recipientId: id, check: 'reference', final: true });
  if (!r.caught.length) return [];
  penalize(state, r.caught, { audience: 'accelerator', functionId: 'fundraising', id: 'accelerator_dismissed', label: `Asked to leave ${label}`, app: 'fundraising', detail: 'Partners saw the real numbers in office hours: no demo day, no batch intros, and the program\'s network hears why.' });
  const I = ensureIntegrity(state);
  I.reputation.investor = Math.min(1, (I.reputation.investor ?? 0) + 0.2); // demo-day investors talk to partners [design]
  const fr = frOf(state);
  if (fr) fr.reputation = (fr.reputation ?? 0) - 1;
  return r.caught;
}

// ---- Acquirer QoE (M&A) ----
/**
 * At the end of LOI diligence the buyer's quality of earnings and legal review ('audit') reads every open claim:
 * board decks and updates vs the books, misstatements to customers. → { caught, latentGap, outcome, cut }
 */
export function acquirerQoE(state, loi) {
  const r = verify(state, { audience: null, check: 'audit' });
  const latentGap = r.survived.reduce((a, c) => Math.max(a, c.gap), 0);
  if (!r.caught.length) return { caught: [], latentGap, outcome: 'clean', cut: 0 };
  const maxGap = r.maxGap;
  if (maxGap >= 0.5) {
    penalize(state, r.caught, { audience: 'acquirer', functionId: 'fundraising', id: 'qoe_caught_misstatement', label: 'The buyer\'s QoE found misstated numbers', app: 'fundraising', hours: 40, detail: `The ${loi.type?.toLowerCase() ?? 'buyer'} walked after quality of earnings: the exclusivity window and ~40 hours of diligence were wasted, and buyers on the marketplace hear.` });
    return { caught: r.caught, latentGap, outcome: 'dead', cut: 0 };
  }
  const cut = +(0.1 + 0.2 * Math.min(1, maxGap / 0.5)).toFixed(3);
  penalize(state, r.caught, { audience: 'acquirer', functionId: 'fundraising', id: 'qoe_retrade', label: 'QoE found overstatements: price re-traded', app: 'fundraising', weight: 0.5, usd: Math.round((loi.price ?? 0) * cut), detail: `Quality of earnings found gaps between what you reported and the books; price cut ${Math.round(cut * 100)}%.` });
  return { caught: r.caught, latentGap, outcome: 'retrade', cut };
}

// ---- Co-founder candidates ----
/** Trial project or first weeks as co-founder: they see the real dashboards. Returns caught claims. */
export function cofounderSeesTruth(state, c, { check = 'confirmatory' } = {}) {
  const r = verify(state, { audience: 'cofounder', recipientId: c.id, check, final: check === 'audit' });
  if (r.caught.length) penalize(state, r.caught, { audience: 'cofounder', functionId: 'hiring', id: 'cofounder_misled', label: `${c.name} found the traction you described was inflated`, app: 'cofounder', weight: 0.6, detail: `Once ${c.name} saw the real numbers ${check === 'audit' ? 'as your co-founder' : 'in the trial project'}, trust broke. Candidates talk in the same matching communities.` });
  return r.caught;
}

/** Multiplier on how fresh investors treat you (meeting and intro odds). */
export const investorRepMult = (state) => reputationMult(state, 'investor');
export const integrityScore = (state) => ensureIntegrity(state).score;
export { metricsSheet };
