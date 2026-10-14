// Game state schema. Everything persistent lives in one plain JSON object.
// Each tool app owns its own slice (state.crm, state.ads, ...) and creates it lazily via ensure().

import { uid, dayOfWeek } from './util.js';

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

export function newState({ companyName, model, path, founderName, savings = 30000, hoursPerWeek = 55, seed = Date.now() }) {
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
    plans: [{ id: 'plan_main', name: 'Pro', price: MODELS[model].defaultPrice, interval: MODELS[model].interval, trialDays: model === 'ent' ? 0 : 14, active: true }],
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

// ---- Founder time: every real action costs hours from a weekly budget. ----

export function hoursLeft(state) {
  return Math.max(0, state.founder.hoursPerWeek - state.founder.hoursUsed);
}

export class OutOfHoursError extends Error {
  constructor(need, left, message = null) {
    super(message ?? `That takes ${need}h but you only have ${left.toFixed(1)}h left this week. Advance time or reprioritize.`);
    this.name = 'OutOfHoursError';
  }
}

// Throws OutOfHoursError if the week's budget can't cover it.
export function spendHours(state, hours, label) {
  // A protected day off (Sunday) is actually off.
  if (state.founder.wellbeing?.dayOff && dayOfWeek(state) === 0 && hours > 0) throw new OutOfHoursError(hours, 0, 'Today is your protected day off. Advance to Monday, or turn off the day off in You.');
  const left = hoursLeft(state);
  if (hours > left + 1e-9) throw new OutOfHoursError(hours, left);
  state.founder.hoursUsed += hours;
  state.founder.timeLog ??= [];
  state.founder.timeLog.push({ day: state.day, hours, label });
  if (state.founder.timeLog.length > 1000) state.founder.timeLog.splice(0, 200);
  return true;
}
