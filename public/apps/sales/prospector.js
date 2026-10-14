// Prospect database, enrichment waterfall, AI research column and signals (Apollo / Clay style), gap-analysis item 2.
// Research: docs/research/tools/deep/d02-clay-apollo.md, t1-sales.md; operator tiers: data/operator-tiers.js `prospecting`.
//
// The database is a deterministic synthetic universe (hash-seeded per company, never stored in state) that mirrors
// the buyer segments in data/buyer-segments.js. Every row carries HIDDEN truth: does the company really fit the
// buyer this product serves (from the ICP and one-liner), is the person the buyer, is the email right, is the
// "hiring" flag current. The player only sees what a real database shows (firmographics, masked emails, an accuracy
// hint) and has to choose filters, test, verify and prune. Quality then shows up where it does in real life:
// positive-reply rate (fit and a real trigger), bounces (wrong data), wrong-person replies and burned credits.
//
// Numbers: Apollo email reveal 1 credit, phone ~8 [unverified, d02]; Apollo US email accuracy ~88%, international
// ~60-73% [unverified, d02 s6]; Clay Launch $185/mo monthly with 2,500 Data Credits, misses cost nothing, top-ups
// +30% (d02 Part A); Apollo Basic ~$59/mo monthly, Professional ~$99 [unverified]; credits expire monthly on Apollo.
// Credit allotments per Apollo plan are [unverified] (blogs disagree). Everything else is marked [design].
import { clamp, hash, words, uid, monthKey } from '../../core/util.js';
import { post, addRecurring } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { BUYER_SEGMENTS, icpSegments } from './segments.js';
import { emitSalesEvent } from './events.js';
import { isBurned } from './market-burn.js';

// ---------------------------------------------------------------------------
// Plans, providers, prices
// ---------------------------------------------------------------------------

export const PLANS = {
  none: { label: 'No database (manual research and CSV)', monthly: 0, credits: 0, phone: false, waterfall: false, ai: false, signals: false, rollover: 0, topUp: 0 },
  apollo_free: { label: 'Apollo-style Free', monthly: 0, credits: 100, phone: false, waterfall: false, ai: false, signals: false, rollover: 0, topUp: 0, note: 'credits [unverified: sources say 50-720/mo]' },
  apollo_basic: { label: 'Apollo-style Basic', monthly: 59, credits: 1000, phone: true, waterfall: false, ai: false, signals: false, rollover: 0, topUp: 0.2, note: '$49 annual / ~$59 monthly per user, credits [unverified]' },
  apollo_pro: { label: 'Apollo-style Professional', monthly: 99, credits: 2000, phone: true, waterfall: false, ai: true, signals: false, rollover: 0, topUp: 0.2, note: '$79 annual / ~$99 monthly per user, credits [unverified]' },
  clay_launch: { label: 'Clay-style Launch', monthly: 185, credits: 2500, phone: true, waterfall: true, ai: true, signals: true, rollover: 1, topUp: 0.096, note: '$185/mo monthly, 2.5K Data Credits; top-ups +30%; rollover rules conflict (d02)' },
};

// Waterfall providers: hit = share of the remaining rows a provider finds; acc = share of found emails that are right.
export const PROVIDERS = {
  db: { label: 'Database (Apollo-style)', hit: 0.7, cost: 1, accUS: 0.88, accIntl: 0.66 }, // d02 s6 [unverified]
  people: { label: 'People-data provider (PDL-style)', hit: 0.45, cost: 2, accUS: 0.85, accIntl: 0.7 }, // [design]
  finder: { label: 'Pattern finder + verifier (Findymail-style)', hit: 0.4, cost: 3, accUS: 0.93, accIntl: 0.85 }, // [design]
};
export const PHONE = { cost: 8, hit: 0.5 }; // ~8 credits per mobile [unverified, d02]
export const AI_COL = { maxCredits: 10 }; // 1-10 credits per row depending on prompt length [unverified, d02 Claygent 3-10+]
export const SIGNALS = {
  types: { job_change: 'Job change (new decision-maker)', hiring: 'Hiring for a related role', funding: 'Raised funding', news: 'In the news / launch' },
  hazard: { job_change: 1 / 200, hiring: 1 / 120, funding: 1 / 500, news: 1 / 90 }, // daily per account [design]
  falsePositive: { job_change: 0.15, hiring: 0.08, funding: 0.03, news: 0.25 }, // board/advisor roles read as job changes etc. [design]
  cadenceDays: { daily: 1, weekly: 7, monthly: 30 },
  freshDays: 21, // a real trigger used within ~3 weeks lifts replies [design]
};
export const HOURS_P = {
  search: 0.1, revealBase: 0.03, revealPer: 0.001, waterfallSetup: 0.25, test5: 0.1, aiWrite: 0.25, aiReviewPer: 0.004,
  saveBase: 0.1, savePer: 0.004, reasonPer: 0.01, drop: 0.005, monitorSetup: 0.25, signalRead: 0.03,
};
// Reply-odds effects of list quality (operator tiers: stellar lists earn 2-3x the positive replies of a broad list at
// equal volume, mediocre 0.3-0.7x; o1 s1 [design]).
export const LIST = { triggerLift: 1.3, staleTriggerLift: 1.1, wrongPersona: 0.35, wrongPerson: 0.1 };

