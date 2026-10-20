// Support platform choice (Q4 2026). Pure data and functions: no state mutation (support/platform.js mutates).
//
// Source: docs/research/tools/2026q4/support-people-compliance.md §1 (support paradigm table, verdicts) and
// docs/research/tools/deep/d09-support-ai-cancelflows.md (Fin, Plain, Pylon workflows). Tags as in the research:
// [verified] primary page, [third-party] aggregator, [unverified], [design] simulator assumption (never shown as
// a statistic).
//
// Each platform is a different PARADIGM, not a different price on the same thing:
//  - Intercom + Fin: chat-widget-first, help-center-grounded AI, billed per resolution the vendor counts
//    (customers who go quiet count as resolved). Great for B2C / PLG; a B2B account that lives in Slack is
//    pushed into a widget.
//  - Pylon: account-centric, Slack/Teams-channel-first B2B; threads become issues linked to Linear; seats
//    ($89/$139, 3-seat minimum [unverified]) plus an AI credit minimum (5,000 credits). Poor for consumer volume.
//  - Plain: API-first thread support for technical B2B, cheap seats, AI credits capped by an allowance.
//  - Zendesk: ticket queue (email/web form first) with views, macros, triggers and SLA policies; AI on top, billed
//    per *verified* resolution (~$1.20-2.00). Owns Forethought since March 2026. Heavy setup and weekly admin.
//  - Decagon / Sierra: enterprise, sales-led, six-figure contracts and weeks of implementation. A small startup
//    either cannot buy them or overpays massively.
//  - Forethought: acquired by Zendesk (announced 2026-03-11); retired as a standalone choice.

import { clamp, lerp, round2 } from '../../core/util.js';

// Channels a customer writes in. Mix shares are [design]: consumer users open the chat widget; small B2B accounts
// split chat and email; large B2B accounts (the Slack Connect line) want a shared channel.
export const CHANNELS = { chat: 'Chat widget', email: 'Email / web form', slack: 'Slack / Teams channel' };
export const MIX = {
  consumer: { chat: 0.75, email: 0.25, slack: 0 },
  smallB2B: { chat: 0.45, email: 0.5, slack: 0.05 },
  bigB2B: { chat: 0.1, email: 0.3, slack: 0.6 },
};
export const FIT_GOOD = 0.85; // channel fit at or above this needs no workaround [design]
export const HOUR_VALUE = 100; // founder hour valued at $100 when comparing options [design]
export const BASE_MONTHLY_CHURN = 0.03; // used only to put a dollar figure on a churn multiplier [design]

