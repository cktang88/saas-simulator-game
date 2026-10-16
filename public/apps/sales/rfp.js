// Formal RFPs: the process a founder works through to win a bid from a school district, city, university, hospital,
// bank or enterprise. Replaces the old flat "RFP = win-rate multiplier + no-bid" with a real workflow:
//   sourcing (a deal's forced RFP or an unsolicited public bid feed) -> go/no-go checklist -> written Q&A and
//   addenda -> response building (forms, compliance matrix, security questionnaire, price, references, executive
//   summary) -> compliance screen -> weighted evaluation -> shortlist, scripted demo/orals -> BAFO -> notice of
//   intent, protest window, negotiation, board approval -> contract (the deal's existing sendContract/closeWon
//   path) or loss -> debrief window -> optional protest. Cooperative contracts (Sourcewell/OMNIA/NASPO style)
//   are the strategic alternative: get listed once, and buyers can skip their own RFP.
//
// Operator quality (ARCHITECTURE principle 7, data/operator-tiers.js `rfp_bids`):
//   stellar   no-bids wired and poor-fit bids after asking the buyer, bids few and wins most, asks specific Q&A
//             questions, answers the matrix honestly, runs the compliance check, builds a content library, always
//             asks for the debrief.
//   good      checks fit and certifications, honest matrix, complete forms, requests most debriefs.
//   average   bids on most things, a couple of optimistic "comply" answers, an occasional missing form.
//   mediocre  bids everything, claims "comply" on unshipped features, boilerplate summary, misses forms and
//             addenda, submits on the last day, ignores debriefs and repeats the same loss.
//
// Sources: docs/research/rfp/public-sector.md and enterprise.md. Numbers marked [design] are game assumptions,
// never real statistics (ARCHITECTURE principle 3). Hours are founder hours; the UI charges them with ctx.act, and
// each action here records them on the bid (bid.hoursSpent) so the cost of a bid is always traceable.
// Determinism: rng(state), uid() and a seed-keyed hash only.
import { rng, chance, clamp, uid, hash, words, fmtDate, dateOf, isWeekend, gaussian } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { post } from '../../core/bank.js';
import { logMistake, registerOperatorReader, tierFromScore, unknownRead, shrink, trapCoaching, tierBehaviours } from '../../core/operator.js';
import { scheduleEvent, cancelEvent, ensureCalendar, findSlots } from '../../core/calendar.js';
import { hasProduct, mainPlan } from '../../core/market.js';
import { cancel as cancelSub, activeSubs } from '../../core/stripe.js';
import { MARKET } from '../../core/params.js';
import { questionnaireHours } from '../success/model.js';
import { BUZZWORDS, AI_SLOP } from './copy.js';
import { dealAcv, isOpen } from './deals.js';
import { emitSalesEvent } from './events.js';
import { getSegment, committeeContacts } from './segments.js';
import { ensureCrm, addActivity, loseDeal, moveDeal, sendContract, dealById, companyById, upsertCompany, addContact, ensureDeal, hasSoc2 } from './model.js';

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export const RFP = {
  // Founder hours per action [design unless noted; research/rfp/enterprise.md §2: ~25-33 h writing effort per RFP for a team]
  feedHours: 2, readHours: 1.5, noBidHours: 0.25, investigateHours: 0.75, questionHours: 0.25, addendumHours: 0.1,
  formHours: { w9: 0.5, insurance_cert: 1.5, non_collusion: 0.25, debarment: 0.25, coi_disclosure: 0.5, local_pref: 0.5 },
  matrixPerReq: 0.5, pricingHours: 2, repriceHours: 0.25, refHours: 1.5, summaryHours: 3, checkHours: 1, submitHours: 0.5,
  libraryHours: 1.5, oralsPrepHours: 3, bafoHours: 2, debriefHours: 1.5, protestHours: 12,
  protestUsd: [2500, 8000], // outside counsel for a bid protest [design]
  // Security questionnaires: SOC 2 report on hand 1-2 h; with an answer library 2-8 h; first manual 20-40 h (Success model, sourced vendor estimates).
  hecvat: [8, 20], hecvatWithSoc2: [3, 5], hecvatLibrary: [5, 9], // HECVAT workbook 8-20 h (vendor estimate, research/rfp/public-sector.md §2)
  customSecurity: [6, 12], customWithSoc2: 2, customLibrary: 3, // [design] short custom gov security form
  libraryAt: 15, // library entries before a security questionnaire counts as "library-backed"
  credentials: { // what a bidder can buy or build before a due date [design cost; unverified]
    insurance: { label: 'Certificate of insurance (GL + cyber/E&O)', hours: 3, usd: 1800, asset: 'coi_insurance' },
    vpat: { label: 'VPAT / accessibility conformance report', hours: 6, usd: 2500, asset: 'vpat' },
    hecvat: { label: 'HECVAT workbook (self-assessed)', hours: [8, 20], usd: 0, asset: 'hecvat' },
  },
  // Timeline in days. Public 3-6 months issue-to-award (research §1); enterprise 8-12 weeks (enterprise.md §1) [design ranges]
  qDays: [8, 12], answerLag: 3, dueDays: { public: [21, 35], private: [21, 28] },
  evalDays: { public: [14, 28], private: [10, 18] }, screenLag: 2,
  oralsLag: { public: [7, 12], private: [5, 8] }, bafoDays: 5, finalLag: 7,
  protestDays: [5, 15], // Long Beach 5 days, New Mexico 15 days (research §1)
  negotiateDays: { public: [7, 21], private: [14, 28] },
  debriefDays: 3, // FAR 15.505: written request within 3 days; enterprise advice 48-72 h (research)
  fieldSize: [3, 6], // ~5 submissions per municipal RFP (GovLoop, research §4)
  shortlist: 3, wiredCap: 58, // a wired bid scores at most this many points of 100 [design]
  fieldMean: 66, fieldSd: 9, incumbentScore: 84, // [design]
  sustainRate: 0.14, // GAO FY2025: 14% of merits decisions sustained (research §6)
  pWired: { 0: 0.5, 1: 0.3, 2: 0.15, 3: 0.07 }, pWiredCold: 0.45, // [design] research found no public data on pre-wired RFPs
  pDisqualifiedPortal: 0.12, // submitting on the last day: upload, portal or courier trouble [design]
  minorInformalityWaived: 0.15, // buyers may waive a missing form as a minor informality [design]
  costFloorShare: 0.4, // below this share of list price the contract loses money after hosting, support and implementation [design]
  feedChancePerDay: 0.07, // ~1.5 public bids a month once registered on bid portals [design]
};

export const COOPS = [
  { id: 'naspo', name: 'NASPO ValuePoint', feePct: 0.0025, feeNote: '0.25% administrative fee on many state contracts (sourced: NASPO FAQ)', segs: ['state_gov', 'local_gov', 'k12', 'higher_ed'] },
  { id: 'sourcewell', name: 'Sourcewell', feePct: 0.01, feeNote: 'about 1% of sales [unverified; one city document shows 1.00%]', segs: ['local_gov', 'k12', 'higher_ed', 'utilities'] },
  { id: 'omnia', name: 'OMNIA Partners', feePct: 0.015, feeNote: 'fee not found in research; 1-2% assumed [design]', segs: ['local_gov', 'k12', 'higher_ed', 'state_gov'] },
];
export const COOP = { hours: [40, 120], days: [120, 270], baseP: 0.35, usd: [0, 2000] }; // PAPERWORK.coop_contract in data/buyer-segments.js

const WEIGHTS_PUBLIC = [['technical', 40, 70], ['price', 15, 35], ['experience', 10, 20], ['local', 0, 10]]; // research §3 (unverified ranges)
const WEIGHTS_PRIVATE = [['technical', 45, 65], ['price', 15, 30], ['experience', 10, 20], ['local', 0, 0]];
const PUBLIC_GROUPS = new Set(['public', 'education']);
const FEED_SEGMENTS = [['local_gov', 3], ['k12', 3], ['state_gov', 2], ['higher_ed', 2], ['utilities', 1], ['hospitals', 1]];
const PLACES = ['Northbrook', 'Maple Ridge', 'Cedar Falls', 'Lakeshore', 'Pinecrest', 'Stonebridge', 'Fairhaven', 'Ridgemont', 'Willow Creek', 'Harborview', 'Oakmont', 'Summit Park', 'Redfield', 'Clearwater', 'Eastvale', 'Brookhaven'];
const BUYER_FORMS = { local_gov: (p) => `City of ${p}`, state_gov: (p) => `State Department of ${p} Services`, k12: (p) => `${p} Unified School District`, higher_ed: (p) => `${p} State University`, utilities: (p) => `${p} Regional Water Authority`, hospitals: (p) => `${p} County Health District`, banks: (p) => `${p} Community Bank`, enterprise: (p) => `${p} Holdings` };
const ANSWER_VALUE = { comply: 1, partial: 0.6, roadmap: 0.3, no: 0 };
const ANSWER_RANK = { no: 0, roadmap: 1, partial: 2, comply: 3 };
export const ANSWERS = { comply: 'Comply (live today)', partial: 'Partial (explain the gap)', roadmap: 'Roadmap (dated, committed)', no: 'No' };
const FORM_LABEL = { w9: 'W-9', insurance_cert: 'Insurance certificate', non_collusion: 'Non-collusion affidavit', debarment: 'Debarment / suspension certification', coi_disclosure: 'Conflict-of-interest disclosure', signed_addenda: 'Signed addenda acknowledgements', local_pref: 'Local / small-business preference affidavit (optional points)' };

// Seed-keyed uniform in [0,1): deterministic, independent of the main rng stream.
// Keyed by the company, not the rng stream: reading a bid never changes the draws other systems get.
const u01 = (state, key) => (parseInt(hash(`${state.company?.name ?? ''}|${state.startDate ?? ''}|${key}`), 36) % 100003) / 100003;
const between = (lo, hi, r) => lo + (hi - lo) * r;
const dayInt = (lo, hi, r) => Math.round(between(lo, hi, r));
const norm = (s) => String(s ?? '').toLowerCase();

export function ensureRfp(state) {
  const crm = ensureCrm(state);
  const R = (crm.rfp ??= {});
  R.bids ??= [];
  R.library ??= { entries: 0, bids: 0, lastDay: null };
  R.feedOn ??= false;
  R.creds ??= {};
  R.coop ??= { apps: [], active: [] };
  R.lessons ??= [];
  return R;
}
/** Read-only views (safe to call while rendering). */
const EMPTY = { bids: [], library: { entries: 0, bids: 0, lastDay: null }, feedOn: false, creds: {}, coop: { apps: [], active: [] }, lessons: [] };
export const peekRfp = (state) => state.apps?.crm?.rfp ?? EMPTY;
export const bidsOf = (state) => peekRfp(state).bids;
export const bidById = (state, id) => bidsOf(state).find((b) => b.id === id);
export const bidForDeal = (state, dealId) => bidsOf(state).find((b) => b.dealId === dealId);
const isPublic = (b) => PUBLIC_GROUPS.has(getSegment(b.segmentId)?.group);
const LIVE = ['issued', 'bidding'];
export const isActive = (b) => !['won', 'lost', 'disqualified', 'no_bid', 'expired', 'lapsed', 'superseded'].includes(b.status);

// ---------------------------------------------------------------------------
// Procurement path, content library, assets
// ---------------------------------------------------------------------------

/** How a purchase of this size is bought: card, small purchase, informal quotes, formal RFP, or off a cooperative contract. */
export function procurementPath(seg, acv, { coop = false } = {}) {
  const p = seg?.procurement;
  if (!p) return { path: 'small_purchase', note: 'No formal process.' };
  if (acv <= p.cardLimit) return { path: 'card', note: `Under their $${p.cardLimit.toLocaleString('en-US')} card limit.` };
  if (acv >= p.rfpThreshold) {
    if (coop && p.coopContracts.length) return { path: 'coop', note: 'Above the bid threshold, but your cooperative contract lets them buy without their own RFP.' };
    return { path: 'rfp', note: `Above their $${p.rfpThreshold.toLocaleString('en-US')} bid threshold: a formal RFP is required.` };
  }
  if (acv >= p.quoteThreshold) return { path: 'quotes', note: `Between $${p.quoteThreshold.toLocaleString('en-US')} and the $${p.rfpThreshold.toLocaleString('en-US')} bid threshold: informal quotes, no RFP. Send a clean quote and move fast.` };
  return { path: 'small_purchase', note: 'Below the informal-quote threshold: a small purchase, no RFP needed.' };
}

export const libraryFactor = (state) => 1 - 0.55 * (1 - Math.exp(-peekRfp(state).library.entries / 50)); // 1.0 empty -> ~0.5 after ~100 entries [design]
const hasLibrary = (state) => peekRfp(state).library.entries >= RFP.libraryAt || Boolean(state.apps.success?.library);
const assets = (state) => ensureCrm(state).paperAssets ?? {};
const legal = (state) => state.apps.legal ?? {};

// ---------------------------------------------------------------------------
// Requirements: checked against what is actually shipped
// ---------------------------------------------------------------------------

const featText = (f) => norm(`${f.title} ${f.spec} ${f.problem} ${f.user ?? ''}`);
const REQ_BANK = [
  { id: 'sso', text: 'Single sign-on (SAML 2.0 / OIDC) for staff accounts', re: /\b(sso|saml|oidc|single sign)/, partial: /\b(login|auth|sign[- ]?in|password|2fa|mfa)/ },
  { id: 'rbac', text: 'Role-based access control with at least three permission levels', re: /\b(role|permission|rbac|access control)/, partial: /\b(team|invite|member|users?\b)/ },
  { id: 'audit', text: 'Audit log of user and administrator actions, retained 12 months', re: /\b(audit|activity log|history log|change log)/ },
  { id: 'export', text: 'Bulk data export (CSV) and a documented API', re: /\b(export|csv|api|webhook)/, partial: /\b(download|report)/ },
  { id: 'report', text: 'Standard and ad-hoc reporting for administrators', re: /\b(report|dashboard|analytics|insight)/ },
  { id: 'integr', text: 'Integration with the buyer\'s existing systems of record', re: /\b(integrat|sync|connector|zapier|salesforce|quickbooks|hubspot|import)/ },
  { id: 'mobile', text: 'Mobile access (responsive web or native app)', re: /\b(mobile|ios|android|responsive)/ },
  { id: 'notify', text: 'Configurable email notifications and reminders', re: /\b(notif|alert|remind|email)/ },
  { id: 'multi', text: 'Multi-site / multi-department hierarchy with delegated admins', re: /\b(multi[- ]?(site|tenant|location|org)|workspace|department|hierarch)/ },
  { id: 'workflow', text: 'Configurable workflows and approvals', re: /\b(workflow|approval|automation|rule)/ },
  { id: 'a11y', text: 'WCAG 2.1 AA accessibility of the user interface', re: /\b(wcag|accessib|a11y|screen reader)/ },
  { id: 'bulk', text: 'Bulk import / onboarding of existing records', re: /\b(bulk|import|migrat|onboard)/ },
];
const CORE_REQS = [
  { id: 'core', text: 'Core functionality for the business need in Section 3 of the RFP', core: true, mandatory: true },
  { id: 'encrypt', text: 'Encryption in transit (TLS 1.2+) and at rest; US data residency', core: true, mandatory: true },
  { id: 'backup', text: 'Daily backups with documented restore testing', core: true },
];
const CERT_REQS = {
  soc2: { id: 'soc2', text: 'Current SOC 2 Type II report (or equivalent third-party attestation)', cert: 'soc2' },
  vpat: { id: 'vpat', text: 'Current VPAT / accessibility conformance report', cert: 'vpat' },
  hecvat: { id: 'hecvat', text: 'Completed HECVAT (Lite or Full)', cert: 'hecvat' },
  insurance: { id: 'insurance', text: 'Certificate of insurance: general liability and cyber / E&O at the stated minimums', cert: 'insurance' },
  dpa: { id: 'dpa', text: 'Data processing / student-data privacy agreement signed as drafted by the buyer', cert: 'dpa' },
};

