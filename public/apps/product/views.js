// Product UI for the AI-coding workflow, the app-builder path, Releases, Issues (Linear-style triage and
// cycles) and Decisions. Rendered by product.js; handlers wired in wireExtras().

import { html, on, toast } from '../../core/ui.js';
import { money, pct, fmtDate, round2, rng } from '../../core/util.js';
import { readOperator } from '../../core/operator.js';
import { productSlice } from './store.js';
import { PLANS, CHOICES, coachingFor, measuredSpeed, reworkShare, changeFailureRate, securityBugChance } from './agent.js';
import { BUILDERS, BUILDER, builderSlice, scan, seniorReview, leakHazardMonthly } from './builder.js';
import { RELEASE_SETUP, TRIAGE_HOURS, releasesSlice, rollback, resolveWithFix, ignoreError, triageErrors, releaseStats, fmtMinutes } from './releases.js';
import { triageQueue, triageAccept, triageDecline, triageDuplicate, cycleSummary, issueKey, TRIAGE_MIN_PER_ISSUE } from './tracker.js';
import { CHECK_HOURS, DECISION_HOURS, hitRate } from './decisions.js';
import { activePlan, choosePlan, cancelPlan, chooseBuilder, migrateFromBuilder, decideFeature, declineSpec, builderActive, activeAccounts, aiMultiplier } from './engine.js';
import { productMistake } from './operator.js';
import { addRecurring, post } from '../../core/bank.js';
import { newFeature } from './store.js';

const sel = (id, opts, cur) => html`<select data-wf="${id}">${Object.entries(opts).map(([k, v]) => html`<option value="${k}" ${cur === k ? 'selected' : ''}>${v}</option>`)}</select>`;
const meter = (v, tone = '') => html`<div class="meter"><div style="width:${Math.max(0, Math.min(100, v * 100))}%;${tone ? `background:var(${tone})` : ''}"></div></div>`;

// ---------------------------------------------------------------------------
// Build tab additions: plan/usage, workflow, feels-faster meter, session reports
// ---------------------------------------------------------------------------

