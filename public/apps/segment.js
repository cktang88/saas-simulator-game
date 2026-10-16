// Who you sell to: the customer type (startups, local SMBs, e-commerce, mid-market, enterprise), what that means for
// every function, how well you are playing it, and moving upmarket. Simulation: apps/segment/engine.js. Data and
// research: data/customer-types.js, docs/research/customer-types/. Multipliers are [design] and never shown as numbers.

import { html, mount, on, toast } from '../core/ui.js';
import { fmtDate } from '../core/util.js';
import { profileOf, customerTypeOf, setCustomerType, CUSTOMER_TYPES, TYPES_BY_MODEL } from '../core/customer-type.js';
import { CHANNELS, UPMARKET } from '../data/customer-types.js';
import { segmentDay, readiness, moveUpmarket, tableStakes, ensureSegment } from './segment/engine.js';
import { readCustomerFit } from './segment/readers.js';
import { adviceFor, reviewFor } from '../core/advice.js';

function pickView(s) {
  const options = TYPES_BY_MODEL[s.company.model] ?? [];
  return html`<section class="panel"><h2>Who do you sell to?</h2>
    <p>This changes how every function behaves: channels, sales cycles, pricing, onboarding, support, payments, churn and what investors ask. You can move upmarket later.</p>
    ${options.map((id) => html`<div class="card"><b>${CUSTOMER_TYPES[id].label}</b><p class="small">${CUSTOMER_TYPES[id].blurb}</p><button class="sm primary" data-pick="${id}">Sell to ${CUSTOMER_TYPES[id].short.toLowerCase()}</button></div>`)}
  </section>`;
}

function upmarketView(s) {
  const S = ensureSegment(s);
  const r = readiness(s);
  if (!r.target) return html`<section class="panel"><h2>Moving upmarket</h2><p class="small muted">You already sell to the top of the ladder.</p>${historyView(s, S)}</section>`;
  const to = CUSTOMER_TYPES[r.target];
  return html`<section class="panel"><h2>Move upmarket: ${to.label}</h2>
    <p class="small">${to.blurb}</p>
    <div class="meter"><div style="width:${Math.round(r.score * 100)}%"></div></div>
    <p class="small">Readiness ${Math.round(r.score * 100)}% (ready at ${Math.round(UPMARKET.readyAt * 100)}%).</p>
    <ul class="list small">${r.checks.map((c) => html`<li>${c.ok ? '✅' : '⬜'} ${c.label} <span class="muted">(${c.have})</span></li>`)}</ul>
    <p class="small muted">Moving switches new sales to ${to.short.toLowerCase()} buyers: longer cycles, buying groups, security reviews and invoices, but bigger contracts and lower churn. Customers you already have stay as they are.</p>
    ${r.ready ? html`<button class="primary" data-up="1">Move upmarket (${UPMARKET.hours[r.target]} h)</button>`
      : html`<div class="callout warn">Not ready. Upmarket buyers stall or drop deals at security review, reference calls and procurement until these exist.</div><button data-up="force">Move anyway (${UPMARKET.hours[r.target]} h)</button>`}
    ${historyView(s, S)}
  </section>`;
}

const historyView = (s, S) => (S.history.length ? html`<h3>History</h3><ul class="list small">${S.history.map((h) => html`<li>${fmtDate(s, h.day)}: ${CUSTOMER_TYPES[h.from]?.short} → ${CUSTOMER_TYPES[h.to]?.short} at ${Math.round(h.readiness * 100)}% readiness${h.premature ? ' (early)' : ''}</li>`)}</ul>` : '');

