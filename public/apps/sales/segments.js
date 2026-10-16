// Buyer segments in the sales sim: who buys, the buying committee, how it is discovered, the methodology that fits,
// segment procurement (card / quote / RFP / board / fiscal year / payment terms), paperwork and scenarios.
// Data and sources: public/data/buyer-segments.js and docs/research/buyer-segments.md. Values marked [design] there
// are game estimates. Pure-ish: functions take state and a rand() so the daily sim stays seeded.
import { BUYER_SEGMENTS, METHODOLOGIES, PAPERWORK, CROSS_SEGMENT, segmentFor, committeeFor, cycleDaysFor, paperworkFor, getSegment, acvBand, NEVER } from '../../data/buyer-segments.js';
import { clamp, dateOf, hash, uid, words } from '../../core/util.js';
import { employeesOf } from './replies.js';

export { BUYER_SEGMENTS, METHODOLOGIES, PAPERWORK, getSegment, acvBand };

export const ROLE_LABEL = {
  economic_buyer: 'Economic buyer', champion: 'Champion', user: 'User', end_user_group: 'User group', owner_spouse: 'Spouse / partner',
  finance: 'Finance', technical: 'IT / technical', security: 'Security', privacy: 'Privacy', legal: 'Legal', procurement: 'Procurement',
  board: 'Board', compliance: 'Compliance', group_ops: 'Group operations', franchisor: 'Franchisor', rollup_corporate: 'Corporate (roll-up)',
  factor: 'Factoring company', customer: 'Shipper customer', safety: 'Safety', risk: 'Risk', dso_hq: 'DSO headquarters', clinical: 'Clinical lead',
  quality: 'Quality', supplier_quality: 'Supplier quality', regulatory: 'Regulatory', partner_committee: 'Partner committee', client: 'Client',
  agency: 'Agency', union: 'Union', revenue: 'Revenue management', franchisee_council: 'Franchisee council', core_provider: 'Core provider',
  carrier: 'Carrier', ot: 'OT / controls', regulator: 'Regulator', accessibility: 'Accessibility', contracting_officer: 'Contracting officer',
  small_business_office: 'Small-business office', special_programs: 'Special programs', grant_compliance: 'Grant compliance',
  children_ministry: "Children's ministry", denomination: 'Denomination',
};
export const roleLabel = (r) => ROLE_LABEL[r] ?? r.replace(/_/g, ' ');
const GATEKEEPERS = new Set(['technical', 'security', 'privacy', 'legal', 'procurement', 'board', 'compliance', 'finance', 'partner_committee', 'franchisee_council', 'quality', 'supplier_quality', 'regulatory', 'accessibility', 'contracting_officer', 'core_provider', 'ot', 'union', 'risk', 'safety', 'franchisor', 'rollup_corporate', 'dso_hq', 'group_ops', 'denomination', 'grant_compliance']);

// ---------------------------------------------------------------------------
// Segment of a company
// ---------------------------------------------------------------------------

/** The company's segment id, auto-mapped from industry/name/size unless the player set it. */
export function segmentIdOf(state, company) {
  if (!company) return null;
  if (company.segmentManual && company.segmentId) return company.segmentId;
  const model = state.company.model === 'ent' ? 'ent' : 'smb';
  const key = `${company.industry}|${company.size}|${company.name}|${company.research?.industry ?? ''}`;
  if (company.segmentId && company.segmentKey === key) return company.segmentId;
  const text = [company.industry, company.research?.industry, company.research?.summary, company.site?.title, company.site?.description].filter(Boolean).join(' ');
  company.segmentId = segmentFor({ industry: text, employees: employeesOf(company, model), name: company.name, model });
  company.segmentKey = key;
  return company.segmentId;
}
export const segmentOf = (state, company) => getSegment(segmentIdOf(state, company));

/** Segments that fit the founder's ICP (keyword match on ICP + one-liner), else size defaults by model. */
export function icpSegments(state) {
  const text = ` ${state.company.icp ?? ''} ${state.company.oneLiner ?? ''} `.toLowerCase();
  const model = state.company.model === 'ent' ? 'ent' : 'smb';
  const hits = BUYER_SEGMENTS.filter((s) => s.keywords.some((k) => text.includes(k.toLowerCase())));
  if (hits.length) return hits;
  return BUYER_SEGMENTS.filter((s) => (model === 'ent' ? ['mid_market', 'enterprise'] : ['startup_smb', 'retail_shops', 'trades', 'agencies', 'health_practices']).includes(s.id));
}

