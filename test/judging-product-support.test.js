// Rubric-backed LLM judges for product, customer research and support: the rubric is in the prompt, the schema carries
// one integer per criterion, the offline fallback has the full shape, and strong vs weak samples separate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weighted } from '../public/core/rubric.js';
import { criteriaSchema, unit, percent } from '../public/core/rubric-schema.js';
import { SPEC_CRITERIA, VALUE_CRITERIA, VALUE_RUBRIC, INTERVIEW_CRITERIA, NOTES_CRITERIA, INTERVIEWEE_RULES } from '../public/apps/product/rubrics.js';
import { GRADER_SYSTEM, GRADE_SCHEMA, DIMS } from '../public/apps/product/spec.js';
import { VALUE_SCHEMA, valueFromJudgment, valueFallback } from '../public/apps/product/fit.js';
import { gradeTranscript, extractFromNotes, intervieweeSystem, makeFacts } from '../public/apps/product/interview.js';
import { GRADER_INTERVIEW, GRADER_NOTES, INTERVIEW_GRADE_SCHEMA, NOTES_SCHEMA } from '../public/apps/research.js';
import * as R from '../public/apps/support/rubrics.js';

const keys = (cs) => cs.map((c) => c.key);
const complete = (schema, obj) => schema.required.every((k) => k in obj);

test('every rubric criterion has 1/3/5 (or 0/2/4 for the spec) anchors, and is rendered into its prompt', () => {
  const sets = [[SPEC_CRITERIA, GRADER_SYSTEM, [0, 2, 4]], [VALUE_CRITERIA, VALUE_RUBRIC, [1, 3, 5]],
    [INTERVIEW_CRITERIA, GRADER_INTERVIEW, [1, 3, 5]], [NOTES_CRITERIA, GRADER_NOTES, [1, 3, 5]],
    [R.PROCEDURE_CRITERIA, R.PROCEDURE_SYSTEM, [1, 3, 5]], [R.ARTICLE_CRITERIA, R.ARTICLE_SYSTEM, [1, 3, 5]],
    [R.RESPONSE_CRITERIA, R.RESPONSE_SYSTEM, [1, 3, 5]], [R.REPLY_CRITERIA, R.replySystem({ name: 'Dana', label: 'Billing', company: 'Acme', waited: 0 }), [1, 3, 5]]];
  for (const [crit, prompt, anchors] of sets) {
    for (const c of crit) {
      assert.deepEqual(Object.keys(c.anchors).map(Number), anchors, c.key);
      for (const v of Object.values(c.anchors)) assert.ok(v.length > 10, c.key);
      assert.ok(prompt.includes(`- ${c.key} (`), `${c.key} missing from prompt`);
    }
  }
  assert.ok(GRADER_SYSTEM.includes('1 and 3 fall between'), 'spec scale is 0-4');
});

test('schemas are strict: one integer per criterion, all required, no extras', () => {
  for (const [s, crit] of [[R.PROCEDURE_SCHEMA, R.PROCEDURE_CRITERIA], [R.ARTICLE_RUBRIC_SCHEMA, R.ARTICLE_CRITERIA], [R.RESPONSE_SCHEMA_RUBRIC, R.RESPONSE_CRITERIA], [R.REPLY_RUBRIC_SCHEMA, R.REPLY_CRITERIA], [VALUE_SCHEMA, VALUE_CRITERIA]]) {
    assert.equal(s.additionalProperties, false);
    assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
    for (const k of keys(crit)) assert.equal(s.properties[k].type, 'integer');
  }
  assert.ok(GRADE_SCHEMA.required.includes('blockingIssues') && DIMS.length === 5);
  assert.deepEqual(keys(SPEC_CRITERIA), DIMS.map(([k]) => k));
});

test('feature_market_value: derived judgment separates a display-only widget from a workflow feature; old shape still works', () => {
  const weak = valueFromJudgment({ icp_fit: 2, problem_frequency: 2, manual_work_removed: 1, acts_on_data: 1, not_free_elsewhere: 1 });
  const strong = valueFromJudgment({ icp_fit: 5, problem_frequency: 5, manual_work_removed: 5, acts_on_data: 5, not_free_elsewhere: 4 });
  assert.ok(strong > 0.8 && weak < 0.1, `${strong} vs ${weak}`);
  assert.equal(valueFromJudgment({ relevance: 1, removesWorkaround: 1, displayOnly: false }), 1);
  assert.ok(complete(VALUE_SCHEMA, valueFallback(0.5)));
});

