// Audit (sales and customers in the funnel): personas that claimed more than they did. Each test pins one fix:
// prospects answer from their own hidden person (not the player's research guesses, not a shared template), the offline
// live call is the truth-grounded interviewee, the trial panel seats different people per customer type, offline inbound
// messages follow their archetype, and the renewal customer answers what was asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { archetypes } from '../public/core/network.js';
import { personaFor, fallbackThreadReply } from '../public/apps/sales/replies.js';
import { heuristicCallReply } from '../public/apps/sales/scorecard.js';
import { heuristicResearch, judgeSequenceJob } from '../public/apps/sales/jobs.js';
import { ensureOutreach, ensureCrm } from '../public/apps/sales/model.js';
import { buildPersonas, heuristicTrial, trialSystemPrompt } from '../public/apps/product/panel.js';
import { offlineInbound, offlineScamReply } from '../public/apps/messages/offline.js';
import { renewalSmallTalk } from '../public/apps/success.js';

function fresh(type = 'ecommerce', seed = 3) {
  const s = newState({ companyName: 'Ledgerline', model: 'smb', path: 'indie', founderName: 'Sam Ortiz', seed });
  ensureStripe(s); ensureMarket(s);
  s.company.oneLiner = 'Bookkeeping for Shopify sellers';
  s.company.icp = 'Shopify store owners doing $20k-200k a month';
  s.company.customerType = type;
  return s;
}
const prospect = (i) => {
  const company = { id: `co${i}`, name: `Shop ${i}`, domain: `shop${i}.com`, industry: 'ecommerce', size: '2-10' };
  return { company, contact: { id: `ct${i}`, email: `a${i}@shop${i}.com`, name: `Pat ${i}`, title: 'Owner', companyId: company.id } };
};
function findPersonas(s, n = 60) {
  const pain = [], none = [];
  for (let i = 0; i < n; i++) { const { company, contact } = prospect(i); const p = personaFor(s, contact, company); (p.hasPain ? pain : none).push({ p, company, contact }); }
  return { pain, none };
}
function runCall(persona, script, seed) {
  const tr = []; let e = 5, agreed = false; const revealed = new Set();
  for (const q of script) {
    const r = heuristicCallReply({ persona, text: q, engagement: e, history: tr.slice(), seed, shipped: [{ title: 'Payout matching' }] });
    tr.push({ from: 'me', text: q }); tr.push({ from: 'them', text: r.reply, revealed: r.revealed });
    for (const k of r.revealed ?? []) revealed.add(k);
    e = r.engagement; agreed ||= r.agreedNextStep;
  }
  return { tr, revealed: revealed.size, agreed, e };
}
const STELLAR = ['Hi, thanks for making time.', 'Tell me about the last time your payouts did not match your orders?', 'What did you do about it?', 'How often does that happen?', 'What does that cost you today, roughly, in tools and time?', 'Who else is involved when you pick a tool like this?', 'Could we set up a follow-up call next week to show you a prototype on your own data?'];
const MEDIOCRE = ['Let me show you our product demo, it automatically reconciles everything with AI.', "Wouldn't it be great to never reconcile again?", 'Would you use something like that?', 'How much would you pay for it?', 'Could we set up a follow-up call next week?'];

test('persona pain and incident come from the hidden person, never from the player\'s research guesses', () => {
  const s = fresh();
  const { pain } = findPersonas(s);
  assert.ok(pain.length >= 2, 'some prospects have the problem');
  const { p, company, contact } = pain[0];
  company.research = heuristicResearch(s, company); // the player's offline hypotheses about this company
  const withResearch = personaFor(s, contact, company);
  assert.equal(withResearch.pain, p.pain, 'researching a company does not change what the prospect really feels');
  for (const h of company.research.pains) assert.ok(!withResearch.pain.includes(h));
  assert.ok(!/\bthem\b|\btheir ops\b/.test(withResearch.lastIncident), 'incident is spoken in the first person');
  assert.doesNotMatch(withResearch.lastIncident, /get the main job done/);
  assert.match(withResearch.lastIncident, /ago|yesterday/, 'the incident is the person\'s own (dated), not a shared pool line');
});

test('offline research hypotheses differ per company instead of three constant lines', () => {
  const s = fresh();
  const a = heuristicResearch(s, { name: 'A', domain: 'a.com', size: '3', site: { title: 'Candles', headings: ['Hand-poured soy candles shipped worldwide'], text: 'shopify store' } });
  const b = heuristicResearch(s, { name: 'B', domain: 'b.com', size: '120', site: { title: 'Outdoor gear', headings: ['Gear for every trail since 1998'], text: 'retail and wholesale' } });
  assert.notDeepEqual(a.pains, b.pains);
  assert.ok(!a.pains.includes("Tools that don't talk to each other"));
});

