// Hiring regions: where candidates live, what they cost, how they speak English, when they work, how deep and
// noisy the talent pool is, and what can go wrong with paying and employing people there. DATA ONLY.
// Research: docs/research/hiring-global/international-part-time.md.
// Tags: [sourced] read in a source; [secondary] vendor or aggregator, directional; [unverified] snippet only or
// conflicting; [design] game assumption, never shown to players as a statistic. Where the research has a gap
// (time-to-fill by region, notice periods, holidays, power risk, offshore SDR/AE outcomes) the value is [design].
//
// tz is a UTC offset in hours (standard time; daylight saving is ignored [design]).
// english: probability of an individual's English level, 1 basic .. 5 near-native, shaped by EF EPI 2025 bands
//   (Netherlands #1, Malaysia 24th, Philippines 28th, India 74th [sourced]; band per region otherwise [design]).
//   A candidate's level is drawn individually from this distribution; it never depends on the name.

export const REGION_DATA = {
  us: {
    label: 'United States', short: 'US', currency: 'USD', fxFeePct: 0,
    places: [
      { city: 'Austin, TX', country: 'US', tz: -6 }, { city: 'Denver, CO', country: 'US', tz: -7 }, { city: 'Brooklyn, NY', country: 'US', tz: -5 },
      { city: 'Oakland, CA', country: 'US', tz: -8 }, { city: 'Raleigh, NC', country: 'US', tz: -5 }, { city: 'Columbus, OH', country: 'US', tz: -5 }, { city: 'Seattle, WA', country: 'US', tz: -8 },
    ],
    english: [0.01, 0.02, 0.04, 0.13, 0.80], buyerFit: 0.85,
    poolDepth: 1.0, seniorShare: 0.32, fillMult: 1.0, noticeDays: [14, 14], noise: 0.08,
    outage: 0.01, holidays: 11, fraudMult: 1.0, misclassP: 0, eorLoad: 0,
    payNote: 'Reference. Carta, BLS, Levels.fyi, Bridge Group (see people/catalog.js)',
  },
  canada: {
    label: 'Canada', short: 'Canada', currency: 'CAD', fxFeePct: 0.01,
    places: [
      { city: 'Toronto', country: 'Canada', tz: -5 }, { city: 'Montréal', country: 'Canada', tz: -5 }, { city: 'Vancouver', country: 'Canada', tz: -8 },
      { city: 'Calgary', country: 'Canada', tz: -7 }, { city: 'Ottawa', country: 'Canada', tz: -5 }, { city: 'Halifax', country: 'Canada', tz: -4 },
    ],
    english: [0.01, 0.02, 0.05, 0.20, 0.72], buyerFit: 0.85, // near-US English and time zone [sourced: research §1]
    poolDepth: 0.55, seniorShare: 0.30, fillMult: 1.1, noticeDays: [14, 28], noise: 0.06,
    outage: 0.01, holidays: 9, fraudMult: 1.0, misclassP: 0.004, eorLoad: 0.12,
    payNote: 'Engineer ~63% of US [sourced: Terminal 2026]; other roles 60-75% [design]',
  },
  weu: {
    label: 'Western Europe / UK', short: 'W. Europe / UK', currency: 'GBP/EUR', fxFeePct: 0.015,
    places: [
      { city: 'London, UK', country: 'UK', tz: 0 }, { city: 'Manchester, UK', country: 'UK', tz: 0 }, { city: 'Dublin, Ireland', country: 'Ireland', tz: 0 },
      { city: 'Amsterdam, Netherlands', country: 'Netherlands', tz: 1 }, { city: 'Berlin, Germany', country: 'Germany', tz: 1 }, { city: 'Lisbon, Portugal', country: 'Portugal', tz: 0 },
      { city: 'Madrid, Spain', country: 'Spain', tz: 1 }, { city: 'Paris, France', country: 'France', tz: 1 },
    ],
    english: [0.01, 0.03, 0.12, 0.40, 0.44], buyerFit: 0.78, // Netherlands #1, Germany #4 in EF EPI [sourced]; Southern Europe lower [design]
    poolDepth: 0.65, seniorShare: 0.30, fillMult: 1.25, noticeDays: [30, 90], noise: 0.07, // 1-3 month notice is common [unverified]
    outage: 0.01, holidays: 9, fraudMult: 0.8, misclassP: 0.008, eorLoad: 0.22,
    payNote: 'Europe-wide engineer 40-49% of US [sourced: Terminal 2026]; UK and Western EU higher, so ~60% [unverified]',
  },
  latam: {
    label: 'Latin America', short: 'LatAm', currency: 'BRL/ARS/COP/MXN', fxFeePct: 0.02,
    places: [
      { city: 'Buenos Aires', country: 'Argentina', tz: -3, english: [0.03, 0.17, 0.35, 0.33, 0.12] }, { city: 'São Paulo', country: 'Brazil', tz: -3 },
      { city: 'Medellín', country: 'Colombia', tz: -5 }, { city: 'Mexico City', country: 'Mexico', tz: -6 }, { city: 'Montevideo', country: 'Uruguay', tz: -3 }, { city: 'Santiago', country: 'Chile', tz: -4 },
    ],
    english: [0.08, 0.27, 0.35, 0.22, 0.08], buyerFit: 0.62, // EF EPI per country not read; band [design]
    poolDepth: 0.85, seniorShare: 0.22, fillMult: 1.1, noticeDays: [15, 30], noise: 0.15,
    outage: 0.04, holidays: 13, fraudMult: 1.3, misclassP: 0.010, eorLoad: 0.45, // Brazil-style liabilities can reach back across the whole relationship [secondary]
    payNote: 'Engineer ~54-56% of US [sourced: Terminal 2026]',
  },
  eeu: {
    label: 'Eastern Europe', short: 'E. Europe', currency: 'PLN/RON/UAH/RSD', fxFeePct: 0.015,
    places: [
      { city: 'Kraków, Poland', country: 'Poland', tz: 1, english: [0.01, 0.05, 0.22, 0.45, 0.27] }, { city: 'Kyiv, Ukraine', country: 'Ukraine', tz: 2 },
      { city: 'Bucharest, Romania', country: 'Romania', tz: 2, english: [0.01, 0.06, 0.24, 0.43, 0.26] }, { city: 'Belgrade, Serbia', country: 'Serbia', tz: 1 },
      { city: 'Brno, Czechia', country: 'Czechia', tz: 1 }, { city: 'Zagreb, Croatia', country: 'Croatia', tz: 1 },
    ],
    english: [0.02, 0.10, 0.33, 0.40, 0.15], buyerFit: 0.62,
    poolDepth: 0.8, seniorShare: 0.25, fillMult: 1.15, noticeDays: [14, 60], noise: 0.15,
    outage: 0.03, holidays: 14, fraudMult: 1.5, misclassP: 0.006, eorLoad: 0.18,
    payNote: 'Poland engineer median ~48% of US [sourced: Terminal 2026]',
  },
  india: {
    label: 'India', short: 'India', currency: 'INR', fxFeePct: 0.015,
    places: ['Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Gurugram'].map((city) => ({ city, country: 'India', tz: 5.5 })),
    english: [0.04, 0.14, 0.32, 0.34, 0.16], buyerFit: 0.55, // 74th in EF EPI [sourced]; the white-collar applicant pool reads better than the national band [design]
    poolDepth: 1.6, seniorShare: 0.12, fillMult: 1.0, noticeDays: [30, 90], noise: 0.38, // huge pool, high variance [secondary]
    outage: 0.05, holidays: 16, fraudMult: 1.6, misclassP: 0.005, eorLoad: 0.17,
    payNote: 'Engineer ~20-30% of US base [design]; Levels.fyi median total comp $33,768 [secondary]',
  },
  pakistan: {
    label: 'Pakistan', short: 'Pakistan', currency: 'PKR', fxFeePct: 0.025,
    places: ['Karachi', 'Lahore', 'Islamabad'].map((city) => ({ city, country: 'Pakistan', tz: 5 })),
    english: [0.06, 0.22, 0.36, 0.26, 0.10], buyerFit: 0.50,
    poolDepth: 1.0, seniorShare: 0.10, fillMult: 1.2, noticeDays: [30, 60], noise: 0.32,
    outage: 0.14, holidays: 15, fraudMult: 2.0, misclassP: 0.004, eorLoad: 0.10, // load-shedding is a documented risk, frequency [design]
    payNote: 'Engineer ~25-45% of US [design]; Plane median remote SWE $43,163 [secondary]',
  },
  ph: {
    label: 'Philippines / SE Asia', short: 'Philippines / SE Asia', currency: 'PHP/MYR/VND', fxFeePct: 0.02,
    places: [
      { city: 'Manila, Philippines', country: 'Philippines', tz: 8 }, { city: 'Cebu, Philippines', country: 'Philippines', tz: 8 }, { city: 'Davao, Philippines', country: 'Philippines', tz: 8 },
      { city: 'Kuala Lumpur, Malaysia', country: 'Malaysia', tz: 8, english: [0.01, 0.05, 0.22, 0.42, 0.30] },
      { city: 'Ho Chi Minh City, Vietnam', country: 'Vietnam', tz: 7, english: [0.05, 0.25, 0.38, 0.25, 0.07], outage: 0.04 },
    ],
    english: [0.01, 0.07, 0.28, 0.44, 0.20], buyerFit: 0.66, // Philippines 28th, Malaysia 24th (highest in Asia) in EF EPI [sourced]
    poolDepth: 1.2, seniorShare: 0.08, fillMult: 1.1, noticeDays: [30, 30], noise: 0.25,
    outage: 0.07, holidays: 18, fraudMult: 1.5, misclassP: 0.006, eorLoad: 0.22,
    payNote: 'Support/BPO roles only sourced (PHP 20-27k/mo agent wage [secondary]); support ~25-35% of US loaded cost [design]; night shifts add ~10% [secondary]',
  },
  africa: {
    label: 'Africa (Nigeria / Kenya / Egypt)', short: 'Africa', currency: 'NGN/KES/EGP', fxFeePct: 0.03,
    places: [
      { city: 'Lagos, Nigeria', country: 'Nigeria', tz: 1, outage: 0.22, english: [0.02, 0.10, 0.28, 0.38, 0.22] },
      { city: 'Abuja, Nigeria', country: 'Nigeria', tz: 1, outage: 0.18, english: [0.02, 0.10, 0.28, 0.38, 0.22] },
      { city: 'Nairobi, Kenya', country: 'Kenya', tz: 3, outage: 0.09, english: [0.02, 0.09, 0.28, 0.40, 0.21] },
      { city: 'Cairo, Egypt', country: 'Egypt', tz: 2, outage: 0.08, english: [0.10, 0.30, 0.34, 0.20, 0.06] },
    ],
    english: [0.04, 0.16, 0.34, 0.32, 0.14], buyerFit: 0.50,
    poolDepth: 0.5, seniorShare: 0.08, fillMult: 1.5, noticeDays: [14, 30], noise: 0.25,
    outage: 0.16, holidays: 14, fraudMult: 2.2, misclassP: 0.004, eorLoad: 0.15, // power and infrastructure risk is not sourced [design]
    payNote: 'Lagos dev local pay $7,500/yr, Nairobi $14,700/yr [secondary]; remote USD roles $36k-96k [secondary]; Egypt no data [gap]',
  },
};

