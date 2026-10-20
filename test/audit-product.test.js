// Audit of product and customer-understanding personas and offline fallbacks: trial panelists are concrete people from
// the customer type and hidden market (not three hard-coded strings with one shared quote), rehearsal interviewees
// speak their own drawn facts and voice, offline tickets/reviews/customer replies vary and follow what really happened
// (a false "it's fixed" is caught), and the demo-script judge cannot be keyword-stuffed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import * as llm from '../public/core/llm.js';
import { setCustomerType } from '../public/core/customer-type.js';
import { buildPersonas, heuristicTrial, trialSystemPrompt, aggregatePanel } from '../public/apps/product/panel.js';
import { personalizeFacts, fallbackReply, makeFacts } from '../public/apps/product/interview.js';
import { createInterview } from '../public/apps/research.js';
import { fallbackTicket, fallbackReview } from '../public/apps/support/tickets.js';
import { replyFallback } from '../public/apps/support/rubrics.js';
import { heuristicDemo, scriptQuality, DEMO } from '../public/apps/website/demo.js';

function mk(model, type, seed = 5) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'bootstrap', founderName: 'F', seed });
  ensureStripe(s); ensureMarket(s);
  if (type) setCustomerType(s, type);
  s.company.oneLiner = 'Bookkeeping that closes the month for small agencies';
  s.company.icp = 'operations leads at small marketing agencies';
  s.company.website = { title: 'Ledgerly', text: 'Bookkeeping for agencies' };
  return s;
}
const STUB = [{ id: 'f1', title: 'Auto-match payouts' }]; // no spec text: neutral feature value, isolates the persona effects

test('trial panelists are concrete people from the customer type, one per buying seat, with their own prompts', () => {
  const titles = {};
  for (const [model, type] of [['smb', 'startups'], ['smb', 'local_smb'], ['ent', 'enterprise'], ['b2c', 'consumers']]) {
    const s = mk(model, type);
    const ps = buildPersonas(s).filter((p) => p.source === 'icp');
    assert.equal(ps.length, 4, type);
    assert.deepEqual(ps.map((p) => p.seat), ['user', 'champion', 'economic_buyer', 'skeptic']);
    assert.equal(new Set(ps.map((p) => p.name)).size, 4, `${type}: distinct names`);
    const prompts = ps.map((p) => trialSystemPrompt(p, { realism: 'R' }));
    assert.equal(new Set(prompts).size, 4, `${type}: distinct system prompts`);
    for (const [i, p] of ps.entries()) for (const bit of [p.name, p.jtbd, p.uses, p.burnedBy]) assert.ok(prompts[i].includes(bit), `${type}: prompt lacks ${bit}`);
    titles[type] = ps.map((p) => p.title).join('|');
  }
  assert.notEqual(titles.startups, titles.local_smb, 'a startup panel and a local-business panel seat different people');
});

test('offline trial quotes differ by person and follow their own deal-breakers', () => {
  const s = mk('smb', 'startups');
  const res = buildPersonas(s).map((p) => heuristicTrial(s, p, STUB, { refPrice: 79, priceMonthly: 49 }));
  assert.ok(new Set(res.map((r) => r.quote)).size >= 3, JSON.stringify(res.map((r) => r.quote)));
  // The engineer needs docs/an API and the security skeptic needs SSO: with neither shipped, they say so.
  assert.ok(res.some((r) => r.missingMustHaves.some((m) => /API or docs|SSO/.test(m))), JSON.stringify(res.map((r) => r.missingMustHaves)));
});

