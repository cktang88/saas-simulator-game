// Outreach → Replies tab: unified reply inbox, AI categories with sample tests, reply agent and credits.
import { html, on, stat, badge, toast } from '../../core/ui.js';
import { fmtDate, pct, words } from '../../core/util.js';
import { CATEGORIES, INBOX, ensureInbox, promptQuality, promptsKey, testOnSamples, auditLabels, confusion, inboxMetrics, buyCredits, approveDraft, resolveItem, isPositiveCat } from './inbox.js';
import { contactById, companyById, contactName } from './model.js';

const ui = { filter: 'all', prompts: null, test: null, audit: null };

export function repliesView(s) {
  const ib = ensureInbox(s);
  const st = ib.settings;
  ui.prompts ??= { ...st.prompts };
  const items = ib.items.slice().reverse().filter((x) => ui.filter === 'all' || (ui.filter === 'open' ? !['handled', 'ignored'].includes(x.status) : ui.filter === 'drafted' ? x.status === 'drafted' : x.label === ui.filter)).slice(0, 80);
  const m = inboxMetrics(s, s.day - 90);
  const pq = promptQuality(st.prompts);
  const tested = st.tested && st.tested.key === promptsKey(st.prompts);
  const conf = confusion(s);
  return html`
    <div class="stats">
      ${stat('Replies (90d)', m.n)}
      ${stat('Meetings / 100 positive', m.meetingsPer100 == null ? '—' : Math.round(m.meetingsPer100), 'research band 15–40', m.meetingsPer100 >= 25 ? 'good' : m.meetingsPer100 != null && m.meetingsPer100 < 15 ? 'bad' : '')}
      ${stat('Opt-outs caused', pct(m.unsubRate, 1), 'by pushy or wrong answers', m.unsubRate > 0.05 ? 'bad' : '')}
      ${stat('AI credits', ib.credits.toLocaleString('en-US'), `${INBOX.creditsPerReply} per generated reply, sent or not`)}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Inbox</h2>
        <label style="max-width:240px">Show <select id="rFilter">${[['all', 'All'], ['open', 'Needs action'], ['drafted', 'Drafts to approve'], ...Object.entries(CATEGORIES)].map(([k, l]) => html`<option value="${k}" ${ui.filter === k ? 'selected' : ''}>${l}</option>`)}</select></label>
        ${items.length ? html`<ul class="list">${items.map((x) => { const c = contactById(s, x.contactId); return html`<li>
          <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><span><b>${contactName(c)}</b> · ${companyById(s, x.companyId)?.name ?? ''} <span class="small muted">${fmtDate(s, x.day)} · ${x.channel}</span></span>
          <span>${x.label ? badge(CATEGORIES[x.label], isPositiveCat(x.label) ? 'good' : '') : badge('unlabelled')} ${x.audited && x.label !== x.trueCat ? badge(`really: ${CATEGORIES[x.trueCat]}`, 'bad') : ''} ${badge(x.status, x.status === 'drafted' ? 'warn' : '')}${x.outcome ? ` ${badge(x.outcome.replace('_', ' '), x.outcome === 'meeting' ? 'good' : ['mishandled', 'complaint', 'unsubscribed', 'ignored'].includes(x.outcome) ? 'bad' : '')}` : ''}</span></div>
          ${['handled', 'ignored'].includes(x.status) ? '' : html`<div class="inline" style="margin-top:4px">
            ${c?.threadId ? html`<a class="btn sm" href="#/mail/inbox:${c.threadId}">Read & answer myself</a>` : ''}
            <button class="sm primary" data-convert="${x.id}">Convert to deal + offer 3 times (5 min)</button>
            ${x.status === 'drafted' ? html`<button class="sm" data-approve="${x.id}">Approve AI draft (2 min)</button>` : ''}
            <button class="sm" data-close="${x.id}">No reply needed</button></div>`}
        </li>`; })}</ul>` : html`<p class="empty">No replies.</p>`}
      </section>
      <section class="panel"><h2>AI categorization</h2>
        <label><input type="checkbox" id="aiCat" ${st.aiCategorize ? 'checked' : ''} /> Label incoming replies with AI (Smartlead / Instantly style)</label>
        <p class="small muted">No vendor publishes accuracy. Game estimate: 85–92% on clear replies, 60–70% on sarcasm and ambiguous one-liners. Writing a prompt per category and testing on real replies is what moves it.</p>
        ${Object.entries(CATEGORIES).map(([k, l]) => html`<label class="small">${l} <input data-cprompt="${k}" value="${ui.prompts[k] ?? ''}" placeholder="When to use this label, with one example reply" /></label>`)}
        <div class="inline"><button class="sm" id="savePrompts">Save prompts (${words(Object.values(ui.prompts).join(' ')) > 30 ? '20' : '10'} min)</button><button class="sm" id="testSamples">Test on 10 sample replies (15 min)</button><button class="sm" id="audit" ${ib.items.some((x) => x.label) ? '' : 'disabled'}>Audit last 20 labels (15 min)</button></div>
        <p class="small">${pq.good}/8 categories have a specific prompt · ${tested ? html`<span class="pos">tested on samples (${pct(st.tested.accuracy, 0)} right)</span>` : html`<span class="warn">not tested since the last edit</span>`}</p>
        ${ui.test ? html`<p class="small">Sample test: ${pct(ui.test.accuracy, 0)} right. ${ui.test.rows.filter((r) => r.label !== r.trueCat).map((r) => `"${CATEGORIES[r.trueCat]}" read as "${CATEGORIES[r.label] ?? '?'}"`).join(' · ')}</p>` : ''}
        ${ui.audit ? html`<p class="small">Audit: ${ui.audit.accuracy == null ? '—' : pct(ui.audit.accuracy, 0)} of ${ui.audit.n} labels right.</p>` : ''}
        ${Object.keys(conf).length ? html`<h3>Confusion (audited replies)</h3><ul class="small">${Object.entries(conf).map(([t, row]) => html`<li>${CATEGORIES[t]} → ${Object.entries(row).map(([l, n]) => `${CATEGORIES[l]} ${n}`).join(', ')}</li>`)}</ul>` : ''}
        <h2 style="margin-top:12px">Reply agent</h2>
        <label>Mode <select id="agentMode">${[['off', 'Off'], ['review', 'Draft for my approval'], ['autopilot', 'Autopilot (sends without review)']].map(([k, l]) => html`<option value="${k}" ${st.agent.mode === k ? 'selected' : ''}>${l}</option>`)}</select></label>
        <p class="small">Handles these labels: ${Object.entries(CATEGORIES).map(([k, l]) => html`<label class="inline" style="display:inline-flex;margin-right:8px"><input type="checkbox" data-scope="${k}" ${st.agent.scope.includes(k) ? 'checked' : ''} /> ${l}</label>`)}</p>
        <label class="small">Qualification criteria <textarea id="agCrit" rows="2" placeholder="Book a call if they name a time or ask for pricing; route anything about security to me">${st.agent.criteria}</textarea></label>
        <label class="small">Response templates <textarea id="agTpl" rows="3" placeholder="Pricing: ...  How it works: ...  OOO: reply after their return date">${st.agent.templates}</textarea></label>
        <label class="small">Escalation rules <input id="agEsc" value="${st.agent.escalation}" placeholder="Anything 'interested' or ambiguous goes to me" /></label>
        <button class="sm" id="saveAgent">Save agent settings (30 min)</button>
        <p class="hint">Autopilot answers nuanced positive replies with a generic message and acts on wrong labels. Most teams keep review on for positives; answering positives yourself within a few hours converts best.</p>
        <div class="inline"><button class="sm" data-credits="small">Buy ${INBOX.packs.small.credits} credits ($${INBOX.packs.small.usd})</button><button class="sm" data-credits="large">Buy ${INBOX.packs.large.credits} credits ($${INBOX.packs.large.usd})</button></div>
      </section>
    </div>`;
}

