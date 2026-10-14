// Insights lab views: Surveys (Sean Ellis PMF, NPS) and Experiments + feature flags (PostHog style).
import { html, on, toast, formData, table } from '../../core/ui.js';
import { pct, fmtDate, round2 } from '../../core/util.js';
import {
  ensureLab, TARGETS, SURFACES, PMF_THRESHOLD, PMF_MIN_RESPONSES, EXP_HOURS, launchSurvey, surveyCaveats, callPmf,
  requiredSample, createExperiment, concludeExperiment, winProbability, stopRuleMet, staleFlags, hypothesisQuality,
} from './lab.js';

const draft = { name: '', hypothesis: '', surface: 'onboarding', mde: 20, stopRule: 'sample', days: 28 };

export function surveysView(s, { activation }) {
  const ins = ensureLab(s);
  const all = [...ins.pmf.surveys, ...ins.nps.surveys].sort((a, b) => b.startDay - a.startDay);
  const closed = all.filter((x) => x.status === 'closed');
  const call = ins.pmf.calls[0];
  return html`<div class="grid-2">
    <section class="panel"><h2>New survey</h2>
      <form id="srvForm">
        <label>Survey <select name="kind"><option value="pmf">Sean Ellis PMF: "How would you feel if you could no longer use ${s.company.name}?"</option><option value="nps">NPS: "How likely are you to recommend us?" (0-10)</option></select></label>
        <label>Who sees it <select name="target">${Object.entries(TARGETS).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
        <button class="primary">Launch for 7 days (30 min)</button>
      </form>
      <p class="small muted">Ellis's 40% "very disappointed" line only means something for people who used the core feature (activated: now ~${pct(activation, 0)} of signups). Expect 10-30% to respond; PostHog's free tier covers 1,500 responses a month.</p>
    </section>
    <section class="panel"><h2>Results</h2>
      ${all.length ? html`<ul class="list small">${all.slice(0, 8).map((x) => html`<li><b>${x.kind === 'pmf' ? 'PMF' : 'NPS'}</b> · ${TARGETS[x.target]} · ${fmtDate(s, x.startDay)} ·
        ${x.status === 'running' ? html`<span class="badge">collecting until ${fmtDate(s, x.endDay)}</span>`
        : x.kind === 'pmf' ? html`<b>${pct(x.result.share, 0)}</b> very disappointed (95% range ${pct(x.result.ci[0], 0)}-${pct(x.result.ci[1], 0)}, n=${x.result.n}) <span class="badge ${x.result.share >= PMF_THRESHOLD ? 'good' : ''}">${x.result.share >= PMF_THRESHOLD ? 'above 40%' : 'below 40%'}</span>`
        : html`NPS <b>${x.result.nps ?? '—'}</b> (n=${x.result.n}: ${x.result.promoters} promoters, ${x.result.detractors} detractors)`}
        ${x.status === 'closed' ? surveyCaveats(x).map((c) => html`<div class="small muted">⚠ ${c}</div>`) : ''}</li>`)}</ul>` : html`<p class="empty">No surveys yet.</p>`}
      <h3>Call it</h3>
      ${closed.length ? html`<form id="pmfCall" class="inline" style="flex-wrap:wrap;gap:6px"><select name="survey">${closed.map((x) => html`<option value="${x.id}">${x.kind.toUpperCase()} ${fmtDate(s, x.startDay)} (${TARGETS[x.target]}, n=${x.result.n})</option>`)}</select>
        <button name="claim" value="yes" data-claim="yes">We have PMF</button><button data-claim="no">Not yet</button></form>
        <p class="small muted">The call is logged. If you say "we have PMF" and scale, the retention curve will tell you in 90 days whether it was real.</p>` : html`<p class="small muted">Close a survey first.</p>`}
      ${call ? html`<p class="small">Last call ${fmtDate(s, call.day)}: <b>${call.claim ? 'PMF' : 'not yet'}</b> (basis: ${call.basis.replace(/_/g, ' ')})${call.checked ? html` · checked: ${call.claim === call.truth ? html`<span class="badge good">held up</span>` : html`<span class="badge bad">contradicted by retention</span>`}` : ''}</p>` : ''}
    </section></div>`;
}

