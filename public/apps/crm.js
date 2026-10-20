// CRM (HubSpot/Attio-style): companies, contacts, a deal pipeline with buyer-action stages, inbound triage,
// tasks, CSV import with column mapping and validation, email verification, and website research.
import { setLandStrategy } from './sales/expand.js';
import { LAND_STRATEGIES } from '../data/gtm-comp.js';
import { html, mount, on, formData, modal, readFile, table, stat, badge, toast, download } from '../core/ui.js';
import { money, pct, fmtDate, isoDate, parseCsv, toCsv, chance } from '../core/util.js';
import { post } from '../core/bank.js';
import { SALES, HOURS } from './sales/params.js';
import { FIELDS, guessMapping, validateRows } from './sales/csv.js';
import { STAGES, stageLabel, manualMoves, isOpen, weightedPipeline, winRate } from './sales/deals.js';
import { specificity } from './sales/copy.js';
import { employeesOf } from './sales/replies.js';
import { BUYER_SEGMENTS, METHODOLOGIES, segmentOf, segmentIdOf, committeeContacts, committeeEffect, methodCoverage, roleLabel, isCertification, getSegment } from './sales/segments.js';
import {
  ensureCrm, ensureCalls, addContact, contactName, companyById, contactById, verifyContacts, ensureDeal, moveDeal, loseDeal,
  addActivity, addTask, setNextStep, startProposal, hasSoc2, hasDpa, createMeeting, nextSlot, openMeetingFor, slotText, openDealFor, proposePilot,
  workPaperwork, offerBridgeLetter, reachStakeholder, mapBuyingGroup, reopenDeal,
} from './sales/model.js';
import { dealsDay } from './sales/engine.js';
import { researchCompany, draftPersonalization } from './sales/jobs.js';
import { newThread, addMessage } from '../core/mail.js';
import { claimAutomated } from './automations/engine.js';
import { questionnaireHours } from './success/model.js';
import { addAsk } from './success/engine.js';
import { discountCheck } from './channels/pricing-model.js';
import { MARKET } from '../core/params.js';
import { prospectsView, wireProspects } from './sales/prospects-view.js';
import { abmView, wireAbm, abmBadge } from './sales/abm-view.js'; // ABM workspace + signal inbox (Target accounts tab)
import { abmDay } from './sales/abm.js';
import { staleDays, nudgeDeal, submitForecast, ensureForecasts, forecastAccuracy, zombies, FORECAST_CATS, PIPE } from './sales/pipeline.js';
import { isBurned } from './sales/market-burn.js';
import { variantForm, rfpBox, presellDealPanel, learningView, presellView, wireLearning } from './sales/learning-view.js';
import { bidsView, wireBids, bidsBadge } from './sales/rfp-view.js';
import { negotiationDay } from './negotiate/index.js'; // shared negotiation engine: adapters + daily hooks
import { negotiationLauncher, wireNegotiation } from './negotiate-view.js';
import { howTo } from '../core/howto.js';
import './sales/operator.js'; // registers the prospecting / discovery / deal-management operator readers
import { warmDay, openRequests } from './sales/warm-intros.js'; // registers the warm_intros operator reader
import { warmView, wireWarm } from './sales/warm-view.js';
import { stackDay, researchHours, useRoxResearch, CRM_VENDORS } from './sales/stack.js';
import { stackView, wireStack } from './sales/stack-view.js';

let csvDraft = null; // { name, headers, rows, mapping, skipRole }
let contactFilter = 'all';
let selected = new Set();
const fcPicks = {}; // dealId -> forecast category being edited

const STATUS_TONE = { new: '', enrolled: 'accent', contacted: 'accent', replied: 'warn', interested: 'good', meeting: 'good', customer: 'good', unsubscribed: 'bad', bounced: 'bad', no_reply: '', disqualified: 'bad', inbound: 'good' };
const VERIFY_TONE = { valid: 'good', catch_all: 'warn', unknown: 'warn', invalid: 'bad' };
// First manual questionnaire 20–40h; with an answer library 2–8h (world-ops-support-life.md §7).
const qHours = (s, deal) => questionnaireHours({ soc2: hasSoc2(s), library: Boolean(s.apps.success?.library), seed: deal?.id ?? '' });
const listAcvOf = (s, deal, planId = deal.planId, quantity = deal.quantity ?? 1, annual = deal.annual) => {
  const plan = s.plans.find((p) => p.id === planId) ?? s.plans[0];
  if (!plan) return 0;
  const ent = s.company.model === 'ent';
  return plan.interval === 'year' ? plan.price * quantity : plan.price * 12 * quantity * (ent || annual ? 1 - (ent ? 0 : MARKET.smb.annualDiscount) : 1);
};
function guardText(s, deal, disc, opts) {
  const c = discountCheck(s, listAcvOf(s, deal, opts?.planId, opts?.quantity, opts?.annual), disc);
  return `Discount guardrail (${c.bandLabel}): typical ${Math.round(c.typical[0] * 100)}–${Math.round(c.typical[1] * 100)}%, max ${Math.round(c.max * 100)}%. ${c.note}${c.needsApproval ? ' Needs approval under your policy.' : ''}`;
}
const STANCE = { support: ['supportive', 'good'], neutral: ['cautious', ''], oppose: ['opposed', 'bad'], left: ['left the company', 'bad'] };

