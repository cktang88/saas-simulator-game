// Product (Linear-style): one-page feature specs with an instant genericity blocker and an LLM rubric
// grader, effort estimates for 2026 AI coding agents, a build queue fed by founder build sessions and
// the team's dev hours, bugs/tech debt, a changelog, and AI inference cost for AI features.
//
// Rubric, velocity and inference numbers: docs/research/hr-legal-product.md §3, §5, §6 (see product/*.js).

import { html, mount, on, formData, toast } from '../core/ui.js';
import { notify, hoursLeft } from '../core/state.js';
import { post } from '../core/bank.js';
import { activeSubs, trialingSubs, mrr } from '../core/stripe.js';
import { ensureMarket, setModifier, hasProduct } from '../core/market.js';
import { rng, chance, money, pct, fmtDate, round2 } from '../core/util.js';
import { devHoursPerWeek, aiCodingMultiplier } from './people/capacity.js';
import { productSlice, researchSlice, newFeature } from './product/store.js';
import { lintSpec, heuristicGrade, combineGrades, gradePrompt, GRADER_SYSTEM, GRADE_SCHEMA, composeSpec, specKey, specWordCount, acceptanceList, complexityTags, DIMS, SPEC_WORDS, PASS_TOTAL } from './product/spec.js';
import { VELOCITY, toEffortHours, codebaseMultiplier, hasCodingAgent, shippedEffort, openBugHours, debtFactor, speedMultiplier, applyBuildHours, makeBugs, bugChurnMultiplier, AI_LEVELS, USERS_PER_ACCOUNT, monthlyInference, queueEta } from './product/build.js';

// Writing a one-page spec ≈ 30–60 min (ARCHITECTURE.md time costs); a revision ≈ 15–30 min [A].
export const SPEC_HOURS = { first: [0.5, 1], revision: [0.25, 0.5] };
// Chance per month that a model vendor ships your prompt-only AI feature for free [A]: 10–30%/yr (research §5).
const COMMODITIZE_MONTHLY = 0.2 / 12;

export function specHours(f) {
  const [lo, hi] = f.grade ? SPEC_HOURS.revision : SPEC_HOURS.first;
  return round2(Math.min(hi, lo + (specWordCount(f) / SPEC_WORDS.max) * (hi - lo)));
}

export function velocity(state, { founder = false } = {}) {
  const slice = productSlice(state);
  return speedMultiplier({
    agent: hasCodingAgent(state),
    shipped: shippedEffort(slice),
    peopleMult: aiCodingMultiplier(state),
    debt: debtFactor(slice),
    energy: founder ? state.founder.energy : 100,
  });
}

const activeAccounts = (state) => activeSubs(state).length + trialingSubs(state).length;

function onShipped(state, slice, f) {
  f.spec = composeSpec(f);
  const bugs = makeBugs(() => rng(state), f, { day: state.day, reworkShare: VELOCITY.reworkShare * (hasCodingAgent(state) ? 1 : 0.7) });
  slice.bugs.push(...bugs);
  slice.changelog.unshift({ day: state.day, featureId: f.id, title: f.title, note: String(f.solution).slice(0, 200) });
  if (slice.changelog.length > 200) slice.changelog.length = 200;
  notify(state, `Shipped "${f.title}". ${bugs.length ? `${bugs.length} bug(s) turned up in QA and early use.` : ''}`, { type: 'good', app: 'product' });
}

// Apply raw coding hours (founder session or team day). Returns the build result.
export function build(state, rawHours, { founder = false, bugShare = null } = {}) {
  const slice = productSlice(state);
  const eff = rawHours * velocity(state, { founder });
  const r = applyBuildHours(slice, eff, { bugShare: bugShare ?? slice.bugShare, day: state.day });
  for (const f of r.shipped) onShipped(state, slice, f);
  return { ...r, eff };
}

function queueFeature(state, f) {
  const slice = productSlice(state);
  f.agentHours = f.grade.agentHours;
  f.effortHours = toEffortHours(f.grade.agentHours);
  f.progressHours = Math.min(f.progressHours ?? 0, f.effortHours);
  f.status = 'queued';
  f.spec = composeSpec(f);
  if (!slice.buildQueue.includes(f.id)) slice.buildQueue.push(f.id);
}

