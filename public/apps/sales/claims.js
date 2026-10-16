// What a buyer was told vs what is true, checked where the real world checks it (docs/research/verification/
// market-people.md §1.1-1.7). Claims made on live calls, in cold email and replies, in proposals and in the contract
// negotiation are RECORDED with the truth at that moment (core/integrity.js, audience 'customer', recipient = the
// buyer's company). Nothing is punished when it is said: buyers mostly take it at face value. It is caught later:
//   security review  (strict buyers ask for the SOC 2 report, pen test and evidence: false SOC 2 ~90-95%, a
//                     questionnaire alone ~25%), sales/engine.js + segment paperwork gate
//   pilot / PoC      (the product is used: 0.8 x gap x rigor), sales/engine.js pilotDay
//   procurement      (document checks on SOC 2 / certificates, ~100%; product truth is not checked here), sendContract
//   reference calls  (customer-count and website claims), sales/references.js
//   after signing    (delivered vs sold: usage shows it within 30-90 days, ~100%): service credits or a refund
//                     (asserted ~35% of the time under $20k ACV, ~70% over $100k), termination, an 'oversold' churn
//                     reason that raises the renewal hazard (core/churn.js), reputation with other buyers.
// Bridge letters (model.js offerBridgeLetter) are a promise with a date; the buyer comes back for the report.
// All odds are [design] values anchored on that research brief.

import { recordClaims, verify, penalize, capabilityClaims, extractClaims, isCapabilityMetric, isDocumentMetric, openLies, reputationMult, ensureIntegrity, CAPABILITY_LABEL, fmtClaim } from '../../core/integrity.js';
import { mrr, activeSubs, cancel, refund, subscriptionById } from '../../core/stripe.js';
import { post } from '../../core/bank.js';
import { notify } from '../../core/state.js';
import { rng, chance, clamp } from '../../core/util.js';
import { logMistake } from '../../core/operator.js';
import { hasProduct } from '../../core/market.js';
import { ensureCrm, loseDeal, addActivity, companyById, soc2ReportOnHand, dealById } from './model.js';
import { getSegment } from './segments.js';

export const CLAIMS = {
  // How rigorous each pilot type is as a test of the claims (research: rigor 0.3-1.0) [design].
  pocRigor: { paid_pilot: 1, design_partner: 0.7 },
  deliveredLagDays: [30, 90], // overselling shows as low activation in the first 30-90 days
  assertP: { small: 0.35, large: 0.7, smallAcv: 20000, largeAcv: 100000 }, // P(claim asserted | gap discovered)
  creditShare: [0.1, 0.5], // service credits / refund as a share of ACV, by severity [design]
  terminateP: [0.15, 0.6], // termination for cause / non-renewal, by severity [design]
  claimLift: 0.05, maxLiftClaims: 3, // a capability the buyer heard about lifts close odds a little (true or not) [design]
  bridge: { acceptStrict: 0.25, acceptMid: 0.55, noAuditMult: 0.3, noAuditPromiseDays: 120, graceDays: 21, extensionDays: 30, churnP: { strict: 0.5, mid: 0.3 } },
};

/** Claims about what the product does (observed by using it), as opposed to documents and controls. */
export function isProductMetric(m) { return /^(feature:|int:)/.test(String(m)) || m === 'uptime'; }

const truthMetrics = (state) => ({ mrr: state.stripe ? mrr(state) : 0, customers: state.stripe ? activeSubs(state).length : 0 });

/** Ground truth for capability claims right now: shipped features, SOC 2 report on hand, pen test, 90-day uptime. */
export function capabilityTruth(state) {
  const feats = (state.apps.product?.features ?? []).filter((f) => !f.system).map((f) => ({ text: `${f.title ?? ''} ${f.spec ?? ''} ${f.problem ?? ''} ${f.solution ?? ''}`, status: f.status, ai: Boolean(f.ai?.enabled) }));
  const rep = soc2ReportOnHand(state);
  const assets = state.apps.crm?.paperAssets ?? {};
  const actions = state.apps.legal?.compliance?.actions ?? {};
  const fresh = (d) => d != null && state.day - d <= 365;
  const down = (state.apps.insights?.incidents ?? []).filter((i) => i.day > state.day - 90).reduce((a, i) => a + (i.minutes ?? 0), 0);
  return {
    features: feats,
    soc2: { report: Boolean(rep), type2: rep?.type === 'type2' },
    pentest: fresh(actions.pentest) || fresh(assets.pen_test),
    iso27001: assets.iso27001 != null,
    hipaa: assets.hipaa_baa != null,
    uptime: hasProduct(state) ? 1 - down / (90 * 24 * 60) : undefined,
  };
}

