// Lifecycle tier fixtures: what a stellar / good / average / mediocre operator actually sets up and writes.
// Inputs only (settings, flows, copy); the engine decides the outcome.
import { newState } from '../../public/core/state.js';
import { ensureStripe, createCustomer, subscribe } from '../../public/core/stripe.js';
import { ensureMarket } from '../../public/core/market.js';
import { seedDefaultStack, post } from '../../public/core/bank.js';
import { ensureLifecycle, templateFlow, newFlow, lintEmail, eventById, lifecycleDay, sendBroadcastNow } from '../../public/apps/lifecycle/model.js';

export const GOOD_COPY = [
  { subject: 'Your first receipt request', body: 'Hi {{firstName}},\n\nThe quickest way to see if this saves you time: send one receipt request by SMS to a real client today. It takes two minutes and the receipt lands in the right transaction.\n\nSend your first receipt request: {{ctaUrl}}\n\nIf your setup is different, reply and tell me what you use now.\n\nPat' },
  { subject: 'Stuck on the first request?', body: 'Hi {{firstName}},\n\nMost bookkeepers who stick with us send three receipt requests in their first week, to real clients with missing receipts.\n\nPick the client with the most missing receipts and send them a request now: {{ctaUrl}}\n\nReply if something blocked you. I read every reply.\n\nPat' },
  { subject: 'How Dana clears month-end', body: 'Hi {{firstName}},\n\nDana runs books for 40 small clients. She sends receipt requests by SMS on the 25th, and by close most receipts are attached.\n\nSet up the same: send receipt requests to this month\'s missing items: {{ctaUrl}}\n\nPat' },
  { subject: 'Still worth a try?', body: 'Hi {{firstName}},\n\nYou signed up a week ago but have not sent a receipt request to a client yet. If the timing is wrong, no problem.\n\nIf you want to try it, send one receipt request to your slowest client: {{ctaUrl}}\n\nPat' },
];
export const GENERIC_COPY = { subject: 'Welcome to Ledgerly', body: 'Hi {{firstName}},\n\nWelcome aboard! We are so excited to have you. Ledgerly is the all-in-one platform to streamline your workflow and unlock productivity.\n\n- Check out the dashboard\n- Read our blog https://x.co/blog\n- Follow us on X https://x.co/x\n- Join the community https://x.co/c\n- Watch the tour https://x.co/t\n\nCheers,\nThe team' };
export const DISCOUNT_COPY = { subject: 'LIMITED TIME: 30% off!', body: 'Hi {{firstName}},\n\nUpgrade now and save 30% off your first year with promo code SAVE30. Limited time offer, act now!\n\nhttps://x.co/upgrade\n\nThe team' };
export const NEWSLETTER = { subject: 'Ledgerly monthly update', body: 'Hi {{firstName}},\n\nHere is what is new this month: a refreshed dashboard, faster exports, a new help center and our team offsite.\n\n- Dashboard https://x.co/d\n- Exports https://x.co/e\n- Help https://x.co/h\n\nThanks for being with us,\nThe team' };

function fill(state, f, copies) {
  const L = ensureLifecycle(state);
  const ev = L.activationEvent ? eventById(state, L.activationEvent.id) : null;
  let i = 0;
  for (const n of f.nodes) {
    if (n.type !== 'email') continue;
    const c = copies[i++ % copies.length];
    n.subject = c.subject; n.body = c.body; n.edited = true;
    n.lint = lintEmail(c, { kind: f.kind, event: ev, featureTitles: ['Receipt requests by SMS'] });
  }
  f.status = 'live'; f.publishedDay = state.day;
  L.flows.push(f);
  return f;
}

export function world(seed = 1) {
  const s = newState({ companyName: 'Ledgerly', model: 'smb', path: 'indie', founderName: 'Pat', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 50000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Receipt requests by SMS', status: 'shipped', shippedDay: -30 }], buildQueue: [], bugs: [], changelog: [] };
  return s;
}

export function setupTier(s, tier) {
  const L = ensureLifecycle(s);
  L.vendor = 'loops';
  L.billId = null;
  if (tier === 'stellar') {
    L.domain = { spf: true, dkim: true, dmarc: true, reputation: 70 };
    L.activationEvent = { id: 'core_own_data', day: s.day, validated: true };
    L.settings.intentField = true;
    const w = templateFlow('welcome'); w.exitOnGoal = true; fill(s, w, GOOD_COPY);
    const n = templateFlow('nudge'); n.exitOnGoal = true; n.triggerDays = 3; n.nodes = n.nodes.slice(0, 3); fill(s, n, [GOOD_COPY[1], GOOD_COPY[3]]);
    const wb = templateFlow('winback'); wb.filter.activation = 'activated'; fill(s, wb, [GOOD_COPY[3]]);
  } else if (tier === 'good') {
    L.domain = { spf: true, dkim: true, dmarc: false, reputation: 70 };
    L.activationEvent = { id: 'core_once', day: s.day, validated: false };
    const w = templateFlow('welcome'); w.exitOnGoal = true; w.nodes = w.nodes.slice(0, 5); fill(s, w, [GOOD_COPY[0], GOOD_COPY[2], GENERIC_COPY]);
  } else if (tier === 'average') {
    L.domain = { spf: true, dkim: false, dmarc: false, reputation: 70 };
    const w = newFlow('welcome', 'Welcome'); w.nodes = [{ id: 'a1', type: 'email' }, { id: 'a2', type: 'delay', days: 3 }, { id: 'a3', type: 'email' }]; fill(s, w, [GENERIC_COPY, NEWSLETTER]);
  } else {
    L.domain = { spf: false, dkim: false, dmarc: false, reputation: 70 };
    const w = newFlow('welcome', 'Welcome'); w.nodes = [{ id: 'm1', type: 'email' }, { id: 'm2', type: 'delay', days: 1 }, { id: 'm3', type: 'email' }]; fill(s, w, [GENERIC_COPY, DISCOUNT_COPY]);
  }
}

// Run `days` of signups (perDay trials) through the lifecycle engine with the tier's habits (broadcasts).
export function runTier(tier, { seed = 1, days = 90, perDay = 12, baseP = 0.375 } = {}) {
  const s = world(seed);
  setupTier(s, tier);
  for (let d = 0; d < days; d++) {
    s.day++;
    for (let i = 0; i < perDay; i++) {
      const c = createCustomer(s, { name: `U ${d}-${i}`, email: `u${d}_${i}@x.com` });
      subscribe(s, c.id, { id: 'p', price: 49, interval: 'month', trialDays: 14 });
    }
    lifecycleDay(s, { baseP });
    if (tier === 'average' && d % 30 === 29) sendBroadcastNow(s, { ...NEWSLETTER, segment: 'all' });
    if (tier === 'mediocre' && d % 7 === 6) sendBroadcastNow(s, { ...DISCOUNT_COPY, segment: 'all' });
  }
  return s;
}
