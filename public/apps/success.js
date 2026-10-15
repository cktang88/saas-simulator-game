// Customer success (Gainsight/Vitally/ChurnZero-lite) for B2B: account health per CRM customer, the annual
// renewal pipeline (T−90/60/30), renewal negotiations as a live call with the customer, expansion, champion
// turnover, QBRs on the calendar, and enterprise procurement asks (security questionnaires, VPAT/ACR,
// EU data residency, localization). Research: docs/research/world-ops-support-life.md §7–8.
import { html, mount, on, formData, stat, badge, table, toast } from '../core/ui.js';
import { money, pct, fmtDate, clamp } from '../core/util.js';
import { fmtTime, completeEvent, ensureCalendar } from '../core/calendar.js';
import { hoursLeft } from '../core/state.js';
import { RENEWAL_PERSONA } from './sales/rubrics.js';
import { CS, healthBand, churnMultFromHealth, ASK_LABEL } from './success/model.js';
import {
  ensureSuccess, syncAccounts, successDay, subById, acvOf, proposeRenewal, acceptCounter, fmtTerms, pitchExpansion,
  workOnAsk, declineAsk, scheduleQbr, scheduleRenewalCall, runQbr, findNewChampion, followChampion, computeHealth, seatRoom,
  setSuccessPlan, startRenewalEarly, retentionStats,
} from './success/engine.js';
import { riskPanel, wireRisk, riskAccounts } from './retention/ui.js';
import { companyById, contactById, contactName, hasSoc2, hasDpa } from './sales/model.js';
import { personaFor } from './sales/replies.js';
import { personaSystem } from './sales/jobs.js';
import { competitionFor } from './sales/competition.js';
import { bizBlock } from './context.js';

const draft = {};
const H = { questionnaireChunk: 8, findChampion: 1.5, follow: 0.1, quote: 0.5, pitch: 0.5, postCall: 0.1 };
const tone = (h) => (h >= 70 ? 'good' : h >= 45 ? 'warn' : 'bad');
const nameOf = (s, acct) => companyById(s, acct.companyId)?.name ?? 'Customer';
const qbrPrepHours = (s) => (s.company.model === 'ent' ? CS.qbrPrepHours[1] - 1 : CS.qbrPrepHours[0]);

function accountsView(s, cs) {
  const rows = Object.values(cs.accounts).filter((a) => !a.closed).sort((a, b) => (a.health ?? 0) - (b.health ?? 0));
  const closed = Object.values(cs.accounts).filter((a) => a.closed);
  const arr = rows.reduce((x, a) => x + acvOf(subById(s, a.subId) ?? { price: 0 }), 0);
  const atRisk = rows.filter((a) => (a.health ?? 60) < 45);
  return html`
    <div class="stats">
      ${stat('Accounts', rows.length, `${money(arr)} ARR under management`)}
      ${stat('At risk', atRisk.length, money(atRisk.reduce((x, a) => x + acvOf(subById(s, a.subId)), 0)) + ' ARR', atRisk.length ? 'bad' : '')}
      ${stat('Renewals ≤90 days', rows.filter((a) => a.renewal && ['open', 'at_risk'].includes(a.renewal.status)).length)}
      ${stat('Churned', closed.length, 'accounts lost')}
      ${(() => { const r = retentionStats(s); return stat('GRR / NRR', r.grr == null ? '—' : `${Math.round(r.grr * 100)}% / ${Math.round(r.nrr * 100)}%`, r.grr == null ? 'after accounts have been with you a while' : `${r.windowDays}d · ${r.tier} (stellar GRR 92–95%)`, r.tier === 'mediocre' ? 'bad' : r.tier === 'stellar' ? 'good' : ''); })()}
    </div>
    <section class="panel">${table({
      rows, empty: 'No CRM customers yet. Accounts appear here when a CRM deal closes won.',
      rowAttrs: (a) => `class="clickable" data-acct="${a.subId}"`,
      columns: [
        { label: 'Account', render: (a) => html`<b>${nameOf(s, a)}</b><div class="small muted">${a.intl ? 'International' : 'US'} · since ${fmtDate(s, a.createdDay)}</div>` },
        { label: 'Health', render: (a) => badge(`${a.health ?? '—'} · ${healthBand(a.health ?? 0)}`, tone(a.health ?? 0)) },
        { label: 'ARR', align: 'right', render: (a) => money(acvOf(subById(s, a.subId))) },
        { label: 'Champion', render: (a) => badge(a.champion, a.champion === 'active' ? 'good' : a.champion === 'left' ? 'bad' : 'warn') },
        { label: 'Renewal', render: (a) => { const sub = subById(s, a.subId); return sub?.interval === 'year' ? html`${fmtDate(s, sub.currentPeriodEnd)} ${a.renewal ? badge(a.renewal.status.replace('_', ' '), a.renewal.status === 'committed' ? 'good' : a.renewal.status === 'open' ? 'accent' : 'bad') : ''}` : html`<span class="muted small">monthly</span>`; } },
        { label: 'Last QBR', render: (a) => (a.lastQbrDay == null ? html`<span class="muted small">never</span>` : fmtDate(s, a.lastQbrDay)) },
      ],
    })}
    <p class="hint">Health blends a usage proxy (product fit, open bugs), champion status, QBR cadence (quarterly above ${money(CS.qbrAboveAcv)} ACV), support responsiveness, open procurement asks, how recently you talked and whether there is a written success plan. It multiplies each account's churn odds (health 60 = baseline, 85 ≈ 0.6×, 35 ≈ 1.6×).</p></section>`;
}