export function experimentsView(s, { traffic, baselines }) {
  const ins = ensureLab(s);
  const base = baselines[draft.surface] ?? 0.1;
  const nReq = requiredSample(base, Math.max(1, draft.mde) / 100);
  const perDay = traffic[draft.surface] ?? 0;
  const days = Math.ceil((2 * nReq) / Math.max(0.1, perDay));
  const hq = hypothesisQuality(draft.hypothesis);
  return html`<div class="grid-2">
    <section class="panel"><h2>New experiment</h2>
      <form id="expForm">
        <label>1. Name <input name="name" data-exp="name" value="${draft.name}"/></label>
        <label>Hypothesis (what you saw, what you'll change, what should move) <textarea name="hypothesis" data-exp="hypothesis" rows="3">${draft.hypothesis}</textarea></label>
        <label>2. Surface and primary metric <select name="surface" data-exp="surface">${Object.entries(SURFACES).map(([k, v]) => html`<option value="${k}" ${draft.surface === k ? 'selected' : ''}>${v.label} · ${v.metric}</option>`)}</select></label>
        <p class="small muted">Control 50% / variant 50%, a feature flag is created. Building the variant: ~${SURFACES[draft.surface].build} h.</p>
        <label>3. Minimum detectable effect (relative %) <input type="number" min="2" max="200" name="mde" data-exp="mde" value="${draft.mde}"/></label>
        <p class="small">Baseline ${pct(base, 1)} · needs <b>${nReq.toLocaleString('en-US')}</b> per variant (80% power, 5% significance) · traffic ~${round2(perDay)}/day → <b>~${days} days</b>${days > 90 ? html` <span class="badge bad">not enough traffic to detect this</span>` : ''}</p>
        <label>Stop rule <select name="stopRule" data-exp="stopRule"><option value="sample" ${draft.stopRule === 'sample' ? 'selected' : ''}>When each variant reaches the sample size</option><option value="days" ${draft.stopRule === 'days' ? 'selected' : ''}>On a fixed date</option></select></label>
        ${draft.stopRule === 'days' ? html`<label>Days <input type="number" min="7" max="120" name="days" data-exp="days" value="${draft.days}"/></label>` : ''}
        <p class="small muted">Hypothesis evidence ${Math.round(hq * 100)}/100 (cites what you observed?)</p>
        <button class="primary">Launch (${EXP_HOURS.setup + SURFACES[draft.surface].build} h)</button>
      </form>
      <p class="small muted">Most ideas don't win: ~8-20% of tests beat control (Kohavi ~8%, Optimizely ~12%). Checking daily and stopping on the first green number ships noise.</p>
    </section>
    <section class="panel"><h2>Experiments</h2>
      ${ins.experiments.length ? ins.experiments.slice(0, 10).map((e) => {
        const wp = winProbability(e);
        const lift = e.c.n && e.v.n && e.c.x ? (e.v.x / e.v.n) / (e.c.x / e.c.n) - 1 : null;
        const enough = stopRuleMet(s, e);
        return html`<div style="border-bottom:1px solid var(--border);padding:8px 0"><b>${e.name}</b> <span class="badge ${e.status === 'running' ? '' : e.decision === 'ship' ? 'good' : 'warn'}">${e.status}${e.decision ? `: ${e.decision === 'ship' ? 'variant shipped' : 'kept control'}` : ''}</span>
          <div class="small">${e.metric} · control ${e.c.x}/${e.c.n} vs variant ${e.v.x}/${e.v.n}${lift != null ? ` (${lift >= 0 ? '+' : ''}${Math.round(lift * 100)}%)` : ''} · win probability <b>${pct(wp, 0)}</b></div>
          ${e.status === 'running' && !enough ? html`<div class="small callout warn">Only ${(e.c.n + e.v.n).toLocaleString('en-US')} of ${(2 * e.nReq).toLocaleString('en-US')} planned exposures: unreliable. Stop rule: ${e.stopRule === 'days' ? `ends ${fmtDate(s, e.stopDay)}` : 'sample size'}.</div>` : ''}
          ${!e.decision ? html`<div class="inline" style="gap:6px;flex-wrap:wrap;margin-top:4px"><input placeholder="What did we learn? (losses too)" data-learn="${e.id}" style="flex:1;min-width:160px"/><button class="sm ${e.status === 'complete' ? 'primary' : ''}" data-decide="ship" data-id="${e.id}">Ship variant</button><button class="sm" data-decide="keep" data-id="${e.id}">Keep control</button></div>` : e.learning ? html`<div class="small muted">Learned: ${e.learning}</div>` : ''}
        </div>`;
      }) : html`<p class="empty">No experiments yet.</p>`}
      <h3>Feature flags</h3>
      ${table({ columns: [{ label: 'Key', render: (f) => f.key }, { label: 'Rollout', align: 'right', render: (f) => `${f.rollout}%` }, { label: 'Status', render: (f) => f.status }, { label: '', render: (f) => (!f.removed && f.status !== 'experiment' ? html`<button class="sm" data-rmflag="${f.id}">Remove flag + dead code (${EXP_HOURS.removeFlag} h)</button>` : '') }], rows: ins.featureFlags.filter((f) => !f.removed).slice(0, 12), empty: 'No flags.' })}
      ${staleFlags(s).length ? html`<p class="small callout warn">${staleFlags(s).length} flag(s) fully rolled out or off for 30+ days. Stale flags hide variant-only code paths and cost time every month.</p>` : ''}
    </section></div>`;
}

