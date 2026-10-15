// Outreach (Instantly/Smartlead/Apollo sequences): sending infrastructure (secondary domains, inboxes,
// SPF/DKIM/DMARC, warmup, caps), sequences the player writes, enrollment, deliverability metrics that focus
// on replies (not opens), LinkedIn connection requests, and a managed AI SDR you can switch on and off.
import { writingHours } from '../core/calendar.js';
import { html, mount, on, formData, stat, badge, table, toast, barChart } from '../core/ui.js';
import { money, pct, fmtDate, uid, clamp, rng, dayOfMonth } from '../core/util.js';
import { post, addRecurring } from '../core/bank.js';
import { SALES, HOURS } from './sales/params.js';
import { analyzeCopy, specificity, spamminess, VARS } from './sales/copy.js';
import { warmupProgress, recommendedCap, effectiveCap, authComplete, domainHealth, healthLabel, checkSecondaryDomain, inboxPlacement } from './sales/deliverability.js';
import { ensureOutreach, ensureCrm, ensureCalls, contactName, companyById, contactById, ensureDeal, addActivity } from './sales/model.js';
import { outreachDay, startAiSdr, stopAiSdr, linkedinWindow, stepKey, stepQuality, renderStep } from './sales/engine.js';
import { SALES_JOBS } from './sales/jobs.js';
import { repliesView, wireReplies } from './sales/inbox-view.js';
import { burnSummary, newDomainTerms, isBurned } from './sales/market-burn.js';
import { ensureInbox } from './sales/inbox.js';

const drafts = {}; // stepId -> { subject, body, delayDays } in-progress edits (survive re-renders)
let previewContactId = null;
let enrollSel = new Set();
let enrollFilter = 'ready';
const liNotes = {};

const DNS = {
  spf: (d) => `${d}  TXT  "v=spf1 include:_spf.google.com ~all"`,
  dkim: (d) => `google._domainkey.${d}  TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA…"`,
  dmarc: (d) => `_dmarc.${d}  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@${d}"`,
};

const STARTER = [
  { subject: '{{company}} + quick question', body: 'Hi {{firstName}},\n\n{{personalization}}\n\n<One sentence on the specific problem you think they have and what it costs them.>\n\n<One sentence of proof: who you helped and the result.>\n\nWorth a look?\n\n{{senderName}}\n\nP.S. Not relevant? Just say so and I won\'t follow up.', delayDays: 0 },
  { subject: '', body: 'Hi {{firstName}}, <a different angle or a tiny useful insight, under 50 words>. Open to seeing how {{company}} could do this?\n\n{{senderName}}', delayDays: 3 },
  { subject: '', body: '{{firstName}}, should I close the loop on this? If {{company}} handles it fine today, totally understood.\n\n{{senderName}}', delayDays: 4 },
];

function syncInboxBill(state) {
  const o = ensureOutreach(state);
  let r = state.recurring.find((x) => x.id === o.inboxRecurringId);
  const amount = o.inboxes.length * SALES.inboxMonthly;
  if (!r && amount) { r = addRecurring(state, { vendor: 'Google Workspace (sending inboxes)', amount, category: 'software', dayOfMonth: 3, note: `${o.inboxes.length} cold-email inboxes` }); o.inboxRecurringId = r.id; }
  if (r) { r.amount = amount; r.active = amount > 0; r.note = `${o.inboxes.length} cold-email inboxes`; }
}

function last30(o, day) {
  const rows = o.daily.filter((d) => d.day > day - 30);
  const t = rows.reduce((a, d) => { for (const k of Object.keys(d)) if (k !== 'day') a[k] = (a[k] ?? 0) + d[k]; return a; }, {});
  return { rows, t };
}

// ---------------------------------------------------------------------------

