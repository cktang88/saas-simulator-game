// People: Gusto (payroll) + Deel (contractors/EOR) + Ashby-lite (hiring pipeline) + an AI workforce.
// The player writes the job post, picks channels, screens, interviews candidates live (LLM persona,
// booked on the calendar), makes offers, runs payroll, grants options, and decides what to hand to
// AI agents versus people. Numbers: docs/research/hr-legal-product.md §1 (see people/catalog.js).

import { html, mount, on, formData, table, stat, badge, modal, barChart } from '../core/ui.js';
import { money, pct, fmtDate, isoDate, clamp } from '../core/util.js';
import { findSlots, fmtTime } from '../core/calendar.js';
import { findThread } from '../core/mail.js';
import { ROLES, REGIONS, AI_AGENTS, CHANNELS, VENDORS, BENEFITS, EOR_LOAD, EQUITY, SEVERANCE, burdenRate } from './people/catalog.js';
import { payPeriod, payrollLines, monthlyCostOf, vendorBills } from './people/payroll.js';
import { rampFactor, regionLabel, marketMid } from './people/hiring.js';
import { SUPPORT, aiResolveRate, weeklyTickets } from './people/support.js';
import { devHoursPerWeek, supportCapacity, codebaseMaturity, monthlyPeopleCost, headcount, optionGrants } from './people/capacity.js';
import {
  ensurePeople, createJob, applyJudge, openJob, closeJob, screenCandidate, scheduleInterview, canJoin, interviewEvent, startInterview,
  finishInterview, rejectCandidate, makeOffer, setupPayroll, terminate, hireAgent, cancelAgent, writeHelpDocs, get409A, createPool,
  peopleDay, peopleMonthEnd, misclassRisk, vestedPct, findCand, findJob,
} from './people/sim.js';
import { judgeJobPost, interviewTurn, replyCandidate } from './people/llm.js';
import { entityOf, hasEin, ciiaaReady } from './legal/api.js';

// Drafts survive re-renders.
const draft = {
  job: { role: 'engineer', region: 'us', engagement: 'employee', title: '', payLo: '', payHi: '', hoursPerWeek: 40, text: '' },
  question: {},
  offer: {},
  channels: {},
};

const TABS = [['', 'Team'], ['hiring', 'Hiring'], ['ai', 'AI workforce'], ['support', 'Support load'], ['payroll', 'Payroll'], ['equity', 'Equity']];

const ENG_LABEL = { employee: 'Employee (W-2, Gusto)', eor: 'Employee via EOR (Deel)', contractor: 'Contractor' };
const STAGES = [['new', 'Applied'], ['screened', 'Screened'], ['interview_scheduled', 'Interview booked'], ['interviewed', 'Interviewed'], ['offer', 'Offer out'], ['hired', 'Hired']];

const dayFromIso = (s, iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(s.startDate + 'T12:00:00Z')) / 86400000);
const fmtPay = (m) => (m.engagement === 'contractor' ? `$${m.hourlyRate}/h × ${m.hoursPerWeek}h/wk` : `${money(m.salary)}/yr`);

function nextPayDay(s) {
  for (let d = s.day + 1; d < s.day + 32; d++) if (payPeriod(s, d)) return d;
  return null;
}

function typeLabel(m) {
  if (m.kind === 'ai_agent') return badge('AI agent', 'accent');
  if (m.engagement === 'contractor') return badge(`Contractor · ${regionLabel(m.region)}${m.cor ? ' · CoR' : ''}`);
  if (m.engagement === 'eor') return badge(`EOR · ${regionLabel(m.region)}`);
  return badge('Employee · US');
}

