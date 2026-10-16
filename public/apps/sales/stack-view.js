// CRM → Stack tab: which CRM this really is, Rox on top, inbound routing and signals, local-business lists, and the
// tools that are outdated for a startup. Model: sales/stack.js.
import { html, on, stat, badge, toast } from '../../core/ui.js';
import { money, pct } from '../../core/util.js';
import {
  ensureStack, CRM_VENDORS, ROX, ROUTING, SIGNALS_VENDORS, LOCAL_SOURCES, LOCAL_CHANNELS, OUTDATED, INBOUND_GATE, LOCAL_HOURS,
  crmFit, crmMonthly, switchCost, chooseCrm, migrationPressure, startRox, stopRox, setRouting, setSignals, setLocalSource, buildLocalList,
  workLocalList, workEstimate, signZoomInfo, stackReview, stackRead, upkeepHours, inboundPerMonth, sellerCount, arrOf, localFit,
} from './stack.js';

let planned = true;
let workOpts = { channel: 'phone', verify: true, n: 20 };

export function stackView(s) {
  const st = ensureStack(s);
  const arr = arrOf(s);
  const cur = st.crm ?? 'sheet';
  const up = upkeepHours(s);
  const mp = migrationPressure(s);
  const n = inboundPerMonth(s);
  const read = stackRead(s);
  const review = stackReview(s);
  const crmRows = Object.entries(CRM_VENDORS).map(([k, v]) => {
    const f = crmFit(s, k, arr);
    const c = switchCost(s, k, { planned });
    return html`<tr><td><b>${v.label}</b>${k === cur ? ` ${badge('current', 'good')}` : ''}${k === 'salesforce' ? ` ${badge('outdated at seed', 'warn')}` : ''}<div class="small muted">${v.paradigm}</div>${v.price ? html`<div class="small muted">${v.price}</div>` : ''}</td>
      <td>${money(crmMonthly(s, k))}/mo</td><td>${v.entryPerDeal}h/deal/wk${v.adminWeekly ? ` + ${v.adminWeekly}h admin` : ''}</td><td>${v.reporting}${v.marketing !== 'none' ? ` · ${v.marketing}` : ''}</td>
      <td>${badge(`${Math.round(f.fit * 100)}%`, f.fit >= 0.75 ? 'good' : f.fit >= 0.5 ? 'warn' : 'bad')}${f.reasons.length ? html`<div class="small muted">${f.reasons.join('; ')}</div>` : ''}</td>
      <td>${k === cur ? '' : html`<button class="sm" data-crmpick="${k}">${c.first ? 'Set up' : planned ? 'Migrate (planned)' : 'Migrate (rushed)'} · ${c.hours}h${c.usd ? ` + ${money(c.usd)}` : ''}</button>`}</td></tr>`;
  });
  return html`
  <section class="panel"><h2>Your GTM stack · operator read: ${badge(read.tier, read.tier === 'stellar' || read.tier === 'good' ? 'good' : read.tier === 'unknown' ? '' : 'warn')}</h2>
    <div class="stats">
      ${stat('CRM', CRM_VENDORS[cur].label, st.crm == null ? 'never chosen: works like a spreadsheet' : '')}
      ${stat('CRM upkeep', `${up.total}h/week`, Object.entries(up.parts).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · '))}
      ${stat('Data hygiene', pct(st.hygiene, 0), 'missed follow-ups when low', st.hygiene < 0.5 ? 'bad' : st.hygiene > 0.8 ? 'good' : '')}
      ${stat('Inbound leads', `${n}/month`, `routing pays off at ${INBOUND_GATE}+`)}
      ${stat('Sellers', sellerCount(s), `ARR ${money(arr)}`)}
    </div>
    ${review.length ? review.map((x) => html`<div class="callout ${x.severity === 'bad' ? 'bad' : 'warn'}">${x.text} <span class="small"><b>Stellar operator:</b> ${x.stellar}</span></div>`) : html`<p class="small good">Nothing in your stack is costing you more than it returns right now.</p>`}
  </section>
  <section class="panel"><h2>CRM</h2>
    <p class="small">The CRM app works the same on every vendor; what changes is how much you type, what you can report, and what a later move costs. ${mp.level ? html`<b class="warn">Migration pressure ${Math.round(mp.level * 100)}%.</b>` : 'Light-reporting CRMs start to strain around $5M ARR (research: $5-15M, unverified).'}</p>
    <label class="small"><input type="checkbox" id="migPlanned" ${planned ? 'checked' : ''} /> Planned migration (field map, dedupe, 30 days of dual running). Unchecked = rushed export/import: fewer hours now, ~20% of deal history lost.</label>
    ${table(['Vendor', 'Bill now', 'Data entry', 'Reporting · marketing', 'Fit now', ''], crmRows)}
    ${CRM_VENDORS[cur].capture === 'ai' ? html`<label class="small"><input type="checkbox" id="reviewAi" ${st.reviewAi ? 'checked' : ''} /> Review the AI's CRM updates weekly (~30 min). Off: ~5% of updates are wrong and stay on the deal.</label>` : ''}
  </section>
  <section class="panel"><h2>Agent layer: Rox</h2>
    <p class="small">Agents on top of your CRM: account research, monitoring, contact discovery and meeting briefs. Not a CRM: it syncs with HubSpot or Salesforce. ${ROX.source}.</p>
    ${st.rox ? html`<p>${ROX.plans[st.rox.plan].label}: ${st.rox.actions.toLocaleString('en-US')} / ${ROX.plans[st.rox.plan].actions.toLocaleString('en-US')} actions used this month${ROX.plans[st.rox.plan].writeback ? '' : ' · no writeback: you copy its output into the CRM'}. <button class="sm danger" id="roxStop">Cancel Rox</button></p>`
      : html`<div class="inline">${Object.entries(ROX.plans).map(([k, p]) => html`<button class="sm" data-rox="${k}" ${ROX.crms.includes(cur) ? '' : 'disabled'}>${p.label} · ${money(p.monthly)}/mo (1.5h setup)</button>`)}</div>${ROX.crms.includes(cur) ? '' : html`<p class="hint">Needs HubSpot or Salesforce.</p>`}`}
  </section>
  <section class="panel"><h2>Inbound routing and signals</h2>
    <p class="small">${n} inbound leads in the last 30 days. Below ~${INBOUND_GATE} a month a form plus a booking link is enough; Default and Chili Piper pay off with volume and someone to take meetings. Untriaged leads go cold after ${3} days.</p>
    <div class="inline">${Object.entries(ROUTING).map(([k, r]) => html`<button class="sm ${st.routing === k ? 'primary' : ''}" data-route="${k}" ${st.routing === k ? 'disabled' : ''}>${r.label} · ${money(r.monthly(n, sellerCount(s)))}/mo${r.setupHours ? ` · ${r.setupHours}h` : ''}</button>`)}</div>
    <p class="small muted">Booked by routing: ${st.stats.routedBooked} · junk auto-dismissed: ${st.stats.autoDismissed} · went cold: ${st.stats.wentCold}</p>
    <div class="inline">${Object.entries(SIGNALS_VENDORS).map(([k, v]) => html`<button class="sm ${st.signals === k ? 'primary' : ''}" data-signals="${k}" ${st.signals === k ? 'disabled' : ''}>${v.label} · ${money(v.monthly)}/mo</button>`)}</div>
    <p class="small muted">Signal plays sent: ${st.stats.playsSent} · leads from signals: ${st.stats.signalLeads}. Plays need site traffic and a sharp ICP; broad ICPs burn credits.</p>
  </section>
  <section class="panel"><h2>Local-business leads</h2>
    <p class="small">Restaurants, trades, clinics and shops have little LinkedIn presence: phone, Facebook/Instagram DMs and walk-ins work, cold email rarely does. Records go stale: businesses close and owners change (~10%/yr, game estimate). Your ICP looks ${Math.round(localFit(s) * 100)}% local.</p>
    <div class="inline">${Object.entries(LOCAL_SOURCES).map(([k, v]) => html`<button class="sm ${st.local.source === k ? 'primary' : ''}" data-lsrc="${k}" ${st.local.source === k ? 'disabled' : ''}>${v.label} · ${money(v.monthly)}/mo</button>`)}</div>
    <p class="small muted">${st.local.source ? LOCAL_SOURCES[st.local.source].note : 'Pick a source, then build a list.'}</p>
    ${st.local.source ? html`<button class="sm" id="buildList">Build a 100-row list (${(LOCAL_SOURCES[st.local.source].buildBase + LOCAL_SOURCES[st.local.source].buildPerRow * 100).toFixed(1)}h)</button>` : ''}
    <div class="inline small">Work rows by <select id="lch">${Object.entries(LOCAL_CHANNELS).map(([k, c]) => html`<option value="${k}" ${workOpts.channel === k ? 'selected' : ''}>${c.label} (${Math.round(c.hours * 60)} min each)</option>`)}</select>
      <label><input type="checkbox" id="lverify" ${workOpts.verify ? 'checked' : ''} /> Check each listing first (${Math.round(LOCAL_HOURS.verify * 60)} min)</label></div>
    ${st.local.lists.length ? table(['List', 'Age', 'Left', 'Log', ''], st.local.lists.map((l) => html`<tr><td>${LOCAL_SOURCES[l.source].label.split(' (')[0]} · ${l.category}</td><td>${s.day - l.day} d</td><td>${l.rows.filter((r) => r.st === 'new').length}/${l.size}</td>
      <td class="small">${(l.log ?? []).slice(-3).map((x) => `${x.channel}${x.verify ? '+check' : ''}: ${x.worked} worked, ${x.meetings} meetings, ${x.wasted}h wasted`).join(' · ')}</td>
      <td>${l.rows.some((r) => r.st === 'new') ? html`<button class="sm" data-work="${l.id}">Work 20</button>` : ''}</td></tr>`)) : ''}
  </section>
  <section class="panel"><h2>Outdated or retired for a startup</h2>
    <ul class="list small">${Object.values(OUTDATED).map((o) => html`<li><b>${o.label}</b> ${badge(o.status.replace(/_/g, ' '), o.status === 'retired' ? 'bad' : 'warn')} ${o.note}</li>`)}</ul>
    ${st.zoominfo ? html`<p class="small bad">ZoomInfo contract signed day ${st.zoominfo.day}; renews day ${st.zoominfo.renewalDay}.</p>` : html`<button class="sm" id="zoominfo">Sign ZoomInfo anyway ($15,000/yr prepaid, 2h of calls)</button>`}
  </section>`;
}

function table(head, rows) {
  return html`<div class="table-wrap"><table><thead><tr>${head.map((h) => html`<th>${h}</th>`)}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function wireStack(root, ctx) {
  const s = ctx.state;
  on(root, 'change', '#migPlanned', (e) => { planned = e.target.checked; ctx.render(); });
  on(root, 'change', '#reviewAi', (e) => ctx.act((st) => { ensureStack(st).reviewAi = e.target.checked; }));
  on(root, 'click', '[data-crmpick]', (e, el) => {
    const c = switchCost(s, el.dataset.crmpick, { planned });
    ctx.act((st) => { const r = chooseCrm(st, el.dataset.crmpick, { planned }); toast(`${CRM_VENDORS[el.dataset.crmpick].label} is now your CRM${r.lost ? `: ${r.lost} deal(s) lost their history` : ''}.`, r.lost ? 'warn' : 'good'); }, { hours: Math.min(c.hours, 30), label: c.first ? 'CRM setup' : 'CRM migration' });
  });
  on(root, 'click', '[data-rox]', (e, el) => ctx.act((st) => { startRox(st, el.dataset.rox); }, { hours: 1.5, label: 'Rox setup' }));
  on(root, 'click', '#roxStop', () => ctx.act((st) => stopRox(st)));
  on(root, 'click', '[data-route]', (e, el) => ctx.act((st) => { setRouting(st, el.dataset.route); }, { hours: ROUTING[el.dataset.route].setupHours, label: 'Inbound routing setup' }));
  on(root, 'click', '[data-signals]', (e, el) => ctx.act((st) => { setSignals(st, el.dataset.signals); }, { hours: SIGNALS_VENDORS[el.dataset.signals].setupHours ?? 0, label: 'Signals setup' }));
  on(root, 'click', '[data-lsrc]', (e, el) => ctx.act((st) => { setLocalSource(st, el.dataset.lsrc); }, { hours: 0.25, label: 'Lead source setup' }));
  on(root, 'click', '#buildList', () => {
    const src = LOCAL_SOURCES[ensureStack(s).local.source];
    ctx.act((st) => { buildLocalList(st, { size: 100 }); }, { hours: src.buildBase + src.buildPerRow * 100, label: 'Local list build' });
  });
  on(root, 'change', '#lch', (e) => { workOpts.channel = e.target.value; });
  on(root, 'change', '#lverify', (e) => { workOpts.verify = e.target.checked; });
  on(root, 'click', '[data-work]', (e, el) => {
    const ch = LOCAL_CHANNELS[workOpts.channel];
    const est = workEstimate(s, el.dataset.work, workOpts);
    ctx.act((st) => {
      const r = workLocalList(st, el.dataset.work, { ...workOpts });
      toast(`${r.worked} worked: ${r.conversations} conversations, ${r.meetings} meeting(s). ${r.closedHit} had closed${r.closedCaught ? `, ${r.closedCaught} caught by checking` : ''}; ${r.wrongOwnerLoops} wrong-owner loops.`, r.meetings ? 'good' : 'info');
    }, { hours: est, label: `Local outreach (${ch.label.toLowerCase()})` });
  });
  on(root, 'click', '#zoominfo', () => ctx.act((st) => { signZoomInfo(st); }, { hours: 2, label: 'ZoomInfo sales calls' }));
}
