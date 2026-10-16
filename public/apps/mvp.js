// MVP lab: pre-product and MVP experiments. Design a test with a hypothesis and a pass/fail threshold, run it
// against an audience, read noisy results with ranges and caveats, and call it. Smoke test / fake door, concierge,
// Wizard of Oz and design partners live here; pre-sale (Sales) and the single-feature MVP (Product) are linked.
// Mechanics and tuning: apps/mvp/model.js, params.js; operator reader: apps/mvp/readers.js.

import { html, mount, on, formData, table, stat, badge } from '../core/ui.js';
import { pct, money, fmtDate } from '../core/util.js';
import { hasProduct } from '../core/market.js';
import { tierBehaviours } from '../core/operator.js';
import { adviceFor, learningMode } from '../core/advice.js';
import './mvp/readers.js';
import {
  mvpSlice, expById, runSmoke, smokeCost, sendApology, startCohort, cohortCost, deliverWeek, weekCost, finishCohort, cohortResults, activeMembers,
  partnerCandidates, syntheticCandidate, startPartners, partnerRecruitCost, holdSession, sessionCost, scheduleSessions, adoptRequest, convertPartners,
  callVerdict, verdictOf, abandonExperiment, fmtRange, buildHours, hasAnyValidation, presellCommitments, realInterviews, mvpDay, METRICS, TYPE_LABEL, MVP,
} from './mvp/model.js';

const TABS = [['', 'Learning log'], ['smoke', 'Smoke test'], ['cohort', 'Concierge / Wizard'], ['partners', 'Design partners'], ['presale', 'Pre-sale and build']];
const VERDICT_TONE = { pass: 'good', fail: 'bad', inconclusive: 'warn', unjudged: 'warn' };
const QUALITY_TONE = { high: 'good', medium: 'warn', low: 'bad' };
const draft = { picks: {} };

const optsOf = (type, sel) => Object.entries(METRICS[type]).map(([k, l]) => html`<option value="${k}" ${sel === k ? 'selected' : ''}>${l}</option>`);
function hypothesisFields(type) {
  return html`<fieldset class="panel-sub"><legend>Hypothesis and pass/fail threshold (set before you run; it cannot be edited later)</legend>
    <label>We believe <input name="hstatement" placeholder="e.g. Independent plumbers will leave a deposit for automatic invoice chasing" /></label>
    <label>Measured by <select name="hmetric">${optsOf(type)}</select></label>
    <label>Pass if the whole range is at least (%) <input name="hthreshold" type="number" step="0.1" min="0.1" max="99" placeholder="e.g. 2" /></label>
    <p class="hint">Pass: the low end of the range clears it. Fail: the high end misses it. In between is inconclusive: get more people, do not call it.</p></fieldset>`;
}
const hypOf = (d) => ({ statement: d.hstatement, metric: d.hmetric, threshold: d.hthreshold == null || d.hthreshold === '' ? null : Number(d.hthreshold) / 100 });

function resultCard(s, e) {
  const r = e.results;
  const v = verdictOf(e);
  const thr = e.hypothesis ? `${METRICS[e.type][e.hypothesis.metric]} at least ${pct(e.hypothesis.threshold, 1)}` : null;
  return html`<div class="card"><div><b>${e.name}</b> ${badge(TYPE_LABEL[e.type])} ${badge(v === 'unjudged' ? 'no threshold' : v, VERDICT_TONE[v])} ${e.calledAs ? badge(`called: ${e.calledAs}`, 'accent') : ''}</div>
    <p class="small">${thr ? html`Threshold: ${thr}.` : html`<b>No threshold was set:</b> this result cannot pass or fail.`}</p>
    ${e.type === 'smoke' ? html`<div class="stats">${stat('Visits', r.visits)}${stat('Email signups', r.signups, fmtRange(r.signupRate))}${r.paid != null ? stat('Paid-intent clicks', r.paid, fmtRange(r.paidRate)) : ''}</div>`
      : e.type === 'design_partners' ? html`<div class="stats">${stat('Partners', r.n)}${stat('Said they would buy', r.verbal)}${stat('Paid', r.paid, fmtRange(r.payRate))}${stat('Attendance', fmtRange(r.attendRate))}</div>`
      : html`<div class="stats">${stat('Customers', r.n, `${r.weeks} weeks`)}${stat('Retention', r.retention ? fmtRange(r.retention) : 'week 3+')}${r.activation ? stat('Activation', fmtRange(r.activation)) : ''}${stat('Paid', r.payRate ? fmtRange(r.payRate) : e.inputs.price ? 'week 3+' : 'free')}${r.wtp ? stat('Revealed WTP', `${money(r.wtp.median)}/mo`, `${money(r.wtp.p25)} to ${money(r.wtp.p75)}`) : ''}</div>`}
    <ul class="small">${r.caveats.map((c) => html`<li>${c}</li>`)}</ul>
    ${e.status === 'done' ? html`<div class="inline"><button data-call="${e.id}:go">Go: build on it</button><button data-call="${e.id}:iterate">Iterate: change and re-test</button><button data-call="${e.id}:kill">Kill it</button></div>
      <p class="hint">A call on too few people is a mistake that costs time later; so is going ahead after your own test failed.</p>` : ''}
    ${e.owesApology ? html`<div class="callout warn small">${r.paid} people clicked to pay on a page that was only a test. <button data-apology="${e.id}">Send an apology and first-access offer (${MVP.smoke.apologyHours}h)</button> Without it within ${MVP.smoke.apologyDays} days of the end, your reputation takes a hit.</div>` : ''}</div>`;
}

