// Legal simulation: state slice, player actions (pure state mutations used by the UI and tests) and the
// daily tick (incorporation processing, deadlines, penalties, SOC 2 / trademark timelines, redlines, DSRs).

import { ensure, notify, log } from '../../core/state.js';
import { post, addRecurring } from '../../core/bank.js';
import { activeSubs, cancel, refund, monthlyAmount, mrr } from '../../core/stripe.js';
import { shippedFeatures } from '../../core/market.js';
import { newThread, addMessage } from '../../core/mail.js';
import { uid, rng, chance, clamp, round2, hash, dayOfWeek, fmtDate, money, pick } from '../../core/util.js';
import { PROVIDERS, OPERATING_STATES, CONVERSION, DELAWARE, FOUNDER_STOCK, POLICIES, DPA, GDPR_ITEMS, AI_ACT_ITEMS, SOC2, TRADEMARK, CONTRACTS, ONE_099, DEADLINE_83B_DAYS } from './catalog.js';
import { buildCalendar, dayFor, yearOf, franchiseAuthorizedShares, franchiseAPVC, delawareLate, late1099, grossAssetsAt, forms1099 } from './deadlines.js';
import { CLAUSES, scoreRedlines } from './redlines.js';

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
  if (p.einByService) L.ein = { status: 'pending', readyDay: state.day + (inc.operatingState === 'nonus' ? 28 : 7) };
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
  L.ein = nonUs ? { status: 'pending', readyDay: state.day + 28 } : { status: 'done', readyDay: state.day };
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
}

// ---------------------------------------------------------------------------
// Policies, privacy, AI Act
// ---------------------------------------------------------------------------

