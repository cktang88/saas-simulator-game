// Outreach → AI SDR tab: mode (autopilot / review queue), limits, and the review queue with per-draft flags.
import { html, on, formData, stat, badge, toast } from '../../core/ui.js';
import { money, pct } from '../../core/util.js';
import { SALES } from './params.js';
import { BUYER_SEGMENTS } from './segments.js';
import { startAiSdr } from './engine.js';
import { ensureSdr, REVIEW, CLAIM_KINDS, draftFlags, sdrReviewStats, decisionHours, setMode, setLimits, approveDraft, rejectDraft, editDraft, bulkApprove } from './sdr.js';

const edits = {}; // draftId -> { subject, body } typed but not saved (survives re-renders)
const opened = {}; // draftId -> performance.now() when first shown: how long the founder had it open
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
const FLAG_TONE = { hallucination: 'bad', wrong_persona: 'bad', generic: 'warn' };

function limitsForm(a) {
  const l = a.limits;
  return html`<form id="sdrLimits"><h3>Limits (apply in both modes)</h3>
    <div class="grid-2">
      <label>Daily cap (emails or drafts) <input type="number" name="dailyCap" min="1" max="${SALES.aiSdr.dailySends}" value="${l.dailyCap}" /></label>
      <label>Only these personas <input name="personas" maxlength="200" value="${l.personas}" placeholder="owner, founder, operations manager" /></label>
    </div>
    <label>Only these segments (none selected = any)<select name="segments" multiple size="4">${BUYER_SEGMENTS.map((g) => html`<option value="${g.id}" ${l.segments.includes(g.id) ? 'selected' : ''}>${g.label}</option>`)}</select></label>
    <div><span class="small"><b>Blocked claims</b> (the agent may not state these about a prospect):</span>
      ${Object.entries(CLAIM_KINDS).map(([k, label]) => html`<label class="small" style="display:inline-block;margin-right:10px"><input type="checkbox" name="claim_${k}" ${l.blockedClaims.includes(k) ? 'checked' : ''} /> ${label}</label>`)}</div>
    <label><input type="checkbox" name="requirePersonalization" ${l.requirePersonalization ? 'checked' : ''} /> Require a real personalization hook (drafts without one are dropped)</label>
    <p class="hint">Tighter limits cut volume, not the cost: ${money(SALES.aiSdr.monthly)}/month either way. Blocking claim types cuts made-up facts but leaves the agent fewer hooks, so more template copy. Personas and segments cut wrong-persona emails.</p>
    <button class="sm primary">Save limits (6 min)</button></form>`;
}

function draftCard(s, d) {
  opened[d.id] ??= now();
  const flags = draftFlags(d);
  const e = edits[d.id] ?? { subject: d.subject, body: d.body };
  return html`<div class="card" data-draft="${d.id}">
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${d.person.name}</b> <span class="muted">${d.person.title}, ${d.person.company}</span>
      <div class="small muted">written ${s.day - d.day === 0 ? 'today' : `${s.day - d.day}d ago`}${d.edited ? ' · edited by you' : ''} · copy quality ${Math.round(d.quality * 100)}/100</div></div>
      <div>${flags.length ? flags.map((f) => html`${badge(f.label, FLAG_TONE[f.id])} `) : badge('no flags', 'good')}</div></div>
    ${flags.map((f) => html`<p class="small ${FLAG_TONE[f.id] === 'bad' ? 'neg' : 'warn'}">${f.detail}</p>`)}
    <input data-sdrsubj="${d.id}" value="${e.subject}" />
    <textarea data-sdrbody="${d.id}" rows="7">${e.body}</textarea>
    <div class="inline">${ensureSdr(s).active ? html`<button class="sm primary" data-sdrapprove="${d.id}">Approve & send</button>` : html`<span class="small muted">AI SDR cancelled: nothing can be sent.</span>`}<button class="sm" data-sdredit="${d.id}">Save edit (${Math.round(decisionHours('edit') * 60)} min)</button><button class="sm danger" data-sdrreject="${d.id}">Reject</button></div>
  </div>`;
}

