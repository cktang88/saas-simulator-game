// Overwork: the founder's planned hours (founder.hoursPerWeek, spread over the days) are a plan, not a wall. You can
// keep working late, through the weekend or on your day off, but hours past ~12 a day or ~80 a week are paid for:
// each extra hour gets less done (Pencavel 2014: output at 70 h/week barely differs from 56 h), mistakes and redo
// rise (Dembe 2005: 12h+ days carry a 37% higher injury hazard), sleep debt piles up and lingers (Van Dongen 2003:
// chronic 6 h nights build deficits people don't notice; recovery takes several nights), energy drains, burnout
// odds climb and you catch colds more often (Prather 2015: <6 h sleep, OR ≈ 4.2). Sources and [design] notes:
// docs/research/world-ops-support-life.md §5.3.
//
// Pure helpers only (no imports from state.js) so state.js, clock.js and wellbeing.js can all use them.

import { dayOfWeek } from './util.js';

export const OVERWORK = {
  dayWarn: 12, // h/day: past this, significant penalties (Dembe 2005 12h+ day threshold; WHO/ILO 2021 55h+ week)
  weekWarn: 80, // h/week: past this, a crunch week (≈ 11.5 h every day, no day off) [design threshold]
  dayMax: 18, // [design] hard physical ceiling: hours of work in one day before you fall asleep (9am start → 3am)
  weekMax: 120, // [design] nobody sustains more; the game refuses work past it
  lifeHours: 4, // [design] awake hours that are not work (eating, hygiene, errands); so sleep ≈ 24 − work − 4
  sleepNeed: 8, // h/night (Van Dongen 2003 control group: 8 h time in bed kept performance stable)
  // Efficiency of an hour of work by the hour of the day it falls in [design, anchored on Dembe 2005 and
  // Folkard & Tucker 2003: error/injury risk rises steeply after the 9th–12th hour].
  dayEff: [[10, 1], [12, 0.9], [14, 0.75], [16, 0.6], [Infinity, 0.5]],
  // ...and by the hour of the week (Pencavel 2014: proportional to ~49 h, diminishing after, ~flat 56→70 h).
  // The game starts the tax at 60 h because the default plan is 55 h [design].
  weekEff: [[60, 1], [70, 0.85], [80, 0.7], [Infinity, 0.5]],
  debtEffPerHour: 0.01, // [design] each hour of sleep debt costs ~1% (14 nights at 6 h ≈ 28 h debt ≈ −28%, Van Dongen 2003)
  debtEffFloor: 0.6,
  debtCap: 40,
  recoverNormal: 1.5, // [design] h of debt repaid by a night after a ≤10 h day (recovery is slow: Belenky 2003, Banks 2010)
  recoverRest: 3, // [design] ...after a real rest day (< 1 h of work)
  energyPerHourOver12: 1, // [design] energy points lost per hour past 12 in a day, on top of the weekly drain
  energyPerHourOver80: 0.3, // [design] extra weekly energy loss per hour past 80
  illnessDebt: 10, // h of sleep debt (≈ a week of <6.5 h nights) from which colds/flu come more often
  illnessMult: 3, // Prather 2015: <6 h sleep OR ≈ 4.2 for a cold; Cohen 2009: <7 h ≈ 2.9x → 3x [rounded]
  burnoutPerDebtHour: 1 / 20, // [design] weekly burnout hazard × (1 + debt/20)
  restDayMinHours: 0.5, // more work than this on the protected day off forfeits its recovery that week [design]
};

const step = (table, h) => table.find(([lim]) => h < lim)?.[1] ?? table.at(-1)[1];

/** Hours actually worked this week (excludes hours lost to illness/low energy; includes a day job). */
export function weekWorked(state) {
  const f = state.founder;
  const job = { full_time: 40, part_time: 20 }[state.personal?.job] ?? 0;
  return Math.max(0, (f.hoursUsed ?? 0) - (f.lostHoursThisWeek ?? 0)) + job;
}

export const todayWorked = (state) => (state.founder.dayOf === state.day ? state.founder.dayUsed ?? 0 : 0);

export function sleepDebtEff(state) {
  const debt = state.founder.sleepDebt ?? 0;
  return Math.max(OVERWORK.debtEffFloor, 1 - OVERWORK.debtEffPerHour * debt);
}

/** Efficiency of the next hour of work right now (1 = normal). */
export function workEfficiency(state, { dayH = todayWorked(state), weekH = weekWorked(state) } = {}) {
  return Math.min(step(OVERWORK.dayEff, dayH), step(OVERWORK.weekEff, weekH)) * sleepDebtEff(state);
}

/**
 * Extra hours an action of `hours` really takes because of fatigue (slower work, mistakes, redo): the action's
 * hours are integrated from where today and this week stand. 0 on a normal day of a normal week with no sleep debt.
 */
export function fatigueTax(state, hours) {
  const h = Math.max(0, Number(hours) || 0);
  if (!h) return 0;
  const d0 = todayWorked(state), w0 = weekWorked(state);
  // An action longer than what is left of the day can't be crammed into it: it runs over the next days at a normal
  // pace (the shell rolls it over the same way), so only the weekly load and sleep debt slow it, not the hour of day.
  const spread = d0 + h > OVERWORK.dayMax;
  const n = Math.max(1, Math.ceil(h / 0.25));
  const dt = h / n;
  let extra = 0;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * dt;
    const dayH = spread ? Math.min(d0 + x, Math.max(d0, 10)) : d0 + x;
    extra += dt * (1 / workEfficiency(state, { dayH, weekH: w0 + x }) - 1);
  }
  return Math.round(extra * 100) / 100;
}

/** What an action of `hours` would do to today/this week: used by the shell to warn before crossing a line. */
export function overworkPreview(state, hours) {
  const tax = fatigueTax(state, hours);
  const total = hours + tax;
  const d0 = todayWorked(state), w0 = weekWorked(state);
  const wb = state.founder.wellbeing;
  return {
    tax,
    dayAfter: d0 + total,
    weekAfter: w0 + total,
    crossesDay: d0 <= OVERWORK.dayWarn + 1e-9 && d0 + total > OVERWORK.dayWarn + 1e-9,
    crossesWeek: w0 <= OVERWORK.weekWarn + 1e-9 && w0 + total > OVERWORK.weekWarn + 1e-9,
    breaksDayOff: Boolean(wb?.dayOff) && dayOfWeek(state) === 0 && d0 <= OVERWORK.restDayMinHours && d0 + total > OVERWORK.restDayMinHours,
    overWeekMax: w0 + total > OVERWORK.weekMax + 1e-9,
  };
}
