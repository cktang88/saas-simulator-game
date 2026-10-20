// Game state schema. Everything persistent lives in one plain JSON object.
// Each tool app owns its own slice (state.crm, state.ads, ...) and creates it lazily via ensure().

import { uid, dayOfWeek } from './util.js';
import { OVERWORK, fatigueTax, weekWorked } from './overwork.js';

export const MODELS = {
  b2c: { label: 'B2C subscription app', short: 'B2C', defaultPrice: 9.99, interval: 'month' },
  smb: { label: 'B2B SaaS for small businesses', short: 'B2B SMB', defaultPrice: 49, interval: 'month' },
  ent: { label: 'B2B mid-market / enterprise SaaS', short: 'Enterprise', defaultPrice: 15000, interval: 'year' }, // ACV $15k (MARKET.ent.refPrice is the monthly equivalent)
};

export const PATHS = {
  indie: { label: 'Indie / bootstrapped', goal: 'Replace your salary, then reach $50k MRR profitably. Stay in control.' },
  vc: { label: 'Venture-backed', goal: 'Raise a pre-seed/seed and reach the Series A bar ($1–3M ARR, growing fast) before the money runs out.' },
};

// 2026: Monday Nov 2, 2026 is day 0 so the first weeks line up with real calendars.
export const START_DATE = '2026-11-02';

// plans: the game passes [] (prices are always set by the founder in the Pricing lab). The default single plan is kept
// for test fixtures and scripted sims that need something to sell.
export function newState({ companyName, model, path, founderName, savings = 30000, hoursPerWeek = 55, seed = Date.now(), plans = null }) {
  return {
    v: 3,
    seed: seed | 0,
    startDate: START_DATE,
    day: 0,
    company: {
      name: companyName,
      model,
      path,
      oneLiner: '',
      icp: '',
      domain: '',
      website: null, // { source: 'url'|'upload', url, title, description, headings, text, fetchedDay, eval }
      incorporated: false,
    },
    founder: {
      name: founderName,
      bio: '',
      linkedinText: '',
      linkedinFileId: null,
      network: { friends: 50, linkedin: 300, x: 100, newsletter: 0 },
      hoursPerWeek,
      hoursUsed: 0, // this week
      weekStartDay: 0,
      energy: 100,
      salary: 0, // monthly draw
    },
    // The founder's personal balance sheet. Living costs come out of personal savings every month
    // unless the company pays a salary/draw or the founder keeps a job.
    personal: {
      fico: 720,
      annualIncome: 0, // income still coming in (job kept, partner income counted separately)
      incomeType: 'none', // 'w2' (kept a job) | 'self_employed' | 'none' (quit to go full time)
      priorW2Income: 120000, // what you earned before quitting (lenders want current verifiable income)
      job: 'quit', // 'quit' | 'part_time' | 'full_time'
      monthlyLivingCosts: 3500, // rent, food, health insurance (ACA without enhanced subsidies in 2026), etc.
      liquidSavings: 0, // personal cash left after funding the company
      brokerage: 0,
      retirementVested: 0,
      homeEquity: 0,
      monthlyDebtPayments: 0,
      creditCardDebt: 0,
      usCitizenOrResident: true,
      loans: [], // personal debts taken to fund the company
      txns: [],
    },
    plans: plans ?? [{ id: 'plan_main', name: 'Pro', price: MODELS[model].defaultPrice, interval: MODELS[model].interval, trialDays: model === 'ent' ? 0 : 14, active: true }],
    bank: {
      // Before incorporation the business runs through the founder's own checking account (Mercury needs a
      // registered LLC/corp + EIN). The id stays 'checking': core/personal.js relabels it and opens Mercury
      // 1–3 business days after Legal incorporates and the EIN arrives.
      accounts: [{ id: 'checking', name: 'Personal checking — pre-incorporation', type: 'checking', personal: true, institution: 'Personal bank', balance: 0 }],
      txns: [],
      cards: [{ id: 'card_1', name: 'Founder card ••7702', limit: 5000 }],
    },
    recurring: [], // bills auto-charged to the bank: { id, vendor, amount, category, dayOfMonth, active, variable }
    stripe: null, // created by core/stripe.js ensureStripe()
    metrics: { daily: [] },
    mail: { threads: [] },
    notifications: [],
    log: [],
    jobs: [], // pending async (LLM) work
    llmUsage: { calls: 0, usd: 0, mockCalls: 0 },
    cache: {}, // LLM result cache by hash
    flags: {},
    apps: {}, // per-app slices live here: state.apps.crm, state.apps.ads, ...
    status: 'playing',
  };
}

