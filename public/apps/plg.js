// Growth loops (product-led growth): usage limits and upgrade prompts, PQLs to the CRM, viral loops, template and
// programmatic SEO pages, free tools, in-product referral prompts, expansion, launch mode (open / waitlist / invite-only)
// and the PLG metrics. Each lever is a feature built through Product, then configured here. Engine: plg/model.js.
// Research: docs/research/plg-email/p1-plg-levers.md.

import { html, mount, on, formData, toast, table, stat } from '../core/ui.js';
import { pct, money, fmtDate, round2 } from '../core/util.js';
import { registerOperatorReader } from '../core/operator.js';
import { productSlice } from './product/store.js';
import { hasProduct } from '../core/market.js';
import {
  ensurePlg, LEVERS, LEVER_ORDER, getLever, queueBuild, configureLever, retireLever, plgDay, plgMonthEnd, plgMetrics, plgK, prunePages,
  validatePql, plgOperatorRead, meterOptions, setupHoursFor, lintUpgradeCopy, leverFactor, ruleStats, viralCycleDays,
} from './plg/model.js';
import { PRODUCT_TYPES, PQL_SIGNALS, productType, METERS } from './plg/params.js';
import { setLaunchMode, launchModeHours, releaseBatch, issueCodes, debriefCohort, ensureAccess, accessSummary, ACCESS } from './plg/access.js';
import { bizBlock } from './context.js';
import { upgradeRubric, UPGRADE_SCHEMA, upgradeFallback, upgradeScore } from './plg/rubric.js';
import { UPGRADE_CRITERIA } from './plg/rubric.js';

export { plgEvents, PLG_ACTIONS } from './plg/model.js';
registerOperatorReader('plg', plgOperatorRead);

const TABS = [['overview', 'Overview'], ['convert', 'Convert'], ['viral', 'Viral loops'], ['content', 'Content'], ['access', 'Launch mode'], ['metrics', 'Metrics']];
const GROUPS = { convert: ['instrument', 'limits', 'pql', 'expansion'], viral: ['invites', 'sharing', 'referral_prompt'], content: ['templates', 'pseo', 'free_tool'] };

export async function judgeUpgrade(ctx, text) {
  if (!String(text).trim()) return null;
  const res = await ctx.llm.ask({
    task: 'plg_upgrade_prompt_judge', rubric: UPGRADE_CRITERIA, context: bizBlock(ctx.state, 'customer'),
    system: `You are a skeptical SaaS growth reviewer judging an in-app upgrade prompt shown when a user hits a plan limit. Judge only the words on the page.\n${upgradeRubric()}`,
    prompt: `Upgrade prompt:\n${text}\n\nScore every criterion 1-5, quote evidence for low scores, give an overall 0-1 score and say in one line how it landed with you as the user.`,
    schema: UPGRADE_SCHEMA,
    fallback: () => upgradeFallback(text, lintUpgradeCopy(text, ctx.state)),
  });
  return res.mock ? null : upgradeScore(res.data);
}

function fieldHtml(s, def, f, cfg) {
  const v = cfg[f.key] ?? f.default;
  const name = `f_${f.key}`;
  if (f.type === 'checkbox') return html`<label class="inline"><input type="checkbox" name="${name}" ${v ? 'checked' : ''} /> ${f.label}</label>`;
  if (f.type === 'number') return html`<label>${f.label} <input type="number" name="${name}" min="${f.min}" max="${f.max}" value="${v ?? ''}" /></label>${f.help ? html`<div class="hint">${f.help}</div>` : ''}`;
  if (f.type === 'textarea') return html`<label>${f.label}<textarea name="${name}" rows="3">${v ?? ''}</textarea></label>`;
  if (f.type === 'select') {
    const opts = f.options === 'meters' ? meterOptions(s).map(([k, l, val]) => [k, `${l}${val ? '' : ' (cost proxy)'}`]) : f.options;
    return html`<label>${f.label} <select name="${name}">${opts.map(([k, l]) => html`<option value="${k}" ${String(v) === String(k) ? 'selected' : ''}>${l}</option>`)}</select></label>`;
  }
  if (f.type === 'multi') return html`<div><b class="small">${f.label}</b>${f.options.map(([k, l]) => html`<label class="inline"><input type="checkbox" name="m_${f.key}_${k}" ${(cfg[f.key] ?? []).includes(k) ? 'checked' : ''} /> ${l}</label>`)}</div>`;
  if (f.type === 'signals') {
    const cur = cfg.signals ?? [];
    return html`<div><b class="small">${f.label}</b>${PQL_SIGNALS.map((g) => html`<label class="inline"><input type="checkbox" name="sig_${g.id}" ${cur.includes(g.id) ? 'checked' : ''} /> ${g.label}${g.needs && !getLever(s, g.needs)?.status ? html` <span class="muted small">(needs usage limits)</span>` : ''}</label>`)}</div>`;
  }
  return '';
}

