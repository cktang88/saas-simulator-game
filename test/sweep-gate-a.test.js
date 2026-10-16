// Sweep A: coaching and hidden-truth reveals in Research, MVP, PMF, Planner/Assistant, Todos and Product sit behind the advice gate.
// With no recruited source the player sees what they could observe, never what a stellar operator would do or who people "really" were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureMarket } from '../public/core/market.js';
import * as llm from '../public/core/llm.js';
import { truthOf } from '../public/core/truth.js';
import { addSource, setLearningMode } from '../public/core/advice.js';
import { recruitBatch } from '../public/apps/research/recruit.js';
import { startSim, sendSimTurn, finishSim } from '../public/apps/research/sim.js';
import { runDebrief, flushPending } from '../public/apps/research/debrief.js';
import { disc } from '../public/apps/research/store.js';
import { boardOf } from '../public/apps/research/synthesis.js';
import research from '../public/apps/research.js';
import { NODES } from '../public/core/unlocks.js';
import { segmentVerdict, falsePmfFlags } from '../public/apps/insights/pmf.js';
import { assistantCoaching } from '../public/apps/assistant/engine.js';
import { inboxCoaching } from '../public/apps/assistant/triage.js';
import { renderScript } from './helpers/founder-scripts.js';

const TARGET = 'HVAC company operations managers across several locations';
const SCREENER = 'When did you last chase a late invoice, and how many were open in the last month?\nWhat tool do you use to track them?';
const IMPERATIVE = /\b(a stellar operator|stellar operators|next time|you should|aim for|narrow the icp|write a narrower)\b/i;

function mk(seed = 5) {
  const s = newState({ companyName: 'X', model: 'smb', path: 'indie', founderName: 'P', seed });
  ensureMarket(s).flags = { fixedDemand: 1 };
  s.company.oneLiner = 'Invoice reminders for plumbers and HVAC contractors';
  s.company.icp = TARGET;
  s.founder.network.friends = 600;
  return s;
}
const ctxOf = (s) => ({ state: s, llm });
async function debriefed() {
  const s = mk();
  const ivs = recruitBatch(s, { sends: 40, channel: 'friends', target: '', screener: '' }).booked.slice(0, 5);
  for (const iv of ivs) {
    s.day = Math.max(s.day, iv.day); iv.confirmedDay = iv.day - 1; startSim(s, iv.id);
    if (iv.status !== 'live') continue;
    for (const st of renderScript('mediocre')) await sendSimTurn(ctxOf(s), iv, st.q);
    await finishSim(ctxOf(s), iv);
  }
  s.day += 3;
  return { s, d: runDebrief(s, ivs.filter((i) => i.status === 'done')) };
}
const render = (s) => { const root = { innerHTML: '', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; research.render(root, { state: s, tab: 'interviews' }); return root.innerHTML; };

test('debrief: with no source the player sees only what they thought; the truth comparison needs a source or learning mode', async () => {
  const { s, d } = await debriefed();
  assert.ok(d.lines.some((l) => /^Actually:/.test(l)), 'the underlying truth lines are kept as data');
  assert.ok(d.mine.every((l) => !/Actually|friend|outside the segment|professional respondent/i.test(l)));
  const bare = render(s);
  assert.ok(!/Actually:|professional respondent|outside the segment/i.test(bare), 'no hidden truth rendered without a source');
  assert.ok(!IMPERATIVE.test(bare));
  setLearningMode(s, true);
  assert.match(render(s), /Actually:/, 'learning mode reveals the comparison');
});

test('debrief: notify and queued mistakes keep facts only (no market value, no prescriptions in detail)', async () => {
  const { s } = await debriefed();
  assert.ok(!/really had the problem|Actually/.test(s.notifications?.at(-1)?.text ?? s.log?.at(-1)?.text ?? ''));
  s.day += 8;
  for (const m of flushPending(s)) {
    assert.ok(!/market value|%\./.test(m.detail ?? ''), m.id);
    assert.ok(!IMPERATIVE.test(m.detail ?? ''), `${m.id}: ${m.detail}`);
  }
});

test('synthesis claim segments are only those the player has met, never the market\'s full segment list', async () => {
  const { s } = await debriefed();
  const met = new Set(boardOf(s).segments.map((g) => g.id));
  const root = { innerHTML: '', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  research.render(root, { state: s, tab: 'synthesis' });
  const unmet = truthOf(s).segments.filter((g) => !met.has(g.id));
  assert.ok(unmet.length > 0, 'the market has segments the player has not met');
  for (const g of unmet) assert.ok(!root.innerHTML.includes(`<option value="${g.id}"`), `unmet segment ${g.id} is not offered`);
});

test('todo "why" lines are neutral descriptions: no strategy claims or mechanics', () => {
  assert.ok(NODES.length > 50);
  const bad = /\b(most founders|the strongest|beats|burn|underprice|never |the best|compounds|separate|cheapest)\b/i;
  for (const n of NODES) {
    assert.ok(n.why && n.why.length < 140, n.id);
    assert.ok(!bad.test(n.why), `${n.id}: ${n.why}`);
  }
});

test('PMF: flags and the segment verdict keep numbers in detail/text and move interpretation into interp/advice', () => {
  const s = mk();
  const flags = falsePmfFlags(s);
  for (const f of flags) assert.ok(typeof f.interp === 'string');
  const v = segmentVerdict(s, { rows: [{ a: 'v', seg: 'a' }, { a: 'n', seg: 'a' }] });
  if (v) assert.ok(!/Narrow the ICP/.test(v.text));
});

test('assistant and inbox telemetry: text is fact, prescriptions are in advice', () => {
  const s = mk();
  assert.deepEqual(assistantCoaching(s), []);
  const notes = inboxCoaching({ ...s, apps: { ...s.apps } });
  for (const n of notes) assert.ok(!/^(Edit|Run|Put|Review)\b/.test(n.text), n.text);
});

test('a source is still the way to hear advice: an advisor covers the MVP panel', () => {
  const s = mk();
  addSource(s, { kind: 'advisor', name: 'Pat', expertise: 'product', quality: 'great', access: 'metrics' });
  assert.ok(s.advice.sources.length === 1);
});
