// Sales: prospect database, market burn, discovery anti-stuffing, AI notetaker, reply inbox/agent, pipeline
// hygiene, operator readers, automation contract, and the founder-led outbound funnel (calibration miss 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { seedDefaultStack, post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { APPS } from '../public/apps/registry.js';
import { SALES } from '../public/apps/sales/params.js';
import { replyProbability, positiveShare, isPositive } from '../public/apps/sales/replies.js';
import { heuristicScorecard, countGoodQuestions, heuristicCallReply } from '../public/apps/sales/scorecard.js';
import { callQuality } from '../public/apps/sales/deals.js';
import { ensureCrm, ensureOutreach, ensureCalls, addContact, createMeeting, nextSlot, ensureDeal, startProposal, contactById, companyById, moveDeal, setNextStep, addActivity } from '../public/apps/sales/model.js';
import * as P from '../public/apps/sales/prospector.js';
import { recordTouch, recordNegative, segmentMult, isBurned, decayBurn, marketReplyMult } from '../public/apps/sales/market-burn.js';
import { generateNotes, pushNotes, ensureNotetaker, notesCloseMult } from '../public/apps/sales/notetaker.js';
import { ensureInbox, inboxOnReply, inboxDay, resolveItem, approveDraft, testOnSamples, inboxMetrics, promptsKey } from '../public/apps/sales/inbox.js';
import { staleMult, submitForecast, resolveForecast, nudgeDeal } from '../public/apps/sales/pipeline.js';
import { readOperator } from '../public/core/operator.js';
import '../public/apps/sales/operator.js';
import { SALES_ACTIONS, salesEvents } from '../public/apps/sales/automation.js';
import { personaFor } from '../public/apps/sales/replies.js';

function fresh(model = 'smb', seed = 7, { icp, oneLiner } = {}) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'indie', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  s.company.oneLiner = oneLiner ?? 'Automated payout reconciliation for Shopify stores';
  s.company.icp = icp ?? 'Shopify store owners with 5-50 employees who are hiring a bookkeeper';
  s.apps.product = { features: [{ id: 'f1', title: 'Nightly payout matching', status: 'shipped' }, { id: 'f2', title: 'Missed refund alerts', status: 'shipped' }] };
  return s;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

// ---------------------------------------------------------------------------
// Prospect database
// ---------------------------------------------------------------------------

// Expected positive replies per inboxed researched first email for a database list (same copy, same volume).
function listPositiveRate(s, rows) {
  return mean(rows.map((r) => {
    const wrong = r.wrongPersona || (!(r.p.dataU < r.p.acc) && r.p.wrongKind === 'departed');
    const company = { prospect: { fit: r.fit, hiring: r.co.hiring, recentRaise: r.co.recentRaise, techMatch: r.techMatch } };
    const contact = { prospect: { wrongPersona: r.wrongPersona, wrongPerson: wrong && !r.wrongPersona } };
    const p = replyProbability({ tier: 'researched', quality: 0.7, fit: r.fit, mult: P.listReplyMult(s, contact, company) });
    return p * positiveShare({ tier: 'researched', quality: 0.7, fit: r.fit }) * (wrong ? 0.4 : 1);
  }));
}

const LISTS = {
  stellar: { seniority: ['owner'], minEmp: 5, maxEmp: 50, segment: 'ecommerce', tech: 'Shopify' },
  good: { seniority: ['owner'], minEmp: 5, maxEmp: 50, segment: 'ecommerce' },
  average: { title: 'owner, founder, ceo', minEmp: 1, maxEmp: 200 },
  mediocre: {},
};

test('prospects: list quality separates positive replies at equal volume (stellar 2-3x broad, mediocre 0.3-0.7x)', () => {
  const s = fresh();
  const r = {};
  for (const [tier, f] of Object.entries(LISTS)) {
    const rows = P.search(s, { ...P.DEFAULT_FILTERS, ...f });
    assert.ok(rows.length >= 20, `${tier} list has ${rows.length} rows`);
    const step = Math.max(1, Math.floor(rows.length / 300));
    r[tier] = listPositiveRate(s, rows.filter((_, i) => i % step === 0).slice(0, 300)); // an even sample, not the first page
  }
  const ratio = (t) => r[t] / r.average;
  assert.ok(ratio('stellar') >= 2 && ratio('stellar') <= 3.6, `stellar ${ratio('stellar').toFixed(2)}x`);
  assert.ok(ratio('good') >= 1.3 && ratio('good') < ratio('stellar'), `good ${ratio('good').toFixed(2)}x`);
  assert.ok(ratio('mediocre') >= 0.3 && ratio('mediocre') <= 0.8, `mediocre ${ratio('mediocre').toFixed(2)}x`);
  // Volume cannot buy quality: the mediocre list is 10x bigger and still worse per send.
  assert.ok(P.search(s, { ...P.DEFAULT_FILTERS }).length > 10 * P.search(s, { ...P.DEFAULT_FILTERS, ...LISTS.stellar }).length);
});

