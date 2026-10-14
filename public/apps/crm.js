// CRM (HubSpot/Attio-style): companies, contacts, a deal pipeline with buyer-action stages, inbound triage,
// tasks, CSV import with column mapping and validation, email verification, and website research.
import { html, mount, on, formData, modal, readFile, table, stat, badge, toast, download } from '../core/ui.js';
import { money, pct, fmtDate, isoDate, parseCsv, toCsv } from '../core/util.js';
import { post } from '../core/bank.js';
import { SALES, HOURS } from './sales/params.js';
import { FIELDS, guessMapping, validateRows } from './sales/csv.js';
import { STAGES, stageLabel, manualMoves, isOpen, weightedPipeline, winRate } from './sales/deals.js';
import { specificity } from './sales/copy.js';
import {
  ensureCrm, ensureCalls, addContact, contactName, companyById, contactById, verifyContacts, ensureDeal, moveDeal, loseDeal,
  addActivity, addTask, setNextStep, startProposal, hasSoc2, hasDpa, createMeeting, nextSlot, openMeetingFor, slotText, openDealFor,
} from './sales/model.js';
import { dealsDay } from './sales/engine.js';
import { researchCompany, draftPersonalization } from './sales/jobs.js';
import { newThread, addMessage } from '../core/mail.js';

let csvDraft = null; // { name, headers, rows, mapping, skipRole }
let contactFilter = 'all';
let selected = new Set();

const STATUS_TONE = { new: '', enrolled: 'accent', contacted: 'accent', replied: 'warn', interested: 'good', meeting: 'good', customer: 'good', unsubscribed: 'bad', bounced: 'bad', no_reply: '', disqualified: 'bad', inbound: 'good' };
const VERIFY_TONE = { valid: 'good', catch_all: 'warn', unknown: 'warn', invalid: 'bad' };
const dayFromIso = (state, iso) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${state.startDate}T12:00:00Z`)) / 86400000);

function verifyBadge(c) {
  return c.verification ? badge(c.verification.replace('_', '-'), VERIFY_TONE[c.verification]) : badge('unverified');
}
function flags(c) {
  return html`${c.role ? badge('role address', 'warn') : ''}${c.free ? badge('personal mailbox', 'warn') : ''}`;
}

function addProspectModal(ctx, preset = {}) {
  modal({
    title: 'Add a prospect',
    body: html`<p class="small muted">Find real people at real companies that match your ICP (their website, LinkedIn, a directory, a community). Takes ~6 minutes each.</p>
      <div class="grid-2">
        <label>First name <input name="firstName" required /></label>
        <label>Last name <input name="lastName" /></label>
        <label>Email <input name="email" type="email" required placeholder="jane@theirco.com" /></label>
        <label>Job title <input name="title" placeholder="Owner, Head of Ops…" /></label>
        <label>Company <input name="company" value="${preset.company ?? ''}" /></label>
        <label>Website <input name="domain" value="${preset.domain ?? ''}" placeholder="theirco.com" /></label>
      </div>
      <label>LinkedIn URL <input name="linkedin" placeholder="https://www.linkedin.com/in/…" /></label>
      <label>Notes / trigger (why now?) <input name="notes" placeholder="Hiring a bookkeeper; posted about X…" /></label>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Add prospect', primary: true,
      onClick: async (d, form) => {
        const f = formData(form);
        const r = await ctx.act((st) => addContact(st, f, { source: 'manual' }), { hours: HOURS.addProspect, label: 'Prospecting' });
        if (r?.issues?.length) toast(r.issues.map((i) => i.text).join(' · '), 'warn');
        return r ? undefined : false;
      },
    }],
  });
}

// ---------------------------------------------------------------------------

function pipelineView(s, crm) {
  const cols = STAGES.map((st) => {
    let deals = crm.deals.filter((d) => d.stage === st.id);
    if (st.id === 'won' || st.id === 'lost') deals = deals.sort((a, b) => b.stageDay - a.stageDay);
    return { st, deals, total: deals.reduce((a, d) => a + (d.amount ?? 0), 0) };
  });
  return html`<section class="panel" style="padding:10px">
    <p class="small muted" style="margin:0 0 8px">Stages are buyer actions. Meetings move deals via Calls; only the buyer can close-win. Every open deal needs a dated next step.</p>
    <div class="kanban">${cols.map(({ st, deals, total }) => html`<div class="col">
      <h4><span>${st.label} · ${deals.length}</span><span>${money(total)}</span></h4>
      ${deals.slice(0, 25).map((d) => dealCard(s, d))}
      ${deals.length > 25 ? html`<p class="small muted">+${deals.length - 25} more</p>` : ''}
    </div>`)}</div></section>`;
}

