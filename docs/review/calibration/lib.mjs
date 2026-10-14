// Calibration harness (copied from docs/review/e2e-bots/lib.mjs and extended). Drives the real app modules
// headlessly with the offline LLM fallbacks. Every action spends founder hours through spendHours() at the cost the
// UI charges; where a module exports no action function, the code is a line-for-line replica of the UI handler
// (noted inline). Nothing writes to state except through those functions or the exact UI-handler code.
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
export const cal = await import(R + '/core/calendar.js');
export const OUT = await import(R + '/apps/outcomes/engine.js');
export const OE = await import(R + '/apps/growth/organicEngine.js');
export const JG = await import(R + '/apps/growth/judges.js');
export const AE = await import(R + '/apps/growth/adsEngine.js');
export const GP = await import(R + '/apps/growth/params.js');
export const DL = await import(R + '/apps/growth/delivery.js');
export const RS = await import(R + '/apps/research.js');
export const IV = await import(R + '/apps/product/interview.js');
export const PS = await import(R + '/apps/product/store.js');
export const PE = await import(R + '/apps/people/sim.js');
export const PH = await import(R + '/apps/people/hiring.js');
export const PCAT = await import(R + '/apps/people/catalog.js');
export const LS = await import(R + '/apps/legal/sim.js');
export const FS = await import(R + '/apps/fundraising/sim.js');
export const FI = await import(R + '/apps/fundraising/investors.js');
export const FE = await import(R + '/apps/fundraising/view-eval.js');
export const PARAMS = await import(R + '/core/params.js');

const product = await import(R + '/apps/product.js');
const website = await import(R + '/apps/website.js');
const customers = await import(R + '/apps/customers.js');
export const { gradeSpec, queueFeature, build } = product;

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
  stripe.ensureStripe(state); market.ensureMarket(state); seedDefaultStack(state);
  if (savings > 0) post(state, { amount: savings, counterparty: 'Alex Bot', description: 'Initial owner contribution', category: 'owner_contribution', method: 'ach' });
  const ctx = {
    state, llm, params: '',
    enqueue(type, payload, opts) { return jobs.enqueue(state, type, payload, opts); },
    save() {}, render() {}, navigate() {}, toast() {}, runJobs() {},
  };
  return { state, ctx, rec: newRec(), hoursByLabel: {}, luckSeen: new Set(), luck: {}, habits: {}, specN: 0 };
}

export const ONE = {
  smb: 'Automated month-end payout reconciliation for Shopify stores',
  b2c: 'A habit coach app that helps busy parents stick to a 20-minute daily workout',
  ent: 'Automated SOC 2 evidence collection for mid-market fintech security teams',
};
// ICP by narrowness: elite = narrow segment, average = the market, mistakes = everyone.
export const ICP = {
  smb: 'Shopify store owners and their bookkeepers doing $1-10M/yr who reconcile payouts by hand',
  b2c: 'Busy parents aged 30-45 who want to exercise at home 20 minutes a day',
  ent: 'Security and compliance leads at fintech companies with 200-2000 employees preparing SOC 2 audits',
};
export const ICP_BROAD = {
  smb: 'Online store owners and small ecommerce businesses',
  b2c: 'Adults who want to get fitter and build better habits',
  ent: 'Mid-market companies that need SOC 2 or other compliance certifications',
};
export const ICP_EVERYONE = {
  smb: 'Small businesses, freelancers and anyone who sells online',
  b2c: 'Everyone who wants to be healthier',
  ent: 'Any company that has compliance requirements',
};

function newRec() {
  return { firstShipDay: null, mvpDay: null, firstPaidDay: null, d1k: null, d10k: null, d100k: null, deathDay: null, quitDay: null, burnouts: 0, monthly: [], raised: 0, notes: [] };
}

// Try to spend founder hours; false if not enough left this week.
export function tryHours(g, h, label) {
  try { spendHours(g.state, h, label); g.hoursByLabel[label] = (g.hoursByLabel[label] ?? 0) + h; return true; } catch (e) { if (e instanceof OutOfHoursError) return false; throw e; }
}

export async function drain(g) { if (g.state.jobs.length) await jobs.drainJobs(g.ctx); }

// Quit rule (identical for every policy, harness-level, documented in calibration.md): from month 12 on, a founder
// whose MRR stayed under $200 at each of the last 6 month-ends gives up (business goes dormant: the bot stops acting).
export const QUIT = { fromMonth: 12, window: 6, mrrBelow: 200 };