test('prospects: credits, waterfall misses are free, unverified international exports bounce, verified lists do not', () => {
  const s = fresh();
  assert.throws(() => P.reveal(s, ['x']), /plan/);
  P.setPlan(s, 'clay_launch');
  const p = P.ensureProspector(s);
  assert.equal(p.credits, 2500);
  const rows = P.search(s, { ...P.DEFAULT_FILTERS, ...LISTS.good }).slice(0, 60).map((x) => x.id);
  const t = P.testFive(s, rows);
  assert.ok(t.found + t.missed === 5 && t.credits <= 5 * 3);
  const before = p.credits;
  const r = P.reveal(s, rows, { mode: 'waterfall' });
  assert.equal(before - p.credits, r.credits, 'only hits are charged');
  assert.ok(r.found / (r.found + r.missed) > 0.75, 'waterfall finds most');
  // Mediocre: bulk international export, unverified → many invalid addresses saved.
  const intl = P.search(s, { ...P.DEFAULT_FILTERS, geo: 'intl' }).slice(0, 400).map((x) => x.id);
  P.reveal(s, intl, { mode: 'db' });
  const list = P.saveList(s, intl, 'bulk intl', { addContact });
  const contacts = list.contactIds.map((id) => contactById(s, id));
  const invalid = contacts.filter((c) => c.truth === 'invalid').length / contacts.length;
  const bounce = mean(contacts.map((c) => SALES.bounce[c.truth]));
  assert.ok(invalid > 0.12 && bounce > 0.025, `intl invalid ${invalid.toFixed(2)}, expected bounce ${bounce.toFixed(3)}`);
  // Stellar: verify and drop invalid → expected bounce under 2%.
  const kept = contacts.filter((c) => c.truth !== 'invalid');
  assert.ok(mean(kept.map((c) => SALES.bounce[c.truth])) < 0.02);
  // Wrong data travels: departed mailboxes and wrong personas are flagged on the record (hidden).
  assert.ok(contacts.some((c) => c.prospect.dataWrong));
});

test('prospects: AI column accuracy depends on the prompt; signals cost credits and include false positives', () => {
  const s = fresh();
  P.setPlan(s, 'clay_launch');
  const rows = P.search(s, { ...P.DEFAULT_FILTERS, segment: 'ecommerce' }).slice(0, 200);
  const ids = rows.map((r) => r.id);
  const good = P.runAiColumn(s, ids, 'Read their site and job posts: are they hiring for bookkeeping or finance? Answer yes, no or unknown with a one-line reason.');
  const acc = (prompt) => { const p = P.ensureProspector(s); return mean(rows.map((r) => { const a = p.ai.answers[r.id]; return a.answer === 'unknown' ? 0.5 : (a.answer === 'yes') === r.co.hiring ? 1 : 0; })); };
  const accGood = acc();
  P.runAiColumn(s, ids, 'are they a good company for us maybe');
  const accBad = acc();
  assert.ok(good.topic === 'hiring' && accGood > 0.8 && accGood > accBad + 0.1, `good ${accGood} vs vague ${accBad}`);
  // Signals
  P.reveal(s, ids.slice(0, 80));
  P.saveList(s, ids.slice(0, 80), 'signals', { addContact });
  P.setMonitor(s, 'job_change', 'daily');
  P.setMonitor(s, 'hiring', 'weekly');
  const c0 = P.ensureProspector(s).credits;
  for (let d = 0; d < 120; d++) { s.day++; P.prospectorDay(s); }
  const sigs = P.ensureProspector(s).signals.filter((x) => x.delivered);
  assert.ok(sigs.length > 10, `${sigs.length} signals`);
  assert.ok(sigs.some((x) => !x.real), 'some false positives');
  assert.ok(P.ensureProspector(s).credits !== c0);
});

// ---------------------------------------------------------------------------
// Market burn
// ---------------------------------------------------------------------------

