// Legal simulation: state slice, player actions (pure state mutations used by the UI and tests) and the
// daily tick (incorporation processing, deadlines, penalties, SOC 2 / trademark timelines, redlines, DSRs).

import { ensure, notify, log } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { post, addRecurring } from '../../core/bank.js';
import { activeSubs, cancel, refund, monthlyAmount, mrr } from '../../core/stripe.js';
import { shippedFeatures } from '../../core/market.js';
import { newThread, addMessage } from '../../core/mail.js';
import { uid, rng, chance, clamp, round2, hash, dayOfWeek, fmtDate, money, pick } from '../../core/util.js';
import { PROVIDERS, OPERATING_STATES, CONVERSION, DELAWARE, DELAWARE_AMEND, FOUNDER_STOCK, POLICIES, DPA, GDPR_ITEMS, AI_ACT_ITEMS, TRADEMARK, CONTRACTS, ONE_099, DEADLINE_83B_DAYS } from './catalog.js';
import { buildCalendar, dayFor, yearOf, franchiseAuthorizedShares, franchiseAPVC, delawareLate, late1099, grossAssetsAt, forms1099 } from './deadlines.js';
import { CLAUSES, scoreRedlines } from './redlines.js';
import { ciiaaSigned } from './api.js';
import { recordClaims, verify, penalize, ensureIntegrity, sideRoll, sideRoller } from '../../core/integrity.js';
import { fakeReviewsDay } from '../../core/fakereviews.js';
import { ensurePersonal, personalTxn } from '../../core/personal.js';
import { dueDay } from '../../core/timing.js';

export function ensureLegal(state) {
  const L = ensure(state, 'legal', () => ({
    incorporation: null, conversion: null, ein: { status: 'none', readyDay: null }, founderStock: null, kyc: null,
    docs: { ipAssignment: false, ciiaa: false, operatingAgreement: false, tos: 'none', cookieBanner: false, msa: 'none', esign: false },
    dpaReady: false, dpaSource: null, gdpr: {}, aiAct: {}, aiFeatures: false, aiHighRisk: false,
    soc2: 'none', soc2Plan: null, trademarks: [], redlines: [], dsrs: [], paidFilings: {}, done: {}, notified: {},
    exposure: 0, seenSubs: [], personalTax: [], recurringIds: {},
  }));
  L.done ??= {};
  L.notified ??= {};
  return L;
}

const spend = (state, amount, item, { category = 'legal', counterparty = item, method = 'card' } = {}) => {
  if (amount <= 0) return null;
  return post(state, { amount: -round2(amount), counterparty, description: item, category, method, meta: { app: 'legal', item } });
};

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export function incorporate(state, { provider, operatingState = 'CA' }) {
  const L = ensureLegal(state);
  const p = PROVIDERS[provider];
  if (!p) throw new Error('Pick a formation service.');
  if (L.incorporation) throw new Error('Already incorporated (or in progress).');
  if (!OPERATING_STATES[operatingState]) throw new Error('Pick where you operate.');
  spend(state, p.fee, `Incorporation via ${p.label}`, { counterparty: p.label });
  if (!p.agentFirstYearFree && p.agentAnnual > 0 && provider !== 'doola') spend(state, p.agentAnnual, 'Registered agent (year 1)', { counterparty: 'Registered agent' });
  const st = OPERATING_STATES[operatingState];
  if (st.qualify > 0 && (p.jurisdiction !== 'home')) spend(state, st.qualify, `Foreign qualification in ${st.label}`, { category: 'taxes', counterparty: `${operatingState} Secretary of State` });
  L.incorporation = { provider, entity: p.entity, jurisdiction: p.jurisdiction === 'home' ? operatingState : p.jurisdiction, operatingState, filedDay: state.day, effectiveDay: state.day + p.days, status: 'pending' };
  return L.incorporation;
}

function completeIncorporation(state, L) {
  const inc = L.incorporation;
  const p = PROVIDERS[inc.provider];
  inc.status = 'done';
  state.company.incorporated = true;
  state.company.entity = inc.entity;
  if (p.einByService) L.ein = { status: 'pending', readyDay: dueDay(state, inc.operatingState === 'nonus' ? 'gov.ein.foreign' : 'gov.ein.fax') }; // services file SS-4 by fax
  L.kyc = { done: false, dueDay: state.day + 30 };
  if (inc.provider === 'atlas' || inc.provider === 'clerky') L.docs.ciiaa = true; // hiring templates included
  notify(state, `${state.company.name} is now a ${inc.entity === 'ccorp' ? 'Delaware C-corp' : 'LLC'}. Next: ${inc.entity === 'ccorp' ? 'sign founder stock docs (83(b) clock starts at the grant)' : 'sign the operating agreement and IP assignment'}, EIN, then move bank & Stripe to the company.`, { type: 'good', app: 'legal' });
  log(state, 'info', `Incorporated (${p.label}).`, 'legal');
}

export function convertToCcorp(state) {
  const L = ensureLegal(state);
  if (state.company.entity !== 'llc' || L.incorporation?.status !== 'done') throw new Error('Only an existing LLC can convert.');
  if (L.conversion?.status === 'pending') throw new Error('Conversion in progress.');
  spend(state, CONVERSION.fee, 'LLC → Delaware C-corp conversion (legal fees)', { counterparty: 'Startup law firm', method: 'ach' });
  L.conversion = { startDay: state.day, doneDay: state.day + CONVERSION.days, status: 'pending' };
  return L.conversion;
}

export function getEin(state) {
  const L = ensureLegal(state);
  if (!state.company.incorporated) throw new Error('Incorporate first (a sole proprietor can get an EIN, but you want it in the company\'s name).');
  if (L.ein.status !== 'none') throw new Error('EIN already requested.');
  const nonUs = L.incorporation?.operatingState === 'nonus';
  L.ein = nonUs ? { status: 'pending', readyDay: dueDay(state, 'gov.ein.foreign') } : { status: 'done', readyDay: state.day }; // online EIN is instant with an SSN
  return L.ein;
}

export function signFounderDocs(state, { authorized = FOUNDER_STOCK.authorized, issued = FOUNDER_STOCK.issued, vestYears = FOUNDER_STOCK.vestYears, creditMonths = 0 } = {}) {
  const L = ensureLegal(state);
  if (!state.company.incorporated) throw new Error('Incorporate first.');
  if (state.company.entity !== 'ccorp') {
    L.docs.operatingAgreement = true;
    L.docs.ipAssignment = true;
    return null;
  }
  if (L.founderStock) throw new Error('Founder stock already issued.');
  if (!(issued > 0) || issued > authorized) throw new Error('Issued shares must be positive and ≤ authorized.');
  L.founderStock = {
    grantDay: state.day, authorized: Math.round(authorized), issued: Math.round(issued), par: FOUNDER_STOCK.par,
    price: round2(issued * FOUNDER_STOCK.par), vestYears, cliffDays: FOUNDER_STOCK.cliffDays, creditMonths: clamp(creditMonths, 0, 12),
    filed83b: false, filedDay: null, method: null, missed: false,
  };
  L.converted = false;
  L.docs.ipAssignment = true;
  if (L.founderStock.price > 0) post(state, { amount: L.founderStock.price, counterparty: state.founder.name, description: 'Founder stock purchase at par', category: 'owner_contribution', method: 'ach', meta: { app: 'legal', item: 'Founder stock purchase' } });
  return L.founderStock;
}