// Advance one day, drain jobs, record metrics and luck events.
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
  if (r.d100k == null && m >= 100000) r.d100k = s.day;
  const shipped = market.shippedFeatures(s).length;
  if (r.firstShipDay == null && shipped >= 1) r.firstShipDay = s.day;
  if (r.mvpDay == null && shipped >= 3) r.mvpDay = s.day;
  if (s.status === 'dead' && r.deathDay == null) r.deathDay = s.day;
  // Luck events (engine keeps the newest 100, newest first).
  for (const e of s.apps.outcomes?.events ?? []) { if (g.luckSeen.has(e.id)) break; g.luckSeen.add(e.id); g.luck[e.type] = (g.luck[e.type] ?? 0) + 1; }
  if (s.day % 30 === 0) {
    const mo = s.day / 30;
    r.monthly.push({ m: mo, mrr: Math.round(m), cust: stripe.activeSubs(s).length, cash: Math.round(balance(s)), personal: Math.round(s.personal.liquidSavings), energy: Math.round(s.founder.energy), job: s.personal.job, hpw: s.founder.hoursPerWeek, status: s.status });
    if (r.quitDay == null && mo >= QUIT.fromMonth && r.monthly.slice(-QUIT.window).every((x) => x.mrr < QUIT.mrrBelow)) { r.quitDay = s.day; g.quit = true; onQuit(g); }
    if ([3, 6, 12, 18, 24].includes(mo)) {
      try { const sg = OUT.signals(s); g.habits[mo] = Object.fromEntries(sg.habits.map((h) => [h.id, h.met])); g.habits[`act${mo}`] = Object.fromEntries(Object.entries(sg.activity).map(([k, v]) => [k, Math.round(v * 100) / 100])); } catch (e) { errors.push('signals ' + e.message); }
    }
  }
}

// A founder who quits stops spending: ads paused, contractors let go (UI: People → End contract, 1h), salary off.
function onQuit(g) {
  const s = g.state;
  for (const a of s.apps.ads?.adsets ?? []) a.status = 'paused';
  for (const m of s.apps.people?.members ?? []) if (m.status === 'active' && m.kind !== 'cofounder') { try { m.kind === 'ai_agent' ? PE.cancelAgent(s, m.id) : PE.terminate(s, m.id, { reason: 'founder wound down' }); } catch {} }
  s.founder.salary = 0;
}

// ---------------- Product ----------------
// Specs with no interview claims (any claim must be backed by logged real interviews or the lint blocks it).
const SPECS = {
  smb: [
    ['Auto-match payouts to orders', 'At month-end the owner spends 6 hours matching payouts to orders by hand in a Google Sheets spreadsheet; refunds and fees get missed, which causes errors.', 'Every night the app pulls payouts via the Shopify API, matches each payout line to orders, flags unmatched lines, and shows a report the user can export to CSV.'],
    ['Flag unmatched refunds', 'Refunds get missed at month-end; a store can lose $1,200 when a refund is booked twice by hand in a spreadsheet.', 'When a refund arrives the app matches it to the original order, flags duplicates, and sends an email alert listing unmatched refunds each morning.'],
    ['Month-end close checklist', 'Month-end takes 2 days because the steps live in email and a spreadsheet; owners miss steps and file late every month.', 'The app creates a checklist each month, tracks each step, reminds the assignee by email, and shows a report of what is late.'],
    ['Export journal entries', 'Bookkeepers re-type 40-80 journal lines a month from the report into their ledger by hand; copy and paste errors cost an hour each close.', 'The app generates journal entries from matched payouts and exports them as a CSV file the bookkeeper can import into QuickBooks, with a preview before download.'],
    ['Fee breakdown report', 'Owners cannot see processing fees per channel each month; they guess fees in a spreadsheet and miss $300-900 per month of fee changes.', 'The app calculates fees per payout, groups them by channel, sends a monthly report by email, and flags fee increases over 10%.'],
    ['Multi-store switcher', 'Agencies managing 5-20 stores log in and out 30 times a week, which wastes 3 hours weekly by hand.', 'Users can connect several stores, switch between them from one menu, and get a combined report that flags each store’s unmatched items.'],
  ],
  b2c: [
    ['20-minute home workout plan', 'Busy parents skip workouts because planning takes 15 minutes every evening and the kids interrupt; many quit their gym app within a month.', 'Every evening the app generates a 20-minute home workout for the next day, sends a reminder at the time the parent picks, and needs no equipment.'],
    ['Pause and resume when kids interrupt', 'A workout gets interrupted 2-3 times a week by kids waking up; parents then give up for the day.', 'The parent can pause a workout, the app saves progress, sends a reminder after 30 minutes, and resumes the workout from the same exercise.'],
    ['Weekly habit streak', 'Parents lose motivation after missing 2 days each week; today they track workouts on paper or in a notes app.', 'The app tracks completed workouts, shows a weekly streak, and sends a short encouragement message after a missed day.'],
    ['Partner accountability', 'Parents work out more when their partner knows; today they text each other screenshots every week.', 'A parent can invite a partner, both get each other’s weekly progress, and the app sends a reminder to both on missed days.'],
  ],
  ent: [
    ['Automated evidence collection from AWS', 'Security leads spend 600 hours per audit cycle taking screenshots for SOC 2 evidence by hand; evidence collection is 40% of audit prep every year.', 'Every night the app pulls configuration evidence via the AWS API, maps it to SOC 2 controls, flags failing controls, and exports an evidence report for the auditor.'],
    ['Access review workflow', 'Compliance managers run quarterly access reviews in spreadsheets; reviews take 3 weeks and miss 10% of accounts.', 'The app imports users from Okta, assigns each manager their review list, sends reminders, and records approvals with an audit log export.'],
    ['Control failure alerts', 'Security teams learn about failing controls at audit time; one exception last year cost $20k in remediation.', 'When a control fails, the app sends a Slack alert to the owner, creates a ticket, and tracks it until the control passes again.'],
    ['Auditor portal', 'Auditors request the same evidence 3-4 times per audit by email; security leads spend 40 hours answering requests each audit.', 'The app gives the auditor a read-only portal that lists each control, its evidence and history, and logs every download for the audit trail.'],
  ],
};
const USERS = { smb: 'Bookkeeper or owner at a Shopify store doing $1-5M/yr with 2,000+ orders a month', b2c: 'Busy parent aged 30-45 with kids under 10 who wants to exercise at home 20 minutes a day', ent: 'Security and compliance lead at a fintech with 200-2000 employees preparing a SOC 2 audit' };