export { REQ_BANK, CORE_REQS, CERT_REQS };

/** What is really true about this requirement today: 'full' | 'partial' | 'planned' | 'none'. */
export function reqTruth(state, req) {
  if (req.core) return hasProduct(state) ? 'full' : 'none';
  if (req.cert) {
    const L = legal(state), A = assets(state);
    switch (req.cert) {
      case 'soc2': return L.soc2 === 'type2' && L.soc2Report?.opinion !== 'qualified' ? 'full' : L.soc2 === 'type1' || L.soc2 === 'type2' ? 'partial' : L.soc2 === 'type2_in_progress' ? 'planned' : 'none';
      case 'vpat': return A.vpat != null ? 'full' : 'none';
      case 'hecvat': return A.hecvat != null ? 'full' : 'none';
      case 'insurance': return A.coi_insurance != null ? 'full' : 'none';
      case 'dpa': return L.dpaReady ? 'full' : 'none';
      default: return 'none';
    }
  }
  const feats = state.apps.product?.features ?? [];
  const live = feats.filter((f) => f.status === 'shipped' && !f.system);
  if (req.re && live.some((f) => req.re.test(featText(f)))) return 'full';
  if (req.partial && live.some((f) => req.partial.test(featText(f)))) return 'partial';
  const planned = feats.filter((f) => ['building', 'queued'].includes(f.status));
  if (req.re && planned.some((f) => req.re.test(featText(f)))) return 'planned';
  return 'none';
}

/** How an answer compares with the truth: severity 0 (honest) .. 1 (claimed "comply" on something not built). */
export function overclaimSeverity(answer, truth) {
  if (answer === 'comply') return truth === 'full' ? 0 : truth === 'partial' ? 0.5 : 1;
  if (answer === 'partial') return truth === 'full' || truth === 'partial' ? 0 : truth === 'planned' ? 0.25 : 0.6;
  if (answer === 'roadmap') return truth === 'none' ? 0.5 : 0; // a dated commitment nobody has planned
  return 0;
}
export const honestAnswer = (truth) => (truth === 'full' ? 'comply' : truth === 'partial' ? 'partial' : truth === 'planned' ? 'roadmap' : 'no');

export function overclaims(state, bid, matrix = bid.response?.matrix ?? {}) {
  return bid.reqs.map((r) => ({ req: r, answer: matrix[r.id], truth: reqTruth(state, r) })).map((x) => ({ ...x, severity: x.answer ? overclaimSeverity(x.answer, x.truth) : 0 })).filter((x) => x.severity > 0);
}

function buildReqs(state, seg, key) {
  const out = CORE_REQS.map((r) => ({ ...r, weight: r.mandatory ? 3 : 1 }));
  const certs = [];
  const g = seg.group;
  if (g === 'education') certs.push(['hecvat', 0.5], ['vpat', 0.6], ['dpa', 0.7], ['insurance', 0.8]);
  else if (g === 'public') certs.push(['vpat', 0.5], ['insurance', 0.8], ['soc2', 0.3]);
  else if (g === 'health') certs.push(['soc2', 0.5], ['insurance', 0.8], ['dpa', 0.6]);
  else certs.push(['soc2', 0.6], ['insurance', 0.7]);
  certs.forEach(([c, pm], i) => out.push({ ...CERT_REQS[c], mandatory: u01(state, `${key}|cert${i}`) < pm, weight: 2 }));
  const pool = REQ_BANK.slice();
  const n = 5 + Math.floor(u01(state, `${key}|n`) * 3);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(u01(state, `${key}|r${i}`) * pool.length);
    const r = pool.splice(k, 1)[0];
    out.push({ ...r, mandatory: u01(state, `${key}|m${i}`) < 0.25, weight: u01(state, `${key}|w${i}`) < 0.3 ? 3 : 2 });
  }
  // One non-core mandatory item is something the buyer would relax if asked a specific question [design].
  const cand = out.filter((r) => r.mandatory && !r.core && !r.cert);
  if (cand.length) cand[Math.floor(u01(state, `${key}|loose`) * cand.length)].loosenable = true;
  out.forEach((r, i) => { r.n = `R-${String(i + 1).padStart(2, '0')}`; });
  return out;
}

// ---------------------------------------------------------------------------
// Creating bids
// ---------------------------------------------------------------------------

const planPrice = (state, quantity) => {
  const plan = mainPlan(state) ?? state.plans?.[0];
  if (!plan) return { plan: null, list: 0, unit: 0 };
  const ent = state.company.model === 'ent';
  const list = dealAcv(plan, { quantity, annual: true, annualDiscount: ent ? 0 : MARKET.smb.annualDiscount });
  return { plan, list, unit: list / Math.max(1, quantity) };
};

function weightsFor(state, pub, key) {
  const tpl = pub ? WEIGHTS_PUBLIC : WEIGHTS_PRIVATE;
  const raw = tpl.map(([k, lo, hi]) => [k, between(lo, hi, u01(state, `${key}|wt${k}`))]);
  const total = raw.reduce((a, [, v]) => a + v, 0);
  return Object.fromEntries(raw.map(([k, v]) => [k, +(v / total).toFixed(3)]));
}

function sizeHours(acv) { return acv < 60000 ? [20, 45] : acv < 150000 ? [40, 90] : [80, 150]; } // research public-sector §7 [design]

function standardHours(state, bid) {
  const forms = Object.entries(RFP.formHours).filter(([k]) => bid.forms.some((f) => f.id === k && !f.optional)).reduce((a, [, h]) => a + h, 0);
  const sec = { hecvat: 14, sig_lite: 30, caiq: 30, custom: 9 }[bid.securityKind] ?? 0;
  return +(RFP.readHours + forms + bid.reqs.length * RFP.matrixPerReq + sec + RFP.pricingHours + RFP.refHours + RFP.summaryHours + RFP.checkHours + RFP.submitHours).toFixed(1);
}

function newBid(state, o) {
  ensureRfp(state);
  const seg = getSegment(o.segmentId);
  const pub = PUBLIC_GROUPS.has(seg.group);
  const key = o.key ?? `${o.segmentId}|${state.day}|${ensureRfp(state).bids.length}`;
  const { list } = planPrice(state, o.quantity ?? 1);
  const listPrice = o.listPrice ?? list;
  const budget = Math.round(o.budget ?? listPrice * between(0.75, 1.35, u01(state, `${key}|bud`)));
  const hintOn = o.budgetHint ?? u01(state, `${key}|hint`) < 0.6;
  const issuedDay = o.issuedDay ?? state.day;
  const qDeadline = issuedDay + (o.qDays ?? dayInt(...RFP.qDays, u01(state, `${key}|q`)));
  const dueDay = o.dueDay ?? Math.max(qDeadline + RFP.answerLag + 7, issuedDay + dayInt(...RFP.dueDays[pub ? 'public' : 'private'], u01(state, `${key}|due`)));
  const securityKind = o.securityKind ?? (seg.group === 'education' ? 'hecvat' : pub ? 'custom' : ['banks', 'enterprise', 'hospitals', 'utilities', 'insurance', 'manufacturing'].includes(seg.id) ? 'sig_lite' : 'caiq');
  const reqs = o.reqs ?? buildReqs(state, seg, key);
  const wired = o.wired ?? chance(state, o.pWired ?? RFP.pWiredCold);
  const bid = {
    id: uid('rfp'), source: o.source ?? 'public', dealId: o.dealId ?? null, companyId: o.companyId ?? null, segmentId: seg.id,
    buyer: o.buyer, title: o.title, scope: o.scope, public: pub,
    issuedDay, qDeadline, answerDay: qDeadline + RFP.answerLag, dueDay, status: 'issued',
    listPrice, budget, budgetHint: hintOn ? `$${Math.round(budget * 0.85 / 1000)}k - $${Math.round(budget * 1.1 / 1000)}k per year` : null, budgetKnown: false,
    quantity: o.quantity ?? 1, floor: Math.round(listPrice * RFP.costFloorShare),
    weights: o.weights ?? weightsFor(state, pub, key), weightsStated: o.weightsStated ?? u01(state, `${key}|ws`) < 0.55, weightsKnown: false,
    localPct: o.localPct ?? (pub && u01(state, `${key}|loc`) < 0.6 ? 0.05 + 0.05 * u01(state, `${key}|loc2`) : 0),
    pageLimit: o.pageLimit ?? 2 + Math.floor(u01(state, `${key}|pg`) * 3), // narrative pages, ~450 words each
    securityKind, securityRequired: o.securityRequired ?? true,
    reqs, scenarios: o.scenarios ?? DEMO_SCENARIOS[seg.group] ?? DEMO_SCENARIOS.default,
    wired, shapedForYou: Boolean(o.shapedForYou), engaged: o.engaged ?? 0, relationship: o.engaged ?? 0,
    evalFlaw: o.evalFlaw ?? u01(state, `${key}|flaw`) < 0.2,
    forms: [], addenda: [], questions: [], clue: null,
    decision: null, response: { matrix: {}, security: null, price: null, pricingDone: false, refs: [], summary: null, formsDone: {} },
    hoursSpent: 0, hoursLog: [], checked: false, ack: {}, library: false,
    field: null, eval: null, debrief: null, protest: null, pending: [], log: [],
  };
  bid.forms = buildForms(pub, bid.localPct > 0);
  bid.refHours = standardHours(state, bid);
  bid.estHours = sizeHours(listPrice);
  ensureRfp(state).bids.unshift(bid);
  if (ensureRfp(state).bids.length > 150) ensureRfp(state).bids.length = 150;
  return bid;
}

function buildForms(pub, local) {
  const ids = pub ? ['w9', 'insurance_cert', 'non_collusion', 'debarment', 'coi_disclosure'] : ['w9', 'insurance_cert', 'coi_disclosure'];
  if (local) ids.push('local_pref');
  return ids.map((id) => ({ id, label: FORM_LABEL[id], hours: RFP.formHours[id], optional: id === 'local_pref', done: false, doneDay: null }));
}

const DEMO_SCENARIOS = {
  education: ['Enroll a new class of students from a roster file and assign them to teachers', 'Show the parent-facing view and how a data-privacy request is handled', 'Run the end-of-term report an administrator needs'],
  public: ['Take a resident request from intake through assignment to closure', 'Show audit trail and role permissions for a records request', 'Produce the monthly performance report for the council'],
  health: ['Onboard a new department and set permissions', 'Show an audit trail for a compliance review', 'Walk through downtime and recovery'],
  default: ['Onboard a new team from a spreadsheet', 'Show approvals, permissions and the audit trail', 'Produce the report the executive sponsor asked for'],
};

function announce(state, bid, extra = '') {
  emitSalesEvent(state, 'rfp_issued', { dealId: bid.dealId, bidId: bid.id, buyer: bid.buyer, dueDay: bid.dueDay }, `rfp_issued:${bid.id}`);
  notify(state, `${bid.buyer} issued ${bid.title}. Questions due ${fmtDate(state, bid.qDeadline)}, responses due ${fmtDate(state, bid.dueDay)}.${extra}`, { type: 'info', app: 'crm' });
  setDeadlines(state, bid);
}

/** A forced RFP on one of the player's deals (deal.proc.rfp): the buyer's procurement policy requires a competitive bid. */
export function openBidForDeal(state, deal) {
  if (deal.rfpBidId || !deal.proc?.rfp) return null;
  const co = companyById(state, deal.companyId);
  const seg = getSegment(deal.segmentId);
  if (!seg) return null;
  const engaged = committeeContacts(state, deal).filter((c) => c.committee.engaged && c.committee.stance !== 'oppose').length;
  const bid = newBid(state, {
    source: 'deal', dealId: deal.id, companyId: deal.companyId, segmentId: seg.id, buyer: co?.name ?? 'The buyer',
    title: `RFP for ${seg.label.toLowerCase()} software`, scope: `${co?.name ?? 'The buyer'} requires a competitive process for ${state.company.oneLiner || 'the platform you proposed'}.`,
    quantity: deal.quantity ?? 1, listPrice: dealAcv(mainPlan(state) ?? state.plans[0], { quantity: deal.quantity ?? 1, annual: true, annualDiscount: state.company.model === 'ent' ? 0 : MARKET.smb.annualDiscount }) || deal.amount,
    engaged, pWired: RFP.pWired[Math.min(3, engaged)], key: `deal|${deal.id}`,
    budget: Math.round((deal.amount ?? 0) * between(0.8, 1.4, u01(state, `deal|${deal.id}|bud`))),
  });
  bid.shapedForYou = engaged >= 2 && u01(state, `deal|${deal.id}|shape`) < 0.2;
  deal.rfpBidId = bid.id;
  deal.decisionDay = null; // the process now decides, not a daily roll
  deal.paperwork = (deal.paperwork ?? []).filter((it) => it.id !== 'rfp_response'); // the bid replaces the generic "RFP response" paperwork item
  announce(state, bid);
  addActivity(state, { type: 'note', text: `${bid.buyer} issued a formal RFP (due ${fmtDate(state, bid.dueDay)}). Decide bid / no-bid under CRM -> Bids.`, dealId: deal.id, companyId: deal.companyId });
  return bid;
}

