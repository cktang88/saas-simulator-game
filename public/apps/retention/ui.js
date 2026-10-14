// Shared retention UI: leading churn signals with save tactics (Success for CRM accounts, Insights/Analytics for
// self-serve accounts), the Churnkey-style cancel flow and the B2C lapse push. Logic lives in core/churn.js.
import { html, formData, on } from '../../core/ui.js';
import { money, pct, fmtDate, clamp } from '../../core/util.js';
import { ensureChurn, visibleSignals, tacticsFor, applySaveTactic, CHURN, b2cCategoryOf, B2C_CATEGORY_IDS } from '../../core/churn.js';
import { SIGNALS, B2C_CHURN } from '../../data/churn-reasons.js';
import { monthlyAmount } from '../../core/stripe.js';

const subOf = (s, id) => s.stripe?.subscriptions.find((x) => x.id === id);
const custOf = (s, id) => s.stripe?.customers.find((x) => x.id === id);
const nameOf = (s, sub) => { const c = custOf(s, sub.customerId); const co = c?.crmCompanyId ? s.apps.crm?.companies?.find((x) => x.id === c.crmCompanyId)?.name : null; return co ?? c?.company ?? c?.name ?? 'Customer'; };
const live = (sub) => sub && (sub.status === 'active' || sub.status === 'past_due');

/** Accounts with fired signals, newest first: [{ sub, signals, lastDay }]. */
export function riskAccounts(s, { crm = null } = {}) {
  const by = new Map();
  for (const sig of visibleSignals(s, { crm })) {
    const sub = subOf(s, sig.subId);
    if (!live(sub)) continue;
    const e = by.get(sub.id) ?? { sub, signals: [], lastDay: 0 };
    e.signals.push(sig);
    e.lastDay = Math.max(e.lastDay, sig.day);
    by.set(sub.id, e);
  }
  return [...by.values()].sort((a, b) => b.lastDay - a.lastDay || monthlyAmount(b.sub) - monthlyAmount(a.sub));
}

const leadTxt = (l) => `usually ${l[0]}–${l[1]} days before they leave`;

export function riskPanel(s, { crm = null, title = 'Churn signals', limit = 25 } = {}) {
  const c = ensureChurn(s);
  const rows = riskAccounts(s, { crm }).slice(0, limit);
  const recent = c.attempts.filter((a) => (crm == null || Boolean(custOf(s, subOf(s, a.subId)?.customerId)?.crmCompanyId) === crm)).slice(-12).reverse();
  return html`<section class="panel"><h2>${title} ${rows.length ? html`<span class="badge warn">${rows.length}</span>` : ''}</h2>
    <p class="small muted">Leading indicators fire before a cancellation with typical lead times (game estimates). Not every signal means the account is leaving, and the right save depends on WHY they would leave: a discount does nothing for a business that closed, and an onboarding rescue does nothing for a budget cut. Wrong tactics cost hours and margin and show up in the Scorecard.</p>
    ${rows.length ? html`<div class="list">${rows.map(({ sub, signals }) => {
      const tactics = tacticsFor(s, sub);
      return html`<div class="card" style="margin-bottom:8px">
        <div><b>${nameOf(s, sub)}</b> <span class="small muted">${money(monthlyAmount(sub))}/mo · renews ${fmtDate(s, sub.currentPeriodEnd)}</span></div>
        <ul class="small" style="margin:4px 0">${signals.map((g) => html`<li>${badge2(g.strength)} ${g.label} <span class="muted">(seen ${fmtDate(s, g.day)}; ${leadTxt(g.leadDays)})</span></li>`)}</ul>
        <form class="inline" data-save-form="${sub.id}"><select name="tactic">${tactics.map((t) => html`<option value="${t.id}">${t.label} · ${t.hours}h${t.cash ? ` · ${money(t.cash)}` : ''}${t.price ? ` · ${Math.round(t.price.pct * 100)}% off ${t.price.months} mo` : ''}</option>`)}</select><button class="sm">Use tactic</button></form>
      </div>`;
    })}</div>` : html`<p class="empty">No churn signals right now.</p>`}
    ${recent.length ? html`<h3>Recent save attempts</h3><ul class="list small">${recent.map((a) => { const sub = subOf(s, a.subId); return html`<li>${fmtDate(s, a.day)} · ${sub ? nameOf(s, sub) : 'account'} · ${a.tactic.replace(/_/g, ' ')} · ${a.hours}h${a.cash + a.marginUsd > 0 ? ` · ${money(a.cash + a.marginUsd)}` : ''} · <span class="badge ${a.outcome === 'saved' ? 'good' : a.outcome === 'lost' ? 'bad' : ''}">${a.outcome.replace(/_/g, ' ')}</span></li>`; })}</ul>` : ''}
  </section>`;
}
const badge2 = (st) => html`<span class="badge ${st >= 0.7 ? 'bad' : st >= 0.5 ? 'warn' : ''}">${st >= 0.7 ? 'strong' : st >= 0.5 ? 'medium' : 'weak'}</span>`;