// evidence: link the newest real insights and cite the real interview count (only what was logged).
export function newSpec(g, { evidence = false } = {}) {
  const s = g.state;
  const set = SPECS[s.company.model];
  const [title, problem0, solution] = set[g.specN % set.length];
  g.specN++;
  let problem = problem0;
  const f = PS.newFeature(s);
  if (evidence) {
    const rs = PS.researchSlice(s);
    const n = rs.interviews.filter((i) => i.real && i.status === 'done').length;
    if (n >= 3) problem = `${problem0} In our interviews, ${Math.max(2, Math.ceil(n * 0.6))} of ${n} people we interviewed described this.`;
    f.evidence = rs.insights.filter((i) => i.real).slice(0, 3).map((i) => i.id);
  }
  Object.assign(f, {
    title: `${title} v${Math.floor(g.specN / set.length) + 1}`,
    user: USERS[s.company.model],
    problem, solution,
    acceptance: ['Given 40 new items, when the nightly sync runs, then all 40 are processed within 5 minutes', 'Given an item with no match, when the sync runs, then it is flagged as unmatched', 'If the API token is expired, the sync fails with an error email to the owner'],
    metric: 'Hours spent on the task per customer per month', baseline: '6 hours today; target under 1 hour within 60 days', nonGoals: 'No accounting-software sync and no multi-currency in v1',
  });
  f.acceptanceText = f.acceptance.join('\n');
  PS.productSlice(s).features.push(f);
  return f;
}

// Write + grade + queue a spec if allowed and the queue is empty, then build with the given hours. Returns hours used.
export async function productWork(g, hours, { newSpecOk = true, evidence = false } = {}) {
  const s = g.state;
  const sl = PS.productSlice(s);
  let used = 0;
  if (!sl.buildQueue.length && newSpecOk) {
    const f = newSpec(g, { evidence });
    const h = product.specHours(f);
    if (!tryHours(g, h, 'Product: spec')) return 0;
    used += h;
    await gradeSpec(g.ctx, f);
    if (f.grade?.pass) { queueFeature(s, f); g.lastSpecDay = s.day; }
    else g.rejected = (g.rejected ?? 0) + 1;
  }
  const left = Math.min(hours - used, hoursLeft(s));
  if (left >= 0.5 && (sl.buildQueue.length || sl.bugs.some((b) => !b.fixedDay) || (sl.foundation && !sl.foundation.done))) {
    const h = Math.min(12, left, product.founderBuildLeftToday(s));
    if (h >= 0.5 && tryHours(g, h, 'Product: build')) { build(s, h, { founder: true }); used += h; }
  }
  return used;
}

// Fill up to `target` hours today with product work.
export async function fillProduct(g, target, opts) {
  const s = g.state;
  const start = hoursLeft(s);
  let guard = 0;
  while (start - hoursLeft(s) < target - 0.5 && hoursLeft(s) > 0.5 && guard++ < 6) { if (!(await productWork(g, target - (start - hoursLeft(s)), opts))) break; }
}

export async function setupWebsite(g) {
  const s = g.state;
  if (!tryHours(g, 4, 'Website')) return false;
  const txt = `${s.company.oneLiner}. Built for ${s.company.icp}. Save 5 hours every month. Pricing: $${s.plans[0].price} per ${s.plans[0].interval}. Start free trial. How it works: connect, match, export. Questions? Email us.`;
  s.company.website = { source: 'paste', title: s.company.name, text: txt, headings: ['How it works', 'Pricing', 'FAQ'] };
  await website.runPanel(g.ctx);
  return true;
}

export async function customerPanel(g) {
  if (!market.hasProduct(g.state)) return false;
  if (!tryHours(g, customers.PANEL_HOURS ?? 2, 'Customer panel')) return false;
  await customers.runPanel(g.ctx);
  return true;
}

