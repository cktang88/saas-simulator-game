// Term sheet redline panel (Investor CRM -> an investor with an open term sheet or SAFE commitment): per-clause
// accept / push back / trade, an optional note, optional counsel review, the history of rounds and, after signing,
// the review of how the negotiation went.

import { html, on, badge } from '../../core/ui.js';
import { money, fmtDate } from '../../core/util.js';
import { ensureFr, investorById } from './sim.js';
import { raiseLeverage } from './process.js';
import { drafts } from './drafts.js';
import { CLAUSES, COUNSEL, REDLINE_HOURS, MAX_ROUNDS, clauseIds, clauseText, clauseValue, clauseOptions, counselFlags, tsOf, valueText, requestCounsel, submitRedline, negotiationReview, openLegalFindings } from './termsheet.js';
import { adviceFor } from '../../core/advice.js';

const draftFor = (invId) => (drafts.redline[invId] ??= { marks: {}, note: '' });
const OUT = { accept: ['agreed', 'good'], partial: ['met partway', 'warn'], hold: ['holding', 'bad'] };

export function renderTermSheet(ctx, inv) {
  const s = ctx.state;
  const t = inv.terms;
  const safe = t.instrument === 'safe';
  const ts = tsOf(inv);
  const stage = ts?.stage ?? ensureFr(s).raise?.stage ?? 'seed';
  const flags = counselFlags(s, inv);
  const d = draftFor(inv.id);
  const kind = safe ? 'safe' : 'priced';
  const lev = raiseLeverage(s);
  const rounds = ts?.rounds ?? [];
  const pending = ts?.pending;
  const counselBusy = ts?.counsel && ts.counsel.version === ts.version && ts.counsel.readyDay > s.day;
  const row = (id) => {
    const c = CLAUSES[id];
    const m = d.marks[id] ?? { action: 'accept' };
    const flag = flags?.find((f) => f.id === id);
    const agreed = ts?.clauses?.[id]?.agreed;
    const input = c.type === 'choice'
      ? html`<select data-rl-val="${id}">${clauseOptions(id, stage).map((o) => html`<option value="${o.value}" ${String(m.value ?? clauseValue(t, id)) === String(o.value) ? 'selected' : ''}>${o.text}</option>`)}</select>`
      : html`<input type="number" data-rl-val="${id}" step="${c.type === 'pct' ? 0.005 : 100000}" value="${m.value ?? clauseValue(t, id)}" />`;
    return html`<tr>
      <td><b>${c.label}</b>${agreed ? html` ${badge('agreed', 'good')}` : ''}<div class="hint">${c.why}</div></td>
      <td>${clauseText(t, id)}${flag ? html`<div>${badge('off-market', 'bad')} <span class="small">market: ${flag.market}</span></div>` : ''}</td>
      <td><select data-rl-act="${id}">${['accept', 'push', 'trade'].map((a) => html`<option value="${a}" ${m.action === a ? 'selected' : ''}>${a === 'push' ? 'push back' : a === 'trade' ? 'trade (give one step for movement)' : 'accept'}</option>`)}</select>
        ${m.action === 'push' ? input : ''}</td>
    </tr>`;
  };
  return html`
    <h3>Redline the ${safe ? 'SAFE' : 'term sheet'}</h3>
    <p class="small muted">Round ${rounds.length + (pending ? 1 : 0)} of ~${MAX_ROUNDS[kind]} · leverage ${badge(lev.label, lev.terms < 0.9 ? 'bad' : lev.terms < 1 ? 'warn' : 'good')} · ${ts?.final ? html`<b>they called the last draft best and final</b>` : 'two or three rounds is typical'}</p>
    ${openLegalFindings(s, inv) ? html`<div class="callout warn small">Investor counsel's legal review found ${inv.legalDd.found} issue(s) in diligence; ${openLegalFindings(s, inv)} still open. Cures are closing conditions, and the partner holds a little firmer on every ask until they are fixed (Legal app).</div>` : inv.legalDd?.found ? html`<p class="small muted">The ${inv.legalDd.found} legal diligence issue(s) counsel found are fixed.</p>` : ''}
    ${t.exploding ? html`<div class="callout bad small">Exploding offer: they know your runway and will not negotiate. Any markup risks them pulling it.</div>` : ''}
    ${!flags && !counselBusy && !safe ? html`<div class="callout warn small">Nobody has reviewed this draft. Off-market terms are not flagged until counsel reads it.</div>` : ''}
    ${counselBusy ? html`<p class="small">Counsel is reviewing draft ${ts.version}; notes by ${fmtDate(s, ts.counsel.readyDay)}.</p>` : ''}
    ${flags ? html`<div class="callout ${flags.length ? 'warn' : 'good'} small"><b>Counsel:</b> ${flags.length ? flags.map((f) => `${f.label} (${f.now}; market: ${f.market})`).join(' · ') : 'nothing off-market in this draft.'}</div>` : ''}
    ${pending ? html`<div class="callout small">Your markup ${rounds.length + 1} is with ${inv.name}. Expect an answer around ${fmtDate(s, pending.day)} (${pending.eta}).</div>` : html`
      <div class="table-wrap"><table><thead><tr><th>Clause</th><th>Current draft</th><th>Your position</th></tr></thead>
        <tbody>${clauseIds(t).map(row)}</tbody></table></div>
      <label>Note to the partner (optional)<textarea data-rl-note="${inv.id}" rows="3" placeholder="Why each ask: hiring plan, market standard, what you can give in return…">${d.note}</textarea></label>
      <div class="inline">
        <button data-act="rl-send">Send markup (${REDLINE_HOURS[kind]}h)</button>
        <button data-act="rl-counsel" ${counselBusy || (flags && ts?.counsel?.version === ts?.version) ? 'disabled' : ''}>Counsel review (${money(COUNSEL[kind].usd)}, ${COUNSEL[kind].hours}h)</button>
      </div>`}
    ${rounds.length ? html`<h3>Rounds</h3>${rounds.map((r) => html`<div class="card small"><b>Markup ${r.n}</b> · sent ${fmtDate(s, r.sentDay)}, answered ${fmtDate(s, r.day)}${r.counsel ? ' · counsel-drafted' : ''}${r.bluff ? html` ${badge('bluff', 'bad')}` : ''}
      <br />${Object.entries(r.responses).map(([id, x]) => html`${CLAUSES[id].label}: asked ${valueText(id, x.ask)} → ${badge(OUT[x.out][0], OUT[x.out][1])}${x.out === 'partial' ? ` ${valueText(id, x.value)}` : ''}<br />`)}
      ${Object.entries(r.marks).filter(([, m]) => m.action === 'trade').length ? html`Traded: ${Object.entries(r.marks).filter(([, m]) => m.action === 'trade').map(([id]) => CLAUSES[id].label).join(', ')}` : ''}</div>`)}` : ''}
    ${rounds.length ? renderReview(negotiationReview(s, inv), 'Negotiation so far', s) : ''}`;
}

// Facts only (rounds, asks, terms fixed). The grade and what a stellar operator would have done come from advice sources.
export function renderReview(rv, title = 'Term sheet negotiation review', s = null) {
  if (!rv) return '';
  const adv = s ? adviceFor(s, 'negotiation', rv.coaching ?? []) : [];
  return html`<div class="callout small"><b>${title}</b> · ${rv.rounds} round(s), ${rv.asks} ask(s), ${rv.fixed}/${rv.offMarketAtOpen} off-market terms fixed${rv.counsel ? ', counsel used' : ''}
    ${adv.length ? html`<ul>${adv.map((a) => html`<li>${a.text} <span class="muted">(${a.from})</span></li>`)}</ul>` : ''}</div>`;
}

export function wireTermSheet(root, ctx, invId) {
  const getInv = (st) => investorById(ensureFr(st), invId);
  on(root, 'change', '[data-rl-act]', (e, el) => {
    const d = draftFor(invId);
    const id = el.dataset.rlAct;
    d.marks[id] = { ...(d.marks[id] ?? {}), action: el.value };
    ctx.render();
  });
  on(root, 'change', '[data-rl-val]', (e, el) => {
    const d = draftFor(invId);
    const id = el.dataset.rlVal;
    d.marks[id] = { ...(d.marks[id] ?? { action: 'push' }), value: el.value };
  });
  on(root, 'input', '[data-rl-note]', (e, el) => { draftFor(invId).note = el.value; });
  on(root, 'click', '[data-act=rl-counsel]', () => {
    const inv = getInv(ctx.state);
    const kind = inv?.terms?.instrument === 'safe' ? 'safe' : 'priced';
    ctx.act((st) => {
      const r = requestCounsel(st, getInv(st));
      if (r.error) throw new Error(r.error);
      ctx.toast(`Counsel has the draft: notes in ${r.eta}.`);
    }, { hours: COUNSEL[kind].hours, label: 'Term sheet review with counsel' });
  });
  on(root, 'click', '[data-act=rl-send]', () => {
    const inv = getInv(ctx.state);
    const kind = inv?.terms?.instrument === 'safe' ? 'safe' : 'priced';
    const d = draftFor(invId);
    // Values the player never touched default to the current draft; a push needs an explicit value.
    const marks = {};
    for (const [id, m] of Object.entries(d.marks)) {
      if (m.action !== 'push') { marks[id] = m; continue; }
      const el = root.querySelector(`[data-rl-val="${id}"]`);
      marks[id] = { action: 'push', value: m.value ?? el?.value };
    }
    ctx.act((st) => {
      const r = submitRedline(st, getInv(st), { marks, note: d.note });
      if (r.error) throw new Error(r.error);
      drafts.redline[invId] = { marks: {}, note: '' };
      ctx.toast(`Markup sent. Their answer should land in ${r.eta}.`);
    }, { hours: REDLINE_HOURS[kind], label: 'Term sheet markup' });
  });
}
