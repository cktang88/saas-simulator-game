// People ops UI: offer negotiation panel (candidate page), Onboarding, Benefits & time off, Workplace. Rendering and event
// wiring only; the actions live in negotiation.js, onboarding.js, benefits.js, absence.js and workplace.js. Every action
// charges founder hours through ctx.act.

import { html, on, formData, badge, stat } from '../../core/ui.js';
import { money, fmtDate, isoDate, round2 } from '../../core/util.js';
import { fmtTime } from '../../core/calendar.js';
import { ROLES } from './catalog.js';
import { NEG, ONB, KFF, QSEHRA, PEO, K401, STIPENDS, HEALTH_MODES, CITIES, COWORK, LEASE, OFFSITE, STATE_SICK, EOR_LEAVE, ABS, premiumTotals, DENTAL_VISION } from './ops-data.js';
import { ensureOps, humansOf } from './ops-state.js';
import { negotiationPanel as engineNegotiationPanel, wireNegotiation } from '../negotiate-view.js';
import { negotiationForCandidate } from '../negotiate/hiring.js';
import { acceptCounter, counterBack, presentMenu, addSignOn, setDeadline, walkAway, raiseSalary, payLawExposure, hasPayRange, seniorityOf } from './negotiation.js';
import { ITEM_LABEL, onboardingQuality, openItems, sendWelcome, orderEquipment, provisionAccounts, completeI9, assignBuddy, scheduleOnboardingMeetings, revokeAccess, earlyExitP90, rampMult, collectCiiaa, CIIAA_HOURS } from './onboarding.js';
import { setBenefits, benefitCostSummary, ptoLiability, ptoBalance, packageFor, healthStatus, sickMandate, workStateOf, activePolicy } from './benefits.js';
import { approveRequest, denyRequest, setCoverage, outNow, pendingRequests, upcoming, roleCoverage, coverageMitigation, isAway } from './absence.js';
import { setWorkplace, signLease, exitLease, renewLease, holdOffsite, offsiteHours, workplaceCost, headsFor, leaseTerms, coworkPrice, sqftFor, remainingMonths, poolMult, jobMode, isolationDrain } from './workplace.js';

export const odraft = { menu: {}, counter: {}, lease: { sqft: null, termYears: 3, buildOut: 'light', guarantee: 'personal', city: 'austin' }, equip: {} };
const dayFromIso = (s, iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(s.startDate + 'T12:00:00Z')) / 86400000);
const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const sel = (a, b) => (a === b ? 'selected' : '');
const tone = (q) => (q >= 0.75 ? 'good' : q >= 0.45 ? 'warn' : 'bad');
const meter = (v, t = '') => html`<div class="meter ${t}"><span style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></span></div>`;

// ---------------------------------------------------------------------------
// Pay transparency note under the job form
// ---------------------------------------------------------------------------
export function payLawNote(s, d) {
  const job = { region: d.region, remote: d.remote !== false, payLo: Number(d.payLo) || 0, payHi: Number(d.payHi) || 0, payTransparency: false, title: d.title || 'this role' };
  if (hasPayRange(job)) return '';
  const exp = payLawExposure(s, job);
  if (!exp.length) return '';
  return html`<div class="callout warn small"><b>Pay transparency:</b> a post without a salary range is a violation where ${exp.map((x) => x.label).join(', ')} applies. Fines are roughly $100-$10,000 per violation, and Washington has seen hundreds of class actions. Fill in the pay range above, and put it in the ad text. <span class="muted">[secondary sources; check your state agency]</span></div>`;
}