function logView(s, sl) {
  const done = sl.experiments.filter((e) => e.results);
  const running = sl.experiments.filter((e) => e.status === 'running');
  const bh = Math.round(buildHours(s));
  return html`
    <div class="stats">
      ${stat('Experiments', sl.experiments.length, `${running.length} running`)}
      ${stat('Real interviews', realInterviews(s))}
      ${stat('Pre-sale commitments', presellCommitments(s))}
      ${stat('Build hours so far', bh, hasAnyValidation(s) ? 'validation started' : bh > 0 ? 'no validation yet' : 'nothing built yet')}
      ${stat('Community standing', `${sl.reputation}/100`)}
    </div>
    ${!hasAnyValidation(s) ? html`<div class="callout small">Nothing is validated yet: no experiment, interview or pre-sale ask so far, and ${bh} build hours.</div>` : ''}
    <section class="panel"><h2>What you have learned</h2>
      ${sl.learning.length ? html`<div class="list">${sl.learning.map((l) => html`<div class="card"><div><b>${l.name}</b> ${learningMode(s) ? badge(`evidence: ${l.quality}`, QUALITY_TONE[l.quality]) : ''} ${badge(l.verdict === 'unjudged' ? 'no threshold' : l.verdict, VERDICT_TONE[l.verdict])} ${l.called ? badge(`called: ${l.called}`, 'accent') : ''}</div>
        <p>${l.text}</p><p class="small muted">${fmtDate(s, l.day)} · n=${l.n}</p>
        ${l.quality === 'low' ? adviceFor(s, 'mvp_experiments', [l.stellar], { kind: 'coaching' }).map((i) => html`<p class="small">${i.text} <span class="muted">(${i.from})</span></p>`) : ''}</div>`)}</div>` : html`<p class="empty">No results yet. A learning-log entry is written when each experiment finishes.</p>`}
    </section>
    <section class="panel"><h2>Experiments</h2>
      ${table({ columns: [{ label: 'Name', render: (e) => e.name }, { label: 'Type', render: (e) => TYPE_LABEL[e.type] }, { label: 'Status', render: (e) => e.status + (e.status === 'running' && e.endDay ? ` (ends ${fmtDate(s, e.endDay)})` : '') }, { label: 'Threshold', render: (e) => (e.hypothesis ? pct(e.hypothesis.threshold, 1) : 'none') }, { label: '', render: (e) => (e.status === 'running' ? html`<button class="sm" data-abandon="${e.id}">Stop</button>` : '') }], rows: sl.experiments.slice().reverse(), empty: 'No experiments yet.' })}
    </section>
    ${done.filter((e) => e.status !== 'running').slice(-4).reverse().map((e) => resultCard(s, e))}`;
}

