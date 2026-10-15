// Automations: a Zapier / Make / n8n-style builder. Pick a plan (real prices, task/credit/execution limits),
// build trigger → filter → actions flows on real game events, test with sample data, watch the run history,
// and keep them alive (expired connections, API changes, duplicates, runaway usage). Automations only save the
// founder hours other apps actually charge (Calls notes, CRM triage, invoice reminders, the weekly metrics
// review, onboarding how-to tickets); sloppy ones cost complaints, lost notes, missed leads and money.
// Engine: automations/engine.js. Catalog, prices and sources: automations/model.js.

import { html, mount, on, stat, badge, toast } from '../core/ui.js';
import { fmtDate, money } from '../core/util.js';
import {
  ensureAutomations, platformOf, choosePlatform, createAutomation, updateAutomation, deleteAutomation, setStatus,
  testAutomation, fixFindings, reconnect, repairAutomation, restartSelfHosted, replayHeld, templateSpec, automationsDay,
  summary, coaching, appsOf, aiStepJob, platformHours, reconnectHours, repairHours, fixHours, restartHours, updateHours, classifyRecord,
} from './automations/engine.js';
import { PLATFORMS, TRIGGERS, ACTIONS, FAMILIES, ACTION_PARAMS, AI_MODES, EMAIL_KINDS, TEMPLATES, DEFAULT_COPY, CAPABILITIES, SAVES, APPS, capabilitiesOf, emailCopyScore, setupHours, testHours } from './automations/model.js';
import { bizBlock } from './context.js';

const ID = 'automations';
let draft = null; // { key, spec } builder state survives re-renders
const testOut = {}; // autoId -> { text, mock }
const ui = { runStatus: 'all', runAuto: '' };

const TONE = { success: 'good', error: 'bad', skipped: '', held: 'warn' };
const statusBadge = (a) => (a.errSince != null ? badge('failing', 'bad') : a.status === 'on' ? badge('on', 'good') : badge('off', ''));

function tabsNav(view) {
  const t = [['', 'Automations'], ['templates', 'Templates'], ['runs', 'Run history'], ['plan', 'Plan & connections']];
  return html`<nav class="tabs">${t.map(([k, l]) => html`<a href="#/${ID}${k ? `/${k}` : ''}" class="${view === k ? 'active' : ''}">${l}</a>`)}<a href="#/${ID}/new" class="${view === 'new' ? 'active' : ''}">+ New</a></nav>`;
}

function usageMeter(s, A, p) {
  if (!p) return html`<p class="small muted">No plan yet.</p>`;
  const lim = Number.isFinite(p.limit) ? p.limit : null;
  const pctUsed = lim ? Math.min(100, Math.round((A.usage.units / lim) * 100)) : 0;
  return html`<div class="small"><b>${A.usage.units.toLocaleString()}</b> ${lim ? html`of ${lim.toLocaleString()}` : ''} ${p.unit} in ${A.usage.month ?? 'this month'}${A.usage.overage ? html` · <span class="neg">${A.usage.overage.toLocaleString()} over</span>` : ''}</div>
    ${lim ? html`<div class="meter" style="margin:6px 0"><div style="width:${pctUsed}%;${pctUsed >= 90 ? 'background:var(--bad)' : ''}"></div></div>` : html`<p class="small muted">Self-hosted: unlimited executions.</p>`}`;
}