// ---------------------------------------------------------------------------
// Negotiation panel (candidate page, offer stage)
// ---------------------------------------------------------------------------
export function negotiationPanel(s, p, c) {
  if (c.stage !== 'offer') return '';
  const o = c.offer;
  const n = c.negotiation ?? { status: 'none', history: [] };
  const contractor = c.engagement === 'contractor';
  const k = contractor ? 'hourlyRate' : 'salary';
  const fmt = (v) => (contractor ? `$${v}/h` : usd(v));
  const w = n.counter?.want ?? {};
  const countered = n.status === 'countered';
  const od = (odraft.counter[c.id] ??= {});
  const base = contractor ? o.hourlyRate : o.salary;
  const ask = o.expectation ?? c.expectation;
  const cashHeavy = { label: 'Cash-heavy', salary: w[k] ?? Math.round(ask), equityPct: round2(Math.max(0, (o.equityPct ?? 0) * 0.5)), signOn: 0 };
  const equityHeavy = { label: 'Equity-heavy', salary: Math.round(((w[k] ?? ask) * 0.92) / (contractor ? 1 : 500)) * (contractor ? 1 : 500), equityPct: round2((o.equityPct ?? 0) + (w.equityPct ?? 0.2) + 0.15), signOn: 0 };
  const balanced = { label: 'Balanced', salary: Math.round(((w[k] ?? ask) * 0.97) / (contractor ? 1 : 500)) * (contractor ? 1 : 500), equityPct: round2(w.equityPct ?? o.equityPct ?? 0), signOn: contractor ? 0 : 2500 };
  const menu = odraft.menu[c.id] ?? [cashHeavy, balanced, equityHeavy];
  const hrs = NEG.hours;
  const eng = negotiationForCandidate(s, c);
  const engOpen = eng?.status === 'open';
  const engBox = eng ? engineNegotiationPanel({ state: s }, eng.id)
    : html`<div class="card"><h3>Negotiate (multi-round)</h3><p class="small muted">Open a real back-and-forth with ${c.name}: several issues at once (base, equity, sign-on, start date, remote), your own alternatives to prepare, and a debrief of what a stellar negotiator would have done. Costs more of your hours than the quick buttons below, and the offer stays frozen while it runs. If they walk, they decline.</p>
      <button class="primary" data-neg-start="hiring:${c.id}">Negotiate (multi-round)</button></div>`;
  if (engOpen) return html`<section class="panel"><h2>Negotiation ${badge('multi-round in progress', 'accent')}</h2>${engBox}</section>`;
  return html`<section class="panel">
    <h2>Negotiation ${badge(countered ? 'countered: your move' : n.status === 'responded' ? 'waiting for their answer' : 'offer out', countered ? 'warn' : '')}</h2>
    <p class="small">Your offer: <b>${fmt(base)}</b>${o.equityPct ? ` + ${o.equityPct}% options` : ''}${o.signOn ? ` + ${usd(o.signOn)} sign-on` : ''}, start ${fmtDate(s, o.startDay)}${o.deadlineDays ? html` · <b>expires ${fmtDate(s, o.deadlineDay)}</b>` : ''}. Their ask on the screen: ${fmt(ask)}${base < ask * 0.92 ? html` <span class="neg">(you are ${Math.round((1 - base / ask) * 100)}% under: expect a counter, and a hire who stays a shorter time)</span>` : ''}.</p>
    ${engBox}
    ${countered ? html`<div class="callout warn">
      <b>${c.name} countered:</b> ${w[k] ? `base ${fmt(w[k])}` : ''}${w.equityPct ? `, ${w.equityPct}% equity` : ''}${w.signOn ? `, ${usd(w.signOn)} sign-on` : ''}${w.startDay ? `, start ${fmtDate(s, w.startDay)}` : ''}${w.remote ? ', remote flexibility' : ''}.
      ${n.competing ? html`<br><span class="small">They mentioned another conversation in progress.</span>` : ''}
      <br><span class="small">They will not wait past ${fmtDate(s, n.counterDay + NEG.expireDays)}. Counters average +${Math.round(NEG.gain[seniorityOf(c)] * 100)}% of compensation for this level (Levels.fyi 2024, UCLA Anderson) [sourced].</span>
      <div class="inline" style="margin-top:6px"><button class="primary sm" data-neg-accept="${c.id}">Accept their counter (${hrs.accept}h)</button><button class="sm danger" data-neg-walk="${c.id}">Walk away (${hrs.walk}h)</button></div>
    </div>
    <h3>Counter back (${hrs.counter}h)</h3>
    <form class="negForm" data-neg-counter="${c.id}">
      <div class="grid-2">
        <label>${contractor ? 'Hourly rate' : 'Base salary'} <input type="number" name="pay" value="${od.pay ?? base}" min="1" /></label>
        ${contractor ? '' : html`<label>Options (%) <input type="number" step="0.05" name="equityPct" value="${od.equityPct ?? o.equityPct ?? 0}" min="0" max="5" /></label><label>Sign-on ($, one time) <input type="number" name="signOn" value="${od.signOn ?? o.signOn ?? 0}" min="0" step="500" /></label>`}
        <label>Start date <input type="date" name="start" value="${isoDate(s, od.startDay ?? o.startDay)}" /></label>
        <label class="small"><input type="checkbox" name="remote" ${od.remote ? 'checked' : ''} /> Remote flexibility</label>
      </div>
      <button class="sm">Send counter (${hrs.counter}h)</button> <span class="hint">Round ${n.round} of ${NEG.maxRounds}. A third round with someone who already named a number reads as haggling.</span>
    </form>
    ${contractor ? '' : html`<h3>Equity vs cash menu (${hrs.menu}h)</h3>
    <form class="negForm" data-neg-menu="${c.id}">
      <table class="table small"><thead><tr><th>Package</th><th>Base</th><th>Options %</th><th>Sign-on</th></tr></thead><tbody>
        ${menu.map((x, i) => html`<tr><td><input name="l${i}" value="${x.label}" maxlength="24" /></td><td><input type="number" name="s${i}" value="${x.salary}" /></td><td><input type="number" step="0.05" name="e${i}" value="${x.equityPct}" /></td><td><input type="number" step="500" name="g${i}" value="${x.signOn}" /></td></tr>`)}
      </tbody></table>
      <button class="sm">Offer the menu (${hrs.menu}h)</button> <span class="hint">People pick what is worth most to them (a risk-averse family picks cash; an equity-minded builder picks equity). Offering a choice lifts acceptance a little, but you do not control which one you pay for.</span>
    </form>`}
    <h3>Add a sign-on (${hrs.signOn}h)</h3>
    <form class="negForm" data-neg-signon="${c.id}"><div class="inline"><input type="number" name="amt" value="${w.signOn ?? 2500}" step="500" min="0" /><button class="sm" ${contractor ? 'disabled' : ''}>Add sign-on</button></div><span class="hint">Counts about half as much as the same amount of base to a candidate, but it is one-time cash, not a raise for everyone else to hear about.</span></form>` : ''}
    <h3>Deadline (${hrs.deadline}h)</h3>
    <form class="negForm inline" data-neg-deadline="${c.id}"><select name="days">${[1, 2, 3, 5, 7, 10, 14].map((d) => html`<option value="${d}" ${sel(d, o.deadlineDays ?? 7)}>${d} day${d > 1 ? 's' : ''}</option>`)}</select><button class="sm">${o.deadlineDays ? 'Change deadline' : 'Set exploding deadline'}</button>
      <span class="hint">Short deadlines can help when they have no alternatives, but a candidate who holds another offer usually walks (lab games punish exploding offers; no field acceptance rate exists) [sourced]. Under ${NEG.explode.minDays} days is a pressure tactic.</span></form>
    ${!countered ? html`<p class="inline"><button class="sm danger" data-neg-walk="${c.id}">Withdraw the offer</button></p>` : ''}
    ${n.history?.length ? html`<details><summary class="small muted">Negotiation log</summary><ul class="list small">${n.history.map((h) => html`<li>${fmtDate(s, h.day)} · ${h.kind}${h.want ? ` · ${Object.entries(h.want).map(([a, b]) => `${a} ${b}`).join(', ')}` : ''}${h.sat != null ? ` · satisfaction ${Math.round(h.sat * 100)}%` : ''}</li>`)}</ul></details>` : ''}
  </section>`;
}