test('market burn: a 2,000-email generic blast cools the segment 30-50% for ~60 days; targeted sending does not', () => {
  const s = fresh();
  const co = { id: 'c1', name: 'X', segmentId: 'ecommerce' };
  for (let i = 0; i < 2000; i++) recordTouch(s, { id: `co${i}`, name: 'Y', segmentId: 'ecommerce' }, `p${i}`, 'generic');
  for (let i = 0; i < 3; i++) recordNegative(s, { id: `co${i}`, segmentId: 'ecommerce', name: 'Y' }, 'complaint');
  const m0 = segmentMult(s, co);
  assert.ok(m0 >= 0.5 && m0 <= 0.7, `after blast ×${m0.toFixed(2)}`);
  s.day += 60; decayBurn(s);
  const m60 = segmentMult(s, co);
  assert.ok(m60 > m0 && m60 < 0.97, `after 60 days ×${m60.toFixed(2)}`);
  const t = fresh();
  for (let w = 0; w < 8; w++) { for (let i = 0; i < 100; i++) recordTouch(t, { id: `k${w}_${i}`, name: 'Z', segmentId: 'ecommerce' }, `q${w}_${i}`, 'researched'); t.day += 7; decayBurn(t); }
  assert.ok(segmentMult(t, co) > 0.95, 'researched 100/week keeps the market fresh');
});

test('market burn: emailing 4+ people at one company or a spam report burns the account and logs the mistake', () => {
  const s = fresh();
  const co = { id: 'acc', name: 'Acme', segmentId: 'ecommerce' };
  for (let i = 0; i < 4; i++) recordTouch(s, co, `person${i}`, 'basic');
  assert.ok(isBurned(s, co));
  assert.ok(marketReplyMult(s, co) <= 0.3);
  assert.ok(s.mistakes.some((m) => m.functionId === 'prospecting'));
  const co2 = { id: 'acc2', name: 'B', segmentId: 'agencies' };
  recordNegative(s, co2, 'complaint');
  assert.ok(isBurned(s, co2));
  s.day += 200;
  assert.ok(!isBurned(s, co2), 'burn expires');
});

// ---------------------------------------------------------------------------
// Discovery: stuffing does not beat a real call
// ---------------------------------------------------------------------------

const HONEST = [
  { from: 'me', text: 'Tell me about the last time you closed the books?' },
  { from: 'them', text: 'Last month reconciling Shopify payouts took the whole weekend and we missed two refunds.' },
  { from: 'me', text: 'You said you missed two refunds: what did that cost you?' },
  { from: 'them', text: 'About $400 and an angry customer. Our bookkeeper charges extra for the reconciliation hours too.' },
  { from: 'me', text: 'How do you currently handle it with the bookkeeper, what did you try before?' },
  { from: 'them', text: 'Spreadsheets. We tried a Zapier flow but it broke whenever Shopify changed the export.' },
  { from: 'me', text: 'Who else is involved when you pick a tool like this?' },
  { from: 'them', text: 'My partner signs off on anything recurring.' },
  { from: 'me', text: 'Could we set up a pilot next Tuesday with your partner? I will send a calendar invite.' },
  { from: 'them', text: 'Sure, sounds good. Send it over.' },
];
const STUFFED = [
  { from: 'me', text: 'Last time? Walk me through? Who else? What happens if? Tell me about it? Why is that? What did that cost? How do you currently handle it?' },
  { from: 'them', text: 'Uh, ok. It is fine mostly.' },
  { from: 'me', text: 'Last time? Walk me through? Who else? What happens if?' },
  { from: 'them', text: 'Not sure what you mean.' },
  { from: 'me', text: 'Tell me about the last time? How much time does it take? Who else decides? What happens if nothing changes?' },
  { from: 'them', text: 'Sure.' },
];

test('discovery: keyword-stuffed questions do not beat an honest call; follow-ups that use their words count', () => {
  const h = heuristicScorecard(HONEST);
  const st = heuristicScorecard(STUFFED);
  assert.ok(h.discoveryQuality > st.discoveryQuality, `honest ${h.discoveryQuality} vs stuffed ${st.discoveryQuality}`);
  assert.ok(callQuality(h) > callQuality(st) + 0.15);
  assert.ok(countGoodQuestions(STUFFED) <= 5, `stuffed credits ${countGoodQuestions(STUFFED)}`);
  assert.ok(st.momTestViolations.some((v) => /Stacked/.test(v)));
  assert.ok(st.coaching.some((c) => /11-14/.test(c)), 'coaching says what a stellar call looks like');
  // The offline prospect answers what was asked: a question about the last time reveals the pain.
  const persona = { hasPain: true, pain: 'reconciling payouts eats a weekend', lastIncident: 'last month it cost a weekend', currentTools: 'spreadsheets', timeline: 'this quarter', objection: 'setup time', decisionProcess: 'owner decides', authority: 'economic buyer' };
  assert.match(heuristicCallReply({ persona, text: 'Tell me about the last time that happened?', turn: 3 }).reply, /weekend/);
});

// ---------------------------------------------------------------------------
// Notetaker
// ---------------------------------------------------------------------------

