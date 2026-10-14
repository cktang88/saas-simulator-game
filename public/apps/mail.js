// Founder inbox. Replies to prospects, investors, candidates etc. are answered by the owning app's
// job handler `reply:<kind>` (an LLM playing that person), so a conversation can continue for real.

import { html, mount, on, formData } from '../core/ui.js';
import { ensureMail, addMessage } from '../core/mail.js';
import { hasJob } from '../core/jobs.js';
import { fmtDate, words } from '../core/util.js';

export default {
  id: 'mail',
  title: 'Mail',
  icon: '✉️',
  group: 'Home',
  render(root, ctx) {
    const s = ctx.state;
    const box = ensureMail(s);
    const filter = ctx.params.split(':')[0] || 'inbox';
    const openId = ctx.params.split(':')[1];
    const threads = box.threads.filter((t) => (filter === 'archived' ? t.archived : !t.archived) && (filter === 'inbox' || filter === 'archived' || t.kind === filter));
    const open = box.threads.find((t) => t.id === openId);
    if (open && open.unread) { open.unread = false; ctx.save(); }
    const kinds = ['inbox', 'prospect', 'customer', 'investor', 'candidate', 'vendor', 'archived'];
    mount(root, html`
      <div class="app-head"><div><h1>Mail</h1><p>Replies from prospects, customers, investors and candidates land here. Answer them: a fast, specific reply converts far better than a slow one.</p></div></div>
      <div class="tabs">${kinds.map((k) => html`<a href="#/mail/${k}" class="${k === filter ? 'active' : ''}">${k[0].toUpperCase() + k.slice(1)}</a>`)}</div>
      <div class="grid-2" style="grid-template-columns: minmax(240px, 1fr) 2fr">
        <section class="panel" style="padding:0">
          ${threads.length ? html`<ul class="list">${threads.map((t) => html`<li style="padding:10px 14px;cursor:pointer;${t.id === openId ? 'background:var(--accent-soft)' : ''}" data-open="${t.id}">
            <div style="display:flex;justify-content:space-between;gap:6px"><b style="${t.unread ? '' : 'font-weight:500'}">${t.with?.name ?? 'Unknown'}</b><span class="small muted">${fmtDate(s, t.lastDay)}</span></div>
            <div class="small">${t.unread ? '● ' : ''}${t.subject}</div>
            <div class="small muted">${(t.messages.at(-1)?.body ?? '').slice(0, 90)}</div></li>`)}</ul>` : html`<p class="empty" style="padding:14px">No mail.</p>`}
        </section>
        <section class="panel">
          ${open ? html`
            <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><h2 style="margin:0">${open.subject}</h2>
              <p class="small muted">${open.with?.name ?? ''} ${open.with?.email ? html`&lt;${open.with.email}&gt;` : ''} · ${open.kind}</p></div>
              <div><button class="sm" data-archive="${open.id}">${open.archived ? 'Unarchive' : 'Archive'}</button>${open.app ? html` <a class="btn sm" href="#/${open.app}">Open in ${open.app}</a>` : ''}</div></div>
            <div class="chat">${open.messages.map((m) => html`<div class="msg ${m.from}"><div class="small" style="opacity:.75">${m.from === 'me' ? 'You' : open.with?.name} · ${fmtDate(s, m.day)}</div>${m.body}</div>`)}</div>
            ${hasJob(`reply:${open.kind}`) ? html`<form id="replyForm" style="margin-top:10px"><textarea name="body" placeholder="Write your reply…" required></textarea>
              <div class="inline"><button class="primary">Send reply</button><span class="hint">Takes ~${'6–20'} min of your week depending on length.</span></div></form>` : ''}
          ` : html`<p class="empty">Select a conversation.</p>`}
        </section>
      </div>`);
    on(root, 'click', '[data-open]', (e, el) => ctx.navigate('mail', `${filter}:${el.dataset.open}`));
    on(root, 'click', '[data-archive]', (e, el) => ctx.act((st) => { const t = ensureMail(st).threads.find((x) => x.id === el.dataset.archive); t.archived = !t.archived; }));
    on(root, 'submit', '#replyForm', (e) => {
      e.preventDefault();
      const { body } = formData(e.target);
      const hours = Math.min(0.5, 0.1 + words(body) / 400);
      ctx.act((st) => {
        addMessage(st, open.id, { from: 'me', body });
        ctx.enqueue(`reply:${open.kind}`, { threadId: open.id, refId: open.refId }, { label: `Reply from ${open.with?.name}` });
      }, { hours, label: 'Email reply' });
    });
  },
};