function overview(s, A) {
  const p = platformOf(s);
  const sum = summary(s);
  const notes = coaching(s);
  const inc30 = A.incidents.filter((x) => x.day > s.day - 30);
  const rows = A.automations;
  return html`
    ${!p ? html`<div class="callout warn"><b>Pick a plan first.</b> <a href="#/${ID}/plan">Zapier, Make or n8n</a>: prices and limits are real. Start on a free tier; most solo founders need 2,000 tasks or less.</div>` : ''}
    <div class="stats">
      ${stat('Hours saved', `${sum.hoursSaved.toFixed(1)} h`, `net ${sum.netHours >= 0 ? '+' : ''}${sum.netHours.toFixed(1)} h after build, review & fixes`, sum.netHours > 0 ? 'good' : sum.netHours < -1 ? 'bad' : '')}
      ${stat('Runs this month', A.usage.units.toLocaleString(), p ? `${p.unit}${Number.isFinite(p.limit) ? ` of ${p.limit.toLocaleString()}` : ''}` : 'no plan', p && Number.isFinite(p.limit) && A.usage.units > p.limit * 0.9 ? 'warn' : '')}
      ${stat('Failing', A.automations.filter((a) => a.errSince != null).length, `${sum.runs.error} errors all time`, A.automations.some((a) => a.errSince != null) ? 'bad' : '')}
      ${stat('Incidents (30d)', inc30.length, `${inc30.filter((x) => x.kind === 'complaint').length} complaints · ${inc30.filter((x) => x.kind === 'cancel').length} cancels`, inc30.length ? 'warn' : '')}
      ${stat('Spend', money(sum.costUsd), `${p ? `${p.vendor} ${money(p.price)}/mo` : ''}${sum.overageUsd ? ` · ${money(sum.overageUsd)} overage` : ''}`)}
    </div>
    ${notes.length ? html`<section class="panel"><h2>Coaching</h2>${notes.slice(0, 8).map((n) => html`<div class="callout ${n.tone}">${n.text}${n.autoId ? html` <a href="#/${ID}/edit:${n.autoId}">Open</a>` : ''}</div>`)}</section>` : ''}
    <section class="panel"><h2>Your automations</h2>
      ${rows.length ? html`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th class="r">OK</th><th class="r">Err</th><th class="r">Skip/held</th><th class="r">${p?.unit ?? 'units'}</th><th>Saves</th><th></th></tr></thead><tbody>
        ${rows.map((a) => { const caps = capabilitiesOf(a).filter((c) => c !== 'support_triage'); return html`<tr>
          <td><a href="#/${ID}/edit:${a.id}"><b>${a.name}</b></a><div class="small muted">${TRIGGERS[a.trigger]?.label} → ${a.actions.map((x) => ACTIONS[x.type]?.label.split(':')[0]).join(' → ')}</div>${!a.tested ? html`<div class="small warn">untested</div>` : ''}</td>
          <td>${statusBadge(a)}</td><td class="r">${a.stats.success}</td><td class="r ${a.stats.error ? 'neg' : ''}">${a.stats.error}</td><td class="r">${a.stats.skipped + a.stats.held}</td><td class="r">${A.usage.byAuto[a.id] ?? 0}</td>
          <td class="small">${caps.length ? caps.map((c) => CAPABILITIES[c].label).join(', ') : html`<span class="muted">nothing measurable</span>`}</td>
          <td><button class="sm" data-toggle="${a.id}">${a.status === 'on' ? 'Turn off' : 'Turn on'}</button> <a class="btn sm" href="#/${ID}/runs:${a.id}">History</a></td></tr>`; })}
      </tbody></table></div>` : html`<p class="empty">No automations yet. Start from a <a href="#/${ID}/templates">template</a>.</p>`}
      <p class="small muted">Measured savings by work: ${Object.keys(sum.savedByCap).length ? Object.entries(sum.savedByCap).map(([k, v]) => `${CAPABILITIES[k]?.label ?? k} ${v.toFixed(1)}h`).join(' · ') : 'none yet'}. Spent: build ${sum.setupHours.toFixed(1)}h · tests ${sum.testHours.toFixed(1)}h · AI review ${sum.reviewHours.toFixed(1)}h · fixes & cleanup ${sum.debugHours.toFixed(1)}h · monitoring ${sum.monitorHours.toFixed(1)}h.</p>
    </section>
    ${A.incidents.length ? html`<section class="panel"><h2>Incidents</h2><ul class="list small">${A.incidents.slice(0, 12).map((x) => html`<li>${fmtDate(s, x.day)} ${badge(x.kind.replace(/_/g, ' '), ['complaint', 'cancel', 'missed_lead', 'lost_note', 'runaway'].includes(x.kind) ? 'bad' : 'warn')} ${x.text}</li>`)}</ul></section>` : ''}
    <section class="panel"><h2>What a stellar operator does</h2><ul class="small">
      <li>Automates high-frequency, rule-based work you are actually paying hours for. A Zap that posts to Slack nobody reads is sprawl.</li>
      <li>Filters every trigger (first failed attempt only, business emails only, skip test sign-ups) and adds a dedupe key.</li>
      <li>Tests with sample data before turning it on, and turns on failure alerts or reviews the run history weekly.</li>
      <li>Keeps a human reviewing AI output that reaches customers or the CRM; lets AI run unreviewed only on internal, low-cost steps.</li>
      <li>Fixes a broken connection in days, not weeks, and backfills what it missed.</li></ul></section>`;
}

