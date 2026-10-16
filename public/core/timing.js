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
};

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
