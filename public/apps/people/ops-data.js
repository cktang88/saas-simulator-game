// People ops data: offer negotiation, onboarding, benefits and time off, workplace. Pure data and pure math (no state
// writes, no app imports) so catalog.js can read benefit costs without a cycle.
// Research: docs/research/ops-2026/{negotiation-onboarding,benefits-time-off,office-remote}.md.
// Tags: [sourced] traces to a named source in those files (most are secondary), [unverified] could not be confirmed,
// [design] is a game assumption and is never shown to players as a statistic.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// 1. Offer negotiation
// ---------------------------------------------------------------------------
export const NEG = {
  // Offer acceptance: Ashby ~78% overall, Gem ~82%, SmartRecruiters 79%; business roles ~20 points above technical [secondary]
  acceptBase: [0.78, 0.82],
  // How often candidates counter. Most job seekers do not negotiate (UCLA Anderson, 3,858 tech job seekers [sourced]); the
  // shares below are [design], raised for senior or in-demand people and when the offer is under their ask.
  counter: { base: 0.26, perGapBelowAsk: 1.3, senior: 0.10, inDemand: 0.10, technical: 0.05, aboveAskDamp: 0.14 },
  // Realised gain when a candidate negotiates: UCLA ~12.45% of compensation; Levels.fyi 2024 +11% mid, +20% senior, +17% staff [sourced]
  gain: { junior: 0.07, mid: 0.11, senior: 0.17 },
  askSpread: 0.03, // candidates ask a little more than they would settle for [design]
  competingShare: 0.55, // of candidates with other offers in process, share whose competing offer lands before our deadline [design]
  employerCounter: { chance: 0.12, seniorChance: 0.2, raise: [0.08, 0.2] }, // a counteroffer is a deferral: 53% accept, 34% gone in 6 months, 74% in a year (Robert Half UK 2021 [sourced, dated])
  counterGoneWithinYear: 0.42, // design read of the 35-50% range
  maxRounds: 2, // a third round with someone who already named their number reads as haggling [design]
  expireDays: 6, // a counter nobody answers: they take the other offer or lose interest [design]
  hours: { review: 0.5, accept: 0.25, counter: 0.75, menu: 1, signOn: 0.25, deadline: 0.1, walk: 0.1, raise: 0.5 },
  renege: { base: 0.025, employerCounter: 0.05, competing: 0.03, lowball: 0.03, perDayOver14: 0.0004, welcomeSaves: 0.5 }, // [design]; no field figure found
  lowball: { ratio: 0.92, attrPerPoint: 6, moraleDrag: 6, maxAttr: 1.9, window: 18 }, // accepted below their ask: attrition x(1 + 6 x gap), morale drag, [design]
  overpay: { askRatio: 1.12, peerGap: 0.1, peerMorale: 6, peerAttr: 1.25 }, // pay-equity trouble when a new hire is paid >10% over a peer in the same role [design]
  explode: { minDays: 3, lostIfCompeting: 0.55, trustHit: 0.05, scarcityBoost: 0.03 }, // short deadline helps only when alternatives are scarce (Zorc and Tsetlin [sourced]); lab games punished exploding offers (INSEAD/Darden [sourced, lab only])
  signOnValue: 0.5, // a sign-on bonus counts about half as much as the same amount of base for a candidate [design]
  menuLift: 0.05, // a cash/equity menu lets people self-select: small acceptance lift [design]
  equityDiscount: { default: 0.25, upsidePersona: 0.55 }, // how much of paper equity value a candidate counts [design]
  equityPerPctUsd: 18000, // paper value of 1% at seed when no valuation exists [design]
};