export function setPolicies(state, kind) {
  const L = ensureLegal(state);
  const p = POLICIES[kind];
  if (!p) throw new Error('Unknown option.');
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

export function setupDpa(state, kind) {
  const L = ensureLegal(state);
  const d = DPA[kind];
  if (!d) throw new Error('Unknown option.');
  if (d.once) spend(state, d.once, 'DPA + security exhibit (law firm)', { counterparty: 'Startup law firm', method: 'ach' });
  L.gdpr.subprocessors = true;
  L.dpaReady = true;
  L.dpaSource = kind;
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
// SOC 2
// ---------------------------------------------------------------------------

export function startSoc2(state, type, { windowMonths = 3, pentest = true } = {}) {
  const L = ensureLegal(state);
  if (type === 'type1' && L.soc2 !== 'none') throw new Error('SOC 2 already underway.');
  if (type === 'type2' && !['none', 'type1'].includes(L.soc2)) throw new Error('A Type II is already underway or done.');
  if (![3, 6, 12].includes(windowMonths)) throw new Error('Observation window: 3, 6 or 12 months.');
  const plan = L.soc2Plan ?? { platformPaidDay: null };
  if (plan.platformPaidDay == null || state.day - plan.platformPaidDay >= 365) {
    spend(state, SOC2.platform, 'Compliance automation platform (annual)', { category: 'software', counterparty: 'Vanta' });
    plan.platformPaidDay = state.day;
  }
  if (pentest && !plan.pentestDay) { spend(state, SOC2.pentest, 'Penetration test', { counterparty: 'Pentest firm', method: 'ach' }); plan.pentestDay = state.day; }
  if (type === 'type1') {
    Object.assign(plan, { type, startDay: state.day, readyDay: state.day + SOC2.type1Days });
    L.soc2 = 'type1_in_progress';
  } else {
    const ready = L.soc2 === 'type1' ? 0 : SOC2.readinessDays;
    Object.assign(plan, { type, startDay: state.day, windowMonths, readyDay: state.day + ready + windowMonths * 30 + SOC2.fieldworkReportDays });
    L.soc2 = 'type2_in_progress';
  }
  L.soc2Plan = plan;
  return plan;
}

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
  return { model: state.company.model, hasMsa: L.docs.msa !== 'none', dpaReady: L.dpaReady, soc2: L.soc2 };
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
  const fs = L.founderStock ?? { authorized: FOUNDER_STOCK.authorized, issued: 0, par: FOUNDER_STOCK.par };
  const year = yearOf(state, item.dueDay) - 1;
  let tax;
  if (method === 'apvc') {
    const truth = grossAssetsAt(state, year);
    if (!(grossAssets >= 0) || Math.abs(grossAssets - truth) > Math.max(1000, truth * 0.15)) throw new Error(`Gross assets don't match your books at Dec 31, ${year}. Check your bank balance (Bank/Books) for that date.`);
    if (Number(issuedShares) !== fs.issued) throw new Error('Issued shares must match your stock ledger (Legal → Founder).');
    tax = franchiseAPVC({ grossAssets, issuedShares, authorized: fs.authorized, par: fs.par });
  } else tax = franchiseAuthorizedShares(fs.authorized);
  const late = delawareLate(tax, state.day - item.dueDay);
  spend(state, tax + DELAWARE.annualReportFee + late, `Delaware franchise tax ${year} (${method === 'apvc' ? 'Assumed Par Value Capital' : 'Authorized Shares'} method) + annual report${late ? ' + late penalty' : ''}`, { category: 'taxes', counterparty: 'DE Div of Corporations', method: 'ach' });
  L.paidFilings[key] = { day: state.day, amount: round2(tax + DELAWARE.annualReportFee + late), method };
  return L.paidFilings[key];
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
  if (state.company.incorporated && !L?.docs?.ipAssignment) out.push('No founder IP assignment to the company.');
  const noCiiaa = (state.apps.people?.members ?? []).filter((m) => m.kind !== 'ai_agent' && m.status !== 'gone' && !m.ciiaa);
  if (noCiiaa.length) out.push(`${noCiiaa.length} team member(s) without a signed CIIAA.`);
  if (L && buildCalendar(state).some((i) => i.status === 'overdue' && i.kind !== 'info')) out.push('Overdue compliance filings.');
  if (L?.exposure >= 2) out.push('Customer contracts with uncapped liability/indemnity.');
  if (L?.aiFeatures && !L.aiAct?.disclosure) out.push('AI features without EU AI Act Art. 50 disclosure.');
  if (state.company.model !== 'b2c' && activeSubs(state).length && !L?.dpaReady) out.push('Processing B2B customer data without a DPA.');
  return out;
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

function chargeFounder(state, hours, label) {
  const f = state.founder;
  const h = round2(Math.min(hours, Math.max(0, f.hoursPerWeek - f.hoursUsed)));
  if (h <= 0) return 0;
  f.hoursUsed += h;
  f.timeLog ??= [];
  f.timeLog.push({ day: state.day, hours: h, label });
  return h;
}

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
    if (income > 500) notify(state, `Vesting event without an 83(b): ${shares.toLocaleString('en-US')} shares vested at $${fmv}/share → ${money(income)} of personal ordinary income (~${money(income * 0.37)} tax at a 37% bracket), with no cash to pay it.`, { type: 'bad', app: 'legal' });
  }

  if (L.kyc && !L.kyc.done && state.day === L.kyc.dueDay) notify(state, 'Reminder: move your bank account and Stripe to the company\'s name/EIN. Mixing personal and company money weakens the liability shield.', { type: 'warn', app: 'legal' });

  // AI features → AI Act tasks.
  const ai = detectAi(state);
  if (ai.ai && !L.aiFeatures && once(L, 'ai-detected')) notify(state, `You shipped AI-powered features (${ai.features.slice(0, 2).join(', ')}). EU AI Act Art. 50 transparency has applied since 2026-08-02. See Legal → AI Act.`, { type: 'warn', app: 'legal' });
  L.aiFeatures = ai.ai;
  L.aiHighRisk = ai.highRisk;

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

  // SOC 2 progress: internal time each Monday; slips when the founder can't put the hours in.
  const plan = L.soc2Plan;
  if (plan && L.soc2.endsWith('in_progress')) {
    if (dayOfWeek(state) === 1) {
      const got = chargeFounder(state, SOC2.weeklyHours, 'SOC 2: policies, evidence, vendor reviews');
      if (got < SOC2.weeklyHours) plan.readyDay += Math.round(7 * (1 - got / SOC2.weeklyHours));
    }
    if (state.day >= plan.readyDay) {
      const t1 = L.soc2 === 'type1_in_progress';
      spend(state, t1 ? SOC2.type1Audit : SOC2.type2Audit, `SOC 2 ${t1 ? 'Type I' : 'Type II'} audit`, { counterparty: 'CPA audit firm', method: 'ach' });
      L.soc2 = t1 ? 'type1' : 'type2';
      plan.doneDay = state.day;
      notify(state, `SOC 2 ${t1 ? 'Type I' : 'Type II'} report issued. Share it under NDA from your trust center.`, { type: 'good', app: 'legal' });
    }
  }
  if (plan && L.soc2 !== 'none' && plan.platformPaidDay != null && state.day - plan.platformPaidDay >= 365) {
    spend(state, SOC2.platform, 'Compliance automation platform (annual renewal)', { category: 'software', counterparty: 'Vanta' });
    plan.platformPaidDay = state.day;
  }

  maybeRedlines(state, L);
  for (const r of L.redlines) {
    if (r.status === 'open' && state.day > r.dueDay) {
      r.status = chance(state, 0.6) ? 'lost' : 'signed';
      if (r.status === 'lost') loseDeal(state, r);
      else notify(state, `${r.customer} gave up waiting and signed your standard terms.`, { type: 'info', app: 'legal' });
    }
  }

  // GDPR data-subject requests (B2C/SMB with EU users) [A frequency].
  if (dayOfWeek(state) === 3 && state.company.model !== 'ent') {
    const n = activeSubs(state).length;
    if (n && chance(state, Math.min(0.3, n * 0.002))) {
      const d = { id: uid('dsr'), type: rng(state) < 0.6 ? 'deletion' : 'access', name: pick(state, ['Lena Vogt', 'Pierre Martin', 'Sofia Rossi', 'Jan de Vries', 'Ana Costa']), day: state.day, dueDay: state.day + 30, status: 'open' };
      L.dsrs.unshift(d);
      notify(state, `GDPR ${d.type} request from ${d.name}. Answer within one month.`, { type: 'warn', app: 'legal' });
    }
    for (const d of L.dsrs) if (d.status === 'open' && state.day > d.dueDay) { d.status = 'missed'; L.exposure = round2(L.exposure + 0.5); notify(state, `You missed a GDPR request deadline (${d.name}). They can complain to their data protection authority.`, { type: 'bad', app: 'legal' }); }
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
  }
}

export { dayFor };
