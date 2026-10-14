import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe, mrr } from '../public/core/stripe.js';
import { ensureMarket, churnBeforeRenewal } from '../public/core/market.js';
import { ensureCalendar } from '../public/core/calendar.js';
import { APPS as BASE } from '../public/apps/registry.js';
import success from '../public/apps/success.js';
import { CS, healthScore, churnMultFromHealth, renewalAcceptance, counterAsk, questionnaireHours, expansionAcceptance } from '../public/apps/success/model.js';
import { ensureSuccess, syncAccounts, proposeRenewal, acceptCounter, addAsk, workOnAsk, declineAsk, scheduleQbr, runQbr, pitchExpansion, subById } from '../public/apps/success/engine.js';
import { askPenalty } from '../public/apps/success/asks.js';
import { addContact, ensureDeal, closeWon, startProposal, hasSoc2 } from '../public/apps/sales/model.js';

const APPS = BASE.some((a) => a.id === 'success') ? BASE : [...BASE, success];

function fresh(model = 'ent', seed = 3) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'vc', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 200000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Reconciliation', status: 'shipped' }], bugs: [] };
  s.market.fit.product.score = 0.6;
  if (model === 'ent') s.plans[0].price = 24000;
  return s;
}

function winCustomer(s, i = 0, { annual = true } = {}) {
  const { contact } = addContact(s, { firstName: `Ana${i}`, lastName: 'Lee', email: `ana${i}@buyer${i}.com`, title: 'VP Operations', company: `Buyer ${i}`, domain: `buyer${i}.com` });
  const d = ensureDeal(s, { companyId: contact.companyId, contactId: contact.id, stage: 'qualified' });
  startProposal(s, d, { planId: s.plans[0].id, quantity: 2, annual });
  closeWon(s, d);
  syncAccounts(s);
  return { deal: d, sub: subById(s, d.subscriptionId), acct: ensureSuccess(s).accounts[d.subscriptionId] };
}

test('health score reacts to champion, QBRs, support and usage; feeds a churn multiplier', () => {
  const good = healthScore({ usage: 0.8, champion: 'active', qbrDaysAgo: 40, needsQbr: true, support: 0.95, touchDaysAgo: 10 });
  const bad = healthScore({ usage: 0.3, champion: 'left', qbrDaysAgo: null, needsQbr: true, support: 1.4, openAsks: 2, touchDaysAgo: 200 });
  assert.ok(good >= 75 && bad <= 30, `${good} ${bad}`);
  assert.ok(churnMultFromHealth(good) < 0.6 && churnMultFromHealth(bad) > 1.8);
  assert.ok(Math.abs(churnMultFromHealth(60) - 1) < 1e-9);
});

test('renewal acceptance follows research: 70–90% at ≤7% uplift, 50–70% at ≥15%', () => {
  const at5 = renewalAcceptance({ upliftPct: 0.05, health: 50 });
  const at15 = renewalAcceptance({ upliftPct: 0.15, health: 50 });
  assert.ok(at5 >= 0.7 && at5 <= 0.9, `${at5}`);
  assert.ok(at15 >= 0.5 && at15 <= 0.7, `${at15}`);
  assert.ok(renewalAcceptance({ upliftPct: 0.05, health: 25 }) < at5);
  assert.ok(renewalAcceptance({ upliftPct: 0.05, discountPct: 0.05, years: 2, health: 50 }) > renewalAcceptance({ upliftPct: 0.05, years: 2, health: 50 }));
  const c = counterAsk({ upliftPct: 0.05, health: 40, seed: 'x' });
  assert.ok(c.discountPct >= CS.negotiatedDiscount[0] && c.discountPct <= CS.negotiatedDiscount[1]);
  assert.equal(counterAsk({ upliftPct: 0.12, health: 60 }).upliftPct, 0.05);
});