// Pay transparency: posting a range is required in these places (no federal rule). Thresholds conflict across sources
// [secondary]. Fines $100-$10K per violation in CA/CO/WA in one summary; WA saw 300+ class actions since June 2024 [secondary].
export const PAY_LAWS = {
  CO: { label: 'Colorado', minEmployees: 1, fine: [500, 10000], pFine: 0.05 },
  CA: { label: 'California', minEmployees: 15, fine: [100, 10000], pFine: 0.05 },
  NY: { label: 'New York', minEmployees: 4, fine: [1000, 7500], pFine: 0.05 }, // NYC penalties reported up to $250K per violation [secondary]
  WA: { label: 'Washington', minEmployees: 15, fine: [5000, 25000], pFine: 0.11 }, // class-action settlements [design]
};
export const EU_PAY = { label: 'EU Pay Transparency Directive (transposition deadline 7 June 2026, most states late)', since: '2026-06-07', pFine: 0.04, fine: [1500, 12000] };

// ---------------------------------------------------------------------------
// 2. Onboarding
// ---------------------------------------------------------------------------
export const ONB = {
  laptop: {
    standard: { label: 'Laptop + monitor + peripherals', cost: 1600 },
    pro: { label: 'Pro laptop + monitor + peripherals', cost: 2400 },
    premium: { label: 'Top-spec laptop, two monitors', cost: 3200 },
  }, // $1,500-3,000 per the brief, unverified [design]
  shipAbroad: 180, // courier and import handling for a hire abroad [design]
  leadDays: 5, // order to desk [design]
  provisionDays: 2, // accounts and access, 1-3 days [design]
  i9: { businessDays: 3, fine: [288, 2861], auditMonthly: 0.015, hours: 0.3 }, // Section 2 within 3 business days of the start [secondary]; paperwork fine range is the DHS schedule from memory [unverified]
  welcomeHours: 0.5, planHours: 1.5, buddyHours: 0.25, accountsHours: 0.5, equipmentHours: 0.25, scheduleHours: 0.4, revokeHours: 0.5,
  // Founder or manager hours: 6-10 in week one, 2-4 a week for the rest of month one [design]; the built-in weekly charge is 3 h
  week1Hours: 8, buddyHoursPerWeek: 1,
  // Weekly share of the first 90 days that leave: ~28% (Jobvite 2018) to ~33% in blogs [secondary, dated]; Work Institute: 40% of year-one quits happen in 90 days [secondary]
  earlyExit90: { none: 0.25, structured: 0.06 }, // selection-adjusted, "much lower with structure" is [design]
  ramp: { poor: 1.25, great: 0.8 }, // multiplier on role ramp weeks by onboarding logistics quality [design]
  // Engineers using AI daily reached their 10th PR in 49 days vs 91 without (DX, six enterprises [sourced]); weight to full ramp [design]
  aiRamp: { daysWith: 49, daysWithout: 91, weight: 0.6 },
  weights: { welcome: 0.08, equipment: 0.18, accounts: 0.18, i9: 0.06, plan: 0.24, buddy: 0.12, meetings: 0.14 },
  meetings: [ // [name, day offset, minutes]
    ['Welcome and kickoff', 0, 60], ['Day-1 setup check', 0, 30], ['Mid-week check-in', 3, 30], ['Week-1 retro', 4, 45],
    ['30-day review', 30, 45], ['60-day review', 60, 45], ['90-day review', 90, 60],
  ],
  access: { incidentMonthlyFired: 0.06, incidentMonthlyResigned: 0.02, cost: [3000, 20000] }, // leftover access after an exit [design]
};

