// Helpdesk ticket-type flows (support/flows.js): one short targeted test per flow family. No long sims: cases are
// opened directly with forced facts (the truth the player has to find out), then handled the way four operators would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, createCustomer, subscribe, activeSubs } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { registerJob } from '../public/core/jobs.js';
import product from '../public/apps/product.js';
import customers from '../public/apps/customers.js';
import helpdesk, { ensureSupport, helpdeskEvents } from '../public/apps/helpdesk.js';
import insights from '../public/apps/insights.js';
import { productSlice } from '../public/apps/product/store.js';
import {
  TYPES, ensureFlows, openCase, handleCase, caseHours, rankActions, closeLoop, featureRequestLog, setOps, setAiScope, aiHandleCase, macroQuality, flowSignals, slaLimit, supportTier, isVip, disputeRatio, notifyRequesters,
} from '../public/apps/support/flows.js';
import { lastCharge } from '../public/apps/support/flow-lib.js';
import { flowScore } from '../public/apps/support/flowstats.js';
import { supportOperatorReader } from '../public/apps/support/operator.js';

const APPS = [product, customers, helpdesk, insights];
for (const app of APPS) for (const [type, h] of Object.entries(app.jobs ?? {})) registerJob(type, h);

function world(model = 'smb', n = 40, seed = 21) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 80000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Receipt collection for bookkeepers';
  s.apps.product = { features: [{ id: 'f1', title: 'Receipt requests by SMS', user: 'bookkeepers', problem: 'x', solution: 'SMS', acceptance: ['Given x when y then z'], status: 'shipped', shippedDay: 0, effortHours: 10, progressHours: 10 }], bugs: [] };
  for (let i = 0; i < n; i++) { const c = createCustomer(s, { name: `Cust${i} Doe`, email: `c${i}@x.com`, company: `Co${i}` }); subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 0 }); }
  ensureSupport(s).active = true;
  s.founder.hoursPerWeek = 5000; // hours are tracked separately in these tests
  return s;
}
const subs = (s) => activeSubs(s);
const mistakeIds = (s) => (s.mistakes ?? []).map((m) => m.id);
const usd = (s) => Math.round(s.mistakeTotals?.usd ?? 0);

// Four operators facing the same case.
function play(s, c, tier, i = 0) {
  const T = TYPES[c.type], rank = rankActions(s, c), req = T.required(c);
  const first = c.name.split(' ')[0];
  const grounded = `Hi ${first}, thanks for writing about ${c.company ?? 'your account'}. I checked the account history and the amount on the record, and here is exactly what I am doing and what changes. You will have the confirmation by tomorrow. Reply here if the steps do not match what you see.`;
  const cfg = {
    stellar: { action: rank[0].action, checks: T.checks.map(([id]) => id), text: grounded, tags: [T.tag], priority: c.priority, note: 'Decision made, promise given, next step noted.' },
    good: { action: rank[0].action, checks: req.slice(0, Math.ceil(req.length * 0.5)), text: grounded, tags: [T.tag] },
    average: { action: rank[i % 2 ? Math.min(1, rank.length - 1) : 0].action, checks: req.slice(0, Math.floor(req.length * 0.34)), text: 'Thanks for reaching out, we will look into this and get back to you soon.', tags: [] },
    mediocre: { action: rank.at(-1).action, checks: [], text: 'ok done', tags: [] },
  }[tier];
  return handleCase(s, c.id, cfg);
}

// ---- forced-truth case factory (the hidden facts the player must discover)
function mk(s, type, i, facts, extra = {}) {
  const all = ensureStripe(s).subscriptions;
  const sub = all[i % all.length];
  const ch = ensureStripe(s).charges.find((x) => x.customerId === sub.customerId);
  const base = {
    refund_request: { channel: 'web', chargeId: ch.id, amount: ch.amount, daysSince: 3, reason: 'changed_mind', inWindow: true },
    charged_after_cancel: { cause: 'forgot', chargeId: ch.id, amount: ch.amount, daysSince: 3 },
    invoice_vat: { need: 'vat_id', eu: true, mor: false },
    plan_change: { intent: 'cancel', reason: 'price', saveable: true },
    lockout_2fa: { fraud: false, role: 'member', pressure: 'urgent' },
    ownership_transfer: { legit: false, pressure: 'vip', personalEmail: true },
    security_report: { kind: 'real', severity: 'high', endpoint: 'invoices', demand: 300 },
    legal_request: { kind: 'fake_emergency' },
    bug_report: { issueId: null, title: 'CSV export times out', haveInfo: true, severity: 'medium' },
    feature_request: { text: 'an export to CSV' },
    integration_issue: { cause: 'our_bug' },
    data_wrong: { cause: 'sync_bug', backups: true },
    abusive_customer: { severity: 'abusive', valid: true },
    public_complaint: { venue: 'reddit', topic: 'charge', valid: true, reach: 'mid' },
  }[type];
  return openCase(s, type, type === 'security_report' ? null : sub, { facts: { ...base, ...facts }, channel: 'email', afterHours: false, ...extra });
}

