// Shared negotiation UI (CRM contract stage, Fundraising term sheets and exit offers; vendor/hiring later).
//
//   negotiationLauncher(ctx, { kind, ref, label, hint })  -> a "Negotiate" button (or the open panel when one exists)
//   negotiationPanel(ctx, negId)                           -> the whole component: Prepare, offer form, timeline, mood, debrief
//   wireNegotiation(root, ctx)                             -> call once from the host app's wire step
//
// Offer form: a slider per numeric issue and a select per option issue, a message box, three statements the counterparty
// reacts to (a real alternative, a walk-away, splitting the difference). The Prepare panel shows only what you paid hours to
// research. After a close the debrief shows the surplus captured, the value left on the table and what a stellar negotiator
// would have done. Every action charges founder hours through ctx.act.

import { html, on, badge, raw, toast } from '../core/ui.js';
import { money, pct, clamp } from '../core/util.js';
import './negotiate/index.js'; // registers every adapter
import * as N from '../core/negotiation.js';
import { PREP_LABELS } from '../data/negotiation.js';
import { startEnterpriseNegotiation } from './negotiate/enterprise.js';
import { startVcNegotiation } from './negotiate/vc.js';
import { startMnaNegotiation } from './negotiate/mna.js';

const drafts = {}; // in-progress offers survive the re-render that every state change triggers: { [negId]: { offer, message, claim, threat, split } }
const MOOD = { warm: ['Warm', 'good'], neutral: ['Neutral', ''], cool: ['Cooling', 'warn'], irritated: ['Irritated', 'bad'] };
const STATUS = { open: ['Open', 'accent'], agreed: ['Agreed', 'good'], walked_player: ['You walked', 'warn'], walked_cp: ['They walked', 'bad'], impasse: ['Impasse', 'bad'], expired: ['Expired', 'warn'] };

function draftFor(view) {
  let d = drafts[view.id];
  if (!d || d.round !== view.round) {
    const base = view.last.player ?? view.last.cp ?? view.cpOpen ?? Object.fromEntries(view.issues.map((i) => [i.id, i.type === 'num' ? i.min : i.options[0].id]));
    d = drafts[view.id] = { round: view.round, offer: { ...base }, message: d?.message ?? '', claim: false, threat: false, split: false };
  }
  return d;
}

const fmtIssue = (i, v) => (v == null ? '—' : N.fmtValue(i, v));
function control(i, value) {
  if (i.type === 'num') {
    return html`<input type="range" data-neg-field="${i.id}" min="${i.min}" max="${i.max}" step="${i.step ?? (i.max - i.min) / 100}" value="${value}" aria-label="${i.label}" /> <b data-neg-out="${i.id}">${fmtIssue(i, value)}</b>`;
  }
  return html`<select data-neg-field="${i.id}" aria-label="${i.label}">${i.options.map((o) => html`<option value="${o.id}" ${String(o.id) === String(value) ? 'selected' : ''}>${o.label}</option>`)}</select>`;
}
const priorityBadge = (p) => (p === 'high' ? badge('their priority', 'warn') : p === 'medium' ? badge('matters to them', '') : p === 'low' ? badge('low for them', 'good') : '');

function prepareBox(ctx, view) {
  const hrs = (step) => N.prepCost(N.getNegotiation(ctx.state, view.id), step);
  const doneC = view.prep.counterparty ?? 0;
  return html`<div class="card"><h3>Prepare</h3>
    <p class="small muted">Preparation costs hours and changes what you can see: your real alternatives, the market norms, what they care about. Prepared negotiators open better and know when to walk.</p>
    <div class="inline" style="flex-wrap:wrap;gap:6px">
      <button class="sm" data-neg-prep="batna" ${view.prep.batna ? 'disabled' : ''}>${view.prep.batna ? 'Alternatives mapped' : `${PREP_LABELS.batna.label} (${hrs('batna')}h)`}</button>
      <button class="sm" data-neg-prep="norms" ${view.prep.norms ? 'disabled' : ''}>${view.prep.norms ? 'Norms looked up' : `${PREP_LABELS.norms.label} (${hrs('norms')}h)`}</button>
      <button class="sm" data-neg-prep="counterparty" ${doneC >= 2 ? 'disabled' : ''}>${doneC >= 2 ? 'Researched in depth' : doneC === 1 ? `Dig deeper on them (${hrs('counterparty')}h)` : `${PREP_LABELS.counterparty.label} (${hrs('counterparty')}h)`}</button>
    </div>
    ${view.batna ? html`<div class="callout ${view.batna.real ? 'good' : 'warn'} small"><b>Your alternatives (BATNA):</b> ${view.batna.real ? 'real, and you can mention them.' : 'none you could show; do not claim one.'} Worth about <b>${Math.round(view.batna.value * 100)}/100</b> to you; a package below that is worse than walking.
      <ul>${view.batna.sources.map((s) => html`<li>${s.label}</li>`)}</ul></div>` : html`<p class="hint">Not mapped yet: you do not know what you can walk to.</p>`}
    ${view.cp.style !== 'Not researched' ? html`<p class="small"><b>Their style:</b> ${view.cp.style}. ${Object.keys(view.known.priorities).length ? 'Researched priorities are marked in the table.' : ''}</p>` : html`<p class="hint">Their style and priorities are unknown. Research them, or ask in your message what matters most.</p>`}
  </div>`;
}

