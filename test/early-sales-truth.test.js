// Prospects, customers' requests and outside opinions grounded in the hidden market truth. Short, targeted (seconds).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../public/core/stripe.js';
import { ensureMarket, mainPlan } from '../public/core/market.js';
import { truthOf, painStrength } from '../public/core/truth.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { addContact, ensureDeal, ensureCrm } from '../public/apps/sales/model.js';
import { personaFor, replyProbability, positiveShare, replyKind, fallbackColdReply } from '../public/apps/sales/replies.js';
import { personForContact, segmentForContact } from '../public/apps/sales/truth-persona.js';
import { qualifyProbability, closeProbability } from '../public/apps/sales/deals.js';
import * as PS from '../public/apps/sales/presell.js';
import { requestFor, logRequest, requestsBuildDay, requestLog } from '../public/apps/customers/requests.js';
import { customersSlice, productSlice, researchSlice } from '../public/apps/product/store.js';
import { captureOpinion, tagAsValidation, opinionCitationsDay, opinions } from '../public/apps/sales/fake-signals.js';

function fresh(seed = 5) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s).flags = { fixedDemand: 1 }; seedDefaultStack(s);
  post(s, { amount: 2e6, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = 'Invoice reminders for plumbers and HVAC contractors';
  s.company.icp = '';
  return s;
}
const segs = (s) => truthOf(s).segments;
const strongest = (s) => segs(s).find((g) => g.id === truthOf(s).bestSegmentId);
const weakest = (s) => segs(s).slice().sort((a, b) => painStrength(a) - painStrength(b))[0];
let n = 0;
function add(s, industry, { warm = false, title = 'Owner' } = {}) {
  n++;
  const { contact, company } = addContact(s, { firstName: `P${n}`, lastName: 'X', email: `p${n}@co${n}.com`, title, company: `Co ${n}`, domain: `co${n}.com`, industry }, { source: 'network', warm });
  return { contact, company };
}
const painShare = (s, list) => list.filter(({ contact, company }) => personForContact(s, contact, company).hasPain).length / list.length;

test('the same contact has the same person facts in sales (persona), presell and research (personForContact)', () => {
  const s = fresh();
  const { contact, company } = add(s, strongest(s).keywords[0]);
  assert.equal(segmentForContact(s, contact, company).split(':')[0], strongest(s).id.split(':')[0], 'industry maps to its TRUE segment (any size band)');
  const a = personForContact(s, contact, company);
  const b = personForContact(s, contact, company);
  assert.deepEqual(a, b);
  const p = personaFor(s, contact, company);
  assert.equal(p.hasPain, a.hasPain);
  assert.equal(p.segmentId, a.segmentId);
  assert.equal(p.person.idiosyncraticAsk, a.idiosyncraticAsk);
  const deal = ensureDeal(s, { companyId: company.id, contactId: contact.id, source: 'network', stage: 'meeting_held' });
  const offer = PS.createOffer(s, { title: 'Reminders', description: 'x'.repeat(40), price: 50, startDay: s.day + 30 });
  PS.hiddenIntent(s, deal, offer);
  assert.equal(personaFor(s, contact, company).hasPain, a.hasPain, 'presell does not re-roll the person');
});

test('warm intros raise reply rates and politeness, not pain', () => {
  const s = fresh(9);
  const industry = strongest(s).keywords[0];
  const list = Array.from({ length: 150 }, () => add(s, industry));
  const coldShare = painShare(s, list);
  const coldPol = personForContact(s, list[0].contact, list[0].company).politeness;
  for (const { contact } of list) contact.warm = true;
  assert.equal(painShare(s, list), coldShare, 'same people, same pain whether warm or cold');
  assert.ok(personForContact(s, list[0].contact, list[0].company).politeness > coldPol + 0.2);
  const base = { stepIndex: 0, quality: 0.6, fit: 0.5, contact: {} };
  assert.ok(replyProbability({ ...base, tier: 'warm' }) > 3 * replyProbability({ ...base, tier: 'generic' }), 'warm tier replies more');
  // warm no-pain people are politer ("curious") but never "interested"
  assert.equal(replyKind(0.9, 0.1, 0.01, false), 'curious');
  assert.ok(positiveShare({ tier: 'warm', pain: false, politeness: 0.6 }) < positiveShare({ tier: 'warm', pain: true }));
});

test('same copy: the strong segment has far more pain, qualifies and closes far more than a weak one', () => {
  const s = fresh(12);
  const hi = Array.from({ length: 120 }, () => add(s, strongest(s).keywords[0]));
  const lo = Array.from({ length: 120 }, () => add(s, weakest(s).keywords[0]));
  const stat = (list) => {
    let pain = 0, q = 0, c = 0;
    for (const { contact, company } of list) {
      const p = personaFor(s, contact, company);
      pain += p.hasPain;
      q += qualifyProbability({ quality: 0.7, hasPain: p.hasPain, intensity: p.intensity });
      c += closeProbability({ acv: 948, quality: 0.7, budgetRatio: p.budgetMonthly / 79, hasPain: p.hasPain, intensity: p.intensity });
    }
    return { pain: pain / list.length, q: q / list.length, c: c / list.length };
  };
  const H = stat(hi), L = stat(lo);
  assert.ok(H.pain > 3 * L.pain, `pain ${H.pain} vs ${L.pain}`);
  assert.ok(H.q > 2 * L.q, `qualify ${H.q} vs ${L.q}`);
  assert.ok(H.c > 2.5 * L.c, `close ${H.c} vs ${L.c}`);
});

test('fallback replies never claim pain for a persona without it', () => {
  const s = fresh(3);
  let checked = 0;
  for (let i = 0; i < 80; i++) {
    const { contact, company } = add(s, i % 2 ? weakest(s).keywords[0] : strongest(s).keywords[0], { warm: i % 3 === 0 });
    const persona = personaFor(s, contact, company);
    if (persona.hasPain) continue;
    for (const kind of ['interested', 'curious', 'objection', 'not_now']) {
      const text = fallbackColdReply(kind, { persona, company, sender: 'Pat', seed: contact.email });
      assert.ok(!text.includes(persona.pain) && !/timing is decent|actually relevant/.test(text), `${kind}: ${text}`);
      checked++;
    }
  }
  assert.ok(checked > 40);
});

test('presell commitments track true WTP against the price, authority and pain', () => {
  const run = (price) => {
    const s = fresh(21);
    const deals = Array.from({ length: 60 }, () => {
      const { contact, company } = add(s, strongest(s).keywords[0], { warm: true });
      return { d: ensureDeal(s, { companyId: company.id, contactId: contact.id, source: 'network', stage: 'meeting_held' }), contact, company };
    });
    const offer = PS.createOffer(s, { title: 'Reminders', description: 'Sends payment reminders so you stop chasing invoices by hand and cut late payments by half, with no spreadsheets at all.', price, startDay: s.day + 30 });
    let committed = 0;
    for (const { d, contact, company } of deals) {
      const a = PS.askForCommitment(s, { offerId: offer.id, dealId: d.id, level: 'loi' });
      const p = personaFor(s, contact, company);
      if (a.outcome === 'committed') { committed++; assert.ok(p.hasPain, 'no commitment from a person without the problem'); }
      if (a.outcome === 'polite' && p.hasPain) assert.ok(a.statedWtp >= p.wtpTrue * 0.5, `stated yes is inflated talk ${a.statedWtp} vs ${p.wtpTrue}`);
    }
    return committed;
  };
  const cheap = run(15), dear = run(900);
  assert.ok(cheap >= 3, `cheap ${cheap}`);
  assert.ok(cheap > 3 * dear, `cheap ${cheap} vs dear ${dear}`);
});

test('the loud customer asks for idiosyncratic things; building it logs overfit_to_loud_customer', () => {
  const s = fresh(31);
  const plan = mainPlan(s);
  const subs = [];
  for (let i = 0; i < 4; i++) {
    const c = createCustomer(s, { name: `Cust ${i}`, email: `c${i}@x${i}.com` });
    subs.push(subscribe(s, c.id, i === 0 ? { ...plan, price: plan.price * 8 } : plan, { trial: false }));
  }
  const slice = customersSlice(s);
  const loudSub = subs[0];
  let ask = null;
  for (let k = 0; k < 20 && !ask?.idiosyncratic; k++) ask = requestFor(s, loudSub, { id: loudSub.customerId, email: 'c0@x0.com' }, { loud: true, salt: String(k) });
  assert.ok(ask?.idiosyncratic, 'the biggest account has an ask only its own setup needs');
  const req = logRequest(s, slice, ask, loudSub);
  // an ordinary account asks for a job that matters to its segment
  const jobs = Array.from({ length: 12 }, (_, k) => requestFor(s, subs[1], { id: subs[1].customerId }, { salt: String(k) }));
  assert.ok(jobs.some((j) => j && !j.idiosyncratic));
  const log = requestLog(s, slice);
  assert.equal(log[0].accounts, 1);
  assert.ok(log[0].mrr > 0, 'the log shows the MRR behind the ask');
  // building it
  productSlice(s).features.push({ id: 'f_custom', title: req.text, problem: req.text, status: 'building', createdDay: s.day, effortHours: 20 });
  requestsBuildDay(s, slice);
  const m = s.mistakes.filter((x) => x.id === 'overfit_to_loud_customer');
  assert.equal(m.length, 1);
  assert.ok(m[0].delayed && m[0].cost.hours > 0);
  requestsBuildDay(s, slice);
  assert.equal(s.mistakes.filter((x) => x.id === 'overfit_to_loud_customer').length, 1, 'logged once');
  // not for a request that several accounts in the segment made
  const s2 = fresh(31);
  const sl2 = customersSlice(s2);
  const text = 'Slack reminders for overdue invoices';
  const cs = [0, 1, 2].map((i) => subscribe(s2, createCustomer(s2, { name: `C${i}`, email: `q${i}@x.com` }).id, mainPlan(s2), { trial: false }));
  for (const sub of cs) logRequest(s2, sl2, { text, idiosyncratic: false, segmentId: strongest(s2).id }, sub);
  productSlice(s2).features.push({ id: 'f_ok', title: text, problem: text, status: 'building', createdDay: s2.day, effortHours: 10 });
  requestsBuildDay(s2, sl2);
  assert.equal((s2.mistakes ?? []).filter((x) => x.id === 'overfit_to_loud_customer').length, 0);
});

test('investor and advisor opinions are fake validation: logged when counted or cited in a spec', () => {
  const s = fresh(41);
  const sig = captureOpinion(s, { id: 'inb_1', category: 'investor', threadId: 't1' }, { senderName: 'Dana Roe' });
  assert.ok(sig && sig.hasPain === false && sig.confidence >= 0.7, 'confident, and no pain behind it');
  assert.equal(captureOpinion(s, { id: 'inb_1', category: 'investor' }), null, 'once per inbound');
  assert.equal(captureOpinion(s, { id: 'inb_2', category: 'spam' }), null);
  captureOpinion(s, { id: 'inb_3', category: 'advisor' }, { senderName: 'Sol' });
  assert.equal(opinions(s).length, 2);
  assert.equal((s.mistakes ?? []).filter((x) => x.id === 'opinion_as_validation').length, 0, 'receiving an opinion is free');
  const r = tagAsValidation(s, sig.id);
  assert.ok(r.ok);
  assert.equal(s.mistakes.filter((x) => x.id === 'opinion_as_validation').length, 1);
  assert.equal(researchSlice(s).insights.find((i) => i.id === r.insightId).real, false);
  // citing it in a spec is a second, delayed trace
  productSlice(s).features.push({ id: 'f1', title: 'Big idea', evidence: [r.insightId], status: 'draft', createdDay: s.day });
  opinionCitationsDay(s);
  assert.equal(s.mistakes.filter((x) => x.id === 'opinion_as_validation').length, 2);
  opinionCitationsDay(s);
  assert.equal(s.mistakes.filter((x) => x.id === 'opinion_as_validation').length, 2, 'idempotent');
  void ensureCrm;
});