/** Record what a buyer was told (free text from a call, email, proposal or negotiation). Returns the lies. */
export function recordSalesClaims(state, { companyId, text, channel = 'call', dealId = null }) {
  if (!companyId || !text) return [];
  const claims = [...extractClaims(text).filter((c) => c.metric === 'customers' || c.metric === 'mrr'), ...capabilityClaims(text, capabilityTruth(state))];
  if (!claims.length) return [];
  const lies = recordClaims(state, { audience: 'customer', recipientId: companyId, channel, claims, truth: truthMetrics(state) });
  if (dealId) for (const c of ensureIntegrity(state).claims.slice(-claims.length)) c.dealId = dealId;
  return lies;
}

/** Claims this buyer heard (true or not) about capabilities: a little lift on the close odds (overclaiming "works"). */
export function claimsWinMult(state, deal) {
  const n = new Set(ensureIntegrity(state).claims.filter((c) => c.audience === 'customer' && c.recipientId === deal.companyId && isCapabilityMetric(c.metric) && c.claimed && c.status !== 'withdrawn').map((c) => c.metric)).size;
  return 1 + CLAIMS.claimLift * Math.min(CLAIMS.maxLiftClaims, n);
}

/** Buyers talk (within a vertical more than across): a caught lie lowers every new buyer's odds a little. */
export const buyerTrustMult = (state) => Math.sqrt(reputationMult(state, 'customer'));

const what = (cs) => cs.map((c) => `${CAPABILITY_LABEL[c.metric] ?? c.metric.replace(/^control:/, '')} (${typeof c.claimed === 'boolean' ? 'claimed, not true' : `${fmtClaim(c.metric, c.claimed)} vs real ${fmtClaim(c.metric, c.truth)}`})`).join('; ');

function caughtAtDeal(state, deal, caught, { stage, reason, id, label, coach, hours = 0 }) {
  const co = companyById(state, deal.companyId);
  penalize(state, caught, { audience: 'customer', functionId: 'deal_management', id, label, hours, app: 'crm', detail: `${co?.name ?? 'The buyer'} (${stage}).`, lesson: coach });
  addActivity(state, { type: 'note', text: `${stage}: ${what(caught)}`, dealId: deal.id, companyId: deal.companyId });
  loseDeal(state, deal, reason);
  // The questionnaire answers behind it are settled: the later "found out" roll in Legal does not fire twice.
  for (const d of state.apps.legal?.compliance?.detections ?? []) if (d.dealId === deal.id && !d.status) d.status = 'caught_at_review';
  return 'lost';
}

const strictBuyer = (deal) => ['regulated', 'health', 'public'].includes(getSegment(deal.segmentId)?.group) || deal.segmentId === 'enterprise' || (deal.amount ?? 0) >= 50000;

/**
 * Security review reads the security and compliance claims this buyer received (calls, emails, questionnaire answers).
 * reportShared: they have your SOC 2 report in hand (Type I vs Type II, scope and exceptions are visible).
 * Strict teams ask for the report / pen test / evidence; lighter reviews only read the answers. Returns 'lost' | null.
 */
