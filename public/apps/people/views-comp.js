// People app, "Comp plans" tab: the GTM compensation plan designer (one plan per role), recent payouts and CSM/AM/SE
// coverage. Model and consequences live in people/comp.js and people/gtm-team.js. Numbers tagged [design] in
// data/gtm-comp.js are game assumptions and are labelled as such here.

import { html, on, formData, stat, badge, table } from '../../core/ui.js';
import { money, pct, fmtDate } from '../../core/util.js';
import { COMP_ROLES, COMP_ROLE_KEYS, PLAN_TEMPLATES, OTE_MARKET } from '../../data/gtm-comp.js';
import { planFor, setPlan, payoutFor, targetVariable, baseOf, autoRate, rateOf, complexity, oteRatio, expectedVariable, planKeyOf, ensureComp, marketOte } from './comp.js';
import { coverageReport } from './gtm-team.js';
import { ensurePeople } from './sim.js';

const label = (k) => COMP_ROLES[k].label;
const unit = (k, metric) => COMP_ROLES[k].units[metric] ?? 'units';
const fmtQuota = (k, plan) => (k === 'csm' ? `${Math.round(plan.quota * 100)}%` : plan.metric === 'pipeline_usd' || ['ae', 'founding_ae', 'am', 'se'].includes(k) || plan.metric === 'sourced_closed_won' ? money(plan.quota) : String(plan.quota));
const tagFor = (k) => (COMP_ROLES[k].src.includes('[verified]') ? 'benchmark' : 'game assumption');

