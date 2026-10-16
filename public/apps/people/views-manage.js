// UI for managing a team member (30/60/90 plan, 1:1 cadence + agenda, written feedback, performance
// conversations, hire provenance and post-mortems), background checks and Ashby-style AI criteria.
// Rendering + event wiring only; actions live in manage.js / screening.js / sim.js.

import { memberGlobalCard } from './views-global.js';
import { html, on, formData, badge } from '../../core/ui.js';
import { money, fmtDate, isoDate } from '../../core/util.js';
import { ROLES, jobRoleOf } from './catalog.js';
import { adviceBlock } from '../../core/adviceUi.js';
import { perfLabel } from './performance.js';
import { provenanceLine } from './provenance.js';
import { CADENCE, MGMT_HOURS, ensureMgmt, mgmtScore, missingInputs, tierOfScore, writeOnboardingPlan, setOneOnOne, giveFeedback, performanceConversation } from './manage.js';
import { BG_PACKAGES, FCRA, ASHBY, orderBackgroundCheck, adverseAction, ensureAts, enableAshby, setCriteria, evaluateCandidates, reviewAiEval, autoReject, validateCriterion } from './screening.js';
import { findMember, findCand, findJob, putOnPip } from './sim.js';

export const mdraft = { plan: {}, feedback: {}, talk: {}, agenda: {}, criteria: {} };
const dayFromIso = (s, iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(s.startDate + 'T12:00:00Z')) / 86400000);
const tone = (t) => (t === 'stellar' || t === 'good' ? 'good' : t === 'mediocre' ? 'bad' : t === 'average' ? 'warn' : '');

export function provenanceCard(s, m) {
  const pv = m.provenance;
  if (!pv) return html`<p class="small muted">No hiring record (added before provenance tracking or not hired through the pipeline).</p>`;
  return html`<div class="card small"><b>How ${m.name.split(' ')[0]} was hired</b> ${badge(`process: ${pv.tier}`, tone(pv.tier))}
    <div>${provenanceLine(pv)}</div>
    ${pv.readAtHire != null ? html`<div class="muted">Read at hire ${pv.readAtHire.toFixed(1)}/5 ±${(pv.readSd ?? 0).toFixed(1)} from ${pv.evidenceMethods.join(', ') || 'a screen'}.</div>` : ''}
    ${pv.backgroundCheck ? html`<div class="muted">Background check: ${pv.backgroundCheck.pkg} · ${pv.backgroundCheck.result}${pv.backgroundCheck.preOffer ? ' (ordered before the offer)' : ''}</div>` : ''}
    ${pv.skipped.length ? html`<div class="neg">Skipped: ${pv.skipped.join('; ')}.</div>` : html`<div class="pos">Full process.</div>`}</div>`;
}