export function securityClaimsReview(state, deal, { reportShared = false } = {}) {
  const strict = strictBuyer(deal);
  const r = verify(state, {
    audience: 'customer', recipientId: deal.companyId, filter: (c) => (isDocumentMetric(c.metric) || c.metric === 'feature:sso') && !nowTrue(state, c), // fixed in time is not a lie any more
    checkFor: (c) => (reportShared && /^soc2/.test(c.metric) ? 'document' : COMPLIANCE_DOC(c.metric) ? (strict ? 'security_evidence' : 'questionnaire') : 'questionnaire'),
  });
  if (!r.caught.length) return null;
  return caughtAtDeal(state, deal, r.caught, {
    stage: strict ? 'Security review asked for the report and evidence' : 'Security review',
    reason: 'Security review: answers contradicted by the evidence they asked for', id: 'security_claim_caught', label: 'Security review caught a false security claim',
    coach: 'A stellar operator answers "in progress: auditor X, window ending on date Y", shares a bridge letter and compensating controls, and keeps a reviewed answer library. An honest "not yet" costs a delay; a false yes costs the deal and the buyer\'s security team remembers.',
  });
}
const COMPLIANCE_DOC = (m) => ['soc2', 'soc2_type2', 'iso27001', 'hipaa', 'pentest', 'soc2_audit'].includes(m);

/** Pilot / PoC: users run the product against what they were told. Returns 'lost' | null. */
export function pilotClaimsCheck(state, deal) {
  const rigor = CLAIMS.pocRigor[deal.pilot?.type] ?? 0.8;
  const r = verify(state, { audience: 'customer', recipientId: deal.companyId, check: 'poc', pMult: rigor, filter: (c) => isProductMetric(c.metric) });
  if (!r.caught.length) return null;
  return caughtAtDeal(state, deal, r.caught, {
    stage: 'The pilot tested what you sold', reason: 'Pilot showed the product does not do what was promised', id: 'pilot_exposed_overclaim', label: 'Pilot exposed features that were sold but not built',
    hours: Math.round(20 + 20 * rigor), // the pilot's hand-holding hours went into a deal that could not close [design 20-80 h]
    coach: 'Write the success criteria from what is shipped, list the limitations at kickoff, and label roadmap items as roadmap. A pilot is the strongest check there is: the gap is observed directly.',
  });
}

/** Procurement / legal: certificate and report checks (binary, ~100%), not product truth. Returns 'lost' | null. */
export function procurementClaimsCheck(state, deal) {
  const card = Boolean(deal.proc?.cardPay);
  if (card || (state.company.model !== 'ent' && (deal.amount ?? 0) < 15000)) return null; // card-pay SMB purchases have no procurement desk
  const r = verify(state, { audience: 'customer', recipientId: deal.companyId, check: 'document', filter: (c) => COMPLIANCE_DOC(c.metric) && !nowTrue(state, c) });
  if (!r.caught.length) return null;
  return caughtAtDeal(state, deal, r.caught, {
    stage: 'Procurement asked for the documents', reason: 'Procurement: a certificate or report you claimed does not exist', id: 'procurement_document_missing', label: 'Procurement asked for a report you said you had',
    coach: 'Procurement checks documents, not stories: a SOC 2 status letter with auditor and dates passes; a claimed report that cannot be produced kills the deal.',
  });
}

// ---- After signing: delivered vs sold ----

/** Closed won: the open capability claims this buyer relied on are now a sold-vs-delivered ledger, checked by usage. */
export function afterSigned(state, deal, sub) {
  const open = openLies(state, { audience: 'customer', recipientId: deal.companyId }).filter((c) => isProductMetric(c.metric));
  if (!open.length || !sub) return null;
  const crm = ensureCrm(state);
  const [a, b] = CLAIMS.deliveredLagDays;
  const chk = { id: `svd_${crm.soldChecks?.length ?? 0}_${deal.id}`, dealId: deal.id, subId: sub.id, companyId: deal.companyId, acv: deal.amount ?? 0, day: state.day + a + Math.floor(rng(state) * (b - a)), status: 'open' };
  (crm.soldChecks ??= []).push(chk);
  return chk;
}