/** Aggregate signal counts (B2C and large self-serve bases where per-account saves don't scale). */
export function signalSummary(s, { days = 30 } = {}) {
  const counts = {};
  for (const g of visibleSignals(s, { days })) counts[g.signal] = (counts[g.signal] ?? 0) + 1;
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return html`<section class="panel"><h2>Leading churn signals (last ${days} days)</h2>
    ${rows.length ? html`<ul class="list small">${rows.map(([id, n]) => html`<li>${badge2(SIGNALS[id].strength)} ${SIGNALS[id].label}: <b>${n}</b> <span class="muted">· ${leadTxt(SIGNALS[id].leadDays)}</span></li>`)}</ul>` : html`<p class="empty">No signals yet.</p>`}
    <p class="small muted">${s.company.model === 'b2c' ? 'Consumer churn is fought with systems, not calls: a cancel flow with the right offers, a lapse push, renewal reminders and dunning.' : 'Act on strong signals per account (Success for CRM accounts, the at-risk list for self-serve).'}</p></section>`;
}

export function wireRisk(root, ctx) {
  on(root, 'submit', '[data-save-form]', (e, el) => {
    e.preventDefault();
    const subId = el.dataset.saveForm;
    const tactic = formData(el).tactic;
    const sub = subOf(ctx.state, subId);
    const t = sub && tacticsFor(ctx.state, sub).find((x) => x.id === tactic);
    if (!t) return;
    ctx.act((st) => {
      const r = applySaveTactic(st, subId, tactic);
      ctx.toast(r.saved ? 'They are staying. (You may not know why until renewal.)' : 'Done. Whether it worked shows at renewal.', r.saved ? 'good' : 'info');
    }, { hours: t.hours, label: `Retention: ${t.label}` });
  });
}

// ---- Cancel flow (Churnkey-style) and B2C lapse push ----

