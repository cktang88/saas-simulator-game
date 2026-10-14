// Pure simulation engine: no DOM access, so it runs in the browser and in Node tests.

export const ROLES = {
  eng: { label: 'Engineers', salary: 12000 },
  sales: { label: 'Sales reps', salary: 9000 },
  marketing: { label: 'Marketers', salary: 8000 },
  support: { label: 'Support', salary: 5000 },
};

export const ROUNDS = [
  { name: 'Seed', minMrr: 4000, amount: 1_500_000, dilution: 0.2 },
  { name: 'Series A', minMrr: 80_000, amount: 8_000_000, dilution: 0.2 },
  { name: 'Series B', minMrr: 400_000, amount: 30_000_000, dilution: 0.18 },
];

export const WIN_ARR = 10_000_000;
const HIRE_COST = 3000; // recruiting fees + laptop

// Mulberry32: tiny seeded PRNG so a game is reproducible from its seed.
function rng(state) {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function newGame(companyName = 'Acme Cloud', seed = Date.now()) {
  return {
    companyName,
    seed: seed | 0,
    month: 0,
    cash: 150_000,
    price: 49,
    marketingBudget: 2000,
    featureFocus: 70, // % of engineering time on features vs paying down tech debt
    team: { eng: 0, sales: 0, marketing: 0, support: 0 },
    founders: 2, // unpaid, count as engineers and do some selling
    customers: 10,
    features: 10,
    techDebt: 5,
    brand: 5,
    morale: 80,
    founderEquity: 1,
    roundsRaised: 0,
    effects: [], // temporary modifiers from events: { key, value, months, label }
    history: [],
    log: [{ month: 0, type: 'info', text: 'You quit your job. Two founders, a laptop each, and $150k of savings. Go.' }],
    status: 'playing', // 'playing' | 'won' | 'bankrupt'
    lastMonth: null,
  };
}

const effectSum = (s, key) => s.effects.filter((e) => e.key === key).reduce((a, e) => a + e.value, 0);

export function quality(s) {
  // Diminishing returns on features, dragged down by tech debt.
  return clamp(100 * (1 - Math.exp(-s.features / 120)) - s.techDebt * 0.35, 0, 100);
}

export function monthlyBurn(s) {
  const salaries = Object.entries(s.team).reduce((a, [r, n]) => a + ROLES[r].salary * n, 0);
  const infra = 300 + s.customers * 3;
  const office = s.month > 0 ? 500 + headcount(s) * 400 : 500;
  return salaries + infra + office + s.marketingBudget;
}

export const headcount = (s) => Object.values(s.team).reduce((a, n) => a + n, 0);
export const mrr = (s) => Math.round(s.customers * s.price);

export function valuation(s) {
  const h = s.history;
  const prev = h.length >= 4 ? h[h.length - 4].mrr : h[0]?.mrr ?? 0;
  const growth = prev > 0 ? (mrr(s) - prev) / prev : 0; // 3-month growth
  const multiple = clamp(6 + growth * 30, 4, 40);
  return Math.max(mrr(s) * 12 * multiple, 1_000_000);
}

export function nextRound(s) {
  return ROUNDS[s.roundsRaised] ?? null;
}

// ---- Player actions (mutate and return state) ----

export function hire(s, role) {
  if (s.status !== 'playing') return s;
  if (s.cash < HIRE_COST) return addLog(s, 'bad', `Can't afford recruiting fees to hire.`);
  s.team[role]++;
  s.cash -= HIRE_COST;
  return s;
}

export function fire(s, role) {
  if (s.status !== 'playing' || s.team[role] === 0) return s;
  s.team[role]--;
  s.cash -= ROLES[role].salary; // one month severance
  s.morale = clamp(s.morale - 8, 0, 100);
  return s;
}

export function raise(s) {
  const round = nextRound(s);
  if (!round || s.status !== 'playing') return s;
  if (mrr(s) < round.minMrr) return addLog(s, 'bad', `VCs passed: ${round.name} needs $${round.minMrr.toLocaleString()} MRR.`);
  const post = Math.max(valuation(s), round.amount / round.dilution);
  const dilution = round.amount / post;
  s.cash += round.amount;
  s.founderEquity *= 1 - dilution;
  s.roundsRaised++;
  s.brand = Math.min(100, s.brand + 10);
  s.morale = clamp(s.morale + 10, 0, 100);
  return addLog(s, 'good', `Closed ${round.name}: $${(round.amount / 1e6).toFixed(1)}M at $${(post / 1e6).toFixed(1)}M post-money (${(dilution * 100).toFixed(0)}% dilution).`);
}

function addLog(s, type, text) {
  s.log.push({ month: s.month, type, text });
  if (s.log.length > 200) s.log.shift();
  return s;
}

// ---- Random events ----

const EVENTS = [
  {
    chance: (s) => 0.04 + s.brand / 2000,
    run: (s) => {
      s.effects.push({ key: 'leads', value: 2.5, months: 1, label: 'Front page of Hacker News' });
      s.brand = Math.min(100, s.brand + 6);
      return ['good', 'You hit the front page of Hacker News! Signups are exploding.'];
    },
  },
  {
    chance: (s) => (s.techDebt > 40 ? (s.techDebt - 40) / 250 : 0),
    run: (s) => {
      s.effects.push({ key: 'churn', value: 0.04, months: 2, label: 'Post-outage distrust' });
      s.brand = Math.max(0, s.brand - 5);
      return ['bad', 'Major outage! 9 hours down. Tech debt bit you. Customers are furious.'];
    },
  },
  {
    chance: (s) => (s.month > 6 ? 0.035 : 0),
    run: (s) => {
      s.effects.push({ key: 'churn', value: 0.02, months: 4, label: 'Well-funded competitor' });
      return ['bad', 'A YC-backed competitor launched a free tier. Churn is creeping up.'];
    },
  },
  {
    chance: (s) => (s.morale < 50 && headcount(s) > 0 ? 0.15 : 0.02),
    run: (s) => {
      const roles = Object.keys(s.team).filter((r) => s.team[r] > 0);
      if (!roles.length) return null;
      const role = roles[Math.floor(rng(s) * roles.length)];
      s.team[role]--;
      return ['bad', `One of your ${ROLES[role].label.toLowerCase()} quit for a FAANG offer.`];
    },
  },
  {
    chance: (s) => (s.features > 60 && s.team.sales > 0 ? 0.04 : 0),
    run: (s) => {
      const seats = Math.round(20 + rng(s) * 60);
      s.customers += seats;
      return ['good', `Landed an enterprise deal: ${seats} seats in one contract!`];
    },
  },
  {
    chance: () => 0.02,
    run: (s) => {
      s.cash += 25_000;
      return ['good', 'Cloud provider startup credits approved: +$25k in effective savings.'];
    },
  },
  {
    chance: () => 0.025,
    run: (s) => {
      s.effects.push({ key: 'leads', value: -0.4, months: 3, label: 'Market downturn' });
      return ['bad', 'Market downturn. Buyers are freezing budgets.'];
    },
  },
];

// ---- Monthly tick ----

export function step(s) {
  if (s.status !== 'playing') return s;
  s.month++;

  const q = quality(s);
  const devs = s.team.eng + s.founders * 0.8;
  const productivity = (1 - s.techDebt / 150) * (0.6 + s.morale / 250);
  const devPoints = Math.max(0, devs * 4 * productivity);
  const featurePts = devPoints * (s.featureFocus / 100);
  const refactorPts = devPoints - featurePts;
  s.features += featurePts;
  s.techDebt = clamp(s.techDebt + featurePts * 0.25 + s.customers / 2000 - refactorPts * 0.9, 0, 100);

  // Brand builds with marketers, decays slowly.
  s.brand = clamp(s.brand * 0.97 + s.team.marketing * 1.2 + Math.sqrt(s.marketingBudget) / 60, 0, 100);

  // Lead generation.
  const priceFactor = Math.pow(49 / s.price, 0.9);
  const qualityFactor = 0.3 + q / 70;
  const leadMult = 1 + effectSum(s, 'leads');
  const paidLeads = (s.marketingBudget / 25) * (1 + s.team.marketing * 0.25);
  const organic = 10 + s.brand * 1.5 + s.customers * 0.03 * (q / 50);
  const leads = Math.max(0, (paidLeads + organic) * leadMult);

  // Sales capacity: founders sell a bit early, reps scale it.
  const salesCapacity = 80 + s.team.sales * 200;
  const worked = Math.min(leads, salesCapacity);
  const conv = clamp(0.14 * qualityFactor * priceFactor * (1 + s.team.sales * 0.03), 0.005, 0.5);
  const noise = 0.8 + rng(s) * 0.4;
  const newCustomers = Math.round(worked * conv * noise);

  // Churn: quality, support coverage, price, events.
  const supportCap = 60 + s.team.support * 150;
  const supportStrain = s.customers > supportCap ? Math.min(0.06, (s.customers / supportCap - 1) * 0.04) : 0;
  const churnRate = clamp(0.07 - q / 1500 + supportStrain + (s.price - 49) / 3000 + effectSum(s, 'churn'), 0.008, 0.35);
  const churned = Math.round(s.customers * churnRate * (0.85 + rng(s) * 0.3));

  s.customers = Math.max(0, s.customers + newCustomers - churned);

  const revenue = mrr(s);
  const burn = monthlyBurn(s);
  s.cash += revenue - burn;

  // Morale: runway anxiety, overwork, and success.
  const runway = burn > revenue ? s.cash / (burn - revenue) : Infinity;
  const perEng = s.customers / Math.max(1, devs);
  s.morale = clamp(
    s.morale + (runway < 4 ? -4 : 1) + (newCustomers > churned ? 1 : -1) - (perEng > 400 ? 2 : 0) + (75 - s.morale) * 0.05,
    0,
    100
  );

  // Events: at most one per month.
  for (const ev of EVENTS) {
    if (rng(s) < ev.chance(s)) {
      const out = ev.run(s);
      if (out) {
        addLog(s, out[0], out[1]);
        break;
      }
    }
  }
  s.effects = s.effects.map((e) => ({ ...e, months: e.months - 1 })).filter((e) => e.months > 0);

  s.lastMonth = { leads: Math.round(leads), worked: Math.round(worked), newCustomers, churned, churnRate, conv, revenue, burn, devPoints, quality: q };
  s.history.push({ month: s.month, mrr: mrr(s), cash: Math.round(s.cash), customers: s.customers });

  // Milestones.
  for (const m of [1_000, 10_000, 100_000, 1_000_000]) {
    const prev = s.history.at(-2)?.mrr ?? 0;
    if (prev < m && mrr(s) >= m) addLog(s, 'good', `Milestone: $${m.toLocaleString()} MRR!`);
  }

  if (s.cash < 0) {
    s.status = 'bankrupt';
    addLog(s, 'bad', `Out of cash in month ${s.month}. The company is shutting down.`);
  } else if (mrr(s) * 12 >= WIN_ARR) {
    s.status = 'won';
    const stake = valuation(s) * s.founderEquity;
    addLog(s, 'good', `$10M ARR reached in ${s.month} months! Acquisition offer accepted. Your stake: $${(stake / 1e6).toFixed(1)}M.`);
  }
  return s;
}