function dealCard(s, d) {
  const co = companyById(s, d.companyId);
  const ct = contactById(s, d.contactId);
  const stalled = isOpen(d) && !['lead', 'contacted'].includes(d.stage) && (!d.nextStep || d.nextStep.dueDay < s.day);
  return html`<div class="card">
    <a href="#/crm/company:${d.companyId}"><b>${co?.name ?? 'Unknown'}</b></a>
    <div class="small muted">${ct ? contactName(ct) : ''}${ct?.title ? ` · ${ct.title}` : ''}</div>
    <div class="small">${money(d.amount)} ACV ${d.source !== 'outbound' ? badge(d.source) : ''} ${stalled ? badge('no next step', 'warn') : ''}${d.stage === 'lost' && d.lostReason ? html`<div class="muted">${d.lostReason}</div>` : ''}</div>
    ${manualMoves(d).length ? html`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${manualMoves(d).map((m) => html`<button class="sm ${m === 'lost' ? 'danger' : ''}" data-move="${d.id}" data-to="${m}">${m === 'lost' ? 'Lost' : `→ ${stageLabel(m)}`}</button>`)}</div>` : ''}
  </div>`;
}

function companiesView(s, crm) {
  const rows = [...crm.companies].sort((a, b) => b.createdDay - a.createdDay);
  return html`<section class="panel">${table({
    rows, empty: 'No companies yet. Add a prospect or import a CSV.',
    rowAttrs: (c) => `class="clickable" data-company="${c.id}"`,
    columns: [
      { label: 'Company', render: (c) => html`<b>${c.name}</b><div class="small muted">${c.domain}</div>` },
      { label: 'Industry', render: (c) => c.industry || '—' },
      { label: 'Size', render: (c) => c.size || '—' },
      { label: 'Contacts', align: 'right', render: (c) => crm.contacts.filter((x) => x.companyId === c.id).length },
      { label: 'Research', render: (c) => (c.research ? badge(`fit ${Math.round(c.research.fit * 100)}%`, c.research.fit >= 0.6 ? 'good' : c.research.fit >= 0.35 ? 'warn' : 'bad') : c.site ? badge('site fetched') : badge('not researched')) },
      { label: 'Deal', render: (c) => { const d = crm.deals.filter((x) => x.companyId === c.id).at(-1); return d ? badge(stageLabel(d.stage), d.stage === 'won' ? 'good' : d.stage === 'lost' ? 'bad' : 'accent') : '—'; } },
    ],
  })}</section>`;
}

function contactsView(s, crm) {
  const filters = ['all', 'new', 'unverified', 'contacted', 'interested', 'replied', 'meeting', 'customer', 'bounced', 'unsubscribed'];
  const rows = crm.contacts.filter((c) => contactFilter === 'all' || (contactFilter === 'unverified' ? !c.verification : c.status === contactFilter));
  const unverified = crm.contacts.filter((c) => !c.verification);
  return html`<section class="panel">
    <div class="inline" style="justify-content:space-between">
      <label style="max-width:220px">Filter <select id="ctFilter">${filters.map((f) => html`<option value="${f}" ${f === contactFilter ? 'selected' : ''}>${f}</option>`)}</select></label>
      <div class="app-actions">
        <button id="verifySel" ${selected.size ? '' : 'disabled'}>Verify selected (${selected.size})</button>
        <button id="verifyAll" ${unverified.length ? '' : 'disabled'}>Verify all unverified (${unverified.length}) · ${money(unverified.length * SALES.verify.costPerEmail, { cents: true })}</button>
        <button id="exportCsv">Export CSV</button>
      </div>
    </div>
    <p class="hint">Verification is how you keep bounces under 2%: verified "valid" addresses bounce ~1.2%, an unverified list ~2.1%, "bad" ones ~10.6% (Saleshandy 2026). Catch-all domains accept everything, so they stay risky.</p>
    ${table({
      rows, empty: 'No contacts match.',
      columns: [
        { label: html`<input type="checkbox" id="selAll" />`, render: (c) => html`<input type="checkbox" data-sel="${c.id}" ${selected.has(c.id) ? 'checked' : ''} />` },
        { label: 'Name', render: (c) => html`<a href="#/crm/company:${c.companyId}">${contactName(c)}</a><div class="small muted">${c.title}</div>` },
        { label: 'Company', render: (c) => companyById(s, c.companyId)?.name ?? '' },
        { label: 'Email', render: (c) => html`<span class="small">${c.email}</span><div>${verifyBadge(c)} ${flags(c)}</div>` },
        { label: 'Status', render: (c) => badge(c.status.replace('_', ' '), STATUS_TONE[c.status]) },
        { label: 'First line', render: (c) => (c.personalization ? badge(`${c.personalizationSource === 'ai' ? 'AI · ' : ''}specificity ${Math.round(specificity(c.personalization, companyById(s, c.companyId) ?? {}) * 100)}`, 'accent') : html`<span class="muted small">none</span>`) },
        { label: 'Source', render: (c) => html`<span class="small">${c.source}</span>` },
      ],
    })}
  </section>`;
}

