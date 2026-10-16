// Sourcing channels and recruiting agencies (data: public/data/roles.js AGENCIES, research
// docs/research/hiring-and-performance.md §5). Pure helpers + the money side of each cost model:
// contingency/marketplace % of first-year base on acceptance (with guarantee refunds), retained search in
// thirds, embedded/fractional recruiters monthly or hourly, staffing/contract-to-hire markups with
// conversion fees, freelance platform fees, job-board subscriptions/one-off posts, referral bonuses.
// Candidate ownership windows create fee disputes when you hire someone an agency introduced.

import { AGENCIES } from '../../data/roles.js';
import { post } from '../../core/bank.js';
import { notify } from '../../core/state.js';
import { round2, clamp, rng, uid, money, chance } from '../../core/util.js';
import { recruiterChannel } from '../channels/agencies.js';

export const AGENCY = Object.fromEntries(AGENCIES.map((a) => [a.id, a]));
// A channel by id: the generic catalog, or a hired niche recruiter (channels/agencies.js; the id is its engagement id).
export const agencyOf = (state, id) => AGENCY[id] ?? (state?.agencyBook && String(id).startsWith('eng_') ? recruiterChannel(state, id) : null);
export const OWNERSHIP_DAYS = 270; // 6–12 month candidate ownership in agency T&Cs [V/S]; midpoint
const CONTRACT_KINDS = new Set(['staffing', 'contract_to_hire', 'offshore_agency', 'freelance_platform', 'fractional']);
const FEE_ON_HIRE = new Set(['pct_first_year_base']);
export const JOB_BOARD_PASS = 0.06; // share of board applications passing AI resume screening into the shortlist [design]
export const AI_APPLICATION_SHARE = 0.35; // AI-mass-applied share of board applications (Gartner 2025: 39% use AI) [S]

const mid = (r) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : r);
const isYc = (state) => Boolean(state.flags?.ycBacked || state.apps.fundraising?.accelerator === 'yc' || state.apps.fundraising?.yc);

// Can this channel be used for this job?
export function channelFits(state, a, job) {
  if (!a) return false;
  if (a.requires === 'YC-backed' && !isYc(state)) return false;
  const roleOk = a.anyRole || a.roles.includes(job.role) || (job.engagement === 'contractor' && CONTRACT_KINDS.has(a.kind) && a.roles.some((r) => ['engineer', 'ai_engineer', 'designer', 'marketer', 'content_writer'].includes(r)) && ['engineer', 'ai_engineer', 'designer', 'marketer', 'content_writer'].includes(job.role));
  if (!roleOk) return false;
  if (CONTRACT_KINDS.has(a.kind)) return job.engagement === 'contractor';
  if (FEE_ON_HIRE.has(a.costModel.type) || a.kind === 'retained') return job.engagement !== 'contractor';
  return true;
}
export const channelsFor = (state, job) => AGENCIES.filter((a) => channelFits(state, a, job));

export function costText(a) {
  const c = a.costModel;
  switch (c.type) {
    case 'pct_first_year_base': return `${Math.round(c.pct * 100)}% of first-year base on acceptance; ${a.guaranteeDays}-day guarantee`;
    case 'pct_first_year_cash_comp': return `${Math.round(c.pct * 100)}% of first-year cash comp in thirds, non-refundable`;
    case 'monthly': return `${money(c.monthly)}/month${c.minMonths ? `, ${c.minMonths}-month minimum` : ''}`;
    case 'hourly': return a.kind === 'embedded' ? `~$${c.hourly}/h (~5 h/week while open)` : `~$${c.hourly}/h billed for the person's time${c.platformFeePct ? ' incl. platform margin' : ''}`;
    case 'markup': return `${Math.round(c.markupPct * 100)}% markup on pay; conversion fee ~15–20% of salary`;
    case 'platform_fee': return `${Math.round(c.pct * 100)}% client fee on payments`;
    case 'subscription': return c.monthly ? `${money(c.monthly)}/month${c.plusPayPerClickPosts ? ' + ~$15/day promoted post' : ''}` : 'free posts';
    case 'one_time': return `${money(c.oneTime)} per ${c.perDays}-day post`;
    case 'bonus': return `${money(c.oneTime)} referral bonus paid after ${a.bonusPaidAfterDays} days`;
    case 'free': return 'free';
    default: return '';
  }
}