export function file83b(state, method) {
  const L = ensureLegal(state);
  const fs = L.founderStock;
  if (!fs) throw new Error('No restricted stock grant yet.');
  if (fs.filed83b) throw new Error('Already filed.');
  if (state.day > fs.grantDay + DEADLINE_83B_DAYS) throw new Error('The 30-day window has passed. There is no extension and no fix.');
  if (method === 'service' && !PROVIDERS[L.incorporation?.provider]?.files83b) throw new Error('Your formation service does not file it for you.');
  if (method === 'mail') spend(state, 10, '83(b) by USPS certified mail, return receipt', { category: 'taxes', counterparty: 'USPS' });
  fs.filed83b = true; fs.filedDay = state.day; fs.method = method;
  return fs;
}

export function setDoc(state, key) {
  const L = ensureLegal(state);
  if (key === 'ciiaa' || key === 'ipAssignment') L.docs[key] = true;
  else throw new Error('Unknown document.');
}

export function completeKyc(state) {
  const L = ensureLegal(state);
  if (!L.kyc) throw new Error('Nothing to update yet.');
  if (L.ein.status !== 'done') throw new Error('Banks and Stripe need the company EIN first.');
  L.kyc.done = true;
  L.kyc.doneDay = state.day;
  if (L.kyc.hold && !L.kyc.hold.released) { L.kyc.hold.released = state.day; notify(state, 'Stripe verified the company\'s details: payouts resume in about two business days.', { type: 'good', app: 'legal' }); }
}

// ---------------------------------------------------------------------------
// KYC / commingling: the processor checks, and the corporate veil
// ---------------------------------------------------------------------------
// Stripe's ongoing KYC/KYB review matches the account holder and tax ID against the business: an account still in
// the founder's name/SSN after incorporation draws a "verification required" request and a payout pause until it is
// fixed (money-deals.md §6: request for info, payout hold of days to weeks). Odds [design]: ~2%/day once the update
// is overdue (about half within a month). Meanwhile customer money lands in an account that is not the company's:
// commingling, the factor courts cite most when they pierce the corporate veil.
export const KYC = { hazardPerDay: 0.022, releaseDays: 2, commingleDaysForVeil: 30, veilPierceP: 0.25, personalShare: 0.5 };

function holdStripePayouts(state, untilDay) {
  const st = state.stripe;
  if (!st) return;
  if ((st.available ?? 0) > 0) { st.pending.push({ amount: round2(st.available), availableDay: untilDay, chargeId: 'kyc_hold' }); st.available = 0; }
  for (const x of st.pending ?? []) if (x.availableDay < untilDay) x.availableDay = untilDay;
  st.firstPayoutDay = Math.max(st.firstPayoutDay ?? 0, untilDay);
}

function kycDay(state, L) {
  const k = L.kyc;
  if (!k || !state.company.incorporated) return;
  if (!k.done && state.day > k.dueDay) {
    L.commingledDays = (L.commingledDays ?? 0) + 1;
    if (!k.hold && (state.stripe?.charges?.length ?? 0) > 0 && sideRoll(state, 'kyc-review') < KYC.hazardPerDay) {
      k.hold = { since: state.day, released: null };
      notify(state, 'Stripe paused your payouts: "Verification required. The account holder and tax ID don\'t match the business you are operating." Update bank & Stripe to the company (Legal → Overview) to release them.', { type: 'bad', app: 'legal' });
      logMistake(state, { functionId: 'legal_hygiene', id: 'kyc_payout_hold', label: 'Stripe paused payouts: KYC still in your personal name', app: 'legal', key: `kychold:${state.day}`, delayed: true, charge: true, cost: { hours: 3, days: 7 }, detail: `The company was incorporated but Stripe and the bank still carried your personal details ${state.day - k.dueDay} days after the update was due. Payouts stay frozen until the KYC update is done, then take ~${KYC.releaseDays} business days. Doing it in the first month costs one hour.` });
    }
  }
  if (k.hold && !k.hold.released) holdStripePayouts(state, state.day + KYC.releaseDays);
}

/** A claim against the company can reach the founder personally when the veil is weak (commingling, no entity). */
export function veilExposure(state) {
  const L = ensureLegal(state);
  if (!state.company.incorporated) return { pierce: 1, why: 'no entity: you are personally liable as a sole proprietor' };
  if ((L.commingledDays ?? 0) >= KYC.commingleDaysForVeil) return { pierce: KYC.veilPierceP, why: `company and personal money were mixed for ${L.commingledDays} days (Stripe/bank never moved to the company)` };
  return { pierce: 0, why: null };
}
function maybePierce(state, cost, what) {
  const v = veilExposure(state);
  if (!v.pierce || !state.company.incorporated || sideRoll(state, `veil|${what}`) >= v.pierce) return 0;
  const personal = round2(cost * KYC.personalShare);
  personalTxn(state, -personal, `Personal liability: ${what} (veil pierced)`, 'other');
  notify(state, `The claimant's lawyers pierced the corporate veil: ${v.why}. You personally owe ${money(personal)} on top of what the company paid.`, { type: 'bad', app: 'legal' });
  logMistake(state, { functionId: 'legal_hygiene', id: 'veil_pierced', label: 'Corporate veil pierced: personal liability for a company claim', app: 'legal', delayed: true, cost: { usd: personal, hours: 10 }, detail: `${what}. The court treated the company as your alter ego because ${v.why}. A separate business account and Stripe in the company's name from month one keeps claims inside the company.` });
  return personal;
}

// ---------------------------------------------------------------------------
// Policies, privacy, AI Act
// ---------------------------------------------------------------------------

export function setPolicies(state, kind) {
  const L = ensureLegal(state);
  const p = POLICIES[kind];
  if (!p) throw new Error('Unknown option.');
  if (L.docs.tos === kind) throw new Error('That is already your policy setup.');
  if (L.recurringIds.policies) { const r = state.recurring.find((x) => x.id === L.recurringIds.policies); if (r) r.active = false; L.recurringIds.policies = null; }
  if (p.monthly) L.recurringIds.policies = addRecurring(state, { vendor: 'Termly', amount: p.monthly, category: 'software', dayOfMonth: 10, note: 'ToS, privacy policy & cookie consent generator' }).id;
  if (p.once) spend(state, p.once, 'Terms of service + privacy policy (lawyer)', { counterparty: 'Startup law firm', method: 'ach' });
  L.docs.tos = kind;
  if (kind === 'generator') L.docs.cookieBanner = true;
}

export function setCookieBanner(state) { ensureLegal(state).docs.cookieBanner = true; }

export function gdprItem(state, key) {
  if (!GDPR_ITEMS[key]) throw new Error('Unknown item.');
  ensureLegal(state).gdpr[key] = true;
}

// A DPA is a set of promises (Art. 28: records of processing, breach notice within 72h, transfer safeguards, a DSR
// process). Signing one does not do the work: what it promises that is not done is recorded as claims to customers,
// and customers' security/privacy reviews ask for the evidence (dpaAuditMonth).
export const DPA_PROMISES = ['lawfulBasis', 'ropa', 'dsr', 'breach', 'transfers'];
export function setupDpa(state, kind) {
  const L = ensureLegal(state);
  const d = DPA[kind];
  if (!d) throw new Error('Unknown option.');
  if (L.dpaReady) throw new Error('Your DPA is already in place.');
  if (d.once) spend(state, d.once, 'DPA + security exhibit (law firm)', { counterparty: 'Startup law firm', method: 'ach' });
  L.gdpr.subprocessors = true;
  L.dpaReady = true;
  L.dpaSource = kind;
  recordClaims(state, { audience: 'customer', recipientId: 'dpa', channel: 'DPA', claims: DPA_PROMISES.map((k) => ({ metric: `gdpr_${k}`, claimed: true, truth: Boolean(L.gdpr[k]), text: GDPR_ITEMS[k].label })) });
}

