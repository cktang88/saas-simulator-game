// Legal: Stripe Atlas/Clerky (entity + founder paperwork), Termly (policies), Vanta/Drata-style SOC 2 workflow and
// AI security questionnaires (legal/compliance.js),
// USPTO trademarks, contracts & redlines, and a compliance calendar on real 2026–2027 dates.
// Everything here is general information, not legal advice. Numbers: legal/catalog.js.

import { html, mount, on, formData, table, stat, badge, modal } from '../core/ui.js';
import { money, pct, fmtDate, isoDate } from '../core/util.js';
import { activeSubs, mrr } from '../core/stripe.js';
import { PROVIDERS, OPERATING_STATES, CONVERSION, DELAWARE, FOUNDER_STOCK, POLICIES, DPA, GDPR_ITEMS, AI_ACT_ITEMS, AI_ACT_DATES, TRADEMARK, CONTRACTS, ONE_099, LEGAL_BENCHMARKS } from './legal/catalog.js';
import { buildCalendar, franchiseAuthorizedShares, yearOf, forms1099 } from './legal/deadlines.js';
import { CLAUSES, scoreRedlines } from './legal/redlines.js';
import {
  ensureLegal, incorporate, convertToCcorp, getEin, signFounderDocs, file83b, setDoc, completeKyc, setPolicies, setCookieBanner, gdprItem,
  setupDpa, aiActItem, detectAi, knockoutSearch, trademarkFee, fileTrademark, respondOfficeAction, extendOfficeAction,
  setupContracts, setupEsign, resolveRedline, payFranchiseTax, payFiling, answerDsr, legalIssues, legalSpend, legalDay, legalMonthEnd, redlineCtx,
} from './legal/sim.js';
import { redlineFeedback } from './legal/llm.js';
import { complianceDay } from './legal/compliance.js';
import { soc2View, questionnairesView, bindCompliance } from './legal/views-compliance.js';

const draft = {
  inc: { provider: null, operatingState: 'CA' },
  stock: { authorized: FOUNDER_STOCK.authorized, issued: FOUNDER_STOCK.issued, creditMonths: 0 },
  tm: { mark: '', description: '', classes: ['009', '042'], freeform: false, attorney: false },
  redline: {},
};

const TABS = [['', 'Entity'], ['founder', 'Founder docs'], ['privacy', 'Privacy & policies'], ['ai', 'AI Act'], ['soc2', 'SOC 2'], ['security', 'Security reviews'], ['tm', 'Trademark'], ['contracts', 'Contracts'], ['calendar', 'Calendar'], ['spend', 'Spend']];
const DISCLAIMER = html`<p class="hint">General information for practice, not legal or tax advice. Real decisions: talk to a qualified lawyer/CPA.</p>`;
const ENTITY_LABEL = { none: 'Unincorporated (sole proprietor)', llc: 'LLC', ccorp: 'Delaware C-corp' };
const daysLeftLabel = (s, d) => (d - s.day >= 0 ? `${d - s.day} days left` : `${s.day - d} days overdue`);