// Founder hours to start a channel (writing briefs, DMs, sourcing searches) [design].
export function setupHours(a) {
  if (a.kind === 'referral') return 2;
  if (a.kind === 'sourcing_tool') return 3;
  if (a.kind === 'job_board') return 0.25;
  return 1; // agency intake call / brief
}

/**
 * Expected per-day flow for a job from one channel.
 * → { applications, profiles } where profiles are candidates who reach the founder's shortlist.
 */
export function channelFlow(a, job) {
  const q = job.quality ?? 0.4;
  const perWeek = mid(a.candidatesPerWeek);
  if (a.kind === 'job_board') {
    const apps = perWeek * (0.5 + q) * (job.payTransparency ? 1.15 : 0.85);
    return { applications: apps / 7, profiles: (apps * JOB_BOARD_PASS) / 7 };
  }
  const k = ['referral', 'sourcing_tool'].includes(a.kind) ? 0.6 + 0.8 * q : 0.85 + 0.3 * q;
  const profiles = (perWeek * k) / 7;
  return { applications: profiles, profiles };
}

// Charges when a channel is switched on. Returns the amount posted.
export function chargeOnStart(state, a, job) {
  const c = a.costModel;
  const desc = `${a.label}: ${job.title}`;
  if (c.type === 'one_time') return pay(state, c.oneTime, a.label, `Job post (${c.perDays} days): ${job.title}`);
  if (c.type === 'pct_first_year_cash_comp') {
    const fee = c.pct * jobCashComp(job);
    job.retained ??= { fee: round2(fee), paid: 1, startDay: state.day };
    return pay(state, fee / 3, a.label, `Retained search retainer 1/3: ${job.title}`);
  }
  if (c.type === 'monthly') {
    job.monthly ??= {};
    job.monthly[a.id] = { since: state.day, months: 1 };
    return pay(state, c.monthly, a.label, `${desc} (month 1)`);
  }
  return 0;
}

// Weekly running costs for open channels (Mondays). Returns total posted.
export function chargeWeekly(state, job, days = 7) {
  let total = 0;
  for (const id of job.channels) {
    const a = agencyOf(state, id);
    if (!a) continue;
    const c = a.costModel;
    if (c.type === 'subscription') {
      const amt = (c.monthly ?? 0) * (days / 30) + (c.plusPayPerClickPosts ? 15 * days : 0);
      total += pay(state, amt, a.label, `${a.label} (${days} days): ${job.title}`);
    } else if (c.type === 'hourly' && a.kind === 'embedded') {
      total += pay(state, c.hourly * 5 * (days / 7), a.label, `Fractional recruiter hours: ${job.title}`);
    } else if (c.type === 'monthly' && job.monthly?.[id]) {
      const m = job.monthly[id];
      const due = Math.floor((state.day - m.since) / 30) + 1;
      while (m.months < due) { m.months++; total += pay(state, c.monthly, a.label, `${a.label} (month ${m.months}): ${job.title}`); }
    }
  }
  // Retained search: remaining thirds at ~30 and ~60 days.
  const r = job.retained;
  if (r && r.paid < 3) {
    const due = state.day - r.startDay >= 60 ? 3 : state.day - r.startDay >= 30 ? 2 : 1;
    while (r.paid < due) { r.paid++; total += pay(state, r.fee / 3, 'Retained search firm', `Retained search retainer ${r.paid}/3: ${job.title}`); }
  }
  return round2(total);
}

// When a job closes: monthly minimum commitments (embedded/RPO) still owed.
export function chargeOnClose(state, job) {
  let total = 0;
  for (const [id, m] of Object.entries(job.monthly ?? {})) {
    const ag = agencyOf(state, id);
    const min = ag?.costModel.minMonths ?? 0;
    while (m.months < min) { m.months++; total += pay(state, ag.costModel.monthly, ag.label, `${ag.label} (minimum month ${m.months}): ${job.title}`); }
  }
  return total;
}

const jobCashComp = (job) => (job.payHi ? (job.payLo + job.payHi) / 2 : job.payLo || 120000);

