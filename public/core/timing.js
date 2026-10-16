// How long things take. Every wait in the game (a reply, a decision, a signature, a wire, a review) is a draw from a
// distribution, not a fixed number. Each process has a population distribution (median and 90th percentile of a
// lognormal, docs/research/timelines.md). Where *you* land in it depends on who you are and who they are:
//
//   z = A·pull + √(1−A²)·noise,   days = median × speed × exp(σ·z)
//
// `pull` is a sum of context factors in population standard deviations (negative = faster: a hot round, a warm
// intro, a clean data room; positive = slower: a cold email, a busy partner, missing paperwork). A = 0.6, so context
// explains about a third of the variance and luck the rest: a great company still sometimes waits, a weak one is
// rarely fast. `speed` is a structural multiplier on the median (a multistage fund's partnership vs a solo GP).
// Every draw returns its factors and percentile so the UI can explain why it took that long.
//
// Sources: [S] sourced, [V] vendor data, [design] our estimate (never shown to players as a statistic).

import { rng, gaussian, clamp, isWeekend } from './util.js';

const A = 0.6; // share of the z-score that context explains [design]
const Z90 = 1.2816;

// unit 'bday' counts business days (weekends skipped); 'day' counts calendar days.
export const TIMELINES = {
  // ---- Investors (docs/research/timelines.md §1) ----
  'investor.reply.warm': { median: 1, p90: 4, unit: 'bday', src: '[design] warm intro: reply in ~a day, hours to 4 days' },
  'investor.reply.cold': { median: 3.5, p90: 12, unit: 'bday', src: '[design] cold: 3-4 days when they reply at all (70-90% never do)' },
  'investor.intro': { median: 3, p90: 10, unit: 'bday', src: '[design] connector forwards the blurb and the investor opts in' },
  'investor.afterFirst': { median: 8, p90: 24, unit: 'day', src: '[V] first → partner meeting 1-2 weeks, 3 days-5 weeks; partner meetings are weekly' },
  'investor.afterPartner': { median: 2, p90: 6, unit: 'bday', src: '[V] a yes after the partner meeting comes in 1-3 days' },
  'investor.slowNo': { median: 9, p90: 28, unit: 'day', src: '[V] silence beyond ~5 days usually means no; the pass email trails it' },
  'investor.angelDecision': { median: 7, p90: 21, unit: 'day', src: '[V] individual angel: 1-2 weeks on SAFE rounds (Holloway)' },
  'investor.angelGroup': { median: 55, p90: 110, unit: 'day', src: '[V] application → funding 90-180 days; after the pitch, diligence team + monthly vote + docs ≈ 1.5-4 months' },
  'investor.diligence': { median: 18, p90: 40, unit: 'day', src: '[V] pre-IC diligence 1-3 weeks, up to 6' },
  'investor.calendar': { median: 4, p90: 12, unit: 'bday', src: '[design] next free slot: first meetings ~a week out, partners 1-2 weeks, hot deals within 48h' },
  'close.safe': { median: 9, p90: 20, unit: 'day', src: '[V] SAFE agreed → signed and wired 1-2 weeks (Amplify)' },
  'close.spv': { median: 14, p90: 28, unit: 'day', src: '[V] SPV fill; LANDSCAPE 18-28 days' },
  'close.priced': { median: 32, p90: 52, unit: 'day', src: '[V] signed term sheet → wire 2-6 weeks; Cooley 30-45 days' },
  'close.followOn': { median: 10, p90: 21, unit: 'day', src: '[design] insider pro-rata follow-on' },
  // ---- People and inboxes (§2) ----
  'scheduling.exchange': { median: 0.4, p90: 1.5, unit: 'bday', src: '[S] ~8 emails per meeting (Calendar.help); each round trip about half a day' },
  'partner.reply': { median: 3, p90: 9, unit: 'bday', src: '[design] co-marketing / partnerships manager' },
  'press.reply': { median: 2, p90: 7, unit: 'bday', src: '[design] reporters answer pitches they want within days' },
  'meeting.lead.prospect': { median: 3, p90: 9, unit: 'bday', src: '[design] IC 1-3 days, execs 5-10 business days to the first free slot' },
  'candidate.offerDecision': { median: 3, p90: 8, unit: 'bday', src: '[design] offers usually get an answer within a week; competing offers stretch it' },
  // ---- Platforms, government and payment rails (§3) ----
  'dispute.decision': { median: 50, p90: 80, unit: 'day', src: '[design] issuer decides ~45-60 days after evidence, up to ~90' },
  'dispute.filed': { median: 18, p90: 45, unit: 'day', src: '[V] cardholders dispute within weeks; networks allow up to 120 days' },
  'refund.request': { median: 2, p90: 6, unit: 'day', src: '[design]' },
  'gov.ein.fax': { median: 5, p90: 12, unit: 'bday', src: '[V] IRS: ~4 business days by fax, reports of 10+' },
  'gov.ein.foreign': { median: 25, p90: 50, unit: 'day', src: '[V] mail/foreign applicants ~4 weeks, over 8 at times' },
  // ---- Support back-and-forth (§5) ----
  'support.customerReply.b2b': { median: 0.6, p90: 3, unit: 'bday', src: '[design] a business customer answers a support follow-up within the day, slow ones in 3 business days' },
  'support.customerReply.consumer': { median: 0.4, p90: 2.5, unit: 'day', src: '[design] consumers answer on their phone, weekends included' },
  // ---- Vendor support (§6) ----
  'vendor.cloud.billing': { median: 2, p90: 7, unit: 'bday', src: '[V] AWS: no response target on Basic; paid plans "general guidance" < 24 h, system impaired < 12 h (aws.amazon.com/premiumsupport/plans)' },
  'vendor.stripe.support': { median: 1, p90: 4, unit: 'bday', src: '[V] Stripe: 24x7 phone, email and chat for all accounts; paid plans add priority queues (stripe.com/support-plans); fee-refund decisions take longer than the first reply [design]' },
  'vendor.meta.appeal': { median: 5, p90: 16, unit: 'day', src: '[V] Meta ad-account appeals: "usually 48 h", 3-7 or 5-14 business days in practitioner guides; no official figure' },
  // ---- Getting paid on an invoice (§7) ----
  'invoice.pay': { median: 40, p90: 75, unit: 'day', src: '[S, secondary] Atradius US 2025: ~45-day average terms, ~52% of invoice value paid on time; net-30 base: median due + 10, p90 due + 45' },
};

