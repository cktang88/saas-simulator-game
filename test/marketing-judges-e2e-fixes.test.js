import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { classifyAnswer } from '../public/apps/searchtools/judge.js';
import { CREATIVE_SCHEMA, BRIEF_SCHEMA } from '../public/apps/growth/judges.js';
import { judgeIssue } from '../public/apps/audience/judge.js';
import * as llm from '../public/core/llm.js';

const st = () => { const s = newState({ companyName: 'LedgerLoop', model: 'smb', path: 'indie', founderName: 'S', seed: 3 }); ensureStripe(s); delete s.cache; return s; };

test('AI answer check keeps Jev answers consistent: not named means no stance and no wrong fact', async () => {
  const fake = (answers) => ({ state: st(), llm: { decide: async () => ({ answers, mock: false }) } });
  const r = await classifyAnswer(fake({ mentioned: { noul: 0.13 }, stance: { choice: 'listed' }, wrong_fact: { noul: 0.7 } }), { prompt: 'best app', answer: 'Use A2X or Ledger Loop Consulting, a UK firm.' });
  assert.equal(r.mentioned, false); assert.equal(r.stance, 'absent'); assert.equal(r.wrongFact, false);
  const r2 = await classifyAnswer(fake({ mentioned: { noul: 0.97 }, stance: { choice: 'absent' }, wrong_fact: { noul: 0.8 } }), { prompt: 'cost', answer: 'LedgerLoop costs $149 per month on Starter.' });
  assert.equal(r2.mentioned, true); assert.equal(r2.stance, 'listed'); assert.equal(r2.wrongFact, true);
});

test('ad judge schema tells the persona real CTR ranges and keeps evidence short', () => {
  assert.match(CREATIVE_SCHEMA.properties.wouldClick.description, /0\.005-0\.02/);
  assert.match(CREATIVE_SCHEMA.properties.evidence.description, /Under 45 words/);
  assert.match(BRIEF_SCHEMA.properties.missing.description, /At most 4/);
});

test('newsletter judge is importable outside the UI and returns null offline', async () => {
  llm.setSettings({ apiKey: '', enabled: false });
  assert.equal(await judgeIssue({ state: st(), llm }, 'Subject', 'Body text'), null);
  llm.setSettings({ enabled: true });
});