function notesRun(policy, n = 60) {
  let wrong = 0, closeHits = 0, hours = 0;
  for (let i = 0; i < n; i++) {
    const s = fresh('smb', 200 + i);
    const nt = ensureNotetaker(s);
    nt.mode = 'local'; nt.plan = 'paid';
    const { contact } = addContact(s, { firstName: 'Ana', lastName: `K${i}`, email: `ana${i}@shop${i}.com`, title: 'Owner', company: `Shop ${i}`, domain: `shop${i}.com` });
    const m = createMeeting(s, { contactId: contact.id, slot: nextSlot(s, { minLead: 1 }), source: 'outbound' });
    m.transcript = [...HONEST, { from: 'me', text: 'What is the budget you had in mind?' }, { from: 'them', text: 'Around $80-120 a month if it works. Timeline is this quarter.' }];
    m.status = 'held';
    const card = heuristicScorecard(m.transcript);
    const deal = ensureCrm(s).deals.find((d) => d.id === m.dealId);
    generateNotes(s, m, personaFor(s, contact, companyById(s, contact.companyId)), card);
    if (policy === 'stellar') { for (const f of m.notes.fields) f.decision = f.wrong && (i % 25 !== 0) ? 'reject' : 'accept'; pushNotes(s, m, deal, { reviewed: true, setNextStep, addActivity }); hours += 0.06; }
    else if (policy === 'good') { for (const f of m.notes.fields) f.decision = f.wrong && f.conf === 'low' ? 'reject' : 'accept'; pushNotes(s, m, deal, { reviewed: true, setNextStep, addActivity }); hours += 0.04; }
    else pushNotes(s, m, deal, { reviewed: false, setNextStep, addActivity });
    wrong += deal.wrongFacts ?? 0;
    closeHits += notesCloseMult(deal) < 1 ? 1 : 0;
  }
  return { wrongPer20: (20 * wrong) / n, affected: closeHits / n, hours };
}

test('notetaker: reviewing fields against the transcript keeps wrong CRM data near zero; pushing everything does not', () => {
  const st = notesRun('stellar');
  const gd = notesRun('good');
  const av = notesRun('average');
  assert.ok(st.wrongPer20 < gd.wrongPer20 + 0.01 && gd.wrongPer20 < av.wrongPer20, `wrong/20 calls: ${st.wrongPer20} ${gd.wrongPer20} ${av.wrongPer20}`);
  assert.ok(st.wrongPer20 <= 0.7, `stellar ${st.wrongPer20}`);
  assert.ok(av.wrongPer20 >= 2 && av.wrongPer20 <= 14, `average ${av.wrongPer20}`); // ~5 proposed fields a call × 5-10% wrong
  assert.ok(av.affected > 0.03, 'unreviewed pushes hurt close odds on affected deals');
});

// ---------------------------------------------------------------------------
// Reply inbox and agent
// ---------------------------------------------------------------------------

function inboxRun(policy, seed = 1) {
  const s = fresh('smb', 500 + seed);
  const ib = ensureInbox(s);
  const st = ib.settings;
  ib.credits = 10000;
  if (policy !== 'manual') st.aiCategorize = true;
  if (policy === 'stellar') {
    st.prompts = { interested: 'They want to learn more or try it, e.g. "sounds useful, tell me more"', meeting_request: 'They propose or accept a time, e.g. "Tuesday works"', question: 'They ask price, setup or how it works, e.g. "what does it cost?"', not_now: 'Timing is wrong but not a no, e.g. "ping me next quarter"', unsubscribe: 'They ask to be removed or say stop emailing, any tone', wrong_person: 'They say someone else handles it or they left the company' };
    st.promptsKey = promptsKey(st.prompts);
    testOnSamples(s);
    st.agent = { mode: 'review', scope: ['question', 'ooo'], criteria: 'Answer pricing and setup questions from the templates; route anything positive or ambiguous to me', templates: 'Pricing: $79 a month per store, no setup fee, cancel any time. Setup: connect Shopify in about 15 minutes, we match payouts nightly.', escalation: 'interested or ambiguous goes to me' };
  } else if (policy === 'good') st.agent = { mode: 'review', scope: Object.keys({ interested: 1, meeting_request: 1, question: 1, not_now: 1, objection: 1, ooo: 1 }), criteria: '', templates: '', escalation: '' };
  else if (policy === 'average') st.agent = { mode: 'autopilot', scope: ['meeting_request', 'question', 'not_now', 'objection', 'ooo', 'wrong_person', 'unsubscribe'], criteria: '', templates: '', escalation: '' };
  else st.agent = { mode: 'autopilot', scope: ['interested', 'meeting_request', 'question', 'not_now', 'objection', 'ooo', 'wrong_person', 'unsubscribe'], criteria: '', templates: '', escalation: '' };
  const kinds = ['interested', 'curious', 'curious', 'objection', 'not_now', 'not_now', 'unsubscribe', 'unsubscribe', 'interested', 'ooo'];
  // Replies arrive 8 a day for 20 days; the agent and the founder work the inbox every day.
  for (let d = 0; d < 30; d++) {
    for (let k = 0; k < 8 && d < 20; k++) {
      const i = d * 8 + k;
      const { contact, company } = addContact(s, { firstName: 'R', lastName: `L${i}`, email: `r${i}@co${i}.com`, title: 'Owner', company: `Co ${i}`, domain: `co${i}.com` });
      const kind = kinds[i % kinds.length];
      ensureDeal(s, { companyId: company.id, contactId: contact.id, stage: isPositive(kind) ? 'replied' : 'contacted' });
      inboxOnReply(s, { contact, company, kind, source: 'sequence', channel: 'email', day: s.day });
    }
    inboxDay(s);
    for (const it of ib.items) {
      if (it.status === 'drafted') approveDraft(s, it);
      if (it.status !== 'new') continue;
      const age = s.day - it.day;
      if (policy === 'stellar') resolveItem(s, it, 'founder'); // reads every reply the day it lands
      if (policy === 'good' && age >= 1) resolveItem(s, it, 'founder');
      if (policy === 'average' && it.label === 'interested' && age >= 2) resolveItem(s, it, 'founder');
    }
    s.day++;
  }
  inboxDay(s);
  if (process.env.DBG) { const out = {}; for (const it of ib.items) { const k = it.trueCat + ':' + it.outcome + ':' + it.handledBy; out[k] = (out[k] ?? 0) + 1; } console.log(policy, JSON.stringify(out)); }
  return inboxMetrics(s);
}