// Support plans and channels for vendor-support waits [V where tagged, else design]. `speed` scales the median.
export const VENDOR_PLANS = {
  cloud: {
    basic: { label: 'Basic support (no response target)', speed: 1 },
    business: { label: 'paid Business support (< 24 h target, chat/phone)', speed: 0.35, monthlyMin: 100, share: 0.1 }, // [V] greater of $100 or ~10% of usage (AWS historical Business pricing)
  },
  stripe: {
    standard: { label: 'standard support', speed: 1 },
    paid: { label: 'paid support plan (priority queue)', speed: 0.5 },
  },
  channel: { chat: { label: 'live chat', pull: -0.4 }, phone: { label: 'phone', pull: -0.5 }, email: { label: 'email ticket', pull: 0.2 }, form: { label: 'web form appeal', pull: 0.3 } },
};

/**
 * Context for a vendor-support wait: support plan, how much you spend with them, severity, channel.
 * `spendUsd` is monthly spend (or processing volume); bigger accounts get triaged sooner [design].
 */
export function vendorSupportFactors({ vendor = 'cloud', plan = null, spendUsd = 0, severity = 'normal', channel = null } = {}) {
  const p = plan ? VENDOR_PLANS[vendor]?.[plan] : null;
  const ch = channel ? VENDOR_PLANS.channel[channel] : null;
  return [
    p && p.speed !== 1 ? { label: p.label, speed: p.speed } : null,
    spendUsd >= 50000 ? { label: 'large account', pull: -0.5 } : spendUsd >= 5000 ? { label: 'mid-size account', pull: -0.2 } : spendUsd < 500 ? { label: 'tiny account', pull: 0.3 } : null,
    severity === 'critical' ? { label: 'business-critical', pull: -0.8 } : severity === 'high' ? { label: 'high severity', pull: -0.4 } : severity === 'low' ? { label: 'low priority', pull: 0.4 } : null,
    ch ? { label: ch.label, pull: ch.pull } : null,
  ].filter(Boolean);
}

