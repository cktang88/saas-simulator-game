// Assistant: the founder's own AI assistant (Claude / ChatGPT Work style). Connectors with read/draft/write scopes
// that expire, projects with standing instructions, a chat that answers questions about the business with source
// chips you can check, scheduled tasks with approval modes, and a run log. Engine: assistant/engine.js; failure
// model and prices: assistant/model.js. Inbox triage lives in Mail, the weekly plan in Calendar, kill criteria in You.

import { html, mount, on, formData, modal, toast, badge, stat } from '../core/ui.js';
import { fmtDate, money, round2 } from '../core/util.js';
import { adviceFor } from '../core/advice.js';
import {
  ensureAssistant, planOf, choosePlan, usagePct, grantConnector, setScope, revokeConnector, reconnect, connectorStatus,
  createProject, updateProject, createTask, updateTask, runTask, reviewRun, markSeen, verifyFact, correctFact, approveRun,
  approveAction, rejectAction, reviewUnsure, answerQuestion, useChatAnswer, prosePrompt, proseFallback, PROSE_SCHEMA, fmtFact,
  factWrong, statusText, assistantDay, assistantCoaching, assistantSignals,
} from './assistant/engine.js';
import { PLANS, CONNECTORS, TEMPLATES, SCHEDULES, MODES, HOURS, gradeInstructions, EXTRA_USAGE_USD_PER_UNIT } from './assistant/model.js';
import './assistant/operators.js';

// Usage telemetry is fact; what to do about it comes only from a recruited source (or learning mode).
function coachNotes(s) {
  const notes = assistantCoaching(s);
  const items = adviceFor(s, 'automation_ai', notes.map((n) => n.advice).filter(Boolean), { kind: 'coaching' });
  return html`${notes.map((n) => html`<div class="callout ${n.tone}">${n.text}</div>`)}${items.map((i) => html`<div class="callout small">${i.text} <span class="muted">(${i.from})</span></div>`)}`;
}
import { bizBlock } from './context.js';

const chatDraft = { text: '', projectId: '' };
const STATUS_TONE = { ok: 'good', auth_expired: 'bad', over_budget: 'warn', no_plan: 'warn', failed: 'bad' };

// The assistant knows the business (ICP, path, team, shipped work) but its numbers come only from connector facts,
// which can be stale, truncated or unavailable: true metrics in the context made it "correct" or contradict them.
const ASSISTANT_CONTEXT = (state) => bizBlock(state, 'insider', { metrics: false });

/** Write the chat answer for a question already answered by answerQuestion (facts claimed). Mutates the message. */
export async function chatProse(ctx, st, m, q, { instructions = '' } = {}) {
  const pr = prosePrompt(st, m.facts, { question: q, instructions });
  const res = await ctx.llm.ask({ task: 'assistant_chat', context: ASSISTANT_CONTEXT(st), system: pr.system, prompt: pr.prompt, schema: PROSE_SCHEMA, temperature: 0.3, maxTokens: 400, fallback: () => ({ text: proseFallback(st, m.facts, { question: q }) }) });
  m.text = String(res.data?.text ?? '').slice(0, 2000);
  m.mock = res.mock;
  return res;
}

async function proseJob(ctx, { runId }) {
  const s = ctx.state;
  const A = ensureAssistant(s);
  const run = A.runs.find((r) => r.id === runId);
  if (!run || run.status !== 'ok') return;
  const task = A.tasks.find((t) => t.id === run.taskId);
  const project = A.projects.find((p) => p.id === task?.projectId);
  const pr = prosePrompt(s, run.facts, { template: run.templateId, instructions: project?.instructions ?? '' });
  const res = await ctx.llm.ask({ task: 'assistant_run', context: ASSISTANT_CONTEXT(ctx.state), system: pr.system, prompt: pr.prompt, schema: PROSE_SCHEMA, temperature: 0.3, maxTokens: 450, fallback: () => ({ text: proseFallback(s, run.facts, { template: run.templateId }) }) });
  run.prose = String(res.data?.text ?? '').slice(0, 3000);
  run.mock = res.mock;
}

