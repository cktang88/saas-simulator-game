// Transactional email: provider, sending subdomain, SPF/DKIM/DMARC, the required emails and what happens when they are
// missing, wrong or mixed with marketing. Extends Lifecycle (apps/lifecycle/model.js) rather than duplicating it:
// Lifecycle keeps the marketing stream and its domain reputation; this module owns the transactional stream and tells
// Lifecycle (L.txn) how many new signups lose their login mail. Pure and deterministic (rng(state) / hashes).
//
// Research: docs/research/plg-email/p2-transactional.md. Prices and limits are secondary summaries (Apr-Oct 2026); the
// game labels them "check the vendor page". Legal items were not verified against statute text: coaching says "confirm
// with counsel". Tags: [design] = game estimate.

import { clamp, rng, chance, round2 } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { addRecurring, post } from '../../core/bank.js';
import { logMistake, shrink, tierFromScore } from '../../core/operator.js';
import { ensureStripe, activeSubs } from '../../core/stripe.js';
import { ensureMarket } from '../../core/market.js';
import { ensureLifecycle, h01 } from '../lifecycle/model.js';

// ---- Providers (p2 §2). tiers: monthly emails included -> price. dayCap for free tiers. ----
export const PROVIDERS = {
  resend: { label: 'Resend', base: 0.97, streams: false, incidents: 1.5, setup: 1.5, note: 'Free: 3,000/month, 100/day, one domain. Pro $20 for 50k; Scale $90 for 100k. Logs 30 days.', tiers: [{ max: 3000, price: 0, name: 'Free', dayCap: 100 }, { max: 50000, price: 20, name: 'Pro 50k' }, { max: 100000, price: 90, name: 'Scale 100k' }, { max: 200000, price: 160, name: 'Scale 200k' }, { max: 500000, price: 350, name: 'Scale 500k' }, { max: Infinity, price: 1150, name: 'Scale 2.5M' }] },
  postmark: { label: 'Postmark', base: 0.985, streams: true, incidents: 0.7, setup: 1.5, note: 'Free: 100/month. Basic $15 for 10k, then $1.80 per 1k. Separate transactional and broadcast streams with their own IPs.', tiers: [{ max: 100, price: 0, name: 'Free', dayCap: 100 }, { max: 10000, price: 15, name: 'Basic 10k' }, { max: Infinity, price: 15, name: 'Basic + overage', per1k: 1.8, over: 10000 }] },
  ses: { label: 'Amazon SES', base: 0.95, streams: false, incidents: 1, setup: 4, needsWiring: true, note: 'About $0.10 per 1,000 emails. You own bounce and complaint handling (SNS wiring) and your reputation.', tiers: [{ max: Infinity, price: 0, name: 'Pay as you go', per1k: 0.1, over: 0 }] },
  sendgrid: { label: 'SendGrid', base: 0.95, streams: false, incidents: 3, setup: 2, note: 'No permanent free tier (60-day trial, 100/day). Essentials from about $19.95 for 50k on shared IPs; Pro $89.95 with a dedicated IP.', tiers: [{ max: 50000, price: 19.95, name: 'Essentials 50k' }, { max: Infinity, price: 89.95, name: 'Pro' }] },
  loops: { label: 'Loops (same account as marketing)', base: 0.96, streams: false, incidents: 1.5, setup: 1, shared: true, note: 'Priced by contacts; transactional sends count against the shared quota (Free: 1,000 contacts, 4,000 sends/30 days). Check its stream separation before using it for login mail.', tiers: [{ max: 4000, price: 0, name: 'Free (shared quota)' }, { max: Infinity, price: 49, name: 'Growth' }] },
};
export const REF_DELIVERY = 0.88; // [design] what the market benchmarks already embed: a typical setup lands ~88% in the inbox
export const TXN = { dnsHours: 0.5, subdomainHours: 3, seedHours: 1.5, templateHours: 0.5, reviewUsd: 250, reviewHours: 1, fallbackHours: 2, fallbackUsd: 20, monitorHours: 1.5, weeklyHours: 0.25, dmarcWaitDays: 14 };