function entityView(s, L) {
  const inc = L.incorporation;
  const issues = legalIssues(s);
  const cal = buildCalendar(s).filter((i) => i.status !== 'done').slice(0, 5);
  const recommend = s.company.path === 'vc' ? 'Delaware C-corp (investors and SAFEs expect it; QSBS can apply)' : 'LLC for pass-through simplicity, or a C-corp if a raise or exit is plausible';
  return html`
    <div class="stats">
      ${stat('Entity', ENTITY_LABEL[s.company.incorporated ? s.company.entity : 'none'], inc ? (inc.status === 'pending' ? `filing… effective ${fmtDate(s, inc.effectiveDay)}` : `${PROVIDERS[inc.provider].label} · ${inc.jurisdiction}`) : '', s.company.incorporated ? 'good' : 'warn')}
      ${stat('EIN', L.ein.status === 'done' ? 'Issued' : L.ein.status === 'pending' ? 'Pending' : 'None', L.ein.status === 'pending' ? `expected ${fmtDate(s, L.ein.readyDay)}` : '')}
      ${stat('Diligence flags', issues.length, issues.length ? 'see below' : 'clean', issues.length ? 'warn' : 'good')}
      ${stat('Legal spend', money(legalSpend(s).total), 'to date')}
    </div>
    ${issues.length ? html`<div class="callout warn"><b>What an investor or acquirer would flag:</b><ul class="small" style="margin:4px 0;padding-left:18px">${issues.map((i) => html`<li>${i}</li>`)}</ul></div>` : ''}
    <div class="grid-2">
      <section class="panel">
        <h2>Incorporation</h2>
        ${!inc ? html`
          <p class="small">Recommended for your path: <b>${recommend}</b>. Staying unincorporated means unlimited personal liability, no way to take investment, and enterprise buyers can't contract with you.</p>
          <form id="incForm">
            ${Object.entries(PROVIDERS).map(([k, p]) => html`<label class="radio-card"><input type="radio" name="provider" value="${k}" ${draft.inc.provider === k ? 'checked' : ''} /><b>${p.label} — ${money(p.fee)}${k === 'doola' ? '/yr' : ''} · ${p.entity === 'ccorp' ? 'Delaware C-corp' : 'LLC'}</b><span>${p.includes} Registered agent: ${p.agentAnnual ? `${money(p.agentAnnual)}/yr${p.agentFirstYearFree ? ' from year 2' : ''}` : 'you'}. ~${p.hours}h of your time.</span></label>`)}
            <label>Where you (the founder) actually operate <select name="operatingState">${Object.entries(OPERATING_STATES).map(([k, o]) => html`<option value="${k}" ${draft.inc.operatingState === k ? 'selected' : ''}>${o.label}${o.qualify ? ` — foreign qualification ~$${o.qualify}${o.annual ? `, then ~$${o.annual}/yr` : ''}` : ''}</option>`)}</select></label>
            <p class="hint">A Delaware company doing business elsewhere must register (foreign-qualify) there too. California also charges an $800 minimum franchise tax every year.</p>
            <button class="primary">File incorporation</button>
          </form>` : html`
          <p>${ENTITY_LABEL[inc.entity]} via ${PROVIDERS[inc.provider].label}, filed ${fmtDate(s, inc.filedDay)} · ${inc.status === 'pending' ? badge(`effective ${fmtDate(s, inc.effectiveDay)}`, 'warn') : badge('in good standing', 'good')}</p>
          <p class="small muted">Operating in: ${OPERATING_STATES[inc.operatingState].label}</p>
          ${s.company.entity === 'llc' && inc.status === 'done' ? html`<div class="callout ${s.company.path === 'vc' ? 'warn' : ''} small">Raising from VCs later requires converting to a Delaware C-corp: ~${money(CONVERSION.fee)} in legal fees (game value), ~${CONVERSION.days} days, new founder stock and a new 83(b).
            ${L.conversion?.status === 'pending' ? html`<br>${badge(`converting — done ${fmtDate(s, L.conversion.doneDay)}`, 'warn')}` : html`<br><button class="sm" id="convert">Convert to C-corp (${CONVERSION.hours}h)</button>`}</div>` : ''}`}
      </section>
      <section class="panel">
        <h2>After incorporating</h2>
        <ul class="list">
          <li><b>EIN</b> (federal tax ID): ${L.ein.status === 'done' ? badge('issued', 'good') : L.ein.status === 'pending' ? badge(`pending until ${fmtDate(s, L.ein.readyDay)}`, 'warn') : html`<button class="sm" id="ein" ${s.company.incorporated ? '' : 'disabled'}>Apply online at irs.gov (0.5h)</button> <span class="small muted">instant for US persons; non-US founders fax/mail SS-4 and wait weeks</span>`}</li>
          <li><b>Founder stock, vesting & IP assignment</b>: ${L.docs.ipAssignment ? badge('signed', 'good') : html`<a href="#/legal/founder">sign in Founder docs</a>`}</li>
          <li><b>Bank & Stripe KYC</b> in the company's name: ${L.kyc?.done ? badge('done', 'good') : L.kyc ? html`<button class="sm" id="kyc">Update bank + Stripe (1h)</button> <span class="small muted">due ${fmtDate(s, L.kyc.dueDay)}</span>` : html`<span class="small muted">after incorporation</span>`}</li>
          <li><b>Registered agent</b>: ${inc ? (PROVIDERS[inc.provider].agentAnnual ? `${money(PROVIDERS[inc.provider].agentAnnual)}/yr, auto-renews` : 'you (your address is public)') : '—'}</li>
          <li><b>CIIAA template</b> for hires & contractors: ${L.docs.ciiaa ? badge('ready', 'good') : html`<a href="#/legal/founder">create</a>`}</li>
        </ul>
        <h3>Next deadlines</h3>
        ${cal.length ? html`<ul class="list small">${cal.map((i) => html`<li><b>${fmtDate(s, i.dueDay)}</b> ${i.title} ${badge(i.status, i.status === 'overdue' ? 'bad' : i.status === 'due' ? 'warn' : '')}</li>`)}</ul>` : html`<p class="muted small">Nothing scheduled.</p>`}
        <p><a href="#/legal/calendar">Full compliance calendar →</a></p>
      </section>
    </div>`;
}