// ---------------------------------------------------------------------------
// Deterministic universe
// ---------------------------------------------------------------------------

function prng(seedStr) {
  let a = parseInt(hash(seedStr), 36) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];

const SYL_A = ['North', 'Blue', 'Iron', 'Oak', 'Silver', 'Bright', 'Cedar', 'Harbor', 'Summit', 'Maple', 'River', 'Stone', 'Golden', 'Pine', 'Clear', 'Red', 'Grand', 'Lake', 'Union', 'Eagle', 'Fox', 'Copper', 'Willow', 'Crown', 'Bay', 'Prairie', 'Atlas', 'Beacon', 'Coastal', 'Liberty'];
const SYL_B = ['field', 'wood', 'line', 'brook', 'gate', 'view', 'ridge', 'point', 'side', 'stone', 'well', 'crest', 'haven', 'way', 'mark', 'port', 'land', 'vale', 'bridge', 'works'];
const SUFFIX = { owner_smb: ['Co', 'Shop', 'Services', '& Sons', 'Studio'], professional: ['Partners', 'Group', 'Associates', 'LLP', 'Advisors'], health: ['Health', 'Clinic', 'Medical', 'Care', 'Dental'], company: ['Inc', 'Labs', 'Brands', 'Co', 'Systems'], regulated: ['Bank', 'Mutual', 'Industries', 'Manufacturing', 'Financial'], public: ['County', 'City', 'Authority', 'Department', 'District'], education: ['Schools', 'College', 'Academy', 'University', 'District'], nonprofit: ['Foundation', 'Alliance', 'Society', 'Church', 'Trust'] };
const FIRST = ['Ava', 'Liam', 'Maya', 'Noah', 'Zoe', 'Ethan', 'Priya', 'Mateo', 'Hana', 'Omar', 'Chloe', 'Lucas', 'Aisha', 'Kenji', 'Sofia', 'Diego', 'Grace', 'Owen', 'Leila', 'Marcus', 'Nina', 'Ravi', 'Elena', 'Sam', 'Tara', 'Victor', 'Imani', 'Jonas', 'Ruth', 'Felix'];
const LAST = ['Patel', 'Kim', 'Garcia', 'Nguyen', 'Smith', 'Okafor', 'Rossi', 'Silva', 'Cohen', 'Tanaka', 'Haddad', 'Johnson', 'Brennan', 'Moreau', 'Novak', 'Ortiz', 'Larsen', 'Adeyemi', 'Schmidt', 'Chen'];
export const TECH = ['Shopify', 'QuickBooks', 'Xero', 'HubSpot', 'Salesforce', 'Stripe', 'Square', 'Toast', 'ServiceTitan', 'Clio', 'Dentrix', 'Epic', 'Slack', 'Notion', 'Google Workspace', 'Microsoft 365', 'Zendesk', 'Okta', 'AWS'];
const SEG_TECH = {
  ecommerce: ['Shopify', 'Shopify', 'Stripe'], retail_shops: ['Square', 'Shopify'], restaurants: ['Toast', 'Square'], salons_fitness: ['Square', 'Stripe'],
  trades: ['ServiceTitan', 'QuickBooks'], health_practices: ['Dentrix', 'QuickBooks'], hospitals: ['Epic', 'Microsoft 365'], law_firms: ['Clio', 'Microsoft 365'],
  accounting_firms: ['QuickBooks', 'Xero'], agencies: ['HubSpot', 'Slack', 'Notion'], startup_smb: ['Stripe', 'HubSpot', 'AWS', 'Slack', 'Okta'],
  mid_market: ['Salesforce', 'Microsoft 365', 'Okta'], enterprise: ['Salesforce', 'Okta', 'AWS'], banks: ['Microsoft 365', 'Okta'],
  owner_smb: ['QuickBooks', 'Square'], professional: ['Microsoft 365', 'QuickBooks'], company: ['Google Workspace', 'Slack'],
};
export const SENIORITY = { owner: 'Owner / C-level', vp: 'VP / Head / Director', manager: 'Manager', ic: 'Individual contributor' };
const TITLES = {
  owner: ['Owner', 'Founder', 'CEO', 'Co-founder', 'Managing Director', 'President', 'COO', 'CFO'],
  vp: ['VP Operations', 'Head of Finance', 'Director of Operations', 'VP Sales', 'Head of Growth', 'Director of IT', 'Head of Security', 'Practice Manager'],
  manager: ['Operations Manager', 'Office Manager', 'Marketing Manager', 'Finance Manager', 'IT Manager', 'Store Manager'],
  ic: ['Associate', 'Coordinator', 'Specialist', 'Assistant', 'Analyst', 'Bookkeeper'],
};
const GEOS = [['US', 0.62], ['Canada', 0.06], ['UK', 0.12], ['EU', 0.14], ['Australia', 0.06]];
const FUNDING = ['none', 'bootstrapped', 'seed', 'series_a', 'series_b_plus'];
export const FUNDING_LABEL = { none: 'No funding data', bootstrapped: 'Bootstrapped', seed: 'Seed', series_a: 'Series A', series_b_plus: 'Series B+' };

