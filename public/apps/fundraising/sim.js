// Fundraising simulation: the state slice, the daily tick (investor decisions, meetings on the calendar,
// closings, RBF repayments, accelerator/grant decisions, exit offers) and async LLM jobs (investor emails,
// replies). No DOM.

import { ensure, notify, log } from '../../core/state.js';
import { rng, chance, poisson, uid, clamp, dayOfWeek, dayOfMonth, monthIndex, fmtDate, money } from '../../core/util.js';
import { post, CATEGORIES } from '../../core/bank.js';
import { enqueue } from '../../core/jobs.js';
import { newThread, addMessage, ensureMail } from '../../core/mail.js';
import { REALISM } from '../../core/llm.js';
import { scheduleEvent, findSlots, moveEvent, completeEvent, ensureCalendar, fmtTime } from '../../core/calendar.js';
import { recordPublicEvent, ensureNetwork } from '../../core/network.js';
import { optionGrants } from '../people/capacity.js';
import { computeMetrics } from './metrics.js';
import { FOLLOWUP_DECAY, rescore, pMeeting, pPartner, pTermSheet, pAngelCommit, soloModifier, thesisFit, tractionMult, marketHeat, hardGate, computeTerms, investorScore, meetingFactor, delayDays, STAGE_LABEL } from './outcomes.js';
import { newCapTable, fdShares, pricedRound, issueCommonPct, applyMfn } from './captable.js';
import { personaSystem, channelFactor, isAngelLike, getLandscape, generateInvestors, fromArchetype, guessArchetype } from './investors.js';
import { rbfPayment, ACCELERATORS, GRANTS, acceleratorOdds, grantOdds } from './instruments.js';
import { exitValuation, offerRate, makeOffer, EXIT_FEES } from './exit.js';
import { waterfall } from './captable.js';
import { irDay, warmthMultiplier, insiders, insiderOdds, ensureIr } from './ir.js';
import { worldMult, worldOddsMult, concernPrompt, investorCompetitorPrompt } from './world.js';

// ---- Hours ([D] realistic durations) ----
export const HOURS = {
  evaluation: 2, // assemble data room + metrics sheet, read the panel feedback
  addInvestor: 0.25, // research one investor's thesis/portfolio
  importPerRow: 0.05,
  generateList: 2, // build a targeted list of ~10
  coldEmail: 0.15, // ~9 min personalized
  introBlurb: 0.3, // forwardable blurb + ask to the connector
  followUp: 0.1,
  // Review F6 [design]: an active raise takes ~50% of a founder's time (CRV/Waveup in fundraising.md §3).
  raiseOverheadPerWeek: 12, // scheduling, research, updates, data-room requests while a raise is active
  raiseOverheadBusy: 20, // when ≥5 investors are in active conversations
  partnerPrep: 3, // per partner meeting
  diligencePerWeek: 8, // while ≥1 investor is in diligence
  accelApp: 8,
  grantSession: 8,
  rbfApply: 3, // connect bank/Stripe/accounting, underwriting call
  exitPrepSession: 8, // diligence pack work session; 40h over ≥60 days (P&L, MRR waterfall reconciled to deposits, cohorts)
  exitPrepTotal: 40,
  exitDiligencePerWeek: 8, // answering buyer diligence during exclusivity
  exitListing: 2,
  termSheetReview: 1.5,
};
// [D] legal/closing costs
// Review F20 [D]: unmodified YC SAFE is free; a clean seed costs ~$12K company counsel (+$8K clean-up when
// legal issues exist) plus investor counsel, customarily capped (~$15K seed, ~$25K A).
export const LEGAL = { safe: 0, seed: 12000, 'series-a': 35000, cleanup: 8000, investorCounselCap: { seed: 15000, 'series-a': 25000 } };
export const LEAD_KINDS = ['seed_fund', 'multistage', 'micro_vc', 'cvc'];
export function canLeadPriced(inv, raise) {
  return Boolean(inv.leads) && LEAD_KINDS.includes(inv.kind) && (inv.checkMax ?? 0) >= 0.5 * (raise?.target ?? 0);
}
export const raiseActive = (state) => state.apps.fundraising?.raise?.status === 'active'; // for Product velocity ×0.6
export const FIRST_MEETING_MIN = 30, PARTNER_MEETING_MIN = 60;

export function ensureFr(state) {
  const fr = ensure(state, 'fundraising', () => ({}));
  fr.links ??= '';
  fr.deck ??= { files: [], text: '' };
  fr.linkedin ??= null;
  fr.evaluations ??= [];
  fr.investors ??= [];
  fr.meetings ??= [];
  fr.raise ??= null;
  fr.raises ??= [];
  fr.cap ??= newCapTable(state.founder.name);
  fr.closings ??= [];
  fr.loans ??= [];
  fr.accel ??= {};
  fr.grants ??= {};
  fr.exit ??= { listing: null, offers: [], loi: null };
  fr.rounds ??= [];
  fr.reputation ??= 0;
  fr.grantShares ??= {};
  return fr;
}

export const investorById = (fr, id) => fr.investors.find((i) => i.id === id);
export const meetingById = (fr, id) => fr.meetings.find((m) => m.id === id);
export const latestEval = (fr) => fr.evaluations.at(-1) ?? null;
export const totalRaised = (state) => (state.apps.fundraising?.rounds ?? []).reduce((a, r) => a + r.amount, 0);
export const monthsHistory = (state) => (state.stripe?.firstChargeDay != null ? (state.day - state.stripe.firstChargeDay) / 30.4 : 0);
const rnd = (state) => () => rng(state);

function forceHours(state, hours, label) {
  state.founder.hoursUsed += hours;
  state.founder.timeLog ??= [];
  state.founder.timeLog.push({ day: state.day, hours, label });
}
function invLog(state, inv, text) {
  inv.log ??= [];
  inv.log.push({ day: state.day, text });
}

// Share of the company held by departed founders (dead equity: a hard red flag for VCs at ≥10%).
export function deadEquity(cap) {
  const departed = (cap.founders ?? []).filter((f) => f.departed).reduce((a, f) => a + f.shares, 0);
  if (!departed) return 0;
  const fd = (cap.founders ?? []).reduce((a, f) => a + f.shares, 0) + (cap.common ?? []).reduce((a, c) => a + c.shares, 0) + (cap.preferred ?? []).reduce((a, p) => a + p.shares, 0) + (cap.pool ?? 0);
  return fd ? departed / fd : 0;
}

