// Candidates check founders, and posted pay is checked against what you pay.
//
// 1) Founder claims to candidates (runway, revenue, customers, equity value) are recorded when sent (core/integrity.js,
//    audience 'candidate'). Early on they are believed: a candidate who was told "24 months of runway" weighs the offer
//    on 24 months. Before deciding, candidates backchannel (Glassdoor/Blind, former employees, investors, cap-table
//    questions); senior hires check harder (market-people.md §5.1). A caught lie costs the offer and employer
//    reputation (fresh candidates trust you less). A lie that survives travels with the hire: insiders see the bank
//    and the board deck within months, and misled hires leave early (§5.1 [design]: ~50% of misled hires within 6
//    months) and post about it.
// 2) Pay transparency: a posted range must be a good-faith range (CO/CA/WA/NY wording: what you reasonably expect to
//    pay; the EU directive treats meaningless ranges as no range). Very wide ranges count as no range, and offers
//    outside the posted range are what complaints are made of (ops-data.js PAY_LAWS odds).

import { notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { rng, clamp, round2 } from '../../core/util.js';
import { recordClaims, verify, penalize, reputationMult, openLies, fmtClaim, sideRoller } from '../../core/integrity.js';
import { computeMetrics } from '../fundraising/metrics.js';
import { NEG } from './ops-data.js';

// ---- 1. Claims to candidates ----

const NUMV = '\\$\\s?(\\d+(?:[.,]\\d+)?)\\s?(k|m|thousand|million)?';
const scaleV = (v, u) => parseFloat(String(v).replace(/,/g, '')) * (/^(k|thousand)$/i.test(u ?? '') ? 1e3 : /^(m|million)$/i.test(u ?? '') ? 1e6 : 1);
/** Present-tense equity value claims: "your 0.5% is worth $250k", "the options are worth about $100k today". */
export function extractEquityClaims(text) {
  const t = String(text ?? '');
  const out = [];
  const re = new RegExp(`(?:\\b(?:options?|equity|shares|stake|grant)\\b|\\d+(?:\\.\\d+)?\\s?%)[^.\\n]{0,40}?\\b(?:worth|valued at)\\s*(?:about|around|roughly|over)?\\s*${NUMV}`, 'gi');
  for (const x of t.matchAll(re)) {
    const before = t.slice(Math.max(0, x.index - 30), x.index + x[0].length);
    if (/\b(will|could|would|might|may|can|in \d+ years?|at exit|if we)\b/i.test(before)) continue; // promises about the future are not checkable today
    out.push({ metric: 'equity_value', value: scaleV(x[1], x[2]), text: x[0].trim() });
  }
  return out;
}

/** Paper value of an offer's equity today: latest priced post-money, else the seed rule of thumb (NEG.equityPerPctUsd). */
export function paperEquityValue(state, pct) {
  const post = state.apps?.fundraising?.lastPostMoney;
  return Math.round((pct || 0) * (post ? post / 100 : NEG.equityPerPctUsd));
}

/** Record what the founder told a candidate (Mail, interview answers). Returns the material misstatements. */
export function recordCandidateClaims(state, c, text) {
  const truth = computeMetrics(state);
  const lies = recordClaims(state, { audience: 'candidate', recipientId: c.id, channel: 'candidate email', text, truth });
  const eq = extractEquityClaims(text);
  if (eq.length) {
    const t = paperEquityValue(state, c.offer?.equityPct ?? 0);
    lies.push(...recordClaims(state, { audience: 'candidate', recipientId: c.id, channel: 'candidate email', claims: eq.map((e) => ({ metric: 'equity_value', claimed: e.value, truth: t, gap: t > 0 ? clamp((e.value - t) / t, 0, 3) * (e.value > t * 1.25 ? 1 : 0) : e.value > 0 ? 1 : 0, text: e.text })) }));
  }
  return lies;
}

/** What the candidate believes about runway: the founder's (unrefuted) claim, else what they can work out. */
export function believedRunway(state, c, actual) {
  const told = openLies(state, { audience: 'candidate', recipientId: c.id }).filter((x) => x.metric === 'runway').at(-1);
  return told ? told.claimed : actual;
}

/**
 * Before the decision: backchannel checks. Returns { ctx, mult, caught } where ctx is the offer context with the
 * runway the candidate believes, and mult multiplies the acceptance probability.
 */
export function candidateBackchannel(state, c, ctx) {
  const senior = (c.seniority ?? '') === 'senior' || (c.years ?? 0) >= 8;
  const res = verify(state, { audience: 'candidate', recipientId: c.id, check: senior ? 'reference' : 'angel', roll: sideRoller(state, `backchannel|${c.id}`) });
  let mult = Math.sqrt(reputationMult(state, 'candidate')); // Glassdoor and the local network remember [design]
  if (res.caught.length) {
    mult *= 0.45; // a founder caught overselling the company loses most offers [design; §5.1 "evasive founders lose offers"]
    penalize(state, res.caught, { audience: 'candidate', functionId: 'hiring', id: 'misled_candidate_caught', label: `${c.name} found out you oversold the company`, hours: 1, app: 'people', detail: `${senior ? 'A senior candidate asked your investors and a former colleague' : 'The candidate read Glassdoor and asked around'}. Strong candidates ask for runway, last round and the cap table; transparent numbers in the offer letter win more of them than inflated ones.` });
    notify(state, `${c.name} backchanneled and found your numbers don't hold up (${res.caught.map((x) => `${x.metric} ${fmtClaim(x.metric, x.claimed)} vs ${fmtClaim(x.metric, x.truth)}`).join('; ')}).`, { type: 'bad', app: 'people' });
  }
  return { ctx: { ...ctx, runwayMonths: believedRunway(state, c, ctx.runwayMonths) }, mult, caught: res.caught };
}

/** On hire: the surviving lies move with the person. */
export function carryClaimsToHire(state, c, m) {
  const lies = openLies(state, { audience: 'candidate', recipientId: c.id });
  if (lies.length) m.misled = { candidateId: c.id, since: state.day, maxGap: lies.reduce((a, x) => Math.max(a, x.gap), 0) };
}

// Monthly: insiders see the real numbers (bank, board deck, all-hands). Confirmatory-strength over months 1-6,
// final at 6 months. Caught: morale crash, a quit hazard, a Glassdoor post (employer reputation), a traceable cost.
export function misledHiresMonth(state, p) {
  for (const m of p.members ?? []) {
    if (!m.misled || m.misled.resolved || m.status !== 'active' || state.day < m.startDay + 30) continue;
    const months = (state.day - m.startDay) / 30;
    const res = verify(state, { audience: 'candidate', recipientId: m.misled.candidateId, check: 'confirmatory', final: months >= 6, roll: (() => { const r = sideRoller(state, `insider|${m.id}`); return () => r() * 2; })() }); // ~half the confirmatory odds per month
    if (!res.caught.length) { if (months >= 6) m.misled.resolved = 'survived'; continue; }
    m.misled.resolved = 'caught';
    m.morale = clamp((m.morale ?? 70) - 25, 0, 100);
    m.misledQuitRisk = round2(0.5 / 6); // monthly, so ~half leave within 6 months [design §5.1]
    const salary = m.salary ?? (m.hourlyRate ?? 50) * 2080;
    penalize(state, res.caught, { audience: 'candidate', functionId: 'hiring', id: 'misled_hire_found_out', label: `${m.name} found out the numbers you hired them on were not true`, usd: Math.round(salary * 0.3), hours: 6, app: 'people', detail: `${m.name} saw the real ${res.caught.map((x) => x.metric).join(', ')} from the inside. Expect a resignation and a Glassdoor review; a bad early exit costs roughly a third of a year's pay in lost ramp and re-hiring.` });
  }
}

/** Extra monthly quit hazard for hires who found out they were misled (read by the attrition roll). */
export const misledQuitHazard = (m) => (m.misled?.resolved === 'caught' ? m.misledQuitRisk ?? 0 : 0);

// ---- 2. Pay transparency: good-faith ranges ----

// Range spread (hi/lo) anchors [design; judging/investors-people-ops.md]: ≤1.35 typical, ≤1.6 acceptable, wider reads as
// no range; ≥2.0 is not a range anyone "reasonably expects to pay" for one role.
export const RANGE = { typical: 1.35, acceptable: 1.6, bad: 2.0, offerSlack: 0.02, complaintIfOutside: 0.1 };
export function rangeQuality(job) {
  if (!(job?.payLo > 0 && job.payHi >= job.payLo)) return 'none';
  const r = job.payHi / job.payLo;
  return r <= RANGE.typical ? 'typical' : r <= RANGE.acceptable ? 'acceptable' : r < RANGE.bad ? 'wide' : 'not_good_faith';
}

/** At offer time: an offer outside the posted range. Returns { outside, below } and records the claim. */
export function offerVsPostedRange(state, c, job, offered) {
  if (!job || !(job.payLo > 0 && job.payHi >= job.payLo) || !(offered > 0)) return { outside: false };
  const below = offered < job.payLo * (1 - RANGE.offerSlack);
  const above = offered > job.payHi * (1 + RANGE.offerSlack);
  if (!below) return { outside: above, above }; // paying above the posted range misleads nobody
  recordClaims(state, { audience: 'candidate', recipientId: c.id, channel: 'job post', claims: [{ metric: 'pay_range', claimed: true, truth: false, gap: clamp((job.payLo - offered) / job.payLo * 4, 0.25, 3), text: `posted ${job.payLo}-${job.payHi}, offered ${offered}` }] });
  logMistake(state, { functionId: 'people_ops', id: 'offer_below_posted_range', label: 'Offered below the range you posted', app: 'people', key: `belowrange:${c.id}`, cost: { hours: 1 }, detail: `"${job.title}" listed ${job.payLo.toLocaleString('en-US')}-${job.payHi.toLocaleString('en-US')}; the offer to ${c.name} is ${Math.round(offered).toLocaleString('en-US')}. Candidates read it as bait-and-switch, and posting laws require the range you reasonably expect to pay: this is what complaints are made of.` });
  return { outside: true, below, above };
}