export const REGION_IDS = Object.keys(REGION_DATA);

// Pay as a share of the US range, by role class (the research has engineers by region; the rest are [design]).
export const ROLE_CLASS = {
  engineer: 'eng', ai_engineer: 'eng', designer: 'design',
  account_executive: 'sales', founding_ae: 'sales', sdr: 'sales', am: 'sales', se: 'sales',
  csm: 'cs', customer_success: 'cs', support: 'support', marketer: 'mkt', content_writer: 'mkt', ops_generalist: 'ops',
  fractional_cfo: 'exec', fractional_cmo: 'exec', fractional_vp_sales: 'exec', fractional_head_cs: 'exec',
};
export const PAY_SHARE = {
  //            eng   design sales  cs    support mkt   ops   exec
  canada:   { eng: 0.63, design: 0.60, sales: 0.72, cs: 0.72, support: 0.72, mkt: 0.70, ops: 0.72, exec: 0.85 },
  weu:      { eng: 0.60, design: 0.55, sales: 0.62, cs: 0.55, support: 0.52, mkt: 0.55, ops: 0.55, exec: 0.75 },
  pakistan: { eng: 0.32, design: 0.28, sales: 0.28, cs: 0.26, support: 0.20, mkt: 0.26, ops: 0.26, exec: 0.30 },
  ph:       { eng: 0.33, design: 0.30, sales: 0.30, cs: 0.30, support: 0.24, mkt: 0.30, ops: 0.28, exec: 0.35 },
  africa:   { eng: 0.30, design: 0.25, sales: 0.26, cs: 0.24, support: 0.20, mkt: 0.24, ops: 0.24, exec: 0.30 },
};

