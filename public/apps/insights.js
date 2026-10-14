// Product analytics (PostHog/Amplitude-style) + ops: activation funnel, feature adoption, retention by
// activation, an event explorer and funnel builder; uptime and incidents, status page, cost per user,
// card-testing attacks, leaked keys, surprise bills and breach-notification duties.
//
// Numbers: public/data/world.js PRODUCT_ANALYTICS / OPS (docs/research/world-ops-support-life.md §3). Rates
// tagged [design] there are game estimates; the UI labels benchmarks with their source.

import { html, mount, on, formData, toast, lineChart, barChart } from '../core/ui.js';
import { ensure, notify } from '../core/state.js';
import { post, addRecurring } from '../core/bank.js';
import { activeSubs, trialingSubs, ensureStripe } from '../core/stripe.js';
import { ensureMarket, setModifier, shippedFeatures, hasProduct } from '../core/market.js';
import { scheduleEvent } from '../core/calendar.js';
import { OPS } from '../data/world.js';
import { rng, poisson, chance, stochRound, uid, fmtDate, pct, money, round2, lerp, monthKey } from '../core/util.js';
import { productSlice, customersSlice } from './product/store.js';
import { openBugHours } from './product/build.js';
import { activationRate, AHA_SHARE, SESSIONS_PER_ACCOUNT_WEEK, featureAdoption, splitRetention, cohortCurve, SECURITY_TOGGLES, opsRates, drawIncident, drawCardTesting, uptimePct } from './insights/model.js';

const BREACH = { dueDays: 3, hours: 4, lawyer: 10000, churn: 1.3, missedChurn: 1.5, landing: 0.85, days: 60 }; // [design] (GDPR 72 h; lawyer $5–25k)
const INCIDENT_CHURN_PER_SEVERITY = 0.06; // [design] churn bump from a visible incident, decays ~3%/day
const FORGIVE = { chance: 0.6, share: [0.3, 1] }; // [design] providers often forgive a one-time surprise bill on request

export const ensureInsights = (state) => {
  const s = ensure(state, 'insights', () => ({}));
  s.daily ??= []; s.flags ??= {}; s.incidents ??= []; s.tasks ??= []; s.security ??= []; s.costs ??= []; s.mods ??= { incident: 1 };
  return s;
};

function chargeFounder(state, hours, label) {
  const f = state.founder;
  const h = round2(Math.min(hours, Math.max(0, f.hoursPerWeek - f.hoursUsed)));
  if (h <= 0) return 0;
  f.hoursUsed += h;
  f.timeLog ??= [];
  f.timeLog.push({ day: state.day, hours: h, label });
  return h;
}

const aiShipped = (state) => shippedFeatures(state).some((f) => f.ai?.enabled);
const selfServe = (state) => state.company.model !== 'ent' || state.plans.some((p) => p.active && p.trialDays > 0);
const monthlyInfra = (state) => state.recurring.filter((r) => r.active && r.category === 'hosting').reduce((a, r) => a + r.amount, 0);

function analyticsDay(state, ins) {
  const m = ensureMarket(state);
  const st = ensureStripe(state);
  const signups = st.subscriptions.filter((x) => x.startDay === state.day).length;
  const a = activationRate({ fit: m.fit.product.score, onboarding: m.onboarding });
  const activated = Math.min(signups, stochRound(state, signups * a * lerp(0.85, 1.15, rng(state))));
  const aha = stochRound(state, activated * AHA_SHARE);
  const ev = st.events.filter((e) => e.day === state.day);
  const accounts = activeSubs(state).length + trialingSubs(state).length;
  const fit = m.fit.product.score ?? 0.3;
  const sessions = poisson(state, (accounts * SESSIONS_PER_ACCOUNT_WEEK[state.company.model] / 7) * (0.6 + 0.8 * fit));
  const tickets = state.apps.support?.daily?.at(-1)?.day === state.day ? state.apps.support.daily.at(-1).new : 0;
  ins.daily.push({ day: state.day, signups, activated, aha, paid: ev.filter((e) => e.type === 'new').length, churned: ev.filter((e) => e.type === 'churn').length, sessions, accounts, tickets, activationRate: a });
  if (ins.daily.length > 400) ins.daily.shift();
}