function importView(s, crm) {
  if (!csvDraft) {
    return html`<section class="panel"><h2>Import prospects from CSV</h2>
      <p class="muted">Export from Apollo, Clay, Sales Navigator (via a tool), a spreadsheet you built by hand, or a directory. You'll map columns, then we validate syntax, duplicates and role addresses before anything is imported.</p>
      <label>CSV file <input type="file" id="csvFile" accept=".csv,text/csv" /></label>
      <details><summary class="small">…or paste CSV</summary><textarea id="csvPaste" placeholder="first_name,last_name,email,title,company,website,linkedin"></textarea><button id="csvPasteBtn">Use pasted CSV</button></details>
      <p class="hint">Scraping LinkedIn with browser bots risks account restrictions (LinkedIn acted against Apollo/Seamless pages in March 2025).</p></section>`;
  }
  const results = validateRows(csvDraft.rows, csvDraft.mapping, crm.contacts.map((c) => c.email));
  const ok = results.filter((r) => r.status !== 'skip' && !(csvDraft.skipRole && r.issues.some((i) => i.text.startsWith('Role address'))));
  const count = (t) => results.filter((r) => r.issues.some((i) => i.text.startsWith(t))).length;
  const hours = Math.min(2, HOURS.importBase + ok.length * HOURS.importPerRow);
  return html`<section class="panel"><h2>Map columns: ${csvDraft.name}</h2>
    <div class="grid-4">${FIELDS.map((f) => html`<label>${f.label}<select data-map="${f.key}"><option value="">—</option>${csvDraft.headers.map((h) => html`<option value="${h}" ${csvDraft.mapping[f.key] === h ? 'selected' : ''}>${h}</option>`)}</select></label>`)}</div>
    <div class="stats" style="margin-top:12px">
      ${stat('Rows', results.length)}
      ${stat('Will import', ok.length, '', 'good')}
      ${stat('Invalid / missing email', count('Invalid') + count('No email'), '', count('Invalid') + count('No email') ? 'bad' : '')}
      ${stat('Duplicates', count('Already') + count('Duplicate'), 'in CRM or file', count('Already') + count('Duplicate') ? 'warn' : '')}
      ${stat('Role addresses', count('Role'), 'info@, sales@…', count('Role') ? 'warn' : '')}
    </div>
    <label><input type="checkbox" id="skipRole" ${csvDraft.skipRole ? 'checked' : ''} /> Skip role addresses (recommended: they rarely reach a decision-maker and draw more complaints)</label>
    ${table({
      rows: results.slice(0, 40),
      columns: [
        { label: '', render: (r) => badge(r.status === 'skip' ? 'skip' : r.status, r.status === 'skip' ? 'bad' : r.status === 'warn' ? 'warn' : 'good') },
        { label: 'Name', render: (r) => `${r.prospect.firstName} ${r.prospect.lastName}` },
        { label: 'Email', render: (r) => r.prospect.email },
        { label: 'Company', render: (r) => html`${r.prospect.company}<div class="small muted">${r.prospect.domain}</div>` },
        { label: 'Title', render: (r) => r.prospect.title },
        { label: 'Issues', render: (r) => html`<span class="small">${r.issues.map((i) => i.text).join(' · ')}</span>` },
      ],
    })}
    ${results.length > 40 ? html`<p class="small muted">Showing 40 of ${results.length} rows.</p>` : ''}
    <div class="inline" style="margin-top:10px"><button class="primary" id="doImport" ${ok.length ? '' : 'disabled'}>Import ${ok.length} prospects (${hours.toFixed(1)}h review)</button><button id="cancelImport">Cancel</button></div>
  </section>`;
}

function inboundView(s, crm) {
  const q = crm.inboundQueue.filter((x) => x.status === 'new');
  const done = crm.inboundQueue.filter((x) => x.status !== 'new').slice(-10).reverse();
  return html`<section class="panel"><h2>Inbound triage</h2>
    <p class="muted small">Demo requests and contact forms from your website and marketing. Qualify fast: speed-to-lead matters more for inbound than anything else.</p>
    ${q.length ? html`<ul class="list">${q.map((x) => { const c = contactById(s, x.contactId); const co = companyById(s, x.companyId); return html`<li>
      <b>${contactName(c)}</b> ${c?.title ? html`<span class="muted">· ${c.title}</span>` : ''} · ${co?.name ?? ''} ${co?.domain ? html`<span class="muted small">(${co.domain})</span>` : ''}
      <div class="small">${badge(x.source)} ${fmtDate(s, x.day)} ${x.note ? html`· "${x.note}"` : ''}</div>
      <div class="inline" style="margin-top:6px"><button class="sm primary" data-accept="${x.id}">Accept → deal + reply in Mail (6 min)</button><button class="sm" data-dismiss="${x.id}">Disqualify</button></div></li>`; })}</ul>` : html`<p class="empty">No new inbound leads.</p>`}
    ${done.length ? html`<h3>Recently triaged</h3><ul class="list small">${done.map((x) => html`<li>${contactName(contactById(s, x.contactId))} · ${x.status}</li>`)}</ul>` : ''}
  </section>`;
}