// Quarterly: enterprise buyers' privacy reviews ask for the RoPA, the breach plan and transfer mechanism behind the
// DPA (SMB buyers rarely ask). Odds [design]: ent 30%/quarter, SMB 8%/quarter when a DPA is in use; a missing item
// is found with reference-call strength (they ask for the document). Caught: remediation under deadline and a
// customer who no longer trusts the paper. market-people.md §6.3: blocked deals are likelier than fines.
function dpaAuditMonth(state, L) {
  if (!L.dpaReady || state.company.model === 'b2c' || !activeSubs(state).length) return;
  const I = ensureIntegrity(state);
  for (const c of I.claims) if (c.recipientId === 'dpa' && c.status === 'open' && L.gdpr[c.metric.slice(5)]) c.status = 'accurate'; // fixed since: cured
  const pQ = state.company.model === 'ent' ? 0.3 : 0.08;
  if (sideRoll(state, 'dpa-audit') >= pQ / 3) return;
  const res = verify(state, { audience: 'customer', recipientId: 'dpa', check: 'reference', roll: sideRoller(state, 'dpa-audit-roll') });
  if (!res.caught.length) return;
  for (const c of res.caught) { L.gdpr[c.metric.slice(5)] = false; } // still not done; the customer now knows
  penalize(state, res.caught, { audience: 'customer', functionId: 'legal_hygiene', id: 'dpa_promises_unbacked', label: 'A customer privacy review found DPA promises you could not evidence', hours: 12, app: 'legal', detail: `They asked for: ${res.caught.map((c) => c.text).join('; ')}. You signed a DPA that promised these. Build them now under their deadline; procurement flags the account at renewal.` });
  L.exposure = round2((L.exposure ?? 0) + 0.5);
  // claims stay caught; re-record the still-missing promises so the next review sees the current state
}

// Monthly regulator exposure (market-people.md §6.3 [design]): complaint-driven; <1%/yr with a policy, DPA and
// consent banner; 2-4%/yr with EU visitors and no consent banner or most GDPR items missing. Outcomes for a small
// company are mostly orders and warnings; fines of thousands when they come (Art. 83 weighs size).
export const GDPR_REG = { clean: 0.005, partial: 0.015, sloppy: 0.03, fineP: 0.4, fine: [2000, 20000], hours: 12 };
function regulatorMonth(state, L) {
  if (!activeSubs(state).length) return;
  const missing = Object.keys(GDPR_ITEMS).filter((k) => !L.gdpr[k]);
  const noBanner = !L.docs.cookieBanner;
  const perYear = noBanner || missing.length >= 4 ? GDPR_REG.sloppy : missing.length ? GDPR_REG.partial : GDPR_REG.clean;
  if (sideRoll(state, 'gdpr-complaint') >= perYear / 12) return;
  const fined = sideRoll(state, 'gdpr-fine') < GDPR_REG.fineP && (noBanner || missing.length > 0);
  const fine = fined ? Math.round(GDPR_REG.fine[0] + sideRoll(state, 'gdpr-fine-amt') * (GDPR_REG.fine[1] - GDPR_REG.fine[0])) : 0;
  if (fine) spend(state, fine, 'Data protection authority fine (GDPR)', { category: 'legal', counterparty: 'Data protection authority', method: 'ach' });
  const gaps = [noBanner && 'no cookie consent banner', ...missing.map((k) => GDPR_ITEMS[k].label.toLowerCase())].filter(Boolean);
  notify(state, `A data protection authority opened a complaint file against ${state.company.name}${gaps.length ? ` (${gaps.slice(0, 3).join('; ')})` : ''}.${fine ? ` Fine: ${money(fine)}.` : ' Outcome: a corrective order with a deadline.'}`, { type: 'bad', app: 'legal' });
  logMistake(state, { functionId: 'legal_hygiene', id: gaps.length ? 'gdpr_complaint_gaps' : 'gdpr_complaint_clean', label: gaps.length ? 'Privacy regulator complaint found compliance gaps' : 'Privacy regulator complaint (answered cleanly)', app: 'legal', delayed: true, charge: true, cost: { usd: fine, hours: gaps.length ? GDPR_REG.hours : 3 }, detail: gaps.length ? `Missing: ${gaps.join('; ')}. Answering a DPA inquiry without them takes days of reconstruction; with them it is an afternoon.` : 'A complaint came in, but the records existed: a few hours to answer.' });
}

export function aiActItem(state, key) {
  if (!AI_ACT_ITEMS[key]) throw new Error('Unknown item.');
  ensureLegal(state).aiAct[key] = true;
}

const AI_RE = /\b(ai|llm|gpt|claude|chat ?bot|assistant|agent|agentic|generat\w*|summari[sz]\w*|copilot|machine learning|ml|model)\b/i;
const HIGH_RISK_RE = /\b(hiring|recruit\w*|resume|cv|candidate|applicant|credit|loan|lend\w*|insurance|underwrit\w*|exam|grading|student|tenant|biometric|emotion)\b/i;
export function detectAi(state) {
  const feats = shippedFeatures(state);
  const ai = feats.filter((f) => AI_RE.test(`${f.title ?? ''} ${f.spec ?? ''} ${f.problem ?? ''}`));
  return { ai: ai.length > 0, highRisk: ai.some((f) => HIGH_RISK_RE.test(`${f.title ?? ''} ${f.spec ?? ''} ${f.user ?? ''}`)), features: ai.map((f) => f.title) };
}

// ---------------------------------------------------------------------------
// SOC 2: the compliance-automation workflow lives in legal/compliance.js (startSoc2 kept here for callers).
// ---------------------------------------------------------------------------

export { startSoc2 } from './compliance.js';

// ---------------------------------------------------------------------------
// Trademarks
// ---------------------------------------------------------------------------

const GENERIC = ['app', 'cloud', 'ai', 'pay', 'hub', 'flow', 'ly', 'io', 'smart', 'easy', 'pro', 'labs', 'desk', 'base', 'stack', 'sync', 'books', 'ledger'];
export function knockoutSearch(state, mark) {
  const m = String(mark ?? '').trim();
  if (!m) throw new Error('Enter the mark.');
  const lower = m.toLowerCase();
  const generic = GENERIC.filter((g) => lower.includes(g)).length;
  const h = parseInt(hash(lower), 36) % 100;
  const risk = clamp(0.1 + generic * 0.15 + (m.length <= 5 ? 0.15 : 0) + (h < 20 ? 0.25 : 0), 0, 0.9);
  const result = { mark: m, day: state.day, risk: round2(risk), findings: [
    generic && `Contains common SaaS words (${GENERIC.filter((g) => lower.includes(g)).join(', ')}): crowded register, weak/descriptive mark.`,
    h < 20 && `A similar live mark exists in Class 042 ("${m.slice(0, Math.max(3, m.length - 2))}…" for software).`,
    m.length <= 5 && 'Short marks are more likely to collide.',
  ].filter(Boolean) };
  ensureLegal(state).lastSearch = result;
  return result;
}