/** Give a synthetic prospect's company a segment that fits the ICP (industry example + plausible size). */
export function assignIcpSegment(state, company, rand) {
  const segs = icpSegments(state);
  const seg = segs[Math.floor(rand() * segs.length)];
  company.industry ||= seg.examples[Math.floor(rand() * seg.examples.length)] ?? seg.label;
  const [lo, hi] = seg.employees;
  const emp = Math.round(Math.exp(Math.log(Math.max(1, lo)) + (Math.log(Math.max(lo + 1, Math.min(hi, lo * 50))) - Math.log(Math.max(1, lo))) * rand()));
  company.size ||= String(emp);
  company.employees = emp;
  company.segmentId = seg.id;
  company.segmentKey = `${company.industry}|${company.size}|${company.name}|`;
  return seg;
}

// ---------------------------------------------------------------------------
// Methodology
// ---------------------------------------------------------------------------

/**
 * Methodology for a deal: BANT for small single-decision-maker deals (owner-run, < $5k, ≤ 2 people), otherwise
 * the segment's primary method (value selling for owner-led, MEDDPICC for enterprise/regulated/public…).
 */
export function methodFor(seg, acv, committeeSize = 1) {
  let id = seg?.methodology?.primary ?? 'meddicc';
  if (seg?.group === 'owner_smb' && acv < 5000 && committeeSize <= 2) id = 'bant';
  const m = METHODOLOGIES[id] ?? METHODOLOGIES.meddicc;
  const ids = m.elements.map((e) => e.id);
  let critical = (seg?.methodology?.critical ?? []).filter((c) => ids.includes(c));
  if (id === 'bant') critical = ['need', 'authority'];
  if (!critical.length) critical = ids.slice(0, 2);
  return { id, label: m.label, critical, elements: m.elements };
}

// Scorecard flags → methodology element ids (where a direct mapping exists).
const FLAG_MAP = {
  metrics: ['metrics', 'implication', 'gap', 'value', 'budget'],
  economicBuyer: ['economicBuyer', 'authority', 'power', 'decision'],
  decisionCriteria: ['decisionCriteria', 'requiredCapabilities'],
  decisionProcess: ['decisionProcess', 'timeline', 'decision', 'control', 'takeControl'],
  paperProcess: ['paperProcess'],
  pain: ['pain', 'need', 'problem', 'painFunnel', 'rootCause', 'currentState'],
  champion: ['champion'],
  competition: ['competition', 'differentiators'],
};
const STOP = new Set(['what', 'when', 'where', 'which', 'would', 'does', 'this', 'that', 'with', 'your', 'have', 'from', 'they', 'them', 'there', 'about', 'today', 'need', 'else', 'besides', 'than', 'were', 'will']);
const toks = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOP.has(t));

/** Element ids a call revealed: scorecard flags (incl. LLM methodElements) plus probe-question overlap with the founder's questions. */
export function methodKnownFromCall(method, card, transcript = []) {
  const known = new Set();
  const flags = { ...(card?.meddicc ?? {}) };
  if (card?.competitiveHandling && card.competitiveHandling !== 'not_raised') flags.competition = true;
  for (const [flag, els] of Object.entries(FLAG_MAP)) if (flags[flag]) for (const e of els) known.add(e);
  for (const [k, v] of Object.entries(card?.methodElements ?? {})) if (v) known.add(k);
  const asked = transcript.filter((t) => t.from === 'me' && /\?/.test(t.text)).map((t) => new Set(toks(t.text)));
  for (const el of method.elements) {
    const probe = new Set(el.probeQuestions.flatMap(toks));
    if (asked.some((q) => [...q].filter((t) => probe.has(t)).length >= 2)) known.add(el.id);
  }
  if (card?.nextStepSecured) { known.add('mutualPlan'); known.add('takeControl'); known.add('control'); }
  if ((card?.questionsAsked ?? 0) >= 2) known.add('situation');
  if (flags.pain && flags.metrics) { known.add('buyerValidated'); known.add('needPayoff'); }
  if (transcript.some((t) => t.from === 'me' && /\b(price|cost|per month|invest|roi)\b/i.test(t.text))) known.add('priceAnchor');
  return [...known].filter((id) => method.elements.some((e) => e.id === id));
}

