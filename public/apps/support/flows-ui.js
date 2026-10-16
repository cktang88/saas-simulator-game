// Helpdesk "Cases" and "Ops" tabs for the ticket-type flows (support/flows.js). Views return html``; events are bound
// in bindFlows (called from the app's render with the fresh root).

import { html, on, formData, toast } from '../../core/ui.js';
import { fmtDate, money, pct, round2 } from '../../core/util.js';
import { monthlyAmount } from '../../core/stripe.js';
import {
  TYPES, TYPE_IDS, ensureFlows, caseById, caseHours, handleCase, closeLoop, notifyRequesters, featureRequestLog, setOps, setAiScope, aiScopeOf, RECOMMENDED_SCOPE,
  macroQuality, slaLimit, flowSignals, caseLessons, LANG_POLICIES, AFTER_HOURS, CHAT, TIER_SLA, disputeRatio, NETWORK, MT_ERROR,
} from './flows.js';
import { subOf, isLiveSub } from './flow-lib.js';
import { adviceBlock } from '../../core/adviceUi.js';
import { reviewFor } from '../../core/advice.js';

const PRIOS = ['p1', 'p2', 'p3', 'p4'];
const ORDER = { p1: 0, p2: 1, p3: 2, p4: 3 };
const TAGS = [...new Set(TYPE_IDS.map((id) => TYPES[id].tag))];
const tone = { p1: 'bad', p2: 'warn', p3: '', p4: '' };
const drafts = {};
const dr = (id) => (drafts[id] ??= { action: '', checks: [], text: '', macroId: '', tag: '', priority: '', note: '' });

const OPEN = ['open'];
export const caseBadge = (state) => (state.apps.support?.flows?.cases ?? []).filter((c) => c.status === 'open' || c.status === 'notify').length;

function dueText(state, c) {
  if (c.dueDay == null) return '';
  const left = c.dueDay - state.day;
  return left < 0 ? 'overdue' : left === 0 ? 'due today' : `due in ${left} d`;
}