// ---------------------------------------------------------------------------
// 3. Benefits
// ---------------------------------------------------------------------------
// KFF Employer Health Benefits Survey 2025 (22 Oct 2025): average annual premium $9,325 single, $26,993 family [sourced]
export const KFF = { year: 2025, single: 9325, family: 26993, workerSingle: 1440, workerFamily: 6850 };
// Small-group rate increases for 2026: median proposed ~11% (318 insurers, range -5% to +32%) [sourced]; ~8% a year after [design]
export const PREMIUM_TREND = { 2026: 0.11, after: 0.08 };
export const FAMILY_SHARE = 0.35; // share of employees on a family tier [design]
// QSEHRA 2026 limits (Rev. Proc. 2025-32 via Paylocity/Mercer): $6,450 self-only, $13,100 family; employers under 50 FTE, no group plan [secondary]
export const QSEHRA = { single: 6450, family: 13100, maxFte: 49 };
export const PEO = { basic: 79, plus: 124, rateAdvantage: 0.03, minEnrolled: 2 }; // Justworks list PEPM $79 / $124, exact figures unverified; rate advantage modest [design]
export const DENTAL_VISION = 55; // $30-80 per employee per month, combined [design]
export const K401 = {
  guideline: { label: 'Guideline-style', base: 49, perHead: 6 }, // [unverified, third-party]
  humaninterest: { label: 'Human Interest-style', base: 80, perHead: 5 }, // $80-120 + $4-7 [unverified]
  participation: 0.65, // share who contribute and collect the match [design]
  match: [0, 0.03, 0.04], // typical safe-harbor match 3-4% [design]
};
export const STIPENDS = { home: 75, learning: 1000, wellness: 50 }; // per month, per year, per month; home office $50-100, learning $500-1,500, wellness $25-75 [design]; SHRM average among those who offer ~ $891/yr [secondary]
export const HEALTH_MODES = {
  none: 'No health benefit',
  qsehra: 'QSEHRA (tax-free reimbursement, under 50 staff)',
  ichra: 'ICHRA (allowance toward individual plans)',
  group: 'Small-group plan direct from a carrier',
  peo: 'PEO plan (Justworks-style, PEPM fee)',
};
export const DEFAULT_BENEFITS = {
  configured: false,
  health: { mode: 'group', contribPct: 0.85, depPct: 0, allowance: 450, waitingDays: 30, peoTier: 'basic' }, // employers cover 80-90% of employee-only premiums [design]; KFF-derived ~84.5%
  dentalVision: false,
  k401: { on: false, provider: 'guideline', matchPct: 0 },
  stipends: { home: false, learning: false, wellness: false },
  pto: { mode: 'accrued', daysPerYear: 15, holidays: 8, capMult: 1.5, parentalPaidWeeks: 0, bereavementDays: 3 }, // BLS: 8 paid holidays on average; small firms ~10 days vacation after a year [secondary]
};

const year = (state) => new Date(Date.parse(state.startDate + 'T12:00:00Z') + (state.day ?? 0) * 86400000).getUTCFullYear();
/** Employee-only and family total annual premiums for the game year (KFF 2025 trended by the small-group increases). */
export function premiumTotals(state) {
  let f = 1;
  for (let y = KFF.year + 1; y <= year(state); y++) f *= 1 + (PREMIUM_TREND[y] ?? PREMIUM_TREND.after);
  return { single: r2(KFF.single * f), family: r2(KFF.family * f), factor: r2(f) };
}

/**
 * Employer cost of the health benefit per covered employee, per year, by mode and household (pure).
 * Returns { single, family, avg } where avg weights the household mix.
 */
export function healthCost(state, h, headcount = 1) {
  const t = premiumTotals(state);
  const avg = (s, f) => r2(s * (1 - FAMILY_SHARE) + f * FAMILY_SHARE);
  if (!h || h.mode === 'none') return { single: 0, family: 0, avg: 0 };
  if (h.mode === 'qsehra') {
    const a = Math.max(0, h.allowance ?? 0) * 12;
    const s = Math.min(a, QSEHRA.single), f = Math.min(a, QSEHRA.family);
    return { single: s, family: f, avg: avg(s, f), capped: a > QSEHRA.single };
  }
  if (h.mode === 'ichra') { const a = Math.max(0, h.allowance ?? 0) * 12; return { single: a, family: a, avg: a }; }
  const adv = h.mode === 'peo' ? 1 - PEO.rateAdvantage : 1;
  const single = t.single * adv, family = t.family * adv;
  const c = clamp(h.contribPct ?? 0.85, 0, 1), d = clamp(h.depPct ?? 0, 0, 1);
  const s = single * c, f = single * c + (family - single) * d;
  const pepm = h.mode === 'peo' ? (PEO[h.peoTier] ?? PEO.basic) * 12 : 0;
  return { single: r2(s + pepm), family: r2(f + pepm), avg: avg(s + pepm, f + pepm), pepmYear: pepm, total: t };
}

