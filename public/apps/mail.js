// Founder inbox. Replies to prospects, investors, candidates etc. are answered by the owning app's
// job handler `reply:<kind>` (an LLM playing that person), so a conversation can continue for real.
// Split Inbox (rules by sender and thread type), an optional AI triage agent (Superhuman / Lindy style: labels,
// auto-archive, drafts, auto-send), follow-up reminders, snooze and send-later. Engine: assistant/triage.js.

import { html, mount, on, formData, badge, toast } from '../core/ui.js';
import { ensureMail, addMessage, replyDay } from '../core/mail.js';
import { hasJob, scheduledFor } from '../core/jobs.js';
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
    const lab = (t) => X.labels[t.id];
    const inbOf = (t) => (t.kind === 'network' && t.refId ? ensureNetwork(s).inbound.find((i) => i.id === t.refId) : null);
    const openInb = open ? inbOf(open) : null;
    const rd = open ? (replyDraft[open.id] ??= { text: '', fromAi: false }) : null;
    const pendingReminder = open && X.reminders.find((r) => r.threadId === open.id && r.status === 'pending');
    const folders = [...Object.entries(SPLITS).map(([k, l]) => [k, l, count(k)]), ['all', 'All mail', 0], ['snoozed', 'Snoozed', box.threads.filter((t) => t.snoozeUntil != null).length], ['archived', 'Archived', 0]];
    const FOLDER_ICON = { vip: '★', other: '◇', candidates: '◎', cold: '⌁', admin: '▤', all: '✉', snoozed: '◷', archived: '▣' };
    const waiting = (t) => scheduledFor(s, (j) => j.payload?.threadId === t.id);
    const ago = (day) => (day === s.day ? 'Today' : day === s.day - 1 ? 'Yesterday' : fmtDate(s, day));
    const vip = open && X.vips.includes(String(open.with?.email || open.with?.name || '').toLowerCase());
    mount(root, html`
      <div class="mx">
        <nav class="mx-nav">
          <div class="mx-brand">Mail</div>
          ${folders.map(([k, l, n]) => html`<a href="#/mail/${k}" class="${k === filter || (filter === 'inbox' && k === 'all') ? 'active' : ''}"><span class="mx-ico">${FOLDER_ICON[k] ?? '•'}</span><span>${l}</span>${n ? html`<b>${n}</b>` : ''}</a>`)}
          <div class="mx-sep"></div>
          <a href="#/mail/triage" class="${filter === 'triage' ? 'active' : ''}"><span class="mx-ico">✦</span><span>AI triage</span>${X.agent.on ? html`<b class="on">on</b>` : ''}</a>
          <p class="mx-tip">Answer Important first: a fast, specific reply converts far better than a slow one. People reply on their own schedule, not instantly.</p>
        </nav>
        ${filter === 'triage' ? html`<div class="mx-wide">${renderTriage(s, X)}</div>` : html`
        <section class="mx-list">
          <div class="mx-list-head">${folders.find(([k]) => k === filter)?.[1] ?? 'All mail'} <span class="muted">${threads.length}</span></div>
          ${threads.length ? threads.map((t) => html`<div class="mx-row ${t.unread ? 'unread' : ''} ${t.id === openId ? 'sel' : ''}" data-open="${t.id}">
            <div class="mx-row-top"><span class="mx-from">${t.with?.name ?? 'Unknown'}${t.messages.length > 1 ? html` <span class="muted">${t.messages.length}</span>` : ''}</span><span class="mx-date">${ago(t.lastDay)}</span></div>
            <div class="mx-subj">${t.subject}</div>
            <div class="mx-snip">${(t.messages.at(-1)?.from === 'me' ? 'You: ' : '') + (t.messages.at(-1)?.body ?? '').slice(0, 110)}</div>
            <div class="mx-tags">${waiting(t) ? badge('awaiting reply') : ''}${X.agent.on && lab(t)?.ai ? badge(AI_LABELS[lab(t).ai], lab(t).ai === 'cold' ? '' : ['investor', 'customer', 'action'].includes(lab(t).ai) ? 'accent' : '') : ''}${lab(t)?.autoArchived != null ? badge('auto-archived', 'warn') : ''}${t.aiDraft ? badge('draft ready', 'good') : ''}</div>
          </div>`) : html`<p class="empty" style="padding:18px">No mail here.</p>`}
        </section>
        <section class="mx-read">
          ${open ? html`
            <div class="mx-toolbar">
              <button class="sm" data-archive="${open.id}" title="Archive">${open.archived ? 'Unarchive' : 'Archive'}</button>
              <select class="sm" data-snooze="${open.id}" title="Snooze"><option value="">Snooze</option><option value="1">1 day</option><option value="3">3 days</option><option value="7">1 week</option></select>
              <select class="sm" data-remind="${open.id}" title="Follow-up reminder"><option value="">${pendingReminder ? `Reminder ${fmtDate(s, pendingReminder.dueDay)}` : 'Remind me'}</option><option value="2">in 2 days</option><option value="3">in 3 days</option><option value="5">in 5 days</option><option value="7">in 7 days</option></select>
              <button class="sm" data-vip="${open.id}" title="VIP senders land in Important">${vip ? '★ VIP' : '☆ VIP'}</button>
              ${open.app ? html`<a class="btn sm" href="#/${open.app}" style="margin-left:auto">Open in ${open.app} →</a>` : ''}
            </div>
            <h2 class="mx-title">${open.subject} <span class="mx-chip">${SPLITS[splitOf(s, open)]}</span><span class="mx-chip">${open.kind}</span></h2>
            ${open.messages.map((m, i) => html`<article class="mx-mail ${m.from}">
              <div class="mx-avatar ${m.from}">${m.from === 'me' ? initials(s.founder?.name ?? 'You') : initials(open.with?.name)}</div>
              <div class="mx-mail-main">
                <div class="mx-mail-head"><div><b>${m.from === 'me' ? `${s.founder?.name ?? 'You'}${m.meta?.ai ? ' (AI draft)' : ''}` : open.with?.name ?? 'Unknown'}</b>
                  <span class="muted small">${m.from === 'me' ? '' : open.with?.email ? `<${open.with.email}>` : ''}</span>
                  <div class="small muted">to ${m.from === 'me' ? open.with?.name ?? 'them' : 'me'}</div></div>
                  <span class="small muted">${fmtDate(s, m.day)}</span></div>
                <div class="mx-body">${m.body}</div>
              </div></article>`)}
            ${waiting(open) ? html`<div class="mx-waiting">Sent. ${open.with?.name ?? 'They'} will reply in their own time${open.kind === 'investor' ? ' (investors usually take a business day or more)' : open.kind === 'prospect' ? ' (most prospect replies come within two days, if at all)' : ''}.</div>` : ''}
            ${openInb?.feeAsk && !openInb.paid ? html`<div class="callout warn small">${open.with?.name} sent an invoice: ${money(openInb.feeAsk.amount)} for a ${openInb.feeAsk.what}. <button class="sm" data-pay="${openInb.id}">Pay ${money(openInb.feeAsk.amount)}</button></div>` : ''}
            ${hasJob(`reply:${open.kind}`) ? html`<form id="replyForm" class="mx-compose">
              <div class="mx-compose-head">↩ Reply to <b>${open.with?.name ?? ''}</b> ${open.with?.email ? html`<span class="muted">&lt;${open.with.email}&gt;</span>` : ''}</div>
              ${open.aiDraft && !rd.fromAi ? html`<div class="callout small">AI draft ready. <button type="button" class="sm" id="useDraft">Use AI draft</button> <span class="muted">Read every sentence: drafts can promise dates, prices or features nobody agreed.</span></div>` : ''}
              <textarea id="replyBody" name="body" placeholder="Write your reply…" required>${rd.text}</textarea>
              <div class="mx-compose-foot"><button class="primary">Send</button><label class="small"><input type="checkbox" name="later" /> Schedule for tomorrow 8am</label><span class="hint" style="margin-left:auto">~6–20 min to write; editing a draft is about half.</span></div></form>` : ''}
          ` : html`<div class="mx-empty"><div style="font-size:42px">✉</div><p>Select a conversation to read it.</p></div>`}
        </section>`}
      </div>`);
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
          ctx.enqueue(`reply:${t.kind}`, { threadId: t.id, refId: t.refId }, { label: `Reply from ${t.with?.name}`, notBefore: replyDay(st, t.kind) });
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

const initials = (name) => String(name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

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