function pay(state, amount, counterparty, description) {
  const a = round2(amount);
  if (a <= 0) return 0;
  post(state, { amount: -a, counterparty, description, category: 'other', method: 'ach', meta: { app: 'people', recruiting: true } });
  return a;
}

// Contractor hire through a channel: the markup/platform share added on top of the person's rate.
export function contractorFeePct(a) {
  if (!a) return 0;
  const c = a.costModel;
  if (c.type === 'markup') return c.markupPct;
  if (c.type === 'platform_fee') return c.pct;
  if (a.id === 'vetted_marketplace') return 0.3; // platform margin 10–50% [V]
  return 0;
}

// Fees owed when an offer is accepted. Returns { fee, kind }.
export function placementFee(a, salary) {
  if (!a) return { fee: 0 };
  if (a.costModel.type === 'pct_first_year_base') return { fee: round2(a.costModel.pct * salary), kind: 'placement' };
  return { fee: 0 };
}

// Guarantee: pro-rated refund when a placed hire leaves within the guarantee window [design].
export function guaranteeRefund(a, fee, daysEmployed) {
  if (!a || !fee || !a.guaranteeDays || daysEmployed >= a.guaranteeDays) return 0;
  return round2(fee * (1 - daysEmployed / a.guaranteeDays));
}

// Conversion of a staffing / contract-to-hire contractor to a direct employee.
export function conversionFee(a, salary, hoursBilled = 0) {
  if (!a || a.costModel.type !== 'markup') return 0;
  const pct = 0.175; // 15–20% (Recruiterflow [V])
  const waive = a.costModel.conversionFeeWaivedAfterHours ?? Infinity;
  return round2(pct * salary * clamp(1 - hoursBilled / waive, 0, 1));
}

// Record that an agency introduced a candidate (ownership window for fee claims).
export function recordOwnership(p, cand, agencyId, day) {
  p.ownership ??= [];
  p.ownership.push({ key: cand.personKey, name: cand.name, role: cand.role, agencyId, untilDay: day + OWNERSHIP_DAYS, candidateId: cand.id });
  if (p.ownership.length > 300) p.ownership.splice(0, 100);
}

// An agency claims a fee for a hire it introduced earlier (hired via another channel inside the window).
export function ownershipClaim(p, cand, day) {
  if (!cand.personKey) return null;
  const o = (p.ownership ?? []).find((x) => x.key === cand.personKey && x.agencyId !== cand.channel && day <= x.untilDay);
  return o ?? null;
}

export function openDispute(state, p, { agencyId, name, salary, memberId }) {
  const a = agencyOf(state, agencyId);
  const fee = placementFee(a, salary).fee || round2(0.2 * salary);
  const d = { id: uid('disp'), agencyId, agency: a?.label ?? agencyId, name, memberId, amount: fee, day: state.day, status: 'open', dueDay: state.day + 30 };
  p.disputes ??= [];
  p.disputes.unshift(d);
  notify(state, `${a?.label ?? 'A recruiting agency'} invoiced ${money(fee)} for ${name}: they submitted this candidate within their ${OWNERSHIP_DAYS}-day ownership window. Pay or dispute in People → Hiring.`, { type: 'bad', app: 'people' });
  return d;
}

// Resolve a fee dispute: 'pay' or 'dispute' (~35% win [design]; losing adds legal costs).
export function resolveDispute(state, p, id, action) {
  const d = (p.disputes ?? []).find((x) => x.id === id);
  if (!d || d.status !== 'open') throw new Error('No open dispute.');
  if (action === 'pay') {
    pay(state, d.amount, d.agency, `Placement fee (ownership claim): ${d.name}`);
    d.status = 'paid';
  } else {
    if (chance(state, 0.35)) d.status = 'won';
    else {
      pay(state, d.amount, d.agency, `Placement fee (ownership claim, dispute lost): ${d.name}`);
      post(state, { amount: -1500, counterparty: 'Employment lawyer', description: `Fee dispute: ${d.name}`, category: 'legal', method: 'ach', meta: { app: 'people' } });
      d.status = 'lost';
    }
  }
  return d;
}

export const daysToFirst = (state, a) => Math.round(a.daysToFirstCandidate[0] + rng(state) * (a.daysToFirstCandidate[1] - a.daysToFirstCandidate[0]));