function renewalsView(s, cs) {
  const subsYear = Object.values(cs.accounts).filter((a) => !a.closed && subById(s, a.subId)?.interval === 'year');
  const cols = [['>90 days', (d) => d > 90], ['≤90', (d) => d <= 90 && d > 60], ['≤60', (d) => d <= 60 && d > 30], ['≤30', (d) => d <= 30]];
  const past = Object.values(cs.accounts).flatMap((a) => (a.past ?? []).map((r) => ({ ...r, a })));
  return html`<section class="panel" style="padding:10px">
    <p class="small muted" style="margin:0 0 8px">Annual contracts: start the renewal conversation at T−90. Typical uplifts are 5–10%, usually negotiated down to ~5%; 70–90% of customers accept ≤7%, 50–70% accept 15%+ (CostBench, design ranges).</p>
    <div class="kanban">${cols.map(([label, f]) => {
      const list = subsYear.filter((a) => f(subById(s, a.subId).currentPeriodEnd - s.day));
      return html`<div class="col"><h4><span>${label} · ${list.length}</span><span>${money(list.reduce((x, a) => x + acvOf(subById(s, a.subId)), 0))}</span></h4>
        ${list.map((a) => html`<div class="card"><a href="#/success/acct:${a.subId}"><b>${nameOf(s, a)}</b></a><div class="small">${money(acvOf(subById(s, a.subId)))} · ${fmtDate(s, subById(s, a.subId).currentPeriodEnd)}</div>
          <div class="small">${badge(`health ${a.health}`, tone(a.health))} ${a.renewal ? badge(a.renewal.status.replace('_', ' '), a.renewal.status === 'committed' ? 'good' : a.renewal.status === 'open' ? 'accent' : 'bad') : ''}</div></div>`)}</div>`;
    })}</div></section>
    ${past.length ? html`<section class="panel"><h2>Past renewals</h2><ul class="list small">${past.map((r) => html`<li>${nameOf(s, r.a)} · ${r.status}${r.terms ? ` · ${fmtTerms(r.terms)}` : ''}</li>`)}</ul></section>` : ''}`;
}

function expansionView(s, cs) {
  const opps = Object.values(cs.accounts).filter((a) => !a.closed && a.expansion);
  return html`<section class="panel"><h2>Expansion</h2>
    <p class="small muted">Expansion comes from healthy accounts with a real need (new team, new hires). Pitching seats to an account with no need rarely works and costs goodwill.</p>
    ${opps.length ? html`<ul class="list">${opps.map((a) => html`<li><a href="#/success/acct:${a.subId}"><b>${nameOf(s, a)}</b></a> · ${a.expansion.reason} · +${a.expansion.seats} seat(s) ${badge(a.expansion.status, a.expansion.status === 'won' ? 'good' : a.expansion.status === 'open' ? 'accent' : 'bad')}</li>`)}</ul>` : html`<p class="empty">No expansion signals yet.</p>`}</section>`;
}