// ---------------- Customer research (real interviews) ----------------
// UI: Research → "Recruit & book" (hours = RECRUIT[channel].hours), the call is charged by the calendar on the day,
// then "I had the call: log notes" (WRITEUP 0.25h) → logReal(). logReal is not exported: replica below.
const NOTES = {
  smb: (r) => `Last month-end she spent about ${r(3, 8)} hours matching ${r(1500, 4000)} orders to payouts in a spreadsheet. She uses ${['Google Sheets', 'Excel', 'QuickBooks plus a sheet'][r(0, 2)]} today and paid a freelancer $${r(100, 400)} last quarter to clean up refunds. Two refunds were missed in March and cost $${r(80, 900)}. Her accountant asked for the fee breakdown twice. She tried an app last year and dropped it after the trial because setup took too long.`,
  b2c: (r) => `He skipped ${r(2, 5)} workouts last week because the kids woke up early and planning took 15 minutes each night. He paid $${r(10, 30)} a month for a gym app until ${['March', 'June', 'last month'][r(0, 2)]} and cancelled it after ${r(3, 8)} weeks. He now uses a notes app and YouTube videos. His partner works out ${r(1, 3)} times a week and they used to text screenshots to each other.`,
  ent: (r) => `Their last SOC 2 audit took ${r(300, 700)} hours of evidence collection, mostly screenshots from AWS and Okta. They used ${['Vanta', 'Drata', 'a spreadsheet and Jira'][r(0, 2)]} and still spent ${r(2, 6)} weeks on access reviews. An exception last year cost $${r(10, 40)}k to remediate. The VP Security signs off on tools above $${r(10, 30)}k and IT security reviews every vendor.`,
};
export function bookInterview(g, channel = 'warm') {
  const s = g.state;
  const rs = PS.researchSlice(s);
  let ch = channel;
  if (ch === 'warm' && (rs.warmUsed ?? 0) >= RS.warmPool(s)) ch = rs.introCredits > 0 ? 'intro' : 'community';
  const hours = IV.RECRUIT[ch === 'intro' ? 'warm' : ch]?.hours ?? 1;
  if (!tryHours(g, hours, 'Research: recruiting')) return null;
  const n = rs.interviews.length + 1;
  try { return RS.bookReal(s, { name: `Interviewee ${n}`, role: s.company.model === 'b2c' ? 'parent' : 'owner', company: s.company.model === 'b2c' ? '' : `Company ${n}`, email: `person${n}@example.com`, channel: ch }); } catch { return null; }
}
// Log notes for every real interview whose call is today (and was charged by the calendar).
export async function logInterviews(g) {
  const s = g.state;
  const rs = PS.researchSlice(s);
  const evs = cal.ensureCalendar(s).events;
  for (const iv of rs.interviews) {
    if (!iv.real || iv.status !== 'scheduled' || iv.day !== s.day) continue;
    const ev = evs.find((e) => e.id === iv.eventId);
    if (!ev || ev.status !== 'scheduled' || !ev.charged) continue;
    if (!tryHours(g, 0.25, 'Research: interview notes')) return;
    cal.completeEvent(s, iv.eventId, 'in_progress');
    const r = (lo, hi) => lo + Math.floor(util.rng(s) * (hi - lo + 1));
    const notes = NOTES[s.company.model](r);
    const commitments = util.rng(s) < 0.35 ? ['intro'] : ['followup'];
    // ---- replica of research.js logReal (booked path) ----
    const fb = IV.extractFromNotes(notes, commitments);
    const res = await llm.ask({ task: 'interview_notes', system: 'grader', prompt: notes, schema: { type: 'object' }, fallback: () => fb, cache: s.cache });
    const grade = { score: Math.round(util.clamp(Number(res.data.quality) || 0, 0, 100)), commitments, issues: res.data.issues ?? [], source: res.mock ? 'offline heuristic' : 'LLM', selfReported: true };
    Object.assign(iv, { notes, status: 'done', doneDay: s.day, grade, verified: Boolean(iv.email), transcript: null });
    cal.completeEvent(s, iv.eventId, 'done', 'notes logged');
    for (const i of (res.data.insights ?? []).slice(0, 10)) rs.insights.unshift({ id: util.uid('ins'), interviewId: iv.id, theme: i.theme || IV.themeOf(i.text), text: i.text, type: i.type, real: true, verified: iv.verified, who: iv.persona.name, day: s.day });
    if (commitments.includes('intro')) rs.introCredits++;
    g.interviewsDone = (g.interviewsDone ?? 0) + 1;
  }
}

// ---------------- Onboarding calls (Customers → Onboarding → "Hold all of today's calls", 0.1h) ----------------
export function holdOnboarding(g) {
  const s = g.state;
  const evs = cal.ensureCalendar(s).events;
  const today = (s.apps.customers?.onboarding ?? []).filter((rec) => { const ev = evs.find((x) => x.id === rec.eventId); return rec.status === 'booked' && ev?.day === s.day && ev.status === 'scheduled'; });
  if (!today.length) return 0;
  if (!tryHours(g, 0.1, 'Onboarding call notes')) return 0;
  for (const rec of today) { cal.completeEvent(s, rec.eventId, 'done', 'held'); rec.status = 'held'; }
  return today.length;
}
// UI handler for #obForm.
export function setOnboarding(g, mode, cardRequired = g.state.market.cardRequired) {
  const m = market.ensureMarket(g.state);
  if (m.onboarding === mode && m.cardRequired === cardRequired) return;
  m.onboarding = mode; m.cardRequired = cardRequired;
}

