// CRM views for founder-led sales learning (variant tags, win rate by variant) and pre-selling (offers, asks,
// commitment vs compliment). The deal panel pieces are also used from Calls after a held call.
import { html, on, formData, stat, badge, toast } from '../../core/ui.js';
import { money, pct, fmtDate, isoDate } from '../../core/util.js';
import { shippedFeatures } from '../../core/market.js';
import { isOpen } from './deals.js';
import { dealById } from './model.js';
import { VARIANT_FIELDS, STABLE, variantStats, founderWinRate, tagDeal, dealRole } from './variants.js';
import { PRESELL, LEVELS, ensurePresell, offerById, offerClarity, promiseStatus, createOffer, askForCommitment, labelAsk, deliverOffer, extendOffer, isCommitment, presellRead } from './presell.js';
import { rfpWired } from './engine.js';
import { declineRfp } from './model.js';
import { dealBidBox } from './rfp-view.js';
import { referencePool, provideReferences, REF, referenceLabel } from './references.js';

const dayFromIso = (state, iso) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${state.startDate}T12:00:00Z`)) / 86400000);
const OUTCOME_TONE = { committed: 'good', polite: 'warn', stall: 'warn', decline: 'bad' };
const OUTCOME_LABEL = { committed: 'committed', polite: 'polite interest', stall: 'stalled', decline: 'said no' };

// ---- deal panel pieces ----

export function variantForm(s, deal) {
  const v = deal.variant ?? {};
  return html`<fieldset><legend>Message / demo variant (what are you testing?)</legend>
    <form data-variantform="${deal.id}" class="inline">
      <label>Message or angle <input name="message" value="${v.message ?? ''}" placeholder="e.g. cost of month-end close" /></label>
      <label>Demo flow <input name="demo" value="${v.demo ?? ''}" placeholder="e.g. live data first" /></label>
      <label>Buyer role <input name="role" value="${v.role ?? dealRole(s, deal)}" /></label>
      <button class="sm">Tag (1 min)</button></form>
    <p class="hint">Tag every deal you work. Win rate by variant shows up under CRM → Learning, so you know what to hand to a sales hire.</p></fieldset>`;
}

export function rfpBox(s, deal) {
  if (!deal.proc?.rfp || !isOpen(deal)) return '';
  const formal = dealBidBox(s, deal);
  if (formal) return formal; // the bid process (CRM -> Bids) replaces the flat RFP note
  const wired = rfpWired(s, deal);
  return html`<div class="callout warn"><b>Formal RFP required.</b> An open bid wins about half as often; ${wired} engaged contact(s) on their side${wired ? ' helped shape the criteria' : ': nobody has engaged, so assume the criteria favour someone else'}. A response takes 20–120 hours. <button class="sm danger" data-nobid="${deal.id}">No-bid (decline)</button></div>`;
}

/** The buyer asked to speak to customers: pick who (their real health decides what the buyer hears). */
function referencesPanel(s, deal) {
  const R = deal.references;
  if (!R) return '';
  if (R.status === 'done' || R.status === 'provided') {
    return html`<div class="callout ${R.calls?.some((x) => ['lukewarm', 'negative', 'exposed'].includes(x.outcome)) ? 'bad' : ''} small"><b>References.</b> ${R.status === 'provided' ? `${R.ids.length} sent; the buyer calls them before deciding.` : R.calls?.length ? R.calls.map((x) => `${x.name}: ${referenceLabel(x.outcome)}`).join(' · ') : 'None given.'}</div>`;
  }
  const pool = referencePool(s);
  return html`<fieldset><legend>They asked for ${R.need} customer reference${R.need > 1 ? 's' : ''}</legend>
    ${pool.length ? html`<form data-refform="${deal.id}"><ul class="list small">${pool.map((p) => html`<li><label style="margin:0"><input type="checkbox" name="${p.customerId}" /> ${p.name} <span class="muted">health ${p.health}/100 · usage ${Math.round(p.usage * 100)}%${p.tickets ? ` · ${p.tickets} open ticket${p.tickets > 1 ? 's' : ''}` : ''}${p.referenceable ? ' · agreed to be a reference' : ''}${p.recent ? ` · asked ${p.recent}× in 90 days` : ''}</span></label></li>`)}</ul>
      <button class="sm">Send references (${REF.prepHours} h each to brief them)</button></form>
      <p class="hint">Customers answer candidly: an unhappy or at-risk account tells the buyer so. Pick healthy accounts with measurable results, brief them, and do not wear out the same one.</p>`
      : html`<p class="small muted">No paying customers yet: tell them they would be an early customer and offer a pilot instead.</p>`}</fieldset>`;
}

export function presellDealPanel(s, deal) {
  if (!isOpen(deal) || !deal.contactId) return '';
  return html`${referencesPanel(s, deal)}${presellOffers(s, deal)}`;
}

function presellOffers(s, deal) {
  const P = ensurePresell(s);
  const open = P.offers.filter((o) => o.status === 'open');
  const asks = P.asks.filter((a) => a.dealId === deal.id);
  return html`<fieldset><legend>Pre-sell an offer (before the product exists)</legend>
    ${open.length ? html`<form data-askform="${deal.id}" class="inline">
      <label>Offer <select name="offerId">${open.map((o) => html`<option value="${o.id}">${o.title} · ${money(o.price)}/${o.interval === 'once' ? 'once' : o.interval} · starts ${fmtDate(s, o.startDay)}</option>`)}</select></label>
      <label>Ask for <select name="level">${Object.entries(LEVELS).map(([k, l]) => html`<option value="${k}" ${k === 'preorder' ? 'selected' : ''}>${l.label}: "${l.ask}"</option>`)}</select></label>
      <button class="sm primary">Present & ask (36 min)</button></form>
      <p class="hint">"Sounds great" is free. Ask for something that costs them: a signed LOI, a refundable deposit or a pre-order. Money goes through Stripe and is refunded if you miss the date.</p>`
      : html`<p class="small muted">No open offer. <a href="#/crm/presell">Write one under CRM → Pre-sell</a> (description, price, start date).</p>`}
    ${asks.length ? html`<ul class="list small">${asks.map((a) => askRow(s, a))}</ul>` : ''}</fieldset>`;
}

function askRow(s, a) {
  const o = offerById(s, a.offerId);
  return html`<li>${badge(OUTCOME_LABEL[a.outcome], OUTCOME_TONE[a.outcome])} <b>${LEVELS[a.level].label}</b> for "${o?.title ?? ''}" · ${a.who}<div class="muted">"${a.response}"${a.amount ? ` · ${money(a.amount)} charged${a.status === 'refunded' ? ' (refunded)' : ''}` : ''}</div>
    ${a.label == null ? html`<div class="inline">Does this count as demand? <button class="sm" data-label="${a.id}" data-yes="1">Yes, it's demand</button><button class="sm" data-label="${a.id}" data-yes="0">No, just interest</button></div>`
      : html`<div class="small">You counted it as ${a.label ? 'demand' : 'not demand'}${a.label === isCommitment(a) ? html` ${badge('right', 'good')}` : html` ${badge(a.label ? 'a compliment, not demand' : 'a real commitment you discounted', 'bad')}`}</div>`}</li>`;
}

// ---- CRM tabs ----

export function learningView(s) {
  const wr = founderWinRate(s);
  const tables = Object.keys(VARIANT_FIELDS).map((f) => ({ f, st: variantStats(s, f) }));
  return html`<section class="panel"><h2>Founder-led sales learning</h2>
    <p>Before you hire sales, learn what wins: which message, which demo flow and which buyer role close. Tag each deal (Deal panel → Message / demo variant), then read the win rate below.</p>
    <div class="stats">
      ${stat('Founder-led closed deals', wr.closed, `${wr.wins} won · only qualified opportunities count`)}
      ${stat('Win rate', wr.winRate == null ? '—' : pct(wr.winRate, 0), wr.closed ? `95% range ${pct(wr.lo, 0)}–${pct(wr.hi, 0)}` : '')}
      ${stat('Deals tagged', `${wr.tagged}/${wr.closed}`, 'variant tags on closed deals')}
      ${stat('Stable enough to hire?', wr.stable ? 'Yes' : 'Not yet', `needs ${STABLE.minClosed}+ closed, ${STABLE.minWins}+ wins, recent half within ${Math.round(STABLE.maxDrift * 100)} pts of the older`, wr.stable ? 'good' : 'warn')}
    </div>
    ${wr.stable ? '' : html`<div class="callout warn">Hiring an account executive before your own win rate is stable buys ~3 months of ramp pay with no repeatable message to run, and it is logged as a mistake. [design rule of thumb, not a published statistic]</div>`}
  </section>
  ${tables.map(({ f, st }) => html`<section class="panel"><h3>${VARIANT_FIELDS[f]}</h3>
    ${st.rows.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Variant</th><th>Won</th><th>Lost</th><th>Open</th><th>Win rate</th><th>95% range</th></tr></thead><tbody>
      ${st.rows.map((r) => html`<tr><td>${r.variant}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.open}</td><td>${r.winRate == null ? '—' : pct(r.winRate, 0)} ${r.enough ? '' : badge(`n<${STABLE.minVariantN}`, 'warn')}</td><td class="muted">${r.closed ? `${pct(r.lo, 0)}–${pct(r.hi, 0)}` : ''}</td></tr>`)}</tbody></table></div>
      <p class="small">${st.clearWinner ? html`${badge('clear leader', 'good')} "${st.clearWinner}" beats the next variant beyond noise.` : 'No variant is a clear winner yet. At founder-led sample sizes, differences under ~25 points are mostly luck.'}</p>`
      : html`<p class="empty">No tagged deals yet.</p>`}</section>`)}`;
}

