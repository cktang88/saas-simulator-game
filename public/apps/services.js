// Services / consulting income alongside the SaaS. Client projects (build, integration, audit, fractional
// role) arrive from your network and inbound; fees post to the bank as services_revenue. They extend runway and
// surface real product insights, but eat founder hours, and past ~50% of your time for 3+ months you are an agency.
//
// All rates and rules are [design] game assumptions (typical US freelance developer/consultant rates of
// roughly $75-250/h; fixed-fee projects of a few k to ~$40k); none is presented as a real statistic.

import { html, mount, on, toast } from '../core/ui.js';
import { post } from '../core/bank.js';
import { ensure, notify } from '../core/state.js';
import { logMistake } from '../core/operator.js';
import { rng, chance, pick, money, fmtDate, isWeekend, clamp, uid, round2 } from '../core/util.js';
import { researchSlice } from './product/store.js';

export const SERVICES = {
  agencyShare: 0.5,       // share of founder hours that makes you an agency [design]
  agencyMonths: 3,        // consecutive months over the share [design]
  depositPct: 0.5,        // fixed-fee projects: share paid up front [design]
  offerEveryDays: 12,     // base days between offers at a 500-person network [design]
  offerTtl: 10,           // days an offer stays open
  overrunWeeklyP: 0.1,    // chance per week that a fixed-fee project's scope creeps +25% hours [design]
  floorRate: 70,          // $/h effective below which a project is underpriced [design]
  stellarRate: 140,       // $/h effective: a priced-well operator [design]
  insightChance: 0.5,     // chance an in-ICP project yields a real product insight [design]
  noDepositPayDays: 30,   // no deposit: the final invoice is paid net-30 after delivery, not on handover [design]
  noDepositBadDebtP: 0.12, // no deposit: chance the client disputes scope and never pays the invoice [design]
};
const CLIENTS = ['Brightline Dental', 'Northwind Logistics', 'Kestrel Realty', 'Maple & Oak Studio', 'Harbor Freight Co-op', 'Pinecrest Clinics', 'Atlas Staffing', 'Lumen Accounting', 'Redwood Foods', 'Summit Property Group', 'Copperfield Retail', 'Tidewater Insurance Agency'];
const KINDS = {
  build: { label: 'Custom build / integration', rate: [90, 160], weeks: [3, 8], hpw: [10, 20], fixed: true },
  audit: { label: 'Audit / strategy sprint', rate: [120, 220], weeks: [1, 3], hpw: [8, 16], fixed: true },
  fractional: { label: 'Fractional CTO / product retainer', rate: [100, 180], weeks: [8, 16], hpw: [6, 12], fixed: false },
  rescue: { label: 'Rescue a broken project', rate: [70, 130], weeks: [2, 6], hpw: [12, 25], fixed: true },
};

export const servicesSlice = (state) => {
  const s = ensure(state, 'services', () => ({ offers: [], projects: [], monthHours: 0, overMonths: 0, revenue: 0, nextOfferDay: 0, agencyLogged: 0 }));
  s.offers ??= []; s.projects ??= []; s.monthHours ??= 0; s.overMonths ??= 0; s.revenue ??= 0; s.nextOfferDay ??= 0; s.agencyLogged ??= 0;
  return s;
};

const networkSize = (state) => { const n = state.founder?.network ?? {}; return (n.friends ?? 0) + (n.linkedin ?? 0) * 0.5 + (n.x ?? 0) * 0.3 + (n.newsletter ?? 0) * 0.5; };

export function makeOffer(state) {
  const kind = pick(state, Object.keys(KINDS));
  const k = KINDS[kind];
  const between = ([a, b]) => a + rng(state) * (b - a);
  const weeks = Math.round(between(k.weeks)), hpw = Math.round(between(k.hpw));
  const rate = Math.round(between(k.rate)); // quoted $/h-equivalent
  const hours = weeks * hpw;
  return { id: uid('svo'), client: pick(state, CLIENTS), kind, label: k.label, fixed: k.fixed, weeks, hoursPerWeek: hpw, fee: Math.round((rate * hours) / 100) * 100, rate, inIcp: chance(state, 0.4), expiresDay: state.day + SERVICES.offerTtl, createdDay: state.day };
}

