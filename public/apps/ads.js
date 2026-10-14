// Ads Manager: a Meta Ads Manager–style tool with Google Ads, TikTok, Apple Search Ads and LinkedIn tabs,
// a creative library + builder (judged by an AI audience panel), a UGC creator marketplace, and a cohort
// ROAS view that shows what Stripe actually collected versus what the platforms report.
// Simulation: ./growth/adsEngine.js (daily delivery, billing, attribution) on top of ./growth/delivery.js (pure model).

import { html, mount, on, formData, modal, table, stat, badge, lineChart, barChart, toast } from '../core/ui.js';
import { money, pct, fmtDate } from '../core/util.js';
import { notify } from '../core/state.js';
import { mainPlan, monthlyPrice, landingConversion, hasProduct } from '../core/market.js';
import { PLATFORMS, platformsFor, AUDIENCES, PLACEMENTS, OBJECTIVES, FORMATS, AI_UGC, UGC } from './growth/params.js';
import { parseKeywords, minDailyBudgetToExit, qualityFromDraw, hookRate, winnerProbability, reportRate } from './growth/delivery.js';
import { post } from '../core/bank.js';
import { judgeCreative, judgeBrief, policyCheck, icpOverlap } from './growth/judges.js';
import {
  ensureAds, createAccount, createCampaign, createAdSet, createAd, editBudget, addCreative, creativeFor, billAccount,
  deliveryState, audienceProblem, orderUgc, isWhitelisted, adsDay, defaultTargetCpa,
} from './growth/adsEngine.js';
import { rowsInRange, aggregate, derive, reachFor, hintFor, formatOf, EMPTY } from './growth/report.js';
import { bookRevenue, cohortRows, cohortRoas, ensureGrowth, visitors30 } from './growth/acquire.js';

