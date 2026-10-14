// Pure simulation engine: no DOM access, so it runs in the browser and in Node tests.
// Numbers are modeled on commonly cited SaaS benchmarks (mid-2020s, US). They are
// ranges in reality; here they are tuned so the dynamics, not the decimals, are right.

import { DECISIONS } from './decisions.js';

// ---------------------------------------------------------------------------
// Business models
// ---------------------------------------------------------------------------

export const MODELS = {
  b2c: {
    label: 'B2C consumer subscription',
    short: 'B2C',
    blurb: 'Low price, huge volume, self-serve. Fast feedback but brutal churn, and paid ads rarely pay back at $10/month. Wins come from word of mouth, content, and retention.',
    price: { def: 9, min: 2, max: 60, step: 1, ref: 10, elasticity: 1.3 },
    mvp: 5, featureScale: 25,
    cpc: 0.8, saturation: 25000, siteConv: 0.08, trialConv: 0.12,
    warmPerSellFTE: 80, waitlistPerSellFTE: 200, wom: 0.4,
    churnHigh: 0.18, churnLow: 0.045, invol: 0.015, expansion: 0,
    annualShare: 0.25, cogs: 0.5, feePct: 0.029, feeFixed: 0.3,
    supportPer: 2500, strainMax: 0.02, seoYield: 0.5,
    season: [1.25, 1.05, 1, 0.95, 0.95, 0.85, 0.85, 0.9, 1.05, 1, 1.15, 0.95],
  },
  smb: {
    label: 'B2B SaaS for small businesses',
    short: 'B2B SMB',
    blurb: 'Self-serve trials plus inside sales. $50–$500/month. Businesses churn less than consumers and expand over time, but they are harder to reach and need sales help.',
    price: { def: 49, min: 10, max: 1500, step: 5, ref: 99, elasticity: 0.8 },
    mvp: 6, featureScale: 30,
    cpc: 4, saturation: 20000, siteConv: 0.03, trialConv: 0.15,
    warmPerSellFTE: 15, waitlistPerSellFTE: 25, wom: 0.02,
    churnHigh: 0.09, churnLow: 0.018, invol: 0.008, expansion: 0.012,
    annualShare: 0.3, cogs: 4, feePct: 0.029, feeFixed: 0.3,
    supportPer: 250, strainMax: 0.03, seoYield: 0.15,
    aeTrials: 120, aeOutbound: 25, aeBoost: 1.8, aeRamp: 3,
    season: [1.05, 1.05, 1.1, 1, 1, 0.95, 0.85, 0.85, 1.05, 1.05, 1, 0.75],
  },
  ent: {
    label: 'B2B enterprise SaaS',
    short: 'Enterprise',
    blurb: 'Few customers paying $20k–$300k a year. Sales cycles of 3–12 months, security reviews, and SOC 2. Very sticky once you win, but cash-hungry and slow to start.',
    price: { def: 2500, min: 500, max: 25000, step: 100, ref: 3500, elasticity: 0.6 },
    mvp: 10, featureScale: 50,
    oppCost: 3000, saturation: 60000, winRate: 0.2,
    waitlistPerSellFTE: 1.5, wom: 0,
    churnHigh: 0.04, churnLow: 0.006, invol: 0, expansion: 0.02,
    annualShare: 0.9, cogs: 120, feePct: 0.005, feeFixed: 0,
    supportPer: 25, strainMax: 0.02, seoYield: 0.15,
    aeOpps: 4, aeCapacity: 5, founderOpps: 2, founderCapacity: 4, aeRamp: 5,
    season: [1.05, 1.05, 1.1, 1, 1, 0.95, 0.85, 0.85, 1.05, 1.05, 1, 0.75],
  },
};

// Benchmarks shown in the metrics panel: [good, ok] thresholds per model.
export const BENCH = {
  logoChurn: { b2c: [0.05, 0.08], smb: [0.025, 0.04], ent: [0.008, 0.015] }, // monthly, lower is better
  ltvCac: [3, 1.5],
  payback: { b2c: [6, 12], smb: [12, 18], ent: [18, 24] }, // months, lower is better
  grossMargin: [0.75, 0.65],
  nrr: { b2c: [0.9, 0.7], smb: [1.0, 0.9], ent: [1.15, 1.0] },
  burnMultiple: [1.5, 2.5], // lower is better
};

export const ROLES = {
  eng: { label: 'Engineers', salary: 15000, ramp: 3, desc: 'Ship features and pay down tech debt. Full speed after ~3 months.' },
  ae: { label: 'Account execs', salary: 11000, ramp: 3, desc: 'Close deals. Paid 10% commission on first-year contract value.' },
  marketer: { label: 'Marketers', salary: 12000, ramp: 2, desc: 'Make your ad and content budgets work harder.' },
  support: { label: 'Support / CS', salary: 7500, ramp: 1, desc: 'Keep customers happy. Without them, churn rises as you grow.' },
};
export const RECRUITING_FEE = 5000;
export const FOUNDER_TIME = ['build', 'sell', 'research', 'fundraise'];

export const ROUNDS = [
  { id: 'preseed', name: 'Pre-seed (SAFE)', amount: 750_000, barMrr: 0, targetGrowth: 0 },
  { id: 'seed', name: 'Seed', amount: 3_000_000, barMrr: 20_000, targetGrowth: 0.1 },
  { id: 'a', name: 'Series A', amount: 12_000_000, barMrr: 125_000, targetGrowth: 0.08 },
  { id: 'b', name: 'Series B', amount: 35_000_000, barMrr: 500_000, targetGrowth: 0.055 },
];