function templatesView(s, A) {
  const p = platformOf(s);
  return html`<p class="small muted">From the most common founder automations (research d01 Part 4, d04, d08, d09). Templates still need mapping, a filter check and a test; they take ~30% less time to build.</p>
    <div class="grid-2">${TEMPLATES.map((t) => {
      const spec = templateSpec(t.id);
      const caps = capabilitiesOf(spec).filter((c) => c !== 'support_triage');
      return html`<section class="panel"><h3 style="margin-top:0">${t.name}</h3>
        <p class="small">${TRIGGERS[t.trigger].label}${t.filter ? html` · <i>only if ${TRIGGERS[t.trigger].filters[t.filter].label.toLowerCase()}</i>` : ''} → ${t.actions.map((x) => ACTIONS[x.type].label).join(' → ')}</p>
        <p class="small muted">${t.why} <span class="muted">(${t.source})</span></p>
        <p class="small"><b>Saves:</b> ${caps.length ? caps.map((c) => SAVES[c]).join(' ') : 'Nothing measurable in your week: visibility only.'}</p>
        <div class="inline"><a class="btn sm primary" href="#/${ID}/new:${t.id}">Use template</a><span class="small muted">~${setupHours(spec, A.platform ?? 'zapier_pro', { template: true })} h to build${p ? '' : ' (pick a plan first)'}</span></div></section>`;
    })}</div>`;
}

function initDraft(s, A, param) {
  const key = param || 'new';
  if (draft?.key === key) return draft;
  if (param.startsWith('edit:')) {
    const a = A.automations.find((x) => x.id === param.slice(5));
    if (!a) return null;
    draft = { key, spec: JSON.parse(JSON.stringify({ name: a.name, trigger: a.trigger, filter: a.filter, actions: a.actions, dedupe: a.dedupe, alerts: a.alerts, retry: a.retry })), autoId: a.id };
  } else if (param.startsWith('new:')) {
    const spec = templateSpec(param.slice(4));
    if (!spec) return null;
    draft = { key, spec, template: true };
  } else draft = { key, spec: { name: '', trigger: 'stripe_subscription', filter: null, actions: [{ type: 'slack_post' }], dedupe: false, alerts: false, retry: false } };
  return draft;
}

function readBuilder(root) {
  const f = root.querySelector('#builder');
  if (!f || !draft) return;
  const g = (n) => f.elements[n];
  const sp = draft.spec;
  sp.name = g('name')?.value ?? sp.name;
  const trig = g('trigger')?.value;
  if (trig && trig !== sp.trigger) { sp.trigger = trig; sp.filter = null; } else sp.filter = g('filter')?.value || null;
  sp.dedupe = Boolean(g('dedupe')?.checked); sp.alerts = Boolean(g('alerts')?.checked); sp.retry = Boolean(g('retry')?.checked);
  sp.actions = sp.actions.map((a, i) => {
    const type = g(`type${i}`)?.value ?? a.type;
    const out = { type };
    if (type === 'ai_step') { out.mode = g(`mode${i}`)?.value ?? a.mode ?? 'summarize'; out.review = Boolean(g(`review${i}`)?.checked); }
    if (ACTIONS[type]?.ext) {
      out.review = Boolean(g(`review${i}`)?.checked);
      const keep = type === a.type ? a.params ?? {} : {};
      out.params = {};
      for (const [k] of ACTION_PARAMS[type] ?? []) { const v = g(`p${i}_${k}`)?.value; if (v != null) out.params[k] = v; else if (keep[k] != null) out.params[k] = keep[k]; }
    }
    if (type === 'email_customer') { out.kind = g(`kind${i}`)?.value ?? a.kind ?? 'onboarding'; out.copy = g(`copy${i}`)?.value ?? a.copy ?? DEFAULT_COPY[out.kind]; if (out.kind !== a.kind && a.type === 'email_customer' && a.copy === DEFAULT_COPY[a.kind]) out.copy = DEFAULT_COPY[out.kind]; }
    return out;
  });
}

