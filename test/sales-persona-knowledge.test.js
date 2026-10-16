// Fixes from the live sales-cluster review (docs/review/llm-e2e/sales.md): what each persona may know about the
// seller, and the anti-gaming rules that the live runs showed were needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { personaSystem } from '../public/apps/sales/jobs.js';
import { answersQuestion, replyQuality } from '../public/apps/sales/copy.js';
import { meetingProbability } from '../public/apps/sales/replies.js';
import { questionCredits } from '../public/apps/sales/scorecard.js';

function state() {
  const s = newState({ companyName: 'Ledgerline', model: 'smb', path: 'indie', founderName: 'Sam Ortiz', seed: 3 });
  ensureStripe(s);
  s.company.oneLiner = 'Bookkeeping for Shopify sellers';
  s.plans[0].price = 39;
  s.apps.product = { features: [{ id: 'f1', title: 'Faire wholesale import', status: 'shipped' }] };
  return s;
}
const persona = { name: 'Maya', title: 'Owner', company: 'Harbor & Pine', pain: 'payouts', lastIncident: 'x', currentTools: 'a spreadsheet', timeline: 'this quarter', budgetStance: 'some', budgetRange: [20, 40], authority: 'economic buyer', decisionProcess: 'decides alone', objection: 'switching' };

test('cold and thread prospects know only the message; calls get ground truth they must not volunteer', () => {
  const s = state();
  const cold = personaSystem(s, {}, {}, persona, { know: 'cold' });
  const thread = personaSystem(s, {}, {}, persona, { know: 'thread' });
  const call = personaSystem(s, {}, {}, persona, { know: 'call' });
  const cust = personaSystem(s, {}, {}, persona, { know: 'customer' });
  for (const p of [cold, thread]) { assert.doesNotMatch(p, /\$39/); assert.doesNotMatch(p, /Faire wholesale import/); }
  assert.match(call, /Faire wholesale import/); assert.match(call, /never name these features yourself/); assert.doesNotMatch(call, /\$39/);
  assert.match(cust, /\$39/); assert.doesNotMatch(cust, /budget range|three good questions/);
  for (const p of [cold, call, cust]) assert.doesNotMatch(p, /Authority: economic buyer/); // jargon rephrased
});

test('answering the prospect\'s question earns the meeting; pushy buzzword replies lose odds', () => {
  const q = 'We use a spreadsheet. How is this different, and what does it cost?';
  const strong = 'Spreadsheets break when Faire and Shopify payouts land on different days; we match each payout to its orders. It is $39/month. 15 minutes Thursday?';
  const pushy = 'Our revolutionary all-in-one platform will 10x you!! Just say yes, any time works. Can we jump on a call today? Tomorrow?';
  assert.equal(answersQuestion(q, strong), 1);
  assert.equal(answersQuestion(q, pushy), 0);
  assert.equal(answersQuestion('Thanks, noted.', pushy), null);
  const p = (body) => meetingProbability({ kind: 'curious', asked: true, quality: replyQuality(body) * (0.55 + 0.45 * answersQuestion(q, body)) });
  assert.ok(p(strong) >= 1.5 * p(pushy), `${p(strong)} vs ${p(pushy)}`);
});

test('stacked keyword questions are detected (scorecard caps discovery at 4 for 2+ stacked turns)', () => {
  const t = [
    { from: 'me', text: 'Walk me through the last time, what did you try, what did that cost, who else, what happens if?' },
    { from: 'them', text: 'That is a lot of questions.' },
    { from: 'me', text: 'Last time? Walk me through? Who else? What did it cost? What happens if?' },
  ];
  assert.ok(questionCredits(t).stacked.length >= 2);
  assert.equal(questionCredits([{ from: 'me', text: 'Tell me about the last time the payouts did not match?' }]).stacked.length, 0);
});