export function cancelFlowPanel(s) {
  const c = ensureChurn(s);
  const f = c.flow;
  const fs = c.flowStats;
  const eligible = s.company.model !== 'ent';
  return html`<div class="panel"><h3>Cancel flow (Churnkey / Paddle Retain style)</h3>
    <p class="small muted">${eligible ? 'Self-serve customers who click Cancel see a one-question survey, then an offer: pause (1–3 months, data kept), downgrade to a cheaper tier, or a temporary discount. Well-built flows save about 15–25% of people who start to cancel; vendors claim 34–54% (discount those). Offers only work when they fit the real reason: a pause fits a seasonal slowdown, a discount fits price, nothing saves a business that closed. Discounts are the least durable saves, and a known discount trains happy customers to threaten cancellation. CRM accounts cancel through you, not the flow.' : 'Enterprise accounts cancel through their contract and renewal, not a self-serve flow.'}</p>
    ${eligible ? html`<form id="flowForm" class="inline" style="flex-wrap:wrap">
      <label><input type="checkbox" name="enabled" ${f.enabled ? 'checked' : ''}/> On</label>
      <label><input type="checkbox" name="survey" ${f.survey ? 'checked' : ''}/> Ask why first (tailor the offer)</label>
      <label><input type="checkbox" name="pause" ${f.offers.pause ? 'checked' : ''}/> Pause</label>
      <label><input type="checkbox" name="downgrade" ${f.offers.downgrade ? 'checked' : ''}/> Downgrade</label>
      <label><input type="checkbox" name="discount" ${f.offers.discount ? 'checked' : ''}/> Discount</label>
      <label>% off <input type="number" name="discountPct" min="5" max="80" value="${f.discountPct}" style="width:70px"/></label>
      <label>months <input type="number" name="discountMonths" min="1" max="12" value="${f.discountMonths}" style="width:60px"/></label>
      <button class="sm">${f.setup ? 'Save (15 min)' : `Build it (${CHURN.flow.setupHours} h)`}</button></form>
      <p class="small">${fs.started} reached the flow · ${fs.saved} saved (${fs.started ? pct(fs.saved / fs.started, 0) : '—'}): pause ${fs.byOffer.pause}, downgrade ${fs.byOffer.downgrade}, discount ${fs.byOffer.discount} · paused who came back ${fs.resumed}, left after the pause ${fs.pauseLost} · discounts to customers who weren't leaving <b>${fs.threatDiscounts}</b> · margin given ${money(fs.marginGiven)}</p>` : ''}
    ${s.company.model === 'b2c' ? html`<form id="reengForm" class="inline"><label><input type="checkbox" name="enabled" ${c.reengagement.enabled ? 'checked' : ''}/> Lapse re-engagement push (streak / habit reminder timed to the drop)</label><button class="sm">${c.reengagement.setup ? 'Save' : `Set up (${CHURN.reengagement.setupHours} h)`}</button></form><p class="small muted">Brings back some lapsing users before the next charge (about 15% of lapsers, a game estimate). ${c.reengagement.saved} saved so far.</p>` : ''}
  </div>`;
}

export function wireCancelFlow(root, ctx) {
  on(root, 'submit', '#flowForm', (e) => {
    e.preventDefault();
    const fd = formData(e.target);
    const first = !ensureChurn(ctx.state).flow.setup && Boolean(fd.enabled);
    ctx.act((st) => {
      const f = ensureChurn(st).flow;
      const was = f.enabled && f.offers.discount;
      Object.assign(f, { enabled: Boolean(fd.enabled), survey: Boolean(fd.survey), discountPct: clamp(Math.round(+fd.discountPct || 25), 5, 80), discountMonths: clamp(Math.round(+fd.discountMonths || 3), 1, 12) });
      f.offers = { pause: Boolean(fd.pause), downgrade: Boolean(fd.downgrade), discount: Boolean(fd.discount) };
      if (f.enabled) f.setup = true;
      if (f.enabled && f.offers.discount && !was) f.sinceDay = st.day;
    }, { hours: first ? CHURN.flow.setupHours : 0.25, label: 'Cancel flow' });
  });
  on(root, 'submit', '#reengForm', (e) => {
    e.preventDefault();
    const fd = formData(e.target);
    const first = !ensureChurn(ctx.state).reengagement.setup && Boolean(fd.enabled);
    ctx.act((st) => { const r = ensureChurn(st).reengagement; r.enabled = Boolean(fd.enabled); if (r.enabled) r.setup = true; }, { hours: first ? CHURN.reengagement.setupHours : 0.1, label: 'Lapse push' });
  });
}

/** B2C category picker (company setting used for churn reasons; defaults from the one-liner). */
export function b2cCategoryField(s) {
  if (s.company.model !== 'b2c') return '';
  const cur = b2cCategoryOf(s);
  return html`<form id="b2cCatForm" class="inline"><label>App category <select name="cat"><option value="">${cur ? `Auto: ${B2C_CHURN[cur].label}` : 'Auto (no match: generic consumer mix)'}</option>${B2C_CATEGORY_IDS.map((id) => html`<option value="${id}" ${s.company.b2cCategory === id ? 'selected' : ''}>${B2C_CHURN[id].label}</option>`)}</select></label><button class="sm">Save</button></form>`;
}
export function wireB2cCategory(root, ctx) {
  on(root, 'submit', '#b2cCatForm', (e) => { e.preventDefault(); const v = formData(e.target).cat; ctx.act((st) => { st.company.b2cCategory = v || null; }, { hours: 0.05, label: 'Settings' }); });
}
