// Home: the founder's dashboard: money, growth, time, goals, what to do next, and what happened.

import { html, mount, on, lineChart, stat } from '../core/ui.js';
import { money, pct, fmtDate } from '../core/util.js';
import { balance } from '../core/bank.js';
import { mrr, activeSubs, trialingSubs } from '../core/stripe.js';
import { hasProduct } from '../core/market.js';
import { hoursLeft, PATHS } from '../core/state.js';

function burnRate(state) {
  const d = state.metrics.daily;
  if (d.length < 2) return null;
  const back = d[Math.max(0, d.length - 31)];
  const days = d.at(-1).day - back.day;
  if (!days) return null;
  // Net change in bank cash, ignoring equity raises and owner contributions, over ~30 days.
  const inflowsFromEquity = state.bank.txns.filter((t) => t.day > back.day && ['investment', 'owner_contribution', 'loan'].includes(t.category)).reduce((a, t) => a + t.amount, 0);
  return ((d.at(-1).cash - back.cash - inflowsFromEquity) / days) * 30;
}

function nextSteps(state) {
  const steps = [];
  const c = state.company;
  const apps = state.apps;
  if (!c.icp) steps.push(['Write a specific ideal customer profile', 'settings']);
  if ((apps.research?.interviews ?? []).filter((i) => i.real).length < 5) steps.push(['Talk to real customers (aim for 20–30 interviews before betting big; AI rehearsals don\'t count)', 'research']);
  if (!(apps.product?.features?.length)) steps.push(['Spec your first features: specific problems, specific users', 'product']);
  else if (!hasProduct(state)) steps.push(['Ship your MVP: build the specced features', 'product']);
  if (!c.website) steps.push(['Put up a landing page (fetch your URL or upload HTML)', 'website']);
  else if (!state.market?.fit.website.score) steps.push(['Have the customer panel review your landing page', 'website']);
  if (!c.incorporated) steps.push(['Incorporate and set up founder paperwork', 'legal']);
  if (c.model !== 'b2c' && !(apps.crm?.companies?.length)) steps.push(['Add real prospects to your CRM (manually or CSV)', 'crm']);
  if (c.model === 'b2c' && hasProduct(state) && !(apps.ads?.campaigns?.length)) steps.push(['Launch to your network, then test a small paid campaign', 'organic']);
  if (c.path === 'vc' && !state.founder.linkedinText && !state.founder.linkedinFileId) steps.push(['Upload your LinkedIn profile and bio for investors', 'fundraising']);
  return steps.slice(0, 5);
}

export default {
  id: 'home',
  title: 'Home',
  icon: '🏠',
  group: 'Home',
  render(root, ctx) {
    const s = ctx.state;
    const cash = balance(s);
    const m = mrr(s);
    const burn = burnRate(s);
    const runway = burn != null && burn < 0 ? cash / -burn : null;
    const d = s.metrics.daily.slice(-180);
    const unread = s.notifications.filter((n) => !n.read).slice(0, 8);
    mount(root, html`
      <div class="app-head"><div><h1>${s.company.name}</h1><p>${s.company.oneLiner || 'No one-liner yet.'}</p></div>
        <div class="app-actions"><span class="badge accent">${PATHS[s.company.path].label}</span></div></div>
      <div class="stats">
        ${stat('Cash in bank', money(cash), burn == null ? '' : `${burn >= 0 ? '+' : ''}${money(burn)}/mo net`, cash < 0 ? 'bad' : '')}
        ${stat('Runway', runway == null ? (burn == null ? '—' : 'Cash-flow positive') : `${runway.toFixed(1)} mo`, 'at last 30 days\' burn', runway != null && runway < 6 ? 'bad' : runway != null && runway < 12 ? 'warn' : '')}
        ${stat('MRR', money(m), `${money(m * 12)} ARR`)}
        ${stat('Paying customers', activeSubs(s).length, `${trialingSubs(s).length} in trial`)}
        ${stat('Founder hours left', `${hoursLeft(s).toFixed(1)}h`, `of ${s.founder.hoursPerWeek}h this week · energy ${Math.round(s.founder.energy)}`, s.founder.energy < 40 ? 'warn' : '')}
      </div>
      <div class="grid-2">
        <section class="panel"><h2>Cash</h2><canvas id="cashChart"></canvas></section>
        <section class="panel"><h2>MRR</h2><canvas id="mrrChart"></canvas></section>
      </div>
      <div class="grid-2">
        <section class="panel">
          <h2>Goal</h2><p>${PATHS[s.company.path].goal}</p>
          <h2 style="margin-top:14px">Next steps</h2>
          ${nextSteps(s).length ? html`<ul class="list">${nextSteps(s).map(([t, app]) => html`<li><a href="#/${app}">${t} →</a></li>`)}</ul>` : html`<p class="muted">Keep going: watch churn, talk to customers, protect your runway.</p>`}
        </section>
        <section class="panel">
          <h2>Notifications ${unread.length ? html`<button class="sm" id="markRead">Mark all read</button>` : ''}</h2>
          ${unread.length ? html`<ul class="list">${unread.map((n) => html`<li class="${n.type === 'bad' ? 'neg' : n.type === 'good' ? 'pos' : ''}"><span class="small muted">${fmtDate(s, n.day)}</span> ${n.app ? html`<a href="#/${n.app}">${n.text}</a>` : n.text}</li>`)}</ul>` : html`<p class="muted">You're caught up.</p>`}
          <h2 style="margin-top:14px">Recent activity</h2>
          <ul class="list small">${s.log.slice(-10).reverse().map((l) => html`<li><span class="muted">${fmtDate(s, l.day)}</span> ${l.text}</li>`)}</ul>
        </section>
      </div>`);
    const labels = d.length ? [fmtDate(s, d[0].day), fmtDate(s, d.at(-1).day)] : null;
    lineChart(root.querySelector('#cashChart'), [{ values: d.map((x) => x.cash), color: '--cash' }], { labels });
    lineChart(root.querySelector('#mrrChart'), [{ values: d.map((x) => x.mrr), color: '--accent' }], { labels });
    on(root, 'click', '#markRead', () => ctx.act((st) => st.notifications.forEach((n) => (n.read = true))));
  },
};
