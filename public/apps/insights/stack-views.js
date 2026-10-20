// Data stack tab (Product analytics → Data stack): vendor, tracking plan, instrumentation, CDP, BI, admin panel,
// metric definitions and the investor metric-question inbox. Model: ./stack.js.
import { html, on, formData, toast } from '../../core/ui.js';
import { money, pct, fmtDate } from '../../core/util.js';
import {
  ensureStack, ANALYTICS_VENDORS, EVENT_CATALOG, DESTINATIONS, SEGMENT, BI_TOOLS, BI_NOTES, DATA_SOURCES, DEFINITIONS, QUESTIONS,
  dataQuality, isSeriesA, raisedTotal, monthlyMtu, answerMethods, answerHours, RECONCILE_HOURS, CATCH_BUG,
  chooseVendor, setTrackingPlan, reviewPlan, setInstrumentation, setCdp, setBi, setAdminPanel, setDefinitions, answerQuestion, auditMetrics,
} from './stack.js';
import { biLoadMistake } from './stack.js';

const QBY = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
const METHOD_LABEL = { manual: 'By hand (Stripe export + SQL + sheet)', bi: 'In your BI tool', hex: 'Hex notebook', posthog_sql: 'PostHog SQL (HogQL)' };
const badge = (status) => html`<span class="badge ${status === 'active' ? 'good' : 'bad'}">${status}</span>`;

function vendorPanel(s, st) {
  const live = ['posthog', 'mixpanel', 'amplitude'];
  return html`<section class="panel"><h2>Product analytics vendor ${st.vendor ? html`<span class="small muted">now: ${ANALYTICS_VENDORS[st.vendor].name}${st.legacy ? ' (assumed for this save)' : ''}</span>` : ''}</h2>
    <div style="display:grid;gap:10px">${live.map((id) => { const v = ANALYTICS_VENDORS[id]; return html`<div style="border:1px solid var(--border);border-radius:8px;padding:8px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${v.name}</b> <span class="small muted">${v.verdict} · fits ${v.fit === 'seriesA' ? 'Series A+ with a data owner' : 'pre-seed to Series A'}</span></div>
      <div class="small">${v.paradigm}</div>
      <div class="small muted">Easy: ${v.makesEasy} Hard: ${v.makesHard}</div>
      <div class="small muted">${v.price}. Setup ${v.setupHours} h${v.taxonomyHours ? ` (+${v.taxonomyHours} h taxonomy)` : ''}, ${v.eventHours} h per event${v.governanceWeekly ? `, ${v.governanceWeekly} h/week governance` : ''}.</div>
      ${st.vendor === id && !st.legacy ? html`<span class="badge good">installed</span>` : html`<form class="inline" data-vendor="${id}">${id === 'amplitude' ? html`<label class="small"><input type="checkbox" name="taxonomy"/> with a governed taxonomy</label>` : ''}<button class="sm">${st.vendor ? 'Migrate to' : 'Install'} ${v.name}</button></form>`}
    </div>`; })}</div>
    ${['heap', 'june'].map((id) => html`<p class="small muted">${badge(ANALYTICS_VENDORS[id].status)} <b>${ANALYTICS_VENDORS[id].name}</b>: ${ANALYTICS_VENDORS[id].note}</p>`)}
  </section>`;
}