function compGuide(role, region, engagement) {
  const r = ROLES[role];
  const [lo, hi] = engagement === 'contractor' ? r.hourly[region] : r.salary[region];
  const unit = engagement === 'contractor' ? '/hour' : '/year base';
  const fmt = (n) => (engagement === 'contractor' ? `$${n}` : money(n));
  const loaded = engagement === 'employee' ? `Fully loaded ≈ ${money(((lo + hi) / 2) * 1.25)}–${money(((lo + hi) / 2) * 1.35)}/yr with employer burden.` : engagement === 'eor' ? `EOR adds ~${pct(EOR_LOAD[region] ?? 0.25, 0)} statutory load + $${VENDORS.deel.eor}/mo Deel fee.` : `Deel $${VENDORS.deel.contractor}/mo per contractor abroad.`;
  return html`<div class="callout small"><b>${r.label}, ${REGIONS[region].label}:</b> ${fmt(lo)}–${fmt(hi)} ${unit}. ${loaded} Ramp to full productivity ~${r.rampWeeks} weeks. <span class="muted">Source: ${r.src}.</span></div>`;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function teamView(s, p) {
  const live = p.members.filter((m) => m.status !== 'gone');
  const gone = p.members.filter((m) => m.status === 'gone').slice(-8);
  const hc = headcount(s);
  const next = nextPayDay(s);
  const risky = live.map((m) => ({ m, r: misclassRisk(m, s.day) })).filter((x) => x.r.score >= 2);
  const noCiiaa = live.filter((m) => m.kind !== 'ai_agent' && !m.ciiaa);
  const bills = vendorBills(p.members);
  return html`
    <div class="stats">
      ${stat('Team', `${hc.employees + hc.contractors}`, `${hc.employees} employees · ${hc.contractors} contractors · ${hc.agents} AI agents`)}
      ${stat('People cost', `${money(monthlyPeopleCost(s))}/mo`, 'fully loaded, incl. vendor fees')}
      ${stat('Next payroll', next ? fmtDate(s, next) : '—', 'runs on the 15th and last day')}
      ${stat('Dev hours/week', devHoursPerWeek(s).toFixed(0), `AI coding ×${p.aiCodingMultiplier}`)}
      ${stat('Support capacity', `${supportCapacity(s)}/wk`, `tickets (staff + AI)`)}
    </div>
    ${risky.map(({ m, r }) => html`<div class="callout warn"><b>Misclassification risk (${r.level}): ${m.name}.</b> ${r.factors.join('; ')}. Contractors who work like employees can trigger back taxes and penalties. Options: reduce to a defined project, use Deel Contractor of Record (~$${VENDORS.deel.cor}/mo), or convert to an employee/EOR.</div>`)}
    ${noCiiaa.length ? html`<div class="callout bad"><b>No CIIAA:</b> ${noCiiaa.map((m) => m.name).join(', ')}. Without a signed invention assignment the code/IP they create may not belong to the company — investors and acquirers check this. Create the CIIAA template in <a href="#/legal/founder">Legal</a>.</div>` : ''}
    <section class="panel">
      <h2>Team</h2>
      ${table({
        columns: [
          { label: 'Name', render: (m) => html`<b>${m.name}</b><div class="small muted">${ROLES[m.role]?.label ?? m.role}</div>` },
          { label: 'Type', render: (m) => typeLabel(m) },
          { label: 'Status', render: (m) => (m.status === 'offer' ? badge(`starts ${fmtDate(s, m.startDay)}`, 'warn') : m.leavingDay ? badge(`leaving ${fmtDate(s, m.leavingDay)}`, 'bad') : m.kind === 'ai_agent' && s.day < (m.readyDay ?? 0) ? badge('setting up', 'warn') : badge('active', 'good')) },
          { label: 'Pay', render: (m) => (m.kind === 'ai_agent' ? AI_AGENTS[m.agentType]?.pricing ?? `${money(m.monthlyCost)}/mo` : fmtPay(m)) },
          { label: 'Cost/mo', align: 'right', render: (m) => money(monthlyCostOf(s, m)) },
          { label: 'Ramp', align: 'right', render: (m) => (m.kind === 'ai_agent' ? '—' : pct(rampFactor(m, s.day), 0)) },
          { label: 'Morale', align: 'right', render: (m) => (m.kind === 'ai_agent' ? '—' : html`<span class="${m.morale < 45 ? 'neg' : m.morale > 70 ? 'pos' : ''}">${Math.round(m.morale)}</span>`) },
          { label: 'Equity', align: 'right', render: (m) => (m.equityPct ? `${m.equityPct}%` : '—') },
          { label: '', render: (m) => html`<button class="sm danger" data-letgo="${m.id}">${m.kind === 'ai_agent' ? 'Cancel' : m.status === 'offer' ? 'Rescind' : 'Let go'}</button>` },
        ],
        rows: live,
        empty: 'Just you. Most 2026 solo founders run far with AI agents before the first hire; hire for judgment and ownership, not keystrokes.',
      })}
      ${gone.length ? html`<details><summary class="small muted">Former team (${gone.length})</summary><ul class="list small">${gone.map((m) => html`<li>${m.name} · ${ROLES[m.role]?.label ?? m.role} · left ${fmtDate(s, m.endDay)} (${m.exitReason ?? 'ended'})${m.grant?.vestedAtExit ? ` · vested ${m.grant.vestedAtExit}%` : ''}</li>`)}</ul></details>` : ''}
    </section>
    <div class="grid-2">
      <section class="panel">
        <h2>Payroll & HR setup</h2>
        <ul class="list">
          <li><b>Gusto</b> (US payroll, $${VENDORS.gusto.base}/mo + $${VENDORS.gusto.perPerson}/person): ${p.payrollSetup.gusto ? badge('set up', 'good') : html`${!hasEin(s) ? html`<span class="small muted">needs an EIN (Legal) · </span>` : ''}<button class="sm" data-setup="gusto">Set up (2h)</button>`}</li>
          <li><b>Deel</b> (contractors abroad $${VENDORS.deel.contractor}/mo each; EOR $${VENDORS.deel.eor}/employee/mo): ${p.payrollSetup.deel ? badge('set up', 'good') : html`<button class="sm" data-setup="deel">Set up (1h)</button>`}</li>
          <li><b>CIIAA template</b> for hires: ${ciiaaReady(s) ? badge('ready', 'good') : html`<a href="#/legal/founder">create in Legal</a>`}</li>
        </ul>
        <form id="benefitsForm" class="inline"><label>Benefits level <select name="benefits">${Object.entries(BENEFITS).map(([k, b]) => html`<option value="${k}" ${p.benefits === k ? 'selected' : ''}>${b.label} (${(b.burden ?? burdenRate({ ...s, apps: { people: { benefits: 'standard' } } })).toFixed(2)}×)</option>`)}</select></label><button>Save (0.5h)</button></form>
        <p class="hint">Employer burden on US base pay: BLS ECEC (Jun 2026) puts benefits at ~30% of total comp nationally; a lean startup typically runs 1.20–1.30×. Current: ${burdenRate(s).toFixed(2)}×. Monthly vendor bills now: Gusto ${money(bills.gusto)}, Deel ${money(bills.deel)}.</p>
      </section>
      <section class="panel">
        <h2>Employee, contractor or EOR?</h2>
        <ul class="list small">
          <li><b>Contractor</b>: defined project, their own methods and hours, multiple clients. Cheapest and fastest. Misclassification red flags: set hours, one client, you direct <i>how</i> the work is done, ongoing core work. US state tests (California's ABC test) are strict. 1099-NEC threshold is $2,000 for 2026 payments.</li>
          <li><b>Employee (US)</b>: you control the work; payroll taxes, benefits, workers' comp. Needs an entity, EIN and payroll provider.</li>
          <li><b>EOR abroad</b>: Deel/Remote/Oyster employ them for you in their country: compliant, but $499–699/mo plus a 13–40% statutory load.</li>
          <li>Noncompetes: the FTC ban is dead and California voids most; rely on a CIIAA and confidentiality instead.</li>
        </ul>
      </section>
    </div>`;
}

function hiringView(s, p) {
  const d = draft.job;
  const jobs = p.jobs.filter((j) => j.status !== 'closed' || s.day - (j.closedDay ?? 0) < 30);
  const cands = p.candidates.filter((c) => STAGES.some(([k]) => k === c.stage));
  return html`
    <div class="grid-2">
      <section class="panel">
        <h2>Write a job post</h2>
        <form id="jobForm">
          <div class="grid-3">
            <label>Role <select name="role">${Object.entries(ROLES).map(([k, r]) => html`<option value="${k}" ${d.role === k ? 'selected' : ''}>${r.label}</option>`)}</select></label>
            <label>Where <select name="region">${Object.entries(REGIONS).map(([k, r]) => html`<option value="${k}" ${d.region === k ? 'selected' : ''}>${r.label}</option>`)}</select></label>
            <label>Engagement <select name="engagement">${Object.entries(ENG_LABEL).filter(([k]) => (d.region === 'us' ? k !== 'eor' : k !== 'employee')).map(([k, l]) => html`<option value="${k}" ${d.engagement === k ? 'selected' : ''}>${l}</option>`)}</select></label>
          </div>
          ${compGuide(d.role, d.region, d.engagement)}
          <label>Title <input id="jobTitle" name="title" value="${d.title}" placeholder="${ROLES[d.role].label}" maxlength="80" /></label>
          <div class="grid-3">
            <label>Pay from (${d.engagement === 'contractor' ? '$/h' : '$/yr'}) <input id="jobPayLo" type="number" name="payLo" value="${d.payLo}" min="0" /></label>
            <label>Pay to <input id="jobPayHi" type="number" name="payHi" value="${d.payHi}" min="0" /></label>
            ${d.engagement === 'contractor' ? html`<label>Hours/week <input id="jobHours" type="number" name="hoursPerWeek" value="${d.hoursPerWeek}" min="5" max="40" /></label>` : html`<div></div>`}
          </div>
          <label>Post <textarea id="jobText" name="text" rows="10" placeholder="Who you are (stage, customers, team). What they will own. What success looks like in 30/60/90 days. Must-haves vs nice-to-haves. Pay range. Interview process.">${d.text}</textarea></label>
          <div class="inline"><button class="primary">Publish & get candidate feedback (1h)</button><span class="hint">Strong candidates skim like customers: specific outcomes and a pay range win. Several US states and the EU Pay Transparency Directive require ranges.</span></div>
        </form>
      </section>
      <section class="panel">
        <h2>Job posts</h2>
        ${jobs.length ? jobs.map((j) => jobCard(s, p, j)) : html`<p class="empty">No posts yet. Time-to-hire for a part-time founder is typically 4–10 weeks (game assumption; ATS median ~30–40 days).</p>`}
      </section>
    </div>
    <section class="panel">
      <h2>Pipeline</h2>
      <div class="kanban">${STAGES.map(([k, label]) => {
        const list = cands.filter((c) => c.stage === k).slice(0, 25);
        return html`<div class="col"><h4>${label} <span>${list.length}</span></h4>${list.map((c) => html`<a class="card" style="display:block;text-decoration:none;color:inherit" href="#/people/${c.id}"><b>${c.name}</b><div class="small muted">${ROLES[c.role].label} · ${regionLabel(c.region)} · ${c.years}y</div>
          <div class="small">${c.engagement === 'contractor' ? `$${c.expectation}/h` : money(c.expectation)}${c.estimate ? html` · est. ${Math.round(c.estimate.q * 10)}/10` : ''}</div>
          ${k === 'interview_scheduled' && c.interview ? html`<div class="small ${c.interview.day === s.day ? 'pos' : 'muted'}">${c.interview.day === s.day ? 'Today — join now' : fmtDate(s, c.interview.day)}</div>` : ''}</a>`)}</div>`;
      })}</div>
      <p class="hint">Candidates who wait more than a week without hearing from you start taking other offers.</p>
    </section>`;
}

function jobCard(s, p, j) {
  const sel = draft.channels[j.id] ?? j.channels;
  const fits = Object.entries(CHANNELS).filter(([, c]) => !(c.contractorOnly && j.engagement !== 'contractor') && !(c.employeeOnly && j.engagement === 'contractor'));
  return html`<div class="card">
    <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><b>${j.title}</b>${badge(j.status, j.status === 'open' ? 'good' : '')}</div>
    <div class="small muted">${ENG_LABEL[j.engagement]} · ${REGIONS[j.region].label} · opened ${j.openedDay != null ? fmtDate(s, j.openedDay) : '—'}</div>
    ${j.judge ? html`<div class="small">Clarity ${j.judge.clarity}/10 · specificity ${j.judge.specificity}/10 · pay range ${j.judge.payTransparency ? '✓' : '✗'}${j.judge.mock ? ' · offline judge' : ''}</div>
      <p class="small">"${j.judge.firstImpression}"</p>
      ${j.judge.issues.length ? html`<ul class="small" style="margin:4px 0;padding-left:18px">${j.judge.issues.map((i) => html`<li>${i}</li>`)}</ul>` : ''}` : ''}
    ${j.status === 'open' ? html`<div class="small">${j.applications} applications → ${j.shortlisted} past AI resume screening</div>` : ''}
    ${j.status !== 'closed' ? html`<form class="chanForm" data-job="${j.id}">
      ${fits.map(([k, c]) => html`<label style="margin:3px 0"><input type="checkbox" name="${k}" ${sel.includes(k) ? 'checked' : ''} ${j.channels.includes(k) ? 'disabled' : ''} /> ${c.label} <span class="small muted">— ${c.daily ? `$${c.daily}/day` : c.once ? `$${c.once}` : c.feePct ? `${pct(c.feePct, 0)} fee` : 'free'}${c.hours ? `, ${c.hours}h` : ''}; ${c.note}</span></label>`)}
      <div class="inline"><button class="sm primary">${j.status === 'open' ? 'Add channels' : 'Open job'}</button>${j.status === 'open' ? html`<button type="button" class="sm" data-close-job="${j.id}">Close</button>` : ''}</div></form>` : ''}
  </div>`;
}

function candidateView(s, p, c) {
  const job = findJob(p, c.jobId);
  const contractor = c.engagement === 'contractor';
  const ev = interviewEvent(s, c);
  const join = canJoin(s, c);
  const thread = findThread(s, c.id);
  const mid = marketMid(c.role, c.region, contractor);
  const od = (draft.offer[c.id] ??= { pay: c.expectation, equityPct: contractor ? 0 : 0, start: isoDate(s, s.day + (contractor ? 7 : 21)), hoursPerWeek: job?.hoursPerWeek ?? 40, cor: false });
  const stageLabel = STAGES.find(([k]) => k === c.stage)?.[1] ?? c.stage;
  return html`
    <p><a href="#/people/hiring">← Pipeline</a></p>
    <div class="grid-2">
      <section class="panel">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><h2 style="margin:0">${c.name}</h2>${badge(stageLabel, ['declined', 'withdrawn', 'rejected'].includes(c.stage) ? 'bad' : c.stage === 'hired' ? 'good' : 'accent')}</div>
        <p class="small muted">${ROLES[c.role].label} · ${c.location} · ${c.years} years · via ${CHANNELS[c.channel]?.label ?? c.channel} · applied ${fmtDate(s, c.appliedDay)}</p>
        <p class="small">For: ${job?.title ?? '—'} (${ENG_LABEL[c.engagement]})</p>
        <h3>Signals from their profile</h3>
        <ul class="list small">${c.signals.map((x) => html`<li class="${x.tone === 'good' ? 'pos' : x.tone === 'bad' ? 'neg' : 'muted'}">${x.tone === 'good' ? '+' : x.tone === 'bad' ? '−' : '·'} ${x.text}</li>`)}</ul>
        <p class="small">Expectation: ${c.stage === 'new' ? html`<span class="muted">ask in the screen</span>` : contractor ? `$${c.expectation}/hour` : `${money(c.expectation)}/yr`} · Market mid: ${contractor ? `$${mid}/h` : money(mid)}</p>
        ${c.estimate ? html`<p class="small">Your read on quality: <b>${Math.round(c.estimate.q * 10)}/10</b> (±${Math.round(c.estimate.sd * 10)})${c.interview?.signal != null ? html` · interview signal ${pct(c.interview.signal, 0)} — ${c.interview.signal < 0.4 ? 'your questions were too generic to learn much' : 'good, specific questions'}` : ''}</p>` : ''}
        ${c.stage === 'new' ? html`<div class="inline"><button class="primary" data-screen="1">Screen: review + 20-min call (0.5h)</button><button data-screen="0">Reject</button></div>` : ''}
        ${c.stage === 'screened' ? interviewScheduler(s, c) : ''}
        ${c.stage === 'interview_scheduled' && !join ? html`<div class="callout">Interview booked for ${ev ? `${fmtDate(s, ev.day)} at ${fmtTime(ev.start)}` : '—'} (on your <a href="#/calendar">calendar</a>; the hour is charged that day). Come back on the day to join.</div>` : ''}
        ${['screened', 'interviewed', 'interview_scheduled'].includes(c.stage) ? html`<p><button class="sm danger" data-reject>Reject candidate</button></p>` : ''}
        ${c.stage === 'offer' ? html`<div class="callout">Offer sent ${fmtDate(s, c.offer.sentDay)}: ${contractor ? `$${c.offer.hourlyRate}/h` : money(c.offer.salary)}${c.offer.equityPct ? ` + ${c.offer.equityPct}%` : ''}. They'll decide in a few days. ${thread ? html`<a href="#/mail/candidate:${thread.id}">Follow up in Mail</a>` : ''}</div>` : ''}
        ${thread && c.stage !== 'offer' ? html`<p class="small"><a href="#/mail/candidate:${thread.id}">Email thread</a></p>` : ''}
      </section>
      <section class="panel">
        ${c.interview && (join || c.interview.started) ? interviewPanel(s, c, join) : ''}
        ${['interviewed', 'screened'].includes(c.stage) && (c.stage === 'interviewed' || c.interview?.done) ? offerForm(s, p, c, od) : ''}
        ${!c.interview && c.stage !== 'interviewed' ? html`<h2>Interview</h2><p class="muted">Screen, then book a 60-minute interview on your calendar. You'll run it as a live chat with the candidate. Behavioral and work-sample questions ("walk me through…", "tell me about a time…") reveal far more than "are you a team player?".</p>` : ''}
      </section>
    </div>`;
}

function interviewScheduler(s, c) {
  const slots = findSlots(s, { fromDay: s.day + 1, duration: 60, count: 6 });
  return html`<form id="schedForm" class="inline"><label>Book interview (60 min) <select name="slot">${slots.map((x) => html`<option value="${x.day}:${x.start}">${fmtDate(s, x.day)} ${fmtTime(x.start)}</option>`)}</select></label><button class="primary" ${slots.length ? '' : 'disabled'}>Send invite</button></form>`;
}

function interviewPanel(s, c, join) {
  const msgs = c.interview.messages;
  return html`<h2>Interview ${c.interview.done ? badge('done', 'good') : c.interview.started ? badge('live', 'accent') : ''}</h2>
    ${!c.interview.started ? html`<button class="primary" data-join>Join interview</button><p class="hint">The hour was charged on your calendar this morning.</p>` : html`
    <div class="chat">${msgs.length ? msgs.map((m) => html`<div class="msg ${m.from}">${m.text}</div>`) : html`<p class="muted small">Open with context, then ask specific questions. ~8–10 questions fill an hour.</p>`}</div>
    ${!c.interview.done ? html`<form id="askForm" style="margin-top:8px"><textarea id="askBox" name="q" rows="2" placeholder="Walk me through the last thing you shipped end to end…">${draft.question[c.id] ?? ''}</textarea>
      <div class="inline"><button class="primary">Ask</button><button type="button" data-finish>End interview & score</button><span class="hint">${msgs.filter((m) => m.from === 'me').length}/10 questions</span></div></form>` : ''}`}`;
}

function offerForm(s, p, c, od) {
  const contractor = c.engagement === 'contractor';
  const corpOk = entityOf(s) === 'ccorp';
  const v = p.equity.valuation;
  return html`<h2>Make an offer</h2>
    <form id="offerForm">
      <div class="grid-2">
        <label>${contractor ? 'Hourly rate ($)' : 'Base salary ($/yr)'} <input id="offPay" type="number" name="pay" value="${od.pay}" min="1" /></label>
        <label>Start date <input id="offStart" type="date" name="start" value="${od.start}" min="${isoDate(s, s.day + (contractor ? 3 : 14))}" /></label>
        ${contractor ? html`<label>Hours/week <input id="offHours" type="number" name="hoursPerWeek" value="${od.hoursPerWeek}" min="5" max="40" /></label>
          ${c.region !== 'us' ? html`<label><input type="checkbox" name="cor" ${od.cor ? 'checked' : ''} /> Deel Contractor of Record ($${VENDORS.deel.cor}/mo, shifts misclassification risk)</label>` : html`<div></div>`}`
          : html`<label>Options (% of company) <input id="offEq" type="number" step="0.05" name="equityPct" value="${od.equityPct}" min="0" max="5" ${corpOk ? '' : 'disabled'} /></label><div class="small muted" style="align-self:center">${corpOk ? html`Pool: ${p.equity.poolPct || 0}% · 409A: ${v && s.day <= v.validUntil ? `strike $${v.fmv}` : html`<span class="warn">none — <a href="#/people/equity">get one</a></span>`}. First engineer typically 0.5–2%, ~0.3% by hire #5.` : 'Options need a Delaware C-corp.'}</div>`}
      </div>
      ${(() => {
        const cost = monthlyCostOf(s, { ...c, kind: contractor ? 'contractor' : 'employee', salary: Number(od.pay) || 0, hourlyRate: Number(od.pay) || 0, hoursPerWeek: Number(od.hoursPerWeek) || 40 });
        const cash = s.bank.accounts[0]?.balance ?? 0;
        const months = cost > 0 ? cash / (cost + monthlyPeopleCost(s)) : 99;
        return html`<div class="callout ${months < 6 ? 'bad' : months < 12 ? 'warn' : ''} small">This hire costs ~${money(cost)}/month fully loaded. Cash today covers ~${months.toFixed(1)} months of your whole team at that cost (before revenue and other bills).</div>`;
      })()}
      ${!ciiaaReady(s) ? html`<div class="callout warn small">No CIIAA template yet: this hire won't sign an invention assignment. Create one in <a href="#/legal/founder">Legal</a> first.</div>` : ''}
      <div class="inline"><button class="primary">Send offer (0.5h)</button><span class="hint">Acceptance depends on pay vs their expectation and market, equity, your stage and runway, competing offers and how the interview went.</span></div>
    </form>`;
}

function aiView(s, p) {
  const active = p.members.filter((m) => m.kind === 'ai_agent' && m.status === 'active');
  const groups = { support: 'Tier-1 support', coding: 'Coding agents', sdr: 'AI SDR (outbound)', books: 'Bookkeeping' };
  const sup = p.support;
  return html`
    <div class="callout">An AI agent is a cheap, always-on, high-volume worker with a quality ceiling — not a free employee. Each needs setup, oversight hours and has failure modes.</div>
    <div class="stats">
      ${stat('AI coding multiplier', `×${p.aiCodingMultiplier}`, `codebase maturity damping ${pct(codebaseMaturity(s), 0)}`)}
      ${stat('Help-center quality', pct(sup.docsQuality, 0), `AI resolves ~${pct(aiResolveRate(sup.docsQuality, 0, s.company.model), 0)} of tickets in year one`)}
      ${stat('Active agents', active.length, money(active.reduce((a, m) => a + (m.monthlyCost ?? 0), 0)) + '/mo')}
    </div>
    <div class="grid-2">${Object.entries(groups).map(([g, title]) => html`<section class="panel"><h2>${title}</h2>
      ${Object.entries(AI_AGENTS).filter(([, a]) => a.group === g).map(([k, a]) => {
        const mine = active.filter((m) => m.agentType === k);
        return html`<div class="card"><div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><b>${a.label}</b><span class="small">${a.pricing ?? `$${a.monthly.toLocaleString('en-US')}/mo`}${a.contractMonths ? ' · annual contract' : ''}</span></div>
          ${a.fails ? html`<div class="small muted">Fails at: ${a.fails}</div>` : ''}${a.note ? html`<div class="small muted">${a.note}</div>` : ''}
          ${mine.map((m) => html`<div class="small">${badge(s.day < (m.readyDay ?? 0) ? `setting up until ${fmtDate(s, m.readyDay)}` : 'active', s.day < (m.readyDay ?? 0) ? 'warn' : 'good')} since ${fmtDate(s, m.startDay)} <button class="sm danger" data-cancel-agent="${m.id}">Cancel${m.contractEndDay > s.day ? ' (owes rest of contract)' : ''}</button></div>`)}
          ${!mine.length || g === 'coding' ? html`<button class="sm" data-agent="${k}">Add${a.setupHours ? ` (${a.setupHours}h setup)` : ''}</button>` : ''}</div>`;
      })}
      ${g === 'support' ? html`<p class="small">Resolution rate depends on your help docs and time live: plan on 30–55% in year one, 55–70% when mature (vendor claims 67–76% count customers who just stopped replying; an independent SMB test found ~38%). <button class="sm" data-docs>Write help-center articles (2h)</button></p>` : ''}
      ${g === 'coding' ? html`<label class="small"><input type="checkbox" id="aiReview" ${p.aiReview ? 'checked' : ''} /> Review every AI change before merge (slower; skipping it is ~15% faster but adds bugs and security debt)</label><p class="small muted">Measured speedups are smaller than people feel (METR 2025: experienced devs 19% slower on mature repos; 2026 update ~+18%). Gains are biggest on greenfield code. One seat per person: founder + each engineer.</p>` : ''}
      ${g === 'sdr' ? html`<p class="small">Run sequences in <a href="#/outreach">Outreach</a>. Game assumption: AI SDR meetings are 0.3–0.6× as good as a strong human SDR's; deliverability and replies still need you.</p>` : ''}
    </section>`)}</div>`;
}

function supportView(s, p) {
  const sup = p.support;
  const w = sup.lastWeek;
  const cfg = SUPPORT[s.company.model];
  const subsAll = s.stripe?.subscriptions ?? [];
  const live = subsAll.filter((x) => x.status === 'active' || x.status === 'past_due');
  const forecast = weeklyTickets(s.company.model, live.length, subsAll.filter((x) => x.status === 'trialing').length, { newCustomers: live.filter((x) => s.day - x.startDay < 30).length, docsQuality: sup.docsQuality });
  return html`
    <div class="stats">
      ${stat('Tickets last week', w ? Math.round(w.total) : '—', w ? `incl. ${Math.round(w.total - w.newTickets)} backlog` : 'computed every Monday')}
      ${stat('AI resolved', w ? Math.round(w.aiResolved) : '—', w?.aiErrors ? `${Math.round(w.aiErrors)} wrong answers bounced back` : '')}
      ${stat('Staff handled', w ? Math.round(w.staffHandled) : '—')}
      ${stat('You answered', w ? `${Math.round(w.founderHandled)} (${w.founderHours.toFixed(1)}h)` : '—', `cap ${sup.founderCapHours}h/week`)}
      ${stat('Unanswered', w ? Math.round(w.unhandled) : '—', w ? `first response ~${w.firstResponseHours == null ? '—' : w.firstResponseHours < 1 ? '<1' : w.firstResponseHours}h · churn ×${w.churnMult}` : '', w && w.unhandled >= 1 ? 'bad' : '')}
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Weekly tickets</h2><canvas id="supChart"></canvas><p class="hint">Bars: total tickets per week.</p></section>
      <section class="panel">
        <h2>How support load works</h2>
        <p class="small">Your model (${cfg.label}): about ${cfg.perCustomerMonth.toFixed(2)} tickets per paying ${s.company.model === 'ent' ? 'account' : 'customer'} per month (×${SUPPORT.firstMonthMult} in their first month; good docs cut ~30%), ${pct(cfg.tier1, 0)} tier-1, ~${cfg.minutes} min each <span class="muted">(game assumptions anchored on thin vendor benchmarks)</span>. Next week forecast: ~${Math.round(forecast)} tickets.</p>
        <p class="small">Order: AI agent (30–55% of tickets in year one, 55–70% once mature with good docs; vendors claim 67–76%) → support staff → you, up to your weekly cap → the rest waits. Churn follows your median first-response time: under 1h ×0.95, over 72h ×1.4 (correlational evidence; game assumption). The software median first response is under an hour.</p>
        <form id="capForm" class="inline"><label>Max hours/week you answer tickets <input type="number" name="cap" value="${sup.founderCapHours}" min="0" max="30" /></label><button>Save</button></form>
        <p class="small">Help-center content: ${sup.docsHours}h written (quality ${pct(sup.docsQuality, 0)}). <button class="sm" data-docs>Write articles (2h)</button></p>
      </section>
    </div>`;
}

function payrollView(s, p) {
  const next = nextPayDay(s);
  const preview = next ? payrollLines(s, p.members, payPeriod(s, next)) : [];
  const bills = vendorBills(p.members);
  const year = new Date(Date.parse(s.startDate) + s.day * 86400000).getUTCFullYear();
  const contractors = p.members.filter((m) => m.engagement === 'contractor');
  return html`
    <div class="stats">
      ${stat('Next pay date', next ? fmtDate(s, next) : '—', 'semi-monthly: 15th & last day')}
      ${stat('Next run (est.)', money(preview.reduce((a, l) => a + l.gross + l.employer, 0)), `${preview.length} on payroll`)}
      ${stat('Burden', `${burdenRate(s).toFixed(2)}×`, 'US employer taxes & benefits')}
      ${stat('Vendors', money(bills.gusto + bills.deel) + '/mo', `Gusto ${money(bills.gusto)} · Deel ${money(bills.deel)}`)}
    </div>
    <section class="panel"><h2>Payroll runs</h2>
      ${table({
        columns: [
          { label: 'Pay date', render: (r) => fmtDate(s, r.day) },
          { label: 'Period', render: (r) => `${fmtDate(s, r.start)} – ${fmtDate(s, r.end)}` },
          { label: 'People', align: 'right', render: (r) => r.lines.length },
          { label: 'Gross wages', align: 'right', render: (r) => money(r.gross, { cents: true }) },
          { label: 'Employer taxes/benefits', align: 'right', render: (r) => money(r.employer, { cents: true }) },
        ],
        rows: p.runs.slice(0, 12), empty: 'No payroll yet. Gusto debits gross pay and employer taxes from your bank on each pay date.',
      })}</section>
    <section class="panel"><h2>Contractor payments ${year}</h2>
      ${table({
        columns: [
          { label: 'Contractor', render: (m) => m.name },
          { label: 'Where', render: (m) => regionLabel(m.region) },
          { label: `Paid ${year}`, align: 'right', render: (m) => money(m.paidByYear?.[year] ?? 0) },
          { label: '1099-NEC', render: (m) => (m.region !== 'us' ? html`<span class="small muted">no (W-8BEN, non-US)</span>` : (m.paidByYear?.[year] ?? 0) >= 2000 ? badge('required by Jan 31', 'warn') : html`<span class="small muted">under $2,000</span>`) },
        ],
        rows: contractors, empty: 'No contractors.',
      })}
      <p class="hint">Contractors invoice monthly; US contractors are paid by ACH (collect a W-9 first), contractors abroad through Deel. Legal tracks the 1099 deadline.</p></section>`;
}

function equityView(s, p) {
  const corp = entityOf(s) === 'ccorp';
  const v = p.equity.valuation;
  const valid = v && s.day <= v.validUntil;
  const grants = p.members.filter((m) => m.grant);
  const used = p.members.filter((m) => m.status !== 'gone').reduce((a, m) => a + (m.equityPct || 0), 0);
  return html`
    ${!corp ? html`<div class="callout warn">Stock options need a C-corp (${entityOf(s) === 'llc' ? 'LLCs grant profits interests instead — lawyer territory' : 'you are not incorporated'}). <a href="#/legal">Legal</a></div>` : ''}
    <div class="grid-2">
      <section class="panel"><h2>409A valuation</h2>
        <p class="small">Required before granting options so the strike price equals fair market value (IRC §409A safe harbor). Early-stage cost $1k–5k; refresh every 12 months or after a material event like a priced round.</p>
        ${v ? html`<p>Common stock FMV <b>$${v.fmv}</b>/share · ${valid ? badge(`valid until ${fmtDate(s, v.validUntil)}`, 'good') : badge('expired', 'bad')}</p>` : html`<p class="muted">None yet.</p>`}
        <button data-409a ${corp ? '' : 'disabled'}>Order 409A (${money(EQUITY.valuation409A.cost)}, ${EQUITY.valuation409A.hours}h of data prep)</button>
      </section>
      <section class="panel"><h2>Option pool</h2>
        <p class="small">Post-seed pools are ~10–15%. VCs often require a pool top-up before a priced round, which dilutes founders, not them.</p>
        <p>Pool: <b>${p.equity.poolPct || 0}%</b> · granted ${used.toFixed(2)}%</p>
        <form id="poolForm" class="inline"><label>Pool size % <input type="number" name="pct" value="${p.equity.poolPct || EQUITY.poolDefaultPct}" min="1" max="25" step="0.5" ${corp ? '' : 'disabled'} /></label><button ${corp ? '' : 'disabled'}>Board consent (1h)</button></form>
      </section>
    </div>
    <section class="panel"><h2>Grants</h2>
      ${table({
        columns: [
          { label: 'Holder', render: (m) => m.name },
          { label: 'Options', align: 'right', render: (m) => `${m.grant.pct}%` },
          { label: 'Strike', align: 'right', render: (m) => (m.grant.strike != null ? `$${m.grant.strike}` : badge('awaiting 409A', 'warn')) },
          { label: 'Vesting', render: (m) => `4y, 1y cliff from ${fmtDate(s, m.grant.vestStart)}` },
          { label: 'Vested', align: 'right', render: (m) => (m.status === 'gone' ? `${m.grant.vestedAtExit ?? 0}% (left)` : `${vestedPct(m, s.day)}%`) },
        ],
        rows: grants, empty: 'No grants.',
      })}
      <p class="hint">Cap table export for Fundraising: ${optionGrants(s).length} active grants.</p></section>`;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default {
  id: 'people',
  title: 'People',
  icon: '👥',
  group: 'Company',
  badge: (s) => {
    const p = s.apps.people;
    if (!p) return 0;
    return p.candidates.filter((c) => c.stage === 'new' || (c.stage === 'interview_scheduled' && c.interview?.day === s.day)).length || 0;
  },
  onDay: peopleDay,
  onMonthEnd: peopleMonthEnd,
  jobs: { 'reply:candidate': replyCandidate },
  render(root, ctx) {
    const s = ctx.state;
    const p = ensurePeople(s);
    const param = ctx.params || '';
    const cand = param.startsWith('cand_') ? findCand(p, param) : null;
    const tab = cand ? 'hiring' : TABS.some(([k]) => k === param) ? param : '';
    const views = { '': teamView, hiring: hiringView, ai: aiView, support: supportView, payroll: payrollView, equity: equityView };
    mount(root, html`
      <div class="app-head"><div><h1>People</h1><p>Payroll (Gusto), contractors & EOR (Deel), hiring, equity and your AI workforce. General information, not legal or tax advice.</p></div></div>
      <div class="tabs">${TABS.map(([k, l]) => html`<a href="#/people${k ? '/' + k : ''}" class="${tab === k && !cand ? 'active' : ''}">${l}</a>`)}</div>
      ${cand ? candidateView(s, p, cand) : views[tab](s, p)}`);

    if (tab === 'support' && !cand) {
      const c = root.querySelector('#supChart');
      if (c) barChart(c, p.support.history.slice(-26).map((h) => Math.round(h.total)), { format: (v) => String(Math.round(v)) });
    }

    // ---- team ----
    on(root, 'click', '[data-setup]', (e, el) => ctx.act((st) => setupPayroll(st, el.dataset.setup), { hours: el.dataset.setup === 'gusto' ? 2 : 1, label: `${el.dataset.setup === 'gusto' ? 'Gusto' : 'Deel'} setup` }));
    on(root, 'submit', '#benefitsForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { ensurePeople(st).benefits = f.benefits; }, { hours: 0.5, label: 'Benefits setup' }); });
    on(root, 'click', '[data-letgo]', (e, el) => {
      const m = p.members.find((x) => x.id === el.dataset.letgo);
      if (!m) return;
      if (m.kind === 'ai_agent' || m.status === 'offer' || m.engagement === 'contractor') {
        modal({ title: `${m.kind === 'ai_agent' ? 'Cancel' : m.status === 'offer' ? 'Rescind offer for' : 'End contract with'} ${m.name}?`, body: html`<p>${m.contractEndDay > s.day ? `This is an annual contract: you owe the remaining ${Math.ceil((m.contractEndDay - s.day) / 30)} months.` : 'Effective today.'}</p>`, actions: [{ label: 'Keep' }, { label: 'Confirm', primary: true, onClick: () => ctx.act((st) => terminate(st, m.id, { reason: 'contract ended' }), { hours: m.kind === 'ai_agent' ? 0.25 : 0.5, label: 'Offboarding' }) }] });
        return;
      }
      modal({
        title: `Let ${m.name} go`,
        body: html`<p class="small">Do it in person/video, with a written separation agreement and release. Final pay timing is set by state law (California: on the last day). Market practice for small startups: 2–4 weeks severance; game range ${SEVERANCE.weeksRange.join('–')} weeks + COBRA support.</p>
          <label>Severance weeks <input type="number" name="weeks" value="4" min="0" max="26" /></label>`,
        actions: [{ label: 'Cancel' }, { label: 'Let go (1h)', primary: true, onClick: (d, form) => { const w = Number(form.weeks.value) || 0; ctx.act((st) => terminate(st, m.id, { severanceWeeks: w }), { hours: 1, label: 'Offboarding' }); } }],
      });
    });

    // ---- hiring ----
    const saveJobDraft = () => { const f = root.querySelector('#jobForm'); if (f) Object.assign(draft.job, formData(f)); };
    on(root, 'input', '#jobForm textarea, #jobForm input', saveJobDraft);
    on(root, 'change', '#jobForm select', () => {
      saveJobDraft();
      if (draft.job.region === 'us' && draft.job.engagement === 'eor') draft.job.engagement = 'employee';
      if (draft.job.region !== 'us' && draft.job.engagement === 'employee') draft.job.engagement = 'eor';
      ctx.render();
    });
    on(root, 'submit', '#jobForm', (e) => {
      e.preventDefault();
      saveJobDraft();
      const d = { ...draft.job };
      e.target.querySelector('button.primary').textContent = 'Candidates are reading your post…';
      ctx.act(async (st) => {
        const job = createJob(st, { ...d, payLo: Number(d.payLo) || 0, payHi: Number(d.payHi) || 0, hoursPerWeek: Number(d.hoursPerWeek) || 40 });
        applyJudge(job, await judgeJobPost(ctx, job));
        draft.job.text = ''; draft.job.title = '';
        ctx.toast(`Post reviewed: clarity ${job.judge.clarity}/10, specificity ${job.judge.specificity}/10. Now choose channels.`, 'good');
      }, { hours: 1, label: 'Write job post' });
    });
    on(root, 'change', '.chanForm input', (e, el) => {
      const form = el.closest('form');
      draft.channels[form.dataset.job] = [...form.querySelectorAll('input:checked')].map((i) => i.name);
    });
    on(root, 'submit', '.chanForm', (e) => {
      e.preventDefault();
      const id = e.target.dataset.job;
      const chosen = [...e.target.querySelectorAll('input:checked')].map((i) => i.name);
      const job = findJob(p, id);
      const added = chosen.filter((c) => !job.channels.includes(c));
      const hours = 0.25 + added.reduce((a, c) => a + (CHANNELS[c]?.hours ?? 0), 0);
      ctx.act((st) => { openJob(st, id, chosen); delete draft.channels[id]; }, { hours, label: 'Post job to channels' });
    });
    on(root, 'click', '[data-close-job]', (e, el) => ctx.act((st) => closeJob(st, el.dataset.closeJob)));

    // ---- candidate ----
    if (cand) {
      on(root, 'click', '[data-screen]', (e, el) => ctx.act((st) => screenCandidate(st, cand.id, el.dataset.screen === '1'), { hours: el.dataset.screen === '1' ? 0.5 : 0.05, label: 'Candidate screen' }));
      on(root, 'submit', '#schedForm', (e) => {
        e.preventDefault();
        const [day, start] = formData(e.target).slot.split(':').map(Number);
        ctx.act((st) => { scheduleInterview(st, cand.id, { day, start }); ctx.toast(`Interview booked for ${fmtDate(st, day)} ${fmtTime(start)}.`, 'good'); }, { hours: 0.05, label: 'Schedule interview' });
      });
      on(root, 'click', '[data-reject]', () => ctx.act((st) => rejectCandidate(st, cand.id), { hours: 0.05, label: 'Reject candidate' }));
      on(root, 'click', '[data-join]', () => ctx.act((st) => startInterview(st, cand.id)));
      on(root, 'input', '#askBox', (e) => { draft.question[cand.id] = e.target.value; });
      on(root, 'submit', '#askForm', async (e) => {
        e.preventDefault();
        const q = String(formData(e.target).q ?? '').trim();
        if (!q) return;
        if (cand.interview.messages.filter((m) => m.from === 'me').length >= 10) { ctx.toast('The hour is up. End the interview.', 'warn'); return; }
        e.target.querySelector('button.primary').disabled = true;
        draft.question[cand.id] = '';
        await ctx.act(() => interviewTurn(ctx, cand.id, q.slice(0, 1000)));
        root.ownerDocument.getElementById('askBox')?.focus();
      });
      on(root, 'click', '[data-finish]', () => ctx.act((st) => { const c = finishInterview(st, cand.id); ctx.toast(`Your read: ${Math.round(c.estimate.q * 10)}/10 (±${Math.round(c.estimate.sd * 10)}).`, 'good'); }));
      on(root, 'input', '#offerForm input', (e) => {
        const f = formData(e.target.form);
        Object.assign(draft.offer[cand.id], { pay: f.pay, equityPct: f.equityPct ?? 0, start: f.start, hoursPerWeek: f.hoursPerWeek ?? 40, cor: Boolean(f.cor) });
      });
      on(root, 'submit', '#offerForm', (e) => {
        e.preventDefault();
        const f = formData(e.target);
        const contractor = cand.engagement === 'contractor';
        ctx.act((st) => {
          makeOffer(st, cand.id, { salary: contractor ? null : f.pay, hourlyRate: contractor ? f.pay : null, equityPct: Number(f.equityPct) || 0, startDay: dayFromIso(st, f.start), hoursPerWeek: f.hoursPerWeek ?? 40, cor: Boolean(f.cor) });
          ctx.toast('Offer sent. Follow the thread in Mail.', 'good');
        }, { hours: 0.5, label: 'Write offer' });
      });
    }

    // ---- AI ----
    on(root, 'click', '[data-agent]', (e, el) => {
      const a = AI_AGENTS[el.dataset.agent];
      ctx.act((st) => { hireAgent(st, el.dataset.agent); ctx.toast(`${a.label} added.${a.setupDays ? ` Live after ${a.setupDays} days of setup.` : ''}`, 'good'); }, { hours: a.setupHours ?? 0, label: `Set up ${a.label}` });
    });
    on(root, 'click', '[data-cancel-agent]', (e, el) => ctx.act((st) => cancelAgent(st, el.dataset.cancelAgent), { hours: 0.25, label: 'Cancel AI agent' }));
    on(root, 'change', '#aiReview', (e) => ctx.act((st) => { ensurePeople(st).aiReview = e.target.checked; }));
    on(root, 'click', '[data-docs]', () => ctx.act((st) => writeHelpDocs(st, 2), { hours: 2, label: 'Write help-center articles' }));
    on(root, 'submit', '#capForm', (e) => { e.preventDefault(); const cap = clamp(Number(formData(e.target).cap) || 0, 0, 30); ctx.act((st) => { ensurePeople(st).support.founderCapHours = cap; }); });

    // ---- equity ----
    on(root, 'click', '[data-409a]', () => ctx.act((st) => { const v = get409A(st); ctx.toast(`409A done: common FMV $${v.fmv}/share.`, 'good'); }, { hours: EQUITY.valuation409A.hours, label: '409A valuation' }));
    on(root, 'submit', '#poolForm', (e) => { e.preventDefault(); const v = Number(formData(e.target).pct); ctx.act((st) => createPool(st, v), { hours: 1, label: 'Option pool board consent' }); });
  },
};