// ---------------- Organic ----------------
export async function networkLaunch(g) {
  const s = g.state;
  const O = OE.ensureOrganic(s);
  if (O.launch) return false;
  if (!tryHours(g, 2 + 0.75 + 0.5, 'Organic: network launch')) return false;
  const msg = `After talking to people in our niche I built this: ${s.company.oneLiner.toLowerCase()}. It is live today with a 14-day free trial. If you or someone you know has this problem, I would love 15 minutes of feedback.`;
  const j = await JG.judgePost(g.ctx, msg, 'linkedin', 'launch announcement to personal network');
  OE.launchToNetwork(s, { channels: { friends: true, linkedin: true, x: true }, message: msg, skill: j.skill });
  g.launchDay = s.day;
  return true;
}
const POSTS = {
  smb: [
    'Week {w} of building a payout reconciliation tool for Shopify stores. Talked to {i} bookkeepers so far: most match payouts to orders by hand every month, about 6 hours each. Shipped {f} features. What does your month-end look like?',
    'Lesson from {i} customer calls: nobody asked for AI. They asked for the refund that went missing in March to show up in the report. Shipping boring fixes beats shiny features.',
    'Numbers update, week {w}: {c} paying customers, ${m} MRR. Biggest drop-off is connecting Shopify. Rewriting onboarding this week.',
    'A bookkeeper told me she keeps a sticky note of payouts she could not match. That sticky note is my roadmap. {f} features shipped, {c} customers.',
  ],
  b2c: [
    'Week {w} of building a 20-minute workout app for busy parents. Talked to {i} parents: the workout is not the problem, the 15 minutes of planning at 9pm is. Shipped {f} features.',
    'What I learned from {i} parent interviews: streaks motivate for 2 weeks, partners motivate for months. Shipping partner accountability next.',
    'Numbers update, week {w}: {c} paying users, ${m} MRR. Day-3 retention is the problem; rewriting the first workout this week.',
    'Kids asleep at 8:40, 20 minutes, no gym. {c} parents now do this with us. Here is the exact routine we ship on day one.',
  ],
  ent: [
    'Week {w} building SOC 2 evidence automation. {i} conversations with security leads: evidence screenshots eat 40% of audit prep. Shipped {f} integrations.',
    'Lesson from {i} calls with compliance teams: auditors want history, not dashboards. Building the auditor portal next.',
    'Update week {w}: {c} customers, ${m} MRR. Security review took 6 weeks for our last deal; we wrote our own questionnaire answers library.',
    'An auditor asked the same AWS evidence question 4 times in one audit. That is the whole product thesis in one email thread.',
  ],
};
export async function bipPost(g, platform) {
  const s = g.state;
  if (!tryHours(g, GP.ORGANIC.social.hours[platform], 'Organic: build in public')) return false;
  g.np = (g.np ?? 0) + 1;
  const tpl = POSTS[s.company.model][g.np % 4];
  const text = tpl.replace('{w}', Math.floor(s.day / 7) + 1).replace('{i}', (g.interviewsDone ?? 0) + (s.apps.calls?.meetings ?? []).filter((m) => m.status === 'held').length).replace('{f}', market.shippedFeatures(s).length).replace('{c}', stripe.activeSubs(s).length).replace('{m}', Math.round(stripe.mrr(s)));
  const j = await JG.judgePost(g.ctx, text, platform);
  OE.publishPost(s, { platform, text, skill: j.skill, judge: j });
  return true;
}
const ARTQ = { smb: ['reconcile shopify payouts', 'shopify payout refunds', 'shopify fees report', 'month end close shopify', 'shopify quickbooks payouts', 'shopify paypal reconciliation'], b2c: ['20 minute home workout for parents', 'home workout no equipment busy mom', 'workout routine busy dad', 'how to exercise with kids at home', 'quick morning workout parents', 'workout habit tracker'], ent: ['soc 2 evidence collection aws', 'soc 2 access review template', 'soc 2 control monitoring', 'soc 2 audit preparation checklist', 'soc 2 auditor evidence requests', 'okta access review soc 2'] };
export async function seoArticle(g) {
  const s = g.state;
  g.na = (g.na ?? 0) + 1;
  const q = ARTQ[s.company.model][g.na % 6];
  const a = { query: `${q}${g.na > 6 ? ` ${Math.floor(g.na / 6) + 2026}` : ''}`, title: `How to ${q}: a step-by-step guide with real numbers`,
    body: Array.from({ length: 9 }, (_, k) => `Step ${k + 1}: We talked to people who do this every month. Export the report, match each line, check exceptions, and flag anything unmatched. In our data most missed at least one item a quarter, costing $300-1,200 or 2-3 hours. Here is the exact template and the screenshot of the result for ${q}.`).join('\n\n') };
  const h = Math.min(10, Math.max(2, 1 + util.words(a.body) / 600));
  if (!tryHours(g, h, 'Organic: SEO article')) return false;
  const j = await JG.judgeArticle(g.ctx, a);
  OE.publishArticle(s, { ...a, judge: j });
  return true;
}
const COMMS = { smb: ['r/shopify', 'r/bookkeeping', 'Shopify Community forum', 'Indie Hackers', 'r/ecommerce'], b2c: ['r/parenting', 'r/homefitness', 'r/xxfitness', 'Facebook parents group', 'r/daddit'], ent: ['r/sysadmin', 'r/cybersecurity', 'SOC 2 Slack community', 'GRC Discord', 'r/AskNetsec'] };
export async function communityPost(g) {
  const s = g.state;
  if (!tryHours(g, GP.ORGANIC.community.hours, 'Organic: community')) return false;
  g.nc = (g.nc ?? 0) + 1;
  const list = COMMS[s.company.model];
  const p = { community: list[g.nc % list.length], kind: 'forum', size: 'medium', title: `How do you handle ${s.company.oneLiner.split(' ').slice(1, 5).join(' ').toLowerCase()} today?`, body: `I talked to ${Math.max(5, g.interviewsDone ?? 0)} people about this. Most do it by hand, about 6 hours a month. The trick that helped most: export the report and match by ID, then check exceptions separately. Happy to share the spreadsheet template. What do you do?` };
  try { const j = await JG.judgeCommunityPost(g.ctx, p); OE.communityPost(s, { ...p, judge: j }); } catch { return false; }
  return true;
}
export async function productHunt(g) {
  const s = g.state;
  const O = OE.ensureOrganic(s);
  if (O.ph || !market.hasProduct(s)) return false;
  if (!tryHours(g, GP.ORGANIC.ph.prepHours + GP.ORGANIC.ph.dayHours, 'Organic: Product Hunt')) return false;
  const f = { tagline: s.company.oneLiner.slice(0, 60), description: `For ${s.company.icp}.`, firstComment: `Hi Product Hunt! I built this after ${Math.max(5, g.interviewsDone ?? 0)} conversations with people who spend about 6 hours a month on this by hand. We shipped ${market.shippedFeatures(s).length} features so far and have ${stripe.activeSubs(s).length} paying customers. I would love blunt feedback on onboarding.`, weekend: false };
  const j = await JG.judgePost(g.ctx, `${f.tagline}\n\n${f.description}\n\n${f.firstComment}`, 'x', 'Product Hunt launch page and maker comment');
  OE.launchProductHunt(s, { ...f, skill: j.skill, judge: { mock: j.mock } });
  return true;
}

