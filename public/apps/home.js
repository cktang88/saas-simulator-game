// Home: the founder's dashboard: money, growth, time, goals, what to do next, and what happened.

import { html, mount, on, lineChart, stat } from '../core/ui.js';
import { money, pct, fmtDate } from '../core/util.js';
import { balance, totalCash } from '../core/bank.js';
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

// What stands out: symptoms read from the company's own numbers, each with a typical range, linking to where
// to look. It deliberately does not say what to decide: spotting the cause and choosing the fix is the
// player's job (operator tiers, ARCHITECTURE principle 7). Benchmarks are vendor/secondary ranges.
const TRIAL_TYPICAL = { card: [0.4, 0.6], noCard: [0.15, 0.25] }; // trial-to-paid, opt-out vs opt-in trials (vendor benchmarks, secondary)
const CHURN_TYPICAL = { b2c: [0.06, 0.1], smb: [0.03, 0.05], ent: [0.005, 0.015] }; // monthly logo churn (secondary)
const pctR = (x) => `${Math.round(x * 100)}%`;
const rangeR = ([a, b]) => `${pctR(a)}–${pctR(b)}`;

export function nextSteps(state) {
  const steps = [];
  const c = state.company;
  const apps = state.apps;
  const subs = state.stripe?.subscriptions ?? [];
  const realIv = (apps.research?.interviews ?? []).filter((i) => i.real && i.status === 'done').length;
  // Customers and money first: these are symptoms with a benchmark.
  const decided = subs.filter((x) => x.trialEndDay != null && x.trialEndDay <= state.day && x.trialEndDay > state.day - 90);
  if (decided.length >= 10) {
    const paid = decided.filter((x) => x.cancelReason !== 'trial_not_converted' && x.cancelReason !== 'incomplete_expired').length / decided.length;
    const typ = state.market?.cardRequired ? TRIAL_TYPICAL.card : TRIAL_TYPICAL.noCard;
    if (paid < typ[0]) steps.push([`Trial-to-paid is ${pctR(paid)} over the last 90 days (${decided.length} trials), below the ${rangeR(typ)} typical for ${state.market?.cardRequired ? 'card-required' : 'no-card'} trials.`, 'analytics']);
  }
  const active = subs.filter((x) => ['active', 'past_due'].includes(x.status)).length;
  const churned30 = subs.filter((x) => x.canceledDay != null && x.canceledDay > state.day - 30 && !['trial_not_converted', 'incomplete_expired'].includes(x.cancelReason)).length;
  if (active + churned30 >= 10) {
    const rate = churned30 / (active + churned30);
    const typ = CHURN_TYPICAL[c.model] ?? CHURN_TYPICAL.smb;
    if (rate > typ[1]) steps.push([`${churned30} of ${active + churned30} paying customers cancelled in the last 30 days (${pctR(rate)}); ${rangeR(typ)} a month is typical for this kind of business.`, 'customers']);
  }
  const daily = state.metrics?.daily ?? [];
  if (daily.length > 60) {
    const now = daily.at(-1).mrr ?? 0, then = daily.find((d) => d.day >= state.day - 60)?.mrr ?? 0;
    if (then >= 500 && now <= then * 1.02) steps.push([`MRR is ${money(now)}, about where it was two months ago (${money(then)}).`, 'analytics']);
  }
  const burn = burnRate(state);
  if (burn != null && burn < 0 && totalCash(state) / -burn < 6) steps.push([`About ${(totalCash(state) / -burn).toFixed(1)} months of cash left at the last 30 days' burn. Raises usually take 3–6 months.`, 'bank']);
  // Early-stage gaps, stated as facts rather than instructions.
  if (!c.icp) steps.push(['No written ideal customer profile yet.', 'settings']);
  if (realIv < 5) steps.push([`${realIv} real customer conversation${realIv === 1 ? '' : 's'} logged so far (AI rehearsals are practice, not evidence).`, 'research']);
  if (!(apps.product?.features?.length)) steps.push(['Nothing specced in Product yet.', 'product']);
  else if (!hasProduct(state)) steps.push([`${apps.product.features.length} feature${apps.product.features.length === 1 ? '' : 's'} specced, none shipped: there is nothing for a customer to use yet.`, 'product']);
  if (!c.website) steps.push(['No landing page: visitors have nothing to convert on.', 'website']);
  else if (!state.market?.fit.website.score) steps.push(['Your landing page has not been seen by a customer panel yet.', 'website']);
  if (!c.incorporated) steps.push(['Not incorporated: you are personally liable, and investors cannot invest.', 'legal']);
  if (c.model !== 'b2c' && !(apps.crm?.companies?.length)) steps.push(['Your CRM is empty: no real prospects tracked.', 'crm']);
  if (c.model === 'b2c' && hasProduct(state) && !activeSubs(state).length && !(apps.ads?.campaigns?.length) && !apps.organic?.launch) steps.push(['The product is live but nobody has been told about it yet.', 'organic']);
  if (c.path === 'vc' && !state.founder.linkedinText && !state.founder.linkedinFileId) steps.push(['Investors will look you up: no LinkedIn profile or bio uploaded yet.', 'fundraising']);
  return steps.slice(0, 5);
}

export default {
  id: 'home',
  title: 'Home',
  icon: '🏠',
  group: 'Home',
  render(root, ctx) {
    const s = ctx.state;
    const cash = totalCash(s);
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
          <h2 style="margin-top:14px">What stands out</h2>
          ${nextSteps(s).length ? html`<ul class="list">${nextSteps(s).map(([t, app]) => html`<li><a href="#/${app}">${t} →</a></li>`)}</ul>` : html`<p class="muted">Nothing unusual in the numbers right now. The Scorecard reads how each part of the company is run.</p>`}
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