// Who pays an invoice how fast, beyond the agreed terms, by buyer segment [S]/[V]/[design] (docs/research/timelines.md §7).
// speed scales the whole issue→paid time; pull places them in the distribution. Terms are applied separately.
export const INVOICE_PAYERS = {
  federal: { label: 'federal agency (Prompt Payment Act: 30 days or interest)', speed: 0.7, pull: -1.0 },
  state_gov: { label: 'state agency AP (state prompt-pay laws, 30-45 days)', speed: 1.05, pull: 0.3 },
  local_gov: { label: 'city/county warrant runs', speed: 1.05, pull: 0.3 },
  k12: { label: 'school district board-approved warrants', speed: 1.05, pull: 0.3 },
  higher_ed: { label: 'university AP', speed: 1, pull: 0.3 },
  hospitals: { label: 'hospital AP (avg payment period ~51 days)', speed: 1, pull: 0.4 },
  pharma: { label: 'pharma AP', speed: 1, pull: 0.3 },
  enterprise: { label: 'large-enterprise AP runs', speed: 1, pull: 0.3 },
  mid_market: { label: 'mid-market AP', speed: 1, pull: 0.1 },
  startup_smb: { label: 'startup founder pays it', speed: 0.85, pull: -0.3 },
  _group: {
    owner_smb: { label: 'owner pays it', speed: 0.9, pull: -0.1 },
    professional: { label: 'partner approves it', speed: 1, pull: 0 },
    company: { label: 'company AP', speed: 1, pull: 0.1 },
    regulated: { label: 'regulated AP controls', speed: 1.05, pull: 0.2 },
    health: { label: 'healthcare AP', speed: 1.05, pull: 0.2 },
    public: { label: 'public-sector AP', speed: 1.05, pull: 0.3 },
    education: { label: 'education AP', speed: 1.05, pull: 0.3 },
    nonprofit: { label: 'nonprofit, cash-tight', speed: 1, pull: 0.2 },
  },
};

/**
 * Factors for days-to-pay on an invoice. termsDays: net-N; segmentId/group: buyer; onboarding: 'done' | 'missing'
 * | null (vendor setup: W-9, supplier form); portal: invoices go through an AP portal; poMissing: PO required but none.
 */
export function invoicePayFactors({ termsDays = 30, segmentId = null, group = null, onboarding = null, portal = false, poMissing = false } = {}) {
  const seg = INVOICE_PAYERS[segmentId] ?? INVOICE_PAYERS._group[group] ?? null;
  return [
    termsDays !== 30 ? { label: `net-${termsDays}`, speed: (Math.max(0, termsDays) + 10) / 40 } : null,
    seg ? { label: seg.label, speed: seg.speed, pull: seg.pull } : null,
    onboarding === 'done' ? { label: 'vendor setup done (W-9, supplier form)', pull: -0.2 } : onboarding === 'missing' ? { label: 'vendor setup incomplete: AP holds the invoice', pull: 0.5 } : null,
    portal ? { label: 'goes through their AP portal', pull: 0.2 } : null,
    poMissing ? { label: 'no PO number on the invoice: bounced by AP', pull: 0.8 } : null,
  ].filter(Boolean);
}

const lognormal = (median, p90) => ({ mu: Math.log(median), sigma: Math.log(p90 / median) / Z90 });