export function methodCoverage(deal) {
  const m = deal.method;
  if (!m) return null;
  const k = m.known ?? {};
  return { all: m.elements.filter((e) => k[e.id] != null).length / m.elements.length, critical: m.critical.filter((c) => k[c] != null).length / Math.max(1, m.critical.length) };
}

// ---------------------------------------------------------------------------
// Buying committee
// ---------------------------------------------------------------------------

const FIRST = ['Maria', 'James', 'Linda', 'Robert', 'Jennifer', 'Michael', 'Patricia', 'David', 'Elena', 'Carlos', 'Aisha', 'Wei', 'Priya', 'Tom', 'Grace', 'Omar', 'Rachel', 'Luis', 'Hannah', 'Kevin', 'Fatima', 'Jordan', 'Nina', 'Sean'];
const LAST = ['Garcia', 'Johnson', 'Nguyen', 'Brown', 'Patel', 'Miller', 'Lopez', 'Wilson', 'Kim', 'Okafor', 'Rossi', 'Hughes', 'Cohen', 'Silva', 'Murphy', 'Ahmed', 'Baker', 'Reyes', 'Fischer', 'Tanaka'];

// Hidden stance by role [design]: champions lean in, gatekeepers default to cautious, some oppose.
function rollStance(role, rand) {
  const t = role === 'champion' ? [0.8, 1] : role === 'economic_buyer' ? [0.3, 0.85] : role === 'user' || role === 'end_user_group' ? [0.45, 0.85] : GATEKEEPERS.has(role) ? [0.15, 0.75] : [0.3, 0.8];
  const u = rand();
  return u < t[0] ? 'support' : u < t[1] ? 'neutral' : 'oppose';
}

/** Role the first contact plays: owners/execs are the economic buyer, otherwise champion (or user). */
export function primaryRoleFor(title, committee) {
  if (/\b(owner|founder|ceo|president|principal|proprietor|managing (partner|director)|superintendent|pastor|executive director|cfo|coo)\b/i.test(title ?? '')) return 'economic_buyer';
  if (committee.some((m) => m.role === 'champion')) return 'champion';
  return committee.some((m) => m.role === 'user') ? 'user' : 'economic_buyer';
}

/**
 * Sample the committee for a deal into CRM contacts. The first contact takes one role; everyone else is a hidden
 * contact until discovered. Returns the committee summary stored on the deal.
 */
export function buildCommittee(state, deal, { company, primary, acv, rand, addContact }) {
  const seg = segmentOf(state, company);
  if (!seg) return null;
  const sampled = committeeFor(seg.id, acv, rand);
  const role = primaryRoleFor(primary?.title, sampled);
  const idx = sampled.findIndex((m) => m.role === role);
  const primaryDef = idx >= 0 ? sampled.splice(idx, 1)[0] : { role, title: primary?.title || roleLabel(role), influence: role === 'economic_buyer' ? 0.9 : 0.5, canBlock: true, concerns: [], headcount: 1 };
  const buyerIsUser = rand() < (seg.buyerIsUserProb ?? 0.3);
  // Owner-run businesses decide with 1–3 people (owner, maybe the spouse or office manager), whatever the price.
  if (seg.group === 'owner_smb') {
    const keep = sampled.filter((m) => m.influence >= 0.35).sort((a, b) => b.influence - a.influence).slice(0, primary ? 2 : 3);
    sampled.length = 0;
    sampled.push(...keep);
  }
  const members = [];
  if (primary) {
    primary.committee = { dealId: deal.id, role, influence: primaryDef.influence, canBlock: primaryDef.canBlock, concerns: primaryDef.concerns ?? [], stance: primary.replyKind === 'interested' || primary.warm ? 'support' : rollStance(role, rand), engaged: deal.callQuality != null, addressed: false, discovered: true, primary: true };
    members.push(primary.id);
  }
  for (const m of sampled) {
    if (buyerIsUser && (m.role === 'user') && role === 'economic_buyer') continue; // the buyer is the user
    const c = newMember(state, company, m, rand, addContact);
    if (c) members.push(c.id);
  }
  for (const id of members) { const c = state.apps.crm.contacts.find((x) => x.id === id); if (c?.committee) c.committee.dealId = deal.id; }
  return { segmentId: seg.id, acv, members, buyerIsUser: buyerIsUser && role === 'economic_buyer', sampledDay: state.day };
}