// Everything the odds need for the current raise (or a hypothetical stage).
export function raiseContext(state, stage = state.apps.fundraising?.raise?.stage ?? 'pre-seed') {
  const fr = ensureFr(state);
  const ev = latestEval(fr);
  const m = computeMetrics(state);
  // Review F8: re-rolling the panel doesn't help; use the mean of the last 3 evaluations within 30 days.
  const recent = ev ? fr.evaluations.filter((e) => e.day >= ev.day - 30).slice(-3) : [];
  let S = recent.length ? recent.reduce((a, e) => a + evalS(e, stage), 0) / recent.length : 2.2;
  if (ev?.hardFlags?.length || deadEquity(fr.cap) >= 0.1) S = Math.min(S, 3.29); // hard flags (incl. dead equity) cap at "maybe"
  S = clamp(S + clamp(fr.reputation * 0.1, -0.5, 0), 1, 5);
  const crit = ev?.criteria ?? null;
  const execution = crit?.execution?.avg ?? 2, traction = crit?.traction?.avg ?? 1;
  const lastPriced = fr.rounds.filter((r) => r.instrument === 'priced').at(-1);
  return {
    fr, ev, m, stage, S, crit, execution, traction,
    founderFit: crit?.founder_market_fit?.avg ?? 2,
    defensibility: crit?.defensibility?.avg ?? 2.5,
    // LANDSCAPE_2026 climate is "bifurcated": hot for AI leaders, slow for everyone else. [D] ±10%
    heat: marketHeat(monthIndex(state), getLandscape()?.climate?.heat === 'bifurcated' ? (m.isAI && (crit?.defensibility?.avg ?? 2.5) >= 3 ? 1.1 : 0.9) : null),
    leadIn: fr.raise ? fr.investors.some((i) => i.raiseId === fr.raise.id && i.leads && ['term_sheet', 'committed'].includes(i.status)) || (fr.raise.raised ?? 0) >= 0.3 * fr.raise.target : false,
    tooSoon: lastPriced && state.day - lastPriced.day < 365,
  };
}

export const evalS = (e, stage) => (e.stage === stage ? e.S : rescore(e.criteria, stage));
// An investor judges the deck that was current when you contacted them (snapshot at outreach).
function investorS(ctx, inv) {
  const snap = inv.evalId && ctx.fr.evaluations.find((e) => e.id === inv.evalId);
  if (!snap) return investorScore(ctx.crit, inv.weights, ctx.S);
  let S = evalS(snap, ctx.stage);
  if (snap.hardFlags?.length || deadEquity(ctx.fr.cap) >= 0.1) S = Math.min(S, 3.29);
  S = clamp(S + clamp(ctx.fr.reputation * 0.1, -0.5, 0), 1, 5);
  return investorScore(snap.criteria, inv.weights, S);
}
function fitFor(state, ctx, inv) {
  const raise = ctx.fr.raise;
  return thesisFit(inv, { stage: ctx.stage, oneLiner: state.company.oneLiner, icp: state.company.icp, model: state.company.model, isAI: ctx.m.isAI, defensibility: ctx.defensibility, roundSize: raise?.target ?? 0 });
}
export function meetingOdds(state, inv, warm, quality = 3) {
  const ctx = raiseContext(state);
  const S = investorS(ctx, inv);
  const stale = ctx.fr.raise && state.day > ctx.fr.raise.deadlineDay;
  // Consistent investor updates keep insiders warm, and warm insiders make better intros.
  return pMeeting({ inv, S, warm, channel: channelFactor(quality), fit: fitFor(state, ctx, inv), traction: tractionMult(ctx.traction), stale }) * (ctx.tooSoon ? 0.6 : 1) * (warm ? warmthMultiplier(state) : 1) * worldOddsMult(state);
}

// ---- Mail ----
export function threadFor(state, inv) {
  let t = inv.threadId && ensureMail(state).threads.find((x) => x.id === inv.threadId);
  if (!t) {
    t = newThread(state, { subject: `${state.company.name} × ${inv.firm || inv.name}`, with: { name: inv.name, email: inv.email, company: inv.firm }, kind: 'investor', app: 'fundraising', refId: inv.id });
    inv.threadId = t.id;
  }
  return t;
}
function investorEmail(state, inv, intent, extra = {}) {
  threadFor(state, inv);
  enqueue(state, 'fundraising:email', { invId: inv.id, intent, extra }, { label: `Email from ${inv.name}` });
}

// ---- Meetings on the calendar ----
export function scheduleMeeting(state, inv, kind) {
  const fr = ensureFr(state);
  const duration = kind === 'partner' ? PARTNER_MEETING_MIN : FIRST_MEETING_MIN;
  const slots = findSlots(state, { fromDay: state.day + 2, duration, count: 3 });
  if (!slots.length) { inv.pending = { type: 'schedule', kind, day: state.day + 1 }; return null; }
  const slot = slots[Math.floor(rng(state) * Math.min(2, slots.length))];
  const mtg = { id: uid('mtg'), invId: inv.id, kind, day: slot.day, start: slot.start, duration, status: 'scheduled', transcript: [], createdDay: state.day };
  try {
    const ev = scheduleEvent(state, { title: `${kind === 'partner' ? 'Partner meeting' : 'Pitch'}: ${inv.name} (${inv.firm || inv.archetypeLabel})`, kind: 'pitch', app: 'fundraising', refId: mtg.id, with: { name: inv.name, email: inv.email }, day: slot.day, start: slot.start, duration, location: 'Video call', notes: kind === 'partner' ? 'Full partnership. Expect harder questions.' : 'First meeting.' });
    mtg.eventId = ev.id;
  } catch {
    inv.pending = { type: 'schedule', kind, day: state.day + 1 };
    return null;
  }
  fr.meetings.push(mtg);
  inv.status = kind === 'partner' ? 'partner_meeting' : 'first_meeting';
  inv.pending = null;
  invLog(state, inv, `${kind === 'partner' ? 'Partner meeting' : 'First meeting'} booked for ${fmtDate(state, slot.day)} ${fmtTime(slot.start)}`);
  investorEmail(state, inv, kind === 'partner' ? 'partner_invite' : 'meeting_yes', { when: `${fmtDate(state, slot.day)} at ${fmtTime(slot.start)}` });
  notify(state, `${inv.name} (${inv.firm || inv.archetypeLabel}) wants to meet: ${kind === 'partner' ? 'partner meeting' : 'pitch'} on ${fmtDate(state, slot.day)} at ${fmtTime(slot.start)}. It's on your calendar.`, { type: 'good', app: 'fundraising' });
  return mtg;
}

function passReason(ctx, inv) {
  const c = ctx.crit;
  if (!c) return 'too early for us';
  if (ctx.m.isAI && c.defensibility.avg < 3) return 'AI defensibility: worried a foundation model or the incumbent ships this';
  const order = ['traction', 'founder_market_fit', 'market_why_now', 'business_model', 'defensibility'].sort((a, b) => c[a].avg - c[b].avg);
  if (ctx.m.solo && c.execution.avg < 3.5 && c.traction.avg < 3) return 'solo founder risk without a clear first-hire plan';
  return { traction: 'traction is too early for us', founder_market_fit: 'not convinced on founder-market fit yet', market_why_now: 'market size / why now isn\'t clear', business_model: 'unit economics and capital efficiency', defensibility: 'defensibility' }[order[0]];
}

export function passInvestor(state, inv, reason, { email = true } = {}) {
  inv.status = 'passed';
  inv.pending = null;
  inv.passReason = reason;
  invLog(state, inv, `Passed: ${reason}`);
  if (email) investorEmail(state, inv, 'pass', { reason });
}

