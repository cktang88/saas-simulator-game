// Headless harness for end-to-end realism bots. Drives the real app modules (no UI), offline LLM fallbacks.
const R = (process.env.SIM_ROOT ?? '/home/user/saas-simulator-game/public') + '';
export const { newState, spendHours, hoursLeft, OutOfHoursError } = await import(R + '/core/state.js');
export const { advanceOneDay } = await import(R + '/core/clock.js');
export const { seedDefaultStack, post, balance, totalCash } = await import(R + '/core/bank.js');
export const stripe = await import(R + '/core/stripe.js');
export const market = await import(R + '/core/market.js');
export const llm = await import(R + '/core/llm.js');
export const jobs = await import(R + '/core/jobs.js');
export const { APPS } = await import(R + '/apps/registry.js');
export const util = await import(R + '/core/util.js');
export const personal = await import(R + '/core/personal.js');

const product = await import(R + '/apps/product.js');
const productStore = await import(R + '/apps/product/store.js');
const website = await import(R + '/apps/website.js');
const customers = await import(R + '/apps/customers.js');
export const { gradeSpec, queueFeature } = product;
export const { build } = product;

for (const app of APPS) for (const [type, h] of Object.entries(app.jobs ?? {})) jobs.registerJob(type, h);
const origErr = console.error;
export const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x && x.stack) ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x)).join(' ').slice(0, 400)); };
export const restoreConsole = () => { console.error = origErr; };

export function makeGame({ model = 'smb', path = 'indie', seed = 1, savings = 30000, hours = 55, job = 'quit', liquidSavings = 20000, living = 3500,
  priorIncome = 120000, network = { friends: 50, linkedin: 300, x: 100, newsletter: 0 }, oneLiner, icp, name = 'Botco' }) {
  const state = newState({ companyName: name, model, path, founderName: 'Alex Bot', savings, hoursPerWeek: hours, seed });
  Object.assign(state.founder.network, network);
  state.company.oneLiner = oneLiner ?? ONE[model];
  state.company.icp = icp ?? ICP[model];
  Object.assign(state.personal, {
    fico: 720, liquidSavings, monthlyLivingCosts: living, priorW2Income: priorIncome, job,
    incomeType: job === 'quit' ? 'none' : 'w2',
    annualIncome: job === 'full_time' ? priorIncome : job === 'part_time' ? Math.round(priorIncome * 0.45) : 0,
    retirementVested: 40000, homeEquity: 0, monthlyDebtPayments: 300,
  });
  if (job === 'full_time') state.founder.hoursPerWeek = Math.min(state.founder.hoursPerWeek, 25);
  else if (job === 'part_time') state.founder.hoursPerWeek = Math.min(state.founder.hoursPerWeek, 40);
  stripe.ensureStripe(state); market.ensureMarket(state); seedDefaultStack(state);
  if (savings > 0) post(state, { amount: savings, counterparty: 'Alex Bot', description: 'Initial owner contribution', category: 'owner_contribution', method: 'ach' });
  const ctx = {
    state, llm, params: '',
    enqueue(type, payload, opts) { return jobs.enqueue(state, type, payload, opts); },
    save() {}, render() {}, navigate() {}, toast() {}, runJobs() {},
  };
  const g = { state, ctx, rec: newRec(), hoursByLabel: {} };
  return g;
}

export const ONE = {
  smb: 'Automated month-end payout reconciliation for Shopify stores',
  b2c: 'A habit coach app that helps busy parents stick to a 20-minute daily workout',
  ent: 'Automated SOC 2 evidence collection for mid-market fintech security teams',
};
export const ICP = {
  smb: 'Shopify store owners and their bookkeepers doing $1-10M/yr who reconcile payouts by hand',
  b2c: 'Busy parents aged 30-45 who want to exercise at home 20 minutes a day',
  ent: 'Security and compliance leads at fintech companies with 200-2000 employees preparing SOC 2 audits',
};

function newRec() {
  return { firstShipDay: null, mvpDay: null, firstPaidDay: null, d1k: null, d10k: null, deathDay: null, burnouts: 0, monthly: [], raised: 0, raiseClosedDay: null, notes: [] };
}

// Try to spend founder hours; false if not enough left this week.
export function tryHours(g, h, label) {
  try { spendHours(g.state, h, label); g.hoursByLabel[label] = (g.hoursByLabel[label] ?? 0) + h; return true; } catch (e) { if (e instanceof OutOfHoursError) return false; throw e; }
}

export async function drain(g) { if (g.state.jobs.length) await jobs.drainJobs(g.ctx); }