function newMember(state, company, m, rand, addContact) {
  const domain = company.domain || `${String(company.name || 'company').toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
  const first = FIRST[Math.floor(rand() * FIRST.length)], last = LAST[Math.floor(rand() * LAST.length)];
  let contact;
  try {
    contact = addContact(state, { firstName: first, lastName: last, email: `${first}.${last}.${hash(uid('c')).slice(0, 4)}@${domain}`.toLowerCase(), title: m.title, company: company.name, domain: company.domain }, { source: 'committee', status: 'new' }).contact;
  } catch { return null; }
  contact.hidden = true;
  contact.verification = contact.truth;
  contact.committee = { dealId: null, role: m.role, influence: m.influence, canBlock: m.canBlock, concerns: m.concerns ?? [], stance: rollStance(m.role, rand), engaged: false, addressed: false, discovered: false, headcount: m.headcount ?? 1 };
  return contact;
}

/** Add hidden members for these role definitions ({ role, title, influence, canBlock, concerns }) to a deal. */
export function addMembers(state, deal, company, defs, rand, addContact) {
  const added = [];
  for (const d of defs) {
    const c = newMember(state, company, d, rand, addContact);
    if (!c) continue;
    c.committee.dealId = deal.id;
    deal.committee.members.push(c.id);
    added.push(c);
  }
  return added;
}
/** A committee role definition from the segment data as a single member. */
export const roleDef = (seg, role) => { const r = seg.committee.find((x) => x.role === role); return r ? { role, title: r.titles[0], influence: r.influence, canBlock: r.canBlock, concerns: r.concerns } : null; };

export const committeeContacts = (state, deal) => (deal.committee?.members ?? []).map((id) => state.apps.crm.contacts.find((c) => c.id === id)).filter((c) => c?.committee);

// Questions that surface roles [design]: who signs / decision process / security / legal / procurement / board / finance / users.
const REVEAL = [
  [/\b(who (else|signs|approves|decides|has to)|decision process|walk me through|how do you (buy|decide|usually buy)|sign(s)? off|final say)\b/i, ['economic_buyer', 'board', 'partner_committee', 'owner_spouse', 'group_ops', 'franchisor', 'rollup_corporate', 'dso_hq']],
  [/\b(security|it (team|department)|data|privacy|soc ?2|questionnaire|integration|systems?)\b/i, ['technical', 'security', 'privacy', 'compliance', 'ot', 'core_provider']],
  [/\b(legal|contract|lawyer|msa|counsel|terms)\b/i, ['legal']],
  [/\b(procurement|purchasing|vendor (onboarding|portal|list|approval)|rfp|bid|purchase order|\bpo\b|co-?op)\b/i, ['procurement', 'contracting_officer', 'small_business_office']],
  [/\b(board|council|committee|trustees|partners|elders|union)\b/i, ['board', 'partner_committee', 'franchisee_council', 'union', 'denomination']],
  [/\b(finance|cfo|bookkeeper|accountant|budget|controller)\b/i, ['finance', 'economic_buyer', 'grant_compliance']],
  [/\b(team|staff|users?|who (will )?use|day[- ]to[- ]day|front desk|technicians?|teachers?|nurses?|drivers?)\b/i, ['user', 'end_user_group', 'champion', 'clinical', 'special_programs']],
  [/\b(spouse|wife|husband|partner at home)\b/i, ['owner_spouse']],
  [/\b(quality|compliance|regulat|audit)\b/i, ['quality', 'supplier_quality', 'regulatory', 'compliance', 'safety', 'risk']],
];

/** Reveal committee members whose roles the founder asked about on a call. Returns the newly discovered contacts. */
export function revealFromTranscript(state, deal, transcript = []) {
  const qs = transcript.filter((t) => t.from === 'me').map((t) => t.text).join(' \n ');
  const hidden = committeeContacts(state, deal).filter((c) => c.hidden);
  const out = [];
  for (const [rx, roles] of REVEAL) {
    if (!rx.test(qs)) continue;
    for (const c of hidden) if (roles.includes(c.committee.role) && !out.includes(c)) out.push(c);
  }
  for (const c of out) { c.hidden = false; c.committee.discovered = true; }
  return out;
}

export function revealMember(contact) {
  contact.hidden = false;
  contact.committee.discovered = true;
}

/** After a held call with a member: engaged; a good call can move their stance one step (addressed). */
export function engageMember(contact, quality, rand) {
  const cm = contact.committee;
  if (!cm) return;
  cm.engaged = true;
  if (quality >= 0.45 && rand() < 0.6 + 0.4 * quality) {
    cm.stance = cm.stance === 'oppose' ? 'neutral' : 'support';
    cm.addressed = true;
  }
}

// ---------------------------------------------------------------------------
// Close-odds effects of the committee and methodology
// ---------------------------------------------------------------------------

/** Opposing members who can actually stop this purchase (low-influence users don't block small owner decisions). */
export function activeBlockers(members, acv) {
  return members.filter((c) => c.committee.canBlock && c.committee.stance === 'oppose' && !c.committee.addressed && c.committee.stance !== 'left' && (c.committee.influence >= 0.5 || acv >= 5000));
}

/**
 * Multiplier on close probability from coverage: multithreading (CROSS_SEGMENT.multithreadWinLift), economic-buyer
 * access, champion strength, canBlock members not engaged, and the methodology's critical elements.
 * Opposing blockers are handled separately (they can kill or stall the deal) → { mult, blockers, notes }.
 */
export function committeeEffect(state, deal) {
  const members = committeeContacts(state, deal).filter((c) => c.committee.stance !== 'left');
  if (!members.length) return { mult: 1, blockers: [], notes: [] };
  const notes = [];
  const size = members.length;
  const engaged = members.filter((c) => c.committee.engaged);
  const table = CROSS_SEGMENT.multithreadWinLift.simWinMultByContacts;
  const acv = deal.amount ?? 0;
  // The multithreading lift is measured on $50k+ deals (Gong); small owner-led purchases are decided by one person.
  const weight = acv < 5000 ? 0.15 : acv < 25000 ? 0.5 : 1;
  const raw = size <= 2 ? (engaged.length ? 1 : 0.7) : engaged.length === 0 ? 0.6 : table[Math.min(4, engaged.length)];
  let m = 1 + (raw - 1) * (engaged.length === 0 ? 1 : weight);
  if (size > 2 && engaged.length <= 1 && acv >= 5000) notes.push('Single-threaded');
  const eb = members.find((c) => c.committee.role === 'economic_buyer');
  if (eb && !eb.committee.engaged && acv >= 5000) { m *= acv >= 25000 ? 0.45 : 0.65; notes.push('No access to the economic buyer'); }
  const champ = members.find((c) => c.committee.role === 'champion');
  if (deal.championLost && !members.some((c) => c.committee.engaged && c.committee.stance === 'support' && c.committee.role !== 'economic_buyer')) { m *= 0.65; notes.push('Champion left; no second champion'); }
  else if (champ?.committee.engaged && champ.committee.stance === 'support') m *= 1.1;
  for (const c of members) {
    const cm = c.committee;
    if (cm.canBlock && !cm.engaged && cm.stance === 'neutral' && cm.influence >= 0.5 && cm.role !== 'economic_buyer') m *= 1 - 0.12 * cm.influence;
  }
  const cov = methodCoverage(deal);
  if (cov) m *= acv < 5000 ? 0.85 + 0.25 * cov.critical : 0.7 + 0.5 * cov.critical;
  const blockers = activeBlockers(members, acv);
  return { mult: clamp(m, 0.05, 1.6), blockers, notes };
}

// ---------------------------------------------------------------------------
// Procurement, fiscal year, paperwork, scenarios
// ---------------------------------------------------------------------------

/** First game day on/after `fromDay` that falls on day 1 of `month` (1..12). */
export function nextMonthStart(state, fromDay, month) {
  for (let d = fromDay; d < fromDay + 400; d++) { const dt = dateOf(state, d); if (dt.getUTCDate() === 1 && dt.getUTCMonth() + 1 === month) return d; }
  return fromDay;
}
const monthOf = (state, day) => dateOf(state, day).getUTCMonth() + 1;

// Share of deals that were not in this year's budget [design]: public/education budgets are set months ahead.
const UNBUDGETED = { public: 0.6, education: 0.6, regulated: 0.3, health: 0.3, company: 0.2, professional: 0.1, nonprofit: 0.3, owner_smb: 0 };

/**
 * The purchase path for this ACV: card (instant) / quote / forced RFP (unless a co-op contract covers it) / board
 * approval on the next meeting / budget timing (unbudgeted deals wait for the next fiscal year) / PO and net terms.
 */
export function procurementPlan(state, seg, acv, rand, { coopAward = false } = {}) {
  const p = seg.procurement;
  const plan = {
    cardPay: acv <= p.cardLimit, quote: acv >= p.quoteThreshold, rfp: acv >= p.rfpThreshold && !(coopAward && p.coopContracts.length),
    coop: p.coopContracts, board: null, poRequired: p.poRequired, termsDays: p.paymentTermsDays, earliestDecisionDay: null, notes: [],
  };
  if (plan.cardPay) plan.notes.push(`Under their $${p.cardLimit.toLocaleString('en-US')} card limit: they can pay by card.`);
  if (plan.quote && !plan.rfp) plan.notes.push('Needs a formal quote.');
  if (acv >= p.rfpThreshold && !plan.rfp) { plan.viaCoop = true; plan.notes.push('Above the bid threshold, but your co-op contract lets them skip the RFP (the co-op takes its administrative fee on these sales).'); }
  else if (!plan.rfp && !plan.cardPay) plan.notes.push(acv >= p.quoteThreshold ? 'Between the informal-quote and bid thresholds: a quote, no RFP.' : 'Below the informal-quote threshold: a small purchase, no RFP.');
  if (plan.rfp) plan.notes.push(`Above their $${p.rfpThreshold.toLocaleString('en-US')} bid threshold: formal RFP required${p.coopContracts.length ? ` (or a co-op contract: ${p.coopContracts.slice(0, 3).join(', ')})` : ''}.`);
  if (acv >= p.boardApproval.aboveUsd && rand() < p.boardApproval.prob) {
    const meeting = nextMonthStart(state, state.day + 21, monthOf(state, state.day + 21) % 12 + 1) + 10; // next monthly meeting ~mid-month
    plan.board = { day: meeting };
    plan.notes.push(`Needs board/council approval at its meeting around day ${meeting}.`);
  }
  if (!plan.cardPay && rand() < (UNBUDGETED[seg.group] ?? 0.2)) {
    // Not in this year's budget: wait for the next budget window, then the fiscal-year start.
    const setStart = nextMonthStart(state, state.day, p.budgetSetMonths[0]);
    const fy = nextMonthStart(state, setStart, p.fiscalYearStartMonth);
    plan.earliestDecisionDay = fy;
    plan.unbudgeted = true;
    plan.notes.push(`Not budgeted this year: budgets are set in months ${p.budgetSetMonths.join(', ')}; the money arrives when their fiscal year starts (month ${p.fiscalYearStartMonth}).`);
  }
  if (p.paymentTermsDays) plan.notes.push(`Pays by PO/invoice, net-${p.paymentTermsDays}.`);
  return plan;
}

// Company-level assets that make paperwork cheap or unnecessary next time.
const ASSET_FROM_LEGAL = {
  soc2_type1: (L) => ['type1', 'type2'].includes(L?.soc2) || (L?.soc2 === 'type2_in_progress' && (L.soc2Report?.type === 'type1' || (L.compliance?.reports ?? []).some((r) => r.type === 'type1'))), // a Type II window is not a report
  soc2_type2: (L) => L?.soc2 === 'type2' || (L?.soc2 === 'type2_in_progress' && (L.soc2Report?.type === 'type2' || (L.compliance?.reports ?? []).some((r) => r.type === 'type2'))), // renewal: last report still valid
  dpa: (L) => Boolean(L?.dpaReady),
  soc2_bridge_letter: (L) => Boolean(L?.soc2 && L.soc2 !== 'none'), // an audit underway or done covers the letter
};
const ONE_TIME = new Set(['w9', 'coi_insurance', 'vpat', 'soc2_bridge_letter', 'govramp', 'tx_ramp', 'fedramp', 'sam_registration', 'gsa_schedule', 'coop_contract', 'iso27001', 'pen_test', 'pci_attestation', 'ftc_safeguards_wisp', 'bcp_dr_summary', 'child_safety_policy', 'nonprofit_verification', 'csv_validation_package', 'epic_vendor_review']);
export const isCertification = (id) => ['soc2_type1', 'soc2_type2'].includes(id);

const PAYMENTS_PRODUCT = /\b(payments?|pos|point[- ]of[- ]sale|checkout|card (processing|readers?)|merchant services?|payment processing)\b/i;
export const isPaymentsProduct = (state) => PAYMENTS_PRODUCT.test(`${state.company?.oneLiner ?? ''} ${state.company?.icp ?? ''}`);

/**
 * Small owner-run deals (under $5k ACV) rarely come with vendor paperwork [design, sourced from the calibration
 * audit]: a W-9 is asked for on invoiced deals only (a card payment needs none, and owner-run shops cap it at 25%),
 * and a PCI attestation is almost never asked of a product that does not touch card data.
 */
export function smallDealPaperworkProb(state, seg, acv, proc, id, prob) {
  if (acv >= 5000) return prob;
  if (id === 'w9') {
    const card = proc ? proc.cardPay : acv <= (seg.procurement.cardLimit ?? 0);
    if (card) return prob * 0.05;
    return seg.group === 'owner_smb' ? Math.min(prob, 0.25) : prob;
  }
  if (id === 'pci_attestation' && !isPaymentsProduct(state)) return prob * 0.02;
  return prob;
}

/** Paperwork items for a deal, adjusted for what the company already has (Legal SOC 2/DPA, prior deliverables). */
export function dealPaperwork(state, seg, acv, rand, extra = [], proc = null) {
  const items = paperworkFor(seg.id, acv, rand, (id, prob) => smallDealPaperworkProb(state, seg, acv, proc, id, prob));
  for (const id of extra) if (!items.some((x) => x.id === id) && PAPERWORK[id]) {
    const p = PAPERWORK[id];
    items.push({ id, label: p.label, hours: +(p.hours[0] + (p.hours[1] - p.hours[0]) * rand()).toFixed(1), costUsd: Math.round(p.costUsd[0] + (p.costUsd[1] - p.costUsd[0]) * rand()), days: Math.round(p.days[0] + (p.days[1] - p.days[0]) * rand()), ...(p.repeatHours ? { repeatHours: p.repeatHours } : {}) });
  }
  const assets = state.apps.crm?.paperAssets ?? {};
  const L = state.apps.legal;
  return items.map((it) => {
    const have = ASSET_FROM_LEGAL[it.id]?.(L) || (ONE_TIME.has(it.id) && assets[it.id]);
    const reuse = !have && assets[it.id] && it.repeatHours;
    return {
      ...it, progress: 0, status: have ? 'done' : 'open', doneDay: have ? state.day : null, readyDay: have ? state.day : null,
      hours: have ? 0 : reuse ? +it.repeatHours[0].toFixed(1) : it.hours, costUsd: have || reuse ? 0 : it.costUsd, reused: Boolean(have || reuse),
    };
  });
}

/** Scenarios that apply to this deal (rolled once at proposal). */
export function rollScenarios(seg, rand) {
  return seg.scenarios.filter((s) => rand() < s.prob).map((s) => ({ id: s.id, label: s.label, description: s.description, howToHandle: s.howToHandle, effect: s.effect ?? {}, stalled: false }));
}

/** Persona voice for a committee member in their segment. */
export function stakeholderBrief(seg, contact) {
  const cm = contact.committee;
  if (!seg || !cm) return '';
  const bc = seg.bestContact ?? {};
  return [
    `Your organization: ${seg.label}. Buyers like you are usually reached by ${bc.channel ?? 'email'} (${bc.times ?? 'business hours'}).`,
    `Your role in this purchase: ${roleLabel(cm.role)}${cm.canBlock ? ' — you can block it' : ''}. You care about: ${(cm.concerns ?? []).join('; ') || 'not wasting time'}.`,
    `Your current stance on this vendor: ${cm.stance === 'support' ? 'leaning in' : cm.stance === 'oppose' ? 'skeptical to opposed; you need your concerns addressed concretely' : 'neutral, cautious'}.`,
    seg.objections?.length ? `Typical objections in your world: ${seg.objections.slice(0, 3).join(' / ')}` : '',
  ].filter(Boolean).join('\n');
}

export { NEVER, words };
