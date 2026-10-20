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

import { SMS, SMS_PROVIDERS, SMS_ITEMS, smsSlice, smsTick, setSmsProvider, setNumberType, submitRegistration, setSmsTemplate, setEmailFallback, setGeoPermissions, setUseCases, segmentsOf, renderSms, perSegmentUsd, registered } from './emailops/sms.js';

export { txnEvents, TXN_ACTIONS } from './emailops/model.js';
registerOperatorReader('transactional_email', txnOperatorRead);

const TABS = [['setup', 'Setup'], ['emails', 'Required emails'], ['sms', 'SMS'], ['health', 'Health']];
const ui = { tpl: null };

function setupView(s, T) {
  const plan = planFor(s, T);
  const rec = (k, label) => html`<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)"><span class="small"><b>${label}</b></span>${T.auth[k] ? html`<span class="badge good">verified</span>` : html`<button class="sm" data-rec="${k}">Add record (${TXN.dnsHours} h)</button>`}</div>`;
  const L = s.apps.lifecycle;
  return html`<div class="grid-2"><section class="panel"><h2>Provider</h2>
      ${Object.entries(PROVIDERS).map(([k, p]) => html`<label class="radio-card"><input type="radio" name="prov" data-prov="${k}" ${T.provider === k ? 'checked' : ''} ${p.outdated && T.provider !== k ? 'disabled' : ''} /><b>${p.label}</b>${p.outdated ? html` <span class="badge bad">outdated since ${p.outdated.since}</span>` : ''}<span>${p.outdated ? p.outdated.note : p.note} Setup ~${p.setup} h. (third-party summaries, 2026: verify on the vendor page)</span></label>`)}
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

function smsView(s) {
  const S = smsSlice(s);
  const seg = segmentsOf(renderSms(s, S.template));
  const st = S.reg.status;
  return html`<div class="grid-2"><section class="panel"><h2>SMS provider</h2>
      <p class="small muted">Login codes (OTP) and product alerts by text. Optional: email codes work for most SaaS. If you send SMS to US numbers, carriers require A2P 10DLC registration (brand + campaign) or toll-free verification first; unregistered traffic is blocked.</p>
      ${Object.entries(SMS_PROVIDERS).map(([k, p]) => html`<label class="radio-card"><input type="radio" name="smsprov" data-smsprov="${k}" ${S.provider === k ? 'checked' : ''} /><b>${p.label}</b><span>${p.note} Setup ~${p.setupH} h.</span></label>`)}
      ${S.provider ? html`<p class="small">Number: <select id="smsNum"><option value="10dlc" ${S.numberType === '10dlc' ? 'selected' : ''}>Local 10DLC (brand + campaign registration)</option><option value="tollfree" ${S.numberType === 'tollfree' ? 'selected' : ''}>Toll-free (verification)</option></select> · ~$${perSegmentUsd(S)}/segment all-in</p>
        <label class="inline"><input type="checkbox" id="smsOtp" ${S.useOtp ? 'checked' : ''} /> Login codes</label> <label class="inline"><input type="checkbox" id="smsAlerts" ${S.useAlerts ? 'checked' : ''} /> Product alerts</label>` : ''}
    </section>
    <section class="panel"><h2>Carrier registration</h2>
      ${!S.provider ? html`<p class="empty">Pick a provider first.</p>` : st === 'approved' ? html`<p class="small"><span class="badge good">approved</span> Carriers deliver your messages.</p>`
        : st === 'pending' ? html`<p class="small"><span class="badge warn">pending</span> Submitted ${S.reg.submittedDay}, decision around day ${S.reg.readyDay}. Until then every message is blocked${S.emailFallback ? ' and login codes fall back to email' : ''}.</p>`
        : html`${st === 'rejected' ? html`<p class="small"><span class="badge bad">rejected</span> Fix what is missing and resubmit.</p>` : html`<p class="small"><span class="badge bad">not registered</span> Messages are blocked until this is approved (${S.numberType === 'tollfree' ? SMS.tollFreeDays.join('-') : SMS.regDays.join('-')} days).</p>`}
          <form id="smsReg">${Object.entries(SMS_ITEMS).map(([k, l]) => html`<label class="inline"><input type="checkbox" name="${k}" /> ${l}</label>`)}
          <button class="sm primary">Submit (${SMS.regHours} h${S.numberType === '10dlc' ? `, ~$${SMS.brandFee + SMS.vettingFee} fees + $${SMS.campaignMonthly}/mo campaign` : ''})</button></form>`}
      <h3>Message template</h3>
      <form id="smsTpl"><textarea name="t" rows="3">${S.template}</textarea><button class="sm">Save (${SMS.templateHours} h)</button></form>
      <p class="small ${seg.segments > 1 ? 'neg' : ''}">${seg.len} characters, ${seg.gsm ? 'GSM-7 (160 per segment)' : 'Unicode (70 per segment: an emoji or curly quote does this)'} → <b>${seg.segments} segment(s)</b> per message.</p>
      <h3>Safety net</h3>
      <label class="inline"><input type="checkbox" id="smsFb" ${S.emailFallback ? 'checked' : ''} ${S.provider ? '' : 'disabled'} /> Fall back to an email code when SMS fails (${SMS.fallbackHours} h)</label>
      <label class="inline"><input type="checkbox" id="smsGeo" ${S.geo ? 'checked' : ''} ${S.provider ? '' : 'disabled'} /> Geo permissions + rate limit on "send code" against SMS pumping (${SMS.geoHours} h)</label>
      <p class="small muted">Sent ${Math.round(S.stats.sent)} · blocked ${Math.round(S.stats.blocked)} · cost ${money(S.stats.cost)} · signups lost to missing codes ~${Math.round(S.stats.lostSignups)}${registered(S) ? '' : ''}</p>
    </section></div>`;
}

function wireSms(root, ctx) {
  const act = (fn, hours, label) => ctx.act((st) => { const r = fn(st); if (!r.ok) throw new Error(r.error); return r; }, { hours, label });
  on(root, 'change', '[data-smsprov]', (e, el) => { const id = el.dataset.smsprov; act((st) => setSmsProvider(st, id), SMS_PROVIDERS[id].setupH * (smsSlice(ctx.state).provider ? 1.3 : 1), `Set up ${SMS_PROVIDERS[id].label}`); });
  on(root, 'change', '#smsNum', (e, el) => act((st) => setNumberType(st, el.value), 0.5, 'SMS number type'));
  on(root, 'change', '#smsOtp', (e, el) => act((st) => setUseCases(st, { otp: el.checked }), 0.25, 'SMS login codes'));
  on(root, 'change', '#smsAlerts', (e, el) => act((st) => setUseCases(st, { alerts: el.checked }), 0.25, 'SMS alerts'));
  on(root, 'submit', '#smsReg', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => { const r = submitRegistration(st, { optIn: Boolean(f.optIn), privacy: Boolean(f.privacy), samples: Boolean(f.samples) }); if (r.ok) toast(`Submitted: carriers decide in about ${r.days} days.`, 'info'); return r; }, SMS.regHours, 'SMS carrier registration'); });
  on(root, 'submit', '#smsTpl', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => setSmsTemplate(st, f.t), SMS.templateHours, 'SMS template'); });
  on(root, 'change', '#smsFb', (e, el) => act((st) => setEmailFallback(st, el.checked), el.checked ? SMS.fallbackHours : 0.1, 'SMS email fallback'));
  on(root, 'change', '#smsGeo', (e, el) => act((st) => setGeoPermissions(st, el.checked), el.checked ? SMS.geoHours : 0.1, 'SMS geo permissions'));
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
      ${tab === 'setup' ? setupView(s, T) : tab === 'emails' ? emailsView(s, T) : tab === 'sms' ? smsView(s) : healthView(s, T)}`);
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
    wireSms(root, ctx);
  },

  onDay(state) { const T = state.apps?.transactional; if (T?.provider) txnDay(state); if (T?.sms?.provider) smsTick(state); },
};