// Seniority tiers of an applicant: the senior share of a region's pool (seniorShare above) is thin in junior-heavy markets.
export const SENIORITY = { junior: { ask: 0.8, years: [1, 3] }, mid: { ask: 1.0, years: [3, 7] }, senior: { ask: 1.25, years: [7, 18] } };

// English: level labels and which roles need it. Weight = how much a weak level costs a role (1 = full customer-facing).
export const ENGLISH_LEVELS = { 1: 'Basic', 2: 'Limited', 3: 'Working', 4: 'Professional', 5: 'Fluent / near-native' };
export const ENGLISH_WEIGHT = {
  account_executive: 1, founding_ae: 1, sdr: 1, csm: 0.9, am: 0.9, customer_success: 0.9, support: 0.85, se: 0.75,
  content_writer: 1, marketer: 0.55, designer: 0.15, engineer: 0.35, ai_engineer: 0.35, ops_generalist: 0.2,
  fractional_cfo: 0.3, fractional_cmo: 0.6, fractional_vp_sales: 0.8, fractional_head_cs: 0.8,
};

// Hours per day of overlap with the founder's core hours that the role needs to work well [design; research §3:
// 4+ overlap hours for same-day handoffs]. Customer-facing roles need the buyers' hours.
export const OVERLAP_NEED = {
  engineer: 4, ai_engineer: 4, designer: 3, account_executive: 5, founding_ae: 5, sdr: 5, csm: 5, am: 5, customer_success: 5, se: 5,
  support: 2, marketer: 2, content_writer: 1, ops_generalist: 3, fractional_cfo: 2, fractional_cmo: 3, fractional_vp_sales: 4, fractional_head_cs: 3,
};

