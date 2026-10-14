// Founder inbox. Replies to prospects, investors, candidates etc. are answered by the owning app's
// job handler `reply:<kind>` (an LLM playing that person), so a conversation can continue for real.
// Split Inbox (rules by sender and thread type), an optional AI triage agent (Superhuman / Lindy style: labels,
// auto-archive, drafts, auto-send), follow-up reminders, snooze and send-later. Engine: assistant/triage.js.

import { html, mount, on, formData, badge, toast } from '../core/ui.js';
import { ensureMail, addMessage } from '../core/mail.js';
import { hasJob } from '../core/jobs.js';
import { fmtDate, words, money } from '../core/util.js';
import { writingHours } from '../core/calendar.js';
import { ensureNetwork } from '../core/network.js';
import {
  ensureInbox, splitOf, SPLITS, AI_LABELS, AGENT_PLANS, TRIAGE, chooseAgentPlan, setAgent, toggleVip, runAudit, reviewArchive,
  setReminder, snooze, queueSendLater, touchThread, sentDraftConsequences, triageDay, inboxSignals, inboxCoaching, payInboundFee,
} from './assistant/triage.js';

const replyDraft = {}; // threadId → { text, fromAi }
let lastAudit = null;
const KINDS = ['prospect', 'customer', 'investor', 'candidate', 'network', 'legal', 'vendor'];