test('offline live call: small talk is small talk, no sales jargon, repeats are noticed, two prospects differ', () => {
  const s = fresh();
  const { pain, none } = findPersonas(s);
  const a = runCall(pain[0].p, ['Hi, how is your week going?', 'Who decides on tools like this?', 'Who decides on tools like this?'], 'm1');
  const b = runCall(none[0].p, ['Hi, how is your week going?', 'Who decides on tools like this?'], 'm2');
  const first = a.tr[1].text;
  assert.ok(!first.includes(pain[0].p.lastIncident), `small talk does not dump the pain: ${first}`);
  for (const t of [...a.tr, ...b.tr].filter((m) => m.from === 'them')) assert.doesNotMatch(t.text, /economic buyer|champion|budget influencer|decision process/i);
  assert.match(a.tr[5].text, /asked|said|covered|same answer/i, `repeat noticed: ${a.tr[5].text}`);
  const tellPain = runCall(pain[0].p, ['Tell me about the last time your payouts did not match your orders?'], 'x').tr[1].text;
  const tellNone = runCall(none[0].p, ['Tell me about the last time your payouts did not match your orders?'], 'x').tr[1].text;
  assert.notEqual(tellPain, tellNone);
  assert.match(tellPain, /ago|yesterday/, 'the person with the problem gives their real last incident');
});

test('tiers separate on the offline call: Mom Test discovery earns facts and a next step, pitching earns neither', () => {
  const s = fresh();
  const { pain } = findPersonas(s, 120);
  const sample = pain.slice(0, 6);
  const st = sample.map(({ p }, i) => runCall(p, STELLAR, `st${i}`));
  const md = sample.map(({ p }, i) => runCall(p, MEDIOCRE, `md${i}`));
  const mean = (xs, f) => xs.reduce((a, x) => a + f(x), 0) / xs.length;
  assert.ok(mean(st, (x) => x.revealed) >= 3, `stellar learns facts: ${mean(st, (x) => x.revealed)}`);
  assert.ok(mean(md, (x) => x.revealed) <= 0.5, `mediocre learns nothing: ${mean(md, (x) => x.revealed)}`);
  assert.ok(mean(st, (x) => (x.agreed ? 1 : 0)) > mean(md, (x) => (x.agreed ? 1 : 0)), 'next steps follow the discovery');
  assert.ok(mean(st, (x) => x.e) > mean(md, (x) => x.e) + 1, 'engagement rises with good questions and falls with pitching');
});

test('offline email thread: a specific question gets one real fact, remembered, and prospects do not answer alike', () => {
  const s = fresh();
  const { pain, none } = findPersonas(s);
  const q = 'When was the last time a payout did not match your orders?';
  const r1 = fallbackThreadReply({ kind: 'curious', persona: pain[0].p, founderText: q, history: [], seed: 'ct-a', detail: true });
  const r2 = fallbackThreadReply({ kind: 'curious', persona: none[0].p, founderText: q, history: [], seed: 'ct-b', detail: true });
  assert.deepEqual(r1.revealed, ['lastIncident']);
  assert.notEqual(r1.text, r2.text);
  const again = fallbackThreadReply({ kind: 'curious', persona: pain[0].p, founderText: q, history: [{ from: 'me', text: q }, { from: 'them', text: r1.text, revealed: r1.revealed }], seed: 'ct-a', detail: true });
  assert.equal(again.revealed.length, 0, 'the same fact is not re-revealed as new');
});

test('cold email judge offline: one verdict per prospect, in that prospect\'s situation (no identical duplicates)', async () => {
  const s = fresh();
  const o = ensureOutreach(s);
  const { pain, none } = findPersonas(s);
  const crm = ensureCrm(s);
  for (const x of [pain[0], none[0]]) { crm.companies.push(x.company); crm.contacts.push({ ...x.contact, personalization: 'Saw you ship candles worldwide' }); }
  const seq = { id: 'sq1', steps: [{ subject: 'payouts', body: 'Hi {{firstName}}, {{personalization}}. When payouts and orders drift apart, who fixes it? Worth 15 minutes?' }] };
  o.sequences.push(seq);
  for (const x of [pain[0], none[0]]) o.enrollments.push({ sequenceId: 'sq1', contactId: x.contact.id, sent: [] });
  const calls = [];
  const llm = { panel: async (opts) => { calls.push(opts.system); return [1, 2, 3].map((m) => ({ data: opts.fallback(), mock: true, model: `m${m}` })); } };
  await judgeSequenceJob({ state: s, llm }, { sequenceId: 'sq1' });
  const j = Object.values(seq.judge)[0];
  assert.equal(j.verdicts.length, 2, 'one offline verdict per sampled prospect, not one per model');
  assert.notEqual(j.verdicts[0].verdict, j.verdicts[1].verdict);
  assert.ok(calls.every((c) => /What you use today/.test(c)), 'the judge prompt is the prospect\'s own situation');
});

