// Pre-selling: test a specific offer (description, price, start date) before the product exists, and ask the
// prospect for a commitment. Mom Test (Fitzpatrick): compliments are not demand; commitments cost the other side
// something (money, a signature, reputation).
//
// Hidden truth per prospect: real intent from pain x fit x budget (x who they are). Polite interest ("sounds great,
// keep me posted") is cheap and common, so it never counts as demand; only an LOI, a deposit or a pre-order does.
// Operator quality (ARCHITECTURE principle 7):
//   stellar   asks for money or a signed LOI after the pain is confirmed, ties every promise to something on the
//             roadmap, labels each answer correctly, delivers on the date (or tells people early).
//   good      asks for LOIs/deposits, a promise or two is loose, misreads an occasional "send me the contract".
//   average   asks "would you buy this?" (verbal), counts friendly answers as interest.
//   mediocre  counts compliments as validation, promises features nobody planned, takes deposits and misses the date.
// Money moves only through core/stripe.js (charge, refund). Refund rules: the US FTC Mail, Internet, or Telephone
// Order Merchandise Rule sets a 30-day shipping expectation, after which you must offer a refund [real rule,
// applied here by analogy to pre-orders; the rest of the probabilities below are [design]].
import { rng, chance, clamp, uid, hash } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { logMistake, tierFromScore } from '../../core/operator.js';
import { hasProduct, mainPlan } from '../../core/market.js';
import { createCustomer, charge, refund, subscribe } from '../../core/stripe.js';
import { researchSlice } from '../product/store.js';
import { ensureCrm, contactById, companyById, dealById, addActivity, stripeSource, contactName } from './model.js';
import { personaFor } from './replies.js';
import { budgetFit } from './deals.js';
import { emitSalesEvent } from './events.js';

export const PRESELL = {
  graceDays: 30, // after the start date; then everything is refunded (FTC order rule by analogy)
  lateRefundP: 0.15, // [design] share of paying customers who ask for money back the day you are late
  minLeadDays: 7, // an offer needs a real date at least a week out
  writeHours: 0.5, presentHours: 0.5, askHours: 0.1, labelHours: 0.03,
  loiConvert: 0.5, // [design] LOIs are non-binding: about half become paying customers
  moneyConvert: 0.92, // [design]
  depositPct: 0.2,
};
export const LEVELS = {
  verbal: { label: 'Verbal interest', cost: 'none', strength: 0, ask: 'Would you want this?' },
  loi: { label: 'Signed LOI', cost: 'reputation', strength: 0.5, ask: 'Would you sign a short letter of intent to buy at this price when it ships?' },
  deposit: { label: 'Deposit', cost: 'money', strength: 0.8, ask: 'Would you put down a refundable deposit to reserve a spot?' },
  preorder: { label: 'Pre-order', cost: 'money', strength: 1, ask: 'Would you pre-pay the first period today? Full refund if I miss the date.' },
};
const AUTH_MULT = { 'economic buyer': 1, 'budget influencer / likely champion': 0.8, 'champion without budget': 0.45, 'end user with no buying authority': 0.2 };
const POLITE = ['Sounds great, keep me posted!', 'Love it. Let me know when it is ready.', 'This is really interesting, definitely send me updates.', 'Wow, nice. We should talk again when it launches.'];
const STALL = ['I would need to run it by my partner first.', 'Send me the details and I will bring it to our next planning meeting.', 'Budget is locked until next quarter, circle back then.'];
const DECLINE = ['Honestly, no. We are fine with what we have.', 'It is not a priority for us right now.'];
const YES = { loi: 'Yes, send the LOI over and I will sign it.', deposit: 'Okay, I will put the deposit down, send the invoice.', preorder: 'Fine, I will pre-pay. That is how I know you will actually build it.' };

export function ensurePresell(state) {
  const crm = ensureCrm(state);
  crm.presell ??= { offers: [], asks: [], stats: { inflated: 0, missedReal: 0, correct: 0, labeled: 0 } };
  return crm.presell;
}
export const offerById = (state, id) => ensurePresell(state).offers.find((o) => o.id === id);
const monthlyOf = (o) => (o.interval === 'month' ? o.price : o.price / 12);

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