/** Everything per eligible employee per year except the 401(k) match: health, dental/vision, stipends. */
export function benefitsAnnual(state, b, { remote = true } = {}) {
  const h = healthCost(state, b.health);
  const stip = (b.stipends?.home && remote ? STIPENDS.home * 12 : 0) + (b.stipends?.learning ? STIPENDS.learning : 0) + (b.stipends?.wellness ? STIPENDS.wellness * 12 : 0);
  return { health: h.avg, dental: b.dentalVision ? DENTAL_VISION * 12 : 0, stipends: stip, total: r2(h.avg + (b.dentalVision ? DENTAL_VISION * 12 : 0) + stip), retirement: b.k401?.on ? (b.k401.matchPct ?? 0) * K401.participation : 0 };
}

/** 401(k) provider bill per month (base plus per head). */
export const k401Fee = (b, heads) => (b.k401?.on && heads > 0 ? r2(K401[b.k401.provider].base + K401[b.k401.provider].perHead * heads) : 0);

/**
 * How attractive the package is to a candidate, 0..1.2 (pure). Health is table stakes; 401(k) match, PTO and stipends add.
 * `family` candidates weigh health harder.
 */
export function packageScore(state, b, { family = false } = {}) {
  if (!b?.configured) return { score: 0.8, health: 0.8, note: 'default package' };
  const t = premiumTotals(state);
  const benchmark = (KFF.single - KFF.workerSingle) * (t.factor); // ~ employer share of a single premium
  const h = b.health;
  let health = 0;
  if (h.mode === 'group' || h.mode === 'peo') health = clamp((t.single * (h.contribPct ?? 0.85)) / benchmark, 0, 1.15);
  else if (h.mode === 'ichra') health = clamp(((h.allowance ?? 0) * 12 / benchmark) * 0.9, 0, 1.0);
  else if (h.mode === 'qsehra') health = clamp((Math.min((h.allowance ?? 0) * 12, QSEHRA.single) / benchmark) * 0.85, 0, 0.95);
  if (family && (h.depPct ?? 0) > 0.3) health = Math.min(1.2, health + 0.1);
  const waiting = (h.waitingDays ?? 30) > 60 ? -0.05 : 0;
  const pto = b.pto.mode === 'unlimited' ? 0.04 : clamp((b.pto.daysPerYear + (b.pto.holidays ?? 8) - 15) / 100, -0.1, 0.06);
  const k = b.k401?.on ? 0.02 + (b.k401.matchPct ?? 0) * 1.5 : 0;
  const st = (b.stipends?.home ? 0.01 : 0) + (b.stipends?.learning ? 0.01 : 0) + (b.stipends?.wellness ? 0.005 : 0);
  const dv = b.dentalVision ? 0.03 : 0;
  const score = clamp(health * (family ? 0.72 : 0.62) + 0.38 + pto + k + st + dv + waiting, 0, 1.2);
  return { score: r2(score), health: r2(health) };
}

// US state paid sick leave: hours per year [CA, CO, MA, CT secondary per research; NY, WA, NJ, IL, OR from memory, unverified]
export const STATE_SICK = {
  CA: { hours: 40, label: 'California', src: 'secondary' }, CO: { hours: 48, label: 'Colorado', src: 'secondary' },
  MA: { hours: 40, label: 'Massachusetts', src: 'secondary' }, CT: { hours: 40, label: 'Connecticut', src: 'secondary' },
  NY: { hours: 40, label: 'New York', src: 'unverified' }, WA: { hours: 40, label: 'Washington', src: 'unverified' },
  NJ: { hours: 40, label: 'New Jersey', src: 'unverified' }, IL: { hours: 40, label: 'Illinois', src: 'unverified' }, OR: { hours: 40, label: 'Oregon', src: 'unverified' },
};
// Vested vacation is wages at separation: California Labor Code 227.3 [secondary]; the others are from memory [unverified]
export const PTO_PAYOUT_STATES = { CA: 'secondary', CO: 'unverified', IL: 'unverified', MA: 'unverified' };
// Where US remote employees live when they are not tied to an office [design]
export const STATE_MIX = [['CA', 0.13], ['TX', 0.1], ['NY', 0.09], ['FL', 0.07], ['WA', 0.04], ['CO', 0.03], ['MA', 0.03], ['IL', 0.03], ['NJ', 0.03], ['GA', 0.03], ['NC', 0.03], ['OR', 0.02], ['CT', 0.01], ['AZ', 0.03], ['OH', 0.03], ['PA', 0.04], ['VA', 0.03], ['MI', 0.03], ['MN', 0.02], ['UT', 0.02], ['TN', 0.02], ['OTHER', 0.12]];

