// Tab: Deck links & data room (DocSend / Papermark style) plus the raise review (what the process cost you).

import { html, on, table, badge, toast } from '../../core/ui.js';
import { fmtDate, money } from '../../core/util.js';
import { ensureRoom, roomStatus, prepareItem, ROOM_ITEMS, linkStats, linkLive, GATES } from './dataroom.js';
import { ensureFr, investorById } from './sim.js';
import { readFundraising } from './operator.js';

const STATUS_TONE = { ready: 'good', stale: 'warn', missing: 'bad', blocked: 'bad' };
const TIER_TONE = { stellar: 'good', good: 'good', average: 'warn', mediocre: 'bad', unknown: '' };

export function renderRoom(ctx) {
  const s = ctx.state;
  const fr = ensureFr(s);
  ensureRoom(s);
  const st = roomStatus(s);
  const links = fr.shareLinks.slice().reverse();
  const read = readFundraising(s);
  const mine = (s.mistakes ?? []).filter((m) => m.app === 'fundraising' || m.functionId === 'fundraising' || m.functionId === 'investor_relations').slice(-8).reverse();
  return html`
    <div class="grid-2">
      <section class="panel">
        <h2>Data room <span class="small muted">${st.ready}/${st.total} ready</span></h2>
        <div class="meter"><div style="width:${st.pct * 100}%"></div></div>
        <p class="small muted">Seed diligence asks for the same folders every time. Ready before the first meeting, diligence takes weeks, not months, and you skip the weekly scramble (game estimate: ~40% faster; an incomplete room adds ~${Math.round((1 - st.pct) * 6)}h/week while anyone is in diligence). Stale numbers that no longer match your live metrics are worse than none.</p>
        ${table({ columns: [
          { label: 'Folder', render: (r) => html`<span class="small">${r.label}</span>` },
          { label: 'Status', render: (r) => html`${badge(r.status, STATUS_TONE[r.status])}<div class="small muted">${r.why}${r.prepared && r.status === 'ready' ? `Updated ${fmtDate(s, r.prepared.day)}` : ''}</div>` },
          { label: '', align: 'right', render: (r) => (r.id === 'legal' && r.status === 'blocked' ? html`<a class="btn sm" href="#/legal">Fix in Legal</a>` : html`<button class="sm" data-prep="${r.id}">${r.prepared ? 'Refresh' : 'Prepare'} (${r.hours}h)</button>`) },
        ], rows: st.rows })}
        <h3>Access log</h3>
        <ul class="list small">${fr.room.log.slice(-8).reverse().map((l) => html`<li>${fmtDate(s, l.day)} · ${l.who} opened ${l.item.split(':')[0]}${l.status !== 'ready' ? html` ${badge(l.status, 'warn')}` : ''}</li>`)}</ul>
        ${fr.room.log.length ? '' : html`<p class="small muted">Investors open the room when they start diligence.</p>`}
      </section>
      <section class="panel">
        <h2>Tracked deck links</h2>
        <p class="small muted">One link per investor (choose "Tracked deck link" when you email them). You see opens, time per slide and forwards. Views are a noisy signal: an associate skimming twice is not interest; a partner opening a forward is. VCs rarely click through an NDA to read a deck.</p>
        ${table({ columns: [
          { label: 'Investor', render: (l) => html`<a href="#/fundraising/crm:${l.invId}">${l.name}</a><div class="small muted">${investorById(fr, l.invId)?.status ?? 'removed'}</div>` },
          { label: 'Access', render: (l) => html`<span class="small">${linkLive(s, l) ? GATES[l.gate] : 'expired / revoked'}</span>` },
          { label: 'Opens', align: 'right', render: (l) => linkStats(l).opens },
          { label: 'Fwd', align: 'right', render: (l) => linkStats(l).forwards },
          { label: 'Time', align: 'right', render: (l) => `${Math.round(linkStats(l).totalSecs / 60)} min` },
        ], rows: links, empty: 'No tracked links yet.' })}
      </section>
    </div>
    <section class="panel">
      <h2>Raise review ${badge(read.tier, TIER_TONE[read.tier])}</h2>
      ${read.evidence?.length ? html`<ul class="list small">${read.evidence.map((e) => html`<li>${e}</li>`)}</ul>` : html`<p class="small muted">No raise yet.</p>`}
      ${read.coaching?.length ? html`<h3>What a stellar operator would do</h3><ul class="list small">${read.coaching.map((c) => html`<li>${c}</li>`)}</ul>` : ''}
      ${mine.length ? html`<h3>What it cost you</h3><ul class="list small">${mine.map((m) => html`<li>${fmtDate(s, m.day)} · <b>${m.label}</b>${m.cost.usd ? ` · ${money(m.cost.usd)}` : ''}${m.cost.hours ? ` · ${m.cost.hours}h` : ''}${m.cost.days ? ` · ${m.cost.days} days` : ''}${m.cost.reputation ? ` · reputation −${m.cost.reputation}` : ''}<div class="muted">${m.detail}</div></li>`)}</ul><p class="small muted">Dollar costs are game estimates of the extra ownership sold or value lost.</p>` : ''}
    </section>`;
}

export function wireRoom(root, ctx) {
  on(root, 'click', '[data-prep]', (e, el) => {
    const it = ROOM_ITEMS.find((x) => x.id === el.dataset.prep);
    ctx.act((st) => { prepareItem(st, it.id); toast(`${it.label.split(':')[0]} added to the data room.`, 'good'); }, { hours: it.hours, label: `Data room: ${it.label.split(':')[0]}` });
  });
}
