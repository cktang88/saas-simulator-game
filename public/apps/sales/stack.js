// GTM tool stack: which CRM the CRM app really is, an agent layer on top (Rox), inbound routing and signals
// (Calendly / Chili Piper / Default, Unify), local-business lead sources (Maps scrape, Openmart, Resquared) and the
// tools that are outdated for a startup (ZoomInfo, Gong, Salesforce at seed, Common Room after the Zoom deal).
//
// Research: docs/research/tools/2026q4/gtm.md (cited as "gtm §n"), deep/d05 (Attio, HubSpot), d04 (notetakers).
// Every vendor changes what the player does, not only the bill:
//   - Attio: relationship graph auto-captured from email and calendar (little data entry), custom objects, light
//     reporting, no marketing automation. Free to 3 seats.
//   - HubSpot: marketing-led suite (forms, nurture, attribution). Fixed objects below Enterprise (workaround hours
//     for a custom motion), seat and marketing-contact tier jumps, more setup, $1,500 Pro onboarding (d05).
//   - Octolane: AI writes the CRM updates; almost no entry, but some updates are wrong unless you review them.
//   - Salesforce: admin-built platform. Reporting and objects are unlimited; the admin hours are the price.
//   - folk / Twenty: contact-centric relationship CRM / open-source self-host (engineering hours).
//   - A spreadsheet: free, all manual, hygiene decays.
// Light-reporting CRMs feel migration pressure from ~$5M ARR (gtm §8: "expect migration pressure toward HubSpot or
// Salesforce around $5-15M ARR [unverified]"). A planned migration costs weeks of hours; a rushed one loses data.
//
// Operator tiers (CLAUDE.md, ARCHITECTURE principle 7), read by stackRead():
//   stellar: picks the CRM that fits stage and motion (Attio/HubSpot Free early), adds routing/signals only past
//            ~100 inbound leads a month, works local lists by phone/DM after verifying them, plans the CRM migration
//            once reporting pressure shows, and never signs ZoomInfo/Gong/Salesforce before they pay.
//   good:    right CRM, one premature tool or one unverified list.
//   average: generic choices: HubSpot Pro for a solo founder, routing at 30 leads a month, email-first local lists.
//   mediocre: Salesforce + ZoomInfo + Default at seed, stale lists emailed blind, rushed migration.
// Numbers tagged [design] are game choices; vendor prices conflict across sources and carry their tag.
import { clamp, hash, uid, rng, dayOfWeek, dayOfMonth, round2 } from '../../core/util.js';
import { post, addRecurring } from '../../core/bank.js';
import { logMistake } from '../../core/operator.js';
import { tierFromScore } from '../../core/operator.js';
import { notify } from '../../core/state.js';
import { mrr } from '../../core/stripe.js';
import { syntheticPerson } from '../../core/market.js';
import { ensureCrm, addContact, ensureDeal, addActivity, nextSlot, createMeeting, contactById, companyById } from './model.js';
import { isOpen } from './deals.js';
import { icpSegments } from './segments.js';

const u = (s) => (parseInt(hash(s), 36) % 100000) / 100000;

// ---------------------------------------------------------------------------
// CRM vendors
// ---------------------------------------------------------------------------
// perSeat: monthly list price per seat (monthly billing). entryPerDeal: founder hours per open deal per week of data
// entry the tool does NOT capture for you [design, from d05 "email and calendar sync fill the database" vs manual
// logging]. ceiling: best data hygiene reachable [design]. reporting: none | light | standard | full.
export const CRM_VENDORS = {
  sheet: {
    vendor: 'Spreadsheet', label: 'Spreadsheet + inbox (no CRM)', perSeat: 0, maxSeats: Infinity, setupHours: 0.5, entryPerDeal: 0.12, adminWeekly: 0,
    capture: 'none', reporting: 'none', customObjects: true, marketing: 'none', ceiling: 0.55, fitArr: [0, 300000], fitSellers: [1, 1],
    paradigm: 'Free and flexible; every email, call and stage change is typed by hand. Fine for the first ten deals.',
  },
  attio_free: {
    vendor: 'Attio', label: 'Attio Free (up to 3 seats)', perSeat: 0, maxSeats: 3, setupHours: 1, entryPerDeal: 0.03, adminWeekly: 0, objects: 3,
    capture: 'auto', reporting: 'light', customObjects: true, marketing: 'none', ceiling: 0.85, fitArr: [0, 5e6], fitSellers: [1, 3],
    price: 'Free to 3 seats, 50k records, 3 objects (d05, attio.com/pricing 2026-10-14)',
    paradigm: 'Relationship graph auto-built from Gmail and Calendar; you shape objects and lists. No marketing email: pair it with Loops.',
  },
  attio_plus: {
    vendor: 'Attio', label: 'Attio Plus', perSeat: 44, maxSeats: 10, setupHours: 1.5, entryPerDeal: 0.03, adminWeekly: 0, objects: 5,
    capture: 'auto', reporting: 'light', customObjects: true, marketing: 'none', ceiling: 0.87, fitArr: [0, 5e6], fitSellers: [1, 10],
    price: '$44/seat monthly, $35 annual (d05; gtm §1 notes a July 2026 repricing, verify)',
    paradigm: 'Same graph, more objects, sequences and AI attributes (credits).',
  },
  hubspot_free: {
    vendor: 'HubSpot', label: 'HubSpot Free CRM', perSeat: 0, maxSeats: 2, setupHours: 4, entryPerDeal: 0.06, adminWeekly: 0,
    capture: 'logged', reporting: 'standard', customObjects: false, marketing: 'forms', ceiling: 0.78, fitArr: [0, 2e6], fitSellers: [1, 2],
    price: 'Free CRM (gtm §1)', contactsIncluded: 1000,
    paradigm: 'Contact/company/deal pipeline plus forms and simple email. Fixed objects; upgrades are the business model.',
  },
  hubspot_starter: {
    vendor: 'HubSpot', label: 'HubSpot Starter', perSeat: 20, maxSeats: Infinity, setupHours: 6, entryPerDeal: 0.06, adminWeekly: 0.25,
    capture: 'logged', reporting: 'standard', customObjects: false, marketing: 'forms', ceiling: 0.8, fitArr: [2e5, 5e6], fitSellers: [1, 5],
    price: '$20/seat monthly Starter Customer Platform (catalog); Sales Starter $9 annual / $15 monthly (d05, unverified)', contactsIncluded: 1000,
    paradigm: 'Forms, simple email marketing and sequences on the HubSpot funnel. Marketing contacts are billed in tiers.',
  },
  hubspot_pro: {
    vendor: 'HubSpot', label: 'HubSpot Pro (Sales + Marketing)', perSeat: 100, platform: 800, onboarding: 1500, maxSeats: Infinity, setupHours: 20, entryPerDeal: 0.05, adminWeekly: 1,
    capture: 'logged', reporting: 'full', customObjects: false, marketing: 'automation', ceiling: 0.88, fitArr: [2e6, 5e7], fitSellers: [2, 50],
    price: 'Sales Pro $100/seat monthly + $1,500 onboarding (d05); Marketing Hub Pro platform ~$800/mo [unverified, not in gtm.md]', contactsIncluded: 2000,
    paradigm: 'Marketing automation, attribution and forecasting in one suite. Wins when marketing and sales share one funnel.',
  },
  octolane: {
    vendor: 'Octolane', label: 'Octolane Pro (AI-native)', perSeat: 39, maxSeats: 3, setupHours: 0.75, entryPerDeal: 0.01, adminWeekly: 0,
    capture: 'ai', reporting: 'light', customObjects: false, marketing: 'none', ceiling: 0.86, fitArr: [0, 2e6], fitSellers: [1, 3], aiWrong: 0.05, reviewWeekly: 0.5,
    price: '$39/seat Pro (max 3 seats), $79 Business, billed yearly; no $1k minimum (gtm §0, octolane.com/pricing)',
    paradigm: '"Self-driving": the system writes updates from email and calls and you review. Seed-stage vendor, thin adoption evidence.',
  },
  salesforce: {
    vendor: 'Salesforce', label: 'Salesforce (Starter + admin)', perSeat: 25, maxSeats: Infinity, setupHours: 40, entryPerDeal: 0.05, adminWeekly: 4,
    capture: 'logged', reporting: 'full', customObjects: true, marketing: 'none', ceiling: 0.92, fitArr: [1e7, Infinity], fitSellers: [8, Infinity], implementation: 15000,
    price: 'Starter Suite ~$25/user; Agentforce 1 Sales ~$550/user (gtm §1, third-party)',
    paradigm: 'Configurable enterprise platform: objects, flows, CPQ, territories. Needs an admin; OUTDATED for a seed-stage startup.',
  },
  folk: {
    vendor: 'folk', label: 'folk (relationship CRM)', perSeat: 30, maxSeats: Infinity, setupHours: 0.75, entryPerDeal: 0.04, adminWeekly: 0,
    capture: 'auto', reporting: 'none', customObjects: false, marketing: 'none', ceiling: 0.78, fitArr: [0, 1e6], fitSellers: [1, 5],
    price: '~$19-60/user, conflicting (gtm §1)',
    paradigm: 'Contact-centric with LinkedIn/Gmail capture and groups: agencies and network selling, not pipeline math.',
  },
  twenty: {
    vendor: 'Twenty', label: 'Twenty (open source, self-hosted)', perSeat: 0, maxSeats: Infinity, setupHours: 12, entryPerDeal: 0.05, adminWeekly: 1,
    capture: 'logged', reporting: 'light', customObjects: true, marketing: 'none', ceiling: 0.8, fitArr: [0, 5e6], fitSellers: [1, 20],
    price: 'Free self-host (AGPLv3); cloud ~$9-19/user (gtm §1)',
    paradigm: 'Attio-like objects you host and extend; the cost is engineering and ops time.',
  },
};

