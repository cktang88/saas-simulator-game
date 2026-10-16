// People → HR stack tab: payroll / HR platform, EOR provider, ATS and AI sourcing, each shown as a workflow with its
// fit, trap and live cost. Rendering and event wiring only; rules live in people/stack.js.

import { html, on, formData, badge, stat } from '../../core/ui.js';
import { money, fmtDate } from '../../core/util.js';
import { hasEin } from '../legal/api.js';
import {
  ensureStack, PAYROLL_VENDORS, RIPPLING_MODULES, RIPPLING_BUNDLE, EOR_VENDORS, ATS_VENDORS, ATS_ADDONS, JUICEBOX,
  usPayrollVendor, globalVendor, hrBills, ripplingPerUser, choosePayroll, designRipplingWorkflows, setRipplingModules, chooseEor,
  atsVendor, chooseAts, setAtsAddOn, pipelineReport, reviewPipeline, sendNurture, enableJuicebox, juiceboxSearch, juiceboxSend,
  briefSpecificity, hrStackScore, atsScore,
} from './stack.js';
import { syncVendorBills } from './sim.js';

const STATUS = { keep: ['leader', 'good'], 'keep-alt': ['alternative', ''], declining: ['declining', 'warn'], trap: ['trap', 'bad'], dead: ['retired', 'bad'] };
const st = (k) => badge(...(STATUS[k] ?? [k, '']));
const draft = { mods: null, brief: {} };

function feedback(r, title) {
  if (!r) return '';
  return html`<div class="callout small ${r.score >= 0.8 ? 'good' : r.score >= 0.55 ? '' : 'warn'}"><b>${title}: ${Math.round(r.score * 100)}%.</b> ${r.evidence.join(' ')}${r.coaching.length ? html`<ul style="margin:4px 0;padding-left:18px">${r.coaching.map((c) => html`<li>${c}</li>`)}</ul>` : ''}</div>`;
}

