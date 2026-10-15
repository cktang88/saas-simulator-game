// Rubric-based judges for lifecycle, billing and customer communications (docs/research/judging/lifecycle-billing.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { judgeEmail } from '../public/apps/lifecycle/judge.js';
import { EMAIL_CRITERIA, EMAIL_KEYS, draftGuidance } from '../public/apps/lifecycle/rubric.js';
import { UPGRADE_CRITERIA, UPGRADE_SCHEMA, upgradeFallback, upgradeScore } from '../public/apps/plg/rubric.js';
import { lintUpgradeCopy } from '../public/apps/plg/model.js';
import { judgeUpgrade } from '../public/apps/plg.js';
import {
  DUNNING_CRITERIA, DUNNING_SCHEMA, dunningFallback, dunningScores, NOTICE_CRITERIA, NOTICE_SCHEMA, noticeRisk, EVIDENCE_CRITERIA, evidenceQuality,
} from '../public/apps/money/rubric.js';
import { EVIDENCE_SCHEMA, EVIDENCE_SYSTEM, evidenceHeuristic, noticeHeuristic } from '../public/apps/money/judge.js';
import { REPLY_SCHEMA, REPLY_CRITERIA, replySatisfaction, replyFallbackCriteria, feedbackWritingRubric, trialRubric, INTERVIEW_CRITERIA, interviewQuality } from '../public/apps/customers/rubric.js';
import { INTERVIEW_SCHEMA, interviewPrompt, interviewFallback, exitInterviewQuality } from '../public/apps/retention/interview.js';

const allRequired = (schema) => assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), 'strict schema: every property required');
const criteriaOk = (cs) => cs.forEach((c) => assert.ok(c.anchors[1] && c.anchors[3] && c.anchors[5], `${c.key} has 1/3/5 anchors`));

test('every rubric has 1/3/5 anchors and strict schemas', () => {
  [EMAIL_CRITERIA, UPGRADE_CRITERIA, DUNNING_CRITERIA, NOTICE_CRITERIA, EVIDENCE_CRITERIA, REPLY_CRITERIA, INTERVIEW_CRITERIA].forEach(criteriaOk);
  [UPGRADE_SCHEMA, NOTICE_SCHEMA, EVIDENCE_SCHEMA, REPLY_SCHEMA, INTERVIEW_SCHEMA, DUNNING_SCHEMA.properties.messages.items].forEach(allRequired);
});

function mockCtx(state) {
  const calls = [];
  const run = (o) => { calls.push(o); return { model: 'm', mock: true, data: o.fallback() }; };
  return { state, calls, llm: { ask: async (o) => run(o), panel: async (o) => [run(o)] } };
}

test('lifecycle judge: rubric in the prompt, fallback has every criterion field, strong email lints above weak', async () => {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed: 3 });
  const ctx = mockCtx(s);
  const ev = { id: 'e1', label: 'Sent first invoice' };
  const strong = { subject: 'Send your first invoice', body: 'Hi {{firstName}}, most people at Acme get paid faster once their first invoice is out. Send your first invoice here, it takes about two minutes: {{ctaUrl}}\n\nReply if you get stuck, I read every one. Sam' };
  const weak = { subject: 'WELCOME!!! 50% OFF', body: 'We are excited to have you on board! Unlock the power of our cutting-edge platform. Check https://a.com https://b.com https://c.com and upgrade today for a discount. Our team is thrilled.' };
  const rs = await judgeEmail(ctx, strong, { kind: 'welcome', event: ev });
  const rw = await judgeEmail(ctx, weak, { kind: 'welcome', event: ev });
  assert.match(ctx.calls[0].system, /SCORING RUBRIC/);
  assert.match(ctx.calls[0].system, /one_action/);
  const fb = ctx.calls[0].fallback();
  for (const k of EMAIL_KEYS) assert.ok(Number.isInteger(fb[k]) && fb[k] >= 1 && fb[k] <= 5, k);
  assert.ok(rs.lint.score > rw.lint.score + 0.2);
  assert.ok(ctx.calls[0].fallback().one_action > ctx.calls[1].fallback().one_action);
  assert.match(draftGuidance(), /60-150 words/);
});