// HubSpot marketing-contact tiers: price jumps as the database grows [design: shape of HubSpot tiering; exact tier
// prices are not in the research and are placeholders].
export const HUBSPOT_CONTACT_TIERS = [[1000, 0], [2000, 50], [5000, 250], [10000, 600], [Infinity, 1200]];

export const MIGRATION = {
  pressureFromArr: 5e6, // gtm §8, §0: migration pressure around $5-15M ARR [unverified]
  pressureFullArr: 15e6,
  lateArr: 15e6,
  plannedHoursBase: 16, plannedPerRecord: 1 / 250, rushedHoursBase: 6, rushedPerRecord: 1 / 1000, // [design]
  plannedLoss: 0.02, rushedLoss: 0.2, dualRunDays: 30, lateMult: 1.5, // [design]
  reportingHours: [1, 4], // weekly hours of spreadsheet reporting a light CRM forces at $5M → $15M ARR [design]
};

// ---------------------------------------------------------------------------
// Agent layer, routing, signals
// ---------------------------------------------------------------------------
export const ROX = {
  plans: {
    individual: { label: 'Rox Individual', monthly: 100, actions: 10000, writeback: false },
    teams: { label: 'Rox Teams', monthly: 255, actions: 15000, writeback: true },
  },
  source: 'rox.com/pricing (gtm §0): Individual $100/mo 10k agent actions; Teams $255/mo 15k actions, unlimited seats, CRM sync and writeback',
  crms: ['hubspot_free', 'hubspot_starter', 'hubspot_pro', 'salesforce'], // syncs with Salesforce/HubSpot (gtm §0)
  actionsPerAccountWeek: 50, // monitoring + research per tracked account [design]
  researchHours: 0.05, // a Rox account brief instead of 15 minutes on their site [design]
  savedPerDealWeek: 0.04, // briefs and follow-up drafts it writes [design]
  doubleEntryPerDeal: 0.03, // Individual has no writeback: you copy its output into the CRM [design]
  teamMinSellers: 3, // "reasonable pick for a 3-10 person sales team" (gtm §8)
};

// Inbound routing. Fit below ~100 qualified inbound leads a month is a form + Calendly (gtm §5, §8).
export const ROUTING = {
  none: { label: 'No routing: I triage the inbound queue', monthly: () => 0, setupHours: 0, book: 0, qualifies: false, followUp: false },
  calendly: { label: 'Booking link on the form (Calendly / Cal.com)', monthly: () => 12, setupHours: 0.5, book: 0.35, qualifies: false, followUp: false, source: '$12/user (gtm §5; catalog)' },
  chilipiper: { label: 'Chili Piper (book-on-submit routing)', monthly: (n, seats) => 30 * seats + (n <= 100 ? 150 : n <= 1000 ? 400 : 1000), setupHours: 4, book: 0.5, qualifies: true, followUp: false, source: '$30/user + platform $150 (<100 leads), $400 (101-1,000), $1,000 (1,000+) (gtm §5, third-party)' },
  default: { label: 'Default (enrich, qualify, route, book, follow up)', monthly: (n, seats) => 750 + 45 * seats, setupHours: 8, book: 0.55, qualifies: true, followUp: true, source: 'Startup $750/mo + $45/user (Default blog, gtm §5; SyncGTM says $500 + $20-45)' },
};
export const INBOUND_GATE = 100; // leads/month below which Default/Chili Piper/Unify are a waste (gtm §5, §8)
export const SPEED = { coldAfterDays: 3, coldShare: 0.4 }; // untriaged inbound goes cold [design; speed-to-lead]

export const SIGNALS_VENDORS = {
  none: { label: 'No signal tool', monthly: 0 },
  rb2b: { label: 'RB2B site-visitor ID (free tier)', monthly: 0, visitorsPerLead: 2, playReply: 0.02, credits: Infinity, setupHours: 0.5, source: 'free tier (gtm §4)' },
  unify: { label: 'Unify (signal-triggered plays)', monthly: 700, visitorsPerLead: 4, playReply: 0.05, credits: 10000, creditsPerPlay: 25, setupHours: 6, source: 'Growth $700/mo annual vs $1,740 (gtm §4, conflicting third-party); credit-based' },
};