function timeline(view) {
  const rows = view.history.slice().reverse();
  if (!rows.length) return html`<p class="empty">No offers yet.</p>`;
  const iss = view.issues;
  return html`<div class="chat" style="max-height:340px">${rows.map((h) => {
    const mine = h.from === 'player';
    const sys = h.from === 'system';
    const label = h.action === 'open' ? 'Their opening' : h.action === 'offer' ? `Your offer ${h.round}` : h.action === 'counter' ? 'Their counter' : h.action === 'accept' ? (mine ? 'You accepted' : 'They accepted') : h.action === 'walk' ? (mine ? 'You walked away' : 'They walked away') : h.action === 'reject' ? 'They hold' : h.action === 'prepare' ? 'Prepared' : h.action === 'expired' ? 'Expired' : h.action;
    return html`<div class="msg ${mine ? 'me' : 'them'}" style="${sys ? 'align-self:center;font-size:12px;opacity:.8' : ''}"><div class="small"><b>${label}</b>${h.final ? ' · final position' : ''}${h.claim ? ' · you mentioned an alternative' : ''}</div>
      ${h.package ? html`<div class="small">${iss.map((i) => html`<div>${i.label}: ${fmtIssue(i, h.package[i.id])}</div>`)}</div>` : ''}
      ${h.message ? html`<div>${h.message}</div>` : ''}</div>`;
  })}</div>`;
}

function debrief(ctx, view) {
  const r = view.result;
  if (!r) return '';
  const tone = view.status === 'agreed' ? (r.worseThanBatna ? 'bad' : r.capture >= 0.5 ? 'good' : 'warn') : 'warn';
  return html`<div class="callout ${tone}"><h3>Debrief: ${STATUS[view.status]?.[0] ?? view.status}</h3>
    <div class="stats">
      <div class="stat"><div class="stat-label">Surplus captured</div><div class="stat-value">${view.status === 'agreed' ? pct(clamp(r.capture, 0, 1), 0) : '—'}</div><div class="stat-sub">of the zone between your alternative and the best attainable</div></div>
      <div class="stat"><div class="stat-label">Joint value</div><div class="stat-value">${view.status === 'agreed' ? pct(r.jointEff ?? 0, 0) : '—'}</div><div class="stat-sub">how close to a fully traded deal</div></div>
      <div class="stat"><div class="stat-label">Left on the table</div><div class="stat-value">${view.status === 'agreed' ? money(r.leftUsd ?? 0) : '—'}</div><div class="stat-sub">[design] estimate</div></div>
      <div class="stat"><div class="stat-label">Founder hours</div><div class="stat-value">${r.hours}</div><div class="stat-sub">${r.rounds} round${r.rounds === 1 ? '' : 's'}</div></div>
    </div>
    <h4>What a stellar negotiator would have done</h4>
    <ul>${(r.feedback ?? []).map((f) => html`<li>${f}</li>`)}</ul>
    <p class="small muted">Their hidden priorities, now revealed: ${view.issues.filter((i) => i.priority).map((i) => `${i.label} (${i.priority})`).join(', ')}.</p>
  </div>`;
}