test('lifecycle judge: live criteria scores drive the score (weighted), caps still apply', async () => {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed: 3 });
  const live = (crit, extra = {}) => ({ llm: { panel: async () => [{ mock: false, model: 'm', data: { ...Object.fromEntries(EMAIL_KEYS.map((k) => [k, crit])), evidence: '', score: 1, oneClearAction: true, pointsToActivation: true, readsAsAI: false, upsellsBeforeValue: false, feedback: 'f', ...extra } }] }, state: s });
  const hi = await judgeEmail(live(5), { subject: 'a b c', body: 'hello there {{ctaUrl}}' }, { kind: 'welcome' });
  const lo = await judgeEmail(live(1), { subject: 'a b c', body: 'hello there {{ctaUrl}}' }, { kind: 'welcome' });
  const capped = await judgeEmail(live(5, { upsellsBeforeValue: true }), { subject: 'a b c', body: 'hello there {{ctaUrl}}' }, { kind: 'welcome' });
  assert.equal(hi.judge.score, 1);
  assert.equal(lo.judge.score, 0);
  assert.equal(capped.judge.score, 0.35);
});

test('upgrade prompt judge: rubric in prompt; fallback separates a specific prompt from a vague countdown', async () => {
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'indie', founderName: 'Pat', seed: 3 });
  const ctx = mockCtx(s);
  const good = 'You have used 9 of 10 projects. Pro raises the limit to 100 projects and adds client sharing, so you can keep going without deleting anything. Upgrade when you are ready, or remind me later.';
  const bad = 'Upgrade to Pro! Last chance, expires in 2 hours. Upgrade now, upgrade today, upgrade!';
  assert.equal(await judgeUpgrade(ctx, good), null); // offline = no judge score stored
  await judgeUpgrade(ctx, bad);
  assert.match(ctx.calls[0].system, /names_unlock/);
  const fg = ctx.calls[0].fallback(), fb = ctx.calls[1].fallback();
  for (const c of UPGRADE_CRITERIA) assert.ok(Number.isInteger(fg[c.key]));
  assert.ok(upgradeScore(fg) > upgradeScore(fb) + 0.2, `${upgradeScore(fg)} vs ${upgradeScore(fb)}`);
  assert.equal(upgradeFallback(good, lintUpgradeCopy(good)).no_pressure >= 4, true);
});

test('dunning judge: fallback separates stellar from threatening copy', () => {
  const stellar = [
    { day: 0, subject: 'Your card for {{plan}} did not go through', body: 'Hi {{first_name}}, your {{amount}} payment for {{plan}} did not go through, probably an expired card. Update it in one click: {{update_link}}. If money is tight I can pause your plan instead, just reply. Sam, founder' },
    { day: 7, subject: 'Still need a new card for {{plan}}', body: 'Hi {{first_name}}, a reminder: access pauses on {{date}} if we cannot charge {{amount}}. Your data stays safe. Update here: {{update_link}} or reply and I will help. Sam' },
  ];
  const threat = [{ day: 0, subject: 'Payment failed', body: 'Final warning. You failed to pay. Legal collections will follow and we will immediately suspend your account.' }];
  const a = dunningScores(dunningFallback(stellar)), b = dunningScores(dunningFallback(threat));
  assert.ok(Math.min(...a) > Math.max(...b) + 0.3, `${a} vs ${b}`);
  assert.equal(dunningFallback(stellar).messages.length, 2);
  for (const k of DUNNING_CRITERIA.map((c) => c.key)) assert.ok(Number.isInteger(dunningFallback(stellar).messages[0][k]));
});

