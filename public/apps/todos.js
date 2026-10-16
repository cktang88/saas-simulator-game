// Todos: the founder's to-do tree (core/unlocks.js). Each category lists the to-dos you have reached, with sub-steps
// that tick themselves from real game state. Finishing one reveals the next ones. Nothing opens in the sidebar until
// you press Open / Set it up on a to-do or Open on a "Ready to open" tab. Any open to-do can be skipped for now: it stops blocking what comes after it and
// waits on the Skipped tab. History lists every ticked checkbox with its game date.

import { html, mount, on } from '../core/ui.js';
import { fmtDate } from '../core/util.js';
import {
  ALWAYS_VISIBLE, CATEGORIES, NODES, NODE_BY_ID, ensureProgress, evaluate, nodeStatus, nodeModelOk, stepDone, toggleStep, requestNode, skipNode, unskipNode,
  unseenCount, history, appMeta, appOfKey, isAppUnlocked, markSeen, openOffers, expandKey,
} from '../core/unlocks.js';
import { firstUsersPlan } from './home/first-users.js';

const ID = 'todos';
const RECENT_DAYS = 7;

const opensLabel = (node) => {
  const apps = (node.opens?.apps ?? []).map((a) => appMeta(a)).filter(Boolean);
  const tabs = (node.opens?.tabs ?? []).length;
  const parts = apps.map((m) => `${m.icon} ${m.title} (${m.group})`);
  if (tabs) parts.push(`${tabs} new tab${tabs === 1 ? '' : 's'}`);
  return parts.join(', ');
};

function revealedBy(state, id) {
  const P = ensureProgress(state);
  return NODES.filter((x) => P.avail[x.id]?.by === id && nodeModelOk(state, x));
}

function nodeItem(state, node, { fresh }) {
  const P = ensureProgress(state);
  const steps = node.steps ?? [];
  const goApp = appOfKey(node.go);
  const opened = (node.opens?.apps ?? []).every((a) => isAppUnlocked(state, a)) && (node.opens?.tabs ?? []).every((t) => P.unlocked.tabs[t] != null);
  const needsSetup = !opened;
  return html`<li class="todo ${fresh ? 'is-new' : ''}" id="todo-${node.id}">
    <div class="todo-row">
      <input type="checkbox" class="todo-check" disabled title="Ticks itself when you actually do it" />
      <div class="todo-main">
        <div class="todo-title">${node.title}${fresh ? html` <span class="badge accent">New</span>` : ''}${node.expand ? html` <span class="badge">Set up</span>` : ''}</div>
        <div class="todo-why">${node.why}</div>
        ${steps.length ? html`<ul class="todo-steps">${steps.map((st) => {
          const d = stepDone(state, node, st);
          return html`<li class="${d ? 'done' : ''}"><label><input type="checkbox" data-step="${node.id}/${st.id}" ${d ? 'checked' : ''} ${st.done ? 'disabled' : ''} title="${st.done ? 'Ticks itself when you do it' : 'Tick when done'}" /> ${st.title}${st.optional ? html` <span class="muted small">(optional)</span>` : ''}</label></li>`;
        })}</ul>` : ''}
        <div class="todo-actions">
          ${needsSetup
            ? html`<button class="primary sm" data-expand="${node.id}">${node.expand ? 'Set it up' : 'Open'}</button> <span class="small muted">Opens ${opensLabel(node)}</span>`
            : html`<a class="btn sm" href="#/${node.go}">Go →</a>${node.expand && !steps.length ? html` <span class="small muted">Set up. It is in the sidebar under ${appMeta(goApp)?.group ?? 'Home'}.</span>` : ''}`}
          <button class="sm todo-skip" data-skip="${node.id}" title="Move it to the Skipped tab and unlock what comes after it. It still ticks itself if you do it later.">Skip for now</button>
        </div>
      </div>
    </div>
  </li>`;
}

const keyLabel = (key) => {
  const [a, t] = key.split('/');
  const m = appMeta(a);
  if (!t) return m ? `${m.icon} ${m.title}` : a;
  return `${m?.title ?? a} → ${TAB_LABEL[key] ?? t.replace(/[-_]/g, ' ')} tab`;
};
// Display names for follow-up tabs (the key's last segment otherwise).
const TAB_LABEL = { 'crm/forecast': 'Forecast', 'crm/learning': 'Win/loss learning', 'product/releases': 'Releases', 'product/decisions': 'Decisions', 'product/changelog': 'Changelog', 'fundraising/cap': 'Cap table', 'fundraising/ir': 'Investor updates', 'people/support': 'Support team', 'legal/spend': 'Spend' };