// ---- Term sheets ----
function competingCount(fr) {
  return fr.investors.filter((i) => i.raiseId === fr.raise?.id && ['term_sheet', 'committed'].includes(i.status)).length;
}
export function offerTerms(state, inv) {
  const ctx = raiseContext(state);
  const fr = ctx.fr, raise = fr.raise;
  const S = investorS(ctx, inv);
  const terms = computeTerms({ stage: raise.stage, S, competing: competingCount(fr), isAI: ctx.m.isAI, rand: rnd(state), roundSize: raise.instrument === 'safe' ? raise.target : null });
  const vm = worldMult(state, 'valuationMult');
  if (vm !== 1) { terms.postMoney = Math.round(terms.postMoney * vm / 250000) * 250000; terms.preMoney = terms.postMoney - terms.amount; }
  const cmin = inv.checkMin ?? 25000, cmax = inv.checkMax ?? 100000;
  const check = clamp(Math.round((cmin + (cmax - cmin) * rng(state)) / 5000) * 5000, 5000, 5e7);
  const leadShare = 0.5 + 0.2 * rng(state); // leads take 50–70% of the round
  if (raise.instrument === 'safe') {
    // Review F3: investors only accept caps they can underwrite; weak founders get pushed down.
    const acceptable = Math.round(Math.min(inv.capMax || Infinity, terms.postMoney) / 250000) * 250000;
    if (raise.cap > 1.3 * acceptable) return { passCap: true, acceptable, askedCap: raise.cap };
    const isLead = inv.leads && !isAngelLike(inv);
    const amount = isLead ? clamp(leadShare * raise.target, cmin, cmax) : Math.min(check, Math.max(25000, raise.target - (raise.raised ?? 0)));
    const cap = Math.min(raise.cap, acceptable);
    return { instrument: 'safe', amount: Math.round(amount / 5000) * 5000, cap, discount: raise.discount ?? 0, mfn: Boolean(raise.mfn), proRata: amount >= (raise.proRataMin ?? Infinity), countered: cap !== raise.cap, askedCap: raise.cap };
  }
  if (canLeadPriced(inv, raise)) {
    const roundSize = terms.amount;
    const leadAmount = Math.round(clamp(leadShare * roundSize, cmin, cmax) / 100000) * 100000;
    return { instrument: 'priced', lead: true, amount: leadAmount, roundSize, preMoney: terms.preMoney, postMoney: terms.postMoney, poolTargetPost: terms.poolTargetPost, liqPref: 1, participating: false, boardSeat: raise.stage !== 'pre-seed', proRata: true };
  }
  return { instrument: 'priced', lead: false, amount: Math.min(check, Math.max(25000, raise.target * 0.3)), followOn: true };
}

function issueTermSheet(state, inv) {
  const t = offerTerms(state, inv);
  if (t.passCap) {
    invLog(state, inv, `Cap pushback: would only do ≤ ${money(t.acceptable)} (you asked ${money(t.askedCap)}).`);
    passInvestor(state, inv, `Your ${money(t.askedCap)} cap is too high for us at this stage; we could look at around ${money(t.acceptable)}.`);
    return;
  }
  inv.terms = t;
  inv.status = 'term_sheet';
  inv.termExpiresDay = state.day + 14; // [D] exploding offer window
  inv.pending = null;
  invLog(state, inv, `Term sheet: ${describeTerms(inv.terms)}`);
  investorEmail(state, inv, 'term_sheet', { terms: describeTerms(inv.terms) });
  notify(state, `${inv.name} sent ${inv.terms.instrument === 'safe' ? 'a SAFE commitment' : inv.terms.lead ? 'a term sheet' : 'a follow-on commitment'}: ${describeTerms(inv.terms)}. Respond within 14 days.`, { type: 'good', app: 'fundraising' });
}

export function describeTerms(t) {
  if (!t) return '';
  if (t.instrument === 'safe') return `${money(t.amount)} on a post-money SAFE at a ${money(t.cap)} cap${t.discount ? `, ${Math.round(t.discount * 100)}% discount` : ''}${t.mfn ? ', MFN' : ''}${t.proRata ? ', pro-rata side letter' : ''}${t.countered ? ` (you asked ${money(t.askedCap)})` : ''}`;
  if (t.lead) return `${money(t.amount)} of a ${money(t.roundSize ?? t.amount)} round at ${money(t.preMoney)} pre-money (${money(t.postMoney)} post), ${Math.round(t.poolTargetPost * 100)}% option pool post-money in the pre, 1x non-participating preferred${t.boardSeat ? ', 1 board seat' : ''}`;
  return `${money(t.amount)} alongside a lead, at the lead's terms`;
}

// Player accepts a term sheet (UI). Returns error string or null.
export function acceptTerms(state, inv) {
  if ((state.company.entity ?? 'none') !== 'ccorp') return 'Investors only sign SAFEs and priced rounds with a Delaware C-corp. Convert/incorporate in the Legal app first.';
  const fr = ensureFr(state);
  const t = inv.terms;
  inv.status = 'committed';
  invLog(state, inv, 'You signed.');
  if (t.instrument === 'safe') {
    // SAFEs close in 1–2 weeks; syndicate SPVs take 18–28 days to fill (LANDSCAPE_2026.angels.spv).
    const [a, b] = inv.kind === 'syndicate' ? (getLandscape()?.angels?.spv?.daysToClose ?? [18, 28]) : [7, 14];
    fr.closings.push({ id: uid('cl'), kind: 'safe', invId: inv.id, raiseId: inv.raiseId, day: state.day + a + Math.floor(rng(state) * (b - a + 1)), amount: t.amount, terms: t });
  } else if (t.lead) {
    fr.closings.push({ id: uid('cl'), kind: 'priced', invId: inv.id, raiseId: inv.raiseId, day: state.day + 30 + Math.floor(rng(state) * 15), amount: t.amount, terms: t });
    notify(state, `Lead signed for ${money(t.amount)} of a ${money(t.roundSize ?? t.amount)} round. Fill the rest with followers before closing.`, { app: 'fundraising' });
    // other open term sheets from leads are now moot
    for (const o of fr.investors) if (o !== inv && o.raiseId === inv.raiseId && o.status === 'term_sheet' && o.terms?.lead) passInvestor(state, o, 'You went with another lead.', { email: false });
  }
  investorEmail(state, inv, 'signed', {});
  return null;
}

// One counter on a priced term sheet: ask for a higher pre-money. [D] odds rise with competition.
export function counterTerms(state, inv, askedPre) {
  const fr = ensureFr(state);
  const t = inv.terms;
  if (t.countered) return 'You already countered once.';
  const ratio = askedPre / t.preMoney;
  const p = clamp(0.35 + 0.2 * (competingCount(fr) - 1) - 1.2 * Math.max(0, ratio - 1.15), 0.05, 0.85);
  t.countered = true;
  if (chance(state, p)) {
    t.preMoney = Math.round(Math.min(askedPre, t.preMoney * 1.3) / 100000) * 100000;
    t.postMoney = t.preMoney + t.amount;
    investorEmail(state, inv, 'counter_yes', { terms: describeTerms(t) });
    return `They agreed: ${describeTerms(t)}.`;
  }
  if (chance(state, 0.2)) { passInvestor(state, inv, 'Valuation expectations too far apart.'); return 'They walked away.'; }
  investorEmail(state, inv, 'counter_no', { terms: describeTerms(t) });
  return 'They held firm on the original terms.';
}