/** The whole component for one negotiation. */
export function negotiationPanel(ctx, negId) {
  const neg = N.getNegotiation(ctx.state, negId);
  if (!neg) return html`<p class="empty">This negotiation no longer exists.</p>`;
  const view = N.viewOf(ctx.state, neg);
  const open = view.status === 'open';
  const d = draftFor(view);
  const [mood, moodTone] = MOOD[view.cp.mood] ?? MOOD.neutral;
  const [stLabel, stTone] = STATUS[view.status] ?? STATUS.open;
  const value = (pkg) => Math.round(N.pkgU(neg, pkg).p * 100);
  const lineP = view.batna ? Math.round(view.batna.value * 100) : null;
  const cur = value(snap(neg, d.offer));
  return html`<section class="panel neg" data-neg-root="${view.id}">
    <h2>${view.title} ${badge(stLabel, stTone)}</h2>
    <p class="small"><b>${view.cp.name}</b>, ${view.cp.role}. ${badge(mood, moodTone)} ${view.cp.final ? badge('final position', 'warn') : ''}
      <span class="small muted">Trust</span> <span class="meter" style="display:inline-block;width:90px;vertical-align:middle"><span style="display:block;height:100%;width:${Math.round(view.cp.trust * 100)}%;background:var(--${view.cp.trust > 0.5 ? 'good' : view.cp.trust > 0.3 ? 'warn' : 'bad'})"></span></span>
      <span class="hint">Each round costs ${view.hoursPerRound}h. ${view.expiresDay != null ? `Window closes day ${view.expiresDay}.` : ''}</span></p>
    ${open ? html`<div class="grid-2">
      <div>${prepareBox(ctx, view)}
        <h3>Timeline</h3>${timeline(view)}</div>
      <div><h3>Your offer</h3>
        <div class="table-wrap"><table><thead><tr><th>Term</th><th>Their latest</th><th>Your offer</th><th class="r">You value</th></tr></thead><tbody>
          ${view.issues.map((i) => html`<tr><td><b>${i.label}</b> ${priorityBadge(i.priority)}${i.band ? html`<div class="hint">${i.band}</div>` : ''}</td>
            <td class="small">${fmtIssue(i, view.last.cp?.[i.id])}</td><td>${control(i, d.offer[i.id])}</td>
            <td class="r"><span class="meter" style="display:inline-block;width:50px"><span style="display:block;height:100%;width:${Math.round(i.yourWeight * 100 * 3)}%;background:var(--accent)"></span></span></td></tr>`)}
        </tbody></table></div>
        <p class="small">This package is worth about <b data-neg-value>${cur}</b>/100 to you${lineP != null ? html`; your alternative is worth ${lineP}/100. ${cur < lineP ? html`<b class="neg">Below your alternative: walking would be better.</b>` : ''}` : html`. <span class="hint">Map your alternatives to see your walk-away line.</span>`}</p>
        <label class="small">Message (optional)<textarea data-neg-msg rows="3" placeholder="Why this number? What would you trade for it?">${d.message}</textarea></label>
        <div class="small" style="display:grid;gap:4px">
          <label><input type="checkbox" data-neg-flag="claim" ${d.claim ? 'checked' : ''} /> Tell them I have a competing alternative ${view.batna ? (view.batna.real ? '(you do)' : html`<b class="neg">(you have none you could show: they may check)</b>`) : html`<span class="hint">(map your alternatives first)</span>`}</label>
          <label><input type="checkbox" data-neg-flag="threat" ${d.threat ? 'checked' : ''} /> Say I will walk away if we cannot agree</label>
          <label><input type="checkbox" data-neg-flag="split" ${d.split ? 'checked' : ''} /> Propose splitting the difference</label>
        </div>
        <div class="inline" style="margin-top:8px">
          <button class="primary" data-neg-send>Send offer (${view.hoursPerRound}h)</button>
          <button data-neg-accept ${view.last.cp ? '' : 'disabled'}>Accept their latest</button>
          <button class="danger" data-neg-walk>Walk away</button>
        </div>
        <p class="hint">Concede in shrinking steps and only as a trade. Anchors outside any realistic zone cost trust; invented alternatives get checked.</p>
      </div>
    </div>` : html`<div class="grid-2"><div>${timeline(view)}</div><div>${debrief(ctx, view)}</div></div>`}
  </section>`;
}

const snap = (neg, pkg) => N.snapPackage(neg, pkg);

/** A launcher: the open negotiation panel when one exists, else a button that opens one. */
export function negotiationLauncher(ctx, { kind, ref, label = 'Negotiate the terms', hint = '', disabled = false, reason = '', key }) {
  const existing = N.findNegotiation(ctx.state, key);
  if (existing) return negotiationPanel(ctx, existing.id);
  return html`<div class="card"><h3>${label}</h3>${hint ? html`<p class="small muted">${hint}</p>` : ''}
    ${disabled ? html`<p class="hint">${reason}</p>` : html`<button class="primary" data-neg-start="${kind}:${ref}">${label}</button>`}</div>`;
}