/** An unsolicited public bid from a bid portal. Overrides are for tests and scripted scenarios. */
export function postPublicBid(state, o = {}) {
  const segId = o.segmentId ?? weightedSegment(state);
  const seg = getSegment(segId);
  const key = o.key ?? `feed|${state.day}|${ensureRfp(state).bids.length}`;
  const place = PLACES[Math.floor(u01(state, `${key}|place`) * PLACES.length)];
  const buyer = o.buyer ?? (BUYER_FORMS[segId] ?? BUYER_FORMS.enterprise)(place);
  const threshold = seg.procurement.rfpThreshold;
  const acvTarget = o.acvTarget ?? Math.round(threshold * between(1, 2.5, u01(state, `${key}|acv`)) / 1000) * 1000;
  const { unit } = planPrice(state, 1);
  const quantity = o.quantity ?? clamp(Math.round(acvTarget / Math.max(1, unit)), 1, 2000);
  const bid = newBid(state, {
    source: 'public', segmentId: segId, buyer, quantity, key, pWired: RFP.pWiredCold,
    title: o.title ?? `RFP ${String(2026).slice(2)}-${Math.floor(10 + u01(state, `${key}|no`) * 89)}: ${seg.label} software platform`,
    scope: o.scope ?? `${buyer} seeks a vendor for ${state.company.oneLiner ? `software similar to: ${state.company.oneLiner}` : 'a cloud software platform'} for about ${quantity} users. Contract term one year with renewals.`,
    ...o,
  });
  announce(state, bid);
  return bid;
}

function weightedSegment(state) {
  const total = FEED_SEGMENTS.reduce((a, [, w]) => a + w, 0);
  let r = rng(state) * total;
  for (const [id, w] of FEED_SEGMENTS) { r -= w; if (r <= 0) return id; }
  return FEED_SEGMENTS[0][0];
}

/** Register on state and county bid portals (free): the feed of public bids starts. */
export function registerFeed(state) {
  const R = ensureRfp(state);
  if (R.feedOn) throw new Error('You are already registered on the bid portals.');
  R.feedOn = true;
  R.feedSince = state.day;
  addActivity(state, { type: 'note', text: 'Registered on state and local bid portals.' });
  return R;
}

// ---------------------------------------------------------------------------
// Go / no-go
// ---------------------------------------------------------------------------

export function fitShare(state, bid, { mandatoryOnly = true } = {}) {
  const rs = bid.reqs.filter((r) => !r.cert && (mandatoryOnly ? r.mandatory && !r.loosened : true)); // certificates are a separate line of the checklist
  if (!rs.length) return 1;
  return rs.filter((r) => ['full', 'partial'].includes(reqTruth(state, r))).length / rs.length;
}
const referenceCandidates = (state, bid) => {
  const crm = ensureCrm(state);
  const seg = getSegment(bid.segmentId);
  const subs = activeSubs(state);
  const out = [];
  for (const c of state.stripe?.customers ?? []) {
    if (!subs.some((s) => s.customerId === c.id)) continue;
    const co = c.crmCompanyId ? crm.companies.find((x) => x.id === c.crmCompanyId) : null;
    const cseg = co ? getSegment(co.segmentId) : null;
    out.push({ id: c.id, name: c.company || c.name, same: cseg?.id === seg.id, group: cseg?.group === seg.group });
  }
  return out;
};
export { referenceCandidates };

/** Hours it would take to answer this bid from where the player stands now (for the capacity check). */
export function estimateHours(state, bid) {
  const f = libraryFactor(state);
  const forms = bid.forms.filter((x) => !x.optional).reduce((a, x) => a + x.hours, 0) * f;
  return +(RFP.readHours + forms + bid.reqs.length * RFP.matrixPerReq * f + securityHoursNeeded(state, bid) + RFP.pricingHours + RFP.refHours + RFP.summaryHours + RFP.checkHours + RFP.submitHours + missingCredentialHours(state, bid)).toFixed(1);
}
function missingCredentialHours(state, bid) {
  return bid.reqs.filter((r) => r.cert && r.mandatory && reqTruth(state, r) === 'none' && RFP.credentials[r.cert]).reduce((a, r) => { const h = RFP.credentials[r.cert].hours; return a + (Array.isArray(h) ? (h[0] + h[1]) / 2 : h); }, 0);
}

/** The go/no-go checklist a good bid team fills out (research public-sector §7, enterprise §5). Statuses: pass | warn | fail | unknown. */
export function goNoGo(state, bid) {
  const items = [];
  const eng = bid.engaged ?? 0;
  const openClue = bid.clue && !bid.clue.likelyWired; // a cold bid is still worth a look when the buyer says it is genuinely open
  items.push({ id: 'relationship', label: 'Relationship before the RFP was issued', status: eng >= 2 ? 'pass' : eng === 1 || openClue ? 'warn' : 'fail', detail: eng ? `${eng} contact(s) on their side know you.` : 'Nobody on their side has ever spoken to you. Criteria are often written around the vendor they already know.' });
  const fit = fitShare(state, bid);
  const mand = bid.reqs.filter((r) => r.mandatory && !r.loosened);
  const gaps = mand.filter((r) => !['full', 'partial'].includes(reqTruth(state, r)));
  items.push({ id: 'fit', label: 'Fit to mandatory requirements (good bid teams want 80%+ without custom build)', status: fit >= 0.8 ? 'pass' : fit >= 0.6 ? 'warn' : 'fail', detail: `${Math.round(fit * 100)}% of ${mand.length} mandatory items are met today.${gaps.length ? ` Gaps: ${gaps.slice(0, 3).map((r) => r.n).join(', ')}.` : ''}` });
  let bStatus = 'unknown', bDetail = 'No budget stated. Ask in the Q&A window.';
  const b = bid.budgetKnown ? bid.budget : bid.budgetHint ? bid.budget : null;
  if (b) { const r = bid.listPrice / b; bStatus = r <= 1 ? 'pass' : r <= 1.25 ? 'warn' : 'fail'; bDetail = `Your list price ${money0(bid.listPrice)} against a ${bid.budgetKnown ? 'confirmed' : 'stated'} budget of about ${bid.budgetKnown ? money0(bid.budget) : bid.budgetHint}.`; }
  items.push({ id: 'budget', label: 'Budget against your price', status: bStatus, detail: bDetail });
  const lacking = bid.reqs.filter((r) => r.cert && r.mandatory && reqTruth(state, r) === 'none');
  const hard = lacking.filter((r) => r.cert === 'soc2' || r.cert === 'dpa');
  items.push({ id: 'certs', label: 'Mandatory certifications and documents (SOC 2, HECVAT, VPAT, insurance)', status: hard.length ? 'fail' : lacking.length ? 'warn' : 'pass', detail: lacking.length ? `You lack: ${lacking.map((r) => r.text.split(/[:(]/)[0].trim()).join('; ')}.${hard.length ? ' SOC 2 and a signed DPA cannot be produced by the due date.' : ' Obtainable before the due date for hours and money.'}` : 'You hold everything marked mandatory.' });
  const weeks = Math.max(0.5, (bid.dueDay - state.day) / 7);
  const avail = weeks * (state.founder?.hoursPerWeek ?? 50) * 0.35; // a third of a week goes to everything but this bid [design]
  const est = estimateHours(state, bid);
  items.push({ id: 'capacity', label: 'Capacity: founder hours before the due date', status: est <= avail * 0.7 ? 'pass' : est <= avail ? 'warn' : 'fail', detail: `About ${est} h to answer this; roughly ${Math.round(avail)} h of spare founder time before ${fmtDate(state, bid.dueDay)}. A typical bid at this size is ${bid.estHours[0]}-${bid.estHours[1]} h.` });
  items.push(bid.clue
    ? { id: 'incumbent', label: 'Is it wired for an incumbent?', status: bid.clue.likelyWired ? 'fail' : 'pass', detail: bid.clue.text }
    : { id: 'incumbent', label: 'Is it wired for an incumbent?', status: 'unknown', detail: 'Unknown. Call the buyer\'s procurement contact and ask whether this is a formality, who the current vendor is and when their contract ends.' });
  const fails = items.filter((i) => i.status === 'fail').length, warns = items.filter((i) => i.status === 'warn').length;
  const recommend = fails > 0 || warns >= 3 ? 'no_bid' : 'bid';
  return { items, recommend, fails, warns };
}
const money0 = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Call the buyer (or a champion) before deciding: reveals a clue about wiring, with realistic error. */
export function investigate(state, bid) {
  if (!LIVE.includes(bid.status)) throw new Error('That bid is closed.');
  if (bid.clue) throw new Error('You already asked. The answer will not change.');
  const r = u01(state, `${bid.id}|inv`);
  const sees = bid.wired ? r < 0.75 : r < 0.8; // 75-80% accurate [design]
  const likely = bid.wired ? sees : !sees;
  bid.clue = { likelyWired: likely, day: state.day, text: likely ? 'Their contact was vague about the current vendor, said staff are "already trained" on the existing system and that the RFP is "required by policy". Treat it as wired until proven otherwise.' : 'Their contact said the current contract is ending, they are open to replacing it and several vendors were invited.' };
  bid.hoursSpent += RFP.investigateHours; bid.hoursLog.push(['investigate', RFP.investigateHours]);
  return bid.clue;
}

const BAD_THRESHOLDS = { fit: 0.6, ratio: 1.4 };
/** Hidden-truth read of the decision: was this a bid a good operator would have taken? */
export function bidQuality(state, bid) {
  const fit = fitShare(state, bid);
  const hardCert = bid.reqs.some((r) => r.cert && r.mandatory && reqTruth(state, r) === 'none' && ['soc2', 'dpa'].includes(r.cert));
  const ratio = bid.listPrice / Math.max(1, bid.budget);
  const bad = bid.wired || fit < BAD_THRESHOLDS.fit || hardCert || ratio > BAD_THRESHOLDS.ratio;
  const winnable = !bid.wired && fit >= 0.85 && !hardCert && ratio <= 1.1;
  return { bad, winnable, fit, hardCert, ratio, wired: bid.wired };
}

/** The go / no-go call. Bidding costs the time to read and shred the RFP; no-bid costs a courtesy note. */
export function decideBid(state, bid, decision) {
  if (bid.status !== 'issued') throw new Error('You already made this call.');
  if (!['bid', 'no_bid'].includes(decision)) throw new Error('Bid or no-bid.');
  const gng = goNoGo(state, bid);
  bid.goNoGo = { decision, day: state.day, recommend: gng.recommend, fails: gng.fails, investigated: Boolean(bid.clue) };
  bid.quality = bidQuality(state, bid);
  bid.decision = decision;
  bid.decisionDay = state.day;
  if (decision === 'no_bid') {
    bid.status = 'no_bid';
    bid.hoursSpent += RFP.noBidHours;
    const deal = bid.dealId ? dealById(state, bid.dealId) : null;
    if (deal && isOpen(deal)) { addActivity(state, { type: 'note', text: 'Declined to bid on the RFP (no-bid)', dealId: deal.id, companyId: deal.companyId }); loseDeal(state, deal, 'No-bid: you declined the RFP'); }
    clearDeadlines(state, bid);
    return bid;
  }
  bid.status = 'bidding';
  bid.hoursSpent += RFP.readHours; bid.hoursLog.push(['read the RFP', RFP.readHours]);
  if (bid.source === 'public') attachDeal(state, bid);
  return bid;
}

// A public bid becomes a CRM company, contact and deal once you decide to bid, so award, contract and Stripe reuse the normal path.
function attachDeal(state, bid) {
  const seg = getSegment(bid.segmentId);
  const slug = norm(bid.buyer).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let co, ct = null;
  try { const r = addContact(state, { fullName: 'Procurement Office', email: `purchasing@${slug}.gov`, title: 'Purchasing Agent', company: bid.buyer, domain: `${slug}.gov`, industry: seg.label, size: String(seg.employees?.[1] ?? 500) }, { source: 'rfp' }); co = r.company; ct = r.contact; }
  catch { co = upsertCompany(state, { name: bid.buyer, domain: `${slug}.gov`, industry: seg.label, size: String(seg.employees?.[1] ?? 500), source: 'rfp' }); }
  co.segmentId = seg.id; co.segmentManual = true;
  const deal = ensureDeal(state, { companyId: co.id, contactId: ct?.id ?? null, source: 'inbound', stage: 'qualified' });
  const plan = mainPlan(state) ?? state.plans[0];
  Object.assign(deal, { name: `${bid.buyer} - ${bid.title}`, segmentId: seg.id, planId: plan.id, quantity: bid.quantity, annual: true, discountPct: 0, amount: bid.listPrice, rfpBidId: bid.id, decisionDay: null, hasPain: true, callQuality: 0.5 });
  deal.proc = { cardPay: false, rfp: true, coop: seg.procurement.coopContracts, board: null, poRequired: true, termsDays: seg.procurement.paymentTermsDays, earliestDecisionDay: null, notes: [`Public bid: ${bid.title}.`], bid: true };
  deal.paperwork = [];
  moveDeal(state, deal, 'proposal', 'responding to a public RFP');
  bid.dealId = deal.id; bid.companyId = co.id;
  return deal;
}

// ---------------------------------------------------------------------------
// Q&A and addenda
// ---------------------------------------------------------------------------

const Q_BUDGET = /\b(budget|anticipated (spend|cost|value|award)|not[- ]to[- ]exceed|funding (source|level|available)|estimated (value|contract)|price range|ceiling|appropriat)/i;
const Q_WEIGHTS = /\b(weight|weighting|evaluation criteria|scoring (rubric|criteria)|points?\b|relative importance|rubric|how will .{0,40}(scored|evaluated|weighted)|evaluation (factors|committee))/i;
const Q_INCUMBENT = /\b(incumbent|current (vendor|provider|system|solution|contract)|existing (contract|vendor|system|solution)|expir(e|es|ation)|renew|replac(e|ing))/i;
const Q_LOOSEN = /\b(accept|acceptable|equivalent|alternative|waive|substitute|phase|phased|clarify|partial|mandatory|required|must|satisf)/i;
const Q_REFNUM = /\b(?:requirement|req\.?|item|section|exhibit)?\s*#?\s*r-?\d{1,2}\b|\b(?:requirement|item|section|exhibit)\s*#?\s*[a-z]?\d+(?:\.\d+)?/i;
const Q_TIMELINE = /\b(timeline|go[- ]live|start date|award date|decision date|term of|renewal option)/i;
const Q_PITCH = /\b(our (product|platform|solution|company)|we (offer|provide|are the|have the best)|best[- ]in[- ]class|leading provider)/i;
const Q_SELF = /\b(will we win|can you confirm we|do you prefer|are you leaning|which vendor|favou?rite)\b/i;
const Q_EXT = /\b(extend|extension|more time)\b/i;