function overviewView(s, o) {
  const { t } = last30(o, s.day);
  const meetings = ensureCalls(s).meetings.filter((m) => m.bookedDay > s.day - 30 && m.source !== 'inbound');
  const seqTotals = o.sequences.reduce((a, q) => ({ sent: a.sent + q.stats.sent, bounced: a.bounced + q.stats.bounced, replies: a.replies + q.stats.replies, positive: a.positive + q.stats.positive, opens: a.opens + q.stats.opens, complaints: a.complaints + q.stats.complaints }), { sent: 0, bounced: 0, replies: 0, positive: 0, opens: 0, complaints: 0 });
  const prospects = new Set(o.enrollments.filter((e) => e.sent.length).map((e) => e.contactId)).size;
  const bounceRate = t.sent ? (t.bounced ?? 0) / t.sent : 0;
  const complaintRate = t.sent ? (t.complaints ?? 0) / t.sent : 0;
  const issues = [];
  if (!o.sequencer) issues.push(html`<div class="callout warn">No sequencer subscription yet. <a href="#/outreach/infra">Set up sending infrastructure →</a></div>`);
  if (!o.domains.length) issues.push(html`<div class="callout warn">Never cold-email from your main domain. Buy 2–3 lookalike secondary domains first.</div>`);
  for (const d of o.domains) if (!authComplete(d)) issues.push(html`<div class="callout bad">${d.name} is missing ${['spf', 'dkim', 'dmarc'].filter((k) => !d.auth[k]).map((k) => k.toUpperCase()).join(', ')}. Gmail has been rejecting unauthenticated mail since its Nov 2025 enforcement ramp.</div>`);
  if (o.inboxes.some((i) => warmupProgress(i, s.day) < 1)) issues.push(html`<div class="callout">Some inboxes are still warming up (3–6 weeks). Sending cold volume early lands in spam.</div>`);
  const burn = burnSummary(s);
  if (burn.burned || burn.hotSegments.length || burn.domainBurns) issues.push(html`<div class="callout warn"><b>Your market remembers.</b> ${burn.burned ? `${burn.burned} account(s) burned by over-contacting or spam reports (they ignore you for ~6 months). ` : ''}${burn.hotSegments.length ? `Untargeted volume has cooled these segments: ${burn.hotSegments.map((x) => `${x.id} (reply rates ×${x.mult.toFixed(2)})`).join(', ')}. ` : ''}${burn.domainBurns ? `${burn.domainBurns} burnt domain(s): each new domain starts lower and warms up longer.` : ''} [game estimate]</div>`);
  return html`
    ${issues}
    <div class="stats">
      ${stat('Emails sent (30d)', t.sent ?? 0, `${prospects} prospects contacted all-time`)}
      ${stat('Bounce rate (30d)', pct(bounceRate), 'healthy < 2%, pause ≥ 5%', healthLabel(bounceRate, SALES.bounceHealthy, SALES.bouncePause) === 'good' ? 'good' : healthLabel(bounceRate, SALES.bounceHealthy, SALES.bouncePause))}
      ${stat('Spam complaints (30d)', pct(complaintRate, 2), 'target < 0.1%, ceiling 0.3%', complaintRate >= SALES.complaintCeiling ? 'bad' : complaintRate >= SALES.complaintTarget ? 'warn' : 'good')}
      ${stat('Replies (30d)', t.replies ?? 0, t.sent ? `${pct((t.replies ?? 0) / t.sent)} of emails` : '')}
      ${stat('Positive replies (30d)', t.positive ?? 0, t.replies ? `${pct((t.positive ?? 0) / t.replies, 0)} of replies` : 'interested + curious', t.positive ? 'good' : '')}
      ${stat('Meetings booked (30d)', meetings.length, prospects ? `${((meetings.length / Math.max(1, prospects)) * 100).toFixed(1)} per 100 prospects` : 'benchmark 0.5–2.5 per 100')}
    </div>
    <section class="panel"><h2>Daily sends & replies (90 days)</h2><canvas id="sendChart" style="display:block;width:100%"></canvas><p class="small muted" style="margin:8px 0 2px">Replies</p><canvas id="replyChart" style="display:block;width:100%"></canvas></section>
    <section class="panel"><h2>Sequences</h2>${table({
      rows: o.sequences, empty: html`No sequences yet. <a href="#/outreach/sequences">Write one →</a>`,
      rowAttrs: (q) => `class="clickable" data-seq="${q.id}"`,
      columns: [
        { label: 'Sequence', render: (q) => html`<b>${q.name}</b> ${badge(q.status, q.status === 'active' ? 'good' : q.status === 'paused' ? 'warn' : '')}` },
        { label: 'Enrolled', align: 'right', render: (q) => o.enrollments.filter((e) => e.sequenceId === q.id).length },
        { label: 'Sent', align: 'right', render: (q) => q.stats.sent },
        { label: 'Bounce', align: 'right', render: (q) => (q.stats.sent ? pct(q.stats.bounced / q.stats.sent) : '—') },
        { label: 'Reply rate', align: 'right', render: (q) => { const n = new Set(o.enrollments.filter((e) => e.sequenceId === q.id && e.sent.length).map((e) => e.contactId)).size; return n ? pct(q.stats.replies / n) : '—'; } },
        { label: 'Positive', align: 'right', render: (q) => q.stats.positive },
        { label: html`<span title="Apple Mail Privacy Protection and security scanners auto-open emails">Opens ⚠︎</span>`, align: 'right', render: (q) => (q.trackOpens ? html`<span class="muted">${q.stats.sent ? pct(q.stats.opens / q.stats.sent, 0) : '—'}</span>` : html`<span class="muted small">off</span>`) },
      ],
    })}
    <p class="hint">Open rates are inflated 15–30 points by Apple Mail Privacy Protection, Gmail image proxies and security scanners. Judge campaigns by replies, positive replies and meetings. A very low open rate (&lt;15%) only hints at spam placement. Totals: ${seqTotals.sent} sent, ${seqTotals.replies} replies, ${seqTotals.positive} positive.</p></section>`;
}