// ---------------- Paid ads ----------------
const COPY = {
  b2c: [['Struggling to find time to work out? Try our app', 'A 20-minute daily workout plan for busy parents. Start your free trial today.', 'Get fit in 20 minutes'],
        ['Busy parent? Workouts that fit your day', 'Short home workouts with a coach that adapts to your schedule. Free 14-day trial.', 'Home workouts for parents'],
        ['Your new favorite workout app', 'Simple workouts, a habit tracker and reminders. Join thousands of happy users.', 'Try it free'],
        ['Kids asleep at 8:40. You have 20 minutes.', 'Busy parents aged 30-45: a 20-minute home workout that adapts when the baby wakes up. No gym, no equipment. 14 days free.', '20-minute workouts for parents'],
        ['Stop planning workouts at 9pm', 'We plan tomorrow’s 20-minute home workout tonight and remind you when the kids are down. 14 days free.', 'Planned for you'],
        ['3 workouts a week, 20 minutes each', 'Parents who use a partner check-in keep going 3x longer. Invite yours. 14 days free.', 'Workout with your partner']],
  search: [['Shopify payout reconciliation', 'Match every Shopify payout to orders automatically. Flag missed refunds. 14-day free trial.', 'Reconcile payouts in minutes']],
};
export function newCreative(g, format = 'static', idx) {
  const s = g.state;
  const set = format === 'search_text' ? COPY.search : COPY.b2c;
  g.ncr = (g.ncr ?? 0) + 1;
  const [hook, primaryText, headline] = set[(idx ?? g.ncr) % set.length];
  if (!tryHours(g, format === 'search_text' ? 0.5 : 0.75, 'Ads: creative')) return null;
  const c = AE.addCreative(s, { format, hook: `${hook}${g.ncr > set.length ? ` (v${Math.floor(g.ncr / set.length) + 1})` : ''}`, primaryText, headline, cta: 'Start free trial', name: hook.slice(0, 40) });
  g.ctx.enqueue('ads:review', { id: c.id });
  return c;
}
// Meta (b2c) or Google Search (smb/ent) campaign at `budget`/day. UI: account setup + campaign create.
export function startAds(g, budget, { pool = [0, 1, 2] } = {}) {
  g.adsPool = pool;
  const creativeIdx = pool.slice(0, 3);
  const s = g.state;
  const p = s.company.model === 'b2c' ? 'meta' : 'google';
  if (!tryHours(g, 0.5 + 0.1 + 1 + 3, 'Ads: account setup')) return null;
  const a = AE.createAccount(s, p); a.payment = 'card'; a.pixel = true; a.capi = true;
  const fmt = p === 'google' ? 'search_text' : 'static';
  const crs = creativeIdx.map((i) => newCreative(g, fmt, i)).filter(Boolean);
  const c = AE.createCampaign(s, { p, name: 'Trials', objective: 'sales' });
  const kws = p === 'google' ? DL.parseKeywords(['[shopify payout reconciliation]', '"reconcile shopify payouts"', 'shopify bookkeeping app', '"shopify refunds report"', 'ecommerce accounting software'].join('\n')).map((k) => ({ ...k, relevance: Math.min(1, 0.25 + JG.icpOverlap(s, k.text) * 0.9 + (k.text.split(/\s+/).length >= 3 ? 0.1 : 0)) })) : [];
  g.adset = AE.createAdSet(s, { campaignId: c.id, budget, audience: { type: p === 'google' ? 'search' : 'broad' }, placement: 'advantage', optimization: 'trial', keywords: kws });
  for (const cr of crs) AE.createAd(s, { adsetId: g.adset.id, creativeId: cr.id });
  tryHours(g, 0.5, 'Ads: campaign setup');
  g.adsStart = s.day; g.nextRefresh = s.day + 21; g.adsFmt = fmt;
  return g.adset;
}
// Weekly check + creative refresh every 3 weeks; pause below $minCash, resume above $resumeCash.
export function runAds(g, { minCash = 5000, resumeCash = 15000, refresh = true } = {}) {
  const s = g.state;
  if (!g.adset) return;
  if (util.dayOfWeek(s) === 1) tryHours(g, 0.5, 'Ads: monitoring');
  if (refresh && s.day >= g.nextRefresh && g.adset.status === 'active') {
    g.nextRefresh = s.day + 21;
    for (const cr of [newCreative(g, g.adsFmt, g.adsPool[(g.ncr + 1) % g.adsPool.length]), newCreative(g, g.adsFmt, g.adsPool[(g.ncr + 1) % g.adsPool.length])].filter(Boolean)) AE.createAd(s, { adsetId: g.adset.id, creativeId: cr.id });
  }
  const cash = balance(s);
  if (g.adset.status === 'active' && cash < minCash) g.adset.status = 'paused';
  else if (g.adset.status === 'paused' && cash > resumeCash && !g.quit) g.adset.status = 'active';
}