const ui = { level: 'campaigns', campaign: null, adset: null, range: 7, breakdown: 'none', cohortSource: 'ads:' };
const LEARN_LABEL = { learning: ['Learning', 'warn'], limited: ['Learning limited', 'warn'], active: ['Active', 'good'], untracked: ['No conversion tracking', 'bad'] };
const SETUP = {
  meta: { pixel: 'Meta Pixel', capi: 'Conversions API (server-side)' },
  tiktok: { pixel: 'TikTok Pixel', capi: 'Events API (server-side)' },
  google: { pixel: 'Google tag + conversion action', capi: 'Enhanced conversions / offline import' },
  apple: { pixel: 'AdServices attribution (in-app SDK)', capi: 'MMP / server-side receipt validation' },
  linkedin: { pixel: 'LinkedIn Insight Tag', capi: 'LinkedIn Conversions API' },
};
const RANGES = [[1, 'Today'], [7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [3650, 'Lifetime']];
const CTAS = ['Learn more', 'Sign up', 'Start free trial', 'Download', 'Get offer', 'Book demo', 'Subscribe'];

const usd2 = (n) => (n == null ? '—' : money(n, { cents: true }));
const num = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
const byId = (arr, id) => arr.find((x) => x.id === id);

function optionsFor(state, p) {
  const m = state.company.model;
  const plan = mainPlan(state);
  if (m === 'ent') return [['lead', p === 'linkedin' ? 'Lead (LinkedIn Lead Gen Form)' : 'Lead (demo request on your site)']];
  const out = [];
  if (plan.trialDays > 0) out.push(['trial', 'Start trial']);
  else if (m === 'smb') out.push(['trial', 'Lead (demo request on your site)']);
  out.push(['purchase', 'Purchase / subscribe']);
  if (p === 'linkedin') out.push(['lead', 'Lead (LinkedIn Lead Gen Form)']);
  return out;
}
const resultName = (state, s) => (s?.optimization === 'purchase' ? 'Purchases' : state.company.model === 'ent' || s?.optimization === 'lead' || (state.company.model === 'smb' && !(mainPlan(state).trialDays > 0)) ? 'Leads' : 'Trials');

function audiencesFor(p) {
  if (p === 'linkedin') return ['jobtitles', 'retargeting', 'lookalike'];
  if (p === 'tiktok') return ['broad', 'interests', 'retargeting'];
  return ['broad', 'interests', 'lookalike', 'retargeting'];
}

// ---------------------------------------------------------------- render

export default {
  id: 'ads',
  title: 'Ads Manager',
  icon: '📣',
  group: 'Growth',
  badge: (state) => {
    const A = state.apps.ads;
    if (!A) return 0;
    return Object.values(A.accounts ?? {}).filter((a) => a.status === 'payment_failed').length || 0;
  },
  onDay(state) {
    adsDay(state);
    bookRevenue(state);
  },
  jobs: {
    'ads:review': async (ctx, { id }) => {
      const st = ctx.state;
      const c = byId(ensureAds(st).creatives, id);
      if (!c || c.status !== 'in_review') return;
      const bad = policyCheck(`${c.hook} ${c.primaryText} ${c.headline}`);
      if (bad) {
        c.status = 'rejected';
        c.rejectReason = bad;
        notify(st, `Ad review: "${c.name}" was rejected. ${bad}`, { type: 'bad', app: 'ads' });
        return;
      }
      const j = await judgeCreative(ctx, c);
      c.skill = j.skill;
      c.q = qualityFromDraw(c.u, j.skill);
      c.judge = j;
      c.status = 'approved';
      notify(st, `Ad review: "${c.name}" approved.`, { type: 'info', app: 'ads' });
    },
  },
  render(root, ctx) {
    const s = ctx.state;
    ensureAds(s);
    ensureGrowth(s);
    const avail = platformsFor(s.company.model);
    const [tabRaw, pRaw] = (ctx.params || '').split('/');
    const tab = ['campaigns', 'creatives', 'creators', 'cohorts', 'setup'].includes(tabRaw) ? tabRaw : 'campaigns';
    const p = avail.includes(pRaw) ? pRaw : avail[0];
    const go = (t, pp = p) => ctx.navigate('ads', `${t}/${pp}`);
    const tabs = [['campaigns', 'Campaigns'], ['creatives', 'Creatives'], ['creators', 'UGC creators'], ['cohorts', 'Cohorts & truth'], ['setup', 'Accounts & billing']];
    const needsPlatform = tab === 'campaigns' || tab === 'setup';
    mount(root, html`
      <div class="app-head"><div><h1>Ads Manager</h1><p>Paid acquisition the 2026 way: broad audiences, creative does the targeting, ~5% of creatives become winners, and the platform's reported ROAS is not your bank account. Judge channels on Stripe cohorts.</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => html`<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`)}</div>
      ${needsPlatform ? html`<div class="tabs ads-platforms">${avail.map((k) => html`<button data-plat="${k}" class="${k === p ? 'active' : ''}">${PLATFORMS[k].label}${s.apps.ads.accounts[k]?.status === 'payment_failed' ? ' ⚠' : ''}</button>`)}</div>` : ''}
      <div id="adsBody"></div>`);
    on(root, 'click', '[data-tab]', (e, el) => go(el.dataset.tab));
    on(root, 'click', '[data-plat]', (e, el) => { ui.campaign = null; ui.adset = null; ui.level = 'campaigns'; go(tab, el.dataset.plat); });
    const body = root.querySelector('#adsBody');
    if (tab === 'campaigns') renderCampaigns(body, ctx, p, go);
    else if (tab === 'creatives') renderCreatives(body, ctx, go);
    else if (tab === 'creators') renderCreators(body, ctx);
    else if (tab === 'cohorts') renderCohorts(body, ctx);
    else renderSetup(body, ctx, p);
  },
};

// ---------------------------------------------------------------- campaigns

function renderCampaigns(body, ctx, p, go) {
  const s = ctx.state;
  const A = s.apps.ads;
  const P = PLATFORMS[p];
  const acct = A.accounts[p];
  if (!acct || !acct.payment) {
    mount(body, html`<section class="panel"><h2>${P.long}</h2>
      <div class="callout warn">${acct ? 'Add a payment method' : 'Create an ad account'} before you can run ${P.label} ads.</div>
      <button class="primary" data-go-setup>Go to account setup</button>
      ${playbook(s, p)}</section>`);
    on(body, 'click', '[data-go-setup]', () => go('setup'));
    return;
  }
  const from = Math.max(0, s.day - ui.range + 1);
  const rows = rowsInRange(s, { p, from });
  const campaigns = A.campaigns.filter((c) => c.p === p);
  const adsets = A.adsets.filter((x) => x.p === p && (!ui.campaign || x.campaignId === ui.campaign));
  const ads = A.ads.filter((x) => x.p === p && (!ui.campaign || x.campaignId === ui.campaign) && (!ui.adset || x.adsetId === ui.adset));
  const scoped = rows.filter((r) => (!ui.campaign || r.c === ui.campaign) && (!ui.adset || r.s === ui.adset));
  const tot = derive(aggregate(s, scoped, () => 1).get(1) ?? EMPTY(), reachFor(s, scoped));
  const levels = P.levels;
  const target = acct.targetCpa;

  const byKey = (k) => aggregate(s, rows, (r) => r[k]);
  let tableHtml;
  if (ui.level === 'campaigns') {
    const g = byKey('c');
    tableHtml = table({
      columns: [
        { label: 'Off/On', render: (c) => toggle('campaign', c.id, c.status === 'active') },
        { label: levels[0].replace(/s$/, ''), render: (c) => html`<a href="javascript:void 0" data-drill-c="${c.id}">${c.name}</a><div class="small muted">${OBJECTIVES[c.objective]?.label}</div>` },
        { label: 'Delivery', render: (c) => campaignDelivery(s, c) },
        { label: 'Budget', align: 'right', render: (c) => usd2(A.adsets.filter((x) => x.campaignId === c.id && x.status === 'active').reduce((a, x) => a + x.budget, 0)) },
        ...metricCols(s, (c) => derive(g.get(c.id) ?? EMPTY(), reachFor(s, rows.filter((r) => r.c === c.id))), resultName(s, A.adsets.find((x) => x.campaignId === campaigns[0]?.id))),
      ],
      rows: campaigns, empty: 'No campaigns yet. Click Create.',
    });
  } else if (ui.level === 'adsets') {
    const g = byKey('s');
    tableHtml = table({
      columns: [
        { label: 'Off/On', render: (x) => toggle('adset', x.id, x.status === 'active') },
        { label: levels[1].replace(/s$/, ''), render: (x) => html`<a href="javascript:void 0" data-drill-s="${x.id}">${x.name}</a><div class="small muted">${P.kind === 'search' ? `${x.keywords.length} keywords` : AUDIENCES[x.audience.type]?.label} · ${optionsFor(s, p).find((o) => o[0] === x.optimization)?.[1] ?? x.optimization}</div>` },
        { label: 'Delivery', render: (x) => adsetDelivery(s, x) },
        { label: 'Budget', align: 'right', render: (x) => html`${usd2(x.budget)}/day <button class="sm" data-budget="${x.id}">Edit</button>` },
        ...metricCols(s, (x) => derive(g.get(x.id) ?? EMPTY(), reachFor(s, rows.filter((r) => r.s === x.id))), resultName(s, adsets[0])),
        { label: 'Rule of thumb', render: (x) => hintCell(hintFor(s, { kind: 'adset', entity: x, rows: rows.filter((r) => r.s === x.id), targetCpa: target })) },
      ],
      rows: adsets, empty: `No ${levels[1].toLowerCase()} yet.`,
    });
  } else {
    const g = byKey('a');
    tableHtml = table({
      columns: [
        { label: 'Off/On', render: (x) => toggle('ad', x.id, x.status === 'active') },
        { label: levels[2].replace(/s$/, ''), render: (x) => { const cr = creativeFor(s, x); return html`${x.name}<div class="small muted">${cr ? FORMATS[cr.format]?.label : 'App Store product page'}${cr && isWhitelisted(s, cr) ? ' · partnership ad' : ''}</div>`; } },
        { label: 'Delivery', render: (x) => adDelivery(s, x) },
        ...metricCols(s, (x) => derive(g.get(x.id) ?? EMPTY(), reachFor(s, rows.filter((r) => r.a === x.id))), resultName(s, byId(A.adsets, ads[0]?.adsetId))),
        { label: 'Hook rate', align: 'right', render: (x) => { const cr = creativeFor(s, x); const hr = cr && x.lifeImps > 1000 ? hookRate(cr.q ?? 0.3, cr.format) : null; return hr == null ? '—' : pct(hr, 0); } },
        { label: 'Rule of thumb', render: (x) => hintCell(hintFor(s, { kind: 'ad', entity: x, rows: rows.filter((r) => r.a === x.id), targetCpa: target })) },
      ],
      rows: ads, empty: `No ${levels[2].toLowerCase()} yet.`,
    });
  }

  const daily = aggregate(s, scoped, (r) => r.d);
  const days = Array.from({ length: Math.min(ui.range, s.day + 1, 90) }, (_, i) => s.day - Math.min(ui.range, s.day + 1, 90) + 1 + i);
  const filterChips = [
    ui.campaign && html`<span class="badge accent">${levels[0].replace(/s$/, '')}: ${byId(A.campaigns, ui.campaign)?.name} <a href="javascript:void 0" data-clear="campaign">×</a></span>`,
    ui.adset && html`<span class="badge accent">${levels[1].replace(/s$/, '')}: ${byId(A.adsets, ui.adset)?.name} <a href="javascript:void 0" data-clear="adset">×</a></span>`,
  ].filter(Boolean);
  const truthTrials = scoped.reduce((a, r) => a + r.tr, 0);

  mount(body, html`
    ${acct.status === 'payment_failed' ? html`<div class="callout bad">Payment failed: ${usd2(acct.unbilled)} outstanding. Ads are not delivering. <button class="sm" data-paynow>Pay now</button></div>` : ''}
    ${!acct.pixel ? html`<div class="callout bad">No conversion tracking: ${P.label} can't see trials or purchases, so it can't optimize or exit learning. Install the ${SETUP[p].pixel} in Accounts & billing.</div>` : !acct.capi && p !== 'apple' ? html`<div class="callout warn">Pixel only, no ${SETUP[p].capi}: browsers and iOS block a share of events, so reported results run low and learning is slower.</div>` : ''}
    ${!hasProduct(ctx.state) ? html`<div class="callout warn">Nothing is shipped yet: clicks will land on a page with no product to try. Nobody converts.</div>` : !ctx.state.company.website ? html`<div class="callout warn">No website: ad traffic lands on nothing. Set up your landing page in Website.</div>` : ''}
    <div class="stats">
      ${stat('Amount spent', usd2(tot.sp), RANGES.find((r) => r[0] === ui.range)?.[1])}
      ${stat(`Results (${resultName(s, adsets[0])})`, num(tot.res), tot.cpr ? `${usd2(tot.cpr)} per result` : 'reported by platform')}
      ${stat('Reported ROAS', tot.roas == null ? '—' : `${tot.roas.toFixed(2)}x`, acct.trialValue ? `trial value ${usd2(acct.trialValue)}` : 'purchase value in 7-day click window')}
      ${stat('Stripe says', num(truthTrials), `${resultName(s, adsets[0]).toLowerCase()} actually created`, truthTrials > tot.res * 1.15 ? 'warn' : '')}
      ${stat('CTR (link) · CPM', `${pct(tot.ctr, 2)}`, `${usd2(tot.cpm)} CPM · ${usd2(tot.cpc)} CPC`)}
    </div>
    <section class="panel">
      <div class="inline ads-toolbar">
        <button class="primary" data-create>+ Create</button>
        <label>Date range <select id="adsRange">${RANGES.map(([v, l]) => html`<option value="${v}" ${v === ui.range ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label>Breakdown <select id="adsBreak">${[['none', 'None'], ['day', 'By day'], ['week', 'By week'], ['format', 'By creative format']].map(([v, l]) => html`<option value="${v}" ${v === ui.breakdown ? 'selected' : ''}>${l}</option>`)}</select></label>
        ${ui.level === 'adsets' && ui.campaign ? html`<button data-new-adset>+ ${levels[1].replace(/s$/, '')}</button>` : ''}
        ${ui.level === 'ads' && ui.adset && p !== 'apple' ? html`<button data-new-ad>+ ${levels[2].replace(/s$/, '')}</button>` : ''}
      </div>
      <div class="tabs">${['campaigns', 'adsets', 'ads'].map((l, i) => html`<button data-level="${l}" class="${ui.level === l ? 'active' : ''}">${levels[i]}</button>`)}</div>
      ${filterChips.length ? html`<p>${filterChips}</p>` : ''}
      ${tableHtml}
    </section>
    ${ui.breakdown !== 'none' ? html`<section class="panel"><h2>Breakdown ${ui.breakdown === 'format' ? 'by creative format' : `by ${ui.breakdown}`}</h2>${breakdownTable(s, scoped)}</section>` : ''}
    <div class="grid-2">
      <section class="panel"><h2>Amount spent per day</h2><canvas id="spendChart"></canvas></section>
      <section class="panel"><h2>Results per day: reported vs actual</h2><canvas id="resChart"></canvas><p class="small muted"><span style="color:var(--accent)">■</span> reported by ${P.label} · <span style="color:var(--good)">■</span> actually created in Stripe/CRM</p></section>
    </div>
    <section class="panel">${playbook(s, p)}</section>`);

  const lbl = days.length ? [fmtDate(s, days[0]), fmtDate(s, days.at(-1))] : null;
  lineChart(body.querySelector('#spendChart'), [{ values: days.map((d) => daily.get(d)?.sp ?? 0), color: '--accent' }], { labels: lbl });
  lineChart(body.querySelector('#resChart'), [{ values: days.map((d) => daily.get(d)?.res ?? 0), color: '--accent' }, { values: days.map((d) => daily.get(d)?.tr ?? 0), color: '--good' }], { labels: lbl, format: (v) => v.toFixed(0) });

  on(body, 'change', '#adsRange', (e) => { ui.range = +e.target.value; ctx.render(); });
  on(body, 'change', '#adsBreak', (e) => { ui.breakdown = e.target.value; ctx.render(); });
  on(body, 'click', '[data-level]', (e, el) => { ui.level = el.dataset.level; ctx.render(); });
  on(body, 'click', '[data-drill-c]', (e, el) => { ui.campaign = el.dataset.drillC; ui.adset = null; ui.level = 'adsets'; ctx.render(); });
  on(body, 'click', '[data-drill-s]', (e, el) => { ui.adset = el.dataset.drillS; ui.campaign = byId(A.adsets, ui.adset)?.campaignId; ui.level = 'ads'; ctx.render(); });
  on(body, 'click', '[data-clear]', (e, el) => { if (el.dataset.clear === 'campaign') { ui.campaign = null; ui.adset = null; } else ui.adset = null; ctx.render(); });
  on(body, 'click', '[data-paynow]', () => ctx.act((st) => { if (!billAccount(st, p, { reason: 'manual' })) throw new Error('Still declined: there is not enough cash in the bank.'); toast('Paid. Ads resume tomorrow.', 'good'); return true; }, { hours: 0.1, label: 'Ads billing' }));
  on(body, 'click', '[data-toggle]', (e, el) => {
    const [kind, id] = el.dataset.toggle.split(':');
    ctx.act((st) => {
      const list = kind === 'campaign' ? st.apps.ads.campaigns : kind === 'adset' ? st.apps.ads.adsets : st.apps.ads.ads;
      const x = byId(list, id);
      x.status = x.status === 'active' ? 'paused' : 'active';
      return true;
    });
  });
  on(body, 'click', '[data-budget]', (e, el) => budgetModal(ctx, el.dataset.budget));
  on(body, 'click', '[data-create]', () => createModal(ctx, p, null));
  on(body, 'click', '[data-new-adset]', () => createModal(ctx, p, ui.campaign));
  on(body, 'click', '[data-new-ad]', () => addAdModal(ctx, p, ui.adset));
}

function toggle(kind, id, onState) {
  return html`<button class="sm switch ${onState ? 'on' : ''}" data-toggle="${kind}:${id}" aria-pressed="${onState}" title="${onState ? 'Turn off' : 'Turn on'}">${onState ? 'On' : 'Off'}</button>`;
}
function hintCell(h) {
  return h ? html`<span class="small ${h.tone === 'bad' ? 'neg' : h.tone === 'good' ? 'pos' : 'warn'}">${h.text}</span>` : html`<span class="small muted">—</span>`;
}

function metricCols(state, get, resName) {
  const cache = new Map();
  const m = (x) => { if (!cache.has(x.id)) cache.set(x.id, get(x)); return cache.get(x.id); };
  return [
    { label: `Results (${resName})`, align: 'right', render: (x) => num(m(x).res) },
    { label: 'Cost per result', align: 'right', render: (x) => usd2(m(x).cpr) },
    { label: 'Amount spent', align: 'right', render: (x) => usd2(m(x).sp) },
    { label: 'Impressions', align: 'right', render: (x) => num(m(x).im) },
    { label: 'Reach', align: 'right', render: (x) => num(m(x).reach) },
    { label: 'Frequency', align: 'right', render: (x) => (m(x).freq ? m(x).freq.toFixed(2) : '—') },
    { label: 'CPM', align: 'right', render: (x) => usd2(m(x).cpm) },
    { label: 'CTR (link)', align: 'right', render: (x) => pct(m(x).ctr, 2) },
    { label: 'CPC (link)', align: 'right', render: (x) => usd2(m(x).cpc) },
    { label: 'ROAS (reported)', align: 'right', render: (x) => (m(x).roas == null ? '—' : `${m(x).roas.toFixed(2)}x`) },
  ];
}

function campaignDelivery(s, c) {
  if (c.status !== 'active') return badge('Off');
  const sets = s.apps.ads.adsets.filter((x) => x.campaignId === c.id);
  if (!sets.length) return badge('No ad sets', 'warn');
  if (sets.some((x) => x.status === 'active' && !x.delivery)) {
    const st = sets.find((x) => x.status === 'active' && !x.delivery).learn.status;
    return badge(LEARN_LABEL[st][0], LEARN_LABEL[st][1]);
  }
  return badge(sets.find((x) => x.delivery)?.delivery ?? 'Not delivering', 'warn');
}
function adsetDelivery(s, x) {
  const ds = deliveryState(s, x);
  if (!ds.ok) return badge(ds.why, ds.why === 'Off' || ds.why === 'Campaign off' ? '' : 'warn');
  const [l, tone] = LEARN_LABEL[x.learn.status] ?? ['Active', 'good'];
  const P = PLATFORMS[x.p];
  const extra = P.kind === 'search' && x.lastLost ? html`<div class="small muted">${x.lastLost.demand > 0.05 ? `limited by search volume (${pct(x.lastLost.demand, 0)} of budget unused)` : x.lastLost.budget > 0.05 ? `lost IS (budget) ${pct(x.lastLost.budget, 0)}` : ''}</div>` : x.lastFreq7 ? html`<div class="small muted">7-day frequency ${x.lastFreq7.toFixed(2)}</div>` : '';
  return html`${badge(l, tone)}${extra}`;
}
function adDelivery(s, ad) {
  if (ad.status !== 'active') return badge('Off');
  const cr = creativeFor(s, ad);
  if (cr?.status === 'in_review') return badge('In review', 'warn');
  if (cr?.status === 'rejected') return badge('Rejected', 'bad');
  const set = byId(s.apps.ads.adsets, ad.adsetId);
  const ds = deliveryState(s, set);
  return ds.ok ? badge('Active', 'good') : badge(ds.why, 'warn');
}

function breakdownTable(s, rows) {
  const key = ui.breakdown === 'day' ? (r) => r.d : ui.breakdown === 'week' ? (r) => Math.floor(r.d / 7) : (r) => formatOf(s, r.a);
  const g = aggregate(s, rows, key);
  const list = [...g.entries()].sort((a, b) => (typeof a[0] === 'number' ? b[0] - a[0] : b[1].sp - a[1].sp)).map(([k, v]) => ({ k, ...derive(v) }));
  const label = (k) => (ui.breakdown === 'day' ? fmtDate(s, k) : ui.breakdown === 'week' ? `Week of ${fmtDate(s, k * 7)}` : FORMATS[k]?.label ?? (k === 'store' ? 'App Store page' : k));
  return table({
    columns: [
      { label: ui.breakdown === 'format' ? 'Format' : 'Date', render: (x) => label(x.k) },
      { label: 'Spent', align: 'right', render: (x) => usd2(x.sp) },
      { label: 'Impr.', align: 'right', render: (x) => num(x.im) },
      { label: 'CTR (link)', align: 'right', render: (x) => pct(x.ctr, 2) },
      { label: 'Results (reported)', align: 'right', render: (x) => num(x.res) },
      { label: 'Actual', align: 'right', render: (x) => num(x.tr) },
      { label: 'Cost / result', align: 'right', render: (x) => usd2(x.cpr) },
      { label: 'ROAS (reported)', align: 'right', render: (x) => (x.roas == null ? '—' : `${x.roas.toFixed(2)}x`) },
    ],
    rows: list, empty: 'No delivery in this range.',
  });
}

function playbook(s, p) {
  const P = PLATFORMS[p];
  const acct = s.apps.ads.accounts[p];
  const target = acct?.targetCpa ?? defaultTargetCpa(s);
  const exitBudget = minDailyBudgetToExit(target, P.learning);
  return html`<details><summary><b>Playbook: kill / scale rules (2026 practitioner consensus)</b></summary>
    <ul class="small">
      ${P.learning ? html`<li>Exit learning needs ~${P.learning.threshold} optimization events per ${P.learning.window} days. At your target CPA of ${usd2(target)} that is ≈ <b>${usd2(exitBudget)}/day per ${P.levels[1].replace(/s$/, '').toLowerCase()}</b>. Below that, consolidate (1–3 ad sets) or optimize a shallower event, and accept "learning limited".</li>` : html`<li>${P.label} has no Meta-style learning phase, but bid strategies still need conversion data.</li>`}
      <li>Kill an ad after ~2–3× target CPA spent with no result, or CTR under ~0.6% after 2k impressions. Test 3–5 genuinely different hooks/angles per week: at a ~5% hit rate, 4 new ads a week ≈ 1 winner a month.</li>
      <li>Scale winners slowly: budget changes over ~20–30% re-enter learning. Prefer duplicating winners into a scaling campaign and adding new creatives (horizontal scaling).</li>
      <li>Fatigue: on cold audiences watch 7-day frequency ~2.5–3.0 and CTR falling 20–30% from the ad's own baseline. Ads usually die in 2–3 weeks at meaningful spend.</li>
      <li>Attribution: default 7-day click + 1-day view. The 7-day and 28-day view windows were removed on 2026-01-12. Judge on Stripe cohorts and blended CAC, not reported ROAS.</li>
      ${p === 'google' ? html`<li>Search captures existing demand: you can only buy clicks people search for. Exact match = less volume, better CVR; broad = more volume, worse CVR. Smart Bidding wants ≥15–30 conversions / 30 days.</li>` : ''}
      ${p === 'linkedin' ? html`<li>LinkedIn: median CPM ~$63, CPC ~$9, CPL ~$202 (Metadata 2025). Usually uneconomic below ~$5k ACV.</li>` : ''}
      ${p === 'apple' ? html`<li>Apple Search Ads: ~$2.25 per tap, ~10% tap-through, ~66% tap→install (SplitMetrics 2026). High intent, limited scale: usually the first paid channel for a subscription app.</li>` : ''}
    </ul></details>`;
}

// ---------------------------------------------------------------- create flows

function creativePicker(state, p, name = 'creatives') {
  const allowed = PLATFORMS[p].formats;
  const list = state.apps.ads.creatives.filter((c) => allowed.includes(c.format) && c.status !== 'rejected' && !c.archived);
  if (p === 'apple') return html`<p class="muted small">Apple Search Ads uses your App Store product page as the ad. Your landing-page fit drives tap→install.</p>`;
  if (!list.length) return html`<div class="callout warn">No ${allowed.map((f) => FORMATS[f].label.toLowerCase()).join(' / ')} creatives in your library yet. Create some in the Creatives tab (or order UGC).</div>`;
  return html`<fieldset><legend>Ads (one per creative)</legend>${list.map((c) => html`<label><input type="checkbox" name="${name}" value="${c.id}" /> ${c.name} <span class="small muted">· ${FORMATS[c.format].label} · ${c.status === 'in_review' ? 'in review' : 'approved'}</span></label>`)}</fieldset>`;
}
const checked = (form, name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);

function adsetFields(state, p) {
  const P = PLATFORMS[p];
  const acct = state.apps.ads.accounts[p];
  const target = acct?.targetCpa ?? defaultTargetCpa(state);
  const opts = optionsFor(state, p);
  const exit = minDailyBudgetToExit(target, P.learning);
  return html`
    <div class="grid-2">
      <label>${P.levels[1].replace(/s$/, '')} name <input name="setName" value="${P.kind === 'search' ? 'Core keywords' : 'Broad – US'}" /></label>
      <label>Daily budget ($) <input type="number" name="budget" min="1" step="1" value="${state.company.model === 'b2c' ? 50 : 100}" /></label>
      <label>Optimization event <select name="optimization">${opts.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
      <label>Bid strategy <select name="bidStrategy"><option value="lowest_cost">Highest volume (lowest cost)</option><option value="cost_cap">Cost per result goal (cost cap)</option>${P.kind === 'auction' ? html`<option value="bid_cap">Bid cap</option>` : ''}</select></label>
      <label>Cost cap / bid cap ($, optional) <input type="number" name="cap" min="0" step="1" placeholder="${Math.round(target)}" /></label>
      ${P.kind === 'auction' ? html`<label>Audience <select name="audience">${audiencesFor(p).map((a) => html`<option value="${a}">${AUDIENCES[a].label}</option>`)}</select></label>` : ''}
      ${P.kind === 'auction' ? html`<label>Interests / job titles (for detailed targeting) <input name="interests" placeholder="e.g. Productivity, Notion; or: Head of Finance, 50–500 employees" /></label>` : ''}
      ${p === 'meta' ? html`<label>Placements <select name="placement">${Object.entries(PLACEMENTS).map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select></label>` : ''}
    </div>
    ${P.kind === 'search' ? html`<label>Keywords (one per line: plain = broad match, "phrase" = phrase, [exact] = exact) <textarea name="keywords" rows="5" placeholder="${state.company.model === 'b2c' ? '[habit tracker app]\n"budget app for couples"' : '[invoice reconciliation software]\n"shopify bookkeeping"'}"></textarea></label>
      <p class="hint">Search only sells the demand that exists. Keywords that match your ICP and one-liner get more relevant traffic.</p>` : ''}
    <p class="hint">${P.learning ? `To exit learning (~${P.learning.threshold} events / ${P.learning.window} days) at a ${money(target)} CPA you'd need ≈ ${money(exit)}/day.` : ''} New Meta accounts also start with a daily spending limit that rises after paid bills.</p>`;
}

function readAdset(state, p, f) {
  const P = PLATFORMS[p];
  const kws = P.kind === 'search' ? parseKeywords(f.keywords).map((k) => ({ ...k, relevance: Math.min(1, 0.25 + icpOverlap(state, k.text) * 0.9 + (k.text.split(/\s+/).length >= 3 ? 0.1 : 0)) })) : [];
  return {
    name: f.setName, budget: f.budget, optimization: f.optimization,
    bid: { strategy: f.bidStrategy, cap: f.cap || null },
    audience: { type: f.audience ?? (P.kind === 'search' ? 'search' : 'broad'), interests: f.interests ?? '' },
    placement: f.placement ?? 'advantage', keywords: kws,
  };
}

function createModal(ctx, p, campaignId) {
  const s = ctx.state;
  const P = PLATFORMS[p];
  const camp = campaignId ? byId(s.apps.ads.campaigns, campaignId) : null;
  modal({
    title: camp ? `New ${P.levels[1].replace(/s$/, '').toLowerCase()} in "${camp.name}"` : `Create ${P.label} campaign`,
    wide: true,
    body: html`
      ${camp ? '' : html`<h3>${P.levels[0].replace(/s$/, '')}</h3><div class="grid-2">
        <label>Campaign name <input name="name" value="${P.label} – ${s.company.model === 'b2c' ? 'Trials' : 'Leads'} – ${fmtDate(s)}" /></label>
        <label>Objective <select name="objective">${P.objectives.map((o) => html`<option value="${o}">${OBJECTIVES[o].label}</option>`)}</select></label></div>`}
      <h3>${P.levels[1].replace(/s$/, '')}</h3>${adsetFields(s, p)}
      <h3>${P.levels[2]}</h3>${creativePicker(s, p)}`,
    actions: [{ label: 'Cancel' }, {
      label: 'Publish', primary: true, onClick: async (d, form) => {
        const f = formData(form);
        const crs = checked(form, 'creatives');
        if (p !== 'apple' && !crs.length) { toast('Pick at least one creative.', 'warn'); return false; }
        const a = readAdset(s, p, f);
        if (P.kind === 'search' && !a.keywords.length) { toast('Add keywords.', 'warn'); return false; }
        const ok = await ctx.act((st) => {
          const c = camp ?? createCampaign(st, { p, name: f.name, objective: f.objective });
          const set = createAdSet(st, { campaignId: c.id, ...a });
          for (const id of crs) createAd(st, { adsetId: set.id, creativeId: id });
          const prob = audienceProblem(st, set);
          toast(prob ? `Published, but: ${prob}` : 'Published. Delivery starts with tomorrow\'s auction.', prob ? 'warn' : 'good');
          return true;
        }, { hours: camp ? 0.25 : 0.5, label: `${P.label} campaign setup` });
        return ok ? undefined : false;
      },
    }],
  });
}

function addAdModal(ctx, p, adsetId) {
  modal({
    title: 'Add ads', body: html`${creativePicker(ctx.state, p)}<p class="hint">Adding ads to a running ${PLATFORMS[p].levels[1].replace(/s$/, '').toLowerCase()} is a significant edit and restarts learning.</p>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Add', primary: true, onClick: async (d, form) => {
        const crs = checked(form, 'creatives');
        if (!crs.length) return false;
        return (await ctx.act((st) => { for (const id of crs) createAd(st, { adsetId, creativeId: id }); return true; }, { hours: 0.1 * crs.length, label: 'Ads' })) ? undefined : false;
      },
    }],
  });
}

