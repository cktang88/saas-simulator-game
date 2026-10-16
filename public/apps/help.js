// Help: a searchable, categorized reference of everything in the game (data/help-catalog.js): every app and its main
// tabs, what each is for, where it lives (Group → App → Tab), whether it is unlocked yet and, if not, which to-do
// opens it, with "Expand now" to open it early.

import { html, mount, on } from '../core/ui.js';
import { HELP, TOPICS } from '../data/help-catalog.js';
import { appMeta, isAppUnlocked, isTabUnlocked, isTabGated, providersOf, expandKey, nodeStatus, nodeModelOk, isNewApp, CATEGORIES } from '../core/unlocks.js';

const ID = 'help';
const GROUP_ORDER = ['Home', 'Money', 'Sales', 'Growth', 'Product', 'Capital', 'Company'];
let query = '';
let groupFilter = 'all';

const norm = (t) => String(t ?? '').toLowerCase();
const catLabel = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

function unlockInfo(state, key) {
  const prov = providersOf(key).filter((x) => nodeModelOk(state, x));
  const node = prov[0];
  if (!node) return null;
  const st = nodeStatus(state, node);
  return { node, st };
}

function lockLine(state, key) {
  const info = unlockInfo(state, key);
  return html`<div class="help-lock">
    <span class="badge warn">🔒 Not set up yet</span>
    ${info ? html`<span class="small">Opens with the to-do <a href="#/todos">“${info.node.title}”</a> <span class="muted">(${catLabel[info.node.category]}${info.st === 'available' ? ', on your list now' : ', later'})</span></span>` : ''}
    <button class="sm" data-expand-key="${key}">Expand now</button>
  </div>`;
}

export default {
  id: ID,
  title: 'Help',
  icon: '❓',
  group: 'Help',
  render(root, ctx) {
    const s = ctx.state;
    const model = s.company.model;
    const entries = HELP.map((e) => ({ ...e, meta: appMeta(e.app) }))
      .filter((e) => e.app !== ID && e.meta && (!e.meta.models || e.meta.models.includes(model)));
    const groups = [...new Set([...GROUP_ORDER, ...entries.map((e) => e.meta.group)])].filter((g) => entries.some((e) => e.meta.group === g));
    const total = entries.length;
    const unlocked = entries.filter((e) => isAppUnlocked(s, e.app)).length;
    mount(root, html`
      <div class="app-head"><div><h1>Help</h1><p>Everything you can do, where it lives, and what opens it. ${unlocked} of ${total} functions are in your sidebar; the rest open as you reach them in <a href="#/todos">Todos</a>, or now with “Expand now”.</p></div></div>
      <div class="help-search panel">
        <input id="helpQ" type="search" placeholder="Search: e.g. cold email, SOC 2, cohorts, payroll, SEO…" value="${query}" autocomplete="off" />
        <div class="help-chips">${['all', ...groups].map((g) => html`<button class="sm ${groupFilter === g ? 'primary' : ''}" data-group="${g}">${g === 'all' ? 'All' : g}</button>`)}</div>
        <p class="small muted" id="helpCount"></p>
      </div>
      <section class="panel help-group" data-group="Basics">
        <h2>Getting around</h2>
        <ul class="help-feats">${TOPICS.map((t) => html`<li class="help-feat" data-text="${norm(`${t.title} ${t.desc} ${t.keywords}`)}"><b>${t.title}</b><div class="small">${t.desc}</div></li>`)}</ul>
      </section>
      ${groups.map((g) => html`<section class="help-group" data-group="${g}">
        <h3 class="help-group-title">${g}</h3>
        ${entries.filter((e) => e.meta.group === g).map((e) => {
          const open = isAppUnlocked(s, e.app);
          const appText = norm(`${e.meta.title} ${e.meta.group} ${e.summary} ${e.keywords}`);
          return html`<article class="panel help-app ${open ? '' : 'locked'}" data-app="${e.app}" data-text="${appText}">
            <div class="help-app-head">
              <h2>${e.meta.icon} <a href="#/${e.app}">${e.meta.title}</a></h2>
              ${open ? (isNewApp(s, e.app) ? html`<span class="badge accent">New</span>` : html`<span class="badge good">In sidebar</span>`) : ''}
              <span class="small muted">${e.meta.group} → ${e.meta.title}</span>
            </div>
            <p>${e.summary}</p>
            ${open ? '' : lockLine(s, e.app)}
            ${e.features.length ? html`<ul class="help-feats">${e.features.map((f) => {
              const key = f.tab ? `${e.app}/${f.tab}` : null;
              const gated = key && isTabGated(key);
              const fOpen = open && (!gated || isTabUnlocked(s, key));
              const link = `#/${e.app}${f.route ? `/${f.route}` : ''}`;
              return html`<li class="help-feat ${fOpen ? '' : 'locked'}" data-text="${norm(`${f.title} ${f.desc} ${f.keywords ?? ''}`)}">
                <div class="help-feat-head"><b><a href="${link}">${f.title}</a></b> <span class="small muted">${e.meta.group} → ${e.meta.title}${f.route || f.tab ? html` → ${f.title}` : ''}</span></div>
                <div class="small">${f.desc}</div>
                ${open && gated && !fOpen ? lockLine(s, key) : ''}
              </li>`;
            })}</ul>` : ''}
          </article>`;
        })}
      </section>`)}
      <p class="empty" id="helpNone" hidden>Nothing matches. Try a broader word (e.g. “email”, “tax”, “hire”).</p>`);

    const apply = () => {
      const words = norm(query).split(/\s+/).filter(Boolean);
      const match = (t) => words.every((w) => t.includes(w));
      let shown = 0;
      for (const sec of root.querySelectorAll('.help-group')) {
        const gOk = groupFilter === 'all' || sec.dataset.group === groupFilter || (sec.dataset.group === 'Basics' && !words.length && groupFilter === 'all');
        let any = false;
        const cards = sec.querySelectorAll('.help-app');
        if (!cards.length) {
          for (const li of sec.querySelectorAll('.help-feat')) { const ok = gOk && match(li.dataset.text); li.hidden = !ok; any ||= ok; }
        }
        for (const card of cards) {
          const appOk = match(card.dataset.text);
          let featAny = false;
          for (const li of card.querySelectorAll('.help-feat')) { const ok = appOk || match(li.dataset.text); li.hidden = !ok; featAny ||= ok; }
          const ok = gOk && (appOk || featAny);
          card.hidden = !ok;
          if (ok) { any = true; shown++; }
        }
        sec.hidden = !any;
      }
      root.querySelector('#helpCount').textContent = words.length || groupFilter !== 'all' ? `${shown} function${shown === 1 ? '' : 's'} match` : `${shown} functions · type to filter titles, descriptions and keywords`;
      root.querySelector('#helpNone').hidden = shown > 0 || !words.length;
    };
    apply();
    on(root, 'input', '#helpQ', (e, el) => { query = el.value; apply(); });
    on(root, 'click', '[data-group]', (e, el) => { if (el.tagName !== 'BUTTON') return; groupFilter = el.dataset.group; ctx.render(); });
    on(root, 'click', '[data-expand-key]', (e, el) => ctx.act((st) => { expandKey(st, el.dataset.expandKey); }));
  },
};