const VARIANTS = [
  ['refund_request', { channel: 'apple' }], ['refund_request', { inWindow: false, reason: 'changed_mind', daysSince: 40 }], ['refund_request', {}],
  ['charged_after_cancel', { cause: 'cancel_failed' }], ['charged_after_cancel', {}],
  ['invoice_vat', {}], ['plan_change', {}], ['plan_change', { intent: 'downgrade' }],
  ['lockout_2fa', { fraud: true }], ['lockout_2fa', {}],
  ['ownership_transfer', {}], ['ownership_transfer', { legit: true }],
  ['security_report', {}], ['security_report', { kind: 'beg' }], ['legal_request', {}],
  ['bug_report', {}], ['feature_request', {}], ['integration_issue', {}], ['data_wrong', {}], ['abusive_customer', {}], ['public_complaint', {}],
];

test('operator tiers separate in every flow family: score, mistakes and cost (stellar > good > average > mediocre)', () => {
  const res = {};
  for (const tier of ['stellar', 'good', 'average', 'mediocre']) {
    const s = world('smb', 24, 21);
    let total = 0, n = 0;
    VARIANTS.forEach(([type, facts], i) => { const c = mk(s, type, i, facts); const r = play(s, c, tier, i); assert.ok(r.ok, `${type}: ${r.error}`); total += r.score; n++; });
    res[tier] = { score: total / n, mistakes: (s.mistakes ?? []).length, usd: usd(s) };
    // Consequences land later (cancels, disputes, fines): run the pending items due within ~60 days without a long sim.
    advance(s, 60, APPS);
    res[tier].mistakesAfter = (s.mistakes ?? []).length; res[tier].usdAfter = usd(s);
  }
  if (process.env.DBG) console.log(JSON.stringify(res));
  assert.ok(res.stellar.score > res.good.score && res.good.score > res.average.score && res.average.score > res.mediocre.score, JSON.stringify(res));
  assert.ok(res.stellar.score - res.mediocre.score > 0.4, 'a wide gap between stellar and mediocre');
  assert.ok(res.mediocre.mistakesAfter > res.stellar.mistakesAfter + 5, `mediocre play always costs: ${JSON.stringify(res)}`);
  assert.ok(res.mediocre.usdAfter > res.stellar.usdAfter && res.average.usdAfter >= res.good.usdAfter - 1, JSON.stringify(res));
  assert.ok(res.stellar.score < 1 + 1e-9);
});

test('billing: store refunds, windows, charged-after-cancel and cancel blocking have real consequences', () => {
  const s = world('b2c', 12);
  // Promising a store refund you cannot issue vs sending the store steps.
  // English-speaking customer: the customer's language hangs off uid order, which earlier tests in this file shift.
  const apple = mk(s, 'refund_request', 0, { channel: 'apple' }, { lang: 'en' });
  const right = handleCase(s, apple.id, { action: 'store_steps', checks: ['id_channel', 'reason_code'], text: `Hi Cust0, this was bought through the App Store, so only Apple can refund it: open reportaproblem.apple.com and request it there. I have cancelled the renewal on our side.`, tags: ['billing/refund'] });
  assert.ok(right.result.d === 1 && ['stellar', 'good'].includes(right.tier), right.tier);
  const promise = mk(s, 'refund_request', 1, { channel: 'google' });
  const wrong = handleCase(s, promise.id, { action: 'refund_full', text: 'Sure, refunded.' });
  assert.equal(wrong.effect, 'store_promise');
  assert.ok(mistakeIds(s).includes('refund_unkept_promise'));
  // Over-refunding outside the window without a cause teaches customers to ask.
  const leak = mk(s, 'refund_request', 2, { inWindow: false, reason: 'changed_mind', daysSince: 45 });
  const before = ensureStripe(s).refunds.length;
  handleCase(s, leak.id, { action: 'refund_full', text: 'Refunded, no problem.' });
  assert.equal(ensureStripe(s).refunds.length, before + 1, 'the refund really goes through Stripe');
  assert.ok(mistakeIds(s).includes('refund_leak') && ensureFlows(s).refundHabit === 1);
  // A cancel-path failure: refusing or blaming the customer becomes a dispute; admitting it files an issue in Product.
  const cac = mk(s, 'charged_after_cancel', 3, { cause: 'cancel_failed' });
  const r = handleCase(s, cac.id, { action: 'escalate_refund', checks: ['check_logs'], text: 'Cust3, you are right: your cancel did not apply. Refunded and cancelled.', tags: ['billing/cancel-failure'] });
  assert.ok(['stellar', 'good'].includes(r.tier));
  assert.ok(productSlice(s).bugs.some((b) => /Cancellations are not applied/.test(b.title)), 'cancel-path failure filed in Product');
  const blame = mk(s, 'charged_after_cancel', 4, { cause: 'cancel_failed' });
  assert.equal(handleCase(s, blame.id, { action: 'blame', text: 'You must have forgotten to cancel.' }).effect, 'denied');
  assert.ok(mistakeIds(s).includes('refund_wrongly_denied'));
  // Blocking a cancellation is a logged dark pattern.
  const plan = mk(s, 'plan_change', 5, { intent: 'cancel' });
  handleCase(s, plan.id, { action: 'block', text: 'Please call us to cancel.' });
  assert.ok(mistakeIds(s).includes('cancel_blocked'));
  // Good macros save time, wrong macros and unfilled fields hurt.
  const m = (body, f) => ({ id: `m_${Math.random()}`, name: 'x', body, for: f ?? null });
  assert.ok(macroQuality({ body: 'Hi {{first_name}}, your {{plan}} renewal of {{amount}} is refunded. Open Settings > Billing and click Cancel plan to stop future charges; reply here if it still shows active by Friday.' }) > 0.8);
  assert.ok(macroQuality({ body: 'Dear customer, we value your feedback and will get back to you.' }) < 0.3);
});