/** Accept an offer. Optional counter: `negotiate` raises fee 10-20% (judged by luck + how far above floor). */
export function acceptOffer(state, offerId, { deposit = true } = {}) {
  const sl = servicesSlice(state);
  const o = sl.offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, error: 'Offer expired.' };
  sl.offers = sl.offers.filter((x) => x !== o);
  const p = { ...o, id: uid('svp'), status: 'active', startDay: state.day, endDay: state.day + o.weeks * 7, hoursDone: 0, paid: 0, deposit, scopeCreep: 0, totalHours: o.weeks * o.hoursPerWeek };
  sl.projects.push(p);
  // Fixed fee: 50% deposit up front (no deposit = chasing payment later); retainers bill monthly in onDay.
  if (o.fixed && deposit) pay(state, p, round2(o.fee * SERVICES.depositPct), 'deposit');
  return { ok: true, project: p };
}

function pay(state, p, amount, what) {
  post(state, { amount, counterparty: p.client, description: `${p.label} (${what})`, category: 'services_revenue' });
  p.paid = round2(p.paid + amount);
  servicesSlice(state).revenue = round2(servicesSlice(state).revenue + amount);
}

/** Walk away mid-project: clients keep the deposit-to-date reconciliation; you refund the unearned part. */
export function dropProject(state, id) {
  const p = servicesSlice(state).projects.find((x) => x.id === id && x.status === 'active');
  if (!p) return { ok: false };
  p.status = 'dropped';
  const earned = round2(p.fee * clamp(p.hoursDone / p.totalHours, 0, 1));
  const refund = Math.max(0, round2(p.paid - earned));
  if (refund) post(state, { amount: -refund, counterparty: p.client, description: `${p.label}: refund of unearned fees`, category: 'services_revenue' });
  logMistake(state, { functionId: 'founder_time', id: 'dropped_client', label: 'Walked away from a client project', cost: { reputation: 2, usd: refund, hours: 2 }, detail: `${p.client}: dropped at ${Math.round((100 * p.hoursDone) / p.totalHours)}%.`, app: 'services', key: `drop:${p.id}`, charge: true });
  return { ok: true, refund };
}

function finish(state, p) {
  p.status = 'done'; p.doneDay = state.day;
  const due = round2(p.fee - p.paid);
  // No deposit means chasing the whole fee after delivery: it arrives net-30, and some clients never pay it.
  if (due > 0.5 && p.fixed && !p.deposit) { p.receivable = due; p.payDay = state.day + SERVICES.noDepositPayDays; }
  else if (due > 0.5) pay(state, p, due, p.fixed ? 'final invoice' : 'final retainer invoice');
  p.realRate = Math.round((p.paid + (p.receivable ?? 0)) / Math.max(1, p.hoursDone));
  if (p.realRate < SERVICES.floorRate) {
    logMistake(state, { functionId: 'founder_time', id: 'underpriced_services', label: 'Underpriced a client project', cost: { usd: Math.round((SERVICES.floorRate - p.realRate) * p.hoursDone) }, detail: `${p.client}: ${money(p.paid)} for ${p.hoursDone.toFixed(0)} h = ${money(p.realRate)}/h. Scope creep and no change orders.`, app: 'services', key: `under:${p.id}` });
  }
  if (p.inIcp && chance(state, SERVICES.insightChance)) {
    researchSlice(state).insights.unshift({ id: uid('ins'), interviewId: null, theme: 'Client work', text: `${p.client} (${p.label.toLowerCase()}): the workflow they paid you to fix points at a gap your product could own.`, type: 'pain', real: true, verified: true, who: `${p.client} (services client)`, day: state.day });
    p.insight = true;
  }
}

/** Operator tier for the services line from what the player did (separates in the test). */
export function servicesTier(state) {
  const sl = servicesSlice(state);
  const done = sl.projects.filter((p) => p.status === 'done');
  if (!done.length) return { tier: 'unknown', score: null };
  const rate = done.reduce((a, p) => a + p.realRate, 0) / done.length;
  const dep = done.filter((p) => p.deposit || !p.fixed).length / done.length;
  const agency = sl.agencyLogged > 0 ? 0 : 1;
  const score = clamp(0.5 * clamp((rate - SERVICES.floorRate) / (SERVICES.stellarRate - SERVICES.floorRate), 0, 1) + 0.25 * dep + 0.25 * agency, 0, 1);
  return { tier: score >= 0.8 ? 'stellar' : score >= 0.6 ? 'good' : score >= 0.35 ? 'average' : 'mediocre', score, rate };
}