export function memberView(s, p, m) {
  const g = ensureMgmt(m);
  const { score, parts } = mgmtScore(s, m);
  const live = m.status === 'active' || m.status === 'offer';
  const pl = perfLabel(m);
  const miss = live ? missingInputs(s, m) : [];
  const pd = (mdraft.plan[m.id] ??= g.plan?.outcomes ? [...g.plan.outcomes] : ['', '', '']);
  const fd = mdraft.feedback[m.id] ?? '';
  const td = (mdraft.talk[m.id] ??= { example: '', expectation: '', by: isoDate(s, s.day + 28) });
  const ad = mdraft.agenda[m.id] ?? g.agenda ?? '';
  return html`
    <p><a href="#/people">← Team</a></p>
    <div class="grid-2">
      <section class="panel">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><h2 style="margin:0">${m.name}</h2>${badge(m.status === 'gone' ? `left ${fmtDate(s, m.endDay)}` : m.status === 'offer' ? `starts ${fmtDate(s, m.startDay)}` : 'active', m.status === 'gone' ? 'bad' : 'good')}</div>
        <p class="small muted">${ROLES[jobRoleOf(m)]?.label ?? m.role} · since ${fmtDate(s, m.startDay)} · morale ${Math.round(m.morale ?? 70)}${m.quietQuitting ? ' · quietly quitting' : ''}</p>
        <p class="small">Performance: <b class="${pl.tone === 'good' ? 'pos' : pl.tone === 'bad' ? 'neg' : ''}">${pl.text}</b>${m.perf?.metric ? ` · ${m.perf.metric.label} ~${m.perf.metric.value}` : ''}${m.concernSince != null ? html` · <span class="neg">concern since ${fmtDate(s, m.concernSince)} (${s.day - m.concernSince} days)</span>` : ''}</p>
        ${provenanceCard(s, m)}
        ${memberGlobalCard(s, m)}
        ${m.postMortem ? html`<div class="callout ${m.postMortem.misHire ? 'bad' : ''} small"><b>Post-mortem.</b> ${m.postMortem.text}${m.postMortem.cost ? ` Estimated cost ${money(m.postMortem.cost.usd)} + ~${m.postMortem.cost.hours}h to re-hire.` : ''}</div>` : ''}
        ${live ? html`<h3>Management ${badge(`${tierOfScore(score)} · ${Math.round(score * 100)}`, tone(tierOfScore(score)))}</h3>
          <ul class="list small">${Object.entries(parts).map(([k, v]) => html`<li>${k.replace(/_/g, ' ')}: <b>${Math.round(v * 100)}</b></li>`)}</ul>
          ${miss.length ? html`<div class="callout warn small">Missing: ${miss.join('; ')}. Neglect shows up later: quiet quitting after ~2 months, strong people resigning, problems the team absorbs.</div>` : html`<div class="callout good small">Plan, cadence and feedback are in place.</div>`}
          ${adviceBlock(s, 'people_management', ['A 30/60/90 plan with three measurable outcomes before day 1, a weekly 30-minute 1:1 with a fixed agenda, specific written feedback, and performance gaps raised within two weeks with a dated example.'], { cls: 'hint' })}` : ''}
      </section>
      ${live ? html`<section class="panel">
        <h3>30/60/90 plan ${g.plan ? badge(`${Math.round(g.plan.score * 100)}${g.plan.beforeStart ? ' · before day 1' : ''}`, g.plan.score >= 0.6 ? 'good' : 'warn') : ''}</h3>
        <form id="planForm" data-m="${m.id}">${['Day 30', 'Day 60', 'Day 90'].map((l, i) => html`<label class="small">${l} outcome <input name="o${i}" value="${pd[i] ?? ''}" maxlength="240" placeholder="${['Answer 80% of tier-1 tickets without escalation by day 30', 'Ship the CSV import with tests and docs by day 60', 'Own the onboarding flow: activation up from 30% to 40% by day 90'][i]}" /></label>`)}
          <button class="sm">Save plan (${MGMT_HOURS.plan}h)</button></form>
        ${g.plan?.notes?.length ? html`<ul class="small muted">${g.plan.notes.map((x) => html`<li>${x}</li>`)}</ul>` : ''}
        <h3>1:1s</h3>
        <form id="oooForm" data-m="${m.id}"><label class="small">Cadence <select name="cadence">${Object.entries(CADENCE).map(([k, c]) => html`<option value="${k}" ${g.cadence === k ? 'selected' : ''}>${c.label}${c.hoursPerWeek ? ` · ${c.hoursPerWeek}h/week` : ''}</option>`)}</select></label>
          <label class="small">Standing agenda <textarea name="agenda" rows="2" placeholder="What is blocking you? What do you need from me? What are you learning? Progress on the 30/60/90 outcomes.">${ad}</textarea></label>
          <button class="sm">Save (${MGMT_HOURS.agenda}h)</button>${g.agendaHits?.length ? html` <span class="small muted">covers: ${g.agendaHits.join(', ')}</span>` : ''}</form>
        ${m.status === 'active' ? html`<h3>Written feedback</h3>
        <form id="fbForm" data-m="${m.id}"><textarea name="text" rows="3" placeholder="In Tuesday's demo you skipped the pricing question, so the buyer left unsure. Next time, answer it directly and offer the annual option.">${fd}</textarea><button class="sm">Send (${MGMT_HOURS.feedback}h)</button></form>
        <ul class="list small">${g.feedback.slice(-4).reverse().map((f) => html`<li>${fmtDate(s, f.day)} · ${f.kind} · quality ${Math.round(f.score * 100)}<div class="muted">${f.text.slice(0, 160)}</div></li>`)}</ul>
        <h3>Performance conversation</h3>
        <form id="talkForm" data-m="${m.id}">
          <label class="small">Dated example <input name="example" value="${td.example}" maxlength="400" placeholder="On 3 March you merged the billing change without tests and it double-charged 14 customers." /></label>
          <label class="small">Expected change (measurable) <input name="expectation" value="${td.expectation}" maxlength="300" placeholder="Every billing change ships with tests and a reviewer by the next release." /></label>
          <label class="small">Check-in date <input type="date" name="by" value="${td.by}" /></label>
          <button class="sm">Have the conversation (${MGMT_HOURS.talk}h)</button>${m.pip?.status !== 'active' ? html` <button type="button" class="sm" data-pip2="${m.id}">Start a 6-week PIP</button>` : html` <span class="small warn">On PIP until ${fmtDate(s, m.pip.endDay)}</span>`}</form>
        <ul class="list small">${g.talks.slice(-3).reverse().map((t) => html`<li>${fmtDate(s, t.day)} · quality ${Math.round(t.score * 100)}${t.byDay ? ` · check ${fmtDate(s, t.byDay)}` : ''}<div class="muted">${t.example.slice(0, 120)}</div>${t.notes.length ? html`<div class="muted">${t.notes[0]}</div>` : ''}</li>`)}</ul>` : ''}
      </section>` : ''}
    </div>`;
}