// ---- Required emails (p2 §4). checks: what must be in the email; legal checks weigh double. ----
const promoRe = /(\d+\s*%\s*off|upgrade now|limited[- ]time|special offer|discount|promo code|refer a friend|check out our|new feature)/i;
export const TEMPLATES = {
  verification: { label: 'Signup verification', def: 0.55, trigger: 'Account created. Send within 60 seconds.', stream: 'transactional', checks: [
    ['link', 'A single action link', /\{\{\s*(verifyUrl|link|ctaUrl)\s*\}\}|https?:\/\//i], ['expiry', 'Expiry stated', /expire|valid for|\{\{\s*expiresIn\s*\}\}/i], ['ignore', 'What happens if ignored / not you', /ignore|didn'?t (sign|create|request)|if this wasn'?t you/i], ['support', 'A support contact or reply path', /support|reply to this|help@|contact/i]],
    starter: { subject: 'Confirm your email', body: 'Hi {{firstName}},\n\nConfirm your email to finish setting up your account: {{verifyUrl}}\n\nThis link expires in 60 minutes. If you did not create an account, ignore this email.\n\nQuestions? Reply to this email.' } },
  magic_link: { label: 'Magic link / login code', def: 0.45, trigger: 'Login requested. Single use, 15-60 minute expiry.', stream: 'transactional', checks: [
    ['link', 'A single action link or code', /\{\{\s*(magicUrl|code|link)\s*\}\}|https?:\/\/|\b\d{6}\b/i], ['expiry', 'Expiry of 15-60 minutes', /\b(15|20|30|45|60)\s*(minutes|mins)\b|\b1 hour\b/i], ['single', 'Single use', /once|single[- ]use|one[- ]time/i], ['notme', 'A "not you" instruction', /wasn'?t you|did not request|didn'?t request|ignore/i]],
    starter: { subject: 'Your login link', body: 'Hi {{firstName}},\n\nUse this link to sign in: {{magicUrl}}\n\nIt works once and expires in 15 minutes. If you did not request it, ignore this email.' } },
  password_reset: { label: 'Password reset', def: 0.5, trigger: 'Reset requested. Same rules as a magic link, plus a lock-account link.', stream: 'transactional', checks: [
    ['link', 'Reset link', /\{\{\s*(resetUrl|link)\s*\}\}|https?:\/\//i], ['expiry', 'Expiry stated', /expire|valid for|\{\{\s*expiresIn\s*\}\}/i], ['lock', 'A "this wasn\'t you" secure-my-account link', /wasn'?t you|secure your account|\{\{\s*lockUrl\s*\}\}/i]],
    starter: { subject: 'Reset your password', body: 'Hi {{firstName}},\n\nReset your password here: {{resetUrl}}\n\nThe link expires in 30 minutes. If this was not you, secure your account: {{lockUrl}}' } },
  receipt: { label: 'Receipt / invoice', def: 0.5, trigger: 'Every successful payment.', stream: 'transactional', legal: true, checks: [
    ['seller', 'Seller name and address', /\{\{\s*sellerAddress\s*\}\}|\b\d+\s+\w+\s+(street|st|ave|avenue|road|rd)\b/i, true], ['number', 'Sequential invoice number', /\{\{\s*invoiceNumber\s*\}\}|invoice (no|number|#)/i, true], ['date', 'Date', /\{\{\s*date\s*\}\}|date:/i], ['amount', 'Amount and what it was for', /\{\{\s*amount\s*\}\}/i], ['tax', 'Tax line (sales tax or VAT)', /\{\{\s*tax\s*\}\}|\bvat\b|sales tax|tax:/i, true], ['vatid', 'Seller VAT/tax ID (and the customer\'s for B2B)', /\{\{\s*vatId\s*\}\}|vat (id|number)|tax id/i, true], ['manage', 'Link to manage billing', /\{\{\s*billingUrl\s*\}\}|manage (your )?(billing|subscription)/i]],
    starter: { subject: 'Receipt for your payment', body: 'Receipt {{invoiceNumber}}, {{date}}\n\nSeller: {{sellerName}}, {{sellerAddress}} (VAT ID {{vatId}})\nCustomer: {{firstName}}\nDescription: {{plan}}\nAmount: {{amount}}\nTax: {{tax}}\nCard ending {{last4}}\n\nManage billing: {{billingUrl}}' } },
  trial_ending: { label: 'Trial-ending notice', def: 0, trigger: 'Before a trial converts to a paid charge. California: 3-21 days before; send day -7 and -1.', stream: 'transactional', legal: true, needsDays: [3, 21], checks: [
    ['date', 'Trial end date', /\{\{\s*trialEndDate\s*\}\}/i, true], ['amount', 'Amount and frequency charged', /\{\{\s*amount\s*\}\}.*(month|year|annual|monthly)|(month|year|annual|monthly).*\{\{\s*amount\s*\}\}/is, true], ['cancel', 'Online cancel link', /\{\{\s*cancelUrl\s*\}\}|cancel (online|here|anytime)/i, true]],
    starter: { subject: 'Your trial ends on {{trialEndDate}}', body: 'Hi {{firstName}},\n\nYour trial ends on {{trialEndDate}}. After that we will charge {{amount}} per month to your card.\n\nTo cancel before then, one click: {{cancelUrl}}' } },
  renewal_notice: { label: 'Renewal reminder', def: 0, trigger: 'Annual plans: 14-30 days before renewal, and any material price change.', stream: 'transactional', legal: true, needsDays: [7, 45], checks: [
    ['date', 'Renewal date', /\{\{\s*renewalDate\s*\}\}/i, true], ['amount', 'Amount charged', /\{\{\s*amount\s*\}\}/i, true], ['cancel', 'Online cancel link', /\{\{\s*cancelUrl\s*\}\}|cancel (online|here|anytime)/i, true]],
    starter: { subject: 'Your plan renews on {{renewalDate}}', body: 'Hi {{firstName}},\n\nYour annual plan renews on {{renewalDate}} for {{amount}}.\n\nWant to change or cancel it? {{cancelUrl}}' } },
  failed_payment: { label: 'Failed payment', def: 0, trigger: 'Payment failed. Pairs with the dunning sequence in Payments.', stream: 'transactional', checks: [
    ['amount', 'Amount', /\{\{\s*amount\s*\}\}/i], ['card', 'One-click update-card link', /\{\{\s*updateCardUrl\s*\}\}|update (your )?(card|payment)/i], ['end', 'Date access ends', /\{\{\s*accessEndDate\s*\}\}|access (ends|will end)/i]],
    starter: { subject: 'We could not charge your card', body: 'Hi {{firstName}},\n\nYour payment of {{amount}} did not go through. Update your card: {{updateCardUrl}}\n\nYour access ends on {{accessEndDate}} if it is not fixed.' } },
  security_alert: { label: 'Security alert', def: 0, trigger: 'New device, password or email change, API key created.', stream: 'transactional', checks: [
    ['when', 'Time, device and approximate location', /\{\{\s*(device|time|location)\s*\}\}/i], ['notme', 'A "not me" action', /not me|wasn'?t me|wasn'?t you|\{\{\s*lockUrl\s*\}\}/i]],
    starter: { subject: 'New sign-in to your account', body: 'We saw a sign-in from {{device}} near {{location}} at {{time}}.\n\nNot you? Lock your account: {{lockUrl}}' } },
};
export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/** Lint one template. Required items missing, promo inside a service email, wrong send timing. */
export function lintTemplate(id, { subject = '', body = '', sendDays = null } = {}) {
  const def = TEMPLATES[id];
  const text = `${subject}\n${body}`;
  let total = 0, got = 0;
  const missing = [], issues = [];
  for (const [key, label, re, legal] of def.checks) {
    const w = legal ? 2 : 1;
    total += w;
    if (re.test(text)) got += w; else missing.push({ key, label, legal: Boolean(legal) });
  }
  let q = total ? got / total : 1;
  const promo = promoRe.test(text);
  if (promo) { q -= 0.25; issues.push('Promotional content inside a service email can reclassify it as commercial mail (CAN-SPAM: opt-out duty, per-email penalty exposure) and drags it toward the Promotions tab.'); }
  if (id === 'magic_link' && /\b(24 hours|a day|7 days)\b/i.test(text)) { q -= 0.2; issues.push('A magic link valid for a day is a standing credential. 15-60 minutes, single use.'); }
  if (id === 'password_reset' && /password is|your password:/i.test(text)) { q -= 0.4; issues.push('Never put a password in an email.'); }
  if (def.needsDays) {
    const days = (sendDays ?? []).map(Number).filter(Number.isFinite);
    if (!days.some((d) => d >= def.needsDays[0] && d <= def.needsDays[1])) { q -= 0.3; issues.push(`Send timing ${days.length ? days.join(', ') : 'unset'} days before: California requires a trial/renewal notice ${def.needsDays[0]}-${def.needsDays[1]} days ahead (confirm current rules with counsel).`); }
  }
  if (!body.trim()) q = 0;
  return { q: clamp(q, 0, 1), missing, issues, promo, words: body.trim().split(/\s+/).filter(Boolean).length };
}

// ---- Slice ----
export function ensureTxn(state) {
  state.apps ??= {};
  const T = (state.apps.transactional ??= {});
  T.seed ??= state.seed | 0;
  T.provider ??= null;
  T.separate ??= false;
  T.auth ??= { spf: false, dkim: false, dmarc: false };
  T.dmarcPolicy ??= 'none'; T.dmarcSince ??= null;
  T.rep ??= 75;
  T.fallback ??= false; T.monitoring ??= false; T.feedbackWired ??= false;
  T.templates ??= {};
  for (const id of TEMPLATE_IDS) T.templates[id] ??= { id, status: TEMPLATES[id].def > 0 ? 'default' : 'missing', q: TEMPLATES[id].def, subject: '', body: '', sendDays: id === 'trial_ending' ? [7, 1] : id === 'renewal_notice' ? [30, 14] : [], legalChecked: false, changedDay: null, seedDay: null, liveDay: null, missing: [], issues: [] };
  T.seedTests ??= []; T.daily ??= []; T.events ??= []; T.mistakeDays ??= {}; T.pendingStream ??= [];
  T.stats ??= { lockoutTickets: 0, receiptTickets: 0, noticeMisses: 0, noticeConversions90: [], outageDays: 0, lostSignups: 0, disputes: 0, refunds: 0, blocked: 0, complaints30: [], sent30: [] };
  T.delivery ??= REF_DELIVERY; T.loss = 0; T.billId ??= null; T.outage ??= null; T.configuredDay ??= null;
  return T;
}
export const isConfigured = (state) => Boolean(state.apps?.transactional?.provider);
const today = (state) => state.day ?? 0;
const pushEvent = (T, e) => { T.events.push(e); if (T.events.length > 200) T.events.splice(0, T.events.length - 200); };

// ---- Volume, plan and bill ----
export function monthlyVolume(state) {
  const L = state.apps?.lifecycle;
  const t = today(state);
  const lifecycleTxn = (L?.daily ?? []).filter((d) => d.day > t - 30).reduce((a, d) => a + d.transactional, 0);
  const st = state.stripe;
  const receipts = (st?.charges ?? []).filter((c) => c.day > t - 30 && c.status === 'succeeded').length;
  return Math.round(lifecycleTxn + receipts);
}
export function planFor(state, T = ensureTxn(state), volume = monthlyVolume(state)) {
  const p = PROVIDERS[T.provider];
  if (!p) return { price: 0, name: 'none', volume };
  const tier = p.tiers.find((x) => volume <= x.max) ?? p.tiers.at(-1);
  const price = tier.per1k != null ? round2(tier.price + Math.max(0, volume - (tier.over ?? 0)) / 1000 * tier.per1k) : tier.price;
  return { ...tier, price: round2(price + (T.fallback ? TXN.fallbackUsd : 0)), volume };
}
function bill(state, T) {
  if (!T.provider) return;
  const p = planFor(state, T);
  let r = state.recurring?.find((x) => x.id === T.billId);
  if (!r) { r = addRecurring(state, { vendor: PROVIDERS[T.provider].label.split(' (')[0], amount: 0, category: 'software', dayOfMonth: 7, note: 'Transactional email' }); T.billId = r.id; }
  r.amount = p.price; r.note = `${PROVIDERS[T.provider].label} ${p.name} (${p.volume.toLocaleString('en-US')} emails / 30 days)`; r.active = p.price > 0;
}

// ---- Setup actions (UI charges the returned hoursCost) ----
const R = (ok, extra = {}) => ({ ok, hoursCost: 0, usdCost: 0, ...extra });
export function setProvider(state, id) {
  const T = ensureTxn(state);
  const p = PROVIDERS[id];
  if (!p) return R(false, { error: 'unknown provider' });
  if (T.provider === id) return R(true);
  const switching = Boolean(T.provider);
  T.provider = id;
  T.auth = { spf: false, dkim: false, dmarc: false }; T.dmarcPolicy = 'none'; T.dmarcSince = null; // new provider = new DKIM keys and SPF include
  T.feedbackWired = !p.needsWiring;
  T.configuredDay ??= today(state);
  if (switching) logMistake(state, { functionId: 'transactional_email', id: 'provider_switch', label: 'Switched transactional provider', app: 'transactional', cost: { hours: 1 }, detail: 'New provider, new DNS records, and mail lands in spam until the new records and reputation settle.', key: `switch:${today(state)}`, delayed: true });
  bill(state, T);
  return R(true, { hoursCost: p.setup * (switching ? 1.3 : 1) });
}
export function addRecord(state, rec) {
  const T = ensureTxn(state);
  if (!T.provider) return R(false, { error: 'Pick a provider first.' });
  if (!['spf', 'dkim', 'dmarc'].includes(rec)) return R(false, { error: 'unknown record' });
  T.auth[rec] = true;
  if (rec === 'dmarc') T.dmarcSince = today(state);
  return R(true, { hoursCost: TXN.dnsHours });
}
export function setDmarcPolicy(state, policy) {
  const T = ensureTxn(state);
  if (!T.auth.dmarc) return R(false, { error: 'Publish a DMARC record first.' });
  if (policy !== 'none' && today(state) - (T.dmarcSince ?? today(state)) < TXN.dmarcWaitDays) return R(false, { error: `Read 2-4 weeks of clean reports at p=none first (${TXN.dmarcWaitDays} days minimum).` });
  T.dmarcPolicy = policy;
  return R(true, { hoursCost: 0.5 });
}
/** Send transactional mail from its own subdomain (and its own reputation). */
export function separateStreams(state) {
  const T = ensureTxn(state);
  if (!T.provider) return R(false, { error: 'Pick a provider first.' });
  if (T.separate) return R(true);
  T.separate = true; T.auth = { spf: false, dkim: false, dmarc: false }; T.dmarcSince = null; T.rep = 75;
  return R(true, { hoursCost: TXN.subdomainHours });
}
export function setFallback(state, on) { const T = ensureTxn(state); if (!T.provider) return R(false, { error: 'Pick a provider first.' }); T.fallback = Boolean(on); bill(state, T); return R(true, { hoursCost: on ? TXN.fallbackHours : 0.25 }); }
export function setMonitoring(state, on) { const T = ensureTxn(state); if (!T.provider) return R(false, { error: 'Pick a provider first.' }); T.monitoring = Boolean(on); if (on) T.feedbackWired = true; return R(true, { hoursCost: on ? TXN.monitorHours : 0.25 }); }

export function saveTemplate(state, id, { subject, body, sendDays }) {
  const T = ensureTxn(state);
  const t = T.templates[id];
  if (!t) return R(false, { error: 'unknown template' });
  t.subject = String(subject ?? '').slice(0, 200); t.body = String(body ?? '').slice(0, 4000);
  if (sendDays) t.sendDays = sendDays.map(Number).filter(Number.isFinite);
  const l = lintTemplate(id, t);
  Object.assign(t, { draftQ: round2(l.q), missing: l.missing, issues: l.issues, status: t.status === 'live' ? 'live' : 'draft', changedDay: today(state), seedDay: t.status === 'live' ? null : t.seedDay });
  if (t.status === 'live') { t.q = round2(l.q); t.legalChecked = false; }
  return R(true, { hoursCost: TXN.templateHours, lint: l });
}
/** Publish a drafted template. Customer-facing: needs approved: true unless dryRun. */
export function publishTemplate(state, id, { approved = true, dryRun = false } = {}) {
  const T = ensureTxn(state);
  const t = T.templates[id];
  if (!t || !t.body.trim()) return R(false, { error: 'Write the template first.' });
  if (!dryRun && !approved) return R(false, { error: 'needs approval (customer-facing)' });
  if (dryRun) return R(true);
  const l = lintTemplate(id, t);
  Object.assign(t, { status: 'live', q: round2(l.q), liveDay: today(state), missing: l.missing, issues: l.issues });
  if (l.promo) logMistake(state, { functionId: 'transactional_email', id: 'promo_in_service_email', label: `Promotional content in the ${TEMPLATES[id].label} email`, app: 'transactional', cost: { hours: 3, usd: 0, reputation: 0.5 }, charge: true, delayed: true, detail: 'Mixed messages can be treated as commercial: opt-out duty and per-email penalty exposure. Each unlabelled borderline template costs a legal review when challenged.', key: `promo:${id}` });
  pushEvent(T, { id: `template_live:${id}:${today(state)}`, type: 'template_published', day: today(state), templateId: id });
  return R(true, { quality: t.q });
}
/** Pay a lawyer to check the legally sensitive templates. Clears heuristic false negatives. */
export function legalReview(state, id) {
  const T = ensureTxn(state);
  const t = T.templates[id];
  if (!t || !TEMPLATES[id].legal) return R(false, { error: 'Only receipt, trial-ending and renewal emails need a legal read.' });
  if (t.status !== 'live') return R(false, { error: 'Publish it first.' });
  t.legalChecked = true; t.q = round2(clamp(t.q + (t.missing.some((m) => m.legal) ? 0 : 0.1), 0, 1));
  post(state, { amount: -TXN.reviewUsd, counterparty: 'Startup counsel', description: `Legal read of the ${TEMPLATES[id].label} email`, category: 'legal', method: 'card' });
  return R(true, { hoursCost: TXN.reviewHours, usdCost: TXN.reviewUsd });
}
/** Send test mail to four mailboxes and read the headers. Required after template changes. */
export function seedTest(state, { dryRun = false } = {}) {
  const T = ensureTxn(state);
  if (!T.provider) return R(false, { error: 'Pick a provider first.' });
  if (dryRun) return R(true, { hoursCost: TXN.seedHours });
  const d = T.delivery;
  const box = (name, adj) => ({ name, inbox: round2(clamp(d + adj + (h01(`${ensureTxn(state).seed}|${name}|${today(state)}`) - 0.5) * 0.06, 0, 1)) });
  const res = [box('Gmail', 0.02), box('Outlook', -0.06), box('Yahoo', -0.01), box('iCloud', -0.03)];
  const r = { day: today(state), res, headers: { spf: T.auth.spf, dkim: T.auth.dkim, dmarc: T.auth.dmarc }, separate: T.separate };
  T.seedTests.unshift(r); if (T.seedTests.length > 12) T.seedTests.length = 12;
  for (const t of Object.values(T.templates)) if (t.status === 'live' && t.seedDay == null) t.seedDay = today(state);
  return R(true, { hoursCost: TXN.seedHours, result: r });
}

// ---- Deliverability ----
function authMult(a, policy) { return (a.spf ? 1 : 0.9) * (a.dkim ? 1 : 0.6) * (a.dmarc ? (policy === 'reject' ? 1.01 : 1) : 0.95); }
const repFactor = (rep) => (rep >= 60 ? 0.9 + 0.1 * (rep - 60) / 40 : 0.45 + 0.45 * (rep / 60));
/** Marketing-side reputation that a SHARED domain inherits (Lifecycle and the owned audience). */
export function marketingRep(state) {
  const L = state.apps?.lifecycle;
  const A = state.apps?.audience;
  const reps = [L?.domain?.reputation, A?.fromProductDomain === false ? null : A?.rep].filter((x) => x != null);
  return reps.length ? Math.min(...reps) : 75;
}
export function deliveryNow(state, T = ensureTxn(state)) {
  const p = PROVIDERS[T.provider];
  if (!p) return REF_DELIVERY;
  let auth = T.auth, policy = T.dmarcPolicy, rep = T.rep;
  if (!T.separate) {
    const L = state.apps?.lifecycle;
    if (L?.vendor) { auth = { spf: L.domain.spf, dkim: L.domain.dkim, dmarc: L.domain.dmarc }; } // one domain, one set of records
    rep = Math.min(rep, marketingRep(state));
  }
  let d = p.base * authMult(auth, policy) * repFactor(rep) * (T.fallback ? 1 : 1);
  if (T.outage && today(state) < T.outage.until) d *= T.fallback ? 0.9 : 0.3;
  return clamp(d, 0.02, 0.995);
}

/** Streams record sends / complaints from other modules (invites, newsletters). */
export function streamEvents(state, { stream = 'transactional', sent = 0, complaints = 0, bounces = 0 } = {}) {
  const T = ensureTxn(state);
  T.pendingStream.push({ stream, sent, complaints, bounces });
}

// ---- Daily ----
const ticket = (state, n, source) => { const sup = state.apps.support; if (n > 0 && sup?.active && Array.isArray(sup.queue)) sup.queue.push({ day: today(state), n, source }); return n; };
const sample = (state, mean) => { if (!(mean > 0)) return 0; const f = Math.floor(mean); return f + (chance(state, mean - f) ? 1 : 0); };
const tq = (T, id) => T.templates[id].q ?? 0;

export function txnDay(state) {
  const T = ensureTxn(state);
  const t = today(state);
  const L = ensureLifecycle(state);
  const st = ensureStripe(state);
  const mk = (id, payload) => {
    if (T.mistakeDays[id] != null && t - T.mistakeDays[id] < 30) return;
    T.mistakeDays[id] = t;
    logMistake(state, { functionId: 'transactional_email', app: 'transactional', id, ...payload });
  };
  if (!T.provider) { // nothing configured: the app's built-in defaults carry the benchmark baseline; Lifecycle behaves as before
    L.txn = null;
    return;
  }
  // 1. provider incidents (shared pools get a bad neighbour); a fallback provider absorbs them
  const pv = PROVIDERS[T.provider];
  if (!T.outage || t >= T.outage.until) T.outage = null;
  if (!T.outage && h01(`txnout|${ensureTxn(state).seed}|${T.provider}|${t}`) < pv.incidents / 365) {
    T.outage = { start: t, until: t + 1 + Math.floor(h01(`txnout2|${ensureTxn(state).seed}|${t}`) * 3) };
    pushEvent(T, { id: `provider_incident:${t}`, type: 'provider_incident', day: t, provider: T.provider });
    notify(state, `${pv.label} is having delivery problems (shared IP reputation). ${T.fallback ? 'Your fallback provider is carrying login mail.' : 'Login codes and receipts are delayed or in spam until it clears.'}`, { type: T.fallback ? 'warn' : 'bad', app: 'transactional' });
    if (!T.fallback) mk('no_fallback', { label: 'No fallback provider when login mail went down', cost: { customers: 2, hours: 2 }, charge: true, delayed: true, detail: 'A one-provider setup means a provider incident is a login outage. A stellar operator has a fallback for login codes.' });
  }
  // 2. streams: complaints and bounces from other modules, and own-stream drift
  let sentToday = 0, compToday = 0;
  for (const e of T.pendingStream.splice(0)) { if (e.stream === 'transactional') { sentToday += e.sent; compToday += e.complaints; } }
  const recentPromo = Object.values(T.templates).some((x) => x.status === 'live' && /promo/.test((x.issues ?? []).join(' ').toLowerCase()));
  compToday += (recentPromo ? 0.0008 : 0.00005) * Math.max(1, monthlyVolume(state) / 30);
  T.stats.complaints30.push({ day: t, c: compToday, s: sentToday + Math.max(1, monthlyVolume(state) / 30) });
  T.stats.complaints30 = T.stats.complaints30.filter((x) => x.day > t - 30);
  const c30 = T.stats.complaints30.reduce((a, x) => a + x.c, 0), s30 = T.stats.complaints30.reduce((a, x) => a + x.s, 0);
  T.complaintRate30 = s30 ? c30 / s30 : 0;
  const target = T.complaintRate30 >= 0.003 ? 20 : T.complaintRate30 >= 0.001 ? 55 : 85;
  const decay = T.monitoring ? 0.06 : 0.12; // alerts + auto-suppression slow the slide; unmonitored lists rot faster [design]
  T.rep = round2(T.rep + (target - T.rep) * (target < T.rep ? decay : 0.03));
  if (!T.feedbackWired) T.rep = round2(T.rep - 0.15); // SES without bounce/complaint wiring: nobody suppresses dead addresses
  // 3. delivery today
  const delivery = deliveryNow(state, T);
  T.delivery = delivery;
  const shared = !T.separate && L.vendor;
  // quota: free tiers have daily caps
  const plan = planFor(state, T);
  const dayVol = Math.max(1, monthlyVolume(state) / 30);
  const blockedShare = plan.dayCap && dayVol > plan.dayCap ? clamp((dayVol - plan.dayCap) / dayVol, 0, 0.8) : 0;
  if (blockedShare > 0) { T.stats.blocked++; mk('provider_quota_blocked', { label: `${PROVIDERS[T.provider].label} free tier cap hit: login mail blocked`, cost: { hours: 1, customers: 1 }, charge: true, detail: `${Math.round(dayVol)} emails a day against a ${plan.dayCap}/day free cap. Verification codes and receipts were dropped until you upgraded.` }); }
  // 4. who is affected today
  const newSubs = st.subscriptions.filter((s) => s.startDay === t).length;
  const authQ = (tq(T, 'verification') + tq(T, 'magic_link') + tq(T, 'password_reset')) / 3;
  const miss = clamp((REF_DELIVERY - delivery * (1 - blockedShare)) / REF_DELIVERY, 0, 0.6);
  const gain = clamp((delivery - REF_DELIVERY) / REF_DELIVERY * 0.3, 0, 0.03);
  const clarityLoss = clamp((0.55 - authQ) * 0.1, 0, 0.06); // vague, unclear login emails: people give up
  L.txn = { loss: clamp(miss + clarityLoss, 0, 0.6), gain, external: PROVIDERS[T.provider].shared !== true, separate: T.separate, delivery };
  const accounts = activeSubs(state).length;
  const tix = newSubs * (miss * 0.5 + 0.01 * (1.2 - authQ)) + accounts * 0.004 * (miss + 0.02);
  const lock = ticket(state, sample(state, tix), 'txn_lockout');
  T.stats.lockoutTickets += lock;
  T.stats.lostSignups += newSubs * miss;
  if (shared && delivery < 0.75 && marketingRep(state) < 60) mk('blast_hit_login_mail', { label: 'A marketing blast pushed login mail to spam', cost: { customers: Math.max(1, Math.round(newSubs * 0.3)), hours: 1.5, reputation: 1 }, charge: true, delayed: true, detail: `Marketing and transactional mail share one domain. Complaints from broadcasts pulled its reputation to ${Math.round(marketingRep(state))}; login codes now reach ~${Math.round(delivery * 100)}% of inboxes. Separate the streams.` });
  // 5. receipts
  const charges = st.charges.filter((c) => c.day === t && c.status === 'succeeded');
  const rec = T.templates.receipt;
  const rq = rec.q ?? 0.5;
  const rt = ticket(state, sample(state, charges.length * 0.05 * clamp(1.15 - rq, 0.05, 1.1) * (1 - 0.5 * clamp((delivery - 0.8) / 0.2, 0, 1))), 'txn_receipt');
  T.stats.receiptTickets += rt;
  if (charges.length && rec.missing?.some((m) => m.legal) && rec.status === 'live' && !rec.legalChecked && charges.some((c) => (st.customers.find((x) => x.id === c.customerId)?.country ?? 'US') !== 'US') && chance(state, 0.08)) {
    mk('invoice_missing_fields', { label: 'Receipts missing legally required invoice fields', cost: { hours: 2, usd: 150 }, charge: true, delayed: true, detail: `An international customer's accountant bounced the invoice: missing ${rec.missing.filter((m) => m.legal).map((m) => m.label.toLowerCase()).slice(0, 2).join(' and ')}. Retroactive fixes are expensive; EU invoices have mandatory content (Directive 2006/112/EC Art. 226, confirm with counsel).` });
    post(state, { amount: -150, counterparty: 'Bookkeeper', description: 'Re-issue non-compliant invoices', category: 'accounting', method: 'card' });
  }
  // 6. trial-ending and renewal notices: surprise charges become refunds, disputes and legal exposure
  const market = ensureMarket(state);
  const noticeOk = (id) => { const x = T.templates[id]; return x.status === 'live' && (x.q ?? 0) >= 0.6 && delivery >= 0.6; };
  const chargedToday = new Set(charges.map((c) => c.subId));
  for (const s of st.subscriptions) {
    if (!chargedToday.has(s.id) || s.store) continue; // App Store / Play send their own renewal notices
    // A card-required trial converting today, or an annual plan RENEWING today (paid before; the first purchase needs no
    // renewal notice). paidMonths is only bumped at period end, so it never marked a renewal on the first-paid day.
    const trialConv = s.firstPaidDay === t && s.trialEndDay != null && market.cardRequired;
    const annual = s.interval === 'year' && s.firstPaidDay != null && s.firstPaidDay < t;
    if (!trialConv && !annual) continue;
    const id = trialConv ? 'trial_ending' : 'renewal_notice';
    if (noticeOk(id)) continue;
    const weak = T.templates[id].status === 'live';
    T.stats.noticeMisses++;
    T.stats.noticeConversions90.push(t);
    const ch = st.charges.find((c) => c.subId === s.id && c.day === t && c.status === 'succeeded');
    if (ch && !s.pendingRefund && chance(state, weak ? 0.07 : 0.15)) { s.pendingRefund = { day: t + 1 + Math.floor(rng(state) * 5), chargeId: ch.id }; T.stats.refunds++; }
    else if (ch && chance(state, weak ? 0.015 : 0.04)) { st.disputes.push({ id: `dp_txn_${s.id}`, chargeId: ch.id, customerId: ch.customerId, day: t + 8 + Math.floor(rng(state) * 20), amount: ch.amount, status: 'scheduled', reason: 'subscription_canceled' }); T.stats.disputes++; }
    ticket(state, chance(state, 0.3) ? 1 : 0, 'txn_surprise_charge');
  }
  T.stats.noticeConversions90 = T.stats.noticeConversions90.filter((d) => d > t - 90);
  if (T.stats.noticeConversions90.length >= 8 && chance(state, 0.15)) {
    mk('auto_renewal_exposure', { label: 'Auto-renewal complaint: trials converted without a proper notice', cost: { usd: 4500, hours: 8, reputation: 1, customers: 1 }, charge: true, delayed: true, detail: `${T.stats.noticeConversions90.length} card-required trials converted in 90 days with no compliant notice. California\'s automatic renewal law and ROSCA apply to online subscriptions (the FTC click-to-cancel rule was vacated in July 2025; enforcement continues under ROSCA). A demand letter and a state complaint followed.` });
    post(state, { amount: -4500, counterparty: 'Consumer counsel', description: 'Auto-renewal demand letter response', category: 'legal', method: 'wire' });
  }
  // 7. failed-payment email and Stripe dunning
  const fp = T.templates.failed_payment;
  st.settings.dunningDelivery = round2(clamp((fp.status === 'live' ? 0.6 + 0.5 * (fp.q ?? 0) : 0.55) * (delivery / REF_DELIVERY), 0.25, 1.15));
  // 8. security alerts: missing alerts leave takeovers unnoticed
  const sa = T.templates.security_alert;
  if (sa.status !== 'live') ticket(state, sample(state, accounts * 0.0004), 'txn_account_takeover');
  // 9. untested edits break links
  for (const x of Object.values(T.templates)) {
    if (x.status === 'live' && x.changedDay != null && x.changedDay === t - 3 && x.seedDay == null && h01(`brk|${ensureTxn(state).seed}|${x.id}|${t}`) < 0.2) {
      x.q = round2(Math.max(0, (x.q ?? 0.5) - 0.3));
      mk('untested_template_broke', { label: `The ${TEMPLATES[x.id].label} email shipped untested and broke`, cost: { customers: Math.max(1, Math.round(newSubs * 1.5)), hours: 2 }, charge: true, delayed: true, detail: 'A link rendered wrong for three days. A seed test in four inboxes after each change catches this.' });
    }
  }
  // 10. weekly monitoring time
  if (T.monitoring && t % 7 === 1) { const f = state.founder; if (f.hoursPerWeek - f.hoursUsed >= TXN.weeklyHours) { f.hoursUsed += TXN.weeklyHours; (f.timeLog ??= []).push({ day: t, hours: TXN.weeklyHours, label: 'Email deliverability review' }); } else T.rep = round2(T.rep - 1); }
  // 11. marketing/transactional promo hidden in Promotions tab
  if (delivery < 0.7) pushEvent(T, { id: `deliverability_alert:${t}`, type: 'deliverability_alert', day: t, delivery: round2(delivery) });
  T.daily.push({ day: t, delivery: round2(delivery), rep: T.rep, lock, blocked: blockedShare }); if (T.daily.length > 200) T.daily.shift();
  bill(state, T);
}

// ---- Automations ----
export const txnEvents = (state, sinceDay = today(state) - 1) => (state.apps?.transactional?.events ?? []).filter((e) => e.day >= sinceDay);
export const TXN_ACTIONS = {
  run_seed_test(state, _a, { dryRun = false } = {}) { return seedTest(state, { dryRun }); },
  publish_template(state, { templateId } = {}, { dryRun = false, approved = false } = {}) { return publishTemplate(state, templateId, { approved, dryRun }); },
  set_fallback(state, { on = true } = {}, { dryRun = false } = {}) { return dryRun ? R(true, { hoursCost: TXN.fallbackHours }) : setFallback(state, on); },
};

// ---- Operator read (functionId transactional_email) ----
export function txnOperatorRead(state) {
  const T = state.apps?.transactional;
  if (!T?.provider) return { tier: 'unknown', evidence: [], coaching: ['Pick a transactional provider and send login mail from its own subdomain before you send your first marketing blast.'] };
  const live = Object.values(T.templates).filter((x) => x.status === 'live');
  const need = TEMPLATE_IDS.length;
  const coverage = live.length / need;
  const quality = live.length ? live.reduce((a, x) => a + (x.q ?? 0), 0) / live.length : 0;
  const authDone = ['spf', 'dkim', 'dmarc'].filter((k) => (T.separate || !state.apps?.lifecycle?.vendor ? T.auth[k] : state.apps.lifecycle.domain[k])).length / 3;
  const raw = 0.2 * coverage + 0.2 * quality + 0.2 * authDone + 0.2 * (T.separate ? 1 : 0) + 0.1 * (T.fallback ? 1 : 0) + 0.1 * (T.seedTests.length ? 1 : 0) + 0.05 * (T.monitoring ? 1 : 0) - 0.05 * clamp((state.mistakes ?? []).filter((m) => m.functionId === 'transactional_email').length, 0, 6);
  const score = shrink(clamp(raw, 0, 1), 6, 0.5, 2);
  const tier = tierFromScore(score);
  const evidence = [`${live.length} of ${need} required emails written and live (quality ${Math.round(quality * 100)}%)`, `Auth ${Math.round(authDone * 100)}% (SPF/DKIM/DMARC), ${T.separate ? 'transactional on its own subdomain' : 'marketing and login mail share one domain'}`, `Delivery ~${Math.round(T.delivery * 100)}% to the inbox, complaint rate ${(T.complaintRate30 * 100).toFixed(2)}%`, `${T.fallback ? 'Fallback provider on' : 'No fallback provider'}, ${T.seedTests.length ? `${T.seedTests.length} seed test(s)` : 'never seed-tested'}`];
  const coaching = [];
  if (!T.separate) coaching.push('Marketing blasts on the login domain pull login codes into spam. Give transactional mail its own subdomain and reputation.');
  if (T.templates.trial_ending.status !== 'live' && ensureMarket(state).cardRequired) coaching.push('Card-required trials need a trial-ending notice 3-21 days ahead; without one, surprise charges become refunds, disputes and legal exposure.');
  if (T.templates.failed_payment.status !== 'live') coaching.push('No failed-payment email means expired cards churn silently.');
  if (!T.seedTests.length) coaching.push('Seed-test every template change in Gmail, Outlook, Yahoo and iCloud.');
  if (tier !== 'stellar') coaching.push('What a stellar operator does: separate streams from day one, a registry of every required email with a legal check on receipts and trial notices, seed tests after each change, complaint alerts at 0.1% and a fallback provider for login codes.');
  return { tier, score: round2(score), raw: round2(clamp(raw, 0, 1)), n: live.length + 2, evidence, coaching };
}