function founderView(s, L) {
  const fs = L.founderStock;
  const corp = s.company.entity === 'ccorp' && s.company.incorporated;
  const p = PROVIDERS[L.incorporation?.provider];
  const d = draft.stock;
  return html`<div class="grid-2">
    <section class="panel">
      <h2>Founder stock purchase + vesting</h2>
      ${!s.company.incorporated ? html`<p class="muted">Incorporate first.</p>` : !corp ? html`
        <p class="small">LLC: sign an operating agreement and assign your IP (code, domain, designs) to the company.</p>
        ${L.docs.operatingAgreement ? badge('operating agreement + IP assignment signed', 'good') : html`<button class="primary" id="signFounder">Sign operating agreement + IP assignment (1h)</button>`}` : fs ? html`
        <p>${fs.issued.toLocaleString('en-US')} of ${fs.authorized.toLocaleString('en-US')} authorized shares at $${fs.par} par (paid $${fs.price}). ${fs.vestYears}-year vesting, 1-year cliff${fs.creditMonths ? `, ${fs.creditMonths} months credit for work already done` : ''}. Granted ${fmtDate(s, fs.grantDay)}.</p>` : html`
        <form id="stockForm">
          <div class="grid-3">
            <label>Authorized shares <input type="number" name="authorized" value="${d.authorized}" min="1000" step="1" /></label>
            <label>Issued to you <input type="number" name="issued" value="${d.issued}" min="1" step="1" /></label>
            <label>Vesting credit (months) <input type="number" name="creditMonths" value="${d.creditMonths}" min="0" max="12" /></label>
          </div>
          <p class="hint">Standard: buy restricted stock at par, 4-year vesting with a 1-year cliff (investors want founders to vest too). Keeping some authorized shares unissued leaves room for an option pool. Signing starts the 30-day 83(b) clock.</p>
          <button class="primary">Sign stock purchase agreement + IP assignment (1h)</button>
        </form>`}
    </section>
    <section class="panel">
      <h2>83(b) election ${fs ? (fs.filed83b ? badge(`filed ${fmtDate(s, fs.filedDay)}`, 'good') : fs.missed ? badge('missed', 'bad') : badge(daysLeftLabel(s, fs.grantDay + 30), 'warn')) : ''}</h2>
      <p class="small">Elect to be taxed now on the stock's value (≈ $0 at par) instead of on each vesting tranche later. <b>Within 30 days of the grant — no extensions, no fix.</b> Since July 2025 the IRS accepts it online via <b>Form 15620</b> through an IRS online account (ID.me), with immediate confirmation; certified mail still works. Keep a copy for the company.</p>
      ${fs && !fs.filed83b && !fs.missed ? html`<div class="inline">
          ${p?.files83b ? html`<button class="primary" data-83b="service">Sign & let ${p.label} file it (0.25h)</button>` : ''}
          <button data-83b="online">File Form 15620 online yourself (0.75h)</button>
          <button data-83b="mail">Certified mail (1.5h, $10)</button></div>` : ''}
      ${fs?.missed ? html`<div class="callout bad small">Missed. Every vesting tranche is now taxable ordinary income at its fair market value when it vests. After a priced round that can mean a six-figure personal tax bill on shares you can't sell. Diligence will flag it.</div>
        ${L.personalTax.length ? table({ columns: [{ label: 'Vesting date', render: (x) => fmtDate(s, x.day) }, { label: 'Shares', align: 'right', render: (x) => x.shares.toLocaleString('en-US') }, { label: 'FMV', align: 'right', render: (x) => `$${x.fmv}` }, { label: 'Taxable income', align: 'right', render: (x) => money(x.income) }], rows: L.personalTax.slice(-8) }) : ''}` : ''}
      <h3>IP & hiring paperwork</h3>
      <ul class="list">
        <li>Founder IP assignment: ${L.docs.ipAssignment ? badge('signed', 'good') : html`<button class="sm" data-doc="ipAssignment" ${s.company.incorporated ? '' : 'disabled'}>Sign technology assignment (0.5h)</button>`}</li>
        <li>CIIAA template (confidential info & invention assignment, present-tense "hereby assigns"; California §2870 carve-out): ${L.docs.ciiaa ? badge('ready', 'good') : html`<button class="sm" data-doc="ciiaa">Adapt a standard template (1h)</button>`}</li>
      </ul>
      <p class="hint">Noncompetes: the FTC ban is dead and California voids most; rely on the CIIAA and confidentiality. Purely AI-generated code may not be copyrightable (USCO 2025): trade secrets and contracts protect you more.</p>
    </section></div>`;
}