// ---- Closings ----
function close(state, cl) {
  const fr = ensureFr(state);
  const inv = cl.invId ? investorById(fr, cl.invId) : null;
  if (cl.kind === 'safe') {
    post(state, { amount: cl.amount, counterparty: inv?.firm || inv?.name || cl.holder, description: `Post-money SAFE (${money(cl.terms.cap)} cap)`, category: 'investment', method: 'wire' });
    fr.cap.safes.push({ id: uid('safe'), holder: inv ? `${inv.name}${inv.firm && !inv.firm.includes('(individual)') ? ` (${inv.firm})` : ''}` : cl.holder, amount: cl.amount, cap: cl.terms.cap ?? null, discount: cl.terms.discount ?? 0, mfn: Boolean(cl.terms.mfn), proRata: Boolean(cl.terms.proRata), day: state.day, status: 'outstanding' });
    fr.cap.safes = applyMfn(fr.cap.safes);
    if (cl.terms.cap) fr.lastPostMoney = cl.terms.cap; // Legal reads this for 409A / 83(b) math
    if (LEGAL.safe && cl.legal !== false) post(state, { amount: -LEGAL.safe, counterparty: 'E-sign & SAFE docs', description: 'SAFE paperwork', category: 'legal', method: 'card' });
    const r = fr.raises.find((x) => x.id === cl.raiseId) ?? (fr.raise?.id === cl.raiseId ? fr.raise : null);
    if (r) r.raised = (r.raised ?? 0) + cl.amount;
    fr.rounds.push({ id: uid('rd'), day: state.day, instrument: 'safe', stage: cl.stage ?? r?.stage ?? 'pre-seed', amount: cl.amount, label: cl.label ?? `SAFE from ${inv?.name ?? cl.holder}`, cap: cl.terms.cap });
    notify(state, `${money(cl.amount)} SAFE from ${inv?.name ?? cl.holder} landed in your bank.`, { type: 'good', app: 'fundraising' });
    if (inv) { inv.closedDay = state.day; invLog(state, inv, 'Wired.'); }
  } else if (cl.kind === 'priced') {
    const raise = fr.raise?.id === cl.raiseId ? fr.raise : null;
    const followers = fr.investors.filter((i) => i.raiseId === cl.raiseId && i.status === 'committed' && i.terms?.followOn);
    const roundSize = cl.terms.roundSize ?? cl.amount;
    let amounts = [{ name: inv?.firm || inv?.name || 'Lead', amount: cl.amount }, ...followers.map((f) => ({ name: f.firm || f.name, amount: f.terms.amount }))];
    let total = amounts.reduce((a, x) => a + x.amount, 0);
    // The lead holds the close open while followers fill the round (up to two 2-week extensions).
    if (total < 0.8 * roundSize && (cl.extensions ?? 0) < 2) {
      cl.extensions = (cl.extensions ?? 0) + 1;
      cl.day = state.day + 14;
      notify(state, `${inv?.name ?? 'Your lead'} is holding the close: ${money(total)} of ${money(roundSize)} committed. Bring in followers (angels, funds that don't lead) within 2 weeks.`, { type: 'warn', app: 'fundraising' });
      return;
    }
    if (total > 1.25 * roundSize) { const k = (1.25 * roundSize) / total; amounts = amounts.map((a) => ({ ...a, amount: Math.round(a.amount * k / 1000) * 1000 })); total = amounts.reduce((a, x) => a + x.amount, 0); }

    const series = raise?.stage === 'series-a' ? 'Series A' : 'Seed';
    const res = pricedRound(fr.cap, { preMoney: cl.terms.preMoney, investment: total, poolTargetPost: cl.terms.poolTargetPost, series, investor: amounts[0].name, day: state.day });
    const lead = res.cap.preferred.pop();
    for (const a of amounts) res.cap.preferred.push({ ...lead, id: uid('pr'), holder: a.name, invested: a.amount, shares: Math.round(a.amount / res.price) });
    fr.cap = res.cap;
    fr.lastPostMoney = cl.terms.preMoney + total;
    for (const a of amounts) post(state, { amount: a.amount, counterparty: a.name, description: `${series} preferred stock purchase`, category: 'investment', method: 'wire' });
    const stg = raise?.stage === 'series-a' ? 'series-a' : 'seed';
    const cleanup = (computeMetrics(state).legal ?? []).length ? LEGAL.cleanup : 0;
    post(state, { amount: -(LEGAL[stg] + cleanup), counterparty: 'Startup law firm', description: `${series} company counsel${cleanup ? ' (incl. clean-up)' : ''}`, category: 'legal', method: 'ach' });
    post(state, { amount: -Math.min(LEGAL.investorCounselCap[stg], Math.round(total * 0.004)), counterparty: `${amounts[0].name} counsel`, description: `${series} investor counsel (company pays, capped)`, category: 'legal', method: 'ach' });
    fr.rounds.push({ id: uid('rd'), day: state.day, instrument: 'priced', stage: raise?.stage ?? 'seed', amount: total, label: `${series} led by ${amounts[0].name}`, preMoney: cl.terms.preMoney, postMoney: cl.terms.preMoney + total, price: res.price, poolTopUp: res.poolTopUp });
    for (const f of followers) f.closedDay = state.day;
    if (inv) inv.closedDay = state.day;
    if (raise) { raise.raised = (raise.raised ?? 0) + total; endRaise(state, 'closed'); }
    recordPublicEvent(state, 'funding_announced', { amount: total });
    notify(state, `${series} closed: ${money(total)} at ${money(cl.terms.preMoney)} pre-money. ${res.conversions.length ? `${res.conversions.length} SAFE(s) converted. ` : ''}Option pool topped up by ${Math.round(res.poolTopUp).toLocaleString('en-US')} shares (in the pre-money).`, { type: 'good', app: 'fundraising' });
  } else if (cl.kind === 'accelerator') {
    const prog = ACCELERATORS[cl.program];
    for (const part of prog.parts) {
      if (part.kind === 'safe') {
        post(state, { amount: part.amount, counterparty: prog.label, description: part.label, category: 'investment', method: 'wire' });
        if (part.cap) fr.lastPostMoney = part.cap;
        fr.cap.safes.push({ id: uid('safe'), holder: `${prog.label}${part.mfn ? ' (MFN)' : ''}`, amount: part.amount, cap: part.cap, discount: 0, mfn: part.mfn, proRata: part.proRata, day: state.day, status: 'outstanding' });
      } else if (part.kind === 'common') {
        post(state, { amount: part.amount, counterparty: prog.label, description: part.label, category: 'investment', method: 'wire' });
        fr.cap = issueCommonPct(fr.cap, { name: prog.label, pct: part.pct, note: 'Common (accelerator)' });
      }
    }
    fr.cap.safes = applyMfn(fr.cap.safes);
    const cash = prog.parts.filter((p) => p.kind !== 'commitment').reduce((a, p) => a + p.amount, 0);
    fr.rounds.push({ id: uid('rd'), day: state.day, instrument: 'accelerator', stage: 'pre-seed', amount: cash, label: `${prog.label} standard deal` });
    recordPublicEvent(state, 'funding_announced', { amount: cash });
    notify(state, `${prog.label} funding arrived: ${money(cash)}.`, { type: 'good', app: 'fundraising' });
  } else if (cl.kind === 'rbf') {
    post(state, { amount: cl.amount, counterparty: cl.label, description: 'Revenue-based financing advance', category: 'loan', method: 'ach' });
    fr.loans.push({ id: uid('loan'), provider: cl.provider, label: cl.label, advance: cl.amount, total: cl.offer.total, remaining: cl.offer.total, repayPct: cl.offer.repayPct ?? 0, installment: cl.offer.installment ?? 0, schedule: cl.offer.schedule, startDay: state.day, paid: 0 });
    notify(state, `${cl.label}: ${money(cl.amount)} advance funded. Repayments start next cycle.`, { type: 'good', app: 'fundraising' });
  }
  cl.done = true;
}