const universeKey = (state) => `${state.company.name}|${state.company.model}|v1`;
let cache = { key: null, rows: null, companies: null };

/** Hidden "who really buys" profile, from the ICP and the one-liner (what the product actually solves). */
export function idealProfile(state) {
  const segs = icpSegments(state);
  const text = `${state.company.icp ?? ''} ${state.company.oneLiner ?? ''}`;
  const tech = TECH.filter((t) => new RegExp(`\\b${t.replace(/ /g, '\\s+')}\\b`, 'i').test(text));
  const ent = state.company.model === 'ent';
  // Size band: numbers in the ICP ("2-10 dentists", "200-2000 employees") or the middle of the segment's range.
  const m = String(state.company.icp ?? '').replace(/,/g, '').match(/(\d+)\s*(?:-|–|to)\s*(\d+)\s*(people|employees|staff|seats|dentists|lawyers|agents|locations|trucks|stores|users|person)?/i);
  let band;
  if (m && m[3]) { const lo = +m[1], hi = +m[2]; band = /dentist|lawyer|agent|truck|location|store/i.test(m[3]) ? [lo * 2, hi * 6] : [lo, hi]; }
  else {
    const lo = Math.min(...segs.map((s) => s.employees[0])), hi = Math.max(...segs.map((s) => Math.min(s.employees[1], s.employees[0] * 100)));
    const l = Math.log(Math.max(1, lo)), h = Math.log(Math.max(lo + 1, hi));
    band = [Math.round(Math.exp(l + (h - l) * 0.15)), Math.round(Math.exp(l + (h - l) * 0.85))];
  }
  return { segments: new Set(segs.map((s) => s.id)), tech, band, buyer: ent ? ['vp', 'owner'] : ['owner'], ent };
}

function genCompany(state, seg, i) {
  const key = `${universeKey(state)}|${seg.id}|${i}`;
  const r = prng(key);
  const name = `${pickR(r, SYL_A)}${pickR(r, SYL_B)} ${pickR(r, SUFFIX[seg.group] ?? SUFFIX.company)}`;
  const slug = name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const domain = `${slug}${Math.floor(r() * 90 + 10)}.com`;
  const [lo, hi0] = seg.employees;
  const hi = Math.min(hi0, Math.max(lo + 1, lo * 100));
  const employees = Math.max(1, Math.round(Math.exp(Math.log(Math.max(1, lo)) + (Math.log(hi) - Math.log(Math.max(1, lo))) * r())));
  let u = r(), geo = 'US';
  for (const [g, w] of GEOS) { if (u < w) { geo = g; break; } u -= w; }
  const typical = SEG_TECH[seg.id] ?? SEG_TECH[seg.group] ?? [];
  const techs = [typical.length && r() < 0.6 ? pickR(r, typical) : pickR(r, TECH)];
  if (r() < 0.5) techs.push(pickR(r, TECH));
  const startup = seg.group === 'company';
  const fu = r();
  const funding = startup ? (fu < 0.45 ? 'none' : fu < 0.55 ? 'bootstrapped' : fu < 0.75 ? 'seed' : fu < 0.92 ? 'series_a' : 'series_b_plus') : (fu < 0.85 ? 'none' : 'bootstrapped');
  const recentRaise = ['seed', 'series_a', 'series_b_plus'].includes(funding) && r() < 0.12;
  const hiring = r() < 0.18; // really hiring for a related role now [design]
  const hiringShown = hiring ? r() < 0.9 : r() < 0.06; // database flag: mostly right, sometimes stale
  const n = employees < 6 ? 1 : r() < 0.6 ? 1 : r() < 0.75 ? 2 : 3;
  const people = [];
  for (let k = 0; k < n; k++) {
    const sz = employees;
    const su = r();
    const seniority = sz < 10 ? (su < 0.75 ? 'owner' : su < 0.9 ? 'manager' : 'ic') : (su < 0.3 ? 'owner' : su < 0.5 ? 'vp' : su < 0.8 ? 'manager' : 'ic');
    const first = pickR(r, FIRST), last = pickR(r, LAST);
    const acc = geo === 'US' ? PROVIDERS.db.accUS : PROVIDERS.db.accIntl;
    people.push({
      id: `pr_${hash(`${key}|${k}`)}`, k, first, last, title: pickR(r, TITLES[seniority]), seniority,
      email: `${first}.${last}@${domain}`.toLowerCase(),
      dataU: r(), // < provider accuracy → the database email is right
      wrongKind: r() < 0.6 ? 'invalid' : 'departed', // when wrong: hard bounce, or a mailbox of someone who left
      catchAll: r() < 0.15,
      phoneU: r(),
      acc,
    });
  }
  return { key, segId: seg.id, segLabel: seg.label, group: seg.group, industry: pickR(r, seg.examples), name, domain, employees, geo, techs: [...new Set(techs)], funding, recentRaise, hiring, hiringShown, noise: (r() - 0.5) * 0.12, people };
}