function chips(holderKey, facts) {
  return html`<div class="inline" style="gap:6px;margin-top:6px">${facts.map((f, i) => {
    if (f.status === 'unavailable') return html`<span class="badge warn" title="${f.reason}">${f.label}: no access</span>`;
    if (f.status === 'unsourced') return html`<span class="badge" title="No source row: the assistant stated this without reading a source">${f.label}: ${fmtFact(f.kind, f.claimed)}</span>`;
    return html`<button class="sm" data-verify="${holderKey}:${i}" title="Open the source and compare">${f.verified ? (factWrong(f) ? '✗ ' : '✓ ') : '🔗 '}${f.label}: ${fmtFact(f.kind, f.claimed)} · ${CONNECTORS[f.connector].label}</button>`;
  })}</div>`;
}

export default {
  id: 'assistant',
  title: 'Assistant',
  icon: '🤖',
  group: 'Home',
  badge: (state) => {
    const A = state.apps.assistant;
    if (!A) return null;
    return A.runs.filter((r) => !r.seen && (r.status !== 'ok' || r.actions.some((a) => a.status === 'pending'))).length || null;
  },
  jobs: { 'assistant:prose': proseJob },
  onDay: assistantDay,
  render(root, ctx) {
    const s = ctx.state;
    const A = ensureAssistant(s);
    const [tab0, arg] = (ctx.params || 'chat').split(':');
    const tab = tab0 || 'chat';
    const plan = planOf(s);
    const tabs = [['chat', 'Chat'], ['connectors', 'Connectors'], ['projects', 'Projects'], ['tasks', 'Tasks'], ['runs', `Run log${A.runs.some((r) => !r.seen) ? ` (${A.runs.filter((r) => !r.seen).length})` : ''}`], ['plan', 'Plan & usage']];
    const run = tab === 'run' ? A.runs.find((r) => r.id === arg) : null;
    mount(root, html`
      <div class="app-head"><div><h1>Assistant</h1><p>Your own AI assistant with connectors to your apps. It reads fast and writes confidently, and it is sometimes wrong: lists get cut at a page, auth expires silently, it guesses when it has no source, and text inside an email or web page can steer it. Check the sources, and keep writes on approval.</p></div>
        <div class="app-actions">${plan ? html`<span class="badge accent">${plan.name}</span> <span class="small muted">${Math.round(usagePct(s) * 100)}% of weekly usage</span>` : html`<a class="btn primary" href="#/assistant/plan">Pick a plan</a>`}</div></div>
      <div class="tabs">${tabs.map(([k, l]) => html`<a href="#/assistant/${k}" class="${k === tab || (tab === 'run' && k === 'runs') ? 'active' : ''}">${l}</a>`)}</div>
      ${tab === 'chat' ? renderChat(s, A) : ''}
      ${tab === 'connectors' ? renderConnectors(s, A) : ''}
      ${tab === 'projects' ? renderProjects(s, A) : ''}
      ${tab === 'tasks' ? renderTasks(s, A) : ''}
      ${tab === 'runs' ? renderRuns(s, A) : ''}
      ${tab === 'run' ? (run ? renderRun(s, A, run) : html`<p class="empty">Run not found.</p>`) : ''}
      ${tab === 'plan' ? renderPlan(s, A) : ''}`);

    const holderIn = (st, key) => { const [kind, id] = key.split('|'); const AA = ensureAssistant(st); return kind === 'chat' ? AA.chat.find((m) => m.id === id) : AA.runs.find((x) => x.id === id); };
    on(root, 'click', '[data-verify]', (e, el) => {
      const v = el.dataset.verify;
      const hk = v.slice(0, v.lastIndexOf(':'));
      const idx = Number(v.slice(v.lastIndexOf(':') + 1));
      const already = holderIn(s, hk)?.facts?.[idx]?.verified;
      let r = null;
      ctx.act((st) => { r = verifyFact(st, holderIn(st, hk), idx); }, { hours: already ? 0 : HOURS.verify, label: 'Checking an AI number against the source' }).then(() => {
        if (!r) return;
        const f = holderIn(ctx.state, hk).facts[idx];
        modal({
          title: `Source check: ${f.label}`,
          body: html`<p>Assistant said <b>${r.claimed}</b>. ${CONNECTORS[f.connector].label} says <b>${r.truth}</b>${r.rowsTotal ? html` (${r.rowsTotal} rows; the assistant read ${r.rowsRead})` : ''}.</p>
            ${r.wrong ? html`<div class="callout bad">They do not match${r.status === 'truncated' ? ': the connector returned only the first page' : r.status === 'misread' ? ': the assistant misread the source' : ''}. Correct it before you use this.</div>` : html`<div class="callout good">Matches the source.</div>`}
            <p class="small muted">Values are as of the day of the answer. <a href="#/${f.route}">Open ${CONNECTORS[f.connector].label}</a></p>`,
          actions: [{ label: 'Close' }, ...(r.wrong && !f.corrected ? [{ label: 'Correct it', primary: true, onClick: () => { ctx.act((st) => correctFact(st, holderIn(st, hk), idx)); } }] : [])],
        });
      });
    });

    // Chat
    on(root, 'input', '#chatQ', (e) => { chatDraft.text = e.target.value; });
    on(root, 'change', '#chatProject', (e) => { chatDraft.projectId = e.target.value; });
    on(root, 'submit', '#chatForm', (e) => {
      e.preventDefault();
      const q = String(formData(e.target).q ?? '').trim();
      if (!q) return;
      const projectId = chatDraft.projectId || null;
      ctx.act(async (st) => {
        const m = answerQuestion(st, q, { projectId });
        chatDraft.text = '';
        const project = ensureAssistant(st).projects.find((p) => p.id === projectId);
        await chatProse(ctx, st, m, q, { instructions: project?.instructions ?? '' });
      }, { hours: HOURS.chat, label: 'AI assistant chat' });
    });
    on(root, 'click', '[data-use-chat]', (e, el) => ctx.act((st) => useChatAnswer(st, el.dataset.useChat)));

    // Connectors
    on(root, 'click', '[data-connect]', (e, el) => {
      const scope = root.querySelector(`[data-scope="${el.dataset.connect}"]`)?.value ?? 'read';
      ctx.act((st) => grantConnector(st, el.dataset.connect, scope), { hours: HOURS.connector, label: 'Assistant connector setup' });
    });
    on(root, 'change', '[data-scope]', (e, el) => { if (connectorStatus(s, el.dataset.scope) !== 'off') ctx.act((st) => setScope(st, el.dataset.scope, el.value)); });
    on(root, 'click', '[data-reconnect]', (e, el) => ctx.act((st) => reconnect(st, el.dataset.reconnect), { hours: HOURS.reconnect, label: 'Assistant connector setup' }));
    on(root, 'click', '[data-revoke]', (e, el) => ctx.act((st) => revokeConnector(st, el.dataset.revoke)));

    // Projects
    on(root, 'submit', '#projForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => { const p = createProject(st, f); const g = gradeInstructions(p.instructions); if (!g.good) toast(`Saved. Instructions could also say: ${g.missing.slice(0, 3).join('; ')}.`, 'info'); }, { hours: HOURS.project, label: 'Assistant project setup' });
    });
    on(root, 'submit', '[data-proj-edit]', (e, el) => {
      e.preventDefault();
      const f = formData(el);
      ctx.act((st) => updateProject(st, el.dataset.projEdit, { instructions: f.instructions }), { hours: 0.1, label: 'Assistant project setup' });
    });

    // Tasks
    on(root, 'submit', '#taskForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => {
        const t = createTask(st, { name: f.name, templateId: f.templateId === 'free' ? null : f.templateId, text: f.text, projectId: f.projectId || null, mode: f.mode, schedule: f.schedule });
        if (t.schedule === 'once') { const r = runTask(st, t, { manual: true }); ctx.navigate('assistant', `run:${r.id}`); }
      }, { hours: HOURS.task, label: 'Assistant task setup' });
    });
    on(root, 'change', '[data-task-mode]', (e, el) => ctx.act((st) => updateTask(st, el.dataset.taskMode, { mode: el.value })));
    on(root, 'click', '[data-task-toggle]', (e, el) => ctx.act((st) => { const t = ensureAssistant(st).tasks.find((x) => x.id === el.dataset.taskToggle); updateTask(st, t.id, { on: !t.on }); }));
    on(root, 'click', '[data-task-run]', (e, el) => ctx.act((st) => { const t = ensureAssistant(st).tasks.find((x) => x.id === el.dataset.taskRun); const r = runTask(st, t, { manual: true }); ctx.navigate('assistant', `run:${r.id}`); }));

    // Runs
    on(root, 'click', '[data-open-run]', (e, el) => {
      const r = A.runs.find((x) => x.id === el.dataset.openRun);
      const h = r && r.status === 'ok' && !r.reviewed ? HOURS.review : 0;
      ctx.act((st) => { if (h) reviewRun(st, r.id); else markSeen(st, r.id); ctx.navigate('assistant', `run:${r.id}`); }, { hours: h, label: 'Reviewing an assistant run' });
    });
    on(root, 'click', '[data-approve-run]', (e, el) => ctx.act((st) => approveRun(st, el.dataset.approveRun)));
    on(root, 'click', '[data-act-ok]', (e, el) => { const [rid, aid] = el.dataset.actOk.split('|'); ctx.act((st) => approveAction(st, rid, aid)); });
    on(root, 'click', '[data-act-no]', (e, el) => { const [rid, aid] = el.dataset.actNo.split('|'); ctx.act((st) => rejectAction(st, rid, aid), { hours: HOURS.reject, label: 'Reviewing an assistant run' }); });
    on(root, 'click', '[data-act-unsure]', (e, el) => { const [rid, aid] = el.dataset.actUnsure.split('|'); ctx.act((st) => reviewUnsure(st, rid, aid), { hours: 0.1, label: 'Reviewing an assistant run' }); });

    // Plan
    on(root, 'click', '[data-plan]', (e, el) => ctx.act((st) => choosePlan(st, el.dataset.plan || null), { hours: el.dataset.plan && !A.plan ? HOURS.plan : 0, label: 'Assistant plan setup' }));
    on(root, 'change', '#extraUsage', (e) => ctx.act((st) => { ensureAssistant(st).extraUsage = e.target.checked; }));
  },
};

