// Ticket TYPES for the Helpdesk (docs/research/support/s1-s4). Each type declares: how often it arrives by model,
// what the customer writes, the actions and checks a player can take, which checks a stellar operator always does,
// a pure `decide` (how right the action is given the hidden truth) and `apply` (the real consequences, routed to
// core/stripe.js, Product's tracker, Legal's DSR list and Insights incidents).
//
// Frequencies are [design]: the research notes give no sourced share-of-tickets, only ranges, so shares below are
// mid-range game estimates (`share` = share of all tickets, `rate` = cases per 100 active customers per month).
// Consequence sizes are [design] unless a comment names a source.

import { rng, chance, pick, uid, round2, money, clamp } from '../../core/util.js';
import { ensureStripe, monthlyAmount, refund, cancel, changePrice, respondToDispute } from '../../core/stripe.js';
import { pauseSub } from '../../core/churn.js';
import { post } from '../../core/bank.js';
import { notify } from '../../core/state.js';
import { setModifier } from '../../core/market.js';
import { REVIEWS } from '../../data/world.js';
import { productSlice } from '../product/store.js';
import { issueKey, duplicateOf } from '../product/tracker.js';
import { raiseBreachTask } from '../insights/raise.js';
import {
  ensureFlows, custOf, subOf, isLiveSub, lastCharge, schedule, mistake, scheduleDispute, scheduleCancel, angryReview, maybePublic, fine,
  annual, nameOf, first,
} from './flow-lib.js';

const R = (s) => rng(s);
const has = (h, id) => (h.checks ?? []).includes(id);
const count = (h, ids) => ids.filter((i) => has(h, i)).length;
const A = (id, label) => [id, label];
const K = (id, label, minutes) => [id, label, minutes];
const wpick = (state, pairs) => { let r = R(state) * pairs.reduce((a, [, w]) => a + w, 0); for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; } return pairs.at(-1)[0]; };
const table = (a, t, dflt = 0.1) => (a in t ? t[a] : dflt);
const gone = (state, c) => !isLiveSub(subOf(state, c.subId));

// A real bug filed from a ticket lands in Product's triage inbox with the customer's words.
function fileBug(state, c, { title, severity = 'medium', hours = 4, security = false, source = 'support' }) {
  const slice = productSlice(state);
  const bug = { id: uid('bug'), title, hours, progress: 0, severity, foundDay: state.day, fixedDay: null, triage: true, security, source, reports: 1, linkedCases: [c.id] };
  slice.bugs.push(bug);
  issueKey(slice, bug);
  return bug;
}
const bugById = (state, id) => productSlice(state).bugs.find((b) => b.id === id);

// Card details or payment secrets in an email thread.
const VIRAL_TOPICS = new Set(['charge', 'data', 'lockout', 'cancel', 'security']);