// ---------------------------------------------------------------------------
// Local-business lead sources (gtm §7). Data staleness is the failure mode [design].
// ---------------------------------------------------------------------------
export const LOCAL_SOURCES = {
  maps: { label: 'Google Maps / Yelp scrape (manual)', monthly: 0, buildBase: 0.25, buildPerRow: 0.04, owner: 0, phone: 0.95, email: 0.2, social: 0.5, closed: 0.04, wrongOwner: 0, playbook: false, note: 'baseline free alternative; rough lists, no owner names (gtm §7)' },
  openmart: { label: 'Openmart (AI-built local database, prompt to list)', monthly: 199, buildBase: 0.25, buildPerRow: 0.002, owner: 0.85, phone: 0.8, email: 0.6, social: 0.4, closed: 0.07, wrongOwner: 0.12, playbook: false, note: 'owner name + contact from maps, filings, reviews; pricing unpublished, $199/mo is a [design] placeholder (gtm §0, §7)' },
  resquared: { label: 'Resquared (local lists + email/DM playbooks)', monthly: 299, buildBase: 0.25, buildPerRow: 0.002, owner: 0.7, phone: 0.7, email: 0.65, social: 0.75, closed: 0.06, wrongOwner: 0.1, playbook: true, note: '~11-12M local businesses, radius filters, Facebook/Instagram DM playbooks; custom pricing, $299/mo is a [design] placeholder (gtm §0)' },
};
export const STALE = { closedPerMonth: 0.008, wrongOwnerPerMonth: 0.01, staleDays: 90 }; // ~10%/yr of small businesses close or change hands [design]
// Channel rates per row worked [design]. Local ICPs lack LinkedIn presence; phone, DMs and walk-ins work (gtm §7).
export const LOCAL_CHANNELS = {
// meet = meetings per row worked on a fresh list at full ICP fit; reach = share where someone answers or reads it.
  phone: { label: 'Call the business', hours: 0.08, needs: 'phone', reach: 0.25, meet: 0.03 },
  dm: { label: 'Facebook / Instagram DM', hours: 0.05, needs: 'social', reach: 0.4, meet: 0.02, playbookMult: 1.5 }, // Resquared claims ~20% replies via social [vendor claim]
  email: { label: 'Cold email', hours: 0.01, needs: 'email', reach: 0.9, meet: 0.004 },
  walkin: { label: 'Walk in', hours: 0.6, needs: null, reach: 0.6, meet: 0.1 },
};
export const LOCAL_HOURS = { verify: 0.03, fixOwner: 0.05, wrongOwnerLoop: 0.05, skip: 0.005 };
const LOCAL_SEGMENTS = ['retail_shops', 'restaurants', 'salons_fitness', 'trades', 'trucking', 'health_practices', 'real_estate', 'franchise_systems'];

// ---------------------------------------------------------------------------
// Outdated / retired for a startup
// ---------------------------------------------------------------------------
export const OUTDATED = {
  zoominfo: { label: 'ZoomInfo', status: 'outdated', annual: 15000, minSeats: 3, renewalUplift: 0.15, note: 'No published prices; est. $15k/yr entry, 3-seat minimum, median ~$32k, renewals +10-20%, credits expire (gtm §3, Vendr-based). Startups replaced it with Apollo + Clay.' },
  gong: { label: 'Gong', status: 'outdated', note: 'Quote-only, ~$28k in year one for 10 users (d04). Built for managers coaching 10+ reps and forecasting; below that, Granola or Fathom.' },
  salesforce_seed: { label: 'Salesforce at seed', status: 'outdated', note: 'Needs an admin; startups rule it out early (gtm §1). Fits Series B+ with SEs, CPQ and territories.' },
  common_room: { label: 'Common Room', status: 'retired', note: 'Zoom announced on 2026-07-02 that it is acquiring Common Room (gtm §0). Not offered to new standalone signups in the game [design].' },
  pocus: { label: 'Pocus', status: 'retired', note: 'Reported acquired by Apollo, Mar 2026 [unverified] (gtm §0). Use Apollo or Clay signals.' },
  primer: { label: 'Primer', status: 'not_a_lead_tool', note: 'B2B ad audiences and lift measurement (~$1k/mo, unverified), not a lead source (gtm §0). Belongs in paid/ABM above $2M ARR.' },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export function ensureStack(state) {
  const crm = ensureCrm(state);
  const st = (crm.stack ??= {});
  st.crm ??= null; // null = never chosen: behaves like a spreadsheet
  st.hygiene ??= 0.7;
  st.recurring ??= {};
  st.rox ??= null;
  st.routing ??= 'none';
  st.signals ??= 'none';
  st.local ??= { source: null, lists: [] };
  st.local.lists ??= [];
  st.zoominfo ??= null;
  st.migration ??= null;
  st.reviewAi ??= true;
  st.stats ??= { routedBooked: 0, autoDismissed: 0, wentCold: 0, playsSent: 0, signalLeads: 0, roxActions: 0, roxCapped: 0, wastedTools: 0, reportingHours: 0, upkeepUnpaid: 0, migrations: 0 };
  st.history ??= [];
  return st;
}
export const crmVendor = (state) => CRM_VENDORS[ensureStack(state).crm ?? 'sheet'] ?? CRM_VENDORS.sheet;
export const arrOf = (state) => (state.stripe ? mrr(state) * 12 : 0);
export function sellerCount(state) {
  const team = (state.apps.people?.members ?? []).filter((m) => m.status === 'active' && m.kind !== 'ai_agent' && /\b(ae|sdr|founding_ae|sales|account_exec)\b/.test(String(m.role ?? '')));
  return 1 + team.length;
}
export function inboundPerMonth(state, day = state.day) {
  return (ensureCrm(state).inboundQueue ?? []).filter((q) => q.day > day - 30 && q.day <= day).length;
}
export const recordCount = (state) => { const c = ensureCrm(state); return c.contacts.length + c.companies.length + c.deals.length + Math.round(c.activities.length / 4); };
const openDeals = (state) => ensureCrm(state).deals.filter(isOpen);

function setRecurring(state, key, vendor, amount, note) {
  const st = ensureStack(state);
  const old = state.recurring?.find((r) => r.id === st.recurring[key]);
  if (old) old.active = false;
  st.recurring[key] = null;
  if (amount > 0) {
    post(state, { amount: -amount, counterparty: vendor, description: `${note}, first month`, category: 'software', method: 'card' });
    st.recurring[key] = addRecurring(state, { vendor, amount, category: 'software', dayOfMonth: Math.min(28, dayOfMonth(state)), note }).id;
  }
}
const recurringAmount = (state, key) => state.recurring?.find((r) => r.id === ensureStack(state).recurring[key] && r.active)?.amount ?? 0;

/** Monthly bill for a CRM vendor at the current seats and marketing contacts. */
export function crmMonthly(state, id, seats = sellerCount(state)) {
  const v = CRM_VENDORS[id];
  if (!v) return 0;
  let m = v.perSeat * seats + (v.platform ?? 0);
  if (v.vendor === 'HubSpot' && v.perSeat > 0) {
    const contacts = ensureCrm(state).contacts.length;
    const extra = contacts > (v.contactsIncluded ?? 1000) ? (HUBSPOT_CONTACT_TIERS.find(([lim]) => contacts <= lim)?.[1] ?? 0) : 0;
    m += extra;
  }
  return round2(m);
}

/** How well a CRM fits this company now: 1 = right tool, lower = wrong stage, seats or motion. */
export function crmFit(state, id, arr = arrOf(state)) {
  const v = CRM_VENDORS[id];
  const sellers = sellerCount(state);
  let fit = 1;
  const reasons = [];
  if (arr < v.fitArr[0]) { fit -= 0.35; reasons.push(`built for companies past ${money(v.fitArr[0])} ARR`); }
  if (arr > v.fitArr[1]) { fit -= 0.3; reasons.push(`outgrown past ${money(v.fitArr[1])} ARR`); }
  if (sellers < v.fitSellers[0]) { fit -= 0.25; reasons.push(`built for ${v.fitSellers[0]}+ sellers`); }
  if (sellers > Math.min(v.fitSellers[1], v.maxSeats)) { fit -= 0.25; reasons.push(`caps at ${Math.min(v.fitSellers[1], v.maxSeats)} seats`); }
  if (needsCustomObjects(state) && !v.customObjects) { fit -= 0.15; reasons.push('your motion needs custom objects it does not have below Enterprise'); }
  return { fit: clamp(fit, 0, 1), reasons };
}
const money = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : `$${Math.round(n / 1000)}k`);