function budgetModal(ctx, adsetId) {
  const set = byId(ctx.state.apps.ads.adsets, adsetId);
  modal({
    title: `Edit budget: ${set.name}`,
    body: html`<label>Daily budget ($) <input type="number" name="budget" min="1" value="${set.budget}" /></label>
      <p class="hint">Changes ≤20% are safe. 20–50% may restart learning; more than ~50% almost always does (and CPA rises for a few days).</p>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Save', primary: true, onClick: async (d, form) => {
        const { budget } = formData(form);
        await ctx.act((st) => {
          const eff = editBudget(st, adsetId, budget);
          toast(eff?.relearn ? `Budget changed ${Math.round(eff.change * 100)}%: back in learning.` : 'Budget updated.', eff?.relearn ? 'warn' : 'good');
          return true;
        }, { hours: 0.05, label: 'Budget edit' });
      },
    }],
  });
}

// ---------------------------------------------------------------- creatives

function renderCreatives(body, ctx, go) {
  const s = ctx.state;
  const A = s.apps.ads;
  const list = A.creatives.filter((c) => !c.archived).slice().reverse();
  const perf = aggregate(s, A.rows, (r) => byId(A.ads, r.a)?.creativeId ?? null);
  mount(body, html`
    <section class="panel">
      <div class="inline"><h2 style="flex:1">Creative library</h2><button class="primary" data-newcr>+ New creative</button></div>
      <p class="muted small">Every creative has a hidden true quality. The AI audience panel's judgment of your hook and message–market fit nudges the odds, but only spend reveals winners: with a neutral concept about 1 in 20 becomes a winner (Motion 2026 hit rate ~5%). Generic, buzzwordy copy lowers the odds; a specific hook for a specific person raises them.</p>
      ${list.length ? html`<div class="grid-3">${list.map((c) => creativeCard(s, c, derive(perf.get(c.id) ?? EMPTY())))}</div>` : html`<p class="empty">No creatives yet. Write one, film yourself, generate an AI UGC video, or hire a creator.</p>`}
    </section>`);
  on(body, 'click', '[data-newcr]', () => creativeModal(ctx));
  on(body, 'click', '[data-archive]', (e, el) => ctx.act((st) => { byId(st.apps.ads.creatives, el.dataset.archive).archived = true; return true; }));
  on(body, 'click', '[data-usecr]', () => go('campaigns'));
}

function creativeCard(s, c, m) {
  const j = c.judge;
  const avg = (f) => { const r = (j?.results ?? []).map((x) => x[f]).filter((v) => typeof v === 'number'); return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null; };
  const pred = c.skill == null ? null : c.skill >= 0.65 ? ['Panel: strong', 'good'] : c.skill >= 0.45 ? ['Panel: average', ''] : ['Panel: weak / generic', 'bad'];
  const top = m.im >= 5000 && m.ctr >= 0.02;
  return html`<div class="card">
    <div class="inline" style="justify-content:space-between"><b>${c.name}</b>${c.status === 'approved' ? badge('Approved', 'good') : c.status === 'rejected' ? badge('Rejected', 'bad') : badge('In review', 'warn')}</div>
    <div class="small muted">${FORMATS[c.format]?.label} · ${c.source === 'creator' ? 'creator UGC' : c.source === 'ai' ? 'AI-generated' : 'made by you'} · ${fmtDate(s, c.createdDay)}${isWhitelisted(s, c) ? ' · whitelisted' : ''}</div>
    <p><b>Hook:</b> ${c.hook}</p>
    ${c.primaryText ? html`<p class="small">${c.primaryText.slice(0, 220)}${c.primaryText.length > 220 ? '…' : ''}</p>` : ''}
    ${c.headline ? html`<p class="small"><b>${c.headline}</b> · [${c.cta}]</p>` : ''}
    ${c.rejectReason ? html`<div class="callout bad small">${c.rejectReason}</div>` : ''}
    ${pred ? html`<p class="small">${badge(pred[0], pred[1])} ${avg('hook') != null ? html`<span class="muted">hook ${avg('hook').toFixed(1)}/10 · fit ${avg('relevance').toFixed(1)}/10 · specific ${avg('specificity').toFixed(1)}/10${j.mock ? ' (offline judge)' : ''}</span>` : j?.note ? html`<span class="muted">${j.note}</span>` : ''}</p>` : ''}
    ${(j?.results ?? []).slice(0, 2).map((r) => html`<p class="small muted">"${r.reaction}"</p>`)}
    ${c.glitch && m.im > 2000 ? html`<p class="small warn">Viewers comment on a lip-sync glitch in the avatar.</p>` : ''}
    <p class="small">${m.im ? html`${usd2(m.sp)} spent · ${num(m.im)} impr. · CTR ${pct(m.ctr, 2)} · ${num(m.tr)} actual ${s.company.model === 'ent' ? 'leads' : 'signups'}` : html`<span class="muted">Not run yet</span>`} ${top ? badge('Top performer', 'good') : ''}</p>
    <div class="inline"><button class="sm" data-usecr="${c.id}">Use in a campaign</button><button class="sm" data-archive="${c.id}">Archive</button></div>
  </div>`;
}

function creativeModal(ctx) {
  const s = ctx.state;
  const formats = ['static', 'carousel', 'founder_video', 'ai_ugc', 'search_text'];
  const price = monthlyPrice(mainPlan(s));
  modal({
    title: 'New creative', wide: true,
    body: html`
      <div class="grid-2">
        <label>Format <select name="format">${formats.map((f) => html`<option value="${f}">${FORMATS[f].label}${FORMATS[f].hours ? ` (~${FORMATS[f].hours}h)` : ''}</option>`)}</select></label>
        <label>AI UGC tool tier (AI UGC only) <select name="tier">${Object.entries(AI_UGC.tiers).map(([k, v]) => html`<option value="${k}">${k} avatar · $${v}/video</option>`)}</select></label>
        <label>Name <input name="name" placeholder="e.g. Hook test – 'Sunday night dread'" /></label>
        <label>Call to action <select name="cta">${CTAS.map((c) => html`<option>${c}</option>`)}</select></label>
      </div>
      <label>Hook: first 3 seconds of the video / first line of the ad <input name="hook" maxlength="140" placeholder="Speak to one person's specific moment, not your feature list" /></label>
      <label>Primary text / script <textarea name="primaryText" rows="4" placeholder="What happens next in the video or the ad body. Concrete outcome, proof, who it's for."></textarea></label>
      <label>Headline <input name="headline" maxlength="60" /></label>
      <p class="hint">Ads are reviewed (policy + an AI audience panel) before they can deliver. Claims about the viewer's personal attributes ("Are you broke?") get rejected.${price > AI_UGC.highPriceMonthly ? ' At your price point, AI avatars convert noticeably worse than real people after the click.' : ''} Winner odds for a neutral concept ≈ ${pct(winnerProbability(0.5), 0)}.</p>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Create & submit for review', primary: true, onClick: async (d, form) => {
        const f = formData(form);
        if (!f.hook.trim()) { toast('Write a hook.', 'warn'); return false; }
        const hours = FORMATS[f.format].hours;
        const ok = await ctx.act((st) => {
          if (f.format === 'ai_ugc') post2(st, AI_UGC.tiers[f.tier], `AI UGC video (${f.tier} avatar)`);
          const c = addCreative(st, { ...f, source: f.format === 'ai_ugc' ? 'ai' : 'self', name: f.name || f.hook.slice(0, 40) });
          ctx.enqueue('ads:review', { id: c.id }, { label: 'Ad review' });
          return true;
        }, { hours, label: 'Ad creative' });
        return ok ? undefined : false;
      },
    }],
  });
}