export function bgPanel(s, c) {
  const bg = c.backgroundCheck;
  const preOffer = !['offer', 'hired'].includes(c.stage);
  if (!bg) {
    if (!['screened', 'interview_scheduled', 'interviewed', 'offer', 'hired'].includes(c.stage)) return '';
    return html`<h3>Background check</h3>
      ${preOffer ? html`<p class="small warn">Most US fair-chance laws (California, NYC and many states) require a conditional offer first. Order it after the offer.</p>` : ''}
      <form id="bgForm" class="inline"><select name="pkg">${Object.entries(BG_PACKAGES).map(([k, b]) => html`<option value="${k}" ${k === 'standard' ? 'selected' : ''}>${b.label} · $${b.usd}</option>`)}</select><button class="sm">Order with consent (0.25h)</button></form>
      <p class="hint">Checkr-style, ~$30–80 per check (estimates). Pro verifies employment history, which is what catches identity fraud in remote hiring.</p>`;
  }
  const waitLeft = bg.preAdverseDay != null ? Math.max(0, FCRA.waitDays - (s.day - bg.preAdverseDay)) : null;
  return html`<h3>Background check</h3>
    <p class="small">${BG_PACKAGES[bg.pkg]?.label ?? bg.pkg} · ordered ${fmtDate(s, bg.orderedDay)} · ${bg.status === 'pending' ? `report due ${fmtDate(s, bg.readyDay)}` : badge(bg.status, bg.status === 'clear' ? 'good' : 'bad')}</p>
    ${bg.finding ? html`<p class="small">${bg.finding}</p>` : ''}
    ${bg.status === 'consider' && !bg.adverse ? html`<div class="callout warn small">FCRA: before you decide against them because of this report, send a pre-adverse notice with a copy of the report and a summary of rights, wait ~5 business days for a dispute, then send the final notice. Unrelated old records call for an individualized assessment, not a rejection.
      <div class="inline" style="margin-top:6px">${bg.preAdverseDay == null ? html`<button class="sm" data-adverse="pre">Send pre-adverse notice (0.25h)</button>` : html`<button class="sm" data-adverse="final" ${waitLeft ? 'disabled' : ''}>Final adverse action${waitLeft ? ` (in ${waitLeft} days)` : ''} (0.25h)</button>`}</div></div>` : ''}
    ${bg.adverse === true ? html`<p class="small muted">Adverse action completed ${fmtDate(s, bg.finalDay)}.</p>` : ''}`;
}

export function aiEvalPanel(s, c) {
  const e = c.aiEval;
  if (!e) return '';
  if (e.optedOut) return html`<p class="small muted">AI review: candidate opted out of automated processing (skipped).</p>`;
  return html`<h3>AI criteria ${badge(`${e.met}/${e.total} met`, '')} ${e.reviewed ? badge('reviewed', 'good') : ''}</h3>
    <ul class="list small">${e.results.map((r) => html`<li>${badge(r.status.replace(/_/g, ' '), r.status === 'meets' ? 'good' : r.status === 'does_not_meet' ? 'bad' : '')} ${r.criterion}<div class="muted">${r.reason}</div></li>`)}</ul>
    ${!e.reviewed ? html`<button class="sm" data-ai-review>Read the reasoning against the resume (${Math.round(ASHBY.reviewHoursPer * 60)} min)</button>` : ''}
    <p class="hint">Results come from the resume only and "may be inaccurate" (Ashby). Use them to order your reading, not to decide.</p>`;
}