/** Heuristic judge of a Q&A question (offline; an LLM may refine it, see judgeQuestionLlm). Specific beats generic. */
export function judgeQuestion(text, bid = null) {
  const t = String(text ?? '').trim();
  const w = words(t);
  const issues = [];
  let kind = 'generic';
  const refNum = Q_REFNUM.test(t) || (bid ? bid.reqs.some((r) => t.toLowerCase().includes(r.n.toLowerCase())) : false);
  const reqHit = bid ? bid.reqs.filter((r) => !r.core).some((r) => { const toks = norm(r.text).split(/\W+/).filter((x) => x.length > 4); return toks.filter((x) => norm(t).includes(x)).length >= 2; }) : false;
  if (Q_BUDGET.test(t)) kind = 'budget';
  else if (Q_WEIGHTS.test(t)) kind = 'weights';
  else if ((refNum || reqHit) && Q_LOOSEN.test(t)) kind = 'requirement';
  else if (Q_INCUMBENT.test(t)) kind = 'incumbent';
  else if (Q_EXT.test(t)) kind = 'extension';
  else if (Q_TIMELINE.test(t)) kind = 'timeline';
  let s = 0.25;
  if (['budget', 'weights', 'requirement', 'incumbent'].includes(kind)) s += 0.3;
  if (refNum || reqHit) s += 0.2; else issues.push('Reference the exact requirement or section so the answer is specific.');
  if (w >= 8 && w <= 45) s += 0.1; else issues.push(w < 8 ? 'Too short to be answerable.' : 'Too long: one question at a time.');
  if ((t.match(/\?/g) ?? []).length === 1) s += 0.05; else if ((t.match(/\?/g) ?? []).length > 2) { s -= 0.1; issues.push('Several questions in one: ask them separately.'); }
  // A question that stacks every lever (budget, weights, incumbent, several requirement numbers) into one line is keyword
  // stuffing: officers answer it with "refer to the RFP" because no single answer fits.
  const levers = [Q_BUDGET.test(t), Q_WEIGHTS.test(t), Q_INCUMBENT.test(t), refNum && Q_LOOSEN.test(t)].filter(Boolean).length;
  const refs = new Set((t.match(/\br-?\d{1,2}\b/gi) ?? []).map((x) => x.toLowerCase().replace('-', ''))).size;
  if (levers >= 3 || refs >= 3) { s -= 0.4; issues.push('That stacks several questions and requirement numbers into one: officers answer that with "refer to the RFP". Ask one precise question per requirement.'); }
  if (Q_PITCH.test(t)) { s -= 0.3; issues.push('That is a pitch. Answers go to all bidders, so do not advertise or give your competitors ideas.'); }
  if (Q_SELF.test(t)) { s -= 0.3; issues.push('The buyer cannot tell you who they favour; it only marks you as a bidder who does not know the rules.'); }
  if (kind === 'extension') { s = Math.min(s, 0.3); issues.push('Asking for more time rarely works and tells every bidder you are behind.'); }
  if (kind === 'generic') issues.push('Ask about what you need to decide: budget, evaluation weights, one specific requirement, or the incumbent.');
  return { score: +clamp(s, 0, 1).toFixed(2), kind, issues, mock: true };
}

/** Optional LLM refinement of the heuristic (chat model judges, the heuristic is the offline fallback). */
export async function judgeQuestionLlm(llm, state, bid, text) {
  const base = judgeQuestion(text, bid);
  try {
    const res = await llm.ask({
      task: 'rfp_question_judge',
      system: `You are the procurement officer for ${bid.buyer} answering written vendor questions in an RFP Q&A period. Every answer is published to all bidders. Rate how answerable and decision-useful the vendor question is (0-1):
1.0 = one precise question about the budget, the evaluation weights, one numbered requirement (asking whether a specific alternative is acceptable) or the incumbent contract, grounded in the RFP text.
0.6 = a fair question about the RFP that is specific but less decision-relevant (timeline, format).
0.2 = generic ("tell us more", "any flexibility?"): you would answer "refer to the RFP".
0.0 = a sales pitch, flattery, asking which vendor you favour, or a list of three or more unrelated asks or requirement numbers crammed into one line (keyword stuffing): you cannot answer it. A focused two-part question on one topic is fine.
Feedback: one sentence a seasoned public-sector bidder would give, quoting the weak part if any.`,
      prompt: `RFP: ${bid.title} for ${bid.buyer}\nRequirements: ${bid.reqs.map((r) => `${r.n} ${r.text}`).join('; ')}\nVendor question: ${text}`,
      schema: { type: 'object', additionalProperties: false, required: ['score', 'feedback'], properties: { score: { type: 'number', description: '0-1' }, feedback: { type: 'string' } } },
      temperature: 0.2, maxTokens: 200,
      fallback: () => ({ score: base.score, feedback: '' }),
    });
    if (res?.mock) return base;
    const sc = clamp(Number(res?.data?.score ?? base.score), 0, 1);
    // The officer's read decides; the keyword heuristic only steadies it (it cannot tell a stuffed question from a sharp one).
    const score = Math.min(0.4 * base.score + 0.6 * sc, sc + 0.2);
    const fb = String(res?.data?.feedback ?? '').trim();
    return { ...base, score: +clamp(score, 0, 1).toFixed(2), issues: fb && score < 0.8 ? [fb, ...base.issues] : base.issues, feedback: fb, mock: false };
  } catch { return base; }
}

export function askQuestion(state, bid, text, judged = null) {
  if (!['issued', 'bidding'].includes(bid.status)) throw new Error('That bid is closed.');
  if (state.day > bid.qDeadline) throw new Error('The question deadline has passed. Written questions are no longer accepted.');
  const t = String(text ?? '').trim();
  if (words(t) < 4) throw new Error('Write the question.');
  if (bid.questions.some((q) => norm(q.text) === norm(t))) throw new Error('You already asked that.');
  const j = judged ?? judgeQuestion(t, bid);
  const dupKind = bid.questions.some((q) => q.kind === j.kind && ['budget', 'weights', 'incumbent'].includes(j.kind) && q.score >= 0.55);
  const q = { id: uid('q'), text: t.slice(0, 400), day: state.day, kind: j.kind, score: j.score, issues: j.issues, answered: false, answer: null, reveal: null, dup: dupKind };
  bid.questions.push(q);
  bid.hoursSpent += RFP.questionHours; bid.hoursLog.push(['Q&A question', RFP.questionHours]);
  return q;
}

function answerQuestions(state, bid) {
  const lines = [];
  for (const q of bid.questions) {
    if (q.answered) continue;
    q.answered = true;
    const r = u01(state, `${bid.id}|${q.id}|ans`);
    const p = q.dup ? 0 : clamp(0.3 + 0.7 * q.score, 0, 0.92); // good questions get answers; generic ones get "refer to the RFP"
    const informative = q.score >= 0.55 && r < p;
    if (q.kind === 'budget' && informative) { bid.budgetKnown = true; q.reveal = 'budget'; q.answer = `The anticipated annual budget is approximately ${money0(bid.budget)}.`; }
    else if (q.kind === 'weights' && informative) { bid.weightsKnown = true; q.reveal = 'weights'; q.answer = `Evaluation points: ${Object.entries(bid.weights).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}.`; }
    else if (q.kind === 'requirement' && informative) {
      const loose = bid.reqs.find((x) => x.loosenable && !x.loosened);
      const named = loose && (norm(q.text).includes(norm(loose.n)) || norm(loose.text).split(/\W+/).filter((x) => x.length > 4).filter((x) => norm(q.text).includes(x)).length >= 2);
      if (named) { loose.loosened = true; loose.mandatory = false; q.reveal = 'loosen'; q.answer = `${loose.n} is revised from mandatory to preferred (see addendum).`; }
      else { q.reveal = 'clarify'; q.answer = 'Proposers should respond to the requirement as written; partial compliance will be scored accordingly.'; }
    } else if (q.kind === 'incumbent' && informative) { q.reveal = 'incumbent'; if (!bid.clue) bid.clue = { likelyWired: bid.wired && u01(state, `${bid.id}|qclue`) < 0.8, day: state.day, text: bid.wired ? 'The buyer noted the current vendor has served them for years and that existing integrations must be preserved.' : 'The buyer confirmed the current contract ends this year and several vendors were invited.' }; q.answer = bid.clue.text; }
    else if (q.kind === 'extension' && r < 0.1) { q.reveal = 'extension'; bid.dueDay += 7; q.answer = 'The due date is extended by seven days.'; }
    else q.answer = 'Refer to the RFP document; no change.';
    lines.push(`Q: ${q.text}\nA: ${q.answer}`);
  }
  return lines;
}

function addAddendum(state, bid, text, { ackRequired = true, effect = null } = {}) {
  const a = { id: uid('add'), no: bid.addenda.length + 1, day: state.day, text, ackRequired, acked: false, effect };
  bid.addenda.push(a);
  emitSalesEvent(state, 'rfp_addendum_issued', { dealId: bid.dealId, bidId: bid.id, addendumNo: a.no }, `rfp_add:${bid.id}:${a.no}`);
  notify(state, `Addendum ${a.no} to ${bid.title} (${bid.buyer}). Read it and acknowledge it: an unsigned addendum can get a response thrown out.`, { type: 'warn', app: 'crm' });
  return a;
}

export function ackAddendum(state, bid, addendumId) {
  const a = bid.addenda.find((x) => x.id === addendumId);
  if (!a) throw new Error('Unknown addendum.');
  if (a.acked) throw new Error('Already acknowledged.');
  a.acked = true; a.ackDay = state.day;
  bid.hoursSpent += RFP.addendumHours; bid.hoursLog.push(['addendum', RFP.addendumHours]);
  return a;
}
export const unackedAddenda = (bid) => bid.addenda.filter((a) => a.ackRequired && !a.acked);

// ---------------------------------------------------------------------------
// Building the response
// ---------------------------------------------------------------------------

const live = (bid) => {
  if (bid.status !== 'bidding') throw new Error(bid.status === 'issued' ? 'Make the bid / no-bid call first.' : 'This response is no longer open for changes.');
};
const spend = (bid, label, h) => { bid.hoursSpent = +(bid.hoursSpent + h).toFixed(2); bid.hoursLog.push([label, +h.toFixed(2)]); };

export const formHours = (state, bid, formId) => {
  const f = bid.forms.find((x) => x.id === formId);
  if (!f) return 0;
  const h = f.id === 'insurance_cert' ? (assets(state).coi_insurance != null ? 0.5 : f.hours) : f.hours * libraryFactor(state);
  return +Math.max(0.1, h).toFixed(2);
};
export function completeForm(state, bid, formId) {
  live(bid);
  const f = bid.forms.find((x) => x.id === formId);
  if (!f) throw new Error('Unknown form.');
  if (f.done) throw new Error('Already done.');
  if (f.id === 'insurance_cert' && assets(state).coi_insurance == null) throw new Error('You have no insurance to certify. Buy coverage first (Credentials below).');
  f.done = true; f.doneDay = state.day;
  spend(bid, `form: ${f.label}`, formHours(state, bid, formId));
  return f;
}

export function credentialHours(state, id) {
  const c = RFP.credentials[id];
  if (!c) throw new Error('Unknown credential.');
  if (Array.isArray(c.hours)) return +(id === 'hecvat' ? hecvatNeeded(state, id) : c.hours[0]).toFixed(1);
  return c.hours;
}
function hecvatNeeded(state) {
  const r = u01(state, 'hecvat');
  const [lo, hi] = hasSoc2(state) ? RFP.hecvatWithSoc2 : hasLibrary(state) ? RFP.hecvatLibrary : RFP.hecvat;
  return between(lo, hi, r);
}
/** Buy or build a credential a bid asks for (insurance, VPAT, HECVAT). Chunked for the long ones. */
export function workCredential(state, id, hours, bid = null) {
  const c = RFP.credentials[id];
  if (!c) throw new Error('Unknown credential.');
  const A = (ensureCrm(state).paperAssets ??= {});
  if (A[c.asset] != null) throw new Error('You already have that.');
  const R = ensureRfp(state);
  const st = (R.creds[id] ??= { needed: id === 'hecvat' ? +hecvatNeeded(state).toFixed(1) : c.hours, progress: 0, paid: false });
  if (!st.paid && c.usd > 0) { post(state, { amount: -c.usd, counterparty: id === 'insurance' ? 'Insurance broker' : 'Accessibility auditor', description: c.label, category: 'other', method: 'card' }); st.paid = true; }
  const h = Math.min(hours, st.needed - st.progress);
  st.progress = +(st.progress + h).toFixed(2);
  if (bid) spend(bid, `credential: ${c.label}`, h);
  if (st.progress + 1e-9 >= st.needed) { A[c.asset] = state.day; delete R.creds[id]; return true; }
  return false;
}

export function matrixHours(state, bid) { return +(bid.reqs.length * RFP.matrixPerReq * libraryFactor(state)).toFixed(2); }
/** Fill the compliance matrix. answers: { reqId: 'comply' | 'partial' | 'roadmap' | 'no' }. */
export function answerMatrix(state, bid, answers) {
  live(bid);
  for (const [id, a] of Object.entries(answers)) {
    if (!bid.reqs.some((r) => r.id === id)) throw new Error(`Unknown requirement ${id}.`);
    if (!(a in ANSWER_VALUE)) throw new Error(`Unknown answer ${a}.`);
  }
  const first = !Object.keys(bid.response.matrix).length;
  Object.assign(bid.response.matrix, answers);
  spend(bid, 'compliance matrix', first ? matrixHours(state, bid) : 0.25);
  const oc = overclaims(state, bid);
  return { overclaims: oc.length, boost: oc.reduce((a, x) => a + x.req.weight * (ANSWER_VALUE[x.answer] - ANSWER_VALUE[honestAnswer(x.truth)]), 0) };
}

export function securityHoursNeeded(state, bid) {
  if (!bid.securityRequired) return 0;
  const seed = bid.id;
  switch (bid.securityKind) {
    case 'hecvat': return +(hasSoc2(state) ? between(...RFP.hecvatWithSoc2, u01(state, `sec|${seed}`)) : hasLibrary(state) ? between(...RFP.hecvatLibrary, u01(state, `sec|${seed}`)) : between(...RFP.hecvat, u01(state, `sec|${seed}`))).toFixed(1);
    case 'custom': return hasSoc2(state) ? RFP.customWithSoc2 : hasLibrary(state) ? RFP.customLibrary : +between(...RFP.customSecurity, u01(state, `sec|${seed}`)).toFixed(1);
    default: return questionnaireHours({ soc2: hasSoc2(state), library: hasLibrary(state), seed });
  }
}
/** Work on the security questionnaire (SIG Lite / CAIQ / HECVAT / custom). Chunked like other long paperwork. */
export function workSecurity(state, bid, hours) {
  live(bid);
  if (!bid.securityRequired) throw new Error('This RFP has no security questionnaire.');
  const s = (bid.response.security ??= { kind: bid.securityKind, needed: securityHoursNeeded(state, bid), progress: 0, done: false });
  if (s.done) throw new Error('Already complete.');
  const h = Math.min(hours, s.needed - s.progress); // you cannot spend more hours than the questionnaire has questions
  s.progress = +(s.progress + h).toFixed(2);
  spend(bid, `security questionnaire (${bid.securityKind})`, h);
  if (s.progress + 1e-9 >= s.needed) {
    s.done = true; s.doneDay = state.day;
    if (bid.securityKind === 'hecvat') (ensureCrm(state).paperAssets ??= {}).hecvat = state.day;
  }
  return s.done;
}