export function presellView(s) {
  const P = ensurePresell(s);
  const rd = presellRead(s);
  const real = P.asks.filter(isCommitment).length;
  const believed = P.asks.filter((a) => a.label === true).length;
  const feats = shippedFeatures(s);
  const allFeats = (s.apps.product?.features ?? []).filter((f) => f.title);
  const defaultDate = isoDate(s, s.day + 45);
  return html`<section class="panel"><h2>Pre-sell: test an offer before you build</h2>
    <p>Write one specific offer (what it does, price, start date) and ask prospects for a commitment. Pain, fit and budget decide what they would really do; politeness decides what they say. Only an LOI, a deposit or a pre-order is demand.</p>
    <div class="stats">
      ${stat('Real commitments', real, 'LOI, deposit or pre-order', real ? 'good' : '')}
      ${stat('What you believe', believed, 'answers you labelled as demand', believed > real ? 'bad' : '')}
      ${stat('Compliments counted as demand', P.stats.inflated, '', P.stats.inflated ? 'bad' : 'good')}
      ${stat('Mom Test read', rd.tier === 'unknown' ? '—' : rd.tier, rd.evidence[0] ?? 'ask 3+ prospects')}
    </div>
    ${rd.coaching.map((c) => html`<p class="small warn">${c}</p>`)}
    <p class="hint">Money goes through Stripe. If you have not delivered ${PRESELL.graceDays} days after the start date, everything is refunded (the US FTC order rule expects shipping within 30 days or a refund offer); Stripe keeps its fee, the buyers remember, and it is logged as a mistake.</p></section>
  <div class="grid-2"><section class="panel"><h2>New offer</h2>
    <form id="offerForm"><label>Name <input name="title" required maxlength="80" placeholder="Nightly payout matching for Shopify stores" /></label>
      <label>What it does and the outcome <textarea name="description" rows="4" placeholder="Matches every Shopify payout to the bank deposit overnight so month-end close takes 1 hour instead of 2 days. No spreadsheets."></textarea></label>
      <div class="grid-2"><label>Price <input type="number" name="price" min="1" step="1" required /></label>
        <label>Billing <select name="interval"><option value="month">per month</option><option value="year">per year</option><option value="once">one-time</option></select></label></div>
      <label>Start date (you will be held to it) <input type="date" name="start" value="${defaultDate}" /></label>
      <fieldset><legend>Promises (tie each to something on your roadmap)</legend>
        ${[0, 1, 2].map((i) => html`<div class="inline"><input name="p${i}" placeholder="A feature you promise" /><select name="f${i}"><option value="">Not on the roadmap</option>${allFeats.map((f) => html`<option value="${f.id}">${f.title} (${f.status})</option>`)}</select></div>`)}
        <p class="hint">Promising what is not planned makes prospects say yes more often today and take their money back at delivery. ${feats.length} feature(s) shipped so far.</p></fieldset>
      <button class="primary">Save offer (30 min to write)</button></form></section>
    <section class="panel"><h2>Offers</h2>
      ${P.offers.length ? P.offers.map((o) => offerCard(s, P, o)) : html`<p class="empty">No offers yet.</p>`}</section></div>
  <section class="panel"><h2>All answers</h2>
    ${P.asks.length ? html`<ul class="list small">${[...P.asks].reverse().map((a) => askRow(s, a))}</ul>` : html`<p class="empty">Ask a prospect from the deal panel (Pre-sell an offer).</p>`}</section>`;
}