export function criteriaPanel(s, p, j) {
  const a = ensureAts(p);
  const cd = (mdraft.criteria[j.id] ??= (j.aiCriteria?.list ?? []).map((x) => x.text).join('\n'));
  const lines = String(cd).split('\n').map((x) => x.trim()).filter(Boolean);
  const newCount = p.candidates.filter((c) => c.jobId === j.id && c.stage === 'new' && !c.aiEval).length;
  return html`<details><summary class="small"><b>AI application review</b> ${a.ashby ? badge(`${a.credits} credits`, 'accent') : badge('off', '')}</summary>
    ${!a.ashby ? html`<p class="small">Ashby Foundations: $${ASHBY.monthly}/month, ${ASHBY.credits.toLocaleString('en-US')} AI credits/month (1 per candidate per job). Criteria are checked as meets / does not meet / undecided, with reasoning; no score. <button class="sm" data-ashby>Turn on (${ASHBY.setupHours}h)</button></p>` : html`
    <form class="critForm" data-job="${j.id}"><label class="small">Criteria, one per line (from your scorecard is best) <textarea name="criteria" rows="3" placeholder="Has shipped production code end-to-end at an early-stage startup&#10;Has written tests and owned on-call">${cd}</textarea></label>
      ${lines.length ? html`<ul class="small" style="padding-left:18px">${lines.map((t) => { const v = validateCriterion(t); return html`<li class="${v.warn.length ? 'neg' : v.vague ? 'muted' : ''}">${t} <span class="muted">— ${v.note}</span></li>`; })}</ul>` : ''}
      <div class="inline">${j.scorecard ? html`<button type="button" class="sm" data-crit-sc="${j.id}">From scorecard</button>` : ''}<button class="sm">Validate & save (${ASHBY.criteriaHours}h)</button></div></form>
    ${j.aiCriteria ? html`<div class="inline small"><button class="sm" data-ai-eval="${j.id}" ${newCount ? '' : 'disabled'}>Evaluate ${newCount} new applicant(s) (${newCount} credits)</button><button class="sm danger" data-ai-autoreject="${j.id}">Auto-reject under 50% met</button></div>
      ${adviceBlock(s, 'hiring', ['Sort by the percent-met column only as a first pass; read the reasoning on borderline cases, and do not auto-reject from it.'], { cls: 'hint' })}` : ''}`}
  </details>`;
}

const SC_CRITERIA = {
  craft: 'Has shipped production work end-to-end (code, deals, tickets or campaigns with numbers)',
  domain: 'Has worked with B2B SaaS buyers or in our market',
  agency: 'Has owned something at an early-stage startup without being asked',
  ai_fluency: 'Uses AI agents in daily work and can show how they check the output',
  communication: 'Has written docs, help articles or public writing',
  conscientiousness: 'Has owned testing, on-call or a quality process',
};

