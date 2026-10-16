// Hiring UI (Ashby-lite): job posts + scorecards, sourcing channels & agencies, pipeline, candidate page
// with a live structured interview, assessments and evidence. Rendering only; actions live in sim.js.

import { html, badge } from '../../core/ui.js';
import { money, pct, fmtDate, isoDate } from '../../core/util.js';
import { findSlots, fmtTime } from '../../core/calendar.js';
import { findThread } from '../../core/mail.js';
import { TRAITS, ROLES as DATA_ROLES, METHODS } from '../../data/roles.js';
import { JOB_ROLES, REGIONS, VENDORS, EOR_LOAD, employerAnnual } from './catalog.js';
import { regionLabel, marketMid } from './hiring.js';
import { monthlyCostOf } from './payroll.js';
import { monthlyPeopleCost } from './capacity.js';
import { agencyOf, channelsFor, costText, setupHours } from './sourcing.js';
import { ASSESSMENTS } from './assess.js';
import { toFive, TYPE_LABEL, interviewExecution } from './interview.js';
import { findJob, interviewEvent, canJoin, candidateEstimates, searchRecruiters } from './sim.js';
import { engagements as agencyEngagements } from '../channels/agencies.js';
import { entityOf, ciiaaReady } from '../legal/api.js';
import { bgPanel, aiEvalPanel, criteriaPanel } from './views-manage.js';
import { companyHoursPanel, regionGuide, candidateGlobalCard, candidateGlobalLine } from './views-global.js';
import { isFractionalRole, partTimeFit } from './global.js';
import { REGION_DATA } from '../../data/regions.js';
import { payLawNote } from './views-ops.js';

export const draft = {
  job: { role: 'engineer', region: 'us', engagement: 'employee', title: '', payLo: '', payHi: '', hoursPerWeek: 40, text: '', requiredOverlap: 0, allowShift: false, senior: false },
  question: {}, offer: {}, channels: {}, recruiter: {}, scorecard: {}, ratings: {}, camera: {},
};

export const ENG_LABEL = { employee: 'Employee (W-2, Gusto)', part_time_employee: 'Part-time employee (10–30 h/week)', eor: 'Employee via EOR (Deel)', contractor: 'Contractor (5–40 h/week)', fractional: 'Fractional executive (4–20 h/week)' };
// What a job or candidate is called on screen: part-time and fractional are flags on an employee/EOR/contractor underneath.
export const engOf = (x) => (x.fractional ? ENG_LABEL.fractional : x.partTime ? (x.engagement === 'eor' ? 'Part-time employee via EOR (Deel)' : ENG_LABEL.part_time_employee) : ENG_LABEL[x.engagement]);
// Engagement choices for a region: US hires are W-2, abroad needs an EOR; fractional is for the executive roles.
export const engagementsFor = (region, role) => (isFractionalRole(role) ? ['fractional', 'contractor'] : [region === 'us' ? 'employee' : 'eor', 'part_time_employee', 'contractor']);
export const STAGES = [['new', 'Applied'], ['screened', 'Screened'], ['interview_scheduled', 'Interview booked'], ['interviewed', 'Interviewed'], ['offer', 'Offer out'], ['hired', 'Hired']];
const traitLabel = (k) => (k === 'composite' ? 'Overall fit for the role' : TRAITS[k]?.label ?? k);