function offerCard(s, P, o) {
  const asks = P.asks.filter((a) => a.offerId === o.id);
  const committed = asks.filter((a) => a.status === 'open' && isCommitment(a));
  const cl = offerClarity(o);
  return html`<div class="card"><b>${o.title}</b> ${badge(o.status, o.status === 'open' ? 'accent' : o.status === 'delivered' ? 'good' : 'bad')}
    <div class="small">${money(o.price)}/${o.interval} · starts ${fmtDate(s, o.startDay)}${o.extensions ? ` (moved ${o.extensions}×)` : ''} · clarity ${Math.round(cl.score * 100)}/100</div>
    <div class="small muted">${o.promises.map((p) => `${p.text} [${promiseStatus(s, p)}]`).join(' · ') || 'No promises listed'}</div>
    ${cl.issues.map((i) => html`<div class="small warn">${i}</div>`)}
    <div class="small">${asks.length} asks · ${committed.length} open commitments (${committed.filter((a) => a.chargeId).length} paid)</div>
    ${o.status === 'open' ? html`<div class="inline"><button class="sm primary" data-deliver="${o.id}">Deliver (1h)</button>
      <button class="sm" data-extend="${o.id}">Move date +30 days (tell customers, 30 min)</button></div>` : ''}</div>`;
}