function asksView(s, cs) {
  const open = cs.asks.filter((a) => a.status === 'open').sort((a, b) => a.dueDay - b.dueDay);
  const done = cs.asks.filter((a) => a.status !== 'open').slice(-15).reverse();
  return html`
    <div class="stats">
      ${stat('SOC 2', hasSoc2(s) ? 'Report available' : 'None', hasSoc2(s) ? 'questionnaires shrink to ~1–2h' : 'first questionnaire 20–40h', hasSoc2(s) ? 'good' : 'warn')}
      ${stat('Answer library', cs.library ? 'Yes' : 'No', 'with a library: 2–8h per questionnaire')}
      ${stat('VPAT / ACR', cs.vpat ? `Since ${fmtDate(s, cs.vpat.day)}` : 'None', 'WCAG 2.1 AA conformance report')}
      ${stat('EU region', cs.euRegion ? 'Live' : 'No', cs.euRegion ? `${money(CS.euRegionMonthly)}/mo hosting` : '')}
      ${stat('DPA', hasDpa(s) ? 'Ready' : 'None', hasDpa(s) ? '' : 'set up in Legal')}
      ${stat('Languages', cs.languages.length ? cs.languages.join(', ') : 'English only')}
    </div>
    <section class="panel"><h2>Open procurement asks</h2>
      ${open.length ? html`<ul class="list">${open.map((a) => html`<li>
        <b>${ASK_LABEL[a.kind]}${a.language ? ` (${a.language})` : ''}</b> · ${companyById(s, a.companyId)?.name ?? ''} ${badge(a.target === 'deal' ? 'new deal' : 'renewal', 'accent')} <span class="small ${a.dueDay < s.day ? 'neg' : 'muted'}">due ${fmtDate(s, a.dueDay)}</span>
        <div class="meter" style="margin:6px 0"><div style="width:${Math.round(100 * clamp(a.progress / Math.max(0.01, a.hours), 0, 1))}%"></div></div>
        <div class="small muted">${a.progress}h of ~${a.hours}h${a.kind === 'vpat' && !cs.vpat ? ` · includes a ${money(CS.vpatAuditCost)} third-party audit, charged when you start` : ''}${a.kind === 'data_residency' && !cs.euRegion ? ` · adds ${money(CS.euRegionMonthly)}/mo hosting` : ''}</div>
        <div class="inline" style="margin-top:4px"><button class="sm primary" data-work="${a.id}">Work ${Math.min(H.questionnaireChunk, a.hours - a.progress).toFixed(a.hours - a.progress < 1 ? 2 : 0)}h on it</button><button class="sm danger" data-decline="${a.id}">Decline</button></div></li>`)}</ul>` : html`<p class="empty">No open asks.</p>`}
    </section>
    <div class="grid-2">
      <section class="panel"><h2>Why this matters</h2>
        <ul class="small">
          <li>Enterprise buyers send 150+ vendor assessments a year; 74% accept a pre-completed standard (SOC 2 report, CAIQ) instead of their own questionnaire.</li>
          <li>The European Accessibility Act's service obligations apply since ${CS.eaaDate} (WCAG-based EN 301 549) for EU consumer-facing services; microenterprises (&lt;10 staff and ≤€2M) are exempt. US enterprise and public buyers ask for a VPAT/ACR regardless.</li>
          <li>Undelivered or declined asks lower new-deal win odds and account health at renewal.</li>
        </ul></section>
      <section class="panel"><h2>Recently closed</h2>${done.length ? html`<ul class="list small">${done.map((a) => html`<li>${ASK_LABEL[a.kind]} · ${companyById(s, a.companyId)?.name ?? ''} · ${a.status}</li>`)}</ul>` : html`<p class="empty">None.</p>`}</section>
    </div>`;
}