function infraView(s, o) {
  const primary = s.company.domain || (s.company.name || 'acme').toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  return html`
    <section class="panel"><h2>Sequencer</h2>
      ${o.sequencer ? html`<p>${badge('active', 'good')} Sequencer plan: ${money(SALES.sequencerMonthly)}/month (inbox rotation, scheduling, unified inbox).</p><button class="sm danger" id="cancelSeqr">Cancel plan</button>` : html`<p class="muted">You need a sequencer (Instantly/Smartlead-style) to send scheduled sequences across multiple inboxes. ${money(SALES.sequencerMonthly)}/month.</p><button class="primary" id="buySeqr">Subscribe (${money(SALES.sequencerMonthly)}/mo)</button>`}
    </section>
    <section class="panel"><h2>Secondary sending domains</h2>
      <p class="small muted">Buy lookalikes of ${primary} (e.g. get${primary}, try${primary}): .com, no hyphens or numbers, redirect them to your site. 2–3 inboxes each. ~${money(SALES.domainCostYear)}/year each.</p>
      <form id="domainForm" class="inline"><label>Domain <input name="name" placeholder="get${primary}" /></label><button class="primary">Buy (${money(SALES.domainCostYear)}/yr)</button></form>
      ${o.domains.map((d) => {
        const ibs = o.inboxes.filter((i) => i.domainId === d.id);
        const h = domainHealth(d, s.day);
        return html`<div class="card" style="margin-top:10px">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${d.name}</b><span class="small">Reputation ${Math.round(d.reputation)}/100 · bounce ${pct(h.bounceRate)} · complaints ${pct(h.complaintRate, 2)} (30d, ${h.sent} sent)</span></div>
          <div class="meter" style="margin:6px 0"><div style="width:${Math.round(d.reputation)}%;background:var(${d.reputation < 30 ? '--bad' : d.reputation < 55 ? '--warn' : '--good'})"></div></div>
          <h3>Authentication</h3>
          <ul class="list small">${['spf', 'dkim', 'dmarc'].map((k) => html`<li style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>${d.auth[k] ? '✅' : '⬜'} <b>${k.toUpperCase()}</b> <code style="word-break:break-all">${DNS[k](d.name)}</code></span>${d.auth[k] ? '' : html`<button class="sm" data-auth="${d.id}" data-k="${k}">Add record (15 min)</button>`}</li>`)}
            <li>${d.redirect ? '✅' : '⬜'} Redirect to your main site ${d.redirect ? '' : html`<button class="sm" data-redirect="${d.id}">Set up (5 min)</button>`}</li></ul>
          <h3>Inboxes (${ibs.length}${ibs.length > SALES.inboxesPerDomainSafe ? ' · aggressive' : ''})</h3>
          ${ibs.map((i) => {
            const w = warmupProgress(i, s.day);
            return html`<div style="border-top:1px solid var(--border);padding:6px 0">
              <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span><b>${i.address}</b> ${i.paused ? badge('paused', 'warn') : ''}</span>
                <span class="small">Warmup ${Math.round(w * 100)}% · recommended ${recommendedCap(i, s.day)}/day · sending ${effectiveCap(i, s.day)}/day</span></div>
              <div class="meter"><div style="width:${Math.round(w * 100)}%"></div></div>
              <div class="inline" style="margin-top:4px">
                ${i.warmupStartDay == null ? html`<button class="sm primary" data-warm="${i.id}">Start warmup</button>` : html`<span class="small muted">Warming since ${fmtDate(s, i.warmupStartDay)}</span>`}
                <label style="max-width:180px;margin:0">Daily cold limit <select data-limit="${i.id}">${['auto', 10, 20, 30, 40, 50, 75, 100].map((v) => html`<option value="${v}" ${String(i.dailyLimit ?? 'auto') === String(v) ? 'selected' : ''}>${v === 'auto' ? 'auto (follow ramp)' : v}</option>`)}</select></label>
                <button class="sm" data-pause="${i.id}">${i.paused ? 'Resume' : 'Pause'}</button>
              </div></div>`;
          })}
          <form class="inline" data-inboxform="${d.id}"><label>New inbox <input name="local" placeholder="${(s.founder.name.split(' ')[0] || 'me').toLowerCase()}" /></label><span class="small muted">@${d.name}</span><button class="sm">Add inbox (${money(SALES.inboxMonthly)}/mo)</button></form>
        </div>`;
      })}
    </section>
    <section class="panel"><h2>Inbox placement test</h2><p class="small muted">Seed-list test (GlockApps-style): sends to test inboxes at Gmail/Outlook/Yahoo and reports where it lands. $10.</p>
      <button id="placementTest" ${o.inboxes.length && o.sequences.length ? '' : 'disabled'}>Run placement test (10 min, $10)</button>
      ${o.placementTest ? html`<p>Last test ${fmtDate(s, o.placementTest.day)}: <b>${pct(o.placementTest.inbox, 0)}</b> primary inbox · ${pct(1 - o.placementTest.inbox, 0)} spam/promotions.</p>` : ''}</section>`;
}

function sequencesView(s, o) {
  return html`<section class="panel"><h2>Sequences</h2>
    <p class="small muted">4–7 short steps over ~3 weeks (3–4 business days apart, 7 for enterprise). Under 80 words, plain text, one soft question, no link in email 1, and a specific first line about them.</p>
    <form id="newSeq" class="inline"><label>Name <input name="name" required placeholder="Shopify owners – reconciliation" /></label><button class="primary">New sequence</button></form>
    <ul class="list">${o.sequences.map((q) => html`<li><a href="#/outreach/seq:${q.id}"><b>${q.name}</b></a> ${badge(q.status, q.status === 'active' ? 'good' : q.status === 'paused' ? 'warn' : '')} <span class="small muted">${q.steps.length} steps · ${o.enrollments.filter((e) => e.sequenceId === q.id).length} enrolled</span></li>`)}</ul></section>`;
}

function lintHtml(a) {
  return html`<div class="small">Quality ${Math.round(a.score * 100)}/100 · ${a.words} words ${a.hasOptOut ? badge('opt-out ✓', 'good') : badge('no opt-out', 'warn')} ${a.usesPersonalization ? badge('{{personalization}}', 'accent') : ''}
    ${a.issues.length ? html`<ul style="margin:4px 0 0 16px;padding:0">${a.issues.map((i) => html`<li>${i}</li>`)}</ul>` : html`<span class="pos"> Looks clean.</span>`}</div>`;
}