export function casesView(ctx, sup, caseId = null) {
  const s = ctx.state, fl = ensureFlows(s);
  if (caseId) { const c = caseById(s, caseId); if (c) return caseDetail(ctx, sup, c); }
  const open = fl.cases.filter((c) => OPEN.includes(c.status)).sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || (a.dueDay ?? 1e9) - (b.dueDay ?? 1e9));
  const notify = fl.cases.filter((c) => c.status === 'notify');
  const waiting = fl.cases.filter((c) => ['waiting', 'linked'].includes(c.status));
  const done = fl.cases.filter((c) => ['resolved', 'lapsed'].includes(c.status)).slice(0, 12);
  const row = (c) => html`<tr class="clickable" data-case="${c.id}">
    <td><span class="badge ${tone[c.priority]}">${c.priority.toUpperCase()}</span></td>
    <td><b>${c.subject}</b>${c.vip ? html` <span class="badge accent">VIP</span>` : ''}${c.channel === 'chat' ? html` <span class="badge accent">Chat</span>` : ''}${c.lang !== 'en' ? html` <span class="badge">${c.lang.toUpperCase()}</span>` : ''}<div class="small muted">${TYPES[c.type].label} · ${c.name}${c.company ? ` · ${c.company}` : ''}</div></td>
    <td class="small">${c.tier}</td><td class="small">${fmtDate(s, c.createdDay)}</td>
    <td><span class="badge ${c.dueDay != null && c.dueDay - s.day <= 1 ? 'bad' : ''}">${dueText(s, c) || '—'}</span></td></tr>`;
  const sig = flowSignals(s);
  return html`
    <div class="stats">
      <div class="stat"><div class="stat-label">Open cases</div><div class="stat-value">${open.length}</div><div class="stat-sub">${sig.backlogAge ? `oldest ${sig.backlogAge} d` : 'none waiting'}</div></div>
      <div class="stat"><div class="stat-label">Handled (90d)</div><div class="stat-value">${sig.n}</div><div class="stat-sub">${sig.avgScore == null ? '—' : `avg score ${Math.round(sig.avgScore * 100)}`}</div></div>
      <div class="stat ${fl.network.level !== 'ok' ? 'bad' : ''}"><div class="stat-label">Dispute ratio (30d)</div><div class="stat-value">${fl.network.ratio ? pct(fl.network.ratio, 2) : '—'}</div><div class="stat-sub">${fl.network.level}</div></div>
      <div class="stat"><div class="stat-label">Account takeovers</div><div class="stat-value">${sig.takeovers}</div><div class="stat-sub">${sig.blocked} blocked</div></div>
    </div>
    <section class="panel"><h2>Cases that need a decision</h2>
      <p class="small muted">Refunds, disputes, ownership transfers, data requests, security reports and public complaints cannot be answered from memory: the right move depends on facts you have to check. Each case costs real hours, and verification takes minutes that a hurried operator skips. Clocks are real (GDPR one month, CCPA 45 days, dispute windows).</p>
      ${open.length ? html`<div class="table-wrap"><table><thead><tr><th>Prio</th><th>Case</th><th>Plan</th><th>Opened</th><th>Clock</th></tr></thead><tbody>${open.map(row)}</tbody></table></div>` : html`<p class="empty">No open cases.</p>`}
    </section>
    ${notify.length ? html`<section class="panel"><h2>Fixed: tell the customer</h2><ul class="list small">${notify.map((c) => html`<li><b>${c.subject}</b> · ${c.name} <button class="sm primary" data-loop="${c.id}">Tell them it is fixed (3 min)</button></li>`)}</ul><p class="small muted">A fix nobody mentions is a win you did not collect.</p></section>` : ''}
    ${waiting.length ? html`<section class="panel"><h2>Waiting</h2><ul class="list small">${waiting.map((c) => html`<li>${c.subject} · ${c.name} · ${c.status === 'linked' ? html`linked to <b>${(s.apps.product?.bugs ?? []).find((b) => b.id === c.issueId)?.key ?? 'an issue'}</b> in Product` : 'waiting for the customer'}</li>`)}</ul></section>` : ''}
    ${done.length ? html`<details class="panel"><summary class="small">Recently closed (${done.length})</summary><div class="table-wrap"><table><tbody>${done.map((c) => html`<tr class="clickable" data-case="${c.id}"><td>${c.subject}<div class="small muted">${TYPES[c.type].label} · ${c.name}</div></td><td><span class="badge ${c.status === 'lapsed' ? 'bad' : ''}">${c.status === 'lapsed' ? 'lapsed' : 'resolved'}</span></td></tr>`)}</tbody></table></div></details>` : ''}`;
}