// channels: how natively the platform serves each channel 0..1 [design, from the research paradigm table].
// seat/seatMin/annual: list price per seat per month, minimum seats, annual contract.
// ai: how the AI agent is billed. aiSolve: multiplier on the agent's true-resolution odds by intent kind [design].
// setupHours: one-off founder hours to set the platform up; adminHours: founder hours per week to keep it
// running (views, triggers, AOPs) [design].
export const VENDORS = {
  inbox: {
    label: 'Shared inbox (Gmail / Help Scout-style)', short: 'Shared inbox', status: 'active', paradigm: 'One email inbox, replies by hand; no AI agent, no chat widget, no channel sync.',
    channels: { chat: 0.3, email: 0.9, slack: 0.3 }, seat: 0, seatMin: 0, annual: false,
    ai: null, aiSolve: null, setupHours: 0, adminHours: 0, slackNative: false, legacyBaseline: true,
    easy: 'Free and simple while you have a handful of customers.', hard: 'No AI deflection, no SLA timers, Slack threads live outside it.',
    fits: 'Pre-revenue to ~30 customers.', source: 'Baseline [design]',
  },
  intercom: {
    label: 'Intercom + Fin', short: 'Intercom', status: 'active', paradigm: 'Chat widget + help center; Fin answers from your articles and Procedures inside the Intercom inbox.',
    channels: { chat: 1, email: 0.85, slack: 0.35 }, seat: 39, seatMin: 1, annual: false, catalogId: 'intercom',
    ai: { model: 'per_resolution', unit: 0.99, monthlyMin: 50 }, aiSolve: { docs: 1, procedure: 1, status: 1, human: 1 },
    setupHours: 3, adminHours: 0.25, slackNative: false,
    easy: 'Fast start, self-serve, $0.99 per resolution visible before any sales call.', hard: 'Anything that needs actions without a Procedure; B2B accounts that live in Slack; bad docs = bad answers.',
    fits: 'B2C and PLG / SMB B2B with docs, 100-5,000 chats a month.', source: '$0.99/resolution [verified, Intercom pricing page via d09]; Essential seat $39/mo monthly [vendor list price]; vendor resolution claims 67-76% vs independent 38% [third-party]',
  },
  pylon: {
    label: 'Pylon', short: 'Pylon', status: 'active', paradigm: 'Account-centric, channel-first: each customer\'s Slack Connect / Teams channel is the ticket surface; one click turns a thread into an issue linked to Linear.',
    channels: { chat: 0.55, email: 0.75, slack: 1 }, seat: 89, seatMin: 3, annual: true, catalogId: 'pylon',
    ai: { model: 'credits', creditsMin: 5000, creditUsd: 0.03, creditsPerConvo: 8, allowance: null }, aiSolve: { docs: 0.85, procedure: 0.9, status: 1, human: 1 },
    setupHours: 4, adminHours: 0.5, slackNative: true, issueLinking: true, accountView: true,
    easy: 'B2B white-glove in the customer\'s own channel, account context, engineering handoff without extra seats (view-only seats are free).', hard: 'Consumer chat volume and email-only buyers; 3 paid seats and a credit minimum from day one.',
    fits: 'Seed to Series B B2B selling to engineering-minded buyers.', source: 'Professional $89/seat, Advanced $139, AI credits with a 5,000-credit minimum, annual contracts [verified: usepylon.com/pricing]; 3-seat minimum [unverified, d09]; credit price not published: $0.03/credit and 8 credits per AI conversation are [design]',
  },
  plain: {
    label: 'Plain', short: 'Plain', status: 'active', paradigm: 'API-first thread support for technical B2B: every channel becomes a thread in one queue; you build customer cards and views via API.',
    channels: { chat: 0.45, email: 0.8, slack: 0.95 }, seat: 35, seatMin: 1, annual: false, catalogId: 'plain', channelCap: 25,
    ai: { model: 'credits', creditsMin: 0, creditUsd: 0, creditsPerConvo: 8, allowance: 1500 }, aiSolve: { docs: 0.75, procedure: 0.7, status: 1, human: 1 },
    setupHours: 5, adminHours: 0.5, slackNative: true, issueLinking: true,
    easy: 'Cheap seats, Slack-first, developer-extensible.', hard: 'Less AI breadth and account health than Pylon; AI credits run out mid-month; 25 Slack channels on the entry tier.',
    fits: 'Technical B2B, small team.', source: 'From $35/seat, free viewer seats, included AI credit allowance [third-party, d09]; 25-channel cap [unverified]; allowance size [design]',
  },
  zendesk: {
    label: 'Zendesk Suite + AI agents', short: 'Zendesk', status: 'active', paradigm: 'Ticket queue (email / web form first) with views, macros, triggers and SLA policies; AI agents on top, billed per verified resolution.',
    channels: { chat: 0.75, email: 1, slack: 0.45 }, seat: 115, seatMin: 1, annual: true, catalogId: 'zendesk',
    ai: { model: 'verified', unitRange: [1.2, 2.0], verifiedWrongShare: 0.25 }, aiSolve: { docs: 0.9, procedure: 0.95, status: 1, human: 1 },
    setupHours: 10, adminHours: 1.5, slackNative: false, slaPolicies: true, macroBoost: 0.9,
    easy: 'SLA-bound multi-channel queues, compliance, scale; strong macros and triggers.', hard: 'Admin overhead every week, not Slack-native, overkill for one person.',
    fits: 'Mid-market, 5+ agents.', source: 'Suite Professional $115/agent/mo annual [third-party, Jul 2026]; verified resolutions ~$1.20-2.00 above allowance [third-party, contract-quoted]; Forethought acquired 2026-03-11 [verified: TechCrunch]',
  },
  decagon: {
    label: 'Decagon', short: 'Decagon', status: 'enterprise', paradigm: 'Agent Operating Procedures: natural-language workflows that call your APIs and take the action (refund, plan change); Duet refines them from transcripts.',
    channels: { chat: 1, email: 0.9, slack: 0.3 }, seat: 0, seatMin: 0, annual: true,
    ai: { model: 'contract' }, aiSolve: { docs: 1.1, procedure: 1.4, status: 1, human: 1 },
    contract: { acv: 100000, implDays: 42, implHours: 30 }, setupHours: 3, adminHours: 2, slackNative: false,
    easy: 'Actions, high resolution on repeat intents at consumer volume.', hard: 'Needs an engineer, six-figure contract, weeks of implementation.',
    fits: 'Series A+ / consumer-scale volume.', source: '$4.5B valuation; prices not published, ~$100K+ ACV, Vendr median ~$432K from two buyers [third-party]; implementation length [design]',
  },
  sierra: {
    label: 'Sierra', short: 'Sierra', status: 'enterprise', paradigm: 'A developer-built branded agent (Agent OS / SDK) on top of your systems, voice + text, with the vendor\'s team.',
    channels: { chat: 1, email: 0.85, slack: 0.3 }, seat: 0, seatMin: 0, annual: true,
    ai: { model: 'contract' }, aiSolve: { docs: 1.1, procedure: 1.3, status: 1, human: 1 },
    contract: { acv: 150000, implDays: 70, implHours: 50 }, setupHours: 3, adminHours: 2, slackNative: false,
    easy: 'Deep brand-specific behaviour, voice.', hard: 'Slow, expensive, opaque outcome pricing.',
    fits: 'Enterprise only.', source: '$15.8B valuation, outcome-based contracts (~$1.50/resolution single-source) [third-party]; minimum contract and implementation length [design]',
  },
  forethought: {
    label: 'Forethought', short: 'Forethought', status: 'retired', retiredDay: '2026-03-11',
    note: 'Acquired by Zendesk (announced 2026-03-11). Its triage and agent tech now ships inside Zendesk AI; new startups buy it as Zendesk, not standalone.',
    source: 'TechCrunch 2026-03-11 [verified]',
  },
};
export const CHOOSABLE = ['inbox', 'intercom', 'pylon', 'plain', 'zendesk'];
export const ENTERPRISE = ['decagon', 'sierra'];
// Who Decagon/Sierra sell to [design, from "Series A+ / consumer-scale volume"]: ARR or monthly conversations.
export const ENTERPRISE_GATE = { minArr: 3_000_000, minConvosPerMonth: 5000 };
export const ENTERPRISE_DEMO_HOURS = 3; // discovery + demo + security review call [design]
export const SWITCH_HOURS = { base: 2, perArticle: 0.1, perMacro: 0.05 }; // export/import, re-wire, re-test [design]

