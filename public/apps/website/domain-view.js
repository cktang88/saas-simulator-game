// Website -> Domain: the registrar-style search, the owned-domain card, the celebration and the browser frame that shows
// the site at its address. Logic lives in apps/website/domain.js.

import { html, on, toast, modal, badge } from '../../core/ui.js';
import { money, fmtDate } from '../../core/util.js';
import { REGISTRARS, TLDS, searchDomains, gradeDomain, buyDomain, domainOf, founderEmail, siteHost, ownedSiteDomain, purchaseHours, DOMAIN_LANDING } from './domain.js';

// In-progress search survives re-renders (ARCHITECTURE: render gets a fresh root on every state change).
let draft = { q: '', registrar: 'cloudflare', results: null, searches: 0, open: false };

const TIER_TONE = { stellar: 'good', good: 'good', average: 'warn', mediocre: 'bad' };
const STATUS = {
  available: ['Available', 'good'],
  premium: ['Registry premium', 'warn'],
  aftermarket: ['For sale (aftermarket)', 'warn'],
  taken: ['Taken', ''],
  invalid: ['Invalid', 'bad'],
  unsupported: ['Not sold here', ''],
};

function gradeBlock(g, { compact = false } = {}) {
  return html`<div class="small">
    <b>Name quality:</b> ${badge(g.tier, TIER_TONE[g.tier])} <span class="muted">${g.score}/100</span>
    ${compact ? '' : html`${g.good.length ? html`<div class="pos">+ ${g.good.join(' · ')}</div>` : ''}
    ${g.weak.length ? html`<div class="neg">− ${g.weak.join(' · ')}</div>` : ''}
    ${g.tips.length ? html`<div class="muted" style="margin-top:4px">${g.tips.join(' ')}</div>` : ''}`}
  </div>`;
}

function resultRow(s, r) {
  const [label, tone] = STATUS[r.status] ?? [r.status, ''];
  const g = gradeDomain(r.domain, s.company.name, { oneLiner: s.company.oneLiner });
  const buyable = ['available', 'premium', 'aftermarket'].includes(r.status);
  const price = r.status === 'aftermarket' ? html`<b>${money(r.dueNow)}</b> <span class="muted small">then ${money(r.renew, { cents: true })}/yr</span>`
    : r.status === 'taken' || r.status === 'invalid' || r.status === 'unsupported' ? html`<span class="muted">—</span>`
      : html`<b>${money(r.first, { cents: true })}</b>/yr${r.years > 1 ? html` <span class="small muted">× ${r.years} yr min = ${money(r.dueNow, { cents: true })}</span>` : ''}${r.renew !== r.first ? html` <span class="small warn">renews ${money(r.renew, { cents: true })}</span>` : ''}`;
  return html`<tr class="${r.idea ? 'muted-row' : ''}">
    <td><b style="font-family:var(--mono, monospace)">${r.domain}</b>${r.idea ? html` <span class="small muted">idea</span>` : ''}<div class="small muted">${r.note ?? ''}</div></td>
    <td>${badge(label, tone)}</td>
    <td>${price}</td>
    <td>${buyable ? badge(g.tier, TIER_TONE[g.tier]) : ''}</td>
    <td>${buyable ? html`<button class="sm ${r.status === 'available' ? 'primary' : ''}" data-buy-domain="${r.domain}">${r.status === 'aftermarket' ? 'Buy now' : 'Register'}</button>` : ''}</td>
  </tr>`;
}