function offersView(state) {
  const offers = openOffers(state);
  if (!offers.length) return '';
  return html`<section class="panel todo-offers"><h2>Ready to open <span class="todo-count">${offers.length}</span></h2>
    <p class="muted small">Finished work made these available. They stay closed until you want them.</p>
    <ul class="list">${offers.map((o) => html`<li><b>${keyLabel(o.key)}</b> <span class="muted small">· after "${NODE_BY_ID[o.by]?.title ?? o.by}"</span> <button class="sm" data-offer="${o.key}">Open</button></li>`)}</ul></section>`;
}

function todosView(state) {
  const P = ensureProgress(state);
  const nodes = NODES.filter((x) => nodeModelOk(state, x));
  const status = Object.fromEntries(nodes.map((x) => [x.id, nodeStatus(state, x)]));
  const doneDay = {};
  for (const d of P.done) if (!d.step && !d.kind && doneDay[d.id] == null) doneDay[d.id] = d.day;
  const isFresh = (x) => P.seen[`node:${x.id}`] == null || (P.avail[x.id]?.day ?? -99) >= state.day - 1;
  const nDone = nodes.filter((x) => status[x.id] === 'done').length;
  const nOpen = nodes.filter((x) => status[x.id] === 'available').length;
  const recent = nodes.filter((x) => status[x.id] === 'done' && doneDay[x.id] >= state.day - RECENT_DAYS).sort((a, b) => doneDay[b.id] - doneDay[a.id]);
  const later = [];
  const sections = CATEGORIES.map((c) => {
    const inCat = nodes.filter((x) => x.category === c.id);
    const open = inCat.filter((x) => status[x.id] === 'available');
    const done = inCat.filter((x) => status[x.id] === 'done');
    const locked = inCat.filter((x) => status[x.id] === 'locked').length;
    if (!open.length && !done.length) { if (locked) later.push({ c, locked }); return ''; }
    return html`<section class="panel todo-cat">
      <h2>${c.icon} ${c.label} <span class="todo-count">${open.length} open · ${done.length} done</span></h2>
      ${open.length ? html`<ul class="todo-list">${open.map((x) => nodeItem(state, x, { fresh: isFresh(x) }))}</ul>` : html`<p class="muted small">Nothing open here right now.</p>`}
      ${done.length ? html`<details class="todo-done"><summary>✓ ${done.length} done</summary><ul>${done.map((x) => {
        const rev = revealedBy(state, x.id);
        return html`<li><span class="todo-tick">✓</span> ${x.title} <span class="muted small">· ${fmtDate(state, doneDay[x.id])}</span>${rev.length ? html` <span class="small muted">→ revealed ${rev.map((r) => r.title).join(', ')}</span>` : ''}</li>`;
      })}</ul></details>` : ''}
      ${locked ? html`<p class="todo-later">🔒 ${locked} more unlock${locked === 1 ? 's' : ''} later</p>` : ''}
    </section>`;
  });
  const fu = firstUsersPlan(state);
  return html`
    ${fu.complete ? '' : html`<div class="callout">Looking for the order to get your first users? <a href="#/home">Home → Get your first users</a> lists the steps (${fu.doneCount}/${fu.total} done)${fu.next ? html`, next: <b>${fu.next.title}</b>` : ''}, with links into each tool.</div>`}
    <div class="stats">
      <div class="stat"><div class="stat-label">Open to-dos</div><div class="stat-value">${nOpen}</div><div class="stat-sub">${nodes.filter((x) => status[x.id] === 'available' && isFresh(x)).length} new</div></div>
      <div class="stat good"><div class="stat-label">Done</div><div class="stat-value">${nDone}</div><div class="stat-sub">of ${nodes.length} in the tree</div></div>
      <div class="stat"><div class="stat-label">Functions in your sidebar</div><div class="stat-value">${Object.keys(P.unlocked.apps).length + ALWAYS_VISIBLE.length}</div><div class="stat-sub">more open when you ask</div></div>
    </div>
    ${recent.length ? html`<section class="panel todo-recent"><h2>Just completed</h2><ul class="list">${recent.map((x) => {
      const rev = revealedBy(state, x.id);
      return html`<li><span class="todo-tick">✓</span> <b>${x.title}</b> <span class="muted small">${fmtDate(state, doneDay[x.id])}</span>
        ${rev.length ? html`<div class="todo-new-line">New: ${rev.map((r) => html`<a class="todo-chip" href="#/todos" data-jump="${r.id}">${r.title}</a>`)}</div>` : ''}</li>`;
    })}</ul></section>` : ''}
    ${offersView(state)}
    ${sections}
    ${later.length ? html`<section class="panel todo-cat todo-locked"><h2>🔒 Later</h2><p class="muted small">These areas open as the company grows. Every function is listed in <a href="#/help">Help</a>, where you can also expand one early.</p>
      <div class="todo-later-grid">${later.map(({ c, locked }) => html`<span class="todo-chip muted">${c.icon} ${c.label} · ${locked}</span>`)}</div></section>` : ''}`;
}

const skippedNodes = (state) => NODES.filter((x) => nodeModelOk(state, x) && nodeStatus(state, x) === 'skipped');