export function trademarkFee({ classes, freeform, description = '', }) {
  const n = classes.length;
  const extra = Math.max(0, Math.ceil((String(description).length - 1000) / 1000));
  return n * TRADEMARK.perClass + (freeform ? n * TRADEMARK.freeformSurcharge : 0) + extra * TRADEMARK.extraCharsSurcharge;
}

export function fileTrademark(state, { mark, classes, freeform = false, description = '', attorney = false }) {
  const L = ensureLegal(state);
  if (!mark) throw new Error('Enter the mark.');
  if (!classes?.length) throw new Error('Pick at least one class.');
  const fee = trademarkFee({ classes, freeform, description });
  spend(state, fee, `USPTO trademark application: ${mark} (${classes.length} class${classes.length > 1 ? 'es' : ''})`, { counterparty: 'USPTO' });
  if (attorney) spend(state, TRADEMARK.attorney, `Trademark attorney: ${mark}`, { counterparty: 'Trademark attorney', method: 'ach' });
  const searched = L.lastSearch?.mark?.toLowerCase() === String(mark).toLowerCase() ? L.lastSearch.risk : 0.35;
  const tm = { id: uid('tm'), mark, classes, freeform, attorney, fee, filedDay: state.day, examDay: state.day + TRADEMARK.examDays, status: 'pending', conflictRisk: searched, responseDue: null };
  L.trademarks.push(tm);
  return tm;
}

export function respondOfficeAction(state, id, { attorney = false } = {}) {
  const L = ensureLegal(state);
  const tm = L.trademarks.find((t) => t.id === id);
  if (!tm || tm.status !== 'office_action') throw new Error('No open office action.');
  if (attorney) spend(state, 500, `Office action response (attorney): ${tm.mark}`, { counterparty: 'Trademark attorney', method: 'ach' });
  const ok = chance(state, clamp(0.85 - tm.conflictRisk * 0.6 + (attorney ? 0.1 : 0), 0.1, 0.95));
  tm.status = ok ? 'published' : 'refused';
  tm.publishDay = state.day + TRADEMARK.publicationDays;
  return tm;
}

export function extendOfficeAction(state, id) {
  const tm = ensureLegal(state).trademarks.find((t) => t.id === id);
  if (!tm || tm.status !== 'office_action' || tm.extended) throw new Error('Cannot extend.');
  spend(state, TRADEMARK.extensionFee, `Office action extension: ${tm.mark}`, { counterparty: 'USPTO' });
  tm.responseDue += 90;
  tm.extended = true;
}

// ---------------------------------------------------------------------------
// Contracts & redlines
// ---------------------------------------------------------------------------

export function setupContracts(state, kind) {
  const L = ensureLegal(state);
  const c = CONTRACTS[kind];
  if (!c || kind === 'esign') throw new Error('Unknown option.');
  if (L.docs.msa !== 'none') throw new Error('You already have an MSA and order form.');
  if (c.once) spend(state, c.once, 'MSA + order form (lawyer)', { counterparty: 'Startup law firm', method: 'ach' });
  L.docs.msa = kind;
}

export function setupEsign(state) {
  const L = ensureLegal(state);
  if (L.docs.esign) return;
  L.recurringIds.esign = addRecurring(state, { vendor: 'Dropbox Sign', amount: CONTRACTS.esign.monthly, category: 'software', dayOfMonth: 14, note: 'E-signature' }).id;
  L.docs.esign = true;
}

function maybeRedlines(state, L) {
  if (state.company.model === 'b2c') return;
  for (const sub of activeSubs(state)) {
    if (L.seenSubs.includes(sub.id)) continue;
    L.seenSubs.push(sub.id);
    const big = monthlyAmount(sub) >= 150;
    const p = state.company.model === 'ent' ? 0.5 : big ? 0.05 : 0;
    if (!chance(state, p)) continue;
    const cust = state.stripe.customers.find((c) => c.id === sub.customerId);
    const keys = Object.keys(CLAUSES);
    const n = state.company.model === 'ent' ? 3 + (rng(state) < 0.5 ? 1 : 0) : 2;
    const clauses = [];
    while (clauses.length < n) { const k = pick(state, keys); if (!clauses.includes(k)) clauses.push(k); }
    const r = { id: uid('rl'), subId: sub.id, customer: cust?.company || cust?.name || 'A customer', contact: cust?.name ?? 'Procurement', receivedDay: state.day, dueDay: state.day + 10, clauses, status: 'open', ownPaper: L.docs.msa === 'none' };
    L.redlines.unshift(r);
    const t = newThread(state, { subject: `Redlines on the ${r.ownPaper ? 'agreement' : 'MSA'} — ${r.customer}`, with: { name: `${r.customer} Legal`, email: '' }, kind: 'legal', app: 'legal', refId: r.id });
    addMessage(state, t.id, { from: 'them', body: `Hi — before we countersign the order form, our legal team has comments (${clauses.map((k) => CLAUSES[k].title.toLowerCase()).join(', ')}). ${r.ownPaper ? 'Since you did not send an MSA, we used our standard paper.' : 'Redlined MSA attached.'} We need your response within 10 days to keep this in the quarter.` });
    notify(state, `${r.customer} sent contract redlines. Respond in Legal → Contracts within 10 days.`, { type: 'warn', app: 'legal' });
  }
  if (L.seenSubs.length > 2000) L.seenSubs = L.seenSubs.slice(-1000);
}

export function redlineCtx(state) {
  const L = ensureLegal(state);
  return { model: state.company.model, hasMsa: L.docs.msa !== 'none', dpaReady: L.dpaReady, soc2: L.soc2Qualified ? 'none' : L.soc2 }; // a qualified report does not reassure their counsel
}

// Apply the outcome of a redline response. feedback (from LLM or heuristic) carries dealProbability.
export function resolveRedline(state, id, choices, note, feedback) {
  const L = ensureLegal(state);
  const r = L.redlines.find((x) => x.id === id);
  if (!r || r.status !== 'open') throw new Error('Not open.');
  const sc = scoreRedlines(r.clauses, choices, note, redlineCtx(state));
  const p = clamp(feedback?.dealProbability != null ? 0.5 * sc.dealProbability + 0.5 * feedback.dealProbability : sc.dealProbability, 0.03, 0.95);
  r.choices = choices; r.note = note; r.feedback = feedback; r.dealProbability = round2(p); r.risk = sc.risk; r.respondedDay = state.day;
  if (choices.residency === 'eu_region' && !L.recurringIds.euRegion) L.recurringIds.euRegion = addRecurring(state, { vendor: 'EU hosting region', amount: 150, category: 'hosting', dayOfMonth: 8, note: 'EU data residency commitment' }).id;
  if (chance(state, p)) {
    r.status = 'signed';
    L.exposure = round2(L.exposure + sc.risk);
    notify(state, `${r.customer} countersigned.${sc.risk >= 2 ? ' You accepted risky terms; your legal exposure went up.' : ''}`, { type: 'good', app: 'legal' });
  } else {
    r.status = 'lost';
    loseDeal(state, r);
  }
  return r;
}

function loseDeal(state, r) {
  const sub = state.stripe.subscriptions.find((s) => s.id === r.subId);
  if (sub && sub.status !== 'canceled') {
    const ch = [...state.stripe.charges].reverse().find((c) => c.subId === sub.id && c.status === 'succeeded');
    if (ch && state.day - ch.day <= 45) refund(state, ch.id, { reason: 'contract_not_signed' });
    cancel(state, sub.id, { atPeriodEnd: false, reason: 'contract_terms' });
  }
  notify(state, `${r.customer} walked away over contract terms.`, { type: 'bad', app: 'legal' });
}