function renderChat(s, A) {
  const msgs = A.chat.slice(-20).reverse();
  return html`<div class="grid-2" style="grid-template-columns: minmax(0, 2fr) minmax(0, 1fr)">
    <section class="panel">
      <form id="chatForm"><label>Ask about the business <textarea id="chatQ" name="q" rows="2" placeholder="What's our MRR and runway? Which customer emails need a reply?">${chatDraft.text}</textarea></label>
        <div class="inline"><label>Project <select id="chatProject" name="projectId"><option value="">No project</option>${A.projects.map((p) => html`<option value="${p.id}" ${chatDraft.projectId === p.id ? 'selected' : ''}>${p.name}</option>`)}</select></label>
        <button class="primary">Ask</button><span class="hint">~3 min. Uses your plan's allowance.</span></div></form>
      ${msgs.length ? msgs.map((m) => html`<div class="panel" style="margin-top:10px">
        <div class="small muted">${fmtDate(s, m.day)} · you asked</div><p><b>${m.question}</b></p>
        <p>${m.text ?? html`<span class="muted">Thinking…</span>`} ${m.mock ? html`<span class="badge">offline</span>` : ''}</p>
        ${chips(`chat|${m.id}`, m.facts)}
        <div class="inline" style="margin-top:6px">${m.used ? badge('used in a decision', 'accent') : html`<button class="sm" data-use-chat="${m.id}">Use this answer</button>`}<span class="hint">Numbers without a 🔗 chip have no source row.</span></div>
      </div>`) : html`<p class="empty">No questions yet. Connect a few apps first (Connectors), then ask.</p>`}
    </section>
    <section class="panel"><h2>How to use it well</h2>
      <ul class="list small">
        <li>Source chips show where each number came from.</li>
        <li>Projects hold standing instructions the assistant follows on every run.</li>
      </ul>
      ${coachNotes(s)}
    </section></div>`;
}

