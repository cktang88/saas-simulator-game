// People: Gusto (payroll) + Deel (contractors/EOR) + Ashby-lite (hiring pipeline) + an AI workforce.
// The player writes the job post, picks channels, screens, interviews candidates live (LLM persona,
// booked on the calendar), makes offers, runs payroll, grants options, and decides what to hand to
// AI agents versus people. Numbers: docs/research/hr-legal-product.md §1 (see people/catalog.js).

import { html, mount, on, formData, table, stat, badge, modal, barChart } from '../core/ui.js';
import { money, pct, fmtDate, isoDate, clamp } from '../core/util.js';
import { fmtTime } from '../core/calendar.js';
import { ROLES, AI_AGENTS, VENDORS, BENEFITS, EQUITY, SEVERANCE, burdenRate, jobRoleOf } from './people/catalog.js';
import { draft, hiringView, candidateView, engagementsFor } from './people/views-hiring.js';
import { AGENCY, setupHours } from './people/sourcing.js';
import { ASSESSMENTS } from './people/assess.js';
import { perfLabel } from './people/performance.js';
import { ROLES as DATA_ROLES, METHODS, TRAITS } from '../data/roles.js';
import { payPeriod, payrollLines, monthlyCostOf, vendorBills } from './people/payroll.js';
import { rampFactor, regionLabel, marketMid } from './people/hiring.js';
import { SUPPORT, aiResolveRate, weeklyTickets } from './people/support.js';
import { devHoursPerWeek, supportCapacity, codebaseMaturity, monthlyPeopleCost, headcount, optionGrants } from './people/capacity.js';
import {
  ensurePeople, createJob, applyJudge, openJob, closeJob, screenCandidate, scheduleInterview, canJoin, interviewEvent, startInterview,
  finishInterview, rejectCandidate, makeOffer, setupPayroll, terminate, hireAgent, cancelAgent, writeHelpDocs, get409A, createPool,
  peopleDay, peopleMonthEnd, misclassRisk, vestedPct, findCand, findJob, createScorecard, designWorkSample, assessCandidate,
  rateScorecard, disputeFee, putOnPip, convertToEmployee, poolUsed,
} from './people/sim.js';
import { judgeJobPost, interviewTurn, replyCandidate } from './people/llm.js';
import { entityOf, hasEin, ciiaaReady } from './legal/api.js';
import { memberView, bindPeopleOps } from './people/views-manage.js';
import { teamGlobalCell, memberGlobalCard, coreLine } from './people/views-global.js';
import { setCoreHours, CORE_PRESETS, planCoverage, setStipend, isFractionalRole } from './people/global.js';
import { ensureMgmt, tierOfScore } from './people/manage.js';
import { compView, bindComp } from './people/views-comp.js';
import { planKeyOf, memberOte } from './people/comp.js';

const TABS = [['', 'Team'], ['hiring', 'Hiring'], ['comp', 'Comp plans'], ['ai', 'AI workforce'], ['support', 'Support load'], ['payroll', 'Payroll'], ['equity', 'Equity']];


const dayFromIso = (s, iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(s.startDate + 'T12:00:00Z')) / 86400000);
const fmtPay = (m, s) => (m.engagement === 'contractor' ? `$${m.hourlyRate}/h × ${m.hoursPerWeek}h/wk` : planKeyOf(m) && s ? `${money(m.salary)} base · OTE ${money(memberOte(s, m) ?? m.salary)}` : `${money(m.salary)}/yr`);

function nextPayDay(s) {
  for (let d = s.day + 1; d < s.day + 32; d++) if (payPeriod(s, d)) return d;
  return null;
}