function deliveredCheck(state, chk) {
  const sub = subscriptionById(state, chk.subId);
  // Survivors stay open until real use: features shipped since the sale close the gap (no harm, no foul).
  const r = verify(state, { audience: 'customer', recipientId: chk.companyId, check: 'delivered', final: true, filter: (c) => isProductMetric(c.metric) && !nowTrue(state, c) });
  for (const c of openLies(state, { audience: 'customer', recipientId: chk.companyId })) if (isProductMetric(c.metric) && nowTrue(state, c)) c.status = 'delivered_late';
  chk.status = r.caught.length ? 'gap' : 'ok';
  if (!r.caught.length || !sub || sub.status === 'canceled') return;
  const sev = clamp(r.caught.reduce((a, c) => a + Math.min(1, c.gap), 0) / 2, 0.25, 1);
  sub.soldGap = Math.max(sub.soldGap ?? 0, +sev.toFixed(2)); // core/churn.js: 'oversold' reason + renewal hazard
  const A = CLAIMS.assertP;
  const pAssert = chk.acv <= A.smallAcv ? A.small : chk.acv >= A.largeAcv ? A.large : A.small + (A.large - A.small) * (chk.acv - A.smallAcv) / (A.largeAcv - A.smallAcv);
  let usd = 0;
  if (chance(state, pAssert)) usd = creditOrRefund(state, sub, Math.round(chk.acv * (CLAIMS.creditShare[0] + (CLAIMS.creditShare[1] - CLAIMS.creditShare[0]) * sev)));
  const terminate = chance(state, CLAIMS.terminateP[0] + (CLAIMS.terminateP[1] - CLAIMS.terminateP[0]) * sev);
  if (terminate) cancel(state, sub.id, { atPeriodEnd: sub.interval !== 'year' || sev < 0.75, reason: 'oversold' });
  const acct = state.apps.success?.accounts?.[sub.id];
  if (acct) acct.drift = (acct.drift ?? 0) - 0.1 * sev;
  const co = companyById(state, chk.companyId);
  chk.result = { sev, usd, terminate };
  penalize(state, r.caught, {
    audience: 'customer', functionId: 'deal_management', id: 'oversold_delivered_gap', label: 'Customer found the product does not do what was sold', usd, customers: terminate ? 1 : 0, app: 'crm',
    detail: `${co?.name ?? 'A customer'} went live and the product did not do what the sales conversation said: ${what(r.caught)}. ${usd ? `They asserted the warranty and got $${usd.toLocaleString('en-US')} in credits/refund. ` : ''}${terminate ? 'They are terminating. ' : 'The account is now at risk at renewal.'}`,
    lesson: 'A stellar operator sells what is shipped, labels roadmap items as non-binding and writes a success plan from real capabilities.',
  });
  notify(state, `${co?.name ?? 'A customer'}: "this is not what we were sold" (${what(r.caught)}).${usd ? ` $${usd.toLocaleString('en-US')} credited.` : ''}`, { type: 'bad', app: 'crm' });
}

function nowTrue(state, c) {
  const t = capabilityTruth(state);
  if (c.metric === 'soc2') return t.soc2.report;
  if (c.metric === 'soc2_type2') return t.soc2.type2;
  if (c.metric === 'soc2_audit') return t.soc2.report || /_in_progress$/.test(String(state.apps.legal?.soc2 ?? ''));
  if (['pentest', 'iso27001', 'hipaa'].includes(c.metric)) return Boolean(t[c.metric]);
  if (/^control:/.test(c.metric)) return false; // controls are re-checked by the questionnaire, not here
  if (c.metric === 'uptime') return Number.isFinite(t.uptime) && t.uptime >= c.claimed - 0.0005;
  const again = capabilityClaims(c.text || CAPABILITY_LABEL[c.metric] || '', t).find((x) => x.metric === c.metric);
  return Boolean(again?.truth);
}

function creditOrRefund(state, sub, usd) {
  if (!(usd > 0)) return 0;
  let left = usd;
  const ch = [...(state.stripe?.charges ?? [])].reverse().find((x) => x.subId === sub.id && x.status === 'succeeded');
  if (ch) {
    const can = Math.min(left, Math.round((ch.amount - (ch.amountRefunded ?? 0)) * 100) / 100);
    if (can >= 1) { refund(state, ch.id, { amount: can, reason: 'requested_by_customer' }); left -= can; }
  }
  if (left >= 1) post(state, { amount: -Math.round(left), counterparty: 'Customer credit', description: 'Service credits: product did not match what was sold', category: 'other', method: 'ach' });
  return usd;
}

// ---- Bridge letters: a promise with a date ----