function incident(state, ins, kind) {
  const inc = { id: uid('inc'), day: state.day, ...drawIncident(() => rng(state), kind, { paging: ins.flags.paging }) };
  ins.incidents.unshift(inc);
  ins.lastOutageDay = state.day; // read by the Market app (recentOutage flag)
  if (ins.incidents.length > 100) ins.incidents.length = 100;
  const prev = ins.today?.day === state.day ? ins.today : null;
  ins.today = { day: state.day, id: inc.id, severity: Math.max(inc.severity, prev?.severity ?? 0), cause: inc.cause, statusPosted: prev?.statusPosted ?? false };
  ins.mods.incident = Math.max(ins.mods.incident, 1 + INCIDENT_CHURN_PER_SEVERITY * inc.severity);
  if (kind === 'own') {
    const h = chargeFounder(state, inc.founderHours, inc.overnight ? 'Incident (overnight)' : 'Incident response');
    inc.charged = h;
    if (inc.overnight && !ins.flags.paging) state.founder.energy = Math.max(0, state.founder.energy - 5);
  } else inc.charged = chargeFounder(state, inc.founderHours, 'Upstream outage: customer comms');
  notify(state, `${inc.major ? 'Major incident' : 'Incident'}: ${inc.cause}, ${inc.minutes} min of downtime${inc.overnight ? ` (started at ${inc.startHour}:00, ${ins.flags.paging ? 'paged' : 'noticed in the morning'})` : ''}. ${ins.flags.statusPage ? 'Post a status update.' : 'Customers will flood support without an update.'}`, { type: 'bad', app: 'insights' });
}