function privacyView(s, L) {
  const subs = activeSubs(s).length;
  const arr = mrr(s) * 12;
  const ccpa = arr > 26_625_000 || (s.company.model === 'b2c' && subs >= 100000);
  const b2b = s.company.model !== 'b2c';
  return html`<div class="grid-2">
    <section class="panel">
      <h2>Terms of service & privacy policy</h2>
      <p>Current: ${L.docs.tos === 'none' ? badge('none', 'bad') : badge(POLICIES[L.docs.tos].label, L.docs.tos === 'template' ? 'warn' : 'good')}</p>
      ${Object.entries(POLICIES).map(([k, p]) => html`<div class="card"><b>${p.label}</b> <span class="small">${p.monthly ? `$${p.monthly}/mo` : p.once ? money(p.once) : 'free'} · ${p.hours}h</span>${k === 'template' ? html`<div class="small muted">Copied policies rarely match what you actually do with data — a liability on its own.</div>` : ''}<div><button class="sm" data-policy="${k}" ${L.docs.tos === k ? 'disabled' : ''}>Choose</button></div></div>`)}
      <p class="small">Cookie consent banner (needed with EU/UK visitors and non-essential cookies): ${L.docs.cookieBanner ? badge('live', 'good') : html`<button class="sm" id="cookie">Add banner (0.5h)</button>`}</p>
      <h3>CCPA/CPRA</h3>
      <p class="small">Applies above $26.625M revenue, 100k+ California consumers, or ≥50% revenue from selling/sharing data. You: ${ccpa ? badge('likely applies', 'warn') : badge('below thresholds', 'good')}${b2b ? ' — but enterprise customers will push CCPA terms into contracts anyway.' : ''}</p>
    </section>
    <section class="panel">
      <h2>GDPR / UK GDPR basics</h2>
      <p class="small muted">Fines up to €20M or 4% of global turnover. UK Data (Use and Access) Act changes commenced 2026-02-05.</p>
      <ul class="list">${Object.entries(GDPR_ITEMS).map(([k, g]) => html`<li>${L.gdpr[k] ? '✅' : '⬜️'} ${g.label} ${L.gdpr[k] ? '' : html`<button class="sm" data-gdpr="${k}">Do it (${g.hours}h)</button>`}</li>`)}</ul>
      ${b2b ? html`<h3>DPA for B2B customers</h3>
        <p class="small">You process customer personal data, so you're a processor: they need a DPA (Art. 28 terms), your subprocessor list (incl. your LLM provider), a security exhibit and SCCs. Buyers above ~$5k ACV usually require it (game assumption).</p>
        ${L.dpaReady ? badge(`DPA ready (${L.dpaSource})`, 'good') : Object.entries(DPA).map(([k, d]) => html`<div><button class="sm" data-dpa="${k}">${d.label} — ${d.once ? money(d.once) : 'free'}, ${d.hours}h</button></div>`)}` : ''}
      <h3>Data-subject requests</h3>
      ${L.dsrs.length ? html`<ul class="list small">${L.dsrs.slice(0, 6).map((d) => html`<li>${d.type} request from ${d.name} · due ${fmtDate(s, d.dueDay)} ${d.status === 'open' ? html`<button class="sm" data-dsr="${d.id}">Answer (${L.gdpr.dsr ? '0.25' : '0.5'}h)</button>` : badge(d.status, d.status === 'missed' ? 'bad' : 'good')}</li>`)}</ul>` : html`<p class="muted small">None yet.</p>`}
    </section></div>`;
}

function aiView(s, L) {
  const det = detectAi(s);
  const today = isoDate(s);
  return html`<div class="grid-2">
    <section class="panel">
      <h2>Your AI features</h2>
      ${det.ai ? html`<p>Shipped AI-powered features: ${det.features.join(', ')}.</p>${det.highRisk ? html`<div class="callout warn small">At least one touches an Annex III area (hiring, credit, education…). From 2027-12-02 that's high-risk: conformity assessment, risk management, logging, human oversight.</div>` : ''}` : html`<p class="muted">No shipped AI features detected. These obligations apply once you ship a chatbot, AI-generated content, or AI decisions for EU users.</p>`}
      <ul class="list">${Object.entries(AI_ACT_ITEMS).filter(([k]) => k !== 'highRisk' || det.highRisk).map(([k, a]) => html`<li>${L.aiAct[k] ? '✅' : '⬜️'} ${a.label}${a.from ? html` <span class="small muted">· from ${a.from}${a.note ? ` (${a.note})` : ''}</span>` : ''} ${L.aiAct[k] ? '' : html`<button class="sm" data-aiact="${k}">Do it (${a.hours}h)</button>`}</li>`)}</ul>
      <p class="hint">A SaaS wrapping a model API is a provider/deployer of an AI <i>system</i>, not a general-purpose AI model provider, unless it substantially fine-tunes. Penalties up to €35M / 7% for prohibited practices.</p>
    </section>
    <section class="panel"><h2>EU AI Act timeline (as amended by the AI Omnibus, Reg. 2026/1744)</h2>
      <ul class="list small">${AI_ACT_DATES.map(([d, t]) => html`<li class="${d <= today ? '' : 'muted'}"><b>${d}</b> ${d <= today ? badge('in force', 'accent') : ''} ${t}</li>`)}</ul>
    </section></div>`;
}