export function stackView(s, p) {
  const h = ensureStack(s);
  const v = usPayrollVendor(s), g = globalVendor(s);
  const bills = hrBills(s);
  const r = h.rippling;
  const mods = draft.mods ?? (r ? Object.keys(r.modules) : RIPPLING_BUNDLE);
  const ats = atsVendor(s);
  const a = p.ats;
  const src = p.sourcing;
  const openJobs = (p.jobs ?? []).filter((j) => j.status === 'open');
  const rep = ATS_VENDORS[ats].analytics ? pipelineReport(s) : null;
  return html`
    <div class="stats">
      ${stat('US payroll', v ? PAYROLL_VENDORS[v].label : 'none', v ? `${money(bills.us.amount)}/mo now` : 'needed before a W-2 hire')}
      ${stat('EOR / abroad', g ? EOR_VENDORS[g].label : 'none', g ? `${money(bills.global.amount)}/mo now` : 'needed before an employee abroad')}
      ${stat('ATS', ATS_VENDORS[ats].label, ats === 'none' ? 'fine for the first hire or two' : ATS_VENDORS[ats].paradigm)}
      ${stat('AI sourcing', src.juicebox ? 'Juicebox seat' : 'off', src.juicebox ? `${src.lookups} email lookups left` : '')}
    </div>
    ${feedback(hrStackScore(s), 'HR stack fit')}
    ${feedback(atsScore(s), 'Hiring tools fit')}
    <div class="grid-2">
      <section class="panel"><h2>Payroll and HR platform</h2>
        ${Object.entries(PAYROLL_VENDORS).map(([k, V]) => html`<div class="card small"><b>${V.label}</b> ${st(V.status)} ${v === k ? badge('current', 'good') : ''}
          <div>${V.paradigm}. ${k === 'gusto' ? `$${V.base}/mo + $${V.perPerson}/person; contractors abroad in 120+ countries; employees abroad are referred to Remote (from May 2026, one source).` : k === 'rippling' ? `$${V.platform}/mo platform + per-user modules (real bills $20-35/employee), ${money(V.implFee)} implementation, ${V.contractMonths}-month contract. One record drives payroll, apps, devices and offboarding once you design the workflows.` : `PEO: $${V.pepm.basic}-${V.pepm.plus} per employee per month (list, unverified); its benefits plans and state accounts; leaving mid-year restarts wage bases.`}</div>
          <div class="muted">Fits: ${V.fit}. Trap: ${V.trap}</div>
          ${k === 'rippling' && v !== 'rippling' ? html`<form data-rip-form class="small"><b>Modules</b> (the rep pre-checks the bundle): ${Object.entries(RIPPLING_MODULES).map(([mk, M]) => html`<label style="display:inline-block;margin-right:8px"><input type="checkbox" name="${mk}" ${mods.includes(mk) ? 'checked' : ''} ${M.required ? 'disabled' : ''} /> ${M.label} ($${M.perUser})</label>`)}
            <div><button class="sm" ${hasEin(s) ? '' : 'disabled'}>Sign with Rippling (${V.setupHours}h${v ? ` + ${8}h migration` : ''})</button></div></form>`
          : v !== k ? html`<button class="sm" data-payroll="${k}" ${hasEin(s) ? '' : 'disabled'}>${v ? 'Migrate' : 'Set up'} (${V.setupHours}h${v ? ' + migration' : ''})</button>` : ''}
        </div>`)}
        ${!hasEin(s) ? html`<p class="hint">Every payroll platform needs your EIN and state employer accounts (Legal).</p>` : ''}
        ${v === 'rippling' && r ? html`<div class="card small"><b>Your Rippling</b>: ${Object.keys(r.modules).map((k) => RIPPLING_MODULES[k]?.label).join(', ')} · $${ripplingPerUser(s)}/user + $${PAYROLL_VENDORS.rippling.platform} · term ends ${fmtDate(s, r.termEnd)}
          ${r.workflowsDay == null ? html`<div class="warn">Workflows not designed: hires and exits are still manual.</div><button class="sm primary" data-rip-wf>Design hire/exit workflows (${PAYROLL_VENDORS.rippling.workflowHours}h)</button>` : html`<div>${badge('workflows live', 'good')} Accounts provisioned before day 1, apps revoked on exit${r.modules.devices ? ', laptops enrolled in MDM' : ''}.</div>`}
          <form data-rip-mods class="small">${Object.entries(RIPPLING_MODULES).map(([mk, M]) => html`<label style="display:inline-block;margin-right:8px"><input type="checkbox" name="${mk}" ${r.modules[mk] && !(r.pendingDrop ?? []).includes(mk) ? 'checked' : ''} ${M.required ? 'disabled' : ''} /> ${M.label}</label>`)}<button class="sm">Save modules (drops take effect at renewal)</button></form></div>` : ''}
      </section>
      <section class="panel"><h2>EOR and contractors abroad</h2>
        ${Object.entries(EOR_VENDORS).filter(([, E]) => !E.requires || E.requires === v).map(([k, E]) => html`<div class="card small"><b>${E.label}</b> ${st(E.status)} ${g === k ? badge('current', 'good') : ''}
          <div>${E.paradigm}. EOR ${money(E.eor)}/employee/mo${E.eorMonthly ? ` (annual; ${money(E.eorMonthly)} month-to-month)` : ''}${E.cor ? `, contractors ${money(E.contractor)}, Contractor of Record ${money(E.cor)}` : ''}. Local contract + onboarding ~${E.onboardDays} days.</div>
          ${g !== k ? html`<button class="sm" data-eor="${k}">Use ${E.label} (${E.setupHours}h)</button>${k === 'remote' ? html` <button class="sm" data-eor="remote" data-plan="monthly">Month-to-month</button>` : ''}` : ''}</div>`)}
        <p class="hint">${v === 'gusto' ? 'On Gusto: contractors abroad can be paid from Gusto; an employee abroad needs an EOR (Gusto refers new customers to Remote). ' : ''}Existing EOR employees stay with the provider that employs them. Deel is the only one here with Contractor of Record.</p>
      </section>
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Applicant tracking</h2>
        ${Object.entries(ATS_VENDORS).map(([k, A]) => html`<div class="card small"><b>${A.label}</b> ${st(A.status)} ${ats === k ? badge('current', 'good') : ''}
          <div>${A.paradigm}. ${k === 'ashby' ? `$${A.monthly}/mo (up to 100 employees), 1,500 AI credits, self-scheduling, source-yield analytics.` : k === 'greenhouse' ? `Annual contract ~$6-7K for small teams, ~$27K median; kit + scorecard required before any interview, ~15 min scorecard after each; Real Talent fraud flags.` : k === 'lever' ? `Annual ~$5-15K; nurture campaigns bring past candidates back; thinner evaluation and reporting. ${A.note}` : 'Free; every interview is email back-and-forth (~15 min) and candidates go cold faster.'}</div>
          ${A.fit ? html`<div class="muted">Fits: ${A.fit}. Trap: ${A.trap}</div>` : ''}
          ${ats !== k ? html`<button class="sm" data-ats="${k}">Switch (${A.setupHours ?? 0}h)</button>` : ''}</div>`)}
        ${ats === 'ashby' ? html`<div class="card small"><b>Ashby add-ons</b> ${Object.entries(ATS_ADDONS).map(([k, A]) => html`<label style="display:inline-block;margin-right:8px"><input type="checkbox" data-addon="${k}" ${a.addOns?.[k] ? 'checked' : ''} /> ${A.label} (${money(A.monthly)}/mo)</label>`)}</div>` : ''}
        ${ATS_VENDORS[ats].revive ? html`<button class="sm" data-nurture>Send a nurture campaign to past candidates (${ATS_VENDORS[ats].nurtureHours ?? 0.75}h)</button> <span class="small muted">${(a.nurtures ?? []).length ? `last ${fmtDate(s, a.nurtures.at(-1))}` : 'never'}</span>` : ''}
      </section>
      <section class="panel"><h2>Pipeline report ${rep ? '' : badge('Ashby only', '')}</h2>
        ${rep ? html`${rep.length ? html`<div class="table-wrap"><table><thead><tr><th>Source</th><th>Cands</th><th>Interviewed</th><th>Offers</th><th>Hires</th><th>Spend</th><th>Cost/hire</th></tr></thead><tbody>${rep.map((x) => html`<tr><td>${x.label}</td><td>${x.candidates}</td><td>${x.interviewed}</td><td>${x.offers}</td><td>${x.hires}</td><td>${money(x.spend)}</td><td>${x.costPerHire == null ? '—' : money(x.costPerHire)}</td></tr>`)}</tbody></table></div>` : html`<p class="muted small">No candidates yet.</p>`}
          <button class="sm" data-review-pipeline>Review the report (0.5h)</button> <span class="small muted">${(a.reviews ?? []).length ? `last read ${fmtDate(s, a.reviews.at(-1))}` : 'never read'}</span>`
          : html`<p class="muted small">Your ATS reports counts per stage, not source yield or cost per hire.</p>`}
      </section>
    </div>
    <section class="panel"><h2>AI sourcing: ${JUICEBOX.label}</h2>
      ${!src.juicebox ? html`<p class="small">Describe the candidate in plain language, review the shortlist, send a sequence. ~$${JUICEBOX.seat}/seat/month (third-party), ${JUICEBOX.lookups} email lookups a month (game value). Reply rates: templated ~5.5%, a sequence ~17%, personalised 15-30%.</p><button class="sm" data-jb-on>Start a seat (0.5h)</button>`
      : openJobs.length ? openJobs.map((j) => { const jb = j.juicebox; const b = briefSpecificity(draft.brief[j.id] ?? jb?.brief ?? ''); return html`<div class="card small"><b>${j.title}</b>
        <form data-jb-search="${j.id}"><textarea name="brief" rows="2" style="width:100%" placeholder="Senior backend engineer, 6+ years TypeScript and Postgres, shipped billing systems at a Series A-B SaaS, US time zones, not agency or consulting backgrounds">${draft.brief[j.id] ?? jb?.brief ?? ''}</textarea>
          <div class="muted">Brief specificity ${Math.round(b.score * 100)}%${b.missing.length ? ` · missing: ${b.missing.join(', ')}` : ''}</div><button class="sm">Search + review shortlist (${JUICEBOX.briefHours + JUICEBOX.reviewHoursPer25}h)</button></form>
        ${jb ? html`<div>Shortlist ${jb.shortlist} · ~${Math.round(jb.matchShare * 100)}% real matches · sent ${jb.sent} · replies ${jb.replies}</div>
          <div class="inline">${['template', 'sequence', 'personalized'].map((m) => html`<button class="sm" data-jb-send="${j.id}" data-mode="${m}" data-count="${m === 'personalized' ? 25 : 50}">${m === 'personalized' ? 'Send 25 personalised' : m === 'sequence' ? 'Send 50 as a sequence' : 'Blast 50 templated'} (~${Math.round(((m === 'personalized' ? 25 : 50) * JUICEBOX.minutesPerMessage[m]) / 60 * 10) / 10}h)</button>`)}</div>` : ''}</div>`; })
      : html`<p class="muted small">Open a job in Hiring to source for it.</p>`}
    </section>`;
}