export const WIN_ARR = 10_000_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Mulberry32: tiny seeded PRNG so a game is reproducible from its seed.
export function rng(s) {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
// Round a fractional expectation to an integer without losing the fraction on average.
const stochRound = (s, x) => Math.floor(x) + (rng(s) < x - Math.floor(x) ? 1 : 0);
const sum = (a) => a.reduce((x, y) => x + y, 0);

export const model = (s) => MODELS[s.model];
export const mrr = (s) => s.monthlyMrr + sum(s.annualSlots);
export const arpa = (s) => (s.customers ? mrr(s) / s.customers : 0);
export const calendarMonth = (s) => s.month % 12;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function addLog(s, type, text) {
  s.log.push({ month: s.month, type, text });
  if (s.log.length > 300) s.log.shift();
  return s;
}

export function addLesson(s, title, text) {
  if (!s.lessons.some((l) => l.title === title)) s.lessons.push({ month: s.month, title, text });
}

// Temporary or permanent modifiers. Multiplicative keys: signups, conv, dev, wom. Additive: churn, cost, morale, attrition.
export function addEffect(s, key, value, months, label) {
  s.effects.push({ key, value, months, label });
}
const effAdd = (s, key) => sum(s.effects.filter((e) => e.key === key).map((e) => e.value));
const effMult = (s, key) => Math.max(0.05, 1 + effAdd(s, key));

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------

export function newGame({ name = 'Acme', model: m = 'smb', seed = Date.now() } = {}) {
  const cfg = MODELS[m];
  const s = {
    v: 2,
    companyName: name,
    model: m,
    seed: seed | 0,
    month: 0,
    phase: 'idea', // 'idea' (pre-MVP) | 'launched'
    cash: 80_000,
    founders: 2,
    founderSalary: 0,
    time: { build: 60, sell: 10, research: 30, fundraise: 0 },
    price: cfg.price.def,
    paidBudget: 0,
    contentBudget: 0,
    featureFocus: 80,
    annualPlans: m === 'ent',
    dunning: false,
    trialMode: 'optin', // 'optin' | 'card' | 'freemium'
    soc2: 'none', // 'none' | 'inprogress' | 'done'
    soc2Ready: 0,
    llc: false,
    vesting: true,
    employees: [],
    nextEmpId: 1,
    customers: 0,
    monthlyMrr: 0,
    annualSlots: Array(12).fill(0),
    pipeline: [],
    waitlist: 0,
    rawFeatures: 0,
    features: 0,
    techDebt: 0,
    insight: 10,
    morale: 80,
    seoStock: 0,
    founderEquity: 1,
    deadEquity: 0,
    investors: [],
    roundsRaised: 0,
    raise: null, // { round, monthsLeft }
    raiseCooldown: 0,
    rbf: 0,
    climate: 'normal',
    climateMonths: 18,
    founderPaid: 0,
    effects: [],
    flags: {},
    decisionsSeen: [],
    pendingDecision: null,
    dynamicDecision: null,
    lessons: [],
    history: [],
    log: [],
    status: 'playing', // 'playing' | 'won' | 'exited' | 'bankrupt'
    endText: '',
    lastMonth: null,
  };
  addLog(s, 'info', `You and your co-founder quit your jobs to start ${name}, a ${cfg.label}. You have $80k of savings between you and no product yet.`);
  queueDecision(s, 'incorporate');
  return s;
}

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

export function founderFTE(s) {
  const total = sum(FOUNDER_TIME.map((k) => s.time[k])) || 1;
  const energy = 0.6 + s.morale / 250;
  const out = {};
  for (const k of FOUNDER_TIME) out[k] = (s.founders * s.time[k] * energy) / total;
  return out;
}

const active = (s, role) => s.employees.filter((e) => e.role === role && e.tenure >= 0);
const rampOf = (s, role) => (role === 'ae' ? model(s).aeRamp ?? 3 : ROLES[role].ramp);
export const productive = (s, role) => sum(active(s, role).map((e) => Math.min(1, (e.tenure + 1) / rampOf(s, role))));
export const teamCount = (s, role) => s.employees.filter((e) => e.role === role).length;
export const headcount = (s) => s.employees.length;

export function quality(s) {
  return clamp(100 * (1 - Math.exp(-s.features / model(s).featureScale)) - s.techDebt * 0.3, 0, 100);
}

// Product-market fit: are you building the right thing (insight) and is it good (quality)?
export function pmf(s) {
  return clamp(0.55 * quality(s) + 0.45 * s.insight, 0, 100);
}
// Share of users who'd be "very disappointed" without the product (Sean Ellis test; 40% = PMF).
export const ellisScore = (s) => clamp(pmf(s) * 0.55, 0, 100);

export function priceFactor(s, price = s.price) {
  const p = model(s).price;
  return clamp(Math.pow(p.ref / price, p.elasticity), 0.05, 3);
}

export function salesCycle(s) {
  return s.model === 'ent' ? clamp(Math.round(3 + s.price / 3000), 3, 12) : s.model === 'smb' ? 1 : 0;
}

export function annualShare(s) {
  if (s.model === 'ent') return 0.9;
  return s.annualPlans ? model(s).annualShare : 0;
}

export function supportCapacity(s) {
  const f = founderFTE(s);
  return (productive(s, 'support') + (f.research + f.sell) * 0.3 + 0.2) * model(s).supportPer;
}

export function monthlyCosts(s, extra = {}) {
  const cfg = model(s);
  const payroll = sum(s.employees.filter((e) => e.tenure >= 0).map((e) => ROLES[e.role].salary));
  const founderPay = s.founderSalary * s.founders;
  const tools = 150 * (headcount(s) + s.founders) + 800; // SaaS tools, legal, accounting
  const freeUsers = s.trialMode === 'freemium' ? (extra.signups ?? 0) * 0.05 * 6 : 0;
  const cogs = 300 + s.customers * cfg.cogs + freeUsers;
  const soc2 = s.soc2 === 'none' ? 0 : 1500;
  const dunning = s.dunning ? 300 : 0;
  const other = effAdd(s, 'cost');
  const fees = extra.fees ?? 0;
  const commission = extra.commission ?? 0;
  const marketing = s.paidBudget + s.contentBudget;
  const total = payroll + founderPay + tools + cogs + soc2 + dunning + other + marketing + fees + commission;
  return { payroll, founderPay, tools, cogs, soc2, dunning, other, marketing, fees, commission, total };
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

export function hire(s, role) {
  if (s.status !== 'playing') return s;
  if (s.cash < RECRUITING_FEE) return addLog(s, 'bad', `You can't afford the recruiting costs right now.`);
  s.employees.push({ id: s.nextEmpId++, role, tenure: -1 });
  s.cash -= RECRUITING_FEE;
  return s;
}

export function fire(s, role) {
  const list = s.employees.filter((e) => e.role === role);
  if (s.status !== 'playing' || !list.length) return s;
  const e = list.at(-1);
  s.employees = s.employees.filter((x) => x !== e);
  if (e.tenure >= 0) {
    s.cash -= ROLES[role].salary; // a month of severance
    s.morale = clamp(s.morale - 6, 0, 100);
  }
  return s;
}

export function setTime(s, key, value) {
  s.time[key] = clamp(Math.round(value), 0, 100);
  return s;
}

// Move existing customers to the current price (grandfathering ends).
export function migratePrice(s) {
  if (!s.customers || s.status !== 'playing') return s;
  const target = s.price * (1 - (s.model === 'ent' ? 0 : 0.17 * annualShare(s)));
  const ratio = target / arpa(s);
  s.monthlyMrr *= ratio;
  s.annualSlots = s.annualSlots.map((x) => x * ratio);
  if (ratio > 1.02) {
    const shock = Math.min(0.35, (ratio - 1) * 0.2 * model(s).price.elasticity);
    addEffect(s, 'churn', shock, 1, 'Price-increase churn');
    addLog(s, 'info', `Existing customers moved to the new price (+${Math.round((ratio - 1) * 100)}%). Expect a churn bump next month.`);
    addLesson(s, 'Raising prices on existing customers', 'Most customers stay through a well-communicated price increase. Give 30–60 days notice, explain the added value, and consider grandfathering your earliest fans. The churn spike is usually smaller than the revenue gained.');
  } else {
    addLog(s, 'info', 'Existing customers moved to the new price.');
  }
  return s;
}

export function startSoc2(s) {
  if (s.soc2 !== 'none' || s.status !== 'playing') return s;
  if (s.cash < 35000) return addLog(s, 'bad', 'SOC 2 needs ~$35k for the auditor and a compliance-automation tool.');
  s.cash -= 35000;
  s.soc2 = 'inprogress';
  s.soc2Ready = s.month + 6;
  addLog(s, 'info', 'SOC 2 Type II started: compliance tooling bought, observation window begins. Ready in ~6 months.');
  return s;
}

export function canRaise(s) {
  const r = ROUNDS[s.roundsRaised];
  if (!r) return { ok: false, why: 'All rounds raised.' };
  if (s.raise) return { ok: false, why: 'Raise in progress.' };
  if (s.raiseCooldown > s.month) return { ok: false, why: `Investors just passed. Wait ${s.raiseCooldown - s.month} more months and improve your numbers.` };
  return { ok: true, round: r };
}

export function startRaise(s) {
  const c = canRaise(s);
  if (!c.ok || s.status !== 'playing') return s;
  if (s.llc && s.roundsRaised === 0) {
    s.cash -= 8000;
    s.llc = false;
    addLog(s, 'info', 'Converted your LLC to a Delaware C-corp for investors ($8k in legal fees).');
    addLesson(s, 'LLC vs C-corp', 'Most US venture investors only invest in Delaware C-corps. Starting as an LLC is fine for a bootstrapped business, but converting later costs time and legal fees.');
  }
  s.raise = { round: s.roundsRaised, monthsLeft: 5 };
  addLog(s, 'info', `Started raising a ${c.round.name}. Put founder time into "Fundraise": raises usually take 3–6 months.`);
  return s;
}

export function takeRbf(s) {
  if (s.rbf > 0 || mrr(s) < 10000 || s.status !== 'playing') return s;
  const amount = Math.round(mrr(s) * 6);
  s.cash += amount;
  s.rbf = Math.round(amount * 1.15);
  addLog(s, 'good', `Revenue-based financing: received $${amount.toLocaleString()}. You'll repay $${s.rbf.toLocaleString()} as 10% of monthly revenue. No dilution.`);
  addLesson(s, 'Revenue-based financing', 'RBF lenders advance roughly 3–12× your MRR and take a fixed share of revenue until a cap (often 1.1–1.5×) is repaid. There is no dilution, but it is expensive money. It works best for predictable revenue with fast payback.');
  return s;
}

// Fundraising readiness score (1 = meets the bar).
export function raiseScore(s, r = ROUNDS[s.roundsRaised]) {
  if (!r) return 0;
  if (r.id === 'preseed') {
    return Math.max(s.insight / 60, mrr(s) / 3000, s.waitlist / (model(s).waitlistPerSellFTE * 6)) * (s.founders >= 2 ? 1 : 0.7);
  }
  const m = metrics(s);
  const traction = Math.min(2, mrr(s) / r.barMrr);
  const growth = clamp((m.cmgr ?? 0) / r.targetGrowth, 0.3, 1.6);
  const retention = m.logoChurn > BENCH.logoChurn[s.model][1] * 1.4 ? 0.65 : 1;
  return traction * growth * retention;
}

function valuationFor(s, r) {
  const m = metrics(s);
  const climate = { hot: 1.35, normal: 1, cold: 0.65 }[s.climate];
  if (r.id === 'preseed') return 8_000_000 * climate;
  const growthMult = clamp(6 + (m.cmgr ?? 0) * 150, 5, 30); // ARR multiple
  const floor = { seed: 14e6, a: 50e6, b: 150e6 }[r.id];
  return Math.max(floor * climate * 0.7, mrr(s) * 12 * growthMult * climate, r.amount / 0.3);
}

export function decide(s, decisionId, choiceIndex) {
  const d = findDecision(s, decisionId);
  if (!d || s.pendingDecision !== decisionId) return { text: '' };
  const choice = d.choices[choiceIndex];
  s.pendingDecision = null;
  const outcome = choice.effect(s, api) || '';
  if (choice.lesson) addLesson(s, d.lessonTitle || d.title, choice.lesson);
  addLog(s, 'info', `${d.title}: you chose "${choice.label}". ${outcome}`);
  return { text: outcome, lesson: choice.lesson };
}

// Decisions created on the fly (term sheets, acquisition offers) live in s.dynamicDecision.
function findDecision(s, id) {
  if (s.dynamicDecision?.id === id) return buildDynamic(s);
  return DECISIONS.find((d) => d.id === id);
}

export function currentDecision(s) {
  if (!s.pendingDecision) return null;
  const d = findDecision(s, s.pendingDecision);
  if (!d) {
    s.pendingDecision = null;
    return null;
  }
  return { id: d.id, title: d.title, text: typeof d.text === 'function' ? d.text(s, api) : d.text, choices: d.choices.map((c) => c.label) };
}

export function queueDecision(s, id) {
  s.pendingDecision = id;
  if (!s.decisionsSeen.includes(id)) s.decisionsSeen.push(id);
}

function buildDynamic(s) {
  const dd = s.dynamicDecision;
  if (dd.kind === 'termsheet') {
    const r = ROUNDS[dd.round];
    const clean = dd.post;
    const dirty = Math.round((dd.post * 1.35) / 1e5) * 1e5;
    return {
      id: dd.id,
      title: `${r.name} term sheet`,
      lessonTitle: 'Liquidation preferences',
      text: `Two investors want to lead your ${r.name} of $${fmtM(r.amount)}.\n\nFirm A: $${fmtM(clean)} post-money valuation, 1× non-participating preference (market standard).\n\nFirm B: $${fmtM(dirty)} post-money, but with a 2× participating liquidation preference.`,
      choices: [
        { label: `Take Firm A (clean terms, $${fmtM(clean)})`, effect: () => closeRound(s, r, clean, 1, false), lesson: 'The headline valuation matters less than the terms. A 1× non-participating preference is market standard: investors get their money back OR their ownership share, whichever is larger. Clean terms keep incentives aligned.' },
        { label: `Take Firm B (higher valuation, 2× participating)`, effect: () => closeRound(s, r, dirty, 2, true), lesson: 'A 2× participating preference means investors first take 2× their money and then ALSO share in what is left. In a modest exit, founders can get far less than the headline valuation suggests. "Your price, my terms."' },
        { label: 'Walk away', effect: () => 'You walked away from the round.', lesson: 'Walking away is a real option only if you have runway. That is why you raise before you are desperate.' },
      ],
    };
  }
  if (dd.kind === 'acquisition') {
    const payout = exitPayout(s, dd.offer);
    return {
      id: dd.id,
      title: 'Acquisition offer',
      lessonTitle: 'Selling your company',
      text: `${dd.buyer} offers $${fmtM(dd.offer)} cash for ${s.companyName} (${(dd.offer / (mrr(s) * 12)).toFixed(1)}× ARR).\n\nAfter investor preferences, the founders would take home about $${fmtM(payout)}.`,
      choices: [
        { label: 'Accept and sell', effect: () => { endGame(s, 'exited', dd.offer); return `Sold for $${fmtM(dd.offer)}.`; }, lesson: 'SaaS companies are usually valued on ARR multiples that depend heavily on growth and retention. Most exits are acquisitions, not IPOs. Model the payout waterfall before you negotiate: preferences come out first.' },
        { label: 'Decline and keep building', effect: () => { s.morale = clamp(s.morale + 3, 0, 100); return 'You turned it down.'; }, lesson: 'Declining makes sense if you believe you can grow faster than the multiple you are being offered. Every year at 2–3× growth can multiply the exit value.' },
      ],
    };
  }
  return null;
}

function closeRound(s, r, post, prefMult, participating) {
  const dilution = r.amount / post;
  for (const inv of s.investors) inv.ownership *= 1 - dilution;
  s.founderEquity *= 1 - dilution;
  s.deadEquity *= 1 - dilution;
  s.investors.push({ name: r.name, invested: r.amount, ownership: dilution, prefMult, participating });
  s.cash += r.amount;
  s.roundsRaised++;
  s.morale = clamp(s.morale + 10, 0, 100);
  addEffect(s, 'signups', 0.15, 3, `${r.name} press coverage`);
  return `Closed $${fmtM(r.amount)} at $${fmtM(post)} post-money (${(dilution * 100).toFixed(0)}% dilution). Founders now own ${(s.founderEquity * 100).toFixed(1)}%.`;
}

// Liquidation waterfall: what the active founders take home from an exit of `value`.
export function exitPayout(s, value) {
  let remaining = value;
  const outs = [];
  for (const inv of s.investors) {
    const pref = inv.invested * inv.prefMult;
    const take = inv.participating ? Math.min(remaining, pref) : Math.min(remaining, Math.max(pref, inv.ownership * value));
    remaining -= take;
    outs.push({ inv, take });
  }
  const participatingOwn = sum(s.investors.filter((i) => i.participating).map((i) => i.ownership));
  const pool = Math.max(0, 1 - s.founderEquity - s.deadEquity - sum(s.investors.map((i) => i.ownership)));
  const commonOwn = s.founderEquity + s.deadEquity + participatingOwn + pool;
  return commonOwn > 0 ? (Math.max(0, remaining) * s.founderEquity) / commonOwn : 0;
}

function endGame(s, status, value) {
  s.status = status;
  const payout = exitPayout(s, value);
  s.finalPayout = payout;
  if (status === 'exited') {
    s.endText = `${s.companyName} was acquired for $${fmtM(value)} in month ${s.month}. Founders' payout after investor preferences: $${fmtM(payout)}, plus $${fmtM(s.founderPaid)} in salary along the way.`;
  } else {
    s.endText = `${s.companyName} crossed $10M ARR in ${s.month} months: a real, durable software company. Paper value ~$${fmtM(value)}. Founders' share after preferences: $${fmtM(payout)}.`;
  }
  addLog(s, 'good', s.endText);
}

export function fmtM(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${Math.round(n / 1e3)}k`;
  return `${Math.round(n)}`;
}

// The surface decision cards are allowed to touch.
const api = { addEffect, addLog, addLesson, mrr, arpa, pmf, quality, model, clamp, rng, hire, fire, fmtM, productive, teamCount, metrics, founderFTE };

// ---------------------------------------------------------------------------
// Metrics (trailing 3 months)
// ---------------------------------------------------------------------------

export function metrics(s) {
  const h = s.history;
  const last = h.slice(-3);
  const out = { cac: null, ltv: null, ltvCac: null, payback: null, grossMargin: null, logoChurn: null, nrr: null, burnMultiple: null, cmgr: null, yoy: null, ruleOf40: null, arpa: arpa(s) };
  if (!last.length) return out;
  const newCust = sum(last.map((x) => x.newCustomers));
  const sm = sum(last.map((x) => x.smSpend));
  const rev = sum(last.map((x) => x.revenue));
  const cogs = sum(last.map((x) => x.cogs));
  out.grossMargin = rev > 0 ? (rev - cogs) / rev : null;
  out.cac = newCust > 0 && sm > 0 ? sm / newCust : null;
  const churnSamples = last.filter((x) => x.startCustomers > 0);
  if (churnSamples.length) out.logoChurn = sum(churnSamples.map((x) => x.churned)) / sum(churnSamples.map((x) => x.startCustomers));
  const startMrr = sum(last.map((x) => x.startMrr));
  const churnMrr = sum(last.map((x) => x.churnMrr));
  const expMrr = sum(last.map((x) => x.expMrr));
  if (startMrr > 0) {
    const monthlyNet = (churnMrr - expMrr) / startMrr;
    out.nrr = Math.pow(Math.max(0, 1 - monthlyNet), 12);
    const gm = clamp(out.grossMargin ?? 0.75, 0.05, 1);
    out.ltv = out.arpa * gm * (monthlyNet > 1 / 60 ? 1 / monthlyNet : 60);
    if (out.cac) {
      out.ltvCac = out.ltv / out.cac;
      out.payback = out.cac / Math.max(1, out.arpa * gm);
    }
  }
  const prev3 = h.length >= 4 ? h[h.length - 4].mrr : null;
  if (prev3 > 0) out.cmgr = Math.pow(h.at(-1).mrr / prev3, 1 / 3) - 1;
  const prev12 = h.length >= 13 ? h[h.length - 13].mrr : null;
  if (prev12 > 0) out.yoy = h.at(-1).mrr / prev12 - 1;
  const netBurn = -sum(last.map((x) => x.netCash));
  const netNewArr = prev3 != null ? (h.at(-1).mrr - prev3) * 12 : null;
  if (netBurn > 0 && netNewArr != null) out.burnMultiple = netNewArr > 0 ? netBurn / netNewArr : Infinity;
  if (out.yoy != null && rev > 0) out.ruleOf40 = out.yoy * 100 + (sum(last.map((x) => x.netCash)) / rev) * 100;
  return out;
}

// ---------------------------------------------------------------------------
// Monthly tick
// ---------------------------------------------------------------------------

export function step(s) {
  if (s.status !== 'playing' || s.pendingDecision) return s;
  const cfg = model(s);
  s.month++;
  const season = cfg.season[calendarMonth(s)];

  // Team: hires arrive, people ramp, some leave (~15% annual attrition is typical).
  for (const e of s.employees) e.tenure++;
  for (const e of [...s.employees]) {
    if (e.tenure < 1) continue;
    const quitP = 0.012 + (s.morale < 50 ? 0.04 : 0) + effAdd(s, 'attrition');
    if (rng(s) < quitP) {
      s.employees = s.employees.filter((x) => x !== e);
      addLog(s, 'bad', `One of your ${ROLES[e.role].label.toLowerCase()} resigned.`);
    }
  }

  const f = founderFTE(s);
  const startMrr = mrr(s);
  const startCustomers = s.customers;

  // Structured customer discovery builds insight; sales calls and customers teach a little. Markets drift, so insight decays.
  s.insight = clamp(s.insight * 0.985 + (f.research * 22 + f.sell * 1) * (1 - s.insight / 100) + Math.min(0.5, Math.sqrt(s.customers) * 0.05), 0, 100);

  // Engineering.
  const devFTE = f.build + productive(s, 'eng');
  const devPts = 1.5 * devFTE * (1 - s.techDebt / 150) * effMult(s, 'dev');
  const featurePts = devPts * (s.featureFocus / 100);
  const refactorPts = devPts - featurePts;
  s.rawFeatures += featurePts;
  s.features += featurePts * (0.3 + 0.7 * (s.insight / 100)); // building without insight builds the wrong thing
  s.techDebt = clamp(s.techDebt + featurePts * 2 + Math.sqrt(s.customers) * 0.03 - refactorPts * 6, 0, 100);

  if (s.phase === 'idea') {
    s.waitlist += f.sell * cfg.waitlistPerSellFTE * (0.5 + s.insight / 100);
    if (s.rawFeatures >= cfg.mvp && !s.flags.launchOffered) {
      s.flags.launchOffered = true;
      queueDecision(s, 'launch');
    }
  }

  const q = quality(s);
  const p = pmf(s);
  const pmfFactor = 0.15 + p / 70;
  const pf = priceFactor(s);
  const mktEff = Math.min(2, 1 + 0.15 * productive(s, 'marketer'));

  // SEO/content is a slow, compounding asset.
  s.seoStock = s.seoStock * 0.98 + (s.contentBudget * mktEff + productive(s, 'marketer') * 1500) * cfg.seoYield * 0.1;

  let visitors = 0, signups = 0, trials = 0, worked = 0, opps = 0, convRate = 0, booked = 0, unworked = 0, aeShare = 0;
  if (s.phase === 'launched') {
    if (s.model === 'ent') {
      const aeP = productive(s, 'ae');
      const paidOpps = s.paidBudget > 0 ? (s.paidBudget * mktEff) / (cfg.oppCost * Math.sqrt(1 + s.paidBudget / cfg.saturation)) : 0;
      opps = (aeP * cfg.aeOpps + f.sell * cfg.founderOpps + paidOpps + s.seoStock / 400 + productive(s, 'marketer') * 0.8) * season * effMult(s, 'signups');
      const capacity = aeP * cfg.aeCapacity + f.sell * cfg.founderCapacity;
      worked = Math.min(opps, capacity);
      unworked = opps - worked;
      const soc2Factor = s.soc2 === 'done' ? 1 : s.customers < 3 ? 0.85 : 0.45;
      const refFactor = 0.8 + Math.min(s.customers, 30) / 75;
      convRate = clamp(cfg.winRate * pmfFactor * pf * soc2Factor * refFactor * effMult(s, 'conv'), 0.01, 0.6);
      booked = worked * convRate;
      aeShare = capacity > 0 ? (aeP * cfg.aeCapacity) / capacity : 0;
    } else {
      const paidVisitors = s.paidBudget > 0 ? (s.paidBudget * mktEff) / (cfg.cpc * Math.sqrt(1 + s.paidBudget / cfg.saturation)) : 0;
      visitors = (paidVisitors + s.seoStock) * season;
      const wom = s.customers * cfg.wom * (p / 100) * effMult(s, 'wom');
      const mode = { optin: [1, 1], card: [0.45, 2.4], freemium: [2.5, 0.3] }[s.trialMode];
      signups = (visitors * cfg.siteConv * (0.6 + q / 250) + wom) * effMult(s, 'signups') * mode[0];
      const warm = f.sell * cfg.warmPerSellFTE * season;
      convRate = clamp(cfg.trialConv * pmfFactor * pf * mode[1] * effMult(s, 'conv'), 0.002, 0.7);
      if (s.model === 'b2c') {
        trials = signups + warm;
        worked = trials;
        booked = trials * convRate;
      } else {
        const aeP = productive(s, 'ae');
        const outbound = aeP * cfg.aeOutbound;
        trials = signups + warm + outbound;
        const assisted = Math.min(signups, aeP * cfg.aeTrials);
        worked = trials;
        booked = (signups - assisted) * convRate + assisted * Math.min(0.7, convRate * cfg.aeBoost) + (warm + outbound) * Math.min(0.7, convRate * 2.5);
        aeShare = trials > 0 ? (assisted + outbound) / trials : 0;
      }
    }
  }

  // Deals close after the sales cycle.
  const cycle = salesCycle(s);
  s.pipeline[cycle] = (s.pipeline[cycle] ?? 0) + booked;
  const closing = s.pipeline.shift() ?? 0;
  const newCustomers = stochRound(s, closing * (0.85 + rng(s) * 0.3));

  // Churn and expansion on the existing base.
  const supportCap = supportCapacity(s);
  const strain = s.customers > supportCap ? Math.min(cfg.strainMax, (s.customers / supportCap - 1) * cfg.strainMax) : 0;
  const pricePremium = Math.max(0, arpa(s) / cfg.price.ref - 1) * 0.3;
  const voluntary = lerp(cfg.churnHigh, cfg.churnLow, p / 100) * (1 + pricePremium) + strain + effAdd(s, 'churn');
  const involuntary = cfg.invol * (s.dunning ? 0.35 : 1);
  const logoChurn = clamp((voluntary + involuntary) * (1 - annualShare(s) * 0.5), 0.002, 0.6);
  const churned = Math.min(s.customers, stochRound(s, s.customers * logoChurn * (0.85 + rng(s) * 0.3)));
  const churnMrr = churned * arpa(s);
  const csCover = s.customers ? Math.min(1, supportCap / s.customers) : 0;
  const expMrr = startMrr * cfg.expansion * (p / 100) * (0.7 + 0.3 * csCover);
  if (startMrr > 0) {
    const k = Math.max(0, (startMrr - churnMrr + expMrr) / startMrr);
    s.monthlyMrr *= k;
    s.annualSlots = s.annualSlots.map((x) => x * k);
  }
  s.customers -= churned;

  // New customers: annual plans pay 12 months upfront at ~2 months free (enterprise: annual by default).
  const share = annualShare(s);
  const nAnnual = stochRound(s, newCustomers * share);
  const nMonthly = newCustomers - nAnnual;
  const annualPrice = s.model === 'ent' ? s.price : s.price * 0.83;
  const slot = calendarMonth(s);
  s.annualSlots[slot] += nAnnual * annualPrice;
  s.monthlyMrr += nMonthly * s.price;
  s.customers += newCustomers;
  const newMrr = nAnnual * annualPrice + nMonthly * s.price;

  // Cash: monthly plans pay monthly; annual cohorts pay 12 months when their billing month comes round.
  const revenue = mrr(s);
  const collected = s.monthlyMrr + 12 * s.annualSlots[slot];
  const txns = s.customers * (1 - share) + s.customers * (share / 12);
  const fees = collected * cfg.feePct + txns * cfg.feeFixed + (s.flags.appStore ? collected * 0.4 * 0.15 : 0);
  const commission = 0.1 * 12 * newMrr * aeShare;
  const costs = monthlyCosts(s, { fees, commission, signups });
  const rbfPay = s.rbf > 0 ? Math.min(s.rbf, revenue * 0.1) : 0;
  s.rbf -= rbfPay;
  const netCash = collected - costs.total - rbfPay;
  s.cash += netCash;
  s.founderPaid += costs.founderPay;

  // Morale.
  const burn = costs.total - collected;
  const runway = burn > 0 ? s.cash / burn : Infinity;
  s.morale = clamp(
    s.morale + (75 - s.morale) * 0.08 + (runway < 3 ? -5 : runway < 6 ? -2 : 0) + (newCustomers > churned ? 1 : s.phase === 'launched' ? -1 : 0) +
      (s.founderSalary < 3000 && s.month > 18 ? -1.5 : 0) + effAdd(s, 'morale'),
    0, 100,
  );

  if (s.soc2 === 'inprogress' && s.month >= s.soc2Ready) {
    s.soc2 = 'done';
    addLog(s, 'good', 'SOC 2 Type II report issued. Security reviews just got much easier.');
  }

  // Funding climate drifts.
  if (--s.climateMonths <= 0) {
    const r = rng(s);
    s.climate = r < 0.25 ? 'hot' : r < 0.7 ? 'normal' : 'cold';
    s.climateMonths = 12 + Math.floor(rng(s) * 18);
    addLog(s, s.climate === 'cold' ? 'bad' : 'info', `The venture market is now ${s.climate}. ${s.climate === 'cold' ? 'Valuations are down and rounds take longer.' : s.climate === 'hot' ? 'Investors are competing for deals.' : ''}`);
  }

  const smSpend = s.paidBudget + s.contentBudget + commission + active(s, 'ae').length * ROLES.ae.salary + active(s, 'marketer').length * ROLES.marketer.salary;
  const supportCost = active(s, 'support').length * ROLES.support.salary;

  s.lastMonth = {
    visitors: Math.round(visitors), signups: Math.round(signups), trials: Math.round(trials), opps: +opps.toFixed(1), worked: Math.round(worked),
    unworked: +unworked.toFixed(1), convRate, booked: +booked.toFixed(1), newCustomers, churned, logoChurn, newMrr, churnMrr, expMrr,
    revenue, collected, costs, netCash, devPts, cycle, rbfPay, season, strain,
  };
  s.history.push({
    month: s.month, mrr: Math.round(revenue), cash: Math.round(s.cash), customers: s.customers, newCustomers, churned, startCustomers,
    startMrr, churnMrr, expMrr, newMrr, smSpend, revenue, cogs: costs.cogs + fees + supportCost, netCash,
  });
  if (s.history.length > 240) s.history.shift();

  for (const m of [1_000, 10_000, 100_000, 1_000_000]) {
    if (startMrr < m && revenue >= m) addLog(s, 'good', `Milestone: $${m.toLocaleString()} MRR ($${fmtM(m * 12)} ARR)!`);
  }
  if (!s.flags.defaultAlive && netCash > 0 && revenue > 5000) {
    s.flags.defaultAlive = true;
    addLog(s, 'good', 'Cash-flow positive! You are "default alive": you no longer need investors to survive.');
    addLesson(s, 'Default alive', 'A company is "default alive" if it reaches profitability on its current cash and trajectory. It gives founders leverage: you raise because you want to, not because you must.');
  }

  stepFundraise(s);
  if (s.status === 'playing') randomEvents(s);
  s.effects = s.effects.map((e) => ({ ...e, months: e.months - 1 })).filter((e) => e.months > 0);

  if (s.cash < 0) {
    s.status = 'bankrupt';
    s.pendingDecision = null;
    s.endText = `${s.companyName} ran out of cash in month ${s.month} with $${fmtM(mrr(s))} MRR and ${s.customers} customers.`;
    addLog(s, 'bad', s.endText);
  } else if (mrr(s) * 12 >= WIN_ARR && s.status === 'playing') {
    s.pendingDecision = null;
    endGame(s, 'won', mrr(s) * 12 * 10);
  }
  return s;
}

function stepFundraise(s) {
  if (!s.raise || s.pendingDecision) return;
  const r = ROUNDS[s.raise.round];
  const effort = Math.min(1, founderFTE(s).fundraise / 0.6);
  const climate = { hot: 1.3, normal: 1, cold: 0.55 }[s.climate];
  const score = raiseScore(s, r);
  const pWin = clamp((score - 0.6) * 0.55, 0, 0.6) * climate * effort;
  s.raise.monthsLeft--;
  if (effort > 0 && rng(s) < pWin) {
    const post = Math.round(valuationFor(s, r) / 1e5) * 1e5;
    s.raise = null;
    s.dynamicDecision = { id: `termsheet-${s.month}`, kind: 'termsheet', round: s.roundsRaised, post };
    queueDecision(s, s.dynamicDecision.id);
  } else if (s.raise.monthsLeft <= 0) {
    s.raise = null;
    s.raiseCooldown = s.month + 6;
    s.morale = clamp(s.morale - 10, 0, 100);
    addLog(s, 'bad', `The ${r.name} didn't come together. ${effort < 0.5 ? 'You barely had time for investor meetings. ' : ''}Investors want more traction (readiness ${Math.round(score * 100)}%).`);
    addLesson(s, 'Failed raises', 'A failed round costs months of founder time and can signal weakness. Raise when your metrics clearly meet the bar for that stage, and start with 9–12 months of runway left, not 3.');
  } else if (effort === 0) {
    addLog(s, 'info', `Your ${r.name} is stalling: no founder time is going to fundraising.`);
  }
}

// ---------------------------------------------------------------------------
// Random events and decision cards
// ---------------------------------------------------------------------------

function randomEvents(s) {
  if (s.pendingDecision) return;
  if (mrr(s) * 12 >= 1_000_000 && rng(s) < 0.04) {
    const m = metrics(s);
    const mult = clamp(4 + (m.cmgr ?? 0) * 80, 3, 12) * { hot: 1.3, normal: 1, cold: 0.7 }[s.climate];
    const offer = Math.round((mrr(s) * 12 * mult) / 1e5) * 1e5;
    const buyers = ['A public SaaS company', 'A private-equity roll-up', 'A big-tech platform', 'Your largest competitor'];
    s.dynamicDecision = { id: `acq-${s.month}`, kind: 'acquisition', offer, buyer: buyers[Math.floor(rng(s) * buyers.length)] };
    queueDecision(s, s.dynamicDecision.id);
    return;
  }

  const eligible = DECISIONS.filter((d) => !d.manual && (!d.models || d.models.includes(s.model)) && !s.decisionsSeen.includes(d.id) && d.when(s, api));
  if (eligible.length && rng(s) < 0.25) {
    queueDecision(s, eligible[Math.floor(rng(s) * eligible.length)].id);
    return;
  }

  const r = rng(s);
  if (s.phase === 'launched' && r < 0.03 + pmf(s) / 2500) {
    addEffect(s, 'signups', 1.5, 1, 'Viral moment');
    addLog(s, 'good', pmf(s) > 50 ? 'Someone with a big following raved about your product. Signups are spiking.' : 'You hit the front page of Hacker News. Lots of traffic, though most visitors bounce.');
  } else if (r < 0.06 && s.techDebt > 45) {
    addEffect(s, 'churn', 0.03, 2, 'Post-outage distrust');
    addLog(s, 'bad', 'Major outage: 9 hours of downtime. Tech debt bit you, and customers are furious.');
  } else if (r < 0.08 && s.month > 12) {
    addEffect(s, 'signups', -0.25, 3, 'Budget freeze');
    addLog(s, 'bad', s.model === 'b2c' ? 'Consumer spending is down. Fewer people are adding subscriptions.' : 'Macro slowdown: buyers are freezing budgets and deals are slipping.');
  }
}