function caseDetail(ctx, sup, c) {
  const s = ctx.state, T = TYPES[c.type], d = dr(c.id);
  const sub = subOf(s, c.subId);
  const closed = c.status !== 'open';
  const est = caseHours(s, c, { action: d.action, checks: d.checks, text: d.text, macroId: d.macroId });
  const macros = sup.macros ?? [];
  const f = c.facts;
  return html`<p><a href="#/helpdesk/cases">← Cases</a></p>
    <div class="grid-2">
      <section class="panel">
        <h2>${c.subject}</h2>
        <p class="small muted"><span class="badge ${tone[c.priority]}">${c.priority.toUpperCase()}</span> ${T.label} · ${c.name}${c.company ? ` · ${c.company}` : ''} · ${c.channel}${c.lang !== 'en' ? ` · writes in ${c.lang.toUpperCase()}` : ''} · opened ${fmtDate(s, c.createdDay)} · ${dueText(s, c)}${c.afterHours ? ' · arrived after hours' : ''}</p>
        <div class="chat"><div class="msg them">${c.body}</div></div>
        <p class="small muted">Plan: ${c.tier}${sub ? ` (${money(monthlyAmount(sub))}/mo)` : ''}${c.vip ? ' · VIP: faster target, same verification' : ''} · first-response target ${slaLimit(c)} h.${c.type === 'dispute' ? ` Dispute reason: ${f.reason.replace('_', ' ')}, ${money(f.amount)}.` : ''}${c.type === 'dsr' ? ` ${f.regime === 'ccpa' ? 'CCPA' : 'GDPR'} ${f.kind} request, clock ends ${fmtDate(s, c.dueDay)}${f.extended ? ' (extended)' : ''}.` : ''}${c.type === 'refund_request' ? ` Purchase channel unknown until you check. Policy window: ${ensureFlows(s).ops.refundWindowDays} days.` : ''}</p>
        ${closed ? html`<div class="callout ${c.status === 'lapsed' ? 'bad' : ''}"><b>${c.status === 'lapsed' ? 'Lapsed: nobody answered in time.' : 'Handled.'}</b>
          <ul class="small">${(c.result?.feedback ?? []).map((x) => html`<li>${x}</li>`)}</ul>${adviceBlock(s, 'support', caseLessons(c, T), { kind: 'lesson', cls: 'small' })}</div>` : html`
        <form id="caseForm" data-case-id="${c.id}">
          <fieldset><legend class="small">What do you do?</legend>${T.actions.map(([id, label]) => html`<label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="flex:none;margin-top:3px" type="radio" name="action" value="${id}" ${d.action === id ? 'checked' : ''} /> ${label}</label>`)}</fieldset>
          <fieldset><legend class="small">Checks you run first (each takes time)</legend>${T.checks.map(([id, label, min]) => html`<label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="flex:none;margin-top:3px" type="checkbox" name="chk:${id}" ${d.checks.includes(id) ? 'checked' : ''} /> ${label} <span class="muted">(${min} min)</span></label>`)}</fieldset>
          ${macros.length ? html`<label>Saved reply <select name="macroId"><option value="">— write it myself —</option>${macros.map((m) => html`<option value="${m.id}" ${d.macroId === m.id ? 'selected' : ''}>${m.name}${m.for ? ` [${m.for}]` : ''} (quality ${Math.round((m.quality ?? macroQuality(m)) * 100)})</option>`)}</select></label>` : ''}
          <label>Reply <textarea name="text" rows="4" placeholder="Answer this customer's actual situation.">${d.text}</textarea></label>
          <div class="inline"><label>Tag <select name="tag"><option value="">—</option>${TAGS.map((t) => html`<option ${d.tag === t ? 'selected' : ''}>${t}</option>`)}</select></label>
            <label>Priority <select name="priority"><option value="">—</option>${PRIOS.map((p) => html`<option value="${p}" ${d.priority === p ? 'selected' : ''}>${p.toUpperCase()}</option>`)}</select></label></div>
          <label>Internal note (decision, promise, next step) <input name="note" value="${d.note}" /></label>
          <div class="inline"><button class="primary">Send and close (~${Math.round(est * 60)} min)</button><span class="hint">${c.channel === 'chat' ? 'Chat handling costs ~25% more time. ' : ''}${ensureFlows(s).ops.langPolicy === 'reviewed' && c.lang !== 'en' ? 'Reviewed translation adds time. ' : ''}</span></div>
        </form>`}
      </section>
      <section class="panel"><h2>Context</h2>
        <p class="small">${T.ai.note}</p>${adviceBlock(s, 'support', [T.ai.level === 'safe' ? 'The AI agent can safely handle this type.' : T.ai.level === 'assist' ? 'The AI agent can assist (draft) but should not decide.' : 'Keep the AI agent out of this type.'], { cls: 'small' })}
        ${c.type === 'dispute' ? html`<p class="small">You can also write a full evidence packet in <a href="#/stripe/disputes/${f.disputeId}">Payments → Disputes</a>; this case adopts that response. The checklist here is the quick route: it scores completeness, not your writing.</p>` : ''}
        <p class="small"><a href="#/stripe">Payments</a> · <a href="#/product/build">Product tracker</a> · <a href="#/legal">Legal</a> · <a href="#/helpdesk/ops">Support ops</a></p>
      </section>
    </div>`;
}