export const vendorOf = (id) => VENDORS[id] ?? VENDORS.inbox;

// Channel mix from accounts: [{ consumer: bool, big: bool }] (big = above the Slack Connect line).
export function channelMix(accounts = []) {
  const out = { chat: 0, email: 0, slack: 0 };
  if (!accounts.length) return { ...MIX.smallB2B };
  for (const a of accounts) {
    const m = a.consumer ? MIX.consumer : a.big ? MIX.bigB2B : MIX.smallB2B;
    for (const k of Object.keys(out)) out[k] += m[k] / accounts.length;
  }
  return out;
}

// 0..1: how natively the platform serves the channels your customers actually use.
export const channelFit = (v, mix) => round2(Object.keys(CHANNELS).reduce((a, k) => a + (mix[k] ?? 0) * (vendorOf(v).channels?.[k] ?? 0), 0));

// Minutes-per-ticket multiplier: tickets from a channel the tool does not serve get copied across by hand,
// threads lose context, SLA timers are missing [design]. The shared inbox is the calibrated baseline (×1).
export function handlingMult(id, mix, { usefulMacros = 0, b2b = false, engineerAssist = false } = {}) {
  const v = vendorOf(id);
  if (v.legacyBaseline) return 1;
  let m = 1 + 0.6 * (FIT_GOOD - channelFit(id, mix));
  if (v.macroBoost && usefulMacros >= 3) m *= v.macroBoost; // Zendesk triggers + macros route and pre-fill
  if (v.accountView && b2b) m *= 0.95; // account context on the account object [design]
  if (engineerAssist && b2b) m *= 0.95; // engineers answer bug threads directly [design]
  return round2(clamp(m, 0.75, 1.45));
}

// Churn multiplier from channel fit: a B2B team forced into a chat widget, or consumers stuck in an email-only
// tool, feel unheard [design]. Baseline (shared inbox) is neutral.
export function churnMult(id, mix) {
  const v = vendorOf(id);
  if (v.legacyBaseline) return 1;
  return round2(1 + 0.25 * Math.max(0, FIT_GOOD - channelFit(id, mix)));
}