export function wireLearning(root, ctx) {
  on(root, 'submit', '[data-refform]', (e) => {
    e.preventDefault();
    const ids = Object.entries(formData(e.target)).filter(([, v]) => v === true || v === 'on').map(([k]) => k);
    ctx.act((st) => { const h = provideReferences(st, dealById(st, e.target.dataset.refform), ids); toast(`References sent (${h} h of prep).`, 'info'); }, { hours: REF.prepHours * Math.max(1, Math.min(3, ids.length)), label: 'Customer references' });
  });
  on(root, 'submit', '[data-variantform]', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    ctx.act((st) => { tagDeal(st, dealById(st, e.target.dataset.variantform), f); }, { hours: 0.02, label: 'CRM hygiene' });
  });
  on(root, 'click', '[data-nobid]', (e, el) => ctx.act((st) => { declineRfp(st, dealById(st, el.dataset.nobid)); toast('You no-bid the RFP and kept your hours.', 'info'); }, { hours: 0.25, label: 'RFP no-bid' }));
  on(root, 'submit', '[data-askform]', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    ctx.act((st) => {
      const a = askForCommitment(st, { offerId: f.offerId, dealId: e.target.dataset.askform, level: f.level });
      toast(a.outcome === 'committed' ? `Committed: ${a.response}` : `"${a.response}" Decide whether that counts.`, a.outcome === 'committed' ? 'good' : 'info');
    }, { hours: PRESELL.presentHours + PRESELL.askHours, label: 'Pre-sell call' });
  });
  on(root, 'click', '[data-label]', (e, el) => ctx.act((st) => {
    const r = labelAsk(st, el.dataset.label, el.dataset.yes === '1');
    toast(r.correct ? 'Right call.' : r.truth ? 'That was a real commitment.' : 'That was politeness, not demand.', r.correct ? 'good' : 'warn');
  }, { hours: PRESELL.labelHours, label: 'Pre-sell notes' }));
  on(root, 'submit', '#offerForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const promises = [0, 1, 2].map((i) => ({ text: f[`p${i}`], featureId: f[`f${i}`] })).filter((p) => String(p.text ?? '').trim());
    ctx.act((st) => { createOffer(st, { title: f.title, description: f.description, price: f.price, interval: f.interval, startDay: dayFromIso(st, f.start), promises }); }, { hours: PRESELL.writeHours, label: 'Writing a pre-sell offer' });
  });
  on(root, 'click', '[data-deliver]', (e, el) => ctx.act((st) => { const r = deliverOffer(st, el.dataset.deliver); toast(`${r.converted} started, ${r.refunded} refunded.`, r.refunded ? 'warn' : 'good'); }, { hours: 1, label: 'Delivering a pre-sold offer' }));
  on(root, 'click', '[data-extend]', (e, el) => ctx.act((st) => { const o = offerById(st, el.dataset.extend); const r = extendOffer(st, o.id, o.startDay + 30); toast(`${r.left} customer(s) took their money back.`, r.left ? 'warn' : 'info'); }, { hours: 0.5, label: 'Telling pre-order customers' }));
}