test('interview_grade fallback has the full shape and criteria separate strong from weak interviews', () => {
  const persona = { facts: makeFacts(() => 0.1, { model: 'smb' }) };
  const msgs = (qs, replies) => qs.flatMap((q, i) => [{ from: 'me', text: q }, { from: 'them', text: replies[i].t ?? 'ok', revealed: replies[i].r ?? [], commitment: replies[i].c ?? 'none' }]);
  const strong = gradeTranscript(msgs(['Tell me about the last time you closed the books.', 'What do you use today to track receipts?', 'What does that cost you each month?', 'Who else decides on tools?', 'Could we try a pilot with one client next week?'],
    [{ r: ['lastTime'] }, { r: ['workaround'] }, { r: ['spend'] }, { r: ['decision'] }, { c: 'pilot' }]), persona);
  const weak = gradeTranscript(msgs(['Wouldn\'t it be great if receipts chased themselves?', 'We\'re building an app that does this, would you pay $50 for it?', 'Don\'t you hate month-end?'], [{}, {}, {}]), persona);
  assert.ok(complete(INTERVIEW_GRADE_SCHEMA, strong));
  const s = percent(strong, INTERVIEW_CRITERIA), w = percent(weak, INTERVIEW_CRITERIA);
  assert.ok(s - w >= 40, `${s} vs ${w}`);
  assert.ok(strong.score > weak.score);
});

test('interview_notes fallback has the full shape and specific notes beat compliment notes', () => {
  const good = extractFromNotes('Last Tuesday she spent 3 hours chasing 14 receipts by email; she tracks them in a spreadsheet and pays a freelancer $200 a month. "I lose a day every close." She agreed to a pilot next week.', ['pilot']);
  const bad = extractFromNotes('She loved the idea and said she would definitely use it and would definitely buy it. Sounds great, great idea, she thinks many people would love this product.', []);
  assert.ok(complete(NOTES_SCHEMA, good));
  assert.ok(percent(good, NOTES_CRITERIA) - percent(bad, NOTES_CRITERIA) >= 40);
  assert.ok(good.quality > bad.quality);
});

test('interview_chat: interviewee prompt stays in character and carries the reveal rules', () => {
  const persona = { name: 'Dana Reyes', role: 'owner', company: 'Reyes & Co', context: 'Runs a bookkeeping firm.', facts: makeFacts(() => 0.2, { model: 'smb' }) };
  const sys = intervieweeSystem(persona);
  assert.ok(sys.includes(INTERVIEWEE_RULES) && sys.includes('You are Dana Reyes'));
  assert.ok(!/rubric|score each|grade/i.test(INTERVIEWEE_RULES));
  assert.ok(/ONE open question about a specific time/.test(sys) && /polite non-answer/.test(sys));
});

test('support_procedure_grade fallback: full shape; a real procedure beats a vague one', () => {
  const strong = { intent: 'refund', connector: 'payments', whenNot: 'Annual plans, disputes and chargebacks, or accounts older than 60 days: hand to the founder.', steps: '1. Look up the subscription and the charge in Payments.\n2. If the charge is within 14 days and the plan is monthly, issue a full refund and tell the customer the amount and when it lands.\n3. Otherwise offer a credit up to one month and explain the policy.\n4. If the customer is angry or it is a dispute, hand off to a teammate with the charge id.' };
  const weak = { intent: 'refund', connector: '', whenNot: '', steps: 'Be helpful and nice\nHelp the customer with refunds\nMake them happy and satisfied' };
  const a = R.procedureFallback(strong), b = R.procedureFallback(weak);
  const { quality: _q, ...shape } = a;
  assert.ok(complete(R.PROCEDURE_SCHEMA, shape));
  assert.ok(weighted(a, R.PROCEDURE_CRITERIA) - weighted(b, R.PROCEDURE_CRITERIA) >= 2, `${weighted(a, R.PROCEDURE_CRITERIA)} vs ${weighted(b, R.PROCEDURE_CRITERIA)}`);
  assert.ok(a.quality > b.quality);
});