function skippedView(state) {
  const P = ensureProgress(state);
  const rows = skippedNodes(state).sort((a, b) => P.skipped[b.id] - P.skipped[a.id]);
  if (!rows.length) return html`<section class="panel"><p class="empty">Nothing skipped. Any open to-do has a "Skip for now" button: it moves here and stops blocking the to-dos after it.</p></section>`;
  const cat = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  return html`<section class="panel">
    <p class="muted small">Skipping only tidies this list. The work itself is still undone, and the game plays out what that costs (the Scorecard tracks it). Each one still ticks itself if you do it later.</p>
    <ul class="todo-list">${rows.map((x) => html`<li class="todo" id="todo-${x.id}"><div class="todo-row"><div class="todo-main">
      <div class="todo-title">${x.title} <span class="muted small">· ${cat[x.category]?.icon} ${cat[x.category]?.label} · skipped ${fmtDate(state, P.skipped[x.id])}</span></div>
      <div class="todo-why">${x.why}</div>
      <div class="todo-actions"><a class="btn sm" href="#/${x.go}">Go →</a> <button class="sm" data-unskip="${x.id}">Bring back to Todos</button></div>
    </div></div></li>`)}</ul></section>`;
}

function historyView(state) {
  const rows = history(state);
  if (!rows.length) return html`<section class="panel"><p class="empty">Nothing ticked yet. Your first to-dos are on the Todos tab.</p></section>`;
  const cat = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  return html`<section class="panel"><div class="table-wrap"><table class="todo-history">
    <thead><tr><th>Date</th><th>Area</th><th>What</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td class="small">${fmtDate(state, r.day)}</td>
      <td class="small">${cat[r.node.category]?.icon} ${cat[r.node.category]?.label}</td>
      <td>${r.kind === 'request' ? html`<span class="badge accent">Set up</span> ${r.node.title}` : r.kind === 'skip' ? html`<span class="badge">Skipped</span> ${r.node.title}` : r.kind === 'unskip' ? html`<span class="badge">Brought back</span> ${r.node.title}` : r.step ? html`<span class="todo-tick">☑</span> ${r.stepTitle} <span class="muted small">· ${r.node.title}</span>` : html`<span class="badge good">Done</span> <b>${r.node.title}</b>`}</td>
    </tr>`)}</tbody></table></div></section>`;
}

export default {
  id: ID,
  title: 'Todos',
  icon: '✅',
  group: 'Home',
  badge: (state) => unseenCount(state),
  onDay(state) { evaluate(state); },
  render(root, ctx) {
    const s = ctx.state;
    evaluate(s);
    const tab = ['history', 'skipped'].includes(ctx.params) ? ctx.params : 'todos';
    const nHist = history(s).length;
    const nSkip = skippedNodes(s).length;
    mount(root, html`
      <div class="app-head"><div><h1>Todos</h1><p>Your company's to-do tree. Each bullet ticks itself when you actually do it; finishing one reveals what comes next. A business function appears in the sidebar only when you press Open or Set it up.</p></div></div>
      <div class="tabs"><a href="#/todos" class="${tab === 'todos' ? 'active' : ''}">Todos</a><a href="#/todos/skipped" class="${tab === 'skipped' ? 'active' : ''}">Skipped${nSkip ? ` (${nSkip})` : ''}</a><a href="#/todos/history" class="${tab === 'history' ? 'active' : ''}">History${nHist ? ` (${nHist})` : ''}</a></div>
      ${tab === 'history' ? historyView(s) : tab === 'skipped' ? skippedView(s) : todosView(s)}`);
    on(root, 'click', '[data-skip]', (e, el) => ctx.act((st) => { skipNode(st, el.dataset.skip); }));
    on(root, 'click', '[data-unskip]', (e, el) => ctx.act((st) => { unskipNode(st, el.dataset.unskip); }));
    if (tab === 'todos') {
      let changed = false;
      for (const x of NODES) if (ensureProgress(s).avail[x.id] && nodeModelOk(s, x)) changed = markSeen(s, `node:${x.id}`) || changed;
      if (changed) ctx.save();
    }
    on(root, 'change', 'input[data-step]', (e, el) => {
      const [nodeId, stepId] = el.dataset.step.split('/');
      ctx.act((st) => toggleStep(st, nodeId, stepId));
    });
    on(root, 'click', '[data-expand]', (e, el) => ctx.act((st) => { requestNode(st, el.dataset.expand); }));
    on(root, 'click', '[data-offer]', (e, el) => ctx.act((st) => { expandKey(st, el.dataset.offer); }));
    on(root, 'click', '[data-jump]', (e, el) => {
      e.preventDefault();
      const t = root.querySelector(`#todo-${el.dataset.jump}`);
      if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.add('flash'); }
    });
  },
};

export { NODE_BY_ID };