test('trial panel outcomes follow the hidden fit and differ between games (not one fixed answer per persona slot)', () => {
  const run = (fit) => {
    let act = 0, n = 0; const scores = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      const s = mk('smb', 'local_smb', seed);
      s.market.fit.product.score = fit;
      const res = buildPersonas(s).map((p) => heuristicTrial(s, p, STUB, { refPrice: 79, priceMonthly: 49 }));
      act += res.filter((r) => r.activated).length; n += res.length;
      scores.add(aggregatePanel(res, 49).score.toFixed(3));
    }
    return { act: act / n, distinct: scores.size };
  };
  const lo = run(0.2), hi = run(0.8);
  assert.ok(hi.act > lo.act + 0.15, `activation ${lo.act} -> ${hi.act}`);
  assert.ok(hi.act < 0.7, `a great product still does not activate everyone (${hi.act})`);
  assert.ok(hi.distinct >= 5, 'panels vary from game to game');
});

test('the same persona with real pain gets more out of the trial than one without', () => {
  const s = mk('smb', 'local_smb');
  const base = buildPersonas(s)[0];
  let painAct = 0, noAct = 0;
  for (let i = 0; i < 60; i++) {
    const p = { ...base, id: `x${i}` };
    painAct += heuristicTrial(s, { ...p, hidden: { ...p.hidden, hasPain: true, painIntensity: 0.8 } }, STUB, {}).activated ? 1 : 0;
    noAct += heuristicTrial(s, { ...p, hidden: { ...p.hidden, hasPain: false, painIntensity: 0 } }, STUB, {}).activated ? 1 : 0;
  }
  assert.ok(painAct > noAct, `${painAct} vs ${noAct}`);
});

test('rehearsal interviewee facts come from the drawn person and the customer type', () => {
  const base = makeFacts(() => 0.3, { model: 'smb', painReal: true });
  const drawn = { role: 'economic_buyer', title: 'CTO', budgetAuthority: true, hasPain: true, lastIncident: '9 days ago, trying to reconcile payouts went wrong and somebody had to fix it by hand', workaround: 'a spreadsheet plus manual checks', workaroundCostMonthly: 312, frequency: 'weekly', competingPriorities: ['hiring', 'a tool migration'] };
  const f = personalizeFacts(base, drawn, { customerType: 'startups', model: 'smb' });
  assert.match(f.lastTime, /^9 days ago, trying to reconcile payouts/);
  assert.match(f.workaround, /spreadsheet plus manual checks/);
  assert.equal(f.spendNum, 310);
  assert.equal(f.frequency, 'every week');
  assert.match(f.priorities, /hiring and a tool migration/);
  assert.match(f.decision, /company card/);
  assert.match(personalizeFacts(base, { ...drawn, budgetAuthority: false }, { customerType: 'enterprise', model: 'ent' }).decision, /VP|security/);
  assert.match(personalizeFacts(base, { ...drawn, role: 'consumer' }, { customerType: 'consumers', model: 'b2c' }).decision, /Decides alone/);
});

test('offline rehearsals: no generic "owner-operator at X & Co"; voices vary; behaviour (what is revealed) does not', async () => {
  for (const [model, type] of [['smb', 'startups'], ['b2c', 'consumers']]) {
    const s = mk(model, type);
    const ivs = [];
    for (let i = 0; i < 4; i++) ivs.push(await createInterview({ state: s, llm }, { source: 'icp' }));
    for (const iv of ivs) {
      assert.notEqual(iv.persona.role, 'owner-operator');
      assert.doesNotMatch(iv.persona.company ?? '', / & Co$/);
      if (model === 'b2c') assert.equal(iv.persona.company, '');
    }
  }
  const names = ['Ana Ruiz', 'Ben Cole', 'Chen Wu', 'Dev Rao', 'Eva Lind', 'Femi Ade', 'Gus Hart', 'Hana Ito'];
  const facts = makeFacts(() => 0.3, { model: 'smb', painReal: true });
  const replies = names.map((name) => fallbackReply({ name, facts }, [], 'Would you pay for a tool that does this?'));
  assert.ok(new Set(replies.map((r) => r.reply)).size >= 3, 'hypothetical brush-offs are phrased differently per person');
  assert.ok(replies.every((r) => r.revealed.length === 0 && r.commitment === 'none'), 'a hypothetical still reveals nothing');
  const past = fallbackReply({ name: 'Ana Ruiz', facts }, [], 'Tell me about the last time this happened.');
  assert.deepEqual(past.revealed, ['lastTime']);
});