test('disputes: lapsing loses by default, contesting an own-error charge is a mistake, evidence wins, and the ratio trips network lines', () => {
  const s = world('smb', 30);
  const st = ensureStripe(s);
  const push = (i, reason = 'subscription_canceled') => { const ch = lastCharge(s, subs(s)[i].customerId); st.disputes.push({ id: `dp_t${i}`, chargeId: ch.id, customerId: ch.customerId, day: s.day, amount: ch.amount, status: 'scheduled', reason }); return `dp_t${i}`; };
  const a = push(0), b = push(1), c3 = push(2);
  advance(s, 1, APPS);
  const fl = ensureFlows(s);
  const cases = fl.cases.filter((c) => c.type === 'dispute');
  assert.equal(cases.length, 3);
  const byD = (id) => cases.find((c) => c.facts.disputeId === id);
  // Friendly fraud: contest with the evidence packet.
  const cA = byD(a); cA.facts.cause = 'friendly'; cA.facts.deviceAvailable = true;
  const ok = handleCase(s, cA.id, { action: 'contest', checks: ['usage_log', 'cancel_terms', 'receipt_reminder', 'device_match', 'customer_comm'], text: `Evidence for ${cA.name}: usage log, signup terms, receipt and device match are attached.`, tags: ['billing/dispute'] });
  assert.ok(ok.ok && st.disputes.find((d) => d.id === a).status === 'under_review' && st.disputes.find((d) => d.id === a).evidenceQuality >= 0.9);
  // Our own error: contesting is a logged mistake; accepting is right.
  const cB = byD(b); cB.facts.cause = 'our_error';
  assert.equal(handleCase(s, cB.id, { action: 'contest', checks: ['usage_log'], text: 'We contest this charge because the customer used the product.' }).effect, 'wrong_fight');
  assert.ok(mistakeIds(s).includes('dispute_wrong_fight'));
  // Ignored: the dispute lapses, the cardholder wins by default, and it is a logged mistake with the charge and fee.
  advance(s, 9, APPS);
  assert.equal(st.disputes.find((d) => d.id === c3).status, 'lost');
  assert.ok(mistakeIds(s).includes('dispute_missed'));
  assert.ok((s.mistakes ?? []).find((m) => m.id === 'dispute_missed').cost.usd >= 49 + 15);
  // The ratio: five-plus disputes in a month is over the (scaled) excessive line.
  for (let i = 3; i < 12; i++) push(i);
  advance(s, 8, APPS);
  const dr = disputeRatio(s, 30);
  assert.ok(dr.ratio > 0.015, `${dr.ratio}`);
  assert.equal(fl.network.level, 'excessive');
  assert.ok(mistakeIds(s).includes('dispute_ratio'));
});