// ---------------------------------------------------------------------------
// Filings
// ---------------------------------------------------------------------------

// Delaware franchise tax: method 'billed' pays the Authorized Shares bill; 'apvc' requires the player's numbers.
export function payFranchiseTax(state, key, { method, grossAssets, issuedShares } = {}) {
  const L = ensureLegal(state);
  const item = buildCalendar(state).find((i) => i.key === key);
  if (!item) throw new Error('Nothing due.');
  if (L.paidFilings[key]) throw new Error('Already filed and paid.');
  const fs = L.founderStock ?? { authorized: FOUNDER_STOCK.authorized, issued: 0, par: FOUNDER_STOCK.par };
  const year = yearOf(state, item.dueDay) - 1;
  let tax;
  if (method === 'apvc') {
    const truth = grossAssetsAt(state, year);
    if (!(grossAssets >= 0) || Math.abs(grossAssets - truth) > Math.max(1000, truth * 0.15)) throw new Error(`Gross assets don't match your books at Dec 31, ${year}. Check your bank balance (Bank/Books) for that date.`);
    if (Number(issuedShares) !== fs.issued) throw new Error('Issued shares must match your stock ledger (Legal → Founder).');
    tax = franchiseAPVC({ grossAssets, issuedShares, authorized: fs.authorized, par: fs.par });
    if (tax == null) throw new Error('The Assumed Par Value Capital method needs issued shares: issue founder stock first (Legal → Founder).');
  } else tax = franchiseAuthorizedShares(fs.authorized);
  const late = delawareLate(tax, state.day - item.dueDay);
  spend(state, tax + DELAWARE.annualReportFee + late, `Delaware franchise tax ${year} (${method === 'apvc' ? 'Assumed Par Value Capital' : 'Authorized Shares'} method) + annual report${late ? ' + late penalty' : ''}`, { category: 'taxes', counterparty: 'DE Div of Corporations', method: 'ach' });
  L.paidFilings[key] = { day: state.day, amount: round2(tax + DELAWARE.annualReportFee + late), method, tax };
  if (method !== 'apvc' && fs.issued > 0) {
    const fair = franchiseAPVC({ grossAssets: grossAssetsAt(state, year), issuedShares: fs.issued, authorized: fs.authorized, par: fs.par });
    if (tax - fair > 100) {
      logMistake(state, { functionId: 'legal_hygiene', id: 'franchise_authorized_shares', label: 'Paid Delaware\'s Authorized Shares franchise tax bill', app: 'legal', key: `franchise_billed:${key}`, cost: { hours: DELAWARE_AMEND.hours, days: DELAWARE_AMEND.refundDays }, detail: `Paid ${money(tax)} instead of ${money(fair)} under the Assumed Par Value Capital method. The ${money(tax - fair)} overpayment is only recoverable by filing an amended annual report and waiting for Delaware's refund; until then that cash is gone from your runway.` });
      notify(state, `You paid ${money(tax)} of Delaware franchise tax. With the Assumed Par Value Capital method it would have been ${money(fair)}. File an amended annual report (Legal → Calendar) to get the difference back.`, { type: 'bad', app: 'legal' });
    }
  }
  return L.paidFilings[key];
}

// Overpaid under the Authorized Shares method: amend the annual report with APVC numbers and request a refund.
export function amendFranchiseTax(state, key, { grossAssets, issuedShares } = {}) {
  const L = ensureLegal(state);
  const paid = L.paidFilings[key];
  if (!paid || paid.method !== 'billed') throw new Error('Only a filing paid under the Authorized Shares method can be amended.');
  if (paid.amended) throw new Error('Already amended.');
  const fs = L.founderStock ?? { authorized: FOUNDER_STOCK.authorized, issued: 0, par: FOUNDER_STOCK.par };
  const year = Number(key.slice('de-franchise-'.length)) - 1;
  const truth = grossAssetsAt(state, year);
  if (!(grossAssets >= 0) || Math.abs(grossAssets - truth) > Math.max(1000, truth * 0.15)) throw new Error(`Gross assets don't match your books at Dec 31, ${year}. Check your bank balance (Bank/Books) for that date.`);
  if (Number(issuedShares) !== fs.issued) throw new Error('Issued shares must match your stock ledger (Legal → Founder).');
  const tax = franchiseAPVC({ grossAssets, issuedShares, authorized: fs.authorized, par: fs.par });
  if (tax == null) throw new Error('The Assumed Par Value Capital method needs issued shares: issue founder stock first (Legal → Founder).');
  const billed = paid.tax ?? franchiseAuthorizedShares(fs.authorized);
  // A late filing's 1.5%/month interest was charged on the billed tax: it shrinks in proportion to the amended tax.
  const lateBilled = Math.max(0, (paid.amount ?? 0) - billed - DELAWARE.annualReportFee);
  const lateInterest = Math.max(0, lateBilled - DELAWARE.latePenalty);
  const lateRefund = billed > 0 && lateBilled > 0 ? lateInterest * (1 - tax / billed) : 0;
  const refund = round2(Math.max(0, billed - tax + lateRefund));
  if (refund <= 0) throw new Error('The APVC method would not lower your tax.');
  paid.amended = { day: state.day, tax, refund, refundDay: state.day + DELAWARE_AMEND.refundDays, received: false };
  return paid.amended;
}

export function payFiling(state, key) {
  const L = ensureLegal(state);
  const item = buildCalendar(state).find((i) => i.key === key);
  if (!item) throw new Error('Nothing due.');
  if (key.startsWith('de-franchise')) throw new Error('Use the franchise tax form.');
  if (key === '83b') throw new Error('Use the 83(b) buttons.');
  if (key.startsWith('tm-oa-')) throw new Error('Respond in the Trademark tab.');
  if (key.startsWith('dsr-')) return answerDsr(state, key.slice(4));
  if (key === 'kyc') return completeKyc(state);
  if (key.startsWith('ai-act-')) throw new Error('Complete it in the AI Act tab.');
  if (L.paidFilings[key]) throw new Error('Already filed and paid.');
  let amount = item.amount;
  const daysLate = state.day - item.dueDay;
  if (key.startsWith('1099-')) {
    const forms = forms1099(state, yearOf(state, item.dueDay) - 1);
    amount = forms.length * ONE_099.perForm + late1099(forms.length, daysLate);
  } else if (key.startsWith('de-llc-tax')) amount += delawareLate(amount, daysLate);
  else if (daysLate > 0 && item.category === 'taxes') amount += 100; // generic state late fee [A]
  if (amount > 0) spend(state, amount, item.title + (daysLate > 0 ? ' (late)' : ''), { category: item.category, counterparty: key.startsWith('1099') ? 'IRS e-file (Track1099-style)' : 'State filing', method: 'ach' });
  L.paidFilings[key] = { day: state.day, amount: round2(amount) };
  return L.paidFilings[key];
}

export function answerDsr(state, id) {
  const L = ensureLegal(state);
  const d = L.dsrs.find((x) => x.id === id);
  if (!d || d.status !== 'open') throw new Error('Not open.');
  d.status = 'answered';
  d.answeredDay = state.day;
  L.done[`dsr-${d.id}`] = true;
}