export function wireReplies(root, ctx) {
  const s = ctx.state;
  const ib = ensureInbox(s);
  on(root, 'change', '#rFilter', (e) => { ui.filter = e.target.value; ctx.render(); });
  on(root, 'change', '#aiCat', (e) => ctx.act(() => { ib.settings.aiCategorize = e.target.checked; ib.settings.promptsKey = promptsKey(ib.settings.prompts); }, { hours: e.target.checked ? INBOX.hours.setup / 2 : 0, label: 'Reply inbox setup' }));
  on(root, 'input', '[data-cprompt]', (e, el) => { ui.prompts[el.dataset.cprompt] = el.value; });
  on(root, 'click', '#savePrompts', () => ctx.act(() => { ib.settings.prompts = Object.fromEntries(Object.entries(ui.prompts).filter(([, v]) => v.trim())); ib.settings.promptsKey = promptsKey(ib.settings.prompts); }, { hours: words(Object.values(ui.prompts).join(' ')) > 30 ? 0.33 : 0.17, label: 'Reply inbox setup' }));
  on(root, 'click', '#testSamples', () => ctx.act((st) => { ui.test = testOnSamples(st); }, { hours: INBOX.hours.testSamples, label: 'Reply inbox setup' }));
  on(root, 'click', '#audit', () => ctx.act((st) => { ui.audit = auditLabels(st); }, { hours: INBOX.hours.audit, label: 'Reply inbox audit' }));
  on(root, 'change', '#agentMode', (e) => ctx.act(() => { ib.settings.agent.mode = e.target.value; }));
  on(root, 'change', '[data-scope]', (e, el) => ctx.act(() => { const sc = new Set(ib.settings.agent.scope); if (el.checked) sc.add(el.dataset.scope); else sc.delete(el.dataset.scope); ib.settings.agent.scope = [...sc]; }));
  on(root, 'click', '#saveAgent', () => { const crit = root.querySelector('#agCrit').value, tpl = root.querySelector('#agTpl').value, esc = root.querySelector('#agEsc').value; ctx.act(() => Object.assign(ib.settings.agent, { criteria: crit, templates: tpl, escalation: esc }), { hours: INBOX.hours.setup / 2, label: 'Reply agent setup' }); });
  on(root, 'click', '[data-credits]', (e, el) => ctx.act((st) => buyCredits(st, el.dataset.credits)));
  const item = (id) => ib.items.find((x) => x.id === id);
  on(root, 'click', '[data-approve]', (e, el) => ctx.act((st) => { const it = approveDraft(st, item(el.dataset.approve)); toast(it.outcome === 'meeting' ? 'They booked a call.' : `Sent (${it.outcome?.replace('_', ' ') ?? 'done'}).`, it.outcome === 'meeting' ? 'good' : 'info'); }, { hours: INBOX.hours.approve, label: 'Reply triage' }));
  on(root, 'click', '[data-convert]', (e, el) => ctx.act((st) => { const it = resolveItem(st, item(el.dataset.convert), 'founder'); toast(it.outcome === 'meeting' ? 'They picked a time: call booked.' : 'Sent. No time picked yet.', it.outcome === 'meeting' ? 'good' : 'info'); }, { hours: 0.08, label: 'Reply triage' }));
  on(root, 'click', '[data-close]', (e, el) => ctx.act(() => { const it = item(el.dataset.close); it.status = 'handled'; it.handledBy = 'founder'; it.handledDay = s.day; it.outcome = isPositiveCat(it.trueCat) ? 'no_meeting' : 'answered'; }, { hours: ib.settings.aiCategorize ? INBOX.hours.triageLabeled : INBOX.hours.triageManual, label: 'Reply triage' }));
}