function renderConnectors(s, A) {
  return html`<section class="panel"><h2>Connectors</h2>
    <p class="small muted">Each connector is an OAuth grant with a scope. Read lets it look; draft lets it prepare (emails sit in drafts); write lets it act as you. Grants expire without warning; scheduled runs that need an expired grant fail silently and only show in the run log. Mail, Helpdesk and the web contain text written by outsiders.</p>
    <div class="table-wrap"><table><thead><tr><th>Source</th><th>Status</th><th>Scope</th><th>Authorized</th><th></th></tr></thead><tbody>
    ${Object.entries(CONNECTORS).map(([id, c]) => { const g = A.connectors[id]; const st = connectorStatus(s, id); return html`<tr>
      <td><b>${c.label}</b>${c.untrusted ? html` ${badge('untrusted content', 'warn')}` : ''}<div class="small muted">${c.writeDesc ? `write = ${c.writeDesc}` : 'read only'}</div></td>
      <td>${st === 'ok' ? badge('connected', 'good') : st === 'expired' ? badge('connected', 'good') : badge('off')}</td>
      <td><select data-scope="${id}">${c.scopes.map((sc) => html`<option value="${sc}" ${g?.scope === sc ? 'selected' : ''}>${sc}</option>`)}</select></td>
      <td class="small">${g?.on ? `on ${fmtDate(s, g.authDay)}` : '—'}</td>
      <td style="white-space:nowrap">${g?.on ? html`<button class="sm" data-reconnect="${id}">Re-authorize</button> <button class="sm" data-revoke="${id}">Disconnect</button>` : html`<button class="sm primary" data-connect="${id}">Connect</button>`}</td></tr>`; })}
    </tbody></table></div>
    <p class="hint">Like the real apps, the list shows a grant as connected until something fails. Check failed runs in the run log.</p></section>`;
}