// Diligence red flags other apps (Fundraising) can read.
export function legalIssues(state) {
  const L = state.apps.legal;
  const out = [];
  if (!state.company.incorporated) out.push('Not incorporated: founder is personally liable; investors cannot invest.');
  if (state.company.path === 'vc' && state.company.entity === 'llc') out.push('LLC: VCs and SAFEs expect a Delaware C-corp (conversion needed).');
  if (L?.founderStock?.missed) out.push('Founder missed the 83(b) election: taxable income at each vesting event.');
  for (const c of state.apps.cofounder?.candidates ?? []) if (c.signed?.missed83b) out.push(`Co-founder ${c.name} missed the 83(b) election: taxable income at each vesting event.`);
  if (state.company.incorporated && !L?.docs?.ipAssignment) out.push('No founder IP assignment to the company.');
  const noCiiaa = (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.status !== 'gone' && !ciiaaSigned(m));
  if (noCiiaa.length) out.push(`${noCiiaa.length} team member(s) without a signed CIIAA.`);
  const noLocalIp = (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.status !== 'gone' && m.engagement === 'contractor' && m.region !== 'us' && m.ciiaa && !m.ipLocal); // people/global.js foreignIpGaps
  if (noLocalIp.length) out.push(`${noLocalIp.length} foreign contractor(s) without a locally enforceable IP assignment: a US form may not transfer ownership under local law.`);
  if (L && buildCalendar(state).some((i) => i.status === 'overdue' && i.kind !== 'info')) out.push('Overdue compliance filings.');
  if (L?.exposure >= 2) out.push('Customer contracts with uncapped liability/indemnity.');
  if ((L?.commingledDays ?? 0) >= KYC.commingleDaysForVeil) out.push(`Company money ran through the founder's personal Stripe/bank for ${L.commingledDays} days after incorporation (commingling).`);
  if (L?.aiFeatures && !L.aiAct?.disclosure) out.push('AI features without EU AI Act Art. 50 disclosure.');
  if (state.company.model !== 'b2c' && activeSubs(state).length && !L?.dpaReady) out.push('Processing B2B customer data without a DPA.');
  return out;
}

// ---------------------------------------------------------------------------
// Legal diligence (investors, acquirers): the paperwork is checked, not taken on trust
// ---------------------------------------------------------------------------
// Odds at financing/M&A diligence (market-people.md §5.8-5.10, money-deals.md §8 "Cap table / IP / legal DD"):
// missing IP assignment ~85% found, 83(b) ~70%, 409A/option paperwork ~80%, cure re-papering $500-5,000 per person,
// a 2-6 week slip, legal fees. Commingling surfaces in the books/QoE review [design 60%]; DPA gaps [design 30%].
export const DILIGENCE = {
  founder_ip: { p: 0.85, usd: [1000, 3000], hours: 3, delay: [14, 42] },
  hire_ciiaa: { p: 0.85, usdPer: [500, 5000], hoursPer: 1, delay: [14, 42] },
  missed_83b: { p: 0.7, usd: [0, 0], hours: 2, delay: [0, 7] },
  no_409a: { p: 0.8, usd: [1500, 5000], hours: 4, delay: [14, 28] },
  commingling: { p: 0.6, usd: [2000, 6000], hours: 8, delay: [7, 21] },
  dpa_gaps: { p: 0.3, usd: [0, 0], hours: 6, delay: [0, 7] },
  uncapped_contracts: { p: 0.7, usd: [2000, 8000], hours: 4, delay: [0, 14] },
};

/** The legal problems that are really there (no dice): what diligence can find. For the Fundraising/M&A apps. */
export function legalDiligenceFindings(state) {
  const L = ensureLegal(state);
  const people = state.apps.people;
  const live = (people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.kind !== 'cofounder' && m.status !== 'gone');
  const out = [];
  const add = (id, label, detail, count = 1) => out.push({ id, label, detail, count, ...DILIGENCE[id] });
  if (state.company.incorporated && !L.docs.ipAssignment) add('founder_ip', 'No founder IP assignment', 'The founder never assigned pre-incorporation code and IP to the company.');
  const unsigned = live.filter((m) => !ciiaaSigned(m));
  if (unsigned.length) add('hire_ciiaa', `${unsigned.length} team member(s) without a signed CIIAA`, `No countersigned invention assignment on file for ${unsigned.map((m) => m.name).join(', ')}: their work may not belong to the company.`, unsigned.length);
  if (L.founderStock?.missed) add('missed_83b', 'Founder missed the 83(b) election', 'Ordinary income at each vesting event; investors price in the founder\'s tax problem.');
  const grants = live.filter((m) => (m.equityPct ?? 0) > 0);
  if (grants.length && !people?.equity?.valuation) add('no_409a', 'Options granted without a 409A', `${grants.length} grant(s) with no independent valuation: holders face 409A penalties unless re-priced.`, grants.length);
  if ((L.commingledDays ?? 0) >= KYC.commingleDaysForVeil) add('commingling', 'Personal and company money commingled', `Customer money ran through the founder's personal accounts for ${L.commingledDays} days after incorporation.`);
  if (L.dpaReady && DPA_PROMISES.some((k) => !L.gdpr[k])) add('dpa_gaps', 'DPA promises without the underlying records', `Missing: ${DPA_PROMISES.filter((k) => !L.gdpr[k]).map((k) => GDPR_ITEMS[k].label).join('; ')}.`);
  if ((L.exposure ?? 0) >= 2) add('uncapped_contracts', 'Customer contracts with uncapped liability', 'Accepted uncapped indemnities or liability in customer paper.');
  return out;
}

/**
 * Run legal diligence for a counterparty. Each real problem is a rep the company is making ("all IP is assigned"),
 * recorded with its truth and found with the research odds; found items cost cure money, founder hours and calendar
 * days, and are logged. Survivors stay open, so the next round or an acquirer can still find them.
 * Returns { found: [...], missed: [...], usd, hours, delayDays }.
 */
export function runLegalDiligence(state, { audience = 'investor', counterparty = 'diligence', apply = true } = {}) {
  const findings = legalDiligenceFindings(state);
  const rid = `legal_dd:${counterparty}`;
  recordClaims(state, { audience, recipientId: rid, channel: 'legal diligence', claims: findings.map((f) => ({ metric: `legal_${f.id}`, claimed: true, truth: false, gap: 1, text: f.label, kind: 'hygiene' })) });
  const pOf = Object.fromEntries(findings.map((f) => [`legal_${f.id}`, f.p]));
  const I = ensureIntegrity(state);
  const open = I.claims.filter((c) => c.recipientId === rid && c.status === 'open');
  const found = [], missed = [];
  for (const c of open) {
    c.checks.push({ day: state.day, check: 'legal diligence' });
    const f = findings.find((x) => `legal_${x.id}` === c.metric);
    if (f && sideRoll(state, `${rid}|${c.metric}`) < pOf[c.metric]) { c.status = 'caught'; c.caughtDay = state.day; c.caughtBy = 'legal diligence'; found.push(f); } else if (f) missed.push(f);
  }
  let usd = 0, hours = 0, delayDays = 0;
  for (const f of found) {
    const span = (r) => (r ? r[0] + sideRoll(state, `${rid}|${f.id}|span`) * (r[1] - r[0]) : 0);
    const cost = Math.round(f.usdPer ? span(f.usdPer) * f.count : span(f.usd));
    const h = round2(f.hoursPer ? f.hoursPer * f.count : f.hours);
    const d = Math.round(span(f.delay));
    usd += cost; hours += h; delayDays = Math.max(delayDays, d);
    if (!apply) continue;
    if (cost > 0) spend(state, cost, `Diligence cure: ${f.label}`, { counterparty: 'Startup law firm', method: 'ach' });
    logMistake(state, { functionId: 'legal_hygiene', id: `diligence_${f.id}`, label: `Diligence found: ${f.label}`, app: 'legal', delayed: true, charge: true, key: `dd:${counterparty}:${f.id}:${state.day}`, cost: { usd: cost, hours: h, days: d }, detail: `${f.detail} ${audience === 'acquirer' ? 'The buyer' : 'Investor counsel'} made fixing it a closing condition: ${d} days of slip.${f.id === 'hire_ciiaa' || f.id === 'founder_ip' ? ' Signing on day one costs minutes; re-papering later needs fresh consideration from people who may have left.' : ''}` });
  }
  if (apply && found.length) notify(state, `Legal diligence found ${found.length} issue(s): ${found.map((f) => f.label).join('; ')}. Cure cost ${money(usd)}, ~${delayDays} days of delay.`, { type: 'bad', app: 'legal' });
  return { found, missed, usd, hours: round2(hours), delayDays };
}