function compGuide(s, d) {
  const { role, region, engagement } = d;
  const r = JOB_ROLES[role];
  const hourly = engagement === 'contractor' || engagement === 'fractional';
  const [lo, hi] = hourly ? r.hourly[region] : r.salary[region];
  const unit = hourly ? '/hour' : '/year base (full-time equivalent)';
  const fmt = (n) => (hourly ? `$${n}` : money(n));
  const emp = engagement === 'employee' || (engagement === 'part_time_employee' && region === 'us');
  const hours = Number(d.hoursPerWeek) || 40;
  const loaded = emp ? `Fully loaded ≈ ${money(lo + employerAnnual(s, lo, { hours: engagement === 'part_time_employee' ? hours : 40 }))}–${money(hi + employerAnnual(s, hi, { hours: engagement === 'part_time_employee' ? hours : 40 }))}/yr at full time (FICA up to the $184.5k wage base, FUTA/SUTA${hours >= 30 ? ', health' : ', no health plan under 30 h'}${s.company.path === 'vc' ? ', 401k match' : ''}).` : engagement === 'fractional' ? `At ${Math.min(20, Math.max(4, hours))}h/week that is about ${money(lo * hours * 52 / 12)}–${money(hi * hours * 52 / 12)}/month (researched retainers: CFO $4–8k, CMO $5–10k [secondary]).` : engagement === 'eor' || engagement === 'part_time_employee' ? `EOR adds ~${pct(EOR_LOAD[region] ?? 0.25, 0)} statutory load + Deel's $${VENDORS.deel.eor}/month ($499–699 by plan [secondary]); ${r.src}.` : `Contractors abroad pay $${VENDORS.deel.contractor}/month in Deel fees, ${REGION_DATA[region]?.fxFeePct ? `plus ~${pct(REGION_DATA[region].fxFeePct, 1)} FX and payout fees; ` : ''}Contractor of Record is $${VENDORS.deel.cor}/month.`;
  const dr = DATA_ROLES[role];
  const top = Object.entries(dr?.traitWeights ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => TRAITS[k].label);
  return html`<div class="callout small"><b>${r.label}, ${REGIONS[region].label}:</b> ${fmt(lo)}–${fmt(hi)} ${unit}. ${loaded} Ramp ${dr ? `${dr.rampWeeks.full[0]}–${dr.rampWeeks.full[1]} weeks` : `~${r.rampWeeks} weeks`}. <span class="muted">${r.src}.</span>
    ${top.length ? html`<br>What predicts performance here: ${top.join(', ')}.` : ''}</div>
    ${regionGuide(s, d, r)}
    ${payLawNote(s, d)}`;
}

export function hiringView(s, p) {
  const d = draft.job;
  const jobs = p.jobs.filter((j) => j.status !== 'closed' || s.day - (j.closedDay ?? 0) < 30);
  const cands = p.candidates.filter((c) => STAGES.some(([k]) => k === c.stage));
  const disputes = (p.disputes ?? []).filter((x) => x.status === 'open');
  return html`
    ${disputes.map((x) => html`<div class="callout bad"><b>Fee claim from ${x.agency}:</b> ${money(x.amount)} for hiring ${x.name} (they submitted this person within their candidate-ownership window).
      <div class="inline" style="margin-top:6px"><button class="sm" data-dispute="${x.id}:pay">Pay</button><button class="sm" data-dispute="${x.id}:dispute">Dispute (2h; ~35% win, legal costs if you lose)</button></div></div>`)}
    <div class="grid-2">
      <section class="panel">
        <h2>Write a job post</h2>
        <form id="jobForm">
          <div class="grid-3">
            <label>Role <select name="role">${Object.entries(JOB_ROLES).map(([k, r]) => html`<option value="${k}" ${d.role === k ? 'selected' : ''}>${r.label}</option>`)}</select></label>
            <label>Where <select name="region">${Object.entries(REGIONS).map(([k, r]) => html`<option value="${k}" ${d.region === k ? 'selected' : ''}>${r.label}</option>`)}</select></label>
            <label>Engagement <select name="engagement">${engagementsFor(d.region, d.role).map((k) => html`<option value="${k}" ${d.engagement === k ? 'selected' : ''}>${ENG_LABEL[k]}</option>`)}</select></label>
          </div>
          ${compGuide(s, d)}
          <label>Title <input id="jobTitle" name="title" value="${d.title}" placeholder="${JOB_ROLES[d.role].label}" maxlength="80" /></label>
          <div class="grid-3">
            <label>Pay from (${['contractor', 'fractional'].includes(d.engagement) ? '$/h' : '$/yr, full-time equivalent'}) <input id="jobPayLo" type="number" name="payLo" value="${d.payLo}" min="0" /></label>
            <label>Pay to <input id="jobPayHi" type="number" name="payHi" value="${d.payHi}" min="0" /></label>
            ${['contractor', 'fractional', 'part_time_employee'].includes(d.engagement) ? html`<label>Hours/week <input id="jobHours" type="number" name="hoursPerWeek" value="${d.hoursPerWeek}" min="${d.engagement === 'fractional' ? 4 : d.engagement === 'part_time_employee' ? 10 : 5}" max="${d.engagement === 'fractional' ? 20 : d.engagement === 'part_time_employee' ? 30 : 40}" /></label>` : html`<div></div>`}
          </div>
          <div class="grid-3">
            <label>Required overlap with your core hours (h/day) <input type="number" name="requiredOverlap" value="${d.requiredOverlap}" min="0" max="8" step="0.5" /></label>
            <label style="align-self:end"><input type="checkbox" name="allowShift" ${d.allowShift ? 'checked' : ''} /> Accept shifted or night hours (about +10% pay)</label>
            <label style="align-self:end"><input type="checkbox" name="senior" ${d.senior ? 'checked' : ''} /> Senior only (thinner pool, longer to fill)</label>
          </div>
          <label>Post <textarea id="jobText" name="text" rows="10" placeholder="Who you are (stage, customers, team). What they will own. What success looks like in 30/60/90 days. Must-haves vs nice-to-haves. Pay range. Interview process.">${d.text}</textarea></label>
          <div class="inline"><button class="primary">Publish & get candidate feedback (1h)</button><span class="hint">Strong candidates skim like customers: specific outcomes and a pay range win. Many US states and the EU Pay Transparency Directive require ranges. Your core hours: <a href="#/people/hiring">set below</a>.</span></div>
        </form>
      </section>
      <section class="panel">
        <h2>Job posts</h2>
        ${jobs.length ? jobs.map((j) => jobCard(s, p, j)) : html`<p class="empty">No posts yet. Time-to-hire for a part-time founder is typically 4–10 weeks (game assumption; ATS median ~30–40 days).</p>`}
      </section>
    </div>
    ${companyHoursPanel(s, p)}
    <section class="panel">
      <h2>Pipeline</h2>
      <div class="kanban">${STAGES.map(([k, label]) => {
        const list = cands.filter((c) => c.stage === k).slice(0, 25);
        return html`<div class="col"><h4>${label} <span>${list.length}</span></h4>${list.map((c) => {
          const est = candidateEstimates(c).composite;
          return html`<a class="card" style="display:block;text-decoration:none;color:inherit" href="#/people/${c.id}"><b>${c.name}</b><div class="small muted">${JOB_ROLES[c.role]?.label ?? c.role} · ${regionLabel(c.region)} · ${c.years}y · ${agencyOf(s, c.channel)?.label ?? c.channel}</div>
          ${candidateGlobalLine(s, c) ? html`<div class="small muted">${candidateGlobalLine(s, c).text}</div>` : ''}
          <div class="small">${k === 'new' ? '' : c.engagement === 'contractor' ? `$${c.expectation}/h` : money(c.expectation)}${est ? html` · read ${toFive(est.z).toFixed(1)}/5 ±${est.sd.toFixed(1)}` : ''}${c.redFlags?.length ? html` · <span class="neg">⚑ ${c.redFlags.length}</span>` : ''}</div>
          ${k === 'interview_scheduled' && c.interview ? html`<div class="small ${c.interview.day === s.day ? 'pos' : 'muted'}">${c.interview.day === s.day ? 'Today — join now' : fmtDate(s, c.interview.day)}</div>` : ''}</a>`;
        })}</div>`;
      })}</div>
      <p class="hint">Candidates who wait more than a week without hearing from you start taking other offers. Brainteasers, GPA filters and "culture fit" chats don't predict performance; structured interviews (.42), job-knowledge tests (.40) and work samples (.33) do (Sackett et al. 2022).</p>
    </section>`;
}