test('account security: a social-engineered ownership transfer is a serious incident; verification blocks it; VIPs get no bypass', () => {
  const s = world('smb', 20);
  const fl = ensureFlows(s);
  const bad = mk(s, 'ownership_transfer', 0, { legit: false, pressure: 'vip' });
  const r = handleCase(s, bad.id, { action: 'transfer_now', text: 'Done, you are the owner now. Welcome.' });
  assert.equal(r.effect, 'takeover');
  assert.ok(mistakeIds(s).includes('unverified_handover'));
  assert.ok(s.apps.insights.tasks.some((t) => t.type === 'breach' && t.status === 'open'), 'a 72-hour breach duty is opened in Insights');
  assert.ok((s.mistakes.find((m) => m.id === 'unverified_handover').cost.usd) > 2000);
  assert.equal(fl.stats.takeovers, 1);
  // Same fraud, verified: blocked, and a stellar score.
  const bad2 = mk(s, 'ownership_transfer', 1, { legit: false, pressure: 'urgent' });
  const ok = handleCase(s, bad2.id, { action: 'hold_callback', checks: ['callback_owner', 'audit_log', 'hold_48h'], text: `Hi ${bad2.name.split(' ')[0]}, I cannot change the owner on a message. I have emailed the current owner on file; once they confirm, the transfer takes five minutes.`, tags: ['account/ownership'], priority: 'p2', note: 'Owner called back, said not them.' });
  assert.equal(ok.effect, 'blocked');
  assert.equal(ok.tier, 'stellar');
  assert.equal(fl.stats.takeoversBlocked, 1);
  // A genuine transfer approved on trust is a logged near miss (about 1 in 5 requests is fraud).
  const legit = mk(s, 'ownership_transfer', 2, { legit: true, pressure: 'none' });
  handleCase(s, legit.id, { action: 'transfer_now', text: 'Done.' });
  assert.ok((s.mistakes ?? []).filter((m) => m.id === 'unverified_handover').length === 2);
  // Lockout with a lost-2FA story and "we are a big customer": resetting on trust is a takeover; the checks block it.
  const l1 = mk(s, 'lockout_2fa', 3, { fraud: true, role: 'admin' });
  assert.equal(handleCase(s, l1.id, { action: 'reset_now', text: 'Reset.' }).effect, 'takeover');
  const l2 = mk(s, 'lockout_2fa', 4, { fraud: true, role: 'member' });
  assert.equal(handleCase(s, l2.id, { action: 'reset_after_verify', checks: ['email_on_file', 'second_factor_or_admin'], text: 'I need a recovery code or an admin approval first.' }).effect, 'blocked');
  assert.ok(mistakeIds(s).includes('unverified_reset'));
});

test('privacy: data-subject requests run on real clocks; verification, processors and billing matter; legal-request impostors are a breach', () => {
  const s = world('b2c', 20);
  const L = (s.apps.legal = { dsrs: [], done: {}, exposure: 0 });
  const dsr = (id, facts, regime = 'gdpr') => { const d = { id, type: facts.kind === 'deletion' ? 'deletion' : 'access', regime, name: `Person ${id}`, day: s.day, dueDay: s.day + (regime === 'ccpa' ? 45 : 30), status: 'open', facts }; L.dsrs.unshift(d); return d; };
  const d1 = dsr('d1', { kind: 'deletion', billingActive: true });
  const d2 = dsr('d2', { kind: 'access', complex: true });
  const d3 = dsr('d3', { kind: 'access', impostor: true });
  const d4 = dsr('d4', { kind: 'access' });
  advance(s, 1, APPS);
  const fl = ensureFlows(s);
  const cs = (d) => fl.cases.find((c) => c.facts.dsrId === d.id);
  assert.ok([d1, d2, d3, d4].every((d) => cs(d)));
  // Stellar deletion: verify, delete, processors, cancel billing, retention note.
  const r1 = handleCase(s, cs(d1).id, { action: 'fulfil', checks: ['verify_identity', 'log_clock', 'delete_prod', 'notify_processors', 'retention_note', 'cancel_billing'], text: `Hi Person d1, your account is deleted from production and our processors, billing is cancelled, and we keep only tax records for 7 years. Confirmation sent today.`, tags: ['privacy/dsr'], priority: 'p2', note: 'Deleted day 1, processors notified.' });
  assert.ok(['stellar', 'good'].includes(r1.tier) && d1.status === 'answered' && d1.worked === true);
  // Complex access request: the extension notice inside the first month keeps it open and moves the clock two months.
  const due0 = d2.dueDay;
  handleCase(s, cs(d2).id, { action: 'extend', checks: ['log_clock', 'verify_identity'], text: 'Your request is complex; as GDPR Article 12(3) allows I am extending the deadline by two months and will finish well before.' });
  assert.equal(d2.dueDay, due0 + 60); assert.equal(cs(d2).status, 'open');
  // Impostor request answered without identity verification: a breach.
  handleCase(s, cs(d3).id, { action: 'fulfil', checks: [], text: 'Here is your export.' });
  assert.ok(mistakeIds(s).includes('dsr_impostor') && s.apps.insights.tasks.some((t) => t.type === 'breach'));
  // Ignored request: lapses at day 31, logged, and the data-protection complaint follows.
  advance(s, 31, APPS);
  assert.equal(cs(d4).status, 'lapsed');
  assert.ok(mistakeIds(s).includes('dsr_missed'));
  // Closing in Legal without doing the work is flagged as a token answer.
  const d5 = dsr('d5', { kind: 'access' });
  advance(s, 1, APPS);
  d5.status = 'answered';
  advance(s, 1, APPS);
  assert.ok(mistakeIds(s).includes('dsr_token'));
  // A fake "detective" emergency request answered without verification is a breach.
  const lr = mk(s, 'legal_request', 0, { kind: 'fake_emergency' });
  assert.equal(handleCase(s, lr.id, { action: 'comply_now', text: 'Sending the logs now.' }).effect, 'leak');
  assert.ok(mistakeIds(s).includes('unverified_legal_request'));
});