/** How clear and concrete the pitch is (0..1): length, outcome words, a number, a date, a price. */
export function offerClarity({ description = '', price = 0, startDay = null, promises = [] }) {
  const w = String(description).trim().split(/\s+/).filter(Boolean).length;
  const issues = [];
  let s = 0.3;
  if (w >= 20 && w <= 120) s += 0.25; else issues.push(w < 20 ? 'Too thin: say who it is for, what problem it removes and what they get.' : 'Too long: a pre-sell offer fits on one screen.');
  if (/\d/.test(description)) s += 0.15; else issues.push('No number in the description (hours saved, errors avoided, cost).');
  if (/\b(so that|saves?|reduces?|cuts?|stops?|replaces?|instead of|without)\b/i.test(description)) s += 0.15; else issues.push('Say the outcome, not the feature list.');
  if (price > 0) s += 0.1;
  if (startDay != null) s += 0.05;
  if (promises.length >= 1 && promises.length <= 4) s += 0.05; else if (promises.length > 4) issues.push('More than 4 promises is a roadmap you cannot ship by the date.');
  return { score: clamp(s, 0.1, 1), issues };
}

/** A promise is backed when it points to a feature that is shipped, building or queued. */
export function promiseStatus(state, p) {
  const f = p.featureId ? (state.apps.product?.features ?? []).find((x) => x.id === p.featureId) : null;
  if (!f) return 'unbacked';
  return f.status === 'shipped' ? 'shipped' : ['building', 'queued'].includes(f.status) ? 'planned' : 'unbacked';
}

