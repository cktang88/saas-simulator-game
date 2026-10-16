// SOC 2 workflow UI (platform, integrations, tests, policies, personnel, audit) and security questionnaires
// (AI draft + per-answer review). Rendering and event wiring only; logic in legal/compliance.js.

import { html, on, formData, badge, stat } from '../../core/ui.js';
import { money, fmtDate } from '../../core/util.js';
import { mrr } from '../../core/stripe.js';
import { SOC2 } from './catalog.js';
import {
  ensureCompliance, PLATFORMS, AUDITORS, INTEGRATIONS, TESTS, COMMITMENTS, POLICY_HOURS, PERSONNEL, Q, MANUAL,
  soc2Demand, readiness, choosePlatform, connectIntegration, fixTest, generatePolicies, reviewPolicies, approvePolicies,
  runControlAction, operated, sendPersonnelOnboarding, completeOwnTasks, chooseAuditor, startSoc2, questionnaireInbox,
  importQuestionnaire, aiDraft, reviewAnswer, submitQuestionnaire, FRAMEWORKS, publishTrustCenter, deflectQuestionnaire, addFramework,
  complianceVendorScore,
} from './compliance.js';

const VSTATUS = { keep: ['leader', 'good'], 'keep-alt': ['alternative', ''], trap: ['too good to be true', 'bad'], dead: ['retired', 'bad'] };
const vbadge = (k) => badge(...(VSTATUS[k] ?? [k, '']));
function vendorFeedback(s) {
  const r = complianceVendorScore(s);
  if (!r) return '';
  return html`<div class="callout small ${r.score >= 0.8 ? 'good' : r.score >= 0.5 ? '' : 'bad'}"><b>Vendor fit: ${Math.round(r.score * 100)}%.</b> ${r.evidence.join(' ')}${r.coaching.length ? html`<ul style="margin:4px 0;padding-left:18px">${r.coaching.map((c) => html`<li>${c}</li>`)}</ul>` : ''}</div>`;
}

const STATUS = { none: 'Not started', type1_in_progress: 'Type I in progress', type1: 'Type I report', type2_in_progress: 'Type II in progress', type2: 'Type II report' };
const draft = { keep: null, scope: {} };