// Spend tracker: legal-app spend by item plus all bank 'legal' category spend.
export function legalSpend(state) {
  const byItem = {};
  let total = 0;
  for (const t of state.bank.txns) {
    if (t.amount >= 0) continue;
    const mine = t.meta?.app === 'legal';
    if (!mine && t.category !== 'legal') continue;
    const k = mine ? t.meta.item : t.description || t.counterparty;
    byItem[k] = round2((byItem[k] ?? 0) - t.amount);
    total -= t.amount;
  }
  return { total: round2(total), byItem };
}

// ---------------------------------------------------------------------------
// Daily tick
// ---------------------------------------------------------------------------


const once = (L, key) => { if (L.notified[key]) return false; L.notified[key] = true; return true; };

export function legalDay(state) {
  const L = ensureLegal(state);

  if (L.incorporation?.status === 'pending' && state.day >= L.incorporation.effectiveDay) completeIncorporation(state, L);
  if (L.conversion?.status === 'pending' && state.day >= L.conversion.doneDay) {
    L.conversion.status = 'done';
    state.company.entity = 'ccorp';
    L.incorporation.entity = 'ccorp';
    L.incorporation.jurisdiction = 'DE';
    L.converted = true;
    L.founderStock = null;
    L.docs.ciiaa = true;
    notify(state, 'Conversion to a Delaware C-corp is complete. Sign new founder stock docs — a new 83(b) clock starts at that grant.', { type: 'good', app: 'legal' });
  }
  if (L.ein.status === 'pending' && state.day >= L.ein.readyDay) { L.ein.status = 'done'; notify(state, 'Your EIN arrived (IRS CP 575 letter). You can now set up payroll and move bank/Stripe to the company.', { type: 'good', app: 'legal' }); }

  // 83(b): a real 30-day deadline.
  const fs = L.founderStock;
  if (fs && !fs.filed83b && !fs.missed) {
    const left = fs.grantDay + DEADLINE_83B_DAYS - state.day;
    if ([20, 7, 2].includes(left)) notify(state, `83(b) election due in ${left} days (${fmtDate(state, fs.grantDay + DEADLINE_83B_DAYS)}). No extensions.`, { type: 'warn', app: 'legal' });
    if (left < 0) {
      fs.missed = true;
      notify(state, 'You missed the 83(b) deadline. Each vesting tranche of your founder stock will now be taxed as ordinary income at its value when it vests — painful after a priced round. Investors will flag it in diligence.', { type: 'bad', app: 'legal' });
    }
  }
  // Consequence of a missed 83(b): personal tax at each monthly vesting event after the cliff.
  if (fs?.missed && state.day >= fs.grantDay + fs.cliffDays && (state.day - fs.grantDay) % 30 === 0) {
    const monthsVested = Math.min(fs.vestYears * 12, Math.floor((state.day - fs.grantDay) / 30.4));
    const prev = L.personalTax.reduce((a, x) => a + x.shares, 0);
    const shares = Math.max(0, Math.round((fs.issued * monthsVested) / (fs.vestYears * 12)) - prev);
    const fmv = state.apps.people?.equity?.valuation?.fmv ?? (state.apps.fundraising?.lastPostMoney ? state.apps.fundraising.lastPostMoney / fs.authorized : fs.par);
    const income = round2(shares * Math.max(0, fmv - fs.par));
    L.personalTax.push({ day: state.day, shares, fmv, income, tax: round2(income * 0.37) });
    // The tax is owed whether or not there is cash: it comes out of the founder's personal savings.
    if (income > 0) personalTxn(state, -round2(income * 0.37), `Income tax on ${shares.toLocaleString('en-US')} vested founder shares (no 83(b))`, 'tax');
    if (income > 500) logMistake(state, { functionId: 'legal_hygiene', id: 'miss_83b', label: 'Vesting tax from the missed 83(b)', app: 'legal', delayed: true, key: `miss_83b:${fs.grantDay}:${state.day}`, cost: { usd: round2(income * 0.37) }, detail: `Vesting ${fmtDate(state, state.day)}: ${shares.toLocaleString('en-US')} shares at $${fmv}/share = ${money(income)} of ordinary income taxed ~37% (${money(income * 0.37)}), due with no cash event. Filing within 30 days would have taxed it at grant (near zero). IRS penalty/interest on late payment is not modelled.` });
    if (income > 500) notify(state, `Vesting event without an 83(b): ${shares.toLocaleString('en-US')} shares vested at $${fmv}/share → ${money(income)} of personal ordinary income (~${money(income * 0.37)} tax at a 37% bracket), with no cash to pay it.`, { type: 'bad', app: 'legal' });
  }

  kycDay(state, L);
  fakeReviewsDay(state);
  if (L.kyc && !L.kyc.done && state.day === L.kyc.dueDay) notify(state, 'Reminder: move your bank account and Stripe to the company\'s name/EIN. Mixing personal and company money weakens the liability shield.', { type: 'warn', app: 'legal' });

  // AI features → AI Act tasks.
  const ai = detectAi(state);
  if (ai.ai && !L.aiFeatures && once(L, 'ai-detected')) notify(state, `You shipped AI-powered features (${ai.features.slice(0, 2).join(', ')}). EU AI Act Art. 50 transparency has applied since 2026-08-02. See Legal → AI Act.`, { type: 'warn', app: 'legal' });
  L.aiFeatures = ai.ai;
  L.aiHighRisk = ai.highRisk;

  // Delaware refunds for amended franchise tax filings.
  for (const [key, p] of Object.entries(L.paidFilings)) {
    const a = p?.amended;
    if (!a || a.received || state.day < a.refundDay) continue;
    a.received = true;
    post(state, { amount: a.refund, counterparty: 'DE Div of Corporations', description: `Delaware franchise tax refund (${key}, amended to APVC method)`, category: 'taxes', method: 'ach', meta: { app: 'legal', item: key } });
    notify(state, `Delaware refunded ${money(a.refund)} of overpaid franchise tax.`, { type: 'good', app: 'legal' });
  }

  // Compliance calendar: reminders, auto-renewals, overdue flags.
  for (const it of buildCalendar(state)) {
    if (it.status === 'done' || it.kind === 'info') continue;
    if (it.kind === 'auto' && state.day >= it.dueDay) {
      spend(state, it.amount, it.title, { counterparty: 'Registered agent' });
      L.paidFilings[it.key] = { day: state.day, amount: it.amount };
      continue;
    }
    if (it.dueDay - state.day === 14 && once(L, `${it.key}-remind`)) notify(state, `Due ${fmtDate(state, it.dueDay)}: ${it.title}.`, { type: 'warn', app: 'legal' });
    if (state.day === it.dueDay + 1 && once(L, `${it.key}-overdue`)) notify(state, `Overdue: ${it.title}. ${it.key.startsWith('de-') ? 'Delaware charges $200 + 1.5% per month.' : it.key.startsWith('1099') ? 'IRS penalties per form grow with time.' : ''}`, { type: 'bad', app: 'legal' });
  }

  // Trademark examination timeline.
  for (const tm of L.trademarks) {
    if (tm.status === 'pending' && state.day >= tm.examDay) {
      const pOA = clamp(TRADEMARK.officeActionChance * (tm.attorney ? 0.5 : 1) + tm.conflictRisk * 0.5 + (tm.freeform ? 0 : -0.05), 0.05, 0.9);
      if (chance(state, pOA)) { tm.status = 'office_action'; tm.responseDue = state.day + TRADEMARK.responseDays; notify(state, `USPTO office action on "${tm.mark}". Respond by ${fmtDate(state, tm.responseDue)}.`, { type: 'warn', app: 'legal' }); }
      else { tm.status = 'published'; tm.publishDay = state.day + TRADEMARK.publicationDays; }
    } else if (tm.status === 'office_action' && state.day > tm.responseDue) {
      tm.status = 'abandoned';
      notify(state, `Trademark "${tm.mark}" abandoned: office action deadline missed. Fees are not refunded.`, { type: 'bad', app: 'legal' });
    } else if (tm.status === 'published' && state.day >= tm.publishDay + TRADEMARK.registrationDays) {
      tm.status = 'registered'; tm.registeredDay = state.day;
      notify(state, `"${tm.mark}" is a registered trademark. You can use ®.`, { type: 'good', app: 'legal' });
    }
  }

  // SOC 2 progress, audits and questionnaires: legal/compliance.js complianceDay (called by the Legal app).

  maybeRedlines(state, L);
  for (const r of L.redlines) {
    if (r.status === 'open' && state.day > r.dueDay) {
      r.status = chance(state, 0.6) ? 'lost' : 'signed';
      if (r.status === 'lost') loseDeal(state, r);
      else notify(state, `${r.customer} gave up waiting and signed your standard terms.`, { type: 'info', app: 'legal' });
    }
  }

  // Data-subject requests (GDPR one month, CCPA 45 days). Rate: 0.5-2 per 1,000 B2C users a month; B2B receives fewer
  // (employees of customers, who should be routed to the customer as controller) [design, docs/research/support/s2 flow 3].
  // The work itself is done in the Helpdesk (support/flows.js); the clock lives here.
  if (dayOfWeek(state) === 3 && state.company.model !== 'ent') {
    const n = activeSubs(state).length;
    const perWeek = n * (state.company.model === 'b2c' ? 0.0003 : 0.00015); // 1.25/1000/mo -> 0.0003/user/week [design]
    if (n && chance(state, Math.min(0.3, perWeek))) {
      const ccpa = rng(state) < 0.3, kind = rng(state) < 0.6 ? 'deletion' : rng(state) < 0.7 ? 'access' : 'export';
      const d = {
        id: uid('dsr'), type: kind === 'deletion' ? 'deletion' : 'access', regime: ccpa ? 'ccpa' : 'gdpr', name: pick(state, ['Lena Vogt', 'Pierre Martin', 'Sofia Rossi', 'Jan de Vries', 'Ana Costa']), day: state.day,
        dueDay: state.day + (ccpa ? 45 : 30), ackDueDay: ccpa ? state.day + 14 : null, status: 'open',
        facts: { kind, complex: rng(state) < 0.2, impostor: rng(state) < 0.04, route: state.company.model === 'smb' && rng(state) < 0.5, billingActive: rng(state) < 0.7 },
      };
      L.dsrs.unshift(d);
      notify(state, `${ccpa ? 'CCPA' : 'GDPR'} ${kind} request from ${d.name}. Answer within ${ccpa ? '45 days' : 'one month'}. The work happens in the Helpdesk.`, { type: 'warn', app: 'legal' });
    }
    for (const d of L.dsrs) if (d.status === 'open' && state.day > d.dueDay) { d.status = 'missed'; L.exposure = round2(L.exposure + 0.5); notify(state, `You missed a ${d.regime === 'ccpa' ? 'CCPA' : 'GDPR'} request deadline (${d.name}). They can complain to their data protection authority.`, { type: 'bad', app: 'legal' }); }
    if (L.dsrs.length > 50) L.dsrs.length = 50;
  }

  // Operating without an entity gets riskier as revenue grows.
  if (!state.company.incorporated && mrr(state) > 1000 && state.day % 30 === 0) notify(state, `You're earning ${money(mrr(state))} MRR as an unincorporated sole proprietor: you are personally liable for contracts and claims. Incorporate in Legal.`, { type: 'warn', app: 'legal' });
}