export function aiSdrView(s, o) {
  const a = ensureSdr(s);
  const A = SALES.aiSdr;
  const st = sdrReviewStats(s);
  const weeks = a.active ? (s.day - a.startDay) / 7 : 0;
  const unflagged = a.queue.filter((d) => !draftFlags(d).length);
  return html`<section class="panel"><h2>AI SDR (managed agent)</h2>
    <p>An autonomous "AI SDR" (11x/Artisan-style) researches, writes and sends from its own vendor database and domains, books meetings into your calendar, and handles replies. In <b>autopilot</b> you never see the emails; in <b>review</b> every draft waits for you.</p>
    <div class="callout warn"><b>What the evidence says (2025–26):</b> volume ×3–5 and far fewer founder hours, but reply rates decay to ~0.5–1.5% within 4–8 weeks, 12–18% of emails contain hallucinated facts about the prospect, meetings convert to opportunities at ~35–45% vs 50–60% when founders book them, and 50–70% of programs are cancelled within 90 days. Use it only after you have a message that works. (LeadGen Economy Apr 2026, mostly estimates; TechCrunch on 11x, Mar 2025.)</div>
    ${a.active ? html`<div class="stats">
        ${stat('Running for', `${weeks.toFixed(1)} weeks`, `${money(A.monthly)}/month`)}
        ${stat('Emails sent', a.sent.toLocaleString('en-US'))}
        ${stat('Replies', a.replies, a.sent ? pct(a.replies / a.sent, 2) : '')}
        ${stat('Meetings booked', a.meetings, '', a.meetings ? 'good' : '')}
        ${stat('Hallucinated emails', a.hallucinations.toLocaleString('en-US'), a.mode === 'review' ? 'that you approved' : 'est. factual errors', 'warn')}
        ${stat('Spam complaints', a.complaints, '', a.complaints > 10 ? 'bad' : '')}
        ${stat('Its domain reputation', Math.round(a.reputation), '/100', a.reputation < 35 ? 'bad' : '')}
      </div>
      <div class="inline"><label>Mode <select id="sdrMode"><option value="autopilot" ${a.mode === 'autopilot' ? 'selected' : ''}>Autopilot: sends without review</option><option value="review" ${a.mode === 'review' ? 'selected' : ''}>Review queue: I approve each email</option></select></label>
        <button class="danger" id="stopSdr">Cancel AI SDR</button></div>`
      : html`<p>${money(A.monthly)}/month, cancel any time (many real vendors require annual contracts). Onboarding call: 2h.</p>
        ${s.company.path === 'indie' ? html`<p class="small warn">On a bootstrapped budget this is hard to justify before you have paying customers.</p>` : ''}
        <div class="inline"><button class="primary" id="startSdr">Start in review mode</button><button id="startSdrAuto">Start on autopilot</button></div>`}
  </section>
  ${a.active || a.queue.length ? html`<section class="panel">${limitsForm(a)}</section>` : ''}
  ${a.mode === 'review' && (a.active || a.queue.length) ? html`<section class="panel"><h2>Review queue (${a.queue.length})</h2>
    <div class="stats">
      ${stat('Approved / rejected', `${st.approved} / ${st.rejected}`, `${st.edited} edited`)}
      ${stat('Problems caught on a careful read', st.caught, 'the checker misses ~25%', st.caught ? 'good' : '')}
      ${stat('Bad drafts you sent', st.slipped.hallucination + st.slipped.wrongPersona, `${st.slipped.hallucination} made-up fact, ${st.slipped.wrongPersona} wrong persona`, st.slipped.hallucination + st.slipped.wrongPersona ? 'bad' : 'good')}
      ${stat('Avg copy quality sent', st.avgQuality == null ? '—' : `${Math.round(st.avgQuality * 100)}/100`, 'rewrite generic drafts to raise it')}
    </div>
    ${st.rubber ? html`<div class="callout bad"><b>You are rubber-stamping.</b> Most recent approvals took under ${REVIEW.fastSeconds} seconds. Problems the checker missed go out exactly as they do on autopilot, and you still pay the review time. Open each draft, rewrite generic ones, reject wrong-persona ones.</div>` : ''}
    <p class="hint">About ${Math.round(decisionHours('approve') * 60 * 10) / 10}–${Math.round(decisionHours('edit') * 60)} minutes each. Drafts older than ${REVIEW.ttlDays} days expire (${st.expired} so far). The checker flags roughly three of four made-up facts and wrong-persona addressees; the rest only show up if you read carefully.</p>
    ${a.queue.length ? html`<div class="inline"><button class="sm" id="sdrApproveClean" ${unflagged.length && a.active ? '' : 'disabled'}>Approve ${unflagged.length} unflagged without opening (skim)</button><span class="hint">Fast approvals count as rubber-stamping: unflagged is not the same as clean.</span></div>
      ${a.queue.map((d) => draftCard(s, d))}` : html`<p class="empty">Queue empty. The agent writes a new batch on weekdays.</p>`}
  </section>` : ''}`;
}