function typeLabel(m) {
  if (m.kind === 'ai_agent') return badge('AI agent', 'accent');
  const part = m.fractional ? ' · fractional' : (m.hoursPerWeek ?? 40) < 35 ? ` · ${m.hoursPerWeek}h` : '';
  if (m.engagement === 'contractor') return badge(`Contractor · ${regionLabel(m.region)}${m.cor ? ' · CoR' : ''}${part}`);
  if (m.engagement === 'eor') return badge(`EOR · ${regionLabel(m.region)}${part}`);
  return badge(`Employee · US${part}`);
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
          { label: 'Name', render: (m) => html`<b>${m.name}</b><div class="small muted">${m.kind === 'ai_agent' ? AI_AGENTS[m.agentType]?.group ?? '' : ROLES[jobRoleOf(m)]?.label ?? m.role}</div>` },
          { label: 'Type', render: (m) => typeLabel(m) },
          { label: 'Where · overlap · hours', render: (m) => teamGlobalCell(s, m) },
          { label: 'Status', render: (m) => (m.status === 'offer' ? badge(`starts ${fmtDate(s, m.startDay)}`, 'warn') : m.leavingDay ? badge(`leaving ${fmtDate(s, m.leavingDay)}`, 'bad') : m.kind === 'ai_agent' && s.day < (m.readyDay ?? 0) ? badge('setting up', 'warn') : badge('active', 'good')) },
          { label: 'Pay', render: (m) => (m.kind === 'ai_agent' ? AI_AGENTS[m.agentType]?.pricing ?? `${money(m.monthlyCost)}/mo` : fmtPay(m, s)) },
          { label: 'Cost/mo', align: 'right', render: (m) => money(monthlyCostOf(s, m)) },
          { label: 'Ramp', align: 'right', render: (m) => (m.kind === 'ai_agent' ? '—' : pct(rampFactor(m, s.day), 0)) },
          { label: 'Morale', align: 'right', render: (m) => (m.kind === 'ai_agent' ? '—' : html`<span class="${m.morale < 45 ? 'neg' : m.morale > 70 ? 'pos' : ''}">${Math.round(m.morale)}</span>`) },
          { label: 'Performance', render: (m) => { if (m.kind === 'ai_agent' || m.status !== 'active') return '—'; const l = perfLabel(m); return html`<span class="${l.tone === 'good' ? 'pos' : l.tone === 'bad' ? 'neg' : ''}">${l.text}</span>${m.perf?.metric ? html`<div class="small muted">${m.perf.metric.label}: ~${m.perf.metric.value}</div>` : ''}${m.pip?.status === 'active' ? html`<div class="small warn">on improvement plan until ${fmtDate(s, m.pip.endDay)}</div>` : ''}${m.provenance ? html`<div class="small ${l.tone === 'bad' && m.provenance.skipped.length ? 'neg' : 'muted'}">hire process: ${m.provenance.tier}${l.tone === 'bad' && m.provenance.skipped.length ? ` (skipped ${m.provenance.skipped.slice(0, 2).join('; ')})` : ''}</div>` : ''}`; } },
          { label: 'Managing', render: (m) => (m.kind === 'ai_agent' || m.kind === 'cofounder' ? '—' : html`<a href="#/people/${m.id}">${(() => { const g = ensureMgmt(m); return g.score != null ? `${tierOfScore(g.score)}${m.quietQuitting ? ' · quiet' : ''}` : 'set up'; })()}</a>`) },
          { label: 'Equity', align: 'right', render: (m) => (m.equityPct ? `${m.equityPct}%` : '—') },
          { label: '', render: (m) => html`${m.kind !== 'ai_agent' && m.status === 'active' && m.pip?.status !== 'active' ? html`<button class="sm" data-pip="${m.id}">PIP</button> ` : ''}${m.engagement === 'contractor' && m.status === 'active' && m.region === 'us' && ['staffing', 'contract_to_hire'].includes(AGENCY[m.channel]?.kind) ? html`<button class="sm" data-convert="${m.id}">Convert</button> ` : ''}<button class="sm danger" data-letgo="${m.id}">${m.kind === 'ai_agent' ? 'Cancel' : m.status === 'offer' ? 'Rescind' : 'Let go'}</button>` },
        ],
        rows: live,
        empty: 'Just you. Most 2026 solo founders run far with AI agents before the first hire; hire for judgment and ownership, not keystrokes.',
      })}
      <p class="hint">Performance reads are noisy and get clearer over months; ramp hides a lot (AEs take ~6 months). Founders typically act on a mis-hire 1–3 months after they know.</p>
      ${gone.length ? html`<details><summary class="small muted">Former team (${gone.length})</summary><ul class="list small">${gone.map((m) => html`<li><a href="#/people/${m.id}">${m.name}</a> · ${ROLES[jobRoleOf(m)]?.label ?? m.role} · left ${fmtDate(s, m.endDay)} (${m.exitReason ?? 'ended'})${m.grant?.vestedAtExit ? ` · vested ${m.grant.vestedAtExit}%` : ''}${m.postMortem?.misHire ? html` · <span class="neg">mis-hire: see post-mortem</span>` : ''}</li>`)}</ul></details>` : ''}
    </section>
    <div class="grid-2">
      <section class="panel">
        <h2>Payroll & HR setup</h2>
        <ul class="list">
          <li><b>Gusto</b> (US payroll, $${VENDORS.gusto.base}/mo + $${VENDORS.gusto.perPerson}/person): ${p.payrollSetup.gusto ? badge('set up', 'good') : html`${!hasEin(s) ? html`<span class="small muted">needs an EIN (Legal) · </span>` : ''}<button class="sm" data-setup="gusto">Set up (2h)</button>`}</li>
          <li><b>Deel</b> (contractors abroad $${VENDORS.deel.contractor}/mo each; EOR $${VENDORS.deel.eor}/employee/mo): ${p.payrollSetup.deel ? badge('set up', 'good') : html`<button class="sm" data-setup="deel">Set up (1h)</button>`}</li>
          <li><b>CIIAA template</b> for hires: ${ciiaaReady(s) ? badge('ready', 'good') : html`<a href="#/legal/founder">create in Legal</a>`}</li>
        </ul>
        <form id="benefitsForm" class="inline"><label>Benefits level <select name="benefits">${Object.entries(BENEFITS).map(([k, b]) => html`<option value="${k}" ${p.benefits === k ? 'selected' : ''}>${b.label} (${burdenRate({ ...s, apps: { people: { benefits: k } } }).toFixed(2)}× on $170k)</option>`)}</select></label><button>Save (0.5h)</button></form>
        <p class="hint">Employer cost = FICA 7.65% up to the $184.5k Social Security wage base (1.45% above), ~$420 FUTA/SUTA, a fixed health premium per head and any 401(k) match — so it weighs more on a $55k support hire (${burdenRate(s, 55000).toFixed(2)}×) than on a $170k engineer (${burdenRate(s).toFixed(2)}×). BLS ECEC (Jun 2026): benefits ≈ 30% of total comp on average. Monthly vendor bills now: Gusto ${money(bills.gusto)}, Deel ${money(bills.deel)}.</p>
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
      ${g === 'coding' ? html`<p class="small">How AI-written code is planned, reviewed and tested is set in <a href="#/product">Product → Build</a>.</p><p class="small muted">Measured speedups are smaller than people feel (METR 2025: experienced devs 19% slower on mature repos; 2026 update ~+18%). Gains are biggest on greenfield code. One seat per person: founder + each engineer.</p>` : ''}
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
      ${stat('Burden', `${burdenRate(s).toFixed(2)}×`, 'on a $170k salary (taxes + benefits)')}
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
  const used = poolUsed(p);
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
    const mem = param.startsWith('mem_') ? p.members.find((m) => m.id === param && m.kind !== 'ai_agent') : null;
    const tab = cand ? 'hiring' : mem ? '' : TABS.some(([k]) => k === param) ? param : '';
    const views = { '': teamView, hiring: hiringView, comp: compView, ai: aiView, support: supportView, payroll: payrollView, equity: equityView };
    mount(root, html`
      <div class="app-head"><div><h1>People</h1><p>Payroll (Gusto), contractors & EOR (Deel), hiring, equity and your AI workforce. General information, not legal or tax advice.</p></div></div>
      <div class="tabs">${TABS.map(([k, l]) => html`<a href="#/people${k ? '/' + k : ''}" class="${tab === k && !cand && !mem ? 'active' : ''}">${l}</a>`)}</div>
      ${cand ? candidateView(s, p, cand) : mem ? memberView(s, p, mem) : views[tab](s, p)}`);
    bindPeopleOps(root, ctx, { p, cand, member: mem });
    if (tab === 'comp' && !cand && !mem) bindComp(root, ctx);

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

    on(root, 'click', '[data-pip]', (e, el) => ctx.act((st) => { putOnPip(st, el.dataset.pip); ctx.toast('Performance plan started: 6 weeks, clear goals, weekly check-ins (~2h/week of your time).', 'info'); }, { hours: 1.5, label: 'Performance plan' }));
    on(root, 'click', '[data-convert]', (e, el) => {
      const m = p.members.find((x) => x.id === el.dataset.convert);
      modal({ title: `Convert ${m.name} to an employee`, body: html`<p class="small">Staffing / contract-to-hire agencies charge a conversion fee (~15–20% of salary, reduced by hours already billed). Agree terms before placement.</p><label>Base salary ($/yr) <input type="number" name="salary" value="${Math.round((m.hourlyRate ?? 50) * 2080 * 0.75 / 1000) * 1000}" /></label>`,
        actions: [{ label: 'Cancel' }, { label: 'Convert (1h)', primary: true, onClick: (d, form) => ctx.act((st) => { const fee = convertToEmployee(st, m.id, Number(form.salary.value)); ctx.toast(`Converted. Conversion fee ${money(fee)}.`, 'good'); }, { hours: 1, label: 'Convert contractor' }) }] });
    });

    // ---- hiring ----
    const saveJobDraft = () => { const f = root.querySelector('#jobForm'); if (f) Object.assign(draft.job, formData(f)); };
    on(root, 'input', '#jobForm textarea, #jobForm input', saveJobDraft);
    // Role, region and engagement constrain each other: fractional is for the executive roles, abroad needs an EOR.
    const reconcileJob = () => {
      const d = draft.job;
      if (isFractionalRole(d.role)) { if (!['fractional', 'contractor'].includes(d.engagement)) d.engagement = 'fractional'; }
      else if (d.engagement === 'fractional') d.engagement = d.region === 'us' ? 'employee' : 'eor';
      const allowed = engagementsFor(d.region, d.role);
      if (!allowed.includes(d.engagement)) d.engagement = allowed[0];
      const [lo, hi, def] = d.engagement === 'fractional' ? [4, 20, 8] : d.engagement === 'part_time_employee' ? [10, 30, 20] : d.engagement === 'contractor' ? [5, 40, 40] : [40, 40, 40];
      if (!(d.hoursPerWeek >= lo && d.hoursPerWeek <= hi)) d.hoursPerWeek = def;
    };
    on(root, 'change', '#jobForm select, #jobForm input[type=checkbox], #jobForm input[name=requiredOverlap], #jobForm input[name=hoursPerWeek]', () => {
      saveJobDraft();
      reconcileJob();
      ctx.render();
    });
    // Company core hours (time-zone overlap is measured against them) and the support handoff runbook.
    on(root, 'submit', '#coreForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      const preset = CORE_PRESETS[f.preset];
      const c = preset && f.preset !== 'custom' && Number(f.tz) === preset.tz && Number(f.start) === preset.start && Number(f.end) === preset.end ? preset : { tz: f.tz, start: f.start, end: f.end, label: 'Custom' };
      ctx.act((st) => { setCoreHours(st, c); ctx.toast(`Core hours set: ${coreLine(st)}. Overlap is recomputed for candidates and the team.`, 'good'); }, { hours: 0.1, label: 'Company core hours' });
    });
    on(root, 'change', '#coreForm select[name=preset]', (e, el) => {
      const pr = CORE_PRESETS[el.value];
      if (!pr) return;
      const form = el.closest('form');
      form.elements.tz.value = pr.tz; form.elements.start.value = pr.start; form.elements.end.value = pr.end;
    });
    on(root, 'click', '[data-plan-coverage]', () => ctx.act((st) => { planCoverage(st); ctx.toast('Handoff runbook and shift schedule written: first response in your hours recovers.', 'good'); }, { hours: 3, label: 'Support handoff runbook' }));
    on(root, 'click', '[data-stipend]', (e, el) => { const m = p.members.find((x) => x.id === el.dataset.stipend); ctx.act((st) => setStipend(st, el.dataset.stipend, !m?.stipend), { hours: 0.1, label: 'Backup power and internet stipend' }); });
    on(root, 'submit', '#jobForm', (e) => {
      e.preventDefault();
      saveJobDraft();
      const d = { ...draft.job };
      e.target.querySelector('button.primary').textContent = 'Candidates are reading your post…';
      ctx.act(async (st) => {
        const job = createJob(st, { ...d, payLo: Number(d.payLo) || 0, payHi: Number(d.payHi) || 0, hoursPerWeek: Number(d.hoursPerWeek) || 40, requiredOverlap: Number(d.requiredOverlap) || 0, allowShift: Boolean(d.allowShift), senior: Boolean(d.senior) });
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
      const hours = added.reduce((a, c) => a + (AGENCY[c] ? setupHours(AGENCY[c]) : 0), 0) || 0.25;
      ctx.act((st) => { openJob(st, id, chosen); delete draft.channels[id]; }, { hours, label: 'Sourcing: job channels & agencies' });
    });
    on(root, 'input', '.scForm input, .scForm textarea', (e, el) => {
      const form = el.closest('form');
      const f = formData(form);
      draft.scorecard[form.dataset.job] = { mission: f.mission, outcomes: f.outcomes, competencies: Object.keys(TRAITS).filter((k) => f[`c_${k}`]) };
    });
    on(root, 'change', '.scForm input[type=checkbox]', (e, el) => {
      const form = el.closest('form');
      const f = formData(form);
      draft.scorecard[form.dataset.job] = { mission: f.mission, outcomes: f.outcomes, competencies: Object.keys(TRAITS).filter((k) => f[`c_${k}`]) };
    });
    on(root, 'submit', '.scForm', (e) => {
      e.preventDefault();
      const id = e.target.dataset.job;
      const f = formData(e.target);
      ctx.act((st) => createScorecard(st, id, { mission: f.mission, outcomes: String(f.outcomes ?? '').split('\n').map((x) => x.trim()).filter(Boolean), competencies: Object.keys(TRAITS).filter((k) => f[`c_${k}`]) }), { hours: METHODS.structuredInterview.costHours.design, label: 'Hiring scorecard' });
    });
    on(root, 'click', '[data-ws-design]', (e, el) => ctx.act((st) => designWorkSample(st, el.dataset.wsDesign), { hours: METHODS.workSample.costHours.design, label: 'Design work sample' }));
    on(root, 'click', '[data-dispute]', (e, el) => {
      const [id, action] = el.dataset.dispute.split(':');
      ctx.act((st) => { const d = disputeFee(st, id, action); ctx.toast(`Fee claim ${d.status}.`, d.status === 'won' ? 'good' : 'info'); }, { hours: action === 'dispute' ? 2 : 0.1, label: 'Agency fee claim' });
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
      on(root, 'change', '#camOn', (e, el) => { draft.camera[cand.id] = el.checked; });
      on(root, 'click', '[data-join]', () => ctx.act((st) => { const c = startInterview(st, cand.id, { camera: root.querySelector('#camOn')?.checked === true }); if (c.stage === 'withdrawn') ctx.toast(`${c.name} ended the call when asked to keep the camera on and show ID.`, 'warn'); }));
      on(root, 'input', '#askBox', (e) => { draft.question[cand.id] = e.target.value; });
      on(root, 'submit', '#askForm', async (e) => {
        e.preventDefault();
        const q = String(formData(e.target).q ?? '').trim();
        if (!q) return;
        if (cand.interview.messages.filter((m) => m.from === 'me').length >= 12) { ctx.toast('Time is up. End the interview.', 'warn'); return; }
        e.target.querySelector('button.primary').disabled = true;
        draft.question[cand.id] = '';
        await ctx.act(async () => { const r = await interviewTurn(ctx, cand.id, q.slice(0, 1000)); if (r.grade?.illegal) ctx.toast(`Illegal question (${r.grade.illegal.topic.replace(/_/g, ' ')}). ${r.ended ? 'The candidate ended the interview.' : 'Complaint risk logged.'}`, 'bad'); });
        root.ownerDocument.getElementById('askBox')?.focus();
      });
      on(root, 'click', '[data-finish]', () => ctx.act((st) => { const c = finishInterview(st, cand.id); ctx.toast(`Interview done: structure ${Math.round((c.interview.execution ?? 0) * 100)}%, validity ${(c.interview.validity ?? 0).toFixed(2)}.`, 'good'); }));
      on(root, 'click', '[data-suggest]', (e, el) => {
        e.preventDefault();
        const q = DATA_ROLES[cand.role]?.sampleQuestions?.[+el.dataset.suggest];
        if (!q) return;
        draft.question[cand.id] = q.text;
        const box = root.querySelector('#askBox');
        if (box) { box.value = q.text; box.focus(); }
      });
      on(root, 'click', '[data-assess]', (e, el) => {
        const k = el.dataset.assess;
        ctx.act((st) => { const r = assessCandidate(st, cand.id, k); ctx.toast(r.text, r.redFlags?.length ? 'warn' : r.ok ? 'good' : 'warn'); }, { hours: ASSESSMENTS[k].hours, label: ASSESSMENTS[k].label });
      });
      on(root, 'change', '#rateForm select', (e) => { draft.ratings[cand.id] = formData(e.target.form); });
      on(root, 'submit', '#rateForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => rateScorecard(st, cand.id, f), { hours: 0.1, label: 'Scorecard' }); });
      on(root, 'input', '#offerForm input', (e) => {
        const f = formData(e.target.form);
        Object.assign(draft.offer[cand.id], { pay: f.pay, equityPct: f.equityPct ?? 0, start: f.start, hoursPerWeek: f.hoursPerWeek ?? cand.hoursPerWeek ?? 40, cor: Boolean(f.cor), localIp: Boolean(f.localIp) });
      });
      on(root, 'submit', '#offerForm', (e) => {
        e.preventDefault();
        const f = formData(e.target);
        const contractor = cand.engagement === 'contractor';
        ctx.act((st) => {
          makeOffer(st, cand.id, { salary: contractor ? null : f.pay, hourlyRate: contractor ? f.pay : null, equityPct: Number(f.equityPct) || 0, startDay: dayFromIso(st, f.start), hoursPerWeek: f.hoursPerWeek ?? cand.hoursPerWeek ?? 40, cor: Boolean(f.cor), localIp: Boolean(f.localIp) });
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
    on(root, 'click', '[data-docs]', () => ctx.act((st) => writeHelpDocs(st, 2), { hours: 2, label: 'Write help-center articles' }));
    on(root, 'submit', '#capForm', (e) => { e.preventDefault(); const cap = clamp(Number(formData(e.target).cap) || 0, 0, 30); ctx.act((st) => { ensurePeople(st).support.founderCapHours = cap; }); });

    // ---- equity ----
    on(root, 'click', '[data-409a]', () => ctx.act((st) => { const v = get409A(st); ctx.toast(`409A done: common FMV $${v.fmv}/share.`, 'good'); }, { hours: EQUITY.valuation409A.hours, label: '409A valuation' }));
    on(root, 'submit', '#poolForm', (e) => { e.preventDefault(); const v = Number(formData(e.target).pct); ctx.act((st) => createPool(st, v), { hours: 1, label: 'Option pool board consent' }); });
  },
};