function planCard(s, p, key) {
  const plan = planFor(s, key);
  const r = COMP_ROLES[key];
  const onPlan = p.members.filter((m) => m.kind !== 'ai_agent' && m.status === 'active' && planKeyOf(m) === key);
  const tv = targetVariable(plan);
  const curve = [0.5, 1, 1.5, 2].map((a) => [a, payoutFor(plan, { attainment: a, tv }).pay]);
  const x = complexity(plan);
  const ote = oteRatio(s, onPlan[0] ?? { jobRole: r.jobRole, salary: baseOf(plan), equityPct: 0, kind: 'employee' });
  const seller = key === 'ae' || key === 'founding_ae';
  const csm = key === 'csm';
  return html`<section class="panel">
    <h2 style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">${r.label} ${badge(`${onPlan.length} on this plan`, onPlan.length ? 'good' : '')}</h2>
    <form class="compForm" data-role="${key}">
      <div class="grid-3">
        <label>Template <select name="template">${Object.entries(PLAN_TEMPLATES).map(([id, t]) => html`<option value="${id}" ${plan.template === id ? 'selected' : ''}>${t.label}</option>`)}</select></label>
        <label>OTE (annual) <input type="number" name="ote" value="${plan.ote}" min="20000" step="1000" /></label>
        <label>Base share % <input type="number" name="basePct" value="${Math.round(plan.basePct * 100)}" min="20" max="100" step="1" /></label>
      </div>
      <div class="grid-3">
        <label>Paid on <select name="metric" data-metric="${key}">${r.metrics.map((m) => html`<option value="${m}" ${plan.metric === m ? 'selected' : ''}>${r.units[m]}</option>`)}</select></label>
        <label>${csm ? 'Target' : 'Annual quota'} <input type="number" name="quota" value="${csm ? plan.quota : plan.quota}" step="${csm ? '0.01' : '1'}" /></label>
        <label>Rate override <input type="number" name="rate" value="${plan.rate ?? ''}" step="0.0001" min="0" placeholder="auto ${csm ? '' : (autoRate(plan) * 100).toFixed(2) + '%'}" /></label>
      </div>
      <details open><summary class="small muted">Accelerators, cap and floors</summary>
        <div class="grid-3">
          <label>Accelerator above % of quota <input type="number" name="accelAt" value="${Math.round(plan.accelAt * 100)}" min="50" max="200" /></label>
          <label>Accelerator multiple <input type="number" name="accelMult" value="${plan.accelMult}" min="1" max="4" step="0.25" /></label>
          <label>Cap, % of target variable (blank = uncapped) <input type="number" name="cap" value="${plan.cap != null ? Math.round(plan.cap * 100) : ''}" min="100" max="600" placeholder="uncapped" /></label>
          <label>Decelerator below % of quota <input type="number" name="decelBelow" value="${Math.round(plan.decelBelow * 100)}" min="0" max="95" /></label>
          <label>Decelerator multiple <input type="number" name="decelMult" value="${plan.decelMult}" min="0" max="1" step="0.05" /></label>
          <label>Settled <select name="period"><option value="monthly" ${plan.period === 'monthly' ? 'selected' : ''}>Monthly</option><option value="quarterly" ${plan.period === 'quarterly' ? 'selected' : ''}>Quarterly</option></select></label>
        </div></details>
      <details open><summary class="small muted">Protection, timing and credit</summary>
        <div class="grid-3">
          <label>Clawback window, days (0 = none) <input type="number" name="clawbackDays" value="${plan.clawbackDays}" min="0" max="730" /></label>
          <label>Clawback share % <input type="number" name="clawbackPct" value="${Math.round(plan.clawbackPct * 100)}" min="0" max="100" /></label>
          <label>Commission paid on <select name="payTiming"><option value="booking" ${plan.payTiming === 'booking' ? 'selected' : ''}>Booking (signed)</option><option value="cash" ${plan.payTiming === 'cash' ? 'selected' : ''}>Cash collected</option></select></label>
          <label>Draw during ramp, months <input type="number" name="drawMonths" value="${plan.drawMonths}" min="0" max="9" /></label>
          <label>Draw % of target variable <input type="number" name="drawPct" value="${Math.round(plan.drawPct * 100)}" min="0" max="100" /></label>
          <label><span>Draw is recoverable</span> <input type="checkbox" name="drawRecoverable" ${plan.drawRecoverable ? 'checked' : ''} /></label>
          ${seller || key === 'am' ? html`<label>Discount authority % <input type="number" name="discountAuthority" value="${Math.round(plan.discountAuthority * 100)}" min="0" max="50" /></label>` : ''}
          ${seller ? html`<label>Founder-sourced leads <select name="founderCredit">${[['full', 'Full credit'], ['reduced', 'Half credit'], ['none', 'No credit']].map(([v, l]) => html`<option value="${v}" ${plan.founderCredit === v ? 'selected' : ''}>${l}</option>`)}</select></label>` : ''}
          <label>SPIFF per closed deal / meeting, $ <input type="number" name="spiffPerUnit" value="${plan.spiffPerUnit || ''}" min="0" step="1" placeholder="none" /></label>
          <label>SPIFF runs for, days <input type="number" name="spiffDays" value="${plan.spiffUntilDay != null ? Math.max(0, plan.spiffUntilDay - s.day) : ''}" min="0" max="365" placeholder="no end" /></label>
        </div></details>
      <div class="inline" style="margin-top:6px"><button class="primary">Save plan (1h)</button>
        <button type="button" class="sm" data-apply-template="${key}">Apply template (0.5h)</button>
        <span class="small muted">${onPlan.length ? 'Changing a live plan outside the first two weeks of a quarter costs morale and raises attrition.' : 'Nobody is on this plan yet: design it freely.'}</span></div>
    </form>
    <div class="stats" style="margin-top:8px">
      ${stat('Base / target variable', `${money(baseOf(plan))} / ${money(tv)}`, `OTE ${money(plan.ote)} at ${Math.round(plan.basePct * 100)}:${Math.round((1 - plan.basePct) * 100)}`)}
      ${stat('Commission rate', key === 'csm' ? 'attainment-based' : `${(rateOf(plan) * 100).toFixed(2)}%`, plan.rate ? 'your override' : 'auto: variable / quota')}
      ${stat('Pays at 50 / 100 / 150%', curve.slice(0, 3).map(([, v]) => money(v)).join(' / '), plan.cap ? `capped at ${money(tv * plan.cap)}` : 'uncapped')}
      ${stat('Plan complexity', x.toFixed(1), x >= 8 ? 'too many moving parts' : 'fits on one page', x >= 8 ? 'bad' : '')}
      ${stat('OTE vs market', ote == null ? '—' : pct(ote, 0), `market ${money(marketOte(key))} (${tagFor(key)})`, ote != null && ote < OTE_MARKET.underpaid ? 'bad' : '')}
    </div>
    <p class="hint">${r.src}. Expected variable pay on this plan: ${money(expectedVariable(plan))}/yr per rep. Pay for ${unit(key, plan.metric)}; quota ${fmtQuota(key, plan)}.</p>
  </section>`;
}

