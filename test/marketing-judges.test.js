// Marketing and growth content judges: each scores researched criteria with 1/3/5 anchors (docs/research/judging/marketing.md).
// Checks: the rubric is injected in the prompt, the strict schema carries every criterion, the offline fallback returns
// the full shape, and strong vs weak samples separate through the fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import {
  judgeCreative, judgeBrief, judgePost, judgeCommunityPost, judgeArticle, judgeAso,
  creativeHeuristic, briefHeuristic, postHeuristic, communityHeuristic, articleHeuristic, asoHeuristic,
  CREATIVE_SCHEMA, BRIEF_SCHEMA, POST_SCHEMA, COMMUNITY_SCHEMA, ARTICLE_SCHEMA, ASO_SCHEMA,
} from '../public/apps/growth/judges.js';
import { AD_CRITERIA, BRIEF_CRITERIA, POST_CRITERIA, COMMUNITY_CRITERIA, ARTICLE_CRITERIA, ASO_CRITERIA, LANDING_CRITERIA, NEWSLETTER_CRITERIA } from '../public/apps/growth/rubrics.js';
import { heuristicJudge, PANEL_SCHEMA } from '../public/apps/website.js';
import { issueHeuristic, issueScore, NEWSLETTER_SCHEMA, NEWSLETTER_SYSTEM } from '../public/apps/audience/judge.js';

function fresh() {
  const s = newState({ companyName: 'Growth Co', model: 'b2c', path: 'indie', founderName: 'Pat', seed: 7 });
  s.company.oneLiner = 'Habit tracker for busy parents who want to read more books';
  s.company.icp = 'busy parents who want to read more books';
  return s;
}

const ALL = [AD_CRITERIA, BRIEF_CRITERIA, POST_CRITERIA, COMMUNITY_CRITERIA, ARTICLE_CRITERIA, ASO_CRITERIA, LANDING_CRITERIA, NEWSLETTER_CRITERIA];

test('every criterion has 1/3/5 anchors, a positive weight, and weights sum to 1', () => {
  for (const crit of ALL) {
    assert.ok(crit.length >= 4 && crit.length <= 7);
    let w = 0;
    for (const c of crit) {
      assert.ok(c.anchors[1] && c.anchors[3] && c.anchors[5], c.key);
      w += c.weight;
    }
    assert.ok(Math.abs(w - 1) < 1e-9, `weights sum ${w}`);
  }
});

test('strict schemas require every criterion plus evidence and forbid extras', () => {
  const pairs = [[CREATIVE_SCHEMA, AD_CRITERIA], [BRIEF_SCHEMA, BRIEF_CRITERIA], [POST_SCHEMA, POST_CRITERIA], [COMMUNITY_SCHEMA, COMMUNITY_CRITERIA], [ARTICLE_SCHEMA, ARTICLE_CRITERIA], [ASO_SCHEMA, ASO_CRITERIA], [PANEL_SCHEMA, LANDING_CRITERIA], [NEWSLETTER_SCHEMA, NEWSLETTER_CRITERIA]];
  for (const [schema, crit] of pairs) {
    assert.equal(schema.additionalProperties, false);
    for (const k of [...crit.map((c) => c.key), 'evidence']) assert.ok(schema.required.includes(k) && schema.properties[k], k);
    for (const k of Object.keys(schema.properties)) assert.ok(schema.required.includes(k), `${k} must be required`);
  }
});

// A stub llm that records the system prompt and returns the offline fallback (so shape is checked end to end).
function stubCtx(state) {
  const seen = [];
  const run = async (o) => { seen.push(o); return { model: 'stub', mock: true, data: o.fallback() }; };
  return { state, seen, llm: { panel: async (o) => [await run(o)], ask: run } };
}