function seqEditor(s, o, seq) {
  const crm = ensureCrm(s);
  const enrolled = new Set(o.enrollments.filter((e) => e.sequenceId === seq.id).map((e) => e.contactId));
  // Dedupe like a real sequencer: active anywhere, or finished in the last 60 days → not eligible.
  const busy = new Set(o.enrollments.filter((e) => e.status === 'active' || (e.finishedDay != null && s.day - e.finishedDay < SALES.reenroll.coolDownDays)).map((e) => e.contactId));
  const eligible = crm.contacts.filter((c) => c.email && !c.hidden && !enrolled.has(c.id) && !busy.has(c.id) && !['unsubscribed', 'bounced', 'customer', 'disqualified', 'meeting'].includes(c.status) && !c.replyKind);
  const shown = eligible.filter((c) => enrollFilter === 'all' || (enrollFilter === 'ready' ? c.verification && c.verification !== 'invalid' : enrollFilter === 'personalized' ? c.personalization : !c.verification));
  const pv = contactById(s, previewContactId) ?? crm.contacts.find((c) => enrolled.has(c.id)) ?? eligible[0];
  const pvCo = pv ? companyById(s, pv.companyId) : null;
  return html`
    <p><a href="#/outreach/sequences">← Sequences</a></p>
    <div class="app-head"><div><h1>${seq.name}</h1><p>${badge(seq.status, seq.status === 'active' ? 'good' : seq.status === 'paused' ? 'warn' : '')} ${enrolled.size} enrolled · ${seq.stats.sent} sent · ${seq.stats.replies} replies (${seq.stats.positive} positive) · ${seq.stats.bounced} bounced · ${seq.stats.complaints} spam complaints</p></div>
      <div class="app-actions">
        ${seq.status !== 'active' ? html`<button class="primary" id="launch" ${seq.steps.length ? '' : 'disabled'}>${seq.status === 'draft' ? 'Launch' : 'Resume'}</button>` : html`<button id="pauseSeq">Pause</button>`}
        <button id="judge" ${seq.steps.length ? '' : 'disabled'}>Re-judge copy</button>
      </div></div>
    <div class="grid-2">
      <section class="panel"><h2>Steps</h2>
        <p class="hint">Variables: ${VARS.map((v) => `{{${v}}}`).join(' ')} · fallback: {{firstName|there}}</p>
        ${seq.steps.map((st, i) => {
          const d = drafts[st.id] ?? st;
          const j = seq.judge?.[stepKey(st)];
          return html`<fieldset><legend>Step ${i + 1}${i ? html` · wait <input type="number" min="1" max="21" data-delay="${st.id}" value="${d.delayDays}" style="width:60px;display:inline-block" /> business days` : ' · day 0'}</legend>
            <label>Subject ${i ? html`<span class="muted small">(blank = reply in same thread)</span>` : ''}<input id="subj_${st.id}" data-subj="${st.id}" value="${d.subject}" /></label>
            <label>Body <textarea rows="8" id="body_${st.id}" data-body="${st.id}">${d.body}</textarea></label>
            <div id="lint_${st.id}">${lintHtml(analyzeCopy(d, i))}</div>
            ${j ? html`<div class="callout ${j.quality >= 0.6 ? 'good' : j.quality >= 0.4 ? '' : 'warn'}" style="margin-top:6px"><b>Prospect panel: ${Math.round(j.quality * 100)}/100</b> ${j.mock ? badge('offline heuristic') : badge(`${j.samples} real prospects × AI judges`, 'accent')}
              ${(j.verdicts ?? []).slice(0, 2).map((v) => html`<div class="small">“${v.verdict}”${v.fixes?.length ? html` <span class="muted">Fix: ${v.fixes.join('; ')}</span>` : ''}</div>`)}</div>` : ''}
            <div class="inline" style="margin-top:6px"><button class="sm primary" data-savestep="${st.id}">Save step (${Math.round(HOURS.writeStep * 60)} min)</button><button class="sm danger" data-delstep="${st.id}">Remove</button></div>
          </fieldset>`;
        })}
        <div class="inline"><button id="addStep">+ Add step</button>${seq.steps.length ? '' : html`<button id="starter">Start from a skeleton (you still write it)</button>`}</div>
        <h3>Settings</h3>
        <label><input type="checkbox" id="trackOpens" ${seq.trackOpens ? 'checked' : ''} /> Track opens (unreliable; tracking pixels may hurt placement)</label>
      </section>
      <section class="panel"><h2>Preview</h2>
        ${pv ? html`<label>As received by <select id="pvSel">${[...crm.contacts.filter((c) => enrolled.has(c.id)), ...eligible].slice(0, 200).map((c) => html`<option value="${c.id}" ${c.id === pv.id ? 'selected' : ''}>${contactName(c)} · ${companyById(s, c.companyId)?.name ?? ''}</option>`)}</select></label>
          ${seq.steps.map((st, i) => { const r = renderStep(s, seq, i, pv, pvCo); return html`<div class="card"><div class="small muted">Step ${i + 1} · to ${pv.email}</div><b>${r.subject}</b><pre style="font:inherit;white-space:pre-wrap;margin:6px 0 0">${r.body}</pre></div>`; })}
          <p class="small">First line specificity for ${contactName(pv)}: <b>${Math.round(specificity(pv.personalization, pvCo ?? {}) * 100)}/100</b> ${pv.personalization ? '' : html`<span class="warn">(no personalization line: <a href="#/crm/company:${pv.companyId}">write one</a>)</span>`}</p>` : html`<p class="muted">Add prospects in the CRM to preview.</p>`}
        <h2 style="margin-top:14px">Enroll prospects</h2>
        <div class="inline"><label style="max-width:240px">Show <select id="enrollFilter">${[['ready', 'Verified (not invalid)'], ['personalized', 'Has personalization line'], ['unverified', 'Unverified'], ['all', 'All eligible']].map(([k, l]) => html`<option value="${k}" ${k === enrollFilter ? 'selected' : ''}>${l}</option>`)}</select></label>
          <button class="primary" id="enroll" ${enrollSel.size ? '' : 'disabled'}>Enroll ${enrollSel.size}</button></div>
        ${eligible.some((c) => !c.verification) ? html`<p class="hint warn">${eligible.filter((c) => !c.verification).length} eligible prospects are unverified: unverified lists bounce ~2.1% vs 1.2% verified, and "invalid" ones ~10.6%.</p>` : ''}
        ${shown.length ? html`<div class="table-wrap" style="max-height:340px;overflow:auto"><table><thead><tr><th><input type="checkbox" id="enrollAll" /></th><th>Prospect</th><th>Email</th><th>First line</th></tr></thead><tbody>
          ${shown.slice(0, 300).map((c) => html`<tr><td><input type="checkbox" data-enroll="${c.id}" ${enrollSel.has(c.id) ? 'checked' : ''} /></td><td>${contactName(c)}<div class="small muted">${companyById(s, c.companyId)?.name ?? ''}</div></td>
            <td class="small">${c.email}<div>${c.verification ? badge(c.verification.replace('_', '-'), c.verification === 'valid' ? 'good' : c.verification === 'invalid' ? 'bad' : 'warn') : badge('unverified')}${c.role ? badge('role', 'warn') : ''}${isBurned(s, companyById(s, c.companyId)) ? badge('account burned', 'bad') : ''}</div></td>
            <td>${c.personalization ? badge(`${Math.round(specificity(c.personalization, companyById(s, c.companyId) ?? {}) * 100)}`, 'accent') : html`<span class="muted small">—</span>`}</td></tr>`)}
          </tbody></table></div>` : html`<p class="empty">No eligible prospects for this filter.</p>`}
      </section>
    </div>`;
}