function smokeView(s, sl) {
  const running = sl.experiments.filter((e) => e.type === 'smoke' && e.status === 'running');
  const finished = sl.experiments.filter((e) => e.type === 'smoke' && e.results);
  return html`
    <section class="panel"><h2>Smoke test / fake door</h2>
      <p class="small">A one-page site with a headline, an offer and one call to action, sent to a chosen audience for a week. Email opt-in pages run 5-20% and cold traffic to a waitlist 3-10% [design]; but a signup is free. A deposit button measures intent to pay. Nobody is charged: it is a fake door, so tell clickers afterwards.</p>
      <form id="smokeForm">
        <label>Headline <input name="headline" placeholder="Stop chasing unpaid invoices: automatic reminders for plumbers" /></label>
        <label>Offer (what they get, for how much) <textarea name="offer" rows="2" placeholder="Reminders by text and email, payments matched automatically. $29/month, first month free."></textarea></label>
        <label>Who is this for? (audience, as narrow as you can) <input name="audience" value="${s.company.icp ?? ''}" placeholder="independent plumbers and HVAC contractors" /></label>
        <div class="grid-2">
          <label>Traffic from <select name="source">${Object.entries(MVP.smoke.sources).map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select></label>
          <label>Ad budget if paid (USD, min ${MVP.smoke.sources.paid.minBudget}) <input name="budget" type="number" min="0" step="10" value="150" /></label>
          <label>Call to action <select name="cta"><option value="email">Join the waitlist (email)</option><option value="deposit">Reserve with a deposit (plus a notify-me fallback)</option></select></label>
          <label>Monthly price shown (USD, deposit page) <input name="price" type="number" min="1" step="1" value="29" /></label>
        </div>
        ${hypothesisFields('smoke')}
        <button class="primary">Launch the test (about 3.5-6h + budget)</button>
      </form>
    </section>
    ${running.length ? html`<section class="panel"><h2>Running</h2>${running.map((e) => html`<p>${e.name}: results land ${fmtDate(s, e.endDay)}. ${e.noCriteria ? badge('no threshold', 'bad') : ''}</p>`)}</section>` : ''}
    ${finished.slice().reverse().map((e) => resultCard(s, e))}`;
}

function cohortView(s, sl) {
  const list = sl.experiments.filter((e) => e.cohort);
  return html`
    <section class="panel"><h2>Concierge or Wizard of Oz</h2>
      <p class="small">Concierge: you deliver the outcome by hand to a few customers. It shows fast whether they stay and what they would pay, but it flatters retention (they stay for you) and does not scale. Wizard of Oz: a real-looking interface with you behind it; it adds activation but costs build hours. Charge from week ${MVP.cohort.askWeek}; stay manual no longer than about ${MVP.cohort.tooLongWeeks} weeks.</p>
      <form id="cohortForm">
        <div class="grid-2">
          <label>Type <select name="type"><option value="concierge">Concierge (by hand)</option><option value="wizard">Wizard of Oz (UI, manual backend)</option></select></label>
          <label>Customers (${MVP.cohort.minCustomers}-${MVP.cohort.maxCustomers}) <input name="n" type="number" min="${MVP.cohort.minCustomers}" max="${MVP.cohort.maxCustomers}" value="5" /></label>
          <label>Hours per customer per week <input name="hoursPerCustomer" type="number" step="0.25" min="0.25" value="1.5" /></label>
          <label>Interface build hours (Wizard only, ${MVP.cohort.wizardUiHours.join('-')}) <input name="uiHours" type="number" min="0" value="16" /></label>
          <label>Monthly price from week ${MVP.cohort.askWeek} (USD, 0 = free) <input name="price" type="number" min="0" value="29" /></label>
          <label>Find them via <select name="recruit"><option value="network">Your network</option><option value="outreach">Outreach to the audience</option><option value="community">A community post</option></select></label>
        </div>
        <label>Audience <input name="audience" value="${s.company.icp ?? ''}" placeholder="the narrow segment you want" /></label>
        ${hypothesisFields('wizard')}
        <p class="hint">Wizard of Oz metrics also include "Used it in week 1"; pick it in the hypothesis for a wizard test.</p>
        <button class="primary">Recruit and start (recruiting hours up front, then a weekly delivery cost)</button>
      </form>
    </section>
    ${list.map((e) => (e.status === 'running'
      ? html`<section class="panel"><h2>${e.name} ${badge(TYPE_LABEL[e.type])}</h2>
        <p>${activeMembers(e).length} of ${e.cohort.members.length} still active after ${e.weeks.length} week(s). Delivery costs ${weekCost(e)}h a week${e.weeks.length >= MVP.cohort.tooLongWeeks ? html` ${badge('time-box passed: decide', 'bad')}` : ''}.</p>
        <p class="small muted">${e.cohort.members.length} said yes out of ${e.cohort.asked} asked.</p>
        <div class="inline"><button class="primary" data-week="${e.id}" ${activeMembers(e).length && !(e.weeks.length && s.day - e.weeks.at(-1).day < 7) ? '' : 'disabled'}>Deliver a week (${weekCost(e)}h)</button><button data-finish="${e.id}:stop">Wrap up and read the result</button><button data-finish="${e.id}:wizard">Graduate to Wizard of Oz</button><button data-finish="${e.id}:product">Graduate to the product</button></div>
        ${e.weeks.length ? html`<div class="stats">${stat('Customers', e.cohort.members.length)}${stat('Active', activeMembers(e).length)}${stat('Retention so far', e.weeks.length >= 3 ? fmtRange(cohortResults(e).retention) : 'week 3+')}</div>` : ''}</section>`
      : e.results ? resultCard(s, e) : ''))}`;
}