export function endRaise(state, status) {
  const fr = ensureFr(state);
  if (!fr.raise) return;
  fr.raise.status = status;
  fr.raise.endDay = state.day;
  fr.raises.push(fr.raise);
  fr.raise = null;
}

// Hard gates and legal blockers run before EVERY term sheet, angels included (review F1).
function gateAndIssue(state, inv, ctx) {
  const gate = hardGate(ctx.stage, ctx.m, { S: ctx.S, founderFit: ctx.founderFit });
  if (gate) return passInvestor(state, inv, gate);
  const blockers = (ctx.m.legal ?? []).filter((x) => /83\(b\)|IP assignment|CIIAA|Not incorporated|LLC/.test(x));
  if (blockers.length && !inv.legalHold) {
    inv.legalHold = true;
    inv.status = 'diligence';
    inv.pending = { type: 'diligenceDone', day: state.day + 14 };
    invLog(state, inv, `Diligence paused on legal issues: ${blockers.join('; ')}`);
    investorEmail(state, inv, 'diligence', {});
    notify(state, `${inv.name}'s counsel flagged: ${blockers.join(' · ')}. Fix them in Legal within 2 weeks or they walk.`, { type: 'warn', app: 'fundraising' });
    return;
  }
  if (blockers.length) return passInvestor(state, inv, `Legal diligence issues were not fixed: ${blockers[0]}`);
  if (inv.evalMrr > 0 && ctx.m.mrr < inv.evalMrr * 0.8) return passInvestor(state, inv, 'Your numbers moved the wrong way during diligence.');
  issueTermSheet(state, inv);
}
function toDiligence(state, inv, ctx, days) {
  inv.status = 'diligence';
  inv.evalMrr = ctx.m.mrr;
  inv.pending = { type: 'diligenceDone', day: state.day + days };
  invLog(state, inv, 'Moved to diligence.');
  investorEmail(state, inv, 'diligence', {});
  notify(state, `${inv.name} is moving to diligence. Expect data-room requests (founder hours each week).`, { type: 'good', app: 'fundraising' });
}

// ---- Decisions ----
function decide(state, inv) {
  const fr = ensureFr(state);
  const p = inv.pending;
  if (!fr.raise || inv.raiseId !== fr.raise.id) {
    if (p.type !== 'schedule') { inv.pending = null; if (!['committed', 'passed'].includes(inv.status)) { inv.status = 'researching'; invLog(state, inv, 'Raise ended; parked.'); } }
    return;
  }
  const ctx = raiseContext(state);
  const S = investorS(ctx, inv);
  const solo = soloModifier({ solo: ctx.m.solo, execution: ctx.execution, traction: ctx.traction, prefersSolo: inv.prefersSolo });
  const lastMtg = fr.meetings.filter((m) => m.invId === inv.id && m.status === 'done').at(-1);
  const mf = meetingFactor(lastMtg?.perf) * worldOddsMult(state); // market events (AI lab launches, rival raises)
  switch (p.type) {
    case 'schedule':
      scheduleMeeting(state, inv, p.kind);
      break;
    case 'intro': {
      if (chance(state, inv.introOdds ?? 0.6)) {
        inv.status = 'contacted';
        inv.outreach.channel = 'warm';
        inv.outreach.introDay = state.day;
        invLog(state, inv, `Intro made via ${inv.warmPath}.`);
        inv.pending = { type: 'reply', day: state.day + delayDays(inv, 'reply', rnd(state)) };
      } else {
        inv.status = 'researching';
        inv.pending = null;
        invLog(state, inv, 'Connector never made the intro.');
        notify(state, `Your intro to ${inv.name} didn't happen: ${inv.warmPath} went quiet. Try another path or a cold email.`, { app: 'fundraising' });
      }
      break;
    }
    case 'reply': {
      const warm = inv.outreach?.channel === 'warm';
      const fu = Math.min(3, inv.outreach?.followUps ?? 0);
      const pm = meetingOdds(state, inv, warm, inv.outreach?.quality ?? 3) * FOLLOWUP_DECAY[fu];
      inv.outreach.pMeeting = pm;
      if (chance(state, pm)) scheduleMeeting(state, inv, 'first');
      else if (warm) passInvestor(state, inv, passReason(ctx, inv));
      else if (chance(state, 0.03)) passInvestor(state, inv, passReason(ctx, inv)); // most cold emails get no reply at all
      else { inv.ghosted = true; inv.pending = null; invLog(state, inv, 'No reply.'); }
      break;
    }
    case 'afterFirst': {
      const priced = fr.raise.instrument === 'priced';
      const institutionalLead = priced ? canLeadPriced(inv, fr.raise) : inv.leads && !isAngelLike(inv);
      if (institutionalLead) {
        const pp = pPartner({ S, solo, meeting: mf });
        if (chance(state, pp)) scheduleMeeting(state, inv, 'partner');
        else passInvestor(state, inv, passReason(ctx, inv));
        break;
      }
      // Angels, syndicates, scouts, family offices and non-lead funds: one meeting, then commit or pass.
      // Followers commit far more readily once a lead (or meaningful money) is in: LANDSCAPE funnel.leadPresentFollowerMultiplier.
      const followerMult = ctx.leadIn ? (getLandscape()?.funnel?.leadPresentFollowerMultiplier ?? 2) : 1;
      const pc = clamp(pAngelCommit({ S, solo, meeting: mf }) * ctx.heat * followerMult, 0, 0.8);
      if (!chance(state, pc)) { passInvestor(state, inv, passReason(ctx, inv)); break; }
      if (inv.kind === 'angel_group') {
        const [a, b] = getLandscape()?.angels?.angelGroupDecisionDays ?? [30, 90]; // screening committee + diligence team
        toDiligence(state, inv, ctx, Math.round(a + (b - a) * rng(state)));
      } else gateAndIssue(state, inv, ctx);
      break;
    }
    case 'afterPartner': {
      const pt = pTermSheet({ S, heat: ctx.heat, meeting: mf, traction: ctx.traction });
      if (chance(state, pt)) {
        const extra = (ctx.ev?.disagreement ?? 0) > 1 ? 7 : 0; // partner debate → one extra week
        toDiligence(state, inv, ctx, delayDays(inv, 'diligence', rnd(state), ctx.m.solo) + extra);
      } else passInvestor(state, inv, passReason(ctx, inv));
      break;
    }
    case 'diligenceDone':
      gateAndIssue(state, inv, ctx);
      break;
    default:
      inv.pending = null;
  }
}

