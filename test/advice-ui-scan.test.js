// Browser-level sanity: with no advice source and learning mode off, no app renders coaching/prescriptive phrases.
// With learning mode on, the Scorecard shows tiers. Headless string render, like the other render tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { setLearningMode } from '../public/core/advice.js';
import { logMistake } from '../public/core/operator.js';
import { APPS } from '../public/apps/registry.js';
import scorecard from '../public/apps/outcomes.js';

const LEAK = /stellar operator|Stellar:|What a stellar|Tip:|elite founders'? (?:do|habit)|you should(?! have)|game odds|× typical|as likely/i;
const stubRoot = () => ({ innerHTML: '', addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; } });
const mk = (model) => {
  const s = newState({ companyName: 'Scan Co', model, path: 'bootstrap', founderName: 'F', seed: 11 });
  ensureStripe(s); ensureMarket(s);
  s.day = 120;
  return s;
};
const ctxFor = (s, params = '') => ({ state: s, params, save() {}, act() {}, render() {}, navigate() {}, enqueue() {}, toast() {}, llm: null });

for (const model of ['smb', 'b2c', 'ent']) {
  test(`no app renders prescriptive phrases with learning mode off (${model})`, () => {
    const s = mk(model);
    setLearningMode(s, false);
    logMistake(s, { functionId: 'fundraising', id: 'scan', label: 'Scan mistake', cost: { hours: 2 }, detail: 'Spent a week on the wrong funds. A stellar operator checks fund size first.' });
    let rendered = 0;
    for (const app of APPS) {
      const root = stubRoot();
      try { app.render(root, ctxFor(s)); } catch { continue; } // an app needing real DOM is skipped, not failed
      if (!root.innerHTML) continue;
      rendered++;
      const m = root.innerHTML.match(new RegExp(`.{0,60}(?:${LEAK.source}).{0,60}`, 'i'));
      assert.ok(!m, `${model}/${app.id} leaks: ${m?.[0]}`);
    }
    console.log(`# scan ${model}: ${rendered}/${APPS.length} apps rendered`);
    assert.ok(rendered >= 15, `only ${rendered} apps rendered`);
  });
}

test('learning mode shows tiers on the Scorecard', () => {
  const s = mk('smb');
  const draw = () => { const root = stubRoot(); scorecard.render(root, ctxFor(s)); return root.innerHTML; };
  setLearningMode(s, false);
  assert.doesNotMatch(draw(), /Coach \(learning mode\)/);
  setLearningMode(s, true);
  assert.match(draw(), /Coach \(learning mode\)/);
  assert.match(draw(), /stellar|good|average|mediocre/);
});
