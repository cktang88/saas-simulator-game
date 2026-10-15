// Regression tests for bugs found in the core review (public/core, server.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../public/core/state.js';
import { advance } from '../public/core/clock.js';
import { post, addRecurring } from '../public/core/bank.js';
import { ensureStripe } from '../public/core/stripe.js';
import { ensureMarket } from '../public/core/market.js';
import { isoDate, toCsv, parseCsv } from '../public/core/util.js';
import { isPrivateIp } from '../server.js';

function fresh(model = 'smb') {
  const s = newState({ companyName: 'Review Co', model, path: 'indie', founderName: 'Pat', seed: 11 });
  ensureStripe(s); ensureMarket(s);
  return s;
}

test('LLC Q4 estimated tax is paid on Jan 15 (the year rolls over only at the Jan 31 accrual)', () => {
  const s = fresh();
  s.personal.liquidSavings = 100000;
  advance(s, 5, []); // November 2026
  post(s, { amount: 20000, counterparty: 'Stripe', category: 'stripe_payout' });
  advance(s, 75, []); // past Jan 15 2027
  assert.ok(isoDate(s) > '2027-01-15');
  const q4 = s.personal.txns.filter((t) => t.kind === 'tax' && /Q4 2026/.test(t.description));
  assert.equal(q4.length, 1, 'Q4 2026 1040-ES payment made');
  assert.ok(Math.abs(-q4[0].amount - 20000 * (0.153 * 0.9235 + 0.12)) < 1);
  advance(s, 30, []); // the Jan 31 rollover must not pay it again
  assert.equal(s.personal.txns.filter((t) => t.kind === 'tax').length, 1);
  assert.equal(s.personal.estTax.prev.year, 2026);
  assert.ok(s.personal.estTax.prev.paid > 5000);
});

test('SSRF guard: IPv4-mapped IPv6 in hex form (as the URL parser normalizes it) is private', () => {
  const host = new URL('http://[::ffff:127.0.0.1]/').hostname.replace(/^\[|\]$/g, '');
  assert.equal(host, '::ffff:7f00:1');
  assert.equal(isPrivateIp(host), true);
  assert.equal(isPrivateIp('::ffff:a9fe:a9fe'), true); // 169.254.169.254 cloud metadata
  assert.equal(isPrivateIp('::7f00:1'), true);
  assert.equal(isPrivateIp('::ffff:808:808'), false); // 8.8.8.8 stays public
  assert.equal(isPrivateIp('2606:4700::1111'), false);
});

test('a recurring bill set for the 31st is charged on the last day of a 30-day month', () => {
  const s = fresh();
  post(s, { amount: 5000, counterparty: 'Pat', category: 'owner_contribution' });
  addRecurring(s, { vendor: 'EndOfMonth Tool', amount: 10, category: 'software', dayOfMonth: 31 });
  advance(s, 29, []); // Nov 2 → Dec 1, 2026 (November has 30 days)
  const lines = s.bank.txns.filter((t) => t.counterparty === 'EndOfMonth Tool');
  assert.equal(lines.length, 1);
  assert.equal(isoDate(s, lines[0].day), '2026-11-30');
});

test('toCsv quotes fields containing a carriage return so they round-trip', () => {
  const rows = [{ a: 'x\ry', b: 'ok' }];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

test('jobs: a delayed reply processed after a multi-day advance keeps its due day', async () => {
  const { registerJob, enqueue, drainJobs } = await import('../public/core/jobs.js');
  const { newThread, addMessage } = await import('../public/core/mail.js');
  const { newState } = await import('../public/core/state.js');
  const s = newState({ companyName: 'Acme', model: 'smb', path: 'vc', founderName: 'Pat', seed: 5 });
  const t = newThread(s, { subject: 'Hi', with: { name: 'Ann' }, kind: 'investor' });
  addMessage(s, t.id, { from: 'me', body: 'hello' });
  registerJob('reply:testdate', (ctx, { threadId }) => { addMessage(ctx.state, threadId, { from: 'them', body: 'hey' }); });
  enqueue(s, 'reply:testdate', { threadId: t.id }, { notBefore: s.day + 2 });
  const due = s.day + 2;
  s.day += 30;
  await drainJobs({ state: s });
  assert.equal(t.messages.at(-1).day, due);
  assert.equal(t.lastDay, due);
});