// After the player ends a pitch meeting (UI calls this with the judged performance).
export function meetingDone(state, mtg, perf, summary) {
  const fr = ensureFr(state);
  const inv = investorById(fr, mtg.invId);
  mtg.status = 'done';
  mtg.perf = perf;
  mtg.summary = summary;
  if (mtg.eventId) completeEvent(state, mtg.eventId, 'done', `Performance ${perf}/5`);
  if (!inv) return;
  invLog(state, inv, `${mtg.kind === 'partner' ? 'Partner meeting' : 'First meeting'} held (performance ${perf}/5).`);
  inv.pending = { type: mtg.kind === 'partner' ? 'afterPartner' : 'afterFirst', day: state.day + delayDays(inv, mtg.kind === 'partner' ? 'afterPartner' : 'afterFirst', rnd(state), computeMetrics(state).solo) };
}

// ---- Daily tick ----
export function fundraisingDay(state) {
  const fr = ensureFr(state);
  const monday = dayOfWeek(state) === 1;

  // Option grants from People → frozen share counts on the cap table.
  try {
    const grants = optionGrants(state);
    for (const g of grants) if (fr.grantShares[g.name] == null) fr.grantShares[g.name] = Math.round(((g.pct ?? 0) / 100) * fdShares(fr.cap));
    fr.cap.grants = grants.map((g) => ({ name: g.name, shares: fr.grantShares[g.name] ?? 0 }));
  } catch { /* people app not ready */ }

  // Weekly founder-hour costs of an active process.
  if (monday) {
    if (fr.raise?.status === 'active') {
      const busy = fr.investors.filter((i) => ['first_meeting', 'partner_meeting', 'diligence', 'term_sheet'].includes(i.status)).length >= 5;
      forceHours(state, busy ? HOURS.raiseOverheadBusy : HOURS.raiseOverheadPerWeek, 'Fundraising process (research, scheduling, updates, data room) [design]');
    }
    if (fr.investors.some((i) => i.status === 'diligence')) forceHours(state, HOURS.diligencePerWeek, 'Investor diligence requests [design]');
    if (fr.exit?.loi && !fr.exit.loi.closed) forceHours(state, HOURS.exitDiligencePerWeek, 'Buyer diligence during exclusivity [design]');
    for (const [id, a] of Object.entries(fr.accel)) if (a.status === 'enrolled') forceHours(state, ACCELERATORS[id].hoursPerWeek, `${ACCELERATORS[id].label} program`);
  }

  // Meetings: founder no-shows, investor reschedules.
  const cal = ensureCalendar(state);
  for (const mtg of fr.meetings) {
    if (mtg.status !== 'scheduled') continue;
    const ev = cal.events.find((e) => e.id === mtg.eventId);
    const inv = investorById(fr, mtg.invId);
    if (!ev || ['unattended', 'missed', 'canceled'].includes(ev.status)) {
      mtg.status = 'no_show';
      fr.reputation -= 1;
      if (inv && inv.status !== 'passed') passInvestor(state, inv, 'Founder no-showed the meeting.');
      notify(state, `You missed your ${mtg.kind === 'partner' ? 'partner meeting' : 'pitch'} with ${inv?.name ?? 'an investor'}. They passed, and word travels.`, { type: 'bad', app: 'fundraising' });
      continue;
    }
    mtg.day = ev.day; mtg.start = ev.start;
    if (mtg.kind === 'partner' && ev.day === state.day + 1 && !mtg.prepCharged) { mtg.prepCharged = true; forceHours(state, HOURS.partnerPrep, `Partner meeting prep: ${inv?.name ?? ''}`); }
    if (ev.day === state.day + 1 && !mtg.rescheduleRolled) {
      mtg.rescheduleRolled = true;
      if (chance(state, 0.06)) { // [D] investors reschedule sometimes
        const slot = findSlots(state, { fromDay: state.day + 3, duration: mtg.duration, count: 1 })[0];
        if (slot) {
          try { moveEvent(state, ev.id, slot.day, slot.start); mtg.day = slot.day; mtg.start = slot.start; if (inv) investorEmail(state, inv, 'reschedule', { when: `${fmtDate(state, slot.day)} at ${fmtTime(slot.start)}` }); } catch { /* keep */ }
        }
      }
    }
  }

  // Investor decisions and term-sheet expiry.
  for (const inv of fr.investors) {
    if (inv.pending && inv.pending.day <= state.day) decide(state, inv);
    if (inv.status === 'term_sheet' && inv.termExpiresDay < state.day) passInvestor(state, inv, 'Offer expired without a response.');
  }

  // Raise time-box.
  const r = fr.raise;
  if (r?.status === 'active' && state.day === r.deadlineDay) notify(state, `Your ${r.stage} raise has hit its time box. Rounds that drag on look stale to investors: close what you have or reset.`, { type: 'warn', app: 'fundraising' });

  // Closings.
  for (const cl of fr.closings) if (!cl.done && cl.day <= state.day) close(state, cl);
  fr.closings = fr.closings.filter((c) => !c.done);

  // RBF repayments: % of revenue or fixed installments on the 1st; Stripe-style withheld weekly.
  for (const loan of fr.loans) {
    if (loan.remaining <= 0) continue;
    const due = loan.schedule === 'stripe' ? monday : dayOfMonth(state) === 1 && state.day > loan.startDay + 5;
    if (!due) continue;
    const window = loan.schedule === 'stripe' ? 7 : 30;
    const revenue = (state.stripe?.charges ?? []).filter((c) => c.day > state.day - window && c.status === 'succeeded').reduce((a, c) => a + c.amount, 0);
    const pay = rbfPayment(loan, revenue);
    if (pay > 0) {
      post(state, { amount: -pay, counterparty: loan.label, description: loan.schedule === 'fixed' ? 'Fixed installment' : `${(loan.repayPct * 100).toFixed(1)}% of revenue`, category: 'loan_repayment', method: 'ach' });
      loan.remaining = Math.round((loan.remaining - pay) * 100) / 100;
      loan.paid += pay;
      if (loan.remaining <= 0.01) { loan.remaining = 0; loan.repaidDay = state.day; notify(state, `${loan.label} fully repaid.`, { type: 'good', app: 'fundraising' }); }
    }
  }

  // Accelerators.
  for (const [id, a] of Object.entries(fr.accel)) {
    const prog = ACCELERATORS[id];
    if (a.status === 'applied' && a.decisionDay <= state.day) {
      if (chance(state, a.odds)) { a.status = 'accepted'; a.offerExpires = state.day + 14; notify(state, `${prog.label} accepted you! Standard deal: ${prog.summary} Accept within 14 days.`, { type: 'good', app: 'fundraising' }); }
      else { a.status = 'rejected'; notify(state, `${prog.label} declined your application. Most strong companies get rejected at least once; reapply with more traction.`, { app: 'fundraising' }); }
    }
    if (a.status === 'accepted' && a.offerExpires < state.day) a.status = 'declined';
    if (a.status === 'enrolled' && a.endDay <= state.day) { a.status = 'done'; notify(state, `${prog.label} demo day is done. Investor interest from the batch helps your next raise.`, { type: 'good', app: 'fundraising' }); fr.reputation += 1; }
  }

  // Grants.
  for (const [id, g] of Object.entries(fr.grants)) {
    if (g.status === 'submitted' && g.decisionDay <= state.day) {
      if (chance(state, g.odds)) {
        g.status = 'awarded';
        post(state, { amount: g.amount, counterparty: 'SBIR program agency', description: `${GRANTS[id].label} award`, category: CATEGORIES.grant ? 'grant' : 'other', method: 'ach' });
        notify(state, `${GRANTS[id].label} awarded: ${money(g.amount)} non-dilutive.`, { type: 'good', app: 'fundraising' });
      } else { g.status = 'declined'; notify(state, `${GRANTS[id].label} not funded this cycle.`, { app: 'fundraising' }); }
    }
  }

  // Investor relations: updates/warmth, board meetings, advisors.
  irDay(state);

  // Exit marketplace.
  exitDay(state, fr, monday);
}