test('price notice: fallback has criteria; strong notice scores above weak and lowers blended risk', () => {
  const weak = noticeHeuristic('Price going up.', { oldPrice: 49, newPrice: 59, noticeDays: 7 });
  const strong = noticeHeuristic('Hi, on March 1 your plan moves from $49 to $59/month because we added the reporting and sync features you asked for. Lock $49 for a year by switching to annual before March 1, or downgrade or cancel from settings any time. Questions? Just reply. Sam', { oldPrice: 49, newPrice: 59, noticeDays: 45 });
  for (const c of NOTICE_CRITERIA) assert.ok(Number.isInteger(strong[c.key]), c.key);
  const inc = 10 / 49;
  assert.ok(noticeRisk(strong, { increasePct: inc, noticeDays: 45 }) < noticeRisk(weak, { increasePct: inc, noticeDays: 7 }) - 0.05);
  // a cranky persona cannot overrule an excellent page entirely
  const liveStrong = { ...Object.fromEntries(NOTICE_CRITERIA.map((c) => [c.key, 5])), churnRisk: 0.5 };
  assert.ok(noticeRisk(liveStrong, { increasePct: 0.2, noticeDays: 45 }) < 0.5);
});

test('dispute evidence: rubric in system prompt; criteria drive quality with a contradiction cap; strong beats weak', () => {
  assert.match(EVIDENCE_SYSTEM, /SCORING RUBRIC/);
  assert.match(EVIDENCE_SYSTEM, /reason_match/);
  const strong = 'Customer Ada Lopez signed up on Nov 3, 2026 and accepted our Terms and refund policy via a checkbox at checkout. She logged in 14 times after the $49.00 charge on Dec 3 (session logs and IP address attached). AVS and CVC checks passed and 3D Secure was completed. She had two prior undisputed payments. We emailed a receipt and a renewal reminder 7 days before the charge.';
  const weak = 'This customer is a scam and a liar!! We did nothing wrong, please side with us, we are a legitimate business and have been for many years and we hate chargebacks very much indeed.';
  const facts = { reason: 'fraudulent', customerName: 'Ada Lopez' };
  const s = evidenceHeuristic(strong, facts), w = evidenceHeuristic(weak, facts);
  for (const c of EVIDENCE_CRITERIA) assert.ok(Number.isInteger(s[c.key]), c.key);
  assert.ok(evidenceQuality(s) > evidenceQuality(w) + 0.3, `${evidenceQuality(s)} vs ${evidenceQuality(w)}`);
  const perfect = Object.fromEntries(EVIDENCE_CRITERIA.map((c) => [c.key, 5]));
  assert.ok(evidenceQuality(perfect) <= 0.85, 'even perfect evidence is not a guaranteed win');
  assert.ok(evidenceQuality({ ...perfect, consistent_concise: 1 }) <= 0.2, 'contradicting your own records caps quality');
});

test('customer reply: rubric drives satisfaction, canned replies score low', () => {
  const canned = replyFallbackCriteria(0.1), specific = replyFallbackCriteria(0.9);
  assert.ok(replySatisfaction(specific) > replySatisfaction(canned) + 0.5);
  const live = Object.fromEntries(REPLY_CRITERIA.map((c) => [c.key, 5]));
  assert.equal(replySatisfaction({ ...live, satisfied: 0 }), 1);
  assert.match(feedbackWritingRubric(), /specific_symptom/);
});

test('exit interview: rubric in persona prompt; criteria separate open past-event questions from leading pitches', () => {
  const good = 'Walk me through the week you decided to cancel. What happened?\nWho else was involved in the decision?\nWhat are you using now instead?';
  const bad = 'Was it the price?\nDid you not like the new design?\nWe just shipped a new feature, would you come back if we gave you a free month?';
  const { system } = interviewPrompt({ name: 'Pat', trueReason: 'other', stated: 'too expensive', productName: 'Acme', questions: good });
  assert.match(system, /past_event/);
  const fg = interviewFallback({ trueReason: 'other', stated: 'x', questions: good }), fb = interviewFallback({ trueReason: 'other', stated: 'x', questions: bad });
  for (const c of INTERVIEW_CRITERIA) assert.ok(Number.isInteger(fg[c.key]));
  assert.ok(interviewQuality(fg) > interviewQuality(fb) + 0.3);
  assert.ok(exitInterviewQuality(good) > exitInterviewQuality(bad));
});

test('trial panel rubric states decision rules', () => {
  const t = trialRubric();
  assert.match(t, /time_to_value/);
  assert.match(t, /activated is true only if/);
});