export function soc2View(s, L) {
  const c = ensureCompliance(s);
  const r = readiness(s);
  const d = soc2Demand(s);
  const plan = L.soc2Plan;
  const inProg = L.soc2.endsWith('in_progress');
  const visibleTests = Object.entries(c.tests).filter(([, t]) => !t.hidden);
  const failing = visibleTests.filter(([, t]) => t.status === 'fail' && s.day >= (t.visibleDay ?? 0));
  const pd = r.personnel;
  const keep = draft.keep ?? Object.entries(c.commitments).filter(([, v]) => v.kept).map(([k]) => k);
  return html`
    <div class="stats">
      ${stat('SOC 2', STATUS[L.soc2], L.soc2Report ? `${L.soc2Report.opinion} opinion · ${L.soc2Report.exceptions.length} exception(s)` : inProg && plan?.readyDay ? `report ~${fmtDate(s, plan.readyDay)}` : '', L.soc2Qualified ? 'bad' : L.soc2 === 'none' ? '' : 'good')}
      ${stat('Readiness', `${Math.round(r.score * 100)}%`, `${failing.length} failing test(s) · ${r.notOperated.length} commitment(s) not operated`, r.score >= 0.85 ? 'good' : r.score >= 0.6 ? 'warn' : 'bad')}
      ${stat('Platform', c.platform ? PLATFORMS[c.platform].label : 'none', c.platform ? `since ${fmtDate(s, c.platformDay)}` : 'manual = ~8h/week')}
      ${stat('Buyer demand', d.any ? 'yes' : 'none yet', `${d.deals} deal(s) · ${d.asks} questionnaire ask(s)`, d.any ? 'warn' : '')}
    </div>
    ${!d.any && !c.platform ? html`<div class="callout small">No deal or customer is asking for SOC 2 yet (MRR ${money(mrr(s))}). Platforms cost roughly $10k a year.</div>` : ''}
    ${vendorFeedback(s)}
    ${c.templated?.exposed ? html`<div class="callout bad small"><b>Your templated SOC 2 report was exposed on ${fmtDate(s, c.templated.exposed)}.</b> It is void: ${c.templated.lost ?? 0} deal(s) lost, ${c.templated.churned ?? 0} customer(s) cancelling. Start a real programme below.</div>` : ''}
    <div class="grid-2">
      <section class="panel"><h2>1. Platform</h2>
        ${c.platform ? html`<p class="small"><b>${PLATFORMS[c.platform].label}</b> ${vbadge(PLATFORMS[c.platform].status)}: ${PLATFORMS[c.platform].paradigm}. ${PLATFORMS[c.platform].note}</p>
          ${c.readyDay != null && s.day < c.readyDay ? html`<p class="small warn">Onboarding with the vCISO until ${fmtDate(s, c.readyDay)}: integrations open then.</p>` : ''}
          ${c.pentestDueDay != null ? html`<p class="small">Bundled pentest scheduled ${fmtDate(s, c.pentestDueDay)}.</p>` : ''}` : html`
          ${Object.entries(PLATFORMS).map(([k, P]) => html`<div class="card small"><b>${P.label}</b> ${vbadge(P.status)}${P.retired ? '' : html` ~${money(P.annual)}/yr (estimate) · ${P.questionnaires ? `${P.questionnaires} AI questionnaires/yr` : 'no AI questionnaire drafting'}${P.includesAudit ? ' · audit included' : ''}`}<div>${P.paradigm ?? ''}</div><div class="muted">${P.note}</div>${P.retired ? '' : html`<button class="sm" data-platform="${k}">Buy & set up (${P.setupHours ?? 1}h)</button>`}</div>`)}
          <p class="hint">Without a platform you can still audit: spreadsheets and screenshots, ~${MANUAL.weeklyHours.type1}h/week plus a ${MANUAL.sprintHours}h sprint, and you only find broken settings by hand.</p>`}
        <h2>2. Integrations</h2>
        <ul class="list small">${Object.entries(INTEGRATIONS).map(([k, I]) => { const st = c.integrations[k]; return html`<li>Phase ${I.phase} · <b>${I.label}</b> ${st?.status === 'connected' ? badge('connected', 'good') : st?.status === 'error' ? html`${badge('error', 'bad')} <span class="muted">${st.error}</span> <button class="sm" data-integ="${k}">Retry (${I.hours}h)</button>` : html`<button class="sm" data-integ="${k}" ${c.platform ? '' : 'disabled'}>Connect (${I.hours}h)</button>`}</li>`; })}</ul>
        <p class="hint">Vanta's order: cloud + identity first (most automation), then devices, code and scanners, then HR and tickets. Connecting a tool is not the same as the control working.</p>
      </section>
      <section class="panel"><h2>3. Tests ${badge(`${failing.length} failing`, failing.length ? 'bad' : 'good')}</h2>
        ${visibleTests.length ? html`<ul class="list small">${visibleTests.map(([id, t]) => { const T = TESTS[id]; const show = s.day >= (t.visibleDay ?? 0); return html`<li>${t.status === 'fail' && show ? badge('fail', 'bad') : t.status === 'fail' ? badge('re-testing', 'warn') : badge(t.scoped ? 'pass' : 'out of scope', t.scoped ? 'good' : '')} <b>${T.name}</b> <span class="muted">${T.control}</span>
          ${t.status === 'fail' && show ? html`<div class="muted">Failing resource: ${t.resource ?? T.resource}</div>
            ${T.external ? html`<a href="#/people/hiring">Order background checks in People</a>` : html`<div class="inline"><button class="sm" data-fix="${id}">Fix (${T.fixHours}h)</button>${T.scopeOut || id === 'cloud_ssh' ? html`<input class="sm" data-scope-reason="${id}" placeholder="Reason to exclude (auditors read it)" value="${draft.scope[id] ?? ''}" /><button class="sm" data-scope="${id}">Scope out (6 min)</button>` : ''}</div>`}` : ''}${!t.scoped && t.scopeReason ? html`<div class="muted">Excluded: ${t.scopeReason}</div>` : ''}</li>`; })}</ul>` : html`<p class="muted small">Connect integrations to see tests. Each failing test names the resource (an admin without MFA, a public sandbox bucket, a contractor who left).</p>`}
        ${c.platform ? html`<p class="hint">${PLATFORMS[c.platform].retestDays ? `${PLATFORMS[c.platform].label} syncs nightly: fixes show tomorrow.` : `${PLATFORMS[c.platform].label.replace(/ \(.*\)$/, '')} re-tests continuously; scope changes take up to an hour.`} Settings drift every week (new laptops, new buckets, new CVEs).</p>` : ''}
      </section>
    </div>
    <div class="grid-2">
      <section class="panel"><h2>4. Policies & commitments</h2>
        ${!c.policies ? html`<div class="inline"><button class="sm" data-policies="template">Templates, edit by hand (${POLICY_HOURS.template}h)</button><button class="sm" data-policies="ai" ${c.platform ? '' : 'disabled'}>AI policy generator (${POLICY_HOURS.ai}h)</button></div>
          <p class="hint">Every policy line is a promise the auditor will test. AI generators write confident policies for a company bigger than yours.</p>` : html`
          <p class="small">${c.policies.kind === 'ai' ? 'AI-generated' : 'Template'} pack · ${c.policies.status}${c.policies.reviewed ? ' · reviewed' : ''}. Keep only what you will actually operate; required items you drop become control gaps.</p>
          <form id="commitForm"><ul class="list small">${Object.keys(c.commitments).map((k) => { const K = COMMITMENTS[k]; const op = operated(s, k); return html`<li><label><input type="checkbox" name="${k}" ${keep.includes(k) ? 'checked' : ''} /> ${K.label}</label> ${K.required ? badge('SOC 2 needs it', '') : ''} ${c.commitments[k].kept ? badge(op ? 'operating' : 'no evidence yet', op ? 'good' : 'warn') : ''}
            ${K.action && c.commitments[k].kept ? html`<button type="button" class="sm" data-control="${k}">${K.action.label} (${K.action.hours}h${K.action.usd ? `, ${money(K.action.usd)}` : ''})</button>${c.actions[k] != null ? html` <span class="muted">last ${fmtDate(s, c.actions[k])}</span>` : ''}` : ''}</li>`; })}</ul>
            <div class="inline"><button class="sm primary">Review & approve (${POLICY_HOURS.review}h)</button>${c.policies.status !== 'approved' ? html`<button type="button" class="sm" data-approve-asis>Approve as written (6 min)</button>` : ''}</div></form>`}
      </section>
      <section class="panel"><h2>5. Personnel ${badge(`${pd.done}/${pd.total} complete`, pd.done === pd.total ? 'good' : 'warn')}</h2>
        <ul class="list small">${pd.list.map((x) => html`<li>${x.name}: policies ${x.tasks.policies ? '✓' : '✗'} · training ${x.tasks.training ? '✓' : '✗'} · device ${x.tasks.device ? '✓' : '✗'}</li>`)}</ul>
        <div class="inline">${!c.onboardingSent ? html`<button class="sm" data-personnel-send>Send onboarding link to the team (${PERSONNEL.sendHours}h)</button>` : ''}<button class="sm" data-own-tasks ${c.personnel.founder?.training ? 'disabled' : ''}>Do your own tasks (${PERSONNEL.founderHours}h)</button></div>
        <p class="hint">People pulls from People: every new hire and contractor gets policy acceptance, training and a device agent. Background checks for employees are a control too.</p>
      </section>
    </div>
    ${c.platform ? html`<div class="grid-2"><section class="panel"><h2>Trust center</h2>
      ${c.trust ? html`<p class="small">${PLATFORMS[c.trust.platform]?.trustCenter?.label ?? 'Trust center'} published ${fmtDate(s, c.trust.day)} · ${c.trust.deflected} of ${c.trust.tried} questionnaire(s) deflected by the link.</p>`
        : html`<p class="small">${PLATFORMS[c.platform].trustCenter?.label ?? 'Trust center'}: policies, report and pentest summary behind an NDA gate. Some buyers self-serve instead of sending a questionnaire (Drata's SafeBase deflects the most; strict TPRM teams the least).</p><button class="sm" data-trust ${c.policies?.status === 'approved' ? '' : 'disabled'}>Publish (2h)</button>`}
    </section><section class="panel"><h2>Frameworks</h2>
      <p class="small">Each extra framework is a yearly fee (${money(PLATFORMS[c.platform].frameworkFee ?? 5000)} on ${PLATFORMS[c.platform].label}${c.platform === 'secureframe' ? ', third-party' : ', [design] estimate'}) plus ~6h of mapping.${PLATFORMS[c.platform].oneFramework ? ' Oneleet runs one framework at a time.' : ''} The certification audit itself is separate.</p>
      <div class="inline">${Object.entries(FRAMEWORKS).map(([k, F]) => c.frameworks?.[k] ? badge(`${F.label} added`, 'good') : html`<button class="sm" data-framework="${k}">Add ${F.label}</button>`)}</div>
    </section></div>` : ''}
    <section class="panel"><h2>6. Audit</h2>
      ${L.soc2Report ? html`<div class="callout ${L.soc2Report.opinion === 'clean' ? 'good' : L.soc2Report.opinion === 'qualified' ? 'bad' : 'warn'} small"><b>${L.soc2Report.type === 'type1' ? 'Type I' : 'Type II'} report ${fmtDate(s, L.soc2Report.day)} (${AUDITORS[L.soc2Report.auditor]?.label}): ${L.soc2Report.opinion} opinion.</b>
        ${L.soc2Report.exceptions.length ? html`<ul style="margin:4px 0;padding-left:18px">${L.soc2Report.exceptions.map((e) => html`<li>${e.text}</li>`)}</ul>` : ''}</div>` : ''}
      ${inProg ? html`<p class="small">${STATUS[L.soc2]} with ${AUDITORS[plan.auditor]?.label ?? 'the auditor'}${plan.manual ? ' (manual evidence)' : ''}. ${plan.type === 'type2' ? `Observation window ${plan.windowMonths} months: any test red for more than 14 days in the window becomes an exception.` : 'Point in time: whatever is red at fieldwork becomes an exception.'} Fieldwork ${fmtDate(s, plan.snapshotDay)} · report ~${fmtDate(s, plan.readyDay)}.</p>` : html`
        <form id="auditForm" class="inline"><label class="small">Auditor <select name="firm">${Object.entries(AUDITORS).filter(([, A]) => !A.bundled || A.bundled === c.platform).filter(([k]) => !PLATFORMS[c.platform]?.includesAudit || k === PLATFORMS[c.platform].includesAudit).map(([k, A]) => html`<option value="${k}" ${(c.auditor ?? 'boutique') === k ? 'selected' : ''}>${A.label}: ${A.bundled ? 'included' : `Type I ${money(A.type1)}, Type II ${money(A.type2)}`}</option>`)}</select></label>
          ${L.soc2 === 'none' ? html`<button class="sm primary" name="type" value="type1">Start Type I (${SOC2.kickoffHours}h)</button>` : ''}
          ${['none', 'type1'].includes(L.soc2) ? html`<label class="small">Type II window <select name="window"><option value="3">3 months</option><option value="6" selected>6 months (common first)</option><option value="12">12 months</option></select></label><button class="sm" name="type" value="type2">Start Type II (${SOC2.kickoffHours}h)</button>` : ''}</form>
        <p class="hint">Start fieldwork when readiness is high: exceptions go in the report your buyers read. Type I in 3–6 months total; Type II needs a 3–12 month window (vendor timelines, unverified). Reports are good for ~12 months.</p>`}
    </section>`;
}