// ---------------------------------------------------------------------------
// Onboarding tab
// ---------------------------------------------------------------------------
export function onboardingView(s, p) {
  const ops = ensureOps(s);
  const list = humansOf(p).filter((m) => m.onboarding && (m.status === 'offer' || (m.status === 'active' && s.day - m.startDay < 100)));
  const exits = ops.offboard.filter((x) => !x.revoked || s.day - x.exitDay < 30);
  return html`
    <div class="callout small"><b>Why this matters:</b> about a quarter to a third of new hires leave within 90 days when onboarding is "here is the Slack channel" (Jobvite 2018 ~28%, blogs ~33% [secondary, dated]). In the game a full checklist cuts that risk to about ${Math.round(ONB.earlyExit90.structured * 100)}% and shortens ramp ~20% [design]; engineers who use AI tools daily reach their 10th pull request in 49 days vs 91 [sourced, DX].</div>
    ${list.length ? list.map((m) => onboardCard(s, p, m)) : html`<section class="panel"><p class="muted">Nobody is in preboarding or their first 90 days. When a candidate accepts, their checklist appears here with the laptop, accounts, I-9, plan, buddy and meetings.</p></section>`}
    <section class="panel">
      <h2>Offboarding</h2>
      ${exits.length ? html`<ul class="list">${exits.map((x) => html`<li><b>${x.name}</b> left ${fmtDate(s, x.exitDay)} ${x.revoked ? badge('access removed', 'good') : html`${badge('access still on', 'bad')} <button class="sm" data-revoke="${x.memberId}">Remove access (${ONB.revokeHours}h)</button>`}${x.incident ? badge('incident', 'bad') : ''}</li>`)}</ul>`
        : html`<p class="muted small">No exits to close out.</p>`}
      <p class="hint">Same day: SSO and email, GitHub and cloud, password manager, Stripe and the bank, shared docs. Leftover access is the usual source of ex-employee incidents (~${Math.round(ONB.access.incidentMonthlyFired * 100)}%/month after a firing, ~${Math.round(ONB.access.incidentMonthlyResigned * 100)}% after a resignation, game estimate [design]).</p>
    </section>`;
}

function onboardCard(s, p, m) {
  const o = m.onboarding;
  const q = onboardingQuality(m) ?? 0;
  const lq = onboardingQuality(m, { logistics: true }) ?? 0;
  const teammates = humansOf(p).filter((x) => x.status === 'active' && x.id !== m.id);
  const rows = Object.entries(o.items);
  const done = (k, it) => (k === 'plan' ? Boolean(m.mgmt?.plan) : it.done != null);
  return html`<section class="panel">
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><h2 style="margin:0"><a href="#/people/${m.id}">${m.name}</a> · ${ROLES[m.jobRole ?? m.role]?.label ?? m.role}</h2>${badge(m.status === 'offer' ? `starts ${fmtDate(s, m.startDay)}` : `day ${s.day - m.startDay}`, m.status === 'offer' ? 'warn' : '')}</div>
    <div class="grid-3" style="margin:8px 0"><div><div class="small muted">Onboarding quality</div>${meter(q, tone(q))}<b>${Math.round(q * 100)}%</b></div>
      <div><div class="small muted">Early-exit risk (90 days)</div><b>${Math.round(earlyExitP90(q) * 100)}%</b> <span class="small muted">vs ${Math.round(ONB.earlyExit90.none * 100)}% with none</span></div>
      <div><div class="small muted">Ramp</div><b>${m.rampWeeks} weeks</b> <span class="small muted">${o.applied ? `(×${o.ramp?.mult} logistics${o.ramp?.ai !== 1 ? `, ×${o.ramp.ai} AI tools` : ''}${o.lateDays ? `, +${o.lateDays} idle days` : ''})` : `(logistics ×${rampMult(lq).toFixed(2)} if started now)`}</span></div></div>
    <table class="table small"><thead><tr><th>Step</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(([k, it]) => {
        const d = done(k, it);
        const late = !d && s.day > it.due;
        const act = k === 'welcome' ? html`<button class="sm" data-ob="welcome:${m.id}">Send welcome + call (${ONB.welcomeHours}h)</button>`
          : k === 'equipment' ? html`<select data-eq="${m.id}">${Object.entries(ONB.laptop).map(([t, v]) => html`<option value="${t}" ${sel(t, odraft.equip[m.id] ?? 'standard')}>${v.label} · ${usd(v.cost + (m.region !== 'us' ? ONB.shipAbroad : 0))}</option>`)}</select> <button class="sm" data-ob="equipment:${m.id}">Order (${ONB.equipmentHours}h)</button>`
          : k === 'accounts' ? html`<button class="sm" data-ob="accounts:${m.id}">Provision accounts (${ONB.accountsHours}h)</button>`
          : k === 'i9' ? html`<button class="sm" data-ob="i9:${m.id}">Complete I-9 (${ONB.i9.hours}h)</button>`
          : k === 'ciiaa' ? html`<button class="sm" data-ob="ciiaa:${m.id}">Collect signed CIIAA (${CIIAA_HOURS}h)</button>`
          : k === 'plan' ? html`<a class="sm" href="#/people/${m.id}">Write the 30/60/90 plan</a>`
          : k === 'buddy' ? html`<select data-buddy="${m.id}"><option value="founder">You (1h/week for a month)</option>${teammates.map((x) => html`<option value="${x.id}">${x.name}</option>`)}</select> <button class="sm" data-ob="buddy:${m.id}">Assign (${ONB.buddyHours}h)</button>`
          : html`<button class="sm" data-ob="meetings:${m.id}">Put on calendar (${ONB.scheduleHours}h)</button>`;
        return html`<tr><td>${ITEM_LABEL[k]}</td><td class="${late ? 'neg' : ''}">${fmtDate(s, it.due)}</td><td>${d ? badge(k === 'equipment' ? `ordered, ready ${fmtDate(s, it.readyDay)}` : k === 'accounts' ? `ready ${fmtDate(s, it.readyDay)}` : k === 'meetings' ? `${it.eventIds?.length ?? 0} on calendar` : 'done', 'good') : badge(late ? 'overdue' : 'open', late ? 'bad' : 'warn')}</td><td>${d ? '' : act}</td></tr>`;
      })}
    </tbody></table>
    ${m.region === 'us' && m.engagement === 'employee' ? html`<p class="hint">Form I-9: the employee completes Section 1 by their first day of pay; you complete Section 2 within <b>3 business days</b> of the start (${o.items.i9 ? fmtDate(s, o.items.i9.due) : ''}). A missing form is a paperwork violation (roughly $288-$2,861 each when audited) [secondary].</p>` : ''}
  </section>`;
}