test('security reports: real vs beg bounty; paying noise wastes money and attracts more, ignoring a real one ends in disclosure', () => {
  const s = world('smb', 20);
  const fl = ensureFlows(s);
  // Beg bounty paid.
  const beg = mk(s, 'security_report', 0, { kind: 'beg', demand: 300 });
  const cash0 = s.bank.accounts[0].balance;
  handleCase(s, beg.id, { action: 'pay_bounty', text: 'Thanks, paid.' });
  assert.ok(s.bank.accounts[0].balance <= cash0 - 300 && mistakeIds(s).includes('beg_bounty_paid') && fl.ops.begMagnetUntil > s.day);
  const beg2 = mk(s, 'security_report', 0, { kind: 'beg' });
  const good = handleCase(s, beg2.id, { action: 'dismiss', checks: ['severity_by_impact'], text: 'Thank you for the report. The headers you list do not expose user data, so there is no bounty, but please send a proof of concept if you find real impact.' });
  assert.ok(['stellar', 'good'].includes(good.tier));
  // Real report fixed in Product: no disclosure, the loop is closed.
  const real = mk(s, 'security_report', 0, { kind: 'real', severity: 'high' });
  const r = handleCase(s, real.id, { action: 'escalate_fix', checks: ['reproduce', 'severity_by_impact', 'credit_researcher'], text: 'Thank you: reproduced, rated high, fix in progress, I will credit you and agree a disclosure date.', tags: ['security/report'], priority: 'p1', note: 'IDOR on invoices, fix ETA 3 days.' });
  assert.ok(['stellar', 'good'].includes(r.tier) && real.status === 'linked');
  const bug = productSlice(s).bugs.find((b) => b.id === real.issueId);
  assert.ok(bug && bug.security);
  bug.fixedDay = s.day + 1;
  advance(s, 2, APPS);
  assert.equal(real.status, 'notify');
  assert.ok(closeLoop(s, real.id).ok);
  // Real report dismissed as a beg bounty: disclosure follows with no reply.
  const real2 = mk(s, 'security_report', 0, { kind: 'real', severity: 'critical' });
  handleCase(s, real2.id, { action: 'dismiss', text: 'Not a vulnerability, no bounty.' });
  assert.ok(mistakeIds(s).includes('real_vuln_ignored'));
  advance(s, 45, APPS);
  assert.ok(ensureFlows(s).stats.viral >= 1 || mistakeIds(s).includes('viral_complaint'), 'the researcher went public');
});