test('rubric text is injected into each judge prompt and the fallback has the full shape', async () => {
  const s = fresh();
  const ctx = stubCtx(s);
  await judgeCreative(ctx, { format: 'video', hook: 'I read 23 books with two toddlers', primaryText: '12 minutes a night.', headline: 'Read more', cta: 'Start free trial' });
  await judgeBrief(ctx, { hook: 'hook one', keyMessage: 'point', notes: 'film it' });
  await judgePost(ctx, 'We lost 12 customers in May.\nHere is what I changed.', 'linkedin');
  await judgeCommunityPost(ctx, { community: 'r/parenting', kind: 'subreddit', title: 'How do you read?', body: 'I tried 3 things and lost 2 weeks. What works?' });
  await judgeArticle(ctx, { query: 'best habit tracker', title: 'Best habit tracker', body: 'We tested 14 apps.\n\n## Results\nOur data shows 3.' });
  await judgeAso(ctx, { title: 'ReadNook', subtitle: 'Read more every night', keywords: 'books,habit,reading', description: 'x' });
  assert.equal(ctx.seen.length, 6);
  const pairs = [AD_CRITERIA, BRIEF_CRITERIA, POST_CRITERIA, COMMUNITY_CRITERIA, ARTICLE_CRITERIA, ASO_CRITERIA];
  ctx.seen.forEach((o, i) => {
    assert.match(o.system, /SCORING RUBRIC/);
    for (const c of pairs[i]) assert.ok(o.system.includes(c.key), `${o.task} prompt missing ${c.key}`);
    const d = o.fallback();
    for (const k of o.schema.required) assert.ok(d[k] !== undefined, `${o.task} fallback missing ${k}`);
    for (const c of pairs[i]) assert.ok(Number.isInteger(Math.round(d[c.key])) && d[c.key] >= 1 && d[c.key] <= 5, `${o.task}.${c.key}=${d[c.key]}`);
  });
  assert.match(NEWSLETTER_SYSTEM, /SCORING RUBRIC/);
});

const sum = (d, crit) => crit.reduce((a, c) => a + d[c.key] * c.weight, 0);

test('ad creative: a specific hook outscores a buzzword ad and a keyword-stuffed ad', () => {
  const s = fresh();
  const good = creativeHeuristic(s, { hook: 'I finished 23 books this year with two toddlers', primaryText: '12 minutes a night after bedtime, tracked automatically. 14-day free trial.', headline: 'Read more as a parent', cta: 'Start free trial' });
  const buzz = creativeHeuristic(s, { hook: 'Introducing the best app', primaryText: 'Revolutionize your life with our seamless, AI-powered all-in-one solution.', headline: 'Unlock your potential', cta: 'Learn More' });
  const stuffed = creativeHeuristic(s, { hook: 'habit tracker busy parents read more books', primaryText: 'habit tracker busy parents read more books 10 20 30', headline: 'busy parents read more books', cta: 'Learn More' });
  assert.ok(sum(good, AD_CRITERIA) > sum(buzz, AD_CRITERIA) + 1);
  assert.ok(sum(good, AD_CRITERIA) > sum(stuffed, AD_CRITERIA) + 0.7);
});

test('UGC brief: a structured brief beats a vague one', () => {
  const s = fresh();
  const good = briefHeuristic(s, { hook: '1) I read 23 books with two toddlers\n2) My bedtime was my reading time\n3) 12 minutes changed my night', keyMessage: '- tracks reading automatically\n- 12 minutes a night\n- 14-day free trial, product name Nook', notes: 'Length 30 sec, 9:16 vertical. Show the screen recording in the first 3 seconds. Don\'t name competitors or promise results. Add #ad disclosure. 3 videos, 2 revisions, usage rights 90 days. CTA: link in bio, try free.' });
  const vague = briefHeuristic(s, { hook: 'grab attention', keyMessage: 'Our seamless all-in-one solution', notes: 'be authentic' });
  assert.ok(sum(good, BRIEF_CRITERIA) > sum(vague, BRIEF_CRITERIA) + 1.2);
});

test('social post: a specific story beats a salesy broetry post', () => {
  const s = fresh();
  const good = postHeuristic(s, 'We lost 12 of 40 customers in May.\n\nI tried a price cut first and it failed: churn stayed at 9%.\n\nWhat worked: a 3-email onboarding that cut churn to 4% in 6 weeks. Here is the template I used.');
  const bad = postHeuristic(s, "I'm thrilled to announce our game-changer! Let that sink in.\nSign up now, use code LAUNCH, link in bio. Comment YES below.");
  assert.ok(sum(good, POST_CRITERIA) > sum(bad, POST_CRITERIA) + 1.2);
});

test('community post: a helpful disclosed answer beats a thin stealth ad', () => {
  const s = fresh();
  const good = communityHeuristic(s, { community: 'r/parenting', title: 'How do busy parents fit in reading?', body: 'I tried 3 things over 6 months and lost 2 weeks to a bad one. What worked: 12 minutes after bedtime, a paper book on the nightstand, and no phone in the room. I also build a small habit tracker (disclosure) but you do not need it. What has worked for you?' });
  const bad = communityHeuristic(s, { community: 'r/parenting', title: 'Check out my app', body: 'Check out Growth Co at https://growth.app, free trial, sign up now!' });
  assert.ok(sum(good, COMMUNITY_CRITERIA) > sum(bad, COMMUNITY_CRITERIA) + 1.2);
});