export function renderWorkflow(ctx, slice) {
  const s = ctx.state;
  if (builderActive(slice)) return renderBuilder(ctx, slice);
  const a = slice.agent;
  const w = a.workflow;
  const planId = activePlan(s);
  const plan = PLANS[planId];
  const sessions = a.sessions;
  const m = measuredSpeed(sessions, { day: s.day });
  const recent = sessions.filter((x) => x.day > s.day - 28);
  const perceived = recent.length ? round2(recent.reduce((x, r) => x + r.perceived * r.hours, 0) / recent.reduce((x, r) => x + r.hours, 0)) : null;
  const usageMonth = a.usage.month ? a.usage.hours : 0;
  const humans = (s.apps.people?.members ?? []).some((x) => x.role === 'engineer' && x.kind !== 'ai_agent' && x.status === 'active');
  const last = sessions[0];
  return html`
    <div class="grid-2">
      <section class="panel">
        <h2>Coding agent plan</h2>
        ${plan ? html`<p class="small"><b>${plan.label}</b> (${plan.tool}) · ${money(plan.monthly)}/mo. ${plan.note}</p>
          <p class="small">This month: ${round2(usageMonth)} / ~${plan.agentHours} agent-hours${a.usage.overageUsd ? html` · <span class="neg">${money(a.usage.overageUsd)} extra usage</span>` : ''}</p>${meter(usageMonth / plan.agentHours, usageMonth > plan.agentHours ? '--bad' : '')}
          <p class="small muted">Rolling 5-hour window: ~${plan.window >= 99 ? 'no hard cap' : `${plan.window} agent-hours`} per window. ${plan.overage == null ? 'No pay-as-you-go: when the pool runs out you wait.' : `Beyond the allowance: ~${money(plan.overage)} per agent-hour at API rates${w.capUsd > 0 ? `, capped at ${money(w.capUsd)}/mo` : ' with no cap'}.`}</p>`
          : html`<p class="small muted">No coding agent: you build by hand at 1.0×.</p>`}
        <form id="planForm" class="inline"><select name="plan">${Object.entries(PLANS).map(([k, p]) => html`<option value="${k}" ${k === planId ? 'selected' : ''}>${p.label} · $${p.monthly}/mo</option>`)}</select><button class="sm">Switch plan (15 min)</button>${plan ? html`<button type="button" class="sm" id="cancelPlan">Cancel</button>` : ''}</form>
        <p class="small muted">Prices from vendor pages (Oct 2026); allowances are game estimates. A heavy month without a spend cap can cost 3–10× the plan price.</p>
        ${!humans ? html`<details class="small"><summary>Not a developer? Build with an app builder instead</summary>${builderPicker()}</details>` : ''}
      </section>
      <section class="panel">
        <h2>How you work with the agent</h2>
        <div class="grid-2">
          <label>Mode ${sel('mode', CHOICES.mode, w.mode)}</label>
          <label>Permissions ${sel('permissions', CHOICES.permissions, w.permissions)}</label>
          <label>PR size ${sel('diff', CHOICES.diff, w.diff)}</label>
          <label>Diff review ${sel('review', CHOICES.review, w.review)}</label>
          <label>Tests ${sel('tests', CHOICES.tests, w.tests)}</label>
          <label>Production access ${sel('prod', CHOICES.prod, w.prod)}</label>
          <label class="inline-check" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-wfb="bugbot" ${w.bugbot ? 'checked' : ''} style="width:auto" ${plan?.noBugbot ? 'disabled' : ''} /> AI PR review bot (advisory)</label>
          <label>Monthly spend cap ($, 0 = none) <input type="number" min="0" step="10" data-wfn="capUsd" value="${w.capUsd}" /></label>
        </div>
        <p class="small">Expected: rework ~${pct(reworkShare(w, { unreviewedDebt: a.unreviewedDebt }), 0)} of shipped hours · change-failure ~${pct(changeFailureRate(w, { unreviewedDebt: a.unreviewedDebt }), 0)} per deploy · security hole ~${pct(securityBugChance(w), 0)} per feature${a.unreviewedDebt > 0.05 ? html` · <span class="warn">unreviewed-code debt ${pct(a.unreviewedDebt, 0)}</span>` : ''}</p>
        <p class="small muted">Planning, reading diffs and writing tests cost 20–40% more of your hours per feature. Skipping them ships faster for a few weeks, then bugs, incidents and rework catch up.</p>
      </section>
    </div>
    <div class="grid-2">
      <section class="panel">
        <h2>Feels faster vs measured</h2>
        ${perceived != null ? html`
          <div class="small">How fast it feels: <b>${perceived}×</b></div>${meter(perceived / 4, '--warn')}
          <div class="small" style="margin-top:6px">Measured, net of rework (last 4 weeks): <b>${m ? `${m.net}×` : '—'}</b>${m ? html` <span class="muted">(likely ${m.lo}–${m.hi}×)</span>` : ''}</div>${m ? meter(m.net / 4, m.net < 1 ? '--bad' : '--good') : ''}
          ${m && perceived > m.net * 1.25 ? html`<p class="small warn">It feels ${Math.round((perceived / Math.max(0.1, m.net) - 1) * 100)}% faster than it is.</p>` : ''}`
          : html`<p class="small muted">Run a build session to see the gap.</p>`}
        <p class="small muted">METR's 2025 trial: 16 experienced developers took 19% <i>longer</i> with AI on their own mature repos, while believing they were ~20% faster. METR's 2026 follow-up points to a small speedup with wide error bars. DORA 2025: AI raises throughput <i>and</i> instability. Faros (vendor, 2026): incidents per PR +243%, bugs per PR +29%, review time +441% at high adoption.</p>
      </section>
      <section class="panel">
        <h2>Last session</h2>
        ${last ? html`<p class="small">${fmtDate(s, last.day)} · ${last.hours} h → ${last.eff} effective h · rework ~${last.reworkHours} h (${pct(last.r, 0)}) · ${last.diff.prs} PR(s), ~${last.diff.avg} lines each · deploy failure risk ${pct(last.cfr, 0)}</p>
          ${last.stalled ? html`<p class="small warn">${last.stalled} h stalled: ${last.windowHit ? 'hit the 5-hour window' : 'out of monthly allowance'}${last.overageUsd ? `; paid ${money(last.overageUsd)} extra usage` : ''}.</p>` : last.overageUsd ? html`<p class="small warn">${money(last.overageUsd)} extra usage at API rates.</p>` : ''}
          <ul class="small">${coachingFor(last.w).slice(0, 3).map((c) => html`<li>${c}</li>`)}</ul>`
          : html`<p class="small muted">No sessions yet.</p>`}
        ${sessions.length > 1 ? html`<details class="small"><summary>Session log (${sessions.length})</summary><div class="table-wrap"><table><thead><tr><th>Day</th><th>h</th><th>eff</th><th>rework</th><th>PRs</th><th>workflow</th></tr></thead><tbody>${sessions.slice(0, 20).map((x) => html`<tr><td>${fmtDate(s, x.day)}</td><td>${x.hours}</td><td>${x.eff}</td><td>${pct(x.r, 0)}</td><td>${x.diff.prs}</td><td>${pct(x.score, 0)}</td></tr>`)}</tbody></table></div></details>` : ''}
      </section>
    </div>`;
}