function tmView(s, L) {
  const d = draft.tm;
  const fee = trademarkFee({ classes: d.classes, freeform: d.freeform, description: d.description });
  return html`<div class="grid-2">
    <section class="panel">
      <h2>Knockout search</h2>
      <p class="small">Search before you buy the domain or print anything. Generic SaaS words make weak, crowded marks.</p>
      <form id="searchForm" class="inline"><label>Mark <input id="tmMark" name="mark" value="${d.mark || s.company.name}" maxlength="60" /></label><button>Search USPTO + web (1h)</button></form>
      ${L.lastSearch ? html`<div class="card"><b>${L.lastSearch.mark}</b>: conflict risk ${badge(L.lastSearch.risk > 0.5 ? 'high' : L.lastSearch.risk > 0.25 ? 'medium' : 'low', L.lastSearch.risk > 0.5 ? 'bad' : L.lastSearch.risk > 0.25 ? 'warn' : 'good')}
        ${L.lastSearch.findings.length ? html`<ul class="small" style="padding-left:18px">${L.lastSearch.findings.map((f) => html`<li>${f}</li>`)}</ul>` : html`<p class="small">No obvious conflicts found.</p>`}</div>` : ''}
      <h2 style="margin-top:14px">File (USPTO, fees since 2025-01-18)</h2>
      <form id="tmForm">
        ${Object.entries(TRADEMARK.classes).map(([k, l]) => html`<label style="margin:3px 0"><input type="checkbox" name="cls_${k}" ${d.classes.includes(k) ? 'checked' : ''} /> ${l}</label>`)}
        <label><input type="checkbox" name="freeform" ${d.freeform ? 'checked' : ''} /> Write my own goods/services description instead of ID Manual entries (+$${TRADEMARK.freeformSurcharge}/class)</label>
        ${d.freeform ? html`<label>Description <textarea id="tmDesc" name="description" rows="3">${d.description}</textarea></label>` : ''}
        <label><input type="checkbox" name="attorney" ${d.attorney ? 'checked' : ''} /> Use a trademark attorney (+${money(TRADEMARK.attorney)}, game value in the $500–2k range)</label>
        <p>USPTO fees: <b>${money(fee)}</b> ($${TRADEMARK.perClass}/class base; +$200 per extra 1,000 characters).</p>
        <button class="primary">File application (1.5h)</button>
      </form>
    </section>
    <section class="panel"><h2>Applications</h2>
      ${L.trademarks.length ? L.trademarks.map((t) => html`<div class="card"><b>${t.mark}</b> ${badge(t.status.replace('_', ' '), t.status === 'registered' ? 'good' : ['abandoned', 'refused'].includes(t.status) ? 'bad' : t.status === 'office_action' ? 'warn' : '')}
        <div class="small muted">Classes ${t.classes.join(', ')} · filed ${fmtDate(s, t.filedDay)} · ${money(t.fee)}${t.status === 'pending' ? ` · examination ~${fmtDate(s, t.examDay)}` : ''}</div>
        ${t.status === 'office_action' ? html`<div class="small">Response due ${fmtDate(s, t.responseDue)} (${daysLeftLabel(s, t.responseDue)}). <button class="sm" data-oa="${t.id}">Respond yourself (2h)</button> <button class="sm" data-oa-atty="${t.id}">Attorney ($500, 0.5h)</button>${t.extended ? '' : html` <button class="sm" data-oa-ext="${t.id}">Extend 3 months ($${TRADEMARK.extensionFee})</button>`}</div>` : ''}</div>`) : html`<p class="muted">None. Expect ~12+ months from filing to registration.</p>`}
    </section></div>`;
}

function contractsView(s, L, openId) {
  const open = L.redlines.find((r) => r.id === openId) ?? L.redlines.find((r) => r.status === 'open');
  return html`<div class="grid-2">
    <section class="panel">
      <h2>Templates & signing</h2>
      <p class="small">Self-serve: clickwrap ToS. Sales-led: MSA + Order Form (+ DPA + SLA/security exhibit). The order form holds price, term, seats and renewal; the MSA holds the legal terms. Standard templates shorten redlines.</p>
      <p>MSA + order form: ${L.docs.msa === 'none' ? badge('none', 'warn') : badge(CONTRACTS[L.docs.msa].label, 'good')}</p>
      ${L.docs.msa === 'none' ? html`${['template', 'lawyer'].map((k) => html`<div><button class="sm" data-msa="${k}">${CONTRACTS[k].label} — ${CONTRACTS[k].once ? money(CONTRACTS[k].once) : 'free'}, ${CONTRACTS[k].hours}h</button></div>`)}` : ''}
      <p>E-signature (valid under ESIGN/UETA and eIDAS): ${L.docs.esign ? badge('active', 'good') : html`<button class="sm" id="esign">${CONTRACTS.esign.label} $${CONTRACTS.esign.monthly}/mo (0.5h)</button>`}</p>
      <h3>Redlines</h3>
      ${L.redlines.length ? html`<ul class="list small">${L.redlines.slice(0, 10).map((r) => html`<li><a href="#/legal/${r.id}">${r.customer}</a> · ${fmtDate(s, r.receivedDay)} ${badge(r.status, r.status === 'signed' ? 'good' : r.status === 'lost' ? 'bad' : 'warn')}</li>`)}</ul>` : html`<p class="muted small">${s.company.model === 'b2c' ? 'Consumers accept clickwrap; no redlines.' : 'When a larger customer pushes back on terms, their redlines land here.'}</p>`}
    </section>
    <section class="panel">${open ? redlinePanel(s, L, open) : html`<h2>Negotiation</h2><p class="muted">No open redlines.</p>`}</section></div>`;
}