/** An enterprise motion, bids or a large account base needs objects beyond contact/company/deal [design]. */
export function needsCustomObjects(state) {
  const crm = ensureCrm(state);
  return state.company.model === 'ent' || (crm.bids?.length ?? 0) > 0 || crm.companies.length > 300;
}

// ---------------------------------------------------------------------------
// CRM choice and migration
// ---------------------------------------------------------------------------
/** Hours a switch to `to` will take now. A first pick with a near-empty CRM is just setup. */
export function switchCost(state, to, { planned = true, arr = arrOf(state) } = {}) {
  const v = CRM_VENDORS[to];
  const recs = recordCount(state);
  const st = ensureStack(state);
  const first = st.crm == null && recs < 60;
  if (first) return { hours: round2(v.setupHours + recs / 250), usd: v.onboarding ?? 0, loss: 0, first: true };
  const M = MIGRATION;
  const late = arr > M.lateArr && ['none', 'light'].includes(crmVendor(state).reporting) ? M.lateMult : 1;
  const hours = planned ? (M.plannedHoursBase + recs * M.plannedPerRecord) * late + v.setupHours : M.rushedHoursBase + recs * M.rushedPerRecord + v.setupHours * 0.5;
  const usd = (v.onboarding ?? 0) + (planned ? v.implementation ?? 0 : 0);
  return { hours: round2(hours), usd, loss: planned ? M.plannedLoss : M.rushedLoss, first: false, late: late > 1 };
}

/**
 * Choose or migrate the CRM. planned: map fields, dual-run 30 days, clean duplicates; rushed: export/import over a
 * weekend and lose part of the deal history. Returns { hours, usd, lost } (the caller charges the hours).
 */
export function chooseCrm(state, to, { planned = true, arr = arrOf(state) } = {}) {
  const v = CRM_VENDORS[to];
  if (!v) throw new Error('Unknown CRM');
  const st = ensureStack(state);
  if (st.crm === to) return { hours: 0, usd: 0, lost: 0 };
  const cost = switchCost(state, to, { planned, arr });
  const from = st.crm;
  const sellers = sellerCount(state);
  if (sellers > v.maxSeats) throw new Error(`${v.label} allows at most ${v.maxSeats} seats; you have ${sellers} sellers.`);
  if (cost.usd) post(state, { amount: -cost.usd, counterparty: v.vendor, description: v.implementation && planned ? 'CRM implementation partner' : 'CRM onboarding fee', category: 'software', method: 'card' });
  setRecurring(state, 'crm', v.vendor, crmMonthly(state, to, sellers), `${v.label} (${sellers} seat${sellers > 1 ? 's' : ''})`);
  let lost = 0;
  if (!cost.first) {
    st.stats.migrations++;
    const deals = ensureCrm(state).deals;
    for (const d of deals) if (d.fields && u(`${d.id}|mig|${state.day}`) < cost.loss) { delete d.fields; d.migrationLoss = true; lost++; }
    st.hygiene = planned ? Math.min(st.hygiene, v.ceiling) : 0.35;
    st.migration = { from, to, day: state.day, planned, dualRunUntil: planned ? state.day + MIGRATION.dualRunDays : state.day, lost, late: cost.late };
    if (!planned) logMistake(state, { functionId: 'deal_management', id: 'rushed_crm_migration', label: 'Rushed the CRM migration', app: 'crm', key: `rushmig:${state.day}`, cost: { hours: 4, customers: 0.05 * lost }, detail: `Exported and re-imported over a weekend: ${lost} deal(s) lost their fields and history. A stellar operator maps fields, dedupes and runs both systems for a month.` });
    if (cost.late) logMistake(state, { functionId: 'deal_management', id: 'late_crm_migration', label: 'Migrated the CRM late', app: 'crm', key: `latemig:${to}`, cost: { hours: round2(cost.hours / 3) }, detail: `Past ${money(MIGRATION.lateArr)} ARR there are more records, integrations and reports to rebuild: the move cost about 50% more hours. Plan it once reporting pressure shows around $5M ARR.` });
  }
  if (to === 'salesforce' && (arr < 2e6 || sellers < 3)) logMistake(state, { functionId: 'deal_management', id: 'salesforce_too_early', label: 'Salesforce before it pays', app: 'crm', key: 'sfearly', cost: { hours: v.setupHours, usd: v.implementation }, detail: `About ${v.adminWeekly}h a week of admin work for ${sellers} seller(s) at ${money(arr)} ARR. Startups rule it out early (gtm §1). A stellar operator uses Attio or HubSpot Free until Series B.` });
  if (to === 'hubspot_pro' && arr < 5e5 && sellers < 2) logMistake(state, { functionId: 'deal_management', id: 'hubspot_pro_too_early', label: 'HubSpot Pro for a solo founder', app: 'crm', key: 'hspro_early', cost: { usd: v.onboarding }, detail: 'Paid $1,500 onboarding plus ~$900/mo for marketing automation with almost no list to automate. HubSpot Free or Attio covers this stage.' });
  st.crm = to;
  st.crmSince = state.day;
  st.history.push({ day: state.day, from, to, planned, hours: cost.hours, usd: cost.usd, lost });
  if (st.rox && !ROX.crms.includes(to)) { stopRox(state); notify(state, 'Rox only syncs with HubSpot or Salesforce: it was switched off.', { type: 'warn', app: 'crm' }); }
  return { hours: cost.hours, usd: cost.usd, lost };
}

/** Migration pressure on a light-reporting CRM, 0..1, from ARR (gtm §8). */
export function migrationPressure(state, arr = arrOf(state)) {
  const v = crmVendor(state);
  if (!['none', 'light'].includes(v.reporting)) return { level: 0, reasons: [] };
  if (arr < MIGRATION.pressureFromArr) return { level: 0, reasons: [] };
  const level = Math.max(0.1, clamp((arr - MIGRATION.pressureFromArr) / (MIGRATION.pressureFullArr - MIGRATION.pressureFromArr), 0, 1));
  const reasons = level > 0 ? ['board-level reporting (cohorts, forecast, attribution) is built by hand in spreadsheets', v.marketing === 'none' ? 'no marketing automation: nurture and attribution live in another tool' : null].filter(Boolean) : [];
  return { level, reasons };
}

