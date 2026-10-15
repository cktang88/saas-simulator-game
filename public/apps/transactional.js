// Transactional email: provider, sending subdomain, SPF/DKIM/DMARC, and the eight emails every SaaS needs, written and
// reviewed by you. Extends Lifecycle (marketing stream, domain reputation). Engine: emailops/model.js.
// Research: docs/research/plg-email/p2-transactional.md (provider prices are secondary summaries: check the vendor page).

import { html, mount, on, formData, toast, table } from '../core/ui.js';
import { pct, money, round2 } from '../core/util.js';
import { registerOperatorReader } from '../core/operator.js';
import {
  PROVIDERS, TEMPLATES, TEMPLATE_IDS, TXN, ensureTxn, txnDay, planFor, monthlyVolume, lintTemplate, setProvider, addRecord, setDmarcPolicy,
  separateStreams, setFallback, setMonitoring, saveTemplate, publishTemplate, legalReview, seedTest, txnOperatorRead, deliveryNow, REF_DELIVERY,
} from './emailops/model.js';

export { txnEvents, TXN_ACTIONS } from './emailops/model.js';
registerOperatorReader('transactional_email', txnOperatorRead);

const TABS = [['setup', 'Setup'], ['emails', 'Required emails'], ['health', 'Health']];
const ui = { tpl: null };