function builderPicker() {
  return html`<p class="small">App builders generate a working app (auth, database, hosting) from chat in hours. Fast to a prototype; security, payments edge cases and scale are where they break.</p>
    <form id="builderForm" class="inline"><select name="tool">${Object.entries(BUILDERS).map(([k, b]) => html`<option value="${k}">${b.label} · $${b.monthly}/mo${b.unverified ? ' [unverified]' : ''}</option>`)}</select><button class="sm">Start with this builder (30 min)</button></form>`;
}

export function renderBuilder(ctx, slice) {
  const s = ctx.state;
  const b = builderSlice(slice);
  const t = BUILDERS[b.tool];
  const accounts = activeAccounts(s);
  const haz = leakHazardMonthly(b);
  return html`
    <div class="grid-2">
      <section class="panel">
        <h2>${t.label} <span class="badge accent">app builder</span></h2>
        <p class="small">${t.note} Speed ×${aiMultiplier(s, slice).toFixed(2)} (falls as the app grows). Credits this month: ${round2(b.usage.hours)} / ~${t.hours} build-hours${b.usage.topupUsd ? html` · <span class="neg">${money(b.usage.topupUsd)} top-ups</span>` : ''}. ${b.loops ? `${b.loops} session(s) lost to the agent breaking working code.` : ''}</p>
        <label class="inline-check" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="bCap" ${b.budgetCap ? 'checked' : ''} style="width:auto" /> Budget cap: stop instead of buying top-ups</label>
        <div class="inline" style="margin-top:6px">
          <button class="sm" id="bScan">Run security scan (15 min)</button>
          <button class="sm" id="bExport" ${b.exported ? 'disabled' : ''}>${b.exported ? 'Exported to GitHub' : 'Export to GitHub (30 min)'}</button>
          <button class="sm" id="bReview" ${b.reviewed ? 'disabled' : ''}>${b.reviewed ? 'Senior review done' : `Hire a senior reviewer (${money(BUILDER.review.usd)} + ${BUILDER.review.founderHours} h)`}</button>
        </div>
        ${b.scanFindings ? html`<div class="callout ${b.scanFindings.length ? 'warn' : 'good'} small" style="margin-top:6px"><b>Scan:</b> ${b.scanFindings.length ? html`<ul>${b.scanFindings.map((f) => html`<li>${f.msg}</li>`)}</ul>` : 'no issues found. (The basic scanner does not test whether enabled policies really block access.)'}</div>` : html`<p class="small muted">Not scanned since the last publish.</p>`}
        ${b.ceiling && !b.ceiling.choice ? html`<div class="callout warn small"><b>Ceiling:</b> ${b.ceiling.reason}.<div class="inline" style="margin-top:6px"><button class="sm" data-ceil="harden">Harden with a senior engineer (${money(BUILDER.review.usd)} + ${BUILDER.hardenHours[0]}–${BUILDER.hardenHours[1]} h)</button><button class="sm" data-ceil="migrate">Migrate to real code with a coding agent</button><button class="sm" data-ceil="keep">Keep prompting</button></div></div>` : b.ceiling?.choice ? html`<p class="small muted">Ceiling decision: ${b.ceiling.choice}.</p>` : ''}
        ${b.leaks.length ? html`<div class="callout bad small">${b.leaks.length} data exposure(s): ${b.leaks.map((l) => `${fmtDate(s, l.day)} via ${l.cause}`).join('; ')}</div>` : ''}
        <details class="small"><summary>Switch back to a coding agent</summary><button class="sm" data-ceil="migrate">Migrate to real code</button></details>
      </section>
      <section class="panel">
        <h2>Backend (Supabase-style)</h2>
        ${b.tables.length ? html`<div class="table-wrap"><table><thead><tr><th>Table</th><th>Row-level security</th><th></th></tr></thead><tbody>${b.tables.map((tb, i) => html`<tr><td>${tb.name}</td><td>${tb.rls === 'off' ? html`<span class="badge bad">disabled</span>` : html`<span class="badge good">enabled</span>`}${b.reviewed && tb.rls === 'locked' ? html` <span class="small muted">reviewed</span>` : ''}</td><td>${tb.rls === 'off' ? html`<button class="sm" data-rls="${i}">Enable RLS (10 min)</button>` : ''}</td></tr>`)}</tbody></table></div>`
          : html`<p class="small muted">Tables appear as you build.</p>`}
        <p class="small">Keys: ${b.scanFindings?.some((f) => f.kind === 'service_role') ? html`<span class="neg">service_role key found in the frontend bundle</span> <button class="sm" id="bKey">Move it server-side (30 min)</button>` : html`<span class="muted">anon key in the frontend (normal); run a scan to check for service_role.</span>`}</p>
        <p class="small muted">"Enabled" only means a policy exists, not that it blocks anything: a generated <code>using (true)</code> policy shows as enabled and lets anyone read every row. ${accounts ? `With ${accounts} accounts live, current leak risk is ~${pct(haz, 1)} a month.` : ''} Security scans of vibe-coded apps: most have some issue; ~10% exposed data in one large sample (Lovable CVE-2025-48757).</p>
      </section>
    </div>`;
}

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