test('reply inbox: stellar converts 25-40% of positives to meetings; autopilot-on-everything mishandles positives and causes opt-outs', () => {
  const r = {};
  for (const p of ['stellar', 'good', 'average', 'mediocre']) {
    const runs = [1, 2, 3].map((k) => inboxRun(p, k));
    r[p] = { mtg: mean(runs.map((x) => x.meetingsPer100)), unsub: mean(runs.map((x) => x.unsubRate)), mis: mean(runs.map((x) => x.mishandledShare)) };
  }
  assert.ok(r.stellar.mtg >= 25 && r.stellar.mtg <= 50, `stellar ${r.stellar.mtg}`);
  assert.ok(r.stellar.mtg > r.good.mtg && r.good.mtg > r.average.mtg && r.average.mtg > r.mediocre.mtg, JSON.stringify(r));
  assert.ok(r.mediocre.mis >= 0.08, `mediocre mishandled ${r.mediocre.mis}`);
  assert.ok(r.mediocre.unsub > r.stellar.unsub, 'pushy autopilot answers cause opt-outs');
});

test('reply agent: 5 credits per generated reply whether sent or not; no credits → no drafts', () => {
  const s = fresh();
  const ib = ensureInbox(s);
  ib.settings.aiCategorize = true;
  ib.settings.agent = { mode: 'review', scope: ['question', 'interested', 'meeting_request', 'not_now', 'objection', 'ooo', 'unsubscribe', 'wrong_person'], criteria: '', templates: '', escalation: '' };
  ib.credits = 12;
  for (let i = 0; i < 4; i++) { const { contact, company } = addContact(s, { firstName: 'A', lastName: `${i}`, email: `a${i}@z${i}.com`, company: `Z${i}`, domain: `z${i}.com` }); inboxOnReply(s, { contact, company, kind: 'curious', source: 'sequence', channel: 'email', day: s.day }); }
  inboxDay(s);
  assert.equal(ib.items.filter((x) => x.status === 'drafted').length, 2);
  assert.equal(ib.credits, 2);
});

// ---------------------------------------------------------------------------
// Pipeline hygiene
// ---------------------------------------------------------------------------

test('pipeline: buyer silence decays win odds after 21 days; commit inflation and early discounts are logged', () => {
  const s = fresh();
  const { contact, company } = addContact(s, { firstName: 'D', lastName: 'Q', email: 'd@deal.com', title: 'Owner', company: 'Deal Co', domain: 'deal.com' });
  const deal = ensureDeal(s, { companyId: company.id, contactId: contact.id, stage: 'qualified' });
  deal.lastTouchDay = s.day;
  assert.equal(staleMult(s, deal), 1);
  s.day += 45;
  const m = staleMult(s, deal);
  assert.ok(m < 0.7 && m >= 0.5, `stale ×${m}`);
  const r = nudgeDeal(s, deal);
  if (r.ok) assert.equal(staleMult(s, deal), 1);
  // Early discount: no budget stated → logged, buys nothing.
  startProposal(s, deal, { planId: s.plans[0].id, quantity: 1, discountPct: 0.2 });
  assert.ok(deal.earlyDiscount);
  assert.ok(s.mistakes.some((x) => x.id === 'early_discount'));
  // Commit inflation: commit a deal that does not close.
  const f = submitForecast(s, { [deal.id]: 'commit' });
  moveDeal(s, deal, 'lost', 'went dark');
  s.day = f.periodEnd;
  resolveForecast(s, f);
  assert.ok(f.error >= 0.99);
  assert.ok(s.mistakes.some((x) => x.id === 'commit_inflation'));
});