function renderProjects(s, A) {
  return html`<div class="grid-2">
    <section class="panel"><h2>New project</h2>
      <form id="projForm"><label>Name <input name="name" required placeholder="Weekly ops" /></label>
        <label>Standing instructions <textarea name="instructions" rows="6" placeholder="Who reads it, the metrics you always want, thresholds to flag, the format, cite a source for every number, say unknown instead of guessing."></textarea></label>
        <button class="primary">Create project</button> <span class="hint">~15 min</span></form></section>
    <section class="panel"><h2>Projects</h2>${A.projects.length ? A.projects.map((p) => { const g = gradeInstructions(p.instructions); return html`<form data-proj-edit="${p.id}" style="margin-bottom:12px"><b>${p.name}</b> <span class="small muted">since ${fmtDate(s, p.createdDay)}</span>
      <textarea name="instructions" rows="4">${p.instructions}</textarea>
      <div class="inline"><button class="sm">Save instructions</button>${g.good ? badge('specific', 'good') : html`<span class="hint">Could add: ${g.missing.slice(0, 3).join('; ')}</span>`}</div></form>`; }) : html`<p class="empty">No projects yet.</p>`}</section></div>`;
}

function renderTasks(s, A) {
  return html`<div class="grid-2">
    <section class="panel"><h2>New task</h2>
      <form id="taskForm">
        <label>Template <select name="templateId">${Object.entries(TEMPLATES).map(([k, t]) => html`<option value="${k}">${t.label} (needs ${t.connectors.map((c) => CONNECTORS[c].label).join(', ')})</option>`)}<option value="free">Free text…</option></select></label>
        <label>Name (optional) <input name="name" /></label>
        <label>Or describe it <textarea name="text" rows="2" placeholder="Every Monday, summarise signups, MRR and churn vs last week; flag anything over 15%."></textarea></label>
        <div class="grid-3"><label>Project <select name="projectId"><option value="">None</option>${A.projects.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select></label>
          <label>Approval mode <select name="mode">${Object.entries(MODES).map(([k, l]) => html`<option value="${k}" ${k === 'ask' ? 'selected' : ''}>${l}</option>`)}</select></label>
          <label>Schedule <select name="schedule">${Object.entries(SCHEDULES).map(([k, l]) => html`<option value="${k}" ${k === 'weekly' ? 'selected' : ''}>${l}</option>`)}</select></label></div>
        <button class="primary">Create task</button> <span class="hint">~10 min. Writes need a connector with write scope.</span></form></section>
    <section class="panel"><h2>Tasks</h2>${A.tasks.length ? html`<div class="table-wrap"><table><thead><tr><th>Task</th><th>Mode</th><th>Schedule</th><th></th></tr></thead><tbody>
      ${A.tasks.map((t) => html`<tr><td><b>${t.name}</b><div class="small muted">${TEMPLATES[t.templateId].label}${t.lastRunDay != null ? ` · last run ${fmtDate(s, t.lastRunDay)}` : ''}</div></td>
        <td><select data-task-mode="${t.id}">${Object.entries(MODES).map(([k, l]) => html`<option value="${k}" ${t.mode === k ? 'selected' : ''}>${l}</option>`)}</select></td>
        <td class="small">${SCHEDULES[t.schedule]} ${t.schedule !== 'once' ? (t.on ? badge('on', 'good') : badge('paused')) : ''}</td>
        <td style="white-space:nowrap"><button class="sm" data-task-run="${t.id}">Run now</button> ${t.schedule !== 'once' ? html`<button class="sm" data-task-toggle="${t.id}">${t.on ? 'Pause' : 'Resume'}</button>` : ''}</td></tr>`)}
    </tbody></table></div>` : html`<p class="empty">No tasks yet.</p>`}</section></div>`;
}