function post2(state, amount, description) {
  post(state, { amount: -amount, counterparty: 'AI UGC tool', description, category: 'marketing', method: 'card' });
}

// ---------------------------------------------------------------- UGC creators

function renderCreators(body, ctx) {
  const s = ctx.state;
  const A = s.apps.ads;
  mount(body, html`
    <section class="panel">
      <h2>Creator marketplace</h2>
      <p class="muted small">Human UGC runs $150–$300 per video (median ~$175, Influee 2026); premium creators $400+. Delivery takes 1–2 weeks. Whitelisting (running ads from the creator's handle as partnership / Spark ads) costs 20–30% of the fee per 30 days. The brief is your job: specific hooks for a specific viewer get better videos. 2026 practice: test angles cheaply with AI UGC, re-shoot winners with real creators.</p>
      <div class="grid-3">${A.creators.map((c) => html`<div class="card">
        <div class="inline" style="justify-content:space-between"><b>${c.name}</b> ${c.premium ? badge('Premium', 'accent') : ''}</div>
        <div class="small muted">${c.handle} · ${c.niche}</div>
        <p class="small">${c.style}</p>
        <p class="small">★ ${c.rating} · ${c.jobs} jobs · delivers in ~${c.days} days</p>
        <div class="inline" style="justify-content:space-between"><b>${money(c.rate)}/video</b><button class="sm primary" data-hire="${c.id}">Hire</button></div>
      </div>`)}</div>
    </section>
    <section class="panel"><h2>Orders</h2>
      ${table({
        columns: [
          { label: 'Creator', render: (o) => byId(A.creators, o.creatorId)?.name },
          { label: 'Ordered', render: (o) => fmtDate(s, o.orderedDay) },
          { label: 'Due', render: (o) => fmtDate(s, o.promisedDay) },
          { label: 'Videos', align: 'right', render: (o) => o.videos + o.hookVariations },
          { label: 'Brief score', align: 'right', render: (o) => Math.round(o.briefScore * 100) },
          { label: 'Fee', align: 'right', render: (o) => usd2(o.fee) },
          { label: 'Status', render: (o) => (o.status === 'delivered' ? badge('Delivered', 'good') : badge(s.day > o.promisedDay ? 'Late' : 'In production', 'warn')) },
        ],
        rows: A.orders.slice().reverse(), empty: 'No orders yet.',
      })}
    </section>`);
  on(body, 'click', '[data-hire]', (e, el) => hireModal(ctx, el.dataset.hire));
}