export function setPrice(state, bid, price) {
  live(bid);
  const p = Math.round(Number(price));
  if (!(p > 0)) throw new Error('Enter an annual price.');
  if (p > bid.listPrice * 1.5) throw new Error('A price 50% above your own list price will not survive a comparison with the budget.');
  const first = !bid.response.pricingDone;
  bid.response.price = p; bid.response.pricingDone = true;
  spend(bid, 'pricing form', first ? RFP.pricingHours : RFP.repriceHours);
  return p;
}

export function chooseReferences(state, bid, customerIds) {
  live(bid);
  const cands = referenceCandidates(state, bid);
  const ids = [...new Set(customerIds)].filter((id) => cands.some((c) => c.id === id)).slice(0, 3);
  if (!ids.length) throw new Error('Pick customers who are paying you today and agreed to take the call.');
  bid.response.refs = ids;
  spend(bid, 'references', RFP.refHours);
  return ids;
}

/** Executive summary judge: specific to this buyer and scope beats boilerplate. Offline heuristic. */
export function judgeSummary(state, bid, text) {
  const t = String(text ?? '').trim();
  const lower = norm(t);
  const w = words(t);
  const issues = [];
  let s = 0.15;
  const buyerToks = norm(bid.buyer).split(/\W+/).filter((x) => x.length > 3 && !['city', 'state', 'county', 'district', 'school', 'unified', 'regional'].includes(x));
  if (buyerToks.some((x) => lower.includes(x))) s += 0.15; else issues.push('Never names the buyer.');
  const scopeToks = [...new Set(norm(`${bid.scope} ${bid.title}`).split(/\W+/).filter((x) => x.length > 5))];
  const reqToks = [...new Set(bid.reqs.filter((r) => !r.core).flatMap((r) => norm(r.text).split(/\W+/).filter((x) => x.length > 5)))];
  const hits = [...scopeToks, ...reqToks].filter((x) => lower.includes(x)).length;
  s += Math.min(0.3, hits * 0.06);
  if (hits < 3) issues.push('Does not echo their stated problem or requirements.');
  if (/\d/.test(t)) s += 0.1; else issues.push('No numbers: hours saved, go-live weeks, customer results.');
  if (/\b\d+\s*(weeks?|days?|months?)\b/i.test(t)) s += 0.1; else issues.push('No implementation timeline.');
  if (/\b(customer|district|city|county|university|hospital|bank)\b[^.]{0,60}\b(reduced|cut|saved|went|moved|launched)\b/i.test(t)) s += 0.1;
  if (w >= 120 && w <= bid.pageLimit * 450) s += 0.1; else if (w < 120) issues.push('Too thin for an executive summary and approach.'); else issues.push(`Over the ${bid.pageLimit}-page limit (${Math.ceil(w / 450)} pages).`);
  const fluff = BUZZWORDS.filter((b) => lower.includes(b)).length + AI_SLOP.filter((b) => lower.includes(b)).length + ['leading provider', 'pleased to submit', 'one-stop', 'solutions provider', 'we look forward', 'proven track record', 'industry leader', 'cutting edge'].filter((b) => lower.includes(b)).length;
  s -= Math.min(0.4, fluff * 0.07);
  if (fluff) issues.push(`${fluff} stock phrase(s) a reviewer has read a hundred times.`);
  const prior = bidsOf(state).filter((b) => b !== bid && b.response?.summary).map((b) => b.response.summary.text);
  const copied = prior.some((p) => similar(p, t) > 0.75);
  if (copied) { s -= 0.4; issues.push('This is the summary you sent another buyer. Evaluators notice.'); }
  const score = +clamp(s, 0, 1).toFixed(2);
  return { score, boilerplate: score < 0.35 || copied, issues, words: w, pages: Math.ceil(w / 450), mock: true };
}
const similar = (a, b) => { const A = new Set(norm(a).split(/\W+/).filter(Boolean)), B = new Set(norm(b).split(/\W+/).filter(Boolean)); if (!A.size || !B.size) return 0; let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };

export function writeSummary(state, bid, text) {
  live(bid);
  const j = judgeSummary(state, bid, text);
  if (j.words < 20) throw new Error('Write the executive summary and approach.');
  bid.response.summary = { text: String(text).slice(0, 12000), ...j, day: state.day };
  spend(bid, 'executive summary', RFP.summaryHours);
  if (j.boilerplate) logMistake(state, { functionId: 'rfp_bids', id: 'boilerplate_response', label: 'Sent a boilerplate executive summary', app: 'crm', key: `boiler:${bid.id}`, cost: { hours: RFP.summaryHours, reputation: 0.1 }, detail: `${bid.buyer}'s evaluators read ${j.issues.slice(0, 2).join(' ')} The hours went into text that earns almost no technical points. A stellar response names the buyer, echoes their problem and gives numbers and a timeline.` });
  return j;
}

/** The pre-submission compliance check (about an hour, removes the most common loss: research public-sector §3). */
export function complianceProblems(state, bid) {
  const out = [];
  const miss = bid.forms.filter((f) => !f.done && !f.optional);
  if (miss.length) out.push({ id: 'forms', text: `Missing forms: ${miss.map((f) => f.label).join(', ')}.` });
  const un = unackedAddenda(bid);
  if (un.length) out.push({ id: 'addenda', text: `Addendum ${un.map((a) => a.no).join(', ')} not acknowledged.` });
  const unanswered = bid.reqs.filter((r) => !bid.response.matrix[r.id]);
  if (unanswered.length) out.push({ id: 'matrix', text: `${unanswered.length} requirement(s) unanswered in the compliance matrix: ${unanswered.slice(0, 4).map((r) => r.n).join(', ')}.` });
  const mandFail = bid.reqs.filter((r) => r.mandatory && ['no', 'roadmap'].includes(bid.response.matrix[r.id]));
  if (mandFail.length) out.push({ id: 'mandatory', text: `A "No" or "Roadmap" on a mandatory item fails pass/fail screening: ${mandFail.map((r) => r.n).join(', ')}.` });
  if (bid.securityRequired && !bid.response.security?.done) out.push({ id: 'security', text: `Security questionnaire (${bid.securityKind}) not finished.` });
  if (!bid.response.pricingDone) out.push({ id: 'price', text: 'Pricing form not filled in.' });
  if (!bid.response.refs.length) out.push({ id: 'refs', text: 'No references listed.' });
  if (!bid.response.summary) out.push({ id: 'summary', text: 'No executive summary / approach.' });
  else if (bid.response.summary.pages > bid.pageLimit) out.push({ id: 'pages', text: `Narrative is ${bid.response.summary.pages} pages; the limit is ${bid.pageLimit}.` });
  const oc = overclaims(state, bid).filter((x) => x.severity >= 0.5);
  if (oc.length) out.push({ id: 'overclaim', text: `${oc.length} answer(s) claim more than the product does today (${oc.slice(0, 3).map((x) => x.req.n).join(', ')}). Buyers check against the demo and the contract.` });
  if (state.day >= bid.dueDay) out.push({ id: 'late', text: 'Due today: portal and upload trouble on the last day disqualifies bidders every cycle. Submit a day early.' });
  return out;
}
export function runComplianceCheck(state, bid) {
  live(bid);
  bid.checked = true;
  bid.lastCheck = { day: state.day, problems: complianceProblems(state, bid) };
  spend(bid, 'compliance check', RFP.checkHours);
  return bid.lastCheck.problems;
}

export function submitBid(state, bid) {
  live(bid);
  if (!bid.response.pricingDone) bid.response.price = null;
  const pagesOver = (bid.response.summary?.pages ?? 0) > bid.pageLimit;
  bid.submission = { day: state.day, late: state.day > bid.dueDay, lastDay: state.day === bid.dueDay, pagesOver, problems: complianceProblems(state, bid).map((p) => p.id) };
  bid.submission.portalFail = bid.submission.lastDay && u01(state, `${bid.id}|portal`) < RFP.pDisqualifiedPortal;
  bid.overclaimsAtSubmit = overclaims(state, bid).map((x) => ({ id: x.req.id, severity: x.severity, truth: x.truth, answer: x.answer }));
  bid.status = 'submitted';
  bid.submittedDay = state.day;
  spend(bid, 'assemble and submit', RFP.submitHours);
  bid.screenDay = bid.dueDay + RFP.screenLag;
  bid.evalDay = bid.dueDay + dayInt(...RFP.evalDays[bid.public ? 'public' : 'private'], u01(state, `${bid.id}|eval`));
  clearDeadlines(state, bid);
  addActivity(state, { type: 'note', text: `Submitted the RFP response to ${bid.buyer}`, dealId: bid.dealId, companyId: bid.companyId });
  return bid;
}