function planPanel(s, st) {
  const dq = dataQuality(s);
  return html`<section class="panel"><h2>Tracking plan & instrumentation</h2>
    ${dq ? html`<p class="small ${dq.q < 0.6 ? 'callout warn' : ''}">Data quality ${pct(dq.q, 0)}${dq.why.length ? `: ${dq.why.join('; ')}` : ''}.</p>` : st.legacy ? html`<p class="small muted">This save predates vendor choice: modeled as PostHog with a clean basic setup.</p>` : ''}
    <form id="planForm"><div class="small" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:4px">${EVENT_CATALOG.map((e) => html`<label><input type="checkbox" name="ev_${e.id}" ${st.plan.events.includes(e.id) ? 'checked' : ''}/> <code>${e.label}</code></label>`)}</div>
      <label class="small"><input type="checkbox" name="props" ${st.plan.props ? 'checked' : ''}/> Attach plan, signup source and account id as properties on every event</label>
      <button class="sm" ${st.vendor ? '' : 'disabled'}>Save tracking plan (1 h + instrumenting new events)</button>
      ${st.plan.events.length ? html` <button class="sm" type="button" id="reviewPlan">Review plan for drift (1 h)</button>` : ''}
    </form>
    ${st.vendor ? html`<form id="instForm" style="margin-top:8px">
      <label class="small"><input type="checkbox" name="identify" ${st.identify ? 'checked' : ''}/> identify() on login / alias on signup (${ANALYTICS_VENDORS[st.vendor].identifyHours} h)</label>
      <label class="small"><input type="checkbox" name="proxy" ${st.proxy ? 'checked' : ''}/> Reverse proxy for the SDK, so ad blockers do not drop events (${ANALYTICS_VENDORS[st.vendor].proxyHours} h)</label>
      <label class="small"><input type="checkbox" name="autocapture" ${st.autocapture ? 'checked' : ''}/> Autocapture clicks and pageviews</label>
      ${ANALYTICS_VENDORS[st.vendor].features.replay ? html`<label class="small">Session replay <select name="recordings">${['off', 'sampled', 'all'].map((k) => html`<option value="${k}" ${st.recordings === k ? 'selected' : ''}>${k === 'sampled' ? 'sample 10% of sessions' : k === 'all' ? 'record every session' : 'off'}</option>`)}</select></label>` : ''}
      ${ANALYTICS_VENDORS[st.vendor].caps ? html`<label class="small">Monthly billing limit ($, blank = none) <input type="number" name="cap" min="0" step="10" value="${st.cap ?? ''}"/></label>` : ''}
      <button class="sm">Save instrumentation</button></form>` : ''}
  </section>`;
}

function cdpPanel(s, st) {
  const mtu = st.bills.at(-1)?.mtu ?? monthlyMtu(s);
  return html`<section class="panel"><h2>Customer data (CDP)</h2>
    <p class="small muted">Segment (Twilio): collect once, route to many tools. ${SEGMENT.price} MTU counts anonymous visitors too: last month about ${mtu.toLocaleString('en-US')}. Without a CDP, each extra tool is wired by hand (${2} h each) and they drift apart.</p>
    <form id="cdpForm"><div class="small">${Object.entries(DESTINATIONS).map(([k, l]) => html`<label style="display:block"><input type="checkbox" name="d_${k}" ${st.destinations.includes(k) ? 'checked' : ''}/> ${l}</label>`)}</div>
      <label class="small"><input type="checkbox" name="segment" ${st.cdp ? 'checked' : ''}/> Route through Segment (${SEGMENT.setupHours} h setup + ${SEGMENT.perDestinationHours} h per destination)</label>
      <button class="sm">Save destinations</button></form>
  </section>`;
}