// Multiplier on the AI agent's true-resolution odds for one intent kind: vendor strength × channel presence.
export function aiSolveMult(id, kind, mix) {
  const v = vendorOf(id);
  if (!v.aiSolve) return 0;
  const fitT = clamp(channelFit(id, mix) / FIT_GOOD, 0, 1);
  return round2((v.aiSolve[kind] ?? 1) * lerp(0.6, 1, fitT));
}

// Seats billed: humans who answer (founder + support staff), plus everyone else when seatPolicy = 'everyone'.
// Platforms with issue linking let engineers follow threads on free view-only seats.
export function seatsFor(id, { supportHumans = 1, otherHumans = 0, seatPolicy = 'support_only' } = {}) {
  const v = vendorOf(id);
  if (!v.seat) return { seats: 0, billed: 0, wasted: 0 };
  const seats = supportHumans + (seatPolicy === 'everyone' ? otherHumans : 0);
  const billed = Math.max(v.seatMin, seats);
  return { seats, billed, wasted: billed - supportHumans, minWaste: Math.max(0, v.seatMin - seats) };
}
export const engineerAssist = (id, seatPolicy, otherHumans) => otherHumans > 0 && (seatPolicy === 'everyone' || Boolean(vendorOf(id).issueLinking));

// Monthly AI bill. usage: { claimed, involved, resolved, wrong } for the month; unit: the run's rolled price.
export function aiBill(id, usage = {}, { live = false, unit = null } = {}) {
  const ai = vendorOf(id).ai;
  if (!ai) return { usd: 0, units: 0, label: '' };
  const { claimed = 0, involved = 0, resolved = 0, wrong = 0 } = usage;
  if (ai.model === 'per_resolution') {
    const units = Math.max(live ? ai.monthlyMin : 0, claimed);
    return { usd: round2(units * ai.unit), units, label: `Fin resolutions: ${claimed}${live && claimed < ai.monthlyMin ? ` (min ${ai.monthlyMin})` : ''}` };
  }
  if (ai.model === 'verified') {
    const u = unit ?? (ai.unitRange[0] + ai.unitRange[1]) / 2;
    const units = Math.round(resolved + wrong * ai.verifiedWrongShare);
    return { usd: round2(units * u), units, label: `Verified AI resolutions: ${units} at $${u.toFixed(2)}` };
  }
  if (ai.model === 'credits') {
    const credits = involved * ai.creditsPerConvo;
    if (ai.allowance != null) return { usd: 0, units: credits, label: `AI credits used: ${credits}/${ai.allowance} included` };
    const units = Math.max(live ? ai.creditsMin : 0, credits);
    return { usd: round2(units * ai.creditUsd), units, label: `AI credits: ${credits}${live && credits < ai.creditsMin ? ` (min ${ai.creditsMin})` : ''}` };
  }
  return { usd: 0, units: 0, label: 'Covered by the annual contract' };
}

export const qualifiesEnterprise = ({ arr = 0, convosPerMonth = 0 }) => arr >= ENTERPRISE_GATE.minArr || convosPerMonth >= ENTERPRISE_GATE.minConvosPerMonth;