function accountView(s, cs, acct) {
  const sub = subById(s, acct.subId);
  const co = companyById(s, acct.companyId) ?? {};
  const ct = contactById(s, acct.contactId);
  const r = acct.renewal;
  const qbrs = cs.qbrs.filter((q) => q.subId === acct.subId);
  const calls = cs.calls.filter((c) => c.subId === acct.subId);
  const asks = cs.asks.filter((a) => a.target === 'account' && a.refId === acct.subId);
  const upcomingQbr = qbrs.find((q) => q.status === 'scheduled');
  const upcomingCall = calls.find((c) => c.status === 'scheduled' || c.status === 'in_call');
  return html`
    <p><a href="#/success">← Accounts</a></p>
    ${acct.closed ? html`<div class="callout bad">Churned on ${fmtDate(s, acct.closedDay)} (${sub.cancelReason?.replace(/_/g, ' ') ?? 'canceled'}).</div>` : ''}
    <div class="app-head"><div><h1>${co.name}</h1><p>${money(acvOf(sub))}/yr · ${sub.interval === 'year' ? `annual, renews ${fmtDate(s, sub.currentPeriodEnd)}` : 'monthly'} · ${sub.quantity ?? 1} seat(s) · <a href="#/crm/company:${acct.companyId}">CRM →</a></p></div></div>
    <div class="stats">
      ${stat('Health', acct.health ?? '—', healthBand(acct.health ?? 0), tone(acct.health ?? 0))}
      ${stat('Usage (proxy)', pct(acct.usage ?? 0, 0), 'product fit, bugs, engagement')}
      ${stat('Churn odds', `×${churnMultFromHealth(acct.health ?? 60).toFixed(2)}`, 'vs a baseline account')}
      ${stat('Champion', acct.champion, ct ? contactName(ct) : '', acct.champion === 'active' ? 'good' : acct.champion === 'left' ? 'bad' : 'warn')}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Relationship</h2>
        ${acct.champion === 'left' || acct.champion === 'none' ? html`<div class="callout bad">No champion. Accounts without an internal owner churn quietly at renewal.</div>
          <button class="primary" data-findchamp>Meet the team, find a new champion (${H.findChampion}h)</button>` : ''}
        ${acct.formerChampion && !acct.formerChampion.followed ? html`<p class="small">${acct.formerChampion.name} moved to <b>${acct.formerChampion.newCompany}</b>. A former champion at a new company is one of the best outbound signals there is.</p><button data-follow>Reach out at their new company (6 min)</button>` : ''}
        <h3>QBRs ${acvOf(sub) >= CS.qbrAboveAcv ? '(quarterly expected at this ACV)' : '(optional at this ACV)'}</h3>
        ${upcomingQbr ? html`<p>Next QBR: <a href="#/success/${upcomingQbr.id}">${fmtDate(s, upcomingQbr.day)} ${fmtTime(upcomingQbr.start)}</a> ${upcomingQbr.prepped ? badge('prepped', 'good') : html`<button class="sm" data-prep="${upcomingQbr.id}">Prepare deck & usage data (${qbrPrepHours(s)}h)</button>`}</p>` : html`<button data-qbr>Schedule QBR (60 min on your calendar)</button>`}
        <ul class="list small">${qbrs.filter((q) => q.status !== 'scheduled').map((q) => html`<li>${fmtDate(s, q.day)} · ${q.status}${q.notes?.length ? ` · ${q.notes[0]}` : ''}</li>`)}</ul>
        <h3>Success plan</h3>
        ${acct.plan?.valid ? html`<p class="small"><b>${acct.plan.metric}</b> → ${acct.plan.target} by ${fmtDate(s, acct.plan.dueDay)} ${badge(acct.plan.status.replace('_', ' '), acct.plan.status === 'achieved' ? 'good' : acct.plan.status === 'missed' ? 'bad' : 'accent')}</p>` : acct.plan ? html`<div class="callout warn small">Not a real plan yet: ${acct.plan.issues.join(' ')}</div>` : html`<p class="small muted">No written success metric. Stellar operators agree one (a number and a date) in the first 30 days.</p>`}
        <form id="planForm" class="inline" style="flex-wrap:wrap"><label>Outcome <input name="metric" maxlength="160" placeholder="month-end close time for the finance team" /></label><label>Target <input name="target" maxlength="80" placeholder="from 8 days to 3 days" /></label><label style="max-width:120px">Days <input type="number" name="dueDays" min="14" max="200" value="90" /></label><button class="sm">Agree plan (30 min)</button></form>
        <h3>Expansion</h3>
        ${acct.expansion?.status === 'open' ? html`<p class="pos small">Signal: ${acct.expansion.reason} (+${acct.expansion.seats} seats).</p>` : html`<p class="small muted">No expansion signal right now.</p>`}
        <p class="small muted">${sub.quantity ?? 1} of ~${seatRoom(s, acct, sub).employees} employees have seats.</p>
        ${sub.interval === 'year' && !acct.closed && sub.currentPeriodEnd - s.day <= 150 && (!r || r.startedLeft == null) ? html`<p><button data-earlyrenew>Start the renewal conversation now (${sub.currentPeriodEnd - s.day} days out, 30 min)</button> <span class="small muted">Starting 90–120 days out with usage data renews more often than waiting for the T−90 reminder.</span></p>` : ''}
        <form id="pitchForm" class="inline"><label style="max-width:140px">Add seats <input type="number" name="seats" min="1" max="${Math.max(1, seatRoom(s, acct, sub).room)}" value="${acct.expansion?.seats ?? 1}" /></label><button class="sm">Pitch expansion (30 min)</button></form>
      </section>
      <section class="panel"><h2>Renewal</h2>
        ${acct.closed ? html`<p class="muted">No renewal: the subscription ended.</p>` : sub.interval !== 'year' ? html`<p class="muted">Monthly plan: no renewal event; health drives month-to-month churn.</p>`
          : !r ? html`<p class="muted">The renewal opens 90 days before ${fmtDate(s, sub.currentPeriodEnd)}.</p>`
            : html`<p>${badge(r.status.replace('_', ' '), r.status === 'committed' ? 'good' : r.status === 'open' ? 'accent' : 'bad')} ${r.terms ? fmtTerms(r.terms) : ''} · ${sub.currentPeriodEnd - s.day} days left</p>
              ${r.offers.length ? html`<ul class="list small">${r.offers.map((o) => html`<li>${fmtDate(s, o.day)} · ${fmtTerms(o)} · ${o.viaCall ? 'on a call' : 'by email'} → <b>${o.decision}</b></li>`)}</ul>` : ''}
              ${r.competitorOffer ? html`<div class="callout bad"><b>${r.competitorOffer.name}</b> offered them ${Math.round(r.competitorOffer.discountPct * 100)}% off to switch. Terms without a real concession lose more of these.</div>` : ''}
              ${r.counter ? html`<div class="callout warn">They countered: <b>${r.counter.text}</b> (${fmtTerms(r.counter)}). <button class="sm primary" data-acceptcounter>Accept counter</button> <span class="small muted">or hold firm with the form below (riskier).</span></div>` : ''}
              ${['open', 'at_risk'].includes(r.status) ? html`
                ${upcomingCall ? html`<p>Renewal call: <a href="#/success/${upcomingCall.id}">${fmtDate(s, upcomingCall.day)} ${fmtTime(upcomingCall.start)}</a></p>` : html`<button class="primary" data-rncall>Schedule a renewal call (45 min)</button>`}
                <form id="quoteForm"><div class="grid-3">
                  <label>Uplift % <input type="number" name="uplift" min="0" max="40" value="${r.counter ? Math.round(r.counter.upliftPct * 100) : 5}" /></label>
                  <label>Discount % <input type="number" name="discount" min="0" max="40" value="${r.counter ? Math.round(r.counter.discountPct * 100) : 0}" /></label>
                  <label>Term <select name="years">${[1, 2, 3].map((y) => html`<option value="${y}">${y} year${y > 1 ? 's' : ''}</option>`)}</select></label></div>
                  <button class="sm">Send renewal quote by email (30 min)</button> <span class="hint">On a call the odds are better than by email.</span></form>` : ''}`}
        ${asks.length ? html`<h3>Procurement asks</h3><ul class="list small">${asks.map((a) => html`<li>${ASK_LABEL[a.kind]} · ${a.status} <a href="#/success/asks">→</a></li>`)}</ul>` : ''}
      </section>
    </div>`;
}

