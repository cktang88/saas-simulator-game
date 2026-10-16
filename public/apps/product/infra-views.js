// Product → Releases: hosting platform and observability tool panels (engines: hosting.js, observability.js).

import { html, on, toast } from '../../core/ui.js';
import { money } from '../../core/util.js';
import { HOSTS, HOSTING, RENDER_SIZES, hostingSlice, effectivePlatform, hostBill, migrationHours, chooseHost, setSpendCap, resizeRender, setRegions, contributorsOf, renderSizeFor } from './hosting.js';
import { OBS, obsSlice, chooseObs, uploadSourcemaps, setDatadogControls, enableSeer, seerMonthly, SOURCEMAPS_HOURS, DD_CONTROLS_HOURS, SEER_PER_CONTRIBUTOR } from './observability.js';
import { productSlice } from './store.js';
import { releasesSlice } from './releases.js';
import { activeAccounts } from './engine.js';

const badge = (st) => (st === 'outdated' ? html`<span class="badge bad">outdated</span>` : st === 'declining' ? html`<span class="badge warn">declining</span>` : st === 'keep-alt' ? html`<span class="badge">alternative</span>` : html`<span class="badge good">default pick</span>`);

export function renderHosting(ctx) {
  const s = ctx.state;
  const h = hostingSlice(productSlice(s));
  const cur = effectivePlatform(s);
  const a = activeAccounts(s);
  const load = { accounts: a, seats: contributorsOf(s), size: h.size, regions: h.regions };
  return html`<section class="panel"><h2>Hosting</h2>
    <p class="small">${cur ? html`Production runs on <b>${HOSTS[cur].label}</b>${h.platform ? '' : ' (the default stack: no spend cap, nothing configured)'} · ${money(hostBill(cur, load).total)}/mo at ${a} accounts · ${HOSTS[cur].opsH} h/week of ops${h.opsDebt ? html` · <span class="neg">${h.opsDebt} week(s) of skipped upkeep</span>` : ''}.` : 'Production hosting is billed through AI costs → cloud provider.'}</p>
    ${cur === 'vercel' ? html`<p class="small">${h.spendCap ? html`<span class="badge good">spend cap on</span> A spike pauses the project at the cap instead of billing thousands.` : html`<span class="badge warn">no spend cap</span> <button class="sm" id="hostCap">Set Spend Management cap + alert (${HOSTING.capHours} h)</button>`}</p>` : ''}
    ${cur === 'render' ? html`<p class="small">Instance: <select id="renderSize">${Object.entries(RENDER_SIZES).map(([k, v]) => html`<option value="${k}" ${h.size === k ? 'selected' : ''}>${v.label}, $${v.usd} (to ~${v.cap} accounts)</option>`)}</select> <span class="muted">Right size for today's load: ${RENDER_SIZES[renderSizeFor(a)].label}. Resizing takes ${HOSTING.resizeHours} h.</span></p>` : ''}
    ${cur === 'fly' ? html`<p class="small">Regions: <select id="flyRegions">${[1, 2, 3, 4, 6].map((n) => html`<option value="${n}" ${h.regions === n ? 'selected' : ''}>${n}</option>`)}</select> <span class="muted">Each extra region adds machines, ${HOSTING.regionOpsH} h/week and replica-consistency risk.</span></p>` : ''}
    ${Object.entries(HOSTS).map(([k, p]) => {
      const b = hostBill(k, load);
      const hrs = migrationHours(s, k);
      return html`<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)"><div><b class="small">${p.label}</b> ${badge(p.status)} <span class="small muted">${p.shape} · ${p.fit}</span>
        <div class="small">${p.outdated ? p.outdated.note : p.paradigm}</div>
        ${p.outdated ? '' : html`<div class="small muted">Easy: ${p.easy} Hard: ${p.hard} Trap: ${p.trap} ${p.price}. At your load ~${money(b.total)}/mo${b.cloud ? ` (${money(b.cloud)} of it AWS, credit-eligible)` : ''}, ${p.opsH} h/week ops.</div>`}</div>
        ${cur === k && h.platform ? html`<span class="badge good">current</span>` : p.outdated ? '' : html`<button class="sm" data-host="${k}">${cur ? `Move (${hrs} h)` : `Set up (${p.setupH} h)`}</button>`}</div>`;
    })}
    <p class="small muted">Moving costs the target's setup plus re-doing deploys, env vars, DNS and workers on the way out (grows ~${Math.round(HOSTING.lockInPerMonth * 100)}% per month on a platform), and a month of paying both. Prices are third-party 2026 summaries: check the vendor page.</p>
  </section>`;
}

export function renderObservability(ctx) {
  const s = ctx.state;
  const o = obsSlice(s);
  const rel = releasesSlice(productSlice(s));
  const n = contributorsOf(s);
  return html`<section class="panel"><h2>Observability</h2>
    ${o.vendor ? html`<p class="small">Watching production: <b>${OBS[o.vendor].label}</b> · ${money(o.lastBill)}/mo${o.lastSeer ? ` + Seer ${money(o.lastSeer)}/mo` : ''}.
      ${rel.flags.sourcemaps ? html`<span class="badge good">source maps + releases</span>` : html`<span class="badge bad">no source maps</span> <button class="sm" id="obsSrc">Upload source maps and tag releases in CI (${SOURCEMAPS_HOURS} h)</button>`}
      ${o.vendor === 'datadog' && !o.ddControls ? html`<button class="sm" id="obsDd">Set usage controls: metric limits, log exclusion (${DD_CONTROLS_HOURS} h)</button>` : ''}
      ${o.vendor === 'sentry' ? (rel.flags.seer ? html`<span class="badge good">Seer on: $${SEER_PER_CONTRIBUTOR} x ${n} contributor(s)</span>` : html`<button class="sm" id="obsSeer">Turn on Seer ($${SEER_PER_CONTRIBUTOR} x ${n} active contributor(s) = ${money(seerMonthly(s))}/mo, 0.25 h)</button>`) : ''}</p>` : html`<p class="small muted">No tool: you hear about bad releases from customers.</p>`}
    ${Object.entries(OBS).map(([k, v]) => html`<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)"><div><b class="small">${v.label}</b> ${badge(v.status)} <span class="small muted">${v.shape}</span>
      <div class="small">${v.paradigm}</div><div class="small muted">Trap: ${v.trap} ${v.price}. Setup ${v.setupH} h, ${v.opsH} h/week.${v.uptime ? ' Includes uptime paging.' : ''}${v.statusPage ? ' Includes a status page.' : ''}</div></div>
      ${o.vendor === k ? html`<span class="badge good">current</span>` : html`<button class="sm" data-obs="${k}">${o.vendor ? 'Switch' : 'Set up'} (${Math.round(v.setupH * (o.vendor ? 1.3 : 1) * 100) / 100} h)</button>`}</div>`)}
  </section>`;
}

export function wireInfra(root, ctx) {
  const act = (fn, hours, label) => ctx.act((st) => { const r = fn(st); if (!r.ok) throw new Error(r.error); return r; }, { hours, label });
  on(root, 'click', '[data-host]', (e, el) => {
    const id = el.dataset.host;
    const hours = migrationHours(ctx.state, id);
    act((st) => { const r = chooseHost(st, id); if (r.ok && r.usd) toast(`Cutover month: ${money(r.usd)} to the old platform while you move.`, 'info'); return r; }, hours, `Hosting: ${HOSTS[id].label}`);
  });
  on(root, 'click', '#hostCap', () => act((st) => setSpendCap(st, true), HOSTING.capHours, 'Hosting spend cap'));
  on(root, 'change', '#renderSize', (e, el) => act((st) => resizeRender(st, el.value), HOSTING.resizeHours, 'Resize Render instance'));
  on(root, 'change', '#flyRegions', (e, el) => act((st) => setRegions(st, Number(el.value)), 1, 'Fly regions'));
  on(root, 'click', '[data-obs]', (e, el) => { const id = el.dataset.obs; const v = OBS[id]; act((st) => chooseObs(st, id), Math.round(v.setupH * (obsSlice(ctx.state).vendor ? 1.3 : 1) * 100) / 100, `Observability: ${v.label}`); });
  on(root, 'click', '#obsSrc', () => act((st) => uploadSourcemaps(st), SOURCEMAPS_HOURS, 'Source maps and releases'));
  on(root, 'click', '#obsDd', () => act((st) => setDatadogControls(st), DD_CONTROLS_HOURS, 'Datadog usage controls'));
  on(root, 'click', '#obsSeer', () => act((st) => enableSeer(st), 0.25, 'Sentry Seer'));
}