// ---------------- Hiring (People) ----------------
// Contractor via an open freelance platform, paid through Deel. UI: Write job post (1h, judged), channels, screen (0.5h),
// offer (0.5h). Candidates arrive from peopleDay().
export function openContractorJob(g, role = 'engineer', region = 'latam') {
  const s = g.state;
  const p = PE.ensurePeople(s);
  if (!p.payrollSetup.deel) { if (!tryHours(g, 1, 'People: payroll setup')) return null; PE.setupPayroll(s, 'deel'); }
  if (!tryHours(g, 1, 'People: job post')) return null;
  const [lo, hi] = PCAT.ROLES[role].hourly[region];
  const text = `We are a 1-person startup (${s.company.oneLiner}). You will own shipping our product: build features, fix bugs and ship weekly. In your first 30 days you will ship 2 features. Pay: $${lo}-${hi} per hour, 30 hours a week, remote. Process: one interview and a paid trial task. You have 3+ years of experience with web apps.`;
  const job = PE.createJob(s, { role, region, engagement: 'contractor', payLo: lo, payHi: hi, hoursPerWeek: 30, text });
  PE.applyJudge(job, PH.heuristicPostJudge({ ...job, text }));
  if (!tryHours(g, 1, 'People: channels')) return job;
  PE.openJob(s, job.id, ['freelance_platform']);
  (g.jobs ??= []).push(job.id);
  return job;
}
export function workHiring(g) {
  const s = g.state;
  const p = s.apps.people;
  if (!p) return;
  for (const jobId of g.jobs ?? []) {
    const job = PE.findJob(p, jobId);
    if (!job || job.status !== 'open') continue;
    if (p.members.some((m) => m.jobId === jobId && m.status !== 'gone') || p.candidates.some((c) => c.jobId === jobId && c.stage === 'offer')) continue;
    const news = p.candidates.filter((c) => c.jobId === jobId && c.stage === 'new').slice(0, 3);
    for (const c of news) { if (!tryHours(g, 0.5, 'People: screening')) return; try { PE.screenCandidate(s, c.id, true); } catch {} }
    const best = p.candidates.filter((c) => c.jobId === jobId && c.stage === 'screened').sort((a, b) => (PH.candQuality(b) - PH.candQuality(a)))[0];
    if (best && tryHours(g, 0.5, 'People: offer')) {
      const [lo, hi] = PCAT.ROLES[job.role].hourly[job.region];
      try { PE.makeOffer(s, best.id, { hourlyRate: Math.round((lo + hi) / 2), startDay: s.day + 4, hoursPerWeek: 30 }); } catch (e) { g.hireErr = e.message; }
    }
  }
  for (const jobId of g.jobs ?? []) {
    const job = PE.findJob(p, jobId);
    if (job?.status === 'open' && p.members.some((m) => m.jobId === jobId && m.status === 'active')) PE.closeJob(s, jobId);
  }
}