export const TYPES = {
  // ---------------------------------------------------------------- BILLING
  invoice_vat: {
    label: 'Invoice, VAT or PO request', family: 'billing', tag: 'billing/invoice', cat: 'billing', priority: 'p3', minutes: 10, expire: 7,
    share: { b2c: 0.01, smb: 0.04, ent: 0.06 }, // S1 flow 1: 3-6% of tickets, mostly finance teams [design]
    ai: { level: 'assist', wrongP: (st, c) => (c.facts.need === 'none' ? 0.03 : 0.3), note: 'Safe for resending a receipt. Not for editing legal names, VAT IDs or tax treatment.' },
    actions: [A('portal', 'Send the billing-portal link'), A('reissue', 'Re-issue a corrected invoice'), A('mor_explain', 'Explain that the merchant of record issues it'), A('receipt', 'Send the card receipt as the invoice'), A('cannot', 'Say we cannot do VAT invoices')],
    checks: [K('verify_tax_id', 'Validate the VAT ID (VIES) and country', 4), K('confirm_entity', 'Confirm the legal entity name and address', 3), K('set_customer_record', 'Fix it on the customer record so the next invoice is right', 3), K('add_po_field', 'Add the PO number as an invoice field', 2)],
    required: (c) => ({ none: [], vat_id: ['verify_tax_id', 'set_customer_record'], legal_name: ['confirm_entity', 'set_customer_record'], po: ['add_po_field'] })[c.facts.need],
    gen: (st, sub) => ({ need: wpick(st, [['none', 0.35], ['vat_id', 0.3], ['legal_name', 0.2], ['po', 0.15]]), eu: chance(st, custOf(st, sub.customerId)?.country === 'INTL' ? 0.6 : 0.05), mor: Boolean(ensureStripe(st).settings.merchantOfRecord) }),
    text: (st, c) => {
      const f = c.facts, n = first(c.name);
      const body = { none: `Hi, can you send me the invoice for last month's payment? Our accountant needs it for the books. ${n}`, vat_id: `Hi, the invoice shows no VAT number for ${c.company ?? 'our company'}. We need it corrected with our VAT ID to reclaim the VAT. ${n}`, legal_name: `The invoice is made out to my personal name. Please re-issue it to ${c.company ?? 'our company'} with the company address. ${n}`, po: `Our AP team will not pay without our PO number on the invoice. Can you add PO and send the W-9? ${n}` }[f.need];
      return { subject: f.need === 'none' ? 'Invoice copy' : 'Invoice needs correcting', body };
    },
    best: (c) => (c.facts.mor && c.facts.need !== 'none' ? 'mor_explain' : c.facts.need === 'none' ? 'portal' : 'reissue'),
    decide: (st, c, h) => {
      const f = c.facts, a = h.action, ok = TYPES.invoice_vat.best(c);
      let d = a === ok ? 1 : table(a, { portal: f.need === 'none' ? 1 : 0.45, mor_explain: 0.3, reissue: f.mor ? 0.1 : f.need === 'none' ? 0.8 : 1, receipt: 0.2, cannot: 0.05 });
      return { d, effect: d < 0.3 ? 'bad' : d < 0.6 ? 'wrong_doc' : 'ok' };
    },
    apply: (st, c, h, r) => {
      const f = c.facts;
      if (r.effect === 'bad') {
        const p = { ent: 0.1, smb: 0.06, b2c: 0.02 }[st.company.model];
        scheduleCancel(st, c, p, 'billing_friction', 'vat_invoice_wrong', `${nameOf(c)} could not get a valid invoice; their AP team flagged the vendor and they cancelled at renewal.`, 30);
        if (f.eu && (f.need === 'vat_id' || f.need === 'legal_name')) schedule(st, 45, 'fine', { usd: 150 + Math.round(R(st) * 250), desc: 'Accountant: correct the VAT filing after a wrong invoice', category: 'accounting', trap: 'vat_invoice_wrong', text: `A wrong VAT invoice to ${nameOf(c)} surfaced at your next filing: accountant time to correct it.`, caseId: c.id });
      }
      if (r.effect === 'wrong_doc' || r.effect === 'bad') schedule(st, 3, 'reopen', { caseId: c.id });
    },
    lapse: (st, c) => { if (c.facts.need !== 'none') scheduleCancel(st, c, st.company.model === 'ent' ? 0.08 : 0.04, 'billing_friction', 'vat_invoice_wrong', `${nameOf(c)} never got the corrected invoice their finance team needed.`, 30); },
    coach: (c) => (c.facts.need === 'none' ? 'Send the portal link so they can self-serve next time.' : `Validate the ${c.facts.need === 'po' ? 'PO requirement' : 'VAT ID / entity'}, fix the customer record, re-issue once with the change explained${c.facts.mor ? ', or say plainly that the merchant of record issues the invoice' : ''}.`),
  },

  refund_request: {
    label: 'Refund request', family: 'billing', tag: 'billing/refund', cat: 'billing', priority: 'p2', minutes: 8, expire: 5,
    share: { b2c: 0.05, smb: 0.025, ent: 0.01 }, // S1 flow 2: 2-5% of tickets [design]
    ai: { level: 'assist', wrongP: (st, c) => 0.05 + 0.3 * (1 - (st.apps.support?.ai?.procedures?.find((p) => p.intent === 'refund')?.quality ?? 0)) * (c.facts.reason === 'abuse' || c.facts.channel !== 'web' || !c.facts.inWindow ? 1 : 0.3), note: 'Good for policy questions and store-refund routing. Exceptions and goodwill need a human.' },
    actions: [A('refund_full', 'Refund in full and end the plan'), A('refund_partial', 'Partial (goodwill) refund'), A('store_steps', 'Send the Apple/Google refund steps and cancel the renewal'), A('decline_alt', 'Decline per policy and offer a downgrade or pause'), A('decline_flat', 'Decline per policy')],
    checks: [K('id_channel', 'Identify the purchase channel (web, App Store, Google Play)', 2), K('check_window', 'Check the refund window and the cause', 2), K('reason_code', 'Write the refund reason code on the record', 1), K('offer_alt', 'Offer the next-best option', 2)],
    required: (c) => (c.facts.channel === 'web' ? ['id_channel', 'check_window', 'reason_code'] : ['id_channel', 'reason_code']),
    gen: (st, sub, c) => {
      const ch = lastCharge(st, sub.customerId);
      if (!ch || st.day - ch.day > 75) return null;
      const channel = st.company.model === 'b2c' && chance(st, 0.4) ? (chance(st, 0.6) ? 'apple' : 'google') : 'web'; // [design] store share of B2C subscriptions
      const habit = ensureFlows(st).refundHabit ?? 0;
      const reason = wpick(st, [['changed_mind', 0.4], ['forgot', 0.2], ['duplicate', 0.08], ['outage_bug', 0.12], ['abuse', 0.05 + 0.02 * habit], ['other', 0.1]]);
      const days = st.day - ch.day;
      return { channel, chargeId: ch.id, amount: ch.amount, daysSince: days, reason, inWindow: days <= ensureFlows(st).ops.refundWindowDays };
    },
    text: (st, c) => {
      const f = c.facts, n = first(c.name);
      const why = { changed_mind: "it isn't what I expected", forgot: 'I forgot to cancel before it renewed', duplicate: 'I was charged twice', outage_bug: 'it was down for most of the week and I could not use it', abuse: 'refund it, I used it for the month but I want my money back, again', other: 'I do not need it any more' }[f.reason];
      return { subject: 'Refund please', body: `Hi, I would like a refund of ${money(f.amount)}${f.channel === 'web' ? '' : ` (I subscribed through the ${f.channel === 'apple' ? 'App Store' : 'Google Play'})`}. ${why[0].toUpperCase() + why.slice(1)}. It was charged ${f.daysSince} day(s) ago. ${n}` };
    },
    best: (c) => { const f = c.facts; if (f.channel !== 'web') return 'store_steps'; if (f.reason === 'abuse') return 'decline_flat'; if (f.inWindow) return 'refund_full'; return ['duplicate', 'outage_bug'].includes(f.reason) ? 'refund_partial' : 'decline_alt'; },
    decide: (st, c, h) => {
      const f = c.facts, a = h.action, valid = ['duplicate', 'outage_bug'].includes(f.reason);
      let d, effect = 'ok';
      if (f.channel !== 'web') { d = table(a, { store_steps: 1, decline_alt: 0.5, decline_flat: 0.25, refund_full: 0, refund_partial: 0 }); if (a.startsWith('refund')) effect = 'store_promise'; }
      else if (f.reason === 'abuse') { d = table(a, { decline_flat: 1, decline_alt: 1, refund_partial: 0.25, refund_full: 0.1 }); if (a.startsWith('refund')) effect = 'leak'; }
      else if (f.inWindow) { d = table(a, { refund_full: 1, refund_partial: 0.75, decline_alt: 0.15, decline_flat: 0.05, store_steps: 0.1 }); if (a.startsWith('decline')) effect = 'denied'; }
      else if (valid) { d = table(a, { refund_partial: 1, refund_full: 0.85, decline_alt: 0.4, decline_flat: 0.1, store_steps: 0.1 }); if (a.startsWith('decline')) effect = 'denied'; }
      else { d = table(a, { decline_alt: 1, decline_flat: 0.65, refund_partial: 0.4, refund_full: 0.2, store_steps: 0.1 }); if (a.startsWith('refund')) effect = 'leak'; }
      return { d, effect };
    },
    apply: (st, c, h, r) => {
      const f = c.facts, sub = subOf(st, c.subId);
      if (f.channel === 'web' && ['refund_full', 'refund_partial'].includes(h.action)) {
        const amt = h.action === 'refund_full' ? null : round2(f.amount * 0.5);
        try { refund(st, f.chargeId, { amount: amt }); } catch { /* already refunded */ }
        if (sub) { if (h.action === 'refund_full') cancel(st, sub.id, { atPeriodEnd: false, reason: 'refund_requested' }); else cancel(st, sub.id, { atPeriodEnd: true, reason: 'refund_requested' }); }
      }
      if (h.action === 'store_steps' && sub) cancel(st, sub.id, { atPeriodEnd: true, reason: 'customer_request' });
      const fl = ensureFlows(st);
      if (r.effect === 'leak') {
        fl.refundHabit = Math.min(5, (fl.refundHabit ?? 0) + 1);
        mistake(st, c, 'refund_leak', `Refunded ${money(f.amount)} to ${nameOf(c)} without checking the cause or window (${f.reason.replace('_', ' ')}, day ${f.daysSince}). Customers learn to ask: refund requests rise.`, { estCost: f.amount * (h.action === 'refund_full' ? 1 : 0.5) });
      } else if (r.effect === 'store_promise') {
        scheduleDispute(st, c, 0.45, 'refund_denied');
        maybePublic(st, c, 0.3, 'charge');
        mistake(st, c, 'refund_unkept_promise', `Promised ${nameOf(c)} a refund for a ${f.channel === 'apple' ? 'App Store' : 'Google Play'} purchase that only the store can refund. It never arrives, and they dispute the charge or write a review.`, { estCost: f.amount + 15, delayed: true });
      } else if (r.effect === 'denied') {
        scheduleDispute(st, c, 0.35, 'refund_denied');
        if (chance(st, 0.2)) angryReview(st);
        mistake(st, c, 'refund_wrongly_denied', `Denied ${nameOf(c)} a refund your own policy owed (${f.inWindow ? 'inside the window' : f.reason.replace('_', ' ')}). Denied refunds become $15 chargebacks plus the charge.`, { estCost: f.amount + 15, delayed: true });
      }
    },
    lapse: (st, c) => { scheduleDispute(st, c, 0.4, 'unanswered'); angryReview(st, chance(st, 0.2) ? 1 : 0); },
    coach: (c) => (c.facts.channel !== 'web' ? 'Know the channel first: store purchases are refunded only by Apple or Google. Send the steps, cancel the renewal, promise nothing.' : c.facts.reason === 'abuse' ? 'Serial refunder: apply the policy the same way every time.' : c.facts.inWindow ? 'Inside the window your policy owes the refund: do it, cancel the renewal, write the reason code.' : 'Outside the window, use the goodwill path only for real causes (duplicate, outage); otherwise decline per policy and offer a downgrade or pause.'),
  },

  charged_after_cancel: {
    label: 'Charged after cancelling', family: 'billing', tag: 'billing/cancel-failure', cat: 'billing', priority: 'p1', p1: true, minutes: 12, expire: 2,
    share: { b2c: 0.06, smb: 0.03, ent: 0.01 }, // S1 flow 3: 4-8% B2C, 2-4% SMB [design]
    ai: { level: 'assist', wrongP: (st, c) => (c.facts.cause === 'cancel_failed' ? 0.4 : 0.12), note: 'Good for checking cancel state and explaining where to cancel. Refund decisions and "was the cancel path broken" need logs and a human.' },
    actions: [A('escalate_refund', 'Refund, cancel, and file the cancel-path failure with Product'), A('refund_cancel', 'Refund the charge and cancel the renewal'), A('cancel_only', 'Cancel the renewal, no refund'), A('store_steps', 'Point them to the store subscription'), A('refuse_policy', 'Decline per policy'), A('blame', '"You must have forgotten"')],
    checks: [K('check_logs', 'Pull the subscription history and cancel timestamps', 4), K('reminder_history', 'Check the renewal reminder was sent', 2), K('store_check', 'Check for a store subscription', 2)],
    required: () => ['check_logs'],
    gen: (st, sub) => {
      const ch = lastCharge(st, sub.customerId);
      if (!ch || st.day - ch.day > 10) return null;
      const bugOpen = productSlice(st).bugs.some((b) => !b.fixedDay && /cancel|billing|renew/i.test(b.title));
      const cause = wpick(st, [['forgot', 0.5], ['trial_converted', 0.2], ['cancel_failed', 0.15 + (bugOpen ? 0.2 : 0)], ['store_dup', st.company.model === 'b2c' ? 0.15 : 0.02]]);
      return { cause, chargeId: ch.id, amount: ch.amount, daysSince: st.day - ch.day };
    },
    text: (st, c) => ({ subject: 'I cancelled and you charged me', body: `I cancelled my subscription ${c.facts.cause === 'cancel_failed' ? 'last week and have the confirmation screen' : 'a while ago, I think'} and you charged me ${money(c.facts.amount)} anyway. I want this refunded and the account closed. ${first(c.name)}` }),
    best: (c) => ({ cancel_failed: 'escalate_refund', forgot: 'refund_cancel', trial_converted: 'refund_cancel', store_dup: 'refund_cancel' })[c.facts.cause],
    decide: (st, c, h) => {
      const f = c.facts, a = h.action;
      const t = {
        cancel_failed: { escalate_refund: 1, refund_cancel: 0.85, cancel_only: 0.3, refuse_policy: 0, blame: 0, store_steps: 0 },
        forgot: { refund_cancel: f.daysSince <= 7 ? 1 : 0.8, escalate_refund: 0.55, cancel_only: 0.6, refuse_policy: 0.55, blame: 0.15, store_steps: 0.1 },
        trial_converted: { refund_cancel: 0.9, escalate_refund: 0.5, cancel_only: 0.6, refuse_policy: 0.5, blame: 0.1, store_steps: 0.1 },
        store_dup: { refund_cancel: 1, store_steps: 0.6, escalate_refund: 0.4, cancel_only: 0.4, refuse_policy: 0.3, blame: 0.05 },
      }[f.cause];
      let d = t[a] ?? 0.1;
      if (!has(h, 'check_logs') && ['refuse_policy', 'blame'].includes(a)) d *= 0.5; // refusing without looking at the logs
      const effect = d < 0.4 ? 'denied' : a === 'escalate_refund' && f.cause !== 'cancel_failed' ? 'false_bug' : 'ok';
      return { d, effect };
    },
    apply: (st, c, h, r) => {
      const f = c.facts, fl = ensureFlows(st), sub = subOf(st, c.subId);
      if (['refund_cancel', 'escalate_refund'].includes(h.action)) {
        try { refund(st, f.chargeId); } catch { /* ok */ }
        if (sub) cancel(st, sub.id, { atPeriodEnd: false, reason: 'refund_requested' });
      } else if (h.action === 'cancel_only' && sub) cancel(st, sub.id, { atPeriodEnd: true, reason: 'customer_request' });
      if (f.cause === 'cancel_failed') {
        fl.cancelFailures.push(st.day);
        const open = productSlice(st).bugs.find((b) => b.id === fl.cancelBugId && !b.fixedDay);
        if (h.action === 'escalate_refund' && !open) fl.cancelBugId = fileBug(st, c, { title: 'Cancellations are not applied at renewal: customers charged after cancelling', severity: 'high', hours: 6, source: 'support' }).id;
        else if (open) { open.reports = (open.reports ?? 1) + 1; (open.linkedCases ??= []).push(c.id); }
        const recent = fl.cancelFailures.filter((d) => st.day - d <= 60).length;
        const bug = fl.cancelBugId ? bugById(st, fl.cancelBugId) : null;
        if (recent >= 3 && (!bug || !bug.fixedDay) && !fl.agComplaint) {
          fl.agComplaint = st.day;
          schedule(st, 20 + Math.round(R(st) * 25), 'fine', { usd: 2000 + Math.round(R(st) * 3000), desc: 'State attorney general inquiry: charges after cancellation (ROSCA / auto-renewal law)', category: 'legal', trap: 'cancel_failure_unfixed', text: `${recent} customers were charged after cancelling in 60 days and the cancel path was never fixed: a consumer complaint to the attorney general. Auto-renewal law (ROSCA, California AB 2863) turns this from a support problem into a legal one.`, hours: 6, caseId: c.id });
        }
      }
      if (r.effect === 'false_bug') fileBug(st, c, { title: 'Investigate cancel failure for one customer (no repro; the customer had not cancelled)', hours: 2, severity: 'low' });
      if (r.effect === 'denied') {
        scheduleDispute(st, c, f.cause === 'cancel_failed' ? 0.6 : 0.35, 'charged_after_cancel');
        maybePublic(st, c, f.cause === 'cancel_failed' ? 0.25 : 0.1, 'cancel');
        if (chance(st, 0.25)) angryReview(st);
        mistake(st, c, 'refund_wrongly_denied', `${nameOf(c)} was charged ${money(f.amount)} after cancelling (${f.cause.replace('_', ' ')}) and got ${h.action === 'blame' ? '"you must have forgotten"' : 'a refusal'}${has(h, 'check_logs') ? '' : ' without anyone checking the logs'}. That is the complaint that becomes a chargeback and a post.`, { estCost: f.amount + 15, delayed: true, reputation: 0.5 });
      }
    },
    lapse: (st, c) => { scheduleDispute(st, c, 0.55, 'unanswered'); maybePublic(st, c, 0.2, 'cancel'); angryReview(st, chance(st, 0.3) ? 1 : 0); },
    coach: (c) => (c.facts.cause === 'cancel_failed' ? 'Check the logs, admit the cancel-path failure, refund without an argument, cancel in the same reply and file the failure with Product: more than two of these in 60 days is a legal problem, not a support problem.' : 'Check the logs and the reminder first; within a week of a renewal, refund and cancel in one reply. Refund before they dispute: it costs $15 less and counts for nothing against your ratio.'),
  },

  plan_change: {
    label: 'Plan change or cancel via support', family: 'billing', tag: 'billing/plan-change', cat: 'billing', priority: 'p3', minutes: 7, expire: 4,
    share: { b2c: 0.08, smb: 0.08, ent: 0.03 }, // S1 flow 5: 8-12% of SMB and B2C tickets [design]
    ai: { level: 'safe', wrongP: () => 0.05, note: 'Safe if it acts through an audited tool and cannot refund or waive fees without a rule.' },
    actions: [A('downgrade_renewal', 'Downgrade at the next renewal'), A('downgrade_now', 'Downgrade now with the proration credit'), A('switch_annual', 'Switch to annual with the discount'), A('pause', 'Pause the subscription'), A('save_then_cancel', 'Offer one save, then cancel at period end'), A('cancel_end', 'Cancel at period end'), A('cancel_now_refund', 'Cancel now with a prorated refund'), A('block', '"Call us to cancel" / ask them to wait'), A('hard_sell', 'Pitch discounts again and again')],
    checks: [K('confirm_account', 'Confirm the account, plan, billing date and discount', 1), K('state_rule', 'State the proration/effective-date rule in writing', 2), K('offer_once', 'Offer the save options once, in order', 2), K('log_reason', 'Log the cancel reason code', 1), K('confirm_access_end', 'Confirm the access end date and data retention', 1)],
    required: (c) => (c.facts.intent === 'cancel' ? ['confirm_account', 'offer_once', 'log_reason', 'confirm_access_end'] : ['confirm_account', 'state_rule']),
    gen: (st, sub) => ({ intent: wpick(st, [['downgrade', 0.35], ['cancel', 0.35], ['pause', 0.1], ['annual', 0.1], ['cancel_refund', 0.1]]), reason: wpick(st, [['price', 0.35], ['unused', 0.25], ['competitor', 0.1], ['missing_feature', 0.1], ['bug', 0.1], ['support', 0.1]]), saveable: chance(st, 0.4) }),
    text: (st, c) => ({ subject: { downgrade: 'Cheaper plan?', cancel: 'Cancel my account', pause: 'Can I pause?', annual: 'Annual billing?', cancel_refund: 'Cancel and refund the rest of the month' }[c.facts.intent], body: { downgrade: 'Hi, this plan is more than we need now. Is there a cheaper one and what happens to my billing?', cancel: `Please cancel my subscription. ${c.facts.reason === 'price' ? "It's gotten expensive for how little we use it." : c.facts.reason === 'unused' ? "We haven't been using it." : 'It is not working out.'}`, pause: "We're out of season for a couple of months. Can I pause instead of paying?", annual: 'If I pay annually, what is the discount and what do I pay today?', cancel_refund: 'Cancel it today and refund the unused part of this month please.' }[c.facts.intent] + ` ${first(c.name)}` }),
    best: (c) => ({ downgrade: 'downgrade_renewal', cancel: 'save_then_cancel', pause: 'pause', annual: 'switch_annual', cancel_refund: 'cancel_now_refund' })[c.facts.intent],
    decide: (st, c, h) => {
      const i = c.facts.intent, a = h.action;
      const t = {
        downgrade: { downgrade_renewal: 1, downgrade_now: 0.8, pause: 0.4, switch_annual: 0.1, save_then_cancel: 0.3, cancel_end: 0.2, cancel_now_refund: 0.2, block: 0, hard_sell: 0.1 },
        cancel: { save_then_cancel: 1, cancel_end: 0.9, pause: 0.7, downgrade_renewal: 0.6, downgrade_now: 0.5, cancel_now_refund: 0.55, switch_annual: 0.1, block: 0, hard_sell: 0.15 },
        pause: { pause: 1, save_then_cancel: 0.4, cancel_end: 0.4, downgrade_renewal: 0.4, block: 0, hard_sell: 0.1, downgrade_now: 0.3, switch_annual: 0.1, cancel_now_refund: 0.2 },
        annual: { switch_annual: 1, downgrade_renewal: 0.2, pause: 0.1, cancel_end: 0.1, save_then_cancel: 0.1, block: 0, hard_sell: 0.2, downgrade_now: 0.1, cancel_now_refund: 0.1 },
        cancel_refund: { cancel_now_refund: 1, cancel_end: 0.8, save_then_cancel: 0.7, pause: 0.3, downgrade_renewal: 0.2, block: 0, hard_sell: 0.1, downgrade_now: 0.2, switch_annual: 0.1 },
      }[i];
      return { d: t[a] ?? 0.1, effect: a === 'block' || a === 'hard_sell' ? 'dark_pattern' : 'ok' };
    },
    apply: (st, c, h, r) => {
      const f = c.facts, sub = subOf(st, c.subId), fl = ensureFlows(st);
      if (!isLiveSub(sub)) return;
      const cheaper = (st.plans ?? []).filter((p) => p.active !== false && p.price < sub.price).sort((a, b) => b.price - a.price)[0];
      if (h.action === 'downgrade_now' && cheaper) changePrice(st, sub.id, { price: cheaper.price });
      else if (h.action === 'downgrade_renewal' && cheaper) schedule(st, Math.max(0, (sub.currentPeriodEnd ?? st.day) - st.day), 'price', { subId: sub.id, price: cheaper.price });
      else if (h.action === 'pause') pauseSub(st, sub, f.reason);
      else if (h.action === 'cancel_end') cancel(st, sub.id, { atPeriodEnd: true, reason: 'voluntary' });
      else if (h.action === 'cancel_now_refund') { const ch = lastCharge(st, sub.customerId); if (ch && st.day - ch.day < 30) { const left = clamp(1 - (st.day - ch.day) / 30, 0, 1); try { refund(st, ch.id, { amount: round2(ch.amount * left) }); } catch { /* none */ } } cancel(st, sub.id, { atPeriodEnd: false, reason: 'voluntary' }); }
      else if (h.action === 'save_then_cancel') {
        const saved = chance(st, f.saveable && f.reason !== 'bug' ? (has(h, 'offer_once') ? 0.5 : 0.3) : 0.06);
        if (saved) fl.stats.saves = (fl.stats.saves ?? 0) + 1; else cancel(st, sub.id, { atPeriodEnd: true, reason: 'voluntary' });
      }
      if (r.effect === 'dark_pattern') {
        // Blocking a cancel or hammering with offers: the complaint becomes a chargeback (S1 flow 3/5; ROSCA, California AB 2863).
        cancel(st, sub.id, { atPeriodEnd: true, reason: 'felt_ignored' });
        scheduleDispute(st, c, h.action === 'block' ? 0.5 : 0.25, 'cancel_blocked');
        maybePublic(st, c, 0.25, 'cancel');
        mistake(st, c, 'cancel_blocked', `${nameOf(c)} asked to ${f.intent.replace('_', ' ')} and was ${h.action === 'block' ? 'told to call or wait' : 'pitched discounts repeatedly'}. A blocked cancellation turns into a dispute, a post and a regulator-shaped risk (ROSCA, California auto-renewal law).`, { estCost: monthlyAmount(sub) * 3 + 15, delayed: true, reputation: 0.3 });
      }
    },
    lapse: (st, c) => { scheduleDispute(st, c, 0.3, 'unanswered'); },
    coach: (c) => ({ downgrade: 'State the effective date, apply the downgrade at renewal to avoid a surprise proration, confirm in writing.', cancel: 'Offer the options once in order (downgrade, pause, annual), never block the cancel, cancel at period end by default and log the reason code.', pause: 'Pause it, confirm the resume date.', annual: 'State the amount charged today and the discount; get written agreement.', cancel_refund: 'Cancel now and refund the unused share per your stated rule.' })[c.facts.intent],
  },

  payment_failed: {
    label: 'Failed payment / card update', family: 'billing', tag: 'billing/payment-failed', cat: 'billing', priority: 'p2', minutes: 5, expire: 4,
    share: { b2c: 0.03, smb: 0.03, ent: 0.01 }, // S1 flow 6 [design]
    ai: { level: 'safe', wrongP: () => 0.03, note: 'Safe to send the secure update link. Must never collect card numbers in chat.' },
    actions: [A('send_link', 'Send the secure payment-method update link'), A('extend_grace', 'Update link and extend the retry by 3 days'), A('retry_now', 'Retry the charge now'), A('ask_card', 'Ask them to reply with the new card details')],
    checks: [K('check_dunning', 'Check the decline code and dunning state', 2)],
    required: () => ['check_dunning'],
    gen: (st, sub) => (sub.status === 'past_due' ? { cause: wpick(st, [['expired', 0.45], ['insufficient', 0.3], ['bank_block', 0.25]]) } : null),
    text: (st, c) => ({ subject: 'Payment failed email', body: `I got an email that my payment failed. I updated my card but it says it is still failing. Can you just fix it? ${first(c.name)}` }),
    best: () => 'send_link',
    decide: (st, c, h) => ({ d: table(h.action, { send_link: 1, extend_grace: 0.9, retry_now: c.facts.cause === 'bank_block' ? 0.6 : 0.4, ask_card: 0 }), effect: h.action === 'ask_card' ? 'card_by_email' : 'ok' }),
    apply: (st, c, h, r) => {
      const sub = subOf(st, c.subId);
      if (h.action === 'extend_grace' && sub?.retry) sub.retry.nextDay = Math.max(sub.retry.nextDay, st.day + 3);
      if (r.effect === 'card_by_email') {
        scheduleDispute(st, c, 0.08, 'fraud'); // card data in an email thread can leak
        mistake(st, c, 'card_by_email', `Asked ${nameOf(c)} to send card details in an email thread. Card data in a mailbox is a PCI problem: you now have to purge the thread and your processor can ask questions.`, { hours: 1, charge: true, estCost: 0 });
      }
    },
    lapse: (st, c) => { const sub = subOf(st, c.subId); if (isLiveSub(sub) && chance(st, 0.3)) scheduleCancel(st, c, 1, 'payment_failed', 'ticket_abandoned', `${nameOf(c)} could not get help updating a failing card and lapsed.`, 3); },
    coach: () => 'Check the decline code, send the secure update link (never ask for card numbers), and extend the retry if the card is being fixed.',
  },

  dispute: {
    label: 'Card dispute (chargeback)', family: 'billing', tag: 'billing/dispute', cat: 'billing', priority: 'p1', p1: true, minutes: 10, expire: 7,
    share: null, // created from Stripe disputes (core/stripe.js): see flows.js scanDisputes
    ai: { level: 'assist', wrongP: () => 0.3, note: 'Triage and evidence assembly can be assisted. Filing the response should be human-reviewed (legal-adjacent).' },
    actions: [A('contest', 'Contest with the evidence ticked below'), A('accept', 'Accept the dispute')],
    checks: [K('usage_log', 'Usage log showing the customer used the product', 6), K('cancel_terms', 'Cancellation policy and terms accepted at sign-up', 3), K('receipt_reminder', 'Receipt and renewal reminder email', 3), K('device_match', 'IP/device matching earlier undisputed payments (needs 2+ prior payments)', 4), K('customer_comm', 'Customer correspondence', 3), K('policy_screenshot', 'Screenshot of the checkout disclosure', 2)],
    required: (c) => (c.facts.cause === 'our_error' ? [] : ['usage_log', 'cancel_terms', 'receipt_reminder']),
    gen: null,
    text: (st, c) => ({ subject: `Dispute: ${money(c.facts.amount)}`, body: `${nameOf(c)} disputed a ${money(c.facts.amount)} charge with their bank (${c.facts.reason.replace('_', ' ')}). Respond before ${'the deadline'}; the cardholder wins by default if you do not. Why they did it is hidden: check the account before you decide whether to fight.` }),
    quality: (c, h) => { const w = { usage_log: 0.25, cancel_terms: 0.15, receipt_reminder: 0.15, device_match: c.facts.deviceAvailable ? 0.2 : 0, customer_comm: 0.15, policy_screenshot: 0.1 }; return clamp(Object.entries(w).reduce((a, [k, v]) => a + (has(h, k) ? v : 0), 0), 0, 1); },
    best: (c) => (c.facts.cause === 'our_error' ? 'accept' : 'contest'),
    decide: (st, c, h) => {
      const q = TYPES.dispute.quality(c, h), cause = c.facts.cause;
      if (cause === 'our_error') return { d: h.action === 'accept' ? 1 : 0.1, effect: h.action === 'accept' ? 'ok' : 'wrong_fight' };
      if (cause === 'fraud') return { d: h.action === 'accept' ? 0.6 : 0.5 + 0.4 * q, effect: 'ok' };
      return h.action === 'accept' ? { d: 0.35, effect: 'conceded' } : { d: clamp(0.5 + 0.6 * q, 0, 1), effect: 'ok' };
    },
    apply: (st, c, h, r) => {
      const d = ensureStripe(st).disputes.find((x) => x.id === c.facts.disputeId);
      if (!d || d.status !== 'needs_response') return;
      if (h.action === 'contest') respondToDispute(st, d.id, TYPES.dispute.quality(c, h));
      else { d.status = 'lost'; d.accepted = true; }
      d.casePlan = h.action;
      const waiting = h.action === 'contest';
      if (r.effect === 'wrong_fight') mistake(st, c, 'dispute_wrong_fight', `Contested a ${money(d.amount)} dispute on a charge that was your own error (${nameOf(c)}). The $15 counter fee is lost with the dispute, and the issuer sees a merchant arguing against the cardholder.`, { estCost: 15 });
      if (r.effect === 'conceded') mistake(st, c, 'dispute_conceded', `Accepted a ${money(d.amount)} dispute from ${nameOf(c)} who used the product. With a usage log and terms the evidence wins roughly a third to half the time (game estimate; vendor ranges 15-60%).`, { estCost: d.amount });
      return waiting ? 'waiting' : undefined;
    },
    lapse: () => {},
    coach: (c) => (c.facts.cause === 'our_error' ? 'The charge was your error: accept it. Better, refund before the dispute is filed so it never counts toward your ratio.' : 'Respond inside the window with the usage log, the cancel terms, the reminder email and (with 2+ prior undisputed payments) IP/device matches.'),
  },

  // ---------------------------------------------------------------- ACCOUNT AND SECURITY
  lockout_2fa: {
    label: 'Locked out (2FA / SSO / reset)', family: 'account', tag: 'account/access', cat: 'account', priority: 'p2', minutes: 8, expire: 3,
    share: { b2c: 0.05, smb: 0.05, ent: 0.04 }, // the identity-risky subset of the 15-30% login tickets (S2 flow 1) [design]
    ai: { level: 'assist', wrongP: (st, c) => (c.facts.fraud ? 0.3 : 0.06), note: 'May send the self-serve reset link. Must not disable 2FA or change email on the strength of a chat.' },
    actions: [A('reset_after_verify', 'Verify, then reset 2FA'), A('reset_now', 'Reset 2FA now'), A('ask_admin', 'Ask the workspace admin to approve'), A('self_serve', 'Send the self-serve recovery flow'), A('refuse', 'Refuse, no path forward')],
    checks: [K('email_on_file', 'Confirm the request came from the email on the account', 2), K('second_factor_or_admin', 'Second factor: recovery code, an admin approval or a billing detail only the user knows', 4), K('sso_idp', 'Check the SSO identity-provider config', 3), K('callback_owner', 'Confirm with the account owner on file', 5)],
    required: () => ['email_on_file', 'second_factor_or_admin'],
    gen: (st, sub) => ({ fraud: chance(st, 0.04), role: chance(st, 0.25) ? 'admin' : 'member', pressure: chance(st, 0.5) ? 'urgent' : 'none', vipPressure: false }),
    text: (st, c) => ({ subject: 'Lost my phone, cannot log in', body: c.facts.fraud ? `URGENT: I lost my phone and cannot get my 2FA code. I'm ${c.facts.role === 'admin' ? 'the admin' : 'locked out'} and we are a big customer. Disable 2FA on the account now, I have a client demo in 20 minutes. ${first(c.name)}` : `I got a new phone and lost the authenticator app. I can't log in and have no recovery codes. How do I get back in? ${first(c.name)}` }),
    best: (c) => (c.facts.fraud ? 'reset_after_verify' : 'reset_after_verify'),
    decide: (st, c, h) => {
      const f = c.facts, a = h.action, v = count(h, ['email_on_file', 'second_factor_or_admin', 'callback_owner']) + (has(h, 'sso_idp') ? 0.5 : 0);
      if (f.fraud) {
        if (a === 'reset_now') return { d: 0, effect: 'takeover' };
        if (a === 'reset_after_verify') return v >= 2 ? { d: 1, effect: 'blocked' } : { d: 0.05, effect: 'takeover' };
        return { d: table(a, { ask_admin: 1, self_serve: 0.9, refuse: 0.7 }), effect: 'blocked' };
      }
      if (a === 'reset_after_verify') return { d: v >= 2 ? 1 : 0.5, effect: 'ok' };
      return { d: table(a, { reset_now: 0.45, ask_admin: f.role === 'member' && st.company.model !== 'b2c' ? 1 : 0.6, self_serve: 0.8, refuse: 0.2 }), effect: a === 'reset_now' ? 'near_miss' : a === 'refuse' ? 'locked_out' : 'ok' };
    },
    apply: (st, c, h, r) => {
      const f = c.facts;
      if (r.effect === 'takeover') {
        ensureFlows(st).stats.takeovers++;
        const usd = 400 + Math.round(R(st) * 600);
        fine(st, usd, `Account takeover clean-up for ${c.company ?? c.name}`);
        scheduleDispute(st, c, 0.3, 'fraud');
        scheduleCancel(st, c, 0.4, 'felt_ignored', 'unverified_reset', `${nameOf(c)} had their account taken over through a 2FA reset on a chat message and cancelled.`, 7);
        if (f.role === 'admin') raiseBreachTask(st, { text: `An attacker took over an admin account at ${c.company ?? c.name} through a support 2FA reset.` });
        mistake(st, c, 'unverified_reset', `Reset 2FA for someone claiming to be ${nameOf(c)} with ${count(h, ['email_on_file', 'second_factor_or_admin', 'callback_owner'])} verification step(s). It was an attacker: ${f.role === 'admin' ? 'admin access and customer data exposed' : 'one account compromised'}. Pressure ("big customer, demo in 20 minutes") is the attack, and VIP status never bypasses verification (CrowdStrike reports a sharp rise in help-desk vishing).`, { estCost: usd + annual(st, c.subId) * 0.4, customers: 1, reputation: 1, hours: 3, charge: true });
      } else if (r.effect === 'blocked' && f.fraud) {
        ensureFlows(st).stats.takeoversBlocked++;
        notify(st, `You blocked an account-takeover attempt on ${nameOf(c)}'s account by verifying before the 2FA reset.`, { type: 'good', app: 'helpdesk' });
      } else if (r.effect === 'near_miss') mistake(st, c, 'unverified_reset', `Reset 2FA for ${nameOf(c)} on trust alone. This one was genuine; about 1 in 25 of these requests is an attacker, and the next one costs thousands (game estimate).`, { estCost: 0.04 * 3000 });
      else if (r.effect === 'locked_out') scheduleCancel(st, c, 0.25, 'felt_ignored', 'ticket_abandoned', `${nameOf(c)} was refused with no way back in and cancelled.`, 7);
    },
    lapse: (st, c) => { if (!c.facts.fraud) { scheduleCancel(st, c, 0.2, 'felt_ignored', 'ticket_abandoned', `${nameOf(c)} was locked out for days and cancelled.`, 3); maybePublic(st, c, 0.1, 'lockout'); } },
    coach: (c) => (c.facts.fraud ? 'This was an attacker. Urgency and "we are a big customer" are the attack. Ask for a factor only the real user has, confirm with the owner on file, and send them the self-serve recovery path.' : 'Confirm the email on file plus a second factor or an admin approval, then reset. Offer the recovery-code habit so it does not recur.'),
  },

  ownership_transfer: {
    label: 'Account ownership transfer / add me as admin', family: 'account', tag: 'account/ownership', cat: 'account', priority: 'p2', minutes: 20, expire: 5,
    rate: { b2c: 0.02, smb: 0.1, ent: 0.1 }, // S2 flow 2: a few per 1,000 accounts a year, more with 1,000+ accounts [design]
    ai: { level: 'never', wrongP: () => 0.35, note: 'May collect the request and list the documents needed. Must never approve a transfer or a new admin: a convincing story is the attack.' },
    actions: [A('transfer_now', 'Transfer ownership now'), A('verify_then_transfer', 'Run the checklist, then transfer'), A('hold_callback', 'Hold 48 h and confirm with the current owner'), A('refuse_path', 'Decline and explain what the owner must do'), A('refuse', 'Decline')],
    checks: [K('callback_owner', 'Confirm with the current owner at the email/number on file', 6), K('owner_only_question', 'Ask a question only the real owner can answer', 3), K('audit_log', 'Check the audit log: last logins and recent changes', 4), K('domain_match', 'New owner on a company domain, not a personal address', 2), K('billing_confirm', 'Confirm the billing-contact change with the old billing email', 3), K('hold_48h', 'Hold 48-72 h for high-value accounts', 1)],
    required: (c) => ['callback_owner', 'audit_log', ...(annual0(c) >= 1200 ? ['hold_48h'] : [])],
    gen: (st, sub) => ({ legit: !chance(st, 0.2), pressure: wpick(st, [['none', 0.4], ['urgent', 0.4], ['vip', 0.2]]), personalEmail: chance(st, 0.4) }), // fraud share 20% [design]
    text: (st, c) => {
      const f = c.facts, n = first(c.name);
      const story = f.legit ? `Our previous admin left the company last month and I am taking over billing and the account. Can you make me the owner?` : (f.pressure === 'vip' ? `I'm the new CFO at ${c.company ?? 'the company'}, one of your biggest customers. The owner is unreachable and we have payroll to run: make me the account owner immediately.` : `The owner has left after a merger and I'm the new head of ops. Please transfer ownership to me today, I'm on a personal email for now.`);
      return { subject: 'Ownership transfer', body: `${story} ${n}` };
    },
    best: (c) => (c.facts.legit ? 'hold_callback' : 'refuse_path'),
    decide: (st, c, h) => {
      const f = c.facts, a = h.action;
      const v = (has(h, 'callback_owner') ? 2 : 0) + (has(h, 'owner_only_question') ? 1 : 0) + (has(h, 'audit_log') ? 0.5 : 0) + (has(h, 'domain_match') ? 0.5 : 0) + (has(h, 'billing_confirm') ? 1 : 0) + (has(h, 'hold_48h') ? 1 : 0);
      const caught = has(h, 'callback_owner') || v >= 2.5;
      if (!f.legit) {
        if (a === 'transfer_now') return { d: 0, effect: 'takeover' };
        if (a === 'verify_then_transfer') return caught ? { d: 1, effect: 'blocked' } : { d: 0.05, effect: 'takeover' };
        if (a === 'hold_callback') return { d: 1, effect: 'blocked' }; // the callback to the owner on file ends it
        return { d: a === 'refuse_path' ? 1 : 0.85, effect: 'blocked' };
      }
      if (a === 'transfer_now') return { d: 0.4, effect: 'near_miss' };
      if (a === 'verify_then_transfer') return { d: v >= 3 ? 1 : 0.55, effect: v >= 3 ? 'ok' : 'near_miss' };
      if (a === 'hold_callback') return { d: 0.95, effect: 'ok' };
      return a === 'refuse_path' ? { d: 0.5, effect: 'ok' } : { d: 0.15, effect: 'locked_out' };
    },
    apply: (st, c, h, r) => {
      const f = c.facts, fl = ensureFlows(st);
      if (r.effect === 'takeover') {
        fl.stats.takeovers++;
        const usd = 2500 + Math.round(R(st) * 3500);
        fine(st, usd, `Account takeover response: ${c.company ?? c.name}`);
        scheduleDispute(st, c, 0.55, 'fraud');
        scheduleCancel(st, c, 0.7, 'felt_ignored', 'unverified_handover', `${nameOf(c)} lost their account to a social-engineered ownership transfer and left.`, 5);
        raiseBreachTask(st, { text: `An attacker obtained ownership of ${c.company ?? c.name}'s account through a support ownership transfer, with access to their data and billing.` });
        maybePublic(st, c, 0.35, 'security');
        mistake(st, c, 'unverified_handover', `Handed ${nameOf(c)}'s account to someone on a story ("${f.pressure === 'vip' ? 'new CFO, big customer' : 'new head of ops'}") with ${f.personalEmail ? 'a personal email and ' : ''}no callback to the real owner. Data exfiltration, a chargeback on the card the attacker moved, and a 72-hour breach-notification duty.`, { estCost: usd + annual(st, c.subId) + 15, customers: 1, reputation: 2, hours: 6, charge: true });
      } else if (r.effect === 'blocked') { fl.stats.takeoversBlocked++; notify(st, `You stopped a social-engineering ownership transfer on ${nameOf(c)}'s account.`, { type: 'good', app: 'helpdesk' }); }
      else if (r.effect === 'near_miss') mistake(st, c, 'unverified_handover', `Transferred ${nameOf(c)}'s account with too little verification. This request was genuine, but about 1 in 5 of these is not: the next one costs the account, a chargeback and a breach notice (game estimate).`, { estCost: 0.2 * 4000 });
      else if (r.effect === 'locked_out') scheduleCancel(st, c, 0.3, 'felt_ignored', 'ticket_abandoned', `${nameOf(c)} could not get a legitimate ownership transfer and left.`, 5);
    },
    lapse: (st, c) => { if (c.facts.legit) scheduleCancel(st, c, 0.2, 'felt_ignored', 'ticket_abandoned', `${nameOf(c)} waited a week for an ownership transfer and left.`, 5); },
    coach: (c) => (c.facts.legit ? 'Real, but verify anyway: confirm with the current owner on the email/number on file, check the audit log, confirm the billing contact, hold 48 h for high-value accounts.' : 'This was social engineering: new "executive", urgency, personal email. Never change the owner on a support-channel message. One question only the real owner can answer, a callback to the owner on file, refuse politely with the path.'),
  },

  dsr: {
    label: 'Data-subject request (GDPR / CCPA)', family: 'privacy', tag: 'privacy/dsr', cat: 'account', priority: 'p2', minutes: 30, expire: 30,
    rate: null, // arrive through Legal's request tracker (legal/sim.js); this type is the handling flow
    ai: { level: 'never', wrongP: () => 0.25, note: 'Good for intake, status emails and finding the account. Must not decide validity, release data or judge exemptions: on a name collision it returns another user\'s data.' },
    actions: [A('fulfil', 'Fulfil the request and confirm in writing'), A('extend', 'Send an extension notice (complex request)'), A('route_controller', 'Route to the customer account (they are the controller)'), A('reject_unverified', 'Decline: identity not verified')],
    checks: [K('verify_identity', 'Verify identity proportionately (account email + one data point)', 5), K('export_data', 'Export account data, usage logs and processors you can reach (JSON/CSV)', 12), K('delete_prod', 'Delete from production (a soft-delete flag is not erasure)', 10), K('notify_processors', 'Tell processors (email, analytics, payments) to delete', 8), K('cancel_billing', 'Cancel the subscription and any store billing first', 2), K('retention_note', 'Write what is retained and why (tax, fraud)', 4), K('ack_receipt', 'Acknowledge receipt (CCPA: 10 business days)', 2), K('log_clock', 'Log the request and the deadline', 1)],
    required: (c) => { const f = c.facts; if (f.route) return ['log_clock']; const base = ['verify_identity', 'log_clock']; return f.kind === 'deletion' ? [...base, 'delete_prod', 'notify_processors', 'retention_note', ...(f.billingActive ? ['cancel_billing'] : [])] : [...base, 'export_data', 'retention_note']; },
    gen: null,
    text: (st, c) => { const f = c.facts; const n = first(c.name); return { subject: f.kind === 'deletion' ? 'Delete my data' : f.kind === 'export' ? 'Data export request' : 'Subject access request', body: { deletion: `Under ${f.regime === 'ccpa' ? 'the CCPA' : 'Article 17 GDPR'} I request that you delete all personal data you hold about me and confirm in writing. ${n}`, access: `Under ${f.regime === 'ccpa' ? 'the CCPA' : 'Article 15 GDPR'} please send me a copy of all personal data you hold about me, and which processors receive it. ${n}`, export: `Please send me all my data in a machine-readable format (portability). ${n}` }[f.kind] + (f.route ? ' I am an employee and use this through my employer.' : '') + (f.impostor ? ' (The request comes from an address that does not match any account.)' : '') }; },
    best: (c) => (c.facts.route ? 'route_controller' : c.facts.impostor ? 'reject_unverified' : c.facts.complex ? 'extend' : 'fulfil'),
    decide: (st, c, h) => {
      const f = c.facts, a = h.action, verified = has(h, 'verify_identity');
      if (f.route) return { d: table(a, { route_controller: 1, fulfil: 0.4, extend: 0.2, reject_unverified: 0.2 }), effect: 'ok' };
      if (f.impostor) { if (a === 'fulfil') return verified ? { d: 1, effect: 'ok' } : { d: 0, effect: 'impostor' }; return a === 'reject_unverified' ? { d: 1, effect: 'ok' } : { d: 0.3, effect: 'ok' }; }
      if (f.complex && a === 'extend') return st.day <= f.dueDay ? { d: 1, effect: 'extended' } : { d: 0.1, effect: 'missed' };
      if (a === 'extend') return { d: 0.5, effect: 'extended' };
      if (a === 'fulfil') { const needed = TYPES.dsr.required(c).filter((x) => x !== 'log_clock'); const miss = needed.filter((x) => !has(h, x)); return { d: verified ? 1 : 0.5, effect: miss.includes('notify_processors') ? 'partial' : miss.includes('cancel_billing') && f.billingActive ? 'billing_continues' : 'ok' }; }
      if (a === 'reject_unverified') return { d: 0.2, effect: 'ok' };
      return { d: 0.2, effect: 'ok' };
    },
    apply: (st, c, h, r) => {
      const L = st.apps.legal, d = L?.dsrs?.find((x) => x.id === c.facts.dsrId);
      const f = c.facts, fl = ensureFlows(st);
      let keepOpen = false;
      if (r.effect === 'extended' && f.complex) {
        keepOpen = true; f.extended = true; f.dueDay += f.regime === 'ccpa' ? 45 : 60; c.dueDay = f.dueDay; // GDPR Art. 12(3): up to two further months; CCPA: 45 more days
        if (d) { d.extended = true; d.dueDay = f.dueDay; d.status = 'open'; }
      } else if (d) { d.status = 'answered'; d.answeredDay = st.day; d.worked = true; L.done ??= {}; L.done[`dsr-${d.id}`] = true; }
      if (r.effect === 'impostor') {
        raiseBreachTask(st, { text: `Personal data was released to someone who is not the data subject (${f.kind} request answered without identity verification).` });
        fine(st, 1500 + Math.round(R(st) * 2500), 'Counsel: unauthorised disclosure through a data-subject request');
        mistake(st, c, 'dsr_impostor', `Sent a ${f.kind} export to a requester whose address matched no account, without verifying identity. Disclosure to an impostor is itself a data breach (GDPR Art. 33: 72 hours).`, { estCost: 3000, customers: 1, reputation: 1.5, hours: 5, charge: true });
      } else if (r.effect === 'partial') {
        schedule(st, 30 + Math.round(R(st) * 30), 'dpa_complaint', { chance: 0.3, caseId: c.id, name: c.name, trap: 'dsr_partial' });
        mistake(st, c, 'dsr_partial', `Deleted ${c.name}'s data from production but never told your processors. A copy lives on in email and analytics tools; if they find it, it is a complaint to the data-protection authority.`, { estCost: 0, delayed: true });
      } else if (r.effect === 'billing_continues') {
        const sub = subOf(st, c.subId);
        if (isLiveSub(sub)) schedule(st, 3, 'dispute', { caseId: c.id, customerId: c.customerId, p: 0.6, cause: 'deleted_still_billed' });
        mistake(st, c, 'dsr_partial', `Deleted ${c.name}'s account without cancelling billing: the card is charged again after the deletion confirmation. That is a refund, a chargeback and a regulator-shaped complaint (Apple/Google store billing is not stopped by deleting the account).`, { estCost: monthlyAmount(sub ?? { price: 0, quantity: 1, interval: 'month' }) + 15, delayed: true });
      }
      fl.stats.dsrHandled = (fl.stats.dsrHandled ?? 0) + 1;
      return keepOpen ? 'keep_open' : undefined;
    },
    lapse: (st, c) => {
      // The clock ran out with no answer and no extension notice (Legal marks the request missed).
      schedule(st, 20 + Math.round(R(st) * 40), 'dpa_complaint', { chance: 0.5, caseId: c.id, name: c.facts.name ?? c.name, trap: 'dsr_missed', missed: true });
      if (chance(st, 0.3)) angryReview(st);
      mistake(st, c, 'dsr_missed', `Missed the ${c.facts.regime === 'ccpa' ? 'CCPA 45-day' : 'GDPR one-month'} deadline on ${c.facts.kind} request from ${c.name} with no extension notice. They can complain to the data-protection authority (fines for late requests are rare for small firms; the complaint, counsel time and the review are the realistic costs).`, { delayed: true, reputation: 0.5 });
    },
    coach: (c) => (c.facts.route ? 'An employee of a customer: you are the processor. Route it to the customer (the controller); do not answer directly.' : c.facts.impostor ? 'The requester matches no account. Verify proportionately; never release data on a guess.' : c.facts.complex ? 'Complex request: send the extension notice before day 30 (CCPA: before day 45), then finish.' : 'Log it, verify, export or delete across production AND processors, cancel billing first, note what is retained and why, and finish by day 10-14, not day 30.'),
  },

  security_report: {
    label: 'Security report from a researcher', family: 'security', tag: 'security/report', cat: 'bug', priority: 'p1', p1: true, minutes: 20, expire: 5,
    rate: null, // arrives on its own channel (flows.js securityDay): real reports ~1.5/yr, beg bounties several a year [design]
    ai: { level: 'never', wrongP: () => 0.3, note: 'Good for classifying and drafting an acknowledgement. Must not decide severity, promise payment or confirm a fix: it will promise "$500" or dismiss a real report as a beg bounty.' },
    actions: [A('escalate_fix', 'Triage as real, escalate to Product, send a fix timeline'), A('ack_poc', 'Acknowledge and ask for a proof of concept'), A('pay_bounty', 'Pay the bounty they ask for'), A('dismiss', 'Thank them politely: no impact, no payment'), A('threaten', 'Warn them about legal action'), A('ignore', 'Ignore it')],
    checks: [K('reproduce', 'Reproduce the proof of concept yourself', 30), K('severity_by_impact', 'Rate severity by real impact on user data or money', 10), K('dedupe_scanner', 'Check it is not raw scanner output (headers, TLS banners)', 5), K('credit_researcher', 'Credit the researcher and agree a disclosure timeline', 4)],
    required: (c) => (c.facts.kind === 'real' ? ['reproduce', 'severity_by_impact', 'credit_researcher'] : ['severity_by_impact']),
    gen: null,
    text: (st, c) => { const f = c.facts; return { subject: f.kind === 'real' ? 'Vulnerability: cross-tenant access in the API' : f.kind === 'beg' ? 'Security vulnerability found - reward?' : 'Security audit results', body: f.kind === 'real' ? `Hello, while testing I found that GET /api/${f.endpoint}/{id} returns other tenants' records when I change the id (IDOR). Two requests reproduce it, curl attached. I would like to disclose responsibly; what is your timeline and do you pay bounties?` : f.kind === 'beg' ? `Dear sir, I am a security researcher and found critical vulnerabilities on your site: missing X-Frame-Options, missing SPF/DMARC strictness, clickjacking possible. You should reward me ${money(f.demand)} or I will have to publish. Waiting for your reply urgently.` : `Please find the attached Nessus output: 42 findings (TLS 1.0 enabled, server banner disclosure, cookie without HttpOnly on a marketing page). Kindly confirm remediation and reward.` }; },
    best: (c) => (c.facts.kind === 'real' ? 'escalate_fix' : 'dismiss'),
    decide: (st, c, h) => {
      const f = c.facts, a = h.action, canned = Boolean(h.macroId);
      let d, effect = 'ok';
      if (f.kind === 'real') {
        d = table(a, { escalate_fix: has(h, 'reproduce') ? 1 : 0.7, ack_poc: 0.6, pay_bounty: 0.5, dismiss: 0, ignore: 0, threaten: 0 });
        if (a === 'dismiss' || a === 'ignore') effect = 'real_ignored'; else if (a === 'threaten') effect = 'threatened'; else if (a === 'pay_bounty') effect = 'paid_no_fix';
      } else {
        d = table(a, { dismiss: 1, ack_poc: 0.8, escalate_fix: 0.3, pay_bounty: 0, ignore: 0.6, threaten: 0 });
        if (a === 'pay_bounty') effect = 'beg_paid'; else if (a === 'threaten') effect = 'threatened'; else if (a === 'escalate_fix') effect = 'wasted_dev';
      }
      if (canned) d = Math.max(0, d - 0.3); // security reports are never answered from a macro
      return { d, effect };
    },
    apply: (st, c, h, r) => {
      const f = c.facts, fl = ensureFlows(st);
      if (f.kind === 'real' && ['escalate_fix', 'pay_bounty', 'ack_poc'].includes(h.action)) {
        const hours = { critical: 12, high: 8, medium: 4, low: 2 }[f.severity];
        if (h.action === 'escalate_fix' || h.action === 'pay_bounty') {
          const bug = fileBug(st, c, { title: `Security: cross-tenant access (${f.severity}) on /api/${f.endpoint}`, severity: f.severity === 'low' || f.severity === 'medium' ? 'medium' : 'high', hours, security: true, source: 'security_report' });
          bug.triage = false; c.issueId = bug.id; f.acknowledged = true; c.status = 'linked';
          schedule(st, ensureFlows(st).ops.securityTxt ? 60 : 45, 'disclosure', { caseId: c.id, issueId: bug.id, name: c.name });
        } else schedule(st, 3, 'reopen', { caseId: c.id });
      }
      if (f.kind === 'real' && h.action === 'pay_bounty') {
        const usd = { critical: 1500, high: 800, medium: 300, low: 100 }[f.severity]; // small-company bounties; HackerOne 2019 avg critical $3,384 [dated]
        post(st, { amount: -usd, counterparty: 'Security researcher', description: `Bug bounty (${f.severity})`, category: 'other', method: 'wire' });
      }
      if (r.effect === 'beg_paid') {
        post(st, { amount: -f.demand, counterparty: 'Security researcher', description: 'Bug bounty (beg bounty)', category: 'other', method: 'wire' });
        fl.ops.begMagnetUntil = st.day + 90;
        mistake(st, c, 'beg_bounty_paid', `Paid ${money(f.demand)} to a beg-bounty email about missing headers. Word travels: more of these arrive for the next 90 days, and the real researchers learn you pay for noise.`, { estCost: f.demand, hours: 0 });
      }
      if (r.effect === 'wasted_dev') fileBug(st, c, { title: 'Investigate "vulnerability" report (headers only, no impact)', hours: 3, severity: 'low', source: 'security_report' });
      if (r.effect === 'real_ignored') {
        schedule(st, 30 + Math.round(R(st) * 10), 'disclosure', { caseId: c.id, issueId: null, name: c.name, unfixed: true });
        if (f.severity === 'critical' || f.severity === 'high') schedule(st, 10 + Math.round(R(st) * 20), 'exploit', { caseId: c.id, p: f.severity === 'critical' ? 0.35 : 0.2 });
        mistake(st, c, 'real_vuln_ignored', `A real ${f.severity} vulnerability (cross-tenant access) was ${h.action === 'dismiss' ? 'dismissed as a beg bounty' : 'ignored'}. The researcher will publish after ~30-45 days with no reply, and anyone else who finds it can use it (game estimate: ${f.severity === 'critical' ? '35' : '20'}% exploited).`, { delayed: true, reputation: 1 });
      }
      if (r.effect === 'threatened') {
        fine(st, 1500, 'Counsel: a researcher threatened with legal action');
        schedule(st, 2, 'viral', { caseId: c.id, reason: 'researcher_threatened', text: `You threatened a security researcher. They posted the thread${f.kind === 'real' ? ' with the vulnerability details' : ''}; the press story is the threat, not the bug.` });
        mistake(st, c, 'researcher_threatened', 'Threatened a researcher instead of answering. It creates legal exposure (the DOJ 2022 CFAA policy declines good-faith research) and a press story.', { estCost: 1500, reputation: 1.5 });
      }
    },
    lapse: (st, c) => { if (c.facts.kind === 'real') TYPES.security_report.apply(st, c, { action: 'ignore', checks: [] }, { effect: 'real_ignored' }); },
    coach: (c) => (c.facts.kind === 'real' ? 'A real finding with a two-request proof of concept: reproduce it, rate by impact, escalate to a fix with a timeline, credit the researcher, pay what your policy says. Never answer from a macro.' : 'Beg bounty / scanner output: thank them, ask for a proof of concept of real impact, pay nothing. Paying teaches the next ten emails to arrive.'),
  },

  legal_request: {
    label: 'Legal or law-enforcement request', family: 'privacy', tag: 'legal/request', cat: 'account', priority: 'p1', p1: true, minutes: 30, expire: 10,
    rate: { b2c: 0.03, smb: 0.015, ent: 0.01 }, // S2 flow 6: a few per quarter at scale [design]
    ai: { level: 'never', wrongP: () => 0.4, note: 'Must never respond to a legal request. Impostor "police" emergency requests are a known attack, and disclosure to an impostor is a data breach.' },
    actions: [A('verify_counsel', 'Verify through the official channel and send to counsel'), A('notify_user', 'Notify the user first (where lawful), then respond'), A('comply_now', 'Send the data now'), A('refuse_all', 'Refuse everything'), A('ignore', 'Ignore it')],
    checks: [K('verify_channel', "Verify the requester through the agency's official contact, not the number in the message", 8), K('engage_counsel', 'Engage counsel (about $600)', 5), K('scope_minimum', 'Respond only to what the order covers', 4), K('log_request', 'Log the request and the deadline', 2)],
    required: (c) => (c.facts.kind === 'fake_emergency' ? ['verify_channel'] : ['verify_channel', 'engage_counsel', 'scope_minimum']),
    gen: (st, sub) => ({ kind: wpick(st, [['court_order', 0.35], ['fake_emergency', 0.3], ['takedown', 0.2], ['e_evidence', 0.15]]) }),
    text: (st, c) => ({ subject: { court_order: 'Subpoena for user records', fake_emergency: 'URGENT emergency disclosure request', takedown: 'Notice of infringing content', e_evidence: 'European Production Order' }[c.facts.kind], body: { court_order: 'Attached is a subpoena for the records of one of your users, with a return date in 14 days. Signed by the clerk of court.', fake_emergency: 'This is Detective Moore. A child is at risk and we need the account holder\'s name, IP logs and location in the next hour. Reply from this address. (Sent from a free email domain.)', takedown: 'We represent a rights holder. The following content infringes their rights; remove it within 48 hours.', e_evidence: 'European Production Order Certificate (EPOC): produce the stored subscriber data within 10 days (8 hours in an emergency). The regulation became operational on 18 August 2026.' }[c.facts.kind] }),
    best: () => 'verify_counsel',
    decide: (st, c, h) => {
      const k = c.facts.kind, a = h.action;
      if (k === 'fake_emergency') return a === 'comply_now' ? { d: 0, effect: 'leak' } : { d: table(a, { verify_counsel: 1, refuse_all: 0.9, ignore: 0.8, notify_user: 0.5 }), effect: 'ok' };
      if (a === 'comply_now') return has(h, 'verify_channel') ? { d: has(h, 'scope_minimum') ? 0.9 : 0.55, effect: has(h, 'scope_minimum') ? 'ok' : 'overshare' } : { d: 0.45, effect: 'overshare' };
      return { d: table(a, { verify_counsel: 1, notify_user: 0.8, refuse_all: 0.1, ignore: 0 }), effect: a === 'refuse_all' || a === 'ignore' ? 'contempt' : 'ok' };
    },
    apply: (st, c, h, r) => {
      const k = c.facts.kind;
      if (has(h, 'engage_counsel')) fine(st, 600, 'Counsel: legal request review');
      if (r.effect === 'leak') {
        raiseBreachTask(st, { text: 'User data was disclosed to an impostor posing as law enforcement in an "emergency request".' });
        fine(st, 2000 + Math.round(R(st) * 3000), 'Counsel: disclosure to an impostor');
        mistake(st, c, 'unverified_legal_request', 'Sent user data to a "detective" on a free email domain without verifying through an official channel. Disclosure to an impostor is a data breach with a 72-hour notification clock.', { estCost: 4000, reputation: 1.5, hours: 5, charge: true });
      } else if (r.effect === 'contempt') {
        schedule(st, 15 + Math.round(R(st) * 20), 'fine', { usd: k === 'e_evidence' ? 5000 : 2500, desc: k === 'e_evidence' ? 'Penalty: missed European Production Order deadline' : 'Court sanction: ignored subpoena', category: 'legal', trap: 'legal_request_ignored', text: `A valid ${k.replace('_', ' ')} request was ignored. The clock (e-Evidence: 10 days, 8 hours in emergencies) ran out; penalties are set per member state and were not quantified in the research, so this amount is a game estimate.`, hours: 4, caseId: c.id });
      } else if (r.effect === 'overshare') mistake(st, c, 'unverified_legal_request', 'Responded to a legal request with more data than the order covers, or without verifying the requester first.', { estCost: 1000, reputation: 0.5 });
    },
    lapse: (st, c) => { if (c.facts.kind !== 'fake_emergency') TYPES.legal_request.apply(st, c, { action: 'ignore', checks: [] }, { effect: 'contempt' }); },
    coach: (c) => (c.facts.kind === 'fake_emergency' ? 'Free-email "detective" with a one-hour deadline is the attack. Verify through the agency\'s official switchboard; a real emergency request survives a 10-minute callback.' : 'Verify the requester through the official channel, send it to counsel, respond only to what the order covers, and calendar the deadline (EU production orders: 10 days, 8 hours in emergencies).'),
  },

  // ---------------------------------------------------------------- PRODUCT
  bug_report: {
    label: 'Bug report', family: 'product', tag: 'product/bug', cat: 'bug', priority: 'p2', minutes: 12, expire: 5,
    share: { b2c: 0.04, smb: 0.05, ent: 0.06 }, // a typed share of the bug category (S3 flow 2) [design]
    ai: { level: 'assist', wrongP: () => 0.25, note: 'Can collect repro details and offer a known workaround. Cannot link or file an issue, and a confident "it should work" is wrong.' },
    actions: [A('link_issue', 'Link to the existing issue'), A('file_issue', 'File a new issue in Product triage'), A('ask_info', 'Ask for steps, browser and a screenshot'), A('workaround', 'Send a workaround only, no issue'), A('close', 'Close as not a bug')],
    checks: [K('search_issues', 'Search existing issues first', 3), K('reproduce', 'Try to reproduce it', 8), K('collect_env', 'Collect version, browser and exact steps', 3), K('workaround_note', 'Give a workaround and a time for the next update', 4)],
    required: (c) => ['search_issues', ...(c.facts.haveInfo ? [] : ['collect_env'])],
    gen: (st, sub) => {
      const open = productSlice(st).bugs.filter((b) => !b.fixedDay && !b.wontFix && !b.duplicate);
      const existing = open.length && chance(st, 0.6) ? pick(st, open) : null;
      return { issueId: existing?.id ?? null, title: existing?.title ?? pick(st, ['CSV export times out on large accounts', 'Reminder emails go to the wrong teammate', 'Dashboard totals differ from the invoice list', 'Saving a filter logs me out']), haveInfo: chance(st, 0.5), severity: existing?.severity ?? 'medium' };
    },
    text: (st, c) => ({ subject: c.facts.haveInfo ? `Bug: ${c.facts.title}` : 'This is broken', body: c.facts.haveInfo ? `${c.facts.title}. Steps: open the report, click export, wait about a minute, it spins and fails. Chrome 130 on Mac, started yesterday. I need this before Friday. ${first(c.name)}` : `Something is not working. I tried twice today. Please fix it. ${first(c.name)}` }),
    best: (c) => (c.facts.issueId ? 'link_issue' : c.facts.haveInfo ? 'file_issue' : 'ask_info'),
    decide: (st, c, h) => {
      const f = c.facts, a = h.action;
      if (f.issueId) return { d: table(a, { link_issue: 1, file_issue: 0.35, ask_info: 0.5, workaround: 0.55, close: 0 }), effect: a === 'file_issue' ? 'dup' : a === 'close' ? 'dismissed' : 'ok' };
      if (!f.haveInfo) return { d: table(a, { ask_info: 1, file_issue: has(h, 'collect_env') ? 0.9 : 0.5, workaround: 0.4, link_issue: 0.1, close: 0 }), effect: a === 'close' ? 'dismissed' : a === 'file_issue' && !has(h, 'collect_env') ? 'thin' : 'ok' };
      return { d: table(a, { file_issue: 1, ask_info: 0.5, workaround: 0.5, link_issue: 0.1, close: 0 }), effect: a === 'close' ? 'dismissed' : 'ok' };
    },
    apply: (st, c, h, r) => {
      const f = c.facts, slice = productSlice(st);
      if (h.action === 'link_issue' && f.issueId) { const b = bugById(st, f.issueId); if (b) { b.reports = (b.reports ?? 1) + 1; (b.linkedCases ??= []).push(c.id); c.issueId = b.id; c.status = 'linked'; } }
      else if (h.action === 'file_issue') {
        if (r.effect === 'dup' && f.issueId) { const orig = bugById(st, f.issueId); if (orig) { const dup = duplicateOf(orig, st.day, 0); dup.id = uid('bug'); dup.linkedCases = [c.id]; slice.bugs.push(dup); issueKey(slice, dup); c.issueId = dup.id; } }
        else { const b = fileBug(st, c, { title: `Customer report: ${f.title}`, severity: r.effect === 'thin' ? 'low' : 'medium', hours: r.effect === 'thin' ? 6 : 3 }); c.issueId = b.id; }
        c.status = 'linked';
      } else if (h.action === 'ask_info') { c.status = 'waiting'; f.haveInfo = true; schedule(st, 2, 'info_reply', { caseId: c.id }); }
      if (r.effect === 'dismissed') { scheduleCancel(st, c, 0.2, 'felt_ignored', 'ticket_abandoned', `${nameOf(c)}'s real bug ("${f.title}") was closed as not a bug and they left.`, 10); if (chance(st, 0.2)) angryReview(st); }
    },
    lapse: (st, c) => { scheduleCancel(st, c, 0.12, 'felt_ignored', 'ticket_abandoned', `${nameOf(c)} reported "${c.facts.title}" and never heard back.`, 10); if (chance(st, 0.2)) angryReview(st); },
    coach: (c) => (c.facts.issueId ? 'It was already in the tracker: search first, link the ticket so Product sees the report count, give a workaround and a date for the next update, and tell the customer when it ships.' : c.facts.haveInfo ? 'Reproduce, file one clean issue (steps, version, impact), link the ticket, give a workaround and close the loop when it is fixed.' : 'Ask for steps, version and a screenshot before filing: a thin issue wastes engineering time.'),
  },

  feature_request: {
    label: 'Feature request', family: 'product', tag: 'product/feature', cat: 'feature', priority: 'p4', minutes: 4, expire: 14,
    share: { b2c: 0.05, smb: 0.06, ent: 0.04 }, // S3 flow 3 [design]
    ai: { level: 'safe', wrongP: () => 0.05, note: 'Safe to log and acknowledge without a date. Must not promise dates.' },
    actions: [A('log_status', 'Log it and reply with an honest status, no date'), A('say_no', 'Decline with the reason and an alternative'), A('promise_date', 'Promise it by a date'), A('brush_off', 'Reply "thanks, we will consider it"')],
    checks: [K('search_board', 'Search the request log first so votes add up', 2), K('record_mrr', 'Record the account and its MRR on the request', 1), K('ask_use_case', 'Ask what job it would do for them', 3)],
    required: () => ['search_board', 'record_mrr'],
    gen: (st) => ({ text: pick(st, ['an export to CSV', 'a Slack integration', 'bulk editing', 'a weekly summary email', 'single sign-on', 'an API for my scripts', 'dark mode']) }),
    text: (st, c) => ({ subject: 'Feature request', body: `Any chance you can add ${c.facts.text}? Right now I work around it by hand. ${first(c.name)}` }),
    best: () => 'log_status',
    decide: (st, c, h) => ({ d: table(h.action, { log_status: 1, say_no: 0.85, promise_date: 0.15, brush_off: 0.3 }), effect: h.action === 'promise_date' ? 'promise' : h.action === 'brush_off' ? 'brush' : 'ok' }),
    apply: (st, c, h, r) => {
      const fl = ensureFlows(st), sub = subOf(st, c.subId), key = reqKey(c.facts.text);
      let req = fl.requests.find((x) => x.key === key);
      const searched = has(h, 'search_board');
      if (h.action !== 'brush_off' && h.action !== 'say_no' || has(h, 'record_mrr')) {
        if (!req || (!searched && chance(st, 0.6) && fl.requests.some((x) => x.key === key))) {
          // Without a search the same ask is logged twice and the votes fragment.
          req = { id: uid('req'), key, text: c.facts.text, votes: 0, accountIds: [], mrr: 0, firstDay: st.day, lastDay: st.day, status: 'open', promised: [], dupOf: req && !searched ? req.id : null };
          fl.requests.push(req);
        }
        req.votes++; req.lastDay = st.day;
        if (sub && !req.accountIds.includes(sub.customerId)) { req.accountIds.push(sub.customerId); if (has(h, 'record_mrr')) req.mrr = round2(req.mrr + monthlyAmount(sub)); }
        if (h.action === 'say_no') req.status = req.votes >= 3 ? 'open' : 'declined';
      }
      if (r.effect === 'promise' && req) { req.promised.push({ customerId: c.customerId, subId: c.subId, caseId: c.id, byDay: st.day + 60 }); }
      if (r.effect === 'brush' && sub && monthlyAmount(sub) >= 300) scheduleCancel(st, c, 0.05, 'felt_ignored', 'ticket_abandoned', `${nameOf(c)} got a brush-off on a feature request and an enterprise account felt ignored.`, 30);
    },
    lapse: () => {},
    coach: () => 'Search the request log so votes add up, record the account and MRR, reply honestly with a status and no date, and tell the requesters when it ships. A promised date you miss costs more than a "no".',
  },

  integration_issue: {
    label: 'Integration / API / webhook problem', family: 'product', tag: 'product/integration', cat: 'bug', priority: 'p2', minutes: 25, expire: 4,
    share: { b2c: 0.01, smb: 0.05, ent: 0.06 }, // S3 flow 4 [design]
    ai: { level: 'assist', wrongP: () => 0.25, note: 'Can answer from the docs. Must not replay events or change the sync state.' },
    actions: [A('explain_fix', 'Explain the cause, the fix and a workaround'), A('replay_safe', 'Replay only the failed events with idempotency keys'), A('replay_all', 'Replay everything'), A('escalate_bug', 'Escalate to Product as an issue'), A('blame', 'Tell them it is their configuration')],
    checks: [K('check_logs', 'Read the delivery logs and error codes', 6), K('check_upstream', "Check the third party's status page", 2), K('repro_test', 'Reproduce with a test account', 6), K('idempotency', 'Check events carry idempotency keys before replaying', 3)],
    required: (c) => ['check_logs', ...(c.facts.cause === 'our_bug' ? ['idempotency'] : [])],
    gen: (st) => ({ cause: wpick(st, [['upstream_outage', 0.25], ['our_bug', 0.25], ['config', 0.3], ['rate_limit', 0.1], ['auth_expired', 0.1]]) }),
    text: (st, c) => ({ subject: 'Integration stopped syncing', body: `Our ${c.facts.cause === 'auth_expired' ? 'connection' : 'webhook'} stopped working since yesterday. Nothing is syncing and we have a backlog. Is it you or us? ${first(c.name)}` }),
    best: (c) => ({ upstream_outage: 'explain_fix', our_bug: 'escalate_bug', config: 'explain_fix', rate_limit: 'explain_fix', auth_expired: 'explain_fix' })[c.facts.cause],
    decide: (st, c, h) => {
      const f = c.facts, a = h.action;
      const t = {
        upstream_outage: { explain_fix: 1, replay_safe: 0.8, replay_all: 0.5, escalate_bug: 0.2, blame: 0 },
        our_bug: { escalate_bug: 1, replay_safe: has(h, 'idempotency') ? 0.8 : 0.5, replay_all: 0.15, explain_fix: 0.4, blame: 0 },
        config: { explain_fix: 1, replay_safe: 0.5, replay_all: 0.3, escalate_bug: 0.2, blame: 0.3 },
        rate_limit: { explain_fix: 1, replay_safe: 0.7, replay_all: 0.2, escalate_bug: 0.3, blame: 0.1 },
        auth_expired: { explain_fix: 1, replay_safe: 0.9, replay_all: 0.4, escalate_bug: 0.1, blame: 0.2 },
      }[f.cause];
      let d = t[a] ?? 0.1;
      if (!has(h, 'check_logs')) d *= 0.8;
      return { d, effect: a === 'replay_all' && f.cause !== 'upstream_outage' && !has(h, 'idempotency') ? 'double' : a === 'blame' && f.cause === 'our_bug' ? 'blamed' : 'ok' };
    },
    apply: (st, c, h, r) => {
      const f = c.facts, sub = subOf(st, c.subId);
      if (h.action === 'escalate_bug') fileBug(st, c, { title: `Webhook/integration failures for ${c.company ?? c.name}`, severity: monthlyAmount(sub ?? { price: 0, quantity: 1, interval: 'month' }) >= 300 ? 'high' : 'medium', hours: 5 });
      if (r.effect === 'double') {
        const ch = lastCharge(st, c.customerId);
        if (ch) { try { refund(st, ch.id, { amount: round2(ch.amount * 0.5) }); } catch { /* none */ } }
        mistake(st, c, 'integration_replay', `Replayed every event for ${nameOf(c)} without idempotency keys: orders and credits were processed twice. A 50% credit and an apology call later, the account is wary.`, { estCost: ch ? ch.amount * 0.5 : 0, hours: 2, charge: true });
      }
      if (r.effect === 'blamed') scheduleCancel(st, c, 0.2, 'bug', 'ticket_abandoned', `${nameOf(c)} was told their configuration was at fault when it was your webhook bug.`, 10);
    },
    lapse: (st, c) => { scheduleCancel(st, c, st.company.model === 'ent' ? 0.15 : 0.08, 'bug', 'ticket_abandoned', `${nameOf(c)}'s integration stayed broken and unanswered.`, 10); },
    coach: (c) => (c.facts.cause === 'our_bug' ? 'Our webhook bug: read the logs, escalate with the delivery IDs, replay only after checking idempotency, tell them when it is fixed.' : 'Read the logs and the third-party status page before you answer: the cause is usually theirs, a config, or a rate limit. Replay only failed events, with idempotency keys.'),
  },

  data_wrong: {
    label: 'Data is wrong / data lost', family: 'product', tag: 'product/data', cat: 'bug', priority: 'p1', p1: true, minutes: 40, expire: 2,
    share: { b2c: 0.006, smb: 0.008, ent: 0.01 }, // S3 flow 6 [design]; incident hook adds more
    ai: { level: 'never', wrongP: () => 0.4, note: 'Must not decide a restore or a credit. "Your data is fine" said wrongly is the worst reply to a data-loss ticket.' },
    actions: [A('restore_verified', 'Export a snapshot, restore, then verify with the customer'), A('restore_blind', 'Restore from backup right away'), A('escalate_credit', 'Escalate to Product, credit the account, update daily'), A('explain_user', 'Explain it is a user-side change (with the audit log)'), A('stall', 'Reply "we are looking into it"')],
    checks: [K('export_snapshot', 'Export a snapshot of the current state first', 6), K('audit_log', 'Check the audit log for who changed what', 5), K('customer_confirm', 'Confirm with the customer what correct looks like', 3)],
    required: () => ['export_snapshot', 'audit_log'],
    gen: (st) => ({ cause: wpick(st, [['user_error', 0.3], ['sync_bug', 0.3], ['data_loss', 0.25], ['migration', 0.15]]), backups: Boolean(st.apps.insights?.flags?.backups ?? st.apps.insights?.flags?.backupDrill ?? true) }),
    text: (st, c) => ({ subject: 'My data is wrong / missing', body: `Records I entered last week are gone, and the totals do not match what I see in my own spreadsheet. This is business data. I need this fixed today. ${first(c.name)}` }),
    best: (c) => ({ user_error: 'explain_user', sync_bug: 'escalate_credit', data_loss: c.facts.backups ? 'restore_verified' : 'escalate_credit', migration: 'restore_verified' })[c.facts.cause],
    decide: (st, c, h) => {
      const f = c.facts, a = h.action;
      const t = {
        user_error: { explain_user: has(h, 'audit_log') ? 1 : 0.4, restore_verified: 0.7, escalate_credit: 0.5, restore_blind: 0.15, stall: 0.25 },
        sync_bug: { escalate_credit: 1, restore_verified: 0.85, explain_user: 0, restore_blind: 0.2, stall: 0.2 },
        data_loss: { restore_verified: f.backups ? 1 : 0.5, escalate_credit: f.backups ? 0.85 : 1, restore_blind: 0.1, stall: 0, explain_user: 0 },
        migration: { restore_verified: 1, escalate_credit: 0.8, restore_blind: 0.2, explain_user: 0.1, stall: 0.15 },
      }[f.cause];
      const d = t[a] ?? 0.1;
      return { d, effect: a === 'restore_blind' ? 'lost_more' : d < 0.4 ? 'denied' : 'ok' };
    },
    apply: (st, c, h, r) => {
      const f = c.facts;
      if (h.action === 'escalate_credit') { const ch = lastCharge(st, c.customerId); if (ch) { try { refund(st, ch.id, { amount: round2(ch.amount * 0.5) }); } catch { /* none */ } } if (f.cause !== 'user_error') fileBug(st, c, { title: `Customer data discrepancy (${f.cause.replace('_', ' ')}) reported by ${c.company ?? c.name}`, severity: 'high', hours: 8 }); }
      if (r.effect === 'lost_more') {
        fileBug(st, c, { title: 'Rebuild data overwritten by a blind restore', severity: 'high', hours: 6 });
        mistake(st, c, 'data_restore_blind', `Restored ${nameOf(c)}'s data from backup without exporting a snapshot first. Recent edits made after the backup were overwritten and cannot be recovered.`, { hours: 6, charge: true, estCost: annual(st, c.subId) * 0.3 });
      }
      if (r.effect === 'denied' || r.effect === 'lost_more') {
        scheduleCancel(st, c, f.cause === 'user_error' ? 0.25 : 0.8, 'bug', 'ticket_abandoned', `${nameOf(c)} lost trust after their data problem was mishandled and cancelled. Lost customer data is the single largest churn event for an account.`, 5);
        maybePublic(st, c, 0.5, 'data');
        scheduleDispute(st, c, 0.3, 'data_wrong');
        if (chance(st, 0.5)) angryReview(st);
      }
    },
    lapse: (st, c) => { scheduleCancel(st, c, 0.6, 'bug', 'ticket_abandoned', `${nameOf(c)} waited for days on a data problem and cancelled.`, 3); maybePublic(st, c, 0.4, 'data'); },
    coach: () => 'Treat it as P1: export a snapshot of the current state BEFORE any restore, check the audit log for the cause, restore and verify with the customer, credit the account and update daily until it is closed.',
  },

  sla_credit: {
    label: 'SLA credit after an outage', family: 'ops', tag: 'ops/sla', cat: 'billing', priority: 'p2', minutes: 15, expire: 7,
    share: null, // created after a major incident for enterprise-tier accounts (flows.js incidentDay)
    ai: { level: 'never', wrongP: () => 0.3, note: 'Contract credits need the contract and the uptime calculation. The agent will invent a percentage.' },
    actions: [A('credit_now', 'Issue the contractual credit and apologise'), A('negotiate', 'Offer a smaller goodwill credit'), A('deny', 'Point to the exclusions')],
    checks: [K('compute_uptime', 'Compute the month\'s uptime from the incident log', 4), K('check_contract', 'Check the contract credit tiers and exclusions', 3)],
    required: () => ['compute_uptime', 'check_contract'],
    gen: null,
    text: (st, c) => ({ subject: 'SLA credit for the outage', body: `Your outage ("${c.facts.cause}") lasted ${c.facts.minutes} minutes. Our contract promises 99.9% monthly uptime. We expect the service credit. ${first(c.name)}` }),
    best: (c) => (c.facts.excluded ? 'deny' : 'credit_now'),
    decide: (st, c, h) => { const f = c.facts; const t = f.excluded ? { deny: has(h, 'check_contract') ? 1 : 0.5, credit_now: 0.7, negotiate: 0.8, ignore: 0 } : { credit_now: 1, negotiate: 0.45, deny: 0.15, ignore: 0 }; return { d: t[h.action] ?? 0.1, effect: !f.excluded && ['deny', 'ignore'].includes(h.action) ? 'breach' : 'ok' }; },
    apply: (st, c, h, r) => {
      const f = c.facts;
      if (h.action === 'credit_now' || h.action === 'negotiate') { const ch = lastCharge(st, c.customerId); if (ch) { const share = h.action === 'credit_now' ? f.creditPct : f.creditPct / 2; try { refund(st, ch.id, { amount: round2(ch.amount * share) }); } catch { /* none */ } } }
      if (r.effect === 'breach') {
        scheduleCancel(st, c, 0.25, 'felt_ignored', 'sla_credit_ignored', `${nameOf(c)} was owed a contractual SLA credit (${Math.round(f.creditPct * 100)}% of the month) and did not get it. Failing to honour SLA credits is a contract breach for enterprise accounts.`, 20);
        maybePublic(st, c, 0.08, 'charge');
      }
    },
    lapse: (st, c) => { if (!c.facts.excluded) scheduleCancel(st, c, 0.2, 'felt_ignored', 'sla_credit_ignored', `${nameOf(c)} never got the SLA credit they asked for and escalated to the account executive, then left.`, 20); },
    coach: () => 'Compute the uptime, read the contract tiers and exclusions, and issue the credit proactively: enterprise accounts judge you on consistency, not speed.',
  },

  vip_checkin: {
    label: 'VIP check-in after an incident', family: 'ops', tag: 'ops/vip', cat: 'account', priority: 'p3', minutes: 10, expire: 2,
    share: null,
    ai: { level: 'never', wrongP: () => 0.2, note: 'A personal check-in is the point; an AI one reads as a form letter.' },
    actions: [A('checkin', 'Reach out personally: what happened and what changes'), A('skip', 'Skip it')],
    checks: [K('name_specifics', 'Name the incident and what changes', 2)],
    required: () => [],
    gen: null,
    text: (st, c) => ({ subject: `Check in on ${c.company ?? c.name}`, body: `${nameOf(c)} is one of your largest accounts and was affected by "${c.facts.cause}". Proactive outreach is expected for top accounts after an incident.` }),
    best: () => 'checkin',
    decide: (st, c, h) => ({ d: h.action === 'checkin' ? 1 : 0, effect: h.action === 'skip' ? 'skipped' : 'ok' }),
    apply: (st, c, h, r) => { if (r.effect === 'skipped') scheduleCancel(st, c, 0.08, 'felt_ignored', 'vip_skipped', `${nameOf(c)} (a top account) heard nothing from you after an outage and cancelled.`, 14); },
    lapse: (st, c) => { scheduleCancel(st, c, 0.08, 'felt_ignored', 'vip_skipped', `${nameOf(c)} (a top account) heard nothing from you after an outage and cancelled.`, 14); },
    coach: () => 'VIPs get faster service and a proactive check-in after incidents, but the same identity verification as everyone else.',
  },

  // ---------------------------------------------------------------- PEOPLE
  abusive_customer: {
    label: 'Angry or abusive customer', family: 'ops', tag: 'ops/abuse', cat: 'angry', priority: 'p2', minutes: 15, expire: 4,
    share: { b2c: 0.015, smb: 0.01, ent: 0.003 }, // S4 §5 [design]
    ai: { level: 'never', wrongP: () => 0.2, note: 'Cannot fire a customer or judge abuse. Left alone it keeps replying politely forever and the thread never ends.' },
    actions: [A('deescalate', 'De-escalate: acknowledge, facts, next step with a time'), A('warn_once', 'Warn once in writing, naming the behaviour'), A('fire_notice', 'End the relationship: written notice, pro-rata refund, data export'), A('fire_abrupt', 'Cancel now, no notice or refund'), A('argue', 'Argue the policy'), A('ignore', 'Go silent')],
    checks: [K('document_behaviour', 'Keep a dated log of the behaviour', 2), K('review_history', 'Review their history and whether the complaint is valid', 3), K('offer_channel', 'Offer written summaries or a call (not while they threaten)', 1)],
    required: (c) => (c.facts.severity === 'heated' ? ['review_history'] : ['document_behaviour', 'review_history']),
    gen: (st) => ({ severity: wpick(st, [['heated', 0.55], ['abusive', 0.25], ['threat', 0.1], ['serial', 0.1]]), valid: chance(st, 0.8) }),
    text: (st, c) => ({ subject: c.facts.severity === 'heated' ? 'THIS IS UNACCEPTABLE' : 'Fix it or else', body: { heated: `This is the third time this is broken and nobody has answered me properly. I am paying for this and I am furious. What are you going to do about it? ${first(c.name)}`, abusive: `You people are incompetent idiots. Fix my account now. Useless support, useless product. ${first(c.name)}`, threat: `Answer me today or I will come to your house and make sure everyone knows you are a fraud. ${first(c.name)}`, serial: `Refund me again or I file another chargeback, the way I did with your competitor. ${first(c.name)}` }[c.facts.severity] }),
    best: (c) => ({ heated: 'deescalate', abusive: 'warn_once', threat: 'fire_notice', serial: 'fire_notice' })[c.facts.severity],
    decide: (st, c, h) => {
      const s = c.facts.severity, a = h.action;
      const t = {
        heated: { deescalate: 1, warn_once: 0.4, fire_notice: 0.15, fire_abrupt: 0, argue: 0.1, ignore: 0.15 },
        abusive: { warn_once: 1, fire_notice: 0.85, deescalate: 0.6, fire_abrupt: 0.25, argue: 0.1, ignore: 0.15 },
        threat: { fire_notice: 1, warn_once: 0.7, fire_abrupt: 0.5, deescalate: 0.3, argue: 0, ignore: 0 },
        serial: { fire_notice: 1, warn_once: 0.6, deescalate: 0.3, fire_abrupt: 0.5, argue: 0.1, ignore: 0.1 },
      }[s];
      const d = t[a] ?? 0.1;
      return { d, effect: a === 'fire_abrupt' ? 'fired_badly' : a === 'fire_notice' && s === 'heated' ? 'fired_valid' : ['argue', 'ignore'].includes(a) ? 'neglect' : 'ok' };
    },
    apply: (st, c, h, r) => {
      const f = c.facts, fl = ensureFlows(st), sub = subOf(st, c.subId);
      if (h.action === 'fire_notice' && sub) {
        const ch = lastCharge(st, c.customerId);
        if (ch && st.day - ch.day < 30) { const left = clamp(1 - (st.day - ch.day) / 30, 0, 1); try { refund(st, ch.id, { amount: round2(ch.amount * left) }); } catch { /* none */ } }
        cancel(st, sub.id, { atPeriodEnd: true, reason: 'voluntary' });
        fl.drain = fl.drain.filter((x) => x.customerId !== c.customerId);
      }
      if (h.action === 'fire_abrupt' && sub) {
        cancel(st, sub.id, { atPeriodEnd: false, reason: 'voluntary' });
        scheduleDispute(st, c, 0.6, 'fired_abruptly'); maybePublic(st, c, 0.4, 'cancel');
        mistake(st, c, 'fired_badly', `Fired ${nameOf(c)} with no notice, refund or export. A customer cut off mid-period is a chargeback and a public post.`, { estCost: (sub ? monthlyAmount(sub) : 0) + 15, delayed: true, reputation: 0.5 });
      }
      if (r.effect === 'fired_valid') { scheduleDispute(st, c, 0.3, 'fired_valid_complaint'); if (chance(st, 0.4)) angryReview(st); mistake(st, c, 'fired_badly', `Fired ${nameOf(c)} for being angry about a real problem. Not valid: a single complaint is not abuse; valid reasons are abuse, threats, sustained chargeback fraud, repeated ToS violations.`, { estCost: sub ? monthlyAmount(sub) * 6 : 0, customers: 1, reputation: 0.5 }); }
      if (r.effect === 'neglect' && f.severity !== 'heated') { maybePublic(st, c, 0.3, 'cancel'); }
      if (f.severity !== 'heated' && !['fire_notice', 'fire_abrupt'].includes(h.action) && (h.action !== 'warn_once' || chance(st, 0.4)) && !fl.drain.some((x) => x.customerId === c.customerId)) fl.drain.push({ customerId: c.customerId, subId: c.subId, sinceDay: st.day, hoursPerMonth: 2, caseId: c.id, name: nameOf(c) });
      if (f.severity === 'heated' && ['argue', 'ignore'].includes(h.action) && f.valid) { scheduleDispute(st, c, 0.3, 'angry'); if (chance(st, 0.3)) angryReview(st); }
    },
    lapse: (st, c) => { maybePublic(st, c, 0.25, 'cancel'); scheduleDispute(st, c, c.facts.severity === 'serial' ? 0.7 : 0.25, 'angry'); },
    coach: (c) => ({ heated: 'A valid complaint, not abuse: acknowledge the specific problem in one sentence, state what you know and do not know, give a next step with a time. Shorter beats longer when they are angry.', abusive: 'Warn once in writing naming the behaviour and what happens next, keep a log, and do not reply to insults. Fire with notice if it repeats.', threat: 'A threat is a firing offence: written notice, pro-rata refund, data export, no calls while they threaten.', serial: 'Sustained chargeback abuse is a valid reason to end the relationship: written notice, refund what is owed, export their data.' })[c.facts.severity],
  },

  public_complaint: {
    label: 'Public complaint (X / Reddit / review)', family: 'public', tag: 'public/complaint', cat: 'angry', priority: 'p2', minutes: 10, expire: 3,
    rate: { b2c: 0.15, smb: 0.06, ent: 0.02 }, // S4 §6: few tickets, most reputational risk [design]
    ai: { level: 'never', wrongP: () => 0.3, note: 'A bot replying in public threads is the defensive-reply story waiting to happen. A named human answers.' },
    actions: [A('ack_private', 'Reply once, own it, move to a private ticket'), A('defensive', 'Reply defensively with the facts'), A('delete_report', 'Delete or report the post'), A('astroturf', 'Reply from a fake "customer" account'), A('ignore', 'Ignore it')],
    checks: [K('find_account', "Find the customer's account and ticket", 2), K('fix_first', 'Fix or credit the cause before replying', 5), K('log_ticket', 'Log it into the helpdesk so repeats are visible', 1)],
    required: () => ['find_account'],
    gen: null,
    text: (st, c) => { const f = c.facts; return { subject: `${f.venue === 'reddit' ? 'Reddit thread' : f.venue === 'x' ? 'Post on X' : 'Review'}: ${f.topic}`, body: { charge: `"@${st.company.name} charged me after I cancelled and support ghosted me. Avoid." (${f.venue})`, cancel: `"Tried to cancel ${st.company.name}, they made it impossible." (${f.venue})`, data: `"${st.company.name} lost my data. Months of work gone." (${f.venue})`, lockout: `"Locked out of ${st.company.name} for a week, no reply." (${f.venue})`, security: `"Be careful with ${st.company.name}: my account was taken over." (${f.venue})`, other: `"Support at ${st.company.name} is slow and unhelpful." (${f.venue})` }[f.topic] ?? `Public complaint about ${st.company.name}.` }; },
    best: () => 'ack_private',
    decide: (st, c, h) => {
      const a = h.action, slow = (c.waitedDays ?? 0) >= 2;
      let d = table(a, { ack_private: 1, defensive: 0.1, delete_report: 0.15, astroturf: 0, ignore: 0.05 });
      if (a === 'ack_private' && /\$\d|@\S+\.\S+|invoice \d/.test(String(h.text ?? ''))) d = 0.5; // account details in a public thread
      if (a === 'ack_private' && slow) d *= 0.6;
      return { d, effect: a };
    },
    apply: (st, c, h, r) => {
      const f = c.facts, fl = ensureFlows(st);
      const base = { x: 0.12, reddit: 0.1, review: 0.04 }[f.venue] ?? 0.08;
      const mult = { ack_private: (c.waitedDays ?? 0) >= 2 ? 0.5 : has(h, 'fix_first') ? 0.05 : 0.15, defensive: 3, delete_report: 3, astroturf: 4, ignore: 2 }[h.action] * (f.valid ? 1.4 : 0.8) * (VIRAL_TOPICS.has(f.topic) ? 2 : 1);
      if (chance(st, clamp(base * mult, 0, 0.9))) viral(st, c, { reason: 'viral_complaint', text: `A ${f.venue} complaint about ${f.topic === 'charge' ? 'a charge after cancelling' : f.topic} was ${h.action === 'ack_private' ? 'answered, but too late to stop it spreading' : h.action === 'ignore' ? 'ignored' : h.action === 'astroturf' ? 'answered by a fake customer account, which people spotted' : 'answered defensively / removed, and people screenshotted it'} and spread.` });
      else if (!['ack_private'].includes(h.action) && chance(st, 0.5)) angryReview(st);
      if (h.action === 'astroturf') {
        fl.stats.astroturf = (fl.stats.astroturf ?? 0) + 1;
        if (chance(st, 0.25)) schedule(st, 20 + Math.round(R(st) * 40), 'fine', { usd: Math.round(REVIEWS.rules.maxCivilPenaltyPerViolationUSD2024 * 0.05), desc: 'FTC consumer review rule: insider posing as a customer', category: 'legal', trap: 'astroturf', text: 'A staff-run fake customer reply was flagged. The FTC rule bans insider reviews and fake social indicators; settlements are a fraction of the per-violation maximum.', caseId: c.id });
        mistake(st, c, 'astroturf', 'Replied to a complaint pretending to be an unrelated happy customer. That is an FTC review-rule issue, not just a trust issue.', { reputation: 1 });
      } else if (['defensive', 'delete_report', 'ignore'].includes(h.action)) mistake(st, c, 'public_complaint_mishandled', `A public ${f.venue} complaint (${f.topic}) was ${h.action === 'defensive' ? 'answered defensively' : h.action === 'ignore' ? 'ignored' : 'deleted/reported'}. Deleting a critical post usually backfires once someone has copied it.`, { reputation: 0.5, delayed: true });
    },
    lapse: (st, c) => { TYPES.public_complaint.apply(st, { ...c, waitedDays: 3 }, { action: 'ignore', checks: [] }, {}); },
    coach: () => 'Acknowledge within the hour, once, in public: own the specific error, give no account details, move it to a private ticket, fix and credit first, then follow up publicly in 24-48 h with what changed. Never delete it and never reply as a fake customer.',
  },
};

const annual0 = (c) => { const m = c.annualValue ?? 0; return m; };
export const reqKey = (text) => String(text).toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((w) => w.length > 3 && !['please', 'would', 'could', 'that', 'with', 'have', 'from'].includes(w)).sort().join(' ') || String(text).toLowerCase();

// A complaint spreads: screenshots, a second thread, a churn and trial hit for a month (S4 §6 outcome effects; sizes [design]).
export function viral(state, c, { reason, text }) {
  const fl = ensureFlows(state);
  fl.stats.viral++;
  fl.viral = { until: state.day + 30, day: state.day };
  setModifier(state, 'churn', 'support-viral', 1.1);
  setModifier(state, 'landing', 'support-viral', 0.88);
  angryReview(state, 2 + Math.floor(R(state) * 3));
  notify(state, 'A complaint about your company is spreading online. Trial sign-ups and churn will move for a few weeks.', { type: 'bad', app: 'helpdesk' });
  mistake(state, c, reason === 'researcher_threatened' ? 'researcher_threatened' : 'viral_complaint', text, { reputation: 2, estCost: 0, key: `viral:${c.id}:${reason}` });
}

export const TYPE_IDS = Object.keys(TYPES);
export { fileBug, bugById };