function aiScopeTable(ctx) {
  const s = ctx.state, fl = ensureFlows(s);
  return html`<div class="table-wrap"><table><thead><tr><th>Case type</th><th>Safe for the AI?</th><th>AI may</th></tr></thead><tbody>
    ${TYPE_IDS.map((id) => { const T = TYPES[id]; const cur = aiScopeOf(s, id); const rec = RECOMMENDED_SCOPE(id); return html`<tr><td>${T.label}</td><td class="small"><span class="badge ${T.ai.level === 'safe' ? 'good' : T.ai.level === 'assist' ? 'warn' : 'bad'}">${T.ai.level === 'safe' ? 'safe' : T.ai.level === 'assist' ? 'draft only' : 'never'}</span> ${T.ai.note}</td><td><select data-aiscope="${id}">${[['off', 'Off (human)'], ['draft', 'Draft for me'], ['auto', 'Handle on its own']].map(([v, l]) => html`<option value="${v}" ${cur === v ? 'selected' : ''}>${l}${v === rec ? ' (recommended)' : ''}</option>`)}</select></td></tr>`; })}
  </tbody></table></div>`;
}

export function opsView(ctx, sup) {
  const s = ctx.state, fl = ensureFlows(s), o = fl.ops, sig = flowSignals(s);
  const reqs = featureRequestLog(s).slice(0, 8);
  const rawReqs = fl.requests;
  const dr30 = disputeRatio(s, 30);
  const recent = (sup.mistakeLog ?? []).filter((m) => s.day - m.day <= 90).slice(0, 8);
  return html`
    <div class="grid-2">
      <section class="panel"><h2>Channels and hours</h2>
        <label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="flex:none;margin-top:3px" type="checkbox" id="opChat" ${o.chat ? 'checked' : ''} /> Live chat. Raises expectations (minutes, not hours), adds ~${Math.round(CHAT.volumeMult * 100)}% contacts, costs ${CHAT.coverageHoursPerDay} h of coverage every weekday and ~25% more time per chat case. A chat nobody answers the same day falls back to email with a worse mood.</label>
        <label>After-hours coverage <select id="opAfter">${Object.entries(AFTER_HOURS).map(([k, l]) => html`<option value="${k}" ${o.afterHours === k ? 'selected' : ''}>${l}</option>`)}</select></label>
        <p class="small muted">About 40% of contacts arrive outside a solo founder's hours. Without coverage, P1s (charge after cancel, data loss, security) wait until morning. A pager gets P1s answered in about an hour but wears you down.</p>
      </section>
      <section class="panel"><h2>Languages</h2>
        <label>Non-English customers <select id="opLang">${Object.entries(LANG_POLICIES).map(([k, l]) => html`<option value="${k}" ${o.langPolicy === k ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="flex:none;margin-top:3px" type="checkbox" id="opGloss" ${o.glossary ? 'checked' : ''} /> Product glossary (feature names stay in English): fewer translation slips (1 h)</label>
        <p class="small muted">Unreviewed machine translation garbles about ${Math.round(MT_ERROR.machine * 100)}% of replies and ${Math.round(MT_ERROR.machineMoney * 100)}% of money, date and legal replies (game estimates). Review the top macros per language with a native speaker. ${Object.keys(sig.langCsat).length ? `CSAT by language: ${Object.entries(sig.langCsat).map(([k, v]) => `${k.toUpperCase()} ${Math.round(v * 100)}%`).join(', ')}.` : ''}</p>
      </section>
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Policies</h2>
        <label>Refund window <select id="opRefund">${[0, 7, 14, 30, 60].map((d) => html`<option value="${d}" ${o.refundWindowDays === d ? 'selected' : ''}>${d ? `${d} days` : 'No refunds'}</option>`)}</select></label>
        <label class="inline-check" style="display:flex;gap:6px;align-items:flex-start"><input style="flex:none;margin-top:3px" type="checkbox" id="opSec" ${o.securityTxt ? 'checked' : ''} /> Publish security.txt and a disclosure policy with safe harbour (1 h). Real reports reach you first; researchers wait longer before going public.</label>
        <p class="small muted">Store purchases (App Store, Google Play) can only be refunded by the store: the cases will test whether you know the channel first.</p>
      </section>
      <section class="panel"><h2>Support tiers and VIPs</h2>
        <div class="table-wrap"><table><thead><tr><th>Plan</th><th>P1</th><th>P2</th><th>P3</th><th>P4</th></tr></thead><tbody>${Object.entries(TIER_SLA).map(([t, v]) => html`<tr><td>${t}${t === 'starter' ? ' (< $50/mo)' : t === 'pro' ? ' ($50-299)' : ' ($300+)'}</td>${PRIOS.map((p) => html`<td>${v[p]} h</td>`)}</tr>`)}</tbody></table></div>
        <p class="small muted">First-response targets by plan [design]. VIP accounts (5%+ of MRR, or top 10) get half the target and a check-in after incidents, and exactly the same identity verification as everyone else.</p>
      </section>
    </div>
    <section class="panel"><h2>Saved replies</h2>
      ${(sup.macros ?? []).length ? html`<div class="table-wrap"><table><thead><tr><th>Macro</th><th>For</th><th>Quality</th></tr></thead><tbody>${sup.macros.map((m) => html`<tr><td><b>${m.name}</b><div class="small muted">${m.body.slice(0, 100)}</div></td><td><select data-macfor="${m.id}"><option value="">any</option>${TAGS.map((t) => t.split('/')[0]).filter((v, i, a) => a.indexOf(v) === i).map((t) => html`<option value="${t}" ${m.for === t ? 'selected' : ''}>${t}</option>`)}${TYPE_IDS.map((t) => html`<option value="${t}" ${m.for === t ? 'selected' : ''}>${t}</option>`)}</select></td><td>${Math.round((m.quality ?? macroQuality(m)) * 100)}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No macros yet. Write them in Help center & macros.</p>`}
      <p class="small muted">Good macros (merge fields {{first_name}}, {{plan}}, {{amount}}, {{date}}, a next step, no boilerplate) cut handling time ~30%. A macro for the wrong question, with unfilled fields, or robotic wording makes the customer feel unheard and the ticket reopens. Never answer a security report or a legal request from a macro.</p>
    </section>
    <div class="grid-2">
      <section class="panel"><h2>Card disputes</h2>
        <p class="small">Dispute ratio, last 30 days: <b>${dr30.tx ? pct(dr30.ratio, 2) : '—'}</b> (${dr30.disputes} of ${dr30.tx} payments) · level <span class="badge ${fl.network.level === 'ok' ? 'good' : 'bad'}">${fl.network.level}</span></p>
        <p class="small muted">Healthy is well under 0.5%. Stripe warns first; the Visa and Mastercard programmes start around ${pct(NETWORK.excessive, 1)}. Win rate so far: ${sig.disputeWinRate == null ? '—' : pct(sig.disputeWinRate, 0)} of ${sig.disputesDecided}. Refund real errors before they become disputes.</p>
      </section>
      <section class="panel"><h2>Quality of your handling</h2>
        <p class="small">Cases handled (90 d): ${sig.n}${reviewFor(s, 'support').tier ? ` · stellar ${sig.byTier.stellar}, good ${sig.byTier.good}, average ${sig.byTier.average}, mediocre ${sig.byTier.mediocre}` : ''}</p>
        <p class="small">Tagged correctly: ${sig.tagRate == null ? '—' : pct(sig.tagRate, 0)} · reopen rate: ${sig.reopenRate == null ? '—' : pct(sig.reopenRate, 0)} · checks run on identity-risky cases: ${sig.riskyChecked == null ? '—' : pct(sig.riskyChecked, 0)}${sig.macroGood != null ? ` · macro uses that were fine: ${pct(sig.macroGood, 0)}` : ''}</p>
        ${recent.length ? html`<ul class="small list">${recent.map((m) => html`<li><span class="muted">${fmtDate(s, m.day)}</span> ${m.text}${m.estCost ? ` (~${money(m.estCost)})` : ''}</li>`)}</ul>` : ''}
      </section>
    </div>
    <section class="panel"><h2>Feature requests (Product reads this)</h2>
      ${rawReqs.length ? html`<div class="table-wrap"><table><thead><tr><th>Request</th><th>Votes</th><th>Accounts</th><th>MRR</th><th>Status</th><th></th></tr></thead><tbody>${reqs.map((r) => html`<tr><td>${r.text}${r.promised ? html` <span class="badge warn">${r.promised} promised</span>` : ''}</td><td>${r.votes}</td><td>${r.accounts}</td><td>${money(r.mrr)}</td><td>${r.status}</td><td>${r.status === 'shipped' && !rawReqs.find((x) => x.id === r.id)?.notified ? html`<button class="sm primary" data-notifyreq="${r.id}">Tell requesters</button>` : ''}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">Log feature requests from the Cases tab; votes and MRR add up here.</p>`}
    </section>
    <section class="panel"><h2>What the AI agent may decide</h2>
      <p class="small muted">The vendor default is "answer everything it can". Left at that, the agent will approve out-of-policy refunds, accept a convincing ownership-transfer story, promise bounties and release another user's data on a name collision. Off for decisions with money, identity or legal clocks; Draft where a human must check; Auto only for safe types.</p>
      ${aiScopeTable(ctx)}
    </section>`;
}

export function bindFlows(root, ctx) {
  const act = ctx.act;
  on(root, 'click', '[data-case]', (e, el) => ctx.navigate('helpdesk', el.dataset.case));
  on(root, 'click', '[data-loop]', (e, el) => act((st) => { const r = closeLoop(st, el.dataset.loop); if (r.ok) toast('Told them. A fix someone hears about is worth more than one they find.', 'good'); }, { hours: 0.05, label: 'Support: close the loop' }));
  on(root, 'click', '[data-notifyreq]', (e, el) => act((st) => { const r = notifyRequesters(st, el.dataset.notifyreq); if (r.ok) toast(`Told ${r.notified} account(s) it shipped.`, 'good'); }, { hours: 0.15, label: 'Support: tell requesters' }));
  on(root, 'input', '#caseForm', (e) => { const f = e.target.closest('form'); const d = dr(f.dataset.caseId); const fd = formData(f); Object.assign(d, { action: fd.action ?? d.action, text: fd.text ?? '', macroId: fd.macroId ?? '', tag: fd.tag ?? '', priority: fd.priority ?? '', note: fd.note ?? '', checks: Object.keys(fd).filter((k) => k.startsWith('chk:') && fd[k]).map((k) => k.slice(4)) }); });
  on(root, 'submit', '#caseForm', (e) => {
    e.preventDefault();
    const f = e.target, id = f.dataset.caseId, fd = formData(f);
    if (!fd.action) return toast('Choose what you do.', 'warn');
    const h = { action: fd.action, checks: Object.keys(fd).filter((k) => k.startsWith('chk:') && fd[k]).map((k) => k.slice(4)), text: fd.text, macroId: fd.macroId || null, tags: fd.tag ? [fd.tag] : [], priority: fd.priority || null, note: fd.note };
    const c = caseById(ctx.state, id);
    if (!c) return;
    const hours = caseHours(ctx.state, c, h);
    ctx.act((st) => { const r = handleCase(st, id, h); if (!r.ok) throw new Error(r.error); toast(`Case closed. ${r.result.feedback.find((x, i) => i > 0) ?? ''}`.trim(), 'info'); delete drafts[id]; }, { hours, label: `Support case: ${TYPES[c.type].label}` });
  });
  on(root, 'change', '#opChat', (e, el) => act((st) => { setOps(st, { chat: el.checked }); }, { hours: el_hours(el.checked, 0.5), label: 'Support: live chat setup' }));
  on(root, 'change', '#opAfter', (e, el) => act((st) => { setOps(st, { afterHours: el.value }); }));
  on(root, 'change', '#opLang', (e, el) => act((st) => { setOps(st, { langPolicy: el.value }); }));
  on(root, 'change', '#opGloss', (e, el) => act((st) => { setOps(st, { glossary: el.checked }); }, { hours: el_hours(el.checked, 1), label: 'Support: product glossary' }));
  on(root, 'change', '#opRefund', (e, el) => act((st) => { setOps(st, { refundWindowDays: Number(el.value) }); }));
  on(root, 'change', '#opSec', (e, el) => act((st) => { setOps(st, { securityTxt: el.checked }); }, { hours: el_hours(el.checked, 1), label: 'Support: security.txt and disclosure policy' }));
  on(root, 'change', '[data-aiscope]', (e, el) => act((st) => { setAiScope(st, el.dataset.aiscope, el.value); }));
  on(root, 'change', '[data-macfor]', (e, el) => act((st) => { const m = (st.apps.support.macros ?? []).find((x) => x.id === el.dataset.macfor); if (m) m.for = el.value || null; }));
}
const el_hours = (on_, h) => (on_ ? h : 0);
void round2; void isLiveSub;