test('security questionnaire hours: 20–40h first, 2–8h with a library, ~1–2h with SOC 2', () => {
  const first = questionnaireHours({ seed: 'a' });
  assert.ok(first >= 20 && first <= 40);
  const lib = questionnaireHours({ library: true, seed: 'a' });
  assert.ok(lib >= 2 && lib <= 8);
  assert.ok(questionnaireHours({ soc2: true }) <= 2);
  const s = fresh();
  s.apps.legal = { soc2: 'type1' };
  assert.ok(hasSoc2(s));
  s.apps.legal.soc2 = 'type1_in_progress';
  assert.ok(!hasSoc2(s));
  assert.ok(expansionAcceptance({ health: 80, hasOpportunity: true }) > 3 * expansionAcceptance({ health: 80 }));
});

test('closed-won CRM customers become accounts; health sets sub.csChurnMult that core reads', () => {
  const s = fresh();
  const { sub, acct } = winCustomer(s);
  assert.ok(acct && acct.champion === 'active');
  advance(s, 2, APPS);
  assert.ok(acct.health > 0 && sub.csChurnMult > 0);
  assert.equal(sub.churnMult, undefined, 'customer success never touches churnMult');
  const base = churnBeforeRenewal(s, { ...sub, csChurnMult: 1 });
  acct.champion = 'left';
  acct.drift = -0.25;
  acct.lastTouchDay = -300;
  advance(s, 1, APPS);
  assert.ok(sub.csChurnMult > 1.2, `csChurnMult ${sub.csChurnMult}`);
  assert.ok(churnBeforeRenewal(s, sub) > base);
});

test('renewal pipeline opens at T−90; agreed uplift is billed at renewal; multi-year locks the next one', () => {
  // Core fails ~3% of invoiced charges; use the first seed whose subscription is still live at T−89.
  let s, sub, acct;
  for (let seed = 3; seed < 20; seed++) {
    s = fresh('ent', seed);
    ({ sub, acct } = winCustomer(s));
    advance(s, sub.currentPeriodEnd - s.day - 89, APPS);
    if (sub.status === 'active') break;
  }
  const price0 = sub.price;
  assert.ok(acct.renewal && acct.renewal.status === 'open', 'renewal opened');
  // Force acceptance deterministically by retrying offers on fresh renewals isn't needed: accept the counter path if any.
  const r = proposeRenewal(s, acct, { upliftPct: 0.05, years: 2, discountPct: 0.03 });
  if (r.decision === 'counter') acceptCounter(s, acct);
  if (acct.renewal.status !== 'committed') { acct.renewal.status = 'committed'; acct.renewal.terms = { upliftPct: 0.05, discountPct: 0.03, years: 2 }; }
  const terms = acct.renewal.terms;
  advance(s, sub.currentPeriodEnd - s.day + 2, APPS);
  assert.equal(sub.status, 'active', 'committed renewal renews');
  assert.ok(Math.abs(sub.price - price0 * (1 + terms.upliftPct) * (1 - terms.discountPct)) < 1);
  assert.ok(sub.paidMonths >= 12 && sub.currentPeriodEnd > s.day + 300, 'renewed for another year');
  if (terms.years > 1) assert.ok(acct.multiYearUntil >= sub.currentPeriodEnd);
});

test('a walked-away unhealthy account is cancelled at period end', () => {
  let lost = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const s = fresh('ent', seed);
    const { sub, acct } = winCustomer(s);
    advance(s, sub.currentPeriodEnd - s.day - 85, APPS);
    if (!acct.renewal) { lost++; continue; } // first invoice failed and core already cancelled it
    acct.health = 20; acct.drift = -0.25; acct.champion = 'left';
    const r = proposeRenewal(s, acct, { upliftPct: 0.2 });
    if (['open', 'at_risk'].includes(acct.renewal.status) && r.decision !== 'accept') proposeRenewal(s, acct, { upliftPct: 0.2 });
    advance(s, 90, APPS);
    if (sub.status === 'canceled') lost++;
  }
  assert.ok(lost >= 8, `${lost}/25 lost`);
});