function buyingPanel(s, deal) {
  const members = committeeContacts(s, deal);
  const hidden = members.filter((c) => c.hidden).length;
  const seen = members.filter((c) => !c.hidden);
  const me = deal.method;
  const cov = methodCoverage(deal);
  const open = isOpen(deal);
  const eff = open && deal.committee ? committeeEffect(s, deal) : null;
  const firing = (deal.scenarios ?? []).filter((x) => (x.effect.winMult ?? 1) !== 1 || x.effect.needsRole || x.effect.paperwork || x.effect.stallDays);
  return html`<section class="panel"><h2>Buying process · ${getSegment(deal.segmentId)?.label ?? ''}</h2>
    <div class="grid-2">
      <div><h3>Buying group (${seen.length} known${hidden ? `, ~${hidden} more involved` : ''})</h3>
        ${deal.committee?.buyerIsUser ? html`<p class="small muted">The buyer is also the day-to-day user.</p>` : html`<p class="small muted">The person who signs is not the person who will use it.</p>`}
        <ul class="list small">${seen.map((c) => { const cm = c.committee; const [label, tone] = cm.engaged || cm.stance === 'left' ? STANCE[cm.stance] : ['not met yet', '']; return html`<li style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap">
          <span><b>${contactName(c)}</b> · ${c.title} ${badge(roleLabel(cm.role), 'accent')} ${cm.canBlock ? badge('can block', 'warn') : ''} ${badge(label, tone)}
          ${cm.engaged && cm.concerns?.length ? html`<div class="muted">Cares about: ${cm.concerns.join('; ')}</div>` : ''}</span>
          ${open && !cm.engaged && cm.stance !== 'left' && !cm.primary ? html`<span><button class="sm" data-intro="${c.id}">Ask for an intro (6 min)</button> <button class="sm" data-cold="${c.id}">Reach out cold (9 min)</button></span>` : ''}</li>`; })}</ul>
        ${hidden ? html`<p class="hint">Others are involved but you don't know who. Ask about the decision process, who signs, security, legal and procurement on your calls — or map the org.</p>` : ''}
        ${open && hidden ? html`<button class="sm" id="mapGroup">Map the buying group on LinkedIn (30 min)</button>` : ''}
        ${eff && eff.notes.length ? html`<p class="small">Coverage: ${eff.notes.join('; ')}</p>` : ''}
      </div>
      <div>${me ? html`<h3>${me.label} · ${Math.round((cov?.critical ?? 0) * 100)}% of critical known</h3>
        <ul class="list small">${me.elements.map((e) => html`<li>${me.known?.[e.id] != null ? '✅' : '⬜'} <b>${e.label}</b>${me.critical.includes(e.id) ? html` ${badge('critical', 'warn')}` : ''}${me.known?.[e.id] == null ? html`<div class="muted">Ask: “${e.probeQuestions[0]}”</div>` : ''}</li>`)}</ul>
        <p class="hint">${(METHODOLOGIES[me.id] ?? {}).whenToUse ?? ''}</p>` : ''}</div>
    </div>
    ${deal.proc ? html`<h3>Their procurement</h3><ul class="small">${deal.proc.notes.map((n) => html`<li>${n}</li>`)}${deal.proc.board ? html`<li>Board/council meeting: ${fmtDate(s, deal.proc.board.day)}</li>` : ''}${deal.proc.earliestDecisionDay ? html`<li>Earliest decision (new fiscal year): ${fmtDate(s, deal.proc.earliestDecisionDay)}</li>` : ''}</ul>` : ''}
    ${deal.paperwork?.length ? html`<h3>Paperwork they need from you</h3><ul class="list small">${deal.paperwork.map((it) => html`<li style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><span>${it.status === 'done' ? '✅' : '⬜'} <b>${it.label}</b> ${it.reused ? badge('reused', 'good') : ''} ${it.waived ? badge(it.waived, 'good') : ''}
        <span class="muted">${it.status === 'done' ? (it.readyDay > s.day ? `their review until ${fmtDate(s, it.readyDay)}` : 'accepted') : isCertification(it.id) ? 'SOC 2 comes from Legal (months)' : `${it.progress}/${it.hours}h${it.costUsd ? ` · $${it.costUsd.toLocaleString('en-US')}` : ''} · their review ~${it.days} d`}</span></span>
        ${it.status === 'open' && open ? (isCertification(it.id) ? html`<span><a class="btn sm" href="#/legal">Legal →</a> ${it.bridgeTried ? '' : html`<button class="sm" data-bridge>Offer a bridge letter (2h)</button>`}</span>` : html`<button class="sm" data-paper="${it.id}">Work ${Math.min(8, it.hours - it.progress).toFixed(1)}h</button>`) : ''}</li>`)}</ul>
      ${deal.paperDeadline ? html`<p class="small warn">Deliver by ${fmtDate(s, deal.paperDeadline)} or the deal dies.</p>` : ''}` : ''}
    ${firing.length ? html`<h3>What's happening on their side</h3>${firing.map((x) => html`<div class="callout ${(x.effect.winMult ?? 1) > 1 ? 'good' : 'warn'}"><b>${x.label}.</b> ${x.description} <span class="small">How to handle: ${x.howToHandle}</span></div>`)}` : ''}
  </section>`;
}

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

// How deals start: prospects in, a way to reach them, buyer actions move the stages.
function crmHowTo(s, crm) {
  const nContacts = crm.contacts.filter((c) => !c.hidden).length;
  const o = s.apps.outreach;
  const reached = (o?.enrollments ?? []).some((e) => e.sent?.length) || (o?.linkedin?.requests?.length ?? 0) > 0 || crm.inboundQueue.some((q) => q.status === 'accepted');
  const held = (s.apps.calls?.meetings ?? []).some((m) => ['held', 'done'].includes(m.status));
  return howTo({
    open: !crm.deals.length,
    title: 'How deals start here',
    how: 'The CRM holds people you could sell to. A deal is created when a prospect replies with interest, when you accept an inbound lead or intro, or by hand on a company page ("Create deal at Lead"). Stages then move only when the buyer acts: replies, meetings held in Calls, a signed contract.',
    steps: [
      [`Add prospects: Prospects (database search), + Add prospect, or Import CSV (${nContacts} so far)`, nContacts > 0, '#/crm/prospects'],
      ['Open a company to research its real site and write a first line about the person', crm.contacts.some((c) => c.personalization), '#/crm/companies'],
      ['Reach them: accept intros in Inbound and reply in Mail, LinkedIn requests or a cold-email sequence in Outreach', reached, '#/crm/inbound'],
      ['Hold the call when one is booked (Calls), then set a dated next step on the deal', held, '#/calls'],
    ],
    levers: 'Fit (right industry, size, the person who signs, a reason to talk now) and how specific your first line is. Replying within 24 hours improves win rates; deals without a dated next step go stale.',
    cost: `About 6 minutes per prospect by hand, 15 minutes to research a site, 6 minutes to accept and answer an inbound lead. Email verification ${money(SALES.verify.costPerEmail, { cents: true })} each; database plans free to $185/month.`,
    next: 'Replies arrive over days (Mail, Outreach → Replies). Interested replies you answer turn into calls; held calls that qualify become open deals in the Pipeline.',
  });
}

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
  const quiet = isOpen(d) && ['qualified', 'proposal', 'contract'].includes(d.stage) ? staleDays(s, d) : 0;
  return html`<div class="card">
    <a href="#/crm/company:${d.companyId}"><b>${co?.name ?? 'Unknown'}</b></a>
    <div class="small muted">${ct ? contactName(ct) : ''}${ct?.title ? ` · ${ct.title}` : ''}</div>
    <div class="small">${money(d.amount)} ACV ${d.source !== 'outbound' ? badge(d.source) : ''} ${stalled ? badge('no next step', 'warn') : ''}${quiet >= PIPE.staleFlagDays ? badge(`${quiet}d no buyer contact`, quiet > PIPE.decayFrom ? 'bad' : 'warn') : ''}${d.stage === 'lost' && d.lostReason ? html`<div class="muted">${d.lostReason}</div>` : ''}</div>
    ${manualMoves(d).length ? html`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${manualMoves(d).map((m) => html`<button class="sm ${m === 'lost' ? 'danger' : ''}" data-move="${d.id}" data-to="${m}">${m === 'lost' ? 'Lost' : `→ ${stageLabel(m)}`}</button>`)}</div>` : ''}
  </div>`;
}

function forecastView(s, crm) {
  const late = crm.deals.filter((d) => isOpen(d) && ['qualified', 'proposal', 'contract'].includes(d.stage));
  const acc = forecastAccuracy(s);
  const hist = ensureForecasts(s).slice().reverse().slice(0, 12);
  const z = zombies(s);
  return html`<section class="panel"><h2>Weekly forecast review</h2>
    <p class="small muted">Put each late-stage deal in Commit (the economic buyer agreed a close date), Best case or Pipeline, or take it out. Each forecast is scored against what actually closes in the next ${PIPE.forecastHorizon} days.</p>
    ${z.length ? html`<div class="callout warn">${z.length} deal(s) with no buyer contact for 30+ days: ${z.map((d) => companyById(s, d.companyId)?.name).join(', ')}. Remove deals that missed an exit criterion.</div>` : ''}
    ${late.length ? html`<div class="table-wrap"><table><thead><tr><th>Deal</th><th>Stage</th><th>ACV</th><th>Buyer contact</th><th>Next step</th><th>Category</th></tr></thead><tbody>${late.map((d) => html`<tr>
      <td><a href="#/crm/company:${d.companyId}">${companyById(s, d.companyId)?.name ?? ''}</a></td><td>${stageLabel(d.stage)}</td><td>${money(d.amount)}</td>
      <td class="${staleDays(s, d) > PIPE.decayFrom ? 'neg' : ''}">${staleDays(s, d)}d ago</td><td class="small">${d.nextStep ? `${d.nextStep.text} · ${fmtDate(s, d.nextStep.dueDay)}` : html`<span class="warn">none</span>`}</td>
      <td><select data-fc="${d.id}">${Object.entries(FORECAST_CATS).map(([k, l]) => html`<option value="${k}" ${(fcPicks[d.id] ?? 'pipeline') === k ? 'selected' : ''}>${l}</option>`)}</select></td></tr>`)}</tbody></table></div>
      <button class="primary" id="submitFc">Submit this week's forecast (30 min review)</button>` : html`<p class="empty">No qualified deals to forecast.</p>`}</section>
    <section class="panel"><h2>Forecast accuracy</h2><p>${acc.n ? `Mean miss ${Math.round(acc.meanError * 100)}% over ${acc.n} resolved forecasts.` : 'No resolved forecasts yet.'}</p>
      ${table({ rows: hist, empty: 'No forecasts yet.', columns: [
        { label: 'Week of', render: (f) => fmtDate(s, f.day) }, { label: 'Commit', align: 'right', render: (f) => money(f.commit) }, { label: 'Best case', align: 'right', render: (f) => money(f.best) },
        { label: 'Closed', align: 'right', render: (f) => (f.resolved ? money(f.realised) : 'pending') }, { label: 'Miss', align: 'right', render: (f) => (f.resolved ? html`<span class="${f.error > 0.4 ? 'neg' : f.error <= 0.2 ? 'pos' : ''}">${Math.round(f.error * 100)}%</span>` : '') },
        { label: 'Why', render: (f) => html`<span class="small">${[...new Set(f.coaching ?? [])].join('; ')}</span>` }] })}</section>`;
}

function companiesView(s, crm) {
  const rows = [...crm.companies].sort((a, b) => b.createdDay - a.createdDay);
  return html`<section class="panel">${table({
    rows, empty: 'No companies yet. Add a prospect or import a CSV.',
    rowAttrs: (c) => `class="clickable" data-company="${c.id}"`,
    columns: [
      { label: 'Company', render: (c) => html`<b>${c.name}</b> ${isBurned(s, c) ? badge('burned', 'bad') : ''}<div class="small muted">${c.domain}</div>` },
      { label: 'Industry', render: (c) => c.industry || '—' },
      { label: 'Size', render: (c) => c.size || '—' },
      { label: 'Segment', render: (c) => html`<span class="small">${segmentOf(s, c)?.label ?? '—'}</span>` },
      { label: 'Contacts', align: 'right', render: (c) => crm.contacts.filter((x) => x.companyId === c.id && !x.hidden).length },
      { label: 'Research', render: (c) => (c.research ? badge(`fit ${Math.round(c.research.fit * 100)}%`, c.research.fit >= 0.6 ? 'good' : c.research.fit >= 0.35 ? 'warn' : 'bad') : c.site ? badge('site fetched') : badge('not researched')) },
      { label: 'Deal', render: (c) => { const d = crm.deals.filter((x) => x.companyId === c.id).at(-1); return d ? badge(stageLabel(d.stage), d.stage === 'won' ? 'good' : d.stage === 'lost' ? 'bad' : 'accent') : '—'; } },
    ],
  })}</section>`;
}

function contactsView(s, crm) {
  const filters = ['all', 'new', 'unverified', 'contacted', 'interested', 'replied', 'meeting', 'customer', 'bounced', 'unsubscribed'];
  const rows = crm.contacts.filter((c) => !c.hidden).filter((c) => contactFilter === 'all' || (contactFilter === 'unverified' ? !c.verification : c.status === contactFilter));
  const unverified = crm.contacts.filter((c) => !c.verification && !c.hidden);
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
    <p class="muted small">Demo requests and contact forms from your website and marketing, and customer intros from your network (Messages). Accepting one creates a deal and opens the reply in Mail. Qualify fast: speed-to-lead matters more for inbound than anything else.</p>
    ${q.length ? html`<ul class="list">${q.map((x) => { const c = contactById(s, x.contactId); const co = companyById(s, x.companyId); return html`<li>
      <b>${contactName(c)}</b> ${c?.title ? html`<span class="muted">· ${c.title}</span>` : ''} · ${co?.name ?? ''} ${co?.domain ? html`<span class="muted small">(${co.domain})</span>` : ''}
      <div class="small">${badge(x.source)} ${fmtDate(s, x.day)} ${x.note ? html`· "${x.note}"` : ''}</div>
      <div class="inline" style="margin-top:6px"><button class="sm primary" data-accept="${x.id}">Accept → deal + reply in Mail (6 min)</button><button class="sm" data-dismiss="${x.id}">Disqualify</button></div></li>`; })}</ul>` : html`<p class="empty">No new inbound leads. They come from intros you ask for in <a href="#/messages/contacts">Messages → Your network</a>, your website and launches.</p>`}
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
  const contacts = crm.contacts.filter((c) => c.companyId === co.id && !c.hidden);
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
        <label>Buyer segment <select id="segSel">${BUYER_SEGMENTS.map((g) => html`<option value="${g.id}" ${g.id === segmentIdOf(s, co) ? 'selected' : ''}>${g.label}</option>`)}</select></label>
        ${segmentOf(s, co) ? html`<p class="hint">${co.segmentManual ? 'Set by you.' : 'Auto-mapped from industry, name and size; change it if it is wrong.'} Usual ACV $${segmentOf(s, co).acvRange.map((x) => x.toLocaleString('en-US')).join('–$')} · buyer is the user ${Math.round(segmentOf(s, co).buyerIsUserProb * 100)}% of the time · best reached by ${segmentOf(s, co).bestContact.channel} (${segmentOf(s, co).bestContact.times}).</p>` : ''}
        <form id="coForm"><div class="grid-2"><label>Industry <input name="industry" value="${co.industry}" /></label><label>Size <input name="size" value="${co.size}" /></label></div>
          <label>Notes <textarea name="notes" rows="2">${co.notes}</textarea></label><button class="sm">Save details</button></form>
      </section>
      <section class="panel"><h2>Deal</h2>${deal ? dealPanel(s, deal) : html`<p class="muted">No deal yet.</p><button id="newDeal">Create deal at Lead</button>`}
        ${meetings.length ? html`<h3>Calls</h3><ul class="list small">${meetings.map((m) => html`<li><a href="#/calls/${m.id}">${m.kind} · ${fmtDate(s, m.day)}</a> ${badge(m.status.replace('_', ' '), m.status === 'held' ? 'good' : ['no_show', 'missed'].includes(m.status) ? 'bad' : 'accent')}</li>`)}</ul>` : ''}
      </section>
    </div>
    ${deal && (deal.committee || deal.proc) ? buyingPanel(s, deal) : ''}
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
    ${open && ['qualified', 'proposal', 'contract'].includes(deal.stage) ? html`<p class="small ${staleDays(s, deal) > PIPE.decayFrom ? 'neg' : 'muted'}">Last buyer contact ${staleDays(s, deal)} days ago${staleDays(s, deal) > PIPE.decayFrom ? ': the odds of closing fall every quiet day' : ''}. <button class="sm" data-nudge="${deal.id}">Check in with a dated ask (9 min)</button></p>` : ''}
    ${deal.earlyDiscount ? html`<p class="small warn">Discounted ${Math.round(deal.earlyDiscount.pct * 100)}% before they named a budget: it buys no extra odds.</p>` : ''}
    ${deal.fields ? html`<p class="small"><b>Fields:</b> ${Object.entries(deal.fields).map(([k, f]) => `${k}: ${f.value}`).join(' · ')}</p>` : ''}
    ${deal.nextStep ? html`<p class="small"><b>Next step:</b> ${deal.nextStep.text} · ${fmtDate(s, deal.nextStep.dueDay)}</p>` : open ? html`<p class="small warn">No dated next step.</p>` : ''}
    ${open ? html`<form id="nextForm" class="inline"><label>Next step <input name="text" required placeholder="Send pilot proposal" /></label><label style="max-width:170px">By <input type="date" name="due" value="${isoDate(s, s.day + 3)}" /></label><button class="sm">Set</button></form>
      <div class="inline" style="margin-top:6px">${manualMoves(deal).map((m) => html`<button class="sm ${m === 'lost' ? 'danger' : ''}" data-move="${deal.id}" data-to="${m}">${m === 'lost' ? 'Mark lost' : `→ ${stageLabel(m)}`}</button>`)}
        ${['meeting_held', 'qualified', 'proposal'].includes(deal.stage) && ct && !openMeetingFor(s, ct.id) ? html`<button class="sm" data-followup="${deal.id}">Ask for a follow-up call (9 min)</button>` : ''}</div>` : ''}
    ${['meeting_held', 'qualified'].includes(deal.stage) && !deal.pilot ? html`<fieldset><legend>Design partner / pilot</legend>
      <p class="small muted">The usual first step for enterprise (and many SMB) deals: a free design partnership in exchange for feedback and a reference, or a paid pilot (~${Math.round(SALES.pilot.paid_pilot.feeShare * 100)}% of the annual price for ${SALES.pilot.paid_pilot.days} days) that converts to a contract if it works.</p>
      <div class="inline">
        <button class="sm" data-pilot="design_partner" ${deal.pilotAsked?.design_partner != null ? 'disabled' : ''}>Propose unpaid design partnership (30 min)</button>
        <button class="sm" data-pilot="paid_pilot" ${deal.pilotAsked?.paid_pilot != null ? 'disabled' : ''}>Propose paid pilot (1h)</button>
      </div></fieldset>` : ''}
    ${deal.pilot ? html`<div class="callout ${deal.pilot.status === 'converted' ? 'good' : deal.pilot.status === 'ended' ? 'bad' : ''}"><b>${SALES.pilot[deal.pilot.type].label}</b> ${deal.pilot.fee ? `($${deal.pilot.fee.toLocaleString('en-US')})` : ''} · ${fmtDate(s, deal.pilot.startDay)} → ${fmtDate(s, deal.pilot.endDay)} · ${deal.pilot.status}. ${deal.pilot.status === 'active' ? 'Make it succeed: check in, ship what they need, ask for the contract before it ends.' : ''}</div>` : ''}
    ${rfpBox(s, deal)}
    ${(open && deal.stage === 'contract' && deal.contract) || deal.contract?.negotiationId ? negotiationLauncher({ state: s }, { kind: 'enterprise', ref: deal.id, key: `deal:${deal.id}`, label: 'Negotiate the contract terms', hint: 'The buyer\'s procurement has the order form. This is the negotiation window before signature: discount, term, payment, renewal cap, MFN, liability, termination, SLA, publicity, start date. Signing is held until it closes; if you skip it the order form signs as sent.' }) : ''}
    ${open ? variantForm(s, deal) : ''}
    ${presellDealPanel(s, deal)}
    ${deal.stage === 'qualified' ? html`<fieldset><legend>Send proposal</legend>
      ${!plans.length ? html`<p class="callout warn">You have not set a price yet. Set one in the <a href="#/pricing/prices">Pricing lab</a> before sending a proposal.</p>` : ''}
      <form id="proposalForm"><div class="grid-2">
        <label>Plan <select name="planId">${plans.map((p) => html`<option value="${p.id}" ${p.id === deal.planId ? 'selected' : ''}>${p.name} · $${p.price}/${p.interval}</option>`)}</select></label>
        <label>${ent ? 'Seats / units' : 'Seats'} <input type="number" name="quantity" min="1" max="${employeesOf(companyById(s, deal.companyId) ?? {}, s.company.model)}" value="${deal.quantity ?? 1}" /><span class="hint">~${employeesOf(companyById(s, deal.companyId) ?? {}, s.company.model)} employees: first deals usually cover 20–60% of them.</span></label>
        <label>Discount % <input type="number" name="discount" id="discountIn" min="0" max="50" value="${Math.round((deal.discountPct ?? 0) * 100)}" /></label>
        ${ent ? html`<p class="small muted">Enterprise: annual contract, invoiced (ACH/wire).</p>` : html`<label><input type="checkbox" name="annual" ${deal.annual ? 'checked' : ''} /> Bill annually (−17%)</label>`}
        <label>Land strategy <select name="land"><option value="">Custom: the seats above</option>${Object.entries(LAND_STRATEGIES).map(([id, L]) => html`<option value="${id}" ${deal.land?.strategy === id ? 'selected' : ''}>${L.label}</option>`)}</select><span class="hint">A land strategy sets the seats on the first contract, the cycle and win odds, and how much room is left to expand. ${Object.values(LAND_STRATEGIES).map((L) => L.label + ': ' + L.blurb).join(' ')}</span></label>
        <label><input type="checkbox" name="ramp" ${deal.land?.ramp ? 'checked' : ''} /> Ramped contract (start at 60% of the seats, step up as signed)</label>
      </div>
      <p class="hint" id="discountHint">${guardText(s, deal, deal.discountPct ?? 0)}</p>
      <p class="hint">Win rate at this ACV ≈ ${pct(winRate(deal.amount), 0)} of qualified opportunities (Landbase/Gong 2025–26). Writing it takes ${ent ? HOURS.proposalEnt : HOURS.proposalSmb}h.</p>
      <button class="primary sm">Send proposal</button></form></fieldset>` : ''}
    ${sec && sec.status !== 'passed' && open ? html`<div class="callout ${hasSoc2(s) ? '' : 'warn'}"><b>Security review requested.</b> ${hasSoc2(s) ? 'You have a SOC 2 report; it will be shared.' : html`No SOC 2 report: about half of buyers stop here. ${sec.status === 'questionnaire' ? 'Questionnaire submitted; waiting on their review.' : (sec.askId ? html`<a href="#/success/asks">Questionnaire in progress →</a>` : html`<button class="sm" data-questionnaire="${deal.id}">Start their security questionnaire (~${qHours(s, deal)}h${s.apps.success?.library ? ' with your answer library' : ''})</button>`)} <a href="#/legal">Legal →</a>`}</div>` : ''}
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
    return (crm.inboundQueue ?? []).filter((x) => x.status === 'new').length + (crm.tasks ?? []).filter((t) => !t.done && t.dueDay <= s.day).length + bidsBadge(s);
  },
  onDay(state) { dealsDay(state); negotiationDay(state); warmDay(state); abmDay(state); stackDay(state); },
  render(root, ctx) {
    const s = ctx.state;
    const crm = ensureCrm(s);
    const [tab0, ...idParts] = ctx.params.split(':');
    const id = idParts.join(':'); // warm-intro connector ids contain a colon (net:per_x)
    const tab = tab0 || 'pipeline';
    const open = crm.deals.filter(isOpen);
    const won = crm.deals.filter((d) => d.stage === 'won');
    const lost = crm.deals.filter((d) => d.stage === 'lost' && d.history.some((h) => h.stage === 'qualified' || h.stage === 'proposal'));
    const inboundN = crm.inboundQueue.filter((x) => x.status === 'new').length;
    const tabs = [['pipeline', 'Pipeline'], ['prospects', 'Prospects'], ['abm', `Target accounts${abmBadge(s) ? ` (${abmBadge(s)})` : ''}`], ['forecast', 'Forecast'], ['companies', `Companies (${crm.companies.length})`], ['contacts', `Contacts (${crm.contacts.filter((c) => !c.hidden).length})`], ['import', 'Import CSV'], ['inbound', `Inbound${inboundN ? ` (${inboundN})` : ''}`], ['warm', `Warm intros${openRequests(s).length ? ` (${openRequests(s).length})` : ''}`], ['tasks', 'Tasks'], ['learning', 'Learning'], ['presell', 'Pre-sell'], ['bids', `Bids${bidsBadge(s) ? ` (${bidsBadge(s)})` : ''}`], ['stack', 'Stack']];
    const body = tab === 'company' ? companyView(s, crm, id)
      : tab === 'companies' ? companiesView(s, crm) : tab === 'contacts' ? contactsView(s, crm) : tab === 'import' ? importView(s, crm)
        : tab === 'inbound' ? inboundView(s, crm) : tab === 'tasks' ? tasksView(s, crm) : tab === 'prospects' ? prospectsView(s) : tab === 'abm' ? abmView(s, id) : tab === 'forecast' ? forecastView(s, crm) : tab === 'learning' ? learningView(s) : tab === 'presell' ? presellView(s) : tab === 'bids' ? bidsView(s, id) : tab === 'warm' ? warmView(s, id) : tab === 'stack' ? stackView(s) : pipelineView(s, crm);
    mount(root, html`
      <div class="app-head"><div><h1>CRM${s.apps.crm?.stack?.crm ? ` · ${CRM_VENDORS[s.apps.crm.stack.crm]?.vendor ?? ''}` : ''}</h1><p>Your real prospects: companies, people, and deals that move only when buyers act. Research their real website before you write to them.</p></div>
        <div class="app-actions"><button class="primary" id="addProspect">+ Add prospect</button></div></div>
      <div class="stats">
        ${stat('Open deals', open.length, `${money(open.reduce((a, d) => a + (d.amount ?? 0), 0))} total ACV`)}
        ${stat('Weighted pipeline', money(weightedPipeline(crm.deals)), 'stage-probability weighted')}
        ${stat('Closed won', won.length, money(won.reduce((a, d) => a + (d.amount ?? 0), 0)) + ' ACV', won.length ? 'good' : '')}
        ${stat('Win rate', won.length + lost.length ? pct(won.length / (won.length + lost.length), 0) : '—', 'of qualified opportunities')}
        ${stat('Prospects', crm.contacts.filter((c) => !c.hidden).length, `${crm.contacts.filter((c) => c.verification && !c.hidden).length} verified`)}
      </div>
      ${tab === 'company' ? '' : html`<div class="tabs">${tabs.map(([k, l]) => html`<a href="#/crm/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>`}
      ${['pipeline', 'prospects', 'companies', 'contacts', 'inbound'].includes(tab) ? crmHowTo(s, crm) : ''}
      ${body}`);

    on(root, 'click', '#addProspect', () => addProspectModal(ctx));
    if (tab === 'prospects') wireProspects(root, ctx);
    if (tab === 'abm') wireAbm(root, ctx);
    wireLearning(root, ctx);
    wireNegotiation(root, ctx);
    if (tab === 'bids') wireBids(root, ctx);
    if (tab === 'warm') wireWarm(root, ctx);
    if (tab === 'stack') wireStack(root, ctx);
    on(root, 'change', '[data-fc]', (e, el) => { fcPicks[el.dataset.fc] = el.value; });
    on(root, 'click', '#submitFc', () => ctx.act((st) => { const f = submitForecast(st, { ...fcPicks }); toast(`Forecast saved: commit ${money(f.commit)}, best case ${money(f.best)}. Scored against what closes by ${fmtDate(st, f.periodEnd)}.`, 'good'); }, { hours: PIPE.hours.review, label: 'Weekly pipeline review' }));
    on(root, 'click', '[data-nudge]', (e, el) => ctx.act((st) => { const d = st.apps.crm.deals.find((x) => x.id === el.dataset.nudge); const r = nudgeDeal(st, d); addActivity(st, { type: 'email', text: `Checked in with a dated ask: ${r.ok ? 'they replied' : 'no reply yet'}`, dealId: d.id, companyId: d.companyId }); toast(r.ok ? 'They replied with a date.' : 'No reply yet.', r.ok ? 'good' : 'warn'); }, { hours: PIPE.hours.nudge, label: 'Deal follow-up' }));
    on(root, 'click', '#addContactHere', () => { const co = companyById(s, id); addProspectModal(ctx, { company: co?.name, domain: co?.domain }); });
    on(root, 'click', '[data-company]', (e, el) => ctx.navigate('crm', `company:${el.dataset.company}`));
    on(root, 'click', '[data-move]', (e, el) => ctx.act((st) => {
      const d = st.apps.crm.deals.find((x) => x.id === el.dataset.move);
      if (el.dataset.to === 'lost') loseDeal(st, d, 'Marked lost by you');
      else if (d.stage === 'lost') reopenDeal(st, d);
      else moveDeal(st, d, el.dataset.to, 'moved manually');
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
      // Speed to lead: a lead left in the queue for days has often moved on (sales/stack.js SPEED).
      if (q.cold) { c.status = 'replied'; c.replyKind = 'not_now'; }
      const m = addMessage(st, th.id, { from: 'them', body: q.cold ? `Thanks for getting back to me. We filled in a few forms last week and already started a trial with another tool. Maybe next quarter.` : (q.note || `Hi, I filled in the form on your site. Can you tell me more about how ${st.company.name} works?`) });
      m.day = q.day;
      c.threadId = th.id;
      ctx.navigate('mail', `prospect:${th.id}`);
    }, { hours: claimAutomated(s, 'crm_inbound_triage', HOURS.triage, { ref: el.dataset.accept }), label: 'Inbound triage' })); // faster when an automation enriched this lead
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
      const rh = researchHours(s, HOURS.research); // a Rox account brief when the agent layer has actions left
      ctx.act(async (st) => { if (rh < HOURS.research) useRoxResearch(st); await researchCompany(ctx, co); }, { hours: rh, label: rh < HOURS.research ? 'Prospect research (Rox brief)' : 'Prospect research' });
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
    on(root, 'input', '#proposalForm', (e) => {
      const f = formData(e.target.form ?? e.target.closest('form'));
      const box = root.querySelector('#discountHint');
      if (box) box.textContent = guardText(s, openDealFor(s, co.id), (f.discount ?? 0) / 100, { planId: f.planId, quantity: f.quantity ?? 1, annual: Boolean(f.annual) });
    });
    on(root, 'submit', '#proposalForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const over = !discountCheck(s, listAcvOf(s, openDealFor(s, co.id), f.planId, f.quantity ?? 1, Boolean(f.annual)), (f.discount ?? 0) / 100).ok;
      if (over) toast('That discount is above your guardrail: it won\'t raise your odds further and buyers will push for more.', 'warn');
      ctx.act((st) => {
        const deal = openDealFor(st, co.id);
        if (f.land) setLandStrategy(st, deal, f.land, { ramp: Boolean(f.ramp) }); else delete deal.land;
        startProposal(st, deal, { planId: f.planId, quantity: f.quantity ?? 1, annual: Boolean(f.annual), discountPct: (f.discount ?? 0) / 100 });
        toast(`Proposal sent: ${money(deal.amount)} ACV. Expected decision around ${fmtDate(st, deal.decisionDay)}.`, 'good');
      }, { hours: s.company.model === 'ent' ? HOURS.proposalEnt : HOURS.proposalSmb, label: 'Proposal' });
    });
    on(root, 'change', '#segSel', (e) => ctx.act(() => { co.segmentId = e.target.value; co.segmentManual = true; }, { hours: 0.02, label: 'CRM hygiene' }));
    on(root, 'click', '[data-intro]', (e, el) => ctx.act((st) => { const r = reachStakeholder(st, openDealFor(st, co.id), el.dataset.intro, { via: 'intro' }); toast(r.ok ? 'Intro made: call booked.' : 'No intro yet.', r.ok ? 'good' : 'warn'); }, { hours: 0.1, label: 'Multi-threading' }));
    on(root, 'click', '[data-cold]', (e, el) => ctx.act((st) => { const r = reachStakeholder(st, openDealFor(st, co.id), el.dataset.cold, { via: 'cold' }); toast(r.ok ? 'They agreed to a call.' : 'No reply.', r.ok ? 'good' : 'warn'); }, { hours: 0.15, label: 'Multi-threading' }));
    on(root, 'click', '#mapGroup', () => ctx.act((st) => { const c = mapBuyingGroup(st, openDealFor(st, co.id)); toast(c ? `Found ${contactName(c)} (${c.title}).` : 'Nothing conclusive on LinkedIn this time.', c ? 'good' : 'warn'); }, { hours: 0.5, label: 'Account research' }));
    on(root, 'click', '[data-paper]', (e, el) => {
      const d = openDealFor(s, co.id);
      const it = d.paperwork.find((x) => x.id === el.dataset.paper);
      const h = Math.max(0.1, Math.min(8, it.hours - it.progress));
      ctx.act((st) => { if (workPaperwork(st, openDealFor(st, co.id), it.id, h)) toast(`Delivered: ${it.label}.`, 'good'); }, { hours: h, label: it.label });
    });
    on(root, 'click', '[data-bridge]', () => ctx.act((st) => { toast(offerBridgeLetter(st, openDealFor(st, co.id)) ? 'They accepted the bridge letter for now.' : 'They need the actual SOC 2 report.', 'info'); }, { hours: 2, label: 'SOC 2 bridge letter' }));
    on(root, 'click', '[data-pilot]', (e, el) => {
      const type = el.dataset.pilot;
      ctx.act((st) => {
        const r = proposePilot(st, openDealFor(st, co.id), { type });
        toast(r.ok ? `They said yes: ${SALES.pilot[type].label.toLowerCase()} started.` : 'Not now, they said.', r.ok ? 'good' : 'warn');
      }, { hours: type === 'paid_pilot' ? 1 : 0.5, label: 'Pilot proposal' });
    });
    on(root, 'click', '[data-questionnaire]', () => ctx.act((st) => {
      const d = openDealFor(st, co.id);
      const a = addAsk(st, { kind: 'security_questionnaire', target: 'deal', refId: d.id, companyId: co.id, dueDay: Math.max(st.day + 14, (d.decisionDay ?? st.day) - 3) });
      if (a) d.security.askId = a.id;
      ctx.navigate('success', 'asks');
    }, { hours: 0.1, label: 'Security questionnaire' }));
    on(root, 'click', '[data-followup]', () => ctx.act((st) => {
      // A follow-up needs the prospect's yes. Odds depend on what the last call earned.
      const d = openDealFor(st, co.id);
      const ct = contactById(st, d.contactId);
      const last = ensureCalls(st).meetings.filter((m) => m.dealId === d.id && m.status === 'held').at(-1);
      let p = last?.scorecard?.nextStepSecured ? 0.85 : 0.15;
      if (['qualified', 'proposal', 'contract'].includes(d.stage)) p = Math.max(p, 0.6);
      if (last && !last.qualified && !['qualified', 'proposal', 'contract'].includes(d.stage)) p *= 0.6;
      p *= Math.pow(0.5, ct?.unansweredAsks ?? 0);
      if (!chance(st, p)) {
        if (ct) ct.unansweredAsks = (ct.unansweredAsks ?? 0) + 1;
        addActivity(st, { type: 'email', text: 'Asked for a follow-up call: no reply', dealId: d.id, companyId: co.id });
        toast('No reply to your follow-up request.', 'warn');
        return;
      }
      const slot = nextSlot(st, { minLead: 2, duration: st.company.model === 'ent' ? 45 : 30, seed: d.contactId });
      if (!slot) throw new Error('No free slot on your calendar in the next 30 days.');
      const m = createMeeting(st, { contactId: d.contactId, slot, kind: 'follow_up', source: d.source === 'ai_sdr' ? 'ai_sdr' : 'outbound', duration: st.company.model === 'ent' ? 45 : 30 });
      m.noShowP *= 0.6; // they already engaged
      if (ct) ct.unansweredAsks = 0;
      toast(`They agreed: follow-up call ${slotText(st, slot)}`, 'good');
    }, { hours: HOURS.followUp, label: 'Follow-up email' }));
  },
};
