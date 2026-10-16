// Success app UI for land and expand: cohort retention vs the researched bands, the account table (land, adoption,
// whitespace, relationships) and the per-account map with the actions that cost founder hours. Rules: sales/expand.js.

import { html, on, formData, stat, badge, table, toast } from '../../core/ui.js';
import { money, pct, fmtDate } from '../../core/util.js';
import { LAND_STRATEGIES, NRR_BANDS, EXPAND } from '../../data/gtm-comp.js';
import { subById, acvOf } from '../success/engine.js';
import { companyById } from './model.js';
import { mapAccount, meetStakeholders, pursueWhitespace, trueUp, retentionByBand, expansionStats } from './expand.js';
import { championRisk } from './expand-model.js';

const H = { map: 1.5, thread: 2, pursue: 1, trueUp: 0.5 };
const bandName = { smb: 'SMB (<$10k)', mid: 'Mid-market ($10-50k)', ent: 'Enterprise ($50k+)' };
const nameOf = (s, a) => companyById(s, a.companyId)?.name ?? 'Customer';

export function landExpandView(s, cs) {
  const accts = Object.values(cs.accounts).filter((a) => !a.closed && a.map); // maps are created by the daily tick, never while drawing
  const rb = retentionByBand(s, 365);
  const st = expansionStats(s);
  return html`
    <div class="stats">
      ${stat('Accounts mapped', `${st.mapped}/${st.accounts}`, `${st.threaded} with a second thread or exec sponsor`)}
      ${stat('Expansion wins', st.won, `${st.signalsOpen} open signal(s), ${st.missed} missed`)}
      ${stat('Contractions', st.contractions, 'seat cuts at renewal or true-down', st.contractions ? 'bad' : '')}
      ${stat('QBRs held', st.qbrs, `quarterly above $10k ACV`)}
    </div>
    <section class="panel"><h2>Retention by account size (trailing 12 months)</h2>
      ${table({
        columns: [
          { label: 'Band', render: (r) => bandName[r[0]] },
          { label: 'Accounts', align: 'right', render: (r) => r[1].n },
          { label: 'GRR', align: 'right', render: (r) => pct(r[1].grr, 0) },
          { label: 'NRR', align: 'right', render: (r) => pct(r[1].nrr, 0) },
          { label: 'Researched NRR range', render: (r) => html`${Math.round(NRR_BANDS[r[0]].nrr[0] * 100)}-${Math.round(NRR_BANDS[r[0]].nrr[1] * 100)}% <span class="small muted">${NRR_BANDS[r[0]].note}</span>` },
        ],
        rows: Object.entries(rb), empty: 'Retention appears once accounts have been with you for a while.',
      })}
      <p class="hint">Ranges are working bands, not exact statistics: SaaS Capital 2025 puts $25-50K ACV at a 102% median (top quartile 111%, bottom 97%) [secondary]; the SMB, mid-market and enterprise bands are [unverified]. A median operator lands inside them; elite operators run 10+ points higher.</p></section>
    <section class="panel"><h2>Land strategies</h2>
      <div class="grid-3">${Object.values(LAND_STRATEGIES).map((L) => html`<div class="card"><b>${L.label}</b><div class="small">${L.blurb}</div><div class="small muted">seats at land: ${Math.round(L.sizeShare * 100)}% of headcount · cycle ×${L.cycleMult} · win ×${L.winMult} · land is ~${Math.round(L.finalShare * 100)}% of the eventual account [design]</div></div>`)}</div>
      <p class="hint">Pick the strategy per deal in the CRM when you send the proposal. Land near list: a deep first-year discount anchors the price for every expansion and renewal.</p></section>
    <section class="panel"><h2>Accounts</h2>
      ${table({
        rows: accts, empty: 'No accounts yet.',
        rowAttrs: (a) => `class="clickable" data-acct="${a.subId}"`,
        columns: [
          { label: 'Account', render: (a) => html`<b>${nameOf(s, a)}</b><div class="small muted">${money(acvOf(subById(s, a.subId)))}/yr</div>` },
          { label: 'Land', render: (a) => (a.land?.strategy && a.land.strategy !== 'unspecified' ? LAND_STRATEGIES[a.land.strategy].label : html`<span class="muted">not chosen</span>`) },
          { label: 'Seat use', align: 'right', render: (a) => pct(a.adoption ?? 0, 0) },
          { label: 'Whitespace', align: 'right', render: (a) => (a.map.mapped ? `${a.map.whitespace.filter((x) => x.status !== 'won').reduce((n, x) => n + x.seats, 0)} seats` : html`<span class="muted">unmapped</span>`) },
          { label: 'Relationships', render: (a) => badge(`${Math.max(a.map.threads ?? 1, a.threads ?? 1)} thread${Math.max(a.map.threads ?? 1, a.threads ?? 1) > 1 ? 's' : ''}${a.map.execSponsor ? ' + exec' : ''}`, a.map.execSponsor || (a.map.threads ?? 1) >= 2 ? 'good' : 'warn') },
          { label: 'Owner', render: (a) => (a.gtm?.owned ? badge('CSM/AM', 'good') : html`<span class="muted small">founder</span>`) },
        ],
      })}</section>`;
}