function callView(s, cs, c, kind) {
  const acct = cs.accounts[c.subId];
  const header = html`<p><a href="#/success/acct:${c.subId}">← ${acct ? nameOf(s, acct) : 'Account'}</a></p>
    <div class="app-head"><div><h1>${kind === 'qbr' ? 'QBR' : 'Renewal call'} · ${acct ? nameOf(s, acct) : ''}</h1><p>${fmtDate(s, c.day)} · ${fmtTime(c.start)} · ${badge(c.status.replace('_', ' '), c.status === 'held' ? 'good' : c.status === 'missed' ? 'bad' : 'accent')}</p></div></div>`;
  const today = c.day === s.day;
  if (kind === 'qbr') {
    if (c.status === 'scheduled') return html`${header}<section class="panel"><h2>Agenda</h2>
      ${c.prepped ? '' : html`<p class="warn small">Not prepared. <button class="sm" data-prep="${c.id}">Prepare deck & usage data (${qbrPrepHours(s)}h)</button></p>`}
      <form id="qbrForm"><label><input type="checkbox" name="roi" checked /> ROI review with their usage numbers</label>
        <label><input type="checkbox" name="roadmap" checked /> Their priorities and your roadmap</label>
        <label><input type="checkbox" name="expansion" /> Ask about other teams / more seats</label>
        <label><input type="checkbox" name="exec" /> Invite their exec sponsor</label>
        <button class="primary" ${today ? '' : 'disabled'}>${today ? 'Run QBR' : `Available on ${fmtDate(s, c.day)}`}</button></form></section>`;
    return html`${header}<section class="panel"><h2>Outcome</h2>${c.notes?.length ? html`<ul>${c.notes.map((n) => html`<li>${n}</li>`)}</ul>` : html`<p class="muted">${c.status}</p>`}</section>`;
  }
  const r = acct?.renewal;
  return html`${header}<div class="grid-2">
    <section class="panel"><h2>${c.status === 'in_call' ? '🔴 Live' : 'Transcript'}</h2>
      ${c.status === 'scheduled' ? html`<button class="primary" data-joincall ${today ? '' : 'disabled'}>${today ? 'Join call' : `Join on ${fmtDate(s, c.day)}`}</button>` : ''}
      <div class="chat" id="chat">${c.transcript.map((t) => html`<div class="msg ${t.from}">${t.text}</div>`)}</div>
      ${c.status === 'in_call' ? html`<form id="say" style="margin-top:8px"><textarea id="sayText" rows="3" placeholder="What do you say? (Enter to send)">${draft[c.id] ?? ''}</textarea>
        <div class="inline"><button class="primary">Say it</button><button type="button" class="danger" data-endcall>End call</button></div></form>` : ''}
    </section>
    <section class="panel"><h2>Terms</h2>
      ${r ? html`<p>${badge(r.status.replace('_', ' '), r.status === 'committed' ? 'good' : 'accent')} ${r.terms ? fmtTerms(r.terms) : ''}</p>
        ${r.counter ? html`<div class="callout warn">Their counter: <b>${r.counter.text}</b>. <button class="sm primary" data-acceptcounter>Accept</button></div>` : ''}
        ${c.status === 'in_call' && ['open', 'at_risk'].includes(r.status) ? html`<form id="termsForm"><div class="grid-3">
          <label>Uplift % <input type="number" name="uplift" min="0" max="40" value="5" /></label>
          <label>Discount % <input type="number" name="discount" min="0" max="40" value="0" /></label>
          <label>Term <select name="years">${[1, 2, 3].map((y) => html`<option value="${y}">${y}y</option>`)}</select></label></div>
          <button class="sm primary">Put terms on the table</button></form>` : ''}` : html`<p class="muted">No open renewal.</p>`}
      ${acct ? html`<p class="small muted">Health ${acct.health} · usage ${pct(acct.usage ?? 0, 0)} · champion ${acct.champion}. They know your product's open bugs and how responsive support has been.</p>` : ''}
    </section></div>`;
}

function custComp(s, acct) {
  const comp = competitionFor(s, { audience: 'customer', seed: acct.subId });
  const offer = acct.renewal?.competitorOffer;
  return `${comp.brief ? `\nAlternatives you know: ${comp.brief} Only mention tools listed here.` : '\nYou do not know other vendors by name; do not invent any.'}${offer ? `\n${offer.name} recently offered you ${Math.round(offer.discountPct * 100)}% off to switch. Use it as leverage ("${offer.name} offered us ${Math.round(offer.discountPct * 100)}% off").` : ''}`;
}

async function customerSays(ctx, c, text, decision = null) {
  const s = ctx.state;
  const acct = ensureSuccess(s).accounts[c.subId];
  const ct = contactById(s, acct.contactId) ?? { email: `${acct.companyId}@x.com`, name: 'Their buyer', title: 'Head of Operations' };
  const co = companyById(s, acct.companyId) ?? {};
  const persona = personaFor(s, ct, co);
  const sub = subById(s, acct.subId);
  c.transcript.push({ from: 'me', text });
  const history = c.transcript.slice(-14).map((t) => `${t.from === 'me' ? s.founder.name : persona.name}: ${t.text}`).join('\n');
  const brief = decision === 'accept' ? 'You ACCEPT these terms. Say so plainly.'
    : decision === 'counter' ? `You do NOT accept as proposed. Counter with: ${acct.renewal.counter.text}.`
      : decision === 'walk' ? 'You will NOT renew on these terms and will evaluate alternatives. Say so politely but firmly.'
        : 'Respond naturally. Do not agree to any price change unless terms are formally put on the table.';
  const fallback = () => ({ reply: decision === 'accept' ? 'OK, that works. Send the paperwork.' : decision === 'counter' ? `We can't do that as is. ${acct.renewal.counter.text[0].toUpperCase() + acct.renewal.counter.text.slice(1)} and we'll sign.` : decision === 'walk' ? "Honestly we're going to look at alternatives before we commit again." : acct.renewal?.competitorOffer ? `${acct.renewal.competitorOffer.name} offered us ${Math.round(acct.renewal.competitorOffer.discountPct * 100)}% off to switch. Give me a reason to stay.` : (acct.health ?? 60) < 50 ? `Usage has been patchy on our side${(s.apps.product?.bugs ?? []).some((b) => !b.fixedDay) ? ' and the bugs haven\'t helped' : ''}. I need to justify this spend.` : 'It\'s been working for the team. Budget is tight this year though.' });
  const res = await ctx.llm.ask({
    task: 'renewal_negotiation', context: bizBlock(ctx.state, 'customer'),
    system: `${personaSystem(s, ct, co, persona)}\n${RENEWAL_PERSONA}\nYou are now an existing CUSTOMER at renewal time. Contract: $${acvOf(sub)}/year, ${sub.quantity ?? 1} seats. Your team's real usage: ${pct(acct.usage ?? 0, 0)} of what you bought. Relationship health: ${acct.health}/100${acct.champion === 'left' ? '; the person who bought it has left and you inherited it' : ''}. Procurement expects a discount; 5–10% uplifts are normal asks, 15%+ feels aggressive.${custComp(s, acct)}`,
    prompt: `Call so far:\n${history}\n\n${brief}\nReply in 1-3 sentences, in character. JSON {"reply": "..."}`,
    schema: { type: 'object', additionalProperties: false, required: ['reply'], properties: { reply: { type: 'string' } } },
    temperature: 0.8, maxTokens: 250, fallback,
  });
  c.transcript.push({ from: 'them', text: String(res.data?.reply ?? fallback().reply) });
}