// Advance one day, drain jobs, record metrics.
export async function day(g) {
  const s = g.state;
  const before = s.founder.wellbeing?.events?.filter((e) => e.type === 'burnout_episode').length ?? 0;
  advanceOneDay(s, APPS);
  await drain(g);
  const after = s.founder.wellbeing?.events?.filter((e) => e.type === 'burnout_episode').length ?? 0;
  if (after > before) g.rec.burnouts += after - before;
  const m = stripe.mrr(s);
  const r = g.rec;
  if (r.firstPaidDay == null && (s.stripe.charges.some((c) => c.status === 'succeeded') || stripe.activeSubs(s).length)) r.firstPaidDay = s.day;
  if (r.d1k == null && m >= 1000) r.d1k = s.day;
  if (r.d10k == null && m >= 10000) r.d10k = s.day;
  const shipped = market.shippedFeatures(s).length;
  if (r.firstShipDay == null && shipped >= 1) r.firstShipDay = s.day;
  if (r.mvpDay == null && shipped >= 3) r.mvpDay = s.day;
  if (s.status === 'dead' && r.deathDay == null) r.deathDay = s.day;
  if (s.day % 30 === 0) {
    r.monthly.push({ m: s.day / 30, mrr: Math.round(m), cust: stripe.activeSubs(s).length, cash: Math.round(balance(s)), personal: Math.round(s.personal.liquidSavings), energy: Math.round(s.founder.energy), job: s.personal.job, hpw: s.founder.hoursPerWeek, status: s.status });
  }
}

// ---------------- Product ----------------
const SPECS_SMB = [
  ['Auto-match payouts to orders', 'At month-end the owner spends 6 hours matching payouts to orders by hand in a Google Sheets spreadsheet; 7 of 9 interviewees said they miss refunds and fees, which causes errors.', 'Every night the app pulls payouts via API, matches each payout line to orders, flags unmatched lines, and shows a report the user can export to CSV.'],
  ['Flag unmatched refunds', 'Refunds are missed in 5 of 8 stores we interviewed; last month one store lost $1,200 because a refund was booked twice by hand in a spreadsheet.', 'When a refund arrives the app matches it to the original order, flags duplicates, and sends an email alert listing unmatched refunds each morning.'],
  ['Month-end close checklist', 'Owners told us (6 of 9 interviews) that month-end takes 2 days because steps live in email and a spreadsheet; they miss steps and file late.', 'The app creates a checklist each month, tracks each step, reminds the assignee by email, and shows a report of what is late.'],
  ['Export journal entries', 'Bookkeepers re-type 40-80 journal lines a month from the report into their ledger by hand; 4 of 6 said copy and paste errors cost them an hour each close.', 'The app generates journal entries from matched payouts and exports them as a CSV file the bookkeeper can import, with a preview before download.'],
  ['Fee breakdown report', 'Owners cannot see processing fees per channel; 5 of 9 said they guess fees in a spreadsheet and missed $300-900 per month of fee changes.', 'The app calculates fees per payout, groups them by channel, shows a monthly report, and flags fee increases over 10% by email.'],
  ['Multi-store switcher', 'Agencies managing 5-20 stores log in and out 30 times a week; 3 of 4 agency interviews said this wastes 3 hours weekly.', 'Users can connect several stores, switch between them from one menu, and see a combined report that lists each store’s unmatched items.'],
];
const SPECS_B2C = [
  ['20-minute home workout plan', 'Busy parents aged 30-45 told us (8 of 11 interviews) they skip workouts because planning takes 15 minutes and the kids interrupt; 6 quit their gym app within a month.', 'Every evening the app generates a 20-minute home workout for the next day, sends a reminder at the time the parent picks, and shows the plan with no equipment needed.'],
  ['Pause and resume when kids interrupt', 'Parents said a workout gets interrupted 2-3 times a week by kids waking up; 7 of 11 said they then give up for the day.', 'The parent can pause a workout, the app saves progress, sends a reminder after 30 minutes, and resumes the workout from the same exercise.'],
  ['Weekly habit streak', '9 of 11 busy parents said they lose motivation after missing 2 days; today they track workouts on paper or in notes.', 'The app tracks completed workouts, shows a weekly streak, and sends a short encouragement message after a missed day.'],
  ['Partner accountability', '5 of 11 parents said they work out more when their partner knows; they currently text each other screenshots.', 'A parent can invite a partner, both see each other weekly progress, and the app sends a reminder to both on missed days.'],
];
const SPECS_ENT = [
  ['Automated evidence collection from AWS', 'Security leads at fintechs with 200-2000 employees spend 600 hours per audit cycle taking screenshots for SOC 2 evidence; 6 of 8 interviewed said evidence collection is 40% of audit prep.', 'Every night the app pulls configuration evidence via the AWS API, maps it to SOC 2 controls, flags failing controls, and exports an evidence report for the auditor.'],
  ['Access review workflow', 'Compliance managers run quarterly access reviews in spreadsheets; 5 of 8 said reviews take 3 weeks and miss 10% of accounts.', 'The app imports users from Okta, assigns each manager their review list, sends reminders, and records approvals with an audit log export.'],
  ['Control failure alerts', 'Security teams learn about failing controls at audit time; 4 of 8 interviewed had an exception last year that cost $20k in remediation.', 'When a control fails, the app sends a Slack alert to the owner, creates a ticket, and tracks it until the control passes again.'],
  ['Auditor portal', 'Auditors request the same evidence 3-4 times per audit by email; security leads spend 40 hours answering requests.', 'The app gives the auditor a read-only portal that lists each control, its evidence and history, and logs every download for the audit trail.'],
];
const SPECS = { smb: SPECS_SMB, b2c: SPECS_B2C, ent: SPECS_ENT };
const USERS = { smb: 'Bookkeeper or owner at a store doing $1-5M/yr with 2,000+ orders a month', b2c: 'Busy parent aged 30-45 with kids under 10 who wants to exercise at home 20 minutes a day', ent: 'Security and compliance lead at a fintech with 200-2000 employees preparing a SOC 2 audit' };
let specN = 0;
export function newSpec(g) {
  const s = g.state;
  const set = SPECS[s.company.model] ?? SPECS_SMB;
  const [title, problem, solution] = set[specN % set.length];
  specN++;
  const f = productStore.newFeature(s);
  Object.assign(f, {
    title: `${title} v${Math.floor(specN / set.length) + 1}`,
    user: USERS[s.company.model],
    problem, solution,
    acceptance: ['Given 40 new items, when the nightly sync runs, then all 40 are processed within 5 minutes', 'Given an item with no match, when the sync runs, then it is flagged as unmatched', 'If the API token is expired, the sync fails with an error email to the owner'],
    metric: 'Hours spent on month-end close per store per month', baseline: '6 hours today; target under 1 hour within 60 days', nonGoals: 'No accounting-software sync and no multi-currency in v1',
  });
  f.acceptanceText = f.acceptance.join('\n');
  productStore.productSlice(s).features.push(f);
  return f;
}