function tasksView(s, crm) {
  const open = crm.tasks.filter((t) => !t.done).sort((a, b) => a.dueDay - b.dueDay);
  const stalled = crm.deals.filter((d) => isOpen(d) && !['lead', 'contacted'].includes(d.stage) && (!d.nextStep || d.nextStep.dueDay < s.day));
  return html`<div class="grid-2">
    <section class="panel"><h2>Tasks</h2>
      ${open.length ? html`<ul class="list">${open.map((t) => html`<li><label style="margin:0;display:flex;gap:8px;align-items:flex-start"><input type="checkbox" data-done="${t.id}" /><span>${t.title}<div class="small ${t.dueDay < s.day ? 'neg' : 'muted'}">Due ${fmtDate(s, t.dueDay)}${t.companyId ? html` · <a href="#/crm/company:${t.companyId}">${companyById(s, t.companyId)?.name ?? ''}</a>` : ''}</div></span></label></li>`)}</ul>` : html`<p class="empty">No open tasks.</p>`}
    </section>
    <section class="panel"><h2>Deals without a dated next step</h2>
      <p class="small muted">A founder's pipeline hygiene rule: every open deal past "Contacted" has a next step with a date. Deals without one are stalled.</p>
      ${stalled.length ? html`<ul class="list">${stalled.map((d) => html`<li><a href="#/crm/company:${d.companyId}">${companyById(s, d.companyId)?.name}</a> · ${stageLabel(d.stage)} · ${money(d.amount)}</li>`)}</ul>` : html`<p class="empty">All open deals have next steps.</p>`}
    </section></div>`;
}

// ---------------------------------------------------------------------------