function builderView(s, A, param) {
  const d = initDraft(s, A, param);
  if (!d) return html`<p class="empty">Automation not found. <a href="#/${ID}">Back</a></p>`;
  const sp = d.spec;
  const auto = d.autoId ? A.automations.find((x) => x.id === d.autoId) : null;
  const T = TRIGGERS[sp.trigger];
  const p = platformOf(s);
  const hours = auto ? null : setupHours(sp, A.platform ?? 'zapier_pro', { template: d.template });
  const caps = capabilitiesOf(sp).filter((c) => c !== 'support_triage');
  const to = auto ? testOut[auto.id] : null;
  const recent = auto ? A.runs.filter((r) => r.autoId === auto.id).slice(0, 8) : [];
  return html`<form id="builder" class="panel" onsubmit="return false">
      <h2>${auto ? 'Edit automation' : 'New automation'} ${auto ? statusBadge(auto) : ''}</h2>
      <label>Name <input name="name" value="${sp.name}" placeholder="e.g. Failed payment → Slack + personal note" /></label>
      <h3>1 · Trigger</h3>
      <select name="trigger">${Object.entries(FAMILIES).map(([fam, fl]) => html`<optgroup label="${fl}">${Object.entries(TRIGGERS).filter(([, t]) => (t.family ?? 'core') === fam).map(([k, t]) => html`<option value="${k}" ${k === sp.trigger ? 'selected' : ''}>${t.label}</option>`)}</optgroup>`)}</select>
      <p class="small muted">Fires ${T.freq}. App: ${APPS[T.app].label}.</p>
      <h3>2 · Filter (only continue if…)</h3>
      <select name="filter"><option value="">No filter: run on everything</option>${Object.entries(T.filters).map(([k, f]) => html`<option value="${k}" ${k === sp.filter ? 'selected' : ''}>${f.label}</option>`)}</select>
      <h3>3 · Actions</h3>
      ${sp.actions.map((a, i) => { const g = a.type === 'email_customer' ? emailCopyScore(a.copy, a.kind) : null; return html`<div class="card" style="margin-bottom:8px">
        <div class="inline"><b>Step ${i + 2}</b><select name="type${i}">${Object.entries(FAMILIES).map(([fam, fl]) => html`<optgroup label="${fl}">${Object.entries(ACTIONS).filter(([, x]) => (x.family ?? 'core') === fam || (!x.ext && fam === 'core')).map(([k, x]) => html`<option value="${k}" ${k === a.type ? 'selected' : ''}>${x.label}</option>`)}</optgroup>`)}</select><button class="sm danger" data-rm="${i}" type="button">Remove</button></div>
        ${a.type === 'ai_step' ? html`<div class="inline"><select name="mode${i}">${Object.entries(AI_MODES).map(([k, l]) => html`<option value="${k}" ${k === a.mode ? 'selected' : ''}>${l}</option>`)}</select><label><input type="checkbox" name="review${i}" ${a.review ? 'checked' : ''} /> Human review before it goes out (~2.5 min per run)</label></div>` : ''}
        ${ACTIONS[a.type]?.ext ? html`<div>${(ACTION_PARAMS[a.type] ?? []).map(([k, l, big]) => html`<label>${l} ${big ? html`<textarea name="p${i}_${k}" rows="4">${a.params?.[k] ?? ''}</textarea>` : html`<input name="p${i}_${k}" value="${a.params?.[k] ?? ''}" />`}</label>`)}
          ${ACTIONS[a.type].customer ? html`<label><input type="checkbox" name="review${i}" ${a.review ? 'checked' : ''} /> Human approval step before it reaches the customer (~2.5 min a run). Without it this runs unreviewed.</label>` : ''}</div>` : ''}
        ${a.type === 'email_customer' ? html`<label>Email <select name="kind${i}">${Object.entries(EMAIL_KINDS).map(([k, l]) => html`<option value="${k}" ${k === a.kind ? 'selected' : ''}>${l}</option>`)}</select></label>
          <label>Body (merge tags like {{first_name}}; {{ai_draft}} uses the AI step's draft)<textarea name="copy${i}" rows="6">${a.copy}</textarea></label>
          <p class="small ${g.score >= 0.7 ? '' : 'warn'}">Copy score ${Math.round(g.score * 100)}/100. ${g.feedback.join(' ')}</p>` : ''}
      </div>`; })}
      <div class="inline"><button type="button" class="sm" id="addStep">+ Add action</button></div>
      <h3>Settings</h3>
      <label><input type="checkbox" name="dedupe" ${sp.dedupe ? 'checked' : ''} /> Dedupe: skip events already processed (storage key; free)</label>
      <label><input type="checkbox" name="alerts" ${sp.alerts ? 'checked' : ''} /> Alert me the first time it fails</label>
      <label><input type="checkbox" name="retry" ${sp.retry ? 'checked' : ''} /> On rate limits, retry tomorrow instead of failing</label>
      <p class="small"><b>Saves:</b> ${caps.length ? caps.map((c) => SAVES[c]).join(' ') : 'Nothing measurable: no app in your week charges you for this work.'}</p>
      <div class="inline" style="margin-top:8px">
        <button type="button" class="primary" id="save" ${p ? '' : 'disabled'}>${auto ? 'Save changes' : `Build it (${hours} h)`}</button>
        ${auto ? html`<button type="button" id="test">Test with sample data (${testHours(auto)} h)</button>
          ${auto.testFindings?.some((f) => f.fix) ? html`<button type="button" id="fix">Fix what the test found</button>` : ''}
          <button type="button" data-toggle="${auto.id}">${auto.status === 'on' ? 'Turn off' : 'Turn on'}</button>
          ${auto.drift || (auto.errSince != null && /required field/.test(A.runs.find((r) => r.autoId === auto.id && r.status === 'error')?.reason ?? '')) ? html`<button type="button" id="repair">Repair field mapping (0.5 h)</button>` : ''}
          <button type="button" class="danger" id="del">Delete</button>` : ''}
      </div>
      ${!p ? html`<p class="small warn">Pick a plan in <a href="#/${ID}/plan">Plan & connections</a> first.</p>` : ''}
    </form>
    ${auto?.testedDay != null ? html`<section class="panel"><h2>Last test · ${fmtDate(s, auto.testedDay)}</h2>
      <ul class="list small">${(auto.testSamples ?? []).map((x) => html`<li>${x.passed ? badge('runs', 'good') : badge('filtered', '')} ${x.label}${x.passed && x.wouldBlock ? html` <span class="neg">← should not run</span>` : ''}</li>`)}</ul>
      ${auto.testFindings?.length ? auto.testFindings.map((f) => html`<div class="callout ${f.fix || f.kind === 'review' || f.kind === 'auth' ? 'bad' : 'warn'} small">${f.text}</div>`) : html`<div class="callout good small">No problems found.</div>`}
      ${to ? html`<p class="small"><b>AI step output (${to.mock ? 'offline sample' : 'live'}):</b></p><pre class="small" style="white-space:pre-wrap">${to.text}</pre>` : ''}</section>` : ''}
    ${recent.length ? html`<section class="panel"><h2>Recent runs</h2>${runList(s, recent)}</section>` : ''}`;
}