test('trial panel: four different people per customer type, own prompts, hidden pain changes the outcome', () => {
  const eco = buildPersonas(fresh('ecommerce'));
  const st = buildPersonas(fresh('startups'));
  assert.equal(eco.length, 4);
  assert.deepEqual(eco.map((p) => p.seat), ['user', 'champion', 'economic_buyer', 'skeptic']);
  assert.equal(new Set(eco.map((p) => p.name)).size, 4);
  assert.notDeepEqual(eco.map((p) => p.title), st.map((p) => p.title), 'customer type decides who is on the panel');
  const prompts = eco.map((p) => trialSystemPrompt(p, { realism: '' }));
  assert.equal(new Set(prompts).size, 4, 'one system prompt per panelist');
  for (const p of eco) assert.ok(!JSON.stringify(p).includes('undefined'));
  const s = fresh('ecommerce');
  s.market.fit.product.score = 0.8;
  s.company.website = { title: 'Ledgerline' };
  const feats = [{ id: 'f1', title: 'Payout matching', solution: 'Matches Shopify payouts to orders nightly' }, { id: 'f2', title: 'Monthly P&L', solution: 'Builds a P&L report with csv export' }];
  const base = eco[0];
  const withPain = heuristicTrial(s, { ...base, hidden: { ...(base.hidden ?? {}), hasPain: true, painIntensity: 0.8, lastIncidentDays: 9, workaround: 'a spreadsheet' } }, feats, { priceMonthly: 39 });
  const noPain = heuristicTrial(s, { ...base, hidden: { ...(base.hidden ?? {}), hasPain: false, painIntensity: 0 } }, feats, { priceMonthly: 39 });
  assert.ok(withPain.willingnessToPayMonthly > noPain.willingnessToPayMonthly);
  assert.ok(withPain.churnRisk < noPain.churnRisk);
  assert.notEqual(withPain.quote, noPain.quote);
  const quotes = eco.map((p) => heuristicTrial(s, p, feats, { priceMonthly: 39 }).quote);
  assert.ok(new Set(quotes).size >= 3, `panelists speak in their own voices: ${quotes.join(' | ')}`);
  const skeptic = heuristicTrial(s, eco[3], feats, { priceMonthly: 39 });
  assert.ok(skeptic.missingMustHaves.length >= 1, 'the skeptic names their own deal-breaker');
});

test('offline inbound messages follow their archetype: a fake investor is not a lead-gen email', () => {
  const s = fresh();
  const all = archetypes();
  const msgs = all.map((a) => offlineInbound(s, a, { id: `in_${a.id}`, outcome: 'waste' }, { first: 'Jordan', last: 'Hale' }));
  assert.equal(new Set(msgs.map((m) => m.message)).size, all.length, 'every archetype has its own message');
  const by = (id) => msgs[all.findIndex((a) => a.id === id)];
  assert.match(by('fake_investor').message, /fee|family office|documents/i);
  assert.match(by('fake_investor').senderEmail, /gmail/, 'the free-mail sender is one of its tells');
  assert.notEqual(by('fake_investor').message, by('leadgen_agency').message);
  assert.notEqual(offlineScamReply('fake_investor'), offlineScamReply('pay_to_speak_or_award'));
});

test('renewal customer offline answers what was asked and does not repeat itself', () => {
  const s = fresh();
  const acct = { usage: 0.25, health: 45, champion: 'present', renewal: {} };
  const u = renewalSmallTalk(s, acct, 'How is the team using it these days?', []);
  assert.match(u, /seats|log in|unused/i);
  const t1 = renewalSmallTalk(s, acct, 'Thanks for joining.', []);
  const t2 = renewalSmallTalk(s, acct, 'Thanks for joining.', [{ from: 'them', text: t1 }]);
  assert.notEqual(t1, t2);
});