export function compView(s, p) {
  const comp = ensureComp(s);
  const cov = coverageReport(s);
  const payouts = comp.payouts.slice(0, 12);
  return html`
    <div class="callout">A comp plan decides what your reps do. Reps respond to what is paid, not to what you meant: an SDR paid per meeting books meetings, an AE with no clawback signs customers who leave, a capped top performer holds deals for next quarter. Variable pay is computed at each period end from what each rep produced and paid through payroll as commission. Benchmarks: Bridge Group SDR 2025 is sourced; most AE, AM, CSM and SE numbers are vendor figures or <b>game assumptions</b> (see each card).</div>
    <div class="stats">
      ${stat('Reps on plans', p.members.filter((m) => m.kind !== 'ai_agent' && m.status === 'active' && planKeyOf(m)).length, `${comp.changes.filter((c) => s.day - c.day <= 365).length} plan change(s) in the last year`)}
      ${stat('Commission paid', money(comp.stats.paidUsd), `${comp.stats.clawbacks} clawback(s): ${money(comp.stats.clawedUsd)}`)}
      ${stat('Cap hit', comp.stats.capHits, `${comp.stats.sandbagged} deal(s) held for the next period`, comp.stats.sandbagged ? 'bad' : '')}
      ${stat('CSM coverage', `${Math.round(cov.coverage * 100)}%`, `${cov.csms} CSM · ${cov.ams} AM · ${cov.ses} SE`, cov.overloaded ? 'bad' : '')}
    </div>
    ${COMP_ROLE_KEYS.map((k) => planCard(s, p, k))}
    <section class="panel"><h2>Recent payouts</h2>
      ${table({
        columns: [
          { label: 'Date', render: (r) => fmtDate(s, r.day) },
          { label: 'Rep', render: (r) => html`${r.name} <span class="small muted">${label(r.role)}</span>` },
          { label: 'Period', render: (r) => r.period },
          { label: 'Attainment', align: 'right', render: (r) => `${Math.round(r.attainment * 100)}%${r.accelerated ? ' ▲' : ''}${r.decelerated ? ' ▼' : ''}${r.capped ? ' (capped)' : ''}` },
          { label: 'Earned', align: 'right', render: (r) => money(r.earned) },
          { label: 'Draw / clawback', align: 'right', render: (r) => `${r.draw ? '+' + money(r.draw) : '—'} / ${r.clawback ? '-' + money(r.clawback) : '—'}` },
          { label: 'Paid', align: 'right', render: (r) => money(r.paid) },
        ],
        rows: payouts, empty: 'No payouts yet. Commission is settled at the end of each plan period and paid with the next payroll run (bank category payroll, line COMMISSIONS).',
      })}</section>
    <section class="panel"><h2>Account coverage (CSM / AM)</h2>
      <p class="small">Accounts per CSM at full effect: ~110 SMB, ~35 mid-market, ~10 enterprise (one 2025-dated source [unverified]; game default). An overloaded CSM loses effect; accounts with no owner churn more at renewal.</p>
      ${table({
        columns: [{ label: 'Band', render: (r) => r[0] }, { label: 'Accounts', align: 'right', render: (r) => r[1].accounts }, { label: 'With a CSM', align: 'right', render: (r) => r[1].covered }],
        rows: Object.entries(cov.bands).map(([b, v]) => [{ smb: 'SMB (<$10k)', mid: 'Mid-market ($10-50k)', ent: 'Enterprise ($50k+)' }[b], v]), empty: '',
      })}
      <p class="hint">Load ${cov.load} account-weights against ${cov.capacity} CSM capacity.</p></section>`;
}

export function bindComp(root, ctx) {
  const p = ensurePeople(ctx.state);
  const read = (form) => {
    const f = formData(form);
    return {
      ote: f.ote, basePct: (f.basePct ?? 50) / 100, metric: f.metric, quota: f.quota, rate: f.rate || null,
      accelAt: (f.accelAt ?? 100) / 100, accelMult: f.accelMult, cap: f.cap ? f.cap / 100 : null, decelBelow: (f.decelBelow ?? 0) / 100, decelMult: f.decelMult,
      period: f.period, clawbackDays: f.clawbackDays, clawbackPct: (f.clawbackPct ?? 100) / 100, payTiming: f.payTiming, drawMonths: f.drawMonths, drawPct: (f.drawPct ?? 75) / 100,
      drawRecoverable: Boolean(f.drawRecoverable), spiffUntilDay: f.spiffDays != null ? ctx.state.day + f.spiffDays : null, ...(f.discountAuthority != null ? { discountAuthority: f.discountAuthority / 100 } : {}), ...(f.founderCredit ? { founderCredit: f.founderCredit } : {}), spiffPerUnit: f.spiffPerUnit || 0,
    };
  };
  on(root, 'change', '[data-metric]', (e, el) => {
    const key = el.dataset.metric;
    const q = el.form.elements.quota;
    if (q) q.value = COMP_ROLES[key].quotas[el.value];
  });
  on(root, 'submit', '.compForm', (e) => {
    e.preventDefault();
    const key = e.target.dataset.role;
    const patch = read(e.target);
    ctx.act((st) => {
      const res = setPlan(st, key, patch);
      ctx.toast(res.penalties.length ? 'Plan saved. Your team noticed the mid-period change.' : 'Plan saved. It applies from the next period end.', res.penalties.length ? 'warn' : 'good');
    }, { hours: 1, label: `Comp plan: ${label(key)}` });
  });
  on(root, 'click', '[data-apply-template]', (e, el) => {
    const key = el.dataset.applyTemplate;
    const form = root.querySelector(`.compForm[data-role="${key}"]`);
    const id = form.elements.template.value;
    ctx.act((st) => { setPlan(st, key, {}, { templateId: id }); ctx.toast(`${PLAN_TEMPLATES[id].label} applied.`, 'good'); }, { hours: 0.5, label: `Comp template: ${label(key)}` });
  });
  void p;
}