test('product: bug reports link to the tracker and close the loop; feature requests aggregate votes, broken promises cost', () => {
  const s = world('smb', 20);
  const slice = productSlice(s);
  slice.bugs.push({ id: 'bug_x', title: 'CSV export times out', hours: 4, progress: 0, severity: 'medium', foundDay: 0, fixedDay: null, triage: false });
  const c1 = mk(s, 'bug_report', 0, { issueId: 'bug_x', title: 'CSV export times out' });
  const r = handleCase(s, c1.id, { action: 'link_issue', checks: ['search_issues'], text: 'Cust0, this is a known export timeout on large accounts. I linked your report to the issue; workaround: export in two date ranges. I will tell you when it ships.', tags: ['product/bug'] });
  assert.ok(['stellar', 'good'].includes(r.tier) && c1.status === 'linked' && slice.bugs.find((b) => b.id === 'bug_x').reports === 2);
  // A duplicate issue filed without searching is wasted tracker work.
  const c2 = mk(s, 'bug_report', 1, { issueId: 'bug_x' });
  const before = slice.bugs.length;
  assert.equal(handleCase(s, c2.id, { action: 'file_issue', text: 'Filed a new issue.' }).effect, 'dup');
  assert.equal(slice.bugs.length, before + 1);
  assert.ok(slice.bugs.at(-1).dupOf === 'bug_x');
  // Fixed -> tell the customer; if you do not, it is a logged missed loop.
  slice.bugs.find((b) => b.id === 'bug_x').fixedDay = s.day;
  advance(s, 1, APPS);
  assert.equal(c1.status, 'notify');
  assert.ok(helpdeskEvents(s, 0).some((e) => e.type === 'issue_fixed' && e.caseId === c1.id));
  advance(s, 4, APPS);
  assert.ok(mistakeIds(s).includes('loop_not_closed'));
  // Feature requests: searching the log adds votes to one entry; skipping the search fragments them. Promises are held to.
  const fr = (i, checks, action = 'log_status') => { const c = mk(s, 'feature_request', i, { text: 'a Slack integration' }); handleCase(s, c.id, { action, checks, text: 'Thanks, logged with your account; no date promised.' }); return c; };
  fr(2, ['search_board', 'record_mrr']); fr(3, ['search_board', 'record_mrr']); fr(4, ['search_board', 'record_mrr']);
  const log = featureRequestLog(s);
  assert.equal(log.length, 1); assert.equal(log[0].votes, 3); assert.ok(log[0].mrr >= 147 - 1);
  fr(5, []); fr(6, []); fr(8, []); fr(9, []); // no search: each one is logged again 60% of the time
  assert.ok(ensureFlows(s).requests.length >= 2, 'unsearched requests fragment the votes');
  const promised = mk(s, 'feature_request', 7, { text: 'dark mode' });
  handleCase(s, promised.id, { action: 'promise_date', checks: ['record_mrr'], text: 'We will ship dark mode in two months.' });
  advance(s, 62, APPS);
  assert.ok(ensureFlows(s).requests.find((q) => q.text === 'dark mode').promised[0].broken, 'a missed promise is recorded');
  // Shipping a requested feature opens the loop-closing action.
  s.apps.product.features.push({ id: 'f2', title: 'Slack integration for alerts', status: 'shipped', shippedDay: s.day });
  advance(s, 1, APPS);
  const slack = ensureFlows(s).requests.find((q) => q.text === 'a Slack integration' && !q.dupOf);
  assert.equal(slack.status, 'shipped');
  assert.ok(notifyRequesters(s, slack.id).ok);
});