// EOR statutory leave by region: annual paid days (working), parental weeks. EU Working Time Directive: 4 weeks minimum; Mexico 12 days
// rising to 20 [secondary]; the rest [design]. The EOR load already prices statutory leave.
export const EOR_LEAVE = {
  canada: { annual: 10, parentalWeeks: 17, note: 'federal minimum two weeks, provincial rules vary [design]' },
  weu: { annual: 25, parentalWeeks: 16, note: 'EU minimum 20 days, most states 25-30 [secondary]' },
  latam: { annual: 14, parentalWeeks: 12, note: 'Mexico 12 days after year one rising to 20, Brazil 30 calendar days [secondary]' },
  eeu: { annual: 21, parentalWeeks: 20, note: 'EU member states, 20-26 days [design]' },
  india: { annual: 18, parentalWeeks: 26, note: 'earned plus casual leave [design]' },
  pakistan: { annual: 14, parentalWeeks: 12, note: '[design]' },
  ph: { annual: 5, parentalWeeks: 15, note: 'service incentive leave 5 days, 13th-month pay is in the EOR load [design]' },
  africa: { annual: 21, parentalWeeks: 12, note: '[design]' },
};

// ---------------------------------------------------------------------------
// Absence model [design] (BLS: ~3 sick days a year is typical; most employees take 3-5 short days, ~10% a 1-2 week illness,
// 1-2% a multi-week medical leave, 2-4% burnout or mental-health leave; heavy-tailed)
// ---------------------------------------------------------------------------
export const ABS = {
  cold: { perYear: 1.6, days: [1, 3], label: 'Sick (short illness)' },
  flu: { perYear: 0.1, days: [4, 10], label: 'Sick (flu)' },
  medical: { perYear: 0.015, days: [15, 60], label: 'Medical leave' },
  mental: { perYear: 0.03, days: [10, 35], label: 'Burnout or mental-health leave', lowMoraleMult: 2.5 },
  parental: { perYear: 0.022, weeks: [8, 12], label: 'Parental leave' },
  bereavement: { perYear: 0.035, days: [3, 5], label: 'Bereavement' },
  // vacation: planned trips per year; unlimited PTO does not lift days taken: ~10-13 days (Namely 2018/2022 [secondary]); fixed policies use ~76% of granted days (11.4 of 15)
  vacation: { usage: 0.76, unlimitedDays: 11.5, avgLen: 3.2, leadDays: [7, 35], lens: [[0.6, 1, 3], [0.9, 4, 5], [1, 7, 10]], autoApproveAfter: 7 },
  paidSickDays: 5, // medical and mental leave: first 5 working days paid, the rest unpaid and job-protected only above 50 staff [design]
  denied: { moraleHit: 3, altHit: 1.5, attrAfter: 2, attrMult: 1.3, burnoutAfter: 3, windowDays: 180 },
  remedy: { runbookHours: 4, onCallMonthly: 800 },
};