// ---------------------------------------------------------------------------
// Benefits & time off tab
// ---------------------------------------------------------------------------
export function benefitsView(s, p) {
  const o = ensureOps(s);
  const b = o.benefits;
  const sum = benefitCostSummary(s);
  const hs = healthStatus(s);
  const pk = packageFor(s);
  const out = outNow(s);
  const pend = pendingRequests(s);
  const next = upcoming(s, 21);
  const cov = roleCoverage(s, p);
  const tot = premiumTotals(s);
  const liab = ptoLiability(s);
  const staff = humansOf(p).filter((m) => m.status === 'active' && (m.engagement === 'employee' || m.engagement === 'eor'));
  const mandates = [...new Set(staff.filter((m) => m.region === 'us').map((m) => workStateOf(s, m)).filter((st) => STATE_SICK[st]))];
  return html`
    <div class="stats">
      ${stat('Benefits / employee', `${money(sum.perEmployeeMonth)}/mo`, b.configured ? 'from your policy' : 'default package (not configured)')}
      ${stat('Company benefits', `${money(sum.companyMonth)}/mo`, `${sum.employees} US employee${sum.employees === 1 ? '' : 's'}, incl. 401(k) fee and match`)}
      ${stat('Accrued PTO liability', money(liab), b.pto.mode === 'accrued' ? 'owed to employees; paid out at exit in CA' : 'no balance under this policy')}
      ${stat('Out today', String(out.length), out.length ? out.map((x) => x.m.name.split(' ')[0]).join(', ') : 'everyone in')}
      ${stat('Package score', b.configured ? pk.score.toFixed(2) : 'default', 'vs candidates (0.8 = market)')}
    </div>
    ${!hs.active && b.configured && b.health.mode !== 'none' ? html`<div class="callout warn">${hs.note}</div>` : ''}
    ${pend.length ? html`<section class="panel"><h2>Time-off requests (${pend.length})</h2>
      <ul class="list">${pend.map((r) => { const m = p.members.find((x) => x.id === r.memberId); const cv = coverFor(s, p, m, r); return html`<li><b>${m?.name}</b> · ${r.days} day${r.days > 1 ? 's' : ''} from ${fmtDate(s, r.start)} (asked ${fmtDate(s, r.requestedDay)})${cv ? html` <span class="neg">· ${cv}</span>` : ''}
        <div class="inline"><button class="sm primary" data-pto="approve:${r.id}">Approve (0.05h)</button><button class="sm" data-pto="alt:${r.id}">Offer other dates (0.1h)</button><button class="sm danger" data-pto="deny:${r.id}">Deny (0.05h)</button></div></li>`; })}</ul>
      <p class="hint">Unanswered requests go through after ${ABS.vacation.autoApproveAfter} days and the person notices. Denying repeatedly costs morale and quits, then a burnout leave. Approve with a handoff.</p></section>` : ''}
    <div class="grid-2">
      <section class="panel">
        <h2>Benefits policy</h2>
        <form id="benefitsPolicy">
          <label>Health <select name="mode">${Object.entries(HEALTH_MODES).map(([k, l]) => html`<option value="${k}" ${sel(k, b.health.mode)}>${l}</option>`)}</select></label>
          <div class="grid-2">
            <label>Employer pays (% of employee-only premium) <input type="number" name="contribPct" min="0" max="100" step="5" value="${Math.round(b.health.contribPct * 100)}" /></label>
            <label>...of dependent tiers (%) <input type="number" name="depPct" min="0" max="100" step="5" value="${Math.round(b.health.depPct * 100)}" /></label>
            <label>QSEHRA / ICHRA allowance ($/month) <input type="number" name="allowance" min="0" step="25" value="${b.health.allowance}" /></label>
            <label>Waiting period (days) <select name="waitingDays">${[0, 30, 60, 90].map((d) => html`<option ${sel(d, b.health.waitingDays)}>${d}</option>`)}</select></label>
            <label>PEO tier <select name="peoTier"><option value="basic" ${sel('basic', b.health.peoTier)}>Basic · $${PEO.basic} PEPM</option><option value="plus" ${sel('plus', b.health.peoTier)}>Plus · $${PEO.plus} PEPM</option></select></label>
            <label><input type="checkbox" name="dentalVision" ${b.dentalVision ? 'checked' : ''} /> Dental + vision (~$${DENTAL_VISION}/employee/mo)</label>
          </div>
          <h3>401(k)</h3>
          <div class="inline"><label><input type="checkbox" name="k401" ${b.k401.on ? 'checked' : ''} /> Offer a 401(k)</label>
            <select name="provider"><option value="guideline" ${sel('guideline', b.k401.provider)}>Guideline-style ($${K401.guideline.base}/mo + $${K401.guideline.perHead}/head)</option><option value="humaninterest" ${sel('humaninterest', b.k401.provider)}>Human Interest-style ($${K401.humaninterest.base}/mo + $${K401.humaninterest.perHead}/head)</option></select>
            <label>Match <select name="match">${K401.match.map((v) => html`<option value="${v}" ${sel(v, b.k401.matchPct)}>${Math.round(v * 100)}%</option>`)}</select></label></div>
          <h3>Stipends</h3>
          <div class="inline"><label><input type="checkbox" name="sHome" ${b.stipends.home ? 'checked' : ''} /> Home office $${STIPENDS.home}/mo</label><label><input type="checkbox" name="sLearn" ${b.stipends.learning ? 'checked' : ''} /> Learning $${STIPENDS.learning}/yr</label><label><input type="checkbox" name="sWell" ${b.stipends.wellness ? 'checked' : ''} /> Wellness $${STIPENDS.wellness}/mo</label></div>
          <h3>Time off</h3>
          <div class="grid-2">
            <label>PTO policy <select name="ptoMode"><option value="accrued" ${sel('accrued', b.pto.mode)}>Accrued days (balance, payout liability)</option><option value="unlimited" ${sel('unlimited', b.pto.mode)}>Unlimited (no balance; people take about the same)</option><option value="statutory" ${sel('statutory', b.pto.mode)}>Statutory only (holidays + required sick leave)</option></select></label>
            <label>Days per year (accrued) <input type="number" name="days" min="0" max="40" value="${b.pto.daysPerYear}" /></label>
            <label>Paid holidays <input type="number" name="holidays" min="0" max="13" value="${b.pto.holidays}" /></label>
            <label>Paid parental leave (weeks) <input type="number" name="parental" min="0" max="26" value="${b.pto.parentalPaidWeeks}" /></label>
          </div>
          <button class="primary">Save policy (1h)</button>
        </form>
        <p class="hint">${money(tot.single)}/yr single and ${money(tot.family)}/yr family are the average annual premiums for ${s.startDate ? new Date(Date.parse(s.startDate + 'T12:00:00Z') + s.day * 86400000).getUTCFullYear() : 2026}: KFF 2025 ($${KFF.single.toLocaleString('en-US')} / $${KFF.family.toLocaleString('en-US')}) trended by the 2026 small-group increase (median proposed ~11%) [sourced]. QSEHRA 2026 limits: $${QSEHRA.single.toLocaleString('en-US')} single / $${QSEHRA.family.toLocaleString('en-US')} family, under 50 FTEs and no group plan [secondary]. Dental/vision, stipends, match, PEO advantage are [design].</p>
        <ul class="list small">
          <li>Health: ${money(sum.healthMonth)}/mo per head${sum.health?.capped ? ' (allowance capped at the QSEHRA limit)' : ''}; dental/vision ${money(sum.dentalMonth)}; stipends ${money(sum.stipendsMonth)}.</li>
          <li>401(k): provider fee ${money(sum.k401FeeMonth)}/mo, match ${money(sum.matchMonth)}/mo.</li>
          <li>Candidate view: ${b.configured ? (pk.health >= 0.9 ? 'competitive health plan' : pk.health > 0.3 ? 'a thin health benefit' : 'no usable health benefit: family candidates will decline') : 'default package'}.</li>
        </ul>
      </section>
      <section class="panel">
        <h2>Who's out</h2>
        ${out.length ? html`<ul class="list">${out.map((x) => html`<li><b>${x.m.name}</b> · ${x.rec.label} until ${fmtDate(s, x.rec.end)}</li>`)}</ul>` : html`<p class="muted small">Everyone is in today.</p>`}
        <h3>Next 3 weeks</h3>
        ${next.length ? html`<ul class="list small">${next.map((r) => { const m = p.members.find((x) => x.id === r.memberId); return html`<li>${fmtDate(s, r.start)}-${fmtDate(s, r.end)} · ${m?.name} · ${r.days} day${r.days > 1 ? 's' : ''}</li>`; })}</ul>` : html`<p class="muted small">No approved time off coming up.</p>`}
        <h3>Coverage</h3>
        ${cov.length ? html`<ul class="list small">${cov.map((c) => html`<li>${c.role}: ${c.total} person${c.total === 1 ? '' : 's'}${c.single ? html` ${badge('single point of failure', coverageMitigation(s) >= 0.5 ? 'warn' : 'bad')}` : ''}${c.down ? html` ${badge('nobody in', 'bad')}` : ''}</li>`)}</ul>` : html`<p class="muted small">Support and engineering coverage appears once those roles are hired.</p>`}
        <div class="inline"><button class="sm" data-cover="runbooks" ${o.coverage.runbooks ? 'disabled' : ''}>${o.coverage.runbooks ? 'Runbooks written' : `Write runbooks (${ABS.remedy.runbookHours}h)`}</button>
          <button class="sm" data-cover="oncall">${o.coverage.onCall ? `Cancel on-call contractor` : `Retain on-call contractor (${money(ABS.remedy.onCallMonthly)}/mo)`}</button></div>
        <p class="hint">Each absence day adds a day of backlog; with two people, one out is half the capacity; the only support person or engineer out for two weeks pushes work back one to two weeks. Runbooks recover ~30% and an on-call contractor ~50% of a single person's output [design].</p>
        <h3>Compliance</h3>
        <ul class="list small">
          ${mandates.length ? mandates.map((st) => html`<li>${STATE_SICK[st].label}: ${STATE_SICK[st].hours} hours of paid sick leave a year ${b.pto.mode === 'accrued' && b.pto.daysPerYear * 8 < STATE_SICK[st].hours ? badge('policy below mandate', 'bad') : badge('ok', 'good')} <span class="muted">[${STATE_SICK[st].src}]</span></li>`) : html`<li class="muted">No state sick-leave mandate among your US team (about 17-19 states plus DC have one; sources disagree).</li>`}
          <li>California treats vested vacation as wages: an accrued balance is paid out at separation, with no use-it-or-lose-it. Unlimited PTO has no balance to pay.</li>
          <li>EOR hires get their country's statutory leave: ${Object.entries(EOR_LEAVE).filter(([r]) => staff.some((m) => m.region === r)).map(([r, v]) => `${r} ${v.annual} days`).join(', ') || 'none yet'}.</li>
          <li>FMLA applies from 50 employees; under that, plan leave yourself. Short-term disability is optional and sits in packages above ~20 staff [design].</li>
        </ul>
      </section>
    </div>
    <section class="panel"><h2>Team balances and time taken</h2>
      ${staff.length ? html`<table class="table small"><thead><tr><th>Person</th><th>Where</th><th>PTO balance</th><th>Taken (12 mo)</th><th>Sick days (12 mo)</th><th>Denied</th></tr></thead><tbody>
        ${staff.map((m) => html`<tr><td>${m.name}</td><td>${m.region === 'us' ? (m.workState ?? '—') : m.region}</td><td>${b.pto.mode === 'accrued' && m.region === 'us' ? `${ptoBalance(m).toFixed(1)} d` : b.pto.mode === 'unlimited' ? 'unlimited' : '—'}</td><td>${m.abs?.takenYear ?? 0} d</td><td>${m.abs?.sickYear ?? 0} d</td><td class="${(m.abs?.denied?.length ?? 0) >= 2 ? 'neg' : ''}">${m.abs?.denied?.length ?? 0}</td></tr>`)}
      </tbody></table>` : html`<p class="muted small">No employees yet. Time off, sick days and balances appear after the first hire.</p>`}
    </section>`;
}