export function legalMonthEnd(state) {
  const L = ensureLegal(state);
  // Rare claims from risky contract terms [A].
  if (L.exposure > 0 && chance(state, Math.min(0.05, 0.004 * L.exposure))) {
    const cost = round2(5000 + rng(state) * 20000);
    spend(state, cost, 'Customer claim under contract (legal defense / settlement)', { counterparty: 'Litigation counsel', method: 'ach' });
    notify(state, `A customer made a claim under contract terms you accepted. Defense and settlement cost ${money(cost)}.`, { type: 'bad', app: 'legal' });
    maybePierce(state, cost, 'a customer claim under contract');
  }
  dpaAuditMonth(state, L);
  regulatorMonth(state, L);
  ipDisputeMonth(state, L);
}

// Without diligence, a missing invention assignment stays invisible until an ownership dispute: ~2%/yr per person
// who created work without one (market-people.md §5.8 [design]). Cost: counsel plus a buy-out of the claim.
function ipDisputeMonth(state) {
  const people = (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.kind !== 'cofounder' && !ciiaaSigned(m) && state.day - (m.startDay ?? state.day) >= 30 && (m.status !== 'gone' || state.day - (m.endDay ?? m.leftDay ?? state.day) <= 730));
  for (const m of people) {
    if (m.ipDispute || sideRoll(state, `ipdispute|${m.id}`) >= 0.02 / 12) continue;
    m.ipDispute = state.day;
    const cost = round2(5000 + sideRoll(state, `ipdispute-cost|${m.id}`) * 15000);
    spend(state, cost, `IP ownership dispute: ${m.name} (counsel + assignment buy-out)`, { counterparty: 'Litigation counsel', method: 'ach' });
    notify(state, `${m.name} claims ownership of work they did for ${state.company.name}: there is no signed invention assignment. Counsel and a buy-out cost ${money(cost)}.`, { type: 'bad', app: 'legal' });
    logMistake(state, { functionId: 'legal_hygiene', id: 'ip_dispute_no_ciiaa', label: 'IP ownership dispute: no signed CIIAA', app: 'legal', delayed: true, charge: true, cost: { usd: cost, hours: 8 }, detail: `${m.name} worked without a countersigned CIIAA. Collecting it in onboarding takes half an hour.` });
  }
}

export { dayFor };