export function accountMapPanel(s, acct) {
  const sub = subById(s, acct.subId);
  const map = acct.map;
  if (!sub || !map) return '';
  const L = acct.land ?? {};
  const strat = LAND_STRATEGIES[L.strategy];
  const risk = championRisk(acct, s.day);
  const open = map.whitespace.filter((x) => x.status === 'open');
  return html`
    <h3>Land and expand</h3>
    <p class="small">${strat ? html`Landed as <b>${strat.label}</b>` : html`<span class="muted">Land strategy not chosen on this deal</span>`} · ${L.seats ?? '?'} seats at ${money(L.landAcv ?? 0)}/yr${L.discountPct ? ` · ${Math.round(L.discountPct * 100)}% off${L.discountPct > EXPAND.anchorDiscount ? ' (anchors the price)' : ''}` : ''} · seat use ${pct(acct.adoption ?? 0, 0)}${acct.contract?.type === 'ramp' ? ` · ramped contract: ${acct.contract.steps.map((x) => `${x.toSeats} seats ${x.done ? 'done' : 'on ' + fmtDate(s, x.day)}`).join(', ')}` : ''}</p>
    ${acct.pilot?.status === 'active' ? html`<div class="callout">Paid pilot until ${fmtDate(s, acct.pilot.endDay)}: it converts to ${acct.pilot.fullSeats} seats only if it reaches production.</div>` : ''}
    ${(acct.adoption ?? 1) < EXPAND.shelfwareUtil ? html`<div class="callout warn">Seat use is under ${Math.round(EXPAND.shelfwareUtil * 100)}%: at renewal the buyer will cut seats they do not use. Drive adoption before you ask for more.</div>` : ''}
    ${risk > 1 ? html`<div class="callout bad">Champion gone: churn risk ×${risk.toFixed(2)}. A second thread, an executive sponsor and a recent QBR bring it down.</div>` : ''}
    <div class="inline"><span class="small">Relationships: ${Math.max(map.threads ?? 1, acct.threads ?? 1)} thread(s)${map.execSponsor ? ', executive sponsor' : ', no executive sponsor'}</span>
      <button class="sm" data-map ${map.mapped ? 'disabled' : ''}>${map.mapped ? 'Mapped' : `Map the account (${H.map}h)`}</button>
      <button class="sm" data-thread>Meet another stakeholder (${H.thread}h)</button></div>
    ${map.mapped ? html`<ul class="list small">${map.whitespace.map((x) => html`<li>${x.dept}: ${x.seats} seat(s) ${badge(x.status === 'open' ? `signal: ${x.signal?.replace(/_/g, ' ')}` : x.status, x.status === 'open' ? 'good' : x.status === 'won' ? 'accent' : '')}${x.needsSponsor ? ' <span class="muted">needs their exec</span>' : ''}
        ${['open', 'mapped'].includes(x.status) ? html` <button class="sm" data-pursue="${x.id}">Propose${x.status === 'open' ? '' : ' (no signal yet)'} (${H.pursue}h)</button>` : ''}</li>`)}</ul>
      <form id="askForm" class="inline"><label style="max-width:240px">Price for added seats <select name="ask"><option value="anchored">Same price as the land (${Math.round((L.discountPct ?? 0) * 100)}% off)</option><option value="list">List price</option><option value="d10">10% off list</option></select></label></form>
      ${open.some(() => true) ? html`<button class="sm" data-trueup>True-up usage above the commitment (${H.trueUp}h)</button>` : ''}`
      : html`<p class="small muted">Whitespace (other departments and seats) is hidden until you map the account. Expansion signals still arrive, but you pitch blind.</p>`}`;
}

export function bindExpand(root, ctx, acct) {
  if (!acct) return;
  on(root, 'click', '[data-map]', () => ctx.act((st) => { mapAccount(st, acct); toast('Account mapped: whitespace and stakeholders are visible.', 'good'); }, { hours: H.map, label: 'Account mapping' }));
  on(root, 'click', '[data-thread]', () => ctx.act((st) => { const r = meetStakeholders(st, acct); toast(r.execSponsor ? 'You met a second stakeholder and their executive sponsor.' : 'You met another stakeholder: the account has a second thread.', 'good'); }, { hours: H.thread, label: 'Multi-threading' }));
  on(root, 'click', '[data-pursue]', (e, el) => {
    const f = formData(root.querySelector('#askForm') ?? document.createElement('form'));
    const ask = f.ask === 'list' ? 0 : f.ask === 'd10' ? 0.1 : null;
    ctx.act((st) => { const r = pursueWhitespace(st, acct, el.dataset.pursue, { askDiscount: ask }); toast(r.ok ? `They added ${r.seats} seat(s).` : 'Not now, they said.', r.ok ? 'good' : 'warn'); }, { hours: H.pursue, label: 'Expansion' });
  });
  on(root, 'click', '[data-trueup]', () => ctx.act((st) => { const r = trueUp(st, acct); toast(r.ok ? `Trued up ${r.seats} seat(s): billed ${money(r.amount)}.` : r.error, r.ok ? 'good' : 'warn'); }, { hours: H.trueUp, label: 'True-up' }));
}
