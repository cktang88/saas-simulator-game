// Advisors: the people you take advice from. Advice does not appear on dashboards; it comes from advisors, consultants, fractional
// execs, mentors, your board, peers or the AI Assistant, each with a cost, limited time and a viewpoint you cannot fully see.
// Core gate and source model: core/advice.js. Recruiting (cap table, agencies, People): apps/advisors/recruit.js.

import { html, mount, on, formData, badge, stat, toast } from '../core/ui.js';
import { fmtDate, money } from '../core/util.js';
import { ensureAdvice, sources, inbox, followAdvice, ask, setAccess, learningMode, adviceDay, ACCESS, conflicts } from '../core/advice.js';
import { ensureIr } from './fundraising/ir.js';
import { ENGAGEMENT, PEER_GROUPS, advisorsDay, syncSources, findAdvisors, startAdvisorTrial, signAdvisorSource, endAdvisorSource, findConsultants, hireConsultant, joinPeerGroup, enableAssistantSource, bookOfficeHours } from './advisors/recruit.js';

const costLine = (c) => [c.equityPct ? `${c.equityPct}% equity (FAST, 2-year vest)` : '', c.perMonthUsd ? `${money(c.perMonthUsd)}/mo` : '', c.perHourUsd ? `${money(c.perHourUsd)}/h` : '', c.feeUsd ? `${money(c.feeUsd)} paid` : ''].filter(Boolean).join(' · ') || 'free';
const tone = { high: 'accent', medium: '', low: 'warn' };
let consultResults = null;