function setupView(s, T) {
  const plan = planFor(s, T);
  const rec = (k, label) => html`<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)"><span class="small"><b>${label}</b></span>${T.auth[k] ? html`<span class="badge good">verified</span>` : html`<button class="sm" data-rec="${k}">Add record (${TXN.dnsHours} h)</button>`}</div>`;
  const L = s.apps.lifecycle;
  return html`<div class="grid-2"><section class="panel"><h2>Provider</h2>
      ${Object.entries(PROVIDERS).map(([k, p]) => html`<label class="radio-card"><input type="radio" name="prov" data-prov="${k}" ${T.provider === k ? 'checked' : ''} /><b>${p.label}</b><span>${p.note} Setup ~${p.setup} h. (third-party summaries, 2026: verify on the vendor page)</span></label>`)}
      ${T.provider ? html`<p class="small">Now: <b>${PROVIDERS[T.provider].label} ${plan.name}</b> · ${plan.volume.toLocaleString('en-US')} emails / 30 days · ${money(plan.price)}/mo. Choose on deliverability tooling and support, not the cheapest price per thousand: one lost activation costs more than the price gap.</p>` : html`<p class="small muted">Until you choose, login and receipt mail goes out through your app framework's defaults at benchmark quality. Changing provider later means new DNS keys and a reputation reset.</p>`}
    </section>
    <section class="panel"><h2>Sending domain</h2>
      ${T.separate ? html`<p class="small"><span class="badge good">own subdomain</span> Login and receipt mail sends from its own subdomain with its own reputation. A newsletter blast cannot drag it into spam.</p>` : html`<p class="small"><span class="badge warn">shared with marketing</span> ${L?.vendor ? 'Marketing and login mail share one domain: complaints from a blast land on your magic links.' : 'No marketing tool yet, but the first blast will share this domain.'} <button class="sm" id="sep" ${T.provider ? '' : 'disabled'}>Give transactional mail its own subdomain (${TXN.subdomainHours} h)</button></p>`}
      ${T.separate || !L?.vendor ? html`${rec('spf', 'SPF')}${rec('dkim', 'DKIM')}${rec('dmarc', 'DMARC')}
        ${T.auth.dmarc ? html`<p class="small">DMARC policy: <b>p=${T.dmarcPolicy}</b> ${['quarantine', 'reject'].filter((p) => p !== T.dmarcPolicy).map((p) => html`<button class="sm" data-dmarc="${p}">Move to ${p}</button>`)} <span class="muted">Start at none, read reports 2-4 weeks, then tighten.</span></p>` : ''}` : html`<p class="small">Records are the Lifecycle domain's (SPF ${L.domain.spf ? 'ok' : 'missing'}, DKIM ${L.domain.dkim ? 'ok' : 'missing'}, DMARC ${L.domain.dmarc ? 'ok' : 'missing'}); set them in Lifecycle → Setup.</p>`}
      <p class="small muted">Alignment matters: the From domain must align with SPF or DKIM. Gmail and Yahoo require SPF, DKIM and DMARC above 5,000 messages a day, and keep spam rate under 0.30% (advice: under 0.10%).</p>
      <h3>Safety net</h3>
      <label class="inline"><input type="checkbox" id="fb" ${T.fallback ? 'checked' : ''} ${T.provider ? '' : 'disabled'} /> Fallback provider for login codes (${TXN.fallbackHours} h, ~$${TXN.fallbackUsd}/mo)</label>
      <label class="inline"><input type="checkbox" id="mon" ${T.monitoring ? 'checked' : ''} ${T.provider ? '' : 'disabled'} /> Complaint and bounce webhooks with an alert at 0.1% (${TXN.monitorHours} h, ${TXN.weeklyHours} h a week)</label>
      <button class="sm" id="seed" ${T.provider ? '' : 'disabled'}>Seed test: Gmail, Outlook, Yahoo, iCloud (${TXN.seedHours} h)</button>
      ${T.seedTests[0] ? html`<p class="small">Last seed test: ${T.seedTests[0].res.map((r) => `${r.name} ${pct(r.inbox, 0)}`).join(' · ')}</p>` : ''}
    </section></div>`;
}

function emailsView(s, T) {
  const sel = ui.tpl && TEMPLATES[ui.tpl] ? ui.tpl : null;
  const t = sel ? T.templates[sel] : null;
  const def = sel ? TEMPLATES[sel] : null;
  const draft = t ? { subject: t.subject || def.starter.subject, body: t.body || def.starter.body } : null;
  const lint = t ? lintTemplate(sel, { ...draft, sendDays: t.sendDays }) : null;
  return html`<section class="panel"><h2>The emails a SaaS has to send</h2>
    <p class="small muted">Each one has a trigger, required content and a legal note. Defaults from your app framework or Stripe exist for some; "missing" ones cost you when the moment arrives. Legal items were not verified against statute text: confirm with counsel.</p>
    ${table({ columns: [{ label: 'Email', render: (r) => html`<a href="#" data-pick="${r.id}">${TEMPLATES[r.id].label}</a>` }, { label: 'Status', render: (r) => html`<span class="badge ${r.status === 'live' ? 'good' : r.status === 'default' ? 'warn' : r.status === 'draft' ? 'accent' : 'bad'}">${r.status}</span>` }, { label: 'Quality', align: 'right', render: (r) => (r.status === 'missing' ? '-' : pct(r.q, 0)) }, { label: 'Trigger', render: (r) => TEMPLATES[r.id].trigger }], rows: TEMPLATE_IDS.map((id) => T.templates[id]) })}</section>
    ${t ? html`<section class="panel"><h2>${def.label}</h2>
      <p class="small">${def.trigger}${def.legal ? html` <span class="badge warn">legal-sensitive</span>` : ''}</p>
      <form id="tplForm"><label>Subject <input name="subject" value="${draft.subject}" /></label><label>Body <textarea name="body" rows="9">${draft.body}</textarea></label>
        ${def.needsDays ? html`<label>Send this many days before (comma-separated) <input name="days" value="${(t.sendDays ?? []).join(', ')}" /></label>` : ''}
        <div class="inline"><button class="sm" value="save">Save draft (${TXN.templateHours} h)</button><button class="primary sm" value="publish" id="pubBtn">Review and publish</button>${def.legal && t.status === 'live' ? html`<button type="button" class="sm" id="legal">Legal read (${money(TXN.reviewUsd)}, ${TXN.reviewHours} h)</button>` : ''}</div></form>
      <h3>Checklist</h3>${def.checks.map(([k, label, , legal]) => html`<div class="small ${lint.missing.some((m) => m.key === k) ? 'neg' : 'pos'}">${lint.missing.some((m) => m.key === k) ? '✗' : '✓'} ${label}${legal ? ' (legal)' : ''}</div>`)}
      ${lint.issues.map((i) => html`<div class="small neg">- ${i}</div>`)}
      ${t.legalChecked ? html`<p class="small pos">A lawyer has read this one.</p>` : ''}</section>` : ''}`;
}

function healthView(s, T) {
  const d = deliveryNow(s, T);
  const rows = T.daily.slice(-14).reverse();
  return html`<section class="panel"><h2>Health</h2><div class="stats">
    <div class="stat"><div class="stat-label">Inbox delivery</div><div class="stat-value">${pct(d, 0)}</div><div class="stat-sub">typical setup ~${pct(REF_DELIVERY, 0)}; target 90%+ placement</div></div>
    <div class="stat"><div class="stat-label">Stream reputation</div><div class="stat-value">${Math.round(T.rep)}</div><div class="stat-sub">${T.separate ? 'own subdomain' : 'shared with marketing'}</div></div>
    <div class="stat"><div class="stat-label">Lockout tickets</div><div class="stat-value">${Math.round(T.stats.lockoutTickets)}</div><div class="stat-sub">${Math.round(T.stats.receiptTickets)} receipt tickets · ${T.stats.noticeMisses} surprise conversions</div></div>
    <div class="stat"><div class="stat-label">Complaints (30d)</div><div class="stat-value">${((T.complaintRate30 ?? 0) * 100).toFixed(2)}%</div><div class="stat-sub">${T.outage ? 'provider incident now' : 'no incident'}</div></div></div>
    ${table({ columns: [{ label: 'Day', render: (r) => r.day }, { label: 'Delivery', align: 'right', render: (r) => pct(r.delivery, 0) }, { label: 'Rep', align: 'right', render: (r) => Math.round(r.rep) }, { label: 'Lockout tickets', align: 'right', render: (r) => r.lock }], rows, empty: 'Choose a provider to start tracking.' })}</section>`;
}

export default {
  id: 'transactional',
  title: 'Transactional email',
  icon: '🔐',
  group: 'Growth',
  badge: (state) => { const T = state.apps?.transactional; return T?.provider && T.delivery < 0.7 ? '!' : null; },

  render(root, ctx) {
    const s = ctx.state;
    const T = ensureTxn(s);
    const tab = TABS.some(([k]) => k === ctx.params) ? ctx.params : 'setup';
    mount(root, html`
      <div class="app-head"><div><h1>Transactional email</h1><p>Login codes, receipts, trial and renewal notices, failed payments and security alerts. They must arrive, say the right things and never share a reputation with your newsletter.</p></div></div>
      <div class="tabs">${TABS.map(([k, l]) => html`<a href="#/transactional/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${tab === 'setup' ? setupView(s, T) : tab === 'emails' ? emailsView(s, T) : healthView(s, T)}`);
    const act = (fn, hours, label) => ctx.act((st) => { const r = fn(st); if (!r.ok) throw new Error(r.error); return r; }, { hours, label });
    on(root, 'change', '[data-prov]', (e, el) => { const id = el.dataset.prov; const h = PROVIDERS[id].setup * (T.provider ? 1.3 : 1); act((st) => setProvider(st, id), h, `Set up ${PROVIDERS[id].label}`); });
    on(root, 'click', '[data-rec]', (e, el) => act((st) => addRecord(st, el.dataset.rec), TXN.dnsHours, `${el.dataset.rec.toUpperCase()} record`));
    on(root, 'click', '[data-dmarc]', (e, el) => act((st) => setDmarcPolicy(st, el.dataset.dmarc), 0.5, 'DMARC policy'));
    on(root, 'click', '#sep', () => act((st) => separateStreams(st), TXN.subdomainHours, 'Separate transactional subdomain'));
    on(root, 'change', '#fb', (e, el) => act((st) => setFallback(st, el.checked), el.checked ? TXN.fallbackHours : 0.25, 'Fallback provider'));
    on(root, 'change', '#mon', (e, el) => act((st) => setMonitoring(st, el.checked), el.checked ? TXN.monitorHours : 0.25, 'Deliverability monitoring'));
    on(root, 'click', '#seed', () => ctx.act((st) => { const r = seedTest(st); if (!r.ok) throw new Error(r.error); toast(`Seed test: ${r.result.res.map((x) => `${x.name} ${Math.round(x.inbox * 100)}%`).join(', ')}`, 'info'); }, { hours: TXN.seedHours, label: 'Seed test' }));
    on(root, 'click', '[data-pick]', (e, el) => { e.preventDefault(); ui.tpl = el.dataset.pick; ctx.render(); });
    const read = () => { const f = formData(root.querySelector('#tplForm')); return { subject: f.subject, body: f.body, sendDays: f.days ? String(f.days).split(',').map((x) => Number(x.trim())).filter(Number.isFinite) : undefined }; };
    on(root, 'submit', '#tplForm', (e) => {
      e.preventDefault();
      const id = ui.tpl;
      const publish = e.submitter?.id === 'pubBtn';
      ctx.act((st) => {
        const a = saveTemplate(st, id, read());
        if (!a.ok) throw new Error(a.error);
        if (publish) { const p = publishTemplate(st, id, { approved: true }); if (!p.ok) throw new Error(p.error); toast(`Published (quality ${Math.round(p.quality * 100)}%).`, p.quality >= 0.7 ? 'good' : 'warn'); }
      }, { hours: TXN.templateHours + (publish ? 0.25 : 0), label: `Write ${TEMPLATES[id].label} email` });
    });
    on(root, 'click', '#legal', () => act((st) => legalReview(st, ui.tpl), TXN.reviewHours, 'Legal read of a template'));
  },

  onDay(state) { if (state.apps?.transactional?.provider) txnDay(state); },
};