function readCfg(form, def) {
  const f = formData(form);
  const cfg = {};
  for (const fld of def.fields) {
    if (fld.type === 'multi') cfg[fld.key] = fld.options.filter(([k]) => f[`m_${fld.key}_${k}`]).map(([k]) => k);
    else if (fld.type === 'signals') cfg.signals = PQL_SIGNALS.filter((g) => f[`sig_${g.id}`]).map((g) => g.id);
    else if (fld.type === 'checkbox') cfg[fld.key] = Boolean(f[`f_${fld.key}`]);
    else if (fld.type === 'number') cfg[fld.key] = Number(f[`f_${fld.key}`]);
    else cfg[fld.key] = ['count', 'pages', 'minSignals'].includes(fld.key) ? Number(f[`f_${fld.key}`]) : f[`f_${fld.key}`];
  }
  return cfg;
}

function leverCard(s, id) {
  const def = LEVERS[id];
  const l = getLever(s, id);
  const feat = l ? productSlice(s).features.find((x) => x.id === l.featureId) : null;
  const okModel = def.models.includes(s.company.model);
  const needs = def.needs.filter((n) => getLever(s, n)?.status !== 'live');
  const status = !l ? (okModel ? 'not built' : `not for ${s.company.model.toUpperCase()}`) : l.status === 'building' ? `building ${Math.round(((feat?.progressHours ?? 0) / Math.max(1, feat?.effortHours ?? 1)) * 100)}%` : l.status === 'built' ? 'built, not launched' : 'live';
  const tone = !l ? '' : l.status === 'live' ? 'good' : l.status === 'built' ? 'warn' : 'accent';
  return html`<section class="panel"><h2>${def.label} <span class="badge ${tone}">${status}</span></h2>
    <p class="small">${def.blurb}</p>
    <p class="small muted">Engineering ${def.effort} h through the Product build queue · setup ${def.setup} h · weekly review ${def.weekly} h. ${def.source}</p>
    ${!l ? (okModel ? html`<button class="primary sm" data-build="${id}" ${needs.length ? 'disabled' : ''}>Queue the build in Product</button>${needs.length ? html` <span class="small muted">needs ${needs.map((n) => LEVERS[n].label).join(', ')} live first</span>` : ''}` : '') : ''}
    ${l && l.status === 'building' ? html`<p class="small">In the Product build queue. Spend build hours in Product to ship it.</p>` : ''}
    ${l && (l.status === 'built' || l.status === 'live') && def.fields.length ? html`<form data-lever="${id}">
      ${def.fields.map((f) => fieldHtml(s, def, f, l.cfg ?? {}))}
      <div class="inline"><button class="primary sm">${l.status === 'live' ? `Save changes (${setupHoursFor(s, id)} h)` : `Configure and launch (${def.setup} h)`}</button>${l.status === 'live' ? html`<button type="button" class="sm" data-retire="${id}">Switch off</button>` : ''}</div></form>` : ''}
    ${l && l.status === 'built' && !def.fields.length ? html`<button class="primary sm" data-launch="${id}">Launch (${def.setup} h)</button>` : ''}
    ${l?.status === 'live' ? html`<p class="small"><b>Setup quality ${pct(l.q, 0)}</b>${(l.missed ?? 0) ? html` · <span class="neg">${l.missed} weekly review(s) missed: effect ${pct(leverFactor(s, id), 0)}</span>` : ''}</p>
      ${(l.good ?? []).map((g) => html`<div class="small pos">+ ${g}</div>`)}${(l.issues ?? []).map((g) => html`<div class="small neg">- ${g}</div>`)}` : ''}
    ${l?.status === 'live' && id === 'pql' ? pqlExtra(s) : ''}${l?.status === 'live' && (id === 'pseo' || id === 'templates') ? pageExtra(s, id) : ''}
  </section>`;
}