export function bindStack(root, ctx) {
  const act = (fn, hours, label) => ctx.act(fn, { hours, label });
  const after = (st) => syncVendorBills(st);
  on(root, 'click', '[data-payroll]', (e, el) => { const k = el.dataset.payroll; const V = PAYROLL_VENDORS[k]; const mig = usPayrollVendor(ctx.state) ? (usPayrollVendor(ctx.state) === 'justworks' ? 10 : 8) : 0; act((st) => { choosePayroll(st, k, { hasEin: hasEin(st) }); after(st); }, V.setupHours + mig, `${V.label} setup`); });
  on(root, 'change', '[data-rip-form] input', (e, el) => { draft.mods = Object.keys(formData(el.form)); });
  on(root, 'submit', '[data-rip-form]', (e) => { e.preventDefault(); const mods = Object.keys(formData(e.target)); const mig = usPayrollVendor(ctx.state) ? (usPayrollVendor(ctx.state) === 'justworks' ? 10 : 8) : 0; act((st) => { choosePayroll(st, 'rippling', { modules: mods, hasEin: hasEin(st) }); after(st); draft.mods = null; }, PAYROLL_VENDORS.rippling.setupHours + mig, 'Rippling setup'); });
  on(root, 'click', '[data-rip-wf]', () => act((st) => designRipplingWorkflows(st), PAYROLL_VENDORS.rippling.workflowHours, 'Rippling: hire/exit workflows'));
  on(root, 'submit', '[data-rip-mods]', (e) => { e.preventDefault(); const mods = Object.keys(formData(e.target)); act((st) => { setRipplingModules(st, mods); after(st); }, 0.25, 'Rippling modules'); });
  on(root, 'click', '[data-eor]', (e, el) => { const k = el.dataset.eor; act((st) => { chooseEor(st, k, { plan: el.dataset.plan ?? 'annual' }); after(st); }, EOR_VENDORS[k].setupHours, `${EOR_VENDORS[k].label} setup`); });
  on(root, 'click', '[data-ats]', (e, el) => { const k = el.dataset.ats; act((st) => chooseAts(st, k), ATS_VENDORS[k].setupHours ?? 0, `ATS: ${ATS_VENDORS[k].label}`); });
  on(root, 'change', '[data-addon]', (e, el) => act((st) => setAtsAddOn(st, el.dataset.addon, el.checked), 0.1, 'Ashby add-on'));
  on(root, 'click', '[data-review-pipeline]', () => act((st) => reviewPipeline(st), 0.5, 'Ashby pipeline report'));
  on(root, 'click', '[data-nurture]', () => act((st) => sendNurture(st), ATS_VENDORS[atsVendor(ctx.state)].nurtureHours ?? 0.75, 'Candidate nurture campaign'));
  on(root, 'click', '[data-jb-on]', () => act((st) => enableJuicebox(st), 0.5, 'Juicebox seat'));
  on(root, 'input', '[data-jb-search] textarea', (e, el) => { draft.brief[el.form.dataset.jbSearch] = el.value; });
  on(root, 'submit', '[data-jb-search]', (e) => { e.preventDefault(); const id = e.target.dataset.jbSearch; const brief = formData(e.target).brief; act((st) => { const job = st.apps.people.jobs.find((j) => j.id === id); juiceboxSearch(st, job, brief); }, JUICEBOX.briefHours + JUICEBOX.reviewHoursPer25, 'Juicebox search'); });
  on(root, 'click', '[data-jb-send]', (e, el) => {
    const id = el.dataset.jbSend, mode = el.dataset.mode, count = Number(el.dataset.count);
    act((st) => { const job = st.apps.people.jobs.find((j) => j.id === id); const r = juiceboxSend(st, job, { count, mode }); ctx.toast(`Sent ${r.sent}: ${r.replies} replied.`, r.replies ? 'good' : 'info'); }, (count * JUICEBOX.minutesPerMessage[mode]) / 60, 'Juicebox outreach');
  });
}