function coverFor(s, p, m, r) {
  if (!m) return '';
  const same = humansOf(p).filter((x) => x.status === 'active' && x.role === m.role && x.id !== m.id);
  if (same.length === 0 && ['support', 'engineer'].includes(m.role)) return `the only ${m.role === 'support' ? 'support person' : 'engineer'}${coverageMitigation(s) ? ' (partly covered)' : ': no cover'}`;
  const overlap = same.filter((x) => isAway(s, x, r.start)).length;
  return overlap ? `${overlap} teammate(s) also out then` : '';
}

// ---------------------------------------------------------------------------
// Workplace tab
// ---------------------------------------------------------------------------
export function workplaceView(s, p) {
  const o = ensureOps(s);
  const w = o.workplace;
  const cost = workplaceCost(s);
  const heads = headsFor(s) - 1;
  const l = w.lease && !w.lease.ended ? w.lease : null;
  const city = w.city ?? odraft.lease.city;
  const sqft = odraft.lease.sqft ?? sqftFor(headsFor(s));
  const lt = leaseTerms(odraft.lease.city, sqft);
  const monthsLeft = l ? remainingMonths(s) : 0;
  const drain = isolationDrain(s);
  const offsites = w.offsites.slice(-3);
  return html`
    <div class="stats">
      ${stat('Workplace', w.mode ?? 'not chosen', w.mode ? `${CITIES[w.city]?.label ?? 'no city'} · ${heads} on the team` : 'remote by default')}
      ${stat('Monthly cost', money(cost.total), `rent ${money(cost.rent)} · coworking ${money(cost.cowork)} · passes ${money(cost.passes)}`)}
      ${stat('Office-required pool', `${Math.round(poolMult(s, { remote: false }, 'office').mult * 100)}%`, 'of a remote role\'s applicants')}
      ${stat('Founder isolation', drain ? `-${drain} energy/wk` : 'none', drain ? 'solo and remote' : 'not a solo remote founder')}
    </div>
    ${heads === 0 && !w.mode ? html`<div class="callout small">You are a solo remote founder: no quantified isolation effect exists in the research, so the energy drain here is a game assumption [design]. A coworking day pass or two a week limits it.</div>` : ''}
    <div class="grid-2">
      <section class="panel">
        <h2>How the company works</h2>
        <form id="workplaceForm">
          <label>Mode <select name="mode">
            <option value="remote" ${sel('remote', w.mode)}>Fully remote (home-office stipends)</option>
            <option value="cowork" ${sel('cowork', w.mode)}>Coworking (hot desk / dedicated / private office)</option>
            <option value="hybrid" ${sel('hybrid', w.mode)}>Hybrid (2-3 days in a coworking space or office)</option>
            <option value="lease" ${sel('lease', w.mode)} ${l ? '' : 'disabled'}>Conventional lease ${l ? '' : '(sign one below)'}</option></select></label>
          <div class="grid-2">
            <label>City <select name="city">${Object.entries(CITIES).map(([k, v]) => html`<option value="${k}" ${sel(k, city)}>${v.label}</option>`)}</select></label>
            <label>Desk type <select name="tier">${Object.entries(COWORK.tiers).filter(([k]) => k !== 'day_pass').map(([k, v]) => html`<option value="${k}" ${sel(k, w.cowork?.tier ?? 'hot_desk')}>${v.label} · ${money(coworkPrice(city, k, w.cowork?.term ?? 'month'))}/person/mo</option>`)}</select></label>
            <label>Commitment <select name="term"><option value="month" ${sel('month', w.cowork?.term ?? 'month')}>Month to month (+20%)</option><option value="year" ${sel('year', w.cowork?.term)}>12 months (-15%, early exit costs 75% of what is left)</option></select></label>
            <label>Hybrid office days / week <input type="number" name="hybridDays" min="1" max="4" value="${w.hybridDays}" /></label>
            <label>Founder day passes / week ($${COWORK.tiers.day_pass.dayPass} each) <input type="number" name="dayPasses" min="0" max="5" value="${w.dayPasses}" /></label>
          </div>
          <button class="primary">Save workplace (0.5h)</button>
        </form>
        <p class="hint">Coworking anchors: Berlin dedicated desk ~EUR 499 and London ~EUR 600 median (One Coworking 2026), Regus reserved desk from $259 in the US [sourced]; WeWork All Access ~$339 [unverified]. US city prices, the hot-desk and private-office ratios and the term pricing are [design]. Hybrid cut quits by about a third in a randomized trial of 1,612 graduates at Trip.com (Nature 2024) [sourced]; the other modes' quit effects and the small in-person edge for juniors are [design].</p>
        <h3>Hiring effect</h3>
        <ul class="list small">
          <li>Remote role: full applicant pool (remote openings were ~10-16% of postings but drew 44-46% of applications) [sourced].</li>
          <li>Hybrid role: about ${Math.round(poolMult(s, { remote: false }, 'hybrid').mult * 100)}% of that pool. In-office role: about ${Math.round(poolMult(s, { remote: false }, 'office').mult * 100)}% (commute radius) [design]. Office roles in ${CITIES[city]?.label ?? 'your city'} ask ~${Math.round(((CITIES[city]?.ask ?? 1) - 1) * 100)}% more.</li>
        </ul>
      </section>
      <section class="panel">
        <h2>Lease</h2>
        ${l ? html`<p><b>${CITIES[l.city].label}</b> · ${l.sqft} sq ft · ${money(l.monthly)}/mo${l.holdover ? ' (holdover, 125%)' : ''} · ends ${fmtDate(s, l.endDay)} (${monthsLeft} months)<br>Deposit ${money(l.deposit)} · build-out ${money(l.buildCost)} sunk · ${l.pg ? badge('personal guarantee', 'bad') : badge('no guarantee', 'good')}</p>
          <div class="inline"><button class="sm" data-lease="sublease">Sublease (needs consent; months vacant, then ~55%)</button><button class="sm" data-lease="buyout">Buy out (~80% of what is left)</button>${monthsLeft === 0 ? html`<button class="sm" data-lease="expire">Let it end</button><button class="sm" data-lease="renew">Renew 3 years</button>` : html`<button class="sm" data-lease="renew">Renew early</button>`}<button class="sm danger" data-lease="default">Stop paying</button></div>
          ${monthsLeft <= 6 ? html`<div class="callout warn small">The lease ends within about 6 months. Decide now: a holdover costs 25% more per month.</div>` : ''}`
        : html`<form id="leaseForm"><div class="grid-2">
            <label>City <select name="city">${Object.entries(CITIES).map(([k, v]) => html`<option value="${k}" ${sel(k, odraft.lease.city)}>${v.label} · $${v.leaseSf}/sq ft/yr</option>`)}</select></label>
            <label>Size (sq ft; ~${LEASE.sfPerPerson} per person) <input type="number" name="sqft" min="200" step="50" value="${sqft}" /></label>
            <label>Term <select name="termYears">${[3, 4, 5].map((y) => html`<option value="${y}" ${sel(y, odraft.lease.termYears)}>${y} years</option>`)}</select></label>
            <label>Build-out <select name="buildOut">${Object.entries(LEASE.buildOutPerSf).map(([k, v]) => html`<option value="${k}" ${sel(k, odraft.lease.buildOut)}>${k} · $${v}/sq ft</option>`)}</select></label>
            <label>Guarantee <select name="guarantee"><option value="personal" ${sel('personal', odraft.lease.guarantee)}>Personal guarantee (2-month deposit)</option><option value="deposit" ${sel('deposit', odraft.lease.guarantee)}>Bigger deposit (6 months), no guarantee</option></select></label>
          </div>
          <p class="small">Rent ${money(lt.monthly)}/mo with operating costs (${money(lt.base)} base). Total over the term: ${money(lt.monthly * 12 * odraft.lease.termYears)}. Deposit ${money(lt.monthly * (odraft.lease.guarantee === 'deposit' ? LEASE.largeDepositMonths : LEASE.depositMonths))}, build-out ${money(sqft * LEASE.buildOutPerSf[odraft.lease.buildOut])}, lawyer ${money(LEASE.lawyer)}.</p>
          ${heads < LEASE.minHeadcount ? html`<div class="callout warn small">You have ${heads} on the team. Under about ${LEASE.minHeadcount}, a lease is a fixed cost you may shrink out of: you sublet at a discount or pay to leave, and a personal guarantee follows you. Flexible coworking is the usual answer.</div>` : ''}
          <button class="sm danger">Sign the lease (4h)</button></form>
          <p class="hint">Manhattan Class A asking averaged ~$64/sq ft (Aug 2025), San Francisco ~$64 (Feb 2025) [secondary]; Austin, London, Berlin and Denver figures are [design] or converted from per-m² data. 3-5 year terms, deposit of one to two months (a year if the landlord wants security), landlords often ask for a personal guarantee from a young company [sourced, general]. A local commercial real-estate lawyer should review it.</p>`}
        <h2>Offsite</h2>
        <div class="inline"><button class="sm" data-offsite="local">Local day (${money(OFFSITE.perPerson.local)}/head · ${offsiteHours('local')}h)</button><button class="sm" data-offsite="retreat">3-day retreat (${money(OFFSITE.perPerson.retreat)}/head · ${offsiteHours('retreat')}h)</button></div>
        ${offsites.length ? html`<ul class="list small">${offsites.map((x) => html`<li>${fmtDate(s, x.day)} · ${x.kind} · ${x.people} people · ${money(x.cost)}</li>`)}</ul>` : ''}
        <p class="hint">Multi-day offsites run about $1,000-3,000 per person (vendor guides; small companies $500-1,000) [secondary]. A good one lifts morale and alignment for a few months (~10% fewer quits for 90 days, more for distributed teams) [design]. Needs a team of two or more.</p>
      </section>
    </div>`;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
export function bindOps(root, ctx, { tab, cand }) {
  const find = (st, id) => st.apps.people.members.find((m) => m.id === id);
  const num = (v, d = 0) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
  // ---- negotiation (candidate page) ----
  if (cand) {
    const cid = cand.id;
    wireNegotiation(root, ctx);
    on(root, 'click', '[data-neg-accept]', (e, el) => el.closest('[data-neg-root]') ? null : ctx.act((st) => { acceptCounter(st, cid); ctx.toast('Counter accepted. They will answer within a day or two.', 'good'); }, { hours: NEG.hours.accept, label: 'Negotiation: accept counter' }));
    on(root, 'click', '[data-neg-walk]', (e, el) => el.closest('[data-neg-root]') ? null : ctx.act((st) => { walkAway(st, cid); ctx.toast('Offer withdrawn.', 'info'); }, { hours: NEG.hours.walk, label: 'Negotiation: walk away' }));
    on(root, 'input', '[data-neg-counter] input', (e, el) => { const f = formData(el.form); odraft.counter[cid] = { pay: f.pay, equityPct: f.equityPct, signOn: f.signOn, startDay: f.start ? dayFromIso(ctx.state, f.start) : undefined, remote: f.remote }; });
    on(root, 'submit', '[data-neg-counter]', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const contractor = cand.engagement === 'contractor';
      ctx.act((st) => {
        const r = counterBack(st, cid, { [contractor ? 'hourlyRate' : 'salary']: num(f.pay), equityPct: num(f.equityPct, cand.offer.equityPct ?? 0), signOn: num(f.signOn, cand.offer.signOn ?? 0), startDay: f.start ? dayFromIso(st, f.start) : undefined, remote: Boolean(f.remote) });
        ctx.toast(r.result === 'recounter' ? 'They moved toward you once more: this is their final.' : `Sent. Their read of your answer: ${Math.round(r.satisfaction * 100)}% of what they asked.`, r.satisfaction >= 0.85 ? 'good' : 'info');
        delete odraft.counter[cid];
      }, { hours: NEG.hours.counter, label: 'Negotiation: counter' });
    });
    on(root, 'submit', '[data-neg-menu]', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const opts = [0, 1, 2].map((i) => ({ label: f[`l${i}`] || `Option ${i + 1}`, salary: num(f[`s${i}`]), hourlyRate: undefined, equityPct: num(f[`e${i}`]), signOn: num(f[`g${i}`]) })).filter((x) => x.salary > 0);
      ctx.act((st) => { const r = presentMenu(st, cid, opts); ctx.toast(`They chose "${r.chosen.label}".`, 'good'); }, { hours: NEG.hours.menu, label: 'Negotiation: cash/equity menu' });
    });
    on(root, 'submit', '[data-neg-signon]', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { addSignOn(st, cid, num(f.amt)); ctx.toast('Sign-on added.', 'good'); }, { hours: NEG.hours.signOn, label: 'Negotiation: sign-on' }); });
    on(root, 'submit', '[data-neg-deadline]', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { setDeadline(st, cid, num(f.days, 7)); ctx.toast('Deadline set.', 'info'); }, { hours: NEG.hours.deadline, label: 'Negotiation: deadline' }); });
    on(root, 'submit', '#offerForm', () => {}); // (offer sending is wired in people.js)
  }
  // ---- onboarding ----
  if (tab === 'onboarding') {
    on(root, 'change', '[data-eq]', (e, el) => { odraft.equip[el.dataset.eq] = el.value; });
    on(root, 'click', '[data-ob]', (e, el) => {
      const [k, id] = el.dataset.ob.split(':');
      const a = {
        welcome: [(st) => sendWelcome(st, id), ONB.welcomeHours, 'Welcome note and call'],
        equipment: [(st) => { const it = orderEquipment(st, id, odraft.equip[id] ?? root.querySelector(`[data-eq="${id}"]`)?.value ?? 'standard'); ctx.toast(`Ordered (${usd(it.cost)}); arrives ${fmtDate(st, it.readyDay)}.`, 'good'); }, ONB.equipmentHours, 'Order equipment'],
        accounts: [(st) => provisionAccounts(st, id), ONB.accountsHours, 'Provision accounts'],
        i9: [(st) => { const it = completeI9(st, id); ctx.toast(it.late ? 'Completed late. It stays a recorded late filing.' : 'I-9 complete.', it.late ? 'warn' : 'good'); }, ONB.i9.hours, 'Form I-9'],
        ciiaa: [(st) => collectCiiaa(st, id), CIIAA_HOURS, 'CIIAA signature'],
        buddy: [(st) => assignBuddy(st, id, root.querySelector(`[data-buddy="${id}"]`)?.value ?? 'founder'), ONB.buddyHours, 'Assign buddy'],
        meetings: [(st) => { const ev = scheduleOnboardingMeetings(st, id); ctx.toast(`${ev.length} onboarding meetings added to your calendar.`, 'good'); }, ONB.scheduleHours, 'Schedule onboarding meetings'],
      }[k];
      if (a) ctx.act(a[0], { hours: a[1], label: a[2] });
    });
    on(root, 'click', '[data-revoke]', (e, el) => ctx.act((st) => { revokeAccess(st, el.dataset.revoke); ctx.toast('Access removed.', 'good'); }, { hours: ONB.revokeHours, label: 'Remove access' }));
  }
  // ---- benefits ----
  if (tab === 'benefits') {
    on(root, 'submit', '#benefitsPolicy', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => {
        setBenefits(st, {
          health: { mode: f.mode, contribPct: num(f.contribPct, 85) / 100, depPct: num(f.depPct, 0) / 100, allowance: num(f.allowance, 0), waitingDays: num(f.waitingDays, 30), peoTier: f.peoTier },
          dentalVision: Boolean(f.dentalVision), k401: { on: Boolean(f.k401), provider: f.provider, matchPct: num(f.match, 0) },
          stipends: { home: Boolean(f.sHome), learning: Boolean(f.sLearn), wellness: Boolean(f.sWell) },
          pto: { mode: f.ptoMode, daysPerYear: num(f.days, 15), holidays: num(f.holidays, 8), parentalPaidWeeks: num(f.parental, 0) },
        });
        ctx.toast('Benefits policy saved. Payroll cost per employee is recalculated.', 'good');
      }, { hours: 1, label: 'Benefits policy' });
    });
    on(root, 'click', '[data-pto]', (e, el) => {
      const [k, id] = el.dataset.pto.split(':');
      if (k === 'approve') ctx.act((st) => approveRequest(st, id), { hours: 0.05, label: 'Approve time off' });
      else ctx.act((st) => { denyRequest(st, id, { alt: k === 'alt' }); ctx.toast(k === 'alt' ? 'Denied, with other dates offered.' : 'Denied. Repeated denials cost morale and quits.', 'warn'); }, { hours: k === 'alt' ? 0.1 : 0.05, label: k === 'alt' ? 'Offer other dates' : 'Deny time off' });
    });
    on(root, 'click', '[data-cover]', (e, el) => {
      const k = el.dataset.cover;
      if (k === 'runbooks') ctx.act((st) => { setCoverage(st, { runbooks: true }); ctx.toast('Runbooks written: a single person\'s absence is partly covered.', 'good'); }, { hours: ABS.remedy.runbookHours, label: 'Write runbooks' });
      else ctx.act((st) => { setCoverage(st, { onCall: !ensureOps(st).coverage.onCall }); }, { hours: 1, label: 'On-call contractor' });
    });
  }
  // ---- workplace ----
  if (tab === 'workplace') {
    on(root, 'submit', '#workplaceForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => { setWorkplace(st, { mode: f.mode, city: f.city, hybridDays: f.hybridDays, dayPasses: f.dayPasses, cowork: { tier: f.tier, term: f.term }, hybridBase: f.mode === 'hybrid' ? (ensureOps(st).workplace.lease && !ensureOps(st).workplace.lease.ended ? 'lease' : 'cowork') : undefined }); ctx.toast('Workplace saved. Rent and desks post monthly.', 'good'); }, { hours: 0.5, label: 'Workplace' });
    });
    on(root, 'input', '#leaseForm', (e, el) => { const f = formData(el.form ?? el); Object.assign(odraft.lease, { city: f.city, sqft: f.sqft, termYears: Number(f.termYears), buildOut: f.buildOut, guarantee: f.guarantee }); });
    on(root, 'change', '#leaseForm', () => ctx.render());
    on(root, 'submit', '#leaseForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => { signLease(st, { city: f.city, sqft: num(f.sqft), termYears: num(f.termYears, 3), buildOut: f.buildOut, guarantee: f.guarantee }); ctx.toast('Lease signed. Rent posts monthly; your deposit and build-out went out today.', 'warn'); }, { hours: 4, label: 'Sign office lease' });
    });
    on(root, 'click', '[data-lease]', (e, el) => {
      const how = el.dataset.lease;
      if (how === 'renew') return ctx.act((st) => { renewLease(st, 3); ctx.toast('Renewed for 3 years at a modest step.', 'info'); }, { hours: 2, label: 'Renew lease' });
      if (how === 'default' && globalThis.confirm && !globalThis.confirm('Stopping rent is a default: a personal guarantee gets called against your savings. Continue?')) return;
      ctx.act((st) => { const r = exitLease(st, how); ctx.toast(`Lease ended (${how}): ${r.paid ? usd(r.paid) + ' paid' : 'no extra cost'}.`, r.paid ? 'warn' : 'good'); }, { hours: 3, label: `Lease: ${how}` });
    });
    on(root, 'click', '[data-offsite]', (e, el) => { const k = el.dataset.offsite; ctx.act((st) => { const r = holdOffsite(st, k); ctx.toast(`Offsite held: ${usd(r.cost)} for ${r.people} people, morale +${r.boost}.`, 'good'); }, { hours: offsiteHours(k), label: `Offsite (${k})` }); });
  }
}