function partnersView(s, sl) {
  const progs = sl.experiments.filter((e) => e.type === 'design_partners');
  const cands = partnerCandidates(s);
  return html`
    <section class="panel"><h2>Design partner program</h2>
      <p class="small">Recruit ${MVP.partners.min}-${MVP.partners.max} people you can co-build with: hold weekly sessions, collect what they ask for, and convert them to paid at the end. Friends and outsiders are generous with enthusiasm and stingy with money; a request only one partner makes is a custom project.</p>
      <form id="dpForm">
        <h3>Who to ask</h3>
        ${cands.length ? html`<div class="list small">${cands.map((c) => html`<label><input type="checkbox" name="pick" value="${c.ref}" /> ${c.name}${c.company ? ` (${c.company})` : ''} <span class="muted">${c.kind === 'crm' ? 'CRM' : 'interviewed'}</span></label>`)}</div>` : html`<p class="empty small">No CRM contacts or real interviewees yet. Add them in CRM or Research, or ask a friend or someone outside your market below.</p>`}
        <div class="inline"><button type="button" data-synth="friend">Add a friend</button><button type="button" data-synth="outsider">Add a contact outside your market</button></div>
        ${Object.values(draft.picks).length ? html`<p class="small">Added: ${Object.values(draft.picks).map((c) => c.name).join(', ')}</p>` : ''}
        <label>Audience this program is about <input name="audience" value="${s.company.icp ?? ''}" /></label>
        <label>Price you will ask at the end (USD per month) <input name="price" type="number" min="1" value="29" /></label>
        ${hypothesisFields('design_partners')}
        <button class="primary">Ask them (0.4h each)</button>
      </form>
    </section>
    ${progs.map((e) => (e.status === 'running' ? html`<section class="panel"><h2>${e.name}</h2>
      <p>${e.partners.length} joined, ${e.declined.length} declined. ${e.sessions} session round(s) so far.</p>
      <div class="inline"><button class="primary" data-session="${e.id}">Hold a session round (${sessionCost(e)}h)</button><button data-book="${e.id}">Book next week on the calendar</button><button data-convert="${e.id}">Ask them to pay ${money(e.inputs.price)}/mo and wrap up</button></div>
      <h3>Partners</h3><ul class="small">${e.partners.map((p) => html`<li>${p.name}${p.company ? `, ${p.company}` : ''} ${p.kind === 'friend' ? badge('friend') : p.kind === 'outsider' ? badge('outside your market') : ''} · ${p.attended} session(s) attended</li>`)}</ul>
      <h3>What they asked for</h3>
      ${e.feedback.length ? html`<div class="list small">${e.feedback.slice(-14).reverse().map((f) => html`<div class="card"><b>${e.partners.find((p) => p.id === f.partnerId)?.name}</b>: ${f.text} ${f.kind === 'compliment' ? badge('compliment') : f.adopted ? badge('queued in Product', 'accent') : html`<button class="sm" data-adopt="${e.id}:${f.id}">Queue in Product</button>`}</div>`)}</div>
      <p class="hint">Before you queue something, count how many partners said it, and ask whether it is a job of the segment or one account's wish.</p>` : html`<p class="empty small">No sessions yet.</p>`}</section>` : e.results ? resultCard(s, e) : ''))}`;
}

function presaleView(s, sl) {
  const n = presellCommitments(s);
  const bh = Math.round(buildHours(s));
  return html`
    <section class="panel"><h2>Pre-sale</h2>
      <p>${n} commitment(s) so far from Sales pre-sell (LOIs, deposits, pre-orders). Pre-sales live in the CRM, not here. <a href="#/crm">Open the CRM to make an offer and ask for a commitment.</a></p>
    </section>
    <section class="panel"><h2>Single-feature MVP</h2>
      <p>${hasProduct(s) ? 'You have shipped something.' : 'Nothing shipped yet.'} ${bh} build hours so far.  <a href="#/product">Open Product to queue it.</a></p>
    </section>
    ${(() => { const items = adviceFor(s, 'mvp_experiments', tierBehaviours('mvp_experiments'), { kind: 'coaching' }); return items.length ? html`<section class="panel"><h2>Advice on testing before building</h2><ul class="small">${items.map((i) => html`<li>${i.text} <span class="muted">(${i.from})</span></li>`)}</ul></section>` : ''; })()}`;
}