// Part-time: how well a role suits fewer hours and how many hours a week it really demands at a startup [design].
export const PART_TIME_FIT = {
  ops_generalist: { fit: 0.9, load: [8, 16], note: 'bookkeeping and admin batch well' },
  content_writer: { fit: 0.9, load: [8, 20], note: 'piece-based work' },
  designer: { fit: 0.85, load: [12, 24], note: 'project-based' },
  marketer: { fit: 0.6, load: [20, 32], note: 'campaigns need steady attention' },
  engineer: { fit: 0.5, load: [24, 40], note: 'works for well-scoped modules; context switching is expensive' },
  ai_engineer: { fit: 0.5, load: [24, 40], note: 'same as engineering' },
  se: { fit: 0.5, load: [20, 32], note: 'demos cluster in buyer hours' },
  am: { fit: 0.45, load: [20, 32], note: 'accounts expect responsiveness' },
  csm: { fit: 0.4, load: [24, 36], note: 'accounts expect responsiveness' },
  customer_success: { fit: 0.4, load: [24, 36], note: 'accounts expect responsiveness' },
  support: { fit: 0.3, load: [35, 45], note: 'on-call coverage does not shrink with hours' },
  account_executive: { fit: 0.25, load: [38, 45], note: 'quota and pipeline are full-time' },
  founding_ae: { fit: 0.15, load: [40, 50], note: 'zero-to-one selling is more than full-time' },
  sdr: { fit: 0.2, load: [40, 45], note: 'volume is the job' },
  fractional_cfo: { fit: 0.95, load: [6, 16], note: 'this is what fractional means' },
  fractional_cmo: { fit: 0.95, load: [6, 18], note: 'this is what fractional means' },
  fractional_vp_sales: { fit: 0.9, load: [8, 20], note: 'strategy and coaching; they do not carry quota' },
  fractional_head_cs: { fit: 0.9, load: [6, 16], note: 'playbooks and escalations' },
};

// Pay premium per hour for fewer hours, since people count it against a full-time job [design]: 0% at 40 h,
// ~6% at 30 h, 12.5% at 20 h, ~19% at 10 h. Fractional execs quote premium rates already (no extra).
export const partTimePremium = (hours) => (hours >= 40 ? 0 : Math.min(0.2, 0.25 * (1 - hours / 40)));

// Night-shift premium when a person works your hours from far away (~+10%, Manila BPO [secondary]).
export const NIGHT_PREMIUM = 0.10;