export function createOffer(state, { title, description, price, interval = 'month', startDay, promises = [] }) {
  const P = ensurePresell(state);
  if (!String(title ?? '').trim()) throw new Error('Name the offer.');
  if (!(Number(price) > 0)) throw new Error('An offer needs a price.');
  if (!['month', 'year', 'once'].includes(interval)) throw new Error('Interval must be month, year or once.');
  if (!Number.isFinite(startDay) || startDay < state.day + PRESELL.minLeadDays) throw new Error('Give a real start date at least a week from now.');
  const cl = offerClarity({ description, price: Number(price), startDay, promises });
  const o = { id: uid('off'), title: String(title).trim().slice(0, 80), description: String(description ?? '').trim().slice(0, 800), price: Math.round(Number(price) * 100) / 100, interval, startDay, originalStartDay: startDay, promises: promises.map((p) => ({ text: String(p.text ?? '').slice(0, 120), featureId: p.featureId || null })), createdDay: state.day, status: 'open', clarity: cl.score, clarityIssues: cl.issues, extensions: 0 };
  P.offers.unshift(o);
  return o;
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

/**
 * The prospect's hidden intent for this offer (0..1), from the same person facts as sales and research
 * (truth-persona.js): real pain x its intensity x true WTP against THIS price. Fit to your ICP text plays no part:
 * a person in a weak segment has no pain however well the offer is written. Fixed per deal and offer.
 */
export function hiddenIntent(state, deal, offer) {
  deal.presell ??= { intent: {} };
  deal.presell.intent ??= {};
  if (deal.presell.intent[offer.id] != null) return deal.presell.intent[offer.id];
  const ct = contactById(state, deal.contactId);
  const co = companyById(state, deal.companyId) ?? {};
  const persona = personaFor(state, ct ?? { email: deal.id }, co);
  const noise = 0.85 + 0.3 * rng(state);
  let v;
  if (persona.person) {
    const wtpRatio = (persona.wtpTrue ?? persona.budgetMonthly) / Math.max(1, monthlyOf(offer)); // true WTP vs the price asked
    const priceFit = clamp(budgetFit(wtpRatio), 0, 1);
    const pain = persona.hasPain ? 0.25 + 0.75 * persona.intensity : 0.04;
    v = clamp(pain * (0.15 + 0.85 * priceFit) * noise * 1.15, 0, 1);
  } else {
    const fit = co.prospect?.fit ?? co.research?.fit ?? 0.5;
    const budget = clamp(budgetFit(persona.budgetMonthly / Math.max(1, monthlyOf(offer))), 0, 1);
    v = clamp((persona.hasPain ? 1 : 0.15) * (0.3 + 0.7 * fit) * (0.3 + 0.7 * budget) * noise * 1.15, 0, 1);
  }
  deal.presell.intent[offer.id] = +v.toFixed(3);
  return deal.presell.intent[offer.id];
}

const pickBy = (arr, seed) => arr[parseInt(hash(seed), 36) % arr.length];

/**
 * Present the offer to a prospect and ask for a commitment at a level. One ask per level per deal and offer.
 * Money levels charge through Stripe. Returns the ask record: { outcome: 'committed'|'polite'|'stall'|'decline', response }.
 */
export function askForCommitment(state, { offerId, dealId, level = 'preorder', depositPct = PRESELL.depositPct }) {
  const P = ensurePresell(state);
  const offer = offerById(state, offerId);
  const deal = dealById(state, dealId);
  if (!offer || offer.status !== 'open') throw new Error('That offer is not open.');
  if (!deal || ['won', 'lost'].includes(deal.stage)) throw new Error('Pick an open deal.');
  if (!LEVELS[level]) throw new Error('Unknown ask.');
  const ct = contactById(state, deal.contactId);
  if (!ct) throw new Error('The deal has no contact to ask.');
  if (P.asks.some((a) => a.offerId === offerId && a.dealId === dealId && a.level === level)) throw new Error('You already asked for that. Asking again does not change the answer.');
  const co = companyById(state, deal.companyId) ?? {};
  const persona = personaFor(state, ct, co);
  const intent = hiddenIntent(state, deal, offer);
  const unbacked = offer.promises.filter((p) => promiseStatus(state, p) === 'unbacked').length;
  const hype = 1 + Math.min(0.4, 0.15 * unbacked); // promising what is not planned makes people say yes more
  const eff = clamp(intent * hype * (0.7 + 0.5 * offer.clarity), 0, 1);
  const auth = AUTH_MULT[persona.authority] ?? 0.4; // hidden budget authority (truth), not the job title
  // Money needs true WTP near the price (a person who would never pay this much signs nothing, however nice they are).
  const priceOk = persona.person ? clamp(((persona.wtpTrue ?? 0) / Math.max(1, monthlyOf(offer)) - 0.4) / 0.6, 0.03, 1) : 1;
  const pCommit = level === 'verbal' ? 0 : level === 'loi' ? Math.pow(eff, 1.3) * 0.7 * auth * (0.4 + 0.6 * priceOk) : level === 'deposit' ? Math.pow(eff, 1.5) * 0.55 * auth * priceOk : Math.pow(eff, 1.8) * 0.45 * auth * priceOk;
  const r = rng(state), r2 = rng(state);
  const seed = `${ct.email}|${offerId}|${level}`;
  let outcome, response;
  if (r < pCommit) { outcome = 'committed'; response = YES[level]; }
  else {
    // Compliments are the default answer to a hypothetical; the less real the need, the nicer they are about it.
    const pol = persona.politeness ?? 0.25; // warm and friendly people say yes more often, not mean it more
    const politeP = level === 'verbal' ? clamp(0.6 + 0.35 * pol, 0, 0.95) : clamp(0.2 + 0.3 * (1 - intent) + 0.25 * pol, 0, 0.9);
    outcome = r2 < politeP ? 'polite' : r2 < politeP + 0.55 * (1 - politeP) ? 'stall' : 'decline';
    response = outcome === 'polite' ? `${pickBy(POLITE, seed)}${persona.statedWtp && persona.hasPain ? ` I'd pay around $${Math.round(persona.statedWtp)} a month.` : ''}` : outcome === 'stall' ? pickBy(STALL, seed) : pickBy(DECLINE, seed);
  }
  const ask = { id: uid('ask'), offerId, dealId, contactId: ct.id, level, day: state.day, outcome, response, intent, statedWtp: outcome === 'polite' && persona.hasPain ? persona.statedWtp : null, label: null, status: outcome === 'committed' ? 'open' : 'none', amount: 0, customerId: null, chargeId: null, who: `${contactName(ct)}${co.name ? `, ${co.name}` : ''}` };
  if (outcome === 'committed' && LEVELS[level].cost === 'money') {
    const amount = Math.round(offer.price * (level === 'deposit' ? clamp(depositPct, 0.05, 0.5) : 1) * 100) / 100;
    const customer = createCustomer(state, { name: contactName(ct), email: ct.email ?? '', company: co.name ?? null, source: stripeSource(deal.source), crmCompanyId: co.id ?? null, meta: { dealId: deal.id, presell: offer.id } });
    const ch = charge(state, customer.id, { amount, description: `${level === 'deposit' ? 'Deposit' : 'Pre-order'}: ${offer.title}`, source: stripeSource(deal.source) });
    ask.customerId = customer.id; ask.chargeId = ch?.id ?? null; ask.amount = ch ? amount : 0;
  }
  P.asks.push(ask);
  deal.presell.asks = [...(deal.presell.asks ?? []), ask.id];
  addActivity(state, { type: 'note', text: `Pre-sell "${offer.title}": asked for ${LEVELS[level].label.toLowerCase()} → ${outcome === 'committed' ? 'COMMITTED' : outcome}. "${response}"`, dealId: deal.id, companyId: deal.companyId, contactId: ct.id });
  if (outcome === 'committed') {
    feedInsight(state, ask, offer);
    emitSalesEvent(state, 'offer_commitment_received', { dealId: deal.id, contactId: ct.id, askId: ask.id, level, amount: ask.amount }, `ofc:${ask.id}`);
    if (!deal.nextStep) deal.nextStep = { text: `Deliver "${offer.title}" on schedule`, dueDay: offer.startDay };
  }
  return ask;
}

function feedInsight(state, ask, offer) {
  const sl = researchSlice(state);
  if (sl.insights.some((i) => i.presellAskId === ask.id)) return;
  const what = ask.level === 'loi' ? 'signed a letter of intent' : ask.level === 'deposit' ? `paid a $${ask.amount} deposit` : `pre-paid $${ask.amount}`;
  sl.insights.unshift({ id: uid('ins'), interviewId: null, presellAskId: ask.id, theme: 'Pre-sell commitments', text: `${ask.who} ${what} for "${offer.title}" before it exists`, type: 'commitment', real: true, verified: true, who: ask.who, day: ask.day });
}

/** Is this answer demand? Only an LOI, deposit or pre-order is. */
export const isCommitment = (ask) => ask.outcome === 'committed' && LEVELS[ask.level].strength > 0;

/** The founder's call: does this answer count as demand evidence? Counting a compliment is the classic Mom Test mistake. */
export function labelAsk(state, askId, countsAsDemand) {
  const P = ensurePresell(state);
  const ask = P.asks.find((a) => a.id === askId);
  if (!ask) throw new Error('Unknown answer.');
  if (ask.label != null) throw new Error('Already labelled.');
  ask.label = Boolean(countsAsDemand);
  const truth = isCommitment(ask);
  P.stats.labeled++;
  if (ask.label && !truth) {
    P.stats.inflated++;
    logMistake(state, { functionId: 'customer_discovery', id: 'compliments', label: 'Counted a compliment as demand', app: 'crm', key: `pre_compliment:${ask.id}`, charge: true, cost: { hours: 0.5, days: 7 },
      detail: `${ask.who}: "${ask.response}" cost them nothing to say. You now believe in demand that is not there, and you will chase this lead and plan around it. Count commitments (money, a signature, an intro), not compliments.` });
  } else if (!ask.label && truth) P.stats.missedReal++;
  else P.stats.correct++;
  return { correct: ask.label === truth, truth };
}

// ---------------------------------------------------------------------------
// Delivery, delays and refunds
// ---------------------------------------------------------------------------

const moneyAsks = (state, offerId) => ensurePresell(state).asks.filter((a) => a.offerId === offerId && a.status === 'open' && a.chargeId);
const openAsks = (state, offerId) => ensurePresell(state).asks.filter((a) => a.offerId === offerId && a.status === 'open' && isCommitment(a));

function refundAsk(state, ask, reason) {
  let fee = 0;
  if (ask.chargeId) {
    const ch = state.stripe?.charges?.find((c) => c.id === ask.chargeId);
    try { if (refund(state, ask.chargeId, { reason })) fee = ch?.fee ?? 0; } catch { /* already refunded */ }
  }
  ask.status = 'refunded';
  return fee;
}

/** The pre-sold offer is ready: convert commitments into customers. Missing promises cost refunds and reputation. */
export function deliverOffer(state, offerId) {
  const offer = offerById(state, offerId);
  if (!offer || offer.status !== 'open') throw new Error('That offer is not open.');
  if (!hasProduct(state)) throw new Error('Nothing is shipped yet: there is nothing to deliver.');
  const plan = mainPlan(state);
  if (!plan) throw new Error('Create a plan in Payments first.');
  const missing = offer.promises.filter((p) => promiseStatus(state, p) !== 'shipped');
  const missShare = offer.promises.length ? missing.length / offer.promises.length : 0;
  let converted = 0, refunded = 0, lapsed = 0, fees = 0;
  for (const ask of openAsks(state, offerId)) {
    const money = Boolean(ask.chargeId);
    const pRefund = missing.length ? 0.15 + 0.35 * missShare : 1 - PRESELL.moneyConvert;
    const stays = money ? !chance(state, pRefund) : chance(state, PRESELL.loiConvert * (1 - 0.6 * missShare));
    if (!stays) { if (money) { fees += refundAsk(state, ask, 'requested_by_customer'); refunded++; } else { ask.status = 'lapsed'; lapsed++; } continue; }
    const ct = contactById(state, ask.contactId);
    const co = ct ? companyById(state, ct.companyId) : null;
    const customerId = ask.customerId ?? createCustomer(state, { name: ct ? contactName(ct) : 'Customer', email: ct?.email ?? '', company: co?.name ?? null, source: 'outbound', crmCompanyId: co?.id ?? null, meta: { presell: offer.id } }).id;
    const paidShare = money ? clamp(ask.amount / Math.max(1, offer.price), 0, 1) : 0;
    const p = { ...plan, price: offer.interval === plan.interval ? offer.price : plan.price, trialDays: Math.round((plan.interval === 'year' ? 365 : 30) * paidShare) }; // what they pre-paid covers the first period
    subscribe(state, customerId, p, { trial: p.trialDays > 0, source: 'outbound' });
    ask.status = 'delivered'; ask.customerId = customerId;
    converted++;
  }
  offer.status = 'delivered'; offer.deliveredDay = state.day;
  if (missing.length && (refunded || converted)) {
    logMistake(state, { functionId: 'customer_discovery', id: 'overpromised_features', label: 'Pre-sold features that did not ship', app: 'crm', key: `overpromise:${offer.id}`, delayed: true, cost: { customers: refunded + lapsed, usd: Math.round(fees * 100) / 100, reputation: 0.5 + 0.3 * missing.length },
      detail: `"${offer.title}" promised ${missing.map((p) => `"${p.text}"`).join(', ')}, which was not shipped. ${refunded} customer(s) took their money back and the rest start with a product that does less than you said. Promise only what is on your roadmap with a date.` });
  }
  notify(state, `Delivered "${offer.title}": ${converted} customer(s) started, ${refunded} refunded${lapsed ? `, ${lapsed} LOI(s) did not convert` : ''}.`, { type: refunded > converted ? 'warn' : 'good', app: 'crm' });
  return { converted, refunded, lapsed, missing: missing.length };
}

/** Tell customers the date moves. Early notice keeps most; after the date, fewer stay. One slip is forgiven, not a habit. */
export function extendOffer(state, offerId, newStartDay) {
  const offer = offerById(state, offerId);
  if (!offer || offer.status !== 'open') throw new Error('That offer is not open.');
  if (newStartDay <= offer.startDay) throw new Error('Pick a later date.');
  if (newStartDay > offer.originalStartDay + 60) throw new Error('Past 60 days late nobody believes the new date.');
  const late = state.day > offer.startDay;
  offer.extensions++;
  const stay = clamp((late ? 0.7 : 0.92) * Math.pow(0.85, offer.extensions - 1), 0.3, 0.95);
  let left = 0, fees = 0;
  for (const ask of moneyAsks(state, offerId)) if (!chance(state, stay)) { fees += refundAsk(state, ask, 'requested_by_customer'); left++; }
  offer.startDay = newStartDay;
  offer.lateNotified = false;
  if (late || offer.extensions > 1) logMistake(state, { functionId: 'customer_discovery', id: 'slipped_delivery_date', label: late ? 'Told pre-order customers about a delay after the date' : 'Moved a pre-sale date twice', app: 'crm', charge: true, key: `slip:${offer.id}:${offer.extensions}`, cost: { hours: 0.5, reputation: 0.3, customers: left, usd: Math.round(fees * 100) / 100 }, detail: `${left} paying customer(s) took their money back. Tell people before the date, not after, and set the next date you can actually keep.` });
  notify(state, `Moved "${offer.title}" to a later date: ${left} refund(s).`, { type: left ? 'warn' : 'info', app: 'crm' });
  return { left, stay };
}

/** Daily: warn when the date is at risk, refund when the grace window ends. Called from the deals loop. */
export function presellDay(state) {
  const P = state.apps?.crm?.presell;
  if (!P) return;
  for (const o of P.offers) {
    if (o.status !== 'open') continue;
    const paying = moneyAsks(state, o.id);
    const committed = openAsks(state, o.id);
    const ready = hasProduct(state) && o.promises.every((p) => promiseStatus(state, p) === 'shipped');
    if (committed.length && !ready && state.day >= o.startDay - 7 && state.day < o.startDay) emitSalesEvent(state, 'offer_date_at_risk', { offerId: o.id, daysLeft: o.startDay - state.day }, `ofr:${o.id}:${o.startDay}`);
    if (state.day > o.startDay && !o.lateNotified && paying.length) {
      o.lateNotified = true;
      let n = 0;
      for (const a of paying) if (chance(state, PRESELL.lateRefundP)) { refundAsk(state, a, 'requested_by_customer'); n++; }
      notify(state, `"${o.title}" is past its start date. ${n} paying customer(s) asked for their money back. Deliver, or tell the rest the new date now.`, { type: 'bad', app: 'crm' });
    }
    if (state.day >= o.startDay + PRESELL.graceDays) {
      let fees = 0;
      const n = paying.length;
      for (const a of paying) fees += refundAsk(state, a, 'requested_by_customer');
      for (const a of committed) if (a.status === 'open') a.status = 'lapsed';
      o.status = 'cancelled';
      if (committed.length) {
        emitSalesEvent(state, 'offer_refunds_issued', { offerId: o.id, refunds: n }, `ofx:${o.id}`);
        logMistake(state, { functionId: 'customer_discovery', id: 'missed_delivery_date', label: 'Took pre-orders and did not deliver', app: 'crm', delayed: true, key: `missed:${o.id}`, charge: true, cost: { hours: 1, usd: Math.round(fees * 100) / 100, reputation: 1 + 0.5 * committed.length, customers: committed.length },
          detail: `"${o.title}" was due ${30} days ago. ${n} payment(s) refunded (Stripe keeps its processing fee), ${committed.length - n} LOI(s) lapsed, and those buyers will not be early adopters again. Do not take money for a date you cannot keep: pre-sell to learn, then build.` });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Mom Test read: do they ask for commitments and tell them apart from compliments? */
export function presellRead(state) {
  const P = state.apps?.crm?.presell;
  const asks = P?.asks ?? [];
  if (asks.length < 3) return { tier: 'unknown', evidence: [], coaching: ['Ask at least three prospects for a commitment (LOI, deposit or pre-order) to read this.'] };
  const labeled = asks.filter((a) => a.label != null);
  const correct = labeled.filter((a) => a.label === isCommitment(a)).length;
  const accuracy = labeled.length ? correct / labeled.length : 0.3;
  const commitAsks = asks.filter((a) => a.level !== 'verbal').length / asks.length;
  const inflated = P.stats.inflated;
  const score = clamp(0.5 * accuracy + 0.35 * commitAsks + 0.15 * (1 - clamp(inflated / Math.max(3, asks.length / 2), 0, 1)) - 0.1 * Math.min(2, state.mistakes?.filter((m) => m.id === 'missed_delivery_date' || m.id === 'overpromised_features').length ?? 0), 0, 1);
  const real = asks.filter(isCommitment).length;
  const coaching = [];
  if (commitAsks < 0.6) coaching.push('You mostly asked "would you want this?". Ask for something that costs them: a signed LOI, a refundable deposit or a pre-order.');
  if (inflated) coaching.push(`You counted ${inflated} compliment(s) as demand. "Sounds great, keep me posted" is politeness, not evidence.`);
  return { tier: tierFromScore(score), score: +score.toFixed(2), n: asks.length, evidence: [`${asks.length} asks, ${real} real commitment(s)`, `${labeled.length} answers labelled, ${Math.round(accuracy * 100)}% correctly`, `${Math.round(commitAsks * 100)}% of asks were for money or a signature`], coaching };
}