// Niche recruiting agencies (channels/agencies.js): describe who you need and where, vet the firms, hire one for this job.
function recruiterSearch(s, j) {
  const d = (draft.recruiter[j.id] ??= { query: '', searched: false });
  let res = null;
  try { if (d.searched) res = searchRecruiters(s, j.id, d.query); } catch { res = null; }
  const hired = (j.channels ?? []).map((id) => agencyOf(s, id)).filter((a) => a?.niche);
  return html`<details class="recruiterBox" ${d.searched || hired.length ? 'open' : ''}><summary class="small"><b>Find a niche recruiter</b> <span class="muted">(agencies that know your role, city and industry)</span></summary>
    ${hired.map((a) => html`<div class="small">${badge('hired', 'good')} <b>${a.label}</b> · ${Math.round(a.costModel.pct * 100)}% of first-year base on acceptance${a.guaranteeDays ? `, ${a.guaranteeDays}-day guarantee` : ', no guarantee'}</div>`)}
    <form class="recForm" data-job="${j.id}"><label class="small">Who they must know <input name="query" value="${d.query}" placeholder="recruiters for senior iOS engineers in Austin fintech" /></label> <button class="sm">Search (30 min)</button></form>
    ${res ? (res.listings.length ? html`<div class="small muted">${res.listings.length} firms for ${res.nicheLabel || 'your market'}. Quality is hidden: references flatter, a client they did not list does not, a paid trial shows real work.</div>
      ${res.listings.map((l) => html`<div class="card"><b>${l.name}</b> <span class="small muted">${l.specialty === 'specialist' ? 'specialist in this niche' : l.specialty === 'vertical' ? 'knows your industry' : 'generalist'} · ~${Math.round(Math.min(0.3, Math.max(0.12, l.priceUsd / 100000)) * 100)}% of first-year base${l.guaranteeDays ? ` · ${l.guaranteeDays}-day guarantee` : ' · no guarantee'}${l.upfrontPct ? ` · deposit ${Math.round(l.upfrontPct * 50)}% of a fee` : ''}</span>
        <div class="small muted">${l.pitch}</div>
        ${l.estimate == null ? '' : html`<div class="small">What you know: ~${pct(l.estimate, 0)} ± ${Math.round((l.estimateSd ?? 0.3) * 100)}</div>`}${(l.referenceNotes ?? []).map((t) => html`<div class="small muted">${t}</div>`)}${l.trialNote ? html`<div class="small muted">${l.trialNote}</div>` : ''}
        <div class="inline">${l.engaged ? badge('hired', 'good') : html`<button class="sm" data-rec-ref="${l.id}">References (1.5h)</button> <button class="sm" data-rec-back="${l.id}">Call a client they did not list (2.5h)</button> <button class="sm" data-rec-trial="${l.id}" data-job="${j.id}">Paid trial</button> <button class="sm primary" data-rec-hire="${l.id}" data-job="${j.id}">Hire for this job</button>`}</div></div>`)}`
      : html`<p class="small muted">No niche agency matches that description; the generic channels above are your fallback.</p>`) : ''}</details>`;
}