/** Record the bridge letter (an "audit underway" claim) and schedule the buyer's follow-up for the report. */
export function recordBridgeLetter(state, deal, item, { accepted }) {
  const L = state.apps.legal ?? {};
  const underway = /_in_progress$/.test(String(L.soc2 ?? ''));
  recordClaims(state, { audience: 'customer', recipientId: deal.companyId, channel: 'bridge_letter', claims: [{ metric: 'soc2_audit', claimed: true, truth: underway || Boolean(soc2ReportOnHand(state)), text: 'SOC 2 bridge letter' }] });
  if (!accepted) return null;
  const promised = underway && L.soc2Plan?.readyDay != null ? L.soc2Plan.readyDay + 14 : state.day + CLAIMS.bridge.noAuditPromiseDays;
  const f = { id: `brg_${deal.id}_${item.id}`, dealId: deal.id, companyId: deal.companyId, itemId: item.id, promisedDay: promised, dueDay: promised + CLAIMS.bridge.graceDays, strict: strictBuyer(deal), underway, status: 'open', extended: false };
  (ensureCrm(state).bridgeFollowups ??= []).push(f);
  item.bridge = { promisedDay: promised, underway };
  return f;
}

function bridgeDay(state, f) {
  if (soc2ReportOnHand(state)) { f.status = 'met'; return; }
  const L = state.apps.legal ?? {};
  const underway = /_in_progress$/.test(String(L.soc2 ?? ''));
  const deal = dealById(state, f.dealId);
  const co = companyById(state, f.companyId);
  if (underway && !f.extended) { // the audit is real but late: buyers usually grant one extension [design]
    f.extended = true; f.dueDay = state.day + CLAIMS.bridge.extensionDays;
    notify(state, `${co?.name ?? 'A buyer'} asked for the SOC 2 report your bridge letter promised. You got one ${CLAIMS.bridge.extensionDays}-day extension.`, { type: 'warn', app: 'crm' });
    return;
  }
  f.status = 'missed';
  const caught = verify(state, { audience: 'customer', recipientId: f.companyId, check: 'document', final: true, filter: (c) => c.metric === 'soc2_audit' }).caught;
  if (caught.length) penalize(state, caught, { audience: 'customer', functionId: 'legal_hygiene', id: 'bridge_letter_no_audit', label: 'Bridge letter with no audit behind it', app: 'crm', detail: `${co?.name ?? 'The buyer'} accepted a bridge letter for an audit that had not started.` });
  if (deal && !['won', 'lost'].includes(deal.stage)) { loseDeal(state, deal, 'SOC 2 report not delivered by the date in your bridge letter'); return; }
  const sub = deal?.subscriptionId ? subscriptionById(state, deal.subscriptionId) : null;
  const p = f.strict ? CLAIMS.bridge.churnP.strict : CLAIMS.bridge.churnP.mid;
  const out = sub && sub.status !== 'canceled' && chance(state, p);
  if (out) cancel(state, sub.id, { atPeriodEnd: true, reason: 'security_or_compliance' });
  logMistake(state, { functionId: 'legal_hygiene', id: 'bridge_letter_lapsed', label: 'Bridge letter promise lapsed', app: 'crm', delayed: true, cost: { customers: out ? 1 : 0, reputation: 1 }, detail: `${co?.name ?? 'A customer'} accepted a SOC 2 bridge letter and asked for the report by ${f.promisedDay}. ${f.underway ? 'The audit slipped past the extension.' : 'No audit was ever started.'} ${out ? 'Their security team escalated and they will not renew.' : 'Their security team escalated; the account is flagged in their vendor-risk system.'}` });
  notify(state, `${co?.name ?? 'A customer'}: the SOC 2 report promised in your bridge letter never came.${out ? ' They will not renew.' : ''}`, { type: 'bad', app: 'crm' });
}

/** Daily: delivered-vs-sold checks and bridge-letter follow-ups. */
export function claimsDay(state) {
  const crm = state.apps.crm;
  if (!crm) return;
  for (const chk of crm.soldChecks ?? []) if (chk.status === 'open' && state.day >= chk.day) deliveredCheck(state, chk);
  for (const f of crm.bridgeFollowups ?? []) if (f.status === 'open' && state.day >= f.dueDay) bridgeDay(state, f);
  if ((crm.soldChecks?.length ?? 0) > 200) crm.soldChecks = crm.soldChecks.filter((x) => x.status === 'open' || state.day - x.day < 365);
}