export function wireSdr(root, ctx) {
  const typed = (id) => ({ subject: root.querySelector(`[data-sdrsubj="${id}"]`)?.value, body: root.querySelector(`[data-sdrbody="${id}"]`)?.value });
  on(root, 'input', '[data-sdrsubj], [data-sdrbody]', (e, el) => { const id = el.dataset.sdrsubj ?? el.dataset.sdrbody; edits[id] = typed(id); });
  on(root, 'click', '#startSdr', () => ctx.act((st) => startAiSdr(st, { mode: 'review' }), { hours: 2, label: 'AI SDR onboarding' }));
  on(root, 'click', '#startSdrAuto', () => ctx.act((st) => startAiSdr(st, { mode: 'autopilot' }), { hours: 2, label: 'AI SDR onboarding' }));
  on(root, 'change', '#sdrMode', (e) => ctx.act((st) => setMode(st, e.target.value), { hours: 0.05, label: 'AI SDR settings' }));
  on(root, 'submit', '#sdrLimits', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const segments = [...e.target.querySelector('[name=segments]').selectedOptions].map((o) => o.value);
    ctx.act((st) => setLimits(st, { dailyCap: f.dailyCap, personas: f.personas, segments, blockedClaims: Object.keys(CLAIM_KINDS).filter((k) => f[`claim_${k}`]), requirePersonalization: f.requirePersonalization }), { hours: 0.1, label: 'AI SDR limits' });
  });
  on(root, 'click', '[data-sdrapprove]', (e, el) => {
    const id = el.dataset.sdrapprove;
    const dwell = (now() - (opened[id] ?? now())) / 1000;
    const t = typed(id);
    const fast = dwell < REVIEW.fastSeconds;
    ctx.act((st) => {
      const d = ensureSdr(st).queue.find((x) => x.id === id);
      if (d && (t.body !== d.body || t.subject !== d.subject)) editDraft(st, id, t);
      const r = approveDraft(st, id, { dwellSec: dwell });
      if (!r.ok) toast(`You caught something the checker missed (${r.caught.join(', ').replace('_', ' ')}). Fix it or reject it.`, 'warn');
      else delete edits[id];
    }, { hours: decisionHours('approve', fast), label: 'AI SDR review' });
  });
  on(root, 'click', '[data-sdredit]', (e, el) => {
    const id = el.dataset.sdredit;
    const t = typed(id);
    ctx.act((st) => {
      const r = editDraft(st, id, t);
      delete edits[id];
      toast(`Copy quality now ${Math.round(r.quality * 100)}/100${r.fixedClaim ? '; the made-up claim is gone.' : '.'}`, r.quality >= 0.6 ? 'good' : 'info');
    }, { hours: decisionHours('edit'), label: 'AI SDR review (edit)' });
  });
  on(root, 'click', '[data-sdrreject]', (e, el) => ctx.act((st) => { rejectDraft(st, el.dataset.sdrreject); delete edits[el.dataset.sdrreject]; }, { hours: decisionHours('reject'), label: 'AI SDR review' }));
  on(root, 'click', '#sdrApproveClean', () => {
    const ids = ensureSdr(ctx.state).queue.filter((d) => !draftFlags(d).length).map((d) => d.id);
    ctx.act((st) => { const n = bulkApprove(st, ids); toast(`Approved ${n} drafts without opening them.`, 'info'); }, { hours: ids.length * decisionHours('approve', true), label: 'AI SDR review (bulk)' });
  });
}