function searchBlock(s) {
  const placeholder = (s.company.name || 'yourcompany').toLowerCase().replace(/[^a-z0-9]/g, '');
  return html`<form id="domainSearch" class="inline" style="flex-wrap:wrap">
      <label style="flex:1;min-width:200px">Find your domain <input name="q" value="${draft.q}" placeholder="${placeholder}.com" autocomplete="off" spellcheck="false" /></label>
      <label style="max-width:220px">Registrar <select name="registrar">${Object.entries(REGISTRARS).map(([k, v]) => html`<option value="${k}" ${draft.registrar === k ? 'selected' : ''}>${v.label}</option>`)}</select></label>
      <button class="primary">Search</button>
    </form>
    <p class="small muted">${REGISTRARS[draft.registrar].note} Searching is free; registering takes a few minutes of checkout and DNS.</p>
    ${draft.results ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Domain</th><th>Status</th><th>Price</th><th>Name</th><th></th></tr></thead>
      <tbody>${draft.results.map((r) => resultRow(s, r))}</tbody></table></div>
      <p class="small muted">Prices are 2026 registrar list prices (approximate). Which extension fits:</p>
      <ul class="list small">${Object.values(TLDS).map((t) => html`<li><b>${t.label}</b> ${t.why}</li>`)}</ul>` : ''}`;
}

/** The Domain panel: a big step-1 call to action until you own one, then the owned-domain card. */
export function domainPanel(s) {
  const info = domainOf(s);
  const lost = !info && s.company.domainInfo?.lost ? s.company.domainInfo : null;
  const owned = ownedSiteDomain(s);
  if (!info) {
    return html`<section class="panel domain-cta" id="domainPanel">
      <h2>Step 1 · Pick your domain</h2>
      ${lost ? html`<div class="callout bad small">You lost <b>${lost.name}</b> to a trademark complaint on ${fmtDate(s, lost.lostDay)}. Your site and email have no home until you register a new name.</div>`
        : html`<p>Your domain is your company's address: on every ad, cold email, invoice and business card. Search for names, compare extensions and prices, and register one. ${s.company.website ? html`<span class="warn">Right now your page lives on a free builder subdomain (${siteHost(s)}), which looks like a side project.</span>` : ''}</p>`}
      ${owned ? html`<div class="callout small">Your live site is at <b>${owned}</b>. Already own it? <button class="sm" data-connect-domain="${owned}">Connect ${owned} (15 min)</button></div>` : ''}
      ${searchBlock(s)}
    </section>`;
  }
  const g = info.grade ?? gradeDomain(info.name, s.company.name, { oneLiner: s.company.oneLiner });
  const email = founderEmail(s);
  return html`<section class="panel" id="domainPanel">
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline">
      <h2 style="margin:0">Domain</h2>
      <span class="domain-chip big">🔒 ${info.name}</span>
    </div>
    <p class="small muted">${info.kind === 'legacy' ? 'Owned (set before the registrar existed).'
      : html`${info.kind === 'connected' ? 'Connected (you already owned it)' : `Registered at ${REGISTRARS[info.registrar]?.label ?? 'your registrar'}`} on ${fmtDate(s, info.boughtDay)}${info.paid ? `, paid ${money(info.paid, { cents: info.paid < 1000 })}` : ''}. Renews ${money(info.renewal, { cents: true })}/yr.`}
      Company email: <b>${email}</b>.</p>
    ${gradeBlock(g)}
    <p class="small muted">Effect on landing conversion: ×${(info.collision ? DOMAIN_LANDING.collision : DOMAIN_LANDING[g.tier] ?? 1).toFixed(3)} [design: a domain is a small trust signal; it never rescues a weak page].</p>
    <details ${draft.open ? 'open' : ''} id="domainMore"><summary>Search for a different domain</summary>
      <p class="small warn">Switching later breaks links, email addresses and search rankings. Do it before launch or not at all.</p>
      ${searchBlock(s)}</details>
  </section>`;
}

/** A browser window showing the site at its real address. */
export function browserFrame(s, site) {
  const host = siteHost(s);
  const own = Boolean(s.company.domain);
  return html`<div class="browser-frame">
    <div class="browser-bar"><span class="dots"><i></i><i></i><i></i></span>
      <span class="url ${own ? '' : 'warn'}">${own ? '🔒 ' : '⚠︎ '}https://${host}</span></div>
    <div class="browser-body">
      ${site ? html`<p style="margin:0"><b>${site.title || '(no title)'}</b></p><p class="muted small">${site.description}</p>
        <ul class="list small">${(site.headings ?? []).slice(0, 8).map((h) => html`<li>${h}</li>`)}</ul>`
        : html`<p class="muted small">Nothing published yet.</p>`}
    </div>
  </div>`;
}

function celebrate(s, info) {
  const g = info.grade;
  modal({
    title: `🎉 You own ${info.name}`,
    body: html`<div class="domain-celebrate">
      <div class="domain-chip huge">${info.name}</div>
      <p>It's real now: <b>https://${info.name}</b> is your company's address, and <b>${founderEmail(s)}</b> is your email.</p>
      ${gradeBlock(g)}
      <p class="small muted">Paid ${money(info.paid, { cents: info.paid < 1000 })}${info.registrar !== 'external' ? ` to ${REGISTRARS[info.registrar]?.label}` : ''}; renews ${money(info.renewal, { cents: true })}/yr (in Bank → recurring). Next: put your landing page on it.</p>
    </div>`,
    actions: [{ label: 'Put my site on it', primary: true }],
  });
}

/** Wire the domain events inside the Website app's root. */
export function wireDomain(root, ctx) {
  on(root, 'click', '[data-scroll-domain]', () => { const p = root.querySelector('#domainPanel'); p?.scrollIntoView({ behavior: 'smooth', block: 'start' }); p?.querySelector('input[name=q]')?.focus(); });
  on(root, 'click', '#domainMore > summary', () => { draft.open = !draft.open; });
  on(root, 'change', '#domainSearch select', (e, el) => { draft.registrar = el.value; if (draft.q) { draft.results = searchDomains(ctx.state, draft.q, draft.registrar); ctx.render(); } });
  on(root, 'submit', '#domainSearch', (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (!q) return toast('Type a name to search, e.g. your company name.', 'warn');
    draft = { ...draft, q, registrar: e.target.registrar.value, results: searchDomains(ctx.state, q, e.target.registrar.value), searches: draft.searches + 1 };
    ctx.render();
  });
  const buy = (name, connect = false) => {
    const searches = draft.searches;
    const kind = connect ? 'connected' : draft.results?.find((r) => r.domain === name)?.status === 'aftermarket' ? 'aftermarket' : 'registered';
    return ctx.act((st) => {
      const info = buyDomain(st, name, { registrar: draft.registrar, searches, connect });
      draft = { q: '', registrar: draft.registrar, results: null, searches: 0, open: false };
      setTimeout(() => celebrate(st, info), 0);
      return info;
    }, { hours: purchaseHours(searches, kind), label: connect ? 'Connect domain' : 'Register domain' });
  };
  on(root, 'click', '[data-buy-domain]', (e, el) => {
    const name = el.dataset.buyDomain;
    const r = draft.results?.find((x) => x.domain === name);
    if (r?.status === 'aftermarket' || r?.status === 'premium') {
      modal({
        title: `Buy ${name} for ${money(r.dueNow)}?`,
        body: html`<p>${r.note}</p>${gradeBlock(gradeDomain(name, ctx.state.company.name, { oneLiner: ctx.state.company.oneLiner, kind: r.status }))}`,
        actions: [{ label: 'Cancel' }, { label: `Pay ${money(r.dueNow)}`, primary: true, onClick: () => { buy(name); } }],
      });
      return;
    }
    buy(name);
  });
  on(root, 'click', '[data-connect-domain]', (e, el) => buy(el.dataset.connectDomain, true));
}