test('ops: macros, chat, after-hours, languages, plan tiers, VIPs, abusive customers and public complaints cost or save as researched', () => {
  const s = world('smb', 30);
  const fl = ensureFlows(s), sup = ensureSupport(s);
  // Macros: a good matching macro saves ~30% of the time; a wrong macro or unfilled fields is logged.
  sup.macros.push({ id: 'mac_good', name: 'Refund done', body: 'Hi {{first_name}}, I refunded {{amount}} on your {{plan}} plan today. Open Settings > Billing to confirm; reply here by Friday if it does not show.', for: 'billing', quality: 0.9 });
  sup.macros.push({ id: 'mac_bad', name: 'Login help', body: 'Dear customer, we value your feedback. Your {{plan_name}} will be handled as per our policy.', for: 'account' });
  const c = mk(s, 'refund_request', 0, {});
  const plain = caseHours(s, c, { action: 'refund_full', text: 'Hi Cust0, I refunded your payment of the amount on the record today. Open Settings and check Billing; reply here by Friday if it does not show up in your bank.' });
  const withMacro = caseHours(s, c, { action: 'refund_full', macroId: 'mac_good' });
  assert.ok(withMacro < plain * 0.8, `${withMacro} vs ${plain}`);
  const wrong = mk(s, 'refund_request', 1, {});
  handleCase(s, wrong.id, { action: 'refund_full', macroId: 'mac_bad' });
  assert.ok(mistakeIds(s).includes('wrong_macro'));
  // Chat costs more per case and a daily coverage block; an unanswered chat falls back to email in a worse mood.
  const email = mk(s, 'plan_change', 2, { intent: 'downgrade' });
  const chatC = mk(s, 'plan_change', 3, { intent: 'downgrade' }); chatC.channel = 'chat';
  assert.ok(caseHours(s, chatC, { action: 'downgrade_renewal', text: 'x' }) > caseHours(s, email, { action: 'downgrade_renewal', text: 'x' }) * 1.2);
  setOps(s, { chat: true });
  chatC.dueDay = s.day;
  advance(s, 1, APPS);
  assert.ok(s.founder.timeLog.some((t) => /live chat coverage/.test(t.label)) && chatC.channel === 'email' && chatC.chatMissed);
  setOps(s, { chat: false });
  // After hours: no coverage means a P1 waits until morning; a pager answers in ~1 h but costs time and energy.
  const p1 = mk(s, 'charged_after_cancel', 4, {}); p1.afterHours = true;
  const none = handleCase(s, p1.id, { action: 'refund_cancel', checks: ['check_logs'], text: 'Refunded and cancelled today for your account.' });
  assert.ok(none.result.waited >= 14 && none.result.breached);
  setOps(s, { afterHours: 'pager' });
  const p2 = mk(s, 'charged_after_cancel', 5, {}); p2.afterHours = true;
  const e0 = s.founder.energy;
  const paged = handleCase(s, p2.id, { action: 'refund_cancel', checks: ['check_logs'], text: 'Refunded and cancelled today for your account.' });
  assert.ok(paged.result.waited <= 1.1 && paged.hours > none.hours && s.founder.energy < e0);
  // Languages: unreviewed machine translation mangles money terms far more than reviewed; English-only lowers CSAT.
  const rate = (policy) => { setOps(s, { langPolicy: policy }); let bad = 0; for (let i = 0; i < 120; i++) { const k = mk(s, 'refund_request', i % 30, {}); k.lang = 'de'; const r = handleCase(s, k.id, { action: 'refund_partial', checks: ['id_channel', 'check_window', 'reason_code'], text: 'Hi, a partial refund of half the amount was issued today for your account. You will see it in about five days.' }); if (r.result.mtError) bad++; } return bad; };
  const machine = rate('machine'), reviewed = rate('reviewed');
  assert.ok(machine > reviewed + 4, `machine ${machine} vs reviewed ${reviewed}`);
  assert.ok(mistakeIds(s).includes('mistranslation'));
  // Tiers and VIPs: SLA by plan; VIPs get half the target and the same verification.
  const sub = subs(s)[0];
  assert.equal(supportTier(sub), 'starter');
  sub.price = 400; assert.equal(supportTier(sub), 'enterprise');
  assert.ok(isVip(s, sub));
  const vipCase = mk(s, 'lockout_2fa', 0, {});
  assert.equal(slaLimit(vipCase), 0.5, 'enterprise P2 1 h, halved for a VIP');
  // Abusive customer: abrupt firing creates a dispute/public risk; ignoring an abusive one drains hours monthly.
  const ab = mk(s, 'abusive_customer', 8, { severity: 'abusive' });
  handleCase(s, ab.id, { action: 'fire_abrupt', text: 'Account cancelled.' });
  assert.ok(mistakeIds(s).includes('fired_badly'));
  const ab2 = mk(s, 'abusive_customer', 9, { severity: 'abusive' });
  handleCase(s, ab2.id, { action: 'argue', text: 'Our policy is clear.' });
  assert.ok(fl.drain.some((d) => d.caseId === ab2.id));
  const used0 = s.founder.hoursUsed;
  advance(s, 31, APPS);
  assert.ok(s.founder.timeLog.some((t) => /abusive customer/.test(t.label)));
  void used0;
  // Public complaints: a fast, private-routing reply after fixing the cause rarely spreads; defending or deleting does.
  const viral = (action, checks) => { const before = fl.stats.viral; for (let i = 0; i < 40; i++) { const k = mk(s, 'public_complaint', i % 30, { venue: 'reddit', topic: 'charge', valid: true }); handleCase(s, k.id, { action, checks, text: 'We are sorry: we found your account, fixed the charge and emailed you privately.' }); } return fl.stats.viral - before; };
  const calm = viral('ack_private', ['find_account', 'fix_first']), defensive = viral('defensive', []), deleted = viral('delete_report', []);
  assert.ok(defensive > calm + 3 && deleted > calm + 3, `calm ${calm} defensive ${defensive} deleted ${deleted}`);
});

