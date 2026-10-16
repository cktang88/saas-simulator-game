// Advice sweep (growth, people, legal, money, support, ops): hidden-truth prescriptions go through the advice gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { post } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { registerOperatorReader } from '../public/core/operator.js';
import { addSource, setLearningMode, inbox } from '../public/core/advice.js';
import { resolveInbound, ensureNetwork } from '../public/core/network.js';
import { adviceBlock } from '../public/core/adviceUi.js';
import { splitLesson } from '../public/core/operator.js';

const mk = () => {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'vc', founderName: 'F', seed: 11 });
  ensureStripe(s); ensureMarket(s);
  post(s, { amount: 30000, counterparty: 'F', category: 'owner_contribution' });
  s.day = 100;
  return s;
};

test('adviceBlock renders nothing without a source, the lines with a source or learning mode', () => {
  const s = mk();
  const lines = ['Edit every AI draft for product accuracy before publishing.'];
  assert.equal(String(adviceBlock(s, 'content_seo_geo', lines)), '');
  setLearningMode(s, true);
  assert.match(String(adviceBlock(s, 'content_seo_geo', lines)), /Edit every AI draft/);
  setLearningMode(s, false);
  addSource(s, { kind: 'advisor', name: 'Dana', expertise: 'growth', quality: 'great', access: 'full' });
  assert.match(String(adviceBlock(s, 'content_seo_geo', lines)), /Dana/);
});

test('"gave useful advice" produces real content from that contact as a source with a hidden quality', () => {
  const s = mk();
  registerOperatorReader('hiring', () => ({ tier: 'mediocre', evidence: ['2 hires'], coaching: ['Score every candidate against the same scorecard before the offer.'] }));
  const n = ensureNetwork(s);
  n.people.push({ id: 'per_x', name: 'Rowan Hale', role: 'Operator', company: 'Acme', email: 'r@x.co' });
  const inb = { id: 'inb_x', outcome: 'advice', personId: 'per_x', resolved: false };
  const msg = resolveInbound(s, inb);
  assert.match(msg, /Rowan Hale gave you advice on/);
  assert.doesNotMatch(msg, /genuinely useful/);
  const src = s.advice.sources.find((x) => x.refs?.personId === 'per_x');
  assert.ok(src, 'the contact becomes a peer/mentor source');
  assert.ok(inbox(s).length >= 1, 'the advice lands in the inbox');
  // deterministic: same state, same quality
  const s2 = mk(); ensureNetwork(s2).people.push({ id: 'per_x', name: 'Rowan Hale', role: 'Operator', company: 'Acme', email: 'r@x.co' });
  resolveInbound(s2, { id: 'inb_x', outcome: 'advice', personId: 'per_x', resolved: false });
  assert.equal(s2.advice.sources.find((x) => x.refs?.personId === 'per_x').quality, src.quality);
});

test('a mistake detail stays factual: the stellar-operator sentence is split into the lesson', () => {
  const { fact, lesson } = splitLesson('Dispute 123: late proof. A stellar operator attaches dated proof that exists, or accepts the dispute.');
  assert.doesNotMatch(fact, /stellar/i);
  assert.match(lesson, /stellar operator/i);
});