function runList(s, runs) {
  return html`<ul class="list small">${runs.map((r) => html`<li>${badge(r.status, TONE[r.status])} ${fmtDate(s, r.day)} · <b>${r.label}</b> · ${r.units} unit${r.units === 1 ? '' : 's'}
    ${r.reason ? html`<div class="${r.status === 'error' ? 'neg' : 'muted'}">${r.reason}</div>` : ''}
    ${r.steps.length ? html`<div class="muted">${r.steps.join(' → ')}</div>` : ''}
    ${r.notes.length ? html`<div class="warn">${r.notes.join(' · ')}</div>` : ''}
    ${r.aiOutput ? html`<div class="muted">AI: ${r.aiOutput.slice(0, 200)}</div>` : ''}</li>`)}</ul>`;
}

function runsView(s, A, param) {
  if (param.startsWith('runs:')) ui.runAuto = param.slice(5);
  const runs = A.runs.filter((r) => (!ui.runAuto || r.autoId === ui.runAuto) && (ui.runStatus === 'all' || r.status === ui.runStatus)).slice(0, 80);
  const counts = (k) => A.runs.filter((r) => (!ui.runAuto || r.autoId === ui.runAuto) && r.status === k).length;
  return html`<section class="panel"><h2>Run history</h2>
    <div class="inline" style="margin-bottom:8px"><select id="runAuto"><option value="">All automations</option>${A.automations.map((a) => html`<option value="${a.id}" ${a.id === ui.runAuto ? 'selected' : ''}>${a.name}</option>`)}</select>
    ${['all', 'success', 'error', 'skipped', 'held'].map((k) => html`<button class="sm ${ui.runStatus === k ? 'primary' : ''}" data-rs="${k}">${k}${k !== 'all' ? ` (${counts(k)})` : ''}</button>`)}</div>
    ${runs.length ? runList(s, runs) : html`<p class="empty">No runs yet. Runs happen as the day advances, when real events happen in your company.</p>`}
    <p class="small muted">Like Zapier's Zap history: every run with its steps, errors and the units it used. Errors usually mean an expired connection or a changed field; fix the cause, then the next runs succeed (missed ones are backfilled by hand).</p></section>`;
}