test('AI agent scope: left at the vendor default it approves fraud, refunds and data requests; scoped off it does not', () => {
  const run = (scope) => {
    const s = world('smb', 40, 33);
    s.apps.support.ai.status = 'live'; s.apps.support.ai.liveDay = 0;
    if (scope) for (const t of ['ownership_transfer', 'refund_request', 'security_report']) setAiScope(s, t, scope);
    let takeovers = 0, wrong = 0;
    for (let i = 0; i < 30; i++) {
      const c = mk(s, 'ownership_transfer', i, { legit: false });
      if ((ensureFlows(s).aiScope[c.type] ?? 'auto') === 'auto') aiHandleCase(s, c);
      const r = mk(s, 'refund_request', i, { inWindow: false, reason: 'abuse', daysSince: 50 });
      if ((ensureFlows(s).aiScope[r.type] ?? 'auto') === 'auto') aiHandleCase(s, r);
      const u = mk(s, 'plan_change', i, { intent: 'downgrade' });
      if ((ensureFlows(s).aiScope[u.type] ?? 'auto') === 'auto') aiHandleCase(s, u);
    }
    takeovers = ensureFlows(s).stats.takeovers; wrong = ensureFlows(s).stats.aiWrong;
    return { takeovers, wrong, ids: mistakeIds(s), open: ensureFlows(s).cases.filter((c) => c.status === 'open').length, usd: usd(s) };
  };
  const dflt = run(null), off = run('off');
  assert.ok(dflt.takeovers >= 5, `vendor default lets fraud through: ${dflt.takeovers}`);
  assert.ok(dflt.ids.includes('ai_flow_wrong') && dflt.ids.includes('ai_flow_scope'));
  assert.equal(off.takeovers, 0);
  assert.ok(off.open >= 60 && off.usd < dflt.usd, 'off keeps the decisions with a human');
  // Safe types stay safe: plan changes through the agent are almost always right.
  const s = world('smb', 40, 5);
  s.apps.support.ai.status = 'live';
  let w = 0; for (let i = 0; i < 40; i++) { const c = mk(s, 'plan_change', i, { intent: 'downgrade' }); aiHandleCase(s, c); if (c.ai.wrong) w++; }
  assert.ok(w <= 6, `${w}`);
});

test('typed cases arrive at researched shares by model and feed Automations events and the support operator reader', () => {
  const s = world('smb', 100, 7);
  s.apps.insights = s.apps.insights ?? {};
  advance(s, 60, APPS);
  const fl = ensureFlows(s);
  const by = {}; for (const c of fl.cases) by[c.type] = (by[c.type] ?? 0) + 1;
  const total = fl.cases.length;
  // ~0.25-0.6 tickets per SMB customer a month; about a third become typed cases (research shares [design]).
  assert.ok(total >= 12 && total <= 90, `${total} ${JSON.stringify(by)}`);
  assert.ok((by.plan_change ?? 0) >= 1 && ((by.bug_report ?? 0) + (by.feature_request ?? 0) + (by.integration_issue ?? 0)) >= 1, JSON.stringify(by));
  const types = new Set(helpdeskEvents(s, 0).map((e) => e.type));
  assert.ok(types.has('case_created'));
  // New event types for Automations exist in the catalog.
  const dsrW = openCase(s, 'dsr', subs(s)[0], { facts: { dsrId: 'x', kind: 'access', regime: 'gdpr', dueDay: s.day + 5, name: 'Sam' }, dueDay: s.day + 5 });
  assert.ok(helpdeskEvents(s, s.day).some((e) => e.type === 'dsr_due_soon' && e.caseId === dsrW.id));
  // Reader: neglect vs diligence on the same cases.
  const read = (tier) => {
    const w = world('smb', 60, 9);
    advance(w, 15, APPS);
    for (let i = 0; i < 14; i++) { const v = VARIANTS[i]; const c = mk(w, v[0], i, v[1]); play(w, c, tier, i); }
    advance(w, 20, APPS);
    return { fs: flowScore(w)?.score, sig: flowSignals(w), reader: supportOperatorReader(w) };
  };
  const st = read('stellar'), me = read('mediocre');
  assert.ok(st.fs > me.fs + 0.25, `${st.fs} vs ${me.fs}`);
  assert.ok(st.sig.n >= 10 && st.sig.tagRate > 0.8 && me.sig.tagRate < 0.2, `${st.sig.tagRate} ${me.sig.tagRate}`);
});

test('Helpdesk renders the Cases tab, a case form, a handled case, and the Support ops tab without errors', () => {
  const s = world('smb', 20);
  const c = mk(s, 'ownership_transfer', 0, { legit: false });
  const d = mk(s, 'refund_request', 1, {});
  handleCase(s, d.id, { action: 'refund_full', text: 'Refunded.' });
  ensureSupport(s).macros.push({ id: 'm1', name: 'Hello', body: 'Hi {{first_name}}, your {{plan}} is sorted: open Settings and check Billing by Friday.' });
  const ctx = { state: s, save() {}, act() {}, render() {}, navigate() {}, llm: null };
  for (const params of ['cases', 'ops', c.id, d.id]) {
    const root = { innerHTML: '', addEventListener() {} };
    helpdesk.render(root, { ...ctx, params });
    assert.ok(root.innerHTML.length > 800, params);
    if (params === c.id) assert.ok(/caseForm/.test(root.innerHTML) && /callback_owner|current owner/.test(root.innerHTML) && !/legit/i.test(root.innerHTML.replace(/legitimate/gi, '')), 'the hidden truth is not shown');
    if (params === d.id) assert.ok(/Handled/.test(root.innerHTML));
    if (params === 'ops') assert.ok(/What the AI agent may decide/.test(root.innerHTML) && /Saved replies/.test(root.innerHTML));
  }
});