/** Save vetted answers, forms and the security answers into a reusable library (stellar habit): later bids cost less. */
export function addToLibrary(state, bid) {
  if (!['submitted', 'shortlisted', 'bafo', 'notice_of_intent', 'negotiation', 'board', 'awarded', 'won', 'lost'].includes(bid.status)) throw new Error('Submit the response first.');
  if (bid.library) throw new Error('Already in the library.');
  const R = ensureRfp(state);
  const answered = Object.keys(bid.response.matrix).length;
  const honest = overclaims(state, bid).length === 0;
  // Answers that overclaim are not saved: a library full of "comply" on unbuilt features would poison the next bid.
  const add = Math.round(answered * (honest ? 1 : 0.5) + bid.forms.filter((f) => f.done).length + (bid.response.security?.done ? 10 : 0));
  R.library.entries += add; R.library.bids++; R.library.lastDay = state.day;
  bid.library = true;
  spend(bid, 'save to content library', RFP.libraryHours);
  return { added: add, entries: R.library.entries, factor: libraryFactor(state) };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function priceScore(price, budget) {
  const r = price / Math.max(1, budget);
  return r <= 0.85 ? 100 : clamp(100 - (r - 0.85) * 160, 0, 100); // r=1 -> 76, r=1.2 -> 44, r>=1.475 -> 0 [design]
}

/** Weighted rubric score (0-100) for what the bid claims, plus the parts. Wired bids are capped. */
export function scoreBid(state, bid, { price = null, matrix = bid.response.matrix, refs = bid.response.refs, summary = bid.response.summary, demo = 0 } = {}) {
  const reqW = bid.reqs.reduce((a, r) => a + r.weight, 0);
  let tech = bid.reqs.reduce((a, r) => a + r.weight * ANSWER_VALUE[matrix[r.id] ?? 'no'], 0) / Math.max(1, reqW) * 100;
  tech *= 0.88 + 0.12 * (summary?.score ?? 0);
  if (bid.securityRequired && !bid.response.security?.done) tech *= 0.8;
  const p = price ?? bid.response.price ?? bid.listPrice;
  const cands = referenceCandidates(state, bid);
  const chosen = refs.map((id) => cands.find((c) => c.id === id)).filter(Boolean);
  let exp = [0, 45, 75, 92][Math.min(3, chosen.length)];
  if (chosen.some((c) => c.same)) exp += 8; else if (chosen.some((c) => c.group)) exp += 4;
  exp = clamp(exp, 0, 100);
  const local = bid.localPct > 0 ? (bid.forms.find((f) => f.id === 'local_pref')?.done ? 90 : 20) : 0;
  const parts = { technical: clamp(tech, 0, 100), price: priceScore(p, bid.budget), experience: exp, local };
  const w = bid.weights;
  let total = parts.technical * w.technical + parts.price * w.price + parts.experience * w.experience + parts.local * w.local;
  if (bid.shapedForYou) total += 5; // pre-issue engagement helped shape the criteria in your favour
  total += demo;
  const capped = bid.wired && total > RFP.wiredCap;
  if (capped) total = RFP.wiredCap;
  return { ...parts, total: +total.toFixed(1), capped, weights: w };
}

function screening(state, bid) {
  const reasons = [];
  const sub = bid.submission;
  if (sub.late || sub.portalFail) return [{ id: 'late', text: sub.portalFail ? 'The response was uploaded after the 4:30 pm cutoff on the due date and was rejected unread.' : 'Received after the deadline; rejected unread.' }];
  const d = (id, p) => u01(state, `${bid.id}|dq|${id}`) < p;
  const miss = bid.forms.filter((f) => !f.done && !f.optional);
  if (miss.length && d('forms', 1 - RFP.minorInformalityWaived)) reasons.push({ id: 'forms', text: `Non-responsive: ${miss.map((f) => f.label).join(', ')} missing.` });
  const un = unackedAddenda(bid);
  if (un.length && d('addenda', 0.7)) reasons.push({ id: 'addenda', text: `Addendum ${un.map((a) => a.no).join(', ')} not acknowledged.` });
  if (sub.pagesOver && d('pages', 0.6)) reasons.push({ id: 'pages', text: 'Exceeded the page limit.' });
  for (const r of bid.reqs) {
    const a = bid.response.matrix[r.id] ?? 'no';
    if (r.mandatory && !r.loosened && ['no', 'roadmap'].includes(a)) reasons.push({ id: 'mandatory', text: `Failed pass/fail requirement ${r.n}: ${r.text}.` });
    else if (r.cert && r.mandatory && a === 'comply' && reqTruth(state, r) !== 'full' && d(`cert${r.id}`, 0.9)) reasons.push({ id: 'false_cert', text: `Claimed "${r.text}" but could not produce the document when asked.` });
  }
  return reasons;
}

function lossCause(state, bid, ev) {
  if (ev.dq) return ev.dq[0].id;
  if (bid.wired) return 'wired';
  const lag = [['technical', ev.parts.technical * bid.weights.technical], ['price', ev.parts.price * bid.weights.price], ['experience', ev.parts.experience * bid.weights.experience]]
    .map(([k, v]) => [k, bid.weights[k] * 100 - v]).sort((a, b) => b[1] - a[1]);
  if (ev.demoPenalty) return 'demo';
  if ((bid.response.summary?.boilerplate)) return 'summary';
  return lag[0][0];
}

const CAUSE_TEXT = {
  late: 'Late submission.', forms: 'A required form was missing.', addenda: 'An addendum was not acknowledged.', pages: 'Page limit exceeded.', mandatory: 'A mandatory requirement was not met.', false_cert: 'A certification claim could not be backed up.',
  wired: 'The bid was written around the incumbent: criteria you could not match, a named integration or an existing contract.', technical: 'Technical score: your answers on the weighted requirements scored below the winner\'s.', price: 'Price: your price was above the budget and the winner was cheaper.', experience: 'Experience: too few references in their segment.', demo: 'The scripted demo did not address their scenarios.', summary: 'The executive summary read as boilerplate.',
};
export { CAUSE_TEXT };

function evaluate(state, bid) {
  const dq = screening(state, bid);
  const ev = { day: state.day, dq: dq.length ? dq : null, parts: null, total: 0 };
  if (dq.length) { bid.eval = ev; return ev; }
  const s = scoreBid(state, bid);
  ev.parts = s; ev.total = s.total + gaussian(state) * 1.5;
  bid.eval = ev;
  // The field: competitors score around the mean; a wired bid has an incumbent far ahead.
  const n = dayInt(...RFP.fieldSize, rng(state));
  bid.field = Array.from({ length: n }, (_, i) => ({ name: `Vendor ${String.fromCharCode(65 + i)}`, score: +clamp(RFP.fieldMean + gaussian(state) * RFP.fieldSd, 30, 95).toFixed(1) }));
  if (bid.wired) bid.field.push({ name: 'The incumbent', score: +(RFP.incumbentScore + gaussian(state) * 3).toFixed(1), incumbent: true });
  return ev;
}

const rankOf = (bid, total) => 1 + bid.field.filter((f) => f.score > total).length;

function screenAndEvaluate(state, bid) {
  const ev = evaluate(state, bid);
  if (bid.wired && !ev.dq) logMistake(state, { functionId: 'rfp_bids', id: 'bid_on_wired_rfp', label: 'Bid on an RFP wired for an incumbent', app: 'crm', key: `wired:${bid.id}`, cost: { hours: bid.hoursSpent, days: 14 }, detail: `${bid.buyer}'s criteria were written around the vendor they already had; your score was capped at ${RFP.wiredCap}/100 and the incumbent was scored far ahead. ${bid.hoursSpent.toFixed(0)} h went into a bid that was never open. A stellar operator asks "is this a formality?" before deciding, and builds the relationship before the RFP is issued.` });
  if (ev.dq) return lose(state, bid, ev, 'disqualified');
  const placed = rankOf(bid, ev.total);
  if (placed > RFP.shortlist || ev.total < 45) return lose(state, bid, ev, 'lost');
  bid.status = 'shortlisted'; bid.shortlistedDay = state.day;
  bid.oralsDay = state.day + dayInt(...RFP.oralsLag[bid.public ? 'public' : 'private'], u01(state, `${bid.id}|orals`));
  emitSalesEvent(state, 'rfp_shortlisted', { dealId: bid.dealId, bidId: bid.id, buyer: bid.buyer }, `rfp_short:${bid.id}`);
  notify(state, `${bid.buyer} shortlisted you for ${bid.title}. Scripted demo / orals on ${fmtDate(state, bid.oralsDay)}: prepare against their scenarios.`, { type: 'good', app: 'crm' });
  scheduleOrals(state, bid);
  return bid;
}

function lose(state, bid, ev, status) {
  bid.status = status === 'disqualified' ? 'disqualified' : 'lost';
  bid.lossDay = state.day;
  bid.lossNoticeDay = bid.lossDay;
  bid.cause = lossCause(state, bid, ev);
  bid.debriefBy = bid.lossDay + RFP.debriefDays;
  bid.protestBy = bid.lossDay + (bid.public ? dayInt(...RFP.protestDays, u01(state, `${bid.id}|prot`)) : 0);
  const dq = ev.dq?.[0];
  if (dq) {
    const ids = {
      late: ['late_submission', 'Submitted after the deadline', { hours: bid.hoursSpent, reputation: 0.3 }],
      forms: ['disqualified_missing_form', 'Disqualified for a missing form', { hours: bid.hoursSpent, reputation: 0.3 }],
      addenda: ['disqualified_missing_form', 'Disqualified: addendum not acknowledged', { hours: bid.hoursSpent, reputation: 0.3 }],
      pages: ['disqualified_missing_form', 'Disqualified for the page limit', { hours: bid.hoursSpent, reputation: 0.2 }],
      mandatory: ['disqualified_mandatory_requirement', 'Failed a mandatory requirement', { hours: bid.hoursSpent, reputation: 0.2 }],
      false_cert: ['false_certification_claim', 'Claimed a certification you do not hold', { hours: bid.hoursSpent, reputation: 1 }],
    }[dq.id];
    if (ids) logMistake(state, { functionId: 'rfp_bids', id: ids[0], label: ids[1], app: 'crm', key: `dq:${bid.id}`, cost: ids[2], detail: `${dq.text} ${bid.hoursSpent.toFixed(0)} h of bid work were thrown out unread. ${dq.id === 'late' ? 'Submit with a one-day buffer: buyers reject bids that miss the cutoff by minutes.' : 'Run the compliance check (about an hour) before you submit: it removes the most common loss.'}` });
  }
  finishLoss(state, bid);
  return bid;
}

function finishLoss(state, bid) {
  const deal = bid.dealId ? dealById(state, bid.dealId) : null;
  if (deal && isOpen(deal)) loseDeal(state, deal, bid.status === 'disqualified' ? 'RFP response disqualified' : 'Lost the formal RFP to another bidder');
  emitSalesEvent(state, 'rfp_lost', { dealId: bid.dealId, bidId: bid.id, buyer: bid.buyer, cause: bid.cause, debriefBy: bid.debriefBy }, `rfp_lost:${bid.id}`);
  notify(state, `${bid.buyer} did not select you for ${bid.title}. Ask for the debrief within ${RFP.debriefDays} days (by ${fmtDate(state, bid.debriefBy)}): it shows the real scores.`, { type: 'warn', app: 'crm' });
  // Repeating a loss you never debriefed is going in circles.
  const prior = bidsOf(state).find((b) => b !== bid && b.cause === bid.cause && ['lost', 'disqualified'].includes(b.status) && !b.debrief && b.cause !== 'wired' && b.lossDay != null && bid.lossDay - b.lossDay < 365 && b.noDebriefLogged);
  if (prior) logMistake(state, { functionId: 'rfp_bids', id: 'repeated_rfp_loss', label: 'Lost the same way twice', app: 'crm', circles: true, key: `repeat:${bid.id}`, cost: { hours: Math.round(bid.hoursSpent * 0.5), days: 14 }, detail: `Cause: ${CAUSE_TEXT[bid.cause] ?? bid.cause} You did not ask for a debrief after ${prior.buyer}, so nothing changed in the next response.` });
}

export function prepareOrals(state, bid, plan) {
  if (bid.status !== 'shortlisted') throw new Error('Demo preparation opens when you are shortlisted.');
  const t = String(plan ?? '').trim();
  if (words(t) < 15) throw new Error('Write the demo script: one section per scenario they gave you.');
  const lower = norm(t);
  const cover = bid.scenarios.filter((sc) => { const toks = norm(sc).split(/\W+/).filter((x) => x.length > 4); return toks.filter((x) => lower.includes(x)).length >= Math.min(3, Math.ceil(toks.length / 2)); }).length / bid.scenarios.length;
  const score = clamp(0.15 + 0.6 * cover + (/\b(\d+\s*(min|minutes))\b/i.test(t) ? 0.1 : 0) + (/\b(question|q&a|follow[- ]?up)\b/i.test(t) ? 0.05 : 0) + (norm(bid.buyer).split(/\W+/).some((x) => x.length > 4 && lower.includes(x)) ? 0.1 : 0), 0, 1);
  bid.orals = { plan: t.slice(0, 4000), score: +score.toFixed(2), cover: +cover.toFixed(2), day: state.day };
  spend(bid, 'prepare demo / orals', RFP.oralsPrepHours);
  return bid.orals;
}

function scheduleOrals(state, bid) {
  try {
    const slot = findSlots(state, { fromDay: bid.oralsDay, duration: 90, count: 1 })[0];
    if (slot) { bid.oralsDay = slot.day; scheduleEvent(state, { title: `RFP demo / orals: ${bid.buyer}`, kind: 'meeting', app: 'crm', refId: bid.id, with: bid.buyer, day: slot.day, start: slot.start, duration: 90, notes: bid.scenarios.join('; ') }); }
  } catch { /* calendar full: the meeting still happens on the day */ }
}

function runOrals(state, bid) {
  const prep = bid.orals?.score;
  let delta = prep == null ? -6 : (prep - 0.5) * 16; // unprepared is -6, a scripted demo up to +8 [design]
  const caught = overclaims(state, bid, bid.response.matrix).filter((x) => x.severity >= 0.5 && u01(state, `${bid.id}|caught|${x.req.id}`) < 0.35);
  if (caught.length) delta -= Math.min(15, caught.length * 5);
  bid.demo = { delta: +delta.toFixed(1), prepared: prep != null, caught: caught.map((x) => x.req.n) };
  bid.eval.demoPenalty = delta < -2;
  if (caught.length) notify(state, `${bid.buyer}'s panel asked to see ${caught.map((x) => x.req.n).join(', ')} live and the product could not do it as answered.`, { type: 'bad', app: 'crm' });
  // BAFO round for the top two (research: optional, short, late step).
  const invite = u01(state, `${bid.id}|bafo`) < (bid.public ? 0.6 : 0.5);
  if (invite) {
    bid.status = 'bafo'; bid.bafo = { invitedDay: state.day, dueDay: state.day + RFP.bafoDays, price: null, cutPct: 0 };
    notify(state, `${bid.buyer} invited a best and final offer (BAFO) by ${fmtDate(state, bid.bafo.dueDay)}. Dropping price too far hurts your margin.`, { type: 'info', app: 'crm' });
  } else { bid.status = 'finalists'; bid.finalDay = state.day + RFP.finalLag; }
}

export function bafoPriceInfo(bid, cutPct) {
  const base = bid.response.price ?? bid.listPrice;
  const price = Math.round(base * (1 - cutPct));
  return { price, belowCost: price < bid.floor, shortfall: Math.max(0, bid.floor - price) };
}
/** Best and final offer: cut price (and say what you ask in return). A price under cost is logged as a mistake. */
export function submitBafo(state, bid, { cutPct = 0, term = '' } = {}) {
  if (bid.status !== 'bafo') throw new Error('No BAFO was requested.');
  if (bid.bafo.submittedDay != null) throw new Error('You already sent your best and final offer.');
  const c = clamp(Number(cutPct) || 0, 0, 0.6);
  const info = bafoPriceInfo(bid, c);
  bid.bafo = { ...bid.bafo, price: info.price, cutPct: c, term: String(term).slice(0, 300), submittedDay: state.day, tradedForTerm: /\b(multi[- ]?year|three[- ]year|3[- ]year|two[- ]year|prepay|annual prepay|longer term)\b/i.test(term) };
  spend(bid, 'BAFO', RFP.bafoHours);
  if (info.belowCost) {
    logMistake(state, { functionId: 'rfp_bids', id: 'bafo_below_cost', label: 'BAFO below cost', app: 'crm', key: `bafo:${bid.id}`, cost: { usd: Math.round(info.shortfall), hours: 4 }, charge: true,
      detail: `You offered ${money0(info.price)} a year; hosting, support and implementation cost about ${money0(bid.floor)}. If you win, every year of the contract loses roughly ${money0(info.shortfall)} before your own time. Trade price for term or scope instead of cutting to the bone.` });
  }
  return { ...info, cutPct: c };
}

function finalDecision(state, bid) {
  const ev = bid.eval;
  let price = bid.response.price ?? bid.listPrice;
  let total = ev.total + (bid.demo?.delta ?? 0);
  if (bid.bafo?.price != null) { price = bid.bafo.price; total += bid.weights.price * (priceScore(price, bid.budget) - ev.parts.price) + (bid.bafo.tradedForTerm ? 1.5 : 0); }
  else if (bid.status === 'bafo' || bid.bafo) total -= 2; // finalists who cut price gain ground on you
  if (bid.wired && total > RFP.wiredCap + (bid.demo?.delta > 0 ? 4 : 0)) total = RFP.wiredCap + Math.max(0, (bid.demo?.delta ?? 0) / 2);
  bid.finalTotal = +total.toFixed(1);
  bid.finalPrice = Math.round(price);
  const finalists = bid.field.slice().sort((a, b) => b.score - a.score).slice(0, 2);
  const best = Math.max(...finalists.map((f) => f.score + (bid.bafo ? 1 + 3 * u01(state, `${bid.id}|fb|${f.name}`) : 0) + gaussian(state) * 2));
  if (total + gaussian(state) * 2 >= best) return award(state, bid);
  bid.rank = rankOf(bid, total);
  bid.cause = lossCause(state, bid, ev);
  if (bid.demo?.caught?.length) bid.cause = 'demo';
  bid.status = 'lost'; bid.lossDay = state.day; bid.lossNoticeDay = state.day;
  bid.debriefBy = state.day + RFP.debriefDays; bid.protestBy = state.day + (bid.public ? dayInt(...RFP.protestDays, u01(state, `${bid.id}|prot`)) : 0);
  finishLoss(state, bid);
}

function award(state, bid) {
  bid.status = 'notice_of_intent'; bid.noiDay = state.day;
  emitSalesEvent(state, 'rfp_awarded', { dealId: bid.dealId, bidId: bid.id, buyer: bid.buyer, price: bid.finalPrice }, `rfp_award:${bid.id}`);
  const pdays = bid.public ? dayInt(...RFP.protestDays, u01(state, `${bid.id}|prot`)) : 0;
  bid.protestEnds = state.day + pdays;
  bid.protested = bid.public && u01(state, `${bid.id}|protested`) < 0.06;
  notify(state, `${bid.buyer} posted a notice of intent to award ${bid.title} to you.${pdays ? ` Protest window runs to ${fmtDate(state, bid.protestEnds)}.` : ''} Contract negotiation is next.`, { type: 'good', app: 'crm' });
  bid.nextDay = bid.protestEnds;
  return bid;
}

function startNegotiation(state, bid) {
  if (bid.protested) {
    bid.protested = false; bid.protestUpheld = u01(state, `${bid.id}|sust`) < RFP.sustainRate;
    if (bid.protestUpheld) { bid.status = 'lost'; bid.cause = 'protest'; bid.lossDay = state.day; bid.debriefBy = state.day; bid.noDebriefLogged = true; const d = bid.dealId ? dealById(state, bid.dealId) : null; if (d && isOpen(d)) loseDeal(state, d, 'Award overturned on a competitor\'s protest'); emitSalesEvent(state, 'rfp_lost', { dealId: bid.dealId, bidId: bid.id, buyer: bid.buyer, cause: 'protest' }, `rfp_lost:${bid.id}`); notify(state, `A competitor's protest was sustained: ${bid.buyer} cancelled your award.`, { type: 'bad', app: 'crm' }); return; }
    bid.protestEnds = state.day + 20; bid.nextDay = bid.protestEnds;
    notify(state, `A losing bidder protested ${bid.buyer}'s award to you. It was denied after a delay of about three weeks.`, { type: 'warn', app: 'crm' });
    return;
  }
  bid.status = 'negotiation';
  bid.nextDay = state.day + dayInt(...RFP.negotiateDays[bid.public ? 'public' : 'private'], u01(state, `${bid.id}|neg`));
}

function nextBoardDay(state, from) {
  for (let d = from; d < from + 60; d++) if (dateOf(state, d).getUTCDate() === 15 && !isWeekend(state, d)) return d;
  return from + 14;
}

function contractStep(state, bid) {
  const deal = bid.dealId ? dealById(state, bid.dealId) : null;
  if (!deal || !isOpen(deal)) { bid.status = 'lost'; bid.cause = 'protest'; return; }
  const seg = getSegment(bid.segmentId);
  const needsBoard = bid.public && (deal.proc?.board || u01(state, `${bid.id}|board`) < Math.max(0.5, seg.procurement.boardApproval.prob));
  if (needsBoard && bid.status !== 'board') {
    bid.status = 'board'; bid.boardDay = nextBoardDay(state, state.day + 7); bid.nextDay = bid.boardDay;
    if (u01(state, `${bid.id}|slip`) < 0.2) { bid.boardDay = nextBoardDay(state, bid.boardDay + 5); bid.nextDay = bid.boardDay; } // the item slipped to the next meeting [design]
    notify(state, `${bid.buyer}'s council or board votes on your contract on ${fmtDate(state, bid.boardDay)}.`, { type: 'info', app: 'crm' });
    return;
  }
  bid.status = 'awarded'; bid.awardedDay = state.day;
  const price = bid.finalPrice ?? bid.listPrice;
  deal.amount = price;
  deal.discountPct = clamp(1 - price / Math.max(1, bid.listPrice), 0, 0.9);
  deal.rfpAwarded = true;
  deal.rfpScore = bid.finalTotal;
  deal.decisionDay = null;
  if (deal.proc && bid.viaCoop) deal.proc.viaCoop = true;
  addActivity(state, { type: 'note', text: `Awarded ${bid.title} at ${money0(price)} a year; contract out for signature`, dealId: deal.id, companyId: deal.companyId });
  sendContract(state, deal);
}

export function requestDebrief(state, bid) {
  if (!['lost', 'disqualified'].includes(bid.status)) throw new Error('There is nothing to debrief.');
  if (bid.debrief) throw new Error('You already had the debrief.');
  if (state.day > bid.debriefBy) throw new Error(`The debrief window closed on ${fmtDate(state, bid.debriefBy)} (${RFP.debriefDays} days after the notice). Buyers rarely grant late requests.`);
  const ev = bid.eval;
  const lines = [];
  if (ev?.dq) lines.push(...ev.dq.map((d) => d.text));
  if (ev?.parts) {
    for (const k of ['technical', 'price', 'experience', 'local']) if (bid.weights[k] > 0) lines.push(`${k[0].toUpperCase() + k.slice(1)}: ${Math.round(ev.parts[k])}/100 (weight ${Math.round(bid.weights[k] * 100)}%).`);
    if (ev.parts.capped) lines.push(`Your total was held to ${RFP.wiredCap}: the evaluation criteria matched the incumbent's platform.`);
  }
  const winner = bid.field ? bid.field.slice().sort((a, b) => b.score - a.score)[0] : null;
  const advice = [];
  if (bid.cause === 'wired') advice.push('Before the next RFP, meet the buyer a year before it is issued, and ask in the Q&A whether the current contract is expiring.');
  if (bid.cause === 'price') advice.push('You were above budget. Ask for the budget in the Q&A and size the quote to it, or trade term for price in the BAFO.');
  if (bid.cause === 'experience') advice.push('Line up two or three paying customers in their segment as references before bidding.');
  if (bid.cause === 'technical') advice.push('Answer the weighted requirements precisely; if you cannot meet a heavily weighted item, no-bid.');
  if (bid.cause === 'summary') advice.push('Write the summary about their problem, with numbers and a timeline.');
  if (['forms', 'late', 'addenda', 'pages', 'mandatory'].includes(bid.cause)) advice.push('Run the one-hour compliance check, submit a day early, and read every addendum.');
  if (bid.cause === 'demo') advice.push('Script the demo around their scenarios and do not claim what the product cannot show.');
  bid.debrief = { day: state.day, cause: bid.cause, scores: ev?.parts ?? null, total: bid.finalTotal ?? ev?.total ?? null, rank: bid.rank ?? (ev?.total != null && bid.field ? rankOf(bid, ev.total) : null), field: bid.field?.length ? bid.field.length + 1 : null, winner: winner?.name ?? null, winnerScore: winner?.score ?? null, reason: CAUSE_TEXT[bid.cause] ?? bid.cause, lines, advice };
  spend(bid, 'debrief', RFP.debriefHours);
  ensureRfp(state).lessons.push({ day: state.day, cause: bid.cause, buyer: bid.buyer });
  return bid.debrief;
}

export function fileProtest(state, bid) {
  if (!['lost', 'disqualified'].includes(bid.status)) throw new Error('There is nothing to protest.');
  if (bid.protest) throw new Error('You already filed.');
  if (!bid.public) throw new Error('Private buyers have no protest process.');
  if (state.day > bid.protestBy) throw new Error('The protest window has closed.');
  const usd = Math.round(between(...RFP.protestUsd, u01(state, `${bid.id}|pfee`)));
  post(state, { amount: -usd, counterparty: 'Outside counsel', description: `Bid protest: ${bid.title}`, category: 'legal', method: 'ach' });
  spend(bid, 'bid protest', RFP.protestHours);
  const base = bid.evalFlaw && bid.cause !== 'late' ? 0.6 : 0.03; // sustained only when the evaluation had a real flaw (GAO base rate 14%, research §6)
  const sustained = u01(state, `${bid.id}|psust`) < base;
  bid.protest = { day: state.day, usd, sustained };
  if (sustained && bid.eval?.parts) {
    bid.status = 'bafo'; bid.bafo = { invitedDay: state.day, dueDay: state.day + RFP.bafoDays, price: null, cutPct: 0 };
    bid.finalDay = null; bid.reeval = true; delete bid.lossDay;
    const d = bid.dealId ? dealById(state, bid.dealId) : null;
    if (d && d.stage === 'lost') { d.stage = 'proposal'; d.lostReason = null; d.history.push({ stage: 'proposal', day: state.day }); }
    notify(state, `Your protest was sustained: ${bid.buyer} is re-evaluating. Send your best and final offer.`, { type: 'good', app: 'crm' });
  } else {
    logMistake(state, { functionId: 'rfp_bids', id: 'protest_without_basis', label: 'Protest that was denied', app: 'crm', charge: true, key: `protest:${bid.id}`, cost: { usd, hours: RFP.protestHours, reputation: 0.5 }, detail: `${bid.buyer} denied the protest. Most losing bidders get a debrief and move on; protests succeed about one time in seven and only when the evaluation broke its own rules. You paid counsel and burned a buyer relationship.` });
    notify(state, `Protest denied by ${bid.buyer}.`, { type: 'bad', app: 'crm' });
  }
  return bid.protest;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function setDeadlines(state, bid) {
  clearDeadlines(state, bid);
  const add = (day, title) => { if (day >= state.day) { try { scheduleEvent(state, { title, kind: 'deadline', app: 'crm', refId: bid.id, day, start: 990, duration: 15, location: '', notes: bid.title }); } catch { /* past date */ } } };
  add(bid.qDeadline, `RFP questions due: ${bid.buyer}`);
  add(bid.dueDay, `RFP response due 4:30 pm: ${bid.buyer}`);
}
function clearDeadlines(state, bid) {
  for (const e of ensureCalendar(state).events) if (e.refId === bid.id && e.kind === 'deadline' && e.status !== 'canceled') cancelEvent(state, e.id, 'rfp closed');
}

// ---------------------------------------------------------------------------
// Daily tick
// ---------------------------------------------------------------------------

function kickoff(state, bid) {
  const deal = dealById(state, bid.dealId);
  if (!deal || !deal.customerId) return;
  bid.kickoffDay = state.day + 45;
  bid.pending.push({ day: bid.kickoffDay, kind: 'kickoff' });
}

function processPending(state, bid) {
  for (const p of bid.pending.slice()) {
    if (state.day < p.day) continue;
    bid.pending.splice(bid.pending.indexOf(p), 1);
    const deal = dealById(state, bid.dealId);
    if (p.kind === 'kickoff') {
      // The buyer checks the matrix against the live product at implementation kickoff.
      const ocs = overclaims(state, bid, bid.response.matrix).filter((x) => x.severity > 0);
      if (!ocs.length) continue;
      const ow = ocs.reduce((a, x) => a + x.severity, 0);
      const price = bid.finalPrice ?? bid.listPrice;
      const usd = Math.round(Math.min(0.35, 0.06 * ow) * price);
      if (usd > 0) post(state, { amount: -usd, counterparty: bid.buyer, description: `Service credits: implementation shortfall (${bid.title})`, category: 'other', method: 'ach' });
      logMistake(state, { functionId: 'rfp_bids', id: 'overclaimed_compliance', label: 'Claimed "comply" on features that were not built', app: 'crm', delayed: true, charge: true, key: `overclaim:${bid.id}`,
        cost: { hours: Math.round(8 * ow), usd, reputation: +(0.4 * ow).toFixed(1) },
        detail: `${bid.buyer} compared your compliance matrix with the live product at kickoff: ${ocs.slice(0, 4).map((x) => `${x.req.n} (${x.answer} vs ${x.truth === 'none' ? 'not built' : x.truth})`).join(', ')}. You owe service credits, rework and a workaround plan, and the account starts at risk. The overclaim bought score points at evaluation; this is the bill.` });
      bid.overclaimBill = { usd, ow };
      if (deal?.subscriptionId) bid.pending.push({ day: state.day + 45, kind: 'termination', p: clamp(0.25 + 0.2 * ow, 0, 0.85) });
      if (ocs.some((x) => x.req.mandatory && x.severity >= 0.5)) bid.pending.push({ day: state.day + 30, kind: 'claim', p: 0.12 });
    } else if (p.kind === 'termination') {
      if (deal?.subscriptionId && chance(state, p.p)) {
        cancelSub(state, deal.subscriptionId, { atPeriodEnd: false, reason: 'implementation_failure' });
        logMistake(state, { functionId: 'rfp_bids', id: 'overclaim_termination', label: 'Buyer terminated for non-performance', app: 'crm', delayed: true, key: `overterm:${bid.id}`, cost: { customers: 1, reputation: 1, usd: Math.round((bid.finalPrice ?? bid.listPrice) * 0.1) }, detail: `${bid.buyer} cancelled after the product did not do what the response said it would. The reference they would have given is now a warning to other buyers in the segment.` });
      }
    } else if (p.kind === 'claim') {
      if (chance(state, p.p)) {
        const usd = Math.round(between(4000, 15000, rng(state)));
        post(state, { amount: -usd, counterparty: 'Outside counsel', description: `Misrepresentation claim: ${bid.buyer}`, category: 'legal', method: 'ach' });
        logMistake(state, { functionId: 'rfp_bids', id: 'overclaim_legal_claim', label: 'Misrepresentation claim from a buyer', app: 'crm', delayed: true, charge: true, key: `overclaim_legal:${bid.id}`, cost: { usd, hours: 10 }, detail: `${bid.buyer} relied on a "comply" answer in your written response and claims it was false. A written RFP answer can support a misrepresentation claim; the outcome depends on the facts.` });
      }
    }
  }
}

function reminders(state, bid) {
  if (bid.status === 'issued' || bid.status === 'bidding') {
    if (state.day === bid.qDeadline - 3) emitSalesEvent(state, 'rfp_question_deadline', { dealId: bid.dealId, bidId: bid.id, buyer: bid.buyer, qDeadline: bid.qDeadline }, `rfp_q:${bid.id}`);
    if (state.day === bid.dueDay - 3) emitSalesEvent(state, 'rfp_due_soon', { dealId: bid.dealId, bidId: bid.id, buyer: bid.buyer, dueDay: bid.dueDay }, `rfp_due:${bid.id}:${bid.dueDay}`);
  }
}

function feedDay(state) {
  const R = ensureRfp(state);
  if (!R.feedOn || isWeekend(state) || !hasProduct(state)) return;
  if (!chance(state, RFP.feedChancePerDay)) return;
  const open = R.bids.filter((b) => b.source === 'public' && b.status === 'issued').length;
  if (open >= 6) return;
  postPublicBid(state, { key: `feed|${state.day}|${R.bids.length}` });
}

function bidDay(state, bid) {
  reminders(state, bid);
  const deal = bid.dealId ? dealById(state, bid.dealId) : null;
  switch (bid.status) {
    case 'issued': case 'bidding': {
      if (!bid.addenda.length && state.day >= bid.answerDay) {
        const lines = answerQuestions(state, bid);
        addAddendum(state, bid, lines.length ? `Answers to written questions:\n${lines.join('\n')}` : 'No questions were received. The RFP stands as written.', { ackRequired: true });
        // A second addendum can change what you must submit [design: ~half of RFPs get one].
        if (u01(state, `${bid.id}|add2`) < 0.5 && bid.dueDay - state.day >= 5) {
          const r = u01(state, `${bid.id}|add2k`);
          if (r < 0.4) { bid.dueDay += 7; addAddendum(state, bid, 'The response due date is extended by seven days.', { effect: 'due' }); setDeadlines(state, bid); }
          else if (r < 0.7) {
            const extra = { id: `x${bid.addenda.length}`, text: 'Vendor shall support single-day training for up to 25 staff at no additional charge', mandatory: false, weight: 2, core: true, n: `R-${String(bid.reqs.length + 1).padStart(2, '0')}`, added: true };
            bid.reqs.push(extra);
            addAddendum(state, bid, `New requirement ${extra.n}: ${extra.text}. Answer it in the compliance matrix.`, { effect: 'req' });
          } else { bid.pageLimit = Math.max(2, bid.pageLimit - 1); addAddendum(state, bid, `The narrative page limit is reduced to ${bid.pageLimit} pages.`, { effect: 'pages' }); }
        }
      }
      if (bid.status === 'bidding' && state.day > bid.dueDay) {
        bid.status = 'disqualified'; bid.cause = 'late'; bid.lossDay = state.day; bid.debriefBy = state.day; bid.eval = { dq: [{ id: 'late', text: 'No response was submitted by the deadline.' }], day: state.day };
        logMistake(state, { functionId: 'rfp_bids', id: 'late_submission', label: 'Let the due date pass with the response unfinished', app: 'crm', key: `late:${bid.id}`, cost: { hours: bid.hoursSpent, reputation: 0.3 }, detail: `You decided to bid, spent ${bid.hoursSpent.toFixed(0)} h and never submitted. Buyers do not take late responses, even by minutes. A no-bid at the start would have cost 15 minutes.` });
        bid.noDebriefLogged = true;
        if (deal && isOpen(deal)) loseDeal(state, deal, 'RFP response not submitted by the deadline');
        emitSalesEvent(state, 'rfp_lost', { dealId: bid.dealId, bidId: bid.id, buyer: bid.buyer, cause: 'late' }, `rfp_lost:${bid.id}`);
      } else if (bid.status === 'issued' && state.day > (bid.source === 'public' ? bid.dueDay - 3 : bid.dueDay)) {
        bid.status = bid.source === 'public' ? 'expired' : 'lapsed';
        clearDeadlines(state, bid);
        if (deal && isOpen(deal)) {
          addActivity(state, { type: 'note', text: 'The RFP closed without a response', dealId: deal.id, companyId: deal.companyId });
          loseDeal(state, deal, 'RFP lapsed: no response submitted');
          // Silence is not a no-bid: the buyer remembers, and the work that got the deal this far is gone.
          logMistake(state, { functionId: 'rfp_bids', id: 'ignored_rfp', label: 'Let a live deal\'s RFP lapse without bidding or declining', app: 'crm', key: `ignored:${bid.id}`, cost: { reputation: 0.5, days: 30 }, circles: true, detail: `${bid.buyer ?? 'The buyer'} issued an RFP for a deal you were working and never heard back. A stellar operator makes a go/no-go call in the first days and sends a polite no-bid letter if it is not worth it, which keeps the door open for the next cycle.` });
        }
      }
      break;
    }
    case 'submitted':
      if (state.day >= bid.evalDay) screenAndEvaluate(state, bid);
      break;
    case 'shortlisted':
      if (state.day >= bid.oralsDay) runOrals(state, bid);
      break;
    case 'bafo':
      if (bid.bafo && state.day >= bid.bafo.dueDay) { bid.finalDay = state.day + (bid.reeval ? 3 : RFP.finalLag - 2); bid.status = 'finalists'; }
      break;
    case 'finalists':
      if (state.day >= bid.finalDay) finalDecision(state, bid);
      break;
    case 'notice_of_intent':
      if (state.day >= bid.nextDay) startNegotiation(state, bid);
      break;
    case 'negotiation': case 'board':
      if (state.day >= bid.nextDay) contractStep(state, bid);
      break;
    case 'awarded':
      if (deal?.stage === 'won') { bid.status = 'won'; bid.wonDay = state.day; kickoff(state, bid); }
      else if (deal?.stage === 'lost') { bid.status = 'lost'; bid.cause = 'contract'; bid.lossDay = state.day; }
      break;
    case 'lost': case 'disqualified':
      if (bid.debriefBy != null && state.day > bid.debriefBy && !bid.debrief && !bid.noDebriefLogged && bid.submittedDay != null) {
        bid.noDebriefLogged = true;
        logMistake(state, { functionId: 'rfp_bids', id: 'no_debrief_requested', label: 'Never asked for the debrief', app: 'crm', key: `nodebrief:${bid.id}`, cost: { days: 7, hours: 0 }, detail: `${bid.buyer} would have shared your real scores and the reason (${CAUSE_TEXT[bid.cause] ?? bid.cause}) if you had asked within ${RFP.debriefDays} days. Now you will guess, and the next response will likely repeat it.` });
      }
      break;
    default: break;
  }
  if (bid.pending?.length) processPending(state, bid);
}

/** Called once per day from the CRM tick (engine.dealsDay). Cheap when there are no bids. */
export function rfpDay(state) {
  const crm = state.apps?.crm;
  if (!crm?.rfp) return;
  const R = crm.rfp;
  feedDay(state);
  for (const b of R.bids.slice()) if (b.status !== 'no_bid' && b.status !== 'expired' && b.status !== 'lapsed') bidDay(state, b);
  // Cooperative contracts: reviews, then the administrative fee on the first of the month.
  for (const app of R.coop.apps) coopDay(state, app);
  if (dateOf(state, state.day).getUTCDate() === 1) coopFees(state);
}

/** Open a bid for every forced-RFP deal the player owns (the deal's own tick finds them). */
export function openBidsForDeals(state) {
  for (const d of state.apps.crm?.deals ?? []) {
    if (!isOpen(d) || d.stage !== 'proposal' || !d.proc?.rfp || d.rfpBidId || d.pilotConverted || d.ownerAeId || d.rfpAwarded || d.proc.bid) continue;
    if (d.pilot?.status === 'active') continue;
    openBidForDeal(state, d);
  }
}
/** A deal that is being worked by the bid process must not also roll its flat close probability. */
export const managedByBid = (state, deal) => {
  if (!deal?.rfpBidId) return false;
  const b = bidById(state, deal.rfpBidId);
  return Boolean(b) && !['superseded'].includes(b.status);
};
/** A pilot converted: the buyer chose you after 90 days of use; the legacy award roll applies instead of a bid. */
export function supersedeBid(state, deal) {
  const b = deal.rfpBidId ? bidById(state, deal.rfpBidId) : null;
  if (b && isActive(b) && ['issued', 'bidding'].includes(b.status)) { b.status = 'superseded'; clearDeadlines(state, b); }
}
/** The process's evaluated score replaces the flat win-rate multiplier for a deal that went through a bid. */
export function rfpScoreMult(state, deal) {
  const b = deal?.rfpBidId ? bidById(state, deal.rfpBidId) : null;
  const t = b?.finalTotal ?? b?.eval?.total;
  if (t == null || b.status === 'superseded') return null;
  return clamp(0.3 + t / 100 * 0.9, 0.3, 1.2);
}

// ---------------------------------------------------------------------------
// Cooperative contracts
// ---------------------------------------------------------------------------

export function startCoop(state, coopId) {
  const c = COOPS.find((x) => x.id === coopId);
  if (!c) throw new Error('Unknown cooperative contract.');
  const R = ensureRfp(state);
  if (R.coop.apps.some((a) => a.coopId === coopId && ['draft', 'submitted', 'awarded'].includes(a.status))) throw new Error('You already have an application with them.');
  const needed = Math.round(between(...COOP.hours, u01(state, `coop|${coopId}|${state.day}`)));
  const app = { id: uid('coop'), coopId, name: c.name, feePct: c.feePct, status: 'draft', needed, progress: 0, startedDay: state.day, items: { insurance: false, w9: false, refs: false } };
  R.coop.apps.push(app);
  return app;
}
export function workCoop(state, appId, hours) {
  const app = ensureRfp(state).coop.apps.find((a) => a.id === appId);
  if (!app || app.status !== 'draft') throw new Error('That application is not in draft.');
  app.progress = +Math.min(app.needed, app.progress + hours).toFixed(1);
  return app;
}
export function submitCoop(state, appId) {
  const app = ensureRfp(state).coop.apps.find((a) => a.id === appId);
  if (!app || app.status !== 'draft') throw new Error('That application is not in draft.');
  if (app.progress + 1e-9 < app.needed) throw new Error(`The proposal needs about ${app.needed} h; you have done ${app.progress}.`);
  app.status = 'submitted'; app.submittedDay = state.day;
  app.decisionDay = state.day + Math.round(between(...COOP.days, u01(state, `${app.id}|dec`)));
  // [design] odds: references in the public sector, insurance and a SOC 2 / DPA help; a thin company with no public customers rarely gets on.
  const pubRefs = (state.stripe?.customers ?? []).filter((c) => { const co = c.crmCompanyId ? companyById(state, c.crmCompanyId) : null; return PUBLIC_GROUPS.has(getSegment(co?.segmentId)?.group); }).length;
  app.p = +clamp(COOP.baseP * 0.4 + 0.1 * Math.min(3, pubRefs) + (assets(state).coi_insurance != null ? 0.1 : 0) + (hasSoc2(state) ? 0.1 : 0) + (legal(state).dpaReady ? 0.05 : 0), 0.05, 0.75).toFixed(2);
  return app;
}
function coopDay(state, app) {
  if (app.status !== 'submitted' || state.day < app.decisionDay) return;
  if (chance(state, app.p)) {
    app.status = 'awarded'; app.awardedDay = state.day;
    (ensureCrm(state).paperAssets ??= {}).coop_contract = state.day; // procurementPlan: buyers may skip their own RFP
    ensureRfp(state).coop.active.push(app.coopId);
    notify(state, `${app.name} awarded you a cooperative contract. Member agencies can now buy without their own RFP; the ${(app.feePct * 100).toFixed(2)}% administrative fee applies to sales through it.`, { type: 'good', app: 'crm' });
  } else { app.status = 'rejected'; notify(state, `${app.name} did not award a contract this cycle. Cooperative solicitations come around every few years.`, { type: 'warn', app: 'crm' }); }
}
function coopFees(state) {
  const R = ensureRfp(state);
  if (!R.coop.active.length) return;
  const fee = Math.max(...R.coop.apps.filter((a) => a.status === 'awarded').map((a) => a.feePct), 0);
  let rev = 0;
  for (const d of state.apps.crm.deals) if (d.stage === 'won' && d.proc?.viaCoop && d.subscriptionId) rev += (d.amount ?? 0) / 12;
  if (rev * fee >= 1) post(state, { amount: -Math.round(rev * fee * 100) / 100, counterparty: 'Cooperative contract administrator', description: 'Administrative fee on cooperative contract sales', category: 'other', method: 'ach' });
}

// ---------------------------------------------------------------------------
// Operator reader (functionId 'rfp_bids')
// ---------------------------------------------------------------------------

const FN = 'rfp_bids';
export function rfpStats(state) {
  const bids = state.apps?.crm?.rfp?.bids ?? [];
  const decided = bids.filter((b) => b.decision);
  const taken = decided.filter((b) => b.decision === 'bid');
  const submitted = taken.filter((b) => b.submittedDay != null);
  const resolved = submitted.filter((b) => ['won', 'lost', 'disqualified', 'awarded', 'notice_of_intent', 'negotiation', 'board'].includes(b.status));
  const wins = resolved.filter((b) => ['won', 'awarded', 'notice_of_intent', 'negotiation', 'board'].includes(b.status)).length;
  const dq = submitted.filter((b) => b.status === 'disqualified').length + taken.filter((b) => b.status === 'disqualified' && b.submittedDay == null).length;
  const badBids = taken.filter((b) => b.quality?.bad).length;
  const missed = decided.filter((b) => b.decision === 'no_bid' && b.quality?.winnable).length;
  const answers = submitted.reduce((a, b) => a + Object.keys(b.response.matrix).length, 0);
  const over = submitted.reduce((a, b) => a + (b.overclaimsAtSubmit ?? []).filter((x) => x.severity >= 0.5).length, 0);
  const losses = bids.filter((b) => ['lost', 'disqualified'].includes(b.status) && b.submittedDay != null);
  const debriefed = losses.filter((b) => b.debrief).length;
  const hours = taken.reduce((a, b) => a + b.hoursSpent, 0);
  const wasted = taken.filter((b) => b.quality?.bad || b.status === 'disqualified').reduce((a, b) => a + b.hoursSpent, 0);
  const refRatio = submitted.length ? submitted.reduce((a, b) => a + b.hoursSpent / Math.max(10, b.refHours), 0) / submitted.length : 1;
  return { decisions: decided.length, taken: taken.length, noBids: decided.length - taken.length, submitted: submitted.length, resolved: resolved.length, wins, dq, badBids, missed, answers, over, losses: losses.length, debriefed, hours, wasted, refRatio, library: state.apps?.crm?.rfp?.library?.entries ?? 0 };
}

export function rfpRead(state) {
  const st = rfpStats(state);
  if (st.decisions < 3) return unknownRead('Make go / no-go calls on at least three bids to read your bid discipline.');
  const discipline = clamp(1 - (st.badBids + 0.4 * st.missed) / st.decisions, 0, 1);
  const winRate = st.resolved ? shrink(st.wins / st.resolved, st.resolved, 0.45, 3) : 0.45;
  const honesty = st.answers ? clamp(1 - (st.over / st.answers) * 5, 0, 1) : (st.submitted ? 0.5 : 0.7);
  const dqScore = st.taken ? clamp(1 - (st.dq / st.taken) / 0.2, 0, 1) : 0.6;
  const debrief = st.losses ? st.debriefed / st.losses : 0.5;
  const hoursScore = st.taken ? clamp(1 - st.wasted / Math.max(1, st.hours) * 1.2, 0, 1) * clamp((1.6 - st.refRatio) / 0.9, 0, 1) : 0.5;
  // Habits of a stellar bid team: ask the buyer, ask specific questions, run the compliance check, submit early, keep a library.
  const subm = (state.apps?.crm?.rfp?.bids ?? []).filter((b) => b.decision === 'bid' && b.submittedDay != null);
  const process = subm.length ? subm.reduce((a, b) => a + 0.25 * (b.clue || b.questions.some((q) => q.score >= 0.55) ? 1 : 0) + 0.3 * (b.checked ? 1 : 0) + 0.2 * (b.submittedDay <= b.dueDay - 1 ? 1 : 0) + 0.15 * (b.library ? 1 : 0) + 0.1 * (b.questions.filter((q) => q.score >= 0.55).length >= 2 ? 1 : 0), 0) / subm.length : 0.4;
  const score = clamp(0.24 * discipline + 0.12 * winRate + 0.18 * honesty + 0.12 * dqScore + 0.09 * debrief + 0.1 * hoursScore + 0.15 * process, 0, 1);
  const coaching = [];
  if (st.badBids / st.decisions > 0.25) coaching.push(trapCoaching(FN, 'bid_everything'));
  if (st.over) coaching.push(trapCoaching(FN, 'comply_on_roadmap'));
  if (st.dq) coaching.push(trapCoaching(FN, 'last_day_submission'));
  if (st.losses && st.debriefed < st.losses) coaching.push(trapCoaching(FN, 'no_debrief'));
  coaching.push(`Stellar: ${tierBehaviours(FN, 'stellar').slice(0, 2).join('; ')}`);
  return { tier: tierFromScore(score), score: +score.toFixed(2), n: st.decisions,
    evidence: [`${st.decisions} go/no-go calls: ${st.taken} bid, ${st.noBids} no-bid; ${st.badBids} bid(s) on wired / poor-fit RFPs`, `${st.wins} win(s) from ${st.resolved} decided bid(s)`, `${st.over} optimistic "comply" answer(s) of ${st.answers}; ${st.dq} disqualification(s)`, `${st.debriefed}/${st.losses} losses debriefed; ${st.hours.toFixed(0)} h on bids (${st.wasted.toFixed(0)} h on bids that were never winnable)`],
    coaching };
}
registerOperatorReader(FN, rfpRead);

