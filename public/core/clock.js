// The simulation clock. Time moves in whole days; each day runs core systems, then every app's onDay().
// Async work (LLM) is enqueued as jobs and processed after the tick by core/jobs.js.

import { chargeRecurring, balance, post, totalCash } from './bank.js';
import { stripeDay, mrr, activeSubs, trialingSubs, ensureStripe } from './stripe.js';
import { ensureMarket } from './market.js';
import { dayOfWeek, isLastDayOfMonth, round2 } from './util.js';
import { notify } from './state.js';
import { BANK } from './params.js';
import { personalMonth, payFounder } from './personal.js';
import { calendarDay } from './calendar.js';
import { networkDay } from './network.js';
import { wellbeingWeek, applyCapacity, lifeDay } from './wellbeing.js';

export const GRACE_DAYS_NEGATIVE = 14;

export function advanceOneDay(state, apps = []) {
  if (state.status !== 'playing') return;
  state.day++;
  ensureStripe(state);
  ensureMarket(state);

  // New week: energy updates from last week's load, hours reset, reduced capacity shows up as lost hours.
  if (dayOfWeek(state) === 1) {
    wellbeingWeek(state);
    state.founder.hoursUsed = 0;
    state.founder.weekStartDay = state.day;
    applyCapacity(state);
  }

  calendarDay(state);
  chargeRecurring(state);
  stripeDay(state);
  personalMonth(state);
  networkDay(state);
  lifeDay(state);

  for (const app of apps) {
    try { app.onDay?.(state); } catch (e) { console.error(`[${app.id}] onDay failed`, e); }
  }

  if (isLastDayOfMonth(state)) {
    // Checking pays no interest; Treasury yield is paid by the Bank app when the founder enables it.
    // Founder pay: C-corp → W-2 payroll (wages + employer taxes + Gusto); LLC/sole prop → owner draw + 1040-ES accrual.
    payFounder(state);
    for (const app of apps) {
      try { app.onMonthEnd?.(state); } catch (e) { console.error(`[${app.id}] onMonthEnd failed`, e); }
    }
  }

  snapshot(state);
  checkSolvency(state);
}

export function advance(state, days, apps) {
  for (let i = 0; i < days && state.status === 'playing'; i++) advanceOneDay(state, apps);
}

function snapshot(state) {
  const st = state.stripe;
  state.metrics.daily.push({
    day: state.day,
    cash: Math.round(totalCash(state)),
    stripeBalance: Math.round(st.available + st.pending.reduce((a, p) => a + p.amount, 0)),
    mrr: Math.round(mrr(state)),
    customers: activeSubs(state).length,
    trialing: trialingSubs(state).length,
  });
  if (state.metrics.daily.length > 1500) state.metrics.daily.shift();
}

function checkSolvency(state) {
  const bal = balance(state);
  if (bal >= 0) {
    state.flags.negativeSince = null;
    return;
  }
  if (state.flags.negativeSince == null) {
    state.flags.negativeSince = state.day;
    notify(state, `Your bank account is overdrawn (${Math.round(bal)}). Cards are declining. Add personal funds, cut costs, or raise money within ${GRACE_DAYS_NEGATIVE} days.`, { type: 'bad', app: 'bank' });
  } else if (state.day - state.flags.negativeSince >= GRACE_DAYS_NEGATIVE) {
    state.status = 'dead';
    notify(state, 'You ran out of money and had to shut the company down.', { type: 'bad' });
  }
}