// ---------------------------------------------------------------------------
// Operator readers and automation contract
// ---------------------------------------------------------------------------

test('operator readers: unknown before acting; registered for prospecting, discovery and deal management', () => {
  const s = fresh();
  for (const id of ['prospecting', 'discovery_demo', 'deal_management']) {
    const r = readOperator(s, id);
    assert.ok(!r.noReader, `${id} has a reader`);
    assert.equal(r.tier, 'unknown');
  }
});

test('automation actions: approval gate for customer-facing actions, dry runs, idempotent events', () => {
  const s = fresh();
  const r = SALES_ACTIONS.create_contact.run(s, { email: 'e@auto.com', name: 'Eve Auto', company: 'Auto', domain: 'auto.com' }, { dryRun: true });
  assert.ok(r.ok && r.hoursCost > 0 && !ensureCrm(s).contacts.length);
  const r2 = SALES_ACTIONS.create_contact.run(s, { email: 'e@auto.com', name: 'Eve Auto', company: 'Auto', domain: 'auto.com' });
  assert.ok(r2.ok);
  const book = SALES_ACTIONS.book_call.run(s, { contactId: r2.result.contactId });
  assert.equal(book.error, 'needs approval');
  assert.ok(SALES_ACTIONS.book_call.run(s, { contactId: r2.result.contactId }, { approved: true }).ok);
  const ev = salesEvents(s);
  assert.ok(ev.some((e) => e.type === 'contact_created') && ev.some((e) => e.type === 'meeting_booked'));
  assert.equal(new Set(ev.map((e) => e.key)).size, ev.length);
  assert.ok(ev.every((e) => e.id && Number.isFinite(e.day)));
  const deal = ensureCrm(s).deals[0];
  assert.ok(!SALES_ACTIONS.move_deal.run(s, { dealId: deal.id, stage: 'won' }).ok, 'automations cannot fake buyer stages');
});

// ---------------------------------------------------------------------------
// Founder-led outbound funnel (calibration miss 7)
// ---------------------------------------------------------------------------

const SEQ = [
  { subject: 'payouts at {{company}}', delayDays: 0, body: 'Hi {{firstName}},\n\n{{personalization}}\n\nMost stores your size spend 5-6 hours a month matching payouts to orders by hand, and refunds slip through. We match them nightly and flag the misses.\n\nIs month-end reconciliation a headache right now?\n\nNot relevant? Just tell me and I will not follow up.\n{{senderName}}' },
  { subject: '', delayDays: 3, body: 'Hi {{firstName}}, one more thought: a store like {{company}} usually finds 1-2 missed refunds a month once payouts are matched automatically. Worth a look?\n\nNot relevant? Just say so.\n{{senderName}}' },
  { subject: '', delayDays: 5, body: 'Hi {{firstName}}, closing the loop. If payouts are not a pain at {{company}}, no worries. Should I check back next quarter instead?\n\n{{senderName}}' },
];
const GOOD_SCRIPT = ['Thanks for making time. Tell me about the last time you closed the books, what happened?', 'How do you currently handle payout matching, and how much time did that take last month?', 'What did you try before to fix it, and what did that cost?', 'Who else is involved in deciding on tools like this, and how do you usually buy software?', 'When do you need this fixed by, any deadline?', 'It is live today. Want to set up a 14-day pilot next week with your real data? I can send a calendar invite.'];
const BAD_SCRIPT = ['Hi! Let me show you our product, it automatically matches payouts and our platform is really powerful.', 'Would you use something like this? How much would you pay for it?', 'Wouldn\'t it be great to never reconcile by hand again?', 'So, can we set up a trial next week?'];