export default {
  id: 'mail',
  title: 'Mail',
  icon: '✉️',
  group: 'Home',
  onDay: triageDay,
  jobs: {
    // Polish a triage draft with the LLM when online; the offline draft (and its rare unsupported claim) stays otherwise.
    'inbox:draft': async (ctx, { threadId }) => {
      const t = ensureMail(ctx.state).threads.find((x) => x.id === threadId);
      if (!t?.aiDraft || t.aiDraft.polished) return;
      const bad = t.aiDraft.badClaim;
      const res = await ctx.llm.ask({
        task: 'inbox_draft',
        system: `You draft a short email reply for the founder of ${ctx.state.company.name} (${ctx.state.company.oneLiner || 'a SaaS'}). 2-4 sentences, plain, no promises about dates, prices or features.`,
        prompt: `Thread "${t.subject}" with ${t.with?.name ?? 'a contact'}:\n${t.messages.slice(-4).map((m) => `${m.from === 'me' ? 'Founder' : t.with?.name}: ${String(m.body).slice(0, 600)}`).join('\n')}\n\nDraft the founder's reply.`,
        schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } },
        temperature: 0.5, maxTokens: 250,
        fallback: () => ({ text: t.aiDraft.text }),
      });
      if (!t.aiDraft) return;
      const text = String(res.data?.text ?? '').slice(0, 1500);
      t.aiDraft = { ...t.aiDraft, text: bad && !text.includes(bad) ? `${text} ${bad}` : text, polished: !res.mock };
    },
  },
  badge: (state) => ensureMail(state).threads.filter((t) => t.unread && !t.archived && t.snoozeUntil == null).length || null,
  render(root, ctx) {
    const s = ctx.state;
    const box = ensureMail(s);
    const X = ensureInbox(s);
    const [f0, openId] = ctx.params.split(':');
    const filter = f0 || 'all';
    const live = (t) => !t.archived && t.snoozeUntil == null;
    const inFilter = (t) => {
      if (filter === 'archived') return t.archived;
      if (filter === 'snoozed') return t.snoozeUntil != null;
      if (filter === 'inbox' || filter === 'all') return live(t);
      if (KINDS.includes(filter)) return live(t) && t.kind === filter;
      return live(t) && splitOf(s, t) === filter;
    };
    const threads = filter === 'triage' ? [] : box.threads.filter(inFilter);
    const open = box.threads.find((t) => t.id === openId);
    if (open && open.unread) { open.unread = false; ctx.save(); }
    const count = (k) => box.threads.filter((t) => live(t) && t.unread && splitOf(s, t) === k).length;
    const tabs = [...Object.entries(SPLITS).map(([k, l]) => [k, `${l}${count(k) ? ` (${count(k)})` : ''}`]), ['all', 'All'], ['snoozed', 'Snoozed'], ['archived', 'Archived'], ['triage', X.agent.on ? 'AI triage ●' : 'AI triage']];
    const lab = (t) => X.labels[t.id];
    const inbOf = (t) => (t.kind === 'network' && t.refId ? ensureNetwork(s).inbound.find((i) => i.id === t.refId) : null);
    const openInb = open ? inbOf(open) : null;
    const rd = open ? (replyDraft[open.id] ??= { text: '', fromAi: false }) : null;
    const pendingReminder = open && X.reminders.find((r) => r.threadId === open.id && r.status === 'pending');
    mount(root, html`
      <div class="app-head"><div><h1>Mail</h1><p>Replies from prospects, customers, investors and candidates land here. Answer the Important split first: a fast, specific reply converts far better than a slow one. Opening and skimming a thread takes a couple of minutes.</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => html`<a href="#/mail/${k}" class="${k === filter || (filter === 'inbox' && k === 'all') ? 'active' : ''}">${l}</a>`)}</div>
      ${filter === 'triage' ? renderTriage(s, X) : html`
      <div class="grid-2" style="grid-template-columns: minmax(240px, 1fr) 2fr">
        <section class="panel" style="padding:0">
          ${threads.length ? html`<ul class="list">${threads.map((t) => html`<li style="padding:10px 14px;cursor:pointer;${t.id === openId ? 'background:var(--accent-soft)' : ''}" data-open="${t.id}">
            <div style="display:flex;justify-content:space-between;gap:6px"><b style="${t.unread ? '' : 'font-weight:500'}">${t.with?.name ?? 'Unknown'}</b><span class="small muted">${fmtDate(s, t.lastDay)}</span></div>
            <div class="small">${t.unread ? '● ' : ''}${t.subject} ${X.agent.on && lab(t)?.ai ? badge(AI_LABELS[lab(t).ai], lab(t).ai === 'cold' ? '' : ['investor', 'customer', 'action'].includes(lab(t).ai) ? 'accent' : '') : ''}${lab(t)?.autoArchived != null ? html` ${badge('auto-archived', 'warn')}` : ''}${t.aiDraft ? html` ${badge('draft ready', 'good')}` : ''}</div>
            <div class="small muted">${(t.messages.at(-1)?.body ?? '').slice(0, 90)}</div></li>`)}</ul>` : html`<p class="empty" style="padding:14px">No mail here.</p>`}
        </section>
        <section class="panel">
          ${open ? html`
            <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><h2 style="margin:0">${open.subject}</h2>
              <p class="small muted">${open.with?.name ?? ''} ${open.with?.email ? html`&lt;${open.with.email}&gt;` : ''} · ${open.kind} · split: ${SPLITS[splitOf(s, open)]}</p></div>
              <div class="inline" style="gap:4px"><button class="sm" data-archive="${open.id}">${open.archived ? 'Unarchive' : 'Archive'}</button>
                <button class="sm" data-vip="${open.id}">${X.vips.includes(String(open.with?.email || open.with?.name || '').toLowerCase()) ? 'Remove VIP' : 'Mark sender VIP'}</button>
                <select data-snooze="${open.id}"><option value="">Snooze…</option><option value="1">1 day</option><option value="3">3 days</option><option value="7">1 week</option></select>
                <select data-remind="${open.id}"><option value="">${pendingReminder ? `Reminder ${fmtDate(s, pendingReminder.dueDay)}` : 'Remind if no reply…'}</option><option value="2">2 days</option><option value="3">3 days</option><option value="5">5 days</option><option value="7">7 days</option></select>
                ${open.app ? html`<a class="btn sm" href="#/${open.app}">Open in ${open.app}</a>` : ''}</div></div>
            <div class="chat">${open.messages.map((m) => html`<div class="msg ${m.from}"><div class="small" style="opacity:.75">${m.from === 'me' ? `You${m.meta?.ai ? ' (AI)' : ''}` : open.with?.name} · ${fmtDate(s, m.day)}</div>${m.body}</div>`)}</div>
            ${openInb?.feeAsk && !openInb.paid ? html`<div class="callout warn small">${open.with?.name} sent an invoice: ${money(openInb.feeAsk.amount)} for a ${openInb.feeAsk.what}. <button class="sm" data-pay="${openInb.id}">Pay ${money(openInb.feeAsk.amount)}</button></div>` : ''}
            ${hasJob(`reply:${open.kind}`) ? html`<form id="replyForm" style="margin-top:10px">
              ${open.aiDraft && !rd.fromAi ? html`<div class="callout small">AI draft ready. <button type="button" class="sm" id="useDraft">Use AI draft</button> <span class="muted">Read every sentence: drafts can promise dates, prices or features nobody agreed.</span></div>` : ''}
              <textarea id="replyBody" name="body" placeholder="Write your reply…" required>${rd.text}</textarea>
              <div class="inline"><button class="primary">Send reply</button><label style="flex:0 0 auto;min-width:0"><input type="checkbox" name="later" /> Send tomorrow morning</label><span class="hint">Takes ~6–20 min depending on length; editing a draft is about half.</span></div></form>` : ''}
          ` : html`<p class="empty">Select a conversation.</p>`}
        </section>
      </div>`}`);
    on(root, 'click', '[data-open]', (e, el) => {
      const t = box.threads.find((x) => x.id === el.dataset.open);
      ctx.act((st) => { touchThread(st, t.id); ctx.navigate('mail', `${filter}:${t.id}`); }, { hours: t?.unread ? TRIAGE.skimHours : 0, label: 'Email skim' });
    });
    on(root, 'click', '[data-archive]', (e, el) => ctx.act((st) => { const t = ensureMail(st).threads.find((x) => x.id === el.dataset.archive); t.archived = !t.archived; if (!t.archived) touchThread(st, t.id); }));
    on(root, 'click', '[data-vip]', (e, el) => ctx.act((st) => { const t = ensureMail(st).threads.find((x) => x.id === el.dataset.vip); toast(toggleVip(st, t.with) ? `${t.with?.name} is now a VIP: their mail lands in Important.` : 'Removed from VIPs.'); }));
    on(root, 'change', '[data-snooze]', (e, el) => { if (el.value) ctx.act((st) => { snooze(st, el.dataset.snooze, Number(el.value)); ctx.navigate('mail', filter); }, { hours: 0.01, label: 'Email triage' }); });
    on(root, 'change', '[data-remind]', (e, el) => { if (el.value) ctx.act((st) => setReminder(st, el.dataset.remind, Number(el.value)), { hours: 0.01, label: 'Email triage' }); });
    on(root, 'click', '[data-pay]', (e, el) => { if (confirm('Pay this invoice from the company account?')) ctx.act((st) => payInboundFee(st, el.dataset.pay), { hours: 0.1, label: 'Paying an invoice' }); });
    on(root, 'input', '#replyBody', (e) => { if (open) replyDraft[open.id].text = e.target.value; });
    on(root, 'click', '#useDraft', () => { replyDraft[open.id] = { text: open.aiDraft.text, fromAi: true }; ctx.render(); });
    on(root, 'submit', '#replyForm', (e) => {
      e.preventDefault();
      const { body, later } = formData(e.target);
      const draft = rd?.fromAi ? open.aiDraft : null;
      const base = Math.min(0.5, 0.1 + words(body) / 400) * (draft ? 0.5 : 1);
      const hours = writingHours(s, base, { commit: false });
      ctx.act((st) => {
        const t = ensureMail(st).threads.find((x) => x.id === open.id);
        writingHours(st, base);
        if (later) { queueSendLater(st, t.id, body); toast('Scheduled for tomorrow morning.'); }
        else {
          addMessage(st, t.id, { from: 'me', body, meta: draft ? { ai: true } : {} });
          ctx.enqueue(`reply:${t.kind}`, { threadId: t.id, refId: t.refId }, { label: `Reply from ${t.with?.name}` });
        }
        if (draft) sentDraftConsequences(st, t, draft, { body });
        delete t.aiDraft;
        delete replyDraft[t.id];
      }, { hours, label: 'Email reply' });
    });

    // Triage settings
    on(root, 'click', '[data-agent-plan]', (e, el) => ctx.act((st) => chooseAgentPlan(st, el.dataset.agentPlan || null), { hours: el.dataset.agentPlan && !X.agent.plan ? TRIAGE.setupHours : 0, label: 'Inbox triage setup' }));
    on(root, 'change', '[data-agent]', (e, el) => ctx.act((st) => setAgent(st, { [el.dataset.agent]: el.checked })));
    on(root, 'click', '#runAudit', () => ctx.act((st) => { lastAudit = runAudit(st); }, { hours: TRIAGE.auditHours, label: 'Inbox triage audit' }));
    on(root, 'click', '#reviewArchive', () => ctx.act((st) => { const n = reviewArchive(st); toast(n ? `Found ${n} message${n === 1 ? '' : 's'} the agent should not have archived.` : 'Nothing misfiled in the archive.', n ? 'warn' : 'good'); }, { hours: TRIAGE.reviewHours, label: 'Email triage review' }));
    on(root, 'submit', '#vipForm', (e) => { e.preventDefault(); const f = formData(e.target); if (f.who) ctx.act((st) => toggleVip(st, { email: f.who })); });
  },
};