function sdeOf(state, m) {
  // Annualized: MRR×12 − annualized burn-equivalent costs, plus the founder's salary add-back.
  // burn includes the owner draw; SDE adds the owner's pay back.
  return (-m.burn + (state.founder.salary ?? 0)) * 12;
}
export function exitFair(state) {
  const m = computeMetrics(state);
  const ownerDependent = m.teamSize <= 1;
  return { m, ...exitValuation(m, { sde: sdeOf(state, m), monthsHistory: monthsHistory(state), ownerDependent }) };
}

function exitDay(state, fr, monday) {
  const ex = fr.exit;
  if (ex.loi && ex.loi.closeDay <= state.day && !ex.loi.closed) {
    const m = computeMetrics(state);
    if (chance(state, 0.1)) { // [D] buyers walk in diligence
      notify(state, `The buyer walked away during diligence (${ex.loi.type}). Back on the market.`, { type: 'bad', app: 'fundraising' });
      ex.loi = null;
      return;
    }
    let price = ex.loi.price;
    if (m.mrr < ex.loi.mrrAtLoi * 0.9) {
      price = Math.round(price * (m.mrr / ex.loi.mrrAtLoi) / 1000) * 1000;
      notify(state, `Buyer re-traded after MRR fell during diligence: price cut to ${money(price)}.`, { type: 'warn', app: 'fundraising' });
    }
    const cash = Math.round(price * (ex.loi.cashAtClose / ex.loi.price));
    const debt = fr.loans.reduce((a, l) => a + l.remaining, 0);
    const wf = waterfall(fr.cap, cash, { debt, fees: price * EXIT_FEES });
    ex.loi.closed = true;
    ex.result = { day: state.day, price, cash, earnout: price - cash, founderTake: wf.founderTake, debt, fees: price * EXIT_FEES, payouts: wf.payouts };
    state.status = 'exited';
    notify(state, `You sold ${state.company.name} for ${money(price)} (${money(cash)} at close${price > cash ? `, ${money(price - cash)} earnout` : ''}). After fees, debt and the preference stack you take home ${money(wf.founderTake)} before tax.`, { type: 'good', app: 'fundraising' });
    log(state, 'good', `Exit: ${money(price)}; founder take-home ${money(wf.founderTake)}.`, 'fundraising');
    return;
  }
  if (!ex.listing?.active || ex.loi || !monday) return;
  const fair = exitFair(state);
  ex.listing.fair = fair.value;
  ex.offers = ex.offers.filter((o) => o.expiresDay >= state.day);
  const n = poisson(state, offerRate(fair.value, ex.listing.ask, fair.m.arr, fair.quality));
  for (let i = 0; i < n; i++) {
    const o = makeOffer({ fair: fair.value, ask: ex.listing.ask, rand: rnd(state) });
    ex.offers.push({ id: uid('off'), day: state.day, expiresDay: state.day + 21, ...o });
    notify(state, `New LOI on your listing: ${money(o.price)} from a ${o.type.toLowerCase()} (${money(o.cashAtClose)} cash at close).`, { type: 'good', app: 'fundraising' });
  }
}

// ---- Async jobs ----
const EMAIL_SCHEMA = { type: 'object', additionalProperties: false, required: ['body'], properties: { body: { type: 'string' } } };

function companyLine(state) {
  const m = computeMetrics(state);
  return `${state.company.name}: ${state.company.oneLiner || 'early-stage SaaS'} (MRR $${Math.round(m.mrr)}, ${m.customers} customers, ${m.solo ? 'solo founder' : 'team'})`;
}

const TEMPLATES = {
  meeting_yes: (inv, x) => `Thanks for reaching out. Happy to chat. I sent an invite for ${x.when}, 30 minutes. Please come ready to walk through the numbers.\n\n${inv.name.split(' ')[0]}`,
  partner_invite: (inv, x) => `Enjoyed our conversation. I'd like you to meet the partnership: ${x.when}, 60 minutes. Expect hard questions on defensibility and the path to the next round.\n\n${inv.name.split(' ')[0]}`,
  pass: (inv, x) => `Thanks for the time and for sharing the deck. We're going to pass for now: ${x.reason}. Happy to stay in touch; send an update when things change.\n\n${inv.name.split(' ')[0]}`,
  diligence: (inv) => `We'd like to move forward to diligence. Can you share: monthly MRR by customer for the last 12 months, bank statements, cap table, and 2–3 customer references?\n\n${inv.name.split(' ')[0]}`,
  term_sheet: (inv, x) => `Excited to put forward terms: ${x.terms}. This is open for 14 days. Let me know if you have questions.\n\n${inv.name.split(' ')[0]}`,
  signed: (inv) => `Great, thrilled to be partnering. Our team will send wiring instructions and closing docs.\n\n${inv.name.split(' ')[0]}`,
  counter_yes: (inv, x) => `We can make that work: ${x.terms}.\n\n${inv.name.split(' ')[0]}`,
  counter_no: (inv, x) => `We've thought about it and we're holding at the original terms: ${x.terms}. Still very keen.\n\n${inv.name.split(' ')[0]}`,
  reschedule: (inv, x) => `Apologies, something came up. Could we move to ${x.when}? I've updated the invite.\n\n${inv.name.split(' ')[0]}`,
};
const INTENT_BRIEF = {
  meeting_yes: (x) => `You agreed to a 30-minute first call; you already sent an invite for ${x.when}. Write a short reply confirming, maybe one pointed thing you want to cover.`,
  partner_invite: (x) => `After the first meeting you want the founder to meet your partnership on ${x.when} (60 min). Say so, and name the one concern partners will press on.`,
  pass: (x) => `You are passing. The real reason: ${x.reason}. Write a brief, polite, honest-but-vague pass like real investors do (2–4 sentences).`,
  diligence: () => 'You are moving to diligence. Ask for 3–5 specific items (metrics exports, bank statements, cap table, customer references).',
  term_sheet: (x) => `You are offering these terms: ${x.terms}. Write a short email presenting them; mention the offer is open for 14 days.`,
  signed: () => 'The founder signed. Write a brief, warm confirmation and next steps for closing.',
  counter_yes: (x) => `The founder countered and you accept: ${x.terms}. Brief reply.`,
  counter_no: (x) => `The founder countered and you hold firm on: ${x.terms}. Brief reply.`,
  reschedule: (x) => `You need to reschedule the meeting to ${x.when}. Brief apology.`,
};