function redlinePanel(s, L, r) {
  const d = (draft.redline[r.id] ??= { choices: {}, note: '' });
  if (r.status !== 'open') {
    return html`<h2>${r.customer} ${badge(r.status, r.status === 'signed' ? 'good' : 'bad')}</h2>
      ${r.feedback ? html`<p>"${r.feedback.verdict}"</p><ul class="small" style="padding-left:18px">${(r.feedback.clauseFeedback ?? []).map((c) => html`<li><b>${c.clause}:</b> ${c.feedback}</li>`)}</ul><p class="small"><b>Coaching:</b> ${r.feedback.coaching}</p><p class="small muted">Signing probability ${pct(r.dealProbability, 0)} · risk taken ${r.risk}${r.feedback.mock ? ' · offline judge' : ''}</p>` : html`<p class="muted">No response was sent.</p>`}`;
  }
  const est = scoreRedlines(r.clauses, d.choices, d.note, redlineCtx(s));
  return html`<h2>Redlines from ${r.customer}</h2>
    <p class="small">Respond by ${fmtDate(s, r.dueDay)} (${daysLeftLabel(s, r.dueDay)}). ${r.ownPaper ? 'They used their own paper because you had no MSA.' : ''}</p>
    <form id="rlForm" data-id="${r.id}">
      ${r.clauses.map((k) => html`<fieldset><legend>${CLAUSES[k].title}</legend><p class="small"><i>They want:</i> ${CLAUSES[k].ask}</p>
        ${Object.entries(CLAUSES[k].options).map(([ok, o]) => html`<label style="margin:4px 0"><input type="radio" name="${k}" value="${ok}" ${d.choices[k] === ok ? 'checked' : ''} /> ${o.label}</label>`)}</fieldset>`)}
      <label>Cover note to their counsel <textarea id="rlNote" name="note" rows="4" placeholder="Explain your positions: what's market standard and why, what you can offer instead…">${d.note}</textarea></label>
      <div class="inline"><button class="primary">Send response (1.5h)</button><span class="hint">Your risk if signed: ${est.risk >= 2 ? html`<b class="neg">high</b>` : est.risk >= 0.8 ? 'moderate' : 'low'}.</span></div>
    </form>`;
}

function calendarView(s, L) {
  const items = buildCalendar(s);
  return html`<section class="panel"><h2>Compliance calendar</h2>
    ${table({
      columns: [
        { label: 'Due', render: (i) => html`<b>${fmtDate(s, i.dueDay)}</b><div class="small muted">${daysLeftLabel(s, i.dueDay)}</div>` },
        { label: 'What', render: (i) => html`${i.title}<div class="small muted">${i.note}</div>` },
        { label: 'Typical cost', align: 'right', render: (i) => (i.amount ? money(i.amount) : '—') },
        { label: 'Status', render: (i) => badge(i.kind === 'auto' && i.status !== 'done' ? 'auto-renews' : i.kind === 'info' ? 'info' : i.status, i.status === 'overdue' ? 'bad' : i.status === 'due' ? 'warn' : i.status === 'done' ? 'good' : '') },
        { label: '', render: (i) => (i.status === 'done' || i.kind !== 'action' ? '' : i.key.startsWith('de-franchise') ? html`<button class="sm primary" data-franchise="${i.key}">File…</button>` : i.key === '83b' ? html`<a href="#/legal/founder">83(b) →</a>` : i.key.startsWith('tm-') ? html`<a href="#/legal/tm">Respond →</a>` : i.key.startsWith('ai-act') ? html`<a href="#/legal/ai">AI Act →</a>` : html`<button class="sm" data-file="${i.key}">${i.key === 'kyc' ? 'Do it' : i.key.startsWith('dsr') ? 'Answer' : 'File & pay'}</button>`) },
      ],
      rows: items, empty: 'Nothing on the calendar yet. Incorporating adds annual filings.',
    })}
    <p class="hint">Delaware C-corp: annual report + franchise tax every March 1 (late: $200 + 1.5%/month). Delaware LLC: $400 tax every June 1. 1099-NEC by January 31 for US contractors paid ≥ $2,000. Income tax returns are handled in Books / by your CPA.</p></section>`;
}

function spendView(s) {
  const sp = legalSpend(s);
  const bench = s.company.entity === 'llc' || s.company.path === 'indie' ? LEGAL_BENCHMARKS.indieLlc : LEGAL_BENCHMARKS.seedYearOne;
  const rows = Object.entries(sp.byItem).sort((a, b) => b[1] - a[1]).map(([item, amount]) => ({ item, amount }));
  return html`<div class="stats">${stat('Legal & compliance spend', money(sp.total), `typical year one for your setup: ${money(bench[0])}–${money(bench[1])}`, sp.total > bench[1] ? 'warn' : '')}</div>
    <section class="panel"><h2>By item</h2>${table({ columns: [{ label: 'Item', key: 'item' }, { label: 'Spent', align: 'right', render: (r) => money(r.amount) }], rows, empty: 'No legal spend yet.' })}
    <p class="hint">Seed-stage legal year one typically $5k–20k using standard documents; an indie LLC $500–3k (game assumption). A standard YC post-money SAFE costs $0 in legal fees if used unmodified.</p></section>`;
}