export function questionnairesView(s, L) {
  const c = ensureCompliance(s);
  const inbox = questionnaireInbox(s);
  const open = c.questionnaires.filter((q) => q.status === 'open');
  const done = c.questionnaires.filter((q) => q.status === 'submitted').slice(0, 8);
  const left = c.platform ? PLATFORMS[c.platform].questionnaires - (c.quotaYear === Math.floor(s.day / 365) ? c.quotaUsed : 0) : 0;
  return html`
    <div class="callout small">Security questionnaires (SIG Lite, CAIQ, custom) arrive with enterprise deals and renewals. By hand: ~${Math.round(Q.manualHoursPerQ * Q.shown)}h each. With a platform the AI drafts from your answer library, policies and live controls in minutes, then you approve or correct each answer. Vendors claim "80% automated, 95% accepted" (unverified); stale library answers and policy promises you do not keep become false answers.</div>
    <div class="grid-2">
      <section class="panel"><h2>Inbox</h2>
        ${inbox.length ? html`<ul class="list small">${inbox.map((q) => html`<li><b>${q.customer}</b>: ${q.label}${q.dueDay ? ` · due ${fmtDate(s, q.dueDay)}` : ''} <button class="sm" data-qimport="${q.sourceKey}">Import</button>${c.trust && !c.deflectTried?.[q.sourceKey] ? html` <button class="sm" data-qdeflect="${q.sourceKey}">Send trust-center link (6 min)</button>` : ''}</li>`)}</ul>` : html`<p class="muted small">Nothing waiting. Questionnaires appear from CRM deals and Success renewals.</p>`}
        <p class="small">AI questionnaires left this year: ${c.platform ? left : 'none (no platform)'}</p>
      </section>
      <section class="panel"><h2>Submitted</h2>
        ${done.length ? html`<ul class="list small">${done.map((q) => q.deflected ? html`<li>${q.customer} · ${fmtDate(s, q.submittedDay)} · self-served from the trust center</li>` : html`<li>${q.customer} · ${fmtDate(s, q.submittedDay)} · reviewed ${Math.round(q.reviewedShare * 100)}%${q.accuracy < 1 ? html` · <span class="neg">${q.wrong.length} answer(s) not true today</span>` : ' · accurate'}</li>`)}</ul>` : html`<p class="muted small">None yet.</p>`}
      </section>
    </div>
    ${open.map((q) => html`<section class="panel"><h2>${q.customer}: ${q.label}</h2>
      ${!q.drafted ? html`<div class="inline"><button class="sm primary" data-qdraft="${q.id}" ${c.platform && left > 0 ? '' : 'disabled'}>AI draft (${Q.aiBaseHours}h)</button><button class="sm" data-qmanual="${q.id}">Answer by hand (~${Math.round(Q.manualHoursPerQ * Q.shown * (q.size ?? 1))}h)</button></div>` : html`
        <div class="table-wrap"><table><thead><tr><th>Question</th><th>Draft</th><th>Source</th><th></th></tr></thead><tbody>
        ${q.answers.map((a) => html`<tr><td>${a.q}</td><td>${a.final ? html`<b>${a.final.yes ? 'Yes' : 'No'}</b>${a.final.edited ? ' (corrected)' : ''}` : a.draft.yes ? 'Yes' : 'No'}</td><td class="small ${a.draft.conf === 'low' ? 'neg' : 'muted'}">${a.draft.source}</td>
          <td>${a.reviewed ? badge('reviewed', 'good') : html`<button class="sm" data-qok="${q.id}:${a.qid}">Approve</button> <button class="sm" data-qfix="${q.id}:${a.qid}">Correct</button>`}</td></tr>`)}
        </tbody></table></div>
        <p class="hint">Check each answer against what is true today (SOC 2 tab: failing tests, commitments not operated). Each review takes ~${Math.round(Q.reviewHoursPerQ * 60 * (q.size ?? 1))} min.</p>
        <div class="inline"><button class="sm primary" data-qsubmit="${q.id}">Submit (${q.answers.filter((a) => !a.reviewed).length} unreviewed)</button></div>`}
    </section>`)}`;
}