// ---------------------------------------------------------------------------
// 4. Workplace
// ---------------------------------------------------------------------------
// Dedicated coworking desk per person per month by city. Anchors: Berlin median ~EUR 499 and London ~EUR 600 (One Coworking 2026,
// 1,200+ quotes, London n=19) [sourced]; Regus reserved desk from $259 (US) [sourced]; WeWork All Access ~$339 [unverified]; US cities [design].
export const CITIES = {
  sf: { label: 'San Francisco', state: 'CA', dedicated: 520, leaseSf: 64, ask: 1.12, big: true }, // CommercialCafe avg $63.63/sf Feb 2025 [secondary]
  nyc: { label: 'New York', state: 'NY', dedicated: 560, leaseSf: 64, ask: 1.1, big: true }, // Manhattan Class A avg $63.84/sf Aug 2025 [secondary]
  austin: { label: 'Austin', state: 'TX', dedicated: 400, leaseSf: 45, ask: 1.0, big: true }, // vacancy ~27% (Feb 2025) [secondary]; rent [design]
  denver: { label: 'Denver', state: 'CO', dedicated: 380, leaseSf: 40, ask: 1.0, big: false }, // [design]
  london: { label: 'London', state: null, dedicated: 650, leaseSf: 85, ask: 1.1, big: true }, // [design]
  berlin: { label: 'Berlin', state: null, dedicated: 540, leaseSf: 26, ask: 1.0, big: true }, // EUR 21.70 per m2 per month classic ~ $26/sf/yr [secondary]
};
export const COWORK = {
  tiers: { day_pass: { label: 'Day pass', mult: 0, dayPass: 40 }, hot_desk: { label: 'Hot desk', mult: 0.62 }, dedicated: { label: 'Dedicated desk', mult: 1 }, private: { label: 'Private office (per person)', mult: 1.8 } },
  term: { month: 1.2, year: 0.85 }, // month-to-month costs more; a 12-month commitment is cheaper [design]
  seatRatioHot: 0.7, // hot desks are shared [design]
};
export const LEASE = {
  sfPerPerson: 150, minSf: 800, opexShare: 0.18, // NNN costs on top of base rent [design]
  termYears: [3, 5], depositMonths: 2, largeDepositMonths: 6, // 1-2 months typical, a year when the landlord wants a guarantee [sourced, general]
  buildOutPerSf: { light: 40, standard: 85, premium: 140 }, // [design]
  lawyer: 2500, brokerPct: 0.04, // [design]
  minHeadcount: 8, // under this a lease is premature [design, from "when startups get an office"]
  sublease: { recovery: [0.45, 0.65], months: [3, 6] }, // sublet at a discount, needs landlord consent [design]
  buyout: 0.8, // landlord takes ~80% of the remaining rent to release you [design]
  pgCallShare: 0.8, // landlord must mitigate; the guarantor owes ~80% of what is left [design]
};
export const POOL = {
  // Remote openings were ~10-16% of postings but drew 44-46% of applications (LinkedIn via Fortune 2024) [sourced] -> an office-required role
  // draws about a quarter of the pool of a remote one in a big metro, less elsewhere. Hybrid sits between [design].
  office: { big: 0.28, small: 0.18 }, hybrid: { big: 0.42, small: 0.3 },
};
// Quits, relative to an unconfigured company: hybrid cut quits about a third vs onsite (Trip.com, Nature 2024, 1,612 grads [sourced]) [design for the rest]
export const MODE_ATTR = { remote: 1.0, cowork: 0.95, hybrid: 0.84, lease: 1.25 };
export const JUNIOR_IN_PERSON = 0.06; // small productivity edge for juniors who are in the room [design]
export const ISOLATION = { weeklyEnergy: 1.4, withPasses: [1, 0.5, 0.15], coworkDesk: 0.2, note: 'No quantified effect for founders in the sources; [design].' };
export const OFFSITE = { perPerson: { local: 600, retreat: 1800 }, travelDays: { local: 1, retreat: 3 }, planHours: 12, morale: 8, attrDays: 90, attrMult: 0.9 }; // multi-day offsite $1,000-3,000 per person; small firms $500-1,000 [secondary, vendor]
export const HOME_STIPEND = STIPENDS.home;