function renderTriage(s, X) {
  const sig = inboxSignals(s);
  return html`<div class="grid-2">
    <section class="panel"><h2>AI triage agent</h2>
      <p class="small muted">Labels every new email, can archive cold pitches, draft replies and send them. No vendor publishes triage accuracy; expect a few percent of mail to be misfiled, more on ambiguous messages. Email bodies go to the model provider.</p>
      <div class="table-wrap"><table><tbody>${Object.entries(AGENT_PLANS).map(([id, p]) => html`<tr><td><b>${p.name}</b><div class="small muted">${p.note}</div></td><td class="r">${money(p.price, { cents: true })}/mo</td><td>${X.agent.plan === id ? badge('current', 'good') : html`<button class="sm" data-agent-plan="${id}">Choose</button>`}</td></tr>`)}</tbody></table></div>
      ${X.agent.plan ? html`<button class="sm" data-agent-plan="">Cancel</button>
        <div style="margin-top:10px">
          <label><input type="checkbox" data-agent="on" ${X.agent.on ? 'checked' : ''} /> Agent live (labels new mail and Messages inbound)</label>
          <label><input type="checkbox" data-agent="autoArchive" ${X.agent.autoArchive ? 'checked' : ''} /> Auto-archive cold pitches and promos</label>
          <label><input type="checkbox" data-agent="autoDecline" ${X.agent.autoDecline ? 'checked' : ''} /> Auto-decline cold inbound in Messages</label>
          <label><input type="checkbox" data-agent="drafts" ${X.agent.drafts ? 'checked' : ''} /> Draft replies to important mail</label>
          <label><input type="checkbox" data-agent="autoSend" ${X.agent.autoSend ? 'checked' : ''} /> Auto-send drafts</label>
        </div>
        <div class="inline"><button id="runAudit">Audit on last 10 emails (15 min)</button><button id="reviewArchive">Review Archived & Other (15 min)</button></div>
        ${X.agent.audited ? html`<p class="small muted">Last audit ${fmtDate(s, X.agent.auditDay)}: instructions tightened.</p>` : html`<p class="hint">Run the audit before you trust the labels.</p>`}` : ''}
      ${lastAudit ? html`<h3>Audit</h3><div class="table-wrap"><table><thead><tr><th>Email</th><th>Agent said</th><th>Actually</th></tr></thead><tbody>${lastAudit.map((r) => html`<tr><td class="small">${r.from}: ${r.subject}</td><td>${AI_LABELS[r.ai]}</td><td>${r.wrong ? badge(AI_LABELS[r.truth], 'bad') : badge('correct', 'good')}</td></tr>`)}</tbody></table></div>` : ''}
    </section>
    <section class="panel"><h2>Splits and VIPs</h2>
      <p class="small muted">Splits are rules, not AI: investors, customers and prospects go to Important, plus anyone on your VIP list. Network inbound from strangers lands in Other.</p>
      <form id="vipForm" class="inline"><label>Add a VIP (email or name) <input name="who" /></label><button class="sm">Add</button></form>
      ${X.vips.length ? html`<p class="small">${X.vips.join(', ')}</p>` : ''}
      <h3>How it is going</h3>
      <ul class="list small">
        <li>VIP replies: ${sig.vip ? `${sig.vip.avgDays} days on average, ${Math.round(sig.vip.sameDay * 100)}% same day (${sig.vip.n} messages)` : 'no VIP mail yet'}</li>
        <li>Valuable contacts missed in the last month: ${sig.missed30}</li>
        <li>Auto-archived: ${X.stats.autoArchived} · rescued: ${X.stats.rescued} · lost: ${X.stats.lostValuable}</li>
        <li>AI drafts with an unsupported claim: ${X.stats.draftErrorsCaught} caught, ${X.stats.draftErrorsSent} sent</li>
        <li>Reminders fired: ${X.stats.remindersFired}${X.stats.falseReminders ? ` (${X.stats.falseReminders} after a reply in another thread)` : ''}</li>
      </ul>
      ${inboxCoaching(s).map((n) => html`<div class="callout ${n.tone}">${n.text}</div>`)}
    </section></div>`;
}