function linkedinView(s, o) {
  const crm = ensureCrm(s);
  const w = linkedinWindow(s);
  const withLi = crm.contacts.filter((c) => c.linkedin && !c.hidden);
  const req = (c) => [...o.linkedin.requests].reverse().find((r) => r.contactId === c.id);
  return html`<section class="panel"><h2>LinkedIn</h2>
    <div class="stats">
      ${stat('Requests this week', `${w.recent} / ${w.limit}`, 'rolling 7 days', w.left ? '' : 'warn')}
      ${stat('Acceptance rate', w.acceptance == null ? '—' : pct(w.acceptance, 0), 'below ~30% LinkedIn lowers your limit', w.acceptance != null && w.acceptance < 0.3 ? 'bad' : '')}
      ${stat('Connected prospects', crm.contacts.filter((c) => c.linkedinConnected).length, 'email + LinkedIn ≈ 2× positive replies')}
    </div>
    <p class="small">${o.linkedin.salesNav ? html`${badge('Sales Navigator', 'good')} unlimited notes · <button class="sm" id="cancelNav">Cancel</button>` : html`Personalized notes this month: ${o.linkedin.requests.filter((r) => r.note && r.day > s.day - 30).length}/${SALES.linkedin.freeNotesPerMonth} (free account) · <button class="sm" id="buyNav">Sales Navigator (${money(SALES.linkedin.salesNavMonthly)}/mo)</button>`}</p>
    <p class="hint">LinkedIn publishes no official limit; ~100 invitations per rolling week is what most accounts observe in 2026. Bots that blast 100+/day get accounts restricted. Free accounts can only add a few personalized notes a month, so make them count.</p>
    ${table({
      rows: withLi, empty: 'No prospects with a LinkedIn URL. Add one on the contact (CRM) or map the column on import.',
      columns: [
        { label: 'Prospect', render: (c) => html`<a href="${c.linkedin}" target="_blank" rel="noopener noreferrer">${contactName(c)}</a><div class="small muted">${c.title} · ${companyById(s, c.companyId)?.name ?? ''}</div>` },
        { label: 'Status', render: (c) => { const r = req(c); return c.linkedinConnected ? badge('connected', 'good') : r ? badge(r.status, r.status === 'ignored' ? 'bad' : '') : badge('not connected'); } },
        { label: 'Action', render: (c) => (c.linkedinConnected
          ? (c.replyKind ? html`<span class="small muted">replied</span>` : o.linkedin.messages.some((m) => m.contactId === c.id) ? html`<span class="small muted">message sent</span>` : html`<div><textarea rows="2" id="dm_${c.id}" placeholder="Short, specific message. No pitch-slap."></textarea><button class="sm" data-dm="${c.id}">Send message (6 min)</button></div>`)
          : req(c)?.status === 'pending' ? html`<span class="small muted">pending</span>` : html`<div><input id="note_${c.id}" data-linote="${c.id}" maxlength="200" placeholder="Optional note (≤200 chars)" value="${liNotes[c.id] ?? ''}" /><button class="sm" data-connect="${c.id}" ${w.left ? '' : 'disabled'}>Connect</button></div>`) },
      ],
    })}</section>`;
}

function aiSdrView(s, o) {
  const a = o.aiSdr;
  const A = SALES.aiSdr;
  const weeks = a.active ? (s.day - a.startDay) / 7 : 0;
  return html`<section class="panel"><h2>AI SDR (managed agent)</h2>
    <p>An autonomous "AI SDR" (11x/Artisan-style) researches, writes and sends from its own vendor database and domains, books meetings into your calendar, and handles replies. You never see the emails it sends.</p>
    <div class="callout warn"><b>What the evidence says (2025–26):</b> volume ×3–5 and far fewer founder hours, but reply rates decay to ~0.5–1.5% within 4–8 weeks, 12–18% of emails contain hallucinated facts about the prospect, meetings convert to opportunities at ~35–45% vs 50–60% when founders book them, and 50–70% of programs are cancelled within 90 days. Use it only after you have a message that works. (LeadGen Economy Apr 2026, mostly estimates; TechCrunch on 11x, Mar 2025.)</div>
    ${a.active ? html`<div class="stats">
        ${stat('Running for', `${weeks.toFixed(1)} weeks`, `${money(A.monthly)}/month`)}
        ${stat('Emails sent', a.sent.toLocaleString('en-US'))}
        ${stat('Replies', a.replies, a.sent ? pct(a.replies / a.sent, 2) : '')}
        ${stat('Meetings booked', a.meetings, '', a.meetings ? 'good' : '')}
        ${stat('Hallucinated emails', a.hallucinations.toLocaleString('en-US'), 'est. factual errors', 'warn')}
        ${stat('Spam complaints', a.complaints, '', a.complaints > 10 ? 'bad' : '')}
        ${stat('Its domain reputation', Math.round(a.reputation), '/100', a.reputation < 35 ? 'bad' : '')}
      </div><button class="danger" id="stopSdr">Cancel AI SDR</button>`
      : html`<p>${money(A.monthly)}/month, cancel any time (many real vendors require annual contracts). Onboarding call: 2h.</p>
        ${s.company.path === 'indie' ? html`<p class="small warn">On a bootstrapped budget this is hard to justify before you have paying customers.</p>` : ''}
        <button class="primary" id="startSdr">Start AI SDR</button>`}
  </section>`;
}

// ---------------------------------------------------------------------------