function hireModal(ctx, creatorId) {
  const s = ctx.state;
  const c = byId(s.apps.ads.creators, creatorId);
  modal({
    title: `Brief for ${c.name} (${c.handle})`, wide: true,
    body: html`
      <label>Hook ideas (one per line; each hook variation uses the next line) <textarea name="hook" rows="3" placeholder="e.g. 'I used to spend every Sunday night doing X…'"></textarea></label>
      <label>Key message: who it's for, the pain, the outcome, the proof <textarea name="keyMessage" rows="3"></textarea></label>
      <label>Headline under the video <input name="headline" maxlength="60" /></label>
      <label>Shots, length, dos & don'ts, CTA <textarea name="notes" rows="4" placeholder="Length 20–30s. Show the app on screen at 0:05. Don't say 'game-changer'. CTA: start the free trial."></textarea></label>
      <div class="grid-2">
        <label>Videos <input type="number" name="videos" min="1" max="5" value="1" /></label>
        <label>Extra hook variations (+$${UGC.hookVariation} each) <input type="number" name="hookVariations" min="0" max="5" value="2" /></label>
      </div>
      <label><input type="checkbox" name="whitelisting" /> Whitelisting / partnership ads for 30 days (+${Math.round(UGC.whitelistPct * 100)}% of fee, renews monthly while the ad runs)</label>
      <p class="hint">Writing a good brief takes about an hour. An AI creative strategist rates it before you send it.</p>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Pay & send brief', primary: true, onClick: async (d, form) => {
        const f = formData(form);
        if (!f.hook.trim() || !f.keyMessage.trim()) { toast('Write hooks and a key message.', 'warn'); return false; }
        const ok = await ctx.act(async (st) => {
          const brief = { hook: f.hook, keyMessage: f.keyMessage, headline: f.headline, notes: f.notes };
          const j = await judgeBrief(ctx, brief);
          const o = orderUgc(st, { creatorId, brief, briefScore: j.score, videos: Math.max(1, f.videos || 1), hookVariations: Math.max(0, f.hookVariations || 0), whitelisting: f.whitelisting });
          o.briefFeedback = j.results.map((r) => r.feedback).filter(Boolean);
          toast(`Brief score ${Math.round(j.score * 100)}/100${j.mock ? ' (offline judge)' : ''}. ${j.results[0]?.feedback ?? ''}`, j.score > 0.6 ? 'good' : 'warn', 9000);
          return true;
        }, { hours: 1, label: 'UGC brief' });
        return ok ? undefined : false;
      },
    }],
  });
}

// ---------------------------------------------------------------- cohorts & truth

function renderCohorts(body, ctx) {
  const s = ctx.state;
  const A = s.apps.ads;
  const g = ensureGrowth(s);
  const sources = new Set();
  for (const w of Object.values(g.cohorts)) for (const k of Object.keys(w)) sources.add(k);
  const opts = [['ads:', 'All paid ads'], ...platformsFor(s.company.model).map((p) => [`ads:${p}`, `${PLATFORMS[p].label} ads`]), ['all', 'All channels'], ...[...sources].filter((x) => !x.startsWith('ads:')).sort().map((x) => [x, x])];
  const rows = cohortRows(s, ui.cohortSource, 20);
  const r = (e, k) => { const v = cohortRoas(e, k); return v == null ? (e.sp > 0 ? html`<span class="muted">…</span>` : '—') : html`<span class="${v >= 1 ? 'pos' : v < 0.3 && k !== 'r7' ? 'neg' : ''}">${pct(v, 0)}</span>`; };
  const recon = platformsFor(s.company.model).filter((p) => A.accounts[p]).map((p) => {
    const rr = rowsInRange(s, { p, from: 0 });
    const t = derive(aggregate(s, rr, () => 1).get(1) ?? EMPTY());
    let rev = 0;
    for (const w of Object.values(g.cohorts)) rev += w[`ads:${p}`]?.r ?? 0;
    return { p, ...t, rev };
  });
  mount(body, html`
    <section class="panel"><h2>Reported vs actual (lifetime)</h2>
      <p class="muted small">Ads Manager counts conversions inside its attribution window and through its pixel/CAPI signal; iOS and blocked browsers go missing, and 1-day view-through claims people who would have signed up anyway. Stripe is the truth.</p>
      ${table({
        columns: [
          { label: 'Platform', render: (x) => PLATFORMS[x.p].label },
          { label: 'Spend', align: 'right', render: (x) => usd2(x.sp) },
          { label: 'Reported results', align: 'right', render: (x) => num(x.res) },
          { label: 'Actual signups/leads', align: 'right', render: (x) => num(x.tr) },
          { label: 'Actual payers', align: 'right', render: (x) => num(x.pu) },
          { label: 'CAC per payer', align: 'right', render: (x) => usd2(x.pu ? x.sp / x.pu : null) },
          { label: 'Reported ROAS', align: 'right', render: (x) => (x.roas == null ? '—' : `${x.roas.toFixed(2)}x`) },
          { label: 'Stripe revenue to date', align: 'right', render: (x) => usd2(x.rev) },
          { label: 'True ROAS to date', align: 'right', render: (x) => (x.sp ? `${(x.rev / x.sp).toFixed(2)}x` : '—') },
        ],
        rows: recon, empty: 'No ad accounts yet.',
      })}
    </section>
    <section class="panel">
      <div class="inline"><h2 style="flex:1">Cohort ROAS by acquisition week</h2>
        <label>Channel <select id="cohortSrc">${opts.map(([v, l]) => html`<option value="${v}" ${v === ui.cohortSource ? 'selected' : ''}>${l}</option>`)}</select></label></div>
      <p class="muted small">Revenue Stripe actually collected from customers acquired that week (by subscription source), divided by that week's spend. D7/D30/D90 fill in as cohorts age; "…" means not mature yet. Typical subscription-app targets: D7 15–30%, D30 40–70%, D90 70–110% (Segwise 2026, vendor data). Bootstrapped founders usually want payback within 3–6 months.</p>
      ${table({
        columns: [
          { label: 'Week of', render: (e) => fmtDate(s, e.week * 7) },
          { label: 'Spend', align: 'right', render: (e) => usd2(e.sp) },
          { label: s.company.model === 'ent' ? 'Leads' : 'Trials / signups', align: 'right', render: (e) => num(e.tr + e.ld) },
          { label: 'Payers', align: 'right', render: (e) => num(e.py) },
          { label: 'CAC', align: 'right', render: (e) => usd2(e.py && e.sp ? e.sp / e.py : null) },
          { label: 'D7', align: 'right', render: (e) => r(e, 'r7') },
          { label: 'D30', align: 'right', render: (e) => r(e, 'r30') },
          { label: 'D90', align: 'right', render: (e) => r(e, 'r90') },
          { label: 'D180', align: 'right', render: (e) => r(e, 'r180') },
          { label: 'To date', align: 'right', render: (e) => (e.sp ? pct(e.r / e.sp, 0) : money(e.r)) },
        ],
        rows, empty: 'No cohorts yet. Run campaigns for a few weeks.',
      })}
      <h3>Revenue to date by cohort</h3><canvas id="cohortChart"></canvas>
    </section>`);
  const chartRows = rows.slice().reverse();
  barChart(body.querySelector('#cohortChart'), chartRows.map((e) => e.r), { labels: chartRows.map((e, i) => (i % 3 === 0 ? fmtDate(s, e.week * 7).slice(0, 6) : '')) });
  on(body, 'change', '#cohortSrc', (e) => { ui.cohortSource = e.target.value; ctx.render(); });
}

// ---------------------------------------------------------------- setup & billing

function renderSetup(body, ctx, p) {
  const s = ctx.state;
  const P = PLATFORMS[p];
  const acct = s.apps.ads.accounts[p];
  const cards = s.bank.cards ?? [];
  const lp = hasProduct(s) ? landingConversion(s) : 0;
  mount(body, html`
    <div class="grid-2">
      <section class="panel"><h2>${P.long}</h2>
        ${!acct ? html`<p>Create an ad account (business portfolio, USD, your time zone). New accounts start with low billing thresholds${P.newDailyLimit ? ` and a ${money(P.newDailyLimit)}/day spending limit that rises as you pay bills` : ''}.</p>
          <button class="primary" data-create-acct>Create ad account (30 min)</button>` : html`
          <p class="small muted">Ad account ${acct.id} · created ${fmtDate(s, acct.createdDay)}</p>
          <h3>Payment method</h3>
          ${acct.payment ? html`<p>${cards.find((c) => c.id === acct.payment)?.name ?? acct.payment} ${badge(acct.status === 'payment_failed' ? 'Declined' : 'Active', acct.status === 'payment_failed' ? 'bad' : 'good')}</p>` : html`<form id="payForm" class="inline"><label>Card <select name="card">${cards.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></label><button class="primary">Add</button></form>`}
          ${acct.status === 'payment_failed' ? html`<button class="primary" data-paynow>Pay outstanding ${usd2(acct.unbilled)}</button>` : ''}
          <h3>Conversion tracking</h3>
          <label><input type="checkbox" data-track="pixel" ${acct.pixel ? 'checked disabled' : ''} /> ${SETUP[p].pixel} ${acct.pixel ? '' : html`<span class="muted small">(install: ~1h)</span>`}</label>
          ${p !== 'apple' ? html`<label><input type="checkbox" data-track="capi" ${acct.capi ? 'checked disabled' : ''} ${acct.pixel ? '' : 'disabled'} /> ${SETUP[p].capi} ${acct.capi ? '' : html`<span class="muted small">(server-side events with your AI coding agent: ~3h)</span>`}</label>` : ''}
          <p class="small muted">Expected share of real conversions this account will report: ${pct(reportRateFor(s, p), 0)}.</p>
          <form id="acctForm">
            <div class="grid-2">
              <label>Value sent with each trial/lead event ($) <input type="number" name="trialValue" min="0" step="1" value="${acct.trialValue}" /></label>
              <label>Target CPA for rule hints ($) <input type="number" name="targetCpa" min="1" step="1" value="${acct.targetCpa}" /></label>
              <label>Account spending limit ($, lifetime, optional) <input type="number" name="spendCap" min="0" step="50" value="${acct.spendCap ?? ''}" /></label>
            </div>
            <p class="hint">Subscription apps often send a predicted value with StartTrial so ROAS isn't zero when the trial outlasts the 7-day click window. It is an estimate; Stripe cohorts are the truth.</p>
            <button>Save settings</button>
          </form>`}
      </section>
      <section class="panel"><h2>Billing</h2>
        ${acct ? html`<div class="stats">
            ${stat('Unbilled spend', usd2(acct.unbilled), `charged at ${usd2(P.thresholds[acct.thresholdIdx] || 0)} or on the 1st`)}
            ${stat('Lifetime spend', usd2(acct.lifetime))}
            ${stat('Daily spending limit', acct.dailyLimit == null ? 'None' : usd2(acct.dailyLimit), acct.dailyLimit == null ? '' : 'new account; rises with paid bills')}
          </div>
          ${table({ columns: [{ label: 'Date', render: (b) => fmtDate(s, b.day) }, { label: 'Amount', align: 'right', render: (b) => usd2(b.amount) }, { label: 'Reason', render: (b) => b.reason }, { label: 'Status', render: (b) => badge(b.status, b.status === 'paid' ? 'good' : 'bad') }], rows: acct.bills.slice().reverse().slice(0, 20), empty: 'No charges yet.' })}` : html`<p class="muted">No account.</p>`}
        <h3>Funnel inputs today</h3>
        <p class="small">Landing page visitor → ${s.company.model === 'ent' ? 'demo request' : 'signup'}: <b>${pct(lp, 2)}</b> ${s.market?.fit.website.score == null ? html`<span class="muted">(website not judged yet)</span>` : ''} · retargeting pool: ${num(visitors30(s))} visitors (30d) · customers for lookalike seed: ${num(s.stripe?.customers.length ?? 0)}</p>
      </section>
    </div>
    <section class="panel">${playbook(s, p)}</section>`);

  on(body, 'click', '[data-create-acct]', () => ctx.act((st) => { createAccount(st, p); return true; }, { hours: 0.5, label: `${P.label} ad account` }));
  on(body, 'submit', '#payForm', (e) => { e.preventDefault(); const { card } = formData(e.target); ctx.act((st) => { st.apps.ads.accounts[p].payment = card; return true; }, { hours: 0.1, label: 'Ads payment method' }); });
  on(body, 'change', '[data-track]', (e, el) => {
    const k = el.dataset.track;
    ctx.act((st) => { st.apps.ads.accounts[p][k] = true; toast(`${SETUP[p][k]} installed.`, 'good'); return true; }, { hours: k === 'pixel' ? 1 : 3, label: `${P.label} ${k}` });
  });
  on(body, 'submit', '#acctForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    ctx.act((st) => { const a = st.apps.ads.accounts[p]; a.trialValue = Math.max(0, f.trialValue || 0); a.targetCpa = Math.max(1, f.targetCpa || 1); a.spendCap = f.spendCap ? Math.max(0, f.spendCap) : null; toast('Saved.', 'good'); return true; });
  });
  on(body, 'click', '[data-paynow]', () => ctx.act((st) => { if (!billAccount(st, p, { reason: 'manual' })) throw new Error('Still declined: not enough cash in the bank.'); return true; }, { hours: 0.1, label: 'Ads billing' }));
}

const reportRateFor = (s, p) => { const a = s.apps.ads.accounts[p]; return reportRate({ platform: p, model: s.company.model, pixel: a.pixel, capi: a.capi }); };