export const servicesHoursThisMonth = (state) => servicesSlice(state).monthHours;

export default {
  id: 'services',
  title: 'Services',
  icon: '🧰',
  group: 'Money',

  badge: (state) => servicesSlice(state).offers.length || null,

  render(root, ctx) {
    const s = ctx.state, sl = servicesSlice(s);
    const active = sl.projects.filter((p) => p.status === 'active');
    const capacity = (s.founder.hoursPerWeek ?? 55) * 4.35;
    const share = sl.monthHours / capacity;
    const t = servicesTier(s);
    mount(root, html`
      <div class="app-head"><div><h1>Services</h1><p>Client work for cash while the SaaS grows. It extends runway and teaches you what customers pay to solve, but every hour here is an hour not spent on the product.</p></div></div>
      <div class="stats"><div class="stat"><div class="stat-label">Services revenue</div><div class="stat-value">${money(sl.revenue)}</div></div>
        <div class="stat"><div class="stat-label">Share of your time (this month)</div><div class="stat-value">${Math.round(share * 100)}%</div><div class="stat-sub">${sl.overMonths ? `${sl.overMonths} month(s) over ${Math.round(SERVICES.agencyShare * 100)}%` : `agency line: ${Math.round(SERVICES.agencyShare * 100)}%`}</div></div>
        <div class="stat"><div class="stat-label">Services operator</div><div class="stat-value">${t.tier}</div><div class="stat-sub">${t.rate ? `${money(t.rate)}/h realised` : 'no finished project'}</div></div></div>
      ${share > SERVICES.agencyShare ? html`<div class="callout bad">Over half your time is client work. Three months of this and you are an agency with a side product.</div>` : ''}
      <div class="grid-2">
        <section class="panel"><h2>Offers</h2>
          ${sl.offers.length ? sl.offers.map((o) => html`<div class="card"><b>${o.client}</b> · ${o.label}<div class="small muted">${money(o.fee)} ${o.fixed ? 'fixed fee' : 'retainer total'} · ${o.weeks} wk × ${o.hoursPerWeek} h/wk = ${o.weeks * o.hoursPerWeek} h (~${money(o.rate)}/h) · expires ${fmtDate(s, o.expiresDay)}</div>
            <button class="sm primary" data-take="${o.id}">Take it (50% deposit)</button> ${o.fixed ? html`<button class="sm" data-take-nodep="${o.id}">Take it, no deposit</button>` : ''} <button class="sm" data-pass="${o.id}">Pass</button></div>`) : html`<p class="empty">No offers right now. They come from your network and inbound; a bigger audience brings more.</p>`}
          <p class="small muted">Stellar: price at ${money(SERVICES.stellarRate)}+/h, take deposits, keep scope fixed, say no to rescue jobs outside your ICP and stay under ${Math.round(SERVICES.agencyShare * 100)}% of your time.</p>
        </section>
        <section class="panel"><h2>Active projects</h2>
          ${active.length ? active.map((p) => html`<div class="card"><b>${p.client}</b> · ${p.label}<div class="small muted">${p.hoursPerWeek} h/wk until ${fmtDate(s, p.endDay)} · paid ${money(p.paid)} of ${money(p.fee)} · ${p.hoursDone.toFixed(0)}/${Math.round(p.totalHours)} h</div><button class="sm" data-drop="${p.id}">Walk away</button></div>`) : html`<p class="empty">No active projects.</p>`}
          <h3>Finished</h3><ul class="list small">${sl.projects.filter((p) => p.status === 'done').slice(-8).reverse().map((p) => html`<li>${p.client}: ${money(p.paid)} at ${money(p.realRate)}/h${p.insight ? ' · produced a product insight' : ''}</li>`)}</ul>
        </section>
      </div>`);
    on(root, 'click', '[data-take]', (e, el) => ctx.act((st) => { const r = acceptOffer(st, el.dataset.take); toast(r.ok ? 'Project started. Hours are charged weekly.' : r.error, r.ok ? 'good' : 'warn'); }, { hours: 0.5, label: 'Scope and contract a client project' }));
    on(root, 'click', '[data-take-nodep]', (e, el) => ctx.act((st) => { const r = acceptOffer(st, el.dataset.takeNodep, { deposit: false }); toast(r.ok ? 'Started with no deposit. You will invoice at the end.' : r.error, r.ok ? 'info' : 'warn'); }, { hours: 0.25, label: 'Handshake client project' }));
    on(root, 'click', '[data-pass]', (e, el) => ctx.act((st) => { const sv = servicesSlice(st); sv.offers = sv.offers.filter((o) => o.id !== el.dataset.pass); }));
    on(root, 'click', '[data-drop]', (e, el) => ctx.act((st) => { const r = dropProject(st, el.dataset.drop); toast(r.ok ? 'You walked away. The client is not happy.' : 'Not active.', 'warn'); }));
  },

  onDay(state) {
    const sl = servicesSlice(state);
    sl.offers = sl.offers.filter((o) => o.expiresDay > state.day);
    // Offers: more network, more inbound. Rate ~ every 12 days at a 500-person network.
    const rate = clamp(networkSize(state) / 500, 0.2, 3) / SERVICES.offerEveryDays;
    if (state.day >= sl.nextOfferDay && sl.offers.length < 4 && chance(state, rate)) {
      sl.offers.push(makeOffer(state));
      notify(state, 'A client wants to hire you for services work (Services app).', { type: 'info', app: 'services' });
    }
    // Work: weekdays, hoursPerWeek/5 per active project (overtime counts toward burnout).
    if (!isWeekend(state)) {
      for (const p of sl.projects) {
        if (p.status !== 'active') continue;
        if (state.day >= p.endDay) { finish(state, p); continue; }
        const h = p.hoursPerWeek / 5;
        state.founder.hoursUsed += h;
        (state.founder.timeLog ??= []).push({ day: state.day, hours: h, label: `Client work: ${p.client}`, app: 'services' });
        p.hoursDone += h; sl.monthHours += h;
        // Fixed fee scope creep: more hours, same fee (a stellar operator writes change orders; here it costs).
        if (p.fixed && state.day % 7 === 0 && chance(state, SERVICES.overrunWeeklyP)) { p.hoursPerWeek = Math.round(p.hoursPerWeek * 1.25); p.totalHours *= 1.25; p.scopeCreep++; }
      }
    }
    // Retainers bill monthly in arrears (every 28 days from start).
    for (const p of sl.projects) if (p.status === 'active' && !p.fixed && (state.day - p.startDay) % 28 === 27) pay(state, p, round2((p.fee / p.weeks) * 4), 'monthly retainer');
    // Invoices for work delivered without a deposit: paid net-30, or written off when the client walks.
    for (const p of sl.projects) {
      if (!(p.receivable > 0) || state.day < p.payDay) continue;
      const due = p.receivable;
      p.receivable = 0;
      if (chance(state, SERVICES.noDepositBadDebtP)) {
        p.writtenOff = due;
        p.realRate = Math.round(p.paid / Math.max(1, p.hoursDone));
        notify(state, `${p.client} disputed the scope and never paid the ${money(due)} invoice.`, { type: 'bad', app: 'services' });
        logMistake(state, { functionId: 'founder_time', id: 'services_no_deposit_unpaid', label: 'Client never paid: work delivered without a deposit', cost: { usd: due, hours: 3 }, delayed: true, charge: true, detail: `${p.client}: ${money(due)} for delivered work, written off after chasing it. A 50% deposit up front would have kept half of it, and a client who pays a deposit has agreed to the scope.`, app: 'services', key: `unpaid:${p.id}` });
      } else pay(state, p, due, 'invoice (net-30)');
    }
  },

  onMonthEnd(state) {
    const sl = servicesSlice(state);
    const share = sl.monthHours / ((state.founder.hoursPerWeek ?? 55) * 4.35);
    sl.overMonths = share > SERVICES.agencyShare ? sl.overMonths + 1 : 0;
    if (sl.overMonths >= SERVICES.agencyMonths) {
      logMistake(state, { functionId: 'founder_time', id: 'becoming_agency', label: 'Becoming an agency', cost: { days: 30, reputation: 1 }, circles: true, detail: `Client work took ${Math.round(share * 100)}% of your time for ${sl.overMonths} months. The product stalled while the SaaS was the point.`, app: 'services', key: `agency:${state.day}` });
      sl.agencyLogged++;
    }
    sl.monthHours = 0;
  },
};