// ---------------------------------------------------------------------------
// Rox
// ---------------------------------------------------------------------------
export function startRox(state, plan = 'individual') {
  const st = ensureStack(state);
  const P = ROX.plans[plan];
  if (!P) throw new Error('Unknown Rox plan');
  if (!ROX.crms.includes(st.crm)) throw new Error('Rox is an agent layer that syncs with HubSpot or Salesforce. Pick one of those CRMs first.');
  setRecurring(state, 'rox', 'Rox', P.monthly, P.label);
  st.rox = { plan, since: state.day, month: state.day, actions: 0 };
  if (plan === 'teams' && sellerCount(state) < ROX.teamMinSellers) logMistake(state, { functionId: 'deal_management', id: 'rox_teams_solo', label: 'Rox Teams without a team', app: 'crm', key: 'roxteams', cost: { usd: (ROX.plans.teams.monthly - ROX.plans.individual.monthly) * 3 }, detail: 'Teams adds unlimited seats and writeback for 3+ sellers; one founder pays $155/mo more for seats nobody uses. Individual plus a weekly copy into the CRM is enough, or wait for reps.' });
  return { hours: 1.5 };
}
export function stopRox(state) {
  const st = ensureStack(state);
  setRecurring(state, 'rox', 'Rox', 0, 'Rox');
  st.rox = null;
}
/** Hours to research an account: Rox briefs it if actions remain this month, else the manual 15 minutes. */
export function researchHours(state, manual = 0.25) {
  const r = ensureStack(state).rox;
  if (!r) return manual;
  const left = ROX.plans[r.plan].actions - r.actions;
  return left >= 100 ? ROX.researchHours : manual;
}
export function useRoxResearch(state) {
  const r = ensureStack(state).rox;
  if (r && ROX.plans[r.plan].actions - r.actions >= 100) { r.actions += 100; ensureStack(state).stats.roxActions += 100; return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Routing and signals
// ---------------------------------------------------------------------------
export function setRouting(state, id) {
  const R = ROUTING[id];
  if (!R) throw new Error('Unknown routing option');
  const st = ensureStack(state);
  st.routing = id;
  st.routingSince = state.day;
  setRecurring(state, 'routing', R.label.split(' (')[0], R.monthly(inboundPerMonth(state), sellerCount(state)), R.label);
  return { hours: R.setupHours };
}
export function setSignals(state, id) {
  const S = SIGNALS_VENDORS[id];
  if (!S) throw new Error('Unknown signal tool');
  const st = ensureStack(state);
  st.signals = id;
  st.signalsSince = state.day;
  st.signalCredits = { month: state.day, used: 0 };
  setRecurring(state, 'signals', S.label.split(' (')[0], S.monthly, S.label);
  return { hours: S.setupHours ?? 0 };
}

const fitOf = (state, q) => companyById(state, q.companyId)?.inboundFit ?? companyById(state, q.companyId)?.prospect?.fit ?? 0.5;

/** Daily: route today's new inbound leads; untriaged leads go cold. */
function routeDay(state, st) {
  const crm = ensureCrm(state);
  const R = ROUTING[st.routing] ?? ROUTING.none;
  for (const q of crm.inboundQueue) {
    if (q.status !== 'new') continue;
    if (!q.routed && st.routing !== 'none' && q.day >= (st.routingSince ?? 0)) {
      q.routed = true;
      const fit = fitOf(state, q);
      if (R.qualifies && fit < 0.3) { q.status = 'dismissed'; q.autoDismissed = true; st.stats.autoDismissed++; const c = contactById(state, q.contactId); if (c) c.status = 'disqualified'; continue; }
      const p = R.book * (R.followUp ? 1.15 : 1);
      if (u(`${q.id}|book`) < p) {
        const c = contactById(state, q.contactId);
        const slot = c ? nextSlot(state, { minLead: 1, seed: c.id }) : null;
        if (slot) {
          createMeeting(state, { contactId: c.id, slot, source: 'inbound' });
          c.status = 'meeting';
          q.status = 'booked';
          st.stats.routedBooked++;
          if (fit < 0.3) addActivity(state, { type: 'note', text: 'Booked from the form with no qualification: probably not a buyer', companyId: q.companyId, contactId: q.contactId });
          continue;
        }
      }
    }
    if (state.day - q.day > SPEED.coldAfterDays && !q.coldChecked) {
      q.coldChecked = true;
      if (u(`${q.id}|cold`) < SPEED.coldShare * (R.followUp ? 0.3 : 1)) { q.cold = true; st.stats.wentCold++; }
    }
  }
}

/** Weekly: signal plays turn identified visitors into outreach (needs inbound volume and a defined ICP). */
function signalsWeek(state, st) {
  const S = SIGNALS_VENDORS[st.signals];
  if (!S || st.signals === 'none') return;
  if (state.day - (st.signalCredits?.month ?? 0) >= 30) st.signalCredits = { month: state.day, used: 0 };
  const visitors = (inboundPerMonth(state) / 4.3) * S.visitorsPerLead;
  const icpSharp = String(state.company.icp ?? '').trim().split(/\s+/).length >= 6;
  let plays = Math.floor(visitors * (icpSharp ? 0.5 : 0.25));
  if (Number.isFinite(S.credits)) {
    const left = Math.max(0, S.credits - st.signalCredits.used);
    plays = Math.min(plays, Math.floor(left / S.creditsPerPlay));
    // Broad ICPs burn credits on accounts that never match (credit burn complaints, gtm §4) [design].
    st.signalCredits.used += plays * S.creditsPerPlay * (icpSharp ? 1 : 2);
  }
  st.stats.playsSent += plays;
  const p = S.playReply * (icpSharp ? 1 : 0.4);
  for (let i = 0; i < plays; i++) {
    if (rng(state) >= p) continue;
    const person = syntheticPerson(state);
    try {
      const { contact } = addContact(state, { fullName: person.name, email: person.email, company: person.company, title: 'Head of Operations', notes: `Signal play (${S.label.split(' (')[0]}): visited pricing, matched ICP` }, { source: 'signal', status: 'interested', warm: true });
      ensureDeal(state, { companyId: contact.companyId, contactId: contact.id, source: 'signal', stage: 'replied' });
      st.stats.signalLeads++;
    } catch { /* duplicate synthetic email */ }
  }
}

// ---------------------------------------------------------------------------
// Weekly upkeep, hygiene, waste checks
// ---------------------------------------------------------------------------
function chargeWeekly(state, h, label) {
  const f = state.founder;
  if (!f || h <= 0) return true;
  const left = (f.hoursPerWeek ?? 40) - (f.hoursUsed ?? 0);
  if (left < h) return false;
  f.hoursUsed = (f.hoursUsed ?? 0) + h;
  (f.timeLog ??= []).push({ day: state.day, hours: round2(h), label });
  return true;
}

/** Weekly CRM upkeep hours for the current vendor and pipeline. */
export function upkeepHours(state, { arr = arrOf(state) } = {}) {
  const st = ensureStack(state);
  const v = crmVendor(state);
  const n = openDeals(state).length;
  if (n < 3 && st.crm == null) return { total: 0, parts: {} };
  const parts = { entry: v.entryPerDeal * n, admin: v.adminWeekly };
  if (v.capture === 'ai' && st.reviewAi) parts.review = v.reviewWeekly;
  if (needsCustomObjects(state) && !v.customObjects) parts.workarounds = 1; // properties-on-deals workaround for a missing object [design]
  if (st.rox) { parts.rox = -Math.min(parts.entry * 0.6, ROX.savedPerDealWeek * n); if (!ROX.plans[st.rox.plan].writeback) parts.roxCopy = ROX.doubleEntryPerDeal * n; }
  const mp = migrationPressure(state, arr);
  if (mp.level > 0) parts.reporting = MIGRATION.reportingHours[0] + (MIGRATION.reportingHours[1] - MIGRATION.reportingHours[0]) * mp.level;
  if (st.migration && state.day < st.migration.dualRunUntil) parts.dualRun = 2;
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total: round2(Math.max(0, total)), parts };
}

export function stackWeek(state, { arr = arrOf(state) } = {}) {
  const st = ensureStack(state);
  const v = crmVendor(state);
  const up = upkeepHours(state, { arr });
  const paid = chargeWeekly(state, up.total, 'CRM upkeep');
  if (up.parts.reporting) st.stats.reportingHours += up.parts.reporting;
  const ceiling = v.ceiling - 0.15 * migrationPressure(state, arr).level;
  if (paid) st.hygiene = clamp(st.hygiene + (ceiling - st.hygiene) * 0.3, 0, 1);
  else { st.hygiene = clamp(st.hygiene - 0.1, 0, 1); st.stats.upkeepUnpaid++; }
  // AI-written updates: some are wrong; unreviewed ones land on deals and lower their close odds (notesCloseMult).
  if (v.capture === 'ai') {
    for (const d of openDeals(state)) {
      if (u(`${d.id}|ai|${state.day}`) < v.aiWrong) {
        if (st.reviewAi) continue; // caught in the weekly review
        d.wrongFacts = (d.wrongFacts ?? 0) + 1;
        logMistake(state, { functionId: 'deal_management', id: 'unreviewed_ai_crm', label: 'Unreviewed AI CRM update', app: 'crm', key: `aicrm:${d.id}`, delayed: true, cost: { customers: 0.05 }, detail: `The AI-native CRM wrote a wrong stage/next step on ${d.name}; nobody checked it. Review the AI's updates weekly (~30 min).` });
      }
    }
  }
  // Rox monthly action allowance.
  if (st.rox) {
    if (state.day - st.rox.month >= 30) { st.rox.month = state.day; st.rox.actions = 0; }
    const accounts = new Set(openDeals(state).map((d) => d.companyId)).size;
    const want = accounts * ROX.actionsPerAccountWeek;
    const cap = ROX.plans[st.rox.plan].actions - st.rox.actions;
    st.rox.actions += Math.min(want, Math.max(0, cap));
    st.stats.roxActions += Math.min(want, Math.max(0, cap));
    if (want > cap) st.stats.roxCapped++;
  }
  // HubSpot seat/contact tier: re-price the bill as the database grows.
  if (v.vendor === 'HubSpot' && st.recurring.crm) {
    const r = state.recurring.find((x) => x.id === st.recurring.crm);
    const now = crmMonthly(state, st.crm);
    if (r && r.amount < now) { notify(state, `HubSpot: your marketing contacts moved you to a higher tier (${'$'}${now}/mo).`, { type: 'warn', app: 'crm' }); r.amount = now; }
  }
  if (st.routing !== 'none' && ROUTING[st.routing].qualifies && st.recurring.routing) {
    const r = state.recurring.find((x) => x.id === st.recurring.routing);
    if (r) r.amount = ROUTING[st.routing].monthly(inboundPerMonth(state), sellerCount(state));
  }
  signalsWeek(state, st);
  wasteChecks(state, st, arr);
}

function wasteChecks(state, st, arr) {
  const n = inboundPerMonth(state);
  const since = (d) => state.day - (d ?? state.day);
  const R = ROUTING[st.routing];
  if (['default', 'chilipiper'].includes(st.routing) && since(st.routingSince) >= 56 && n < INBOUND_GATE) {
    st.stats.wastedTools++;
    logMistake(state, { functionId: 'deal_management', id: 'routing_below_volume', label: `${R.label.split(' (')[0]} below 100 inbound leads a month`, app: 'crm', key: `routewaste:${st.routing}:${Math.floor(state.day / 90)}`, cost: { usd: round2(recurringAmount(state, 'routing') * 2) }, detail: `${n} inbound leads in the last 30 days. Routing platforms pay off at 100+ leads a month with someone to take the meetings; below that a form plus a Calendly link books the same calls (gtm §5).` });
  }
  if (st.signals === 'unify' && since(st.signalsSince) >= 56 && (n < INBOUND_GATE || arr < 2e6)) {
    st.stats.wastedTools++;
    logMistake(state, { functionId: 'prospecting', id: 'signals_below_volume', label: 'Unify before there is volume', app: 'crm', key: `unifywaste:${Math.floor(state.day / 90)}`, cost: { usd: SIGNALS_VENDORS.unify.monthly * 2 }, detail: `Signal plays need site traffic and a defined ICP; with ${n} inbound leads a month they find a handful of accounts and burn credits. Fits $2M+ ARR (gtm §4). Cheaper path: Clay signals plus Apollo sequences, or RB2B free.` });
  }
  if (st.zoominfo && arr < 2e6 && !st.zoominfo.flagged) {
    st.zoominfo.flagged = true;
    logMistake(state, { functionId: 'prospecting', id: 'zoominfo_startup', label: 'Signed ZoomInfo as a startup', app: 'crm', key: 'zoominfo', cost: { usd: OUTDATED.zoominfo.annual }, detail: OUTDATED.zoominfo.note });
  }
  const mp = migrationPressure(state, arr);
  if (mp.level >= 0.5) logMistake(state, { functionId: 'deal_management', id: 'outgrew_crm', label: 'Outgrew a light CRM', app: 'crm', key: `outgrew:${st.crm}`, delayed: true, cost: { hours: 12 }, detail: `At ${money(arr)} ARR the forecast, attribution and cohort reports are rebuilt by hand every week. Plan the move to HubSpot Pro or Salesforce once pressure shows around $5M ARR (gtm §8).` });
}

/** Close-odds multiplier from CRM data hygiene: stale or missing data means missed follow-ups [design]. */
export const stackCloseMult = (state) => (state.apps.crm?.stack ? 1 + 0.1 * (clamp(state.apps.crm.stack.hygiene ?? 0.7, 0, 1) - 0.7) : 1);

/** Daily hook (called from the CRM app's onDay). */
export function stackDay(state) {
  if (!state.apps.crm?.stack && !(state.apps.crm?.deals?.length > 2)) return; // nothing to keep up yet
  const st = ensureStack(state);
  routeDay(state, st);
  if (dayOfWeek(state) === 1 && st.lastWeek !== state.day) { st.lastWeek = state.day; stackWeek(state); }
}

// ---------------------------------------------------------------------------
// ZoomInfo (outdated for startups): annual contract, 3 seats, auto-renewal uplift
// ---------------------------------------------------------------------------
export function signZoomInfo(state) {
  const st = ensureStack(state);
  if (st.zoominfo) return st.zoominfo;
  post(state, { amount: -OUTDATED.zoominfo.annual, counterparty: 'ZoomInfo', description: 'Annual contract (3 seats, prepaid)', category: 'software', method: 'card' });
  st.zoominfo = { day: state.day, renewalDay: state.day + 365, price: OUTDATED.zoominfo.annual, flagged: false };
  wasteChecks(state, st, arrOf(state));
  return st.zoominfo;
}

// ---------------------------------------------------------------------------
// Local-business lists
// ---------------------------------------------------------------------------
export function localFit(state) {
  const segs = icpSegments(state);
  return segs.length ? segs.filter((s) => LOCAL_SEGMENTS.includes(s.id)).length / segs.length : 0;
}
export function setLocalSource(state, id) {
  const src = LOCAL_SOURCES[id];
  if (!src) throw new Error('Unknown source');
  const st = ensureStack(state);
  st.local.source = id;
  setRecurring(state, 'local', src.label.split(' (')[0], src.monthly, src.label);
  return { hours: 0.25 };
}

/** Build a list (rows are hash-seeded; hidden truth: closed, wrong owner). Returns { list, hours }. */
export function buildLocalList(state, { size = 100, category = 'local businesses', radius = 15 } = {}) {
  const st = ensureStack(state);
  const id = st.local.source ?? 'maps';
  const src = LOCAL_SOURCES[id];
  const list = { id: uid('llist'), source: id, day: state.day, category, radius, size, rows: [], worked: 0 };
  for (let i = 0; i < size; i++) {
    const k = `${list.id}|${i}`;
    list.rows.push({ i, owner: u(`${k}|o`) < src.owner, phone: u(`${k}|p`) < src.phone, email: u(`${k}|e`) < src.email, social: u(`${k}|s`) < src.social, st: 'new' });
  }
  st.local.lists.push(list);
  if (st.local.lists.length > 12) st.local.lists.shift();
  const fit = localFit(state);
  if (fit < 0.3) logMistake(state, { functionId: 'prospecting', id: 'local_list_wrong_icp', label: 'Local-business list for a non-local ICP', app: 'crm', key: `localicp:${list.id}`, cost: { usd: src.monthly, hours: src.buildBase }, detail: 'Your ICP is not a local business: a maps-style list returns shops and clinics that will never buy. Use Apollo or Clay for companies like yours.' });
  return { list, hours: round2(src.buildBase + src.buildPerRow * size) };
}

/** Hidden truth for a row at a given day: closed or wrong owner grows with the list's age. */
export function rowTruth(list, row, day) {
  const src = LOCAL_SOURCES[list.source];
  const months = Math.max(0, day - list.day) / 30;
  const k = `${list.id}|${row.i}`;
  return {
    closed: u(`${k}|c`) < src.closed + STALE.closedPerMonth * months,
    wrongOwner: row.owner && u(`${k}|w`) < src.wrongOwner + STALE.wrongOwnerPerMonth * months,
  };
}

/** Founder hours to work the next n rows (charged up front; wrong-owner loops come on top inside the result). */
export function workEstimate(state, listId, { channel = 'phone', verify = false, n = 20 } = {}) {
  const list = ensureStack(state).local.lists.find((l) => l.id === listId);
  const ch = LOCAL_CHANNELS[channel];
  if (!list || !ch) return 0;
  return round2(list.rows.filter((x) => x.st === 'new').slice(0, n).reduce((a, row) => a + (ch.needs && !row[ch.needs] ? LOCAL_HOURS.skip : ch.hours + (verify ? LOCAL_HOURS.verify : 0)), 0));
}

/**
 * Work n untouched rows of a list on one channel. verify: check the listing first (recent reviews, hours, owner
 * on the site), which catches most closed businesses and many wrong owners. Returns a result with hours.
 */
export function workLocalList(state, listId, { channel = 'phone', verify = false, n = 20 } = {}) {
  const st = ensureStack(state);
  const list = st.local.lists.find((l) => l.id === listId);
  if (!list) throw new Error('List not found');
  const ch = LOCAL_CHANNELS[channel];
  const src = LOCAL_SOURCES[list.source];
  const fit = localFit(state);
  const r = { channel, verify, worked: 0, hours: 0, closedHit: 0, closedCaught: 0, wrongOwnerLoops: 0, conversations: 0, meetings: 0, wastedHours: 0, bounces: 0, skipped: 0 };
  const todo = list.rows.filter((x) => x.st === 'new').slice(0, n);
  for (const row of todo) {
    const t = rowTruth(list, row, state.day);
    const k = `${list.id}|${row.i}|${state.day}`;
    if (ch.needs && !row[ch.needs]) { row.st = 'skipped'; r.skipped++; r.hours += LOCAL_HOURS.skip; continue; }
    let ownerFixed = false;
    if (verify) {
      r.hours += LOCAL_HOURS.verify;
      if (t.closed && u(`${k}|vc`) < 0.9) { row.st = 'closed'; r.closedCaught++; continue; }
      if (t.wrongOwner && u(`${k}|vw`) < 0.6) { ownerFixed = true; r.hours += LOCAL_HOURS.fixOwner; }
    }
    row.st = 'worked';
    r.worked++;
    r.hours += ch.hours;
    if (t.closed) { r.closedHit++; r.wastedHours += ch.hours; if (channel === 'email') r.bounces++; continue; }
    // No owner name on the row (maps scrape): you reach whoever answers and must ask for the owner [design].
    if (rng(state) >= ch.reach * (row.owner || channel === 'walkin' ? 1 : 0.6)) continue;
    if (t.wrongOwner && !ownerFixed && channel !== 'walkin') { r.wrongOwnerLoops++; r.hours += LOCAL_HOURS.wrongOwnerLoop; r.wastedHours += ch.hours + LOCAL_HOURS.wrongOwnerLoop; continue; } // talked to someone who can't buy
    r.conversations++;
    const pMeet = ch.meet * (ch.playbookMult && src.playbook ? ch.playbookMult : 1) * (0.2 + 0.8 * fit) / ch.reach;
    if (rng(state) < Math.min(0.9, pMeet)) {
      r.meetings++;
      const person = syntheticPerson(state);
      try {
        const { contact } = addContact(state, { fullName: person.name, email: row.email ? person.email : '', company: person.company ?? `${list.category} #${row.i}`, title: 'Owner', notes: `Local list (${src.label.split(' (')[0]}) via ${ch.label.toLowerCase()}` }, { source: 'local', status: 'interested', warm: true, allowNoEmail: true });
        const slot = nextSlot(state, { minLead: 1, seed: contact.id });
        if (slot) createMeeting(state, { contactId: contact.id, slot, source: 'outbound' });
        else ensureDeal(state, { companyId: contact.companyId, contactId: contact.id, source: 'outbound', stage: 'replied' });
      } catch { /* synthetic collision */ }
    }
  }
  r.hours = round2(r.hours);
  r.wastedHours = round2(r.wastedHours);
  list.worked += r.worked;
  (list.log ??= []).push({ day: state.day, channel, verify, worked: r.worked, meetings: r.meetings, wasted: r.wastedHours, closed: r.closedHit + r.closedCaught });
  const age = state.day - list.day;
  if (!verify && age >= STALE.staleDays && r.wastedHours >= 0.5) logMistake(state, { functionId: 'prospecting', id: 'stale_local_list', label: 'Worked a stale local list without checking it', app: 'crm', key: `stale:${list.id}`, delayed: true, cost: { hours: r.wastedHours }, detail: `The list is ${age} days old: ${r.closedHit} businesses had closed and ${r.wrongOwnerLoops} times you reached someone who is not the owner. A stellar operator checks the listing (recent reviews, hours, owner name) before dialing.` });
  if (channel === 'email' && r.worked >= 10) logMistake(state, { functionId: 'cold_outreach', id: 'email_first_local', label: 'Cold-emailed local businesses', app: 'crm', key: `localemail:${list.id}`, cost: { reputation: r.bounces > r.worked * 0.05 ? 1 : 0.3 }, detail: `Owners of local businesses rarely read cold email (${r.bounces} bounced from closed businesses). Phone, Facebook/Instagram DMs and walk-ins work for local ICPs (gtm §7). Those rows are now burned.` });
  return r;
}

// ---------------------------------------------------------------------------
// Review and operator read
// ---------------------------------------------------------------------------
/** Issues with the current stack, each with what a stellar operator would do instead. */
export function stackReview(state, { arr = arrOf(state) } = {}) {
  const st = ensureStack(state);
  const out = [];
  const crmId = st.crm ?? 'sheet';
  const f = crmFit(state, crmId, arr);
  if (f.fit < 0.75) out.push({ id: 'crm_fit', severity: 'warn', text: `${CRM_VENDORS[crmId].label} does not fit right now: ${f.reasons.join('; ')}.`, stellar: arr < 2e6 ? 'Attio Free or HubSpot Free until a rep joins; HubSpot Pro when marketing and sales share a funnel; Salesforce at Series B+.' : 'Plan a move to HubSpot Pro or Salesforce with a field map and a month of dual running.' });
  if (st.crm == null && openDeals(state).length >= 5) out.push({ id: 'no_crm', severity: 'warn', text: `You run ${openDeals(state).length} open deals from a spreadsheet: ~${(0.12 * openDeals(state).length).toFixed(1)}h a week of manual logging and decaying data.`, stellar: 'Attio Free captures email and calendar automatically and costs nothing for 3 seats.' });
  const n = inboundPerMonth(state);
  if (['default', 'chilipiper'].includes(st.routing) && n < INBOUND_GATE) out.push({ id: 'routing_waste', severity: 'bad', text: `${ROUTING[st.routing].label.split(' (')[0]} with ${n} inbound leads a month.`, stellar: 'A form plus a Calendly/Cal.com link ($12) until ~100 leads a month and someone to take the meetings.' });
  if (st.routing === 'none' && n >= 30) out.push({ id: 'no_booking', severity: 'warn', text: `${n} inbound leads a month wait in a queue; ${st.stats.wentCold} went cold.`, stellar: 'Put a booking link on the form so ready buyers book themselves the same day.' });
  if (st.signals === 'unify' && (n < INBOUND_GATE || arr < 2e6)) out.push({ id: 'signals_waste', severity: 'bad', text: 'Unify without the traffic or ARR it needs.', stellar: 'RB2B free for site visitors and Clay signals until $2M+ ARR.' });
  if (st.rox && st.rox.plan === 'teams' && sellerCount(state) < ROX.teamMinSellers) out.push({ id: 'rox_teams', severity: 'warn', text: 'Rox Teams for fewer than 3 sellers.', stellar: 'Rox Individual ($100) or none until reps join.' });
  if (st.zoominfo) out.push({ id: 'zoominfo', severity: 'bad', text: `ZoomInfo contract renews on day ${st.zoominfo.renewalDay} at +10-20%.`, stellar: 'Apollo free + Clay Launch cover a startup for a fraction of the price. Cancel before the renewal notice window.' });
  const mp = migrationPressure(state, arr);
  if (mp.level > 0) out.push({ id: 'migration', severity: mp.level >= 0.5 ? 'bad' : 'warn', text: `Migration pressure ${Math.round(mp.level * 100)}%: ${mp.reasons.join('; ')}.`, stellar: 'Plan the move now: field map, dedupe, dual-run 30 days. Late moves cost ~50% more hours.' });
  for (const l of st.local.lists) {
    const age = state.day - l.day;
    if (age >= STALE.staleDays && l.rows.some((r) => r.st === 'new')) out.push({ id: `stale:${l.id}`, severity: 'warn', text: `Local list from ${age} days ago: about ${Math.round((LOCAL_SOURCES[l.source].closed + STALE.closedPerMonth * age / 30) * 100)}% may have closed.`, stellar: 'Check each listing before you dial, or rebuild the list.' });
    const emailed = (l.log ?? []).filter((x) => x.channel === 'email').reduce((a, x) => a + x.worked, 0);
    if (emailed >= 10) out.push({ id: `email_local:${l.id}`, severity: 'warn', text: `${emailed} local businesses cold-emailed.`, stellar: 'Phone and Facebook/Instagram DMs first for local owners.' });
  }
  return out;
}

/** Operator read for the GTM stack (stellar / good / average / mediocre) from what the player chose and did. */
export function stackRead(state, { arr = arrOf(state) } = {}) {
  const st = ensureStack(state);
  const crmId = st.crm ?? 'sheet';
  const fit = crmFit(state, crmId, arr).fit;
  const n = inboundPerMonth(state);
  let waste = 0;
  if (['default', 'chilipiper'].includes(st.routing) && n < INBOUND_GATE) waste++;
  if (st.signals === 'unify' && (n < INBOUND_GATE || arr < 2e6)) waste++;
  if (st.zoominfo && arr < 2e6) waste++;
  if (st.rox?.plan === 'teams' && sellerCount(state) < ROX.teamMinSellers) waste++;
  const logs = st.local.lists.flatMap((l) => (l.log ?? []).map((x) => ({ ...x, age: x.day - l.day })));
  const worked = logs.reduce((a, x) => a + x.worked, 0);
  const goodChannel = worked ? logs.filter((x) => x.channel !== 'email').reduce((a, x) => a + x.worked, 0) / worked : 1;
  const verified = worked ? logs.filter((x) => x.verify || x.age < 30).reduce((a, x) => a + x.worked, 0) / worked : 1;
  const mp = migrationPressure(state, arr).level;
  const migr = st.history.filter((h) => h.from != null);
  const migrationScore = migr.length ? (migr.every((h) => h.planned) ? 1 : 0.2) : mp >= 0.5 ? 0.3 : 1;
  const score = clamp(0.25 * fit + 0.25 * clamp(1 - waste / 2, 0, 1) + 0.1 * clamp((st.hygiene - 0.4) / 0.45, 0, 1) + 0.1 * goodChannel + 0.2 * verified + 0.1 * migrationScore, 0, 1);
  const review = stackReview(state, { arr });
  return {
    tier: tierFromScore(score), score: +score.toFixed(2),
    evidence: [`CRM ${CRM_VENDORS[crmId].label} (fit ${Math.round(fit * 100)}%)`, `${waste} tool(s) bought before they pay`, `data hygiene ${Math.round(st.hygiene * 100)}%`, worked ? `${Math.round(goodChannel * 100)}% of local rows worked by phone/DM, ${Math.round(verified * 100)}% fresh or verified` : 'no local lists worked'],
    coaching: review.map((x) => `${x.text} Stellar: ${x.stellar}`),
  };
}