export default {
  id: 'segment',
  title: 'Who you sell to',
  icon: '🎯',
  group: 'Growth',
  models: ['smb', 'ent'],

  render(root, ctx) {
    const s = ctx.state;
    const p = profileOf(s);
    if (!p) {
      mount(root, html`<div class="app-head"><div><h1>Who you sell to</h1><p>Selling to startups, to mom-and-pop shops and to online stores are different businesses.</p></div></div>${pickView(s)}`);
      on(root, 'click', '[data-pick]', (e, el) => ctx.act((st) => { setCustomerType(st, el.dataset.pick); toast(`You sell to ${CUSTOMER_TYPES[el.dataset.pick].label.toLowerCase()}.`, 'good'); }, { hours: 0.5, label: 'Decide who you sell to' }));
      return;
    }
    const read = readCustomerFit(s);
    const review = reviewFor(s, 'customer_fit', read);
    const stakes = tableStakes(s);
    const chans = Object.entries(p.channels).filter(([c]) => CHANNELS[c]).sort((a, b) => b[1] - a[1]);
    // Advice comes from people (core/advice.js): the playbook and where these buyers are is what an advisor who knows this
    // customer would tell you. With no source and learning mode off the player sees facts only.
    const strong = chans.filter(([, v]) => v >= 1.3).map(([c]) => CHANNELS[c]);
    const weak = chans.filter(([, v]) => v < 0.5).map(([c]) => CHANNELS[c]);
    const lines = [...p.playbook, strong.length ? `Where ${p.short.toLowerCase()} buyers are: ${strong.join(', ')}.` : null, weak.length ? `Channels that rarely reach them: ${weak.join(', ')}.` : null].filter(Boolean);
    const advice = adviceFor(s, 'customer_fit', lines, { kind: 'coaching' });
    const sold = (s.stripe?.subscriptions ?? []).filter((x) => x.customerType === customerTypeOf(s) && ['active', 'trialing', 'past_due'].includes(x.status)).length;
    mount(root, html`
      <div class="app-head"><div><h1>Who you sell to: ${p.label}</h1><p>${p.blurb}</p></div></div>
      <div class="stats">
        <div class="stat"><div class="stat-label">Customers sold to this type</div><div class="stat-value">${sold}</div></div>
        ${review.tier ? html`<div class="stat"><div class="stat-label">${review.reviewer}</div><div class="stat-value">${review.tier}</div></div>` : ''}
      </div>
      <div class="grid-2">
        <section class="panel"><h2>What the research says</h2><ul class="list small">${p.facts.map((x) => html`<li>${x}</li>`)}</ul>
          <ul class="list small"><li><b>Paying:</b> ${p.payments.note ?? ''}</li><li><b>Economy:</b> ${p.macro.label}</li>${p.seasonality?.note ? html`<li><b>Seasons:</b> ${p.seasonality.note}</li>` : ''}</ul>
        </section>
        <section class="panel"><h2>Advice on selling to ${p.short.toLowerCase()}</h2>
          ${advice.length ? html`<ul class="list small">${advice.map((a) => html`<li>${a.text} <span class="muted">(${a.from})</span></li>`)}</ul>`
            : html`<p class="empty">Nobody is advising you on this yet. An advisor or consultant who has sold to ${p.label.toLowerCase()} (Advisors) can tell you what works; otherwise you learn it from your own numbers.</p>`}
        </section>
      </div>
      <div class="grid-2">
        <section class="panel"><h2>Your numbers</h2>
          <ul class="list small">${(review.evidence?.length ? review.evidence : read.evidence).map((x) => html`<li>${x}</li>`)}</ul>
          <h3>Table stakes</h3><ul class="list small">${stakes.length ? stakes.map((t) => html`<li>${t.shipped ? '✅' : '⬜'} ${t.label}</li>`) : html`<li>None.</li>`}</ul>
        </section>
        ${upmarketView(s)}
      </div>`);
    on(root, 'click', '[data-up]', (e, el) => {
      const plan = moveUpmarket(ctx.state, { dryRun: true });
      if (!plan.ok) { toast(plan.error, 'warn'); return; }
      ctx.act((st) => { const r = moveUpmarket(st); toast(r.premature ? `Moved upmarket at ${Math.round(r.readiness.score * 100)}% readiness. Expect stalled deals until the gaps close.` : `Now selling to ${CUSTOMER_TYPES[r.to].label.toLowerCase()}. New deals follow their buying process; existing customers stay as they are.`, r.premature ? 'warn' : 'good'); }, { hours: plan.hoursCost, label: 'Reposition for upmarket buyers (site, pricing, deck, security pack)' });
    });
  },

  onDay(state) { segmentDay(state); },
};