function pqlExtra(s) {
  const P = ensurePlg(s);
  const open = P.pqls.filter((p) => p.status === 'open').length, won = P.pqls.filter((p) => p.status === 'won').length, lost = P.pqls.filter((p) => p.status === 'lost').length;
  const rs = ruleStats(getLever(s, 'pql').cfg.signals ?? [], Number(getLever(s, 'pql').cfg.minSignals) || 1, { limitsLive: getLever(s, 'limits')?.status === 'live' });
  const v = P.validations.at(-1);
  return html`<p class="small">Handed to the CRM inbound queue: ${P.pqls.length} (${open} open, ${won} won, ${lost} lost). Rule matches about ${pct(rs.rate, 0)} of accounts.</p>
    <p class="small"><button class="sm" data-validate="1">Check the rule against closed deals (1 h)</button> ${v ? html`Last check ${fmtDate(s, v.day)}: ${v.won} won of ${v.closed} closed${v.lowSample ? ' (too few to trust)' : ''}.` : ''}</p>`;
}
function pageExtra(s, id) {
  const P = ensurePlg(s);
  const pages = P.pages.filter((p) => p.kind === id && !p.pruned);
  const thin = pages.filter((p) => p.unique < 0.4).length;
  return html`<p class="small">${pages.length} live pages, ${pages.filter((p) => p.top10).length} ranking on page one, ${thin} thin.${P.seo.until != null && s.day < P.seo.until ? html` <span class="neg">Google demotion until ${fmtDate(s, P.seo.until)}.</span>` : ''}</p>
    ${id === 'pseo' && pages.length > 1 ? html`<button class="sm" data-prune="${id}">Prune the weakest half (1.5 h)</button>` : ''}`;
}

function overview(s) {
  const type = PRODUCT_TYPES[productType(s)];
  const k = plgK(s);
  const m = plgMetrics(s);
  return html`<div class="stats">
      ${stat('Product type', type.label, type.why)}
      <div class="stat"><div class="stat-label">Viral K (modelled)</div><div class="stat-value">${k.capped.toFixed(2)}</div><div class="stat-sub">cycle ~${k.cycleDays} days · typical SaaS 0.15-0.25, strong 0.5+ [vendor]</div></div>
      <div class="stat"><div class="stat-label">Signups from loops</div><div class="stat-value">${m.viral + m.content + m.tool}</div><div class="stat-sub">${m.viral} viral · ${m.content} content · ${m.tool} tools</div></div>
      <div class="stat"><div class="stat-label">Extra expansion MRR</div><div class="stat-value">${money(m.expansionMrr)}</div><div class="stat-sub">on top of the Pricing app</div></div>
    </div>
    ${m.seoPenalty ? html`<p class="callout bad">A Google core update demoted your thin programmatic pages until ${fmtDate(s, m.seoPenalty.until)}. Programmatic traffic is down about 90% and the rest of the site about 40%.</p>` : ''}
    <section class="panel"><h2>How this works</h2>
      <p class="small">Growth loops amplify a product that already activates people; they do not replace one. Each lever is a feature in your Product build queue (engineering hours, bugs on ship), then you configure it here (setup hours, weekly review hours). What you choose decides the effect: a prompt on every login, a blocked export, a swapped-keyword page set or an auto-invite from imported contacts all have a traceable cost. Doing everything right raises the odds; it does not guarantee a result.</p>
      <p class="small muted">The spread inside one lever is wider than the spread between levers. Most numbers here are vendor roundups used as ranges (see docs/research/plg-email/p1-plg-levers.md).</p></section>
    ${table({ columns: [{ label: 'Lever', render: (r) => r.label }, { label: 'Status', render: (r) => r.status }, { label: 'Quality', align: 'right', render: (r) => r.q }], rows: LEVER_ORDER.map((id) => { const l = getLever(s, id); return { label: LEVERS[id].label, status: l ? l.status : '-', q: l?.status === 'live' ? pct(l.q, 0) : '-' }; }) })}`;
}