test('offline support tickets and reviews vary and follow what actually happened', () => {
  const subjects = new Set(Array.from({ length: 24 }, (_, i) => fallbackTicket({ category: 'billing', name: `Customer ${i}`, product: 'Ledgerly', key: `c${i}` }).subject));
  assert.ok(subjects.size >= 3, [...subjects].join(' | '));
  assert.ok(![...subjects].every((x) => x === 'Charged twice?'));
  const fives = new Set(Array.from({ length: 12 }, (_, i) => fallbackReview(5, { product: 'Ledgerly', features: ['Auto-match payouts'], key: `rev${i}` }).text));
  assert.ok(fives.size >= 3);
  const buggy = Array.from({ length: 8 }, (_, i) => fallbackReview(2, { product: 'Ledgerly', features: ['Auto-match payouts'], key: `b${i}`, bugHours: 60, csat: 0.9 }).text);
  assert.ok(buggy.every((t) => /break|broke|failed/i.test(t)), buggy.join(' | '));
  const slow = Array.from({ length: 8 }, (_, i) => fallbackReview(2, { product: 'Ledgerly', features: ['Auto-match payouts'], key: `s${i}`, bugHours: 0, csat: 0.4 }).text);
  assert.ok(slow.every((t) => /support|answer/i.test(t)), slow.join(' | '));
});

test('a false "it is fixed" on an open bug is not solved offline; a real workaround or a real fix is', () => {
  const claim = 'Hi Ann, sorry about the Auto-match sync. It is fixed now and deployed today: go to Settings and click reconnect. Thanks!';
  const lie = replyFallback(0.7, { category: 'bug', bugOpen: true, reply: claim, name: 'Ann' });
  assert.equal(lie.solved, false);
  assert.ok(lie.satisfied <= 0.2);
  assert.match(lie.reply, /still|isn't|same/i);
  assert.equal(replyFallback(0.7, { category: 'bug', bugOpen: false, reply: claim, name: 'Ann' }).solved, true);
  const honest = 'Hi Ann, the Auto-match bug is still open; for now you can mark the 3 invoices paid manually, and I will ship the fix by Friday.';
  assert.equal(replyFallback(0.7, { category: 'bug', bugOpen: true, reply: honest, name: 'Ann' }).solved, true);
});

test('demo-script judge: keyword stuffing stays below the useful bar, a real walkthrough clears it, notes are reactions', () => {
  const s = mk('smb', 'startups');
  const stuffed = 'Tired of wasting hours? Tired of wasting hours on agencies. click open type select import connect drag press. Save 5 hours, 10 minutes, 3 days, 50%. Start free trial.';
  const good = 'Agency ops leads spend two days every month-end matching Stripe payouts to invoices in a spreadsheet. Here is Ledgerly. I connect Stripe and QuickBooks, it pulls last month, and you can see 212 of 230 payouts already matched. The 18 left are flagged with the reason: a partial refund, a fee. I click one, pick the invoice, done. Our pilot agencies closed in 4 hours instead of 2 days. Start a free trial with your own Stripe account.';
  const q = (t) => scriptQuality(heuristicDemo(s, t), t);
  assert.ok(q(stuffed) < DEMO.minQuality, `stuffed ${q(stuffed)}`);
  assert.ok(q(good) > DEMO.minQuality + 0.1, `good ${q(good)}`);
  const notes = heuristicDemo(s, 'Our revolutionary AI-powered platform. Sign up.').notes;
  assert.ok(notes.length >= 3);
  for (const n of notes) assert.doesNotMatch(n, /^(Name|Open|Show|Put|End|Cut|Add|Write|Aim)\b/, n);
});