// Whole-month estimate for one option, for the comparison table and the operator-tier test.
// p: { mix, convos (per month), aiShare (share of conversations the agent touches), trueRate (honest resolution
// at fit 1 on Fin), supportHours (founder hours of tickets a month on the baseline), supportHumans, otherHumans,
// seatPolicy, mrr, b2b, usefulMacros, arr }
export function estimateMonth(id, p) {
  const v = vendorOf(id);
  const mix = p.mix ?? MIX.smallB2B;
  const fit = channelFit(id, mix);
  const ea = engineerAssist(id, p.seatPolicy, p.otherHumans ?? 0);
  const hm = handlingMult(id, mix, { usefulMacros: p.usefulMacros ?? 0, b2b: p.b2b, engineerAssist: ea });
  const seats = seatsFor(id, p);
  const ai = Boolean(v.ai) && (p.aiShare ?? 0) > 0;
  const involved = ai ? Math.round((p.convos ?? 0) * p.aiShare) : 0;
  const docsSolve = ai ? aiSolveMult(id, 'docs', mix) : 0;
  const resolved = Math.round(involved * clamp((p.trueRate ?? 0.45) * docsSolve, 0, 0.95));
  const claimed = ai ? Math.round(involved * 0.7) : 0; // vendor-counted (silent customers included) [design]
  let aiUsd = 0, contractUsd = 0, credits = null;
  if (v.ai?.model === 'contract') contractUsd = v.contract.acv / 12;
  else if (ai) { const b = aiBill(id, { claimed, involved, resolved, wrong: Math.round(involved * 0.08) }, { live: true }); aiUsd = b.usd; credits = v.ai.allowance != null ? { used: b.units, allowance: v.ai.allowance } : null; }
  // Plain: AI stops at the allowance; the rest falls back to humans.
  const capped = credits && credits.used > credits.allowance ? Math.round(resolved * (1 - credits.allowance / credits.used)) : 0;
  const humanTickets = Math.max(0, (p.convos ?? 0) - (resolved - capped));
  const perTicketH = (p.convos ? (p.supportHours ?? 0) / p.convos : 0);
  const handlingHours = humanTickets * perTicketH * hm;
  const adminHours = v.adminHours * 4.33;
  const seatUsd = seats.billed * v.seat;
  const cm = churnMult(id, mix);
  const churnUsd = (p.mrr ?? 0) * BASE_MONTHLY_CHURN * (cm - 1) * 12; // a year of the extra lost MRR
  const bill = round2(seatUsd + aiUsd + contractUsd);
  const hours = round2(handlingHours + adminHours);
  return { id, fit, handlingMult: hm, churnMult: cm, seats, bill, hours, resolved: resolved - capped, churnUsd: round2(churnUsd), total: round2(bill + hours * HOUR_VALUE + churnUsd), qualifies: v.status !== 'enterprise' || qualifiesEnterprise(p) };
}

// What a stellar operator picks for this profile, and why (feedback text). Picks the cheapest total among the
// self-serve options, plus enterprise only when the gate is met.
export function bestOption(p) {
  const ids = [...CHOOSABLE, ...ENTERPRISE.filter(() => qualifiesEnterprise(p))].filter((id) => id !== 'inbox' || (p.convos ?? 0) < 60);
  const rows = ids.map((id) => estimateMonth(id, { ...p, seatPolicy: 'support_only' })).sort((a, b) => a.total - b.total);
  return rows[0];
}

// Fit read for the operator reader and the Platform tab: { score 0..1, evidence[], advice[] }.
// ctx: { id, p (estimateMonth profile), seatPolicy, overbuy, lockinFees }
export function vendorFit({ id, p, seatPolicy = 'support_only', overbuy = false, lockinFees = 0 }) {
  const mine = estimateMonth(id, { ...p, seatPolicy });
  const best = bestOption(p);
  const gap = best.total > 0 ? (mine.total - best.total) / best.total : 0;
  const evidence = [`Support platform: ${vendorOf(id).label}, channel fit ${Math.round(mine.fit * 100)}% (best available ${vendorOf(best.id).short} ${Math.round(best.fit * 100)}%)`];
  const advice = [];
  let score = clamp(1 - gap / 0.6, 0, 1);
  if (mine.seats.wasted > 0 && seatPolicy === 'everyone' && vendorOf(id).issueLinking) { // engineers already see linked issues for free
    score -= 0.15;
    advice.push(`You pay ${mine.seats.wasted} seat(s) for people who only read threads. Engineers can follow linked issues on free view-only seats.`);
  }
  if (overbuy) { score = Math.min(score, 0.15); advice.push('You signed an enterprise AI-agent contract below the volume it is built for: the six-figure minimum buys far more capacity than your tickets need.'); }
  if (lockinFees > 0) score -= 0.1;
  if (best.id !== id && gap > 0.15) advice.push(`A stellar operator would run ${vendorOf(best.id).label} here: ${vendorOf(best.id).paradigm} About ${Math.round(gap * 100)}% cheaper all-in (tool bill + founder hours + churn, game estimate).`);
  if (mine.fit < 0.7) advice.push(`Your customers write in through ${Object.entries(p.mix ?? {}).filter(([, s]) => s >= 0.25).map(([k]) => CHANNELS[k].toLowerCase()).join(' and ')}; ${vendorOf(id).short} serves that poorly, so tickets take longer and accounts churn more.`);
  return { score: round2(clamp(score, 0, 1)), evidence, advice, mine, best, gap: round2(gap) };
}