test('SEO article: first-hand sourced article beats filler and query stuffing', () => {
  const s = fresh();
  const good = articleHeuristic(s, { query: 'best habit tracker for parents', title: 'Best habit tracker for parents: 14 apps tested', body: 'We tested 14 habit trackers with 9 parents for 30 days; Nook kept 7 of them reading, the rest dropped out in week two.\n\n## Method\nWe measured minutes read per night. According to the 2025 survey (https://example.org) 62% quit.\n\n## Results\nOur data: 12 minutes a night.\n\n## Who it fails\nThe free tier caps at 3 habits. Disclosure: we make Nook. Updated 2026.' });
  const filler = articleHeuristic(s, { query: 'best habit tracker for parents', title: 'Ultimate guide', body: "In today's fast-paced world, let's delve into the tapestry of habits. " .repeat(60) });
  const stuffed = articleHeuristic(s, { query: 'best habit tracker for parents', title: 'Best habit tracker for parents', body: 'best habit tracker for parents. '.repeat(120) });
  assert.ok(sum(good, ARTICLE_CRITERIA) > sum(filler, ARTICLE_CRITERIA) + 1.5);
  assert.ok(sum(good, ARTICLE_CRITERIA) > sum(stuffed, ARTICLE_CRITERIA) + 1);
});

test('ASO: distinct keywords beat a stuffed listing that repeats the title', () => {
  const s = fresh();
  const good = asoHeuristic(s, { title: 'Nook: Reading Tracker', subtitle: 'Read more books each night', keywords: 'parents,habit,streak,bookshelf,goals,pages,library,reminder,journal,toddler,bedtime,audiobook', description: 'Busy parents read 12 minutes a night with Nook. 14-day free trial.' });
  const bad = asoHeuristic(s, { title: 'Best #1 Habit Tracker Habit Tracker App Free', subtitle: 'habit tracker habit tracker app', keywords: 'habit, tracker, habit, tracker, nook, app', description: '' });
  assert.ok(sum(good, ASO_CRITERIA) > sum(bad, ASO_CRITERIA) + 1.2);
  assert.ok(bad.stuffing && !good.stuffing);
});

test('landing page: proof, offer and plain copy beat a buzzword page', () => {
  const s = fresh();
  const persona = { id: 'p0', role: 'busy parent', icp: s.company.icp };
  const good = { title: 'Nook', headings: ['Read 12 minutes a night, even with toddlers', 'Pricing', 'FAQ'], text: 'Nook tracks reading for busy parents who want to read more books. "I finished 23 books this year" - Dana, parent of two. 4,200 customers, 4.8 reviews. Pricing: $5/month, cancel anytime. FAQ: refund within 30 days. Start free trial, no credit card.' };
  const bad = { title: 'Solution', headings: ['Revolutionize your life'], text: 'Our seamless, cutting-edge, AI-powered all-in-one solution will supercharge and unlock your potential. Robust and effortless.' };
  const g = heuristicJudge(s, good, persona), b = heuristicJudge(s, bad, persona);
  assert.ok(sum(g, LANDING_CRITERIA) > sum(b, LANDING_CRITERIA) + 1.5);
  for (const k of PANEL_SCHEMA.required) assert.ok(g[k] !== undefined, k);
});

test('newsletter: one specific idea with one soft CTA beats a pitch-in-every-line issue', () => {
  const s = fresh();
  const body = 'Last month I changed our pricing page and signups moved from 3.1% to 4.4%.\n\nHere is what I tried first: a discount banner. It failed, conversion fell 0.4 points in 9 days.\n\nWhat worked: moving the 14 customer quotes above the plan table and cutting the plan count from 4 to 3.\n\nThe lesson: show proof before price. I measured it over 2,100 visits.\n\nIf you want the template, reply and I will send it.';
  const good = issueHeuristic(s, { subject: 'How we lifted signups 42% in a month', body });
  const bad = issueHeuristic(s, { subject: 'EXCITING NEWS!! BUY NOW', body: 'Upgrade now! Buy now and get a discount. Limited offer, sign up for the free trial today. Book a demo. 20% off discount.' });
  assert.ok(good.score > bad.score + 0.25, `${good.score} vs ${bad.score}`);
  for (const k of NEWSLETTER_SCHEMA.required) assert.ok(good[k] !== undefined, k);
  assert.ok(issueScore(good) > 0 && issueScore(bad) < 0.5);
});