function planView(s, A) {
  const p = platformOf(s);
  const used = new Set(A.automations.filter((a) => a.status === 'on').flatMap(appsOf));
  return html`<div class="grid-2"><section class="panel"><h2>Plan</h2>
      ${usageMeter(s, A, p)}
      <form id="planForm">${Object.entries(PLATFORMS).map(([k, x]) => html`<label class="radio-card"><input type="radio" name="plan" value="${k}" ${A.platform === k ? 'checked' : ''} /><b>${x.vendor} · ${x.name} · ${x.price ? `${money(x.price, { cents: true })}/mo` : 'free'}</b><span>${Number.isFinite(x.limit) ? `${x.limit.toLocaleString()} ${x.unit}/mo` : 'unlimited executions'} · counts ${x.count === 'task' ? 'each successful action step' : x.count === 'credit' ? 'every module incl. the trigger (AI = 3)' : 'one per workflow run'} · ${x.note}</span></label>`)}
      <button class="primary">Switch plan</button></form>
      <p class="small muted">Switching vendor means rebuilding and re-testing every automation. Over the limit: Zapier holds runs for replay, Make and n8n stop (Make can auto-buy extra credits).</p>
      ${p?.autoBuy ? html`<label><input type="checkbox" id="autoBuy" ${A.autoBuy ? 'checked' : ''} /> Auto-buy extra credits when I run out (+30% per credit [design])</label>` : ''}
      ${A.held.length ? html`<p><button id="replay">Replay ${A.held.length} held run${A.held.length === 1 ? '' : 's'} (6 min)</button></p>` : ''}
    </section>
    <section class="panel"><h2>Connections</h2>
      ${Object.keys(A.connections).length ? html`<ul class="list">${Object.entries(A.connections).map(([app, c]) => html`<li class="inline" style="justify-content:space-between"><span><b>${APPS[app]?.label ?? app}</b> ${c.status === 'ok' ? badge('connected', 'good') : badge(`expired ${fmtDate(s, c.expiredDay)}`, 'bad')} ${used.has(app) ? '' : html`<span class="small muted">unused</span>`}</span>${c.status !== 'ok' ? html`<button class="sm primary" data-reconnect="${app}">Reconnect (15 min + backfill)</button>` : ''}</li>`)}</ul>` : html`<p class="empty">Connections are created when you turn an automation on.</p>`}
      ${A.outage ? html`<div class="callout bad">n8n is down since ${fmtDate(s, A.outage.since)}. <button class="sm primary" id="restart">Restart & upgrade (1 h)</button></div>` : ''}
      <h3>Monitoring</h3>
      <label><input type="checkbox" id="weekly" ${A.weeklyReview ? 'checked' : ''} /> Review run history every Monday (15 min/week)</label>
      <p class="small muted">OAuth connections expire or get revoked a few times a year each [design]; apps rename fields. Without alerts or a weekly look, a broken automation fails silently: in Zapier's history the rows go red and nobody sees them.</p>
    </section></div>`;
}