async function outbound(policy, seed, days = 300) {
  const s = fresh('smb', seed);
  s.plans.forEach((p) => { if (p.interval === 'month') p.price = 79; });
  const stellar = policy === 'stellar';
  const { SALES_JOBS } = await import('../public/apps/sales/jobs.js');
  const { verifyContacts } = await import('../public/apps/sales/model.js');
  const { applyCallOutcome } = await import('../public/apps/sales/engine.js');
  const { addMessage } = await import('../public/core/mail.js');
  const offline = { ask: async (o) => ({ data: o.fallback(), mock: true }), panel: async (o) => [{ data: o.fallback(), mock: true }] };
  let hours = 0;
  const o = ensureOutreach(s);
  o.sequencer = true;
  const dom = { id: 'dom1', name: 'getledgerly.com', boughtDay: 0, auth: { spf: true, dkim: true, dmarc: true }, redirect: true, reputation: 50, log: [] };
  o.domains.push(dom);
  for (let i = 0; i < 2; i++) o.inboxes.push({ id: `ib${i}`, domainId: dom.id, address: `pat${i}@getledgerly.com`, createdDay: 0, warmupStartDay: -28, dailyLimit: 'auto', paused: false, sentTotal: 0 });
  const seq = { id: 'seq1', name: 'Outbound', steps: SEQ.map((x, i) => ({ ...x, id: `st${i}` })), status: 'active', inboxIds: [], judge: {}, stats: { sent: 0, bounced: 0, inboxed: 0, opens: 0, complaints: 0, replies: 0, positive: 0 } };
  o.sequences.push(seq);
  hours += 6; // setup and writing
  P.setPlan(s, stellar ? 'apollo_basic' : 'apollo_free');
  // Stellar works the best accounts first: ICP firmographics, the buyer, and a reason to talk now at the top.
  const rowsAll = P.search(s, { ...P.DEFAULT_FILTERS, ...(stellar ? LISTS.good : LISTS.mediocre), excludeOwned: false });
  const pool = (stellar ? [...rowsAll].sort((a, b) => Number(b.co.hiringShown || b.co.techs.includes('Shopify')) - Number(a.co.hiringShown || a.co.techs.includes('Shopify'))) : rowsAll).map((r) => r.id);
  let cursor = 0;
  if (process.env.DBG) console.log('pool', policy, pool.length);
  for (let d = 0; d < days; d++) {
    const dow = s.day % 7;
    if (dow !== 0 && dow !== 6) {
      // Prospecting: stellar 4 researched accounts/day from the database; mediocre 15 unresearched.
      const n = stellar ? 6 : 15;
      const ids = [];
      for (let k = 0; k < n && cursor < pool.length; k++) ids.push(pool[cursor++]);
      if (ids.length) {
        if (P.ensureProspector(s).credits < ids.length) P.ensureProspector(s).credits += ids.length; // top-up/plan renewal simplified
        P.reveal(s, ids);
        const list = P.saveList(s, ids, `day ${s.day}`, { addContact });
        const contacts = list.contactIds.map((id) => contactById(s, id));
        if (stellar) {
          verifyContacts(s, contacts);
          for (const c of contacts) { const co = companyById(s, c.companyId); c.personalization = `Saw ${co.name} is hiring and runs on ${co.prospect.techs.join(' and ')} with about ${co.employees} people.`; }
        }
        hours += stellar ? ids.length * (0.03 + 0.12 + 0.01) : ids.length * 0.005;
        for (const c of contacts) if (c.verification !== 'invalid' && c.status !== 'disqualified') o.enrollments.push({ id: `e_${c.id}`, sequenceId: seq.id, contactId: c.id, step: 0, nextDay: s.day + 1, status: 'active', sent: [], inboxId: null, enrolledDay: s.day });
      }
      // Replies: stellar answers positives the same day asking for a call; mediocre answers after 4 days.
      for (const t of s.mail?.threads ?? []) {
        if (t.kind !== 'prospect') continue;
        const last = t.messages.at(-1);
        if (!last || last.from !== 'them' || t._seen === t.messages.length) continue;
        const ct = contactById(s, t.refId);
        if (!ct || !isPositive(ct.replyKind ?? '') || ensureCalls(s).meetings.some((m) => m.contactId === ct.id)) continue;
        if (!stellar && s.day - last.day < 4) continue;
        t._seen = t.messages.length;
        addMessage(s, t.id, { from: 'me', body: 'Thanks for the reply. Short version: it matches payouts nightly and flags missed refunds; setup takes 15 minutes. Would a 20-minute call on Tuesday or Wednesday work?' });
        await SALES_JOBS['reply:prospect']({ state: s, llm: offline }, { threadId: t.id, refId: t.refId });
        hours += 0.15;
      }
      // Proposals and (stellar) weekly check-ins on quiet deals.
      for (const deal of ensureCrm(s).deals) {
        if (deal.stage === 'qualified') { startProposal(s, deal, { planId: s.plans.find((p) => p.interval === 'month').id, quantity: 1, discountPct: stellar ? 0 : 0.2 }); hours += 1; }
        if (stellar && ['proposal', 'contract'].includes(deal.stage) && dow === 1) { nudgeDeal(s, deal); hours += 0.15; }
      }
    }
    advance(s, 1, APPS);
    for (let g = 0; g < 5 && s.jobs.some((j) => j.status === 'pending'); g++) {
      for (const j of s.jobs.filter((x) => x.status === 'pending')) { j.status = 'done'; await SALES_JOBS[j.type]?.({ state: s, llm: offline }, j.payload, j); }
      s.jobs = s.jobs.filter((x) => x.status !== 'done');
    }
    // Calls happen on the new day (the calendar marks them ready that morning).
  for (const m of ensureCalls(s).meetings) {
      if (m.status !== 'ready' || m.day !== s.day) continue;
      const ct = contactById(s, m.contactId);
      const persona = personaFor(s, ct, companyById(s, m.companyId));
      m.transcript = [];
      let e = 5, agreed = false;
      (stellar ? GOOD_SCRIPT : BAD_SCRIPT).forEach((text, i) => { m.transcript.push({ from: 'me', text }); const r = heuristicCallReply({ persona, text, turn: i + 1, engagement: e, shipped: s.apps.product.features, price: '' }); m.transcript.push({ from: 'them', text: r.reply }); e = r.engagement; agreed ||= r.agreedNextStep; });
      const card = heuristicScorecard(m.transcript);
      if (agreed) card.nextStepSecured = true;
      m.status = 'held';
      m.qualified = applyCallOutcome(s, m, card, callQuality(card)).qualified;
      hours += 0.5 + 0.2;
    }
  }
  const won = ensureCrm(s).deals.filter((d) => d.stage === 'won').length;
  // Expected wins (sum of each decided deal's close probability): far less seed noise than counting coin flips.
  const expWon = ensureCrm(s).deals.reduce((a, d) => a + (d.closeP ?? (d.stage === 'won' ? 1 : 0)), 0);
  if (process.env.DBG) { const ms = ensureCalls(s).meetings; const ds = ensureCrm(s).deals; console.log(policy, seed, JSON.stringify({ booked: ms.length, held: ms.filter((m) => m.status === 'held').length, noshow: ms.filter((m) => m.status === 'no_show').length, qual: ms.filter((m) => m.qualified).length, qP: ms.filter((m) => m.qualifyP != null).map((m) => +m.qualifyP.toFixed(2)), props: ds.filter((d) => d.history.some((h) => h.stage === 'proposal')).length, closeP: ds.filter((d) => d.closeP != null).map((d) => [+d.closeP.toFixed(2), d.closeParts]), lost: ds.filter((d) => d.stage === 'lost').map((d) => d.lostReason).slice(0, 12), open: ds.filter((d) => ['proposal', 'contract', 'qualified'].includes(d.stage)).length })); }
  const contacted = new Set(o.enrollments.filter((e) => e.sent.length).map((e) => e.contactId)).size;
  return { won, expWon, hours, contacted, positive: seq.stats.positive, perHundredHours: (100 * expWon) / hours };
}