// Standard normal CDF (Abramowitz-Stegun 7.1.26), for the percentile shown to players.
export function phi(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/**
 * Draw a duration. `factors`: [{ label, pull }] (z units, negative = faster) and/or [{ label, speed }] (median ×).
 * Returns { key, days, day, percentile, median, p10, p90, factors }. `day` is the calendar day it lands on.
 */
export function timeline(state, key, factors = [], { from = state.day, def = null } = {}) {
  const t = TIMELINES[key] ?? def;
  if (!t) throw new Error(`Unknown timeline ${key}`);
  const fs = factors.filter((f) => f && ((f.pull ?? 0) !== 0 || (f.speed ?? 1) !== 1));
  const pull = clamp(fs.reduce((a, f) => a + (f.pull ?? 0), 0), -2.5, 2.5);
  const speed = clamp(fs.reduce((a, f) => a * (f.speed ?? 1), 1), 0.2, 5);
  const { sigma } = lognormal(t.median, t.p90);
  // With no context modelled for this draw, all of the population's spread is luck as far as the game knows.
  const modelled = fs.some((f) => (f.pull ?? 0) !== 0);
  const z = modelled ? A * pull + Math.sqrt(1 - A * A) * gaussian(state) : gaussian(state);
  const median = t.median * speed;
  const days = Math.min(median * Math.exp(sigma * 3), median * Math.exp(sigma * z));
  return {
    key, days, day: landDay(state, from, days, t.unit), percentile: Math.round(phi(z) * 100),
    median, p10: median * Math.exp(-sigma * Z90), p90: median * Math.exp(sigma * Z90), factors: fs, src: t.src,
  };
}

// Convenience: just the day.
export const dueDay = (state, key, factors, opts) => timeline(state, key, factors, opts).day;

// Fractional days spill into the next day with that probability (when in the day it happens).
function landDay(state, from, days, unit) {
  const whole = Math.floor(days) + (rng(state) < days - Math.floor(days) ? 1 : 0);
  if (unit !== 'bday') return from + whole;
  let d = from, n = 0;
  while (n < whole) { d++; if (!isWeekend(state, d)) n++; }
  while (isWeekend(state, d)) d++;
  return d;
}

// One-line explanation for logs and notifications.
export function explain(t) {
  const why = t.factors.map((f) => f.label).filter(Boolean).join(', ');
  const d = Math.max(0, Math.round(t.days));
  return `${d} day${d === 1 ? '' : 's'} (typical ${Math.round(t.median)}, p${t.percentile}${why ? `: ${why}` : ''})`;
}

/**
 * The back-and-forth of booking one meeting. Without a booking link it takes ~3-8 emails (about 8 counting both
 * sides, Calendar.help [S]); with one, 1-2. Each round trip costs elapsed days and a few founder minutes, and the
 * meeting still lands on the other side's next free slot. Returns { exchanges, days, founderHours, fromDay }.
 * `pull` makes an eager counterpart answer faster; `busy` is how booked-out their calendar is (business days).
 */
export function schedulingBackAndForth(state, { bookingLink = false, parties = 1, pull = 0, calendarKey = 'meeting.lead.prospect', calendarFactors = [] } = {}) {
  const base = bookingLink ? 1 : 2 + Math.floor(rng(state) * 3) + Math.max(0, parties - 1); // round trips [design]
  const exchanges = Math.max(1, base);
  let day = state.day, days = 0;
  for (let i = 0; i < exchanges - (bookingLink ? 1 : 0); i++) {
    const t = timeline(state, 'scheduling.exchange', [{ label: '', pull }], { from: day });
    day = t.day; days += t.days;
  }
  const lead = timeline(state, calendarKey, calendarFactors, { from: day });
  return { exchanges, days: lead.day - state.day, fromDay: lead.day, founderHours: +(exchanges * (bookingLink ? 0.02 : 0.06)).toFixed(2), lead };
}