/** Event wiring for the member page, candidate screening panels and job AI criteria. */
export function bindPeopleOps(root, ctx, { p, cand, member }) {
  const s = ctx.state;
  if (member) {
    const id = member.id;
    on(root, 'input', '#planForm input', (e) => { const f = formData(e.target.form); mdraft.plan[id] = [f.o0, f.o1, f.o2]; });
    on(root, 'submit', '#planForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { const pl = writeOnboardingPlan(st, findMember(st.apps.people, id), [f.o0, f.o1, f.o2].filter(Boolean)); ctx.toast(`Plan saved: quality ${Math.round(pl.score * 100)}.${pl.notes[0] ? ` ${pl.notes[0]}` : ''}`, pl.score >= 0.6 ? 'good' : 'warn'); }, { hours: MGMT_HOURS.plan, label: '30/60/90 plan' }); });
    on(root, 'input', '#oooForm textarea', (e) => { mdraft.agenda[id] = e.target.value; });
    on(root, 'submit', '#oooForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { setOneOnOne(st, findMember(st.apps.people, id), { cadence: f.cadence, agenda: f.agenda }); delete mdraft.agenda[id]; }, { hours: MGMT_HOURS.agenda, label: '1:1 setup' }); });
    on(root, 'input', '#fbForm textarea', (e) => { mdraft.feedback[id] = e.target.value; });
    on(root, 'submit', '#fbForm', (e) => { e.preventDefault(); const t = String(formData(e.target).text ?? '').trim(); if (!t) return; ctx.act((st) => { const fb = giveFeedback(st, findMember(st.apps.people, id), t); mdraft.feedback[id] = ''; ctx.toast(`Feedback sent (quality ${Math.round(fb.score * 100)}).${fb.notes?.[0] ? ` ${fb.notes[0]}` : ''}`, fb.score >= 0.6 ? 'good' : 'warn'); }, { hours: MGMT_HOURS.feedback, label: 'Written feedback' }); });
    on(root, 'input', '#talkForm input', (e) => { const f = formData(e.target.form); mdraft.talk[id] = { example: f.example, expectation: f.expectation, by: f.by }; });
    on(root, 'submit', '#talkForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { const t = performanceConversation(st, findMember(st.apps.people, id), { example: f.example, expectation: f.expectation, byDay: f.by ? dayFromIso(st, f.by) : null }); delete mdraft.talk[id]; ctx.toast(`Conversation logged (quality ${Math.round(t.score * 100)}).${t.notes[0] ? ` ${t.notes[0]}` : ''}`, t.score >= 0.6 ? 'good' : 'warn'); }, { hours: MGMT_HOURS.talk, label: 'Performance conversation' }); });
    on(root, 'click', '[data-pip2]', () => ctx.act((st) => { putOnPip(st, id); ctx.toast('Performance plan started: 6 weeks, clear goals, weekly check-ins (~2h/week of your time).', 'info'); }, { hours: 1.5, label: 'Performance plan' }));
  }
  if (cand) {
    const cid = cand.id;
    on(root, 'submit', '#bgForm', (e) => { e.preventDefault(); const k = formData(e.target).pkg; ctx.act((st) => { const bg = orderBackgroundCheck(st, st.apps.people, findCand(st.apps.people, cid), k); ctx.toast(bg.status === 'no_consent' ? 'They did not consent.' : `Ordered. Report due ${fmtDate(st, bg.readyDay)}.`, bg.status === 'no_consent' ? 'warn' : 'good'); }, { hours: 0.25, label: 'Background check' }); });
    on(root, 'click', '[data-adverse]', (e, el) => ctx.act((st) => { adverseAction(st, st.apps.people, findCand(st.apps.people, cid), el.dataset.adverse); }, { hours: 0.25, label: 'FCRA adverse action' }));
    on(root, 'click', '[data-ai-review]', () => ctx.act((st) => { const r = reviewAiEval(st, findCand(st.apps.people, cid)); ctx.toast(r.corrected ? 'You found a criterion the AI got wrong.' : 'Reasoning checked.', 'info'); }, { hours: ASHBY.reviewHoursPer, label: 'Review AI screening' }));
  }
  on(root, 'click', '[data-ashby]', () => ctx.act((st) => enableAshby(st, st.apps.people), { hours: ASHBY.setupHours, label: 'Ashby setup' }));
  on(root, 'input', '.critForm textarea', (e, el) => { mdraft.criteria[el.form.dataset.job] = el.value; });
  on(root, 'click', '[data-crit-sc]', (e, el) => { const j = findJob(p, el.dataset.critSc); mdraft.criteria[j.id] = j.scorecard.competencies.map((k) => SC_CRITERIA[k]).filter(Boolean).join('\n'); ctx.render(); });
  on(root, 'submit', '.critForm', (e) => {
    e.preventDefault();
    const jid = e.target.dataset.job;
    const texts = String(formData(e.target).criteria ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
    ctx.act((st) => {
      const job = findJob(st.apps.people, jid);
      try { setCriteria(st, job, texts); ctx.toast('Criteria saved.', 'good'); } catch (err) {
        if (!err.warnings) throw err;
        if (globalThis.confirm?.(`${err.message}\n\nSave anyway?`)) { setCriteria(st, job, texts, { ignoreWarnings: true }); ctx.toast('Saved with EEO warnings ignored (logged).', 'warn'); } else throw new Error('Not saved. Remove the flagged criteria.');
      }
    }, { hours: ASHBY.criteriaHours, label: 'AI screening criteria' });
  });
  on(root, 'click', '[data-ai-eval]', (e, el) => ctx.act((st) => { const r = evaluateCandidates(st, st.apps.people, findJob(st.apps.people, el.dataset.aiEval)); ctx.toast(`Evaluated ${r.evaluated}${r.skipped ? `, ${r.skipped} opted out` : ''}. ${r.credits} credits left.`, 'good'); }, { hours: 0.05, label: 'AI screening' }));
  on(root, 'click', '[data-ai-autoreject]', (e, el) => ctx.act((st) => { const r = autoReject(st, st.apps.people, findJob(st.apps.people, el.dataset.aiAutoreject)); ctx.toast(`Auto-rejected ${r.rejected} applicant(s) without reading them.`, 'warn'); }, { hours: 0.05, label: 'AI auto-reject' }));
}