test('expansion via changePrice raises MRR; procurement asks cut deal odds until delivered', () => {
  const s = fresh('smb');
  s.plans[0].price = 99;
  const { sub, acct } = winCustomer(s, 0, { annual: false });
  const before = mrr(s);
  acct.expansion = { status: 'open', seats: 2, reason: 'test' };
  acct.health = 90;
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) { acct.expansion.status = 'open'; ok = pitchExpansion(s, acct, 2).ok; }
  assert.ok(ok);
  assert.ok(mrr(s) > before && sub.quantity >= 4);
  // Asks on a deal
  const e = fresh('ent');
  const { contact } = addContact(e, { firstName: 'Bo', email: 'bo@big.com', company: 'Big', domain: 'big.com' });
  const d = ensureDeal(e, { companyId: contact.companyId, contactId: contact.id, stage: 'qualified' });
  const a = addAsk(e, { kind: 'vpat', target: 'deal', refId: d.id, companyId: contact.companyId, dueDay: e.day + 30 });
  assert.ok(askPenalty(e, d.id) < 1);
  const cash = e.bank.accounts[0].balance;
  while (!workOnAsk(e, a, 8));
  assert.ok(e.bank.accounts[0].balance <= cash - CS.vpatAuditCost);
  assert.equal(askPenalty(e, d.id), 1);
  assert.ok(ensureSuccess(e).vpat);
  const b2 = addAsk(e, { kind: 'data_residency', target: 'deal', refId: d.id, companyId: contact.companyId });
  declineAsk(e, b2);
  assert.ok(askPenalty(e, d.id) < 1);
  const q = addAsk(e, { kind: 'security_questionnaire', target: 'deal', refId: d.id, companyId: contact.companyId });
  assert.ok(q.hours >= 20);
  while (!workOnAsk(e, q, 8));
  assert.ok(ensureSuccess(e).library);
});

test('QBRs go on the calendar; an unattended QBR hurts the account', () => {
  const s = fresh();
  const { acct } = winCustomer(s);
  const q = scheduleQbr(s, acct);
  const ev = ensureCalendar(s).events.find((x) => x.id === q.eventId);
  assert.equal(ev.app, 'success');
  assert.equal(ev.refId, q.id);
  const q2 = scheduleQbr(s, acct);
  advance(s, q.day - s.day, APPS);
  q.prepped = true;
  runQbr(s, q, { roi: true, exec: true });
  assert.equal(acct.lastQbrDay, s.day);
  const drift = acct.drift;
  advance(s, q2.day - s.day + 2, APPS);
  assert.equal(q2.status, 'missed');
  assert.ok(acct.drift < drift);
});

test('champions leave at a realistic rate and can be followed to their new company', async () => {
  const { followChampion } = await import('../public/apps/success/engine.js');
  let left = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = fresh('ent', seed);
    const { acct } = winCustomer(s);
    advance(s, 365, APPS);
    if (acct.championLeftDay != null) {
      left++;
      const lead = followChampion(s, acct);
      assert.ok(lead && s.apps.crm.inboundQueue.some((x) => x.contactId === lead.id && x.source === 'referral'));
    }
  }
  assert.ok(left >= 1 && left <= 10, `${left}/20 champions left in a year`);
});

test('competitors pitch your customers at renewal; offers are tied to the competitor’s strength', () => {
  let offers = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const s = fresh('ent', seed);
    s.apps.world = { rivals: [], active: [], pages: [], competitors: { offline: false, statusQuo: 'spreadsheets', statusQuoShare: 0.2, list: [{ id: 'rc_big', name: 'Dentrix Ledger', url: 'https://x', awareness: 0.8, marketShare: 0.5, fundingTotalUSD: 120e6, momentum: 'rising', strengths: [], weaknesses: [] }] } };
    const { sub, acct } = winCustomer(s);
    advance(s, sub.currentPeriodEnd - s.day - 88, APPS);
    if (acct.renewal?.competitorOffer) {
      offers++;
      assert.equal(acct.renewal.competitorOffer.name, 'Dentrix Ledger');
      assert.ok(acct.renewal.competitorOffer.discountPct >= 0.15 && acct.renewal.competitorOffer.discountPct <= 0.3);
    }
  }
  assert.ok(offers >= 6 && offers <= 28, `${offers}/30 offers`);
});