export function renderReleases(ctx, slice) {
  const s = ctx.state;
  const rel = releasesSlice(slice);
  const st = releaseStats(rel);
  const errs = rel.errors.filter((e) => e.visible || e.status !== 'unresolved');
  const hidden = rel.errors.filter((e) => !e.visible && e.status === 'unresolved').length;
  return html`
    <div class="stats">
      <div class="stat"><div class="stat-label">Deploys</div><div class="stat-value">${st.deploys}</div><div class="stat-sub">${st.bad} failed (${st.cfr != null ? pct(st.cfr, 0) : '—'})</div></div>
      <div class="stat ${st.open ? 'bad' : ''}"><div class="stat-label">Open errors</div><div class="stat-value">${st.open}</div><div class="stat-sub">${rel.flags.monitoring ? 'monitored' : 'no monitoring'}</div></div>
      <div class="stat"><div class="stat-label">Time to recover</div><div class="stat-value">${fmtMinutes(st.mttr)}</div><div class="stat-sub">mean, resolved incidents</div></div>
      <div class="stat"><div class="stat-label">Incident minutes</div><div class="stat-value">${st.minutesPer100}</div><div class="stat-sub">per 100 deploys (user-weighted)</div></div>
    </div>
    <div class="grid-2">
      <section class="panel">
        <h2>Errors</h2>
        ${!rel.flags.monitoring ? html`<div class="callout warn small">No error monitoring: you only learn about bad releases when customers write in.${hidden ? '' : ''}</div>` : ''}
        ${errs.length ? html`<div class="table-wrap"><table><thead><tr><th>Issue</th><th>Events</th><th>Users</th><th>Seen</th><th></th></tr></thead><tbody>${errs.slice(0, 25).map((e) => html`<tr>
          <td><span class="badge ${e.severity === 'crash' ? 'bad' : 'warn'}">${e.severity}</span> <span class="small">${e.title}</span><div class="small muted">release ${e.release}${e.via ? ` · via ${e.via}` : ''}</div></td>
          <td>${e.events.toLocaleString('en-US')}</td><td>${e.users}</td><td class="small">${fmtDate(s, e.firstSeen)}–${fmtDate(s, e.lastSeen)}</td>
          <td>${e.status === 'unresolved' ? html`<button class="sm" data-rb="${e.id}">Roll back</button><button class="sm" data-fix="${e.id}">Fix (${e.fixHours} h)</button><button class="sm" data-ign="${e.id}">Ignore</button>` : html`<span class="badge ${e.status === 'resolved' ? 'good' : ''}">${e.how ?? e.status}</span>`}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No errors${rel.flags.monitoring ? '' : ' that you know of'}.</p>`}
        ${rel.flags.monitoring ? html`<button class="sm" id="triageErr">Weekly error triage (${TRIAGE_HOURS * 60} min)</button> <span class="small muted">${rel.lastTriageDay != null ? `last ${fmtDate(s, rel.lastTriageDay)}` : 'never'}</span>` : ''}
      </section>
      <section class="panel">
        <h2>Setup</h2>
        ${Object.entries(RELEASE_SETUP).map(([k, t]) => html`<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)"><div><b class="small">${t.label}</b><div class="small muted">${t.note}</div></div>${rel.flags[k] ? html`<span class="badge good">on</span>` : html`<button class="sm" data-rset="${k}" ${t.needs && !rel.flags[t.needs] ? 'disabled' : ''}>Set up (${t.hours} h)</button>`}</div>`)}
        <h3>Deployments</h3>
        ${rel.deployments.length ? html`<ul class="list small">${rel.deployments.slice(0, 12).map((d) => html`<li>${fmtDate(s, d.day)} · ${d.title} <span class="badge ${d.status === 'rolled_back' ? 'warn' : d.bad ? 'bad' : 'good'}">${d.status === 'rolled_back' ? 'rolled back' : d.bad && rel.errors.find((e) => e.deploymentId === d.id)?.visible ? 'errors' : 'ready'}</span>${d.canary ? ' · canary' : ''}</li>`)}</ul>` : html`<p class="empty">Each shipped feature deploys here.</p>`}
        ${rel.pendingHours ? html`<p class="small muted">${rel.pendingHours} h of canary/staging overhead will be added to your next build session.</p>` : ''}
      </section>
    </div>`;
}

// ---------------------------------------------------------------------------
// Issues (Linear-style)
// ---------------------------------------------------------------------------

export function renderIssues(ctx, slice) {
  const s = ctx.state;
  const tq = triageQueue(slice);
  const cyc = cycleSummary(slice, s.day);
  const open = slice.bugs.filter((b) => !b.fixedDay && !b.triage);
  for (const b of [...tq, ...open]) issueKey(slice, b);
  return html`
    <div class="grid-2">
      <section class="panel">
        <h2>Triage <span class="badge ${tq.length > 10 ? 'bad' : tq.length ? 'warn' : 'good'}">${tq.length}</span></h2>
        <p class="small muted">Bug reports from real usage land here. Accept, decline, or mark duplicates (${TRIAGE_MIN_PER_ISSUE} min each). About a quarter of customer reports repeat an existing issue; accepting duplicates means fixing the same bug twice. Untriaged reports still get worked on in arrival order.</p>
        ${tq.length ? html`<ul class="list small">${tq.slice(0, 20).map((b) => html`<li><b>${b.key}</b> <span class="badge ${b.severity === 'high' ? 'bad' : b.severity === 'medium' ? 'warn' : ''}">${b.severity}</span> ${b.title} <span class="muted">· ${b.hours} h · ${fmtDate(s, b.foundDay)}</span>
          <div class="inline" style="margin-top:4px"><button class="sm" data-tri="accept" data-id="${b.id}">Accept</button><button class="sm" data-tri="dup" data-id="${b.id}">Duplicate</button><button class="sm" data-tri="decline" data-id="${b.id}">Decline</button></div></li>`)}</ul>` : html`<p class="empty">Inbox zero.</p>`}
      </section>
      <section class="panel">
        <h2>Cycle ${cyc.n} <span class="small muted">${fmtDate(s, cyc.start)}–${fmtDate(s, cyc.end)}</span></h2>
        ${meter(cyc.progress)}
        <p class="small">${cyc.shipped.length} feature(s) shipped, ${cyc.fixed.length} bug(s) fixed this cycle · ${cyc.open.length} in progress${cyc.carry.length ? html` · <span class="warn">${cyc.carry.length} carried over from earlier cycles</span>` : ''}</p>
        <p class="small muted">Unfinished work rolls into the next cycle silently: watch carry-over, not just velocity.</p>
        <h3>Backlog</h3>
        ${open.length ? html`<ul class="list small">${open.slice(0, 20).map((b) => html`<li><b>${b.key}</b> ${b.title} <span class="muted">· ${round2(b.hours - (b.progress ?? 0))} h left</span></li>`)}</ul>` : html`<p class="empty">No accepted bugs open.</p>`}
      </section>
    </div>`;
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export function renderDecisions(ctx, slice) {
  const s = ctx.state;
  const pending = slice.features.filter((f) => f.status === 'shipped' && f.check && !f.decision);
  const hr = hitRate(slice.features);
  const reads = ['product_prioritization', 'ai_building'].map((id) => readOperator(s, id));
  return html`
    <div class="grid-2">
      <section class="panel">
        <h2>30-day checks <span class="badge">${pending.length} to decide</span></h2>
        <p class="small muted">Thirty days after launch each feature is checked against the metric in its spec. Strong product teams see 40–60% of shipped features move their metric; most teams far fewer (game estimate). Decide what to do and write down why (${(CHECK_HOURS + DECISION_HOURS) * 60} min).</p>
        ${pending.length ? pending.map((f) => html`<div class="callout ${f.check.verdict === 'hit' ? 'good' : 'warn'} small"><b>${f.title}</b><br />${f.check.text}
          <label>Why <input data-reason="${f.id}" maxlength="300" placeholder="e.g. 3 of 8 pilot accounts use it weekly; the rest never found it" /></label>
          <div class="inline"><button class="sm" data-dec="keep" data-id="${f.id}">Keep</button><button class="sm" data-dec="iterate" data-id="${f.id}">Iterate (new spec)</button><button class="sm danger" data-dec="kill" data-id="${f.id}">Kill</button></div></div>`) : html`<p class="empty">Nothing waiting.</p>`}
        <p class="small">${hr.checked ? `${hr.hits} of ${hr.checked} checked features hit their metric (${pct(hr.rate, 0)}).` : 'No checks yet.'}${hr.unmeasurable ? html` <span class="warn">${hr.unmeasurable} couldn't be measured (no numeric target and baseline).</span>` : ''}</p>
      </section>
      <section class="panel">
        <h2>Decisions log</h2>
        ${slice.decisions.length ? html`<ul class="list small">${slice.decisions.slice(0, 30).map((d) => html`<li><span class="muted">${fmtDate(s, d.day)}</span> <span class="badge ${d.kind === 'kill' || d.kind === 'decline' ? '' : d.kind === 'rebuild' ? 'bad' : 'accent'}">${d.kind}</span> <b>${d.title}</b>${d.reason ? html` · ${d.reason}` : html` · <span class="muted">no reason written</span>`}</li>`)}</ul>` : html`<p class="empty">Nothing decided yet. Use "Won't build" on a draft to record what you said no to.</p>`}
        <h3>Operator read</h3>
        ${reads.map((r) => html`<p class="small"><b>${r.functionId === 'ai_building' ? 'Building with AI' : 'Prioritisation'}:</b> <span class="badge ${r.tier === 'stellar' || r.tier === 'good' ? 'good' : r.tier === 'mediocre' ? 'bad' : ''}">${r.tier}</span> ${r.evidence.slice(0, 2).join('; ')}</p>${r.coaching.length ? html`<ul class="small">${r.coaching.slice(0, 2).map((c) => html`<li>${c}</li>`)}</ul>` : ''}`)}
        ${slice.mistakes?.length ? html`<details class="small"><summary>What your product mistakes cost (${slice.mistakes.length})</summary><ul>${slice.mistakes.slice(0, 15).map((m) => html`<li>${fmtDate(s, m.day)} · <b>${m.label}</b>: ${m.detail} ${m.cost.hours ? `(${m.cost.hours} h)` : ''}${m.cost.usd ? ` (${money(m.cost.usd)})` : ''}${m.cost.customers ? ` (~${m.cost.customers} customers)` : ''}</li>`)}</ul></details>` : ''}
      </section>
    </div>`;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function wireExtras(root, ctx) {
  const S = () => productSlice(ctx.state);
  // Workflow settings are choices, not work: free to change.
  on(root, 'change', '[data-wf]', (e, el) => ctx.act((st) => { productSlice(st).agent.workflow[el.dataset.wf] = el.value; }));
  on(root, 'change', '[data-wfb]', (e, el) => ctx.act((st) => { productSlice(st).agent.workflow[el.dataset.wfb] = el.checked; }));
  on(root, 'change', '[data-wfn]', (e, el) => ctx.act((st) => { productSlice(st).agent.workflow[el.dataset.wfn] = Math.max(0, Number(el.value) || 0); }));
  on(root, 'submit', '#planForm', (e) => { e.preventDefault(); const id = new FormData(e.target).get('plan'); ctx.act((st) => { choosePlan(st, id); toast(`Switched to ${PLANS[id].label}.`, 'good'); }, { hours: 0.25, label: 'Coding agent plan' }); });
  on(root, 'click', '#cancelPlan', () => ctx.act((st) => cancelPlan(st)));
  on(root, 'submit', '#builderForm', (e) => { e.preventDefault(); const tool = new FormData(e.target).get('tool'); ctx.act((st) => { chooseBuilder(st, productSlice(st), tool); toast(`${BUILDERS[tool].label} ready. Your build sessions are now prompt sessions.`, 'good'); }, { hours: 0.5, label: 'App builder setup' }); });
  on(root, 'change', '#bCap', (e, el) => ctx.act((st) => { builderSlice(productSlice(st)).budgetCap = el.checked; }));
  on(root, 'click', '#bScan', () => ctx.act((st) => { const b = builderSlice(productSlice(st)); b.scannedDay = st.day; const f = scan(b); toast(f.length ? `${f.length} finding(s).` : 'Scan clean.', f.length ? 'warn' : 'good'); }, { hours: 0.25, label: 'Security scan' }));
  on(root, 'click', '#bExport', () => ctx.act((st) => { builderSlice(productSlice(st)).exported = true; }, { hours: 0.5, label: 'Export to GitHub' }));
  on(root, 'click', '#bKey', () => ctx.act((st) => { const b = builderSlice(productSlice(st)); b.serviceRoleInFrontend = false; if (b.scanFindings) b.scanFindings = b.scanFindings.filter((f) => f.kind !== 'service_role'); }, { hours: 0.5, label: 'Move service key server-side' }));
  on(root, 'click', '[data-rls]', (e, el) => ctx.act((st) => { const t = builderSlice(productSlice(st)).tables[Number(el.dataset.rls)]; if (t?.rls === 'off') t.rls = rng(st) < 0.5 ? 'locked' : 'permissive'; }, { hours: 0.17, label: 'Enable RLS' }));
  on(root, 'click', '#bReview', () => ctx.act((st) => {
    const r = seniorReview(builderSlice(productSlice(st)));
    payReviewer(st);
    toast(r.permissive.length ? `Reviewer found ${r.permissive.length} policy(ies) that allowed every row (${r.permissive.join(', ')}). Fixed.` : 'Reviewer locked down every table.', 'good');
  }, { hours: BUILDER.review.founderHours, label: 'Senior review of the generated app' }));
  on(root, 'click', '[data-ceil]', (e, el) => {
    const c = el.dataset.ceil;
    ctx.act((st) => {
      const sl = productSlice(st), b = builderSlice(sl);
      if (c === 'migrate') { const h = migrateFromBuilder(st, sl); toast(`Rebuild queued: ~${h} h before new features.`, 'info'); return; }
      b.ceiling = { ...(b.ceiling ?? { reason: 'manual' }), choice: c, day: st.day };
      if (c === 'harden') { seniorReview(b); payReviewer(st); sl.bugs.push({ id: `bug_harden_${st.day}`, title: 'Hardening pass: auth edge cases, webhooks, background jobs, monitoring', hours: BUILDER.hardenHours[0] + 5, progress: 0, severity: 'medium', foundDay: st.day, fixedDay: null }); }
      if (c === 'keep') productMistake(st, sl, { functionId: 'ai_building', id: 'builder_past_ceiling', key: `ceiling:${st.day}`, label: 'Kept prompting past the app builder\'s ceiling', cost: { hours: 6 }, circles: true, detail: b.ceiling.reason, delayed: true });
    }, { hours: c === 'harden' ? 1 : 0.25, label: 'App builder ceiling decision' });
  });
  // Releases
  on(root, 'click', '[data-rset]', (e, el) => { const k = el.dataset.rset; ctx.act((st) => { const rel = releasesSlice(productSlice(st)); rel.flags[k] = true; const t = RELEASE_SETUP[k]; if (t.monthly) addRecurring(st, { vendor: k === 'seer' ? 'Error monitoring AI (Seer-style)' : 'Error monitoring (Sentry-style)', amount: t.monthly, category: 'software', dayOfMonth: 9 }); }, { hours: RELEASE_SETUP[k].hours, label: RELEASE_SETUP[k].label }); });
  on(root, 'click', '[data-rb]', (e, el) => ctx.act((st) => { const r = rollback(releasesSlice(productSlice(st)), el.dataset.rb, { rand: () => rng(st) }); toast(r.ok ? r.note : r.error, r.ok ? 'good' : 'bad'); }, { hours: 0.25, label: 'Rollback' }));
  on(root, 'click', '[data-fix]', (e, el) => {
    const rel = releasesSlice(S());
    const err = rel.errors.find((x) => x.id === el.dataset.fix);
    const useful = rel.flags.seer && rng(ctx.state) < 0.65;
    const hours = err ? round2(err.fixHours * (useful ? 0.6 : 1)) : 0;
    ctx.act((st) => { resolveWithFix(releasesSlice(productSlice(st)), el.dataset.fix, { seerUseful: useful }); }, { hours, label: 'Fix release error' });
  });
  on(root, 'click', '[data-ign]', (e, el) => ctx.act((st) => { ignoreError(releasesSlice(productSlice(st)), el.dataset.ign); }));
  on(root, 'click', '#triageErr', () => ctx.act((st) => { const n = triageErrors(releasesSlice(productSlice(st)), st.day); toast(n ? `${n} error(s) you hadn't looked at.` : 'Nothing new.', n ? 'warn' : 'good'); }, { hours: TRIAGE_HOURS, label: 'Error triage' }));
  // Issues triage
  on(root, 'click', '[data-tri]', (e, el) => ctx.act((st) => {
    const sl = productSlice(st);
    const k = el.dataset.tri, id = el.dataset.id;
    const r = k === 'accept' ? triageAccept(sl, id) : k === 'dup' ? triageDuplicate(sl, id, st.day) : triageDecline(sl, id, st.day);
    if (r.note) toast(r.note, 'warn');
  }, { hours: TRIAGE_MIN_PER_ISSUE / 60, label: 'Triage' }));
  // Decisions
  on(root, 'click', '[data-dec]', (e, el) => {
    const id = el.dataset.id, kind = el.dataset.dec;
    const reason = root.querySelector(`[data-reason="${id}"]`)?.value ?? '';
    ctx.act((st) => {
      const sl = productSlice(st);
      const f = sl.features.find((x) => x.id === id);
      if (!f) return;
      decideFeature(st, sl, f, kind, reason);
      if (kind === 'iterate') {
        const nf = { ...newFeature(st), title: `${f.title} (v2)`, user: f.user, problem: f.problem, solution: f.solution, metric: f.metric, baseline: f.check?.got != null ? `${f.check.got}${f.check.unit === '%' ? '%' : ''} after v1` : f.baseline, evidence: [...(f.evidence ?? [])], iterateOf: f.id };
        sl.features.push(nf);
        ctx.navigate('product', `spec:${nf.id}`);
      }
    }, { hours: CHECK_HOURS + DECISION_HOURS, label: 'Feature decision' });
  });
  on(root, 'click', '#declineSpec', (e, el) => {
    const reason = prompt('Why not? (one line, goes in the decisions log)') ?? '';
    ctx.act((st) => { const sl = productSlice(st); const f = sl.features.find((x) => x.id === el.dataset.id); if (f) declineSpec(st, sl, f, reason); ctx.navigate('product', 'decisions'); }, { hours: DECISION_HOURS, label: 'Won\'t build' });
  });
}

function payReviewer(st) {
  post(st, { amount: -BUILDER.review.usd, counterparty: 'Senior engineer (contract)', description: 'Security review of the AI-built app', category: 'contractors', method: 'card' });
}