const STARTERS = {
  enterprise: (st, ref) => startEnterpriseNegotiation(st, st.apps.crm.deals.find((d) => d.id === ref)),
  vc: (st, ref) => startVcNegotiation(st, st.apps.fundraising.investors.find((i) => i.id === ref)),
  mna: (st, ref) => startMnaNegotiation(st, ref),
};

/** Wire every negotiation control inside root. Call once from the host app's wire step. */
export function wireNegotiation(root, ctx) {
  const negIdOf = (el) => el.closest('[data-neg-root]')?.dataset.negRoot;
  on(root, 'click', '[data-neg-start]', (e, el) => {
    const [kind, ...rest] = el.dataset.negStart.split(':');
    ctx.act((st) => { const n = STARTERS[kind]?.(st, rest.join(':')); if (n) toast('Negotiation opened. Prepare first, then make your offer.', 'good'); }, { hours: 0.1, label: 'Open negotiation' });
  });
  on(root, 'click', '[data-neg-prep]', (e, el) => {
    const id = negIdOf(el), step = el.dataset.negPrep;
    ctx.act((st) => { const n = N.getNegotiation(st, id); N.prepare(st, id, step); toast(`${PREP_LABELS[step].label}: done.`, 'good'); return n; }, { hours: N.prepCost(N.getNegotiation(ctx.state, id), step), label: `Negotiation prep: ${PREP_LABELS[step].label}` });
  });
  on(root, 'input', '[data-neg-field]', (e, el) => {
    const id = negIdOf(el); const neg = N.getNegotiation(ctx.state, id); if (!neg) return;
    const d = drafts[id]; if (!d) return;
    const issue = neg.issues.find((i) => i.id === el.dataset.negField);
    d.offer[issue.id] = issue.type === 'num' ? Number(el.value) : el.value;
    const out = root.querySelector(`[data-neg-out="${issue.id}"]`);
    if (out) out.textContent = N.fmtValue(issue, d.offer[issue.id]);
    const v = root.querySelector('[data-neg-value]');
    if (v) v.textContent = String(Math.round(N.pkgU(neg, snap(neg, d.offer)).p * 100));
  });
  on(root, 'change', '[data-neg-field]', (e, el) => { const d = drafts[negIdOf(el)]; if (d) { const neg = N.getNegotiation(ctx.state, negIdOf(el)); const issue = neg.issues.find((i) => i.id === el.dataset.negField); d.offer[issue.id] = issue.type === 'num' ? Number(el.value) : el.value; } });
  on(root, 'input', '[data-neg-msg]', (e, el) => { const d = drafts[negIdOf(el)]; if (d) d.message = el.value; });
  on(root, 'change', '[data-neg-flag]', (e, el) => { const d = drafts[negIdOf(el)]; if (d) d[el.dataset.negFlag] = el.checked; });
  on(root, 'click', '[data-neg-send]', (e, el) => {
    const id = negIdOf(el); const d = drafts[id]; const neg = N.getNegotiation(ctx.state, id);
    if (!d || !neg) return;
    const play = { offer: snap(neg, d.offer), message: d.message, claim: d.claim ? 'alternative' : undefined, threat: d.threat, split: d.split };
    ctx.act(async (st) => {
      const reply = await N.playRound(st, id, play);
      d.message = ''; d.claim = d.threat = d.split = false;
      const n = N.getNegotiation(st, id);
      toast(reply.action === 'accept' ? 'They accepted.' : reply.action === 'walk' ? `${n.cp.name} walked away.` : `${n.cp.name} countered.`, reply.action === 'accept' ? 'good' : reply.action === 'walk' ? 'bad' : '');
    }, { hours: neg.stakes === 'high' ? 1 : neg.stakes === 'low' ? 0.25 : 0.5, label: `Negotiation: ${neg.title}` });
  });
  on(root, 'click', '[data-neg-accept]', (e, el) => { const id = negIdOf(el); ctx.act((st) => { N.acceptCounter(st, id); toast('Agreed. Terms recorded.', 'good'); }, { hours: 0.1, label: 'Negotiation: accept' }); });
  on(root, 'click', '[data-neg-walk]', (e, el) => { const id = negIdOf(el); ctx.act((st) => { N.walkAway(st, id); toast('You walked away.', 'warn'); }, { hours: 0.05, label: 'Negotiation: walk away' }); });
}
export { raw };
