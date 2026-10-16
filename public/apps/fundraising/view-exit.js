// Tab: Exit — list on an acquisition marketplace, receive LOIs based on real metrics, close the sale.

import { html, on, table, stat, formData, toast } from '../../core/ui.js';
import { money, pct, fmtDate } from '../../core/util.js';
import { notify } from '../../core/state.js';
import { computeMetrics } from './metrics.js';
import { MIN_MRR_TO_LIST, EXIT_FEES } from './exit.js';
import { waterfall } from './captable.js';
import { negotiationLauncher, negotiationPanel, wireNegotiation } from '../negotiate-view.js'; // shared negotiation component
import { findNegotiation } from '../../core/negotiation.js';
import { loiExtras, mnaPackage, applyMnaTerms } from '../negotiate/mna-terms.js';
import { saleConsent } from '../negotiate/gov.js';
import { ensureFr, exitFair, monthsHistory, HOURS, exitPrepared, companyDebt } from './sim.js';

export function renderExit(ctx) {
  const s = ctx.state;
  const fr = ensureFr(s);
  const ex = fr.exit;
  if (ex.result) {
    const r = ex.result;
    return html`<section class="panel"><h2>🎉 You sold ${s.company.name}</h2>
      <div class="stats">${stat('Price', money(r.price))}${stat('Cash at close', money(r.cash))}${stat('Earnout', money(r.earnoutPaid ?? r.earnout), r.earnout ? `of ${money(r.earnout)}; ${money(r.earnoutForfeited ?? 0)} forfeited (MRR fell below 90% of LOI)` : 'none')}${stat('Your take-home', money(r.founderTake), 'before tax', 'good')}</div>
      ${table({ columns: [{ label: 'Who', render: (p) => p.name }, { label: 'Payout', align: 'right', render: (p) => money(p.payout) }], rows: r.payouts })}
      <p class="small muted">Fees ${money(r.fees)} and debt ${money(r.debt)} came off the top; preferred stock took its preference or converted, whichever paid more.</p></section>`;
  }
  const fair = exitFair(s);
  const m = fair.m;
  const months = monthsHistory(s);
  const debt = companyDebt(s);
  const takeAtFair = waterfall(fr.cap, fair.value, { debt, fees: fair.value * EXIT_FEES }).founderTake;
  const eligible = m.mrr >= MIN_MRR_TO_LIST && months >= 3;
  const L = ex.listing;
  return html`
    <div class="stats">
      ${stat('Estimated value', money(fair.value), fair.basis)}
      ${stat('Revenue band', fair.band.label, `${fair.band.low}–${fair.band.high}x ARR; quality ${pct(fair.quality, 0)}`)}
      ${stat('Your take-home at that price', money(takeAtFair), `after ${pct(EXIT_FEES, 0)} fees, debt and preferences`)}
      ${stat('Revenue history', `${months.toFixed(1)} mo`, 'buyers want 12–24 months of clean books')}
    </div>
    <div class="grid-2">
      <section class="panel">
        <h2>Sell on a marketplace</h2>
        <p class="small muted">Micro-SaaS sells on revenue/profit multiples (Acquire.com-style marketplaces): sub-$1M ARR trades at 2.5–4x revenue, or 4–6x SDE when the business depends on you; asking prices run above closing prices. Buyers pay up for growth >25% YoY, low churn, 70–85% gross margin, profit and clean books reconciled to bank deposits. Strategic acquisitions (Wix/Base44) come from relationships, not listings, and are rare.</p>
        ${!eligible ? html`<div class="callout warn small">Not listable yet: buyers want at least ${money(MIN_MRR_TO_LIST)} MRR and 3+ months of revenue history.</div>` : ''}
        ${!exitPrepared(ex, s.day) ? html`<div class="small">Diligence pack: ${ex.prepHours ?? 0}/${HOURS.exitPrepTotal}h${ex.prepStart != null ? ` · started ${fmtDate(s, ex.prepStart)} (needs ≥60 days of clean-up)` : ''}</div>
            <div class="meter"><div style="width:${Math.min(100, ((ex.prepHours ?? 0) / HOURS.exitPrepTotal) * 100)}%"></div></div>
            <button data-act="prep" ${eligible && (ex.prepHours ?? 0) < HOURS.exitPrepTotal ? '' : 'disabled'}>Work on the diligence pack (${HOURS.exitPrepSession}h)</button><p class="hint">P&L by month, MRR waterfall reconciled to deposits, cohorts, customer concentration, contracts. Listing unprepared is allowed, but buyers offer ~15% less, fewer show up, and more deals die in diligence.</p>` : ''}
        ${!L?.active ? html`<form id="listForm" class="inline"><label>Asking price ($) <input type="number" name="ask" value="${Math.round((fair.value * 1.15) / 1000) * 1000}" step="5000" /></label><button class="primary" ${eligible ? '' : 'disabled'}>List the company (${HOURS.exitListing}h)</button></form><p class="hint">Overpricing kills buyer interest; underpricing leaves money on the table.</p>`
          : html`<p>Listed ${fmtDate(s, L.day)} at <b>${money(L.ask)}</b>. <button class="sm" data-act="delist">Delist</button></p>`}
        ${ex.loi ? html`<div class="callout good small">LOI signed with a ${ex.loi.type.toLowerCase()} at ${money(ex.loi.price)}. Diligence closes ${fmtDate(s, ex.loi.closeDay)}. Keep MRR steady: buyers re-trade if numbers slip.</div>` : ''}
      </section>
      <section class="panel">
        <h2>Offers (LOIs)</h2>
        ${table({ columns: [
          { label: 'Buyer', render: (o) => o.type },
          { label: 'Price', align: 'right', render: (o) => money(o.price) },
          { label: 'Cash / earnout', align: 'right', render: (o) => `${money(o.cashAtClose)} / ${money(o.earnout)}` },
          { label: 'Multiple', align: 'right', render: (o) => (m.arr ? `${(o.price / m.arr).toFixed(1)}x ARR` : '—') },
          { label: '', render: (o) => (ex.loi ? '' : html`<button class="sm primary" data-loi="${o.id}">Sign LOI</button> <button class="sm" data-reject="${o.id}">Decline</button>`) },
        ], rows: ex.offers, empty: L?.active ? 'No offers yet. Serious buyers usually show up over weeks.' : 'List the company to receive offers.' })}
        ${ex.loi ? '' : ex.offers.map((o) => negotiationLauncher({ state: s }, { kind: 'mna', ref: o.id, key: `loi:${o.id}`, label: `Negotiate the ${o.type.toLowerCase()} LOI`, hint: 'Price, earnout share and length, holdback/escrow, buyer stock, exclusivity, your retention. Longer exclusivity and more contingent money are where founders get hurt.' }))}
        ${s.company.path === 'vc' ? html`<p class="small muted">VC-backed: preferred stock gets its 1x back first, so a small sale can leave founders with little. Check the waterfall in Cap table.</p>` : ''}
      </section>
    </div>`;
}