export default {
  id: ID,
  title: 'Automations',
  icon: '⚡',
  group: 'Company',
  badge: (state) => {
    const A = state.apps?.[ID];
    if (!A) return null;
    const n = (A.automations ?? []).filter((a) => a.errSince != null).length + Object.values(A.connections ?? {}).filter((c) => c.status === 'expired').length;
    return n || null;
  },
  onDay: automationsDay,
  jobs: { 'automations:ai': aiStepJob },
  render(root, ctx) {
    const s = ctx.state;
    const A = ensureAutomations(s);
    const param = ctx.params ?? '';
    const view = param.startsWith('edit:') || param.startsWith('new') ? 'new' : param.startsWith('runs') ? 'runs' : param;
    if (view !== 'new') draft = null;
    mount(root, html`
      <div class="app-head"><div><h1>Automations</h1><p>Zapier, Make or n8n. Wire triggers from Stripe, your CRM, calls, the helpdesk and your signup form to actions. Automate frequent, rule-based work; filter, test, watch for failures, and keep a human on anything an AI says to customers.</p></div></div>
      ${tabsNav(view === 'new' ? 'new' : view)}
      ${view === 'templates' ? templatesView(s, A) : view === 'runs' ? runsView(s, A, param) : view === 'plan' ? planView(s, A) : view === 'new' ? builderView(s, A, param) : overview(s, A)}`);

    const act = (fn, opts) => ctx.act(fn, opts);
    on(root, 'click', '[data-toggle]', (e, el) => act((st) => { const a = ensureAutomations(st).automations.find((x) => x.id === el.dataset.toggle); setStatus(st, a, a.status !== 'on'); toast(a.status === 'on' ? `"${a.name}" is on.` : `"${a.name}" is off.`, 'info'); }, { hours: 0.02, label: 'Automations' }));
    on(root, 'click', '[data-rs]', (e, el) => { ui.runStatus = el.dataset.rs; ctx.render(); });
    on(root, 'change', '#runAuto', (e) => { ui.runAuto = e.target.value; ctx.render(); });
    on(root, 'submit', '#planForm', (e) => {
      e.preventDefault();
      const id = new FormData(e.target).get('plan');
      if (!id || id === A.platform) return;
      ctx.act((st) => { const h = choosePlatform(st, id); toast(`Switched to ${PLATFORMS[id].vendor} ${PLATFORMS[id].name} (${h} h).`, 'good'); }, { hours: platformHours(s, id), label: 'Automation platform setup' });
    });
    on(root, 'change', '#autoBuy', (e) => act((st) => { ensureAutomations(st).autoBuy = e.target.checked; }));
    on(root, 'change', '#weekly', (e) => act((st) => { ensureAutomations(st).weeklyReview = e.target.checked; }));
    on(root, 'click', '[data-reconnect]', (e, el) => { const app = el.dataset.reconnect; act((st) => { const h = reconnect(st, app); toast(`${APPS[app].label} reconnected (${h} h incl. backfill).`, 'good'); }, { hours: reconnectHours(s, app), label: 'Reconnecting automations' }); });
    on(root, 'click', '#restart', () => act((st) => { restartSelfHosted(st); }, { hours: restartHours(s), label: 'n8n restart & backfill' }));
    on(root, 'click', '#replay', () => act((st) => { const r = replayHeld(st); toast(`Replayed ${r.replayed} run(s).`, 'info'); }, { hours: 0.1, label: 'Replay held runs' }));

    if (view !== 'new' || !draft) return;
    on(root, 'change', '#builder select, #builder input[type=checkbox]', () => { readBuilder(root); ctx.render(); });
    on(root, 'input', '#builder textarea, #builder input[name=name]', () => readBuilder(root));
    on(root, 'click', '#addStep', () => { readBuilder(root); draft.spec.actions.push({ type: 'slack_post' }); ctx.render(); });
    on(root, 'click', '[data-rm]', (e, el) => { readBuilder(root); draft.spec.actions.splice(Number(el.dataset.rm), 1); ctx.render(); });
    const auto = draft.autoId ? A.automations.find((x) => x.id === draft.autoId) : null;
    on(root, 'click', '#save', () => {
      readBuilder(root);
      if (auto) { ctx.act((st) => { const a = ensureAutomations(st).automations.find((x) => x.id === auto.id); updateAutomation(st, a, draft.spec); toast(a.tested ? 'Saved.' : 'Saved. Test it again before trusting it.', 'info'); }, { hours: updateHours(s, auto, draft.spec), label: 'Editing an automation' }); return; }
      const hours = setupHours(draft.spec, A.platform, { template: draft.template });
      ctx.act((st) => { const { auto: a } = createAutomation(st, draft.spec, { template: draft.template }); draft = null; toast(`Built "${a.name}". Test it with sample data, then turn it on.`, 'good'); ctx.navigate(ID, `edit:${a.id}`); }, { hours, label: 'Building an automation' });
    });
    if (!auto) return;
    on(root, 'click', '#test', (e) => {
      e.target.disabled = true; e.target.textContent = 'Testing…';
      ctx.act(async (st) => {
        const a = ensureAutomations(st).automations.find((x) => x.id === auto.id);
        const r = testAutomation(st, a);
        const ai = a.actions.find((x) => x.type === 'ai_step');
        if (ai?.mode === 'classify') {
          const c = await classifyRecord(ctx, a.trigger, r.samples[0]?.label ?? 'sample');
          testOut[a.id] = { text: c.text, mock: c.mock };
        } else if (ai) {
          const res = await ctx.llm.ask({ task: 'automation_ai_step', context: bizBlock(ctx.state, 'insider'), system: `You are an AI step inside a no-code automation for ${st.company.name}. Do not invent facts that are not in the input.`, prompt: `Mode: ${ai.mode}. Sample record: ${r.samples[0]?.label ?? 'sample'}. ${ai.mode === 'classify' ? 'Return a category and a one-line reason.' : ai.mode === 'draft' ? 'Draft a 2–3 sentence email.' : 'Summarize in 3 bullets.'}`, schema: { type: 'object', additionalProperties: false, required: ['output'], properties: { output: { type: 'string' } } }, temperature: 0.3, maxTokens: 250, fallback: () => ({ output: `(offline) ${ai.mode} of "${r.samples[0]?.label ?? 'sample'}"` }) });
          testOut[a.id] = { text: String(res.data?.output ?? ''), mock: res.mock };
        }
        toast(r.findings.length ? `Test found ${r.findings.length} issue(s).` : 'Test passed.', r.findings.length ? 'warn' : 'good');
      }, { hours: testHours(auto), label: 'Testing an automation' });
    });
    on(root, 'click', '#fix', () => act((st) => { fixFindings(st, ensureAutomations(st).automations.find((x) => x.id === auto.id)); }, { hours: fixHours(auto), label: 'Fixing an automation' }));
    on(root, 'click', '#repair', () => act((st) => { repairAutomation(st, ensureAutomations(st).automations.find((x) => x.id === auto.id)); }, { hours: repairHours(s, auto), label: 'Repairing an automation' }));
    on(root, 'click', '#del', () => act((st) => { deleteAutomation(st, auto.id); draft = null; ctx.navigate(ID); }));
  },
};