function biPanel(s, st) {
  const tools = ['none', 'metabase_oss', 'metabase_starter', 'hex', 'retool'];
  return html`<section class="panel"><h2>BI and internal tools <span class="small muted">${money(raisedTotal(s))} raised${isSeriesA(s) ? ' (Series A+)' : ''}</span></h2>
    <form id="biForm">
      <label>BI tool <select name="tool">${tools.map((k) => html`<option value="${k}" ${st.bi === k ? 'selected' : ''}>${BI_TOOLS[k].name}${BI_TOOLS[k].monthly ? ` · ~${money(BI_TOOLS[k].monthly)}/mo` : ''}</option>`)}</select></label>
      <label>Data source <select name="source">${Object.entries(DATA_SOURCES).map(([k, d]) => html`<option value="${k}" ${st.source === k ? 'selected' : ''}>${d.name} (${d.setupHours} h${d.monthly ? `, ~${money(d.monthly)}/mo` : ''})</option>`)}</select></label>
      <button class="sm">Connect</button></form>
    <ul class="list small">${tools.filter((k) => BI_TOOLS[k].paradigm).map((k) => html`<li><b>${BI_TOOLS[k].name}</b> (${BI_TOOLS[k].verdict}): ${BI_TOOLS[k].paradigm} ${BI_TOOLS[k].price}.</li>`)}
      ${Object.values(DATA_SOURCES).map((d) => html`<li><b>${d.name}</b>: ${d.note}</li>`)}</ul>
    ${BI_NOTES.map((n) => html`<p class="small muted">${badge(n.status)} <b>${n.name}</b>: ${n.note}</p>`)}
    <h3>Admin panel</h3>
    <p class="small muted">Support tickets that need account data: about 9 min each by hand in SQL. An admin panel (user lookup, refund, plan change) cuts that to a quarter. Now: ${st.adminPanel === 'none' ? 'none' : st.adminPanel === 'retool' ? 'Retool' : 'hand-built pages'}.</p>
    <div>${st.adminPanel !== 'retool' ? html`<button class="sm" data-admin="retool">Build it in Retool (${BI_TOOLS.retool.setupHours} h, ~${money(BI_TOOLS.retool.monthly)}/mo)</button> ` : ''}${st.adminPanel !== 'built' ? html`<button class="sm" data-admin="built">Code admin pages yourself (12 h)</button>` : ''}</div>
  </section>`;
}

function definitionsPanel(s, st) {
  return html`<section class="panel"><h2>Metric definitions</h2>
    <form id="defForm">${Object.entries(DEFINITIONS).map(([k, d]) => html`<label class="small">${d.label} <select name="${k}"><option value="">(not written)</option>${d.options.map((o) => html`<option value="${o.id}" ${st.definitions[k] === o.id ? 'selected' : ''}>${o.label}</option>`)}</select></label>`)}
      <button class="sm">Save definitions (1 h)</button></form>
    <p class="small muted">BI tools save these as shared metrics; without a BI tool they are a doc you answer from. <button class="sm" id="auditMetrics" type="button">Reconcile dashboards with Stripe and the bank (${CATCH_BUG.auditHours} h)</button></p>
  </section>`;
}

function questionsPanel(s, st) {
  const open = st.questions.filter((q) => q.status === 'open');
  const past = st.questions.filter((q) => q.status !== 'open').slice(0, 8);
  const methods = answerMethods(s);
  return html`<section class="panel"><h2>Metric questions from investors and the board</h2>
    ${open.length ? open.map((q) => html`<div class="callout ${s.day > q.dueDay ? 'bad' : 'warn'} small"><b>${q.asker}</b> (${fmtDate(s, q.day)}, due ${fmtDate(s, q.dueDay)}): "${QBY[q.qid].text}"
      <form class="inline" data-answer="${q.id}"><select name="method">${methods.map((m) => html`<option value="${m}">${METHOD_LABEL[m]} · ${answerHours(s, q, m)} h</option>`)}</select>
        <label><input type="checkbox" name="reconcile"/> reconcile with Stripe first (+${RECONCILE_HOURS} h)</label><button class="sm primary">Answer</button></form></div>`) : html`<p class="empty">No open questions. They arrive once you have investors: a few a month during a raise, about two a month with a board.</p>`}
    ${past.length ? html`<ul class="list small">${past.map((q) => html`<li>${fmtDate(s, q.day)} · ${QBY[q.qid].text} · ${q.status === 'expired' ? 'never answered' : `${METHOD_LABEL[q.method]}, ${q.hours} h${q.late ? ', late' : ''}${q.caughtBug ? `, caught: ${q.caughtBug}` : ''}${q.found ? ', later found wrong' : ''}`}</li>`)}</ul>` : ''}
  </section>`;
}

function billsPanel(s, st) {
  const rows = st.bills.slice(-6).reverse();
  return html`<section class="panel"><h2>Data stack bills</h2>
    ${rows.length ? html`<ul class="list small">${rows.map((b) => html`<li>${b.month}: analytics ${money(b.analytics)}${b.capped ? ' (limit hit, data dropped)' : ''} · Segment ${money(b.segment)} · BI/data ${money(b.bi)} · ${b.events.toLocaleString('en-US')} events, ${b.recordings.toLocaleString('en-US')} recordings, ${b.mtu.toLocaleString('en-US')} MTU</li>`)}</ul>` : html`<p class="empty">First bill at month end.</p>`}
    ${st.log.length ? html`<h3>Log</h3><ul class="list small">${st.log.slice(0, 8).map((l) => html`<li>${fmtDate(s, l.day)}: ${l.text}</li>`)}</ul>` : ''}
  </section>`;
}

