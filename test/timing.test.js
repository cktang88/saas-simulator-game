// Timelines are distributions, and where you land depends on who you are (core/timing.js, docs/research/timelines.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { post } from '../public/core/bank.js';
import { isWeekend } from '../public/core/util.js';
import { ensureCalendar } from '../public/core/calendar.js';
import { TIMELINES, timeline, schedulingBackAndForth, explain } from '../public/core/timing.js';
import { replyDay } from '../public/core/mail.js';
import { ensureFr, outreachDue, investorFactors } from '../public/apps/fundraising/sim.js';
import { prospectLead } from '../public/apps/sales/model.js';

const base = (seed = 5) => newState({ companyName: 'T', model: 'smb', path: 'vc', founderName: 'P', seed });
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * p)]; };

test('with no context a draw reproduces the research distribution (median and p90)', () => {
  const s = base();
  for (const key of ['investor.afterFirst', 'close.priced', 'dispute.decision']) {
    const d = Array.from({ length: 3000 }, () => timeline(s, key).days);
    const t = TIMELINES[key];
    assert.ok(Math.abs(median(d) / t.median - 1) < 0.1, `${key} median ${median(d)}`);
    assert.ok(Math.abs(q(d, 0.9) / t.p90 - 1) < 0.15, `${key} p90 ${q(d, 0.9)}`);
  }
});

test('context moves where you land, but luck still overlaps: a strong company is usually, not always, faster', () => {
  const s = base();
  const fast = Array.from({ length: 2000 }, () => timeline(s, 'investor.afterFirst', [{ label: 'hot', pull: -1.5 }]).days);
  const slow = Array.from({ length: 2000 }, () => timeline(s, 'investor.afterFirst', [{ label: 'cold', pull: 1.5 }]).days);
  assert.ok(median(fast) < 0.5 * median(slow), `${median(fast)} vs ${median(slow)}`);
  const beat = fast.filter((x) => x > median(slow)).length / fast.length;
  assert.ok(beat > 0.005 && beat < 0.2, `strong slower than the weak median ${beat}`);
  const t = timeline(s, 'investor.afterFirst', [{ label: 'competing term sheet', pull: -1.2 }, { label: 'multistage', speed: 1.3 }]);
  assert.ok(t.percentile >= 0 && t.percentile <= 100 && /competing term sheet/.test(explain(t)));
});

test('business-day timelines never land on a weekend', () => {
  const s = base();
  for (let i = 0; i < 300; i++) { s.day = i % 7; assert.ok(!isWeekend(s, timeline(s, 'investor.reply.warm').day)); }
});

test('scheduling back-and-forth: a booking link cuts the email thread and the wait', () => {
  const run = (bookingLink) => { const s = base(9); const out = Array.from({ length: 400 }, () => schedulingBackAndForth(s, { bookingLink })); return { ex: out.reduce((a, b) => a + b.exchanges, 0) / out.length, days: out.reduce((a, b) => a + b.days, 0) / out.length, h: out.reduce((a, b) => a + b.founderHours, 0) / out.length }; };
  const thread = run(false), link = run(true);
  assert.ok(thread.ex >= 2.5 && link.ex === 1, JSON.stringify({ thread, link }));
  assert.ok(link.days < thread.days && link.h < thread.h);
});

function raiseWith({ S, deadlinePassed = false, competing = false, seed = 3 }) {
  const s = base(seed);
  ensureStripe(s); ensureMarket(s);
  post(s, { amount: 100000, counterparty: 'P', category: 'owner_contribution' });
  const fr = ensureFr(s);
  fr.evaluations.push({ id: 'ev', day: 0, stage: 'pre-seed', S, criteria: null, hardFlags: [], softFlags: [] });
  fr.raise = { id: 'r', stage: 'pre-seed', instrument: 'safe', target: 500e3, cap: 10e6, status: 'active', startDay: 0, deadlineDay: deadlinePassed ? -1 : 120, raised: 0 };
  const inv = { id: 'i', name: 'A', kind: 'micro_vc', raiseId: 'r', status: 'contacted', log: [], outreach: { channel: 'warm', quality: 3, followUps: 0 } };
  fr.investors.push(inv);
  if (competing) fr.investors.push({ id: 'j', name: 'B', kind: 'seed_fund', raiseId: 'r', status: 'term_sheet', log: [] });
  return { s, inv };
}

test('tiers: investors answer a hot, strong company in about a day and a weak, stale raise days later', () => {
  const days = (o) => { const { s, inv } = raiseWith(o); return Array.from({ length: 400 }, () => outreachDue(s, inv) - s.day); };
  const hot = days({ S: 4.5, competing: true }), good = days({ S: 3.6 }), weak = days({ S: 2.2, deadlinePassed: true });
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(hot) < mean(good) && mean(good) < mean(weak), `${mean(hot)} ${mean(good)} ${mean(weak)}`);
  assert.ok(mean(weak) > 2 * mean(hot));
  const { s, inv } = raiseWith({ S: 4.5, competing: true });
  assert.ok(investorFactors(s, inv, 'reply').some((f) => f.label === 'competing term sheet'));
});

test('inbox replies: an eager counterpart answers sooner than a lukewarm exec', () => {
  const s = base(4);
  const avg = (thread) => { let t = 0; for (let i = 0; i < 1000; i++) t += replyDay(s, 'investor', { thread }) - s.day; return t / 1000; };
  assert.ok(avg({ replyPull: -1.5 }) < 0.7 * avg({ replyPull: 1, seniority: 'exec' }));
});

test('prospects: a VP books further out than an owner-operator, and a booking link pulls it in', () => {
  const s = base(6);
  const avg = (title, link = false) => { ensureCalendar(s).bookingLink = link; let t = 0; for (let i = 0; i < 600; i++) t += prospectLead(s, { title }); return t / 600; };
  const owner = avg('Owner'), vp = avg('VP Finance'), vpLink = avg('VP Finance', true);
  assert.ok(owner < vp && vpLink < vp, `${owner} ${vp} ${vpLink}`);
});