export default {
  id: 'mvp',
  title: 'MVP lab',
  icon: '🧪',
  group: 'Product',
  badge: (state) => mvpSlice(state).experiments.filter((e) => e.status === 'done').length || null,
  onDay(state) { mvpDay(state); },
  render(root, ctx) {
    const s = ctx.state;
    const sl = mvpSlice(s);
    const tab = ctx.params || '';
    const views = { '': logView, smoke: smokeView, cohort: cohortView, partners: partnersView, presale: presaleView };
    const view = views[tab] ?? logView;
    mount(root, html`
      <div class="app-head"><div><h1>MVP lab</h1><p>Test before you build. Every experiment has a hypothesis and a pass/fail threshold, costs founder hours, and returns noisy results with ranges. Email signups are not payments; compliments are not demand.</p></div></div>
      <div class="tabs">${TABS.map(([k, l]) => html`<a href="#/mvp${k ? '/' + k : ''}" class="${tab === k ? 'active' : ''}">${l}</a>`)}</div>
      ${view(s, sl)}`);
    const act = (fn, hours, label) => ctx.act(fn, { hours, label });

    on(root, 'submit', '#smokeForm', (e, f) => {
      e.preventDefault();
      const d = formData(f);
      const spec = { ...d, hypothesis: hypOf(d) };
      act(() => runSmoke(s, spec), smokeCost(spec).hours, 'MVP lab: smoke test');
    });
    on(root, 'submit', '#cohortForm', (e, f) => {
      e.preventDefault();
      const d = formData(f);
      const spec = { ...d, hypothesis: hypOf(d) };
      const hyp = spec.hypothesis;
      if (d.type === 'concierge' && hyp.metric === 'activation') spec.hypothesis = { ...hyp, metric: 'retention' };
      act(() => startCohort(s, spec), cohortCost(spec).hours, `MVP lab: ${d.type}`);
    });
    on(root, 'click', '[data-week]', (e, el) => { const x = expById(s, el.dataset.week); act(() => deliverWeek(s, x.id), weekCost(x), 'MVP lab: deliver a week by hand'); });
    on(root, 'click', '[data-finish]', (e, el) => { const [id, to] = el.dataset.finish.split(':'); act(() => finishCohort(s, id, { graduateTo: to }), 0.5, 'MVP lab: read the result'); });
    on(root, 'click', '[data-call]', (e, el) => { const [id, dec] = el.dataset.call.split(':'); act(() => callVerdict(s, id, dec), 0.25, 'MVP lab: call the result'); });
    on(root, 'click', '[data-apology]', (e, el) => act(() => sendApology(s, el.dataset.apology), MVP.smoke.apologyHours, 'MVP lab: fake-door apology'));
    on(root, 'click', '[data-abandon]', (e, el) => act(() => abandonExperiment(s, el.dataset.abandon), 0, 'MVP lab: stop'));
    on(root, 'click', '[data-synth]', (e, el) => { const c = syntheticCandidate(s, el.dataset.synth); draft.picks[c.ref] = c; ctx.render(); });
    on(root, 'submit', '#dpForm', (e, f) => {
      e.preventDefault();
      const d = formData(f);
      const picked = [...f.querySelectorAll('input[name=pick]:checked')].map((i) => i.value);
      const cands = [...partnerCandidates(s).filter((c) => picked.includes(c.ref)), ...Object.values(draft.picks)];
      act(() => { const x = startPartners(s, { ...d, candidates: cands, hypothesis: hypOf(d) }); draft.picks = {}; return x; }, partnerRecruitCost(cands.length), 'MVP lab: recruit design partners');
    });
    on(root, 'click', '[data-session]', (e, el) => { const x = expById(s, el.dataset.session); act(() => holdSession(s, x.id), sessionCost(x), 'MVP lab: design partner sessions'); });
    on(root, 'click', '[data-book]', (e, el) => act(() => scheduleSessions(s, el.dataset.book), 0, 'MVP lab: book sessions'));
    on(root, 'click', '[data-adopt]', (e, el) => { const [id, fb] = el.dataset.adopt.split(':'); act(() => adoptRequest(s, id, fb), 0.5, 'MVP lab: queue a partner request'); });
    on(root, 'click', '[data-convert]', (e, el) => act(() => convertPartners(s, el.dataset.convert), 1, 'MVP lab: ask partners to pay'));
  },
};