function securityDay(state, ins, rates) {
  if (chance(state, rates.cardTesting / 365)) {
    const a = drawCardTesting(() => rng(state));
    post(state, { amount: -(a.cost + a.disputes * OPS.cardTesting.disputeFeeUSD), counterparty: 'Stripe', description: `Radar screening, auth & dispute fees: card-testing attack (${a.attempts.toLocaleString('en-US')} attempts)`, category: 'payment_fees', method: 'stripe' });
    chargeFounder(state, a.hours, 'Card-testing attack cleanup');
    ins.security.unshift({ id: uid('sec'), day: state.day, type: 'card_testing', text: `${a.attempts.toLocaleString('en-US')} card-testing attempts on checkout; ${money(a.cost)} in fees, ${a.disputes} disputes.` });
    notify(state, `Card-testing attack on your checkout: ${a.attempts.toLocaleString('en-US')} attempts, ${money(a.cost)} in fees. ${ins.flags.captcha ? '' : 'Add CAPTCHA, rate limits and Radar rules.'}`, { type: 'bad', app: 'insights' });
  }
  if (chance(state, rates.leakedKey / 365)) {
    const cost = Math.round(100 * Math.pow(200, rng(state)) * (aiShipped(state) ? 1 : 0.3));
    post(state, { amount: -cost, counterparty: aiShipped(state) ? 'Anthropic API' : 'Cloud provider', description: 'Abuse of a leaked API key (1–3 days)', category: aiShipped(state) ? 'ai_inference' : 'hosting', method: 'card' });
    chargeFounder(state, 3, 'Rotate leaked keys');
    ins.security.unshift({ id: uid('sec'), day: state.day, type: 'leaked_key', text: `An API key leaked (repo or client bundle) and was abused: ${money(cost)}. Keys rotated.` });
    notify(state, `A leaked API key was abused for ${money(cost)} before you rotated it. ${ins.flags.secretScanning ? '' : 'Turn on secret scanning.'}`, { type: 'bad', app: 'insights' });
  }
  if (chance(state, rates.surpriseBill / 365)) {
    const infra = monthlyInfra(state) + (productSlice(state).inferenceMonth ?? 0);
    const [m0, m1] = OPS.costs.surpriseBillMult;
    const amount = Math.round(Math.max(200, infra * (m0 + (m1 - m0) * Math.pow(rng(state), 2))));
    post(state, { amount: -amount, counterparty: 'Cloud provider', description: 'Usage overage (runaway job / traffic spike)', category: 'hosting', method: 'card' });
    ins.tasks.unshift({ id: uid('task'), type: 'forgiveness', day: state.day, amount, status: 'open', text: `Surprise cloud bill of ${money(amount)}. Ask the provider for one-time forgiveness.` });
    notify(state, `Surprise cloud bill: ${money(amount)}. ${ins.flags.spendCaps ? '' : 'No spend caps or alerts were set.'}`, { type: 'bad', app: 'insights' });
  }
  if (chance(state, rates.breach / 365)) {
    const t = { id: uid('task'), type: 'breach', day: state.day, dueDay: state.day + BREACH.dueDays, status: 'open', text: 'Material security breach: notify the regulator within 72 h (GDPR), affected customers per your DPAs (24–72 h) and US residents per state law (typically 30–60 days).' };
    ins.tasks.unshift(t);
    try { scheduleEvent(state, { title: 'Breach notification deadline (72 h)', kind: 'deadline', app: 'insights', refId: t.id, day: t.dueDay, start: 17 * 60, duration: 0 }); } catch {}
    ins.mods.breach = { churn: BREACH.churn, landing: BREACH.landing, until: state.day + BREACH.days };
    notify(state, 'Security breach: an attacker accessed customer data. You have 72 hours to notify. Open Product analytics → Ops.', { type: 'bad', app: 'insights' });
  }
  if (chance(state, rates.dataLoss / 365)) {
    chargeFounder(state, 8, 'Data restore');
    ins.mods.incident = Math.max(ins.mods.incident, 1.15);
    ins.security.unshift({ id: uid('sec'), day: state.day, type: 'data_loss', text: 'A bad migration corrupted data and the untested backup was incomplete. 8 hours restoring by hand.' });
    notify(state, 'Data loss: your backup restore failed partway. Customers lost recent work.', { type: 'bad', app: 'insights' });
  }
  for (const t of ins.tasks) {
    if (t.type === 'breach' && t.status === 'open' && state.day > t.dueDay) {
      t.status = 'missed';
      ins.mods.breach = { churn: BREACH.missedChurn, landing: BREACH.landing * 0.9, until: state.day + BREACH.days };
      post(state, { amount: -15000, counterparty: 'Outside counsel', description: 'Late breach notification: regulator inquiry response', category: 'legal', method: 'wire' });
      notify(state, 'You missed the 72-hour breach notification window. A regulator inquiry and angry customers follow.', { type: 'bad', app: 'insights' });
    }
  }
}

function opsDay(state, ins) {
  if (!hasProduct(state)) return;
  const rates = opsRates({ flags: ins.flags, bugHours: openBugHours(productSlice(state)), ai: aiShipped(state), selfServeCheckout: selfServe(state), launched: true });
  for (let i = poisson(state, rates.incident / 365); i > 0; i--) incident(state, ins, 'own');
  for (let i = poisson(state, rates.upstream / 365); i > 0; i--) incident(state, ins, 'upstream');
  for (let i = poisson(state, rates.llm / 365); i > 0; i--) incident(state, ins, 'llm');
  securityDay(state, ins, rates);
  // Modifiers decay back to normal.
  ins.mods.incident = Math.max(1, 1 + (ins.mods.incident - 1) * 0.97);
  ensureMarket(state);
  setModifier(state, 'churn', 'incidents', ins.mods.incident > 1.005 ? round2(ins.mods.incident) : 1);
  const b = ins.mods.breach;
  const active = b && state.day <= b.until;
  setModifier(state, 'churn', 'breach', active ? b.churn : 1);
  setModifier(state, 'landing', 'breach', active ? b.landing : 1);
}

// ---- UI state ----
const ui = { range: 30, event: 'signups', steps: ['signups', 'activated', 'aha', 'paid'] };
const EVENTS = { signups: 'Signed up / trial started', activated: 'Activated', aha: 'Reached aha', paid: 'Converted to paid', churned: 'Churned', sessions: 'Session started', tickets: 'Support ticket created' };