// ---------------- Fundraising (VC path), after docs/review/e2e-bots/botD.mjs ----------------
export async function incorporate(g) {
  const s = g.state;
  if (s.company.entity === 'ccorp') return true;
  if (!tryHours(g, 2, 'Legal: incorporation')) return false;
  LS.incorporate(s, { provider: 'atlas', operatingState: 'CA' });
  return true;
}
export function legalFollowUp(g) {
  const s = g.state, Lg = s.apps.legal;
  if (s.company.entity === 'ccorp' && Lg && !Lg.founderStock && tryHours(g, 1, 'Legal: founder docs')) { LS.signFounderDocs(s); try { LS.file83b(s, 'service'); } catch {} }
}
export async function startRaise(g, { target = 500000, cap = 6000000 } = {}) {
  const s = g.state;
  const fr = FS.ensureFr(s);
  if (fr.raise?.status === 'active') return false;
  if (!tryHours(g, 2, 'Fundraising: evaluation')) return false;
  s.founder.linkedinText ||= '8 years in operations and product at a 300-person ecommerce software company; shipped billing and reconciliation tools used by 2,000 merchants.';
  s.founder.bio ||= 'Operator turned founder; built internal finance tooling.';
  const m = stripe.mrr(s), c = stripe.activeSubs(s).length;
  fr.deck.text = `Problem: ${s.company.oneLiner}; people do it by hand today. Solution: automation. Market: ${s.company.icp}. Traction: ${c} paying customers, $${Math.round(m)} MRR, ${g.interviewsDone ?? 0} customer interviews. Team: solo founder. Ask: $${Math.round(target / 1000)}k pre-seed SAFE.`;
  await FE.runEvaluation(g.ctx, 'pre-seed');
  fr.raise = { id: util.uid('raise'), stage: 'pre-seed', instrument: 'safe', target, cap, discount: 0, mfn: false, proRataMin: Infinity, startDay: s.day, deadlineDay: s.day + 122, raised: 0, status: 'active' };
  g.raiseTries = (g.raiseTries ?? 0) + 1; g.raiseStart ??= s.day;
  for (let k = 0; k < 4; k++) { tryHours(g, 2, 'Fundraising: investor list'); for (const inv of FI.generateInvestors(s, { count: 10, stage: 'pre-seed', rand: () => util.rng(s) })) fr.investors.push({ id: util.uid('inv'), addedDay: s.day, status: 'researching', log: [], ...inv }); }
  return true;
}
export function workRaise(g, { perDay = 6 } = {}) {
  const s = g.state;
  const fr = FS.ensureFr(s);
  if (fr.raise?.status !== 'active') return;
  let n = 0;
  const m = Math.round(stripe.mrr(s)), c = stripe.activeSubs(s).length;
  for (const inv of fr.investors) {
    if (inv.status !== 'researching' || n >= perDay) continue;
    const warm = Boolean(inv.warmPath);
    if (!tryHours(g, warm ? FS.HOURS?.introBlurb ?? 0.3 : 0.15, 'Fundraising: outreach')) break;
    const text = `Hi ${inv.name.split(' ')[0]}, I'm raising a $${Math.round(fr.raise.target / 1000)}k pre-seed SAFE for ${s.company.name}: ${s.company.oneLiner.toLowerCase()}. ${c ? `We have ${c} paying customers and $${m} MRR` : `We have talked to ${g.interviewsDone ?? 0} customers`}. ${inv.firm ? `Given ${inv.firm}'s focus on ${String(inv.thesis ?? 'software').split(/[,.;]/)[0]}, ` : ''}would you take a 30-minute call? Deck attached.`;
    const judge = FI.heuristicOutreach(text, inv, { warm });
    inv.raiseId = fr.raise.id; inv.ghosted = false;
    inv.outreach = { channel: warm ? 'warm' : 'cold', day: s.day, text, quality: judge.quality, judge, followUps: 0 };
    if (warm) { inv.status = 'intro_requested'; inv.introOdds ??= 0.6; inv.pending = { type: 'intro', day: s.day + 2 + Math.floor(util.rng(s) * 5) }; }
    else { inv.status = 'contacted'; inv.pending = { type: 'reply', day: s.day + 2 + Math.floor(util.rng(s) * 8) }; }
    n++;
  }
  const PITCH = [
    `We help ${s.company.icp}: ${s.company.oneLiner.toLowerCase()}.`,
    `I spent 8 years building tools for this exact customer; the manual work takes about 6 hours a month per customer.`,
    'Why now: AI coding agents let one founder ship what used to need a team, and the incumbents are slow.',
    `Numbers: ${c} paying customers, $${m} MRR, ${g.interviewsDone ?? 0} customer interviews, burn under $2k a month.`,
    'The moat is the workflow data and integrations; switching costs grow with every month of history.',
    'First hire is an engineer once we pass $10k MRR; I will keep burn low until then.',
    `We are raising $${Math.round(fr.raise.target / 1000)}k on a post-money SAFE to reach 18 months of runway and $30k MRR.`,
  ];
  for (const mtg of fr.meetings) {
    if (mtg.status !== 'scheduled' || mtg.day !== s.day) continue;
    const ev = (s.calendar?.events ?? []).find((e) => e.id === mtg.eventId);
    if (ev && ev.status !== 'scheduled') continue;
    mtg.transcript = [];
    for (const t of PITCH) { mtg.transcript.push({ from: 'them', text: '…' }); mtg.transcript.push({ from: 'me', text: t }); }
    const d = FI.heuristicMeeting(mtg.transcript);
    FS.meetingDone(s, mtg, Math.round(d.performance * 2) / 2, 'bot');
    g.pitches = (g.pitches ?? 0) + 1;
  }
  for (const inv of fr.investors) if (inv.status === 'term_sheet' && tryHours(g, 1.5, 'Fundraising: term sheets')) { const err = FS.acceptTerms(s, inv); if (err) g.raiseErr = err; }
  const raised = fr.rounds.reduce((a, r) => a + r.amount, 0);
  if (raised >= fr.raise.target || s.day >= fr.raise.deadlineDay) FS.endRaise(s, raised > 0 ? 'closed' : 'abandoned');
  g.raised = raised;
  if (raised > 0 && g.raisedDay == null) g.raisedDay = s.day;
}

export function stats(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return { n: 0 };
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  return { n: a.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), mean: Math.round(a.reduce((x, y) => x + y, 0) / a.length) };
}