// Write + grade + queue a spec if the queue is empty, then build with the given hours. Returns hours used.
export async function productWork(g, hours) {
  const s = g.state;
  const sl = productStore.productSlice(s);
  let used = 0;
  if (!sl.buildQueue.length) {
    const f = newSpec(g);
    const h = product.specHours(f);
    if (!tryHours(g, h, 'Product: spec')) return 0;
    used += h;
    await gradeSpec(g.ctx, f);
    if (f.grade?.pass) queueFeature(s, f);
  }
  const left = Math.min(hours - used, hoursLeft(s));
  if (left >= 0.5 && (sl.buildQueue.length || sl.bugs.some((b) => !b.fixedDay))) {
    const h = Math.min(12, left);
    if (tryHours(g, h, 'Product: build')) { build(s, h, { founder: true }); used += h; }
  }
  return used;
}

export async function setupWebsite(g, quality = 'ok') {
  const s = g.state;
  if (!tryHours(g, 4, 'Website')) return false;
  const txt = {
    ok: `${s.company.oneLiner}. Built for ${s.company.icp}. Save 5 hours every month. Pricing: $${s.plans[0].price} per month. Start free trial. How it works: connect, match, export. Questions? Email us.`,
  }[quality];
  s.company.website = { source: 'paste', title: s.company.name, text: txt, headings: ['How it works', 'Pricing', 'FAQ'] };
  await website.runPanel(g.ctx);
  return true;
}

export async function customerPanel(g) {
  if (!market.hasProduct(g.state)) return;
  if (!tryHours(g, customers.PANEL_HOURS ?? 2, 'Customer panel')) return;
  await customers.runPanel(g.ctx);
}

// Hours used this week by the calendar (meetings) are not in timeLog: estimate by difference.
export function hoursSummary(g) {
  const tl = {};
  for (const e of g.state.founder.timeLog ?? []) tl[e.label] = (tl[e.label] ?? 0) + e.hours;
  return tl;
}

export const sleep0 = () => new Promise((r) => setImmediate(r));

export function stats(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return { n: 0 };
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  return { n: a.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), mean: Math.round(a.reduce((x, y) => x + y, 0) / a.length) };
}