function renderRuns(s, A) {
  return html`<section class="panel"><h2>Run log</h2>
    <p class="small muted">Every scheduled and manual run. Failed runs do not notify you; this list is the only place they show.</p>
    ${A.runs.length ? html`<div class="table-wrap"><table><thead><tr><th>Day</th><th>Task</th><th>Status</th><th>Output</th><th></th></tr></thead><tbody>
      ${A.runs.slice(0, 60).map((r) => html`<tr><td class="small">${fmtDate(s, r.day)}</td><td>${r.seen ? '' : '● '}${r.name}<div class="small muted">${MODES[r.mode]}</div></td>
        <td>${badge(r.status === 'ok' ? 'finished' : statusText(r.status), STATUS_TONE[r.status])}</td>
        <td class="small">${r.status === 'ok' ? html`${r.used ? badge(r.autoUsed ? 'used automatically' : 'approved', 'accent') : r.reviewed ? 'reviewed' : 'not reviewed'} ${r.actions.filter((a) => a.status === 'pending').length ? badge(`${r.actions.filter((a) => a.status === 'pending').length} to approve`, 'warn') : ''}` : ''}</td>
        <td><button class="sm" data-open-run="${r.id}">Open</button></td></tr>`)}
    </tbody></table></div>` : html`<p class="empty">No runs yet.</p>`}</section>`;
}