function companyView(s, crm, id) {
  const co = companyById(s, id);
  if (!co) return html`<p class="empty">Company not found. <a href="#/crm/companies">Back</a></p>`;
  const contacts = crm.contacts.filter((c) => c.companyId === co.id);
  const deal = openDealFor(s, co.id) ?? crm.deals.filter((d) => d.companyId === co.id).at(-1);
  const acts = crm.activities.filter((a) => a.companyId === co.id).slice(-40).reverse();
  const r = co.research;
  const tasks = crm.tasks.filter((t) => t.companyId === co.id && !t.done);
  const meetings = ensureCalls(s).meetings.filter((m) => m.companyId === co.id);
  return html`
    <p><a href="#/crm/companies">← Companies</a></p>
    <div class="app-head"><div><h1>${co.name}</h1><p>${co.domain ? html`<a href="https://${co.domain}" target="_blank" rel="noopener noreferrer">${co.domain}</a>` : 'No website'} · ${co.industry || 'industry ?'} · ${co.size || 'size ?'}</p></div>
      <div class="app-actions"><button id="research" class="primary" ${co.domain ? '' : 'disabled'}>${co.site ? 'Re-research' : 'Research company'} (15 min)</button><button id="addContactHere">+ Contact</button></div></div>
    <div class="grid-2">
      <section class="panel"><h2>Research</h2>
        ${co.site ? html`<p><b>${co.site.title}</b></p><p class="small muted">${co.site.description}</p>
          <ul class="list small">${(co.site.headings ?? []).slice(0, 6).map((h) => html`<li>${h}</li>`)}</ul>` : html`<p class="muted">Not fetched yet. Research reads their real website and drafts pain hypotheses and a hook.</p>`}
        ${r ? html`<h3>Hypotheses ${r.mock ? badge('offline heuristic') : badge('AI', 'accent')}</h3>
          <p>${r.summary}</p>
          <ul>${(r.pains ?? []).map((p) => html`<li>${p}</li>`)}</ul>
          <p><b>Hook:</b> ${r.hook || '—'}</p>
          <p class="small">ICP fit ${badge(`${Math.round(r.fit * 100)}%`, r.fit >= 0.6 ? 'good' : r.fit >= 0.35 ? 'warn' : 'bad')} ${r.fitReason}</p>
          <p class="hint">Hypotheses are guesses to test on a call, not facts.</p>` : ''}
        <form id="coForm"><div class="grid-2"><label>Industry <input name="industry" value="${co.industry}" /></label><label>Size <input name="size" value="${co.size}" /></label></div>
          <label>Notes <textarea name="notes" rows="2">${co.notes}</textarea></label><button class="sm">Save details</button></form>
      </section>
      <section class="panel"><h2>Deal</h2>${deal ? dealPanel(s, deal) : html`<p class="muted">No deal yet.</p><button id="newDeal">Create deal at Lead</button>`}
        ${meetings.length ? html`<h3>Calls</h3><ul class="list small">${meetings.map((m) => html`<li><a href="#/calls/${m.id}">${m.kind} · ${fmtDate(s, m.day)}</a> ${badge(m.status.replace('_', ' '), m.status === 'held' ? 'good' : ['no_show', 'missed'].includes(m.status) ? 'bad' : 'accent')}</li>`)}</ul>` : ''}
      </section>
    </div>
    <section class="panel"><h2>Contacts</h2>
      ${contacts.map((c) => html`<div class="card">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${contactName(c)}</b> <span class="muted">${c.title}</span>
          <div class="small">${c.email} ${verifyBadge(c)} ${flags(c)} ${badge(c.status.replace('_', ' '), STATUS_TONE[c.status])} ${c.linkedin ? html`<a href="${c.linkedin}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ''} ${c.threadId ? html`<a href="#/mail/inbox:${c.threadId}">Mail thread</a>` : ''}</div></div>
          ${c.verification ? '' : html`<button class="sm" data-verify="${c.id}">Verify (${money(SALES.verify.costPerEmail, { cents: true })})</button>`}</div>
        <label class="small">Personalization line ({{personalization}}) ${c.personalization ? html`· specificity ${Math.round(specificity(c.personalization, co) * 100)}/100` : ''}
          <textarea rows="2" id="pz_${c.id}" data-pz="${c.id}" placeholder="One specific, verifiable thing about them, e.g. something from their site, a job post, a recent launch.">${c.personalization}</textarea></label>
        <div class="inline"><button class="sm primary" data-savepz="${c.id}">Save line (7 min)</button><button class="sm" data-aipz="${c.id}" ${co.site || co.research ? '' : 'disabled'}>Draft with AI (3 min to review)</button>
          ${c.personalizationSource === 'ai' ? html`<span class="hint">AI-drafted: check every fact against their site; AI SDR emails carry factual errors 12–18% of the time.</span>` : ''}</div>
      </div>`)}
    </section>
    <div class="grid-2">
      <section class="panel"><h2>Activity</h2>
        <form id="noteForm" class="inline"><label>Note <input name="text" placeholder="Call notes, context…" /></label><button class="sm">Add (3 min)</button></form>
        <ul class="list small">${acts.map((a) => html`<li><span class="muted">${fmtDate(s, a.day)}</span> ${a.text}</li>`)}</ul></section>
      <section class="panel"><h2>Tasks</h2>
        <form id="taskForm" class="inline"><label>Task <input name="title" required placeholder="Send case study" /></label><label style="max-width:170px">Due <input type="date" name="due" value="${isoDate(s, s.day + 2)}" /></label><button class="sm">Add</button></form>
        <ul class="list small">${tasks.map((t) => html`<li><label style="margin:0"><input type="checkbox" data-done="${t.id}" /> ${t.title} <span class="${t.dueDay < s.day ? 'neg' : 'muted'}">· ${fmtDate(s, t.dueDay)}</span></label></li>`)}</ul></section>
    </div>`;
}

function dealPanel(s, deal) {
  const ent = s.company.model === 'ent';
  const plans = s.plans.filter((p) => p.active);
  const open = isOpen(deal);
  const ct = contactById(s, deal.contactId);
  const sec = deal.security, dpa = deal.dpa;
  return html`
    <p><b>${deal.name}</b></p>
    <p>${badge(stageLabel(deal.stage), deal.stage === 'won' ? 'good' : deal.stage === 'lost' ? 'bad' : 'accent')} ${money(deal.amount)} ACV · source ${deal.source}
      ${deal.expectedCloseDay ? html` · expected close ${fmtDate(s, deal.expectedCloseDay)}` : ''}${deal.lostReason ? html`<br /><span class="neg">${deal.lostReason}</span>` : ''}</p>
    <p class="small muted">${deal.history.map((h) => `${stageLabel(h.stage)} (${fmtDate(s, h.day).replace(/, \d{4}$/, '')})`).join(' → ')}</p>
    ${deal.nextStep ? html`<p class="small"><b>Next step:</b> ${deal.nextStep.text} · ${fmtDate(s, deal.nextStep.dueDay)}</p>` : open ? html`<p class="small warn">No dated next step.</p>` : ''}
    ${open ? html`<form id="nextForm" class="inline"><label>Next step <input name="text" required placeholder="Send pilot proposal" /></label><label style="max-width:170px">By <input type="date" name="due" value="${isoDate(s, s.day + 3)}" /></label><button class="sm">Set</button></form>
      <div class="inline" style="margin-top:6px">${manualMoves(deal).map((m) => html`<button class="sm ${m === 'lost' ? 'danger' : ''}" data-move="${deal.id}" data-to="${m}">${m === 'lost' ? 'Mark lost' : `→ ${stageLabel(m)}`}</button>`)}
        ${['meeting_held', 'qualified', 'proposal'].includes(deal.stage) && ct && !openMeetingFor(s, ct.id) ? html`<button class="sm" data-followup="${deal.id}">Book follow-up call</button>` : ''}</div>` : ''}
    ${deal.stage === 'qualified' ? html`<fieldset><legend>Send proposal / start paid pilot</legend>
      <form id="proposalForm"><div class="grid-2">
        <label>Plan <select name="planId">${plans.map((p) => html`<option value="${p.id}" ${p.id === deal.planId ? 'selected' : ''}>${p.name} · $${p.price}/${p.interval}</option>`)}</select></label>
        <label>${ent ? 'Seats / units' : 'Seats'} <input type="number" name="quantity" min="1" value="${deal.quantity ?? 1}" /></label>
        <label>Discount % <input type="number" name="discount" min="0" max="50" value="${Math.round((deal.discountPct ?? 0) * 100)}" /></label>
        ${ent ? html`<p class="small muted">Enterprise: annual contract, invoiced (ACH/wire).</p>` : html`<label><input type="checkbox" name="annual" ${deal.annual ? 'checked' : ''} /> Bill annually (−17%)</label>`}
      </div>
      <p class="hint">Win rate at this ACV ≈ ${pct(winRate(deal.amount), 0)} of qualified opportunities (Landbase/Gong 2025–26). Writing it takes ${ent ? HOURS.proposalEnt : HOURS.proposalSmb}h.</p>
      <button class="primary sm">Send proposal</button></form></fieldset>` : ''}
    ${sec && sec.status !== 'passed' && open ? html`<div class="callout ${hasSoc2(s) ? '' : 'warn'}"><b>Security review requested.</b> ${hasSoc2(s) ? 'You have a SOC 2 report; it will be shared.' : html`No SOC 2 report: about half of buyers stop here. ${sec.status === 'questionnaire' ? 'Questionnaire submitted; waiting on their review.' : html`<button class="sm" data-questionnaire="${deal.id}">Fill their security questionnaire (${HOURS.securityQuestionnaire}h)</button>`} <a href="#/legal">Legal →</a>`}</div>` : ''}
    ${dpa && dpa.status === 'requested' && open ? html`<div class="callout ${hasDpa(s) ? '' : 'warn'}"><b>Their legal team wants a DPA.</b> ${hasDpa(s) ? 'Your standard DPA will go out automatically.' : html`You don't have one. The deal stalls until you do. <a href="#/legal">Set one up in Legal →</a>`}</div>` : ''}
    ${deal.stage === 'won' ? html`<div class="callout good">Customer created in Payments. <a href="#/stripe">Open Stripe →</a></div>` : ''}`;
}

// ---------------------------------------------------------------------------

export default {
  id: 'crm',
  title: 'CRM',
  icon: '🗂️',
  group: 'Sales',
  models: ['smb', 'ent'],
  badge: (s) => {
    const crm = s.apps.crm;
    if (!crm) return 0;
    return crm.inboundQueue.filter((x) => x.status === 'new').length + crm.tasks.filter((t) => !t.done && t.dueDay <= s.day).length;
  },
  onDay(state) { dealsDay(state); },
  render(root, ctx) {
    const s = ctx.state;
    const crm = ensureCrm(s);
    const [tab0, id] = ctx.params.split(':');
    const tab = tab0 || 'pipeline';
    const open = crm.deals.filter(isOpen);
    const won = crm.deals.filter((d) => d.stage === 'won');
    const lost = crm.deals.filter((d) => d.stage === 'lost' && d.history.some((h) => h.stage === 'qualified' || h.stage === 'proposal'));
    const inboundN = crm.inboundQueue.filter((x) => x.status === 'new').length;
    const tabs = [['pipeline', 'Pipeline'], ['companies', `Companies (${crm.companies.length})`], ['contacts', `Contacts (${crm.contacts.length})`], ['import', 'Import CSV'], ['inbound', `Inbound${inboundN ? ` (${inboundN})` : ''}`], ['tasks', 'Tasks']];
    const body = tab === 'company' ? companyView(s, crm, id)
      : tab === 'companies' ? companiesView(s, crm) : tab === 'contacts' ? contactsView(s, crm) : tab === 'import' ? importView(s, crm)
        : tab === 'inbound' ? inboundView(s, crm) : tab === 'tasks' ? tasksView(s, crm) : pipelineView(s, crm);
    mount(root, html`
      <div class="app-head"><div><h1>CRM</h1><p>Your real prospects: companies, people, and deals that move only when buyers act. Research their real website before you write to them.</p></div>
        <div class="app-actions"><button class="primary" id="addProspect">+ Add prospect</button></div></div>
      <div class="stats">
        ${stat('Open deals', open.length, `${money(open.reduce((a, d) => a + (d.amount ?? 0), 0))} total ACV`)}
        ${stat('Weighted pipeline', money(weightedPipeline(crm.deals)), 'stage-probability weighted')}
        ${stat('Closed won', won.length, money(won.reduce((a, d) => a + (d.amount ?? 0), 0)) + ' ACV', won.length ? 'good' : '')}
        ${stat('Win rate', won.length + lost.length ? pct(won.length / (won.length + lost.length), 0) : '—', 'of qualified opportunities')}
        ${stat('Prospects', crm.contacts.length, `${crm.contacts.filter((c) => c.verification).length} verified`)}
      </div>
      ${tab === 'company' ? '' : html`<div class="tabs">${tabs.map(([k, l]) => html`<a href="#/crm/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>`}
      ${body}`);

    on(root, 'click', '#addProspect', () => addProspectModal(ctx));
    on(root, 'click', '#addContactHere', () => { const co = companyById(s, id); addProspectModal(ctx, { company: co?.name, domain: co?.domain }); });
    on(root, 'click', '[data-company]', (e, el) => ctx.navigate('crm', `company:${el.dataset.company}`));
    on(root, 'click', '[data-move]', (e, el) => ctx.act((st) => {
      const d = st.apps.crm.deals.find((x) => x.id === el.dataset.move);
      if (el.dataset.to === 'lost') loseDeal(st, d, 'Marked lost by you');
      else { if (d.stage === 'lost') d.lostReason = null; moveDeal(st, d, el.dataset.to, 'moved manually'); }
    }, { hours: HOURS.stage, label: 'CRM hygiene' }));

    // contacts
    on(root, 'change', '#ctFilter', (e) => { contactFilter = e.target.value; ctx.render(); });
    on(root, 'change', '[data-sel]', (e, el) => { if (el.checked) selected.add(el.dataset.sel); else selected.delete(el.dataset.sel); ctx.render(); });
    on(root, 'change', '#selAll', (e) => { const ids = [...root.querySelectorAll('[data-sel]')].map((x) => x.dataset.sel); selected = e.target.checked ? new Set(ids) : new Set(); ctx.render(); });
    const runVerify = (list) => ctx.act((st) => {
      const todo = list.filter((c) => !c.verification);
      if (!todo.length) return;
      post(st, { amount: -Math.max(0.5, todo.length * SALES.verify.costPerEmail), counterparty: 'Email verifier', description: `Verified ${todo.length} addresses`, category: 'software', method: 'card' });
      verifyContacts(st, todo);
      const counts = {};
      for (const c of todo) counts[c.verification] = (counts[c.verification] ?? 0) + 1;
      toast(`Verified ${todo.length}: ${Object.entries(counts).map(([k, v]) => `${v} ${k.replace('_', '-')}`).join(', ')}`, 'good');
      selected.clear();
    }, { hours: HOURS.verify, label: 'List hygiene' });
    on(root, 'click', '#verifySel', () => runVerify(crm.contacts.filter((c) => selected.has(c.id))));
    on(root, 'click', '#verifyAll', () => runVerify(crm.contacts));
    on(root, 'click', '[data-verify]', (e, el) => runVerify([contactById(s, el.dataset.verify)]));
    on(root, 'click', '#exportCsv', () => download('prospects.csv', toCsv(crm.contacts.map((c) => ({ first_name: c.firstName, last_name: c.lastName, email: c.email, title: c.title, company: companyById(s, c.companyId)?.name ?? '', website: companyById(s, c.companyId)?.domain ?? '', linkedin: c.linkedin, status: c.status, verification: c.verification ?? '' })))));

    // import
    const loadCsv = (name, text) => {
      const rows = parseCsv(text);
      if (!rows.length) return toast('No rows found. The first line must be a header.', 'warn');
      const headers = Object.keys(rows[0]);
      csvDraft = { name, headers, rows: rows.slice(0, 2000), mapping: guessMapping(headers), skipRole: true };
      ctx.render();
    };
    on(root, 'change', '#csvFile', async (e) => { const f = e.target.files[0]; if (f) { const r = await readFile(f); loadCsv(f.name, r.text ?? ''); } });
    on(root, 'click', '#csvPasteBtn', () => loadCsv('pasted.csv', root.querySelector('#csvPaste').value));
    on(root, 'change', '[data-map]', (e, el) => { csvDraft.mapping[el.dataset.map] = el.value; ctx.render(); });
    on(root, 'change', '#skipRole', (e) => { csvDraft.skipRole = e.target.checked; ctx.render(); });
    on(root, 'click', '#cancelImport', () => { csvDraft = null; ctx.render(); });
    on(root, 'click', '#doImport', () => {
      const results = validateRows(csvDraft.rows, csvDraft.mapping, crm.contacts.map((c) => c.email))
        .filter((r) => r.status !== 'skip' && !(csvDraft.skipRole && r.issues.some((i) => i.text.startsWith('Role address'))));
      const hours = Math.min(2, HOURS.importBase + results.length * HOURS.importPerRow);
      ctx.act((st) => {
        let n = 0;
        for (const r of results) { try { addContact(st, r.prospect, { source: 'csv' }); n++; } catch { /* duplicate inside the batch */ } }
        csvDraft = null;
        toast(`Imported ${n} prospects. Verify them before sending.`, 'good');
        ctx.navigate('crm', 'contacts');
      }, { hours, label: 'List import' });
    });

    // inbound
    on(root, 'click', '[data-accept]', (e, el) => ctx.act((st) => {
      const q = ensureCrm(st).inboundQueue.find((x) => x.id === el.dataset.accept);
      const c = contactById(st, q.contactId);
      q.status = 'accepted';
      c.status = 'interested';
      c.replyKind = 'inbound';
      c.lastThemDay = q.day;
      ensureDeal(st, { companyId: c.companyId, contactId: c.id, source: q.source === 'inbound' ? 'inbound' : q.source, stage: 'replied' });
      const th = newThread(st, { subject: `Demo request: ${companyById(st, c.companyId)?.name ?? contactName(c)}`, with: { name: contactName(c), email: c.email }, kind: 'prospect', app: 'crm', refId: c.id });
      const m = addMessage(st, th.id, { from: 'them', body: q.note || `Hi, I filled in the form on your site. Can you tell me more about how ${st.company.name} works?` });
      m.day = q.day;
      c.threadId = th.id;
      ctx.navigate('mail', `prospect:${th.id}`);
    }, { hours: HOURS.triage, label: 'Inbound triage' }));
    on(root, 'click', '[data-dismiss]', (e, el) => ctx.act((st) => {
      const q = ensureCrm(st).inboundQueue.find((x) => x.id === el.dataset.dismiss);
      q.status = 'dismissed';
      const c = contactById(st, q.contactId);
      if (c) c.status = 'disqualified';
    }, { hours: 0.03, label: 'Inbound triage' }));

    // tasks
    on(root, 'change', '[data-done]', (e, el) => ctx.act((st) => { const t = ensureCrm(st).tasks.find((x) => x.id === el.dataset.done); if (t) t.done = true; }));

    // company view
    if (tab !== 'company') return;
    const co = companyById(s, id);
    if (!co) return;
    on(root, 'click', '#research', (e) => {
      e.target.disabled = true; e.target.textContent = 'Reading their site…';
      ctx.act(async () => { await researchCompany(ctx, co); }, { hours: HOURS.research, label: 'Prospect research' });
    });
    on(root, 'submit', '#coForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act(() => Object.assign(co, f), { hours: 0.02, label: 'CRM hygiene' }); });
    on(root, 'click', '#newDeal', () => ctx.act((st) => ensureDeal(st, { companyId: co.id, contactId: crm.contacts.find((c) => c.companyId === co.id)?.id, source: 'outbound', stage: 'lead' }), { hours: HOURS.stage }));
    on(root, 'click', '[data-savepz]', (e, el) => {
      const c = contactById(s, el.dataset.savepz);
      const text = root.querySelector(`#pz_${c.id}`).value.trim();
      ctx.act(() => {
        if (c.personalizationSource === 'ai' && text === c.personalization) { c.personalizationReviewed = true; return; }
        c.personalization = text;
        c.personalizationSource = text ? 'player' : null;
      }, { hours: c.personalizationSource === 'ai' && text === c.personalization ? 0.02 : HOURS.personalize, label: 'Personalization' });
    });
    on(root, 'click', '[data-aipz]', (e, el) => {
      const c = contactById(s, el.dataset.aipz);
      e.target.disabled = true; e.target.textContent = 'Drafting…';
      ctx.act(async () => {
        const line = await draftPersonalization(ctx, c, co);
        c.personalization = line;
        c.personalizationSource = 'ai';
      }, { hours: HOURS.aiDraftReview, label: 'Personalization (AI draft review)' });
    });
    on(root, 'submit', '#noteForm', (e) => { e.preventDefault(); const { text } = formData(e.target); if (text.trim()) ctx.act((st) => addActivity(st, { type: 'note', text: text.trim(), companyId: co.id, dealId: openDealFor(st, co.id)?.id }), { hours: HOURS.note, label: 'CRM notes' }); });
    on(root, 'submit', '#taskForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => addTask(st, { title: f.title, dueDay: Math.max(st.day, dayFromIso(st, f.due)), companyId: co.id, dealId: openDealFor(st, co.id)?.id }), { hours: HOURS.task }); });
    on(root, 'submit', '#nextForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => setNextStep(st, openDealFor(st, co.id), f.text, Math.max(st.day, dayFromIso(st, f.due))), { hours: HOURS.task, label: 'CRM hygiene' }); });
    on(root, 'submit', '#proposalForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => {
        const deal = openDealFor(st, co.id);
        startProposal(st, deal, { planId: f.planId, quantity: f.quantity ?? 1, annual: Boolean(f.annual), discountPct: (f.discount ?? 0) / 100 });
        toast(`Proposal sent: ${money(deal.amount)} ACV. Expected decision around ${fmtDate(st, deal.decisionDay)}.`, 'good');
      }, { hours: s.company.model === 'ent' ? HOURS.proposalEnt : HOURS.proposalSmb, label: 'Proposal' });
    });
    on(root, 'click', '[data-questionnaire]', () => ctx.act((st) => { const d = openDealFor(st, co.id); d.security.status = 'questionnaire'; addActivity(st, { type: 'note', text: 'Submitted security questionnaire', dealId: d.id, companyId: co.id }); }, { hours: HOURS.securityQuestionnaire, label: 'Security questionnaire' }));
    on(root, 'click', '[data-followup]', () => ctx.act((st) => {
      const d = openDealFor(st, co.id);
      const slot = nextSlot(st, { minLead: 2, duration: st.company.model === 'ent' ? 45 : 30 });
      if (!slot) throw new Error('No free slot on your calendar in the next 30 days.');
      const m = createMeeting(st, { contactId: d.contactId, slot, kind: 'follow_up', source: d.source === 'ai_sdr' ? 'ai_sdr' : 'outbound', duration: st.company.model === 'ent' ? 45 : 30 });
      m.noShowP *= 0.6; // they already engaged
      toast(`Follow-up call booked: ${slotText(st, slot)}`, 'good');
    }, { hours: HOURS.followUp, label: 'Scheduling' }));
  },
};