test('help_article_grade fallback: full shape; task article beats marketing blurb', () => {
  const feats = [{ title: 'CSV invoice export', solution: 'Export invoices to CSV' }];
  const good = { title: 'How do I export invoices to CSV?', body: 'Before you start: you need the Admin role.\n1. Open Billing, then click Invoices.\n2. Click Export CSV in the top right.\n3. Choose a date range and click Download. You should see invoices.csv in your downloads.\nIf the file is empty, check the date range. Still stuck? Reply to this email and support will help.' };
  const bad = { title: 'Our powerful reporting', body: 'Our seamless, powerful platform makes everything simply easy and delightful for every user of every kind.' };
  const a = R.articleFallback(good, feats), b = R.articleFallback(bad, feats);
  assert.ok(weighted(a, R.ARTICLE_CRITERIA) - weighted(b, R.ARTICLE_CRITERIA) >= 1.5);
  assert.ok(a.quality > b.quality && keys(R.ARTICLE_CRITERIA).every((k) => Number.isInteger(a[k])));
});

test('review_response_grade: full shape; defensive or suppressing replies are floored; owning replies win', () => {
  const review = { rating: 1, title: 'Lost my invoices', text: 'The CSV export lost my March invoices and nobody answered for days.' };
  const own = R.responseFallback('Sorry, Priya: the CSV export dropped your March invoices and we should have answered sooner. That bug is fixed as of Monday; email me at founder@acme.test and I will re-run the export for you today.', review);
  const fight = R.responseFallback('This review is fake and you are lying. Remove it or we will take legal action.', review);
  const bribe = R.responseFallback('We are sorry. We will refund you if you update your review to 5 stars.', review);
  assert.ok(own.quality > 0.5 && fight.quality <= 0.15);
  assert.ok(weighted(own, R.RESPONSE_CRITERIA) - weighted(fight, R.RESPONSE_CRITERIA) >= 2);
  assert.ok(bribe.compliance < own.compliance);
  assert.ok(R.responseQuality({ specific_acknowledgement: 5, ownership_no_defense: 5, concrete_fix: 5, tone_and_brevity: 5, compliance: 1 }) <= 0.15, 'legal floor applies to live scores too');
  assert.equal(R.responseQuality({ specific_acknowledgement: 5, ownership_no_defense: 5, concrete_fix: 5, tone_and_brevity: 5, compliance: 5 }), 1);
});

test('support_reply (customer role-play): outcome computed from criteria; unresolved cannot be marked solved', () => {
  const sys = R.replySystem({ name: 'Dana', label: 'Billing', company: 'Acme', waited: 3 });
  assert.ok(/You waited 3 days/.test(sys) && /Stay in character/.test(sys));
  const good = R.replyOutcome({ addressed_my_issue: 5, correct_resolution: 5, next_step: 4, honesty_timeline: 5, ownership_tone: 4, solved: true });
  const canned = R.replyOutcome({ addressed_my_issue: 1, correct_resolution: 1, next_step: 1, honesty_timeline: 2, ownership_tone: 2, solved: true });
  assert.ok(good.satisfied > 0.8 && good.solved);
  assert.ok(canned.satisfied < 0.2 && !canned.solved, 'a model that says solved on a non-fix is overruled');
  const fb = R.replyFallback(0.8, { waited: 0, category: 'billing' });
  assert.ok(complete({ required: Object.keys(R.REPLY_RUBRIC_SCHEMA.properties), properties: { ...R.REPLY_RUBRIC_SCHEMA.properties, satisfied: {} } }, fb));
  assert.equal(R.replyOutcome(fb).satisfied, 0.8);
});

test('customer_review prompt anchors star ratings and forbids invented features', () => {
  const sys = R.reviewSystem({ product: 'Acme', oneLiner: 'receipts', rating: 1, platform: 'G2', model: 'smb', features: 'SMS receipt links' });
  assert.ok(/1 star:/.test(sys) && /5 stars:/.test(sys) && /Mention only things it actually does/.test(sys));
});

test('unit()/percent() map the 1-5 weighted score onto 0..1 and 0..100', () => {
  const c = [{ key: 'a' }, { key: 'b', weight: 3 }];
  assert.equal(unit({ a: 1, b: 1 }, c), 0);
  assert.equal(unit({ a: 5, b: 5 }, c), 1);
  assert.equal(percent({ a: 5, b: 1 }, c), 25);
});