const sumRange = (ins, day, range, key) => ins.daily.filter((d) => d.day > day - range).reduce((a, d) => a + (d[key] ?? 0), 0);

function funnelView(s, ins) {
  const steps = ['signups', 'activated', 'aha', 'paid'].map((k) => [k, sumRange(ins, s.day, ui.range, k)]);
  const top = steps[0][1] || 1;
  const m = ensureMarket(s);
  const a = activationRate({ fit: m.fit.product.score, onboarding: m.onboarding });
  return html`<section class="panel"><h2>Activation funnel <span class="small muted">last ${ui.range} days</span></h2>
    <div style="display:grid;gap:8px">${steps.map(([k, n], i) => html`<div style="display:grid;grid-template-columns:minmax(90px,140px) 1fr 70px;gap:8px;align-items:center"><span class="small">${EVENTS[k]}</span><div class="meter" style="height:14px"><div style="width:${(n / top) * 100}%"></div></div><span class="small r">${n}${i ? ` · ${pct(n / Math.max(1, steps[i - 1][1]), 0)}` : ''}</span></div>`)}</div>
    <p class="small muted" style="margin-top:8px">Modeled activation for new signups now: ${pct(a, 0)} (benchmark: B2B SaaS average 37.5%, AI/ML tools ~55%, fintech ~5%; Userpilot, vendor data). Drivers: product fit from your <a href="#/customers">trial panel</a> (${m.fit.product.score != null ? Math.round(m.fit.product.score * 100) : 'not judged'}), onboarding (${m.onboarding}), time-to-value (benchmark 1 day 12 h). "Paid" counts real Stripe conversions.</p></section>`;
}