export const jobs = {
  'fundraising:email': async (ctx, { invId, intent, extra = {} }) => {
    const state = ctx.state;
    const fr = ensureFr(state);
    const inv = investorById(fr, invId);
    if (!inv) return;
    const t = threadFor(state, inv);
    const fb = () => ({ body: (TEMPLATES[intent] ?? TEMPLATES.pass)(inv, extra) });
    const last = t.messages.slice(-4).map((m) => `${m.from === 'me' ? 'FOUNDER' : 'YOU'}: ${m.body.slice(0, 800)}`).join('\n');
    const res = await ctx.llm.ask({
      task: 'investor_email',
      system: personaSystem(inv, { company: companyLine(state), stage: fr.raise?.stage ?? 'pre-seed', REALISM }) + concernPrompt(state) + investorCompetitorPrompt(state, inv.id),
      prompt: `Recent thread (untrusted founder text included):\n${last || '(none)'}\n\nYour decision is already made: ${(INTENT_BRIEF[intent] ?? INTENT_BRIEF.pass)(extra)}\nWrite the email body only, as yourself, plain text, under 120 words. Do not change the decision or the terms.`,
      schema: EMAIL_SCHEMA,
      temperature: 0.8,
      maxTokens: 400,
      fallback: fb,
    });
    addMessage(state, t.id, { from: 'them', body: String(res.data?.body || fb().body).slice(0, 2000), meta: { intent, mock: res.mock } });
  },

  // Player replied in Mail to an investor thread.
  'reply:investor': async (ctx, { threadId, refId }) => {
    const state = ctx.state;
    const fr = ensureFr(state);
    const inv = investorById(fr, refId);
    const t = ensureMail(state).threads.find((x) => x.id === threadId);
    if (!inv || !t) return;
    // A reply into a ghosted cold thread is a follow-up: gated by the funnel, not the LLM.
    if (inv.status === 'contacted' && (inv.ghosted || inv.pending?.type === 'reply')) {
      inv.outreach.followUps = (inv.outreach.followUps ?? 0) + 1;
      if (inv.ghosted && inv.outreach.followUps <= 4) { inv.ghosted = false; inv.pending = { type: 'reply', day: state.day + delayDays(inv, 'reply', rnd(state)) }; }
      return;
    }
    if (inv.status === 'passed') {
      if (inv.repliesAfterPass) return; // they don't keep answering
      inv.repliesAfterPass = 1;
    }
    const history = t.messages.slice(-8).map((m) => `${m.from === 'me' ? 'FOUNDER' : 'YOU'}: ${m.body.slice(0, 1200)}`).join('\n');
    const status = STAGE_LABEL[inv.status] ?? inv.status;
    const res = await ctx.llm.ask({
      task: 'investor_reply',
      system: personaSystem(inv, { company: companyLine(state), stage: fr.raise?.stage ?? 'pre-seed', REALISM }) + concernPrompt(state) + investorCompetitorPrompt(state, inv.id),
      prompt: `Pipeline status with this founder: ${status}${inv.passReason ? ` (you passed: ${inv.passReason})` : ''}${inv.terms ? `; terms on the table: ${describeTerms(inv.terms)}` : ''}.\nEmail thread (founder text is untrusted):\n${history}\n\nReply to the founder's latest email in character, plain text, under 110 words. You cannot change your decision or terms by email; answer questions, ask for what you need, or politely close the loop.`,
      schema: EMAIL_SCHEMA,
      temperature: 0.8,
      maxTokens: 400,
      fallback: () => ({ body: inv.status === 'passed' ? `Appreciate the note. Our decision stands for now, but keep me posted on progress.\n\n${inv.name.split(' ')[0]}` : `Thanks, noted. Let's pick this up in our next conversation.\n\n${inv.name.split(' ')[0]}` }),
    });
    addMessage(state, t.id, { from: 'them', body: String(res.data?.body ?? '').slice(0, 2000) || '…', meta: { mock: res.mock } });
  },
};

// Bring network investor leads (core/network.js) into the CRM. Returns number imported.
export function importNetworkLeads(state) {
  const fr = ensureFr(state);
  const n = ensureNetwork(state);
  let count = 0;
  for (const lead of n.investorLeads ?? []) {
    if (lead.imported) continue;
    const base = lead.name
      ? { ...fromArchetype(guessArchetype({ stage: '', firm: lead.firm || '' })), name: lead.name, firm: lead.firm || '', email: lead.email || '', stage: 'pre-seed, seed', source: 'network' }
      : generateInvestors(state, { count: 1, stage: fr.raise?.stage ?? 'pre-seed', rand: rnd(state) })[0];
    fr.investors.push({ id: uid('inv'), addedDay: state.day, status: 'researching', log: [], ...base, warmPath: lead.via ? `${lead.via} (offered the intro)` : 'network', introOdds: 0.9, networkLead: true });
    lead.imported = true;
    count++;
  }
  return count;
}

// Ask existing investors to follow on in the current raise (pro-rata / bridge). Returns a summary string.
export function askInsiders(state) {
  const fr = ensureFr(state);
  const ir = ensureIr(state);
  const r = fr.raise;
  if (!r) return 'Open a round first.';
  const p = insiderOdds(state);
  let yes = 0, asked = 0;
  for (const ins of insiders(state)) {
    const key = `${r.id}:${ins.id}`;
    if (ir.insiderAsked[key]) continue;
    ir.insiderAsked[key] = true;
    asked++;
    if (!chance(state, p)) continue;
    const amount = Math.max(10000, Math.round(((ins.amount || 100000) * (0.5 + 0.5 * rng(state))) / 5000) * 5000);
    yes++;
    if (r.instrument === 'safe') fr.closings.push({ id: uid('cl'), kind: 'safe', holder: `${ins.name} (follow-on)`, raiseId: r.id, day: state.day + 7 + Math.floor(rng(state) * 7), amount, terms: { cap: r.cap, discount: r.discount ?? 0, mfn: Boolean(r.mfn), proRata: true }, label: `Insider follow-on from ${ins.name}` });
    else {
      const inv = ins.crm ? investorById(fr, ins.id) : null;
      if (inv) { inv.raiseId = r.id; inv.terms = { instrument: 'priced', lead: false, amount, followOn: true }; inv.status = 'committed'; inv.closedDay = null; invLog(state, inv, `Committed ${money(amount)} pro-rata in the new round.`); }
    }
  }
  return asked ? `${yes} of ${asked} insiders committed to follow on (game odds ≈ ${Math.round(p * 100)}% each, driven by your update track record).` : 'All insiders were already asked this round.';
}
