// The simulation clock. Time moves in whole days; each day runs core systems, then every app's onDay().
// Async work (LLM) is enqueued as jobs and processed after the tick by core/jobs.js.

import { chargeRecurring, balance, post } from './bank.js';
import { stripeDay, mrr, activeSubs, trialingSubs, ensureStripe } from './stripe.js';
import { ensureMarket } from './market.js';
import { dayOfWeek, isLastDayOfMonth, round2 } from './util.js';
import { notify } from './state.js';
import { BANK } from './params.js';

export const GRACE_DAYS_NEGATIVE = 14;

export function advanceOneDay(state, apps = []) {
  if (state.status !== 'playing') return;
  state.day++;
  ensureStripe(state);
  ensureMarket(state);

  // New week: founder hours reset; sustained overwork drains energy.
  if (dayOfWeek(state) === 1) {
    const f = state.founder;
    const over = f.hoursUsed - 60;
    f.energy = Math.max(0, Math.min(100, f.energy + (over > 0 ? -over * 0.8 : 6)));
    f.hoursUsed = 0;
    f.weekStartDay = state.day;
    if (f.energy < 30) notify(state, `You're running on fumes (energy ${Math.round(f.energy)}). Sustained 70h+ weeks make you slower and sloppier.`, { type: 'bad' });
  }

  chargeRecurring(state);
  stripeDay(state);

  for (const app of apps) {
    try { app.onDay?.(state); } catch (e) { console.error(`[${app.id}] onDay failed`, e); }
  }

  if (isLastDayOfMonth(state)) {
    // Treasury/interest on idle cash (paid monthly).
    const bal = balance(state);
    if (bal > 5000) post(state, { amount: round2((bal * BANK.treasuryApy) / 12), counterparty: 'Treasury sweep', description: 'Interest', category: 'interest', method: 'internal' });
    if (state.founder.salary > 0) post(state, { amount: -state.founder.salary, counterparty: state.founder.name, description: 'Founder salary / owner draw', category: 'owner_draw', method: 'ach' });
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
    cash: Math.round(balance(state)),
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