export function stackView(s) {
  const st = ensureStack(s);
  return html`<div class="grid-2">${vendorPanel(s, st)}${planPanel(s, st)}</div>
    <div class="grid-2">${questionsPanel(s, st)}${definitionsPanel(s, st)}</div>
    <div class="grid-2">${biPanel(s, st)}${cdpPanel(s, st)}</div>
    ${billsPanel(s, st)}`;
}

// Hours are quoted on a copy of the state (actions are pure on state), then charged through ctx.act.
const quote = (s, fn) => { try { return fn(structuredClone(s))?.hours ?? 0; } catch { return 0; } };
let raiseIncident = null; // set by wireStack (insights.js owns incidents)
function run(ctx, fn, label) {
  const hours = quote(ctx.state, fn);
  ctx.act((st) => {
    const r = fn(st);
    if (!r?.ok) throw new Error(r?.msg || 'Nothing changed.');
    if (r.incident) { const cause = 'A heavy BI query on the production database slowed the app'; raiseIncident?.(st, cause); biLoadMistake(st, cause); }
    toast(r.msg, r.found || r.caught ? 'good' : 'info');
  }, { hours, label });
}

export function wireStack(root, ctx, { onIncident = null } = {}) {
  raiseIncident = onIncident;
  on(root, 'submit', '[data-vendor]', (e, el) => { e.preventDefault(); const f = formData(el); run(ctx, (st) => chooseVendor(st, el.dataset.vendor, { taxonomy: !!f.taxonomy }), `Install ${ANALYTICS_VENDORS[el.dataset.vendor].name}`); });
  on(root, 'submit', '#planForm', (e) => { e.preventDefault(); const f = formData(e.target); run(ctx, (st) => setTrackingPlan(st, { events: EVENT_CATALOG.filter((x) => f[`ev_${x.id}`]).map((x) => x.id), props: !!f.props }), 'Tracking plan'); });
  on(root, 'click', '#reviewPlan', () => run(ctx, (st) => reviewPlan(st), 'Tracking plan review'));
  on(root, 'submit', '#instForm', (e) => { e.preventDefault(); const f = formData(e.target); run(ctx, (st) => setInstrumentation(st, { identify: !!f.identify, proxy: !!f.proxy, autocapture: !!f.autocapture, recordings: f.recordings, cap: f.cap }), 'Analytics instrumentation'); });
  on(root, 'submit', '#cdpForm', (e) => { e.preventDefault(); const f = formData(e.target); run(ctx, (st) => setCdp(st, { segment: !!f.segment, destinations: Object.keys(DESTINATIONS).filter((k) => f[`d_${k}`]) }), 'Analytics destinations'); });
  on(root, 'submit', '#biForm', (e) => { e.preventDefault(); const f = formData(e.target); run(ctx, (st) => setBi(st, { tool: f.tool, source: f.source }), 'BI setup'); });
  on(root, 'click', '[data-admin]', (e, el) => run(ctx, (st) => setAdminPanel(st, el.dataset.admin), 'Admin panel'));
  on(root, 'submit', '#defForm', (e) => { e.preventDefault(); const f = formData(e.target); run(ctx, (st) => setDefinitions(st, Object.fromEntries(Object.entries(f).filter(([, v]) => v))), 'Metric definitions'); });
  on(root, 'click', '#auditMetrics', () => run(ctx, (st) => auditMetrics(st), 'Metrics audit'));
  on(root, 'submit', '[data-answer]', (e, el) => { e.preventDefault(); const f = formData(el); run(ctx, (st) => answerQuestion(st, el.dataset.answer, { method: f.method, reconcile: !!f.reconcile }), 'Investor metric question'); });
}
