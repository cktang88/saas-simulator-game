// Inbound senders only know what the company made public (core/public-facts.js). Bug report: "I get emails from people
// saying congrats on Series A when I haven't raised anything". Causes were an offline vendor template that always said
// "congrats on the recent raise", archetype prompts/red flags that told the model to cite "funding news" or "the wrong
// round" regardless of state, and a public-activity line without the round name. These tests generate many inbound
// messages offline (and through the LLM job with a stub that invents news) and check nothing false gets through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { archetypes, ensureNetwork, recordPublicEvent } from '../public/core/network.js';
import { offlineInbound } from '../public/core/inbound-text.js';
import { publicFacts, falseClaims, scrubClaims, factsToldIn } from '../public/core/public-facts.js';
import messagesApp from '../public/apps/messages.js';

const company = (seed) => {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'vc', founderName: 'Pat Doe', seed });
  s.company.oneLiner = 'invoice reconciliation for small accounting firms';
  s.company.domain = 'ledgerly.io';
  return s;
};
// Independent of the module's own patterns: the phrases players actually saw.
const FUNDING_TALK = /congrat\w*[^.!?]*\b(raise|raised|round|funding|seed|series)\b|\b(your|recent|just|on the)\s+(\w+\s+)?(raise|raised|round|funding|seed|series [a-e])\b/i;
const LAUNCH_TALK = /congrat\w*[^.!?]*\blaunch|\bsaw your launch\b|\bproduct hunt (launch|rank)/i;

test('un-funded, pre-launch company: no offline inbound message claims a raise, a launch, an MRR post or a hire', () => {
  let n = 0;
  for (const seed of [1, 2, 3]) {
    const s = company(seed);
    recordPublicEvent(s, 'fundraise_started', { stage: 'seed' }); // "we're raising" is not a raise
    s.apps.fundraising = { raise: { id: 'r1', stage: 'seed' } };
    const facts = publicFacts(s);
    assert.equal(facts.funding, null);
    assert.equal(facts.launched, false);
    for (const a of archetypes()) {
      for (const o of a.valueOutcomes ?? [{ outcome: 'waste' }]) {
        for (let i = 0; i < 12; i++) {
          const m = offlineInbound(s, a, { id: `inb_${seed}_${a.id}_${o.outcome}_${i}`, outcome: o.outcome, channel: a.channel }, { first: 'Jo', last: 'Hale' });
          const text = `${m.subject}\n${m.message}`;
          assert.doesNotMatch(text, FUNDING_TALK, `${a.id}: ${text}`);
          assert.doesNotMatch(text, LAUNCH_TALK, `${a.id}: ${text}`);
          assert.deepEqual(falseClaims(s, text), [], `${a.id}: ${text}`);
          n++;
        }
      }
    }
  }
  assert.ok(n > 1000, `${n} messages checked`);
});

test('a company that announced a seed round gets seed references, never Series A', () => {
  const s = company(5);
  s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] };
  recordPublicEvent(s, 'funding_announced', { amount: 2_000_000, stage: 'seed', label: 'seed round' });
  const a = archetypes().find((x) => x.id === 'saas_tool_vendor');
  let seedRefs = 0;
  for (let i = 0; i < 80; i++) {
    const m = offlineInbound(s, a, { id: `v${i}`, outcome: 'waste', channel: 'email' }, { first: 'Jo', last: 'Hale' }).message;
    assert.doesNotMatch(m, /series a/i);
    if (/congrats on the seed round/i.test(m)) seedRefs++;
  }
  assert.ok(seedRefs > 5, `the announced round is used by templates that cite it (${seedRefs})`);
  const fixed = scrubClaims(s, 'Hi Pat, congrats on the Series A! Teams like Ledgerly use us.');
  assert.equal(fixed.text, 'Hi Pat, congrats on the seed round! Teams like Ledgerly use us.');
  // Old saves: an announcement without a round name reads the round from the fundraising history.
  const t = company(6);
  t.apps.fundraising = { rounds: [{ day: t.day, instrument: 'priced', stage: 'seed', amount: 3e6 }] };
  recordPublicEvent(t, 'funding_announced', { amount: 3e6 });
  assert.equal(publicFacts(t).funding.label, 'seed round');
});

test('LLM path: a model that invents a raise or launch is corrected before the founder sees it; the prompt states the facts', async () => {
  const s = company(9);
  const n = ensureNetwork(s);
  const prompts = [];
  const invented = {
    senderName: 'Jo Hale', senderRole: 'AE', senderCompany: 'Dashly', senderEmail: 'jo@dashly.com', subject: 'Congrats on the Series A',
    message: 'Hi Pat, congrats on the Series A and the Product Hunt launch! Teams like Ledgerly use Dashly to see churn and expansion in one place. Worth a 15-minute look next week?',
    hiddenAgenda: 'vendor',
  };
  const ctx = { state: s, llm: { ask: async (o) => { prompts.push(o); return { data: { ...invented }, mock: false }; } } };
  const a = archetypes().find((x) => x.id === 'saas_tool_vendor');
  const inb = { id: 'inb_llm1', archetypeId: a.id, category: a.category, channel: 'email', day: s.day, outcome: 'waste', status: 'pending', engaged: 0 };
  n.inbound.push(inb);
  await messagesApp.jobs['network:inbound'](ctx, { inboundId: inb.id });
  const all = `${prompts[0].system}\n${prompts[0].prompt}`;
  assert.match(all, /NO round has been announced/);
  assert.match(all, /has NOT launched/);
  assert.doesNotMatch(all, /wrong round/i, 'the "wrong round" red flag is not offered to a company with no round');
  const thread = s.mail.threads.find((t) => t.refId === inb.id);
  const delivered = `${thread.subject}\n${thread.messages.map((m) => m.body).join('\n')}`;
  assert.doesNotMatch(delivered, /series a|product hunt/i, delivered);
  assert.match(delivered, /Dashly/);
  assert.deepEqual(inb.scrubbed.sort(), ['funding', 'funding+launch+product_hunt'].sort());
});

test('true public news is kept: after a real launch and announced round, congratulations stay', () => {
  const s = company(11);
  s.apps.product = { features: [{ id: 'f1', title: 'x', status: 'shipped' }] };
  recordPublicEvent(s, 'product_hunt_launch', { rank: 4 });
  recordPublicEvent(s, 'funding_announced', { amount: 1.5e6, stage: 'seed', label: 'seed round' });
  const text = 'Hi Pat, congrats on the seed round and the Product Hunt launch! Worth a chat?';
  assert.deepEqual(falseClaims(s, text), []);
  assert.equal(scrubClaims(s, text).text, text);
  // A sender's own thesis is not a claim about the company.
  const u = company(12);
  assert.deepEqual(falseClaims(u, 'We invest at pre-seed and seed in B2B software. We lead the seed round for tools like yours.'), []);
  // What the founder told this sender in the thread is known to them: a reply may congratulate it.
  const told = factsToldIn(u, 'We just closed our seed round last week.');
  assert.equal(scrubClaims(u, 'Congrats on the seed round! Happy to chat.', told).changed, false);
  assert.equal(scrubClaims(u, 'Congrats on the seed round! Happy to chat.').text, 'Happy to chat.');
});