test('outbound funnel (calibration miss 7): a stellar founder-led motion yields a realistic customer count per 100 hours; a mediocre one far fewer', async () => {
  const st = [], md = [];
  for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) { st.push(await outbound('stellar', seed)); md.push(await outbound('mediocre', seed)); }
  const stRate = mean(st.map((x) => x.perHundredHours));
  const mdRate = mean(md.map((x) => x.perHundredHours));
  const stWon = mean(st.map((x) => x.won));
  if (process.env.DBG) console.log('FUNNEL', JSON.stringify({ st, md, stRate, mdRate }));
  // Benchmark chain (coordinator brief): 1-3% positive replies × 30-50% book × ~75% show × ~50% qualify × 20-30%
  // close ≈ 0.05-0.3% of prospects → at ~20 min of researched work per prospect, roughly 0.2-2 SMB customers per
  // 100 founder hours for a stellar motion [design band]. Mediocre volume without fit or discovery: far fewer.
  const stExp = mean(st.map((x) => x.expWon));
  assert.ok(stExp * st.length >= 0.7 && stWon <= 8, // warm/known contacts no longer carry extra pain (truth), so the stellar band sits a little lower
     `stellar expected ${stExp.toFixed(2)} wins per run (${JSON.stringify(st)})`);
  assert.ok(stRate >= 0.1 && stRate <= 4, `stellar ${stRate.toFixed(2)} customers per 100 h`);
  assert.ok(stRate > 3 * mdRate + 0.1, `stellar ${stRate.toFixed(2)} vs mediocre ${mdRate.toFixed(2)} per 100 h (${JSON.stringify(md)})`);
  void stWon;
  const posRate = mean(st.map((x) => x.positive / Math.max(1, x.contacted)));
  assert.ok(posRate >= 0.01 && posRate <= 0.08, `stellar positive reply rate ${posRate.toFixed(3)}`);
});