// Lazily create an app's slice.
export function ensure(state, key, init) {
  if (!state.apps[key]) state.apps[key] = typeof init === 'function' ? init() : init;
  return state.apps[key];
}

export function log(state, type, text, app = null) {
  state.log.push({ id: uid('log'), day: state.day, type, text, app });
  if (state.log.length > 2000) state.log.splice(0, state.log.length - 2000);
}

export function notify(state, text, { type = 'info', app = null } = {}) {
  state.notifications.unshift({ id: uid('n'), day: state.day, text, type, app, read: false });
  if (state.notifications.length > 200) state.notifications.length = 200;
  log(state, type, text, app);
}

// ---- Founder time: every real action costs hours, against a weekly plan (founder.hoursPerWeek). ----

/** Planned hours left this week (0 once you are past the plan; you can still work, see spendHours). */
export function hoursLeft(state) {
  return Math.max(0, state.founder.hoursPerWeek - state.founder.hoursUsed);
}

// ---- The working day, layered on the weekly plan. ----
// Each day gets its planned share of what is left of the week: the week's remaining planned hours (before today) split
// over the days left in it (Monday starts a week; a protected Sunday gets nothing and is not counted). The plan is a
// plan, not a wall: you can keep working past it, late into the night, on weekends and on your day off. The day ends
// when you click End day or when today's work reaches the physical ceiling (core/overwork.js OVERWORK.dayMax), and work
// past it carries into the next day (founder.carryHours, applied by core/clock.js, which also fixes the share at the
// start of each day). Hours past ~12 a day or ~80 a week are paid for (core/overwork.js, core/wellbeing.js).
export const dayUsed = (state) => (state.founder.dayOf === state.day ? state.founder.dayUsed ?? 0 : 0);
export function computeDayCap(state) {
  const f = state.founder;
  const off = Boolean(f.wellbeing?.dayOff);
  const dow = dayOfWeek(state); // 0 Sunday .. 6 Saturday
  if (off && dow === 0) return 0;
  const daysLeft = dow === 0 ? 1 : (off ? 7 - dow : 8 - dow); // including today
  const before = Math.max(0, (f.hoursUsed ?? 0) - dayUsed(state));
  return Math.round((Math.max(0, f.hoursPerWeek - before) / Math.max(1, daysLeft)) * 100) / 100;
}
/** Today's planned hours (the plan, not a limit). */
export function dayCap(state) {
  const f = state.founder;
  return f.dayCapDay === state.day && Number.isFinite(f.dayCapToday) ? f.dayCapToday : computeDayCap(state);
}
export function addDayHours(state, hours) {
  const f = state.founder;
  if (f.dayOf !== state.day) { f.dayOf = state.day; f.dayUsed = 0; }
  f.dayUsed = Math.max(0, (f.dayUsed ?? 0) + hours);
  // Working on the protected day off forfeits its recovery for the week (core/wellbeing.js wellbeingWeek).
  if (hours > 0 && f.wellbeing?.dayOff && dayOfWeek(state) === 0 && f.dayUsed > OVERWORK.restDayMinHours) f.dayOffWorked = state.day;
}
/** Planned hours left today: today's share minus what today already used, never more than the week's plan has left. */
export const hoursLeftToday = (state) => Math.max(0, Math.min(dayCap(state) - dayUsed(state), hoursLeft(state)));