function renderRun(s, A, r) {
  const tpl = TEMPLATES[r.templateId];
  const conns = [...new Set(r.facts.map((f) => f.connector))];
  return html`<div class="app-actions" style="margin-bottom:8px"><a class="btn" href="#/assistant/runs">← Run log</a></div>
    ${r.status !== 'ok' ? html`<div class="callout bad">This run did not finish: ${statusText(r.status)}. ${r.status === 'auth_expired' ? 'Re-authorize the connector (Connectors tab).' : r.status === 'over_budget' ? 'Wait for Monday, upgrade, or turn on extra usage.' : ''}</div>` : html`
    <div class="grid-3" style="grid-template-columns: minmax(0,1fr) minmax(0,2fr) minmax(0,1fr)">
      <section class="panel"><h2>Plan & tool calls</h2><ul class="list small">
        ${conns.map((c) => { const fs = r.facts.filter((f) => f.connector === c); const rows = Math.max(...fs.map((f) => f.rowsRead ?? 0)); const total = Math.max(...fs.map((f) => f.rowsTotal ?? 0)); return html`<li>${CONNECTORS[c].label}: ${fs.every((f) => f.status === 'unavailable') ? 'not available' : total ? `read ${rows} rows` : 'read'}</li>`; })}
        <li>Wrote: ${tpl.label}</li></ul></section>
      <section class="panel"><h2>${r.name} <span class="small muted">${fmtDate(s, r.day)}</span></h2>
        <p>${r.prose ?? html`<span class="muted">Writing…</span>`} ${r.mock ? html`<span class="badge">offline</span>` : ''}</p>
        ${chips(`run|${r.id}`, r.facts)}
        <div class="inline" style="margin-top:10px">${r.used ? badge(r.autoUsed ? 'used automatically (auto mode)' : 'approved', 'accent') : html`<button class="primary" data-approve-run="${r.id}">Approve and use</button>`}
          <span class="hint">${tpl.use} Approving puts these numbers into your decisions.</span></div></section>
      <section class="panel"><h2>Uncertain items</h2>
        ${r.notes.map((n) => html`<div class="callout warn small">${n}</div>`)}
        ${r.injection ? html`<div class="callout bad small">Read content from ${r.injection} that contained instructions addressed to an AI assistant.</div>` : ''}
        ${r.actions.length ? r.actions.map((a) => html`<div class="callout ${a.status === 'pending' ? 'warn' : a.status === 'executed' && (a.malicious || a.badClaim || a.wrongRecipient) ? 'bad' : ''} small">
          <b>${a.desc}</b><div>${badge(a.status)}${a.type === 'recategorize' && a.status === 'pending' && !a.reviewedUnsure ? html` <button class="sm" data-act-unsure="${r.id}|${a.id}">Review ${a.flagged} unsure rows</button>` : ''}</div>
          ${a.status === 'pending' ? html`<div class="inline"><button class="sm primary" data-act-ok="${r.id}|${a.id}">Approve</button><button class="sm" data-act-no="${r.id}|${a.id}">Reject</button></div>` : ''}</div>`) : html`<p class="muted small">No actions proposed.</p>`}
      </section></div>`}`;
}

function renderPlan(s, A) {
  const sig = assistantSignals(s);
  return html`<div class="stats">
      ${stat('Weekly usage', `${Math.round(usagePct(s) * 100)}%`, planOf(s) ? `${planOf(s).name}; resets Monday` : 'no plan')}
      ${stat('Hours saved (on paper)', `${round2(A.stats.savedHours)}h`, `review ${round2(A.stats.reviewHours)}h`)}
      ${stat('Sources checked', sig?.verified ?? 0, sig?.verifyRate != null ? `${Math.round(sig.verifyRate * 100)}% of numbers you looked at` : '')}
      ${stat('Incidents (90 days)', sig?.incidents ?? 0, '', sig?.incidents ? 'bad' : '')}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Plan</h2>
        <div class="table-wrap"><table><tbody>${Object.entries(PLANS).map(([id, p]) => html`<tr><td><b>${p.name}</b><div class="small muted">${p.note}</div></td><td class="r">${money(p.price)}/mo</td>
          <td>${A.plan === id ? badge('current', 'good') : html`<button class="sm" data-plan="${id}">Choose</button>`}</td></tr>`)}</tbody></table></div>
        ${A.plan ? html`<button class="sm" data-plan="">Cancel plan</button>` : ''}
        <label style="margin-top:10px"><input type="checkbox" id="extraUsage" ${A.extraUsage ? 'checked' : ''} /> Extra usage when the weekly allowance runs out (~${money(EXTRA_USAGE_USD_PER_UNIT, { cents: true })} per request, billed monthly) [game estimate]</label>
        <p class="hint">Vendors publish no task accuracy and no rate card for scheduled runs; a heavy week can run out mid-week.</p></section>
      <section class="panel"><h2>What your use says</h2>${coachNotes(s)}
        ${A.incidents.length ? html`<h3>Incidents</h3><ul class="list small">${A.incidents.slice(0, 8).map((x) => html`<li>${fmtDate(s, x.day)} · ${x.text}</li>`)}</ul>` : ''}</section>
    </div>`;
}