function featuresView(s, ins) {
  const feats = shippedFeatures(s).slice().sort((a, b) => a.shippedDay - b.shippedDay);
  const panel = customersSlice(s).panels[0];
  const usefulOf = (f) => { const v = panel?.agg.perFeature?.[f.title]; if (!v) return 0.4; const t = v.useful + v.meh + v.irrelevant; return t ? (v.useful + 0.4 * v.meh) / t : 0.4; };
  const subs = ensureStripe(s).subscriptions.filter((x) => x.status !== 'trialing' && x.startDay > s.day - 200);
  const curve = cohortCurve(subs, s.day);
  const recent = ins.daily.slice(-60);
  const aShare = recent.reduce((a, d) => a + d.activated, 0) / Math.max(1, recent.reduce((a, d) => a + d.signups, 0)) || 0.375;
  const split = curve.some((x) => x != null) ? splitRetention(curve.map((x) => x ?? NaN), aShare) : [];
  return html`<div class="grid-2">
    <section class="panel"><h2>Feature adoption <span class="small muted">share of active accounts</span></h2>
      ${feats.length ? html`<div style="display:grid;gap:8px">${feats.map((f, i) => { const ad = featureAdoption({ daysLive: s.day - f.shippedDay, usefulShare: usefulOf(f), core: i === 0 }); return html`<div style="display:grid;grid-template-columns:minmax(90px,1fr) 2fr 44px;gap:8px;align-items:center"><span class="small">${f.title}</span><div class="meter"><div style="width:${ad * 100}%"></div></div><span class="small">${pct(ad, 0)}</span></div>`; })}</div>
        <p class="small muted">Typical: a new feature reaches 10–30% of active accounts within 90 days unless it's on the core path; ~80% of features are rarely or never used (Pendo 2019). Usefulness comes from your latest trial panel.</p>` : html`<p class="empty">Nothing shipped.</p>`}
    </section>
    <section class="panel"><h2>Retention by activation <span class="small muted">weekly cohorts of paying accounts</span></h2>
      ${split.length && split.filter((x) => Number.isFinite(x.all)).length > 2 ? html`<canvas id="retChart" style="width:100%"></canvas><p class="small"><span style="color:var(--good)">■</span> activated · <span style="color:var(--bad)">■</span> not activated · <span style="color:var(--accent)">■</span> all</p>
        <p class="small muted">The overall curve is your real Stripe data; the split uses the benchmark that activated accounts retain 2–3× better by month 3 (game assumption from Amplitude/Userpilot data).</p>` : html`<p class="empty">Needs a few weeks of paying cohorts.</p>`}
    </section></div>`;
}

function explorerView(s, ins) {
  const opts = (sel) => Object.entries(EVENTS).map(([k, l]) => html`<option value="${k}" ${sel === k ? 'selected' : ''}>${l}</option>`);
  const counts = ui.steps.map((k) => sumRange(ins, s.day, ui.range, k));
  return html`<div class="grid-2">
    <section class="panel"><h2>Event explorer</h2>
      <form id="evForm" class="inline"><label>Event <select name="event">${opts(ui.event)}</select></label><label>Range <select name="range">${[7, 30, 90, 180].map((r) => html`<option value="${r}" ${ui.range === r ? 'selected' : ''}>${r} days</option>`)}</select></label><button>Show</button></form>
      <canvas id="evChart" style="width:100%"></canvas>
      <p class="small muted">Total: ${sumRange(ins, s.day, ui.range, ui.event)} in ${ui.range} days.</p>
    </section>
    <section class="panel"><h2>Funnel builder</h2>
      <form id="fnForm">${ui.steps.map((k, i) => html`<label>Step ${i + 1} <select name="s${i}"><option value="">—</option>${opts(k)}</select></label>`)}<button>Build funnel</button></form>
      <ul class="list small">${ui.steps.map((k, i) => html`<li>${i + 1}. ${EVENTS[k]}: <b>${counts[i]}</b>${i ? ` (${pct(counts[i] / Math.max(1, counts[i - 1]), 1)} of previous)` : ''}</li>`)}</ul>
      <p class="small muted">Aggregate funnel over the range (not per-user ordering).</p>
    </section></div>`;
}

function opsView(s, ins) {
  const down = ins.incidents.filter((i) => i.day > s.day - 30).reduce((a, i) => a + i.minutes, 0);
  const up = uptimePct(down);
  const rates = opsRates({ flags: ins.flags, bugHours: openBugHours(productSlice(s)), ai: aiShipped(s), selfServeCheckout: selfServe(s), launched: hasProduct(s) });
  const today = ins.today?.day === s.day ? ins.today : null;
  const accounts = activeSubs(s).length + trialingSubs(s).length;
  const lastCost = ins.costs.at(-1);
  return html`
    <div class="stats">
      <div class="stat ${up < 0.999 ? 'warn' : 'good'}"><div class="stat-label">Uptime (30d)</div><div class="stat-value">${(up * 100).toFixed(2)}%</div><div class="stat-sub">99.9% allows 43 min / 30 days</div></div>
      <div class="stat"><div class="stat-label">Incidents (90d)</div><div class="stat-value">${ins.incidents.filter((i) => i.day > s.day - 90).length}</div><div class="stat-sub">expected ~${rates.incident.toFixed(0)}/yr own + ${(rates.upstream + rates.llm).toFixed(0)} upstream</div></div>
      <div class="stat"><div class="stat-label">Cost per account</div><div class="stat-value">${lastCost && lastCost.accounts ? money((lastCost.infra + lastCost.ai) / lastCost.accounts, { cents: true }) : '—'}</div><div class="stat-sub">hosting + AI inference, last month</div></div>
    </div>
    ${today ? html`<div class="callout bad"><b>Incident today:</b> ${today.cause}. ${today.statusPosted ? 'Status update posted.' : html`<button class="sm primary" id="postStatus">${ins.flags.statusPage ? 'Post status page update (15 min)' : 'Email all customers an update (30 min)'}</button> Updates cut support volume (×0.6 vs silence) and halve the churn bump.`}</div>` : ''}
    ${ins.tasks.filter((t) => t.status === 'open').map((t) => html`<div class="callout ${t.type === 'breach' ? 'bad' : 'warn'}"><b>${t.type === 'breach' ? `Breach notification due ${fmtDate(s, t.dueDay)}` : 'Open task'}:</b> ${t.text}
      ${t.type === 'breach' ? html`<div><button class="sm primary" data-task="${t.id}">Send notifications with counsel (${BREACH.hours} h + ~${money(BREACH.lawyer)})</button></div>` : html`<div><button class="sm" data-task="${t.id}">Ask for forgiveness (30 min)</button></div>`}</div>`)}
    <div class="grid-2">
      <section class="panel"><h2>Reliability & security setup</h2>
        ${Object.entries(SECURITY_TOGGLES).map(([k, t]) => html`<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border)"><div><b class="small">${t.label}</b><div class="small muted">${t.note}${t.monthly ? ` ~$${t.monthly}/mo.` : ''}</div></div>${ins.flags[k] ? html`<span class="badge good">on</span>` : html`<button class="sm" data-flag="${k}">Set up (${t.hours} h)</button>`}</div>`)}
        <p class="small muted">Expected per year now: card-testing ${rates.cardTesting.toFixed(2)}, leaked key ${rates.leakedKey.toFixed(2)}, surprise bill ${rates.surpriseBill.toFixed(2)}, breach ${rates.breach.toFixed(3)} (game estimates from GitGuardian, Verizon DBIR, Stripe data).</p>
      </section>
      <section class="panel"><h2>Incident log</h2>
        ${ins.incidents.length ? html`<ul class="list small">${ins.incidents.slice(0, 15).map((i) => html`<li><span class="badge ${i.major ? 'bad' : 'warn'}">${i.kind}</span> ${fmtDate(s, i.day)} ${i.startHour}:00 · ${i.cause} · ${i.minutes} min${i.overnight ? ' · overnight' : ''} · you: ${i.charged ?? 0}h</li>`)}</ul>` : html`<p class="empty">No incidents yet.</p>`}
        ${ins.security.length ? html`<h3>Security & billing events</h3><ul class="list small">${ins.security.slice(0, 10).map((e) => html`<li>${fmtDate(s, e.day)}: ${e.text}</li>`)}</ul>` : ''}
        <p class="small muted">Solo founder MTTR: 20–90 min when awake and alerted, 4–10 h overnight with no paging. ${accounts} active/trialing accounts exposed.</p>
      </section>
    </div>`;
}

export default {
  id: 'insights',
  title: 'Product analytics',
  icon: '📈',
  group: 'Product',
  badge: (state) => (state.apps.insights?.tasks ?? []).filter((t) => t.status === 'open').length || null,

  render(root, ctx) {
    const s = ctx.state;
    const ins = ensureInsights(s);
    const tab = ['funnel', 'features', 'explorer', 'ops'].includes(ctx.params) ? ctx.params : 'funnel';
    const tabs = [['funnel', 'Funnel'], ['features', 'Adoption & retention'], ['explorer', 'Explorer'], ['ops', 'Ops & security']];
    mount(root, html`
      <div class="app-head"><div><h1>Product analytics</h1><p>Who activates, which features get used, who sticks, and whether the thing stays up. Activation is the leading indicator; revenue is the lagging one.</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => html`<a href="#/insights/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${tab === 'features' ? featuresView(s, ins) : tab === 'explorer' ? explorerView(s, ins) : tab === 'ops' ? opsView(s, ins) : html`${funnelView(s, ins)}<section class="panel"><h2>Daily signups and sessions</h2><canvas id="dailyChart" style="width:100%"></canvas></section>`}`);

    const days = ins.daily.filter((d) => d.day > s.day - ui.range);
    const dc = root.querySelector('#dailyChart');
    if (dc && days.length > 1) lineChart(dc, [{ values: days.map((d) => d.sessions), color: '--muted' }, { values: days.map((d) => d.signups), color: '--accent' }], { format: (v) => String(Math.round(v)) });
    const ec = root.querySelector('#evChart');
    if (ec && days.length) barChart(ec, days.map((d) => d[ui.event] ?? 0), { format: (v) => String(Math.round(v)) });
    const rc = root.querySelector('#retChart');
    if (rc) {
      const subs = ensureStripe(s).subscriptions.filter((x) => x.status !== 'trialing' && x.startDay > s.day - 200);
      const recent = ins.daily.slice(-60);
      const aShare = recent.reduce((a, d) => a + d.activated, 0) / Math.max(1, recent.reduce((a, d) => a + d.signups, 0)) || 0.375;
      const split = splitRetention(cohortCurve(subs, s.day).map((x) => x ?? NaN), aShare).filter((x) => Number.isFinite(x.all));
      lineChart(rc, [{ values: split.map((x) => x.activated), color: '--good' }, { values: split.map((x) => x.notActivated), color: '--bad' }, { values: split.map((x) => x.all), color: '--accent' }], { format: (v) => pct(v, 0), labels: split.map((x) => `w${x.w}`) });
    }

    on(root, 'submit', '#evForm', (e) => { e.preventDefault(); const f = formData(e.target); ui.event = f.event; ui.range = Number(f.range); ctx.render(); });
    on(root, 'submit', '#fnForm', (e) => { e.preventDefault(); const f = formData(e.target); const st = [f.s0, f.s1, f.s2, f.s3].filter(Boolean); if (st.length >= 2) { ui.steps = st; ctx.render(); } else toast('Pick at least two steps.', 'warn'); });
    on(root, 'click', '[data-flag]', (e, el) => {
      const k = el.dataset.flag;
      ctx.act((st) => {
        ensureInsights(st).flags[k] = true;
        const t = SECURITY_TOGGLES[k];
        if (t.monthly) addRecurring(st, { vendor: 'Uptime monitoring', amount: t.monthly, category: 'software', dayOfMonth: 10, note: 'Monitoring + phone alerts' });
      }, { hours: SECURITY_TOGGLES[k].hours, label: SECURITY_TOGGLES[k].label });
    });
    on(root, 'click', '#postStatus', () => ctx.act((st) => {
      const i = ensureInsights(st);
      i.today.statusPosted = true;
      i.mods.incident = 1 + (i.mods.incident - 1) / 2;
    }, { hours: ins.flags.statusPage ? 0.25 : 0.5, label: 'Incident status update' }));
    on(root, 'click', '[data-task]', (e, el) => {
      const t = ins.tasks.find((x) => x.id === el.dataset.task);
      if (!t) return;
      if (t.type === 'breach') ctx.act((st) => {
        t.status = 'done';
        post(st, { amount: -BREACH.lawyer, counterparty: 'Outside counsel', description: 'Breach response: notifications to regulator and customers', category: 'legal', method: 'wire' });
        const b = ensureInsights(st).mods.breach;
        if (b) b.churn = 1 + (b.churn - 1) * 0.6;
        toast('Notifications sent on time. Customers appreciate honesty; some still leave.', 'good');
      }, { hours: BREACH.hours, label: 'Breach notification' });
      else ctx.act((st) => {
        t.status = 'done';
        if (chance(st, FORGIVE.chance)) {
          const amt = Math.round(t.amount * lerp(FORGIVE.share[0], FORGIVE.share[1], rng(st)));
          post(st, { amount: amt, counterparty: 'Cloud provider', description: 'One-time billing adjustment (goodwill)', category: 'refund_in', method: 'ach' });
          toast(`They forgave ${money(amt)}.`, 'good');
        } else toast('They declined. Set spend caps so it can\'t happen twice.', 'warn');
      }, { hours: 0.5, label: 'Billing support request' });
    });
  },

  onDay(state) {
    const ins = ensureInsights(state);
    analyticsDay(state, ins);
    opsDay(state, ins);
  },

  onMonthEnd(state) {
    const ins = ensureInsights(state);
    const mk = monthKey(state);
    const ai = state.bank.txns.filter((t) => t.category === 'ai_inference' && monthKey(state, t.day) === mk).reduce((a, t) => a - t.amount, 0);
    ins.costs.push({ month: mk, infra: monthlyInfra(state), ai: round2(ai), accounts: activeSubs(state).length + trialingSubs(state).length });
    if (ins.costs.length > 36) ins.costs.shift();
  },
};