export default {
  id: 'legal',
  title: 'Legal',
  icon: '⚖️',
  group: 'Company',
  badge: (s) => {
    if (!s.apps.legal) return s.company.incorporated ? 0 : 1;
    return buildCalendar(s).filter((i) => (i.status === 'due' || i.status === 'overdue') && i.kind === 'action').length + s.apps.legal.redlines.filter((r) => r.status === 'open').length;
  },
  onDay: (state) => { legalDay(state); complianceDay(state); },
  onMonthEnd: legalMonthEnd,
  render(root, ctx) {
    const s = ctx.state;
    const L = ensureLegal(s);
    const param = ctx.params || '';
    const rlOpen = param.startsWith('rl_') ? param : null;
    const tab = rlOpen ? 'contracts' : TABS.some(([k]) => k === param) ? param : '';
    const views = { '': entityView, founder: founderView, privacy: privacyView, ai: aiView, soc2: soc2View, security: questionnairesView, tm: tmView, contracts: (st, l) => contractsView(st, l, rlOpen), calendar: calendarView, spend: spendView };
    mount(root, html`
      <div class="app-head"><div><h1>Legal</h1><p>Entity, founder paperwork, policies, privacy, AI Act, SOC 2, trademarks, contracts and your compliance calendar.</p>${DISCLAIMER}</div></div>
      <div class="tabs">${TABS.map(([k, l]) => html`<a href="#/legal${k ? '/' + k : ''}" class="${tab === k ? 'active' : ''}">${l}</a>`)}</div>
      ${views[tab](s, L)}`);

    const act = (fn, hours, label) => ctx.act(fn, { hours, label });
    // entity
    on(root, 'change', '#incForm', (e, el) => Object.assign(draft.inc, formData(el)));
    on(root, 'submit', '#incForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      if (!f.provider) { ctx.toast('Pick a formation service.', 'warn'); return; }
      act((st) => { incorporate(st, { provider: f.provider, operatingState: f.operatingState }); ctx.toast(`Filed. Effective in ~${PROVIDERS[f.provider].days} days.`, 'good'); }, PROVIDERS[f.provider].hours, 'Incorporation paperwork');
    });
    on(root, 'click', '#convert', () => modal({ title: 'Convert LLC → Delaware C-corp', body: html`<p>~${money(CONVERSION.fee)} legal fees (game value), ${CONVERSION.days} days, ${CONVERSION.hours}h of your time. You'll issue new founder stock and must file a new 83(b) within 30 days of that grant.</p>`, actions: [{ label: 'Cancel' }, { label: 'Convert', primary: true, onClick: () => act((st) => convertToCcorp(st), CONVERSION.hours, 'LLC conversion') }] }));
    on(root, 'click', '#ein', () => act((st) => getEin(st), 0.5, 'EIN application'));
    on(root, 'click', '#kyc', () => act((st) => completeKyc(st), 1, 'Bank & Stripe KYC update'));
    // founder
    on(root, 'input', '#stockForm', () => Object.assign(draft.stock, formData(root.querySelector('#stockForm'))));
    on(root, 'submit', '#stockForm', (e) => { e.preventDefault(); const f = formData(e.target); act((st) => signFounderDocs(st, { authorized: f.authorized, issued: f.issued, creditMonths: f.creditMonths ?? 0 }), 1, 'Founder stock & IP assignment'); });
    on(root, 'click', '#signFounder', () => act((st) => signFounderDocs(st), 1, 'Operating agreement & IP assignment'));
    on(root, 'click', '[data-83b]', (e, el) => { const m = el.dataset['83b']; act((st) => { file83b(st, m); ctx.toast('83(b) filed. Keep the confirmation with your company records.', 'good'); }, { service: 0.25, online: 0.75, mail: 1.5 }[m], '83(b) election'); });
    on(root, 'click', '[data-doc]', (e, el) => act((st) => setDoc(st, el.dataset.doc), el.dataset.doc === 'ciiaa' ? 1 : 0.5, 'Legal documents'));
    // privacy
    on(root, 'click', '[data-policy]', (e, el) => act((st) => setPolicies(st, el.dataset.policy), POLICIES[el.dataset.policy].hours, 'Terms & privacy policy'));
    on(root, 'click', '#cookie', () => act((st) => setCookieBanner(st), 0.5, 'Cookie consent'));
    on(root, 'click', '[data-gdpr]', (e, el) => act((st) => gdprItem(st, el.dataset.gdpr), GDPR_ITEMS[el.dataset.gdpr].hours, 'GDPR compliance'));
    on(root, 'click', '[data-dpa]', (e, el) => act((st) => setupDpa(st, el.dataset.dpa), DPA[el.dataset.dpa].hours, 'DPA'));
    on(root, 'click', '[data-dsr]', (e, el) => act((st) => answerDsr(st, el.dataset.dsr), L.gdpr.dsr ? 0.25 : 0.5, 'Data-subject request'));
    on(root, 'click', '[data-aiact]', (e, el) => act((st) => aiActItem(st, el.dataset.aiact), AI_ACT_ITEMS[el.dataset.aiact].hours, 'EU AI Act compliance'));
    // soc2 + security reviews (legal/views-compliance.js)
    bindCompliance(root, ctx);
    // trademark
    on(root, 'input', '#tmMark', (e) => { draft.tm.mark = e.target.value; });
    on(root, 'submit', '#searchForm', (e) => { e.preventDefault(); const { mark } = formData(e.target); draft.tm.mark = mark; act((st) => knockoutSearch(st, mark), 1, 'Trademark knockout search'); });
    const readTm = (form) => {
      const f = formData(form);
      draft.tm.classes = Object.keys(TRADEMARK.classes).filter((k) => f[`cls_${k}`]);
      draft.tm.freeform = Boolean(f.freeform);
      draft.tm.attorney = Boolean(f.attorney);
      if (f.description != null) draft.tm.description = f.description;
    };
    on(root, 'change', '#tmForm input[type=checkbox]', (e, el) => { readTm(el.form); ctx.render(); });
    on(root, 'input', '#tmDesc', (e) => { draft.tm.description = e.target.value; });
    on(root, 'submit', '#tmForm', (e) => {
      e.preventDefault();
      readTm(e.target);
      const mark = draft.tm.mark || s.company.name;
      act((st) => { fileTrademark(st, { mark, ...draft.tm }); ctx.toast('Filed. First USPTO examination in ~7 months.', 'good'); }, draft.tm.attorney ? 0.5 : 1.5, 'Trademark filing');
    });
    on(root, 'click', '[data-oa]', (e, el) => act((st) => respondOfficeAction(st, el.dataset.oa), 2, 'Office action response'));
    on(root, 'click', '[data-oa-atty]', (e, el) => act((st) => respondOfficeAction(st, el.dataset.oaAtty, { attorney: true }), 0.5, 'Office action response'));
    on(root, 'click', '[data-oa-ext]', (e, el) => act((st) => extendOfficeAction(st, el.dataset.oaExt), 0.1, 'Office action extension'));
    // contracts
    on(root, 'click', '[data-msa]', (e, el) => act((st) => setupContracts(st, el.dataset.msa), CONTRACTS[el.dataset.msa].hours, 'MSA & order form'));
    on(root, 'click', '#esign', () => act((st) => setupEsign(st), CONTRACTS.esign.hours, 'E-signature setup'));
    const readRl = (form) => {
      const id = form.dataset.id;
      const r = L.redlines.find((x) => x.id === id);
      const f = formData(form);
      draft.redline[id] = { choices: Object.fromEntries(r.clauses.filter((k) => f[k]).map((k) => [k, f[k]])), note: f.note ?? '' };
      return draft.redline[id];
    };
    on(root, 'change', '#rlForm input[type=radio]', (e, el) => { readRl(el.form); ctx.render(); });
    on(root, 'input', '#rlNote', (e) => { readRl(e.target.form); });
    on(root, 'submit', '#rlForm', (e) => {
      e.preventDefault();
      const d = readRl(e.target);
      const r = L.redlines.find((x) => x.id === e.target.dataset.id);
      e.target.querySelector('button.primary').textContent = 'Their counsel is reading…';
      act(async (st) => {
        const fb = await redlineFeedback(ctx, r, d.choices, d.note);
        const out = resolveRedline(st, r.id, d.choices, d.note, fb);
        ctx.toast(out.status === 'signed' ? `${r.customer} signed.` : `${r.customer} walked.`, out.status === 'signed' ? 'good' : 'bad');
      }, 1.5, 'Contract negotiation');
    });
    // calendar
    on(root, 'click', '[data-file]', (e, el) => {
      const key = el.dataset.file;
      const n = key.startsWith('1099-') ? forms1099(s, Number(key.slice(5)) - 1).length : 0;
      act((st) => payFiling(st, key), key.startsWith('1099-') ? Math.max(0.5, n * ONE_099.hoursPerForm) : key === 'kyc' ? 1 : 0.5, 'Compliance filing');
    });
    on(root, 'click', '[data-franchise]', (e, el) => {
      const key = el.dataset.franchise;
      const fs = L.founderStock ?? { authorized: FOUNDER_STOCK.authorized };
      const year = yearOf(s, buildCalendar(s).find((i) => i.key === key)?.dueDay ?? s.day) - 1;
      modal({
        title: `Delaware annual report & franchise tax (${year})`,
        body: html`<p>Delaware's notice shows <b>${money(franchiseAuthorizedShares(fs.authorized))}</b> under the Authorized Shares Method (${fs.authorized.toLocaleString('en-US')} authorized shares).</p>
          <p class="small">You can instead file with the <b>Assumed Par Value Capital Method</b>: report total gross assets (as on your Dec 31 balance sheet / Form 1120 Schedule L) and issued shares; Delaware charges $400 per $1M of assumed par value capital, minimum $400. You pay the lower amount. Plus the $${DELAWARE.annualReportFee} annual report fee.</p>
          <label>Total gross assets at Dec 31, ${year} ($) <input type="number" name="grossAssets" min="0" step="1" /></label>
          <label>Issued shares <input type="number" name="issuedShares" min="0" step="1" /></label>`,
        actions: [
          { label: 'Cancel' },
          { label: `Just pay the bill (${money(franchiseAuthorizedShares(fs.authorized))})`, danger: true, onClick: () => act((st) => payFranchiseTax(st, key, { method: 'billed' }), 0.5, 'Delaware franchise tax') },
          { label: 'File with APVC method (0.75h)', primary: true, onClick: async (d, form) => {
            const ga = Number(form.grossAssets.value), is = Number(form.issuedShares.value);
            const r = await act((st) => payFranchiseTax(st, key, { method: 'apvc', grossAssets: ga, issuedShares: is }), 0.75, 'Delaware franchise tax');
            if (r) ctx.toast(`Paid ${money(r.amount)} (APVC method) instead of ${money(franchiseAuthorizedShares(fs.authorized))}.`, 'good');
            return r ? undefined : false;
          } },
        ],
      });
    });
  },
};