export default {
  id: 'advisors',
  title: 'Advisors',
  icon: '🧭',
  group: 'Company',
  badge: (state) => inbox(state).filter((x) => x.followed == null && x.kind === 'answer').length || null,
  onDay(state) { advisorsDay(state); adviceDay(state); },
  render(root, ctx) {
    const s = ctx.state;
    ensureAdvice(s);
    syncSources(s);
    const srcs = sources(s);
    const ir = ensureIr(s);
    const box = inbox(s).slice(0, 40);
    const advStatus = (x) => ir.advisors.find((a) => a.id === x.refs.irAdvisorId)?.status;
    const conf = conflicts(box.filter((x) => x.kind !== 'answer'));
    mount(root, html`
      <div class="app-head"><div><h1>Advisors</h1><p>Nothing on your dashboard tells you what to do. Advice comes from people you recruit, and they differ: some know your segment, some are selling you something, some played a different game ten years ago. They see only what you share. Ask specific questions with numbers attached, compare opinions, and decide yourself.</p></div></div>
      <div class="stats">
        ${stat('Sources', srcs.length, srcs.length ? 'people you can ask' : 'recruit one below', srcs.length ? '' : 'warn')}
        ${stat('Unread answers', inbox(s).filter((x) => x.followed == null && x.kind === 'answer').length)}
        ${stat('Followed', ensureAdvice(s).followed.length, 'pieces of advice acted on')}
        ${stat('Learning mode', learningMode(s) ? 'On' : 'Off', 'built-in coaching in Settings')}
      </div>
      <section class="panel"><h2>Your sources</h2>
        ${srcs.length ? html`<div class="table-wrap"><table><thead><tr><th>Who</th><th>Covers</th><th>Cost</th><th>Time</th><th>Sees your data</th><th></th></tr></thead><tbody>
          ${srcs.map((x) => html`<tr><td><b>${x.name}</b><div class="small muted">${x.role}</div></td>
            <td class="small">${x.functions.includes('*') ? 'everything, generically' : `${x.functions.length} areas`}</td>
            <td class="small">${costLine(x.cost)}</td>
            <td class="small">${x.hoursPerMonth >= 999 ? 'on demand' : `${x.used.month && x.used.hours ? `${x.used.hours.toFixed(1)} of ` : ''}${x.hoursPerMonth} h/mo`}<div class="muted">answers in ${x.responseDays} d</div></td>
            <td><select data-access="${x.id}">${ACCESS.map((a) => html`<option value="${a}" ${a === x.access ? 'selected' : ''}>${{ none: 'nothing', metrics: 'headline metrics', full: 'everything' }[a]}</option>`)}</select></td>
            <td class="inline"><button class="sm" data-hours="${x.id}">Office hours</button>${x.refs.irAdvisorId && x.cost.equityPct === 0 && advStatus(x) === 'trial_done' ? html`<select data-level="${x.id}">${Object.entries(ENGAGEMENT).map(([k, v]) => html`<option value="${k}">${v.label} (${v.pct}%)</option>`)}</select><button class="sm primary" data-sign="${x.id}">Sign FAST</button>` : ''}${x.refs.irAdvisorId && advStatus(x) === 'trial' ? html`<span class="small muted">trial until ${fmtDate(s, ir.advisors.find((a) => a.id === x.refs.irAdvisorId)?.trialEnds ?? s.day)}</span>` : ''}${x.refs.irAdvisorId ? html`<button class="sm" data-end="${x.id}">End</button>` : ''}</td></tr>`)}
        </tbody></table></div>` : html`<p class="muted">Nobody yet. Founders without advisors learn everything the expensive way.</p>`}
      </section>
      <section class="panel"><h2>Ask</h2>
        <form id="askForm"><div class="grid-2">
          <label>Who <select name="source">${srcs.map((x) => html`<option value="${x.id}">${x.name}</option>`)}</select></label>
          <label>Share <select name="share"><option value="metrics">Headline metrics</option><option value="none">Nothing</option><option value="full">Everything (one-liner, customer, numbers)</option></select></label></div>
          <label>Your question (specific, with the numbers behind it) <textarea name="q" rows="3" placeholder="Our trial-to-paid is 4% over 120 signups. We think pricing is the issue. What would you check first?"></textarea></label>
          <button class="primary" ${srcs.length ? '' : 'disabled'}>Ask (30 min, billed if they charge)</button></form>
      </section>
      <section class="panel"><h2>Advice inbox</h2>
        ${conf.length ? html`<div class="callout warn small"><b>Your sources disagree.</b> ${conf.length === 1 ? 'Two of them point opposite ways on' : 'They point opposite ways on'} ${[...new Set(conf.map((c) => c.true.functionId.replace(/_/g, ' ')))].join(', ')}. Ask each for evidence; check the numbers yourself.</div>` : ''}
        ${box.length ? html`<ul class="list">${box.map((x) => html`<li><span class="muted small">${fmtDate(s, x.day)}</span> <b>${x.from}</b> ${badge(`${x.confidence} confidence`, tone[x.confidence])}
          <div>${x.text}</div>${x.question ? html`<div class="small muted">You asked: ${x.question}</div>` : ''}
          ${x.followed != null ? html`<div class="small muted">You acted on this on ${fmtDate(s, x.followed)}.</div>` : x.kind === 'answer' ? '' : html`<button class="sm" data-follow="${x.id}">Follow this advice</button>`}</li>`)}</ul>` : html`<p class="muted">Empty. Ask a question, or hold office hours.</p>`}
        <p class="small muted">A confident tone is not evidence. You will find out whether advice was right only by what it does to your numbers.</p>
      </section>
      <section class="panel"><h2>Find people</h2>
        <div class="grid-2">
          <div><h3>Advisors (FAST equity, 0.1-1%, 2-year monthly vest)</h3>
            <p class="small muted">Found through your network, investors and accelerator alumni. Work together for a month before granting equity. Collecting logos does not help; engaged ones give a few hours a month.</p>
            <button data-find="adv">Find candidates (2 h)</button>
            ${ir.advisorProspects.map((a) => html`<div class="card small"><b>${a.name}</b> · ${a.label} · asks ~${a.askPct}%<div class="inline"><button class="sm" data-trial="${a.id}">Trial month (1 h)</button></div></div>`)}</div>
          <div><h3>Consultants (paid, by the hour or project)</h3>
            <form id="conForm"><label>What and for whom <input name="query" placeholder="pricing consultant for B2B payroll SaaS" /></label><button>Search (30 min)</button></form>
            ${(consultResults?.listings ?? []).map((l) => html`<div class="card small"><b>${l.name}</b> · ${money(l.priceUsd)} ${l.unit}<div>${l.pitch}</div><div class="muted">${l.upfrontPct ? `${Math.round(l.upfrontPct * 100)}% up front` : 'pay as you go'} · references and a trial reveal more in Channels</div>
              <div class="inline"><input type="number" data-chours="${l.id}" value="10" min="2" max="40" style="width:70px" /> hours <button class="sm" data-hire="${l.id}">Engage</button></div></div>`)}</div>
          <div><h3>Peer founders</h3><p class="small muted">Cheap, current and honest about tools, but the loud ones are the survivors, and their context is not yours.</p>
            ${Object.entries(PEER_GROUPS).map(([k, g]) => html`<button class="sm" data-peers="${k}">${g.label}: ${money(g.perMonthUsd)}/mo</button> `)}</div>
          <div><h3>Others</h3><p class="small muted">Mentors arrive with an accelerator (office hours, very limited time). A board member comes with a priced round. Fractional executives: hire in <a href="#/people">People</a>. The AI Assistant summarises your metrics but gives generic advice with no segment experience.</p>
            <button class="sm" data-ai="1" ${srcs.some((x) => x.kind === 'ai') ? 'disabled' : ''}>Use the AI Assistant</button></div>
        </div>
      </section>`);

    on(root, 'change', '[data-access]', (e, el) => ctx.act((st) => setAccess(st, el.dataset.access, el.value)));
    on(root, 'click', '[data-follow]', (e, el) => ctx.act((st) => { const r = followAdvice(st, el.dataset.follow); toast(r.mistake ? 'Noted. We will see what it does to your numbers.' : 'Noted.', 'info'); }));
    on(root, 'click', '[data-hours]', (e, el) => ctx.act((st) => { const ev = bookOfficeHours(st, el.dataset.hours); toast(`Booked for ${fmtDate(st, ev.day)}.`, 'good'); }));
    on(root, 'click', '[data-find=adv]', () => ctx.act((st) => { findAdvisors(st, 3); }, { hours: 2, label: 'Advisor search' }));
    on(root, 'click', '[data-trial]', (e, el) => ctx.act((st) => { startAdvisorTrial(st, el.dataset.trial); }, { hours: 1, label: 'Advisor kickoff' }));
    on(root, 'click', '[data-sign]', (e, el) => { const level = root.querySelector(`[data-level="${el.dataset.sign}"]`)?.value ?? 'regular'; ctx.act((st) => { signAdvisorSource(st, el.dataset.sign, { level, cliffMonths: 0 }); toast('FAST agreement signed; shares posted to the cap table.', 'good'); }, { hours: 0.5, label: 'Advisor agreement' }); });
    on(root, 'click', '[data-end]', (e, el) => ctx.act((st) => { endAdvisorSource(st, el.dataset.end); }, { hours: 0.25, label: 'Advisor offboarding' }));
    on(root, 'submit', '#conForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { consultResults = findConsultants(st, f.query); }, { hours: 0.5, label: 'Consultant search' }); });
    on(root, 'click', '[data-hire]', (e, el) => { const hrs = Number(root.querySelector(`[data-chours="${el.dataset.hire}"]`)?.value) || 10; ctx.act((st) => { hireConsultant(st, el.dataset.hire, { hours: hrs, charge: true }); }); });
    on(root, 'click', '[data-peers]', (e, el) => ctx.act((st) => { joinPeerGroup(st, el.dataset.peers); }));
    on(root, 'click', '[data-ai]', () => ctx.act((st) => { enableAssistantSource(st); }));
    on(root, 'submit', '#askForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      if (!f.q?.trim() || !f.source) return;
      ctx.act(async (st) => { const a = await ask(st, f.source, f.q, { share: f.share, llm: ctx.llm.ask }); if (a.mock) toast('Answered offline.', 'info'); });
    });
  },
};