function metricsView(s) {
  return plgMetricsPanel(s);
}
export function plgMetricsPanel(s) {
  const m = plgMetrics(s);
  const dash = (v, f) => (v == null ? html`<span class="muted">-</span>` : f(v));
  return html`<section class="panel"><h2>PLG metrics</h2>
    ${m.instrumented ? '' : html`<p class="callout warn small">No instrumentation yet. Build the PLG instrumentation lever (Growth loops → Convert) to see activation, free-to-paid, PQL rate and K. Until then you are steering by total signups: ${m.signups30} in 30 days.</p>`}
    <div class="stats">
      <div class="stat"><div class="stat-label">Activation (30d)</div><div class="stat-value">${dash(m.activation, (v) => pct(v, 0))}</div><div class="stat-sub">average 37.5% across 62 companies [vendor]</div></div>
      <div class="stat"><div class="stat-label">Trial to paid</div><div class="stat-value">${dash(m.freeToPaid, (v) => pct(v, 0))}</div><div class="stat-sub">${m.freeToPaidN} trials · no-card 4-6% good, card-required 25-35% [vendor]</div></div>
      <div class="stat"><div class="stat-label">PQL rate</div><div class="stat-value">${dash(m.pqlRate, (v) => pct(v, 0))}</div><div class="stat-sub">${m.pql.handed} handed to CRM · ${m.pql.won} won</div></div>
      <div class="stat"><div class="stat-label">PQL close rate</div><div class="stat-value">${dash(m.pqlCloseRate, (v) => pct(v, 0))}</div><div class="stat-sub">weak rule 5-8%, good 15-25% [design]</div></div>
      <div class="stat"><div class="stat-label">PLG share of new signups</div><div class="stat-value">${dash(m.plgShare, (v) => pct(v, 0))}</div><div class="stat-sub">natural-rate-of-growth proxy [unverified benchmark]</div></div>
      <div class="stat"><div class="stat-label">K (measured / model)</div><div class="stat-value">${dash(m.kMeasured, (v) => v.toFixed(2))} / ${m.kModel.capped.toFixed(2)}</div><div class="stat-sub">${m.instrumented ? 'invite funnel instrumented' : 'not measurable'}</div></div>
      <div class="stat"><div class="stat-label">Limit-prompt lift</div><div class="stat-value">${dash(m.limitsLiftMeasured, (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`)}</div><div class="stat-sub">${m.limitsLiftMeasured == null ? 'needs a 10% holdout' : 'vs the holdout'}</div></div>
      <div class="stat"><div class="stat-label">Email spam rate (30d)</div><div class="stat-value">${dash(m.spamRate, (v) => `${(v * 100).toFixed(2)}%`)}</div><div class="stat-sub">Gmail: keep under 0.10%, never 0.30%</div></div>
    </div>
    <p class="small muted">Open rates are unreliable (Apple Mail Privacy Protection loads pixels). Read clicks and activation.</p></section>`;
}

function accessView(s) {
  const A = ensureAccess(s);
  const sum = accessSummary(s);
  return html`<section class="panel"><h2>Launch mode</h2>
    <p class="small">Who gets in, and when. Open signup gives the most reach and the most unqualified users, onboarding load and the worst activation. Staged access (waitlist or invite codes) gives less reach and slower growth, but better fit, focused onboarding, a cohort to learn from and, in some B2C cases, word of mouth from scarcity. A waitlist you never release goes cold; a release far above onboarding capacity floods support. A company that dropped its waitlist, found open access overwhelming and brought the waitlist back is the pattern this models.</p>
    <form id="modeForm">
      <label>Mode <select name="mode">${[['open', 'Open signup'], ['waitlist', 'Waitlist (you release batches)'], ['invite', 'Invite-only (customers get codes)']].map(([k, l]) => html`<option value="${k}" ${A.mode === k ? 'selected' : ''}>${l}</option>`)}</select></label>
      <label class="inline"><input type="checkbox" name="qualify" ${A.qualify ? 'checked' : ''} /> Review and qualify signups before each release (${ACCESS.review * 60} min each)</label>
      <label>Default batch size <input type="number" name="batch" min="1" value="${A.batch}" /></label>
      <label>Release every (days) <input type="number" name="everyDays" min="1" value="${A.everyDays}" /></label>
      <button class="primary sm">${A.configured ? 'Save (0.25-2 h)' : 'Set launch mode (2 h)'}</button></form>
    ${A.configured ? html`<div class="stats">
      <div class="stat"><div class="stat-label">Waiting</div><div class="stat-value">${sum.waiting}</div><div class="stat-sub">${sum.daysSinceRelease == null ? 'never released' : `last release ${sum.daysSinceRelease} days ago`}</div></div>
      <div class="stat"><div class="stat-label">Onboarding capacity</div><div class="stat-value">${sum.capacity}</div><div class="stat-sub">per cohort at your onboarding level</div></div>
      <div class="stat"><div class="stat-label">Cohorts released</div><div class="stat-value">${sum.cohorts}</div><div class="stat-sub">${round2(sum.learned)} debrief lessons banked</div></div>
      <div class="stat"><div class="stat-label">Lost to the wait</div><div class="stat-value">${Math.round(sum.stats.lost)}</div><div class="stat-sub">${sum.stats.held} signups held in total</div></div></div>
      ${A.mode === 'waitlist' ? html`<form id="relForm" class="inline"><label>Release <input type="number" name="n" min="1" value="${A.batch}" /> people</label><button class="primary sm">Release a cohort</button></form>` : ''}
      ${A.mode === 'invite' ? html`<form id="codeForm" class="inline"><label>Issue <input type="number" name="n" min="1" value="10" /> codes to customers</label><button class="primary sm">Issue</button></form><p class="small muted">${A.codes.issued} issued, ${A.codes.redeemed} redeemed. About 60% are redeemed within four days.</p>` : ''}
      ${table({ columns: [{ label: 'Cohort', render: (c) => html`${c.id} · ${fmtDate(s, c.day)}` }, { label: 'Size', align: 'right', render: (c) => c.size }, { label: 'Fit', align: 'right', render: (c) => pct(c.quality, 0) }, { label: 'Notes', render: (c) => html`${c.qualified ? 'qualified' : 'first-come'}${c.overload ? html` · <span class="neg">over capacity</span>` : ''}` }, { label: '', render: (c) => (c.debriefed ? 'debriefed' : s.day - c.day >= 14 ? html`<button class="sm" data-debrief="${c.id}">Debrief (${ACCESS.debriefHours} h)</button>` : 'wait 2 weeks') }], rows: A.cohorts.slice(-8).reverse(), empty: 'No cohorts released yet.' })}` : ''}
    </section>`;
}

export default {
  id: 'plg',
  title: 'Growth loops',
  icon: '🔁',
  group: 'Growth',
  badge: (state) => { const l = state.apps?.plg?.levers; return l && Object.values(l).some((x) => x.status === 'built') ? '!' : null; },

  render(root, ctx) {
    const s = ctx.state;
    const tab = TABS.some(([k]) => k === ctx.params) ? ctx.params : 'overview';
    const body = tab === 'overview' ? overview(s) : tab === 'metrics' ? metricsView(s) : tab === 'access' ? accessView(s) : html`${GROUPS[tab].map((id) => leverCard(s, id))}`;
    mount(root, html`
      <div class="app-head"><div><h1>Growth loops</h1><p>Usage limits, PQLs, invites, shared outputs, templates, SEO pages, free tools and referral prompts. Build each as a feature, configure it, review it weekly.${hasProduct(s) ? '' : ' Ship a product first: loops amplify a product, they do not replace one.'}</p></div></div>
      <div class="tabs">${TABS.map(([k, l]) => html`<a href="#/plg/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`)}</div>
      ${body}`);

    on(root, 'click', '[data-build]', (e, el) => ctx.act((st) => { const r = queueBuild(st, el.dataset.build); if (!r.ok) throw new Error(r.error); toast('Queued in Product. Spend build hours there to ship it.', 'good'); }, { label: 'Queue growth lever' }));
    on(root, 'click', '[data-retire]', (e, el) => ctx.act((st) => { retireLever(st, el.dataset.retire); }, { label: 'Switch off lever' }));
    on(root, 'click', '[data-launch]', (e, el) => ctx.act((st) => { const r = configureLever(st, el.dataset.launch, {}); if (!r.ok) throw new Error(r.error); }, { hours: LEVERS[el.dataset.launch].setup, label: 'Launch growth lever' }));
    on(root, 'click', '[data-prune]', (e, el) => ctx.act((st) => { const r = prunePages(st, { kind: el.dataset.prune }); if (!r.ok) throw new Error(r.error); toast(`Removed ${r.removed} pages.`, 'good'); }, { hours: 1.5, label: 'Prune pages' }));
    on(root, 'click', '[data-validate]', () => ctx.act((st) => { validatePql(st); }, { hours: 1, label: 'Validate the PQL rule' }));
    on(root, 'submit', 'form[data-lever]', (e) => {
      e.preventDefault();
      const id = e.target.dataset.lever;
      const cfg = readCfg(e.target, LEVERS[id]);
      const hoursFor = () => { const l = getLever(ctx.state, id); const base = setupHoursFor(ctx.state, id); return base + (id === 'free_tool' && cfg.mathReviewed ? 3 : 0) + (id === 'templates' ? (cfg.curated ? 0.8 : 0.15) * (cfg.count || 10) : 0) + (id === 'pseo' && cfg.review ? Math.max(1, (cfg.pages || 50) / 100) : 0); };
      ctx.act(async (st) => {
        if (id === 'limits') cfg.copyScore = await judgeUpgrade(ctx, cfg.copy);
        const r = configureLever(st, id, cfg);
        if (!r.ok) throw new Error(r.error);
        toast(`Saved. Setup quality ${Math.round(r.quality * 100)}%.`, r.quality >= 0.6 ? 'good' : 'warn');
      }, { hours: hoursFor(), label: `Configure ${LEVERS[id].label}` });
    });
    // Price the action without mutating state, then do it once inside ctx.act (a release outside act admitted the cohort twice).
    on(root, 'submit', '#modeForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { const r = setLaunchMode(st, f.mode, { qualify: f.qualify, batch: f.batch, everyDays: f.everyDays }); if (!r.ok) throw new Error(r.error); }, { hours: launchModeHours(ctx.state, f.mode), label: 'Launch mode' }); });
    on(root, 'submit', '#relForm', (e) => { e.preventDefault(); const f = formData(e.target); const r = releaseBatch(ctx.state, { n: f.n, dryRun: true }); if (!r.ok) return toast(r.error, 'warn'); ctx.act((st) => { const out = releaseBatch(st, { n: f.n }); if (!out.ok) throw new Error(out.error); toast(`Released ${out.released} people.`, 'good'); }, { hours: r.hoursCost, label: 'Release a waitlist cohort' }); });
    on(root, 'submit', '#codeForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { const r = issueCodes(st, f.n); if (!r.ok) throw new Error(r.error); }, { hours: 0.1 + 0.02 * f.n, label: 'Issue invite codes' }); });
    on(root, 'click', '[data-debrief]', (e, el) => ctx.act((st) => { const r = debriefCohort(st, el.dataset.debrief); if (!r.ok) throw new Error(r.error); toast('Debriefed. What you learned lifts conversion a little.', 'good'); }, { hours: ACCESS.debriefHours, label: 'Cohort debrief' }));
  },

  onDay(state) { if (state.apps?.plg) plgDay(state); },
  onMonthEnd(state) { if (state.apps?.plg) plgMonthEnd(state); },
};