export class OutOfHoursError extends Error {
  constructor(need, left, message = null) {
    super(message ?? `That takes ${need}h but you only have ${left.toFixed(1)}h left this week. Advance time or reprioritize.`);
    this.name = 'OutOfHoursError';
  }
}

// Charges a player action's hours. Past the plan is allowed (overtime, weekends, the day off); past ~12 h a day or
// ~80 h a week the same work takes longer (fatigue: slower, mistakes, redo), charged as a separate time-log line so
// the cost is visible. Only the physical weekly ceiling (OVERWORK.weekMax) refuses work. `overtime` is kept for
// callers that used to need a stretch past the week; it no longer changes anything.
export function spendHours(state, hours, label, _opts = {}) {
  const f = state.founder;
  const tax = hours > 0 ? fatigueTax(state, hours) : 0;
  if (hours > 0 && weekWorked(state) + hours + tax > OVERWORK.weekMax + 1e-9) {
    throw new OutOfHoursError(hours, Math.max(0, OVERWORK.weekMax - weekWorked(state)), `You have already worked ${Math.round(weekWorked(state))}h this week. Nobody can do more than about ${OVERWORK.weekMax}h; end the day and sleep.`);
  }
  f.hoursUsed += hours;
  addDayHours(state, hours);
  f.timeLog ??= [];
  const entry = { day: state.day, hours, label };
  f.timeLog.push(entry);
  if (tax > 0.005) {
    f.hoursUsed += tax;
    addDayHours(state, tax);
    f.fatigueWeek = (f.fatigueWeek ?? 0) + tax;
    f.timeLog.push({ day: state.day, hours: tax, label: 'Fatigue: slower work, mistakes & redo (overwork)' });
    entry.fatigue = tax; // the action's entry knows its tax, so a refund returns both
  }
  if (f.timeLog.length > 1000) f.timeLog.splice(0, 200);
  return entry;
}

/**
 * Work the game forces on the founder (incident response, cleanup, compliance chores, investor or co-founder
 * obligations, mistake costs). The weekly hours are a plan, not a wall: forced work is charged in full past the plan,
 * up to the physical weekly ceiling (OVERWORK.weekMax), on today's hours (so overwork and fatigue see it) and in the
 * time log (so the cost is traceable). Never throws. Returns the hours actually charged.
 */
export function forceHours(state, hours, label, { functionId = null, app = null } = {}) {
  const f = state.founder;
  if (!f || !(hours > 0)) return 0;
  const h = Math.round(Math.min(hours, Math.max(0, OVERWORK.weekMax - weekWorked(state))) * 100) / 100;
  if (h <= 0) return 0;
  f.hoursUsed = (f.hoursUsed ?? 0) + h;
  addDayHours(state, h);
  const entry = { day: state.day, hours: h, label, forced: true };
  if (functionId) entry.functionId = functionId;
  if (app) entry.app = app;
  (f.timeLog ??= []).push(entry);
  if (f.timeLog.length > 1000) f.timeLog.splice(0, 200);
  return h;
}

// Undo a spendHours charge (the timeLog entry it pushed) when the action it paid for was rejected.
export function refundHours(state, entry) {
  const i = state.founder.timeLog?.lastIndexOf(entry) ?? -1;
  if (i < 0 || entry.day !== state.day) return false; // the week may have rolled over while it ran
  const f = state.founder;
  const tax = entry.fatigue ?? 0;
  if (tax && f.timeLog[i + 1]?.label?.startsWith('Fatigue')) f.timeLog.splice(i + 1, 1);
  f.timeLog.splice(i, 1);
  f.hoursUsed = Math.max(0, f.hoursUsed - entry.hours - tax);
  if (tax) f.fatigueWeek = Math.max(0, (f.fatigueWeek ?? 0) - tax);
  addDayHours(state, -(entry.hours + tax));
  return true;
}