export default {
  id: 'success',
  title: 'Customer success',
  icon: '🤝',
  group: 'Sales',
  models: ['smb', 'ent'],
  badge: (s) => {
    const cs = s.apps.success;
    if (!cs) return 0;
    return cs.asks.filter((a) => a.status === 'open').length + Object.values(cs.accounts).filter((a) => !a.closed && a.renewal && ['open', 'at_risk'].includes(a.renewal.status) && a.renewal.window <= 30).length + cs.qbrs.filter((q) => q.status === 'scheduled' && q.day === s.day).length;
  },
  onDay(state) { successDay(state); },
  render(root, ctx) {
    const s = ctx.state;
    const cs = syncAccounts(s);
    for (const a of Object.values(cs.accounts)) if (a.health == null && !a.closed) computeHealth(s, a);
    const p = ctx.params;
    const [tab0, id] = p.split(':');
    const qbr = cs.qbrs.find((q) => q.id === p);
    const call = cs.calls.find((c) => c.id === p);
    const acct = tab0 === 'acct' ? cs.accounts[id] : null;
    const tab = tab0 || 'accounts';
    const openAsks = cs.asks.filter((a) => a.status === 'open').length;
    const nRisk = riskAccounts(s, { crm: true }).length;
    const tabs = [['accounts', 'Accounts'], ['signals', `Churn signals${nRisk ? ` (${nRisk})` : ''}`], ['renewals', 'Renewals'], ['expansion', 'Expansion'], ['asks', `Procurement asks${openAsks ? ` (${openAsks})` : ''}`]];
    const body = qbr ? callView(s, cs, qbr, 'qbr') : call ? callView(s, cs, call, 'renewal') : acct ? accountView(s, cs, acct)
      : tab === 'signals' ? riskPanel(s, { crm: true, title: 'Churn signals on your accounts' }) : tab === 'renewals' ? renewalsView(s, cs) : tab === 'expansion' ? expansionView(s, cs) : tab === 'asks' ? asksView(s, cs) : accountsView(s, cs);
    mount(root, html`
      ${qbr || call || acct ? '' : html`<div class="app-head"><div><h1>Customer success</h1><p>Keep the customers you closed: watch account health, run QBRs, start renewals 90 days out, expand healthy accounts, and get through procurement's security, accessibility and data-residency asks.</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => html`<a href="#/success/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>`}
      ${body}`);
    const chat = root.querySelector('#chat');
    if (chat) chat.scrollTop = chat.scrollHeight;

    on(root, 'click', '[data-acct]', (e, el) => ctx.navigate('success', `acct:${el.dataset.acct}`));
    wireRisk(root, ctx);
    if (acct) {
      on(root, 'submit', '#planForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { const pl = setSuccessPlan(st, acct, f); toast(pl.valid ? 'Success plan agreed.' : `Not specific enough: ${pl.issues[0]}`, pl.valid ? 'good' : 'warn'); }, { hours: 0.5, label: 'Success plan' }); });
      on(root, 'click', '[data-earlyrenew]', () => ctx.act((st) => { startRenewalEarly(st, acct); toast('Renewal conversation started. Bring usage numbers.', 'good'); }, { hours: 0.5, label: 'Renewal' }));
    }
    on(root, 'click', '[data-work]', (e, el) => {
      const a = cs.asks.find((x) => x.id === el.dataset.work);
      const h = Math.min(H.questionnaireChunk, Math.max(0.05, a.hours - a.progress), hoursLeft(s));
      if (h <= 0.01) return toast('No hours left this week.', 'warn');
      ctx.act((st) => { if (workOnAsk(st, a, h)) toast(`Delivered: ${ASK_LABEL[a.kind]}.`, 'good'); }, { hours: h, label: ASK_LABEL[a.kind] });
    });
    on(root, 'click', '[data-decline]', (e, el) => ctx.act((st) => declineAsk(st, cs.asks.find((x) => x.id === el.dataset.decline)), { hours: 0.05, label: 'Procurement' }));
    on(root, 'click', '[data-prep]', (e, el) => ctx.act(() => { cs.qbrs.find((q) => q.id === el.dataset.prep).prepped = true; }, { hours: qbrPrepHours(s), label: 'QBR prep' }));
    on(root, 'click', '[data-acceptcounter]', () => ctx.act((st) => acceptCounter(st, acct ?? cs.accounts[(qbr ?? call).subId]), { hours: 0.05, label: 'Renewal' }));

    if (acct) {
      on(root, 'click', '[data-findchamp]', () => ctx.act((st) => toast(findNewChampion(st, acct) ? 'Found someone who cares. Build the relationship (a QBR helps).' : 'Nobody wants to own it yet. Try again in a few weeks.', 'info'), { hours: H.findChampion, label: 'Customer success' }));
      on(root, 'click', '[data-follow]', () => ctx.act((st) => { if (followChampion(st, acct)) toast('Added to CRM inbound triage.', 'good'); }, { hours: H.follow, label: 'Prospecting' }));
      on(root, 'click', '[data-qbr]', () => ctx.act((st) => { const q = scheduleQbr(st, acct); toast(`QBR on ${fmtDate(st, q.day)} at ${fmtTime(q.start)}.`, 'good'); }, { hours: 0.05, label: 'Scheduling' }));
      on(root, 'click', '[data-rncall]', () => ctx.act((st) => { const c = scheduleRenewalCall(st, acct); toast(`Renewal call on ${fmtDate(st, c.day)} at ${fmtTime(c.start)}.`, 'good'); }, { hours: 0.05, label: 'Scheduling' }));
      on(root, 'submit', '#pitchForm', (e) => {
        e.preventDefault();
        const seats = Math.max(1, Math.round(formData(e.target).seats ?? 1));
        ctx.act((st) => { const r = pitchExpansion(st, acct, seats); toast(r.ok ? `They added ${seats} seat(s).` : 'Not now, they said.', r.ok ? 'good' : 'warn'); }, { hours: H.pitch, label: 'Expansion' });
      });
      on(root, 'submit', '#quoteForm', (e) => {
        e.preventDefault();
        const f = formData(e.target);
        ctx.act((st) => {
          const r = proposeRenewal(st, acct, { upliftPct: (f.uplift ?? 0) / 100, discountPct: (f.discount ?? 0) / 100, years: Number(f.years) || 1, viaCall: false });
          toast(r.decision === 'accept' ? 'They signed.' : r.decision === 'counter' ? `They countered: ${r.counter.text}.` : 'They are looking at alternatives.', r.decision === 'accept' ? 'good' : 'warn');
        }, { hours: H.quote, label: 'Renewal' });
      });
    }
    const c = call;
    if (c) {
      const ev = () => ensureCalendar(s).events.find((x) => x.id === c.eventId);
      on(root, 'click', '[data-joincall]', () => ctx.act((st) => { c.status = 'in_call'; if (ev()) completeEvent(st, ev().id, 'in_progress'); }));
      const send = () => {
        const ta = root.querySelector('#sayText');
        const text = ta.value.trim();
        if (!text) return;
        draft[c.id] = '';
        ta.disabled = true;
        ctx.act(() => customerSays(ctx, c, text));
      };
      on(root, 'input', '#sayText', (e) => { draft[c.id] = e.target.value; });
      on(root, 'keydown', '#sayText', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
      on(root, 'submit', '#say', (e) => { e.preventDefault(); send(); });
      on(root, 'submit', '#termsForm', (e) => {
        e.preventDefault();
        const f = formData(e.target);
        const terms = { upliftPct: (f.uplift ?? 0) / 100, discountPct: (f.discount ?? 0) / 100, years: Number(f.years) || 1 };
        ctx.act(async (st) => {
          const r = proposeRenewal(st, cs.accounts[c.subId], { ...terms, viaCall: true, transcript: c.transcript });
          await customerSays(ctx, c, `Here's what I'm proposing for the renewal: ${fmtTerms(terms)}.`, r.decision);
        });
      });
      on(root, 'click', '[data-endcall]', () => ctx.act((st) => {
        const a = cs.accounts[c.subId];
        // A call where you barely spoke doesn't count as a touch; it reads as careless.
        if (c.transcript.filter((t) => t.from === 'me').length < 2) {
          c.status = 'abandoned';
          if (ev()) completeEvent(st, ev().id, 'done', 'abandoned');
          if (a) a.drift -= 0.03;
          return;
        }
        c.status = 'held';
        if (ev()) completeEvent(st, ev().id, 'done');
        if (a) { a.lastTouchDay = st.day; a.drift += c.transcript.length >= 4 ? 0.02 : 0; }
      }, { hours: H.postCall, label: 'Post-call notes' }));
    }
    if (qbr) {
      on(root, 'submit', '#qbrForm', (e) => {
        e.preventDefault();
        const f = formData(e.target);
        ctx.act((st) => { runQbr(st, qbr, f); });
      });
    }
  },
};