/** All database rows (one per person), cached per universe + ICP. */
export function universe(state) {
  const ideal = idealProfile(state);
  const key = `${universeKey(state)}|${[...ideal.segments].join(',')}|${state.company.icp}|${state.company.oneLiner}`;
  if (cache.key === key) return cache;
  const idealN = ideal.segments.size;
  const companies = [];
  for (const seg of BUYER_SEGMENTS) {
    const n = ideal.segments.has(seg.id) ? Math.round(2500 / Math.max(1, idealN)) : 80;
    for (let i = 0; i < n; i++) companies.push(genCompany(state, seg, i));
  }
  const rows = [];
  for (const co of companies) for (const p of co.people) rows.push(scoreRow(co, p, ideal));
  cache = { key, rows, companies, byId: new Map(rows.map((r) => [r.id, r])) };
  return cache;
}

function scoreRow(co, p, ideal) {
  const industry = ideal.segments.has(co.segId) ? 1 : 0;
  const inBand = co.employees >= ideal.band[0] && co.employees <= ideal.band[1] ? 1 : 0.3;
  const sen = ideal.buyer.includes(p.seniority) ? 1 : p.seniority === 'manager' || (p.seniority === 'vp' && !ideal.ent) ? 0.5 : 0;
  const techMatch = ideal.tech.length ? co.techs.some((t) => ideal.tech.includes(t)) : false;
  const trigger = co.hiring || co.recentRaise || techMatch;
  const tech = ideal.tech.length ? (techMatch ? 1 : 0) : 0.5;
  const fit = clamp(0.4 * industry + 0.15 * inBand + 0.15 * sen + 0.2 * (trigger ? 1 : 0) + 0.1 * tech + co.noise, 0.02, 0.98);
  return { id: p.id, co, p, fit: +fit.toFixed(2), wrongPersona: p.seniority === 'ic' || (p.seniority === 'manager' && !ideal.buyer.includes('manager')), trigger, techMatch };
}

export const rowById = (state, id) => universe(state).byId.get(id);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function ensureProspector(state) {
  const crm = (state.apps.crm ??= {});
  const p = (crm.prospector ??= {});
  p.plan ??= 'none';
  p.credits ??= 0;
  p.month ??= null;
  p.ledger ??= [];
  p.revealed ??= {}; // rowId → { email, ok, provider, phone }
  p.missed ??= {}; // rowId → providers tried
  p.ai ??= { prompt: '', answers: {} };
  p.waterfall ??= { order: ['db', 'people', 'finder'], on: { db: true, people: true, finder: false }, tested: false };
  p.lists ??= [];
  p.monitors ??= {}; // type → cadence
  p.signals ??= [];
  p.searches ??= [];
  p.stats ??= { revealed: 0, creditsUsed: 0, saved: 0, dropped: 0, tests: 0, aiRows: 0, wasted: 0 };
  return p;
}

function spendCredits(state, n, what) {
  const p = ensureProspector(state);
  if (n <= 0) return true;
  if (p.credits < n) {
    const plan = PLANS[p.plan];
    if (!plan.topUp) throw new Error(`Not enough credits (${p.credits} left, need ${n}). Upgrade the plan.`);
    const buy = Math.max(250, n - p.credits); // 250-credit minimum top-up [unverified, d02]
    post(state, { amount: -Math.round(buy * plan.topUp * 100) / 100, counterparty: plan.label.split('-')[0], description: `${buy} extra data credits`, category: 'software', method: 'card' });
    p.credits += buy;
    p.ledger.unshift({ day: state.day, delta: buy, what: `Top-up (${buy} credits)` });
  }
  p.credits -= n;
  p.stats.creditsUsed += n;
  p.ledger.unshift({ day: state.day, delta: -n, what });
  if (p.ledger.length > 200) p.ledger.length = 200;
  return true;
}