const linkedInsights = (state, f) => researchSlice(state).insights.filter((i) => (f.evidence ?? []).includes(i.id));
const gradeFresh = (f) => f.grade && f.gradeKey === specKey(f);
const ready = (f) => f.status === 'draft' && gradeFresh(f) && f.grade.pass;

async function gradeSpec(ctx, f) {
  const state = ctx.state;
  const lint = lintSpec(f);
  f.spec = composeSpec(f);
  if (lint.blockers.length) {
    // Instant block: generic specs never cost review time (research §6: block before they cost game time).
    f.grade = { pass: false, verdict: 'generic', instant: true, scores: null, total: null, issues: lint.blockers.map((b) => b.msg), rewriteHint: heuristicGrade(f).rewriteHint, day: state.day, source: 'blocklist' };
    f.gradeKey = specKey(f);
    f.status = 'rejected';
    return;
  }
  const insights = linkedInsights(state, f);
  const res = await ctx.llm.panel({
    task: 'feature_spec_grade',
    system: GRADER_SYSTEM,
    prompt: gradePrompt(f, { insights, company: state.company }),
    schema: GRADE_SCHEMA,
    temperature: 0.2,
    maxTokens: 700,
    fallback: () => heuristicGrade(f, { insights }),
    cache: state.cache,
  });
  const g = combineGrades(res.map((r) => r.data), lint);
  // Effort: LLM estimate sanity-bounded by the heuristic (0.4×–2.5×) so a model can't call payments "2 hours".
  const h = heuristicGrade(f).agentHours;
  g.agentHours = Math.round(Math.min(h * 2.5, Math.max(h * 0.4, g.agentHours || h)));
  f.grade = { ...g, warnings: lint.warnings.map((w) => w.msg), models: res.map((r) => ({ model: r.model, mock: r.mock })), day: state.day, source: res.every((r) => r.mock) ? 'offline heuristic' : 'LLM panel' };
  f.gradeKey = specKey(f);
  f.status = g.pass ? 'draft' : 'rejected';
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const STATUS_TONE = { draft: '', rejected: 'bad', queued: 'accent', building: 'warn', shipped: 'good' };
const statusBadge = (f) => ready(f) ? html`<span class="badge good">ready</span>` : html`<span class="badge ${STATUS_TONE[f.status]}">${f.status}</span>`;

function lintHtml(f) {
  const lint = lintSpec(f);
  const n = lint.words;
  const tone = n < SPEC_WORDS.block || n > SPEC_WORDS.max ? 'bad' : n < SPEC_WORDS.min ? 'warn' : 'good';
  return html`<p class="small"><span class="badge ${tone}">${n} words</span> target ~${SPEC_WORDS.target} (${SPEC_WORDS.min}–${SPEC_WORDS.max})
    ${lint.blockers.length ? html` · <b class="neg">${lint.blockers.length} blocker(s)</b>` : html` · <b class="pos">no blockers</b>`}</p>
    ${lint.blockers.length ? html`<ul class="small" style="padding-left:18px;margin:4px 0">${lint.blockers.map((b) => html`<li class="neg">${b.msg}</li>`)}</ul>` : ''}
    ${lint.warnings.length ? html`<ul class="small" style="padding-left:18px;margin:4px 0">${lint.warnings.map((b) => html`<li class="warn">${b.msg}</li>`)}</ul>` : ''}`;
}

function gradeHtml(state, f) {
  const g = f.grade;
  if (!g) return html`<p class="muted small">Not reviewed yet. Blocked specs cost nothing; a full review takes ${SPEC_HOURS.first[0] * 60}–${SPEC_HOURS.first[1] * 60} min of your week (writing + review).</p>`;
  const stale = !gradeFresh(f);
  return html`
    ${stale ? html`<div class="callout warn small">Edited since the last review: resubmit to re-grade.</div>` : ''}
    <div class="callout ${g.pass ? 'good' : g.verdict === 'revise' ? 'warn' : 'bad'}">
      <b>${g.pass ? 'Specific: ready to build' : g.instant ? 'Blocked instantly: generic spec' : g.verdict === 'revise' ? 'Rejected: needs revision' : 'Rejected: generic'}</b>
      ${g.total != null ? html` · ${g.total}/20 (bar ${PASS_TOTAL}, and specificity/user/testability ≥ 2)` : ''}
      <span class="small muted"> · ${g.source}${g.models?.some((m) => m.mock) ? ' (offline)' : ''} · ${fmtDate(state, g.day)}</span>
    </div>
    ${g.scores ? html`<div style="display:grid;gap:6px;margin:8px 0">${DIMS.map(([k, label]) => html`<div style="display:grid;grid-template-columns:100px 1fr 34px;gap:8px;align-items:center"><span class="small">${label}</span><div class="meter"><div style="width:${(g.scores[k] / 4) * 100}%;background:var(${g.scores[k] < 2 ? '--bad' : g.scores[k] < 3 ? '--warn' : '--good'})"></div></div><span class="small muted">${g.scores[k]}/4</span></div>`)}</div>` : ''}
    ${g.issues?.length ? html`<h3>Why</h3><ul class="small">${g.issues.map((i) => html`<li>${i}</li>`)}</ul>` : ''}
    ${g.rewriteHint && !g.pass ? html`<p class="small"><b>Rewrite direction:</b> ${g.rewriteHint}</p>` : ''}
    ${g.warnings?.length && g.pass ? html`<details class="small"><summary>${g.warnings.length} minor note(s)</summary><ul>${g.warnings.map((w) => html`<li>${w}</li>`)}</ul></details>` : ''}
    ${g.agentHours ? html`<p class="small"><b>Effort estimate:</b> ~${g.agentHours} h with AI coding agents on a young codebase (≈${toEffortHours(g.agentHours)} h hand-coded). ${complexityTags(f).length ? html`Complexity: ${complexityTags(f).map((c) => c.tag).join(', ')}.` : ''}</p>` : ''}
    ${g.thinWrapper ? html`<div class="callout warn small"><b>Thin-wrapper risk.</b> This reads like a prompt over a general model. Would users still pay if ChatGPT, Claude and Gemini shipped it free tomorrow? Tie it to their data, integrations or workflow.</div>` : ''}`;
}

function aiCostHtml(state, f) {
  if (!f.ai?.enabled) return '';
  const lvl = AI_LEVELS[f.ai.level];
  const per = lvl.usd * USERS_PER_ACCOUNT[state.company.model];
  const price = state.plans.find((p) => p.active);
  const pm = price ? (price.interval === 'year' ? price.price / 12 : price.price) : 0;
  return html`<p class="small">≈ <b>${money(lvl.usd, { cents: true })}</b> per active user per month (range ${lvl.range}) × ${USERS_PER_ACCOUNT[state.company.model]} user(s)/account = <b>${money(per, { cents: true })}</b>/account/mo${pm ? html` · <span class="${per / pm > 0.3 ? 'neg' : per / pm > 0.15 ? 'warn' : ''}">${pct(per / pm, 0)} of your price</span>` : ''}. <span class="muted">Game assumption computed from Anthropic list prices (Oct 2026), not a measured figure. Charged monthly as AI inference.</span></p>`;
}

function renderBoard(root, ctx, slice) {
  const s = ctx.state;
  const cols = [
    ['Drafts', slice.features.filter((f) => f.status === 'draft' && !ready(f))],
    ['Rejected', slice.features.filter((f) => f.status === 'rejected')],
    ['Ready', slice.features.filter(ready)],
    ['In build', slice.buildQueue.map((id) => slice.features.find((f) => f.id === id)).filter(Boolean)],
    ['Shipped', slice.features.filter((f) => f.status === 'shipped').sort((a, b) => b.shippedDay - a.shippedDay)],
  ];
  return html`
    <div class="kanban">${cols.map(([name, list]) => html`<div class="col"><h4><span>${name}</span><span>${list.length}</span></h4>
      ${list.map((f) => html`<div class="card" data-open="${f.id}" style="cursor:pointer">
        <div><b>${f.title || '(untitled)'}</b></div>
        <div class="small muted">${String(f.user || '').slice(0, 70)}</div>
        <div class="small" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${statusBadge(f)}${f.grade?.total != null ? html`<span class="badge">${f.grade.total}/20</span>` : ''}${f.ai?.enabled ? html`<span class="badge accent">AI · ${f.ai.level}</span>` : ''}${f.effortHours ? html`<span class="badge">${Math.round(f.progressHours)}/${f.effortHours}h</span>` : ''}</div>
        ${f.status === 'building' || f.status === 'queued' ? html`<div class="meter" style="margin-top:6px"><div style="width:${(f.progressHours / f.effortHours) * 100}%"></div></div>` : ''}
      </div>`)}
    </div>`)}</div>
    ${!slice.features.length ? html`<div class="callout">Start with one narrow feature for one specific user. In 2026 the bottleneck isn't writing code (agents do much of it); it's deciding <i>what</i> to build. A good spec doubles as the prompt for your coding agent.</div>` : ''}`;
}

function renderEditor(ctx, slice, f) {
  const s = ctx.state;
  const locked = ['queued', 'building', 'shipped'].includes(f.status);
  const dis = locked ? 'disabled' : '';
  const insights = researchSlice(s).insights;
  const byTheme = {};
  for (const i of insights) (byTheme[i.theme] ??= []).push(i);
  return html`
    <div class="grid-2 spec-grid">
      <section class="panel">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><h2 style="margin:0">Feature spec ${statusBadge(f)}</h2><a href="#/product" class="small">← Board</a></div>
        <p class="small muted">One page: who has the problem, when, how painful, what they do today → what the product does → how a tester verifies it → how you'll know it worked.</p>
        <label>Title <input id="sp-title" data-f="title" maxlength="90" value="${f.title}" ${dis} placeholder="e.g. Receipt requests by SMS for month-end close" /></label>
        <label>Target user <input id="sp-user" data-f="user" maxlength="200" value="${f.user}" ${dis} placeholder="Role, size, context: e.g. solo bookkeepers with 10–30 small-business clients in QuickBooks" /></label>
        <label>Problem <span class="hint">who, when (trigger), how painful (time/money/errors), current workaround, evidence</span>
          <textarea id="sp-problem" data-f="problem" rows="4" ${dis} placeholder="At month-end close, 6 of 9 bookkeepers I interviewed spend 2–3 h chasing missing receipts by email; today they track them in a spreadsheet…">${f.problem}</textarea></label>
        <label>Proposed solution <span class="hint">the concrete behaviour: trigger → what the product does → what the user sees</span>
          <textarea id="sp-solution" data-f="solution" rows="3" ${dis} placeholder="Each client gets an SMS link to snap a receipt; it attaches to the matching bank transaction…">${f.solution}</textarea></label>
        <label>Acceptance criteria <span class="hint">one per line, Given/When/Then, include a failure case</span>
          <textarea id="sp-ac" data-f="acceptanceText" rows="4" ${dis} placeholder="Given a client opens the SMS link, when they upload a photo, then it is attached to the transaction with the same amount within 1 minute.&#10;If no transaction matches, the receipt is listed under Unmatched and the bookkeeper is notified.">${f.acceptanceText ?? acceptanceList(f).join('\n')}</textarea></label>
        <div class="grid-2">
          <label>Success metric (outcome + target + window) <input id="sp-metric" data-f="metric" maxlength="200" value="${f.metric}" ${dis} placeholder="Receipts matched before close → 75% within 30 days" /></label>
          <label>Baseline today <input id="sp-baseline" data-f="baseline" maxlength="120" value="${f.baseline}" ${dis} placeholder="40% (from 3 pilot accounts)" /></label>
        </div>
        <label>Not in v1 (non-goals) <input id="sp-nongoals" data-f="nonGoals" maxlength="200" value="${f.nonGoals}" ${dis} placeholder="OCR of line items; Xero support" /></label>
        <fieldset><legend>Runtime AI</legend>
          <label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="display:inline-block;margin:3px 0 0;flex:none" type="checkbox" id="sp-ai" ${f.ai?.enabled ? 'checked' : ''} ${dis} /> This feature calls an LLM for users at runtime</label>
          <label>Usage level <select id="sp-ailevel" ${dis || (f.ai?.enabled ? '' : 'disabled')}>${Object.entries(AI_LEVELS).map(([k, v]) => html`<option value="${k}" ${f.ai?.level === k ? 'selected' : ''}>${v.label} (${v.range}/user/mo)</option>`)}</select></label>
          <div id="aiCost">${aiCostHtml(s, f)}</div>
        </fieldset>
        <fieldset><legend>Evidence from research</legend>
          ${insights.length ? html`<p class="small muted">Link insights. Only <b>real</b> interviews count as evidence; synthetic (AI persona) interviews are rehearsal.</p>
            ${Object.entries(byTheme).map(([theme, list]) => html`<div class="small"><b>${theme}</b>${list.slice(0, 12).map((i) => html`<label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="display:inline-block;margin:3px 0 0;flex:none" type="checkbox" data-ev="${i.id}" ${(f.evidence ?? []).includes(i.id) ? 'checked' : ''} ${dis} /> <span class="badge ${i.real ? 'good' : ''}">${i.real ? 'real' : 'synthetic'}</span> ${String(i.text).slice(0, 140)} <span class="muted">· ${i.who ?? ''}</span></label>`)}</div>`)}`
            : html`<p class="small muted">No research insights yet. <a href="#/research">Run interviews</a> and link what you learn; specs that cite real evidence score higher.</p>`}
        </fieldset>
        <div class="inline" style="margin-top:8px">
          ${!locked ? html`<button class="primary" id="submitSpec">Submit for review (${Math.round(specHours(f) * 60)} min)</button>` : ''}
          ${ready(f) ? html`<button class="primary" id="queueSpec">Add to build queue</button>` : ''}
          ${f.status === 'queued' || f.status === 'building' ? html`<button id="unqueue">Pull from queue (keeps progress)</button>` : ''}
          ${!locked ? html`<button class="danger" id="deleteSpec">Delete</button>` : ''}
        </div>
      </section>
      <section class="panel">
        <h2>Genericity check (live)</h2>
        <div id="lintBox">${lintHtml(f)}</div>
        <h2 style="margin-top:14px">Review</h2>
        ${gradeHtml(s, f)}
        ${f.status === 'shipped' ? html`<p class="small">Shipped ${fmtDate(s, f.shippedDay)}.</p>` : ''}
        ${f.effortHours ? html`<p class="small">Build: ${Math.round(f.progressHours)}/${f.effortHours} effective hours</p><div class="meter"><div style="width:${(f.progressHours / f.effortHours) * 100}%"></div></div>` : ''}
        <details style="margin-top:12px"><summary class="small">What a good spec looks like</summary>
          <p class="small muted">"For agency owners with 5–20 clients who screenshot GA4 into slides monthly (7/10 interviewees, ~3 h/month), generate a white-labeled PDF report per client on the 1st. AC: Given a connected GA4 property, when the month closes, a PDF with sessions, conversions and top 5 pages vs last month is emailed to the agency for approval; if GA4 auth expired, the owner gets a reconnect email and no report is sent. Metric: % of active agencies sending ≥1 client report/month, 0% → 40% within 60 days. Not in v1: custom templates, non-GA4 sources." (docs/research/hr-legal-product.md §6)</p>
          <p class="small muted">Bad: "Add a killer AI feature to increase session length by 50%." Vanity metric, no baseline, no user, no behaviour.</p>
        </details>
      </section>
    </div>`;
}

function renderBuild(ctx, slice) {
  const s = ctx.state;
  const agent = hasCodingAgent(s);
  const shipped = shippedEffort(slice);
  const v = velocity(s, { founder: true });
  const team = devHoursPerWeek(s);
  const teamEffDay = (team / 7) * velocity(s);
  const etas = Object.fromEntries(queueEta(slice, teamEffDay, slice.bugShare).map((e) => [e.id, e.days]));
  const bugs = slice.bugs.filter((b) => !b.fixedDay);
  const bugH = openBugHours(slice);
  const aiFeats = slice.features.filter((f) => f.status === 'shipped' && f.ai?.enabled);
  const accounts = activeAccounts(s);
  const monthly = monthlyInference(slice.features, s.company.model, accounts);
  const m = mrr(s);
  return html`
    <div class="stats">
      <div class="stat"><div class="stat-label">AI coding speedup</div><div class="stat-value">${agent ? codebaseMultiplier(shipped).toFixed(2) : '1.00'}×</div><div class="stat-sub">${agent ? (shipped < 150 ? 'greenfield: agents shine' : 'maturing codebase: gains shrink') : 'no coding agent subscription'}</div></div>
      <div class="stat ${bugH > 60 ? 'bad' : bugH > 20 ? 'warn' : ''}"><div class="stat-label">Bug backlog</div><div class="stat-value">${Math.round(bugH)}h</div><div class="stat-sub">velocity ×${debtFactor(slice).toFixed(2)}</div></div>
      <div class="stat"><div class="stat-label">Your effective speed</div><div class="stat-value">${v.toFixed(2)}×</div><div class="stat-sub">per founder hour${s.founder.energy < 30 ? ' (exhausted)' : ''}</div></div>
      <div class="stat"><div class="stat-label">Team dev hours</div><div class="stat-value">${Math.round(team)}h/wk</div><div class="stat-sub">${team ? `${(teamEffDay * 7).toFixed(0)} effective h/wk` : html`<a href="#/people">hire or add agents in People</a>`}</div></div>
    </div>
    <p class="small muted">Velocity model (game assumptions from METR 2025/2026 and YC W25): AI agents speed up greenfield work 1.5–3× but only 0.8–1.3× on a mature codebase; every shipped hour creates ~10–30% rework. Perceived speedups overstate measured ones. Ignored bugs slow everything and raise churn.</p>
    <div class="grid-2">
      <section class="panel">
        <h2>Build session</h2>
        <form id="sessionForm" class="inline">
          <label>Hours <input type="number" name="hours" min="1" max="12" step="0.5" value="4" /></label>
          <label>Work on <select name="target"><option value="queue">Top of the queue</option><option value="bugs">Bug backlog</option></select></label>
          <button class="primary">Start session</button>
        </form>
        <p class="hint">Spends founder hours now (${hoursLeft(s).toFixed(1)} h left this week). 1 h of yours ≈ ${v.toFixed(2)} effective hours.</p>
        <h3>Queue</h3>
        ${slice.buildQueue.length ? html`<ul class="list">${slice.buildQueue.map((id, i) => {
          const f = slice.features.find((x) => x.id === id);
          if (!f) return '';
          return html`<li><div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><a href="#/product/spec:${f.id}"><b>${f.title}</b></a><span class="small">${Math.round(f.progressHours)}/${f.effortHours}h ${etas[id] != null ? html`· team ETA ~${etas[id]}d` : ''}
            <button class="sm" data-up="${id}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="sm" data-down="${id}" ${i === slice.buildQueue.length - 1 ? 'disabled' : ''}>↓</button></span></div>
            <div class="meter"><div style="width:${(f.progressHours / f.effortHours) * 100}%"></div></div></li>`;
        })}</ul>` : html`<p class="empty">Nothing queued. Specs that pass review can be added from the board.</p>`}
        <label>Team time on bugs <select id="bugShare">${[0, 0.1, 0.2, 0.3, 0.5].map((x) => html`<option value="${x}" ${slice.bugShare === x ? 'selected' : ''}>${pct(x, 0)}</option>`)}</select></label>
      </section>
      <section class="panel">
        <h2>Bugs & tech debt <span class="badge ${bugs.length ? 'warn' : 'good'}">${bugs.length} open</span></h2>
        ${bugs.length ? html`<ul class="list small">${bugs.slice(0, 15).map((b) => html`<li><span class="badge ${b.severity === 'high' ? 'bad' : b.severity === 'medium' ? 'warn' : ''}">${b.severity}</span> ${b.title} <span class="muted">· ${round2(b.hours - (b.progress ?? 0))}h left · found ${fmtDate(s, b.foundDay)}</span></li>`)}</ul>` : html`<p class="empty">No known bugs.</p>`}
        <p class="small muted">Churn effect of the backlog: ×${bugChurnMultiplier(slice).toFixed(2)}.</p>
        <h2 style="margin-top:14px">AI inference</h2>
        ${aiFeats.length ? html`<p class="small">${aiFeats.length} shipped AI feature(s) · ${accounts} active/trialing accounts → <b>${money(monthly)}/mo</b> projected${m ? html` = <span class="${monthly / m > 0.25 ? 'neg' : ''}">${pct(monthly / m, 0)} of MRR</span>` : ''}. Accrued this month: ${money(slice.inferenceAccrued, { cents: true })}.</p>
          <p class="small muted">Traditional SaaS gross margin is 75–85%; AI-native products run ~45–60%, and flat-rate heavy usage can go negative. Mitigate with usage caps, small-model routing, caching or usage pricing.</p>`
          : html`<p class="small muted">No AI features shipped: inference cost is $0.</p>`}
      </section>
    </div>`;
}

function renderChangelog(ctx, slice) {
  const s = ctx.state;
  return html`<section class="panel"><h2>Changelog</h2><p class="small muted">Ship small, weekly; tell customers what changed. A public changelog is also proof of momentum for buyers and investors.</p>
    ${slice.changelog.length ? html`<ul class="list">${slice.changelog.map((c) => html`<li><span class="small muted">${fmtDate(s, c.day)}</span><br /><b>${c.title}</b><div class="small">${c.note}</div></li>`)}</ul>` : html`<p class="empty">Nothing shipped yet.</p>`}</section>`;
}

export default {
  id: 'product',
  title: 'Product',
  icon: '🛠️',
  group: 'Product',
  badge: (state) => (state.apps.product?.features ?? []).filter((f) => f.status === 'building').length || null,

  render(root, ctx) {
    const s = ctx.state;
    const slice = productSlice(s);
    const [view, id] = (ctx.params || 'board').split(':');
    const f = view === 'spec' ? slice.features.find((x) => x.id === id) : null;
    const tab = f ? 'spec' : ['board', 'build', 'changelog'].includes(view) ? view : 'board';
    const shippedN = slice.features.filter((x) => x.status === 'shipped').length;
    mount(root, html`
      <div class="app-head"><div><h1>Product</h1><p>Write one-page specs, get them past a demanding reviewer, build with AI coding agents, ship, fix what breaks. ${shippedN ? `${shippedN} feature(s) live.` : 'Nothing shipped yet: no product means nothing converts.'}</p></div>
        <div class="app-actions"><button class="primary" id="newSpec">New spec</button></div></div>
      <div class="tabs"><a href="#/product/board" class="${tab === 'board' ? 'active' : ''}">Board</a>${f ? html`<a class="active">Spec</a>` : ''}<a href="#/product/build" class="${tab === 'build' ? 'active' : ''}">Build</a><a href="#/product/changelog" class="${tab === 'changelog' ? 'active' : ''}">Changelog</a></div>
      ${tab === 'spec' ? renderEditor(ctx, slice, f) : tab === 'build' ? renderBuild(ctx, slice) : tab === 'changelog' ? renderChangelog(ctx, slice) : renderBoard(root, ctx, slice)}`);

    on(root, 'click', '#newSpec', () => ctx.act((st) => {
      const nf = newFeature(st);
      productSlice(st).features.push(nf);
      ctx.navigate('product', `spec:${nf.id}`);
    }));
    on(root, 'click', '[data-open]', (e, el) => ctx.navigate('product', `spec:${el.dataset.open}`));

    if (f) {
      // Typing updates state in place (no re-render) so focus and drafts survive.
      const refreshLint = () => {
        const box = root.querySelector('#lintBox');
        if (box) box.innerHTML = String(lintHtml(f));
        const ai = root.querySelector('#aiCost');
        if (ai) ai.innerHTML = String(aiCostHtml(s, f));
        const btn = root.querySelector('#submitSpec');
        if (btn) btn.textContent = `Submit for review (${Math.round(specHours(f) * 60)} min)`;
        ctx.save();
      };
      on(root, 'input', '[data-f]', (e, el) => {
        f[el.dataset.f] = el.value;
        if (el.dataset.f === 'acceptanceText') f.acceptance = el.value.split('\n').map((x) => x.trim()).filter(Boolean);
        if (f.status === 'rejected' && !gradeFresh(f)) f.status = 'draft';
        refreshLint();
      });
      on(root, 'change', '#sp-ai', (e, el) => { f.ai = { ...(f.ai ?? { level: 'light' }), enabled: el.checked }; root.querySelector('#sp-ailevel').disabled = !el.checked; refreshLint(); });
      on(root, 'change', '#sp-ailevel', (e, el) => { f.ai = { ...(f.ai ?? {}), level: el.value }; refreshLint(); });
      on(root, 'change', '[data-ev]', (e, el) => {
        const set = new Set(f.evidence ?? []);
        el.checked ? set.add(el.dataset.ev) : set.delete(el.dataset.ev);
        f.evidence = [...set];
        refreshLint();
      });
      on(root, 'click', '#submitSpec', async (e, el) => {
        const lint = lintSpec(f);
        el.disabled = true;
        if (lint.blockers.length) { await ctx.act(() => gradeSpec(ctx, f)); toast('Blocked: fix the generic parts first. Blocked specs cost no time.', 'warn'); return; }
        el.textContent = 'Reviewer is reading…';
        await ctx.act(() => gradeSpec(ctx, f), { hours: specHours(f), label: 'Feature spec' });
        if (f.grade?.pass) toast('Spec passed review. Add it to the build queue.', 'good');
      });
      on(root, 'click', '#queueSpec', () => ctx.act((st) => { queueFeature(st, f); toast(`Queued: ~${f.agentHours} h with agents.`, 'good'); }));
      on(root, 'click', '#unqueue', () => ctx.act((st) => { const sl = productSlice(st); sl.buildQueue = sl.buildQueue.filter((x) => x !== f.id); f.status = 'draft'; }));
      on(root, 'click', '#deleteSpec', () => { if (confirm('Delete this spec?')) ctx.act((st) => { const sl = productSlice(st); sl.features = sl.features.filter((x) => x.id !== f.id); ctx.navigate('product', 'board'); }); });
    }

    on(root, 'submit', '#sessionForm', async (e) => {
      e.preventDefault();
      const { hours, target } = formData(e.target);
      const h = Math.max(0.5, Math.min(12, Number(hours) || 0));
      const sl = productSlice(s);
      if (target === 'queue' && !sl.buildQueue.length) return toast('The build queue is empty.', 'warn');
      if (target === 'bugs' && !sl.bugs.some((b) => !b.fixedDay)) return toast('No open bugs.', 'warn');
      await ctx.act((st) => {
        const r = build(st, h, { founder: true, bugShare: target === 'bugs' ? 1 : 0 });
        toast(`${h} h → ${r.eff.toFixed(1)} effective hours. ${r.shipped.length ? `Shipped ${r.shipped.map((x) => x.title).join(', ')}!` : ''}${r.fixed.length ? ` Fixed ${r.fixed.length} bug(s).` : ''}`, r.shipped.length ? 'good' : 'info');
      }, { hours: h, label: 'Build session' });
    });
    on(root, 'click', '[data-up],[data-down]', (e, el) => ctx.act((st) => {
      const q = productSlice(st).buildQueue;
      const id2 = el.dataset.up ?? el.dataset.down;
      const i = q.indexOf(id2), j = el.dataset.up ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= q.length) return;
      [q[i], q[j]] = [q[j], q[i]];
    }));
    on(root, 'change', '#bugShare', (e, el) => ctx.act((st) => { productSlice(st).bugShare = Number(el.value); }));
  },

  onDay(state) {
    const slice = productSlice(state);
    const team = devHoursPerWeek(state);
    if (team > 0 && (slice.buildQueue.length || slice.bugs.some((b) => !b.fixedDay))) build(state, team / 7);
    ensureMarket(state);
    setModifier(state, 'churn', 'product-bugs', hasProduct(state) ? round2(bugChurnMultiplier(slice)) : 1);
    const monthly = monthlyInference(slice.features, state.company.model, activeAccounts(state));
    if (monthly > 0) slice.inferenceAccrued = round2(slice.inferenceAccrued + monthly / 30);
  },

  onMonthEnd(state) {
    const slice = productSlice(state);
    if (slice.inferenceAccrued >= 0.01) {
      post(state, { amount: -slice.inferenceAccrued, counterparty: 'Anthropic API', description: 'LLM API usage (AI features in production)', category: 'ai_inference', method: 'card' });
      slice.inferenceMonth = slice.inferenceAccrued;
      slice.inferenceAccrued = 0;
    }
    // Wrapper commoditization: prompt-only AI features can be absorbed by model vendors.
    for (const f of slice.features) {
      if (f.status !== 'shipped' || !f.grade?.thinWrapper || f.commoditized) continue;
      if (chance(state, COMMODITIZE_MONTHLY)) {
        f.commoditized = state.day;
        setModifier(state, 'conversion', `commoditized-${f.id}`, 0.85);
        setModifier(state, 'churn', `commoditized-${f.id}`, 1.15);
        notify(state, `A major AI assistant just shipped a free feature that does what "${f.title}" does. Expect fewer conversions and more cancellations unless you differentiate on data, integrations or workflow.`, { type: 'bad', app: 'product' });
      }
    }
  },
};

export { gradeSpec, queueFeature };