export function wireLab(root, ctx, { activation, traffic, baselines }) {
  on(root, 'submit', '#srvForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    ctx.act((st) => { const sv = launchSurvey(st, { kind: f.kind, target: f.target, activation }); if (!sv.population) toast('Nobody in that group yet: the survey will get no answers.', 'warn'); }, { hours: 0.5, label: `${f.kind.toUpperCase()} survey` });
  });
  on(root, 'click', '#pmfCall [data-claim]', (e, el) => {
    e.preventDefault();
    const id = root.querySelector('#pmfCall select').value;
    ctx.act((st) => { callPmf(st, { claim: el.dataset.claim === 'yes', surveyId: id }); }, { hours: 0.25, label: 'PMF call' });
  });
  on(root, 'input', '[data-exp]', (e, el) => { const k = el.dataset.exp; draft[k] = ['mde', 'days'].includes(k) ? Number(el.value) : el.value; });
  on(root, 'change', 'select[data-exp], input[type=number][data-exp]', () => ctx.render());
  on(root, 'submit', '#expForm', (e) => {
    e.preventDefault();
    if (!draft.name.trim() || draft.hypothesis.trim().split(/\s+/).length < 6) return toast('Name it and write the hypothesis first (what you saw, what changes, what should move).', 'warn');
    const sf = draft.surface;
    ctx.act((st) => {
      createExperiment(st, { name: draft.name, hypothesis: draft.hypothesis, surface: sf, baseline: baselines[sf] ?? 0.1, mde: Math.max(1, draft.mde) / 100, stopRule: draft.stopRule, days: draft.days, traffic: traffic[sf] ?? 0 });
      Object.assign(draft, { name: '', hypothesis: '' });
    }, { hours: EXP_HOURS.setup + SURFACES[sf].build, label: `Experiment: ${draft.name}` });
  });
  on(root, 'click', '[data-decide]', (e, el) => {
    const learning = root.querySelector(`[data-learn="${el.dataset.id}"]`)?.value ?? '';
    ctx.act((st) => {
      const ex = ensureLab(st).experiments.find((x) => x.id === el.dataset.id);
      if (!ex) return;
      concludeExperiment(st, ex, el.dataset.decide, { learning });
      if (ex.early && el.dataset.decide === 'ship') toast('Shipped before the stop rule. If the effect was noise, you just baked it in.', 'warn');
    }, { hours: EXP_HOURS.decide + (el.dataset.decide === 'ship' ? EXP_HOURS.ship : 0), label: 'Experiment decision' });
  });
  on(root, 'click', '[data-rmflag]', (e, el) => ctx.act((st) => { const f = ensureLab(st).featureFlags.find((x) => x.id === el.dataset.rmflag); if (f) f.removed = true; }, { hours: EXP_HOURS.removeFlag, label: 'Remove feature flag' }));
}