export function wireExit(root, ctx) {
  wireNegotiation(root, ctx);
  on(root, 'click', '[data-act=prep]', () => ctx.act((st) => { const ex = ensureFr(st).exit; ex.prepStart ??= st.day; ex.prepHours = (ex.prepHours ?? 0) + HOURS.exitPrepSession; if (exitPrepared(ex, st.day)) toast('Diligence pack ready.', 'good'); }, { hours: HOURS.exitPrepSession, label: 'Exit: diligence pack' }));
  on(root, 'submit', '#listForm', (e) => {
    e.preventDefault();
    const { ask } = formData(e.target);
    ctx.act((st) => { const ex = ensureFr(st).exit; ex.listing = { active: true, day: st.day, ask: Math.max(10000, ask || 0) }; notify(st, `Listed ${st.company.name} for ${money(ex.listing.ask)}.`, { app: 'fundraising' }); }, { hours: HOURS.exitListing, label: 'Exit: listing' });
  });
  on(root, 'click', '[data-act=delist]', () => ctx.act((st) => { const ex = ensureFr(st).exit; ex.listing.active = false; ex.offers = []; }));
  on(root, 'click', '[data-reject]', (e, el) => ctx.act((st) => { const ex = ensureFr(st).exit; ex.offers = ex.offers.filter((o) => o.id !== el.dataset.reject); }));
  on(root, 'click', '[data-loi]', (e, el) => ctx.act((st) => {
    const ex = ensureFr(st).exit;
    const o0 = ex.offers.find((x) => x.id === el.dataset.loi);
    const neg = findNegotiation(st, `loi:${el.dataset.loi}`);
    if (neg?.status === 'open') throw new Error('Finish or walk away from the negotiation on this offer first.');
    const o = o0.negotiated ? o0 : applyMnaTerms({ ...o0 }, mnaPackage(o0)); // the buyer's standard LOI detail (holdback, exclusivity) when you did not negotiate
    const consent = saleConsent(st, o.price);
    if (consent.blocked) { ex.offers = ex.offers.filter((x) => x.id !== o0.id); notify(st, consent.reason, { type: 'bad', app: 'fundraising' }); throw new Error(consent.reason); }
    ex.loi = { ...o, signedDay: st.day, closeDay: st.day + o.diligenceDays, mrrAtLoi: computeMetrics(st).mrr, prepared: exitPrepared(ex, st.day) };
    ex.offers = [];
    notify(st, `LOI signed at ${money(o.price)}. ${o.diligenceDays} days of diligence (exclusivity).`, { type: 'good', app: 'fundraising' });
  }, { hours: 2, label: 'Exit: LOI review' }));
}
