// Short-horizon account cohorts for the GTM comp / land-and-expand tests. A cohort is N CRM customers whose first
// annual renewal falls ~90 days in, run for one year with a scripted operator of a given tier. No multi-year runs.
import { newState } from '../../public/core/state.js';
import { advance } from '../../public/core/clock.js';
import { seedDefaultStack, post } from '../../public/core/bank.js';
import { ensureStripe } from '../../public/core/stripe.js';
import { ensureMarket } from '../../public/core/market.js';
import { APPS as BASE } from '../../public/apps/registry.js';
import success from '../../public/apps/success.js';
import { ensureSuccess, syncAccounts, subById, scheduleQbr, runQbr, proposeRenewal, acceptCounter, startRenewalEarly } from '../../public/apps/success/engine.js';
import { addContact, ensureDeal, closeWon, startProposal } from '../../public/apps/sales/model.js';
import { ensureLegal } from '../../public/apps/legal/sim.js';
import { retentionByBand, initMap, mapAccount, meetStakeholders, pursueWhitespace } from '../../public/apps/sales/expand.js';

export const APPS = BASE.some((a) => a.id === 'success') ? BASE : [...BASE, success];

const CFG = { smb: { model: 'smb', price: 49, qty: 6, emp: 12 }, mid: { model: 'ent', price: 12000, qty: 3, emp: 120 }, ent: { model: 'ent', price: 24000, qty: 5, emp: 1500 } };

export function freshState(model, seed, price) {
  const s = newState({ companyName: 'Ledgerly', model, path: 'vc', founderName: 'Pat Doe', seed });
  ensureStripe(s); ensureMarket(s); seedDefaultStack(s);
  post(s, { amount: 900000, counterparty: 'Pat', category: 'owner_contribution' });
  s.apps.product = { features: [{ id: 'f1', title: 'Reconciliation', status: 'shipped' }], bugs: [] };
  s.market.fit.product.score = 0.6;
  s.apps.support = { flows: { off: true } }; // these tests study accounts; unhandled support cases would cancel the lone account
  if (price) s.plans[0].price = price;
  return s;
}

/** Win one CRM customer with a given land (optional) and return { deal, sub, acct }. */
export function winAccount(s, i, { band = 'mid', land = null, discountPct = 0, quantity = null, employees = null, annual = true } = {}) {
  const c = CFG[band];
  const { contact } = addContact(s, { firstName: `Ana${i}`, lastName: 'Lee', email: `ana${i}@buyer${i}.com`, title: 'VP Operations', company: `Buyer ${i}`, domain: `buyer${i}.com` });
  const co = s.apps.crm.companies.find((x) => x.id === contact.companyId);
  co.employees = employees ?? c.emp;
  const d = ensureDeal(s, { companyId: contact.companyId, contactId: contact.id, stage: 'qualified' });
  if (land) d.land = { strategy: land.strategy ?? land, ramp: Boolean(land.ramp), chosenDay: s.day };
  startProposal(s, d, { planId: s.plans[0].id, quantity: quantity ?? c.qty, annual, discountPct });
  ensureLegal(s);
  d.contract = { sentDay: s.day, signDay: s.day, redlineId: null };
  closeWon(s, d);
  syncAccounts(s);
  const sub = subById(s, d.subscriptionId);
  const acct = ensureSuccess(s).accounts[d.subscriptionId];
  return { deal: d, sub, acct };
}

/**
 * One year of a cohort under a scripted operator. tier: 'mediocre' | 'median' | 'stellar'.
 *  mediocre: no QBRs, no mapping, renewal handled a week before the date, never pursues a signal.
 *  median: a QBR twice a year, renewal started ~45 days out, pursues signals when they appear.
 *  stellar: maps every account, meets a second stakeholder, quarterly QBRs with the executive sponsor, renewal ~100 days out.
 * Returns { n, grr, nrr } over the year (renewal falls inside it).
 */
export function runCohort({ band = 'mid', tier = 'median', seeds = [3, 4, 5, 6], accounts = 22 } = {}) {
  const c = CFG[band];
  let start = 0, end = 0, loss = 0, n = 0;
  for (const seed of seeds) {
    const s = freshState(c.model, seed, c.price);
    for (let i = 0; i < accounts; i++) {
      const { deal, sub, acct } = winAccount(s, i, { band });
      if (!acct) continue;
      sub.currentPeriodStart = s.day - 275; sub.currentPeriodEnd = s.day + 90; sub.startDay = s.day - 275;
      initMap(s, acct);
      acct.adoption = 0.8; // a nine-month-old account
      void deal;
      if (tier === 'stellar') { mapAccount(s, acct); meetStakeholders(s, acct); }
    }
    for (let k = 0; k < 365; k++) {
      advance(s, 1, APPS);
      for (const a of Object.values(ensureSuccess(s).accounts)) {
        if (a.closed) continue;
        const sb = subById(s, a.subId);
        const qbrEvery = tier === 'stellar' ? 90 : tier === 'median' ? 180 : 0;
        if (qbrEvery && k % qbrEvery === 30) {
          try { const q = scheduleQbr(s, a); q.prepped = true; runQbr(s, q, { roi: true, roadmap: true, expansion: true, exec: tier === 'stellar' }); } catch { /* calendar full */ }
        }
        const left = sb.currentPeriodEnd - s.day;
        const startAt = tier === 'stellar' ? 100 : tier === 'median' ? 45 : 7;
        if (a.renewal && a.renewal.status === 'open' && !a.renewal.offers.length && left <= startAt && left > 0) {
          try {
            if (tier === 'stellar' && left > 90) startRenewalEarly(s, a);
            const r = proposeRenewal(s, a, { upliftPct: tier === 'mediocre' ? 0 : 0.05, discountPct: tier === 'mediocre' ? 0.1 : 0, years: 1, viaCall: tier !== 'mediocre' });
            if (r.decision === 'counter') acceptCounter(s, a);
          } catch { /* not open */ }
        }
        if (tier !== 'mediocre' && k % 7 === 0 && (a.adoption ?? 0) >= 0.55) {
          const it = a.map?.whitespace.find((x) => x.status === 'open');
          if (it) pursueWhitespace(s, a, it.id, {});
        }
      }
    }
    if (process.env.EV) { const by = {}; for (const e of s.stripe.events) if (e.day > 0) { by[e.type] = (by[e.type] || 0) + e.amount * 12; } const cs = Object.values(ensureSuccess(s).accounts); console.log(tier, seed, JSON.stringify(by), 'contractions', cs.reduce((n, a) => n + (a.contractions || 0), 0), 'exp', cs.reduce((n, a) => n + (a.expansions || 0), 0), 'closed', cs.filter((a) => a.closed).length, 'mist', (s.mistakes||[]).map((m) => m.id).join(',')); }
    const r = retentionByBand(s, 365)[band] ?? Object.values(retentionByBand(s, 365))[0];
    if (r) { start += r.start; end += r.end; loss += r.loss; n += r.n; }
  }
  return { n, grr: (start + loss) / start, nrr: end / start };
}