export default {
  id: 'outreach',
  title: 'Outreach',
  icon: '📤',
  group: 'Sales',
  models: ['smb', 'ent'],
  onDay(state) { outreachDay(state); },
  jobs: SALES_JOBS,
  render(root, ctx) {
    const s = ctx.state;
    const o = ensureOutreach(s);
    const [tab0, id] = ctx.params.split(':');
    const tab = tab0 || 'overview';
    const seq = tab === 'seq' ? o.sequences.find((q) => q.id === id) : null;
    const replyN = (o.inbox?.items ?? []).filter((x) => !['handled', 'ignored'].includes(x.status)).length;
    const tabs = [['overview', 'Overview'], ['replies', `Replies${replyN ? ` (${replyN})` : ''}`], ['sequences', 'Sequences'], ['infra', 'Sending infrastructure'], ['linkedin', 'LinkedIn'], ['aisdr', `AI SDR${o.aiSdr.active ? ' ●' : ''}`]];
    const body = seq ? seqEditor(s, o, seq) : tab === 'replies' ? repliesView(s) : tab === 'infra' ? infraView(s, o) : tab === 'sequences' || tab === 'seq' ? sequencesView(s, o) : tab === 'linkedin' ? linkedinView(s, o) : tab === 'aisdr' ? aiSdrView(s, o) : overviewView(s, o);
    mount(root, html`
      ${seq ? '' : html`<div class="app-head"><div><h1>Outreach</h1><p>Cold email the 2026 way: secondary domains, authenticated and warmed inboxes, ~30 sends per inbox per day, short specific emails you write yourself. Measure replies and meetings, not opens.</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => html`<a href="#/outreach/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>`}
      ${body}`);

    if (tab === 'overview') {
      const rows = [];
      for (let d = s.day - 89; d <= s.day; d++) rows.push(o.daily.find((x) => x.day === d) ?? { sent: 0, replies: 0, positive: 0 });
      const sc = root.querySelector('#sendChart'), rc = root.querySelector('#replyChart');
      if (sc) barChart(sc, rows.map((r) => r.sent), { format: (v) => `${Math.round(v)} sent`, height: 90 });
      if (rc) barChart(rc, rows.map((r) => r.replies), { format: (v) => `${Math.round(v)} repl.`, height: 60, color: '--good' });
    }
    on(root, 'click', '[data-seq]', (e, el) => ctx.navigate('outreach', `seq:${el.dataset.seq}`));
    if (tab === 'replies') wireReplies(root, ctx);

    // infra
    on(root, 'click', '#buySeqr', () => ctx.act((st) => {
      const oo = ensureOutreach(st);
      post(st, { amount: -SALES.sequencerMonthly, counterparty: 'Sequencer', description: 'Cold email sequencer, first month', category: 'software', method: 'card' });
      const r = addRecurring(st, { vendor: 'Sequencer (cold email)', amount: SALES.sequencerMonthly, category: 'software', dayOfMonth: Math.min(28, dayOfMonth(st)) }); // anniversary billing: the first month was just paid
      oo.sequencer = true; oo.sequencerRecurringId = r.id;
    }, { hours: 0.25, label: 'Outbound setup' }));
    on(root, 'click', '#cancelSeqr', () => ctx.act((st) => {
      const oo = ensureOutreach(st);
      oo.sequencer = false;
      const r = st.recurring.find((x) => x.id === oo.sequencerRecurringId);
      if (r) r.active = false;
    }));
    on(root, 'submit', '#domainForm', (e) => {
      e.preventDefault();
      const name = formData(e.target).name.trim().toLowerCase();
      const issues = checkSecondaryDomain(name, s.company.domain);
      if (issues.includes('Not a valid domain') || issues.some((i) => i.startsWith('Never'))) return toast(issues.join(' · '), 'bad');
      ctx.act((st) => {
        const oo = ensureOutreach(st);
        if (oo.domains.some((d) => d.name === name)) throw new Error('You already own that domain.');
        post(st, { amount: -SALES.domainCostYear, counterparty: 'Domain registrar', description: `Domain ${name} (1 year)`, category: 'software', method: 'card' });
        const terms = newDomainTerms(st);
        oo.domains.push({ id: uid('dom'), name, boughtDay: st.day, auth: { spf: false, dkim: false, dmarc: false }, redirect: false, reputation: terms.reputation, warmupDays: terms.warmupDays, log: [] });
        if (terms.burns) toast(`After ${terms.burns} burnt domain(s), ${name} starts at reputation ${terms.reputation} and needs ~${terms.warmupDays} days of warmup.`, 'warn');
        if (issues.length) toast(`Bought ${name}. Heads-up: ${issues.join(' · ')}`, 'warn');
      }, { hours: HOURS.buyDomain, label: 'Outbound setup' });
    });
    on(root, 'click', '[data-auth]', (e, el) => ctx.act((st) => { ensureOutreach(st).domains.find((d) => d.id === el.dataset.auth).auth[el.dataset.k] = true; }, { hours: HOURS.dnsRecord, label: 'DNS setup' }));
    on(root, 'click', '[data-redirect]', (e, el) => ctx.act((st) => { ensureOutreach(st).domains.find((d) => d.id === el.dataset.redirect).redirect = true; }, { hours: 0.08, label: 'DNS setup' }));
    on(root, 'submit', '[data-inboxform]', (e) => {
      e.preventDefault();
      const domId = e.target.dataset.inboxform;
      const local = formData(e.target).local.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (!local) return toast('Enter a mailbox name, e.g. your first name.', 'warn');
      ctx.act((st) => {
        const oo = ensureOutreach(st);
        const d = oo.domains.find((x) => x.id === domId);
        const address = `${local}@${d.name}`;
        if (oo.inboxes.some((i) => i.address === address)) throw new Error('That inbox exists.');
        oo.inboxes.push({ id: uid('ib'), domainId: d.id, address, createdDay: st.day, warmupStartDay: null, warmupDays: d.warmupDays, dailyLimit: 'auto', paused: false, sentTotal: 0 });
        syncInboxBill(st);
        if (oo.inboxes.filter((i) => i.domainId === d.id).length > SALES.inboxesPerDomainSafe) toast('More than 3 inboxes on one domain is aggressive: one bad day burns them all.', 'warn');
      }, { hours: HOURS.addInbox, label: 'Outbound setup' });
    });
    on(root, 'click', '[data-warm]', (e, el) => ctx.act((st) => { ensureOutreach(st).inboxes.find((i) => i.id === el.dataset.warm).warmupStartDay = st.day; }, { hours: 0.05, label: 'Outbound setup' }));
    on(root, 'change', '[data-limit]', (e, el) => ctx.act((st) => {
      const i = ensureOutreach(st).inboxes.find((x) => x.id === el.dataset.limit);
      i.dailyLimit = el.value === 'auto' ? 'auto' : Number(el.value);
      if (i.dailyLimit !== 'auto' && i.dailyLimit > SALES.hardCapPerInbox) toast('Above 50/day per inbox is high risk: placement drops and reputation burns.', 'warn');
    }));
    on(root, 'click', '[data-pause]', (e, el) => ctx.act((st) => { const i = ensureOutreach(st).inboxes.find((x) => x.id === el.dataset.pause); i.paused = !i.paused; }));
    on(root, 'click', '#placementTest', () => ctx.act((st) => {
      const oo = ensureOutreach(st);
      const q = oo.sequences.find((x) => x.steps.length);
      if (!q) throw new Error('Write a sequence first: the test sends your step 1.');
      post(st, { amount: -10, counterparty: 'Placement test', description: 'Seed-list inbox placement test', category: 'software', method: 'card' });
      const a = analyzeCopy(q.steps[0], 0);
      const vals = oo.inboxes.map((i) => inboxPlacement({ domain: oo.domains.find((d) => d.id === i.domainId), warmup: warmupProgress(i, st.day), content: stepQuality(q, q.steps[0], 0), spam: spamminess(a), trackOpens: q.trackOpens }));
      oo.placementTest = { day: st.day, inbox: clamp(vals.reduce((x, y) => x + y, 0) / vals.length + (rng(st) - 0.5) * 0.08, 0, 1) };
    }, { hours: 0.15, label: 'Deliverability' }));

    // sequences
    on(root, 'submit', '#newSeq', (e) => {
      e.preventDefault();
      const { name } = formData(e.target);
      ctx.act((st) => {
        const q = { id: uid('seq'), name: name.trim(), steps: [], status: 'draft', createdDay: st.day, trackOpens: false, inboxIds: [], judge: {}, stats: { sent: 0, bounced: 0, inboxed: 0, opens: 0, complaints: 0, replies: 0, positive: 0 } };
        ensureOutreach(st).sequences.push(q);
        ctx.navigate('outreach', `seq:${q.id}`);
      });
    });

    // linkedin
    on(root, 'input', '[data-linote]', (e, el) => { liNotes[el.dataset.linote] = el.value; });
    on(root, 'click', '[data-connect]', (e, el) => {
      const c = contactById(s, el.dataset.connect);
      let note = (liNotes[c.id] ?? '').trim().slice(0, 200);
      const notesUsed = ensureOutreach(s).linkedin.requests.filter((r) => r.note && r.day > s.day - 30).length;
      if (note && !ensureOutreach(s).linkedin.salesNav && notesUsed >= SALES.linkedin.freeNotesPerMonth) { toast(`Free LinkedIn allows ~${SALES.linkedin.freeNotesPerMonth} personalized notes a month: sent without the note.`, 'warn'); note = ''; }
      ctx.act((st) => {
        const w = linkedinWindow(st);
        if (!w.left) throw new Error(`Weekly invitation limit reached (${w.limit}). Wait a few days.`);
        const co = companyById(st, c.companyId) ?? {};
        const a = note ? analyzeCopy({ subject: '', body: note }, 1) : null;
        let p = SALES.linkedin.acceptBase;
        if (note) p *= specificity(note, co) >= 0.5 ? 1.25 : 1;
        if (a && (a.buzz.length || a.slop.length || a.links || /\b(demo|our (product|platform|tool)|book a)\b/i.test(note))) p *= 0.7;
        if (/\b(owner|founder|ceo)\b/i.test(c.title)) p *= 0.9; // owners get the most invites
        if (st.founder.network.linkedin > 1000) p *= 1.1;
        ensureOutreach(st).linkedin.requests.push({ id: uid('li'), contactId: c.id, day: st.day, note, status: 'pending', pAccept: clamp(p, 0.05, 0.8), decideDay: st.day + 1 + Math.floor(rng(st) * 6) });
        addActivity(st, { type: 'linkedin', text: `LinkedIn connection request${note ? ` with note: "${note}"` : ''}`, companyId: c.companyId, contactId: c.id });
        delete liNotes[c.id];
      }, { hours: note ? HOURS.linkedinNote : HOURS.linkedinPlain, label: 'LinkedIn outreach' });
    });
    on(root, 'click', '[data-dm]', (e, el) => {
      const c = contactById(s, el.dataset.dm);
      const body = root.querySelector(`#dm_${c.id}`).value.trim();
      if (!body) return toast('Write the message first.', 'warn');
      ctx.act((st) => {
        const co = companyById(st, c.companyId) ?? {};
        const a = analyzeCopy({ subject: '', body }, 0);
        const q = clamp(0.6 * a.score + 0.4 * specificity(body, co), 0.1, 1);
        ensureOutreach(st).linkedin.messages.push({ id: uid('dm'), contactId: c.id, day: st.day, body, quality: q, pReply: clamp(SALES.linkedin.dmReplyCold * (0.4 + q), 0, 0.4), status: 'sent', decideDay: st.day + 1 + Math.floor(rng(st) * 4) });
        addActivity(st, { type: 'linkedin', text: 'Sent LinkedIn message', companyId: c.companyId, contactId: c.id });
      }, { hours: HOURS.linkedinDm, label: 'LinkedIn outreach' });
    });
    on(root, 'click', '#buyNav', () => ctx.act((st) => {
      const oo = ensureOutreach(st);
      post(st, { amount: -SALES.linkedin.salesNavMonthly, counterparty: 'LinkedIn', description: 'Sales Navigator Core, first month', category: 'software', method: 'card' });
      oo.linkedin.salesNav = true;
      oo.linkedin.navRecurringId = addRecurring(st, { vendor: 'LinkedIn Sales Navigator', amount: SALES.linkedin.salesNavMonthly, category: 'software', dayOfMonth: Math.min(28, dayOfMonth(st)) }).id;
    }, { hours: 0.1, label: 'LinkedIn setup' }));
    on(root, 'click', '#cancelNav', () => ctx.act((st) => {
      const oo = ensureOutreach(st);
      oo.linkedin.salesNav = false;
      const r = st.recurring.find((x) => x.id === oo.linkedin.navRecurringId);
      if (r) r.active = false;
    }));
    // AI SDR
    on(root, 'click', '#startSdr', () => ctx.act((st) => startAiSdr(st), { hours: 2, label: 'AI SDR onboarding' }));
    on(root, 'click', '#stopSdr', () => ctx.act((st) => stopAiSdr(st)));
    if (!seq) return;

    // linkedin handlers live below; sequence editor handlers:
    const relint = (stepId) => {
      const i = seq.steps.findIndex((x) => x.id === stepId);
      const box = root.querySelector(`#lint_${stepId}`);
      if (box && i >= 0) box.innerHTML = String(lintHtml(analyzeCopy(drafts[stepId], i)));
    };
    const draftOf = (id2) => (drafts[id2] ??= { ...seq.steps.find((x) => x.id === id2) });
    on(root, 'input', '[data-subj]', (e, el) => { draftOf(el.dataset.subj).subject = el.value; relint(el.dataset.subj); });
    on(root, 'input', '[data-body]', (e, el) => { draftOf(el.dataset.body).body = el.value; relint(el.dataset.body); });
    on(root, 'input', '[data-delay]', (e, el) => { draftOf(el.dataset.delay).delayDays = Math.max(1, Number(el.value) || 1); });
    on(root, 'click', '[data-savestep]', (e, el) => {
      const st0 = seq.steps.find((x) => x.id === el.dataset.savestep);
      const d = drafts[st0.id] ?? st0;
      const changed = d.subject !== st0.subject || d.body !== st0.body;
      ctx.act((st) => {
        if (changed) writingHours(st, HOURS.writeStep);
        Object.assign(st0, { subject: d.subject, body: d.body, delayDays: d.delayDays });
        delete drafts[st0.id];
        if (changed && seq.status === 'active') ctx.enqueue('sales:judgeSequence', { sequenceId: seq.id }, { label: 'Prospects reading your copy' });
      }, { hours: changed ? writingHours(ctx.state, HOURS.writeStep, { commit: false }) : 0, label: 'Writing cold email' });
    });
    on(root, 'click', '[data-delstep]', (e, el) => ctx.act(() => { seq.steps = seq.steps.filter((x) => x.id !== el.dataset.delstep); }));
    on(root, 'click', '#addStep', () => ctx.act(() => { seq.steps.push({ id: uid('step'), subject: seq.steps.length ? '' : '', body: '', delayDays: seq.steps.length ? 3 : 0 }); }));
    on(root, 'click', '#starter', () => ctx.act(() => { seq.steps = STARTER.map((x) => ({ ...x, id: uid('step') })); }));
    on(root, 'change', '#trackOpens', (e) => ctx.act(() => { seq.trackOpens = e.target.checked; }));
    on(root, 'change', '#pvSel', (e) => { previewContactId = e.target.value; ctx.render(); });
    on(root, 'click', '#launch', () => ctx.act((st) => {
      const oo = ensureOutreach(st);
      if (seq.steps.some((x) => !x.body.trim())) throw new Error('Every step needs a body.');
      if (seq.steps.some((x) => /<[^>]{8,}>/.test(x.body))) throw new Error('Replace the <placeholders> in the skeleton with your own words first.');
      if (!oo.sequencer) toast('Heads-up: no sequencer subscription, nothing will send. Outreach → Sending infrastructure.', 'warn');
      else if (!oo.inboxes.length) toast('Heads-up: no inboxes yet, nothing will send.', 'warn');
      seq.status = 'active';
      ctx.enqueue('sales:judgeSequence', { sequenceId: seq.id }, { label: 'Prospects reading your copy' });
    }, { hours: 0.1, label: 'Sequence QA' }));
    on(root, 'click', '#pauseSeq', () => ctx.act(() => { seq.status = 'paused'; }));
    on(root, 'click', '#judge', () => ctx.act(() => { ctx.enqueue('sales:judgeSequence', { sequenceId: seq.id }, { label: 'Prospects reading your copy' }); toast('Sample prospects are reading your sequence…'); }));
    on(root, 'change', '#enrollFilter', (e) => { enrollFilter = e.target.value; enrollSel = new Set(); ctx.render(); });
    on(root, 'change', '[data-enroll]', (e, el) => { if (el.checked) enrollSel.add(el.dataset.enroll); else enrollSel.delete(el.dataset.enroll); ctx.render(); });
    on(root, 'change', '#enrollAll', (e) => { const ids = [...root.querySelectorAll('[data-enroll]')].map((x) => x.dataset.enroll); enrollSel = e.target.checked ? new Set(ids) : new Set(); ctx.render(); });
    on(root, 'click', '#enroll', () => {
      const ids = [...enrollSel];
      ctx.act((st) => {
        const oo = ensureOutreach(st);
        for (const cid of ids) {
          const c = contactById(st, cid);
          if (!c) continue;
          if (oo.enrollments.some((e) => e.contactId === cid && (e.status === 'active' || (e.finishedDay != null && st.day - e.finishedDay < SALES.reenroll.coolDownDays)))) continue;
          const repeat = oo.enrollments.some((e) => e.contactId === cid);
          oo.enrollments.push({ id: uid('enr'), sequenceId: seq.id, contactId: cid, step: 0, nextDay: st.day + 1, status: 'active', sent: [], inboxId: null, enrolledDay: st.day, repeat });
          if (['new', 'no_reply', 'inbound'].includes(c.status)) c.status = 'enrolled';
          ensureDeal(st, { companyId: c.companyId, contactId: c.id, source: 'outbound', stage: 'lead' });
          addActivity(st, { type: 'sequence', text: `Enrolled in "${seq.name}"`, companyId: c.companyId, contactId: c.id });
        }
        enrollSel = new Set();
        if (seq.status === 'active') ctx.enqueue('sales:judgeSequence', { sequenceId: seq.id }, { label: 'Prospects reading your copy' });
        toast(`Enrolled ${ids.length}. ${seq.status === 'active' ? 'Sending starts next business day.' : 'Launch the sequence to start sending.'}`, 'good');
      }, { hours: HOURS.enrollBase + ids.length * HOURS.enrollPer, label: 'Sequence enrollment' });
    });
  },
};