function jobCard(s, p, j) {
  const sel = draft.channels[j.id] ?? j.channels;
  const fits = channelsFor(s, j);
  const sc = j.scorecard;
  const sd = (draft.scorecard[j.id] ??= { mission: '', outcomes: '', competencies: Object.entries(DATA_ROLES[j.role]?.traitWeights ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k) });
  return html`<div class="card">
    <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><b>${j.title}</b>${badge(j.status, j.status === 'open' ? 'good' : '')}</div>
    <div class="small muted">${engOf(j)}${j.hoursPerWeek < 40 ? ` · ${j.hoursPerWeek}h/wk` : ''} · ${REGIONS[j.region].label}${j.requiredOverlap ? ` · ${j.requiredOverlap}h overlap${j.allowShift ? ' (shifts ok)' : ''}` : ''}${j.senior ? ' · senior' : ''} · opened ${j.openedDay != null ? fmtDate(s, j.openedDay) : '—'}</div>
    ${j.judge ? html`<div class="small">Clarity ${j.judge.clarity}/10 · specificity ${j.judge.specificity}/10 · pay range ${j.judge.payTransparency ? '✓' : '✗'}${j.judge.mock ? ' · offline judge' : ''}</div>
      <p class="small">"${j.judge.firstImpression}"</p>
      ${j.judge.issues.length ? html`<ul class="small" style="margin:4px 0;padding-left:18px">${j.judge.issues.map((i) => html`<li>${i}</li>`)}</ul>` : ''}` : ''}
    ${j.status === 'open' ? html`<div class="small">${j.applications} applications${j.aiApplications ? ` (~${j.aiApplications} AI-mass-applied)` : ''} → ${j.shortlisted} profiles on your shortlist</div>` : ''}
    <details ${sc ? '' : 'open'}><summary class="small"><b>Structured scorecard</b> ${sc ? badge('ready', 'good') : badge('none — interviews will be less valid', 'warn')}</summary>
      ${sc ? html`<p class="small">${sc.mission}</p><ul class="small" style="padding-left:18px">${sc.outcomes.map((o) => html`<li>${o}</li>`)}</ul><p class="small">Competencies: ${sc.competencies.map((k) => TRAITS[k]?.label ?? k).join(', ')}</p>` : html`
      <form class="scForm" data-job="${j.id}">
        <label class="small">Mission (one sentence) <input name="mission" value="${sd.mission}" maxlength="300" /></label>
        <label class="small">3–5 outcomes for the first 6–12 months (one per line) <textarea name="outcomes" rows="3">${sd.outcomes}</textarea></label>
        <div class="small">Competencies to score: ${Object.keys(TRAITS).filter((k) => k !== 'polish').map((k) => html`<label style="display:inline-flex;gap:4px;margin:2px 8px 2px 0"><input type="checkbox" name="c_${k}" ${sd.competencies.includes(k) ? 'checked' : ''} /> ${TRAITS[k].label}</label>`)}</div>
        <button class="sm">Save scorecard (${METHODS.structuredInterview.costHours.design}h)</button>
      </form>`}
    </details>
    ${j.status !== 'closed' ? criteriaPanel(s, p, j) : ''}
    <div class="small">Work sample: ${j.workSampleReady ? badge('designed', 'good') : html`<button class="sm" data-ws-design="${j.id}">Design it (${METHODS.workSample.costHours.design}h)</button>`} <span class="muted">${DATA_ROLES[j.role]?.workSample?.description ?? ''}</span></div>
    ${j.status !== 'closed' ? html`<form class="chanForm" data-job="${j.id}">
      <h3>Sourcing channels & agencies</h3>
      ${fits.map((a) => html`<label style="margin:4px 0"><input type="checkbox" name="${a.id}" ${sel.includes(a.id) ? 'checked' : ''} ${j.channels.includes(a.id) ? 'disabled' : ''} /> <b>${a.label}</b> <span class="small muted">— ${costText(a)}; first candidates in ${a.daysToFirstCandidate[0]}–${a.daysToFirstCandidate[1]} days; ${setupHours(a)}h setup. Watch out: ${a.pitfalls[0]}.</span></label>`)}
      <div class="inline"><button class="sm primary">${j.status === 'open' ? 'Add channels' : 'Open job'}</button>${j.status === 'open' ? html`<button type="button" class="sm" data-close-job="${j.id}">Close</button>` : ''}</div></form>` : ''}
    ${j.status !== 'closed' && j.judge && j.engagement !== 'contractor' ? recruiterSearch(s, j) : ''}
  </div>`;
}