export function bindCompliance(root, ctx) {
  const act = (fn, hours, label) => ctx.act(fn, { hours, label });
  on(root, 'click', '[data-platform]', (e, el) => act((st) => choosePlatform(st, el.dataset.platform), PLATFORMS[el.dataset.platform]?.setupHours ?? 1, 'Compliance platform setup'));
  on(root, 'click', '[data-trust]', () => act((st) => publishTrustCenter(st), 2, 'SOC 2: publish trust center'));
  on(root, 'click', '[data-framework]', (e, el) => act((st) => addFramework(st, el.dataset.framework), 6, 'Compliance framework mapping'));
  on(root, 'click', '[data-qdeflect]', (e, el) => act((st) => { const r = deflectQuestionnaire(st, el.dataset.qdeflect); ctx.toast(r.deflected ? 'They self-served from the trust center: no questionnaire needed.' : 'They read it and still want the questionnaire.', r.deflected ? 'good' : 'info'); }, 0.1, 'Trust-center link')); 
  on(root, 'click', '[data-integ]', (e, el) => act((st) => { const r = connectIntegration(st, el.dataset.integ); if (r.status === 'error') ctx.toast(r.error, 'warn'); }, INTEGRATIONS[el.dataset.integ].hours, 'SOC 2: connect integration'));
  on(root, 'click', '[data-fix]', (e, el) => act((st) => fixTest(st, el.dataset.fix), TESTS[el.dataset.fix].fixHours, 'SOC 2: fix failing test'));
  on(root, 'input', '[data-scope-reason]', (e, el) => { draft.scope[el.dataset.scopeReason] = el.value; });
  on(root, 'click', '[data-scope]', (e, el) => act((st) => { fixTest(st, el.dataset.scope, { scopeOut: true, reason: draft.scope[el.dataset.scope] ?? '' }); delete draft.scope[el.dataset.scope]; }, 0.1, 'SOC 2: scope change'));
  on(root, 'click', '[data-policies]', (e, el) => act((st) => { generatePolicies(st, el.dataset.policies); draft.keep = null; }, POLICY_HOURS[el.dataset.policies], 'SOC 2: policies'));
  on(root, 'change', '#commitForm input', (e, el) => { draft.keep = Object.keys(formData(el.form)); });
  on(root, 'submit', '#commitForm', (e) => { e.preventDefault(); const keep = Object.keys(formData(e.target)); act((st) => { reviewPolicies(st, keep); draft.keep = null; }, POLICY_HOURS.review, 'SOC 2: policy review'); });
  on(root, 'click', '[data-approve-asis]', () => act((st) => approvePolicies(st), 0.1, 'SOC 2: approve policies'));
  on(root, 'click', '[data-control]', (e, el) => act((st) => runControlAction(st, el.dataset.control), COMMITMENTS[el.dataset.control].action.hours, `SOC 2: ${COMMITMENTS[el.dataset.control].action.label}`));
  on(root, 'click', '[data-personnel-send]', () => act((st) => sendPersonnelOnboarding(st), PERSONNEL.sendHours, 'SOC 2: personnel onboarding'));
  on(root, 'click', '[data-own-tasks]', () => act((st) => completeOwnTasks(st), PERSONNEL.founderHours, 'SOC 2: your policy acceptance & training'));
  on(root, 'submit', '#auditForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const type = e.submitter?.value ?? 'type1';
    act((st) => { chooseAuditor(st, f.firm); startSoc2(st, type, { windowMonths: Number(f.window) || 6 }); }, SOC2.kickoffHours, 'SOC 2 kickoff');
  });
  on(root, 'click', '[data-qimport]', (e, el) => act((st) => importQuestionnaire(st, el.dataset.qimport), 0.1, 'Import questionnaire'));
  on(root, 'click', '[data-qdraft]', (e, el) => act((st) => aiDraft(st, el.dataset.qdraft), Q.aiBaseHours, 'Questionnaire: AI draft'));
  const rev = (action) => (e, el) => { const [qn, qid] = el.dataset[action === 'approve' ? 'qok' : 'qfix'].split(':'); const q = ensureCompliance(ctx.state).questionnaires.find((x) => x.id === qn); act((st) => reviewAnswer(st, qn, qid, action), Q.reviewHoursPerQ * (q?.size ?? 1), 'Questionnaire review'); };
  on(root, 'click', '[data-qok]', rev('approve'));
  on(root, 'click', '[data-qfix]', rev('correct'));
  on(root, 'click', '[data-qsubmit]', (e, el) => act((st) => { const r = submitQuestionnaire(st, el.dataset.qsubmit); ctx.toast(`Submitted.${r.wrong ? ` ${r.wrong} answer(s) are not true today.` : ''}`, r.wrong ? 'warn' : 'good'); }, 0.1, 'Questionnaire submit'));
  on(root, 'click', '[data-qmanual]', (e, el) => { const q = ensureCompliance(ctx.state).questionnaires.find((x) => x.id === el.dataset.qmanual); act((st) => submitQuestionnaire(st, el.dataset.qmanual, { mode: 'manual' }), Q.manualHoursPerQ * Q.shown * (q?.size ?? 1), 'Questionnaire by hand'); });
}