/** Subscribe / change plan. Credits granted now; monthly renewal in prospectorDay. */
export function setPlan(state, planId) {
  const p = ensureProspector(state);
  const plan = PLANS[planId];
  if (!plan) throw new Error('Unknown plan');
  const old = state.recurring?.find((x) => x.id === p.recurringId);
  if (old) old.active = false;
  p.plan = planId;
  p.recurringId = null;
  if (plan.monthly > 0) {
    post(state, { amount: -plan.monthly, counterparty: plan.label, description: `${plan.label}, first month`, category: 'software', method: 'card' });
    p.recurringId = addRecurring(state, { vendor: plan.label, amount: plan.monthly, category: 'software', dayOfMonth: 5, note: 'Prospect database' }).id;
  }
  p.credits = plan.credits;
  p.month = monthKey(state);
  p.ledger.unshift({ day: state.day, delta: plan.credits, what: `${plan.label}: monthly credits` });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const DEFAULT_FILTERS = { title: '', seniority: [], minEmp: '', maxEmp: '', segment: '', geo: '', tech: '', funding: '', hiring: false, excludeOwned: true, excludeBurned: true };

/** How many filters are set, and whether one is a timing trigger. */
export function filterShape(f = {}) {
  const set = [f.title && 'title', f.seniority?.length && 'seniority', (f.minEmp || f.maxEmp) && 'headcount', f.segment && 'industry', f.geo && 'location', f.tech && 'tech', f.funding && 'funding', f.hiring && 'hiring'].filter(Boolean);
  return { count: set.length, set, trigger: Boolean(f.hiring || f.funding === 'recent' || f.tech) };
}

export function search(state, f = DEFAULT_FILTERS) {
  const { rows } = universe(state);
  const crm = state.apps.crm ?? {};
  const owned = new Set((crm.companies ?? []).map((c) => c.domain));
  const t = String(f.title ?? '').trim().toLowerCase();
  const titleRe = t ? new RegExp(t.split(/\s*,\s*|\s+or\s+/).filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i') : null;
  const minE = Number(f.minEmp) || 0, maxE = Number(f.maxEmp) || Infinity;
  return rows.filter((r) => {
    const { co, p } = r;
    if (titleRe && !titleRe.test(p.title)) return false;
    if (f.seniority?.length && !f.seniority.includes(p.seniority)) return false;
    if (co.employees < minE || co.employees > maxE) return false;
    if (f.segment && co.segId !== f.segment) return false;
    if (f.geo === 'US' && co.geo !== 'US') return false;
    if (f.geo === 'intl' && co.geo === 'US') return false;
    if (f.tech && !co.techs.includes(f.tech)) return false;
    if (f.funding === 'funded' && !['seed', 'series_a', 'series_b_plus'].includes(co.funding)) return false;
    if (f.funding === 'recent' && !co.recentRaise) return false;
    if (f.hiring && !co.hiringShown) return false;
    if (f.excludeOwned !== false && owned.has(co.domain)) return false;
    if (f.excludeBurned !== false && burnedDomain(state, co.domain)) return false;
    return true;
  });
}

function burnedDomain(state, domain) {
  const co = state.apps.crm?.companies?.find((c) => c.domain === domain);
  return co ? isBurned(state, co) : false;
}

export function recordSearch(state, f) {
  const p = ensureProspector(state);
  const shape = filterShape(f);
  p.searches.push({ day: state.day, filters: shape.count, trigger: shape.trigger, set: shape.set });
  if (p.searches.length > 60) p.searches.shift();
}

export const maskEmail = (e) => e.replace(/^(.)[^@]*(@.).*(\.[a-z]+)$/i, '$1•••$2•••$3');
export const accuracyHint = (row) => (row.co.geo === 'US' ? '~88% accurate (US)' : '~60-73% accurate (intl)');

// ---------------------------------------------------------------------------
// Reveal, waterfall, phones
// ---------------------------------------------------------------------------

function tryProvider(state, row, pid) {
  const pr = PROVIDERS[pid];
  const u = (parseInt(hash(`${row.id}|${pid}|hit`), 36) % 10000) / 10000;
  if (u >= pr.hit) return null;
  const acc = row.co.geo === 'US' ? pr.accUS : pr.accIntl;
  // Providers share mistakes partly: the db's own data draw decides, others draw independently.
  const right = pid === 'db' ? row.p.dataU < acc : (parseInt(hash(`${row.id}|${pid}|ok`), 36) % 10000) / 10000 < acc;
  return { provider: pid, ok: right, cost: pr.cost };
}

/**
 * Reveal emails for rows. mode 'db' = the plan's own database only; 'waterfall' = the enabled providers in order.
 * Misses cost nothing (Clay); hits cost the provider's credits. → { found, missed, credits }
 */
export function reveal(state, rowIds, { mode = 'db' } = {}) {
  const p = ensureProspector(state);
  const plan = PLANS[p.plan];
  if (p.plan === 'none') throw new Error('Pick a database plan first.');
  if (mode === 'waterfall' && !plan.waterfall) throw new Error('Waterfalls need a Clay-style plan.');
  const order = mode === 'waterfall' ? p.waterfall.order.filter((x) => p.waterfall.on[x]) : ['db'];
  let found = 0, missed = 0, credits = 0;
  for (const id of rowIds) {
    if (p.revealed[id]) continue;
    const row = rowById(state, id);
    if (!row) continue;
    const tried = (p.missed[id] ??= []);
    let hit = null;
    for (const pid of order) {
      if (tried.includes(pid)) continue;
      const r = tryProvider(state, row, pid);
      if (r) { hit = r; break; }
      tried.push(pid);
    }
    if (!hit) { missed++; continue; }
    spendCredits(state, hit.cost, `Email via ${PROVIDERS[hit.provider].label}`);
    credits += hit.cost;
    p.revealed[id] = { email: row.p.email, ok: hit.ok, provider: hit.provider, day: state.day };
    found++;
  }
  p.stats.revealed += found;
  return { found, missed, credits };
}

/** "Run on 5 rows first": reveal 5, then inspect (the stellar habit Clay itself recommends). */
export function testFive(state, rowIds, opts) {
  const p = ensureProspector(state);
  p.stats.tests++;
  p.waterfall.tested = true;
  return reveal(state, rowIds.slice(0, 5), opts);
}

export function estimateCredits(state, rowIds, { mode = 'db' } = {}) {
  const p = ensureProspector(state);
  const order = mode === 'waterfall' ? p.waterfall.order.filter((x) => p.waterfall.on[x]) : ['db'];
  let left = rowIds.filter((id) => !p.revealed[id]).length, est = 0;
  for (const pid of order) { const h = left * PROVIDERS[pid].hit; est += h * PROVIDERS[pid].cost; left -= h; }
  return Math.round(est);
}

export function revealPhones(state, rowIds) {
  const p = ensureProspector(state);
  if (!PLANS[p.plan].phone) throw new Error('Phone numbers need a paid plan.');
  let n = 0;
  for (const id of rowIds) {
    const r = p.revealed[id];
    if (!r || r.phone != null) continue;
    const row = rowById(state, id);
    if (row.p.phoneU < PHONE.hit) { spendCredits(state, PHONE.cost, 'Mobile number'); r.phone = true; n++; } else r.phone = false;
  }
  return n;
}

// ---------------------------------------------------------------------------
// AI research column (Claygent-style)
// ---------------------------------------------------------------------------

/** What the prompt asks about, how good the prompt is, and what it costs per row. */
export function analyzePrompt(prompt = '') {
  const t = String(prompt).toLowerCase();
  const topic = /\bhir(e|es|ing)\b|job (post|opening)|recruit/.test(t) ? 'hiring' : /\b(raise|raised|funding|investor|series)\b/.test(t) ? 'funding' : new RegExp(`\\b(${TECH.map((x) => x.toLowerCase()).join('|')}|tech stack|uses?)\\b`).test(t) ? 'tech' : /\b(fit|icp|good customer|qualif)/.test(t) ? 'fit' : 'unclear';
  const format = /yes\s*\/\s*no|yes, no|yes or no|unknown/.test(t);
  const reason = /reason|why|evidence|source|quote/.test(t);
  const grounded = /site|website|job post|careers|linkedin|press|news|page/.test(t);
  const w = words(prompt);
  const quality = clamp(0.5 + (topic !== 'unclear' ? 0.15 : 0) + (format ? 0.12 : 0) + (reason ? 0.08 : 0) + (grounded ? 0.1 : 0) - (w > 120 ? 0.1 : 0), 0.4, 0.95);
  return { topic, format, reason, grounded, quality, accuracy: +(0.6 + 0.32 * (quality - 0.4) / 0.55).toFixed(2), creditsPerRow: clamp(1 + Math.floor(w / 25), 1, AI_COL.maxCredits) };
}

/** Run the AI column over rows. Answers come from the hidden truth with prompt-dependent error. */
export function runAiColumn(state, rowIds, prompt) {
  const p = ensureProspector(state);
  if (!PLANS[p.plan].ai) throw new Error('AI research columns need Apollo Pro or a Clay-style plan.');
  const a = analyzePrompt(prompt);
  p.ai.prompt = prompt;
  const key = hash(prompt);
  let n = 0;
  for (const id of rowIds) {
    const row = rowById(state, id);
    if (!row) continue;
    spendCredits(state, a.creditsPerRow, 'AI research column');
    const truth = a.topic === 'hiring' ? row.co.hiring : a.topic === 'funding' ? row.co.recentRaise : a.topic === 'tech' ? row.techMatch : row.fit >= 0.6;
    const u = (parseInt(hash(`${id}|${key}|ai`), 36) % 10000) / 10000;
    const unknown = a.topic === 'unclear' ? u < 0.4 : u < 0.08;
    const right = u < a.accuracy || unknown;
    const answer = unknown ? 'unknown' : right === truth ? 'yes' : 'no';
    p.ai.answers[id] = { answer, conf: unknown ? 'low' : a.quality > 0.75 ? 'high' : 'medium', topic: a.topic, day: state.day, promptKey: key };
    n++;
  }
  p.stats.aiRows += n;
  return { n, ...a };
}

// ---------------------------------------------------------------------------
// Save to CRM, reasons, pruning
// ---------------------------------------------------------------------------

/** Save revealed rows as a list into the CRM. addContact/upsertCompany come from model.js (passed in: no import cycle). */
export function saveList(state, rowIds, name, { addContact, reasons = {} }) {
  const p = ensureProspector(state);
  const list = { id: uid('plist'), name: name || `List ${p.lists.length + 1}`, day: state.day, rowIds: [], contactIds: [], filters: p.searches.at(-1) ?? null, tested: p.waterfall.tested };
  for (const id of rowIds) {
    const rv = p.revealed[id];
    const row = rowById(state, id);
    if (!rv || !row) continue;
    const { co, p: person } = row;
    let added;
    try {
      added = addContact(state, { firstName: person.first, lastName: person.last, email: rv.email, title: person.title, company: co.name, domain: co.domain, industry: co.industry, size: String(co.employees), notes: `From the prospect database (${co.segLabel}, ${co.geo})` }, { source: 'prospector' });
    } catch { continue; }
    const { contact, company } = added;
    // Hidden truth travels with the record.
    contact.truth = rv.ok ? (person.catchAll ? 'catch_all' : 'valid') : person.wrongKind === 'invalid' ? 'invalid' : 'valid';
    contact.prospect = { rowId: id, wrongPersona: row.wrongPersona, wrongPerson: !rv.ok && person.wrongKind === 'departed', dataWrong: !rv.ok, provider: rv.provider, listId: list.id };
    company.employees = co.employees;
    company.segmentId = co.segId;
    company.segmentKey = `${company.industry}|${company.size}|${company.name}|`;
    company.prospect = { rowKey: co.key, fit: row.fit, hiring: co.hiring, hiringShown: co.hiringShown, recentRaise: co.recentRaise, techs: co.techs, techMatch: row.techMatch, geo: co.geo, funding: co.funding, reason: reasons[id] ?? company.prospect?.reason ?? '', listId: list.id, savedDay: state.day, signal: null };
    company.site ??= syntheticSite(co);
    list.rowIds.push(id);
    list.contactIds.push(contact.id);
  }
  p.lists.push(list);
  p.stats.saved += list.contactIds.length;
  return list;
}

/** What the database shows about a company, used as its "website" for research and personalization offline. */
export function syntheticSite(co) {
  const headings = [`${co.industry} · ${co.employees} people · ${co.geo}`, co.hiringShown ? 'Careers: we are hiring' : 'About us', `Built on ${co.techs.join(' and ')}`];
  if (co.recentRaise) headings.push(`Announcing our ${FUNDING_LABEL[co.funding]} round`);
  return { title: co.name, description: `${co.name}: ${co.industry}`, headings, text: `${co.name} is a ${co.industry} with about ${co.employees} people (${co.geo}). Uses ${co.techs.join(', ')}. ${co.hiringShown ? 'Currently hiring.' : ''} ${co.recentRaise ? `Recently raised a ${FUNDING_LABEL[co.funding]} round.` : ''}`.trim(), synthetic: true, fetchedDay: null };
}

/** Does a one-line "why this account" reason reference something true about it? */
export function reasonCheck(company) {
  const r = String(company?.prospect?.reason ?? '').toLowerCase();
  if (words(r) < 4) return { ok: false, why: 'no reason written' };
  const P = company.prospect;
  const claims = [
    [/hir(e|es|ing)|job post|recruit/, P.hiring, 'hiring'],
    [/rais|funding|series|seed/, P.recentRaise, 'recent raise'],
    [new RegExp((P.techs ?? []).map((t) => t.toLowerCase()).join('|') || '^$'), true, 'their tech'],
  ];
  const made = claims.filter(([re]) => re.test(r));
  if (!made.length) return { ok: words(r) >= 6, why: 'reason names no checkable trigger' };
  const wrong = made.filter(([, truth]) => !truth);
  return wrong.length ? { ok: false, why: `trigger not true: ${wrong.map((x) => x[2]).join(', ')}` } : { ok: true, why: made.map((x) => x[2]).join(', ') };
}

/** Remove an account that fails the trigger check (disqualifies its contacts). */
export function dropAccount(state, company) {
  const p = ensureProspector(state);
  for (const c of state.apps.crm.contacts) if (c.companyId === company.id && !['customer', 'meeting'].includes(c.status)) c.status = 'disqualified';
  company.prospect.dropped = state.day;
  p.stats.dropped++;
}

// ---------------------------------------------------------------------------
// Signals (monitors on saved accounts)
// ---------------------------------------------------------------------------

export function setMonitor(state, type, cadence) {
  const p = ensureProspector(state);
  if (!PLANS[p.plan].signals) throw new Error('Signals need a Clay-style plan.');
  if (!cadence) delete p.monitors[type]; else p.monitors[type] = cadence;
}

/** Daily: monitored accounts produce signals (some false positives); each result costs a credit. */
export function prospectorDay(state) {
  const p = state.apps.crm?.prospector;
  if (!p) return;
  // Monthly credit grant (Apollo: unused credits expire; Clay: roll over up to one month [conflicting sources]).
  const mk = monthKey(state);
  if (p.plan !== 'none' && p.month !== mk) {
    const plan = PLANS[p.plan];
    const carried = Math.min(p.credits, plan.credits * plan.rollover);
    if (p.credits > carried) { p.stats.wasted += p.credits - carried; p.ledger.unshift({ day: state.day, delta: -(p.credits - carried), what: 'Unused credits expired' }); }
    p.credits = carried + plan.credits;
    p.month = mk;
    p.ledger.unshift({ day: state.day, delta: plan.credits, what: `${plan.label}: monthly credits` });
  }
  const types = Object.keys(p.monitors ?? {});
  if (!types.length || !PLANS[p.plan]?.signals) return;
  const accounts = (state.apps.crm.companies ?? []).filter((c) => c.prospect && !c.prospect.dropped);
  for (const type of types) {
    const every = SIGNALS.cadenceDays[p.monitors[type]] ?? 7;
    for (const co of accounts) {
      const u = (parseInt(hash(`${co.id}|${type}|${state.day}`), 36) % 100000) / 100000;
      if (u >= SIGNALS.hazard[type]) continue;
      const real = (parseInt(hash(`${co.id}|${type}|${state.day}|fp`), 36) % 1000) / 1000 >= SIGNALS.falsePositive[type];
      const happened = state.day;
      const seen = Math.ceil((state.day + 0.5) / every) * every; // detected at the next check
      const sig = { id: uid('sig'), companyId: co.id, type, real, day: happened, seenDay: Math.max(state.day, seen), read: false };
      p.signals.push(sig);
      if (real) {
        if (type === 'hiring') co.prospect.hiring = true;
        if (type === 'funding') co.prospect.recentRaise = true;
      }
    }
  }
  // Deliver signals whose check day has come: credit per result, note on the account, suggested first line.
  for (const sig of p.signals) {
    if (sig.delivered || sig.seenDay > state.day) continue;
    sig.delivered = true;
    try { spendCredits(state, 1, `Signal: ${SIGNALS.types[sig.type]}`); } catch { sig.unpaid = true; continue; }
    const co = state.apps.crm.companies.find((c) => c.id === sig.companyId);
    if (!co) continue;
    co.prospect.signal = { type: sig.type, day: sig.day, real: sig.real, seenDay: state.day };
    sig.suggestion = suggestLine(sig.type, co);
    emitSalesEvent(state, 'signal_fired', { companyId: co.id, signal: sig.type, signalId: sig.id }, `signal:${sig.id}`);
  }
  if (p.signals.length > 300) p.signals.splice(0, p.signals.length - 300);
}

export function suggestLine(type, co) {
  return {
    job_change: `Congrats on the new role at ${co.name}: first 90 days usually means a fresh look at the stack.`,
    hiring: `Saw ${co.name} is hiring; usually a sign the manual work is piling up.`,
    funding: `Congrats on the round at ${co.name}.`,
    news: `Saw the news from ${co.name} this week.`,
  }[type];
}

// ---------------------------------------------------------------------------
// List quality → replies (used by the outreach engine)
// ---------------------------------------------------------------------------

/** The company's TRUE fit (prospect database truth first, else the research estimate). */
export const trueFit = (company) => company?.prospect?.fit ?? company?.research?.fit ?? null;

/**
 * Reply multiplier for a database-sourced contact beyond fit: real, fresh trigger (timing), wrong persona, a
 * departed person's mailbox. 1 for contacts that did not come from the database.
 */
export function listReplyMult(state, contact, company) {
  if (!company?.prospect && !contact?.prospect) return 1;
  let m = 1;
  if (contact?.prospect?.wrongPerson) m *= LIST.wrongPerson;
  else if (contact?.prospect?.wrongPersona) m *= LIST.wrongPersona;
  const P = company?.prospect;
  if (P) {
    const sig = P.signal;
    if (sig?.real && state.day - sig.day <= SIGNALS.freshDays) m *= LIST.triggerLift;
    else if (sig?.real || P.hiring || P.recentRaise || P.techMatch) m *= LIST.staleTriggerLift;
  }
  return m;
}

// ---------------------------------------------------------------------------
// List health (coaching + mistakes)
// ---------------------------------------------------------------------------

/** Per-list outcomes: bounces, wrong persona, accounts worked vs added. */
export function listHealth(state, list) {
  const contacts = list.contactIds.map((id) => state.apps.crm.contacts.find((c) => c.id === id)).filter(Boolean);
  const sent = contacts.filter((c) => c.lastContactDay != null);
  const bounced = contacts.filter((c) => c.status === 'bounced').length;
  const wrongPersona = contacts.filter((c) => c.prospect?.wrongPersona).length;
  const verified = contacts.filter((c) => c.verification).length;
  const reasons = list.contactIds.map((id) => state.apps.crm.contacts.find((c) => c.id === id)).filter(Boolean).map((c) => state.apps.crm.companies.find((x) => x.id === c.companyId)).filter((co) => co?.prospect?.reason);
  return {
    n: contacts.length, sent: sent.length, bounced, bounceRate: sent.length ? bounced / sent.length : 0,
    wrongPersonaShare: contacts.length ? wrongPersona / contacts.length : 0, verifiedShare: contacts.length ? verified / contacts.length : 0,
    reasons: reasons.length, avgFit: contacts.length ? contacts.reduce((a, c) => a + (state.apps.crm.companies.find((x) => x.id === c.companyId)?.prospect?.fit ?? 0.5), 0) / contacts.length : 0,
  };
}

/** Check lists for a bounce problem once enough has been sent (called daily). */
export function checkListBounces(state) {
  const p = state.apps.crm?.prospector;
  if (!p) return;
  for (const list of p.lists) {
    if (list.bounceFlagged) continue;
    const h = listHealth(state, list);
    if (h.sent >= 40 && h.bounceRate > 0.05) {
      list.bounceFlagged = state.day;
      emitSalesEvent(state, 'bounce_over_threshold', { listId: list.id, bounceRate: +h.bounceRate.toFixed(3) }, `listbounce:${list.id}`);
      logMistake(state, {
        functionId: 'prospecting', id: 'bought_list', label: 'Sent to an unverified database export', app: 'crm', key: `listbounce:${list.id}`,
        cost: { reputation: 1, usd: Math.round(h.n * 0.2) }, delayed: true,
        detail: `"${list.name}" bounced ${(h.bounceRate * 100).toFixed(1)}% (healthy is under 2%). Database emails are ~88% right in the US and worse abroad: verify before you send.`,
      });
    }
  }
}