function evidenceTable(c) {
  const est = candidateEstimates(c);
  const rows = Object.entries(est).filter(([, e]) => e);
  if (!rows.length) return html`<p class="small muted">No evidence yet. Every method gives a noisy read; better methods (and better questions) give tighter reads.</p>`;
  return html`<div class="table-wrap"><table><thead><tr><th>Trait</th><th class="r">Read (1–5)</th><th class="r">±</th><th>From</th></tr></thead><tbody>
    ${rows.map(([k, e]) => html`<tr><td>${traitLabel(k)}</td><td class="r"><b>${toFive(e.z).toFixed(1)}</b></td><td class="r">${e.sd.toFixed(1)}</td><td class="small muted">${e.methods.join(', ')}</td></tr>`)}
  </tbody></table></div><p class="hint">3 = median applicant. ± is how uncertain the read is. Polish (confident, fluent answers) inflates interview reads, especially in unstructured interviews.</p>`;
}

export function candidateView(s, p, c) {
  const job = findJob(p, c.jobId);
  const contractor = c.engagement === 'contractor';
  const ev = interviewEvent(s, c);
  const join = canJoin(s, c);
  const thread = findThread(s, c.id);
  const mid = marketMid(c.role, c.region, contractor);
  const od = (draft.offer[c.id] ??= { pay: c.expectation, equityPct: 0, start: isoDate(s, s.day + Math.max(contractor ? 7 : 21, c.noticeDays ?? 0)), hoursPerWeek: c.hoursPerWeek ?? job?.hoursPerWeek ?? 40, cor: false, localIp: false });
  const stageLabel = STAGES.find(([k]) => k === c.stage)?.[1] ?? c.stage;
  const active = ['screened', 'interview_scheduled', 'interviewed'].includes(c.stage);
  return html`
    <p><a href="#/people/hiring">← Pipeline</a></p>
    <div class="grid-2">
      <section class="panel">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><h2 style="margin:0">${c.name}</h2>${badge(stageLabel, ['declined', 'withdrawn', 'rejected'].includes(c.stage) ? 'bad' : c.stage === 'hired' ? 'good' : 'accent')}</div>
        <p class="small muted">${JOB_ROLES[c.role]?.label ?? c.role} · ${c.location} · ${c.years} years · via ${agencyOf(s, c.channel)?.label ?? c.channel} · applied ${fmtDate(s, c.appliedDay)}${c.aiApplication ? ' · application looks AI-written' : ''}</p>
        ${c.withdrawReason ? html`<div class="callout warn small">${c.name} ${c.withdrawReason}.</div>` : ''}
        <p class="small">For: ${job?.title ?? '—'} (${engOf(c)})</p>
        ${candidateGlobalCard(s, c)}
        <h3>Resume</h3>
        <ul class="list small">${c.signals.map((x) => html`<li class="${x.tone === 'good' ? 'pos' : x.tone === 'bad' ? 'neg' : 'muted'}">${x.tone === 'good' ? '+' : x.tone === 'bad' ? '−' : '·'} ${x.text}</li>`)}</ul>
        <p class="small">Expectation: ${c.stage === 'new' ? html`<span class="muted">ask in the screen</span>` : contractor ? `$${c.expectation}/hour` : `${money(c.expectation)}/yr`} · Market mid: ${contractor ? `$${mid}/h` : money(mid)}</p>
        ${c.redFlags?.length ? html`<div class="callout bad small"><b>Red flags:</b><ul style="margin:4px 0;padding-left:18px">${c.redFlags.map((f) => html`<li>${f}</li>`)}</ul></div>` : ''}
        <h3>Evidence</h3>
        ${evidenceTable(c)}
        ${c.stage === 'new' ? html`<div class="inline"><button class="primary" data-screen="1">Screen: review + 20-min call (0.5h)</button><button data-screen="0">Reject</button></div>` : ''}
        ${c.stage === 'screened' ? interviewScheduler(s, c) : ''}
        ${c.stage === 'interview_scheduled' && !join ? html`<div class="callout small">Interview booked for ${ev ? `${fmtDate(s, ev.day)} at ${fmtTime(ev.start)}` : '—'} (on your <a href="#/calendar">calendar</a>; the time is charged that day). Come back on the day to join.</div>` : ''}
        ${aiEvalPanel(s, c)}
        ${active ? assessmentPanel(s, c, job) : ''}
        ${bgPanel(s, c)}
        ${active ? html`<p><button class="sm danger" data-reject>Reject candidate</button></p>` : ''}
        ${c.stage === 'offer' ? html`<div class="callout">Offer sent ${fmtDate(s, c.offer.sentDay)}: ${contractor ? `$${c.offer.hourlyRate}/h` : money(c.offer.salary)}${c.offer.equityPct ? ` + ${c.offer.equityPct}%` : ''}. They'll decide in a few days. ${thread ? html`<a href="#/mail/candidate:${thread.id}">Follow up in Mail</a>` : ''}</div>` : ''}
        ${thread && c.stage !== 'offer' ? html`<p class="small"><a href="#/mail/candidate:${thread.id}">Email thread</a></p>` : ''}
      </section>
      <section class="panel">
        ${c.interview && (join || c.interview.started) ? interviewPanel(s, c, job) : ''}
        ${c.interview?.done && job?.scorecard && c.stage !== 'withdrawn' ? scorecardForm(c, job) : ''}
        ${['interviewed', 'screened'].includes(c.stage) && (c.stage === 'interviewed' || c.interview?.done) ? offerForm(s, p, c, od) : ''}
        ${c.stage === 'interviewed' ? html`<p class="hint">Final step done ${fmtDate(s, Math.max(c.interview?.day ?? 0, ...Object.values(c.assessments ?? {}).map((a) => a?.day ?? 0)))}. Candidates with other offers move on if you wait.</p>` : ''}
        ${!c.interview && c.stage !== 'interviewed' ? html`<h2>Interview</h2><p class="muted">Screen, then book a ${Math.round(METHODS.structuredInterview.costHours.perCandidate * 60)}-minute interview on your calendar. You type your own questions; the candidate answers in character. Ask everyone the same job-related questions, then probe 2–3 levels deep ("what exactly did you do?", "what was the result?").</p>` : ''}
      </section>
    </div>`;
}

function assessmentPanel(s, c, job) {
  return html`<h3>Assessments</h3><ul class="list small">${Object.entries(ASSESSMENTS).map(([k, a]) => {
    const done = c.assessments?.[k];
    const blocked = (k === 'walkthrough' && !c.assessments?.takeHome) || (k === 'workSample' && !job?.workSampleReady);
    return html`<li><b>${a.label}</b> <span class="muted">· validity ~${a.validity.toFixed(2)} · ${a.hours}h of yours${a.dropoff ? ` · ~${pct(a.dropoff, 0)} drop out` : ''}${k === 'paidTrial' ? ` · costs ~${money((c.engagement === 'contractor' ? c.expectation * 8 : c.expectation / 260) * a.days)}` : ''}</span>
      ${done ? html`<div class="${done.flags?.length ? 'neg' : ''}">${done.text ?? (done.dropped ? 'Dropped out.' : done.found === false ? 'Nobody found.' : '')}</div>` : html`<button class="sm" data-assess="${k}" ${blocked ? 'disabled' : ''}>Run</button>`}
      <div class="muted">${a.note}${k === 'workSample' && !job?.workSampleReady ? ' Design the work sample on the job first.' : ''}</div></li>`;
  })}</ul>`;
}

function interviewScheduler(s, c) {
  const dur = Math.round(METHODS.structuredInterview.costHours.perCandidate * 60);
  const slots = findSlots(s, { fromDay: s.day + 1, duration: dur, count: 6 });
  return html`<form id="schedForm" class="inline"><label>Book interview (${dur} min) <select name="slot">${slots.map((x) => html`<option value="${x.day}:${x.start}">${fmtDate(s, x.day)} ${fmtTime(x.start)}</option>`)}</select></label><button class="primary" ${slots.length ? '' : 'disabled'}>Send invite</button></form>`;
}

function interviewPanel(s, c, job) {
  const msgs = c.interview.messages;
  const graded = msgs.filter((m) => m.from === 'me' && m.grade).map((m) => m.grade);
  const ex = interviewExecution(graded, { scorecard: Boolean(job?.scorecard) });
  const samples = DATA_ROLES[c.role]?.sampleQuestions ?? [];
  return html`<h2>Interview ${c.interview.done ? badge('done', 'good') : c.interview.started ? badge('live', 'accent') : ''}</h2>
    ${!c.interview.started ? html`<label class="small"><input type="checkbox" id="camOn" ${draft.camera?.[c.id] ? 'checked' : ''} /> Camera on, good light, and a live ID / location check (identity-fraud schemes avoid this)</label><br><button class="primary" data-join>Join interview</button><p class="hint">The time was charged on your calendar this morning.</p>` : html`
    <div class="chat">${msgs.length ? msgs.map((m) => html`<div class="msg ${m.from}">${m.text}${m.grade ? html`<div class="small" style="opacity:.85;margin-top:4px">${TYPE_LABEL[m.grade.type]}${m.grade.traits.length ? ` · probes ${m.grade.traits.map((t) => TRAITS[t]?.label.split(' (')[0] ?? t).join(', ')}` : ''}</div>` : ''}</div>`) : html`<p class="muted small">Open with context, then ask job-related questions. ~6–10 questions fill the slot.</p>`}</div>
    ${msgs.filter((m) => m.grade?.illegal).map((m) => html`<div class="callout bad small"><b>Illegal question (${m.grade.illegal.topic.replace(/_/g, ' ')}).</b> ${m.grade.illegal.note} This creates complaint risk and the candidate may walk.</div>`)}
    ${(() => { const last = msgs.filter((m) => m.from === 'me').at(-1)?.grade; return last && !last.illegal ? html`<p class="hint">Last question: ${last.feedback}</p>` : ''; })()}
    ${!c.interview.done ? html`<form id="askForm" style="margin-top:8px"><textarea id="askBox" name="q" rows="2" placeholder="Tell me about the hardest production bug you debugged last year. Walk me through it.">${draft.question[c.id] ?? ''}</textarea>
      <div class="inline"><button class="primary">Ask</button><button type="button" data-finish>End interview</button><span class="hint">${graded.length} questions · structure so far ${pct(ex.execution, 0)} → validity ~${ex.validity.toFixed(2)}</span></div></form>
      <details><summary class="small">Suggested questions for this role (research-based; optional)</summary><ul class="list small">${samples.map((q, i) => html`<li><a href="#" data-suggest="${i}">${q.text}</a> <span class="muted">(${q.type}; probes ${q.probes.map((t) => TRAITS[t]?.label.split(' (')[0]).join(', ')})</span></li>`)}</ul>
      <p class="hint">Probe: "What exactly did you do?" · "What was the result, in numbers?" · "How did you know it worked?" · "What would you do differently?"</p></details>` : html`<p class="small">Interview structure ${pct(c.interview.execution ?? 0, 0)} → validity ${(c.interview.validity ?? 0).toFixed(2)} (research: unstructured .19, well-run structured up to ~.50).</p>`}`}`;
}

function scorecardForm(c, job) {
  const r = (draft.ratings[c.id] ??= { ...(c.scorecard ?? {}) });
  return html`<h3>Your scorecard (1–5, anchored)</h3>
    <form id="rateForm"><div class="grid-2">${job.scorecard.competencies.map((k) => html`<label class="small">${TRAITS[k]?.label ?? k} <select name="${k}">${[1, 2, 3, 4, 5].map((v) => html`<option value="${v}" ${(r[k] ?? 3) === v ? 'selected' : ''}>${v}${v === 1 ? ' — no evidence' : v === 3 ? ' — solid, typical' : v === 5 ? ' — exceptional, specific evidence' : ''}</option>`)}</select></label>`)}</div>
    <button class="sm">Save ratings</button>${c.scorecard ? html` <span class="small muted">saved</span>` : ''}</form>`;
}

function offerForm(s, p, c, od) {
  const contractor = c.engagement === 'contractor';
  const corpOk = entityOf(s) === 'ccorp';
  const v = p.equity.valuation;
  const cost = monthlyCostOf(s, { ...c, kind: contractor ? 'contractor' : 'employee', salary: Number(od.pay) || 0, hourlyRate: Number(od.pay) || 0, hoursPerWeek: Number(od.hoursPerWeek) || 40 });
  const cash = s.bank.accounts[0]?.balance ?? 0;
  const months = cost > 0 ? cash / (cost + monthlyPeopleCost(s)) : 99;
  const agency = agencyOf(s, c.channel);
  return html`<h2>Make an offer</h2>
    <form id="offerForm">
      <div class="grid-2">
        <label>${contractor ? 'Hourly rate ($)' : c.partTime ? `Base salary for ${od.hoursPerWeek}h ($/yr)` : 'Base salary ($/yr)'} <input id="offPay" type="number" name="pay" value="${od.pay}" min="1" /></label>
        <label>Start date (${c.noticeDays}-day notice) <input id="offStart" type="date" name="start" value="${od.start}" min="${isoDate(s, s.day + (c.noticeDays ?? (contractor ? 3 : 14)))}" /></label>
        ${contractor || c.partTime ? html`<label>Hours/week <input id="offHours" type="number" name="hoursPerWeek" value="${od.hoursPerWeek}" min="${c.fractional ? 4 : c.partTime ? 10 : 5}" max="${c.fractional ? 20 : c.partTime ? 30 : 40}" /></label>` : ''}
        ${contractor ? html`${c.region !== 'us' ? html`<label><input type="checkbox" name="cor" ${od.cor ? 'checked' : ''} /> Deel Contractor of Record ($${VENDORS.deel.cor}/mo, shifts misclassification risk)</label>
            <label><input type="checkbox" name="localIp" ${od.localIp ? 'checked' : ''} /> Local-law IP assignment and confidentiality (counsel, ~$650 once per country)</label>` : html`<div></div>`}`
          : html`<label>Options (% of company) <input id="offEq" type="number" step="0.05" name="equityPct" value="${od.equityPct}" min="0" max="5" ${corpOk ? '' : 'disabled'} /></label><div class="small muted" style="align-self:center">${corpOk ? html`Pool: ${p.equity.poolPct || 0}% · 409A: ${v && s.day <= v.validUntil ? `strike $${v.fmv}` : html`<span class="warn">none — <a href="#/people/equity">get one</a></span>`}. First engineer typically 0.5–2%, ~0.3% by hire #5.` : 'Options need a Delaware C-corp.'}</div>`}
      </div>
      ${contractor ? '' : html`<div class="grid-2"><label>Sign-on bonus ($, one time) <input type="number" name="signOn" value="${od.signOn ?? 0}" min="0" step="500" /></label><label>Offer expires in (days, blank = open) <input type="number" name="deadlineDays" value="${od.deadlineDays ?? ''}" min="1" max="14" /></label></div>`}
      <div class="callout ${months < 6 ? 'bad' : months < 12 ? 'warn' : ''} small">This hire costs ~${money(cost)}/month fully loaded. Cash today covers ~${months.toFixed(1)} months of your whole team at that cost (before revenue and other bills).${agency?.costModel.type === 'pct_first_year_base' && !contractor ? ` Plus a ${money(agency.costModel.pct * (Number(od.pay) || 0))} placement fee to ${agency.label} on acceptance.` : ''}</div>
      ${c.region === 'us' && c.partTime ? html`<div class="callout small">${(Number(od.hoursPerWeek) || 0) >= 30 ? 'At 30+ h/week this person counts as full-time for the ACA (130 h/month): the health plan applies and costs more.' : 'Under 30 h/week: no health plan is offered; payroll taxes still apply.'} Larger employers (50+ FTE) must offer coverage at 30 h; for a small company this is your choice [verify on IRS.gov].</div>` : ''}
      ${contractor && c.region !== 'us' && Number(od.hoursPerWeek) >= 30 && !od.cor ? html`<div class="callout warn small"><b>Staff-like work abroad.</b> ${od.hoursPerWeek}h/week for one client looks like employment to a regulator (control, tools, integration; permanent-establishment risk). Use an EOR or Contractor of Record.</div>` : ''}
      ${contractor && c.region !== 'us' && !od.localIp ? html`<div class="callout warn small">No local-law IP assignment: a US form may not transfer ownership under ${REGION_DATA[c.region]?.label ?? 'local'} law, and investors' counsel flags it in diligence.</div>` : ''}
      ${!ciiaaReady(s) ? html`<div class="callout warn small">No CIIAA template yet: this hire won't sign an invention assignment. Create one in <a href="#/legal/founder">Legal</a> first.</div>` : ''}
      <div class="inline"><button class="primary">Send offer (0.5h)</button><span class="hint">Startups see ~80% offer acceptance (Ashby/Gem); it drops fast below the candidate's expectation, with short runway or competing offers.</span></div>
    </form>`;
}
